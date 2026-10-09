/* =====================================================================
   l54/engine.js — движок урока 5.4 «Перенос из симуляции: рандомизация».
   Без DOM: работает в браузере (window.L54, поверх window.Arm из
   shared/arm-core.js) и в Node (require).
   1) Мир: рука Ады из урока 0.3 — два звена 0,5 и 0,4 м, вид сбоку, точечные
      массы 1,2 и 0,9 кг на концах звеньев (Arm.M1, Arm.M2) и чашка в захвате.
      Суставы ведёт ПД-регулятор привода (1 кГц в жизни, здесь шаг 5 мс)
      с компенсацией силы тяжести, посчитанной для номинальной чашки.
      Политика 20 раз в секунду задаёт, куда сдвинуть захват (до 10 см),
      регулятор руки пересчитывает это в цели суставов через якобиан.
   2) Параметры мира — то, чем симулятор отличается от настоящей руки:
      масса чашки, трение в суставах, задержка команды, сила моторов.
      Рандомизация: в начале каждого эпизода параметры берутся случайно
      из диапазонов вокруг номинала; ширина диапазонов — один множитель.
   3) Задача «поднеси и удержи»: захват с чашкой должен прийти к цели,
      которая каждый эпизод в новом месте, и удержать её. Эпизод — 2 с
      (40 шагов). Успех — последние 0,5 с захват ближе 3 см к цели.
   4) Обучение — PPO из урока 5.2 (порции эпизодов, обрезка 1 ± 0,2,
      преимущества GAE). Автоматическая рандомизация (ADR, OpenAI 2019):
      диапазоны растут, когда на их границе политика справляется.
   Все случайности — с зерном; exp, log, tanh, sin, cos считаются здесь
   же из сложений и умножений, поэтому числа в Node и браузерах совпадают.
   ===================================================================== */
