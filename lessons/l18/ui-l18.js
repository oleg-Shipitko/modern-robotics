/* =====================================================================
   ui-l18.js — урок 1.8 «Flow matching». Интерактивы — миссии на живой
   сцене (shared/missions.js):
   1) два пятна и точное поле: путь зонда, один шаг, лупа над прямыми;
   2) живое обучение поля скоростей: стрелки, кривая ошибки, момент разворота;
   3) диффузия и flow рядом: ползунок шагов и кривая качества;
   4) reflow: пересечения пар, выпрямление до одного шага, цена;
   5) пачка из 50 действий в стиле π0: шаги Эйлера, задержка и бюджет.
   Ниже — три анимированные схемы раздела 1, задача на сортировку
   (shared/cards.js) и квиз. Движок — l18/engine.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), hy: HeroKit.css('--hybrid'), bad: HeroKit.css('--critical'), good: HeroKit.css('--good'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pc = (v, d) => fmt(v * 100, d == null ? 1 : d) + '%';
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
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
function arrow(c, x0, y0, x1, y1, col, lw, head) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 0.5) return;
  const hl = Math.min(head || 6, L * 0.45), ux = dx / L, uy = dy / L;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw || 1.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - ux * hl * 0.6, y1 - uy * hl * 0.6); c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - ux * hl - uy * hl * 0.55, y1 - uy * hl + ux * hl * 0.55); c.lineTo(x1 - ux * hl + uy * hl * 0.55, y1 - uy * hl - ux * hl * 0.55); c.closePath(); c.fill();
}
function dots(c, pts, map, col, r, alpha) {
  c.fillStyle = col; c.globalAlpha = alpha == null ? 1 : alpha;
  for (let i = 0; i < pts.length; i += 2) { const p = map(pts[i], pts[i + 1]); c.fillRect(p.x - r, p.y - r, 2 * r, 2 * r); }
  c.globalAlpha = 1;
}
/** Мелкие подписи осей на канвасе графика; названия осей — в HTML под ним. */
function axes(c, k, P, box, xt, yt, x, y) {
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const [v, t] of yt) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, t, box.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
  for (const [v, t, al] of xt) HeroKit.label(c, k, t, x(v), box.b + 13, { align: al || 'center', px: 10.5, mono: true, color: P.ink3, halo: false });
}
function tween(ms, frame) {
  return new Promise((res) => {
    const t0 = performance.now(), dur = ms / SPEED.k;
    const tick = (now) => { const u = Math.min(1, (now - t0) / dur); frame(u); if (u < 1) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
    setTimeout(() => { frame(1); res(); }, dur + 200); // если вкладка в фоне
  });
}
/** Сцена на кольце: квадрат с началом в центре. */
function ringMap(W, L) { const S = W / (2 * L); return { S, map: (x, y) => ({ x: W / 2 + x * S, y: W / 2 - y * S }) }; }
function ringBase(cv, W, L, P) {
  const { c, k } = HeroKit.fit(cv, W, W), { map, S } = ringMap(W, L);
  c.fillStyle = P.bg; c.fillRect(0, 0, W, W); HeroKit.grid(c, W, W, Math.round(S / 2), P.grid);
  return { c, k, map, S };
}
function ringZones(c, map, S, P) {
  c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1;
  for (const comp of FM.ringComps()) { const p = map(comp.m[0], comp.m[1]); c.beginPath(); c.arc(p.x, p.y, 2.5 * FM.RING.s * S, 0, 7); c.stroke(); }
  c.setLineDash([]);
}

/* =====================================================================
   Общие модели кольца: обучаются один раз, ими пользуются лаборатории 2–4
   ===================================================================== */
const Store = (() => {
  const data = FM.ring(4000, 1), st = { fm: null, dd: null, loss: { fm: [], dd: [] }, prog: { fm: 0, dd: 0 }, jobs: {} }, subs = [];
  const emit = (kind) => subs.forEach((f) => f(kind));
  const OPT = { iters: 1500, bs: 128, lr: 0.005, seed: 7 };
  function job(kind) {
    if (st[kind]) return Promise.resolve(st[kind]);
    if (st.jobs[kind]) return st.jobs[kind];
    const m = FM.net2(5), gen = kind === 'fm' ? FM.trainFM(m, data, OPT) : FM.trainDDPM(m, data, OPT);
    st.loss[kind] = []; st.prog[kind] = 0; st.live = st.live || {}; st.live[kind] = m;
    st.jobs[kind] = runChunked(gen, (e) => { st.loss[kind].push([e.it, e.loss]); st.prog[kind] = (e.it + 1) / e.iters; emit(kind); }, 14)
      .then(() => { st[kind] = m; delete st.jobs[kind]; emit(kind); return m; });
    emit(kind);
    return st.jobs[kind];
  }
  /** Сэмплы модели за N шагов из общего шума (600 точек), с кэшем. */
  const Z = FM.noise(600, 42), cache = { fm: new Map(), dd: new Map() };
  function sample(kind, N) {
    const m = st[kind]; if (!m) return null;
    if (!cache[kind].has(N)) { const pts = kind === 'fm' ? FM.sampleFM(m, Z, N) : FM.sampleDDIM(m, Z, N); cache[kind].set(N, { pts, q: FM.ringQuality(pts) }); }
    return cache[kind].get(N);
  }
  /** То же порциями, по шагу генерации: для фонового досчёта. */
  function* sampleGen(kind, N) {
    const m = st[kind]; if (!m || cache[kind].has(N)) return;
    const pts = yield* (kind === 'fm' ? FM.eulerGen(m, Z, N) : FM.ddimGen(m, Z, N));
    if (!cache[kind].has(N)) cache[kind].set(N, { pts, q: FM.ringQuality(pts) });
  }
  return { data, st, Z, OPT, on: (f) => subs.push(f), fm: () => job('fm'), dd: () => job('dd'), busy: (kind) => !!st.jobs[kind], sample, sampleGen };
})();
const NS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50, 100];
const okShape = (q) => q && q.on >= 0.72 && q.modes === 8;

/* =====================================================================
   1. Два пятна: прямые пары и кривые пути (точное поле)
   ===================================================================== */
