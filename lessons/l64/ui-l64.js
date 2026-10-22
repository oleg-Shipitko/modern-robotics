/* =====================================================================
   ui-l64.js — урок 6.4 «Локоманипуляция».
   0) анимированная схема `stack`: модель верхнего уровня, контроллер всего тела,
      ПД-регуляторы и приводы с частотами; сначала команды даёт оператор
      и запись идёт в набор данных, потом те же команды даёт модель VLA;
   1) лаборатория «Частоты и роли»: две Ады несут чашку к полке, модель
      верхнего уровня одна и та же; у одной она сама ведёт тело, у другой
      ставит цели контроллеру тела; частота модели, толчки, серии по 20;
   2) лаборатория «Что учить по демонстрациям»: политика по шагам и
      политика по командам на одних и тех же демонстрациях;
   3) интерактив: что модель верхнего уровня задаёт ногам в настоящих системах;
   4) квиз.
   Ада рисуется AdaBody из shared/ada-legs.js (тот же рисунок, что в 6.1–6.3).
   Движок — l64/engine.js (без DOM).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface'), e2eS: HeroKit.css('--e2e-soft'), clS: HeroKit.css('--classic-soft'), hyS: HeroKit.css('--hybrid-soft') });
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
/** Логический размер канваса: широкая раскладка или узкая (телефон), с пропорциями в стиле элемента. */
function fitLayout(cv, wide, narrow) {
  const n = canvasNarrow(cv, wide[0]), L = n ? narrow : wide, ar = `${L[0]} / ${L[1]}`;
  if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
  const { c, k } = HeroKit.fit(cv, L[0], L[1]);
  return { c, k, W: L[0], H: L[1], narrow: n };
}
const sleep0 = () => new Promise((r) => setTimeout(r, 0));
const plural3 = (n, a, b, c) => `${fmt(n)} ${plural(n, a, b, c)}`;

/* =====================================================================
   Фигуры: пол, полка, Ада (AdaBody по позе движка L64.poseOf), чашка, наклон чая, толчок.
   ===================================================================== */
const Fig = (() => {
  const E = L64, K = HeroKit;
  /** Ада по кадру движка; ghost, color — как у AdaBody.side. Возвращает точку кисти с чашкой (метры). */
  function ada(c, X, Y, fr, o) { const P = E.poseOf(fr); AdaBody.side(c, X, Y, P.f, Object.assign({ arms: P.arms }, o || {})); return P; }
  /** Пол: заливка, линия, засечки через 0,5 м, подписи метров. */
  function floor(c, k, X, Y, x0, x1, H, P, o) {
    o = o || {}; const y = Y(0), xa = X(x0), xb = X(x1);
    c.fillStyle = P.grid; c.fillRect(xa, y, xb - xa, H - y);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(xa, y + 0.5); c.lineTo(xb, y + 0.5); c.stroke();
    for (let mx = Math.ceil(x0 * 2) / 2; mx <= x1 + 1e-9; mx += 0.5) {
      const px = X(mx); c.strokeStyle = P.line; c.beginPath(); c.moveTo(px, y); c.lineTo(px, y + (Number.isInteger(mx) ? 8 : 4)); c.stroke();
      if (o.labels && Number.isInteger(mx)) K.label(c, k, `${mx} м`, px, y + 18 * Math.max(1, k * 0.85), { px: 10, color: P.ink3, halo: false });
    }
  }
  /** Полка: две доски на стойках; на верхней доске — место для чашки (пунктир). */
  function shelf(c, X, Y, xFront, P, placed) {
    const xb = xFront + E.CFG.SHELF_D, top = E.CFG.SHELF, mid = top * 0.5;
    c.fillStyle = P.surf; c.strokeStyle = P.ink3; c.lineWidth = 1.6;
    for (const xs of [xFront + 0.015, xb - 0.015]) { c.beginPath(); c.moveTo(X(xs), Y(0)); c.lineTo(X(xs), Y(top + 0.05)); c.stroke(); }
    for (const yb of [mid, top]) { c.beginPath(); c.roundRect(X(xFront), Y(yb), X(xb) - X(xFront), Math.max(3, (X(1) - X(0)) * 0.03), 2); c.fill(); c.stroke(); }
    const slot = xFront + (E.CFG.SLOT - E.CFG.SHELF_X);
    if (!placed) { c.setLineDash([3, 3]); c.strokeStyle = P.hy; c.lineWidth = 1.4; const m = X(1) - X(0), w = 0.09 * m, h = 0.10 * m; c.strokeRect(X(slot) - w / 2, Y(top) - h, w, h); c.setLineDash([]); }
  }
  /** Чашка у кисти (крупнее масштаба, чтобы было видно): стенки, ручка и поверхность чая с наклоном phi; пролитая — с каплями. */
  function cup(c, X, Y, hx, hz, phi, spilled, P, on) {
    const m = X(1) - X(0), w = Math.max(9, 0.11 * m), h = Math.max(10, 0.12 * m), cx = X(hx) + w * 0.42, cy = Y(hz) - h * 0.15;
    c.save(); c.translate(cx, cy);
    c.fillStyle = P.surf; c.strokeStyle = P.ink2; c.lineWidth = 1.6;
    c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 2.5); c.fill(); c.stroke();
    c.beginPath(); c.arc(-w / 2, 0, h * 0.24, Math.PI / 2, 1.5 * Math.PI); c.stroke();
    const a = spilled ? 0.35 : Math.max(-0.5, Math.min(0.5, phi)), lv = -h * 0.18, tea = HeroKit.css('--warning');
    c.save(); c.beginPath(); c.rect(-w / 2 + 1.5, -h / 2 + 1, w - 3, h - 2.5); c.clip();
    c.fillStyle = Anim.kit.alpha(tea, 0.65); c.beginPath(); c.moveTo(-w, lv + Math.tan(a) * w); c.lineTo(w, lv - Math.tan(a) * w); c.lineTo(w, h); c.lineTo(-w, h); c.closePath(); c.fill(); c.restore();
    if (spilled) { c.fillStyle = Anim.kit.alpha(tea, 0.8); for (const [dx, dy, r] of [[w * 0.7, h * 0.3, 2], [w * 0.95, h * 0.85, 1.6], [w * 0.6, h * 1.25, 1.4]]) { c.beginPath(); c.arc(dx, dy, r, 0, 7); c.fill(); } }
    c.restore();
  }
  /** Наклон чая крупно: разрез чашки, поверхность под углом phi и пунктир предела 20,6°. */
  function gauge(c, k, x, y, r, phi, spilled, P, narrow) {
    const lim = E.SPILL, tea = HeroKit.css('--warning');
    c.save(); c.fillStyle = P.surf; c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.roundRect(x - r - 6, y - r - 6, 2 * r + 12, 2 * r + 12 + 16 * Math.max(1, k), 8); c.fill(); c.stroke();
    c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - r * 0.8, y - r * 0.85); c.lineTo(x - r * 0.8, y + r * 0.8); c.lineTo(x + r * 0.8, y + r * 0.8); c.lineTo(x + r * 0.8, y - r * 0.85); c.stroke();
    const a = spilled ? lim * 1.3 : Math.max(-0.6, Math.min(0.6, phi)), L = r * 0.78;
    c.save(); c.beginPath(); c.rect(x - r * 0.8 + 1, y - r, r * 1.6 - 2, r * 1.8 - 1); c.clip();
    c.fillStyle = Anim.kit.alpha(tea, 0.55); c.beginPath(); c.moveTo(x - L, y + Math.tan(a) * L); c.lineTo(x + L, y - Math.tan(a) * L); c.lineTo(x + L, y + r); c.lineTo(x - L, y + r); c.closePath(); c.fill(); c.restore();
    c.setLineDash([3, 3]); c.strokeStyle = P.bad; c.lineWidth = 1.2;
    for (const s of [1, -1]) { c.beginPath(); c.moveTo(x - L * Math.cos(lim), y + s * L * Math.sin(lim)); c.lineTo(x + L * Math.cos(lim), y - s * L * Math.sin(lim)); c.stroke(); }
    c.setLineDash([]); c.restore();
    const deg = Math.abs(a) * 180 / Math.PI;
    K.label(c, k, spilled ? 'чай пролит' : `чай ${fmt(Math.min(deg, 99), 0)}°`, x, y + r + 4 + 7 * Math.max(1, k), { px: 10, weight: 700, color: spilled ? P.bad : deg > 15 ? P.warn : P.ink2, halo: false });
  }
  /** Толчок: стрелка к корпусу на 0,5 с после начала толчка (видно и при воспроизведении в реальном времени). */
  function push(c, k, X, Y, fr, pushes, P) {
    let on = null;
    for (const p of pushes) {
      const dt = fr.t - p.t; if (dt < 0 || dt > 0.5) continue;
      const al = 1 - dt / 0.5, s = p.dv > 0 ? 1 : -1, yb = Y(E.B.PZ + 0.25), xb = X(fr.x - s * 0.13), xa = X(fr.x - s * 0.36);
      c.save(); c.globalAlpha = 0.35 + 0.65 * al; Anim.kit.arrow(c, xa, yb, xb, yb, P.bad, 2.6, 8); c.restore();
      on = p;
    }
    return on;
  }
  /** Ада с падением: после падения тело поворачивается вокруг опорного голеностопа (вперёд или назад). */
  function adaRun(c, X, Y, ep, fr, o, after, clip) {
    let th = 0; const dir = ep.fellDir || 1, ax = (fr.st === 1 ? fr.f1 : fr.f0) + (dir > 0 ? E.B.FT : -E.B.FH);
    if (ep.fell != null && fr.t > ep.fell) { const u = Math.min(1, (fr.t - ep.fell) / 0.7); th = dir * 1.3 * u * u * (3 - 2 * u); }
    c.save();
    if (th) { if (clip) { c.beginPath(); c.rect(clip[0], clip[1], clip[2], Y(0) - clip[1]); c.clip(); } c.translate(X(ax), Y(0)); c.rotate(th); c.translate(-X(ax), -Y(0)); }
    const P = ada(c, X, Y, fr, o);
    if (after) after(P, th);
    c.restore();
    return { P, th, ax };
  }
  return { ada, adaRun, floor, shelf, cup, gauge, push };
})();

