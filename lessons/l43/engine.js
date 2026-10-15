/* =====================================================================
   l43/engine.js — движок урока 4.3 «Датасеты роботов». Без DOM: работает
   в браузере (window.L43, поверх window.L21) и в Node (require l21).
   1) Мир: вид на стол сверху 96 × 96 из урока 2.1, задача одна — «возьми
      кубик». Кухня — набор свойств сцены: скатерть (цвет и узор),
      свет (яркость и оттенок), предметы рядом с кубиком. Эпизод — та же
      кухня с предметами в новых местах.
   2) Мини-политика «где взять»: признаки клетки сетки 24 × 24 — окно
      12 × 12 px вокруг её центра, сжатое до 6 × 6 (108 чисел), скрытый слой
      ReLU и оценка клетки; softmax по 576 клеткам, перекрёстная энтропия
      по клетке, где взял оператор.
      Нелинейная версия карты из урока 2.1.
   3) Наборы данных с одним бюджетом эпизодов: одна кухня против многих;
      какие свойства кухонь меняются — скатерть, свет, предметы.
   4) Отбор данных: в набор подмешаны эпизоды «мимо» (захват на столе
      рядом с кубиком) и «не тот предмет» (оператор взял банку или миску).
   5) Таблица датасетов — числа из статей, для интерактива с наведением.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp, COLORS, CI, TW, G, CELL, RT, paint, cellOf, cellXY, hitObj, softmax, argmax } = L;

  /* ---------- 1. кухни: скатерть, свет, предметы ---------- */
  // скатерти: основной цвет, второй цвет и узор (клетка, полосы); первая — «домашняя» кухня
  const TABLES = [
    { id: 'linen', name: 'светлый лён', a: [0.93, 0.92, 0.89], b: null, pat: 'plain' },
    { id: 'white', name: 'белая', a: [0.97, 0.97, 0.97], b: null, pat: 'plain' },
    { id: 'grey', name: 'серый пластик', a: [0.66, 0.67, 0.69], b: null, pat: 'plain' },
    { id: 'oak', name: 'светлый дуб', a: [0.84, 0.7, 0.52], b: [0.78, 0.63, 0.46], pat: 'stripes' },
    { id: 'walnut', name: 'орех', a: [0.6, 0.45, 0.34], b: [0.55, 0.41, 0.31], pat: 'stripes' },
    { id: 'mint', name: 'мятная', a: [0.74, 0.88, 0.8], b: null, pat: 'plain' },
    { id: 'sky', name: 'голубая', a: [0.72, 0.8, 0.92], b: null, pat: 'plain' },
    { id: 'picnic', name: 'клетчатая красно-белая', a: [0.95, 0.94, 0.92], b: [0.9, 0.42, 0.4], pat: 'check' },
    { id: 'blueCheck', name: 'клетчатая сине-белая', a: [0.95, 0.95, 0.95], b: [0.45, 0.58, 0.85], pat: 'check' },
    { id: 'terra', name: 'терракотовая', a: [0.86, 0.6, 0.48], b: null, pat: 'plain' },
  ];
  const LIGHTS = [
    { id: 'day', name: 'дневной', g: [1, 1, 1] },
    { id: 'warm', name: 'тёплая лампа', g: [1.06, 0.93, 0.74] },
    { id: 'cool', name: 'холодная лампа', g: [0.86, 0.95, 1.08] },
    { id: 'dim', name: 'полумрак', g: [0.72, 0.72, 0.74] },
    { id: 'evening', name: 'вечер', g: [0.9, 0.78, 0.66] },
  ];
  // кубик бывает любого цвета; соседи — миски и банки любых цветов (мячи не берём: сверху мяч и кубик почти не различить)
  const CUBE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  const OTHERS = [];
  for (const shape of ['bowl', 'can']) for (const color of CUBE_COLORS) OTHERS.push({ color, shape });
  const oi = (color, shape) => OTHERS.findIndex((q) => q.color === color && q.shape === shape);
  // домашняя кухня: светлый лён, дневной свет, красный кубик, синяя миска, зелёная банка, жёлтая миска
  const HOME = { table: 0, light: 0, cube: 'red', objs: [oi('blue', 'bowl'), oi('green', 'can'), oi('yellow', 'bowl')] };
  const AXES = ['table', 'light', 'objs'];
  const AXIS_NAME = { table: 'скатерть', light: 'свет', objs: 'предметы' };
  /** Кухня с зерном: свойства из включённых осей случайны, остальные — как дома. */
  function kitchen(seed, axes) {
    const r = rng(seed * 7919 + 13), on = (a) => !axes || axes[a];
    const pick = (n) => Math.floor(r() * n);
    const table = on('table') ? pick(TABLES.length) : HOME.table;
    const light = on('light') ? pick(LIGHTS.length) : HOME.light;
    let objs = HOME.objs.slice(), cube = HOME.cube;
    if (on('objs')) { cube = CUBE_COLORS[pick(CUBE_COLORS.length)]; const ids = OTHERS.map((_, i) => i); for (let i = ids.length - 1; i > 0; i--) { const j = pick(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; } objs = ids.slice(0, 3); }
    return { seed, table, light, cube, objs };
  }
  const sameKitchen = (a, b) => a.table === b.table && a.light === b.light && a.cube === b.cube && a.objs.slice().sort().join() === b.objs.slice().sort().join();
  /** Скатерть в картинке: узор клеткой 8 px или полосами 4 px. */
  function tableColor(T, x, y) {
    if (T.pat === 'check') return ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? T.b : T.a;
    if (T.pat === 'stripes') return (Math.floor(y / 4) % 2) ? T.b : T.a;
    return T.a;
  }
  /** Эпизод: красный кубик и три соседа кухни в случайных местах; картинка 96 × 96 под светом кухни. */
  function episode(kit, seed) {
    const r = rng(seed * 2654435761 % 4294967291 + 17), objs = [], spec = [{ color: kit.cube, shape: 'cube' }].concat(kit.objs.map((i) => OTHERS[i])), m = 10;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 19));
      objs.push({ color: it.color, shape: it.shape, x, y });
    }
    const T = TABLES[kit.table], Lg = LIGHTS[kit.light].g, img = new Float32Array(TW * TW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const c = tableColor(T, x, y), o = (y * TW + x) * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = c[ch] + randn(r) * 0.015; }
    for (const q of objs) paint(img, TW, TW, q.color, q.shape, q.x, q.y, RT, r, 0.03);
    for (let i = 0; i < TW * TW; i++) for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = clamp(img[i * 3 + ch] * Lg[ch], 0, 1);
    return { kit, seed, objs, target: objs[0], img, grid: toGrid(img) };
  }
  function toGrid(img) {
    const g = new Float64Array(G * G * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / CELL) * G + Math.floor(x / CELL)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (CELL * CELL); }
    return g;
  }

  /* ---------- 2. мини-политика «где взять»: окно 12 × 12 px вокруг клетки → скрытый слой → оценка ---------- */
  // окно вокруг центра клетки действия: 3 × 3 клетки по 4 × 4 px, всего 27 чисел (setRes — для опытов)
  let PS = 4, PW = TW / PS, WN = 3, NF = WN * WN * 3, NH = 16;
  function setRes(ps, wn, nh) { PS = ps; PW = TW / PS; WN = wn; NF = WN * WN * 3; if (nh) NH = nh; }
  /** Картинка, сжатая до 48 × 48 (среднее по квадратикам 2 × 2 px). */
  function pooled(img) {
    const g = new Float64Array(PW * PW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / PS) * PW + Math.floor(x / PS)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (PS * PS); }
    return g;
  }
  /** Признаки всех 576 клеток: окно 6 × 6 квадратиков вокруг центра клетки; за краем стола — серый 0,5; центрировано. */
  function feats(ep) {
    if (ep.F) return ep.F;
    const F = new Float32Array(G * G * NF), g = ep.pooled || (ep.pooled = pooled(ep.img)), half = WN / 2, per = CELL / PS;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      let n = (cy * G + cx) * NF; const x0 = cx * per + per / 2 - half, y0 = cy * per + per / 2 - half;
      for (let dy = 0; dy < WN; dy++) for (let dx = 0; dx < WN; dx++) {
        const x = x0 + dx, y = y0 + dy, ins = x >= 0 && y >= 0 && x < PW && y < PW, o = (y * PW + x) * 3;
        for (let c = 0; c < 3; c++) F[n++] = (ins ? g[o + c] : 0.5) - 0.5;
      }
    }
    ep.F = F; return F;
  }
  function modelInit(seed) {
    const r = rng(seed || 5), W1 = new Float64Array(NF * NH), b1 = new Float64Array(NH), w2 = new Float64Array(NH), s = Math.sqrt(2 / NF);
    for (let i = 0; i < W1.length; i++) W1[i] = randn(r) * s;
    for (let j = 0; j < NH; j++) w2[j] = randn(r) * Math.sqrt(1 / NH);
    const P = [W1, b1, w2, new Float64Array(1)];
    return { P, G: P.map((p) => new Float64Array(p.length)), M: P.map((p) => new Float64Array(p.length)), V: P.map((p) => new Float64Array(p.length)), t: 0 };
  }
  /** Оценки всех клеток; hid — скрытые активации (для обратного прохода). */
  function scores(m, F, hid) {
    const [W1, b1, w2, b2] = m.P, s = new Float64Array(G * G);
    for (let i = 0; i < G * G; i++) {
      const o = i * NF; let v = b2[0];
      for (let j = 0; j < NH; j++) {
        let a = b1[j];
        for (let k = 0; k < NF; k++) a += F[o + k] * W1[k * NH + j];
        if (a < 0) a = 0;
        if (hid) hid[i * NH + j] = a;
        v += a * w2[j];
      }
      s[i] = v;
    }
    return s;
  }
  function adamStep(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    m.P.forEach((P, q) => { const Gq = m.G[q], M = m.M[q], V = m.V[q]; for (let i = 0; i < P.length; i++) { const g = Gq[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); Gq[i] = 0; } });
  }
  /** Обучение: перекрёстная энтропия по клетке, где взял оператор; мини-пачки по 8 эпизодов. */
  function* train(demos, o) {
    o = o || {}; const m = modelInit(o.seed || 5), iters = o.iters || CFG.ITERS, lr = o.lr || 0.01, bs = Math.min(o.bs || 8, demos.length), r = rng(o.seed ? o.seed * 31 + 1 : 77);
    const hid = new Float64Array(G * G * NH), [W1, , w2] = m.P, [gW1, gb1, gw2, gb2] = m.G;
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const d = demos[Math.floor(r() * demos.length)], F = feats(d.ep), s = scores(m, F, hid), p = softmax(s);
        loss -= Math.log(p[d.cell] + 1e-12) / bs;
        for (let i = 0; i < G * G; i++) {
          const gi = p[i] - (i === d.cell ? 1 : 0); if (Math.abs(gi) < 1e-5) continue;
          gb2[0] += gi; const o2 = i * NF;
          for (let j = 0; j < NH; j++) {
            const a = hid[i * NH + j]; if (a <= 0) continue;
            gw2[j] += gi * a; const gj = gi * w2[j]; gb1[j] += gj;
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

  /* ---------- 3. наборы данных с одним бюджетом эпизодов ---------- */
  const CFG = { BUDGET: 48, KITCHENS: 12, TEST: 24, ITERS: 300, KIT_SEED: 100, TEST_SEED: 9000, HOME_SEED: 7000, EP_SEED: 300 };
  /** Демонстрация оператора: взять в центре кубика (с разбросом в пределах кубика). */
  function demoOf(ep, kind, seed) {
    const r = rng(seed * 97 + 5), t = ep.target;
    if (kind === 'miss') { const a = r() * Math.PI * 2, d = 8 + r() * 3; return { ep, kind, cell: cellOf(clamp(t.x + Math.cos(a) * d, 0, TW - 1), clamp(t.y + Math.sin(a) * d, 0, TW - 1)) }; }
    if (kind === 'wrong') { const q = ep.objs.slice(1).sort((a, b) => wrongRank(a) - wrongRank(b))[0]; return { ep, kind, cell: cellOf(q.x, q.y), took: q }; }
    return { ep, kind: 'good', cell: cellOf(t.x + (r() - 0.5) * 2, t.y + (r() - 0.5) * 2) };
  }
  // «не тот предмет»: оператор берёт банку (вторую по похожести форму), а если банки нет — миску
  const wrongRank = (q) => (q.shape === 'can' ? 0 : 1);
  const AX_ALL = { table: true, light: true, objs: true }, AX_NONE = { table: false, light: false, objs: false };
  const axKey = (ax) => AXES.map((a) => (ax[a] ? 1 : 0)).join('');
  /** Кухни набора: K штук с включёнными осями разнообразия (при K = 1 и без осей — домашняя кухня). */
  function kitchens(K, axes) { const out = []; for (let i = 0; i < K; i++) out.push(i === 0 && !axes.table && !axes.light && !axes.objs ? Object.assign({ seed: CFG.KIT_SEED }, HOME) : kitchen(CFG.KIT_SEED + i, axes)); return out; }
  /** Набор из budget эпизодов: поровну по K кухням. */
  function dataset(K, axes, budget) {
    budget = budget || CFG.BUDGET; const ks = K === 1 && axKey(axes) === '000' ? [Object.assign({ seed: CFG.KIT_SEED }, HOME)] : kitchens(K, axes), out = [];
    for (let i = 0; i < budget; i++) { const k = ks[i % ks.length], ep = episode(k, CFG.EP_SEED + i * 13 + K * 1000 + parseInt(axKey(axes), 2) * 50000); out.push(demoOf(ep, 'good', i + 1)); }
    return { kitchens: ks, demos: out };
  }
  /** Проверка: 24 новые кухни (все оси меняются), по одному эпизоду в каждой. */
  function testSet(n) {
    const out = []; for (let i = 0; out.length < (n || CFG.TEST); i++) { const k = kitchen(CFG.TEST_SEED + i, AX_ALL); out.push(episode(k, CFG.TEST_SEED * 3 + i)); }
    return out;
  }
  /** Проверка в домашней кухне: те же скатерть, свет и предметы, новые места. */
  function homeSet(n) { const out = []; for (let i = 0; i < (n || CFG.TEST); i++) out.push(episode(Object.assign({ seed: 0 }, HOME), CFG.HOME_SEED + i)); return out; }

  /** Доля удачных попыток: Ада выбирает клетку по вероятностям модели; складываем вероятности клеток, где захват попадёт в кубик. */
  function probs(m, ep) { return softmax(scores(m, feats(ep))); }
  function hitMass(p, ep) { let ok = 0; for (let i = 0; i < G * G; i++) { const c = cellXY(i); if (hitObj(ep.target, c.x, c.y)) ok += p[i]; } return ok; }
  /** Проверка на наборе эпизодов: средняя доля удачных попыток и что модель выбирает чаще всего в каждом эпизоде. */
  function check(m, eps) {
    const runs = eps.map((ep) => { const p = probs(m, ep), i = argmax(p), c = cellXY(i), top = ep.objs.find((q) => hitObj(q, c.x, c.y)) || null; return { p: hitMass(p, ep), top, topOk: top === ep.target }; });
    return { rate: runs.reduce((t, q) => t + q.p, 0) / runs.length, runs, n: runs.length };
  }

  /* ---------- 4. отбор данных: эпизоды «мимо» и «не тот предмет» ---------- */
  const CUR = { N: 48, KITS: 24, BAD: { wrong: 8, miss: 8 }, SEED: 4405 };
  /** Набор для отбора: 48 эпизодов в 24 кухнях, из них 8 «не тот предмет» и 8 «мимо»; extra — ещё 48 такого же качества. */
  function curationSet(off) {
    off = off || 0; const ks = kitchens(CUR.KITS, AX_ALL), out = [], r = rng(CUR.SEED + off * 7 + 1);
    for (let i = 0; i < CUR.N; i++) out.push(demoOf(episode(ks[i % ks.length], CUR.SEED * 5 + off * 1000 + i * 17), 'good', i + 1 + off * 100));
    const idx = out.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let k = 0;
    for (const [kind, n] of Object.entries(CUR.BAD)) for (let q = 0; q < n; q++, k++) { const j = idx[k]; out[j] = demoOf(out[j].ep, kind, j + 1 + off * 100); }
    out.forEach((d, i) => { d.id = i + off * CUR.N; });
    return out;
  }
  /* ---------- 5. таблица датасетов: числа из статей ---------- */
  // сцены и траектории для RT-1, Bridge V2, OXE, RoboNet и DROID — по таблице I статьи DROID (одно определение сцены);
  // у AgiBot World сцены посчитаны по их собственной статье, определение другое (n — заметки для подсказок)
  const DATASETS = [
    { id: 'robonet', name: 'RoboNet', year: 2019, models: 7, traj: 162000, hours: null, scenes: 10, tasks: null, how: 'автономно, случайные движения', hz: null,
      n: { models: 'Sawyer, Franka, WidowX, Kuka, Baxter и открытые данные Google Robot и Fetch; 4 института.', traj: '«roughly 162,000 trajectories», почти 15 млн кадров. Точек обзора камер — 113 (табл. 1 статьи).', scenes: 'По таблице I статьи DROID. Сам RoboNet пишет о 4 лабораториях и десятках фонов.', tasks: 'Задач нет: робот двигался случайно, данные учили модель предсказывать кадры.', how: 'Оператор только задаёт распределение действий: «Data collection is otherwise unattended».', hours: 'Часов в статье нет.' } },
    { id: 'rt1', name: 'RT-1', year: 2022, models: 1, traj: 130000, hours: null, scenes: 2, tasks: 744, how: 'телеоперация, 17 месяцев', hz: 3,
      n: { models: '13 одинаковых мобильных манипуляторов Everyday Robots. Подробно — урок 3.1.', traj: '«∼130k episodes», все успешные.', scenes: 'По таблице I DROID: класс для сбора данных и кухня.', tasks: '744 инструкции; DROID считает по глаголам — у RT-1 их 2.', how: 'Два VR-пульта, оператор видит робота.', hours: 'Часов в статье нет.' } },
    { id: 'bridge', name: 'BridgeData V2', year: 2023, models: 1, traj: 60096, hours: null, scenes: 24, tasks: 13, how: 'VR-шлем Meta Quest 2 и скрипт', hz: 5,
      n: { models: 'Рука WidowX 250, установка около $4000; один институт.', traj: '50 365 демонстраций оператора и 9 731 запись скриптовой политики.', scenes: '24 среды: игрушечные кухни, раковины, столы; больше 100 предметов.', tasks: '13 навыков; DROID насчитал у Bridge V2 82 глагола.', how: 'Камеры переставляют каждые 50 траекторий; описание задачи словами добавляют разметчики.', hours: 'Часов в статье нет.' } },
    { id: 'oxe', name: 'Open X-Embodiment', year: 2023, models: 22, traj: 1400000, hours: null, scenes: 311, tasks: 527, how: 'объединение 60 чужих датасетов', hz: null,
      n: { models: '22 робота разного устройства из 60 датасетов 34 лабораторий. Подробно — урок 3.4.', traj: 'Сама статья пишет «1M+»; 1,4 млн — по таблице I DROID.', scenes: 'По таблице I DROID, около 300 сцен на момент её написания.', tasks: '527 навыков, 160 266 задач.', how: 'Записи собраны разными способами и приведены к общему формату RLDS.', hours: 'Часов в статье нет.' } },
    { id: 'droid', name: 'DROID', year: 2024, models: 1, traj: 76000, hours: 350, scenes: 564, tasks: 86, how: 'VR-пульт Oculus Quest 2, единый протокол', hz: 15,
      n: { models: '18 одинаковых установок: рука Franka Panda, две внешние стереокамеры Zed 2 и Zed Mini на запястье.', traj: '76 тыс. успешных траекторий; ещё около 16 тыс. отмечены как неудачные и выложены отдельно.', scenes: 'Новая сцена — заметное изменение рабочей зоны; 52 здания, 13 институтов, 50 сборщиков. Точек обзора камер — 1417.', tasks: 'Задача — уникальный глагол в описаниях.', how: 'Сборщик меняет сцену каждые ~100 траекторий, программа подсказывает задачу и перестановки.', hours: '350 часов за 12 месяцев.' } },
    { id: 'agibot', name: 'AgiBot World', year: 2025, models: 1, traj: 1001552, hours: 2976, scenes: 106, tasks: 217, how: 'VR и motion capture, проверка каждого эпизода', hz: 30,
      n: { models: 'Больше 100 одинаковых двуруких роботов AgiBot G1 с мобильной базой и восемью камерами.', traj: '1 001 552 траектории.', scenes: 'Сцены считает сама статья, по своему определению: дом, магазин, завод, ресторан, офис на площадке 4000 м².', tasks: '217 задач и 87 навыков; больше 3000 предметов.', how: 'Пилотный сбор, проверка на месте, проверка каждого эпизода разметчиками, разметка ошибок и исправлений.', hours: '2976,4 часа.' } },
  ];

  const API = { setRes, CFG, TABLES, LIGHTS, OTHERS, CUBE_COLORS, HOME, AXES, AXIS_NAME, AX_ALL, AX_NONE, axKey, kitchen, sameKitchen, tableColor, episode, toGrid, feats, modelInit, scores, train, finish,
    demoOf, wrongRank, kitchens, dataset, testSet, homeSet, probs, hitMass, check, CUR, curationSet, DATASETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L43 = API;
})(typeof window !== 'undefined' ? window : globalThis);
