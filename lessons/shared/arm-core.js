/* =====================================================================
   shared/arm-core.js — движок урока 0.3: двухзвенная рука.
   Кинематика (FK/IK, якобиан), нейросеть «поза → углы» (MLP + Adam),
   динамика руки в вертикальной плоскости, ПД с компенсацией гравитации,
   импеданс в декартовом пространстве, контакт со столом.
   Прогоны регулятора детерминированные: шаг 1 мс, кадр каждые 10 мс.
   Без DOM: работает в браузере и в Node.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const L1 = 0.5, L2 = 0.4; // м
  const fk = (q) => { const x1 = L1 * Math.cos(q[0]), y1 = L1 * Math.sin(q[0]); return { x1, y1, x: x1 + L2 * Math.cos(q[0] + q[1]), y: y1 + L2 * Math.sin(q[0] + q[1]) }; };
  function ik(x, y) {
    const d2 = x * x + y * y, c2 = (d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    if (c2 > 1 || c2 < -1) return [];
    return [1, -1].map((s) => { const q2 = s * Math.acos(c2); return [Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)), q2]; });
  }
  const jac = (q) => { const s1 = Math.sin(q[0]), c1 = Math.cos(q[0]), s12 = Math.sin(q[0] + q[1]), c12 = Math.cos(q[0] + q[1]); return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]]; };

  /* ---------- MLP: 2 → 64 → 64 → 4 (cos θ1, sin θ1, cos θ2, sin θ2) ---------- */
  function mlp(sizes, seed) {
    const r = rng(seed || 5), W = [], B = [];
    for (let l = 0; l < sizes.length - 1; l++) { const a = sizes[l], b = sizes[l + 1], w = new Float32Array(a * b), s = Math.sqrt(2 / a); for (let i = 0; i < w.length; i++) w[i] = randn(r) * s; W.push(w); B.push(new Float32Array(b)); }
    return { sizes, W, B, t: 0, mW: W.map((w) => new Float32Array(w.length)), vW: W.map((w) => new Float32Array(w.length)), mB: B.map((b) => new Float32Array(b.length)), vB: B.map((b) => new Float32Array(b.length)) };
  }
  function forward(m, x, acts) {
    let a = x; if (acts) acts.length = 0, acts.push(x);
    const Lc = m.sizes.length - 1;
    for (let l = 0; l < Lc; l++) {
      const nI = m.sizes[l], nO = m.sizes[l + 1], w = m.W[l], b = m.B[l], z = new Float32Array(nO);
      for (let o = 0; o < nO; o++) { let s = b[o]; for (let i = 0; i < nI; i++) s += a[i] * w[i * nO + o]; z[o] = l < Lc - 1 ? (s > 0 ? s : 0.01 * s) : s; }
      a = z; if (acts) acts.push(z);
    }
    return a;
  }
  function trainStep(m, X, Y, idx, lr) {
    const Lc = m.sizes.length - 1, gW = m.W.map((w) => new Float32Array(w.length)), gB = m.B.map((b) => new Float32Array(b.length)), acts = [];
    let loss = 0;
    for (const n of idx) {
      const out = forward(m, X[n], acts), y = Y[n];
      let delta = new Float32Array(out.length);
      for (let o = 0; o < out.length; o++) { const e = out[o] - y[o]; loss += e * e; delta[o] = 2 * e / idx.length; }
      for (let l = Lc - 1; l >= 0; l--) {
        const nI = m.sizes[l], nO = m.sizes[l + 1], a = acts[l], w = m.W[l];
        for (let o = 0; o < nO; o++) { gB[l][o] += delta[o]; for (let i = 0; i < nI; i++) gW[l][i * nO + o] += a[i] * delta[o]; }
        if (l > 0) { const d2 = new Float32Array(nI); for (let i = 0; i < nI; i++) { let s = 0; for (let o = 0; o < nO; o++) s += w[i * nO + o] * delta[o]; d2[i] = s * (a[i] > 0 ? 1 : 0.01); } delta = d2; }
      }
    }
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    for (let l = 0; l < Lc; l++) for (const [P, G, M, V] of [[m.W[l], gW[l], m.mW[l], m.vW[l]], [m.B[l], gB[l], m.mB[l], m.vB[l]]]) for (let i = 0; i < P.length; i++) { M[i] = b1 * M[i] + (1 - b1) * G[i]; V[i] = b2 * V[i] + (1 - b2) * G[i] * G[i]; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    return loss / idx.length;
  }
  /** Датасет: случайные позы руки → (x, y). elbowUp — только решения с θ2 > 0. */
  function ikData(n, elbowUp, seed) {
    const r = rng(seed || 3), X = [], Y = [];
    while (X.length < n) {
      const q1 = (r() * 2 - 1) * Math.PI, q2 = (r() * 2 - 1) * Math.PI * 0.97;
      if (elbowUp && q2 < 0.03) continue;
      const p = fk([q1, q2]); X.push(new Float32Array([p.x / (L1 + L2), p.y / (L1 + L2)])); Y.push(new Float32Array([Math.cos(q1), Math.sin(q1), Math.cos(q2), Math.sin(q2)]));
    }
    return { X, Y };
  }
  function* trainGen(m, data, opts) {
    opts = opts || {}; const iters = opts.iters || 1500, bs = opts.bs || 128, r = rng(opts.seed || 9), N = data.X.length; let ema = null;
    for (let it = 0; it < iters; it++) { const idx = []; for (let k = 0; k < bs; k++) idx.push(Math.floor(r() * N)); const l = trainStep(m, data.X, data.Y, idx, (opts.lr || 0.003) * (it < iters * 0.7 ? 1 : 0.3)); ema = ema == null ? l : 0.95 * ema + 0.05 * l; if (it % 10 === 0 || it === iters - 1) yield { it, loss: ema }; }
  }
  function netIK(m, x, y) { const o = forward(m, new Float32Array([x / (L1 + L2), y / (L1 + L2)])); return [Math.atan2(o[1], o[0]), Math.atan2(o[3], o[2])]; }

  /* ---------- динамика руки в вертикальной плоскости ---------- */
  const M1 = 1.2, M2 = 0.9, GR = 9.81; // точечные массы на концах звеньев, кг
  function dyn(q, dq, tau) {
    const c2 = Math.cos(q[1]), s2 = Math.sin(q[1]);
    const a = (M1 + M2) * L1 * L1 + M2 * L2 * L2 + 2 * M2 * L1 * L2 * c2, b = M2 * L2 * L2 + M2 * L1 * L2 * c2, d = M2 * L2 * L2;
    const h = M2 * L1 * L2 * s2;
    const C1 = -h * (2 * dq[0] * dq[1] + dq[1] * dq[1]), C2 = h * dq[0] * dq[0];
    const G1 = (M1 + M2) * GR * L1 * Math.cos(q[0]) + M2 * GR * L2 * Math.cos(q[0] + q[1]), G2 = M2 * GR * L2 * Math.cos(q[0] + q[1]);
    const r1 = tau[0] - C1 - G1, r2 = tau[1] - C2 - G2, det = a * d - b * b;
    return [(d * r1 - b * r2) / det, (-b * r1 + a * r2) / det];
  }
  const gravity = (q) => [(M1 + M2) * GR * L1 * Math.cos(q[0]) + M2 * GR * L2 * Math.cos(q[0] + q[1]), M2 * GR * L2 * Math.cos(q[0] + q[1])];

  /* ---------- сценарии регулятора ---------- */
  const SHELF = { x: 0.55, y: 0.35 }, TABLE = -0.12;
  /** Режимы: 'pd' — держим чашку у полки; 'pos' и 'imp' — протираем стол жёстким позиционным или импедансным регулятором. */
  const ctlInit = (mode) => (mode === 'pd' ? { q: [-Math.PI / 2 + 0.05, 0.25], dq: [0, 0] } : { q: ik(0.45, 0.16)[1], dq: [0, 0] });
  const goalOf = (o) => (o.mode === 'pd' ? SHELF : { x: 0.62, y: TABLE - 0.02 - (o.errH == null ? 0.04 : o.errH) }); // камера ошиблась: стол «кажется» ниже
  function ctlTau(o, q, dq) {
    const g = gravity(q), gp = goalOf(o);
    if (o.mode === 'pd' || o.mode === 'pos') {
      const qs = ik(gp.x, gp.y)[o.mode === 'pd' ? 0 : 1] || q, Kp = o.mode === 'pd' ? o.Kp : 300, Kd = o.mode === 'pd' ? o.Kd : 12, comp = o.mode === 'pd' ? !!o.comp : true;
      return [Kp * (qs[0] - q[0]) - Kd * dq[0] + (comp ? g[0] : 0), Kp * (qs[1] - q[1]) - Kd * dq[1] + (comp ? g[1] : 0)];
    }
    const Kc = o.Kimp || 400, Dc = 2 * Math.sqrt(Kc * 1.5), p = fk(q), J = jac(q), v = [J[0][0] * dq[0] + J[0][1] * dq[1], J[1][0] * dq[0] + J[1][1] * dq[1]];
    const Fx = Kc * (gp.x - p.x) - Dc * v[0], Fy = Kc * (gp.y - p.y) - Dc * v[1];
    return [J[0][0] * Fx + J[1][0] * Fy + g[0], J[0][1] * Fx + J[1][1] * Fy + g[1]];
  }
  /** Шаг 1 мс. Возвращает силу, с которой стол давит на схват. pull — точка, к которой схват тянут пружиной (мышь). */
  function ctlStep(o, s, pull) {
    let tau = ctlTau(o, s.q, s.dq); const p = fk(s.q), J = jac(s.q); let F = 0;
    if (o.mode !== 'pd' && p.y < TABLE) { const vy = J[1][0] * s.dq[0] + J[1][1] * s.dq[1]; F = Math.max(0, 6000 * (TABLE - p.y) - 40 * vy); tau = [tau[0] + J[1][0] * F, tau[1] + J[1][1] * F]; }
    if (pull) { const fx = 400 * (pull.x - p.x), fy = 400 * (pull.y - p.y); tau = [tau[0] + J[0][0] * fx + J[1][0] * fy, tau[1] + J[0][1] * fx + J[1][1] * fy]; }
    const a = dyn(s.q, s.dq, tau); s.dq = [s.dq[0] + a[0] * 0.001, s.dq[1] + a[1] * 0.001]; s.q = [s.q[0] + s.dq[0] * 0.001, s.q[1] + s.dq[1] * 0.001];
    return F;
  }
  /** Прогон на T секунд: кадры { t, q, dq, err (м), F (Н) } каждые 10 мс. */
  function simulate(o, T) {
    const s = ctlInit(o.mode), gp = goalOf(o), frames = []; let peak = 0;
    for (let i = 0; i <= Math.round(T * 1000); i++) {
      const F = i ? ctlStep(o, s) : 0; peak = Math.max(peak, F);
      if (i % 10 === 0) { const p = fk(s.q); frames.push({ t: i / 1000, q: s.q.slice(), dq: s.dq.slice(), err: Math.hypot(p.x - gp.x, p.y - gp.y), F }); }
    }
    return { frames, peak, final: frames[frames.length - 1] };
  }

  const API = { rng, randn, L1, L2, fk, ik, jac, mlp, forward, trainStep, trainGen, ikData, netIK, dyn, gravity, M1, M2, GR, SHELF, TABLE, ctlInit, goalOf, ctlStep, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Arm = API;
})(typeof window !== 'undefined' ? window : globalThis);
