/* =====================================================================
   l46/engine.js — движок урока 4.6 «Пирамида данных и маховик». Без DOM:
   работает в браузере (window.L46, поверх window.L21) и в Node.
   1) Мир: вид на стол сверху 96 × 96 из урока 2.1, задача одна — «возьми
      кубик». Кухня — скатерть, свет, цвет кубика и три соседа (миски, банки).
      Ада работает в чужих домах: там бывают узорные скатерти и любой свет.
   2) Три источника эпизодов — три слоя пирамиды данных:
      — робот: камера Ады (шум, тени, приглушённые цвета, свет дома), действие
        оператора точное; домов, куда пустили Аду с оператором, всего четыре;
      — симуляция: картинка рендера (ровные цвета, без шума и теней, дневной
        свет, однотонные скатерти), кухни любые; контакт смоделирован грубо,
        и сгенерированный захват бывает у края кубика — в симуляции он держит,
        в жизни соскальзывает;
      — видео людей: настоящие дома, все разные, но действия робота нет —
        его восстанавливает модель обратной динамики, с ошибкой: человек
        берёт кубик пальцами сбоку, иногда это вообще другой предмет.
   3) Мини-политика «где взять»: признаки клетки 24 × 24 — средние цвета
      окна 3 × 3 клетки (27 чисел), 16 нейронов ReLU, оценка; softmax по 576
      клеткам. Две головы: действия робота и псевдодействия по видео (своё
      «воплощение», как у GR00T N1). Пачки собираются из источников по весам.
   4) Планировщик бюджета: цены источников (условные) и смесь для обучения.
   5) Маховик: парк роботов работает в новых домах; удачи и размеченные
      людьми отказы идут в данные, модель переобучается.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp, COLORS, CI, TW, G, CELL, RT, inShape, cellOf, cellXY, hitObj, softmax, argmax } = L;

  /* ---------- 1. кухни ---------- */
  const TABLES = [
    { id: 'linen', name: 'светлый лён', a: [0.93, 0.92, 0.89], b: null, pat: 'plain' },
    { id: 'white', name: 'белая', a: [0.97, 0.97, 0.97], b: null, pat: 'plain' },
    { id: 'grey', name: 'серый пластик', a: [0.66, 0.67, 0.69], b: null, pat: 'plain' },
    { id: 'oak', name: 'светлый дуб', a: [0.84, 0.7, 0.52], b: [0.78, 0.63, 0.46], pat: 'stripes' },
    { id: 'mint', name: 'мятная', a: [0.74, 0.88, 0.8], b: null, pat: 'plain' },
    { id: 'sky', name: 'голубая', a: [0.72, 0.8, 0.92], b: null, pat: 'plain' },
    { id: 'picnic', name: 'клетчатая красно-белая', a: [0.95, 0.94, 0.92], b: [0.9, 0.42, 0.4], pat: 'check' },
    { id: 'blueCheck', name: 'клетчатая сине-белая', a: [0.95, 0.95, 0.95], b: [0.45, 0.58, 0.85], pat: 'check' },
    { id: 'sand', name: 'песочная', a: [0.9, 0.84, 0.7], b: null, pat: 'plain' },
  ];
  const LIGHTS = [
    { id: 'day', name: 'дневной', g: [1, 1, 1] },
    { id: 'warm', name: 'тёплая лампа', g: [1.06, 0.93, 0.74] },
    { id: 'cool', name: 'холодная лампа', g: [0.86, 0.95, 1.08] },
    { id: 'dim', name: 'полумрак', g: [0.72, 0.72, 0.74] },
    { id: 'evening', name: 'вечер', g: [0.9, 0.78, 0.66] },
  ];
  const CUBE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  // соседи кубика — миски и банки шести цветов (мячей нет: сверху на такой сетке мяч и кубик почти не различить)
  const OTHERS = [];
  for (const shape of ['bowl', 'can']) for (const color of CUBE_COLORS) OTHERS.push({ color, shape });
  /** Кухня с зерном: скатерть, свет, цвет кубика и три соседа — случайные. */
  function kitchen(seed) {
    const r = rng(seed * 7919 + 13), pick = (n) => Math.floor(r() * n);
    const table = pick(TABLES.length), light = pick(LIGHTS.length), cube = CUBE_COLORS[pick(CUBE_COLORS.length)];
    const ids = OTHERS.map((_, i) => i); for (let i = ids.length - 1; i > 0; i--) { const j = pick(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return { seed, table, light, cube, objs: ids.slice(0, 3) };
  }
  function tableColor(T, x, y) {
    if (T.pat === 'check') return ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? T.b : T.a;
    if (T.pat === 'stripes') return (Math.floor(y / 4) % 2) ? T.b : T.a;
    return T.a;
  }
  /** Расстановка: кубик и три соседа в случайных местах без наложений. */
  function layout(kit, r) {
    const objs = [], spec = [{ color: kit.cube, shape: 'cube' }].concat(kit.objs.map((i) => OTHERS[i])), m = 10;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 19));
      objs.push({ color: it.color, shape: it.shape, x, y });
    }
    return objs;
  }
  // как выглядит картинка у каждого источника
  const LOOK = {
    real: { noise: 0.02, objNoise: 0.04, light: true, pattern: true, shadow: 0.25, tint: 0.12 },   // камера Ады
    sim: { noise: 0, objNoise: 0, light: false, pattern: false, shadow: 0, tint: 0 },               // рендер симулятора
  };
  /** Предмет на картинке: цвет предмета (в жизни — чуть приглушённый), с тенью внизу справа. */
  function paintObj(img, q, look, r) {
    const base = COLORS[CI[q.color]].rgb, rgb = base.map((v) => v + (0.6 - v) * look.tint);
    const x0 = Math.floor(q.x - RT - 4), x1 = Math.ceil(q.x + RT + 4), y0 = Math.floor(q.y - RT - 4), y1 = Math.ceil(q.y + RT + 4);
    if (look.shadow) for (let y = Math.max(0, y0); y <= Math.min(TW - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(TW - 1, x1); x++) {
      if (!inShape(q.shape, x + 0.5 - q.x - 2, y + 0.5 - q.y - 2, RT)) continue;
      const o = (y * TW + x) * 3; for (let c = 0; c < 3; c++) img[o + c] *= 1 - look.shadow;
    }
    const top = q.shape === 'sponge' ? COLORS[CI.green].rgb.map((v) => v + (0.6 - v) * look.tint) : null;   // губка: жёлтая с зелёным жёстким слоем
    for (let y = Math.max(0, y0); y <= Math.min(TW - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(TW - 1, x1); x++) {
      if (!inShape(q.shape, x + 0.5 - q.x, y + 0.5 - q.y, RT)) continue;
      const col = top && y + 0.5 < q.y ? top : rgb;
      const o = (y * TW + x) * 3; for (let c = 0; c < 3; c++) img[o + c] = clamp(col[c] + (look.objNoise ? randn(r) * look.objNoise : 0), 0, 1);
    }
  }
  /** Картинка эпизода: скатерть, предметы, свет; look — real или sim. */
  function render(kit, objs, look, r) {
    const T = TABLES[kit.table], Lg = look.light ? LIGHTS[kit.light].g : [1, 1, 1], img = new Float32Array(TW * TW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const c = look.pattern ? tableColor(T, x, y) : T.a, o = (y * TW + x) * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = c[ch] + (look.noise ? randn(r) * look.noise : 0); }
    for (const q of objs) paintObj(img, q, look, r);
    for (let i = 0; i < TW * TW; i++) for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = clamp(img[i * 3 + ch] * Lg[ch], 0, 1);
    return img;
  }
  /** Эпизод источника src ('robot' | 'sim' | 'video') в кухне kit. */
  function episode(kit, seed, src) {
    const r = rng((seed * 2654435761) % 4294967291 + 17), objs = layout(kit, r);
    const img = render(kit, objs, src === 'sim' ? LOOK.sim : LOOK.real, r);
    return { kit, seed, src, objs, target: objs[0], img };
  }

  /* ---------- 2. мини-политика «где взять» ---------- */
  const WN = 3, NF = WN * WN * 3, NH = 16;
  /** Сетка 24 × 24: среднее по клеткам 4 × 4 пикселя. */
  function grid(img) {
    const g = new Float64Array(G * G * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / CELL) * G + Math.floor(x / CELL)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (CELL * CELL); }
    return g;
  }
  /** Признаки всех 576 клеток: окно 3 × 3 клетки вокруг; за краем стола — 0,5; минус 0,5. */
  function feats(ep) {
    if (ep.F) return ep.F;
    const F = new Float32Array(G * G * NF), g = ep.g || (ep.g = grid(ep.img)), half = (WN - 1) / 2;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      let n = (cy * G + cx) * NF;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const x = cx + dx, y = cy + dy, ins = x >= 0 && y >= 0 && x < G && y < G, o = (y * G + x) * 3;
        for (let c = 0; c < 3; c++) F[n++] = (ins ? g[o + c] : 0.5) - 0.5;
      }
    }
    ep.F = F; return F;
  }
  const NHEAD = 2;                       // голова 0 — действия робота (и симуляции), голова 1 — псевдодействия по видео
  function modelInit(seed) {
    const r = rng(seed || 5), W1 = new Float64Array(NF * NH), b1 = new Float64Array(NH), w2 = new Float64Array(NH * NHEAD), s = Math.sqrt(2 / NF);
    for (let i = 0; i < W1.length; i++) W1[i] = randn(r) * s;
    for (let j = 0; j < NH; j++) { const v = randn(r) * Math.sqrt(1 / NH); for (let h = 0; h < NHEAD; h++) w2[h * NH + j] = v; }
    const P = [W1, b1, w2, new Float64Array(NHEAD)];
    return { P, G: P.map((p) => new Float64Array(p.length)), M: P.map((p) => new Float64Array(p.length)), V: P.map((p) => new Float64Array(p.length)), t: 0 };
  }
  /** Оценки всех клеток головой head; hid — скрытые активации (для обратного прохода). */
  function scores(m, F, hid, head) {
    const [W1, b1, w2all, b2] = m.P, s = new Float64Array(G * G), ho = (head || 0) * NH;
    for (let i = 0; i < G * G; i++) {
      const o = i * NF; let v = b2[head || 0];
      for (let j = 0; j < NH; j++) {
        let a = b1[j];
        for (let k = 0; k < NF; k++) a += F[o + k] * W1[k * NH + j];
        if (a < 0) a = 0;
        if (hid) hid[i * NH + j] = a;
        v += a * w2all[ho + j];
      }
      s[i] = v;
    }
    return s;
  }
  function adamStep(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    m.P.forEach((P, q) => { const Gq = m.G[q], M = m.M[q], V = m.V[q]; for (let i = 0; i < P.length; i++) { const g = Gq[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); Gq[i] = 0; } });
  }
  /** Обучение на смеси: groups = [{ demos, w, head }]; для каждого примера пачки сначала источник по весам, потом эпизод.
      head — какой головой учить: 0 — действия робота, 1 — псевдодействия по видео (своё «воплощение», как у GR00T N1). */
  function* train(groups, o) {
    o = o || {}; const m = modelInit(o.seed || 5), iters = o.iters || CFG.ITERS, lr = o.lr || CFG.LR, bs = o.bs || 8, r = rng(o.seed ? o.seed * 31 + 1 : 77);
    const gs = groups.filter((q) => q.demos.length && q.w > 0), W = gs.reduce((s, q) => s + q.w, 0);
    if (!gs.length) return null;
    const hid = new Float64Array(G * G * NH), [W1, , w2] = m.P, [gW1, gb1, gw2, gb2] = m.G;
    const pickGroup = () => { let u = r() * W; for (const q of gs) { u -= q.w; if (u <= 0) return q; } return gs[gs.length - 1]; };
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const q = pickGroup(), hd = q.head || 0, ho = hd * NH, d = q.demos[Math.floor(r() * q.demos.length)], F = feats(d.ep), s = scores(m, F, hid, hd), p = softmax(s);
        loss -= Math.log(p[d.cell] + 1e-12) / bs;
        for (let i = 0; i < G * G; i++) {
          const gi = p[i] - (i === d.cell ? 1 : 0); if (Math.abs(gi) < 1e-5) continue;
          gb2[hd] += gi; const o2 = i * NF;
          for (let j = 0; j < NH; j++) {
            const a = hid[i * NH + j]; if (a <= 0) continue;
            gw2[ho + j] += gi * a; const gj = gi * w2[ho + j]; gb1[j] += gj;
            for (let k = 0; k < NF; k++) gW1[k * NH + j] += gj * F[o2 + k];
          }
        }
      }
      adamStep(m, lr, bs);
      if (it % 20 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  const finish = (gen) => { for (;;) { const r = gen.next(); if (r.done) return r.value; } };
  function probs(m, ep) { return softmax(scores(m, feats(ep))); }
  /** Удержит ли захват кубик: в жизни — только если сомкнулся ближе HOLD пикселей к центру. */
  const holds = (q, x, y) => Math.hypot(q.x - x, q.y - y) < CFG.HOLD;
  /** Доля удачных попыток: сумма вероятностей клеток, где захват удержит кубик. */
  function hitMass(p, ep) { let ok = 0; for (let i = 0; i < G * G; i++) { const c = cellXY(i); if (holds(ep.target, c.x, c.y)) ok += p[i]; } return ok; }
  function check(m, eps) {
    const runs = eps.map((ep) => { const p = probs(m, ep), i = argmax(p), c = cellXY(i), top = ep.objs.find((q) => hitObj(q, c.x, c.y)) || null; return { p: hitMass(p, ep), top, topOk: top === ep.target }; });
    return { rate: runs.reduce((t, q) => t + q.p, 0) / runs.length, runs, n: runs.length };
  }

  /* ---------- 3. источники и наборы данных ---------- */
  const CFG = {
    ITERS: 300, LR: 0.02, TEST: 48, TEST_SEED: 9000,
    HOLD: 3.6,                            // в жизни захват держит кубик, если сомкнулся ближе 3,6 px (≈1,8 см) к центру
    SIM_SPREAD: 1.5,                      // сгенерированный в симуляции захват — до ±1,5 px от центра по каждой оси
    VID: { dy: 2, sd: 2, wrong: 0.1 },    // псевдодействие по видео: сдвиг к человеку, разброс, доля «не тот предмет»
    ROBOT_HOMES: 4, ROBOT_SEED: 60000, SIM_SEED: 20000, VID_SEED: 40000, OFF: 100,
    // лаборатория, где обучали первую версию Ады для маховика: однотонные скатерти, дневной свет, кубики только красные
    LAB_KITS: 4, LAB_SEED: 500, LAB_TABLES: [1, 2, 0, 5], LAB_CUBE: 'red',
    LAB_OBJS: [[['blue', 'bowl'], ['green', 'can'], ['yellow', 'bowl']], [['green', 'bowl'], ['blue', 'can'], ['purple', 'bowl']], [['yellow', 'can'], ['blue', 'bowl'], ['green', 'bowl']], [['purple', 'can'], ['yellow', 'bowl'], ['blue', 'can']]],
  };
  const labKits = () => {
    const out = [];
    for (let i = 0; i < CFG.LAB_KITS; i++) {
      const k = kitchen(CFG.LAB_SEED + i); k.table = CFG.LAB_TABLES[i % CFG.LAB_TABLES.length]; k.light = 0; k.cube = CFG.LAB_CUBE;
      k.objs = CFG.LAB_OBJS[i % CFG.LAB_OBJS.length].map(([c, sh]) => OTHERS.findIndex((q) => q.color === c && q.shape === sh));
      out.push(k);
    }
    return out;
  };
  /** Действие эпизода: робот — центр кубика (±1 px); симуляция — до ±SIM_SPREAD; видео — псевдодействие с ошибкой. */
  function label(ep, seed) {
    const r = rng(seed * 97 + 5), t = ep.target;
    if (ep.src === 'robot') return { ep, cell: cellOf(t.x + (r() - 0.5) * 2, t.y + (r() - 0.5) * 2), ok: true };
    if (ep.src === 'sim') { const cell = cellOf(t.x + (r() - 0.5) * 2 * CFG.SIM_SPREAD, t.y + (r() - 0.5) * 2 * CFG.SIM_SPREAD), c = cellXY(cell); return { ep, cell, ok: holds(t, c.x, c.y) }; }
    if (r() < CFG.VID.wrong) { const q = ep.objs[1 + Math.floor(r() * (ep.objs.length - 1))]; return { ep, cell: cellOf(q.x, q.y), ok: false, wrong: true }; }
    const cell = cellOf(clamp(t.x + randn(r) * CFG.VID.sd, 0, TW - 1), clamp(t.y + CFG.VID.dy + randn(r) * CFG.VID.sd, 0, TW - 1)), c = cellXY(cell);
    return { ep, cell, ok: holds(t, c.x, c.y) };
  }
  /** n эпизодов источника: 'robot' — по кругу в четырёх домах; 'lab' — камера робота в лаборатории; 'sim' и 'video' — каждый эпизод в своей кухне. */
  function source(src, n, off) {
    off = off == null ? CFG.OFF : off; const out = [], lab = src === 'lab' ? labKits() : null;
    for (let i = 0; i < n; i++) {
      const j = i + off, kit = lab ? lab[j % lab.length] : kitchen(src === 'robot' ? CFG.ROBOT_SEED + (j % CFG.ROBOT_HOMES) : (src === 'sim' ? CFG.SIM_SEED : CFG.VID_SEED) + j * 10);
      const ep = episode(kit, (src === 'robot' ? 3000 : src === 'lab' ? 4000 : src === 'sim' ? 5000 : 7000) + j * 13, src === 'lab' ? 'robot' : src);
      out.push(Object.assign(label(ep, j + 1 + (src === 'video' ? 50000 : 0)), { src }));
    }
    return out;
  }
  /** Проверка: новые дома, по эпизоду в каждом, камера Ады. */
  function testSet(n) { const out = []; for (let i = 0; i < (n || CFG.TEST); i++) out.push(episode(kitchen(CFG.TEST_SEED + i), CFG.TEST_SEED * 3 + i, 'robot')); return out; }

  /* ---------- 4. планировщик бюджета (цены условные) ---------- */
  const PLAN = {
    BUDGET: 100,
    robot: { per: 3, setup: 0, max: 32, step: 4 },     // эпизод с оператором в доме; срок не даёт записать больше 32
    sim: { per: 0.05, setup: 10, max: 800, step: 100 }, // сцены и ассеты — 10, дальше 5 за каждые 100 эпизодов
    video: { per: 0.02, setup: 10, max: 800, step: 100 }, // модель обратной динамики — 10, дальше 2 за каждые 100
  };
  const SRC = ['robot', 'sim', 'video'];
  /** Цена плана { robot, sim, video } по источникам и всего. */
  function cost(plan) {
    const by = {}; let total = 0;
    for (const k of SRC) { const n = plan[k] || 0, P = PLAN[k]; by[k] = n ? P.setup + P.per * n : 0; total += by[k]; }
    return { by, total: Math.round(total * 100) / 100, ok: total <= PLAN.BUDGET + 1e-9 };
  }
  /** Группы для обучения: веса — поровну между источниками ('eq': робот 0,4, остальные делят 0,6) или пропорционально числу эпизодов ('prop').
      Видео учит свою голову (head 1), если sameHead не задан. */
  function groups(plan, o) {
    o = o || {}; const mode = o.mode || 'eq', n = SRC.reduce((t, k) => t + (plan[k] || 0), 0), rest = SRC.filter((k) => k !== 'robot' && plan[k]).length, gs = [];
    for (const k of SRC) {
      const cnt = plan[k] || 0; if (!cnt) continue;
      let w = mode === 'prop' ? cnt / n : k === 'robot' ? (rest ? 0.4 : 1) : (plan.robot ? 0.6 : 1) / rest;
      gs.push({ src: k, demos: (o.source || source)(k, cnt), w, head: k === 'video' && !o.sameHead ? 1 : 0 });
    }
    return gs;
  }

  /* ---------- 5. маховик: парк роботов в домах ---------- */
  const FLY = { SEED: 80000, SHIFTS: 4, TRAIN: 300, BASE: 16, W_FLEET: 0.7, ATTEMPTS: 6 };
  /** Первая версия Ады: 16 демонстраций в лаборатории, где все кубики красные. */
  const flyBase = () => [{ demos: source('lab', FLY.BASE, 0), w: 1 }];
  /** Дом, где робот i работает в смену it: каждую смену парк попадает в новые дома. */
  const fleetHome = (i, it) => kitchen(FLY.SEED + it * 997 + i);
  /** Смена парка: каждый робот делает attempts попыток; удачи идут в данные сами (захват сомкнулся на кубике),
      отказы — только если человек разметил, где надо было взять. */
  function shift(m, it, robots, attempts, share, seed) {
    const r = rng(seed * 131 + it * 7 + 3), got = [], log = [];
    for (let i = 0; i < robots; i++) {
      const kit = fleetHome(i, it), row = [];
      for (let a = 0; a < attempts; a++) {
        const ep = episode(kit, FLY.SEED * 3 + it * 1000 + i * 37 + a, 'robot'), p = probs(m, ep);
        let u = r(), cell = 0; for (; cell < p.length - 1; cell++) { u -= p[cell]; if (u <= 0) break; }
        const c = cellXY(cell), ok = holds(ep.target, c.x, c.y), fix = !ok && r() < share;
        const kind = ok ? 'ok' : fix ? 'fix' : 'lost';
        if (ok) got.push({ ep, cell, kind }); else if (fix) got.push(Object.assign(label(ep, it * 1000 + i * 37 + a), { kind }));
        row.push({ kind, ep, cell });
      }
      log.push(row);
    }
    return { got, log };
  }
  /** Маховик: смены и переобучение. o: { robots, share, shifts, test, seed, m0 }. Генератор отдаёт прогресс, в конце — история. */
  function* flywheel(o) {
    const robots = o.robots, attempts = o.attempts || FLY.ATTEMPTS, share = o.share == null ? 0.5 : o.share, shifts = o.shifts || FLY.SHIFTS, base = flyBase();
    let fleet = [], m = o.m0 || null; const hist = [];
    for (let it = 0; it <= shifts; it++) {
      if (!m || it > 0) {
        const g = fleet.length ? base.map((q) => Object.assign({}, q, { w: 1 - FLY.W_FLEET })).concat([{ demos: fleet, w: FLY.W_FLEET }]) : base;
        const gen = train(g, { iters: FLY.TRAIN }); let rr;
        for (;;) { rr = gen.next(); if (rr.done) break; yield { it, of: shifts + 1, frac: (rr.value.it + 1) / rr.value.iters }; }
        m = rr.value;
      }
      const h = { it, m, rate: check(m, o.test).rate, data: fleet.length };
      if (it < shifts) {
        const sh = shift(m, it, robots, attempts, share, o.seed || 1), all = sh.log.flat();
        Object.assign(h, { log: sh.log, ok: all.filter((x) => x.kind === 'ok').length, fix: all.filter((x) => x.kind === 'fix').length, lost: all.filter((x) => x.kind === 'lost').length });
        fleet = fleet.concat(sh.got);
      }
      hist.push(h);
    }
    return hist;
  }

  const API = { CFG, TABLES, LIGHTS, OTHERS, CUBE_COLORS, LOOK, kitchen, labKits, layout, render, episode, grid, feats, modelInit, scores, train, finish, probs, holds, hitMass, check,
    label, source, testSet, PLAN, SRC, cost, groups, FLY, flyBase, fleetHome, shift, flywheel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L46 = API;
})(typeof window !== 'undefined' ? window : globalThis);
