/* =====================================================================
   shared/drive-core.js — движок лаб 1.1 и 1.2: дом Ады (вид сверху),
   лидар, эталонный маршрут и учитель-планировщик (pure pursuit),
   политика-MLP с ручным backprop и Adam, обучение, прогоны, DAgger.
   Без DOM: работает в браузере и в Node (для подбора параметров).
   Единицы: 1 логическая единица = 1 см; время — секунды.
   Проверочные поездки (trips) идут с общими случайными числами: старт
   и шум поездки k зависят только от зерна и k, поэтому разные политики
   сравниваются на одних и тех же стартах с одинаковым шумом.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- случайность с зерном ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* ---------- план дома: 6 × 4 м ---------- */
  const W = 600, H = 400, R = 18;            // радиус Ады, см
  const WALLS = [                              // прямоугольники [x0, y0, x1, y1]
    [-10, -10, 610, 0], [-10, 400, 610, 410], [-10, -10, 0, 410], [600, -10, 610, 410], // внешний контур
    [196, 0, 204, 250], [196, 330, 204, 400],   // стена с проёмом 1 (y 250..330)
    [396, 0, 404, 70], [396, 150, 404, 400],    // стена с проёмом 2 (y 70..150)
  ];
  const FURN = [
    { r: [222, 344, 378, 396], name: 'диван' },
    { r: [430, 4, 570, 46], name: 'шкаф' },
    { r: [500, 344, 596, 396], name: 'стол' },
    { r: [4, 4, 70, 60], name: 'тумба' },
  ];
  const OBST = WALLS.concat(FURN.map((f) => f.r));
  const START = { x: 80, y: 320, th: -0.25 };
  const GOAL = { x: 515, y: 285, r: 30 };
  const DOCK = { x: 48, y: 340 };

  /* ---------- эталонный маршрут: сглаженная ломаная ---------- */
  const WP = [[80, 320], [150, 300], [200, 290], [255, 275], [320, 200], [372, 125], [400, 110], [445, 118], [492, 180], [515, 285]];
  function catmull(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
  const PATH = [];
  for (let i = 0; i < WP.length - 1; i++) {
    const p0 = WP[Math.max(0, i - 1)], p1 = WP[i], p2 = WP[i + 1], p3 = WP[Math.min(WP.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) { const t = k / 12; PATH.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  PATH.push(WP[WP.length - 1]);
  const PATHS = [0]; for (let i = 1; i < PATH.length; i++) PATHS.push(PATHS[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));

  /* ---------- геометрия ---------- */
  function rectDist(x, y, r) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); return Math.hypot(dx, dy); }
  function collides(x, y) { for (const r of OBST) if (rectDist(x, y, r) < R) return true; return false; }
  function rayRect(ox, oy, dx, dy, r) { // пересечение луча с прямоугольником, расстояние или Infinity
    let t0 = 0, t1 = Infinity;
    for (const [o, d, lo, hi] of [[ox, dx, r[0], r[2]], [oy, dy, r[1], r[3]]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; }
      else { let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
    }
    return t0;
  }
  const NRAY = 9, FOV = 2.1, RMAX = 250; // 9 лучей в секторе ±120°, дальность 2,5 м
  function lidar(x, y, th) {
    const out = new Float32Array(NRAY);
    for (let i = 0; i < NRAY; i++) {
      const a = th - FOV + (2 * FOV) * i / (NRAY - 1), dx = Math.cos(a), dy = Math.sin(a);
      let best = RMAX; for (const r of OBST) { const t = rayRect(x, y, dx, dy, r); if (t < best) best = t; }
      out[i] = best;
    }
    return out;
  }
  /** Наблюдение политики: 9 лучей + положение и курс (как «одометрия»). */
  let OBS_MODE = 'goal';   // 'pose' — лучи + положение и курс; 'goal' — лучи + направление и расстояние до цели
  const OBS = NRAY + 4;
  function observe(s, out) {
    out = out || new Float32Array(OBS);
    const L = lidar(s.x, s.y, s.th);
    for (let i = 0; i < NRAY; i++) out[i] = L[i] / RMAX;
    if (OBS_MODE === 'pose') { out[NRAY] = s.x / W * 2 - 1; out[NRAY + 1] = s.y / H * 2 - 1; out[NRAY + 2] = Math.cos(s.th); out[NRAY + 3] = Math.sin(s.th); }
    else { const a = Math.atan2(GOAL.y - s.y, GOAL.x - s.x) - s.th, d = Math.hypot(GOAL.x - s.x, GOAL.y - s.y); out[NRAY] = Math.cos(a); out[NRAY + 1] = Math.sin(a); out[NRAY + 2] = d / 600; out[NRAY + 3] = 0; }
    return out;
  }

  /* ---------- учитель: pure pursuit по эталонному маршруту ---------- */
  const V = 60, WMAX = 2.2, DT = 0.05, TMAX = 26;
  function nearestIdx(x, y) { let bi = 0, bd = Infinity; for (let i = 0; i < PATH.length; i++) { const d = (PATH[i][0] - x) ** 2 + (PATH[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return { i: bi, d: Math.sqrt(bd) }; }
  function teacher(s, offset) {
    const { i } = nearestIdx(s.x, s.y);
    const target = PATHS[i] + 42; let j = i; while (j < PATH.length - 1 && PATHS[j] < target) j++;
    let px = PATH[j][0], py = PATH[j][1];
    if (offset) { const k = Math.min(j + 1, PATH.length - 1), k0 = Math.max(j - 1, 0), tx = PATH[k][0] - PATH[k0][0], ty = PATH[k][1] - PATH[k0][1], n = Math.hypot(tx, ty) || 1; px += -ty / n * offset; py += tx / n * offset; }
    const a = wrapA(Math.atan2(py - s.y, px - s.x) - s.th);
    return clamp(2.4 * a, -WMAX, WMAX);
  }
  function step(s, w) { const th = s.th + w * DT; return { x: s.x + Math.cos(th) * V * DT, y: s.y + Math.sin(th) * V * DT, th: wrapA(th) }; }
  const atGoal = (s) => Math.hypot(s.x - GOAL.x, s.y - GOAL.y) < GOAL.r;

  /** Один эпизод. ctl(s, t) → руление; noise — шум исполнения (рад/с). Возвращает траекторию и исход. */
  function rollout(ctl, opts) {
    opts = opts || {}; const r = opts.r || rng(1), noise = opts.noise || 0;
    let s = opts.start || { x: START.x, y: START.y, th: START.th };
    const traj = [s], acts = [];
    for (let t = 0; t < TMAX / DT; t++) {
      const w = ctl(s, t); acts.push(w);
      const s2 = step(s, clamp(w + (noise ? randn(r) * noise : 0), -WMAX * 1.3, WMAX * 1.3));
      traj.push(s2); s = s2;
      if (collides(s.x, s.y)) return { traj, acts, outcome: 'crash' };
      if (atGoal(s)) return { traj, acts, outcome: 'goal' };
    }
    return { traj, acts, outcome: 'timeout' };
  }
  function randStart(r, spread) { spread = spread == null ? 1 : spread; return { x: START.x + randn(r) * 8 * spread, y: START.y + randn(r) * 8 * spread, th: START.th + randn(r) * 0.12 * spread }; }

  /* ---------- демонстрации ---------- */
  /** Встроенный оператор: учитель с индивидуальным смещением от центра маршрута.
   *  dart — шум исполнения при записи; в данные пишется чистое действие оператора. */
  function demos(n, opts) {
    opts = opts || {}; const r = rng(opts.seed || 3), out = [];
    while (out.length < n) {
      const off = randn(r) * (opts.offSigma == null ? 3 : opts.offSigma), st = randStart(r, opts.startSpread == null ? 0.6 : opts.startSpread);
      const ep = rollout((s) => teacher(s, off), { start: st, noise: opts.dart || 0, r });
      if (ep.outcome === 'goal') out.push(ep);
    }
    return out;
  }
  /** Датасет из траекторий: X — наблюдения, Y — действия (в долях WMAX). */
  function toData(eps, aug, r) {
    const X = [], Y = [];
    r = r || rng(9);
    for (const ep of eps) for (let i = 0; i < ep.acts.length; i++) {
      const s = ep.traj[i]; X.push(observe(s)); Y.push(ep.acts[i] / WMAX);
      if (aug) for (const d of [-aug, aug]) { // боковые сдвиги: как боковые камеры PilotNet, метку даёт учитель
        const s2 = { x: s.x - Math.sin(s.th) * d, y: s.y + Math.cos(s.th) * d, th: s.th + randn(r) * 0.15 };
        if (!collides(s2.x, s2.y)) { X.push(observe(s2)); Y.push(teacher(s2) / WMAX); }
      }
    }
    return { X, Y };
  }

  /* ---------- MLP: вход → 48 → 48 → 1 (tanh), Adam ---------- */
  function mlp(nIn, nH, seed) {
    const r = rng(seed || 7), sizes = [nIn, nH, nH, 1], Wt = [], B = [];
    for (let l = 0; l < 3; l++) { const a = sizes[l], b = sizes[l + 1], w = new Float32Array(a * b), s = Math.sqrt(2 / a); for (let i = 0; i < w.length; i++) w[i] = randn(r) * s * (l === 2 ? 0.5 : 1); Wt.push(w); B.push(new Float32Array(b)); }
    const m = { sizes, W: Wt, B, t: 0, mW: Wt.map((w) => new Float32Array(w.length)), vW: Wt.map((w) => new Float32Array(w.length)), mB: B.map((b) => new Float32Array(b.length)), vB: B.map((b) => new Float32Array(b.length)) };
    return m;
  }
  function forward(m, x, cache) {
    let a = x; const acts = [x];
    for (let l = 0; l < 3; l++) {
      const nI = m.sizes[l], nO = m.sizes[l + 1], w = m.W[l], b = m.B[l], z = new Float32Array(nO);
      for (let o = 0; o < nO; o++) { let s = b[o]; for (let i = 0; i < nI; i++) s += a[i] * w[i * nO + o]; z[o] = l < 2 ? (s > 0 ? s : 0.01 * s) : Math.tanh(s); }
      a = z; acts.push(z);
    }
    if (cache) cache.acts = acts;
    return a[0];
  }
  /** Шаг обучения на мини-батче: MSE, ручной backprop, Adam. */
  function trainStep(m, X, Y, idx, lr) {
    const gW = m.W.map((w) => new Float32Array(w.length)), gB = m.B.map((b) => new Float32Array(b.length));
    let loss = 0; const c = {};
    for (const n of idx) {
      const yhat = forward(m, X[n], c), e = yhat - Y[n]; loss += e * e;
      let delta = new Float32Array([2 * e * (1 - yhat * yhat) / idx.length]);
      for (let l = 2; l >= 0; l--) {
        const nI = m.sizes[l], nO = m.sizes[l + 1], a = c.acts[l], w = m.W[l];
        for (let o = 0; o < nO; o++) { gB[l][o] += delta[o]; for (let i = 0; i < nI; i++) gW[l][i * nO + o] += a[i] * delta[o]; }
        if (l > 0) { const d2 = new Float32Array(nI); for (let i = 0; i < nI; i++) { let s = 0; for (let o = 0; o < nO; o++) s += w[i * nO + o] * delta[o]; d2[i] = s * (a[i] > 0 ? 1 : 0.01); } delta = d2; }
      }
    }
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    for (let l = 0; l < 3; l++) {
      for (const [P, G, M, Vv] of [[m.W[l], gW[l], m.mW[l], m.vW[l]], [m.B[l], gB[l], m.mB[l], m.vB[l]]]) {
        for (let i = 0; i < P.length; i++) { M[i] = b1 * M[i] + (1 - b1) * G[i]; Vv[i] = b2 * Vv[i] + (1 - b2) * G[i] * G[i]; P[i] -= lr * (M[i] / c1) / (Math.sqrt(Vv[i] / c2) + 1e-8); }
      }
    }
    return loss / idx.length;
  }
  /** Обучение порциями: генератор, отдаёт {it, loss}. */
  function* trainGen(m, data, opts) {
    opts = opts || {}; const iters = opts.iters || 900, bs = opts.bs || 96, lr0 = opts.lr || 0.004, r = rng(opts.seed || 11), N = data.X.length;
    let ema = null;
    for (let it = 0; it < iters; it++) {
      const idx = []; for (let k = 0; k < bs; k++) idx.push(Math.floor(r() * N));
      const lr = lr0 * (it < iters * 0.7 ? 1 : 0.3);
      const l = trainStep(m, data.X, data.Y, idx, lr);
      ema = ema == null ? l : 0.95 * ema + 0.05 * l;
      if (it % 10 === 0 || it === iters - 1) yield { it, loss: ema };
    }
  }
  function train(m, data, opts) { const g = trainGen(m, data, opts); let r; while (!(r = g.next()).done) { /* синхронно */ } return m; }
  function policy(m) { const buf = new Float32Array(OBS); return (s) => forward(m, observe(s, buf)) * WMAX; }

  /* ---------- проверочные поездки с общими случайными числами ---------- */
  const EVAL_SEED = 166;   // зерно проверки в лабораториях 1.1 и 1.2
  function tripStarts(n, seed, spread) { const rs = rng(seed == null ? EVAL_SEED : seed), out = []; for (let k = 0; k < n; k++) out.push(randStart(rs, spread == null ? 0.9 : spread)); return out; }
  function tripRng(seed, k) { return rng((seed == null ? EVAL_SEED : seed) * 7919 + k * 104729 + 1); }
  /** n поездок политики: старт k и шум поездки k не зависят от того, как ехали остальные. */
  function trips(ctl, n, opts) {
    opts = opts || {}; const seed = opts.seed == null ? EVAL_SEED : opts.seed, noise = opts.noise == null ? 0.2 : opts.noise;
    return tripStarts(n, seed, opts.spread).map((start, k) => rollout(ctl, { start, noise, r: tripRng(seed, k) }));
  }
  /** Копия сети вместе с состоянием Adam: дообучение копии не трогает оригинал. */
  function cloneModel(m) {
    const cp = (a) => a.map((x) => x.slice());
    return { sizes: m.sizes.slice(), W: cp(m.W), B: cp(m.B), t: m.t, mW: cp(m.mW), vW: cp(m.vW), mB: cp(m.mB), vB: cp(m.vB) };
  }

  /** Серия прогонов политики с разных стартов. */
  function evaluate(ctl, n, opts) {
    opts = opts || {}; const r = rng(opts.seed || 101), res = [];
    for (let k = 0; k < n; k++) res.push(rollout(ctl, { start: randStart(r, opts.spread == null ? 1 : opts.spread), noise: opts.noise == null ? 0.35 : opts.noise, r }));
    return { eps: res, ok: res.filter((e) => e.outcome === 'goal').length };
  }
  /** Итерация DAgger: прогнать политику, разметить посещённые состояния учителем. */
  function daggerLabel(ctl, n, opts) {
    opts = opts || {}; const r = rng(opts.seed || 501), X = [], Y = [], eps = [];
    for (let k = 0; k < n; k++) {
      const ep = rollout(ctl, { start: randStart(r, 1), noise: opts.noise == null ? 0.35 : opts.noise, r }); eps.push(ep);
      for (let i = 0; i < ep.traj.length - 1; i++) { const s = ep.traj[i]; X.push(observe(s)); Y.push(teacher(s) / WMAX); }
    }
    return { X, Y, eps };
  }

  const API = { rng, randn, clamp, W, H, R, WALLS, FURN, OBST, START, GOAL, DOCK, PATH, WP, NRAY, FOV, RMAX, OBS, V, WMAX, DT, TMAX,
    collides, lidar, observe, setObsMode: (m) => { OBS_MODE = m; }, teacher, step, rollout, randStart, demos, toData, mlp, forward, trainStep, trainGen, train, policy, evaluate, daggerLabel, nearestIdx,
    EVAL_SEED, tripStarts, tripRng, trips, cloneModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Drive = API;
})(typeof window !== 'undefined' ? window : globalThis);
