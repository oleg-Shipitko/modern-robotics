// Проверка урока 1.2: проходит все миссии программно — две Ады и итерация DAgger, 40 подсказок учителя
// (касания сцены через CDP: сначала неудачный выбор у старта, потом удачный), «Ты — эксперт» с эмуляцией
// перехвата мышью, свободный режим, кривая, которую строишь сам, сортировка, порог ансамбля, квиз;
// потом телефон 390 px и тёмная тема. Скриншоты — shots/l12-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-2-dagger.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails.push(msg); };

const missionDone = (p, root) => p.eval(`(() => { const o = document.querySelector(${JSON.stringify(root)} + ' .g-out.m-win'); return !!o && !o.hidden; })()`);
const outText = (p, root) => p.eval(`(document.querySelector(${JSON.stringify(root)} + ' .g-out') || {}).textContent || ''`);
const logText = (p, root) => p.eval(`(document.querySelector(${JSON.stringify(root)} + ' .m-log') || {}).textContent || ''`);
const bet = (p, root, k) => p.eval(`document.querySelectorAll(${JSON.stringify(root)} + ' .m-bet .opts button')[${k}].click()`);
const go = (p, root) => p.eval(`document.querySelector(${JSON.stringify(root)} + ' .g-go').click()`);
async function next(p, root) { await p.eval(`document.querySelector(${JSON.stringify(root)} + ' .g-next').click()`); await sleep(200); }
const waitDone = (p, root, t) => p.waitFor(`(() => { const o = document.querySelector(${JSON.stringify(root)} + ' .g-out'); const b = document.querySelector(${JSON.stringify(root)} + ' .g-go'); return o && !o.hidden && (!b || !b.disabled); })()`, t || 120000);
const setRange = (p, sel, v) => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${v}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const center = (p, sel) => p.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
const sceneRect = (p) => p.eval('(() => { const b = document.querySelector("#scene").getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / 600 }; })()');

/** Касание сцены мышью в координатах плана дома. */
async function tapScene(p, q) {
  const r = await sceneRect(p), x = r.x + q.x * r.s, y = r.y + q.y * r.s;
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
}
/** Эксперт-человек: перехватывает, когда Ада уходит от маршрута, ведёт курсор впереди по маршруту, отпускает на маршруте. */
async function expertTrip(p) {
  const r = await sceneRect(p), PATH = await p.eval('window.__lab.D.PATH');
  let hold = false, took = 0;
  for (let i = 0; i < 700; i++) {
    const st = await p.eval('(() => { const L = window.__lab.st, d = L.drive; return d && L.mode === "expert" ? { x: d.s.x, y: d.s.y, th: d.s.th } : null; })()');
    if (!st) break;
    let bi = 0, bd = 1e9; PATH.forEach((q, k) => { const d = (q[0] - st.x) ** 2 + (q[1] - st.y) ** 2; if (d < bd) { bd = d; bi = k; } });
    const j = Math.min(PATH.length - 1, bi + 1), i0 = Math.max(bi - 1, 0), th = Math.atan2(PATH[j][1] - PATH[i0][1], PATH[j][0] - PATH[i0][0]);
    const dth = Math.abs(Math.atan2(Math.sin(st.th - th), Math.cos(st.th - th))), dist = Math.sqrt(bd);
    const t = PATH[Math.min(PATH.length - 1, bi + 6)], x = r.x + t[0] * r.s, y = r.y + t[1] * r.s;
    if (!hold && (dist > 12 || dth > 0.6)) { await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); hold = true; took++; }
    else if (hold && dist < 4 && dth < 0.2) { await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); hold = false; }
    else if (hold) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
    await sleep(45);
  }
  if (hold) await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return took;
}

