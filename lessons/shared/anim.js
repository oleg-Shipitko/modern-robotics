/* =====================================================================
   anim.js — анимированные схемы: как устроено железо и куда идут данные.
   Схема — функция кадра от времени t (секунды) на канвасе W×H. У схемы может
   быть вторая, узкая раскладка для телефона. Анимация идёт, только пока схема
   видна на экране; нажатие на схему ставит её на паузу. При настройке
   «уменьшить движение» — неподвижный кадр и кнопка запуска.
   Цвета как у приводов в уроке 0.2: оранжевый — то, что действует или излучает;
   синий — измеренное и выход; фиолетовый — упругое; серый — неподвижное.
   Сцены добавляют файлы уроков: Anim.add('enc', { W, H, start, draw, narrow }),
   канвас в разметке: <canvas data-anim="enc">.
   ===================================================================== */
'use strict';
const Anim = (() => {
  const K = HeroKit, TAU = Math.PI * 2, S = {}, ST = new WeakMap();
  const pal = () => ({
    ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), line: K.css('--line-2'), grid: K.css('--line'), surf: K.css('--surface'), surf2: K.css('--surface-2'), bg2: K.css('--bg-2'),
    mot: K.css('--e2e'), motS: K.css('--e2e-soft'), out: K.css('--classic'), outS: K.css('--classic-soft'), spr: K.css('--hybrid'), sprS: K.css('--hybrid-soft'), bad: K.css('--critical'), good: K.css('--good'),
    dark: K.dark(),
  });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
  const lerp = (a, b, s) => a + (b - a) * s;
  const fmt = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');

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
  function arrow(c, x1, y1, x2, y2, color, lw, hd) {
    const a = Math.atan2(y2 - y1, x2 - x1); hd = hd || 8;
    line(c, [[x1, y1], [x2 - Math.cos(a) * 4, y2 - Math.sin(a) * 4]], color, lw || 3);
    c.beginPath(); c.moveTo(x2, y2);
    c.lineTo(x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45));
    c.lineTo(x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45));
    c.closePath(); c.fillStyle = color; c.fill();
  }
  /** Пружина-зигзаг между двумя точками. */
  function spring(c, x1, y1, x2, y2, color, n, amp, lw) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, pts = [[x1, y1]];
    n = n || 6; amp = amp || 5;
    const a = L * 0.12, b = L * 0.88;
    pts.push([x1 + ux * a, y1 + uy * a]);
    for (let i = 0; i < n * 2; i++) { const s = a + (b - a) * (i + 0.5) / (n * 2), side = i % 2 ? -1 : 1; pts.push([x1 + ux * s + nx * amp * side, y1 + uy * s + ny * amp * side]); }
    pts.push([x1 + ux * b, y1 + uy * b], [x2, y2]);
    line(c, pts, color, lw || 2);
  }
  function hatchBox(c, x0, y0, x1, y1, P) {
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 6, 1);
  }
  const lab = (c, k, text, x, y, o) => K.label(c, k, text, x, y, Object.assign({ px: 11.5, weight: 600 }, o || {}));
  /** Цвет с прозрачностью: hex или rgb() из CSS-переменной. */
  function alpha(col, a) {
    const s = String(col).trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
    m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(',').map((x) => x.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
    return s;
  }
  const kit = { K, TAU, clamp, seg, ease, lerp, fmt, circle, rect, line, link, arrow, spring, hatchBox, lab, alpha };

  /* ---------- запуск ---------- */
  function add(kind, spec) { S[kind] = spec; }
  function layoutOf(cv, spec) {
    if (!spec.narrow) return spec;
    const w = (cv.parentElement && cv.parentElement.getBoundingClientRect().width) || spec.W;
    return w < (spec.narrowAt || 560) ? spec.narrow : spec;
  }
  function paint(cv, spec, t, P) {
    const L = layoutOf(cv, spec), id = L === spec ? 'w' : 'n';
    if (cv.dataset.layout !== id) { cv.style.aspectRatio = `${L.W} / ${L.H}`; cv.dataset.layout = id; }
    const { c, k } = K.fit(cv, L.W, L.H);
    c.clearRect(0, 0, L.W, L.H);
    L.draw(c, k, t, P, kit);
  }
  function mount(cv) {
    const spec = S[cv.dataset.anim];
    if (!spec || cv.dataset.animOn) return;
    cv.dataset.animOn = '1';
    let t = spec.start || 0, P = pal(), paused = false, ctl = null;
    const draw = () => paint(cv, spec, t, P);
    ST.set(cv, { seek(tt) { t = tt; paused = true; cv.classList.add('paused'); draw(); } });
    K.onTheme(() => { P = pal(); draw(); });
    window.addEventListener('resize', draw);
    const run = () => { if (!ctl) ctl = K.loop(cv, (dt) => { if (!paused) t += dt; draw(); }); };
    cv.addEventListener('click', () => { paused = !paused; cv.classList.toggle('paused', paused); if (!ctl) { paused = false; run(); } });
    draw();
    if (K.reduced()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost anim-play'; b.textContent = 'Показать движение';
      b.addEventListener('click', () => { b.remove(); run(); });
      cv.after(b);
    } else run();
  }
  function init() { document.querySelectorAll('canvas[data-anim]').forEach(mount); }
  /** Кадр в момент t — для проверок и снимков. */
  function frame(cv, t) { paint(cv, S[cv.dataset.anim], t, pal()); }
  /** Остановить схему на кадре t (для проверок и снимков). */
  function seek(cv, t) { const s = ST.get(cv); if (s) s.seek(t); else frame(cv, t); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
  return { add, init, frame, seek, kit, kinds: () => Object.keys(S) };
})();