/* =====================================================================
   0. Анимированная схема `stack`: кто что делает и как часто.
   Цвета: фиолетовый — модель верхнего уровня и оператор (команды); оранжевый — контроллер всего тела; синий — ПД-регуляторы, датчики и запись.
   Цикл 12 с: 0–6 с — телеоперация (команды даёт оператор, запись идёт в набор данных), 6–12 с — работа сама (те же команды даёт модель VLA,
   обученная на записи). Ритм условный: модель верхнего уровня мигает реже всех, контроллер тела в пять раз чаще, ПД-регуляторы — непрерывно.
   Подписи не мельче 10 px: широкая раскладка — от 700 px ширины карточки, узкая — до 360 px.
   ===================================================================== */
(() => {
  const T = 12;
  function box(c, k, A, P, b, title, sub, col, hot, o) {
    o = o || {};
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.15 : 0.04), hot ? col : A.alpha(col, 0.45), hot ? 2.2 : 1.2);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + (o.ty || 16), { px: 12, weight: 700, color: hot ? col : A.alpha(col, 0.55), halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + (o.sy || 33), { px: 10.5, weight: 600, color: hot ? P.ink2 : P.ink3, halo: false });
  }
  const R_ = (b) => [b[0] + b[2], b[1] + b[3] / 2], L_ = (b) => [b[0], b[1] + b[3] / 2], B_ = (b) => [b[0] + b[2] / 2, b[1] + b[3]], T_ = (b) => [b[0] + b[2] / 2, b[1]];
  /** Мигание: 1 сразу после такта с периодом per, потом гаснет. */
  const blink = (t, per, ph) => { const u = (((t + (ph || 0)) % per) + per) % per; return Math.max(0, 1 - u / Math.min(0.35, per * 0.6)); };
  /** Ада в прямоугольнике: шаг на месте, кисть впереди (рисунок AdaBody, кадр — как в движке). */
  function adaIn(c, r, t, m, col) {
    const s = Math.sin(t * 2 * Math.PI / 1.6), fr = { t: 0, x: 0, v: 0.3, f0: 0.09 * s, f1: -0.09 * s, st: s > 0 ? 1 : 0, ds: false, lift: 0.04 * Math.abs(Math.cos(t * 2 * Math.PI / 1.6)), hx: 0.2, hz: 0.86, phi: 0 };
    const x0 = r[0] + r[2] / 2, y0 = r[1] + r[3] - 8, X = (x) => x0 + x * m, Y = (y) => y0 - y * m, P = pal();
    c.save(); c.beginPath(); c.rect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); c.clip();
    c.strokeStyle = P.line; c.lineWidth = 1.2; c.beginPath(); c.moveTo(r[0] + 8, y0 + 0.5); c.lineTo(r[0] + r[2] - 8, y0 + 0.5); c.stroke();
    const Q = Fig.ada(c, X, Y, fr, { color: col });
    Fig.cup(c, X, Y, Q.hand[0], Q.hand[1], 0.06 * Math.sin(t * 3), false, P);
    c.restore();
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, auto = u >= 6, B = g.b, n = g.narrow, up = auto ? P.spr : P.spr;
    const pUp = 1.2, pWbc = pUp / 5, bu = blink(u, pUp), bw = blink(u, pWbc, 0.05);
    const ar = (a, b2, col, lw, hd) => A.arrow(c, a[0], a[1], b2[0], b2[1], col, lw || 1.8, hd || 7);
    const lab = (txt, x, y, col, al, w, px) => A.lab(c, k, txt, x, y, { px: px || 10.5, weight: w || 650, color: col, halo: false, align: al || 'center' });
    // модель верхнего уровня: оператор или VLA
    box(c, k, A, P, B.op, n ? 'оператор' : 'оператор в VR-шлеме', n ? 'движения тела' : 'движения → ретаргетинг', P.spr, !auto);
    box(c, k, A, P, B.vla, 'модель VLA', auto ? (n ? 'камеры, просьба' : 'камеры и просьба, 7–25 Гц') : (n ? 'учится по записи' : 'учится по этой записи'), P.spr, auto);
    const src = auto ? B.vla : B.op;
    A.circle(c, src[0] + src[2] - 12, src[1] + 12, 4.5, A.alpha(P.spr, 0.25 + 0.75 * bu), null);
    // команда
    box(c, k, A, P, B.cmd, n ? 'команда' : 'команда контроллеру', null, P.spr, true, { ty: 16 });
    lab(g.cmdRate(auto), B.cmd[0] + B.cmd[2] / 2, B.cmd[1] + B.cmd[3] - 12, P.ink3, 'center', 600);
    g.chips.forEach((tx, i) => { const y = B.cmd[1] + 38 + i * g.chipDy; A.rect(c, B.cmd[0] + 12, y - 6, 12, 12, 3, A.alpha(P.spr, 0.3 + 0.7 * bu), P.spr, 1.2); lab(tx, B.cmd[0] + 32, y, P.ink, 'left', 600); });
    // контроллер тела и ПД
    box(c, k, A, P, B.wbc, n ? 'контроллер тела' : 'контроллер всего тела', n ? '50 Гц, обучен в симуляторе' : '50 Гц, обучен в симуляторе', P.mot, true);
    if (!n) { lab('держит равновесие и ставит стопы', B.wbc[0] + B.wbc[2] / 2, B.wbc[1] + 56, P.ink2, 'center', 600); lab('ведёт кисти к цели', B.wbc[0] + B.wbc[2] / 2, B.wbc[1] + 74, P.ink2, 'center', 600); }
    A.circle(c, B.wbc[0] + B.wbc[2] - 12, B.wbc[1] + 12, 4.5, A.alpha(P.mot, 0.25 + 0.75 * bw), null);
    box(c, k, A, P, B.pd, n ? 'ПД-регуляторы' : 'ПД-регуляторы суставов', '1000 Гц', P.out, true);
    // Ада
    A.rect(c, B.ada[0], B.ada[1], B.ada[2], B.ada[3], 9, A.alpha(P.out, 0.04), A.alpha(P.out, 0.5), 1.2);
    adaIn(c, [B.ada[0], B.ada[1] + 18, B.ada[2], B.ada[3] - 18], u, g.m, P.mot);
    lab('Ада', B.ada[0] + B.ada[2] / 2, B.ada[1] + 13, P.out, 'center', 700, 11.5);
    // запись
    box(c, k, A, P, B.data, n ? 'запись' : 'запись демонстраций', n ? 'кадры и команды' : 'кадры камер + команды', P.out, !auto);
    const nBlk = auto ? g.blk : Math.min(g.blk, Math.floor(u / 6 * g.blk) + 1);
    for (let i = 0; i < nBlk; i++) { const bx = B.data[0] + 12 + i * ((B.data[2] - 24) / g.blk), by = B.data[1] + B.data[3] - 16; c.fillStyle = A.alpha(P.out, auto ? 0.35 : 0.7); c.fillRect(bx, by, (B.data[2] - 24) / g.blk - 3, 9); }
    // стрелки
    const cmdIn = L_(B.cmd);
    if (!n) {
      ar([R_(B.op)[0] + 2, R_(B.op)[1]], [cmdIn[0] - 2, B.cmd[1] + 26], auto ? A.alpha(P.spr, 0.25) : P.spr, auto ? 1.2 : 2);
      ar([R_(B.vla)[0] + 2, R_(B.vla)[1]], [cmdIn[0] - 2, B.cmd[1] + B.cmd[3] - 22], auto ? P.spr : A.alpha(P.spr, 0.25), auto ? 2 : 1.2);
      ar([R_(B.cmd)[0] + 2, R_(B.cmd)[1]], [L_(B.wbc)[0] - 2, L_(B.wbc)[1]], P.spr, 2.2);
      ar([B_(B.wbc)[0], B_(B.wbc)[1] + 2], [T_(B.pd)[0], T_(B.pd)[1] - 2], P.mot, 2.2); lab('целевые углы', B_(B.wbc)[0] + 8, (B_(B.wbc)[1] + T_(B.pd)[1]) / 2, P.mot, 'left');
      ar([L_(B.pd)[0] - 2, L_(B.pd)[1]], [R_(B.ada)[0] + 2, L_(B.pd)[1]], P.out, 1.8); lab('моменты', (L_(B.pd)[0] + R_(B.ada)[0]) / 2, L_(B.pd)[1] - 11, P.out);
      const ys = B.ada[1] + B.ada[3] - 22, xw = B.wbc[0] + 30; A.line(c, [[R_(B.ada)[0] + 2, ys], [xw, ys], [xw, B_(B.pd)[1] + 14]], A.alpha(P.out, 0.8), 1.4, [4, 3]); A.line(c, [[xw, B.pd[1] - 4], [xw, B_(B.wbc)[1] + 8]], A.alpha(P.out, 0.8), 1.4, [4, 3]); A.arrow(c, xw, B_(B.wbc)[1] + 9, xw, B_(B.wbc)[1] + 2, P.out, 1.4, 6);
      lab('датчики тела', (R_(B.ada)[0] + xw) / 2 + 4, ys + 12, P.out);
      if (!auto) { A.line(c, [[B.cmd[0] + 40, B_(B.cmd)[1] + 2], [B.cmd[0] + 40, B.data[1] + 12], [R_(B.data)[0] + 2, B.data[1] + 12]], P.out, 1.5, [5, 4]); A.arrow(c, R_(B.data)[0] + 8, B.data[1] + 12, R_(B.data)[0] + 2, B.data[1] + 12, P.out, 1.5, 6); lab('в запись', B.cmd[0] + 48, (B_(B.cmd)[1] + B.data[1]) / 2 + 2, P.out, 'left'); }
      else { A.line(c, [[T_(B.data)[0], B.data[1] - 2], [T_(B.data)[0], B_(B.vla)[1] + 8]], P.out, 1.5, [5, 4]); A.arrow(c, T_(B.data)[0], B_(B.vla)[1] + 9, T_(B.data)[0], B_(B.vla)[1] + 2, P.out, 1.5, 6); lab('обучение', T_(B.data)[0] + 8, (B.data[1] + B_(B.vla)[1]) / 2, P.out, 'left'); }
    } else {
      const xc = B.cmd[0] + B.cmd[2] / 2;
      ar([B_(B.op)[0], B_(B.op)[1] + 2], [B_(B.op)[0], B.cmd[1] - 2], auto ? A.alpha(P.spr, 0.25) : P.spr, auto ? 1.2 : 2);
      ar([B_(B.vla)[0], B_(B.vla)[1] + 2], [B_(B.vla)[0], B.cmd[1] - 2], auto ? P.spr : A.alpha(P.spr, 0.25), auto ? 2 : 1.2);
      ar([xc, B_(B.cmd)[1] + 2], [xc, B.wbc[1] - 2], P.spr, 2.2);
      ar([B.pd[0] + B.pd[2] / 2, B_(B.wbc)[1] + 2], [B.pd[0] + B.pd[2] / 2, B.pd[1] - 2], P.mot, 2.2); lab('целевые углы', B.pd[0] + B.pd[2] / 2 + 8, (B_(B.wbc)[1] + B.pd[1]) / 2, P.mot, 'left');
      ar([R_(B.pd)[0] + 2, R_(B.pd)[1]], [B.ada[0] - 2, R_(B.pd)[1]], P.out, 1.8);
      if (!auto) { const xd = B.data[0] + B.data[2] / 2; A.line(c, [[B.pd[0] + 18, B_(B.pd)[1] + 2], [B.pd[0] + 18, B.data[1] - 4]], A.alpha(P.out, 0.9), 1.4, [5, 4]); A.arrow(c, B.pd[0] + 18, B.data[1] - 3, B.pd[0] + 18, B.data[1] - 1, P.out, 1.4, 6); void xd; }
    }
    // частоты: такты модели верхнего уровня, контроллера тела и ПД
    const S = g.strip, x0 = S[0] + S[4], x1 = S[0] + S[2] - 8, rows = [[n ? 'верхний уровень' : 'модель верхнего уровня', P.spr, pUp], [n ? 'контроллер тела' : 'контроллер тела, нижний уровень', P.mot, pWbc], ['ПД-регуляторы', P.out, 0]];
    rows.forEach(([name, col, per], i) => {
      const y = S[1] + 10 + i * S[3]; lab(name, S[0], y, col, 'left', 650);
      c.strokeStyle = A.alpha(col, 0.35); c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y + 0.5); c.lineTo(x1, y + 0.5); c.stroke();
      const span = 3.0, tt = u;
      if (per) { for (let k2 = Math.ceil((tt - span) / per); k2 * per <= tt; k2++) { const x = x1 - (tt - k2 * per) / span * (x1 - x0); if (x < x0) continue; c.fillStyle = col; c.fillRect(x - 1.2, y - 6, 2.4, 12); } }
      else { c.strokeStyle = A.alpha(col, 0.85); c.lineWidth = 6; c.setLineDash([1.5, 2]); c.lineDashOffset = -tt * 40; c.beginPath(); c.moveTo(x0, y + 0.5); c.lineTo(x1, y + 0.5); c.stroke(); c.setLineDash([]); }
    });
    const cc = auto ? g.capAuto : g.capTele;
    A.lab(c, k, cc[0], g.cap[0], g.cap[1], { px: 12, weight: 700, color: P.ink, halo: false, align: 'left' });
    A.lab(c, k, cc[1], g.cap[0], g.cap[1] + 18, { px: 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  const WIDE = { narrow: false, m: 56, blk: 8, chipDy: 19, chips: ['скорость и поворот таза', 'высота корпуса', 'положения кистей'],
    b: { op: [16, 16, 212, 56], vla: [16, 86, 212, 56], cmd: [262, 30, 196, 104], wbc: [494, 30, 210, 104], pd: [494, 196, 210, 56], ada: [262, 160, 196, 140], data: [16, 186, 212, 84] },
    strip: [16, 318, 688, 20, 182], cmdRate: (a) => (a ? 'обновляется 7–25 раз в секунду' : 'идёт вслед за оператором'),
    capTele: ['Телеоперация: команды даёт оператор, а равновесие держит контроллер тела.', 'Кадры камер и команды идут в запись демонстраций.'],
    capAuto: ['Работа сама: модель VLA, обученная на записи, выдаёт те же команды,', 'а контроллер тела исполняет их так же, как при телеоперации.'], cap: [16, 386] };
  const NARROW = { narrow: true, m: 50, blk: 6, chipDy: 17, chips: ['скорость, поворот таза', 'высота корпуса', 'положения кистей'],
    b: { op: [12, 10, 162, 52], vla: [186, 10, 162, 52], cmd: [12, 94, 336, 106], wbc: [12, 226, 336, 54], pd: [12, 306, 162, 54], ada: [186, 300, 162, 122], data: [12, 372, 162, 66] },
    strip: [12, 458, 336, 20, 112], cmdRate: (a) => (a ? 'обновляется 7–25 раз в секунду' : 'идёт вслед за оператором'),
    capTele: ['Телеоперация: команды даёт оператор,', 'запись идёт в набор демонстраций'], capAuto: ['Сама: те же команды даёт модель VLA,', 'обученная на записи'], cap: [12, 540] };
  Anim.add('stack', {
    W: 720, H: 420, start: 1.0, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 580, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   Сцена с двумя Адами (лаборатории 1 и 2): вид сбоку, весь путь от старта до полки. Широко — две половины рядом (640 × 300),
   на телефоне — одна над другой (360 × 600). Ада идёт вперёд; пол с засечками через 0,5 м; наклон чая — в рамке у края половины.
   ===================================================================== */
const Duo = (() => {
  const E = L64, K = HeroKit;
  const OUT = { placed: 'поставила чашку', fell: 'упала', hit: 'упёрлась в полку', spilled: 'пролила чай', miss: 'не встала у полки' };
  /** Состояние на момент t: кадр прогона (последний после конца) и итог, если он уже наступил. */
  function at(ep, t) { const fr = ep.frames, i = Math.min(fr.length - 1, Math.max(0, Math.round(t / E.CFG.CDT))); return fr[i]; }
  function status(ep, t, narrow) {
    const done = (x) => x != null && t >= x - 1e-9;
    if (done(ep.fell)) return [`${OUT.fell} на ${fmt(ep.fell, 1)} с`, 'bad'];
    if (done(ep.hit)) return [`${OUT.hit} на ${fmt(ep.hit, 1)} с`, 'bad'];
    if (done(ep.spilled)) return [`${OUT.spilled} на ${fmt(ep.spilled, 1)} с`, 'warn'];
    if (done(ep.placed)) return [narrow ? `поставила за ${fmt(ep.placed, 1)} с` : `поставила чашку за ${fmt(ep.placed, 1)} с`, 'good'];
    const fr = at(ep, t), last = ep.frames[ep.frames.length - 1];
    if (t > last.t + 0.05 && ep.out === 'miss') return [OUT.miss, 'bad'];
    return [`идёт ${fmt(Math.max(0, fr.v), 2)} м/с`, 'ink2'];
  }
  /** Половина сцены: X0, Y0 — угол, Wh × Hh — размер; ep — прогон с кадрами; o: { title, sub, color }. */
  function half(c, k, P, X0, Y0, Wh, Hh, ep, t, o) {
    const M = o.narrow ? 108 : 100, FLOOR = Y0 + Hh - 58, X = (x) => X0 + 14 + (x + 0.15) * M, Y = (y) => FLOOR - y * M;
    c.save(); c.beginPath(); c.rect(X0, Y0, Wh, Hh); c.clip();
    Fig.floor(c, k, X, Y, -0.1, 2.7, Y0 + Hh, P, { labels: true });
    const xStop = ep && ep.xStop != null ? ep.xStop : E.CFG.XSTOP, front = xStop + E.CFG.SHELF_X - E.CFG.XSTOP;
    // место, где надо встать: отметка на полу
    c.strokeStyle = P.hy; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(xStop), Y(0) - 2); c.lineTo(X(xStop), Y(0) - 18); c.stroke(); c.setLineDash([]);
    if (ep) {
      const fallen = ep.fell != null && t > ep.fell, fr0 = at(ep, t), fr = fallen ? Object.assign({}, at(ep, ep.fell), { t }) : fr0, placedNow = ep.placed != null && t >= ep.placed;
      Fig.shelf(c, X, Y, front, P, placedNow);
      const pushOn = fallen ? null : Fig.push(c, k, X, Y, fr, ep.pushes || [], P);
      const spilled = ep.spilled != null && t >= ep.spilled;
      if (placedNow) Fig.cup(c, X, Y, xStop + E.CFG.SLOT - E.CFG.XSTOP - 0.04, E.CFG.SHELF + 0.06, 0, false, P);
      const R = Fig.adaRun(c, X, Y, ep, fr, { color: o.color }, (Q, th) => { if (!placedNow) Fig.cup(c, X, Y, Q.hand[0], Q.hand[1], fr.phi, spilled || !!th, P); }, [X0, Y0, Wh, Hh]);
      if (ep.fell != null && t >= ep.fell + 0.5) K.cross(c, X(R.ax + (ep.fellDir || 1) * 0.75), Y(0.42), 8, P.bad, 3);
      if (pushOn) K.label(c, k, `толчок ${pushOn.dv > 0 ? 'в спину' : 'в грудь'}, ${fmt(Math.abs(pushOn.dv) * E.B.MASS / 0.1, 0)} Н`, X0 + 8, Y0 + 42 + 9 * Math.max(1, k), { px: 10.5, weight: 700, color: P.bad, align: 'left', haloColor: P.bg });
      Fig.gauge(c, k, X0 + Wh - 34, Y0 + 44, 17, fr.phi, spilled, P, o.narrow);
      const [txt, col] = status(ep, t, o.narrow);
      K.label(c, k, txt, X0 + Wh / 2, FLOOR + 38 * Math.max(1, k * 0.9), { px: 11, weight: 700, color: P[col] || P.ink2, haloColor: P.bg });
    } else {
      Fig.shelf(c, X, Y, front, P, false);
      K.label(c, k, o.empty || 'нажми кнопку миссии', X0 + Wh / 2, Y0 + Hh * 0.38, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
    }
    c.restore();
    K.label(c, k, o.title, X0 + 8, Y0 + 6 + 9 * Math.max(1, k), { px: 12, weight: 700, color: o.color, align: 'left', haloColor: P.bg });
    if (o.sub) K.label(c, k, o.sub, X0 + 8, Y0 + 24 + 9 * Math.max(1, k), { px: 10.5, weight: 650, color: P.ink2, align: 'left', haloColor: P.bg });
  }
  /** Две половины: pa, pb — прогоны; oa, ob — подписи. */
  function draw(cv, pa, pb, t, oa, ob) {
    const L = fitLayout(cv, [640, 300], [360, 600]), { c, k, narrow } = L, P = pal(), W = L.W, H = L.H;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    if (!narrow) { half(c, k, P, 0, 0, W / 2, H, pa, t, Object.assign({ narrow }, oa)); half(c, k, P, W / 2, 0, W / 2, H, pb, t, Object.assign({ narrow }, ob)); c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 + 0.5, 0); c.lineTo(W / 2 + 0.5, H); c.stroke(); }
    else { half(c, k, P, 0, 0, W, H / 2, pa, t, Object.assign({ narrow }, oa)); half(c, k, P, 0, H / 2, W, H / 2, pb, t, Object.assign({ narrow }, ob)); c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, H / 2 + 0.5); c.lineTo(W, H / 2 + 0.5); c.stroke(); }
    return L;
  }
  /** Длительность воспроизведения пары прогонов. */
  const span = (a, b) => Math.max(a ? a.frames[a.frames.length - 1].t : 0, b ? b.frames[b.frames.length - 1].t : 0);
  return { draw, span, status, at, OUT };
})();

/* =====================================================================
   1. Лаборатория «Частоты и роли»: одна модель верхнего уровня, две Ады. Модель видит полку и решает, с какой скоростью идти, f раз в секунду,
   ответ приходит через 1/f с. Ада 'direct' получает от неё готовый план всего тела, Ада 'wbc' — только скорость, а тело ведёт контроллер.
   ===================================================================== */
const Split = (() => {
  const E = L64, K = HeroKit, FREQS = [2, 5, 10, 25, 50], N = 20;
  const st = { f: 5, push: 'random', dv: 0.6, seed: 1, t: 0, hold: false, shown: false, cache: {}, series: {}, busy: false, prog: 0, pair: null };
  const ONE = { t: 2.1 };
  let ctl = null;
  const opt = () => (st.push === 'random' ? {} : st.push === 'one' ? { pushes: 'none', push: { t: ONE.t, dv: st.dv } } : { pushes: 'none' });
  const key = (mode) => [mode, st.f, st.push, st.push === 'one' ? st.dv : '', st.seed].join('|');
  function runPair() {
    const d = st.cache[key('direct')] || (st.cache[key('direct')] = E.episode('direct', st.f, st.seed, Object.assign({ keep: true }, opt())));
    const w = st.cache[key('wbc')] || (st.cache[key('wbc')] = E.episode('wbc', st.f, st.seed, Object.assign({ keep: true }, opt())));
    st.pair = { d, w }; st.shown = true; st.t = 0; return st.pair;
  }
  const sub = (mode) => (mode === 'direct' ? `план всего тела ${fmt(st.f)} раз в секунду` : `цели ${fmt(st.f)} раз в секунду, тело 50`);
  function drawScene() {
    const p = st.shown ? st.pair : null;
    return Duo.draw($('#sCv'), p && p.d, p && p.w, st.t,
      { title: 'модель ведёт тело сама', sub: sub('direct'), color: HeroKit.css('--hybrid'), empty: 'нажми кнопку миссии' },
      { title: 'модель + контроллер тела', sub: sub('wbc'), color: HeroKit.css('--e2e'), empty: 'нажми кнопку миссии' });
  }
  /** Сводка серий: для каждой частоты два столбика по 20 прогонов (план всего тела и цели + контроллер), сегменты — исходы. */
  const SEG = [['placed', 'good', 'поставила'], ['spilled', 'warn', 'пролила'], ['hit', 'ink3', 'упёрлась в полку'], ['fell', 'bad', 'упала'], ['miss', 'line', 'не встала']];
  function drawChart() {
    const cv = $('#sChart'), L = fitLayout(cv, [640, 220], [360, 270]), { c, k, narrow } = L, W = L.W, H = L.H, P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = narrow ? 40 : 52, x1 = W - 12, y0 = narrow ? 66 : 44, y1 = H - 34, gw = (x1 - x0) / FREQS.length, bw = Math.min(30, gw * 0.3);
    // легенда исходов
    let lx = x0, ly = narrow ? 14 : 16;
    SEG.forEach(([id, col, name]) => { if (id === 'miss') return; const w = 10 + 6 + (narrow ? 6.2 : 6.6) * name.length; if (lx + w > x1) { lx = x0; ly += 16; } c.fillStyle = P[col]; c.fillRect(lx, ly - 5, 10, 10); K.label(c, k, name, lx + 14, ly, { px: 10, color: P.ink2, align: 'left', halo: false }); lx += w + 10; });
    // оси
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke();
    for (const v of [0, 10, 20]) { const y = y1 - (y1 - y0) * v / N; c.strokeStyle = P.grid; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); K.label(c, k, fmt(v), x0 - 6, y, { px: 10, color: P.ink3, align: 'right', halo: false }); }
    K.label(c, k, narrow ? 'из 20' : 'прогонов из 20', x0 - 6, y0 - 12, { px: 10, color: P.ink3, align: narrow ? 'right' : 'left', halo: false });
    let any = false;
    FREQS.forEach((f, i) => {
      const cx = x0 + gw * (i + 0.5);
      K.label(c, k, `${f} Гц`, cx, y1 + 14, { px: 10.5, weight: f === st.f ? 750 : 600, color: f === st.f ? P.ink : P.ink3, halo: false });
      ['direct', 'wbc'].forEach((mode, j) => {
        const r = st.series[f + '|' + mode], bx = cx + (j ? 3 : -3 - bw), col = mode === 'direct' ? P.hy : P.e2e;
        if (!r) { c.strokeStyle = Anim.kit.alpha(col, 0.35); c.setLineDash([3, 3]); c.strokeRect(bx, y0, bw, y1 - y0); c.setLineDash([]); return; }
        any = true; let yy = y1;
        for (const [id, cc] of SEG) { const n = r[id]; if (!n) continue; const h = (y1 - y0) * n / N; c.fillStyle = cc === 'line' ? P.line : P[cc]; c.fillRect(bx, yy - h, bw, h); yy -= h; }
        c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(bx, y0 + (y1 - y0) * (1 - (N - 0) / N), bw, y1 - y0);
      });
    });
    if (!any) K.label(c, k, narrow ? 'нажми «Прогнать по 20 раз»' : 'Нажми «Прогнать по 20 раз»: здесь появятся итоги для выбранной частоты', (x0 + x1) / 2, (y0 + y1) / 2, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    return L;
  }
  const outTxt = (ep) => (ep.out === 'placed' ? `поставила чашку за ${fmt(ep.placed, 1)} с` : ep.out === 'fell' ? `упала на ${fmt(ep.fell, 1)} с` + (ep.spilled != null && ep.spilled < ep.fell ? `, а чай пролила ещё на ${fmt(ep.spilled, 1)} с` : '') : ep.out === 'hit' ? `упёрлась в полку на ${fmt(ep.hit, 1)} с` : ep.out === 'spilled' ? `пролила чай на ${fmt(ep.spilled, 1)} с` : 'не встала у полки');
  function readout() {
    const pg = $('#sProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#sOut'), `Прогоны на ${fmt(st.f)} Гц: ${fmt(Math.round(st.prog * 100))}%`); return; }
    if (!st.shown) { setOut($('#sOut'), 'Нажми кнопку миссии: обе Ады пойдут к полке с одной и той же моделью верхнего уровня.'); return; }
    const { d, w } = st.pair, pt = st.push === 'random' ? `толчков по пути: ${fmt(d.pushes.length)}` : st.push === 'one' ? `один толчок на ${fmt(ONE.t, 1)} с: ${fmt(st.dv, 2)} м/с, ${fmt(st.dv * E.B.MASS / 0.1, 0)} Н` : 'без толчков';
    setOut($('#sOut'), `Модель верхнего уровня ${fmt(st.f)} раз в секунду, ${pt}. <b>Ада с планом всего тела</b> ${outTxt(d)}. <b>Ада с контроллером тела</b> ${outTxt(w)}.`);
  }
  function controls() {
    segSet('#sFreq', st.f); segSet('#sPush', st.push);
    const dv = $('#sDv'); dv.value = Math.round(st.dv * 100); syncRange(dv, `${fmt(st.dv, 2)} м/с`);
    $('#wrapSDv').classList.toggle('dim', st.push !== 'one');
  }
  function render() { drawScene(); drawChart(); controls(); readout(); }
  async function seriesAt(f) {
    const keyS = (m) => f + '|' + m; if (st.series[keyS('direct')] && st.series[keyS('wbc')]) return { d: st.series[keyS('direct')], w: st.series[keyS('wbc')] };
    st.busy = true; st.prog = 0; render();
    const gen = (function* () { const a = yield* E.series('direct', f, N, 1); const b = yield* E.series('wbc', f, N, 1); return { a, b }; })();
    let n = 0; const R = await runChunked(gen, () => { n++; st.prog = n / (2 * N); if (n % 2 === 0) readout(); }, 14);
    st.series[keyS('direct')] = R.a; st.series[keyS('wbc')] = R.b; st.busy = false; render();
    return { d: R.a, w: R.b };
  }
  function set(o) { Object.assign(st, o); render(); if (ctl) ctl.update(); }
  function state() { return { f: st.f, push: st.push, dv: st.dv, shown: st.shown, pair: st.pair, series: st.series, busy: st.busy }; }
  const ser = (f, m) => st.series[f + '|' + m];
  /** Длина шага до толчка в момент tp и первого шага после него (по кадрам прогона). */
  function stepLens(ep, tp) {
    const fr = ep.frames; let before = null, after = null;
    for (let i = 1; i < fr.length; i++) { if (fr[i].st === fr[i - 1].st) continue; const L = (fr[i].st ? fr[i].f1 : fr[i].f0) - (fr[i].st ? fr[i].f0 : fr[i].f1); if (fr[i].t < tp) { if (fr[i].t > 1) before = L; } else if (after == null) after = L; }
    return { before: before || 0, after: after || 0 };
  }
  const errCm = (r) => (r && r.err != null ? fmt(r.err * 100, 1) : '—');
  const missions = [
    { short: '5 Гц', title: 'Модель на 5 Гц: кто донесёт чашку',
      text: 'Обеим Адам цели ставит одна и та же модель, 5 раз в секунду: идти к полке, затормозить у отметки на полу и поставить чашку. Ада с фиолетовым контуром получает от модели готовый план всего тела на ближайшие доли секунды: куда давить на пол, куда и когда ставить стопы, как держать руку. Ада с оранжевым контуром получает от модели только скорость, а ногами и рукой 50 раз в секунду управляет контроллер тела. По пути Аду несколько раз толкают.',
      onEnter: () => set({ f: 5, push: 'random', seed: 1 }),
      bet: { q: 'Какая Ада донесёт чашку до полки и не прольёт чай?', options: ['Обе: решения о скорости у них одинаковые', 'Только Ада с контроллером тела', 'Только Ада с готовым планом: у неё нет посредника'], answer: (r) => (r.d.ok && r.w.ok ? 0 : r.d.ok && !r.w.ok ? 2 : 1) },
      action: { label: 'Запустить обе Ады', run: async () => { set({ f: 5, push: 'random', seed: 1 }); await sleep0(); const p = runPair(); render(); return p; } },
      criteria: [{ label: 'Обе Ады прошли путь до конца', test: (r) => !!(r && r.d && r.w) }],
      explain: (r) => `Ада с готовым планом ${outTxt(r.d)}. Ада с контроллером тела ${outTxt(r.w)}. Решения о скорости у них одинаковые, и модель в уме считает шаги так же, как контроллер тела. Разница в том, кто отвечает на толчок. План Ады с фиолетовым контуром построен по кадру, которому от 0,2 до 0,4 с, и пока не придёт новый, рука с чашкой едет вместе с корпусом. Контроллер тела видит корпус каждые 20 мс и отводит руку.`,
      summary: (r) => `5 Гц: с планом — ${Duo.OUT[r.d.out]}, с контроллером — ${Duo.OUT[r.w.out]}` },
    { short: 'Частота', title: 'Как часто должна работать модель, которая ведёт тело сама',
      text: 'Один прогон может сложиться удачно или неудачно случайно. Выбери частоту модели и прогони обеих Ад по 20 раз, каждый раз с другими толчками. Найди частоту, на которой Ада с готовым планом ставит чашку хотя бы в 18 прогонах из 20.',
      controls: ['freq'], onEnter: () => set({ push: 'random' }),
      action: { label: 'Прогнать по 20 раз на этой частоте', run: async () => { const r = await seriesAt(st.f); return { f: st.f, r }; } },
      criteria: [
        { label: 'Прогнаны хотя бы три частоты', test: () => FREQS.filter((f) => ser(f, 'direct')).length >= 3 },
        { label: 'Найдена частота, на которой Ада с готовым планом ставит чашку в 18 прогонах из 20 или чаще', test: () => FREQS.some((f) => ser(f, 'direct') && ser(f, 'direct').placed >= 18) },
      ],
      summary: (r) => `${fmt(r.f)} Гц: с планом поставила ${fmt(r.r.d.placed)} из 20, с контроллером ${fmt(r.r.w.placed)} из 20`,
      fail: (r) => `На ${fmt(r.f)} Гц Ада с готовым планом поставила чашку в ${fmt(r.r.d.placed)} прогонах из 20 (упала в ${fmt(r.r.d.fell)}, пролила чай в ${fmt(r.r.d.spilled)}). Попробуй другие частоты: нужны хотя бы три, и среди них — та, где она справляется.`,
      explain: () => { const ok = FREQS.find((f) => ser(f, 'direct') && ser(f, 'direct').placed >= 18), dl = FREQS.filter((f) => ser(f, 'direct')).map((f) => `${fmt(f)} Гц — ${fmt(ser(f, 'direct').placed)}`).join(', '); return `Ада с готовым планом ставит чашку только на ${fmt(ok)} Гц, то есть когда модель работает так же часто, как контроллер тела. По частотам: ${dl} из 20. Ада с контроллером тела справляется на любой частоте модели. Корпус на ногах — перевёрнутый маятник: отклонение растёт в e раз за 0,26 с. Если ответ приходит через 1/f с и описывает кадр, снятый ещё раньше, ошибка успевает вырасти до того, как её исправят.`; } },
    { short: '2 Гц', title: 'Модель на 2 Гц над контроллером тела',
      text: 'Модели зрения и языка на миллиарды параметров отвечают ещё медленнее. Опустим частоту до двух раз в секунду: новый ответ приходит через полсекунды и описывает то, что было ещё раньше.',
      onEnter: () => set({ f: 2, push: 'random' }),
      bet: { q: 'Что станет с Адой, у которой есть контроллер тела?', options: ['Начнёт падать: модель отвечает слишком редко', 'Почти всегда поставит чашку, хоть и встанет чуть дальше от отметки', 'Перестанет останавливаться у полки'], answer: (r) => (r.w.placed >= 18 ? 1 : r.w.fell >= 3 ? 0 : 2) },
      action: { label: 'Прогнать по 20 раз на 2 Гц', run: async () => { set({ f: 2 }); const r = await seriesAt(2); return r; } },
      criteria: [{ label: 'Серия на 2 Гц прогнана', test: (r) => !!(r && r.w) }],
      summary: (r) => `2 Гц: с контроллером поставила ${fmt(r.w.placed)} из 20, с планом — ${fmt(r.d.placed)}`,
      explain: (r) => `На 2 Гц Ада с контроллером тела поставила чашку в ${fmt(r.w.placed)} прогонах из 20${r.w.fell ? `, а упала ${fmt(r.w.fell)} ${plural(r.w.fell, 'раз', 'раза', 'раз')}` : ' и ни разу не упала'}; встаёт она в среднем в ${errCm(r.w)} см от отметки${ser(50, 'wbc') ? `, а на 50 Гц — в ${errCm(ser(50, 'wbc'))} см` : ''}. Ада с готовым планом на той же частоте упала в ${fmt(r.d.fell)} прогонах из 20. Модели верхнего уровня достаточно решать, куда и с какой скоростью идти: эти решения меняются медленно. Равновесие и чашку держит уровень, который работает часто.` },
    { short: 'Толчок', title: 'Сильный толчок посреди шага',
      text: 'Теперь толчок один, но сильный: на 2,1 с Аду толкают в спину с силой 168 Н, и за 0,1 с её скорость вырастает на 0,6 м/с. Модель по-прежнему работает 5 раз в секунду.',
      onEnter: () => set({ f: 5, push: 'one', dv: 0.6 }),
      bet: { q: 'Кто устоит на ногах?', options: ['Обе: толчок короткий', 'Только Ада с контроллером тела', 'Никто: такой толчок не выдержать'], answer: (r) => (!r.d.fell && !r.w.fell ? 0 : !r.w.fell ? 1 : 2) },
      action: { label: 'Толкнуть обеих Ад', run: async () => { set({ f: 5, push: 'one', dv: 0.6 }); await sleep0(); const p = runPair(); render(); return p; } },
      criteria: [{ label: 'Ада с контроллером тела устояла', test: (r) => !!(r && r.w && r.w.fell == null) }],
      summary: (r) => `толчок 168 Н: с планом — ${Duo.OUT[r.d.out]}, с контроллером — ${Duo.OUT[r.w.out]}`,
      explain: (r) => { const sl = stepLens(r.w, ONE.t); return `Ада с готовым планом ${outTxt(r.d)}. Её следующий план придёт только через 0,2–0,4 с после толчка, а стопа уже идёт туда, куда её отправил старый план. Ада с контроллером тела ${outTxt(r.w)}: контроллер увидел толчок через 20 мс и поставил следующую стопу дальше, шаг вырос с ${fmt(sl.before * 100, 0)} до ${fmt(sl.after * 100, 0)} см. Так же ведёт себя трекер HumanPlus: при толчке в таз он восстанавливает равновесие за один-два шага.`; } },
    { short: 'Свободно', final: true, title: 'Свободный режим',
      text: 'Найди самый сильный толчок, который Ада с контроллером тела выдерживает при 5 Гц, и посмотри, меняется ли он с частотой модели. Можно выбрать случайные толчки, один толчок или прогон без толчков.',
      controls: 'all',
      action: { label: 'Запустить обе Ады', run: async () => { await sleep0(); const p = runPair(); render(); return p; } },
      summary: (r) => `${fmt(st.f)} Гц, ${st.push === 'one' ? fmt(st.dv, 2) + ' м/с' : st.push === 'random' ? 'случайные толчки' : 'без толчков'}: с планом — ${Duo.OUT[r.d.out]}, с контроллером — ${Duo.OUT[r.w.out]}` },
  ];
  function init() {
    segBind('#sFreq', (v) => set({ f: +v, shown: false }));
    segBind('#sPush', (v) => set({ push: v, shown: false }));
    $('#sDv').addEventListener('input', (e) => set({ dv: +e.target.value / 100, push: 'one', shown: false }));
    const cv = $('#sCv');
    K.loop(cv, (dt) => { if (!st.hold && st.shown) { st.t += dt; const sp = Duo.span(st.pair.d, st.pair.w); if (st.t > sp + 1.8) st.t = 0; } drawScene(); });
    redrawOn(render); render();
    ctl = mountMissions('#sMis', missions, { reset() { st.series = {}; st.shown = false; st.cache = {}; render(); }, state }, { controls: { freq: '#wrapSFreq', push: '#wrapSPush', dv: '#wrapSDv' }, scene: '#sCv' });
    return ctl;
  }
  return { init, st, missions, FREQS, api: { render, set, state, runPair, seriesAt, drawScene, drawChart } };
})();

