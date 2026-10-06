/* =====================================================================
   l21/engine.js — движок урока 2.1 «Transporter и CLIPort». Без DOM:
   работает в браузере и в Node (для подбора параметров и тестов).
   1) Мини-CLIP: картинки предметов 16×16 и подписи «цвет + форма» учатся
      в одном пространстве контрастной целью (InfoNCE), как CLIP.
   2) Стол сверху 96×96 и сетка действий 24×24 (одна клетка — 4×4 пикселя).
      Карта «где взять» — один свёрточный фильтр 5×5 по сетке (FCN в миниатюре,
      эквивариантен сдвигу), softmax по клеткам. Регрессия координат — MLP по
      всей картинке, как политики части 1.
   3) Укладка по шаблону: вырезку вокруг взятого предмета коррелируют со сценой
      на 36 поворотах (шаг 10°), как transport в Transporter.
   4) CLIPort в миниатюре: карта «что» — сходство окон стола с текстом по мини-CLIP,
      карта «где» — фильтр взятия; итог — их произведение.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- случайность ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- маленькая полносвязная сеть: tanh, Adam ---------- */
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
  function adamStep(P, G, M, V, t, lr, bs) {
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
  }
  function adam(m, lr, bs) { m.t++; for (const l of m.L) { adamStep(l.w, l.gw, l.mw, l.vw, m.t, lr, bs); adamStep(l.bias, l.gb, l.mb, l.vb, m.t, lr, bs); } }
  function finish(gen, onEv) { for (;;) { const r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); } }

  /* ---------- предметы: цвета, формы, слова ---------- */
  const COLORS = [
    { id: 'red', rgb: [0.86, 0.22, 0.2], m: 'красный', f: 'красная' },
    { id: 'blue', rgb: [0.2, 0.42, 0.86], m: 'синий', f: 'синяя' },
    { id: 'green', rgb: [0.2, 0.66, 0.3], m: 'зелёный', f: 'зелёная' },
    { id: 'yellow', rgb: [0.95, 0.78, 0.16], m: 'жёлтый', f: 'жёлтая' },
    { id: 'purple', rgb: [0.56, 0.3, 0.78], m: 'фиолетовый', f: 'фиолетовая' },
    { id: 'orange', rgb: [0.96, 0.52, 0.16], m: 'оранжевый', f: 'оранжевая' },
  ];
  const SHAPES = [
    { id: 'cube', name: 'кубик', g: 'm' }, { id: 'ball', name: 'мяч', g: 'm' },
    { id: 'bowl', name: 'миска', g: 'f' }, { id: 'can', name: 'банка', g: 'f' },
  ];
  const CI = Object.fromEntries(COLORS.map((c, i) => [c.id, i])), SI = Object.fromEntries(SHAPES.map((s, i) => [s.id, i]));
  const VOCAB = COLORS.map((c) => c.id).concat(SHAPES.map((s) => s.id));
  const phrase = (color, shape) => { const c = COLORS[CI[color]], s = SHAPES[SI[shape]]; return `${s.g === 'f' ? c.f : c.m} ${s.name}`; };
  const BG = [0.93, 0.92, 0.89];
  /** Есть ли предмет формы shape в точке (dx, dy) относительно центра; R — радиус в пикселях. */
  function inShape(shape, dx, dy, R) {
    const ax = Math.abs(dx), ay = Math.abs(dy), d = Math.hypot(dx, dy);
    if (shape === 'cube') return ax <= R * 0.8 && ay <= R * 0.8;
    if (shape === 'ball') return d <= R * 0.9;
    if (shape === 'bowl') return d <= R && d >= R * 0.55;
    return ax <= R * 0.5 && ay <= R;                        // банка: высокий прямоугольник
  }
  /** Нарисовать предмет в картинку img (ширина Wd) с центром (cx, cy). */
  function paint(img, Wd, Hd, color, shape, cx, cy, R, r, noise) {
    const rgb = COLORS[CI[color]].rgb, x0 = Math.floor(cx - R - 1), x1 = Math.ceil(cx + R + 1), y0 = Math.floor(cy - R - 1), y1 = Math.ceil(cy + R + 1);
    for (let y = Math.max(0, y0); y <= Math.min(Hd - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(Wd - 1, x1); x++) {
      if (!inShape(shape, x + 0.5 - cx, y + 0.5 - cy, R)) continue;
      const o = (y * Wd + x) * 3; for (let c = 0; c < 3; c++) img[o + c] = clamp(rgb[c] + (r ? randn(r) * (noise || 0) : 0), 0, 1);
    }
  }
  function blank(Wd, Hd, r, noise) { const img = new Float32Array(Wd * Hd * 3); for (let i = 0; i < Wd * Hd; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = clamp(BG[c] + (r ? randn(r) * (noise || 0) : 0), 0, 1); return img; }

  /* ---------- 1. мини-CLIP ---------- */
  const IS = 16, ID = IS * IS * 3, EMB = 16;
  /** Картинка одного предмета 16×16 со случайным сдвигом, размером и шумом. */
  function icon(color, shape, r) {
    const img = blank(IS, IS, r, 0.02), R = 5.2 + r() * 1.3;
    paint(img, IS, IS, color, shape, IS / 2 + (r() - 0.5) * 3, IS / 2 + (r() - 0.5) * 3, R, r, 0.04);
    return img;
  }
  const HOLD = [['purple', 'cube']];                         // сочетание, которого нет в обучении
  const isHeld = (c, s) => HOLD.some(([hc, hs]) => hc === c && hs === s);
  function clipInit(seed) {
    const r = rng(seed || 7), E = new Float64Array(VOCAB.length * EMB);
    for (let i = 0; i < E.length; i++) E[i] = randn(r) * 0.5;
    return { img: net([ID, 48, EMB], (seed || 7) + 1), E, gE: new Float64Array(E.length), mE: new Float64Array(E.length), vE: new Float64Array(E.length), t: 0, tau: 0.1, steps: 0 };
  }
  const tokens = (color, shape) => [VOCAB.indexOf(color), VOCAB.indexOf(shape)];
  function textVec(cl, toks) { const v = new Float64Array(EMB); for (const t of toks) for (let k = 0; k < EMB; k++) v[k] += cl.E[t * EMB + k]; return v; }
  const norm = (v) => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s) || 1; };
  function unit(v) { const n = norm(v), u = new Float64Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n; return u; }
  function embedImage(cl, img) { const x = Float64Array.from(img); return unit(fwd(cl.img, x)); }
  function embedText(cl, toks) { return unit(textVec(cl, toks)); }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  /** Все пары «цвет — форма», кроме отложенных; batch — сколько разных пар в пакете. */
  function clipPairs(withHeld) { const out = []; for (const c of COLORS) for (const s of SHAPES) if (withHeld || !isHeld(c.id, s.id)) out.push([c.id, s.id]); return out; }
  /** Обучение контрастной целью. Генератор: отдаёт прогресс, в конце — модель. */
  function* clipTrain(cl, o) {
    o = o || {}; const r = rng((o.seed || 11) + cl.steps), iters = o.iters || 600, B = o.batch || 16, lr = o.lr || 0.0007, lrE = o.lrE || 0.01, pairs = clipPairs(false);
    for (let it = 0; it < iters; it++) {
      // пакет: B разных пар, у каждой своя картинка
      const idx = pairs.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const batch = idx.slice(0, B).map((i) => pairs[i]);
      const imgs = batch.map(([c, s]) => icon(c, s, r)), U = [], Un = [], V = [], Vn = [];
      for (const im of imgs) { const u = Float64Array.from(fwd(cl.img, Float64Array.from(im))); U.push(u); Un.push(unit(u)); }
      for (const [c, s] of batch) { const v = textVec(cl, tokens(c, s)); V.push(v); Vn.push(unit(v)); }
      // логиты и градиент симметричной InfoNCE
      const Lg = batch.map((_, i) => batch.map((__, j) => dot(Un[i], Vn[j]) / cl.tau));
      const dLg = batch.map(() => new Float64Array(B)); let loss = 0;
      for (let i = 0; i < B; i++) { const mx = Math.max(...Lg[i]); let z = 0; for (let j = 0; j < B; j++) z += Math.exp(Lg[i][j] - mx); for (let j = 0; j < B; j++) { const p = Math.exp(Lg[i][j] - mx) / z; dLg[i][j] += (p - (i === j ? 1 : 0)) / (2 * B); } loss -= (Lg[i][i] - mx - Math.log(z)) / (2 * B); }
      for (let j = 0; j < B; j++) { let mx = -1e9; for (let i = 0; i < B; i++) mx = Math.max(mx, Lg[i][j]); let z = 0; for (let i = 0; i < B; i++) z += Math.exp(Lg[i][j] - mx); for (let i = 0; i < B; i++) { const p = Math.exp(Lg[i][j] - mx) / z; dLg[i][j] += (p - (i === j ? 1 : 0)) / (2 * B); } loss -= (Lg[j][j] - mx - Math.log(z)) / (2 * B); }
      // градиенты по нормированным векторам и через нормировку
      for (let i = 0; i < B; i++) {
        const gu = new Float64Array(EMB); for (let j = 0; j < B; j++) for (let k = 0; k < EMB; k++) gu[k] += dLg[i][j] * Vn[j][k] / cl.tau;
        const n = norm(U[i]), pr = dot(Un[i], gu), g = new Float64Array(EMB); for (let k = 0; k < EMB; k++) g[k] = (gu[k] - Un[i][k] * pr) / n;
        fwd(cl.img, Float64Array.from(imgs[i])); bwd(cl.img, g);
      }
      for (let j = 0; j < B; j++) {
        const gv = new Float64Array(EMB); for (let i = 0; i < B; i++) for (let k = 0; k < EMB; k++) gv[k] += dLg[i][j] * Un[i][k] / cl.tau;
        const n = norm(V[j]), pr = dot(Vn[j], gv); const toks = tokens(...batch[j]);
        for (const t of toks) for (let k = 0; k < EMB; k++) cl.gE[t * EMB + k] += (gv[k] - Vn[j][k] * pr) / n;
      }
      adam(cl.img, lr, 1); cl.t++; adamStep(cl.E, cl.gE, cl.mE, cl.vE, cl.t, lrE, 1); cl.steps++;
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss, steps: cl.steps };
    }
    return cl;
  }
  /** Матрица сходства для показа: n пар, своя картинка у каждой; сколько строк верно угадано. */
  function clipMatrix(cl, list, seed) {
    const r = rng(seed || 5), imgs = list.map(([c, s]) => icon(c, s, r)), U = imgs.map((im) => embedImage(cl, im)), V = list.map(([c, s]) => embedText(cl, tokens(c, s)));
    const M = U.map((u) => V.map((v) => dot(u, v)));
    let hits = 0; for (let i = 0; i < M.length; i++) { const row = M[i]; if (row.indexOf(Math.max(...row)) === i) hits++; }
    return { M, imgs, hits, n: list.length };
  }
  /** Точность на всех парах, по nPer картинок на пару: подпись находит свою картинку среди всех. */
  function clipAccuracy(cl, seed, nPer) {
    const r = rng(seed || 21), pairs = clipPairs(true), items = [];
    for (const p of pairs) for (let k = 0; k < (nPer || 2); k++) items.push({ p, u: embedImage(cl, icon(p[0], p[1], r)) });
    let ok = 0, okHeld = 0, nHeld = 0;
    for (const it of items) {
      let best = -1e9, bi = null; for (const q of pairs) { const s = dot(it.u, embedText(cl, tokens(q[0], q[1]))); if (s > best) { best = s; bi = q; } }
      const hit = bi[0] === it.p[0] && bi[1] === it.p[1]; if (isHeld(...it.p)) { nHeld++; if (hit) okHeld++; } else if (hit) ok++;
    }
    return { acc: ok / (items.length - nHeld), held: nHeld ? okHeld / nHeld : null };
  }
  /** Поиск по тексту среди картинок галереи: сходства по убыванию. */
  function clipSearch(cl, gallery, toks) { const v = embedText(cl, toks); return gallery.map((g, i) => ({ i, s: dot(embedImage(cl, g.img), v) })).sort((a, b) => b.s - a.s); }


  /* ---------- 2. стол сверху: картинка 96×96 и сетка действий 24×24 ---------- */
  const TW = 96, G = 24, CELL = TW / G, RT = 5.6;           // радиус предмета на столе — как на картинках мини-CLIP
  /** Сцена: предметы spec ([{color, shape}]) в случайных местах без наложений. */
  function tableScene(spec, seed, o) {
    o = o || {}; const r = rng(seed), objs = [], m = o.margin || 10;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < (o.gap || 19)));
      objs.push({ color: it.color, shape: it.shape, x, y });
    }
    const img = blank(TW, TW, r, 0.015);
    for (const q of objs) paint(img, TW, TW, q.color, q.shape, q.x, q.y, RT, r, 0.03);
    return { img, objs, grid: toGrid(img) };
  }
  /** Сетка действий: среднее по клеткам 4×4. */
  function toGrid(img) {
    const g = new Float64Array(G * G * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / CELL) * G + Math.floor(x / CELL)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (CELL * CELL); }
    return g;
  }
  const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, G - 1) * G + clamp(Math.floor(x / CELL), 0, G - 1);
  const cellXY = (i) => ({ x: (i % G + 0.5) * CELL, y: (Math.floor(i / G) + 0.5) * CELL });
  /** Попал ли захват (точка в пикселях) в предмет: ближе 0,8 радиуса к центру. */
  const hitObj = (q, x, y) => Math.hypot(q.x - x, q.y - y) < RT * 0.85;

  /* Карта «где взять»: один фильтр K×K×3 по сетке, softmax по клеткам (FCN в миниатюре). */
  const K = 5, KH = 2, KD = K * K * 3;
  function patch(grid, i, out) {
    const cx = i % G, cy = Math.floor(i / G); let n = 0;
    for (let dy = -KH; dy <= KH; dy++) for (let dx = -KH; dx <= KH; dx++) {
      const x = cx + dx, y = cy + dy, inside = x >= 0 && y >= 0 && x < G && y < G, o = (y * G + x) * 3;
      for (let c = 0; c < 3; c++) out[n++] = (inside ? grid[o + c] : BG[c]) - BG[c];   // фон стола — ноль
    }
    return out;
  }
  function pickInit(seed) { const r = rng(seed || 4), w = new Float64Array(KD); for (let i = 0; i < KD; i++) w[i] = randn(r) * 0.05; return { w, b: 0, gw: new Float64Array(KD), mw: new Float64Array(KD), vw: new Float64Array(KD), t: 0 }; }
  function pickScores(pm, grid, extra) {
    const s = new Float64Array(G * G), p = new Float64Array(KD);
    for (let i = 0; i < G * G; i++) { patch(grid, i, p); let v = pm.b; for (let k = 0; k < KD; k++) v += pm.w[k] * p[k]; if (extra) for (let k = 0; k < KD; k++) v += extra[k] * p[k]; s[i] = v; }
    return s;
  }
  function softmax(s, T) { let mx = -1e9; for (const v of s) mx = Math.max(mx, v); const p = new Float64Array(s.length); let z = 0; for (let i = 0; i < s.length; i++) { p[i] = Math.exp((s[i] - mx) / (T || 1)); z += p[i]; } for (let i = 0; i < s.length; i++) p[i] /= z; return p; }
  const argmax = (a) => { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi; };
  /** Обучение по демонстрациям [{grid, target}] — перекрёстная энтропия по клеткам. */
  function* pickTrain(pm, demos, o) {
    o = o || {}; const iters = o.iters || 120, lr = o.lr || 0.03, p = new Float64Array(KD);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (const d of demos) {
        const s = pickScores(pm, d.grid), pr = softmax(s); loss -= Math.log(pr[d.target] + 1e-12) / demos.length;
        for (let i = 0; i < G * G; i++) { const g = pr[i] - (i === d.target ? 1 : 0); if (Math.abs(g) < 1e-6) continue; patch(d.grid, i, p); for (let k = 0; k < KD; k++) pm.gw[k] += g * p[k]; }
      }
      pm.t++; adamStep(pm.w, pm.gw, pm.mw, pm.vw, pm.t, lr, demos.length);
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return pm;
  }
  /** Регрессия координат: вся сетка → (x, y), как политики части 1. */
  function* regTrain(demos, o) {
    o = o || {}; const m = net([G * G * 3, 32, 2], o.seed || 9), iters = o.iters || 300, lr = o.lr || 0.003, g = new Float64Array(2);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (const d of demos) {
        const t = cellXY(d.target), y = fwd(m, d.grid), tx = t.x / TW * 2 - 1, ty = t.y / TW * 2 - 1;
        g[0] = 2 * (y[0] - tx); g[1] = 2 * (y[1] - ty); loss += ((y[0] - tx) ** 2 + (y[1] - ty) ** 2) / demos.length; bwd(m, g);
      }
      adam(m, lr, demos.length);
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  function regPredict(m, grid) { const y = fwd(m, grid); return { x: (y[0] + 1) / 2 * TW, y: (y[1] + 1) / 2 * TW }; }
  /** Демонстрации и проверка: задача задаёт состав сцены и какой предмет брать. */
  const TASKS = {
    redCube: { spec: [{ color: 'red', shape: 'cube' }, { color: 'blue', shape: 'cube' }, { color: 'green', shape: 'bowl' }, { color: 'yellow', shape: 'ball' }], pick: (objs) => objs.filter((q) => q.color === 'red' && q.shape === 'cube') },
    twoRed: { spec: [{ color: 'red', shape: 'cube' }, { color: 'red', shape: 'cube' }, { color: 'blue', shape: 'cube' }, { color: 'green', shape: 'bowl' }], pick: (objs) => objs.filter((q) => q.color === 'red' && q.shape === 'cube') },
  };
  /** Демонстрация: оператор берёт один из подходящих предметов (если их два — случайный). */
  function demo(task, seed) {
    const T = TASKS[task], sc = tableScene(T.spec, seed), ok = T.pick(sc.objs), r = rng(seed * 31 + 7), q = ok[Math.floor(r() * ok.length)];
    return { grid: sc.grid, target: cellOf(q.x, q.y), scene: sc };
  }
  /** Проверка на n новых сценах: доля попаданий в подходящий предмет. */
  function evalPick(kind, model, task, n, seed0) {
    const T = TASKS[task], runs = [];
    for (let i = 0; i < n; i++) {
      const sc = tableScene(T.spec, (seed0 || 5000) + i), ok = T.pick(sc.objs);
      const p = kind === 'map' ? cellXY(argmax(pickScores(model, sc.grid))) : regPredict(model, sc.grid);
      runs.push({ scene: sc, p, ok: ok.some((q) => hitObj(q, p.x, p.y)) });
    }
    return { runs, rate: runs.filter((q) => q.ok).length / n };
  }


  /* Сцены для команд «возьми <цвет> кубик»: три кубика разных цветов и миска. */
  const SEEN = ['red', 'blue', 'green'];
  function cmdScene(target, seed) {
    const r = rng(seed * 17 + 3), others = COLORS.map((c) => c.id).filter((c) => c !== target);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const spec = [{ color: target, shape: 'cube' }, { color: others[0], shape: 'cube' }, { color: others[1], shape: 'cube' }, { color: others[2], shape: 'bowl' }];
    const sc = tableScene(spec, seed); sc.target = sc.objs[0]; return sc;
  }
  /** Демонстрации робота: команды только с цветами SEEN. */
  function cmdDemos(n, seed0) { const out = []; for (let i = 0; i < n; i++) { const c = SEEN[i % SEEN.length], sc = cmdScene(c, (seed0 || 300) + i); out.push({ word: c, grid: sc.grid, img: sc.img, target: cellOf(sc.target.x, sc.target.y), scene: sc }); } return out; }
  /** Фильтр «где» плюс поправка на каждое слово — язык, выученный только из демонстраций робота. */
  function* condTrain(demos, o) {
    o = o || {}; const base = pickInit(4), words = {}, iters = o.iters || 150, lr = o.lr || 0.03, p = new Float64Array(KD);
    for (const d of demos) if (!words[d.word]) words[d.word] = { w: new Float64Array(KD), g: new Float64Array(KD), m: new Float64Array(KD), v: new Float64Array(KD), t: 0 };
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (const d of demos) {
        const W = words[d.word], s = pickScores(base, d.grid, W.w), pr = softmax(s); loss -= Math.log(pr[d.target] + 1e-12) / demos.length;
        for (let i = 0; i < G * G; i++) { const g = pr[i] - (i === d.target ? 1 : 0); if (Math.abs(g) < 1e-6) continue; patch(d.grid, i, p); for (let k = 0; k < KD; k++) { base.gw[k] += g * p[k]; W.g[k] += g * p[k]; } }
      }
      base.t++; adamStep(base.w, base.gw, base.mw, base.vw, base.t, lr, demos.length);
      for (const W of Object.values(words)) { W.t++; adamStep(W.w, W.g, W.m, W.v, W.t, lr, demos.length); }
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return { base, words };
  }
  const condScores = (cm, grid, word) => pickScores(cm.base, grid, cm.words[word] ? cm.words[word].w : null);
  /* ---------- 3. укладка: поиск вырезки на сцене по 36 поворотам ---------- */
  const PG = 32, PIECE = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];   // уголок из пяти квадратов
  const PSC = 4;                                                          // сторона квадрата — 4 клетки сетки
  const PSET = new Set(PIECE.map(([i, j]) => i + ',' + j));
  const PCX = PIECE.reduce((s2, p) => s2 + p[0] + 0.5, 0) / PIECE.length * PSC, PCY = PIECE.reduce((s2, p) => s2 + p[1] + 0.5, 0) / PIECE.length * PSC;
  /** Клетки детали, повёрнутой на угол a (рад) вокруг её центра: клетка входит, если её центр
   *  после обратного поворота попадает в один из квадратов. Так фигура остаётся сплошной на любом угле. */
  function pieceCells(a) {
    const out = [], c = Math.cos(-a), sn = Math.sin(-a), R = 3 * PSC;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const u = dx * c - dy * sn + PCX, v = dx * sn + dy * c + PCY;
      if (u < 0 || v < 0) continue;
      if (PSET.has(Math.floor(u / PSC) + ',' + Math.floor(v / PSC))) out.push([dx, dy]);
    }
    return out;
  }
  /** Гнездо: признаки φ = +1 в прорези, −1 в стенках вокруг, 0 на столе. */
  function fixture(cx, cy, a) {
    const f = new Float64Array(PG * PG), hole = pieceCells(a);
    for (const [dx, dy] of hole) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < PG && y < PG) f[y * PG + x] = 1; }
    for (const [dx, dy] of hole) for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) { const x = cx + dx + ox, y = cy + dy + oy; if (x >= 0 && y >= 0 && x < PG && y < PG && f[y * PG + x] === 0) f[y * PG + x] = -1; }
    return f;
  }
  /** Корреляция вырезки (деталь, повёрнутая на k·10°) со сценой: карта по всем клеткам. */
  function transportMap(fx, k) {
    const cells = pieceCells(k * Math.PI / 18), m = new Float64Array(PG * PG);
    for (let y = 0; y < PG; y++) for (let x = 0; x < PG; x++) { let s = 0; for (const [dx, dy] of cells) { const u = x + dx, v = y + dy; s += u >= 0 && v >= 0 && u < PG && v < PG ? fx[v * PG + u] : -1; } m[y * PG + x] = s / cells.length; }
    return m;
  }
  /** Лучший поворот и место по всем 36 поворотам. */
  function transportBest(fx) {
    let best = { s: -1e9 };
    for (let k = 0; k < 36; k++) { const m = transportMap(fx, k), i = argmax(m); if (m[i] > best.s) best = { s: m[i], k, i, x: i % PG, y: Math.floor(i / PG) }; }
    return best;
  }

  /* ---------- 4. CLIPort в миниатюре: «что» от мини-CLIP, «где» от фильтра ---------- */
  /** Окно 16×16 вокруг центра клетки i на картинке стола (за краем — фон). */
  function windowAt(img, i) {
    const c = cellXY(i), out = new Float32Array(IS * IS * 3), x0 = Math.round(c.x - IS / 2), y0 = Math.round(c.y - IS / 2);
    for (let y = 0; y < IS; y++) for (let x = 0; x < IS; x++) { const X = x0 + x, Y = y0 + y, o = (y * IS + x) * 3; if (X >= 0 && Y >= 0 && X < TW && Y < TW) { const q = (Y * TW + X) * 3; out[o] = img[q]; out[o + 1] = img[q + 1]; out[o + 2] = img[q + 2]; } else { out[o] = BG[0]; out[o + 1] = BG[1]; out[o + 2] = BG[2]; } }
    return out;
  }
  /** Карта «что»: сходство окна в каждой клетке с текстом по мини-CLIP. */
  function whatMap(cl, img, toks) { const v = embedText(cl, toks), m = new Float64Array(G * G); for (let i = 0; i < G * G; i++) m[i] = dot(embedImage(cl, windowAt(img, i)), v); return m; }
  /** Слияние: log p = log softmax(где) + log softmax(что / τ). */
  function fuse(where, what, tw) {
    const pw = softmax(where), pq = softmax(what, tw || 0.05), s = new Float64Array(G * G);
    for (let i = 0; i < G * G; i++) s[i] = Math.log(pw[i] + 1e-12) + Math.log(pq[i] + 1e-12);
    return s;
  }

  const API = { rng, randn, clamp, net, fwd, bwd, adam, finish, COLORS, SHAPES, VOCAB, CI, SI, phrase, BG, inShape, paint, blank,
    IS, EMB, icon, HOLD, isHeld, clipInit, tokens, embedImage, embedText, dot, clipPairs, clipTrain, clipMatrix, clipAccuracy, clipSearch,
    TW, G, CELL, RT, tableScene, toGrid, cellOf, cellXY, hitObj, K, patch, pickInit, pickScores, softmax, argmax, pickTrain, regTrain, regPredict, TASKS, demo, evalPick,
    PG, PIECE, PSC, pieceCells, fixture, transportMap, transportBest, windowAt, whatMap, fuse, SEEN, cmdScene, cmdDemos, condTrain, condScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L21 = API;
})(typeof window !== 'undefined' ? window : globalThis);
