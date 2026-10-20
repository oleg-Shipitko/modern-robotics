/* =====================================================================
   ui-l15.js — урок 1.5 «Diffusion Policy».
   Интерактивы: награда Push-T (перетащи блок в цель); денойзинг пачки
   (перемотка шагов: где выбирается сторона); собери политику по шагам;
   лаборатория «Ада и диффузионная политика» на миссиях (shared/missions.js):
   десять прогонов, регрессия рядом, исполнение по одному шагу, шаги
   денойзинга, сколько исполнять из 16 при сдвиге чайника; схема устройства
   Diffusion Policy и схема Real-Time Chunking (shared/anim.js); интерактив
   «положение или скорость» (lessons/l15/engine.js); квиз.
   Движок без DOM — shared/kettle-core.js, рисование — shared/kettle-draw.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
const E = Kettle, KD = KettleDraw;
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
const fmt1 = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
const pc = (v, d) => `${fmt1(v * 100, d == null ? 1 : d)}%`;
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
const reduced = () => HeroKit.reduced();
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
/** Пошаговое проигрывание: возвращает долю пройденного времени 0…1 и вызывает onEnd. */
function playback(dur, onEnd) {
  const pl = { t0: performance.now(), dur: reduced() ? 1 : dur / SPEED.k, done: false };
  pl.u = () => Math.min(1, (performance.now() - pl.t0) / pl.dur);
  setTimeout(() => { pl.done = true; onEnd(); }, pl.dur + 30);
  return pl;
}

