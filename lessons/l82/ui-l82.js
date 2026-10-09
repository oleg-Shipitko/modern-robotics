/* =====================================================================
   ui-l82.js — урок 8.2 «Безопасность». Схемы и лаборатории:
   0) анимированные схемы (shared/anim.js): где стоит фильтр безопасности
      в контуре; запас до чайника и его скорость; щиты до и после агента;
   1) интерактив «Одна команда фильтра»: плоскость скоростей, граница
      условия ḣ ≥ −αh и ближайшая допустимая скорость;
   2) лаборатория «Сто поездок»: одна политика без фильтра и с фильтром
      на одних и тех же поездках, табло серии;
   3) лаборатория «Параметр α»: фазовая плоскость «запас — скорость
      сближения» для одной поездки и итоги серии при разных α;
   4) лаборатория «Чего фильтр не знает»: ошибка камеры, запас и корзина,
      которой нет на карте; журнал серий;
   5) квиз.
   Движок — l82/engine.js (без DOM) поверх shared/kettle-core.js,
   рисование дома — shared/kettle-draw.js.
   ===================================================================== */
'use strict';

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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), clS: HeroKit.css('--classic-soft'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
/** α: 0,25, 0,5, 1, 2 … — без лишних нулей. */
const fmtA = (a) => (+a).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
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
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
const ALPHAS = [0.25, 0.5, 1, 2, 4, 8, 16];
const nTrips = (n) => `${n} ${plural(n, 'поездка', 'поездки', 'поездок')}`;
const nTripsIn = (n) => `${n} ${plural(n, 'поездке', 'поездках', 'поездках')}`;
/** Стрелка от (x0, y0) к (x1, y1) с наконечником, размеры — в экранных пикселях. */
function arrow(c, k, x0, y0, x1, y1, color, lw, head) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 0.5) return;
  const ux = dx / L, uy = dy / L, hd = Math.min((head || 9) * k, L * 0.6);
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = (lw || 2.5) * k; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - ux * hd * 0.7, y1 - uy * hd * 0.7); c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - ux * hd - uy * hd * 0.5, y1 - uy * hd + ux * hd * 0.5); c.lineTo(x1 - ux * hd + uy * hd * 0.5, y1 - uy * hd - ux * hd * 0.5); c.closePath(); c.fill();
}
function dashCircle(c, k, x, y, r, color, lw, dash) { c.save(); c.setLineDash((dash || [5, 4]).map((v) => v * k)); c.strokeStyle = color; c.lineWidth = (lw || 1.5) * k; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.restore(); }
/** Исход поездки на плане: галочка, крест или кружок. */
function markEnd(c, k, x, y, outcome, P) {
  const r = 9;
  if (outcome === 'kettle' || outcome === 'box' || outcome === 'wall') HeroKit.cross(c, x, y, r, P.bad, 3.2);
  else if (outcome === 'goal') HeroKit.check(c, x, y - 1, r, P.good, 3.2);
  else { c.beginPath(); c.arc(x, y, r * 0.75, 0, 7); c.strokeStyle = P.ink2; c.lineWidth = 2.6; c.stroke(); }
}
/** Корзина для белья сверху: плетёный круг. */
function basket(c, k, P, x, y, o) {
  o = o || {}; const R = L82.RB;
  c.save(); if (o.ghost) c.globalAlpha = 0.4;
  c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = HeroKit.dark() ? '#4a4336' : '#e9dcc3'; c.fill();
  c.lineWidth = 2; c.strokeStyle = o.hot ? P.bad : (HeroKit.dark() ? '#c9b48a' : '#8a6d3b'); c.stroke();
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 6; c.moveTo(x + Math.cos(a) * R * 0.85, y + Math.sin(a) * R * 0.85); c.lineTo(x - Math.cos(a) * R * 0.85, y - Math.sin(a) * R * 0.85); } c.lineWidth = 0.9; c.stroke();
  c.beginPath(); c.arc(x, y, R * 0.55, 0, 7); c.stroke();
  c.restore();
  if (o.label) HeroKit.label(c, k, 'корзина', x - R - 6, y, { color: P.ink2, px: 11, weight: 650, align: 'right', haloColor: P.bg });
}

/* =====================================================================
   0. Анимированные схемы (shared/anim.js)
   ===================================================================== */
/** Мини-модель для схем: Ада — точка, чайник — в начале координат (см), фильтр с параметром α.
 *  Возвращает положение, команду политики и команду после фильтра в момент t. */
function schemeSim(t, o) {
  const dt = 0.02, p = { x: o.p0.x, y: o.p0.y }, trail = [{ x: p.x, y: p.y }];
  let ur = o.cmd(0, p), u = ur, h = Math.hypot(p.x, p.y) - o.D, hs = [{ t: 0, h }];
  for (let s = 0; s * dt < t - 1e-9; s++) {
    ur = o.cmd(s * dt, p);
    const d = Math.hypot(p.x, p.y), nx = p.x / d, ny = p.y / d; h = d - o.D;
    const lam = o.off ? 0 : Math.max(0, -o.alpha * h - (nx * ur.x + ny * ur.y));
    u = { x: ur.x + lam * nx, y: ur.y + lam * ny };
    p.x += u.x * dt; p.y += u.y * dt;
    if (s % 3 === 0) trail.push({ x: p.x, y: p.y });
    hs.push({ t: (s + 1) * dt, h: Math.hypot(p.x, p.y) - o.D });
  }
  const d = Math.hypot(p.x, p.y);
  return { p, ur, u, h: d - o.D, n: { x: p.x / d, y: p.y / d }, trail, hs };
}
/** Кадр плана для схем: чайник, граница безопасного множества, касание, Ада и стрелки. */
function schemeMap(c, k, P, A, g, st) {
  const KP = KettleDraw.pal(), s = g.s, cx = g.kx, cy = g.ky, X = (x) => cx + x * s, Y = (y) => cy + y * s;
  A.rect(c, g.box[0], g.box[1], g.box[2], g.box[3], 10, P.surf2, P.line, 1);
  c.save(); c.beginPath(); c.roundRect(g.box[0], g.box[1], g.box[2], g.box[3], 10); c.clip();
  if (g.rings) for (const hh of g.rings) dashCircle(c, k, cx, cy, (36 + hh) * s, P.ink3, 1, [2, 4]);
  dashCircle(c, k, cx, cy, 31 * s, P.bad, 1.3, [3, 3]);
  dashCircle(c, k, cx, cy, 36 * s, P.out, 2, [6, 4]);
  c.save(); c.translate(cx, cy); c.scale(s, s); KettleDraw.kettle(c, k / s, KP, { x: 0, y: 0 }); c.restore();
  c.save(); c.setLineDash([2 * k, 4 * k]); c.strokeStyle = P.ink3; c.lineWidth = 1.4 * k; c.beginPath();
  st.trail.forEach((q, i) => (i ? c.lineTo(X(q.x), Y(q.y)) : c.moveTo(X(q.x), Y(q.y)))); c.lineTo(X(st.p.x), Y(st.p.y)); c.stroke(); c.restore();
  c.save(); c.translate(X(st.p.x), Y(st.p.y)); c.scale(s, s); KettleDraw.ada(c, 0, 0, Math.atan2(st.u.y, st.u.x) || -Math.PI / 2, P.ink, 1); c.restore();
  const ax = X(st.p.x), ay = Y(st.p.y), sc = g.vs;
  arrow(c, k, ax, ay, ax + st.ur.x * sc, ay + st.ur.y * sc, P.mot, 3);
  if (Math.hypot(st.u.x - st.ur.x, st.u.y - st.ur.y) > 1) arrow(c, k, ax, ay, ax + st.u.x * sc, ay + st.u.y * sc, P.out, 3);
  c.restore();
}

/* ---------- 0а. Схема: где стоит фильтр в контуре ---------- */
(() => {
  const T = 7.5, OPT = { p0: { x: 0, y: 150 }, D: 36, alpha: 2, cmd: (t) => (t < 3 ? { x: 0, y: -60 } : { x: -60 * Math.sin(0.96), y: -60 * Math.cos(0.96) }) };
  function boxes(c, k, A, P, g, st, u) {
    const pulse = (u * 1.4) % 1;   // точка бежит по цепочке раз в 0,7 с
    g.B.forEach((b, i) => {
      const col = [P.out, P.mot, P.out, P.ink3][i], hot = Math.floor(pulse * 4) === i;
      A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.18 : 0.07), col, hot ? 2.2 : 1.3);
      A.lab(c, k, g.T[i][0], b[0] + b[2] / 2, b[1] + 15, { px: 11, weight: 700, color: col, halo: false });
      A.lab(c, k, g.T[i][1], b[0] + b[2] / 2, b[1] + b[3] - 12, { px: 9.5, color: P.ink2, halo: false });
    });
    for (let i = 0; i < 3; i++) { const a = g.B[i], b = g.B[i + 1], e = g.link(a, b); A.arrow(c, e[0], e[1], e[2], e[3], P.ink3, 1.6, 7); }
    const seg = Math.min(2.999, pulse * 3), j = Math.floor(seg), f = seg - j, e = g.link(g.B[j], g.B[j + 1]);
    A.circle(c, e[0] + (e[2] - e[0]) * f, e[1] + (e[3] - e[1]) * f, 4.5, [P.out, P.mot, P.out][j], null);
    const appR = -(st.n.x * st.ur.x + st.n.y * st.ur.y), app = -(st.n.x * st.u.x + st.n.y * st.u.y), lim = Math.max(0, 2 * st.h), cut = Math.hypot(st.u.x - st.ur.x, st.u.y - st.ur.y) > 1;
    const [x0, y0] = g.info, L = g.lines;
    A.lab(c, k, `запас до границы h = ${A.fmt(Math.max(0, st.h), 0)} см`, x0, y0, { px: 11, weight: 650, color: P.ink, align: 'left', halo: false });
    A.lab(c, k, `политика: к чайнику ${A.fmt(Math.max(0, appR), 0)} см/с`, x0, y0 + L, { px: 11, weight: 650, color: P.mot, align: 'left', halo: false });
    A.lab(c, k, `правило: не быстрее α·h = ${A.fmt(lim, 0)} см/с`, x0, y0 + 2 * L, { px: 11, color: P.ink2, align: 'left', halo: false });
    A.lab(c, k, cut ? `фильтр: гасит сближение до ${A.fmt(Math.max(0, app), 0)} см/с` : 'фильтр: команда безопасна, пропускает', x0, y0 + 3 * L, { px: 11, weight: 650, color: P.out, align: 'left', halo: false });
    if (g.slow) A.lab(c, k, 'один шаг — 0,1 с; на схеме замедлено', x0, y0 + 4 * L + 2, { px: 9.5, color: P.ink3, align: 'left', halo: false });
  }
  const linkH = (a, b) => [a[0] + a[2] + 2, a[1] + a[3] / 2, b[0] - 2, b[1] + b[3] / 2];
  const TXT = [['камера', 'где Ада и чайник'], ['политика', 'нейросеть'], ['фильтр', 'задача QP'], ['база', 'колёса']];
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, st = schemeSim(u, OPT);
    schemeMap(c, k, P, A, g.map, st);
    A.lab(c, k, 'план сверху', g.map.box[0] + 10, g.map.box[1] + 14, { px: 10.5, weight: 650, color: P.ink3, align: 'left', halo: false });
    boxes(c, k, A, P, g, st, u);
  }
  Anim.add('loop', {
    W: 720, H: 340, start: 2.4, narrowAt: 600,
    draw(c, k, t, P, A) {
      draw(c, k, t, P, A, { map: { box: [10, 10, 300, 320], kx: 160, ky: 100, s: 1.35, vs: 0.75 }, B: [[338, 40, 82, 56], [432, 40, 82, 56], [526, 40, 82, 56], [620, 40, 82, 56]], T: TXT, link: linkH, info: [340, 150], lines: 30, slow: true });
    },
    narrow: { W: 360, H: 600, draw(c, k, t, P, A) {
      const B = [[12, 340, 156, 50], [192, 340, 156, 50], [192, 412, 156, 50], [12, 412, 156, 50]];
      const link = (a, b) => (a[1] === b[1] ? (a[0] < b[0] ? [a[0] + a[2] + 2, a[1] + a[3] / 2, b[0] - 2, b[1] + b[3] / 2] : [a[0] - 2, a[1] + a[3] / 2, b[0] + b[2] + 2, b[1] + b[3] / 2]) : [a[0] + a[2] / 2, a[1] + a[3] + 2, b[0] + b[2] / 2, b[1] - 2]);
      draw(c, k, t, P, A, { map: { box: [6, 6, 348, 318], kx: 180, ky: 96, s: 1.35, vs: 0.75 }, B, T: TXT, link, info: [14, 490], lines: 24, slow: true });
    } },
  });
})();

