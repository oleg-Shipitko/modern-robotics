/* =====================================================================
   ui-l03.js — урок 0.3 «Кинематика и управление». Интерактивы — миссии
   на живой сцене (shared/missions.js): попади в цель углами, найди цели
   с одним решением и без решений, построй кривую округлости эллипса,
   сравни две сети на одной цели, подбери ПД-регулятор, сравни позиционный
   и импедансный регулятор на одном столе, найди горизонт, которого не хватает
   планировщику. Ниже — схема «кто исполняет команды сети», задача на
   частоты (shared/cards.js) и квиз.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение проигрывания для автотестов; на результаты не влияет
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
const pal2 = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), bad: HeroKit.css('--critical'), good: HeroKit.css('--good'), surf: HeroKit.css('--surface') });
const fmt1 = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const deg = (r) => r * 180 / Math.PI, rad = (d) => d * Math.PI / 180;
const dg = (r) => fmt1(deg(r), 0) + '°';
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, dash]) => box.append(h('span', null, h('i', { class: dash ? 'dash' : null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };

/* ---------- рисование руки и мишени ---------- */
function drawArm(c, q, map, P, o) {
  o = o || {}; const p = Arm.fk(q), b = map(0, 0), j = map(p.x1, p.y1), e = map(p.x, p.y), col = o.color || P.ink;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col;
  if (o.ghost) { c.globalAlpha = 0.6; c.setLineDash([5, 6]); c.lineWidth = 3; } else c.lineWidth = o.w || 7;
  c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(j.x, j.y); c.lineTo(e.x, e.y); c.stroke(); c.setLineDash([]);
  if (!o.ghost) {
    for (const [pt, r] of [[b, 6.5], [j, 5]]) { c.beginPath(); c.arc(pt.x, pt.y, r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    c.beginPath(); c.arc(e.x, e.y, 5.5, 0, 7); c.fillStyle = col; c.fill();
  }
  c.restore(); return e;
}
function crosshair(c, x, y, P, col) { c.strokeStyle = col || P.ink; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 15, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 15, y); c.moveTo(x, y - 15); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 15); c.stroke(); }
function missLine(c, a, b, P) { c.setLineDash([2, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.6; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]); }
/** Вид сверху: квадрат 420×420, 210 пикселей на метр, плечо в центре. */
const TOP = { W: 420, H: 420, S: 210 };
TOP.map = (x, y) => ({ x: TOP.W / 2 + x * TOP.S, y: TOP.H / 2 - y * TOP.S });
TOP.inv = (px, py) => ({ x: (px - TOP.W / 2) / TOP.S, y: (TOP.H / 2 - py) / TOP.S });
function topBase(cv) {
  const { c, k } = HeroKit.fit(cv, TOP.W, TOP.H), P = pal2();
  c.fillStyle = P.bg; c.fillRect(0, 0, TOP.W, TOP.H); HeroKit.grid(c, TOP.W, TOP.H, 21, P.grid);
  c.setLineDash([3, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1;
  for (const r of [Arm.L1 + Arm.L2, Arm.L1 - Arm.L2]) { c.beginPath(); c.arc(TOP.W / 2, TOP.H / 2, r * TOP.S, 0, 7); c.stroke(); }
  c.setLineDash([]);
  return { c, k, P };
}
function arcAngle(c, k, P, ctr, a0, a1, r, text) {
  if (Math.abs(a1 - a0) < 0.02) return;
  c.strokeStyle = P.cl; c.lineWidth = 2; c.beginPath(); c.arc(ctr.x, ctr.y, r, -a0, -a1, a1 > a0); c.stroke();
  const m = (a0 + a1) / 2; HeroKit.label(c, k, text, ctr.x + Math.cos(m) * (r + 15), ctr.y - Math.sin(m) * (r + 15), { color: P.cl, px: 12, weight: 700, haloColor: P.bg });
}
const RMAX = Arm.L1 + Arm.L2, RMIN = Arm.L1 - Arm.L2;
/** Решения обратной задачи с допуском на границе: на самой границе рабочей зоны решение одно. */
function ikSols(x, y) {
  const L1 = Arm.L1, L2 = Arm.L2, c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c2 > 1 + 1e-9 || c2 < -1 - 1e-9) return [];
  const a = Math.acos(Math.max(-1, Math.min(1, c2))), base = Math.atan2(y, x);
  const one = (s) => [base - Math.atan2(L2 * Math.sin(s * a), L1 + L2 * Math.cos(s * a)), s * a];
  return a < 1e-6 || Math.PI - a < 1e-6 ? [one(1)] : [one(1), one(-1)];
}
/** Притягивает точку к границе рабочей зоны, если она ближе tol. */
function snapRing(w, tol) {
  const r = Math.hypot(w.x, w.y) || 1e-9;
  for (const R of [RMAX, RMIN]) if (Math.abs(r - R) < tol) return { x: w.x * R / r, y: w.y * R / r };
  return w;
}
const clampRing = (w, lo, hi) => { const r = Math.hypot(w.x, w.y) || 1e-9, f = r > hi ? hi / r : r < lo ? lo / r : 1; return { x: w.x * f, y: w.y * f }; };
/** Проигрывание кадров с шагом dt мс. Конец — по таймеру, даже если сцена ушла с экрана. */
function playback(n, dt, onEnd) {
  const pl = { t0: performance.now(), n, dt, i: 0, done: false };
  pl.index = () => Math.min(n - 1, Math.floor((performance.now() - pl.t0) * SPEED.k / dt));
  setTimeout(() => { pl.done = true; onEnd(); }, n * dt / SPEED.k + 30);
  return pl;
}
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
/** График: на узком экране логическая высота больше, чтобы подписи не слипались. */
function plotFit(cv, W, H, Hn) {
  const hh = cv.getBoundingClientRect().width < 460 ? Hn : H, ar = `${W} / ${hh}`;
  if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
  const f = HeroKit.fit(cv, W, hh); return { c: f.c, k: f.k, H: hh };
}
/** Поля графика под подписи: подписи 10,5 px на экране, k — логических единиц в пикселе. */
function plotBox(k, W, H, yt) { const n = Math.max(...yt.map((t) => t[1].length)); return { l: Math.max(30, 10 + n * 6.6 * k), r: W - 10, t: 10, b: H - Math.max(22, 15 * k) }; }
/** Мелкие подписи осей на канвасе графика; названия осей — в HTML под ним. */
function axes(c, k, P, box, xt, yt, x, y) {
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const [v, t] of yt) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, t, box.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
  const ly = box.b + Math.max(13, 8.5 * k);
  for (const [v, t, al] of xt) HeroKit.label(c, k, t, x(v), ly, { align: al || 'center', px: 10.5, mono: true, color: P.ink3, halo: false });
}

