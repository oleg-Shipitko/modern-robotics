/* =====================================================================
   sensors.js — урок 0.2, раздел «Что робот знает о себе и о мире»:
   анимированные схемы шести сенсоров на общем движке shared/anim.js.
   Оранжевым — то, что излучает или давит; синим — измеренный сигнал;
   фиолетовым — упругое; серым — неподвижные части.
   ===================================================================== */
'use strict';
(() => {
  const W = 360, H = 220;

  /* ---------- 1. Энкодер: диск с прорезями, два датчика, импульсы A и B ---------- */
  const T_ENC = 6, PITCH = Math.PI * 2 / 24;
  function encAngle(t) {                                  // по часовой 2,2 рад, пауза, против часовой 1,4 рад
    const { seg, ease } = Anim.kit, n = Math.floor(t / T_ENC), u = t - n * T_ENC;
    return n * 0.8 + 2.2 * ease(seg(u, 0, 2.6)) - 1.4 * ease(seg(u, 3.1, 5.3));
  }
  const slitOpen = (th, w) => (((w - th) % PITCH) + PITCH) % PITCH < PITCH / 2;
  Anim.add('enc', { W, H, start: 1.3, draw(c, k, t, P, A) {
    const { circle, rect, line, lab, fmt, TAU, alpha } = A;
    const C = { x: 92, y: 116 }, th = encAngle(t), v = (encAngle(t + 0.03) - encAngle(t - 0.03)) / 0.06;
    const wA = -Math.PI / 2, wB = Math.PI / 2 + PITCH / 4;   // второй датчик сдвинут на четверть шага прорезей
    // диск
    c.save(); c.translate(C.x, C.y); c.rotate(th);
    circle(c, 0, 0, 72, P.surf2, P.ink3, 2);
    for (let i = 0; i < 24; i++) {
      const a0 = i * PITCH, a1 = a0 + PITCH / 2;
      c.beginPath(); c.arc(0, 0, 66, a0, a1); c.arc(0, 0, 52, a1, a0, true); c.closePath();
      c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1; c.stroke();
    }
    circle(c, 0, 0, 15, P.motS, P.mot, 2.4);
    line(c, [[0, 0], [11, 0]], P.mot, 3);
    c.restore();
    // датчики: свет проходит через прорезь — датчик горит
    for (const [w, name] of [[wA, 'A'], [wB, 'B']]) {
      const x = C.x + 59 * Math.cos(w), y = C.y + 59 * Math.sin(w), on = slitOpen(th, w);
      if (on) circle(c, x, y, 11, alpha(P.mot, 0.35));
      rect(c, x - 5, y - 5, 10, 10, 2, on ? P.out : P.surf, on ? P.out : P.ink3, 1.6);
      lab(c, k, name, x + 18, y + (name === 'A' ? -10 : 10), { color: P.out, weight: 700 });
    }
    lab(c, k, 'диск крутится с валом', C.x, 206, { color: P.ink3, px: 10.5 });
    lab(c, k, 'свет → датчик', C.x, 22, { color: P.mot, px: 10.5 });
    // импульсы за последние 2 секунды
    const x0 = 196, x1 = 350, rows = [[wA, 'A', 70], [wB, 'B', 122]];
    for (const [w, name, y] of rows) {
      line(c, [[x0, y + 14], [x1, y + 14]], P.grid, 1);
      const pts = [];
      for (let x = x0; x <= x1; x += 1) { const tau = (x1 - x) / (x1 - x0) * 2, on = slitOpen(encAngle(t - tau), w); pts.push([x, on ? y - 12 : y + 12]); }
      const stepped = []; pts.forEach((p, i) => { if (i && p[1] !== pts[i - 1][1]) stepped.push([p[0], pts[i - 1][1]]); stepped.push(p); });
      line(c, stepped, name === 'A' ? P.out : P.ink2, 2);
      lab(c, k, name, x0 - 10, y, { color: name === 'A' ? P.out : P.ink2, weight: 700 });
    }
    lab(c, k, 'импульсы датчиков, 2 с', (x0 + x1) / 2, 40, { color: P.ink3, px: 10.5 });
    const n = Math.floor(th / (PITCH / 4) + 1e-6);
    lab(c, k, `отсчётов: ${n} · угол ${fmt(n * 3.75, 1)}°`, (x0 + x1) / 2, 160, { color: P.ink, weight: 700 });
    lab(c, k, Math.abs(v) < 0.05 ? 'вал стоит' : v > 0 ? 'по часовой: A раньше B' : 'против часовой: B раньше A', (x0 + x1) / 2, 180, { color: Math.abs(v) < 0.05 ? P.ink3 : P.out, px: 10.5 });
  } });

  /* ---------- 2. Инерциальный блок: акселерометр и гироскоп в одном корпусе ---------- */
  const T_IMU = 7;
  function imuState(t) {
    const u = ((t % T_IMU) + T_IMU) % T_IMU, TAU = Math.PI * 2;
    let phi = 0, om = 0, dx = 0, ax = 0;
    if (u < 3.2) { phi = 0.32 * Math.sin(TAU * u / 3.2); om = 0.32 * TAU / 3.2 * Math.cos(TAU * u / 3.2); }
    else if (u >= 3.8 && u < 5) { const s = u - 3.8, w = TAU * 2.5, env = Math.sin(Math.PI * s / 1.2); dx = 12 * env * Math.sin(w * s); ax = -12 * w * w * env * Math.sin(w * s); }
    return { u, phi, om, dx, ax, jerk: u >= 3.8 && u < 5 };
  }
  Anim.add('imu', { W, H, start: 0.7, draw(c, k, t, P, A) {
    const { rect, circle, line, spring, arrow, lab, fmt, clamp } = A;
    const s = imuState(t), C = { x: 186 + s.dx, y: 112 };
    const acc = Math.sin(s.phi) - s.ax / 4200;              // ускорение вдоль корпуса в долях g: наклон и рывок
    const xm = clamp(22 * acc, -20, 20);
    const f = 2 * Math.PI * 4, wom = s.om / 0.63;
    // сила тяжести
    arrow(c, 30, 70, 30, 118, P.ink3, 2.6); lab(c, k, 'g', 42, 94, { color: P.ink3, weight: 700 });
    c.save(); c.translate(C.x, C.y); c.rotate(s.phi);
    rect(c, -96, -42, 192, 84, 14, P.surf, P.ink2, 2.2);
    // акселерометр: масса на пружинах
    rect(c, -88, -30, 80, 60, 6, P.surf2, P.ink3, 1.4);
    spring(c, -88, 0, -48 + xm - 10, 0, P.spr, 4, 5, 2);
    spring(c, -48 + xm + 10, 0, -8, 0, P.spr, 4, 5, 2);
    rect(c, -48 + xm - 10, -10, 20, 20, 4, P.outS, P.out, 2);
    // гироскоп: масса качается вверх-вниз, поворот уводит её вбок
    rect(c, 8, -30, 80, 60, 6, P.surf2, P.ink3, 1.4);
    const trail = [];
    for (let i = 0; i <= 24; i++) { const tt = t - i * 0.25 / 24, ss = imuState(tt), wo = ss.om / 0.63; trail.push([48 + 12 * wo * Math.cos(f * tt), 19 * Math.sin(f * tt)]); }
    line(c, trail, P.line, 1.4);
    circle(c, 48 + 12 * wom * Math.cos(f * t), 19 * Math.sin(f * t), 7, P.outS, P.out, 2);
    c.restore();
    lab(c, k, 'акселерометр', 116, 20, { color: P.ink2, px: 11 });
    lab(c, k, 'гироскоп', 262, 20, { color: P.ink2, px: 11 });
    if (s.jerk) lab(c, k, 'рывок: акселерометр видит «наклон», гироскоп — нет', W / 2, 204, { color: P.bad, px: 10.5 });
    else lab(c, k, `наклон ${fmt(s.phi * 180 / Math.PI, 0)}° · поворот ${fmt(s.om * 180 / Math.PI, 0)} °/с`, W / 2, 204, { color: P.out, weight: 700 });
  } });

  /* ---------- 3. Датчик силы и момента: упругие балки и тензодатчики ---------- */
  const T_FT = 7.2;
  function ftState(t) {
    const { seg, ease } = Anim.kit, u = ((t % T_FT) + T_FT) % T_FT;
    const down = ease(seg(u, 0.2, 1.3)) - ease(seg(u, 4.4, 5.3));
    const fz = ease(seg(u, 1.3, 2.3)) * (1 - ease(seg(u, 4.4, 4.9)));
    const slide = ease(seg(u, 2.6, 4.3)) * (1 - ease(seg(u, 5.4, 7)));
    const fx = (u > 2.5 && u < 4.4 ? 0.75 * seg(u, 2.5, 2.8) : 0) * (1 - seg(u, 4.3, 4.45));
    return { down, fz, fx, slide };
  }
  Anim.add('ft', { W, H, start: 3.4, draw(c, k, t, P, A) {
    const { rect, line, arrow, lab, hatchBox, alpha } = A;
    const s = ftState(t), ox = 40 * s.slide, oy = -22 * (1 - s.down), X = 120 + ox, TBL = 186;
    // стол
    line(c, [[16, TBL], [250, TBL]], P.ink3, 2); hatchBox(c, 16, TBL + 2, 250, TBL + 12, P);
    // фланец робота
    rect(c, X - 40, 6 + oy, 80, 26, 5, P.surf2, P.ink2, 2); lab(c, k, 'запястье', X - 46, 19 + oy, { align: 'right', color: P.ink3, px: 10.5 });
    // датчик: верхняя и нижняя пластины, между ними упругие балки
    const comp = 5 * s.fz, shear = 7 * s.fx, top = 32 + oy, bot = 84 + oy + comp * 0;   // нижняя пластина сдвигается вбок и поджимается
    rect(c, X - 44, top, 88, 10, 3, P.surf2, P.ink2, 2);
    rect(c, X - 44 - shear, bot - comp, 88, 10, 3, P.surf2, P.ink2, 2);
    for (const bx of [-28, 28]) {
      const x1 = X + bx, y1 = top + 10, x2 = X + bx - shear, y2 = bot - comp;
      c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(x1, y1 + 16, x2, y2 - 16, x2, y2);
      c.strokeStyle = P.spr; c.lineWidth = 7; c.lineCap = 'butt'; c.stroke();
      // тензодатчик на балке: цвет — насколько балка растянута или сжата
      const strain = (bx < 0 ? 1 : -1) * s.fx * 0.9 + s.fz * 0.7, my = (y1 + y2) / 2, mx = (x1 + x2) / 2;
      rect(c, mx - 6, my - 7, 12, 14, 2, alpha(P.out, 0.15 + 0.75 * Math.min(1, Math.abs(strain))), P.out, 1.4);
    }
    lab(c, k, 'упругие балки', 8, 62 + oy, { align: 'left', color: P.spr, px: 10.5 });
    // захват
    const gx = X - shear, gy = bot - comp + 10;
    rect(c, gx - 30, gy, 60, 14, 4, P.surf, P.ink2, 2);
    line(c, [[gx - 20, gy + 14], [gx - 20, TBL - 2 + (1 - s.down) * -22 + 0]], P.ink2, 7);
    line(c, [[gx + 20, gy + 14], [gx + 20, TBL - 2 + (1 - s.down) * -22]], P.ink2, 7);
    // силы от стола
    if (s.fz > 0.05) arrow(c, gx, TBL + 24, gx, TBL + 24 - 30 * s.fz, P.mot, 3);
    if (s.fx > 0.05) arrow(c, gx + 40, TBL - 8, gx + 40 - 34 * s.fx, TBL - 8, P.mot, 3);
    // показания: шесть чисел
    const names = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'], vals = [-s.fx, 0.04 * Math.sin(t * 7), s.fz, 0.03 * Math.sin(t * 5), -0.55 * s.fx, 0.02 * Math.sin(t * 9)];
    const bx0 = 292, by0 = 40;
    lab(c, k, 'шесть чисел', bx0 + 28, by0 - 22, { color: P.ink3, px: 10.5 });
    names.forEach((n, i) => {
      const y = by0 + i * 24, v = vals[i];
      lab(c, k, n, bx0 - 10, y + 6, { align: 'right', px: 11, color: P.ink2, mono: true });
      rect(c, bx0, y, 56, 12, 3, P.surf2, P.grid, 1);
      const w = 27 * Math.max(-1, Math.min(1, v));
      c.fillStyle = P.out; c.fillRect(bx0 + 28 + Math.min(0, w), y + 2, Math.abs(w), 8);
      line(c, [[bx0 + 28, y], [bx0 + 28, y + 12]], P.ink3, 1);
    });
    lab(c, k, s.fx > 0.1 ? 'скольжение: трение тянет захват назад' : s.fz > 0.1 ? 'нажим: стол давит на захват' : 'в воздухе: нагрузки нет', 126, 208, { color: P.ink2, px: 11 });
  } });

  /* ---------- 4. Камера глубины: две камеры и проектор точек ---------- */
  Anim.add('depth', { W, H, start: 1.6, draw(c, k, t, P, A) {
    const { rect, line, circle, lab, fmt, ease, alpha } = A;
    const T = 6, u = ((t % T) + T) % T, z = 0.35 + 0.75 * ease(u < 3 ? u / 3 : 1 - (u - 3) / 3);   // метры
    const BASE = 196, yFace = BASE - z * 140, L = { x: 146, y: BASE }, R = { x: 214, y: BASE }, Pj = { x: 180, y: BASE };
    // стена и предмет
    line(c, [[20, 26], [250, 26]], P.ink3, 2); lab(c, k, 'стена', 36, 16, { color: P.ink3, px: 10.5 });
    rect(c, 136, yFace - 36, 88, 36, 4, P.surf2, P.ink2, 2); lab(c, k, 'предмет', 180, yFace - 18, { color: P.ink2, px: 10.5 });
    // проектор рисует точки на сцене
    for (let i = -5; i <= 5; i++) {
      const tx = 180 + i * 16, hitY = tx > 136 && tx < 224 ? yFace : 26;
      line(c, [[Pj.x, Pj.y - 8], [tx, hitY]], alpha(P.mot, 0.28), 1.2);
      circle(c, tx, hitY, 2.6, P.mot);
    }
    // одна точка, её видят обе камеры
    const D = { x: 196, y: yFace };
    line(c, [[L.x, L.y - 8], [D.x, D.y]], P.out, 1.8); line(c, [[R.x, R.y - 8], [D.x, D.y]], P.out, 1.8);
    circle(c, D.x, D.y, 4.2, P.mot, P.surf, 1.5);
    // корпус камеры
    rect(c, 126, BASE - 10, 108, 20, 6, P.surf, P.ink2, 2);
    for (const q of [L, R]) circle(c, q.x, q.y, 6.5, P.outS, P.out, 2);
    circle(c, Pj.x, Pj.y, 5, P.motS, P.mot, 2);
    lab(c, k, 'левая', L.x - 26, BASE + 2, { color: P.out, px: 10 }); lab(c, k, 'правая', R.x + 30, BASE + 2, { color: P.out, px: 10 });
    // кадры двух камер: точка сдвинута тем сильнее, чем ближе предмет
    const d = 32 / z, ix = 256, iw = 86;
    lab(c, k, 'кадры камер', ix + iw / 2, 30, { color: P.ink3, px: 10.5 });
    for (const [row, sign, name] of [[44, 1, 'левый'], [96, -1, 'правый']]) {
      rect(c, ix, row, iw, 30, 4, P.surf2, P.ink3, 1.4);
      const px = ix + iw / 2 + sign * d * 0.32;
      circle(c, px, row + 15, 4, P.mot);
      lab(c, k, name, ix + iw / 2, row + 40, { color: P.ink3, px: 10 });
    }
    const pl = ix + iw / 2 + d * 0.32, pr = ix + iw / 2 - d * 0.32;
    line(c, [[pl, 74], [pl, 150]], P.line, 1, [3, 3]); line(c, [[pr, 126], [pr, 150]], P.line, 1, [3, 3]);
    line(c, [[pr, 150], [pl, 150]], P.out, 2);
    lab(c, k, `сдвиг ${fmt(d, 0)} пикс`, ix + iw / 2, 164, { color: P.out, weight: 700, px: 11 });
    lab(c, k, `до предмета ${fmt(z, 2)} м`, ix + iw / 2, 184, { color: P.ink, weight: 700, px: 11 });
  } });

  /* ---------- 5. Лидар: вращающийся луч и время пролёта ---------- */
  const ROOM = (() => {
    const segs = [], box = (x0, y0, x1, y1) => segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
    segs.push([14, 14, 346, 14], [346, 14, 346, 206], [346, 206, 120, 206], [80, 206, 14, 206], [14, 206, 14, 14]);   // стены с дверью
    box(232, 42, 302, 88); box(52, 140, 96, 182);
    return { segs, person: { x: 270, y: 150, r: 13 } };
  })();
  const LID = { x: 170, y: 112 }, PXM = 55;                   // 55 пикселей на метр
  function cast(a) {
    const dx = Math.cos(a), dy = Math.sin(a); let best = 1e9;
    for (const [x1, y1, x2, y2] of ROOM.segs) {
      const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const tt = ((x1 - LID.x) * ey - (y1 - LID.y) * ex) / den, s = ((x1 - LID.x) * dy - (y1 - LID.y) * dx) / den;
      if (tt > 0 && s >= 0 && s <= 1 && tt < best) best = tt;
    }
    const pr = ROOM.person, fx = LID.x - pr.x, fy = LID.y - pr.y, b = fx * dx + fy * dy, cc = fx * fx + fy * fy - pr.r * pr.r, disc = b * b - cc;
    if (disc > 0) { const tt = -b - Math.sqrt(disc); if (tt > 0 && tt < best) best = tt; }
    return best;
  }
  const HITS = Array.from({ length: 360 }, (_, i) => cast(i * Math.PI / 180));
  Anim.add('lidar', { W, H, start: 1.1, draw(c, k, t, P, A) {
    const { rect, line, circle, lab, fmt, TAU, alpha } = A;
    const per = 2.4, a = (t / per % 1) * TAU, ai = Math.floor(a * 180 / Math.PI);
    // комната
    for (const [x1, y1, x2, y2] of ROOM.segs) line(c, [[x1, y1], [x2, y2]], P.line, 1.6);
    circle(c, ROOM.person.x, ROOM.person.y, ROOM.person.r, null, P.line, 1.6);
    lab(c, k, 'стол', 267, 65, { color: P.ink3, px: 10 }); lab(c, k, 'коробка', 74, 161, { color: P.ink3, px: 10 }); lab(c, k, 'человек', 270, 175, { color: P.ink3, px: 10 });
    // облако точек: прошлый оборот бледно, текущий ярко
    for (let i = 0; i < 360; i++) {
      const r = HITS[i], ang = i * Math.PI / 180, x = LID.x + r * Math.cos(ang), y = LID.y + r * Math.sin(ang), fresh = i <= ai;
      circle(c, x, y, fresh ? 2.2 : 1.7, fresh ? P.out : alpha(P.out, 0.4));
    }
    // луч и импульс
    const r = cast(a), hx = LID.x + r * Math.cos(a), hy = LID.y + r * Math.sin(a);
    line(c, [[LID.x, LID.y], [hx, hy]], alpha(P.mot, 0.55), 1.6);
    const ph = (t * 3) % 1, s = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    circle(c, LID.x + s * r * Math.cos(a), LID.y + s * r * Math.sin(a), 3.4, P.mot);
    circle(c, LID.x, LID.y, 10, P.surf, P.ink2, 2);
    line(c, [[LID.x, LID.y], [LID.x + 9 * Math.cos(a), LID.y + 9 * Math.sin(a)]], P.mot, 3);
    const m = r / PXM;
    rect(c, 22, 20, 196, 20, 6, alpha(P.surf, 0.92));
    lab(c, k, `${fmt(m, 1)} м · туда и обратно ${fmt(m * 6.67, 0)} нс`, 120, 30, { color: P.ink, weight: 700, px: 10.5 });
  } });

  /* ---------- 6. Тактильный датчик GelSight: камера снимает вдавленный гель ---------- */
  const T_GEL = 7;
  function gelState(t) {
    const { seg, ease } = Anim.kit, u = ((t % T_GEL) + T_GEL) % T_GEL;
    const press = ease(seg(u, 0.4, 1.6)) * (1 - ease(seg(u, 4.6, 5.6)));
    const shear = ease(seg(u, 2.2, 3.6)) * (1 - ease(seg(u, 4.4, 5)));
    const lift = 1 - ease(seg(u, 0, 1.0)) + ease(seg(u, 4.8, 6.2));
    return { press, shear, lift: Math.min(1, lift) };
  }
  Anim.add('gel', { W, H, start: 3.2, draw(c, k, t, P, A) {
    const { rect, line, circle, lab, alpha } = A;
    const s = gelState(t), R = 24, top = 104, xo = 128 + 12 * s.shear, depth = 13 * s.press;
    const yo = top - R + depth - 46 * s.lift * (1 - s.press);
    const dip = (x) => { const dx = x - xo; if (Math.abs(dx) >= R) return 0; return Math.max(0, (yo + Math.sqrt(R * R - dx * dx)) - top); };
    // основание, свет и камера
    rect(c, 46, 140, 164, 12, 3, alpha(P.out, 0.12), P.ink3, 1.4);
    for (const lx of [40, 216]) { circle(c, lx, 146, 9, alpha(P.mot, 0.3)); circle(c, lx, 146, 4.5, P.mot); }
    line(c, [[128, 182], [70, 152]], P.line, 1, [3, 3]); line(c, [[128, 182], [186, 152]], P.line, 1, [3, 3]);
    rect(c, 112, 182, 32, 22, 4, P.surf, P.ink2, 2); circle(c, 128, 182, 6, P.outS, P.out, 2);
    // гель с поверхностью, которая повторяет шарик
    c.beginPath(); c.moveTo(50, 140);
    for (let x = 50; x <= 206; x += 2) c.lineTo(x, top + dip(x));
    c.lineTo(206, 140); c.closePath(); c.fillStyle = alpha(P.spr, 0.22); c.fill();
    const surf = []; for (let x = 50; x <= 206; x += 2) surf.push([x, top + dip(x)]);
    line(c, surf, P.ink2, 3);
    // метки в геле сдвигаются вместе с ним
    for (let x = 58; x <= 198; x += 14) {
      const g = Math.exp(-(((x - xo) / 20) ** 2)), mx = x + 10 * s.shear * g * s.press, my = 116 + 0.8 * dip(x);
      circle(c, mx, my, 2.2, P.ink2);
    }
    circle(c, xo, yo, R, P.surf2, P.ink2, 2);
    lab(c, k, 'шарик', xo, yo, { color: P.ink2, px: 10.5 });
    lab(c, k, 'гель и плёнка', 28, 120, { color: P.spr, px: 10.5, align: 'left' });
    lab(c, k, 'камера', 160, 196, { color: P.out, px: 10.5, align: 'left' });
    // кадр камеры: отпечаток в боковом свете и метки
    const ix = 246, iy = 40, iw = 104, cx = ix + iw / 2 + 10 * s.shear * s.press, cy = iy + iw / 2;
    rect(c, ix, iy, iw, iw, 6, P.surf2, P.ink3, 1.4);
    c.save(); c.beginPath(); c.roundRect(ix, iy, iw, iw, 6); c.clip();
    const ra = Math.sqrt(2 * R * Math.max(0, depth)) * 2.1;
    if (ra > 1) {
      const g = c.createLinearGradient(cx - ra, cy - ra, cx + ra, cy + ra);
      g.addColorStop(0, alpha(P.surf, 0.95)); g.addColorStop(1, alpha(P.ink2, 0.55));
      c.beginPath(); c.arc(cx, cy, ra, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const x0 = ix + 12 + i * 16, y0 = iy + 12 + j * 16, g = Math.exp(-((Math.hypot(x0 - (ix + iw / 2), y0 - cy) / 26) ** 2));
      const sx = 10 * s.shear * s.press * g;
      if (sx > 1.2) line(c, [[x0, y0], [x0 + sx, y0]], P.mot, 1.4);
      circle(c, x0 + sx, y0, 2, P.ink2);
    }
    c.restore();
    lab(c, k, 'кадр камеры', ix + iw / 2, iy - 12, { color: P.ink3, px: 10.5 });
    lab(c, k, s.shear * s.press > 0.3 ? 'метки сместились' : s.press > 0.3 ? 'тени дают рельеф' : 'касания нет', ix + iw / 2, iy + iw + 16, { color: P.ink2, px: 10.5 });
  } });
})();
