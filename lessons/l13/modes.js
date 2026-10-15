/* =====================================================================
   modes.js — анимированные схемы урока 1.3 на общем движке shared/anim.js.
   1) 'sources5' — где в данных берутся несколько стратегий: пять мини-сцен
      (разные операторы, порядок подзадач, паузы, разброс у одного оператора,
      оператор видит больше, чем камера).
   2) 'modes4'  — четыре способа выдать действие на одних и тех же данных:
      регрессия, смесь гауссиан, бины, диффузия.
   3) 'modes4b' — ещё четыре: токены по очереди, кластеры и поправка,
      энергия, латентный стиль.
   4) 'chunk'   — что такое пачка действий: один вызов политики даёт несколько
      действий вперёд, на стыке — новый вызов.
   5) 'seams2'  — два способа удержать сторону на стыке пачек: сглаживание
      и согласование, рядом.
   Серым — данные (демонстрации), оранжевым — то, что выдаёт политика,
   бирюзовым и фиолетовым — пачки влево и вправо (как в лабораториях урока).
   ===================================================================== */
'use strict';
(() => {
  const hash = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const sideCol = (P) => ({ l: HeroKit.css('--side-l'), r: HeroKit.css('--side-r') });

  /* ===================== 1. Где в данных несколько стратегий ===================== */
  const SRC = [
    { key: 'ops', title: 'Разные операторы', cap: 'два человека — два пути к чашке' },
    { key: 'order', title: 'Порядок подзадач', cap: 'те же три дела в другом порядке' },
    { key: 'pause', title: 'Паузы', cap: 'в одном месте то движение, то остановка' },
    { key: 'spread', title: 'Разброс у одного оператора', cap: 'место передачи каждый раз другое' },
    { key: 'hidden', title: 'Оператор видит больше камеры', cap: 'кадр один и тот же, действия разные' },
  ];
  /** Захват сверху: две губки и «ладонь». */
  function gripper(c, x, y, ang, col, s) {
    c.save(); c.translate(x, y); c.rotate(ang); s = s || 1;
    c.strokeStyle = col; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-7 * s, 0); c.lineTo(7 * s, 0); c.moveTo(-6 * s, 0); c.lineTo(-6 * s, -9 * s); c.moveTo(6 * s, 0); c.lineTo(6 * s, -9 * s); c.stroke();
    c.beginPath(); c.arc(0, 5 * s, 3.5 * s, 0, 7); c.fillStyle = col; c.fill();
    c.restore();
  }
  function cup(c, x, y, P, A, col) { A.circle(c, x, y, 7, P.surf, col || P.ink2, 1.6); A.circle(c, x, y, 3, null, col || P.ink2, 1.2); c.beginPath(); c.arc(x + 8.5, y, 3.2, Math.PI * 1.5, Math.PI * 0.5); c.strokeStyle = col || P.ink2; c.lineWidth = 1.4; c.stroke(); }
  function srcPanel(c, k, t, P, A, ox, oy, pw, ph, p) {
    const { line, circle, rect, lab, alpha, ease, seg, lerp } = A, S = sideCol(P);
    lab(c, k, p.title, ox + pw / 2, oy + 14, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf });
    const x0 = ox + 14, y0 = oy + 28, x1 = ox + pw - 14, y1 = oy + ph - 30, cx = (x0 + x1) / 2;
    rect(c, x0, y0, x1 - x0, y1 - y0, 8, P.surf2, P.grid, 1);
    lab(c, k, p.cap, ox + pw / 2, oy + ph - 13, { px: 10.5, weight: 600, color: P.ink2, halo: false });
    if (p.key === 'ops') {
      const sx = cx, sy = y1 - 14, ty = y0 + 22, T = 4.4, u = ((t % T) + T) % T, who = u < T / 2 ? 0 : 1, s = ease(seg(u - who * T / 2, 0.2, 1.8));
      circle(c, cx, (sy + ty) / 2, 12, alpha(P.ink3, 0.25), P.ink3, 1.2); lab(c, k, 'миска', cx, (sy + ty) / 2, { px: 8.5, color: P.ink3, halo: false });
      cup(c, cx, ty, P, A);
      const path = (side, v) => [sx + side * 46 * Math.sin(Math.PI * v), sy + (ty - sy) * v];
      for (const [side, col] of [[-1, P.out], [1, P.mot]]) { const pts = []; for (let i = 0; i <= 24; i++) pts.push(path(side, i / 24)); line(c, pts, alpha(col, 0.5), 1.6, [4, 4]); }
      const side = who ? 1 : -1, col = who ? P.mot : P.out, q = path(side, s);
      gripper(c, q[0], q[1], side * 0.35 * Math.sin(Math.PI * s), col, 0.9);
      lab(c, k, 'оператор А', x0 + 6, y1 - 10, { px: 9.5, align: 'left', color: P.out, halo: false, weight: who ? 500 : 750 });
      lab(c, k, 'оператор Б', x1 - 6, y1 - 10, { px: 9.5, align: 'right', color: P.mot, halo: false, weight: who ? 750 : 500 });
    } else if (p.key === 'order') {
      const spots = [[x0 + 36, y0 + 30, 'плита'], [x1 - 36, y0 + 26, 'чайник'], [cx + 10, y1 - 26, 'свет']];
      const orders = [[0, 1, 2], [1, 0, 2]], T = 6.4, u = ((t % T) + T) % T, d = u < T / 2 ? 0 : 1, v = u - d * T / 2, ord = orders[d];
      spots.forEach(([x, y, n]) => { rect(c, x - 11, y - 8, 22, 16, 3, P.surf, P.ink3, 1.2); lab(c, k, n, x, y + 16, { px: 8.5, color: P.ink3, halo: false }); });
      const start = [cx - 20, y1 - 12], col = d ? P.mot : P.out, pts = [start].concat(ord.map((i) => [spots[i][0], spots[i][1]]));
      for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[i + 1], s = ease(seg(v, 0.3 + i * 0.9, 1.0 + i * 0.9)); if (s > 0) line(c, [a, [lerp(a[0], b[0], s), lerp(a[1], b[1], s)]], alpha(col, 0.8), 2); if (s >= 1) lab(c, k, String(i + 1), b[0], b[1], { px: 9.5, weight: 750, color: col, haloColor: P.surf }); }
      const i = Math.min(2, Math.max(0, Math.floor((v - 0.3) / 0.9))), s = ease(seg(v, 0.3 + i * 0.9, 1.0 + i * 0.9)), a = pts[i], b = pts[i + 1];
      gripper(c, lerp(a[0], b[0], s), lerp(a[1], b[1], s), 0, col, 0.8);
      lab(c, k, d ? 'демонстрация 2' : 'демонстрация 1', x0 + 6, y1 - 10, { px: 9.5, align: 'left', color: col, halo: false, weight: 700 });
    } else if (p.key === 'pause') {
      const sx = x0 + 22, ex = x1 - 26, y = (y0 + y1) / 2 - 6, mx = (sx + ex) / 2, T = 4.4, u = ((t % T) + T) % T;
      cup(c, ex, y, P, A);
      line(c, [[sx, y], [ex - 12, y]], alpha(P.ink3, 0.5), 1.4, [4, 4]);
      const s1 = ease(seg(u, 0.1, 1.5)), s2 = ease(seg(u, 2.8, 4.2)), x = u < 2.8 ? lerp(sx, mx, s1) : lerp(mx, ex - 14, s2), paused = u >= 1.5 && u < 2.8;
      gripper(c, x, y, Math.PI / 2, paused ? P.ink2 : P.mot, 0.9);
      if (paused) { lab(c, k, 'стоп', mx, y - 18, { px: 10, weight: 750, color: P.ink2, haloColor: P.surf2 }); circle(c, mx, y, 14 + 3 * Math.sin(u * 6), null, alpha(P.ink2, 0.4), 1.2); }
      // лента времени: движение и пауза
      const ty = y1 - 12, tx0 = x0 + 12, tx1 = x1 - 12, w = tx1 - tx0;
      rect(c, tx0, ty - 4, w, 8, 3, alpha(P.ink3, 0.15), null);
      rect(c, tx0, ty - 4, w * Math.min(u, 1.5) / T, 8, 3, P.mot, null);
      if (u > 1.5) rect(c, tx0 + w * 1.5 / T, ty - 4, w * (Math.min(u, 2.8) - 1.5) / T, 8, 3, alpha(P.ink2, 0.55), null);
      if (u > 2.8) rect(c, tx0 + w * 2.8 / T, ty - 4, w * (u - 2.8) / T, 8, 3, P.mot, null);
      lab(c, k, 'время записи', tx0, ty - 11, { px: 8.5, align: 'left', color: P.ink3, halo: false });
    } else if (p.key === 'spread') {
      const T = 3.2, cyc = Math.floor(t / T), u = ((t % T) + T) % T, y = (y0 + y1) / 2 - 2;
      const hx = cx + (hash(cyc) - 0.5) * 60, hy = y + (hash(cyc + 33) - 0.5) * 34;
      for (let i = 1; i <= 6; i++) circle(c, cx + (hash(cyc - i) - 0.5) * 60, y + (hash(cyc - i + 33) - 0.5) * 34, 3, alpha(P.ink3, 0.35), null);
      const s1 = ease(seg(u, 0.1, 1.3)), s2 = ease(seg(u, 1.8, 3.0)), lx = lerp(x0 + 18, hx - 9, s1), rx = lerp(x1 - 18, hx + 9, s1) + (u > 1.8 ? (x1 - 18 - hx - 9) * s2 : 0);
      gripper(c, lx, y + (u > 1.8 ? 0 : 0), Math.PI / 2, S.l, 0.9); gripper(c, rx, hy + (y - hy) * (u > 1.8 ? s2 : 1 - s1), -Math.PI / 2, S.r, 0.9);
      const obx = u < 1.8 ? lx + 8 : rx - 8, oby = u < 1.8 ? lerp(y, hy, s1) : lerp(hy, y, s2);
      rect(c, obx - 5, oby - 3, 10, 6, 2, P.mot, null);
      if (u > 1.3 && u < 1.8) lab(c, k, 'передача', hx, hy - 18, { px: 9.5, weight: 750, color: P.ink2, haloColor: P.surf2 });
      lab(c, k, 'левая рука', x0 + 6, y1 - 10, { px: 9.5, align: 'left', color: S.l, halo: false }); lab(c, k, 'правая рука', x1 - 6, y1 - 10, { px: 9.5, align: 'right', color: S.r, halo: false });
    } else {
      const T = 6, u = ((t % T) + T) % T, withObs = u < T / 2, s = ease(seg(withObs ? u : u - T / 2, 0.3, 2.4));
      const sx = cx - 10, sy = y1 - 14, ty = y0 + 22, fx0 = x0 + 22, fx1 = x1 - 48, fy0 = y0 + 8, fy1 = y1 - 24;
      rect(c, fx0, fy0, fx1 - fx0, fy1 - fy0, 4, alpha(P.out, 0.06), P.out, 1.2); lab(c, k, 'кадр камеры', fx0 + 4, fy0 + 8, { px: 8.5, align: 'left', color: P.out, halo: false });
      cup(c, sx, ty, P, A);
      if (withObs) { circle(c, x1 - 26, (sy + ty) / 2 + 6, 10, alpha(P.bad, 0.2), P.bad, 1.4); lab(c, k, 'горячее', x1 - 26, (sy + ty) / 2 + 22, { px: 8.5, color: P.bad, halo: false }); }
      const path = (v) => [sx - (withObs ? 34 : 0) * Math.sin(Math.PI * v), sy + (ty - sy) * v];
      const pts = []; for (let i = 0; i <= 24; i++) if (i / 24 <= s) pts.push(path(i / 24)); if (pts.length > 1) line(c, pts, withObs ? P.mot : P.out, 2);
      const q = path(s); gripper(c, q[0], q[1], 0, withObs ? P.mot : P.out, 0.9);
      lab(c, k, withObs ? 'за кадром горячее — объезд' : 'за кадром пусто — прямо', x0 + 6, y1 - 10, { px: 9.5, align: 'left', color: withObs ? P.mot : P.out, halo: false, weight: 700 });
    }
  }
  function drawSources(cols) {
    return (c, k, t, P, A) => {
      const pw = cols === 3 ? 240 : 360, ph = cols === 3 ? 190 : 170;
      SRC.forEach((p, i) => {
        const row = Math.floor(i / cols), n = Math.min(cols, SRC.length - row * cols), col = i % cols;
        const ox = (col + (cols - n) / 2) * pw, oy = row * ph;
        srcPanel(c, k, t + i * 0.7, P, A, ox, oy, pw, ph, p);
      });
    };
  }
  Anim.add('sources5', { W: 720, H: 380, start: 1.1, narrowAt: 600, draw: drawSources(3), narrow: { W: 360, H: 850, draw: drawSources(1) } });

  /* ===================== 2 и 3. Способы выдать действие ===================== */
  const MU = 0.62, SD = 0.16, DMAX = 1.35, NB = 12, NP = 12, T = 4.8, PICK = 1.6;
  const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const dens = (x) => 0.5 * gauss(x, -MU, SD) + 0.5 * gauss(x, MU, SD);
  const BW = 2 / NB, BIN = Array.from({ length: NB }, (_, i) => dens(-1 + BW * (i + 0.5)));
  const BSUM = BIN.reduce((a, b) => a + b, 0);
  function pickBin(r) { let acc = 0; for (let i = 0; i < NB; i++) { acc += BIN[i] / BSUM; if (r <= acc) return i; } return NB - 1; }
  /** Общая часть панели: заголовок, серое распределение демонстраций, ось «сдвиг вбок» с чайником посередине. */
  function axisPanel(c, k, P, A, ox, oy, pw, ph, p, top, base) {
    const { line, circle, lab, alpha } = A;
    const x0 = ox + 16, x1 = ox + pw - 16;
    const X = (v) => x0 + (v + 1) / 2 * (x1 - x0), Y = (d) => base - d / DMAX * (base - top);
    lab(c, k, p.title, ox + pw / 2, oy + 18, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf });
    c.beginPath(); c.moveTo(X(-1), base);
    for (let i = 0; i <= 80; i++) { const v = -1 + 2 * i / 80; c.lineTo(X(v), Y(dens(v))); }
    c.lineTo(X(1), base); c.closePath(); c.fillStyle = alpha(P.ink3, 0.16); c.fill();
    c.beginPath(); for (let i = 0; i <= 80; i++) { const v = -1 + 2 * i / 80; i ? c.lineTo(X(v), Y(dens(v))) : c.moveTo(X(v), Y(dens(v))); }
    c.strokeStyle = alpha(P.ink3, 0.55); c.lineWidth = 1.2; c.stroke();
    line(c, [[x0, base], [x1, base]], P.line, 1.2);
    circle(c, X(0), base + 12, 6.5, P.surf, P.ink3, 1.3);
    lab(c, k, 'чайник', X(0), base + 27, { px: 9.5, color: P.ink3, halo: false });
    lab(c, k, '← слева', x0, base + 12, { px: 9.5, color: P.ink3, align: 'left', halo: false });
    lab(c, k, 'справа →', x1, base + 12, { px: 9.5, color: P.ink3, align: 'right', halo: false });
    const narrow = c.canvas.dataset.layout === 'n';
    lab(c, k, narrow && p.capS ? p.capS : p.cap, ox + pw / 2, oy + ph - 30, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    lab(c, k, narrow && p.subS ? p.subS : p.sub, ox + pw / 2, oy + ph - 14, { px: 10, weight: p.bad ? 650 : 500, color: p.bad ? P.bad : P.ink3, halo: false });
    const dot = (v, y, a) => circle(c, X(v), y, 4.6, alpha(P.mot, a == null ? 1 : a), P.surf, 1.6);
    return { X, Y, x0, x1, dot };
  }
  const PANELS = [
    { key: 'reg', title: 'Регрессия', cap: 'одно действие — среднее', sub: 'попадает в чайник', bad: true },
    { key: 'mix', title: 'Смесь гауссиан', cap: 'по колоколу на моду', sub: 'сэмпл из одного колокола', subS: 'сэмпл из колокола' },
    { key: 'bins', title: 'Корзины', cap: 'вероятность интервала', sub: 'сэмпл из одного интервала' },
    { key: 'diff', title: 'Диффузия', cap: 'шум → действие по шагам', sub: 'сэмпл на одной из мод', capS: 'шум → действие' },
  ];
  function panel(c, k, t, P, A, ox, oy, pw, ph, p) {
    const { line, circle, rect, lab, alpha, ease, seg, lerp } = A, base = oy + 150, top = oy + 42;
    const { X, Y, x0, x1, dot } = axisPanel(c, k, P, A, ox, oy, pw, ph, p, top, base);
    const u = ((t % T) + T) % T, n = Math.floor(t / PICK), ph2 = ((t % PICK) + PICK) % PICK / PICK;
    if (p.key === 'reg') {
      line(c, [[X(0), base], [X(0), top + 4]], P.mot, 2.4);
      lab(c, k, 'среднее', X(0), top - 4, { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf });
      dot(0, base);
    } else if (p.key === 'mix') {
      for (const m of [-MU, MU]) {
        c.beginPath(); for (let i = 0; i <= 60; i++) { const v = m - 0.5 + i / 60; const y = Y(0.5 * gauss(v, m, SD + 0.01)); i ? c.lineTo(X(v), y) : c.moveTo(X(v), y); }
        c.strokeStyle = P.mot; c.lineWidth = 2; c.stroke();
      }
      const m = hash(n) < 0.5 ? -MU : MU, v = m + (hash(n + 50) - 0.5) * 0.18;
      dot(v, lerp(Y(0.5 * gauss(v, m, SD)), base, ease(seg(ph2, 0, 0.45))), seg(ph2, 0.85, 1) > 0 ? 1 - seg(ph2, 0.85, 1) : 1);
    } else if (p.key === 'bins') {
      const sel = pickBin(hash(n + 7)), bw = (x1 - x0) / NB;
      for (let i = 0; i < NB; i++) {
        const h = BIN[i] / DMAX * (base - top), on = i === sel;
        rect(c, x0 + i * bw + 1, base - h, bw - 2, h, 2, alpha(P.mot, on ? 0.75 : 0.28), alpha(P.mot, on ? 1 : 0.6), on ? 1.6 : 1);
      }
      const v = -1 + BW * (sel + 0.5);
      dot(v, lerp(base - BIN[sel] / DMAX * (base - top), base, ease(seg(ph2, 0, 0.45))), seg(ph2, 0.85, 1) > 0 ? 1 - seg(ph2, 0.85, 1) : 1);
    } else {
      const cyc = Math.floor(t / T), s = ease(seg(u, 0.5, 3.6)), fade = 1 - seg(u, 4.3, 4.8);
      for (let i = 0; i < NP; i++) {
        const xs = (hash(i + cyc * 31) - 0.5) * 2, ys = top + 6 + hash(i + 90 + cyc * 17) * (base - top - 20);
        const xt = (i % 2 ? MU : -MU) + (hash(i + 200 + cyc) - 0.5) * 0.22;
        circle(c, X(lerp(xs, xt, s)), lerp(ys, base - 5, s), 3.4, alpha(P.mot, 0.85 * fade), null);
      }
      lab(c, k, `шаг ${Math.round(s * 10)} из 10`, x1, top - 4, { px: 9.5, color: P.ink3, align: 'right', halo: false });
    }
  }
  const PANELS_B = [
    { key: 'tok', title: 'Токены по очереди', cap: 'действие — цепочка токенов', sub: 'каждый следующий видит прошлые', capS: 'цепочка токенов', subS: 'каждый видит прошлые' },
    { key: 'clu', title: 'Кластеры и поправка', cap: 'центр кластера плюс сдвиг', sub: 'число центров задано заранее', capS: 'центр плюс сдвиг', subS: 'число центров задано' },
    { key: 'en', title: 'Энергия', cap: 'действие — минимум энергии', sub: 'поиск минимума на каждом шаге', capS: 'минимум энергии', subS: 'поиск на каждом шаге' },
    { key: 'cvae', title: 'Латентный стиль', cap: 'при обучении z кодирует манеру', sub: 'на тесте z = 0: одно и то же', capS: 'z кодирует манеру', subS: 'на тесте z = 0' },
  ];
  function panelB(c, k, t, P, A, ox, oy, pw, ph, p) {
    const { line, circle, rect, lab, alpha, ease, seg, lerp, arrow } = A, base = oy + 172, top = oy + 76;
    const { X, Y, x0, x1, dot } = axisPanel(c, k, P, A, ox, oy, pw, ph, p, top, base);
    const TB = 3.6, n = Math.floor(t / TB), u = ((t % TB) + TB) % TB;
    if (p.key === 'tok') {
      const side = hash(n + 3) < 0.5 ? -1 : 1, bw = 34, bx = ox + pw / 2 - 1.5 * bw - 6, by = oy + 44;
      lab(c, k, c.canvas.dataset.layout === 'n' ? 'пачка из 3 шагов' : 'пачка из 3 шагов — три токена', ox + pw / 2, oy + 33, { px: 9, color: P.ink3, halo: false });
      for (let i = 0; i < 3; i++) {
        const s = seg(u, 0.3 + i * 1.0, 0.7 + i * 1.0), x = bx + i * (bw + 6), on = s > 0;
        rect(c, x, by, bw, 18, 4, on ? alpha(P.mot, 0.15 + 0.6 * s) : P.surf, on ? P.mot : P.line, 1.2);
        lab(c, k, on && s >= 1 ? `т${i + 1}` : '?', x + bw / 2, by + 9, { px: 9.5, weight: 700, color: on && s >= 1 ? P.surf : P.ink3, halo: false });
        if (i < 2) arrow(c, x + bw + 1, by + 9, x + bw + 5, by + 9, P.ink3, 1.2, 4);
        if (s >= 1) { const v = side * (MU + (hash(n * 7 + i) - 0.5) * 0.2); line(c, [[x + bw / 2, by + 18], [X(v), base - 6]], alpha(P.mot, 0.35), 1, [3, 3]); dot(v, base); }
      }
    } else if (p.key === 'clu') {
      const sel = hash(n + 11) < 0.5 ? -1 : 1, off = (hash(n + 21) - 0.5) * 0.26;
      for (const m of [-MU, MU]) { const on = m * sel > 0 && u > 0.4; c.beginPath(); c.moveTo(X(m), base - 2); c.lineTo(X(m) - 6, base - 14); c.lineTo(X(m) + 6, base - 14); c.closePath(); c.fillStyle = on ? P.mot : alpha(P.mot, 0.45); c.fill(); }
      lab(c, k, 'центры k = 2', ox + pw / 2, top - 8, { px: 9.5, color: P.ink3, halo: false });
      const s = ease(seg(u, 1.2, 2.0)), v = sel * MU + off * s;
      if (u > 1.0) { arrow(c, X(sel * MU), base - 22, X(sel * MU + off * Math.max(s, 0.01)) + (off > 0 ? 2 : -2), base - 22, P.mot, 1.6, 5); lab(c, k, 'сдвиг', X(sel * MU), base - 32, { px: 8.5, color: P.mot, halo: false }); }
      if (u > 0.4) dot(v, base, u > 3.3 ? 1 - seg(u, 3.3, 3.6) : 1);
    } else if (p.key === 'en') {
      const E = (v) => Math.max(0, Math.min(2.2, -Math.log(dens(v) + 1e-9) + 0.22)), yE = (v) => base - 8 - (2.2 - E(v)) / 2.2 * (base - top - 4);
      c.beginPath(); for (let i = 0; i <= 80; i++) { const v = -1 + 2 * i / 80; i ? c.lineTo(X(v), yE(v)) : c.moveTo(X(v), yE(v)); } c.strokeStyle = P.mot; c.lineWidth = 2; c.stroke();
      lab(c, k, 'E(a)', x1 - 2, top - 6, { px: 9.5, align: 'right', color: P.mot, halo: false });
      const s = ease(seg(u, 0.2, 2.4)); let best = null;
      for (let i = 0; i < 5; i++) { const v0 = (hash(n * 5 + i) - 0.5) * 1.9, vt = v0 < 0 ? -MU : MU, v = lerp(v0, vt, s); circle(c, X(v), yE(v), 3.2, alpha(P.mot, 0.8), P.surf, 1); if (best == null || E(v) < E(best)) best = v; }
      if (u > 2.6) dot(best, base, u > 3.3 ? 1 - seg(u, 3.3, 3.6) : 1);
    } else {
      const zx0 = ox + 30, zx1 = ox + pw - 30, zy = oy + 40, train = u < TB * 0.55, z = train ? Math.sin(u * 2.6) : 0;
      line(c, [[zx0, zy], [zx1, zy]], P.line, 2); lab(c, k, 'z', zx0 - 10, zy, { px: 10, weight: 700, color: P.ink2, halo: false });
      lab(c, k, train ? 'обучение: z меняется' : 'тест: z = 0', ox + pw / 2, zy - 12, { px: 9.5, weight: 650, color: train ? P.ink3 : P.mot, halo: false });
      const zx = lerp(zx0, zx1, (z + 1) / 2); circle(c, zx, zy, 5, train ? P.ink2 : P.mot, P.surf, 1.5);
      const dec = (zz) => MU * Math.tanh(4 * zz + 1.2), v = dec(z);
      line(c, [[zx, zy + 6], [X(v), base - 6]], alpha(P.mot, 0.35), 1, [3, 3]);
      dot(v, base);
    }
  }
  function draw(cols, panels, fn, pw, ph) {
    return (c, k, t, P, A) => {
      panels.forEach((p, i) => {
        const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph;
        if (i % cols) A.line(c, [[ox, oy + 30], [ox, oy + ph - 40]], P.grid, 1);
        fn(c, k, t, P, A, ox, oy, pw, ph, p);
      });
    };
  }
  Anim.add('modes4', { W: 720, H: 230, start: 2.4, narrowAt: 600, draw: draw(4, PANELS, panel, 180, 230), narrow: { W: 360, H: 460, draw: draw(2, PANELS, panel, 180, 230) } });
  Anim.add('modes4b', { W: 720, H: 250, start: 1.3, narrowAt: 600, draw: draw(4, PANELS_B, panelB, 180, 250), narrow: { W: 360, H: 500, draw: draw(2, PANELS_B, panelB, 180, 250) } });

  /* ===================== 4. Пачка действий ===================== */
  const CH = { H: 8, N: 3, T: 24, call: 0.45, step: 0.13 };
  const bumpL = (t) => { const u = Math.abs(t - 12) / 10; return u <= 0.3 ? 1 : u >= 1 ? 0 : (1 - (u - 0.3) / 0.7) ** 2 * (3 - 2 * (1 - (u - 0.3) / 0.7)); };
  function drawChunk(L) {
    return (c, k, t, P, A) => {
      const { line, circle, rect, lab, alpha, ease, seg, lerp, arrow } = A;
      const per = CH.call + CH.H * CH.step, TT = CH.N * per + 1.0, u = ((t % TT) + TT) % TT;
      const xs = (s) => L.ax0 + s / CH.T * (L.ax1 - L.ax0), ys = (v) => L.ay - v * L.sc;
      // ось времени
      line(c, [[L.ax0, L.ay], [L.ax1 + 8, L.ay]], P.line, 1.4);
      for (let s = 0; s <= CH.T; s++) line(c, [[xs(s), L.ay - (s % 8 ? 3 : 6)], [xs(s), L.ay + (s % 8 ? 3 : 6)]], P.ink3, 1);
      for (const s of [0, 8, 16, 24]) lab(c, k, String(s), xs(s), L.ay + 16, { px: 10, mono: true, color: P.ink3, halo: false });
      lab(c, k, 'шаги', L.ax1 + 14, L.ay + 16, { px: 10, mono: true, color: P.ink3, align: 'left', halo: false });
      lab(c, k, 'сдвиг вбок, объезд', L.ax0 - 4, L.ay - 52 * L.sc - 8, { px: 10, align: 'left', color: P.ink3, halo: false });
      // политика
      const ci = Math.min(CH.N - 1, Math.floor(u / per)), uc = u - ci * per, calling = uc < CH.call && u < CH.N * per;
      rect(c, L.bx, L.by, L.bw, L.bh, 10, calling ? alpha(P.mot, 0.18) : P.surf, calling ? P.mot : P.ink2, calling ? 2.4 : 1.6);
      lab(c, k, 'политика', L.bx + L.bw / 2, L.by + L.bh / 2 - 7, { px: 12, weight: 700, color: P.ink, halo: false });
      lab(c, k, u < CH.N * per ? `вызов ${ci + 1}` : 'вызовов: 3', L.bx + L.bw / 2, L.by + L.bh / 2 + 10, { px: 10, color: calling ? P.mot : P.ink3, halo: false });
      for (let j = 0; j <= ci; j++) {
        const t0 = j * CH.H, s = j < ci ? 1 : ease(seg(uc, 0, CH.call)), pts = [];
        if (j < ci || uc < per) for (let i = 0; i < CH.H; i++) { const st = t0 + i + 1, v = 34 * bumpL(st); pts.push([lerp(L.bx + L.bw / 2, xs(st), s), lerp(L.by + L.bh, ys(v), s)]); }
        if (!pts.length) continue;
        if (s >= 1) line(c, [[xs(t0), ys(34 * bumpL(t0))]].concat(pts), alpha(P.mot, 0.5), 1.4);
        pts.forEach((q) => circle(c, q[0], q[1], 3.2, P.mot, P.surf, 1));
        if (s >= 1) { lab(c, k, `пачка ${j + 1}: ${CH.H} действий`, xs(t0 + CH.H / 2), ys(34) - 16, { px: 9.5, weight: 650, color: P.mot, haloColor: P.surf }); }
        if (j > 0 && (j < ci || s >= 1)) { line(c, [[xs(t0), L.ay - 52 * L.sc], [xs(t0), L.ay + 10]], P.ink3, 1.2, [3, 3]); lab(c, k, 'стык', xs(t0), L.ay - 52 * L.sc - 8, { px: 9.5, weight: 650, color: P.ink2, haloColor: P.surf }); }
      }
      // Ада исполняет действия по очереди
      const done = u >= CH.N * per ? CH.N * CH.H : ci * CH.H + Math.max(0, Math.floor((uc - CH.call) / CH.step));
      const sa = Math.min(done, CH.N * CH.H), ex = [];
      for (let s = 0; s <= sa; s++) ex.push([xs(s), ys(34 * bumpL(s))]);
      if (ex.length > 1) line(c, ex, P.ink, 2.6);
      const q = ex[ex.length - 1]; circle(c, q[0], q[1], 7, P.surf, P.ink, 2.2); circle(c, q[0] + 2.5, q[1] - 2, 1.3, P.mot, null); circle(c, q[0] + 2.5, q[1] + 2, 1.3, P.mot, null);
      lab(c, k, 'Ада', q[0], q[1] + 15, { px: 9.5, weight: 650, color: P.ink, haloColor: P.surf });
    };
  }
  Anim.add('chunk', {
    W: 720, H: 200, start: 0.3, narrowAt: 600,
    draw: drawChunk({ bx: 24, by: 70, bw: 110, bh: 60, ax0: 190, ax1: 660, ay: 160, sc: 1.6 }),
    narrow: { W: 360, H: 290, draw: drawChunk({ bx: 125, by: 16, bw: 110, bh: 54, ax0: 30, ax1: 300, ay: 250, sc: 1.6 }) },
  });

  /* ===================== 5. Два способа на стыке ===================== */
  const SM = { T: 24, len: 16, every: 8, A: 56, tk: 13 };
  const smProf = (t) => { const u = Math.abs(t - SM.tk); return u <= 5 ? 1 : u >= 15 ? 0 : (1 - (u - 5) / 10) ** 2 * (3 - 2 * (1 - (u - 5) / 10)); };
  function smChunk(t0, x0, side) { const c = []; for (let j = 0; j < SM.len; j++) { const t = t0 + j + 1, goal = side * SM.A * smProf(t), bl = Math.min(1, (j + 1) / 4); c.push(x0 + (goal - x0) * bl); } return c; }
  function seamPanel(c, k, t, P, A, ox, oy, pw, ph, mode) {
    const { line, circle, rect, lab, alpha, ease, seg, lerp } = A, S = sideCol(P);
    const bx0 = ox + 34, bx1 = ox + pw - 14, cy = oy + 130, sc = 0.95, TT = 6.4, u = ((t % TT) + TT) % TT;
    const xs = (s) => bx0 + s / SM.T * (bx1 - bx0), ys = (v) => cy - v * sc;
    lab(c, k, mode === 'te' ? 'Сглаживание' : 'Согласование', ox + pw / 2, oy + 16, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf });
    for (const v of [-56, 0, 56]) { line(c, [[bx0, ys(v)], [bx1, ys(v)]], P.grid, 1); lab(c, k, String(v).replace('-', '−'), bx0 - 6, ys(v), { px: 9.5, mono: true, align: 'right', color: P.ink3, halo: false }); }
    for (const s of [0, 8, 16, 24]) lab(c, k, String(s), xs(s), oy + ph - 36, { px: 9.5, mono: true, color: P.ink3, halo: false });
    lab(c, k, 'справа', bx0 + 4, ys(68), { px: 9, align: 'left', color: P.ink3, halo: false }); lab(c, k, 'слева', bx0 + 4, ys(-68), { px: 9, align: 'left', color: P.ink3, halo: false });
    const kx0 = xs(SM.tk - 3), kx1 = xs(SM.tk + 3), ky0 = ys(31), ky1 = ys(-31);
    c.beginPath(); c.rect(kx0, ky0, kx1 - kx0, ky1 - ky0); HeroKit.hatch(c, kx0, ky0, kx1, ky1, P.ink3, 6, 1); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.strokeRect(kx0, ky0, kx1 - kx0, ky1 - ky0);
    lab(c, k, 'чайник', (kx0 + kx1) / 2, ky0 - 8, { px: 9.5, weight: 650, color: P.ink2, haloColor: P.surf });
    // пачка 1 (влево), на стыке — пачка 2 (сглаживание: вправо; согласование: из четырёх сэмплов ближайшая к пачке 1)
    const c1 = smChunk(0, 0, -1), p1 = seg(u, 0.2, 1.4), x8 = c1[7];
    const chunkPts = (t0, x0, ch, upto) => { const pts = [[xs(t0), ys(x0)]]; for (let j = 0; j < ch.length && j < upto; j++) pts.push([xs(t0 + j + 1), ys(ch[j])]); return pts; };
    const cands = [[1, 1], [1, 0.85], [-1, 1], [-1, 0.88]].map(([sd, amp]) => ({ side: sd, c: smChunk(8, x8, sd).map((v) => v * amp) }));
    const c2 = mode === 'te' ? cands[0] : cands[2], p2 = seg(u, 1.6, 2.3), p3 = seg(u, 2.5, 4.6);
    if (p1 > 0) { line(c, chunkPts(0, 0, c1, Math.ceil(16 * ease(p1))), S.l, 1.6); if (p1 >= 1) lab(c, k, 'пачка 1', xs(5), ys(c1[4]) + 12, { px: 9.5, weight: 650, color: S.l, haloColor: P.surf }); }
    if (p2 > 0) {
      if (mode === 'bid') for (const cd of cands) { if (cd === c2) continue; line(c, chunkPts(8, x8, cd.c, Math.ceil(16 * ease(p2))), alpha(cd.side > 0 ? S.r : S.l, 0.3), 1.2, [3, 3]); }
      line(c, chunkPts(8, x8, c2.c, Math.ceil(16 * ease(p2))), c2.side > 0 ? S.r : S.l, 1.6);
      if (p2 >= 1) lab(c, k, mode === 'te' ? 'пачка 2' : 'выбрана пачка 2', xs(19), ys(c2.c[10]) + (c2.side > 0 ? -12 : 12), { px: 9.5, weight: 650, color: c2.side > 0 ? S.r : S.l, haloColor: P.surf });
      if (mode === 'bid' && p2 >= 1) lab(c, k, 'сэмплы на стыке', xs(14), ys(0) - 2, { px: 9, color: P.ink3, haloColor: P.surf });
    }
    // исполненный путь
    const path = [[xs(0), ys(0)]]; let xcur = 0, touch = false;
    for (let s = 0; s < SM.T; s++) {
      let tgt;
      if (s < 8) tgt = c1[s];
      else if (mode === 'te' && s < 16) { const w0 = 1, w1 = Math.exp(-0.5); tgt = (w0 * c1[s] + w1 * c2.c[s - 8]) / (w0 + w1); }
      else tgt = c2.c[s - 8];
      xcur += Math.max(-9, Math.min(9, tgt - xcur)); path.push([xs(s + 1), ys(xcur)]);
      if (Math.abs(s + 1 - SM.tk) <= 3 && Math.abs(xcur) < 31) touch = true;
    }
    const upto = u < 1.6 ? Math.ceil(8 * ease(p1)) : 8 + Math.ceil(16 * ease(p3));
    if (upto > 0) line(c, path.slice(0, upto + 1), touch && upto > SM.tk ? P.bad : P.ink, 3);
    const q = path[Math.min(upto, SM.T)]; circle(c, q[0], q[1], 6, P.surf, P.ink, 2);
    if (p3 >= 1) { if (touch) { HeroKit.cross(c, path[SM.tk][0], path[SM.tk][1], 6, P.bad, 2.4); lab(c, k, 'среднее двух пачек ведёт в чайник', ox + pw / 2, oy + ph - 14, { px: 10.5, weight: 650, color: P.bad, halo: false }); } else lab(c, k, 'выбран сэмпл, который продолжает пачку 1', ox + pw / 2, oy + ph - 14, { px: 10.5, weight: 650, color: P.good, halo: false }); }
    else lab(c, k, mode === 'te' ? 'исполняем среднее старой и новой пачки' : 'из нескольких сэмплов — ближайший к старой', ox + pw / 2, oy + ph - 14, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    void rect; void lerp;
  }
  function drawSeams(cols) {
    return (c, k, t, P, A) => {
      const pw = 360, ph = 250;
      ['te', 'bid'].forEach((m, i) => { const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph; if (i % cols) A.line(c, [[ox, oy + 30], [ox, oy + ph - 40]], P.grid, 1); seamPanel(c, k, t, P, A, ox, oy, pw, ph, m); });
    };
  }
  Anim.add('seams2', { W: 720, H: 250, start: 0.2, narrowAt: 600, draw: drawSeams(2), narrow: { W: 360, H: 500, draw: drawSeams(1) } });
})();
