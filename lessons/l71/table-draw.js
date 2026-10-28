/* =====================================================================
   l71/table-draw.js — рисунок кухонного стола Ады для всей части 7:
   вид сверху, скатерть, свет, блюдце, сахарница, молочник, чашка и кисть
   Ады, пути на столе, карта покрытия записей и врезка «что видит Ада».
   Мир и физика — l71/engine.js (window.L71), здесь только рисование.

   Общая метка части 7: всё настоящее и измеренное — синим (--classic)
   и сплошной линией, всё, что предсказала модель мира, — оранжевым
   (--e2e) и пунктиром, расхождение — красным (--critical). Цвета
   предметов физические и от темы не зависят (как в уроке 0.1).

   TableDraw.view(cv, o) → V — канвас под стол с полями: { c, k, X, Y, S, W, H, toTable(px, py) }.
   TableDraw.table(V, world, o) — скатерть, свет, блюдце и предметы.
   TableDraw.cup(V, x, y, o) / hand(V, x, y, o) — чашка и кисть;
   o.imag — воображение (оранжевый пунктир), o.tipped, o.fallen.
   TableDraw.path(V, pts, o) — путь [x, y, …]; o.kind: 'real' | 'imag' | 'hand'.
   TableDraw.coverage(V, cov) — где были записи (синяя заливка клеток).
   TableDraw.camera(cv, frame, w, h) — кадр камеры крупными пикселями.
   ===================================================================== */
