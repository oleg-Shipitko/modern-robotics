// Урок 3.5 «Открытые VLA: Octo и OpenVLA»: миссии проходятся через интерфейс и дают обещанные в тексте исходы,
// числа в браузере совпадают с движком в Node, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l35-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-24 python3 lessons/build.py l35.
const path = require('path');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l35/engine.js');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-5-otkrytye-vla.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const pcs = (v) => (v * 100).toFixed(0) + '%';
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 60));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 120));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const st = (p, lab) => p.eval(`JSON.stringify(window.__l35.${lab}.api.state())`).then(J);
(async () => {
  // эталон в Node: те же предобучение и дообучение, что в браузере
  console.log('движок в Node');
  const base = E.finish(E.pretrain({}));
  const ref = { home: E.evaluate(base, E.DOMAINS.home, 60).rate, zero: E.evaluate(base, E.DOMAINS.lab, 60).rate };
  for (const m of ['full', 'lora', 'frozen']) ref[m + '5'] = E.labRun(base, m, 5).ev.rate;
  console.log('  без дообучения ' + pcs(ref.zero) + ', 5 записей: все веса ' + pcs(ref.full5) + ', LoRA ' + pcs(ref.lora5) + ', заморозка ' + pcs(ref.frozen5));
  check(ref.home >= 0.9 && ref.zero < 0.35, `предобучение: знакомый робот ${pcs(ref.home)}, новая рука без дообучения ${pcs(ref.zero)} (в тексте 95% и 28%)`);
  check(Math.round(ref.home * 100) === 95 && Math.round(ref.zero * 100) === 28, 'числа 95% и 28% из текста урока совпадают с движком');

  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(400);
  check(/^10 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.4: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="3-6-pi0.html"]')`), 'ссылка на урок 3.6 на месте');
  await p.eval('window.__l35.SPEED.k = 20; true');
  await p.eval('window.__l35.Store.ready.then(() => true)', true); await sleep(300);
  const z = await st(p, 'LabFT');
  check(Math.abs(z.zero - ref.zero) < 1e-9, `браузер: без дообучения ${pcs(z.zero)} — как в Node`);

  // ---------- 1. Дообучение ----------
  console.log('Лаборатория 1: дообучение');
  let r = await viaUI(p, '#fMis', 2);
  const f1 = await st(p, 'LabFT');
  check(r.ok && f1.done && f1.n === 5, `миссия 1: 5 записей — все веса ${pcs(f1.full)}, LoRA ${pcs(f1.lora)}, заморозка ${pcs(f1.frozen)}`);
  check(Math.abs(f1.full - ref.full5) < 1e-9 && Math.abs(f1.lora - ref.lora5) < 1e-9 && Math.abs(f1.frozen - ref.frozen5) < 1e-9, 'успехи в браузере совпадают с движком в Node');
  check(f1.best === 'frozen' && /ставка сыграла/i.test(r.out), 'при 5 записях лучше всех заморозка — ставка «Заморозка» сыграла');
  check(f1.cmd.full.blue < f1.cmd.zero.blue && f1.cmd.frozen.blue > f1.cmd.zero.blue && f1.cmd.full.red > f1.cmd.zero.red, `по командам: все веса «синяя» ${f1.cmd.zero.blue} → ${f1.cmd.full.blue}, заморозка «синяя» ${f1.cmd.frozen.blue}, все веса «красная» ${f1.cmd.zero.red} → ${f1.cmd.full.red}`);
  check(r.out.includes(pcs(f1.frozen)) && r.out.includes(`с ${f1.cmd.zero.blue} до ${f1.cmd.full.blue}`), 'разбор миссии 1 называет посчитанные числа');
  check(f1.loraTrain === 279 && f1.frozenTrain === 177 && f1.all === 2281, `обучаемые параметры: LoRA ${f1.loraTrain}, заморозка ${f1.frozenTrain} из ${f1.all} — как в «Под капотом»`);
  await p.eval(`document.getElementById('finetune').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-ft5.png'), '#finetune .lab', 6);
  await nextMission(p, '#fMis'); r = await viaUI(p, '#fMis', 1);
  const f2 = await st(p, 'LabFT');
  check(r.ok && f2.n === 40 && f2.full > f2.frozen && f2.lora > f2.frozen && /ставка сыграла/i.test(r.out), `миссия 2: 40 записей — все веса ${pcs(f2.full)}, LoRA ${pcs(f2.lora)}, заморозка ${pcs(f2.frozen)}`);
  check(Math.abs(f2.full - f2.lora) <= 0.03 && f2.loraShare < 0.15, `LoRA как все веса (разница ${pcs(Math.abs(f2.full - f2.lora))}), учит ${(f2.loraShare * 100).toFixed(1)}% чисел`);
  check(r.out.includes('68,2%') && r.out.includes('12,2%'), 'разбор миссии 2: 68,2% из статьи и 12,2% у нас');
  await nextMission(p, '#fMis'); r = await viaUI(p, '#fMis', 1);
  const f3 = await st(p, 'LabFT');
  const spread = Math.max(...f3.ranks.map((q) => q.rate)) - Math.min(...f3.ranks.map((q) => q.rate));
  check(r.ok && f3.ranks.length === 4 && spread <= 0.05 && /ставка сыграла/i.test(r.out), `миссия 3: ранги 1/2/4/8 — ${f3.ranks.map((q) => pcs(q.rate)).join(', ')}, разброс ${pcs(spread)}`);
  check(f3.ranks.map((q) => q.trainable).join(',') === '150,279,537,1053', 'обучаемых чисел при рангах 1, 2, 4, 8: ' + f3.ranks.map((q) => q.trainable).join(', '));
  await p.eval(`document.getElementById('finetune').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-ft-rank.png'), '#finetune .lab', 6);
  await nextMission(p, '#fMis');
  check(await p.eval(`!document.getElementById('wrapFSet').hidden && !document.getElementById('fGo').hidden`), 'свободный режим: видны «Другие записи» и кнопка дообучения');
  await p.eval(`(window.__l35.LabFT.api.setup({ n: 5, set: 3 }), true)`);
  const f4 = J(await p.eval(`window.__l35.LabFT.api.trainAll().then((s) => JSON.stringify(s))`, true));
  check(f4.full > f4.frozen, `набор 3 из 5 записей: все веса ${pcs(f4.full)} обходят заморозку ${pcs(f4.frozen)} — задание свободного режима выполнимо`);

  // ---------- 2. Голова действий ----------
  console.log('Лаборатория 2: голова действий');
  r = await viaUI(p, '#hMis', 1);
  let hs = await st(p, 'LabHead');
  check(r.ok && hs.mse.n === 10 && hs.mse.miss === 10 && /ставка сыграла/i.test(r.out), `миссия 1: регрессия — 10 ответов в точке (${hs.mseX.toFixed(1)}; ${hs.mseY.toFixed(1)}), все мимо мисок`);
  await nextMission(p, '#hMis');
  check(!(await p.eval(`document.getElementById('hTally').textContent.includes('в левой 10')`)), 'до ставки ответы токенов не показаны');
  r = await viaUI(p, '#hMis', 1); hs = await st(p, 'LabHead');
  check(r.ok && hs.tok.left === 10 && /ставка сыграла/i.test(r.out), `миссия 2: токены — 10 из 10 в левой миске, p(x) ${hs.pL.toFixed(3)} против ${hs.pR.toFixed(3)}`);
  await nextMission(p, '#hMis'); r = await viaUI(p, '#hMis', 1); hs = await st(p, 'LabHead');
  check(r.ok && hs.diff.left >= 3 && hs.diff.right >= 3 && hs.diff.miss <= 2 && /ставка сыграла/i.test(r.out), `миссия 3: диффузия — в левой ${hs.diff.left}, в правой ${hs.diff.right}, мимо ${hs.diff.miss}`);
  { const ds = E.placeDemos(40, 21), m = E.finish(E.diffTrain(ds)), seq = []; for (let i = 0; i < 12; i++) seq.push(E.whichBowl(E.diffSample(m, 1000 + i)));
    check(seq.filter((x) => x === 0).length === hs.diff.left && seq.filter((x) => x === 1).length === hs.diff.right, 'ответы диффузии в браузере совпадают с движком в Node'); }
  await p.eval(`document.getElementById('heads').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-heads.png'), '#heads .lab', 6);
  await nextMission(p, '#hMis');
  check(!(await critOk(p, '#hMis')), 'миссия 4: при 24 корзинах ответ токенов в миске — ещё не засчитано');
  await p.eval(`(window.__l35.LabHead.api.setK(8), true)`); check(!(await critOk(p, '#hMis')), '8 корзин — ещё в миске');
  await p.eval(`(window.__l35.LabHead.api.setK(6), true)`); hs = await st(p, 'LabHead');
  check(await critOk(p, '#hMis') && hs.tokMiss, `6 корзин: центр корзины в ${hs.tokDist.toFixed(1)} клетки от миски — мимо, миссия засчитана`);
  await p.eval(`document.getElementById('heads').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-heads-bins.png'), '#heads .lab', 6);
  await nextMission(p, '#hMis');
  const sw = J(await p.eval(`(() => { const X = window.__l35.LabHead.api, res = []; for (let n = 14; n <= 26; n++) { X.setShare(n); res.push([n, X.state().tokBowl]); } X.setShare(21); return JSON.stringify(res); })()`));
  check(sw.some((q) => q[1] === 1) && sw.some((q) => q[1] === 0), 'свободный режим: при малой доле токены переходят в правую миску — ' + sw.filter((q) => q[1] === 1).map((q) => q[0]).join(', '));

  // ---------- 3. Таблицы ----------
  console.log('Интерактив: таблицы OpenVLA');
  await p.eval(`(window.__l35.LabTbl.api.select('visual'), true)`); check(!(await critOk(p, '#tMis')), 'миссия 1: «Визуальное обобщение» — не ответ');
  await p.eval(`document.querySelector('#tTbl .vr[data-id="semantic"]').click(); true`); await sleep(100);
  check(await critOk(p, '#tMis'), 'миссия 1: нажата строка «Семантическое обобщение» — засчитано');
  const t1 = await st(p, 'LabTbl');
  check(Math.abs(t1.rates[2] - 0.388) < 0.001 && Math.abs(t1.rates[3] - 0.363) < 0.001, `семантика: RT-2-X ${(t1.rates[2] * 100).toFixed(1)}%, OpenVLA ${(t1.rates[3] * 100).toFixed(1)}% — как в статье`);
  await nextMission(p, '#tMis');
  await p.eval(`document.querySelector('#tTbl .vr[data-id="motion"]').click(); true`); await sleep(100);
  check(await critOk(p, '#tMis'), 'миссия 2: «Обобщение движения» — Octo хуже RT-1-X, засчитано');
  await nextMission(p, '#tMis'); r = await viaUI(p, '#tMis', 1);
  const t3 = await st(p, 'LabTbl');
  check(r.ok && t3.trials === 230 && /16,5/.test(r.out) && /ставка сыграла/i.test(r.out), `миссия 3: 29 задач — OpenVLA ${(t3.rates[3] * 100).toFixed(1)}%, RT-2-X ${(t3.rates[2] * 100).toFixed(1)}%`);
  const bridge = E.tblGroup('bridge').rates, google = E.tblGroup('google').rates;
  check(bridge.map((v) => (v * 100).toFixed(1)).join(' ') === '18.5 20.0 50.6 70.6' && google.map((v) => (v * 100).toFixed(1)).join(' ') === '33.3 26.7 78.3 85.0', 'средние по роботам совпадают с таблицами 4 и 6 статьи');
  await p.eval(`(() => { const e = document.querySelector('#tTbl .vr[data-id="gin"]'); e.dispatchEvent(new MouseEvent('mouseenter')); return true; })()`);
  check(/Open Middle Drawer/.test(await p.eval(`document.getElementById('tDetail').textContent`)), 'наведение на строку показывает задачи');
  await p.eval(`document.getElementById('results').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-table.png'), '#results .lab', 6);

  // ---------- схема, квиз, глоссарий, консоль ----------
  const an = J(await p.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.1); const a = cv.toDataURL(); Anim.seek(cv, 4.7); const b = cv.toDataURL(); return { k: cv.dataset.anim, moves: a !== b, w: cv.width }; }))`));
  check(an.length === 1 && an.every((q) => q.moves && q.w > 0), 'схема LoRA движется: ' + an.map((q) => q.k).join(', '));
  await p.eval(`document.getElementById('lora').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l35-lora.png'), '#lora .anim-card', 6);
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check((await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1).length`)) === 0, 'ни одна лаборатория не шире своей карточки');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  for (const [id, sel, n] of [['finetune', '#finetune .lab', 'l35-ft-dark.png'], ['heads', '#heads .lab', 'l35-heads-dark.png'], ['results', '#results .lab', 'l35-table-dark.png'], ['lora', '#lora .anim-card', 'l35-lora-dark.png']]) { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6); }

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(400);
  await m.eval('window.__l35.SPEED.k = 20; true');
  await m.eval('window.__l35.Store.ready.then(() => true)', true);
  await m.eval(`window.__l35.LabFT.api.trainAll().then(() => true)`, true);
  await m.eval(`(window.__l35.LabHead.api.prepare({ heads: ['mse', 'tok', 'diff'] }), window.__l35.LabHead.api.ask('all', 4).then(() => true))`, true);
  await m.eval(`(window.__l35.LabTbl.api.select('semantic'), true)`);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  check((await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1).length`)) === 0, 'телефон: лаборатории не шире экрана');
  const anm = J(await m.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.1); const a = cv.toDataURL(); Anim.seek(cv, 4.7); const b = cv.toDataURL(); return { moves: a !== b, layout: cv.dataset.layout }; }))`));
  check(anm.every((q) => q.moves && q.layout === 'n'), 'телефон: схема в узкой раскладке и движется');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['finetune', '#finetune .lab', 'l35-m-ft.png'], ['heads', '#heads .lab', 'l35-m-heads.png'], ['results', '#results .lab', 'l35-m-table.png'], ['lora', '#lora .anim-card', 'l35-m-lora.png']]) { await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out(n), sel, 4); }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
