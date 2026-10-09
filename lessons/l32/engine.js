/* =====================================================================
   l32/engine.js — движок урока 3.2 «Vision-language модели». Без DOM:
   работает в браузере (window.L32) и в Node (module.exports), поверх мира
   стола из урока 2.1 (l21/engine.js: цвета, формы, словарь, иконки 16×16).
   Мини-VLM, которая описывает иконку двумя словами — цвет и форма:
   1) Патчи → токены: иконка 16×16 режется на 16 патчей 4×4, каждый патч —
      линейный слой → вектор, плюс обучаемая позиция. Дальше один блок
      трансформера (внимание из урока 1.6) — мини-ViT.
   2) Контрастное предобучение энкодера (та же цель InfoNCE, что у мини-CLIP
      в 2.1): среднее токенов картинки сближается с суммой векторов слов.
   3) Проектор — линейный слой из пространства энкодера в пространство
      токенов языковой модели (как в LLaVA и PaliGemma).
   4) Крошечная языковая модель: один блок трансформера с префиксным
      вниманием (как в PaliGemma): токены картинки видят друг друга целиком,
      слова ответа — только картинку и предыдущие слова. Выход — через те же
      векторы слов (tied embeddings), ответ порождается слово за словом:
      цвет, форма, <eos>.
   Обучение — генераторы с yield, чтобы гонять кусками между кадрами.
   Все случайности — с зерном.
   0) Своя математика: exp, log, tanh, sin, cos и степени в Adam собраны из
      сложений, умножений, деления и корня, чтобы числа лабораторий
      совпадали во всех браузерах. Иконки из урока 2.1 (шум Бокса — Мюллера,
      формы предметов) здесь — копии на этой математике.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, clamp, COLORS, SHAPES, VOCAB, IS, isHeld } = L;

  /* ---------- 0. переносимая математика ----------
     Math.exp, Math.log, Math.tanh, Math.sin, Math.cos, Math.hypot и даже Math.pow в V8
     (Chrome, Node) и JavaScriptCore (Safari, любой браузер на iPhone) иногда расходятся
     в последнем бите. Обучение энкодера с нуля раздувает такую разницу примерно в 10 раз
     за проход, и к концу у модели другие ответы. Здесь функции собраны из сложений,
     умножений, деления и Math.sqrt: по IEEE 754 их результат одинаков везде.
     Отличие от Math.* — около 1e-16 относительно. */
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  const HI = (() => { F64[0] = 1; return U32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
  /** 2^k для целого k от −1022 до 1023. */
  function pow2(k) { U32[LO] = 0; U32[HI] = (k + 1023) << 20; return F64[0]; }
  const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
  const EXPC = []; for (let n = 0, f = 1; n <= 17; n++) { EXPC.push(1 / f); f *= n + 1; }   // 1/n!
  /** e^r − 1 при |r| ≤ 1: ряд Тейлора по схеме Горнера. */
  function expm1Small(r) { let p = EXPC[17]; for (let n = 16; n >= 1; n--) p = EXPC[n] + r * p; return r * p; }
  function exp(x) {
    if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
    const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;   // |r| ≤ ln2 / 2
    let p = EXPC[14]; for (let n = 13; n >= 0; n--) p = EXPC[n] + r * p;
    return k < -1022 ? p * pow2(k + 600) * pow2(-600) : p * pow2(k);
  }
  const LOGC = []; for (let j = 1; j <= 25; j += 2) LOGC.push(1 / j);
  function log(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
    let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
    F64[0] = x; e += ((U32[HI] >>> 20) & 0x7ff) - 1023;
    U32[HI] = (U32[HI] & 0x000fffff) | 0x3ff00000; let m = F64[0];           // мантисса в [1, 2)
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    const z = (m - 1) / (m + 1), z2 = z * z; let t = LOGC[LOGC.length - 1];   // ln m = 2 (z + z³/3 + z⁵/5 + …)
    for (let j = LOGC.length - 2; j >= 0; j--) t = LOGC[j] + z2 * t;
    return e * LN2_HI + (e * LN2_LO + 2 * z * t);
  }
  function tanh(x) {
    const ax = x < 0 ? -x : x; let v;
    if (ax > 20) v = 1; else if (ax < 0.5) { const e = expm1Small(2 * ax); v = e / (e + 2); } else v = 1 - 2 / (exp(2 * ax) + 1);
    return x < 0 ? -v : v;
  }
  const PIO2_HI = 1.57079632673412561417e+00, PIO2_LO = 6.07710050650619224932e-11, INV_PIO2 = 6.36619772367581382433e-01;
  const COSC = [], SINC = []; for (let n = 0, f = 1; n <= 21; n++) { (n % 2 ? SINC : COSC).push((n % 4 < 2 ? 1 : -1) / f); f *= n + 1; }
  /** [sin x, cos x] для умеренных x: приведение к |r| ≤ π/4 и ряды Тейлора. */
  function sincos(x) {
    const k = Math.round(x * INV_PIO2), r = (x - k * PIO2_HI) - k * PIO2_LO, r2 = r * r;
    let s = SINC[SINC.length - 1], c = COSC[COSC.length - 1];
    for (let j = SINC.length - 2; j >= 0; j--) s = SINC[j] + r2 * s;
    for (let j = COSC.length - 2; j >= 0; j--) c = COSC[j] + r2 * c;
    s *= r;
    switch (((k % 4) + 4) % 4) { case 0: return [s, c]; case 1: return [c, -s]; case 2: return [-s, -c]; default: return [-c, s]; }
  }
  const sin = (x) => sincos(x)[0], cos = (x) => sincos(x)[1];
  /** b^t для целого t ≥ 0 последовательным умножением (Math.pow в Safari и Chrome округляет по-разному). */
  const POWS = new Map();
  function powInt(b, t) {
    let a = POWS.get(b); if (!a) { a = [1]; POWS.set(b, a); }
    while (a.length <= t) a.push(a[a.length - 1] * b);
    return a[t];
  }
  /** Нормальное случайное число (Бокс — Мюллер), как L21.randn, но на своей математике. */
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * log(u)) * cos(2 * Math.PI * r()); }

  /* ---------- иконки из урока 2.1 — копии на своей математике ---------- */
  const BG = L.BG;
  /** Как L21.inShape: есть ли предмет формы shape в точке (dx, dy) от центра; расстояние — через Math.sqrt. */
  function inShape(shape, dx, dy, R) {
    const ax = Math.abs(dx), ay = Math.abs(dy), d = Math.sqrt(dx * dx + dy * dy);
    if (shape === 'cube') return ax <= R * 0.8 && ay <= R * 0.8;
    if (shape === 'ball') return d <= R * 0.9;
    if (shape === 'bowl') return d <= R && d >= R * 0.55;
    return ax <= R * 0.5 && ay <= R;                        // банка: высокий прямоугольник
  }
  function paint(img, Wd, Hd, color, shape, cx, cy, R, r, noise) {
    const rgb = COLORS[L.CI[color]].rgb, x0 = Math.floor(cx - R - 1), x1 = Math.ceil(cx + R + 1), y0 = Math.floor(cy - R - 1), y1 = Math.ceil(cy + R + 1);
    for (let y = Math.max(0, y0); y <= Math.min(Hd - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(Wd - 1, x1); x++) {
      if (!inShape(shape, x + 0.5 - cx, y + 0.5 - cy, R)) continue;
      const o = (y * Wd + x) * 3; for (let c = 0; c < 3; c++) img[o + c] = clamp(rgb[c] + (r ? randn(r) * (noise || 0) : 0), 0, 1);
    }
  }
  function blank(Wd, Hd, r, noise) { const img = new Float32Array(Wd * Hd * 3); for (let i = 0; i < Wd * Hd; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = clamp(BG[c] + (r ? randn(r) * (noise || 0) : 0), 0, 1); return img; }
  /** Как L21.icon: картинка одного предмета 16×16 со случайным сдвигом, размером и шумом. */
  function icon(color, shape, r) {
    const img = blank(IS, IS, r, 0.02), R = 5.2 + r() * 1.3;
    paint(img, IS, IS, color, shape, IS / 2 + (r() - 0.5) * 3, IS / 2 + (r() - 0.5) * 3, R, r, 0.04);
    return img;
  }

  /* ---------- размеры ---------- */
  const P = 4, NP = (IS / P) * (IS / P), PD = P * P * 3;      // патч 4×4×3 = 48 чисел, 16 патчей
  const DE = 16, DH = 32;                                      // ширина энкодера и его MLP
  const DL = 16, DLH = 32;                                     // ширина языковой модели и её MLP
  const WORDS = VOCAB.slice();                                 // 6 цветов + 4 формы
  const BOS = WORDS.length, EOS = WORDS.length + 1, V = WORDS.length + 2;
  const TOK = WORDS.concat(['<bos>', '<eos>']);
  const NT = 3, T = NP + NT;                                   // текстовых позиций: <bos>, цвет, форма; всего токенов
  const wid = (w) => WORDS.indexOf(w);

  /* ---------- параметры и Adam ---------- */
  function param(n, r, scale) { const w = new Float64Array(n); if (scale) for (let i = 0; i < n; i++) w[i] = randn(r) * scale; return { w, g: new Float64Array(n), m: new Float64Array(n), v: new Float64Array(n) }; }
  function adamStep(p, lr, t, bs) {
    const b1 = 0.9, b2 = 0.999, c1 = 1 - powInt(b1, t), c2 = 1 - powInt(b2, t), { w, g, m, v } = p;
    for (let i = 0; i < w.length; i++) { const gi = g[i] / bs; m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi; w[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8); g[i] = 0; }
  }
  const zero = (ps) => { for (const p of ps) p.g.fill(0); };

  /* ---------- слои: линейный, LayerNorm, внимание, блок трансформера ----------
     Каждый forward возвращает «ленту» с активациями, backward принимает её и
     градиент выхода, прибавляет градиенты к параметрам и возвращает градиент входа. */
  /** Линейный слой над n токенами: X (n×a) → Y (n×b). */
  function linF(lin, X, n) { const { a, b } = lin, w = lin.W.w, bias = lin.B.w, Y = new Float64Array(n * b); for (let t = 0; t < n; t++) { const xo = t * a, yo = t * b; for (let j = 0; j < b; j++) Y[yo + j] = bias[j]; for (let i = 0; i < a; i++) { const xi = X[xo + i]; if (xi === 0) continue; const wo = i * b; for (let j = 0; j < b; j++) Y[yo + j] += xi * w[wo + j]; } } return Y; }
  function linB(lin, X, n, dY) { const { a, b } = lin, w = lin.W.w, gw = lin.W.g, gb = lin.B.g, dX = new Float64Array(n * a); for (let t = 0; t < n; t++) { const xo = t * a, yo = t * b; for (let j = 0; j < b; j++) gb[j] += dY[yo + j]; for (let i = 0; i < a; i++) { const xi = X[xo + i], wo = i * b; let s = 0; for (let j = 0; j < b; j++) { const d = dY[yo + j]; gw[wo + j] += xi * d; s += w[wo + j] * d; } dX[xo + i] = s; } } return dX; }
  function linear(a, b, r, scale) { return { a, b, W: param(a * b, r, scale == null ? Math.sqrt(1 / a) : scale), B: param(b) }; }
  /** LayerNorm без аффинных параметров по каждому токену. */
  function lnF(X, n, d) { const Y = new Float64Array(n * d), inv = new Float64Array(n); for (let t = 0; t < n; t++) { const o = t * d; let mu = 0; for (let i = 0; i < d; i++) mu += X[o + i]; mu /= d; let s2 = 0; for (let i = 0; i < d; i++) { const z = X[o + i] - mu; s2 += z * z; } const iv = 1 / Math.sqrt(s2 / d + 1e-5); inv[t] = iv; for (let i = 0; i < d; i++) Y[o + i] = (X[o + i] - mu) * iv; } return { Y, inv }; }
  function lnB(tape, n, d, dY) { const { Y, inv } = tape, dX = new Float64Array(n * d); for (let t = 0; t < n; t++) { const o = t * d; let sdy = 0, sdyy = 0; for (let i = 0; i < d; i++) { sdy += dY[o + i]; sdyy += dY[o + i] * Y[o + i]; } for (let i = 0; i < d; i++) dX[o + i] = inv[t] * (dY[o + i] - sdy / d - Y[o + i] * sdyy / d); } return dX; }
  const gelu = (x) => 0.5 * x * (1 + tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  const dgelu = (x) => { const u = 0.7978845608 * (x + 0.044715 * x * x * x), th = tanh(u); return 0.5 * (1 + th) + 0.5 * x * (1 - th * th) * 0.7978845608 * (1 + 3 * 0.044715 * x * x); };
  /** Блок: x + Wo·Attn(LN(x)) затем + MLP(LN(·)). mask(i, j) → можно ли токену i смотреть на j. */
  function block(d, dh, r) { return { d, dh, q: linear(d, d, r), k: linear(d, d, r), v: linear(d, d, r), o: linear(d, d, r), f1: linear(d, dh, r), f2: linear(dh, d, r) }; }
  function blockF(bl, X, n, mask) {
    const d = bl.d, dh = bl.dh, sc = 1 / Math.sqrt(d);
    const ln1 = lnF(X, n, d), Q = linF(bl.q, ln1.Y, n), K = linF(bl.k, ln1.Y, n), Vv = linF(bl.v, ln1.Y, n);
    const A = new Float64Array(n * n), Z = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      let mx = -1e9; const row = i * n;
      for (let j = 0; j < n; j++) { if (!mask(i, j)) { A[row + j] = -Infinity; continue; } let s = 0; for (let c = 0; c < d; c++) s += Q[i * d + c] * K[j * d + c]; s *= sc; A[row + j] = s; if (s > mx) mx = s; }
      let z = 0; for (let j = 0; j < n; j++) { const e = A[row + j] === -Infinity ? 0 : exp(A[row + j] - mx); A[row + j] = e; z += e; }
      for (let j = 0; j < n; j++) { A[row + j] /= z; const a = A[row + j]; if (a === 0) continue; for (let c = 0; c < d; c++) Z[i * d + c] += a * Vv[j * d + c]; }
    }
    const O = linF(bl.o, Z, n), H = new Float64Array(n * d); for (let i = 0; i < n * d; i++) H[i] = X[i] + O[i];
    const ln2 = lnF(H, n, d), U = linF(bl.f1, ln2.Y, n), G = new Float64Array(n * dh); for (let i = 0; i < n * dh; i++) G[i] = gelu(U[i]);
    const F = linF(bl.f2, G, n), Y = new Float64Array(n * d); for (let i = 0; i < n * d; i++) Y[i] = H[i] + F[i];
    return { Y, tape: { X, ln1, Q, K, Vv, A, Z, H, ln2, U, G, n } };
  }
  function blockB(bl, tape, dY) {
    const d = bl.d, dh = bl.dh, n = tape.n, sc = 1 / Math.sqrt(d);
    const dG = linB(bl.f2, tape.G, n, dY), dU = new Float64Array(n * dh); for (let i = 0; i < n * dh; i++) dU[i] = dG[i] * dgelu(tape.U[i]);
    const dLn2 = linB(bl.f1, tape.ln2.Y, n, dU), dH = lnB(tape.ln2, n, d, dLn2); for (let i = 0; i < n * d; i++) dH[i] += dY[i];
    const dZ = linB(bl.o, tape.Z, n, dH), dQ = new Float64Array(n * d), dK = new Float64Array(n * d), dV = new Float64Array(n * d);
    const { Q, K, Vv, A } = tape;
    for (let i = 0; i < n; i++) {
      const row = i * n, dA = new Float64Array(n); let dot = 0;
      for (let j = 0; j < n; j++) { const a = A[row + j]; if (a === 0) continue; let s = 0; for (let c = 0; c < d; c++) { s += dZ[i * d + c] * Vv[j * d + c]; dV[j * d + c] += a * dZ[i * d + c]; } dA[j] = s; dot += a * s; }
      for (let j = 0; j < n; j++) { const a = A[row + j]; if (a === 0) continue; const ds = a * (dA[j] - dot) * sc; for (let c = 0; c < d; c++) { dQ[i * d + c] += ds * K[j * d + c]; dK[j * d + c] += ds * Q[i * d + c]; } }
    }
    const dLn1 = linB(bl.q, tape.ln1.Y, n, dQ), t2 = linB(bl.k, tape.ln1.Y, n, dK), t3 = linB(bl.v, tape.ln1.Y, n, dV);
    for (let i = 0; i < n * d; i++) dLn1[i] += t2[i] + t3[i];
    const dX = lnB(tape.ln1, n, d, dLn1); for (let i = 0; i < n * d; i++) dX[i] += dH[i];
    return dX;
  }
  const blockParams = (bl) => [bl.q.W, bl.q.B, bl.k.W, bl.k.B, bl.v.W, bl.v.B, bl.o.W, bl.o.B, bl.f1.W, bl.f1.B, bl.f2.W, bl.f2.B];
  const FULL = () => true, PREFIX = (i, j) => j < NP || j <= i;   // префиксное внимание: картинка видна всем, слова — причинно

  /* ---------- 1. патчи → токены: мини-ViT ---------- */
  /** Иконка 16×16×3 → 16 патчей по 48 чисел (построчно, слева направо, сверху вниз). */
  function patchify(img) {
    const out = new Float64Array(NP * PD), G = IS / P;
    for (let p = 0; p < NP; p++) { const px = (p % G) * P, py = Math.floor(p / G) * P; let k = 0; for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) { const o = ((py + y) * IS + px + x) * 3; out[p * PD + k++] = img[o] - 0.5; out[p * PD + k++] = img[o + 1] - 0.5; out[p * PD + k++] = img[o + 2] - 0.5; } }
    return out;
  }
  /** Перестановка патчей: perm[p] — какой исходный патч встаёт на место p. */
  function permutePatches(patches, perm) { const out = new Float64Array(patches.length); for (let p = 0; p < NP; p++) out.set(patches.subarray(perm[p] * PD, perm[p] * PD + PD), p * PD); return out; }
  function encInit(r) { return { emb: linear(PD, DE, r), pos: param(NP * DE, r, 0.3), blk: block(DE, DH, r) }; }
  const encParams = (e) => [e.emb.W, e.emb.B, e.pos].concat(blockParams(e.blk));
  /** Патчи → токены энкодера (16×DE) и среднее по токенам; o.noPos — без позиционных векторов. */
  function encF(enc, patches, o) {
    const E = linF(enc.emb, patches, NP), X = new Float64Array(NP * DE), noPos = o && o.noPos;
    for (let i = 0; i < NP * DE; i++) X[i] = E[i] + (noPos ? 0 : enc.pos.w[i]);
    const b = blockF(enc.blk, X, NP, FULL), pooled = new Float64Array(DE);
    for (let p = 0; p < NP; p++) for (let c = 0; c < DE; c++) pooled[c] += b.Y[p * DE + c] / NP;
    return { tokens: b.Y, pooled, emb: E, tape: { patches, b, noPos } };
  }
  function encB(enc, tape, dTokens) {
    const dX = blockB(enc.blk, tape.b.tape, dTokens);
    if (!tape.noPos) for (let i = 0; i < NP * DE; i++) enc.pos.g[i] += dX[i];
    return linB(enc.emb, tape.patches, NP, dX);
  }
  const norm = (v) => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s) || 1; };
  const unit = (v) => { const n = norm(v), u = new Float64Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n; return u; };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  /* === продолжение: модель, предобучение, обучение, порождение === */

  /* ---------- 2. модель: энкодер, проектор, языковая модель ---------- */
  function vlmInit(seed) {
    const r = rng(seed || 7);
    return { seed: seed || 7, enc: encInit(r), Ec: param(WORDS.length * DE, r, 0.5), tau: 0.1,
      proj: linear(DE, DL, r), lm: { E: param(V * DL, r, 0.5), pos: param(NT * DL, r, 0.3), blk: block(DL, DLH, r) },
      t: 0, steps: { enc: 0, lm: 0, vlm: 0 }, encFrozen: false, encPretrained: false, snapshots: {} };
  }
  const lmParams = (lm) => [lm.E, lm.pos].concat(blockParams(lm.blk));
  const projParams = (m) => [m.proj.W, m.proj.B];
  function textVec(m, c, s) { const v = new Float64Array(DE), E = m.Ec.w, a = wid(c) * DE, b = wid(s) * DE; for (let k = 0; k < DE; k++) v[k] = E[a + k] + E[b + k]; return v; }
  /** Пары «цвет — форма» для обучения; withHeld — вместе с отложенным сочетанием. */
  function pairs(withHeld) { const out = []; for (const c of COLORS) for (const s of SHAPES) if (withHeld || !isHeld(c.id, s.id)) out.push([c.id, s.id]); return out; }
  const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** Контрастное предобучение энкодера (InfoNCE, как мини-CLIP в 2.1): среднее токенов картинки ↔ сумма векторов слов.
   *  Поток картинок — «интернет» энкодера: все 24 сочетания, если o.withHeld !== false. */
  function* pretrainEncoder(m, o) {
    o = o || {}; const iters = o.iters || 400, B = o.batch || 16, lr = o.lr || 0.002, lrE = o.lrE || 0.01, r = rng((o.seed || 11) + m.steps.enc), pr = pairs(o.withHeld !== false);
    const ps = encParams(m.enc);
    for (let it = 0; it < iters; it++) {
      const batch = shuffle(pr.map((_, i) => i), r).slice(0, B).map((i) => pr[i]);
      const F = batch.map(([c, s]) => encF(m.enc, patchify(icon(c, s, r)))), U = F.map((f) => f.pooled), Un = U.map(unit);
      const Vt = batch.map(([c, s]) => textVec(m, c, s)), Vn = Vt.map(unit);
      const Lg = Un.map((u) => Vn.map((v) => dot(u, v) / m.tau)), dLg = batch.map(() => new Float64Array(B)); let loss = 0;
      for (let i = 0; i < B; i++) { const mx = Math.max(...Lg[i]); let z = 0; for (let j = 0; j < B; j++) z += exp(Lg[i][j] - mx); for (let j = 0; j < B; j++) dLg[i][j] += (exp(Lg[i][j] - mx) / z - (i === j ? 1 : 0)) / (2 * B); loss -= (Lg[i][i] - mx - log(z)) / (2 * B); }
      for (let j = 0; j < B; j++) { let mx = -1e9; for (let i = 0; i < B; i++) mx = Math.max(mx, Lg[i][j]); let z = 0; for (let i = 0; i < B; i++) z += exp(Lg[i][j] - mx); for (let i = 0; i < B; i++) dLg[i][j] += (exp(Lg[i][j] - mx) / z - (i === j ? 1 : 0)) / (2 * B); loss -= (Lg[j][j] - mx - log(z)) / (2 * B); }
      for (let i = 0; i < B; i++) {
        const gu = new Float64Array(DE); for (let j = 0; j < B; j++) for (let k = 0; k < DE; k++) gu[k] += dLg[i][j] * Vn[j][k] / m.tau;
        const n = norm(U[i]), pj = dot(Un[i], gu), dTok = new Float64Array(NP * DE);
        for (let k = 0; k < DE; k++) { const g = (gu[k] - Un[i][k] * pj) / n / NP; for (let p = 0; p < NP; p++) dTok[p * DE + k] = g; }
        encB(m.enc, F[i].tape, dTok);
      }
      for (let j = 0; j < B; j++) {
        const gv = new Float64Array(DE); for (let i = 0; i < B; i++) for (let k = 0; k < DE; k++) gv[k] += dLg[i][j] * Un[i][k] / m.tau;
        const n = norm(Vt[j]), pj = dot(Vn[j], gv), [c, s] = batch[j];
        for (const w of [wid(c), wid(s)]) for (let k = 0; k < DE; k++) m.Ec.g[w * DE + k] += (gv[k] - Vn[j][k] * pj) / n;
      }
      m.steps.enc++; for (const p of ps) adamStep(p, lr, m.steps.enc, 1); adamStep(m.Ec, lrE, m.steps.enc, 1);
      if (it % 10 === 0 || it === iters - 1) yield { kind: 'enc', it, iters, loss, steps: m.steps.enc };
    }
    m.encPretrained = true; return m;
  }

  /* ---------- 3. языковая модель с префиксным вниманием ---------- */
  const CAUSAL = (i, j) => j <= i;
  /** Прямой проход LM: imgTok — токены картинки после проектора (NP×DL) или null; words — текстовые токены (первый — <bos>). */
  function lmF(m, imgTok, words) {
    const lm = m.lm, nImg = imgTok ? NP : 0, n = nImg + words.length, X = new Float64Array(n * DL);
    if (imgTok) X.set(imgTok, 0);
    words.forEach((w, t) => { const o = (nImg + t) * DL, e = w * DL, q = t * DL; for (let c = 0; c < DL; c++) X[o + c] = lm.E.w[e + c] + lm.pos.w[q + c]; });
    const b = blockF(lm.blk, X, n, imgTok ? PREFIX : CAUSAL), nt = words.length, Ht = new Float64Array(nt * DL);
    Ht.set(b.Y.subarray(nImg * DL, n * DL));
    const ln = lnF(Ht, nt, DL), logits = new Float64Array(nt * V), probs = new Float64Array(nt * V);
    for (let t = 0; t < nt; t++) { let mx = -1e9; for (let w = 0; w < V; w++) { let s = 0; for (let c = 0; c < DL; c++) s += ln.Y[t * DL + c] * lm.E.w[w * DL + c]; logits[t * V + w] = s; if (s > mx) mx = s; } let z = 0; for (let w = 0; w < V; w++) { probs[t * V + w] = exp(logits[t * V + w] - mx); z += probs[t * V + w]; } for (let w = 0; w < V; w++) probs[t * V + w] /= z; }
    return { probs, h: ln.Y, tape: { b, ln, nImg, n, nt, words } };
  }
  /** Обратный проход от перекрёстной энтропии по целям targets[t]; возвращает градиент по токенам картинки (или null). Потери усредняются по позициям. */
  function lmB(m, out, targets) {
    const lm = m.lm, { b, ln, nImg, n, nt, words } = out.tape, dLn = new Float64Array(nt * DL); let loss = 0;
    for (let t = 0; t < nt; t++) for (let w = 0; w < V; w++) { const p = out.probs[t * V + w], g = (p - (w === targets[t] ? 1 : 0)) / nt; if (w === targets[t]) loss -= log(p + 1e-12) / nt; for (let c = 0; c < DL; c++) { dLn[t * DL + c] += g * lm.E.w[w * DL + c]; lm.E.g[w * DL + c] += g * ln.Y[t * DL + c]; } }
    const dHt = lnB(ln, nt, DL, dLn), dY = new Float64Array(n * DL); dY.set(dHt, nImg * DL);
    const dX = blockB(lm.blk, b.tape, dY);
    words.forEach((w, t) => { const o = (nImg + t) * DL; for (let c = 0; c < DL; c++) { lm.E.g[w * DL + c] += dX[o + c]; lm.pos.g[t * DL + c] += dX[o + c]; } });
    return { loss, dImg: nImg ? dX.subarray(0, NP * DL) : null };
  }
  /** Предобучение языковой модели на тексте: подписи «цвет форма» без картинок — что идёт за чем. */
  function* pretrainLM(m, o) {
    o = o || {}; const iters = o.iters || 150, lr = o.lr || 0.01, pr = pairs(false), ps = lmParams(m.lm);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (const [c, s] of pr) { const out = lmF(m, null, [BOS, wid(c), wid(s)]); loss += lmB(m, out, [wid(c), wid(s), EOS]).loss / pr.length; }
      m.steps.lm++; for (const p of ps) adamStep(p, lr, m.steps.lm, pr.length);
      if (it % 10 === 0 || it === iters - 1) yield { kind: 'lm', it, iters, loss };
    }
    return m;
  }

  /* ---------- 4. обучение VLM на подписях к картинкам ---------- */
  /** Набор подписей: n картинок по всем парам, кроме отложенной (withHeld — и с ней). */
  function makeData(n, seed, withHeld) {
    const r = rng(seed || 100), pr = pairs(!!withHeld), out = [];
    for (let i = 0; i < n; i++) { const [c, s] = pr[i % pr.length], img = icon(c, s, r); out.push({ c, s, img, patches: patchify(img), tok: null }); }
    return shuffle(out, rng((seed || 100) + 1));
  }
  function imageTokens(m, patches, encOut) { const e = encOut || encF(m.enc, patches); return { enc: e, img: linF(m.proj, e.tokens, NP) }; }
  /**
   * Обучение на подписях. stage: 'proj' — учится только проектор (энкодер и LM заморожены, как этап 1 LLaVA);
   * 'lm' — проектор и LM, энкодер заморожен (этап 2 LLaVA); 'all' — всё, включая энкодер (с нуля).
   */
  function* trainVLM(m, data, o) {
    o = o || {}; const stage = o.stage || 'lm', epochs = o.epochs || 40, B = o.batch || 10, lr = o.lr || 0.005, r = rng((o.seed || 5) + m.steps.vlm);
    const frozenEnc = stage !== 'all', ps = (stage === 'proj' ? [] : lmParams(m.lm)).concat(projParams(m)).concat(frozenEnc ? [] : encParams(m.enc));
    if (frozenEnc) for (const d of data) if (!d.tok || d.tokFor !== m.enc) { d.tok = encF(m.enc, d.patches).tokens; d.tokFor = m.enc; }
    const idx = data.map((_, i) => i); let seen = 0;
    for (let ep = 0; ep < epochs; ep++) {
      shuffle(idx, r); let loss = 0, hits = 0;
      for (let k = 0; k < idx.length; k += B) {
        const chunk = idx.slice(k, k + B);
        for (const i of chunk) {
          const d = data[i], enc = frozenEnc ? null : encF(m.enc, d.patches), tokens = frozenEnc ? d.tok : enc.tokens;
          const img = linF(m.proj, tokens, NP), out = lmF(m, img, [BOS, wid(d.c), wid(d.s)]), tg = [wid(d.c), wid(d.s), EOS];
          const back = lmB(m, out, tg); loss += back.loss / idx.length;
          if (argmaxRow(out.probs, 0) === tg[0] && argmaxRow(out.probs, 1) === tg[1]) hits++;
          const dTok = linB(m.proj, tokens, NP, back.dImg);
          if (!frozenEnc) encB(m.enc, enc.tape, dTok);
        }
        m.steps.vlm++; for (const p of ps) adamStep(p, lr, m.steps.vlm, chunk.length);
        if (stage === 'proj') zero(lmParams(m.lm)); if (frozenEnc) zero(encParams(m.enc));
        seen += chunk.length;
      }
      yield { kind: 'vlm', stage, ep, epochs, loss, acc: hits / idx.length, seen };
    }
    return m;
  }
  function argmaxRow(probs, t) { let bi = 0; for (let w = 1; w < V; w++) if (probs[t * V + w] > probs[t * V + bi]) bi = w; return bi; }

  /* ---------- 5. порождение слов и проверка ---------- */
  /** Описать картинку: слово за словом, жадно, до <eos> или трёх слов. o.patches — вход уже нарезан на патчи. */
  function generate(m, img, o) {
    const patches = o && o.patches ? img : patchify(img), it = imageTokens(m, patches), words = [BOS], steps = [];
    for (let k = 0; k < 3; k++) {
      const out = lmF(m, it.img, words), t = words.length - 1, probs = Float64Array.from(out.probs.subarray(t * V, (t + 1) * V)), pick = argmaxRow(out.probs, t);
      steps.push({ probs, pick, p: probs[pick], text: TOK[pick] });
      if (pick === EOS) break; words.push(pick);
    }
    const said = words.slice(1).map((w) => TOK[w]);
    return { ids: words.slice(1), words: said, color: said[0] && wid(said[0]) < COLORS.length ? said[0] : null, shape: said[1] && wid(said[1]) >= COLORS.length ? said[1] : null, steps, tokens: it.enc.tokens, pooled: it.enc.pooled, img: it.img, eos: steps.length && steps[steps.length - 1].pick === EOS };
  }
  /** Точность на новых картинках: nPer картинок на каждую пару; отдельно отложенное сочетание. */
  function evaluate(m, seed, nPer) {
    const r = rng(seed || 777), per = {}, pr = pairs(true); let ok = 0, n = 0, okH = 0, nH = 0;
    for (const [c, s] of pr) { let h = 0; for (let k = 0; k < (nPer || 3); k++) { const g = generate(m, icon(c, s, r)), hit = g.color === c && g.shape === s && g.words.length === 2; if (isHeld(c, s)) { nH++; if (hit) okH++; } else { n++; if (hit) ok++; } if (hit) h++; } per[c + ' ' + s] = h / (nPer || 3); }
    return { acc: ok / n, held: nH ? okH / nH : null, per, n, nH };
  }
  function cosine(a, b) { return dot(a, b) / (norm(a) * norm(b)); }
  /** Иконка с заданными сдвигом (dx, dy в пикселях), радиусом R и шумом — для свободного режима. */
  function iconAt(color, shape, o) {
    o = o || {}; const r = rng(o.seed || 1), img = blank(IS, IS, r, o.noise == null ? 0.02 : o.noise);
    paint(img, IS, IS, color, shape, IS / 2 + (o.dx || 0), IS / 2 + (o.dy || 0), o.R == null ? 5.8 : o.R, r, o.noise == null ? 0.04 : o.noise * 2);
    return img;
  }
  /** Что «видит» энкодер: ближайшая подпись в контрастном пространстве среди всех 24 сочетаний. */
  function clipNearest(m, patches) {
    const u = unit(encF(m.enc, patches).pooled); let best = -9, bp = null;
    for (const [c, s] of pairs(true)) { const v = dot(u, unit(textVec(m, c, s))); if (v > best) { best = v; bp = [c, s]; } }
    return { color: bp[0], shape: bp[1], sim: best };
  }
  /** Две главные оси набора векторов (степенной метод по ковариации); возвращает проекции и доли дисперсии. */
  function pca2(vecs, basis) {
    const d = vecs[0].length, n = vecs.length, mu = new Float64Array(d);
    if (!basis) {
      for (const v of vecs) for (let i = 0; i < d; i++) mu[i] += v[i] / n;
      const C = new Float64Array(d * d); for (const v of vecs) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i * d + j] += (v[i] - mu[i]) * (v[j] - mu[j]) / n;
      const axes = [], lam = []; let tr = 0; for (let i = 0; i < d; i++) tr += C[i * d + i];
      for (let a = 0; a < 2; a++) {
        let u = new Float64Array(d); for (let i = 0; i < d; i++) u[i] = sin(i * 1.3 + a);
        for (let it = 0; it < 200; it++) { const w = new Float64Array(d); for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) w[i] += C[i * d + j] * u[j]; for (const q of axes) { const pj = dot(w, q); for (let i = 0; i < d; i++) w[i] -= pj * q[i]; } u = unit(w); }
        let l = 0; for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) l += u[i] * C[i * d + j] * u[j];
        axes.push(u); lam.push(l / (tr || 1));
      }
      basis = { mu, axes, lam };
    }
    const pts = vecs.map((v) => { const c = new Float64Array(d); for (let i = 0; i < d; i++) c[i] = v[i] - basis.mu[i]; return [dot(c, basis.axes[0]), dot(c, basis.axes[1])]; });
    return { pts, basis };
  }
  /** Копия параметров (для снимков «до» и «после»). */
  const cloneParams = (ps) => ps.map((p) => Float64Array.from(p.w));
  const loadParams = (ps, ws) => ps.forEach((p, i) => p.w.set(ws[i]));
  function wordVectors(m) { return WORDS.map((w, i) => Float64Array.from(m.lm.E.w.subarray(i * DL, (i + 1) * DL))); }
  function finish(gen, onEv) { for (;;) { const r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); } }
  const countParams = (ps) => ps.reduce((s, p) => s + p.w.length, 0);
  function paramCount(m) { return { enc: countParams(encParams(m.enc)), proj: countParams(projParams(m)), lm: countParams(lmParams(m.lm)) }; }

  const API = { P, NP, PD, DE, DL, V, WORDS, TOK, BOS, EOS, NT, T, wid, patchify, permutePatches, encF, imageTokens, vlmInit, pretrainEncoder, pretrainLM, makeData, trainVLM, generate, evaluate,
    cosine, iconAt, clipNearest, pca2, unit, dot, norm, pairs, textVec, lmF, wordVectors, cloneParams, loadParams, finish, paramCount, rng, icon, isHeld,
    encParams: (m) => encParams(m.enc), lmParams: (m) => lmParams(m.lm), projParams, math: { exp, log, tanh, sincos, powInt } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L32 = API;
})(typeof window !== 'undefined' ? window : globalThis);
