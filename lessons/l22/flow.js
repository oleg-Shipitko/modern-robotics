/* =====================================================================
   flow.js — урок 2.2: три анимированные схемы на общем движке shared/anim.js.
   Нарисованы одними блоками и цветами, чтобы общая схема в конце раздела 4
   узнавалась как сборка из кусочков, показанных раньше:
   • xent (раздел «Воксели») — голова переноса учится как классификатор:
     оценки Q по срезу сетки → softmax → вероятности, целевой воксель,
     потеря −log p(цель) и её падение по шагам обучения; это последний блок
     общей схемы, «Оценка вокселей»;
   • latents (раздел «Латенты») — почему внимание всех ко всем не помещается
     (таблица оценок N × N растёт как квадрат) и как Perceiver читает вход
     латентами, шесть слоёв внимания между латентами, патчи спрашивают латенты;
     это три средних блока общей схемы;
   • peract — путь данных целиком: 4 камеры RGB-D → сетка 100³ × 10 → 8000
     патчей и 77 слов → 2048 латентов → патчи спрашивают латенты → 100³ оценок
     и три малые головы после max-pool; под блоками — формы тензоров.
   Синим — патчи сцены, оранжевым — слова команды и оценки вокселей,
   фиолетовым — латенты, чёрной рамкой — выбранный или целевой воксель.
   У каждой схемы две раскладки: широкая и узкая для телефона.
   ===================================================================== */
