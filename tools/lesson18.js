// Проверка урока 1.8: сначала цифры движка в Node (их же пишем в текстах),
// потом все миссии в браузере — перетаскивание через CDP, ставки, обучение,
// ползунки, свободный режим; задача на сортировку, квиз, тёмная тема и телефон 390 px.
// Снимки — в shots/l18-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const FM = require('../lessons/l18/engine.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-8-flow-matching.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f1 = (v, d) => (+v).toFixed(d == null ? 1 : d);
const pct = (v) => f1(v * 100);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры движка в Node ---------- */
function nodeNumbers() {
  console.log('Node: цифры движка');
  const NS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50, 100], OPT = { iters: 1500, bs: 128, lr: 0.005, seed: 7 };
  // 1. точное поле на двух пятнах
  const C = [{ m: [-1.2, 1.0], s: 0.22, w: 1 }, { m: [1.2, 1.0], s: 0.22, w: 1 }];
  const p0 = FM.gmmPath(C, 0.9, -0.6, 200), e0 = p0[p0.length - 1];
  check(Math.hypot(e0[0] - 1.2, e0[1] - 1) < 0.55, `пятна: зонд из (0,9; −0,6) приходит в правое пятно (${f1(e0[0], 2)}; ${f1(e0[1], 2)})`);
  const v = FM.gmmField(C, 0.7, -0.4, 0);
  check(Math.abs(0.7 + v[0]) < 1e-9 && Math.abs(-0.4 + v[1] - 1) < 1e-9, 'пятна: один шаг из любой точки ведёт в среднее (0; 1)');
  // 2. обучение flow и диффузии
  const data = FM.ring(4000, 1), Z = FM.noise(600, 42);
  const floor = FM.lossFloor(200000, 4);
  check(f1(floor, 2) === '1.87', `граница ошибки идеального поля: ${f1(floor, 3)}`);
  let t0 = Date.now(); const fm = FM.net2(5); let lf; for (const e of FM.trainFM(fm, data, OPT)) lf = e; const tf = Date.now() - t0;
  t0 = Date.now(); const dd = FM.net2(5); let ld; for (const e of FM.trainDDPM(dd, data, OPT)) ld = e; const td = Date.now() - t0;
  check(f1(lf.loss, 2) === '1.93', `flow: ошибка обучения ${f1(lf.loss, 3)} (${tf} мс), диффузия ${f1(ld.loss, 3)} (${td} мс)`);
  const qF = NS.map((n) => FM.ringQuality(FM.sampleFM(fm, Z, n))), qD = NS.map((n) => FM.ringQuality(FM.sampleDDIM(dd, Z, n)));
  console.log('    шаги:      ' + NS.map((n) => String(n).padStart(6)).join(''));
  console.log('    flow, %:   ' + qF.map((q) => pct(q.on).padStart(6)).join(''));
  console.log('    диффузия:  ' + qD.map((q) => pct(q.on).padStart(6)).join(''));
  const ok = (q) => q.on >= 0.72 && q.modes === 8, firstOk = (qs) => NS[qs.findIndex(ok)];
  check(pct(qF[3].on) === '54.8' && pct(qD[3].on) === '4.7', `4 шага: flow ${pct(qF[3].on)}%, диффузия ${pct(qD[3].on)}%`);
  check(firstOk(qF) === 8 && qs(qF, 6) < 0.72, `flow держит форму с 8 шагов (${pct(qF[5].on)}%), при 6 — ${pct(qF[4].on)}%`);
  check(firstOk(qD) === 16 && pct(qD[6].on) === '70.0', `диффузия — с 16 шагов (${pct(qD[7].on)}%), при 12 — ${pct(qD[6].on)}%`);
  check(qF[0].on === 0 && qF[0].modes === 0, `1 шаг: flow ${pct(qF[0].on)}% (в центре), диффузия ${pct(qD[0].on)}%, пятен ${qD[0].modes}`);
  check(NS.slice(5).every((n, i) => qF[i + 5].on >= 0.72 && qF[i + 5].modes === 8), 'flow: от 8 шагов и дальше форма держится при любом числе шагов');
  // 3. поле сети: разворот
  const rad = (t) => { const n = 32, r = 0.35, xs = new Float64Array(2 * n), vv = new Float64Array(2 * n); for (let i = 0; i < n; i++) { const a = 2 * Math.PI * (i + 0.5) / n; xs[2 * i] = r * Math.cos(a); xs[2 * i + 1] = r * Math.sin(a); } FM.predictor(fm, n)(xs, n, t, vv); let s = 0; for (let i = 0; i < n; i++) s += (vv[2 * i] * xs[2 * i] + vv[2 * i + 1] * xs[2 * i + 1]) / r; return s / n; };
  const rr = []; for (let i = 0; i < 20; i++) rr.push(rad(Math.round(i * 5) / 100));
  const turn = rr.findIndex((x) => x > 0);
  check(turn === 11 && rr.slice(0, 11).every((x) => x <= 0) && rr.slice(11).every((x) => x > 0), `разворот стрелок внутри кольца — при t = ${f1(turn * 0.05, 2)} (до: ${f1(rr[10], 2)}, после: ${f1(rr[11], 2)})`);
  // 4. reflow
  const ZZ = FM.noise(100, 5), RD = FM.ring(100, 6), cr = FM.crossings(ZZ, RD, 100), cm = FM.crossings(ZZ, FM.sampleFM(fm, ZZ, 4), 100);
  check(cr === 917 && cm === 8, `пересечения 100 пар: случайные ${cr}, пары reflow за 4 шага — ${cm}`);
  const rf = {};
  for (const ps of [2, 4, 8, 16, 50]) {
    const P = FM.makePairs(fm, 2000, ps, 99), m = FM.clone(fm, true); for (const e of FM.trainFM(m, null, { iters: 1000, bs: 128, lr: 0.002, seed: 8, pairs: P }));
    rf[ps] = { q1: FM.ringQuality(FM.sampleFM(m, Z, 1)), q100: FM.ringQuality(FM.sampleFM(m, Z, 100)), pq: FM.ringQuality(P.z1) };
  }
  console.log('    reflow, 1 шаг: ' + [2, 4, 8, 16, 50].map((ps) => `пары за ${ps} → ${pct(rf[ps].q1.on)}% (${rf[ps].q1.modes} пятен; пары ${pct(rf[ps].pq.on)}%)`).join(' · '));
  check(rf[4].q1.on < 0.62 && rf[8].q1.on < 0.62 && rf[16].q1.on >= 0.62 && rf[16].q1.modes === 8 && rf[50].q1.on >= 0.62, 'reflow: 62% за 1 шаг дают пары за 16 и 50 шагов, но не за 2, 4, 8');
  const catchUp = (target) => NS[qF.findIndex((q) => q.on >= target)];
  check(catchUp(rf[16].q1.on) === 6 && catchUp(rf[50].q1.on) === 8, `исходная модель догоняет выпрямленную: пары за 16 → ${catchUp(rf[16].q1.on)} шагов, за 50 → ${catchUp(rf[50].q1.on)}`);
  check(rf[50].q100.on < qF[11].on && rf[16].q100.on < qF[11].on, `цена: при 100 шагах исходная ${pct(qF[11].on)}%, выпрямленная ${pct(rf[16].q100.on)}% (пары 16) и ${pct(rf[50].q100.on)}% (пары 50)`);
  // 5. пачка действий
  const D = FM.demos(40, 21), Zc = FM.noise(20, 77, FM.CH.H), okN = (n) => { const x = FM.sampleChunk(D, 0.01, Zc, n); let k = 0, hit = 0, gap = 1e9; for (let i = 0; i < 20; i++) { const c = FM.chunkCheck(x, i); if (c.gap >= 0.02) k++; if (c.hit) hit++; gap = Math.min(gap, c.gap); } return { k, hit, gap }; };
  const c1 = okN(1), c2 = okN(2), c3 = okN(3), c4 = okN(4);
  check(c1.k === 0 && c1.hit === 20, `пачки: 1 шаг — все 20 в чайнике`);
  check(c2.hit === 3 && c3.k === 19 && f1(c3.gap * 100) === '0.4' && c4.k === 20, `пачки: 2 шага — задели ${c2.hit}; 3 шага — ${c3.k} из 20, зазор ${f1(c3.gap * 100)} см; 4 шага — ${c4.k} из 20`);
  let allOk = true; for (let n = 4; n <= 20; n++) if (okN(n).k !== 20) allOk = false;
  check(allOk, 'пачки: от 4 до 20 шагов — 20 из 20 с зазором 2 см');
  const L10 = FM.latency(10, false), L10s = FM.latency(10, true), L11s = FM.latency(11, true);
  check(f1(L10) === '73.0' && f1(L10s) === '86.0' && FM.idle(L10s) <= 0.15 && FM.idle(L11s) > 0.15, `задержка: 10 шагов — ${f1(L10)} мс, на сервере ${f1(L10s)} мс (простой ${pct(FM.idle(L10s))}%), 11 шагов — ${pct(FM.idle(L11s))}%`);
  check(f1(FM.latency(1, false)) === '48.7', `один шаг вместо десяти: ${f1(FM.latency(1, false))} мс`);
}
function qs(arr, n) { const NS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50, 100]; return arr[NS.indexOf(n)].on; }

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l18.mis.${key}.ctx.done[window.__l18.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(150); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) {
  await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`);
  await sleep(200); await p.waitFor(`!window.__l18.mis.${key}.busy`, 180000); await sleep(120);
}
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60); }
async function setCheck(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.checked = ${!!v}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150); }
/** Точка канваса в логических координатах → координаты окна. */
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(12); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(100);
}
/** Перетащить в сцене двух пятен из точки a в точку b (мировые координаты). */
const aPx = (x, y) => [260 + x * 100, 250 - y * 100];
async function dragA(p, a, b, steps) {
  const pts = []; steps = steps || 14;
  for (let i = 0; i <= steps; i++) { const [lx, ly] = aPx(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); pts.push(await cpt(p, '#aCv', 520, lx, ly)); }
  await mouseDrag(p, pts);
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" && !document.querySelector(".g-card")'), 'старая пошаговая карточка не используется');
  console.log('  первый экран:', await p.eval('document.querySelector("#heroMis").textContent'));
  await p.shot(out('l18-hero.png'));

  // --- лаборатория 1: два пятна
  await center(p, '#aMis');
  check((await crit(p, '#aMis')) === 'no' && await p.eval('document.querySelector("#aMis").classList.contains("m-live") && document.querySelector("#wrapAPairs").hidden'), 'Л1 М1: живая миссия, ручек нет, зонд идёт в правое пятно');
  await center(p, '#aCv');
  await dragA(p, [0.9, -0.6], [-0.8, -0.5]);
  const a1 = await p.eval('window.__l18.LabA.api.state()');
  check(await done(p, 'a'), `Л1 М1: зонд перетащен влево → ${a1.end}, изгиб ${f1(a1.bend, 2)} — ` + (await outText(p, '#aMis')).slice(0, 90));
  await next(p, '#aMis');
  check(await p.eval('document.querySelector("#aMis .g-go").disabled'), 'Л1 М2: кнопка заблокирована до ставки');
  await bet(p, '#aMis', 'Все в одной'); await go(p, '#aMis', 'a');
  const a2 = await p.eval('window.__l18.mis.a.ctx.results[1]');
  check(await done(p, 'a') && a2.spread < 1e-9 && Math.abs(a2.land[1] - 1) < 1e-9, `Л1 М2: один шаг — все 60 точек в (${f1(a2.land[0], 2)}; ${f1(a2.land[1], 2)}), разброс ${a2.spread.toExponential(1)}`);
  check(await p.eval('document.querySelector("#aMis .m-bet .bet-right") !== null && document.querySelector("#aMis .m-bet .bet-wrong") === null'), 'Л1 М2: ставка «все в одной точке» отмечена ✓');
  await p.shotEl(out('l18-a-jump.png'), '#idea .lab', 6);
  await next(p, '#aMis');
  check(await p.eval('!document.querySelector("#wrapAPairs").hidden && document.querySelector("#aPairs").checked'), 'Л1 М3: появились обучающие пары');
  await center(p, '#aCv');
  await dragA(p, [-1.3, -0.4], [0, 0.5], 16);
  const a3 = await p.eval('window.__l18.LabA.api.state()');
  check(await done(p, 'a'), `Л1 М3: лупа в (0; 0,5): ${a3.n} прямых, ${a3.lens.L} влево и ${a3.lens.R} вправо, согласие ${pct(a3.agree)}%`);
  await p.shotEl(out('l18-a.png'), '#idea .lab', 6);
  await next(p, '#aMis');
  check(await p.eval('window.__l18.mis.a.index === 3 && !document.querySelector("#wrapAPairs").hidden'), 'Л1: свободный режим');

  // --- лаборатория 2: обучение поля
  await center(p, '#bMis');
  check(await p.eval('document.querySelector("#wrapBT").hidden && document.querySelector("#wrapBParts").hidden'), 'Л2 М1: ручек нет');
  await bet(p, '#bMis', 'Остановится');
  const t0 = Date.now(); await go(p, '#bMis', 'b'); const tb = Date.now() - t0;
  const b1 = await p.eval('window.__l18.mis.b.ctx.results[0]');
  check(await done(p, 'b') && f1(b1.loss, 2) === '1.93' && f1(b1.floor, 2) === '1.87', `Л2 М1: обучение ${tb} мс, ошибка ${f1(b1.loss, 3)}, граница ${f1(b1.floor, 3)}`);
  await p.shotEl(out('l18-b-trained.png'), '#train .lab', 6);
  await next(p, '#bMis');
  check(await p.eval('!document.querySelector("#wrapBT").hidden'), 'Л2 М2: появился ползунок времени');
  await setRange(p, 'bT', 12);
  check(!(await done(p, 'b')), 'Л2 М2: t = 0,6 — уже наружу, но это не первый момент: ' + (await crit(p, '#bMis')));
  await setRange(p, 'bT', 10);
  check(!(await done(p, 'b')), 'Л2 М2: t = 0,5 — ещё к центру: ' + (await crit(p, '#bMis')));
  await setRange(p, 'bT', 11);
  check(await done(p, 'b'), 'Л2 М2: t = 0,55 — разворот: ' + (await outText(p, '#bMis')).slice(0, 80));
  await p.shotEl(out('l18-b.png'), '#train .lab', 6);
  await next(p, '#bMis');

  // --- лаборатория 3: диффузия и flow
  await center(p, '#cMis');
  check(await p.eval('document.querySelector("#wrapCN").hidden'), 'Л3 М1: ползунка шагов ещё нет');
  await bet(p, '#cMis', 'У flow'); const tc0 = Date.now(); await go(p, '#cMis', 'c'); const tc = Date.now() - tc0;
  const c1 = await p.eval('window.__l18.mis.c.ctx.results[0]');
  check(await done(p, 'c') && pct(c1.f.on) === '54.8' && pct(c1.d.on) === '4.7', `Л3 М1: обучение диффузии ${tc} мс; 4 шага — flow ${pct(c1.f.on)}%, диффузия ${pct(c1.d.on)}%`);
  await next(p, '#cMis');
  await setRange(p, 'cN', 4);
  check(!(await done(p, 'c')), 'Л3 М2: 6 шагов — flow ещё нет: ' + (await crit(p, '#cMis')));
  await setRange(p, 'cN', 6);
  check(!(await done(p, 'c')), 'Л3 М2: 12 шагов — форма держится, но не наименьшее: ' + (await crit(p, '#cMis')));
  await setRange(p, 'cN', 5);
  check(await done(p, 'c'), 'Л3 М2: 8 шагов — ' + (await outText(p, '#cMis')).slice(0, 90));
  await next(p, '#cMis');
  await setRange(p, 'cN', 6);
  check(!(await done(p, 'c')), 'Л3 М3: 12 шагов — диффузия ещё нет: ' + (await crit(p, '#cMis')));
  await setRange(p, 'cN', 7);
  check(await done(p, 'c'), 'Л3 М3: 16 шагов — ' + (await outText(p, '#cMis')).slice(0, 90));
  await p.shotEl(out('l18-c.png'), '#steps .lab', 6);
  await next(p, '#cMis');
  await bet(p, '#cMis', 'Одно пятно'); await go(p, '#cMis', 'c');
  const c4 = await p.eval('window.__l18.mis.c.ctx.results[3]');
  check(await done(p, 'c') && c4.f.on === 0 && c4.spread < 0.25 && c4.center < 0.2, `Л3 М4: один шаг — flow ${pct(c4.f.on)}%, точки в среднем в ${f1(c4.spread, 2)} от середины пятна, пятно в ${f1(c4.center, 2)} от центра`);
  await p.shotEl(out('l18-c-one.png'), '#steps .lab', 6);
  await next(p, '#cMis');
  await setRange(p, 'cN', 11); await setCheck(p, 'cTraj', true);
  await p.shotEl(out('l18-c-free.png'), '#steps .lab', 6);
  console.log('  точки на графике шагов: flow', await p.eval('[...window.__l18.LabC.st.seen.fm].sort((a,b)=>a-b).join(",")'));

  // --- лаборатория 4: reflow
  await center(p, '#dMis');
  await bet(p, '#dMis', 'Почти ни одного'); await go(p, '#dMis', 'd');
  const d1 = await p.eval('window.__l18.mis.d.ctx.results[0]');
  check(await done(p, 'd') && d1.rand === 917 && d1.model === 8, `Л4 М1: пересечений ${d1.rand} у случайных пар и ${d1.model} у пар reflow`);
  await p.shotEl(out('l18-d-pairs.png'), '#reflow .lab', 6);
  await next(p, '#dMis');
  check(await p.eval('!document.querySelector("#wrapDPS").hidden && document.querySelector("#wrapDN").hidden'), 'Л4 М2: видна ручка «шагов на пары»');
  await go(p, '#dMis', 'd');
  check(!(await done(p, 'd')), 'Л4 М2, пары за 4 шага: ' + (await p.eval('document.querySelector("#dMis .g-out").textContent')).slice(0, 110));
  await p.eval('[...document.querySelectorAll("#dPS button")].find((b) => b.textContent === "16").click()'); await sleep(80);
  await go(p, '#dMis', 'd');
  check(await done(p, 'd'), 'Л4 М2, пары за 16 шагов: ' + (await outText(p, '#dMis')).slice(0, 100));
  console.log('  журнал Л4 М2:', await p.eval('document.querySelector("#dMis .m-log").textContent'));
  await p.shotEl(out('l18-d.png'), '#reflow .lab', 6);
  await next(p, '#dMis');
  await setRange(p, 'dN', 3);
  check(!(await done(p, 'd')), 'Л4 М3: 4 шага — ещё отстаёт: ' + (await crit(p, '#dMis')));
  await setRange(p, 'dN', 4);
  check(await done(p, 'd'), 'Л4 М3: 6 шагов — ' + (await outText(p, '#dMis')).slice(0, 160));
  await next(p, '#dMis');
  check(await p.eval('!document.querySelector("#dMode").hidden'), 'Л4: свободный режим, переключатель пар и результата');

  // --- лаборатория 5: пачка действий
  await p.eval('window.__l18.SPEED.k = 6');
  await center(p, '#eMis');
  await bet(p, '#eMis', 'Проход'); await go(p, '#eMis', 'e');
  check(await done(p, 'e') && /46 мс/.test(await outText(p, '#eMis')), 'Л5 М1: ' + (await outText(p, '#eMis')).slice(0, 90));
  await next(p, '#eMis');
  await bet(p, '#eMis', 'Ни одной'); await go(p, '#eMis', 'e');
  const e2 = await p.eval('window.__l18.mis.e.ctx.results[1]');
  check(await done(p, 'e') && e2.ok === 0 && e2.hit === 20, `Л5 М2: один шаг — ${e2.ok} из 20, в чайнике ${e2.hit}`);
  await p.shotEl(out('l18-e-one.png'), '#robot .lab', 6);
  await next(p, '#eMis');
  await setRange(p, 'eN', 3);
  check(!(await done(p, 'e')), 'Л5 М3: 3 шага — ещё нет: ' + (await p.eval('document.querySelector("#eOut").textContent')));
  await setRange(p, 'eN', 6);
  check(!(await done(p, 'e')), 'Л5 М3: 6 шагов — не наименьшее');
  await setRange(p, 'eN', 4);
  check(await done(p, 'e'), 'Л5 М3: 4 шага — ' + (await outText(p, '#eMis')).slice(0, 120));
  await next(p, '#eMis');
  check(await p.eval('!document.querySelector("#wrapESrv").hidden'), 'Л5 М4: появился переключатель сервера');
  check(await p.eval('window.__l18.LabE.api.state().N === 16') && (await crit(p, '#eMis')) === 'no,no,ok', 'Л5 М4: старт с 16 шагами на борту: ' + (await crit(p, '#eMis')));
  await setCheck(p, 'eSrv', true);
  check(!(await done(p, 'e')) && (await crit(p, '#eMis')) === 'ok,no,ok', 'Л5 М4: сервер, 16 шагов — бюджет превышен: ' + (await p.eval('document.querySelector("#eLat").textContent')).slice(0, 90));
  await setRange(p, 'eN', 11);
  check(!(await done(p, 'e')), 'Л5 М4: сервер, 11 шагов — ещё превышен: ' + (await crit(p, '#eMis')));
  await setRange(p, 'eN', 10);
  check(await done(p, 'e'), 'Л5 М4: сервер, 10 шагов — ' + (await outText(p, '#eMis')).slice(0, 110));
  await p.eval('window.__l18.SPEED.k = 1');
  await p.shotEl(out('l18-e.png'), '#robot .lab', 6);
  await next(p, '#eMis');

  // --- задача и квиз
  const items = { flowp: 's1', mp1: 's1', groot: 's45', pi07: 's45', rdt: 's45', pi0: 's10', pi05: 's10', smol: 's10', umi: 's16', octo: 's16', aloha: 's16' };
  for (const [id, z] of Object.entries(items)) await p.eval(`window.__l18.mis.sort.place(${JSON.stringify(id)}, ${JSON.stringify(z)})`);
  await p.eval('window.__l18.mis.sort.check()'); await sleep(100);
  check(/^11 из 11/.test(await p.eval('document.querySelector("#stepSort .c-out").textContent')), 'задача: ' + (await p.eval('document.querySelector("#stepSort .c-out").textContent')).slice(0, 60));
  await p.shotEl(out('l18-sort.png'), '#stepSort', 6);
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => { const b = [...c.querySelectorAll(".q-opt")].find((x) => x.textContent.startsWith("Нет:") || x.textContent.startsWith("Проход")); b.click(); })');
  check(/^Итог: 8 из 8/.test(await p.eval('document.querySelector("#quizScore").textContent')), 'квиз: ' + await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l18-quiz.png'), '#quiz .quiz', 6);

  // --- «Начать заново» в каждой лаборатории
  for (const k of ['a', 'b', 'c', 'd', 'e']) await p.eval(`document.querySelector('#${k}Mis .g-restart').click()`);
  await sleep(300);
  check(await p.eval("['a','b','c','d','e'].every((k) => window.__l18.mis[k].index === 0 && !window.__l18.mis[k].ctx.done[0])"), '«Начать заново»: все пять лабораторий вернулись к первой миссии');

  // --- тёмная тема
  await p.click('#themeBtn'); await sleep(300);
  await p.shotEl(out('l18-c-dark.png'), '#steps .lab', 6);
  await p.shotEl(out('l18-e-dark.png'), '#robot .lab', 6);
  await p.shotEl(out('l18-b-dark.png'), '#train .lab', 6);
  await p.shotEl(out('l18-a-dark.png'), '#idea .lab', 6);
  console.log('  логи десктопа:', p.logs.join(' | ') || 'нет');
  check(!p.logs.some((l) => /exception|error/i.test(l)), 'консоль десктопа без ошибок');
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  check(await m.eval('document.documentElement.scrollWidth') <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth') + ' из 390');
  await m.shot(out('l18-m-hero.png'));
  await center(m, '#aCv');
  await dragA(m, [0.9, -0.6], [-0.8, -0.5]);
  check(await done(m, 'a'), 'телефон Л1 М1: зонд перетащен пальцем в левое пятно');
  await m.shotEl(out('l18-m-a.png'), '#idea .lab', 4);
  await center(m, '#bMis'); await bet(m, '#bMis', 'Остановится'); await go(m, '#bMis', 'b');
  check(await done(m, 'b'), 'телефон Л2 М1: сеть обучилась');
  await m.shotEl(out('l18-m-b.png'), '#train .lab', 4);
  await center(m, '#cMis'); await bet(m, '#cMis', 'У flow'); await go(m, '#cMis', 'c');
  check(await done(m, 'c'), 'телефон Л3 М1: обе модели обучены');
  await m.shotEl(out('l18-m-c.png'), '#steps .lab', 4);
  await center(m, '#dMis'); await bet(m, '#dMis', 'Почти'); await go(m, '#dMis', 'd');
  await m.shotEl(out('l18-m-d.png'), '#reflow .lab', 4);
  await m.eval('window.__l18.SPEED.k = 6');
  await center(m, '#eMis'); await bet(m, '#eMis', 'Проход'); await go(m, '#eMis', 'e');
  await m.shotEl(out('l18-m-e.png'), '#robot .lab', 4);
  await m.shotEl(out('l18-m-sort.png'), '#stepSort', 4);
  check(await m.eval('document.documentElement.scrollWidth') <= 390, 'телефон после миссий: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  console.log('  логи телефона:', m.logs.join(' | ') || 'нет');
  check(!m.logs.some((l) => /exception|error/i.test(l)), 'консоль телефона без ошибок');
  await B.close();
}

(async () => {
  const only = process.argv[2];
  if (!only || only === 'node') nodeNumbers();
  if (!only || only === 'desktop') await desktop();
  if (!only || only === 'phone') await phone();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки прошли');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