/* ---------- 1. Углы → поза: попади в цель ---------- */
const FK = (() => {
  const A = Arm, T = [{ x: -0.485, y: 0.527 }, { x: 0.55, y: -0.25 }, { x: 0.55, y: -0.25 }];
  const st = { q: [rad(30), rad(75)], k: 0, moves: 0, dist: 1, qFirst: null, log: [] };
  let ctl = null;
  const tgt = () => T[st.k];
  function measure() { const p = A.fk(st.q), g = tgt(); st.dist = Math.hypot(p.x - g.x, p.y - g.y); return p; }
  function draw() {
    const { c, k, P } = topBase($('#fkCv')), p = measure(), b = TOP.map(0, 0), j = TOP.map(p.x1, p.y1), g = TOP.map(tgt().x, tgt().y), hit = st.dist < 0.03;
    c.beginPath(); c.arc(g.x, g.y, 0.03 * TOP.S, 0, 7); c.fillStyle = hit ? P.good : P.ink2; c.globalAlpha = hit ? 0.5 : 0.35; c.fill(); c.globalAlpha = 1;
    crosshair(c, g.x, g.y, P, hit ? P.good : P.ink);
    if (st.k === 2 && st.qFirst) drawArm(c, st.qFirst, TOP.map, P, { ghost: true });
    c.strokeStyle = P.ink3; c.lineWidth = 1; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + 74, b.y); c.stroke();
    c.beginPath(); c.moveTo(j.x, j.y); c.lineTo(j.x + Math.cos(st.q[0]) * 62, j.y - Math.sin(st.q[0]) * 62); c.stroke(); c.setLineDash([]);
    arcAngle(c, k, P, b, 0, st.q[0], 36, 'θ₁'); arcAngle(c, k, P, j, st.q[0], st.q[0] + st.q[1], 28, 'θ₂');
    drawArm(c, st.q, TOP.map, P);
    setOut($('#fkOut'), `Захват: x = ${fmt1(p.x, 2)} м, y = ${fmt1(p.y, 2)} м · ${hit ? '<b>в цели</b>' : `до цели <b>${fmt1(st.dist * 100, 0)} см</b>`} · движений ползунками: <b>${st.moves}</b>`);
  }
  function showLog() { const ol = $('#fkLog'); ol.hidden = !st.log.length; ol.innerHTML = ''; st.log.forEach((t) => ol.append(h('li', { class: 'ok' }, t))); }
  function sync() {
    st.q = [rad(+$('#fkQ1').value), rad(+$('#fkQ2').value)];
    $('#fkQ1').nextElementSibling.textContent = fmt1(+$('#fkQ1').value, 0) + '°'; $('#fkQ2').nextElementSibling.textContent = fmt1(+$('#fkQ2').value, 0) + '°';
    draw(); if (ctl) ctl.update();
  }
  function setQ(a, b) { $('#fkQ1').value = a; $('#fkQ2').value = b; sync(); }
  const enter = (k) => () => { st.k = k; st.moves = 0; draw(); };
  const NAMES = ['Цель 1', 'Цель 2', 'Цель 2 другим локтем'];
  const api = { reset() { st.qFirst = null; st.log = []; st.moves = 0; showLog(); setQ(30, 75); }, state: () => ({ dist: st.dist, q: st.q.slice() }), setQ };
  const inTarget = { label: 'Захват в цели: ближе 3 см', test: (r, s) => s.dist < 0.03 };
  const missions = [
    { short: 'Цель 1', title: 'Попади в цель', text: 'Двигай углы плеча и локтя, пока захват не окажется в цели. Хватит точности 3 см.', criteria: [inTarget], onEnter: enter(0),
      hint: 'Плечо θ₁ поворачивает руку целиком. Сравни, на каком расстоянии от плеча захват и цель.',
      explain: () => `Попадание за ${nWord(st.moves, 'движение', 'движения', 'движений')}. Цель стоит на том же расстоянии от плеча, что и захват в начале, поэтому хватает одного плеча: оно поворачивает руку, и захват едет по окружности.` },
    { short: 'Цель 2', title: 'Цель ближе к плечу', text: 'Новая цель ближе к плечу и ниже. Плечо поворачивает руку, но не меняет расстояние от плеча до захвата, поэтому одним плечом теперь не обойтись.', criteria: [inTarget], onEnter: enter(1),
      hint: 'Сначала локтем θ₂ подгони расстояние от плеча до захвата, потом плечом θ₁ разверни руку к цели.',
      explain: () => `Попадание за ${nWord(st.moves, 'движение', 'движения', 'движений')}. Локоть задаёт расстояние от плеча до захвата, плечо — направление. Каждый сустав ведёт захват по своей дуге, поэтому попадать в точку углами неудобно. И этот набор углов не единственный.` },
    { short: 'Другой локоть', title: 'Та же цель, локоть в другую сторону', text: 'В ту же цель можно попасть и с локтем, согнутым в другую сторону. Попади так ещё раз. Пунктиром — рука из прошлой попытки.', onEnter: enter(2),
      criteria: [inTarget, { label: 'Локоть согнут в другую сторону', test: (r, s) => !!st.qFirst && Math.sign(s.q[1]) !== Math.sign(st.qFirst[1]) && Math.abs(s.q[1]) > rad(3) }],
      hint: 'Переведи θ₂ через ноль на угол с другим знаком, потом снова разверни руку плечом.',
      explain: () => `Попадание за ${nWord(st.moves, 'движение', 'движения', 'движений')}. Одну и ту же позу захвата дают два набора углов: θ₁ = ${dg(st.qFirst[0])}, θ₂ = ${dg(st.qFirst[1])} и θ₁ = ${dg(st.q[0])}, θ₂ = ${dg(st.q[1])}. Это два решения обратной задачи. Справа их находит формула.` },
  ];
  function init() {
    $('#fkQ1').addEventListener('input', sync); $('#fkQ2').addEventListener('input', sync);
    const moved = () => { st.moves++; draw(); };
    $('#fkQ1').addEventListener('change', moved); $('#fkQ2').addEventListener('change', moved);
    ctl = mountMissions('#fkMis', missions, api, {
      onDone: (i) => { st.log.push(`${NAMES[i]}: ${nWord(st.moves, 'движение', 'движения', 'движений')}`); showLog(); if (i === 1) st.qFirst = st.q.slice(); },
    });
    sync(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 1. Поза → углы: найди особые цели ---------- */
const IK = (() => {
  const A = Arm; let goal = { x: 0.5, y: 0.35 }, ctl = null;
  function draw() {
    const { c, P } = topBase($('#ikCv')), sols = ikSols(goal.x, goal.y), r = Math.hypot(goal.x, goal.y), g = TOP.map(goal.x, goal.y);
    let txt;
    if (!sols.length) {
      const far = r > RMAX; drawArm(c, [Math.atan2(goal.y, goal.x), far ? 0 : Math.PI], TOP.map, P, { color: P.ink3 });
      txt = far ? '<b>Решений нет:</b> цель дальше, чем достаёт рука.' : '<b>Решений нет:</b> цель ближе, чем рука может сложиться.';
    } else if (sols.length === 1) {
      drawArm(c, sols[0], TOP.map, P);
      txt = r > 0.5 ? `<b>Одно решение:</b> рука вытянута, θ₁ = ${dg(sols[0][0])}, θ₂ = 0°.` : `<b>Одно решение:</b> рука сложена, θ₁ = ${dg(sols[0][0])}, θ₂ = 180°.`;
    } else {
      drawArm(c, sols[1], TOP.map, P, { ghost: true }); drawArm(c, sols[0], TOP.map, P);
      txt = `<b>Два решения:</b> θ₁ = ${dg(sols[0][0])}, θ₂ = ${dg(sols[0][1])} и θ₁ = ${dg(sols[1][0])}, θ₂ = ${dg(sols[1][1])}.`;
    }
    crosshair(c, g.x, g.y, P); setOut($('#ikOut'), txt + ` До плеча ${fmt1(r, 2)} м.`);
  }
  const api = { reset() { goal = { x: 0.5, y: 0.35 }; draw(); }, state: () => ({ n: ikSols(goal.x, goal.y).length, r: Math.hypot(goal.x, goal.y) }), set: (x, y) => { goal = { x, y }; draw(); if (ctl) ctl.update(); } };
  const missions = [
    { short: 'Одно решение', title: 'Найди цель с одним решением', text: 'Перетащи цель так, чтобы у руки осталось одно решение вместо двух.', criteria: [{ label: 'Ровно одно решение', test: (r, s) => s.n === 1 }],
      hint: 'Два решения отличаются тем, куда согнут локоть. Где локтю некуда сгибаться?',
      explain: (s) => `${s.r > 0.5 ? 'Рука вытянута' : 'Рука сложена'}, и два решения слились в одно. Так бывает только на границах рабочей зоны: в 0,9 м и в 0,1 м от плеча.` },
    { short: 'Нет решений', title: 'Найди цель без решений', text: 'Теперь найди цель, до которой рука не дотянется никак.', criteria: [{ label: 'Ни одного решения', test: (r, s) => s.n === 0 }],
      hint: 'Рабочая зона — кольцо между двумя пунктирными окружностями.',
      explain: () => 'Цель дальше 0,9 м или ближе 0,1 м от плеча, и формула показывает: решений нет. Нейросеть, которую мы обучим в лаборатории 1, выдаст углы и здесь, не предупредив, что они не годятся.' },
  ];
  function init() {
    legend('#ikLegend', [['первое решение', 'var(--ink)'], ['второе решение', 'var(--ink-3)', true]]);
    const set = (p) => { const w = clampRing(TOP.inv(p.x, p.y), 0, 0.98); goal = snapRing(w, 0.02); draw(); ctl.update(); };
    HeroKit.drag($('#ikCv'), TOP.W, TOP.H, { hit: (p) => { const g = TOP.map(goal.x, goal.y); return Math.hypot(p.x - g.x, p.y - g.y) < 40 ? 'g' : null; }, move: (o, p) => set(p), tap: set, tapCursor: 'pointer' });
    ctl = mountMissions('#ikMis', missions, api);
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api };
})();

/* ---------- 2. Якобиан: кривая, которую строишь сам ---------- */
const Jac = (() => {
  const A = Arm, SC = 0.32, PW = 420, PH = 190;
  const st = { ee: { x: 0.45, y: 0.3 }, pts: [], lastR: null, theory: false };
  let ctl = null;
  function ell(q) {
    const J = A.jac(q), a = J[0][0] ** 2 + J[0][1] ** 2, b = J[0][0] * J[1][0] + J[0][1] * J[1][1], d = J[1][0] ** 2 + J[1][1] ** 2;
    const m = (a + d) / 2, disc = Math.sqrt(((a - d) / 2) ** 2 + b * b), l1 = m + disc, l2 = Math.max(0, m - disc);
    return { s1: Math.sqrt(l1), s2: Math.sqrt(l2), ang: 0.5 * Math.atan2(2 * b, a - d), ratio: Math.sqrt(l2) / Math.sqrt(l1) };
  }
  function cur() { const q = ikSols(st.ee.x, st.ee.y)[0], e = ell(q); return { q, ...e, det: Math.abs(A.L1 * A.L2 * Math.sin(q[1])), r: Math.hypot(st.ee.x, st.ee.y) }; }
  function draw() {
    const { c, P } = topBase($('#jacCv')), s = cur();
    const e = drawArm(c, s.q, TOP.map, P), r1 = s.s1 * SC * TOP.S, r2 = Math.max(1, s.s2 * SC * TOP.S);
    c.save(); c.translate(e.x, e.y); c.rotate(-s.ang);
    c.beginPath(); c.ellipse(0, 0, r1, r2, 0, 0, Math.PI * 2); c.fillStyle = P.cl; c.globalAlpha = 0.16; c.fill(); c.globalAlpha = 1; c.strokeStyle = P.cl; c.lineWidth = 2; c.stroke();
    c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r1, 0); c.lineTo(r1, 0); c.moveTo(0, -r2); c.lineTo(0, r2); c.stroke(); c.restore();
    drawArm(c, s.q, TOP.map, P);
    const note = s.det < 0.01 ? 'Сингулярность: вдоль руки захват двигаться не может, эллипс превратился в отрезок.' : s.det < 0.05 ? 'Рука близка к сингулярности: эллипс сплющивается.' : s.ratio > 0.8 ? 'Эллипс почти круглый: рука одинаково легко двигается во все стороны.' : 'Вдоль длинной оси эллипса рука двигается легче.';
    setOut($('#jacOut'), `θ₂ = <b>${fmt1(Math.abs(deg(s.q[1])), 0)}°</b> · det J = <b>${fmt1(s.det, 3)}</b> · округлость <b>${fmt1(s.ratio, 2)}</b><br>${note}`);
  }
  function theory() { const out = []; for (let i = 0; i <= 160; i++) { const r = RMIN + (RMAX - RMIN) * i / 160, c2 = Math.max(-1, Math.min(1, (r * r - A.L1 ** 2 - A.L2 ** 2) / (2 * A.L1 * A.L2))); out.push([r, ell([0, Math.acos(c2)]).ratio]); } return out; }
  function plot() {
    const { c, k } = HeroKit.fit($('#jacPlot'), PW, PH), P = pal2(), yt = [[0, '0'], [0.5, '0,5'], [1, '1']], box = plotBox(k, PW, PH, yt);
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const x = (v) => box.l + (v - RMIN) / (RMAX - RMIN) * (box.r - box.l), y = (v) => box.b - v * (box.b - box.t);
    axes(c, k, P, box, [[0.1, '0,1', 'left'], [0.3, '0,3'], [0.5, '0,5'], [0.7, '0,7'], [0.9, '0,9', 'right']], yt, x, y);
    c.setLineDash([5, 4]); c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); c.moveTo(box.l, y(0.8)); c.lineTo(box.r, y(0.8)); c.stroke(); c.setLineDash([]);
    if (st.theory) { c.setLineDash([4, 3]); c.strokeStyle = P.ink3; c.lineWidth = 2; c.beginPath(); theory().forEach(([r, v], i) => (i ? c.lineTo(x(r), y(v)) : c.moveTo(x(r), y(v)))); c.stroke(); c.setLineDash([]); }
    c.fillStyle = P.cl; for (const p of st.pts) { c.beginPath(); c.arc(x(p.r), y(p.v), 3, 0, 7); c.fill(); }
    const s = cur(); c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.arc(x(s.r), y(s.ratio), 6, 0, 7); c.stroke();
  }
  function showLegend() { const it = [['твои точки', 'var(--classic)'], ['порог 0,8', 'var(--good)', true]]; if (st.theory) it.push(['вся кривая', 'var(--ink-3)', true]); legend('#jacLegend', it); }
  function record() { const s = cur(); if (st.lastR == null || Math.abs(s.r - st.lastR) > 0.012) { st.pts.push({ r: s.r, v: s.ratio }); if (st.pts.length > 240) st.pts.shift(); st.lastR = s.r; } }
  function bins() { const b = new Array(8).fill(0); for (const p of st.pts) b[Math.max(0, Math.min(7, Math.floor((p.r - RMIN) / 0.1)))]++; return b; }
  function set(x, y) { st.ee = clampRing(snapRing({ x, y }, 0.008), RMIN, RMAX); record(); draw(); plot(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.pts = []; st.lastR = null; st.theory = false; st.ee = { x: 0.45, y: 0.3 }; record(); showLegend(); draw(); plot(); },
    state: () => { const s = cur(); return { det: s.det, ratio: s.ratio, r: s.r, bins: bins() }; },
    set,
  };
  const missions = [
    { short: 'Сингулярность', title: 'Найди сингулярность', text: 'Перетаскивай захват и найди положение, где эллипс сплющивается в отрезок, а определитель якобиана почти нулевой.', criteria: [{ label: 'det J меньше 0,01', test: (r, s) => s.det < 0.01 }],
      hint: 'Вытяни руку до упора или сложи её у самого плеча.',
      explain: (s) => `${s.r > 0.5 ? 'Рука вытянута' : 'Рука сложена'}, det J = ${fmt1(s.det, 3)}. Суставы могут крутиться как угодно, но вдоль руки захват не сдвинется: обе скорости суставов ведут его поперёк. На графике такая точка лежит на нуле.` },
    { short: 'Круглый эллипс', title: 'Найди самый круглый эллипс', text: 'Теперь наоборот: найди положение, где рука одинаково легко двигается во все стороны. Нужна округлость больше 0,8: короткая ось эллипса — не меньше 80 % длинной.', criteria: [{ label: 'Округлость больше 0,8', test: (r, s) => s.ratio > 0.8 }],
      hint: 'Смотри на график: где точки поднимаются выше? Попробуй согнуть локоть сильнее прямого угла.',
      explain: (s) => `Округлость ${fmt1(s.ratio, 2)} в ${fmt1(s.r, 2)} м от плеча. Больше 0,84 у этой руки не бывает: совсем круглым эллипс стал бы, будь второе звено короче первого в √2 раз.` },
    { short: 'Вся кривая', title: 'Построй кривую целиком', text: 'Проведи захват от самого плеча до края рабочей зоны, чтобы точки легли во все восемь отрезков графика, от 0,1 до 0,9 м.', criteria: [{ label: 'Точки во всех восьми отрезках от 0,1 до 0,9 м', test: (r, s) => s.bins.every((n) => n > 0) }],
      hint: 'Веди захват по прямой от центра наружу. Каждые 1,2 см пути — новая точка.',
      explain: () => 'Пунктиром — вся кривая. Ловчее всего рука в 0,36 м от плеча, а к обоим краям рабочей зоны округлость падает до нуля: там сингулярности. Чтобы сдвинуть захват вдоль вытянутой руки, суставам понадобилась бы бесконечная скорость.' },
  ];
  function init() {
    HeroKit.drag($('#jacCv'), TOP.W, TOP.H, { hit: (p) => { const e = TOP.map(st.ee.x, st.ee.y); return Math.hypot(p.x - e.x, p.y - e.y) < 40 ? 'e' : null; }, move: (o, p) => { const w = TOP.inv(p.x, p.y); set(w.x, w.y); }, tap: (p) => { const w = TOP.inv(p.x, p.y); set(w.x, w.y); }, tapCursor: 'pointer' });
    record(); showLegend();
    ctl = mountMissions('#jacMis', missions, api, { onDone: (i) => { if (i === 2) { st.theory = true; showLegend(); plot(); } } });
    draw(); plot(); redrawOn(() => { draw(); plot(); });
    return ctl;
  }
  return { init, api };
})();

/* ---------- Лаборатория 1: две сети, одна цель ---------- */
const NetLab = (() => {
  const A = Arm, G0 = { x: 0.62, y: 0.38 }, KINDS = ['two', 'one'], CV = { two: '#netCvA', one: '#netCvB' }, STAT = { two: '#netStatA', one: '#netStatB' }, ITERS = 900;
  const st = { goal: Object.assign({}, G0), nets: {}, heat: {}, showHeat: false, loss: { two: [], one: [] }, prog: 0, training: false, trained: false };
  let ctl = null;
  const missAt = (m, g) => { const p = A.fk(A.netIK(m, g.x, g.y)); return Math.hypot(p.x - g.x, p.y - g.y); };
  function heatMap(m) {
    const N = 42, out = new Float32Array(N * N); let s = 0, n = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = 1 - (j + 0.5) / N * 2, d = Math.hypot(x, y);
      if (d > 0.89 || d < 0.12) { out[j * N + i] = -1; continue; }
      const e = missAt(m, { x, y }); out[j * N + i] = e; s += e; n++;
    }
    return { N, out, mean: s / n };
  }
  function drawPane(kind) {
    const { c, P } = topBase($(CV[kind])), g = st.goal, gp = TOP.map(g.x, g.y), m = st.nets[kind];
    if (st.showHeat && st.heat[kind]) {
      const { N, out } = st.heat[kind], cs = TOP.W / N; c.fillStyle = P.bad;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = out[j * N + i]; if (v < 0) continue; c.globalAlpha = Math.min(0.75, v / 0.4); c.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    ikSols(g.x, g.y).forEach((q) => drawArm(c, q, TOP.map, P, { ghost: true }));
    const el = $(STAT[kind]);
    if (m) {
      const e = drawArm(c, A.netIK(m, g.x, g.y), TOP.map, P, { color: P.e2e }), miss = missAt(m, g);
      missLine(c, e, gp, P);
      if (st.training) { setOut(el, `Учится… ${fmt1(st.prog * 100, 0)} %`); el.className = 'np-stat'; }
      else { setOut(el, `Промах <b>${fmt1(miss * 100, 1)} см</b>`); el.className = 'np-stat' + (miss < 0.03 ? ' ok' : miss > 0.1 ? ' bad' : ''); }
    } else { setOut(el, 'Ещё не обучена'); el.className = 'np-stat'; }
    crosshair(c, gp.x, gp.y, P);
  }
  function plotLoss() {
    const W = 520, { c, k, H } = plotFit($('#netLoss'), W, 96, 150), P = pal2(), yt = [[0.01, '0,01'], [0.1, '0,1'], [1, '1']], box = plotBox(k, W, H, yt);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const lo = Math.log10(0.005), hi = Math.log10(5), x = (it) => box.l + it / (ITERS - 1) * (box.r - box.l), y = (v) => box.b - (Math.log10(Math.max(0.005, v)) - lo) / (hi - lo) * (box.b - box.t);
    axes(c, k, P, box, [[0, '0', 'left'], [450, '450'], [ITERS - 1, '900 шагов', 'right']], yt, x, y);
    KINDS.forEach((kind) => { const L = st.loss[kind]; if (L.length < 2) return; c.strokeStyle = P.e2e; c.lineWidth = 2; c.setLineDash(kind === 'one' ? [6, 4] : []); c.beginPath(); L.forEach(([it, v], i) => (i ? c.lineTo(x(it), y(v)) : c.moveTo(x(it), y(v)))); c.stroke(); c.setLineDash([]); });
  }
  function draw() { KINDS.forEach(drawPane); }
  function showLegend() {
    const it = [['точные решения', 'var(--ink-3)', true], ['ответ сети', 'var(--e2e)'], ['промах', 'var(--critical)', true]];
    if (st.showHeat) it.push(['чем краснее клетка, тем больше промах', 'var(--critical)']);
    legend('#netLegend', it);
  }
  async function train() {
    st.training = true; st.trained = false; st.showHeat = false; $('#netHeat').checked = false; st.heat = {}; st.loss = { two: [], one: [] }; st.prog = 0; showLegend();
    const data = { two: A.ikData(6000, false, 3), one: A.ikData(6000, true, 3) };
    st.nets = { two: A.mlp([2, 48, 48, 4], 5), one: A.mlp([2, 48, 48, 4], 5) };
    const gens = { two: A.trainGen(st.nets.two, data.two, { iters: ITERS, bs: 64, lr: 0.005 }), one: A.trainGen(st.nets.one, data.one, { iters: ITERS, bs: 64, lr: 0.005 }) };
    function* both() { for (;;) { const a = gens.two.next(), b = gens.one.next(); if (a.done && b.done) return; yield { a: a.value, b: b.value }; } }
    await runChunked(both(), (e) => {
      if (e.a) st.loss.two.push([e.a.it, e.a.loss]); if (e.b) st.loss.one.push([e.b.it, e.b.loss]);
      st.prog = (e.a ? e.a.it : ITERS) / (ITERS - 1); draw(); plotLoss();
    }, 14);
    st.heat = { two: heatMap(st.nets.two), one: heatMap(st.nets.one) }; st.training = false; st.trained = true; draw(); plotLoss();
    return { missA: missAt(st.nets.two, st.goal), missB: missAt(st.nets.one, st.goal), meanA: st.heat.two.mean, meanB: st.heat.one.mean, lossA: st.loss.two[st.loss.two.length - 1][1], lossB: st.loss.one[st.loss.one.length - 1][1] };
  }
  function setGoal(x, y) { st.goal = clampRing({ x, y }, RMIN + 0.01, RMAX - 0.01); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.nets = {}; st.heat = {}; st.loss = { two: [], one: [] }; st.showHeat = false; st.trained = false; st.goal = Object.assign({}, G0); $('#netHeat').checked = false; showLegend(); draw(); plotLoss(); },
    train,
    heat() { st.showHeat = true; $('#netHeat').checked = true; showLegend(); draw(); return Promise.resolve({ meanA: st.heat.two.mean, meanB: st.heat.one.mean }); },
    state: () => (st.trained ? { trained: true, missA: missAt(st.nets.two, st.goal), missB: missAt(st.nets.one, st.goal), r: Math.hypot(st.goal.x, st.goal.y) } : { trained: false }),
    setGoal,
  };
  const cm = (v) => fmt1(v * 100, 1);
  const missions = [
    { short: 'Кто точнее', title: 'Две сети, одна цель', text: 'Обе сети одинаковые и учатся на 6000 примерах «поза захвата → углы». Сеть А видит все позы руки. Сеть Б — только позы, где локоть согнут в одну сторону.',
      bet: { q: 'какая сеть точнее попадёт в цель?', options: ['А: у неё данные разнообразнее', 'Б', 'Одинаково'], answer: (r) => (Math.abs(r.missA - r.missB) < 0.01 ? 2 : r.missA < r.missB ? 0 : 1) },
      action: { label: 'Обучить обе сети', run: (X) => X.train() },
      summary: (r) => `А: ${cm(r.missA)} см · Б: ${cm(r.missB)} см`,
      explain: (r) => `В этой цели сеть А промахивается на <b>${cm(r.missA)} см</b>, сеть Б — на <b>${cm(r.missB)} см</b>. В среднем по рабочей зоне — ${fmt1(r.meanA * 100, 1)} и ${fmt1(r.meanB * 100, 1)} см. Данных у сетей поровну, разница в том, что в них. У сети А на одну позу захвата приходится два правильных ответа: локоть в одну сторону и в другую. Угодить обоим сеть не может, и её ошибка обучения застряла на ${fmt1(r.lossA, 2)}.` },
    { short: 'Промах сети А', title: 'Найди промах сети А', text: 'Перетаскивай цель на любой из сцен. Найди место, где сеть А промахивается больше чем на 40 см.', criteria: [{ label: 'Промах сети А больше 40 см', test: (r, s) => s.trained && s.missA > 0.4 }],
      hint: 'Промах сети А зависит от расстояния между целью и плечом. Подвинь цель ближе к плечу.',
      explain: (s) => `Промах ${cm(s.missA)} см, а сеть Б в той же цели ошибается на ${cm(s.missB)} см. Сеть учится по среднеквадратичной ошибке, и при двух правильных ответах её оптимум — их среднее: θ₂ около 0° или 180°. Рука сети выходит вытянутой или сложенной и смотрит на цель. Сложенная достаёт на 0,1 м, вытянутая — на 0,9 м, а цель в ${fmt1(s.r, 2)} м от плеча далека от обеих.` },
    { short: 'Где А точна', title: 'Найди, где сеть А всё-таки попадает', text: 'У сети А есть места, где она ошибается меньше чем на 3 см. Найди такую цель.', criteria: [{ label: 'Промах сети А меньше 3 см', test: (r, s) => s.trained && s.missA < 0.03 }],
      hint: 'Вспомни раздел про кинематику: где у обратной задачи одно решение?',
      explain: (s) => `Промах ${cm(s.missA)} см. У границы рабочей зоны оба решения сливаются в одно, и спорить сети не о чем. Чем дальше друг от друга два решения, тем сильнее промах.` },
    { short: 'Карта промахов', title: 'Как сети видят всю рабочую зону', text: 'Покрасим каждую точку рабочей зоны по величине промаха. Так видно сразу всё, что сеть выучила, а не одну цель.',
      bet: { q: 'где сеть А ошибается сильнее всего?', options: ['У края рабочей зоны', 'В кольце посередине', 'У самого плеча', 'Везде одинаково'], answer: () => 1 },
      action: { label: 'Показать карту промахов', run: (X) => X.heat() },
      explain: (r) => `У сети А красное кольцо в 0,5–0,65 м от плеча: там промах больше 40 см, это пятая часть рабочей зоны. У краёв карта светлеет. Сеть Б почти везде белая, её средний промах ${fmt1(r.meanB * 100, 1)} см. Регрессия ошибается, когда у одного входа несколько правильных ответов: она выдаёт их среднее. Та же беда ждёт политику, когда оператор объезжает препятствие то слева, то справа. Это <b>мультимодальность</b>, ей посвящён урок 1.3.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Перетаскивай цель и включай карту промахов. Сравни, как ведут себя руки двух сетей у самого плеча и у края.', final: true },
  ];
  function init() {
    showLegend(); legend('#netLossLegend', [['ошибка обучения сети А', 'var(--e2e)'], ['сети Б', 'var(--e2e)', true]]);
    KINDS.forEach((kind) => {
      const cv = $(CV[kind]), set = (p) => { const w = TOP.inv(p.x, p.y); setGoal(w.x, w.y); };
      HeroKit.drag(cv, TOP.W, TOP.H, { hit: (p) => { const g = TOP.map(st.goal.x, st.goal.y); return Math.hypot(p.x - g.x, p.y - g.y) < 40 ? 'g' : null; }, move: (o, p) => set(p), tap: set, tapCursor: 'pointer' });
    });
    $('#netHeat').addEventListener('change', (e) => { st.showHeat = e.target.checked && st.trained; showLegend(); draw(); });
    ctl = mountMissions('#netMis', missions, api, { controls: { heat: '#wrapHeat' } });
    draw(); plotLoss(); redrawOn(() => { draw(); plotLoss(); });
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Сцена сбоку: рука в вертикальной плоскости ---------- */
function sideBase(c, P, W, H, grid) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, grid || 23, P.grid); }
function forceArrow(c, k, P, x, y, F) {
  if (F <= 0.5) return; const L = Math.min(90, 10 + F * 0.22);
  c.strokeStyle = P.bad; c.fillStyle = P.bad; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - L); c.stroke();
  c.beginPath(); c.moveTo(x, y - L - 8); c.lineTo(x - 6, y - L + 2); c.lineTo(x + 6, y - L + 2); c.fill();
  HeroKit.label(c, k, `${fmt1(F, 0)} Н`, x, y - L - 18, { color: P.bad, px: 11.5, weight: 700, haloColor: P.bg });
}
const niceUp = (v, steps) => steps.find((s) => s >= v) || Math.ceil(v / 100) * 100;

/* ---------- Лаборатория 2: регулятор ---------- */
const PdLab = (() => {
  const A = Arm, W = 520, H = 340, S = 190, OX = 200, OY = 170, PW = 520, PH = 110, T = 4;
  const map = (x, y) => ({ x: OX + x * S, y: OY - y * S }), inv = (px, py) => ({ x: (px - OX) / S, y: (OY - py) / S });
  const st = { o: { mode: 'pd', Kp: 60, Kd: 0, comp: false }, s: A.ctlInit('pd'), play: null, fr: null, live: false, hist: [], pull: null, err: 0, last: null, runs: [] };
  let ctl = null;
  function stats(r) {
    const fr = r.frames, e = (f) => f.err * 100, at = (t0) => fr.filter((f) => f.t >= t0 - 1e-9).map(e);
    const l05 = at(T - 0.5), l1 = at(T - 1), a1 = at(1), fin = e(r.final);
    let settle = 0; for (const f of fr) if (Math.abs(e(f) - fin) > 1) settle = f.t;
    return { sag: Math.max(...l05), swing: Math.max(...l1) - Math.min(...l1), settle, lo: Math.min(...a1), hi: Math.max(...a1) };
  }
  function run() {
    const o = Object.assign({}, st.o), r = A.simulate(o, T), m = Object.assign(stats(r), { Kp: o.Kp, Kd: o.Kd, comp: o.comp });
    st.fr = r.frames; st.live = false; st.hist = []; st.last = null; st.pull = null;
    return new Promise((res) => { st.play = playback(r.frames.length, 10, () => { const f = r.frames[r.frames.length - 1]; st.s = { q: f.q.slice(), dq: f.dq.slice() }; st.play = null; st.live = true; st.hist = r.frames.map((x) => [x.t, x.err * 100]); st.last = m; st.runs.push(m); render(); res(m); }); });
  }
  function tick(dt) {
    if (st.play) {
      const i = st.play.index(), f = st.fr[i]; st.s = { q: f.q.slice(), dq: f.dq.slice() }; st.err = f.err;
      st.hist = st.fr.slice(0, i + 1).map((x) => [x.t, x.err * 100]);
    } else if (st.live) {
      const n = Math.max(1, Math.round(dt * 1000)); for (let j = 0; j < n; j++) A.ctlStep(st.o, st.s, st.pull);
      const p = A.fk(st.s.q), g = A.goalOf(st.o); st.err = Math.hypot(p.x - g.x, p.y - g.y);
      const moving = Math.abs(st.s.dq[0]) + Math.abs(st.s.dq[1]) > 0.02; // в покое график стоит, и запуск остаётся на виду
      if (st.pull || moving) { const t = (st.hist.length ? st.hist[st.hist.length - 1][0] : 0) + n / 1000; st.hist.push([t, st.err * 100]); if (st.hist.length > 1200) st.hist.shift(); }
    }
    render();
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#pdCv'), W, H), P = pal2();
    sideBase(c, P, W, H);
    const b = map(0, 0); c.fillStyle = P.ink3; c.globalAlpha = 0.4; c.fillRect(b.x - 24, b.y + 7, 48, 9); c.globalAlpha = 1;
    const s0 = map(A.SHELF.x - 0.1, A.SHELF.y - 0.035), s1 = map(A.SHELF.x + 0.24, A.SHELF.y - 0.035);
    c.fillStyle = P.ink3; c.fillRect(s0.x, s0.y, s1.x - s0.x, 6); HeroKit.label(c, k, 'полка', s1.x + 6, s0.y + 3, { align: 'left', color: P.ink3, px: 11, haloColor: P.bg });
    const g = map(A.SHELF.x, A.SHELF.y); crosshair(c, g.x, g.y, P);
    const e = drawArm(c, st.s.q, map, P);
    c.beginPath(); c.roundRect(e.x - 9, e.y - 24, 18, 19, 3); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
    c.beginPath(); c.arc(e.x + 11, e.y - 15, 5, -Math.PI / 2, Math.PI / 2); c.stroke();
    if (st.pull) { const pp = map(st.pull.x, st.pull.y); c.strokeStyle = P.ink3; c.setLineDash([3, 3]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(pp.x, pp.y); c.stroke(); c.setLineDash([]); }
  }
  function plot() {
    const { c, k, H: ph } = plotFit($('#pdPlot'), PW, PH, 160), P = pal2();
    const last = st.hist.length ? st.hist[st.hist.length - 1][0] : 0, tEnd = Math.max(T, last), tS = tEnd - T;
    let mx = 0; for (const [t, v] of st.hist) if (t >= tS) mx = Math.max(mx, v); const vmax = niceUp(Math.max(20, mx), [20, 40, 60, 100, 150]);
    const yt = [[0, '0'], [vmax / 2, fmt1(vmax / 2, 0)], [vmax, fmt1(vmax, 0)]], box = plotBox(k, PW, ph, yt);
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, ph);
    const x = (t) => box.l + (t - tS) / T * (box.r - box.l), y = (v) => box.b - Math.min(1, v / vmax) * (box.b - box.t);
    const xt = []; for (let s = Math.ceil(tS); s <= Math.floor(tEnd); s++) xt.push([s, `${s} с`, s === Math.floor(tEnd) && x(s) > box.r - 12 ? 'right' : x(s) < box.l + 12 ? 'left' : 'center']);
    axes(c, k, P, box, xt, yt, x, y);
    const vis = st.hist.filter(([t]) => t >= tS);
    if (vis.length > 1) { c.strokeStyle = P.cl; c.lineWidth = 2; c.beginPath(); vis.forEach(([t, v], i) => (i ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke(); }
  }
  function out() {
    const el = $('#pdOut');
    if (st.play) { setOut(el, `Ошибка захвата: <b>${fmt1(st.err * 100, 1)} см</b>`); return; }
    if (st.pull) { setOut(el, `Тянешь захват: ошибка <b>${fmt1(st.err * 100, 1)} см</b>. Отпусти — регулятор вернёт его.`); return; }
    if (!st.last) { setOut(el, 'Рука висит, в захвате чашка. Запуск — кнопкой в карточке миссии.'); return; }
    const m = st.last;
    setOut(el, `Последний запуск (Kp ${m.Kp}, Kd ${fmt1(m.Kd, 1)}${m.comp ? ', с компенсацией' : ''}): провис <b>${fmt1(m.sag, 1)} см</b> · размах за последнюю секунду <b>${fmt1(m.swing, 1)} см</b> · успокоение <b>${m.settle >= T - 0.05 ? 'нет' : fmt1(m.settle, 1) + ' с'}</b>`);
  }
  function render() { draw(); plot(); out(); }
  function syncCtl() {
    const kp = $('#pdKp'), kd = $('#pdKd'), comp = $('#pdComp');
    kp.nextElementSibling.textContent = kp.value; kd.nextElementSibling.textContent = fmt1(+kd.value, 1);
    Object.assign(st.o, { Kp: +kp.value, Kd: +kd.value, comp: comp.checked });
  }
  function setCtl(o) { if (o.Kp != null) $('#pdKp').value = o.Kp; if (o.Kd != null) $('#pdKd').value = o.Kd; if (o.comp != null) $('#pdComp').checked = o.comp; syncCtl(); }
  const api = {
    reset() { st.play = null; st.live = false; st.hist = []; st.last = null; st.runs = []; st.pull = null; st.s = A.ctlInit('pd'); setCtl({ Kp: 60, Kd: 0, comp: false }); render(); },
    run, setCtl, state: () => Object.assign({}, st.o),
  };
  const sag = { label: 'Провис меньше 4 см', test: (r) => r.sag < 4 };
  const calm = (txt) => ({ label: txt || 'Рука успокаивается быстрее 2 с', test: (r) => r.settle < 2 });
  const sum = (r) => `Kp ${r.Kp}, Kd ${fmt1(r.Kd, 1)}${r.comp ? ', компенсация' : ''} → провис ${fmt1(r.sag, 1)} см, размах ${fmt1(r.swing, 1)} см`;
  const missions = [
    { short: 'Одна пружина', title: 'Подними чашку одной пружиной', text: 'Регулятор тянет суставы к углам, при которых чашка оказывается у полки. Пока у него есть только пружина Kp, демпфера нет: Kd = 0. Запусти дважды с разными Kp и сравни.', controls: ['kp'],
      onEnter: (X) => X.setCtl({ Kd: 0, comp: false }),
      bet: { q: 'что будет с рукой?', options: ['Встанет у полки', 'Остановится ниже полки', 'Будет раскачиваться'], answer: (r) => (r.swing > 5 ? 2 : r.sag > 2 ? 1 : 0) },
      action: { label: 'Поднять чашку', run: (X) => X.run() },
      criteria: [{ label: 'Запуск с двумя разными Kp', test: () => new Set(st.runs.filter((m) => m.Kd === 0 && !m.comp).map((m) => m.Kp)).size >= 2 }],
      summary: (r) => `Kp ${r.Kp}, Kd 0 → захват мотается от ${fmt1(r.lo, 0)} до ${fmt1(r.hi, 0)} см от цели`,
      fail: (r) => `Рука раскачивается: захват мотается от ${fmt1(r.lo, 0)} до ${fmt1(r.hi, 0)} см от цели. Поменяй Kp и подними чашку ещё раз. Поможет ли пружина жёстче или мягче?`,
      explain: (r) => `При любом Kp рука раскачивается: в последнем запуске захват мотается от ${fmt1(r.lo, 0)} до ${fmt1(r.hi, 0)} см от цели. Пружина без демпфера не теряет энергию, и колебания не затухают. Жёсткость меняет только их частоту. Нужно что-то, что забирает энергию движения.` },
    { short: 'Демпфер', title: 'Останови раскачку', text: 'Энергию движения забирает демпфер Kd: он создаёт момент против скорости сустава, как амортизатор. Подбери Kd, чтобы рука успокоилась.', controls: ['kp', 'kd'],
      action: { label: 'Поднять чашку', run: (X) => X.run() },
      criteria: [{ label: 'Размах за последнюю секунду меньше 1 см', test: (r) => r.swing < 1 }, calm()],
      summary: (r) => `Kp ${r.Kp}, Kd ${fmt1(r.Kd, 1)} → размах ${fmt1(r.swing, 1)} см, успокоение ${r.settle >= T - 0.05 ? 'нет' : fmt1(r.settle, 1) + ' с'}`,
      hint: 'Начни с Kd = 5. Если рука ползёт к цели слишком медленно, демпфер великоват.',
      fail: () => 'Рука ещё не успокоилась. Добавь демпфера.',
      explain: (r) => `Раскачка погасла за ${fmt1(r.settle, 1)} с. Но посмотри на график: ошибка застыла на ${fmt1(r.sag, 1)} см, захват остановился ниже полки. Регулятор создаёт момент, только пока есть ошибка, а держать чашку против тяжести нужно постоянно. Рука застывает там, где пружина уравновешивает вес. Это и есть провис.` },
    { short: 'Жёсткость', title: 'Уменьши провис до 4 см', text: 'Провис возникает, потому что пружине нужно растянуться, чтобы держать вес. Компенсации веса пока нет: регулятор держит чашку сам. Сделай так, чтобы захват провисал меньше чем на 4 см и при этом не раскачивался.', controls: ['kp', 'kd'],
      action: { label: 'Поднять чашку', run: (X) => X.run() },
      criteria: [sag, calm('Рука успокаивается быстрее 2 с')],
      summary: sum,
      hint: 'Провис обратно пропорционален Kp: при Kp = 60 он 12,6 см. Во сколько раз нужно поднять Kp? Жёсткой пружине нужен и демпфер посильнее.',
      fail: (r) => (r.sag >= 4 ? `Провис ${fmt1(r.sag, 1)} см. Чем жёстче пружина, тем меньше она растягивается под весом.` : 'Провис уже меньше 4 см, но рука не успокаивается. Добавь демпфера.'),
      explain: (r) => `Провис ${fmt1(r.sag, 1)} см при Kp = ${r.Kp}: жёсткость пришлось поднять в ${fmt1(r.Kp / 60, 1)} раза. А слишком большой Kp у настоящего робота вместе с задержками и шумом датчиков приводит к колебаниям. И провис всё равно не исчез: без растяжения пружина не даёт силы.` },
    { short: 'Компенсация', title: 'Убери провис совсем', text: 'Жёсткость уменьшила провис, но не убрала его, а слишком большой Kp грозит колебаниями. Убери провис полностью и верни жёсткость к умеренной: Kp не больше 80.', controls: ['kp', 'kd', 'comp'],
      bet: { q: 'что уберёт провис полностью?', options: ['Kp ещё больше', 'Kd больше', 'Компенсация веса'], answer: () => 2 },
      action: { label: 'Поднять чашку', run: (X) => X.run() },
      criteria: [{ label: 'Провис меньше 0,5 см', test: (r) => r.sag < 0.5 }, { label: 'Kp не больше 80', test: (r) => r.Kp <= 80 }],
      summary: sum,
      hint: 'Включи компенсацию гравитации и верни Kp к 60.',
      fail: (r) => (r.Kp > 80 ? 'Слишком жёсткая пружина: верни Kp не выше 80.' : `Провис ${fmt1(r.sag, 1)} см. Пружина и демпфер провис не уберут: нужен момент, который держит вес, пока ошибки нет.`),
      explain: (r) => `Провис ${fmt1(r.sag, 1)} см при Kp = ${r.Kp}. Вес держит компенсация: регулятор заранее добавляет момент, который по модели руки уравновешивает её вес и вес чашки. Пружине остаётся исправлять ошибки. Если модели веса нет, ту же работу делает интегральная часть ПИД-регулятора: она копит ошибку и наращивает момент.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй Kp, Kd и компенсацию. После запуска захват можно тянуть мышью или пальцем: почувствуй, как пружина тянет его обратно. Попробуй большой Kp без демпфера.', final: true,
      action: { label: 'Поднять чашку', run: (X) => X.run() }, summary: sum },
  ];
  function init() {
    $('#pdKp').addEventListener('input', syncCtl); $('#pdKd').addEventListener('input', syncCtl); $('#pdComp').addEventListener('change', syncCtl);
    HeroKit.drag($('#pdCv'), W, H, {
      hit: (p) => { if (st.play || !st.live) return null; const e = A.fk(st.s.q), m = map(e.x, e.y); return Math.hypot(p.x - m.x, p.y - m.y) < 30 ? 'ee' : null; },
      move: (o, p) => { st.pull = inv(p.x, p.y); }, end: () => { st.pull = null; },
    });
    HeroKit.loop($('#pdCv'), tick);
    setCtl({ Kp: 60, Kd: 0, comp: false });
    legend('#pdLegend', [['ошибка захвата, см', 'var(--classic)']]);
    ctl = mountMissions('#pdMis', missions, api, { controls: { kp: '#wrapKp', kd: '#wrapKd', comp: '#wrapComp' } });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Лаборатория 3: две руки на одном столе ---------- */
const ImpLab = (() => {
  const A = Arm, W = 520, H = 270, S = 280, D = 1.5, BL = 50, OY = 145, PW = 520, PH = 110, T = 3;
  const mapL = (x, y) => ({ x: BL + x * S, y: OY - y * S }), mapR = (x, y) => ({ x: BL + (D - x) * S, y: OY - y * S });
  const invL = (px, py) => ({ x: (px - BL) / S, y: (OY - py) / S }), invR = (px, py) => ({ x: D - (px - BL) / S, y: (OY - py) / S });
  const mk = (mode) => ({ mode, s: A.ctlInit(mode), fr: null, F: 0, peak: 0, hist: [], pull: null });
  const st = { K: 400, err: 0.04, arms: { pos: mk('pos'), imp: mk('imp') }, play: null, live: false, last: null };
  let ctl = null;
  const opts = (mode) => (mode === 'pos' ? { mode: 'pos', errH: st.err } : { mode: 'imp', Kimp: st.K, errH: st.err });
  const rest = (r) => { const xs = r.frames.filter((f) => f.t >= T - 0.5 - 1e-9).map((f) => f.F); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  function run() {
    const rp = A.simulate(opts('pos'), T), ri = A.simulate(opts('imp'), T);
    const m = { K: st.K, err: st.err, peakP: rp.peak, peakI: ri.peak, restP: rest(rp), restI: rest(ri) };
    st.arms.pos.fr = rp.frames; st.arms.imp.fr = ri.frames; st.live = false; st.last = null;
    for (const a of Object.values(st.arms)) { a.hist = []; a.peak = 0; a.pull = null; }
    return new Promise((res) => {
      st.play = playback(rp.frames.length, 10, () => {
        for (const a of Object.values(st.arms)) { const f = a.fr[a.fr.length - 1]; a.s = { q: f.q.slice(), dq: f.dq.slice() }; a.F = f.F; a.hist = a.fr.map((x) => [x.t, x.F]); a.peak = Math.max(...a.fr.map((x) => x.F)); }
        st.play = null; st.live = true; st.last = m; render(); res(m);
      });
    });
  }
  function tick(dt) {
    if (st.play) {
      const i = st.play.index();
      for (const a of Object.values(st.arms)) { const f = a.fr[Math.min(i, a.fr.length - 1)]; a.s = { q: f.q.slice(), dq: f.dq.slice() }; a.F = f.F; a.hist = a.fr.slice(0, i + 1).map((x) => [x.t, x.F]); a.peak = Math.max(a.peak, f.F); }
    } else if (st.live) {
      const n = Math.max(1, Math.round(dt * 1000));
      let busy = false;
      for (const a of Object.values(st.arms)) { const o = opts(a.mode); let F = 0; for (let j = 0; j < n; j++) F = A.ctlStep(o, a.s, a.pull); a.F = F; busy = busy || !!a.pull || Math.abs(a.s.dq[0]) + Math.abs(a.s.dq[1]) > 0.02; }
      if (busy) for (const a of Object.values(st.arms)) { const t = (a.hist.length ? a.hist[a.hist.length - 1][0] : 0) + n / 1000; a.hist.push([t, a.F]); if (a.hist.length > 1200) a.hist.shift(); }
    }
    render();
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#impCv'), W, H), P = pal2();
    sideBase(c, P, W, H);
    const tl = mapL(0.2, A.TABLE), tr = mapR(0.2, A.TABLE);
    c.fillStyle = P.surf; c.fillRect(tl.x, tl.y, tr.x - tl.x, H - tl.y);
    c.strokeStyle = P.ink2; c.lineWidth = 2.5; c.beginPath(); c.moveTo(tl.x, tl.y); c.lineTo(tr.x, tl.y); c.stroke();
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(tl.x, tl.y); c.lineTo(tl.x, H); c.moveTo(tr.x, tl.y); c.lineTo(tr.x, H); c.stroke();
    HeroKit.label(c, k, 'стол', (tl.x + tr.x) / 2, H - 14, { color: P.ink3, px: 11, weight: 650, haloColor: P.surf });
    const yc = mapL(0, A.TABLE - st.err).y;
    if (st.err > 0.004) {
      c.setLineDash([4, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.5; c.beginPath(); c.moveTo(tl.x, yc); c.lineTo(tr.x, yc); c.stroke(); c.setLineDash([]);
      HeroKit.label(c, k, 'стол по данным камеры', (tl.x + tr.x) / 2, yc + 36, { color: P.bad, px: 11, haloColor: P.surf });
    }
    for (const [mode, map, col, dir] of [['pos', mapL, P.ink, -1], ['imp', mapR, P.cl, 1]]) {
      const a = st.arms[mode], b = map(0, 0);
      c.fillStyle = P.ink3; c.globalAlpha = 0.35; c.fillRect(b.x - 9, b.y + 6, 18, H - b.y - 6); c.globalAlpha = 1;
      const g = map(0.62, A.TABLE - 0.02 - st.err); crosshair(c, g.x, g.y, P, col);
      const e = drawArm(c, a.s.q, map, P, { color: col });
      c.fillStyle = col; c.globalAlpha = 0.55; c.fillRect(e.x - 14, e.y + 4, 28, 5); c.globalAlpha = 1;
      forceArrow(c, k, P, e.x + dir * 24, e.y + 8, a.F);
      if (a.pull) { const pp = map(a.pull.x, a.pull.y); c.strokeStyle = P.ink3; c.setLineDash([3, 3]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(pp.x, pp.y); c.stroke(); c.setLineDash([]); }
    }
  }
  function plot() {
    const { c, k, H: ph } = plotFit($('#impPlot'), PW, PH, 160), P = pal2();
    const hp = st.arms.pos.hist, hi = st.arms.imp.hist, last = Math.max(hp.length ? hp[hp.length - 1][0] : 0, hi.length ? hi[hi.length - 1][0] : 0), tEnd = Math.max(T, last), tS = tEnd - T;
    let mx = 50; for (const hh of [hp, hi]) for (const [t, v] of hh) if (t >= tS) mx = Math.max(mx, v);
    const vmax = niceUp(mx, [50, 100, 150, 200, 300, 400, 600, 1000, 1500, 3000]);
    const yt = [[0, '0'], [vmax / 2, fmt1(vmax / 2, 0)], [vmax, fmt1(vmax, 0)]], box = plotBox(k, PW, ph, yt);
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, ph);
    const x = (t) => box.l + (t - tS) / T * (box.r - box.l), y = (v) => box.b - Math.min(1, v / vmax) * (box.b - box.t);
    const xt = []; for (let s = Math.ceil(tS); s <= Math.floor(tEnd); s++) xt.push([s, `${s} с`, s === Math.floor(tEnd) && x(s) > box.r - 12 ? 'right' : x(s) < box.l + 12 ? 'left' : 'center']);
    axes(c, k, P, box, xt, yt, x, y);
    for (const [hh, col] of [[hp, P.ink], [hi, P.cl]]) { const vis = hh.filter(([t]) => t >= tS); if (vis.length < 2) continue; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); vis.forEach(([t, v], i) => (i ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke(); }
  }
  function out() {
    const el = $('#impOut'), a = st.arms;
    if (!st.play && !st.last && !st.live) { setOut(el, 'Обе руки над столом. Запуск — кнопкой в карточке миссии.'); return; }
    if (st.play || (st.live && (a.pos.pull || a.imp.pull)) || !st.last) { setOut(el, `Сила прижима: позиционная <b>${fmt1(a.pos.F, 0)} Н</b> · импедансная <b>${fmt1(a.imp.F, 0)} Н</b>`); return; }
    const m = st.last;
    setOut(el, `Ошибка камеры ${fmt1(m.err * 100, 1)} см. Позиционная: удар <b>${fmt1(m.peakP, 0)} Н</b>, в покое <b>${fmt1(m.restP, 1)} Н</b>. Импедансная, ${m.K} Н/м: удар <b>${fmt1(m.peakI, 0)} Н</b>, в покое <b>${fmt1(m.restI, 1)} Н</b>.`);
  }
  function render() { draw(); plot(); out(); }
  function syncCtl() { const kk = $('#impK'), er = $('#impErr'); kk.nextElementSibling.textContent = kk.value + ' Н/м'; er.nextElementSibling.textContent = fmt1(+er.value, 1) + ' см'; st.K = +kk.value; st.err = +er.value / 100; if (!st.play) draw(); if (ctl) ctl.update(); }
  function setCtl(o) { if (o.K != null) $('#impK').value = o.K; if (o.err != null) $('#impErr').value = o.err; syncCtl(); }
  const api = {
    reset() { st.play = null; st.live = false; st.last = null; st.arms = { pos: mk('pos'), imp: mk('imp') }; setCtl({ K: 400, err: 4 }); render(); },
    run, setCtl, state: () => ({ K: st.K, err: st.err }),
  };
  const sum = (r) => `ошибка ${fmt1(r.err * 100, 1)} см, K ${r.K} → импеданс: удар ${fmt1(r.peakI, 0)} Н, прижим ${fmt1(r.restI, 1)} Н`;
  const missions = [
    { short: 'Кто сильнее', title: 'Кто ударит стол сильнее', text: 'Камера ошиблась на 4 см: стол кажется ниже, чем на самом деле. Обе руки опускают тряпки к одной и той же ошибочной цели. Импедансная рука — пружина жёсткостью 400 Н/м.', controls: [],
      onEnter: (X) => X.setCtl({ K: 400, err: 4 }),
      bet: { q: 'какая рука ударит стол сильнее?', options: ['Позиционная', 'Импедансная', 'Одинаково'], answer: (r) => (Math.abs(r.peakP - r.peakI) < 10 ? 2 : r.peakP > r.peakI ? 0 : 1) },
      action: { label: 'Опустить тряпки', run: (X) => X.run() },
      summary: (r) => `удар: позиционная ${fmt1(r.peakP, 0)} Н, импедансная ${fmt1(r.peakI, 0)} Н`,
      explain: (r) => `Удар позиционной руки — <b>${fmt1(r.peakP, 0)} Н</b>, как груз в ${fmt1(r.peakP / 9.81, 0)} кг, и дальше она давит на стол с силой ${fmt1(r.restP, 0)} Н. Импедансная бьёт с силой <b>${fmt1(r.peakI, 0)} Н</b> и прижимает тряпку с силой ${fmt1(r.restI, 0)} Н. Позиционный регулятор любой ценой тянет захват в точку под столом. Импедансный тянет как пружина: сила растёт с расстоянием до цели, и только.` },
    { short: 'Жёсткость', title: 'Подбери жёсткость для протирки', text: 'Пусть тряпка оттирает стол, когда прижата с силой от 10 до 20 Н. Слабее — скользит по пятнам, сильнее — рука зря давит на стол. Ошибка камеры та же, 4 см. Подбери жёсткость импедансной руки.', controls: ['k'],
      action: { label: 'Опустить тряпки', run: (X) => X.run() },
      criteria: [{ label: 'Импедансная рука прижимает тряпку с силой от 10 до 20 Н', test: (r) => r.restI >= 10 && r.restI <= 20 }],
      summary: sum,
      hint: 'Сила прижима ≈ K × 6 см: цель на 6 см ниже стола — 2 см задуманного прижима плюс 4 см ошибки камеры.',
      fail: (r) => (r.restI > 20 ? `Прижим ${fmt1(r.restI, 1)} Н — многовато. Сделай пружину мягче.` : `Прижим ${fmt1(r.restI, 1)} Н — маловато. Сделай пружину жёстче.`),
      explain: (r) => `При K = ${r.K} Н/м тряпка прижата с силой ${fmt1(r.restI, 1)} Н. Импеданс превращает ошибку в силу по закону пружины: F ≈ K · Δx. Поэтому жёсткость выбирают под задачу: мягкую — чтобы вставить штекер, жёсткую — чтобы удержать тяжёлую кастрюлю. Позиционная рука при той же ошибке давит с силой ${fmt1(r.restP, 0)} Н.` },
    { short: 'Предел', title: 'Слишком жёсткий импеданс', text: 'Импеданс не делает руку мягкой сам по себе: мягкость задаёт жёсткость K. Поставь ошибку камеры 6 см и найди жёсткость, при которой импедансная рука ударит стол сильнее 150 Н.', controls: ['k', 'err'],
      action: { label: 'Опустить тряпки', run: (X) => X.run() },
      criteria: [{ label: 'Ошибка камеры 6 см', test: (r) => r.err >= 0.06 - 1e-9 }, { label: 'Удар импедансной руки сильнее 150 Н', test: (r) => r.peakI > 150 }],
      summary: sum,
      hint: 'Удар растёт и с ошибкой камеры, и с жёсткостью. Увеличь жёсткость почти до максимума.',
      fail: (r) => (r.err < 0.06 - 1e-9 ? 'Сначала поставь ошибку камеры 6 см.' : `Удар ${fmt1(r.peakI, 0)} Н. Пружина ещё мягкая: сделай её жёстче.`),
      explain: (r) => { const soft = A.simulate({ mode: 'imp', Kimp: 400, errH: r.err }, T).peak; return `При K = ${r.K} Н/м импедансная рука ударила с силой ${fmt1(r.peakI, 0)} Н, а при 400 Н/м и той же ошибке было бы ${fmt1(soft, 0)} Н. Чем жёстче импеданс, тем ближе он к позиционному регулятору: тот ударил с силой ${fmt1(r.peakP, 0)} Н.${r.restI > r.restP ? ` А в покое такая рука давит даже сильнее позиционной, ${fmt1(r.restI, 0)} Н против ${fmt1(r.restP, 0)}: позиционный регулятор — тоже пружина, только в углах суставов, и здесь она мягче.` : ''} Импеданс задаёт связь силы и смещения: какую жёсткость выберешь, так рука и ответит на ошибку.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй жёсткость и ошибку камеры. После запуска захваты можно тянуть мышью или пальцем: сравни, как каждая рука возвращает тряпку.', final: true,
      action: { label: 'Опустить тряпки', run: (X) => X.run() }, summary: sum },
  ];
  function init() {
    $('#impK').addEventListener('input', syncCtl); $('#impErr').addEventListener('input', syncCtl);
    HeroKit.drag($('#impCv'), W, H, {
      hit: (p) => { if (st.play || !st.live) return null; for (const [mode, map] of [['pos', mapL], ['imp', mapR]]) { const e = A.fk(st.arms[mode].s.q), m = map(e.x, e.y); if (Math.hypot(p.x - m.x, p.y - m.y) < 30) return mode; } return null; },
      move: (mode, p) => { st.arms[mode].pull = mode === 'pos' ? invL(p.x, p.y) : invR(p.x, p.y); },
      end: (mode) => { st.arms[mode].pull = null; },
    });
    HeroKit.loop($('#impCv'), tick);
    legend('#impLegend', [['позиционная рука', 'var(--ink)'], ['импедансная', 'var(--classic)'], ['сила, с которой стол давит на тряпку', 'var(--critical)']]);
    setCtl({ K: 400, err: 4 });
    ctl = mountMissions('#impMis', missions, api, { controls: { k: '#wrapK', err: '#wrapErr' } });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Скользящий горизонт: два робота на одной карте ---------- */
const MpcLab = (() => {
  const M = Mpc, W = 520, H = 364, S = 260, HB = 30, DEF = { x1: 0.26, cy: 0, h: 64, d: 51 };
  const map = (x, y) => ({ x: W / 2 + x * S, y: H / 2 - y * S }), inv = (px, py) => ({ x: (px - W / 2) / S, y: (H / 2 - py) / S });
  const st = { HA: 6, trap: Object.assign({}, DEF), walls: M.WALLS, ok: true, edit: false, res: null, play: null, runs: [] };
  let ctl = null;
  const trapRect = () => { const t = st.trap; return { x0: t.x1 - t.d / 100, x1: t.x1, y0: t.cy - t.h / 200, y1: t.cy + t.h / 200 }; };
  function rebuild() {
    const same = st.trap.x1 === DEF.x1 && st.trap.cy === DEF.cy && st.trap.h === DEF.h && st.trap.d === DEF.d;
    st.walls = same ? M.WALLS : M.trap(Object.assign(trapRect(), { t: 0.06 })); st.ok = M.reachable(st.walls);
  }
  function run() {
    const HA = st.HA, a = M.run(HA, { seed: 11, walls: st.walls }), b = M.run(HB, { seed: 11, walls: st.walls });
    const r = { HA, A: { reached: a.reached, t: a.t, dist: a.dist }, B: { reached: b.reached, t: b.t, dist: b.dist }, reachable: st.ok, h: st.trap.h, d: st.trap.d };
    st.res = { a, b, r };
    return new Promise((res) => { st.play = playback(Math.max(a.frames.length, b.frames.length), 1000 / 30, () => { st.play = null; st.runs.push({ H: HA, reached: a.reached }); draw(); res(r); }); });
  }
  const robotAt = (fr, i) => fr[Math.min(i, fr.length - 1)];
  function drawRobot(c, k, P, fr, i, col, name) {
    const f = robotAt(fr, i);
    c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); for (let j = 0; j <= Math.min(i, fr.length - 1); j++) { const p = map(fr[j].x, fr[j].y); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.stroke();
    c.setLineDash([5, 4]); c.lineWidth = 2; c.beginPath(); f.plan.forEach(([x, y], j) => { const p = map(x, y); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.stroke(); c.setLineDash([]);
    const p = map(f.x, f.y); c.beginPath(); c.arc(p.x, p.y, M.R * S, 0, 7); c.fillStyle = col; c.fill();
    HeroKit.label(c, k, name, p.x, p.y - 20, { color: col, px: 12, weight: 800, haloColor: P.bg });
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#mpcCv'), W, H), P = pal2();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 26, P.grid);
    for (const w of st.walls) { const a = map(w.x0, w.y1), b = map(w.x1, w.y0); c.beginPath(); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); HeroKit.hatch(c, a.x, a.y, b.x, b.y, st.ok ? P.ink3 : P.bad, 6, 1); c.strokeStyle = st.ok ? P.ink2 : P.bad; c.lineWidth = 1.5; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    if (st.edit) { const t = trapRect(), a = map(t.x0, t.y1), b = map(t.x1, t.y0); c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.strokeRect(a.x - 8, a.y - 8, b.x - a.x + 16, b.y - a.y + 16); c.setLineDash([]); }
    const s0 = map(M.START.x, M.START.y), g = map(M.GOAL.x, M.GOAL.y);
    c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.beginPath(); c.arc(s0.x, s0.y, 7, 0, 7); c.stroke(); HeroKit.label(c, k, 'старт', s0.x, s0.y + 24, { color: P.ink3, px: 11, haloColor: P.bg });
    crosshair(c, g.x, g.y, P); HeroKit.label(c, k, 'цель', g.x, g.y + 26, { color: P.ink2, px: 11, haloColor: P.bg });
    if (st.res) {
      const i = st.play ? st.play.index() : Math.max(st.res.a.frames.length, st.res.b.frames.length) - 1;
      c.lineWidth = 1; c.globalAlpha = 0.14;
      for (const [fr, col] of [[st.res.a.frames, P.ink], [st.res.b.frames, P.cl]]) { const f = robotAt(fr, i); c.strokeStyle = col; for (const pts of f.cands) { c.beginPath(); pts.forEach(([x, y], j) => { const p = map(x, y); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.stroke(); } }
      c.globalAlpha = 1;
      drawRobot(c, k, P, st.res.a.frames, i, P.ink, 'А'); drawRobot(c, k, P, st.res.b.frames, i, P.cl, 'Б');
      out(i);
    } else {
      for (const [col, name, dy] of [[P.ink, 'А', 0], [P.cl, 'Б', 0]]) { const p = map(M.START.x, M.START.y + dy); c.beginPath(); c.arc(p.x, p.y, M.R * S, 0, 7); c.fillStyle = col; c.fill(); HeroKit.label(c, k, name, p.x + (name === 'А' ? -12 : 12), p.y - 20, { color: col, px: 12, weight: 800, haloColor: P.bg }); }
      out(0);
    }
  }
  function out(i) {
    const el = $('#mpcOut'), hs = (n) => fmt1(n * M.DT, 1) + ' с', warn = st.ok ? '' : '<br><b>Путь к цели перекрыт:</b> так не доедет никто. Сдвинь или уменьши ловушку.';
    if (!st.res) { setOut(el, `Горизонт робота А — <b>${hs(st.HA)}</b>, робота Б — <b>${hs(HB)}</b>. Запуск — кнопкой в карточке миссии.${warn}`); return; }
    const { a, b, r } = st.res, line = (name, run, Hh) => {
      if (st.play) { const f = robotAt(run.frames, i); return `${name} · горизонт ${hs(Hh)} · до цели ${fmt1(Math.hypot(M.GOAL.x - f.x, M.GOAL.y - f.y) * 100, 0)} см`; }
      return `<b>${name}</b> · горизонт ${hs(Hh)} · ${run.reached ? `доехал за <b>${fmt1(run.t, 1)} с</b>` : `застрял, через ${fmt1(run.t, 0)} с до цели <b>${fmt1(run.dist * 100, 0)} см</b>`}`;
    };
    setOut(el, (st.play ? `Прошло ${fmt1(i * M.DT, 1)} с<br>` : '') + line('А', a, r.HA) + '<br>' + line('Б', b, HB) + warn);
  }
  function syncCtl() {
    const hA = $('#mpcH'), th = $('#mpcTH'), td = $('#mpcTD');
    st.HA = +hA.value; hA.nextElementSibling.textContent = fmt1(st.HA * M.DT, 1) + ' с';
    st.trap.h = +th.value; th.nextElementSibling.textContent = fmt1(st.trap.h / 100, 2) + ' м';
    st.trap.d = +td.value; td.nextElementSibling.textContent = fmt1(st.trap.d / 100, 2) + ' м';
    fitTrap(); rebuild(); if (!st.play) { st.res = null; draw(); } if (ctl) ctl.update();
  }
  function fitTrap() { const t = st.trap; t.x1 = Math.max(-0.96 + t.d / 100, Math.min(0.96, t.x1)); const hh = t.h / 200; t.cy = Math.max(-0.68 + hh, Math.min(0.68 - hh, t.cy)); }
  function setCtl(o) { if (o.HA != null) $('#mpcH').value = o.HA; if (o.h != null) $('#mpcTH').value = o.h; if (o.d != null) $('#mpcTD').value = o.d; if (o.x1 != null) st.trap.x1 = o.x1; if (o.cy != null) st.trap.cy = o.cy; syncCtl(); }
  const api = {
    reset() { st.res = null; st.play = null; st.runs = []; st.trap = Object.assign({}, DEF); setCtl({ HA: 6, h: DEF.h, d: DEF.d }); },
    run, setCtl, state: () => ({ HA: st.HA, ok: st.ok, runs: st.runs.slice() }),
  };
  const sec = (n) => fmt1(n * M.DT, 1);
  const missions = [
    { short: 'Кто доедет', title: 'Кто доедет до цели', text: 'Планировщики у роботов одинаковые, разные только горизонты. Робот А заглядывает на 0,6 с вперёд — это 30 см пути. Робот Б — на 3 с, полтора метра.', controls: [],
      onEnter: (X) => X.setCtl({ HA: 6 }),
      bet: { q: 'кто доедет до цели за 14 секунд?', options: ['Оба', 'Только Б', 'Только А', 'Никто'], answer: (r) => (r.A.reached && r.B.reached ? 0 : r.B.reached ? 1 : r.A.reached ? 2 : 3) },
      action: { label: 'Запустить обоих', run: (X) => X.run() },
      summary: (r) => `А ${sec(r.HA)} с: ${r.A.reached ? 'доехал' : 'застрял'} · Б 3 с: ${r.B.reached ? 'доехал за ' + fmt1(r.B.t, 1) + ' с' : 'застрял'}`,
      explain: (r) => `Робот А заехал в ловушку и застрял: на 30 см вперёд любой путь к цели упирается в стену, а отъехать назад планировщику кажется хуже. Через ${fmt1(r.A.t, 0)} с до цели всё ещё <b>${fmt1(r.A.dist * 100, 0)} см</b>. Робот Б видит на полтора метра вперёд, находит объезд и доезжает за <b>${fmt1(r.B.t, 1)} с</b>.` },
    { short: 'Порог', title: 'Найди самый короткий горизонт', text: 'Какой горизонт нужен роботу А, чтобы выбраться? Найди самый короткий: с ним робот доезжает, а с горизонтом на 0,1 с короче застревает.', controls: ['h'],
      onEnter: () => { st.runs = []; },
      action: { label: 'Запустить обоих', run: (X) => X.run() },
      criteria: [{ label: 'Робот А доехал', test: (r, s) => s.runs.some((x) => x.reached) }, { label: 'С горизонтом на 0,1 с короче он застревает', test: (r, s) => s.runs.some((x) => x.reached && s.runs.some((y) => !y.reached && y.H === x.H - 1)) }],
      summary: (r) => `А, горизонт ${sec(r.HA)} с → ${r.A.reached ? 'доехал за ' + fmt1(r.A.t, 1) + ' с' : 'застрял, ' + fmt1(r.A.dist * 100, 0) + ' см'}`,
      hint: 'Ищи делением пополам: 0,6 с мало, 3 с хватает. Попробуй середину, потом середину оставшегося отрезка.',
      fail: (r) => (r.A.reached ? 'Робот А доехал. Короче горизонт тоже сработает? Проверь.' : 'Робот А застрял. Горизонт нужен длиннее.'),
      explain: (r, ctx) => { const x = st.runs.find((q) => q.reached && st.runs.some((y) => !y.reached && y.H === q.H - 1)); return `Порог — <b>${sec(x.H)} с</b>, это ${fmt1(x.H * M.DT * M.V, 2)} м пути: примерно столько нужно, чтобы план выбрался из ловушки и обогнул стенку. Порог зависит и от случайности перебора: на других зёрнах генератора он от 2,0 до 2,3 с, а с горизонтом от 2,5 с объезжают все 20 зёрен из 20. Длинный горизонт стоит вычислений: варианты перебирают на каждом шаге.`; } },
    { short: 'Горизонт', title: 'Найди ловушку, где горизонта не хватает', text: 'Горизонт 3 с вывел робота Б из этой ловушки. Найдётся ли ловушка и для него? Перестрой её так, чтобы робот Б не доехал. Ловушку можно тащить мышью или пальцем, ползунки меняют её размер. Путь в объезд должен остаться.', controls: ['h', 'th', 'td'],
      onEnter: () => { st.edit = true; draw(); },
      action: { label: 'Запустить обоих', run: (X) => X.run() },
      criteria: [{ label: 'Путь к цели существует', test: (r) => r.reachable }, { label: 'Робот Б не доехал за 14 с', test: (r) => !r.B.reached }],
      summary: (r) => `ловушка ${fmt1(r.h / 100, 2)} × ${fmt1(r.d / 100, 2)} м → Б ${r.B.reached ? 'доехал за ' + fmt1(r.B.t, 1) + ' с' : 'застрял'}`,
      hint: 'Робот Б видит на 1,5 м пути. Сделай объезд длиннее: ловушку выше или глубже.',
      fail: (r) => (!r.reachable ? 'Путь к цели перекрыт: так у задачи нет решения. Оставь проход.' : `Робот Б доехал за ${fmt1(r.B.t, 1)} с. Объезд ещё короче его горизонта.`),
      explain: (r) => `Робот Б застрял: через 14 с до цели ${fmt1(r.B.dist * 100, 0)} см. Объезд стал длиннее того, что он видит, и любой план на 3 с упирается в стену. Своя ловушка найдётся для любого горизонта: за его пределами планировщик не видит ничего.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй горизонт робота А и ловушку, двигай её. Попробуй поставить старт внутрь ловушки.', final: true, onEnter: () => { st.edit = true; draw(); },
      action: { label: 'Запустить обоих', run: (X) => X.run() },
      summary: (r) => `А ${sec(r.HA)} с: ${r.A.reached ? 'доехал' : 'застрял'} · Б 3 с: ${r.B.reached ? 'доехал' : 'застрял'}` },
  ];
  function init() {
    legend('#mpcLegend', [['робот А: путь и план', 'var(--ink)'], ['робот Б', 'var(--classic)'], ['план — пунктиром, бледные линии — перебранные варианты', 'var(--ink-3)', true]]);
    $('#mpcH').addEventListener('input', syncCtl); $('#mpcTH').addEventListener('input', syncCtl); $('#mpcTD').addEventListener('input', syncCtl);
    let grab = null;
    HeroKit.drag($('#mpcCv'), W, H, {
      hit: (p) => { if (!st.edit || st.play) return null; const t = trapRect(), w = inv(p.x, p.y), pad = 0.05; return w.x > t.x0 - pad && w.x < t.x1 + pad && w.y > t.y0 - pad && w.y < t.y1 + pad ? 'trap' : null; },
      start: (o, p) => { const w = inv(p.x, p.y); grab = { dx: w.x - st.trap.x1, dy: w.y - st.trap.cy }; },
      move: (o, p) => { const w = inv(p.x, p.y); st.trap.x1 = Math.round((w.x - grab.dx) * 100) / 100; st.trap.cy = Math.round((w.y - grab.dy) * 100) / 100; fitTrap(); rebuild(); st.res = null; draw(); if (ctl) ctl.update(); },
    });
    HeroKit.loop($('#mpcCv'), () => { if (st.play) draw(); });
    setCtl({ HA: 6, h: DEF.h, d: DEF.d });
    ctl = mountMissions('#mpcMis', missions, api, { controls: { h: '#wrapH', th: '#wrapTH', td: '#wrapTD' }, onStep: (i) => { st.edit = i >= 2; draw(); } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Кто исполняет команды сети ---------- */
const Stack = (() => {
  const S = [
    { name: 'RL-ходьба', flow: [['Политика ходьбы', '50 Гц', 'углы и скорости суставов, IMU, команда → 12 целевых углов', 'nn'], ['ПД-регуляторы суставов', 'на драйверах', 'Kp = 20 Н·м/рад, Kd = 0,5 (legged_gym, робот A1)', 'cl'], ['Моторы', '', 'моменты', 'hw']], note: 'Так учат ходить в симуляторе за минуты (Rudin и соавторы, 2022). У ANYmal политика работает на 200 Гц, а ПД-регуляторы с Kp = 50 и Kd = 0,1 стоят в самих приводах (Hwangbo и соавторы, 2019).' },
    { name: 'VLA π0', flow: [['Модель π0', 'раз в 0,5 с', 'камеры, текст и углы → пачка из 50 действий; вывод 73 мс на RTX 4090', 'nn'], ['Пачка действий', '50 Гц', 'робот исполняет первые 25 действий', 'nn'], ['Регуляторы суставов', '', 'целевые углы → моменты', 'cl']], note: 'Поэтому «50 Гц» у π0 — частота действий, а не вызовов модели.' },
    { name: 'Diffusion Policy', flow: [['Diffusion Policy', '10 Гц', 'камеры → поза захвата', 'nn'], ['Дифференциальная кинематика', '', 'квадратичная задача: поза захвата → углы суставов', 'cl'], ['Регулятор руки Franka', '1 кГц', 'углы → моменты', 'cl']], note: 'Здесь работает якобиан из раздела 2: он переводит желаемое движение захвата в движение суставов.' },
    { name: 'Atlas и LBM', flow: [['Большая модель поведения', '30 Гц', '450 млн параметров, пачка из 48 действий', 'nn'], ['MPC Boston Dynamics', '', 'позы кистей, стоп и торса → движения суставов', 'cl'], ['Суставы', '', '', 'hw']], note: 'Совместная работа Boston Dynamics и Toyota Research Institute, август 2025 года.' },
    { name: 'Figure Helix 02', flow: [['S2', '7–9 Гц', 'модель «зрение и язык», 7 млрд параметров', 'nn'], ['S1', '200 Гц', '80 млн параметров', 'nn'], ['S0', '1 кГц', '10 млн параметров, команды приводам', 'nn'], ['Приводы', '', '', 'hw']], note: 'Слой S0 появился в январе 2026 года и заменил 109 504 строки кода на C++. Нейросети спускаются даже в нижний контур, но иерархия частот остаётся.' },
  ];
  const COL = { nn: 'var(--e2e)', cl: 'var(--classic)', hw: 'var(--ink-3)' };
  function show(i) {
    $$('#stackSeg button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const s = S[i], box = $('#stackBox'); box.innerHTML = '';
    const flow = h('div', { class: 'flow' });
    s.flow.forEach(([t, f, d, kind], j) => {
      if (j) flow.append(h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→'));
      flow.append(h('div', { class: 'flow-box', style: `--c:${COL[kind]}` }, h('h4', null, t), f ? h('div', { class: 'fq' }, f) : null, d ? h('p', null, d) : null));
    });
    box.append(flow, h('p', { class: 'muted-s', style: 'margin:12px 0 0' }, s.note));
  }
  function init() {
    S.forEach((s, i) => { const b = h('button', { type: 'button' }, s.name); b.addEventListener('click', () => show(i)); $('#stackSeg').append(b); });
    $('#stackBox').before(h('div', { class: 'cv-legend', style: 'margin:0 0 4px' }, ...[['нейросеть', COL.nn], ['классический регулятор', COL.cl], ['железо', COL.hw]].map(([t, c]) => h('span', null, h('i', { style: `--c:${c};height:8px;width:14px;border-radius:3px` }), t))));
    show(0);
  }
  return { init };
})();

/* ---------- Задача: разложи по частоте ---------- */
function initFreqSort() {
  return Cards.sort('#freqSort', {
    targets: [{ id: 'slow', label: 'До 10 Гц', note: 'решают, что делать' }, { id: 'mid', label: '20–200 Гц', note: 'выдают цели и движения' }, { id: 'fast', label: '1 кГц и чаще', note: 'держат суставы и ток' }],
    items: [
      { id: 's2', label: 'Модель «зрение и язык» S2 в Helix', target: 'slow', why: '7–9 Гц: большая модель думает о задаче медленно.' },
      { id: 'pchunk', label: 'Пересчёт пачки действий π0', target: 'slow', why: 'Модель запускают примерно раз в 0,5 с, вывод занимает 73 мс.' },
      { id: 'rl', label: 'Политика ходьбы в legged_gym', target: 'mid', why: '50 Гц: политика выдаёт целевые углы суставов.' },
      { id: 'mpc', label: 'MPC шагающего робота', target: 'mid', why: '20–100 Гц у Cheetah 3, Mini Cheetah и ANYmal.' },
      { id: 'pact', label: 'Действия из пачки π0', target: 'mid', why: '50 Гц: робот исполняет действия из пачки одно за другим.' },
      { id: 'pd', label: 'Регулятор суставов руки Franka', target: 'fast', why: '1 кГц: регулятор держит цель между командами политики.' },
      { id: 's0', label: 'Нейросеть S0 в Helix 02', target: 'fast', why: '1 кГц: с января 2026 года нейросеть работает даже в нижнем контуре.' },
      { id: 'cur', label: 'Регулятор тока мотора Cheetah 3', target: 'fast', why: 'Около 20 кГц: самый быстрый контур.' },
    ],
    after: 'Чем ниже слой, тем чаще он работает: медленная модель решает, что делать, быстрые контуры держат суставы и ток. Даже когда нейросеть спускается в нижний контур, как S0 у Helix 02, иерархия частот остаётся.',
  });
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
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'У обратной задачи кинематики всегда одно решение?', o: ['Да, как у прямой', 'Нет: у двухзвенной руки 0, 1 или 2, у шестизвенной — до 16, у семизвенной — бесконечно много', 'Решений всегда ровно два'], a: 1, e: 'Поэтому обратную кинематику для сложных рук считают численно и выбирают решение по дополнительным условиям: близость к текущей позе, пределы суставов, препятствия.' },
    { q: 'Сингулярности бывают только на краю досягаемости?', o: ['Да', 'Нет: например, сингулярность запястья лежит внутри рабочей зоны', 'Сингулярностей у настоящих роботов не бывает'], a: 1, e: 'У шестизвенной руки сингулярность запястья возникает, когда оси двух его суставов выстраиваются в линию, где бы ни находился захват.' },
    { q: 'Якобиан нужен только для скоростей?', o: ['Да', 'Нет: через транспонированный якобиан τ = Jᵀ·f считают моменты для нужной силы', 'Он нужен только для обратной кинематики'], a: 1, e: 'Импедансный регулятор из лаборатории 3 так и работает: считает силу в пространстве захвата и переводит её в моменты суставов.' },
    { q: 'Чем больше Kp, тем точнее регулятор?', o: ['Да, всегда', 'До поры: провис уменьшается, но с задержками и шумом начинаются колебания; провис от веса убирает компенсация гравитации', 'Kp на точность не влияет'], a: 1, e: 'В лаборатории провис падал обратно пропорционально Kp: 12,6 см при Kp = 60, 3,8 см при Kp = 190, но не исчезал. Компенсация гравитации убрала его при Kp не больше 80.' },
    { q: 'Импедансное управление — это управление силой?', o: ['Да', 'Нет: это заданная связь силы и смещения, жёсткость подбирают под задачу', 'Это просто очень мягкий робот'], a: 1, e: 'Импеданс может быть и жёстким: в лаборатории при жёсткости больше 1000 Н/м удар о стол превысил 150 Н. Важно, что робот ведёт себя как пружина с известной жёсткостью и при ошибке восприятия даёт предсказуемую силу.' },
    { q: 'Нейросеть, выучившая кинематику по данным, не ошибается?', o: ['Не ошибается, если данных много', 'Ошибается: если у одного входа в данных несколько правильных ответов, регрессия выдаёт их среднее', 'Ошибается только из-за шума в данных'], a: 1, e: 'В лаборатории сеть на двух решениях промахивалась в среднем на 23,5 см, а на одном — на 2 см. Данных в обоих опытах было поровну.' },
    { q: 'MPC — это нейросеть?', o: ['Да', 'Нет: это оптимизация по модели на скользящем горизонте', 'Это фильтр для датчиков'], a: 1, e: 'MPC на каждом шаге решает задачу оптимизации по модели робота и исполняет только начало плана. Идея пачки действий вернётся в уроке 1.7.' },
    { q: '«π0 работает на 50 Гц» значит, что модель вызывают 50 раз в секунду?', o: ['Да', 'Нет: модель выдаёт пачку из 50 действий и пересчитывает её примерно раз в полсекунды', 'Нет, модель вызывают раз в секунду'], a: 1, e: 'На 50-герцовых роботах исполняют 25 действий из пачки и снова запускают модель. Вывод занимает 73 мс на RTX 4090.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('fk', () => { mis.fk = FK.init(); }); safe('ik', () => { mis.ik = IK.init(); }); safe('jac', () => { mis.jac = Jac.init(); });
    safe('net', () => { mis.net = NetLab.init(); }); safe('pd', () => { mis.pd = PdLab.init(); }); safe('imp', () => { mis.imp = ImpLab.init(); }); safe('mpc', () => { mis.mpc = MpcLab.init(); });
    safe('stack', () => Stack.init()); safe('sort', () => { mis.sort = initFreqSort(); }); safe('quiz', initQuiz);
    window.__l03 = { mis, SPEED, FK, IK, Jac, NetLab, PdLab, ImpLab, MpcLab }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
