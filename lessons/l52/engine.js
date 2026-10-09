/* =====================================================================
   l52/engine.js — движок урока 5.2 «Policy gradient и PPO». Без DOM:
   работает в браузере (window.L52, поверх window.Drive из
   shared/drive-core.js) и в Node (require).
   1) Среда: дом Ады из уроков 1.1–1.2 (вид сверху, 6 × 4 м), Ада едет
      из прихожей на кухню с постоянной скоростью 60 см/с, политика
      выбирает только руль. Наблюдение — 9 лучей дальномера, направление
      и расстояние до кухни (Drive.observe). Руль держится 0,1 с (два шага
      симуляции). Награда: +1 за каждый метр, на который Ада продвинулась
      к кухне по коридору, +2 за кухню, −1 за столкновение. Эпизод — до 20 с.
   2) Политика — гауссиана: маленькая сеть даёт среднее руля μ(s) ∈ [−1, 1]
      (в долях от предельного руля), разброс σ — общий обучаемый параметр.
      Ценность V(s) — отдельная сеть того же размера.
   3) Обучение: сбор эпизодов текущей политикой → преимущества GAE →
      несколько эпох по этим данным с целевой функцией PPO (обрезка
      отношения вероятностей) или без обрезки → данные выбрасываются.
   Все случайности — с зерном, результаты детерминированы.
   ===================================================================== */
