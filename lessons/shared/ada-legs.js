/* =====================================================================
   ada-legs.js — Ада с ногами для уроков части 6 (6.1–6.3): общий рисунок.
   Ада — домашний гуманоид курса; с урока 6.1 у неё ноги вместо колёсной
   платформы. Рисунок тот же, что у Ады с колёсной базой (тёплый белый корпус,
   экран-лицо с оранжевыми глазами, графитовые суставы, фиолетовая метка).
   Длины звеньев — как у тела Ады в уроке 6.1 (L61.BODY): корпус 0,46 м,
   бедро и голень по 0,30 м, стопа 0,18 м с голеностопом на 5 см над подошвой
   и на 3 см ближе к пятке, голова высотой 0,15 м над корпусом.
   AdaBody.side(c, X, Y, f, o) — вид сбоку (смотрит вправо) по кадру
   f = [x, y, наклон, 6 углов суставов, vx], как L61.snap: x, y — центр
   корпуса (м), наклон — против часовой стрелки (+ — назад), углы — бедро,
   колено, голеностоп дальней от зрителя ноги, потом ближней; X/Y — метры →
   пиксели. Параметры o: color — контур корпуса и ближней ноги; ghost —
   полупрозрачно; arms — углы рук [плечо, локоть дальней, плечо, локоть
   ближней] относительно корпуса (вперёд +), без них руки качаются в
   противофазе ногам; body — другие длины звеньев (L1, L2); badJoints —
   номера суставов 0…5 с красным кольцом; badFeet — [дальняя, ближняя]:
   красная стопа. AdaBody.front(c, x, yb, s, P, dark) — вид спереди (x —
   центр, yb — низ стоп, s — масштаб, рост 116·s). Зависит только от HeroKit.
   ===================================================================== */
