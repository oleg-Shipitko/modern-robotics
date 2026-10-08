/* =====================================================================
   l34/engine.js — движок урока 3.4 «Open X-Embodiment». Без DOM: работает
   в браузере (поверх window.L21) и в Node (require('../l21/engine.js')).
   1) Четыре игрушечных робота на столе из урока 2.1: одни и те же сцены
      «возьми <цвет> кубик», но у каждого своя камера (обрезка, масштаб,
      зеркало) и свои единицы действий (клетки 24×24, клетки 12×12,
      миллиметры в базе, сантиметры смещения от домашней точки с обратной
      осью x, захват с разной полярностью).
   2) Общий формат: наблюдение — кадр камеры, приведённый к сетке S×S;
      действие — нормированные координаты в кадре (u, v) ∈ [0, 1]² и захват
      «1 = закрыть», дискретизованные в B корзин по каждой оси (у статьи —
      256 корзин по 8 измерениям). Приведение — нормировка по рабочему полю
      робота; систему координат можно не выравнивать, как в статье.
   3) Политика — маленькая сеть: кадр + слово команды → две головы softmax
      по корзинам x и y. Обучение — генератор (yield прогресс), смесь
      задаётся весами датасетов. Оценка — попадание захвата в нужный кубик
      на новых сценах каждого робота.
   4) Таблицы I и II статьи — данные для интерактива с наведением.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('../l21/engine.js') : root.L21;
  const { rng, clamp, net, fwd, bwd, adam, COLORS, CI, BG, TW, RT, tableScene, hitObj } = L;

  /* ---------- 1. роботы ---------- */
  const S = 12, B = 24;                                   // сторона общей сетки наблюдений; корзин по оси (у статьи 256)
  const FIELD_CM = 48;                                    // стол 96 px = 48 см
  const ROBOTS = [
    { id: 'a', name: 'Робот A', nick: 'WidowX', cam: { x0: 0, y0: 0, size: 96, flip: false }, act: { kind: 'grid', n: 24, sign: 1, gripClosed: 1, label: 'клетка сетки 24 × 24 над кадром, захват 1 = закрыт' }, nDemos: 300 },
    { id: 'b', name: 'Робот B', nick: 'xArm', cam: { x0: 12, y0: 12, size: 72, flip: false }, act: { kind: 'grid', n: 12, sign: 1, gripClosed: 0, label: 'клетка сетки 12 × 12 над кадром, захват 0 = закрыт' }, nDemos: 100 },
    { id: 'c', name: 'Робот C', nick: 'Franka', cam: { x0: 0, y0: 0, size: 96, flip: true }, act: { kind: 'mm', sign: 1, gripClosed: 1, label: 'миллиметры в базе робота, камера с другой стороны стола' }, nDemos: 40 },
    { id: 'd', name: 'Робот D', nick: 'UR5', cam: { x0: 6, y0: 6, size: 84, flip: false }, act: { kind: 'delta', sign: -1, gripClosed: 1, label: 'сантиметры смещения от домашней точки, ось x направлена к камере' }, nDemos: 15 },
  ];
  const RI = Object.fromEntries(ROBOTS.map((r, i) => [r.id, i]));

  /** Кадр камеры робота → общая сетка S×S×3 (среднее по окну). */
  function observe(robot, img) {
    const { x0, y0, size, flip } = robot.cam, w = size / S, out = new Float64Array(S * S * 3);
    for (let gy = 0; gy < S; gy++) for (let gx = 0; gx < S; gx++) {
      const o = (gy * S + gx) * 3; let n = 0;
      for (let y = Math.floor(gy * w); y < Math.floor((gy + 1) * w); y++) for (let x = Math.floor(gx * w); x < Math.floor((gx + 1) * w); x++) {
        const sx = x0 + (flip ? size - 1 - x : x), sy = y0 + y, p = (sy * TW + sx) * 3;
        out[o] += img[p]; out[o + 1] += img[p + 1]; out[o + 2] += img[p + 2]; n++;
      }
      out[o] /= n; out[o + 1] /= n; out[o + 2] /= n;
    }
    return out;
  }
  /** Точка стола (px) → нормированные координаты в кадре камеры робота. */
  function toFrame(robot, x, y) {
    const { x0, y0, size, flip } = robot.cam; let u = (x - x0) / size; const v = (y - y0) / size;
    if (flip) u = 1 - u;
    return { u: clamp(u, 0, 0.999), v: clamp(v, 0, 0.999) };
  }
  function fromFrame(robot, u, v) {
    const { x0, y0, size, flip } = robot.cam;
    return { x: x0 + (flip ? 1 - u : u) * size, y: y0 + v * size };
  }
  /** Родное действие робота для цели (x, y) на столе: так его записал оператор. */
  function nativeAction(robot, x, y) {
    const { u, v } = toFrame(robot, x, y), a = robot.act, cm = FIELD_CM * robot.cam.size / TW;
    if (a.kind === 'grid') return { cx: Math.floor(u * a.n), cy: Math.floor(v * a.n), g: a.gripClosed };
    if (a.kind === 'mm') return { xmm: Math.round(u * cm * 10), ymm: Math.round(v * cm * 10), g: a.gripClosed };
    return { dx: Math.round(a.sign * (u - 0.5) * cm * 10) / 10, dy: Math.round((v - 0.5) * cm * 10) / 10, g: a.gripClosed };
  }
  /** Родное действие → общий формат (u, v, g). align — выравнивать ли систему координат (знак оси); без него — только нормировка. */
  function toCommon(robot, na, align) {
    const a = robot.act, cm = FIELD_CM * robot.cam.size / TW;
    let u, v;
    if (a.kind === 'grid') { u = (na.cx + 0.5) / a.n; v = (na.cy + 0.5) / a.n; }
    else if (a.kind === 'mm') { u = na.xmm / (cm * 10); v = na.ymm / (cm * 10); }
    else { u = 0.5 + (align ? a.sign : 1) * na.dx / cm; v = 0.5 + na.dy / cm; }
    return { u: clamp(u, 0, 0.999), v: clamp(v, 0, 0.999), g: 1 };
  }
  /** Общий формат → родное действие робота (де-нормализация) → куда захват опустится на столе. */
  function execute(robot, u, v, align) {
    const a = robot.act, cm = FIELD_CM * robot.cam.size / TW;
    let na, uu = u, vv = v;
    if (a.kind === 'grid') { na = { cx: Math.floor(u * a.n), cy: Math.floor(v * a.n), g: a.gripClosed }; uu = (na.cx + 0.5) / a.n; vv = (na.cy + 0.5) / a.n; }
    else if (a.kind === 'mm') na = { xmm: Math.round(u * cm * 10), ymm: Math.round(v * cm * 10), g: a.gripClosed };
    else { na = { dx: Math.round((align ? a.sign : 1) * (u - 0.5) * cm * 10) / 10, dy: Math.round((v - 0.5) * cm * 10) / 10, g: a.gripClosed }; uu = 0.5 + a.sign * na.dx / cm; }
    const p = fromFrame(robot, uu, vv);
    return { native: na, x: p.x, y: p.y };
  }
  const toBin = (t) => clamp(Math.floor(t * B), 0, B - 1);
  const binMid = (b) => (b + 0.5) / B;

  /* ---------- 2. сцены и демонстрации ---------- */
  const WORDS = COLORS.map((c) => c.id);
  /** Сцена «возьми <цвет> кубик»: три кубика разных цветов и миска; все предметы внутри кадра робота. */
  function sceneFor(robot, color, seed) {
    const r = rng(seed * 17 + 3), others = WORDS.filter((c) => c !== color);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const spec = [{ color, shape: 'cube' }, { color: others[0], shape: 'cube' }, { color: others[1], shape: 'cube' }, { color: others[2], shape: 'bowl' }];
    const m = Math.max(robot.cam.x0, robot.cam.y0) + 8;
    const sc = tableScene(spec, seed, { margin: m }); sc.target = sc.objs[0]; sc.color = color; return sc;
  }
  /** Демонстрации робота: оператор берёт кубик цвета команды; записано в родном формате. */
  function demosFor(robot, n, seed0) {
    const out = []; for (let i = 0; i < n; i++) { const c = WORDS[i % WORDS.length], sc = sceneFor(robot, c, (seed0 || 1000 * (RI[robot.id] + 1)) + i); out.push({ robot: robot.id, color: c, scene: sc, obs: observe(robot, sc.img), native: nativeAction(robot, sc.target.x, sc.target.y) }); }
    return out;
  }
  const wordVec = (color) => { const v = new Float64Array(WORDS.length); v[WORDS.indexOf(color)] = 1; return v; };
  /** Замороженный энкодер (как предобученные EfficientNet и USE в RT-1): карта сходства клеток кадра
   *  с цветом слова команды, exp(−|p − q|² / 2σ²). Политика учится только поверх неё. */
  function features(obs, color) {
    const q = COLORS[CI[color]].rgb, f = new Float64Array(S * S), q0 = q[0] - BG[0], q1 = q[1] - BG[1], q2 = q[2] - BG[2], qn = Math.hypot(q0, q1, q2);
    for (let i = 0; i < S * S; i++) {
      const o = i * 3, d0 = obs[o] - BG[0], d1 = obs[o + 1] - BG[1], d2 = obs[o + 2] - BG[2], dn = Math.hypot(d0, d1, d2);
      if (dn < 0.03) continue;
      const cos = (d0 * q0 + d1 * q1 + d2 * q2) / (dn * qn);           // тот ли это цвет
      f[i] = Math.min(1, dn / qn) * Math.pow(Math.max(0, cos), 8);      // × какая доля клетки им занята
    }
    return f;
  }
  function input(obs, color) { const x = new Float64Array(S * S + WORDS.length); x.set(features(obs, color)); x.set(wordVec(color), S * S); return x; }

  /* ---------- 3. политика: карта сходства + слово → корзины x и y ---------- */
  const IN = S * S + WORDS.length;
  function policyInit(seed, hidden) { return net([IN, hidden || 32, 2 * B], seed || 5); }
  function softmaxInto(z, off, p) { let mx = -1e9; for (let i = 0; i < B; i++) mx = Math.max(mx, z[off + i]); let s = 0; for (let i = 0; i < B; i++) { p[i] = Math.exp(z[off + i] - mx); s += p[i]; } for (let i = 0; i < B; i++) p[i] /= s; }
  function predict(m, obs, color) { const z = fwd(m, input(obs, color)), px = new Float64Array(B), py = new Float64Array(B); softmaxInto(z, 0, px); softmaxInto(z, B, py); let bx = 0, by = 0; for (let i = 1; i < B; i++) { if (px[i] > px[bx]) bx = i; if (py[i] > py[by]) by = i; } return { bx, by, px, py, u: binMid(bx), v: binMid(by) }; }
  /** Обучение на смеси. sets: [{ demos, w }] — датасеты и веса смеси; метки — общий формат (toCommon с align или без).
   *  Генератор отдаёт { it, iters, loss }; в конце — модель. */
  function* train(m, sets, o) {
    o = o || {}; const iters = o.iters || 300, bs = o.batch || 16, lr = o.lr || 0.004, r = rng(o.seed || 21), align = !!o.align;
    const live = sets.filter((s) => s.w > 0 && s.demos.length), wsum = live.reduce((a, s) => a + s.w, 0);
    const labels = new Map(); for (const s of live) for (const d of s.demos) { const c = toCommon(ROBOTS[RI[d.robot]], d.native, align); labels.set(d, { bx: toBin(c.u), by: toBin(c.v) }); }
    const g = new Float64Array(2 * B), px = new Float64Array(B), py = new Float64Array(B);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      for (let k = 0; k < bs; k++) {
        let pick = r() * wsum, s = live[0]; for (const q of live) { pick -= q.w; if (pick <= 0) { s = q; break; } }
        const d = s.demos[Math.floor(r() * s.demos.length)], lb = labels.get(d), z = fwd(m, input(d.obs, d.color));
        softmaxInto(z, 0, px); softmaxInto(z, B, py); loss -= (Math.log(px[lb.bx] + 1e-12) + Math.log(py[lb.by] + 1e-12)) / bs;
        for (let i = 0; i < B; i++) { g[i] = px[i] - (i === lb.bx ? 1 : 0); g[B + i] = py[i] - (i === lb.by ? 1 : 0); }
        bwd(m, g);
      }
      adam(m, lr, bs);
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  /** Проверка политики на n новых сценах робота: захват попал в кубик цвета команды? */
  function evaluate(m, robot, n, align, seed0) {
    const runs = []; let ok = 0;
    for (let i = 0; i < n; i++) {
      const c = WORDS[i % WORDS.length], sc = sceneFor(robot, c, (seed0 || 7000 + 500 * RI[robot.id]) + i), pr = predict(m, observe(robot, sc.img), c), ex = execute(robot, pr.u, pr.v, align);
      const hit = hitObj(sc.target, ex.x, ex.y); if (hit) ok++;
      runs.push({ scene: sc, color: c, u: pr.u, v: pr.v, x: ex.x, y: ex.y, native: ex.native, ok: hit });
    }
    return { runs, rate: ok / n, n };
  }
  /** Потолок: оператор-оракул в общем формате (ошибка только от корзин и родных единиц). */
  function ceiling(robot, n, align, seed0) {
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const c = WORDS[i % WORDS.length], sc = sceneFor(robot, c, (seed0 || 7000 + 500 * RI[robot.id]) + i), cm = toCommon(robot, nativeAction(robot, sc.target.x, sc.target.y), true), ex = execute(robot, binMid(toBin(cm.u)), binMid(toBin(cm.v)), align);
      if (hitObj(sc.target, ex.x, ex.y)) ok++;
    }
    return ok / n;
  }

  /* ---------- 4. таблицы статьи ---------- */
  const TABLE1 = {
    cols: ['Original Method', 'RT-1', 'RT-1-X', 'RT-2-X (55B)'],
    rows: [
      { eval: 'Bridge', place: 'IRIS (Stanford)', robot: 'WidowX', v: ['13%', '40%', '27%', '50%'], orig: 'LCBC' },
      { eval: 'Bridge', place: 'RAIL Lab (UCB)', robot: 'WidowX', v: ['13%', '30%', '27%', '30%'], orig: 'LCBC' },
      { eval: 'RT-1 paper, 6 skills', place: 'Google Robotic Lab', robot: 'Google Robot', v: ['—', '92%', '73%', '91%'], orig: null },
    ],
  };
  const TABLE2 = {
    cols: ['Модель', 'История', 'Данные', 'Веб-данные', 'Умения из Bridge', 'Обобщение RT-2'],
    rows: [
      { n: 1, model: 'RT-2', size: '55B', hist: 'нет', data: 'Google Robot', web: 'да', init: 'веб-предобучение', em: 27.3, gen: 62 },
      { n: 2, model: 'RT-2-X', size: '55B', hist: 'нет', data: 'вся смесь', web: 'да', init: 'веб-предобучение', em: 75.8, gen: 61 },
      { n: 3, model: 'RT-2-X', size: '55B', hist: 'нет', data: 'смесь без Bridge', web: 'да', init: 'веб-предобучение', em: 42.8, gen: 54 },
      { n: 4, model: 'RT-2-X', size: '5B', hist: '2 кадра', data: 'вся смесь', web: 'да', init: 'веб-предобучение', em: 44.4, gen: 52 },
      { n: 5, model: 'RT-2-X', size: '5B', hist: 'нет', data: 'вся смесь', web: 'да', init: 'веб-предобучение', em: 14.5, gen: 30 },
      { n: 6, model: 'RT-2-X', size: '5B', hist: '2 кадра', data: 'вся смесь', web: 'нет', init: 'с нуля', em: 0, gen: 1 },
      { n: 7, model: 'RT-2-X', size: '5B', hist: '2 кадра', data: 'вся смесь', web: 'нет', init: 'веб-предобучение', em: 48.7, gen: 47 },
    ],
  };

  const API = { S, B, FIELD_CM, ROBOTS, RI, WORDS, observe, features, toFrame, fromFrame, nativeAction, toCommon, execute, toBin, binMid, sceneFor, demosFor, input, policyInit, predict, train, evaluate, ceiling, TABLE1, TABLE2, L };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L34 = API;
})(typeof window !== 'undefined' ? window : globalThis);
