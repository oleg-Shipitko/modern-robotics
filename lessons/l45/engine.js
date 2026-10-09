/* =====================================================================
   l45/engine.js — движок урока 4.5 «Симуляция и синтетические данные».
   Без DOM: в браузере window.L45 поверх window.L21, в Node — require.
   1) Рандомизация: вид на стол сверху 96 × 96 из урока 2.1. Задача —
      «возьми красный кубик» среди помех: кубик другого цвета, красная
      миска или банка, ещё один предмет. Симулятор рисует стол ровно:
      серый пластик, ровный свет, точные цвета, без теней и шума.
      Рандомизация меняет скатерть, свет и цвета предметов с шириной
      0…4. «Реальный» стол Ады — дубовый, под тёплой лампой у окна,
      с тенями, другой краской предметов и шумом камеры; в обучении его
      нет. Политика — карта «где взять» (окно 12 × 12 px вокруг клетки,
      скрытый слой ReLU, softmax по 576 клеткам), как в уроке 4.3.
   2) Генерация демонстраций в духе MimicGen: задача «положи кубик в
      миску», две подзадачи относительно кубика и миски. Оператор
      записывает несколько демонстраций в узкой зоне стола; генератор
      переносит куски траекторий к новым положениям предметов, вставляет
      прямой переезд и исполняет в симуляторе с ограничением скорости
      руки; удачные попытки оставляет. Политика — маленькая сеть по
      координатам захвата и предметов (как low-dim агенты MimicGen).
   3) Данные статьи Dactyl для интерактива: число поворотов подряд.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, randn, clamp, COLORS, CI, TW, G, CELL, RT, inShape, cellOf, cellXY, softmax, argmax } = L;

  /* ---------- 1. стол в симуляторе и реальный стол ---------- */
  const SIM_TABLE = [0.7, 0.71, 0.73];                     // серый пластик симулятора
  const HUE = [0, 5, 10, 20, 180];                         // ширина рандомизации цвета предметов: ± градусов оттенка
  const SV = [0, 0.1, 0.2, 0.3, 0.4];                       // ширина рандомизации краски: ± доля насыщенности и яркости
  const LIGHT_B = [0, 0.12, 0.25, 0.4, 0.6];                // свет: яркость ×e^{±b}
  const LIGHT_T = [0, 0.06, 0.13, 0.22, 0.34];              // свет: оттенок, ± доля на канал
  const TABLE_R = [0, 0.1, 0.22, 0.36, 0.5];                // скатерть: разброс цвета вокруг серого (0,5 — почти любой цвет)
  const TABLE_PAT = [0, 0, 0.3, 0.5, 0.6];                  // скатерть: доля узоров (полосы, клетка)
  const LEVELS = 5;
  function rgb2hsv(c) { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d > 1e-9) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, mx ? d / mx : 0, mx]; }
  function hsv2rgb(hh, s, v) { hh = ((hh % 360) + 360) % 360; const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c; let r, g, b; if (hh < 60) [r, g, b] = [c, x, 0]; else if (hh < 120) [r, g, b] = [x, c, 0]; else if (hh < 180) [r, g, b] = [0, c, x]; else if (hh < 240) [r, g, b] = [0, x, c]; else if (hh < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [r + m, g + m, b + m]; }
  const RGB = Object.fromEntries(COLORS.map((c) => [c.id, c.rgb]));
  const OTHER_CUBE = ['orange', 'yellow', 'purple', 'blue', 'green'];
  const NON_RED = ['blue', 'green', 'yellow', 'purple', 'orange'];
  /** Набор предметов сцены: красный кубик, кубик другого цвета и две миски или банки не красного цвета. */
  function sceneSpec(r) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    return [{ color: 'red', shape: 'cube' }, { color: pick(OTHER_CUBE), shape: 'cube' }, { color: pick(NON_RED), shape: r() < 0.5 ? 'bowl' : 'can' }, { color: pick(NON_RED), shape: r() < 0.5 ? 'bowl' : 'can' }];
  }
  function place(spec, r) {
    const objs = [], m = 10;
    for (const it of spec) { let x, y, k = 0; do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 300 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 19)); objs.push({ color: it.color, shape: it.shape, x, y }); }
    return objs;
  }
  /** Условия съёмки: скатерть, свет, краска предметов. lv = {table, light, color} — ширина 0…4. */
  function simLook(lv, r) {
    const tr = TABLE_R[lv.table], a = SIM_TABLE.map((v) => clamp(v + (r() * 2 - 1) * tr * 1.4, 0.05, 0.98));
    let pat = 'plain', b = null;
    if (r() < TABLE_PAT[lv.table]) { pat = r() < 0.5 ? 'stripes' : 'check'; b = a.map((v) => clamp(v + (r() * 2 - 1) * tr, 0.05, 0.98)); }
    const br = Math.exp((r() * 2 - 1) * LIGHT_B[lv.light]), gain = [0, 1, 2].map(() => br * (1 + (r() * 2 - 1) * LIGHT_T[lv.light]));
    const hue = HUE[lv.color];
    return { kind: 'sim', table: { a, b, pat, n: 0 }, gain, grad: 0, hueJit: hue, sv: SV[lv.color], shadow: false, noise: 0.004 + 0.006 * lv.light / 4 };
  }
  /** Реальный стол Ады: дуб с волокнами, вечер, тёплая лампа слева, тени, своя краска (кубик тёмно-красный), шум камеры. */
  const REAL = { kind: 'real', table: { a: [0.76, 0.58, 0.42], b: [0.7, 0.52, 0.37], pat: 'grain', n: 0.025 }, gain: [0.85, 0.58, 0.36], grad: 0.3, hueJit: 0, sv: 0, shadow: true, noise: 0.03,
    paint: { red: [0.66, 0.08, 0.16], orange: [0.96, 0.5, 0.12], yellow: [0.93, 0.75, 0.2], purple: [0.5, 0.28, 0.7], blue: [0.18, 0.36, 0.78], green: [0.24, 0.6, 0.32] } };
  function tablePx(T, x, y, r) {
    let c = T.a;
    if (T.pat === 'check') c = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? T.b : T.a;
    else if (T.pat === 'stripes') c = ((y + (T.off || 0)) % (T.per || 10)) < (T.w || 5) ? T.b : T.a;
    else if (T.pat === 'grain') { const w = 0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(x * 0.07 + y * 0.13) * 3.2); c = T.a.map((v, i) => v + (T.b[i] - v) * w); }
    return T.n ? c.map((v) => v + randn(r) * T.n) : c;
  }
  /** Нарисовать сцену: объекты objs при условиях look. Возвращает картинку 96 × 96 × 3. */
  function render(objs, look, r) {
    const img = new Float32Array(TW * TW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const c = tablePx(look.table, x, y, r), o = (y * TW + x) * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = c[ch]; }
    if (look.shadow) for (const q of objs) {                // мягкая тень вправо-вниз: свет из окна слева сверху
      const sx = q.x + 2.5, sy = q.y + 2.5;
      for (let y = Math.max(0, Math.floor(sy - 9)); y < Math.min(TW, sy + 9); y++) for (let x = Math.max(0, Math.floor(sx - 9)); x < Math.min(TW, sx + 9); x++) {
        const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy), f = 1 - 0.32 * clamp((8 - d) / 3, 0, 1), o = (y * TW + x) * 3;
        for (let ch = 0; ch < 3; ch++) img[o + ch] *= f;
      }
    }
    for (const q of objs) {
      let col = (look.paint && (look.paint[q.color + ':' + q.shape] || look.paint[q.color])) || RGB[q.color];
      if (look.hueJit || look.sv) { const [hh, s, v] = rgb2hsv(col); col = hsv2rgb(hh + (r() * 2 - 1) * look.hueJit, clamp(s * (1 + (r() * 2 - 1) * look.sv), 0, 1), clamp(v * (1 + (r() * 2 - 1) * look.sv), 0, 1)); }
      const x0 = Math.floor(q.x - RT - 1), x1 = Math.ceil(q.x + RT + 1), y0 = Math.floor(q.y - RT - 1), y1 = Math.ceil(q.y + RT + 1);
      for (let y = Math.max(0, y0); y <= Math.min(TW - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(TW - 1, x1); x++) {
        if (!inShape(q.shape, x + 0.5 - q.x, y + 0.5 - q.y, RT)) continue;
        const o = (y * TW + x) * 3, sh = look.kind === 'real' ? 0.9 + 0.1 * clamp((q.x - x + q.y - y) / RT, -1, 1) : 1;   // у настоящих предметов есть объём: освещённая и теневая сторона
        for (let ch = 0; ch < 3; ch++) img[o + ch] = col[ch] * sh + (look.kind === 'real' ? randn(r) * 0.02 : 0);
      }
    }
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) {
      const gl = 1 + look.grad * (0.5 - x / TW), o = (y * TW + x) * 3;
      for (let ch = 0; ch < 3; ch++) img[o + ch] = clamp(img[o + ch] * look.gain[ch] * gl + randn(r) * look.noise, 0, 1);
    }
    return img;
  }
  /** Сцена: предметы и картинка. where = 'sim' (с уровнями рандомизации lv) или 'real'. */
  function scene(seed, where, lv) {
    const r = rng(seed * 2654435761 % 4294967291 + 11), objs = place(sceneSpec(r), r), look = where === 'real' ? REAL : simLook(lv || LV0, r);
    return { seed, where, lv, objs, target: objs[0], img: render(objs, look, r), look };
  }
  const LV0 = { table: 0, light: 0, color: 0 };
  const lvKey = (lv) => `${lv.table}${lv.light}${lv.color}`;

  /* ---------- 2. политика «где взять»: окно вокруг клетки → скрытый слой → оценка (как в уроке 4.3) ---------- */
  const PS = 4, PW = TW / PS, WN = 3, NF = WN * WN * 3, NH = 16;
  function pooled(img) {
    const g = new Float64Array(PW * PW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / PS) * PW + Math.floor(x / PS)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (PS * PS); }
    return g;
  }
  /** Признаки всех 576 клеток: окно 3 × 3 клетки по 4 × 4 px вокруг клетки, за краем стола — 0,5; центрировано. */
  function feats(sc) {
    if (sc.F) return sc.F;
    const F = new Float32Array(G * G * NF), g = pooled(sc.img);
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      let n = (cy * G + cx) * NF;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy, ins = x >= 0 && y >= 0 && x < PW && y < PW, o = (y * PW + x) * 3;
        for (let c = 0; c < 3; c++) F[n++] = (ins ? g[o + c] : 0.5) - 0.5;
      }
    }
    sc.F = F; return F;
  }
  function modelInit(seed) {
    const r = rng(seed || 5), W1 = new Float64Array(NF * NH), b1 = new Float64Array(NH), w2 = new Float64Array(NH), s = Math.sqrt(2 / NF);
    for (let i = 0; i < W1.length; i++) W1[i] = randn(r) * s;
    for (let j = 0; j < NH; j++) w2[j] = randn(r) * Math.sqrt(1 / NH);
    const P = [W1, b1, w2, new Float64Array(1)];
    return { P, G: P.map((p) => new Float64Array(p.length)), M: P.map((p) => new Float64Array(p.length)), V: P.map((p) => new Float64Array(p.length)), t: 0 };
  }
  function scores(m, F, hid) {
    const [W1, b1, w2, b2] = m.P, s = new Float64Array(G * G);
    for (let i = 0; i < G * G; i++) {
      const o = i * NF; let v = b2[0];
      for (let j = 0; j < NH; j++) { let a = b1[j]; for (let k = 0; k < NF; k++) a += F[o + k] * W1[k * NH + j]; if (a < 0) a = 0; if (hid) hid[i * NH + j] = a; v += a * w2[j]; }
      s[i] = v;
    }
    return s;
  }
  function adamStep(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
    m.P.forEach((P, q) => { const Gq = m.G[q], M = m.M[q], V = m.V[q]; for (let i = 0; i < P.length; i++) { const g = Gq[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); Gq[i] = 0; } });
  }
  /** Обучение: перекрёстная энтропия по клетке, где лежит красный кубик (в симуляторе его положение известно точно). */
  function* train(scenes, o) {
    o = o || {}; const m = modelInit(o.seed || 5), iters = o.iters || CFG.ITERS, lr = o.lr || 0.01, bs = 8, r = rng(o.seed ? o.seed * 31 + 1 : 77);
    const hid = new Float64Array(G * G * NH), [, , w2] = m.P, [gW1, gb1, gw2, gb2] = m.G;
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const sc = scenes[Math.floor(r() * scenes.length)], F = feats(sc), s = scores(m, F, hid), p = softmax(s), cell = cellOf(sc.target.x, sc.target.y);
        loss -= Math.log(p[cell] + 1e-12) / bs;
        for (let i = 0; i < G * G; i++) {
          const gi = p[i] - (i === cell ? 1 : 0); if (Math.abs(gi) < 1e-5) continue;
          gb2[0] += gi; const o2 = i * NF;
          for (let j = 0; j < NH; j++) { const a = hid[i * NH + j]; if (a <= 0) continue; gw2[j] += gi * a; const gj = gi * w2[j]; gb1[j] += gj; for (let k = 0; k < NF; k++) gW1[k * NH + j] += gj * F[o2 + k]; }
        }
      }
      adamStep(m, lr, bs);
      if (it % 20 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  const finish = (gen) => { for (;;) { const r = gen.next(); if (r.done) return r.value; } };
  /** Попадание: центр клетки ближе 0,8 радиуса к центру предмета (по сторонам квадрата). */
  const hits = (q, x, y) => Math.abs(x - q.x) <= RT * 0.85 && Math.abs(y - q.y) <= RT * 0.85;
  function probs(m, sc) { return softmax(scores(m, feats(sc))); }
  /** Доля попыток, в которых Ада берёт красный кубик: сумма вероятностей клеток над ним; что модель выбирает чаще всего. */
  function check(m, scs) {
    const runs = scs.map((sc) => {
      const p = probs(m, sc), mass = sc.objs.map(() => 0);
      for (let i = 0; i < G * G; i++) { const c = cellXY(i), k = sc.objs.findIndex((q) => hits(q, c.x, c.y)); if (k >= 0) mass[k] += p[i]; }
      const top = cellXY(argmax(p)), ti = sc.objs.findIndex((q) => hits(q, top.x, top.y));
      return { p: mass[0], mass, top: ti };
    });
    return { rate: runs.reduce((t, q) => t + q.p, 0) / runs.length, runs, n: runs.length };
  }
  const CFG = { N_SIM: 96, N_TEST: 48, ITERS: 300, SIM_SEED: 500, TEST_SEED: 9100 };
  /** Обучающий набор симулятора при уровнях рандомизации lv; набор сцен одинаковый, меняется только то, как они нарисованы. */
  function simSet(lv, n) { const out = []; for (let i = 0; i < (n || CFG.N_SIM); i++) out.push(scene(CFG.SIM_SEED + i, 'sim', lv)); return out; }
  /** Проверка: те же расстановки в симуляторе без рандомизации и на реальном столе. */
  function testSet(where, n) { const out = []; for (let i = 0; i < (n || CFG.N_TEST); i++) out.push(scene(CFG.TEST_SEED + i, where, LV0)); return out; }

  /* ---------- 3. генерация демонстраций в духе MimicGen: «положи кубик в миску» ---------- */
  const MG = { HOME: [48, 88], VMAX: 2.8, NI: 5, TOL: 5, BOWL_TOL: 7.5, BOWL_R: 9, STEPS: 90,
    D0: { cube: [[24, 36], [30, 42]], bowl: [[60, 72], [30, 42]] },              // где лежали предметы, когда оператор записывал демонстрации
    D1: { lo: [12, 10], hi: [84, 74], gap: 26 },                                // где они бывают при проверке
    N_SRC: 10, SRC_SEED: 300, GEN_SEED: 7000, TEST_SEED: 8800, N_TEST: 60 };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const uni = (r, a, b) => a + r() * (b - a);
  /** Расстановка проверки (D1): кубик и миска где угодно в рабочей зоне, не ближе gap друг к другу. */
  function mgScene(seed, zone) {
    const r = rng(seed * 7919 + 3);
    if (zone === 'D0') return { seed, cube: [uni(r, ...MG.D0.cube[0]), uni(r, ...MG.D0.cube[1])], bowl: [uni(r, ...MG.D0.bowl[0]), uni(r, ...MG.D0.bowl[1])] };
    let c, b, k = 0;
    do { c = [uni(r, MG.D1.lo[0], MG.D1.hi[0]), uni(r, MG.D1.lo[1], MG.D1.hi[1])]; b = [uni(r, MG.D1.lo[0], MG.D1.hi[0]), uni(r, MG.D1.lo[1], MG.D1.hi[1])]; k++; } while (k < 200 && dist(c, b) < MG.D1.gap);
    return { seed, cube: c, bowl: b };
  }
  /** Кривая Безье второго порядка a → b с контрольной точкой m, n точек с плавным разгоном и торможением. */
  function bez(a, m, b, n) { const out = []; for (let i = 1; i <= n; i++) { const t = 0.5 - 0.5 * Math.cos(Math.PI * i / n), u = 1 - t; out.push([u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]]); } return out; }
  /** Демонстрация оператора в сцене sc: подход к кубику дугой и захват; перенос дугой к миске и отпускание.
      Возвращает целевые точки по шагам и команду захвата (1 — сомкнут). Оператор один: подходит к кубику слева снизу, высота дуги и скорость от раза к разу немного разные. */
  function operatorDemo(sc, seed) {
    const r = rng(seed * 104729 + 7), H = MG.HOME, c = sc.cube, b = sc.bowl, side = MG.SIDE ? (r() < 0.5 ? -1 : 1) : -1;
    const pre = [c[0] + side * uni(r, 6, 10), c[1] + uni(r, 4, 9)], m1 = [lerp(H, pre, 0.5)[0] + side * uni(r, 10, 20), lerp(H, pre, 0.5)[1] - uni(r, 0, 8)];
    const n1 = Math.round(dist(H, pre) / uni(r, 2.6, 3.4)) + 3, pts = [], grip = [];
    const push = (p, g) => { pts.push([p[0] + randn(r) * 0.25, p[1] + randn(r) * 0.25]); grip.push(g); };
    for (const p of bez(H, m1, pre, n1)) push(p, 0);
    bez(pre, lerp(pre, c, 0.5), c, 4).forEach((p, i) => push(p, i === 3 ? 1 : 0));
    const k1 = pts.length;                                   // конец первой подзадачи: кубик в захвате
    const mid = lerp(c, b, 0.5), m2 = [mid[0], Math.min(c[1], b[1]) - uni(r, 10, 22)], pre2 = [b[0], b[1] - uni(r, 3, 6)];
    for (const p of bez(c, m2, pre2, Math.round(dist(c, b) / uni(r, 2.6, 3.4)) + 3)) push(p, 1);
    bez(pre2, lerp(pre2, b, 0.5), b, 3).forEach((p, i) => push(p, i === 2 ? 0 : 1));
    return { sc, pts, grip, k1, src: true };
  }
  /** Исполнить список целей в симуляторе: рука едет к цели не быстрее VMAX за шаг; захват — по команде.
      Записывает состояния и действия; успех — кубик схвачен у кубика и отпущен над миской. */
  function execute(sc, targets, grips) {
    let g = MG.HOME.slice(), closed = 0, hold = false, fail = null, okAt = -1;
    const S = [], A = [];
    for (let t = 0; t < targets.length; t++) {
      const tg = targets[t], d = dist(g, tg), k = d > MG.VMAX ? MG.VMAX / d : 1, v = [(tg[0] - g[0]) * k, (tg[1] - g[1]) * k], cmd = grips[t];
      S.push([g[0], g[1], closed]); A.push([v[0], v[1], cmd]);
      g = [clamp(g[0] + v[0], 0, TW), clamp(g[1] + v[1], 0, TW)];
      if (cmd && !closed) { if (dist(g, sc.cube) <= MG.TOL) hold = true; else if (!fail) fail = 'grasp'; }
      if (!cmd && closed) { if (hold && dist(g, sc.bowl) <= MG.BOWL_TOL) { if (okAt < 0) okAt = t; } else if (!fail) fail = hold ? 'drop' : 'grasp'; hold = false; }
      closed = cmd;
    }
    return { S, A, ok: okAt >= 0 && !fail, fail: okAt >= 0 && !fail ? null : (fail || 'time'), path: S.map((s) => [s[0], s[1]]) };
  }
  /** Исходные демонстрации: оператор в узкой зоне D0. */
  function sources(n) { const out = []; for (let i = 0; i < (n || MG.N_SRC); i++) { const sc = mgScene(MG.SRC_SEED + i, 'D0'), d = operatorDemo(sc, MG.SRC_SEED + i); const ex = execute(sc, d.pts, d.grip); out.push(Object.assign(d, ex, { id: i })); } return out; }
  /** Одна попытка генерации: взять случайную исходную демонстрацию, перенести её куски к новым кубику и миске,
      вставить прямой переезд из NI шагов перед каждым куском и исполнить в симуляторе. */
  function generate1(src, sc, seed) {
    const r = rng(seed * 2246822519 % 4294967291 + 1), d = src[Math.floor(r() * src.length)];
    const dc = [sc.cube[0] - d.sc.cube[0], sc.cube[1] - d.sc.cube[1]], db = [sc.bowl[0] - d.sc.bowl[0], sc.bowl[1] - d.sc.bowl[1]];
    const s1 = d.pts.slice(0, d.k1).map((p) => [p[0] + dc[0], p[1] + dc[1]]), s2 = d.pts.slice(d.k1).map((p) => [p[0] + db[0], p[1] + db[1]]);
    const g1 = d.grip.slice(0, d.k1), g2 = d.grip.slice(d.k1), T = [], Gr = [];
    for (let i = 1; i <= MG.NI; i++) { T.push(lerp(MG.HOME, s1[0], i / MG.NI)); Gr.push(0); }
    s1.forEach((p, i) => { T.push(p); Gr.push(g1[i]); });
    const end1 = s1[s1.length - 1];
    for (let i = 1; i <= MG.NI; i++) { T.push(lerp(end1, s2[0], i / MG.NI)); Gr.push(1); }
    s2.forEach((p, i) => { T.push(p); Gr.push(g2[i]); });
    const ex = execute(sc, T, Gr);
    return Object.assign({ sc, src: false, from: d.id, targets: T }, ex);
  }
  /** Генерация: n попыток на новых расстановках D1; keepAll — оставить и неудачные (без проверки в симуляторе). */
  function generate(src, n, keepAll) {
    const kept = [], all = [];
    for (let i = 0; all.length < 4 * n + 50 && kept.length < n; i++) {
      const sc = mgScene(MG.GEN_SEED + i, 'D1'), a = generate1(src, sc, MG.GEN_SEED + i);
      all.push(a); if (a.ok || keepAll) kept.push(a);
    }
    const okN = all.filter((a) => a.ok).length;
    return { kept, tries: all.length, okN, rate: okN / all.length };
  }
  /* политика по координатам: (захват, кубик, миска, захват сомкнут) → (скорость, команда захвата) */
  const nx = (v) => v / 48 - 1;
  const OBS = { rel: false };
  const obs = (s, sc) => { const v = [nx(s[0]), nx(s[1]), nx(sc.cube[0]), nx(sc.cube[1]), nx(sc.bowl[0]), nx(sc.bowl[1]), s[2] ? 1 : -1]; if (OBS.rel) v.push((sc.cube[0] - s[0]) / 24, (sc.cube[1] - s[1]) / 24, (sc.bowl[0] - s[0]) / 24, (sc.bowl[1] - s[1]) / 24); return v; };
  function* polTrain(demos, o) {
    o = o || {}; const m = L.net([OBS.rel ? 11 : 7, o.hid || 48, o.hid || 48, 3], o.seed || 11), iters = o.iters || 5000, bs = 32, lr = o.lr || 0.005, r = rng((o.seed || 11) * 13 + 5);
    const X = [], Y = [];
    // команда захвата меняется раз за подзадачу; такие шаги редки, поэтому их вес в потерях больше (tw)
    for (const d of demos) d.S.forEach((s, t) => { X.push(obs(s, d.sc)); const a = d.A[t]; Y.push([a[0] / MG.VMAX, a[1] / MG.VMAX, a[2], a[2] !== s[2] ? (o.tw || 8) : 1]); });
    const g = new Float64Array(3);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const i = Math.floor(r() * X.length), y = L.fwd(m, X[i]), tg = Y[i], pz = 1 / (1 + Math.exp(-y[2]));
        g[0] = y[0] - tg[0]; g[1] = y[1] - tg[1]; g[2] = (pz - tg[2]) * tg[3];
        loss += (g[0] * g[0] + g[1] * g[1]) / bs; L.bwd(m, g);
      }
      L.adam(m, lr * (0.1 + 0.9 * (1 - it / iters)), bs);
      if (it % 100 === 0 || it === iters - 1) yield { it, iters, loss, n: X.length };
    }
    return m;
  }
  /** Прогон политики в сцене: шаги до успеха или ошибки. */
  function rollout(m, sc) {
    let g = MG.HOME.slice(), closed = 0, hold = false; const path = [g.slice()];
    for (let t = 0; t < MG.STEPS; t++) {
      const y = L.fwd(m, obs([g[0], g[1], closed], sc)); let vx = clamp(y[0], -1.2, 1.2) * MG.VMAX, vy = clamp(y[1], -1.2, 1.2) * MG.VMAX;
      const sp = Math.hypot(vx, vy); if (sp > MG.VMAX) { vx *= MG.VMAX / sp; vy *= MG.VMAX / sp; }
      g = [clamp(g[0] + vx, 0, TW), clamp(g[1] + vy, 0, TW)]; path.push(g.slice());
      const cmd = y[2] > 0 ? 1 : 0;
      if (cmd && !closed) { if (dist(g, sc.cube) <= MG.TOL) hold = true; else return { ok: false, fail: 'grasp', path, at: g }; }
      if (!cmd && closed) { if (hold && dist(g, sc.bowl) <= MG.BOWL_TOL) return { ok: true, path, at: g }; return { ok: false, fail: 'drop', path, at: g }; }
      closed = cmd;
    }
    return { ok: false, fail: hold ? 'carry' : 'time', path, at: g };
  }
  function mgTest(n) { const out = []; for (let i = 0; i < (n || MG.N_TEST); i++) out.push(mgScene(MG.TEST_SEED + i, 'D1')); return out; }
  function mgCheck(m, tests) { const runs = tests.map((sc) => rollout(m, sc)); return { rate: runs.filter((q) => q.ok).length / runs.length, runs, n: runs.length }; }

  /* ---------- 4. Dactyl: повороты кубика подряд на реальной руке (OpenAI 2018, табл. 3 и 4) ---------- */
  // по 10 попыток на политику; попытка кончается, когда кубик упал, прошло 50 поворотов или вышло время
  const DACTYL = {
    sim: { mean: 43.4, median: 50, note: 'Та же политика в симуляторе: 100 попыток, среднее 43,4, медиана 50 (табл. 3).' },
    rows: [
      { id: 'all', pose: 'markers', name: 'все рандомизации', trials: [50, 41, 29, 27, 14, 12, 6, 4, 4, 1], mean: 18.8, median: 13 },
      { id: 'noise', pose: 'markers', name: 'без шума наблюдений', trials: [45, 35, 23, 11, 9, 8, 7, 6, 6, 1], mean: 15.1, median: 8.5 },
      { id: 'physics', pose: 'markers', name: 'без рандомизации физики', trials: [7, 7, 7, 3, 2, 2, 2, 2, 2, 1], mean: 3.5, median: 2 },
      { id: 'unmodeled', pose: 'markers', name: 'без неучтённых эффектов', trials: [16, 7, 3, 3, 2, 2, 1, 1, 0, 0], mean: 3.5, median: 2 },
      { id: 'none', pose: 'markers', name: 'без рандомизаций', trials: [6, 2, 2, 1, 0, 0, 0, 0, 0, 0], mean: 1.1, median: 0 },
      { id: 'all', pose: 'vision', name: 'все рандомизации', trials: [46, 28, 26, 15, 13, 10, 8, 3, 2, 1], mean: 15.2, median: 11.5 },
      { id: 'noise', pose: 'vision', name: 'без шума наблюдений', trials: [20, 12, 11, 6, 5, 2, 2, 1, 0, 0], mean: 5.9, median: 3.5 },
    ],
    // группы рандомизаций (раздел 3.2 и приложение C.2 статьи)
    groups: {
      noise: 'Шум наблюдений: к положениям кончиков пальцев и кубика добавляют шум — постоянный на весь эпизод и новый на каждом шаге.',
      physics: 'Физика: массы звеньев и кубика ×0,5…1,5, трение ×0,7…1,3, демпфирование суставов ×0,3…3, усиление приводов ×0,75…1,5, размеры кубика ×0,95…1,05, пределы суставов и направление гравитации со случайным сдвигом.',
      unmodeled: 'Неучтённые эффекты: люфт сухожилий, задержка действий на 80 мс у половины приводов, шум в действиях, пропадающие и заслонённые маркеры, случайные толчки кубика.',
    },
  };
  const dactyl = (id, pose) => DACTYL.rows.find((q) => q.id === id && q.pose === pose) || null;

  const API = { HUE, SV, LIGHT_B, LIGHT_T, TABLE_R, LEVELS, SIM_TABLE, REAL, LV0, lvKey, sceneSpec, simLook, render, scene, feats, train, finish, probs, check, hits, CFG, simSet, testSet, rgb2hsv, hsv2rgb };
  Object.assign(API, { DACTYL, dactyl, OBS, MG, mgScene, operatorDemo, execute, sources, generate1, generate, polTrain, rollout, mgTest, mgCheck });
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L45 = API;
})(typeof window !== 'undefined' ? window : globalThis);
