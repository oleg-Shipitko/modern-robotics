/* =====================================================================
   l35/engine.js — движок урока 3.5 «Открытые VLA: Octo и OpenVLA». Без DOM:
   работает в браузере (поверх window.L21) и в Node (для подбора постановки
   и тестов).
   1) Мини-VLA на столе из урока 2.1: признаки клетки — окно 3 × 3 клеток
      сетки 24 × 24 (27 чисел), слово команды входит в первый слой как сдвиг
      (эмбеддинг), два скрытых слоя и линейная голова дают оценку клетки;
      softmax по 576 клеткам — «где взять». Предобучение на знакомых сценах
      (кубики, камера робота из 2.1), дообучение на нового робота (мячи,
      другая камера) тремя способами: все веса, LoRA (добавки ранга r
      к матрицам W1 и W2), замороженная основа и новая голова.
   2) Голова действий на одной основе: регрессия (MSE), токены (корзины,
      аргмакс) и диффузия — куда положить кубик, если мисок две.
   3) Таблицы OpenVLA по категориям (числа из статьи) для интерактива.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp, G, TW, cellXY, hitObj, argmax, COLORS, CI, tableScene, toGrid, BG } = L;
  const NC = G * G;                                           // 576 клеток

  /* =================================================================
     1. Домены: робот из 2.1 (кубики) и рука лаборатории (мячи, другая камера)
     ================================================================= */
  const CMD = ['red', 'blue', 'green'];                       // команды «возьми <цвет> …», как SEEN в 2.1
  const DOMAINS = {
    home: { id: 'home', name: 'робот из урока 2.1', shape: 'cube', gain: [1, 1, 1], bias: [0, 0, 0] },
    lab: { id: 'lab', name: 'рука лаборатории', shape: 'can', gain: [1.1, 0.95, 0.72], bias: [0.03, 0.01, -0.02] },
  };
  /** Снимок камеры домена: яркость и баланс цветов меняются по каналам. */
  function camera(img, dom) {
    const out = new Float32Array(img.length);
    for (let i = 0; i < img.length; i += 3) for (let c = 0; c < 3; c++) out[i + c] = clamp(img[i + c] * dom.gain[c] + dom.bias[c], 0, 1);
    return out;
  }
  /** Сцена для команды «возьми <target> …»: цель, два предмета других цветов той же формы и миска. */
  function scene(dom, target, seed) {
    const r = rng(seed * 17 + 3), others = COLORS.map((c) => c.id).filter((c) => c !== target);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const spec = [{ color: target, shape: dom.shape }, { color: others[0], shape: dom.shape }, { color: others[1], shape: dom.shape }, { color: others[2], shape: 'bowl' }];
    const sc = tableScene(spec, seed);
    const img = camera(sc.img, dom), grid = toGrid(img);
    return { img, grid, objs: sc.objs, target: sc.objs[0], word: CI[target], dom: dom.id, feats: features(grid) };
  }
  /** Признаки клеток: окно 3 × 3 клеток вокруг каждой, минус медианный цвет сцены (фон).
   *  Клетки, где окно пустое, помечены: у них все признаки нули, и сеть считает их один раз. */
  const PD = 29, BG_THR = 0.045;                             // 27 цветов окна и 2 координаты клетки
  function median3(grid) {
    const m = [0, 0, 0];
    for (let c = 0; c < 3; c++) { const a = new Float64Array(NC); for (let i = 0; i < NC; i++) a[i] = grid[i * 3 + c]; a.sort(); m[c] = a[NC >> 1]; }
    return m;
  }
  function features(grid) {
    const bg = median3(grid), x = new Float64Array(NC * PD), on = new Uint8Array(NC), cells = [];
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx; let n = 0, mx = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx, yy = cy + dy, inside = xx >= 0 && yy >= 0 && xx < G && yy < G, o = (yy * G + xx) * 3;
        for (let c = 0; c < 3; c++) { const v = inside ? grid[o + c] - bg[c] : 0; x[i * PD + n++] = v; if (Math.abs(v) > mx) mx = Math.abs(v); }
      }
      if (mx > BG_THR) { on[i] = 1; cells.push(i); x[i * PD + 27] = (cx + 0.5) / G * 2 - 1; x[i * PD + 28] = (cy + 0.5) / G * 2 - 1; }
    }
    return { x, on, cells, bg };
  }
  const cellOf = (q) => clamp(Math.floor(q.y / (TW / G)), 0, G - 1) * G + clamp(Math.floor(q.x / (TW / G)), 0, G - 1);

  /* =================================================================
     2. Мини-VLA: два скрытых слоя, слово как сдвиг первого слоя, голова
     ================================================================= */
  const H1 = 40, H2 = 20, NWORD = COLORS.length, KH = 8;      // KH — скрытый слой новой головы при заморозке
  const zeros = (n) => new Float64Array(n);
  function param(n, r, s) { const w = zeros(n); if (s) for (let i = 0; i < n; i++) w[i] = randn(r) * s; return { w, g: zeros(n), m: zeros(n), v: zeros(n) }; }
  /** Новая модель со случайными весами. */
  function vlaInit(seed) {
    const r = rng(seed || 5);
    return {
      W1: param(H1 * PD, r, 1 / Math.sqrt(PD)), b1: param(H1), E: param(NWORD * H1, r, 0.3),
      W2: param(H2 * H1, r, 1 / Math.sqrt(H1)), b2: param(H2), w3: param(H2, r, 1 / Math.sqrt(H2)), b3: param(1),
      t: 0, steps: 0, mode: 'full', rank: 0,
      lora: null, head: null,                                 // добавки LoRA и новая голова появляются при дообучении
    };
  }
  /** Глубокая копия весов (без градиентов и моментов). */
  function vlaClone(m) {
    const cp = (p) => ({ w: Float64Array.from(p.w), g: zeros(p.w.length), m: zeros(p.w.length), v: zeros(p.w.length) });
    const o = { W1: cp(m.W1), b1: cp(m.b1), E: cp(m.E), W2: cp(m.W2), b2: cp(m.b2), w3: cp(m.w3), b3: cp(m.b3), t: 0, steps: m.steps, mode: m.mode, rank: m.rank, lora: null, head: null };
    if (m.lora) o.lora = { r: m.lora.r, A1: cp(m.lora.A1), B1: cp(m.lora.B1), A2: cp(m.lora.A2), B2: cp(m.lora.B2) };
    if (m.head) o.head = { Wh: cp(m.head.Wh), bh: cp(m.head.bh), wo: cp(m.head.wo), bo: cp(m.head.bo) };
    return o;
  }
  /** Подготовить к дообучению способом mode: 'full' | 'lora' | 'frozen'. */
  function vlaPrepare(base, mode, rank, seed) {
    const m = vlaClone(base); m.mode = mode; m.rank = 0; m.t = 0;
    const r = rng((seed || 9) + 101);
    if (mode === 'lora') {
      const k = rank || 2; m.rank = k;
      m.lora = { r: k, A1: param(k * PD, r, 1 / Math.sqrt(PD)), B1: param(H1 * k), A2: param(k * H1, r, 1 / Math.sqrt(H1)), B2: param(H2 * k) }; // B = 0: в начале модель совпадает с предобученной
    } else if (mode === 'frozen') {
      m.head = { Wh: param(KH * H2, r, 1 / Math.sqrt(H2)), bh: param(KH), wo: param(KH, r, 1 / Math.sqrt(KH)), bo: param(1) };
    }
    return m;
  }
  /** Действующие матрицы: W + B·A при LoRA. */
  function effective(m) {
    if (!m.lora) return { W1: m.W1.w, W2: m.W2.w };
    const { r, A1, B1, A2, B2 } = m.lora, W1 = Float64Array.from(m.W1.w), W2 = Float64Array.from(m.W2.w);
    for (let o = 0; o < H1; o++) for (let k = 0; k < r; k++) { const b = B1.w[o * r + k]; if (!b) continue; for (let i = 0; i < PD; i++) W1[o * PD + i] += b * A1.w[k * PD + i]; }
    for (let o = 0; o < H2; o++) for (let k = 0; k < r; k++) { const b = B2.w[o * r + k]; if (!b) continue; for (let i = 0; i < H1; i++) W2[o * H1 + i] += b * A2.w[k * H1 + i]; }
    return { W1, W2 };
  }
  /** Какие параметры учатся в этом режиме. */
  function trainable(m) {
    if (m.mode === 'lora') return m.loraHead === false ? [m.lora.A1, m.lora.B1, m.lora.A2, m.lora.B2] : [m.lora.A1, m.lora.B1, m.lora.A2, m.lora.B2, m.w3, m.b3];
    if (m.mode === 'frozen') return [m.head.Wh, m.head.bh, m.head.wo, m.head.bo];
    return [m.W1, m.b1, m.E, m.W2, m.b2, m.w3, m.b3];
  }
  const countParams = (list) => list.reduce((s, p) => s + p.w.length, 0);
  function paramInfo(m) {
    const all = countParams([m.W1, m.b1, m.E, m.W2, m.b2, m.w3, m.b3]);
    const tr = countParams(trainable(m));
    return { all, trainable: tr, share: tr / all };
  }

  /** Прямой проход по сцене: оценки всех клеток и промежуточные активации для обратного прохода. */
  function forward(m, sc, word, ws) {
    const W = effective(m), f = sc.feats, cells = f.cells, n = cells.length;
    ws = ws || {};
    const z1 = ws.z1 && ws.z1.length >= (n + 1) * H1 ? ws.z1 : (ws.z1 = zeros((n + 1) * H1 + 2048));
    const z2 = ws.z2 && ws.z2.length >= (n + 1) * H2 ? ws.z2 : (ws.z2 = zeros((n + 1) * H2 + 1024));
    const hh = ws.hh && ws.hh.length >= (n + 1) * KH ? ws.hh : (ws.hh = zeros((n + 1) * KH + 512));
    const logits = zeros(NC); let bgLogit = 0;
    const ew = word * H1;
    // k = n — фоновая клетка (все признаки нули), считается один раз
    for (let k = 0; k <= n; k++) {
      const x = k < n ? f.x : null, xo = k < n ? cells[k] * PD : 0;
      for (let o = 0; o < H1; o++) {
        let a = m.b1.w[o] + m.E.w[ew + o];
        if (x) { const wo = o * PD; for (let i = 0; i < PD; i++) a += W.W1[wo + i] * x[xo + i]; }
        z1[k * H1 + o] = Math.tanh(a);
      }
      for (let o = 0; o < H2; o++) {
        let a = m.b2.w[o]; const wo = o * H1, zo = k * H1;
        for (let i = 0; i < H1; i++) a += W.W2[wo + i] * z1[zo + i];
        z2[k * H2 + o] = Math.tanh(a);
      }
      let lg;
      if (m.head) {
        const H = m.head; lg = H.bo.w[0];
        for (let o = 0; o < KH; o++) { let a = H.bh.w[o]; const wo = o * H2, zo = k * H2; for (let i = 0; i < H2; i++) a += H.Wh.w[wo + i] * z2[zo + i]; const hv = Math.tanh(a); hh[k * KH + o] = hv; lg += H.wo.w[o] * hv; }
      } else { lg = m.b3.w[0]; const zo = k * H2; for (let i = 0; i < H2; i++) lg += m.w3.w[i] * z2[zo + i]; }
      if (k < n) logits[cells[k]] = lg; else bgLogit = lg;
    }
    for (let i = 0; i < NC; i++) if (!f.on[i]) logits[i] = bgLogit;
    return { logits, probs: softmax(logits), z1, z2, hh, W, n };
  }
  function softmax(s) { let mx = -1e9; for (const v of s) if (v > mx) mx = v; const p = zeros(s.length); let z = 0; for (let i = 0; i < s.length; i++) { p[i] = Math.exp(s[i] - mx); z += p[i]; } for (let i = 0; i < s.length; i++) p[i] /= z; return p; }
  /** Обратный проход: кросс-энтропия на клетке цели; градиенты копятся в p.g. Возвращает потерю. */
  function backward(m, sc, word, fw, target) {
    const f = sc.feats, cells = f.cells, n = fw.n, p = fw.probs, W = fw.W, ew = word * H1;
    const loss = -Math.log(p[target] + 1e-12);
    const dl = zeros(n + 1);
    for (let k = 0; k < n; k++) { const i = cells[k]; dl[k] = p[i] - (i === target ? 1 : 0); }
    for (let i = 0; i < NC; i++) if (!f.on[i]) dl[n] += p[i] - (i === target ? 1 : 0);
    const full = m.mode === 'full', lora = m.mode === 'lora';
    const dW1 = (full || lora) ? zeros(H1 * PD) : null, dW2 = (full || lora) ? zeros(H2 * H1) : null;
    const d2 = zeros(H2), d1 = zeros(H1);
    for (let k = 0; k <= n; k++) {
      const g = dl[k]; if (Math.abs(g) < 1e-9) continue;
      const zo2 = k * H2, zo1 = k * H1;
      // голова
      if (m.head) {
        const H = m.head;
        for (let o = 0; o < KH; o++) { const hv = fw.hh[k * KH + o], dh = g * H.wo.w[o] * (1 - hv * hv); H.wo.g[o] += g * hv; H.bh.g[o] += dh; const wo = o * H2; for (let i = 0; i < H2; i++) H.Wh.g[wo + i] += dh * fw.z2[zo2 + i]; }
        H.bo.g[0] += g;
        if (m.mode === 'frozen') continue;                   // основа заморожена: дальше градиент не нужен
        for (let i = 0; i < H2; i++) { let s = 0; for (let o = 0; o < KH; o++) { const hv = fw.hh[k * KH + o]; s += g * H.wo.w[o] * (1 - hv * hv) * H.Wh.w[o * H2 + i]; } d2[i] = s; }
      } else {
        for (let i = 0; i < H2; i++) { m.w3.g[i] += g * fw.z2[zo2 + i]; d2[i] = g * m.w3.w[i]; }
        m.b3.g[0] += g;
      }
      // слой 2
      for (let o = 0; o < H2; o++) { const z = fw.z2[zo2 + o]; d2[o] *= (1 - z * z); if (full) m.b2.g[o] += d2[o]; }
      for (let i = 0; i < H1; i++) { let s = 0; const z = fw.z1[zo1 + i]; for (let o = 0; o < H2; o++) { s += W.W2[o * H1 + i] * d2[o]; dW2[o * H1 + i] += d2[o] * z; } d1[i] = s * (1 - z * z); }
      // слой 1
      if (full) for (let o = 0; o < H1; o++) { m.b1.g[o] += d1[o]; m.E.g[ew + o] += d1[o]; }
      if (k < n) { const xo = cells[k] * PD; for (let o = 0; o < H1; o++) { const d = d1[o]; if (!d) continue; const wo = o * PD; for (let i = 0; i < PD; i++) dW1[wo + i] += d * f.x[xo + i]; } }
    }
    if (full) { for (let i = 0; i < dW1.length; i++) m.W1.g[i] += dW1[i]; for (let i = 0; i < dW2.length; i++) m.W2.g[i] += dW2[i]; }
    else if (lora) {
      // ΔW = B·A: dB = dW·Aᵀ, dA = Bᵀ·dW
      const { r, A1, B1, A2, B2 } = m.lora;
      for (let o = 0; o < H1; o++) for (let k = 0; k < r; k++) { let s = 0; const b = B1.w[o * r + k]; for (let i = 0; i < PD; i++) { const d = dW1[o * PD + i]; s += d * A1.w[k * PD + i]; A1.g[k * PD + i] += b * d; } B1.g[o * r + k] += s; }
      for (let o = 0; o < H2; o++) for (let k = 0; k < r; k++) { let s = 0; const b = B2.w[o * r + k]; for (let i = 0; i < H1; i++) { const d = dW2[o * H1 + i]; s += d * A2.w[k * H1 + i]; A2.g[k * H1 + i] += b * d; } B2.g[o * r + k] += s; }
    }
    return loss;
  }
  function adamStep(P, t, lr, bs, wd) {
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < P.w.length; i++) { const g = P.g[i] / bs; P.m[i] = b1 * P.m[i] + (1 - b1) * g; P.v[i] = b2 * P.v[i] + (1 - b2) * g * g; P.w[i] -= lr * ((P.m[i] / c1) / (Math.sqrt(P.v[i] / c2) + 1e-8) + (wd || 0) * P.w[i]); P.g[i] = 0; }
  }
  /** Шаги обучения по демонстрациям demos = [{ sc, word, target }]; генератор отдаёт прогресс и возвращает модель.
   *  o: { steps, batch, lr, wd, seed } */
  function* vlaTrain(m, demos, o) {
    o = o || {}; const steps = o.steps || 300, B = Math.min(o.batch || 8, demos.length), lr = o.lr || 0.01, r = rng((o.seed || 1) + 7), ws = {};
    const list = trainable(m);
    for (let s = 0; s < steps; s++) {
      let loss = 0;
      for (let b = 0; b < B; b++) {
        const d = B === demos.length ? demos[b] : demos[Math.floor(r() * demos.length)];
        const fw = forward(m, d.sc, d.word, ws);
        loss += backward(m, d.sc, d.word, fw, d.target) / B;
      }
      m.t++; m.steps++;
      for (const P of list) adamStep(P, m.t, lr, B, o.wd);
      if (s % 10 === 0 || s === steps - 1) yield { step: s + 1, steps, loss };
    }
    return m;
  }
  /** Демонстрация: сцена домена и клетка, где оператор взял целевой предмет. */
  /** Демонстрация: сцена домена и клетка, где оператор взял целевой предмет.
   *  series — сколько записей подряд с одной командой: оператор пишет сериями («красная банка» четыре раза, потом «синяя»…). */
  function demo(dom, i, seed0, series) {
    const color = CMD[Math.floor(i / (series || 1)) % CMD.length], sc = scene(dom, color, (seed0 || 300) + i);
    return { sc, word: sc.word, target: cellOf(sc.target), color };
  }
  const demos = (dom, n, seed0, series) => Array.from({ length: n }, (_, i) => demo(dom, i, seed0, series));
  const SERIES = 4;                                           // длина серии в записях лаборатории
  /** Предсказание: лучшая клетка и попала ли она в целевой предмет. */
  function predict(m, sc) {
    const fw = forward(m, sc, sc.word), i = argmax(fw.logits), p = cellXY(i);
    return { cell: i, x: p.x, y: p.y, ok: hitObj(sc.target, p.x, p.y), probs: fw.probs, logits: fw.logits };
  }
  /** Проверка на n новых сценах домена (кэш сцен по домену и зерну). */
  const evalCache = {};
  function evalSet(dom, n, seed0) {
    const key = dom.id + ':' + n + ':' + (seed0 || 7000);
    if (!evalCache[key]) evalCache[key] = Array.from({ length: n }, (_, i) => scene(dom, CMD[i % CMD.length], (seed0 || 7000) + i));
    return evalCache[key];
  }
  function evaluate(m, dom, n, seed0) {
    const set = evalSet(dom, n || 60, seed0), runs = [], byCmd = {};
    for (const sc of set) { const p = predict(m, sc), c = COLORS[sc.word].id; runs.push({ ok: p.ok, cell: p.cell, color: c }); (byCmd[c] = byCmd[c] || { ok: 0, n: 0 }).n++; if (p.ok) byCmd[c].ok++; }
    for (const c of Object.keys(byCmd)) byCmd[c].rate = byCmd[c].ok / byCmd[c].n;
    return { rate: runs.filter((q) => q.ok).length / set.length, runs, n: set.length, byCmd };
  }
  /** Предобучение на знакомых сценах: генератор, возвращает модель. */
  function* pretrain(o) {
    o = o || {}; const m = vlaInit(o.seed || 5), ds = demos(DOMAINS.home, o.n || 60, 300);
    yield* vlaTrain(m, ds, { steps: o.steps || 400, batch: o.batch || 10, lr: o.lr || 0.012, seed: 3 });
    return m;
  }
  /** Настройки дообучения по способам (одни и те же для любого N). */
  const FT = {
    full: { lr: 0.012, steps: 300, batch: 8 },
    lora: { lr: 0.02, steps: 300, batch: 8 },
    frozen: { lr: 0.02, steps: 300, batch: 8 },
  };
  function* finetune(base, mode, ds, o) {
    o = o || {}; const m = vlaPrepare(base, mode, o.rank, o.seed), cfg = FT[mode]; if (o.loraHead === false) m.loraHead = false;
    yield* vlaTrain(m, ds, { steps: o.steps || cfg.steps, batch: cfg.batch, lr: o.lr || cfg.lr, seed: o.seed || 1 });
    return m;
  }
  function finish(gen, onEv) { for (;;) { const r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); } }


  /** Набор записей лаборатории: k-й набор (по умолчанию 4-й), зерно сцен и зерно дообучения. */
  const LAB = { set: 4, rank: 2, nEval: 60 };
  const labSeed = (k) => 300 + (k == null ? LAB.set : k) * 1000;
  const labDemos = (n, k) => demos(DOMAINS.lab, n, labSeed(k), SERIES);
  /** Дообучить одним способом на n записях набора k и проверить на новых сценах. */
  function labRun(base, mode, n, o) {
    o = o || {}; const k = o.set == null ? LAB.set : o.set, rank = o.rank || LAB.rank;
    const m = finish(finetune(base, mode, labDemos(n, k), { seed: k, rank }));
    return { m, ev: evaluate(m, DOMAINS.lab, LAB.nEval), info: paramInfo(m) };
  }
  /** Сколько чисел учит LoRA ранга r для матрицы d_out × d_in: r·(d_in + d_out). */
  const loraCount = (r, dIn, dOut) => r * (dIn + dOut);

  /* =================================================================
     2. Голова действий: куда положить кубик, если мисок две
     Стол сверху 96 × 96, две одинаковые миски; операторы кладут кубик
     то в одну, то в другую. Сцена одна, поэтому выход основы одинаков
     для всех голов — разница только в том, как голова делает из него действие.
     ================================================================= */
  const BOWLS = [{ x: 27, y: 33 }, { x: 69, y: 63 }], BOWL_R = 7;
  /** Записи операторов: nLeft раз в первую миску, остальные — во вторую, с разбросом σ. */
  function placeDemos(n, nLeft, seed) {
    const r = rng(seed || 41), out = [];
    for (let i = 0; i < n; i++) { const b = BOWLS[i < nLeft ? 0 : 1]; out.push({ x: b.x + randn(r) * 1.6, y: b.y + randn(r) * 1.6, b: i < nLeft ? 0 : 1 }); }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  /** В какую миску попал ответ: 0, 1 или −1 — мимо. */
  const whichBowl = (p) => { for (let i = 0; i < BOWLS.length; i++) if (Math.hypot(p.x - BOWLS[i].x, p.y - BOWLS[i].y) <= BOWL_R) return i; return -1; };
  /** Регрессия со средним квадратом ошибки: градиентный спуск по двум числам — сходится к среднему записей. */
  function headMSE(ds) {
    let bx = 48, by = 48; const lr = 0.2;
    for (let s = 0; s < 200; s++) { let gx = 0, gy = 0; for (const d of ds) { gx += 2 * (bx - d.x) / ds.length; gy += 2 * (by - d.y) / ds.length; } bx -= lr * gx; by -= lr * gy; }
    return { x: bx, y: by };
  }
  /** Токены: стол по каждой оси делят на K корзин. Сначала токен x, потом токен y при выбранном x (как токены
   *  языковой модели — один за другим). Обученный на кросс-энтропии классификатор сходится к частотам в данных,
   *  поэтому вероятности токенов — частоты записей. Ответ — самый вероятный токен, центр корзины. */
  function headTokens(ds, K) {
    const w = TW / K, bin = (v) => clamp(Math.floor(v / w), 0, K - 1);
    const px = new Float64Array(K); for (const d of ds) px[bin(d.x)]++;
    const bx = argmax(px);
    const py = new Float64Array(K); for (const d of ds) if (bin(d.x) === bx) py[bin(d.y)]++;
    const by = argmax(py);
    for (let i = 0; i < K; i++) { px[i] /= ds.length; } const sy = py.reduce((a, b) => a + b, 0) || 1; for (let i = 0; i < K; i++) py[i] /= sy;
    return { x: (bx + 0.5) * w, y: (by + 0.5) * w, px, py, bx, by, K, w };
  }
  /** Диффузионная голова: маленькая сеть предсказывает шум ε по зашумлённому действию и номеру шага,
   *  20 шагов шумоподавления, косинусное расписание — как в Octo. Координаты нормированы к [−1, 1]. */
  const DT = 20;
  let PRED = 'x0';                                            // что предсказывает сеть: чистое действие x0 (шум выражается через него) или шум ε
  const SCHED = (() => {
    const s = 0.008, f = (t) => Math.cos(((t / DT) + s) / (1 + s) * Math.PI / 2) ** 2, ab = [1], beta = [0], al = [1];
    for (let t = 1; t <= DT; t++) { ab.push(f(t) / f(0)); const b = Math.min(0.999, 1 - ab[t] / ab[t - 1]); beta.push(b); al.push(1 - b); }
    return { ab, beta, al };
  })();
  const nrm = (v) => v / (TW / 2) - 1, den = (u) => (u + 1) * (TW / 2);
  const tfeat = (t) => [t / DT, Math.sin(Math.PI * t / DT), Math.cos(Math.PI * t / DT)];
  function* diffTrain(ds, o) {
    o = o || {}; const m = L.net([5, o.width || 64, o.width || 64, 2], o.seed || 13), r = rng((o.seed || 13) + 1), iters = o.iters || 2000, B = o.batch || 32, lr = o.lr || 0.006, x = new Float64Array(5), g = new Float64Array(2);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let b = 0; b < B; b++) {
        const d = ds[Math.floor(r() * ds.length)], t = 1 + Math.floor(r() * DT), e0 = randn(r), e1 = randn(r), a = Math.sqrt(SCHED.ab[t]), c = Math.sqrt(1 - SCHED.ab[t]);
        const tf = tfeat(t); x[0] = a * nrm(d.x) + c * e0; x[1] = a * nrm(d.y) + c * e1; x[2] = tf[0]; x[3] = tf[1]; x[4] = tf[2];
        const y = L.fwd(m, x), q0 = PRED === 'x0' ? nrm(d.x) : e0, q1 = PRED === 'x0' ? nrm(d.y) : e1;
        g[0] = 2 * (y[0] - q0) / B; g[1] = 2 * (y[1] - q1) / B; loss += ((y[0] - q0) ** 2 + (y[1] - q1) ** 2) / B; L.bwd(m, g);
      }
      L.adam(m, lr * (o.decay === false ? 1 : 0.1 + 0.9 * (1 - it / iters)), 1);   // шаг линейно затухает до 10%
      if (it % 50 === 0 || it === iters - 1) yield { it: it + 1, iters, loss };
    }
    return m;
  }
  /** Один ответ диффузионной головы: из шума за 20 шагов; путь — для анимации. */
  function diffSample(m, seed) {
    const r = rng(seed), x = new Float64Array(5); let u = randn(r), v = randn(r); const path = [{ x: den(u), y: den(v) }];
    for (let t = DT; t >= 1; t--) {
      const tf = tfeat(t); x[0] = u; x[1] = v; x[2] = tf[0]; x[3] = tf[1]; x[4] = tf[2];
      const y = L.fwd(m, x), k = SCHED.beta[t] / Math.sqrt(1 - SCHED.ab[t]), a = 1 / Math.sqrt(SCHED.al[t]), sg = t > 1 ? Math.sqrt(SCHED.beta[t]) : 0;
      let e = y;
      if (PRED === 'x0') { const ra = Math.sqrt(SCHED.ab[t]), rc = Math.sqrt(1 - SCHED.ab[t]), x0 = clamp(y[0], -1, 1), y0 = clamp(y[1], -1, 1); e = [(u - ra * x0) / rc, (v - ra * y0) / rc]; }
      u = a * (u - k * e[0]) + sg * randn(r); v = a * (v - k * e[1]) + sg * randn(r);
      path.push({ x: den(u), y: den(v) });
    }
    const p = path[path.length - 1];
    return { x: p.x, y: p.y, path };
  }

  /* =================================================================
     3. Таблицы OpenVLA: успехи по задачам (табл. 4 и 6 статьи)
     Порядок моделей: RT-1-X, Octo, RT-2-X, OpenVLA. Число успехов из 10 (Bridge) или 5 (Google).
     ================================================================= */
  const MODELS = [
    { id: 'rt1x', name: 'RT-1-X', params: '35 млн', open: true },
    { id: 'octo', name: 'Octo', params: '93 млн', open: true },
    { id: 'rt2x', name: 'RT-2-X', params: '55 млрд', open: false },
    { id: 'openvla', name: 'OpenVLA', params: '7 млрд', open: true },
  ];
  const TBL = [
    { id: 'visual', robot: 'bridge', name: 'Визуальное обобщение', note: 'новый фон, лишние предметы, другой вид предметов', trials: 10, tasks: [
      ['Put Eggplant into Pot (Easy Version)', 1, 5, 7, 10], ['Put Eggplant into Pot', 0, 1, 5, 10], ['Put Cup from Counter into Sink', 1, 1, 0, 7], ['Put Eggplant into Pot (w/ Clutter)', 1, 3.5, 6, 7.5], ['Put Yellow Corn on Pink Plate', 1, 4, 8, 9]] },
    { id: 'motion', robot: 'bridge', name: 'Обобщение движения', note: 'новые положения и повороты предметов', trials: 10, tasks: [
      ['Lift Eggplant', 3, 0.5, 6.5, 7.5], ['Put Carrot on Plate (w/ Height Change)', 2, 1, 4.5, 4.5]] },
    { id: 'physical', robot: 'bridge', name: 'Физическое обобщение', note: 'новые размеры и формы предметов', trials: 10, tasks: [
      ['Put Carrot on Plate', 1, 0, 1, 8], ['Flip Pot Upright', 2, 6, 5, 8], ['Lift AAA Battery', 0, 0, 2, 7]] },
    { id: 'semantic', robot: 'bridge', name: 'Семантическое обобщение', note: 'новые предметы, команды и понятия из интернета', trials: 10, tasks: [
      ['Move Skull into Drying Rack', 1, 0, 5, 5], ['Lift White Tape', 3, 0, 0, 1], ['Take Purple Grapes out of Pot', 6, 0, 5, 4], ['Stack Blue Cup on Pink Cup', 0.5, 0, 5.5, 4.5]] },
    { id: 'language', robot: 'bridge', name: 'Понимание команды', note: 'два предмета на сцене, команда называет один', trials: 10, tasks: [
      ['Put {Eggplant, Red Bottle} into Pot', 2.5, 4, 8.5, 7.5], ['Lift {Cheese, Red Chili Pepper}', 1.5, 2.5, 8.5, 10], ['Put {Blue Cup, Pink Cup} on Plate', 5, 5.5, 8.5, 9.5]] },
    { id: 'gin', robot: 'google', name: 'Знакомые условия', note: 'задачи и условия из обучающих данных', trials: 5, tasks: [
      ['Pick Coke Can', 5, 1, 5, 5], ['Move Apple near Green Can', 3, 3, 3, 5], ['Move Blue Chip Bag near Apple', 0, 3, 4, 5], ['Place Coke Can Upright', 0, 0, 4, 4], ['Open Middle Drawer', 0, 4, 2, 3]] },
    { id: 'gout', robot: 'google', name: 'Новые условия', note: 'новые предметы, фон, отношения и понятия', trials: 5, tasks: [
      ['Move Orange near Brown Chip Bag', 1, 2, 5, 5], ['Pick Pepsi Can', 3, 0, 5, 4], ['Pick Banana', 5, 3, 5, 5], ['Pick Green Cup', 1, 0, 5, 5], ['Place Apple on Plate', 0, 0, 4, 4], ['Place Banana in Pan', 0, 0, 2, 4], ['Move Coke Can near Taylor Swift', 2, 0, 3, 2]] },
  ];
  /** Доля успехов строки (или набора строк) по каждой модели: сумма успехов / сумма попыток. */
  function tblRate(rows) {
    const succ = [0, 0, 0, 0]; let n = 0;
    for (const row of rows) for (const t of row.tasks) { for (let k = 0; k < 4; k++) succ[k] += t[k + 1]; n += row.trials; }
    return { rates: succ.map((v) => v / n), succ, trials: n, tasks: rows.reduce((s, row) => s + row.tasks.length, 0) };
  }
  const tblGroup = (robot) => tblRate(TBL.filter((r) => !robot || r.robot === robot));

  const API = {
    CMD, SERIES, DOMAINS, camera, scene, features, cellOf, PD, H1, H2, KH, NWORD,
    LAB, labSeed, labDemos, labRun, loraCount, BOWLS, BOWL_R, placeDemos, whichBowl, headMSE, headTokens, DT, SCHED, diffTrain, diffSample, MODELS, TBL, tblRate, tblGroup, setPred: (v) => { PRED = v; },
    vlaInit, vlaClone, vlaPrepare, effective, trainable, paramInfo, forward, backward, softmax, vlaTrain, demo, demos, predict, evalSet, evaluate, pretrain, finetune, FT, finish,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L35 = API;
})(typeof window !== 'undefined' ? window : globalThis);
