/* =====================================================================
   shared/kettle-core.js — движок уроков 1.3 и 1.5: дом Ады сверху,
   чайник на пути, учитель объезжает его слева или справа.
   Политики урока 1.3 видят пройденную долю пути и выдают боковое
   смещение на следующем шаге: регрессия (MSE), смесь гауссиан (NLL) и
   диффузия с точным денойзером по демонстрациям (вся поездка сразу).
   Политики урока 1.5 видят две последние точки Ады и выдают пачку из
   16 шагов: регрессия с пачками и маленький обучаемый денойзер (DDIM).
   Без DOM: работает в браузере и в Node (для подбора параметров).
   Единицы: см, шаг 0,1 с. Ось y на экране смотрит вниз, Ада едет вверх.
   Все случайности — с зерном: одинаковые настройки дают одинаковые цифры.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- случайность ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  /* ---------- дом: гостиная внизу, кухня наверху, между ними проём ---------- */
  const W = 600, H = 400;
  const RA = 18, RK = 13, V = 6, UMAX = 9;          // радиус Ады и чайника, шаг вперёд и боковой предел за шаг
  const RX = 300;                                    // эталонный маршрут — прямая x = 300
  const START = { x: RX, y: 362 }, GOAL = { x: RX, y: 50 };
  const T = Math.round((START.y - GOAL.y) / V);      // 52 шага
  const KETTLE = { x: RX, y: 254 };
  const DOOR = { x0: 236, x1: 364, y0: 100, y1: 108 };
  const WALLS = [[0, DOOR.y0, DOOR.x0, DOOR.y1], [DOOR.x1, DOOR.y0, W, DOOR.y1]];
  const FURN = [
    { r: [8, 8, 196, 50], name: 'плита и мойка' },
    { r: [404, 8, 592, 50], name: 'шкаф' },
    { r: [256, 8, 344, 26], name: 'стол' },
    { r: [18, 168, 96, 330], name: 'диван' },
    { r: [500, 196, 580, 280], name: 'кресло' },
    { r: [450, 352, 592, 392], name: 'тумба' },
  ];
  const OBST = WALLS.concat(FURN.map((f) => f.r));
  function rectDist(x, y, r) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); return Math.hypot(dx, dy); }
  /** Расстояние от центра диска до ближайшей стены или мебели (включая внешние стены). */
  function clearance(x, y) { let d = Math.min(x, W - x, y, H - y); for (const r of OBST) d = Math.min(d, rectDist(x, y, r)); return d; }
  /** Чайник можно поставить сюда: не в мебели, не у старта и цели. */
  function kettleOK(k) {
    if (clearance(k.x, k.y) < RK + 2) return false;
    if (Math.hypot(k.x - START.x, k.y - START.y) < RA + RK + 30) return false;
    if (Math.hypot(k.x - GOAL.x, k.y - GOAL.y) < RA + RK + 30) return false;
    return true;
  }
  /** Чайник перекрывает эталонный маршрут: Ада по прямой его заденет. */
  const onRoute = (k) => Math.abs(k.x - RX) < RA + RK && k.y < START.y && k.y > GOAL.y;
  /** Касание: расстояние от отрезка a→b до центра чайника меньше суммы радиусов. */
  function segHit(a, b, k) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((k.x - a.x) * dx + (k.y - a.y) * dy) / L2, 0, 1);
    return Math.hypot(a.x + dx * t - k.x, a.y + dy * t - k.y) < RA + RK;
  }

  /* ---------- учитель: объезд слева или справа ----------
     Желаемое боковое положение: от старта Ада выходит на маршрут, у чайника
     смещается в сторону объезда, за чайником возвращается. Смещение у чайника
     ровно такое, чтобы пройти мимо с запасом; если сбоку стена или мебель,
     этой стороны нет. Сторону −1 называем «слева» (по ходу Ады слева = на экране слева). */
  const TP = { gap: 22, gapJ: 4, w: 96, wJ: 6, startJ: 0, noise: 0.5, wob: 0 };
  function bump(y, k, w) { const u = Math.abs(y - k.y) / w, u0 = (RK + RA + 4) / w; return u <= u0 ? 1 : u >= 1 ? 0 : smooth((1 - u) / (1 - u0)); }
  function plan(k, side, gap, w) {
    const dk = k.x - RX, C = RK + RA + gap, peak = side < 0 ? Math.min(0, dk - C) : Math.max(0, dk + C);
    return (y) => RX + peak * bump(y, k, w);
  }
  /** Проходим ли путь целиком: диск Ады не ближе 2 см к стенам и мебели. */
  function pathFree(f) { for (let t = 0; t <= T; t++) { const y = START.y - V * t; if (clearance(f(y), y) < RA + 2) return false; } return true; }
  /** Какие стороны объезда возможны для чайника k. */
  function sides(k) { return { left: pathFree(plan(k, -1, TP.gap, TP.w)), right: pathFree(plan(k, 1, TP.gap, TP.w)) }; }
  /** Одна демонстрация: учитель ведёт Аду по плану, рука оператора чуть дрожит. */
  function demo(k, side, r) {
    let gap = TP.gap + Math.abs(randn(r)) * TP.gapJ, w = TP.w + randn(r) * TP.wJ, f = plan(k, side, gap, w);
    if (!pathFree(f)) { gap = TP.gap; w = TP.w; f = plan(k, side, gap, w); }
    // плавное покачивание руки оператора: сумма трёх синусоид со случайными фазами
    const ph = [r() * 6.283, r() * 6.283, r() * 6.283], am = [randn(r), randn(r), randn(r)];
    const wob = (t) => TP.wob * (am[0] * Math.sin(t / 3.1 + ph[0]) + am[1] * Math.sin(t / 1.9 + ph[1]) + 0.5 * am[2] * Math.sin(t / 1.2 + ph[2])) / 1.5;
    let x = START.x + randn(r) * TP.startJ, y = START.y, nz = 0;
    const xs = new Float64Array(T + 1); xs[0] = x;
    for (let t = 0; t < T; t++) {
      const yn = y - V, tgt = f(yn) + wob(t + 1), prev = f(y) + wob(t);
      nz = 0.6 * nz + randn(r) * TP.noise;
      x += clamp(0.65 * (tgt - x) + (tgt - prev), -UMAX, UMAX) + nz; y = yn; xs[t + 1] = x;
    }
    return { side, xs };
  }
  /** Набор демонстраций. pLeft — доля объездов слева: ровно round(n·pLeft) поездок слева,
   *  какие именно — решает перемешивание с зерном. Если сторона закрыта, все едут другой. */
  function makeDemos(o) {
    const n = o.n, k = o.kettle || KETTLE, seed = o.seed || 1, r = rng(seed * 7919 + 13), ok = sides(k);
    let nl = Math.round(n * o.pLeft);
    if (!ok.left) nl = 0; if (!ok.right) nl = ok.left ? n : nl;
    const sd = []; for (let i = 0; i < n; i++) sd.push(i < nl ? -1 : 1);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sd[i], sd[j]] = [sd[j], sd[i]]; }
    const blocked = !ok.left && !ok.right;
    const demos = blocked ? [] : sd.map((s) => demo(k, s, r));
    return { demos, kettle: { x: k.x, y: k.y }, nLeft: demos.filter((d) => d.side < 0).length, nRight: demos.filter((d) => d.side > 0).length, open: ok, blocked };
  }
  /** Монетка вместо точной доли: каждая поездка выбирает сторону сама. */
  function makeDemosCoin(o) {
    const n = o.n, k = o.kettle || KETTLE, r = rng((o.seed || 1) * 104729 + 7), demos = [];
    for (let i = 0; i < n; i++) demos.push(demo(k, r() < o.pLeft ? -1 : 1, r));
    return { demos, kettle: { x: k.x, y: k.y }, nLeft: demos.filter((d) => d.side < 0).length, nRight: demos.filter((d) => d.side > 0).length, open: sides(k), blocked: false };
  }
  /** Плотность демонстраций для тепловой карты: сетка gw×gh по сцене. */
  function heat(demos, gw, gh) {
    const g = new Float32Array(gw * gh); let mx = 0;
    for (const d of demos) for (let t = 0; t <= T; t++) {
      const i = Math.floor(d.xs[t] / W * gw), j = Math.floor((START.y - V * t) / H * gh);
      if (i >= 0 && i < gw && j >= 0 && j < gh) { g[j * gw + i]++; mx = Math.max(mx, g[j * gw + i]); }
    }
    return { g, gw, gh, mx };
  }

  /* ---------- маленькая нейросеть: полносвязная, tanh, Adam ---------- */
  function net(sizes, seed) {
    const r = rng(seed || 3), L = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const a = sizes[i], b = sizes[i + 1], w = new Float64Array(a * b), s = Math.sqrt(1 / a);
      for (let j = 0; j < w.length; j++) w[j] = randn(r) * s;
      L.push({ a, b, w, bias: new Float64Array(b), gw: new Float64Array(a * b), gb: new Float64Array(b), mw: new Float64Array(a * b), vw: new Float64Array(a * b), mb: new Float64Array(b), vb: new Float64Array(b), h: new Float64Array(b), d: new Float64Array(b) });
    }
    return { sizes, L, t: 0, x: null };
  }
  function fwd(m, x) {
    m.x = x; let h = x;
    for (let li = 0; li < m.L.length; li++) {
      const l = m.L[li], o = l.h, last = li === m.L.length - 1;
      for (let j = 0; j < l.b; j++) o[j] = l.bias[j];
      for (let i = 0; i < l.a; i++) { const hi = h[i]; if (hi === 0) continue; const off = i * l.b; for (let j = 0; j < l.b; j++) o[j] += hi * l.w[off + j]; }
      if (!last) for (let j = 0; j < l.b; j++) o[j] = Math.tanh(o[j]);
      h = o;
    }
    return h;
  }
  /** Обратный проход после fwd: g — градиент по выходу; копит градиенты весов. */
  function bwd(m, g) {
    let d = g;
    for (let li = m.L.length - 1; li >= 0; li--) {
      const l = m.L[li], hin = li ? m.L[li - 1].h : m.x, dl = l.d;
      for (let j = 0; j < l.b; j++) dl[j] = li === m.L.length - 1 ? d[j] : d[j] * (1 - l.h[j] * l.h[j]);
      for (let j = 0; j < l.b; j++) l.gb[j] += dl[j];
      const din = li ? m.L[li - 1].d2 || (m.L[li - 1].d2 = new Float64Array(l.a)) : null;
      for (let i = 0; i < l.a; i++) {
        const off = i * l.b, hi = hin[i]; let s = 0;
        for (let j = 0; j < l.b; j++) { l.gw[off + j] += hi * dl[j]; s += l.w[off + j] * dl[j]; }
        if (din) din[i] = s;
      }
      d = din;
    }
  }
  function adam(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    for (const l of m.L) for (const [P, G, M, Vv] of [[l.w, l.gw, l.mw, l.vw], [l.bias, l.gb, l.mb, l.vb]]) {
      for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; Vv[i] = b2 * Vv[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(Vv[i] / c2) + 1e-8); G[i] = 0; }
    }
  }
  function nparams(m) { return m.L.reduce((s, l) => s + l.w.length + l.bias.length, 0); }

  /* ---------- урок 1.3: политики видят пройденную долю пути ----------
     Наблюдение — одно число s = t/T. Действие — боковое смещение от маршрута
     на шаге t+1 (в см, для сети делим на SC). Регулятор Ады тянет её к этому
     смещению не быстрее UMAX за шаг. */
  const SC = 50;
  const obs13 = (t) => (t / T) * 2 - 1;
  function data13(demos) {
    const X = [], Y = [];
    for (const d of demos) for (let t = 0; t < T; t++) { X.push(obs13(t)); Y.push((d.xs[t + 1] - RX) / SC); }
    return { X, Y };
  }
  /** Регрессия с MSE: генератор шагов обучения (для пошагового запуска в браузере). */
  function* trainReg13(demos, o) {
    o = o || {}; const { X, Y } = data13(demos), m = net([1, 32, 32, 1], o.seed || 3), r = rng((o.seed || 3) + 101), it = o.iters || 1200, bs = 32;
    const x = new Float64Array(1), g = new Float64Array(1); let ema = null;
    for (let k = 0; k < it; k++) {
      let L = 0;
      for (let b = 0; b < bs; b++) { const i = Math.floor(r() * X.length); x[0] = X[i]; const y = fwd(m, x)[0], e = y - Y[i]; L += e * e; g[0] = 2 * e; bwd(m, g); }
      adam(m, (o.lr || 0.004) * (k < it * 0.7 ? 1 : 0.3), bs); L /= bs; ema = ema == null ? L : 0.95 * ema + 0.05 * L;
      if (k % 20 === 0 || k === it - 1) yield { it: k, iters: it, loss: ema };
    }
    return { kind: 'reg', m };
  }
  /* Смесь гауссиан, обучение по отрицательному логарифму правдоподобия. */
  const SMIN = 0.03, SMAX = 1.2, HC13 = 24;
  const sigm = (z) => 1 / (1 + Math.exp(-z));
  /** Начальные смещения выхода смеси: центры компонент разнесены, ширина умеренная. */
  function gmmInit(m, K, HC) {
    const l = m.L[m.L.length - 1];
    for (let i = 0; i < l.a; i++) for (let j = 0; j < l.b; j++) l.w[i * l.b + j] *= 0.3;
    for (let k = 0; k < K; k++) { const c = K > 1 ? -0.9 + 1.8 * k / (K - 1) : 0; for (let d = 0; d < HC; d++) { l.bias[K + k * HC + d] = c * Math.min(1, (d + 1) / 10); l.bias[K + K * HC + k * HC + d] = -2.5; } }
  }
  /** Смесь K гауссиан над пачкой: на каждом шаге сеть предлагает K планов
   *  бокового смещения на HC шагов вперёд, их вероятности и ширину по каждому шагу. */
  function gmmEval(m, x, K, HC) {
    const out = fwd(m, x); let mx = -1e9; for (let k = 0; k < K; k++) mx = Math.max(mx, out[k]);
    const pi = new Float64Array(K); let z = 0;
    for (let k = 0; k < K; k++) { pi[k] = Math.exp(out[k] - mx); z += pi[k]; }
    for (let k = 0; k < K; k++) pi[k] /= z;
    return { pi, mu: (k, d) => out[K + k * HC + d], sg: (k, d) => SMIN + (SMAX - SMIN) * sigm(out[K + K * HC + k * HC + d]), out };
  }
  function chunk13(d, t, HC, out) { for (let j = 0; j < HC; j++) out[j] = (d.xs[Math.min(T, t + 1 + j)] - RX) / SC; return out; }
  function* trainGMM13(demos, K, o) {
    o = o || {}; K = K || 2; const HC = o.HC || HC13, NO = K + 2 * K * HC;
    const m = net([1, o.hid || 32, o.hid || 32, NO], (o.seed || 3) + 7), r = rng((o.seed || 3) + 202), it = o.iters || 1600, bs = 32;
    gmmInit(m, K, HC);
    const X = [], Y = [];
    for (const d of demos) for (let t = 0; t < T; t++) { X.push(obs13(t)); Y.push(chunk13(d, t, HC, new Float64Array(HC))); }
    const x = new Float64Array(1), g = new Float64Array(NO), lp = new Float64Array(K), sgv = new Float64Array(K * HC); let ema = null;
    for (let k = 0; k < it; k++) {
      let L = 0;
      for (let b = 0; b < bs; b++) {
        const i = Math.floor(r() * X.length); x[0] = X[i];
        const out = fwd(m, x), y = Y[i]; let mx = -1e9;
        for (let c = 0; c < K; c++) mx = Math.max(mx, out[c]);
        let zs = 0; for (let c = 0; c < K; c++) zs += Math.exp(out[c] - mx);
        let lmx = -1e9;
        for (let c = 0; c < K; c++) {
          let s2 = Math.log(Math.exp(out[c] - mx) / zs + 1e-12);
          for (let d = 0; d < HC; d++) { const sv = SMIN + (SMAX - SMIN) * sigm(out[K + K * HC + c * HC + d]); sgv[c * HC + d] = sv; const e = (y[d] - out[K + c * HC + d]) / sv; s2 += -0.5 * e * e - Math.log(sv); }
          lp[c] = s2; lmx = Math.max(lmx, s2);
        }
        let s = 0; for (let c = 0; c < K; c++) s += Math.exp(lp[c] - lmx);
        L += (-(lmx + Math.log(s))) / HC - 0.919;
        for (let c = 0; c < K; c++) {
          const rc = Math.exp(lp[c] - lmx) / s, pc = Math.exp(out[c] - mx) / zs;
          g[c] = pc - rc;
          for (let d = 0; d < HC; d++) {
            const sv = sgv[c * HC + d], e = (y[d] - out[K + c * HC + d]) / sv, sz = (sv - SMIN) / (SMAX - SMIN);
            g[K + c * HC + d] = -rc * e / sv;
            g[K + K * HC + c * HC + d] = rc * (1 - e * e) / sv * (SMAX - SMIN) * sz * (1 - sz);
          }
        }
        bwd(m, g);
      }
      adam(m, (o.lr || 0.004) * (k < it * 0.7 ? 1 : 0.3), bs); L /= bs; ema = ema == null ? L : 0.95 * ema + 0.05 * L;
      if (k % 20 === 0 || k === it - 1) yield { it: k, iters: it, loss: ema };
    }
    return { kind: 'gmm', m, K, HC };
  }
  /** Прогнать генератор до конца синхронно (в Node и в тестах). */
  function finish(gen, onEv) { for (;;) { const r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); } }

  /* ---------- диффузия урока 1.3: вся поездка сразу, точный денойзер ----------
     Сэмплируем профиль бокового смещения из 27 точек (каждые 2 шага).
     Денойзер точный: для зашумлённого профиля он возвращает взвешенное среднее
     демонстраций, веса — правдоподобие шума (как на главной). Обучения нет. */
  const abar = (tau) => { const v = Math.cos(((tau + 0.008) / 1.008) * Math.PI / 2); return Math.min(0.99995, v * v); };
  const D13 = Math.floor(T / 2) + 1;
  function prof13(d) { const v = new Float64Array(D13); for (let j = 0; j < D13; j++) v[j] = (d.xs[Math.min(T, 2 * j)] - RX) / SC; return v; }
  function diff13(demos) { return { kind: 'diff', mus: demos.map(prof13) }; }
  /** DDIM с точным денойзером по набору векторов mus (с весами prior, если заданы). */
  function ddimExact(mus, prior, D, steps, r, keep) {
    const N = mus.length, lw = new Float64Array(N); let x = new Float64Array(D);
    for (let d = 0; d < D; d++) x[d] = randn(r);
    const frames = keep ? [Float64Array.from(x)] : null, x0s = keep ? [] : null;
    for (let k = 0; k < steps; k++) {
      const a = abar(1 - k / steps), a2 = abar(1 - (k + 1) / steps), sa = Math.sqrt(a), sv = Math.sqrt(1 - a);
      let mx = -Infinity;
      for (let i = 0; i < N; i++) { let s = 0; const m = mus[i]; for (let d = 0; d < D; d++) { const e = x[d] - sa * m[d]; s += e * e; } lw[i] = -s / (2 * (1 - a)) + (prior ? Math.log(prior[i] + 1e-300) : 0); if (lw[i] > mx) mx = lw[i]; }
      let z = 0; for (let i = 0; i < N; i++) { lw[i] = Math.exp(lw[i] - mx); z += lw[i]; }
      const x0 = new Float64Array(D);
      for (let i = 0; i < N; i++) { const w = lw[i] / z; if (w < 1e-12) continue; const m = mus[i]; for (let d = 0; d < D; d++) x0[d] += w * m[d]; }
      const nx = new Float64Array(D), sa2 = Math.sqrt(a2), sv2 = Math.sqrt(1 - a2);
      for (let d = 0; d < D; d++) { const eps = (x[d] - sa * x0[d]) / sv; nx[d] = sa2 * x0[d] + sv2 * eps; }
      x = nx; if (keep) { frames.push(Float64Array.from(x)); x0s.push(x0); }
    }
    return keep ? { x, frames, x0s } : x;
  }

  /* ---------- прогон политики урока 1.3 ----------
     mode: 'step' — смесь выбирает компоненту на каждом шаге; 'chunk' — раз в H шагов.
     Возвращает путь, касания чайника и смены стороны. */
  /** Стороны объезда: смотрим, по какую сторону от чайника Ада, пока она подъезжает
   *  к нему и проезжает мимо (от 100 см до чайника до момента, когда он позади).
   *  Мёртвая зона 6 см: мелкое дрожание у маршрута сменой стороны не считаем. */
  function sideTrack(xs, k) {
    let side = 0, sw = 0, pass = 0;
    for (let t = 0; t <= T; t++) {
      const y = START.y - V * t; if (y > k.y + 100 || y < k.y - RA - RK) continue;
      const d = xs[t] - k.x, s = d > 6 ? 1 : d < -6 ? -1 : 0;
      if (s && side && s !== side) sw++; if (s) side = s;
      if (Math.abs(y - k.y) < RA + RK && s) pass = s;   // с какой стороны Ада поравнялась с чайником
    }
    return { sw, side: pass || side };
  }
  function run13(pol, k, seed, o) {
    o = o || {};
    const r = rng(seed * 9973 + 17), H = o.H || T, mode = o.mode || 'chunk';
    let x = START.x + randn(r) * 2, comp = -1, prof = null, plan13 = null, t0 = 0;
    if (pol.kind === 'diff') { const v = ddimExact(pol.mus, null, D13, o.steps || 30, r); prof = (t) => { const f = t / 2, j = Math.min(D13 - 2, Math.floor(f)), u = f - j; return RX + SC * (v[j] * (1 - u) + v[j + 1] * u); }; }
    const xs = new Float64Array(T + 1), xin = new Float64Array(1), comps = []; xs[0] = x;
    let touch = false;
    for (let t = 0; t < T; t++) {
      let tgt;
      if (pol.kind === 'reg') { xin[0] = obs13(t); tgt = RX + SC * fwd(pol.m, xin)[0]; }
      else if (pol.kind === 'gmm') {
        if (mode === 'step' || t % H === 0 || !plan13) {
          xin[0] = obs13(t); const g = gmmEval(pol.m, xin, pol.K, pol.HC);
          let u = r(), j = 0; while (j < pol.K - 1 && u > g.pi[j]) { u -= g.pi[j]; j++; } comp = j; t0 = t;
          plan13 = new Float64Array(pol.HC); for (let d = 0; d < pol.HC; d++) plan13[d] = g.mu(comp, d);
        }
        comps.push(comp); tgt = RX + SC * plan13[Math.min(pol.HC - 1, t - t0)];
      } else tgt = prof(t + 1);
      const nx = x + clamp(tgt - x, -UMAX, UMAX) + randn(r) * (o.noise == null ? 0.5 : o.noise);
      if (segHit({ x, y: START.y - V * t }, { x: nx, y: START.y - V * (t + 1) }, k)) touch = true;
      x = nx; xs[t + 1] = x;
    }
    return Object.assign({ xs, touch, comps }, sideTrack(xs, k));
  }
  /** Серия прогонов: зёрна seed0, seed0+1, … */
  function batch13(pol, k, n, seed0, o) {
    const runs = []; for (let i = 0; i < n; i++) runs.push(run13(pol, k, seed0 + i, o));
    return { runs, touches: runs.filter((q) => q.touch).length, maxSw: Math.max(...runs.map((q) => q.sw)), left: runs.filter((q) => !q.touch && q.side < 0).length, right: runs.filter((q) => !q.touch && q.side > 0).length };
  }

  /* ---------- урок 1.5: политика видит две последние точки и выдаёт пачку ----------
     Наблюдение (To = 2): положения Ады на прошлом и текущем шаге. Пачка (Tp = 16):
     положения на 16 шагов вперёд относительно текущего, x и y. Исполняем Ta шагов
     (по умолчанию 8), потом новая пачка — отступающий горизонт. */
  const TP15 = 16, D15 = 2 * TP15, SY = V * TP15, OBS15 = 4;
  const SENS = { sx: 8 };                            // ошибка оценки бокового положения Ады, см
  /** Наблюдение — положение Ады относительно чайника: по x в долях SC, по y в долях 156 см. */
  function obs15(px, py, x, y, k, out) { out = out || new Float64Array(OBS15); out[0] = (px - k.x) / SC; out[1] = (py - k.y) / 156; out[2] = (x - k.x) / SC; out[3] = (y - k.y) / 156; return out; }
  /** Пары «наблюдение → пачка» из демонстраций. */
  function data15(demos, k) {
    const O = [], A = [], TT = []; k = k || KETTLE;
    for (const d of demos) for (let t = 0; t < T; t++) {
      const y = START.y - V * t, pt = Math.max(0, t - 1);
      O.push(obs15(d.xs[pt], START.y - V * pt, d.xs[t], y, k));
      const a = new Float64Array(D15);
      for (let j = 0; j < TP15; j++) { const tj = Math.min(T, t + 1 + j); a[2 * j] = (d.xs[tj] - d.xs[t]) / SC; a[2 * j + 1] = (START.y - V * tj - y) / SY; }
      A.push(a); TT.push(t);
    }
    return { O, A, TT };
  }
  /* Расписание шума: косинусное, K15 шагов при обучении. */
  const K15 = 100;
  const ab15 = (k) => abar(k / K15 * 0.985);         // k = 0 — данные, k = K15 — почти чистый шум (ᾱ ≈ 5·10⁻⁴)
  function temb(k, out, off) { const u = k / K15; out[off] = u * 2 - 1; for (let f = 0; f < 3; f++) { out[off + 1 + 2 * f] = Math.sin(Math.PI * u * (1 << f)); out[off + 2 + 2 * f] = Math.cos(Math.PI * u * (1 << f)); } }
  const TE = 7, DIN = D15 + OBS15 + TE;
  /** Обучение денойзера: предсказывает добавленный шум ε по зашумлённой пачке, шагу k и наблюдению. */
  function* trainDen15(demos, o) {
    o = o || {}; const { O, A } = data15(demos, o.kettle), hid = o.hid || 64, m = net([DIN, hid, hid, D15], (o.seed || 5) + 11), r = rng((o.seed || 5) + 303);
    const it = o.iters || 5000, bs = o.bs || 32, pred = o.pred || 'x0', x = new Float64Array(DIN), g = new Float64Array(D15), eps = new Float64Array(D15); let ema = null;
    for (let s = 0; s < it; s++) {
      let L = 0;
      for (let b = 0; b < bs; b++) {
        const i = Math.floor(r() * O.length), k = 1 + Math.floor(r() * K15), a = ab15(k), sa = Math.sqrt(a), sv = Math.sqrt(1 - a);
        for (let d = 0; d < D15; d++) { eps[d] = randn(r); x[d] = sa * A[i][d] + sv * eps[d]; }
        for (let d = 0; d < OBS15; d++) x[D15 + d] = O[i][d];
        x[D15] += randn(r) * SENS.sx / SC; x[D15 + 2] += randn(r) * SENS.sx / SC;
        temb(k, x, D15 + OBS15);
        const out = fwd(m, x);
        if (pred === 'x0') for (let d = 0; d < D15; d++) { const e = out[d] - A[i][d]; L += e * e; g[d] = 2 * e / D15; }
        else for (let d = 0; d < D15; d++) { const e = out[d] - eps[d]; L += e * e; g[d] = 2 * e / D15; }
        bwd(m, g);
      }
      const lr = (o.lr || 0.003) * (s < it * 0.6 ? 1 : s < it * 0.85 ? 0.4 : 0.15);
      adam(m, lr, bs); L /= bs * D15; ema = ema == null ? L : 0.97 * ema + 0.03 * L;
      if (s % 25 === 0 || s === it - 1) yield { it: s, iters: it, loss: ema };
    }
    return { kind: 'den', m, pred };
  }
  /** Регрессия с пачками: вся пачка за один проход сети. loss: 'l1' или 'mse'. */
  function* trainReg15(demos, o) {
    o = o || {}; const { O, A } = data15(demos, o.kettle), m = net([OBS15, 64, 64, D15], (o.seed || 5) + 23), r = rng((o.seed || 5) + 404), it = o.iters || 2500, bs = o.bs || 32, l1 = o.loss === 'l1';
    const g = new Float64Array(D15), ob = new Float64Array(OBS15); let ema = null;
    for (let s = 0; s < it; s++) {
      let L = 0;
      for (let b = 0; b < bs; b++) {
        const i = Math.floor(r() * O.length); ob.set(O[i]); ob[0] += randn(r) * SENS.sx / SC; ob[2] += randn(r) * SENS.sx / SC;
        const out = fwd(m, ob);
        for (let d = 0; d < D15; d++) { const e = out[d] - A[i][d]; L += l1 ? Math.abs(e) : e * e; g[d] = (l1 ? Math.sign(e) : 2 * e) / D15; }
        bwd(m, g);
      }
      adam(m, (o.lr || 0.003) * (s < it * 0.7 ? 1 : 0.3), bs); L /= bs * D15; ema = ema == null ? L : 0.97 * ema + 0.03 * L;
      if (s % 25 === 0 || s === it - 1) yield { it: s, iters: it, loss: ema };
    }
    return { kind: 'reg15', m, loss: l1 ? 'l1' : 'mse' };
  }
  /** DDIM по обученному денойзеру: steps шагов от чистого шума. keep — сохранить кадры. */
  function sampleDen15(pol, ob, steps, r, keep) {
    const m = pol.m, x = new Float64Array(DIN); let c = new Float64Array(D15);
    for (let d = 0; d < D15; d++) c[d] = randn(r);
    const frames = keep ? [Float64Array.from(c)] : null, preds = keep ? [] : null;
    for (let s = 0; s < steps; s++) {
      const k = Math.round(K15 * (1 - s / steps)), k2 = Math.round(K15 * (1 - (s + 1) / steps)), a = ab15(k), a2 = k2 > 0 ? ab15(k2) : 1;
      for (let d = 0; d < D15; d++) x[d] = c[d];
      for (let d = 0; d < OBS15; d++) x[D15 + d] = ob[d];
      temb(k, x, D15 + OBS15);
      const e = fwd(m, x), nc = new Float64Array(D15), x0 = new Float64Array(D15);
      for (let d = 0; d < D15; d++) {
        x0[d] = clamp(pol.pred === 'x0' ? e[d] : (c[d] - Math.sqrt(1 - a) * e[d]) / Math.sqrt(a), -1.6, 1.6);
        nc[d] = Math.sqrt(a2) * x0[d] + Math.sqrt(1 - a2) * ((c[d] - Math.sqrt(a) * x0[d]) / Math.sqrt(1 - a));
      }
      c = nc; if (keep) { frames.push(Float64Array.from(c)); preds.push(x0); }
    }
    return keep ? { c, frames, preds } : c;
  }
  /** Точный денойзер урока 1.5: пачки демонстраций с весами по близости наблюдения. */
  function exact15(demos, h, k) {
    const { O, A, TT } = data15(demos, k); return { kind: 'exact15', O, A, TT, h: h || 0.06 };
  }
  function exactPrior(pol, ob, t) {
    const idx = [], w = []; const h2 = 2 * pol.h * pol.h;
    for (let i = 0; i < pol.O.length; i++) { if (Math.abs(pol.TT[i] - t) > 4) continue; let s = 0; for (let d = 0; d < OBS15; d++) { const e = pol.O[i][d] - ob[d]; s += e * e; } idx.push(i); w.push(-s / h2); }
    let mx = -Infinity; for (const v of w) mx = Math.max(mx, v); const pr = w.map((v) => Math.exp(v - mx));
    return { mus: idx.map((i) => pol.A[i]), prior: pr };
  }
  function sampleExact15(pol, ob, t, steps, r, keep) { const { mus, prior } = exactPrior(pol, ob, t); return ddimExact(mus, prior, D15, steps, r, keep); }
  /** Сторона, которую выбрала пачка: среднее бокового смещения у чайника относительно него. */
  function chunkSide(c, x, y, k) {
    let s = 0, n = 0; for (let j = 0; j < TP15; j++) { const yy = y + c[2 * j + 1] * SY; if (Math.abs(yy - k.y) < 60) { s += x + c[2 * j] * SC - k.x; n++; } }
    return n ? s / n : null;
  }
  /** Прогон политики урока 1.5. o: Ta — сколько исполнять из 16, steps — шаги денойзинга,
   *  push: { t, dx } — толчок Ады вбок на шаге t. Возвращает путь, касания, смены стороны, проходы сети. */
  function run15(pol, k, seed, o) {
    o = o || {}; const r = rng(seed * 7717 + 29), Ta = o.Ta || 8, steps = o.steps || 16, MAXT = T + 12;
    k = { x: k.x, y: k.y }; const kpath = [];
    let x = START.x + randn(r) * 2, y = START.y, px = x, py = y, plan = null, j = 0, passes = 0, chunks = 0, touch = false, intent = 0, iflip = 0;
    const pts = [{ x, y }], ob = new Float64Array(OBS15), plans = [];
    for (let t = 0; t < MAXT && y > GOAL.y + 1; t++) {
      if (o.kpush && o.kpush.t === t) { const dir = o.kpush.toward ? (x < k.x ? -1 : 1) : (o.kpush.dx > 0 ? 1 : -1); k.x += dir * Math.abs(o.kpush.dx); }
      kpath.push(k.x);
      if (!plan || j >= Ta) {
        obs15(px + randn(r) * SENS.sx, py, x + randn(r) * SENS.sx, y, k, ob);
        let c;
        if (pol.kind === 'den') { c = sampleDen15(pol, ob, steps, r); passes += steps; }
        else if (pol.kind === 'exact15') { c = sampleExact15(pol, ob, Math.round((START.y - y) / V), steps, r); passes += steps; }
        else { c = Float64Array.from(fwd(pol.m, ob)); passes += 1; }
        plan = { x0: x, y0: y, c, t }; j = 0; chunks++; if (o.keepPlans) plans.push(plan);
        const cs = chunkSide(c, x, y, k); if (cs != null && Math.abs(cs) > 6) { const sd = cs > 0 ? 1 : -1; if (intent && sd !== intent) iflip++; intent = sd; }
      }
      let tx = plan.x0 + plan.c[2 * j] * SC, ty = plan.y0 + plan.c[2 * j + 1] * SY; j++;
      if (o.push && o.push.t === t) { x += o.push.dx; }
      const nx = x + clamp(tx - x, -UMAX, UMAX) + randn(r) * (o.noise == null ? 0.5 : o.noise), nyv = y + clamp(ty - y, -V * 1.6, V * 0.5);
      if (segHit({ x, y }, { x: nx, y: nyv }, k)) touch = true;
      px = x; py = y; x = nx; y = nyv; pts.push({ x, y });
    }
    // смены стороны по положению Ады у чайника
    let side = 0, sw = 0, pass = 0;
    for (const p of pts) { if (p.y > k.y + 100 || p.y < k.y - RA - RK) continue; const d = p.x - k.x, s2 = d > 6 ? 1 : d < -6 ? -1 : 0; if (s2 && side && s2 !== side) sw++; if (s2) side = s2; if (Math.abs(p.y - k.y) < RA + RK && s2) pass = s2; }
    return { pts, touch, sw, flips: iflip, side: pass || side, passes, chunks, plans, kpath, kettle: k, reached: y <= GOAL.y + 1 };
  }
  function batch15(pol, k, n, seed0, o) {
    const runs = []; for (let i = 0; i < n; i++) runs.push(run15(pol, k, seed0 + i, o));
    return { runs, touches: runs.filter((q) => q.touch).length, maxSw: Math.max(...runs.map((q) => q.sw)), maxFlip: Math.max(...runs.map((q) => q.flips)), left: runs.filter((q) => !q.touch && q.side < 0).length, right: runs.filter((q) => !q.touch && q.side > 0).length, passes: runs[0].passes / Math.max(1, runs[0].chunks) };
  }

  /* ---------- урок 1.3, «Больше данных»: опыт j для N демонстраций ----------
     Сторону каждой демонстрации выбирает монетка 50 на 50. Обучаем регрессию
     и один раз прогоняем Аду. Возвращает касание и промах мимо центра чайника. */
  const MD = { base: 77, iters: 400 };
  function moreDataDemos(N, j) { return makeDemosCoin({ n: N, pLeft: 0.5, seed: MD.base + N * 1000 + j }); }
  function moreDataRun(reg, j) {
    const q = run13(reg, KETTLE, 7000 + j), tk = Math.round((START.y - KETTLE.y) / V);
    return { touch: q.touch, miss: Math.abs(q.xs[tk] - KETTLE.x), xs: q.xs };
  }
  /** Пачки демонстраций в начале пути (для показа денойзинга в 1.5). */
  function startChunks(demos) { return data15(demos).A.filter((a, i) => i % T === 0); }

  /* ---------- урок 1.3, «Нарисуй объезды»: линия мышью → профиль смещения ----------
     pts — точки линии от старта; y убывает (Ада едет вверх). Возвращает xs[t] на шагах
     маршрута или null, если линия не дошла до места, где чайник позади. */
  function strokeProfile(pts, k) {
    k = k || KETTLE; const P = [];
    for (const p of pts) { if (!P.length || p.y < P[P.length - 1].y - 0.5) P.push({ x: p.x, y: p.y }); }
    if (P.length < 3) return null;
    const yEnd = P[P.length - 1].y; if (yEnd > k.y - RA - RK - 6) return null;
    // сглаживание скользящим средним по 5 точкам
    const S = P.map((p, i) => { let sx = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(P.length - 1, i + 2); j++) { sx += P[j].x; n++; } return { x: sx / n, y: p.y }; });
    const xs = new Float64Array(T + 1), xEnd = S[S.length - 1].x;
    let j = 0;
    for (let t = 0; t <= T; t++) {
      const y = START.y - V * t;
      if (y >= S[0].y) { xs[t] = S[0].x; continue; }
      if (y <= yEnd) { const u = smooth(Math.min(1, (yEnd - y) / 90)); xs[t] = xEnd + (RX - xEnd) * u; continue; }
      while (j < S.length - 2 && S[j + 1].y > y) j++;
      const a = S[j], b = S[j + 1], u = (a.y - y) / Math.max(1e-6, a.y - b.y); xs[t] = a.x + (b.x - a.x) * u;
    }
    return xs;
  }
  /** Задевает ли путь xs чайник; и наименьшее расстояние между центрами. */
  function profileHit(xs, k) {
    k = k || KETTLE; let hit = false, dmin = 1e9;
    for (let t = 0; t < xs.length - 1; t++) {
      const a = { x: xs[t], y: START.y - V * t }, b = { x: xs[t + 1], y: START.y - V * (t + 1) };
      if (segHit(a, b, k)) hit = true; dmin = Math.min(dmin, Math.hypot(a.x - k.x, a.y - k.y));
    }
    return { hit, dmin };
  }
  /** Оптимумы MSE и L1 по набору профилей: среднее и медиана в каждой точке пути. */
  function meanMedian(list) {
    const n = list.length, mean = new Float64Array(T + 1), med = new Float64Array(T + 1), lo = new Float64Array(T + 1), hi = new Float64Array(T + 1), col = new Float64Array(n);
    for (let t = 0; t <= T; t++) {
      let s = 0; for (let i = 0; i < n; i++) { col[i] = list[i][t]; s += col[i]; } mean[t] = s / n;
      const c = Array.from(col).sort((a, b) => a - b);
      if (n % 2) { lo[t] = hi[t] = med[t] = c[(n - 1) / 2]; } else { lo[t] = c[n / 2 - 1]; hi[t] = c[n / 2]; med[t] = (lo[t] + hi[t]) / 2; }
    }
    return { mean, med, lo, hi };
  }

  /* ---------- урок 1.3, «Бины и совместность» ----------
     Действие из двух чисел, две моды: (−1, +1) и (+1, −1). 16 бинов на ось на [−1,6; 1,6]. */
  const BINS = { n: 16, lo: -1.6, hi: 1.6 };
  function binsData(seed) { const r = rng(seed || 4), P = []; for (let i = 0; i < 400; i++) { const m = i % 2 ? 1 : -1; P.push({ x: m + randn(r) * 0.15, y: -m + randn(r) * 0.15 }); } return P; }
  const binOf = (v) => clamp(Math.floor((v - BINS.lo) / (BINS.hi - BINS.lo) * BINS.n), 0, BINS.n - 1);
  const binCenter = (b) => BINS.lo + (b + 0.5) * (BINS.hi - BINS.lo) / BINS.n;
  function binsHist(P) {
    const hx = new Float64Array(BINS.n), hy = new Float64Array(BINS.n), joint = new Float64Array(BINS.n * BINS.n);
    for (const p of P) { const i = binOf(p.x), j = binOf(p.y); hx[i]++; hy[j]++; joint[i * BINS.n + j]++; }
    return { hx, hy, joint, n: P.length };
  }
  function pick(hist, r, off, len) { let tot = 0; for (let i = 0; i < len; i++) tot += hist[off + i]; let u = r() * tot; for (let i = 0; i < len; i++) { u -= hist[off + i]; if (u <= 0) return i; } return len - 1; }
  /** 100 сэмплов: mode 'ind' — x и y независимо по своим бинам, 'ar' — y при условии бина x. */
  function binsSample(H, mode, n, seed) {
    const r = rng(seed), w = (BINS.hi - BINS.lo) / BINS.n, out = []; let bad = 0;
    for (let s = 0; s < n; s++) {
      const i = pick(H.hx, r, 0, BINS.n), j = mode === 'ar' ? pick(H.joint, r, i * BINS.n, BINS.n) : pick(H.hy, r, 0, BINS.n);
      const x = binCenter(i) + (r() - 0.5) * w, y = binCenter(j) + (r() - 0.5) * w, wrong = x * y > 0;
      if (wrong) bad++; out.push({ x, y, wrong });
    }
    return { pts: out, bad };
  }

  /* ---------- урок 1.3, «Стыки пачек»: схема «время × смещение» ----------
     Пачка — план бокового смещения на 16 шагов. Новая пачка каждые 4 шага, её сторону
     выбирает смесь 50 на 50. mode: 'naive' — исполняем последнюю пачку, 'te' — взвешенное
     среднее перекрывающихся пачек, 'bid' — из 8 сэмплов берём ближайший к прошлой пачке. */
  const SEAM = { T: 44, tk: 22, A: 56, len: 16, every: 4, m: 0.5, nBid: 8, w0: 12, w1: 7 };
  const seamProf = (t) => { const u = Math.abs(t - SEAM.tk); return u <= 5 ? 1 : u >= 5 + SEAM.w0 ? 0 : smooth((SEAM.w0 + 5 - u) / SEAM.w0); };
  function seamChunk(t0, x0, side) {
    const c = new Float64Array(SEAM.len);
    for (let j = 0; j < SEAM.len; j++) { const t = t0 + j + 1, goal = side * SEAM.A * seamProf(t), bl = Math.min(1, (j + 1) / 4); c[j] = x0 + (goal - x0) * bl; }
    return c;
  }
  function seams13(mode, seed) {
    const r = rng(seed * 131 + 9), chunks = [], xs = new Float64Array(SEAM.T + 1); let x = 0, cur = null, passes = 0;
    for (let t = 0; t < SEAM.T; t++) {
      if (t % SEAM.every === 0) {
        if (mode === 'bid' && cur) {
          let best = null, bd = Infinity;
          for (let q = 0; q < SEAM.nBid; q++) { const sd = r() < 0.5 ? -1 : 1, c = seamChunk(t, x, sd); let d = 0; for (let j = 0; j < SEAM.len - SEAM.every; j++) { const e = c[j] - cur.c[j + SEAM.every]; d += e * e; } if (d < bd) { bd = d; best = { t0: t, c, side: sd }; } }
          cur = best; passes += SEAM.nBid;
        } else { const sd = r() < 0.5 ? -1 : 1; cur = { t0: t, c: seamChunk(t, x, sd), side: sd }; passes += mode === 'bid' ? SEAM.nBid : 1; }
        chunks.push(cur);
      }
      let tgt;
      if (mode === 'te') {
        let s = 0, ws = 0, i = 0;
        for (const c of chunks) { const j = t - c.t0; if (j < 0 || j >= SEAM.len) continue; const w = Math.exp(-SEAM.m * i); s += w * c.c[j]; ws += w; i++; }
        tgt = s / ws;
      } else tgt = cur.c[t - cur.t0];
      x += clamp(tgt - x, -UMAX, UMAX); xs[t + 1] = x;
    }
    // касание: в окне чайника смещение меньше суммы радиусов; смены стороны после начала объезда
    let touch = false, side = 0, sw = 0;
    for (let t = 0; t <= SEAM.T; t++) {
      if (Math.abs(t - SEAM.tk) <= 4 && Math.abs(xs[t]) < RA + RK) touch = true;
      if (t < SEAM.tk - 12 || t > SEAM.tk + 4) continue;
      const sd = xs[t] > 6 ? 1 : xs[t] < -6 ? -1 : 0; if (sd && side && sd !== side) sw++; if (sd) side = sd;
    }
    return { xs, chunks, touch, sw, passes: passes / SEAM.T };
  }
  function seamsBatch(mode, n, seed0) { const runs = []; for (let i = 0; i < n; i++) runs.push(seams13(mode, seed0 + i)); return { runs, touches: runs.filter((q) => q.touch).length, maxSw: Math.max(...runs.map((q) => q.sw)), passes: runs[0].passes }; }

  const API = {
    rng, randn, clamp, smooth, W, H, RA, RK, V, UMAX, RX, START, GOAL, T, KETTLE, DOOR, WALLS, FURN, OBST, TP,
    clearance, kettleOK, onRoute, segHit, bump, plan, pathFree, sides, demo, makeDemos, makeDemosCoin, heat,
    net, fwd, bwd, adam, nparams, finish,
    SC, obs13, data13, chunk13, HC13, trainReg13, trainGMM13, gmmEval, abar, D13, prof13, diff13, ddimExact, sideTrack, run13, batch13,
    TP15, D15, SY, OBS15, SENS, K15, MD, moreDataDemos, moreDataRun, startChunks,
    strokeProfile, profileHit, meanMedian, BINS, binsData, binOf, binCenter, binsHist, binsSample, SEAM, seamProf, seamChunk, seams13, seamsBatch, ab15, obs15, data15, trainDen15, trainReg15, sampleDen15, exact15, sampleExact15, chunkSide, run15, batch15,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Kettle = API;
})(typeof window !== 'undefined' ? window : globalThis);
