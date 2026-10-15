/* =====================================================================
   ui-l81.js — урок 8.1 «Классические методы в контуре управления».
   0) анимированные схемы (shared/anim.js): два способа замкнуть контур
      (сеть → моменты и сеть → цель → классика), остаточная политика,
      устройство OK-Robot и где он отказывал;
   1) лаборатория «Цель или моменты»: две одинаковые сети на одних
      демонстрациях, пять чашек, пять губок и толчок к столу, рядом;
   2) лаборатория «Поправка»: регулятор без веса кастрюли, поправка
      и сеть с нуля по числу демонстраций;
   3) лаборатория «Слои»: восприятие, выбор захвата, путь и регулятор —
      сети или классике, пять сцен;
   4) квиз.
   Движок — l81/engine.js (без DOM) поверх shared/arm-core.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 };   // ускорение проигрывания для автотестов; на результаты не влияет
function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface'), dark: HeroKit.dark() });
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const cm = (m, d) => fmt(m * 100, d == null ? 1 : d);
const mm = (m, d) => fmt(m * 1000, d == null ? 1 : d);
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const nOf = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
/** Проиграть кадры (шаг 10 мс) со скоростью sp: draw(i) на каждом кадре экрана, промис — по окончании. */
function play(n, sp, draw) {
  return new Promise((res) => {
    const t0 = performance.now(), dur = n * 10 / (sp * SPEED.k);
    (function tick() {
      const el = performance.now() - t0, i = Math.min(n - 1, Math.floor(el / dur * n));
      draw(i);
      if (el >= dur) { draw(n - 1); res(); } else requestAnimationFrame(tick);
    })();
  });
}

/* =====================================================================
   Вид сбоку: рука Ады, стол, предметы, полка (как в уроке 0.3)
   ===================================================================== */
const Side = (() => {
  const E = L81, K = HeroKit;
  /** Вид: x0…x1 и y0…y1 в метрах, ширина W логических пикселей. */
  function view(W, x0, x1, y0, y1) { const S = W / (x1 - x0), H = Math.round((y1 - y0) * S); return { W, H, S, x0, y0, y1, map: (x, y) => ({ x: (x - x0) * S, y: (y1 - y) * S }), inv: (px, py) => ({ x: x0 + px / S, y: y1 - py / S }) }; }
  function base(c, V, P) { c.fillStyle = P.bg; c.fillRect(0, 0, V.W, V.H); K.grid(c, V.W, V.H, Math.round(V.S * 0.05), P.grid); }
  /** Корпус Ады слева: плечо — в начале координат. Ног нет: Ада стоит на колёсной базе ниже кадра. */
  function torso(c, V, P) {
    const a = V.map(-0.14, 0.10), b = V.map(-0.015, -0.40), hA = V.map(-0.135, 0.33), hB = V.map(-0.02, 0.15);
    c.beginPath(); c.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 14); c.fillStyle = P.dark ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink3; c.stroke();
    c.beginPath(); c.roundRect(hA.x, hA.y, hB.x - hA.x, hB.y - hA.y, 16); c.fill(); c.stroke();
    const vA = V.map(-0.09, 0.29), vB = V.map(-0.025, 0.19); c.beginPath(); c.roundRect(vA.x, vA.y, vB.x - vA.x, vB.y - vA.y, 8); c.fillStyle = '#1f2430'; c.fill();
    const e = V.map(-0.045, 0.24); c.beginPath(); c.ellipse(e.x, e.y, 0.009 * V.S, 0.014 * V.S, 0, 0, 7); c.fillStyle = '#eb6834'; c.fill();
  }
  function table(c, V, k, P, o) {
    o = o || {}; const a = V.map(E.TABLE_X0, E.TABLE), r = V.map(V.x0 + V.W / V.S, E.TABLE);
    c.fillStyle = P.surf; c.fillRect(a.x, a.y, r.x - a.x, V.H - a.y);
    c.strokeStyle = P.ink2; c.lineWidth = 2.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(r.x, a.y); c.stroke();
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x, V.H); c.stroke();
    if (o.label !== false) K.label(c, k, 'стол', (a.x + V.map(E.CAM.X0, 0).x) / 2, a.y + 14 * k, { px: 10.5, color: P.ink3, weight: 650, haloColor: P.surf });
  }
  /** Столбики камеры под крышкой стола: высота над столом в каждой из 24 клеток. */
  function camera(c, V, k, P, sc, o) {
    o = o || {}; const N = E.CAM.N, y0 = V.H - 6, hmax = Math.min(46, (V.H - V.map(0, E.TABLE).y) * 0.55);
    const x0 = V.map(E.CAM.X0, 0).x, cw = E.CAM.CELL * V.S;
    c.fillStyle = P.bg; c.fillRect(x0 - 2, y0 - hmax - 4, N * cw + 4, hmax + 8);
    for (let i = 0; i < N; i++) {
      const h = Math.max(0, sc[i]) / 0.28 * hmax, x = x0 + i * cw;
      c.fillStyle = o.mark === i ? (o.markColor || P.e2e) : P.ink2; c.globalAlpha = o.mark === i ? 0.95 : 0.6; c.fillRect(x + 1, y0 - Math.max(1.2, h), cw - 2, Math.max(1.2, h)); c.globalAlpha = 1;
    }
    if (o.found != null) { const fx = V.map(o.found, 0).x, fy = y0 - hmax - 6; c.beginPath(); c.moveTo(fx, fy + 7); c.lineTo(fx - 6, fy - 3); c.lineTo(fx + 6, fy - 3); c.closePath(); c.fillStyle = o.markColor || P.e2e; c.fill(); }
    if (o.label !== false && k < 1.6) K.label(c, k, 'камера', x0 + N * cw - 4, y0 - hmax + 4, { px: 9.5, color: P.ink3, align: 'right', weight: 650, haloColor: P.bg });
  }
  /** Предмет на столе: чашка, высокая кружка, миска, губка, ваза. */
  function object(c, V, k, P, o, opt) {
    opt = opt || {}; const l = V.map(o.x - o.w / 2, E.TABLE + o.h), r = V.map(o.x + o.w / 2, E.TABLE), w = r.x - l.x, h = r.y - l.y;
    const col = { cup: '#c9653c', mug: '#9b5c3a', bowl: '#5f8fb3', sponge: '#e2c044', vase: '#7d8a6b' }[o.type] || P.ink3;
    c.save(); c.globalAlpha = opt.alpha || 1; c.lineWidth = 1.6; c.strokeStyle = P.dark ? '#d8d2c6' : '#3d3c38';
    if (o.type === 'bowl') {
      const bt = V.map(0, E.TABLE + 0.02).y;
      c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.x + w * 0.12, r.y); c.lineTo(r.x - w * 0.12, r.y); c.lineTo(r.x, l.y); c.lineTo(r.x - 0.008 * V.S, l.y); c.lineTo(r.x - w * 0.16, bt); c.lineTo(l.x + w * 0.16, bt); c.lineTo(l.x + 0.008 * V.S, l.y); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
    } else if (o.type === 'vase') {
      c.beginPath(); c.moveTo(l.x + w * 0.3, l.y); c.lineTo(r.x - w * 0.3, l.y); c.quadraticCurveTo(r.x - w * 0.25, l.y + h * 0.3, r.x, l.y + h * 0.55); c.lineTo(r.x - w * 0.1, r.y); c.lineTo(l.x + w * 0.1, r.y); c.lineTo(l.x, l.y + h * 0.55); c.quadraticCurveTo(l.x + w * 0.25, l.y + h * 0.3, l.x + w * 0.3, l.y); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
    } else {
      c.beginPath(); c.roundRect(l.x, l.y, w, h, Math.min(5, h / 3)); c.fillStyle = col; c.fill(); c.stroke();
      if (o.type === 'cup' || o.type === 'mug') { c.beginPath(); c.arc(r.x + 1, l.y + h * 0.45, Math.min(h * 0.22, 0.02 * V.S), -Math.PI / 2, Math.PI / 2); c.stroke(); }
    }
    c.restore();
    if (opt.label && k < 1.6) K.label(c, k, E.TYPES[o.type].name, (l.x + r.x) / 2, Math.max(12 * k, l.y - 10 * k), { px: 10, color: P.ink2, weight: 650, haloColor: P.bg });
  }
  /** Где захват должен остановиться, чтобы взять предмет. */
  function zone(c, V, P, g) { const a = V.map(g.x - g.tx, g.y + g.ty), b = V.map(g.x + g.tx, g.y - g.ty); c.setLineDash([4, 3]); c.strokeStyle = P.good; c.lineWidth = 2; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); c.setLineDash([]); }
  function cross(c, x, y, col, r) { r = r || 8; c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r * 0.6, 0, 7); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke(); }
  /** Рука: два звена, суставы и двухпальцевый захват на конце. */
  function arm(c, V, P, q, col, o) {
    o = o || {}; const k = E.kin(q), b = V.map(0, 0), j = V.map(k.x1, k.y1), e = V.map(k.x, k.y);
    c.save(); c.globalAlpha = o.alpha || 1; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.lineWidth = o.w || 7;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(j.x, j.y); c.lineTo(e.x, e.y); c.stroke();
    const ux = (e.x - j.x), uy = (e.y - j.y), L = Math.hypot(ux, uy) || 1, nx = -uy / L, ny = ux / L, f = 0.022 * V.S, back = 0.02 * V.S;
    const cx = e.x - ux / L * back, cy = e.y - uy / L * back;
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx + nx * f, cy + ny * f); c.lineTo(cx - nx * f, cy - ny * f);
    c.moveTo(cx + nx * f, cy + ny * f); c.lineTo(e.x + nx * f * 0.75, e.y + ny * f * 0.75); c.moveTo(cx - nx * f, cy - ny * f); c.lineTo(e.x - nx * f * 0.75, e.y - ny * f * 0.75); c.stroke();
    for (const [pt, r] of [[b, 6.5], [j, 5]]) { c.beginPath(); c.arc(pt.x, pt.y, r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    c.restore(); return e;
  }
  function arrow(c, x1, y1, x2, y2, col, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1), hd = 8; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw || 3;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * 4, y2 - Math.sin(a) * 4); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45)); c.lineTo(x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45)); c.closePath(); c.fill();
  }
  /** Сила, с которой стол давит на захват: красная стрелка вверх с подписью. */
  function force(c, k, P, x, y, F) {
    if (F <= 0.5) return; const L = Math.min(70, 10 + F * 0.4);
    arrow(c, x, y, x, y - L, P.bad, 3);
    K.label(c, k, `${fmt(F, 0)} Н`, x + 6 * k, y - L - 4 * k, { px: 11.5, weight: 700, color: P.bad, align: 'left', haloColor: P.bg });
  }
  function push(c, k, P, x, y, f) { const L = 46, n = Math.hypot(f[0], f[1]) || 1, dx = f[0] / n, dy = -f[1] / n; arrow(c, x - dx * (L + 10), y - dy * (L + 10), x - dx * 10, y - dy * 10, P.ink3, 3.5); K.label(c, k, 'толчок', x - dx * (L + 22) + 4 * k, y - dy * (L + 22), { px: 10.5, color: P.ink2, weight: 700, align: 'left', haloColor: P.bg }); }
  function trail(c, V, pts, col) { if (pts.length < 2) return; c.save(); c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1.3; c.beginPath(); pts.forEach((p, i) => { const m = V.map(p.x, p.y); if (i) c.lineTo(m.x, m.y); else c.moveTo(m.x, m.y); }); c.stroke(); c.restore(); }
  function pathLine(c, V, P, col, dash) { if (!P) return; c.save(); c.setLineDash(dash || [6, 5]); c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); P.pts.forEach((p, i) => { const m = V.map(p.x, p.y); if (i) c.lineTo(m.x, m.y); else c.moveTo(m.x, m.y); }); c.stroke(); c.restore(); }
  return { view, base, torso, table, camera, object, zone, cross, arm, arrow, force, push, trail, pathLine };
})();

