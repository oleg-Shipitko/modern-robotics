// Проверка урока 1.3: сначала цифры движка в Node (со своей математикой из ui-l13.js), потом все
// интерактивы в браузере — опыт «Ада учится у учителя» и прогноз «больше данных», рисование объездов
// мышью, калибровка, бины и авторегрессия, лаборатория «Три Ады» (четыре миссии и свободный режим),
// лаборатория пачек (длина пачки на сцене), стыки пачек, анимированные схемы, квиз; тёмная тема
// и телефон 390 px. Снимки — в shots/l13-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
// своя математика: тот же блок, что на странице, чтобы числа Node совпадали с браузером
const UI = fs.readFileSync(path.resolve(__dirname, '../lessons/l13/ui-l13.js'), 'utf8');
const OWN = UI.slice(UI.indexOf('/*OWNMATH-BEGIN*/'), UI.indexOf('/*OWNMATH-END*/'));
vm.runInThisContext(OWN); OwnMath.install();
const K = require('../lessons/shared/kettle-core.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-3-multimodalnost-deystviy.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f1 = (v, d) => (+v).toFixed(d == null ? 1 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры движка в Node ---------- */
const NODE = {};
function nodeNumbers() {
  console.log('Node: цифры движка (своя математика установлена)');
  check(Math.exp === OwnMath.exp && Math.tanh === OwnMath.tanh && Math.log === OwnMath.log, 'Math.exp, Math.log и Math.tanh подменены своими');
  const k = K.KETTLE, D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
  let gap = 1e9; for (const d of D.demos) for (let t = 0; t <= K.T; t++) gap = Math.min(gap, Math.hypot(d.xs[t] - k.x, K.START.y - K.V * t - k.y) - K.RA - K.RK);
  check(D.nLeft === 20 && D.nRight === 20 && gap > 15, `демонстрации: 20 слева, 20 справа, ближе всего к чайнику ${f1(gap)} см`);
  const reg = K.finish(K.trainReg13(D.demos)), gmm = K.finish(K.trainGMM13(D.demos, 2)), dif = K.diff13(D.demos);
  const br = K.batch13(reg, k, 10, 1), bg = K.batch13(gmm, k, 10, 1, { mode: 'chunk', H: 32 }), bd = K.batch13(dif, k, 10, 1);
  check(br.touches === 10 && bg.touches === 0 && bd.touches === 0 && bg.left > 0 && bg.right > 0 && bd.left > 0 && bd.right > 0, `три Ады М1: регрессия ${br.touches}/10 касаний, смесь ${bg.touches} (слева ${bg.left}, справа ${bg.right}), диффузия ${bd.touches} (${bd.left}/${bd.right})`);
  const sh = {}; for (const p of [0.7, 0.75, 0.8, 0.85]) { const DD = K.makeDemos({ n: 40, pLeft: p, seed: 1 }); sh[p] = K.batch13(K.finish(K.trainReg13(DD.demos)), k, 10, 1).touches; }
  check(sh[0.7] > 0 && sh[0.75] > 0 && sh[0.8] === 0 && sh[0.85] === 0, `три Ады М2: касания регрессии при 70/75/80/85% слева — ${sh[0.7]}, ${sh[0.75]}, ${sh[0.8]}, ${sh[0.85]}`);
  const kd = { x: 275, y: 130 }, Dd = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle: kd }), rd = K.batch13(K.finish(K.trainReg13(Dd.demos)), kd, 10, 1);
  check(!Dd.open.left && Dd.open.right && K.onRoute(kd) && rd.touches === 0 && K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle: { x: 300, y: 130 } }).blocked, `три Ады М3: чайник у края проёма (275; 130) — слева закрыто, все ${Dd.nRight} справа, регрессия ${rd.touches}/10; посередине проёма проезда нет`);
  let ok2 = 0; for (let b = 0; b < 30; b++) { const B = K.batch13(gmm, k, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 2)) ok2++; }
  check(ok2 === 30, `три Ады М4: в ${ok2} пачках прогонов из 30 есть касание с двумя сменами стороны`);
  // пачки: короткая пачка — касание со сменой компоненты на стыке; порог длины
  const seamSw = (q, H) => { let n = 0; for (let t = H; t < q.comps.length; t += H) if (q.comps[t] !== q.comps[t - 1]) n++; return n; };
  let ok4 = 0; for (let b = 0; b < 30; b++) { const B = K.batch13(gmm, k, 10, 1 + 10 * b, { mode: 'chunk', H: 4 }); if (B.runs.some((q) => q.touch && seamSw(q, 4) >= 1)) ok4++; }
  check(ok4 === 30, `пачки М1: при пачке 4 в ${ok4} сериях из 30 есть касание со сменой компоненты на стыке`);
  const h16 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 16 }).touches, h18 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 18 }).touches, h14 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 14 }).touches;
  check(h16 > 20 && h14 > 20 && h18 === 0, `пачки М2: касаний смеси на 100 прогонов — пачка 14: ${h14}, 16: ${h16}, 18: ${h18}`);
  // «опыт»: те же зёрна, что в браузере
  const NS = [10, 40, 200, 1000]; NODE.md = [];
  for (const N of NS) { let crash = 0, miss = 0; for (let j = 0; j < 20; j++) { const DD = K.moreDataDemos(N, j); const rg = K.finish(K.trainReg13(DD.demos, { iters: K.MD.iters, seed: 3 + j })); const q = K.moreDataRun(rg, j); if (q.touch) crash++; miss += q.miss; } NODE.md.push({ crash, miss: miss / 20 }); }
  check(NODE.md[0].crash < 20 && NODE.md.slice(1).every((r) => r.crash === 20) && NODE.md[3].miss < NODE.md[0].miss, `опыт: касаний ${NODE.md.map((r) => r.crash).join(', ')} из 20; промах ${NODE.md.map((r) => f1(r.miss)).join(', ')} см`);
  const Hb = K.binsHist(K.binsData(4)), ind = [], ar = []; for (let s = 1; s <= 5; s++) { ind.push(K.binsSample(Hb, 'ind', 100, 1000 + s).bad); ar.push(K.binsSample(Hb, 'ar', 100, 1000 + s).bad); }
  check(ind.every((v) => v > 35 && v < 65) && ar.every((v) => v === 0), `бины: виляющих независимые ${ind.join(', ')}, по очереди ${ar.join(', ')}`);
  const sn = K.seamsBatch('naive', 20, 1), st = K.seamsBatch('te', 20, 21), sb = K.seamsBatch('bid', 20, 41);
  check(sn.touches >= 15 && st.touches >= 12 && sb.touches === 0 && sb.maxSw === 0 && sb.passes === 2 && st.passes === 0.25, `стыки: касаний последняя пачка ${sn.touches}, сглаживание ${st.touches}, согласование ${sb.touches} из 20; проходов на шаг ${st.passes} и ${sb.passes}`);
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l13.mis.${key}.ctx.done[window.__l13.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(120); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) { await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`); await sleep(150); await p.waitFor(`!window.__l13.mis.${key}.busy`, 180000); await sleep(80); }
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(40); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150); }
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(8); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(80);
}
/** Нарисовать объезд мышью: side −1/+1, amp — смещение у чайника, см. */
async function drawStroke(p, side, amp) {
  const pts = []; for (let y = K.START.y; y >= K.GOAL.y + 14; y -= 10) { const f = K.bump(y, K.KETTLE, 96); pts.push(await cpt(p, '#drawCv', 600, K.RX + side * amp * f, y)); }
  await mouseDrag(p, pts);
}
/** Снимок канваса схемы в момент t: хэш пикселей, чтобы сравнить кадры. */
async function animHash(p, kind, t) {
  return p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); Anim.seek(cv, ${t}); const d = cv.toDataURL('image/png'); let h = d.length; for (let i = 0; i < d.length; i += 53) h = (h * 31 + d.charCodeAt(i)) >>> 0; return h; })()`);
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('window.__l13.OwnMath && Math.exp === window.__l13.OwnMath.exp'), 'своя математика установлена на странице');
  // число миссий с целью в шапке = миссии без свободного режима во всех лабораториях
  const missionsTotal = await p.eval(`[...document.querySelectorAll('.m-steps')].reduce((s, ol) => s + [...ol.children].filter((li) => !/Свободно/.test(li.textContent)).length, 0)`);
  check(new RegExp(`^${missionsTotal} миссий`).test(await p.eval('document.querySelector("#heroMis").textContent')), `миссий с целью: ${missionsTotal}, в шапке — ` + (await p.eval('document.querySelector("#heroMis").textContent')));
  check((await p.eval('document.querySelectorAll("#recall .q, #recall [data-q], #recall button").length')) > 0, 'разминка отрисована');
  check((await p.eval('document.querySelectorAll(".katex").length')) > 8, 'формулы отрисованы: ' + (await p.eval('document.querySelectorAll(".katex").length')));
  const gl = await p.eval('[...document.querySelectorAll(".gl")].map((e) => e.textContent)');
  check(gl.length > 0 && gl.every((t) => t === t.toLowerCase() || /^[A-Z0-9]/.test(t)), `подсказки глоссария: ${gl.length}, строчные (кроме аббревиатур)`);
  // каждая сцена и схема подписана
  check(await p.eval('[...document.querySelectorAll(".scene-card")].every((c) => c.querySelector(".cv-note")) && [...document.querySelectorAll("figure.modes-fig")].every((f) => f.querySelector("figcaption"))'), 'у каждой сцены есть cv-note, у каждой схемы — подпись');
  // отсылки вперёд: названий моделей из будущих уроков нет в тексте урока и квизе
  const body = await p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#finale .links, #finale .links + *, #recall").forEach((e) => e.remove()); return m.textContent; })()');
  const banned = ['RT-1', 'RT-2', 'OpenVLA', 'π0', 'FAST', 'CVAE', 'ACT ', 'Diffusion Policy', 'RTC', 'ALOHA'];
  const found = banned.filter((w) => body.includes(w));
  check(found.length === 0, 'отсылок вперёд по именам моделей нет' + (found.length ? ': ' + found.join(', ') : ''));
  await p.shotEl(out('l13-hero.png'), '#top', 0);

  // --- 1. опыт: первая поездка и больше данных
  await center(p, '#mdMis');
  check(await p.eval('document.querySelector("#wrapMdPlot").hidden && document.querySelector("#wrapMdView").hidden'), 'опыт М1: прогноза и переключателя поездок ещё нет');
  await bet(p, '#mdMis', 'Объедет чайник'); const t0 = Date.now(); await go(p, '#mdMis', 'exp');
  const e1 = await p.eval('window.__l13.mis.exp.ctx.results[0]');
  check(await done(p, 'exp') && e1.crash === NODE.md[1].crash && Math.abs(e1.miss - NODE.md[1].miss) < 0.05, `опыт М1: касаний ${e1.crash} из 20 (Node: ${NODE.md[1].crash}), ставка не сыграла — ` + (await outText(p, '#mdMis')).slice(0, 60) + `; ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  await p.shotEl(out('l13-exp-m1.png'), '#kettle .lab', 6);
  await next(p, '#mdMis');
  check(await p.eval('!document.querySelector("#wrapMdPlot").hidden'), 'опыт М2: появился график прогноза');
  await go(p, '#mdMis', 'exp');
  check(!(await done(p, 'exp')) && /нарисуй прогноз/.test(await p.eval('document.querySelector("#mdMis .g-out").textContent')), 'опыт М2: без прогноза опыт не запускается, есть подсказка');
  await center(p, '#mdPlot');
  const a0 = await p.eval(`(() => { const cv = document.querySelector('#mdPlot'), r = cv.getBoundingClientRect(); return { r: { l: r.left, t: r.top, w: r.width } }; })()`);
  const kx = a0.r.w / 420, px0 = a0.r.l + (Math.max(30, 10 + 2 * 6.6 / kx) + 28) * kx, pyMid = a0.r.t + (12 + 13 / kx + (250 - Math.max(22, 15 / kx) - 13 / kx - 12 - 13 / kx) / 2) * kx;
  await mouseDrag(p, [{ x: px0, y: pyMid }, { x: px0, y: pyMid - 20 }, { x: px0, y: pyMid - 50 }]);
  const fc0 = await p.eval('window.__l13.Exp.st.fc[0]');
  check(fc0 != null && fc0 > 10, `опыт М2: первая точка прогноза перетащена мышью → ${fc0}`);
  await p.eval('window.__l13.Exp.setFc(2, 8); window.__l13.Exp.setFc(3, 4)');
  await p.shotEl(out('l13-forecast.png'), '#kettle .lab', 6);
  await center(p, '#mdMis'); const t1 = Date.now(); await go(p, '#mdMis', 'exp');
  const e2 = await p.eval('window.__l13.mis.exp.ctx.results[1]');
  check(await done(p, 'exp') && e2.crash.every((c, i) => c === NODE.md[i].crash), `опыт М2: ${e2.crash.join(', ')} касаний из 20 — совпало с Node; ${((Date.now() - t1) / 1000).toFixed(1)} с`);
  check(/Опыт: /.test(await outText(p, '#mdMis')), 'опыт М2: разбор показан — ' + (await outText(p, '#mdMis')).slice(0, 100));
  await p.eval('document.querySelectorAll("#mdView button")[0].click()'); await sleep(100);
  await p.shotEl(out('l13-forecast-done.png'), '#kettle .lab', 6);
  await next(p, '#mdMis');
  check(await p.eval('!document.querySelector("#wrapMdView").hidden && [...document.querySelectorAll("#mdView button")].every((b) => !b.disabled)'), 'опыт, свободный режим: переключатель поездок доступен');

  // --- 2. нарисуй объезды
  await center(p, '#drawCv');
  await drawStroke(p, -1, 58); await drawStroke(p, 1, 56);
  const s1 = await p.eval('window.__l13.Draw.api.state()');
  check(s1.n === 2 && s1.bad === 0 && s1.nl === 1 && s1.nr === 1, `рисование мышью: две линии, слева ${s1.nl}, справа ${s1.nr}, без касаний`);
  await p.eval('window.__l13.Draw.api.synth(-1, 60); window.__l13.Draw.api.synth(1, 57);'); await sleep(80);
  check(await done(p, 'draw'), 'рисование М1: четыре объезда мимо, среднее в чайнике — ' + (await outText(p, '#drawMis')).slice(0, 90));
  await p.shotEl(out('l13-draw-mean.png'), '#mean .lab', 6);
  await next(p, '#drawMis');
  await drawStroke(p, -1, 62); await sleep(60);
  const s2 = await p.eval('window.__l13.Draw.api.state()');
  check(await done(p, 'draw'), `рисование М2: слева ${s2.nl}, справа ${s2.nr} — L1 слева (${f1(s2.l1X, 0)} см), MSE ${s2.mseHit ? 'в чайнике' : 'мимо'} (${f1(s2.mseX, 0)} см)`);
  await p.shotEl(out('l13-draw-median.png'), '#mean .lab', 6);
  await next(p, '#drawMis');
  await p.eval('window.__l13.Draw.api.synth(-1, 64); window.__l13.Draw.api.synth(-1, 66); window.__l13.Draw.api.synth(-1, 70);'); await sleep(60);
  const s3 = await p.eval('window.__l13.Draw.api.state()');
  check(await done(p, 'draw'), `рисование М3: слева ${s3.nl}, справа ${s3.nr} — MSE проезжает в ${f1(Math.abs(s3.mseX), 0)} см`);
  await p.eval('document.querySelector("#drawUndo").click()'); await sleep(50);
  check((await p.eval('window.__l13.Draw.api.state().n')) === s3.n - 1, 'рисование: «Убрать последнюю» работает');
  await mouseDrag(p, [await cpt(p, '#drawCv', 600, 300, 360), await cpt(p, '#drawCv', 600, 290, 330), await cpt(p, '#drawCv', 600, 280, 300)]);
  check(/не засчитана/.test(await p.eval('document.querySelector("#drawOut").textContent')), 'рисование: короткая линия не засчитана, есть подсказка');

  // --- 3. схема источников мод и калибровка
  const hs1 = await animHash(p, 'sources5', 0.5), hs2 = await animHash(p, 'sources5', 2.5);
  check(hs1 !== hs2, 'схема «где в данных несколько стратегий» движется');
  await p.shotEl(out('l13-sources.png'), 'canvas[data-anim=sources5]', 4);
  await center(p, '#calib');
  for (const [id, v] of [['pusht', 70], ['libero', 20], ['mw', 30], ['kitchen', 60], ['grasp', 90]]) await setRange(p, 'cal-' + id, v);
  await p.click('#calGo'); await sleep(100);
  const cal = await p.eval('document.querySelector("#calOut").textContent');
  const pen = (0.7 ** 2) + (0.2 ** 2) + (0.3 ** 2) + (0.4 ** 2) + (0.1 ** 2);
  check(cal.startsWith(`${Math.round(100 - 20 * pen)} очков`), `калибровка: счёт ${cal.slice(0, 40)} (ожидали ${Math.round(100 - 20 * pen)})`);
  await p.shotEl(out('l13-calib.png'), '#calib', 6);

  // --- 4. способы и бины
  const hm1 = await animHash(p, 'modes4', 0.2), hm2 = await animHash(p, 'modes4', 1.0);
  check(hm1 !== hm2, 'схема «четыре способа» движется');
  await p.eval('document.querySelector("canvas[data-anim=modes4b]").closest("details").open = true'); await sleep(150);
  const hb1 = await animHash(p, 'modes4b', 0.4), hb2 = await animHash(p, 'modes4b', 2.0);
  check(hb1 !== hb2, 'схема «ещё четыре способа» движется');
  await p.shotEl(out('l13-modes4b.png'), 'canvas[data-anim=modes4b]', 4);
  await center(p, '#binsMis');
  await bet(p, '#binsMis', 'Около половины'); await go(p, '#binsMis', 'bins');
  const b1 = await p.eval('window.__l13.mis.bins.ctx.results[0]');
  check(b1.bad > 35 && b1.bad < 65 && await p.eval('document.querySelector("#binsMis .bet-right") !== null'), `бины М1: виляющих ${b1.bad} из 100, ставка отмечена`);
  await next(p, '#binsMis');
  await go(p, '#binsMis', 'bins'); check(!(await done(p, 'bins')), 'бины М2: с независимыми бинами миссия не пройдена');
  await p.eval('document.querySelector("#wrapBinsMode [data-mode=ar]").click()'); await go(p, '#binsMis', 'bins');
  check(await done(p, 'bins') && /оранжевый столбец/.test(await p.eval('document.querySelector("#binsOut").textContent')), 'бины М2: по очереди — ' + (await outText(p, '#binsMis')).slice(0, 80));
  await p.shotEl(out('l13-bins.png'), '#models .lab', 6);

  // --- 5. лаборатория «Три Ады»
  await p.eval('window.__l13.SPEED.k = 4');
  await center(p, '#labMis');
  check(await p.eval('["#wrapShare", "#wrapMode", "#wrapH", "#wrapN", "#wrapK", "#wrapShow", "#wrapDrag"].every((s) => document.querySelector(s).hidden)'), 'три Ады М1: ручек нет, только сцена и кнопка');
  await bet(p, '#labMis', 'Смесь и диффузия'); const tl = Date.now(); await go(p, '#labMis', 'lab');
  const r1 = await p.eval('window.__l13.mis.lab.ctx.results[0]');
  check(await done(p, 'lab') && r1.reg.touches === 10 && r1.gmm.touches === 0 && r1.dif.touches === 0, `три Ады М1: регрессия ${r1.reg.touches}/10, смесь ${r1.gmm.touches}, диффузия ${r1.dif.touches}; обучение и прогон ${((Date.now() - tl) / 1000).toFixed(1)} с`);
  await p.shotEl(out('l13-lab-m1.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapShare").hidden'), 'три Ады М2: появилась доля');
  await bet(p, '#labMis', 'Да, только'); await setRange(p, 'labShare', 70); await go(p, '#labMis', 'lab');
  check(!(await done(p, 'lab')), 'три Ады М2, 70%: ' + (await p.eval('document.querySelector("#labMis .g-out").textContent')).slice(0, 80));
  await setRange(p, 'labShare', 75); await go(p, '#labMis', 'lab');
  check(!(await done(p, 'lab')), 'три Ады М2, 75%: регрессия ещё задевает');
  await setRange(p, 'labShare', 80); await go(p, '#labMis', 'lab');
  check(await done(p, 'lab'), 'три Ады М2, 80%: ' + (await outText(p, '#labMis')).slice(0, 90));
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapDrag").hidden && document.querySelector("#wrapShare").hidden && window.__l13.Lab.st.share === 0.5'), 'три Ады М3: доля вернулась к 50%, чайник можно тащить');
  await center(p, '#labCv');
  const ka = await cpt(p, '#labCv', 600, K.KETTLE.x, K.KETTLE.y), kb = await cpt(p, '#labCv', 600, 275, 130);
  const dragPts = []; for (let i = 0; i <= 12; i++) dragPts.push({ x: ka.x + (kb.x - ka.x) * i / 12, y: ka.y + (kb.y - ka.y) * i / 12 });
  await mouseDrag(p, dragPts);
  const kk = await p.eval('window.__l13.Lab.st.kettle');
  check(Math.abs(kk.x - 275) < 4 && Math.abs(kk.y - 130) < 4, `три Ады М3: чайник перетащен мышью в (${f1(kk.x, 0)}; ${f1(kk.y, 0)})`);
  await center(p, '#labMis'); await go(p, '#labMis', 'lab');
  check(await done(p, 'lab'), 'три Ады М3: ' + (await outText(p, '#labMis')).slice(0, 90));
  await p.shotEl(out('l13-lab-door.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('window.__l13.Lab.st.mode === "step" && window.__l13.Lab.st.kettle.y === 254'), 'три Ады М4: чайник на месте, смесь выбирает сторону на каждом шаге');
  await bet(p, '#labMis', 'Будет прыгать');
  for (let i = 0; i < 3 && !(await done(p, 'lab')); i++) await go(p, '#labMis', 'lab');
  const r4 = await p.eval('window.__l13.mis.lab.ctx.results[3]');
  check(await done(p, 'lab'), `три Ады М4: смесь задела чайник ${r4.gmm.touches} раз, смен стороны до ${r4.gmm.maxSw}`);
  await p.shotEl(out('l13-lab-jitter.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('["#wrapShare", "#wrapMode", "#wrapH", "#wrapN", "#wrapK", "#wrapShow", "#wrapDrag"].every((s) => !document.querySelector(s).hidden)'), 'три Ады, свободный режим: все ручки видны');
  await setRange(p, 'labK', 1); await p.eval('document.querySelector("#wrapShow [data-show=heat]").click()'); await go(p, '#labMis', 'lab');
  const rf = await p.eval('window.__l13.mis.lab.ctx.results[4]');
  check(rf.gmm.touches === 10, `свободный режим: смесь из одной компоненты задевает чайник ${rf.gmm.touches} из 10`);
  await p.shotEl(out('l13-lab-free.png'), '#lab .lab', 6);

  // --- 6. пачки: схема, длина пачки на сцене
  const hc1 = await animHash(p, 'chunk', 0.3), hc2 = await animHash(p, 'chunk', 2.2);
  check(hc1 !== hc2, 'схема «пачка действий» движется');
  await p.shotEl(out('l13-chunk-scheme.png'), 'canvas[data-anim=chunk]', 4);
  await center(p, '#chMis');
  check(await p.eval('document.querySelector("#wrapChH").hidden && window.__l13.ChunkLab.st.H === 4'), 'пачки М1: ползунка нет, пачка 4 шага');
  await bet(p, '#chMis', 'На одном из стыков');
  const tc = Date.now(); for (let i = 0; i < 3 && !(await done(p, 'chunk')); i++) await go(p, '#chMis', 'chunk');
  const c1 = await p.eval('window.__l13.mis.chunk.ctx.results[0]');
  check(await done(p, 'chunk') && c1.gmm.touches > 0, `пачки М1: касаний ${c1.gmm.touches} из 10, смен стороны до ${c1.gmm.maxSw}, смесь взята из кеша лаборатории 2 (${((Date.now() - tc) / 1000).toFixed(1)} с)`);
  await p.shotEl(out('l13-chunk-m1.png'), '#chunkLab', 6);
  await next(p, '#chMis');
  check(await p.eval('!document.querySelector("#wrapChH").hidden'), 'пачки М2: появился ползунок длины пачки');
  for (const H of [8, 16, 20, 18]) { await setRange(p, 'chH', H); await go(p, '#chMis', 'chunk'); }
  check(await done(p, 'chunk') && /18 шагов/.test(await outText(p, '#chMis')), 'пачки М2, порог длины: ' + (await outText(p, '#chMis')).slice(0, 80));
  console.log('  журнал М2:', await p.eval('document.querySelector("#chMis .m-log").textContent'));
  await p.shotEl(out('l13-chunk-m2.png'), '#chunkLab', 6);

  // --- 7. стыки: схема двух способов и интерактив
  const hq1 = await animHash(p, 'seams2', 0.5), hq2 = await animHash(p, 'seams2', 4.0);
  check(hq1 !== hq2, 'схема «два способа на стыке» движется');
  await p.shotEl(out('l13-seams-scheme.png'), 'canvas[data-anim=seams2]', 4);
  await center(p, '#seamMis');
  await bet(p, '#seamMis', 'Почти во всех'); await go(p, '#seamMis', 'seams');
  const q1 = await p.eval('window.__l13.mis.seams.ctx.results[0]');
  check(q1.touches >= 15, `стыки М1: последняя пачка — касаний ${q1.touches} из 20`);
  await p.shotEl(out('l13-seams-naive.png'), '#seamLab', 6);
  await next(p, '#seamMis');
  await p.eval('document.querySelector("#wrapSeamMode [data-mode=te]").click()'); await go(p, '#seamMis', 'seams');
  check(!(await done(p, 'seams')), 'стыки М2, сглаживание: ' + (await p.eval('document.querySelector("#seamMis .g-out").textContent')).slice(0, 70));
  await p.shotEl(out('l13-seams-te.png'), '#seamCv', 6);
  await p.eval('document.querySelector("#wrapSeamMode [data-mode=bid]").click()'); await go(p, '#seamMis', 'seams');
  check(await done(p, 'seams'), 'стыки М2, согласование: ' + (await outText(p, '#seamMis')).slice(0, 100));
  await p.shotEl(out('l13-seams-bid.png'), '#seamCv', 6);
  await p.eval('window.__l13.SPEED.k = 1');

  // --- квиз и тёмная тема
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelector(".q-opt").click())');
  check(/Итог: \d из 8/.test(await p.eval('document.querySelector("#quizScore").textContent')), 'квиз: ' + await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l13-quiz.png'), '#quiz .prose', 6);
  await p.shotEl(out('l13-finale.png'), '#finale .prose', 6);
  await p.click('#themeBtn'); await sleep(300);
  await p.shotEl(out('l13-lab-dark.png'), '#lab .lab', 6);
  await p.shotEl(out('l13-exp-dark.png'), '#kettle .lab', 6);
  await p.shotEl(out('l13-chunk-dark.png'), '#chunkLab', 6);
  await p.shotEl(out('l13-sources-dark.png'), 'canvas[data-anim=sources5]', 4);
  await p.shotEl(out('l13-seams-scheme-dark.png'), 'canvas[data-anim=seams2]', 4);
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.eval('window.__l13.SPEED.k = 3');
  await m.shotEl(out('l13-m-hero.png'), '#top', 0);
  await center(m, '#mdMis');
  await bet(m, '#mdMis', 'Заденет'); await go(m, '#mdMis', 'exp');
  check(await done(m, 'exp'), 'телефон: опыт М1 пройден');
  await m.shotEl(out('l13-m-exp.png'), '#kettle .lab', 4);
  await center(m, '#drawCv');
  await drawStroke(m, -1, 58); await drawStroke(m, 1, 58);
  check((await m.eval('window.__l13.Draw.api.state().n')) === 2, 'телефон: две линии нарисованы пальцем (мышью в эмуляции)');
  await m.shotEl(out('l13-m-draw.png'), '#mean .lab', 4);
  await m.shotEl(out('l13-m-sources.png'), 'canvas[data-anim=sources5]', 4);
  await m.shotEl(out('l13-m-calib.png'), '#calib', 4);
  await m.shotEl(out('l13-m-bins.png'), '#models .lab', 4);
  await center(m, '#labMis');
  await bet(m, '#labMis', 'Никто'); await go(m, '#labMis', 'lab');
  check(await done(m, 'lab'), 'телефон: три Ады М1 пройдена');
  await m.shotEl(out('l13-m-lab.png'), '#lab .lab', 4);
  await m.shotEl(out('l13-m-chunk-scheme.png'), 'canvas[data-anim=chunk]', 4);
  await m.shotEl(out('l13-m-chunk.png'), '#chunkLab', 4);
  await m.shotEl(out('l13-m-seams-scheme.png'), 'canvas[data-anim=seams2]', 4);
  await m.shotEl(out('l13-m-seams.png'), '#seamCv', 4);
  await m.eval('document.querySelector("canvas[data-anim=modes4b]").closest("details").open = true'); await sleep(200);
  await m.shotEl(out('l13-m-modes4b.png'), 'canvas[data-anim=modes4b]', 4);
  const wdt = await m.eval('document.documentElement.scrollWidth');
  check(wdt <= 390, `телефон: ширина ${wdt} из 390`);
  const wide = await m.eval('[...document.querySelectorAll(".lab")].filter((l) => l.getBoundingClientRect().width > l.parentElement.getBoundingClientRect().width + 1).length');
  check(wide === 0, 'телефон: ни одна лаборатория не шире своей карточки');
  check(m.logs.length === 0, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
}

(async () => {
  nodeNumbers();
  await desktop();
  await phone();
  console.log(fails ? `ИТОГ: ${fails} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
