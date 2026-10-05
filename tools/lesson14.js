// Проверка урока 1.4: сначала цифры движка в Node (те же зёрна, что в браузере), потом все миссии
// в браузере — рисование прогноза мышью, перемотка, обучение сети, генерации, перетаскивание стартов,
// guidance, шторка, квиз с калибровкой; тёмная тема и телефон 390 px. Снимки — в shots/l14-*.png.
// Запуск: node tools/lesson14.js        (только цифры: node tools/lesson14.js node)
const { launch, sleep } = require('./cdp');
const path = require('path');
const D = require('../lessons/l14/engine.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-4-diffuzionnye-modeli.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f = (v, d) => (+v).toFixed(d == null ? 1 : d);
const p100 = (v, d) => (v * 100).toFixed(d || 0);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

const DATA = D.spirals(1000, 7), NN = D.nnIndex(DATA, 0.1), RM = D.medianRadius(DATA), LIN = D.schedule('lin'), COS = D.schedule('cos');
const MEAN = (() => { let x = 0, y = 0; for (let i = 0; i < DATA.N; i++) { x += DATA.X[2 * i]; y += DATA.X[2 * i + 1]; } return { x: x / DATA.N, y: y / DATA.N }; })();
const holds = (s) => s.on >= 0.8 && s.outer >= 0.25;
const NUM = {}; // цифры для браузерной части

/* ---------- 1. Цифры в Node ---------- */
function nodeSchedules() {
  console.log('Node: расписания и прогноз');
  const a5 = LIN.abar[500], c5 = COS.abar[500], aT = LIN.abar[1000], cT = COS.abar[1000];
  check(Math.abs(a5 - 0.0786) < 5e-4 && Math.abs(c5 - 0.494) < 1e-3, `ᾱ₅₀₀: линейное ${f(a5, 4)} (≈ 0,08 в досье), косинусное ${f(c5, 3)} (≈ 0,49)`);
  check(Math.abs(aT - 4.04e-5) < 1e-6, `ᾱ_T линейного ${aT.toExponential(2)} (≈ 4·10⁻⁵ в досье), косинусного ${cT.toExponential(2)}`);
  let t1 = 1; while (LIN.abar[t1] >= 0.01) t1++; let t2 = 1; while (COS.abar[t2] >= 0.01) t2++;
  const band = []; for (let t = 0; t <= 1000; t++) if (LIN.abar[t] >= 0.008 && LIN.abar[t] <= 0.012) band.push(t);
  check(t1 === 674 && t2 === 936, `сигнала меньше 1%: линейное с t = ${t1} (до конца ${1000 - t1 + 1} шагов), косинусное с t = ${t2}`);
  check(band.length >= 20, `М3 «где кончается»: ᾱ от 0,008 до 0,012 при t = ${band[0]}…${band[band.length - 1]} (${band.length} шагов ползунка)`);
  NUM.t1 = t1; NUM.band = [band[0], band[band.length - 1]];
}
function rewindNumbers() {
  console.log('Node: перемотка генерации идеальным денойзером');
  const G = 15, EXT = 2.1, nodes = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = -EXT + 2 * EXT * i / (G - 1), y = -EXT + 2 * EXT * j / (G - 1), q = NN.near(x, y, 3); nodes.push({ x, y, dm: Math.hypot(MEAN.x - x, MEAN.y - y), nn: q, inner: Math.hypot(x, y) < 1.75 && !!q && q.d > 0.08 }); }
  const ang = (ax, ay, bx, by) => { const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) + 1e-12); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; };
  const TS = D.taus(50), tOf = (j) => (j < 50 ? TS[j] : 1), o = [0, 0], rows = [];
  for (let j = 0; j <= 50; j++) {
    const t = tOf(j), a = LIN.abar[t], sa = Math.sqrt(a), sg = Math.sqrt((1 - a) / a); let tm = 0, nm = 0, ts = 0, ns = 0;
    for (const n of nodes) { D.edmD(DATA, n.x / sa, n.y / sa, sg, o); const vx = o[0] - n.x, vy = o[1] - n.y; if (n.dm > 0.3) { nm++; if (ang(vx, vy, MEAN.x - n.x, MEAN.y - n.y) < 15) tm++; } if (n.inner) { ns++; const p = n.nn.i; if (ang(vx, vy, DATA.X[2 * p] - n.x, DATA.X[2 * p + 1] - n.y) < 30) ts++; } }
    rows.push({ j, t, sg, toMean: tm / nm, toSp: ts / ns });
  }
  let J1 = 0; while (J1 < 50 && rows[J1 + 1].toMean >= 0.9) J1++;
  let J2 = J1 + 1; while (J2 <= 50 && rows[J2].toSp < 0.9) J2++;
  const oneM = rows.filter((r) => r.j < 50 && r.toMean >= 0.9 && rows[r.j + 1].toMean < 0.9).length, oneS = rows.filter((r) => r.j > 0 && r.toSp >= 0.9 && rows[r.j - 1].toSp < 0.9).length;
  check(oneM === 1 && oneS === 1, `единственные ответы: «к центру» — шаг ${J1} (t = ${rows[J1].t}, σ = ${f(rows[J1].sg, 2)}, ${p100(rows[J1].toMean)}% → ${p100(rows[J1 + 1].toMean)}%), «к виткам» — шаг ${J2} (t = ${rows[J2].t}, ${p100(rows[J2 - 1].toSp)}% → ${p100(rows[J2].toSp)}%)`);
  NUM.J1 = J1; NUM.J2 = J2;
}
/** Сеть лаборатории в точности как в браузере: зерно 5, обучение с зерном 9, пакеты по 8 шагов. */
function labStates() {
  console.log('Node: лаборатория по эпохам (сеть та же, что в браузере)');
  const Dn = D.denoiser({ seed: 5 }), ev = D.evalSet(DATA, 4000, 77, Dn.sched), r = D.rng(9), loss0 = D.evalLoss(Dn, ev);
  const STEPS = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100];
  const gen = (S, eta, seed, n) => D.sample(D.netEps(Dn), Dn.sched, { n: n || 1000, steps: S, eta, seed: seed || 2 });
  const st = (x) => D.stats(DATA, NN, x, 1000, RM);
  const losses = [], states = {};
  const cpu0 = process.cpuUsage();
  for (let ep = 25; ep <= 800; ep += 25) {
    for (let k = 0; k < 25 * 16; k++) D.trainStep(Dn, DATA, D.LAB.bs, r, D.labLr(Dn.steps), 0);
    const L = D.evalLoss(Dn, ev); losses.push([ep, L]);
    if (ep === 200) { const u = process.cpuUsage(cpu0); NUM.trainSec = (u.user + u.system) / 1e6; }
    if (![200, 250, 300, 350, 400, 500, 600, 800].includes(ep)) continue;
    const a = gen(100, 1), sa = st(a.x), R = states.R || (() => { const R = D.regressor(8); for (const e of D.regTrainGen(R, DATA, { steps: 400 })); return R; })(); states.R = R;
    const ry = D.regPredict(R, a.x0, 1000), rs = st(ry); let rr = 0; for (let k = 0; k < 1000; k++) rr += Math.hypot(ry[2 * k], ry[2 * k + 1]); rr /= 1000;
    const P = {}, I = {}; for (const S of STEPS) { P[S] = st(gen(S, 1).x); I[S] = st(gen(S, 0).x); }
    const Sstar = Math.min(...STEPS.filter((S) => holds(P[S])));
    const m3 = STEPS.filter((S) => P[S].outer < 0.25), m4 = STEPS.filter((S) => S <= 10 && holds(I[S]) && P[S].outer < 0.25);
    // бассейны: пары стартов по разные стороны от центра на расстоянии 0,2
    const G = 49, E = 2.4, gx = new Float64Array(2 * G * G); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { gx[2 * (j * G + i)] = -E + 2 * E * i / (G - 1); gx[2 * (j * G + i) + 1] = E - 2 * E * j / (G - 1); }
    const gw = D.onSpiral(DATA, NN, D.sample(D.netEps(Dn), Dn.sched, { n: G * G, steps: 20, eta: 0, x0: gx }).x, G * G).who; let adj = 0;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = gw[j * G + i]; if (a < 0) continue; if (i + 1 < G && gw[j * G + i + 1] >= 0 && gw[j * G + i + 1] !== a) adj++; if (j + 1 < G && gw[(j + 1) * G + i] >= 0 && gw[(j + 1) * G + i] !== a) adj++; }
    const pairs = []; for (let k = 0; k < 24; k++) { const ag = k / 24 * Math.PI, x0 = new Float64Array([0.1 * Math.cos(ag), 0.1 * Math.sin(ag), -0.1 * Math.cos(ag), -0.1 * Math.sin(ag)]); const z = D.sample(D.netEps(Dn), Dn.sched, { n: 2, steps: 20, eta: 0, x0 }); const w = D.onSpiral(DATA, NN, z.x, 2).who; if (w[0] >= 0 && w[1] >= 0 && w[0] !== w[1]) pairs.push(ag); }
    states[ep] = { L, sa, rs, rr, P, I, Sstar, m3, m4, pairs, adj, verdict: I[8].outer - P[8].outer };
    console.log(`  эпох ${ep}: ошибка ${f(L, 4)} · DDPM 100 на спиралях ${p100(sa.on)}%, доли ${p100(sa.share[0])}/${p100(sa.share[1])} · регрессия ${p100(rs.on)}%, радиус ${f(rr, 2)} · DDPM держит форму до ${Sstar} · М3: ${m3.join(',')} · М4: ${m4.join(',')} · 8 шагов DDPM/DDIM за окр. ${p100(P[8].outer)}/${p100(I[8].outer)} · пар через центр ${pairs.length}/24 · соседних узлов карты на разных спиралях ${adj}`);
  }
  const first = losses.find(([, L]) => L < 0.234);
  check(Math.abs(loss0 - 1.2245) < 1e-3, `ошибка до обучения ${f(loss0, 4)}`);
  check(first && first[0] === 200, `М1: порог 0,234 впервые пройден на ${first && first[0]} эпохах (ошибка ${first && f(first[1], 4)}); по 25 эпох: ${losses.filter(([e]) => e <= 225).map(([e, L]) => `${e}:${f(L, 4)}`).join(' ')}`);
  check(losses.every(([e, L]) => e < 200 || L < 0.234), 'после 200 эпох ошибка не поднимается выше порога');
  const L800 = losses[losses.length - 1][1];
  check(L800 > 0.22 && L800 < 0.23, `плато: через 800 эпох ошибка ${f(L800, 4)} («около 0,225» в тексте)`);
  check(NUM.trainSec < 15, `обучение до порога (200 эпох) в Node: ${f(NUM.trainSec, 1)} с процессорного времени`);
  for (const ep of [200, 250, 300, 350, 400, 500, 600, 800]) {
    const s = states[ep];
    check(s.sa.on >= 0.9 && s.sa.share[0] >= 0.4 && s.sa.share[0] <= 0.6, `эпох ${ep}: М2 проходит (${p100(s.sa.on)}%, ${p100(s.sa.share[0])}/${p100(s.sa.share[1])})`);
    check(s.rs.on < 0.2 && s.rr < 0.5, `эпох ${ep}: регрессия в центре (на спиралях ${p100(s.rs.on)}%, радиус ${f(s.rr, 2)}) → ставка «облаком в центре»`);
    check(s.Sstar >= 6 && s.Sstar < 30 && s.m3.length > 0, `эпох ${ep}: М3 — DDPM держит форму до ${s.Sstar} шагов (ставка «примерно до 10»), теряет при ${s.m3.join(', ')}`);
    check(s.m4.length > 0 && s.verdict >= 0.05 && s.P[8].outer < 0.25, `эпох ${ep}: М4 проходит при ${s.m4.join(', ')} шагах; на 8 шагах DDIM − DDPM = ${p100(s.verdict)} п. п. → второе объяснение; DDPM на 8 шагах ${p100(s.P[8].outer)}% < 25%`);
    check(s.adj >= 10, `эпох ${ep}: М5 — на карте бассейнов ${s.adj} пар соседних узлов (в 0,1 друг от друга) с финишами на разных спиралях`);
  }
  // пара для браузерного теста (200 эпох)
  NUM.lab = { loss200: states[200].L, on200: states[200].sa.on, pairAngle: states[200].pairs[0], m4at200: states[200].m4, Sstar200: states[200].Sstar, m3at200: states[200].m3 };
}
function guideNumbers() {
  console.log('Node: guidance');
  const Dc = D.denoiser({ seed: 6, classes: 2 }); const cpu0 = process.cpuUsage();
  for (const e of D.trainGen(Dc, DATA, { steps: 3000, every: 3000, rng: D.rng(24), pUncond: 0.2, lr: (s) => (s < 2100 ? 3e-3 : 1e-3) }));
  const u = process.cpuUsage(cpu0), sec = (u.user + u.system) / 1e6, rows = {};
  for (const w of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8]) { const s = D.sample(D.cfgEps(Dc, 0, w), LIN, { n: 500, steps: 20, eta: 0, seed: 3 }); rows[w] = D.precCov(DATA, NN, s.x, 500, 0); }
  console.log('  ' + Object.entries(rows).map(([w, m]) => `w${w} ${p100(m.prec, 1)}/${p100(m.cov, 1)}`).join(' · '));
  const zone = Object.entries(rows).filter(([, m]) => m.prec >= 0.95 && m.cov >= 0.5).map(([w]) => w);
  check(sec < 12, `условная сеть учится ${f(sec, 1)} с процессорного времени`);
  check(rows[0].prec >= 0.65 && rows[0].prec < 0.95, `без guidance на спирали 1 ${p100(rows[0].prec, 1)}% точек → ставка «около 80%»`);
  check(zone.length >= 2 && zone.includes('2'), `в зелёной зоне (точность ≥ 95%, покрытие ≥ 50%): w = ${zone.join(', ')}`);
  check(rows[8].prec < 0.8 && rows[8].cov < 0.4, `при w = 8 точность падает до ${p100(rows[8].prec, 1)}%, покрыто ${p100(rows[8].cov, 1)}%`);
  NUM.guide = rows;
}
function memoNumbers() {
  console.log('Node: память или обобщение');
  const fresh = D.spirals(2000, 99), res = {};
  for (const N of [4, 8, 16, 32, 64, 128]) {
    const sub = D.subset(DATA, N, 3), nnT = D.nnIndex(sub, 0.1), cp = (x, n) => D.copies(nnT, x, n, 0.02);
    const ideal = cp(D.sample(D.exactEps(sub, LIN), LIN, { n: 300, steps: 50, eta: 0, seed: 4 }).x, 300);
    const Dn = D.denoiser({ seed: 5 }), curve = [cp(D.sample(D.netEps(Dn), LIN, { n: 300, steps: 50, eta: 0, seed: 4 }).x, 300)];
    const cpu0 = process.cpuUsage();
    for (const e of D.trainGen(Dn, sub, { steps: 8000, bs: 64, every: 50, rng: D.rng(31), lr: 3e-3 })) if (Dn.steps % 1000 === 0) curve.push(cp(D.sample(D.netEps(Dn), LIN, { n: 300, steps: 50, eta: 0, seed: 4 }).x, 300));
    const u = process.cpuUsage(cpu0); res[N] = { ideal, curve, chance: cp(fresh.X, fresh.N), sec: (u.user + u.system) / 1e6 };
    console.log(`  N = ${N}: идеальный ${p100(ideal)}% · сеть ${curve.map((c) => p100(c)).join(' ')} · случайно ${p100(res[N].chance, 1)}% · ${f(res[N].sec, 1)} с`);
  }
  const c8 = res[8].curve, first = c8.findIndex((c, i) => i > 0 && c > 0.5 && c8[i - 1] <= 0.5);
  check(c8[8] > 0.5 && c8[8] - c8[1] > 0.1, `N = 8: копий через 1000 шагов ${p100(c8[1])}%, к 8000 — ${p100(c8[8])}% → ставка «будет расти»`);
  check(first > 0 && c8.filter((c, i) => i > 0 && c > 0.5 && c8[i - 1] <= 0.5).length === 1, `М2: первый замер с копиями больше половины — шаг ${first * 1000} (${p100(c8[first - 1])}% → ${p100(c8[first])}%)`);
  const ok = [4, 8, 16, 32, 64, 128].filter((N) => res[N].curve[8] < 0.25);
  check(ok.length && ok[0] === 128, `М3: копий в конце меньше 25% при N = ${ok.join(', ')}; ${[16, 32, 64, 128].map((N) => `N ${N}: ${p100(res[N].curve[8])}%`).join(', ')}`);
  check(Object.values(res).every((x) => x.ideal >= 0.99), 'идеальный денойзер копирует 100% при любом N');
  check(res[128].chance < 0.06, `свежие точки со спиралей случайно «копии» в ${p100(res[128].chance, 1)}% при N = 128 (в тексте «меньше 6%»)`);
  NUM.memo = { first: first * 1000, c8, end: Object.fromEntries(Object.entries(res).map(([N, x]) => [N, x.curve[8]])) };
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l14.mis.${key}.ctx.done[window.__l14.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(150); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) { await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`); await sleep(200); await p.waitFor(`!window.__l14.mis.${key}.busy`, 180000); await sleep(100); }
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(200); }
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(10); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(80);
}
/** Рисуем прогноз ᾱ мышью: v(t) — вид кривой, точки в логических координатах графика. */
async function drawForecast(p, v) {
  const box = await p.eval('window.__l14.AB.api.box()'), pts = [];
  for (let i = 0; i <= 40; i++) { const t = i * 25; pts.push(await cpt(p, '#abPlot', 420, box.l + t / 1000 * (box.r - box.l), box.b - v(t) * (box.b - box.t))); }
  await mouseDrag(p, pts);
}
const labMap = (x, y) => [260 + x * 520 / 4.8, 260 - y * 520 / 4.8];

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" && typeof Cards !== "undefined" && !document.querySelector(".c-sort")'), 'нет пошаговой карточки guide.js и сортировки карточек');
  await p.eval('window.__l14.SPEED.k = 6');
  await p.shot(out('l14-hero.png'));

  // --- 1. прогноз ᾱ: рисуем мышью ---
  await center(p, '#abMis');
  await go(p, '#abMis', 'ab');
  check(!(await done(p, 'ab')) && /Дорисуй/.test(await p.eval('document.querySelector("#abMis .g-out").textContent')), 'прогноз: без рисунка кривая не открывается');
  await setRange(p, 'abT', 500);
  await center(p, '#abPlot');
  await drawForecast(p, (t) => Math.max(0, 1 - t / 700));
  const cov = await p.eval('window.__l14.AB.api.state().coverage');
  check(cov >= 0.9, `прогноз нарисован мышью на ${p100(cov)}% пути`);
  await p.shotEl(out('l14-forward-draw.png'), '#forward .lab', 6);
  await go(p, '#abMis', 'ab');
  check(await done(p, 'ab'), 'прогноз: ' + (await outText(p, '#abMis')).slice(0, 150));
  console.log('  журнал:', await p.eval('document.querySelector("#abMis .m-log").textContent'));
  await next(p, '#abMis');
  await p.click('#abScale button[data-v="log"]'); await setRange(p, 'abT', 1000);
  check(await done(p, 'ab'), 'конец пути: ' + (await outText(p, '#abMis')).slice(0, 110));
  await next(p, '#abMis');
  await setRange(p, 'abT', 600); check(!(await done(p, 'ab')), 'где кончается: t = 600 ещё нет');
  await setRange(p, 'abT', NUM.t1 || 674);
  check(await done(p, 'ab'), 'где кончается: ' + (await outText(p, '#abMis')).slice(0, 120));
  await next(p, '#abMis');
  check(await p.eval('!document.querySelector("#abSched").hidden'), 'прогноз, свободный режим: появилось расписание облака');
  await setRange(p, 'abT', 500);
  await p.shotEl(out('l14-forward.png'), '#forward .lab', 6);

  // --- 2. перемотка генерации ---
  await center(p, '#scMis');
  check(await p.eval('document.querySelector("#rwPlay").hidden'), 'перемотка: «Проиграть» скрыта до свободного режима');
  await setRange(p, 'rwStep', NUM.J1 - 1); check(!(await done(p, 'score')), `перемотка: шаг ${NUM.J1 - 1} — ещё не граница`);
  await setRange(p, 'rwStep', NUM.J1);
  check(await done(p, 'score'), `перемотка «к центру», шаг ${NUM.J1}: ` + (await outText(p, '#scMis')).slice(0, 120));
  await next(p, '#scMis');
  await p.click('#rwNext'); await sleep(80);
  await setRange(p, 'rwStep', NUM.J2);
  check(await done(p, 'score'), `перемотка «к виткам», шаг ${NUM.J2}: ` + (await outText(p, '#scMis')).slice(0, 140));
  const ph = await p.eval('window.__l14.Score.api.phases()');
  check(ph.J1 === NUM.J1 && ph.J2 === NUM.J2, `этапы в браузере совпадают с Node: ${ph.J1} и ${ph.J2}`);
  await p.shotEl(out('l14-score.png'), '#score .lab', 6);
  await next(p, '#scMis');
  // пробная точка: тащим мышью
  const pr0 = await cpt(p, '#scCv', 420, 210 + 0.55 * 420 / 4.6, 210 + 0.32 * 420 / 4.6), pr1 = await cpt(p, '#scCv', 420, 210 + 0.2 * 420 / 4.6, 210 - 0.9 * 420 / 4.6);
  await mouseDrag(p, [pr0, { x: (pr0.x + pr1.x) / 2, y: (pr0.y + pr1.y) / 2 }, pr1]);
  const probe = await p.eval('window.__l14.Score.st.probe');
  check(Math.abs(probe.x - 0.2) < 0.05 && Math.abs(probe.y - 0.9) < 0.05, `пробная точка перетащена мышью → (${f(probe.x, 2)}; ${f(probe.y, 2)})`);
  await p.click('#rwPlay'); await p.waitFor('window.__l14.Score.st.j === 50 && !window.__l14.Score.st.playing', 30000);
  check(true, 'перемотка: «Проиграть генерацию» дошла до шага 50');

  // --- 3. лаборатория ---
  await center(p, '#labMis');
  check(await p.eval('document.querySelector("#wrapSteps").hidden && document.querySelector("#labTrain").hidden && !document.querySelector("#wrapEpochs").hidden'), 'лаборатория М1: видна только ручка эпох');
  check(await p.eval('document.querySelector("#labMis .g-go").disabled'), 'лаборатория М1: кнопка заблокирована до ставки');
  await bet(p, '#labMis', 'Выйдет на плато');
  const tTrain = Date.now(); await go(p, '#labMis', 'lab'); const secTrain = (Date.now() - tTrain) / 1000;
  const l1 = await p.eval('window.__l14.Lab.api.state()');
  check(!(await done(p, 'lab')) && l1.epochs === 100, `М1, 100 эпох: ошибка ${f(l1.loss, 4)} — порог ещё не пройден (${f(secTrain, 1)} с)`);
  await go(p, '#labMis', 'lab');
  const l2 = await p.eval('window.__l14.Lab.api.state()');
  check(await done(p, 'lab') && l2.epochs === 200 && Math.abs(l2.loss - NUM.lab.loss200) < 1e-6, `М1, 200 эпох: ошибка ${f(l2.loss, 4)} (в Node ${f(NUM.lab.loss200, 4)}) — ` + (await outText(p, '#labMis')).slice(0, 90));
  check(await p.eval('document.querySelector("#labMis .m-bet .bet-right") !== null && document.querySelector("#labMis .m-bet .bet-wrong") === null'), 'М1: ставка «плато» отмечена ✓');
  await p.shotEl(out('l14-lab-train.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#labTrain").hidden'), 'М2: появилась кнопка «Дообучить»');
  await bet(p, '#labMis', 'Облаком'); await go(p, '#labMis', 'lab');
  const g2 = await p.eval('window.__l14.mis.lab.ctx.results[1]');
  check(await done(p, 'lab') && Math.abs(g2.A.on - NUM.lab.on200) < 1e-9, `М2: DDPM 100 шагов — на спиралях ${p100(g2.A.on)}% (в Node ${p100(NUM.lab.on200)}%), доли ${p100(g2.A.share[0])}/${p100(g2.A.share[1])}; регрессия ${p100(g2.reg.on)}%, радиус ${f(g2.regR, 2)}`);
  await p.shotEl(out('l14-lab-gen.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapSteps").hidden'), 'М3: появился ползунок шагов');
  await bet(p, '#labMis', 'Примерно до 10');
  await setRange(p, 'labSteps', 11); await go(p, '#labMis', 'lab');
  check(!(await done(p, 'lab')), 'М3, 50 шагов: форма держится — ' + (await p.eval('document.querySelector("#labMis .g-out").textContent')).slice(0, 60));
  const s3 = NUM.lab.m3at200[NUM.lab.m3at200.length - 1], idx3 = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100, 200].indexOf(s3);
  await setRange(p, 'labSteps', idx3); await go(p, '#labMis', 'lab');
  check(await done(p, 'lab') && await p.eval('document.querySelector("#labMis .m-bet .bet-right") !== null && document.querySelector("#labMis .m-bet .bet-wrong") === null'), `М3, ${s3} шагов: ` + (await outText(p, '#labMis')).slice(0, 140));
  console.log('  журнал М3:', await p.eval('document.querySelector("#labMis .m-log").textContent'));
  await next(p, '#labMis');
  check(await p.eval('window.__l14.Lab.api.state().duo && window.__l14.Lab.api.state().S === 8 && !document.querySelector("#labPaneB").hidden'), 'М4: DDIM рядом включён, 8 шагов');
  await bet(p, '#labMis', 'Виноват способ'); await go(p, '#labMis', 'lab');
  const g4 = await p.eval('window.__l14.mis.lab.ctx.results[3]');
  const m4ok = await done(p, 'lab');
  check(await p.eval('document.querySelector("#labMis .m-bet .bet-right") !== null && document.querySelector("#labMis .m-bet .bet-wrong") === null'), `М4: спор объяснений — второе подтвердилось (DDPM ${p100(g4.A.outer)}%, DDIM ${p100(g4.B.outer)}% за окружностью)`);
  if (!m4ok) { const s4 = NUM.lab.m4at200[0]; await setRange(p, 'labSteps', [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100, 200].indexOf(s4)); await go(p, '#labMis', 'lab'); }
  check(await done(p, 'lab'), 'М4: ' + (await outText(p, '#labMis')).slice(0, 150));
  await p.shotEl(out('l14-lab-duo.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('window.__l14.Lab.st.view === "basin" && document.querySelector("#labPaneB").hidden'), 'М5: режим бассейнов, одна панель');
  // тащим старты мышью к центру, по разные стороны
  await center(p, '#labCvA');
  const ag = NUM.lab.pairAngle, A0 = labMap(-1.5, 1.0), B0 = labMap(1.4, -1.1), A1 = labMap(0.1 * Math.cos(ag), 0.1 * Math.sin(ag)), B1 = labMap(-0.1 * Math.cos(ag), -0.1 * Math.sin(ag));
  const line = async (a, b) => { const q = []; for (let i = 0; i <= 10; i++) q.push(await cpt(p, '#labCvA', 520, a[0] + (b[0] - a[0]) * i / 10, a[1] + (b[1] - a[1]) * i / 10)); return q; };
  await mouseDrag(p, await line(A0, A1)); await mouseDrag(p, await line(B0, B1));
  const bs = await p.eval('window.__l14.Lab.api.state().basin');
  check(await done(p, 'lab'), `М5: старты в ${f(bs.dist, 2)} друг от друга, финиши: спирали ${bs.who.map((w) => w + 1).join(' и ')} — ` + (await outText(p, '#labMis')).slice(0, 80));
  await p.shotEl(out('l14-lab-basin.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('["#wrapEta","#wrapReg","#wrapSched","#wrapDuo","#wrapSteps"].every((s) => !document.querySelector(s).hidden)'), 'свободный режим: все ручки видны');
  await setRange(p, 'labEta', 5); await setRange(p, 'labSteps', 9);
  await p.eval('document.querySelector("#labRegChk").click()'); await go(p, '#labMis', 'lab');
  console.log('  свободный режим:', await p.eval('[...document.querySelectorAll("#labMis .m-log li")].map((l) => l.textContent).join(" | ")'));
  await p.click('#wrapSched button[data-v="cos"]'); await sleep(100);
  check(await p.eval('window.__l14.Lab.api.state().epochs === 0 && /Сеть сброшена/.test(document.querySelector("#labOut").textContent)'), 'смена расписания сбрасывает сеть: ' + (await p.eval('document.querySelector("#labOut").textContent')).slice(0, 70));
  await p.click('#labTrain'); await p.waitFor('!window.__l14.Lab.st.training && window.__l14.Lab.api.state().epochs === 100', 60000);
  check(true, 'косинусное расписание: сеть обучена кнопкой «Дообучить»');
  await p.click('#wrapSched button[data-v="lin"]'); await sleep(100);

  // --- 4. guidance ---
  await center(p, '#gdMis');
  await p.waitFor('window.__l14.Guid.st.trained', 120000);
  await bet(p, '#gdMis', 'Около 80%');
  for (const w of [0, 1, 2, 4]) { await setRange(p, 'gdW', w * 2); await go(p, '#gdMis', 'guide'); }
  const gst = await p.eval('window.__l14.Guid.api.state()');
  check(await done(p, 'guide'), `guidance: ${gst.pts.map((q) => `w ${q.w}: ${p100(q.prec, 1)}/${p100(q.cov, 1)}`).join(' · ')} — ` + (await outText(p, '#gdMis')).slice(0, 90));
  const g2v = gst.pts.find((q) => q.w === 2), n2 = NUM.guide[2];
  check(g2v && Math.abs(g2v.prec - n2.prec) < 1e-9 && Math.abs(g2v.cov - n2.cov) < 1e-9, `guidance в браузере совпадает с Node: w = 2 — ${p100(g2v.prec, 1)}% и ${p100(g2v.cov, 1)}%`);
  check(await p.eval('document.querySelector("#gdMis .m-bet .bet-right") !== null && document.querySelector("#gdMis .m-bet .bet-wrong") === null'), 'guidance: ставка «около 80%» сыграла');
  await p.shotEl(out('l14-guide.png'), '#guide .lab', 6);
  await next(p, '#gdMis');
  await p.click('#wrapCond button[data-v="1"]'); await setRange(p, 'gdW', 16); await go(p, '#gdMis', 'guide');
  console.log('  свободный режим guidance:', await p.eval('document.querySelector("#gdMis .m-log").textContent'));

  // --- 5. память ---
  await center(p, '#mmMis');
  await bet(p, '#mmMis', 'Будет расти'); await go(p, '#mmMis', 'memo');
  const r1 = await p.eval('window.__l14.mis.memo.ctx.results[0]');
  check(await done(p, 'memo') && Math.abs(r1.cEnd - NUM.memo.c8[8]) < 1e-9, `память М1: N = 8, копий ${p100(r1.c1)}% → ${p100(r1.cEnd)}% (в Node ${p100(NUM.memo.c8[8])}%)`);
  await next(p, '#mmMis');
  const fi = NUM.memo.first / 1000;
  await setRange(p, 'mmStep', fi - 1); check(!(await done(p, 'memo')), `память М2: шаг ${(fi - 1) * 1000} — ещё нет`);
  await setRange(p, 'mmStep', fi + 1); check(!(await done(p, 'memo')) || fi + 1 > 8, `память М2: шаг ${(fi + 1) * 1000} — не первый`);
  await setRange(p, 'mmStep', fi); check(await done(p, 'memo'), `память М2, шаг ${fi * 1000}: ` + (await outText(p, '#mmMis')).slice(0, 100));
  await next(p, '#mmMis');
  await p.click('#wrapN button[data-n="64"]'); await go(p, '#mmMis', 'memo');
  check(!(await done(p, 'memo')), 'память М3, N = 64: ' + (await p.eval('document.querySelector("#mmMis .g-out").textContent')).slice(0, 60));
  await p.click('#wrapN button[data-n="128"]'); await go(p, '#mmMis', 'memo');
  check(await done(p, 'memo'), 'память М3, N = 128: ' + (await outText(p, '#mmMis')).slice(0, 100));
  // шторка: тащим мышью
  const c0 = await cpt(p, '#mmCv', 420, 210, 210), c1 = await cpt(p, '#mmCv', 420, 320, 210);
  await mouseDrag(p, [c0, c1]);
  check(Math.abs(await p.eval('window.__l14.Memo.st.cx') - 320 / 420) < 0.02, 'шторка сдвинута мышью');
  await p.shotEl(out('l14-memo.png'), '#memo .lab', 6);
  await next(p, '#mmMis');

  // --- квиз с калибровкой ---
  await center(p, '#quizBox');
  check(await p.eval('document.querySelector("#quizBox .q-opt").disabled'), 'квиз: ответы закрыты, пока не выбрана уверенность');
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c, i) => { c.querySelectorAll(".q-conf button")[i % 3].click(); c.querySelector(".q-opt").click(); })');
  const qs = await p.eval('document.querySelector("#quizScore").textContent');
  check(/Итог: \d из 8/.test(qs) && /штраф калибровки/.test(qs), 'квиз: ' + qs.slice(0, 160));
  await p.shotEl(out('l14-quiz.png'), '#quiz .prose', 6);
  await p.shotEl(out('l14-steps.png'), '#steps .prose', 6);
  await p.shotEl(out('l14-finale.png'), '#finale .prose', 6);
  // тёмная тема
  await p.click('#themeBtn'); await sleep(400);
  await p.shotEl(out('l14-forward-dark.png'), '#forward .lab', 6);
  await p.shotEl(out('l14-score-dark.png'), '#score .lab', 6);
  await p.shotEl(out('l14-lab-dark.png'), '#lab .lab', 6);
  await p.shotEl(out('l14-guide-dark.png'), '#guide .lab', 6);
  await p.shotEl(out('l14-memo-dark.png'), '#memo .lab', 6);
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.eval('window.__l14.SPEED.k = 6');
  await center(m, '#abPlot');
  await drawForecast(m, (t) => Math.exp(-t / 300));
  await m.shotEl(out('l14-m-forward-draw.png'), '#forward .lab', 4);
  await center(m, '#abMis'); await go(m, '#abMis', 'ab');
  check(await done(m, 'ab'), 'телефон: прогноз нарисован и открыт');
  await m.shotEl(out('l14-m-forward.png'), '#forward .lab', 4);
  await setRange(m, 'rwStep', 30);
  await m.shotEl(out('l14-m-score.png'), '#score .lab', 4);
  await center(m, '#labMis'); await bet(m, '#labMis', 'Выйдет'); await setRange(m, 'labEpochs', 3); await go(m, '#labMis', 'lab');
  check(await done(m, 'lab'), 'телефон: сеть обучена за одно нажатие на 200 эпох');
  await m.eval('window.__l14.mis.lab.goto(1)'); await sleep(150); await bet(m, '#labMis', 'Облаком'); await go(m, '#labMis', 'lab');
  await m.eval('window.__l14.Lab.api.setDuo(true)'); await sleep(100);
  await m.shotEl(out('l14-m-lab.png'), '#lab .lab', 4);
  await m.eval('window.__l14.mis.lab.goto(4)'); await sleep(200);
  await m.shotEl(out('l14-m-lab-basin.png'), '#lab .lab', 4);
  await center(m, '#gdCv'); await m.eval('window.__l14.Guid.api.train()'); await m.waitFor('window.__l14.Guid.st.trained', 120000); await center(m, '#gdMis'); await bet(m, '#gdMis', 'Около'); await setRange(m, 'gdW', 4); await go(m, '#gdMis', 'guide');
  await m.shotEl(out('l14-m-guide.png'), '#guide .lab', 4);
  await m.shotEl(out('l14-m-memo.png'), '#memo .lab', 4);
  await m.shotEl(out('l14-m-steps.png'), '#steps .prose', 4);
  await m.shotEl(out('l14-m-quiz.png'), '#quiz .prose', 4);
  const wdt = await m.eval('document.documentElement.scrollWidth');
  check(wdt <= 390, `телефон: ширина ${wdt} из 390`);
  check(m.logs.length === 0, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
}

(async () => {
  nodeSchedules(); rewindNumbers(); labStates(); guideNumbers(); memoNumbers();
  if (process.argv[2] !== 'node') { await desktop(); await phone(); }
  console.log(fails ? `ИТОГ: ${fails} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
