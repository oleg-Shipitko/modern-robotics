// Проверка урока 1.1: проходит все миссии программно (мини-ALVINN, лаборатория, отладчик, калькулятор),
// эмулирует свою поездку мышью и перетаскивание старта через CDP, сортировку, квиз,
// потом телефон 390 px и тёмную тему. Скриншоты — shots/l11-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-1-behavior-cloning.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails.push(msg); };

async function missionDone(p, root) { return p.eval(`!!document.querySelector(${JSON.stringify(root)} + ' .g-out.m-win') && !document.querySelector(${JSON.stringify(root)} + ' .g-out.m-win').hidden`); }
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${JSON.stringify(root)} + ' .m-crit li')].map(l => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(document.querySelector(${JSON.stringify(root)} + ' .g-out') || {}).textContent || ''`); }
async function bet(p, root, k) { await p.eval(`document.querySelectorAll(${JSON.stringify(root)} + ' .m-bet .opts button')[${k}].click()`); }
async function go(p, root) { await p.eval(`document.querySelector(${JSON.stringify(root)} + ' .g-go').click()`); }
async function next(p, root) { await p.eval(`document.querySelector(${JSON.stringify(root)} + ' .g-next').click()`); await sleep(150); }
async function waitDone(p, root, t) { await p.waitFor(`(() => { const o = document.querySelector(${JSON.stringify(root)} + ' .g-out'); const b = document.querySelector(${JSON.stringify(root)} + ' .g-go'); return o && !o.hidden && (!b || !b.disabled); })()`, t || 120000); }
const setRange = (p, sel, v) => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${v}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const center = (p, sel) => p.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);

/** Своя поездка: ведём курсор по маршруту учителя с упреждением, как человек. */
async function driveTrip(p) {
  await center(p, '#scene'); await sleep(200);
  const r = await p.eval('(() => { const b = document.querySelector("#scene").getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / 600 }; })()');
  const PATH = await p.eval('window.__lab.D.PATH');
  for (let i = 0; i < 500; i++) {
    const st = await p.eval('(() => { const d = window.__lab.st.drive; return d && window.__lab.st.mode === "record" ? { x: d.s.x, y: d.s.y } : null; })()');
    if (!st) break;
    let bi = 0, bd = 1e9; PATH.forEach((q, k) => { const d = (q[0] - st.x) ** 2 + (q[1] - st.y) ** 2; if (d < bd) { bd = d; bi = k; } });
    const t = PATH[Math.min(PATH.length - 1, bi + 6)];
    await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + t[0] * r.s, y: r.y + t[1] * r.s });
    await sleep(50);
  }
}
/** Перетаскивание мышью из точки a в b (в координатах сцены). */
async function dragScene(p, a, b) {
  const r = await p.eval('(() => { const b = document.querySelector("#scene").getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / 600 }; })()');
  const X = (q) => ({ x: r.x + q.x * r.s, y: r.y + q.y * r.s });
  const A = X(a), B2 = X(b);
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: A.x, y: A.y, button: 'left', clickCount: 1 });
  for (let t = 1; t <= 10; t++) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: A.x + (B2.x - A.x) * t / 10, y: A.y + (B2.y - A.y) * t / 10, button: 'left' });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: B2.x, y: B2.y, button: 'left', clickCount: 1 });
}

(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true && window.__lab && window.__labCtl', 60000);
  console.log('Десктоп 1440, светлая тема');

  /* ---------- мини-ALVINN ---------- */
  console.log('Мини-ALVINN');
  const A = '#alvGuide';
  await center(p, '#alvinn .lab');
  ok(await p.eval(`document.querySelector('${A} .g-go').disabled`), 'кнопка обучения заблокирована до ставки');
  ok(await p.eval('document.querySelector("#alvShiftWrap").hidden && !document.querySelector("#alvCurveWrap").hidden'), 'в первой миссии видна только ручка изгиба');
  await bet(p, A, 0); await go(p, A); await waitDone(p, A, 60000);
  ok(await missionDone(p, A), 'A1 «Обучи»: ' + (await outText(p, A)).slice(0, 110));
  ok((await p.eval(`document.querySelector('${A} .m-bet .bet-right') ? document.querySelector('${A} .m-bet .bet-right').textContent : ''`)).includes('Да'), 'ставка «да» сыграла');
  await next(p, A);
  ok(!(await p.eval('document.querySelector("#alvShiftWrap").hidden')), 'A2: появилась ручка смещения');
  await setRange(p, '#alvShift', 0.3); await setRange(p, '#alvCurve', -1);
  ok(!(await missionDone(p, A)), `A2: в пределах обучения (смещение 0,3) сеть не ошибается на 3 деления (ошибка ${await p.eval('window.__alv.state().err')})`);
  await setRange(p, '#alvShift', -0.8); await setRange(p, '#alvCurve', -0.8);
  ok(await missionDone(p, A), `A2 «Найди ошибку»: ошибка ${await p.eval('window.__alv.state().err')} деления при смещении −0,8`);
  await p.shotEl(out('l11-alvinn-error.png'), '#alvinn .lab', 6);
  await next(p, A);
  await p.eval('document.querySelector("#alvFork").click()'); await sleep(50);
  await setRange(p, '#alvCurve', -0.4); await setRange(p, '#alvCurve', 0.0);
  ok(await missionDone(p, A), 'A3 «Развилка»: сеть сворачивала в обе ветки');
  await p.shotEl(out('l11-alvinn.png'), '#alvinn .lab', 6);

  /* ---------- лаборатория ---------- */
  console.log('Лаборатория «Ты — оператор»');
  const G = '#guide';
  await center(p, '#scene');
  ok(await p.eval('document.querySelector("#ctlView").hidden && document.querySelector("#freePanel").hidden'), 'M1: ручки спрятаны');
  await go(p, G); await sleep(200);
  await driveTrip(p);
  await waitDone(p, G, 60000);
  ok(await missionDone(p, G), 'M1 «Своя поездка»: ' + (await outText(p, G)).slice(0, 90));
  ok(await p.eval('window.__lab.st.demos.filter(d => d.mine).length === 1'), 'поездка записана в данные');
  ok((await p.eval(`document.querySelector('${G} .m-log').textContent`)).includes('доехала'), 'журнал попыток: ' + await p.eval(`document.querySelector('${G} .m-log').textContent`));
  await p.shotEl(out('l11-lab-m1.png'), '#lab .lab', 6);
  await next(p, G);
  ok(!(await p.eval('document.querySelector("#ctlRobot").hidden')), 'M2: появились «+10 поездок робота» и кривая обучения');
  await bet(p, G, 1); await go(p, G); await waitDone(p, G, 120000);
  const m2 = await outText(p, G);
  ok(await missionDone(p, G), 'M2 «Обучи и отпусти»: ' + m2.slice(0, 120));
  ok(await p.eval('!document.querySelector("#tripGrid").hidden && document.querySelectorAll("#tripGrid .tg-cell.ok, #tripGrid .tg-cell.no").length === 10'), 'сетка ✓/✗ заполнена: ' + await p.eval('document.querySelector("#tripGrid").textContent'));
  await p.shotEl(out('l11-lab-m2.png'), '#lab .lab', 6);
  await next(p, G);
  // ищем старты-отказы для текущей политики прямо на странице
  const cands = await p.eval(`(() => {
    const L = window.__lab, D = L.D, st = L.st, pol = D.policy(st.model), pts = [];
    st.demos.forEach((d) => d.traj.forEach((s, i) => { if (i % 4 === 0) pts.push(s); }));
    const res = [], near = [];
    for (const q of pts) for (const dth of [0.5, -0.5, 0.8, -0.8, 1.2, -1.2]) {
      const pose = { x: q.x, y: q.y, th: q.th + dth };
      if (D.collides(pose.x, pose.y) || Math.hypot(pose.x - D.GOAL.x, pose.y - D.GOAL.y) < 70 || pose.x < 25 || pose.y < 25 || pose.x > 575 || pose.y > 375) continue;
      const ep = D.rollout(pol, { start: pose, noise: 0 });
      if (ep.outcome !== 'goal' && !res.some((r) => Math.hypot(r.x - pose.x, r.y - pose.y) < 45)) res.push(pose);
      if (res.length >= 4) return res;
    }
    return res;
  })()`);
  ok(cands.length >= 3, `найдено стартов-отказов для проверки: ${cands.length}`);
  // первый — перетаскиванием Ады мышью (UI), с поворотом за кружок
  await center(p, '#scene'); await sleep(150);
  await dragScene(p, { x: 80, y: 320 }, { x: cands[0].x, y: cands[0].y }); await sleep(100);
  await p.waitFor('window.__lab.st.mode === "idle" && window.__lab.st.probe && window.__lab.st.probe.results.length >= 1', 30000);
  const pose0 = await p.eval('window.__lab.st.probe.pose');
  await dragScene(p, { x: pose0.x + Math.cos(pose0.th) * 40, y: pose0.y + Math.sin(pose0.th) * 40 }, { x: pose0.x + Math.cos(cands[0].th) * 40, y: pose0.y + Math.sin(cands[0].th) * 40 }); await sleep(100);
  await p.waitFor('window.__lab.st.mode === "idle" && window.__lab.st.probe.results.length >= 2', 30000);
  ok(Math.abs(await p.eval('window.__lab.st.probe.pose.th') - cands[0].th) < 0.15, 'поворот за кружок работает');
  for (const c of cands.slice(1, 4)) { await p.eval(`window.DriveLab.probeRun(${JSON.stringify(c)})`, true); await sleep(50); }
  await sleep(200);
  const ps = await p.eval('window.DriveLab.probeStats()');
  ok(await missionDone(p, G), `M3 «Сломай политику»: стартов ${ps.tested}, отказов ${ps.fails}, рядом с данными ${ps.failsNear}, мест ${ps.distinct}`);
  await p.shotEl(out('l11-lab-break.png'), '#lab .lab', 6);
  await next(p, G);
  ok(await p.eval('window.__lab.st.layout === "grid"'), 'M4: сцена разделилась на 4 панели');
  await bet(p, G, 1); await go(p, G); await waitDone(p, G, 180000);
  const rows = await p.eval('[...document.querySelectorAll("#tripGrid .tg-row")].map(r => r.querySelector(".tg-label").textContent + " " + r.querySelector(".tg-sum").textContent)');
  ok(await missionDone(p, G), 'M4 «Почини данными»: ' + rows.join(' | '));
  const want = { '10 аккуратных': 6, '30 аккуратных': 5, 'шумный оператор': 10, 'боковые сдвиги': 10 };
  rows.forEach((r) => { const k = Object.keys(want).find((x) => r.startsWith(x)); if (k) ok(r.includes(`${want[k]} из 10`), `цифра «${k}» совпадает с текстами: ${r}`); });
  ok(await p.eval(`document.querySelector('${G} .m-bet .bet-right').textContent.includes('шумный')`), 'ставка «шумный оператор» верна');
  await p.shotEl(out('l11-lab-compare.png'), '#lab .lab', 6);
  await next(p, G);
  ok(await p.eval('!document.querySelector("#freePanel").hidden && !document.querySelector("#ctlView").hidden'), 'свободный режим: все ручки видны');
  await p.eval('document.querySelector("#btnClear").click()'); await sleep(50);
  await p.eval('document.querySelector("#optDart").click()'); await p.eval('document.querySelector("#btnDemos").click()'); await sleep(50);
  await p.eval('document.querySelector("#btnTrain").click()'); await p.waitFor('window.__lab.st.mode === "idle" && window.__lab.st.model', 60000);
  await center(p, '#scene'); await p.eval('document.querySelector("#btnRun").click()'); await sleep(200);
  await p.waitFor('window.__lab.st.mode === "idle"', 60000);
  ok((await p.eval('document.querySelector("#history").textContent')).includes('шумный оператор → 10 из 10'), 'свободный режим: ' + await p.eval('document.querySelector("#history").textContent'));
  await p.shotEl(out('l11-lab-free.png'), '#lab .lab', 6);

  /* ---------- отладчик ---------- */
  console.log('Авария кадр за кадром');
  const Dg = '#dbgGuide';
  await center(p, '#why .lab'); await p.waitFor('window.__dbg.state().ready', 60000);
  const key = await p.eval('window.__dbg.key');
  ok(key && key.i1 > 0 && key.i2 > key.i1, `ключевые кадры: первая ошибка > 0,3 на кадре ${key.i1} (${(key.e1).toFixed(2)} рад/с), > 1 на кадре ${key.i2} (${key.n2.toFixed(0)} см от данных), всего ${key.n}`);
  await p.click('#dbgPlay'); await sleep(1500);
  ok(!(await missionDone(p, Dg)), 'проигрывание само миссию не засчитывает');
  await setRange(p, '#dbgT', key.i1);
  ok((await crit(p, Dg)).startsWith('ok'), 'первый критерий: кадр ' + key.i1);
  // второй — перетаскиванием по графику
  const cr = await p.eval('(() => { const b = document.querySelector("#dbgChart").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()');
  const tx = cr.x + (48 + (590 - 48) * (key.i2 + 8) / (key.n - 1)) / 600 * cr.w;
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx - 30, y: cr.y + cr.h / 2, button: 'left', clickCount: 1 });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: cr.y + cr.h / 2, button: 'left' });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: cr.y + cr.h / 2, button: 'left', clickCount: 1 });
  await sleep(200);
  ok(await missionDone(p, Dg), 'миссия отладчика: ' + (await outText(p, Dg)).slice(0, 140));
  await p.shotEl(out('l11-debugger.png'), '#why .lab', 6);

  /* ---------- калькулятор εT² ---------- */
  console.log('Калькулятор εT²');
  const S = '#sqGuide';
  await center(p, '#square .lab');
  ok(await p.eval('document.querySelector("#sqKWrap").hidden'), 'S1: ручка k спрятана');
  await setRange(p, '#sqEps', -4.3);
  ok(!(await missionDone(p, S)), `при ε = 0,005% ещё не меньше одной ошибки (${(await p.eval('window.__sq.state().bc')).toFixed(2)})`);
  await setRange(p, '#sqEps', -4.4);
  ok(await missionDone(p, S), 'S1 «Точность»: ' + (await outText(p, S)).slice(0, 110));
  await next(p, S);
  await setRange(p, '#sqEps', -3); await setRange(p, '#sqK', 6);
  ok(!(await missionDone(p, S)), 'k = 6 при ε = 0,1% ещё мало');
  await setRange(p, '#sqK', 5);
  ok(await missionDone(p, S), 'S2 «Возвраты»: ' + (await outText(p, S)).slice(0, 110));
  await p.shotEl(out('l11-square.png'), '#square .lab', 6);

  /* ---------- сортировка ---------- */
  console.log('Сортировка');
  await center(p, '#sortBox'); await sleep(150);
  const box = async (sel) => p.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const a1 = await box('#sortBox [data-id=dart]'), b1 = await box('#sortBox .c-zone[data-zone=help]');
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a1.x, y: a1.y, button: 'left', clickCount: 1 });
  for (let t = 1; t <= 8; t++) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a1.x + (b1.x - a1.x) * t / 8, y: a1.y + (b1.y - a1.y) * t / 8, button: 'left' });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b1.x, y: b1.y, button: 'left', clickCount: 1 }); await sleep(100);
  ok(await p.eval('!!document.querySelector("#sortBox .c-zone[data-zone=help] [data-id=dart]")'), 'карточка перетащена мышью');
  for (const [id, z] of [['more', 'little'], ['hist', 'harm'], ['shift', 'help'], ['longer', 'little'], ['cams', 'help'], ['lamp', 'harm'], ['bad', 'little']]) await p.eval(`window.__sort.place('${id}', '${z}')`);
  await p.eval('window.__sort.check()'); await sleep(100);
  const so = await p.eval('document.querySelector("#sortBox .c-out").textContent');
  ok(so.startsWith('7 из 8'), 'сортировка с одной ошибкой: ' + so.slice(0, 120));
  await p.shotEl(out('l11-sort.png'), '#sortBox', 6);

  /* ---------- квиз ---------- */
  const qn = await p.eval('document.querySelectorAll("#quizBox .q-card").length');
  for (let i = 0; i < qn; i++) await p.eval(`document.querySelectorAll("#quizBox .q-card")[${i}].querySelector(".q-opt").click()`);
  ok((await p.eval('document.querySelector("#quizScore").textContent')).startsWith('Итог'), 'квиз: ' + await p.eval('document.querySelector("#quizScore").textContent'));
  console.log('Ширина десктопа:', await p.eval('document.documentElement.scrollWidth'));
  const deskLogs = p.logs.slice();
  await B.close();

  /* ---------- телефон 390 ---------- */
  console.log('Телефон 390 × 844');
  const M = await launch({ w: 390, h: 844 });
  const m = await M.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true && window.__labCtl', 60000);
  ok((await m.eval('document.documentElement.scrollWidth')) === 390, 'ширина страницы 390: ' + await m.eval('document.documentElement.scrollWidth'));
  await m.shotEl(out('l11-m-alvinn.png'), '#alvinn .lab', 4);
  await m.eval('window.__labCtl.goto(3)'); await sleep(100);
  await m.eval(`document.querySelectorAll('#guide .m-bet .opts button')[1].click()`);
  await m.eval(`document.querySelector('#guide .g-go').click()`);
  await sleep(2500);
  const sr = await m.eval('(() => { const r = document.querySelector("#scene").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight }; })()');
  ok(sr.top >= -2 && sr.bottom <= sr.ih + 2, `на телефоне миссия прокрутила к сцене (${JSON.stringify(sr)})`);
  await waitDone(m, '#guide', 180000);
  await m.shotEl(out('l11-m-lab-compare.png'), '#lab .lab', 4);
  await m.waitFor('window.__dbg.state().ready', 60000); await setRange(m, '#dbgT', 50);
  await m.shotEl(out('l11-m-debugger.png'), '#why .lab', 4);
  await m.shotEl(out('l11-m-square.png'), '#square .lab', 4);
  ok((await m.eval('document.documentElement.scrollWidth')) === 390, 'ширина после интерактивов: ' + await m.eval('document.documentElement.scrollWidth'));
  const mobLogs = m.logs.slice();
  await M.close();

  /* ---------- тёмная тема ---------- */
  console.log('Тёмная тема');
  const Dk = await launch({ w: 1440, h: 1000 });
  const d = await Dk.page(URL0, { width: 1440, height: 1000, dark: true });
  await d.waitFor('window.__lessonReady === true && window.__labCtl', 60000);
  ok(await d.eval('document.documentElement.dataset.theme === "dark"'), 'тема тёмная');
  await d.eval('window.__labCtl.goto(3)'); await sleep(100);
  await d.eval(`document.querySelectorAll('#guide .m-bet .opts button')[0].click()`);
  await center(d, '#scene'); await d.eval(`document.querySelector('#guide .g-go').click()`);
  await waitDone(d, '#guide', 180000);
  await d.shotEl(out('l11-dark-compare.png'), '#lab .lab', 6);
  await d.waitFor('window.__dbg.state().ready', 60000); await setRange(d, '#dbgT', 70);
  await d.shotEl(out('l11-dark-debugger.png'), '#why .lab', 6);
  await d.shotEl(out('l11-dark-alvinn.png'), '#alvinn .lab', 6);
  const darkLogs = d.logs.slice();
  await Dk.close();

  const logs = [...deskLogs, ...mobLogs, ...darkLogs];
  ok(!logs.length, 'консоль без ошибок' + (logs.length ? ': ' + logs.join(' | ') : ''));
  console.log(fails.length ? `\nНе прошло: ${fails.length}` : '\nВсе проверки прошли');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