const LabA = (() => {
  const C = [{ m: [-1.2, 1.0], s: 0.22, w: 1 }, { m: [1.2, 1.0], s: 0.22, w: 1 }], W = 520, H = 400, S = 100, OX = 260, OY = 250, R2 = 2.5 * 0.22, LENS = 0.3, TL = 0.5;
  const map = (x, y) => ({ x: OX + x * S, y: OY - y * S }), inv = (px, py) => ({ x: (px - OX) / S, y: (OY - py) / S });
  const NZ = FM.noise(60, 3), DATA = FM.gmmSample(C, 240, 5);
  const PAIRS = (() => { const r = FM.rng(17), P = []; for (let i = 0; i < 300; i++) { const c = C[i % 2].m; P.push([FM.randn(r), FM.randn(r), c[0] + FM.randn(r) * 0.22, c[1] + FM.randn(r) * 0.22]); } return P; })();
  const P0 = { x: 0.9, y: -0.6 }, L0 = { x: -1.3, y: -0.4 };
  const st = { probe: Object.assign({}, P0), lens: Object.assign({}, L0), path: null, lensOn: false, probeOn: true, pairs: false, jump: 0, land: null };
  let ctl = null;
  const blobOf = (p) => (Math.hypot(p[0] - C[0].m[0], p[1] - C[0].m[1]) < R2 ? 'left' : Math.hypot(p[0] - C[1].m[0], p[1] - C[1].m[1]) < R2 ? 'right' : null);
  function bend(path) {
    const a = path[0], b = path[path.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9; let mx = 0;
    for (const q of path) mx = Math.max(mx, Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / L);
    return mx;
  }
  function recompute() { st.path = FM.gmmPath(C, st.probe.x, st.probe.y, 200); }
  function lensStats() {
    let n = 0, mx = 0, my = 0, ml = 0, L = 0, R = 0; const dirs = [];
    for (const [x0, y0, x1, y1] of PAIRS) {
      const xt = (1 - TL) * x0 + TL * x1, yt = (1 - TL) * y0 + TL * y1;
      if (Math.hypot(xt - st.lens.x, yt - st.lens.y) < LENS) { n++; const dx = x1 - x0, dy = y1 - y0; mx += dx; my += dy; ml += Math.hypot(dx, dy); if (x1 < 0) L++; else R++; dirs.push([dx, dy, x1 < 0]); }
    }
    return { n, L, R, dirs, mean: n ? [mx / n, my / n] : [0, 0], agree: n ? Math.hypot(mx, my) / ml : 1 };
  }
  function state() {
    const end = st.path[st.path.length - 1], ls = lensStats();
    return { end: blobOf(end), endPt: end, bend: bend(st.path), lens: ls, n: ls.n, agree: ls.agree, land: st.land };
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#aCv'), W, H), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 25, P.grid);
    // пятна данных
    dots(c, DATA, map, P.ink3, 1.4, 0.55);
    C.forEach((comp, i) => { const p = map(comp.m[0], comp.m[1]); c.setLineDash([4, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, R2 * S, 0, 7); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, i ? 'правое пятно' : 'левое пятно', p.x, p.y - R2 * S - 12, { color: P.ink2, px: 12, haloColor: P.bg }); });
    // обучающие пары
    if (st.pairs) { c.strokeStyle = P.ink3; c.globalAlpha = 0.28; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 120; i++) { const [x0, y0, x1, y1] = PAIRS[i], a = map(x0, y0), b = map(x1, y1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); } c.stroke(); c.globalAlpha = 1; }
    // облако шума и прыжок за один шаг
    const u = st.jump, mean = [0, 1.0];
    for (let i = 0; i < NZ.length; i += 2) {
      const x0 = NZ[i], y0 = NZ[i + 1], p = map(x0 + (mean[0] - x0) * u, y0 + (mean[1] - y0) * u);
      if (u > 0) { const a = map(x0, y0); c.strokeStyle = P.e2e; c.globalAlpha = 0.25; c.lineWidth = 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(p.x, p.y); c.stroke(); c.globalAlpha = 1; }
      c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); if (u > 0) { c.fillStyle = P.e2e; c.globalAlpha = 0.75; c.fill(); } else { c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.globalAlpha = 0.8; c.stroke(); } c.globalAlpha = 1;
    }
    if (u >= 1) { const m = map(mean[0], mean[1]); c.beginPath(); c.arc(m.x, m.y, 9, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 2.5; c.stroke(); HeroKit.label(c, k, 'сюда пришли все 60 точек', m.x, m.y + 22, { color: P.e2e, px: 12, weight: 700, haloColor: P.bg }); }
    // путь зонда
    if (st.probeOn) {
      const pth = st.path, s0 = map(pth[0][0], pth[0][1]), e = map(pth[pth.length - 1][0], pth[pth.length - 1][1]);
      c.setLineDash([5, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(e.x, e.y); c.stroke(); c.setLineDash([]);
      c.strokeStyle = P.e2e; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); pth.forEach((q, i) => { const p = map(q[0], q[1]); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke();
      c.beginPath(); c.arc(e.x, e.y, 5, 0, 7); c.fillStyle = P.e2e; c.fill();
      c.beginPath(); c.arc(s0.x, s0.y, 9, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 3; c.strokeStyle = P.e2e; c.stroke();
      HeroKit.label(c, k, 'шум', s0.x, s0.y + 20, { color: P.e2e, px: 12, weight: 700, haloColor: P.bg });
    }
    // лупа над прямыми в момент t = 0,5
    if (st.lensOn) {
      c.fillStyle = P.ink2; c.globalAlpha = 0.45;
      for (const [x0, y0, x1, y1] of PAIRS) { const p = map((1 - TL) * x0 + TL * x1, (1 - TL) * y0 + TL * y1); c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); }
      c.globalAlpha = 1;
      const ls = lensStats(), ctr = map(st.lens.x, st.lens.y);
      c.beginPath(); c.arc(ctr.x, ctr.y, LENS * S, 0, 7); c.fillStyle = P.surf; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1; c.lineWidth = 2.5; c.strokeStyle = P.ink; c.stroke();
      for (const [dx, dy, left] of ls.dirs) { const L = Math.hypot(dx, dy); arrow(c, ctr.x, ctr.y, ctr.x + dx / L * 52, ctr.y - dy / L * 52, left ? P.ink2 : P.ink3, 1.3, 5); }
      if (ls.n) { const [mx, my] = ls.mean, ML = Math.hypot(mx, my), avg = ls.dirs.reduce((a, d) => a + Math.hypot(d[0], d[1]), 0) / ls.n, len = 52 * ML / avg; arrow(c, ctr.x, ctr.y, ctr.x + mx / ML * len, ctr.y - my / ML * len, P.e2e, 4, 11); }
      HeroKit.label(c, k, 'лупа, t = 0,5', ctr.x, ctr.y + LENS * S + 14, { color: P.ink, px: 12, weight: 700, haloColor: P.bg });
    }
    out();
  }
  function out() {
    const s = state(), el = $('#aOut'), pt = (q) => `(${fmt(q[0], 2)}; ${fmt(q[1], 2)})`;
    const parts = [];
    if (st.probeOn) parts.push(`Путь точки шума: ${pt(st.path[0])} → ${pt(s.endPt)}, <b>${s.end === 'left' ? 'левое пятно' : s.end === 'right' ? 'правое пятно' : 'мимо пятен'}</b> · отклонение от прямой ${fmt(s.bend, 2)}`);
    if (st.lensOn) parts.push(`В лупе <b>${nWord(s.n, 'прямая', 'прямые', 'прямых')}</b>: ${s.lens.L} к левому пятну, ${s.lens.R} к правому · согласие направлений <b>${pc(s.agree, 0)}</b>`);
    setOut(el, parts.join('<br>'));
  }
  function update() { draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { Object.assign(st, { probe: Object.assign({}, P0), lens: Object.assign({}, L0), lensOn: false, probeOn: true, jump: 0, land: null }); recompute(); draw(); },
    state,
    setProbe(x, y) { st.probe = { x, y }; recompute(); update(); },
    setLens(x, y) { st.lens = { x, y }; update(); },
    async jump() {
      st.jump = 0; const v = FM.gmmField(C, st.probe.x, st.probe.y, 0), land = [st.probe.x + v[0], st.probe.y + v[1]];
      let sp = 0; for (let i = 0; i < NZ.length; i += 2) { const q = FM.gmmField(C, NZ[i], NZ[i + 1], 0); sp = Math.max(sp, Math.hypot(NZ[i] + q[0], NZ[i + 1] + q[1] - 1)); }
      await tween(900, (u) => { st.jump = u; draw(); });
      st.land = land; return { land, spread: sp };
    },
  };
  const missions = [
    { short: 'Левое пятно', title: 'Проведи шум в левое пятно', text: 'Оранжевая линия — путь точки шума по полю скоростей от t = 0 до t = 1, пунктир — прямая от старта к концу. Перетащи точку шума так, чтобы путь закончился в левом пятне.',
      onEnter: () => { st.lensOn = false; st.probeOn = true; st.jump = 0; draw(); },
      criteria: [{ label: 'Путь заканчивается в левом пятне', test: (r, s) => s.end === 'left' }],
      hint: 'Пятно, в которое придёт точка, зависит от того, с какой стороны от середины она стартует.',
      explain: (s) => `Поле скоростей одно на всех, поэтому каждой точке шума соответствует один путь и одно пятно: всё, что стартует левее середины, уходит влево. Теперь посмотри на форму пути. Каждая обучающая пара — прямая, а путь изогнут: он отходит от пунктирной прямой на ${fmt(s.bend, 2)}. Сначала он тянется к середине между пятнами и только потом сворачивает.` },
    { short: 'Один шаг', title: 'Один шаг вместо двухсот', text: 'Путь точки шума собран из 200 маленьких шагов Эйлера. Будь он прямым, один шаг привёл бы туда же. Но путь изогнут. Сделаем один шаг длиной во всё время, от t = 0 до t = 1, сразу для всех 60 точек шума.',
      onEnter: () => { st.lensOn = false; st.probeOn = true; draw(); },
      bet: { q: 'где окажутся точки после одного шага?', options: ['Каждая в своём пятне', 'Все в одной точке между пятнами', 'Останутся на месте'], answer: () => 1 },
      action: { label: 'Сделать один шаг', run: (X) => X.jump() },
      explain: (r) => `Все 60 точек пришли в одну точку (${fmt(r.land[0], 2)}; ${fmt(r.land[1], 2)}) — в среднее данных, ровно между пятнами. В момент t = 0 шум ещё ничего не говорит о том, к какому пятну идти, и лучшая оценка скорости ведёт к среднему: v(x, 0) = E[x₁] − x. Один шаг длиной во всё время превращает любой шум в среднее. Так же ошибалась регрессия в уроке 1.3: среднее объездов слева и справа вело Аду прямо в чайник.` },
    { short: 'Лупа', title: 'Найди, где обучающие прямые спорят', text: 'Откуда берётся среднее, видно по самим обучающим парам — мы их включили. Серые точки — где каждая пара находится в середине пути, при t = 0,5. Перетащи лупу туда, где прямые идут в разные стороны: стрелки в лупе — их направления, оранжевая — среднее, которое выучит сеть.',
      controls: ['pairs'], onEnter: () => { st.lensOn = true; st.probeOn = false; st.pairs = true; $('#aPairs').checked = true; st.jump = 0; draw(); },
      criteria: [{ label: 'В лупе не меньше 8 прямых', test: (r, s) => s.n >= 8 }, { label: 'Их направления согласованы меньше чем на 50%', test: (r, s) => s.n >= 8 && s.agree < 0.5 }],
      hint: 'Прямые к левому и правому пятну встречаются посередине, между двумя облаками серых точек.',
      explain: (s) => `В лупе ${nWord(s.n, 'прямая', 'прямые', 'прямых')}: ${s.lens.L} к левому пятну и ${s.lens.R} к правому. Их среднее смотрит почти вертикально вверх, в пустоту между пятнами, и оно заметно короче отдельных прямых: согласие ${pc(s.agree, 0)}. Именно это среднее выучит сеть. Поэтому путь из такой точки идёт посередине и сворачивает поздно, а крупные шаги срезают поворот.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Перетаскивай точку шума и лупу, включай и выключай обучающие пары. Найди точку, путь которой изгибается сильнее всего, и сравни, что в этом месте показывает лупа.', final: true,
      onEnter: () => { st.lensOn = true; st.probeOn = true; st.jump = 0; draw(); } },
  ];
  function init() {
    legend('#aLegend', [['путь точки шума по полю', 'var(--e2e)'], ['прямая от старта к концу', 'var(--ink-3)', 'dash'], ['точки шума', 'var(--ink-2)', 'ring'], ['данные', 'var(--ink-3)', 'dot']]);
    $('#aPairs').addEventListener('change', (e) => { st.pairs = e.target.checked; draw(); });
    const hitP = (p) => { if (!st.probeOn) return null; const s = map(st.probe.x, st.probe.y); return Math.hypot(p.x - s.x, p.y - s.y) < 34 ? 'probe' : null; };
    const hitL = (p) => { if (!st.lensOn) return null; const s = map(st.lens.x, st.lens.y); return Math.hypot(p.x - s.x, p.y - s.y) < LENS * S + 10 ? 'lens' : null; };
    const clamp = (w) => ({ x: Math.max(-2.5, Math.min(2.5, w.x)), y: Math.max(-1.45, Math.min(2.4, w.y)) });
    const set = (o, p) => { const w = clamp(inv(p.x, p.y)); if (o === 'probe') { st.probe = w; recompute(); st.jump = 0; } else st.lens = w; update(); };
    HeroKit.drag($('#aCv'), W, H, { hit: (p) => hitP(p) || hitL(p), move: set, tap: (p) => set(st.lensOn && !st.probeOn ? 'lens' : 'probe', p), tapCursor: 'pointer' });
    recompute();
    ctl = mountMissions('#aMis', missions, api, { controls: { pairs: '#wrapAPairs' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, C };
})();

/* =====================================================================
   2. Живое обучение поля скоростей на кольце
   ===================================================================== */
const LabB = (() => {
  const W = 440, L = 2.2, G = 15, TS = 0.05, Z300 = FM.noise(300, 11), DSHOW = Store.data.slice(0, 800);
  const st = { ti: 15, parts: true, traj: null, floor: null };
  let ctl = null, lastDraw = 0;
  const model = () => Store.st.fm || (Store.st.live && Store.st.live.fm);
  const tAt = (i) => Math.round(i * TS * 100) / 100;
  function floor() { if (st.floor == null) st.floor = FM.lossFloor(200000, 4); return st.floor; }
  /** Средняя радиальная скорость сети на окружности радиуса 0,35 внутри кольца: > 0 — наружу. */
  function radial(m, t) {
    const n = 32, r = 0.35, xs = new Float64Array(2 * n), v = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * (i + 0.5) / n; xs[2 * i] = r * Math.cos(a); xs[2 * i + 1] = r * Math.sin(a); }
    FM.predictor(m, n)(xs, n, t, v);
    let s = 0; for (let i = 0; i < n; i++) s += (v[2 * i] * xs[2 * i] + v[2 * i + 1] * xs[2 * i + 1]) / r;
    return s / n;
  }
  function state() {
    const m = Store.st.fm; if (!m) return { trained: false, t: tAt(st.ti) };
    const t = tAt(st.ti);
    return { trained: true, t, radial: radial(m, t), radialPrev: st.ti > 0 ? radial(m, tAt(st.ti - 1)) : 1 };
  }
  function draw() {
    const P = pal(), { c, k, map, S } = ringBase($('#bCv'), W, L, P), m = model(), t = tAt(st.ti);
    dots(c, DSHOW, map, P.ink3, 1.2, 0.5); ringZones(c, map, S, P);
    if (m) {
      const g = FM.fieldGrid(m, t, G, 2.25);
      for (let i = 0; i < G * G; i++) {
        const x = g[4 * i], y = g[4 * i + 1], vx = g[4 * i + 2], vy = g[4 * i + 3], vn = Math.hypot(vx, vy), len = Math.min(24, 9 * vn), a = map(x, y);
        if (vn < 1e-6) continue;
        arrow(c, a.x, a.y, a.x + vx / vn * len, a.y - vy / vn * len, vx * x + vy * y < 0 ? P.ink3 : P.e2e, 1.5, 5);
      }
      if (st.parts && st.traj) { const fr = st.traj[Math.round(t * 100)]; dots(c, fr, map, P.ink, 1.6, 0.8); }
    } else HeroKit.label(c, k, 'сеть ещё не обучена', W / 2, W / 2, { color: P.ink2, px: 14, weight: 700, haloColor: P.bg });
    HeroKit.label(c, k, `t = ${fmt(t, 2)}`, 8, 16, { align: 'left', color: P.ink, px: 12.5, weight: 700, mono: true, haloColor: P.bg });
    plotLoss(); out();
  }
  function plotLoss() {
    const PW = 520, PH = 120, { c, k } = HeroKit.fit($('#bLoss'), PW, PH), P = pal(), box = { l: Math.round(24 * k) + 10, r: PW - 10, t: 10, b: PH - 22 };
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const lo = 1.6, hi = 3.4, iters = Store.OPT.iters, x = (it) => box.l + it / (iters - 1) * (box.r - box.l), y = (v) => box.b - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (box.b - box.t);
    axes(c, k, P, box, [[0, '0', 'left'], [750, '750'], [iters - 1, '1500', 'right']], [[2, '2,0'], [2.5, '2,5'], [3, '3,0']], x, y);
    const f = floor(); c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.beginPath(); c.moveTo(box.l, y(f)); c.lineTo(box.r, y(f)); c.stroke(); c.setLineDash([]);
    const Ls = Store.st.loss.fm; if (Ls.length > 1) { c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath(); Ls.forEach(([it, v], i) => (i ? c.lineTo(x(it), y(v)) : c.moveTo(x(it), y(v)))); c.stroke(); }
  }
  function out() {
    const el = $('#bOut'), Ls = Store.st.loss.fm;
    if (Store.busy('fm')) { setOut(el, `Сеть учится: шаг <b>${Math.round(Store.st.prog.fm * Store.OPT.iters)}</b> из ${Store.OPT.iters}, ошибка <b>${fmt(Ls.length ? Ls[Ls.length - 1][1] : 0, 2)}</b>`); return; }
    if (!Store.st.fm) { setOut(el, 'Сеть ещё не обучена. Запуск — кнопкой в карточке миссии.'); return; }
    const s = state();
    setOut(el, `t = <b>${fmt(s.t, 2)}</b> · внутри кольца стрелки смотрят <b>${s.radial > 0 ? 'от центра' : 'к центру'}</b> (средняя скорость вдоль радиуса ${fmt(s.radial, 2)}) · ошибка обучения ${fmt(Ls[Ls.length - 1][1], 2)}, граница ${fmt(floor(), 2)}`);
  }
  function setT(i) { st.ti = i; const inp = $('#bT'); inp.value = i; syncRange(inp, fmt(tAt(i), 2)); draw(); if (ctl) ctl.update(); }
  async function train() {
    await Store.fm();
    if (!st.traj) { st.traj = []; FM.sampleFM(Store.st.fm, Z300, 100, st.traj); }
    draw(); const Ls = Store.st.loss.fm;
    return { loss: Ls[Ls.length - 1][1], floor: floor() };
  }
  const api = { reset() { setT(15); st.parts = true; $('#bParts').checked = true; draw(); }, state, train, setT };
  const missions = [
    { short: 'Обучение', title: 'Обучи поле скоростей', text: 'Сеть начинает со случайных весов, и ошибка в начале около 3 — как у ответа «всегда ноль». Нажми кнопку и смотри, как стрелки складываются в поле, а кривая ошибки опускается. Пунктир — ошибка идеального поля, посчитанного по точной формуле.',
      bet: { q: 'до какого значения опустится ошибка обучения?', options: ['Почти до нуля', 'До пунктира, около 1,9', 'Останется около 3'], answer: () => 1 },
      action: { label: 'Обучить сеть', run: (X) => X.train() },
      explain: (r) => `Ошибка остановилась около ${fmt(r.loss, 2)}, а у идеального поля она ${fmt(r.floor, 2)}. Ниже не опуститься никакой сети, и причина та же, что в лаборатории 1: через одну точку x_t проходят прямые к разным пятнам, и цель x₁ − x₀ для неё случайна. Сеть выучивает среднее этих целей, а разброс вокруг среднего остаётся ошибкой. Поэтому по кривой обучения трудно судить, хорошо ли модель рисует: смотреть нужно на сэмплы.` },
    { short: 'Разворот', title: 'Найди момент разворота', text: 'В лаборатории 1 поле в начале пути вело к среднему данных, а здесь среднее — центр кольца. Двигай время t, начиная с нуля. Серые стрелки тянут к центру, оранжевые — от центра, чёрные точки — облако шума, которое сеть довела до момента t. Найди момент, когда стрелки внутри кольца впервые развернутся наружу.', controls: ['t', 'parts'],
      onEnter: (X) => { if (Store.st.fm) X.setT(0); },
      criteria: [{ label: 'Внутри кольца стрелки смотрят от центра', test: (r, s) => s.trained && s.radial > 0 }, { label: 'При t на 0,05 меньше они ещё смотрели к центру', test: (r, s) => s.trained && s.radialPrev <= 0 }],
      hint: 'Следи за стрелками у самого центра. До середины пути они серые.',
      explain: (s) => `Разворот — в момент t = ${fmt(s.t, 2)}. До него шум сильнее сигнала, и лучший ответ сети — среднее всех данных, то есть центр кольца: облако шума сжимается. После сеть уже различает, к какому пятну ближе точка, и выталкивает её наружу. Путь точки, которая стартовала внутри кольца, — петля: сначала к центру, потом обратно. Один шаг из t = 0 целиком идёт по первому направлению — к центру.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай время t и включай облако шума. Посмотри, где стрелки длиннее всего в конце пути и как облако собирается в пятна.', final: true },
  ];
  function init() {
    legend('#bLegend', [['стрелка к центру', 'var(--ink-3)'], ['стрелка от центра', 'var(--e2e)'], ['облако шума в момент t', 'var(--ink)', 'dot'], ['данные', 'var(--ink-3)', 'dot']]);
    legend('#bLossLegend', [['ошибка обучения (скользящее среднее)', 'var(--e2e)'], ['ошибка идеального поля', 'var(--ink-2)', 'dash']]);
    $('#bT').addEventListener('input', (e) => setT(+e.target.value));
    $('#bParts').addEventListener('change', (e) => { st.parts = e.target.checked; draw(); });
    Store.on((kind) => { if (kind !== 'fm') return; const now = performance.now(); if (!Store.busy('fm') || now - lastDraw > 60) { lastDraw = now; draw(); } });
    ctl = mountMissions('#bMis', missions, api, { controls: { t: '#wrapBT', parts: '#wrapBParts' } });
    syncRange($('#bT'), fmt(tAt(st.ti), 2)); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, radial };
})();

/* =====================================================================
   3. Диффузия и flow рядом: шаги и качество
   ===================================================================== */
const LabC = (() => {
  const W = 320, L = 1.9, NT = 40;
  const st = { ni: 3, traj: false, seen: { fm: new Set(), dd: new Set() }, pre: false };
  const trajCache = { fm: new Map(), dd: new Map() };
  let ctl = null;
  const N = () => NS[st.ni];
  function trajOf(kind, n) {
    const m = Store.st[kind]; if (!m) return null; const key = n;
    if (!trajCache[kind].has(key)) { const z = Store.Z.slice(0, 2 * NT), tr = []; if (kind === 'fm') FM.sampleFM(m, z, n, tr); else FM.sampleDDIM(m, z, n, tr); trajCache[kind].set(key, tr); }
    return trajCache[kind].get(key);
  }
  function pane(kind) {
    const P = pal(), cv = kind === 'fm' ? '#cCvF' : '#cCvD', { c, k, map, S } = ringBase($(cv), W, L, P), col = kind === 'fm' ? P.e2e : P.ink2, el = $(kind === 'fm' ? '#cStatF' : '#cStatD');
    ringZones(c, map, S, P);
    const smp = Store.sample(kind, N());
    if (smp) {
      if (st.traj) { const tr = trajOf(kind, N()); c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 1; for (let i = 0; i < NT; i++) { c.beginPath(); tr.forEach((f, j) => { const p = map(f[2 * i], f[2 * i + 1]); if (j) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke(); } c.globalAlpha = 1; }
      dots(c, smp.pts, map, col, 1.5, 0.8);
      const q = smp.q; setOut(el, `в пятнах <b>${pc(q.on)}</b> · пятен <b>${q.modes} из 8</b>`); el.className = 'pane-stat' + (okShape(q) ? ' ok' : q.modes < 8 ? ' bad' : '');
    } else {
      const busy = Store.busy(kind); HeroKit.label(c, k, busy ? `обучается… ${pc(Store.st.prog[kind], 0)}` : 'ещё не обучена', W / 2, W / 2, { color: P.ink2, px: 13, weight: 700, haloColor: P.bg });
      setOut(el, busy ? 'Сеть учится…' : 'Ещё не обучена'); el.className = 'pane-stat';
    }
    HeroKit.label(c, k, `${N()} ${plural(N(), 'шаг', 'шага', 'шагов')}`, W - 8, 14, { align: 'right', color: P.ink, px: 12, weight: 700, mono: true, haloColor: P.bg });
  }
  function chart() {
    const PW = 520, PH = 150, { c, k } = HeroKit.fit($('#cChart'), PW, PH), P = pal(), box = { l: Math.round(28 * k) + 10, r: PW - 14, t: 10, b: PH - 22 };
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const lx = (n) => Math.log(n) / Math.log(100), x = (n) => box.l + lx(n) * (box.r - box.l), y = (v) => box.b - v * (box.b - box.t);
    axes(c, k, P, box, [[1, '1', 'left'], [2, '2'], [4, '4'], [8, '8'], [16, '16'], [32, '32'], [100, '100', 'right']], [[0, '0'], [0.5, '50%'], [1, '100%']], x, y);
    c.setLineDash([3, 4]); c.strokeStyle = P.good; c.lineWidth = 1.4; c.beginPath(); c.moveTo(box.l, y(0.72)); c.lineTo(box.r, y(0.72)); c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, 'форма держится: 72%', box.l + 6, y(0.72) - 9, { align: 'left', color: P.good, px: 10.5, haloColor: P.bg });
    for (const kind of ['dd', 'fm']) {
      const ns = [...st.seen[kind]].sort((a, b) => a - b).filter((n) => Store.sample(kind, n)), col = kind === 'fm' ? P.e2e : P.ink2;
      if (!ns.length) continue;
      c.strokeStyle = col; c.lineWidth = 2; c.setLineDash(kind === 'dd' ? [6, 4] : []); c.beginPath(); ns.forEach((n, i) => { const v = Store.sample(kind, n).q.on; if (i) c.lineTo(x(n), y(v)); else c.moveTo(x(n), y(v)); }); c.stroke(); c.setLineDash([]);
      ns.forEach((n) => { const v = Store.sample(kind, n).q.on; c.beginPath(); c.arc(x(n), y(v), 3.5, 0, 7); c.fillStyle = col; c.fill(); });
    }
  }
  function draw() { pane('dd'); pane('fm'); chart(); }
  function mark() { for (const kind of ['fm', 'dd']) if (Store.st[kind]) st.seen[kind].add(N()); }
  function setN(i) { st.ni = Math.max(0, Math.min(NS.length - 1, i)); const inp = $('#cN'); inp.value = st.ni; syncRange(inp, String(N())); mark(); draw(); if (ctl) ctl.update(); }
  /** Досчитать сэмплы для всех N порциями, чтобы ползунок не подвисал. */
  function precompute() {
    if (st.pre || !Store.st.fm || !Store.st.dd) return; st.pre = true;
    function* all() { for (const n of NS) for (const kind of ['fm', 'dd']) yield* Store.sampleGen(kind, n); }
    runChunked(all(), null, 12).then(() => { if (ctl) ctl.update(); });
  }
  const q = (kind, i) => (i >= 0 && Store.st[kind] ? Store.sample(kind, NS[i]).q : null);
  function state() { return { N: N(), ni: st.ni, f: q('fm', st.ni), d: q('dd', st.ni), fPrev: q('fm', st.ni - 1), dPrev: q('dd', st.ni - 1), ready: !!(Store.st.fm && Store.st.dd) }; }
  async function trainBoth() {
    await Promise.all([Store.fm(), Store.dd()]); precompute();
    setN(3); return { f: q('fm', 3), d: q('dd', 3) };
  }
  async function oneStep() {
    await Promise.all([Store.fm(), Store.dd()]); setN(0);
    const p = Store.sample('fm', 1).pts, n = p.length / 2; let mx = 0, my = 0, r2 = 0;
    for (let i = 0; i < p.length; i += 2) { mx += p[i]; my += p[i + 1]; } mx /= n; my /= n;
    for (let i = 0; i < p.length; i += 2) r2 += (p[i] - mx) ** 2 + (p[i + 1] - my) ** 2;
    return { f: q('fm', 0), d: q('dd', 0), spread: Math.sqrt(r2 / n), center: Math.hypot(mx, my) };
  }
  const api = { reset() { st.seen = { fm: new Set(), dd: new Set() }; setN(3); }, state, trainBoth, oneStep, setN, setTraj(v) { st.traj = v; $('#cTraj').checked = v; draw(); } };
  const crit = (kind) => [{ label: `${kind === 'fm' ? 'Flow' : 'Диффузия'}: не меньше 72% точек в пятнах и все 8 пятен`, test: (r, s) => s.ready && okShape(s[kind === 'fm' ? 'f' : 'd']) }, { label: 'Шагом меньше это ещё не так', test: (r, s) => s.ready && !okShape(s[kind === 'fm' ? 'fPrev' : 'dPrev']) }];
  const missions = [
    { short: 'Обучение', title: 'Обучи диффузию тем же бюджетом', text: 'Если flow-модель в лаборатории 2 уже обучена, возьмём её; если нет, обучим обе. Диффузионной сети дадим те же 1500 шагов обучения. Сравним модели при 4 шагах генерации.',
      bet: { q: 'у какой модели при 4 шагах больше точек в пятнах?', options: ['У диффузии', 'У flow matching', 'Поровну'], answer: (r) => (Math.abs(r.f.on - r.d.on) < 0.03 ? 2 : r.f.on > r.d.on ? 1 : 0) },
      action: { label: 'Обучить и сравнить при 4 шагах', run: (X) => X.trainBoth() },
      explain: (r) => `При 4 шагах flow-модель кладёт в пятна ${pc(r.f.on)} точек, диффузия — ${pc(r.d.on)}. Диффузионные точки ещё не нашли кольцо, а flow уже рисует кольцо и все восемь пятен, хоть и размыто. Дальше выясним, сколько шагов нужно каждой, чтобы форма держалась.` },
    { short: 'Шаги flow', title: 'Сколько шагов нужно flow', text: 'Двигай число шагов. Найди наименьшее, при котором flow-модель держит форму: не меньше 72% точек в пятнах и все восемь пятен на месте. Каждое число шагов, которое ты попробуешь, ложится точкой на график под сценами.', controls: ['n'],
      criteria: crit('fm'), hint: 'Начни с 4 шагов и прибавляй по одному делению.',
      explain: (s) => `Flow-модели хватает ${nWord(s.N, 'шага', 'шагов', 'шагов')}: ${pc(s.f.on)} точек в пятнах. Шагом меньше — ${pc(s.fPrev.on)}. Посмотри на диффузию при тех же ${s.N}: ${pc(s.d.on)}.` },
    { short: 'Шаги диффузии', title: 'А сколько нужно диффузии', text: 'Теперь найди наименьшее число шагов, при котором форму держит диффузия. Порог тот же: 72% точек в пятнах и все восемь пятен.', controls: ['n'],
      criteria: crit('dd'), hint: 'Двигайся вправо от того места, где справилась flow-модель.',
      explain: (s) => `Диффузии понадобилось ${nWord(s.N, 'шаг', 'шага', 'шагов')}, вдвое больше, чем flow. При этом flow и диффузия — одно семейство: шаг DDIM — тот же шаг Эйлера, только по другому расписанию и с другой целью обучения. Разницу дают две вещи. Первая — расписание: у DDPM к середине пути от данных остаётся меньше трети амплитуды, и равномерная сетка тратит много шагов почти на чистый шум. Вторая — что предсказывает сеть: оценку данных из предсказанного шума получают делением на долю сигнала, в начале пути это усиливает ошибку сети, и крупный шаг переносит её в новую точку. Подробно — в тексте под лабораторией.` },
    { short: 'Один шаг', title: 'Один шаг', text: 'Последний опыт с двумя моделями: пройдём весь путь от шума до данных одним шагом.',
      bet: { q: 'что нарисует flow-модель за один шаг?', options: ['Восемь размытых пятен', 'Одно пятно в центре', 'Пустое кольцо'], answer: () => 1 },
      action: { label: 'Один шаг', run: (X) => X.oneStep() },
      explain: (r) => `Flow-модель собрала все 600 точек в маленькое пятно в центре кольца: в среднем они в ${fmt(r.spread, 2)} от его середины, а пятна данных — в 1,0 от центра. Один шаг из t = 0 ведёт в среднее данных, как и на двух пятнах в лаборатории 1. Диффузия за один шаг разбрасывает точки по всей сцене: оценку данных её сеть получает делением на √ᾱ ≈ 0,006, и ошибка в предсказанном шуме вырастает примерно в 160 раз. Пути генерации кривые, и один шаг их не проходит. Чтобы одного шага хватало, пути нужно выпрямить.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число шагов и включай пути точек. При малом числе шагов пути ломаные: каждая точка делает несколько больших прыжков.', final: true },
  ];
  function init() {
    legend('#cLegend', [['flow matching', 'var(--e2e)'], ['диффузия', 'var(--ink-2)', 'dash'], ['порог формы', 'var(--good)', 'dash']]);
    $('#cN').addEventListener('input', (e) => setN(+e.target.value));
    $('#cTraj').addEventListener('change', (e) => { st.traj = e.target.checked; draw(); });
    let last = 0; Store.on(() => { const now = performance.now(); if (now - last > 120 || (!Store.busy('fm') && !Store.busy('dd'))) { last = now; mark(); draw(); precompute(); } });
    ctl = mountMissions('#cMis', missions, api, { controls: { n: '#wrapCN', traj: '#wrapCTraj' } });
    syncRange($('#cN'), String(N())); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   4. Reflow: пересечения пар, выпрямление, цена
   ===================================================================== */
const LabD = (() => {
  const W = 320, L = 1.9, NP = 100, PSO = [2, 4, 8, 16, 50], NT = 40, ZZ = FM.noise(NP, 5), RD = FM.ring(NP, 6);
  const RF = { n: 2000, iters: 1000, bs: 128, lr: 0.002, seed: 8 };
  const st = { mode: 'pairs', ps: 4, ni: 0, rf: new Map(), cur: null, busy: false, prog: 0, mp: new Map(), randX: null };
  let ctl = null, last = 0;
  const N = () => NS[st.ni];
  const randX = () => (st.randX == null ? (st.randX = FM.crossings(ZZ, RD, NP)) : st.randX);
  function modelPairs(ps) {
    if (!Store.st.fm) return null;
    if (!st.mp.has(ps)) { const z1 = FM.sampleFM(Store.st.fm, ZZ, ps); st.mp.set(ps, { z1, x: FM.crossings(ZZ, z1, NP) }); }
    return st.mp.get(ps);
  }
  const rf = () => (st.cur != null ? st.rf.get(st.cur) : null);
  function rfAt(e, n) { if (!e.gen.has(n)) { const pts = FM.sampleFM(e.m, Store.Z, n); e.gen.set(n, { pts, q: FM.ringQuality(pts) }); } return e.gen.get(n); }
  function lines(c, map, z0, z1, n, col, alpha) { c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < n; i++) { const a = map(z0[2 * i], z0[2 * i + 1]), b = map(z1[2 * i], z1[2 * i + 1]); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); } c.stroke(); c.globalAlpha = 1; }
  function head(side, title, sub) { setOut($('#dHead' + side), title); setOut($('#dSub' + side), sub); }
  function stat(sel, html, cls) { const el = $(sel); setOut(el, html); el.className = 'pane-stat' + (cls ? ' ' + cls : ''); }
  function draw() {
    const P = pal(), A = ringBase($('#dCvL'), W, L, P), B = ringBase($('#dCvR'), W, L, P);
    ringZones(A.c, A.map, A.S, P); ringZones(B.c, B.map, B.S, P);
    const ps = st.ps, pw = nWord(ps, 'шаг', 'шага', 'шагов');
    if (st.mode === 'pairs') {
      head('L', 'Случайные пары', 'так учится обычный flow matching'); head('R', 'Пары reflow', `шум и куда его привела модель за ${pw}`);
      lines(A.c, A.map, ZZ, RD, NP, P.ink2, 0.45); dots(A.c, RD, A.map, P.e2e, 2, 0.9);
      stat('#dStatL', `пересечений: <b>${randX()}</b> из 4950 пар отрезков`);
      const mp = modelPairs(ps);
      if (mp) { lines(B.c, B.map, ZZ, mp.z1, NP, P.ink2, 0.45); dots(B.c, mp.z1, B.map, P.e2e, 2, 0.9); stat('#dStatR', `пересечений: <b>${mp.x}</b> из 4950`); }
      else { HeroKit.label(B.c, B.k, Store.busy('fm') ? 'исходная модель учится…' : 'нужна обученная модель', W / 2, W / 2, { color: P.ink2, px: 13, weight: 700, haloColor: P.bg }); stat('#dStatR', 'Пар ещё нет'); }
    } else {
      head('L', 'Исходная модель', `${nWord(N(), 'шаг', 'шага', 'шагов')} Эйлера`); head('R', 'Выпрямленная модель', '1 шаг Эйлера');
      const sm = Store.sample('fm', N());
      if (sm) {
        const tr = []; FM.sampleFM(Store.st.fm, Store.Z.slice(0, 2 * NT), N(), tr);
        A.c.strokeStyle = P.e2e; A.c.globalAlpha = 0.35; A.c.lineWidth = 1; for (let i = 0; i < NT; i++) { A.c.beginPath(); tr.forEach((f, j) => { const p = A.map(f[2 * i], f[2 * i + 1]); if (j) A.c.lineTo(p.x, p.y); else A.c.moveTo(p.x, p.y); }); A.c.stroke(); } A.c.globalAlpha = 1;
        dots(A.c, sm.pts, A.map, P.e2e, 1.5, 0.8); stat('#dStatL', `в пятнах <b>${pc(sm.q.on)}</b> · пятен <b>${sm.q.modes} из 8</b>`);
      } else stat('#dStatL', 'Нужна обученная модель');
      const e = rf();
      if (e) {
        const one = rfAt(e, 1); lines(B.c, B.map, Store.Z, one.pts, NT, P.e2e, 0.35); dots(B.c, one.pts, B.map, P.e2e, 1.5, 0.8);
        stat('#dStatR', `в пятнах <b>${pc(one.q.on)}</b> · пятен <b>${one.q.modes} из 8</b> · пары за ${pw.replace(/^\d+ /, (m) => m)}`, one.q.on >= 0.62 && one.q.modes === 8 ? 'ok' : 'bad');
      } else if (st.busy) { HeroKit.label(B.c, B.k, `выпрямляем… ${pc(st.prog, 0)}`, W / 2, W / 2, { color: P.ink2, px: 13, weight: 700, haloColor: P.bg }); stat('#dStatR', 'Учится на новых парах…'); }
      else { HeroKit.label(B.c, B.k, 'ещё не выпрямлена', W / 2, W / 2, { color: P.ink2, px: 13, weight: 700, haloColor: P.bg }); stat('#dStatR', 'Ещё не выпрямлена'); }
    }
  }
  function setMode(m) { st.mode = m; $$('#dMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); draw(); }
  function setPS(ps) { st.ps = ps; $$('#dPS button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ps === ps))); if (st.rf.has(ps)) st.cur = ps; draw(); if (ctl) ctl.update(); }
  function setN(i) { st.ni = Math.max(0, Math.min(NS.length - 1, i)); const inp = $('#dN'); inp.value = st.ni; syncRange(inp, String(N())); draw(); if (ctl) ctl.update(); }
  async function buildPairs() { await Store.fm(); setMode('pairs'); const mp = modelPairs(st.ps); return { rand: randX(), model: mp.x, ps: st.ps }; }
  async function straighten() {
    await Store.fm(); const ps = st.ps;
    if (!st.rf.has(ps)) {
      st.busy = true; st.prog = 0; setMode('gen');
      const pairs = await runChunked(FM.pairsGen(Store.st.fm, RF.n, ps, 99), null, 14);
      const m = FM.clone(Store.st.fm, true);
      await runChunked(FM.trainFM(m, null, Object.assign({ pairs }, RF)), (e) => { st.prog = (e.it + 1) / e.iters; const now = performance.now(); if (now - last > 120) { last = now; draw(); } }, 14);
      st.rf.set(ps, { m, ps, pairsQ: FM.ringQuality(pairs.z1), gen: new Map() }); st.busy = false;
    }
    st.cur = ps; setMode('gen'); setN(0);
    const e = st.rf.get(ps), one = rfAt(e, 1);
    return { ps, q1: one.q.on, modes: one.q.modes, pairsOn: e.pairsQ.on };
  }
  function state() {
    const e = rf(), sm = Store.st.fm ? Store.sample('fm', N()) : null, prev = Store.st.fm && st.ni > 0 ? Store.sample('fm', NS[st.ni - 1]) : null;
    return { ready: !!(e && sm), N: N(), ps: st.ps, cur: st.cur, q: sm && sm.q, qPrev: prev && prev.q, target: e ? rfAt(e, 1).q.on : null };
  }
  const api = { reset() { st.cur = null; setPS(4); setN(0); setMode('pairs'); }, state, buildPairs, straighten, setPS, setN, setMode, rfAt: (n) => rf() && rfAt(rf(), n) };
  const missions = [
    { short: 'Пары', title: 'Пары без пересечений', text: 'Пути кривые, потому что обучающие прямые пересекаются. Слева — 100 случайных пар «шум — точка данных», на таких учится обычный flow matching. Справа будут пары reflow: те же 100 точек шума и то, куда их привела обученная модель. Сравним, сколько пересечений у тех и других.',
      onEnter: () => setMode('pairs'),
      bet: { q: 'сколько пересечений будет у пар reflow?', options: ['Столько же, сколько у случайных', 'В несколько раз меньше', 'Почти ни одного'], answer: (r) => (r.model <= 0.05 * r.rand ? 2 : r.model < 0.5 * r.rand ? 1 : 0) },
      action: { label: 'Построить пары', run: (X) => X.buildPairs() },
      explain: (r) => `У случайных пар ${r.rand} пересечений из 4950 возможных, у пар reflow — ${r.model}. Пути модели — решения одного дифференциального уравнения. Два решения не могут оказаться в одной точке в один момент, иначе дальше они бы совпали. Поэтому пути не пересекаются, и прямые между их началом и концом почти тоже. Если учить сеть на таких парах, через каждую точку проходит почти одно направление, и усреднять сети почти нечего.` },
    { short: 'Один шаг', title: 'Выпрями модель до одного шага', text: 'Обучим ту же сеть ещё 1000 шагов на 2000 парах reflow и проверим её за один шаг. Пары тоже стоят вычислений: исходная модель строит их за выбранное число шагов. Добейся, чтобы выпрямленная модель за один шаг клала в пятна не меньше 62% точек.', controls: ['ps'],
      action: { label: 'Выпрямить', run: (X) => X.straighten() },
      criteria: [{ label: 'За 1 шаг не меньше 62% точек в пятнах', test: (r) => r.q1 >= 0.62 }, { label: 'Все 8 пятен на месте', test: (r) => r.modes === 8 }],
      summary: (r) => `пары за ${nWord(r.ps, 'шаг', 'шага', 'шагов')} → за 1 шаг ${pc(r.q1)}`,
      fail: (r) => (r.pairsOn < 0.75 ? `Пары плохие: за ${nWord(r.ps, 'шаг', 'шага', 'шагов')} исходная модель сама кладёт в пятна только ${pc(r.pairsOn)} точек, и выпрямленная сеть выучила размытую картинку. Потрать на пары больше шагов.` : `Почти: ${pc(r.q1)}. Потрать на пары больше шагов, чтобы они стали точнее.`),
      hint: 'Сравни с лабораторией 3: сколько шагов нужно исходной модели, чтобы держать форму?',
      explain: (r) => `За один шаг выпрямленная модель кладёт в пятна ${pc(r.q1)} точек, а исходная — 0%. Пары исходная модель строила за ${nWord(r.ps, 'шаг', 'шага', 'шагов')}: это разовая цена при обучении, на роботе её не платят. Пути выпрямленной модели стали почти прямыми, поэтому один шаг срезает мало.` },
    { short: 'Цена', title: 'Сколько стоит выпрямление', text: 'Сколько шагов инференса экономит reflow? Двигай число шагов исходной модели и найди, сколько шагов ей нужно, чтобы догнать выпрямленную с её одним шагом.', controls: ['n'],
      onEnter: () => setMode('gen'),
      criteria: [{ label: 'Исходная модель кладёт в пятна не меньше точек, чем выпрямленная за 1 шаг', test: (r, s) => s.ready && s.q.on >= s.target }, { label: 'Шагом меньше она ещё отставала', test: (r, s) => s.ready && !!s.qPrev && s.qPrev.on < s.target }],
      hint: 'Если миссия «Один шаг» пройдена с другим числом шагов на пары, ответ тоже другой: это нормально.',
      explain: (s) => { const e = rf(), a = Store.sample('fm', 100).q.on, b = rfAt(e, 100).q.on; return `Исходной модели нужно ${nWord(s.N, 'шаг', 'шага', 'шагов')}, чтобы догнать один шаг выпрямленной (${pc(s.target)}). Цена видна на большом числе шагов: при 100 шагах исходная модель кладёт в пятна ${pc(a)} точек, выпрямленная — ${pc(b)}. Ошибки исходной модели перешли в пары. У Liu и соавторов на CIFAR-10 то же: один шаг Эйлера исходной модели дал FID 378, после одного reflow — 12,21, а на точном решателе FID вырос с 2,58 до 3,36.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай пары и результат, меняй число шагов на пары и число шагов исходной модели. Посмотри, какие пары получаются за 2 шага и что из них выходит.', final: true },
  ];
  function init() {
    PSO.forEach((ps) => { const b = h('button', { type: 'button', 'data-ps': ps, 'aria-pressed': String(ps === st.ps) }, String(ps)); b.addEventListener('click', () => setPS(ps)); $('#dPS').append(b); });
    $$('#dMode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#dN').addEventListener('input', (e) => setN(+e.target.value));
    Store.on(() => { const now = performance.now(); if (now - last > 150 || !Store.busy('fm')) { last = now; draw(); if (ctl) ctl.update(); } });
    ctl = mountMissions('#dMis', missions, api, { controls: { mode: '#dMode', ps: '#wrapDPS', n: '#wrapDN' } });
    syncRange($('#dN'), String(N())); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   5. Пачка из 50 действий в стиле π0: шаги, задержка, бюджет
   ===================================================================== */
const LabE = (() => {
  const W = 560, H = 280, X0 = 40, SX = 800, OY = 140, CH = FM.CH, D = FM.demos(40, 21), Z = FM.noise(20, 77, CH.H), S2 = 0.01, BUDGET = 0.15;
  const map = (x, y) => ({ x: X0 + x * SX, y: OY - y * SX });
  const st = { n: 10, srv: false, frame: null, budget: false, cache: new Map() };
  let ctl = null;
  function gen(n) {
    if (!st.cache.has(n)) {
      const tr = [], x = FM.sampleChunk(D, S2, Z, n, tr), checks = []; let ok = 0, hit = 0, gap = 1e9;
      for (let k = 0; k < 20; k++) { const c = FM.chunkCheck(x, k); checks.push(c); if (c.gap >= 0.02) ok++; if (c.hit) hit++; gap = Math.min(gap, c.gap); }
      st.cache.set(n, { x, tr, ok, hit, gap, checks });
    }
    return st.cache.get(n);
  }
  function state() {
    const g = gen(st.n), L = FM.latency(st.n, st.srv);
    return { N: st.n, srv: st.srv, L, idle: FM.idle(L), ok: g.ok, hit: g.hit, gap: g.gap, okPrev: st.n > 1 ? gen(st.n - 1).ok : -1 };
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#eCv'), W, H), P = pal(), g = gen(st.n), fr = st.frame || g.x;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 20, P.grid);
    // демонстрации
    c.strokeStyle = P.ink3; c.globalAlpha = 0.28; c.lineWidth = 1;
    for (const d of D) { c.beginPath(); for (let i = 0; i < CH.H; i++) { const p = map(FM.chunkX(i), d[i] * CH.SCALE); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.stroke(); }
    c.globalAlpha = 1;
    // чайник
    const kc = map(CH.KX, 0), kr = CH.KR * SX;
    c.beginPath(); c.arc(kc.x, kc.y, kr, 0, 7); c.fillStyle = P.surf; c.fill(); c.save(); c.beginPath(); c.arc(kc.x, kc.y, kr, 0, 7); HeroKit.hatch(c, kc.x - kr, kc.y - kr, kc.x + kr, kc.y + kr, P.ink3, 7, 1.2); c.restore();
    c.beginPath(); c.arc(kc.x, kc.y, kr, 0, 7); c.strokeStyle = P.ink2; c.lineWidth = 2; c.stroke();
    c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.arc(kc.x, kc.y, kr + 0.02 * SX, 0, 7); c.stroke(); c.setLineDash([]);
    const s0 = map(0, 0), s1 = map(CH.len, 0);
    c.beginPath(); c.arc(s0.x, s0.y, 7, 0, 7); c.fillStyle = P.ink; c.fill();
    // пачки
    for (let kk = 0; kk < 20; kk++) {
      const good = st.frame ? true : g.checks[kk].gap >= 0.02;
      c.strokeStyle = good ? P.e2e : P.bad; c.globalAlpha = st.frame ? 0.55 : 0.75; c.lineWidth = good ? 1.6 : 2.2; c.beginPath();
      for (let i = 0; i < CH.H; i++) { const p = map(FM.chunkX(i), Math.max(-0.17, Math.min(0.17, fr[kk * CH.H + i] * CH.SCALE))); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
      c.stroke();
    }
    c.globalAlpha = 1;
    HeroKit.label(c, k, 'чайник', kc.x, kc.y - kr * 0.45, { color: P.ink, px: 12, weight: 700, haloColor: P.surf });
    HeroKit.label(c, k, 'захват сейчас', 8, s0.y + 22, { align: 'left', color: P.ink2, px: 11.5, haloColor: P.bg });
    HeroKit.label(c, k, 'через 1 с →', W - 8, s1.y + 22, { align: 'right', color: P.ink3, px: 11.5, mono: true, haloColor: P.bg });
    c.fillStyle = P.ink; for (let i = 0; i < CH.H; i++) { const p = map(FM.chunkX(i), Math.max(-0.17, Math.min(0.17, fr[i] * CH.SCALE))); c.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2); }
    HeroKit.label(c, k, `${st.n} ${plural(st.n, 'шаг', 'шага', 'шагов')} Эйлера · 20 пачек по 50 действий`, W - 10, 14, { align: 'right', color: P.ink, px: 12, weight: 700, mono: true, haloColor: P.bg });
    lat(); out();
  }
  function lat() {
    const L = FM.latency(st.n, st.srv), I = FM.idle(L), full = 140, w = (ms) => (ms / full * 100).toFixed(2) + '%', fl = FM.PI0.flow10 * st.n / 10;
    const lim = st.budget ? `<span class="lim" style="left:${w(BUDGET / (1 - BUDGET) * 500)}" title="15% простоя"></span>` : '';
    $('#eLat').innerHTML = `<div class="lat-bar"><i class="enc" style="width:${w(14)}">14</i><i class="pre" style="width:${w(32)}">32</i><i class="flow" style="width:${w(fl)}">${fmt(fl, 0)}</i>${st.srv ? `<i class="net" style="width:${w(13)}">13</i>` : ''}${lim}</div>` +
      `<div class="lat-cap"><span><i class="sw enc"></i>камеры</span><span><i class="sw pre"></i>наблюдение</span><span><i class="sw flow"></i>${st.n} × 2,7 мс flow</span>${st.srv ? '<span><i class="sw net"></i>сеть</span>' : ''}<span>итого <b>${fmt(L, 1)} мс</b></span><span>робот стоит <b>${pc(I)}</b> времени</span>${st.budget ? '<span>пунктир — 15% простоя</span>' : ''}</div>`;
  }
  function out() {
    const s = state();
    setOut($('#eOut'), `Пачек с зазором от чайника не меньше 2 см: <b>${s.ok} из 20</b> · задели чайник: <b>${s.hit}</b> · наименьший зазор ${s.gap < 0 ? 'нет, пачка в чайнике' : fmt(s.gap * 100, 1) + ' см'}`);
  }
  async function play(n) {
    const g = gen(n), tr = g.tr, steps = tr.length - 1;
    await tween(Math.min(1400, 220 * steps + 200), (u) => { const f = Math.min(steps, Math.floor(u * (steps + 0.999))); st.frame = u >= 1 ? null : tr[f]; draw(); });
    st.frame = null; draw();
  }
  function setN(n, anim) { st.n = n; const inp = $('#eN'); inp.value = n; syncRange(inp, String(n)); if (anim) play(n); else draw(); if (ctl) ctl.update(); }
  function setSrv(v) { st.srv = v; $('#eSrv').checked = v; draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.budget = false; setSrv(false); setN(10); }, state, setN, setSrv,
    async split() { setSrv(false); setN(10); return { rest: FM.PI0.enc + FM.PI0.prefix, flow: FM.PI0.flow10, total: FM.latency(10, false) }; },
    async one() { setN(1); await play(1); return state(); },
  };
  const missions = [
    { short: '73 мс', title: 'Из чего складываются 73 мс', text: 'Сначала узнаем, сколько стоят сами шаги flow. Калькулятор под сценой собран из разбивки задержки π0 на RTX 4090 с тремя камерами: энкодеры картинок, проход по наблюдению и шаги эксперта действий.',
      onEnter: () => { st.budget = false; draw(); },
      bet: { q: 'что занимает у π0 больше времени?', options: ['10 шагов flow', 'Проход по картинкам и тексту', 'Поровну'], answer: (r) => (r.flow > r.rest ? 0 : r.flow < r.rest ? 1 : 2) },
      action: { label: 'Разложить 73 мс', run: (X) => X.split() },
      explain: (r) => `Энкодеры картинок и проход по наблюдению — ${r.rest} мс, все 10 шагов flow — ${r.flow} мс, около 2,7 мс на шаг. Эксперт действий в 10 раз меньше VLM и работает только с 50 токенами действий, а картинки и текст считаются один раз за пачку и лежат в кэше. Даже один шаг вместо десяти сэкономил бы только треть задержки: ${fmt(FM.latency(1, false), 1)} мс вместо ${fmt(r.total, 0)}.` },
    { short: 'Один шаг', title: 'Пачка за один шаг', text: 'Самый быстрый вариант — один шаг. Ада везёт захват мимо чайника. Серые линии — 40 демонстраций: половина объезжает чайник сверху, половина снизу. Сгенерируем 20 пачек по 50 действий за один шаг Эйлера.',
      bet: { q: 'сколько из 20 пачек объедут чайник?', options: ['Все 20', 'Около половины', 'Ни одной'], answer: (r) => (r.ok === 20 ? 0 : r.ok >= 5 ? 1 : 2) },
      action: { label: 'Сгенерировать за 1 шаг', run: (X) => X.one() },
      explain: (r) => `${r.ok ? `Объехали ${r.ok}.` : 'Ни одна.'} Все 20 пачек — одна и та же прямая сквозь чайник. Первый шаг из чистого шума ведёт в среднее демонстраций, а среднее объездов сверху и снизу — прямо. Это та же ошибка, что у регрессии в уроке 1.3, только теперь её делает слишком крупный шаг.` },
    { short: 'Наименьшее N', title: 'Сколько шагов нужно Аде', text: 'Двигай число шагов Эйлера. Найди наименьшее, при котором все 20 пачек проходят не ближе 2 см от чайника.', controls: ['n'],
      criteria: [{ label: 'Все 20 пачек проходят не ближе 2 см от чайника', test: (r, s) => s.ok === 20 }, { label: 'Шагом меньше это ещё не так', test: (r, s) => s.okPrev >= 0 && s.okPrev < 20 }],
      hint: 'Начни с одного шага и прибавляй по одному. Смотри на красные пачки.',
      explain: (s) => `Хватает ${nWord(s.N, 'шага', 'шагов', 'шагов')} Эйлера. На первом шаге пачка тянется к среднему демонстраций, на следующих уже видно, к какой стороне она ближе, и пачка уходит туда. С двумя шагами чайник задевают ${gen(2).hit} пачки из 20, с тремя самая близкая проходит в ${fmt(gen(3).gap * 100, 1)} см. Поле здесь точное, без ошибок обучения. Настоящие головы действий делают 4–10 шагов flow: GR00T N1 — 4, π0.7 — 5, π0 — 10.` },
    { short: 'Бюджет', title: 'Уложись в бюджет', text: 'Ада исполняет 25 действий из пачки (0,5 с) и стоит, пока считается следующая. Стоять она может не больше 15% времени. Видеокарта на борту слабая, поэтому модель переезжает на сервер: включи переключатель, это ещё 13 мс на сеть. Сейчас модель делает 16 шагов Эйлера. Подбери их число так, чтобы уложиться в бюджет и по-прежнему объезжать чайник.', controls: ['n', 'srv'],
      onEnter: (X) => { st.budget = true; X.setSrv(false); X.setN(16); },
      criteria: [{ label: 'Модель считается на сервере', test: (r, s) => s.srv }, { label: 'Робот стоит не больше 15% времени', test: (r, s) => s.srv && s.idle <= BUDGET }, { label: 'Все 20 пачек проходят не ближе 2 см от чайника', test: (r, s) => s.ok === 20 }],
      hint: 'Пунктир на полоске задержки — граница 15%. Сначала найди, где кончается бюджет, потом проверь объезд.',
      explain: (s) => `Подходит от 4 до 10 шагов Эйлера. На 10 шагах инференс на сервере занимает ${fmt(FM.latency(10, true), 0)} мс, простой — ${pc(FM.idle(FM.latency(10, true)))}: столько тратит π0 вне робота. На 11 шагах простой уже ${pc(FM.idle(FM.latency(11, true)))}. В асинхронном режиме из урока 1.7 робот не стоит, но задержка не исчезает: пока считается новая пачка, действия уходят по старой.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число шагов Эйлера и место расчёта модели. Посмотри, как пачка превращается из шума в движение: при каждом изменении числа шагов сцена проигрывает все шаги.', final: true, onEnter: () => { st.budget = true; draw(); } },
  ];
  function init() {
    legend('#eLegend', [['пачка объезжает чайник', 'var(--e2e)'], ['ближе 2 см или в чайнике', 'var(--critical)'], ['демонстрации', 'var(--ink-3)'], ['50 действий одной пачки', 'var(--ink)']]);
    $('#eN').addEventListener('input', (e) => setN(+e.target.value, false));
    $('#eN').addEventListener('change', (e) => setN(+e.target.value, true));
    $('#eSrv').addEventListener('change', (e) => setSrv(e.target.checked));
    ctl = mountMissions('#eMis', missions, api, { controls: { n: '#wrapEN', srv: '#wrapESrv' } });
    syncRange($('#eN'), String(st.n)); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, gen };
})();

/* =====================================================================
   Схемы раздела 1: путь от шума к данным и крупный шаг (fm-bend), прямые
   обучения и поле скоростей (fm-pairs), обучение и генерация целиком рядом
   с шагом денойзинга Diffusion Policy (fm-loop). Рисует общий модуль схем
   shared/anim.js.
   ===================================================================== */
(() => {
  const K = HeroKit, TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2, lerp = (a, b, s) => a + (b - a) * s;
  /** Цвет с прозрачностью: hex или rgb() из CSS-переменной. */
  function alpha(col, a) {
    const s = String(col).trim(); let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
    m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(',').map((x) => x.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
    return s;
  }
  function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function rrect(c, x, y, w, h, r, fill, stroke, lw) { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function poly(c, pts, col, lw, dash) {
    if (pts.length < 2) return; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.strokeStyle = col; c.lineWidth = lw || 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
  }
  function head(c, x2, y2, a, col, hd) { c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45)); c.lineTo(x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45)); c.closePath(); c.fillStyle = col; c.fill(); }
  /** Стрелка с треугольным наконечником. */
  function arw(c, x1, y1, x2, y2, col, lw, hd) {
    const L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) return; const a = Math.atan2(y2 - y1, x2 - x1); hd = Math.min(hd || 8, L * 0.7);
    poly(c, [[x1, y1], [x2 - Math.cos(a) * hd * 0.6, y2 - Math.sin(a) * hd * 0.6]], col, lw || 2); head(c, x2, y2, a, col, hd);
  }
  /** Ломаная со стрелкой на конце. */
  function route(c, pts, col, lw, dash, hd) {
    const n = pts.length, [x1, y1] = pts[n - 2], [x2, y2] = pts[n - 1], a = Math.atan2(y2 - y1, x2 - x1); hd = hd || 7;
    poly(c, pts.slice(0, n - 1).concat([[x2 - Math.cos(a) * hd * 0.6, y2 - Math.sin(a) * hd * 0.6]]), col, lw || 1.6, dash); head(c, x2, y2, a, col, hd);
  }
  /** Точка на ломаной: доля пути s от 0 до 1. */
  function along(pts, s) {
    let L = 0; const seglen = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seglen.push(d); L += d; }
    let d = clamp(s, 0, 1) * L; for (let i = 0; i < seglen.length; i++) { if (d <= seglen[i] || i === seglen.length - 1) { const f = seglen[i] ? clamp(d / seglen[i], 0, 1) : 0; return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; } d -= seglen[i]; }
    return pts[pts.length - 1];
  }
  /** Три точки бегут по ломаной, пока 0 < prog < 1. */
  function flow(c, pts, prog, col) { if (prog <= 0 || prog >= 1) return; for (let i = 0; i < 3; i++) { const [x, y] = along(pts, (prog * 1.4 + i / 3) % 1); circle(c, x, y, 2.8, col); } }
  /** Подпись в одну или несколько строк (массив) с общим размером, ужатая до ширины maxW; y — середина блока. */
  function txt(c, k, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * 1.3, y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => K.label(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
  }
  const onPlane = (P, o) => Object.assign({ halo: true, haloColor: P.surf }, o);

  /* ---------- мир схем 1 и 2: два пятна и облако шума, как в лаборатории 1 ---------- */
  const C2 = [{ m: [-1.2, 1.0], s: 0.22, w: 1 }, { m: [1.2, 1.0], s: 0.22, w: 1 }], R2 = 2.5 * 0.22;
  const DATA = FM.gmmSample(C2, 160, 5).filter((v, i, a) => { const j = i - (i % 2), x = a[j], y = a[j + 1]; return C2.some((cp) => Math.hypot(x - cp.m[0], y - cp.m[1]) < R2); }); // на схеме — только точки внутри пунктирных кругов
  const NZ = FM.noise(36, 3), WX = [-2.05, 2.05], WY = [-0.98, 1.88];
  /** Плоскость в прямоугольнике B: масштаб и перевод мировых координат в точки канваса. */
  function plane(B) {
    const s = Math.min(B.w / (WX[1] - WX[0]), B.h / (WY[1] - WY[0])), w = s * (WX[1] - WX[0]), h = s * (WY[1] - WY[0]);
    const x0 = B.x + (B.w - w) / 2, y0 = B.y + (B.h - h) / 2;
    return { s, x0, y0, w, h, map: (x, y) => [x0 + (x - WX[0]) * s, y0 + (WY[1] - y) * s] };
  }
  /** Фон плоскости: сетка, облако шума, два пятна данных и их подписи. */
  function world(c, k, P, Q) {
    rrect(c, Q.x0, Q.y0, Q.w, Q.h, 8, P.surf, P.grid, 1);
    c.save(); c.beginPath(); c.roundRect(Q.x0, Q.y0, Q.w, Q.h, 8); c.clip();
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath();
    for (let x = -2; x <= 2.01; x += 0.5) { const [px] = Q.map(x, 0); c.moveTo(px, Q.y0); c.lineTo(px, Q.y0 + Q.h); }
    for (let y = -0.5; y <= 1.51; y += 0.5) { const [, py] = Q.map(0, y); c.moveTo(Q.x0, py); c.lineTo(Q.x0 + Q.w, py); }
    c.stroke();
    for (let i = 0; i < NZ.length; i += 2) { if (NZ[i + 1] > 1.45) continue; const [x, y] = Q.map(NZ[i], NZ[i + 1]); circle(c, x, y, 2.4, null, alpha(P.ink3, 0.55), 1.1); } // выше 1,45 — подписи пятен
    c.fillStyle = alpha(P.ink3, 0.7); for (let i = 0; i < DATA.length; i += 2) { const [x, y] = Q.map(DATA[i], DATA[i + 1]); c.fillRect(x - 1.3, y - 1.3, 2.6, 2.6); }
    c.setLineDash([4, 4]); for (const cp of C2) { const [x, y] = Q.map(cp.m[0], cp.m[1]); circle(c, x, y, R2 * Q.s, null, P.ink3, 1.1); } c.setLineDash([]);
    c.restore();
    C2.forEach((cp, i) => { const [x, y] = Q.map(cp.m[0], cp.m[1] + R2); txt(c, k, i ? 'правое пятно' : 'левое пятно', x, y - 13, null, onPlane(P, { px: 10.5, color: P.ink2 })); });
  }
  /** Колонка пояснений: заголовок и строки; строка яркая, когда её этап уже начался. */
  function rows(c, k, P, G, items, act) {
    txt(c, k, G.title, G.x, G.titleY, G.w, { px: 12.5, weight: 750, color: P.ink, align: 'left' });
    items.forEach((r, i) => {
      const y = G.y0 + i * G.dy, x = G.x;
      c.globalAlpha = act[i] ? 1 : 0.35;
      if (r.sw === 'nodes') { poly(c, [[x, y], [x + 24, y]], r.col, 2.4); circle(c, x + 1, y, 2.8, r.col); circle(c, x + 23, y, 2.8, r.col); }
      else if (r.sw === 'arrow') arw(c, x, y, x + 25, y, r.col, r.lw || 2.4, 8);
      else poly(c, [[x, y], [x + 25, y]], r.col, r.lw || 3);
      txt(c, k, r.head, x + 34, y, G.w - 34, { px: 11.5, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, r.sub, x, y + G.subDy, G.w, { px: 10.5, weight: 600, color: P.ink2, align: 'left' });
      c.globalAlpha = 1;
    });
    if (G.note) txt(c, k, G.note.text, G.x, G.note.y, G.w, { px: 10, weight: 600, color: P.ink3, align: 'left' });
  }

  /* ---------- fm-bend: путь от шума к данным изогнут, крупный шаг срезает поворот ---------- */
  const S0 = [0.9, -0.6], MEAN = [0, 1], PATH = FM.gmmPath(C2, S0[0], S0[1], 200), P4 = FM.gmmPath(C2, S0[0], S0[1], 4);
  const VEL = PATH.map((q, i) => FM.gmmField(C2, q[0], q[1], Math.min(i, 199) / 200));
  const TA = 13, PA = { small: [0.6, 4.4], big: [5.0, 6.4], four: [7.0, 9.8] };
  function drawBend(c, k, t, P, G) {
    const u = ((t % TA) + TA) % TA, Q = plane(G.plane), m = (q) => Q.map(q[0], q[1]);
    world(c, k, P, Q);
    const pS = seg(u, PA.small[0], PA.small[1]), pB = ease(seg(u, PA.big[0], PA.big[1])), pF = seg(u, PA.four[0], PA.four[1]);
    const [mx, my] = m(MEAN);
    c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.moveTo(mx - 5, my); c.lineTo(mx + 5, my); c.moveTo(mx, my - 5); c.lineTo(mx, my + 5); c.stroke();
    txt(c, k, 'среднее данных', mx, my - 14, null, onPlane(P, { px: 10, color: P.ink2 }));
    if (pS > 0) {
      const n = Math.max(1, Math.round(pS * 200));
      poly(c, PATH.slice(0, n + 1).map(m), P.mot, 3);
      const [x, y] = m(PATH[n]);
      if (pS < 1) { const v = VEL[n], L = Math.hypot(v[0], v[1]); arw(c, x, y, x + v[0] / L * 0.5 * Q.s, y - v[1] / L * 0.5 * Q.s, P.mot, 2.2, 8); circle(c, x, y, 4.6, P.mot); }
      else circle(c, x, y, 4, P.mot);
    }
    if (pB > 0) {
      const [x0, y0] = m(S0);
      arw(c, x0, y0, lerp(x0, mx, pB), lerp(y0, my, pB), P.bad, 2.6, 10);
      if (pB >= 1) { K.cross(c, mx, my, 6, P.bad, 2.4); txt(c, k, 'мимо данных', mx - 9, my + 15, null, onPlane(P, { px: 10.5, weight: 700, color: P.bad, align: 'right' })); }
    }
    if (pF > 0) {
      for (let i = 0; i < 4; i++) {
        const s = clamp(pF * 4 - i, 0, 1); if (s <= 0) break;
        const [ax, ay] = m(P4[i]), [bx, by] = m(P4[i + 1]); arw(c, ax, ay, lerp(ax, bx, s), lerp(ay, by, s), P.spr, 2.4, 8); if (i) circle(c, ax, ay, 3, P.spr);
      }
      if (pF >= 1) { const [x, y] = m(P4[4]); circle(c, x, y, 3.4, P.spr); }
    }
    const [sx, sy] = m(S0); circle(c, sx, sy, 7, P.surf, P.ink, 2.4);
    txt(c, k, 'точка шума', sx, sy + 17, null, onPlane(P, { px: 10.5, weight: 700, color: P.ink }));
    rows(c, k, P, Object.assign({ title: 'Путь от шума к данным изогнут' }, G.leg), [
      { sw: 'line', col: P.mot, head: 'Мелкие шаги', sub: ['идут по изгибу: сначала к середине', 'между пятнами, потом к правому пятну'] },
      { sw: 'arrow', col: P.bad, head: 'Один крупный шаг', sub: ['идёт по направлению в начальной точке,', 'срезает поворот и приходит мимо данных'] },
      { sw: 'nodes', col: P.spr, head: 'Четыре шага', sub: ['каждый шаг заново узнаёт направление;', 'ломаная почти повторяет изгиб'] },
    ], [pS > 0, pB > 0, pF > 0]);
  }
  Anim.add('fm-bend', {
    W: 720, H: 340, start: 11, narrowAt: 680,
    draw(c, k, t, P) { drawBend(c, k, t, P, { plane: { x: 12, y: 12, w: 440, h: 316 }, leg: { x: 474, w: 236, titleY: 34, y0: 80, dy: 76, subDy: 25, note: { y: 306, text: ['Оранжевая стрелка на пути — направление,', 'которое сеть знает в текущей точке'] } } }); },
    narrow: {
      W: 360, H: 508,
      draw(c, k, t, P) { drawBend(c, k, t, P, { plane: { x: 8, y: 8, w: 344, h: 246 }, leg: { x: 12, w: 336, titleY: 274, y0: 306, dy: 58, subDy: 24, note: { y: 486, text: ['Оранжевая стрелка на пути — направление,', 'которое сеть знает в текущей точке'] } } }); },
    },
  });

  /* ---------- fm-pairs: прямые обучения и как из них складывается поле скоростей ---------- */
  const PX0 = [-0.95, -0.5], PX1 = [1.22, 1.08], LENS = [0, 0.5], LR = 0.3;
  const PAIRS = (() => { const r = FM.rng(17), out = []; for (let i = 0; i < 300; i++) { const cm = C2[i % 2].m; out.push([FM.randn(r), FM.randn(r), cm[0] + FM.randn(r) * 0.22, cm[1] + FM.randn(r) * 0.22]); } return out; })();
  const THRU = PAIRS.slice(0, 160).filter(([a, b, cx, cy]) => Math.hypot(0.5 * (a + cx) - LENS[0], 0.5 * (b + cy) - LENS[1]) < LR), SHOW = PAIRS.slice(0, 36);
  const GRIDF = (() => { const g = []; for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) g.push([-1.75 + 0.5 * i, -0.62 + 0.45 * j]); return g; })();
  const TB = 15.5, PB = { line: [0.3, 0.8], run: [0.9, 3.7], many: [4.1, 4.8], move: [5.0, 6.8], lens: [7.1, 7.9], avg: [8.1, 8.9], field: [10.3, 11.1], sweep: [11.8, 14.2] };
  function drawPairs(c, k, t, P, G) {
    const u = ((t % TB) + TB) % TB, Q = plane(G.plane), m = (x, y) => Q.map(x, y), S = Q.s;
    world(c, k, P, Q);
    const pLine = ease(seg(u, ...PB.line)), pRun = seg(u, ...PB.run), pMany = ease(seg(u, ...PB.many)), pMove = seg(u, ...PB.move);
    const pLens = ease(seg(u, ...PB.lens)), pAvg = ease(seg(u, ...PB.avg)), pField = ease(seg(u, ...PB.field)), pSweep = seg(u, ...PB.sweep);
    const keep = 1 - pField, tPair = u < PB.many[0] ? pRun : 0.5 * pMove, tShow = pField > 0 ? 0.5 + 0.47 * pSweep : u < PB.many[0] ? pRun : 0.5 * pMove;
    c.save(); c.beginPath(); c.roundRect(Q.x0, Q.y0, Q.w, Q.h, 8); c.clip();
    // много пар: прямые и точки x_t на них в момент t
    if (pMany > 0 && keep > 0) {
      c.globalAlpha = pMany * keep * lerp(1, 0.3, pLens);
      for (const [a, b, cx, cy] of SHOW) poly(c, [m(a, b), m(cx, cy)], alpha(P.ink3, 0.6), 1);
      if (pMove > 0) for (const [a, b, cx, cy] of SHOW) { const [x, y] = m(lerp(a, cx, 0.5 * pMove), lerp(b, cy, 0.5 * pMove)); circle(c, x, y, 2.4, P.mot); }
      c.globalAlpha = 1;
    }
    // одна пара: шум x0, точка данных x1, точка x_t бежит по прямой с постоянной скоростью
    const pairOn = pLine * (1 - pLens);
    if (pairOn > 0) {
      c.globalAlpha = pairOn;
      const [ax, ay] = m(PX0[0], PX0[1]), [bx, by] = m(PX1[0], PX1[1]), L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
      poly(c, [[ax, ay], [lerp(ax, bx, pLine), lerp(ay, by, pLine)]], P.ink2, 1.6, [5, 4]);
      circle(c, ax, ay, 6, P.surf, P.ink, 2.2); circle(c, bx, by, 4.4, P.ink);
      txt(c, k, 'x₀ — шум', ax, ay + 17, null, onPlane(P, { px: 10.5, weight: 700, color: P.ink }));
      txt(c, k, 'x₁ — данные', bx, by + 17, null, onPlane(P, { px: 10.5, weight: 700, color: P.ink }));
      if (u >= PB.run[0]) {
        const px = lerp(ax, bx, tPair), py = lerp(ay, by, tPair);
        arw(c, px, py, px + ux * 0.55 * S, py + uy * 0.55 * S, P.mot, 2.4, 9); circle(c, px, py, 4.6, P.mot);
        txt(c, k, 'x_t', px - 12, py - 12, null, onPlane(P, { px: 11, weight: 750, color: P.mot }));
        txt(c, k, 'скорость x₁ − x₀', lerp(ax, bx, 0.5) + 10, lerp(ay, by, 0.5) + 16, null, onPlane(P, { px: 10.5, weight: 700, color: P.mot, align: 'left' }));
      }
      c.globalAlpha = 1;
    }
    // круг в момент t = 0,5: прямые через одну точку и их средняя скорость
    if (pLens > 0 && keep > 0) {
      c.globalAlpha = pLens * keep;
      for (const [a, b, cx, cy] of THRU) poly(c, [m(a, b), m(cx, cy)], alpha(P.ink2, 0.45), 1.1);
      c.restore(); c.save();
      const [lx, ly] = m(LENS[0], LENS[1]); let sx = 0, sy = 0, sl = 0;
      circle(c, lx, ly, LR * S, alpha(P.surf, 0.75), P.ink, 2);
      for (const [a, b, cx, cy] of THRU) { const dx = cx - a, dy = cy - b, L = Math.hypot(dx, dy); sx += dx; sy += dy; sl += L; arw(c, lx, ly, lx + dx / L * G.lens, ly - dy / L * G.lens, alpha(P.ink2, 0.8), 1.2, 5); }
      if (pAvg > 0) { const ML = Math.hypot(sx, sy), len = G.lens * ML / sl * pAvg, ex = lx + sx / ML * len, ey = ly - sy / ML * len; arw(c, lx, ly, ex, ey, P.surf, 7.5, 14); arw(c, lx, ly, ex, ey, P.mot, 4.5, 12); }
      if (pAvg > 0) txt(c, k, 'сеть учит среднюю скорость', lx, ly - LR * S - 11, null, onPlane(P, { px: 10.5, weight: 700, color: P.mot }));
      c.globalAlpha = 1;
    }
    c.restore();
    // поле скоростей: средняя стрелка в каждой точке в момент t
    if (pField > 0) {
      c.globalAlpha = pField; const v = [0, 0];
      for (const [x, y] of GRIDF) { FM.gmmField(C2, x, y, tShow, v); const L = Math.hypot(v[0], v[1]) || 1e-9, len = clamp(0.17 * L, 0.12, 0.4) * S, [px, py] = m(x, y); arw(c, px, py, px + v[0] / L * len, py - v[1] / L * len, P.mot, 1.6, 6); }
      c.globalAlpha = 1;
    }
    if (pLine > 0) txt(c, k, `t = ${fmt(pLens > 0 && pField === 0 ? 0.5 : tShow, 2)}`, Q.map(0, 0)[0], Q.y0 + 15, null, onPlane(P, { px: 11, weight: 700, color: P.ink, mono: true }));
    rows(c, k, P, Object.assign({ title: 'Как из прямых получается поле скоростей' }, G.leg), [
      { sw: 'arrow', col: P.mot, head: 'Одна пара', sub: ['точка x_t идёт по прямой от шума x₀', 'к данным x₁ с постоянной скоростью x₁ − x₀'] },
      { sw: 'line', col: P.ink3, lw: 1.6, head: 'Много пар', sub: ['у каждой пары своя прямая; в момент t', 'все точки x_t прошли одну долю пути'] },
      { sw: 'arrow', col: P.mot, lw: 4, head: 'Прямые пересекаются', sub: ['через одну точку идут прямые к разным', 'пятнам; сеть учит их среднюю скорость'] },
      { sw: 'arrow', col: P.mot, lw: 1.6, head: 'Поле скоростей', sub: ['средняя стрелка в каждой точке;', 'в каждый момент t — свои стрелки'] },
    ], [pLine > 0, pMany > 0, pLens > 0, pField > 0]);
  }
  Anim.add('fm-pairs', {
    W: 720, H: 340, start: 9.4, narrowAt: 680,
    draw(c, k, t, P) { drawPairs(c, k, t, P, { plane: { x: 12, y: 12, w: 440, h: 316 }, lens: 54, leg: { x: 474, w: 236, titleY: 30, y0: 70, dy: 70, subDy: 24 } }); },
    narrow: {
      W: 360, H: 520,
      draw(c, k, t, P) { drawPairs(c, k, t, P, { plane: { x: 8, y: 8, w: 344, h: 246 }, lens: 44, leg: { x: 12, w: 336, titleY: 274, y0: 306, dy: 56, subDy: 23 } }); },
    },
  });

  /* ---------- fm-loop: обучение и генерация целиком, рядом — шаг денойзинга Diffusion Policy ---------- */
  const TC = 18, PC = { A: [0.2, 4.8], B: [5.0, 10.6], C: [10.8, 16.4] }, NSTEP = 4;
  /** Блок: рамка и строки текста (первая — жирная). */
  function block(c, k, P, B, lines, o) {
    o = o || {};
    rrect(c, B.x, B.y, B.w, B.h, B.r || 9, o.fill || P.surf, o.edge || P.ink2, o.lw || 1.5);
    const n = lines.length, lh = o.lh || 15, y0 = B.y + B.h / 2 - (n - 1) * lh / 2;
    lines.forEach((s, i) => txt(c, k, s, B.x + B.w / 2, y0 + i * lh, B.w - 10, { px: i ? 10.5 : 11.5, weight: i ? 600 : 750, color: i ? P.ink2 : (o.ink || P.ink) }));
  }
  const mid = (B, side) => (side === 'l' ? [B.x, B.y + B.h / 2] : side === 'r' ? [B.x + B.w, B.y + B.h / 2] : side === 't' ? [B.x + B.w / 2, B.y] : [B.x + B.w / 2, B.y + B.h]);
  /** Один ряд генерации (flow или Diffusion Policy): шум → сеть → выход сети → шаг → снова в сеть; NSTEP раз, потом пачка. */
  function genRow(c, k, P, R, u0, u, txtR, active) {
    const w = u - u0, j = clamp(Math.floor(w / 1.2), 0, NSTEP - 1), f = w - 1.2 * j, done = w >= 1.2 * NSTEP, run = active && w >= 0 && !done;
    const step = w < 0 ? 0 : done ? NSTEP : j + 1, on = (cond) => (cond ? P.ink2 : P.line);
    const inNet = run && f < 0.3, toOut = run && f >= 0.3 && f < 0.6, toStep = run && f >= 0.6 && f < 0.9, inStep = run && f >= 0.9;
    // стрелки
    const aIn = [mid(R.noise, 'r'), mid(R.net, 'l')], aOut = R.outArrow, aStep = R.stepArrow, loop = R.loop, aRes = R.resArrow;
    route(c, aIn, on(w >= 0), 1.6); route(c, aOut, on(w >= 0.3), 1.6); route(c, aStep, on(w >= 0.6), 1.6);
    route(c, loop, on(w >= 1.2), 1.6, [5, 4]); route(c, aRes, on(done), 1.6);
    if (run) {
      if (inNet) flow(c, j === 0 ? aIn : loop, f / 0.3, P.mot);
      if (toOut) flow(c, aOut, (f - 0.3) / 0.3, P.mot);
      if (toStep) flow(c, aStep, (f - 0.6) / 0.3, P.mot);
    }
    if (active && done && w < 1.2 * NSTEP + 0.6) flow(c, aRes, (w - 1.2 * NSTEP) / 0.6, P.mot);
    // блоки
    block(c, k, P, R.noise, [txtR.noise], { edge: P.ink3, lw: 1.2 });
    block(c, k, P, R.net, txtR.net, { edge: P.out, lw: run && (toOut || inNet) ? 2.6 : 1.6 });
    block(c, k, P, R.mid, [txtR.mid], { edge: P.ink3, lw: 1.2 });
    block(c, k, P, R.step, txtR.step, { edge: txtR.stepEdge(P), lw: inStep ? 2.6 : 1.6, lh: R.stepLh });
    block(c, k, P, R.res, [txtR.res], { edge: P.ink3, lw: 1.2 });
    txt(c, k, R.loopLab[3] ? txtR.loopShort : txtR.loop, R.loopLab[0], R.loopLab[1], R.loopLab[2], { px: 10, weight: 650, color: P.ink3, align: R.loopLab[3] || 'center' });
    if (step) txt(c, k, txtR.count(step), R.count[0], R.count[1], null, { px: 10.5, weight: 700, color: P.ink, mono: true, align: 'right' });
  }
  const FLOWROW = { noise: 'шум x', net: ['сеть v', 'вход: x и t'], mid: 'скорость v', step: ['сдвиг', 'x ← x + h·v'], res: 'пачка', loop: 'следующий шаг flow: t ← t + h', loopShort: 'следующий шаг', stepEdge: (P) => P.mot };
  const DPROW = { noise: 'шум x', net: ['сеть ε', 'вход: x и шаг k'], mid: 'шум ε(x, k)', step: ['формула расписания', 'оценка данных из x и ε,', 'смесь с ε для шага k − 1'], res: 'пачка', loop: 'следующий шаг денойзинга: k ← k − 1', loopShort: 'следующий шаг', stepEdge: (P) => P.ink2 };
  function drawLoop(c, k, t, P, G) {
    const u = ((t % TC) + TC) % TC, all = u >= PC.C[1], dim = (row) => (all || (u >= PC[row][0] - 0.1 && u < PC[row][1] + 0.1) ? 1 : 0.4);
    // ---------- обучение ----------
    const A = G.A, wA = u - PC.A[0], actA = !all && u < PC.A[1];
    c.globalAlpha = dim('A');
    txt(c, k, 'Обучение: регрессия на прямых', A.title[0], A.title[1], G.maxW, { px: 12.5, weight: 800, color: P.ink, align: 'left' });
    txt(c, k, A.subText, A.sub[0], A.sub[1], G.maxW, { px: 10.5, weight: 600, color: P.ink3, align: 'left' });
    const ins = [A.x0, A.x1, A.t], on = (cond) => (cond ? P.ink2 : P.line);
    ins.forEach((B, i) => route(c, A.inArrows[i], on(wA >= 0), 1.6));
    route(c, A.toNet, on(wA >= 0.8), 1.6); route(c, A.toLoss, on(wA >= 1.5), 1.6); route(c, A.target, on(wA >= 1.5), 1.6);
    route(c, A.back, wA >= 2.8 ? P.out : P.line, 1.6, [5, 4]);
    if (actA) {
      if (wA < 0.8) ins.forEach((B, i) => flow(c, A.inArrows[i], wA / 0.8, P.mot));
      else if (wA < 1.5) flow(c, A.toNet, (wA - 0.8) / 0.7, P.mot);
      else if (wA < 2.3) { flow(c, A.toLoss, (wA - 1.5) / 0.8, P.mot); flow(c, A.target, (wA - 1.5) / 0.8, P.ink2); }
      else if (wA >= 2.8 && wA < 3.7) flow(c, A.back, (wA - 2.8) / 0.9, P.out);
    }
    block(c, k, P, A.x0, ['шум x₀'], { edge: P.ink3, lw: 1.2 }); block(c, k, P, A.x1, ['данные x₁'], { edge: P.ink3, lw: 1.2 }); block(c, k, P, A.t, ['момент t'], { edge: P.ink3, lw: 1.2 });
    rrect(c, A.mix.x, A.mix.y, A.mix.w, A.mix.h, 9, P.surf, P.ink2, actA && wA >= 0.6 && wA < 1.0 ? 2.6 : 1.5);
    txt(c, k, 'точка на прямой', A.mix.x + A.mix.w / 2, A.mix.y + A.mixY[0], A.mix.w - 10, { px: 11.5, weight: 750, color: P.ink });
    txt(c, k, 'x_t = (1 − t)·x₀ + t·x₁', A.mix.x + A.mix.w / 2, A.mix.y + A.mixY[1], A.mix.w - 10, { px: 10.5, weight: 600, color: P.ink2 });
    poly(c, [[A.mix.x + 8, A.mix.y + A.mixY[2]], [A.mix.x + A.mix.w - 8, A.mix.y + A.mixY[2]]], P.grid, 1);
    txt(c, k, 'цель: x₁ − x₀', A.mix.x + A.mix.w / 2, A.mix.y + A.mixY[3], A.mix.w - 10, { px: 10.5, weight: 700, color: P.ink2 });
    block(c, k, P, A.net, ['сеть v', 'один проход'], { edge: P.out, lw: actA && wA >= 1.2 && wA < 1.7 ? 2.6 : 1.6 });
    block(c, k, P, A.loss, ['ошибка', '‖v(x_t, t) − (x₁ − x₀)‖²'], { edge: P.mot, lw: actA && wA >= 2.2 && wA < 2.9 ? 2.6 : 1.6 });
    if (A.vLab) txt(c, k, A.vLab[3], A.vLab[0], A.vLab[1], A.vLab[2], { px: 10, weight: 650, color: P.ink3 });
    if (A.tLab) txt(c, k, 'цель x₁ − x₀', A.tLab[0], A.tLab[1], A.tLab[2], { px: 10, weight: 650, color: P.ink3 });
    txt(c, k, 'Adam поправляет веса сети', A.backLab[0], A.backLab[1], A.backLab[2], { px: 10, weight: 650, color: wA >= 2.8 ? P.out : P.ink3 });
    c.globalAlpha = 1;
    poly(c, [[G.sep1[0], G.sep1[1]], [G.sep1[2], G.sep1[1]]], P.grid, 1);
    // ---------- генерация flow ----------
    const B = G.B; c.globalAlpha = dim('B');
    txt(c, k, 'Генерация: шаги flow', B.title[0], B.title[1], G.maxW, { px: 12.5, weight: 800, color: P.ink, align: 'left' });
    txt(c, k, 'каждый шаг — один проход сети и один сдвиг', B.sub[0], B.sub[1], G.maxW, { px: 10.5, weight: 600, color: P.ink3, align: 'left' });
    genRow(c, k, P, B, PC.B[0], u, Object.assign({ count: G.countText }, FLOWROW), !all && u >= PC.B[0] - 0.1 && u < PC.B[1]);
    c.globalAlpha = 1;
    poly(c, [[G.sep2[0], G.sep2[1]], [G.sep2[2], G.sep2[1]]], P.grid, 1);
    // ---------- Diffusion Policy ----------
    const D = G.C; c.globalAlpha = dim('C');
    txt(c, k, G.dpTitle, D.title[0], D.title[1], G.maxW, { px: 12.5, weight: 800, color: P.ink, align: 'left' });
    txt(c, k, G.dpSub, D.sub[0], D.sub[1], G.maxW, { px: 10.5, weight: 600, color: P.ink3, align: 'left' });
    genRow(c, k, P, D, PC.C[0], u, Object.assign({ count: G.countText }, DPROW), !all && u >= PC.C[0] - 0.1 && u < PC.C[1]);
    c.globalAlpha = 1;
  }
  /** Геометрия ряда генерации по рамкам блоков: стрелки идут между серединами сторон. */
  function rowGeom(R, horizontal) {
    const g = Object.assign({}, R);
    g.outArrow = [mid(R.net, 'r'), mid(R.mid, 'l')];
    if (horizontal) {
      g.stepArrow = [mid(R.mid, 'r'), mid(R.step, 'l')];
      g.resArrow = [mid(R.step, 'r'), mid(R.res, 'l')];
      const [bx, by] = mid(R.step, 'b'), [nx, ny] = mid(R.net, 'b'), yl = Math.max(by, ny) + 13;
      g.loop = [[bx, by], [bx, yl], [nx, yl], [nx, ny]];
    } else {
      const [mx2, my2] = mid(R.mid, 'b'); g.stepArrow = [[mx2, my2], [mx2, R.step.y]];
      g.resArrow = [mid(R.step, 'l'), mid(R.res, 'r')];
      const lx = R.net.x + 26; g.loop = [[lx, R.step.y], [lx, R.net.y + R.net.h]];
    }
    return g;
  }
  const countW = (n) => `шаг ${n} из ${NSTEP} · проходов сети: ${n}`, countN = (n) => `шаг ${n} из ${NSTEP}`;
  const WIDE = {
    maxW: 440, sep1: [10, 152, 710], sep2: [10, 290, 710], countText: countW,
    dpTitle: 'Diffusion Policy из урока 1.5: шаги денойзинга', dpSub: 'тоже один проход сети на шаг, но сеть выдаёт шум',
    A: { title: [14, 20], sub: [14, 37], subText: 'один шаг обучения; пары и моменты t каждый раз новые',
      x0: { x: 14, y: 56, w: 104, h: 24 }, x1: { x: 14, y: 86, w: 104, h: 24 }, t: { x: 14, y: 116, w: 104, h: 24 },
      mix: { x: 150, y: 54, w: 190, h: 86 }, mixY: [17, 36, 52, 69],
      net: { x: 374, y: 58, w: 96, h: 46 }, loss: { x: 590, y: 58, w: 118, h: 76 },
      inArrows: [[[118, 68], [150, 76]], [[118, 98], [150, 98]], [[118, 128], [150, 120]]],
      toNet: [[340, 81], [374, 81]], toLoss: [[470, 81], [590, 81]], target: [[340, 123], [590, 123]],
      back: [[649, 58], [649, 47], [422, 47], [422, 58]],
      vLab: [530, 71, 112, 'скорость v(x_t, t)'], tLab: [530, 113, 110], backLab: [536, 37, 220] },
    B: rowGeom({ title: [14, 172], sub: [14, 189], count: [706, 172],
      noise: { x: 14, y: 214, w: 100, h: 28 }, net: { x: 150, y: 208, w: 112, h: 40 }, mid: { x: 298, y: 214, w: 104, h: 28 },
      step: { x: 438, y: 208, w: 148, h: 40 }, res: { x: 618, y: 214, w: 90, h: 28 }, stepLh: 15, loopLab: [358, 275, 300] }, true),
    C: rowGeom({ title: [14, 310], sub: [14, 327], count: [706, 310],
      noise: { x: 14, y: 352, w: 100, h: 28 }, net: { x: 150, y: 346, w: 112, h: 40 }, mid: { x: 298, y: 352, w: 104, h: 28 },
      step: { x: 438, y: 340, w: 148, h: 52 }, res: { x: 618, y: 352, w: 90, h: 28 }, stepLh: 14, loopLab: [358, 419, 300] }, true),
  };
  const NARROW = {
    maxW: 336, sep1: [10, 300, 350], sep2: [10, 470, 350], countText: countN,
    dpTitle: 'Diffusion Policy, урок 1.5', dpSub: 'шаги денойзинга: сеть выдаёт шум',
    A: { title: [12, 16], sub: [12, 39], subText: ['один шаг обучения; пары и моменты t', 'каждый раз новые'],
      x0: { x: 12, y: 60, w: 104, h: 24 }, x1: { x: 128, y: 60, w: 104, h: 24 }, t: { x: 244, y: 60, w: 104, h: 24 },
      mix: { x: 12, y: 102, w: 336, h: 72 }, mixY: [14, 31, 45, 59],
      net: { x: 12, y: 196, w: 140, h: 44 }, loss: { x: 196, y: 196, w: 152, h: 62 },
      inArrows: [[[64, 84], [64, 102]], [[180, 84], [180, 102]], [[296, 84], [296, 102]]],
      toNet: [[82, 174], [82, 196]], toLoss: [[152, 218], [196, 218]], target: [[272, 174], [272, 196]],
      back: [[272, 258], [272, 270], [82, 270], [82, 240]],
      vLab: [174, 208, 40, 'v'], tLab: null, backLab: [180, 283, 300] },
    B: rowGeom({ title: [12, 318], sub: [12, 335], count: [348, 318],
      noise: { x: 12, y: 360, w: 84, h: 28 }, net: { x: 118, y: 354, w: 112, h: 40 }, mid: { x: 252, y: 360, w: 96, h: 28 },
      step: { x: 118, y: 416, w: 230, h: 40 }, res: { x: 12, y: 422, w: 84, h: 28 }, stepLh: 15, loopLab: [152, 405, 90, 'left'] }, false),
    C: rowGeom({ title: [12, 488], sub: [12, 505], count: [348, 488],
      noise: { x: 12, y: 530, w: 84, h: 28 }, net: { x: 118, y: 524, w: 112, h: 40 }, mid: { x: 252, y: 530, w: 96, h: 28 },
      step: { x: 118, y: 586, w: 230, h: 52 }, res: { x: 12, y: 598, w: 84, h: 28 }, stepLh: 14, loopLab: [152, 575, 90, 'left'] }, false),
  };
  Anim.add('fm-loop', {
    W: 720, H: 432, start: 17, narrowAt: 680,
    draw(c, k, t, P) { drawLoop(c, k, t, P, WIDE); },
    narrow: { W: 360, H: 652, draw(c, k, t, P) { drawLoop(c, k, t, P, NARROW); } },
  });
})();

/* ---------- Задача: четыре способа построить пачку ---------- */
function initSort() {
  $('#stepSort').classList.add('step-sort');
  return Cards.sort('#stepSort', {
    targets: [{ id: 'dp', label: 'Диффузия · 1.4–1.5' }, { id: 'act', label: 'ACT · 1.7' }, { id: 'fm', label: 'Flow matching' }, { id: 'rf', label: 'Flow matching + reflow' }],
    items: [
      { id: 'dpEps', label: 'Сеть предсказывает шум, а шаг считают по формуле расписания', target: 'dp', why: 'Так шагает DDIM в уроках 1.4 и 1.5: из предсказанного шума — оценка данных, потом её смешивают с тем же шумом.' },
      { id: 'dpDiv', label: 'Оценку данных получает делением на долю сигнала, и на крупном шаге ошибка сети растёт', target: 'dp', why: 'В лаборатории 3 диффузия за один шаг разбросала точки по всей сцене: в начале пути доля сигнала около 0,006.' },
      { id: 'actOne', label: 'Вся пачка за один проход сети, без шума на входе', target: 'act', why: 'Декодер ACT выдаёт все действия пачки сразу, по запросу на каждое (урок 1.7).' },
      { id: 'actZ', label: 'На роботе z = 0, и в одной и той же ситуации пачка всегда одна', target: 'act', why: 'Энкодер CVAE работает только при обучении, поэтому выбирать между манерами ACT не умеет.' },
      { id: 'fmPair', label: 'Учится скорости на прямой между случайным шумом и случайной точкой данных', target: 'fm', why: 'Это обычный flow matching: пары случайные, обучение — регрессия.' },
      { id: 'fmCurve', label: 'Каждая обучающая пара — прямая, а пути генерации всё равно кривые', target: 'fm', why: 'Прямые разных пар пересекаются, поле — их среднее, поэтому первый шаг из шума ведёт в среднее данных (лаборатории 1, 3 и 5).' },
      { id: 'rfPair', label: 'Учится на парах «шум — точка, куда его привела обученная модель»', target: 'rf', why: 'Пары reflow строит сама модель, и их прямые почти не пересекаются.' },
      { id: 'rfCost', label: 'Одного шага почти хватает, но нужно ещё одно обучение', target: 'rf', why: 'В лаборатории 4 выпрямленная модель за один шаг клала в пятна около двух третей точек, а платить пришлось парами и ещё одним обучением.' },
    ],
    after: 'ACT быстрее всех, но выбирать между манерами не умеет. Диффузия и flow matching выбирают манеру по начальному шуму, но делают по несколько проходов сети на пачку. Reflow сокращает число шагов flow почти до одного, а платят за это ещё одним обучением.',
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
    { q: 'Flow matching — совсем другое семейство моделей, чем диффузия?', o: ['Да: flow matching обходится без шума', 'Нет: шаг DDIM — тот же шаг Эйлера, разные расписание и выход сети', 'Нет, это просто другое имя DDPM'], a: 1, e: 'При гауссовом шуме это одно семейство: сэмплер DDIM совпадает с методом Эйлера, а модели отличаются расписанием шума и тем, что предсказывает сеть. Поэтому в лаборатории 3 диффузии понадобилось больше шагов.' },
    { q: 'Обучающие пути flow matching — прямые. Значит, хватает одного шага Эйлера?', o: ['Да: прямую проходят одним шагом', 'Нет: поле — среднее пересекающихся прямых, и пути генерации кривые', 'Нет, метод Эйлера для flow matching не годится'], a: 1, e: 'Прямые только отдельные пары. Через одну точку идут прямые к разным данным, поле — их среднее, и один шаг из шума ведёт в среднее данных: в лабораториях 1 и 3 он собирал весь шум в одну точку.' },
    { q: 'Ошибка обучения flow matching должна упасть почти до нуля?', o: ['Да, иначе сеть недоучена', 'Нет: цель x₁ − x₀ для одной точки x_t случайна, и разброс остаётся', 'Нет, она растёт по ходу обучения'], a: 1, e: 'Через одну точку проходят прямые к разным пятнам и от разных точек шума. Сеть выучивает среднее их скоростей, а разброс вокруг среднего остаётся ошибкой даже у идеального поля — это пунктир в лаборатории 2.' },
    { q: 'Сеть flow matching, как и сеть Diffusion Policy, предсказывает шум?', o: ['Да, а скорость потом считают из шума', 'Нет: она сразу выдаёт скорость, и шаг — сдвиг по ней', 'Нет, она сразу выдаёт готовую пачку'], a: 1, e: 'В Diffusion Policy сеть выдаёт шум, и новую пачку считают по формуле расписания. Flow-сеть выдаёт скорость, и шаг flow — это x + h·v: один проход сети и один сдвиг.' },
    { q: 'Reflow достаётся бесплатно?', o: ['Да, это просто другой сэмплер', 'Нет: нужны пары от исходной модели и ещё одно обучение', 'Нет, ему нужны новые демонстрации от людей'], a: 1, e: 'Пары строит исходная модель за много шагов, а выпрямленную сеть обучают ещё раз. Ошибки исходной модели переходят в пары, поэтому на большом числе шагов выпрямленная модель рисует чуть хуже — в лаборатории 4 это видно при 100 шагах.' },
    { q: 'Пары reflow — это шум и ближайшая к нему точка данных?', o: ['Да, так прямые выходят короче', 'Нет: это шум и точка, куда его привела обученная модель', 'Нет, это две случайные точки данных'], a: 1, e: 'Reflow проводит из каждой точки шума генерацию обученной моделью и берёт начало и конец пути. Пути модели не пересекаются, поэтому прямые таких пар почти не пересекаются и сети почти нечего усреднять.' },
    { q: 'π0 делает 10 шагов flow. Если сократить их до одного, задержка упадёт в 10 раз?', o: ['Да, задержка пропорциональна числу шагов', 'Нет: шаги эксперта дешёвые, основное время — проход по наблюдению', 'Нет, она вырастет'], a: 1, e: 'Картинки и текст считаются один раз за пачку и лежат в кэше, а шаги делает маленький эксперт действий. В лаборатории 5 один шаг вместо десяти сэкономил около трети задержки.' },
    { q: 'ACT выдаёт пачку за один проход. Значит, flow matching роботам не нужен?', o: ['Да: один проход всегда лучше нескольких', 'Нет: ACT не выбирает между манерами, а flow matching выбирает, как диффузия', 'Нет, ACT не умеет выдавать пачки'], a: 1, e: 'На роботе ACT подаёт z = 0, и в одной ситуации пачка всегда одна. Flow matching, как диффузия, выбирает манеру по начальному шуму и при этом обходится немногими шагами.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('a', () => { mis.a = LabA.init(); }); safe('b', () => { mis.b = LabB.init(); }); safe('c', () => { mis.c = LabC.init(); });
    safe('d', () => { mis.d = LabD.init(); }); safe('e', () => { mis.e = LabE.init(); });
    safe('sort', () => { mis.sort = initSort(); }); safe('quiz', initQuiz);
    safe('count', () => { const n = ['a', 'b', 'c', 'd', 'e'].reduce((s, k) => s + (mis[k] ? $$('#' + k + 'Mis .g-steps li').length - 1 : 0), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l18 = { mis, SPEED, Store, LabA, LabB, LabC, LabD, LabE, FM }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