/* ---------- 0б. Схема: запас до чайника и скорость, с которой он тает ---------- */
(() => {
  const T = 6, TP = 4, AL = 2;
  const dir = (() => { const dx = 34, dy = -128, L = Math.hypot(dx, dy); return { x: 60 * dx / L, y: 60 * dy / L }; })();
  const OPT = { p0: { x: -20, y: 128 }, D: 36, alpha: AL, cmd: () => dir };
  const FREE = Object.assign({}, OPT, { off: true });
  function plot(c, k, P, A, g, st, free, u) {
    const [x0, y0, w, hgt] = g.plot, X = (t) => x0 + w * t / TP, Y = (h) => y0 + hgt - hgt * (h + 10) / 110;
    A.rect(c, x0, y0, w, hgt, 4, P.surf, P.line, 1);
    c.save(); c.beginPath(); c.rect(x0, y0, w, hgt); c.clip();
    for (let h = 0; h <= 100; h += 20) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, Y(h)); c.lineTo(x0 + w, Y(h)); c.stroke(); }
    c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x0 + w, Y(0)); c.stroke();
    // без фильтра — запас уходит в минус
    const fh = []; for (const q of free.hs) { fh.push(q); if (q.h < -5) break; }
    c.setLineDash([4, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.beginPath(); fh.forEach((q, i) => (i ? c.lineTo(X(q.t), Y(q.h)) : c.moveTo(X(q.t), Y(q.h)))); c.stroke(); c.setLineDash([]);
    const fl = fh[fh.length - 1]; if (fl.h < -5) HeroKit.cross(c, X(fl.t), Y(fl.h), 6, P.bad, 2.4);
    // запрет: от текущей точки запас не может опуститься ниже h·e^(−α·Δt)
    const tn = Math.min(u, TP), hn = st.h;
    if (hn > 0.2) {
      c.beginPath(); c.moveTo(X(tn), Y(hn)); for (let s = 0; s <= 40; s++) { const tt = tn + (TP - tn) * s / 40; c.lineTo(X(tt), Y(hn * Math.exp(-AL * (tt - tn)))); }
      c.lineTo(X(TP), Y(-10)); c.lineTo(X(tn), Y(-10)); c.closePath(); c.fillStyle = A.alpha(P.out, 0.12); c.fill();
      c.setLineDash([5, 4]); c.strokeStyle = P.out; c.lineWidth = 1.8; c.beginPath(); for (let s = 0; s <= 40; s++) { const tt = tn + (TP - tn) * s / 40, yy = Y(hn * Math.exp(-AL * (tt - tn))); if (s) c.lineTo(X(tt), yy); else c.moveTo(X(tt), yy); } c.stroke(); c.setLineDash([]);
    }
    c.strokeStyle = P.mot; c.lineWidth = 2.6; c.beginPath(); st.hs.forEach((q, i) => (i ? c.lineTo(X(q.t), Y(q.h)) : c.moveTo(X(q.t), Y(q.h)))); c.stroke();
    A.circle(c, X(tn), Y(hn), 4.5, P.mot, P.surf, 1.5);
    c.restore();
    for (let h = 0; h <= 100; h += 40) A.lab(c, k, A.fmt(h, 0), x0 - 6, Y(h), { px: 9.5, color: P.ink3, align: 'right', halo: false });
    for (let t = 0; t <= TP; t++) A.lab(c, k, A.fmt(t, 0), X(t), y0 + hgt + 11, { px: 9.5, color: P.ink3, halo: false });
    A.lab(c, k, 'время, с', x0 + w, y0 + hgt + 26, { px: 10, color: P.ink3, align: 'right', halo: false });
    A.lab(c, k, 'запас h, см', x0, y0 - 12, { px: 10, weight: 650, color: P.ink2, align: 'left', halo: false });
    A.lab(c, k, 'без фильтра: касание', X(fl.t) + 10, Y(-5), { px: 9.5, color: P.ink3, align: 'left', halo: true, haloColor: P.surf });
    if (hn > 0.2 && u < TP - 0.6) A.lab(c, k, 'сюда нельзя', X(Math.min(tn + 0.9, TP - 0.5)), Y(Math.max(6, hn * 0.25)), { px: 10, weight: 650, color: P.out, halo: true, haloColor: P.surf });
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, ut = Math.min(u, TP), st = schemeSim(ut, OPT), free = schemeSim(TP, FREE);
    const m = g.map; schemeMap(c, k, P, A, Object.assign({ rings: [20, 40] }, m), st);
    const s = m.s, ax = m.kx + st.p.x * s, ay = m.ky + st.p.y * s, appr = -(st.n.x * st.u.x + st.n.y * st.u.y);
    if (appr > 1) { c.save(); c.setLineDash([3, 3]); arrow(c, k, ax, ay, ax - st.n.x * appr * m.vs, ay - st.n.y * appr * m.vs, P.ink2, 2.2, 7); c.restore(); A.lab(c, k, 'к чайнику', ax - 18 * s - 8, ay - 4, { px: 10, weight: 650, color: P.ink2, align: 'right', haloColor: P.surf2 }); }
    for (const [hh, txt] of [[0, 'h = 0'], [20, '20 см'], [40, '40 см']]) { const r = (36 + hh) * s; A.lab(c, k, txt, m.kx - r * 0.72, m.ky - r * 0.72, { px: 9.5, weight: 650, color: hh ? P.ink3 : P.out, haloColor: P.surf2 }); }
    A.lab(c, k, 'план сверху', m.box[0] + 10, m.box[1] + 14, { px: 10.5, weight: 650, color: P.ink3, align: 'left', halo: false });
    A.lab(c, k, `h = ${A.fmt(Math.max(0, st.h), 0)} см`, ax + 34, ay + 10, { px: 11, weight: 700, color: P.ink, align: 'left', haloColor: P.surf2 });
    plot(c, k, P, A, g, st, free, ut);
  }
  Anim.add('barrier', {
    W: 720, H: 360, start: 1.6, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { map: { box: [10, 10, 330, 340], kx: 168, ky: 118, s: 1.3, vs: 0.8 }, plot: [400, 34, 300, 270] }); },
    narrow: { W: 360, H: 580, draw(c, k, t, P, A) { draw(c, k, t, P, A, { map: { box: [6, 6, 348, 296], kx: 176, ky: 104, s: 1.3, vs: 0.8 }, plot: [44, 344, 300, 192] }); } },
  });
})();

/* ---------- 0в. Схема: щит до агента и щит после агента ---------- */
(() => {
  const STEP = 1.3, KET = [3, 1], GOAL = [3, 0];
  const PATH = [[3, 4], [3, 3], [3, 2], [2, 2], [2, 1], [2, 0], [3, 0]];
  const ACT = { up: [0, -1], left: [-1, 0], right: [1, 0], down: [0, 1], stay: [0, 0] };
  const RANK = ['up', 'left', 'right', 'stay', 'down'];   // предпочтения агента: вперёд, потом влево…
  const T = STEP * (PATH.length - 1) + 1.6;
  const unsafe = (cell, a) => cell[0] + ACT[a][0] === KET[0] && cell[1] + ACT[a][1] === KET[1];
  const want = (cell, next) => Object.keys(ACT).find((a) => cell[0] + ACT[a][0] === next[0] && cell[1] + ACT[a][1] === next[1]);
  function grid(c, k, P, A, g, mode, u) {
    const [gx, gy, cs] = g, C = (i, j) => [gx + i * cs + cs / 2, gy + j * cs + cs / 2];
    const KP = KettleDraw.pal();
    for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) {
      const bad = i === KET[0] && j === KET[1];
      A.rect(c, gx + i * cs + 1, gy + j * cs + 1, cs - 2, cs - 2, 4, bad ? A.alpha(P.bad, 0.16) : P.surf2, bad ? P.bad : P.line, bad ? 1.4 : 1);
    }
    const [kx, ky] = C(KET[0], KET[1]); c.save(); c.translate(kx, ky); c.scale(0.8, 0.8); KettleDraw.kettle(c, k / 0.8, KP, { x: 0, y: 0 }); c.restore();
    const [tx, ty] = C(GOAL[0], GOAL[1]); dashCircle(c, k, tx, ty, cs * 0.36, P.ink2, 1.4, [3, 3]);
    A.lab(c, k, 'стол', tx + cs * 0.95, ty, { px: 9.5, color: P.ink3, halo: false });
    const s = Math.min(PATH.length - 2, Math.floor(u / STEP)), f = Math.min(1, (u - s * STEP) / STEP), cell = PATH[s], next = PATH[s + 1];
    const done = u >= STEP * (PATH.length - 1), mv = done ? 1 : A.ease(A.seg(f, 0.62, 0.95));
    const pick = want(cell, next), agent = mode === 'post' && unsafe(cell, 'up') ? 'up' : pick;
    const [ax0, ay0] = C(cell[0], cell[1]), [ax1, ay1] = C(next[0], next[1]), ax = A.lerp(ax0, ax1, mv), ay = A.lerp(ay0, ay1, mv);
    if (!done && f < 0.62) {
      for (const a of Object.keys(ACT)) {
        const [dx, dy] = ACT[a], ex = ax0 + dx * cs * 0.62, ey = ay0 + dy * cs * 0.62, bad = unsafe(cell, a);
        let col = P.ink3, lw = 1.4;
        if (mode === 'pre' && bad && f > 0.12) col = A.alpha(P.ink3, 0.35);
        if (f > 0.3 && a === agent) { col = P.mot; lw = 2.8; }
        if (mode === 'post' && bad && f > 0.42) { col = A.alpha(P.mot, 0.4); lw = 2; }
        if (mode === 'post' && f > 0.42 && unsafe(cell, 'up') && a === pick) { col = P.out; lw = 2.8; }
        if (a === 'stay') A.circle(c, ax0 + cs * 0.3, ay0 + cs * 0.3, 3, col, null); else arrow(c, k, ax0 + dx * cs * 0.2, ay0 + dy * cs * 0.2, ex, ey, col, lw, 6);
        if (bad && ((mode === 'pre' && f > 0.12) || (mode === 'post' && f > 0.42))) HeroKit.cross(c, ex - dx * cs * 0.14, ey - dy * cs * 0.14, 6, P.out, 2.4);
      }
    }
    c.save(); c.translate(ax, ay); c.scale(0.7, 0.7); KettleDraw.ada(c, 0, 0, -Math.PI / 2, P.ink, 1); c.restore();
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T;
    for (const [mode, G, title, sub] of [['pre', g.L, 'щит до агента', 'опасное убрано до выбора'], ['post', g.R, 'щит после агента', 'опасный выбор заменён']]) {
      A.lab(c, k, title, G[0] + G[2] * 3.5, G[1] - 30, { px: 12, weight: 700, color: P.ink, halo: false });
      A.lab(c, k, sub, G[0] + G[2] * 3.5, G[1] - 13, { px: 10, color: P.ink3, halo: false });
      grid(c, k, P, A, G, mode, u);
    }
    g.leg.forEach(([x, y, txt]) => A.lab(c, k, txt, x, y, { px: 10, color: P.ink2, halo: false }));
  }
  Anim.add('shield', {
    W: 720, H: 360, start: 3.3, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { L: [30, 70, 44], R: [382, 70, 44], leg: [[360, 322, 'оранжевое — выбор агента, синее — щит, красная клетка — касание чайника']] }); },
    narrow: { W: 360, H: 620, draw(c, k, t, P, A) { draw(c, k, t, P, A, { L: [33, 56, 42], R: [33, 346, 42], leg: [[180, 584, 'оранжевое — выбор агента, синее — щит'], [180, 602, 'красная клетка — касание чайника']] }); } },
  });
})();

