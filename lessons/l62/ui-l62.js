/* =====================================================================
   ui-l62.js — урок 6.2 «Имитация движений человека».
   0) анимированные схемы (shared/anim.js): контур DeepMimic (запись,
      ретаргетинг, часы фазы, политика, ПД и физика, сравнение с кадром,
      старт из записи и ранний останов) и контур AMP (переходы записей и
      политики, дискриминатор, награда стиля и награда задачи);
   1) лаборатория «Ретаргетинг»: человек и Ада рядом, три способа переноса,
      пределы суставов, пол и центр масс;
   2) лаборатория «Трекинг против AMP»: одна семья политик учится двумя
      наградами, прогон при разных командах скорости;
   3) лаборатория «Смесь записей»: среднее двух записей, трекер по среднему
      против максимума по записям;
   4) таблица абляций с наведением; квиз.
   Ада рисуется AdaBody из shared/ada-legs.js (тот же рисунок, что в 6.1).
   Движок — l62/engine.js (без DOM).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface'), e2eS: HeroKit.css('--e2e-soft'), clS: HeroKit.css('--classic-soft') });
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
const alpha = (col, a) => Anim.kit.alpha(col, a);
/** Логический размер канваса: широкая раскладка или узкая (телефон), с пропорциями в стиле элемента. */
function fitLayout(cv, wide, narrow) {
  const n = canvasNarrow(cv, wide[0]), L = n ? narrow : wide, ar = `${L[0]} / ${L[1]}`;
  if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
  const { c, k } = HeroKit.fit(cv, L[0], L[1]);
  return { c, k, W: L[0], H: L[1], narrow: n };
}

/* =====================================================================
   Фигуры: Ада — AdaBody (shared/ada-legs.js) по позе движка; человек — своя фигура
   по точкам прямой кинематики: та же цепочка звеньев, синий контур, круглая голова.
   ===================================================================== */
const Fig = (() => {
  const E = L62;
  /** Поза движка { x, y — таз, th — наклон вперёд, q[6], arm[4] } → кадр AdaBody: центр корпуса и наклон против часовой стрелки. */
  function frame(pose) { const [s, c] = [Math.sin(pose.th), Math.cos(pose.th)], h = E.ADA.LT / 2; return [pose.x + h * s, pose.y + h * c, -pose.th, pose.q[0], pose.q[1], pose.q[2], pose.q[3], pose.q[4], pose.q[5], 0]; }
  /** Ада по позе: o — параметры AdaBody.side; body — другие длины бедра и голени (свободный режим лаборатории 1). */
  function ada(c, X, Y, pose, o, body) {
    o = Object.assign({ arms: pose.arm }, o || {});
    if (body && (Math.abs(body.L1 - E.ADA.L1) > 1e-9 || Math.abs(body.L2 - E.ADA.L2) > 1e-9)) o.body = { L1: body.L1, L2: body.L2 };
    return AdaBody.side(c, X, Y, frame(pose), o);
  }
  function cap(c, a, b, w, fill, edge) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = edge; c.lineWidth = w + 3; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.strokeStyle = fill; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  function dot(c, p, r, fill) { c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fillStyle = fill; c.fill(); }
  /** Человек по позе движка: дальние конечности бледнее, ближние поверх корпуса. */
  function human(c, X, Y, pose) {
    const B = E.HUMAN, Pw = E.fk(B, pose), P = {}, m = X(1) - X(0), P0 = pal(), edge = P0.cl, fill = HeroKit.dark() ? '#1d2a3a' : '#e3ecf7';
    for (const k of E.PTS) P[k] = [X(Pw[k][0]), Y(Pw[k][1])];
    const w = 0.055 * m;
    const foot = (s) => { const h = P['heel' + s], t = P['toe' + s], a = P['ankle' + s]; c.beginPath(); c.moveTo(h[0], h[1]); c.lineTo(t[0], t[1]); c.lineTo(a[0] + (t[0] - a[0]) * 0.3, a[1] + (t[1] - a[1]) * 0.3 - 0.025 * m); c.lineTo(a[0], a[1]); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 1.8; c.strokeStyle = edge; c.lineJoin = 'round'; c.stroke(); };
    const limb = (s, far) => { c.save(); if (far) c.globalAlpha *= 0.5; cap(c, P.hip, P['knee' + s], w, fill, edge); cap(c, P['knee' + s], P['ankle' + s], w * 0.85, fill, edge); foot(s); dot(c, P['knee' + s], 0.018 * m + 1.5, edge); dot(c, P['ankle' + s], 0.016 * m + 1.5, edge); c.restore(); };
    const arm = (s, far) => { c.save(); if (far) c.globalAlpha *= 0.5; cap(c, P.sh, P['elbow' + s], w * 0.7, fill, edge); cap(c, P['elbow' + s], P['hand' + s], w * 0.6, fill, edge); dot(c, P['hand' + s], 0.025 * m, edge); c.restore(); };
    limb('L', true); arm('L', true);
    cap(c, P.hip, P.sh, 0.09 * m, fill, edge);
    c.beginPath(); c.arc(P.head[0], P.head[1], B.RH * m, 0, 7); c.fillStyle = fill; c.fill(); c.lineWidth = 2; c.strokeStyle = edge; c.stroke();
    limb('R', false); arm('R', false);
    dot(c, P.hip, 0.02 * m + 1.5, edge);
    return Pw;
  }
  /** Пол: заливка под линией, линия, засечки через 0,5 м со сдвигом x0 (метры под точкой cx), подписи метров. */
  function floor(c, k, X, Y, W, H, x0, o) {
    o = o || {}; const P = pal(), y = Y(0);
    c.fillStyle = P.grid; c.fillRect(0, y, W, H - y);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    const xl = x0 - 6, xr = x0 + 6;
    for (let mx = Math.ceil(xl * 2) / 2; mx <= xr; mx += 0.5) {
      const px = X(mx); if (px < -2 || px > W + 2) continue;
      c.strokeStyle = P.line; c.beginPath(); c.moveTo(px, y); c.lineTo(px, y + (Number.isInteger(mx) ? 10 : 5)); c.stroke();
      if (o.labels && Number.isInteger(mx) && px > 18 && px < W - 18) HeroKit.label(c, k, `${mx} м`, px, y + 22 * Math.max(1, k * 0.8), { px: 10, color: P.ink3, halo: false });
    }
  }
  return { frame, ada, human, floor };
})();

/* =====================================================================
   0. Анимированные схемы. Общие детали: блоки, стрелки, маленькие Ада и человек.
   Подписи не мельче 10 px на экране и помещаются в свои блоки: широкая раскладка —
   от 700 px ширины карточки (k ≤ 1,1), узкая — до 360 px (k ≤ 1,25).
   ===================================================================== */
const SchemeKit = (() => {
  const E = L62;
  let clip = null;
  /** Запись Ады (ходьба, перенесённая точками, пределами и полом) — кадры для схем. */
  const walkClip = () => clip || (clip = E.adaClip('walk'));
  const hum = () => walkClip().human;
  function box(c, k, A, P, b, title, sub, col, hot, o) {
    o = o || {};
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.16 : 0.06), col, hot ? 2.2 : 1.3);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + (o.ty || 15), { px: 12, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] - (o.sy || 13), { px: 10.5, weight: 600, color: P.ink2, halo: false });
  }
  const R_ = (b) => [b[0] + b[2], b[1] + b[3] / 2], L_ = (b) => [b[0], b[1] + b[3] / 2], B_ = (b) => [b[0] + b[2] / 2, b[1] + b[3]], T_ = (b) => [b[0] + b[2] / 2, b[1]];
  const M0 = 100;   // фигуры рисуются в масштабе 100 пикселей на метр, а контекст уменьшается: линии тоньше вместе с фигурой
  function figIn(c, r, m, o, fn) {
    o = o || {}; const fx = r[0] + r[2] * (o.at || 0.5), fy = r[1] + r[3] - (o.floor == null ? 8 : o.floor);
    c.save(); c.beginPath(); c.rect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); c.clip();
    if (o.ground !== false) { const P = pal(); c.strokeStyle = P.line; c.lineWidth = 1.2; c.beginPath(); c.moveTo(r[0] + 6, fy + 0.5); c.lineTo(r[0] + r[2] - 6, fy + 0.5); c.stroke(); }
    c.translate(fx, fy); c.scale(m / M0, m / M0);
    fn((x) => x * M0, (y) => -y * M0);
    c.restore();
  }
  /** Ада по кадру записи внутри прямоугольника r = [x, y, w, h]: таз на месте, пол — у нижнего края, m пикселей на метр. */
  function adaIn(c, r, pose, m, o) {
    o = o || {};
    figIn(c, r, m, o, (X, Y) => { if (o.ghostPose) Fig.ada(c, X, Y, Object.assign({}, o.ghostPose, { x: 0 }), { ghost: true }); Fig.ada(c, X, Y, Object.assign({}, pose, { x: 0 }), { color: o.color }); });
  }
  function humanIn(c, r, pose, m, o) { figIn(c, r, m, o, (X, Y) => Fig.human(c, X, Y, Object.assign({}, pose, { x: 0 }))); }
  /** Поза записи в фазе φ (таз на месте). */
  function poseAt(C, phi) { const f = E.clipAt(C, phi); return { x: 0, y: f.y, th: f.th, q: Float64Array.from(f.q), arm: Float64Array.from(f.arm) }; }
  /** Циферблат фазы φ. */
  function dial(c, k, A, P, x, y, r, phi, label) {
    A.circle(c, x, y, r, P.surf, P.spr, 1.6);
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2; A.line(c, [[x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78], [x + Math.cos(a) * r, y + Math.sin(a) * r]], P.line, 1.2); }
    const a = -Math.PI / 2 + phi * 2 * Math.PI;
    A.line(c, [[x, y], [x + r * 0.8 * Math.cos(a), y + r * 0.8 * Math.sin(a)]], P.spr, 2.4);
    A.circle(c, x, y, 2.5, P.spr, null);
    if (label) A.lab(c, k, label, x, y + r + 13, { px: 10.5, weight: 700, color: P.spr, halo: false });
  }
  /** Полоска награды с подписью над ней. */
  function bar(c, k, A, P, b, v, col, title, o) {
    o = o || {};
    A.rect(c, b[0], b[1], b[2], b[3], 6, P.surf, col, 1.3);
    if (v > 0.002) A.rect(c, b[0] + 2, b[1] + 2, Math.max(2, (b[2] - 4) * Math.min(1, v)), b[3] - 4, 4, col, null);
    if (title) A.lab(c, k, title, o.tx == null ? b[0] + b[2] / 2 : o.tx, b[1] - 11, { px: 11, weight: 700, color: col, halo: false, align: o.align || 'center' });
  }
  return { walkClip, hum, box, R_, L_, B_, T_, adaIn, humanIn, poseAt, dial, bar };
})();

/* ---------- Схема `mimic`: контур DeepMimic ----------
   Запись человека → ретаргетинг → кадры записи Ады по фазе φ; часы φ идут со скоростью записи и подаются
   политике; целевые углы суставов отрабатывают ПД-регуляторы в физике; новое состояние сравнивают с кадром φ;
   награда за близость идёт в обучение (PPO). Три эпизода по 4 с: старт из случайного кадра (RSI), во втором —
   падение и ранний останов. Числа на схеме условные, кроме весов слагаемых (раздел 5.3 статьи). */
