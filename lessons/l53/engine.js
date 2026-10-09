/* =====================================================================
   l53/engine.js — движок урока 5.3 «Off-policy и SAC». Без DOM: работает
   в браузере (window.L53, поверх window.Arm из shared/arm-core.js) и в Node.
   1) Мир: рука Ады из урока 0.3 — два звена 0,5 и 0,4 м, вид сбоку. Каждый
      шаг политика задаёт поворот обоих суставов (не больше 0,12 рад за шаг),
      эпизод — 25 шагов. Задача «дотянись»: цель появляется в новом месте
      перед Адой, награда за шаг — минус расстояние от захвата до цели, плюс
      бонус, пока захват ближе 4 см. Успех — захват ближе 4 см в конце эпизода.
   2) Маленькие сети (два скрытых слоя по 24 нейрона, ReLU с утечкой) и Adam.
   3) Три ученика на одной задаче:
      — PPO-подобный (on-policy): собрал порцию эпизодов текущей политикой,
        сделал по ней несколько эпох обновлений с обрезкой, порцию выбросил;
      — SAC (off-policy): каждый шаг идёт в буфер воспроизведения, каждый шаг —
        одно обновление двух Q-функций и политики по случайному пакету из
        буфера, температура энтропии α подстраивается сама или задана;
      — DQN (off-policy, 9 дискретных действий): для интерактива «буфер».
   4) Задача «две полки» для температуры α: старт один, две одинаковые чашки
      на двух полках, до обеих захвату одинаково далеко.
   Все случайности — с зерном: при одинаковых настройках результат тот же.
   ===================================================================== */