/* =====================================================================
   0а. Схема: два способа замкнуть контур — сеть выдаёт моменты или цель
   ===================================================================== */
(() => {
  const SLOW = 20;   // на схеме время замедлено в 20 раз: 50 Гц — 2,5 импульса в секунду
  function box(c, k, A, P, b, title, sub, col, hot) {
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.18 : 0.07), col, hot ? 2.2 : 1.4);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + b[3] / 2 - (sub ? 7 : 0), { px: 10.5, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] / 2 + 9, { px: 9, color: P.ink2, halo: false });
  }
  const right = (b) => [b[0] + b[2], b[1] + b[3] / 2], left = (b) => [b[0], b[1] + b[3] / 2];
  /** Плавный «идеальный» момент и его ступенчатая копия от сети (с ошибкой). */
  const smooth = (t) => 12 + 6 * Math.sin(t * 1.3) + 2.5 * Math.sin(t * 3.1 + 1);
  const r = HeroKit.rng(7), NOISE = []; for (let i = 0; i < 400; i++) NOISE.push((r() - 0.5) * 6);
  function trace(c, k, A, P, g, t, stepped, col) {
    const [x, y, w, h] = g; A.rect(c, x, y, w, h, 6, P.surf, P.line, 1);
    A.lab(c, k, 'момент в плече', x + 6, y + 9, { px: 9, color: P.ink3, align: 'left', halo: false });
    const span = 4, pts = [], hold = 1 / 50 * SLOW;
    for (let i = 0; i <= 120; i++) {
      const tt = t - span + span * i / 120; let v;
      if (stepped) { const n = Math.floor(tt / hold); v = smooth(n * hold) + NOISE[((n % 400) + 400) % 400]; } else v = smooth(tt);
      pts.push([x + 4 + (w - 8) * i / 120, y + h - 6 - (v - 2) / 24 * (h - 18)]);
    }
    A.line(c, pts, col, 2);
  }
  /** Импульсы по стрелке: rate — сообщений в секунду схемы. */
  function pulses(c, A, a, b, t, rate, col) {
    const n = Math.max(1, Math.round(rate * 0.6));
    for (let i = 0; i < n; i++) { const s = ((t * rate + i) / n) % 1, p = (t * rate / n + i / n) % 1; const u = rate > 10 ? p : s; A.circle(c, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, rate > 10 ? 2.2 : 3.6, col, null); }
  }
  function draw(c, k, t, P, A, L) {
    const net = 50 / SLOW, ctl = 1000 / SLOW;
    // верхний ряд: сеть → моменты
    A.lab(c, k, L.titleA, L.tA[0], L.tA[1], { px: 11.5, weight: 700, color: P.ink, align: 'left', halo: false });
    const [ca, na, ma] = L.A;
    box(c, k, A, P, ca, 'камера', 'и датчики', P.ink3); box(c, k, A, P, na, 'сеть', '50 раз в с', P.mot, (t * net) % 1 < 0.35); box(c, k, A, P, ma, 'моторы', 'моменты', P.ink3);
    A.arrow(c, ...right(ca), ...left(na), P.ink3, 1.6, 6); A.arrow(c, ...right(na), ...left(ma), P.mot, 1.8, 7);
    pulses(c, A, right(na), left(ma), t, net, P.mot);
    A.line(c, [[ma[0] + ma[2] / 2, ma[1] + ma[3]], [ma[0] + ma[2] / 2, ma[1] + ma[3] + L.fb], [ca[0] + ca[2] / 2, ca[1] + ca[3] + L.fb], [ca[0] + ca[2] / 2, ca[1] + ca[3] + 3]], A.alpha(P.ink3, 0.6), 1.2, [4, 4]);
    trace(c, k, A, P, L.trA, t, true, P.mot);
    // нижний ряд: сеть → цель → путь и импеданс → моменты
    A.lab(c, k, L.titleB, L.tB[0], L.tB[1], { px: 11.5, weight: 700, color: P.ink, align: 'left', halo: false });
    const [cb, nb, ib, mb] = L.B;
    box(c, k, A, P, cb, 'камера', 'и датчики', P.ink3); box(c, k, A, P, nb, 'сеть', '50 раз в с', P.mot, (t * net) % 1 < 0.35); box(c, k, A, P, ib, L.narrow ? 'импеданс' : 'путь и импеданс', '1000 раз в с', P.out, true); box(c, k, A, P, mb, 'моторы', 'моменты', P.ink3);
    A.arrow(c, ...right(cb), ...left(nb), P.ink3, 1.6, 6); A.arrow(c, ...right(nb), ...left(ib), P.mot, 1.8, 7); A.arrow(c, ...right(ib), ...left(mb), P.out, 1.8, 7);
    const mid = [(right(nb)[0] + left(ib)[0]) / 2, right(nb)[1]];
    A.lab(c, k, 'цель', mid[0], nb[1] - 8, { px: 9.5, weight: 700, color: P.mot, halo: false });
    pulses(c, A, right(nb), left(ib), t, net, P.mot); pulses(c, A, right(ib), left(mb), t, ctl, P.out);
    A.line(c, [[mb[0] + mb[2] / 2, mb[1] + mb[3]], [mb[0] + mb[2] / 2, mb[1] + mb[3] + L.fb], [ib[0] + ib[2] / 2, ib[1] + ib[3] + L.fb], [ib[0] + ib[2] / 2, ib[1] + ib[3] + 3]], A.alpha(P.out, 0.7), 1.2, [4, 4]);
    A.line(c, [[ib[0] + ib[2] / 2, ib[1] + ib[3] + L.fb], [cb[0] + cb[2] / 2, cb[1] + cb[3] + L.fb], [cb[0] + cb[2] / 2, cb[1] + cb[3] + 3]], A.alpha(P.ink3, 0.6), 1.2, [4, 4]);
    trace(c, k, A, P, L.trB, t, false, P.out);
  }
  const bx = (x, y, w, h) => [x, y, w, h || 48];
  const wide = { narrow: false, titleA: 'Сеть → моменты', tA: [16, 22], titleB: 'Сеть → цель → классика', tB: [16, 192], fb: 18,
    A: [bx(16, 48, 96), bx(150, 48, 104), bx(292, 48, 96)], trA: [430, 40, 274, 100],
    B: [bx(16, 218, 96), bx(150, 218, 104), bx(300, 218, 128), bx(462, 218, 90)], trB: [580, 208, 124, 100] };
  const narrowL = { narrow: true, titleA: 'Сеть → моменты', tA: [10, 14], titleB: 'Сеть → цель → классика', tB: [10, 214], fb: 14,
    A: [bx(8, 30, 100, 46), bx(128, 30, 100, 46), bx(248, 30, 104, 46)], trA: [8, 104, 344, 80],
    B: [bx(4, 230, 80, 46), bx(92, 230, 80, 46), bx(180, 230, 92, 46), bx(280, 230, 76, 46)], trB: [8, 304, 344, 80] };
  Anim.add('loop81', {
    W: 720, H: 360, start: 1.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); A.lab(c, k, 'Оранжевым — сеть, синим — классика; пунктир снизу — обратная связь от датчиков', 360, 346, { px: 10, color: P.ink3, halo: false }); },
    narrow: { W: 360, H: 420, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrowL); A.lab(c, k, 'оранжевым — сеть, синим — классика', 180, 404, { px: 10, color: P.ink3, halo: false }); } },
  });
})();

/* =====================================================================
   0б. Схема: остаточная политика — регулятор плюс поправка
   ===================================================================== */