'use strict';
const AdaBody = (() => {
  const BODY = { LT: 0.46, L1: 0.30, L2: 0.30, LF: 0.18, HF: 0.05, FA: -0.03, HEAD: 0.15 };
  const colors = () => { const d = HeroKit.dark(); return { fill: d ? '#2a2926' : '#f4efe6', line: d ? '#b0afa6' : '#3d3c38', far: d ? '#3a3935' : '#e4ded2', farLine: d ? '#8a8980' : '#6f6d66', screen: '#1f2430', eye: '#eb6834', belt: '#4a3aa7' }; };
  const sc = (a) => [Math.sin(a), Math.cos(a)];
  /** Цвет с прозрачностью (hex или rgb из CSS-переменной), как Anim.kit.alpha. */
  const alpha = (col, a) => { const t = String(col).trim(); let m = /^#([0-9a-f]{6})$/i.exec(t); if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; } m = /^rgba?\(([^)]+)\)$/.exec(t); if (m) { const q = m[1].split(',').map((x) => x.trim()); return `rgba(${q[0]},${q[1]},${q[2]},${a})`; } return t; };
  /** Точки тела (метры) по кадру: бедро, колени, голеностопы, пятки и носки, верх корпуса, голова. body — другие длины звеньев. */
  function points(f, body) {
    const B = body ? Object.assign({}, BODY, body) : BODY;
    const [x, y, p] = f, s = sc(p), hip = [x + s[0] * B.LT / 2, y - s[1] * B.LT / 2], top = [x - s[0] * B.LT / 2, y + s[1] * B.LT / 2];
    const leg = (k) => {
      const aT = p + f[3 + k * 3], aS = aT - f[4 + k * 3], aF = aS + f[5 + k * 3], st = sc(aT), ss = sc(aS), sf = sc(aF);
      const knee = [hip[0] + st[0] * B.L1, hip[1] - st[1] * B.L1], ankle = [knee[0] + ss[0] * B.L2, knee[1] - ss[1] * B.L2];
      const ctr = [ankle[0] - (sf[1] * B.FA - sf[0] * B.HF / 2), ankle[1] - (sf[0] * B.FA + sf[1] * B.HF / 2)];
      const pt = (lx, ly) => [ctr[0] + sf[1] * lx - sf[0] * ly, ctr[1] + sf[0] * lx + sf[1] * ly];
      return { knee, ankle, heel: pt(-B.LF / 2, -B.HF / 2), toe: pt(B.LF / 2, -B.HF / 2), heelT: pt(-B.LF / 2 + 0.01, B.HF / 2), toeT: pt(B.LF / 2 - 0.02, B.HF / 2), aT, aS, aF };
    };
    return { hip, top, torso: [x, y, p], L: leg(0), R: leg(1), head: [x - s[0] * (B.LT / 2 + B.HEAD / 2 + 0.02), y + s[1] * (B.LT / 2 + B.HEAD / 2 + 0.02)] };
  }
  function capsule(c, X, Y, a, b, wPx, fill, line) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = line; c.lineWidth = wPx + 3; c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke();
    c.strokeStyle = fill; c.lineWidth = wPx; c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke();
  }
  function foot(c, X, Y, L, fill, line) {
    c.beginPath(); c.moveTo(X(L.heel[0]), Y(L.heel[1])); c.lineTo(X(L.toe[0]), Y(L.toe[1])); c.lineTo(X(L.toeT[0]), Y(L.toeT[1])); c.lineTo(X(L.heelT[0]), Y(L.heelT[1])); c.closePath();
    c.fillStyle = fill; c.fill(); c.strokeStyle = line; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  }
  /** Ада сбоку, смотрит вправо. Дальняя нога и рука — приглушённые, ближние — поверх корпуса. */
  function side(c, X, Y, f, o) {
    o = o || {}; const K = colors(), P = points(f, o.body), m = X(1) - X(0);           // m — пикселей в метре
    const wT = 0.085 * m, wS = 0.07 * m, jr = Math.max(2.5, 0.028 * m), col = o.color || K.line;
    const bad = o.badJoints ? new Set(o.badJoints) : null, badF = o.badFeet || null, red = bad || badF ? HeroKit.css('--critical') : null;
    c.save(); if (o.ghost) c.globalAlpha = 0.35;
    const legDraw = (L, fill, line, k) => {
      capsule(c, X, Y, P.hip, L.knee, wT, fill, line); capsule(c, X, Y, L.knee, L.ankle, wS, fill, line);
      if (badF && badF[k]) foot(c, X, Y, L, alpha(red, 0.4), red); else foot(c, X, Y, L, fill, line);
      for (const p of [L.knee, L.ankle]) { c.beginPath(); c.arc(X(p[0]), Y(p[1]), jr, 0, 7); c.fillStyle = line; c.fill(); }
    };
    // руки: углы из o.arms (плечо и локоть относительно корпуса, вперёд +) или качание противоположно ногам (−0,35·угол бедра)
    const [tx, ty, p] = P.torso, s = sc(p), sh = [tx - s[0] * BODY.LT * 0.3, ty + s[1] * BODY.LT * 0.3];
    const armDraw = (hipQ, fill, line, k) => {
      const a = o.arms ? p + o.arms[2 * k] : p - 0.35 * hipQ - 0.1, sa = sc(a), el = [sh[0] + sa[0] * 0.2, sh[1] - sa[1] * 0.2], a2 = o.arms ? a + o.arms[2 * k + 1] : a + 0.35, s2 = sc(a2), hd = [el[0] + s2[0] * 0.17, el[1] - s2[1] * 0.17];
      capsule(c, X, Y, sh, el, 0.055 * m, fill, line); capsule(c, X, Y, el, hd, 0.05 * m, fill, line); c.beginPath(); c.arc(X(hd[0]), Y(hd[1]), 0.03 * m, 0, 7); c.fillStyle = line; c.fill();
    };
    legDraw(P.L, K.far, K.farLine, 0); armDraw(f[3], K.far, K.farLine, 0);
    // корпус: скруглённый прямоугольник, повёрнутый на наклон
    c.save(); c.translate(X(tx), Y(ty)); c.rotate(-p);
    c.beginPath(); c.roundRect(-0.11 * m, -BODY.LT / 2 * m, 0.22 * m, BODY.LT * m, 0.07 * m); c.fillStyle = K.fill; c.fill(); c.strokeStyle = col; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.roundRect(-0.045 * m, -0.02 * m, 0.09 * m, 0.03 * m, 0.012 * m); c.fillStyle = K.belt; c.fill();
    // голова с экраном и глазом (вид сбоку — один глаз)
    const hy = -(BODY.LT / 2 + BODY.HEAD / 2 + 0.02) * m;
    c.beginPath(); c.roundRect(-0.1 * m, hy - BODY.HEAD / 2 * m, 0.2 * m, BODY.HEAD * m, 0.06 * m); c.fillStyle = K.fill; c.fill(); c.strokeStyle = col; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.roundRect(0.0 * m, hy - 0.055 * m, 0.085 * m, 0.11 * m, 0.03 * m); c.fillStyle = K.screen; c.fill();
    c.fillStyle = K.eye; c.beginPath(); c.ellipse(0.045 * m, hy - 0.005 * m, 0.014 * m, 0.02 * m, 0, 0, 7); c.fill();
    c.restore();
    legDraw(P.R, K.fill, col, 1); armDraw(f[6], K.fill, col, 1);
    c.beginPath(); c.arc(X(P.hip[0]), Y(P.hip[1]), jr, 0, 7); c.fillStyle = col; c.fill();
    // суставы за пределом: красные кольца (0–2 — бедро, колено, голеностоп дальней ноги, 3–5 — ближней)
    if (bad && bad.size) {
      const at = [P.hip, P.L.knee, P.L.ankle, P.hip, P.R.knee, P.R.ankle];
      c.strokeStyle = red; c.lineWidth = 2.4;
      for (const j of bad) { const q = at[j]; c.beginPath(); c.arc(X(q[0]), Y(q[1]), jr * 2.4, 0, 7); c.stroke(); }
    }
    c.restore();
    return P;
  }
  /** Ада спереди с ногами: голова с экраном, корпус, руки, две ноги со стопами. x — центр, yb — низ стоп, s — масштаб (как adaFront в 8.3). */
  function front(c, x, yb, s, P, dark) {
    const K = colors();
    c.save(); c.translate(x, yb); c.scale(s, s);
    c.lineWidth = 2.2; c.strokeStyle = K.line; c.fillStyle = K.fill;
    for (const lx of [-9, 9]) {   // ноги: бедро, голень, стопа
      c.beginPath(); c.roundRect(lx - 5, -44, 10, 22, 4); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(lx - 4, -26, 8, 20, 3.5); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(lx - 7, -7, 14, 7, 3); c.fill(); c.stroke();
    }
    c.beginPath(); c.roundRect(-18, -88, 36, 46, 10); c.fill(); c.stroke();               // корпус
    c.beginPath(); c.roundRect(-5, -62, 10, 4, 2); c.fillStyle = K.belt; c.fill();
    c.fillStyle = K.fill; c.lineCap = 'round'; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(-18, -80); c.lineTo(-27, -58); c.moveTo(18, -80); c.lineTo(27, -58); c.stroke();   // руки
    c.lineWidth = 2.2; c.beginPath(); c.roundRect(-17, -116, 34, 26, 9); c.fill(); c.stroke();                 // голова
    c.beginPath(); c.roundRect(-12, -111, 24, 16, 6); c.fillStyle = K.screen; c.fill();
    c.fillStyle = K.eye; c.beginPath(); c.ellipse(-5, -103, 2, 3, 0, 0, 7); c.ellipse(5, -103, 2, 3, 0, 0, 7); c.fill();
    c.restore();
  }
  return { BODY, points, side, front, colors };
})();