'use strict';
const TableDraw = (() => {
  const K = HeroKit, E = () => window.L71;
  const rgb = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;
  /** Канвас под стол: поля m (м) вокруг стола, чтобы было видно, что за краем. */
  function view(cv, o) {
    o = o || {}; const T = E().TABLE, m = o.margin == null ? 0.08 : o.margin;
    const Wl = o.W || 720, S = Wl / (T.W + 2 * m), Hl = Math.round((T.H + 2 * m) * S);
    const { c, k } = K.fit(cv, Wl, Hl);
    const X = (x) => (x + m) * S, Y = (y) => (y + m) * S;
    const toTable = (px, py) => { const r = cv.getBoundingClientRect(); return [(px - r.left) / r.width * Wl / S - m, (py - r.top) / r.height * Hl / S - m]; };
    return { c, k, X, Y, S, W: Wl, H: Hl, m, cv, toTable };
  }
  /** Скатерть с узором и светом, блюдце, сахарница и молочник. o = { light: 'day' | 'evening' | …, grid: true }. */
  function table(V, W, o) {
    o = o || {}; const L71 = E(), c = V.c, T = L71.TABLE, cl = W.cloth, L = typeof o.light === 'object' ? o.light : L71.LIGHTS[o.light || 'day'];
    const dark = K.dark();
    c.fillStyle = dark ? '#1d1c1a' : '#d9d3c8'; c.fillRect(0, 0, V.W, V.H);   // пол вокруг стола
    const x0 = V.X(0), y0 = V.Y(0), x1 = V.X(T.W), y1 = V.Y(T.H);
    c.save(); c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.roundRect(x0 + 4, y0 + 5, x1 - x0, y1 - y0, 8); c.fill(); c.restore();
    c.fillStyle = rgb(cl.base); c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, 6); c.fill();
    c.save(); c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, 6); c.clip();
    c.fillStyle = rgb(cl.ink, 0.55);
    if (cl.pattern === 'stripes') for (let x = 0; x < T.W; x += 0.09) c.fillRect(V.X(x), y0, 0.045 * V.S, y1 - y0);
    else if (cl.pattern === 'check') { for (let i = 0; i * 0.075 < T.W; i++) for (let j = 0; j * 0.075 < T.H; j++) if ((i + j) & 1) c.fillRect(V.X(i * 0.075), V.Y(j * 0.075), 0.075 * V.S, 0.075 * V.S); }
    else for (let x = 0.03; x < T.W; x += 0.06) for (let y = 0.03; y < T.H; y += 0.06) { c.beginPath(); c.arc(V.X(x), V.Y(y), 0.015 * V.S, 0, 7); c.fill(); }
    if (L.sun != null) {   // солнечная полоса — светлая диагональ
      const u0 = L.sun * (T.W + 0.45 * T.H);
      c.fillStyle = 'rgba(255,246,214,0.42)'; c.beginPath();
      const pts = [[u0 - L.sunW / 2, 0], [u0 + L.sunW / 2, 0], [u0 + L.sunW / 2 - 0.45 * T.H, T.H], [u0 - L.sunW / 2 - 0.45 * T.H, T.H]];
      pts.forEach((p, i) => (i ? c.lineTo(V.X(p[0]), V.Y(p[1])) : c.moveTo(V.X(p[0]), V.Y(p[1])))); c.closePath(); c.fill();
    }
    if (L.brightness < 0.9) { c.fillStyle = `rgba(20,18,30,${(1 - L.brightness) * 0.75})`; c.fillRect(x0, y0, x1 - x0, y1 - y0); }
    if (o.grid) { c.strokeStyle = 'rgba(60,40,20,0.10)'; c.lineWidth = 1; for (let x = 0.1; x < T.W; x += 0.1) { c.beginPath(); c.moveTo(V.X(x), y0); c.lineTo(V.X(x), y1); c.stroke(); } for (let y = 0.1; y < T.H; y += 0.1) { c.beginPath(); c.moveTo(x0, V.Y(y)); c.lineTo(x1, V.Y(y)); c.stroke(); } }
    c.restore();
    c.strokeStyle = dark ? '#6f6a60' : '#8a7a62'; c.lineWidth = 2; c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, 6); c.stroke();
    // блюдце
    const g = W.lay.saucer, P = L71.PAL, R = L71.SAUCER_R * V.S;
    c.fillStyle = 'rgba(40,30,20,0.18)'; c.beginPath(); c.arc(V.X(g[0]) + 2, V.Y(g[1]) + 3, R, 0, 7); c.fill();
    c.fillStyle = rgb(P.saucer); c.strokeStyle = rgb(P.rim); c.lineWidth = Math.max(1.5, 0.008 * V.S); c.beginPath(); c.arc(V.X(g[0]), V.Y(g[1]), R, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(V.X(g[0]), V.Y(g[1]), L71.D_OK * V.S, 0, 7); c.strokeStyle = 'rgba(46,140,80,0.75)'; c.setLineDash([4, 3]); c.lineWidth = 1.4; c.stroke(); c.setLineDash([]);
    // сахарница и молочник
    for (const ob of W.lay.objs) {
      const x = V.X(ob.x), y = V.Y(ob.y), r = ob.r * V.S;
      c.fillStyle = 'rgba(40,30,20,0.22)'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, 7); c.fill();
      if (ob.kind === 'milk') {
        c.fillStyle = rgb(P.milkRim); c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.62); c.lineTo(x - r * 1.15, y - r * 1.0); c.lineTo(x - r * 0.86, y - r * 0.36); c.closePath(); c.fill();
        c.strokeStyle = rgb(P.milkRim); c.lineWidth = Math.max(2, r * 0.18); c.beginPath(); c.arc(x + r * 0.95, y, r * 0.35, -1.2, 1.2); c.stroke();
        c.fillStyle = rgb(P.milk); c.strokeStyle = rgb(P.milkRim); c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.05)'; c.beginPath(); c.arc(x, y, r * 0.7, 0, 7); c.fill();
      } else {
        c.fillStyle = rgb(P.sugar); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x, y, r * 0.7, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x, y, r * 0.18, 0, 7); c.fill();
      }
    }
  }
  /** Чашка: красная с чаем; o.imag — как её видит модель (оранжевый пунктир без заливки), o.tipped — пролита, o.fallen — упала (крест у края). */
  function cup(V, x, y, o) {
    o = o || {}; const c = V.c, P = E().PAL, r = E().CUP_R * V.S, X = V.X(x), Y = V.Y(y);
    if (o.imag) {
      c.save(); c.globalAlpha = o.alpha == null ? 1 : o.alpha; c.strokeStyle = K.css('--e2e'); c.lineWidth = o.lw || 2; c.setLineDash([5, 4]);
      c.beginPath(); c.arc(X, Y, r, 0, 7); c.stroke(); c.setLineDash([]);
      c.fillStyle = K.css('--e2e'); c.globalAlpha *= 0.12; c.beginPath(); c.arc(X, Y, r, 0, 7); c.fill(); c.restore();
      return;
    }
    if (o.fallen) { K.cross(c, X, Y, r * 0.7, K.css('--critical'), 3); return; }
    if (o.tipped) {
      c.fillStyle = rgb(P.tea, 0.75); c.beginPath(); c.ellipse(X + r * 0.9, Y + r * 0.2, r * 1.5, r * 1.0, 0.3, 0, 7); c.fill();
      c.fillStyle = rgb(P.cup); c.beginPath(); c.ellipse(X, Y, r * 1.1, r * 0.72, 0.3, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(X + r * 0.55, Y + r * 0.16, r * 0.4, r * 0.55, 0.3, 0, 7); c.stroke();
      return;
    }
    c.fillStyle = 'rgba(40,30,20,0.22)'; c.beginPath(); c.arc(X + 2, Y + 3, r, 0, 7); c.fill();
    c.fillStyle = rgb(P.cup); c.beginPath(); c.roundRect(X + r * 0.7, Y - r * 0.24, r * 0.62, r * 0.48, r * 0.2); c.fill();
    c.beginPath(); c.arc(X, Y, r, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(X, Y, r * 0.8, 0, 7); c.fill();
    c.fillStyle = rgb(P.tea); c.beginPath(); c.arc(X, Y, r * 0.66, 0, 7); c.fill();
    if (o.ring) { c.strokeStyle = o.ring; c.lineWidth = 2.4; c.beginPath(); c.arc(X, Y, r + 3, 0, 7); c.stroke(); }
  }
  /** Кисть Ады сверху: тёплый белый корпус запястья, графитовые пальцы, фиолетовая метка (как в уроке 0.1). */
  function hand(V, x, y, o) {
    o = o || {}; const c = V.c, r = E().HAND_R * V.S, X = V.X(x), Y = V.Y(y), a = o.heading || 0;
    c.save(); c.translate(X, Y); c.rotate(a); if (o.alpha != null) c.globalAlpha = o.alpha;
    c.fillStyle = 'rgba(20,15,10,0.25)'; c.beginPath(); c.arc(2, 3, r * 1.12, 0, 7); c.fill();
    c.fillStyle = '#3d3c38'; c.beginPath(); c.roundRect(r * 0.15, -r * 1.2, r * 1.0, r * 0.4, r * 0.18); c.fill(); c.beginPath(); c.roundRect(r * 0.15, r * 0.8, r * 1.0, r * 0.4, r * 0.18); c.fill();
    c.fillStyle = '#f4efe6'; c.strokeStyle = '#3d3c38'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#e6dccb'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, 7); c.fill();
    c.fillStyle = '#4a3aa7'; c.beginPath(); c.arc(0, 0, r * 0.2, 0, 7); c.fill();
    c.restore();
  }
  /** Путь по столу: pts = [x, y, x, y, …] (м). o.kind: 'real' — синяя сплошная, 'imag' — оранжевый пунктир, 'hand' — серая;
   *  o.lw, o.alpha, o.color, o.dots — точки шагов. */
  function path(V, pts, o) {
    o = o || {}; if (!pts || pts.length < 4) return;
    const c = V.c, col = o.color || (o.kind === 'imag' ? K.css('--e2e') : o.kind === 'hand' ? K.css('--ink-3') : K.css('--classic'));
    c.save(); if (o.alpha != null) c.globalAlpha = o.alpha;
    c.strokeStyle = col; c.lineWidth = o.lw || 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.setLineDash(o.kind === 'imag' ? [6, 5] : o.kind === 'hand' ? [2, 4] : []);
    c.beginPath(); for (let i = 0; i < pts.length; i += 2) { const x = V.X(pts[i]), y = V.Y(pts[i + 1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
    if (o.dots) { c.fillStyle = col; for (let i = 0; i < pts.length; i += 2 * o.dots) { c.beginPath(); c.arc(V.X(pts[i]), V.Y(pts[i + 1]), 2.2, 0, 7); c.fill(); } }
    c.restore();
  }
  /** Карта покрытия записей: клетки, где чашку двигали или касались, синие тем гуще, чем больше там переходов. */
  function coverage(V, cov, o) {
    o = o || {}; const c = V.c, T = E().TABLE, cw = T.W / cov.nx, ch = T.H / cov.ny; let mx = 1; for (const v of cov.g) if (v > mx) mx = v;
    const col = K.css('--classic');
    for (let j = 0; j < cov.ny; j++) for (let i = 0; i < cov.nx; i++) {
      const v = cov.g[j * cov.nx + i];
      if (v > 0) { c.fillStyle = col; c.globalAlpha = 0.12 + 0.5 * Math.sqrt(v / mx); c.fillRect(V.X(i * cw) + 0.5, V.Y(j * ch) + 0.5, cw * V.S - 1, ch * V.S - 1); }
      else if (o.empty !== false) { c.globalAlpha = 0.55; c.strokeStyle = K.css('--critical'); c.lineWidth = 1; c.setLineDash([2, 3]); c.strokeRect(V.X(i * cw) + 2, V.Y(j * ch) + 2, cw * V.S - 4, ch * V.S - 4); c.setLineDash([]); }
    }
    c.globalAlpha = 1;
  }
  /** Кадр камеры крупными пикселями (без сглаживания) на своём канвасе. */
  function camera(cv, f, w, h) {
    w = w || 24; h = h || 24;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d'), img = c.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { img.data[i * 4] = Math.round(f[i * 3] * 255); img.data[i * 4 + 1] = Math.round(f[i * 3 + 1] * 255); img.data[i * 4 + 2] = Math.round(f[i * 3 + 2] * 255); img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
  }
  return { view, table, cup, hand, path, coverage, camera, rgb };
})();