(() => {
  const T = 12;   // три переноса по 4 с: поправка 0, наполовину обучена, обучена
  function draw(c, k, t, P, A, L) {
    const u = ((t % T) + T) % T, ep = Math.floor(u / 4), s = (u % 4) / 3, p = [0, 0.55, 1][ep], { lab, rect, arrow, line, alpha, circle } = A;
    // блок-схема
    const [sx, sy] = L.state, R = L.reg, N = L.net, S = L.sum, M = L.mot;
    rect(c, sx, sy, 92, 44, 9, alpha(P.ink3, 0.08), P.ink3, 1.3); lab(c, k, 'состояние', sx + 46, sy + 15, { px: 10.5, weight: 700, color: P.ink2, halo: false }); lab(c, k, 'углы, скорости', sx + 46, sy + 31, { px: 9, color: P.ink3, halo: false });
    rect(c, R[0], R[1], R[2], 44, 9, alpha(P.out, 0.1), P.out, 1.6); lab(c, k, 'регулятор', R[0] + R[2] / 2, R[1] + 15, { px: 10.5, weight: 700, color: P.out, halo: false }); lab(c, k, 'модель без кастрюли', R[0] + R[2] / 2, R[1] + 31, { px: 9, color: P.ink2, halo: false });
    rect(c, N[0], N[1], N[2], 44, 9, alpha(P.mot, 0.06 + 0.12 * p), P.mot, 1.2 + p); lab(c, k, 'сеть-поправка', N[0] + N[2] / 2, N[1] + 15, { px: 10.5, weight: 700, color: P.mot, halo: false }); lab(c, k, p === 0 ? 'выход = 0' : p < 1 ? 'учится' : 'обучена', N[0] + N[2] / 2, N[1] + 31, { px: 9, color: P.ink2, halo: false });
    circle(c, S[0], S[1], 13, P.surf, P.ink2, 1.6); lab(c, k, '+', S[0], S[1], { px: 15, weight: 800, color: P.ink, halo: false });
    rect(c, M[0], M[1], 80, 44, 9, alpha(P.ink3, 0.08), P.ink3, 1.3); lab(c, k, 'моторы', M[0] + 40, M[1] + 22, { px: 10.5, weight: 700, color: P.ink2, halo: false });
    arrow(c, sx + 92, sy + 22, R[0] - 2, R[1] + 22, P.ink3, 1.5, 6); arrow(c, sx + 92, sy + 22, N[0] - 2, N[1] + 22, P.ink3, 1.5, 6);
    arrow(c, R[0] + R[2] + 2, R[1] + 22, S[0] - 14, S[1] - 6, P.out, 1.8, 7); arrow(c, N[0] + N[2] + 2, N[1] + 22, S[0] - 14, S[1] + 6, alpha(P.mot, 0.3 + 0.7 * p), 1.4 + p, 7);
    arrow(c, S[0] + 14, S[1], M[0] - 2, M[1] + 22, P.ink2, 1.8, 7);
    // столбики: вклад регулятора и поправки
    const [bx0, by0, bw] = L.bars; lab(c, k, 'момент в плече, Н·м', bx0, by0 - 10, { px: 9, color: P.ink3, align: 'left', halo: false });
    rect(c, bx0, by0, bw * 0.62, 10, 3, P.out, null); lab(c, k, 'регулятор', bx0 + bw * 0.62 + 6, by0 + 5, { px: 9, color: P.out, align: 'left', halo: false });
    rect(c, bx0, by0 + 16, Math.max(1.5, bw * 0.38 * p), 10, 3, P.mot, null); lab(c, k, 'поправка', bx0 + Math.max(1.5, bw * 0.38 * p) + 6, by0 + 21, { px: 9, color: P.mot, align: 'left', halo: false });
    // вид сбоку: край полки и путь кастрюли
    const V = L.view, map = (x, y) => [V[0] + (x - 0.3) * V[2], V[1] - (y - 0.15) * V[2]], sy0 = 0.25;
    const e0 = map(0.5, sy0), e1 = map(0.95, sy0 - 0.02); rect(c, e0[0], e0[1], e1[0] - e0[0], e1[1] - e0[1], 2, P.ink3, null);
    lab(c, k, 'полка', map(0.8, sy0)[0], map(0.8, sy0)[1] + 22, { px: 9.5, color: P.ink3, halo: false });
    const path = [[0.36, 0.20], [0.36, 0.375], [0.64, 0.375], [0.64, 0.335]].map(([x, y]) => map(x, y));
    line(c, path, P.out, 1.6, [5, 4]);
    lab(c, k, 'путь классики', path[1][0] + 6, path[1][1] - 9, { px: 9.5, color: P.out, align: 'left', halo: false });
    // положение кастрюли: s — доля пути, провис = 3,9 см · (1 − p)
    const seg = (q) => { const L1 = 0.175, L2 = 0.28, L3 = 0.04, d = q * (L1 + L2 + L3); if (d < L1) return [0.36, 0.20 + d]; if (d < L1 + L2) return [0.36 + (d - L1), 0.375]; return [0.64, 0.375 - (d - L1 - L2)]; };
    const sag = 0.039 * (1 - p), over = (q) => { const [x, y] = seg(q); return x + 0.06 > 0.5 && x - 0.06 < 0.5 && y - sag - 0.09 < sy0; };
    let q = Math.min(1, s), hit = false;
    for (let z = 0; z <= q; z += 0.005) if (over(z)) { q = z; hit = true; break; }
    let [px, py] = seg(q); py -= sag;
    const a = map(px - 0.06, py), b = map(px + 0.06, py - 0.09);
    rect(c, a[0], a[1], b[0] - a[0], b[1] - a[1], 4, alpha('#6c7a89', 0.85), P.ink2, 1.3);
    circle(c, map(px, py)[0], map(px, py)[1], 3, P.ink, null);
    if (hit) { const h = map(0.5, sy0); HeroKit.cross(c, h[0], h[1], 7, P.bad, 2.6); }
    const cap = ep === 0 ? 'поправка = 0: кастрюля провисает и задевает край' : ep === 1 ? 'поправка учится: провис меньше' : 'поправка держит вес: кастрюля идёт по пути';
    lab(c, k, cap, L.cap[0], L.cap[1], { px: L.narrow ? 10 : 10.5, weight: 650, color: hit ? P.bad : P.ink2, align: L.capAlign || 'center', halo: false });
  }
  const wide = { state: [14, 60], reg: [140, 22, 140], net: [140, 100, 140], sum: [318, 82], mot: [350, 60], bars: [16, 214, 260], view: [330, 312, 590], cap: [520, 348] };
  const narrowL = { narrow: true, state: [6, 52], reg: [104, 14, 124], net: [104, 92, 124], sum: [250, 74], mot: [274, 52], motW: 80, bars: [12, 182, 200], view: [10, 440, 500], cap: [180, 236] };
  // в узкой раскладке «моторы» уже экрана: блок короче
  Anim.add('resid81', {
    W: 720, H: 360, start: 2.4, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); },
    narrow: { W: 360, H: 470, draw(c, k, t, P, A) { const L = Object.assign({}, narrowL); draw(c, k, t, P, A, L); } },
  });
})();

/* =====================================================================
   0в. Схема: как устроен OK-Robot и где он отказывал (рисунок 6 статьи)
   ===================================================================== */
(() => {
  const T = 10;
  const MODS = [
    { t: 'скан дома', s: 'видео айфоном', k: 'ink' },
    { t: 'карта VoxelMap', s: 'CLIP, OWL-ViT, SAM', k: 'nn' },
    { t: 'путь базы', s: 'A*, сетка 10 см', k: 'cl' },
    { t: 'захват', s: 'AnyGrasp', k: 'nn' },
    { t: 'подход руки', s: 'по прямой, 4 точки', k: 'cl' },
    { t: 'положить', s: 'эвристика', k: 'cl' },
  ];
  // доли от всех попыток, % (рисунок 6): успех, сорвался поиск предмета, сорвался захват, остальное
  const BARS = [{ t: 'загромождённые дома', ok: 58.5, find: 15, grasp: 25 }, { t: 'после уборки', ok: 82.4, find: 4, grasp: 13 }];
  function draw(c, k, t, P, A, L) {
    const u = ((t % T) + T) % T, cur = Math.min(5, Math.floor(u / (T / 6.5))), { rect, lab, arrow, alpha, circle } = A;
    MODS.forEach((m, i) => {
      const [x, y, w, h] = L.box(i), col = m.k === 'nn' ? P.mot : m.k === 'cl' ? P.out : P.ink3, hot = i === cur;
      rect(c, x, y, w, h, 9, alpha(col, hot ? 0.2 : 0.07), col, hot ? 2.4 : 1.3);
      lab(c, k, m.t, x + w / 2, y + h / 2 - 7, { px: L.narrow ? 10 : 10.5, weight: 700, color: col, halo: false });
      lab(c, k, m.s, x + w / 2, y + h / 2 + 9, { px: 9, color: P.ink2, halo: false });
      if (i < 5) { const [a, b] = L.link(i); arrow(c, a[0], a[1], b[0], b[1], P.ink3, 1.5, 6); }
    });
    // задача — точка, которая идёт по модулям
    const [x, y, w] = L.box(cur); circle(c, x + w / 2, y - 6, 4.5, P.ink, null);
    // столбики отказов
    const [bx, by, bw, bh, gap] = L.bars;
    lab(c, k, 'доли попыток, %', bx, by - 26, { px: 9.5, color: P.ink3, align: 'left', halo: false });
    BARS.forEach((b, j) => {
      const y0 = by + j * (bh + gap), X = (v) => bw * v / 100; let x0 = bx;
      lab(c, k, b.t, bx, y0 - 4 + (L.narrow ? 0 : 0), { px: 9.5, weight: 650, color: P.ink2, align: 'left', halo: false });
      const segs = [[b.ok, P.good, `успех ${fmt(b.ok, 1)}`, -1], [b.find, P.mot, `поиск ${fmt(b.find, 0)}`, 1], [b.grasp, P.bad, `захват ${fmt(b.grasp, 0)}`, 3], [100 - b.ok - b.find - b.grasp, P.ink3, '', -2]];
      segs.forEach(([v, col, txt, mod]) => {
        const hot = mod === cur || (mod === 3 && cur === 4);
        rect(c, x0, y0 + 4, Math.max(0.5, X(v)), bh - 8, 2, alpha(col, hot ? 0.95 : 0.55), null);
        if (txt && X(v) > 44) lab(c, k, txt, x0 + X(v) / 2, y0 + bh / 2, { px: 9, weight: 700, color: '#fff', halo: false });
        else if (txt) lab(c, k, txt, x0 + X(v) / 2, mod === 1 ? y0 - 4 : y0 + bh + 6, { px: 9, weight: 700, color: col, halo: false });
        x0 += X(v);
      });
    });
    lab(c, k, L.narrow ? 'поиск — карта не нашла предмет;' : 'поиск — карта не нашла предмет; захват — сорвался захват или подход руки; серым — остальные отказы', bx, L.note, { px: 9, color: P.ink3, align: 'left', halo: false });
    if (L.narrow) lab(c, k, 'захват — сорвался захват или подход руки', bx, L.note + 14, { px: 9, color: P.ink3, align: 'left', halo: false });
  }
  const wide = {
    box: (i) => [10 + i * 118, 46, 106, 56], link: (i) => [[116 + i * 118, 74], [128 + i * 118, 74]],
    bars: [40, 160, 640, 40, 38], note: 322,
  };
  const narrowL = {
    narrow: true,
    box: (i) => { const r = Math.floor(i / 2), col = r % 2 ? 1 - (i % 2) : i % 2; return [12 + col * 178, 22 + r * 84, 158, 52]; },
    link: (i) => { const r = Math.floor(i / 2), col = r % 2 ? 1 - (i % 2) : i % 2; if (i % 2 === 0) return col === 0 ? [[170, 48 + r * 84], [190, 48 + r * 84]] : [[190, 48 + r * 84], [170, 48 + r * 84]]; const x = 12 + col * 178 + 79; return [[x, 74 + r * 84], [x, 106 + r * 84]]; },
    bars: [12, 300, 336, 34, 52], note: 448,
  };
  Anim.add('okrobot', {
    W: 720, H: 340, start: 3, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); A.lab(c, k, 'Оранжевым — нейросети, синим — классика', 710, 14, { px: 10, color: P.ink3, align: 'right', halo: false }); },
    narrow: { W: 360, H: 480, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrowL); } },
  });
})();

/* =====================================================================
   1. Лаборатория: одна задача, две сети — моменты или цель
   ===================================================================== */
