/* =====================================================================
   actuators.js — урок 0.2, раздел «Шесть способов двигать сустав»:
   анимированные схемы приводов. Схема — функция кадра от времени t (секунды)
   на канвасе 360×220. Анимация идёт, только пока схема видна на экране;
   нажатие на схему ставит её на паузу. При настройке «уменьшить движение» —
   неподвижный кадр и кнопка запуска.
   Цвета: оранжевый — то, что крутит мотор; синий — выход, звено;
   фиолетовый — пружина; серый — неподвижные части.
   ===================================================================== */
'use strict';
const ActAnim = (() => {
  const K = HeroKit, W = 360, H = 220, TAU = Math.PI * 2;
  const pal = () => ({
    ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), line: K.css('--line-2'), surf: K.css('--surface'), surf2: K.css('--surface-2'),
    mot: K.css('--e2e'), motS: K.css('--e2e-soft'), out: K.css('--classic'), outS: K.css('--classic-soft'), spr: K.css('--hybrid'), sprS: K.css('--hybrid-soft'), bad: K.css('--critical'),
  });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
  const fmt = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  /* ---------- примитивы ---------- */
  function circle(c, x, y, r, fill, stroke, lw) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function rect(c, x, y, w, h, r, fill, stroke, lw) {
    c.beginPath(); c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function line(c, pts, color, lw, dash, offset) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.strokeStyle = color; c.lineWidth = lw || 2; c.lineCap = 'round'; c.lineJoin = 'round';
    c.setLineDash(dash || []); c.lineDashOffset = offset || 0; c.stroke(); c.setLineDash([]);
  }
  /** Звено-капсула: тёмный контур и заливка. */
  function link(c, x1, y1, x2, y2, w, fill, edge) {
    line(c, [[x1, y1], [x2, y2]], edge, w + 3);
    line(c, [[x1, y1], [x2, y2]], fill, w - 1);
  }
  function arrow(c, x1, y1, x2, y2, color, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1), hd = 8;
    line(c, [[x1, y1], [x2 - Math.cos(a) * 4, y2 - Math.sin(a) * 4]], color, lw || 3);
    c.beginPath(); c.moveTo(x2, y2);
    c.lineTo(x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45));
    c.lineTo(x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45));
    c.closePath(); c.fillStyle = color; c.fill();
  }
  /** Диск со спицами: видно, как он вращается. */
  function wheel(c, x, y, r, ang, fill, edge, n) {
    circle(c, x, y, r, fill, edge, 2);
    c.beginPath();
    for (let i = 0; i < (n || 3); i++) { const a = ang + i * TAU / (n || 3); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); }
    c.strokeStyle = edge; c.lineWidth = 2.2; c.lineCap = 'round'; c.stroke();
    circle(c, x, y, 3.2, edge);
  }
  function hatchBox(c, x0, y0, x1, y1, P) {
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 6, 1);
  }
  const lab = (c, k, text, x, y, o) => K.label(c, k, text, x, y, Object.assign({ px: 11.5, weight: 600 }, o || {}));
  /** Точки пересечения двух окружностей (центр, радиус); null — не пересекаются. */
  function meet(ax, ay, ar, bx, by, br) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d > ar + br || d < Math.abs(ar - br) || d === 0) return null;
    const a = (ar * ar - br * br + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, ar * ar - a * a));
    const mx = ax + a * dx / d, my = ay + a * dy / d;
    return [[mx + hh * dy / d, my - hh * dx / d], [mx - hh * dy / d, my + hh * dx / d]];
  }

  /* ---------- 1. Квазипрямой привод: мотор 6 : 1, толчок проворачивает мотор ---------- */
  function qdd(c, k, t, P) {
    const T = 5.2, u = t % T, M = { x: 118, y: 66 }, L = 112, R = 44;
    let phi = 0, cur = 0.1, push = 0;
    if (u < 1.6) { phi = 0.45 * Math.sin(Math.PI * u / 1.6); cur = 0.16 + 0.3 * Math.abs(Math.cos(Math.PI * u / 1.6)); }
    else if (u < 2.1) { phi = 0; push = seg(u, 1.75, 2.1); }
    else if (u < 2.5) { phi = -0.42 * ease(seg(u, 2.1, 2.5)); push = 1; }
    else if (u < 2.75) { phi = -0.42; push = 1 - seg(u, 2.5, 2.75); }
    else if (u < 3.7) { phi = -0.42 * (1 - ease(seg(u, 2.75, 3.7))); }
    if (u >= 2.1 && u < 3.7) cur = 0.12 + 1.9 * Math.abs(phi);
    const thm = 6 * phi + 0.35;                         // мотор поворачивается в 6 раз больше ноги
    // земля
    const gy = M.y + L + 9;
    line(c, [[30, gy], [214, gy]], P.ink3, 1.5); hatchBox(c, 30, gy, 214, gy + 10, P);
    // мотор: статор, ротор с магнитами, внутри — ступень редуктора 6 : 1
    circle(c, M.x, M.y, R, P.surf2, P.ink2, 2);
    circle(c, M.x, M.y, R - 7, P.surf, P.ink3, 1.5);
    for (let i = 0; i < 12; i++) {
      const a = thm + i * TAU / 12;
      c.beginPath(); c.arc(M.x, M.y, R - 10, a, a + TAU / 12 - 0.08); c.arc(M.x, M.y, R - 16, a + TAU / 12 - 0.08, a, true); c.closePath();
      c.fillStyle = i % 2 ? P.mot : P.motS; c.fill();
    }
    circle(c, M.x, M.y, 17, P.surf2, P.ink3, 1.5);                       // неподвижное кольцо редуктора
    const thc = phi;                                                   // водило = выход
    for (let i = 0; i < 3; i++) {
      const a = thc + i * TAU / 3, px = M.x + Math.cos(a) * 10.5, py = M.y + Math.sin(a) * 10.5;
      wheel(c, px, py, 6, -thm * 0.6, P.surf, P.ink2, 2);
    }
    circle(c, M.x, M.y, 3.5, P.mot);
    // нога — выход редуктора
    const fx = M.x + Math.sin(phi) * L, fy = M.y + Math.cos(phi) * L;
    link(c, M.x, M.y, fx, fy, 13, P.surf, P.out);
    line(c, [[M.x, M.y], [fx, fy]], P.out, 5);
    circle(c, fx, fy, 7, P.out);
    circle(c, M.x, M.y, 6, P.surf, P.out, 2.5);
    lab(c, k, 'мотор', M.x - R - 22, M.y - R + 6);
    lab(c, k, '6 : 1', M.x - R - 18, M.y + 8, { color: P.ink3, weight: 700 });
    lab(c, k, 'нога', M.x + Math.sin(phi) * L * 0.55 - 30, M.y + Math.cos(phi) * L * 0.55, { color: P.out });
    // толчок
    if (push > 0) {
      const cx = M.x + Math.sin(phi) * L * 0.72, cy = M.y + Math.cos(phi) * L * 0.72;
      c.globalAlpha = Math.min(1, push * 1.6);
      arrow(c, cx + 70 - 52 * Math.min(1, push * 1.2), cy, cx + 8 + 18 * (1 - Math.min(1, push * 1.2)), cy, P.bad, 3.5);
      lab(c, k, 'толчок', cx + 64, cy - 14, { color: P.bad });
      c.globalAlpha = 1;
    }
    if (u >= 2.1 && u < 3.5) lab(c, k, 'толчок провернул мотор назад', 122, 208, { color: P.bad });
    // ток мотора ≈ момент
    const bx = 300, by0 = 54, bh = 116, v = clamp(cur, 0, 1);
    rect(c, bx - 9, by0, 18, bh, 5, P.surf2, P.ink3, 1.5);
    rect(c, bx - 7, by0 + 2 + (bh - 4) * (1 - v), 14, (bh - 4) * v, 3, P.mot);
    lab(c, k, 'ток мотора', bx, by0 - 14);
    lab(c, k, '≈ сила', bx, by0 + bh + 14, { color: P.ink3 });
  }

  /* ---------- 2. Волновой редуктор: кулачок, гибкое колесо, жёсткое кольцо ---------- */
  function hd(c, k, t, P) {
    const T = 12, u = t % T, C = { x: 112, y: 112 }, NC = 62, NF = 60;
    const turns = 3.6 * (u < T / 2 ? ease(u / (T / 2)) : 1 - ease((u - T / 2) / (T / 2)));
    const thw = TAU * turns, thf = -thw * (NC - NF) / NF;         // за оборот кулачка колесо отстаёт на 2 зуба
    // жёсткое кольцо с внутренними зубьями
    c.beginPath(); c.arc(C.x, C.y, 99, 0, TAU); c.closePath();
    for (let i = 0; i < NC; i++) {
      const a = (i + 0.5) * TAU / NC, w = TAU / NC;
      [[a - w / 2, 88], [a - w / 4, 81.5], [a + w / 4, 81.5], [a + w / 2, 88]].forEach(([b, r], q) => {
        const x = C.x + Math.cos(b) * r, y = C.y + Math.sin(b) * r;
        if (i === 0 && q === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
    }
    c.closePath(); c.fillStyle = P.surf2; c.fill('evenodd'); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.stroke();
    // гибкое колесо с внешними зубьями: овал, который вращается вместе с кулачком
    const rb = (a) => 72 + 6 * Math.cos(2 * (a - thw));
    c.beginPath();
    for (let j = 0; j < NF; j++) {
      const a = thf + j * TAU / NF, w = TAU / NF;
      [[a - w / 2, 0], [a - w / 4, 7], [a + w / 4, 7], [a + w / 2, 0]].forEach(([b, hgt], q) => {
        const r = rb(b) + hgt, x = C.x + Math.cos(b) * r, y = C.y + Math.sin(b) * r;
        if (j === 0 && q === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
    }
    c.closePath();
    for (let q = 72; q >= 0; q--) { const b = q * TAU / 72, r = rb(b) - 9; const x = C.x + Math.cos(b) * r, y = C.y + Math.sin(b) * r; if (q === 72) c.moveTo(x, y); else c.lineTo(x, y); }
    c.closePath(); c.fillStyle = P.outS; c.fill('evenodd'); c.strokeStyle = P.out; c.lineWidth = 1.6; c.stroke();
    // кулачок (генератор волны) — от мотора
    c.save(); c.translate(C.x, C.y); c.rotate(thw);
    c.beginPath(); c.ellipse(0, 0, 61, 51, 0, 0, TAU); c.fillStyle = P.motS; c.fill(); c.strokeStyle = P.mot; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(-52, 0); c.lineTo(52, 0); c.strokeStyle = P.mot; c.lineWidth = 3; c.lineCap = 'round'; c.stroke();
    c.restore();
    circle(c, C.x, C.y, 9, P.mot);
    // выход: рычаг на гибком колесе поднимает груз
    const ex = C.x + Math.cos(thf) * 132, ey = C.y + Math.sin(thf) * 132;
    link(c, C.x, C.y, ex, ey, 9, P.surf, P.out); line(c, [[C.x + Math.cos(thf) * 20, C.y + Math.sin(thf) * 20], [ex, ey]], P.out, 4);
    line(c, [[ex, ey], [ex, ey + 10]], P.ink3, 1.5);
    rect(c, ex - 12, ey + 10, 24, 18, 3, P.ink3);
    circle(c, C.x + Math.cos(thf) * 82, C.y + Math.sin(thf) * 82, 4.5, P.out);   // метка на колесе
    // подписи
    lab(c, k, `кулачок: ${fmt(turns, 1)} об.`, 296, 162, { color: P.mot });
    lab(c, k, `выход: ${fmt(-thf * 180 / Math.PI, 0)}°`, 296, 181, { color: P.out });
    lab(c, k, 'здесь 30 : 1', 296, 204, { color: P.ink3 });
  }

  /* ---------- 3. Серийно-упругий привод: пружина между мотором и звеном ---------- */
  const SEA = (() => {
    const T = 6.4, KF = 2.5, A0 = 96, REST = 76, XB_WALL = 270;
    const xA = (u) => {
      if (u < 1.8) return A0 + 98 * ease(u / 1.8);
      if (u < 3.0) return A0 + 98 + 24 * ease(seg(u, 1.8, 3.0));
      if (u < 4.2) return A0 + 122;
      return A0 + 122 * (1 - ease(seg(u, 4.2, 6.2)));
    };
    const state = (u) => { const a = xA(u), b = Math.min(a + REST, XB_WALL); return { a, b, f: KF * (a + REST - b) }; };
    // кривая силы для графика и сравнение с жёстким приводом (удар без пружины)
    const N = 160, curve = [], rigid = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N * T, s = state(u);
      curve.push(s.f);
      const hit = u >= 1.8 ? Math.exp(-(u - 1.8) / 0.07) * 175 : 0;
      rigid.push(s.f > 0 || u >= 1.8 && u < 4.4 ? Math.max(hit, u < 4.2 ? 60 : s.f) : 0);
    }
    return { T, state, curve, rigid, XB_WALL };
  })();
  function sea(c, k, t, P) {
    const u = t % SEA.T, s = SEA.state(u), yc = 104;
    // рельс и стена
    line(c, [[14, 136], [302, 136]], P.ink3, 1.4);
    rect(c, 304, 60, 14, 84, 2, P.surf2, P.ink3, 1.4); c.beginPath(); c.rect(304, 60, 14, 84); K.hatch(c, 304, 60, 318, 144, P.ink3, 6, 1);
    // мотор с редуктором
    rect(c, 12, 74, 62, 58, 8, P.surf2, P.ink2, 2);
    wheel(c, 43, 103, 18, (s.a - 96) * 0.22, P.motS, P.mot, 3);
    line(c, [[74, yc], [s.a - 6, yc]], P.ink3, 4);
    rect(c, s.a - 6, 80, 12, 48, 3, P.mot);
    // пружина
    const x0 = s.a + 6, x1 = s.b, n = 8, pts = [[x0, yc]];
    for (let i = 1; i < 2 * n; i++) pts.push([x0 + (x1 - x0) * i / (2 * n), yc + (i % 2 ? -12 : 12)]);
    pts.push([x1, yc]);
    line(c, pts, P.spr, 2.6);
    // звено
    rect(c, s.b, 82, 34, 44, 6, P.outS, P.out, 2);
    lab(c, k, 'звено', s.b + 17, 68, { color: P.out });
    lab(c, k, 'мотор', 43, 60);
    // сжатие пружины и сила
    const dx = s.a + 6 + 70 - s.b, x0r = s.b - 70;                  // x0r — где была бы пластина без сжатия
    if (dx > 0.5) {
      line(c, [[x0r, 72], [x0r + dx, 72]], P.spr, 2);
      line(c, [[x0r, 67], [x0r, 77]], P.spr, 2); line(c, [[x0r + dx, 67], [x0r + dx, 77]], P.spr, 2);
      lab(c, k, 'Δx', x0r + dx / 2, 58, { color: P.spr, weight: 700 });
    }
    lab(c, k, `сила = k · Δx = ${fmt(s.f, 0)} Н`, 180, 18, { color: P.spr, weight: 700 });
    // график силы: с пружиной и без неё
    const gx0 = 34, gx1 = 330, gy0 = 156, gy1 = 210, fmax = 180;
    const X = (i) => gx0 + (gx1 - gx0) * i / (SEA.curve.length - 1), Y = (f) => gy1 - (gy1 - gy0) * Math.min(f, fmax) / fmax;
    line(c, [[gx0, gy1], [gx1, gy1]], P.line, 1);
    line(c, SEA.rigid.map((f, i) => [X(i), Y(f)]), P.bad, 1.8, [5, 4]);
    line(c, SEA.curve.map((f, i) => [X(i), Y(f)]), P.spr, 2.4);
    const ci = Math.round(u / SEA.T * (SEA.curve.length - 1));
    line(c, [[X(ci), gy0 - 4], [X(ci), gy1]], P.ink3, 1);
    circle(c, X(ci), Y(SEA.curve[ci]), 3.5, P.spr);
    lab(c, k, 'сила', 18, gy1 - 8, { color: P.ink3, align: 'center', px: 10.5 });
    lab(c, k, 'с пружиной', 236, gy0 + 4, { color: P.spr, align: 'left', px: 10.5 });
    lab(c, k, 'жёстко: удар', 150, gy0 + 4, { color: P.bad, align: 'left', px: 10.5 });
  }

  /* ---------- 4. Планетарный роликовый винт: вращение → движение по прямой → поворот сустава ---------- */
  function screw(c, k, t, P) {
    const T = 6, u = t % T, yc = 93, PITCH = 7, X0 = 84;
    const xn = X0 + 24 * (1 - Math.cos(TAU * u / T));             // гайка ездит от 84 до 132
    const ph = (xn - X0) % PITCH;
    // мотор
    rect(c, 10, 70, 46, 46, 7, P.surf2, P.ink2, 2);
    wheel(c, 33, yc, 15, (xn - X0) / PITCH * TAU, P.motS, P.mot, 3);
    // винт с резьбой
    rect(c, 56, yc - 7, 158, 14, 3, P.surf2, P.ink3, 1.4);
    c.save(); c.beginPath(); c.rect(57, yc - 7, 156, 14); c.clip();
    for (let x = 50 + ph; x < 216; x += PITCH) line(c, [[x, yc - 7], [x + 4, yc + 7]], P.mot, 1.4);
    c.restore();
    // гайка с роликами
    rect(c, xn, yc - 20, 44, 40, 6, P.outS, P.out, 2);
    [yc - 15, yc + 9].forEach((ry) => {
      rect(c, xn + 5, ry, 34, 6, 3, P.surf, P.out, 1.2);
      c.save(); c.beginPath(); c.rect(xn + 5, ry, 34, 6); c.clip();
      for (let x = xn + 2 + (ph * 2.2) % 5; x < xn + 42; x += 5) line(c, [[x, ry], [x + 2.5, ry + 6]], P.out, 1);
      c.restore();
    });
    // тяга от низа гайки к рычагу сустава
    const J = { x: 240, y: 178 }, RA = 52, ROD = 90, N = { x: xn + 44, y: yc + 20 };
    const m = meet(N.x, N.y, ROD, J.x, J.y, RA);
    const T2 = m ? (m[0][1] < m[1][1] ? m[0] : m[1]) : [J.x, J.y - RA];
    const dir = [(T2[0] - J.x) / RA, (T2[1] - J.y) / RA], E = [J.x + dir[0] * 58, J.y + dir[1] * 58];
    c.beginPath(); c.moveTo(J.x, J.y); c.lineTo(J.x - 13, J.y + 22); c.lineTo(J.x + 13, J.y + 22); c.closePath(); c.fillStyle = P.surf2; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.stroke();
    hatchBox(c, J.x - 22, J.y + 22, J.x + 22, J.y + 30, P);
    link(c, J.x, J.y, E[0], E[1], 12, P.surf, P.out); line(c, [[J.x, J.y], [E[0], E[1]]], P.out, 6);
    line(c, [[N.x, N.y], [T2[0], T2[1]]], P.ink2, 3.2);
    circle(c, N.x, N.y, 4, P.surf, P.ink2, 2); circle(c, T2[0], T2[1], 4, P.surf, P.ink2, 2);
    circle(c, J.x, J.y, 7, P.surf, P.out, 2.5);
    rect(c, E[0] - 11, E[1] - 19, 22, 15, 3, P.ink3);               // груз на конце рычага
    // подписи
    lab(c, k, 'мотор', 33, 56);
    lab(c, k, 'винт', 222, yc, { color: P.mot, align: 'left' });
    lab(c, k, 'гайка с роликами', xn + 2, yc - 30, { color: P.out, align: 'left' });
    lab(c, k, 'сустав', J.x + 40, J.y + 10);
    lab(c, k, 'груз', E[0] + 30, E[1] - 12, { color: P.ink3 });
    lab(c, k, 'вращение → движение по прямой', 104, 172, { color: P.ink3 });
  }

  /* ---------- 5. Тросы: мотор в корпусе, палец двигают тросы ---------- */
  function tendon(c, k, t, P) {
    const T = 4.4, u = t % T, beta = 1.15 * ease(u < T / 2 ? u / (T / 2) : 1 - (u - T / 2) / (T / 2));
    const M = { x: 52, y: 110 }, RM = 24, J = { x: 252, y: 110 }, RJ = 13, thm = beta * RJ / RM * 2.2;
    const s = thm * RM;                                            // насколько смотан трос
    // корпус с мотором
    rect(c, 10, 52, 86, 116, 12, P.surf2, P.ink2, 2);
    lab(c, k, 'мотор в корпусе', 53, 38);
    // лёгкая рука до пальца
    link(c, 96, J.y, J.x, J.y, 8, P.surf, P.ink3);
    // тросы
    const bend = u < T / 2;                                        // сгибает нижний трос, разгибает верхний
    line(c, [[M.x, M.y - RM], [J.x, J.y - RJ]], bend ? P.ink3 : P.mot, bend ? 2 : 2.8, [7, 5], s);
    line(c, [[M.x, M.y + RM], [J.x, J.y + RJ]], bend ? P.mot : P.ink3, bend ? 2.8 : 2, [7, 5], -s);
    [140, 196].forEach((x) => { const f = (x - M.x) / (J.x - M.x); circle(c, x, M.y - RM + (RM - RJ) * f, 3.5, P.surf, P.ink3, 1.5); circle(c, x, M.y + RM - (RM - RJ) * f, 3.5, P.surf, P.ink3, 1.5); });
    wheel(c, M.x, M.y, RM, thm, P.motS, P.mot, 3);
    // палец: две фаланги, вторая сгибается вслед за первой
    const e1 = [J.x + Math.cos(beta) * 46, J.y + Math.sin(beta) * 46], b2 = beta * 1.5;
    const e2 = [e1[0] + Math.cos(b2) * 34, e1[1] + Math.sin(b2) * 34];
    link(c, J.x, J.y, e1[0], e1[1], 13, P.surf, P.out); line(c, [[J.x, J.y], e1], P.out, 6);
    link(c, e1[0], e1[1], e2[0], e2[1], 11, P.surf, P.out); line(c, [e1, e2], P.out, 5);
    circle(c, e1[0], e1[1], 4, P.surf, P.out, 2);
    wheel(c, J.x, J.y, RJ, beta, P.outS, P.out, 2);
    lab(c, k, bend ? 'нижний трос сгибает' : 'верхний трос разгибает', 168, bend ? 146 : 70, { color: P.mot });
    lab(c, k, 'палец', 318, 98, { color: P.out });
    lab(c, k, 'в руке нет моторов: она лёгкая', 172, 196, { color: P.ink3 });
  }

  /* ---------- 6. Гидравлика: насос, клапан, цилиндр, звено ---------- */
  function hyd(c, k, t, P) {
    const T = 5, u = t % T, B = { x: 104, y: 170 }, J = { x: 306, y: 178 }, RL = 60, BODY = 112, ROD = 84;
    const al = -2.6 + 0.65 * ease(u < T / 2 ? u / (T / 2) : 1 - (u - T / 2) / (T / 2));
    const dal = Math.sin(TAU * u / T);                              // > 0 — цилиндр выдвигается
    const Tp = [J.x + RL * Math.cos(al), J.y + RL * Math.sin(al)];
    const L = Math.hypot(Tp[0] - B.x, Tp[1] - B.y), ux = (Tp[0] - B.x) / L, uy = (Tp[1] - B.y) / L, nx = -uy, ny = ux;
    const pist = L - ROD;                                          // поршень от основания цилиндра
    // насос и клапан
    const pc = { x: 44, y: 62 };
    circle(c, pc.x, pc.y, 22, P.surf2, P.ink2, 2);
    wheel(c, pc.x, pc.y, 15, t * 9, P.motS, P.mot, 4);
    lab(c, k, 'насос', pc.x, 28);
    rect(c, 96, 46, 64, 32, 6, P.surf2, P.ink2, 2);
    rect(c, 115 + 9 * clamp(dal * 2, -1, 1), 52, 26, 20, 4, P.ink3);
    lab(c, k, 'клапан', 128, 30);
    const flow = t * 26;
    line(c, [[66, 62], [96, 62]], P.mot, 4, [6, 5], -flow);
    // шланги к двум полостям цилиндра
    const capPort = [B.x + ux * 14 + nx * 9, B.y + uy * 14 + ny * 9], rodPort = [B.x + ux * (BODY - 12) + nx * 9, B.y + uy * (BODY - 12) + ny * 9];
    const hose = (from, to) => { const pts = []; for (let i = 0; i <= 20; i++) { const s = i / 20; pts.push([from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s - Math.sin(Math.PI * s) * 18]); } return pts; };
    const ext = dal >= 0, pres = ext ? capPort : rodPort, ret = ext ? rodPort : capPort;
    line(c, hose([112, 78], pres), P.mot, 3.4, [6, 5], -flow);
    line(c, hose([144, 78], ret), P.out, 3.4, [6, 5], flow);
    // цилиндр: корпус вращается вокруг B, шток выходит к звену
    c.save(); c.translate(B.x, B.y); c.rotate(Math.atan2(uy, ux));
    rect(c, 0, -11, BODY, 22, 5, P.surf2, P.ink2, 2);
    rect(c, 2, -9, pist - 2, 18, 3, ext ? P.motS : P.outS);
    rect(c, pist, -9, BODY - pist - 2, 18, 3, ext ? P.outS : P.motS);
    line(c, [[pist, 0], [L, 0]], P.ink2, 5);
    rect(c, pist - 3, -10, 6, 20, 2, P.ink2);
    c.restore();
    circle(c, B.x, B.y, 5, P.surf, P.ink2, 2);
    hatchBox(c, B.x - 20, B.y + 6, B.x + 20, B.y + 14, P);
    // звено
    const E = [J.x + 118 * Math.cos(al), J.y + 118 * Math.sin(al)];
    link(c, J.x, J.y, E[0], E[1], 14, P.surf, P.out); line(c, [[J.x, J.y], E], P.out, 6);
    circle(c, Tp[0], Tp[1], 4.5, P.surf, P.ink2, 2);
    circle(c, J.x, J.y, 7, P.surf, P.out, 2.5);
    hatchBox(c, J.x - 22, J.y + 8, J.x + 22, J.y + 16, P);
    lab(c, k, 'цилиндр', B.x + ux * 56 - nx * 24, B.y + uy * 56 - ny * 24);
    lab(c, k, 'звено', E[0] + 24, E[1] - 8, { color: P.out });
    lab(c, k, 'давление', 196, 34, { color: P.mot, align: 'left' });
    lab(c, k, 'слив', 196, 52, { color: P.out, align: 'left' });
  }

  const DRAW = { qdd, hd, sea, screw, tendon, hyd };
  const START = { qdd: 2.3, hd: 4, sea: 3.4, screw: 1.5, tendon: 1.4, hyd: 1.2 };   // кадр для неподвижной схемы

  function mount(cv) {
    const kind = cv.dataset.act;
    if (!DRAW[kind]) return;
    let t = START[kind], P = pal(), paused = false, ctl = null;
    const draw = () => { const { c, k } = K.fit(cv, W, H); c.clearRect(0, 0, W, H); DRAW[kind](c, k, t, P); };
    K.onTheme(() => { P = pal(); draw(); });
    window.addEventListener('resize', draw);
    const run = () => { if (!ctl) ctl = K.loop(cv, (dt) => { if (!paused) t += dt; draw(); }); };
    cv.addEventListener('click', () => { paused = !paused; cv.classList.toggle('paused', paused); if (!ctl) { paused = false; run(); } });
    draw();
    if (K.reduced()) {
      const b = h('button', { type: 'button', class: 'btn sm ghost act-play' }, 'Показать движение');
      b.addEventListener('click', () => { b.remove(); run(); });
      cv.after(b);
    } else run();
  }
  function init() { $$('canvas[data-act]').forEach(mount); }
  /** Кадр в момент t — для проверок и снимков. */
  function frame(cv, t) { const { c, k } = K.fit(cv, W, H); c.clearRect(0, 0, W, H); DRAW[cv.dataset.act](c, k, t, pal()); }
  return { init, frame, kinds: Object.keys(DRAW) };
})();
