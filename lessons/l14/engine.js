/* =====================================================================
   l14/engine.js — движок урока 1.4 «Диффузионные модели».
   Две спирали на плоскости, расписания шума (линейное и косинусное),
   маленькая сеть-денойзер (MLP + Adam, пакетный расчёт), сэмплеры DDPM
   и DDIM с параметром η, регрессия «шум → точка», точный денойзер
   для конечной выборки (поле score), classifier-free guidance, метрики:
   «точка на спирали», доля точек за окружностью, точность и покрытие,
   доля копий. Без DOM: работает в браузере и в Node. Случайность — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  /* ---------- данные: две спирали ---------- */
  const SP = { th0: 0.5 * Math.PI, th1: 3 * Math.PI, R: 1.6, sd: 0.05 };
  /** Точка спирали k ∈ {0, 1} по параметру u ∈ [0, 1]: u равномерно по длине дуги. */
  function spiralPt(k, u) {
    const th = Math.sqrt(SP.th0 * SP.th0 + u * (SP.th1 * SP.th1 - SP.th0 * SP.th0)), r = SP.R * th / SP.th1, a = th + k * Math.PI;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  /** По nPer точек на каждой спирали: X — координаты подряд, lab — номер спирали, U — место на спирали. */
  function spirals(nPer, seed, sd) {
    const r = rng(seed == null ? 7 : seed), N = 2 * nPer, X = new Float64Array(2 * N), lab = new Uint8Array(N), U = new Float64Array(N), s = sd == null ? SP.sd : sd;
    for (let i = 0; i < N; i++) {
      const k = i < nPer ? 0 : 1, u = r(), p = spiralPt(k, u);
      X[2 * i] = p[0] + randn(r) * s; X[2 * i + 1] = p[1] + randn(r) * s; lab[i] = k; U[i] = u;
    }
    return { X, lab, U, N };
  }
  /** Случайная подвыборка из n точек. */
  function subset(data, n, seed) {
    const r = rng(seed || 3), idx = Array.from({ length: data.N }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const X = new Float64Array(2 * n), lab = new Uint8Array(n), U = new Float64Array(n);
    for (let i = 0; i < n; i++) { const j = idx[i]; X[2 * i] = data.X[2 * j]; X[2 * i + 1] = data.X[2 * j + 1]; lab[i] = data.lab[j]; U[i] = data.U[j]; }
    return { X, lab, U, N: n };
  }
  /** Радиус, за которым лежит половина точек. */
  function medianRadius(data) { const r = []; for (let i = 0; i < data.N; i++) r.push(Math.hypot(data.X[2 * i], data.X[2 * i + 1])); r.sort((a, b) => a - b); return (r[(r.length - 1) >> 1] + r[r.length >> 1]) / 2; }

  /* ---------- расписания шума ---------- */
  const T = 1000;
  /** β, α и ᾱ для шагов 0…T; ᾱ₀ = 1 — чистые данные. */
  function schedule(kind) {
    const beta = new Float64Array(T + 1), alpha = new Float64Array(T + 1), abar = new Float64Array(T + 1);
    abar[0] = 1; alpha[0] = 1;
    if (kind === 'cos') {
      const s = 0.008, f = (t) => { const v = Math.cos((t / T + s) / (1 + s) * Math.PI / 2); return v * v; };
      for (let t = 1; t <= T; t++) { beta[t] = Math.min(0.999, 1 - f(t) / f(t - 1)); alpha[t] = 1 - beta[t]; abar[t] = abar[t - 1] * alpha[t]; }
    } else {
      for (let t = 1; t <= T; t++) { beta[t] = 1e-4 + (0.02 - 1e-4) * (t - 1) / (T - 1); alpha[t] = 1 - beta[t]; abar[t] = abar[t - 1] * alpha[t]; }
    }
    return { kind: kind === 'cos' ? 'cos' : 'lin', beta, alpha, abar };
  }

  /* ---------- MLP с пакетным расчётом и Adam ----------
     Веса слоя хранятся по выходам: W[o·nI + i]. Примеры пакета идут подряд:
     A[k·n + i]. Циклы развёрнуты блоками (4 примера × 2 выхода и т. п.):
     в JavaScript так в 2–3 раза быстрее простого цикла. */
  function mlp(sizes, seed, act) {
    const r = rng(seed || 5), W = [], B = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), s = Math.sqrt((l < sizes.length - 2 ? 2 : 1) / a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * s;
      W.push(w); B.push(new Float64Array(b));
    }
    const z = (arr) => arr.map((x) => new Float64Array(x.length));
    return { sizes, act: act || 'silu', W, B, t: 0, mW: z(W), vW: z(W), mB: z(B), vB: z(B), gW: z(W), gB: z(B), cap: 0, A: null, Z: null, D: null, S: null };
  }
  function ensure(m, n) {
    if (m.cap >= n) return;
    m.cap = n; const f = () => m.sizes.map((s) => new Float64Array(n * s)); m.A = f(); m.Z = f(); m.D = f(); m.S = f();
  }
  /** z[k, o] = b[o] + Σ_i x[k, i] · W[o, i] для n примеров. */
  function matmul(x, W, b, z, n, nI, nO) {
    let k = 0;
    for (; k + 3 < n; k += 4) {
      const i0 = k * nI, i1 = i0 + nI, i2 = i1 + nI, i3 = i2 + nI, ob = k * nO;
      let o = 0;
      for (; o + 1 < nO; o += 2) {
        let s0 = b[o], s1 = s0, s2 = s0, s3 = s0, t0 = b[o + 1], t1 = t0, t2 = t0, t3 = t0; const wo = o * nI, wp = wo + nI;
        for (let i = 0; i < nI; i++) { const w = W[wo + i], v = W[wp + i], a0 = x[i0 + i], a1 = x[i1 + i], a2 = x[i2 + i], a3 = x[i3 + i]; s0 += a0 * w; s1 += a1 * w; s2 += a2 * w; s3 += a3 * w; t0 += a0 * v; t1 += a1 * v; t2 += a2 * v; t3 += a3 * v; }
        z[ob + o] = s0; z[ob + nO + o] = s1; z[ob + 2 * nO + o] = s2; z[ob + 3 * nO + o] = s3;
        z[ob + o + 1] = t0; z[ob + nO + o + 1] = t1; z[ob + 2 * nO + o + 1] = t2; z[ob + 3 * nO + o + 1] = t3;
      }
      for (; o < nO; o++) {
        let s0 = b[o], s1 = s0, s2 = s0, s3 = s0; const wo = o * nI;
        for (let i = 0; i < nI; i++) { const w = W[wo + i]; s0 += x[i0 + i] * w; s1 += x[i1 + i] * w; s2 += x[i2 + i] * w; s3 += x[i3 + i] * w; }
        z[ob + o] = s0; z[ob + nO + o] = s1; z[ob + 2 * nO + o] = s2; z[ob + 3 * nO + o] = s3;
      }
    }
    for (; k < n; k++) {
      const ib = k * nI, ob = k * nO;
      for (let o = 0; o < nO; o++) { let s = b[o]; const wo = o * nI; for (let i = 0; i < nI; i++) s += x[ib + i] * W[wo + i]; z[ob + o] = s; }
    }
  }
  /** Прямой проход для n примеров. Вход уже лежит в m.A[0]. Возвращает m.A[последний]. */
  function forward(m, n) {
    const L = m.sizes.length - 1, silu = m.act === 'silu';
    for (let l = 0; l < L; l++) {
      const nI = m.sizes[l], nO = m.sizes[l + 1], z = m.Z[l + 1], sg = m.S[l + 1], out = m.A[l + 1], N = n * nO;
      matmul(m.A[l], m.W[l], m.B[l], z, n, nI, nO);
      if (l === L - 1) for (let j = 0; j < N; j++) out[j] = z[j];
      else if (silu) for (let j = 0; j < N; j++) { const v = z[j], q = 1 / (1 + Math.exp(-v)); sg[j] = q; out[j] = v * q; }
      else for (let j = 0; j < N; j++) { const v = z[j]; out[j] = v > 0 ? v : 0.01 * v; }
    }
    return m.A[L];
  }
  /** Обратный проход: градиент ошибки по выходу лежит в m.D[последний]. Копит градиенты в gW, gB. */
  function backward(m, n) {
    const L = m.sizes.length - 1, silu = m.act === 'silu';
    for (let l = L - 1; l >= 0; l--) {
      const nI = m.sizes[l], nO = m.sizes[l + 1], W = m.W[l], gw = m.gW[l], gb = m.gB[l], x = m.A[l], d = m.D[l + 1];
      for (let k = 0; k < n; k++) { const ob = k * nO; for (let o = 0; o < nO; o++) gb[o] += d[ob + o]; }
      // gW[o, i] += Σ_k d[k, o] · x[k, i] — блоками 2 выхода × 4 входа
      let o = 0;
      for (; o + 1 < nO; o += 2) {
        const wo = o * nI, wp = wo + nI; let i = 0;
        for (; i + 3 < nI; i += 4) {
          let a0 = 0, a1 = 0, a2 = 0, a3 = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0;
          for (let k = 0; k < n; k++) { const ob = k * nO, d0 = d[ob + o], d1 = d[ob + o + 1], xb = k * nI + i, x0 = x[xb], x1 = x[xb + 1], x2 = x[xb + 2], x3 = x[xb + 3]; a0 += d0 * x0; a1 += d0 * x1; a2 += d0 * x2; a3 += d0 * x3; b0 += d1 * x0; b1 += d1 * x1; b2 += d1 * x2; b3 += d1 * x3; }
          gw[wo + i] += a0; gw[wo + i + 1] += a1; gw[wo + i + 2] += a2; gw[wo + i + 3] += a3; gw[wp + i] += b0; gw[wp + i + 1] += b1; gw[wp + i + 2] += b2; gw[wp + i + 3] += b3;
        }
        for (; i < nI; i++) { let a0 = 0, b0 = 0; for (let k = 0; k < n; k++) { const xv = x[k * nI + i]; a0 += d[k * nO + o] * xv; b0 += d[k * nO + o + 1] * xv; } gw[wo + i] += a0; gw[wp + i] += b0; }
      }
      for (; o < nO; o++) { const wo = o * nI; for (let i = 0; i < nI; i++) { let a0 = 0; for (let k = 0; k < n; k++) a0 += d[k * nO + o] * x[k * nI + i]; gw[wo + i] += a0; } }
      if (l === 0) continue;
      // dx[k, i] = Σ_o W[o, i] · d[k, o] — блоками 4 примера × 2 входа, затем производная активации
      const din = m.D[l], zp = m.Z[l], sp = m.S[l];
      let k = 0;
      for (; k + 3 < n; k += 4) {
        const ob = k * nO, o1 = ob + nO, o2 = o1 + nO, o3 = o2 + nO, ib = k * nI; let i = 0;
        for (; i + 1 < nI; i += 2) {
          let s0 = 0, s1 = 0, s2 = 0, s3 = 0, t0 = 0, t1 = 0, t2 = 0, t3 = 0;
          for (let q = 0; q < nO; q++) { const w = W[q * nI + i], v = W[q * nI + i + 1], e0 = d[ob + q], e1 = d[o1 + q], e2 = d[o2 + q], e3 = d[o3 + q]; s0 += w * e0; s1 += w * e1; s2 += w * e2; s3 += w * e3; t0 += v * e0; t1 += v * e1; t2 += v * e2; t3 += v * e3; }
          din[ib + i] = s0; din[ib + nI + i] = s1; din[ib + 2 * nI + i] = s2; din[ib + 3 * nI + i] = s3;
          din[ib + i + 1] = t0; din[ib + nI + i + 1] = t1; din[ib + 2 * nI + i + 1] = t2; din[ib + 3 * nI + i + 1] = t3;
        }
        for (; i < nI; i++) { for (let r = 0; r < 4; r++) { let s = 0; const orr = ob + r * nO; for (let q = 0; q < nO; q++) s += W[q * nI + i] * d[orr + q]; din[ib + r * nI + i] = s; } }
      }
      for (; k < n; k++) { const ob = k * nO, ib = k * nI; for (let i = 0; i < nI; i++) { let s = 0; for (let q = 0; q < nO; q++) s += W[q * nI + i] * d[ob + q]; din[ib + i] = s; } }
      const N = n * nI;
      if (silu) for (let j = 0; j < N; j++) { const q = sp[j]; din[j] *= q * (1 + zp[j] * (1 - q)); }
      else for (let j = 0; j < N; j++) if (zp[j] <= 0) din[j] *= 0.01;
    }
  }
  function adam(m, lr) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    for (let l = 0; l < m.W.length; l++) for (const [P, G, M, V] of [[m.W[l], m.gW[l], m.mW[l], m.vW[l]], [m.B[l], m.gB[l], m.mB[l], m.vB[l]]]) {
      for (let i = 0; i < P.length; i++) { const g = G[i]; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
    }
  }

  /* ---------- вход сети: признаки точки и вложение номера шага ---------- */
  const FREQ = [1, 2, 4, 8, 16], EMB = 1 + 2 * FREQ.length;
  /** Вложение номера шага: t/T и синусы-косинусы на пяти частотах. */
  const EMBTAB = new Float64Array((T + 1) * EMB);
  for (let t = 0; t <= T; t++) { const s = t / T, o = t * EMB; EMBTAB[o] = 2 * s - 1; for (let j = 0; j < FREQ.length; j++) { const a = Math.PI * FREQ[j] * s; EMBTAB[o + 1 + 2 * j] = Math.sin(a); EMBTAB[o + 2 + 2 * j] = Math.cos(a); } }
  /** Признаки точки: сами координаты и синусы-косинусы случайных проекций (признаки Фурье). */
  function features(nf, scale, seed) { const r = rng(seed || 21), FB = new Float64Array(2 * nf); for (let j = 0; j < 2 * nf; j++) FB[j] = randn(r) * scale; return FB; }
  const NET = { hidden: 64, depth: 2, ff: 16, ffs: 4 };

  /** Денойзер: вход — точка и номер шага (и номер спирали, если classes > 0), выход — предсказанный шум. */
  function denoiser(opts) {
    opts = opts || {};
    const H = opts.hidden || NET.hidden, depth = opts.depth || NET.depth, nc = opts.classes || 0, nf = opts.ff == null ? NET.ff : opts.ff, time = opts.time !== false;
    const nin = 2 + 2 * nf + (time ? EMB : 0) + nc, sizes = [nin];
    for (let d = 0; d < depth; d++) sizes.push(H); sizes.push(2);
    return { net: mlp(sizes, opts.seed || 5, opts.act || 'silu'), sched: schedule(opts.sched || 'lin'), nc, nf, time, FB: features(nf, opts.ffs || NET.ffs, opts.ffSeed || 21), nin, steps: 0, hist: [] };
  }
  /** Заполнить вход сети: точки xs (n×2), шаг t (число или массив), класс c (−1 — условие выброшено). */
  function fillIn(D, xs, n, t, c) {
    ensure(D.net, n); const A = D.net.A[0], nin = D.nin, FB = D.FB, nf = D.nf;
    for (let k = 0; k < n; k++) {
      const b = k * nin, x = xs[2 * k], y = xs[2 * k + 1]; A[b] = x; A[b + 1] = y;
      let o = b + 2;
      for (let j = 0; j < nf; j++) { const a = FB[2 * j] * x + FB[2 * j + 1] * y; A[o++] = Math.sin(a); A[o++] = Math.cos(a); }
      if (D.time) { const e = (typeof t === 'number' ? t : t[k]) * EMB; for (let j = 0; j < EMB; j++) A[o++] = EMBTAB[e + j]; }
      if (D.nc) { const ck = typeof c === 'number' ? c : c ? c[k] : -1; for (let j = 0; j < D.nc; j++) A[o++] = j === ck ? 1 : 0; }
    }
  }
  /** Выход сети для n точек на шаге t: Float64Array(2n). */
  function predEps(D, xs, n, t, c) {
    const out = new Float64Array(2 * n), CH = 512;
    for (let s = 0; s < n; s += CH) {
      const m = Math.min(CH, n - s);
      fillIn(D, xs.subarray(2 * s, 2 * (s + m)), m, typeof t === 'number' ? t : t.subarray(s, s + m), c == null || typeof c === 'number' ? (c == null ? -1 : c) : c.subarray(s, s + m));
      out.set(forward(D.net, m).subarray(0, 2 * m), 2 * s);
    }
    return out;
  }
  /** Шаг обучения на пакете: L_simple — средний квадрат ошибки предсказанного шума по координатам.
   *  Номер шага t берётся чаще маленьким: t = 1 + ⌊T·u²⌋. При pUncond > 0 условие иногда выбрасывается. */
  function trainStep(D, data, bs, r, lr, pUncond) {
    const m = D.net; ensure(m, bs);
    const xs = new Float64Array(2 * bs), eps = new Float64Array(2 * bs), ts = new Int32Array(bs), cs = D.nc ? new Int32Array(bs) : null, ab = D.sched.abar;
    for (let k = 0; k < bs; k++) {
      const i = Math.floor(r() * data.N), u = r(), t = Math.min(T, 1 + Math.floor(T * u * u)), a = Math.sqrt(ab[t]), s = Math.sqrt(1 - ab[t]);
      const e0 = randn(r), e1 = randn(r); eps[2 * k] = e0; eps[2 * k + 1] = e1; ts[k] = t;
      xs[2 * k] = a * data.X[2 * i] + s * e0; xs[2 * k + 1] = a * data.X[2 * i + 1] + s * e1;
      if (cs) cs[k] = r() < (pUncond || 0) ? -1 : data.lab[i];
    }
    fillIn(D, xs, bs, ts, cs);
    const y = forward(m, bs), d = m.D[m.sizes.length - 1]; let loss = 0;
    for (let j = 0; j < 2 * bs; j++) { const e = y[j] - eps[j]; loss += e * e; d[j] = e / bs; }
    backward(m, bs); adam(m, lr); D.steps++;
    return loss / (2 * bs);
  }
  /** Шаг обучения лаборатории: 3·10⁻³ первые 200 эпох, потом 10⁻³, после 400 эпох — 5·10⁻⁴ (эпоха — 16 шагов). */
  const LAB = { bs: 125, perEpoch: 16, n: 1000 };
  const labLr = (step) => (step < 200 * LAB.perEpoch ? 3e-3 : step < 400 * LAB.perEpoch ? 1e-3 : 5e-4);
  /** Фиксированный набор для оценки ошибки: одни и те же (x₀, t, ε) при каждом измерении, t — равномерно, как в L_simple. */
  function evalSet(data, n, seed, sched) {
    const r = rng(seed || 77), xs = new Float64Array(2 * n), eps = new Float64Array(2 * n), ts = new Int32Array(n), ab = (sched || schedule('lin')).abar;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(r() * data.N), t = 1 + Math.floor(r() * T), a = Math.sqrt(ab[t]), s = Math.sqrt(1 - ab[t]), e0 = randn(r), e1 = randn(r);
      ts[k] = t; eps[2 * k] = e0; eps[2 * k + 1] = e1; xs[2 * k] = a * data.X[2 * i] + s * e0; xs[2 * k + 1] = a * data.X[2 * i + 1] + s * e1;
    }
    return { xs, eps, ts, n, sched: (sched || schedule('lin')).kind };
  }
  function evalLoss(D, ev) {
    const y = predEps(D, ev.xs, ev.n, ev.ts, -1); let loss = 0;
    for (let j = 0; j < 2 * ev.n; j++) { const e = y[j] - ev.eps[j]; loss += e * e; }
    return loss / (2 * ev.n);
  }
  /** Генератор обучения: steps шагов, прогресс каждые every шагов (с ошибкой на наборе ev, если он задан). */
  function* trainGen(D, data, o) {
    o = o || {}; const steps = o.steps || 1000, bs = o.bs || LAB.bs, every = o.every || 25, r = o.rng || rng(o.seed || 9);
    for (let s = 0; s < steps; s++) {
      const lr = o.lr == null ? labLr(D.steps) : typeof o.lr === 'function' ? o.lr(D.steps) : o.lr;
      const l = trainStep(D, data, bs, r, lr, o.pUncond);
      if ((s + 1) % every === 0 || s === steps - 1) { const ev = o.ev ? evalLoss(D, o.ev) : null; if (ev != null) D.hist.push([D.steps, ev]); yield { step: s + 1, total: steps, loss: l, ev }; }
    }
  }

  /* ---------- регрессия «шум → точка»: та же сеть без номера шага, учится по MSE ---------- */
  function regressor(seed) { return denoiser({ time: false, seed: seed || 8 }); }
  function* regTrainGen(R, data, o) {
    o = o || {}; const steps = o.steps || 400, bs = o.bs || LAB.bs, r = rng(o.seed || 12), m = R.net;
    for (let s = 0; s < steps; s++) {
      const zs = new Float64Array(2 * bs), ys = new Float64Array(2 * bs);
      for (let k = 0; k < bs; k++) { const i = Math.floor(r() * data.N); zs[2 * k] = randn(r); zs[2 * k + 1] = randn(r); ys[2 * k] = data.X[2 * i]; ys[2 * k + 1] = data.X[2 * i + 1]; }
      fillIn(R, zs, bs, 0, -1); const y = forward(m, bs), d = m.D[m.sizes.length - 1]; let loss = 0;
      for (let j = 0; j < 2 * bs; j++) { const e = y[j] - ys[j]; loss += e * e; d[j] = e / bs; }
      backward(m, bs); adam(m, 3e-3); R.steps++;
      if ((s + 1) % 50 === 0 || s === steps - 1) yield { step: s + 1, total: steps, loss: loss / (2 * bs) };
    }
  }
  const regPredict = (R, zs, n) => predEps(R, zs, n, 0, -1);

  /* ---------- сэмплеры ---------- */
  /** Подпоследовательность шагов: ровно S моментов от T вниз, расставлены по квадрату t_i = round(T·(i/S)²),
   *  так что у конца пути, где шум мал, шаги чаще. При S = T это все шаги подряд, как в DDPM. */
  function taus(S) {
    S = Math.max(1, Math.min(T, Math.round(S))); const up = []; let prev = 0;
    for (let i = 1; i <= S; i++) { let t = Math.round(T * (i / S) * (i / S)); if (t <= prev) t = prev + 1; up.push(Math.min(T, t)); prev = t; }
    return up.reverse();
  }
  const CLIP = 2.2;
  /** Обобщённый DDIM: η = 1 — DDPM, η = 0 — детерминированный DDIM. epsFn(xs, n, t) → предсказанный шум.
   *  x0 — стартовый шум (n×2), иначе он берётся с зерном seed. keep — сколько первых траекторий сохранить,
   *  frames — сохранить положения всех точек после каждого шага (для анимации).
   *  Оценку x̂₀ держим в квадрате ±2,2 (как пиксели картинок держат в [−1; 1]). Генератор: отдаёт номер шага. */
  function* sampleGen(epsFn, sched, o) {
    const n = o.n, S = o.steps, eta = o.eta == null ? 1 : o.eta, r = rng(o.seed || 1), ab = sched.abar, keep = Math.min(o.keep || 0, n), clip = o.clip == null ? CLIP : o.clip;
    const x = new Float64Array(2 * n);
    if (o.x0) x.set(o.x0); else for (let j = 0; j < 2 * n; j++) x[j] = randn(r);
    const x0 = Float64Array.from(x), ts = taus(S), traj = [], frames = o.frames ? [Float32Array.from(x)] : null;
    for (let k = 0; k < keep; k++) traj.push([x[2 * k], x[2 * k + 1]]);
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i], tp = i + 1 < ts.length ? ts[i + 1] : 0, a = ab[t], ap = ab[tp];
      const e = epsFn(x, n, t), sa = Math.sqrt(a), s1 = Math.sqrt(1 - a), sap = Math.sqrt(ap);
      const sig = eta * Math.sqrt((1 - ap) / (1 - a)) * Math.sqrt(Math.max(0, 1 - a / ap)), dir = Math.sqrt(Math.max(0, 1 - ap - sig * sig));
      for (let j = 0; j < 2 * n; j++) {
        let xh = (x[j] - s1 * e[j]) / sa, ej = e[j];
        if (clip && (xh > clip || xh < -clip)) { xh = xh > 0 ? clip : -clip; ej = (x[j] - sa * xh) / s1; }
        x[j] = sap * xh + dir * ej + (sig > 0 ? sig * randn(r) : 0);
      }
      for (let k = 0; k < keep; k++) traj[k].push(x[2 * k], x[2 * k + 1]);
      if (frames) frames.push(Float32Array.from(x));
      if (i < ts.length - 1) yield i + 1;
    }
    return { x, x0, traj, frames, steps: ts.length };
  }
  function sample(epsFn, sched, o) { const g = sampleGen(epsFn, sched, o); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  const netEps = (D, c) => (xs, n, t) => predEps(D, xs, n, t, c == null ? -1 : c);
  /** Classifier-free guidance: ε̃ = (1 + w)·ε(x, c) − w·ε(x, ∅). */
  const cfgEps = (D, c, w) => (xs, n, t) => { const ec = predEps(D, xs, n, t, c), eu = predEps(D, xs, n, t, -1); for (let j = 0; j < 2 * n; j++) ec[j] = (1 + w) * ec[j] - w * eu[j]; return ec; };

  /* ---------- точный денойзер для конечной выборки ---------- */
  let LW = new Float64Array(4096);
  /** Оценка чистой точки по зашумлённой в нотации EDM: x = y + n, n ~ N(0, σ²I).
   *  D(x; σ) — среднее обучающих точек с весами N(x; yᵢ, σ²I). Если wOut задан, туда пишутся нормированные веса. */
  function edmD(data, x, y, sigma, out, wOut) {
    const X = data.X, n = data.N, v = 2 * sigma * sigma; if (LW.length < n) LW = new Float64Array(n);
    let mx = -Infinity;
    for (let i = 0; i < n; i++) { const dx = x - X[2 * i], dy = y - X[2 * i + 1], l = -(dx * dx + dy * dy) / v; LW[i] = l; if (l > mx) mx = l; }
    let z = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { const w = Math.exp(LW[i] - mx); LW[i] = w; z += w; sx += w * X[2 * i]; sy += w * X[2 * i + 1]; }
    out[0] = sx / z; out[1] = sy / z;
    if (wOut) for (let i = 0; i < n; i++) wOut[i] = LW[i] / z;
    return out;
  }
  /** Тот же денойзер в нотации DDPM, в виде предсказанного шума: x_t = √ᾱ·x₀ + √(1−ᾱ)·ε ⇔ x_t/√ᾱ = x₀ + σ·n, σ² = (1−ᾱ)/ᾱ. */
  function exactEps(data, sched) {
    const ab = sched.abar, o2 = [0, 0];
    return (xs, n, t) => {
      const a = ab[t], sa = Math.sqrt(a), s1 = Math.sqrt(1 - a), sg = s1 / sa, e = new Float64Array(2 * n);
      for (let k = 0; k < n; k++) { edmD(data, xs[2 * k] / sa, xs[2 * k + 1] / sa, sg, o2); e[2 * k] = (xs[2 * k] - sa * o2[0]) / s1; e[2 * k + 1] = (xs[2 * k + 1] - sa * o2[1]) / s1; }
      return e;
    };
  }

  /* ---------- метрики ---------- */
  /** Ближайшая точка набора: сетка-ускоритель строится один раз. */
  function nnIndex(data, cell) {
    cell = cell || 0.1; const X = data.X, g = new Map();
    for (let i = 0; i < data.N; i++) { const key = (Math.floor(X[2 * i] / cell) + 2048) * 4096 + Math.floor(X[2 * i + 1] / cell) + 2048; let a = g.get(key); if (!a) g.set(key, (a = [])); a.push(i); }
    return {
      near(x, y, rmax) {
        const cx = Math.floor(x / cell) + 2048, cy = Math.floor(y / cell) + 2048, R = Math.ceil(rmax / cell); let best = -1, bd = rmax * rmax;
        for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
          const a = g.get((cx + dx) * 4096 + cy + dy); if (!a) continue;
          for (const i of a) { const ex = X[2 * i] - x, ey = X[2 * i + 1] - y, d = ex * ex + ey * ey; if (d < bd) { bd = d; best = i; } }
        }
        return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
      },
    };
  }
  /** Точка на спирали — ближе d к обучающей точке. who[k] — номер спирали или −1. */
  const DON = 0.1;
  function onSpiral(data, nn, xs, n, d) {
    d = d || DON; let on = 0; const per = [0, 0], who = new Int8Array(n);
    for (let k = 0; k < n; k++) { const q = nn.near(xs[2 * k], xs[2 * k + 1], d); if (q) { on++; per[data.lab[q.i]]++; who[k] = data.lab[q.i]; } else who[k] = -1; }
    return { frac: on / n, on, per, share: on ? [per[0] / on, per[1] / on] : [0, 0], who };
  }
  /** Сводка генерации: доля на спиралях, доли спиралей, доля точек за окружностью rm (у данных — половина). */
  function stats(data, nn, xs, n, rm) {
    const q = onSpiral(data, nn, xs, n); let out = 0;
    for (let k = 0; k < n; k++) if (Math.hypot(xs[2 * k], xs[2 * k + 1]) > rm) out++;
    return { on: q.frac, share: q.share, outer: out / n, who: q.who };
  }
  /** Точность и покрытие для заказанной спирали c: доля сэмплов на ней и доля её точек, рядом с которыми (ближе d) есть сэмпл. */
  function precCov(data, nn, xs, n, c, d) {
    d = d || DON; let ok = 0;
    for (let k = 0; k < n; k++) { const q = nn.near(xs[2 * k], xs[2 * k + 1], d); if (q && data.lab[q.i] === c) ok++; }
    const ns = nnIndex({ X: xs, N: n }, 0.1); let cov = 0, tot = 0;
    for (let i = 0; i < data.N; i++) { if (data.lab[i] !== c) continue; tot++; if (ns.near(data.X[2 * i], data.X[2 * i + 1], d)) cov++; }
    return { prec: ok / n, cov: cov / tot };
  }
  /** Доля копий: сэмпл ближе r к одной из обучающих точек. */
  function copies(nnT, xs, n, r) { let c = 0; for (let k = 0; k < n; k++) if (nnT.near(xs[2 * k], xs[2 * k + 1], r)) c++; return c / n; }

  const API = { rng, randn, SP, spiralPt, spirals, subset, medianRadius, T, schedule, mlp, ensure, forward, backward, adam, EMB, NET, denoiser, fillIn, predEps, trainStep, LAB, labLr, evalSet, evalLoss, trainGen, regressor, regTrainGen, regPredict, taus, CLIP, sampleGen, sample, netEps, cfgEps, edmD, exactEps, nnIndex, DON, onSpiral, stats, precCov, copies };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Diff = API;
})(typeof window !== 'undefined' ? window : globalThis);