'use strict';
(function (root) {
  const Arm = (typeof module !== 'undefined' && module.exports) ? require('../shared/arm-core.js') : root.Arm;
  const { rng } = Arm;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* =====================================================================
     0. Переносимая математика. Math.exp, Math.log, Math.cos и другие в разных
        браузерах (и в Node) могут отличаться в последнем бите, а обучение
        усиливает эту разницу до других чисел в лабораториях. Здесь они собраны
        из сложений, умножений, делений и корня — их результат по стандарту
        IEEE 754 одинаков везде. Точность — около 1e-15.
     ===================================================================== */
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer); // младшее слово — U32[0] (little-endian)
  const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
  const pow2i = (k) => { U32[0] = 0; U32[1] = (k + 1023) << 20; return F64[0]; };
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
    F64[0] = x; let hi = U32[1], e = ((hi >>> 20) & 0x7ff) - 1023;
    if (e === -1023) { F64[0] = x * 18014398509481984; hi = U32[1]; e = ((hi >>> 20) & 0x7ff) - 1023 - 54; }
    U32[1] = (hi & 0x000fffff) | 0x3ff00000; let m = F64[0];
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
  /** Кинематика руки из урока 0.3 (звенья Arm.L1, Arm.L2) — на переносимых sin и cos. */
  function fk(q) { const [s1, c1] = sincos(q[0]), [s12, c12] = sincos(q[0] + q[1]), x1 = Arm.L1 * c1, y1 = Arm.L1 * s1; return { x1, y1, x: x1 + Arm.L2 * c12, y: y1 + Arm.L2 * s12 }; }
  function jac(q) { const [s1, c1] = sincos(q[0]), [s12, c12] = sincos(q[0] + q[1]), L1 = Arm.L1, L2 = Arm.L2; return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]]; }

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
  /** Рабочая память прямого и обратного прохода для одной сети (один пример за раз). */
  function ws(n) { return { a: n.sizes.map((k) => new Float64Array(k)), d: n.sizes.map((k) => new Float64Array(k)) }; }
  function grads(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  function zero(g) { for (const w of g.W) w.fill(0); for (const b of g.B) b.fill(0); }
  /** Счётчик умножений со сложением во всех сетях: им сравниваем цену вычислений учеников. */
  const OPS = { n: 0 };
  /** Прямой проход: x — вход (массив), результат — в c.a[L]. */
  function fwd(n, c, x) {
    const a0 = c.a[0]; for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    for (let l = 0; l < n.L; l++) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], b = n.B[l], ai = c.a[l], ao = c.a[l + 1], hid = l < n.L - 1;
      for (let o = 0; o < nO; o++) ao[o] = b[o];
      OPS.n += nI * nO;
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
      if (hid) for (let o = 0; o < nO; o++) { const z = ao[o]; if (z < 0) ao[o] = 0.01 * z; }
    }
    return c.a[n.L];
  }
  /** Обратный проход после fwd: gOut — градиент по выходу; копит градиенты в g (если есть); возвращает градиент по входу. */
  function bwd(n, c, gOut, g, noIn) {
    const dL = c.d[n.L]; for (let o = 0; o < dL.length; o++) dL[o] = gOut[o];
    for (let l = n.L - 1; l >= 0; l--) {
      if (l === 0 && noIn) { OPS.n += n.sizes[0] * n.sizes[1]; const nI = n.sizes[0], nO = n.sizes[1], ai = c.a[0], dO = c.d[1], gw = g.W[0], gb = g.B[0]; for (let o = 0; o < nO; o++) gb[o] += dO[o]; for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) gw[off + o] += v * dO[o]; } break; }
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], dO = c.d[l + 1], dI = c.d[l];
      OPS.n += (g ? 2 : 1) * nI * nO;
      if (g) { const gw = g.W[l], gb = g.B[l]; for (let o = 0; o < nO; o++) gb[o] += dO[o]; for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) gw[off + o] += v * dO[o]; } }
      for (let i = 0; i < nI; i++) { let s = 0; const off = i * nO; for (let o = 0; o < nO; o++) s += w[off + o] * dO[o]; dI[i] = s; }
      if (l > 0) for (let i = 0; i < nI; i++) if (ai[i] < 0) dI[i] *= 0.01;
    }
    return c.d[0];
  }
  function adam(n, g, lr, scale) {
    n.t++; const b1 = 0.9, b2 = 0.999; n.p1 *= b1; n.p2 *= b2; const c1 = 1 - n.p1, c2 = 1 - n.p2;
    for (let l = 0; l < n.L; l++) for (const [P, G, M, V] of [[n.W[l], g.W[l], n.mW[l], n.vW[l]], [n.B[l], g.B[l], n.mB[l], n.vB[l]]]) {
      for (let i = 0; i < P.length; i++) { const gi = G[i] * scale; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }
  /** Целевая сеть медленно догоняет обучаемую: θ' ← τθ + (1 − τ)θ'. */
  function soft(tg, n, tau) { for (let l = 0; l < n.L; l++) { const a = tg.W[l], b = n.W[l]; for (let i = 0; i < a.length; i++) a[i] += tau * (b[i] - a[i]); const c = tg.B[l], d = n.B[l]; for (let i = 0; i < c.length; i++) c[i] += tau * (d[i] - c[i]); } }

  /* =====================================================================
     2. Мир: рука Ады из урока 0.3, вид сбоку, плечо в начале координат.
        Действие a ∈ [−1, 1]² — куда сдвинуть захват за шаг (до DP по каждой
        оси); регулятор руки пересчитывает сдвиг в повороты суставов через
        якобиан (затухающие наименьшие квадраты), как в уроке 0.3.
     ===================================================================== */
  const ARM = { DP: 0.05, DQ: 0.3, Q0: [-1.35, 1.9], QLIM: [[-1.9, 1.6], [0.05, 2.75]] };
  function stepQ(q, a) {
    const J = jac(q), dx = ARM.DP * clamp(a[0], -1, 1), dy = ARM.DP * clamp(a[1], -1, 1), l2 = 0.0025;
    const m00 = J[0][0] * J[0][0] + J[0][1] * J[0][1] + l2, m01 = J[0][0] * J[1][0] + J[0][1] * J[1][1], m11 = J[1][0] * J[1][0] + J[1][1] * J[1][1] + l2, det = m00 * m11 - m01 * m01;
    const u = (m11 * dx - m01 * dy) / det, v = (-m01 * dx + m00 * dy) / det;
    const d0 = clamp(J[0][0] * u + J[1][0] * v, -ARM.DQ, ARM.DQ), d1 = clamp(J[0][1] * u + J[1][1] * v, -ARM.DQ, ARM.DQ);
    return [clamp(q[0] + d0, ARM.QLIM[0][0], ARM.QLIM[0][1]), clamp(q[1] + d1, ARM.QLIM[1][0], ARM.QLIM[1][1])];
  }
  const OD = 6, AD = 2;
  const qn = (q, o) => { o[0] = (q[0] + 0.15) / 1.75; o[1] = (q[1] - 1.4) / 1.35; };

  /* ---------- задача «дотянись»: цель каждый эпизод в новом месте ---------- */
  const REACH = { name: 'reach', T: 25, HOLD: 0.04, BONUS: 1, KD: 4, GAMMA: 0.9, AREA: { x0: 0.3, x1: 0.8, y0: -0.15, y1: 0.45 } };
  const inArea = (x, y) => { const d = hyp(x, y); return d > 0.25 && d < 0.86; };
  /** Цель: равномерно в прямоугольнике перед Адой, только досягаемая (не ближе 0,25 и не дальше 0,86 м от плеча). */
  const sampleTarget = (r) => { const A = REACH.AREA; for (;;) { const x = A.x0 + (A.x1 - A.x0) * r(), y = A.y0 + (A.y1 - A.y0) * r(); if (inArea(x, y)) return { x, y }; } };
  function targets(n, seed) { const r = rng(seed), out = []; while (out.length < n) out.push(sampleTarget(r)); return out; }
  const dist = (q, t) => { const p = fk(q); return hyp(p.x - t.x, p.y - t.y); };
  /** Наблюдение: углы суставов (нормированы) и вектор от захвата к цели — грубо (÷30 см) и точно (÷5 см, с насыщением). */
  REACH.reset = (r, t) => ({ q: ARM.Q0.slice(), t: t || sampleTarget(r) });
  REACH.obs = (st, o) => {
    const p = fk(st.q), dx = st.t.x - p.x, dy = st.t.y - p.y; o = o || new Float64Array(OD); qn(st.q, o);
    o[2] = dx / 0.3; o[3] = dy / 0.3; o[4] = tanh(dx / 0.05); o[5] = tanh(dy / 0.05); return o;
  };
  REACH.reward = (d) => -REACH.KD * d + (d < REACH.HOLD ? REACH.BONUS : 0);
  REACH.step = (st, a) => { st.q = stepQ(st.q, a); return REACH.reward(dist(st.q, st.t)); };
  /** Проверка: 40 целей, которых не было в обучении; детерминированная политика (среднее действие). */
  REACH.TEST = targets(40, 777);
  function rollout(task, act, st, keep) {
    const o = new Float64Array(OD), path = keep ? [fk(st.q)] : null; let ret = 0, g = 1, sum = 0;
    for (let k = 0; k < task.T; k++) { task.obs(st, o); const rw = task.step(st, act(o)); ret += g * rw; sum += rw; g *= task.GAMMA; if (path) path.push(fk(st.q)); }
    return { st, path, ret, mean: sum / task.T };
  }
  REACH.evaluate = (act, set) => {
    set = set || REACH.TEST; let ok = 0, sd = 0;
    for (const t of set) { const { st } = rollout(REACH, act, REACH.reset(null, t)); const d = dist(st.q, t); if (d < REACH.HOLD) ok++; sd += d; }
    return { rate: ok / set.length, dist: sd / set.length };
  };

  /* ---------- задача «две полки»: старт один, на каждой полке — одинаковая чашка; A — дальняя от корпуса, B — у корпуса; до обеих ~38 см ---------- */
  const SHELF = { name: 'shelf', T: 25, GAMMA: 0.9, A: { x: 0.75, y: -0.04 }, B: { x: 0.25, y: 0.05 }, RA: 1, RB: 1, SIG: 0.08, HOLD: 0.06, EVAL: 40 };
  SHELF.reset = () => ({ q: ARM.Q0.slice() });
  SHELF.obs = (st, o) => { const p = fk(st.q); o = o || new Float64Array(OD); qn(st.q, o); o[2] = (p.x - 0.5) / 0.3; o[3] = (p.y - 0.1) / 0.3; o[4] = 0; o[5] = 0; return o; };
  SHELF.reward = (p) => { const sA = SHELF.SIGA || SHELF.SIG, sB = SHELF.SIG, dA = (p.x - SHELF.A.x) ** 2 + (p.y - SHELF.A.y) ** 2, dB = (p.x - SHELF.B.x) ** 2 + (p.y - SHELF.B.y) ** 2; return Math.max(SHELF.RA * exp(-dA / (2 * sA * sA)), SHELF.RB * exp(-dB / (2 * sB * sB))); };
  SHELF.step = (st, a) => { st.q = stepQ(st.q, a); return SHELF.reward(fk(st.q)); };
  /** Где закончилась попытка: у дальней полки, у ближней или нигде. */
  SHELF.where = (q) => { const p = fk(q); return hyp(p.x - SHELF.B.x, p.y - SHELF.B.y) < SHELF.HOLD ? 'B' : hyp(p.x - SHELF.A.x, p.y - SHELF.A.y) < SHELF.HOLD ? 'A' : '0'; };
  /** Проверка: EVAL попыток стохастической политикой (так она действует во время обучения) и одна — средним действием. */
  SHELF.evaluate = (act, _set, actS, seed) => {
    const r = rng(seed || 99), n = SHELF.EVAL, cnt = { A: 0, B: 0, 0: 0 }, paths = [], qs = []; let ret = 0;
    for (let i = 0; i < n; i++) { const ro = rollout(SHELF, (o) => actS(o, r), SHELF.reset(), true); cnt[SHELF.where(ro.st.q)]++; ret += ro.mean; paths.push(ro.path); qs.push(ro.st.q); }
    const det = rollout(SHELF, act, SHELF.reset(), true);
    return { rate: cnt.B / n, A: cnt.A / n, B: cnt.B / n, none: cnt[0] / n, ret: ret / n, paths, qs, det: det.path, detQ: det.st.q, detAt: SHELF.where(det.st.q) };
  };

  /* =====================================================================
     3. Буфер воспроизведения: переходы (s, a, r, s'); когда место кончается,
        новые записываются поверх самых старых. Счётчик — сколько раз переход
        попал в пакет обучения.
     ===================================================================== */
  function buffer(cap) { return { cap, n: 0, head: 0, total: 0, s: new Array(cap), a: new Array(cap), r: new Float64Array(cap), s2: new Array(cap), ep: new Int32Array(cap), born: new Int32Array(cap), used: new Int32Array(cap) }; }
  function push(b, s, a, r, s2, ep, step) {
    const k = b.n < b.cap ? b.n++ : b.head; b.head = (k + 1) % b.cap; b.total++;
    b.s[k] = Float64Array.from(s); b.a[k] = Array.isArray(a) || a.length ? Float64Array.from(a) : a; b.r[k] = r; b.s2[k] = Float64Array.from(s2); b.ep[k] = ep; b.born[k] = step; b.used[k] = 0; return k;
  }
  /** Пакет: равномерно из всего буфера (как в DQN) или последние n переходов подряд (обучение без буфера). */
  function batchIdx(b, n, r, recent) {
    const idx = new Int32Array(Math.min(n, b.n));
    if (recent) { for (let j = 0; j < idx.length; j++) idx[j] = (b.head - idx.length + j + b.cap) % b.cap; }
    else for (let j = 0; j < idx.length; j++) idx[j] = Math.floor(r() * b.n);
    for (const k of idx) b.used[k]++;
    return idx;
  }

  /* =====================================================================
     4. SAC: политика — гауссиана со сжатием tanh, две Q-функции и их
        целевые копии, буфер воспроизведения, автоматическая температура α
        (или заданная). Одно и то же для обеих задач.
     ===================================================================== */
  const LOG2PI = log(2 * Math.PI), LSMIN = -5, LSMAX = 1;
  const SAC = { H: 24, BATCH: 32, LR: 5e-3, TAU: 0.01, WARM: 200, EVERY: 125, ALPHA0: 0.1, LRA: 3e-3, TARGET_H: -2, UTD: 1 };
  const newRes = () => ({ a: new Float64Array(AD), ls: new Float64Array(AD), sd: new Float64Array(AD), th: new Float64Array(AD), e: new Float64Array(AD), logp: 0 });
  /** Выход сети политики → действие a = tanh(μ + σε) и log π(a|s); разброс σ мягко ограничен. */
  function sacSample(out, r, res) {
    let logp = 0;
    for (let i = 0; i < AD; i++) {
      const e = randn(r), th = tanh(out[AD + i]), ls = LSMIN + 0.5 * (LSMAX - LSMIN) * (th + 1), sd = exp(ls), a = tanh(out[i] + sd * e);
      res.a[i] = a; res.ls[i] = ls; res.sd[i] = sd; res.th[i] = th; res.e[i] = e;
      logp += -0.5 * e * e - ls - 0.5 * LOG2PI - log(1 - a * a + 1e-6);
    }
    res.logp = logp; return res;
  }
  function sacInit(seed, o) {
    o = Object.assign({}, SAC, o || {}); const H = o.H;
    const pi = net([OD, H, H, 2 * AD], seed * 7 + 1, 0.1), q1 = net([OD + AD, H, H, 1], seed * 7 + 2, 0.1), q2 = net([OD + AD, H, H, 1], seed * 7 + 3, 0.1);
    return { o, pi, q1, q2, t1: clone(q1), t2: clone(q2), logA: log(o.alpha != null ? Math.max(o.alpha, 1e-6) : o.ALPHA0), auto: o.alpha == null,
      wPi: ws(pi), wQ1: ws(q1), wQ2: ws(q2), wT1: ws(q1), wT2: ws(q2), gPi: grads(pi), gQ1: grads(q1), gQ2: grads(q2), r: rng(seed * 13 + 5), updates: 0,
      x: new Float64Array(OD + AD), res: newRes(), g1: new Float64Array(1), gOut: new Float64Array(2 * AD) };
  }
  /** Действие SAC: случайное по политике (сбор опыта) или среднее (проверка). */
  function sacAct(A, o, det, r) {
    const out = fwd(A.pi, A.wPi, o);
    if (det) return [tanh(out[0]), tanh(out[1])];
    const z = sacSample(out, r || A.r, A.res); return [z.a[0], z.a[1]];
  }
  /** Одно обновление по пакету из буфера: две Q-функции, политика, температура, целевые копии. */
  function sacUpdate(A, buf, gamma) {
    const o = A.o, r = A.r, x = A.x, res = A.res, g1 = A.g1, gOut = A.gOut, alpha = exp(A.logA);
    zero(A.gQ1); zero(A.gQ2); zero(A.gPi);
    const idx = batchIdx(buf, o.BATCH, r), Bn = idx.length; let qLoss = 0, ent = 0, dA = 0;
    // критики: цель y = r + γ (min Q'(s', a') − α log π(a'|s')), a' ~ π(·|s') — действие текущей политики, а не то, что было в записи
    for (let j = 0; j < Bn; j++) {
      const k = idx[j], s = buf.s[k], a = buf.a[k], s2 = buf.s2[k];
      sacSample(fwd(A.pi, A.wPi, s2), r, res);
      x.set(s2); x[OD] = res.a[0]; x[OD + 1] = res.a[1];
      const y = buf.r[k] + gamma * (Math.min(fwd(A.t1, A.wT1, x)[0], fwd(A.t2, A.wT2, x)[0]) - alpha * res.logp);
      x.set(s); x[OD] = a[0]; x[OD + 1] = a[1];
      const p1 = fwd(A.q1, A.wQ1, x)[0]; g1[0] = 2 * (p1 - y); bwd(A.q1, A.wQ1, g1, A.gQ1, true);
      const p2 = fwd(A.q2, A.wQ2, x)[0]; g1[0] = 2 * (p2 - y); bwd(A.q2, A.wQ2, g1, A.gQ2, true);
      qLoss += (p1 - y) * (p1 - y);
    }
    adam(A.q1, A.gQ1, o.LR, 1 / Bn); adam(A.q2, A.gQ2, o.LR, 1 / Bn);
    // политика: минимизировать α log π(ã|s) − min Q(s, ã), ã = tanh(μ + σε) — градиент идёт через действие (репараметризация)
    for (let j = 0; j < Bn; j++) {
      const s = buf.s[idx[j]]; sacSample(fwd(A.pi, A.wPi, s), r, res);
      x.set(s); x[OD] = res.a[0]; x[OD + 1] = res.a[1];
      const qa = fwd(A.q1, A.wQ1, x)[0], qb = fwd(A.q2, A.wQ2, x)[0];
      g1[0] = 1; const gx = qa <= qb ? bwd(A.q1, A.wQ1, g1, null) : bwd(A.q2, A.wQ2, g1, null);
      for (let i = 0; i < AD; i++) {
        const a = res.a[i], dQda = gx[OD + i], du = 1 - a * a, sdE = res.sd[i] * res.e[i];
        gOut[i] = alpha * 2 * a - dQda * du;                                              // ∂/∂μ
        gOut[AD + i] = (alpha * (-1 + 2 * a * sdE) - dQda * du * sdE) * 0.5 * (LSMAX - LSMIN) * (1 - res.th[i] * res.th[i]); // ∂/∂(сырой log σ)
      }
      fwd(A.pi, A.wPi, s); bwd(A.pi, A.wPi, gOut, A.gPi, true);
      ent += -res.logp; dA += -(res.logp + o.TARGET_H);
    }
    adam(A.pi, A.gPi, o.LR, 1 / Bn);
    if (A.auto) A.logA = clamp(A.logA - o.LRA * (dA / Bn), -12, 3);                       // ∂J(α)/∂log α = −E[log π + H̄]
    soft(A.t1, A.q1, o.TAU); soft(A.t2, A.q2, o.TAU); A.updates++;
    return { qLoss: qLoss / Bn, ent: ent / Bn };
  }
  /** Обучение SAC на задаче: steps шагов взаимодействия; после разминки случайными действиями — UTD обновлений на шаг. */
  function* sacRun(task, o) {
    o = Object.assign({ steps: 1500, seed: 1 }, o || {});
    const A = sacInit(o.seed, o), er = rng(o.seed * 31 + 7), buf = buffer(o.steps), s = new Float64Array(OD), s2 = new Float64Array(OD);
    const det = (x) => sacAct(A, x, true), sto = (x, rr) => sacAct(A, x, false, rr);
    let ops = 0; const ev = () => { const o0 = OPS.n, e = task.evaluate(det, null, sto, o.evalSeed); OPS.n = o0; return Object.assign({ alpha: exp(A.logA), pol: o.snap ? clone(A.pi) : null, ops }, e); };
    const curve = [Object.assign({ step: 0 }, ev())];
    let st = null, ep = -1; const t0 = Date.now();
    for (let step = 0; step < o.steps; step++) {
      if (step % task.T === 0) { st = task.reset(er); ep++; }
      task.obs(st, s);
      const o0 = OPS.n, a = step < A.o.WARM ? [er() * 2 - 1, er() * 2 - 1] : sacAct(A, s, false);
      const rw = task.step(st, a); task.obs(st, s2);
      push(buf, s, a, rw, s2, ep, step);
      if (step >= A.o.WARM) for (let u = 0; u < A.o.UTD; u++) sacUpdate(A, buf, task.GAMMA);
      ops += OPS.n - o0;
      if ((step + 1) % A.o.EVERY === 0) { curve.push(Object.assign({ step: step + 1 }, ev())); yield { step: step + 1, of: o.steps, curve }; }
      else if (step % 4 === 0) yield;
    }
    return { kind: 'sac', A, curve, buf, updates: A.updates, ms: Date.now() - t0, act: det, sto };
  }

  /* =====================================================================
     5. PPO-подобный ученик (on-policy): порция эпизодов текущей политикой →
        несколько эпох обновлений с обрезкой отношения вероятностей → порция
        выбрасывается. Политика — гауссиана: среднее от сети, разброс — общий
        параметр; преимущества — GAE, как в уроке 5.2. Настройки подобраны
        под эту задачу (см. INTEGRATION.md): порция 125 шагов (5 эпизодов), 20 эпох.
     ===================================================================== */
  const PPO = { H: 24, N: 125, EPOCHS: 20, MB: 50, LR: 3e-3, CLIP: 0.2, LAM: 0.95, LS0: -0.7, EVERY: 125 };
  function* ppoRun(task, o) {
    o = Object.assign({}, PPO, { steps: 6000, seed: 1 }, o || {});
    const H = o.H, pi = net([OD, H, H, AD], o.seed * 7 + 1, 0.1), vf = net([OD, H, H, 1], o.seed * 7 + 4, 1), G = task.GAMMA;
    const ls = new Float64Array(AD).fill(o.LS0), mLs = new Float64Array(AD), vLs = new Float64Array(AD); let tLs = 0, pL1 = 1, pL2 = 1;
    const wPi = ws(pi), wV = ws(vf), gPi = grads(pi), gV = grads(vf), r = rng(o.seed * 13 + 9), er = rng(o.seed * 31 + 7);
    const det = (x) => { const m = fwd(pi, wPi, x); return [m[0], m[1]]; };
    const sto = (x, rr) => { const m = fwd(pi, wPi, x); return [m[0] + exp(ls[0]) * randn(rr), m[1] + exp(ls[1]) * randn(rr)]; };
    let ops = 0; const ev = () => { const o0 = OPS.n, e = task.evaluate(det, null, sto, o.evalSeed); OPS.n = o0; return Object.assign({ pol: o.snap ? clone(pi) : null, ops }, e); };
    const curve = [Object.assign({ step: 0 }, ev())];
    const N = o.N, S = new Array(N), Aa = new Array(N), LP = new Float64Array(N), V = new Float64Array(N + 1), RW = new Float64Array(N), LAST = new Uint8Array(N), BOOT = new Float64Array(N), ADV = new Float64Array(N), RET = new Float64Array(N);
    let st = null, step = 0, updates = 0, batches = 0; const s = new Float64Array(OD), s2 = new Float64Array(OD), gOut = new Float64Array(AD), g1 = new Float64Array(1);
    const t0 = Date.now();
    while (step < o.steps) {
      const n = Math.min(N, o.steps - step);
      // 1) порция опыта текущей политикой
      for (let j = 0; j < n; j++, step++) {
        if (step % task.T === 0) st = task.reset(er);
        task.obs(st, s); const o0 = OPS.n, m = fwd(pi, wPi, s), a = new Float64Array(AD); let lp = 0;
        for (let i = 0; i < AD; i++) { const e = randn(r); a[i] = m[i] + exp(ls[i]) * e; lp += -0.5 * e * e - ls[i] - 0.5 * LOG2PI; }
        S[j] = Float64Array.from(s); Aa[j] = a; LP[j] = lp; V[j] = fwd(vf, wV, s)[0];
        RW[j] = task.step(st, a);
        LAST[j] = (step + 1) % task.T === 0 || j === n - 1 ? 1 : 0;
        if (LAST[j]) { task.obs(st, s2); BOOT[j] = fwd(vf, wV, s2)[0]; } // эпизод обрезан по времени: дальше — оценка ценности
        ops += OPS.n - o0;
        if ((step + 1) % o.EVERY === 0) { curve.push(Object.assign({ step: step + 1 }, ev())); yield { step: step + 1, of: o.steps, curve }; }
        else if (j % 16 === 0) yield;
      }
      batches++;
      // 2) преимущества GAE
      let gae = 0;
      for (let j = n - 1; j >= 0; j--) {
        const vNext = LAST[j] ? BOOT[j] : V[j + 1], delta = RW[j] + G * vNext - V[j];
        gae = delta + G * o.LAM * (LAST[j] ? 0 : gae); ADV[j] = gae; RET[j] = gae + V[j];
      }
      let mu = 0, sq = 0; for (let j = 0; j < n; j++) mu += ADV[j]; mu /= n; for (let j = 0; j < n; j++) sq += (ADV[j] - mu) ** 2; const sdA = Math.sqrt(sq / n) + 1e-8;
      // 3) несколько эпох по этой порции; потом она выбрасывается
      const idx = Array.from({ length: n }, (_, j) => j), oU = OPS.n;
      for (let ep = 0; ep < o.EPOCHS; ep++) {
        for (let j = n - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); const t = idx[j]; idx[j] = idx[k]; idx[k] = t; }
        for (let b0 = 0; b0 < n; b0 += o.MB) {
          const b1 = Math.min(n, b0 + o.MB), bn = b1 - b0; zero(gPi); zero(gV); const gLs = [0, 0];
          for (let jj = b0; jj < b1; jj++) {
            const j = idx[jj], m = fwd(pi, wPi, S[j]), adv = (ADV[j] - mu) / sdA; let lp = 0;
            for (let i = 0; i < AD; i++) { const z = (Aa[j][i] - m[i]) / exp(ls[i]); lp += -0.5 * z * z - ls[i] - 0.5 * LOG2PI; }
            const ratio = exp(lp - LP[j]), clipped = (adv >= 0 && ratio > 1 + o.CLIP) || (adv < 0 && ratio < 1 - o.CLIP);
            if (!clipped) { // градиент −r·A·∇log π; в обрезанной зоне он равен нулю
              const k = -ratio * adv;
              for (let i = 0; i < AD; i++) { const sd2 = exp(2 * ls[i]), dm = Aa[j][i] - m[i]; gOut[i] = k * dm / sd2; gLs[i] += k * (dm * dm / sd2 - 1); }
              bwd(pi, wPi, gOut, gPi, true);
            }
            const v = fwd(vf, wV, S[j])[0]; g1[0] = 2 * (v - RET[j]); bwd(vf, wV, g1, gV, true);
          }
          adam(pi, gPi, o.LR, 1 / bn); adam(vf, gV, o.LR, 1 / bn); updates++;
          tLs++; pL1 *= 0.9; pL2 *= 0.999; const c1 = 1 - pL1, c2 = 1 - pL2;
          for (let i = 0; i < AD; i++) { const gi = gLs[i] / bn; mLs[i] = 0.9 * mLs[i] + 0.1 * gi; vLs[i] = 0.999 * vLs[i] + 0.001 * gi * gi; ls[i] = clamp(ls[i] - o.LR * (mLs[i] / c1) / (Math.sqrt(vLs[i] / c2) + 1e-8), -4, 1); }
          yield;
        }
      }
      ops += OPS.n - oU; if (curve.length) curve[curve.length - 1].ops = ops;
    }
    return { kind: 'ppo', curve, updates, batches, ms: Date.now() - t0, act: det, sto, ls };
  }
  /** Детерминированная политика из снимка сети: SAC — tanh(μ), PPO — μ (среда сама обрежет до [−1, 1]). */
  function snapAct(pol, kind) { const w = ws(pol); return (x) => { const m = fwd(pol, w, x); return kind === 'sac' ? [tanh(m[0]), tanh(m[1])] : [m[0], m[1]]; }; }
  /** Сколько раз в среднем каждый переход попал в пакет обучения. */
  function reuse(buf) { let s = 0; for (let k = 0; k < buf.n; k++) s += buf.used[k]; return s / Math.max(1, buf.n); }
  /** Первый шаг кривой, где успех не ниже th (или null). */
  const reach = (curve, th) => { const p = curve.find((q) => q.rate >= th - 1e-9); return p ? p.step : null; };

  /* =====================================================================
     6. DQN для интерактива «буфер»: та же рука, 9 дискретных действий —
        сдвиг захвата на 5 см влево/вправо, вниз/вверх или на месте по
        каждой оси. Q-сеть выдаёт ценность всех 9 действий сразу; ε-жадный
        выбор; пакет — из буфера (или последние переходы подряд, если буфера
        нет); целевая сеть — копия, обновляется раз в TGT шагов.
     ===================================================================== */
  const ACTS = []; for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) ACTS.push([dx, dy]);
  const DQN = { H: 24, BATCH: 32, LR: 3e-3, WARM: 100, EPS0: 1, EPS1: 0.1, EPS_STEPS: 1000, TGT: 100, EVERY: 100, CAP: 1e9, recent: false };
  function dqnInit(o) {
    o = Object.assign({}, DQN, { seed: 1, steps: 3000 }, o || {});
    const q = net([OD, o.H, o.H, ACTS.length], o.seed * 11 + 1, 0.1);
    const D = { o, q, tq: clone(q), w: ws(q), wt: ws(q), g: grads(q), r: rng(o.seed * 17 + 3), er: rng(o.seed * 31 + 7), buf: buffer(Math.min(o.CAP, o.steps)), step: 0, ep: -1, st: null, s: new Float64Array(OD), s2: new Float64Array(OD), gOut: new Float64Array(ACTS.length), last: null, curve: [], y0: new Float64Array(Math.min(o.CAP, o.steps)).fill(NaN), meta: new Array(Math.min(o.CAP, o.steps)), lastA: 0, lastEps: 1 };
    D.curve.push(Object.assign({ step: 0 }, REACH.evaluate((x) => ACTS[dqnGreedy(D, x)])));
    return D;
  }
  function dqnGreedy(D, x) { const out = fwd(D.q, D.w, x); let b = 0; for (let i = 1; i < out.length; i++) if (out[i] > out[b]) b = i; return b; }
  const dqnEps = (D) => { const o = D.o; return D.step >= o.EPS_STEPS ? o.EPS1 : o.EPS0 + (o.EPS1 - o.EPS0) * D.step / o.EPS_STEPS; };
  /** Цель обучения перехода k сейчас: y = r + γ · max Q_цел(s', a'). */
  function dqnTarget(D, k) { const b = D.buf, out = fwd(D.tq, D.wt, b.s2[k]); let m = -Infinity; for (let i = 0; i < out.length; i++) m = Math.max(m, out[i]); return b.r[k] + REACH.GAMMA * m; }
  function dqnQ(D, k) { return fwd(D.q, D.w, D.buf.s[k])[D.buf.a[k]]; }
  /** Один шаг: действие в мире, переход в буфер, одно обновление по пакету. */
  function dqnStep(D) {
    const o = D.o, R = REACH;
    if (D.step % R.T === 0) { D.st = R.reset(D.er); D.ep++; }
    R.obs(D.st, D.s); const eps = dqnEps(D), q0 = D.st.q.slice(); D.lastEps = eps;
    const ai = D.er() < eps ? Math.floor(D.er() * ACTS.length) : dqnGreedy(D, D.s);
    const rw = R.step(D.st, ACTS[ai]); R.obs(D.st, D.s2);
    const k = push(D.buf, D.s, ai, rw, D.s2, D.ep, D.step); D.y0[k] = NaN; D.lastA = ai; D.lastK = k;
    D.meta[k] = { q: q0, q2: D.st.q.slice(), t: D.st.t };
    if (D.step >= o.WARM) {
      const idx = batchIdx(D.buf, o.BATCH, D.r, o.recent), b = D.buf; zero(D.g);
      for (const j of idx) {
        const y = dqnTarget(D, j); if (Number.isNaN(D.y0[j])) D.y0[j] = y;
        const out = fwd(D.q, D.w, b.s[j]); D.gOut.fill(0); D.gOut[b.a[j]] = clamp(out[b.a[j]] - y, -1, 1) * 2; bwd(D.q, D.w, D.gOut, D.g, true);
      }
      adam(D.q, D.g, o.LR, 1 / idx.length); D.last = idx;
      if ((D.step - o.WARM + 1) % o.TGT === 0) D.tq = clone(D.q);
    } else D.last = null;
    D.step++;
    if (D.step % o.EVERY === 0) D.curve.push(Object.assign({ step: D.step }, REACH.evaluate((x) => ACTS[dqnGreedy(D, x)])));
    return D;
  }
  function* dqnRun(o) { const D = dqnInit(o); const t0 = Date.now(); while (D.step < D.o.steps) { dqnStep(D); if (D.step % D.o.EVERY === 0) yield { step: D.step, of: D.o.steps, curve: D.curve }; else if (D.step % 4 === 0) yield; } D.ms = Date.now() - t0; return D; }

  const API = { exp, log, tanh, sincos, fk, jac, randn, OPS, OD, AD, clamp, net, clone, ws, grads, zero, fwd, bwd, adam, soft, ARM, stepQ, REACH, SHELF, targets, sampleTarget, dist, rollout, buffer, push, batchIdx, SAC, sacInit, sacAct, sacUpdate, sacRun, PPO, ppoRun, reach, snapAct, reuse, ACTS, DQN, dqnInit, dqnStep, dqnRun, dqnGreedy, dqnTarget, dqnQ, dqnEps };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L53 = API;
})(typeof window !== 'undefined' ? window : globalThis);