/* ===================== 1. Награда Push-T ===================== */
const PushT = (() => {
  const W = 520, H = 330;
  // Т-блок в своих координатах: перекладина 140 × 35 и ножка 35 × 100, центр — в начале ножки
  const PARTS = [[[-70, -50], [70, -50], [70, -15], [-70, -15]], [[-17.5, -15], [17.5, -15], [17.5, 85], [-17.5, 85]]];
  const GOAL = { x: 342, y: 158, a: Math.PI / 4 };
  const START = { x: 132, y: 118, a: -0.35 };
  const st = { x: START.x, y: START.y, a: START.a, grab: null, rot: null, best: 0 };
  let ctl = null;
  const tf = (poly, p) => { const c = Math.cos(p.a), s = Math.sin(p.a); return poly.map(([x, y]) => [p.x + c * x - s * y, p.y + s * x + c * y]); };
  const sarea = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  /** Пересечение выпуклых многоугольников: отсечение Сазерленда — Ходжмана. */
  function clip(S, C) {
    if (sarea(C) < 0) C = C.slice().reverse();
    let out = S;
    for (let i = 0; i < C.length && out.length; i++) {
      const A = C[i], B = C[(i + 1) % C.length], inp = out; out = [];
      const side = (P) => (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]);
      for (let j = 0; j < inp.length; j++) {
        const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
        if (sp >= 0) out.push(P);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
      }
    }
    return out;
  }
  const GAREA = PARTS.reduce((s, P) => s + Math.abs(sarea(P)), 0);
  /** Доля цели под блоком: части блока и цели не перекрываются между собой, поэтому площади складываются. */
  function coverage(p) {
    let s = 0; const B = PARTS.map((P) => tf(P, p)), G = PARTS.map((P) => tf(P, GOAL));
    for (const b of B) for (const g of G) { const q = clip(b, g); if (q.length > 2) s += Math.abs(sarea(q)); }
    return Math.min(1, s / GAREA);
  }
  const reward = (cov) => Math.min(1, cov / 0.95);
  function inPoly(P, x, y) { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
  const handle = () => { const [[x, y]] = tf([[86, -32]], st); return { x, y }; };
  const deg = (a) => Math.round(((a * 180 / Math.PI) % 360 + 540) % 360 - 180);
  function state() { const cov = coverage(st); return { cov, reward: reward(cov), x: st.x, y: st.y, deg: deg(st.a) }; }
  function draw() {
    const { c, k } = HeroKit.fit($('#ptCv'), W, H), P = KD.pal(), dark = HeroKit.dark();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 30, P.grid);
    const G = PARTS.map((Q) => tf(Q, GOAL)), B = PARTS.map((Q) => tf(Q, st));
    const poly = (Q) => { c.beginPath(); Q.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
    // цель
    c.fillStyle = dark ? 'rgba(52,184,120,.16)' : 'rgba(12,163,12,.10)'; for (const Q of G) { poly(Q); c.fill(); }
    c.setLineDash([6, 5]); c.strokeStyle = P.good; c.lineWidth = 2; for (const Q of G) { poly(Q); c.stroke(); } c.setLineDash([]);
    // блок
    c.fillStyle = dark ? '#6f7f96' : '#8796ad'; c.globalAlpha = 0.86; for (const Q of B) { poly(Q); c.fill(); } c.globalAlpha = 1;
    // закрытая часть цели
    c.fillStyle = dark ? 'rgba(52,184,120,.55)' : 'rgba(12,163,12,.42)';
    for (const b of B) for (const g of G) { const q = clip(b, g); if (q.length > 2) { poly(q); c.fill(); } }
    c.strokeStyle = dark ? '#c9d2e0' : '#3d4a5f'; c.lineWidth = 2; for (const Q of B) { poly(Q); c.stroke(); }
    // ручка поворота
    const hd = handle(); c.beginPath(); c.arc(hd.x, hd.y, 9, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
    HeroKit.label(c, k, '↻', hd.x, hd.y + 0.5, { px: 12, weight: 800, color: P.ink2, halo: false });
    HeroKit.label(c, k, 'цель', GOAL.x + 96, GOAL.y - 70, { px: 11, weight: 700, color: P.good, haloColor: P.bg });
    const s = state(); s.cov >= 0.95 && (st.best = Math.max(st.best, s.cov));
    const bar = $('#ptBar'); bar.style.setProperty('--v', (s.cov * 100).toFixed(1) + '%'); bar.style.setProperty('--r', (s.reward * 100).toFixed(1) + '%');
    setOut($('#ptOut'), `Покрытие цели: <b>${pc(s.cov)}</b> · награда: <b>${fmt1(s.reward, 3)}</b> · поворот ${s.deg}°`);
    $('#ptRot').value = s.deg; $('#ptRot').nextElementSibling.textContent = `${s.deg}°`;
    if (ctl) ctl.update();
  }
  const clampPos = () => { st.x = Math.max(40, Math.min(W - 40, st.x)); st.y = Math.max(40, Math.min(H - 40, st.y)); };
  const api = {
    reset() { Object.assign(st, { x: START.x, y: START.y, a: START.a, best: 0 }); draw(); },
    state,
    place(x, y, d) { st.x = x; st.y = y; st.a = d * Math.PI / 180; clampPos(); draw(); },
    goal: () => ({ x: GOAL.x, y: GOAL.y, deg: 45 }),
  };
  const missions = [
    { short: 'Награда 1,0', title: 'Поставь блок в цель', text: 'Перетащи Т-блок на зелёный контур, поверни его ручкой ↻ или ползунком и подгони стрелками. Награда — доля закрытой цели. Добейся награды 1,0 так, чтобы цель была закрыта не полностью: станет видно, какой запас даёт метрика.',
      criteria: [{ label: 'Награда 1,0', test: (r, s) => s.reward >= 0.9999 }, { label: 'При этом закрыто меньше 99% цели', test: (r, s) => s.reward >= 0.9999 && s.cov < 0.99 }],
      hint: 'Сначала поверни блок на 45°, как цель. Потом совмести перекладины и подгоняй стрелками: они сдвигают блок на 2 единицы.',
      explain: (s) => `Награда 1,0 уже при <b>${pc(s.cov)}</b> закрытой цели. Её считают как долю закрытой цели, делённую на 0,95 и обрезанную до 1: 5% цели можно не закрыть. В бенчмарке за эпизод берут лучшую награду и усредняют по 50 стартам. На реальном Push-T авторы считали другую метрику — пересечение блока с целью на последнем шаге (IoU): 0,80 у Diffusion Policy и 0,84 у человека-оператора.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Блок по-прежнему двигается. В настоящей задаче его толкает круглый агент, и подойти к блоку можно с разных сторон: обойти его слева или справа, толкнуть за перекладину или за ножку. Такие разные, но одинаково правильные решения и есть мультимодальность из урока 1.3.', final: true },
  ];
  function init() {
    const cv = $('#ptCv');
    HeroKit.drag(cv, W, H, {
      hit: (p) => { const hd = handle(); if (Math.hypot(p.x - hd.x, p.y - hd.y) < 16) return 'rot'; return PARTS.some((Q) => inPoly(tf(Q, st), p.x, p.y)) ? 'move' : null; },
      start: (o, p) => { if (o === 'move') st.grab = { dx: st.x - p.x, dy: st.y - p.y }; else st.rot = Math.atan2(p.y - st.y, p.x - st.x) - st.a; },
      move: (o, p) => { if (o === 'move') { st.x = p.x + st.grab.dx; st.y = p.y + st.grab.dy; clampPos(); } else st.a = Math.atan2(p.y - st.y, p.x - st.x) - st.rot; draw(); },
    });
    $('#ptRot').addEventListener('input', (e) => { st.a = +e.target.value * Math.PI / 180; draw(); });
    $$('#ptNudge button').forEach((b) => b.addEventListener('click', () => { st.x += +b.dataset.dx; st.y += +b.dataset.dy; clampPos(); draw(); }));
    ctl = mountMissions('#ptMis', missions, api, { scene: '#ptCv' });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, coverage };
})();

/* ===================== 2. Денойзинг пачки ===================== */
const Scrub = (() => {
  const STEPS = 16, W = 560, H = 230;
  const D = E.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
  const KT = E.KETTLE, TK = Math.round((E.START.y - KT.y) / E.V), T0 = TK - 9, JK = 9;   // пачка: 9 шагов до чайника и 6 после
  const MUS = D.demos.map((d) => { const v = new Float64Array(16); for (let j = 0; j < 16; j++) v[j] = (d.xs[T0 + j] - E.RX) / E.SC; return v; });
  const YS = Array.from({ length: 16 }, (_, j) => E.START.y - E.V * (T0 + j));
  const VIEW = { x0: E.RX - 175, x1: E.RX + 175, y0: 196, y1: 337 };
  const CORR = 6;   // коридор ±6 см вокруг маршрута: внутри него сторона не выбрана (та же мёртвая зона, что в движке)
  const st = { seed: 1, s: 0, out: null, sides: [], dists: [], decide: 1, mark: null, seen: { l: false, r: false }, samples: 0 };
  let ctl = null;
  const sideOf = (d) => (d > CORR ? 1 : d < -CORR ? -1 : 0);
  const sideTxt = (v) => (v < 0 ? 'слева' : v > 0 ? 'справа' : 'не выбрана');
  /** Оценка на уровне чайника словами: «4,6 см правее маршрута, в коридоре» / «10,9 см правее, вне коридора». */
  const distTxt = (d) => (Math.abs(d) < 0.05 ? 'на маршруте' : `${fmt1(Math.abs(d))} см ${d < 0 ? 'левее' : 'правее'} маршрута`) + (sideOf(d) ? ', вне коридора' : ', в коридоре');
  function sample() {
    st.out = E.ddimExact(MUS, null, 16, STEPS, E.rng(4000 + st.seed), true);
    st.dists = st.out.x0s.map((x0) => x0[JK] * E.SC);
    st.sides = st.dists.map(sideOf);
    const fin = st.sides[STEPS - 1]; let f = STEPS - 1; while (f > 0 && st.sides[f - 1] === fin) f--;
    st.decide = f + 1; st.mark = null; st.samples++;
    if (fin < 0) st.seen.l = true; else if (fin > 0) st.seen.r = true;
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#scrubCv'), W, H), P = KD.pal(), sx = W / (VIEW.x1 - VIEW.x0);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.save(); c.scale(sx, sx); c.translate(-VIEW.x0, -VIEW.y0);
    KD.house(c, k / sx, P, { labels: false });
    // коридор ±6 см вокруг маршрута: пока оценка на уровне чайника внутри него, сторона не выбрана
    c.fillStyle = P.ink3; c.globalAlpha = 0.13; c.fillRect(E.RX - CORR, VIEW.y0, 2 * CORR, VIEW.y1 - VIEW.y0); c.globalAlpha = 1;
    // демонстрации — тонкие линии
    c.save(); c.strokeStyle = P.demo; c.lineWidth = 1.1 / sx * 1.4; c.globalAlpha = 0.35; for (const d of D.demos) KD.pathXs(c, d.xs); c.restore();
    KD.kettle(c, k / sx, P, KT, {});
    // старт пачки: Ада стоит за шаг до неё
    KD.ada(c, E.RX, YS[0] + E.V * 1.5, -Math.PI / 2, P.dif, 0.95);
    const s = st.s, fr = st.out.frames[s], x0 = s > 0 ? st.out.x0s[s - 1] : null;
    if (x0) { c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); for (let j = 0; j < 16; j++) { const x = E.RX + x0[j] * E.SC; j ? c.lineTo(x, YS[j]) : c.moveTo(x, YS[j]); } c.stroke(); c.setLineDash([]); }
    c.strokeStyle = P.dif; c.globalAlpha = 0.5; c.lineWidth = 1.4; c.beginPath();
    for (let j = 0; j < 16; j++) { const x = E.RX + Math.max(-3.4, Math.min(3.4, fr[j])) * E.SC; j ? c.lineTo(x, YS[j]) : c.moveTo(x, YS[j]); } c.stroke(); c.globalAlpha = 1;
    for (let j = 0; j < 16; j++) { const x = E.RX + Math.max(-3.4, Math.min(3.4, fr[j])) * E.SC; c.beginPath(); c.arc(x, YS[j], 4, 0, 7); c.fillStyle = P.dif; c.fill(); }
    // кольцо — точка оценки чистой пачки на уровне чайника: по ней считается сторона
    if (x0) { const sd = st.sides[s - 1]; c.beginPath(); c.arc(E.RX + x0[JK] * E.SC, YS[JK], 6.5, 0, 7); c.lineWidth = 2; c.strokeStyle = sd < 0 ? P.left : sd > 0 ? P.right : P.ink; c.stroke(); }
    c.restore();
    // подписи: кто есть кто на сцене
    const toCv = (x, y) => [(x - VIEW.x0) * sx, (y - VIEW.y0) * sx];
    const [kx, ky] = toCv(KT.x, KT.y), [ax, ay] = toCv(E.RX, YS[0] + E.V * 1.5);
    HeroKit.label(c, k, '← чайник', kx + 112, ky, { align: 'left', px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, '← Ада', ax + 112, ay, { align: 'left', px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, k > 1.05 ? `шаг денойзинга ${s}` : s === 0 ? 'шаг денойзинга 0: чистый шум' : s === STEPS ? `шаг денойзинга ${s}: готовая пачка` : `шаг денойзинга ${s} из ${STEPS}`, 10, H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    { const [cx, cy] = toCv(E.RX, VIEW.y0); HeroKit.label(c, k, k > 1.5 ? '±6 см' : 'коридор ±6 см', cx, cy + 11, { px: 10.5, mono: true, color: P.ink3, haloColor: P.bg }); }
    // полоска сторон
    const strip = $('#scrubStrip'); strip.innerHTML = '';
    for (let i = 1; i <= STEPS; i++) {
      const sd = st.sides[i - 1], cell = h('span', { class: 'ss ' + (sd < 0 ? 'l' : sd > 0 ? 'r' : 'n') + (i === s ? ' cur' : '') + (i === st.mark ? ' mark' : ''), title: `шаг денойзинга ${i}: ${sd < 0 ? 'слева' : sd > 0 ? 'справа' : 'сторона не выбрана'}` }, String(i));
      cell.addEventListener('click', () => setStep(i)); strip.append(cell);
    }
    const sd = s ? st.sides[s - 1] : 0;
    let msg = s === 0 ? 'Шаг денойзинга 0 — чистый гауссов шум, оценки чистой пачки ещё нет. Двигай ползунок вправо.' : `Шаг денойзинга ${s}: оценка чистой пачки на уровне чайника (кольцо) — ${distTxt(st.dists[s - 1])}. ${sd ? `Сторона выбрана: <b>${sideTxt(sd)}</b>.` : '<b>Сторона не выбрана.</b>'}`;
    if (st.mark != null) {
      const m = st.mark, ms = st.sides[m - 1];
      msg += m === st.decide ? ` Отмечен шаг денойзинга ${m}: с него и до конца денойзинга сторона одна и та же.`
        : m < st.decide ? (ms ? ` Отмечен шаг денойзинга ${m}: сторона на нём есть, но позже она ещё менялась. Нужен первый шаг, с которого цвет полоски уже не меняется.` : ` Отмечен шаг денойзинга ${m}, но на нём сторона ещё не выбрана: кольцо в коридоре. Нужен первый шаг с цветной клеткой, после которого цвет не меняется.`)
        : ` Отмечен шаг денойзинга ${m}, но сторона была выбрана раньше. Нужен первый шаг, с которого цвет полоски уже не меняется.`;
    }
    setOut($('#scrubOut'), msg);
    $('#scrubS').value = s; $('#scrubS').nextElementSibling.textContent = String(s);
    if (ctl) ctl.update();
  }
  function setStep(s) { st.s = Math.max(0, Math.min(STEPS, s)); draw(); }
  const api = {
    reset() { st.seed = 1; st.seen = { l: false, r: false }; st.samples = 0; sample(); st.s = 0; draw(); },
    state: () => ({ s: st.s, decide: st.decide, mark: st.mark, seen: Object.assign({}, st.seen), samples: st.samples, side: st.sides[STEPS - 1], dists: st.dists.slice(), sides: st.sides.slice() }),
    setStep, newNoise() { st.seed++; sample(); st.s = 0; draw(); }, mark() { st.mark = st.s || null; draw(); },
  };
  const missions = [
    { short: 'Шаг выбора', title: 'Найди, где выбрана сторона', text: 'Оранжевые точки — пачка из 16 действий на текущем шаге денойзинга, пунктир — оценка чистой пачки, кольцо на пунктире — её точка на уровне чайника. Шаги денойзинга считаем с 1: это первая оценка из чистого шума. Сторона выбрана на том шаге денойзинга, с которого кольцо вышло из коридора ±6 см и до конца денойзинга остаётся по одну сторону. Перемотай ползунком на этот шаг и нажми «Сторона выбрана здесь».', controls: ['mark'],
      criteria: [{ label: 'Отмечен первый шаг денойзинга, с которого сторона уже не меняется', test: (r, s) => s.mark != null && s.mark === s.decide }],
      hint: 'Полоска под сценой — сторона на каждом шаге денойзинга; серая клетка — кольцо ещё в коридоре. Нужен первый цветной шаг, после которого цвет не меняется. Шаг перед ним — ещё не выбор: там кольцо в коридоре или на другой стороне.',
      explain: (s) => {
        const d = s.decide, steps = s.dists.slice(0, d - 1).map((v, i) => `шаг ${i + 1} — ${distTxt(v)}`).join(', ');
        const why = d > 1 ? ` До него сторона ещё не была постоянной: ${steps}. На шаге ${d} оценка — ${distTxt(s.dists[d - 1])}, и дальше она остаётся ${sideTxt(s.side)}.` : '';
        return `Сторона выбрана на шаге денойзинга <b>${d} из 16</b>.${why} Отклонение меньше 6 см считаем шумом, а не выбором, поэтому${d > 2 ? ` шаг ${d - 1} не подходит, хотя оценка уже тянулась в ту же сторону` : ' серые клетки в счёт не идут'}. Пока шум большой, оценка чистой пачки смотрит в середину между объездами. Но пачка — это 16 точек сразу, и даже сквозь сильный шум видно, к какому объезду она ближе целиком. Поэтому выбор происходит рано, а оставшиеся шаги денойзинга доводят форму объезда. Из 60 пачек с разным шумом сторона выбрана на шаге 2 у 51, на шаге 3 — у 8, на шаге 5 — у одной.`;
      } },
    { short: 'Другая сторона', title: 'Получи другую сторону', text: 'Нажимай «Новый шум»: найди пачку, которая объезжает чайник с другой стороны.', controls: ['mark', 'noise'],
      criteria: [{ label: 'Есть пачка с объездом слева', test: (r, s) => s.seen.l }, { label: 'Есть пачка с объездом справа', test: (r, s) => s.seen.r }],
      explain: () => 'Сеть, данные и наблюдение те же, отличается только начальный шум. Он и выбирает стратегию, как на спиралях в уроке 1.4: соседние стартовые точки уходят в один бассейн, далёкие — в разные. Денойзинг не усредняет объезды, а доводит пачку до одного из них.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Перематывай и пробуй новый шум. Сравни, на каком шаге денойзинга выбирается сторона у разных пачек: найди пачку, у которой на шаге 2 кольцо ещё в коридоре, и пачку, у которой сторона выбрана уже на шаге 2.', final: true },
  ];
  function init() {
    sample();
    $('#scrubS').addEventListener('input', (e) => setStep(+e.target.value));
    $('#scrubNew').addEventListener('click', () => api.newNoise());
    $('#scrubMark').addEventListener('click', () => api.mark());
    legend('#scrubLegend', [['пачка на этом шаге денойзинга', 'var(--pol-dif)', 'dot'], ['оценка чистой пачки', 'var(--ink-2)', 'dash'], ['её точка на уровне чайника', 'var(--ink)', 'ring'], ['коридор ±6 см', 'var(--ink-3)', 'band'], ['демонстрации', 'var(--ink-3)']]);
    ctl = mountMissions('#scrubMis', missions, api, { controls: { mark: '#scrubMark', noise: '#scrubNew' }, scene: '#scrubCv' });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ===================== 3. Собери политику ===================== */
const Pipe = (() => {
  const STEPS = [
    { id: 'obs', t: 'Два последних кадра с камер и положение захвата', note: 'наблюдения, To = 2' },
    { id: 'enc', t: 'Энкодер ResNet-18 считает признаки наблюдений', note: 'один раз на всю пачку' },
    { id: 'noise', t: 'Пачка из чистого гауссова шума', note: '16 действий × размерность действия' },
    { id: 'den', t: 'Сеть 16 раз убирает часть шума при условии признаков', note: 'DDIM; при обучении — 100 шагов денойзинга' },
    { id: 'exec', t: 'Робот исполняет первые 8 действий пачки', note: 'Ta = 8 из Tp = 16' },
    { id: 'loop', t: 'Новые наблюдения и новая пачка из свежего шума', note: 'отступающий горизонт' },
  ];
  const EXTRA = [
    { id: 'noisyObs', t: 'Зашумить кадры с камер и восстановить их', why: 'Кадры не зашумляют: наблюдения — только условие. Шум добавляют к пачке действий.' },
    { id: 'avg', t: 'Усреднить новую пачку со старой на стыке', why: 'Среднее двух пачек может пройти между объездами — в уроке 1.3 так Ада въезжала в чайник.' },
  ];
  const ORDER = ['den', 'obs', 'avg', 'exec', 'noise', 'loop', 'enc', 'noisyObs'];
  const st = { placed: [], rejected: [], errors: 0, msg: '' };
  let ctl = null;
  const all = () => STEPS.concat(EXTRA);
  const byId = (id) => all().find((q) => q.id === id);
  function place(id) {
    if (st.placed.includes(id) || st.rejected.includes(id)) return;
    const ex = EXTRA.find((q) => q.id === id);
    if (ex) { st.errors++; st.rejected.push(id); st.msg = `<b>Этот блок лишний.</b> ${ex.why}`; render(); return; }
    const next = STEPS[st.placed.length];
    if (next.id === id) { st.placed.push(id); st.msg = st.placed.length === STEPS.length ? 'Цикл собран.' : ''; }
    else { st.errors++; st.msg = '<b>Этот блок позже.</b> Подумай, что политике нужно раньше.'; }
    render();
  }
  function discard(id) {
    if (st.placed.includes(id) || st.rejected.includes(id)) return;
    if (EXTRA.some((q) => q.id === id)) { st.rejected.push(id); st.msg = `<b>Верно, лишний.</b> ${EXTRA.find((q) => q.id === id).why}`; }
    else { st.errors++; st.msg = '<b>Этот блок нужен.</b> Без него цикл не замкнётся.'; }
    render();
  }
  function render() {
    const bank = $('#pipeBank'), line = $('#pipeLine'); bank.innerHTML = ''; line.innerHTML = '';
    STEPS.forEach((q, i) => {
      const on = st.placed[i] === q.id;
      line.append(h('li', { class: 'pl' + (on ? ' on' : '') }, h('b', null, String(i + 1)), on ? h('span', null, q.t, h('small', null, q.note)) : h('span', { class: 'ph' }, '…')));
    });
    for (const id of ORDER) {
      if (st.placed.includes(id)) continue; const q = byId(id), rej = st.rejected.includes(id);
      const card = h('div', { class: 'pc' + (rej ? ' rej' : '') }, h('button', { type: 'button', class: 'pc-main', disabled: rej || null }, q.t), rej ? h('span', { class: 'pc-tag' }, 'лишний') : h('button', { type: 'button', class: 'pc-x', title: 'Отбросить как лишний', 'aria-label': 'Отбросить как лишний' }, '✕'));
      if (!rej) { card.querySelector('.pc-main').addEventListener('click', () => place(id)); card.querySelector('.pc-x').addEventListener('click', () => discard(id)); }
      bank.append(card);
    }
    setOut($('#pipeOut'), st.msg || (st.placed.length ? `Собрано блоков: ${st.placed.length} из ${STEPS.length}.` : 'Нажми на блок, который идёт первым.'));
    if (ctl) ctl.update();
  }
  const api = {
    reset() { st.placed = []; st.rejected = []; st.errors = 0; st.msg = ''; render(); },
    state: () => ({ placed: st.placed.length, rejected: st.rejected.length, errors: st.errors }),
    place, discard,
  };
  const missions = [
    { short: 'Цикл', title: 'Собери Diffusion Policy', text: 'Нажимай блоки в том порядке, в котором работает политика на роботе. Два блока лишние: отбрось их крестиком.',
      criteria: [{ label: 'Цикл собран: шесть блоков по порядку', test: (r, s) => s.placed === STEPS.length }, { label: 'Оба лишних блока отброшены', test: (r, s) => s.rejected === EXTRA.length }],
      hint: 'Политика сначала смотрит, потом думает, потом действует. Шум появляется до денойзинга, а наблюдения в нём не участвуют.',
      explain: (s) => `Цикл собран${s.errors ? `, ошибок по дороге: ${s.errors}` : ' без ошибок'}. На реальном Push-T так и работает политика авторов: камера и положение захвата за 2 последних шага управления, ResNet-18 на каждую камеру без предобучения, одномерный UNet по времени с условием через FiLM, 16 шагов денойзинга DDIM и исполнение 6–8 действий из 16. Действия пачки идут 10 раз в секунду, поэтому новая пачка нужна раз в 0,6–0,8 с, а регулятор робота интерполирует действия до 125 Гц.` },
  ];
  function init() { ctl = mountMissions('#pipeMis', missions, api, { scene: '#pipeLine' }); render(); return ctl; }
  return { init, api, st };
})();

/* ===================== 3а. Схема устройства Diffusion Policy (shared/anim.js, ключ 'dp-arch') =====================
   Один оборот цикла политики из статьи (вариант на UNet) по этапам: кадры двух камер и положение захвата за два
   последних шага управления → у каждой камеры свой энкодер ResNet-18 → признаки наблюдения, один раз на пачку →
   условие: признаки и номер шага денойзинга входят в каждый слой денойзера (в статье — FiLM) → денойзер, одномерная
   сеть по времени пачки (UNet: сжимает пачку по времени, разворачивает обратно, прямые связи между уровнями),
   получает зашумлённую пачку из 16 действий и оценивает шум → шаг денойзинга вычитает часть шума, всего 16 шагов →
   робот исполняет первые 8 действий → новые кадры и новая пачка из свежего шума (отступающий горизонт).
   Упрощения: у действия одно число вместо двух координат цели захвата, денойзер точный, кадры и числа условные.
   Цвета: синий — наблюдение и признаки, фиолетовый — условие, оранжевый — пачка и сеть, которая сейчас считает,
   серый — шум. */
const DpArch = (() => {
  const T = 18, PH = { obs: [0.2, 1.2], enc: [1.2, 2.8], feat: [2.8, 4.0], noise: [4.0, 5.0], exec: [12.6, 15.0], loop: [15.2, 16.8], fade: [17.2, 18] };
  const N = 16, TA = 8, NS = 16, D0 = 5.0, SLOW = 1.6, D2 = D0 + 2 * SLOW, D1 = 12.4, FAST = (D1 - D2) / (NS - 2);
  const IN = 0.14, NET = 0.64, OUT = 0.76;               // доли шага денойзинга: вход пачки, проход по сети, выход оценки шума, вычитание
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // пачка: чистая — плавная кривая, шум — гауссов с зерном; по шагам денойзинга доля пачки растёт как синус, доля шума падает как косинус
  const A0 = Array.from({ length: N }, (_, j) => 0.8 * (2 * sm(j / (N - 1)) - 1));
  const EPS = (() => { const r = HeroKit.rng(221); return Array.from({ length: N }, () => HeroKit.randn(r)); })();
  const ang = (s) => Math.pow(Math.max(0, Math.min(NS, s)) / NS, 0.7) * Math.PI / 2;
  const sigOf = (s) => Math.sin(ang(s)), noiOf = (s) => Math.cos(ang(s));   // доля пачки и доля шума после s шагов денойзинга
  const chunkAt = (s) => A0.map((a, j) => sigOf(s) * a + noiOf(s) * EPS[j]);
  /** Шаг денойзинга в момент u: s — номер (1…16), f — доля шага; до денойзинга s = 0, после — s = 16, f = 1. */
  function stepAt(u) {
    if (u < D0) return { s: 0, f: 0, slow: true };
    if (u < D2) { const q = (u - D0) / SLOW; return { s: 1 + Math.floor(q), f: q - Math.floor(q), slow: true }; }
    const q = (u - D2) / FAST;
    if (q >= NS - 2) return { s: NS, f: 1, slow: false, done: true };
    return { s: 3 + Math.floor(q), f: q - Math.floor(q), slow: false };
  }
  /** Сколько шагов денойзинга уже сделано к моменту u (дробное: вычитание идёт плавно). */
  function doneAt(u) { const q = stepAt(u); if (q.s === 0) return 0; if (q.done) return NS; return q.s - 1 + sm((q.f - OUT) / (1 - OUT)); }

  /* ---------- рисование ---------- */
  /** Точка на ломаной на доле f её длины. */
  function along(pts, f) {
    const ls = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); ls.push(l); tot += l; }
    let d = f * tot;
    for (let i = 0; i < ls.length; i++) { if (d <= ls[i] || i === ls.length - 1) { const q = ls[i] ? Math.min(1, d / ls[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * q, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * q]; } d -= ls[i]; }
    return pts[pts.length - 1];
  }
  /** Точки бегут по ломаной, пока prog между 0 и 1. */
  function flow(c, A, pts, prog, col) { if (prog <= 0 || prog >= 1) return; for (let i = 0; i < 3; i++) { const p = along(pts, (prog * 1.5 + i / 3) % 1); A.circle(c, p[0], p[1], 2.6, col); } }
  /** Ломаная со стрелкой на конце. */
  function poly(c, A, pts, col, lw, dash) {
    if (pts.length > 2) A.line(c, pts.slice(0, -1), col, lw, dash);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    A.arrow(c, a[0], a[1], b[0], b[1], col, lw, 6);
  }
  const L = (c, k, A, text, x, y, o) => A.lab(c, k, text, x, y, Object.assign({ halo: false }, o));
  /** Подпись в несколько строк: '\n' разделяет строки, y — середина блока. */
  function lines(c, k, A, text, x, y, o) {
    const ls = String(text).split('\n'), lh = (o.px || 11) * k * 1.25, y0 = y - (ls.length - 1) * lh / 2;
    ls.forEach((s, i) => L(c, k, A, s, x, y0 + i * lh, o));
  }
  /** Подпись по словам в строки не шире maxW, первая строка — на y. */
  function wrap(c, k, A, text, x, y, maxW, o) {
    HeroKit.font(c, k, o.px, o.weight); const ws = String(text).split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur);
    out.forEach((s, i) => L(c, k, A, s, x, y + i * o.px * k * 1.35, o));
  }
  /** Блок сети: название и строка пояснения; on — блок сейчас считает. */
  function box(c, k, A, P, b, title, sub, on) {
    const [x, y, w, h] = b;
    A.rect(c, x, y, w, h, 8, on ? A.alpha(P.mot, 0.13) : P.surf, on ? P.mot : P.line, on ? 1.8 : 1.2);
    L(c, k, A, title, x + w / 2, y + h / 2 - 7, { px: 11, weight: 750, color: P.ink });
    L(c, k, A, sub, x + w / 2, y + h / 2 + 8, { px: 10, weight: 600, color: P.ink3, mono: true });
  }
  // кадры Push-T: стол, зелёный контур цели, серый Т-блок и толкатель робота; камера 2 смотрит сбоку (скос и сжатие).
  // st: 0 — кадр прошлого шага управления, 1 — текущего, 2 — кадр после исполнения 8 действий
  const SCN = [{ p: [-0.36, 0.2], b: [-0.08, 0.04, -0.55] }, { p: [-0.3, 0.17], b: [-0.08, 0.04, -0.55] }, { p: [-0.17, 0.1], b: [-0.02, 0.01, -0.3] }];
  const TEE = [[-0.2, -0.13], [0.2, -0.13], [0.2, -0.03], [0.05, -0.03], [0.05, 0.23], [-0.05, 0.23], [-0.05, -0.03], [-0.2, -0.03]];
  function tee(c, x, y, a, s, fill, stroke) {
    c.save(); c.translate(x, y); c.rotate(a); c.beginPath();
    TEE.forEach(([u, v], i) => (i ? c.lineTo(u * s, v * s) : c.moveTo(u * s, v * s))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.setLineDash([2.5, 2]); c.strokeStyle = stroke; c.lineWidth = 1.1; c.stroke(); c.setLineDash([]); }
    c.restore();
  }
  function frame(c, A, P, x, y, w, h, cam, st, a) {
    if (a <= 0) return;
    const ga = c.globalAlpha; c.globalAlpha = ga * a;
    A.rect(c, x, y, w, h, 4, P.surf2, P.line, 1);
    c.save(); c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, h - 2, 3); c.clip();
    c.translate(x + w / 2, y + h / 2);
    if (cam === 2) c.transform(1, 0, -0.38, 0.7, 0, 1);
    const s = w * 0.7, q = SCN[st];
    tee(c, 0.24 * w, -0.03 * w, Math.PI / 4, s, A.alpha(P.good, 0.08), P.good);
    tee(c, q.b[0] * w, q.b[1] * w, q.b[2], s, A.alpha(P.ink3, 0.8), null);
    A.circle(c, q.p[0] * w, q.p[1] * w, 2.6, P.out, null);
    c.restore(); c.globalAlpha = ga;
  }
  /** Ряд клеток слоя денойзера: on — сейчас считает, was — уже посчитан на этом шаге. */
  function layer(c, A, P, b, on, was, fast) {
    const { x, y, n, cw, h } = b;
    for (let i = 0; i < n; i++) {
      const fill = on ? A.alpha(P.mot, (fast ? 0.25 : 0.35) + 0.45 * hash(i + n * 7)) : was ? A.alpha(P.mot, 0.14) : P.surf;
      A.rect(c, x + i * cw + 0.6, y, cw - 1.2, h, 1.5, fill, on ? P.mot : P.line, 1);
    }
  }

  function draw(c, k, t, P, A, G) {
    const { seg, ease } = A, u = ((t % T) + T) % T;
    const fade = 1 - seg(u, ...PH.fade); c.globalAlpha = fade;
    const pObs = seg(u, ...PH.obs), pEnc = seg(u, ...PH.enc), pFeat = seg(u, ...PH.feat), pNoise = seg(u, ...PH.noise), pExec = seg(u, ...PH.exec), pLoop = seg(u, ...PH.loop);
    const q = stepAt(u), den = u >= D0 && !q.done, f = q.f, cond = pFeat >= 0.85;
    const on = (x) => (x ? P.ink2 : P.line);
    // ---------- наблюдение: два кадра каждой камеры и положение захвата ----------
    L(c, k, A, 'наблюдение: 2 последних шага управления', G.titleA[0], G.titleA[1], { px: 11, weight: 750, color: P.ink2, align: 'left' });
    const nf = ease(seg(pLoop, 0.25, 0.75));                      // новые кадры после исполнения
    G.cams.forEach((cm, i) => {
      const a = seg(pObs, i * 0.2, 0.6 + i * 0.2);
      frame(c, A, P, cm.x + G.off[0], cm.y + G.off[1], cm.w, cm.h, i + 1, 0, a * (1 - nf));
      frame(c, A, P, cm.x + G.off[0], cm.y + G.off[1], cm.w, cm.h, i + 1, 1, a * nf);
      frame(c, A, P, cm.x, cm.y, cm.w, cm.h, i + 1, 1, a * (1 - nf));
      frame(c, A, P, cm.x, cm.y, cm.w, cm.h, i + 1, 2, a * nf);
      if (a > 0) L(c, k, A, i ? 'камера 2' : 'камера 1', cm.lab[0], cm.lab[1], { px: 10, color: P.ink3 });
    });
    const aPos = seg(pObs, 0.4, 1);
    if (aPos > 0) {
      const [x, y, w, h] = G.pos, ga = c.globalAlpha; c.globalAlpha = ga * aPos;
      A.rect(c, x, y, w, h, h / 2.2, A.alpha(P.out, 0.1), P.out, 1.3);
      L(c, k, A, 'положение захвата', x + w / 2, y + h / 2, { px: 10.5, weight: 650, color: P.ink });
      c.globalAlpha = ga;
    }
    // ---------- энкодеры: свой ResNet-18 у каждой камеры, признаки — один раз на пачку ----------
    G.aCam.forEach((ar) => { poly(c, A, ar, on(pEnc > 0), 1.5); flow(c, A, ar, seg(pEnc, 0, 0.35), P.out); });
    G.encs.forEach((b) => box(c, k, A, P, b, 'энкодер', 'ResNet-18', pEnc > 0.2 && pEnc < 0.8));
    G.aEnc.forEach((ar) => { poly(c, A, ar, on(pEnc > 0.6), 1.5); flow(c, A, ar, seg(pEnc, 0.6, 0.95), P.out); });
    poly(c, A, G.aPos, on(pFeat > 0), 1.5); flow(c, A, G.aPos, seg(pFeat, 0, 0.4), P.out);
    // столбец признаков наблюдения: группы клеток от камеры 1, камеры 2 и положения
    const C = G.col, fillG = [seg(pEnc, 0.7, 1), seg(pEnc, 0.75, 1), seg(pFeat, 0.3, 0.6)];
    A.rect(c, C.box[0], C.box[1], C.box[2], C.box[3], 5, null, pFeat > 0.5 ? A.alpha(P.out, 0.8) : P.line, pFeat > 0.5 ? 1.5 : 1);
    C.cells.forEach(([x, y, gi], i) => { const g = fillG[gi]; A.rect(c, x, y, C.cw, C.cw, 2, g > 0 ? A.alpha(P.out, (0.2 + 0.6 * hash(i + 3)) * g) : P.surf, g > 0 ? A.alpha(P.out, 0.7) : P.line, 1); });
    lines(c, k, A, 'признаки\nнаблюдения', G.colLab[0], G.colLab[1], { px: 11, weight: 700, color: pEnc > 0.7 ? P.ink2 : P.ink3, align: G.colLab[2] });
    if (pFeat > 0.5) L(c, k, A, 'один раз на пачку', G.onceLab[0], G.onceLab[1], { px: 10, weight: 600, color: P.ink3, align: G.onceLab[2] });
    poly(c, A, G.aCol, on(pFeat > 0.5), 1.5); flow(c, A, G.aCol, seg(pFeat, 0.5, 0.9), P.out);
    // ---------- условие: признаки наблюдения и номер шага денойзинга ----------
    const D = G.cond, aD = seg(pFeat, 0.7, 1), pulse = den && f > IN && f < NET;
    L(c, k, A, 'условие', D.lab[0], D.lab[1], { px: 11, weight: 750, color: cond ? P.spr : P.ink3, align: D.lab[2] || 'center' });
    A.rect(c, D.x - 4, D.y - 4, D.nb * D.cw + D.cw + 12, D.cw + 11, 6, pulse ? A.alpha(P.spr, q.slow ? 0.12 : 0.06) : P.surf, cond ? P.spr : P.line, cond ? 1.6 : 1.1);
    for (let i = 0; i < D.nb; i++) A.rect(c, D.x + i * D.cw + 0.6, D.y, D.cw - 1.2, D.cw + 3, 2, aD > 0 ? A.alpha(P.out, (0.2 + 0.6 * hash(i + 11)) * aD) : P.surf, aD > 0 ? A.alpha(P.out, 0.7) : P.line, 1);
    A.rect(c, D.x + D.nb * D.cw + 4.6, D.y, D.cw - 1.2, D.cw + 3, 2, q.s > 0 ? A.alpha(P.spr, 0.55) : P.surf, q.s > 0 ? P.spr : P.line, 1);
    // номер шага денойзинга
    const [hx, hy, hw, hh] = G.chip;
    A.rect(c, hx, hy, hw, hh, 8, q.s > 0 ? A.alpha(P.spr, 0.08) : P.surf, q.s > 0 ? P.spr : P.line, 1.3);
    lines(c, k, A, 'номер шага\nденойзинга', hx + hw / 2, hy + hh * 0.34, { px: 10, weight: 600, color: P.ink2 });
    L(c, k, A, q.s > 0 ? `${q.s} из 16` : '—', hx + hw / 2, hy + hh * 0.77, { px: 12, weight: 750, mono: true, color: q.s > 0 ? P.spr : P.ink3 });
    poly(c, A, G.aChip, q.s > 0 ? A.alpha(P.spr, 0.8) : P.line, 1.5);
    // ---------- денойзер: одномерная сеть по времени пачки, условие входит в каждый слой ----------
    const UP = G.U, B = UP.blocks, ab = den && f >= IN && f < NET ? Math.floor((f - IN) / ((NET - IN) / 5)) : -1;
    A.rect(c, UP.box[0], UP.box[1], UP.box[2], UP.box[3], 8, P.surf2, den ? A.alpha(P.mot, 0.45) : P.line, 1);
    UP.links.forEach((ar, i) => poly(c, A, ar, den && ab > i ? P.ink2 : P.line, 1.4));
    UP.skips.forEach((ar, i) => { const hot = den && ab === 4 - i; poly(c, A, ar, hot ? P.ink2 : A.alpha(P.ink3, 0.55), hot ? 1.6 : 1.1, [3, 3]); });
    B.forEach((b, i) => {
      const fan = [G.fan, b.m], hot = ab === i;
      A.line(c, fan, cond ? A.alpha(P.spr, hot ? 0.95 : 0.4) : A.alpha(P.ink3, 0.3), hot ? 1.7 : 1.1, [4, 3]);
      if (hot && q.slow) { const p = along(fan, sm((f - IN - i * (NET - IN) / 5) / ((NET - IN) / 5) * 1.4)); A.circle(c, p[0], p[1], 2.8, P.spr); }
      layer(c, A, P, b, hot, den && ab > i, !q.slow);
      if (cond) A.circle(c, b.m[0], b.m[1], 2.6, P.spr, null);
    });
    if (cond) L(c, k, A, 'в каждый слой', G.fanLab[0], G.fanLab[1], { px: 10, weight: 650, color: P.spr, align: G.fanLab[2] });
    L(c, k, A, 'денойзер', UP.lab[0], UP.lab[1], { px: 11, weight: 750, color: den ? P.ink : P.ink2 });
    L(c, k, A, 'одномерная сеть по времени пачки', UP.lab[0], UP.lab[1] + 13.5, { px: 10, weight: 600, color: P.ink3 });
    // ---------- пачка: 16 действий ----------
    const F = G.F, sDone = doneAt(u), ys = chunkAt(sDone);
    A.rect(c, F.x, F.y, F.w, F.h, 8, P.surf2, P.line, 1);
    L(c, k, A, 'пачка: 16 действий', F.x + F.w / 2, F.y + 11, { px: 11, weight: 750, color: P.ink2 });
    A.line(c, [[F.x0 - 6, F.cy], [F.x0 + 15 * F.dx + 6, F.cy]], P.grid, 1);
    const ex = pExec > 0 ? pExec * TA : 0, ne = Math.floor(ex + 1e-9), dim = 1 - 0.5 * ease(seg(pLoop, 0, 0.5));
    if (den && q.slow && f >= OUT) {                              // вычитание: серые стрелки — часть шума, которую убирают на этом шаге
      const ya = chunkAt(q.s - 1), yb = chunkAt(q.s);
      for (let j = 0; j < N; j++) { const y1 = F.cy - ya[j] * F.amp, y2 = F.cy - yb[j] * F.amp; if (Math.abs(y2 - y1) > 3) A.arrow(c, F.x0 + j * F.dx + 5, y1, F.x0 + j * F.dx + 5, y2, A.alpha(P.ink3, 0.8), 1.2, 4); }
    }
    if (pNoise > 0) for (let j = 0; j < N; j++) {
      const a = seg(pNoise, j / 22, j / 22 + 0.3); if (a <= 0) continue;
      const x = F.x0 + j * F.dx, y = F.cy - ys[j] * F.amp, done = j < ne, cur = pExec > 0 && pExec < 1 && j === ne && j < TA, gone = pExec > 0 && j >= TA;
      const ga = c.globalAlpha; c.globalAlpha = ga * a * dim * (gone ? 0.4 : 1);
      if (q.done && j > 0) A.line(c, [[x - F.dx, F.cy - ys[j - 1] * F.amp], [x, y]], A.alpha(P.mot, 0.45), 1.2);
      if (cur) A.circle(c, x, y, 6.5, null, P.mot, 1.4);
      A.circle(c, x, y, done ? 3.8 : 3.3, done ? P.mot : P.surf, gone ? P.ink3 : P.mot, 1.6);
      c.globalAlpha = ga;
    }
    if (pExec > 0) {
      const ga = c.globalAlpha; c.globalAlpha = ga * Math.min(1, pExec * 5) * dim;
      const xa = F.x0 - 3, xm = F.x0 + (TA - 1) * F.dx + 3, xb = F.x0 + TA * F.dx - 3, xe = F.x0 + 15 * F.dx + 3, yb = F.br;
      A.line(c, [[xa, yb - 4], [xa, yb], [xm, yb], [xm, yb - 4]], P.mot, 1.4);
      A.line(c, [[xb, yb - 4], [xb, yb], [xe, yb], [xe, yb - 4]], P.ink3, 1.2);
      L(c, k, A, 'исполняются', (xa + xm) / 2, yb + 10, { px: F.bpx, weight: 700, color: P.mot });
      L(c, k, A, 'не исполняются', (xb + xe) / 2, yb + 10, { px: F.bpx, weight: 600, color: P.ink3 });
      c.globalAlpha = ga;
    }
    poly(c, A, G.aF, den && f < IN + 0.02 ? P.ink2 : on(u >= D0), 1.5); if (den && q.slow) flow(c, A, G.aF, seg(f, 0, IN), P.mot);
    // ---------- оценка шума: новая оценка ярче, при вычитании столбики укорачиваются ----------
    const H = G.Gp;
    let nNow = 0, fresh = false;
    if (den) {
      if (f < NET) nNow = q.s > 1 ? noiOf(q.s - 1) : 0;
      else if (f < OUT) { nNow = q.s > 1 ? noiOf(q.s - 1) : noiOf(0) * sm((f - NET) / (OUT - NET)); fresh = true; }
      else nNow = A.lerp(noiOf(q.s - 1), noiOf(q.s), sm((f - OUT) / (1 - OUT)));
    }
    A.rect(c, H.x, H.y, H.w, H.h, 8, P.surf2, P.line, 1);
    L(c, k, A, 'оценка шума', H.x + H.w / 2, H.y + 11, { px: 11, weight: 750, color: P.ink2 });
    A.line(c, [[H.x0 - 6, H.cy], [H.x0 + 15 * H.dx + 6, H.cy]], P.grid, 1);
    if (nNow > 0.002) for (let j = 0; j < N; j++) { const v = EPS[j] * nNow * H.amp, x = H.x0 + j * H.dx; c.fillStyle = A.alpha(P.ink3, fresh && q.slow ? 0.95 : 0.7); c.fillRect(x - H.bw / 2, Math.min(H.cy, H.cy - v), H.bw, Math.abs(v)); }
    poly(c, A, G.aG, den && f >= NET && f < OUT ? P.ink2 : on(u >= D0), 1.5); if (den && q.slow) flow(c, A, G.aG, seg(f, NET, OUT), P.mot);
    // ---------- шаг денойзинга: вычесть часть шума ----------
    const sub = den && f >= OUT;
    poly(c, A, G.ret, sub ? P.ink2 : on(u >= D0), sub ? 1.8 : 1.4); if (den && q.slow) flow(c, A, G.ret, seg(f, OUT, 1), P.ink3);
    L(c, k, A, 'шаг денойзинга: вычесть часть шума', G.retLab[0], G.retLab[1], { px: 10.5, weight: 650, color: sub ? P.ink : P.ink3, halo: G.retLab[2], haloColor: P.surf2 });
    // ---------- отступающий горизонт: новые кадры ----------
    const lp = pLoop > 0 && pLoop < 1;
    poly(c, A, G.loop, lp ? P.mot : A.alpha(P.ink3, 0.6), lp ? 1.8 : 1.2, [5, 4]); flow(c, A, G.loop, seg(pLoop, 0, 0.6), P.mot);
    L(c, k, A, 'новые кадры', G.loopLab[0], G.loopLab[1], { px: 10, weight: 650, color: lp ? P.mot : P.ink3, align: G.loopLab[2] });
    // ---------- что происходит ----------
    const stT = u < PH.enc[0] ? 'Политика берёт кадры двух камер и положение захвата за два последних шага управления.'
      : u < PH.feat[0] ? 'У каждой камеры свой энкодер ResNet-18, он превращает кадры в признаки.'
      : u < PH.noise[0] ? 'Признаки кадров и положение захвата составляют признаки наблюдения, их считают один раз на пачку.'
      : u < D0 ? 'Пачку из 16 действий начинают с чистого гауссова шума.'
      : u < D0 + SLOW * OUT ? 'Денойзер оценивает шум в пачке, а признаки наблюдения и номер шага денойзинга входят в каждый его слой как условие.'
      : u < D0 + SLOW ? 'Шаг денойзинга вычитает часть оценённого шума, и пачка становится чище.'
      : u < D2 ? 'Энкодер при этом не запускается заново: условие то же, меняется только номер шага денойзинга.'
      : u < PH.exec[0] ? 'За 16 шагов денойзинга шум превращается в связную пачку.'
      : u < PH.loop[0] ? 'Робот исполняет первые 8 действий пачки, по одному на шаг управления, 10 раз в секунду.'
      : 'Потом политика берёт новые кадры и строит новую пачку из свежего шума: это отступающий горизонт.';
    wrap(c, k, A, stT, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left' });
    c.globalAlpha = 1;
  }

  /* ---------- раскладки: широкая (слева направо) и узкая для телефона ---------- */
  // клетки столбца признаков: 4 от камеры 1, 4 от камеры 2, 2 от положения захвата; centers — середины групп
  const colCells = (x, centers, cs, gap) => { const out = []; [[centers[0], 4, 0], [centers[1], 4, 1], [centers[2], 2, 2]].forEach(([cy, n, gi]) => { for (let i = 0; i < n; i++) out.push([x, cy - (n * cs + (n - 1) * gap) / 2 + i * (cs + gap), gi]); }); return out; };
  /** Слой денойзера: ряд из n клеток шириной cw; m — точка, где в слой входит условие. */
  const blk = (x, y, n, cw, h, m) => ({ x, y, n, cw, h, m });
  const WIDE = {
    titleA: [14, 13], off: [5, -5],
    cams: [{ x: 20, y: 32, w: 58, h: 38, lab: [49, 80] }, { x: 20, y: 94, w: 58, h: 38, lab: [49, 142] }],
    pos: [14, 152, 112, 20],
    aCam: [[[80, 51], [102, 51]], [[80, 113], [102, 113]]],
    encs: [[104, 32, 92, 38], [104, 94, 92, 38]],
    aEnc: [[[198, 51], [219, 51]], [[198, 113], [219, 113]]], aPos: [[128, 162], [219, 162]],
    col: { cw: 11, box: [218, 23, 19, 155], cells: colCells(222, [51, 113, 162], 11, 1.5) },
    colLab: [248, 80, 'left'], onceLab: [248, 121, 'left'], aCol: [[240, 102], [330, 102]],
    cond: { x: 337, y: 95, nb: 6, cw: 13, lab: [384, 79] },
    chip: [566, 76, 120, 52], aChip: [[564, 102], [442, 102]],
    fan: [384, 120], fanLab: [434, 160, 'left'],
    U: {
      box: [222, 204, 328, 150],
      blocks: [blk(232, 218, 16, 5.5, 14, [308, 217]), blk(262, 256, 8, 7, 18, [318, 255]), blk(366, 292, 4, 9, 22, [384, 291]), blk(450, 256, 8, 7, 18, [450, 255]), blk(448, 218, 16, 5.5, 14, [460, 217])],
      links: [[[290, 232], [290, 254]], [[318, 272], [364, 300]], [[404, 300], [448, 272]], [[478, 256], [478, 234]]],
      skips: [[[320, 225], [446, 225]], [[318, 265], [448, 265]]],
      lab: [386, 331],
    },
    F: { x: 14, y: 204, w: 184, h: 150, x0: 30, dx: 10.4, cy: 284, amp: 24, br: 330, bpx: 10 },
    aF: [[200, 225], [230, 225]],
    Gp: { x: 560, y: 204, w: 146, h: 150, x0: 573, dx: 8.0, cy: 284, amp: 22, bw: 5 },
    aG: [[538, 225], [558, 225]],
    ret: [[633, 356], [633, 372], [106, 372], [106, 357]], retLab: [386, 372, true],
    loop: [[14, 290], [6, 290], [6, 51], [17, 51]], loopLab: [12, 190, 'left'],
    st: [14, 400, 692],
  };
  const NARROW = {
    titleA: [14, 13], off: [5, -5],
    cams: [{ x: 18, y: 32, w: 58, h: 38, lab: [47, 80] }, { x: 18, y: 94, w: 58, h: 38, lab: [47, 142] }],
    pos: [12, 152, 138, 20],
    aCam: [[[78, 51], [94, 51]], [[78, 113], [94, 113]]],
    encs: [[96, 32, 80, 38], [96, 94, 80, 38]],
    aEnc: [[[178, 51], [197, 51]], [[178, 113], [197, 113]]], aPos: [[152, 162], [197, 162]],
    col: { cw: 11, box: [196, 23, 19, 155], cells: colCells(200, [51, 113, 162], 11, 1.5) },
    colLab: [224, 66, 'left'], onceLab: [224, 100, 'left'], aCol: [[206, 180], [206, 201]],
    cond: { x: 110, y: 208, nb: 6, cw: 13, lab: [150, 191] },
    chip: [238, 188, 112, 54], aChip: [[236, 215], [213, 215]],
    fan: [158, 230], fanLab: [104, 242, 'right'],
    U: {
      box: [8, 252, 344, 132],
      blocks: [blk(24, 264, 16, 5.5, 14, [106, 263]), blk(50, 298, 8, 7, 18, [106, 297]), blk(162, 324, 4, 9, 22, [180, 323]), blk(254, 298, 8, 7, 18, [254, 297]), blk(248, 264, 16, 5.5, 14, [254, 263])],
      links: [[[78, 278], [78, 296]], [[106, 312], [160, 332]], [[198, 332], [252, 312]], [[282, 298], [282, 280]]],
      skips: [[[112, 271], [246, 271]], [[106, 307], [252, 307]]],
      lab: [180, 360],
    },
    F: { x: 8, y: 400, w: 184, h: 118, x0: 22, dx: 10.4, cy: 462, amp: 19, br: 492, bpx: 9 },
    aF: [[40, 398], [40, 280]],
    Gp: { x: 200, y: 400, w: 152, h: 118, x0: 212, dx: 8.5, cy: 462, amp: 18, bw: 4.5 },
    aG: [[320, 280], [320, 398]],
    ret: [[276, 520], [276, 532], [100, 532], [100, 521]], retLab: [188, 546, false],
    loop: [[8, 458], [4, 458], [4, 51], [16, 51]], loopLab: [10, 188, 'left'],
    st: [14, 568, 332],
  };
  if (typeof Anim !== 'undefined') Anim.add('dp-arch', { W: 720, H: 432, start: 13.8, narrowAt: 680, draw: (c, k, t, P, A) => draw(c, k, t, P, A, WIDE), narrow: { W: 360, H: 620, draw: (c, k, t, P, A) => draw(c, k, t, P, A, NARROW) } });
  return { T, PH, stepAt, doneAt, chunkAt, A0, EPS };
})();

/* ===================== 4. Лаборатория: Ада и диффузионная политика ===================== */
const Lab = (() => {
  const TAS = [1, 2, 4, 8, 16], SHIFT = 12;
  const st = {
    share: 0.5, Ta: 8, steps: 16, reg: false, shift: false, plan: true,
    data: null, dataKey: '', cache: {}, res: null, play: null, batchNo: 0, training: false, prog: 0, loss: { den: [], reg: [] }, log: [], curve: {},
    sel: null, flipGeo: null,   // выбранный на полоске прогон и геометрия полоски для клика
  };
  let ctl = null;
  const key = () => String(st.share);
  function ensureData() {
    if (st.data && st.dataKey === key()) return st.data;
    st.data = E.makeDemos({ n: 40, pLeft: st.share, seed: 1 }); st.dataKey = key();
    if (!st.cache[key()]) st.cache[key()] = { den: null, reg: null, loss: { den: [], reg: [] } };
    st.loss = st.cache[key()].loss;
    return st.data;
  }
  const models = () => (ensureData(), st.cache[key()]);
  const needTrain = () => !models().den || (st.reg && !models().reg);
  function* trainNeeded() {
    const D = ensureData(), m = models();
    if (!m.den) { m.loss.den = []; m.den = yield* E.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0', seed: 5 }); }
    if (st.reg && !m.reg) { m.loss.reg = []; m.reg = yield* E.trainReg15(D.demos, { loss: 'mse', seed: 5 }); }
  }
  /** Первая точка касания: отрезки пути против чайника в его положении на этом шаге. */
  function hitAt(q) {
    for (let t = 0; t < q.pts.length - 1; t++) {
      const kx = q.kpath[Math.min(t, q.kpath.length - 1)];
      if (E.segHit(q.pts[t], q.pts[t + 1], { x: kx, y: E.KETTLE.y })) return { t, x: q.pts[t + 1].x, y: q.pts[t + 1].y };
    }
    return null;
  }
  const summ = (rs) => ({ n: rs.length, touches: rs.filter((q) => q.touch).length, maxSw: Math.max(...rs.map((q) => q.sw)), flips2: rs.filter((q) => q.flips >= 2).length,
    maxFlip: Math.max(...rs.map((q) => q.flips)), worst: rs.reduce((b, q, i) => (q.flips > rs[b].flips ? i : b), 0),
    left: rs.filter((q) => !q.touch && q.side < 0).length, right: rs.filter((q) => !q.touch && q.side > 0).length, ok: rs.filter((q) => !q.touch && q.flips < 2).length, passes: rs[0].passes / Math.max(1, rs[0].chunks) });
  /** Цепочка пачек прогона у чайника: для каждой пачки, у которой есть точки не дальше 60 см от чайника, — её сторона
   *  (−1 слева, 1 справа, 0 — отклонение меньше 6 см, сторона не выбрана). Смены стороны считаются так же, как в движке:
   *  пачки без стороны пропускаются. Это и рисует полоска прогонов под сценой. */
  function chainOf(q) {
    const cells = []; let intent = 0, flips = 0;
    for (const pl of q.plans || []) {
      const cs = E.chunkSide(pl.c, pl.x0, pl.y0, { x: q.kpath[Math.min(pl.t, q.kpath.length - 1)], y: E.KETTLE.y });
      if (cs == null) continue;
      const sd = Math.abs(cs) > 6 ? (cs > 0 ? 1 : -1) : 0;
      if (sd && intent && sd !== intent) flips++; if (sd) intent = sd;
      cells.push({ t: pl.t, sd, cs });
    }
    return { cells, flips };
  }
  async function run(o) {
    o = o || {}; const D = ensureData(); st.sel = null; flipsNote();
    if (needTrain()) {
      st.training = true; st.prog = 0; draw();
      const m = models(), it = { den: m.den ? 1 : 0, reg: st.reg && !m.reg ? 0 : 1 };
      await runChunked(trainNeeded(), (e) => {
        if (e.iters === 3000) { m.loss.den.push([e.it, e.loss]); it.den = e.it / e.iters; } else { m.loss.reg.push([e.it, e.loss]); it.reg = e.it / e.iters; }
        st.prog = st.reg ? (it.den + it.reg) / 2 : it.den; drawStats(); plotLoss();
      }, 14);
      st.training = false;
    }
    const n = o.n || 10, m = models(), seed0 = st.shift ? 500 : 1 + 10 * st.batchNo++;
    const opt = (i) => { const q = { Ta: st.Ta, steps: st.steps, keepPlans: true }; if (st.shift) q.kpush = { t: 8 + ((seed0 + i) * 7) % 12, dx: SHIFT, toward: true }; return q; };
    const res = { den: [], reg: [] };
    for (let i = 0; i < n; i++) res.den.push(E.run15(m.den, E.KETTLE, seed0 + i, opt(i)));
    if (st.reg) for (let i = 0; i < n; i++) res.reg.push(E.run15(m.reg, E.KETTLE, seed0 + i, opt(i)));
    for (const p of ['den', 'reg']) res[p].forEach((q) => { q.hit = q.touch ? hitAt(q) : null; q.chain = chainOf(q); });
    const r = { share: st.share, Ta: st.Ta, steps: st.steps, shift: st.shift, reg: st.reg, n, nLeft: D.nLeft, nRight: D.nRight, den: summ(res.den), regS: st.reg ? summ(res.reg) : null };
    if (st.shift && n >= 20) st.curve[st.Ta] = r.den.ok;
    st.log.push(r);
    return new Promise((resolve) => { st.res = res; st.play = playback(2200, () => { st.play = null; try { draw(); plotCurve(); plotFlips(); flipsNote(); } finally { resolve(r); } }); });
  }
  /* ---------- рисование ---------- */
  function drawPlan(c, P, plan, color) {
    for (let j = 0; j < E.TP15; j++) {
      const x = plan.x0 + plan.c[2 * j] * E.SC, y = plan.y0 + plan.c[2 * j + 1] * E.SY, done = j < st.Ta;
      c.beginPath(); c.arc(x, y, done ? 3.6 : 3, 0, 7);
      if (done) { c.fillStyle = color; c.fill(); } else { c.lineWidth = 1.4; c.strokeStyle = color; c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1; }
    }
  }
  function activePlan(q, t) { let p = null; for (const pl of q.plans || []) { if (pl.t <= t) p = pl; else break; } return p; }
  function draw() {
    const { c, k } = HeroKit.fit($('#labCv'), E.W, E.H), P = KD.pal(), D = ensureData();
    KD.house(c, k, P);
    KD.demos(c, P, D.demos, st.res ? 0.18 : 0.4);
    const u = st.play ? st.play.u() : 1;
    if (st.res) {
      const sel = st.sel != null && !st.play && st.res.den[st.sel] ? st.sel : null, m0 = sel == null ? 0 : sel;
      const q0 = st.res.den[m0], tN = Math.min(q0.pts.length - 1, Math.round(u * (q0.pts.length - 1)));
      const kx = q0.kpath[Math.min(tN, q0.kpath.length - 1)];
      if (st.shift && Math.abs(kx - E.KETTLE.x) > 0.5) KD.kettle(c, k, P, E.KETTLE, { ghost: true });
      KD.kettle(c, k, P, { x: kx, y: E.KETTLE.y }, { label: true });
      c.lineJoin = 'round'; c.lineCap = 'round';
      for (const p of ['reg', 'den']) {
        const runs = st.res[p]; if (!runs.length) continue; const color = p === 'den' ? P.dif : P.reg;
        // остальные прогоны тонкие; при выбранном прогоне они приглушены, выбранный — ярко
        if (!st.play) { c.strokeStyle = color; if (p === 'reg') c.setLineDash([6, 5]); for (let i = 0; i < runs.length; i++) { if (i === m0) continue; const hi = sel == null && p === 'den' && runs[i].flips >= 2; c.lineWidth = hi ? 2.4 : 1.3; c.globalAlpha = sel != null ? 0.15 : hi ? 0.9 : 0.4; KD.pathPts(c, runs[i].pts, runs[i].hit ? runs[i].hit.t + 1 : null); } c.setLineDash([]); c.globalAlpha = sel != null ? 0.3 : 1; for (let i = 0; i < runs.length; i++) if (i !== m0 && runs[i].hit) HeroKit.cross(c, runs[i].hit.x, runs[i].hit.y, 4, P.bad, 1.8); c.globalAlpha = 1; }
        const q = runs[Math.min(m0, runs.length - 1)], tq = Math.min(tN, q.pts.length - 1), stop = q.hit ? Math.min(tq, q.hit.t + 1) : tq;
        c.strokeStyle = color; c.lineWidth = 3; if (p === 'reg') c.setLineDash([7, 5]); KD.pathPts(c, q.pts, stop); c.setLineDash([]);
        if (st.plan) { const pl = activePlan(q, stop); if (pl) drawPlan(c, P, pl, color); }
        const a = q.pts[stop], b = q.pts[Math.max(0, stop - 1)];
        KD.ada(c, a.x, a.y, KD.heading(b.x, b.y, a.x, a.y), color);
        if (q.hit && tq >= q.hit.t + 1) HeroKit.cross(c, q.hit.x, q.hit.y - E.RA - 8, 6, P.bad, 2.6);
      }
    } else {
      KD.kettle(c, k, P, E.KETTLE, { label: true });
      KD.ada(c, E.START.x, E.START.y, -Math.PI / 2, P.dif, 0.95);
      if (st.reg) KD.ada(c, E.START.x - 9, E.START.y, -Math.PI / 2, P.reg, 0.7);
    }
    const D2 = ensureData(), selQ = !st.play && st.sel != null && st.res ? st.res.den[st.sel] : null, narrow = k > 1.5;
    const txt = (st.training ? `обучение ${fmt1(st.prog * 100, 0)}%` : st.play ? `прогон 1 · шаг ${Math.round(u * (st.res.den[0].pts.length - 1))}` : selQ ? (narrow ? `прогон ${st.sel + 1}: смен стороны ${selQ.flips}${selQ.touch ? ', касание' : ''}` : `показан ${selTxt(selQ, st.sel)}`) : st.res ? `${st.res.den.length} прогонов` : 'до запуска') + (selQ && narrow ? '' : ` · демонстраций ${D2.nLeft} слева, ${D2.nRight} справа`);
    HeroKit.label(c, k, txt, 10, E.H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    drawStats(); labLegend();
  }
  /** Легенда сцены: пункт про яркие пути появляется, когда среди прогонов есть такие, где план менял сторону два раза и больше. */
  function labLegend() {
    const selOn = st.sel != null && !!st.res && !st.play, hi = !selOn && !!(st.res && !st.play && st.res.den.some((q) => q.flips >= 2)), sig = `${st.reg}|${hi}|${selOn}`;
    const box = $('#labLegend'); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    const items = [['диффузионная политика', 'var(--pol-dif)'], ['регрессия с пачками', 'var(--pol-reg)', 'dash'], ['план: исполнит / заменит', 'var(--pol-dif)', 'dot'], ['демонстрации', 'var(--ink-3)'], ['касание', 'var(--critical)']];
    if (hi) items.splice(1, 0, ['прогон, где план менял сторону ≥ 2 раз', 'var(--pol-dif)', 'thick']);
    if (selOn) items.splice(1, 0, ['выбранный на полоске прогон; остальные приглушены', 'var(--pol-dif)', 'thick']);
    legend('#labLegend', items);
  }
  const selTxt = (q, i) => `прогон ${i + 1}: сторона менялась ${nWord(q.flips, 'раз', 'раза', 'раз')}${q.touch ? ', касание' : ', без касания'}`;
  /** Клик по ряду полоски: показать путь этого прогона на сцене; повторный клик, клик мимо рядов или по сцене снимает выделение. */
  function selectRun(i) { st.sel = i == null || st.sel === i ? null : i; draw(); plotFlips(); flipsNote(); }
  function flipsNote() {
    const el = $('#flipsOut'); if (!el) return;
    const q = st.sel != null && st.res && !st.play ? st.res.den[st.sel] : null;
    setOut(el, q ? `Показан ${selTxt(q, st.sel)}. Нажми на ряд ещё раз или на сцену, чтобы снять выделение.` : st.res && !st.play ? 'Нажми на ряд, чтобы показать на сцене путь этого прогона.' : '');
  }
  /** Полоска прогонов: ряд — прогон, клетки — пачки у чайника по порядку, цвет — сторона; ряды с ≥ 2 сменами в рамке. */
  function plotFlips() {
    const wrap = $('#wrapFlips'); if (wrap.hidden) return;
    // на узком экране (k > 1,5) подписи в экранных пикселях выше ряда — ряды делаем выше, высота канваса подстраивается
    const cv = $('#labFlips'), W = 520, ROWS = 10, k0 = W / (cv.getBoundingClientRect().width || W), narrow = k0 > 1.5;
    const rowH = narrow ? 20 : 12, top = narrow ? 26 : 20, H = top + ROWS * rowH + 6;
    cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = HeroKit.fit(cv, W, H), P = KD.pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const runs = st.res ? st.res.den : null;
    st.flipGeo = { top, rowH, H, rows: runs ? Math.min(ROWS, runs.length) : 0 }; cv.classList.toggle('has-rows', !!runs);
    if (!runs) { HeroKit.label(c, k, narrow ? 'Нажми «Прогнать 10 раз» — здесь появятся цепочки пачек' : 'Нажми «Прогнать 10 раз»: здесь появятся цепочки пачек каждого прогона', W / 2, H / 2, { px: narrow ? 11 : 12, color: P.ink3, halo: false }); return; }
    const L = narrow ? 40 : 30, R = narrow ? 70 : 80, px = narrow ? 10 : 10.5;
    const maxN = Math.max(1, ...runs.map((q) => q.chain.cells.length)), cw = (W - L - R) / maxN, gap = Math.min(2, cw * 0.22);
    HeroKit.label(c, k, narrow ? 'прогон · пачки у чайника →' : 'прогон · пачки, построенные у чайника, по порядку →', L, top / 2, { align: 'left', px, mono: true, color: P.ink3, halo: false });
    HeroKit.label(c, k, 'смен', W - 2, top / 2, { align: 'right', px, mono: true, color: P.ink3, halo: false });
    runs.slice(0, ROWS).forEach((q, i) => {
      const y = top + i * rowH, mark = q.flips >= 2, isSel = st.sel === i;
      if (isSel) { c.globalAlpha = 0.2; c.fillStyle = P.dif; c.fillRect(2, y - 1, W - 4, rowH - 1); c.globalAlpha = 1; c.strokeStyle = P.dif; c.lineWidth = 2; c.strokeRect(2.5, y - 0.5, W - 5, rowH - 2); }
      else if (mark) { c.fillStyle = P.surf; c.fillRect(2, y - 1, W - 4, rowH - 1); c.strokeStyle = P.ink; c.lineWidth = 1.3; c.strokeRect(2.5, y - 0.5, W - 5, rowH - 2); }
      HeroKit.label(c, k, String(i + 1), L - 6, y + rowH / 2 - 1, { align: 'right', px, mono: true, weight: mark ? 750 : 500, color: mark ? P.ink : P.ink3, halo: false });
      q.chain.cells.forEach((cell, j) => {
        const x = L + j * cw; c.beginPath(); c.rect(x + gap / 2, y + 1, Math.max(1, cw - gap), rowH - 4);
        if (cell.sd) { c.fillStyle = cell.sd < 0 ? P.left : P.right; c.fill(); } else { c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.grid; c.lineWidth = 1; c.stroke(); }
      });
      HeroKit.label(c, k, `${q.flips}${narrow ? '' : (q.touch ? ' · касание' : '')}`, W - 4, y + rowH / 2 - 1, { align: 'right', px, mono: true, weight: mark ? 750 : 500, color: mark ? P.ink : P.ink3, halo: false });
    });
  }
  function drawStats() {
    const box = $('#labStats'), last = st.res && !st.play ? st.log[st.log.length - 1] : null;
    const sig = [st.training ? Math.round(st.prog * 50) : -1, last ? st.log.length : 0, st.reg, st.Ta, st.steps].join('|');
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = '';
    const card = (name, col, sub, v) => box.append(h('div', { class: 'st', style: `--c:${col}` }, h('b', null, name), h('span', null, sub), h('div', { class: 'v' }, v)));
    const sub = `исполнять ${st.Ta} из 16 · шагов денойзинга ${st.steps}`;
    const v = (s, passes) => (s ? `касаний: ${s.touches} из ${s.n} · план менял сторону ≥ 2 раз: ${s.flips2} · проходов сети на пачку: ${fmt1(passes, 0)}` : '—');
    card('Диффузионная политика', 'var(--pol-dif)', st.training ? `обучается… ${fmt1(st.prog * 100, 0)}%` : sub, last ? v(last.den, st.steps) : '—');
    if (st.reg) card('Регрессия с пачками', 'var(--pol-reg)', 'вся пачка за один проход', last && last.regS ? v(last.regS, 1) : '—');
  }
  function plotLoss() {
    const cv = $('#labLoss'), W = 520, H = 96, { c, k } = HeroKit.fit(cv, W, H), P = KD.pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const half = W / 2;
    for (const [i, kind, title, its] of [[0, 'den', 'денойзер: ошибка оценки пачки', 3000], [1, 'reg', 'регрессия: MSE', 2500]]) {
      const L = st.loss[kind] || [], x0 = i * half + 10, x1 = (i + 1) * half - 10, y0 = 22, y1 = H - 10;
      HeroKit.label(c, k, title, x0, 11, { align: 'left', px: 10.5, mono: true, color: P.ink3, halo: false });
      c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (L.length < 2) continue;
      const vs = L.map((q) => q[1]), lo = Math.min(...vs), hi = Math.max(...vs) || 1;
      c.strokeStyle = kind === 'den' ? P.dif : P.reg; c.lineWidth = 2; c.beginPath();
      L.forEach(([it, v], j) => { const x = x0 + it / (its - 1) * (x1 - x0), y = y1 - (v - lo) / Math.max(1e-6, hi - lo) * (y1 - y0 - 4); j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
  }
  function plotCurve() {
    const cv = $('#labCurve'), W = 520, H = 170, { c, k } = HeroKit.fit(cv, W, H), P = KD.pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const box = { l: 40, r: W - 18, t: 28, b: H - 28 }, x = (i) => box.l + 20 + i * (box.r - box.l - 40) / (TAS.length - 1), y = (v) => box.b - v / 20 * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 5, 10, 15, 20]) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, String(v), box.l - 8, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    TAS.forEach((ta, i) => HeroKit.label(c, k, String(ta), x(i), box.b + 15, { px: 10.5, mono: true, color: P.ink3, halo: false }));
    const pts = TAS.map((ta, i) => (st.curve[ta] != null ? { i, v: st.curve[ta] } : null)).filter(Boolean);
    if (!pts.length) { HeroKit.label(c, k, 'точек пока нет', (box.l + box.r) / 2, (box.t + box.b) / 2, { px: 12, color: P.ink3, halo: false }); return; }
    const best = Math.max(...pts.map((p) => p.v));
    c.strokeStyle = P.dif; c.lineWidth = 2.2; c.beginPath(); pts.forEach((p, j) => (j ? c.lineTo(x(p.i), y(p.v)) : c.moveTo(x(p.i), y(p.v)))); c.stroke();
    for (const p of pts) { c.beginPath(); c.arc(x(p.i), y(p.v), p.v === best ? 7 : 5, 0, 7); c.fillStyle = p.v === best ? P.good : P.dif; c.fill(); HeroKit.label(c, k, String(p.v), x(p.i), y(p.v) - 14, { px: 11, weight: 750, color: P.ink, haloColor: P.bg }); }
  }
  /* ---------- ручки ---------- */
  function syncCtl() {
    const sh = $('#labShare'), stp = $('#labSteps');
    st.share = +sh.value / 100; sh.nextElementSibling.textContent = `${sh.value}%`;
    st.steps = +stp.value; stp.nextElementSibling.textContent = stp.value;
    st.reg = $('#labReg').checked; st.shift = $('#labShift').checked; st.plan = $('#labPlan').checked;
    $$('#wrapTa button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ta === st.Ta)));
    if (st.res && st.dataKey !== key()) { st.res = null; st.sel = null; }
    draw(); plotLoss(); plotCurve(); plotFlips(); flipsNote(); if (ctl) ctl.update();
  }
  function setCtl(o) {
    if (o.share != null) $('#labShare').value = Math.round(o.share * 100);
    if (o.steps != null) $('#labSteps').value = o.steps;
    if (o.reg != null) $('#labReg').checked = o.reg;
    if (o.shift != null) $('#labShift').checked = o.shift;
    if (o.Ta != null) st.Ta = o.Ta;
    if (o.clear) { st.res = null; st.sel = null; }
    syncCtl();
  }
  const api = {
    reset() { st.log = []; st.batchNo = 0; st.res = null; st.curve = {}; $('#labPlan').checked = true; setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: false }); },
    run, setCtl,
    state: () => ({ share: st.share, Ta: st.Ta, steps: st.steps, reg: st.reg, shift: st.shift, log: st.log.slice(), curve: Object.assign({}, st.curve), sel: st.sel }),
    selectRun,
  };
  const shareTxt = (r) => `${Math.round(r.share * 100)} на ${100 - Math.round(r.share * 100)}`;
  const bestTa = (cv) => { let b = null; for (const ta of TAS) if (cv[ta] != null && (b == null || cv[ta] > cv[b])) b = ta; return b; };
  const edgeOk = (cv) => { const inner = [2, 4, 8].filter((t) => cv[t] != null), edge = [1, 16].filter((t) => cv[t] != null); if (Object.keys(cv).length < 4 || !inner.length) return false; return Math.max(...inner.map((t) => cv[t])) > Math.max(-1, ...edge.map((t) => cv[t])); };
  const missions = [
    { short: 'Десять прогонов', title: 'Десять прогонов', text: '40 демонстраций, поровну слева и справа. Обучи диффузионную политику и прогони Аду 10 раз: она должна каждый раз объехать чайник. Точки впереди Ады — её текущая пачка: закрашенные действия она исполнит, остальные заменит новая пачка.', controls: ['plan'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: false, clear: true }),
      bet: { q: 'сколько раз из 10 Ада заденет чайник?', options: ['Ни разу', '1–3 раза', 'Примерно половину', 'Почти всегда'], answer: (r) => (r.den.touches === 0 ? 0 : r.den.touches <= 3 ? 1 : r.den.touches <= 6 ? 2 : 3) },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Ни одного касания за 10 прогонов', test: (r) => r.den.touches === 0 }, { label: 'Есть объезды с обеих сторон', test: (r) => r.den.left > 0 && r.den.right > 0 }, { label: 'Ни в одном прогоне Ада не перебегала на другую сторону', test: (r) => r.den.maxSw === 0 }],
      summary: (r) => `диффузия: касаний ${r.den.touches} из 10 · слева ${r.den.left}, справа ${r.den.right}`,
      fail: (r) => `Касаний: ${r.den.touches}, смен стороны: до ${r.den.maxSw}. Попробуй ещё раз: следующие 10 прогонов идут с другими зёрнами.`,
      explain: (r) => `Ни одного касания: слева ${nWord(r.den.left, 'раз', 'раза', 'раз')}, справа ${nWord(r.den.right, 'раз', 'раза', 'раз')}. Сторону выбирает шум первой пачки, а пачка из 16 действий её держит: следующая пачка начинается там, где Ада уже обходит чайник, и продолжает тот же объезд. В статье то же на Push-T: Diffusion Policy держит выбранную сторону весь прогон, LSTM-GMM и IBC смещены к одной стороне, а BET «fails to commit». На реальном Push-T у Diffusion Policy 95% успеха, у IBC — 0%, у LSTM-GMM — 20%.` },
    { short: 'Регрессия рядом', title: 'Когда хватает регрессии', text: 'Включи регрессию с пачками: она выдаёт всю пачку за один проход сети. Найди долю объездов, при которой регрессия проезжает 10 из 10, как и диффузия, и сравни, сколько проходов сети тратит каждая.', controls: ['plan', 'reg', 'share'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: true, shift: false, clear: true }),
      bet: { q: 'когда регрессия с пачками справляется не хуже диффузии?', options: ['Ни при какой доле', 'Уже при 50 на 50', 'Когда почти все объезды с одной стороны'], answer: () => 2 },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Регрессия проехала 10 из 10', test: (r) => !!r.regS && r.regS.touches === 0 }, { label: 'Диффузия тоже проехала 10 из 10', test: (r) => r.den.touches === 0 }, { label: 'В демонстрациях есть объезды с обеих сторон', test: (r) => r.nLeft > 0 && r.nRight > 0 }],
      summary: (r) => `доля ${shareTxt(r)}: регрессия — касаний ${r.regS ? r.regS.touches : '—'} из 10, диффузия — ${r.den.touches}`,
      hint: 'Сдвигай долю на 10% за раз. Регрессия выдаёт среднее, и оно уходит от чайника только при заметном перекосе.',
      fail: (r) => (!r.regS ? 'Включи регрессию флажком под сценой.' : r.regS.touches ? `При ${shareTxt(r)} регрессия задела чайник ${nWord(r.regS.touches, 'раз', 'раза', 'раз')} из 10.` : !(r.nLeft > 0 && r.nRight > 0) ? 'Регрессия проехала, но в демонстрациях осталась одна сторона. Оставь хотя бы несколько объездов с другой.' : `Регрессия проехала, а диффузия задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')}. Нажми ещё раз.`),
      explain: (r) => `При ${shareTxt(r)} регрессия проехала 10 из 10, потратив <b>1 проход сети</b> на пачку против ${r.steps} у диффузии. При 50 на 50 она иногда тоже проезжает: Ада видит своё положение, и случайный уход в сторону закрепляется. Но гарантии нет, и часть прогонов заканчивается в чайнике. Когда стратегия в данных одна, регрессия с пачками не хуже и намного дешевле: OpenVLA-OFT (открытая политика, Стэнфорд, 2025; урок 3.5) с L1 даёт 97,1% на бенчмарке LIBERO и генерирует в 26 раз быстрее, с оговоркой авторов про «a consistent strategy per task». Pan и соавторы на 28 бенчмарках не нашли преимущества генеративной головы, кроме задач на высокую точность. Когда демонстрации разных операторов расходятся, выигрывает диффузия: в ALOHA Unleashed (урок 1.7) — 70% против 25% у L1.` },
    { short: 'По одному действию', title: 'Исполняй по одному действию', text: 'Пусть политика строит новую пачку на каждом шаге управления и исполняет только её первое действие. Полоска под сценой покажет для каждого прогона цепочку пачек у чайника и сторону каждой пачки. Найди прогон, в котором план Ады дважды или больше сменил сторону объезда.', controls: ['plan', 'Ta', 'flips'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 1, steps: 16, reg: false, shift: false, clear: true }),
      bet: { q: 'что будет, если пересчитывать пачку на каждом шаге управления?', options: ['Ада поедет точнее', 'Ничего не изменится', 'План начнёт менять сторону'], answer: (r) => (r.den.flips2 > 0 ? 2 : 1) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Исполняется по одному действию из пачки', test: (r) => r.Ta === 1 }, { label: 'Найден прогон, где план сменил сторону два раза или больше', test: (r) => r.den.flips2 > 0 }],
      summary: (r) => `исполнять ${r.Ta} из 16: план менял сторону ≥ 2 раз в ${r.den.flips2} прогонах из 10, касаний ${r.den.touches}`,
      hint: 'Включи показ плана и следи за точками перед Адой у развилки: при исполнении по одному действию они перескакивают с одной стороны на другую. После прогона смотри на полоску под сценой: ряды с двумя и больше сменами стороны обведены рамкой.',
      fail: (r) => (r.Ta !== 1 ? 'Выбери исполнение по одному действию.' : 'В этих прогонах план держал сторону. Нажми ещё раз: зёрна новые.'),
      explain: (r) => `В ${r.den.flips2} прогонах из 10 план дважды и больше менял сторону: на полоске под сценой это ряды в рамке, больше всего смен — ${r.den.maxFlip} в прогоне ${r.den.worst + 1}; на сцене пути этих прогонов нарисованы ярче. Каждая клетка ряда — пачка, построенная у чайника, цвет — сторона, с которой она его объезжает, и при исполнении по одному действию цвет вдоль ряда чередуется. Каждая пачка — новый сэмпл, и пока Ада у развилки, он с близкой вероятностью выбирает любой объезд. Ада успевает исполнить из каждого плана одно действие и почти не отклоняется, поэтому касаний мало: ${r.den.touches} из 10. Зато решения нет: Ада держится середины, и если чайник сдвинется, уйти она не успеет — это миссия 5. Авторы Diffusion Policy описывают такое поведение как «jittery actions that alternate between the two valid trajectories», в статье BID — как «oscillations between different strategies».` },
    { short: 'Шаги денойзинга', title: 'Сколько шагов денойзинга нужно', text: 'Сейчас пачку строят за 1 шаг денойзинга вместо 16. Посмотри, что сделает Ада, а потом найди число шагов денойзинга не больше 4, при котором она проезжает 10 из 10.', controls: ['plan', 'steps'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 1, reg: false, shift: false, clear: true }),
      bet: { q: 'что сделает Ада при одном шаге денойзинга?', options: ['Объедет, как при 16 шагах', 'Начнёт задевать чайник', 'Будет менять сторону'], answer: (r) => (r.den.touches > 0 ? 1 : r.den.flips2 > 0 ? 2 : 0) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'При одном шаге денойзинга Ада задела чайник', test: (r, s) => s.log.some((q) => q.steps === 1 && !q.shift && q.Ta === 8 && q.den.touches > 0) }, { label: 'Найдено число шагов денойзинга не больше 4, при котором 10 из 10', test: (r) => r.steps <= 4 && r.Ta === 8 && !r.shift && r.den.touches === 0 }],
      summary: (r) => `${nWord(r.steps, 'шаг', 'шага', 'шагов')} денойзинга: касаний ${r.den.touches} из 10, проходов сети на пачку ${r.steps}`,
      hint: 'Начни с одного шага денойзинга, потом прибавляй по одному.',
      fail: (r) => (r.steps > 4 ? 'Шагов денойзинга больше четырёх. Найди меньшее число.' : r.steps === 1 && r.den.touches ? `При одном шаге денойзинга Ада задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')} из 10. Теперь прибавь шагов.` : r.den.touches ? `При ${r.steps} шагах денойзинга Ада задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')}. Прибавь шаг.` : 'Без касаний. Посмотри ещё, что происходит при одном шаге денойзинга.'),
      explain: (r) => `Уже ${nWord(r.steps, 'шага', 'шагов', 'шагов')} денойзинга хватает на 10 из 10, а при одном шаге Ада задевает чайник. Один шаг из чистого шума — это оценка денойзера при максимальном шуме, а она близка к среднему демонстраций, то есть к той же регрессии: в уроке 1.4 стрелки score при большом шуме смотрели в среднее. У настоящих систем: Diffusion Policy — 16 шагов DDIM (в разделе 3.4 статьи — 10 шагов и 0,1 с на RTX 3080), π0 (урок 3.6) — 10 шагов flow matching, GR00T N1 (урок 3.7) — 4. Одношаговые политики получают дистилляцией: Consistency Policy работает за 1–3 шага, 21–22 мс против примерно 195 мс у DDIM на 15 шагах.` },
    { short: 'Сколько исполнять', title: 'Сколько исполнять из 16', text: `Теперь в случайный момент чайник сдвигают на ${SHIFT} см в сторону, куда объезжает Ада. Каждый запуск — 20 прогонов, одни и те же для любой длины исполнения. Построй кривую: сколько прогонов из 20 прошли без касания и без смен плана при 1, 2, 4, 8 и 16 исполняемых действиях.`, controls: ['plan', 'Ta', 'curve'],
      onEnter: (X) => { X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: true, clear: true }); },
      bet: { q: 'где будет максимум?', options: ['При 1: чем чаще пересчитываем, тем лучше', 'Где-то посередине', 'При 16: пачку лучше исполнять целиком'], answer: () => 1 },
      action: { label: 'Прогнать 20 раз', run: (X) => X.run({ n: 20 }) },
      criteria: [{ label: 'На графике не меньше четырёх точек', test: (r, s) => Object.keys(s.curve).length >= 4 }, { label: 'Лучший результат — не на краю, не при 1 и не при 16', test: (r, s) => edgeOk(s.curve) }],
      summary: (r) => `исполнять ${r.Ta} из 16: без касаний и смен плана ${r.den.ok} из 20`,
      hint: 'Переключай длину исполнения кнопками под сценой и запускай 20 прогонов для каждой.',
      fail: (r, ctx) => { const cv = Lab.st.curve, n = Object.keys(cv).length; return n < 4 ? `Точек на графике: ${n}. Нужно хотя бы четыре разные длины исполнения.` : 'Пока лучший результат на краю. Добавь недостающие точки.'; },
      explain: () => { const cv = Lab.st.curve, b = bestTa(cv), all = TAS.filter((t) => cv[t] === cv[b]); return `Лучше всего — исполнять <b>${all.join(' и ')} из 16</b>: ${cv[b]} прогонов из 20 без касаний и смен плана. При одном-двух действиях план меняет сторону, и Ада не успевает уйти от сдвинутого чайника. При 16 она исполняет старый план и замечает сдвиг поздно. Авторы Diffusion Policy пришли к тем же цифрам: наблюдают 2 последних шага управления, предсказывают 16 действий, исполняют 8 (на реальном Push-T — 6), а качество держится при задержке до 4 шагов управления.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Доступны все ручки: доля объездов, регрессия рядом, длина исполнения, шаги денойзинга и сдвиг чайника. Попробуй регрессию со сдвигом чайника: что с ней происходит и почему?', final: true,
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() }, summary: (r) => `${shareTxt(r)}, исполнять ${r.Ta}, шагов денойзинга ${r.steps}${r.shift ? ', сдвиг' : ''} → диффузия ${r.den.touches}/10${r.regS ? `, регрессия ${r.regS.touches}/10` : ''}` },
  ];
  function init() {
    labLegend();
    legend('#labLossLegend', [['ошибка денойзера', 'var(--pol-dif)'], ['регрессии', 'var(--pol-reg)']]);
    for (const id of ['#labShare', '#labSteps']) $(id).addEventListener('input', syncCtl);
    for (const id of ['#labReg', '#labShift', '#labPlan']) $(id).addEventListener('change', syncCtl);
    $$('#wrapTa button').forEach((b) => b.addEventListener('click', () => { st.Ta = +b.dataset.ta; syncCtl(); }));
    HeroKit.loop($('#labCv'), () => { if (st.play) draw(); });
    const fcv = $('#labFlips');
    fcv.addEventListener('click', (e) => {
      const g = st.flipGeo, runs = st.res && st.res.den; if (!g || !runs || st.play) return;
      const r = fcv.getBoundingClientRect(), y = (e.clientY - r.top) * g.H / r.height, row = Math.floor((y - g.top) / g.rowH);
      selectRun(y >= g.top && row >= 0 && row < g.rows ? row : null);
    });
    $('#labCv').addEventListener('click', () => { if (st.sel != null) selectRun(null); });
    ctl = mountMissions('#labMis', missions, api, {
      controls: { plan: '#wrapPlan', reg: '#wrapReg', share: '#wrapShare', Ta: '#wrapTa', steps: '#wrapSteps', shift: '#wrapShift', curve: '#wrapCurve', flips: '#wrapFlips' },
      scene: '#labCv',
    });
    syncCtl(); plotLoss(); plotCurve(); redrawOn(() => { draw(); plotLoss(); plotCurve(); plotFlips(); });
    return ctl;
  }
  return { init, api, st };
})();

/* ===================== 5. Схема Real-Time Chunking (shared/anim.js, ключ 'rtc') =====================
   Две панели с одной и той же картиной: по горизонтали шаги управления, по вертикали смещение Ады вбок.
   Пачка 1 из LEN действий уходит на моторы по одному; на шаге G0 сеть начинает строить пачку 2 и занята D шагов,
   робот тем временем продолжает пачку 1. Слева RTC: первые D действий пачки 2 — замороженные копии тех, что
   исполнялись во время счёта, остальные дорисованы так, чтобы продолжить исполняемую линию, стык без скачка.
   Справа наивная замена: пачка 2 построена из нового шума по кадрам шага G0, выбрала другой объезд — скачок. */
const Rtc = (() => {
  const S = 20, LEN = 16, G0 = 4, D = 4, STEP = 0.45, T0 = 0.8, TT = 12, AMP = 30;
  const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const prof = (s) => sm((s - 2) / 6) - sm((s - 13) / 7);                 // объезд: выход к шагу 8, возврат к шагу 20
  const v1 = (s) => -AMP * prof(s);                                       // пачка 1: объезд слева
  const v2r = (s) => -AMP * prof(s) + 2.5 * Math.sin((s - 8) * 0.7);      // пачка 2 (RTC): тот же объезд, чуть иначе доведён
  const v2n = (s) => { const b = sm((s - 4) / 4); return (1 - b) * v1(4) + b * AMP * prof(s); }; // наивная: из кадров шага 4 выбран объезд справа
  const exec = (s, mode) => (s <= G0 + D ? v1(s) : mode === 'rtc' ? v2r(s) : v2n(s));            // что исполняется на шаге s
  function lock(c, x, y, col) {
    c.strokeStyle = col; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y - 1.5, 2.6, Math.PI, 0); c.stroke();
    c.fillStyle = col; c.beginPath(); c.roundRect(x - 3.6, y - 1.5, 7.2, 5.4, 1.2); c.fill();
  }
  function panel(c, k, u, P, A, ox, oy, pw, mode, narrow) {
    const { line, circle, rect, lab, alpha, arrow } = A;
    const ax0 = ox + 48, ax1 = ox + pw - 16, cy = oy + 170, sc = 1.6, ay = oy + 248, my = oy + 284;
    const xs = (s) => ax0 + s / S * (ax1 - ax0), ys = (v) => cy - v * sc;
    const cur = u < T0 ? 0 : Math.min(LEN, (u - T0) / STEP), cs = Math.floor(cur), arrived = cur >= G0 + D, gen = cur >= G0 && !arrived, fin = u >= T0 + LEN * STEP;
    lab(c, k, mode === 'rtc' ? 'Real-Time Chunking' : 'Наивная замена пачки', ox + pw / 2, oy + 14, { px: 12.5, weight: 750, color: P.ink, halo: false });
    // полоса «сеть строит пачку 2»
    const bx0 = xs(G0), bx1 = xs(G0 + D), by = oy + 42;
    rect(c, bx0, by, bx1 - bx0, 14, 4, P.surf, cur >= G0 ? P.spr : P.line, cur >= G0 ? 1.8 : 1.2);
    if (cur >= G0) { const f = Math.min(1, (cur - G0) / D); c.fillStyle = alpha(P.spr, arrived ? 0.35 : 0.55); c.beginPath(); c.roundRect(bx0 + 1, by + 1, Math.max(0, (bx1 - bx0 - 2) * f), 12, 3); c.fill(); }
    lab(c, k, cur < G0 ? 'сеть ждёт заказа на пачку 2' : gen ? `сеть строит пачку 2 · задержка ${D} шага` : 'пачка 2 готова', (bx0 + bx1) / 2, oy + 31, { px: 10, weight: 650, color: cur >= G0 ? P.spr : P.ink3, halo: false });
    // сетка и оси
    for (const v of [-AMP, 0, AMP]) line(c, [[ax0, ys(v)], [ax1, ys(v)]], P.grid, 1);
    lab(c, k, 'справа', ax0 - 6, ys(AMP), { px: 9.5, align: 'right', color: P.ink3, halo: false });
    lab(c, k, 'прямая', ax0 - 6, ys(0), { px: 9.5, align: 'right', color: P.ink3, halo: false });
    lab(c, k, 'слева', ax0 - 6, ys(-AMP), { px: 9.5, align: 'right', color: P.ink3, halo: false });
    lab(c, k, narrow ? 'вбок' : 'смещение вбок', ax0 + 2, oy + 66, { px: 9.5, align: 'left', color: P.ink3, halo: false });
    line(c, [[ax0, ay], [ax1 + 6, ay]], P.line, 1.4);
    for (let s = 0; s <= S; s++) line(c, [[xs(s), ay - (s % 4 ? 2 : 5)], [xs(s), ay + (s % 4 ? 2 : 5)]], P.ink3, 1);
    for (const s of [0, 4, 8, 12, 16, 20]) lab(c, k, String(s), xs(s), ay + 14, { px: 9.5, mono: true, color: P.ink3, halo: false });
    lab(c, k, 'шаги →', ax1 + 4, ay - 10, { px: 9.5, align: 'right', color: P.ink3, halo: false });
    // полоса моторов: исполненные действия по одному
    lab(c, k, 'моторы', ax0 - 6, my + 5, { px: 9.5, align: 'right', color: P.ink3, halo: false });
    for (let s = 1; s <= LEN; s++) { const on = s <= cs && cur > 0; rect(c, xs(s) - 4, my, 8, 10, 2, on ? (s <= G0 + D ? P.mot : (mode === 'rtc' ? P.spr : P.bad)) : P.surf, on ? null : P.line, 1); }
    // стык
    if (arrived) { line(c, [[xs(G0 + D), ys(AMP + 6)], [xs(G0 + D), ay]], P.ink3, 1.2, [3, 3]); lab(c, k, 'стык', xs(G0 + D), ys(AMP + 6) - 8, { px: 9.5, weight: 650, color: P.ink2, haloColor: P.surf }); }
    // пачка 1: 16 действий, исполненные закрашены
    for (let s = 1; s <= LEN; s++) { const on = s <= cs && cur > 0; circle(c, xs(s), ys(v1(s)), on ? 3.6 : 3.2, on ? P.mot : P.surf, P.mot, 1.6); }
    lab(c, k, 'пачка 1', xs(2.2), ys(v1(2)) - 12, { px: 9.5, weight: 650, color: P.mot, haloColor: P.surf });
    // пачка 2 после прихода
    if (arrived) {
      for (let s = G0 + 1; s <= G0 + LEN; s++) {
        const on = s <= cs;
        if (mode === 'rtc') {
          if (s <= G0 + D) { const x = xs(s), y = ys(v1(s)); c.beginPath(); c.rect(x - 5, y - 5, 10, 10); c.fillStyle = P.surf; c.fill(); HeroKit.hatch(c, x - 5, y - 5, x + 5, y + 5, P.ink3, 3, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.1; c.strokeRect(x - 5, y - 5, 10, 10); lock(c, x, y - 11, P.ink2); }
          else circle(c, xs(s), ys(v2r(s)), on ? 3.6 : 3.2, on ? P.spr : P.surf, P.spr, 1.6);
        } else circle(c, xs(s), ys(v2n(s)), on ? 3.6 : 3.2, on ? P.spr : P.surf, s <= G0 + D ? alpha(P.spr, 0.45) : P.spr, 1.6);
      }
      if (mode === 'rtc') { lab(c, k, narrow ? 'заморожены: копии' : 'заморожены: копии исполняемых', xs(G0 + 1.5), ay - 11, { px: 9.5, weight: 650, align: 'left', color: P.ink2, haloColor: P.surf }); lab(c, k, 'пачка 2: дорисована к пути', ax1, ys(v2r(19)) - 13, { px: 9.5, weight: 650, align: 'right', color: P.spr, haloColor: P.surf }); }
      else { lab(c, k, narrow ? 'опоздали' : 'эти действия опоздали', xs(G0 + 2.5), ys(v2n(G0 + 2)) - 12, { px: 9.5, weight: 650, color: P.ink3, haloColor: P.surf }); lab(c, k, 'пачка 2: другой объезд', ax1, ys(AMP) - 13, { px: 9.5, weight: 650, align: 'right', color: P.spr, haloColor: P.surf }); }
    }
    // исполненный путь
    if (cur > 0) {
      const pts = []; for (let s = 0; s <= cs; s++) pts.push([xs(s), ys(exec(s, mode))]);
      if (cs < LEN) { const f = cur - cs, a = exec(cs, mode), b = exec(cs + 1, mode); pts.push([xs(cs + f), ys(mode !== 'rtc' && cs === G0 + D ? a : a + (b - a) * f)]); }
      const jump = mode !== 'rtc' && cs >= G0 + D + 1;
      line(c, pts.slice(0, Math.min(pts.length, G0 + D + 1)), P.ink, 2.8);
      if (pts.length > G0 + D + 1) { line(c, pts.slice(G0 + D), jump ? P.bad : P.ink, 2.8); if (jump) HeroKit.cross(c, xs(G0 + D + 0.5), (ys(v1(G0 + D)) + ys(v2n(G0 + D + 1))) / 2, 5, P.bad, 2.2); }
      const q = pts[pts.length - 1]; circle(c, q[0], q[1], 7, P.surf, P.ink, 2.2); circle(c, q[0] + 2.5, q[1] - 2, 1.3, P.mot, null); circle(c, q[0] + 2.5, q[1] + 2, 1.3, P.mot, null);
      if (cs >= 1 && cs <= LEN && !fin) arrow(c, xs(cs), ys(exec(cs, mode)) + 10, xs(cs), my - 3, alpha(P.ink2, 0.7), 1.4, 6);
      lab(c, k, 'Ада', q[0] - 11, q[1], { px: 9.5, weight: 650, align: 'right', color: P.ink, haloColor: P.surf });
    }
    // строка состояния
    const st = fin ? (mode === 'rtc' ? (narrow ? 'стык без скачка: пачка 2 продолжает путь' : 'стык без скачка: пачка 2 продолжает исполняемую линию') : (narrow ? 'скачок на стыке: пачка 2 выбрала другой объезд' : 'скачок на стыке: пачка 2 построена заново и выбрала другой объезд'))
      : cur <= 0 ? 'пачка 1 готова, действия пойдут на моторы по одному' : gen ? 'робот продолжает пачку 1, пока сеть считает пачку 2' : arrived ? 'с шага 9 исполняется пачка 2' : 'действия пачки 1 уходят на моторы по одному';
    lab(c, k, st, ox + pw / 2, oy + 318, { px: narrow ? 9.5 : 10.5, weight: 650, color: fin ? (mode === 'rtc' ? P.good : P.bad) : P.ink2, halo: false });
  }
  function drawRtc(cols) {
    return (c, k, t, P, A) => {
      const u = ((t % TT) + TT) % TT, pw = 360, ph = 340;
      ['rtc', 'naive'].forEach((m, i) => { const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph; if (i % cols) A.line(c, [[ox, oy + 24], [ox, oy + ph - 16]], P.grid, 1); panel(c, k, u, P, A, ox, oy, pw, m, cols === 1); });
    };
  }
  if (typeof Anim !== 'undefined') Anim.add('rtc', { W: 720, H: 340, start: 0.3, narrowAt: 600, draw: drawRtc(2), narrow: { W: 360, H: 680, draw: drawRtc(1) } });
  function init() {
    if (!$('#rtcLegend')) return;
    legend('#rtcLegend', [['пачка 1: исполнено / впереди', 'var(--e2e)', 'dot'], ['исполненный путь', 'var(--ink)'], ['сеть строит пачку 2', 'var(--hybrid)', 'band'], ['замороженные действия пачки 2', 'var(--ink-3)', 'hatch'], ['новые действия пачки 2', 'var(--hybrid)', 'dot'], ['скачок на стыке', 'var(--critical)']]);
  }
  return { init, S, LEN, G0, D, TT, v1, v2r, v2n, exec };
})();

/* ===================== 6. Положение или скорость (lessons/l15/engine.js) =====================
   Одна и та же пачка исполняется двумя регуляторами: позиционным (оранжевая Ада) и скоростным (синяя).
   Десять пар прогонов с одними и теми же сдвигами при исполнении для любых настроек задержки и шума. */
const Pv = (() => {
  const N = 10, SEED0 = 1, PVE = typeof L15 !== 'undefined' ? L15 : null;
  const st = { delay: 3, noise: 1, res: null, play: null, log: [] };
  let ctl = null;
  const pack = (s) => ({ touches: s.touches, k: s.kMean, end: s.endMean, max: s.maxMax, maxMean: s.maxMean });
  function calc(delay, noise) { const r = PVE.pvBatch(N, SEED0, { delay, noise }); return { r, out: { delay, noise, n: N, pos: pack(r.pos), vel: pack(r.vel), velWorse: r.velWorse } }; }
  function run() {
    const { r, out } = calc(st.delay, st.noise);
    st.log.push(out);
    return new Promise((resolve) => { st.res = r; st.play = playback(2600, () => { st.play = null; try { draw(); } finally { resolve(out); } }); draw(); });
  }
  /** Активная пачка прогона после tN шагов: исполненные точки закрашены, впереди — контуром, пропущенные из-за задержки — серые. */
  function chunkDots(c, P, q, tN, color) {
    let ch = null; for (const h of q.chunks) { if (h.from <= tN - 1 || (tN === 0 && h.from === 0)) ch = h; else break; }
    if (!ch) return;
    ch.p.forEach((pt, j) => {
      const step = ch.t0 + j, skipped = step < ch.from, done = step < tN;
      c.beginPath(); c.arc(pt.x, pt.y, skipped ? 2.2 : done ? 3.4 : 2.8, 0, 7);
      if (skipped) { c.fillStyle = P.ink3; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1; }
      else if (done) { c.fillStyle = color; c.fill(); }
      else { c.lineWidth = 1.3; c.strokeStyle = color; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1; }
    });
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#pvCv'), E.W, E.H), P = KD.pal(), VC = P.classic;
    KD.house(c, k, P);
    KD.kettle(c, k, P, E.KETTLE, { label: true });
    const u = st.play ? st.play.u() : 1;
    let tN = 0;
    if (st.res) {
      const pairs = st.res.pairs, q0 = pairs[0], n = q0.pos.pts.length - 1; tN = Math.min(n, Math.round(u * n));
      c.setLineDash([3, 5]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; KD.pathPts(c, q0.pos.intend); c.setLineDash([]);
      c.lineJoin = 'round'; c.lineCap = 'round';
      for (const [mode, color, dash] of [['vel', VC, [6, 5]], ['pos', P.dif, []]]) {
        if (!st.play) {
          c.strokeStyle = color; c.setLineDash(dash); c.lineWidth = 1.3; c.globalAlpha = 0.35;
          for (let i = 1; i < pairs.length; i++) KD.pathPts(c, pairs[i][mode].pts, pairs[i][mode].hit ? pairs[i][mode].hit.t + 1 : null);
          c.setLineDash([]); c.globalAlpha = 1;
          for (let i = 1; i < pairs.length; i++) if (pairs[i][mode].hit) HeroKit.cross(c, pairs[i][mode].hit.x, pairs[i][mode].hit.y, 4, P.bad, 1.8);
        }
        const q = q0[mode], stop = q.hit ? Math.min(tN, q.hit.t + 1) : tN;
        c.strokeStyle = color; c.lineWidth = 3; c.setLineDash(dash); KD.pathPts(c, q.pts, stop); c.setLineDash([]);
        chunkDots(c, P, q, stop, color);
        const a = q.pts[stop], b = q.pts[Math.max(0, stop - 1)];
        KD.ada(c, a.x, a.y, KD.heading(b.x, b.y, a.x, a.y), color);
        if (q.hit && tN >= q.hit.t + 1) HeroKit.cross(c, q.hit.x, q.hit.y - E.RA - 8, 6, P.bad, 2.6);
      }
    } else {
      KD.ada(c, E.START.x + 10, E.START.y, -Math.PI / 2, P.dif, 0.95);
      KD.ada(c, E.START.x - 10, E.START.y, -Math.PI / 2, VC, 0.95);
    }
    const txt = `${st.play ? `прогон 1 · шаг ${tN}` : st.res ? `${N} прогонов` : 'до запуска'} · задержка ${nWord(st.delay, 'шаг', 'шага', 'шагов')} · шум ${fmt1(st.noise)} см`;
    HeroKit.label(c, k, txt, 10, E.H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    drawStats();
  }
  function drawStats() {
    const box = $('#pvStats'), last = st.res && !st.play ? st.log[st.log.length - 1] : null;
    const sig = [last ? st.log.length : 0, st.delay, st.noise].join('|');
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = '';
    const card = (name, col, sub, v) => box.append(h('div', { class: 'st', style: `--c:${col}` }, h('b', null, name), h('span', null, sub), h('div', { class: 'v' }, v)));
    const sub = `задержка ${nWord(st.delay, 'шаг', 'шага', 'шагов')} · шум ${fmt1(st.noise)} см`;
    const v = (s) => (s ? `отклонение от пачки: у чайника ${fmt1(s.k)} см, в конце пути ${fmt1(s.end)} см (в среднем) · самое большое ${fmt1(s.max)} см · касаний ${s.touches} из ${N}` : '—');
    card('Пачка как положения', 'var(--pol-dif)', sub, last ? v(last.pos) : '—');
    card('Та же пачка как скорости', 'var(--classic)', sub, last ? v(last.vel) : '—');
  }
  function syncCtl() {
    const d = $('#pvDelay'), nz = $('#pvNoise');
    st.delay = +d.value; d.nextElementSibling.textContent = nWord(st.delay, 'шаг', 'шага', 'шагов');
    st.noise = +nz.value; nz.nextElementSibling.textContent = `${fmt1(st.noise)} см`;
    draw(); if (ctl) ctl.update();
  }
  function setCtl(o) {
    if (o.delay != null) $('#pvDelay').value = o.delay;
    if (o.noise != null) $('#pvNoise').value = o.noise;
    if (o.clear) st.res = null;
    syncCtl();
  }
  const api = {
    reset() { st.log = []; st.res = null; setCtl({ delay: 3, noise: 1 }); },
    run, setCtl, calc,
    state: () => ({ delay: st.delay, noise: st.noise, log: st.log.slice() }),
  };
  const ratio = (r) => (r.pos.end > 0 ? r.vel.end / r.pos.end : 99);
  const missions = [
    { short: 'Задержка 3 шага', title: 'Одна пачка, два регулятора', text: 'Пачка приходит с задержкой 3 шага управления, на каждом шаге исполнение промахивается в среднем на 1 см. Оранжевая Ада исполняет пачку как положения, синяя — ту же пачку как скорости. Десять прогонов с одними и теми же промахами.',
      onEnter: (X) => X.setCtl({ delay: 3, noise: 1, clear: true }),
      bet: { q: 'какой регулятор уедет от задуманного пути?', options: ['Оба одинаково: пачка одна и та же', 'Скоростной', 'Позиционный'], answer: (r) => (ratio(r) > 2 ? 1 : ratio(r) < 0.5 ? 2 : 0) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Скорости отклонились от пачки сильнее положений во всех 10 прогонах', test: (r) => r.velWorse === N }, { label: 'К концу пути ошибка скоростей хотя бы вдвое больше, чем у положений', test: (r) => ratio(r) >= 2 }],
      summary: (r) => `задержка ${r.delay}, шум ${fmt1(r.noise)} см: в конце пути положения ${fmt1(r.pos.end)} см, скорости ${fmt1(r.vel.end)} см`,
      fail: (r) => `Скорости отклонились сильнее в ${r.velWorse} прогонах из 10; в конце пути ${fmt1(r.vel.end)} см против ${fmt1(r.pos.end)} см. Нажми ещё раз.`,
      explain: (r) => `Положения: у чайника ${fmt1(r.pos.k)} см, в конце пути ${fmt1(r.pos.end)} см — ошибка одного шага, она не растёт: каждый шаг регулятор тянет Аду к точке пачки, и прошлый промах стирается. Скорости: у чайника ${fmt1(r.vel.k)} см, в конце ${fmt1(r.vel.end)} см — промахи складываются, потому что каждая команда сдвигает Аду от того места, где она оказалась на самом деле. Поправка к маршруту сидит в первых командах новой пачки, а они из-за задержки приходят, когда их время уже прошло: серые точки на сцене — пропущенные команды. Авторы Diffusion Policy выдают именно положения: у них позиционное управление стабильно лучше скоростного, хотя у прежних методов было наоборот.` },
    { short: 'Без задержки', title: 'Убери задержку', text: 'Поставь задержку 0: пачка приходит сразу, и скоростной регулятор получает её первую команду с поправкой к маршруту.', controls: ['delay'],
      onEnter: (X) => X.setCtl({ delay: 0, noise: 1, clear: true }),
      bet: { q: 'без задержки скорости перестанут уезжать от пачки?', options: ['Да: без задержки оба регулятора исполняют пачку одинаково', 'Нет: между пачками промахи всё равно складываются, поправка приходит только с новой пачкой', 'Нет: без задержки скорости отклонятся ещё сильнее'], answer: (r) => { const d3 = st.log.find((q) => q.delay === 3 && q.noise === r.noise); return ratio(r) < 1.3 ? 0 : d3 && r.vel.end > d3.vel.end ? 2 : 1; } },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Задержка 0 шагов', test: (r) => r.delay === 0 }, { label: 'Скорости всё ещё отклоняются сильнее положений', test: (r) => r.velWorse >= 7 && r.vel.end > r.pos.end }, { label: 'Но меньше, чем при задержке 3 шага', test: (r, s) => s.log.some((q) => q.delay === 3 && q.noise === r.noise && q.vel.end > r.vel.end) }],
      summary: (r) => `задержка ${r.delay}, шум ${fmt1(r.noise)} см: в конце пути положения ${fmt1(r.pos.end)} см, скорости ${fmt1(r.vel.end)} см`,
      hint: 'Ползунок задержки появился под сценой. Поставь 0 и запусти прогоны.',
      fail: (r) => (r.delay !== 0 ? 'Поставь задержку 0.' : !st.log.some((q) => q.delay === 3 && q.noise === r.noise) ? 'Сначала нужен прогон с задержкой 3 (миссия 1).' : `При задержке 0 скорости в конце пути: ${fmt1(r.vel.end)} см, положения: ${fmt1(r.pos.end)} см. Нажми ещё раз.`),
      explain: (r) => { const d3 = st.log.find((q) => q.delay === 3 && q.noise === r.noise), sweep = [0, 1, 2, 3].map((d) => `${d} — ${fmt1(api.calc(d, r.noise).out.vel.end)} см`).join(', '); return `Без задержки скорости в конце пути отклоняются на ${fmt1(r.vel.end)} см${d3 ? ` вместо ${fmt1(d3.vel.end)} см при задержке 3` : ''}, но всё ещё больше ${fmt1(r.pos.end)} см у положений: между пачками 8 шагов управления, и промахи на них никто не исправляет до следующей пачки. Ошибка скоростей в конце пути по задержкам: ${sweep}. Поправка сидит в первой команде пачки: задержка в один шаг теряет большую её часть, в два-три — почти всю, дальше расти почти нечему. У положений задержка ничего не меняет: цель абсолютная, регулятор доводит до неё в любом случае.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Доступны задержка и шум. Проверь, как ошибка скоростей растёт с шумом и где перестаёт расти с задержкой. Касания появляются только при большом шуме: в этой модели пачка проходит мимо чайника с запасом в 22 см.', final: true, controls: ['delay', 'noise'],
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() }, summary: (r) => `задержка ${r.delay}, шум ${fmt1(r.noise)} см → в конце пути положения ${fmt1(r.pos.end)} см, скорости ${fmt1(r.vel.end)} см` },
  ];
  function init() {
    if (!PVE || !$('#pvCv')) return null;
    legend('#pvLegend', [['пачка как положения', 'var(--pol-dif)'], ['та же пачка как скорости', 'var(--classic)', 'dash'], ['задуманный путь: точки пачек', 'var(--ink-2)', 'dotted'], ['пачка: исполнено / впереди / пропущено', 'var(--pol-dif)', 'dot'], ['касание', 'var(--critical)']]);
    for (const id of ['#pvDelay', '#pvNoise']) $(id).addEventListener('input', syncCtl);
    HeroKit.loop($('#pvCv'), () => { if (st.play) draw(); });
    ctl = mountMissions('#pvMis', missions, api, { controls: { delay: '#wrapPvDelay', noise: '#wrapPvNoise' }, scene: '#pvCv' });
    syncCtl(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, N, SEED0 };
})();

