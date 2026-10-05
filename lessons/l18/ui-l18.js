/* =====================================================================
   ui-l18.js — урок 1.8 «Flow matching». Интерактивы — миссии на живой
   сцене (shared/missions.js):
   1) два пятна и точное поле: путь зонда, один шаг, лупа над прямыми;
   2) живое обучение поля скоростей: стрелки, кривая ошибки, момент разворота;
   3) диффузия и flow рядом: ползунок шагов и кривая качества;
   4) reflow: пересечения пар, выпрямление до одного шага, цена;
   5) пачка из 50 действий в стиле π0: шаги Эйлера, задержка и бюджет.
   Ниже — задача на сортировку (shared/cards.js) и квиз. Движок — l18/engine.js.
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
    if (st.probeOn) parts.push(`Путь зонда: ${pt(st.path[0])} → ${pt(s.endPt)}, <b>${s.end === 'left' ? 'левое пятно' : s.end === 'right' ? 'правое пятно' : 'мимо пятен'}</b> · отклонение от прямой ${fmt(s.bend, 2)}`);
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
    { short: 'Один шаг', title: 'Один шаг вместо двухсот', text: 'Путь зонда собран из 200 маленьких шагов Эйлера. Будь он прямым, один шаг привёл бы туда же. Но путь изогнут. Сделаем один шаг длиной во всё время, от t = 0 до t = 1, сразу для всех 60 точек шума.',
      onEnter: () => { st.lensOn = false; st.probeOn = true; draw(); },
      bet: { q: 'где окажутся точки после одного шага?', options: ['Каждая в своём пятне', 'Все в одной точке между пятнами', 'Останутся на месте'], answer: () => 1 },
      action: { label: 'Сделать один шаг', run: (X) => X.jump() },
      explain: (r) => `Все 60 точек пришли в одну точку (${fmt(r.land[0], 2)}; ${fmt(r.land[1], 2)}) — в среднее данных, ровно между пятнами. В момент t = 0 шум ещё ничего не говорит о том, к какому пятну идти, и лучшая оценка скорости ведёт к среднему: v(x, 0) = E[x₁] − x. Один шаг длиной во всё время превращает любой шум в среднее. Так же ошибалась регрессия в уроке 1.3: среднее объездов слева и справа вело Аду прямо в чайник.` },
    { short: 'Лупа', title: 'Найди, где обучающие прямые спорят', text: 'Откуда берётся среднее, видно по самим обучающим парам — мы их включили. Серые точки — где каждая пара находится в середине пути, при t = 0,5. Перетащи лупу туда, где прямые идут в разные стороны: стрелки в лупе — их направления, оранжевая — среднее, которое выучит сеть.',
      controls: ['pairs'], onEnter: () => { st.lensOn = true; st.probeOn = false; st.pairs = true; $('#aPairs').checked = true; st.jump = 0; draw(); },
      criteria: [{ label: 'В лупе не меньше 8 прямых', test: (r, s) => s.n >= 8 }, { label: 'Их направления согласованы меньше чем на 50%', test: (r, s) => s.n >= 8 && s.agree < 0.5 }],
      hint: 'Прямые к левому и правому пятну встречаются посередине, между двумя облаками серых точек.',
      explain: (s) => `В лупе ${nWord(s.n, 'прямая', 'прямые', 'прямых')}: ${s.lens.L} к левому пятну и ${s.lens.R} к правому. Их среднее смотрит почти вертикально вверх, в пустоту между пятнами, и оно заметно короче отдельных прямых: согласие ${pc(s.agree, 0)}. Именно это среднее выучит сеть. Поэтому путь из такой точки идёт посередине и сворачивает поздно, а крупные шаги срезают поворот.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Таскай точку шума и лупу, включай и выключай обучающие пары. Найди точку, путь которой изгибается сильнее всего, и сравни, что в этом месте показывает лупа.', final: true,
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
    { short: 'Обучение', title: 'Обучи поле скоростей', text: 'Сеть начинает со случайных весов. Нажми кнопку и смотри, как стрелки складываются в поле, а кривая ошибки ползёт вниз. Пунктир — ошибка идеального поля, посчитанного по точной формуле.',
      bet: { q: 'до какого значения опустится ошибка обучения?', options: ['Почти до нуля', 'Остановится около двух', 'Будет только расти'], answer: () => 1 },
      action: { label: 'Обучить сеть', run: (X) => X.train() },
      explain: (r) => `Ошибка остановилась около ${fmt(r.loss, 2)}, а у идеального поля она ${fmt(r.floor, 2)}. Ниже не опуститься никакой сети, и причина та же, что в лаборатории 1: через одну точку x_t проходят прямые к разным пятнам, и цель x₁ − x₀ для неё случайна. Сеть выучивает среднее этих целей, а разброс вокруг среднего остаётся ошибкой. Поэтому по кривой обучения трудно судить, хорошо ли модель рисует: смотреть нужно на сэмплы.` },
    { short: 'Разворот', title: 'Найди момент разворота', text: 'В лаборатории 1 поле в начале пути вело к среднему данных, а здесь среднее — центр кольца. Двигай время t, начиная с нуля. Серые стрелки тянут к центру, оранжевые — от центра, чёрные точки — облако шума, которое сеть довела до момента t. Найди момент, когда стрелки внутри кольца впервые развернутся наружу.', controls: ['t', 'parts'],
      onEnter: (X) => { if (Store.st.fm) X.setT(0); },
      criteria: [{ label: 'Внутри кольца стрелки смотрят от центра', test: (r, s) => s.trained && s.radial > 0 }, { label: 'При t на 0,05 меньше они ещё смотрели к центру', test: (r, s) => s.trained && s.radialPrev <= 0 }],
      hint: 'Следи за стрелками у самого центра. До середины пути они серые.',
      explain: (s) => `Разворот — в момент t = ${fmt(s.t, 2)}. До него шум сильнее сигнала, и лучший ответ сети — среднее всех данных, то есть центр кольца: облако шума сжимается. После сеть уже различает, к какому пятну ближе точка, и выталкивает её наружу. Путь точки, которая стартовала внутри кольца, — петля: сначала к центру, потом обратно. Один шаг из t = 0 целиком идёт по первому направлению — к центру.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Листай время и включай облако шума. Посмотри, где стрелки длиннее всего в конце пути и как облако собирается в пятна.', final: true },
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
      explain: (s) => `Диффузии понадобилось ${nWord(s.N, 'шаг', 'шага', 'шагов')}, вдвое больше, чем flow. При этом flow и диффузия — одно семейство: шаг DDIM — тот же шаг Эйлера, только по другому расписанию и с другой целью обучения. Разницу дают две вещи. Первая — расписание: у DDPM к середине пути от данных остаётся меньше трети амплитуды, и равномерная сетка тратит много шагов почти на чистый шум. Вторая — что предсказывает сеть: оценка данных из предсказанного шума при сильном шуме усиливает ошибки сети. Подробности — в блоке «Под капотом».` },
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
    { short: 'Цена', title: 'Сколько стоит выпрямление', text: 'Сколько шагов вывода экономит reflow? Двигай число шагов исходной модели и найди, сколько шагов ей нужно, чтобы догнать выпрямленную с её одним шагом.', controls: ['n'],
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
    c.beginPath(); c.arc(s0.x, s0.y, 7, 0, 7); c.fillStyle = P.ink; c.fill(); HeroKit.label(c, k, 'захват сейчас', 8, s0.y + 22, { align: 'left', color: P.ink2, px: 11.5, haloColor: P.bg });
    HeroKit.label(c, k, '1 с →', W - 8, s1.y + 22, { align: 'right', color: P.ink3, px: 11.5, mono: true, haloColor: P.bg });
    // пачки
    for (let kk = 0; kk < 20; kk++) {
      const good = st.frame ? true : g.checks[kk].gap >= 0.02;
      c.strokeStyle = good ? P.e2e : P.bad; c.globalAlpha = st.frame ? 0.55 : 0.75; c.lineWidth = good ? 1.6 : 2.2; c.beginPath();
      for (let i = 0; i < CH.H; i++) { const p = map(FM.chunkX(i), Math.max(-0.17, Math.min(0.17, fr[kk * CH.H + i] * CH.SCALE))); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
      c.stroke();
    }
    c.globalAlpha = 1;
    HeroKit.label(c, k, 'чайник', kc.x, kc.y - kr * 0.45, { color: P.ink, px: 12, weight: 700, haloColor: P.surf });
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
    { short: '73 мс', title: 'Из чего складываются 73 мс', text: 'Сначала узнаем, сколько стоят сами шаги. Калькулятор под сценой собран из разбивки задержки π0 на RTX 4090 с тремя камерами: энкодеры картинок, проход по наблюдению и шаги эксперта действий.',
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
      explain: (s) => `Хватает ${nWord(s.N, 'шага', 'шагов', 'шагов')}. На первом шаге пачка тянется к среднему демонстраций, на следующих уже видно, к какой стороне она ближе, и пачка уходит туда. С двумя шагами чайник задевают ${gen(2).hit} пачки из 20, с тремя самая близкая проходит в ${fmt(gen(3).gap * 100, 1)} см. Поле здесь точное, без ошибок обучения. Настоящие головы действий делают 4–10 шагов: GR00T N1 — 4, π0.7 — 5, π0 — 10.` },
    { short: 'Бюджет', title: 'Уложись в бюджет', text: 'Ада исполняет 25 действий из пачки (0,5 с) и стоит, пока считается следующая. Стоять она может не больше 15% времени. Видеокарта на борту слабая, поэтому модель переезжает на сервер: включи переключатель, это ещё 13 мс на сеть. Сейчас модель делает 16 шагов. Подбери число шагов так, чтобы уложиться в бюджет и по-прежнему объезжать чайник.', controls: ['n', 'srv'],
      onEnter: (X) => { st.budget = true; X.setSrv(false); X.setN(16); },
      criteria: [{ label: 'Модель считается на сервере', test: (r, s) => s.srv }, { label: 'Робот стоит не больше 15% времени', test: (r, s) => s.srv && s.idle <= BUDGET }, { label: 'Все 20 пачек проходят не ближе 2 см от чайника', test: (r, s) => s.ok === 20 }],
      hint: 'Пунктир на полоске задержки — граница 15%. Сначала найди, где кончается бюджет, потом проверь объезд.',
      explain: (s) => `Подходит от 4 до 10 шагов. На 10 шагах вывод на сервере занимает ${fmt(FM.latency(10, true), 0)} мс, простой — ${pc(FM.idle(FM.latency(10, true)))}: столько тратит π0 вне робота. На 11 шагах простой уже ${pc(FM.idle(FM.latency(11, true)))}. В асинхронном режиме из урока 1.7 робот не стоит, но задержка не исчезает: пока считается новая пачка, действия уходят по старой.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число шагов и место расчёта модели. Посмотри, как пачка превращается из шума в движение: при каждом изменении числа шагов сцена проигрывает все шаги.', final: true, onEnter: () => { st.budget = true; draw(); } },
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

/* ---------- Задача: кто сколько шагов делает ---------- */
function initSort() {
  $('#stepSort').classList.add('step-sort');
  return Cards.sort('#stepSort', {
    targets: [{ id: 's1', label: '1 шаг' }, { id: 's45', label: '4–5 шагов' }, { id: 's10', label: '10 шагов' }, { id: 's16', label: '16 и больше' }],
    items: [
      { id: 'flowp', label: 'FlowPolicy · consistency flow matching', target: 's1', why: 'Один шаг: 19,9 мс против 145,7 мс у DP3.' },
      { id: 'mp1', label: 'MP1 · MeanFlow', target: 's1', why: 'Один шаг, 6,8 мс на RTX 4090.' },
      { id: 'groot', label: 'GR00T N1 · flow matching', target: 's45', why: '4 шага: пачка из 16 действий за 63,9 мс на L40.' },
      { id: 'pi07', label: 'π0.7 · flow matching', target: 's45', why: '5 шагов на пачку из 50 действий.' },
      { id: 'rdt', label: 'RDT-1B · DPM-Solver++', target: 's45', why: '5 шагов DPM-Solver++ вместо 100.' },
      { id: 'pi0', label: 'π0 · flow matching', target: 's10', why: '10 шагов Эйлера с δ = 0,1; 73 мс на RTX 4090.' },
      { id: 'pi05', label: 'π0.5 · flow matching', target: 's10', why: '10 шагов после того, как модель допишет текст подзадачи.' },
      { id: 'smol', label: 'SmolVLA · flow matching', target: 's10', why: '10 шагов, эксперт действий около 100 млн параметров.' },
      { id: 'umi', label: 'UMI · DDIM', target: 's16', why: '16 шагов DDIM.' },
      { id: 'octo', label: 'Octo · DDPM', target: 's16', why: '20 шагов DDPM.' },
      { id: 'aloha', label: 'ALOHA Unleashed · DDIM', target: 's16', why: '50 шагов, 43 мс на RTX 4090.' },
    ],
    after: 'У больших VLA головы на flow matching делают 4–10 шагов. Диффузионные политики с DDPM и DDIM в этой выборке — от 16 до 50. Один шаг дают новые цели обучения вроде consistency и MeanFlow, но в больших VLA они пока не стандарт.',
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
    { q: 'Flow matching — совсем другое семейство моделей, чем диффузия?', o: ['Да, общего с диффузией у него нет', 'Нет: при гауссовом шуме это та же модель с другим расписанием и другой целью, а шаг DDIM — шаг Эйлера', 'Да: flow matching обходится без шума'], a: 1, e: 'Gao и соавторы показывают, что сэмплер DDIM совпадает с методом Эйлера, а модели отличаются расписанием шума, тем, что предсказывает сеть, и весами ошибки. В лаборатории 3 диффузии понадобилось больше шагов именно поэтому.' },
    { q: 'Обучающие пути flow matching — прямые. Значит, хватает одного шага Эйлера?', o: ['Да, прямую проходят одним шагом', 'Нет: прямые только пути отдельных пар, поле — их среднее, и пути генерации кривые; один шаг ведёт в среднее данных', 'Нет, метод Эйлера для flow matching не годится'], a: 1, e: 'В лабораториях 1 и 3 один шаг собирал весь шум в одну точку. Авторы MeanFlow пишут о том же: даже при прямых условных путях общее поле обычно даёт кривые траектории.' },
    { q: 'Ошибка обучения flow matching должна упасть почти до нуля?', o: ['Да, иначе сеть недоучена', 'Нет: цель x₁ − x₀ для одной точки x_t случайна, и даже идеальное поле оставляет большую ошибку', 'Нет, она растёт по ходу обучения'], a: 1, e: 'В лаборатории 2 ошибка остановилась около 1,93, а у идеального поля, посчитанного по точной формуле, она 1,87.' },
    { q: 'Чтобы обучить flow matching, на каждом шаге обучения решают дифференциальное уравнение?', o: ['Да, как в нейронных ОДУ', 'Нет: обучение — регрессия по точкам на прямых между шумом и данными; уравнение решают только при генерации', 'Нет, уравнения в методе нет вовсе'], a: 1, e: 'Lipman и соавторы называют свой метод simulation-free: шаг обучения — точка на прямой и одна цель. Уравнение появляется при генерации и при построении пар для reflow.' },
    { q: 'Reflow достаётся бесплатно?', o: ['Да, это просто другой сэмплер', 'Нет: пары нужно сгенерировать моделью за много шагов и обучить сеть ещё раз; на большом числе шагов качество немного падает', 'Нет, ему нужны новые демонстрации от людей'], a: 1, e: 'У Liu и соавторов на CIFAR-10 FID на точном решателе вырос с 2,58 до 3,36 после первого reflow. InstaFlow потратила 199 GPU-дней на A100, чтобы выпрямить Stable Diffusion и дистиллировать её в один шаг.' },
    { q: 'Что занимает большую часть задержки π0?', o: ['Десять шагов flow matching', 'Проход по картинкам и тексту: 46 из 73 мс, а все 10 шагов эксперта — 27 мс', 'Передача данных по сети'], a: 1, e: 'Наблюдение считается один раз и лежит в кэше, а эксперт действий маленький. Поэтому сокращение числа шагов экономит меньше, чем кажется.' },
    { q: 'В статье π0 τ = 0 — шум. В коде openpi так же?', o: ['Да', 'Нет: в коде t = 1 — шум, генерация идёт от 1 к 0 с шагом −0,1', 'В коде нет понятия времени'], a: 1, e: 'Авторы openpi прямо пишут в комментарии, что конвенция противоположна статье. SD3 и MeanFlow тоже ставят шум в t = 1, а Lipman, Liu и наш курс — в t = 0.' },
    { q: 'Пути оптимального транспорта у Lipman — это когда шум и данные спаривают оптимальным транспортом внутри батча?', o: ['Да', 'Нет: это условный путь — прямая от гауссианы шума к одной точке данных; спаривание в батче позже предложили Tong и соавторы и Pooladian и соавторы', 'Это другое название reflow'], a: 1, e: 'Lipman и соавторы оговаривают, что условный поток оптимален, но общее поле от этого не становится решением задачи транспорта. Минибатч-спаривание (OT-CFM) выпрямляет пути и помогает при малом числе шагов.' },
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
