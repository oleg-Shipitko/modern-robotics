/* =====================================================================
   l36/engine.js — движок урока 3.6 «π0». Без DOM: работает в браузере
   (window.L36) и в Node (require) поверх l21/engine.js (стол 96 × 96).
   1) Мир: вид на стол сверху, узкий желобок в форме буквы S из двух дуг,
      гнездо в конце. Фигурку ведут по желобку; задела стенку — провал,
      влетела в гнездо быстрее 0,5 px за такт — тоже провал.
      Задачи предобучения — другие желобки: S до кубика, дуга вокруг миски,
      змейка, прямой. Оператор ведёт фигурку по осевой; такт 20 мс.
   2) Наблюдение — то, что дал бы детектор по картинке: точки осевой
      линии впереди и остаток пути в осях желобка у фигурки, и команда.
   3) Модель A «действия как токены»: команда раз в 17 тактов (около 3 Гц),
      куда сдвинуться за это время; два токена по 256 корзин, второй — при
      известном первом (авторегрессия), жадное декодирование. Робот едет
      к точке по прямой.
   4) Модель B «эксперт действий»: условный flow matching (логика из
      l18/engine.js) — пачка из 50 смещений за 10 шагов Эйлера, робот
      исполняет 25 и запрашивает новую пачку, как π0. Пачку сеть задаёт
      8 коэффициентами ДКП на ось (см. FAST) — маленькой сети так проще.
   5) Предобучение на других задачах стола и постобучение на желобке.
   6) FAST в миниатюре: ДКП по измерениям, k коэффициентов, округление.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L21 = root.L21 || (typeof require !== 'undefined' ? require('../l21/engine.js') : null);
  const { rng, randn, clamp } = L21;
  const TW = L21.TW;                                           // 96 — сторона стола в условных пикселях (1 px ≈ 5 мм)
  /* ---------- параметры мира ---------- */
  const CFG = {
    TICK: 0.02, HZ: 50,                                        // такт робота: 20 мс, 50 Гц
    H: 50, EXEC: 25, STEPS: 10,                                // пачка B: 50 смещений, исполняем 25, 10 шагов Эйлера
    A_STEP: 17, BINS: 256, AMAX: 36,                           // модель A: команда раз в 17 тактов (0,34 с), 256 корзин на ±36 px
    W: 10.5, RF: 2.5, GOAL: 2, VIN: 0.5,                         // ширина желобка, радиус фигурки, радиус гнезда; быстрее 0,5 px за такт в гнездо не входят
    V: 1.8, DS: 1.8,                                           // скорость оператора (px за такт) и масштаб смещений для сети
    LIMIT: 1.3,                                                // срок = 1,3 времени оператора
  };
  const MARGIN = CFG.W / 2 - CFG.RF;                           // 2,75 px от осевой до касания стенки

  /* ---------- сцены: осевая линия желобка как ломаная ---------- */
  function polyline(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  /** Точка на расстоянии s от начала осевой. */
  function pathPoint(sc, s) {
    const { pts, cum } = sc.line; s = clamp(s, 0, sc.line.len);
    let lo = 1, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
    const i = lo, u = cum[i] === cum[i - 1] ? 0 : (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
  }
  function tangent(sc, s) { const a = pathPoint(sc, Math.max(0, s - 1)), b = pathPoint(sc, Math.min(sc.line.len, s + 1)), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; }
  /** Расстояние от точки до осевой и параметр ближайшей точки. */
  function nearest(sc, p) {
    const { pts, cum } = sc.line; let best = Infinity, bs = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], vx = pts[i][0] - ax, vy = pts[i][1] - ay, L2 = vx * vx + vy * vy;
      let t = L2 ? ((p[0] - ax) * vx + (p[1] - ay) * vy) / L2 : 0; t = clamp(t, 0, 1);
      const d = Math.hypot(ax + t * vx - p[0], ay + t * vy - p[1]);
      if (d < best) { best = d; bs = cum[i - 1] + t * Math.sqrt(L2); }
    }
    return { d: best, s: bs };
  }
  const KINDS = ['s', 'scube', 'arc', 'slalom', 'line'];
  const KIND_NAME = { s: 'провести по желобку и вставить в гнездо', scube: 'довести по желобку до кубика', arc: 'обвести вокруг миски', slalom: 'провести змейкой между кубиками', line: 'подвести к кубику' };
  /** Дуга радиуса R на угол sw (со знаком) от точки p с направлением a. Добавляет точки в pts, возвращает конечное направление. */
  function arcTo(pts, R, sw, a, n) {
    const p = pts[pts.length - 1], sg = Math.sign(sw), cx = p[0] - sg * R * Math.sin(a), cy = p[1] + sg * R * Math.cos(a);
    for (let i = 1; i <= n; i++) { const b = a + sw * i / n; pts.push([cx + sg * R * Math.sin(b), cy - sg * R * Math.cos(b)]); }
    return a + sw;
  }
  /** Сцена: kind — вид задачи. Случайная геометрия с зерном; желобок с запасом помещается на столе. */
  function makeScene(kind, seed) {
    const r = rng(seed * 7919 + KINDS.indexOf(kind) * 131 + 17);
    for (let attempt = 0; attempt < 80; attempt++) {
      let pts = [[0, 0]], objs = [];
      const a0 = r() * 2 * Math.PI;
      if (kind === 's' || kind === 'scube') {
        const R1 = 14 + r() * 8, R2 = 14 + r() * 8, s1 = (70 + r() * 50) * Math.PI / 180, s2 = (70 + r() * 50) * Math.PI / 180, sg = r() < 0.5 ? 1 : -1, mid = r() * 6;
        const a1 = arcTo(pts, R1, sg * s1, a0, 60), p1 = pts[pts.length - 1];
        for (let i = 1; i <= 6; i++) pts.push([p1[0] + Math.cos(a1) * mid * i / 6, p1[1] + Math.sin(a1) * mid * i / 6]);
        arcTo(pts, R2, -sg * s2, a1, 60);
        if (kind === 'scube') { const e = pts[pts.length - 1], b = a1 - sg * s2; objs.push({ shape: 'cube', color: 'red', at: [e[0] + Math.cos(b) * 5, e[1] + Math.sin(b) * 5] }); }
      } else if (kind === 'arc') {
        const R = 13 + r() * 15, sw = (60 + r() * 90) * Math.PI / 180 * (r() < 0.5 ? 1 : -1), sg = Math.sign(sw);
        arcTo(pts, R, sw, a0, 100);
        objs.push({ shape: 'bowl', color: 'green', at: [-sg * R * Math.sin(a0), sg * R * Math.cos(a0)] });
      } else {
        const L = 36 + r() * 24, ux = Math.cos(a0), uy = Math.sin(a0), nx = -uy, ny = ux;
        const A = kind === 'line' ? 0 : 3 + r() * 4, side = r() < 0.5 ? 1 : -1;
        for (let i = 1; i <= 120; i++) {
          const u = i / 120, lat = kind === 'line' ? 0 : side * A * Math.sin(2 * Math.PI * u);
          pts.push([u * L * ux + lat * nx, u * L * uy + lat * ny]);
        }
        if (kind === 'line') objs.push({ shape: 'cube', color: 'blue', at: [(L + 5) * ux, (L + 5) * uy] });
        if (kind === 'slalom') objs.push({ shape: 'cube', color: 'yellow', at: [L / 4 * ux - side * 4 * nx, L / 4 * uy - side * 4 * ny] }, { shape: 'cube', color: 'purple', at: [3 * L / 4 * ux + side * 4 * nx, 3 * L / 4 * uy + side * 4 * ny] });
      }
      const pad = CFG.W / 2 + 4; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts.concat(objs.map((o) => o.at))) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const fw = TW - 2 * pad - (x1 - x0), fh = TW - 2 * pad - (y1 - y0);
      if (fw < 0 || fh < 0) continue;
      const ox = pad - x0 + r() * fw, oy = pad - y0 + r() * fh;
      pts = pts.map((q) => [q[0] + ox, q[1] + oy]); objs = objs.map((o) => ({ shape: o.shape, color: o.color, at: [o.at[0] + ox, o.at[1] + oy] }));
      const sc = { kind, seed, line: polyline(pts), objs };
      sc.S = pts[0]; sc.G = pts[pts.length - 1]; sc.dirG = tangent(sc, sc.line.len);
      return sc;
    }
    throw new Error('сцена не поместилась: ' + kind + ' ' + seed);
  }

  /* ---------- оператор: демонстрация по осевой, торможение у цели ---------- */
  /** Скорость на расстоянии s от начала. В других задачах оператор тормозит на последних 6 px до 0,4 от полной —
   *  у предмета фигурка останавливается сама; в гнездо он вставляет её медленно: с 14 px до 0,12 от полной. */
  const SLOW = { s: [14, 0.12], scube: [6, 0.4], line: [6, 0.4], arc: [6, 0.4], slalom: [6, 0.4] };
  function speedAt(sc, s, f) { const [zone, vmin] = SLOW[sc.kind], L = sc.line.len, slow = s > L - zone ? Math.max(vmin, (L - s) / zone) : 1; return CFG.V * f * slow; }
  /** Положение оператора: s — пройдено по осевой, lat — сдвиг вбок от неё. */
  const atSL = (sc, s, lat) => { const q = pathPoint(sc, s), tg = tangent(sc, s); return [q[0] - tg[1] * lat, q[1] + tg[0] * lat]; };
  const LAT_TAU = 10;                                          // за сколько тактов оператор убирает сдвиг вбок (в e раз)
  /** Демонстрация. Оператор начинает чуть сбоку от осевой, а по ходу записи фигурку иногда толкают вбок, и он
   *  плавно возвращает её на середину, — так в данных есть исправления (приём DART, урок 1.2). Возвращает положения
   *  по тактам до цели и состояние оператора (s, lat) в каждом такте. o: { f — множитель скорости, off — начальный сдвиг, push — толчки }. */
  function demo(sc, seed, o) {
    o = o || {}; const r = rng(seed * 104729 + 5), f = o.f != null ? o.f : 0.95 + r() * 0.1, push = o.push !== false;
    let lat = o.off != null ? o.off : (r() * 2 - 1) * 1.4, s = 0, t = 0;
    const pos = [atSL(sc, 0, lat)], st = [[0, lat]], L = sc.line.len;
    while (s < L && t < 400) {
      s = Math.min(L, s + speedAt(sc, s, f)); lat *= Math.exp(-1 / LAT_TAU); t++;
      if (push && s < L - 6 && r() < 1 / 14) lat = clamp(lat + (r() < 0.5 ? -1 : 1) * (0.6 + 0.8 * r()), -1.6, 1.6);
      pos.push(atSL(sc, s, lat)); st.push([s, lat]);
    }
    return { sc, pos, st, f, T: pos.length - 1 };
  }
  /** Что оператор сделал бы из такта k дальше без толчков: n + 1 положений, начиная с нынешнего. */
  function intended(d, k, n) {
    let [s, lat] = d.st[Math.min(k, d.T)]; const sc = d.sc, L = sc.line.len, out = [atSL(sc, s, lat)];
    for (let i = 0; i < n; i++) { if (s < L) { s = Math.min(L, s + speedAt(sc, s, d.f)); lat *= Math.exp(-1 / LAT_TAU); } out.push(s < L ? atSL(sc, s, lat) : out[out.length - 1]); }
    return out;
  }
  /** Пачка смещений за n тактов из такта k по замыслу оператора. */
  function intendedDisp(d, k, n) { const q = intended(d, k, n), out = []; for (let i = 0; i < n; i++) out.push([q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]]); return out; }
  /** Время оператора на сцене без случайностей — от него считается срок. */
  const operatorTime = (sc) => demo(sc, 1, { f: 1, off: 0, push: false }).T;
  const timeLimit = (sc) => Math.ceil(CFG.LIMIT * operatorTime(sc));

  /* ---------- наблюдение: что дал бы детектор по картинке ---------- */
  const AHEAD = [4, 8, 13, 19, 26, 34, 44];                   // точки осевой впереди, px пути
  const OD = AHEAD.length * 2 + 2;
  /** Оси, связанные с желобком у фигурки: u — вдоль желобка, w — поперёк (как у камеры на запястье: вид «из фигурки»). */
  function frameAt(sc, p) { const s = nearest(sc, p).s, t = tangent(sc, s); return { s, u: t, w: [-t[1], t[0]] }; }
  const toLocal = (F, v) => [v[0] * F.u[0] + v[1] * F.u[1], v[0] * F.w[0] + v[1] * F.w[1]];
  const toWorld = (F, v) => [v[0] * F.u[0] + v[1] * F.w[0], v[0] * F.u[1] + v[1] * F.w[1]];
  /** Семь точек осевой впереди в осях желобка (делённые на 16), остаток пути до цели (делённый на 40, не больше 1)
   *  и команда. В π0 команду читает языковая модель; у нас от команды остаётся одно число: 1 — «вставь в гнездо»,
   *  0 — «доведи до предмета» (все задачи предобучения). */
  function observe(sc, p, F) {
    F = F || frameAt(sc, p); const o = new Float64Array(OD), n = AHEAD.length * 2;
    AHEAD.forEach((d, i) => { const q = pathPoint(sc, F.s + d), v = toLocal(F, [q[0] - p[0], q[1] - p[1]]); o[2 * i] = v[0] / 16; o[2 * i + 1] = v[1] / 16; });
    o[n] = Math.min(1, (sc.line.len - F.s) / 40); o[n + 1] = sc.kind === 's' ? 1 : 0;
    return o;
  }
  /** Точки, которые видит модель, — для рисунка. */
  const seenPoints = (sc, p) => { const s = nearest(sc, p).s; return AHEAD.map((d) => pathPoint(sc, s + d)); };

  /* ---------- MLP с Adam и обучением пачками (перенесено из l18/engine.js) ---------- */
  /** sizes — размеры слоёв; последний слой с уменьшенным масштабом. Веса: w[o·nI + i]. */
  function mlp(sizes, seed) {
    const r = rng(seed || 5), W = [], B = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const nI = sizes[l], nO = sizes[l + 1], w = new Float64Array(nI * nO), s = Math.sqrt(2 / nI) * (l === sizes.length - 2 ? 0.25 : 1);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * s;
      W.push(w); B.push(new Float64Array(nO));
    }
    const z = (a) => a.map((x) => new Float64Array(x.length));
    return { sizes: sizes.slice(), W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0 };
  }
  /** Копия сети; fresh — сбросить состояние Adam (постобучение на новых данных). */
  function clone(m, fresh) {
    const c = (a) => a.map((x) => new Float64Array(x)), z = (a) => a.map((x) => new Float64Array(x.length));
    return { sizes: m.sizes.slice(), W: c(m.W), B: c(m.B), mW: fresh ? z(m.mW) : c(m.mW), vW: fresh ? z(m.vW) : c(m.vW), mB: fresh ? z(m.mB) : c(m.mB), vB: fresh ? z(m.vB) : c(m.vB), t: fresh ? 0 : m.t };
  }
  const silu = (z) => z / (1 + Math.exp(-z));
  /** Буферы на пачку из bs примеров: прямой проход, обратный от градиента по выходу, шаг Adam. */
  function trainer(m, bs) {
    const S = m.sizes, L = S.length - 1;
    const A = S.map((n) => new Float64Array(bs * n)), Zs = S.map((n) => new Float64Array(bs * n)), D = S.map((n) => new Float64Array(bs * n));
    const gW = m.W.map((w) => new Float64Array(w.length)), gB = m.B.map((b) => new Float64Array(b.length));
    function forward(n) {
      for (let l = 0; l < L; l++) {
        const nI = S[l], nO = S[l + 1], w = m.W[l], b = m.B[l], a = A[l], z = Zs[l + 1], y = A[l + 1], last = l === L - 1;
        for (let k = 0; k < n; k++) {
          const ai = k * nI, zo = k * nO;
          for (let o = 0; o < nO; o++) {
            let s = b[o]; const wo = o * nI;
            for (let i = 0; i < nI; i++) s += a[ai + i] * w[wo + i];
            z[zo + o] = s; y[zo + o] = last ? s : silu(s);
          }
        }
      }
      return A[L];
    }
    /** Шаг Adam по градиенту dL на выходе (n × выход, уже поделён на n). */
    function backward(n, dL, lr) {
      D[L].set(dL.subarray ? dL.subarray(0, n * S[L]) : dL);
      for (let l = 0; l < L; l++) { gW[l].fill(0); gB[l].fill(0); }
      for (let l = L - 1; l >= 0; l--) {
        const nI = S[l], nO = S[l + 1], w = m.W[l], a = A[l], d = D[l + 1], gw = gW[l], gb = gB[l], dPrev = D[l], zPrev = Zs[l];
        if (l > 0) dPrev.fill(0, 0, n * nI);
        for (let k = 0; k < n; k++) {
          const ai = k * nI, di = k * nO;
          for (let o = 0; o < nO; o++) {
            const g = d[di + o]; if (g === 0) continue; gb[o] += g; const wo = o * nI;
            for (let i = 0; i < nI; i++) gw[wo + i] += a[ai + i] * g;
            if (l > 0) for (let i = 0; i < nI; i++) dPrev[ai + i] += w[wo + i] * g;
          }
        }
        if (l > 0) for (let k = 0; k < n * nI; k++) { const z = zPrev[k], sg = 1 / (1 + Math.exp(-z)); dPrev[k] *= sg * (1 + z * (1 - sg)); }
      }
      m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t);
      for (let l = 0; l < L; l++) for (const [P, G, M, V] of [[m.W[l], gW[l], m.mW[l], m.vW[l]], [m.B[l], gB[l], m.mB[l], m.vB[l]]]) {
        for (let i = 0; i < P.length; i++) { const g = G[i]; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
      }
    }
    const dL = new Float64Array(bs * S[L]);
    /** Шаг по среднему квадрату ошибки к целям Y. Возвращает среднюю по примерам ошибку. */
    function step(n, Y, lr) {
      const out = forward(n), nOut = S[L]; let loss = 0;
      for (let k = 0; k < n * nOut; k++) { const e = out[k] - Y[k]; loss += e * e; dL[k] = 2 * e / n; }
      backward(n, dL, lr); return loss / n;
    }
    /** Шаг по перекрёстной энтропии: softmax по выходу, целевые классы cls. sig — размытие метки по соседним корзинам
     *  (0 — обычная жёсткая метка). Возвращает среднюю потерю по жёсткой метке. */
    function stepCE(n, cls, lr, sig) {
      const out = forward(n), nOut = S[L]; let loss = 0;
      for (let k = 0; k < n; k++) {
        const off = k * nOut; let mx = -Infinity; for (let j = 0; j < nOut; j++) mx = Math.max(mx, out[off + j]);
        let z = 0; for (let j = 0; j < nOut; j++) z += Math.exp(out[off + j] - mx);
        let zq = 0; if (sig) for (let j = 0; j < nOut; j++) zq += Math.exp(-((j - cls[k]) ** 2) / (2 * sig * sig));
        for (let j = 0; j < nOut; j++) { const p = Math.exp(out[off + j] - mx) / z, q = sig ? Math.exp(-((j - cls[k]) ** 2) / (2 * sig * sig)) / zq : (j === cls[k] ? 1 : 0); dL[off + j] = (p - q) / n; }
        loss -= (out[off + cls[k]] - mx - Math.log(z)) / n;
      }
      backward(n, dL, lr); return loss;
    }
    return { input: A[0], forward, step, stepCE, backward, bs };
  }
  const lrAt = (lr, it, iters) => lr * (it < iters * 0.6 ? 1 : it < iters * 0.85 ? 0.35 : 0.12);
  const NF = 5; // признаки времени: τ, 0,1/(1 − τ), sin πτ, cos πτ, sin 2πτ. Второй признак — потому что точное поле (x₁ − x_τ)/(1 − τ) растёт как 1/(1 − τ)
  function tfeat(t, a, o) { a[o] = t; a[o + 1] = 0.1 / (1 - Math.min(t, 0.95)); a[o + 2] = Math.sin(Math.PI * t); a[o + 3] = Math.cos(Math.PI * t); a[o + 4] = Math.sin(2 * Math.PI * t); }

  /* ---------- модель B: условный flow matching для пачки из 50 смещений ---------- */
  /** Пачка — 50 смещений фигурки, по одному на такт 20 мс, по двум осям. Наш эксперт действий выдаёт её не 100 числами,
   *  а 8 коэффициентами ДКП на ось (раздел FAST: гладкой пачке их хватает, 99% энергии), — маленькой сети в браузере
   *  так проще учиться. Коэффициенты делим на их типичный разброс SIG, и flow matching идёт в этих 16 числах.
   *  Сеть по [наблюдение, шумные коэффициенты, признаки τ] оценивает итоговые коэффициенты D, скорость
   *  v = (D − z_τ)/(1 − τ). Ошибка ‖D − z₁‖² — та же цель flow matching ‖v − (z₁ − z₀)‖², умноженная на (1 − τ)². */
  const CK = 8, CD = CK * 2, FIN = OD + CD + NF;
  let FHID = [64, 64];
  const SIG = [1.6, 1.4, 0.74, 0.6, 0.42, 0.29, 0.2, 0.14];
  const BASIS = Array.from({ length: CK }, (_, j) => Array.from({ length: CFG.H }, (_, i) => Math.cos(Math.PI / CFG.H * (i + 0.5) * j) * Math.sqrt((j === 0 ? 1 : 2) / CFG.H)));
  /** 16 нормированных коэффициентов → 50 смещений в px. */
  function fromCoef(z) { const c = []; for (let i = 0; i < CFG.H; i++) { let dx = 0, dy = 0; for (let j = 0; j < CK; j++) { dx += z[j] * SIG[j] * BASIS[j][i]; dy += z[CK + j] * SIG[j] * BASIS[j][i]; } c.push([dx * CFG.DS, dy * CFG.DS]); } return c; }
  /** 50 смещений в px → 16 нормированных коэффициентов. */
  function toCoef(disp) { const z = new Float64Array(CD); for (let j = 0; j < CK; j++) { let sx = 0, sy = 0; for (let i = 0; i < CFG.H; i++) { sx += disp[i][0] / CFG.DS * BASIS[j][i]; sy += disp[i][1] / CFG.DS * BASIS[j][i]; } z[j] = sx / SIG[j]; z[CK + j] = sy / SIG[j]; } return z; }
  /** Веса от входа «команда» в начале нулевые: пока команда «вставь в гнездо» не встречалась в обучении, она ничего не сдвигает. */
  function zeroTask(m) { const nI = m.sizes[0], w = m.W[0]; for (let o = 0; o < m.sizes[1]; o++) w[o * nI + OD - 1] = 0; return m; }
  const flowInit = (seed, hid) => zeroTask(mlp([FIN].concat(hid || FHID, [CD]), seed || 5));
  const flowClone = (m, fresh) => clone(m, fresh);
  /** Пары для обучения: наблюдение в такте k и коэффициенты пачки смещений с k по k + 49 (после цели — нули). */
  function flowPairs(demos, stride) {
    const out = [];
    for (const d of demos) for (let k = 0; k < d.T; k += stride || 1) { const F = frameAt(d.sc, d.pos[k]); out.push({ o: observe(d.sc, d.pos[k], F), x: toCoef(intendedDisp(d, k, CFG.H).map((v) => toLocal(F, v))), kind: d.sc.kind }); }
    return out;
  }
  /** τ как в π0: τ = s·(1 − u), u ~ Beta(1,5; 1) — чаще шумная сторона. В статье s = 0,999 при шаге δ > 0,001;
   *  у нас δ = 0,1, при инференсе τ выше 0,9 не бывает, поэтому s = 0,9. */
  const TAU_S = 0.9;
  const sampleTau = (r) => TAU_S * (1 - Math.pow(r(), 1 / 1.5));
  /** Обучение: z₁ — коэффициенты пачки, z₀ — шум, вход [o, (1 − τ)z₀ + τz₁, τ]. Генератор: прогресс, в конце — модель. */
  function* flowTrain(m, pairs, opts) {
    opts = opts || {}; const iters = opts.iters || 1500, bs = opts.bs || 16, lr = opts.lr || 0.003, r = rng(opts.seed || 7), tr = trainer(m, bs), X = tr.input, Y = new Float64Array(bs * CD); let ema = null;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < bs; k++) {
        const p = pairs[Math.floor(r() * pairs.length)], t = sampleTau(r), off = k * FIN;
        X.set(p.o, off);
        for (let i = 0; i < CD; i++) X[off + OD + i] = (1 - t) * randn(r) + t * p.x[i];
        tfeat(t, X, off + OD + CD); Y.set(p.x, k * CD);
      }
      const l = tr.step(bs, Y, lrAt(lr, it, iters)) / CD; ema = ema == null ? l : 0.97 * ema + 0.03 * l;
      if (it % 25 === 0 || it === iters - 1) yield { it, iters, loss: ema };
    }
    return m;
  }
  /** Пачка за N шагов Эйлера из шума с зерном: смещения за такт в осях желобка, px [[du, dw] × 50]; traj — пачка после каждого шага. */
  function flowChunk(m, o, seed, N, traj) {
    N = N || CFG.STEPS; const r = rng(seed || 1), tr = trainer(m, 1), X = tr.input, z = new Float64Array(CD);
    for (let i = 0; i < CD; i++) z[i] = randn(r);
    if (traj) traj.push(fromCoef(z));
    for (let k = 0; k < N; k++) {
      const t = k / N; X.set(o, 0); X.set(z, OD); tfeat(t, X, OD + CD);
      const D = tr.forward(1); for (let i = 0; i < CD; i++) z[i] += (D[i] - z[i]) / (1 - t) / N;
      if (traj) traj.push(fromCoef(z));
    }
    return fromCoef(z);
  }

  /* ---------- модель A: действия как токены, авторегрессия по двум измерениям ---------- */
  const THID = [48, 48], TIN = OD + 1;
  const tokInit = (seed) => ({ dx: zeroTask(mlp([TIN].concat(THID, [CFG.BINS]), (seed || 11))), dy: zeroTask(mlp([TIN + 1].concat(THID, [CFG.BINS]), (seed || 11) + 1)) });
  const tokClone = (m, fresh) => ({ dx: clone(m.dx, fresh), dy: clone(m.dy, fresh) });
  const toBin = (v) => clamp(Math.round((v + CFG.AMAX) / (2 * CFG.AMAX) * (CFG.BINS - 1)), 0, CFG.BINS - 1);
  const fromBin = (b) => b / (CFG.BINS - 1) * 2 * CFG.AMAX - CFG.AMAX;
  const TEMPOS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  /** Пары: наблюдение в такте k, темп и куда оператор сместился за 17·темп тактов — в корзинах. */
  function tokPairs(demos, stride) {
    const out = [];
    for (const d of demos) for (let k = 0; k < d.T; k += stride || 1) {
      const q = intended(d, k, CFG.A_STEP + 1), F = frameAt(d.sc, d.pos[k]), o = observe(d.sc, d.pos[k], F); for (const sp of TEMPOS) {
      const u = CFG.A_STEP * sp, i = Math.floor(u), w = u - i, a = q[0], b = [q[i][0] + (q[i + 1][0] - q[i][0]) * w, q[i][1] + (q[i + 1][1] - q[i][1]) * w];
      const v = toLocal(F, [b[0] - a[0], b[1] - a[1]]); out.push({ o, sp, bx: toBin(v[0]), by: toBin(v[1]), kind: d.sc.kind });
    } }
    return out;
  }
  /** Обучение двух голов перекрёстной энтропией: p(bx | o, темп) и p(by | o, темп, bx). soft — размытие метки по соседним корзинам. */
  function* tokTrain(m, pairs, opts) {
    opts = opts || {}; const iters = opts.iters || 1000, bs = opts.bs || 16, lr = opts.lr || 0.003, r = rng(opts.seed || 9), soft = opts.soft == null ? 1.5 : opts.soft;
    const t1 = trainer(m.dx, bs), t2 = trainer(m.dy, bs), c1 = new Int32Array(bs), c2 = new Int32Array(bs); let ema = null;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < bs; k++) {
        const p = pairs[Math.floor(r() * pairs.length)];
        t1.input.set(p.o, k * TIN); t1.input[k * TIN + OD] = p.sp; c1[k] = p.bx;
        t2.input.set(p.o, k * (TIN + 1)); t2.input[k * (TIN + 1) + OD] = p.sp; t2.input[k * (TIN + 1) + OD + 1] = fromBin(p.bx) / CFG.AMAX; c2[k] = p.by;
      }
      const l = t1.stepCE(bs, c1, lrAt(lr, it, iters), soft) + t2.stepCE(bs, c2, lrAt(lr, it, iters), soft); ema = ema == null ? l : 0.97 * ema + 0.03 * l;
      if (it % 25 === 0 || it === iters - 1) yield { it, iters, loss: ema };
    }
    return m;
  }
  const argmax = (a, n) => { let bi = 0; for (let i = 1; i < n; i++) if (a[i] > a[bi]) bi = i; return bi; };
  /** Жадное декодирование: сначала токен dx, потом dy при известном dx. Смещение за 17 тактов (px) и корзины. */
  function tokAct(m, o, sp) {
    const t1 = trainer(m.dx, 1), t2 = trainer(m.dy, 1);
    t1.input.set(o, 0); t1.input[OD] = sp; const bx = argmax(t1.forward(1), CFG.BINS), dx = fromBin(bx);
    t2.input.set(o, 0); t2.input[OD] = sp; t2.input[OD + 1] = dx / CFG.AMAX; const by = argmax(t2.forward(1), CFG.BINS);
    return { dx, dy: fromBin(by), bx, by };
  }

  /* ---------- робот: прогон модели по сцене ---------- */
  /** policy: { kind: 'tok', m, tempo } | { kind: 'flow', m, exec, steps }. Такт за тактом до цели, стенки или срока.
   *  След, команды (отрезки A или пачки B), исход: ok — в гнезде, hit — задел стенку, bump — влетел в гнездо
   *  быстрее VIN и отскочил, late — не успел. vIn — скорость в момент входа в гнездо.
   *  jerk — наибольший скачок скорости между соседними тактами, px/такт. */
  function rollout(sc, policy, o) {
    o = o || {}; const limit = o.limit || timeLimit(sc), top = operatorTime(sc);
    let p = [sc.S[0], sc.S[1]], t = 0, ok = false, hit = false, late = false, bump = false, vIn = null, minGap = Infinity, jerk = 0, vPrev = null;
    const trail = [p.slice()], cmds = [], speed = [];
    let cur = null;
    while (t <= limit) {
      let d;
      if (policy.kind === 'tok') {
        if (!cur || cur.k >= CFG.A_STEP) {
          const F = frameAt(sc, p), a = tokAct(policy.m, observe(sc, p, F), policy.tempo == null ? 1 : policy.tempo), v = toWorld(F, [a.dx, a.dy]);
          cur = { from: p.slice(), dx: v[0], dy: v[1], k: 0, t0: t, bx: a.bx, by: a.by, seen: seenPoints(sc, p) }; cmds.push(cur);
        }
        d = [cur.dx / CFG.A_STEP, cur.dy / CFG.A_STEP];
      } else {
        const exec = policy.exec || CFG.EXEC;
        if (!cur || cur.k >= exec) {
          const F = frameAt(sc, p), chunk = flowChunk(policy.m, observe(sc, p, F), (o.seed || 1) * 1000 + t, policy.steps || CFG.STEPS).map((v) => toWorld(F, v));
          cur = { from: p.slice(), chunk, k: 0, t0: t, exec, seen: seenPoints(sc, p) }; cmds.push(cur);
        }
        d = cur.chunk[cur.k];
      }
      cur.k++; p = [p[0] + d[0], p[1] + d[1]]; t++;
      trail.push(p.slice()); speed.push(Math.hypot(d[0], d[1]));
      if (vPrev) jerk = Math.max(jerk, Math.hypot(d[0] - vPrev[0], d[1] - vPrev[1])); vPrev = d;
      const nr = nearest(sc, p), gap = MARGIN - nr.d; if (gap < minGap) minGap = gap;
      if (Math.hypot(p[0] - sc.G[0], p[1] - sc.G[1]) <= CFG.GOAL) { vIn = Math.hypot(d[0], d[1]); if (sc.kind === 's' && vIn > CFG.VIN) bump = true; else ok = true; break; }
      if (nr.d > MARGIN) { hit = true; break; }
      if (t >= limit) { late = true; break; }
    }
    return { ok, hit, bump, late, vIn, ticks: t, limit, top, trail, cmds, speed, minGap, jerk, kind: policy.kind };
  }
  /** Прогон на нескольких сценах желобка: сколько дошли, задели стенку, влетели в гнездо, не успели. */
  function evaluate(policy, seeds) {
    const runs = seeds.map((s) => Object.assign({ seed: s }, rollout(makeScene('s', s), policy, { seed: s })));
    const n = runs.length, ok = runs.filter((r) => r.ok).length, hit = runs.filter((r) => r.hit).length, late = runs.filter((r) => r.late).length, bump = runs.filter((r) => r.bump).length;
    const okRuns = runs.filter((r) => r.ok), meanT = okRuns.length ? okRuns.reduce((a, r) => a + r.ticks / r.top, 0) / okRuns.length : null;
    const jerk = runs.reduce((a, r) => a + r.jerk, 0) / n;
    return { n, ok, hit, bump, late, rate: ok / n, meanT, jerk, runs };
  }

  /* ---------- данные: демонстрации желобка и задач предобучения ---------- */
  const FINE_SEED = 300, PRE_SEED = 900, EVAL_SEED = 5000;
  /** n демонстраций желобка на n разных сценах — отобранные, аккуратные: оператор начинает точно на осевой, без толчков. */
  function fineDemos(n, seed0, o) { const out = []; for (let i = 0; i < n; i++) { const sc = makeScene('s', (seed0 || FINE_SEED) + i); out.push(demo(sc, (seed0 || FINE_SEED) + i, Object.assign({ off: 0, push: false }, o || {}))); } return out; }
  /** Демонстрации четырёх других желобков: по n на каждый. Разнообразные, с ошибками и исправлениями: старт сбоку, толчки. */
  function preDemos(n, seed0) { const out = []; for (const kind of ['scube', 'arc', 'slalom', 'line']) for (let i = 0; i < n; i++) { const sc = makeScene(kind, (seed0 || PRE_SEED) + i); out.push(demo(sc, (seed0 || PRE_SEED) + i)); } return out; }
  const evalSeeds = (n) => Array.from({ length: n }, (_, i) => EVAL_SEED + i);
  /** Рецепт лаборатории — одни числа для урока и для теста. */
  const RECIPE = {
    fineN: 24, flowIters: 3000, tokIters: 1000, tokStride: 2, evalN: 20,      // сравнение A и B: 24 записи желобка
    postN: 1, preN: 30, preIters: 6000, postIters: 300, postLr: 0.0005, scratchIters: 3000, // предобучение и постобучение
  };

  /* ---------- FAST в миниатюре: ДКП, k коэффициентов, округление ---------- */
  /** Ортонормированное ДКП-II по вектору x. */
  function dct(x) {
    const N = x.length, c = new Float64Array(N);
    for (let k = 0; k < N; k++) { let s = 0; for (let n = 0; n < N; n++) s += x[n] * Math.cos(Math.PI / N * (n + 0.5) * k); c[k] = s * Math.sqrt((k === 0 ? 1 : 2) / N); }
    return c;
  }
  function idct(c) {
    const N = c.length, x = new Float64Array(N);
    for (let n = 0; n < N; n++) { let s = 0; for (let k = 0; k < N; k++) s += c[k] * Math.sqrt((k === 0 ? 1 : 2) / N) * Math.cos(Math.PI / N * (n + 0.5) * k); x[n] = s; }
    return x;
  }
  /** Пачка (H × D, в px) → по каждому измерению ДКП, первые k коэффициентов, округление с масштабом γ (в единицах после нормировки на DS).
   *  Возвращает коэффициенты, квантованные целые, восстановление, ошибку по смещениям и по положению (накопленной), число токенов. */
  function fastEncode(chunk, k, gamma) {
    const H = chunk.length, D = chunk[0].length, dims = [];
    let se = 0, maxPos = 0, nonzero = 0;
    const recon = Array.from({ length: H }, () => new Array(D).fill(0));
    for (let d = 0; d < D; d++) {
      const x = new Float64Array(H); for (let i = 0; i < H; i++) x[i] = chunk[i][d] / CFG.DS;
      const c = dct(x), q = new Int32Array(H), cq = new Float64Array(H);
      for (let j = 0; j < H; j++) { if (j < k) { q[j] = Math.round(gamma * c[j]); cq[j] = q[j] / gamma; if (q[j] !== 0) nonzero++; } }
      const y = idct(cq);
      for (let i = 0; i < H; i++) recon[i][d] = y[i] * CFG.DS;
      dims.push({ coef: Array.from(c), q: Array.from(q), x: Array.from(x, (v) => v * CFG.DS), y: Array.from(y, (v) => v * CFG.DS) });
    }
    let px = 0, py = 0, qx = 0, qy = 0;
    for (let i = 0; i < H; i++) {
      for (let d = 0; d < D; d++) { const e = recon[i][d] - chunk[i][d]; se += e * e; }
      px += chunk[i][0]; py += chunk[i][1]; qx += recon[i][0]; qy += recon[i][1];
      maxPos = Math.max(maxPos, Math.hypot(px - qx, py - qy));
    }
    return { dims, recon, rmse: Math.sqrt(se / (H * D)), maxPos, tokens: k * D, nonzero, naive: H * D, k, gamma };
  }
  /** Наименьшее k, при котором отклонение положения не больше tol px. */
  function fastMinK(chunk, gamma, tol) { for (let k = 1; k <= chunk.length; k++) if (fastEncode(chunk, k, gamma).maxPos <= tol) return k; return chunk.length; }

  const API = { CFG, MARGIN, TW, KINDS, KIND_NAME, polyline, pathPoint, tangent, nearest, makeScene, speedAt, atSL, demo, intended, intendedDisp, operatorTime, timeLimit, AHEAD, OD, frameAt, toLocal, toWorld, observe, seenPoints,
    mlp, clone, trainer, lrAt, NF, tfeat, CK, CD, FIN, SIG, BASIS, fromCoef, toCoef, flowInit, flowClone, flowPairs, TAU_S, sampleTau, flowTrain, flowChunk, THID, tokInit, tokClone, toBin, fromBin, TEMPOS, tokPairs, tokTrain, tokAct,
    rollout, evaluate, RECIPE, FINE_SEED, PRE_SEED, EVAL_SEED, fineDemos, preDemos, evalSeeds, dct, idct, fastEncode, fastMinK };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L36 = API;
})(typeof window !== 'undefined' ? window : globalThis);