/* ===================== Квиз ===================== */
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
    { q: 'Diffusion Policy выдаёт одно действие за инференс?', o: ['Да, как обычная политика', 'Нет: пачку из 16 действий, из которых исполняет 8', 'Нет: всю траекторию до цели'], a: 1, e: 'Пачка из 16 действий держит выбранную стратегию, а исполнение половины пачки оставляет возможность реагировать на сцену. В лаборатории так Ада объезжала чайник 10 раз из 10.' },
    { q: 'Шум добавляют и к кадрам с камер?', o: ['Да, вместе с действиями', 'Нет: наблюдения — только условие, шумится пачка действий', 'Только к первому кадру'], a: 1, e: 'Кадры сеть получает на каждом шаге денойзинга как условие. Энкодер считает их признаки один раз на всю пачку.' },
    { q: 'При инференсе нужно столько же шагов денойзинга, сколько уровней шума было при обучении?', o: ['Да: сеть училась на 100 уровнях шума, их все и надо пройти', 'Нет: обучение учит убирать шум на любом уровне, а расписание инференса — отдельный выбор, и крупных шагов хватает нескольких', 'Нет: достаточно одного шага, дистилляция не нужна'], a: 1, e: 'Сеть на каждом шаге денойзинга оценивает чистую пачку, а DDIM шагает без свежего шума, поэтому крупные шаги не ломают форму. В лаборатории хватало трёх-четырёх шагов денойзинга; один шаг без дистилляции давал оценку, близкую к среднему демонстраций, и Ада задевала чайник.' },
    { q: 'Пачку лучше исполнять целиком или по одному действию?', o: ['Целиком: так движение плавнее', 'Ни то ни другое: лучший результат посередине, у авторов — 8 из 16', 'По одному: так быстрее реакция'], a: 1, e: 'При исполнении по одному действию план меняет сторону, а при исполнении целиком робот поздно замечает изменения сцены. В лаборатории лучший результат был в середине кривой.' },
    { q: 'Стыки пачек можно сгладить, усреднив старую и новую пачку?', o: ['Да, это безопасно', 'Нет: среднее двух стратегий бывает недопустимым действием', 'Да, если пачки длинные'], a: 1, e: 'Если старая пачка объезжает чайник слева, а новая справа, их среднее ведёт в чайник. Поэтому в Real-Time Chunking новую пачку достраивают к уже исполняемой, а не усредняют с ней.' },
    { q: 'Пачку действий лучше выдавать как скорости, а не как положения?', o: ['Да: скорости не зависят от того, где робот сейчас', 'Нет: при скоростях промахи исполнения складываются, а запоздавшая команда исполняется не там, где её посчитали; положение — цель, к которой регулятор доводит сам', 'Разницы нет: это одна и та же пачка в другой записи'], a: 1, e: 'Пачка одна, но исполняется по-разному. В интерактиве при задержке 3 шага управления и шуме 1 см позиционный регулятор держал ошибку на уровне одного промаха, а скоростной уезжал от пачки в разы сильнее. Авторы Diffusion Policy выдают положения.' },
    { q: 'Почему регрессия с пачками проигрывает диффузии, когда операторы объезжают чайник с разных сторон?', o: ['У регрессии меньше параметров, и ей не хватает выразительности', 'Регрессия со средним квадратом ошибки выдаёт среднее демонстраций — путь между объездами, а диффузия берёт сэмпл из одного из них', 'Регрессия не умеет выдавать пачки, только одно действие'], a: 1, e: 'В лаборатории при 50 на 50 регрессия задевала чайник, а при сильном перекосе проезжала: среднее уходит от чайника, только когда почти все объезды с одной стороны. Диффузии распределение любой формы не мешает, и когда стратегия в данных одна, регрессия с пачками не хуже и дешевле.' },
    { q: 'Доказано, что метод выигрывает из-за мультимодальности данных?', o: ['Да, это показано на всех бенчмарках', 'Нет: это объяснение авторов, и у него есть контраргументы', 'Нет, мультимодальность здесь ни при чём'], a: 1, e: 'На стандартных бенчмарках условных мод почти нет (урок 1.3), а работа 2025 года связывает выигрыш генеративных политик с шумом при обучении и итеративными шагами генерации. Когда демонстрации разных операторов действительно расходятся, генеративная голова нужна.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('pusht', () => { mis.pusht = PushT.init(); }); safe('scrub', () => { mis.scrub = Scrub.init(); }); safe('pipe', () => { mis.pipe = Pipe.init(); });
    safe('lab', () => { mis.lab = Lab.init(); });
    safe('rtc', Rtc.init); safe('posvel', () => { mis.pv = Pv.init(); });
    safe('quiz', initQuiz);
    window.__l15 = { mis, SPEED, PushT, Scrub, Pipe, Lab, Pv, Rtc }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
