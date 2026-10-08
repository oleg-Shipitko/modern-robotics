/* =====================================================================
   l31/engine.js — движок урока 3.1 «RT-1». Без DOM: работает в браузере
   (поверх window.L21 — мир стола из урока 2.1) и в Node (для подбора
   чисел и тестов).
   1) Сцены стола 96×96 с командой «возьми <цвет> кубик»: целевой кубик
      обычного или мелкого размера, два кубика других цветов и миска.
   2) Действие как токен: координата захвата → номер корзины из B на ось,
      обратно — центр корзины. Проверка квантования без обучения.
   3) Мини-RT-1: токенизатор по клеткам сетки 24×24 с FiLM-условием на
      слово команды (γ, β от слова, инициализация тождеством, как в статье),
      мягкий отбор M токенов из клеток (как TokenLearner: softmax по клеткам),
      маленькая полносвязная сеть вместо трансформера и две головы
      классификации — корзина x и корзина y, перекрёстная энтропия.
      Вариант «непрерывные действия»: та же сеть, два числа и средний
      квадрат ошибки (абляция из статьи).
   Клетки пустого стола одинаковы, поэтому в отборе токенов фон участвует
   одной клеткой: так обучение в браузере занимает секунды и внимание не
   застревает на фоне.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp, net, fwd, bwd, adam, COLORS, CI, BG, paint, blank, TW } = L;
  const GC = 32, CSZ = TW / GC;                             // клеток признаков на сторону стола (3 × 3 px каждая)
  const RT = L.RT, RS = 3.4;                               // радиус обычного и мелкого предмета, px
  const WORDS = COLORS.map((c) => c.id), NW = WORDS.length; // слова команды — шесть цветов
  const BINS = [4, 8, 16, 32, 64, 256];                     // число корзин на ось, доступное в лаборатории

  /* ---------- 1. сцены ---------- */
  function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** Сцена для команды «возьми <target> кубик». o.small — целевой кубик мелкий. */
  function scene(target, seed, o) {
    o = o || {}; const r = rng(seed * 17 + 3), others = shuffle(WORDS.filter((c) => c !== target), r);
    const spec = [{ color: target, shape: 'cube', R: o.small ? RS : RT }, { color: others[0], shape: 'cube', R: RT }, { color: others[1], shape: 'cube', R: RT }, { color: others[2], shape: 'bowl', R: RT }];
    const objs = [], m = 10;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 19));
      objs.push({ color: it.color, shape: it.shape, R: it.R, x, y });
    }
    const img = blank(TW, TW, r, 0.015);
    for (const q of objs) paint(img, TW, TW, q.color, q.shape, q.x, q.y, q.R, r, 0.03);
    return { img, objs, target: objs[0], word: target, small: !!o.small, feat: features(img) };
  }
  /** Попал ли захват в предмет: ближе 0,85 радиуса к центру (как hitObj в 2.1, но с радиусом предмета). */
  const hit = (q, x, y) => Math.hypot(q.x - x, q.y - y) < q.R * 0.85;
  /** n сцен с чередованием цветов команды. */
  function scenes(n, seed0, o) { const out = []; for (let i = 0; i < n; i++) out.push(scene(WORDS[i % NW], seed0 + i, o)); return out; }
  const demos = (n, o) => scenes(n, 300, o);
  const tests = (n, o) => scenes(n || 30, 5000, o);

  /** Признаки картинки: средний цвет клетки CSZ × CSZ минус фон; остаются только клетки, отличные от фона
   *  (положение центра в [−1, 1]), фон — одной клеткой с его средним положением. */
  const TH = 0.03;
  function features(img) {
    const cells = []; let nbg = 0, Sx = 0, Sy = 0; const inv = 1 / (CSZ * CSZ);
    for (let i = 0; i < GC * GC; i++) {
      const cx = i % GC, cy = Math.floor(i / GC); let r = 0, g = 0, b = 0;
      for (let y = cy * CSZ; y < (cy + 1) * CSZ; y++) for (let x = cx * CSZ; x < (cx + 1) * CSZ; x++) { const o = (y * TW + x) * 3; r += img[o]; g += img[o + 1]; b += img[o + 2]; }
      const dr = r * inv - BG[0], dg = g * inv - BG[1], db = b * inv - BG[2], px = (cx + 0.5) / GC * 2 - 1, py = (cy + 0.5) / GC * 2 - 1;
      if (Math.abs(dr) < TH && Math.abs(dg) < TH && Math.abs(db) < TH) { nbg++; Sx += px; Sy += py; } else cells.push({ i, x: px, y: py, c: [dr, dg, db] });
    }
    return { cells, nbg, Sx, Sy };
  }

  /* ---------- 2. действие как токен: корзины ---------- */
  const binOf = (v, B) => clamp(Math.floor(v / TW * B), 0, B - 1);
  const binCenter = (b, B) => (b + 0.5) * TW / B;
  /** Квантование без обучения: точку захвата (центр цели) кладут в корзину и возвращают центр корзины. */
  function quantize(sc, B) { const bx = binOf(sc.target.x, B), by = binOf(sc.target.y, B), x = binCenter(bx, B), y = binCenter(by, B); return { bx, by, x, y, ok: hit(sc.target, x, y), err: Math.hypot(x - sc.target.x, y - sc.target.y) }; }
  function quantEval(B, list) { const runs = list.map((sc) => Object.assign({ sc }, quantize(sc, B))); return { B, n: list.length, hits: runs.filter((q) => q.ok).length, runs, maxErr: TW / B / Math.SQRT2 }; }

  /* ---------- 3. мини-RT-1 ---------- */
  function prm(n, s, r) { const v = new Float64Array(n); if (s) for (let i = 0; i < n; i++) v[i] = randn(r) * s; return { v, g: new Float64Array(n), m: new Float64Array(n), w: new Float64Array(n) }; }
  function adamP(p, t, lr, bs) {
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < p.v.length; i++) { const g = p.g[i] / bs; p.m[i] = b1 * p.m[i] + (1 - b1) * g; p.w[i] = b2 * p.w[i] + (1 - b2) * g * g; p.v[i] -= lr * (p.m[i] / c1) / (Math.sqrt(p.w[i] / c2) + 1e-8); p.g[i] = 0; }
  }
  /** Модель. o: { B — корзин на ось, kind: 'bins' | 'reg', d — каналов токена, M — токенов, H — скрытых нейронов, seed }. */
  function rtInit(o) {
    o = o || {}; const B = o.B || 32, d = o.d || 8, M = o.M || 1, H = o.H || 48, kind = o.kind || 'bins', seed = o.seed || 5, r = rng(seed);
    const pos = o.pos !== false, inD = pos ? 2 : d + 2;                 // pos: голова видит только положения токенов, не их признаки
    return { B, d, M, H, kind, pos, inD, t: 0, steps: 0, seed,
      W: prm(3 * d, 1.0, r), b: prm(d, 0.1, r), gam: prm(NW * d, 0, r), bet: prm(NW * d, 0, r),   // FiLM: γ = β = 0 в начале — тождество, как в RT-1
      u: prm(M * d, 0.5, r), c: prm(M, 0, r),
      head: net([M * inD, H, kind === 'bins' ? 2 * B : 2], seed + 1) };
  }
  const nParams = (m) => [m.W, m.b, m.gam, m.bet, m.u, m.c].reduce((s, p) => s + p.v.length, 0) + m.head.L.reduce((s, l) => s + l.w.length + l.bias.length, 0);
  /** Прямой проход: токенизатор с FiLM → мягкий отбор токенов → голова. cache — для обратного прохода и рисунков. */
  function rtForward(m, sc, cache) {
    const { d, M } = m, F = sc.feat, w = CI[sc.word], n = F.cells.length, N = n + 1;
    const z = new Float64Array(N * d), h = new Float64Array(N * d);
    for (let i = 0; i < N; i++) {
      const col = i < n ? F.cells[i].c : null;
      for (let k = 0; k < d; k++) {
        let v = m.b.v[k]; if (col) v += m.W.v[k] * col[0] + m.W.v[d + k] * col[1] + m.W.v[2 * d + k] * col[2];
        z[i * d + k] = v; h[i * d + k] = Math.tanh((1 + m.gam.v[w * d + k]) * v + m.bet.v[w * d + k]);
      }
    }
    const s = new Float64Array(M * N), a = new Float64Array(M * N), inp = new Float64Array(M * m.inD), tok = new Float64Array(M * d);
    for (let j = 0; j < M; j++) {
      let mx = -Infinity;
      for (let i = 0; i < N; i++) { let v = m.c.v[j]; for (let k = 0; k < d; k++) v += m.u.v[j * d + k] * h[i * d + k]; s[j * N + i] = v; if (v > mx) mx = v; }
      let Z = 0;
      for (let i = 0; i < N; i++) { const e = Math.exp(s[j * N + i] - mx); a[j * N + i] = e; Z += e; }
      for (let i = 0; i < N; i++) a[j * N + i] /= Z;                    // a[bg] — вес фона как одной клетки (все клетки фона одинаковы)
      for (let k = 0; k < d; k++) { let v = 0; for (let i = 0; i < N; i++) v += a[j * N + i] * h[i * d + k]; tok[j * d + k] = v; if (!m.pos) inp[j * m.inD + k] = v; }
      let px = 0, py = 0; for (let i = 0; i < n; i++) { px += a[j * N + i] * F.cells[i].x; py += a[j * N + i] * F.cells[i].y; }
      if (F.nbg) { px += a[j * N + n] * F.Sx / F.nbg; py += a[j * N + n] * F.Sy / F.nbg; }
      inp[j * m.inD + m.inD - 2] = px; inp[j * m.inD + m.inD - 1] = py;
    }
    const out = fwd(m.head, inp);
    if (cache) Object.assign(cache, { z, h, s, a, inp, tok, n, N, w, F });
    return out;
  }
  /** Обратный проход: голова (bwd из 2.1), затем градиент по её входу, отбор токенов, FiLM и токенизатор. */
  function rtBackward(m, cache, dout) {
    bwd(m.head, dout);
    const l0 = m.head.L[0], dinp = new Float64Array(l0.a);
    for (let i = 0; i < l0.a; i++) { let sum = 0; const off = i * l0.b; for (let j = 0; j < l0.b; j++) sum += l0.w[off + j] * l0.d[j]; dinp[i] = sum; }
    const { z, h, a, n, N, w, F } = cache, { d, M } = m, dh = new Float64Array(N * d), da = new Float64Array(N), dt = new Float64Array(d);
    for (let j = 0; j < M; j++) {
      const o = j * m.inD, dpx = dinp[o + m.inD - 2], dpy = dinp[o + m.inD - 1]; let C = 0;
      for (let k = 0; k < d; k++) dt[k] = m.pos ? 0 : dinp[o + k];
      for (let i = 0; i < N; i++) {
        let v = 0; for (let k = 0; k < d; k++) v += dt[k] * h[i * d + k];
        if (i < n) v += dpx * F.cells[i].x + dpy * F.cells[i].y; else if (F.nbg) v += (dpx * F.Sx + dpy * F.Sy) / F.nbg;
        da[i] = v; C += a[j * N + i] * v;
      }
      for (let i = 0; i < N; i++) {
        const ai = a[j * N + i], ds = ai * (da[i] - C);
        for (let k = 0; k < d; k++) { dh[i * d + k] += ai * dt[k] + ds * m.u.v[j * d + k]; m.u.g[j * d + k] += ds * h[i * d + k]; }
        m.c.g[j] += ds;
      }
    }
    for (let i = 0; i < N; i++) {
      const col = i < n ? F.cells[i].c : null;
      for (let k = 0; k < d; k++) {
        const hv = h[i * d + k], dg = dh[i * d + k] * (1 - hv * hv), zv = z[i * d + k];
        m.gam.g[w * d + k] += dg * zv; m.bet.g[w * d + k] += dg;
        const dz = dg * (1 + m.gam.v[w * d + k]);
        m.b.g[k] += dz; if (col) { m.W.g[k] += dz * col[0]; m.W.g[d + k] += dz * col[1]; m.W.g[2 * d + k] += dz * col[2]; }
      }
    }
  }
  /** Потери и градиент по выходу: перекрёстная энтропия по корзине x и по корзине y или средний квадрат ошибки. */
  function lossGrad(m, out, sc, g) {
    if (m.kind === 'reg') { const tx = sc.target.x / TW * 2 - 1, ty = sc.target.y / TW * 2 - 1; g[0] = 2 * (out[0] - tx); g[1] = 2 * (out[1] - ty); return (out[0] - tx) ** 2 + (out[1] - ty) ** 2; }
    const B = m.B; let loss = 0;
    for (const [off, tgt] of [[0, binOf(sc.target.x, B)], [B, binOf(sc.target.y, B)]]) {
      let mx = -Infinity; for (let b = 0; b < B; b++) if (out[off + b] > mx) mx = out[off + b];
      let Z = 0; for (let b = 0; b < B; b++) Z += Math.exp(out[off + b] - mx);
      for (let b = 0; b < B; b++) g[off + b] = Math.exp(out[off + b] - mx) / Z - (b === tgt ? 1 : 0);
      loss -= out[off + tgt] - mx - Math.log(Z);
    }
    return loss;
  }
  /** Обучение мини-пакетами Adam. Генератор: отдаёт прогресс каждые 10 шагов, в конце — модель. */
  function* rtTrain(m, D, o) {
    o = o || {}; const iters = o.iters || 1000, bs = Math.min(o.batch || 16, D.length), lr0 = o.lr || 0.03, decay = o.decay == null ? 0.1 : o.decay, r = rng((o.seed || 17) + m.steps * 7);
    const cache = {}, g = new Float64Array(m.head.sizes[m.head.sizes.length - 1]), P = [m.W, m.b, m.gam, m.bet, m.u, m.c];
    for (let it = 0; it < iters; it++) {
      let loss = 0; const lr = lr0 * (1 - (1 - decay) * it / iters);   // шаг обучения линейно убывает до decay·lr0
      for (let k = 0; k < bs; k++) { const sc = D[Math.floor(r() * D.length)], out = rtForward(m, sc, cache); loss += lossGrad(m, out, sc, g) / bs; rtBackward(m, cache, g); }
      m.t++; adam(m.head, lr, bs); for (const p of P) adamP(p, m.t, lr, bs); m.steps++;
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss, steps: m.steps };
    }
    return m;
  }
  /** Предсказание: корзины → центр корзины → попадание; карта внимания первого токена по клеткам сетки. */
  function rtPredict(m, sc) {
    const cache = {}, out = rtForward(m, sc, cache), B = m.B, F = sc.feat, N = cache.N;
    let p;
    if (m.kind === 'reg') p = { bx: null, by: null, x: (out[0] + 1) / 2 * TW, y: (out[1] + 1) / 2 * TW };
    else { let bx = 0, by = 0; for (let b = 1; b < B; b++) { if (out[b] > out[bx]) bx = b; if (out[B + b] > out[B + by]) by = b; } p = { bx, by, x: binCenter(bx, B), y: binCenter(by, B), exact: bx === binOf(sc.target.x, B) && by === binOf(sc.target.y, B) }; }
    p.ok = hit(sc.target, p.x, p.y); p.err = Math.hypot(p.x - sc.target.x, p.y - sc.target.y);
    const att = new Float64Array(GC * GC), bgA = F.nbg ? cache.a[N - 1] / F.nbg : 0;
    for (let i = 0; i < GC * GC; i++) att[i] = bgA;
    F.cells.forEach((cl, i) => { att[cl.i] = cache.a[i]; });
    p.att = att; p.px = (cache.inp[m.inD - 2] + 1) / 2 * TW; p.py = (cache.inp[m.inD - 1] + 1) / 2 * TW;
    return p;
  }
  /** Проверка на сценах: попадания, точные корзины, средняя ошибка в пикселях. */
  function rtEval(m, list) {
    const runs = list.map((sc) => Object.assign({ sc }, rtPredict(m, sc)));
    return { n: list.length, hits: runs.filter((q) => q.ok).length, exact: runs.filter((q) => q.exact).length, meanErr: runs.reduce((s, q) => s + q.err, 0) / list.length, runs };
  }

  const API = { WORDS, NW, BINS, RT, RS, TW, GC, CSZ, scene, scenes, demos, tests, hit, features, binOf, binCenter, quantize, quantEval, rtInit, rtForward, rtBackward, lossGrad, rtTrain, rtPredict, rtEval, nParams, adamP };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L31 = API;
})(typeof window !== 'undefined' ? window : globalThis);
