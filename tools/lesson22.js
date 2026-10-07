// Урок 2.2 «PerAct: 3D-представления и язык»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, задача с карточками решается, график совпадает с таблицей 1 статьи, консоль чиста,
// на телефоне ничего не вылезает за экран. Снимки — shots/l22-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-10 python3 lessons/build.py l22.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/2-2-peract.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet != null}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 60));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
const shot = async (p, id, sel, n, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, pad); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hm = await p.eval(`document.getElementById('heroMis').textContent`);
  check(hm === '9 миссий с целью', 'число миссий в шапке: ' + hm);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.1: три вопроса');
  await p.eval('window.__l22.SPEED.k = 60; true');

  // ---------- 1. Ключевые позы ----------
  console.log('Ключевые позы');
  const K = 'window.__l22.LabKey.api';
  const k0 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(k0.n === 325, 'в демонстрации 325 кадров');
  check(!k0.ok && k0.type === 'drop' && !k0.roles.place && !(await critOk(p, '#kMis')), `порог 0,04: ${k0.nk} поз без отпускания на полке — ${k0.msg} (как в тексте миссии)`);
  const band = J(await p.eval(`JSON.stringify(${K}.band())`));
  check(band.lo != null && band.hi > band.lo, `рабочий порог: от ${band.lo} до ${band.hi} рад/с`);
  for (const e of [band.lo, (band.lo + band.hi) / 2, band.hi]) {
    const s = J(await p.eval(`(${K}.setEps(${e}), JSON.stringify(${K}.state()))`));
    check(s.nk === 6 && s.ok && s.roles.grasp && s.roles.place, `порог ${s.eps}: 6 поз, чашка на полке`);
  }
  check(await critOk(p, '#kMis'), 'миссия 1 засчитана');
  check(/Шесть поз: перед чашкой, захват, подъём над чайником, перед полкой, отпускание, отвод руки/.test(await outText(p, '#kMis')), 'разбор миссии 1 перечисляет шесть поз');
  const below = J(await p.eval(`(${K}.setEps(${band.lo} - 0.01), JSON.stringify(${K}.state()))`));
  check(below.nk !== 6 || !below.ok, `чуть ниже порога: ${below.nk} поз, ${below.ok ? 'чашка на полке' : below.msg}`);
  const low = J(await p.eval(`(${K}.setEps(0.03), JSON.stringify(${K}.state()))`));
  check(!low.ok && !low.roles.grasp, `порог 0,03: пропадает и захват чашки — ${low.msg}`);
  const above = J(await p.eval(`(${K}.setEps(${band.hi} + 0.01), JSON.stringify(${K}.state()))`));
  check(above.nk >= 7, `чуть выше порога: ${above.nk} поз — лишняя поза над чайником`);
  await p.eval(`(${K}.setEps(${band.lo}), true)`);
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes.png', 6);
  await nextMission(p, '#kMis');
  let r = await viaUI(p, '#kMis', 1);
  const k2 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(r.ok && !k2.grip && !k2.ok && k2.type === 'missGrasp', `миссия 2: без условия про захват — ${k2.msg}`);
  check(/ставка сыграла/i.test(r.out) && /Захват сжался в воздухе над чайником/.test(r.out), 'ставка «захват сожмётся не там» сыграла, разбор совпадает');
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes-grip.png', 6);
  await nextMission(p, '#kMis');
  r = await viaUI(p, '#kMis', 1);
  const k3 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(r.ok && k3.mode === 'interval' && !k3.ok && k3.nk === 6, `миссия 3: шесть поз через равные промежутки — ${k3.msg}`);
  check(/ставка сыграла/i.test(r.out) && /Поза 2 пришлась на подъезд к чашке/.test(r.out), 'ставка «нет» сыграла, разбор совпадает');

  // ---------- 2. Следующий лучший воксель ----------
  console.log('Воксели');
  const V = 'window.__l22.LabVox.api';
  r = await viaUI(p, '#vMis', 2);
  const v1 = J(await p.eval(`JSON.stringify(${V}.state())`));
  check(await p.eval(`document.getElementById('vWinBox').hidden`), 'в миссии 1 окна по высоте не видно');
  check(r.ok && v1.regShelf === null && v1.regBelow >= 0 && !!v1.clsShelf, `миссия 1: регрессия в ${v1.regGapCm.toFixed(1)} см над нижней полкой, классификатор — ${v1.clsShelf} (${(v1.pu * 100).toFixed(0)}% / ${(v1.pl * 100).toFixed(0)}%)`);
  check(v1.pu > 0.2 && v1.pl > 0.2, 'у классификатора два пика: на обеих полках заметная вероятность');
  check(/ставка сыграла/i.test(r.out), 'ставка «между полками, в воздух» сыграла');
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels.png', 6);
  await nextMission(p, '#vMis'); await sleep(100);
  const up = J(await p.eval(`(${V}.setCmd('upper'), JSON.stringify(${V}.state()))`));
  const lo = J(await p.eval(`(${V}.setCmd('lower'), JSON.stringify(${V}.state()))`));
  check(up.clsShelf === 'upper' && lo.clsShelf === 'lower', 'команда переносит пик: «на верхнюю» — верхняя, «на нижнюю» — нижняя');
  check(up.regShelf === 'upper' && lo.regShelf === 'lower', 'регрессия с командой тоже попадает на полку (как в разборе)');
  check(await critOk(p, '#vMis'), 'миссия 2 засчитана');
  await p.eval(`(${V}.setView('top'), true)`); await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-top.png', 6); await p.eval(`(${V}.setView('iso'), true)`);
  await nextMission(p, '#vMis'); await sleep(100);
  r = await viaUI(p, '#vMis', 1);
  const e1 = J(await p.eval(`JSON.stringify(${V}.state())`)).ev;
  check(!r.ok && e1.K === 1 && e1.ok >= 10 && e1.ok <= 30, `окно ±1: верно ${e1.ok} из 60 — примерно треть`);
  check(/ставка сыграла/i.test(await p.eval(`document.querySelector('#vMis').textContent`)) || /Расширь окно/.test(r.out), 'после провала — подсказка расширить окно');
  const win = async () => J(await p.eval(`JSON.stringify({ vis: !document.getElementById('vWinBox').hidden, cells: [...document.querySelectorAll('#vWin .win-stack')].map((s) => s.children.length), note: document.getElementById('vWinNote').textContent })`));
  const w1 = await win();
  check(w1.vis && w1.cells.join() === '3,3,3' && /все три места одинаковы/.test(w1.note), 'окно ±1 видно под сценой: по 3 вокселя на столе и на полках, «все три места одинаковы»');
  const evs = {};
  for (const Kw of [2, 3, 4]) {
    await p.eval(`(${V}.setK(${Kw}), true)`);
    r = await viaUI(p, '#vMis', null);
    evs[Kw] = J(await p.eval(`JSON.stringify(${V}.state())`)).ev.ok;
  }
  check(evs[2] < 60 && evs[3] < 60 && evs[4] === 60, `окна ±2, ±3, ±4: ${evs[2]}, ${evs[3]}, ${evs[4]} из 60 — самое узкое рабочее ±4`);
  check(r.ok && /Самое узкое рабочее окно — ±4 вокселя/.test(r.out), 'миссия 3 засчитана с окном ±4');
  const w4 = await win();
  check(w4.vis && w4.cells.join() === '9,9,9' && /по-разному/.test(w4.note), 'окно ±4: по 9 вокселей, «все три места выглядят по-разному»');
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-window.png', 6);
  await nextMission(p, '#vMis'); await sleep(200);
  await p.eval(`(${V}.setK(3), true)`);
  await p.waitFor(`!!window.__l22.LabVox.st.models[3]`, 60000);
  const tbl = J(await p.eval(`(() => { const X = ${V}, out = []; for (const c of ['upper', 'lower']) { X.setCmd(c); for (let i = 1; i <= 30; i++) { X.setScene(i); const s = X.state(); if (!s.clsShelf) out.push(c + ':' + i); } } X.setScene(0); X.setCmd('upper'); return JSON.stringify(out); })()`));
  check(tbl.length > 0, `свободный режим: с окном ±3 модель выбирает стол в сценах ${tbl.slice(0, 6).join(', ')}`);

  // ---------- 3. Сколько стоит внимание ----------
  console.log('Латенты');
  const C = 'window.__l22.LabCost.api';
  r = await viaUI(p, '#pMis', 1);
  const c1 = J(await p.eval(`JSON.stringify(${C}.state())`));
  check(r.ok && c1.fullBytes > 1e14 && c1.fullBytes < 1e15 && c1.percBytes > 16e9, `миссия 1: все со всеми ${(c1.fullBytes / 1e12).toFixed(0)} ТБ, Perceiver на миллионе токенов ${(c1.percBytes / 1e9).toFixed(0)} ГБ`);
  check(/ставка сыграла/i.test(r.out), 'ставка «сотни терабайт» сыграла');
  await nextMission(p, '#pMis'); await sleep(100);
  const c2 = J(await p.eval(`(${C}.setPatch(5), JSON.stringify(${C}.state()))`));
  check(c2.N === 8077 && c2.percBytes < 16e9 && c2.fullBytes > 16e9 && await critOk(p, '#pMis'), `миссия 2: 8077 токенов, Perceiver ${(c2.percBytes / 1e9).toFixed(2)} ГБ, все со всеми ${(c2.fullBytes / 1e9).toFixed(0)} ГБ`);
  const o2 = await outText(p, '#pMis');
  check(/3,7 ГБ/.test(o2) && /в 4,9 раза/.test(o2) && /в 63 раза/.test(o2), 'разбор миссии 2: 3,7 ГБ, Perceiver дорожает в 4,9 раза, все со всеми — в 63');
  check(/около 3,7 ГБ/.test(await p.eval(`document.querySelector('#perceiver').textContent`)), 'текст после лаборатории называет те же 3,7 ГБ');
  await shot(p, 'perceiver', '#perceiver .lab', 'l22-perceiver.png', 6);
  await nextMission(p, '#pMis'); await sleep(100);
  r = await viaUI(p, '#pMis', 1);
  const c3 = J(await p.eval(`JSON.stringify(${C}.state())`));
  check(r.ok && c3.rotJoint === 373248 && c3.rotAxis === 216, `миссия 3: все сочетания — ${c3.rotJoint}, три оси — ${c3.rotAxis}`);
  const gmax = await p.eval(`(() => { const X = ${C}; X.setPatch(5); X.setLat(2048); let best = 0; for (let g = 20; g <= 200; g += 5) { X.setG(g); if (X.state().percBytes <= 16e9) best = g; } X.setG(100); return best; })()`);
  check(gmax >= 150 && gmax < 200, `свободный режим: самая большая сетка, где Perceiver укладывается в 16 ГБ, — ${gmax}³`);

  // ---------- задача, график, квиз ----------
  console.log('Задача, график, квиз');
  const items = { i1: 'grid', i2: 'text', i3: 'seq', i4: 'lat', i5: 'feat', i6: 'q', i7: 'rot', i8: 'open' };
  for (const [id, z] of Object.entries(items)) await p.eval(`window.__l22.mis.sort.place(${JSON.stringify(id)}, ${JSON.stringify(z)})`);
  await p.eval('window.__l22.mis.sort.check()'); await sleep(100);
  const so = await p.eval('document.querySelector("#shapeSort .c-out").textContent');
  check(/^8 из 8/.test(so), 'задача: ' + so.slice(0, 60));
  await p.shotEl(out('l22-sort.png'), '#shapeSort', 6);
  const T = J(await p.eval(`JSON.stringify({ d: window.__l22.T1.val('peract', 0), nl: window.__l22.T1.val('nolang', 0), c2f: window.__l22.T1.val('c2f', 0), img: window.__l22.T1.val('img', 0) })`));
  check(T.d === 80 && T.nl === 28 && T.c2f === 20 && T.img === 4, `график: «открыть ящик», 100 демонстраций — PerAct ${T.d}, без языка ${T.nl}, C2FARM-BC ${T.c2f}, Image-BC ${T.img}, как в таблице 1`);
  await p.eval(`window.__l22.T1.setHover(0); true`);
  await shot(p, 'results', '#results .chart-card', 'l22-table1.png', 6);
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  const an = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.1); const a = cv.toDataURL(); Anim.seek(cv, 3.7); const b = cv.toDataURL(); return { k: cv.dataset.anim, moves: a !== b, w: cv.width }; }))`));
  check(an.length === 1 && an[0].k === 'peract' && an[0].moves, 'схема пути данных PerAct идёт');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes-dark.png', 6);
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-dark.png', 6);
  await shot(p, 'results', '#results .chart-card', 'l22-table1-dark.png', 6);

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l22.SPEED.k = 60; true');
  await m.eval(`window.__l22.LabVox.api.train().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const over = await m.eval(`JSON.stringify([...document.querySelectorAll('.lab, .chart-card, .card.pad')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => (e.closest('section') || {}).id + ' ' + e.className))`);
  check(over === '[]', 'на телефоне содержимое лабораторий не шире карточек ' + (over === '[]' ? '' : over));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['keyframes', '#keyframes .lab', 'l22-m-keyframes.png'], ['voxels', '#voxels .lab', 'l22-m-voxels.png'], ['perceiver', '#perceiver .lab', 'l22-m-perceiver.png'], ['results', '#results .chart-card', 'l22-m-table1.png'], ['shapes', '#shapeSort', 'l22-m-sort.png']]) await shot(m, id, sel, n, 4);
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
