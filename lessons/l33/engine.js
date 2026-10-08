/* =====================================================================
   l33/engine.js — движок урока 3.3 «RT-2». Без DOM: работает в браузере
   (window.L33, поверх window.L21) и в Node (module.exports, require l21).
   1) Действие как строка из 8 целых: признак завершения, 6 смещений позы
      захвата, захват; каждое — корзина из 256. Два токенизатора: PaLI-X
      (числа до 1000 — отдельные токены) и PaLM-E (256 редких токенов).
   2) Мини-VLA на столе из урока 2.1: картинка 96×96 (клетки 2×2 px) режется на 8×8 патчей,
      общий энкодер патчей даёт вектор каждому; слова команды задают запрос,
      одно кросс-внимание выбирает патч; три слота выхода дают токены из
      ОБЩЕГО словаря — слова (цвета, формы) и токены действия (корзина x,
      корзина y, захват). Вход и выход словаря — одни и те же векторы
      (tied embeddings), поэтому слово, выученное на подписях, работает
      и в команде. Три режима обучения, как в таблице 6 статьи: с нуля
      на демонстрациях, дообучение предобученной VLM только на действиях,
      совместное дообучение — демонстрации вместе с веб-парами
      «картинка → слова». Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp } = L;

  /* =================================================================
     1. Действие RT-2: 8 полей, 256 корзин, две токенизации
     ================================================================= */
  const FIELDS = [
    { id: 'term', name: 'завершить', short: 'завершить', kind: 'flag' },
    { id: 'dx', name: 'Δx', short: 'Δx', kind: 'pos' }, { id: 'dy', name: 'Δy', short: 'Δy', kind: 'pos' }, { id: 'dz', name: 'Δz', short: 'Δz', kind: 'pos' },
    { id: 'rx', name: 'Δкрен', short: 'Δкрен', kind: 'rot' }, { id: 'ry', name: 'Δтангаж', short: 'Δтангаж', kind: 'rot' }, { id: 'rz', name: 'Δрыскание', short: 'Δрыскание', kind: 'rot' },
    { id: 'grip', name: 'захват', short: 'захват', kind: 'grip' },
  ];
  const NB = 256;
  /** Значение оси −1…1 (или 0…1 для захвата) → корзина 0…255. */
  const toBin = (v, kind) => (kind === 'flag' ? (v >= 0.5 ? 1 : 0) : kind === 'grip' ? Math.round(clamp(v, 0, 1) * (NB - 1)) : Math.round((clamp(v, -1, 1) + 1) / 2 * (NB - 1)));
  const fromBin = (b, kind) => (kind === 'flag' ? (b ? 1 : 0) : kind === 'grip' ? b / (NB - 1) : b / (NB - 1) * 2 - 1);
  /** Поза (объект по id полей) → 8 корзин → строка «1 128 91 …». */
  function poseToBins(pose) { return FIELDS.map((f) => toBin(pose[f.id] == null ? (f.kind === 'grip' ? 0.5 : 0) : pose[f.id], f.kind)); }
  const binsToPose = (bins) => Object.fromEntries(FIELDS.map((f, i) => [f.id, fromBin(bins[i], f.kind)]));
  const binsToString = (bins) => bins.join(' ');
  /** Разбор строки: 8 целых, первое 0/1, остальные 0…255. Возвращает { bins } или { error }. */
  function parseBins(str) {
    const parts = String(str).trim().split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== FIELDS.length) return { error: `нужно ${FIELDS.length} чисел, а здесь ${parts.length}` };
    const bins = [];
    for (let i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return { error: `«${parts[i]}» — не целое число` };
      const v = +parts[i], lim = i === 0 ? 1 : NB - 1;
      if (v > lim) return { error: `${v} больше ${lim}: ${i === 0 ? 'признак завершения — 0 или 1' : 'корзин 256'}` };
      bins.push(v);
    }
    return { bins };
  }
  /** Токенизация PaLI-X: каждое целое до 1000 — свой токен. */
  const tokenizePaliX = (bins) => bins.map((b) => ({ text: String(b), id: b, kind: 'num' }));
  /** Токенизация PaLM-E: числам нет отдельных токенов — под действия переписаны 256 самых редких токенов словаря
   *  (в статье они не названы, здесь показаны условно). */
  const tokenizePalmE = (bins) => bins.map((b) => ({ text: `⟨r${b}⟩`, id: b, kind: 'rare' }));

  /* =================================================================
     2. Мини-VLA: общий словарь слов и токенов действия
     ================================================================= */
  const G = L.G, FG = 48, FC = L.TW / FG, PS = FG / 8, PG = FG / PS, NP = PG * PG, PD = PS * PS * 3;   // корзины 24 на ось; признаки 48×48 (клетка 2 px), патч 6×6 клеток, 8×8 патчей, 108 признаков
  const D = 32, HID = 32;                                                   // размер вектора словаря и скрытый слой энкодера патча
  const COLORS = L.COLORS.map((c) => c.id), SHAPES = L.SHAPES.map((s) => s.id);
  const XB = [], YB = []; for (let i = 0; i < G; i++) { XB.push('x' + i); YB.push('y' + i); }
  const VOCAB = ['take', 'describe'].concat(COLORS, SHAPES, XB, YB, ['close', 'open']);
  const TI = Object.fromEntries(VOCAB.map((t, i) => [t, i])), V = VOCAB.length;
  const GROUPS = { task: ['take', 'describe'], color: COLORS, shape: SHAPES, x: XB, y: YB, grip: ['close', 'open'] };
  const RU = { take: 'возьми', describe: 'опиши', close: 'сомкнуть', open: 'разжать' };
  /** Подпись токена по-русски (для показа). */
  function tokenName(t) { if (RU[t]) return RU[t]; const c = L.COLORS.find((q) => q.id === t); if (c) return c.m; const s = L.SHAPES.find((q) => q.id === t); if (s) return s.name; return t; }
  const NSLOT = 3;

  /** Патчи картинки 96×96: клетки 2×2 px усредняются, фон вычтен, мелкий шум обнулён; пустые патчи помечены. */
  function patches(img) {
    const X = [], empty = new Uint8Array(NP), TW = L.TW;
    for (let p = 0; p < NP; p++) {
      const px = p % PG, py = Math.floor(p / PG), x = new Float64Array(PD); let n = 0, any = false;
      for (let dy = 0; dy < PS; dy++) for (let dx = 0; dx < PS; dx++) {
        const X0 = (px * PS + dx) * FC, Y0 = (py * PS + dy) * FC;
        for (let c = 0; c < 3; c++) {
          let v = 0; for (let yy = 0; yy < FC; yy++) for (let xx = 0; xx < FC; xx++) v += img[((Y0 + yy) * TW + X0 + xx) * 3 + c];
          v = v / (FC * FC) - L.BG[c]; if (Math.abs(v) < 0.04) v = 0; else any = true; x[n++] = v;
        }
      }
      X.push(x); empty[p] = any ? 0 : 1;
    }
    return { X, empty };
  }
  function mat(r, c, scale, rr) { const a = new Float64Array(r * c); for (let i = 0; i < a.length; i++) a[i] = randn(rr) * scale; return a; }
  const zeros = (n) => new Float64Array(n);
  function param(val) { return { v: val, g: zeros(val.length), m: zeros(val.length), vv: zeros(val.length) }; }
  function vlaInit(seed) {
    const r = rng(seed || 33);
    return { seed: seed || 33, t: 0, steps: 0, hist: [], att: 1,
      W1: param(mat(PD, HID, Math.sqrt(1 / PD), r)), b1: param(zeros(HID)), W2: param(mat(HID, D, Math.sqrt(1 / HID), r)), b2: param(zeros(D)),
      E: param(mat(V, D, 0.35, r)), Px: param(mat(PG, D, 0.1, r)), Py: param(mat(PG, D, 0.1, r)), S: param(mat(NSLOT, D, 0.1, r)), b: param(zeros(V)) };
  }
  const PARAMS = ['W1', 'b1', 'W2', 'b2', 'E', 'Px', 'Py', 'S', 'b'];
  const posOf = (m, p, k) => m.Px.v[(p % PG) * D + k] + m.Py.v[Math.floor(p / PG) * D + k];
  /** Копия весов с новым оптимизатором: так начинается дообучение предобученной модели. */
  function vlaClone(m) { const o = { seed: m.seed, t: 0, steps: m.steps, hist: [], pre: m.steps, att: m.att }; for (const k of PARAMS) o[k] = param(Float64Array.from(m[k].v)); return o; }

  /** Прямой проход: патчи → векторы, запрос из слов, внимание, три слота логитов по словарю. Возвращает всё для обратного. */
  function forward(m, pt, prompt) {
    const { X, empty } = pt, h1 = [], h = [];
    let eh1 = null, eh = null;
    for (let p = 0; p < NP; p++) {
      if (empty[p] && eh) { h1.push(eh1); h.push(eh); continue; }
      const x = X[p], a = new Float64Array(HID), hh = new Float64Array(D);
      for (let j = 0; j < HID; j++) a[j] = m.b1.v[j];
      for (let i = 0; i < PD; i++) { const xi = x[i]; if (xi === 0) continue; const off = i * HID; for (let j = 0; j < HID; j++) a[j] += xi * m.W1.v[off + j]; }
      for (let j = 0; j < HID; j++) a[j] = Math.tanh(a[j]);
      for (let k = 0; k < D; k++) hh[k] = m.b2.v[k];
      for (let j = 0; j < HID; j++) { const aj = a[j], off = j * D; for (let k = 0; k < D; k++) hh[k] += aj * m.W2.v[off + k]; }
      h1.push(a); h.push(hh); if (empty[p]) { eh1 = a; eh = hh; }
    }
    const q = new Float64Array(D); for (const w of prompt) { const off = TI[w] * D; for (let k = 0; k < D; k++) q[k] += m.E.v[off + k]; }
    const s = new Float64Array(NP), sc = m.att || 1; let mx = -1e9;
    for (let p = 0; p < NP; p++) { let v = 0; const hp = h[p]; for (let k = 0; k < D; k++) v += hp[k] * q[k]; s[p] = v * sc; if (s[p] > mx) mx = s[p]; }
    const a = new Float64Array(NP); let z = 0; for (let p = 0; p < NP; p++) { a[p] = Math.exp(s[p] - mx); z += a[p]; } for (let p = 0; p < NP; p++) a[p] /= z;
    const c = new Float64Array(D); for (let p = 0; p < NP; p++) { const ap = a[p]; if (ap < 1e-9) continue; const hp = h[p]; for (let k = 0; k < D; k++) c[k] += ap * (hp[k] + posOf(m, p, k)); }
    const logits = [];
    for (let sl = 0; sl < NSLOT; sl++) {
      const lg = new Float64Array(V), so = sl * D;
      for (let t = 0; t < V; t++) { let v = m.b.v[t]; const eo = t * D; for (let k = 0; k < D; k++) v += (c[k] + m.S.v[so + k]) * m.E.v[eo + k]; lg[t] = v; }
      logits.push(lg);
    }
    return { pt, prompt, h1, h, q, a, c, logits };
  }
  const softmaxV = (lg) => { let mx = -1e9; for (const v of lg) if (v > mx) mx = v; const p = new Float64Array(lg.length); let z = 0; for (let i = 0; i < lg.length; i++) { p[i] = Math.exp(lg[i] - mx); z += p[i]; } for (let i = 0; i < p.length; i++) p[i] /= z; return p; };
  /** Обратный проход. targets — токены по слотам (null — слот не учится), groups — словарь каждого слота:
   *  потеря считается только среди токенов своей задачи (слова для подписи, токены действия для команды роботу),
   *  как ограничение вывода в RT-2. Возвращает потерю. */
  function backward(m, f, targets, groups) {
    const { pt, prompt, h1, h, q, a, c, logits } = f, dc = new Float64Array(D); let loss = 0;
    for (let sl = 0; sl < NSLOT; sl++) {
      const tgt = targets[sl]; if (tgt == null) continue;
      const grp = groups[sl], lg = logits[sl], so = sl * D; let mx = -1e9;
      for (const t of grp) if (lg[TI[t]] > mx) mx = lg[TI[t]];
      let z = 0; for (const t of grp) z += Math.exp(lg[TI[t]] - mx);
      loss -= lg[TI[tgt]] - mx - Math.log(z);
      for (const t of grp) {
        const ti = TI[t], g = Math.exp(lg[ti] - mx) / z - (t === tgt ? 1 : 0); if (Math.abs(g) < 1e-7) continue;
        m.b.g[ti] += g; const eo = ti * D;
        for (let k = 0; k < D; k++) { const o = c[k] + m.S.v[so + k]; m.E.g[eo + k] += g * o; const ge = g * m.E.v[eo + k]; dc[k] += ge; m.S.g[so + k] += ge; }
      }
    }
    // внимание: c = Σ a_p (h_p + pos_p)
    const da = new Float64Array(NP), dh = []; let sum = 0;
    for (let p = 0; p < NP; p++) {
      const ap = a[p], hp = h[p], ox = (p % PG) * D, oy = Math.floor(p / PG) * D, d = new Float64Array(D); let v = 0;
      for (let k = 0; k < D; k++) { v += dc[k] * (hp[k] + m.Px.v[ox + k] + m.Py.v[oy + k]); m.Px.g[ox + k] += ap * dc[k]; m.Py.g[oy + k] += ap * dc[k]; d[k] = ap * dc[k]; }
      da[p] = v; sum += ap * v; dh.push(d);
    }
    const dq = new Float64Array(D), sc = m.att || 1;
    for (let p = 0; p < NP; p++) { const ds = a[p] * (da[p] - sum) * sc; if (Math.abs(ds) < 1e-10) continue; const hp = h[p], d = dh[p]; for (let k = 0; k < D; k++) { dq[k] += ds * hp[k]; d[k] += ds * q[k]; } }
    for (const w of prompt) { const off = TI[w] * D; for (let k = 0; k < D; k++) m.E.g[off + k] += dq[k]; }
    // энкодер патчей: пустые патчи — один общий проход с суммой градиентов
    const dEmpty = new Float64Array(D); let anyEmpty = -1;
    for (let p = 0; p < NP; p++) { if (pt.empty[p]) { anyEmpty = p; for (let k = 0; k < D; k++) dEmpty[k] += dh[p][k]; continue; } encBack(m, pt.X[p], h1[p], dh[p]); }
    if (anyEmpty >= 0) encBack(m, pt.X[anyEmpty], h1[anyEmpty], dEmpty);
    return loss;
  }
  function encBack(m, x, a, d) {
    const dz = new Float64Array(HID);
    for (let j = 0; j < HID; j++) { const aj = a[j], off = j * D; let s = 0; for (let k = 0; k < D; k++) { m.W2.g[off + k] += aj * d[k]; s += m.W2.v[off + k] * d[k]; } dz[j] = s * (1 - aj * aj); }
    for (let j = 0; j < HID; j++) m.b1.g[j] += dz[j];
    for (let k = 0; k < D; k++) m.b2.g[k] += d[k];
    for (let i = 0; i < PD; i++) { const xi = x[i]; if (xi === 0) continue; const off = i * HID; for (let j = 0; j < HID; j++) m.W1.g[off + j] += xi * dz[j]; }
  }
  function adamAll(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    for (const k of PARAMS) { const P = m[k]; for (let i = 0; i < P.v.length; i++) { const g = P.g[i] / bs; P.m[i] = b1 * P.m[i] + (1 - b1) * g; P.vv[i] = b2 * P.vv[i] + (1 - b2) * g * g; P.v[i] -= lr * (P.m[i] / c1) / (Math.sqrt(P.vv[i] / c2) + 1e-8); P.g[i] = 0; } }
  }

  /* ---------- данные ---------- */
  const ROBOT_GROUPS = [XB, YB, GROUPS.grip], WEB_GROUPS = [COLORS, SHAPES, null];
  /** Демонстрации робота: команда «возьми <цвет> кубик» с цветами L21.SEEN, цель — клетка 24×24 → токены x, y, «сомкнуть». */
  function robotData(n, seed) {
    return L.cmdDemos(n, seed || 300).map((d) => ({ kind: 'robot', pt: patches(d.img), prompt: ['take', d.word, 'cube'], targets: ['x' + (d.target % G), 'y' + Math.floor(d.target / G), 'close'], groups: ROBOT_GROUPS, word: d.word, scene: d.scene }));
  }
  /** «Веб-данные»: картинка стола с одним предметом любого цвета и формы → подпись «цвет, форма». */
  function webData(n, seed) {
    const r = rng(seed || 500), out = [], pairs = []; for (const c of COLORS) for (const s of SHAPES) pairs.push([c, s]);
    for (let i = 0; i < n; i++) { const [c, s] = pairs[i % pairs.length], sc = L.tableScene([{ color: c, shape: s }], (seed || 500) * 7 + i, { margin: 12 }); out.push({ kind: 'web', pt: patches(sc.img), prompt: ['describe'], targets: [c, s, null], groups: WEB_GROUPS, color: c, shape: s, scene: sc }); }
    return out;
  }
  /** Обучение: генератор, отдаёт прогресс каждые несколько шагов; data — смесь примеров, минибатчи по bs. */
  function* vlaTrain(m, data, o) {
    o = o || {}; const epochs = o.epochs || 60, bs = o.bs || 16, lr = o.lr || 0.004, r = rng((o.seed || 77) + m.steps), idx = data.map((_, i) => i), total = epochs * Math.ceil(data.length / bs);
    let step = 0;
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let s0 = 0; s0 < idx.length; s0 += bs) {
        let loss = 0; const B = Math.min(bs, idx.length - s0);
        for (let k = 0; k < B; k++) { const ex = data[idx[s0 + k]]; loss += backward(m, forward(m, ex.pt, ex.prompt), ex.targets, ex.groups); }
        adamAll(m, lr, B); m.steps++; step++;
        if (step % 4 === 0 || step === total) { m.hist.push(loss / B); yield { step, total, epoch: ep, loss: loss / B, steps: m.steps }; }
      }
    }
    return m;
  }
  /** Argmax внутри группы словаря (ограничение вывода, как в RT-2: при команде роботу — только токены действия). */
  function pickFrom(lg, group) { let best = null, bv = -1e18; for (const t of group) { const v = lg[TI[t]]; if (v > bv) { bv = v; best = t; } } return best; }
  /** Команда «возьми <цвет> кубик» → токены действия, клетка и внимание. */
  function act(m, img, color) {
    const f = forward(m, patches(img), ['take', color, 'cube']);
    const tx = pickFrom(f.logits[0], XB), ty = pickFrom(f.logits[1], YB), tg = pickFrom(f.logits[2], GROUPS.grip);
    const xi = +tx.slice(1), yi = +ty.slice(1), cell = yi * G + xi;
    return { tokens: [tx, ty, tg], cell, p: L.cellXY(cell), attn: f.a, logits: f.logits };
  }
  /** Команда «опиши» → слова: цвет и форма. */
  function caption(m, img) { const f = forward(m, patches(img), ['describe']); return { tokens: [pickFrom(f.logits[0], COLORS), pickFrom(f.logits[1], SHAPES)], attn: f.a }; }
  /** Проверка действий на n новых сценах с командой про цвет color. */
  function evalAct(m, color, n, seed0) {
    const runs = []; let ok = 0;
    for (let i = 0; i < n; i++) { const sc = L.cmdScene(color, (seed0 || 900) + i), r = act(m, sc.img, color), hit = L.hitObj(sc.target, r.p.x, r.p.y); if (hit) ok++; runs.push({ scene: sc, p: r.p, tokens: r.tokens, attn: r.attn, ok: hit }); }
    return { runs, ok, n, rate: ok / n };
  }
  /** Проверка подписей: по nPer сцен на каждую пару «цвет — форма» (24 пары), новые зёрна. */
  function evalCaption(m, nPer, seed0) {
    const runs = []; let ok = 0, okColor = 0;
    for (const c of COLORS) for (const s of SHAPES) for (let k = 0; k < (nPer || 1); k++) {
      const sc = L.tableScene([{ color: c, shape: s }], (seed0 || 4000) + runs.length, { margin: 12 }), r = caption(m, sc.img);
      const hit = r.tokens[0] === c && r.tokens[1] === s; if (hit) ok++; if (r.tokens[0] === c) okColor++;
      runs.push({ scene: sc, color: c, shape: s, tokens: r.tokens, ok: hit });
    }
    return { runs, ok, okColor, n: runs.length, rate: ok / runs.length, rateColor: okColor / runs.length };
  }

  const API = { FIELDS, NB, toBin, fromBin, poseToBins, binsToPose, binsToString, parseBins, tokenizePaliX, tokenizePalmE,
    G, FG, PS, PG, NP, PD, D, HID, VOCAB, TI, GROUPS, XB, YB, COLORS, SHAPES, tokenName, patches, vlaInit, vlaClone, forward, backward, adamAll, ROBOT_GROUPS, WEB_GROUPS, robotData, webData, vlaTrain, act, caption, evalAct, evalCaption, pickFrom, PARAMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L33 = API;
})(typeof window !== 'undefined' ? window : globalThis);
