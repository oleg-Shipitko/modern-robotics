/* =====================================================================
   l18/engine.js — движок урока 1.8 «Flow matching». Без DOM: работает
   в браузере (window.FM) и в Node (require). Всё детерминировано: каждое
   случайное число берётся из генератора с зерном.
   - данные: восемь гауссовых пятен на кольце; два пятна для первой сцены;
   - точное поле скоростей для смеси гауссиан (без обучения);
   - маленький MLP с Adam (буферы выделяются один раз, обучение порциями);
   - flow matching: линейный путь, сеть предсказывает скорость, Эйлер;
   - диффузия: расписание DDPM, сеть предсказывает шум, сэмплер DDIM;
   - reflow: пары «шум → куда его привела модель», дообучение на них;
   - пачка из 50 действий: демонстрации объезда чайника, голова на flow.
   Конвенция времени курса: t = 0 — шум, t = 1 — данные, скорость = x1 − x0.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  function noise(n, seed, dim) { const r = rng(seed), z = new Float64Array((dim || 2) * n); for (let i = 0; i < z.length; i++) z[i] = randn(r); return z; }

  /* ---------- смесь гауссиан: данные и точное поле скоростей ---------- */
  /** Компоненты: [{ m: [x, y], s, w }]. Возвращает n точек (2n). */
  function gmmSample(C, n, seed) {
    const r = rng(seed || 1), out = new Float64Array(2 * n), W = C.reduce((a, c) => a + c.w, 0);
    for (let i = 0; i < n; i++) {
      let u = r() * W, k = 0; while (k < C.length - 1 && u > C[k].w) { u -= C[k].w; k++; }
      out[2 * i] = C[k].m[0] + randn(r) * C[k].s; out[2 * i + 1] = C[k].m[1] + randn(r) * C[k].s;
    }
    return out;
  }
  /** Точное поле v(x, t) = (E[x1 | x_t = x] − x) / (1 − t) для линейного пути и шума N(0, I).
   *  При условии компоненты k: x_t ~ N(t·m_k, (t²s² + (1 − t)²) I), E[x1 | x_t, k] = m_k + t·s²/σ² · (x_t − t·m_k). */
  function gmmField(C, x, y, t, out) {
    let wsum = 0, ex = 0, ey = 0, lmax = -Infinity; const L = new Array(C.length);
    for (let k = 0; k < C.length; k++) {
      const c = C[k], s2 = c.s * c.s, v2 = t * t * s2 + (1 - t) * (1 - t), dx = x - t * c.m[0], dy = y - t * c.m[1];
      L[k] = Math.log(c.w) - Math.log(v2) - (dx * dx + dy * dy) / (2 * v2); if (L[k] > lmax) lmax = L[k];
    }
    for (let k = 0; k < C.length; k++) {
      const c = C[k], s2 = c.s * c.s, v2 = t * t * s2 + (1 - t) * (1 - t), g = t * s2 / v2, w = Math.exp(L[k] - lmax);
      wsum += w; ex += w * (c.m[0] + g * (x - t * c.m[0])); ey += w * (c.m[1] + g * (y - t * c.m[1]));
    }
    ex /= wsum; ey /= wsum; out = out || [0, 0];
    out[0] = (ex - x) / (1 - t); out[1] = (ey - y) / (1 - t);
    return out;
  }
  /** Путь точки по точному полю: Эйлер за N шагов от t = 0. Возвращает массив точек [x, y]. */
  function gmmPath(C, x0, y0, N) {
    const p = [[x0, y0]], v = [0, 0]; let x = x0, y = y0;
    for (let k = 0; k < N; k++) { gmmField(C, x, y, k / N, v); x += v[0] / N; y += v[1] / N; p.push([x, y]); }
    return p;
  }

  /* ---------- данные: восемь пятен на кольце ---------- */
  const RING = { k: 8, R: 1.0, s: 0.08 };
  function ringComps() { const c = []; for (let i = 0; i < RING.k; i++) { const a = 2 * Math.PI * i / RING.k + Math.PI / RING.k; c.push({ m: [RING.R * Math.cos(a), RING.R * Math.sin(a)], s: RING.s, w: 1 }); } return c; }
  function ring(n, seed) { const r = rng(seed || 1), out = new Float64Array(2 * n), C = ringComps(); for (let i = 0; i < n; i++) { const c = C[i % RING.k].m; out[2 * i] = c[0] + randn(r) * RING.s; out[2 * i + 1] = c[1] + randn(r) * RING.s; } return out; }
  /** Доля точек ближе rad к центру пятна (по умолчанию 2,5σ) и сколько пятен набрали хотя бы четверть своей доли. */
  function ringQuality(pts, rad) {
    rad = rad || 2.5 * RING.s; const C = ringComps(), n = pts.length / 2, cnt = new Array(RING.k).fill(0); let on = 0;
    for (let i = 0; i < n; i++) {
      let best = 1e9, bk = 0; for (let k = 0; k < RING.k; k++) { const d = Math.hypot(pts[2 * i] - C[k].m[0], pts[2 * i + 1] - C[k].m[1]); if (d < best) { best = d; bk = k; } }
      if (best < rad) { on++; cnt[bk]++; }
    }
    return { on: on / n, modes: cnt.filter((c) => c >= 0.25 * n / RING.k).length, cnt };
  }
  /** Нижняя граница ошибки flow matching на кольце: E‖x1 − x0 − v*(x_t, t)‖² с точным полем (Монте-Карло). */
  function lossFloor(n, seed) {
    const r = rng(seed || 4), C = ringComps(), v = [0, 0]; let s = 0;
    for (let i = 0; i < n; i++) {
      const c = C[Math.floor(r() * C.length)].m, x1 = c[0] + randn(r) * RING.s, y1 = c[1] + randn(r) * RING.s, x0 = randn(r), y0 = randn(r), t = r();
      gmmField(C, (1 - t) * x0 + t * x1, (1 - t) * y0 + t * y1, t, v);
      s += (x1 - x0 - v[0]) ** 2 + (y1 - y0 - v[1]) ** 2;
    }
    return s / n;
  }

  /* ---------- MLP с Adam ---------- */
  /** sizes — размеры слоёв; последний слой инициализируется с уменьшенным масштабом. Веса: w[o·nI + i]. */
  function mlp(sizes, seed) {
    const r = rng(seed || 5), W = [], B = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const nI = sizes[l], nO = sizes[l + 1], w = new Float64Array(nI * nO), s = Math.sqrt(2 / nI) * (l === sizes.length - 2 ? 0.25 : 1);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * s;
      W.push(w); B.push(new Float64Array(nO));
    }
    const z = (a) => a.map((x) => new Float64Array(x.length));
    return { sizes: sizes.slice(), W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0 };
  }
  /** Копия сети. fresh — сбросить состояние Adam (для дообучения на новых данных). */
  function clone(m, fresh) {
    const c = (a) => a.map((x) => new Float64Array(x)), z = (a) => a.map((x) => new Float64Array(x.length));
    return { sizes: m.sizes.slice(), W: c(m.W), B: c(m.B), mW: fresh ? z(m.mW) : c(m.mW), vW: fresh ? z(m.vW) : c(m.vW), mB: fresh ? z(m.mB) : c(m.mB), vB: fresh ? z(m.vB) : c(m.vB), t: fresh ? 0 : m.t };
  }
  const silu = (z) => z / (1 + Math.exp(-z));
  /** Буферы на пачку из bs примеров: прямой проход, обратный, шаг Adam. Вход пачки пишут в .input. */
  function trainer(m, bs) {
    const S = m.sizes, L = S.length - 1;
    const A = S.map((n) => new Float64Array(bs * n)), Zs = S.map((n) => new Float64Array(bs * n)), D = S.map((n) => new Float64Array(bs * n));
    const gW = m.W.map((w) => new Float64Array(w.length)), gB = m.B.map((b) => new Float64Array(b.length));
    function forward(n) {
      for (let l = 0; l < L; l++) {
        const nI = S[l], nO = S[l + 1], w = m.W[l], b = m.B[l], a = A[l], z = Zs[l + 1], y = A[l + 1], last = l === L - 1;
        for (let k = 0; k < n; k++) {
          const ai = k * nI, zo = k * nO;
          for (let o = 0; o < nO; o++) {
            let s = b[o]; const wo = o * nI;
            for (let i = 0; i < nI; i++) s += a[ai + i] * w[wo + i];
            z[zo + o] = s; y[zo + o] = last ? s : silu(s);
          }
        }
      }
      return A[L];
    }
    /** Шаг по MSE к целям Y (n × выход). Возвращает средний по примерам квадрат ошибки. */
    function step(n, Y, lr) {
      const out = forward(n), nOut = S[L], dL = D[L]; let loss = 0;
      for (let k = 0; k < n * nOut; k++) { const e = out[k] - Y[k]; loss += e * e; dL[k] = 2 * e / n; }
      for (let l = 0; l < L; l++) { gW[l].fill(0); gB[l].fill(0); }
      for (let l = L - 1; l >= 0; l--) {
        const nI = S[l], nO = S[l + 1], w = m.W[l], a = A[l], d = D[l + 1], gw = gW[l], gb = gB[l], dPrev = D[l], zPrev = Zs[l];
        if (l > 0) dPrev.fill(0, 0, n * nI);
        for (let k = 0; k < n; k++) {
          const ai = k * nI, di = k * nO;
          for (let o = 0; o < nO; o++) {
            const g = d[di + o]; if (g === 0) continue; gb[o] += g; const wo = o * nI;
            for (let i = 0; i < nI; i++) gw[wo + i] += a[ai + i] * g;
            if (l > 0) for (let i = 0; i < nI; i++) dPrev[ai + i] += w[wo + i] * g;
          }
        }
        if (l > 0) for (let k = 0; k < n * nI; k++) { const z = zPrev[k], sg = 1 / (1 + Math.exp(-z)); dPrev[k] *= sg * (1 + z * (1 - sg)); }
      }
      m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
      for (let l = 0; l < L; l++) for (const [P, G, M, V] of [[m.W[l], gW[l], m.mW[l], m.vW[l]], [m.B[l], gB[l], m.mB[l], m.vB[l]]]) {
        for (let i = 0; i < P.length; i++) { const g = G[i]; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
      }
      return loss / n;
    }
    return { input: A[0], forward, step, bs, gW, gB };
  }
  const lrAt = (lr, it, iters) => lr * (it < iters * 0.6 ? 1 : it < iters * 0.85 ? 0.35 : 0.12);

  /* ---------- двумерные модели: признаки входа ---------- */
  const NF = 5; // признаки времени: t, sin πt, cos πt, sin 2πt, cos 2πt
  function tfeat(t, a, o) { a[o] = t; a[o + 1] = Math.sin(Math.PI * t); a[o + 2] = Math.cos(Math.PI * t); a[o + 3] = Math.sin(2 * Math.PI * t); a[o + 4] = Math.cos(2 * Math.PI * t); }
  /** Фурье-признаки точки: cos и sin проекций на 16 случайных направлений с масштабом 6. Без них маленькой сети трудно выучить чёткие пятна. */
  const FX = (() => { const r = rng(3), k = 16, w = new Float64Array(2 * k); for (let i = 0; i < 2 * k; i++) w[i] = randn(r) * 6; return { k, w }; })();
  const DIN = 2 + 2 * FX.k + NF;
  function feat(x, y, t, a, o) {
    a[o] = x; a[o + 1] = y; let p = o + 2;
    for (let i = 0; i < FX.k; i++) { const u = FX.w[2 * i] * x + FX.w[2 * i + 1] * y; a[p++] = Math.cos(u); a[p++] = Math.sin(u); }
    tfeat(t, a, p);
  }
  const HID = [48, 48];
  const net2 = (seed) => mlp([DIN].concat(HID, [2]), seed || 5);
  /** Предсказание для n точек сразу, одно время t для всех. */
  function predictor(m, cap) {
    const tr = trainer(m, cap), X = tr.input, d0 = m.sizes[0];
    return function (xs, n, t, out) {
      for (let s = 0; s < n; s += cap) {
        const c = Math.min(cap, n - s);
        for (let k = 0; k < c; k++) feat(xs[2 * (s + k)], xs[2 * (s + k) + 1], t, X, k * d0);
        const y = tr.forward(c);
        for (let k = 0; k < 2 * c; k++) out[2 * s + k] = y[k];
      }
      return out;
    };
  }

  /* ---------- flow matching ---------- */
  /** Обучение: x1 — точка данных, x0 — шум, t ~ U[0, 1], вход x_t = (1 − t)·x0 + t·x1, цель x1 − x0.
   *  Если заданы pairs = { z0, z1 } (reflow), пары берутся оттуда, а не случайно. */
  function* trainFM(m, data, opts) {
    opts = opts || {}; const iters = opts.iters || 1500, bs = opts.bs || 128, lr = opts.lr || 0.005, r = rng(opts.seed || 7), tr = trainer(m, bs), X = tr.input, d0 = m.sizes[0];
    const Y = new Float64Array(bs * 2), P = opts.pairs, N = P ? P.z0.length / 2 : data.length / 2; let ema = null;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < bs; k++) {
        const j = Math.floor(r() * N); let x0a, x0b, x1a, x1b;
        if (P) { x0a = P.z0[2 * j]; x0b = P.z0[2 * j + 1]; x1a = P.z1[2 * j]; x1b = P.z1[2 * j + 1]; }
        else { x0a = randn(r); x0b = randn(r); x1a = data[2 * j]; x1b = data[2 * j + 1]; }
        const t = r();
        feat((1 - t) * x0a + t * x1a, (1 - t) * x0b + t * x1b, t, X, k * d0);
        Y[2 * k] = x1a - x0a; Y[2 * k + 1] = x1b - x0b;
      }
      const l = tr.step(bs, Y, lrAt(lr, it, iters)); ema = ema == null ? l : 0.97 * ema + 0.03 * l;
      if (it % 25 === 0 || it === iters - 1) yield { it, iters, loss: ema };
    }
  }
  /** Эйлер от t = 0 до 1 за N шагов: x ← x + v(x, t)/N. Генератор: отдаёт номер шага, в конце — точки.
   *  traj — куда сложить положения после каждого шага. */
  function* eulerGen(m, z, N, traj) {
    const n = z.length / 2, x = new Float64Array(z), v = new Float64Array(2 * n), pred = predictor(m, 256);
    if (traj) traj.push(new Float32Array(x));
    for (let k = 0; k < N; k++) {
      pred(x, n, k / N, v);
      for (let i = 0; i < 2 * n; i++) x[i] += v[i] / N;
      if (traj) traj.push(new Float32Array(x));
      yield k;
    }
    return x;
  }
  const finish = (g) => { let r; while (!(r = g.next()).done); return r.value; };
  const sampleFM = (m, z, N, traj) => finish(eulerGen(m, z, N, traj));
  /** Поле сети на сетке g×g в квадрате [−L, L]² в момент t: [x, y, vx, vy] подряд. */
  function fieldGrid(m, t, g, L) {
    const n = g * g, xs = new Float64Array(2 * n), v = new Float64Array(2 * n), out = new Float64Array(4 * n);
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) { const k = j * g + i; xs[2 * k] = -L + (i + 0.5) * 2 * L / g; xs[2 * k + 1] = L - (j + 0.5) * 2 * L / g; }
    predictor(m, 256)(xs, n, t, v);
    for (let k = 0; k < n; k++) { out[4 * k] = xs[2 * k]; out[4 * k + 1] = xs[2 * k + 1]; out[4 * k + 2] = v[2 * k]; out[4 * k + 3] = v[2 * k + 1]; }
    return out;
  }
  /** Куда смотрят стрелки около кольца: средний косинус угла между стрелкой и направлением на ближайшее пятно
   *  (+1 — все на пятна) и на центр (+1 — все в центр). Точки — на окружности радиуса R между пятнами и на пятнах. */
  function ringFocus(m, t) {
    const C = ringComps(), n = 64, xs = new Float64Array(2 * n), v = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n, r = RING.R * (i % 2 ? 1.25 : 0.75); xs[2 * i] = r * Math.cos(a); xs[2 * i + 1] = r * Math.sin(a); }
    predictor(m, 64)(xs, n, t, v);
    let blob = 0, ctr = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[2 * i], y = xs[2 * i + 1], vx = v[2 * i], vy = v[2 * i + 1], vn = Math.hypot(vx, vy) || 1e-9;
      let best = 1e9, bx = 0, by = 0; for (const c of C) { const d = Math.hypot(c.m[0] - x, c.m[1] - y); if (d < best) { best = d; bx = c.m[0] - x; by = c.m[1] - y; } }
      blob += (vx * bx + vy * by) / (vn * best); ctr += (-vx * x - vy * y) / (vn * Math.hypot(x, y));
    }
    return { blob: blob / n, center: ctr / n };
  }

  /* ---------- диффузия: DDPM-расписание, DDIM ---------- */
  const T = 1000, ABAR = (() => { const a = new Float64Array(T + 1); a[0] = 1; for (let t = 1; t <= T; t++) { const beta = 1e-4 + (0.02 - 1e-4) * (t - 1) / (T - 1); a[t] = a[t - 1] * (1 - beta); } return a; })();
  /** Обучение DDPM: шаг t ∈ {1…1000}, x_t = √ᾱ_t·x0 + √(1 − ᾱ_t)·ε, цель — шум ε. Вход времени — t/1000. */
  function* trainDDPM(m, data, opts) {
    opts = opts || {}; const iters = opts.iters || 1500, bs = opts.bs || 128, lr = opts.lr || 0.005, r = rng(opts.seed || 7), tr = trainer(m, bs), X = tr.input, d0 = m.sizes[0];
    const Y = new Float64Array(bs * 2), N = data.length / 2; let ema = null;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < bs; k++) {
        const j = Math.floor(r() * N), t = 1 + Math.floor(r() * T), ab = ABAR[t], sa = Math.sqrt(ab), sb = Math.sqrt(1 - ab), e0 = randn(r), e1 = randn(r);
        feat(sa * data[2 * j] + sb * e0, sa * data[2 * j + 1] + sb * e1, t / T, X, k * d0);
        Y[2 * k] = e0; Y[2 * k + 1] = e1;
      }
      const l = tr.step(bs, Y, lrAt(lr, it, iters)); ema = ema == null ? l : 0.97 * ema + 0.03 * l;
      if (it % 25 === 0 || it === iters - 1) yield { it, iters, loss: ema };
    }
  }
  /** Моменты DDIM для N шагов по равномерной сетке: T, T − T/N, …, T/N; после последнего шага ᾱ = 1. */
  function ddimTimes(N) { const ts = []; for (let k = N; k >= 1; k--) ts.push(Math.round(k * T / N)); return ts; }
  /** DDIM, η = 0: x̂0 = (x − √(1 − ᾱ)·ε̂)/√ᾱ, затем x ← √ᾱ'·x̂0 + √(1 − ᾱ')·ε̂. Генератор, как eulerGen. */
  function* ddimGen(m, z, N, traj) {
    const n = z.length / 2, x = new Float64Array(z), e = new Float64Array(2 * n), pred = predictor(m, 256), ts = ddimTimes(N);
    if (traj) traj.push(new Float32Array(x));
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k], ab = ABAR[t], abp = k + 1 < ts.length ? ABAR[ts[k + 1]] : 1, sa = Math.sqrt(ab), sb = Math.sqrt(1 - ab), qa = Math.sqrt(abp), qb = Math.sqrt(1 - abp);
      pred(x, n, t / T, e);
      for (let i = 0; i < 2 * n; i++) x[i] = qa * (x[i] - sb * e[i]) / sa + qb * e[i];
      if (traj) traj.push(new Float32Array(x));
      yield k;
    }
    return x;
  }
  const sampleDDIM = (m, z, N, traj) => finish(ddimGen(m, z, N, traj));

  /* ---------- reflow ---------- */
  /** Пары для reflow: n точек шума и куда их привела модель за steps шагов Эйлера. */
  function makePairs(m, n, steps, seed) { const z0 = noise(n, seed || 99); return { z0, z1: sampleFM(m, z0, steps) }; }
  /** То же порциями: генератор, в конце — пары. */
  function* pairsGen(m, n, steps, seed) { const z0 = noise(n, seed || 99), z1 = yield* eulerGen(m, z0, steps); return { z0, z1 }; }
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  /** Сколько пар отрезков z0 → z1 пересекаются между собой (из первых n). */
  function crossings(z0, z1, n) {
    let c = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (segX(z0[2 * i], z0[2 * i + 1], z1[2 * i], z1[2 * i + 1], z0[2 * j], z0[2 * j + 1], z1[2 * j], z1[2 * j + 1])) c++;
    return c;
  }

  /* ---------- пачка действий: объезд чайника ---------- */
  /** Стол вид сверху: захват едет слева направо за 50 тактов (1 с при 50 Гц), действие — смещение поперёк стола, м.
   *  Чайник — круг радиуса KR в центре. Демонстрации объезжают его сверху или снизу. Сеть видит смещения, делённые на SCALE. */
  const CH = { H: 50, len: 0.6, KX: 0.3, KR: 0.07, SCALE: 0.1 };
  const chunkX = (k) => CH.len * k / (CH.H - 1);
  function demos(n, seed) {
    const r = rng(seed || 21), out = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? -1 : 1, A = 0.105 + 0.03 * r(), w = 0.12 + 0.05 * r(), c = CH.KX + (r() - 0.5) * 0.03, y0 = (r() - 0.5) * 0.02, y1 = (r() - 0.5) * 0.02, d = new Float64Array(CH.H);
      for (let k = 0; k < CH.H; k++) { const x = chunkX(k), u = k / (CH.H - 1); d[k] = (side * A * Math.exp(-(((x - c) / w) ** 2)) + y0 * (1 - u) + y1 * u) / CH.SCALE; }
      out.push(d);
    }
    return out;
  }
  /** Точное поле для пачек: смесь гауссиан с центрами в демонстрациях D (каждая — H чисел) и общим разбросом s.
   *  Тот же вывод, что для двумерной смеси; нормировки компонент одинаковы и сокращаются. */
  function chunkField(D, s, x, t, out) {
    const H = CH.H, K = D.length, s2 = s * s, v2 = t * t * s2 + (1 - t) * (1 - t), g = t * s2 / v2, L = new Float64Array(K); let lmax = -Infinity;
    for (let k = 0; k < K; k++) { const d = D[k]; let q = 0; for (let i = 0; i < H; i++) { const e = x[i] - t * d[i]; q += e * e; } L[k] = -q / (2 * v2); if (L[k] > lmax) lmax = L[k]; }
    let ws = 0; out.fill(0);
    for (let k = 0; k < K; k++) { const w = Math.exp(L[k] - lmax), d = D[k]; ws += w; for (let i = 0; i < H; i++) out[i] += w * (d[i] + g * (x[i] - t * d[i])); }
    for (let i = 0; i < H; i++) out[i] = (out[i] / ws - x[i]) / (1 - t);
    return out;
  }
  /** n пачек за N шагов Эйлера из шума z (n × H) по точному полю. traj — пачки после каждого шага. */
  function sampleChunk(D, s, z, N, traj) {
    const H = CH.H, n = z.length / H, x = new Float64Array(z), xi = new Float64Array(H), v = new Float64Array(H);
    if (traj) traj.push(new Float64Array(x));
    for (let st = 0; st < N; st++) {
      for (let k = 0; k < n; k++) { for (let i = 0; i < H; i++) xi[i] = x[k * H + i]; chunkField(D, s, xi, st / N, v); for (let i = 0; i < H; i++) x[k * H + i] += v[i] / N; }
      if (traj) traj.push(new Float64Array(x));
    }
    return x;
  }
  /** Оценка пачки: задела ли чайник (м) и наибольшее ускорение поперёк стола (м/с² при 50 Гц). */
  function chunkCheck(x, k0) {
    const H = CH.H, dt = 0.02; let hit = false, gap = 1e9, acc = 0; const y = (i) => x[k0 * H + i] * CH.SCALE;
    for (let i = 0; i < H; i++) { const d = Math.hypot(chunkX(i) - CH.KX, y(i)) - CH.KR; if (d < gap) gap = d; if (d < 0) hit = true; }
    for (let i = 1; i < H - 1; i++) acc = Math.max(acc, Math.abs(y(i + 1) - 2 * y(i) + y(i - 1)) / (dt * dt));
    return { hit, gap, acc, side: y(Math.round((H - 1) * CH.KX / CH.len)) >= 0 ? 1 : -1 };
  }

  /* ---------- задержка π0 (Black et al., 2024; RTX 4090, три камеры) ---------- */
  const PI0 = { enc: 14, prefix: 32, flow10: 27, net: 13, hz: 50, chunk: 50, exec: 25 };
  /** Задержка вывода, мс: энкодеры + префикс + N шагов эксперта действий (27 мс на 10 шагов) + сеть, если модель вне робота. */
  function latency(N, offboard) { return PI0.enc + PI0.prefix + PI0.flow10 * N / 10 + (offboard ? PI0.net : 0); }
  /** Доля времени, когда робот стоит: синхронный режим, после каждых exec действий — пауза на вывод. */
  function idle(L, exec) { const run = (exec || PI0.exec) * 1000 / PI0.hz; return L / (run + L); }

  const API = { rng, randn, noise, gmmSample, gmmField, gmmPath, RING, ringComps, ring, ringQuality, lossFloor, mlp, clone, trainer, NF, tfeat, FX, DIN, HID, feat, net2, predictor, trainFM, eulerGen, sampleFM, fieldGrid, ringFocus, T, ABAR, trainDDPM, ddimTimes, ddimGen, sampleDDIM, makePairs, pairsGen, segX, crossings, CH, chunkX, demos, chunkField, sampleChunk, chunkCheck, PI0, latency, idle };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.FM = API;
})(typeof window !== 'undefined' ? window : globalThis);
