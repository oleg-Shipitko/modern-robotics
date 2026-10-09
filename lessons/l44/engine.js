/* =====================================================================
   l44/engine.js — урок 4.4 «Обучение на видео людей». Без DOM: работает
   в браузере (window.L44, поверх window.Arm и window.L21) и в Node.
   1) Ретаргетинг (shared/arm-core.js): человек на видео переносит предмет
      со стола на полку; путь его кисти и раскрытие пальцев переносят на
      руку Ады тремя способами — углы суставов один в один, от плеча,
      от стола — с замедлением. Рука Ады следует за путём с пределом
      скорости суставов; захват смыкается, когда смыкаются пальцы человека.
   2) Видео людей в обучении (стол из 2.1, кухни как в 4.3): мини-политика
      «где взять» учится на демонстрациях робота из двух кухонь лаборатории
      и на видео людей из разных кухонь. Метка видео — точка ладони: она
      сдвинута от места захвата и зашумлена. Одна общая голова или две
      головы (своя у робота и у человека) над общими признаками.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const NODE = typeof module !== 'undefined' && module.exports;
  const Arm = NODE ? require('../shared/arm-core.js') : root.Arm;
  const L = NODE ? require('../l21/engine.js') : root.L21;

  /* =====================================================================
     1. Ретаргетинг: рука человека → рука Ады. Вид сбоку, метры; плечо Ады
        в (0, 0), ось y вверх. Стол, чашка и полка — как в уроке 4.2.
     ===================================================================== */
  const DT = 0.01;                                        // такт 10 мс
  let VMAX = 1.2, AMAX = 3.0, KP = 12;                 // предел скорости (рад/с) и ускорения (рад/с²) суставов Ады, усиление
  const REACH = Arm.L1 + Arm.L2 - 0.012;                  // досягаемость кисти Ады, м
  const GRIP_MAX = 0.09;                                  // наибольшее раскрытие захвата Ады, м
  const S = {
    table: { y: -0.5, x0: 0.15, x1: 1.05 },
    shelf: { x0: 0.55, x1: 1.05, y: 0.14, th: 0.025 },
    wall: 1.05, finger: 0.07, hang: 0.035,
    placeX: [0.6, 1.0],
  };
  /** Рука человека: плечо 0,30 м, предплечье до середины ладони 0,27 м (иллюстрация). */
  const HUM = { l1: 0.30, l2: 0.27 };
  /** Предметы роликов: ширина, высота, где стоит на столе (центр дна), куда ставят на полку. */
  const ITEMS = {
    cup: { name: 'чашка', w: 0.07, h: 0.09, x: 0.42, to: 0.71 },
    jar: { name: 'банка с крупой', w: 0.13, h: 0.12, x: 0.42, to: 0.72 },
    cupFar: { name: 'чашка', w: 0.07, h: 0.09, x: 0.42, to: 0.97 },
  };
  /** Ролики: ключевые точки кисти в системе стола (t, x, y), раскрытие пальцев, где стоит плечо человека.
      Человек двигается в 4 раза быстрее, чем Ада успевает повторить (как у HAT: αslow ≈ 4). */
  function clipOf(id) {
    const it = ITEMS[id === 'jar' ? 'jar' : id === 'far' ? 'cupFar' : 'cup'];
    const gy = S.table.y + it.h + S.hang, py = S.shelf.y + it.h + S.hang;
    const open = Math.min(0.15, it.w + 0.035), hold = it.w - 0.004;
    const far = id === 'far';
    const K = [
      [0.00, 0.26, -0.18], [0.40, it.x - 0.02, gy + 0.09], [0.65, it.x, gy], [0.85, it.x, gy],
      [1.10, it.x + 0.02, gy + 0.16], [1.45, 0.50, py + 0.08], [1.80, it.to - 0.05, py + 0.06], [2.00, it.to, py], [2.20, it.to, py], [2.50, it.to - 0.1, py + 0.08],
    ];
    const ap = [[0, open], [0.65, open], [0.75, hold], [2.0, hold], [2.1, open], [2.5, open]];
    // плечо человека в системе стола: стоит ближе к столу и выше Ады; к дальнему краю полки делает шаг вперёд
    const sh = (t) => (far ? { x: 0.18 + 0.30 * smooth(seg(t, 1.1, 1.75)), y: 0.08 } : { x: 0.18, y: 0.08 });
    return { id, item: it, K, ap, sh, T: K[K.length - 1][0], tGrip: 0.75, tOpen: 2.1, gy, py };
  }
  const seg = (u, a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
  const smooth = (x) => x * x * (3 - 2 * x);
  /** Положение кисти человека в момент t (система стола): гладкая интерполяция между ключевыми точками. */
  function handAt(clip, t) {
    const K = clip.K; if (t <= K[0][0]) return { x: K[0][1], y: K[0][2] };
    for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const s = smooth((t - K[i - 1][0]) / (K[i][0] - K[i - 1][0])); return { x: K[i - 1][1] + (K[i][1] - K[i - 1][1]) * s, y: K[i - 1][2] + (K[i][2] - K[i - 1][2]) * s }; }
    const e = K[K.length - 1]; return { x: e[1], y: e[2] };
  }
  function apAt(clip, t) {
    const A = clip.ap; for (let i = 1; i < A.length; i++) if (t <= A[i][0]) { const s = (t - A[i - 1][0]) / (A[i][0] - A[i - 1][0]); return A[i - 1][1] + (A[i][1] - A[i - 1][1]) * s; }
    return A[A.length - 1][1];
  }
  /** Углы руки человека (плечо, локоть) по кисти: двухзвенная рука, локоть вниз. */
  function humanQ(clip, t) {
    const p = handAt(clip, t), s = clip.sh(t), dx = p.x - s.x, dy = p.y - s.y, d = Math.min(HUM.l1 + HUM.l2 - 1e-4, Math.hypot(dx, dy));
    const c2 = (d * d - HUM.l1 * HUM.l1 - HUM.l2 * HUM.l2) / (2 * HUM.l1 * HUM.l2), q2 = Math.acos(Math.max(-1, Math.min(1, c2)));
    const q1 = Math.atan2(dy, dx) - Math.atan2(HUM.l2 * Math.sin(q2), HUM.l1 + HUM.l2 * Math.cos(q2));
    return [q1, q2];
  }
  /** Ретаргетинг: куда должна прийти кисть Ады в момент t ролика. mode: 'joints' | 'shoulder' | 'table'. */
  function targetAt(clip, t, mode) {
    if (mode === 'joints') { const f = Arm.fk(humanQ(clip, t)); return { x: f.x, y: f.y }; }
    const p = handAt(clip, t);
    if (mode === 'shoulder') { const s = clip.sh(t); return { x: p.x - s.x, y: p.y - s.y }; }
    return p;
  }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function ikNear(p, qPrev) {
    const r = Math.hypot(p.x, p.y), f = r > REACH ? REACH / r : 1, sols = Arm.ik(p.x * f, p.y * f);
    if (!sols.length) return qPrev.slice();
    let best = sols[0], bd = Infinity;
    for (const s of sols) { const d = Math.abs(wrap(s[0] - qPrev[0])) + Math.abs(wrap(s[1] - qPrev[1])); if (d < bd) { bd = d; best = s; } }
    return [qPrev[0] + wrap(best[0] - qPrev[0]), qPrev[1] + wrap(best[1] - qPrev[1])];
  }
  const wristOf = (q) => { const f = Arm.fk(q); return { x: f.x, y: f.y }; };
  /** Прогон: Ада повторяет ролик clipId с ретаргетингом mode и замедлением slow. Кадры каждые 20 мс. */
  function retarget(o) {
    const clip = clipOf(o.clip || 'cup'), mode = o.mode || 'table', slow = o.slow || 1, it = clip.item;
    const T = clip.T * slow + 0.4, frames = [];
    let q = ikNear(targetAt(clip, 0, mode), [-1.2, 1.6]), dq = [0, 0], qRef = q.slice(), held = false, placed = false;
    let maxLag = 0, outN = 0, n = 0, graspErr = null, placeErr = null, tableHit = false, wide = false, gripT = null, bump = false;
    const obj = { x: it.x, y: S.table.y, held: false, onShelf: false };
    for (let k = 0; k <= Math.round(T / DT); k++) {
      const t = k * DT, tc = Math.min(clip.T, t / slow), tgt = targetAt(clip, tc, mode), tgt2 = targetAt(clip, Math.min(clip.T, (t + DT) / slow), mode);
      const r = Math.hypot(tgt.x, tgt.y); n++; if (r > REACH) outN++;
      const q1 = ikNear(tgt, qRef), q2 = ikNear(tgt2, q1);
      // регулятор: скорость пути плюс поправка, с пределами скорости и ускорения суставов
      for (let j = 0; j < 2; j++) {
        const want = Math.max(-VMAX, Math.min(VMAX, (q2[j] - q1[j]) / DT + KP * (q1[j] - q[j])));
        dq[j] += Math.max(-AMAX * DT, Math.min(AMAX * DT, want - dq[j])); q[j] += dq[j] * DT;
      }
      qRef = q1;
      const w = wristOf(q), lag = Math.hypot(w.x - Math.max(-REACH, Math.min(REACH, tgt.x)) , w.y - tgt.y);
      if (Math.hypot(tgt.x, tgt.y) <= REACH) maxLag = Math.max(maxLag, lag);
      if (w.y - S.finger < S.table.y - 0.005 && w.x > S.table.x0 && !held) tableHit = true;
      const ap = apAt(clip, tc);
      // захват смыкается вместе с пальцами человека; раскрытие Ады ограничено GRIP_MAX
      if (!held && !placed && gripT == null && tc >= clip.tGrip) {
        gripT = t; graspErr = Math.hypot(w.x - it.x, w.y - clip.gy);
        wide = it.w + 0.01 > GRIP_MAX;
        if (!wide && Math.abs(w.x - it.x) < 0.02 && Math.abs(w.y - clip.gy) < 0.03) held = true;
      }
      if (held && !bump && tc >= clip.tOpen) {
        held = false; placed = true; placeErr = Math.hypot(w.x - it.to, w.y - clip.py);
        const bottom = w.y - S.hang - it.h;
        obj.onShelf = w.x >= S.placeX[0] && w.x <= S.placeX[1] && Math.abs(bottom - S.shelf.y) < 0.03;
        obj.x = w.x; obj.y = obj.onShelf ? S.shelf.y : S.table.y; if (!obj.onShelf) obj.fell = true;
      }
      if (held) {
        obj.x = w.x; obj.y = w.y - S.hang - it.h;
        // предмет в захвате задел полку снизу или спереди — падает
        const ox = Math.min(obj.x + it.w / 2, S.wall) - Math.max(obj.x - it.w / 2, S.shelf.x0), oy = Math.min(obj.y + it.h, S.shelf.y) - Math.max(obj.y, S.shelf.y - S.shelf.th);
        if (ox > 0.004 && oy > 0.004) { held = false; bump = true; obj.x = w.x; obj.y = S.table.y; obj.fell = true; }
      }
      obj.held = held;
      if (k % 2 === 0) frames.push({ t, tc, q: q.slice(), w, tgt, ap: Math.min(GRIP_MAX, ap), apH: ap, held, obj: Object.assign({}, obj) });
    }
    const ok = !!obj.onShelf;
    const why = ok ? 'ok' : outN > 0 ? 'reach' : wide ? 'wide' : tableHit ? 'table' : bump ? 'bump' : graspErr != null && graspErr > 0.03 ? 'grasp' : 'place';
    return { clip: clip.id, mode, slow, frames, ok, why, out: outN / n, maxLag, graspErr, placeErr, tableHit, wide, bump, T: clip.T * slow, Th: clip.T, item: it };
  }

  const setLim = (v, a) => { VMAX = v; AMAX = a; };
  const ARM = { setLim, DT, VMAX, AMAX, REACH, GRIP_MAX, S, HUM, ITEMS, clipOf, handAt, apAt, humanQ, targetAt, retarget };

  /* =====================================================================
     2. Видео людей в обучении. Стол 96 × 96 из 2.1, кухни как в 4.3:
        скатерть, свет, кубик и три соседа. Задача — «возьми кубик».
     ===================================================================== */
  const { rng, randn, clamp, TW, G, CELL, RT, paint, cellOf, cellXY, hitObj, softmax, argmax } = L;
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
    { id: 'day', name: 'дневной', g: [1, 1, 1] }, { id: 'warm', name: 'тёплая лампа', g: [1.06, 0.93, 0.74] },
    { id: 'cool', name: 'холодная лампа', g: [0.86, 0.95, 1.08] }, { id: 'dim', name: 'полумрак', g: [0.72, 0.72, 0.74] },
    { id: 'evening', name: 'вечер', g: [0.9, 0.78, 0.66] },
  ];
  const CUBE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  const OTHERS = []; for (const shape of ['bowl', 'can']) for (const color of CUBE_COLORS) OTHERS.push({ color, shape });
  const oi = (color, shape) => OTHERS.findIndex((q) => q.color === color && q.shape === shape);
  /** Две кухни лаборатории, где стоит робот; в каждой своя скатерть, свет и предметы. */
  const LAB = [
    { seed: 1, table: 0, light: 0, cube: 'red', objs: [oi('blue', 'bowl'), oi('green', 'can'), oi('yellow', 'bowl')] },
    { seed: 2, table: 2, light: 2, cube: 'blue', objs: [oi('red', 'can'), oi('yellow', 'can'), oi('green', 'bowl')] },
  ];
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
  /** Эпизод: кубик и три соседа кухни в случайных местах; картинка 96 × 96 под светом кухни. */
  function episode(kit, seed) {
    const r = rng(seed * 2654435761 % 4294967291 + 17), objs = [], spec = [{ color: kit.cube, shape: 'cube' }].concat(kit.objs.map((i) => OTHERS[i])), m = 12;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m - 6); k++; } while (k < 200 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < 19));
      objs.push({ color: it.color, shape: it.shape, x, y });
    }
    const T = TABLES[kit.table], Lg = LIGHTS[kit.light].g, img = new Float32Array(TW * TW * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const c = tableColor(T, x, y), o = (y * TW + x) * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = c[ch] + randn(r) * 0.015; }
    for (const q of objs) paint(img, TW, TW, q.color, q.shape, q.x, q.y, RT, r, 0.03);
    for (let i = 0; i < TW * TW; i++) for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = clamp(img[i * 3 + ch] * Lg[ch], 0, 1);
    return { kit, seed, objs, target: objs[0], img };
  }

  /* ---------- мини-политика: признаки клетки → скрытый слой → оценка клетки (как в 4.3) ---------- */
  const NF = 27, NH = 16;
  /** Признаки всех 576 клеток: средние цвета клетки и восьми соседей (окно 12 × 12 px); за краем стола — серый 0,5. */
  function feats(ep) {
    if (ep.F) return ep.F;
    const g = new Float64Array(G * G * 3);
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const o = (y * TW + x) * 3, gi = (Math.floor(y / CELL) * G + Math.floor(x / CELL)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += ep.img[o + c] / (CELL * CELL); }
    const F = new Float32Array(G * G * NF);
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      let n = (cy * G + cx) * NF;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy, ins = x >= 0 && y >= 0 && x < G && y < G, o = (y * G + x) * 3;
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
    return { P, G: P.map((p) => new Float64Array(p.length)), M: P.map((p) => new Float64Array(p.length)), V: P.map((p) => new Float64Array(p.length)), t: 0, shift: [0, 0] };
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
  /** Сдвиг клетки на (dx, dy) клеток с упором в край стола. */
  function shiftCell(c, d) { const x = clamp(c % G + d[0], 0, G - 1), y = clamp(Math.floor(c / G) + d[1], 0, G - 1); return y * G + x; }
  /** Поправка «захват Ады → ладонь человека»: сдвиг, при котором демонстрации робота самые вероятные для модели, обученной на людях. */
  function bestShift(m, R) {
    const P = R.map((d) => ({ d, p: softmax(scores(m, feats(d.ep))) }));
    let best = [0, 0], bl = -Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { let l = 0; for (const q of P) l += Math.log(q.p[shiftCell(q.d.cell, [dx, dy])] + 1e-9); if (l > bl) { bl = l; best = [dx, dy]; } }
    return best;
  }
  /** Обучение. demos: [{ ep, cell, src: 'robot' | 'human' }].
      o.align = false — метки людей как есть, все примеры вперемешку.
      o.align = true  — сначала половина шагов только на видео людей; затем по демонстрациям робота подбирается поправка
                        (сдвиг от места захвата к ладони), и модель доучивается на смеси 50 на 50, где метки робота сдвинуты на поправку. */
  function* train(demos, o) {
    o = Object.assign({ align: true, pre: 0.5, rw: 0.5, seed: 5 }, o || {});
    const m = modelInit(o.seed), iters = o.iters || CFG.ITERS, lr = 0.01, bs = 8, r = rng(o.seed * 31 + 1);
    const R = demos.filter((d) => d.src === 'robot'), H = demos.filter((d) => d.src === 'human'), both = R.length > 0 && H.length > 0;
    const rw = !both ? (R.length ? 1 : 0) : o.align ? o.rw : R.length / demos.length;
    const hid = new Float64Array(G * G * NH), [gW1, gb1, gw2, gb2] = m.G, w2 = m.P[2], cut = Math.floor(iters * o.pre);
    for (let it = 0; it < iters; it++) {
      const pre = o.align && both && it < cut;
      if (o.align && both && it === cut) m.shift = bestShift(m, R);
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const pool = pre ? H : (r() < rw ? R : H), d = pool[Math.floor(r() * pool.length)];
        const cell = d.src === 'robot' ? shiftCell(d.cell, m.shift) : d.cell;
        const F = feats(d.ep), s = scores(m, F, hid), p = softmax(s);
        loss -= Math.log(p[cell] + 1e-12) / bs;
        for (let i = 0; i < G * G; i++) {
          const gi = p[i] - (i === cell ? 1 : 0); if (Math.abs(gi) < 1e-5) continue;
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
  const finish = (gen) => { for (;;) { const x = gen.next(); if (x.done) return x.value; } };

  /* ---------- наборы: десять минут записи — робот или люди ---------- */
  // EgoMimic: за час 135 демонстраций робота или 1400 человека; на 10 минут — 22 и 233
  const CFG = { ROBOT_10: 22, HUMAN_10: 233, OFF: [0, 6], NOISE: 1.5, ITERS: 300, TEST: 24, TEST_SEED: 9000, EP_SEED: 500, HUM_SEED: 3000 };
  /** Демонстрация робота: оператор берёт в центре кубика. */
  function robotDemo(ep, seed) { const r = rng(seed * 97 + 5), t = ep.target; return { ep, src: 'robot', cell: cellOf(t.x + (r() - 0.5) * 2, t.y + (r() - 0.5) * 2) }; }
  /** Видео человека: метка — точка ладони по трекеру рук; она ниже места захвата (ближе к человеку) и зашумлена. */
  function humanDemo(ep, seed, o) {
    o = o || {}; const r = rng(seed * 131 + 7), t = ep.target, off = o.off || CFG.OFF, ns = o.noise == null ? CFG.NOISE : o.noise;
    const x = clamp(t.x + off[0] + randn(r) * ns, 0, TW - 1), y = clamp(t.y + off[1] + randn(r) * ns, 0, TW - 1);
    return { ep, src: 'human', cell: cellOf(x, y), palm: { x, y } };
  }
  /** Набор на 10 минут записи: доля share — на видео людей, остальное — на робота в двух кухнях лаборатории. */
  function mix(share, o) {
    o = o || {}; const nR = Math.round(CFG.ROBOT_10 * (1 - share)), nH = Math.round(CFG.HUMAN_10 * share), out = [];
    for (let i = 0; i < nR; i++) out.push(robotDemo(episode(LAB[i % 2], CFG.EP_SEED + i * 13), i + 1));
    for (let i = 0; i < nH; i++) out.push(humanDemo(episode(kitchen(CFG.HUM_SEED + i), CFG.HUM_SEED * 3 + i * 7), i + 1, o));
    return { demos: out, nR, nH, share };
  }
  function testSet(n) { const out = []; for (let i = 0; i < (n || CFG.TEST); i++) out.push(episode(kitchen(CFG.TEST_SEED + i), CFG.TEST_SEED * 3 + i)); return out; }
  function labSet(n) { const out = []; for (let i = 0; i < (n || CFG.TEST); i++) out.push(episode(LAB[i % 2], 7000 + i)); return out; }
  /** Вероятности захвата Ады: выход модели, сдвинутый обратно на поправку (у модели без выравнивания поправка нулевая). */
  function probs(m, ep) {
    const p = softmax(scores(m, feats(ep))); if (!m.shift[0] && !m.shift[1]) return p;
    const q = new Float64Array(G * G); let z = 0;
    for (let i = 0; i < G * G; i++) { q[i] = p[shiftCell(i, m.shift)]; z += q[i]; }
    for (let i = 0; i < q.length; i++) q[i] /= z; return q;
  }
  /** Успех — доля попыток, где захват попадёт в кубик: сумма вероятностей клеток над кубиком. */
  function hitMass(p, ep) { let ok = 0; for (let i = 0; i < G * G; i++) { const c = cellXY(i); if (hitObj(ep.target, c.x, c.y)) ok += p[i]; } return ok; }
  function check(m, eps) {
    const runs = eps.map((ep) => { const p = probs(m, ep), i = argmax(p), c = cellXY(i), top = ep.objs.find((q) => hitObj(q, c.x, c.y)) || null; return { p: hitMass(p, ep), top, topOk: top === ep.target, cell: i }; });
    return { rate: runs.reduce((t, q) => t + q.p, 0) / runs.length, runs, n: runs.length };
  }

  const API = Object.assign({}, ARM, { TABLES, LIGHTS, CUBE_COLORS, OTHERS, LAB, kitchen, episode, feats, modelInit, scores, shiftCell, bestShift, train, finish, CFG, robotDemo, humanDemo, mix, testSet, labSet, probs, hitMass, check, cellXY, cellOf, softmax });
  if (NODE) module.exports = API; else root.L44 = API;
})(typeof window !== 'undefined' ? window : globalThis);