/* =====================================================================
   Общее: политика учится один раз, серии поездок считаются по запросу и кэшируются
   ===================================================================== */
const Store = (() => {
  let pol = null, run = null; const subs = new Set(), cache = {}, trips = {};
  /** Обучить политику (или дождаться уже идущего обучения). onProg(доля от 0 до 1). */
  async function policy(onProg) {
    if (pol) return pol;
    if (onProg) subs.add(onProg);
    if (!run) {
      let last = 0;
      run = runChunked(L82.train(L82.CFG.SEED, { every: 25 }), (ev) => { const now = performance.now(); if (now - last > 120) { last = now; subs.forEach((f) => f(ev.it / ev.iters)); } }, 14);
    }
    try { pol = await run; } finally { if (onProg) subs.delete(onProg); }
    return pol;
  }
  const key = (o) => JSON.stringify(o || {});
  /** Серия из 100 поездок с настройками o (кэш по настройкам). */
  function batch(o) { const kk = key(o); if (!cache[kk]) cache[kk] = L82.batch(pol, o); return cache[kk]; }
  /** Одна поездка с рядами для графиков. */
  function trip(seed, o) { const kk = seed + '|' + key(o); if (!trips[kk]) trips[kk] = L82.trip(pol, Object.assign({}, o, { seed, keep: true })); return trips[kk]; }
  return { policy, batch, trip, get ready() { return !!pol; } };
})();
/** План дома с серией: места всех чайников точками (красные — касание), выбранная поездка крупно. */
const House = (() => {
  const K = HeroKit, E = L82;
  /** crop — показать только середину дома, полосу x от 130 до 470 см, где стоят чайники (для маленьких сцен). */
  const CX0 = 130, CX1 = 470;
  function base(cv, crop) {
    const W = crop ? CX1 - CX0 : E.W, ar = `${W} / ${E.H}`; if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
    const { c, k } = K.fit(cv, W, E.H), P = pal(), KP = KettleDraw.pal();
    if (crop) c.translate(-CX0, 0);
    KettleDraw.house(c, k, KP, { labels: !crop && k < 1.7 }); return { c, k, P, KP, W };
  }
  function dots(c, k, P, b) { if (!b) return; for (const q of b.trips) { const hit = q.outcome === 'kettle'; c.beginPath(); c.arc(q.k.x, q.k.y, hit ? 4.2 : 3, 0, 7); c.fillStyle = hit ? P.bad : P.ink3; c.globalAlpha = hit ? 0.9 : 0.4; c.fill(); } c.globalAlpha = 1; }
  /** Путь поездки: color — основной цвет, actColor — шаги, где фильтр менял команду. */
  function path(c, k, q, color, actColor, P, o) {
    o = o || {}; const pts = q.pts, ser = q.ser;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i + 1 < pts.length; i++) {
      const act = actColor && ser && ser[i] && ser[i].act;
      c.strokeStyle = act ? actColor : color; c.lineWidth = (act ? 4 : 3) * k * (o.thin ? 0.7 : 1); c.globalAlpha = o.alpha || 1;
      c.beginPath(); c.moveTo(pts[i].x, pts[i].y); c.lineTo(pts[i + 1].x, pts[i + 1].y); c.stroke();
    }
    c.globalAlpha = 1;
    const L = pts[pts.length - 1], Pp = pts[Math.max(0, pts.length - 3)];
    if (!o.noAda) KettleDraw.ada(c, L.x, L.y, KettleDraw.heading(Pp.x, Pp.y, L.x, L.y), color, 0.95);
    if (!o.noMark) markEnd(c, k, L.x + 24, L.y - 22, q.outcome, P);
  }
  return { base, dots, path };
})();

/* =====================================================================
   1. Интерактив: одна команда фильтра в плоскости скоростей
   ===================================================================== */
