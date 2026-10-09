// Урок 3.2 «Vision-language модели»: мини-VLM обучается в браузере и даёт обещанные в текстах исходы, миссии проходятся
// через интерфейс, консоль чиста, телефон без горизонтальной прокрутки, схема движется. Снимки — shots/l32-*.png.
// Числа лабораторий одинаковы везде: тест сам обучает обе модели в Node и (если есть jsc, macOS) в JavaScriptCore,
// как в Safari, и сравнивает хэши весов и точности с Chrome до последнего бита.
// Урок собирается на дату выпуска части: MR_ASOF=2026-10-17 python3 lessons/build.py l32.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-2-vision-language-modeli.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
/* ---------- эталон вне браузера: те же стадии, что Store.train и Store.trainScratch ---------- */
// Хэш всех весов модели (биты Float64), как hashNums в сверке /tmp/jscmp.
const FP = `function __fp(E, m) { const f = new Float64Array(1), u = new Uint32Array(f.buffer); let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const p of [].concat(E.encParams(m), E.lmParams(m), E.projParams(m), [m.Ec])) for (let i = 0; i < p.w.length; i++) { f[0] = p.w[i]; h1 = Math.imul(h1 ^ u[0], 16777619) >>> 0; h2 = Math.imul(h2 ^ u[1], 16777619) >>> 0; h1 = Math.imul(h1 ^ u[1], 2246822519) >>> 0; }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16); }`;
const refSrc = (C) => `${FP}
(function () {
  const E = globalThis.L32, C = ${JSON.stringify(C)}, say = typeof print === 'function' ? print : console.log;
  const m = E.vlmInit(C.SEED), data = E.makeData(C.N, 100);
  E.finish(E.pretrainEncoder(m, { iters: C.encIters, lr: C.encLr })); E.finish(E.pretrainLM(m, { iters: C.lmIters }));
  E.finish(E.trainVLM(m, data, { stage: 'proj', epochs: C.projEp, lr: C.projLr })); E.finish(E.trainVLM(m, data, { stage: 'lm', epochs: C.lmEp, lr: C.lmLr }));
  const s = E.vlmInit(C.SEED); E.finish(E.pretrainLM(s, { iters: C.lmIters }));
  E.finish(E.trainVLM(s, data.map((d) => ({ c: d.c, s: d.s, img: d.img, patches: d.patches, tok: null })), { stage: 'all', epochs: C.lmEp, lr: C.lmLr }));
  say('REF ' + JSON.stringify({ m: __fp(E, m), s: __fp(E, s), acc: E.evaluate(m, 777, 4).acc, accB: E.evaluate(s, 777, 4).acc }));
})();`;
const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
/** Запустить эталон в Node и в jsc; вернуть { node, jsc } (jsc — null, если его нет). */
function startRef(C) {
  const dir = path.join(os.tmpdir(), 'lesson32-ref'); fs.mkdirSync(dir, { recursive: true });
  const eng = (f) => path.resolve(__dirname, '../lessons/' + f), drv = path.join(dir, 'ref.js'), nodeDrv = path.join(dir, 'ref-node.js');
  fs.writeFileSync(drv, refSrc(C));
  fs.writeFileSync(nodeDrv, `globalThis.L32 = require(${JSON.stringify(eng('l32/engine.js'))});\n` + refSrc(C));
  const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err, out) => { const m = /REF (.*)/.exec(out || ''); res(m ? JSON.parse(m[1]) : { error: String(err || out) }); }));
  return { node: run(process.execPath, [nodeDrv]), jsc: fs.existsSync(JSC) ? run(JSC, [eng('l21/engine.js'), eng('l32/engine.js'), drv]) : Promise.resolve(null) };
}
const shotSec = async (p, id, file, sel, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel || `#${id} .lab`, pad == null ? 6 : pad); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^7 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.1: три вопроса');
  check((await p.eval(`!!document.querySelector('a[href="3-3-rt-2.html"]')`)), 'ссылка на урок 3.3 в callout «Дальше»');
  await p.eval('window.__l32.SPEED.k = 20; true');
  const C = J(await p.eval(`JSON.stringify(Object.assign({ SEED: window.__l32.Store.SEED, N: window.__l32.Store.data.length }, window.__l32.Store.CFG))`));
  const ref = startRef(C);

  // ---------- 1. патчи → токены ----------
  console.log('патчи → токены');
  await p.eval(`window.__l32.LabPatches.api.setPerm(1); true`); await sleep(100);
  const p1 = J(await p.eval(`JSON.stringify(window.__l32.LabPatches.api.state())`));
  check(p1.perm === 1 && p1.pos === 1 && p1.cos < 0.999 && await critOk(p, '#pMis'), `миссия 1: патчи перемешаны с позициями — сходство ${p1.cos.toFixed(3)} < 1, засчитана`);
  await shotSec(p, 'patches', 'l32-patches.png');
  await nextMission(p, '#pMis');
  let r = await viaUI(p, '#pMis', 1);
  const p2 = J(await p.eval(`JSON.stringify(window.__l32.LabPatches.api.state())`));
  check(r.ok && p2.pos === 0 && p2.perm === 1 && p2.cos > 0.9999, `миссия 2: без позиций выход совпал — сходство ${p2.cos.toFixed(4)}`);
  check(/Ставка сыграла/.test(r.out) && /0,614/.test(r.out), 'ставка «мешок патчей» сыграла, разбор называет 0,614');
  await p.eval(`window.__l32.LabPatches.api.setPos(1); window.__l32.LabPatches.api.setPerm(0); true`);

  // ---------- 2. мини-VLM ----------
  console.log('мини-VLM: обучение');
  const t0 = Date.now();
  r = await viaUI(p, '#vMis', 1);
  const tTrain = (Date.now() - t0) / 1000;
  const v1 = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.api.state())`));
  check(r.ok && v1.trained && v1.acc >= 0.9, `миссия 1: обучена за ${tTrain.toFixed(0)} с, новые картинки знакомых сочетаний — ${(v1.acc * 100).toFixed(1)}%`);
  const res = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.st.res)`));
  check(res.held < 0.5 && res.heldColor >= 0.5 && res.encHeld >= 0.5, `фиолетовый кубик: точно ${res.held * 8} из 8, цвет верно ${res.heldColor * 8} из 8, энкодер нашёл ${res.encHeld * 8} из 8, чаще всего «${res.heldTop}»`);
  check(/Ставка сыграла/.test(r.out) && r.out.includes(res.heldTop) && r.out.includes((res.acc * 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + '%'), 'ставка «цвет верно, форму — из привычных» сыграла; разбор называет тот же ответ и ту же точность');
  check(v1.said.join(' ') === 'purple ball', 'на сцене фиолетовый кубик описан как «фиолетовый мяч»: ' + v1.said.join(' '));
  await p.eval(`window.__l32.LabVLM.api.setObj('red', 'cube'); true`);
  const v1b = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.api.state())`));
  check(v1b.okNow, 'красный кубик описан верно: ' + v1b.said.join(' '));
  await shotSec(p, 'vlm', 'l32-vlm.png');
  console.log('мини-VLM: энкодер с нуля');
  await nextMission(p, '#vMis');
  r = await viaUI(p, '#vMis', 1);
  const v2 = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.api.state())`));
  check(r.ok && v2.scratch && v2.acc - v2.accB >= 0.05, `миссия 2: предобученный ${(v2.acc * 100).toFixed(1)}%, с нуля ${(v2.accB * 100).toFixed(1)}%`);
  check(/Ставка сыграла/.test(r.out), 'ставка «предобученный точнее» сыграла');
  const resB = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.st.resB)`));
  check(resB.held === 0, 'энкодер с нуля фиолетовый кубик не описывает: ' + resB.held * 8 + ' из 8');
  // числа урока при зерне 9 — те, что названы в INTEGRATION.md
  const n92 = (a) => Math.round(a * 92), n8 = (a) => Math.round(a * 8);
  check(n92(v2.acc) === 88 && n92(v2.accB) === 80 && /96%/.test(r.out) && /87%/.test(r.out), `точности 88 и 80 из 92 (95,7% и 87,0%), разбор называет 96% и 87%: ${n92(v2.acc)} и ${n92(v2.accB)}`);
  check(n8(res.held) === 0 && n8(res.heldColor) === 8 && n8(res.encHeld) === 7 && res.heldTop === 'фиолетовый мяч' && res.heldTopN === 8, `основная модель, фиолетовый кубик: точно ${n8(res.held)}, цвет ${n8(res.heldColor)}, энкодер ${n8(res.encHeld)}, «${res.heldTop}» ${res.heldTopN} из 8 (ждём 0, 8, 7, «фиолетовый мяч» 8)`);
  check(n8(resB.heldColor) === 8 && n8(resB.encHeld) === 1 && resB.heldTop === 'фиолетовый мяч' && resB.heldTopN === 7, `модель с нуля, фиолетовый кубик: цвет ${n8(resB.heldColor)}, энкодер ${n8(resB.encHeld)}, «${resB.heldTop}» ${resB.heldTopN} из 8 (ждём 8, 1, «фиолетовый мяч» 7)`);
  const grid = J(await p.eval(`JSON.stringify(window.__l32.LabVLM.st.tests.map((t) => [t.a.words.join(' '), t.b.words.join(' ')]))`));
  const gridBad = (k) => grid.map((g, i) => [g[k], i]).filter(([w, i]) => w !== ['red', 'blue', 'green', 'yellow', 'purple', 'orange'][i % 6] + ' ' + ['cube', 'ball', 'bowl', 'can'][Math.floor(i / 6)]).map(([w]) => w).join(', ');
  check(gridBad(0) === 'purple ball' && gridBad(1) === 'red ball, yellow ball, purple ball, blue cube', `сетка проверки: ошибки основной модели — ${gridBad(0)}; модели с нуля — ${gridBad(1)}`);
  // Chrome против Node и JavaScriptCore (Safari): веса обеих моделей до последнего бита
  const fpC = J(await p.eval(`(() => { ${FP}; const S = window.__l32.Store; return JSON.stringify({ m: __fp(L32, S.m), s: __fp(L32, S.scratch), acc: window.__l32.LabVLM.st.res.acc, accB: window.__l32.LabVLM.st.resB.acc }); })()`));
  const [fpN, fpJ] = await Promise.all([ref.node, ref.jsc]);
  const same = (a) => !!a && a.m === fpC.m && a.s === fpC.s && a.acc === fpC.acc && a.accB === fpC.accB;
  check(same(fpN), `Chrome = Node: веса ${fpC.m} / ${fpC.s}, точности ${(fpC.acc * 100).toFixed(1)}% / ${(fpC.accB * 100).toFixed(1)}%` + (same(fpN) ? '' : ` — Node: ${JSON.stringify(fpN)}`));
  if (fpJ) check(same(fpJ), 'Chrome = JavaScriptCore (как в Safari): те же хэши весов и точности' + (same(fpJ) ? '' : ` — jsc: ${JSON.stringify(fpJ)}`));
  else console.log('  · jsc не найден, сверка с JavaScriptCore пропущена');
  await shotSec(p, 'vlm', 'l32-vlm-compare.png');
  await nextMission(p, '#vMis');
  await p.eval(`window.__l32.LabVLM.api.setObj('red', 'cube'); window.__l32.LabVLM.api.setDx(0); true`);
  const shifts = J(await p.eval(`JSON.stringify([0, 1, 2, 3, 4, 5].map((dx) => { window.__l32.LabVLM.api.setDx(dx); return window.__l32.LabVLM.api.state().okNow; }))`));
  check(shifts.map((x) => (x ? '✓' : '✗')).join(' ') === '✓ ✓ ✓ ✗ ✓ ✗', 'свободный режим: при сдвиге 0 верно, при сдвиге 5 px ошибка — ' + shifts.map((x) => (x ? '✓' : '✗')).join(' ') + ' (ждём ✓ ✓ ✓ ✗ ✓ ✗)');
  await p.eval(`window.__l32.LabVLM.api.setDx(0); true`);

  // ---------- 3. пространство слов ----------
  console.log('пространство слов');
  r = await viaUI(p, '#sMis', 0);
  const s1 = J(await p.eval(`JSON.stringify(window.__l32.LabSpace.api.state())`));
  check(r.ok && s1.stage === 1 && s1.what === 'read0' && s1.near >= 0.5 && s1.near0 < s1.near, `миссия 1: ближайшее слово — цвет у ${Math.round(s1.near * 24)} из 24 после этапа 1 (до — ${Math.round(s1.near0 * 24)})`);
  check(/Ставка сыграла/.test(r.out), 'ставка «к словам своих цветов» сыграла');
  await shotSec(p, 'space', 'l32-space.png');
  await nextMission(p, '#sMis');
  await p.eval(`window.__l32.LabSpace.api.setStage(2); window.__l32.LabSpace.api.setWhat('read1'); true`); await sleep(100);
  const s2 = J(await p.eval(`JSON.stringify(window.__l32.LabSpace.api.state())`));
  check(s2.near >= 0.75 && await critOk(p, '#sMis'), `миссия 2: перед вторым словом ближайшее слово — форма у ${Math.round(s2.near * 24)} из 24`);
  await nextMission(p, '#sMis');
  await p.eval(`window.__l32.LabSpace.api.setWhat('tok'); true`); await sleep(100);
  const s3 = J(await p.eval(`JSON.stringify(window.__l32.LabSpace.api.state())`));
  check(s3.near < 0.5 && await critOk(p, '#sMis'), `миссия 3: средний токен картинки рядом со своим словом лишь у ${Math.round(s3.near * 24)} из 24`);
  check([s1.near0, s1.near, s2.near, s3.near].map((v) => Math.round(v * 24)).join(' ') === '4 16 23 2', 'пространство слов: 4 → 16 из 24 перед цветом, 23 перед формой, 2 у токенов (как в INTEGRATION.md)');
  await shotSec(p, 'space', 'l32-space-tokens.png');

  // ---------- схема, квиз, глоссарий, консоль ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="vlm"]'); Anim.seek(cv, 1.0); const a = cv.toDataURL(); Anim.seek(cv, 9.5); const b = cv.toDataURL(); return JSON.stringify({ diff: a !== b, kinds: Anim.kinds() }); })()`));
  check(anim.diff && anim.kinds.includes('vlm'), 'схема пути картинки движется: кадры 1,0 с и 9,5 с различаются');
  await shotSec(p, 'flow', 'l32-flow.png', '#flow .flow-card');
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные (' + await p.eval(`document.querySelectorAll('.gl').length`) + ' шт.)');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await shotSec(p, 'vlm', 'l32-vlm-dark.png');
  await shotSec(p, 'space', 'l32-space-dark.png');
  await shotSec(p, 'patches', 'l32-patches-dark.png');

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l32.SPEED.k = 20; true');
  await m.eval(`window.__l32.LabVLM.api.train().then(() => window.__l32.LabSpace.api.ensure()).then(() => true)`, true);
  check((await m.eval(`(() => { ${FP}; return __fp(L32, window.__l32.Store.m); })()`)) === fpC.m, 'телефон: обученная модель та же до последнего бита');
  await m.eval(`window.__l32.LabPatches.api.setPerm(1); true`);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  check(await m.eval(`[...document.querySelectorAll('.lab')].every((l) => l.getBoundingClientRect().width <= l.parentElement.getBoundingClientRect().width + 1)`), 'телефон: ни одна лаборатория не шире своей карточки');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, n, sel] of [['patches', 'l32-m-patches.png'], ['vlm', 'l32-m-vlm.png'], ['space', 'l32-m-space.png'], ['flow', 'l32-m-flow.png', '#flow .flow-card']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel || '#' + id + ' .lab', 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