'use strict';
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('../shared/drive-core.js') : root.Drive;
  const { rng, clamp } = D;

  /* ---------- 0. детерминированная математика ----------
     Math.exp, Math.log, Math.sin и другие в разных браузерах могут отличаться в последнем знаке,
     а обучение с подкреплением раздувает такую разницу до других чисел в лабораториях. Здесь они
     собраны из сложений, умножений и делений (по IEEE 754 одинаковых везде) и Math.sqrt.
     Отличие от Math.* — не больше 1e-15. */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }   // 2^k, k от −1022 до 1023
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }  // e^x − 1 при |x| ≤ 1
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = 1, t = 1; for (let n = 1; n <= 14; n++) { t = t * r / n; sm += t; }
      return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
      let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
      f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
      u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];          // мантисса в [1, 2)
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
    /** [sin x, cos x]: приведение к |r| ≤ π/4 и ряды Тейлора. */
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
    return { exp, log, tanh, sincos, atan2, pow2 };
  })();
  /** Нормальное случайное число (Бокс — Мюллер) на детерминированной математике. */
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }

  const CFG = {
    REPEAT: 2,          // шагов симуляции (по 0,05 с) на одно действие политики
    MAX_STEPS: 200,     // действий в эпизоде: 20 с
    N_EP: 8,            // эпизодов на одно обновление
    H: 24,              // нейронов в каждом из двух скрытых слоёв
    GAMMA: 0.99, LAMBDA: 0.95,
    EPOCHS: 5, MB: 128, LR: 3e-3, LR_V: 3e-3,
    LOGSTD0: -0.5,      // начальный разброс руля σ = e^−0,5 ≈ 0,61
    CLIP: 0.2,
    ITERS: 50,
    R_GOAL: 2, R_CRASH: -1, R_M: 1,   // награды: кухня, столкновение, за метр продвижения
    SEED: 5,
  };

  /* ---------- 1. среда: геометрия и константы — из shared/drive-core.js, расчёт — свой ---------- */
  const OB = D.OBST, R2 = D.R * D.R, G2 = D.GOAL.r * D.GOAL.r, P = D.PATH;
  const PATHS = (() => { const out = [0]; for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1]; out.push(out[i - 1] + Math.sqrt(dx * dx + dy * dy)); } return out; })();
  const PATH_LEN = PATHS[PATHS.length - 1];
  /** Сколько сантиметров Ада проехала к кухне по средней линии коридора (по ближайшей точке линии). */
  function along(s) { let bi = 0, bd = Infinity; for (let i = 0; i < P.length; i++) { const dx = P[i][0] - s.x, dy = P[i][1] - s.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } } return PATHS[bi]; }
  function collides(x, y) { for (const r of OB) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); if (dx * dx + dy * dy < R2) return true; } return false; }
  const atGoal = (q) => { const dx = q.x - D.GOAL.x, dy = q.y - D.GOAL.y; return dx * dx + dy * dy < G2; };
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /** Шаг кинематики, как Drive.step: поворот, потом сдвиг на V·DT. */
  function step(s, w) { const th = s.th + w * D.DT, sc = DM.sincos(th); return { x: s.x + sc[1] * D.V * D.DT, y: s.y + sc[0] * D.V * D.DT, th: wrapA(th) }; }
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
  /** Один шаг среды: руль a ∈ [−1, 1] держится REPEAT шагов симуляции. p0 — продвижение до шага. */
  function envStep(s, a, o, p0) {
    o = o || CFG;
    const w = clamp(a, -1, 1) * D.WMAX; if (p0 == null) p0 = along(s);
    let q = s, outcome = null;
    for (let k = 0; k < o.REPEAT; k++) {
      q = step(q, w);
      if (collides(q.x, q.y)) { outcome = 'crash'; break; }
      if (atGoal(q)) { outcome = 'goal'; break; }
    }
    const p1 = along(q);
    let r = o.R_M * (p1 - p0) / 100;
    if (outcome === 'goal') r += o.R_GOAL;
    if (outcome === 'crash') r += o.R_CRASH;
    return { s: q, r, outcome, p: p1 };
  }

  /* ---------- 2. сети: вход → H → H → 1, tanh в скрытых слоях ---------- */
  function net(nIn, H, seed, outScale) {
    const r = rng(seed), sizes = [nIn, H, H, 1], W = [], B = [];
    for (let l = 0; l < 3; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), sc = (l === 2 ? outScale : 1) / Math.sqrt(a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * sc;
      W.push(w); B.push(new Float64Array(b));
    }
    return withBuf({ sizes, W, B });
  }
  /** Буферы прямого и обратного прохода (чтобы не выделять память на каждом примере). */
  function withBuf(n) { const H = n.sizes[1]; n.a = [null, new Float64Array(H), new Float64Array(H)]; n.d = [null, new Float64Array(H), new Float64Array(H)]; return n; }
  /** Прямой проход; входы слоёв остаются в n.a (для обратного прохода). Выход — линейный. */
  function fwd(n, x) {
    const s0 = n.sizes, W = n.W, B = n.B, A = n.a;
    A[0] = x;
    for (let l = 0; l < 2; l++) {
      const nI = s0[l], nO = s0[l + 1], w = W[l], b = B[l], a = A[l], z = A[l + 1];
      for (let o = 0; o < nO; o++) z[o] = b[o];
      for (let i = 0; i < nI; i++) { const ai = a[i]; if (ai === 0) continue; const row = i * nO; for (let o = 0; o < nO; o++) z[o] += ai * w[row + o]; }
      for (let o = 0; o < nO; o++) z[o] = DM.tanh(z[o]);
    }
    const a2 = A[2], w2 = W[2]; let out = B[2][0];
    for (let i = 0; i < a2.length; i++) out += a2[i] * w2[i];
    return out;
  }
  function zeroGrad(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  /** Обратный проход после fwd(n, x): dOut — производная по линейному выходу; градиенты копятся в g. */
  function bwd(n, dOut, g) {
    const s0 = n.sizes, W = n.W, A = n.a, Dd = n.d;
    // выходной слой
    { const a = A[2], nI = s0[2], d1 = Dd[2], w = W[2]; g.B[2][0] += dOut; for (let i = 0; i < nI; i++) { g.W[2][i] += a[i] * dOut; d1[i] = w[i] * dOut * (1 - a[i] * a[i]); } }
    // второй скрытый слой: вход A[1], выход A[2]
    { const nI = s0[1], nO = s0[2], a = A[1], w = W[1], gW = g.W[1], gB = g.B[1], dl = Dd[2], dn = Dd[1];
      for (let o = 0; o < nO; o++) gB[o] += dl[o];
      for (let i = 0; i < nI; i++) { const ai = a[i], row = i * nO; let s = 0; for (let o = 0; o < nO; o++) { gW[row + o] += ai * dl[o]; s += w[row + o] * dl[o]; } dn[i] = s * (1 - ai * ai); } }
    // первый скрытый слой: вход x
    { const nI = s0[0], nO = s0[1], a = A[0], gW = g.W[0], gB = g.B[0], dl = Dd[1];
      for (let o = 0; o < nO; o++) gB[o] += dl[o];
      for (let i = 0; i < nI; i++) { const ai = a[i]; if (ai === 0) continue; const row = i * nO; for (let o = 0; o < nO; o++) gW[row + o] += ai * dl[o]; } }
  }
  function adamInit(params) { return { t: 0, p1: 1, p2: 1, m: params.map((p) => new Float64Array(p.length)), v: params.map((p) => new Float64Array(p.length)) }; }
  /** Шаг Adam на подъём или спуск: params и grads — массивы Float64Array; sign = −1 — спуск по градиенту. */
  function adamStep(st, params, grads, lr, sign) {
    const b1 = 0.9, b2 = 0.999; st.t++; st.p1 *= b1; st.p2 *= b2; const c1 = 1 - st.p1, c2 = 1 - st.p2;
    for (let j = 0; j < params.length; j++) {
      const P = params[j], G = grads[j], M = st.m[j], V = st.v[j];
      for (let i = 0; i < P.length; i++) { const gg = G[i]; M[i] = b1 * M[i] + (1 - b1) * gg; V[i] = b2 * V[i] + (1 - b2) * gg * gg; P[i] += sign * lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }
  const paramsOf = (n) => n.W.concat(n.B);
  const gradsOf = (g) => g.W.concat(g.B);

  /* ---------- 3. агент: политика-гауссиана и ценность ---------- */
  function agent(seed, o) {
    o = Object.assign({}, CFG, o || {});
    const pi = net(D.OBS, o.H, seed * 7 + 1, 0.01), v = net(D.OBS, o.H, seed * 7 + 2, 1), logstd = new Float64Array([o.LOGSTD0]);
    return { pi, v, logstd, optPi: adamInit(paramsOf(pi).concat([logstd])), optV: adamInit(paramsOf(v)) };
  }
  function cloneAgent(A) {
    const cn = (n) => withBuf({ sizes: n.sizes.slice(), W: n.W.map((w) => w.slice()), B: n.B.map((b) => b.slice()) });
    const co = (s) => ({ t: s.t, p1: s.p1, p2: s.p2, m: s.m.map((x) => x.slice()), v: s.v.map((x) => x.slice()) });
    return { pi: cn(A.pi), v: cn(A.v), logstd: A.logstd.slice(), optPi: co(A.optPi), optV: co(A.optV) };
  }
  const LOG2PI = 1.8378770664093453;   // ln 2π
  /** Среднее руля μ(s) ∈ [−1, 1]. */
  function mean(A, obs) { return DM.tanh(fwd(A.pi, obs)); }
  function logp(a, mu, ls) { const z = (a - mu) / DM.exp(ls); return -0.5 * z * z - ls - 0.5 * LOG2PI; }
  /** Детерминированная политика (среднее) — для проверочных поездок. */
  function ctlOf(A) { return (s) => clamp(mean(A, observe(s)), -1, 1) * D.WMAX; }

  /* ---------- 4. сбор эпизодов ---------- */
  /** Старт у прихожей: разброс 8 см и 0,12 рад, как Drive.randStart. */
  function startOf(r) { return { x: D.START.x + randn(r) * 8, y: D.START.y + randn(r) * 8, th: D.START.th + randn(r) * 0.12 }; }
  /** n эпизодов текущей политикой. Эпизод k зависит только от зерна и k. */
  function collect(A, n, seed, o) {
    o = Object.assign({}, CFG, o || {});
    const S = [], Aa = [], LP = [], R = [], V = [], END = [], eps = [];
    const sd = DM.exp(A.logstd[0]);
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 1009 + k * 7919 + 13);
      let s = startOf(r), p = along(s); const traj = [s];
      let outcome = 'timeout', ret = 0;
      for (let t = 0; t < o.MAX_STEPS; t++) {
        const obs = observe(s), mu = mean(A, obs), a = mu + sd * randn(r);
        const st = envStep(s, a, o, p); p = st.p;
        S.push(obs); Aa.push(a); LP.push(logp(a, mu, A.logstd[0])); R.push(st.r); V.push(fwd(A.v, obs)); ret += st.r;
        traj.push(st.s); s = st.s;
        if (st.outcome) { outcome = st.outcome; END.push(1); break; }
        END.push(t === o.MAX_STEPS - 1 ? 2 : 0);   // 1 — конец эпизода (кухня, столкновение), 2 — время вышло
      }
      // время вышло: ценность последнего состояния продолжает отдачу (как у Rudin et al.)
      eps.push({ traj, outcome, ret, last: outcome === 'timeout' ? fwd(A.v, observe(s)) : 0 });
    }
    return { S, A: Aa, LP, R, V, END, eps };
  }
  /** Преимущества GAE(γ, λ) и цели для ценности. */
  function gae(b, o) {
    o = Object.assign({}, CFG, o || {});
    const N = b.R.length, adv = new Float64Array(N), ret = new Float64Array(N);
    let e = b.eps.length - 1, run = 0, nextV = 0;
    for (let i = N - 1; i >= 0; i--) {
      if (b.END[i]) { run = 0; nextV = b.END[i] === 2 ? b.eps[e].last : 0; e--; }
      const delta = b.R[i] + o.GAMMA * nextV - b.V[i];
      run = delta + o.GAMMA * o.LAMBDA * run; adv[i] = run; ret[i] = run + b.V[i]; nextV = b.V[i];
    }
    return { adv, ret };
  }

  /* ---------- 5. обновление: PPO с обрезкой или без неё ---------- */
  /** K эпох мини-пачками по одним и тем же данным. o.clip — ε или 0 (без обрезки).
   *  Возвращает отношения вероятностей r после обновления и статистику. */
  function update(A, b, o) {
    o = Object.assign({}, CFG, o || {});
    const { adv, ret } = gae(b, o), N = b.R.length;
    let m = 0, s2 = 0; for (let i = 0; i < N; i++) m += adv[i]; m /= N; for (let i = 0; i < N; i++) { const d = adv[i] - m; s2 += d * d; }
    const sd = Math.sqrt(s2 / N) + 1e-8, An = Float64Array.from(adv, (x) => (x - m) / sd);
    const r = rng(o.seed * 31 + 7), idx = Array.from({ length: N }, (_, i) => i), eps = o.clip;
    const accP = [], accV = [];
    for (let ep = 0; ep < o.EPOCHS; ep++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      for (let k0 = 0; k0 < N; k0 += o.MB) {
        const mb = idx.slice(k0, k0 + o.MB), gP = zeroGrad(A.pi), gV = zeroGrad(A.v), gLs = new Float64Array(1);
        const ls = A.logstd[0], vr = DM.exp(2 * ls);
        for (const i of mb) {
          const mu = DM.tanh(fwd(A.pi, b.S[i])), lp = logp(b.A[i], mu, ls), ratio = DM.exp(lp - b.LP[i]), a = An[i];
          // производная целевой функции по log π: r·A, если пример не обрезан, иначе 0
          let g = ratio * a;
          if (eps > 0 && ((a > 0 && ratio > 1 + eps) || (a < 0 && ratio < 1 - eps))) g = 0;
          if (g) {
            const da = b.A[i] - mu, dmu = g * da / vr, dls = g * (da * da / vr - 1);
            bwd(A.pi, dmu * (1 - mu * mu) / mb.length, gP); gLs[0] += dls / mb.length;
          }
          const v = fwd(A.v, b.S[i]);
          bwd(A.v, 2 * (v - ret[i]) / mb.length, gV);
        }
        if (o.ent) gLs[0] += o.ent;   // бонус за разброс: энтропия гауссианы растёт с log σ
        adamStep(A.optPi, paramsOf(A.pi).concat([A.logstd]), gradsOf(gP).concat([gLs]), o.LR, +1);
        adamStep(A.optV, paramsOf(A.v), gradsOf(gV), o.LR_V, -1);
        A.logstd[0] = clamp(A.logstd[0], -3, 1.5);
      }
    }
    // после обновления: отношения вероятностей и расхождение с прежней политикой
    // (оценка KL(старая ‖ новая) по пачке: среднее (r − 1) − ln r, всегда ≥ 0)
    const ratios = new Float64Array(N); let kl = 0, out = 0;
    for (let i = 0; i < N; i++) { const lp = logp(b.A[i], mean(A, b.S[i]), A.logstd[0]), q = DM.exp(lp - b.LP[i]); ratios[i] = q; kl += (q - 1) - (lp - b.LP[i]); if (Math.abs(q - 1) > (eps || 0.2)) out++; }
    return { ratios, kl: kl / N, outFrac: out / N, N };
  }

  /* ---------- 6. обучение целиком ---------- */
  /** Генератор обучения: отдаёт итог каждой итерации; в конце — { A, hist }.
   *  o: { clip, LR, EPOCHS, LAMBDA, seed, iters, keep } — keep: сохранять траектории каждой итерации.
   *  Пачка итерации it собирается с зерном, которое зависит только от seed и it: разные варианты
   *  обучения видят одни и те же старты и один и тот же шум (общие случайные числа). */
  function* train(o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED, iters: CFG.ITERS, clip: CFG.CLIP }, o || {});
    const A = agent(o.seed, o), hist = [];
    for (let it = 0; it < o.iters; it++) {
      const b = collect(A, o.N_EP, o.seed * 100003 + it, o);
      const ok = b.eps.filter((e) => e.outcome === 'goal').length, crash = b.eps.filter((e) => e.outcome === 'crash').length;
      const ret = b.eps.reduce((s, e) => s + e.ret, 0) / b.eps.length;
      const u = update(A, b, Object.assign({}, o, { seed: o.seed * 1000 + it }));
      const h = { it, ok, crash, n: b.eps.length, ret, kl: u.kl, outFrac: u.outFrac, sigma: DM.exp(A.logstd[0]), steps: b.R.length };
      if (o.keep) h.eps = b.eps.map((e) => ({ outcome: e.outcome, xy: thin(e.traj) }));
      hist.push(h);
      yield h;
    }
    return { A, hist };
  }
  function thin(traj) { const out = []; for (let i = 0; i < traj.length; i += 2) out.push(Math.round(traj[i].x), Math.round(traj[i].y)); const l = traj[traj.length - 1]; out.push(Math.round(l.x), Math.round(l.y)); return Int16Array.from(out); }
  function run(o) { const g = train(o); let r; while (!(r = g.next()).done) { /* синхронно */ } return r.value; }
  /** Сводка обучения: доля поездок до кухни за последние 10 обновлений, первое обновление,
   *  после которого среднее по 5 обновлениям не ниже 75%, медиана и максимум KL, всего шагов. */
  function summary(hist) {
    const n = hist.length, last = hist.slice(-10), share = (h) => h.ok / h.n;
    const last10 = last.reduce((a, h) => a + share(h), 0) / last.length;
    let reach = null; for (let i = 4; i < n; i++) { const m = hist.slice(i - 4, i + 1).reduce((a, h) => a + share(h), 0) / 5; if (m >= 0.75) { reach = i + 1; break; } }
    const kl = hist.map((h) => h.kl).sort((a, b) => a - b), med = kl[Math.floor(n / 2)];
    const okAll = hist.reduce((a, h) => a + h.ok, 0), trips = hist.reduce((a, h) => a + h.n, 0), steps = hist.reduce((a, h) => a + h.steps, 0);
    const klMaxIt = hist.reduce((b, h, i) => (h.kl > hist[b].kl ? i : b), 0);
    return { last10, reach, klMed: med, klMax: kl[n - 1], klMaxIt, okAll, trips, steps, ret0: hist[0].ret, retLast: last.reduce((a, h) => a + h.ret, 0) / last.length };
  }

  /* ---------- 7. обрезка на одной пачке (лаборатория 2) ---------- */
  /** Один член целевой функции PPO как функция отношения вероятностей r. */
  function clipTerm(r, A, eps) { return eps > 0 ? Math.min(r * A, clamp(r, 1 - eps, 1 + eps) * A) : r * A; }
  /** Производная члена по r: A, если обрезка не действует, иначе 0. */
  function clipSlope(r, A, eps) { if (!(eps > 0)) return A; return (A > 0 && r > 1 + eps) || (A < 0 && r < 1 - eps) ? 0 : A; }
  /** Ада после k обновлений PPO (та же, что справа в лаборатории 1) и пачка, собранная ею на обновлении k.
   *  Генератор: отдаёт номер обновления, в конце — { A, b, k }. */
  function* snapshotGen(k, o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED, clip: CFG.CLIP }, o || {});
    const A = agent(o.seed, o);
    for (let it = 0; it < k; it++) { update(A, collect(A, o.N_EP, o.seed * 100003 + it, o), Object.assign({}, o, { seed: o.seed * 1000 + it })); yield it; }
    return { A, b: collect(A, o.N_EP, o.seed * 100003 + k, o), k };
  }
  function snapshot(k, o) { const g = snapshotGen(k, o); let r; while (!(r = g.next()).done) { /* синхронно */ } return r.value; }
  /** Обновить копию политики на пачке snapshot (EPOCHS эпох, обрезка eps или 0) и вернуть отношения r. */
  function ratioTest(snap, eps, o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED }, o || {});
    const B = cloneAgent(snap.A), u = update(B, snap.b, Object.assign({}, o, { clip: eps, seed: o.seed * 1000 + snap.k }));
    const band = eps > 0 ? eps : 0.2; let out = 0, mx = 0, mn = Infinity;
    for (const q of u.ratios) { if (Math.abs(q - 1) > band) out++; mx = Math.max(mx, q); mn = Math.min(mn, q); }
    return { ratios: u.ratios, kl: u.kl, out: out / u.N, N: u.N, max: mx, min: mn, band };
  }

  /* ---------- 7б. одна поездка по шагам (интерактив в разделе о преимуществе) ---------- */
  /** Поездка ep из пачки snapshot: положения, руль, награды, ценность критика, отдача и GAE при нескольких λ. */
  function trace(snap, ep, o) {
    o = Object.assign({}, CFG, o || {});
    const b = snap.b; let i0 = 0;
    for (let e = 0; e < ep; e++) i0 += b.eps[e].traj.length - 1;
    const E0 = b.eps[ep], T = E0.traj.length - 1, sl = (arr) => Array.from(arr.slice(i0, i0 + T));
    const r = sl(b.R), V = sl(b.V), a = sl(b.A), mu = sl(b.S).map((obs) => mean(snap.A, obs));
    const last = E0.outcome === 'timeout' ? E0.last : 0, G = new Array(T), adv = {};
    let g = last; for (let t = T - 1; t >= 0; t--) { g = r[t] + o.GAMMA * g; G[t] = g; }
    for (const lam of [0, 0.95, 1]) {
      const A = new Array(T); let run = 0;
      for (let t = T - 1; t >= 0; t--) { const nv = t === T - 1 ? last : V[t + 1], d = r[t] + o.GAMMA * nv - V[t]; run = d + o.GAMMA * lam * run; A[t] = run; }
      adv[lam] = A;
    }
    return { traj: E0.traj, outcome: E0.outcome, T, r, V, a, mu, G, adv, sigma: DM.exp(snap.A.logstd[0]) };
  }
  const TRACE = { k: 10, ep: 6 };   // поездка интерактива: пачка перед 11-м обновлением PPO, седьмая из восьми

  /* ---------- 8. сколько шагов симуляции (лаборатория 3) ---------- */
  /** Числа статей: Rudin et al. 2021 (PPO, Isaac Gym), Hwangbo et al. 2019 (ANYmal, TRPO), Schulman et al. 2015 (GAE, двуногий робот). */
  const PAPER = {
    rudin: { robots: 4096, steps: 24, updates: 1500, hz: 50, minutes: 20, minRobots: 128, maxRobots: 16384, base: { robots: 20000, steps: 50 }, horizon: 25 },
    anymal: { simDays: 9, hours: 4, recoverDays: 79, recoverHours: 11, transitions: 250e6 },
    gae: { dt: 0.01, batch: 50000, iters: 1000, days: 5.8, hours: 2 },
  };
  /** Калькулятор: пачка, всего шагов, опыт в секундах и днях. */
  function calc(q) {
    const hz = q.hz || 50, B = q.robots * q.steps, total = B * q.updates, sec = total / hz;
    return { B, total, sec, days: sec / 86400, hours: sec / 3600, horizon: q.steps / hz, perRobotSec: q.updates * q.steps / hz };
  }

  const API = { CFG, DM, PATH_LEN, along, step, collides, observe, envStep, net, fwd, bwd, agent, cloneAgent, mean, logp, ctlOf, collect, gae, update, train, run, thin, summary,
    clipTerm, clipSlope, snapshot, snapshotGen, ratioTest, trace, TRACE, PAPER, calc };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L52 = API;
})(typeof window !== 'undefined' ? window : globalThis);