const Qp = (() => {
  const K = HeroKit, W = 400, H = 360, S = 2, KX = 200, KY = 120, VC = { x: 200, y: 188 }, VS = 150 / 90, D = 36;
  const st = { p: { x: 0, y: 56 }, ur: { x: 0, y: -60 }, ai: 3, reveal: true, fixedA: true };
  let ctl = null;
  const alpha = () => ALPHAS[st.ai];
  function solve() {
    const d = Math.hypot(st.p.x, st.p.y), n = { x: st.p.x / d, y: st.p.y / d }, h = d - D, a = alpha();
    const f = L82.qp(st.ur, [{ nx: n.x, ny: n.y, b: -a * h }]);
    const u = { x: f.x, y: f.y };
    return { n, h, a, u, lim: a * h, apprRef: -(n.x * st.ur.x + n.y * st.ur.y), appr: -(n.x * u.x + n.y * u.y), corr: Math.hypot(u.x - st.ur.x, u.y - st.ur.y) };
  }
  function drawMap() {
    const cv = $('#qMap'), { c, k } = K.fit(cv, W, H), P = pal(), KP = KettleDraw.pal(), r = solve();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 40, P.grid);
    c.save(); c.translate(KX, KY); c.scale(S, S); KettleDraw.kettle(c, k / S, KP, { x: 0, y: 0 }); c.restore();
    dashCircle(c, k, KX, KY, 31 * S, P.bad, 1.4, [3, 3]);
    dashCircle(c, k, KX, KY, D * S, P.cl, 2.2, [7, 4]);
    const ax = KX + st.p.x * S, ay = KY + st.p.y * S;
    c.strokeStyle = P.ink3; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(KX, KY); c.lineTo(ax, ay); c.stroke();
    c.save(); c.translate(ax, ay); c.scale(S, S); KettleDraw.ada(c, 0, 0, -Math.PI / 2, P.ink, 1); c.restore();
    const vs = 0.8;
    arrow(c, k, ax, ay, ax + st.ur.x * vs, ay + st.ur.y * vs, P.e2e, 3.2);
    if (st.reveal && r.corr > 0.5) arrow(c, k, ax, ay, ax + r.u.x * vs, ay + r.u.y * vs, P.cl, 3.2);
    const lx = Math.cos(-2.4), ly = Math.sin(-2.4);
    K.label(c, k, 'граница', KX + lx * (D * S + 14), KY + ly * (D * S + 14), { px: 10.5, weight: 650, color: P.cl, haloColor: P.bg });
    K.label(c, k, 'касание', KX + Math.cos(-0.7) * (D * S + 22), KY + Math.sin(-0.7) * (D * S + 22), { px: 10.5, weight: 650, color: P.bad, haloColor: P.bg });
    const side = st.p.x > 30 ? -1 : 1;
    K.label(c, k, `h = ${fmt(Math.max(0, r.h), 0)} см`, ax + side * 74, ay + 4, { px: 12, weight: 700, color: P.ink, haloColor: P.bg });
  }
  function drawVel() {
    const cv = $('#qVel'), { c, k } = K.fit(cv, W, H), P = pal(), r = solve(), X = (vx) => VC.x + vx * VS, Y = (vy) => VC.y + vy * VS;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1 * k;
    for (const v of [30, 60]) { c.beginPath(); c.arc(VC.x, VC.y, v * VS, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(X(-90), VC.y); c.lineTo(X(90), VC.y); c.moveTo(VC.x, Y(-90)); c.lineTo(VC.x, Y(90)); c.stroke();
    c.strokeStyle = P.ink3; c.lineWidth = 1.4 * k; c.beginPath(); c.arc(VC.x, VC.y, 90 * VS, 0, 7); c.stroke();
    // запрещённая полуплоскость n·u < −αh, внутри круга 90 см/с
    const n = r.n, t = { x: -n.y, y: n.x }, u0 = { x: -r.lim * n.x, y: -r.lim * n.y }, F = 400;
    c.save(); c.beginPath(); c.arc(VC.x, VC.y, 90 * VS, 0, 7); c.clip();
    c.beginPath();
    const q1 = { x: u0.x + F * t.x, y: u0.y + F * t.y }, q2 = { x: u0.x - F * t.x, y: u0.y - F * t.y };
    c.moveTo(X(q1.x), Y(q1.y)); c.lineTo(X(q2.x), Y(q2.y)); c.lineTo(X(q2.x - F * n.x), Y(q2.y - F * n.y)); c.lineTo(X(q1.x - F * n.x), Y(q1.y - F * n.y)); c.closePath();
    c.fillStyle = P.clS; c.fill(); K.hatch(c, 0, 0, W, H, P.cl, 9, 0.8);
    c.restore();
    c.strokeStyle = P.cl; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(X(q1.x), Y(q1.y)); c.lineTo(X(q2.x), Y(q2.y)); c.stroke();
    // направление «к чайнику»
    const tk = { x: -n.x, y: -n.y };
    c.save(); c.setLineDash([3 * k, 4 * k]); c.strokeStyle = P.ink3; c.lineWidth = 1.2 * k; c.beginPath(); c.moveTo(VC.x, VC.y); c.lineTo(X(tk.x * 90), Y(tk.y * 90)); c.stroke(); c.restore();
    K.label(c, k, 'к чайнику', X(tk.x * 101), Y(tk.y * 101) - 2, { px: 10, color: P.ink3, haloColor: P.surf });
    if (Math.abs(Math.atan2(tk.x, -tk.y)) > 0.45) K.label(c, k, 'вперёд', VC.x, Y(-90) - 9, { px: 10, color: P.ink3, haloColor: P.surf });
    K.label(c, k, 'вправо', X(90) - 4, VC.y + 12, { px: 10, color: P.ink3, align: 'right', haloColor: P.surf });
    K.label(c, k, '90 см/с', X(-64) - 2, Y(-64) - 2, { px: 9.5, color: P.ink3, align: 'right', haloColor: P.surf });
    arrow(c, k, VC.x, VC.y, X(st.ur.x), Y(st.ur.y), P.e2e, 3.4, 11);
    c.beginPath(); c.arc(X(st.ur.x), Y(st.ur.y), 7, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 1.6 * k; c.stroke();
    if (st.reveal) {
      if (r.corr > 0.5) {
        c.save(); c.setLineDash([3 * k, 3 * k]); c.strokeStyle = P.ink2; c.lineWidth = 1.2 * k; c.beginPath(); c.moveTo(X(st.ur.x), Y(st.ur.y)); c.lineTo(X(r.u.x), Y(r.u.y)); c.stroke(); c.restore();
        arrow(c, k, VC.x, VC.y, X(r.u.x), Y(r.u.y), P.cl, 3.4, 11);
      }
      const nb = k > 1.4;
      K.label(c, k, nb ? `не быстрее ${fmt(r.lim, 0)} см/с` : `граница: к чайнику не быстрее α·h = ${fmt(r.lim, 0)} см/с`, W / 2, H - 12, { px: 10.5, weight: 650, color: P.cl, haloColor: P.surf });
    } else K.label(c, k, 'что пропустит фильтр — после ставки', W / 2, H - 12, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf });
  }
  function render() {
    drawMap(); drawVel();
    syncRange($('#qAlpha'), fmtA(alpha()));
    const r = solve(), sp = Math.hypot(st.ur.x, st.ur.y);
    let s = `Запас h = <b>${fmt(Math.max(0, r.h), 0)} см</b>, α = ${fmtA(r.a)}: к чайнику можно не быстрее <b>${fmt(r.lim, 0)} см/с</b>. Политика просит ${fmt(sp, 0)} см/с, из них к чайнику ${fmt(Math.max(0, r.apprRef), 0)}.`;
    if (!st.reveal) s += ' Что сделает фильтр — после ставки.';
    else s += r.corr <= 0.5 ? ' Фильтр пропускает команду без изменений.' : ` Фильтр: ${fmt(Math.hypot(r.u.x, r.u.y), 0)} см/с, к чайнику ${fmt(Math.max(0, r.appr), 0)}, поправка ${fmt(r.corr, 0)} см/с.`;
    setOut($('#qOut'), s);
  }
  function state() { const r = solve(); return { h: r.h, alpha: r.a, lim: r.lim, ur: { x: st.ur.x, y: st.ur.y }, u: r.u, corr: r.corr, speedRef: Math.hypot(st.ur.x, st.ur.y), speed: Math.hypot(r.u.x, r.u.y), apprRef: r.apprRef, appr: r.appr, px: st.p.x, py: st.p.y, reveal: st.reveal }; }
  function setAda(x, y) {
    let d = Math.hypot(x, y); if (d < 1e-6) { x = 0; y = D; d = D; }
    if (d < D) { x *= D / d; y *= D / d; }
    st.p.x = Math.max(-92, Math.min(92, x)); st.p.y = Math.max(-54, Math.min(114, y));
    const d2 = Math.hypot(st.p.x, st.p.y); if (d2 < D) { st.p.x *= D / d2; st.p.y *= D / d2; }
  }
  function setCmd(vx, vy) { const v = Math.hypot(vx, vy); if (v > 90) { vx *= 90 / v; vy *= 90 / v; } st.ur.x = vx; st.ur.y = vy; }
  const api = {
    reset() { st.p = { x: 0, y: 56 }; st.ur = { x: 0, y: -60 }; st.ai = 3; st.reveal = true; render(); },
    state, render, st, setAda: (x, y) => { setAda(x, y); render(); if (ctl) ctl.update(); }, setCmd: (x, y) => { setCmd(x, y); render(); if (ctl) ctl.update(); },
    async apply() { st.reveal = true; render(); return state(); },
  };
  const missions = [
    { short: 'Вбок', title: 'Что фильтр пропускает без изменений', text: 'Ада прямо перед чайником, запас 20 см, α = 2. Политика командует прямо вперёд, в чайник, 60 см/с — фильтр разрешает сближаться не быстрее 40 см/с и гасит часть команды. Перетащи конец оранжевой стрелки так, чтобы Ада ехала не медленнее 60 см/с, а фильтр не менял команду.',
      onEnter: (X) => { X.st.p = { x: 0, y: 56 }; X.st.ur = { x: 0, y: -60 }; X.st.ai = 3; X.st.reveal = true; X.render(); },
      criteria: [{ label: 'Команда не медленнее 60 см/с', test: (r, s) => s.speedRef >= 59.5 }, { label: 'Фильтр не меняет команду', test: (r, s) => s.corr <= 0.5 }],
      hint: 'Запрещено только быстрое сближение с чайником. Посмотри, куда смотрит синяя граница в плоскости скоростей: всё, что левее или правее, — разрешено.',
      explain: (r) => `Команда ${fmt(r.speedRef, 0)} см/с, из них к чайнику ${fmt(Math.max(0, r.apprRef), 0)} — не больше разрешённых ${fmt(r.lim, 0)}, и фильтр её пропускает. Правило ограничивает одну составляющую скорости — сближение; вбок и назад можно ехать как угодно быстро. Объезд — как раз то, что фильтр не трогает.` },
    { short: 'В чайник', title: 'Команда прямо в чайник', text: 'Теперь запас 15 см, политика снова командует прямо на чайник, 60 см/с, α = 2. Синюю стрелку пока не видно.',
      onEnter: (X) => { X.st.p = { x: 0, y: 51 }; X.st.ur = { x: 0, y: -60 }; X.st.ai = 3; X.st.reveal = false; X.render(); },
      bet: { q: 'что пропустит фильтр?', options: ['Остановит Аду: команда ведёт в чайник', 'Оставит направление и снизит скорость до α·h', 'Повернёт команду вбок и сохранит 60 см/с'], answer: (r) => (r.speed < 1 ? 0 : Math.abs(r.u.x) > 5 ? 2 : 1) },
      action: { label: 'Применить фильтр', run: (X) => X.apply() },
      criteria: [{ label: 'Фильтр применён', test: (r) => !!r && r.reveal }],
      explain: (r) => `Фильтр оставил направление и снизил скорость до ${fmt(r.speed, 0)} см/с — ровно α·h = 2 · 15. Он не поворачивает Аду в объезд: в задаче нет ничего, кроме близости к команде политики, а ближайшая допустимая точка к команде «прямо в чайник» лежит на той же прямой. Чем меньше запас, тем медленнее Ада будет подъезжать.` },
    { short: 'Граница', title: 'Что остаётся на самой границе', text: 'Команда та же — прямо в чайник. Перетащи Аду к самой границе, чтобы запас стал меньше 2 см, и посмотри, что пропускает фильтр.',
      onEnter: (X) => { X.st.ur = { x: 0, y: -60 }; X.st.ai = 3; X.st.reveal = true; X.render(); },
      criteria: [{ label: 'Запас меньше 2 см', test: (r, s) => s.h < 2 }, { label: 'Команда прямо в чайник, 60 см/с', test: (r, s) => s.speedRef >= 59 && Math.abs(s.ur.x) < 1 }, { label: 'Фильтр пропускает меньше 10 см/с', test: (r, s) => s.speed < 10 }],
      hint: 'Тяни Аду вверх, к синему пунктиру, держась напротив чайника.',
      explain: (r) => `При запасе ${fmt(Math.max(0, r.h), 1)} см фильтр пропускает ${fmt(r.speed, 1)} см/с. На границе сближение запрещено совсем: остаётся только та часть команды, что идёт вдоль границы. Если Ада точно напротив чайника, такой части нет, и Ада стоит; если чуть сбоку — медленно скользит вокруг. Безопасно, но до стола так не доехать — это залипание, его цену увидим на целых поездках.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай Аду вокруг чайника, меняй команду и α. Найди положение и команду, при которых фильтр добавляет к команде боковую скорость, которой у политики не было.', final: true, controls: ['alpha'], onEnter: (X) => { X.st.reveal = true; X.render(); } },
  ];
  function init() {
    const map = $('#qMap'), vel = $('#qVel');
    K.drag(map, W, H, {
      hit: (p) => (Math.hypot(p.x - (KX + st.p.x * S), p.y - (KY + st.p.y * S)) < 46 ? {} : null),
      move: (o, p) => api.setAda((p.x - KX) / S, (p.y - KY) / S),
      tap: (p) => api.setAda((p.x - KX) / S, (p.y - KY) / S),
    });
    K.drag(vel, W, H, {
      hit: (p) => (Math.hypot(p.x - (VC.x + st.ur.x * VS), p.y - (VC.y + st.ur.y * VS)) < 32 ? {} : null),
      move: (o, p) => api.setCmd((p.x - VC.x) / VS, (p.y - VC.y) / VS),
      tap: (p) => api.setCmd((p.x - VC.x) / VS, (p.y - VC.y) / VS),
    });
    $('#qAlpha').addEventListener('input', (e) => { st.ai = +e.target.value; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#qMis', missions, api, { controls: { alpha: '#wrapQAlpha' }, scene: '#qScene' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: сто поездок без фильтра и с фильтром
   ===================================================================== */
const OUT_WORD = { goal: 'доехала', kettle: 'задела чайник', box: 'задела корзину', wall: 'задела стену', stuck: 'не доехала за 15 с' };
const Duel = (() => {
  const E = L82, K = HeroKit;
  const st = { ran: { nof: false, fil: false }, sel: 0, busy: false, prog: 0 };
  let ctl = null;
  const nof = () => (st.ran.nof ? Store.batch({}) : null), fil = () => (st.ran.fil ? Store.batch({ filter: true }) : null);
  const seedOf = (i) => E.CFG.TRIP0 + i;
  function pane(side) {
    const cv = $('#dCv' + side), { c, k, P, KP } = House.base(cv, true), filt = side === 'R', b = filt ? fil() : nof();
    if (!b) {
      K.label(c, k, st.busy ? 'учится…' : (filt ? 'ещё не запускали' : 'нажми кнопку миссии'), 300, E.H / 2 + 50, { px: 13, weight: 700, color: P.ink, haloColor: P.bg });
      setOut($('#dStat' + side), st.busy ? `Политика учится по 300 демонстрациям: ${Math.round(st.prog * 100)}%` : 'Серию ещё не запускали'); $('#dStat' + side).className = 'pane-stat';
      setOut($('#dSub' + side), filt ? 'α = 2, запас 5 см' : 'без страховки'); return;
    }
    House.dots(c, k, P, b);
    const q = Store.trip(seedOf(st.sel), filt ? { filter: true } : {});
    if (filt) dashCircle(c, k, q.k.x, q.k.y, E.RA + E.RK + E.CFG.MARGIN, P.cl, 1.8, [6, 4]);
    KettleDraw.kettle(c, k, KP, q.k, { hot: q.outcome === 'kettle' });
    House.path(c, k, q, P.e2e, filt ? P.cl : null, P);
    const stuck = b.stuck, ttl = `<b>${b.goal} из 100 доехали</b> · ${b.kettle ? `касаний: ${b.kettle}` : 'касаний нет'}${stuck ? ` · встали: ${stuck}` : ''} · ${fmt(b.tMean, 2)} с`;
    setOut($('#dStat' + side), ttl); $('#dStat' + side).className = 'pane-stat ' + (b.kettle ? 'bad' : 'ok');
    setOut($('#dSub' + side), `поездка ${st.sel + 1}: ${OUT_WORD[q.outcome]}${q.outcome === 'goal' ? `, ${fmt(q.time, 1)} с` : ''}`);
  }
  const COLS = 20, ROWS = 5;
  function geom() { const cv = $('#dBoard'), nar = canvasNarrow(cv, 640), W = nar ? 380 : 640, H = nar ? 200 : 150; return { cv, nar, W, H, x0: 8, y0: 8, cw: (W - 16) / COLS, ch: (H - 16) / ROWS }; }
  function board() {
    const g = geom(); if (g.cv.style.aspectRatio !== `${g.W} / ${g.H}`) g.cv.style.aspectRatio = `${g.W} / ${g.H}`;
    const { c, k } = K.fit(g.cv, g.W, g.H), P = pal(), a = nof(), b = fil();
    c.fillStyle = P.surf; c.fillRect(0, 0, g.W, g.H);
    const col = (o) => (o === 'goal' ? P.good : o === 'stuck' ? P.ink3 : P.bad);
    for (let i = 0; i < 100; i++) {
      const cx = g.x0 + (i % COLS) * g.cw, cy = g.y0 + Math.floor(i / COLS) * g.ch, w = g.cw - 3, hh = (g.ch - 3) / 2;
      for (const [bb, yy] of [[a, cy], [b, cy + hh]]) { c.fillStyle = bb ? col(bb.trips[i].outcome) : P.line; c.globalAlpha = bb ? (bb.trips[i].outcome === 'goal' ? 0.45 : 0.95) : 0.5; c.fillRect(cx, yy, w, hh - 0.5); }
      c.globalAlpha = 1;
      if (i === st.sel && (a || b)) { c.strokeStyle = P.ink; c.lineWidth = 2.4 * k; c.strokeRect(cx - 1, cy - 1, w + 2, 2 * hh + 1.5); }
    }
    if (!a) K.label(c, k, g.nar ? 'запусти серию кнопкой миссии' : 'табло заполнится, когда серия проедет: сделай ставку и нажми кнопку миссии', g.W / 2, g.H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
  }
  function render() {
    pane('L'); pane('R'); board();
    const pg = $('#dProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const a = nof(), b = fil();
    if (st.busy) { setOut($('#dOut'), `Политика учится в браузере: ${Math.round(st.prog * 100)}%.`); return; }
    if (!a) { setOut($('#dOut'), 'Политика ещё не обучена.'); return; }
    const qa = a.trips[st.sel], qb = b ? b.trips[st.sel] : null, dk = qa.k.x - E.RX;
    let s = `Поездка ${st.sel + 1}: чайник в ${fmt(Math.abs(dk), 1)} см ${dk < 0 ? 'левее' : 'правее'} маршрута. Без фильтра Ада ${OUT_WORD[qa.outcome]}${qa.outcome === 'goal' ? ` за ${fmt(qa.time, 1)} с` : ''}`;
    if (qb) { const qq = Store.trip(seedOf(st.sel), { filter: true }); s += `; с фильтром — ${OUT_WORD[qb.outcome]}${qb.outcome === 'goal' ? ` за ${fmt(qb.time, 1)} с` : ''}, фильтр менял команду на ${qq.nAct} шагах из ${qq.steps}, наименьший зазор до чайника ${fmt(qb.minGap, 1)} см`; }
    setOut($('#dOut'), s + '.');
  }
  async function ensurePolicy() {
    if (Store.ready) return;
    st.busy = true; st.prog = 0; render();
    try { await Store.policy((p) => { st.prog = p; const pg = $('#dProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#dOut'), `Политика учится в браузере: ${Math.round(p * 100)}%.`); setOut($('#dStatL'), `Политика учится по 300 демонстрациям: ${Math.round(p * 100)}%`); }); }
    finally { st.busy = false; }
  }
  function select(i) { st.sel = Math.max(0, Math.min(99, i)); render(); if (ctl) ctl.update(); }
  function state() {
    const a = nof(), b = fil(), s = { ranNof: !!a, ranFil: !!b, sel: st.sel };
    if (a) s.nofOut = a.trips[st.sel].outcome;
    if (b) { s.filOut = b.trips[st.sel].outcome; s.filTime = b.trips[st.sel].time; }
    return s;
  }
  const sum = (b) => ({ goal: b.goal, kettle: b.kettle, stuck: b.stuck, t: b.tMean, act: b.act, trips: b.trips });
  const api = {
    reset() { st.sel = 0; render(); }, state, render, st, select,
    async runNof() {
      await ensurePolicy(); st.ran.nof = true;
      const a = Store.batch({}), i = a.trips.findIndex((q) => q.outcome === 'kettle'); st.sel = i < 0 ? 0 : i; render();
      const hits = a.trips.filter((q) => q.outcome === 'kettle');
      return Object.assign(sum(a), { dkMax: Math.max(0, ...hits.map((q) => Math.abs(q.k.x - E.RX))), onRoute: a.trips.filter((q) => Math.abs(q.k.x - E.RX) < E.RA + E.RK).length, first: i + 1 });
    },
    async runFil() {
      await ensurePolicy(); st.ran.nof = true; st.ran.fil = true; render();
      const a = Store.batch({}), b = Store.batch({ filter: true });
      return Object.assign(sum(b), { nof: sum(a) });
    },
  };
  const missions = [
    { short: 'Без страховки', title: 'Политика на ста поездках', text: 'Политика учится в браузере по 300 демонстрациям, потом едет 100 раз; чайник каждый раз на новом месте. На маршруте — так, что прямой путь его задевает, — он стоит примерно в половине поездок.',
      bet: { q: 'в скольких поездках из 100 Ада заденет чайник?', options: ['Ни в одной: политика обучена на 300 демонстрациях', 'В нескольких: почти всегда она выбирает сторону', 'Примерно в трети: чайник на маршруте в половине поездок'], answer: (r) => (r.kettle === 0 ? 0 : r.kettle <= 15 ? 1 : 2) },
      action: { label: 'Обучить политику и проехать 100 раз', run: (X) => X.runNof() },
      criteria: [{ label: 'Серия без фильтра проехала', test: (r) => !!r && r.goal + r.kettle + r.stuck === 100 }],
      explain: (r) => `Ада задела чайник в ${nTripsIn(r.kettle)} из 100, остальные ${r.goal} доехали за ${fmt(r.t, 1)} с. На маршруте чайник стоял в ${r.onRoute} поездках, и почти все такие поездки политика объехала. Касания — только там, где чайник стоял ближе ${fmt(r.dkMax, 1)} см к линии маршрута: учитель объезжал такие чайники то слева, то справа, и регрессия усреднила объезды, как в уроке 1.3. На табло выбрана поездка ${r.first} — первая с касанием.` },
    { short: 'С фильтром', title: 'Те же поездки с фильтром', text: 'Справа — та же политика с фильтром: α = 2, запас 5 см. Поездки те же самые: места чайника, ошибки камеры и шум колёс совпадают шаг в шаг.',
      bet: { q: 'сколько касаний будет с фильтром?', options: ['Столько же: политика та же', 'Меньше, но не ноль: камера ошибается', 'Ни одного'], answer: (r) => (r.kettle === 0 ? 2 : r.kettle < r.nof.kettle ? 1 : 0) },
      action: { label: 'Проехать те же 100 с фильтром', run: (X) => X.runFil() },
      criteria: [{ label: 'Касаний с фильтром нет', test: (r) => !!r && r.kettle === 0 }],
      explain: (r) => `С фильтром касаний нет: ${nTrips(r.goal)} из 100 ${plural(r.goal, 'доехала', 'доехали', 'доехали')}, ${r.stuck ? `${nTrips(r.stuck)} не ${plural(r.stuck, 'доехала', 'доехали', 'доехали')} за 15 с` : 'недоездов нет'}. Цена — время: в среднем ${fmt(r.t, 2)} с против ${fmt(r.nof.t, 2)} с без фильтра. Фильтр менял команду на ${fmt(r.act * 100, 0)}% шагов — в основном там, где политика ехала прямо в чайник, но понемногу и в обычных объездах, когда Ада проходила близко к нему.` },
    { short: 'Объезд', title: 'Как фильтр провёл Аду мимо чайника', text: 'Нажми на табло клетку, где без фильтра было касание (красный верх), а с фильтром Ада доехала (зелёный низ), но дольше 10 секунд.',
      criteria: [{ label: 'Без фильтра в этой поездке касание', test: (r, s) => s.nofOut === 'kettle' }, { label: 'С фильтром Ада доехала дольше 10 с', test: (r, s) => s.filOut === 'goal' && s.filTime > 10 }],
      hint: 'Таких поездок в серии две. Смотри на клетки с красным верхом.',
      explain: (r) => `В поездке ${r.sel + 1} политика ведёт Аду прямо на чайник. Фильтр гасит сближение, Ада подходит к синей границе и дальше скользит вдоль неё — так же, как в интерактиве, когда Ада чуть сбоку от линии на чайник. Синие отрезки пути — шаги, где фильтр менял команду. До стола Ада доехала за ${fmt(r.filTime, 1)} с вместо обычных 5,2.` },
    { short: 'Не доехала', title: 'Поездка, которую фильтр не дал закончить', text: 'Найди на табло поездку, в которой Ада с фильтром не доехала за 15 секунд (серый низ).',
      criteria: [{ label: 'С фильтром Ада не доехала', test: (r, s) => s.filOut === 'stuck' }],
      explain: (r) => `В поездке ${r.sel + 1} чайник стоит почти на линии маршрута. Политика всё время тянет Аду на прямую через чайник, фильтр не пускает её за границу, и две команды уравновешиваются: Ада стоит у синего пунктира до конца 15 секунд. Касания нет, но и задача не выполнена.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Нажимай на клетки табло и сравнивай пути. Найди поездку, где политика сама объехала чайник, а фильтр всё равно вмешался, и посмотри, на скольких шагах.', final: true },
  ];
  function init() {
    $('#dBoard').addEventListener('click', (e) => {
      if (!nof()) return; const g = geom(), r = g.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * g.W, y = (e.clientY - r.top) / r.height * g.H;
      const i = Math.floor((x - g.x0) / g.cw), j = Math.floor((y - g.y0) / g.ch); if (i >= 0 && i < COLS && j >= 0 && j < ROWS) select(j * COLS + i);
    });
    ctl = mountMissions('#dMis', missions, api, { scene: '#dDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: параметр α — фазовая плоскость одной поездки и итоги серий
   ===================================================================== */
const Alpha = (() => {
  const E = L82, K = HeroKit, TRIP = 80;
  const st = { ai: 3, ran: new Set(), nofShown: false, busy: false, prog: 0 };
  let ctl = null;
  const alpha = () => ALPHAS[st.ai];
  const optA = (a) => (a === 2 ? { filter: true } : { filter: true, alpha: a });
  const res = (a) => Store.batch(optA(a));
  const seed = () => E.CFG.TRIP0 + TRIP - 1;
  function phase() {
    const cv = $('#aPhase'), W = 560, H = 420, { c, k } = K.fit(cv, W, H), P = pal();
    const x0 = 52, x1 = 546, y0 = 44, y1 = 370, HL = -8, HR = 60, VL = -10, VR = 72;
    const X = (h) => x0 + (x1 - x0) * (h - HL) / (HR - HL), Y = (v) => y1 - (y1 - y0) * (v - VL) / (VR - VL);
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1 * k;
    for (let h = 0; h <= 60; h += 20) { c.beginPath(); c.moveTo(X(h), y0); c.lineTo(X(h), y1); c.stroke(); K.label(c, k, fmt(h, 0), X(h), y1 + 13, { px: 10, color: P.ink3, halo: false }); }
    for (let v = 0; v <= 60; v += 20) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); K.label(c, k, fmt(v, 0), x0 - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    c.strokeStyle = P.ink3; c.lineWidth = 1.2 * k; c.beginPath(); c.moveTo(X(0), y0); c.lineTo(X(0), y1); c.moveTo(x0, Y(0)); c.lineTo(x1, Y(0)); c.stroke();
    const a = alpha(), shown = Store.ready && st.ran.has(st.ai);
    // запрещено правилом: скорость сближения больше α·h
    c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.beginPath(); c.moveTo(X(HL), Y(a * HL)); c.lineTo(X(HR), Y(a * HR)); c.lineTo(X(HR), Y(VR + 50)); c.lineTo(X(HL), Y(VR + 50)); c.closePath();
    c.fillStyle = P.clS; c.fill(); K.hatch(c, x0, y0, x1, y1, P.cl, 9, 0.7);
    c.strokeStyle = P.cl; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(X(HL), Y(a * HL)); c.lineTo(X(HR), Y(a * HR)); c.stroke();
    c.save(); c.setLineDash([5 * k, 4 * k]); c.strokeStyle = P.bad; c.lineWidth = 1.8 * k; c.beginPath(); c.moveTo(X(-5), y0); c.lineTo(X(-5), y1); c.stroke(); c.restore();
    const curve = (q, color, dot) => {
      const s = q.ser; c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2 * k; c.beginPath();
      s.forEach((p, i) => { const xx = X(p.gap - 5), yy = Y(p.appr); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); }); c.stroke();
      for (const p of s) { c.beginPath(); c.arc(X(p.gap - 5), Y(p.appr), dot * k, 0, 7); c.fill(); }
      const L = s[s.length - 1]; if (q.outcome === 'kettle') K.cross(c, X(L.gap - 5), Y(L.appr), 9, P.bad, 3);
    };
    if (Store.ready && st.nofShown) curve(Store.trip(seed(), {}), P.ink3, 2.2);
    if (shown) curve(Store.trip(seed(), optA(a)), P.cl, 3);
    c.restore();
    const nb = k > 1.4;
    K.label(c, k, 'касание', X(-5) + 6, Y(-5) + 2, { px: 10.5, weight: 650, color: P.bad, align: 'left', haloColor: P.surf });
    const lx = Math.min(HR - 4, (VR - 8) / a), ly = a * lx;
    if (a > 1) K.label(c, k, `α·h, α = ${fmtA(a)}`, X(lx) + 8, Y(VR - 6) + 4, { px: 11, weight: 700, color: P.cl, align: 'left', haloColor: P.surf });
    else K.label(c, k, `α·h, α = ${fmtA(a)}`, X(HR) - 4, Y(a * HR) - 16, { px: 11, weight: 700, color: P.cl, align: 'right', haloColor: P.surf });
    K.label(c, k, nb ? 'запас h, см' : 'запас до границы h, см', x1, y1 + 28, { px: 10.5, color: P.ink3, align: 'right', halo: false });
    K.label(c, k, nb ? 'сближение, см/с' : 'скорость сближения, см/с', x0 - 30, y0 - 22, { px: 10.5, weight: 650, color: P.ink2, align: 'left', halo: false });
    if (!shown && !st.busy) K.label(c, k, nb ? 'запусти серию кнопкой миссии' : 'путь с фильтром появится, когда серия с этим α проедет', (x0 + x1) / 2 + 30, Y(30), { px: 12, weight: 700, color: P.ink2, haloColor: P.surf });
  }
  function map() {
    const cv = $('#aMap'), { c, k, P, KP } = House.base(cv, true);
    if (!Store.ready) { K.label(c, k, 'ещё не обучена', 300, E.H / 2 + 50, { px: 13, weight: 700, color: P.ink, haloColor: P.bg }); return; }
    const q0 = Store.trip(seed(), {}); KettleDraw.kettle(c, k, KP, q0.k, {});
    if (st.ran.has(st.ai)) dashCircle(c, k, q0.k.x, q0.k.y, E.RA + E.RK + E.CFG.MARGIN, P.cl, 1.8, [6, 4]);
    if (st.nofShown) House.path(c, k, q0, P.ink3, null, P, { thin: true, noAda: st.ran.has(st.ai) });
    if (st.ran.has(st.ai)) House.path(c, k, Store.trip(seed(), optA(alpha())), P.cl, null, P);
  }
  function chart() {
    const cv = $('#aChart'), nar = canvasNarrow(cv, 640), W = nar ? 380 : 640, H = nar ? 260 : 230;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = nar ? 30 : 46, x1 = W - 10, y0 = 34, y1 = H - 46, M = 14, cols = ALPHAS.length + 1, cw = (x1 - x0) / cols;
    const Y = (v) => y1 - (y1 - y0) * v / M;
    c.strokeStyle = P.grid; c.lineWidth = 1 * k;
    for (let v = 0; v <= M; v += 5) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); K.label(c, k, fmt(v, 0), x0 - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    K.label(c, k, nar ? 'из 100 поездок' : 'поездок из 100: касания (красные) и недоезды (серые); под подписью α — среднее время доехавших', x0, 12, { px: 10.5, weight: 650, color: P.ink2, align: 'left', halo: false });
    let any = false;
    for (let j = 0; j < cols; j++) {
      const cx = x0 + cw * (j + 0.5), isNof = j === 0, ai = j - 1, b = isNof ? (st.nofShown && Store.ready ? Store.batch({}) : null) : (st.ran.has(ai) && Store.ready ? res(ALPHAS[ai]) : null);
      if (!isNof && ai === st.ai) { c.fillStyle = P.clS; c.fillRect(cx - cw / 2 + 2, y0 - 6, cw - 4, y1 - y0 + 6); }
      K.label(c, k, isNof ? (nar ? 'без' : 'без фильтра') : (nar ? fmtA(ALPHAS[ai]) : `α = ${fmtA(ALPHAS[ai])}`), cx, y1 + 14, { px: nar ? 9.5 : 10.5, weight: !isNof && ai === st.ai ? 750 : 600, color: isNof ? P.ink3 : P.ink2, halo: false });
      if (!b) { K.label(c, k, '?', cx, Y(2), { px: 12, color: P.ink3, halo: false }); continue; }
      any = true; const bw = Math.min(16, cw * 0.28);
      c.globalAlpha = isNof ? 0.55 : 1;
      c.fillStyle = P.bad; c.fillRect(cx - bw - 1, Y(Math.min(M, b.kettle)), bw, Math.max(1.5, y1 - Y(Math.min(M, b.kettle))));
      c.fillStyle = P.ink3; c.fillRect(cx + 1, Y(Math.min(M, b.stuck)), bw, Math.max(1.5, y1 - Y(Math.min(M, b.stuck))));
      c.globalAlpha = 1;
      K.label(c, k, `${b.kettle}/${b.stuck}`, cx, Y(Math.max(b.kettle, b.stuck)) - 9, { px: 10, weight: 700, color: P.ink, halo: false });
      if (b.tMean) K.label(c, k, `${fmt(b.tMean, 1)} с`, cx, y1 + 29, { px: nar ? 9 : 10, color: P.ink2, halo: false });
    }
    if (nar) K.label(c, k, 'касания/недоезды; внизу — время', x1, 12, { px: 9.5, color: P.ink3, align: 'right', halo: false });
    if (!any) K.label(c, k, nar ? 'запусти серию кнопкой миссии' : 'столбики появятся, когда проедут серии: сделай ставку и нажми кнопку миссии', (x0 + x1) / 2, (y0 + y1) / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf });
  }
  function render() {
    phase(); map(); chart(); syncRange($('#aAlpha'), fmtA(alpha()));
    const pg = $('#aProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#aOut'), `Политика учится в браузере: ${Math.round(st.prog * 100)}%.`); return; }
    if (!Store.ready || !st.ran.has(st.ai)) { setOut($('#aOut'), `α = ${fmtA(alpha())}: серию ещё не запускали.`); return; }
    const b = res(alpha()), q = Store.trip(seed(), optA(alpha()));
    setOut($('#aOut'), `α = ${fmtA(alpha())}: касаний ${b.kettle}, не доехали ${b.stuck}, доехавшие — в среднем за ${fmt(b.tMean, 2)} с; фильтр менял команду на ${fmt(b.act * 100, 0)}% шагов. Поездка ${TRIP}: ${OUT_WORD[q.outcome]}${q.outcome === 'goal' ? ` за ${fmt(q.time, 1)} с` : ''}.`);
  }
  async function ensure() {
    if (Store.ready) return;
    st.busy = true; st.prog = 0; render();
    try { await Store.policy((p) => { st.prog = p; const pg = $('#aProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#aOut'), `Политика учится в браузере: ${Math.round(p * 100)}%.`); }); }
    finally { st.busy = false; }
  }
  async function run(ai) {
    await ensure(); st.ai = ai; st.ran.add(ai); st.nofShown = true; render(); if (ctl) ctl.update();
    const b = res(ALPHAS[ai]), q = Store.trip(seed(), optA(ALPHAS[ai]));
    return { a: ALPHAS[ai], kettle: b.kettle, stuck: b.stuck, goal: b.goal, t: b.tMean, act: b.act, trip: q.outcome, tripT: q.time, base: res(2), nof: Store.batch({}) };
  }
  function state() { if (!Store.ready || !st.ran.has(st.ai)) return { ran: false, a: alpha() }; const b = res(alpha()); return { ran: true, a: alpha(), kettle: b.kettle, stuck: b.stuck, t: b.tMean }; }
  const api = {
    reset() { st.ai = 3; render(); }, state, render, st,
    async cautious() { st.ran.add(3); return run(0); },
    async sharp() { st.ran.add(3); return run(6); },
    async setAlpha(ai) { await ensure(); st.ai = ai; st.ran.add(ai); st.nofShown = true; render(); if (ctl) ctl.update(); return state(); },
  };
  const missions = [
    { short: 'Осторожно', title: 'Осторожный фильтр: α = 0,25', text: 'При α = 0,25 фильтр ограничивает сближение уже в метре от чайника: при запасе 1 м разрешено не больше 25 см/с. Для сравнения на графике будут и серии без фильтра и с α = 2 из лаборатории 1.', onEnter: (X) => { X.st.ai = 0; X.render(); },
      bet: { q: 'что будет с серией из 100 поездок?', options: ['Лучше, чем при α = 2: касаний нет, Ада едет так же быстро', 'Касаний нет, но Ада едет заметно дольше и чаще не доезжает', 'Касания вернутся: фильтр слишком слабый'], answer: (r) => (r.kettle > 0 ? 2 : r.stuck > r.base.stuck || r.t > r.base.tMean + 1 ? 1 : 0) },
      action: { label: 'Проехать 100 раз с α = 0,25', run: (X) => X.cautious() },
      criteria: [{ label: 'Серия с α = 0,25 проехала', test: (r) => !!r && r.a === 0.25 }],
      explain: (r) => `Касаний нет, но не ${plural(r.stuck, 'доехала', 'доехали', 'доехали')} ${nTrips(r.stuck)} из 100 против ${r.base.stuck} при α = 2, а доехавшие тратят в среднем ${fmt(r.t, 2)} с против ${fmt(r.base.tMean, 2)}. Фильтр менял команду на ${fmt(r.act * 100, 0)}% шагов: он тормозит Аду в каждом объезде, едва она начинает сближаться с чайником. Поездка 80 — ${OUT_WORD[r.trip]}: на фазовой плоскости синие точки ползут вдоль пологой прямой α·h и к границе не подходят.` },
    { short: 'Резко', title: 'Резкий фильтр: α = 16', text: 'При α = 16 фильтр не трогает команду до запаса 4 см (60 см/с = 16 · 3,75 см) и тормозит в последний момент. Модель фильтра считает, что Ада меняет скорость мгновенно.', onEnter: (X) => { X.st.ai = 6; X.render(); },
      bet: { q: 'что будет с серией?', options: ['Касаний не будет: фильтр включён', 'Касания вернутся', 'Касаний не будет, но Ада будет чаще вставать'], answer: (r) => (r.kettle > 0 ? 1 : r.stuck > r.base.stuck ? 2 : 0) },
      action: { label: 'Проехать 100 раз с α = 16', run: (X) => X.sharp() },
      criteria: [{ label: 'Серия с α = 16 проехала', test: (r) => !!r && r.a === 16 }],
      explain: (r) => `Касаний ${r.kettle} — без фильтра их было ${r.nof.kettle}. В поездке 80 синие точки идут по горизонтали на 60 см/с почти до границы, фильтр командует остановку, а база гасит не больше 30 см/с за шаг — Ада пересекает красную линию касания. Две причины сразу: настоящая база тормозит не мгновенно, а α·Δt = 1,6 больше 1, и даже мгновенная база могла бы проскочить границу за один шаг.` },
    { short: 'Середина', title: 'Где α ни слишком мало, ни слишком велико', text: 'Двигай ползунок α — серия пересчитывается сразу. Найди α, при котором нет касаний, не доехало не больше одной поездки, а доехавшие тратят в среднем меньше 5,5 с.', controls: ['alpha'],
      criteria: [{ label: 'Касаний нет', test: (r, s) => s.ran && s.kettle === 0 }, { label: 'Не доехало не больше 1', test: (r, s) => s.ran && s.stuck <= 1 }, { label: 'В среднем меньше 5,5 с', test: (r, s) => s.ran && s.t < 5.5 }],
      hint: 'Слева на графике — осторожные значения, справа — резкие. Нужное — посередине.',
      explain: (r) => `α = ${fmtA(r.a)}: касаний нет, не доехали ${r.stuck}, в среднем ${fmt(r.t, 2)} с. На этой серии условия выполняются и при α = 2, и при α = 4, и при α = 8, но на других зёрнах при α = 4 и 8 касания иногда возвращаются, а при α от 1 до 2 — ни разу. Поэтому в лабораториях урока α = 2: с запасом до границы, где фильтр начинает опаздывать.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй α и сравнивай поездку 80 на фазовой плоскости. Найди самое большое α, при котором Ада в этой поездке ещё доезжает без касания, и посмотри, насколько близко к красной линии подходят синие точки.', final: true, controls: ['alpha'] },
  ];
  function init() {
    $('#aAlpha').addEventListener('input', (e) => { api.setAlpha(+e.target.value); });
    ctl = mountMissions('#aMis', missions, api, { controls: { alpha: '#wrapAAlpha' }, scene: '#aScene' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   4. Лаборатория: чего фильтр не знает — ошибка камеры, запас, корзина
   ===================================================================== */
const Holes = (() => {
  const E = L82, K = HeroKit;
  const st = { err: 0, margin: 5, box: 'none', sel: 0, log: [], busy: false, prog: 0, ran: false };
  let ctl = null;
  function opts(filter) {
    const o = filter ? { filter: true } : {};
    if (st.err) o.bias = { x: 0, y: -st.err };
    if (filter && st.margin !== E.CFG.MARGIN) o.margin = st.margin;
    if (st.box !== 'none') o.box = true;
    if (filter && st.box === 'known') o.boxKnown = true;
    return o;
  }
  const cfgKey = () => `${st.err}|${st.margin}|${st.box}`;
  const cur = () => (st.ran && Store.ready ? Store.batch(opts(true)) : null);
  const ERRW = { 0: 'точно', 10: 'на 10 см', 20: 'на 20 см' }, BOXW = { none: 'нет', hidden: 'не на карте', known: 'на карте' };
  function pickTrip(b) { let i = b.trips.findIndex((q) => q.outcome === 'kettle' || q.outcome === 'box'); if (i < 0) i = b.trips.findIndex((q) => q.outcome === 'stuck'); return i < 0 ? 0 : i; }
  function drawMap() {
    const cv = $('#hMap'), { c, k, P, KP } = House.base(cv, canvasNarrow(cv, 600)), b = cur(), bx = E.BOX;
    if (st.box !== 'none') { basket(c, k, P, bx.x, bx.y, { label: true, hot: !!b && b.trips[st.sel].outcome === 'box' }); if (st.box === 'known') dashCircle(c, k, bx.x, bx.y, E.RA + E.RB + st.margin, P.cl, 1.8, [6, 4]); }
    if (!b) { K.label(c, k, st.busy ? 'политика учится…' : 'выбери условия и запусти серию', 300, E.H / 2 + 60, { px: 13, weight: 700, color: P.ink, haloColor: P.bg }); return; }
    for (const q of b.trips) { const hit = q.outcome === 'kettle' || q.outcome === 'box'; c.beginPath(); c.arc(q.k.x, q.k.y, hit ? 4.2 : 3, 0, 7); c.fillStyle = hit ? P.bad : P.ink3; c.globalAlpha = hit ? 0.9 : 0.4; c.fill(); }
    c.globalAlpha = 1;
    const q = Store.trip(E.CFG.TRIP0 + st.sel, opts(true)), kh = { x: q.k.x, y: q.k.y - st.err };
    if (st.err) KettleDraw.kettle(c, k, KP, kh, { ghost: true });
    dashCircle(c, k, kh.x, kh.y, E.RA + E.RK + st.margin, P.cl, 1.8, [6, 4]);
    KettleDraw.kettle(c, k, KP, q.k, { hot: q.outcome === 'kettle' });
    House.path(c, k, q, P.e2e, P.cl, P);
    if (st.err && k < 1.8) K.label(c, k, 'так видит камера', kh.x + 62, kh.y - 4, { px: 10.5, weight: 650, color: P.ink3, haloColor: P.bg });
  }
  function drawLog() {
    const tb = $('#hLog tbody'), key = cfgKey();
    $('#hLogEmpty').hidden = st.log.length > 0;
    const html = st.log.map((r) => `<tr class="${r.key === key ? 'cur' : ''}"><td>${ERRW[r.err]}</td><td>${r.margin} см</td><td>${BOXW[r.box]}</td><td class="n${r.hits ? ' bad' : ''}">${r.hits}${r.boxHits ? ` <small>корзина ${r.boxHits}</small>` : ''}</td><td class="n">${r.stuck}</td><td class="n t">${r.t ? fmt(r.t, 2) + ' с' : '—'}</td></tr>`).join('');
    if (tb.dataset.h !== html) { tb.innerHTML = html; tb.dataset.h = html; }
  }
  function render() {
    segSet('#hErr', st.err); segSet('#hMargin', st.margin); segSet('#hBox', st.box);
    drawMap(); drawLog();
    const pg = $('#hProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#hOut'), `Политика учится в браузере: ${Math.round(st.prog * 100)}%.`); return; }
    const b = cur();
    if (!b) { setOut($('#hOut'), 'С этими условиями серию ещё не запускали.'); return; }
    const q = b.trips[st.sel];
    setOut($('#hOut'), `Камера ${st.err ? `ошибается на ${st.err} см` : 'точна'}, запас ${st.margin} см, корзина: ${BOXW[st.box]}. Касаний ${b.kettle + b.box}${b.box ? ` (корзины — ${b.box})` : ''}, не доехали ${b.stuck}. На плане — поездка ${st.sel + 1}: ${OUT_WORD[q.outcome]}.`);
  }
  async function ensure() {
    if (Store.ready) return;
    st.busy = true; st.prog = 0; render();
    try { await Store.policy((p) => { st.prog = p; const pg = $('#hProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#hOut'), `Политика учится в браузере: ${Math.round(p * 100)}%.`); }); }
    finally { st.busy = false; }
  }
  async function run() {
    await ensure(); st.ran = true;
    const b = Store.batch(opts(true)), n = Store.batch(opts(false)), key = cfgKey();
    st.sel = pickTrip(b);
    if (!st.log.some((r) => r.key === key)) st.log.push({ key, err: st.err, margin: st.margin, box: st.box, hits: b.kettle + b.box, boxHits: b.box, stuck: b.stuck, t: b.tMean });
    render(); if (ctl) ctl.update();
    return { err: st.err, margin: st.margin, box: st.box, kettle: b.kettle, boxHits: b.box, hits: b.kettle + b.box, stuck: b.stuck, t: b.tMean, nof: { kettle: n.kettle, box: n.box, hits: n.kettle + n.box }, sel: st.sel + 1 };
  }
  function set(kind, v) { st[kind] = kind === 'box' ? v : +v; st.ran = Store.ready && st.log.some((r) => r.key === cfgKey()); if (st.ran) st.sel = pickTrip(cur()); render(); if (ctl) ctl.update(); }
  function state() { const b = cur(); return b ? { ran: true, err: st.err, margin: st.margin, box: st.box, hits: b.kettle + b.box, stuck: b.stuck, t: b.tMean } : { ran: false, err: st.err, margin: st.margin, box: st.box }; }
  const api = {
    reset() { st.err = 0; st.margin = 5; st.box = 'none'; st.ran = false; render(); }, state, render, st, run,
    async pick(kind, v) { set(kind, v); return run(); },
    setup(err, margin, box) { st.err = err; st.margin = margin; st.box = box; st.ran = Store.ready && st.log.some((r) => r.key === cfgKey()); if (st.ran) st.sel = pickTrip(cur()); render(); },
  };
  const missions = [
    { short: 'Камера', title: 'Камера ошибается на 10 см', text: 'Сбилась калибровка камеры: чайник кажется на 10 см дальше от Ады, чем стоит на самом деле. Ошибку видят и политика, и фильтр — камера у них общая. Запас фильтра — 5 см.', onEnter: (X) => X.setup(10, 5, 'none'),
      bet: { q: 'сколько касаний будет с фильтром?', options: ['Ни одного: фильтр включён', 'Меньше, чем без фильтра, но не ноль', 'Больше, чем без фильтра'], answer: (r) => (r.hits === 0 ? 0 : r.hits < r.nof.hits ? 1 : 2) },
      action: { label: 'Проехать 100 раз', run: (X) => X.run() },
      criteria: [{ label: 'Серия с ошибкой 10 см проехала', test: (r) => !!r && r.err === 10 }],
      explain: (r) => `Касаний ${r.hits} из 100; без фильтра с той же ошибкой — ${r.nof.hits}. Фильтр охраняет круг вокруг места, где чайник видит камера, а настоящий чайник ближе на 10 см — больше запаса. На плане поездка ${r.sel}: Ада держится за синим пунктиром вокруг оценки и задевает настоящий чайник, который стоит ближе.` },
    { short: 'Запас', title: 'Запас против ошибки', text: 'Ошибка та же — 10 см. Выбери запас фильтра, при котором касаний нет, и посмотри, во что он обходится. Каждый выбор сразу запускает серию и добавляет строку в журнал.', controls: ['margin'], onEnter: (X) => X.setup(10, X.st.margin, 'none'),
      criteria: [{ label: 'Камера ошибается на 10 см', test: (r, s) => s.err === 10 && s.box === 'none' }, { label: 'Касаний нет', test: (r, s) => s.ran && s.hits === 0 }],
      hint: 'Запас должен быть не меньше ошибки.',
      explain: (r) => `С запасом ${r.margin} см касаний нет, но не ${plural(r.stuck, 'доехала', 'доехали', 'доехали')} ${nTrips(r.stuck)} из 100 — фильтр держит Аду дальше от чайника и чаще останавливает её. Запас закрывает ошибку, только если он не меньше её: с ошибкой 20 см запаса 15 см уже мало. Чтобы выбрать запас, ошибку восприятия нужно измерить.` },
    { short: 'Корзина', title: 'Корзина, которой нет на карте', text: 'Камера снова точна, запас 5 см. В гостиной, в 50 см слева от маршрута, стоит корзина для белья. В демонстрациях её не было, политика её не видит, фильтр знает только чайник.', onEnter: (X) => X.setup(0, 5, 'hidden'),
      bet: { q: 'в скольких поездках из 100 Ада заденет корзину?', options: ['Ни в одной: фильтр включён', 'Примерно в каждой четвёртой', 'Почти в каждой'], answer: (r) => (r.boxHits <= 2 ? 0 : r.boxHits <= 50 ? 1 : 2) },
      action: { label: 'Проехать 100 раз', run: (X) => X.run() },
      criteria: [{ label: 'Серия с корзиной проехала', test: (r) => !!r && r.box === 'hidden' }],
      explain: (r) => `Ада задела корзину в ${nTripsIn(r.boxHits)} из 100; без фильтра — в ${r.nof.box}, и ещё ${r.nof.kettle} раз задела чайник. Фильтр, который знает только чайник, отводит от него Аду — иногда как раз туда, где стоит корзина. Для предмета, которого нет на карте, гарантии нет никакой.` },
    { short: 'На карте', title: 'Корзина на карте фильтра', text: 'Корзину добавили на карту: фильтр строит для неё вторую функцию барьера и решает задачу с двумя ограничениями. Политика корзину по-прежнему не видит.', onEnter: (X) => X.setup(0, 5, 'known'),
      bet: { q: 'что будет с серией?', options: ['Почти как без корзины: доедут почти все', 'Касаний не будет, но заметная часть поездок не доедет', 'Касания корзины останутся'], answer: (r) => (r.hits > 0 ? 2 : r.stuck >= 5 ? 1 : 0) },
      action: { label: 'Проехать 100 раз', run: (X) => X.run() },
      criteria: [{ label: 'Серия с корзиной на карте проехала', test: (r) => !!r && r.box === 'known' }],
      explain: (r) => `Касаний ${r.hits}, но не ${plural(r.stuck, 'доехала', 'доехали', 'доехали')} ${nTrips(r.stuck)} из 100. Политика по-прежнему ведёт Аду в объезд слева — через место, где стоит корзина. Фильтр не пускает её ни к чайнику, ни к корзине, и Ада стоит между ними до конца 15 секунд. Brunke и соавторы предупреждают ровно об этом: когда фильтр и обученный регулятор развязаны, поведение может стать неоптимальным, потому что регулятор раз за разом пытается нарушить ограничение.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Комбинируй ошибку камеры, запас и корзину. Найди самый маленький запас, который закрывает ошибку 20 см, и посмотри по журналу, сколько недоездов он стоит.', final: true, controls: ['err', 'margin', 'box'] },
  ];
  function init() {
    segBind('#hErr', (v) => api.pick('err', v)); segBind('#hMargin', (v) => api.pick('margin', v)); segBind('#hBox', (v) => api.pick('box', v));
    ctl = mountMissions('#hMis', missions, api, { controls: { err: '#wrapHErr', margin: '#wrapHMargin', box: '#wrapHBox' }, scene: '#hMap' });
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
    { q: 'Политика объезжает чайник в 93 поездках из 100. Если собрать вдвое больше демонстраций, страховка станет не нужна?', o: ['Да: с данными ошибки исчезнут', 'Нет: данные снижают долю ошибок, но не дают гарантии — касания остаются там, где политике трудно выбрать сторону', 'Да, если обучать дольше'], a: 1, e: 'В лаборатории 1 все 7 касаний пришлись на чайники ближе 4,1 см к линии маршрута — туда, где сама задача неоднозначна. Об этом и заблуждение из урока 0.1: сеть, которая объезжает чайник в 99 случаях из 100, в сотом может въехать в него.' },
    { q: 'Что делает фильтр безопасности с опасной командой политики?', o: ['Заменяет её самой безопасной: останавливает Аду', 'Берёт ближайшую к ней скорость, при которой запас тает не быстрее α·h, — меняет только сближение с препятствием', 'Сам прокладывает объезд'], a: 1, e: 'Это задача CBF-QP: наименьшая поправка к команде. Поэтому команда «прямо в чайник» превращается в медленное сближение, а не в объезд: при запасе 15 см и α = 2 фильтр оставил 30 см/с в том же направлении.' },
    { q: 'Чем меньше α, тем безопаснее и лучше?', o: ['Да: осторожный фильтр никогда не мешает', 'Нет: касаний нет, но Ада тормозит в каждом объезде, едет дольше и чаще не доезжает', 'Нет: при маленьком α касания возвращаются'], a: 1, e: 'При α = 0,25 касаний не было, но 5 поездок из 100 не доехали, а доехавшие тратили в среднем 8,32 с вместо 5,39 с при α = 2.' },
    { q: 'Если фильтр всё равно включён, можно взять α побольше, чтобы он реже вмешивался?', o: ['Да: гарантия от α не зависит', 'Нет: резкий фильтр тормозит в последний момент, а настоящая база не останавливается мгновенно; к тому же нужно α·Δt < 1', 'Да, если увеличить запас до 25 см'], a: 1, e: 'При α = 16 касаний было 3: фильтр начинал тормозить при запасе около 4 см, а база гасит не больше 30 см/с за шаг. Hsu и соавторы требуют для такого фильтра α·Δt < 1, а при шаге 0,1 с это α < 10.' },
    { q: 'Фильтр безопасности гарантирует, что Ада ни во что не врежется?', o: ['Да, это и есть гарантия', 'Нет: только в то, что есть в его модели и на его карте, и только если оценка положения не ошибается больше запаса', 'Нет, гарантий у фильтра нет вовсе'], a: 1, e: 'Корзину, которой нет на карте, Ада задела в 27 поездках из 100 — с фильтром даже чаще, чем без него (24). С ошибкой камеры 10 см и запасом 5 см касаний чайника было 5.' },
    { q: 'Если добавить корзину на карту фильтра, задача решена?', o: ['Да: касаний больше нет', 'Нет: касаний нет, но политика по-прежнему тянет Аду через корзину, и часть поездок кончается остановкой', 'Нет: с двумя ограничениями задача фильтра не решается'], a: 1, e: 'С корзиной на карте касаний не было, но 21 поездка из 100 не доехала: Ада стояла между чайником и корзиной. Фильтр не даёт врезаться, но не помогает закончить задачу.' },
    { q: 'Можно взять запас фильтра побольше — хуже не будет?', o: ['Да: больше запас — больше безопасность', 'Нет: запас закрывает ошибку оценки, но фильтр чаще останавливает Аду', 'Нет: большой запас возвращает касания'], a: 1, e: 'С ошибкой 10 см запас 15 см убрал касания, но не доехали 4 поездки; запас 25 см — уже 10. Без ошибки и с запасом 5 см не доехала одна.' },
    { q: 'Щит и фильтр с функцией барьера — одно и то же?', o: ['Да, это два названия одного метода', 'Идея одна — менять команду политики как можно меньше, — но щит работает с дискретными действиями и синтезируется заранее из спецификации, а CBF-фильтр решает маленькую задачу оптимизации для непрерывной команды', 'Нет: щит нужен только во время обучения'], a: 1, e: 'Щит до агента убирает опасные действия, щит после агента заменяет опасное действие безопасным. Alshiekh и соавторы отмечают: если опасные действия при обучении только штрафовать, щит нужно оставлять включённым и после обучения.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('qp', () => { mis.qp = Qp.init(); });
    safe('duel', () => { mis.duel = Duel.init(); });
    safe('alpha', () => { mis.alpha = Alpha.init(); });
    safe('holes', () => { mis.holes = Holes.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['qMis', 'dMis', 'aMis', 'hMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l82 = { mis, Qp, Duel, Alpha, Holes, Store, L82 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
