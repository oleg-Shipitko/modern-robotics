// Проверка урока 1.3: сначала цифры движка в Node, потом все интерактивы в браузере —
// прогноз и опыт «больше данных», рисование объездов мышью, калибровка, бины,
// лаборатория (пять миссий и свободный режим), стыки пачек, квиз; тёмная тема и
// телефон 390 px. Снимки — в shots/l13-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const K = require('../lessons/shared/kettle-core.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-3-multimodalnost-deystviy.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f1 = (v, d) => (+v).toFixed(d == null ? 1 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры движка в Node ---------- */
const NODE = {};
function nodeNumbers() {
  console.log('Node: цифры движка');
  const k = K.KETTLE, D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
  let gap = 1e9; for (const d of D.demos) for (let t = 0; t <= K.T; t++) gap = Math.min(gap, Math.hypot(d.xs[t] - k.x, K.START.y - K.V * t - k.y) - K.RA - K.RK);
  check(D.nLeft === 20 && D.nRight === 20 && gap > 15, `демонстрации: 20 слева, 20 справа, ближе всего к чайнику ${f1(gap)} см`);
  const reg = K.finish(K.trainReg13(D.demos)), gmm = K.finish(K.trainGMM13(D.demos, 2)), dif = K.diff13(D.demos);
  const br = K.batch13(reg, k, 10, 1), bg = K.batch13(gmm, k, 10, 1, { mode: 'chunk', H: 32 }), bd = K.batch13(dif, k, 10, 1);
  check(br.touches === 10 && bg.touches === 0 && bd.touches === 0 && bg.left > 0 && bg.right > 0 && bd.left > 0 && bd.right > 0, `М1: регрессия ${br.touches}/10 касаний, смесь ${bg.touches} (слева ${bg.left}, справа ${bg.right}), диффузия ${bd.touches} (${bd.left}/${bd.right})`);
  const sh = {}; for (const p of [0.7, 0.75, 0.8, 0.85]) { const DD = K.makeDemos({ n: 40, pLeft: p, seed: 1 }); sh[p] = K.batch13(K.finish(K.trainReg13(DD.demos)), k, 10, 1).touches; }
  check(sh[0.7] > 0 && sh[0.75] > 0 && sh[0.8] === 0 && sh[0.85] === 0, `М2: касания регрессии при 70/75/80/85% слева — ${sh[0.7]}, ${sh[0.75]}, ${sh[0.8]}, ${sh[0.85]}`);
  NODE.m2 = sh;
  const kd = { x: 275, y: 130 }, Dd = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle: kd }), rd = K.batch13(K.finish(K.trainReg13(Dd.demos)), kd, 10, 1);
  check(!Dd.open.left && Dd.open.right && K.onRoute(kd) && rd.touches === 0 && K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle: { x: 300, y: 130 } }).blocked, `М3: чайник у края проёма (275; 130) — слева закрыто, все ${Dd.nRight} справа, регрессия ${rd.touches}/10; посередине проёма проезда нет`);
  let ok2 = 0, ok3 = 0; for (let b = 0; b < 30; b++) { const B = K.batch13(gmm, k, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 2)) ok2++; if (B.runs.some((q) => q.touch && q.sw >= 3)) ok3++; }
  check(ok2 === 30, `М4: в ${ok2} пачках прогонов из 30 есть касание с двумя сменами стороны (с тремя — в ${ok3})`);
  const h16 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 16 }).touches, h18 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 18 }).touches, h14 = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H: 14 }).touches;
  check(h16 > 20 && h14 > 20 && h18 === 0, `М5: касаний смеси на 100 прогонов — пачка 14: ${h14}, 16: ${h16}, 18: ${h18}`);
  // «больше данных»: те же зёрна, что в браузере
  const NS = [10, 40, 200, 1000]; NODE.md = [];
  for (const N of NS) { let crash = 0, miss = 0; for (let j = 0; j < 20; j++) { const DD = K.moreDataDemos(N, j); const rg = K.finish(K.trainReg13(DD.demos, { iters: K.MD.iters, seed: 3 + j })); const q = K.moreDataRun(rg, j); if (q.touch) crash++; miss += q.miss; } NODE.md.push({ crash, miss: miss / 20 }); }
  check(NODE.md[0].crash < 20 && NODE.md.slice(1).every((r) => r.crash === 20) && NODE.md[3].miss < NODE.md[0].miss, `больше данных: касаний ${NODE.md.map((r) => r.crash).join(', ')} из 20; промах ${NODE.md.map((r) => f1(r.miss)).join(', ')} см`);
  const Hb = K.binsHist(K.binsData(4)), ind = [], ar = []; for (let s = 1; s <= 5; s++) { ind.push(K.binsSample(Hb, 'ind', 100, 1000 + s).bad); ar.push(K.binsSample(Hb, 'ar', 100, 1000 + s).bad); }
  check(ind.every((v) => v > 35 && v < 65) && ar.every((v) => v === 0), `бины: в пустых углах независимые ${ind.join(', ')}, авторегрессия ${ar.join(', ')}`);
  const sn = K.seamsBatch('naive', 20, 1), st = K.seamsBatch('te', 20, 21), sb = K.seamsBatch('bid', 20, 41);
  check(sn.touches >= 15 && st.touches >= 12 && sb.touches === 0 && sb.maxSw === 0 && sb.passes === 2 && st.passes === 0.25, `стыки: касаний последняя пачка ${sn.touches}, сглаживание ${st.touches}, согласование ${sb.touches} из 20; проходов на шаг ${st.passes} и ${sb.passes}`);
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l13.mis.${key}.ctx.done[window.__l13.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(120); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) { await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`); await sleep(150); await p.waitFor(`!window.__l13.mis.${key}.busy`, 120000); await sleep(80); }
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

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" && !document.querySelector(".c-sort")'), 'нет пошаговых карточек и сортировки карточек');
  await p.shotEl(out('l13-hero.png'), '#top', 0);

  // --- 1. прогноз и опыт
  await center(p, '#mdPlot');
  check(await p.eval('document.querySelector("#mdGo").disabled'), 'прогноз: кнопка опыта заблокирована, пока прогноз не нарисован');
  // тянем первую точку мышью до 18, остальные задаём через api
  const a0 = await p.eval(`(() => { const cv = document.querySelector('#mdPlot'), r = cv.getBoundingClientRect(); return { r: { l: r.left, t: r.top, w: r.width } }; })()`);
  const kx = a0.r.w / 420, px0 = a0.r.l + (Math.max(30, 10 + 2 * 6.6 / kx) + 28) * kx, pyMid = a0.r.t + (12 + (250 - Math.max(22, 15 / kx) - 12) / 2) * kx;
  await mouseDrag(p, [{ x: px0, y: pyMid }, { x: px0, y: pyMid - 20 }, { x: px0, y: pyMid - 50 }]);
  const fc0 = await p.eval('window.__l13.MoreData.st.fc[0]');
  check(fc0 != null && fc0 > 10, `прогноз: первая точка перетащена мышью → ${fc0}`);
  for (const [i, v] of [[1, 12], [2, 8], [3, 4]]) await p.eval(`window.__l13.MoreData.setFc(${i}, ${v})`);
  check(!(await p.eval('document.querySelector("#mdGo").disabled')) && (await p.eval('[...document.querySelectorAll("#mdCrit li")].map((l) => l.className).join(",")')) === 'ok,wait', 'прогноз нарисован: кнопка доступна, первый критерий выполнен');
  await p.shotEl(out('l13-forecast.png'), '#kettle .md-grid', 6);
  const t0 = Date.now(); await p.click('#mdGo');
  await p.waitFor('!window.__l13.MoreData.st.busy && window.__l13.MoreData.st.res.every(Boolean)', 180000);
  const md = await p.eval('window.__l13.MoreData.st.res.map((r) => ({ crash: r.crash, miss: r.miss }))');
  check(md.every((r, i) => r.crash === NODE.md[i].crash && Math.abs(r.miss - NODE.md[i].miss) < 0.05), `опыт в браузере совпал с Node: ${md.map((r) => r.crash).join(', ')} из 20; ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  check(/Опыт: /.test(await p.eval('document.querySelector("#mdVerdict").textContent')), 'прогноз: разбор показан — ' + (await p.eval('document.querySelector("#mdVerdict").textContent')).slice(0, 110));
  await p.eval('document.querySelectorAll("#mdView button")[0].click()'); await sleep(100);
  await p.shotEl(out('l13-forecast-done.png'), '#kettle .md-grid', 6);

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

  // --- 3. калибровка
  await center(p, '#calib');
  for (const [id, v] of [['pusht', 70], ['libero', 20], ['mw', 30], ['kitchen', 60], ['grasp', 90]]) await setRange(p, 'cal-' + id, v);
  await p.click('#calGo'); await sleep(100);
  const cal = await p.eval('document.querySelector("#calOut").textContent');
  const pen = (0.7 ** 2) + (0.2 ** 2) + (0.3 ** 2) + (0.4 ** 2) + (0.1 ** 2);
  check(cal.startsWith(`${Math.round(100 - 20 * pen)} очков`), `калибровка: счёт ${cal.slice(0, 40)} (ожидали ${Math.round(100 - 20 * pen)})`);
  await p.shotEl(out('l13-calib.png'), '#calib', 6);

  // --- 4. бины
  await center(p, '#binsMis');
  await bet(p, '#binsMis', 'Около половины'); await go(p, '#binsMis', 'bins');
  const b1 = await p.eval('window.__l13.mis.bins.ctx.results[0]');
  check(b1.bad > 35 && b1.bad < 65 && await p.eval('document.querySelector("#binsMis .bet-right") !== null'), `бины М1: в пустых углах ${b1.bad} из 100, ставка отмечена`);
  await next(p, '#binsMis');
  await go(p, '#binsMis', 'bins'); check(!(await done(p, 'bins')), 'бины М2: с независимыми бинами миссия не пройдена');
  await p.eval('document.querySelector("#wrapBinsMode [data-mode=ar]").click()'); await go(p, '#binsMis', 'bins');
  check(await done(p, 'bins'), 'бины М2: авторегрессия — ' + (await outText(p, '#binsMis')).slice(0, 80));
  await p.shotEl(out('l13-bins.png'), '#models .lab', 6);

  // --- 5. лаборатория
  await p.eval('window.__l13.SPEED.k = 4');
  await center(p, '#labMis');
  check(await p.eval('["#wrapShare", "#wrapMode", "#wrapH", "#wrapN", "#wrapK", "#wrapShow", "#wrapDrag"].every((s) => document.querySelector(s).hidden)'), 'лаба М1: ручек нет, только сцена и кнопка');
  await bet(p, '#labMis', 'Смесь и диффузия'); const tl = Date.now(); await go(p, '#labMis', 'lab');
  const r1 = await p.eval('window.__l13.mis.lab.ctx.results[0]');
  check(await done(p, 'lab') && r1.reg.touches === 10 && r1.gmm.touches === 0 && r1.dif.touches === 0, `лаба М1: регрессия ${r1.reg.touches}/10, смесь ${r1.gmm.touches}, диффузия ${r1.dif.touches}; обучение и прогон ${((Date.now() - tl) / 1000).toFixed(1)} с`);
  await p.shotEl(out('l13-lab-m1.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapShare").hidden'), 'лаба М2: появилась доля');
  await bet(p, '#labMis', 'Да, только'); await setRange(p, 'labShare', 70); await go(p, '#labMis', 'lab');
  check(!(await done(p, 'lab')), 'лаба М2, 70%: ' + (await p.eval('document.querySelector("#labMis .g-out").textContent')).slice(0, 80));
  await setRange(p, 'labShare', 75); await go(p, '#labMis', 'lab');
  check(!(await done(p, 'lab')), 'лаба М2, 75%: регрессия ещё задевает');
  await setRange(p, 'labShare', 80); await go(p, '#labMis', 'lab');
  check(await done(p, 'lab'), 'лаба М2, 80%: ' + (await outText(p, '#labMis')).slice(0, 90));
  console.log('  журнал М2:', await p.eval('document.querySelector("#labMis .m-log").textContent'));
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapDrag").hidden && document.querySelector("#wrapShare").hidden && window.__l13.Lab.st.share === 0.5'), 'лаба М3: доля вернулась к 50%, чайник можно тащить');
  await center(p, '#labCv');
  const ka = await cpt(p, '#labCv', 600, K.KETTLE.x, K.KETTLE.y), kb = await cpt(p, '#labCv', 600, 275, 130);
  const dragPts = []; for (let i = 0; i <= 12; i++) dragPts.push({ x: ka.x + (kb.x - ka.x) * i / 12, y: ka.y + (kb.y - ka.y) * i / 12 });
  await mouseDrag(p, dragPts);
  const kk = await p.eval('window.__l13.Lab.st.kettle');
  check(Math.abs(kk.x - 275) < 4 && Math.abs(kk.y - 130) < 4, `лаба М3: чайник перетащен мышью в (${f1(kk.x, 0)}; ${f1(kk.y, 0)})`);
  await center(p, '#labMis'); await go(p, '#labMis', 'lab');
  check(await done(p, 'lab'), 'лаба М3: ' + (await outText(p, '#labMis')).slice(0, 90));
  await p.shotEl(out('l13-lab-door.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('window.__l13.Lab.st.mode === "step" && window.__l13.Lab.st.kettle.y === 254'), 'лаба М4: чайник на месте, смесь выбирает сторону на каждом шаге');
  await bet(p, '#labMis', 'Будет вилять');
  for (let i = 0; i < 3 && !(await done(p, 'lab')); i++) await go(p, '#labMis', 'lab');
  const r4 = await p.eval('window.__l13.mis.lab.ctx.results[3]');
  check(await done(p, 'lab'), `лаба М4: смесь задела чайник ${r4.gmm.touches} раз, смен стороны до ${r4.gmm.maxSw}`);
  await p.shotEl(out('l13-lab-jitter.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  for (const H of [8, 16, 20, 18]) { await setRange(p, 'labH', H); await go(p, '#labMis', 'lab'); }
  check(await done(p, 'lab'), 'лаба М5, порог пачки: ' + (await outText(p, '#labMis')).slice(0, 80));
  console.log('  журнал М5:', await p.eval('document.querySelector("#labMis .m-log").textContent'));
  await next(p, '#labMis');
  check(await p.eval('["#wrapShare", "#wrapMode", "#wrapH", "#wrapN", "#wrapK", "#wrapShow", "#wrapDrag"].every((s) => !document.querySelector(s).hidden)'), 'лаба, свободный режим: все ручки видны');
  await setRange(p, 'labK', 1); await p.eval('document.querySelector("#wrapShow [data-show=heat]").click()'); await go(p, '#labMis', 'lab');
  const rf = await p.eval('window.__l13.mis.lab.ctx.results[5]');
  check(rf.gmm.touches === 10, `свободный режим: смесь из одной компоненты задевает чайник ${rf.gmm.touches} из 10`);
  await p.shotEl(out('l13-lab-free.png'), '#lab .lab', 6);
  await p.eval('window.__l13.SPEED.k = 1');

  // --- 6. стыки
  await center(p, '#seamMis');
  await bet(p, '#seamMis', 'Почти во всех'); await go(p, '#seamMis', 'seams');
  const q1 = await p.eval('window.__l13.mis.seams.ctx.results[0]');
  check(q1.touches >= 15, `стыки М1: последняя пачка — касаний ${q1.touches} из 20`);
  await p.shotEl(out('l13-seams-naive.png'), '#seams .lab', 6);
  await next(p, '#seamMis');
  await p.eval('document.querySelector("#wrapSeamMode [data-mode=te]").click()'); await go(p, '#seamMis', 'seams');
  check(!(await done(p, 'seams')), 'стыки М2, сглаживание: ' + (await p.eval('document.querySelector("#seamMis .g-out").textContent')).slice(0, 70));
  await p.shotEl(out('l13-seams-te.png'), '#seams .lab', 6);
  await p.eval('document.querySelector("#wrapSeamMode [data-mode=bid]").click()'); await go(p, '#seamMis', 'seams');
  check(await done(p, 'seams'), 'стыки М2, согласование: ' + (await outText(p, '#seamMis')).slice(0, 100));
  await p.shotEl(out('l13-seams-bid.png'), '#seams .lab', 6);

  // --- квиз и тёмная тема
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelector(".q-opt").click())');
  check(/Итог: \d из 8/.test(await p.eval('document.querySelector("#quizScore").textContent')), 'квиз: ' + await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l13-quiz.png'), '#quiz .prose', 6);
  await p.shotEl(out('l13-finale.png'), '#finale .prose', 6);
  await p.click('#themeBtn'); await sleep(300);
  await p.shotEl(out('l13-lab-dark.png'), '#lab .lab', 6);
  await p.shotEl(out('l13-draw-dark.png'), '#mean .lab', 6);
  await p.shotEl(out('l13-forecast-dark.png'), '#kettle .md-grid', 6);
  await p.shotEl(out('l13-seams-dark.png'), '#seams .lab', 6);
  await p.shotEl(out('l13-calib-dark.png'), '#calib', 6);
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
  await center(m, '#drawCv');
  await drawStroke(m, -1, 58); await drawStroke(m, 1, 58);
  check((await m.eval('window.__l13.Draw.api.state().n')) === 2, 'телефон: две линии нарисованы пальцем (мышью в эмуляции)');
  await m.shotEl(out('l13-m-draw.png'), '#mean .lab', 4);
  await m.shotEl(out('l13-m-forecast.png'), '#kettle .md-grid', 4);
  await m.shotEl(out('l13-m-calib.png'), '#calib', 4);
  await center(m, '#labMis');
  await bet(m, '#labMis', 'Никто'); await go(m, '#labMis', 'lab');
  check(await done(m, 'lab'), 'телефон: лаба М1 пройдена');
  await m.shotEl(out('l13-m-lab.png'), '#lab .lab', 4);
  await m.shotEl(out('l13-m-bins.png'), '#models .lab', 4);
  await m.shotEl(out('l13-m-seams.png'), '#seams .lab', 4);
  await m.shotEl(out('l13-m-methods.png'), '#models .tbl-wrap', 4);
  const wdt = await m.eval('document.documentElement.scrollWidth');
  check(wdt <= 390, `телефон: ширина ${wdt} из 390`);
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