/* =====================================================================
   2. Лаборатория «Что учить по демонстрациям»: одни и те же записи оператора, две политики. A (по шагам) повторяет то, что выдавал
   контроллер тела: опору под стопой и цель шага, 50 раз в секунду. B (по командам) повторяет скорость, которую задавал оператор,
   10 раз в секунду, а тело ведёт контроллер. Обучение и проверка — в браузере с зерном 1; диапазоны по зёрнам 1–10 посчитаны в Node.
   ===================================================================== */
const Bc = (() => {
  const E = L64, K = HeroKit, NS = [5, 10, 20, 40], NT = E.BC.NTEST;
  const st = { n: 20, dp: false, tp: false, res: {}, busy: false, prog: 0, stage: '', k: null, t: 0, hold: false, shown: false, replay: null };
  let ctl = null;
  const rkey = (n, dp) => n + '|' + (dp ? 1 : 0);
  const cur = () => st.res[rkey(st.n, st.dp)] || null;
  const cnt = (r, tp, who) => r.res[tp ? 'push' : 'calm'][who];
  /** Прогон проверки k для обеих политик с кадрами: первая проверка, где политика по шагам не справилась (или первая). */
  function replay() {
    const r = cur(); if (!r) { st.replay = null; return null; }
    const runs = cnt(r, st.tp, 'A').runs, k = st.k != null ? st.k : Math.max(0, runs.findIndex((o) => o !== 'placed'));
    const id = [st.n, st.dp, st.tp, k].join('|');
    if (st.replay && st.replay.id === id) return st.replay;
    const xs = E.testStop(k), a = E.bcEpisode('A', xs, 500 + k, { pushes: st.tp, netA: r.netA, keep: true }), b = E.bcEpisode('B', xs, 500 + k, { pushes: st.tp, netB: r.netB, keep: true });
    st.replay = { id, k, a, b, vA: Math.max(...a.frames.map((f) => f.v)), vB: Math.max(...b.frames.map((f) => f.v)) };
    return st.replay;
  }
  function drawScene() {
    const R = st.shown ? replay() : null;
    return Duo.draw($('#bCv'), R && R.a, R && R.b, st.t,
      { title: 'политика по шагам', sub: '50 раз в секунду, без контроллера', color: HeroKit.css('--hybrid'), empty: 'нажми кнопку миссии' },
      { title: 'политика по командам', sub: '10 раз в секунду + контроллер тела', color: HeroKit.css('--e2e'), empty: 'нажми кнопку миссии' });
  }
  /** Сводка: по числу записей — сколько прогонов из 20 закончились чашкой на полке; полоса — разброс по зёрнам обучения 1–10, точка — середина, ромб — опыт на странице. */
  function drawChart() {
    const cv = $('#bChart'), L = fitLayout(cv, [640, 220], [360, 270]), { c, k, narrow } = L, W = L.W, H = L.H, P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = narrow ? 40 : 52, x1 = W - 12, y0 = narrow ? 64 : 62, y1 = H - 34, gw = (x1 - x0) / NS.length, bw = Math.min(26, gw * 0.24);
    const lg = [[P.hy, 'по шагам'], [P.e2e, 'по командам']];
    let lx = x0; lg.forEach(([col, name]) => { c.fillStyle = Anim.kit.alpha(col, 0.35); c.fillRect(lx, 11, 10, 10); c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(lx, 11, 10, 10); K.label(c, k, name, lx + 14, 16, { px: 10, color: P.ink2, align: 'left', halo: false }); lx += 26 + 6.6 * name.length; });
    K.label(c, k, narrow ? 'полоса — зёрна 1–10, ромб — твой опыт' : 'полоса — разброс по зёрнам обучения 1–10, точка — середина, ромб — опыт на странице', x0, narrow ? 34 : 32, { px: 10, color: P.ink3, align: 'left', halo: false });
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke();
    for (const v of [0, 10, 20]) { const y = y1 - (y1 - y0) * v / NT; c.strokeStyle = P.grid; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); K.label(c, k, fmt(v), x0 - 6, y, { px: 10, color: P.ink3, align: 'right', halo: false }); }
    const D = E.DATA.bc[(st.dp ? 1 : 0)];
    NS.forEach((n, i) => {
      const cx = x0 + gw * (i + 0.5);
      K.label(c, k, `${n} ${plural(n, 'запись', 'записи', 'записей')}`, cx, y1 + 14, { px: 10.5, weight: n === st.n ? 750 : 600, color: n === st.n ? P.ink : P.ink3, halo: false });
      [['A', P.hy, -1], ['B', P.e2e, 1]].forEach(([who, col, sgn]) => {
        const arr = D[n][(st.tp ? 'push' : 'calm') + who], lo = Math.min(...arr), hi = Math.max(...arr), med = arr.slice().sort((a, b) => a - b)[4] / 2 + arr.slice().sort((a, b) => a - b)[5] / 2;
        const bx = cx + sgn * 4 + (sgn < 0 ? -bw : 0), yl = y1 - (y1 - y0) * lo / NT, yh = y1 - (y1 - y0) * hi / NT;
        c.fillStyle = Anim.kit.alpha(col, 0.28); c.fillRect(bx, yh, bw, Math.max(2, yl - yh)); c.strokeStyle = col; c.lineWidth = 1.4; c.strokeRect(bx, yh, bw, Math.max(2, yl - yh));
        const ym = y1 - (y1 - y0) * med / NT; c.fillStyle = col; c.beginPath(); c.arc(bx + bw / 2, ym, 3.2, 0, 7); c.fill();
        const r = st.res[rkey(n, st.dp)];
        if (r) { const v = cnt(r, st.tp, who).placed, y = y1 - (y1 - y0) * v / NT, xm = bx + bw / 2; c.fillStyle = P.surf; c.strokeStyle = P.ink; c.lineWidth = 1.6; c.beginPath(); c.moveTo(xm, y - 6); c.lineTo(xm + 6, y); c.lineTo(xm, y + 6); c.lineTo(xm - 6, y); c.closePath(); c.fill(); c.stroke(); }
      });
    });
    K.label(c, k, narrow ? 'чашка на полке, из 20' : 'прогонов из 20, где чашка на полке', x0 - 6, y0 - 14, { px: 10, color: P.ink3, align: 'left', halo: false });
    return L;
  }
  /** Что случилось с политикой по шагам в показанной проверке. */
  function caseTxt(R, r) {
    const a = R.a, sp = a.vMax > r.demoVMax + 0.05 ? `, разогнавшись до ${fmt(a.vMax, 2)} м/с, хотя в записях Ада не шла быстрее ${fmt(r.demoVMax, 2)} м/с` : '';
    if (a.out === 'hit') return `политика по шагам не затормозила вовремя и упёрлась в полку на ${fmt(a.hit, 1)} с${sp}`;
    if (a.out === 'fell') return `политика по шагам упала на ${fmt(a.fell, 1)} с${sp}`;
    if (a.out === 'miss') return `политика по шагам остановилась не у отметки${sp}`;
    if (a.out === 'spilled') return `политика по шагам пролила чай на ${fmt(a.spilled, 1)} с`;
    return 'обе политики поставили чашку';
  }
  const tally = (c) => `поставила ${fmt(c.placed)}, упала ${fmt(c.fell)}, упёрлась в полку ${fmt(c.hit)}, пролила чай ${fmt(c.spilled)}, не встала у полки ${fmt(c.miss)}`;
  function readout() {
    const pg = $('#bProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#bOut'), `${st.stage}: ${fmt(Math.round(st.prog * 100))}%`); return; }
    const r = cur();
    if (!r) { setOut($('#bOut'), 'Нажми кнопку миссии: оператор запишет демонстрации, обе политики обучатся на них, и каждая пройдёт проверку из 20 прогонов.'); return; }
    const A = cnt(r, st.tp, 'A'), Bb = cnt(r, st.tp, 'B'), R = st.replay;
    setOut($('#bOut'), `${fmt(st.n)} ${plural(st.n, 'запись', 'записи', 'записей')}${st.dp ? ' с толчками' : ''}, пар для политики по шагам ${fmt(r.pairsA)}, по командам ${fmt(r.pairsB)}; проверка ${st.tp ? 'с толчками' : 'без толчков'}. <b>По шагам</b>: ${tally(A)}. <b>По командам</b>: ${tally(Bb)}.` + (R ? ` На сцене прогон ${fmt(R.k + 1)}: наибольшая скорость ${fmt(R.vA, 2)} и ${fmt(R.vB, 2)} м/с.` : ''));
  }
  function controls() { segSet('#bN', st.n); segSet('#bDP', st.dp ? 'on' : 'off'); segSet('#bTP', st.tp ? 'on' : 'off'); }
  function render() { if (st.shown) replay(); drawScene(); drawChart(); controls(); readout(); }
  async function train() {
    const kk = rkey(st.n, st.dp); if (st.res[kk]) { st.shown = true; st.k = null; st.t = 0; render(); return st.res[kk]; }
    st.busy = true; st.prog = 0; st.stage = 'Запись демонстраций'; render(); await sleep0();
    const W = { data: 0.04, A: 0.78, B: 0.12, test: 0.06 }, base = { data: 0, A: 0.04, B: 0.82, test: 0.94 }, names = { data: 'Запись демонстраций', A: 'Обучение политики по шагам', B: 'Обучение политики по командам', test: 'Проверка' };
    let last = 0;
    const R = await runChunked(E.bcExperiment(st.n, { demoPush: st.dp, seed: E.CFG.SEED }), (h) => { st.stage = names[h.stage]; st.prog = base[h.stage] + W[h.stage] * (h.it / h.of); const now = performance.now(); if (now - last > 100) { last = now; readout(); } }, 14);
    st.res[kk] = R; st.busy = false; st.shown = true; st.k = null; st.t = 0; st.replay = null; render();
    return R;
  }
  function set(o) { Object.assign(st, o); st.replay = null; render(); if (ctl) ctl.update(); }
  function state() { return { n: st.n, dp: st.dp, tp: st.tp, busy: st.busy, res: st.res }; }
  const range = (n, dp, tp, who) => { const a = E.DATA.bc[dp ? 1 : 0][n][(tp ? 'push' : 'calm') + who]; return [Math.min(...a), Math.max(...a)]; };
  const rng2 = (n, dp, tp, who) => { const [a, b] = range(n, dp, tp, who); return a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`; };
  const missions = [
    { short: '20 записей', title: 'Две политики по одним и тем же записям',
      text: 'Оператор 20 раз провёл Аду к полке через иерархию: он решал, с какой скоростью идти, а ногами управлял контроллер тела. Политика по шагам учится повторять то, что выдавал контроллер тела 50 раз в секунду: куда давить на пол и куда ставить стопу. Политика по командам учится повторять скорость, которую задавал оператор 10 раз в секунду, и под ней остаётся контроллер тела. Проверка состоит из 20 новых прогонов, в которых полка каждый раз стоит на другом месте, а толчков нет.',
      onEnter: () => set({ n: 20, dp: false, tp: false }),
      bet: { q: 'Какая политика чаще поставит чашку на полку?', options: ['Политика по шагам: пар для неё в пять раз больше', 'Политика по командам', 'Обе одинаково: записи одни и те же'], answer: (r) => { const a = cnt(r, false, 'A').placed, b = cnt(r, false, 'B').placed; return b > a + 2 ? 1 : a > b + 2 ? 0 : 2; } },
      action: { label: 'Записать, обучить и проверить', run: async () => { set({ n: 20, dp: false, tp: false }); return train(); } },
      criteria: [{ label: 'Обе политики обучены и проверены', test: (r) => !!(r && r.res) }],
      summary: (r) => `20 записей: по шагам ${fmt(cnt(r, false, 'A').placed)} из 20, по командам ${fmt(cnt(r, false, 'B').placed)} из 20`,
      explain: (r) => { const A = cnt(r, false, 'A'), Bb = cnt(r, false, 'B'), R = replay(); return `Политика по шагам поставила чашку в ${fmt(A.placed)} прогонах из 20: она упала ${fmt(A.fell)} ${plural(A.fell, 'раз', 'раза', 'раз')}, упёрлась в полку ${fmt(A.hit)} ${plural(A.hit, 'раз', 'раза', 'раз')} и не встала у полки ${fmt(A.miss)} ${plural(A.miss, 'раз', 'раза', 'раз')}. Политика по командам поставила чашку в ${fmt(Bb.placed)} прогонах из 20. На сцене прогон ${fmt(R.k + 1)}: ${caseTxt(R, r)}. На обучающих парах политика по шагам ошибается в цели шага на доли сантиметра, но шаг чуть длиннее нужного оставляет корпусу лишнюю скорость, и каждая следующая ошибка накладывается на прошлую. На зёрнах обучения 1–10 она ставит чашку в ${rng2(20, false, false, 'A')} прогонах из 20, политика по командам — в ${rng2(20, false, false, 'B')}.`; } },
    { short: '40 записей', title: 'Вдвое больше записей',
      text: 'Может быть, политике по шагам просто мало данных? Дадим ей 40 записей вместо 20.',
      controls: ['n'], onEnter: () => set({ n: 40, dp: false, tp: false }),
      bet: { q: 'Сколько прогонов из 20 закончит политика по шагам, обученная на 40 записях?', options: ['Почти все: данных вдвое больше', 'Примерно столько же или меньше', 'Ни одного: данных стало слишком много'], answer: (r) => { const a40 = cnt(r, false, 'A').placed, a20 = st.res[rkey(20, false)] ? cnt(st.res[rkey(20, false)], false, 'A').placed : 0; return a40 >= a20 + 5 ? 0 : a40 === 0 ? 2 : 1; } },
      action: { label: 'Записать 40, обучить и проверить', run: async () => { set({ n: 40, dp: false, tp: false }); return train(); } },
      criteria: [{ label: 'Политики на 40 записях обучены и проверены', test: (r) => !!(r && r.n === 40) }],
      summary: (r) => `40 записей: по шагам ${fmt(cnt(r, false, 'A').placed)} из 20, по командам ${fmt(cnt(r, false, 'B').placed)} из 20`,
      explain: (r) => `С 40 записями политика по шагам поставила чашку в ${fmt(cnt(r, false, 'A').placed)} прогонах из 20. На зёрнах 1–10: ${rng2(5, false, false, 'A')} при 5 записях, ${rng2(10, false, false, 'A')} при 10, ${rng2(20, false, false, 'A')} при 20 и ${rng2(40, false, false, 'A')} при 40. Новые записи похожи на старые: оператор ведёт Аду ровно, и в них нет ни одного состояния, где Ада отклонилась от обычной походки и её поправили. Это то же накопление ошибки, что в уроке 1.1, только здесь отклонение ещё и само растёт, потому что корпус на ногах неустойчив. Политике по командам хватает и 10 записей: на всех зёрнах она ставит чашку в ${rng2(10, false, false, 'B')} прогонах из 20.` },
    { short: 'Толчки', title: 'Проверка с толчками',
      text: 'В доме Аду будут задевать и толкать. Проверим обе политики, обученные на 20 записях без толчков, на прогонах с толчками в корпус.',
      onEnter: () => set({ n: 20, dp: false, tp: true }),
      bet: { q: 'Что станет с политикой по командам?', options: ['Будет падать так же, как политика по шагам', 'Почти всегда поставит чашку: толчки ловит контроллер тела', 'Перестанет останавливаться у полки'], answer: (r) => { const b = cnt(r, true, 'B'); return b.placed >= 15 ? 1 : b.fell >= 3 ? 0 : 2; } },
      action: { label: 'Проверить с толчками', run: async () => { set({ n: 20, dp: false, tp: true }); return train(); } },
      criteria: [{ label: 'Проверка с толчками пройдена', test: (r) => !!(r && r.res && r.n === 20 && !r.demoPush) }],
      summary: (r) => `с толчками: по шагам ${fmt(cnt(r, true, 'A').placed)} из 20, по командам ${fmt(cnt(r, true, 'B').placed)} из 20`,
      explain: (r) => { const A = cnt(r, true, 'A'), Bb = cnt(r, true, 'B'); return `С толчками политика по шагам поставила чашку в ${fmt(A.placed)} прогонах из 20, а политика по командам — в ${fmt(Bb.placed)} и ни разу не упала: ${tally(Bb)}. На зёрнах 1–10 политика по командам ставит чашку в ${rng2(20, false, true, 'B')} прогонах, по шагам — в ${rng2(20, false, true, 'A')}. Контроллер тела в лаборатории держит равновесие по правилу шага в любом состоянии, а настоящие трекеры всего тела учат в симуляторе на толчках, как политики уроков 5.4 и 6.1.`; } },
    { short: 'Толчки при записи', title: 'Толкать Аду во время записи',
      text: 'Чтобы политика по шагам увидела, как ловят толчок, Аду можно толкать и во время записи. Ловит её всё равно контроллер тела, а в запись попадает то, что он при этом делал.',
      onEnter: () => set({ n: 20, dp: true, tp: true }),
      bet: { q: 'Сколько прогонов с толчками закончит политика по шагам, обученная на 20 таких записях?', options: ['Почти все', 'Около половины', 'Почти ни одного'], answer: (r) => { const a = cnt(r, true, 'A').placed; return a >= 17 ? 0 : a >= 7 ? 1 : 2; } },
      action: { label: 'Записать с толчками, обучить и проверить', run: async () => { set({ n: 20, dp: true, tp: true }); return train(); } },
      criteria: [{ label: 'Политики на записях с толчками обучены и проверены', test: (r) => !!(r && r.demoPush) }],
      summary: (r) => `записи с толчками: по шагам ${fmt(cnt(r, true, 'A').placed)} из 20, по командам ${fmt(cnt(r, true, 'B').placed)} из 20`,
      explain: (r) => `На записях с толчками политика по шагам поставила чашку в ${fmt(cnt(r, true, 'A').placed)} прогонах из 20 с толчками, а на зёрнах 1–10 — в ${rng2(20, true, true, 'A')}. Теперь в данных есть отклонения и то, как их исправляли, — как в DAgger из урока 1.2. Но исправлял их контроллер тела, и политика выучила его копию. Толкать настоящего робота при каждой записи опасно, а контроллер тела и так есть. Поэтому в работах этого урока контроллер оставляют внизу, а по записям учат только то, чего он не знает: куда и как быстро идти и что делать руками.` },
    { short: 'Свободно', final: true, title: 'Свободный режим',
      text: 'Найди самое малое число записей с толчками, при котором политика по шагам ставит чашку хотя бы в 18 прогонах из 20 с толчками. Обучение на странице идёт с зерном 1, полоса на сводке показывает разброс по зёрнам 1–10.',
      controls: 'all',
      action: { label: 'Записать, обучить и проверить', run: async () => train() },
      summary: (r) => `${fmt(r.n)} ${plural(r.n, 'запись', 'записи', 'записей')}${r.demoPush ? ' с толчками' : ''}: по шагам ${fmt(cnt(r, st.tp, 'A').placed)} из 20, по командам ${fmt(cnt(r, st.tp, 'B').placed)} из 20 (${st.tp ? 'с толчками' : 'без толчков'})` },
  ];
  function init() {
    segBind('#bN', (v) => set({ n: +v, shown: !!st.res[rkey(+v, st.dp)] }));
    segBind('#bDP', (v) => set({ dp: v === 'on', shown: !!st.res[rkey(st.n, v === 'on')] }));
    segBind('#bTP', (v) => set({ tp: v === 'on' }));
    const cv = $('#bCv');
    K.loop(cv, (dt) => { if (!st.hold && st.shown && st.replay) { st.t += dt; const sp = Duo.span(st.replay.a, st.replay.b); if (st.t > sp + 1.8) st.t = 0; } drawScene(); });
    redrawOn(render); render();
    ctl = mountMissions('#bMis', missions, { reset() { st.shown = false; st.replay = null; render(); }, state }, { controls: { n: '#wrapBN', dp: '#wrapBDP', tp: '#wrapBTP' }, scene: '#bCv' });
    return ctl;
  }
  return { init, st, missions, NS, api: { render, set, state, train, replay, drawScene, drawChart } };
})();

/* =====================================================================
   3. Интерактив: что модель верхнего уровня задаёт ногам в настоящих системах (Cards.sort).
   ===================================================================== */
const IFACE = {
  targets: [
    { id: 'base', label: 'Ноги не нужны', note: 'колёсная база стоит сама, и модель задаёт ей скорость' },
    { id: 'vel', label: 'Скорость корпуса и руки', note: 'куда ставить стопы, решает нижний уровень' },
    { id: 'joints', label: 'Углы суставов или позы стоп', note: 'модель задаёт и ноги, равновесие держит нижний уровень' },
    { id: 'latent', label: 'Выученный вектор', note: 'числа без заданного заранее смысла' },
  ],
  items: [
    { id: 'aloha', label: 'Mobile ALOHA', sub: 'действие: 14 углов рук и две скорости базы', target: 'base', why: 'Оператор толкает базу сам, политика выдаёт 14 целевых углов рук и линейную и угловую скорость базы 50 раз в секунду. Батарея массой 14 кг стоит внизу и служит противовесом, так что робот не опрокидывается.' },
    { id: 'homie', label: 'HOMIE', sub: 'педали: скорость, поворот, высота; руки — экзоскелетом', target: 'vel', why: 'Педали задают скорость вперёд и назад, поворот и высоту корпуса, а ходьбой по этим командам управляет политика, обученная с подкреплением. Углы рук приходят с экзоскелета напрямую. Автономная политика по 50 записям выдаёт те же команды: углы рук и высоту.' },
    { id: 'amo', label: 'AMO', sub: 'скорость базы, наклон и высота торса', target: 'vel', why: 'Верхняя политика выдаёт углы рук и команду нижней: скорость, ориентацию торса и высоту. Нижняя держит равновесие и сама решает, куда ставить стопы. Автономную верхнюю политику (ACT) учили по 50 записям на задачу.' },
    { id: 'sonic3', label: 'SONIC: три точки', sub: 'голова, запястья, высота поясницы, команда навигации', target: 'vel', why: 'Через три точки GR00T N1.5 выдаёт позы головы и запястий, высоту и команду навигации, а движение ног строит кинематический планировщик. На задаче «яблоко на тарелку» по 300 траекториям — 90% успеха.' },
    { id: 'humanplus', label: 'HumanPlus', sub: 'целевые углы 19 суставов тела, скорости и наклон корпуса', target: 'joints', why: 'HIT выдаёт целевые позы для трекера HST: углы всех суставов тела, в том числе ног, и скорости и наклон корпуса. Равновесие держит HST, обученный с подкреплением на 40 часах движений людей.' },
    { id: 'twist2', label: 'TWIST2', sub: 'скорость и высота корпуса плюс углы всех суставов', target: 'joints', why: 'Команда трекера включает углы всех суставов, включая ноги, а не только скорость корпуса. Авторы пишут, что именно это даёт делать задачи ногами: робот толкает ногой ящик к цели в 6 попытках из 7.' },
    { id: 'atlas', label: 'Atlas (BD и TRI)', sub: 'позы кистей, торса и обеих стоп', target: 'joints', why: 'Модель на 450 млн параметров 30 раз в секунду выдаёт позы кистей, торса и стоп через тот же интерфейс, что телеоперация, построенная на MPC Boston Dynamics.' },
    { id: 'helix02', label: 'Helix 02', sub: 'S1 выдаёт цели всех суставов, S0 их исполняет', target: 'joints', why: 'S1 200 раз в секунду выдаёт цели суставов всего тела, а S0 исполняет их 1000 раз в секунду и держит равновесие и контакты. Так робот закрывает ящик бедром, когда руки заняты. Об уровнях Helix 02 — урок 3.7.' },
    { id: 'leverb', label: 'LeVERB', sub: 'вектор, выученный по записям движений', target: 'latent', why: 'Модель зрения и языка 10 раз в секунду выдаёт латентный вектор, а контроллер всего тела 50 раз в секунду превращает его в целевые углы. Явные интерфейсы, по словам авторов, дают дёрганые движения из-за невыполнимых команд.' },
    { id: 'sonic', label: 'SONIC: токены', sub: '64 числа токена движения и 14 углов кистей', target: 'latent', why: 'Через всё тело GR00T N1.5 выдаёт токен движения: выученный код, который трекер умеет исполнять. С токенами модель на трёх задачах в среднем справлялась в 68% попыток, а с явными позами всего тела — в 27%.' },
  ],
};
function initIface() {
  const root = $('#ifaceSort'); if (!root) return;
  IFACE.ctl = Cards.sort(root, { items: IFACE.items, targets: IFACE.targets, checkLabel: 'Проверить',
    after: 'Чем больше тела модель верхнего уровня задаёт сама, тем больше она может: робот TWIST2 толкает ногой ящик, а SONIC открывает ведро педалью. Но тем точнее модель должна быть, потому что её ошибки попадают прямо в ноги. Колёсной базе Mobile ALOHA этот выбор не нужен: она стоит сама.' });
}

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
const QUIZ = [
  { q: 'Модель VLA выдаёт пачку действий на доли секунды вперёд. Почему ей всё равно не отдают ноги напрямую?', o: ['Пачка задаёт ноги хуже, чем углы суставов по одному', 'Пачку строят по кадру, которому уже доли секунды, а корпус на ногах неустойчив: отклонение от плана растёт быстрее, чем придёт новая пачка', 'Модели VLA не умеют выдавать углы суставов ног'], a: 1, e: 'В лаборатории 1 модель в уме считала шаги так же, как контроллер тела, но на 5 Гц Ада с её планом проливала чай после первого толчка и иногда падала. Корпус на ногах ведёт себя как перевёрнутый маятник: отклонение растёт в e раз за 0,26 с.' },
  { q: 'Что делает контроллер всего тела в иерархии вроде HumanPlus или TWIST2?', o: ['Решает, куда идти и что взять', 'Получает целевую позу или скорость корпуса и много раз в секунду выдаёт целевые углы суставов так, чтобы робот не упал', 'Распознаёт предметы на картинке с камер'], a: 1, e: 'HST в HumanPlus и трекер в TWIST2 обучены с подкреплением в симуляции на записях движений людей, как трекеры урока 6.3. Модель верхнего уровня (HIT или Diffusion Policy) отвечает за задачу и выдаёт им команды 25 и 20 раз в секунду.' },
  { q: 'Mobile ALOHA просто добавляет две скорости базы к действию политики. Почему гуманоиду так нельзя?', o: ['Колёсная база устойчива сама: если команда опоздала, робот поедет не туда, но не упадёт', 'Колёса быстрее ног', 'У Mobile ALOHA больше данных'], a: 0, e: 'У Mobile ALOHA батарея массой 14 кг внизу служит противовесом, и опоздавшая команда скорости ничем не грозит. У гуманоида опоздавшая команда для ног — это шаг не туда, а без верного шага корпус падает.' },
  { q: 'Телеоперация всем телом записывает команды, которые получал нижний уровень. Чем это удобно для автономной политики?', o: ['Записи потом легко проверить глазами', 'Политика учится выдавать те же команды тому же контроллеру тела, и записи сразу становятся её данными', 'Записи можно проигрывать на роботе без политики'], a: 1, e: 'В TWIST2 при сборе данных команды дают оператор и ретаргетинг, а при работе — Diffusion Policy, и трекер под ними один. В HOMIE автономная политика заменяет оператора и выдаёт команды для ног и углы рук, в Atlas политика пользуется тем же интерфейсом, что телеоперация.' },
  { q: 'Политика по шагам из лаборатории 2 точно повторяет записи, но часто падает или проскакивает полку. Почему?', o: ['Сеть слишком маленькая для такой задачи', 'В записях нет отклонений и того, как их исправляли: маленькая ошибка уводит Аду туда, где политика ничего не видела, и ошибка растёт', 'Записей слишком много, и сеть их путает'], a: 1, e: 'С ростом числа записей она не становилась лучше, а после записей с толчками почти всегда справлялась, потому что в данных появились исправления. Это накопление ошибки из урока 1.1, и лечится оно тем же, что DAgger в уроке 1.2: данными о том, как выбираться из отклонений.' },
  { q: 'Чем хорош интерфейс «скорость корпуса и положения кистей» и чем он ограничен?', o: ['Он задаёт всё тело точнее любого другого', 'Его легко выучить, и ошибки модели верхнего уровня не роняют робота, но стопы выбирает нижний уровень, поэтому нажать ногой на педаль так не выйдет', 'Он подходит только колёсным роботам'], a: 1, e: 'Так устроены HOMIE, AMO и три точки SONIC. TWIST2 добавил в команду углы суставов ног и получил задачи, где ногой толкают ящик, а SONIC с токенами всего тела открывал ведро педалью.' },
  { q: 'В SONIC модель VLA справлялась лучше, когда выдавала токены движения, а не позы всего тела. Почему?', o: ['Токены точнее описывают позу, чем углы суставов', 'Компактное пространство токенов легче выучить по демонстрациям, а маленькие ошибки в позах всего тела превращаются в большие ошибки трекинга', 'Токены быстрее передаются по сети'], a: 1, e: 'Так объясняют разницу авторы SONIC: на задаче «банку в ведро с педалью» модель с токенами справлялась в 60% попыток, а с позами — ни разу. Явные позы давали дёрганые движения и плохо держали направление.' },
  { q: 'В Helix 02 три уровня. Почему самый нижний, S0, работает чаще всех?', o: ['Он самый большой из трёх', 'Он держит равновесие и контакты, где ошибка растёт за доли секунды, а сам он маленький и быстрый', 'Так он видит больше кадров с камер'], a: 1, e: 'S0 — сеть на 10 млн параметров, обученная в симуляции. Она исполняет цели суставов, которые 200 раз в секунду выдаёт S1, а S2 решает, что делать. Чем ниже уровень, тем чаще он работает и тем он меньше (урок 3.7).' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('split', () => { mis.split = Split.init(); });
    safe('bc', () => { mis.bc = Bc.init(); });
    safe('iface', initIface); safe('quiz', initQuiz);
    safe('count', () => { const n = ['sMis', 'bMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l64 = { mis, Split, Bc, Duo, Fig, L64, QUIZ, IFACE }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