const Lab1 = (() => {
  const E = L81, K = HeroKit, V = Side.view(600, -0.07, 0.88, -0.225, 0.505);
  const TESTS = { cups: 'Пять чашек', sponges: 'Пять губок', push: 'Толчок к столу', own: 'Своя сцена' };
  const st = { test: 'cups', own: { type: 'cup', x: 0.62, push: false }, busy: false, prog: 0, nets: null, res: {}, cur: null, run: 0, frame: -1, done: {} };
  let ctl = null, training = null;
  /** Сети учатся один раз; второй вызов ждёт того же обучения. */
  function ensureNets() {
    if (st.nets) return Promise.resolve(st.nets);
    if (!training) {
      st.busy = true; st.prog = 0; render();
      let last = 0;
      training = runChunked(E.lab1Train(E.CFG.SEED), (ev) => { st.prog = ev.p; const now = performance.now(); if (now - last > 120) { last = now; progress(); } }, 14)
        .then((n) => { st.nets = n; st.busy = false; render(); return n; });
    }
    return training;
  }
  function result(test) {
    const key = test === 'own' ? `own|${st.own.type}|${st.own.x.toFixed(3)}|${st.own.push ? 1 : 0}` : test;
    if (!st.res[key]) st.res[key] = E.lab1Test(st.nets, test, st.own);
    return st.res[key];
  }
  const sceneObjs = () => { const r = st.cur ? st.cur.runs[st.run] : null; return r ? [E.obj(r.type, r.x)] : [E.obj(st.test === 'sponges' ? 'sponge' : st.test === 'own' ? st.own.type : 'cup', st.test === 'own' ? st.own.x : st.test === 'push' ? E.LAB1.PX : E.LAB1.XS[2])]; };
  function drawPane(side) {
    const cv = $(side === 'e2e' ? '#aCvL' : '#aCvR'), { c, k } = K.fit(cv, V.W, V.H), P = pal(), col = side === 'e2e' ? P.e2e : P.hy;
    Side.base(c, V, P); Side.table(c, V, k, P);
    const objs = sceneObjs(), o = objs[0], G = E.graspOf(o), runRes = st.cur ? st.cur.runs[st.run] : null, ep = runRes ? runRes[side] : null;
    const sc = E.scan(objs, E.rng(runRes ? 500 + (st.cur.test === 'sponges' ? 10 : st.cur.test === 'push' ? 20 : st.cur.test === 'own' ? 30 : 0) + (st.cur.test === 'cups' || st.cur.test === 'sponges' ? st.run : 0) : 1));
    Side.camera(c, V, k, P, sc);
    Side.object(c, V, k, P, o, { label: true }); Side.zone(c, V, P, G);
    Side.torso(c, V, P);
    if (!ep) {
      Side.arm(c, V, P, E.ik(E.START.x, E.START.y), col);
      K.label(c, k, st.busy ? 'сети учатся…' : (k > 1.5 ? 'нажми кнопку миссии' : 'сделай ставку и нажми кнопку миссии'), V.W * 0.62, 40, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
      return;
    }
    const i = Math.max(0, Math.min(ep.frames.length - 1, st.frame)), f = ep.frames[i];
    if (side === 'tgt') { const P0 = E.approach({ x: ep.frames[0].x, y: ep.frames[0].y }, f.tgt); Side.pathLine(c, V, P0, col, [6, 5]); const m = V.map(f.tgt.x, f.tgt.y); Side.cross(c, m.x, m.y, P.e2e, 9); }
    Side.trail(c, V, ep.frames.slice(Math.max(0, i - 100), i + 1), col);
    const e = Side.arm(c, V, P, f.q, col);
    if (f.F > 0.5) Side.force(c, k, P, e.x + 14, e.y + 4, f.F);
    const pu = E.LAB1.PUSH; if (st.cur.test === 'push' || (st.cur.test === 'own' && st.own.push)) if (f.t >= pu.t - 0.15 && f.t < pu.t + pu.dur + 0.1) Side.push(c, k, P, e.x, e.y, pu.f);
    K.label(c, k, `${fmt(f.t, 1)} с`, V.W - 10, 16, { px: 10.5, color: P.ink3, align: 'right', mono: true, haloColor: P.bg });
  }
  const alpha = (c, a) => Anim.kit.alpha(c, a);
  function drawPlot() {
    const cv = $('#aPlot'), narrow = (cv.getBoundingClientRect().width || 640) < 460, W = narrow ? 380 : 640, H = narrow ? 230 : 210;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(); c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = 44, R = 10, T = 14, B = 26, gw = W - L - R, gh = H - T - B;
    const runRes = st.cur ? st.cur.runs[st.run] : null;
    if (!runRes) { K.label(c, k, narrow ? 'нажми кнопку миссии' : 'график появится после проверки: сделай ставку и нажми кнопку миссии', W / 2, H / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const Tm = runRes.e2e.frames[runRes.e2e.frames.length - 1].t;
    // шкала — по данным всего прогона, чтобы были видны и ступеньки, и толчок
    let mn = Infinity, mx = -Infinity; for (const sd of ['e2e', 'tgt']) for (const f of runRes[sd].frames) { mn = Math.min(mn, f.tau[0]); mx = Math.max(mx, f.tau[0]); }
    const stp = mx - mn > 30 ? 10 : 5, lo = Math.floor((mn - 1) / stp) * stp, hi = Math.ceil((mx + 1) / stp) * stp;
    const X = (t) => L + gw * t / Tm, Y = (v) => T + gh * (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = lo; v <= hi + 1e-9; v += stp) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); K.label(c, k, fmt(v, 0), L - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false, mono: true }); }
    for (let t = 0; t <= Tm + 1e-9; t += 1) K.label(c, k, `${fmt(t, 0)} с`, X(t), H - 10, { px: 10, color: P.ink3, halo: false, mono: true });
    if (st.cur.test === 'push' || (st.cur.test === 'own' && st.own.push)) { const pu = E.LAB1.PUSH; c.fillStyle = alpha(P.ink3, 0.18); c.fillRect(X(pu.t), T, X(pu.t + pu.dur) - X(pu.t), gh); K.label(c, k, 'толчок', X(pu.t + pu.dur) + 4, T + gh - 8, { px: 9.5, color: P.ink2, align: 'left', haloColor: P.surf }); }
    K.label(c, k, 'момент в плече, Н·м', L + 4, T + 2, { px: 9.5, color: P.ink3, align: 'left', haloColor: P.surf });
    for (const [side, col] of [['e2e', P.e2e], ['tgt', P.hy]]) {
      const fr = runRes[side].frames, n = Math.min(fr.length, st.frame + 1); if (n < 2) continue;
      // у сети-моменты момент держится до следующего ответа — рисуем ступеньками
      c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); for (let i = 0; i < n; i++) { const x = X(fr[i].t), y = Y(fr[i].tau[0]); if (!i) c.moveTo(x, y); else if (side === 'e2e') { c.lineTo(x, Y(fr[i - 1].tau[0])); c.lineTo(x, y); } else c.lineTo(x, y); } c.stroke();
    }
  }
  /** Строка под панелью: что вышло в текущем прогоне и в проверке целиком. */
  function stat(side) {
    const el = $(side === 'e2e' ? '#aStatL' : '#aStatR');
    if (!st.cur) { setOut(el, st.busy ? 'Сети учатся…' : 'Ещё не запускалась'); el.className = 'pane-stat'; return; }
    const r = st.cur.runs[st.run][side], s = st.cur[side], name = st.cur.runs[st.run].type === 'cup' ? 'чашка' : 'губка', n = st.cur.runs.length;
    const head = n > 1 ? `${name} ${st.run + 1} из ${n}: ` : '';
    const now = st.frame >= r.frames.length - 1 ? `${r.ok ? '<b>взяла</b>' : '<b>не взяла</b>'} · промах ${cm(r.err)} см${r.peak > 0.5 ? ` · стол ${fmt(r.peak, 0)} Н` : ''}` : 'едет…';
    setOut(el, head + now + (st.done[st.cur.test] && n > 1 ? ` · всего ${s.ok} из ${n}` : ''));
    el.className = 'pane-stat' + (st.frame >= r.frames.length - 1 ? (r.ok ? ' ok' : ' bad') : '');
  }
  function board() {
    const row = (name, a, b, cur) => `<div class="ab-row${cur ? ' cur' : ''}"><span><b>${name}</b></span><span>${a}</span><span>${b}</span></div>`;
    const R = (t) => (st.done[t] ? st.res[t] : null), dash = '<span class="muted">ещё не запускалась</span>';
    let h = row('Проверка', 'Сеть-моменты', 'Сеть-цель и классика').replace('ab-row', 'ab-row ab-h');
    const c = R('cups'), s = R('sponges'), p = R('push');
    h += row('Пять чашек', c ? `взяла ${c.e2e.ok} из 5 · промах ${cm(c.e2e.err)} см · дрожь ${mm(c.e2e.jitMed)} мм` : dash, c ? `взяла ${c.tgt.ok} из 5 · промах ${cm(c.tgt.err)} см · дрожь ${mm(c.tgt.jitMed)} мм` : dash, st.test === 'cups');
    h += row('Пять губок', s ? `взяла ${s.e2e.ok} из 5 · касаний стола ${s.e2e.touch}${s.e2e.touch ? `, до ${fmt(s.e2e.peak, 0)} Н` : ''}` : dash, s ? `взяла ${s.tgt.ok} из 5 · касаний стола ${s.tgt.touch}${s.tgt.touch ? `, до ${fmt(s.tgt.peak, 0)} Н` : ''}` : dash, st.test === 'sponges');
    const back = (q) => (q.back <= 0.015 ? 'вернулась к чашке' : `не вернулась: ${cm(q.back)} см от прежнего места`);
    h += row('Толчок к столу', p ? `стол давил ${fmt(p.e2e.peak, 0)} Н · ${back(p.e2e)}` : dash, p ? `стол давил ${fmt(p.tgt.peak, 0)} Н · ${back(p.tgt)}` : dash, st.test === 'push');
    setOut($('#aBoard'), h);
  }
  function progress() { const pg = $('#aProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%'; if (st.busy) setOut($('#aOut'), `Сети учатся в браузере: ${Math.round(st.prog * 100)}%.`); drawPane('e2e'); drawPane('tgt'); stat('e2e'); stat('tgt'); }
  function render() {
    drawPane('e2e'); drawPane('tgt'); drawPlot(); stat('e2e'); stat('tgt'); board();
    segSet('#aTest', st.test); segSet('#aObj', st.own.type); $('#aPush').checked = st.own.push;
    const pg = $('#aProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) setOut($('#aOut'), `Сети учатся в браузере: ${Math.round(st.prog * 100)}%.`);
    else if (!st.nets) setOut($('#aOut'), 'Сети ещё не обучены: первая проверка обучит обе на одних и тех же 100 демонстрациях.');
    else setOut($('#aOut'), st.cur ? `${TESTS[st.cur.test]}${st.cur.test === 'own' ? ` (${st.own.type === 'cup' ? 'чашка' : 'губка'} в ${cm(st.own.x, 0)} см от плеча${st.own.push ? ', толчок' : ''})` : ''}: прогон ${st.run + 1} из ${st.cur.runs.length}.` : 'Сети обучены. Выбери проверку и запусти её.');
  }
  /** Запустить проверку: обучить сети (один раз), посчитать прогоны и проиграть их на обеих панелях. */
  async function runTest(test) {
    st.test = test || st.test; render();
    await ensureNets();
    const r = result(st.test); st.cur = r;
    const sp = r.test === 'push' || (r.test === 'own' && st.own.push) ? 1.6 : 3;
    for (let i = 0; i < r.runs.length; i++) { st.run = i; await play(r.runs[i].e2e.frames.length, sp, (j) => { st.frame = j; drawPane('e2e'); drawPane('tgt'); drawPlot(); stat('e2e'); stat('tgt'); }); }
    st.done[r.test] = true; render(); if (ctl) ctl.update();
    return Object.assign({ test: r.test, n: r.runs.length }, { e2e: r.e2e, tgt: r.tgt });
  }
  function setOwn(o) { Object.assign(st.own, o); st.test = 'own'; render(); }
  const api = {
    reset() { st.test = 'cups'; st.cur = null; st.frame = -1; st.run = 0; st.done = {}; render(); },
    state: () => ({ test: st.test, done: Object.assign({}, st.done), busy: st.busy }), render, st, runTest, ensureNets, result,
  };
  const pct = (a) => fmt(a * 100, 0);
  const missions = [
    { short: 'Чашки', title: 'Пять чашек', text: 'Чашки стоят в 48, 55, 62, 69 и 76 см от плеча. Обе сети обучатся на одних и тех же 100 демонстрациях, потом каждая рука возьмёт все пять чашек. Сравни, насколько точно захват встаёт в рамку и как он ведёт себя у цели.',
      onEnter: (X) => { st.test = 'cups'; X.render(); },
      bet: { q: 'у какой руки промах будет меньше?', options: ['У сети-моменты: она управляет каждым движением сама и может поправить его в любой момент', 'У сети-цель и классики', 'Одинаковый: сети одного размера и учились на одних демонстрациях'], answer: (r) => (Math.abs(r.e2e.err - r.tgt.err) < 0.003 ? 2 : r.e2e.err < r.tgt.err ? 0 : 1) },
      action: { label: 'Обучить сети и проверить на пяти чашках', run: (X) => X.runTest('cups') },
      criteria: [{ label: 'Обе сети обучены на одних демонстрациях', test: () => !!st.nets }, { label: 'Обе руки взяли пять чашек', test: (r) => r.test === 'cups' && r.n === 5 }],
      explain: (r) => `Сеть-цель и классика: взяла ${r.tgt.ok} из 5, промах в среднем ${cm(r.tgt.err)} см, дрожь у цели ${mm(r.tgt.jitMed)} мм. Сеть-моменты: ${r.e2e.ok} из 5, промах ${cm(r.e2e.err)} см, дрожь ${mm(r.e2e.jitMed)} мм${r.e2e.jitMax > 0.02 ? `, а у одной чашки — ${mm(r.e2e.jitMax, 0)} мм` : ''}. Посмотри на график: момент сети меняется ступеньками раз в 20 мс, а у регулятора — плавно. Ошибка сети-цель остаётся ошибкой в точке; ошибка сети-моменты — это лишний момент, и рука уходит туда, где демонстраций не было.` },
    { short: 'Губки', title: 'Пять губок у стола', text: 'Губка лежит низко: захват должен остановиться в 1,5 см над столом. Губки стоят в тех же пяти местах. Сила, с которой захват давит на стол, — красная стрелка.',
      onEnter: (X) => { st.test = 'sponges'; X.render(); },
      bet: { q: 'какая рука коснётся стола?', options: ['Ни одна: обе видели губки в демонстрациях', 'Только рука под сетью-моменты', 'Обе: до стола всего 1,5 см'], answer: (r) => (r.e2e.touch && r.tgt.touch ? 2 : r.e2e.touch ? 1 : r.tgt.touch ? 2 : 0) },
      action: { label: 'Проверить на пяти губках', run: (X) => X.runTest('sponges') },
      criteria: [{ label: 'Обе руки взяли пять губок', test: (r) => r.test === 'sponges' && r.n === 5 }],
      explain: (r) => `Рука под регулятором ${r.tgt.touch ? `коснулась стола ${nOf(r.tgt.touch, 'раз', 'раза', 'раз')}` : 'ни разу не коснулась стола'} и взяла ${r.tgt.ok} губок из 5. Рука под сетью-моменты коснулась стола в ${nOf(r.e2e.touch, 'прогоне', 'прогонах', 'прогонах')} из 5, сильнее всего — ${fmt(r.e2e.peak, 0)} Н, и взяла ${r.e2e.ok} из 5. Регулятор тянет захват к точке над столом и тормозит у неё: даже если сеть-цель ошибётся на сантиметр вниз, стол получит не больше жёсткости, умноженной на ошибку. У сети-моменты такой границы нет.` },
    { short: 'Толчок', title: 'Толчок к столу', text: 'Захват уже у чашки. Через 2,2 с Аду толкают вниз, к столу: 40 Н на 0,12 с. Обе руки получают один и тот же толчок.',
      onEnter: (X) => { st.test = 'push'; X.render(); },
      bet: { q: 'с какой силой каждая рука прижмёт захват к столу?', options: ['Одинаково: толчок один и тот же', 'Рука под сетью-моменты — в разы сильнее', 'Рука под регулятором — сильнее: импеданс мягкий, толчок продавит его до стола'], answer: (r) => (r.e2e.peak > 2 * Math.max(1, r.tgt.peak) ? 1 : r.tgt.peak > 2 * Math.max(1, r.e2e.peak) ? 2 : 0) },
      action: { label: 'Толкнуть', run: (X) => X.runTest('push') },
      criteria: [{ label: 'Обе руки получили толчок', test: (r) => r.test === 'push' }],
      explain: (r) => `Регулятор прогнулся до стола и прижал захват с силой ${fmt(r.tgt.peak, 0)} Н, а потом пружина вернула его к чашке. Сеть-моменты ударила по столу с силой ${fmt(r.e2e.peak, 0)} Н — в ${fmt(r.e2e.peak / Math.max(1, r.tgt.peak), 0)} раз сильнее — и ${r.e2e.back > 0.015 ? `осталась в ${cm(r.e2e.back)} см от прежнего места` : 'вернулась'}. Посмотри на график: регулятор в ответ на толчок сразу поднял момент в плече на ${fmt(r.tgt.resp, 0)} Н·м — пружина и демпфер затормозили руку. Сеть-моменты такой скорости в демонстрациях не видела и подняла момент лишь на ${fmt(r.e2e.resp, 0)} Н·м, и рука провалилась до стола.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбери проверку или поставь свою сцену: передвинь чашку или губку по столу и, если хочешь, толкни руку к столу. Найди место на столе, где сеть-моменты промахивается сильнее всего, и сравни с сетью-цель там же.', final: true, controls: ['test', 'own'],
      action: { label: 'Запустить', run: (X) => X.runTest(st.test) } },
  ];
  function init() {
    segBind('#aTest', (v) => { st.test = v; render(); if (ctl) ctl.update(); });
    segBind('#aObj', (v) => setOwn({ type: v }));
    $('#aPush').addEventListener('change', (e) => setOwn({ push: e.target.checked }));
    for (const id of ['#aCvL', '#aCvR']) K.drag($(id), V.W, V.H, {
      hit: (p) => { if (st.test !== 'own' || !(ctl && ctl.index === missions.length - 1)) return null; const w = V.inv(p.x, p.y), o = E.obj(st.own.type, st.own.x); return Math.abs(w.x - o.x) < o.w / 2 + 0.03 && w.y < E.TABLE + o.h + 0.04 && w.y > E.TABLE - 0.04 ? 'obj' : null; },
      move: (o, p) => { const w = V.inv(p.x, p.y); st.own.x = Math.max(0.47, Math.min(0.78, w.x)); st.cur = null; render(); },
    });
    ctl = mountMissions('#aMis', missions, api, { controls: { test: '#wrapATest', own: '#wrapAOwn' }, scene: '#aDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: кастрюля на полку — регулятор, поправка, сеть с нуля
   ===================================================================== */
const Lab2 = (() => {
  const E = L81, K = HeroKit, V = Side.view(600, -0.12, 0.98, -0.22, 0.58), NS = E.LAB2.NS, MID = 4;
  const NAMES = { base: 'регулятор', res: 'регулятор с поправкой', scr: 'сеть с нуля' };
  const st = { ni: 0, show: 'base', busy: false, prog: 0, cache: {}, frame: null };
  let ctl = null;
  const pending = {};
  /** Обучить обе сети на n демонстрациях (один раз) и поставить десять кастрюль. */
  function compute(n) {
    if (st.cache[n]) return Promise.resolve(st.cache[n]);
    if (pending[n]) return pending[n];
    if (n === 0) { st.cache[0] = { n: 0, ev: E.lab2Eval({ n: 0 }) }; return Promise.resolve(st.cache[0]); }
    st.busy = true; st.prog = 0; render();
    let last = 0;
    pending[n] = runChunked(E.lab2Train(E.CFG.SEED, n), (ev) => { st.prog = ev.p; const now = performance.now(); if (now - last > 120) { last = now; progress(); } }, 14)
      .then((nets) => { st.cache[n] = { n, nets, ev: E.lab2Eval(nets) }; delete pending[n]; st.busy = Object.keys(pending).length > 0; return st.cache[n]; });
    return pending[n];
  }
  const N = () => NS[st.ni];
  function runsOf(show, n) {
    const c = st.cache[n], c0 = st.cache[0];
    if (show === 'base') return c0 ? c0.ev.base : null;
    if (n === 0) return show === 'res' && c0 ? c0.ev.base : null;
    return c ? c.ev[show] : null;
  }
  function pot(c, V, P, x, y, o) {
    o = o || {}; const a = V.map(x - E.POT.w / 2, y - 0.012), b = V.map(x + E.POT.w / 2, y - E.POT.h);
    c.save(); c.globalAlpha = o.alpha || 1;
    c.beginPath(); c.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 4); c.fillStyle = o.fill || '#6c7a89'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = o.stroke || P.ink2; c.stroke();
    const h = V.map(x, y); c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(h.x, a.y); c.lineWidth = 3; c.stroke();
    c.restore();
  }
  function drawScene() {
    const cv = $('#bCv'), { c, k } = K.fit(cv, V.W, V.H), P = pal(), n = N();
    Side.base(c, V, P); Side.table(c, V, k, P);
    const s0 = V.map(E.SHELF.x0, E.SHELF.y), s1 = V.map(V.x0 + V.W / V.S, E.SHELF.y - E.SHELF.th);
    c.fillStyle = P.ink3; c.fillRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y);
    K.label(c, k, 'полка', s0.x + 30 * k, s1.y + 10 * k, { px: 10.5, color: P.ink3, weight: 650, haloColor: P.bg });
    Side.torso(c, V, P);
    Side.pathLine(c, V, E.shelfPath(E.LAB2.START, E.LAB2.XT[MID]), P.cl, [6, 5]);
    const ev = runsOf(st.show, n), col = st.show === 'base' ? P.cl : st.show === 'res' ? P.hy : P.e2e;
    if (!ev) {
      pot(c, V, P, E.LAB2.START.x, E.LAB2.START.y); Side.arm(c, V, P, E.ik(E.LAB2.START.x, E.LAB2.START.y), col);
      K.label(c, k, st.busy ? 'сети учатся…' : st.show === 'scr' && n === 0 ? 'сеть с нуля без демонстраций не обучена' : (k > 1.5 ? 'нажми кнопку миссии' : 'нажми кнопку миссии, чтобы поставить кастрюли'), V.W * 0.6, 26, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
      return;
    }
    const fr = st.frame == null ? Infinity : st.frame;
    ev.runs.forEach((r, j) => {
      const m = Math.min(r.frames.length - 1, fr), pts = r.frames.slice(0, m + 1);
      c.save(); c.strokeStyle = col; c.globalAlpha = j === MID ? 0.95 : 0.5; c.lineWidth = j === MID ? 2 : 1.2; c.beginPath(); pts.forEach((p, i) => { const q = V.map(p.x, p.y); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.stroke(); c.restore();
      const f = r.frames[m];
      if (j !== MID) pot(c, V, P, f.x, f.y, { alpha: 0.28 });
      if (m === r.frames.length - 1 || (r.hit && f.t >= r.tHit)) {
        const end = r.hit ? r.frames[Math.min(r.frames.length - 1, Math.round(r.tHit * 100))] : f, q = V.map(end.x, end.y - E.POT.h);
        if (r.ok) { c.beginPath(); c.arc(q.x, q.y + 4, 4.5, 0, 7); c.strokeStyle = P.good; c.lineWidth = 2.2; c.stroke(); } else K.cross(c, q.x, q.y, 5, P.bad, 2.4);
      }
    });
    const r = ev.runs[MID], f = r.frames[Math.min(r.frames.length - 1, fr)];
    pot(c, V, P, f.x, f.y); Side.arm(c, V, P, f.q, col);
    K.label(c, k, `${NAMES[st.show]}${st.show !== 'base' ? `, ${nOf(n, 'демонстрация', 'демонстрации', 'демонстраций')}` : ''}`, 10, 16, { px: 11, weight: 700, color: col, align: 'left', haloColor: P.bg });
  }
  function drawCurve() {
    const cv = $('#bCurve'), narrow = (cv.getBoundingClientRect().width || 640) < 460, W = narrow ? 380 : 640, H = narrow ? 280 : 270;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(); c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = 40, R = 16, T = 22, B = 40, gw = W - L - R, gh = H - T - B, X = (i) => L + gw * i / (NS.length - 1), Y = (v) => T + gh * (1 - v / 10);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = 0; v <= 10; v += 2) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); K.label(c, k, String(v), L - 8, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false, mono: true }); }
    NS.forEach((n, i) => K.label(c, k, String(n), X(i), H - B + 14, { px: 10.5, color: i === st.ni ? P.ink : P.ink3, weight: i === st.ni ? 800 : 500, halo: false, mono: true }));
    K.label(c, k, 'демонстраций', W - R, H - 8, { px: 10, color: P.ink3, align: 'right', halo: false });
    K.label(c, k, 'встали на полку из 10', L + 4, 10, { px: 10, color: P.ink3, align: 'left', halo: false });
    const pts = { res: [], scr: [] };
    NS.forEach((n, i) => { const cc = st.cache[n]; if (!cc) return; if (n === 0) { pts.res.push([i, cc.ev.base.ok]); return; } pts.res.push([i, cc.ev.res.ok]); pts.scr.push([i, cc.ev.scr.ok]); });
    if (!pts.res.length) { K.label(c, k, narrow ? 'нажми кнопку миссии' : 'точки появятся после первой проверки: нажми кнопку миссии', W / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    for (const [key, col] of [['scr', P.e2e], ['res', P.hy]]) {
      const ps = pts[key]; if (!ps.length) continue;
      c.strokeStyle = col; c.lineWidth = 2.2; c.beginPath(); ps.forEach(([i, v], j) => { if (j) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v)); }); c.stroke();
      ps.forEach(([i, v]) => { c.beginPath(); c.arc(X(i), Y(v), 4.2, 0, 7); c.fillStyle = col; c.fill(); });
    }
    if (st.cache[0]) { c.beginPath(); c.arc(X(0), Y(st.cache[0].ev.base.ok), 5.5, 0, 7); c.fillStyle = P.cl; c.fill(); }
    c.beginPath(); c.arc(X(st.ni), T + gh + 0.5, 0, 0, 7);
    const cur = st.cache[N()]; if (cur) for (const v of N() === 0 ? [cur.ev.base.ok] : [cur.ev.res.ok, cur.ev.scr.ok]) { c.beginPath(); c.arc(X(st.ni), Y(v), 8.5, 0, 7); c.strokeStyle = P.ink; c.lineWidth = 1.6; c.stroke(); }
    if (!narrow) { K.label(c, k, '● с поправкой', W - R - 150, 10, { px: 10, color: P.hy, align: 'left', weight: 700, halo: false }); K.label(c, k, '● с нуля', W - R - 60, 10, { px: 10, color: P.e2e, align: 'left', weight: 700, halo: false }); }
  }
  function out() {
    const n = N(), c = st.cache[n];
    if (st.busy) { setOut($('#bOut'), `Сети учатся в браузере на ${nOf(n, 'демонстрации', 'демонстрациях', 'демонстрациях')}: ${Math.round(st.prog * 100)}%.`); return; }
    if (!c) { setOut($('#bOut'), n === 0 ? 'Регулятор знает модель руки, но не вес кастрюли. Запуск — кнопкой в карточке миссии.' : `На ${nOf(n, 'демонстрации', 'демонстрациях', 'демонстрациях')} сети ещё не обучались.`); return; }
    if (n === 0) { setOut($('#bOut'), `Без демонстраций: регулятор поставил <b>${c.ev.base.ok} из 10</b>, задел край полки ${nOf(c.ev.base.hits, 'раз', 'раза', 'раз')}. Поправка без обучения равна нулю — то же самое.`); return; }
    setOut($('#bOut'), `${nOf(n, 'демонстрация', 'демонстрации', 'демонстраций')}: регулятор с поправкой поставил <b>${c.ev.res.ok} из 10</b>, сеть с нуля — <b>${c.ev.scr.ok} из 10</b> (задела полку ${nOf(c.ev.scr.hits, 'раз', 'раза', 'раз')}).`);
  }
  function progress() { const pg = $('#bProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%'; out(); drawScene(); }
  function render() {
    drawScene(); drawCurve(); out(); segSet('#bShow', st.show); $('#bN').value = st.ni; syncRange($('#bN'), String(N()));
    const pg = $('#bProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
  }
  /** Посчитать выбранное число демонстраций и проиграть десять постановок выбранной стороны. */
  async function go(n, show) {
    if (n != null) st.ni = NS.indexOf(n);
    if (show) st.show = show;
    if (st.cache[0] == null) await compute(0);
    const nn = N(); await compute(nn); render();
    const ev = runsOf(st.show, nn);
    if (ev) await play(ev.runs[MID].frames.length, 1.75, (j) => { st.frame = j; drawScene(); });
    st.frame = null; render(); if (ctl) ctl.update();
    const c = st.cache[nn];
    return nn === 0 ? { n: 0, base: c.ev.base } : { n: nn, res: c.ev.res, scr: c.ev.scr };
  }
  function scrFirst(k) { for (const n of NS) { const c = st.cache[n]; if (n && c && c.ev.scr.ok >= k) return n; } return null; }
  function state() { let best = 0; for (const n of NS) { const c = st.cache[n]; if (n && c) best = Math.max(best, c.ev.scr.ok); } return { n: N(), show: st.show, scrBest: best, busy: st.busy }; }
  const api = { reset() { st.ni = 0; st.show = 'base'; st.frame = null; render(); }, state, render, st, go, compute };
  const missions = [
    { short: 'Без веса', title: 'Регулятор не знает веса', text: 'Ада переставляет кастрюлю массой 1,2 кг со стола на полку в десяти местах, от 56 до 74 см от плеча. Регулятор — импеданс из лаборатории 1, но его модель считает руку пустой. Путь проходит над краем полки с запасом 3,5 см.',
      onEnter: (X) => { st.ni = 0; st.show = 'base'; X.render(); },
      bet: { q: 'сколько кастрюль из 10 встанет на полку?', options: ['Все 10: импеданс дотянет кастрюлю до цели', 'Около половины', 'Ни одной'], answer: (r) => (r.base.ok >= 8 ? 0 : r.base.ok >= 3 ? 1 : 2) },
      action: { label: 'Поставить 10 кастрюль', run: (X) => X.go(0, 'base') },
      criteria: [{ label: 'Десять постановок пройдены', test: (r) => !!r && r.n === 0 }],
      explain: (r) => { const t = r.base.runs.find((q) => q.hit); return `Ни одна кастрюля не встала: все ${r.base.hits} задели край полки${t ? `, через ${fmt(t.tHit, 1)} с после старта` : ''}. Пружине жёсткостью 300 Н/м нужно растянуться на 3,9 см, чтобы держать лишние 11,8 Н, а запас над краем — 3,5 см. Можно было бы поднять жёсткость или запас, но вес кастрюли каждый раз другой. Сеть, которая видела оператора, знающего вес, может выучить, чего не хватает регулятору.`; } },
    { short: 'Одна', title: 'Одна демонстрация', text: 'Оператор, который чувствует вес кастрюли, показал перенос один раз. На этой демонстрации учатся поправка к регулятору и сеть того же размера, которая выдаёт моменты целиком. Сначала на сцене поставит кастрюли регулятор с поправкой, потом сеть с нуля.',
      onEnter: (X) => { st.ni = 1; st.show = 'res'; X.render(); },
      bet: { q: 'кто поставит больше кастрюль?', options: ['Сеть с нуля: её ничего не ограничивает', 'Регулятор с поправкой', 'Никто: одной демонстрации мало для любой сети'], answer: (r) => (r.res.ok <= 2 && r.scr.ok <= 2 ? 2 : r.scr.ok > r.res.ok ? 0 : 1) },
      action: { label: 'Обучить обе сети по одной демонстрации', run: async (X) => { await X.go(1, 'res'); return X.go(1, 'scr'); } },
      criteria: [{ label: 'Поправка ставит хотя бы 8 кастрюль из 10', test: (r) => r.res.ok >= 8 }, { label: 'Сеть с нуля ставит меньше, чем поправка', test: (r) => r.scr.ok < r.res.ok }],
      explain: (r) => { const miss = r.res.runs.filter((q) => !q.ok); return `С поправкой на полку встали ${nOf(r.res.ok, 'кастрюля', 'кастрюли', 'кастрюль')} из 10${miss.length ? `, ещё ${nOf(miss.length, 'встала', 'встали', 'встали').replace(/^\d+ /, miss.length === 1 ? 'одна ' : miss.length === 2 ? 'две ' : miss.length + ' ')} в ${miss.map((q) => cm(q.dx)).join(' и ')} см от нужного места` : ''}. Сеть с нуля поставила ${r.scr.ok} из 10 и задела полку ${nOf(r.scr.hits, 'раз', 'раза', 'раз')}. Одна демонстрация — это 176 пар «состояние → момент», и поправка выучила по ним то, чего не знал регулятор: в основном вес кастрюли. Сеть с нуля должна была выучить из тех же пар всё: подъём, перенос, опускание и вес самой руки.`; } },
    { short: 'С нуля', title: 'Сколько нужно сети с нуля', text: 'Двигай ползунок: обе сети заново учатся на 2, 4, 8, 16 или 32 демонстрациях, а на графике появляются новые точки. Найди, на скольких демонстрациях сеть с нуля впервые ставит хотя бы 5 кастрюль из 10.', controls: ['n', 'show'],
      criteria: [{ label: 'Сеть с нуля поставила хотя бы 5 кастрюль из 10', test: (r, s) => s && s.scrBest >= 5 }],
      hint: 'Попробуй сразу 32 демонстрации, потом посмотри, что было между.',
      explain: () => { const n5 = scrFirst(5), c = st.cache[2]; return `Сети с нуля понадобилось ${nOf(n5, 'демонстрация', 'демонстрации', 'демонстраций')}, чтобы поставить 5 кастрюль из 10${c ? `, а поправка ставила все ${c.ev.res.ok} уже с двух` : ''}. У Silver и соавторов то же соотношение: на одной из задач остаточная политика вышла на 90% успеха за на порядок меньшее число шагов, чем обучение с нуля.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число демонстраций и переключай, чьи постановки видно на сцене. Найди, где задевает полку сеть с нуля, и сравни с тем, где задевал её регулятор без поправки.', final: true, controls: ['n', 'show'] },
  ];
  async function onN(i) {
    st.ni = i; render();
    if (!ctl || ctl.index < 2) return;
    await go(null, st.show === 'base' && NS[i] > 0 ? 'scr' : null);
  }
  function init() {
    $('#bN').addEventListener('input', (e) => onN(+e.target.value));
    segBind('#bShow', (v) => { st.show = v; render(); if (ctl && ctl.index >= 2) go(null, v); });
    ctl = mountMissions('#bMis', missions, api, { controls: { n: '#wrapBN', show: '#wrapBShow' }, scene: '#bCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, scrFirst };
})();

/* =====================================================================
   3. Лаборатория: раздели систему по слоям
   ===================================================================== */
const Lab3 = (() => {
  const E = L81, K = HeroKit, V = Side.view(600, -0.07, 0.88, -0.225, 0.505);
  const LAYERS = [['P', 'Восприятие', 'где предмет'], ['G', 'Выбор захвата', 'где брать'], ['T', 'Путь', 'как довести'], ['C', 'Регулятор', 'моменты']];
  const SC = E.SCENES3;
  const st = { cfg: { P: 'cl', G: 'cl', T: 'cl', C: 'cl' }, locked: true, busy: false, prog: 0, nets: null, res: {}, sel: 0, frame: null, last: null };
  let ctl = null, training = null;
  const keyOf = (cfg) => LAYERS.map(([k]) => cfg[k]).join('');
  const colOf = (who, P) => (who === 'nn' ? P.e2e : P.cl);
  function ensureNets() {
    if (st.nets) return Promise.resolve(st.nets);
    if (!training) {
      st.busy = true; st.prog = 0; render(); let last = 0;
      training = runChunked(E.lab3Train(E.CFG.SEED), (ev) => { st.prog = ev.p; const now = performance.now(); if (now - last > 120) { last = now; progress(); } }, 14).then((n) => { st.nets = n; st.busy = false; return n; });
    }
    return training;
  }
  const cur = () => st.res[keyOf(st.cfg)] || null;
  /** Почему сцена не пройдена — словами. */
  function why(r) {
    const sc = SC.find((s) => s.id === r.scene), name = E.TYPES[sc.objs[sc.ti].type].name;
    if (r.why === 'ok') return 'пройдена';
    if (r.why === 'notfound') return `восприятие не нашло: ${name} не подошла ни под один шаблон`;
    if (r.why === 'hit') return `рука задела ${E.TYPES[sc.objs.filter((_, i) => i !== sc.ti)[r.hit].type].name.replace('ваза', 'вазу')}`;
    if (r.why === 'force') return `стол давил на захват с силой ${fmt(r.peak, 0)} Н`;
    return `захват встал в ${cm(r.err)} см от нужной точки`;
  }
  function boardHTML() {
    const col = (who, title) => { const ch = LAYERS.filter(([k]) => st.cfg[k] === who); return `<div class="l-col ${who}" data-col="${who}"><h4>${title}</h4>${ch.map(([k, t, s]) => `<button type="button" class="l-chip" data-k="${k}">${t}<small>${s}</small></button>`).join('')}${ch.length ? '' : `<span class="l-empty">${st.locked ? 'пока ни одного слоя' : 'перетащи сюда слой'}</span>`}</div>`; };
    return col('nn', 'Сеть') + col('cl', 'Классика');
  }
  function drawBoard() { const b = $('#cBoard'); setOut(b, boardHTML()); b.classList.toggle('locked', st.locked); }
  function drawTabs() {
    const r = cur();
    setOut($('#cTabs'), SC.map((s, i) => { const q = r ? r.runs[i] : null, mark = q ? (q.ok ? '✓' : '✗') : '·'; return `<button type="button" class="l-tab${q ? (q.ok ? ' ok' : ' no') : ''}" data-i="${i}" aria-pressed="${i === st.sel}"><b>${mark}</b>${s.name}</button>`; }).join(''));
  }
  function drawScene() {
    const cv = $('#cCv'), { c, k } = K.fit(cv, V.W, V.H), P = pal(), sc = SC[st.sel], r = cur(), run = r ? r.runs[st.sel] : null;
    Side.base(c, V, P); Side.table(c, V, k, P);
    const sv = run ? run.sc : Array.from(E.scan(sc.objs, E.rng(900)));
    Side.camera(c, V, k, P, sv, run && run.per.ok ? { found: run.per.x, mark: E.cellOf(run.per.x), markColor: colOf(st.cfg.P, P) } : {});
    sc.objs.forEach((o) => Side.object(c, V, k, P, o, { label: true }));
    Side.zone(c, V, P, E.graspOf(sc.objs[sc.ti]));
    Side.torso(c, V, P);
    if (!run) {
      Side.arm(c, V, P, E.ik(E.START.x, E.START.y), colOf(st.cfg.C, P));
      K.label(c, k, st.busy ? 'сети учатся…' : (k > 1.5 ? 'нажми кнопку миссии' : 'нажми кнопку миссии, чтобы проверить раскладку'), V.W * 0.62, 30, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
      return;
    }
    if (!run.per.ok) K.label(c, k, 'восприятие: предмет не найден', V.W * 0.62, 30, { px: 12, weight: 700, color: P.bad, haloColor: P.bg });
    if (run.P) Side.pathLine(c, V, run.P, colOf(st.cfg.T, P), [6, 5]);
    if (run.g) { const m = V.map(run.g.x, run.g.y); Side.cross(c, m.x, m.y, colOf(st.cfg.G, P), 9); }
    const i = st.frame == null ? run.frames.length - 1 : Math.min(run.frames.length - 1, st.frame), f = run.frames[i];
    Side.trail(c, V, run.frames.slice(Math.max(0, i - 100), i + 1), colOf(st.cfg.C, P));
    const e = Side.arm(c, V, P, f.q, colOf(st.cfg.C, P));
    if (f.F > 0.5) Side.force(c, k, P, e.x + 14, e.y + 4, f.F);
    if (sc.push && f.t >= E.LAB3.PUSH.t - 0.15 && f.t < E.LAB3.PUSH.t + E.LAB3.PUSH.dur + 0.1) Side.push(c, k, P, e.x, e.y, E.LAB3.PUSH.f);
    if (run.hit >= 0 && f.t >= run.tHit) { const o = sc.objs.filter((_, j) => j !== sc.ti)[run.hit], m = V.map(o.x, E.TABLE + o.h); K.cross(c, m.x, m.y - 6, 8, P.bad, 3); }
    K.label(c, k, `${fmt(f.t, 1)} с`, V.W - 10, 16, { px: 10.5, color: P.ink3, align: 'right', mono: true, haloColor: P.bg });
  }
  function out() {
    const r = cur();
    if (st.busy) { setOut($('#cOut'), `Сети слоёв учатся в браузере: ${Math.round(st.prog * 100)}%.`); return; }
    if (!r) { setOut($('#cOut'), `Раскладка: ${LAYERS.map(([k, t]) => `${t.toLowerCase()} — ${st.cfg[k] === 'nn' ? 'сеть' : 'классика'}`).join(', ')}. Ещё не проверялась.`); return; }
    const q = r.runs[st.sel];
    setOut($('#cOut'), `Пройдено <b>${r.ok} из 5</b>. Сцена «${SC[st.sel].name}»: ${why(q)}.`);
  }
  function progress() { const pg = $('#cProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%'; out(); }
  function render() { drawBoard(); drawTabs(); drawScene(); out(); progress(); }
  function setCfg(cfg) { Object.assign(st.cfg, cfg); render(); if (ctl) ctl.update(); }
  function flip(k) { if (st.locked) return; st.cfg[k] = st.cfg[k] === 'nn' ? 'cl' : 'nn'; render(); if (ctl) ctl.update(); }
  /** Проверить текущую раскладку на пяти сценах и проиграть их по очереди. */
  async function run() {
    await ensureNets();
    const key = keyOf(st.cfg); if (!st.res[key]) st.res[key] = E.lab3Eval(Object.assign({}, st.cfg), st.nets);
    const r = st.res[key];
    for (let i = 0; i < SC.length; i++) { st.sel = i; drawTabs(); await play(r.runs[i].frames.length, 3, (j) => { st.frame = j; drawScene(); }); }
    st.frame = null; st.sel = Math.max(0, r.runs.findIndex((q) => !q.ok)); render(); if (ctl) ctl.update();
    return r;
  }
  const failed = (r) => r.runs.filter((q) => !q.ok).map((q) => `«${SC.find((s) => s.id === q.scene).name}» — ${why(q)}`).join('; ');
  const api = { reset() { st.locked = true; st.cfg = { P: 'cl', G: 'cl', T: 'cl', C: 'cl' }; st.sel = 0; render(); }, state: () => ({ cfg: Object.assign({}, st.cfg), ok: cur() ? cur().ok : null, busy: st.busy }), render, st, run, setCfg, ensureNets };
  const all = (v) => ({ P: v, G: v, T: v, C: v });
  const missions = [
    { short: 'Классика', title: 'Все слои — классика', text: 'Сначала все четыре слоя делает классика: шаблоны, правило «сверху по центру», планировщик и импеданс. Сеть пока не участвует.',
      onEnter: () => { st.locked = true; setCfg(all('cl')); },
      bet: { q: 'сколько сцен из пяти пройдёт классика?', options: ['Все пять: правила точны', 'Три', 'Одну'], answer: (r) => (r.ok === 5 ? 0 : r.ok >= 3 ? 1 : 2) },
      action: { label: 'Проверить на пяти сценах', run: (X) => X.run() },
      criteria: [{ label: 'Раскладка проверена на пяти сценах', test: (r) => !!r && r.runs.length === 5 }],
      explain: (r) => `Классика прошла ${nOf(r.ok, 'сцену', 'сцены', 'сцен')} из 5. Не прошли: ${failed(r)}. Путь и регулятор справились со всеми сценами: планировщик обошёл вазу, а импеданс при толчке ${r.runs[4].peak < 1 ? 'даже не коснулся стола' : `прижал захват к столу с силой ${fmt(r.runs[4].peak, 0)} Н`}. Подвели правила, которые должны понимать предметы: шаблон не знает кружки выше 11 см, а правило «сверху по центру» не знает, что у миски посередине пусто.` },
    { short: 'Сети', title: 'Все слои — сети', text: 'Теперь все четыре слоя делают сети. Каждую учили на своём слое: восприятие и выбор захвата — на 3000 сценах с предметами разных размеров, путь — на путях планировщика, регулятор — на демонстрациях импеданса.',
      onEnter: () => { st.locked = true; setCfg(all('nn')); },
      bet: { q: 'на каких сценах подведут сети?', options: ['Ни на одной: каждую сеть учили на её слое', 'На высокой кружке и миске, как классика', 'На вазе и толчке'], answer: (r) => { const f = (id) => !r.runs.find((q) => q.scene === id).ok; return r.ok === 5 ? 0 : f('vase') && f('push') && !f('mug') && !f('bowl') ? 2 : f('mug') && f('bowl') ? 1 : 2; } },
      action: { label: 'Проверить на пяти сценах', run: (X) => X.run() },
      criteria: [{ label: 'Раскладка проверена на пяти сценах', test: (r) => !!r && r.runs.length === 5 }],
      explain: (r) => `Сети прошли ${nOf(r.ok, 'сцену', 'сцены', 'сцен')} из 5. Не прошли: ${failed(r)}. Высокую кружку и миску сети взяли: в их обучении были предметы разных размеров, и миску там брали за край. А путь, выученный на сценах без высоких предметов, повёл руку прямо через вазу, и регулятор-сеть от толчка ударила по столу, как сеть-моменты в лаборатории 1.` },
    { short: 'Раскладка', title: 'Раскладка, которая проходит всё', text: 'Теперь слои можно менять: нажми на слой или перетащи его в другую колонку. Отдай каждый слой той стороне, которая с ним справилась, и проверь.',
      onEnter: () => { st.locked = false; render(); },
      action: { label: 'Проверить на пяти сценах', run: (X) => X.run() },
      criteria: [{ label: 'Пройдены все пять сцен', test: (r) => !!r && r.ok === 5 }],
      hint: 'Классика подвела на понимании предметов, сети — на пути и силе.',
      fail: (r) => `Пройдено ${r.ok} из 5. Не прошли: ${failed(r)}.`,
      explain: (r) => `Все пять сцен прошла раскладка «${LAYERS.map(([k, t]) => `${t.toLowerCase()} — ${r.cfg[k] === 'nn' ? 'сеть' : 'классика'}`).join(', ')}». Сети отвечают на вопрос «что и где»: какой предмет нужен и за что его брать. Классика — на вопрос «как туда добраться и с какой силой»: проверяет путь по карте и ограничивает силу. Так же делит работу OK-Robot.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй раскладку и проверяй. Найди, замена какого слоя в лучшей раскладке проваливает сцену с вазой, а какого — сцену с миской. Нажми на сцену над картинкой, чтобы посмотреть её ещё раз.', final: true,
      onEnter: () => { st.locked = false; render(); },
      action: { label: 'Проверить на пяти сценах', run: (X) => X.run() } },
  ];
  function initDrag() {
    const board = $('#cBoard'); let drag = null;
    board.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.l-chip'); if (!chip || st.locked) return;
      drag = { k: chip.dataset.k, x0: e.clientX, y0: e.clientY, moved: false, chip, ghost: null };
      try { chip.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ }
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; const r = drag.chip.getBoundingClientRect(); drag.ghost = drag.chip.cloneNode(true); drag.ghost.classList.add('l-ghost'); drag.ghost.style.width = r.width + 'px'; document.body.append(drag.ghost); drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top; drag.chip.classList.add('drag'); }
      if (drag.moved) { drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`; const under = document.elementFromPoint(e.clientX, e.clientY), col = under && under.closest('.l-col'); $$('.l-col', board).forEach((c) => c.classList.toggle('over', c === col)); }
    });
    const end = (e) => {
      if (!drag) return; const d = drag; drag = null;
      if (d.ghost) d.ghost.remove();
      if (d.moved) { const under = document.elementFromPoint(e.clientX, e.clientY), col = under && under.closest('.l-col'); $$('.l-col', board).forEach((c) => c.classList.remove('over')); if (col && col.dataset.col !== st.cfg[d.k]) flip(d.k); else render(); }
      else flip(d.k);
    };
    board.addEventListener('pointerup', end); board.addEventListener('pointercancel', (e) => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; render(); });
  }
  function init() {
    initDrag();
    $('#cTabs').addEventListener('click', (e) => { const b = e.target.closest('.l-tab'); if (!b) return; st.sel = +b.dataset.i; st.frame = null; render(); const r = cur(); if (r) play(r.runs[st.sel].frames.length, 2, (j) => { st.frame = j; drawScene(); }).then(() => { st.frame = null; drawScene(); }); });
    ctl = mountMissions('#cMis', missions, api, { scene: '#cCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Квиз ---------- */
function renderQuiz(boxSel, Q, scoreSel) {
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $(boxSel); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true }), pm = perms[qi % perms.length];
    pm.forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[pm.indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Две сети одного размера хорошо выучили одни и те же демонстрации: одна выдаёт моменты, другая — цель для регулятора. Значит, и рукой они будут управлять одинаково хорошо?', o: ['Да: обе почти не ошибаются на обучающих примерах', 'Нет: ошибка в цели остаётся ошибкой в точке, а ошибка в моменте копится в контуре и уводит руку туда, где демонстраций не было', 'Нет: сеть-моменты всегда точнее, она ближе к моторам'], a: 1, e: 'В лаборатории 1 сеть-цель с регулятором промахнулась в среднем на 0,6 см и дрожала у цели на 1,3 мм, сеть-моменты — на 3,2 см и 6,3 мм.' },
    { q: 'Демонстрации записаны 50 раз в секунду. Хватит ли сети, которая выдаёт моменты с той же частотой?', o: ['Да: сеть видит ровно то, что было в данных', 'Не всегда: между ответами сети момент 20 мс не меняется, а регулятор под целью поправляет руку каждую миллисекунду', 'Да, если сеть достаточно большая'], a: 1, e: 'На графике моментов в лаборатории 1 у сети-моменты видны ступеньки раз в 20 мс. Поэтому в настоящих роботах сеть выдаёт цели, а моменты считает быстрый контур: в Helix быстрая сеть отвечает 200 раз в секунду и выдаёт позы запястий, а не моменты.' },
    { q: 'Если под сетью стоит импедансный регулятор, рука безопасна при любой цели?', o: ['Да: импеданс ограничивает силу', 'Нет: импеданс ограничивает силу при заданной цели — примерно жёсткость, умноженная на ошибку, — но исполнит и цель внутри горячего чайника', 'Да, если жёсткость маленькая'], a: 1, e: 'Классика гарантирует только то, что знает. Куда сеть ставит цель, регулятор не проверяет — для этого нужна отдельная страховка, о ней урок 8.2.' },
    { q: 'Остаточная поправка должна быть маленькой по сравнению с командой регулятора?', o: ['Да, иначе это уже не поправка', 'Не обязательно: в лаборатории 2 она держала вес кастрюли и давала около половины момента. Важно, что её легко выучить и что в начале она равна нулю', 'Нет, она всегда больше регулятора'], a: 1, e: 'Поправка учит то, чего не знает модель регулятора. Silver и соавторы обнуляют её последний слой, чтобы до обучения она не делала исходный регулятор хуже.' },
    { q: 'У регулятора неточная модель руки. Значит, остаётся только учить сеть управлять рукой с нуля?', o: ['Да: регулятор с неточной моделью бесполезен', 'Нет: можно учить поправку к нему — по одной демонстрации она поставила на полку 8 кастрюль из 10, а сеть с нуля и по 32 демонстрациям — только 5', 'Нет: достаточно поднять жёсткость регулятора в несколько раз'], a: 1, e: 'Регулятор уже умеет поднимать, переносить и опускать, поправке остаётся то, чего он не знает. На настоящей руке Sawyer поправка к ручному регулятору вставляла брусок между перекошенными брусками в 15 попытках из 20, сам регулятор — в 2.' },
    { q: 'Чтобы система была надёжнее, лучше отдать сетям как можно больше слоёв?', o: ['Да: сети лучше обобщают', 'Нет: в лаборатории 3 все пять сцен прошла раскладка, где сети отвечают за восприятие и выбор захвата, а путь и регулятор делает классика', 'Нет: лучше всего всё отдать классике'], a: 1, e: 'Все четыре слоя-сети прошли три сцены из пяти: путь повёл руку через вазу, а регулятор-сеть ударила по столу. Классика тоже прошла три: не узнала высокую кружку и взяла бы миску за середину.' },
    { q: 'Классический планировщик гарантирует, что рука ничего не заденет?', o: ['Да, на то он и планировщик', 'Только то, что есть на его карте: ваза, которую видит камера, — да; предмет, которого нет на карте, — нет', 'Нет, планировщики всегда хуже сетей'], a: 1, e: 'В OK-Robot рука вообще не планирует путь, а идёт к захвату по одной прямой траектории — авторы называют столкновения с соседними предметами одной из причин отказов.' },
    { q: 'Сеть выдала набросок пути захвата. Кому его лучше исполнять — классике или обученной политике?', o: ['Всегда классике: путь — её дело', 'Смотря насколько точен набросок: по неровным наброскам из видео человека обученная политика RT-Trajectory брала предметы в 100% случаев, классика — в 42%, а по точным наброскам от языковой модели ящик классика открывала чаще, 71% против 60%', 'Всегда обученной политике: она подстраивается под сцену'], a: 1, e: 'Неровный набросок — неточная цель: чтобы её исполнить, надо по кадру понять, куда тянуться на самом деле, а это вопрос «что и где». Точную цель надёжнее исполняет классика. Поэтому вид цели и её исполнитель выбирают отдельно.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('lab1', () => { mis.lab1 = Lab1.init(); });
    safe('lab2', () => { mis.lab2 = Lab2.init(); });
    safe('lab3', () => { mis.lab3 = Lab3.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['aMis', 'bMis', 'cMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l81 = { mis, Lab1, Lab2, Lab3, L81, SPEED }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