'use strict';
(() => {
  const KINDS = ['xent', 'latents', 'peract'];
  if (typeof Anim === 'undefined') {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit;
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const fmtN = (n) => (n < 10000 ? String(Math.round(n)) : Math.round(n).toLocaleString('ru-RU'));   // 8077, но 10 000
  const fx = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');

  /* ---------- подписи ---------- */
  /** Фраза — в строки не шире maxW. */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const out = []; let cur = '';
    for (const w of String(text).split(' ')) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись в одну или несколько строк (массив, или перенос по словам при o.wrap), ужатая до maxW, но не мельче 10 px; y — середина блока. */
  function txt(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [String(text)];
    let px = o.px; K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(10, px * maxW / w);
    const lh = px * k * (o.lh || 1.3), y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => A.lab(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
    return lines.length;
  }

  /* ---------- общие блоки ---------- */
  /** Изометрический куб: центр, ребро; mode — 'empty' | 'fill' | 'patch' | 'heat'; pr — доля появления. */
  const VOX = [];                                     // занятые клетки 5×5×5: стол и комод с тремя ящиками
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) VOX.push([x, 0, z, 'table']);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 3; x++) VOX.push([x, y, 3, 'box']);
  function cube(c, k, cx, cy, a, P, A, mode, pr) {
    const { alpha, line } = A, cs = Math.cos(Math.PI / 6), sn = 0.5, n = 5, q = a / n;
    const pt = (x, y, z) => [cx + (x - z) * cs * q, cy + (x + z) * sn * q - y * q];   // клетки 0..5, центр куба в (2,5; 2,5; 2,5)
    const off = [2.5, 2.5, 2.5];
    const p = (x, y, z) => pt(x - off[0], y - off[1], z - off[2]);
    const poly = (pts, fill, stroke, lw) => { c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } };
    // задние грани
    poly([p(0, 0, 5), p(5, 0, 5), p(5, 5, 5), p(0, 5, 5)], alpha(P.out, 0.04), P.grid, 1);
    poly([p(0, 0, 0), p(0, 0, 5), p(0, 5, 5), p(0, 5, 0)], alpha(P.out, 0.03), P.grid, 1);
    poly([p(0, 0, 0), p(5, 0, 0), p(5, 0, 5), p(0, 0, 5)], alpha(P.out, 0.05), P.grid, 1);
    // клетки
    const cell = (x, y, z, col, edge) => {
      poly([p(x, y + 1, z), p(x + 1, y + 1, z), p(x + 1, y + 1, z + 1), p(x, y + 1, z + 1)], col, edge, 0.8);
      poly([p(x + 1, y, z), p(x + 1, y + 1, z), p(x + 1, y + 1, z + 1), p(x + 1, y, z + 1)], col, edge, 0.8);
      poly([p(x, y, z + 1), p(x + 1, y, z + 1), p(x + 1, y + 1, z + 1), p(x, y + 1, z + 1)], col, edge, 0.8);
    };
    const order = VOX.slice().sort((u, v) => (u[0] + u[2] - u[1] * 0.1) - (v[0] + v[2] - v[1] * 0.1));
    if (mode === 'heat') {
      const tgt = [1.5, 4, 2.2];                       // перед верхним ящиком
      const cells = [];
      for (let x = 0; x < 5; x++) for (let y = 1; y < 5; y++) for (let z = 0; z < 3; z++) { const d = Math.hypot(x - tgt[0], y - tgt[1], z - tgt[2]); cells.push([x, y, z, Math.exp(-d * d / 2.2)]); }
      order.forEach(([x, y, z, kind]) => cell(x, y, z, kind === 'table' ? alpha(P.ink3, 0.18) : alpha(P.ink3, 0.32), alpha(P.ink3, 0.5)));
      cells.sort((u, v) => (u[0] + u[2] - u[1] * 0.1) - (v[0] + v[2] - v[1] * 0.1)).forEach(([x, y, z, h]) => { if (h * pr > 0.12) cell(x, y, z, alpha(P.mot, 0.7 * h * pr), null); });
      if (pr > 0.6) { const b = [1, 4, 2]; poly([p(b[0], b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2] + 1), p(b[0], b[1] + 1, b[2] + 1)], null, P.ink, 2.2); poly([p(b[0] + 1, b[1], b[2]), p(b[0] + 1, b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2] + 1), p(b[0] + 1, b[1], b[2] + 1)], null, P.ink, 2.2); }
    } else if (mode !== 'empty') {
      const m = Math.floor(order.length * pr);
      order.slice(0, m).forEach(([x, y, z, kind]) => cell(x, y, z, kind === 'table' ? alpha(P.out, 0.28) : alpha(P.out, 0.5), alpha(P.out, 0.75)));
    }
    // передние рёбра
    const front = [[p(5, 0, 0), p(5, 5, 0)], [p(0, 0, 5), p(0, 5, 5)], [p(5, 0, 5), p(5, 5, 5)], [p(0, 5, 0), p(5, 5, 0)], [p(0, 5, 0), p(0, 5, 5)], [p(5, 5, 0), p(5, 5, 5)], [p(0, 5, 5), p(5, 5, 5)], [p(5, 0, 0), p(5, 0, 5)], [p(0, 0, 5), p(5, 0, 5)]];
    front.forEach(([u, v]) => line(c, [u, v], P.ink2, 1.4));
    if (mode === 'patch') {                           // границы патчей: куб режут на кубики 5 × 5 × 5 вокселей
      for (let i = 1; i < 5; i++) {
        line(c, [p(i, 5, 0), p(i, 5, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(0, 5, i), p(5, 5, i)], alpha(P.out, 0.8 * pr), 1.2);
        line(c, [p(5, i, 0), p(5, i, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(5, 0, i), p(5, 5, i)], alpha(P.out, 0.8 * pr), 1.2);
        line(c, [p(0, i, 5), p(5, i, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(i, 0, 5), p(i, 5, 5)], alpha(P.out, 0.8 * pr), 1.2);
      }
    }
  }
  /** Камеры вокруг стола и облако точек. */
  function scene(c, k, cx, cy, s, P, A, act) {
    const { rect, line, circle, alpha } = A;
    const top = [[cx - 34 * s, cy], [cx + 10 * s, cy - 20 * s], [cx + 44 * s, cy], [cx, cy + 20 * s]];
    c.beginPath(); top.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]))); c.closePath(); c.fillStyle = alpha(P.ink3, 0.15); c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.stroke();
    rect(c, cx - 6 * s, cy - 34 * s, 22 * s, 26 * s, 3, alpha(P.ink3, 0.18), P.ink3, 1.4);
    for (let i = 0; i < 3; i++) line(c, [[cx - 2 * s, cy - (29 - i * 8) * s], [cx + 12 * s, cy - (29 - i * 8) * s]], P.ink3, 1.2);
    const cams = [[cx - 48 * s, cy - 40 * s], [cx + 56 * s, cy - 40 * s], [cx - 50 * s, cy + 36 * s], [cx + 54 * s, cy + 36 * s]];
    cams.forEach(([x, y], i) => {
      if (act > 0) line(c, [[x, y], [cx + 4 * s, cy - 8 * s]], alpha(P.out, 0.35 * act), 1.2, [3, 3]);
      rect(c, x - 8 * s, y - 6 * s, 16 * s, 12 * s, 3, P.surf, act > 0 && (Math.floor(act * 8) + i) % 2 ? P.out : P.ink2, 1.6);
      circle(c, x, y, 3 * s, P.outS, P.out, 1.2);
    });
    for (let i = 0; i < 26; i++) { const x = cx - 26 * s + hash(i) * 62 * s, y = cy - 30 * s + hash(i + 50) * 42 * s; if (act * 26 > i) circle(c, x, y, 1.6 * s, alpha(P.out, 0.8)); }
  }
  /** Ряд или столбец токенов. kinds — массив 'p' (патч) | 'w' (слово) | 'l' (латент) | 'gap'. Возвращает центры. */
  function tokens(c, x, y, kinds, dir, sz, gap, P, A, pr, hi) {
    const { rect } = A, pos = [];
    let o = 0;
    kinds.forEach((kd, i) => {
      const cx = dir === 'v' ? x : x + o, cy = dir === 'v' ? y + o : y;
      if (kd === 'gap') { o += sz + gap; pos.push(null); return; }
      pos.push([cx, cy]);
      const vis = pr === undefined ? 1 : Math.max(0, Math.min(1, pr * kinds.length - i));
      if (vis > 0) {
        const col = kd === 'p' ? [P.outS, P.out] : kd === 'w' ? [P.motS, P.mot] : [P.sprS, P.spr];
        c.globalAlpha = vis; rect(c, cx - sz / 2, cy - sz / 2, sz, sz, 2.5, col[0], hi === i ? P.ink : col[1], hi === i ? 2 : 1.4); c.globalAlpha = 1;
      }
      o += sz + gap;
    });
    return pos;
  }
  /** Точки летят из одного набора в другой. */
  function flow(c, from, to, prog, n, color, A) {
    const { circle } = A, F = from.filter(Boolean), Tt = to.filter(Boolean);
    for (let i = 0; i < n; i++) {
      const a = F[Math.floor(hash(i) * F.length)], b = Tt[Math.floor(hash(i + 99) * Tt.length)], ph = ((prog * 2.2 + hash(i + 7)) % 1);
      if (prog <= 0 || prog >= 1) continue;
      circle(c, a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 2.2, color);
    }
  }
  function lines(c, from, to, alphaV, color, A) {
    const F = from.filter(Boolean), Tt = to.filter(Boolean);
    F.forEach((a, i) => Tt.forEach((b, j) => { if ((i + j) % 2) return; A.line(c, [a, b], A.alpha(color, alphaV), 0.8); }));
  }
  /** Дуги внимания между латентами (слой layer из 6); dir — направление ряда латентов. */
  function latentArcs(c, L, layer, ph, dir, P, A, faint) {
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      if ((i + j + layer) % 3) continue;
      const a = L[i], b = L[j], bend = dir === 'v' ? 18 + 4 * (j - i) : -(18 + 4 * (j - i));
      c.beginPath(); if (dir === 'v') { c.moveTo(a[0] + 8, a[1]); c.quadraticCurveTo(a[0] + 8 + bend, (a[1] + b[1]) / 2, b[0] + 8, b[1]); } else { c.moveTo(a[0], a[1] + 9); c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 9 - bend, b[0], b[1] + 9); }
      c.strokeStyle = A.alpha(P.spr, faint ? 0.18 : 0.25 + 0.5 * (1 - ph)); c.lineWidth = 1.4; c.stroke();
    }
  }
  /** Строка «что происходит» внизу схемы, с переносом по словам; y — середина первой строки. */
  function status(c, k, A, P, text, x, y, maxW) {
    const ls = wrap(c, k, text, maxW, 11.5, 700), lh = 11.5 * k * 1.35;
    txt(c, k, A, ls, x, y + (ls.length - 1) * lh / 2, maxW, { px: 11.5, weight: 700, color: P.ink, align: 'left', lh: 1.35 });
  }
  /** Пометка «какой блок общей схемы перед нами» в углу канваса. */
  const tag = (c, k, A, P, text, x, y, maxW, align) => txt(c, k, A, text, x, y, maxW, { px: 10, weight: 600, color: P.ink3, align: align || 'right' });

  /* =====================================================================
     xent — перекрёстная энтропия на срезе сетки 10 × 10
     ===================================================================== */
  const XN = 10, XTI = 3 * XN + 6, XSTEPS = 80, XT = 16;
  const XPH = { q: [0, 1.6], sm: [1.6, 3.2], tg: [3.2, 4.8], tr: [4.8, 12.8], hold: [12.8, XT] };
  /** Оценки по шагам градиентного спуска по перекрёстной энтропии: ∂L/∂Q = p − onehot; шаг 0,2. */
  const XF = (() => {
    const q = new Float64Array(XN * XN), frames = [];
    for (let j = 0; j < XN; j++) for (let i = 0; i < XN; i++) {   // до обучения: два случайных бугра не там, где цель
      const d1 = Math.hypot(i - 2.5, j - 6.5), d2 = Math.hypot(i - 7, j - 7);
      q[j * XN + i] = 1.8 * Math.exp(-d1 * d1 / 3) + 1.2 * Math.exp(-d2 * d2 / 2) + (hash(j * XN + i) - 0.5) * 0.8;
    }
    for (let s = 0; s <= XSTEPS; s++) {
      let mx = -1e9; for (const v of q) mx = Math.max(mx, v);
      const e = Array.from(q, (v) => Math.exp(v - mx)), Z = e.reduce((a, b) => a + b, 0), p = e.map((v) => v / Z);
      frames.push({ q: Float64Array.from(q), p, pt: p[XTI], loss: -Math.log(p[XTI]) });
      for (let i = 0; i < q.length; i++) q[i] -= 0.2 * (p[i] - (i === XTI ? 1 : 0));
    }
    return frames;
  })();
  const XLOSS0 = XF[0].loss;
  /** Сетка 10 × 10: заливка оранжевым по значению, чёрная рамка — целевой воксель; pr — доля появившихся клеток. */
  function heat(c, A, P, x, y, size, vals, lo, hi, tgt, pr) {
    const cs = size / XN;
    for (let j = 0; j < XN; j++) for (let i = 0; i < XN; i++) {
      const idx = j * XN + i, vis = pr === undefined ? 1 : Math.max(0, Math.min(1, pr * (XN * XN + 12) - idx));
      if (vis <= 0) continue;
      const a = 0.08 + 0.86 * Math.max(0, Math.min(1, (vals[idx] - lo) / Math.max(1e-9, hi - lo)));
      A.rect(c, x + i * cs + 0.6, y + j * cs + 0.6, cs - 1.2, cs - 1.2, 1.5, A.alpha(P.mot, a * vis), null);
    }
    c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(x, y, size, size);
    if (tgt > 0) { const i = XTI % XN, j = Math.floor(XTI / XN); c.globalAlpha = tgt; c.strokeStyle = P.ink; c.lineWidth = 2.2; c.strokeRect(x + i * cs - 0.5, y + j * cs - 0.5, cs + 1, cs + 1); c.globalAlpha = 1; }
  }
  function drawXent(c, k, t, P, A, G) {
    const { seg, ease, arrow, alpha } = A, u = ((t % XT) + XT) % XT;
    const pQ = seg(u, ...XPH.q), pS = seg(u, ...XPH.sm), pT = ease(seg(u, ...XPH.tg)), pR = seg(u, ...XPH.tr);
    const step = Math.round(pR * XSTEPS), F = XF[step];
    let lo = Infinity, hi = -Infinity; for (const v of F.q) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    let pm = 0; for (const v of F.p) pm = Math.max(pm, v);
    tag(c, k, A, P, G.tag[2], G.tag[0], G.tag[1], G.tag[3], G.tag[4]);
    // оценки Q
    const [qx, qy, qs] = G.q;
    txt(c, k, A, 'оценки Q', qx + qs / 2, G.qLab, qs, { px: 11.5, weight: 750, color: P.ink });
    heat(c, A, P, qx, qy, qs, F.q, lo, hi, pT, pQ);
    txt(c, k, A, G.qSub, qx + qs / 2, G.qSubY, qs + 16, { px: 10, color: P.ink3, wrap: true });
    // softmax → вероятности
    const [px, py, ps] = G.p;
    txt(c, k, A, G.pLab, px + ps / 2, G.qLab, ps + 10, { px: 11.5, weight: 750, color: pS > 0 ? P.ink : P.ink3 });
    arrow(c, ...G.arrow, pS > 0 ? P.ink2 : P.line, 1.8, 7);
    if (G.arrowLab) txt(c, k, A, 'softmax', G.arrowLab[0], G.arrowLab[1], 60, { px: 10.5, weight: 700, color: pS > 0 ? P.mot : P.ink3 });
    if (pS > 0) {
      heat(c, A, P, px, py, ps, F.p, 0, pm, pT, pS);
      // шкала «в сумме 1»: доля цели и всех остальных
      const [bx, by, bw, bh] = G.bar, w1 = Math.max(1.5, F.pt * bw);
      c.fillStyle = alpha(P.ink3, 0.22); c.fillRect(bx, by, bw, bh);
      c.fillStyle = P.mot; c.fillRect(bx, by, w1, bh);
      c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(bx, by, bw, bh);
      txt(c, k, A, `цель ${fx(F.pt, 2)}`, bx, G.barY, bw * 0.5, { px: 10, weight: 700, color: P.mot, align: 'left' });
      txt(c, k, A, `остальные ${fx(1 - F.pt, 2)}`, bx + bw, G.barY, bw * 0.5, { px: 10, color: P.ink3, align: 'right' });
      txt(c, k, A, 'в сумме 1', bx + bw / 2, G.barY + 13, bw, { px: 10, color: P.ink3 });
    } else {
      c.strokeStyle = P.grid; c.lineWidth = 1; c.setLineDash([4, 4]); c.strokeRect(px, py, ps, ps); c.setLineDash([]);
    }
    // цель, вероятность, потеря
    const R = G.r;
    if (pT > 0) {
      c.globalAlpha = pT;
      c.strokeStyle = P.ink; c.lineWidth = 2; c.strokeRect(R.x + 1, R.y0 - 5, 10, 10);
      txt(c, k, A, R.tLines, R.x + 18, R.y0 + (R.tLines.length - 1) * 6.5, R.w - 18, { px: 10.5, color: P.ink2, align: 'left' });
      txt(c, k, A, `p(цель) = ${fx(F.pt, 2)}`, R.x, R.y1, R.w, { px: 12.5, weight: 750, mono: true, color: P.mot, align: 'left' });
      txt(c, k, A, `потеря = −log p(цель) = ${fx(F.loss, 1)}`, R.x, R.y2, R.w, { px: 12, weight: 750, mono: true, color: P.ink, align: 'left' });
      c.globalAlpha = 1;
    }
    // график потери по шагам обучения
    const [gx, gy, gw, gh] = G.plot, X = (s) => gx + gw * s / XSTEPS, Y = (l) => gy + gh * (1 - l / (XLOSS0 * 1.08));
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy + gh); c.lineTo(gx + gw, gy + gh); c.stroke();
    c.setLineDash([3, 3]); c.beginPath(); c.moveTo(gx, Y(XLOSS0)); c.lineTo(gx + gw, Y(XLOSS0)); c.stroke(); c.setLineDash([]);
    txt(c, k, A, 'потеря', gx + 4, gy + 8, 60, { px: 10, color: P.ink3, align: 'left' });
    txt(c, k, A, fx(XLOSS0, 1), gx + gw - 2, Y(XLOSS0) - 8, 40, { px: 10, mono: true, color: P.ink3, align: 'right' });
    txt(c, k, A, '0', gx - 4, gy + gh, 20, { px: 10, mono: true, color: P.ink3, align: 'right' });
    txt(c, k, A, pR > 0 ? `шаг обучения ${step} из ${XSTEPS}` : 'шаг обучения', gx + gw / 2, gy + gh + 12, gw, { px: 10.5, weight: 650, color: pR > 0 && pR < 1 ? P.ink : P.ink3 });
    if (pR > 0) {
      c.beginPath(); for (let s = 0; s <= step; s++) { const x = X(s), y = Y(XF[s].loss); if (s) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = P.ink; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      A.circle(c, X(step), Y(F.loss), 4, P.mot, P.surf, 1.5);
    }
    // что происходит
    const st = u < XPH.sm[0] ? 'Сеть выдаёт оценку Q каждому вокселю: чем выше оценка, тем лучше поставить сюда центр захвата'
      : u < XPH.tg[0] ? 'Softmax превращает оценки в вероятности: каждая положительна, а в сумме они дают 1'
      : u < XPH.tr[0] ? 'Перекрёстная энтропия смотрит только на целевой воксель: потеря равна −log p(цель)'
      : u < XPH.hold[0] ? `Шаг обучения ${step} из ${XSTEPS}: оценка цели растёт, оценки остальных вокселей падают, потеря уменьшается`
      : 'После обучения почти вся вероятность у целевого вокселя, и потеря близка к нулю';
    status(c, k, A, P, st, G.state[0], G.state[1], G.state[2]);
  }
  Anim.add('xent', {
    W: 720, H: 330, start: 4.0, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawXent(c, k, t, P, A, {
        tag: [706, 16, 'блок «Оценка вокселей» общей схемы', 300, 'right'],
        q: [22, 52, 170], qLab: 38, qSub: 'срез сетки: 10 × 10 вокселей', qSubY: 236, pLab: 'вероятности p',
        arrow: [200, 137, 248, 137], arrowLab: [224, 124],
        p: [258, 52, 170], bar: [258, 232, 170, 10], barY: 253,
        r: { x: 452, y0: 48, w: 254, tLines: ['цель: воксель, где захват был', 'в следующей ключевой позе'], y1: 88, y2: 110 },
        plot: [456, 128, 246, 84], state: [14, 302, 692],
      });
    },
    narrow: {
      W: 360, H: 528,
      draw(c, k, t, P, A) {
        drawXent(c, k, t, P, A, {
          tag: [14, 14, 'блок «Оценка вокселей» общей схемы', 332, 'left'],
          q: [14, 48, 150], qLab: 34, qSub: 'срез: 10 × 10 вокселей', qSubY: 212, pLab: 'p = softmax(Q)',
          arrow: [170, 123, 190, 123], arrowLab: null,
          p: [196, 48, 150], bar: [196, 206, 150, 9], barY: 226,
          r: { x: 14, y0: 262, w: 332, tLines: ['цель: воксель, где захват был', 'в следующей ключевой позе'], y1: 300, y2: 322 },
          plot: [34, 342, 312, 84], state: [14, 476, 332],
        });
      },
    },
  });

  /* =====================================================================
     latents — таблица N × N и Perceiver: латенты читают вход, слои между
     латентами, патчи спрашивают латенты
     ===================================================================== */
  const LT = 19, LPH = { grow: [0, 2.6], big: [2.6, 4.2], read: [4.2, 8.2], self: [8.2, 12.2], ask: [12.2, 15.6], sum: [15.6, LT] };
  const NTOK = 8077, NLAT = 2048;
  const L_IN = ['w', 'w', 'w', 'gap', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const L_OUT = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const L_LAT = ['l', 'l', 'l', 'l', 'l', 'l'];
  function drawLatents(c, k, t, P, A, G) {
    const { seg, ease, alpha } = A, u = ((t % LT) + LT) % LT;
    const pG = ease(seg(u, ...LPH.grow)), pB = seg(u, ...LPH.big), pR = seg(u, ...LPH.read), pS = seg(u, ...LPH.self), pA = seg(u, ...LPH.ask), pSum = seg(u, ...LPH.sum);
    const n = G.narrow;
    tag(c, k, A, P, G.tag[2], G.tag[0], G.tag[1], G.tag[3], G.tag[4]);
    /* ---- слева: внимание всех ко всем ---- */
    const Lp = G.left, N = Math.round(10 + 90 * pG);
    txt(c, k, A, 'Внимание всех ко всем', Lp.title[0], Lp.title[1], Lp.w, { px: 11.5, weight: 750, color: P.ink, align: 'left' });
    // ряд токенов
    const [rx, ry, rw] = Lp.row, g = N > 30 ? 1 : 2, sz = Math.min(12, (rw - (N - 1) * g) / N), tot = N * sz + (N - 1) * g, x0 = rx + (rw - tot) / 2;
    for (let i = 0; i < N; i++) A.rect(c, x0 + i * (sz + g), ry - sz / 2, sz, Math.max(sz, 4), Math.min(2.5, sz / 3), P.outS, P.out, sz > 3 ? 1.2 : 0.8);
    txt(c, k, A, pB > 0 ? `${fmtN(NTOK)} токенов` : `${N} токенов`, rx + rw / 2, ry + Lp.rowLab, rw, { px: 10.5, color: P.ink2 });
    // таблица оценок N × N
    const [tx, ty, scale] = Lp.tab, side = N * scale;
    A.rect(c, tx, ty, side, side, 3, alpha(P.out, 0.12), P.out, 1.2);
    if (N <= 24) for (let i = 1; i < N; i++) { A.line(c, [[tx + i * scale, ty], [tx + i * scale, ty + side]], alpha(P.out, 0.5), 0.6); A.line(c, [[tx, ty + i * scale], [tx + side, ty + i * scale]], alpha(P.out, 0.5), 0.6); }
    else for (let i = 10; i < N; i += 10) { A.line(c, [[tx + i * scale, ty], [tx + i * scale, ty + side]], alpha(P.out, 0.35), 0.6); A.line(c, [[tx, ty + i * scale], [tx + side, ty + i * scale]], alpha(P.out, 0.35), 0.6); }
    if (pB > 0) {                                    // 8077 токенов: таблица не помещается
      const big = Lp.big, a = Math.min(1, pB * 2);
      c.globalAlpha = a; c.setLineDash([6, 5]); c.strokeStyle = P.bad; c.lineWidth = 1.6; c.strokeRect(tx, ty, big, big); c.setLineDash([]); c.globalAlpha = 1;
      txt(c, k, A, Lp.bigLines, Lp.bigLab[0], Lp.bigLab[1], Lp.bigLab[2], { px: 10.5, weight: 700, color: P.bad, align: Lp.bigLab[3], lh: 1.35 });
    } else {
      txt(c, k, A, `${N} × ${N} = ${fmtN(N * N)} оценок`, Lp.cnt[0], Lp.cnt[1], Lp.cnt[2], { px: 10.5, weight: 700, color: P.ink, align: Lp.cnt[3] });
    }
    if (pB === 0) txt(c, k, A, Lp.cntSub, Lp.cnt[0], Lp.cnt[1] + 14, Lp.cnt[2], { px: 10, color: P.ink3, align: Lp.cnt[3] });
    /* ---- справа: Perceiver ---- */
    const R = G.right, on = u >= LPH.read[0];
    txt(c, k, A, 'Perceiver: латенты между входом и выходом', R.title[0], R.title[1], R.w, { px: 11.5, weight: 750, color: on ? P.ink : P.ink3, align: 'left', wrap: true });
    const tin = tokens(c, R.inX, R.inY, L_IN, 'h', R.sz, R.gap, P, A, undefined);
    const lat = tokens(c, R.latX, R.latY, L_LAT, 'h', R.sz + 2, R.gap + 4, P, A, undefined);
    const tout = tokens(c, R.outX, R.outY, L_OUT, 'h', R.sz, R.gap, P, A, undefined);
    const lx = R.lab, lw = R.labW;
    txt(c, k, A, n ? ['вход: 8077 токенов', '8000 патчей + 77 слов, × 128'] : ['вход: 8000 патчей + 77 слов', '8077 токенов × 128 чисел'], lx, R.inLab, lw, { px: 10.5, color: P.ink2, align: 'left', lh: 1.3 });
    txt(c, k, A, '2048 латентов × 512', lx, R.latLab, lw, { px: 10.5, color: P.spr, weight: 700, align: 'left' });
    txt(c, k, A, n ? ['патчи с ответом', '8000 × 128'] : ['патчи с ответом латентов', '8000 × 128 чисел'], lx, R.outLab, lw, { px: 10.5, color: P.ink2, align: 'left', lh: 1.3 });
    // связи
    const Lc = lat.filter(Boolean);
    if (pR > 0) { lines(c, tin, lat, pR < 1 ? 0.3 : 0.12, P.spr, A); flow(c, tin, lat, pR, 26, P.spr, A); }
    if (pS > 0) { const layer = Math.min(6, Math.floor(pS * 6) + 1); latentArcs(c, Lc, layer, (pS * 6) % 1, 'h', P, A, pS >= 1); }
    if (pA > 0) { lines(c, lat, tout, pA < 1 ? 0.3 : 0.12, P.out, A); flow(c, lat, tout, pA, 22, P.out, A); }
    // подписи текущего приёма
    const ph = (linesArr, col, y) => linesArr.forEach((s, i) => txt(c, k, A, s, lx, y + i * 14, lw, { px: 10.5, weight: i ? 600 : 750, color: i ? P.ink2 : col, align: 'left' }));
    if (pR > 0 && pR < 1) ph(['латенты читают вход', 'запросы — латенты', 'ключи и значения — токены', 'таблица 2048 × 8077 = 16,5 млн'], P.spr, R.yRead);
    else if (pS > 0 && pS < 1) ph(['внимание между латентами', `слой ${Math.min(6, Math.floor(pS * 6) + 1)} из 6`, 'таблица 2048 × 2048 = 4,2 млн', 'от числа токенов не зависит'], P.spr, R.yTop);
    else if (pA > 0 && pA < 1) ph(['патчи спрашивают латенты', 'запросы — патчи', 'ключи и значения — латенты', 'таблица 8077 × 2048 = 16,5 млн'], P.out, R.yTop);
    else if (pSum > 0) ph(['оценок за 6 слоёв', 'Perceiver: 58 млн', 'все со всеми: 391 млн', 'вдвое больше токенов: ×1,6 и ×4'], P.ink, R.yTop);
    // что происходит
    const st = u < LPH.big[0] ? `Внимание всех ко всем: у ${N} токенов таблица оценок ${N} × ${N}, число оценок растёт как квадрат числа токенов`
      : u < LPH.read[0] ? 'У PerAct 8077 токенов: 65 млн оценок на каждый слой, такая таблица не помещается в память видеокарты'
      : u < LPH.self[0] ? 'Латенты читают вход кросс-вниманием: запросы дают латенты, ключи и значения — все 8077 токенов'
      : u < LPH.ask[0] ? 'Шесть слоёв внимания идут только между латентами: таблица 2048 × 2048 на слой, от длины входа она не зависит'
      : u < LPH.sum[0] ? 'Патчи спрашивают латенты: каждый патч получает признак, собранный по всей сцене'
      : 'Удвоим число токенов: у внимания всех ко всем оценок станет в 4 раза больше, у Perceiver — в 1,6: рост линейный';
    status(c, k, A, P, st, G.state[0], G.state[1], G.state[2]);
  }
  Anim.add('latents', {
    W: 720, H: 364, start: 5.6, narrowAt: 620,
    draw(c, k, t, P, A) {
      drawLatents(c, k, t, P, A, {
        narrow: false, tag: [706, 16, 'три средних блока общей схемы', 220, 'right'],
        left: { title: [14, 36], w: 290, row: [14, 58, 280], rowLab: 15, tab: [14, 92, 1.6], big: 200, cnt: [182, 100, 130, 'left'], cntSub: 'по оценке на пару',
          bigLines: ['8077 × 8077 =', '65 млн оценок', 'на каждый слой:', 'в память видеокарты', 'не помещается'], bigLab: [224, 130, 108, 'left'] },
        right: { title: [336, 36], w: 370, sz: 12, gap: 3, inX: 338, inY: 292, latX: 374, latY: 184, outX: 360, outY: 82, lab: 550, labW: 156,
          inLab: 296, latLab: 206, outLab: 72, yRead: 236, yTop: 104 },
        state: [14, 330, 692],
      });
    },
    narrow: {
      W: 360, H: 612,
      draw(c, k, t, P, A) {
        drawLatents(c, k, t, P, A, {
          narrow: true, tag: [14, 14, 'три средних блока общей схемы', 332, 'left'],
          left: { title: [14, 34], w: 332, row: [14, 54, 332], rowLab: 14, tab: [14, 86, 1.5], big: 170, cnt: [176, 96, 170, 'left'], cntSub: 'по оценке на пару',
            bigLines: ['8077 × 8077 = 65 млн', 'оценок на каждый слой:', 'в память видеокарты', 'не помещается'], bigLab: [196, 116, 150, 'left'] },
          right: { title: [14, 284], w: 332, sz: 11, gap: 3, inX: 22, inY: 498, latX: 44, latY: 406, outX: 40, outY: 314, lab: 214, labW: 132,
            inLab: 518, latLab: 426, outLab: 342, yRead: 440, yTop: 362 },
          state: [14, 556, 332],
        });
      },
    },
  });

  /* =====================================================================
     peract — путь данных целиком
     ===================================================================== */
  const T = 13;                                     // секунд на полный проход
  const PH = [[0, 1.5], [1.5, 3.2], [3.2, 4.9], [4.9, 6.6], [6.6, 8.6], [8.6, 10.2], [10.2, 11.8]];
  // подписи столбцов схемы; этапы 4 и 5 идут в одном столбце — латентов
  const COLS = ['Камеры', 'Сетка вокселей', 'Патчи и слова', 'Латенты', 'Патчи спрашивают латенты', 'Оценка вокселей'];
  const COL_OF = [0, 1, 2, 3, 3, 4, 5];
  const PATCHES = ['w', 'w', 'w', 'gap', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const PATCH_ONLY = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const LAT = ['l', 'l', 'l', 'l', 'l', 'l'];
  const HEADS = ['перенос: лучший воксель', 'max-pool → 64 числа', 'поворот: 3 × 72', 'захват: 2', 'столкновения: 2'];

  function drawFlow(c, k, t, P, A, G) {
    const { lab, arrow, seg } = A, u = ((t % T) + T) % T;
    const pr = PH.map(([a, b]) => seg(u, a, b)), cur = PH.findIndex(([a, b]) => u >= a && u < b);
    // подписи этапов: название (длинное — в две строки), сколько элементов, форма тензора
    const curCol = cur === -1 ? 5 : COL_OF[cur];
    G.caps.forEach(([x, y, cnt, shapes, maxW], i) => {
      const on = i === curCol, started = COL_OF.some((cc, st) => cc === i && pr[st] > 0);
      const name = i === 3 && cur === 3 ? 'Латенты читают вход' : i === 3 && cur === 4 ? 'Шесть слоёв внимания' : COLS[i];
      let yy = y;
      wrap(c, k, name, maxW, 11, 700).forEach((ln) => { txt(c, k, A, ln, x, yy, maxW, { px: 11, weight: 700, color: on ? P.ink : started ? P.ink2 : P.ink3, halo: true, haloColor: P.surf2 }); yy += 13 * k; });
      txt(c, k, A, cnt, x, yy + 2 * k, maxW, { px: 10.5, color: on ? P.out : P.ink3, halo: true, haloColor: P.surf2 }); yy += 16 * k;
      (shapes || []).forEach((ln) => { txt(c, k, A, ln, x, yy, maxW, { px: 10, mono: true, color: on ? P.ink2 : P.ink3, halo: true, haloColor: P.surf2 }); yy += 13 * k; });
    });
    const AR = [0, 1, 2, 3, 5, 6];                    // стрелка ведёт к столбцу, этап которого её зажигает
    G.arrows.forEach(([x1, y1, x2, y2], i) => arrow(c, x1, y1, x2, y2, pr[AR[i]] > 0 ? P.ink2 : P.line, 1.8, 6));
    // 1. камеры
    scene(c, k, G.s1[0], G.s1[1], G.s1[2], P, A, pr[0]);
    // 2. воксели
    if (pr[1] > 0) cube(c, k, G.s2[0], G.s2[1], G.s2[2], P, A, pr[2] > 0 ? 'patch' : 'fill', pr[2] > 0 ? 1 : pr[1]);
    if (pr[2] > 0 && pr[2] < 1) cube(c, k, G.s2[0], G.s2[1], G.s2[2], P, A, 'patch', pr[2]);
    // 3. патчи и слова
    const tk = tokens(c, G.s3[0], G.s3[1], PATCHES, G.dir, G.sz, G.gap, P, A, pr[2]);
    if (pr[2] > 0) lab(c, k, '«открой верхний ящик»', G.cmd[0], G.cmd[1], { px: 10.5, color: P.mot, weight: 700, haloColor: P.surf2 });
    // 4. латенты: читают патчи и слова
    const lt = tokens(c, G.s4[0], G.s4[1], LAT, G.dir, G.sz + 2, G.gap + 4, P, A, pr[3] > 0 ? 1 : 0);
    if (pr[3] > 0 && pr[3] < 1) { lines(c, tk, lt, 0.25, P.spr, A); flow(c, tk, lt, pr[3], 26, P.spr, A); }
    // 5. шесть слоёв внимания между латентами
    if (pr[4] > 0) {
      const layer = Math.min(6, Math.floor(pr[4] * 6) + 1);
      latentArcs(c, lt.filter(Boolean), layer, (pr[4] * 6) % 1, G.dir, P, A, pr[4] >= 1);
      if (pr[4] < 1) lab(c, k, `слой ${layer} из 6`, G.lay[0], G.lay[1], { px: 10.5, color: P.spr, weight: 700, haloColor: P.surf2 });
    }
    // 6. патчи спрашивают латенты
    const pb = tokens(c, G.s5[0], G.s5[1], PATCH_ONLY, G.dir, G.sz, G.gap, P, A, pr[5] > 0 ? Math.min(1, pr[5] * 1.5) : 0);
    if (pr[5] > 0 && pr[5] < 1) { lines(c, lt, pb, 0.25, P.out, A); flow(c, lt, pb, pr[5], 22, P.out, A); }
    // 7. оценка каждого вокселя и малые головы после max-pool
    if (pr[6] > 0) cube(c, k, G.s6[0], G.s6[1], G.s6[2], P, A, 'heat', pr[6]);
    const hv = pr[6] > 0.35;
    G.heads.forEach(([x, y, maxW, align], i) => txt(c, k, A, HEADS[i], x, y, maxW, { px: 10, weight: i === 0 ? 700 : 600, color: hv ? (i === 0 ? P.ink : P.ink2) : P.ink3, align: align || 'center', halo: true, haloColor: P.surf2 }));
  }

  Anim.add('peract', {
    W: 720, H: 358, start: 5.6, narrowAt: 640,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        dir: 'v', sz: 10, gap: 3,
        caps: [[58, 270, '4 камеры RGB-D', ['облака точек'], 108], [172, 270, '100³ вокселей', ['100³ × 10'], 112], [294, 270, '8000 + 77 токенов', ['8077 × 128'], 122], [418, 270, '2048 латентов', ['2048 × 512'], 116], [536, 270, '8000 патчей', ['8000 × 128', '→ 100³ × 64'], 128], [648, 270, '100³ оценок', ['100³ × 1'], 110]],
        arrows: [[112, 150, 130, 150], [214, 150, 268, 150], [318, 150, 394, 150], [444, 150, 512, 150], [560, 150, 604, 150]],
        s1: [58, 150, 0.95], s2: [172, 156, 44], s3: [294, 62], s4: [418, 104], s5: [536, 88], s6: [648, 140, 42],
        cmd: [294, 44], lay: [418, 84], heads: [[648, 200, 124], [648, 214, 124], [648, 228, 124], [648, 242, 124], [648, 256, 124]],
      });
    },
    narrow: {
      W: 360, H: 744,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          dir: 'h', sz: 12, gap: 4,
          caps: [[262, 50, '4 камеры RGB-D', ['облака точек'], 150], [262, 170, '100³ вокселей', ['100³ × 10'], 150], [180, 298, '8000 + 77 токенов', ['8077 × 128'], 300], [180, 432, '2048 латентов', ['2048 × 512'], 300], [180, 524, '8000 патчей', ['8000 × 128', '→ 100³ × 64'], 300], [262, 620, '100³ оценок', ['100³ × 1'], 150]],
          arrows: [[96, 114, 96, 132], [96, 232, 96, 254], [180, 340, 180, 356], [180, 474, 180, 490], [180, 580, 180, 598]],
          s1: [96, 64, 0.8], s2: [96, 182, 40], s3: [44, 274], s4: [121, 364], s5: [106, 500], s6: [96, 652, 40],
          cmd: [100, 256], lay: [64, 364], heads: [[262, 672, 150], [262, 686, 150], [262, 700, 150], [262, 714, 150], [262, 728, 150]],
        });
      },
    },
  });
})();