(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true && window.__lab && window.__labCtl', 60000);
  console.log('Десктоп 1440, светлая тема');
  const G = '#guide';

  /* ---------- L1: две Ады ---------- */
  console.log('Лаборатория: две Ады');
  await center(p, '#scene');
  await p.waitFor('window.__lab.st.ghost && window.__lab.st.ghost.length === 10', 60000); await sleep(300);
  ok((await p.eval('document.querySelector("#tripGrid").textContent')).includes('6 из 10'), 'на старте видны 10 поездок политики из 1.1: ' + await p.eval('document.querySelector("#tripGrid").textContent'));
  await p.shotEl(out('l12-lab-start.png'), '#lab .lab', 6);
  ok(await p.eval(`document.querySelector('${G} .g-go').disabled`), 'кнопка итерации ждёт ставку');
  await bet(p, G, 0); await go(p, G);
  await p.waitFor('window.__lab.st.playKind === "label" && window.__lab.st.mode === "play" && window.__lab.st.playT > 1.2', 30000);
  await p.shotEl(out('l12-lab-label.png'), '#lab .scene-card', 6);
  await waitDone(p, G, 120000);
  const l1 = await outText(p, G);
  ok(await missionDone(p, G), 'L1: ' + l1.slice(0, 150));
  const grid1 = await p.eval('[...document.querySelectorAll("#tripGrid .tg-row")].map(r => r.querySelector(".tg-label").textContent + " " + r.querySelector(".tg-sum").textContent)');
  ok(grid1.some((x) => x.startsWith('политика из 1.1') && x.includes('6 из 10')) && grid1.some((x) => x.startsWith('после DAgger') && x.includes('10 из 10')), 'одна итерация: ' + grid1.join(' | '));
  ok((await logText(p, G)).includes('+162'), 'журнал: ' + await logText(p, G));
  ok(await p.eval(`document.querySelector('${G} .m-bet .bet-right').textContent.startsWith('одна')`), 'ставка «одна» сыграла');
  await p.shotEl(out('l12-lab-duel.png'), '#lab .lab', 6);

  /* ---------- L2: 40 подсказок ---------- */
  console.log('Лаборатория: 40 подсказок');
  await next(p, G);
  await p.waitFor('window.__lab.st.pick && window.__lab.st.pick.cands.length > 100', 30000);
  await center(p, '#scene'); await sleep(200);
  for (const q of [{ x: 90, y: 318 }, { x: 120, y: 310 }, { x: 150, y: 300 }, { x: 180, y: 293 }]) await tapScene(p, q);
  ok((await p.eval('window.__lab.st.pick.sel.length')) === 40, 'четыре касания у старта — 40 кадров');
  await go(p, G); await waitDone(p, G, 120000);
  ok(!(await missionDone(p, G)), 'подсказки у старта не помогают: ' + (await outText(p, G)).slice(0, 80));
  await p.eval('document.querySelector("#ctlPickClear").click()'); await sleep(100);
  const pre = await p.eval('(() => window.DriveLab.cache.c10.runs.filter(e => e.outcome === "crash").map(e => { const s = e.traj[Math.max(0, e.traj.length - 14)]; return { x: s.x, y: s.y }; }))()');
  for (const q of pre) await tapScene(p, q);
  ok((await p.eval('window.__lab.st.pick.sel.length')) <= 40, `касания перед местами аварий: ${await p.eval('window.__lab.st.pick.sel.length')} кадров`);
  await p.shotEl(out('l12-lab-pick.png'), '#lab .scene-card', 6);
  await go(p, G); await waitDone(p, G, 120000);
  ok(await missionDone(p, G), 'L2: ' + (await outText(p, G)).slice(0, 130));
  ok((await logText(p, G)).split('→').length >= 3, 'журнал двух попыток: ' + await logText(p, G));
  await p.shotEl(out('l12-lab-pick-done.png'), '#lab .lab', 6);

  /* ---------- L3: ты — эксперт ---------- */
  console.log('Лаборатория: ты — эксперт');
  await next(p, G);
  await p.waitFor('window.__lab.st.expert.start && window.__lab.st.model', 30000);
  await center(p, '#scene'); await sleep(200);
  // первая поездка без подсказок: политика из 1.1 врезается
  await go(p, G); await p.waitFor('window.__lab.st.mode === "expert"', 10000);
  await p.waitFor('window.__lab.st.mode !== "expert"', 60000); await waitDone(p, G, 60000);
  ok((await logText(p, G)).includes('врезалась'), 'без подсказок Ада врезается: ' + await logText(p, G));
  let tries = 0;
  while (!(await missionDone(p, G)) && tries < 5) {
    tries++;
    await go(p, G); await p.waitFor('window.__lab.st.mode === "expert"', 10000);
    const took = await expertTrip(p);
    await waitDone(p, G, 60000);
    console.log(`    поездка с подсказками ${tries}: перехватов мышью ${took}`);
  }
  ok(await missionDone(p, G), `L3 за ${tries} ${tries === 1 ? 'попытку' : 'попытки'}: ` + (await outText(p, G)).slice(0, 140));
  console.log('    журнал:', await logText(p, G));
  await p.shotEl(out('l12-lab-expert.png'), '#lab .lab', 6);

  /* ---------- L4: свободный режим ---------- */
  await next(p, G);
  ok(await p.eval('!document.querySelector("#freePanel").hidden'), 'свободный режим: ручки видны');
  await p.eval('document.querySelector("#btnBC").click()'); await sleep(300);
  await p.waitFor('window.__lab.st.mode === "idle" && window.__lab.st.dagIt === 0', 30000);
  await center(p, '#scene');
  await p.eval('document.querySelector("#btnDagger").click()'); await sleep(300);
  await p.waitFor('window.__lab.st.mode === "idle" && window.__lab.st.dagIt === 1', 60000);
  await p.eval('document.querySelector("#btnRun").click()'); await sleep(300);
  await p.waitFor('window.__lab.st.mode === "idle"', 60000);
  ok((await p.eval('document.querySelector("#history").textContent')).includes('DAgger ×1 → 10 из 10'), 'свободный режим: ' + await p.eval('document.querySelector("#history").textContent'));

  /* ---------- кривая ---------- */
  console.log('Кривая, которую строишь сам');
  const C = '#curveGuide';
  await center(p, '#curve .lab');
  await p.eval('document.querySelector("#ccDG [data-it=\'1\']").click()'); await p.waitFor('!window.__curve.state().busy && window.__curve.state().dg.length === 2', 60000);
  ok(!(await missionDone(p, C)), 'одна итерация — ещё не 100%: ' + await p.eval('document.querySelector("#curveStatus").textContent'));
  await p.eval('document.querySelector("#ccDG [data-it=\'3\']").click()'); await p.waitFor('!window.__curve.state().busy && window.__curve.state().dg.length === 4', 60000);
  await p.eval('document.querySelector("#ccBC [data-n=\'40\']").click()'); await p.waitFor('!window.__curve.state().busy && window.__curve.state().bc40', 60000);
  const cs = await p.eval('window.__curve.state()');
  ok(cs.dg100 && cs.dg100.x === 1558 && cs.dg100.it === 3, `DAgger 100% на ${cs.dg100 && cs.dg100.x} примерах (итерация ${cs.dg100 && cs.dg100.it})`);
  ok(cs.bc40 && cs.bc40.x === 8130 && cs.bc40.ok === 10, `BC на 40 демонстрациях: ${cs.bc40 && cs.bc40.ok * 5}% на ${cs.bc40 && cs.bc40.x}`);
  ok(cs.dg.map((q) => q.ok * 5).join(',') === '60,90,80,100', 'точки DAgger: ' + cs.dg.map((q) => q.ok * 5 + '%').join(', '));
  ok(await missionDone(p, C), 'миссия кривой: ' + (await outText(p, C)).slice(0, 140));
  for (const n of [5, 10, 20]) { await p.eval(`document.querySelector("#ccBC [data-n='${n}']").click()`); await p.waitFor(`!window.__curve.state().busy && window.__curve.state().bc.some(q => q.n === ${n})`, 60000); }
  console.log('    BC:', (await p.eval('window.__curve.state().bc')).map((q) => `${q.n}→${q.ok * 5}%`).join(', '));
  await p.shotEl(out('l12-curve.png'), '#curve .lab', 6);

  /* ---------- сортировка ---------- */
  console.log('Сортировка');
  await center(p, '#sortBox'); await sleep(150);
  const box = (sel) => p.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const a1 = await box('#sortBox [data-id=hg]'), b1 = await box('#sortBox .c-zone[data-zone=human]');
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a1.x, y: a1.y, button: 'left', clickCount: 1 });
  for (let t = 1; t <= 8; t++) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a1.x + (b1.x - a1.x) * t / 8, y: a1.y + (b1.y - a1.y) * t / 8, button: 'left' });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b1.x, y: b1.y, button: 'left', clickCount: 1 }); await sleep(100);
  ok(await p.eval('!!document.querySelector("#sortBox .c-zone[data-zone=human] [data-id=hg]")'), 'карточка перетащена мышью');
  for (const [id, z] of [['dagger', 'all'], ['thrifty', 'robot'], ['lab', 'human'], ['safe', 'robot'], ['mario', 'all'], ['diseng', 'human'], ['tau', 'human']]) await p.eval(`window.__sort.place('${id}', '${z}')`);
  await p.eval('window.__sort.check()'); await sleep(100);
  const so = await p.eval('document.querySelector("#sortBox .c-out").textContent');
  ok(so.startsWith('7 из 8'), 'сортировка с одной ошибкой: ' + so.slice(0, 110));
  await p.shotEl(out('l12-sort.png'), '#sortBox', 6);

  /* ---------- бюджет внимания ---------- */
  console.log('Бюджет внимания');
  const E = '#ensGuide';
  await center(p, '#budget .lab');
  await p.click('#ensTrain'); await p.waitFor('window.__budget.state().ready', 60000);
  let bs = await p.eval('window.__budget.state()');
  ok(!(await missionDone(p, E)), `порог 0,158: помощь ${bs.help}, аварий ${bs.crash} — миссия не выполнена`);
  await setRange(p, '#ensTau', -1.25); bs = await p.eval('window.__budget.state()');
  ok(!(await missionDone(p, E)), `порог 0,056: помощь ${bs.help}, аварий ${bs.crash}`);
  await setRange(p, '#ensTau', -1.4); bs = await p.eval('window.__budget.state()');
  ok(!(await missionDone(p, E)), `порог 0,040: помощь ${bs.help}, аварий ${bs.crash}`);
  await setRange(p, '#ensTau', -1.3); bs = await p.eval('window.__budget.state()');
  ok(bs.help === 84 && bs.crash === 1, `порог 0,050: помощь ${bs.help}, аварий ${bs.crash}, шагов ${bs.steps}`);
  ok(await missionDone(p, E), 'миссия бюджета: ' + (await outText(p, E)).slice(0, 140));
  await p.shotEl(out('l12-budget.png'), '#budget .lab', 6);

  /* ---------- квиз ---------- */
  const qn = await p.eval('document.querySelectorAll("#quizBox .q-card").length');
  for (let i = 0; i < qn; i++) await p.eval(`document.querySelectorAll("#quizBox .q-card")[${i}].querySelectorAll(".q-opt")[1].click()`);
  ok((await p.eval('document.querySelector("#quizScore").textContent')).startsWith('Итог'), 'квиз: ' + await p.eval('document.querySelector("#quizScore").textContent'));
  const deskLogs = p.logs.slice();
  await B.close();

  /* ---------- телефон 390 ---------- */
  console.log('Телефон 390 × 844');
  const M = await launch({ w: 390, h: 844 });
  const m = await M.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true && window.__labCtl', 60000);
  ok((await m.eval('document.documentElement.scrollWidth')) === 390, 'ширина страницы 390: ' + await m.eval('document.documentElement.scrollWidth'));
  await m.waitFor('window.__lab.st.ghost && window.__lab.st.ghost.length === 10', 60000);
  await bet(m, G, 0); await go(m, G); await sleep(2500);
  const sr = await m.eval('(() => { const r = document.querySelector("#scene").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight }; })()');
  ok(sr.top >= -2 && sr.bottom <= sr.ih + 2, `миссия прокрутила к сцене (${JSON.stringify(sr)})`);
  await waitDone(m, G, 180000);
  await m.shotEl(out('l12-m-lab.png'), '#lab .lab', 4);
  await m.eval('document.querySelector("#ccBC [data-n=\'10\']").click()'); await m.waitFor('!window.__curve.state().busy && window.__curve.state().bc.length === 1', 60000);
  await m.eval('document.querySelector("#ccDG [data-it=\'1\']").click()'); await m.waitFor('!window.__curve.state().busy && window.__curve.state().dg.length === 2', 60000);
  await m.shotEl(out('l12-m-curve.png'), '#curve .lab', 4);
  await m.shotEl(out('l12-m-sort.png'), '#sortBox', 4);
  await center(m, '#budget .lab'); await m.click('#ensTrain'); await m.waitFor('window.__budget.state().ready', 60000); await setRange(m, '#ensTau', -1.3);
  await m.shotEl(out('l12-m-budget.png'), '#budget .lab', 4);
  ok((await m.eval('document.documentElement.scrollWidth')) === 390, 'ширина после интерактивов: ' + await m.eval('document.documentElement.scrollWidth'));
  const mobLogs = m.logs.slice();
  await M.close();

  /* ---------- тёмная тема ---------- */
  console.log('Тёмная тема');
  const Dk = await launch({ w: 1440, h: 1000 });
  const d = await Dk.page(URL0, { width: 1440, height: 1000, dark: true });
  await d.waitFor('window.__lessonReady === true && window.__labCtl', 60000);
  ok(await d.eval('document.documentElement.dataset.theme === "dark"'), 'тема тёмная');
  await center(d, '#scene'); await d.waitFor('window.__lab.st.ghost && window.__lab.st.ghost.length === 10', 60000);
  await bet(d, G, 1); await go(d, G); await waitDone(d, G, 180000);
  await d.shotEl(out('l12-dark-duel.png'), '#lab .lab', 6);
  await center(d, '#budget .lab'); await d.click('#ensTrain'); await d.waitFor('window.__budget.state().ready', 60000); await setRange(d, '#ensTau', -1.3);
  await d.shotEl(out('l12-dark-budget.png'), '#budget .lab', 6);
  await d.eval('document.querySelector("#ccDG [data-it=\'2\']").click()'); await d.waitFor('!window.__curve.state().busy && window.__curve.state().dg.length === 3', 60000);
  await d.shotEl(out('l12-dark-curve.png'), '#curve .lab', 6);
  const darkLogs = d.logs.slice();
  await Dk.close();

  const logs = [...deskLogs, ...mobLogs, ...darkLogs];
  ok(!logs.length, 'консоль без ошибок' + (logs.length ? ': ' + logs.join(' | ') : ''));
  console.log(fails.length ? `\nНе прошло: ${fails.length}` : '\nВсе проверки прошли');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
