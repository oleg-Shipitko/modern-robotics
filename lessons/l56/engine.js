/* =====================================================================
   l56/engine.js — движок урока 5.6 «Offline RL». Без DOM: работает в
   браузере (window.L56, поверх window.Drive из shared/drive-core.js) и в
   Node (require).
   1) Среда: дом Ады из уроков 1.1, 1.2 и 5.2 (вид сверху, 6 × 4 м). Ада
      едет из прихожей на кухню с постоянной скоростью 60 см/с и выбирает
      только руль — одно из K положений от «до упора влево» до «до упора
      вправо». Решение держится 0,1 с (два шага симуляции).
   2) Логи: поездки трёх операторов разного качества — аккуратного,
      торопливого и случайного — с наградой за каждый шаг. Новых поездок
      при обучении нет: все методы учатся на одних и тех же записях.
   3) Методы: обучение по демонстрациям (BC), наивное Q-обучение на логах
      (как DQN из урока 5.3, только без новых поездок), BCQ (выбор только
      среди действий, которые часто встречаются в данных), CQL (штраф за
      высокие Q у действий не из данных) и IQL (ценность — экспектиль Q по
      действиям из данных, политика — BC с весом exp(β·преимущество)).
      Сети одного размера, один пакет, один шаг Adam, одно число шагов.
   4) Проверка: поездки с одних и тех же стартов, жадное действие.
   Экспонента, логарифм, tanh, синус, косинус и арктангенс посчитаны сами:
   встроенные Math.* в разных браузерах расходятся в последнем бите, а
   обучение раздувает разницу. Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('../shared/drive-core.js') : root.Drive;
  const { rng } = D;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- 0. детерминированная математика (как в l52/engine.js) ---------- */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }
    const EXPC = [1]; for (let n = 1; n <= 14; n++) EXPC.push(EXPC[n - 1] / n);   // 1/n!
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = EXPC[14]; for (let n = 13; n >= 0; n--) sm = EXPC[n] + r * sm;   // схема Горнера
      return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
      let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
      f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
      u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];
      if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
      const sv = (m - 1) / (m + 1), s2 = sv * sv; let t = sv, sum = sv;
      for (let n = 3; n <= 41; n += 2) { t *= s2; sum += t / n; }
      return e * LN2_HI + (e * LN2_LO + 2 * sum);
    }
    function tanh(x) {
      const ax = x < 0 ? -x : x; let v;
      if (ax > 20) v = 1; else if (ax < 0.5) { const e = expm1Small(2 * ax); v = e / (e + 2); } else v = 1 - 2 / (exp(2 * ax) + 1);
      return x < 0 ? -v : v;
    }
    const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
    function sincos(x) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      return q === 0 ? [sn, cs] : q === 1 ? [cs, -sn] : q === 2 ? [-sn, -cs] : [-cs, sn];
    }
    const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
    function atan(z) {
      let sg = 1; if (z < 0) { z = -z; sg = -1; }
      let inv = false; if (z > 1) { z = 1 / z; inv = true; }
      let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
      const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
      const a = off + sm; return sg * (inv ? PIO2 - a : a);
    }
    function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
    return { exp, log, tanh, sincos, atan2 };
  })();
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }

  const CFG = {
    NS: 9,              // положений руля: от −2,2 до 2,2 рад/с с шагом 0,55 рад/с
    SPEEDS: [40, 80],   // скорость, см/с: медленно или быстро
    K: 18,              // всего действий: руль × скорость
    A_LAT: 56,          // предельное боковое ускорение, см/с²: руль до 1,4 рад/с на 40 см/с и до 0,7 рад/с на 80 см/с
    REPEAT: 4,          // шагов симуляции (по 0,05 с) на одно решение: 0,2 с
    MAX_STEPS: 100,     // решений в поездке: 20 с
    NOISE: 0.3,         // шум руля, рад/с: моторы исполняют команду неточно
    GAMMA: 0.97,
    R_M: 1, R_GOAL: 2, R_CRASH: -5, R_T: -0.5,   // награда: за метр продвижения, за кухню, за столкновение, за секунду в пути
    H: 24,              // нейронов в каждом из двух скрытых слоёв
    BATCH: 64, LR: 3e-3, STEPS: 4000,
    TAU_T: 0.02,        // скорость целевой сети: θ' ← τθ + (1 − τ)θ'
    CQL_ALPHA: 1,       // вес штрафа CQL
    BCQ_TH: 0.3,        // BCQ: действие разрешено, если π_BC(a|s) ≥ порог · max π_BC
    IQL_TAU: 0.7, IQL_BETA: 10, IQL_WMAX: 100,
    N_EVAL: 20, EVAL_SEED: 77,
    SEED: 1,
  };
  /** Действие a — пара «руль, скорость»: a = руль + NS · скорость. STEER — доли предельного руля, SPEED — см/с. */
  const STEER = [], SPEED = [];
  function setActions(ns, speeds) { STEER.length = 0; for (let k = 0; k < ns; k++) STEER.push(-1 + 2 * k / (ns - 1)); SPEED.length = 0; for (const v of speeds) SPEED.push(v); CFG.NS = ns; CFG.K = ns * speeds.length; }
  const steerOf = (a) => STEER[a % CFG.NS], speedOf = (a) => SPEED[Math.floor(a / CFG.NS)];
  /** Предельный руль на скорости v: боковое ускорение v·ω не больше A_LAT (на 40 см/с — 2,2 рад/с, как в уроках 1.1 и 5.2). */
  const wmaxAt = (v) => Math.min(D.WMAX, CFG.A_LAT / v);
  /** Ближайшее действие к желаемому рулю w (рад/с) на скорости с номером vi. */
  function bin(w, vi) { const u = w / wmaxAt(SPEED[vi || 0]); let b = 0; for (let k = 1; k < STEER.length; k++) if (Math.abs(STEER[k] - u) < Math.abs(STEER[b] - u)) b = k; return b + CFG.NS * (vi || 0); }
  setActions(CFG.NS, CFG.SPEEDS);

  /* ---------- 1. среда: геометрия и константы — из shared/drive-core.js, расчёт — свой ---------- */
  const OB = D.OBST, R2 = D.R * D.R, G2 = D.GOAL.r * D.GOAL.r, P = D.PATH;
  const PATHS = (() => { const out = [0]; for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1]; out.push(out[i - 1] + Math.sqrt(dx * dx + dy * dy)); } return out; })();
  const PATH_LEN = PATHS[PATHS.length - 1];
  function nearest(x, y) { let bi = 0, bd = Infinity; for (let i = 0; i < P.length; i++) { const dx = P[i][0] - x, dy = P[i][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } } return bi; }
  /** Сколько сантиметров Ада проехала к кухне по средней линии прохода. */
  const along = (s) => PATHS[nearest(s.x, s.y)];
  function collides(x, y) { for (const r of OB) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); if (dx * dx + dy * dy < R2) return true; } return false; }
  const atGoal = (q) => { const dx = q.x - D.GOAL.x, dy = q.y - D.GOAL.y; return dx * dx + dy * dy < G2; };
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function step(s, w, v) { const th = s.th + w * D.DT, sc = DM.sincos(th), d = (v == null ? D.V : v) * D.DT; return { x: s.x + sc[1] * d, y: s.y + sc[0] * d, th: wrapA(th) }; }
  function rayRect(ox, oy, dx, dy, r) {
    let t0 = 0, t1 = Infinity;
    for (const [o, d, lo, hi] of [[ox, dx, r[0], r[2]], [oy, dy, r[1], r[3]]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; }
      else { let a = (lo - o) / d, b = (hi - o) / d; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
    }
    return t0;
  }
  /** Наблюдение, как Drive.observe в режиме «цель»: 9 лучей дальномера, направление и расстояние до кухни. */
  function observe(s) {
    const out = new Float64Array(D.OBS);
    for (let i = 0; i < D.NRAY; i++) {
      const sc = DM.sincos(s.th - D.FOV + (2 * D.FOV) * i / (D.NRAY - 1));
      let best = D.RMAX; for (const r of OB) { const t = rayRect(s.x, s.y, sc[1], sc[0], r); if (t < best) best = t; }
      out[i] = best / D.RMAX;
    }
    const gx = D.GOAL.x - s.x, gy = D.GOAL.y - s.y, sc = DM.sincos(DM.atan2(gy, gx) - s.th);
    out[D.NRAY] = sc[1]; out[D.NRAY + 1] = sc[0]; out[D.NRAY + 2] = Math.sqrt(gx * gx + gy * gy) / 600; out[D.NRAY + 3] = 0;
    return out;
  }
  /** Одно решение: положение руля a (0…K−1) держится REPEAT шагов симуляции. */
  function envStep(s, a, p0, r, u) {
    const v = speedOf(a), w = (u == null ? steerOf(a) : u) * wmaxAt(v) + (r && CFG.NOISE ? randn(r) * CFG.NOISE : 0); if (p0 == null) p0 = along(s);
    let q = s, outcome = null;
    for (let k = 0; k < CFG.REPEAT; k++) {
      q = step(q, w, v);
      if (collides(q.x, q.y)) { outcome = 'crash'; break; }
      if (atGoal(q)) { outcome = 'goal'; break; }
    }
    const p1 = along(q);
    let rw = CFG.R_M * (p1 - p0) / 100 + CFG.R_T * CFG.REPEAT * D.DT;
    if (outcome === 'goal') rw += CFG.R_GOAL;
    if (outcome === 'crash') rw += CFG.R_CRASH;
    return { s: q, r: rw, outcome, p: p1 };
  }
  function startOf(r, spread) { spread = spread == null ? 1 : spread; return { x: D.START.x + randn(r) * 8 * spread, y: D.START.y + randn(r) * 8 * spread, th: D.START.th + randn(r) * 0.12 * spread }; }

  /* ---------- 2. операторы и логи ---------- */
  /** Преследование точки маршрута в look см впереди (pure pursuit, как учитель уроков 1.1–1.2), со сдвигом off см вбок. */
  function pursuit(s, look, off, gain) {
    const i = nearest(s.x, s.y), target = PATHS[i] + look; let j = i; while (j < P.length - 1 && PATHS[j] < target) j++;
    let px = P[j][0], py = P[j][1];
    if (off) { const k = Math.min(j + 1, P.length - 1), k0 = Math.max(j - 1, 0), tx = P[k][0] - P[k0][0], ty = P[k][1] - P[k0][1], n = Math.sqrt(tx * tx + ty * ty) || 1; px += -ty / n * off; py += tx / n * off; }
    const a = wrapA(DM.atan2(py - s.y, px - s.x) - s.th);
    return clamp(gain * a, -D.WMAX, D.WMAX);
  }
  /** Логи лаборатории 1 и наборы лаборатории 3. */
  const MIX = { careful: 20, hurried: 40, random: 40 };
  const SETS = { careful: { careful: 60 }, hurried: { hurried: 60 }, random: { random: 100 }, mix: MIX };
  const OPS = {
    careful: { name: 'аккуратный', look: 42, off: 0, sig: 3, vi: 0 },
    hurried: { name: 'торопливый', look: 42, off: 0, sig: 3, vi: 1 },
    random: { name: 'случайный', p: 0.5, sw: 0.15, hold: 0 },
  };
  /** Оператор на одну поездку: функция (состояние, шаг) → положение руля. r — случайности оператора. */
  function operator(kind, r) {
    if (kind === 'random') {   // случайный: часто жмёт что попало, в остальное время едет к кухне на случайной скорости
      const o = OPS.random; let vi = Math.floor(r() * SPEED.length), a = null;
      return (s) => {
        if (r() < o.sw) vi = Math.floor(r() * SPEED.length);
        if (a != null && r() < o.hold) return a;
        a = r() < o.p ? Math.floor(r() * CFG.K) : bin(pursuit(s, 42, 0, 2.4), vi);
        return a;
      };
    }
    const o = OPS[kind], off = o.off + randn(r) * o.sig;
    return (s) => bin(pursuit(s, o.look, off, o.gain || 2.4), o.vi);
  }
  /** Одна поездка: ctl(s, t) → положение руля. Возвращает траекторию, действия, награды и исход. */
  function rollout(ctl, start, keepObs, r) {
    let s = start, p = along(s); const traj = [s], acts = [], rews = [], obs = [];
    let outcome = 'timeout', ret = 0;
    for (let t = 0; t < CFG.MAX_STEPS; t++) {
      const x = observe(s), c = ctl(s, t, x), a = typeof c === 'number' ? c : c.a;
      const st = envStep(s, a, p, r, typeof c === 'number' ? null : c.u); p = st.p;
      if (keepObs) obs.push(x);
      acts.push(a); rews.push(st.r); ret += st.r; traj.push(st.s); s = st.s;
      if (st.outcome) { outcome = st.outcome; break; }
    }
    if (keepObs) obs.push(observe(s));
    return { traj, acts, rews, obs, outcome, ret, T: acts.length };
  }
  /** Логи: n поездок каждого оператора. Поездка k оператора зависит только от зерна, оператора и k. */
  function logs(mix, seed) {
    seed = seed == null ? CFG.SEED : seed;
    const trips = [];
    for (const kind of ['careful', 'hurried', 'random']) {
      const n = mix[kind] || 0, code = kind === 'careful' ? 1 : kind === 'hurried' ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const r = rng(seed * 100003 + code * 7919 + k * 104729 + 11);
        const ep = rollout(operator(kind, r), startOf(r), true, rng(seed * 7 + code * 1301 + k * 7919 + 3));
        ep.op = kind; trips.push(ep);
      }
    }
    return trips;
  }
  /** Переходы (s, a, r, s', конец) из поездок. Таймаут — не конец: дальше продолжается ценность. */
  function transitions(trips) {
    const S = [], A = [], R = [], S2 = [], DN = [], OPI = [];
    trips.forEach((ep, e) => {
      for (let t = 0; t < ep.T; t++) {
        S.push(ep.obs[t]); A.push(ep.acts[t]); R.push(ep.rews[t]); S2.push(ep.obs[t + 1]);
        DN.push(t === ep.T - 1 && ep.outcome !== 'timeout' ? 1 : 0); OPI.push(e);
      }
    });
    return { S, A: Int32Array.from(A), R: Float64Array.from(R), S2, DN: Uint8Array.from(DN), EP: Int32Array.from(OPI), N: A.length, trips };
  }

  /* ---------- 3. маленькие сети: два скрытых слоя, ReLU с утечкой 0,01, линейный выход, Adam ---------- */
  function net(sizes, seed, outScale) {
    const r = rng(seed), L = sizes.length - 1, W = [], B = [];
    for (let l = 0; l < L; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), sc = (l < L - 1 ? Math.sqrt(2) : (outScale == null ? 1 : outScale)) * Math.sqrt(1 / a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * sc;
      W.push(w); B.push(new Float64Array(b));
    }
    const z = (arr) => arr.map((x) => new Float64Array(x.length));
    return { sizes, L, W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0, p1: 1, p2: 1 };
  }
  const clone = (n) => ({ sizes: n.sizes, L: n.L, W: n.W.map((w) => w.slice()), B: n.B.map((b) => b.slice()), mW: n.mW.map((w) => w.slice()), vW: n.vW.map((w) => w.slice()), mB: n.mB.map((b) => b.slice()), vB: n.vB.map((b) => b.slice()), t: n.t, p1: n.p1, p2: n.p2 });
  function ws(n) { return { a: n.sizes.map((k) => new Float64Array(k)), d: n.sizes.map((k) => new Float64Array(k)) }; }
  function grads(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  function zero(g) { for (const w of g.W) w.fill(0); for (const b of g.B) b.fill(0); }
  /** Скрытые слои: вход x, результат — в c.a[1..L−1]. */
  function hidden(n, c, x) {
    let ai = x;
    for (let l = 0; l < n.L - 1; l++) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], b = n.B[l], ao = c.a[l + 1];
      for (let o = 0; o < nO; o++) ao[o] = b[o];
      for (let i = 0; i < nI; i++) { const v = ai[i]; if (v === 0) continue; const off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
      for (let o = 0; o < nO; o++) if (ao[o] < 0) ao[o] *= 0.01;
      ai = ao;
    }
    c.x = x;
  }
  /** Прямой проход целиком: все выходы — в c.a[L]. */
  function fwd(n, c, x) {
    hidden(n, c, x);
    const l = n.L - 1, nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], ao = c.a[l + 1];
    for (let o = 0; o < nO; o++) ao[o] = n.B[l][o];
    for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
    return ao;
  }
  /** Прямой проход только до одного выхода k (когда нужно лишь Q(s, a) действия из логов). */
  function fwdOne(n, c, x, k) {
    hidden(n, c, x);
    const l = n.L - 1, nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l];
    let s = n.B[l][k]; for (let i = 0; i < nI; i++) s += ai[i] * w[i * nO + k];
    return s;
  }
  /** Обратный проход через скрытые слои: dTop — градиент по выходу последнего скрытого слоя (в c.d[L−1]). */
  function bwdHidden(n, c, g) {
    for (let l = n.L - 2; l >= 0; l--) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = l ? c.a[l] : c.x, ao = c.a[l + 1], dO = c.d[l + 1], gw = g.W[l], gb = g.B[l];
      for (let o = 0; o < nO; o++) if (ao[o] < 0) dO[o] *= 0.01;
      for (let o = 0; o < nO; o++) gb[o] += dO[o];
      if (l === 0) { for (let i = 0; i < nI; i++) { const v = ai[i]; if (v === 0) continue; const off = i * nO; for (let o = 0; o < nO; o++) gw[off + o] += v * dO[o]; } break; }
      const dI = c.d[l];
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; let sm = 0; for (let o = 0; o < nO; o++) { gw[off + o] += v * dO[o]; sm += w[off + o] * dO[o]; } dI[i] = sm; }
    }
  }
  /** Обратный проход после fwd: gOut — градиент по всем выходам; градиенты копятся в g. */
  function bwd(n, c, gOut, g) {
    const l = n.L - 1, nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], gw = g.W[l], gb = g.B[l], dI = c.d[l];
    for (let o = 0; o < nO; o++) gb[o] += gOut[o];
    for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; let sm = 0; for (let o = 0; o < nO; o++) { gw[off + o] += v * gOut[o]; sm += w[off + o] * gOut[o]; } dI[i] = sm; }
    bwdHidden(n, c, g);
  }
  /** Обратный проход после fwd или fwdOne, когда ненулевой градиент только у выхода k. */
  function bwdOne(n, c, k, gk, g) {
    const l = n.L - 1, nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], gw = g.W[l], dI = c.d[l];
    g.B[l][k] += gk;
    for (let i = 0; i < nI; i++) { gw[i * nO + k] += ai[i] * gk; dI[i] = w[i * nO + k] * gk; }
    bwdHidden(n, c, g);
  }
  function adam(n, g, lr, scale) {
    n.t++; const b1 = 0.9, b2 = 0.999; n.p1 *= b1; n.p2 *= b2; const c1 = 1 - n.p1, c2 = 1 - n.p2;
    for (let l = 0; l < n.L; l++) for (let h = 0; h < 2; h++) {
      const Pp = h ? n.B[l] : n.W[l], G = h ? g.B[l] : g.W[l], M = h ? n.mB[l] : n.mW[l], V = h ? n.vB[l] : n.vW[l];
      for (let i = 0; i < Pp.length; i++) { const gi = G[i] * scale; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; Pp[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }
  /** Целевая сеть медленно догоняет обучаемую: θ' ← τθ + (1 − τ)θ'. */
  function soft(tg, n, tau) { for (let l = 0; l < n.L; l++) { const a = tg.W[l], b = n.W[l]; for (let i = 0; i < a.length; i++) a[i] += tau * (b[i] - a[i]); const c = tg.B[l], d = n.B[l]; for (let i = 0; i < c.length; i++) c[i] += tau * (d[i] - c[i]); } }
  function softmax(z, out) { let m = -Infinity; for (let i = 0; i < z.length; i++) if (z[i] > m) m = z[i]; let s = 0; for (let i = 0; i < z.length; i++) { out[i] = DM.exp(z[i] - m); s += out[i]; } for (let i = 0; i < z.length; i++) out[i] /= s; return out; }
  function lse(z) { let m = -Infinity; for (let i = 0; i < z.length; i++) if (z[i] > m) m = z[i]; let s = 0; for (let i = 0; i < z.length; i++) s += DM.exp(z[i] - m); return m + DM.log(s); }
  const argmax = (z) => { let b = 0; for (let i = 1; i < z.length; i++) if (z[i] > z[b]) b = i; return b; };

  /* ---------- 4. методы ---------- */
  const METHODS = ['bc', 'naive', 'cql', 'iql', 'bcq'];
  /** Модель метода: сети одного размера, их рабочая память. */
  function model(kind, o) {
    const K = CFG.K, sz = [D.OBS, o.H, o.H, K], sd = o.seed * 1000 + 17, M = { kind, o, p: new Float64Array(K), gOut: new Float64Array(K) };
    const mk = (name, sizes, s0) => { const n = net(sizes, s0, 0.1); M[name] = n; M[name + 'W'] = ws(n); M[name + 'G'] = grads(n); };
    if (kind === 'bc' || kind === 'bcq' || kind === 'iql') mk('pi', sz, sd + 1);
    if (kind !== 'bc') { mk('q', sz, sd + 2); M.tq = clone(M.q); M.tqW = ws(M.q); }
    if (kind === 'iql') { mk('v', [D.OBS, o.H, o.H, 1], sd + 3); M.qa = new Float64Array(o.BATCH); M.va = new Float64Array(o.BATCH); }
    return M;
  }
  /** BCQ: разрешены действия, у которых вероятность по BC не меньше порога от самого вероятного. */
  function bcqMask(M, x) { const pr = softmax(fwd(M.pi, M.piW, x), M.p); let mx = 0; for (let k = 0; k < pr.length; k++) if (pr[k] > mx) mx = pr[k]; return Array.from(pr, (p) => p >= M.o.BCQ_TH * mx); }
  /** Действие модели в наблюдении x: у BC и IQL — самое вероятное из 18, у методов с Q-функцией — с наибольшим Q
   *  (у BCQ — среди разрешённых). */
  function act(M, x) {
    if (M.kind === 'bc' || M.kind === 'iql') return argmax(fwd(M.pi, M.piW, x));
    const q = fwd(M.q, M.qW, x);
    if (M.kind === 'bcq') { const qq = Array.from(q), ok = bcqMask(M, x); let b = -1; for (let i = 0; i < qq.length; i++) if (ok[i] && (b < 0 || qq[i] > qq[b])) b = i; return b; }
    return argmax(q);
  }
  const actIndex = act;
  function qOf(M, x) { return M.q ? Array.from(fwd(M.q, M.qW, x)) : null; }
  function vOf(M, x) { return M.v ? fwd(M.v, M.vW, x)[0] : null; }
  function piOf(M, x) { return M.pi ? Array.from(softmax(fwd(M.pi, M.piW, x), M.p)) : null; }

  /** Один шаг обучения на пакете idx (номера переходов). Все методы делают ровно один такой шаг на итерацию. */
  function update(M, T, idx) {
    const o = M.o, K = CFG.K, g = o.GAMMA, n = idx.length, gOut = M.gOut, pr = M.p;
    if (M.kind === 'bc' || M.kind === 'bcq') {   // обучение по демонстрациям: перекрёстная энтропия на действиях из логов
      zero(M.piG);
      for (let m = 0; m < n; m++) { const j = idx[m], a = T.A[j]; softmax(fwd(M.pi, M.piW, T.S[j]), pr); for (let k = 0; k < K; k++) gOut[k] = pr[k] - (k === a ? 1 : 0); bwd(M.pi, M.piW, gOut, M.piG); }
      adam(M.pi, M.piG, o.LR, 1 / n);
    }
    if (M.kind === 'naive' || M.kind === 'cql' || M.kind === 'bcq') {
      zero(M.qG);
      for (let m = 0; m < n; m++) {
        const j = idx[m], a = T.A[j];
        let y = T.R[j];
        if (!T.DN[j]) {   // цель: r + γ · Q_цел(s', лучшее действие); у BCQ — лучшее среди разрешённых
          let b = 0;
          if (M.kind === 'bcq') { const ok = bcqMask(M, T.S2[j]), qt = fwd(M.tq, M.tqW, T.S2[j]); b = -1; for (let k = 0; k < K; k++) if (ok[k] && (b < 0 || qt[k] > qt[b])) b = k; y += g * qt[b]; }
          else { const qt = fwd(M.tq, M.tqW, T.S2[j]); for (let k = 1; k < K; k++) if (qt[k] > qt[b]) b = k; y += g * qt[b]; }
        }
        if (M.kind === 'cql') {   // штраф CQL: α · (log Σ_a' exp Q(s, a') − Q(s, a из логов))
          const q = fwd(M.q, M.qW, T.S[j]); softmax(q, pr);
          for (let k = 0; k < K; k++) gOut[k] = o.CQL_ALPHA * (pr[k] - (k === a ? 1 : 0));
          gOut[a] += q[a] - y; bwd(M.q, M.qW, gOut, M.qG);
        } else { const qa = fwdOne(M.q, M.qW, T.S[j], a); bwdOne(M.q, M.qW, a, qa - y, M.qG); }
      }
      adam(M.q, M.qG, o.LR, 1 / n); soft(M.tq, M.q, o.TAU_T);
    }
    if (M.kind === 'iql') {
      const qa = M.qa, va = M.va, g1 = gOut;
      // ценность V(s): экспектиль τ от Q_цел(s, a) по действиям из логов — ни одного действия вне логов
      zero(M.vG);
      for (let m = 0; m < n; m++) {
        const j = idx[m]; qa[m] = fwdOne(M.tq, M.tqW, T.S[j], T.A[j]);
        const v = fwd(M.v, M.vW, T.S[j])[0], u = qa[m] - v, w = u < 0 ? 1 - o.IQL_TAU : o.IQL_TAU; va[m] = v;
        bwdOne(M.v, M.vW, 0, -2 * w * u, M.vG);
      }
      adam(M.v, M.vG, o.LR, 1 / n);
      // Q(s, a): цель r + γ V(s')
      zero(M.qG);
      for (let m = 0; m < n; m++) {
        const j = idx[m], a = T.A[j], y = T.R[j] + (T.DN[j] ? 0 : g * fwd(M.v, M.vW, T.S2[j])[0]);
        const q = fwdOne(M.q, M.qW, T.S[j], a); bwdOne(M.q, M.qW, a, q - y, M.qG);
      }
      adam(M.q, M.qG, o.LR, 1 / n); soft(M.tq, M.q, o.TAU_T);
      // политика: обучение по демонстрациям с весом exp(β · (Q − V)) — преимущество из урока 5.1; вес не больше IQL_WMAX
      zero(M.piG);
      for (let m = 0; m < n; m++) {
        const j = idx[m], a = T.A[j], w = Math.min(o.IQL_WMAX, DM.exp(o.IQL_BETA * (qa[m] - va[m])));
        softmax(fwd(M.pi, M.piW, T.S[j]), pr);
        for (let k = 0; k < K; k++) g1[k] = w * (pr[k] - (k === a ? 1 : 0)); bwd(M.pi, M.piW, g1, M.piG);
      }
      adam(M.pi, M.piG, o.LR, 1 / n);
    }
  }

  /* ---------- 5. проверка ---------- */
  function evalStarts(n, seed) { const r = rng(seed == null ? CFG.EVAL_SEED : seed), out = []; for (let k = 0; k < n; k++) out.push(startOf(r, 1)); return out; }
  /** Поездки модели с одних и тех же стартов и с одним и тем же шумом руля (общие случайные числа).
   *  Кроме исходов — что обещала Q-функция в начале поездки и что вышло на деле (отдача с дисконтом). */
  function evaluate(M, n, opts) {
    opts = opts || {}; const sd = opts.seed == null ? CFG.EVAL_SEED : opts.seed, starts = evalStarts(n || CFG.N_EVAL, sd), res = [];
    for (let k = 0; k < starts.length; k++) {
      const st = starts[k], ep = rollout((s, t, x) => act(M, x), st, false, rng(sd * 7919 + k * 104729 + 1));
      let G = 0; for (let t = ep.T - 1; t >= 0; t--) G = ep.rews[t] + CFG.GAMMA * G;
      const x0 = observe(st), q0 = qOf(M, x0);
      res.push({ outcome: ep.outcome, T: ep.T, ret: ep.ret, G0: G, Q0: q0 ? q0[actIndex(M, x0)] : null, traj: ep.traj, acts: ep.acts });
    }
    return summarize(res);
  }
  function summarize(res) {
    const ok = res.filter((e) => e.outcome === 'goal'), n = res.length;
    return { eps: res, n, ok: ok.length, crash: res.filter((e) => e.outcome === 'crash').length,
      tGoal: ok.length ? ok.reduce((a, e) => a + e.T, 0) / ok.length * CFG.REPEAT * D.DT : null,
      ret: res.reduce((a, e) => a + e.ret, 0) / n, G0: res.reduce((a, e) => a + e.G0, 0) / n,
      Q0: res[0].Q0 == null ? null : res.reduce((a, e) => a + e.Q0, 0) / n,
      fast: (() => { let f = 0, m = 0; for (const e of res) for (const a of e.acts) { m++; if (Math.floor(a / CFG.NS) > 0) f++; } return m ? f / m : 0; })() };
  }
  /** Сводка по логам: для каждого оператора — сколько поездок, доехали, среднее время и средняя отдача. */
  function opStats(trips) {
    const out = {};
    for (const kind of ['careful', 'hurried', 'random']) {
      const tr = trips.filter((e) => e.op === kind); if (!tr.length) continue;
      const sm = summarize(tr.map((e) => ({ outcome: e.outcome, T: e.T, ret: e.ret, G0: 0, Q0: null, acts: e.acts })));
      out[kind] = { n: tr.length, ok: sm.ok, tGoal: sm.tGoal, ret: sm.ret, fast: sm.fast };
    }
    return out;
  }

  /* ---------- 5б. щуп: одно состояние, Q по всем 18 действиям, что в логах и что на деле ---------- */
  /** Переходы логов рядом с состоянием s: ближе R см и с курсом в пределах TH рад. Возвращает число каждого действия. */
  function localCounts(trips, s, R, TH) {
    R = R || 25; TH = TH || 0.35; const cnt = new Array(CFG.K).fill(0);
    for (const ep of trips) for (let t = 0; t < ep.T; t++) {
      const q = ep.traj[t], dx = q.x - s.x, dy = q.y - s.y; let d = Math.abs(q.th - s.th); if (d > Math.PI) d = 2 * Math.PI - d;
      if (dx * dx + dy * dy < R * R && d < TH) cnt[ep.acts[t]]++;
    }
    return cnt;
  }
  /** Что выходит на деле: сделать действие a из s, а дальше ехать, как аккуратный оператор. Отдача с дисконтом, среднее по reps поездкам. */
  function realValues(s, reps) {
    reps = reps || 4; const out = new Array(CFG.K).fill(0), o = OPS.careful;
    for (let a = 0; a < CFG.K; a++) for (let k = 0; k < reps; k++) {
      const ep = rollout((q, t) => (t === 0 ? a : bin(pursuit(q, o.look, 0, 2.4), o.vi)), s, false, rng(9001 + k * 31 + a * 7));
      let G = 0; for (let t = ep.T - 1; t >= 0; t--) G = ep.rews[t] + CFG.GAMMA * G;
      out[a] += G / reps;
    }
    return out;
  }

  /* ---------- 6. обучение целиком ---------- */
  /** Генератор: обучает метод kind на переходах T, отдаёт прогресс каждые every шагов, в конце — модель. */
  function* train(kind, T, o) {
    o = Object.assign({}, CFG, o || {});
    const M = model(kind, o), r = rng(o.seed * 7717 + 5), idx = new Int32Array(o.BATCH);
    for (let it = 0; it < o.STEPS; it++) {
      for (let b = 0; b < o.BATCH; b++) idx[b] = Math.floor(r() * T.N);
      update(M, T, idx);
      if ((it + 1) % (o.every || 50) === 0) yield { it: it + 1, of: o.STEPS };
    }
    return M;
  }
  function run(kind, T, o) { const g = train(kind, T, o); let r; while (!(r = g.next()).done) { /* синхронно */ } return r.value; }

  const API = { CFG, DM, STEER, SPEED, setActions, steerOf, speedOf, wmaxAt, OPS, MIX, SETS, bin, localCounts, realValues, PATHS, PATH_LEN, along, nearest, collides, step, observe, envStep, startOf, pursuit, operator, rollout, logs, transitions, opStats,
    net, clone, fwd, adam, softmax, lse, argmax, METHODS, model, act, actIndex, qOf, vOf, piOf, bcqMask, update, evalStarts, evaluate, summarize, train, run, randn };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L56 = API;
})(typeof window !== 'undefined' ? window : globalThis);
