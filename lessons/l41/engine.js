/* =====================================================================
   l41/engine.js — урок 4.1 «Масштаб данных в робототехнике». Без DOM:
   работает в браузере и в Node (подбор параметров и тесты).
   1) Калькулятор разрыва: сколько лет читать корпус языковой модели и
      сколько лет записывать датасеты роботов (числа — из досье урока).
   2) Мир лаборатории масштабирования — стол сверху из урока 2.1 (l21/engine.js):
      сцена = цвет стола, освещение, посторонние предметы и свой кубик;
      задача одна — взять кубик. Демонстрации одной сцены отличаются только
      расстановкой. Политика — маленькая сеть по окну вокруг каждой клетки
      сетки 24×24 (карта «где взять», как в 2.1), softmax по клеткам.
      Проверка — на новых сценах: новый стол, свет, помехи и кубик.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L21 = root.L21 || (typeof require !== 'undefined' ? require('../l21/engine.js') : null);
  const { rng, randn, clamp, inShape } = L21;

  /* ---------- 1. калькулятор разрыва ---------- */
  const HOURS_YEAR = 24 * 365;
  /** Годы чтения корпуса: токены → слова → минуты чтения при hoursDay часах в день. */
  function readYears(tokens, o) {
    o = o || {}; const words = tokens * (o.wordsPerToken || 0.75), minutes = words / (o.wpm || 238), hours = minutes / 60;
    return hours / ((o.hoursDay || 24) * 365);
  }
  /** Годы записи: часы данных → годы непрерывной записи одним роботом. */
  const robotYears = (hours) => hours / HOURS_YEAR;
  /** Сколько роботов нужно, чтобы набрать years лет данных за calYears календарных лет при hoursDay часах в день. */
  const fleetFor = (years, calYears, hoursDay) => (years * HOURS_YEAR) / (calYears * 365 * hoursDay);

  /** Корпуса языковых моделей (токены) и датасеты роботов (часы) — из досье урока. */
  const CORPORA = { llama3: { name: 'Llama 3', tokens: 15e12 }, qwen25: { name: 'Qwen2.5', tokens: 18e12 }, qwen3: { name: 'Qwen3', tokens: 36e12 } };
  const ROBOT = [
    { id: 'droid', name: 'DROID', hours: 350 }, { id: 'agibot', name: 'AgiBot World', hours: 2976.4 }, { id: 'pi0', name: 'π0', hours: 10000 },
    { id: 'gen0', name: 'GEN-0', hours: 270000 }, { id: 'gen1', name: 'GEN-1', hours: 500000 },
  ];
  const FAST_PER_S = 53, RAW_PER_S = 700;                        // токенов на секунду пачки: FAST и без сжатия (урок 3.6)

  /* ---------- 2. мир: сцены на столе ---------- */
  const TW = 96, G = 24, CELL = TW / G, WIN = 13, WH = 6, D = WIN * WIN * 3, FLOOR = 0.04;   // отличие от стола меньше 0,04 — шум, считаем нулём   // сцена 96×96, сетка действий 24×24, окно 13×13
  const hsv = (h, s, v) => { const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };
  const CATS = ['bowl', 'can'];                                 // посторонние предметы: миски и банки; брать нужно кубик
  /** Обстановка сцены: стол, свет, посторонние предметы. id — номер сцены. */
  function envMake(id) {
    const r = rng(1000 + id * 7919);
    const table = hsv(r(), 0.05 + 0.3 * r(), 0.68 + 0.28 * r());
    const light = [0, 1, 2].map(() => clamp(1 + randn(r) * 0.18, 0.6, 1.45));
    const nd = 3 + Math.floor(r() * 2), dis = [];
    for (let i = 0; i < nd; i++) dis.push({ shape: CATS[Math.floor(r() * CATS.length)], rgb: hsv(r(), 0.5 + 0.5 * r(), 0.5 + 0.5 * r()), R: 4.8 + 1.6 * r() });
    return { id, table, light, dis };
  }
  /** Кубик сцены: свой цвет и размер. */
  function objMake(id) { const r = rng(5000 + id * 104729); return { shape: 'cube', rgb: hsv(r(), 0.6 + 0.4 * r(), 0.55 + 0.4 * r()), R: 5.0 + 1.4 * r() }; }
  function paintRGB(img, shape, rgb, cx, cy, R, r) {
    for (let y = Math.max(0, Math.floor(cy - R - 1)); y <= Math.min(TW - 1, Math.ceil(cy + R + 1)); y++) for (let x = Math.max(0, Math.floor(cx - R - 1)); x <= Math.min(TW - 1, Math.ceil(cx + R + 1)); x++) {
      if (!inShape(shape, x + 0.5 - cx, y + 0.5 - cy, R)) continue;
      const o = (y * TW + x) * 3, u = (r() - 0.5) * 0.1; for (let c = 0; c < 3; c++) img[o + c] = rgb[c] + u;
    }
  }
  /** Одна расстановка: сцена id, демонстрация k. Картинка 96×96 по байту на канал; цвет стола политика
   *  оценивает сама — медианой по редкой выборке пикселей. Расстановки кэшируются: больший набор содержит меньший. */
  const CACHE = new Map();
  function arrange(id, k) {
    const key = id * 1000 + k; if (CACHE.has(key)) return CACHE.get(key);
    const env = envMake(id), obj = objMake(id), r = rng(id * 1009 + k * 7 + 17), f = new Float32Array(TW * TW * 3);
    for (let i = 0; i < TW * TW; i++) { const u = (r() - 0.5) * 0.05; for (let c = 0; c < 3; c++) f[i * 3 + c] = env.table[c] + u; }
    const items = [{ ...obj, t: true }, ...env.dis], objs = [];
    for (const it of items) { let x, y, n = 0; do { x = 9 + r() * (TW - 18); y = 9 + r() * (TW - 18); n++; } while (n < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 17)); objs.push({ x, y, shape: it.shape, rgb: it.rgb, R: it.R, t: !!it.t }); }
    for (const q of objs) paintRGB(f, q.shape, q.rgb, q.x, q.y, q.R, r);
    const gain = env.light.map((g) => g * (1 + randn(r) * 0.03)), img = new Uint8Array(TW * TW * 3);
    for (let i = 0; i < TW * TW; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = Math.round(clamp(f[i * 3 + c] * gain[c], 0, 1) * 255);
    const tb = [0, 0, 0]; for (let c = 0; c < 3; c++) { const v = []; for (let i = 0; i < TW * TW; i += 13) v.push(img[i * 3 + c]); v.sort((a, b) => a - b); tb[c] = v[v.length >> 1]; }
    const target = objs[0], sc = { id, k, img, tb, objs, target, tcell: cellOf(target.x, target.y) };
    CACHE.set(key, sc); return sc;
  }
  const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, G - 1) * G + clamp(Math.floor(x / CELL), 0, G - 1);
  const cellXY = (i) => ({ x: (i % G + 0.5) * CELL, y: (Math.floor(i / G) + 0.5) * CELL });
  /** Признаки клетки: окно 13×13 пикселей вокруг её центра, модуль отличия от цвета стола. */
  function feat(sc, ci, out) {
    const cx = ci % G, cy = Math.floor(ci / G), x0 = (cx * CELL + 2) - WH, y0 = (cy * CELL + 2) - WH, im = sc.img, tb = sc.tb; let n = 0;
    for (let y = 0; y < WIN; y++) { const Y = y0 + y; for (let x = 0; x < WIN; x++) {
      const X = x0 + x; if (X < 0 || Y < 0 || X >= TW || Y >= TW) { out[n++] = 0; out[n++] = 0; out[n++] = 0; continue; }
      const o = (Y * TW + X) * 3; for (let c = 0; c < 3; c++) { const v = Math.abs(im[o + c] - tb[c]) / 255 - FLOOR; out[n++] = v > 0 ? v : 0; }
    } }
    return out;
  }
  /** Набор данных: сцены 0…M−1, по K демонстраций в каждой. Больший набор содержит меньший, как в статье. */
  const POOL = { base: 0 };                                      // номер первой сцены пула обучения
  function dataset(M, K) { const out = []; for (let i = 0; i < M; i++) for (let k = 0; k < K; k++) out.push(arrange(POOL.base + i, k)); return out; }
  const TEST0 = 9000;
  /** Проверка: n новых сцен, которых нет ни в одном наборе. */
  function testSet(n) { const out = []; for (let i = 0; i < (n || 100); i++) out.push(arrange(TEST0 + i, 0)); return out; }

  /* ---------- политика: окно → H (tanh) → оценка клетки ---------- */
  const H = 8;
  function polInit(seed) { const r = rng(seed || 3); return { W: Float64Array.from({ length: D * H }, () => randn(r) * Math.sqrt(1 / D)), b: new Float64Array(H), v: Float64Array.from({ length: H }, () => randn(r) * Math.sqrt(1 / H)) }; }
  const ACC = new Float64Array(H);
  /** Оценка клетки по признакам x; h — выходы скрытого слоя (нужны для обучения). Нулевые признаки пропускаем: почти всё окно — стол. */
  function cellScore(m, x, h) {
    const W = m.W; for (let j = 0; j < H; j++) ACC[j] = m.b[j];
    for (let d = 0; d < D; d++) { const xd = x[d]; if (xd === 0) continue; const o = d * H; for (let j = 0; j < H; j++) ACC[j] += xd * W[o + j]; }
    let z = 0; for (let j = 0; j < H; j++) { h[j] = Math.tanh(ACC[j]); z += m.v[j] * h[j]; }
    return z;
  }
  /** Обучение: генератор, отдаёт прогресс, в конце — модель. Шагов одинаково для любого набора. */
  function* polTrain(set, o) {
    o = o || {}; const seed = o.seed || 4, m = polInit(seed), r = rng(seed + 101), steps = o.steps || 300, B = o.batch || 8, NC = o.cells || 32, lr = o.lr || 0.005;
    const P = [m.W, m.b, m.v], Gr = P.map((p) => new Float64Array(p.length)), M1 = P.map((p) => new Float64Array(p.length)), M2 = P.map((p) => new Float64Array(p.length));
    const X = Array.from({ length: NC }, () => new Float64Array(D)), Hs = Array.from({ length: NC }, () => new Float64Array(H)), cells = new Array(NC), z = new Float64Array(NC), GA = new Float64Array(H);
    for (let s = 0; s < steps; s++) {
      Gr.forEach((g) => g.fill(0));
      for (let bi = 0; bi < B; bi++) {
        const sc = set[Math.floor(r() * set.length)]; let n = 0;
        cells[n++] = sc.tcell; for (const q of sc.objs) if (!q.t && n < NC) cells[n++] = cellOf(q.x, q.y);
        while (n < NC) cells[n++] = Math.floor(r() * G * G);
        let mx = -1e9; for (let j = 0; j < NC; j++) { feat(sc, cells[j], X[j]); z[j] = cellScore(m, X[j], Hs[j]); if (z[j] > mx) mx = z[j]; }
        let Z = 0; for (let j = 0; j < NC; j++) { z[j] = Math.exp(z[j] - mx); Z += z[j]; }
        for (let j = 0; j < NC; j++) {
          const gz = z[j] / Z - (j === 0 ? 1 : 0); if (Math.abs(gz) < 1e-7) continue; const x = X[j], h = Hs[j];
          for (let k = 0; k < H; k++) { Gr[2][k] += gz * h[k]; GA[k] = gz * m.v[k] * (1 - h[k] * h[k]); Gr[1][k] += GA[k]; }
          const gw = Gr[0]; for (let d = 0; d < D; d++) { const xd = x[d]; if (xd === 0) continue; const o = d * H; for (let k = 0; k < H; k++) gw[o + k] += GA[k] * xd; }
        }
      }
      const t = s + 1, c1 = 1 - Math.pow(0.9, t), c2 = 1 - Math.pow(0.999, t);
      for (let pi = 0; pi < 3; pi++) { const p = P[pi], g = Gr[pi], a = M1[pi], b2 = M2[pi]; for (let i = 0; i < p.length; i++) { const gi = g[i] / B; a[i] = 0.9 * a[i] + 0.1 * gi; b2[i] = 0.999 * b2[i] + 0.001 * gi * gi; p[i] -= lr * (a[i] / c1) / (Math.sqrt(b2[i] / c2) + 1e-8); } }
      if (s % 20 === 0 || s === steps - 1) yield { it: s, iters: steps };
    }
    return m;
  }
  /** Карта оценок по всем клеткам и выбранная клетка. */
  function polMap(m, sc) { const x = new Float64Array(D), h = new Float64Array(H), s = new Float64Array(G * G); let bi = 0; for (let i = 0; i < G * G; i++) { s[i] = cellScore(m, feat(sc, i, x), h); if (s[i] > s[bi]) bi = i; } return { s, best: bi, p: cellXY(bi) }; }
  const hitCube = (sc, p) => Math.hypot(p.x - sc.target.x, p.y - sc.target.y) < 4.5;
  /** Проверка на наборе сцен: сколько раз взят кубик; что взято вместо него. */
  function evaluate(m, test) {
    const runs = test.map((sc) => { const mp = polMap(m, sc), ok = hitCube(sc, mp.p), other = ok ? null : sc.objs.find((q) => !q.t && Math.hypot(q.x - mp.p.x, q.y - mp.p.y) < q.R); return { id: sc.id, p: mp.p, ok, miss: ok ? null : other ? other.shape : 'table' }; });
    const ok = runs.filter((q) => q.ok).length;
    return { runs, ok, n: test.length, rate: ok / test.length, gap: 1 - ok / test.length };
  }
  /** То же по шагам: генератор отдаёт прогресс после каждой сцены, чтобы страница не замирала. */
  function* evaluateGen(m, test) {
    const runs = [];
    for (let i = 0; i < test.length; i++) {
      const sc = test[i], mp = polMap(m, sc), ok = hitCube(sc, mp.p), other = ok ? null : sc.objs.find((q) => !q.t && Math.hypot(q.x - mp.p.x, q.y - mp.p.y) < q.R);
      runs.push({ id: sc.id, p: mp.p, ok, miss: ok ? null : other ? other.shape : 'table' });
      yield { it: i, iters: test.length };
    }
    const ok = runs.filter((q) => q.ok).length;
    return { runs, ok, n: test.length, rate: ok / test.length, gap: 1 - ok / test.length };
  }
  /** Набор по шагам (сцены считаются и кэшируются при первом обращении). */
  function* datasetGen(M, K) { const out = []; for (let i = 0; i < M; i++) for (let k = 0; k < K; k++) { out.push(arrange(POOL.base + i, k)); if (out.length % 16 === 0) yield { it: out.length, iters: M * K }; } return out; }
  /** Прямая в логарифмических осях: log y = a + b log x; r — коэффициент корреляции. */
  function powerFit(pts) {
    const P = pts.filter((q) => q.x > 0 && q.y > 0).map((q) => [Math.log(q.x), Math.log(q.y)]), n = P.length;
    if (n < 2) return null;
    const mx = P.reduce((s, q) => s + q[0], 0) / n, my = P.reduce((s, q) => s + q[1], 0) / n;
    let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of P) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    const b = sxx ? sxy / sxx : 0, a = my - b * mx, r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    return { beta: Math.exp(a), alpha: -b, r, at: (x) => Math.exp(a) * Math.pow(x, b), xFor: (y) => Math.pow(y / Math.exp(a), 1 / b) };
  }
  function finish(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }

  const API = { HOURS_YEAR, readYears, robotYears, fleetFor, CORPORA, ROBOT, FAST_PER_S, RAW_PER_S, TW, G, CELL, WIN, CACHE, D, H, hsv, envMake, objMake, arrange, cellOf, cellXY, feat, dataset, POOL, testSet, TEST0, polInit, polTrain, polMap, hitCube, evaluate, evaluateGen, datasetGen, powerFit, finish };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L41 = API;
})(typeof window !== 'undefined' ? window : globalThis);
