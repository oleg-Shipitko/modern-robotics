/* =====================================================================
   aloha.js — урок 1.7, раздел про ALOHA: анимированная схема телеоперации
   на общем движке shared/anim.js. Оператор ведёт маленькую ведущую руку,
   большая ведомая повторяет её углы сустав в сустав и переставляет чашку.
   Оранжевым — ведущая рука и то, что задаёт человек; синим — ведомая рука.
   ===================================================================== */
'use strict';
(() => {
  const T = 8.4;
  const FL = { l1: 96, l2: 88, g: 30 };              // ведомая рука ViperX, пиксели при масштабе 1
  const LL = { l1: 54, l2: 50, g: 16 };              // ведущая рука WidowX
  const CUP = { x: 120, w: 26, h: 34 }, PLACE = 172;
  // путь кончиков пальцев ведомой руки (в координатах её плеча; y вниз, стол на y = 14)
  const KEYS = [[0, [64, -76], 0], [1.4, [CUP.x, -42], 0], [2.0, [CUP.x, -4], 0], [2.4, [CUP.x, -4], 1], [3.0, [CUP.x, -58], 1], [4.2, [PLACE, -58], 1], [4.8, [PLACE, -4], 1], [5.2, [PLACE, -4], 0], [5.8, [PLACE, -42], 0], [7.0, [64, -76], 0], [T, [64, -76], 0]];
  function state(t) {
    const { ease } = Anim.kit, u = ((t % T) + T) % T;
    let i = 0; while (i < KEYS.length - 2 && u >= KEYS[i + 1][0]) i++;
    const [t0, p0, g0] = KEYS[i], [t1, p1, g1] = KEYS[i + 1], s = ease((u - t0) / (t1 - t0));
    const tip = [p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s], grip = g0 + (g1 - g0) * s;
    // обратная кинематика ведомой руки: кисть над кончиками, захват смотрит вниз
    const wx = tip[0], wy = tip[1] - FL.g, d = Math.min(FL.l1 + FL.l2 - 0.5, Math.hypot(wx, wy));
    const cosE = (d * d - FL.l1 * FL.l1 - FL.l2 * FL.l2) / (2 * FL.l1 * FL.l2), e = Math.acos(Math.max(-1, Math.min(1, cosE)));   // локоть вверху
    const q1 = Math.atan2(wy, wx) - Math.atan2(FL.l2 * Math.sin(e), FL.l1 + FL.l2 * Math.cos(e)), q2 = e, q3 = Math.PI / 2 - q1 - q2;
    // где чашка: на столе, в захвате или на новом месте
    let cup = [CUP.x, 0], held = false;
    if (u >= 2.4 && u < 5.0) { held = true; cup = [tip[0], tip[1] + 4]; }
    else if (u >= 5.0 && u < 7.6) cup = [PLACE, 0];
    const fade = u >= 7.6 ? (u - 7.6) / (T - 7.6) : 1;
    return { u, q1, q2, q3, grip, cup, held, fade, tip };
  }
  /** Рука: плечо в (0, 0), три звена с углами q1, q2, q3 (абсолютный угол кисти — q1 + q2 + q3). */
  function arm(c, L, q, col, colS, P, A, grip, hand) {
    const { link, circle, line } = A;
    const e = [L.l1 * Math.cos(q.q1), L.l1 * Math.sin(q.q1)];
    const w = [e[0] + L.l2 * Math.cos(q.q1 + q.q2), e[1] + L.l2 * Math.sin(q.q1 + q.q2)];
    const a3 = q.q1 + q.q2 + q.q3, tip = [w[0] + L.g * Math.cos(a3), w[1] + L.g * Math.sin(a3)];
    link(c, 0, 0, e[0], e[1], 12, colS, col); link(c, e[0], e[1], w[0], w[1], 10, colS, col);
    if (hand) {                                       // рукоять с курком и рука оператора
      link(c, w[0], w[1], tip[0], tip[1], 7, colS, col);
      circle(c, tip[0], tip[1] + 6, 11, P.surf, P.ink2, 2);
      line(c, [[tip[0] + 8, tip[1] + 2], [tip[0] + 8 - 5 * grip, tip[1] + 10]], P.ink2, 3);
    } else {                                          // захват из двух пальцев
      const nx = -Math.sin(a3), ny = Math.cos(a3), open = 9 - 6 * grip;
      line(c, [w, [w[0] + (L.g - 12) * Math.cos(a3), w[1] + (L.g - 12) * Math.sin(a3)]], col, 6);
      for (const sgn of [-1, 1]) {
        const b = [w[0] + (L.g - 12) * Math.cos(a3) + sgn * open * nx, w[1] + (L.g - 12) * Math.sin(a3) + sgn * open * ny];
        line(c, [[w[0] + (L.g - 12) * Math.cos(a3) - sgn * 0 * nx, w[1] + (L.g - 12) * Math.sin(a3)], b, [b[0] + 12 * Math.cos(a3), b[1] + 12 * Math.sin(a3)]], col, 4);
      }
    }
    for (const p of [[0, 0], e, w]) circle(c, p[0], p[1], 5.5, P.surf, col, 2.2);
    return { e, w, tip };
  }
  const deg = (r) => Math.round(r * 180 / Math.PI);
  function drawAloha(c, k, t, P, A, G) {
    const { rect, line, circle, lab, hatchBox, alpha, arrow } = A, s = state(t);
    // ведущая рука: основание на столе оператора
    c.save(); c.translate(G.L.x, G.L.y); c.scale(G.L.s, G.L.s);
    line(c, [[-50, 14], [60, 14]], P.ink3, 2); hatchBox(c, -50, 16, 60, 24, P);
    rect(c, -11, 0, 22, 14, 3, P.surf2, P.ink3, 1.6);
    const lead = arm(c, LL, s, P.mot, P.motS, P, A, s.grip, true);
    c.restore();
    const hx = G.L.x + lead.tip[0] * G.L.s, hy = G.L.y + lead.tip[1] * G.L.s;
    lab(c, k, G.handText, hx + 16, hy + 8, { color: P.ink3, px: 11, align: 'left' });
    // ведомая рука, стол и чашка
    c.save(); c.translate(G.F.x, G.F.y); c.scale(G.F.s, G.F.s);
    line(c, [[-40, 14], [214, 14]], P.ink3, 2); hatchBox(c, -40, 16, 214, 24, P);
    rect(c, -14, 0, 28, 14, 3, P.surf2, P.ink3, 1.6);
    if (s.u >= 5.0 || s.u < 2.4) { c.globalAlpha = s.u >= 7.6 ? 1 - s.fade : 1; }
    const cx = s.cup[0], cy = s.held ? s.cup[1] : 14 - CUP.h / 2;
    rect(c, cx - CUP.w / 2, cy - CUP.h / 2, CUP.w, CUP.h, 4, P.surf2, P.ink2, 2);
    c.beginPath(); c.arc(cx + CUP.w / 2 + 2, cy, 7, -1.2, 1.2); c.strokeStyle = P.ink2; c.lineWidth = 2.4; c.stroke();
    c.globalAlpha = 1;
    if (s.u >= 7.6) { c.globalAlpha = s.fade; rect(c, CUP.x - CUP.w / 2, 14 - CUP.h, CUP.w, CUP.h, 4, P.surf2, P.ink2, 2); c.globalAlpha = 1; }
    arm(c, FL, s, P.out, P.outS, P, A, s.grip, false);
    c.restore();
    // связь: углы идут от ведущей руки к ведомой 50 раз в секунду
    const [x1, y1, x2, y2] = G.link;
    line(c, [[x1, y1], [x2, y2]], P.line, 1.6, [5, 5], -t * 40);
    arrow(c, x2 - (x2 - x1) * 0.02, y2 - (y2 - y1) * 0.02, x2, y2, P.ink3, 1.6, 6);
    for (let i = 0; i < 6; i++) { const ph = ((t * 1.25 + i / 6) % 1); circle(c, x1 + (x2 - x1) * ph, y1 + (y2 - y1) * ph, 3.2, P.mot); }
    lab(c, k, G.linkText, G.lt[0], G.lt[1], { color: P.ink2, px: 11, weight: 700 });
    lab(c, k, `плечо ${deg(-s.q1)}° · локоть ${deg(s.q2)}° · кисть ${deg(s.q3)}°`, G.la[0], G.la[1], { color: P.mot, px: 11, mono: true });
    G.labels.forEach(([txt, x, y, col, al]) => lab(c, k, txt, x, y, { color: P[col] || col, px: 11, weight: 600, align: al || 'center' }));
    // запись демонстрации
    const rec = Math.floor(t * 2) % 2 === 0;
    circle(c, G.rec[0], G.rec[1], 4.5, rec ? P.bad : alpha(P.bad, 0.35));
    lab(c, k, G.recText, G.rec[0] + 10, G.rec[1], { color: P.ink2, px: 10.5, align: 'left' });
  }
  Anim.add('aloha', {
    W: 640, H: 280, start: 2.2, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawAloha(c, k, t, P, A, {
        L: { x: 120, y: 200, s: 1 }, F: { x: 360, y: 200, s: 1 },
        link: [190, 66, 330, 66], lt: [260, 44], la: [260, 88], linkText: 'углы суставов, 50 раз в секунду', handText: 'рука оператора',
        labels: [['ведущая рука WidowX', 120, 246, 'mot'], ['ведомая рука ViperX', 456, 246, 'out'], ['в ALOHA две такие пары', 560, 22, 'ink3']],
        rec: [22, 268], recText: 'запись: 4 камеры по 30 кадров в секунду и 14 углов суставов 50 раз в секунду',
      });
    },
    narrow: {
      W: 360, H: 470,
      draw(c, k, t, P, A) {
        drawAloha(c, k, t, P, A, {
          L: { x: 90, y: 140, s: 0.95 }, F: { x: 70, y: 380, s: 0.95 },
          link: [326, 70, 326, 250], lt: [250, 50], la: [180, 274], linkText: 'углы суставов, 50 раз в секунду', handText: 'оператор',
          labels: [['ведущая рука WidowX', 96, 182, 'mot'], ['ведомая рука ViperX', 160, 420, 'out'], ['в ALOHA две такие пары', 270, 22, 'ink3']],
          rec: [16, 452], recText: 'запись: 4 камеры по 30 кадров/с и 14 углов 50 раз/с',
        });
      },
    },
  });
})();
