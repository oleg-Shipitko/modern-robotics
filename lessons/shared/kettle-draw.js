/* =====================================================================
   shared/kettle-draw.js — отрисовка сцены уроков 1.3 и 1.5 поверх
   движка Kettle: дом Ады сверху, чайник, демонстрации, тепловая карта,
   Ады разных политик и их следы. Только рисование, логики здесь нет.
   Координаты логические: 1 единица = 1 см, сцена 600 × 400.
   ===================================================================== */
'use strict';
window.KettleDraw = (function () {
  const K = HeroKit, E = Kettle;
  const W = E.W, H = E.H;
  /** Палитра темы. Три политики: регрессия — графитовая, смесь — бирюзовая, диффузия — цвет нейросетей курса. */
  function pal() {
    const d = K.dark();
    return {
      bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'),
      surf: K.css('--surface'), good: K.css('--good'), bad: K.css('--critical'), e2e: K.css('--e2e'), classic: K.css('--classic'),
      reg: K.css('--pol-reg'), gmm: K.css('--pol-gmm'), dif: K.css('--pol-dif'), demo: d ? '#8f8d85' : '#9a978d',
      left: K.css('--side-l'), right: K.css('--side-r'), wall: d ? '#c9c7bf' : '#3d3c38', kettle: d ? '#d8d4c8' : '#5b5a55',
    };
  }
  /** План дома: пол, сетка, стена с проёмом, мебель, старт, цель и эталонный маршрут. */
  function house(c, k, P, o) {
    o = o || {};
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 50, P.grid);
    if (o.labels !== false) for (const [t, x, y] of [['кухня', 120, 78], ['гостиная', 140, 140]]) K.label(c, k, t, x, y, { color: P.ink3, px: 11, weight: 600, haloColor: P.bg });
    for (const f of E.FURN) {
      const [x0, y0, x1, y1] = f.r; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 7, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (o.labels !== false && f.name !== 'стол') K.label(c, k, f.name, (x0 + x1) / 2, (y0 + y1) / 2, { color: P.ink2, px: 10.5, haloColor: P.surf });
    }
    c.fillStyle = P.wall; for (const r of E.WALLS) c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    if (o.route !== false) { c.setLineDash([3, 6]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.moveTo(E.RX, E.START.y); c.lineTo(E.RX, E.GOAL.y); c.stroke(); c.setLineDash([]); }
    // цель: место у стола
    const g = E.GOAL; c.setLineDash([4, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.beginPath(); c.arc(g.x, g.y, 20, 0, 7); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(g.x, g.y, 3.5, 0, 7); c.fillStyle = P.ink2; c.fill();
    if (o.labels !== false) K.label(c, k, 'стол', g.x, 17, { color: P.ink2, px: 10.5, haloColor: P.surf });
    const s = E.START; c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.beginPath(); c.arc(s.x, s.y, 7, 0, 7); c.stroke();
    if (o.labels !== false) K.label(c, k, 'старт', s.x + (o.startDx || 36), s.y + 2, { color: P.ink3, px: 11, haloColor: P.bg });
  }
  /** Чайник сверху: корпус, крышка, носик и ручка. o.hot — подсветка касания, o.ghost — бледный. */
  function kettle(c, k, P, kt, o) {
    o = o || {}; const R = E.RK;
    c.save(); c.translate(kt.x, kt.y); if (o.ghost) c.globalAlpha = 0.35;
    if (o.halo) { c.beginPath(); c.arc(0, 0, R + E.RA, 0, 7); c.setLineDash([3, 4]); c.strokeStyle = P.bad; c.globalAlpha *= 0.55; c.lineWidth = 1.2; c.stroke(); c.setLineDash([]); c.globalAlpha = o.ghost ? 0.35 : 1; }
    c.lineWidth = 2; c.strokeStyle = o.hot ? P.bad : P.kettle; c.fillStyle = P.surf;
    c.beginPath(); c.moveTo(R - 2, -3); c.lineTo(R + 9, -7); c.lineTo(R + 10, -4); c.lineTo(R - 1, 3); c.closePath(); c.fill(); c.stroke();  // носик
    c.beginPath(); c.arc(-R - 1, 0, 6, Math.PI * 0.5, Math.PI * 1.5); c.stroke();                                                      // ручка
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.45, 0, 7); c.stroke();
    c.beginPath(); c.arc(0, 0, 2.2, 0, 7); c.fillStyle = o.hot ? P.bad : P.kettle; c.fill();
    c.restore();
    if (o.label) K.label(c, k, 'чайник', kt.x, kt.y + R + 13, { color: P.ink2, px: 11, weight: 650, haloColor: P.bg });
  }
  /** Ада сверху: светлый корпус, цветной обод, тёмный экран с оранжевыми глазами. th — курс (рад). */
  function ada(c, x, y, th, color, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y); c.rotate(th);
    c.beginPath(); c.arc(0, 0, E.RA, 0, 7); c.fillStyle = K.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = 3; c.strokeStyle = color; c.stroke();
    c.beginPath(); c.roundRect(4, -9, 10, 18, 4); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(9, -4, 1.8, 0, 7); c.arc(9, 4, 1.8, 0, 7); c.fill();
    c.restore();
  }
  /** Путь по массиву x на шагах маршрута (урок 1.3) до шага upto. */
  function pathXs(c, xs, upto, y0) {
    const n = upto == null ? xs.length : Math.min(xs.length, upto + 1); if (n < 2) return;
    y0 = y0 == null ? E.START.y : y0; c.beginPath(); c.moveTo(xs[0], y0); for (let t = 1; t < n; t++) c.lineTo(xs[t], y0 - E.V * t); c.stroke();
  }
  /** Путь по массиву точек {x, y}. */
  function pathPts(c, pts, upto) { const n = upto == null ? pts.length : Math.min(pts.length, upto + 1); if (n < 2) return; c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < n; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke(); }
  /** Тонкие линии демонстраций. */
  function demos(c, P, list, alpha) {
    c.save(); c.strokeStyle = P.demo; c.lineWidth = 1.1; c.globalAlpha = alpha == null ? 0.45 : alpha; c.lineJoin = 'round';
    for (const d of list) pathXs(c, d.xs); c.restore();
  }
  /** Тепловая карта плотности демонстраций: два рукава вокруг чайника. */
  function heat(c, P, hm, color) {
    const cw = W / hm.gw, ch = H / hm.gh; c.fillStyle = color || P.classic;
    for (let j = 0; j < hm.gh; j++) for (let i = 0; i < hm.gw; i++) { const v = hm.g[j * hm.gw + i]; if (!v) continue; c.globalAlpha = 0.07 + 0.42 * Math.sqrt(v / hm.mx); c.fillRect(i * cw, j * ch, cw + 0.4, ch + 0.4); }
    c.globalAlpha = 1;
  }
  /** Курс Ады по двум соседним точкам. */
  const heading = (x0, y0, x1, y1) => (Math.hypot(x1 - x0, y1 - y0) < 0.01 ? -Math.PI / 2 : Math.atan2(y1 - y0, x1 - x0));
  return { pal, house, kettle, ada, pathXs, pathPts, demos, heat, heading, W, H };
})();