(() => {
  const S = SchemeKit, T = 12, STARTS = [0.1, 0.62, 0.35];
  function state(t) {
    const u = ((t % T) + T) % T, ep = Math.floor(u / 4), tu = u - ep * 4, C = S.walkClip();
    const phi = (STARTS[ep] + tu * C.f) % 1, fall = ep === 1 ? Math.max(0, Math.min(1, (tu - 2.2) / 0.6)) : 0, dead = ep === 1 && tu > 2.8;
    return { u, ep, tu, phi, fall, dead, rsi: tu < 0.6 };
  }
  function draw(c, k, t, P, A, g) {
    const s = state(t), C = S.walkClip(), B = g.b, n = g.narrow;
    const pose = S.poseAt(C, s.phi - 0.05), ghost = S.poseAt(C, s.phi);
    pose.th += 0.04 * Math.sin(s.u * 2.3);
    if (s.fall > 0) { pose.th += 1.25 * s.fall; pose.y -= 0.33 * s.fall; }
    const rI = s.dead ? 0 : Math.max(0, 0.82 + 0.08 * Math.sin(s.u * 1.7) - 0.8 * s.fall);
    const ar = (a, b2, col, lw) => A.arrow(c, a[0], a[1], b2[0], b2[1], col, lw || 1.7, 7);
    // запись человека и кадры записи Ады
    S.box(c, k, A, P, B.hum, 'запись человека', null, P.out, false);
    S.humanIn(c, [B.hum[0], B.hum[1] + 22, B.hum[2], B.hum[3] - 24], S.poseAt(S.hum(), s.phi), g.mh);
    S.box(c, k, A, P, B.strip, 'запись Ады: кадры по фазе φ', null, P.out, false);
    const nf = g.nf, cw = (B.strip[2] - 16) / nf, cur = Math.floor(s.phi * nf) % nf;
    for (let i = 0; i < nf; i++) {
      const r = [B.strip[0] + 8 + i * cw, B.strip[1] + 24, cw - 3, B.strip[3] - 30];
      A.rect(c, r[0], r[1], r[2], r[3], 4, i === cur ? A.alpha(P.out, 0.22) : P.surf, i === cur ? P.out : P.line, i === cur ? 1.8 : 1);
      S.adaIn(c, r, S.poseAt(C, (i + 0.5) / nf), g.mf, { floor: 4, ground: false });
    }
    // политика с часами фазы, физика, сравнение
    S.box(c, k, A, P, B.pol, 'политика π(a | s, φ)', null, P.mot, !s.dead);
    S.dial(c, k, A, P, B.pol[0] + g.dial[0], B.pol[1] + g.dial[1], g.dial[2], s.phi, null);
    A.lab(c, k, 'вход: фаза φ', B.pol[0] + g.txt[0], B.pol[1] + g.txt[1], { px: 10.5, weight: 700, color: P.spr, halo: false });
    A.lab(c, k, 'сеть 1024 и 512', B.pol[0] + g.txt[0], B.pol[1] + g.txt[1] + 20, { px: 10.5, weight: 600, color: P.ink2, halo: false });
    S.box(c, k, A, P, B.sim, 'ПД-регуляторы и физика', null, P.out, false);
    S.adaIn(c, [B.sim[0], B.sim[1] + 22, B.sim[2], B.sim[3] - 24], pose, g.ms, { ghostPose: s.dead ? null : ghost, floor: 6 });
    S.box(c, k, A, P, B.cmp, 'сравнение с кадром φ', 'углы, стопы, центр масс', P.spr, !s.dead);
    if (n) {
      ar([S.B_(B.hum)[0], S.B_(B.hum)[1] + 2], [S.T_(B.strip)[0], S.T_(B.strip)[1] - 2], P.out);
      A.lab(c, k, 'ретаргетинг', S.B_(B.hum)[0] + 12, (S.B_(B.hum)[1] + S.T_(B.strip)[1]) / 2, { px: 10.5, weight: 650, color: P.out, halo: false, align: 'left' });
      ar([S.B_(B.pol)[0] - 40, S.B_(B.pol)[1] + 2], [S.B_(B.pol)[0] - 40, S.T_(B.sim)[1] - 2], P.mot, 2);
      A.lab(c, k, 'целевые углы, 30 Гц', S.B_(B.pol)[0] - 28, (S.B_(B.pol)[1] + S.T_(B.sim)[1]) / 2, { px: 10.5, weight: 650, color: P.mot, halo: false, align: 'left' });
      ar([S.B_(B.sim)[0], S.B_(B.sim)[1] + 2], [S.T_(B.cmp)[0], S.T_(B.cmp)[1] - 2], P.out);
      const ry = B.strip[1] + B.strip[3] / 2, cy = B.cmp[1] + B.cmp[3] / 2;
      A.line(c, [[S.R_(B.strip)[0] + 1, ry], [355, ry], [355, cy]], P.out, 1.3); ar([355, cy], [S.R_(B.cmp)[0] + 2, cy], P.out, 1.3);
    } else {
      ar([S.R_(B.hum)[0] + 2, S.R_(B.hum)[1]], [S.L_(B.strip)[0] - 2, S.L_(B.strip)[1]], P.out);
      A.lab(c, k, 'ретаргетинг', (S.R_(B.hum)[0] + S.L_(B.strip)[0]) / 2, S.R_(B.hum)[1] - 12, { px: 10.5, weight: 650, color: P.out, halo: false });
      ar([S.R_(B.pol)[0] + 2, S.R_(B.pol)[1]], [S.L_(B.sim)[0] - 2, S.L_(B.sim)[1]], P.mot, 2);
      A.lab(c, k, 'целевые углы', (S.R_(B.pol)[0] + S.L_(B.sim)[0]) / 2, S.R_(B.pol)[1] - 12, { px: 10.5, weight: 650, color: P.mot, halo: false });
      A.lab(c, k, '30 раз в секунду', (S.R_(B.pol)[0] + S.L_(B.sim)[0]) / 2, S.R_(B.pol)[1] + 13, { px: 10, color: P.mot, halo: false });
      ar([S.R_(B.sim)[0] + 2, S.R_(B.sim)[1]], [S.L_(B.cmp)[0] - 2, S.L_(B.cmp)[1]], P.out);
      ar([S.T_(B.cmp)[0], S.B_(B.strip)[1] + 2], [S.T_(B.cmp)[0], S.T_(B.cmp)[1] - 2], P.out, 1.3);
      A.lab(c, k, 'кадр φ', S.T_(B.cmp)[0] + 8, (S.B_(B.strip)[1] + S.T_(B.cmp)[1]) / 2, { px: 10, weight: 650, color: P.out, halo: false, align: 'left' });
    }
    // награда → обучение → политика
    const rb = B.rew, col = s.dead ? P.bad : P.spr;
    S.bar(c, k, A, P, rb, rI, col, s.dead ? 'ранний останов: награда 0' : `награда за близость: ${A.fmt(rI, 2)}`);
    const wl = n ? ['углы 0,65 · скорости 0,1 ·', 'кисти и стопы 0,15 · центр масс 0,1'] : ['веса: углы 0,65 · скорости 0,1 · кисти и стопы 0,15 · центр масс 0,1'];
    wl.forEach((tx, i) => A.lab(c, k, tx, rb[0] + rb[2] / 2, rb[1] + rb[3] + 13 + i * 14, { px: 10, color: P.ink3, halo: false }));
    if (n) {
      ar([S.B_(B.cmp)[0], S.B_(B.cmp)[1] + 2], [S.B_(B.cmp)[0], rb[1] - 22], P.spr);
      const py = B.pol[1] + B.pol[3] / 2;
      A.line(c, [[rb[0] - 2, rb[1] + rb[3] / 2], [4, rb[1] + rb[3] / 2], [4, py]], P.spr, 1.6); ar([4, py], [B.pol[0] - 1, py], P.spr);
      A.lab(c, k, 'PPO', 10, (S.B_(B.sim)[1] + B.cmp[1]) / 2, { px: 10.5, weight: 700, color: P.spr, halo: false, align: 'left' });
    } else {
      ar([S.B_(B.cmp)[0], S.B_(B.cmp)[1] + 2], [rb[0] + rb[2] + 2, rb[1] + rb[3] / 2], P.spr);
      ar([rb[0] - 2, rb[1] + rb[3] / 2], [S.B_(B.pol)[0], S.B_(B.pol)[1] + 2], P.spr);
      A.lab(c, k, 'обучение PPO', (rb[0] + S.B_(B.pol)[0]) / 2 - 24, (rb[1] + S.B_(B.pol)[1]) / 2 + 14, { px: 10.5, weight: 700, color: P.spr, halo: false });
    }
    // что происходит
    const cc = n ? (s.dead ? ['Падение обрывает эпизод:', 'награда до конца — ноль'] : s.rsi ? ['Старт из случайного кадра', 'записи (RSI): поза и фаза оттуда'] : ['Награда тем выше, чем ближе', 'Ада к кадру φ (призрак)'])
      : (s.dead ? ['Падение обрывает эпизод: награда до его конца равна нулю,', 'и лежачих состояний в опыте нет'] : s.rsi ? ['Новый эпизод начинается из случайного кадра записи:', 'поза, скорости и фаза φ берутся из этого кадра'] : ['Часы φ идут со скоростью записи. Награда тем выше,', 'чем ближе Ада к кадру записи в фазе φ (призрак)']);
    A.lab(c, k, cc[0], g.cap[0], g.cap[1], { px: 12, weight: 700, color: s.dead ? P.bad : P.ink, halo: false, align: 'left' });
    A.lab(c, k, cc[1], g.cap[0], g.cap[1] + 18, { px: 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  const WIDE = { narrow: false, nf: 10, mh: 38, mf: 30, ms: 64, dial: [40, 58, 22], txt: [140, 48],
    b: { hum: [16, 14, 150, 104], strip: [236, 14, 468, 104], pol: [16, 156, 210, 100], sim: [296, 146, 200, 120], cmp: [552, 162, 152, 88], rew: [270, 318, 250, 18] }, cap: [16, 384] };
  const NARROW = { narrow: true, nf: 6, mh: 36, mf: 26, ms: 70, dial: [38, 56, 20], txt: [140, 46],
    b: { hum: [14, 12, 336, 104], strip: [14, 146, 336, 96], pol: [14, 272, 226, 92], sim: [14, 394, 336, 118], cmp: [14, 542, 336, 56], rew: [44, 640, 276, 16] }, cap: [12, 712] };
  Anim.add('mimic', {
    W: 720, H: 420, start: 1.2, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 750, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* ---------- Схема `amp`: контур AMP ----------
   Переходы (s, s′) из записей и переходы Ады в физике идут в дискриминатор D; он учится ставить записям 1, а Аде −1;
   его оценка перехода Ады превращается в награду стиля max[0, 1 − 0,25 (D − 1)²]; награда задачи — за скорость по
   команде; политика без фазы учится по сумме с весами 0,5 и 0,5 (PPO). Ада в физике шагает своим ритмом. Оценки D
   на схеме условные, формула и веса — из статьи. */
(() => {
  const S = SchemeKit, T = 10;
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, C = S.walkClip(), B = g.b, n = g.narrow, train = u > 6 && u < 8;
    const phiR = (u * C.f) % 1, phiA = (u * 1.0) % 1;
    const d = train ? null : 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(u * 1.3)), rs = d == null ? 0 : Math.max(0, 1 - 0.25 * (d - 1) * (d - 1));
    const ar = (a, b2, col, lw) => A.arrow(c, a[0], a[1], b2[0], b2[1], col, lw || 1.7, 7);
    // записи: пара соседних кадров (s, s′)
    S.box(c, k, A, P, B.rec, 'записи: переходы (s, s′)', null, P.out, false);
    const pw = Math.min(64, (B.rec[2] - 40) / 2), r1 = [B.rec[0] + B.rec[2] / 2 - pw - 6, B.rec[1] + 24, pw, B.rec[3] - 30], r2 = [B.rec[0] + B.rec[2] / 2 + 6, B.rec[1] + 24, pw, B.rec[3] - 30];
    for (const [r, ph, lb] of [[r1, phiR, 's'], [r2, phiR + 0.08, 's′']]) { A.rect(c, r[0], r[1], r[2], r[3], 4, A.alpha(P.out, 0.12), P.out, 1.2); S.adaIn(c, r, S.poseAt(C, ph), g.mf, { floor: 4, ground: false }); A.lab(c, k, lb, r[0] + 9, r[1] + 11, { px: 10.5, weight: 700, color: P.out, halo: false }); }
    // дискриминатор и награда стиля
    S.box(c, k, A, P, B.D, 'дискриминатор D(s, s′)', train ? 'учится: записи 1, Ада −1' : `оценка перехода Ады: D = ${A.fmt(d, 2)}`, P.spr, true);
    // сети: дискриминатор (входы s и s′, скрытый слой, одна оценка) и политика (состояние и задача → действие)
    const net = (cx, cy, col, out, a) => { const L = [[-46, [-12, -4, 4, 12]], [0, [-15, -7.5, 0, 7.5, 15]], [46, out]];
      for (let i = 0; i < 2; i++) for (const y1 of L[i][1]) for (const y2 of L[i + 1][1]) A.line(c, [[cx + L[i][0], cy + y1], [cx + L[i + 1][0], cy + y2]], A.alpha(col, a), 1);
      for (const [x, ys] of L) for (const y of ys) A.circle(c, cx + x, cy + y, 3.2, P.surf, col, 1.3); };
    if (!n) net(B.D[0] + B.D[2] / 2, B.D[1] + B.D[3] / 2 + 3, P.spr, [0], train ? 0.5 : 0.28);
    S.bar(c, k, A, P, B.sty, rs, P.spr, train ? 'награда стиля: D учится' : `награда стиля: ${A.fmt(rs, 2)}`);
    A.lab(c, k, 'max[0, 1 − 0,25 (D − 1)²]', B.sty[0] + B.sty[2] / 2, B.sty[1] + B.sty[3] + 13, { px: 10, color: P.ink3, halo: false });
    // Ада в физике, политика, задача
    S.box(c, k, A, P, B.sim, 'Ада в физике', null, P.mot, false);
    S.adaIn(c, [B.sim[0], B.sim[1] + 22, B.sim[2], B.sim[3] - 24], S.poseAt(C, phiA), g.ms, { floor: 6, color: P.mot });
    S.box(c, k, A, P, B.pol, 'политика π(a | s, g)', 'без фазы и выбора записи', P.mot, true);
    if (!n) net(B.pol[0] + B.pol[2] / 2, B.pol[1] + B.pol[3] / 2 + 1, P.mot, [-6, 6], 0.3);
    S.box(c, k, A, P, B.task, n ? 'задача g' : 'задача g', n ? 'скорость' : 'скорость по команде', P.out, false);
    // потоки переходов в D: бегущие пары плашек
    const tok = (a, b2, col, sft) => { const q = ((u * 0.8 + sft) % 1); const x = a[0] + (b2[0] - a[0]) * q, y = a[1] + (b2[1] - a[1]) * q; A.rect(c, x - 11, y - 5, 9, 10, 2, col, null); A.rect(c, x + 2, y - 5, 9, 10, 2, col, null); };
    if (n) {
      const a1 = [S.B_(B.rec)[0], S.B_(B.rec)[1] + 2], b1 = [S.T_(B.D)[0], S.T_(B.D)[1] - 2]; ar(a1, b1, P.out); tok(a1, b1, A.alpha(P.out, 0.85), 0);
      ar([S.B_(B.D)[0], S.B_(B.D)[1] + 2], [S.B_(B.D)[0], B.sty[1] - 22], P.spr);
      const py = B.pol[1] + 14; ar([B.sty[0] + 30, B.sty[1] + B.sty[3] + 22], [B.sty[0] + 30, B.pol[1] - 2], P.spr);
      ar([B.task[0] - 2, B.task[1] + B.task[3] / 2], [S.R_(B.pol)[0] + 2, B.pol[1] + B.pol[3] / 2], P.out);
      ar([S.B_(B.pol)[0] - 60, S.B_(B.pol)[1] + 2], [S.B_(B.pol)[0] - 60, B.sim[1] - 2], P.mot, 2);
      A.lab(c, k, 'действия', S.B_(B.pol)[0] - 50, (S.B_(B.pol)[1] + B.sim[1]) / 2, { px: 10.5, weight: 650, color: P.mot, halo: false, align: 'left' });
      const sy = B.sim[1] + B.sim[3] / 2, dy = B.D[1] + B.D[3] / 2;
      A.line(c, [[S.R_(B.sim)[0] + 1, sy], [355, sy], [355, dy]], P.mot, 1.6); ar([355, dy], [S.R_(B.D)[0] + 2, dy], P.mot);
      tok([355, sy], [355, dy], A.alpha(P.mot, 0.85), 0.5);
      A.lab(c, k, 'переходы Ады', 346, (S.B_(B.pol)[1] + B.sim[1]) / 2, { px: 10.5, weight: 650, color: P.mot, halo: false, align: 'right' });
      void py;
    } else {
      const a1 = [S.R_(B.rec)[0] + 2, S.R_(B.rec)[1]], b1 = [S.L_(B.D)[0] - 2, S.L_(B.D)[1]]; ar(a1, b1, P.out); tok(a1, b1, A.alpha(P.out, 0.85), 0);
      const a2 = [B.sim[0] + B.sim[2] - 20, B.sim[1] - 2], b2 = [B.D[0] + 24, B.D[1] + B.D[3] + 2]; ar(a2, b2, P.mot); tok(a2, b2, A.alpha(P.mot, 0.85), 0.5);
      A.lab(c, k, 'переходы Ады', (a2[0] + b2[0]) / 2 - 44, (a2[1] + b2[1]) / 2, { px: 10.5, weight: 650, color: P.mot, halo: false });
      ar([S.R_(B.D)[0] + 2, S.R_(B.D)[1]], [B.sty[0] - 2, B.sty[1] + B.sty[3] / 2], P.spr);
      ar([B.sty[0] + 34, B.sty[1] + B.sty[3] + 22], [S.R_(B.pol)[0] - 30, B.pol[1] - 2], P.spr);
      ar([B.task[0] - 2, B.task[1] + B.task[3] / 2], [S.R_(B.pol)[0] + 2, B.task[1] + B.task[3] / 2], P.out);
      ar([B.pol[0] - 2, B.pol[1] + B.pol[3] / 2], [S.R_(B.sim)[0] + 2, B.pol[1] + B.pol[3] / 2], P.mot, 2);
      A.lab(c, k, 'действия', (B.pol[0] + S.R_(B.sim)[0]) / 2, B.pol[1] + B.pol[3] / 2 - 12, { px: 10.5, weight: 650, color: P.mot, halo: false });
    }
    A.lab(c, k, n ? 'обучение PPO по сумме:' : 'обучение PPO по сумме: r = 0,5 · задача + 0,5 · стиль', g.sum[0], g.sum[1], { px: 10.5, weight: 700, color: P.ink2, halo: false, align: n ? 'left' : 'center' });
    if (n) A.lab(c, k, 'r = 0,5 · задача + 0,5 · стиль', g.sum[0], g.sum[1] + 15, { px: 10.5, weight: 700, color: P.ink2, halo: false, align: 'left' });
    const cc = train ? (n ? ['Дискриминатор учится: записям 1,', 'переходам Ады −1'] : ['Дискриминатор учится: переходам из записей он ставит 1,', 'переходам Ады −1, со штрафом за крутизну около записей'])
      : (n ? ['Чем ближе D к 1, тем выше', 'награда стиля; фазы нет'] : ['Чем ближе оценка D к 1, тем выше награда стиля. С каким кадром', 'записи сравнивать, не важно: фазы нет, и ритм у Ады свой']);
    A.lab(c, k, cc[0], g.cap[0], g.cap[1], { px: 12, weight: 700, color: P.ink, halo: false, align: 'left' });
    A.lab(c, k, cc[1], g.cap[0], g.cap[1] + 18, { px: 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  const WIDE = { narrow: false, mf: 30, ms: 62,
    b: { rec: [16, 14, 230, 104], D: [300, 14, 200, 104], sty: [552, 54, 152, 18], sim: [16, 160, 230, 120], pol: [300, 172, 200, 90], task: [552, 172, 152, 90] }, sum: [400, 292], cap: [16, 340] };
  const NARROW = { narrow: true, mf: 28, ms: 66,
    b: { rec: [14, 12, 336, 96], D: [14, 136, 336, 76], sty: [44, 256, 276, 16], pol: [14, 318, 210, 76], task: [234, 318, 116, 76], sim: [14, 440, 336, 118] }, sum: [14, 584], cap: [14, 632] };
  Anim.add('amp', {
    W: 720, H: 380, start: 1.5, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 670, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   1. Лаборатория: ретаргетинг человек → Ада. Две сцены рядом, движение идёт по кругу; запись, способ переноса
   и длины звеньев Ады открываются по миссиям; метрики — под сценами. Для медленных движений (присед, махи)
   на сцене Ады — центр масс и опора.
   ===================================================================== */
const Retarget = (() => {
  const E = L62, K = HeroKit, NAME = { copy: 'углы как есть', clamp: 'углы в пределах', fix: 'точки, пределы и пол' };
  const st = { motion: 'walk', method: 'copy', L1: E.ADA.L1, L2: E.ADA.L2, phi: 0, shown: false, hold: false, cache: {} };   // hold — остановить движение (для снимков)
  let ctl = null;
  const adaBody = () => Object.assign({}, E.ADA, { L1: st.L1, L2: st.L2 });
  const key = () => `${st.motion}|${st.method}|${st.L1.toFixed(3)}|${st.L2.toFixed(3)}`;
  /** Запись человека, перенос и метрики — в памяти по ключу. */
  function data() {
    const k = key(); if (st.cache[k]) return st.cache[k];
    const H = E.clipOf(E.HUMAN, st.motion), R = E.retarget(H, st.method, adaBody()), M = E.rtMetrics(R);
    return (st.cache[k] = { H, R, M });
  }
  const W = 320, Hh = 300, SC = 105, FLOOR = 262;
  function drawOne(cv, who) {
    const { c, k } = K.fit(cv, W, Hh), P = pal(), d = data(), sh = k > 1.45;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, Hh);
    const N = d.H.N, kf = Math.floor(st.phi * N) % N, B = who === 'human' ? E.HUMAN : d.R.B;
    const f = who === 'human' ? d.H.frames[kf] : d.R.frames[kf];
    const pose = { x: 0, y: f.y, th: f.th, q: f.q, arm: f.arm };
    const X = (x) => W * 0.5 + x * SC, Y = (y) => FLOOR - y * SC;
    // пол: отметки бегут назад вместе с тазом записи (ходьба)
    Fig.floor(c, k, (x) => X(x - ((f.x % 1) + 1) % 1), Y, W, Hh, 0);
    if (who === 'human') Fig.human(c, X, Y, pose);
    else if (!st.shown) { K.label(c, k, 'нажми кнопку миссии,', W / 2, FLOOR / 2 + 10, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg }); K.label(c, k, 'и Ада повторит запись', W / 2, FLOOR / 2 + 10 + 18 * Math.max(1, k), { px: 12, weight: 700, color: P.ink2, haloColor: P.bg }); }
    else {
      const Pw = E.fk(B, pose), ov = E.overLimits(B, f.q), bad = []; ov.forEach((v, j) => { if (v > 1e-6) bad.push(j); });
      const mL = E.soleMin(Pw, 0), mR = E.soleMin(Pw, 1);
      // центр масс и опора — для медленных движений
      if (!E.MOTIONS[st.motion].twoLeg) {
        const cm = E.comOf(B, pose, Pw), sup = E.supportOf(Pw), out = E.comOut(B, pose, Pw);
        if (sup) { c.strokeStyle = Math.abs(out) > 0.005 ? P.bad : P.good; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(X(sup[0]), Y(0) + 3); c.lineTo(X(sup[1]), Y(0) + 3); c.stroke(); }
        c.setLineDash([3, 3]); c.strokeStyle = P.hy; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(cm[0]), Y(cm[1])); c.lineTo(X(cm[0]), Y(0)); c.stroke(); c.setLineDash([]);
        Fig.ada(c, X, Y, pose, { badJoints: bad, badFeet: [mL < -0.004, mR < -0.004] }, B);
        c.beginPath(); c.arc(X(cm[0]), Y(cm[1]), 5.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.hy; c.stroke();
        c.beginPath(); c.moveTo(X(cm[0]) - 5.5, Y(cm[1])); c.lineTo(X(cm[0]) + 5.5, Y(cm[1])); c.moveTo(X(cm[0]), Y(cm[1]) - 5.5); c.lineTo(X(cm[0]), Y(cm[1]) + 5.5); c.stroke();
        const txt = Math.abs(out) <= 0.005 ? 'центр масс над опорой' : out > 0 ? `центр масс впереди опоры на ${fmt(out * 100, 1)} см` : `центр масс позади опоры на ${fmt(-out * 100, 1)} см`;
        const txtS = Math.abs(out) <= 0.005 ? 'над опорой' : `${out > 0 ? 'впереди' : 'позади'} опоры: ${fmt(Math.abs(out) * 100, 1)} см`;
        K.label(c, k, sh ? txtS : txt, W / 2, FLOOR + 22, { px: 10.5, weight: 700, color: Math.abs(out) <= 0.005 ? P.good : P.bad, haloColor: P.grid });
      } else Fig.ada(c, X, Y, pose, { badJoints: bad, badFeet: [mL < -0.004, mR < -0.004] }, B);
      // зависание или проникновение — подписью у стопы
      const Ph = E.fk(E.HUMAN, { x: 0, y: f.hum.y, th: f.hum.th, q: f.hum.q, arm: f.hum.arm }), hs = Math.min(E.soleMin(Ph, 0), E.soleMin(Ph, 1)), m = Math.min(mL, mR);
      const fy = E.MOTIONS[st.motion].twoLeg ? FLOOR + 22 : FLOOR - 14;
      if (m < -0.004) K.label(c, k, `под полом ${fmt(-m * 100, 1)} см`, W / 2 + 70, fy, { px: 10.5, weight: 700, color: P.bad, haloColor: P.grid });
      else if (hs < 0.005 && m > 0.006) K.label(c, k, `над полом ${fmt(m * 100, 1)} см`, W / 2 + 70, fy, { px: 10.5, weight: 700, color: P.warn, haloColor: P.bg });
      if (bad.length) K.label(c, k, sh ? 'за пределом' : 'сустав за пределом', 8, Y(0.95), { px: 10.5, weight: 700, color: P.bad, haloColor: P.bg, align: 'left' });
    }
    const title = who === 'human' ? `человек: ${d.H.name}` : st.shown ? `Ада: ${NAME[st.method]}` : 'Ада';
    const t1 = 6 + 9 * Math.max(1, k);
    K.label(c, k, title, 8, t1, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    const sub = who === 'human' ? `рост ${fmt(E.legLen(E.HUMAN) + E.HUMAN.HC + E.HUMAN.RH, 2)} м, ноги ${fmt(E.legLen(E.HUMAN), 2)} м` : `ноги ${fmt(E.legLen(B), 2)} м: бедро ${fmt(B.L1 * 100, 0)} см, голень ${fmt(B.L2 * 100, 0)} см`;
    K.label(c, k, sub, 8, t1 + 15 * Math.max(1, k), { px: 10.5, weight: 600, color: P.ink2, align: 'left', haloColor: P.bg });
  }
  function readout(M) {
    const lim = M.overShare > 0 ? `<b>${fmt(M.overShare * 100, 0)}% кадров</b> (${[['бедро', 0], ['колено', 1], ['голеностоп', 2]].filter(([, j]) => M.overJ[j] >= 0.5).map(([nm, j]) => `${nm} до ${fmt(M.overJ[j], 0)}°`).join(', ')})` : 'ни одного кадра';
    let s = `За цикл стопа уходит под пол до <b>${fmt(M.pen, 1)} см</b>, опорная стопа поднимается над полом до <b>${fmt(M.float, 1)} см</b>, за пределами суставов — ${lim}. Ключевые точки отстают от точек человека в масштабе в среднем на ${fmt(M.kp, 1)} см.`;
    if (M.com != null) s += M.com > 0.5 ? ` Центр масс выходит за опору до <b>${fmt(M.com, 1)} см</b> ${M.comFwd ? 'вперёд, за носки' : 'назад, за пятки'} в ${fmt(M.comShare * 100, 0)}% кадров.` : ' Центр масс всё время над опорой.';
    else s += ' Равновесие при ходьбе динамическое, и статическая проверка центра масс к ней не подходит.';
    if (M.lean > 0.5) s += ` Корпус выпрямлен на ${fmt(M.lean, 0)}°.`;
    return s;
  }
  function render() {
    drawOne($('#rCvH'), 'human'); drawOne($('#rCvA'), 'ada');
    segSet('#rMotion', st.motion); segSet('#rMethod', st.method);
    const s1 = $('#rL1'); s1.value = Math.round(st.L1 * 100); syncRange(s1, `${Math.round(st.L1 * 100)} см`);
    const s2 = $('#rL2'); s2.value = Math.round(st.L2 * 100); syncRange(s2, `${Math.round(st.L2 * 100)} см`);
    setOut($('#rOut'), st.shown ? readout(data().M) : 'Нажми кнопку миссии: Ада повторит запись выбранным способом, а здесь появится, что нарушено за цикл.');
  }
  function tick(dt) { if (st.hold) return; const T = data().H.T; st.phi = (st.phi + dt / T * 0.8) % 1; drawOne($('#rCvH'), 'human'); drawOne($('#rCvA'), 'ada'); }
  function state() { return Object.assign({ motion: st.motion, method: st.method, L1: st.L1, L2: st.L2 }, data().M); }
  const api = {
    reset() { st.motion = 'walk'; st.method = 'copy'; st.L1 = E.ADA.L1; st.L2 = E.ADA.L2; st.shown = false; render(); },
    state, render, st,
    async set(motion, method) { st.motion = motion; st.method = method; st.L1 = E.ADA.L1; st.L2 = E.ADA.L2; st.shown = true; render(); if (ctl) ctl.update(); return state(); },
  };
  const missions = [
    { short: 'Углы', title: 'Скопировать углы суставов на Аду', text: 'Запись — ходьба человека: углы бедра, колена и голеностопа по фазе шага, а таз достроен так, что опорная стопа стоит на полу. Самый простой перенос — взять углы суставов как есть, а высоту таза умножить на отношение длин ног, 0,65 / 0,96. Так переносили записи DeepMimic на модель робота Atlas и ExBody на робота H1.',
      bet: { q: 'что станет с опорной стопой Ады при копировании углов?', options: ['Уйдёт под пол или повиснет над ним на несколько сантиметров: нога у Ады на треть короче', 'Почти ничего: пропорции ног у Ады человеческие, и после масштаба стопа остаётся на полу', 'Колени выйдут за пределы суставов'], answer: (r) => (r.overShare > 0 ? 2 : r.pen < 1 && r.float < 1 ? 1 : 0) },
      action: { label: 'Перенести ходьбу копированием углов', run: (X) => X.set('walk', 'copy') },
      criteria: [{ label: 'Стопа уходит под пол и поднимается над ним меньше чем на 1 см', test: (r) => r.pen < 1 && r.float < 1 }, { label: 'Ни один сустав не выходит за предел', test: (r) => r.overShare === 0 }],
      explain: (r) => `Стопа Ады уходит под пол не больше чем на ${fmt(r.pen, 1)} см, суставы в пределах, а ключевые точки отстают от точек человека в масштабе в среднем на ${fmt(r.kp, 1)} см. Бедро и голень у Ады одной длины, почти как у человека (45 и 43 см), поэтому общий масштаб длины ноги сохраняет и положение стоп. Для ходьбы копирование углов работает. Посмотрим на движение, которому мешают пределы суставов Ады.` },
    { short: 'Присед', title: 'Присед: куда не сгибается бедро Ады', text: 'Человек приседает, не отрывая пяток от пола. В самой глубокой точке приседа бедро у него почти горизонтально, корпус наклонён вперёд на 43°, и бедро согнуто на 123°. Бедро Ады сгибается вперёд только до 86°. Перенесём присед тем же копированием углов.',
      bet: { q: 'что нарушится при копировании углов приседа?', options: ['Ничего: на ходьбе же сработало', 'Бедро Ады выйдет за предел больше чем на 30°: такую позу ей не принять', 'Только контакт с полом'], answer: (r) => (r.overJ[0] > 30 ? 1 : r.pen > 1 ? 2 : 0) },
      action: { label: 'Перенести присед копированием углов', run: (X) => X.set('squat', 'copy') },
      criteria: [{ label: 'Бедро за пределом хотя бы в четверти кадров', test: (r) => r.overShare >= 0.25 && r.overJ[0] > 0 }],
      explain: (r) => `В ${fmt(r.overShare * 100, 0)}% кадров бедро Ады за пределом, до ${fmt(r.overJ[0], 0)}°: на сцене такой сустав отмечен красным кольцом. Стопы при этом стоят на полу, а центр масс над ними. Пропорции здесь ни при чём: поза человека просто недоступна телу Ады.` },
    { short: 'Пределы', title: 'Обрезать углы по пределам суставов', text: 'Второй способ: те же углы, но каждый обрезан по пределу сустава Ады, а таз опущен так, чтобы стопа стояла на полу. Каждую такую позу Ада принять может. Присед медленный, поэтому устоит Ада, только если центр масс всё время остаётся над стопами. На сцене центр масс отмечен кружком, а опора — отрезком пола под стопами.',
      bet: { q: 'устоит ли Ада в приседе с обрезанными углами?', options: ['Да: суставы в пределах, стопы на полу', 'Нет: бедро не догибается, голень наклоняется сильнее, Ада встаёт на носки, и центр масс уходит за опору', 'Устоит, только присед выйдет мельче'], answer: (r) => (r.com > 1 ? 1 : 2) },
      action: { label: 'Перенести присед с обрезкой углов', run: (X) => X.set('squat', 'clamp') },
      criteria: [{ label: 'Ни одного сустава за пределом', test: (r) => r.overShare === 0 }, { label: 'Центр масс выходит за опору больше чем на 2 см', test: (r) => r.com > 2 }],
      explain: (r) => `Суставы в пределах, но бедро остановилось на 86°, а колено и голеностоп остались человеческими. Голень наклонилась вперёд сильнее, Ада поднялась на носки, и центр масс ушёл ${r.comFwd ? 'вперёд, за носки' : 'назад, за пятки'}, до ${fmt(r.com, 1)} см в ${fmt(r.comShare * 100, 0)}% кадров. Ключевые точки отстают от человека на ${fmt(r.kp, 1)} см. Обрезка сохраняет углы, но меняет то, что важно для равновесия: где стоят стопы и где центр масс.` },
    { short: 'Точки', title: 'Подогнать ключевые точки', text: 'Третий способ, как в H2O: сохранять не углы, а положения точек. Голеностопы встают туда же, где они у человека в масштабе, стопы сохраняют наклон, а углы бедра и колена находит обратная кинематика ноги из урока 0.3. Бедру Ады не хватает подвижности, поэтому корпус наклоняется меньше, чем у человека: так бедро остаётся в пределах, а колени и стопы стоят на своих местах.',
      bet: { q: 'устоит ли Ада, когда колени и стопы на местах?', options: ['Да: точки как у человека, суставы в пределах', 'Нет: корпус выпрямился, и центр масс ушёл назад за пятки', 'Нет: стопы ушли под пол'], answer: (r) => (r.com > 1 ? 1 : r.pen > 1 ? 2 : 0) },
      action: { label: 'Перенести присед по ключевым точкам', run: (X) => X.set('squat', 'fix') },
      criteria: [{ label: 'Ключевые точки ближе к человеку, чем при обрезке углов', test: (r, s, ctx) => r.kp < ctx.results[2].kp }, { label: 'Центр масс снова выходит за опору', test: (r) => r.com > 1 }],
      explain: (r, ctx) => `Ключевые точки отстают от человека всего на ${fmt(r.kp, 1)} см против ${fmt(ctx.results[2].kp, 1)} при обрезке углов, суставы в пределах, стопы стоят ровно. Но корпус пришлось выпрямить на ${fmt(r.lean, 0)}°, и центр масс ушёл ${r.comFwd ? 'вперёд, за носки' : 'назад, за пятки'}, до ${fmt(r.com, 1)} см: в физике Ада упала бы. Каждая правка поз исправляет одно нарушение и создаёт другое, а равновесие не проверяет ни одна из них.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй запись, способ переноса и длины бедра и голени Ады. Найди пропорции ног, при которых копирование углов ходьбы уводит стопу под пол больше чем на 2 см, и посмотри, что с такой Адой делает подгонка ключевых точек.', final: true, controls: ['motion', 'method', 'l1', 'l2'] },
  ];
  function init() {
    segBind('#rMotion', (v) => { st.motion = v; st.phi = 0; render(); if (ctl) ctl.update(); });
    segBind('#rMethod', (v) => { st.method = v; render(); if (ctl) ctl.update(); });
    $('#rL1').addEventListener('input', (e) => { st.L1 = +e.target.value / 100; render(); if (ctl) ctl.update(); });
    $('#rL2').addEventListener('input', (e) => { st.L2 = +e.target.value / 100; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#rMis', missions, api, { controls: { motion: '#wrapRMotion', method: '#wrapRMethod', l1: '#wrapRL1', l2: '#wrapRL2' }, scene: '#rCvA', onStep: (i) => { if (missions[i].final && !st.shown) { st.shown = true; render(); } } });
    render(); redrawOn(render);
    K.loop($('#rCvA'), (dt) => tick(dt));
    return ctl;
  }
  return { init, api, st, data, missions, NAME };
})();

/* =====================================================================
   Общее для лабораторий 2 и 3: обучение идёт кусками между кадрами с полоской прогресса, результаты — в памяти
   ===================================================================== */
const Store = (() => {
  const E = L62, cache = {}, pending = {};
  let clips = null;
  function clipsOf() { if (!clips) { const A = E.adaClip('walk'), B = E.swapLegs(A); clips = { A, B, M: E.meanClip(A, B) }; } return clips; }
  /** Обучение по ключу: генератор train кусками; onIter(h) — каждая итерация (не чаще раза в 120 мс). */
  async function train(key, mode, cfg, onIter) {
    if (cache[key]) return cache[key];
    if (pending[key]) { await pending[key]; return cache[key]; }
    pending[key] = (async () => {
      let last = 0;
      const R = await runChunked(E.train(mode, cfg), (h) => { const now = performance.now(); if (onIter && (now - last > 120 || h.it === E.CFG.ITERS)) { last = now; onIter(h); } }, 14);
      R.evals = {}; for (const vf of [0.5, 0.75, 1, 1.25, 1.5]) R.evals[vf] = E.evaluate(R, vf);
      cache[key] = R;
    })();
    try { await pending[key]; } finally { delete pending[key]; }
    return cache[key];
  }
  const get = (key) => cache[key] || null;
  const evalAt = (R, vf) => R.evals[vf] || (R.evals[vf] = E.evaluate(R, vf));
  return { train, get, evalAt, clipsOf, cache };
})();
/** Сцена с идущей Адой: камера следует за тазом, призрак — кадр записи C по её часам с той же точки старта. */
function drawWalkScene(cv, frames, idx, C, opt) {
  opt = opt || {}; const E = L62, K = HeroKit, L = fitLayout(cv, [640, 300], [360, 280]), { c, k, W, H } = L, P = pal(), SC = 120;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  const f = frames ? frames[Math.min(idx, frames.length - 1)] : null, camX = f ? f.x : 0, FLOOR = H - 44;
  const X = (x) => W * 0.42 + (x - camX) * SC, Y = (y) => FLOOR - y * SC;
  Fig.floor(c, k, X, Y, W, H, camX, { labels: true });
  const t1 = 6 + 9 * Math.max(1, k);
  if (!frames) { K.label(c, k, opt.empty || 'нажми кнопку миссии', W / 2, FLOOR / 2 + 10, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.bg }); return L; }
  if (C && opt.ghost !== false) {
    const r = E.refAt(C, f.t * C.f, f.t, 0, 0);
    Fig.ada(c, X, Y, { x: r.xw, y: r.y, th: r.th, q: r.q, arm: r.arm }, { ghost: true });
  }
  Fig.ada(c, X, Y, { x: f.x, y: f.y, th: f.th, q: f.q, arm: f.arm }, { color: opt.color });
  if (f.fell) K.cross(c, X(f.x) + 34, Y(0.9), 9, P.bad, 3);
  if (opt.title) K.label(c, k, L.narrow && opt.titleShort ? opt.titleShort : opt.title, 8, t1, { px: 12, weight: 700, color: opt.color || P.ink, align: 'left', haloColor: P.bg });
  if (opt.sub) K.label(c, k, opt.sub, 8, t1 + 16 * Math.max(1, k), { px: 11, weight: 600, color: P.ink2, align: 'left', haloColor: P.bg });
  return L;
}

/* =====================================================================
   2. Лаборатория: трекинг против AMP — одна семья политик, две награды
   ===================================================================== */
const Track = (() => {
  const E = L62, K = HeroKit, KINDS = ['track', 'amp'], NAME = { track: 'трекер записи', amp: 'AMP' };
  const st = { pol: 'track', vf: 1, view: 'curve', busy: false, prog: 0, msg: '', t: 0, hist: { track: [], amp: [] } };
  let ctl = null;
  const C = () => Store.clipsOf().A;
  const res = (kind) => Store.get('pol.' + kind);
  const ev = (kind, vf) => { const R = res(kind); return R ? Store.evalAt(R, vf == null ? st.vf : vf) : null; };
  const colorOf = (kind, P) => (kind === 'track' ? P.cl : P.e2e);
  /** Частота цикла шагов: у трекера — частота записи, у AMP — f0 + f1·(команда − скорость записи). */
  const freqOf = (kind, vf) => { const R = res(kind); if (!R || kind === 'track') return C().f; return R.p[E.IDX.f0] + R.p[E.IDX.f1] * (C().v * vf - C().v); };
  function drawScene() {
    const cv = $('#tCv'), e = ev(st.pol), P = pal();
    if (!e) { drawWalkScene(cv, null, 0, null, { empty: st.busy ? 'Ада учится…' : (res('track') || res('amp') ? 'выбери политику' : 'нажми кнопку миссии: обучение в браузере') }); return; }
    const idx = Math.floor((st.t * E.FPS) % e.frames.length), f = e.frames[idx];
    drawWalkScene(cv, e.frames, idx, C(), { title: `${NAME[st.pol]}: команда ${fmt(e.vcmd, 2)} м/с`, titleShort: `${NAME[st.pol]}: ${fmt(e.vcmd, 2)} м/с`, color: colorOf(st.pol, P), sub: `t = ${fmt(f.t, 1)} с · скорость ${fmt(f.vx, 2)} м/с${f.fell ? ' · упала' : ''}` });
  }
  function legend(c, k, x, y, P, extra) {
    let lx = x; c.font = `600 ${10.5 * k}px Inter, system-ui, sans-serif`;
    for (const kind of KINDS) { c.fillStyle = colorOf(kind, P); c.fillRect(lx, y - 5, 10, 10); K.label(c, k, NAME[kind], lx + 14, y, { px: 10.5, color: P.ink2, align: 'left', halo: false }); lx += 14 + c.measureText(NAME[kind]).width + 16; }
    if (extra) { c.fillStyle = P.bad; c.beginPath(); c.arc(lx + 5, y, 3, 0, 7); c.fill(); K.label(c, k, extra, lx + 13, y, { px: 10.5, color: P.ink2, align: 'left', halo: false }); }
  }
  function drawChart() {
    const cv = $('#tChart'), L = fitLayout(cv, [640, 220], [380, 270]), { c, k, narrow } = L, Wc = L.W, Hc = L.H, P = pal();
    const Lm = narrow ? 40 : 46, R = 14, T = 44, Bm = narrow ? 46 : 40, gw = Wc - Lm - R, gh = Hc - T - Bm;
    c.fillStyle = P.surf; c.fillRect(0, 0, Wc, Hc);
    if (st.view === 'curve') {
      const X = (i) => Lm + gw * i / E.CFG.ITERS, Y = (v) => T + gh * (1 - v);
      for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(Lm, Y(v)); c.lineTo(Wc - R, Y(v)); c.stroke(); K.label(c, k, fmt(v, 2), Lm - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
      for (const i of [0, 25, 50, 75, 100]) K.label(c, k, String(i), X(i), Hc - Bm + 13, { px: 10, color: P.ink3, halo: false });
      K.label(c, k, narrow ? 'итерация обучения' : 'итерация обучения (33 эпизода по 2,4 с в каждой)', Lm + gw / 2, Hc - 12, { px: 10.5, color: P.ink3, halo: false });
      K.label(c, k, narrow ? 'награда за шаг, 0…1' : 'средняя награда за шаг в проверке, 0…1', Lm, 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
      let any = false;
      for (const kind of KINDS) { const h = st.hist[kind]; if (!h.length) continue; any = true; c.strokeStyle = colorOf(kind, P); c.lineWidth = 2; c.beginPath(); h.forEach((p, i) => (i ? c.lineTo(X(p.it), Y(p.ret)) : c.moveTo(X(p.it), Y(p.ret)))); c.stroke(); for (const p of h) if (p.fell != null) { c.fillStyle = P.bad; c.beginPath(); c.arc(X(p.it), Y(p.ret), 2.4, 0, 7); c.fill(); } }
      if (!any) K.label(c, k, narrow ? 'кривые появятся при обучении' : 'кривые обучения появятся, когда нажмёшь кнопку миссии', Lm + gw / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf });
      legend(c, k, Lm + 4, 30, P, narrow ? 'падение' : 'проверка с падением');
    } else {
      const VF = [0.5, 0.75, 1, 1.25, 1.5], vmax = C().v * 1.6, gwid = gw / VF.length, bw = Math.min(26, gwid / 3.4);
      const Y = (v) => T + gh * (1 - Math.max(0, Math.min(1, v / vmax)));
      for (const v of [0, 0.4, 0.8, 1.2]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(Lm, Y(v)); c.lineTo(Wc - R, Y(v)); c.stroke(); K.label(c, k, fmt(v, 1), Lm - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
      VF.forEach((vf, gi) => {
        const gx = Lm + gwid * gi, vcmd = C().v * vf;
        c.setLineDash([3, 3]); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.beginPath(); c.moveTo(gx + 6, Y(vcmd)); c.lineTo(gx + gwid - 6, Y(vcmd)); c.stroke(); c.setLineDash([]);
        KINDS.forEach((kind, j) => { const e = ev(kind, vf); if (!e) return; const x = gx + gwid / 2 + (j - 0.5) * (bw + 5) - bw / 2, v = e.vMean; c.fillStyle = colorOf(kind, P); c.globalAlpha = e.fell ? 0.35 : 0.9; c.fillRect(x, Y(v), bw, Y(0) - Y(v)); c.globalAlpha = 1; if (!narrow || e.fell) K.label(c, k, e.fell ? (narrow ? '×' : 'упала') : fmt(v, 2), x + bw / 2, Y(v) - 8, { px: 10, weight: 650, color: e.fell ? P.bad : P.ink2, haloColor: P.surf }); });
        K.label(c, k, narrow ? `${fmt(vf, 2)}×` : `${fmt(vf, 2)}× · ${fmt(vcmd, 2)} м/с`, gx + gwid / 2, Hc - Bm + 13, { px: 10, color: P.ink2, halo: false });
      });
      K.label(c, k, narrow ? 'скорость, м/с; пунктир — команда' : 'средняя скорость за 4 с, м/с; пунктир — сама команда', Lm, 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
      K.label(c, k, narrow ? 'команда: доля скорости записи' : 'команда скорости: доля от скорости записи и в м/с', Lm + gw / 2, Hc - 12, { px: 10.5, color: P.ink3, halo: false });
      legend(c, k, Lm + 4, 30, P, null);
    }
  }
  function render() {
    drawScene(); drawChart(); segSet('#tPol', st.pol); segSet('#tView', st.view);
    const sl = $('#tV'); sl.value = Math.round(st.vf * 100); syncRange(sl, `${fmt(st.vf, 2)}× · ${fmt(C().v * st.vf, 2)} м/с`);
    const pg = $('#tProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#tOut'), `${st.msg} ${Math.round(st.prog * 100)}%.`); return; }
    const parts = [];
    for (const kind of KINDS) { const e = ev(kind); if (!e) continue; parts.push(`<b>${NAME[kind]}</b> при команде ${fmt(e.vcmd, 2)} м/с: скорость ${fmt(e.vMean, 2)} м/с, за 4 с ${fmt(e.dist, 2)} м${e.fell ? `, упала на ${fmt(e.fellAt * E.DT, 1)} с` : ''}; цикл шага ${fmt(freqOf(kind, st.vf), 2)} Гц; ошибка позы после выравнивания ${fmt(e.alignErr, 1)}°${kind === 'amp' ? `; награда стиля ${fmt(e.retS, 2)}` : ''}.`); }
    setOut($('#tOut'), parts.join(' ') || 'Политики ещё не обучены.');
  }
  function progress(kind) { return (h) => { st.prog = h.it / E.CFG.ITERS; st.msg = `${kind === 'amp' ? 'AMP' : 'Трекер'} учится в браузере (итерация ${h.it} из ${E.CFG.ITERS}):`; st.hist[kind] = st.hist[kind].concat([{ it: h.it, ret: h.ret, fell: h.fell }]); render(); }; }
  async function ensure(kind) {
    if (res(kind)) return res(kind);
    st.busy = true; st.prog = 0; st.hist[kind] = []; render();
    try { await Store.train('pol.' + kind, { kind, clips: [C()] }, {}, progress(kind)); } finally { st.busy = false; }
    render(); if (ctl) ctl.update(); return res(kind);
  }
  function state() { return { pol: st.pol, vf: st.vf, busy: st.busy, track: ev('track'), amp: ev('amp') }; }
  const api = {
    reset() { st.pol = 'track'; st.vf = 1; st.view = 'curve'; render(); },
    state, render, st, ensure, freqOf,
    async tracker() { st.pol = 'track'; st.vf = 1; st.view = 'curve'; const R = await ensure('track'); return { R, e: R.evals[1], f: C().f, v: C().v }; },
    async amp() { st.pol = 'amp'; st.vf = 1; st.view = 'curve'; const R = await ensure('amp'), T = await ensure('track'); return { R, e: R.evals[1], t: T.evals[1], f0: freqOf('amp', 1), f: C().f, v: C().v, dacc: R.hist[R.hist.length - 1].dacc }; },
    async speeds() { const T = await ensure('track'), A = await ensure('amp'); st.view = 'speed'; st.vf = 1.25; st.pol = 'amp'; render(); const g = (R) => [0.75, 1, 1.25].map((vf) => R.evals[vf]); return { t: g(T), a: g(A), v: C().v, f: C().f, fa: [0.75, 1, 1.25].map((vf) => freqOf('amp', vf)), tSpan: T.evals[1.25].vMean - T.evals[0.75].vMean, aSpan: A.evals[1.25].vMean - A.evals[0.75].vMean }; },
  };
  const missions = [
    { short: 'Трекер', title: 'Обучить трекер по записи ходьбы', text: 'Запись — ходьба человека, перенесённая на Аду третьим способом из лаборатории 1. Награда устроена как в DeepMimic: близость углов и скоростей суставов, положений стоп и таза к кадру записи в той же фазе плюс награда за скорость по команде. Фаза идёт по часам записи и подаётся политике. Эпизод начинается из случайного кадра записи, а падение его обрывает. Обучение идёт прямо в браузере и занимает несколько секунд.',
      bet: { q: 'пойдёт ли Ада, если в награде нет слагаемого «не падай»?', options: ['Нет: за равновесие никто не платит, нужно отдельное слагаемое', 'Да: упавшая Ада далека от кадров записи, а падение обрывает эпизод, поэтому держать равновесие выгодно и так', 'Пойдёт, но на месте'], answer: (r) => (r.e.fell ? 0 : r.e.dist >= 2 ? 1 : 2) },
      action: { label: 'Обучить трекер', run: (X) => X.tracker() },
      criteria: [{ label: 'За 4 с проверки проходит не меньше 2 м и не падает', test: (r) => r.e.dist >= 2 && !r.e.fell }, { label: 'Ошибка позы после выравнивания меньше 12°', test: (r) => r.e.alignErr < 12 }],
      explain: (r) => `Трекер прошёл ${fmt(r.e.dist, 2)} м за 4 с со средней скоростью ${fmt(r.e.vMean, 2)} м/с, а запись идёт ${fmt(r.v, 2)} м/с. Ошибка позы после выравнивания по фазе — ${fmt(r.e.alignErr, 1)}°: суставы отстают от целевых углов на время отклика ПД-регулятора. Призрак на сцене показывает кадр записи по её часам, и Ада держится рядом с ним. Награда за положение таза и стоп считается в мировых координатах, поэтому она тянет Аду к записи и по месту, и по времени.` },
    { short: 'AMP', title: 'Обучить ту же политику с дискриминатором', text: 'Параметры политики и запись те же, а награда другая. Дискриминатор учится отличать переходы между соседними кадрами записи от переходов Ады, а политика получает тем больше, чем ближе его оценка к «запись». Часов записи у политики нет: частоту шагов она выбирает сама, начиная с 1 Гц, и может менять её вместе с командой. Награда за скорость по команде та же, что у трекера.',
      bet: { q: 'будет ли Ада шагать в такт записи?', options: ['Да: дискриминатор не пропустит другой темп', 'Нет: ритм у неё свой, походка похожа на записанную, а ошибка позы выше, чем у трекера', 'Не пойдёт вовсе: без фазы ей не на что опереться'], answer: (r) => (r.e.fell || r.e.dist < 1 ? 2 : Math.abs(r.f0 - r.f) > 0.03 ? 1 : 0) },
      action: { label: 'Обучить AMP', run: (X) => X.amp() },
      criteria: [{ label: 'Идёт: не меньше 2 м за 4 с без падения', test: (r) => r.e.dist >= 2 && !r.e.fell }, { label: 'Цикл шага отличается от записи хотя бы на 0,03 Гц', test: (r) => Math.abs(r.f0 - r.f) > 0.03 }, { label: 'Ошибка позы после выравнивания выше, чем у трекера', test: (r) => r.e.alignErr > r.t.alignErr }],
      explain: (r) => `Политика AMP прошла ${fmt(r.e.dist, 2)} м со скоростью ${fmt(r.e.vMean, 2)} м/с. Цикл шага у неё ${fmt(r.f0, 2)} Гц против ${fmt(r.f, 2)} Гц у записи, поэтому призрак записи то обгоняет её, то отстаёт, а походка остаётся похожей. Ошибка позы после выравнивания ${fmt(r.e.alignErr, 1)}° против ${fmt(r.t.alignErr, 1)}° у трекера; в статье AMP трекинг тоже точнее на ходьбе, 0,018 против 0,030 м. Награда стиля в проверке ${fmt(r.e.retS, 2)}. Дискриминатор к концу обучения узнаёт записи в ${fmt(r.dacc.accR * 100, 0)}% случаев, а переходы Ады в ${fmt(r.dacc.accF * 100, 0)}%: отличать их он умеет, но его оценка всё равно подсказывает политике, куда двигаться.` },
    { short: 'Скорость', title: 'Другая команда скорости', text: 'Обе политики учились при случайных командах от 0,5 до 1,5 скорости записи. Проверим их при 0,75, 1 и 1,25 скорости записи. Сводка покажет среднюю скорость каждой политики при каждой команде.',
      bet: { q: 'кто ближе к команде 1,25× скорости записи?', options: ['Трекер: в его награде задача скорости весит 0,3', 'AMP: награда стиля не привязана к темпу записи, и шагать чаще ей не мешает', 'Одинаково: задача у них одна'], answer: (r) => { const d = r.a[2].vMean - r.t[2].vMean; return Math.abs(d) < 0.02 ? 2 : d > 0 ? 1 : 0; } },
      action: { label: 'Прогнать обе политики при трёх командах', run: (X) => X.speeds() },
      criteria: [{ label: 'При 1,25× AMP быстрее трекера и не падает', test: (r) => r.a[2].vMean > r.t[2].vMean && !r.a[2].fell }, { label: 'AMP шагает чаще при большей команде', test: (r) => r.fa[2] > r.fa[1] && r.fa[1] > r.fa[0] }],
      explain: (r) => `При командах 0,75×, 1× и 1,25× трекер идёт ${r.t.map((e) => (e.fell ? 'падает' : fmt(e.vMean, 2))).join(', ')} м/с, AMP — ${r.a.map((e) => (e.fell ? 'падает' : fmt(e.vMean, 2))).join(', ')} м/с, а сами команды — ${[0.75, 1, 1.25].map((vf) => fmt(r.v * vf, 2)).join(', ')} м/с. Цикл шага трекера всегда ${fmt(r.f, 2)} Гц: его часы — часы записи, разогнаться он может только длинным шагом, а награда за положение таза по часам записи тянет его обратно. Политика AMP научилась шагать чаще при большей команде: ${r.fa.map((x) => fmt(x, 2)).join(', ')} Гц. Далеко от скорости записи не уйдёт и она: таких переходов в записи нет, и в статье AMP политика по одним записям ходьбы на бег не переходила.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй команду скорости и переключай политику; сводку можно показать кривыми обучения или скоростями. Найди команду, при которой одна из политик падает.', final: true, controls: ['pol', 'v', 'view'] },
  ];
  function init() {
    segBind('#tPol', (v) => { st.pol = v; render(); });
    segBind('#tView', (v) => { st.view = v; render(); });
    $('#tV').addEventListener('input', (e) => { st.vf = +e.target.value / 100; render(); });
    ctl = mountMissions('#tMis', missions, api, { controls: { pol: '#wrapTPol', v: '#wrapTV', view: '#wrapTView' }, scene: '#tCv' });
    render(); redrawOn(render);
    K.loop($('#tCv'), (dt) => { if (!st.hold) st.t += dt; if (!st.busy) drawScene(); });
    return ctl;
  }
  return { init, api, st, missions };
})();

/* =====================================================================
   3. Лаборатория: смесь записей — среднее двух записей ходьбы (с левой и с правой ноги) и два трекера
   ===================================================================== */
const Mix = (() => {
  const E = L62, K = HeroKit;
  const st = { off: 0, t: 0, busy: false, prog: 0, msg: '', mode: 'kin' };
  let ctl = null;
  const clips = () => Store.clipsOf();
  const res = (key) => Store.get('mix.' + key);
  const SC = 105;
  const stats = () => E.mixStats(clips().A, st.off);
  /** Средняя поза двух кадров: углы, наклон корпуса и высота таза — пополам. */
  function meanPose(a, b) { const q = new Float64Array(E.NJ), arm = new Float64Array(4); for (let j = 0; j < E.NJ; j++) q[j] = (a.q[j] + b.q[j]) / 2; for (let j = 0; j < 4; j++) arm[j] = (a.arm[j] + b.arm[j]) / 2; return { x: 0, y: (a.y + b.y) / 2, th: (a.th + b.th) / 2, q, arm }; }
  const poseOfClip = (f) => ({ x: 0, y: f.y, th: f.th, q: Float64Array.from(f.q), arm: Float64Array.from(f.arm) });
  function drawKin(cv) {
    const L = fitLayout(cv, [640, 300], [360, 300]), { c, k, W, H, narrow } = L, P = pal(), A = clips().A, phi = (st.t / A.T) % 1, FLOOR = H - 46;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const Y = (y) => FLOOR - y * SC, cols = [W / 6, W / 2, W * 5 / 6], fa = E.clipAt(A, phi), fb = E.clipAt(A, phi + st.off);
    Fig.floor(c, k, (x) => x * SC + W / 2, Y, W, H, 0);
    const poses = [[poseOfClip(fa), narrow ? 'A' : 'запись A', P.cl], [poseOfClip(fb), narrow ? (st.off < 0.01 ? 'B = A' : `B: ${fmt(st.off * 100, 0)}%`) : (st.off < 0.01 ? 'запись B = A' : `запись B: сдвиг ${fmt(st.off * 100, 0)}%`), P.cl], [meanPose(fa, fb), narrow ? 'среднее' : 'среднее A и B', P.e2e]];
    poses.forEach(([pose, title, col], i) => {
      const X = (x) => cols[i] + x * SC, Pw = E.fk(A.B, pose), mL = E.soleMin(Pw, 0), mR = E.soleMin(Pw, 1);
      Fig.ada(c, X, Y, pose, { color: i === 2 ? P.e2e : null, badFeet: [mL < -0.004, mR < -0.004] });
      K.label(c, k, title, cols[i], 8 + 8 * Math.max(1, k), { px: 11.5, weight: 700, color: col, haloColor: P.bg });
    });
    const S = stats();
    K.label(c, k, narrow ? `шаг среднего ${fmt(S.stride, 0)} см` : `размах шага у среднего ${fmt(S.stride, 0)} см · разница высот стоп до ${fmt(S.lift, 1)} см`, W / 2, FLOOR + 26, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.grid });
  }
  /** Призрак для трекера: кадр его записи по часам записи (у максимума — та запись, что ближе по углам). */
  function ghostFor(key, f) {
    const cl = clips(), phi = f.t * cl.A.f;
    if (key === 'mean') return poseOfClip(E.clipAt(cl.M, phi));
    const a = E.clipAt(cl.A, phi), b = E.clipAt(cl.B, phi); let ea = 0, eb = 0; for (let j = 0; j < E.NJ; j++) { ea += (f.q[j] - a.q[j]) ** 2; eb += (f.q[j] - b.q[j]) ** 2; }
    return poseOfClip(ea <= eb ? a : b);
  }
  function drawTrained(cv) {
    const L = fitLayout(cv, [640, 300], [360, 300]), { c, k, W, H, narrow } = L, P = pal(), A = clips().A, FLOOR = H - 46;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const Y = (y) => FLOOR - y * SC;
    [['mean', narrow ? 'по среднему' : 'трекер по среднему', P.e2e, W * 0.25], ['max', narrow ? 'максимум' : 'трекер: максимум по A и B', P.cl, W * 0.75]].forEach(([key, title, col, cx]) => {
      const R = res(key); const X = (x) => cx + x * SC;
      c.save(); c.beginPath(); c.rect(cx - W * 0.25, 0, W * 0.5, H); c.clip();
      if (!R) { Fig.floor(c, k, X, Y, W, H, 0); K.label(c, k, st.busy ? 'учится…' : 'ещё не обучен', cx, FLOOR / 2 + 10, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg }); c.restore(); K.label(c, k, title, cx, 8 + 8 * Math.max(1, k), { px: 11.5, weight: 700, color: col, haloColor: P.bg }); return; }
      const e = R.evals[1], idx = Math.floor((st.t * E.FPS) % e.frames.length), f = e.frames[idx];
      Fig.floor(c, k, (x) => X(x - ((f.x % 1) + 1) % 1), Y, W, H, 0);
      Fig.ada(c, X, Y, ghostFor(key, f), { ghost: true });
      Fig.ada(c, X, Y, { x: 0, y: f.y, th: f.th, q: f.q, arm: f.arm }, { color: col });
      c.restore();
      K.label(c, k, title, cx, 8 + 8 * Math.max(1, k), { px: 11.5, weight: 700, color: col, haloColor: P.bg });
      K.label(c, k, narrow ? `шаг ${fmt(e.stride, 0)} см · ${fmt(e.retI, 2)}` : `размах шага ${fmt(e.stride, 0)} см · награда за имитацию ${fmt(e.retI, 2)}`, cx, FLOOR + 26, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.grid });
    });
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
  }
  function drawScene() { const cv = $('#mCv'); if (st.mode === 'kin') drawKin(cv); else drawTrained(cv); }
  function render() {
    drawScene(); const sl = $('#mOff'); sl.value = Math.round(st.off * 100); syncRange(sl, `${fmt(st.off * 100, 0)}%`);
    segSet('#mMode', st.mode);
    const pg = $('#mProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#mOut'), `${st.msg} ${Math.round(st.prog * 100)}%.`); return; }
    const S = stats(), S0 = E.mixStats(clips().A, 0), parts = [`Среднее записей при сдвиге ${fmt(st.off * 100, 0)}%: размах шага <b>${fmt(S.stride, 0)} см</b>, разница высот стоп до ${fmt(S.lift, 1)} см (у самой записи ${fmt(S0.stride, 0)} см и ${fmt(S0.lift, 1)} см).`];
    for (const [key, name] of [['mean', 'Трекер по среднему'], ['max', 'Трекер с максимумом по A и B']]) { const R = res(key); if (R) { const e = R.evals[1]; parts.push(`${name}: ${fmt(e.dist, 2)} м за 4 с${e.fell ? ', упал' : ''}, размах шага ${fmt(e.stride, 0)} см, награда за имитацию ${fmt(e.retI, 2)}, ошибка позы ${fmt(e.alignErr, 1)}°.`); } }
    setOut($('#mOut'), parts.join(' '));
  }
  function progress(key, i, n) { return (h) => { st.prog = (i + h.it / E.CFG.ITERS) / n; st.msg = `${key === 'mean' ? 'Трекер по среднему' : 'Трекер с максимумом'} учится в браузере (итерация ${h.it} из ${E.CFG.ITERS}):`; render(); }; }
  async function ensure() {
    const todo = ['mean', 'max'].filter((k) => !res(k)); if (!todo.length) return;
    st.busy = true; st.prog = 0; render();
    try { for (let i = 0; i < todo.length; i++) { const key = todo[i], cl = clips(); await Store.train('mix.' + key, { kind: 'track', clips: key === 'mean' ? [cl.M] : [cl.A, cl.B] }, {}, progress(key, i, todo.length)); } } finally { st.busy = false; }
    render(); if (ctl) ctl.update();
  }
  function state() { const S = stats(); return { off: st.off, stride: S.stride, lift: S.lift, busy: st.busy, mode: st.mode }; }
  const api = {
    reset() { st.off = 0; st.mode = 'kin'; render(); },
    state, render, st,
    async half() { st.off = 0.5; st.mode = 'kin'; render(); if (ctl) ctl.update(); return state(); },
    async two() { await ensure(); st.mode = 'pol'; render(); const m = res('mean').evals[1], x = res('max').evals[1]; return { m, x, v: clips().A.v }; },
  };
  const missions = [
    { short: 'Среднее', title: 'Усреднить две записи ходьбы', text: 'Запись A — ходьба Ады из лаборатории 2. Запись B — та же ходьба, начатая с другой ноги: её кадры сдвинуты на полцикла. Если учить политику на среднем двух записей, как регрессию в уроке 1.3, целевым движением станет среднее A и B по кадрам. Кнопка сдвигает запись B на полцикла, а в следующей миссии появится ползунок сдвига.',
      bet: { q: 'что получится, если усреднить ходьбу, начатую с одной ноги, и ходьбу, начатую с другой?', options: ['Та же ходьба: записи одинаковые', 'Ноги вместе: шаг нулевой, обе стопы на одной высоте, а таз всё равно движется вперёд, и такого движения нет ни в одной записи', 'Ходьба вдвое медленнее'], answer: (r) => (r.stride < 10 ? 1 : 0) },
      action: { label: 'Сдвинуть запись B на полцикла', run: (X) => X.half() },
      criteria: [{ label: 'Сдвиг записи B не меньше 45% цикла', test: (r) => r.off >= 0.45 }, { label: 'Размах шага у среднего меньше 10 см', test: (r) => r.stride < 10 }],
      explain: (r) => `При сдвиге ${fmt(r.off * 100, 0)}% размах шага у среднего ${fmt(r.stride, 0)} см, стопы на одной высоте, а таз движется вперёд с той же скоростью ${fmt(Store.clipsOf().A.v, 2)} м/с: такой ходьбы не бывает. Это чайник из урока 1.3: среднее двух правильных движений само оказалось неправильным. Трекер с наградой за близость к такой записи получает цель, которой нельзя достичь.` },
    { short: 'Два трекера', title: 'Трекер по среднему против максимума по записям', text: 'Обучим два трекера, как в лаборатории 2. Первый получает награду за близость к усреднённой записи. Второй — за близость к той из двух записей, которая ближе в этом кадре, то есть максимум награды по записям, как в DeepMimic. Обучений два, это займёт несколько секунд. На сцене у каждого трекера призрак его записи.',
      bet: { q: 'что выучит трекер по усреднённой записи?', options: ['Пойдёт ногами вместе, как в записи', 'Будет шагать, хотя в записи шагов нет: физика и задача скорости не дадут идти ногами вместе, а награда за имитацию останется низкой', 'Упадёт'], answer: (r) => (r.m.fell ? 2 : r.m.stride > 20 && r.m.retI < r.x.retI - 0.1 ? 1 : 0) },
      action: { label: 'Обучить оба трекера', run: (X) => X.two() },
      controls: ['off'],
      criteria: [{ label: 'Оба идут: не меньше 2 м за 4 с без падения', test: (r) => r.m.dist >= 2 && r.x.dist >= 2 && !r.m.fell && !r.x.fell }, { label: 'Награда за имитацию у трекера по среднему ниже хотя бы на 0,1', test: (r) => r.m.retI < r.x.retI - 0.1 }],
      explain: (r) => `Трекер по среднему прошёл ${fmt(r.m.dist, 2)} м и шагает с размахом ${fmt(r.m.stride, 0)} см, хотя в его записи размах ноль. Награда за имитацию у него ${fmt(r.m.retI, 2)} против ${fmt(r.x.retI, 2)} у трекера с максимумом, а ошибка позы ${fmt(r.m.alignErr, 1)}° против ${fmt(r.x.alignErr, 1)}°. Совпасть со средним нельзя, и награда за близость к нему уже не подсказывает, как идти. Максимум по записям в каждом кадре выбирает одну запись; так DeepMimic объединял пять записей ходьбы и поворотов. AMP выбор не нужен вовсе: дискриминатор смотрит на переходы, а у записей A и B они одни и те же.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай сдвиг записи B и переключай сцену между средним записей и двумя обученными трекерами. Найди сдвиг, при котором размах шага у среднего падает вдвое.', final: true, controls: ['off', 'mode'] },
  ];
  function init() {
    $('#mOff').addEventListener('input', (e) => { st.off = +e.target.value / 100; st.mode = 'kin'; render(); if (ctl) ctl.update(); });
    segBind('#mMode', (v) => { st.mode = v; render(); });
    ctl = mountMissions('#mMis', missions, api, { controls: { off: '#wrapMOff', mode: '#wrapMMode' }, scene: '#mCv' });
    render(); redrawOn(render);
    K.loop($('#mCv'), (dt) => { if (!st.hold) st.t += dt; if (!st.busy) drawScene(); });
    return ctl;
  }
  return { init, api, st, missions };
})();

/* ---------- Таблица абляций: наши зёрна 1–3 (вшиты в движок как ABL, тест пересчитывает); наведение — разбор ---------- */
function initAbl() {
  const E = L62, box = $('#ablOurs'); if (!box) return;
  const rows = [['both', 'старт из записи и ранний останов'], ['et', 'только ранний останов'], ['rsi', 'только старт из записи'], ['none', 'без того и другого']];
  const rng = (arr, f, d) => { const v = arr.map(f), a = fmt(Math.min(...v), d), b = fmt(Math.max(...v), d); return a === b ? a : `${a}–${b}`; };
  const html = rows.map(([k, name]) => { const a = E.ABL[k]; return `<div class="num-row" role="row" data-k="${k}"><span role="cell"><b>${name}</b></span><span role="cell">${a.map((x) => fmt(x.ret, 2)).join(' · ')}</span><span role="cell">${rng(a, (x) => x.align, 1)}°</span><span role="cell">${a.map((x) => (x.fell == null ? 'идёт' : 'упала')).join(' · ')}</span><span role="cell">${rng(a, (x) => x.falls, 0)}</span></div>`; }).join('');
  box.insertAdjacentHTML('beforeend', html);
  const A = E.ABL, r2 = (k) => rng(A[k], (x) => x.ret, 2), fl = (k) => rng(A[k], (x) => x.falls, 0), al = (k) => rng(A[k], (x) => x.align, 1);
  const out = $('#ablOut'), texts = {
    both: `Полная схема: старт из случайного кадра записи и обрыв эпизода при падении. Итог на трёх зёрнах ${r2('both')}, ошибка позы ${al('both')}°.`,
    et: `Без старта из записи каждый эпизод начинается стоя, из одной позы, и политика сначала должна научиться трогаться с места. Итог ниже на всех трёх зёрнах, ${r2('et')}, а ошибка позы ${al('et')}° — вдвое больше.`,
    rsi: `Без раннего останова, но со стартом из записи итог почти тот же, ${r2('rsi')}: упавшая Ада и так набирает мало награды. У DeepMimic для ходьбы три варианта тоже дали почти одно и то же, 0,980, 0,981 и 0,974.`,
    none: `Ни того ни другого: итог ${r2('none')}, а проверок с падением за обучение ${fl('none')} против ${fl('both')} у полной схемы.`,
  };
  $$('#ablOurs .num-row[data-k]').forEach((r) => { const show = () => { $$('#ablOurs .num-row').forEach((x) => x.classList.toggle('hot', x === r)); setOut(out, texts[r.dataset.k]); }; r.addEventListener('mouseenter', show); r.addEventListener('focus', show); r.addEventListener('click', show); r.tabIndex = 0; });
  setOut(out, 'Наведи на строку или нажми на неё, чтобы увидеть разбор. Числа посчитаны заранее в Node на зёрнах 1–3 тем же движком, что учит политики в лабораториях; тест урока пересчитывает их и сверяет.');
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
  { q: 'Награда DeepMimic считает близость к записи. Значит, политика воспроизводит кадры записи, как анимация?', o: ['Да: это кинематическое воспроизведение записи', 'Нет: политика выдаёт целевые углы ПД-регуляторам, а движение получается в физической симуляции, поэтому в нём есть равновесие и реакция на толчки', 'Да, но только для ходьбы'], a: 1, e: 'Запись задаёт, к чему стремиться, а силы считает симулятор. Поэтому политика DeepMimic для ходьбы выдерживала толчки, которых в записи не было, а в лаборатории 2 трекер держал равновесие без отдельного слагаемого «не падай».' },
  { q: 'Зачем DeepMimic начинает каждый эпизод из случайного кадра записи?', o: ['Чтобы данных для дискриминатора было больше', 'Чтобы политика с первых эпизодов видела поздние фазы движения и не учила его строго по порядку', 'Чтобы эпизоды были короче'], a: 1, e: 'Без старта из записи персонаж DeepMimic вместо сальто учил небольшой подскок: до удачных состояний в конце прыжка он просто не доходил. В нашей таблице без старта из записи Ада хуже училась даже ходьбе, а у ExBody без него обучение не шло вовсе.' },
  { q: 'Ранний останов при падении нужен только для того, чтобы сэкономить время симуляции?', o: ['Да, это только экономия', 'Нет: после падения награда до конца эпизода равна нулю, поэтому падать невыгодно, а в опыте не копятся лежачие состояния', 'Нет: без него обучение невозможно в принципе'], a: 1, e: 'Авторы DeepMimic пишут, что без раннего останова ранний опыт состоит из попыток персонажа тщетно подняться с пола. Для ходьбы останов почти не меняет итог, и в нашей таблице тоже, а для сальто он решает.' },
  { q: 'Дискриминатор AMP сравнивает позу Ады с нужным кадром записи?', o: ['Да, с кадром в той же фазе', 'Нет: он оценивает переход между двумя соседними состояниями, то есть похож ли он на переходы из записей; фазы и выбора записи нет', 'Да, с ближайшим по времени кадром'], a: 1, e: 'Поэтому у политики AMP в лаборатории 2 свой ритм шагов, а походка остаётся похожей на записанную. По той же причине AMP можно дать набор из десятков записей без разметки: решать, какой записи следовать, не нужно.' },
  { q: 'Трекинг записи на ходьбе точнее AMP. Значит, AMP хуже?', o: ['Да, во всём', 'Нет: трекинг точнее, потому что фаза привязывает его к записи, а AMP платит точностью за свободу менять темп и брать много записей', 'Нет: AMP точнее на всех движениях'], a: 1, e: 'В лаборатории 2 политика AMP шагала чаще при большей команде и обгоняла трекер при 1,25 скорости записи, а трекер держал темп записи. В статье AMP трекинг точнее на ходьбе и беге, а на вращении и сальто вбок точнее AMP.' },
  { q: 'Скопировать углы суставов человека на робота — всегда плохой способ ретаргетинга?', o: ['Да: нужна подгонка ключевых точек', 'Нет: если пропорции ног похожи, а суставы робота гнутся не меньше, он работает, как на ходьбе Ады; перестаёт работать там, где тело робота устроено иначе', 'Да, кроме рук'], a: 1, e: 'Так DeepMimic переносил записи на Atlas, а ExBody — на H1. В лаборатории 1 копирование не справилось с приседом, потому что бедро Ады сгибается только до 86°. H2O подбирает форму модели человека под робота: без этого у H1 получалась походка носками внутрь.' },
  { q: 'После ретаргетинга суставы в пределах, а стопы стоят на полу. Значит, робот сможет повторить запись?', o: ['Да: всё, что возможно кинематически, выполнимо', 'Нет: кинематика не проверяет равновесие и моменты, и центр масс может уйти за опору; проверяют это только в физике', 'Да, если запись медленная'], a: 1, e: 'В лаборатории 1 обе правки приседа соблюдали пределы и пол, но центр масс уходил за опору: в одном случае вперёд за носки, в другом назад за пятки. H2O поэтому прогоняет все перенесённые записи через трекер в симуляции и выбрасывает те, которые он повторить не может.' },
  { q: 'Если усреднить две записи ходьбы, начатые с разных ног, трекер по среднему выучит ту же ходьбу?', o: ['Да: физика всё исправит', 'Нет: среднее — это ноги вместе при движущемся тазе; трекер всё равно шагает, но к записи не приближается, и награда за имитацию остаётся низкой', 'Да, если добавить фазу'], a: 1, e: 'Это та же мультимодальность, что объезд чайника с двух сторон в уроке 1.3. DeepMimic берёт максимум награды по записям или даёт политике номер записи на вход, а AMP смотрит на переходы, и номер записи ему не нужен.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('retarget', () => { mis.retarget = Retarget.init(); });
    safe('track', () => { mis.track = Track.init(); });
    safe('mix', () => { mis.mix = Mix.init(); });
    safe('abl', initAbl); safe('quiz', initQuiz);
    safe('count', () => { const n = ['rMis', 'tMis', 'mMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l62 = { mis, Retarget, Track, Mix, Store, L62, Fig, QUIZ }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