'use strict';
(function (root) {
  const Arm = (typeof module !== 'undefined' && module.exports) ? require('../shared/arm-core.js') : root.Arm;
  const { rng } = Arm;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* =====================================================================
     0. Переносимая математика (как в l53/engine.js): Math.exp, Math.log,
        Math.sin и другие в разных браузерах отличаются в последнем бите,
        а обучение с подкреплением раздувает эту разницу. Здесь они собраны
        из сложений, умножений, делений и корня — по IEEE 754 одинаковых везде.
     ===================================================================== */
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  const HI = (() => { F64[0] = 1; return U32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
  const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
  const pow2i = (k) => { U32[LO] = 0; U32[HI] = (k + 1023) << 20; return F64[0]; };
  const EXPC = [1, 1, 1 / 2, 1 / 6, 1 / 24, 1 / 120, 1 / 720, 1 / 5040, 1 / 40320, 1 / 362880, 1 / 3628800, 1 / 39916800, 1 / 479001600, 1 / 6227020800];
  function exp(x) {
    if (x > 709) return Infinity; if (x < -745) return 0;
    const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
    let p = EXPC[13]; for (let j = 12; j >= 0; j--) p = EXPC[j] + r * p;
    if (k > 1023) return p * pow2i(1023) * pow2i(k - 1023);
    if (k < -1022) return p * pow2i(-1022) * pow2i(k + 1022);
    return p * pow2i(k);
  }
  const LOGC = []; for (let j = 1; j <= 23; j += 2) LOGC.push(1 / j);
  function log(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN;
    F64[0] = x; let hi = U32[HI], e = ((hi >>> 20) & 0x7ff) - 1023;
    if (e === -1023) { F64[0] = x * 18014398509481984; hi = U32[HI]; e = ((hi >>> 20) & 0x7ff) - 1023 - 54; }
    U32[HI] = (hi & 0x000fffff) | 0x3ff00000; let m = F64[0];
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    const z = (m - 1) / (m + 1), z2 = z * z; let t = LOGC[LOGC.length - 1];
    for (let j = LOGC.length - 2; j >= 0; j--) t = LOGC[j] + z2 * t;
    return e * LN2_HI + (e * LN2_LO + 2 * z * t);
  }
  function tanh(x) { const ax = x < 0 ? -x : x; if (ax > 20) return x < 0 ? -1 : 1; if (ax < 1e-4) return x - x * x * x / 3; const t = exp(-2 * ax), v = (1 - t) / (1 + t); return x < 0 ? -v : v; }
  const PIO2_HI = 1.57079632673412561417e+00, PIO2_LO = 6.07710050650619224932e-11, INV_PIO2 = 6.36619772367581382433e-01;
  const SINC = [1, -1 / 6, 1 / 120, -1 / 5040, 1 / 362880, -1 / 39916800, 1 / 6227020800, -1 / 1307674368000, 1 / 355687428096000];
  const COSC = [1, -1 / 2, 1 / 24, -1 / 720, 1 / 40320, -1 / 3628800, 1 / 479001600, -1 / 87178291200, 1 / 20922789888000, -1 / 6402373705728000];
  /** [sin x, cos x] — для умеренных x (углы суставов, 2πu в генераторе гауссовых чисел). */
  function sincos(x) {
    const k = Math.round(x * INV_PIO2), r = (x - k * PIO2_HI) - k * PIO2_LO, r2 = r * r;
    let s = SINC[8], c = COSC[9];
    for (let j = 7; j >= 0; j--) s = SINC[j] + r2 * s;
    for (let j = 8; j >= 0; j--) c = COSC[j] + r2 * c;
    s *= r;
    switch (((k % 4) + 4) % 4) { case 0: return [s, c]; case 1: return [c, -s]; case 2: return [-s, -c]; default: return [-c, s]; }
  }
  const hyp = (x, y) => Math.sqrt(x * x + y * y);
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * log(u)) * sincos(2 * Math.PI * r())[1]; }
  const L1 = Arm.L1, L2 = Arm.L2, M1 = Arm.M1, M2 = Arm.M2, GR = Arm.GR;
  /** Прямая кинематика руки из урока 0.3 на переносимых sin и cos. */
  function fk(q) { const [s1, c1] = sincos(q[0]), [s12, c12] = sincos(q[0] + q[1]), x1 = L1 * c1, y1 = L1 * s1; return { x1, y1, x: x1 + L2 * c12, y: y1 + L2 * s12 }; }
  function jac(q) { const [s1, c1] = sincos(q[0]), [s12, c12] = sincos(q[0] + q[1]); return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]]; }

  /* =====================================================================
     1. Маленькие сети: ReLU с утечкой 0,01 в скрытых слоях, линейный выход, Adam
     ===================================================================== */
  function net(sizes, seed, outScale) {
    const r = rng(seed), L = sizes.length - 1, W = [], B = [];
    for (let l = 0; l < L; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), s = (l < L - 1 ? Math.sqrt(2) : (outScale == null ? 1 : outScale)) * Math.sqrt(1 / a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * s;
      W.push(w); B.push(new Float64Array(b));
    }
    const z = (arr) => arr.map((x) => new Float64Array(x.length));
    return { sizes, L, W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0, p1: 1, p2: 1 };
  }
  const clone = (n) => ({ sizes: n.sizes, L: n.L, W: n.W.map((w) => w.slice()), B: n.B.map((b) => b.slice()), mW: n.mW.map((w) => w.slice()), vW: n.vW.map((w) => w.slice()), mB: n.mB.map((b) => b.slice()), vB: n.vB.map((b) => b.slice()), t: n.t, p1: n.p1, p2: n.p2 });
  function ws(n) { return { a: n.sizes.map((k) => new Float64Array(k)), d: n.sizes.map((k) => new Float64Array(k)) }; }
  function grads(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  function zero(g) { for (const w of g.W) w.fill(0); for (const b of g.B) b.fill(0); }
  function fwd(n, c, x) {
    const a0 = c.a[0]; for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    for (let l = 0; l < n.L; l++) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], b = n.B[l], ai = c.a[l], ao = c.a[l + 1], hid = l < n.L - 1;
      for (let o = 0; o < nO; o++) ao[o] = b[o];
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
      if (hid) for (let o = 0; o < nO; o++) { const z = ao[o]; if (z < 0) ao[o] = 0.01 * z; }
    }
    return c.a[n.L];
  }
  function bwd(n, c, gOut, g) {
    const dL = c.d[n.L]; for (let o = 0; o < dL.length; o++) dL[o] = gOut[o];
    for (let l = n.L - 1; l >= 0; l--) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], dO = c.d[l + 1], dI = c.d[l];
      const gw = g.W[l], gb = g.B[l]; for (let o = 0; o < nO; o++) gb[o] += dO[o];
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) gw[off + o] += v * dO[o]; }
      if (l === 0) break;
      for (let i = 0; i < nI; i++) { let s = 0; const off = i * nO; for (let o = 0; o < nO; o++) s += w[off + o] * dO[o]; dI[i] = ai[i] < 0 ? 0.01 * s : s; }
    }
  }
  function adam(n, g, lr, scale) {
    n.t++; const b1 = 0.9, b2 = 0.999; n.p1 *= b1; n.p2 *= b2; const c1 = 1 - n.p1, c2 = 1 - n.p2;
    for (let l = 0; l < n.L; l++) for (const [P, G, M, V] of [[n.W[l], g.W[l], n.mW[l], n.vW[l]], [n.B[l], g.B[l], n.mB[l], n.vB[l]]]) {
      for (let i = 0; i < P.length; i++) { const gi = G[i] * scale; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }

  /* =====================================================================
     2. Рука с динамикой. Вид сбоку, плечо Ады — в начале координат.
        Точечные массы M1 (локоть) и M2 + m (захват с чашкой), как в уроке 0.3.
        Привод каждого сустава: ПД-регулятор к цели с компенсацией силы
        тяжести, посчитанной для номинальной чашки, предел момента, сила
        моторов s, трение в суставах f, задержка команды d (мс).
     ===================================================================== */
  const PHYS = { DT: 0.005, SUB: 10, KP: [110, 55], KD: [7, 3.5], TMAX: [30, 14], QLIM: [[-2.2, 1.7], [0.05, 2.8]] };
  const NOM = { m: 0.25, f: 0.1, d: 0, s: 1 };                       // номинальный мир симулятора
  const PARAMS = [
    { key: 'm', name: 'масса чашки', unit: 'кг', lo: 0.02, hi: 1.5, dig: 2, log: true, sc: 0.2 },
    { key: 'f', name: 'трение в суставах', unit: 'Н·м', lo: 0, hi: 2, dig: 2, sc: 0.3 },
    { key: 'd', name: 'задержка команды', unit: 'мс', lo: 0, hi: 150, dig: 0, sc: 30 },
    { key: 's', name: 'сила моторов', unit: '', lo: 0.3, hi: 1.4, dig: 2, sc: 0.2 },
  ];
  /** Гравитационные моменты для массы в захвате m2 (локоть — M1). */
  function grav(q, m2) { const [, c1] = sincos(q[0]), [, c12] = sincos(q[0] + q[1]); return [(M1 + m2) * GR * L1 * c1 + m2 * GR * L2 * c12, m2 * GR * L2 * c12]; }
  /** Ускорения суставов при моментах tau (уравнения динамики из урока 0.3). */
  function accel(q, dq, tau, m2) {
    const [s2, c2] = sincos(q[1]);
    const a = (M1 + m2) * L1 * L1 + m2 * L2 * L2 + 2 * m2 * L1 * L2 * c2, b = m2 * L2 * L2 + m2 * L1 * L2 * c2, d = m2 * L2 * L2, h = m2 * L1 * L2 * s2;
    const C1 = -h * (2 * dq[0] * dq[1] + dq[1] * dq[1]), C2 = h * dq[0] * dq[0], G = grav(q, m2);
    const r1 = tau[0] - C1 - G[0], r2 = tau[1] - C2 - G[1], det = a * d - b * b;
    return [(d * r1 - b * r2) / det, (-b * r1 + a * r2) / det];
  }
  const ARM = { DP: 0.1, DQ: 0.6, Q0: [-1.35, 1.9] };
  /** Мир w = { m, f, d, s }: состояние руки и очередь команд с задержкой. */
  function armInit(w) { return { w, q: ARM.Q0.slice(), dq: [0, 0], t: 0, cmd: [{ at: 0, q: ARM.Q0.slice() }] }; }
  function physStep(S) {
    const w = S.w, P = PHYS; let cur = S.cmd[0];
    while (S.cmd.length > 1 && S.cmd[1].at <= S.t + 1e-9) { S.cmd.shift(); cur = S.cmd[0]; }
    const gn = grav(S.q, M2 + NOM.m), tau = [0, 0];
    for (let i = 0; i < 2; i++) {
      const u = P.KP[i] * (cur.q[i] - S.q[i]) - P.KD[i] * S.dq[i] + gn[i];
      tau[i] = w.s * clamp(u, -P.TMAX[i], P.TMAX[i]) - w.f * tanh(S.dq[i] / 0.05) - 0.3 * w.f * S.dq[i];
    }
    const a = accel(S.q, S.dq, tau, M2 + w.m);
    S.dq = [S.dq[0] + a[0] * P.DT, S.dq[1] + a[1] * P.DT];
    S.q = [S.q[0] + S.dq[0] * P.DT, S.q[1] + S.dq[1] * P.DT];
    for (let i = 0; i < 2; i++) { const [lo, hi] = P.QLIM[i]; if (S.q[i] < lo) { S.q[i] = lo; if (S.dq[i] < 0) S.dq[i] = 0; } else if (S.q[i] > hi) { S.q[i] = hi; if (S.dq[i] > 0) S.dq[i] = 0; } }
    S.t += P.DT;
  }
  /** Команда политики: a ∈ [−1, 1]² — куда сдвинуть захват (до ARM.DP по каждой оси);
      регулятор руки пересчитывает сдвиг в цель суставов через якобиан (затухающие наименьшие квадраты). */
  function aimQ(q, a) {
    const J = jac(q), dx = ARM.DP * clamp(a[0], -1, 1), dy = ARM.DP * clamp(a[1], -1, 1), l2 = 0.0025;
    const m00 = J[0][0] * J[0][0] + J[0][1] * J[0][1] + l2, m01 = J[0][0] * J[1][0] + J[0][1] * J[1][1], m11 = J[1][0] * J[1][0] + J[1][1] * J[1][1] + l2, det = m00 * m11 - m01 * m01;
    const u = (m11 * dx - m01 * dy) / det, v = (-m01 * dx + m00 * dy) / det;
    const d0 = clamp(J[0][0] * u + J[1][0] * v, -ARM.DQ, ARM.DQ), d1 = clamp(J[0][1] * u + J[1][1] * v, -ARM.DQ, ARM.DQ);
    return [clamp(q[0] + d0, PHYS.QLIM[0][0], PHYS.QLIM[0][1]), clamp(q[1] + d1, PHYS.QLIM[1][0], PHYS.QLIM[1][1])];
  }
  /** Шаг управления (50 мс): команда уходит в привод с задержкой w.d, дальше 10 шагов физики по 5 мс. */
  function ctrlStep(S, a) {
    S.cmd.push({ at: S.t + S.w.d / 1000, q: aimQ(S.q, a) });
    for (let k = 0; k < PHYS.SUB; k++) physStep(S);
  }

  /* =====================================================================
     3. Задача «поднеси и удержи»: захват с чашкой должен прийти к цели,
        которая каждый эпизод в новом месте, и удержать её. Награда за шаг:
        −2·(расстояние, м) + 1, пока захват ближе 3 см, и малый штраф за
        резкие команды. Успех — последние 10 шагов (0,5 с) захват ближе 3 см.
     ===================================================================== */
  const TASK = { T: 40, HOLD: 0.03, LAST: 10, KD: 2, BONUS: 1, KA: 0.02, GAMMA: 0.95, AREA: { x0: 0.35, x1: 0.75, y0: -0.1, y1: 0.4 } };
  const OD = 8, AD = 2;
  const inArea = (x, y) => { const d = hyp(x, y); return d > 0.3 && d < 0.84; };
  const sampleTarget = (r) => { const A = TASK.AREA; for (;;) { const x = A.x0 + (A.x1 - A.x0) * r(), y = A.y0 + (A.y1 - A.y0) * r(); if (inArea(x, y)) return { x, y }; } };
  function targets(n, seed) { const r = rng(seed), out = []; while (out.length < n) out.push(sampleTarget(r)); return out; }
  TASK.TEST = targets(20, 515);
  function obs(S, t, o) {
    const p = fk(S.q), dx = t.x - p.x, dy = t.y - p.y; o = o || new Float64Array(OD);
    o[0] = (S.q[0] + 0.25) / 1.9; o[1] = (S.q[1] - 1.4) / 1.4; o[2] = S.dq[0] / 4; o[3] = S.dq[1] / 4;
    o[4] = dx / 0.3; o[5] = dy / 0.3; o[6] = tanh(dx / 0.05); o[7] = tanh(dy / 0.05); return o;
  }
  const distTo = (S, t) => { const p = fk(S.q); return hyp(p.x - t.x, p.y - t.y); };
  function reward(d, a) { return -TASK.KD * d + (d < TASK.HOLD ? TASK.BONUS : 0) - TASK.KA * (a[0] * a[0] + a[1] * a[1]); }
  /** Одна попытка политики act в мире w к цели t: успех, время прихода, кадры. */
  function episode(act, w, t, keep) {
    const S = armInit(w), o = new Float64Array(OD), fr = keep ? [{ q: S.q.slice() }] : null, ds = [];
    let ret = 0;
    for (let k = 0; k < TASK.T; k++) {
      obs(S, t, o); const a = act(o); ctrlStep(S, a); const d = distTo(S, t); ds.push(d); ret += reward(d, a);
      if (keep) fr.push({ q: S.q.slice() });
    }
    let ok = true; for (let k = TASK.T - TASK.LAST; k < TASK.T; k++) if (ds[k] >= TASK.HOLD) ok = false;
    let arrive = null; if (ok) for (let k = TASK.T - 1; k >= 0 && ds[k] < TASK.HOLD; k--) arrive = k + 1;
    return { ok, arrive, final: ds[TASK.T - 1], ret, frames: fr, ds, w, t };
  }

  /* =====================================================================
     4. Миры: номинал, «настоящие» руки и рандомизация.
        Ширина k: диапазон каждого параметра растёт от номинала линейно,
        при k = 1 он примерно накрывает разброс настоящих рук.
     ===================================================================== */
  const SPAN = { m: [-0.15, 0.35], f: [-0.1, 0.4], d: [0, 50], s: [-0.25, 0.1] }; // сдвиг границ при k = 1
  function ranges(k) {
    const out = {};
    for (const p of PARAMS) { const [a, b] = SPAN[p.key]; out[p.key] = [clamp(NOM[p.key] + a * k, p.lo, p.hi), clamp(NOM[p.key] + b * k, p.lo, p.hi)]; }
    return out;
  }
  /** Мир из диапазонов R: масса и трение — равномерно по логарифму (как у Peng et al.), задержка и сила — равномерно. */
  function sampleIn(R, r) {
    const w = {};
    for (const p of PARAMS) { const [a, b] = R[p.key], u = r(); w[p.key] = p.log && a > 0 ? a * exp(u * log(b / a)) : a + (b - a) * u; }
    return w;
  }
  /** Шесть «настоящих» рук Ады: тот же симулятор с параметрами, которых политика не видела. */
  const REAL = [
    { name: 'Ада 1', note: 'лёгкая чашка', m: 0.2, f: 0.15, d: 25, s: 0.95 },
    { name: 'Ада 2', note: 'полная кружка', m: 0.5, f: 0.2, d: 30, s: 0.95 },
    { name: 'Ада 3', note: 'тугие суставы', m: 0.3, f: 0.4, d: 30, s: 0.9 },
    { name: 'Ада 4', note: 'медленная связь', m: 0.25, f: 0.15, d: 45, s: 0.95 },
    { name: 'Ада 5', note: 'изношенные моторы', m: 0.3, f: 0.25, d: 35, s: 0.8 },
    { name: 'Ада 6', note: 'кружка и задержка', m: 0.45, f: 0.3, d: 40, s: 0.9 },
  ];
  /** Проверка политики: каждая рука из worlds × каждая цель проверки, среднее действие. */
  function evaluate(act, worlds, tg) {
    tg = tg || TASK.TEST; let ok = 0, n = 0, arr = 0, na = 0, fin = 0; const per = [];
    for (const w of worlds) {
      let okw = 0;
      for (const t of tg) { const e = episode(act, w, t); n++; fin += e.final; if (e.ok) { ok++; okw++; arr += e.arrive; na++; } }
      per.push(okw / tg.length);
    }
    return { rate: ok / n, arrive: na ? arr / na : null, final: fin / n, per };
  }

  /* =====================================================================
     5. PPO (как в уроке 5.2): порция эпизодов текущей политикой → GAE →
        несколько эпох с обрезкой отношения вероятностей → порция в корзину.
        Мир каждого эпизода даёт sampler: номинал, диапазон или ADR.
        Опции, выключенные в уроке: omni — критик видит параметры мира
        («omniscient critic» Peng et al.), DECAY — линейное снижение шага.
     ===================================================================== */
  const PPO = { H: 24, EPS: 10, EPOCHS: 8, MB: 100, LR: 3e-3, CLIP: 0.2, LAM: 0.95, LS0: -0.7, EVERY: 2000, DECAY: 0 };
  const LOG2PI = log(2 * Math.PI);
  function* ppoRun(o) {
    o = Object.assign({}, PPO, { steps: 40000, seed: 1, sampler: () => NOM }, o || {});
    const H = o.H, T = TASK.T, VD = OD + (o.omni ? PARAMS.length : 0), pi = net([OD, H, H, AD], o.seed * 7 + 1, 0.1), vf = net([VD, H, H, 1], o.seed * 7 + 4, 1), G = TASK.GAMMA;
    const ls = new Float64Array(AD).fill(o.LS0), mLs = new Float64Array(AD), vLs = new Float64Array(AD); let tLs = 0, pL1 = 1, pL2 = 1;
    const wPi = ws(pi), wV = ws(vf), gPi = grads(pi), gV = grads(vf), r = rng(o.seed * 13 + 9), er = rng(o.seed * 31 + 7);
    const det = (x) => Array.from(fwd(pi, wPi, x));
    const ev = () => { const res = {}; if (o.evalNom !== false) res.nom = evaluate(det, [NOM]); if (o.evalReal !== false) res.real = evaluate(det, REAL); if (o.onEval) o.onEval(res, det); return res; };
    const curve = [Object.assign({ step: 0 }, ev())];
    const N = o.EPS * T, S = new Array(N), SV = new Array(N), Aa = new Array(N), LP = new Float64Array(N), V = new Float64Array(N), RW = new Float64Array(N), BOOT = new Float64Array(N), ADV = new Float64Array(N), RET = new Float64Array(N);
    const s = new Float64Array(OD), sv = new Float64Array(VD), gOut = new Float64Array(AD), g1 = new Float64Array(1);
    const vIn = (x, w) => { sv.set(x); if (o.omni) PARAMS.forEach((p, i) => { sv[OD + i] = (w[p.key] - NOM[p.key]) / (p.sc || 1); }); return sv; };
    let step = 0, batches = 0; const t0 = Date.now();
    while (step < o.steps) {
      // 1) порция: EPS эпизодов, у каждого свой мир и своя цель
      for (let e = 0; e < o.EPS; e++) {
        const w = o.sampler(er, step), tgt = sampleTarget(er), Sm = armInit(w); let d = 0;
        for (let k = 0; k < T; k++) {
          const j = e * T + k; obs(Sm, tgt, s);
          const m = fwd(pi, wPi, s), a = new Float64Array(AD); let lp = 0;
          for (let i = 0; i < AD; i++) { const z = randn(r); a[i] = m[i] + exp(ls[i]) * z; lp += -0.5 * z * z - ls[i] - 0.5 * LOG2PI; }
          S[j] = Float64Array.from(s); SV[j] = Float64Array.from(vIn(s, w)); Aa[j] = a; LP[j] = lp; V[j] = fwd(vf, wV, SV[j])[0];
          ctrlStep(Sm, a); d = distTo(Sm, tgt); RW[j] = reward(d, a);
          if (k === T - 1) { obs(Sm, tgt, s); BOOT[j] = fwd(vf, wV, vIn(s, w))[0]; }
        }
        if (o.onEpisode) o.onEpisode(w, d < TASK.HOLD, step);
        step += T;
        yield { step, of: o.steps, curve };
      }
      batches++;
      // 2) преимущества GAE; эпизод обрезан по времени — дальше оценка ценности
      for (let e = 0; e < o.EPS; e++) {
        let gae = 0;
        for (let k = T - 1; k >= 0; k--) { const j = e * T + k, vNext = k === T - 1 ? BOOT[j] : V[j + 1], delta = RW[j] + G * vNext - V[j]; gae = delta + G * o.LAM * (k === T - 1 ? 0 : gae); ADV[j] = gae; RET[j] = gae + V[j]; }
      }
      let mu = 0, sq = 0; for (let j = 0; j < N; j++) mu += ADV[j]; mu /= N; for (let j = 0; j < N; j++) { const dv = ADV[j] - mu; sq += dv * dv; } const sdA = Math.sqrt(sq / N) + 1e-8;
      // 3) эпохи по этой порции, потом она выбрасывается
      const idx = Array.from({ length: N }, (_, j) => j);
      for (let ep = 0; ep < o.EPOCHS; ep++) {
        for (let j = N - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); const t = idx[j]; idx[j] = idx[k]; idx[k] = t; }
        for (let b0 = 0; b0 < N; b0 += o.MB) {
          const b1 = Math.min(N, b0 + o.MB), bn = b1 - b0; zero(gPi); zero(gV); const gLs = [0, 0];
          for (let jj = b0; jj < b1; jj++) {
            const j = idx[jj], m = fwd(pi, wPi, S[j]), adv = (ADV[j] - mu) / sdA; let lp = 0;
            for (let i = 0; i < AD; i++) { const z = (Aa[j][i] - m[i]) / exp(ls[i]); lp += -0.5 * z * z - ls[i] - 0.5 * LOG2PI; }
            const ratio = exp(lp - LP[j]), clipped = (adv >= 0 && ratio > 1 + o.CLIP) || (adv < 0 && ratio < 1 - o.CLIP);
            if (!clipped) {
              const kk = -ratio * adv;
              for (let i = 0; i < AD; i++) { const sd2 = exp(2 * ls[i]), dm = Aa[j][i] - m[i]; gOut[i] = kk * dm / sd2; gLs[i] += kk * (dm * dm / sd2 - 1); }
              bwd(pi, wPi, gOut, gPi);
            }
            const v = fwd(vf, wV, SV[j])[0]; g1[0] = 2 * (v - RET[j]); bwd(vf, wV, g1, gV);
          }
          const lr = o.LR * (1 - o.DECAY * step / o.steps); adam(pi, gPi, lr, 1 / bn); adam(vf, gV, lr, 1 / bn);
          tLs++; pL1 *= 0.9; pL2 *= 0.999; const c1 = 1 - pL1, c2 = 1 - pL2;
          for (let i = 0; i < AD; i++) { const gi = gLs[i] / bn; mLs[i] = 0.9 * mLs[i] + 0.1 * gi; vLs[i] = 0.999 * vLs[i] + 0.001 * gi * gi; ls[i] = clamp(ls[i] - lr * (mLs[i] / c1) / (Math.sqrt(vLs[i] / c2) + 1e-8), -3.5, 0.5); }
          yield;
        }
      }
      // проверка — после обновлений по порции: точка кривой описывает политику, которая получилась
      if (step % o.EVERY === 0 || step >= o.steps) { curve.push(Object.assign({ step }, ev())); yield { step, of: o.steps, curve }; }
    }
    return { curve, pi, act: det, batches, ms: Date.now() - t0, ls: Array.from(ls) };
  }
  /* =====================================================================
     6. Автоматическая рандомизация (ADR, OpenAI 2019). У каждого параметра
        свой диапазон [φL, φH], в начале — номинал (как калибровка настоящей
        руки). С вероятностью pb эпизод «пограничный»: один случайный параметр
        ставится на случайную границу, остальные — из текущих диапазонов. Успех
        такого эпизода копится в буфере этой границы; когда в буфере m эпизодов,
        доля успехов ≥ tH — граница отодвигается наружу на шаг Δ, ≤ tL —
        возвращается внутрь (не дальше номинала). Пограничные эпизоды тоже идут
        в обучение.
     ===================================================================== */
  const ADR = { PB: 0.5, M: 5, TH: 0.8, TL: 0.4, STEP: 0.25 };
  function adrInit(o) {
    o = Object.assign({}, ADR, o || {});
    const R = {}, buf = {}, log = [];
    for (const p of PARAMS) { R[p.key] = [NOM[p.key], NOM[p.key]]; buf[p.key] = { lo: [], hi: [] }; }
    const A = { o, R, buf, log, moves: 0 };
    A.sample = (r, step) => {
      const w = sampleIn(A.R, r);
      if (r() < o.PB) {
        const i = Math.floor(r() * PARAMS.length), p = PARAMS[i], [a0, b0] = SPAN[p.key];
        let side = r() < 0.5 ? 'lo' : 'hi';
        if (side === 'lo' && a0 === 0) side = 'hi'; if (side === 'hi' && b0 === 0) side = 'lo';   // у задержки нижняя граница — ноль
        w[p.key] = A.R[p.key][side === 'lo' ? 0 : 1]; w._b = { key: p.key, side };
      }
      return w;
    };
    A.onEpisode = (w, ok, step) => {
      if (!w._b) return;
      const { key, side } = w._b, B = A.buf[key][side]; B.push(ok ? 1 : 0);
      if (B.length < o.M) return;
      const avg = B.reduce((x, y) => x + y, 0) / B.length; B.length = 0;
      const p = PARAMS.find((q) => q.key === key), [a0, b0] = SPAN[key], j = side === 'lo' ? 0 : 1, dir = side === 'lo' ? a0 : b0, dl = Math.abs(dir) * o.STEP * (dir < 0 ? -1 : 1);
      const old = A.R[key][j]; let nv = old;
      if (avg >= o.TH) nv = old + dl; else if (avg <= o.TL) nv = old - dl;
      nv = side === 'lo' ? clamp(nv, p.lo, NOM[key]) : clamp(nv, NOM[key], p.hi);
      nv = Math.round(nv * 1e9) / 1e9;
      if (nv !== old) { A.R[key][j] = nv; A.moves++; }
      log.push({ step, key, side, avg, v: A.R[key][j] });
    };
    /** Ширина каждого диапазона в долях от ширины при k = 1. */
    A.width = () => { const out = {}; for (const p of PARAMS) { const [a0, b0] = SPAN[p.key]; out[p.key] = (A.R[p.key][1] - A.R[p.key][0]) / (b0 - a0); } return out; };
    return A;
  }
  function* adrRun(o) {
    const A = adrInit(o && o.adr), hist = [];
    const res = yield* ppoRun(Object.assign({}, o, { sampler: A.sample, onEpisode: A.onEpisode, onEval: (r) => { hist.push({ R: JSON.parse(JSON.stringify(A.R)) }); if (o && o.onEval) o.onEval(r); } }));
    res.curve.forEach((p, i) => { p.R = hist[i] ? hist[i].R : null; });
    return Object.assign(res, { adr: A });
  }

  /* =====================================================================
     7. Что считают лаборатории: бюджет, зерно, карты миров, разбор попыток.
     ===================================================================== */
  const LAB = { BUDGET: 12000, SEED: 3, ADR_BUDGET: 24000, WIDTHS: [0, 0.5, 1, 2, 3] };
  /** Обучение политики: kind = 'nom' (только номинальный мир), число k (ширина рандомизации) или 'adr'. */
  function train(kind, o) {
    o = Object.assign({ seed: LAB.SEED, steps: kind === 'adr' ? LAB.ADR_BUDGET : LAB.BUDGET, EVERY: 1200 }, o || {});
    if (kind === 'adr') return adrRun(o);
    const k = kind === 'nom' ? 0 : kind, R = ranges(k);
    return ppoRun(Object.assign({ sampler: k ? (r) => sampleIn(R, r) : () => NOM }, o));
  }
  /** Карты миров: по осям два параметра, остальные — номинальные. */
  const MAPS = {
    dm: { x: 'd', y: 'm', xs: [0, 10, 20, 30, 40, 50, 60, 70, 80], ys: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
    sf: { x: 's', y: 'f', xs: [1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4], ys: [0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3] },
  };
  const cellWorld = (key, i, j) => { const M = MAPS[key]; return Object.assign({}, NOM, { [M.x]: M.xs[i], [M.y]: M.ys[j] }); };
  function cell(act, key, i, j) { const e = evaluate(act, [cellWorld(key, i, j)]); return { rate: e.rate, arrive: e.arrive }; }
  /** Вся карта: генератор, клетка за клеткой. */
  function* mapGen(act, key) {
    const M = MAPS[key], out = [];
    for (let j = 0; j < M.ys.length; j++) { const row = []; for (let i = 0; i < M.xs.length; i++) { row.push(cell(act, key, i, j)); yield { done: j * M.xs.length + i + 1, of: M.xs.length * M.ys.length }; } out.push(row); }
    return out;
  }
  /** Подробно: каждая цель проверки в мире w — успех, время прихода, промах в конце. */
  function detail(act, w) { return TASK.TEST.map((t) => { const e = episode(act, w, t); return { ok: e.ok, arrive: e.arrive, final: e.final }; }); }

  /** Детерминированная политика из сети (среднее действие). */
  function actOf(pi) { const w = ws(pi); return (x) => Array.from(fwd(pi, w, x)); }
  /** Прогнать генератор до конца (Node, проверки). */
  function runSync(g) { let r; do { r = g.next(); } while (!r.done); return r.value; }

  const API = { exp, log, tanh, sincos, randn, fk, jac, clamp, net, clone, ws, fwd, PHYS, NOM, PARAMS, ARM, TASK, OD, AD, grav, accel, armInit, physStep, aimQ, ctrlStep, obs, distTo, reward, episode, targets, sampleTarget, SPAN, ranges, sampleIn, REAL, evaluate, PPO, ppoRun, ADR, adrInit, adrRun, LAB, train, MAPS, cellWorld, cell, mapGen, detail, actOf, runSync };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L54 = API;
})(typeof window !== 'undefined' ? window : globalThis);
