/* =====================================================================
   ui-l14.js — урок 1.4 «Диффузионные модели». Интерактивы — миссии на
   живых сценах (shared/missions.js):
   «Спирали и ᾱ_t» — график со сменой шкалы;
   «Куда указывает денойзер» — стрелки идеального денойзера («мысли» модели);
   лаборатория — сеть учится в браузере, DDPM и DDIM рядом на одной сети,
   граница бассейнов перетаскиванием стартов;
   «Генерация по заказу» — кривая «точность — разнообразие», которую строишь сам;
   «Память или обобщение» — шторка «идеальный денойзер — сеть»;
   «Те же точки, но это действия Ады» — денойзер лаборатории на действиях
   объезда чайника, рядом регрессия; квиз.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
const DF = window.Diff;
const DATA = DF.spirals(1000, 7), NN = DF.nnIndex(DATA, 0.1), RM = DF.medianRadius(DATA);
const MEAN = (() => { let x = 0, y = 0; for (let i = 0; i < DATA.N; i++) { x += DATA.X[2 * i]; y += DATA.X[2 * i + 1]; } return { x: x / DATA.N, y: y / DATA.N }; })();
const SCH = { lin: DF.schedule('lin'), cos: DF.schedule('cos') };

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

/* ---------- форматирование и общие помощники ---------- */
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fx = (v, d) => (+v).toFixed(d == null ? 1 : d).replace('.', ',').replace('-', '−');
const pc = (v, d) => fx(v * 100, d || 0) + '%';
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(v) { const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); return `${fx(m, 1)}·10${String(e).split('').map((ch) => SUP[ch]).join('')}`; }
function fmtA(a) { if (a >= 0.995) return '1'; if (a >= 0.1) return fx(a, 2); if (a >= 0.01) return fx(a, 3); if (a >= 0.001) return fx(a, 4); return sci(a); }
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
/** Подписи под канвасом: [текст, цвет, вид] — вид: undefined (линия), 'dash', 'dot', 'ring', 'box'. */
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => {
    const st = kind === 'dot' ? `--c:${col};width:9px;height:9px;border-radius:50%` : kind === 'ring' ? `width:10px;height:10px;border-radius:50%;background:transparent;border:2px solid ${col}` : kind === 'box' ? `--c:${col};width:14px;height:10px;border-radius:3px` : `--c:${col}`;
    box.append(h('span', null, h('i', { class: kind === 'dash' ? 'dash' : null, style: st }), t));
  });
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
/** Квадратная сцена: мировые координаты [−E; E]² → логические пиксели W×W. */
function mkMap(W, E) { const S = W / (2 * E); return { W, E, S, map: (x, y) => ({ x: W / 2 + x * S, y: W / 2 - y * S }), inv: (px, py) => ({ x: (px - W / 2) / S, y: (W / 2 - py) / S }) }; }
/** Много точек одним путём. */
function dots(c, pts, n, M, r, color, alpha) {
  c.globalAlpha = alpha == null ? 1 : alpha; c.fillStyle = color; c.beginPath();
  for (let k = 0; k < n; k++) { const x = M.W / 2 + pts[2 * k] * M.S, y = M.W / 2 - pts[2 * k + 1] * M.S; if (x < -4 || y < -4 || x > M.W + 4 || y > M.W + 4) continue; c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283); }
  c.fill(); c.globalAlpha = 1;
}
/** Обучающие точки двумя тонами: спираль 1 темнее, спираль 2 светлее. hi — заказанная спираль (её ярче). */
function drawData(c, M, P, o) {
  o = o || {}; const r = o.r || 1.5, a1 = o.hi === 1 ? 0.16 : o.a1 || 0.5, a2 = o.hi === 0 ? 0.13 : o.a2 || 0.22, X = o.pts || DATA.X, lab = DATA.lab;
  for (const [k, al] of [[0, a1], [1, a2]]) {
    c.globalAlpha = al; c.fillStyle = P.ink3; c.beginPath();
    for (let i = 0; i < DATA.N; i++) { if (lab[i] !== k) continue; const x = M.W / 2 + X[2 * i] * M.S, y = M.W / 2 - X[2 * i + 1] * M.S; c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283); }
    c.fill();
  }
  c.globalAlpha = 1;
}
function sceneBase(cv, M) { const { c, k } = HeroKit.fit(cv, M.W, M.W), P = pal(); c.fillStyle = P.bg; c.fillRect(0, 0, M.W, M.W); HeroKit.grid(c, M.W, M.W, M.W / 20, P.grid); return { c, k, P }; }
function status(c, k, P, text, W) { HeroKit.label(c, k, text, 10 * k, 15 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg }); }
function spiralTags(c, k, P, M) {
  for (const s of [0, 1]) { const p = DF.spiralPt(s, 1), q = M.map(p[0] * 1.13, p[1] * 1.13); HeroKit.label(c, k, `спираль ${s + 1}`, q.x, q.y, { color: P.ink2, px: 11.5, weight: 700, haloColor: P.bg }); }
}
/** Анимация по времени: onFrame(p ∈ [0, 1]); конец — по таймеру, даже если вкладка не видна. */
function animate(ms, onFrame) {
  return new Promise((res) => {
    const t0 = performance.now(), dur = Math.max(1, ms / SPEED.k); let done = false;
    const end = () => { if (done) return; done = true; onFrame(1); res(); };
    const tick = (now) => { if (done) return; const p = Math.max(0, Math.min(1, (now - t0) / dur)); onFrame(p); if (p < 1) requestAnimationFrame(tick); else end(); };
    requestAnimationFrame(tick); setTimeout(end, dur + 120);
  });
}
const throttle = (fn, ms) => { let last = 0; return (force) => { const now = performance.now(); if (force || now - last > ms) { last = now; fn(); } }; };
/** Подписи осей графика: на узком экране логическая высота больше, чтобы подписи не слипались. */
function plotFit(cv, W, H, Hn) {
  const hh = cv.getBoundingClientRect().width < 460 ? Hn : H, ar = `${W} / ${hh}`;
  if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
  const f = HeroKit.fit(cv, W, hh); return { c: f.c, k: f.k, H: hh };
}
function axes(c, k, P, box, xt, yt, x, y) {
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const [v, t] of yt) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, t, box.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
  const ly = box.b + Math.max(13, 9 * k);
  for (const [v, t, al] of xt) HeroKit.label(c, k, t, x(v), ly, { align: al || 'center', px: 10.5, mono: true, color: P.ink3, halo: false });
}
const ang = (ax, ay, bx, by) => { const cc = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) + 1e-12); return Math.acos(Math.max(-1, Math.min(1, cc))) * 180 / Math.PI; };

/* =====================================================================
   0. Схема замысла (shared/anim.js, ключ 'cycle'): прямой путь — к точкам
   спиралей шаг за шагом добавляют шум, пока не останется облако; обратный —
   сеть убирает шум шаг за шагом из нового случайного облака и получает новые
   точки на спиралях. Верхний ряд (на телефоне — левый столбец) — снимки
   прямого процесса на шагах 0, 250, 500, 750, 1000 для 220 точек данных;
   нижний ряд (правый столбец) — генерация идеальным денойзером из раздела 3
   (DDIM без свежего шума, 51 шаг: квадратичная сетка на 50 шагов плюс моменты
   750 и 500) из нового шума, снимки на тех же шагах. Кадры считаются один раз.
   ===================================================================== */
const Cycle = (() => {
  const TS = [0, 250, 500, 750, 1000], NPT = 220, E = 2.9, T = 12.4, PH = { f0: 0.4, f1: 5.4, b0: 6.2, b1: 11.2 };
  let F = null;
  function backFrames(x0) {
    const ab = SCH.lin.abar, eps = DF.exactEps(DATA, SCH.lin), n = NPT, x = Float64Array.from(x0), out = { 1000: Float32Array.from(x) };
    const ts = []; for (let i = 50; i >= 0; i--) ts.push(Math.round(1000 * (i / 50) * (i / 50)));
    for (const t of [750, 500]) if (!ts.includes(t)) ts.push(t);
    ts.sort((a, b) => b - a);
    const mom = ts.filter((t, i) => i === 0 || t !== ts[i - 1]);
    for (let i = 0; i + 1 < mom.length; i++) {
      const t = mom[i], tp = mom[i + 1], a = ab[t], ap = ab[tp], e = eps(x, n, t), sa = Math.sqrt(a), s1 = Math.sqrt(1 - a), sap = Math.sqrt(ap), s1p = Math.sqrt(1 - ap);
      for (let j = 0; j < 2 * n; j++) { let xh = (x[j] - s1 * e[j]) / sa, ej = e[j]; if (xh > DF.CLIP || xh < -DF.CLIP) { xh = xh > 0 ? DF.CLIP : -DF.CLIP; ej = (x[j] - sa * xh) / s1; } x[j] = sap * xh + s1p * ej; }
      if (TS.includes(tp)) out[tp] = Float32Array.from(x);
    }
    return { steps: mom.length - 1, out };
  }
  function frames() {
    if (F) return F;
    const sub = DF.subset(DATA, NPT, 17), r = DF.rng(29), eps = new Float64Array(2 * NPT), z = new Float64Array(2 * NPT);
    for (let j = 0; j < eps.length; j++) { eps[j] = DF.randn(r); z[j] = DF.randn(r); }
    const fwd = {}; for (const t of TS) { const a = SCH.lin.abar[t], sa = Math.sqrt(a), s1 = Math.sqrt(1 - a), x = new Float32Array(2 * NPT); for (let j = 0; j < 2 * NPT; j++) x[j] = sa * sub.X[j] + s1 * eps[j]; fwd[t] = x; }
    const b = backFrames(z);
    F = { fwd, back: b.out, steps: b.steps };
    return F;
  }
  /** Квадрат с точками: pts — Float32Array(2n), цвет col. Подпись — строки в левом верхнем углу. */
  function panel(c, k, P, A, x0, y0, s, pts, col, lines, hl, hlCol) {
    A.rect(c, x0, y0, s, s, 6, P.surf, P.grid, 1);
    c.fillStyle = col; c.globalAlpha = 0.78; c.beginPath();
    const r = s >= 90 ? 1.35 : 1.15;
    for (let i = 0; i < NPT; i++) { const x = pts[2 * i], y = pts[2 * i + 1]; if (Math.abs(x) > E || Math.abs(y) > E) continue; const px = x0 + (x + E) / (2 * E) * s, py = y0 + s - (y + E) / (2 * E) * s; c.moveTo(px + r, py); c.arc(px, py, r, 0, 6.283); }
    c.fill(); c.globalAlpha = 1;
    lines.forEach((tx, i) => A.lab(c, k, tx, x0 + 5, y0 + 8 + i * 11, { px: 9, weight: 700, align: 'left', color: P.ink2, haloColor: P.surf }));
    if (hl) A.rect(c, x0 - 2.5, y0 - 2.5, s + 5, s + 5, 8, null, hlCol, 2.6);
  }
  /** Стрелка с бегущим пунктиром: off — смещение пунктира, dim — приглушить. */
  function flow(c, A, x1, y1, x2, y2, col, off, on) {
    const ux = x2 - x1, uy = y2 - y1, L = Math.hypot(ux, uy) || 1, hx = x2 - ux / L * 9, hy = y2 - uy / L * 9;
    A.line(c, [[x1, y1], [hx, hy]], col, on ? 2.2 : 1.6, [5, 4], on ? -off : 0);
    A.arrow(c, hx, hy, x2, y2, col, on ? 2.2 : 1.6, 8);
  }
  const LBL = { fwd: [['данные', 't = 0'], ['t = 250'], ['t = 500'], ['t = 750'], ['шум', 't = 1000']], back: [['новые точки', 't = 0'], ['t = 250'], ['t = 500'], ['t = 750'], ['новый шум', 't = 1000']] };
  /** L: { s, fwd(i) → [x, y] панели прямого ряда по номеру шага i (0 — данные), back(i) → панель обратного ряда (0 — новые точки),
   *       fa(i)/ba(i) → [x1, y1, x2, y2] стрелки после панели i, blk: [x, y, w, h], blkLines(mode) → строки, fIn, bOut → точки входа и выхода у блока,
   *       titles: [[text, x, y, align]] } */
  function drawCycle(L) {
    return (c, k, t, P, A) => {
      const Fr = frames(), u = ((t % T) + T) % T, { rect, lab, alpha, line } = A;
      const fw = u >= PH.f0 && u < PH.f1, bw = u >= PH.b0 && u < PH.b1, gen = u >= PH.f1;
      const ia = u < PH.f0 ? 0 : fw ? Math.min(4, Math.floor((u - PH.f0) / ((PH.f1 - PH.f0) / 5))) : -1;
      const ib = bw ? Math.min(4, Math.floor((u - PH.b0) / ((PH.b1 - PH.b0) / 5))) : u >= PH.b1 ? 4 : -1;   // 0 — новый шум, 4 — новые точки
      const off = u * 36;
      for (const [tx, x, y, al] of L.titles) lab(c, k, tx, x, y, { px: 11, weight: 700, align: al || 'center', color: P.ink2, halo: false });
      // прямой ряд: данные → шум
      for (let i = 0; i < 5; i++) {
        const [x, y] = L.fwd(i);
        panel(c, k, P, A, x, y, L.s, Fr.fwd[TS[i]], P.ink3, LBL.fwd[i], ia === i, P.ink);
        if (i < 4) { const a = L.fa(i); flow(c, A, a[0], a[1], a[2], a[3], fw ? P.ink2 : alpha(P.ink3, 0.55), off, fw); }
      }
      // обратный ряд: новый шум → новые точки
      for (let i = 0; i < 5; i++) {
        const [x, y] = L.back(i), tt = TS[i], isNoise = i === 4;
        panel(c, k, P, A, x, y, L.s, Fr.back[tt], isNoise ? P.ink3 : P.mot, LBL.back[i], ib === 4 - i, P.mot);
        if (i < 4) { const a = L.ba(i); flow(c, A, a[0], a[1], a[2], a[3], bw ? P.mot : alpha(P.mot, 0.45), off, bw); }
      }
      // сеть-денойзер: при обучении смотрит на прямой путь, при генерации ведёт обратный
      const [bx, by, bwid, bh] = L.blk;
      rect(c, bx, by, bwid, bh, 9, alpha(P.mot, gen ? 0.14 : 0.07), P.mot, 2);
      L.blkLines(gen ? 'gen' : 'train').forEach(([tx, dy, o]) => lab(c, k, tx, bx + bwid / 2, by + dy, Object.assign({ px: 9.5, weight: 600, color: o && o.ink ? P.ink : P.ink2, halo: false }, o || {})));
      if (ia >= 0) { const [x, y] = L.fwd(ia), p = L.fIn, q = L.fOut(x, y); line(c, [q, p], alpha(P.ink, 0.6), 1.4, [3, 3], -off); }
      if (ib >= 0) { const [x, y] = L.back(4 - ib), p = L.bOut, q = L.bIn(x, y); line(c, [p, q], alpha(P.mot, 0.8), 1.4, [3, 3], -off); }
    };
  }
  const wide = { s: 96,
    fwd: (i) => [30 + i * 144, 26], back: (i) => [30 + i * 144, 224],
    fa: (i) => [30 + i * 144 + 102, 74, 30 + (i + 1) * 144 - 6, 74], ba: (i) => [30 + (i + 1) * 144 - 6, 272, 30 + i * 144 + 102, 272],
    blk: [170, 142, 380, 62],
    blkLines: (m) => [['сеть-денойзер', 14, { px: 12.5, weight: 800, ink: true }], ...(m === 'train' ? [['обучение: видит зашумлённую точку и номер шага,', 32], ['учится угадывать добавленный шум', 46]] : [['генерация: предсказывает шум, его часть убирают,', 32], ['и точка становится на шаг ближе к данным', 46]])],
    fIn: [360, 142], fOut: (x, y) => [x + 48, y + 96], bOut: [360, 204], bIn: (x, y) => [x + 48, y],
    titles: [['Прямой путь: к точкам данных шаг за шагом добавляют шум — этот путь задан заранее, учить его не нужно', 360, 11], ['Обратный путь: сеть убирает шум шаг за шагом, и из нового случайного облака получаются новые точки на спиралях', 360, 341]] };
  const narrow = { s: 92,
    fwd: (i) => [10, 30 + i * 120], back: (i) => [258, 30 + i * 120],
    fa: (i) => [56, 30 + i * 120 + 98, 56, 30 + (i + 1) * 120 - 6], ba: (i) => [304, 30 + (i + 1) * 120 - 6, 304, 30 + i * 120 + 98],
    blk: [122, 278, 116, 78],
    blkLines: (m) => [['сеть-денойзер', 13, { px: 10.5, weight: 800, ink: true }], [m === 'train' ? 'обучение:' : 'генерация:', 29, { weight: 750 }], ...(m === 'train' ? [['по точке и шагу', 44], ['угадывает', 56], ['добавленный шум', 68]] : [['предсказывает', 44], ['шум, его часть', 56], ['убирают', 68]])],
    fIn: [122, 317], fOut: (x, y) => [x + 92, y + 46], bOut: [238, 317], bIn: (x, y) => [x, y + 46],
    titles: [['прямой путь ↓', 56, 14], ['обратный путь ↑', 304, 14]] };
  if (typeof Anim !== 'undefined') Anim.add('cycle', { W: 720, H: 352, start: 0.9, narrowAt: 600, draw: drawCycle(wide), narrow: { W: 360, H: 612, draw: drawCycle(narrow) } });
  return { frames, TS, NPT, T, PH };
})();

/* =====================================================================
   0б. Схема «DDPM против DDIM» (shared/anim.js, ключ 'samplers'): одна и та же
   стартовая точка шума и один и тот же денойзер (идеальный, из раздела 3).
   Слева NRUN прогонов DDPM по S_P шагов: на каждом шаге к сдвигу денойзера
   добавляется свежий случайный шум, путь дрожит, концы разные. Справа DDIM
   из того же старта: без свежего шума путь гладкий и при повторе тот же,
   поэтому можно шагать крупно — S_D шагов и S_D2 шагов приходят почти в одну
   точку. Числа шагов есть в ползунке лаборатории. Пути считаются один раз.
   ===================================================================== */
const Samp = (() => {
  const NRUN = 3, S_P = 50, S_D = 50, S_D2 = 10, X0 = [1.6, 1.6], E = 2.3, T = 9.6, RUN = 6.0, NSUB = 500;
  let F = null;
  function paths() {
    if (F) return F;
    const eps = DF.exactEps(DATA, SCH.lin), x0 = new Float64Array(X0), run = (S, eta, seed) => DF.sample(eps, SCH.lin, { n: 1, steps: S, eta, seed, x0, keep: 1 }).traj[0];
    const ddpm = []; for (let s = 1; s <= NRUN; s++) ddpm.push(run(S_P, 1, 40 + s));
    F = { ddpm, d50: run(S_D, 0, 1), d10: run(S_D2, 0, 1), sub: DF.subset(DATA, NSUB, 19) };
    return F;
  }
  /** Точка траектории tr (x0, y0, x1, y1, …) в дробный момент f (между шагами — линейно). */
  function at(tr, f) { const n = tr.length / 2 - 1, i0 = Math.min(n, Math.floor(f)), i1 = Math.min(n, i0 + 1), u = f - i0; return [tr[2 * i0] + (tr[2 * i1] - tr[2 * i0]) * u, tr[2 * i0 + 1] + (tr[2 * i1 + 1] - tr[2 * i0 + 1]) * u]; }
  function drawS(L) {
    return (c, k, t, P, A) => {
      const Fr = paths(), u = ((t % T) + T) % T, prog = Math.min(1, u / RUN), { rect, lab, alpha, circle } = A;
      for (const side of ['ddpm', 'ddim']) {
        const [x0, y0, s] = L[side], map = (x, y) => [x0 + (x + E) / (2 * E) * s, y0 + s - (y + E) / (2 * E) * s];
        lab(c, k, side === 'ddpm' ? `DDPM: на каждом шаге — свежий шум` : 'DDIM: без свежего шума', x0 + s / 2, y0 - 14, { px: 12, weight: 750, color: P.ink, halo: false });
        rect(c, x0, y0, s, s, 8, P.surf, P.grid, 1);
        c.save(); c.beginPath(); c.rect(x0, y0, s, s); c.clip();
        c.fillStyle = P.ink3; c.globalAlpha = 0.35; c.beginPath();
        for (let i = 0; i < NSUB; i++) { const [px, py] = map(Fr.sub.X[2 * i], Fr.sub.X[2 * i + 1]); c.moveTo(px + 1.4, py); c.arc(px, py, 1.4, 0, 6.283); }
        c.fill(); c.globalAlpha = 1;
        /** Ломаная до дробного шага f; fade — старые сегменты бледнее (видно, где путь сейчас). */
        const poly = (tr, f, col, lw, dash, fade) => {
          const n = Math.min(Math.floor(f), tr.length / 2 - 1), pts = []; for (let j = 0; j <= n; j++) pts.push(map(tr[2 * j], tr[2 * j + 1]));
          if (f > n && n < tr.length / 2 - 1) { const q = at(tr, f); pts.push(map(q[0], q[1])); }
          if (pts.length < 2) return pts;
          if (fade) for (let j = 1; j < pts.length; j++) A.line(c, [pts[j - 1], pts[j]], alpha(col, 0.15 + 0.75 * j / pts.length), lw, dash);
          else A.line(c, pts, col, lw, dash);
          return pts;
        };
        const dot = (q, r, col) => circle(c, q[0], q[1], r, col, P.surf, 1.2);
        if (side === 'ddpm') {
          Fr.ddpm.forEach((tr) => { const f = prog * S_P; poly(tr, f, P.mot, 1.4, null, true); const q = at(tr, f); dot(map(q[0], q[1]), prog >= 1 ? 4.5 : 3.5, P.mot); });
        } else {
          const f50 = prog * S_D, f10 = prog * S_D2;
          poly(Fr.d50, f50, alpha(P.mot, 0.9), 2.2);
          const nodes = poly(Fr.d10, f10, alpha(P.spr, 0.9), 1.6, [4, 3]);
          nodes.forEach((q, j) => { if (j <= Math.floor(f10)) circle(c, q[0], q[1], 3, P.spr, P.surf, 1); });
          const q50 = at(Fr.d50, f50), q10 = at(Fr.d10, f10); dot(map(q50[0], q50[1]), prog >= 1 ? 4.5 : 3.5, P.mot); dot(map(q10[0], q10[1]), 3.5, P.spr);
          if (prog >= 1) { const e = map(Fr.d50[2 * S_D], Fr.d50[2 * S_D + 1]); circle(c, e[0], e[1], 11, null, P.ink, 1.4); lab(c, k, `конец: ${S_D} и ${S_D2} шагов почти совпали`, x0 + s / 2, y0 + s - 12, { px: 10.5, weight: 700, color: P.ink, haloColor: P.surf }); }
        }
        // старт: одна и та же точка шума
        const st = map(X0[0], X0[1]); circle(c, st[0], st[1], 6, P.surf, P.ink, 2.4); lab(c, k, 'старт', st[0] - 10, st[1] + 1, { px: 10, weight: 700, align: 'right', color: P.ink, haloColor: P.surf });
        c.restore();
        const step = prog >= 1 ? null : side === 'ddpm' ? `шаг ${Math.floor(prog * S_P)} из ${S_P}` : `шаг ${Math.floor(prog * S_D)} из ${S_D} · ${Math.floor(prog * S_D2)} из ${S_D2}`;
        lab(c, k, step || L.done[side], x0 + s / 2, y0 + s + 12, { px: 10.5, weight: 650, color: prog >= 1 ? P.ink : P.ink3, halo: false });
      }
    };
  }
  const done = { ddpm: `${NRUN} прогона из одного старта: пути дрожат, концы разные`, ddim: `путь гладкий, при повторе тот же; ${S_D2} крупных шагов ≈ ${S_D} мелких` };
  const doneN = { ddpm: `${NRUN} прогона: пути дрожат, концы разные`, ddim: `путь гладкий и повторяемый; ${S_D2} шагов ≈ ${S_D}` };
  if (typeof Anim !== 'undefined') Anim.add('samplers', {
    W: 720, H: 350, start: 0.3, narrowAt: 600, draw: drawS({ ddpm: [30, 30, 300], ddim: [390, 30, 300], done }),
    narrow: { W: 360, H: 744, draw: drawS({ ddpm: [20, 28, 320], ddim: [20, 400, 320], done: doneN }) },
  });
  return { paths, NRUN, S_P, S_D, S_D2, X0, NSUB, T, RUN };
})();

/* =====================================================================
   1. Путь от данных к шуму: нарисуй прогноз ᾱ_t, потом сравни с настоящей
   кривой и переключи шкалу
   ===================================================================== */
const AB = (() => {
  const M = mkMap(420, 3.1), PW = 420, NC = 41;
  const st = { t: 0, scale: 'lin', sched: 'lin', mis: 0, fc: new Array(NC).fill(null), revealed: false, reveal: 1, box: null, last: null };
  st.fc[0] = 1;
  const noise = (() => { const r = DF.rng(5), e = new Float64Array(2 * DATA.N); for (let j = 0; j < e.length; j++) e[j] = DF.randn(r); return e; })();
  const pts = new Float64Array(2 * DATA.N);
  let ctl = null;
  const ab = (k, t) => SCH[k].abar[t];
  const T1 = (() => { let t = 1; while (ab('lin', t) >= 0.01) t++; return t; })(), T1c = (() => { let t = 1; while (ab('cos', t) >= 0.01) t++; return t; })();
  const coverage = () => st.fc.filter((v) => v != null).length / NC;
  function fcErr() { let s = 0, n = 0; st.fc.forEach((v, i) => { if (v == null) return; s += Math.abs(v - ab('lin', i * 25)); n++; }); return n ? s / n : 1; }
  const showReal = () => st.revealed;
  const canDraw = () => st.mis === 0 && !st.revealed;
  function drawCloud() {
    const { c, k, P } = sceneBase($('#abCloud'), M), a = ab(st.sched, st.t), sa = Math.sqrt(a), s1 = Math.sqrt(1 - a);
    for (let i = 0; i < 2 * DATA.N; i++) pts[i] = sa * DATA.X[i] + s1 * noise[i];
    drawData(c, M, P, { pts, r: 1.7, a1: 0.75, a2: 0.35 });
    status(c, k, P, showReal() ? `${st.sched === 'lin' ? 'линейное' : 'косинусное'} · t = ${st.t} · ᾱ = ${fmtA(a)}` : `облако на шаге t = ${st.t}`);
  }
  function drawPlot() {
    const { c, k } = HeroKit.fit($('#abPlot'), PW, PW), P = pal(), log = st.scale === 'log';
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PW);
    const yt = log ? [[1, '1'], [1e-2, '10⁻²'], [1e-4, '10⁻⁴'], [1e-6, '10⁻⁶'], [1e-8, '10⁻⁸'], [1e-10, '10⁻¹⁰']] : [[0, '0'], [0.25, '0,25'], [0.5, '0,5'], [0.75, '0,75'], [1, '1']];
    const box = { l: Math.max(40, 44 * k), r: PW - 14, t: 14 + 16 * k, b: PW - Math.max(26, 20 * k) }; st.box = box;   // сверху место под подпись оси
    const x = (t) => box.l + t / 1000 * (box.r - box.l);
    const y = log ? (v) => box.b - (Math.log10(Math.max(1e-10, v)) + 10) / 10 * (box.b - box.t) : (v) => box.b - v * (box.b - box.t);
    axes(c, k, P, box, [[0, '0', 'left'], [250, '250'], [500, '500'], [750, '750'], [1000, 't = 1000', 'right']], yt, x, y);
    HeroKit.label(c, k, 'доля сигнала ᾱ', box.l, 12 * k, { align: 'left', px: 10.5, color: P.ink2, halo: false });
    if (st.mis >= 2) { c.setLineDash([2, 4]); c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); c.moveTo(box.l, y(0.01)); c.lineTo(box.r, y(0.01)); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'сигнала 1%', box.r - 4, y(0.01) - 9 * k, { align: 'right', px: 10.5, color: P.good, haloColor: P.bg }); }
    if (showReal()) {
      const tmax = 1000 * st.reveal;
      for (const [kind, col, dash] of [['cos', P.ink3, [6, 4]], ['lin', P.ink, []]]) {
        c.strokeStyle = col; c.lineWidth = 2.2; c.setLineDash(dash); c.beginPath();
        for (let t = 0; t <= tmax; t += 2) { const X = x(t), Y = y(ab(kind, t)); t ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.stroke(); c.setLineDash([]);
      }
    }
    // прогноз ученика
    c.strokeStyle = P.e2e; c.lineWidth = showReal() ? 2 : 3; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); let pen = false;
    st.fc.forEach((v, i) => { if (v == null) { pen = false; return; } const X = x(i * 25), Y = y(v); if (pen) c.lineTo(X, Y); else c.moveTo(X, Y); pen = true; });
    c.stroke();
    if (!showReal()) {
      c.fillStyle = P.e2e; st.fc.forEach((v, i) => { if (v == null) return; c.beginPath(); c.arc(x(i * 25), y(v), 2.6, 0, 7); c.fill(); });
      if (coverage() < 0.1) { const mx = (box.l + box.r) / 2, my = (box.t + box.b) / 2; HeroKit.label(c, k, 'Нарисуй здесь прогноз:', mx, my - 9 * k, { px: 12.5, weight: 700, color: P.e2e, haloColor: P.bg }); HeroKit.label(c, k, 'веди слева направо', mx, my + 9 * k, { px: 12.5, weight: 700, color: P.e2e, haloColor: P.bg }); }
    }
    const cx = x(st.t); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(cx, box.t); c.lineTo(cx, box.b); c.stroke(); c.setLineDash([]);
    if (showReal() && st.reveal >= 1) for (const [kind, col] of [['lin', P.ink], ['cos', P.ink3]]) {
      const v = ab(kind, st.t), Y = y(v); c.beginPath(); c.arc(cx, Y, 4.5, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = P.bg; c.stroke();
      const right = st.t < 640;
      HeroKit.label(c, k, fmtA(v), cx + (right ? 9 : -9) * k, Y + (kind === 'lin' ? 10 : -10) * k, { align: right ? 'left' : 'right', px: 11, mono: true, weight: 700, color: col, haloColor: P.bg });
    }
  }
  function legends() {
    legend('#abPlotLegend', showReal() ? [['твой прогноз', 'var(--e2e)'], ['линейное расписание (DDPM)', 'var(--ink)'], ['косинусное', 'var(--ink-3)', 'dash']] : [['твой прогноз: веди мышью или пальцем по графику', 'var(--e2e)']]);
  }
  function draw() {
    drawCloud(); drawPlot(); legends();
    $('#abPlot').classList.toggle('drawing', canDraw());
    setOut($('#abOut'), showReal() ? `t = <b>${st.t}</b> · доля сигнала ᾱ: линейное расписание <b>${fmtA(ab('lin', st.t))}</b>, косинусное <b>${fmtA(ab('cos', st.t))}</b>` : `t = <b>${st.t}</b> · прогноз нарисован на <b>${pc(coverage())}</b> пути. Настоящая кривая откроется после прогноза.`);
  }
  function setT(t) { st.t = Math.max(0, Math.min(1000, Math.round(t))); const inp = $('#abT'); inp.value = st.t; inp.nextElementSibling.textContent = st.t; setRangeFill(inp); draw(); if (ctl) ctl.update(); }
  function segSync(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
  function setScale(v) { st.scale = v; segSync('#abScale', v); draw(); if (ctl) ctl.update(); }
  function setSched(v) { st.sched = v; segSync('#abSched', v); draw(); }
  /** Мазок по графику: заполняем столбцы прогноза между прошлой и текущей точкой. */
  function paint(p) {
    const b = st.box; if (!b) return;
    const t = Math.max(0, Math.min(1000, (p.x - b.l) / (b.r - b.l) * 1000)), v = Math.max(0, Math.min(1, (b.b - p.y) / (b.b - b.t))), i = Math.round(t / 25);
    if (st.last && st.last[0] !== i) { const [i0, v0] = st.last, a = Math.min(i0, i), z = Math.max(i0, i); for (let j = a; j <= z; j++) if (j > 0) st.fc[j] = v0 + (v - v0) * (j - i0) / (i - i0); }
    else if (i > 0) st.fc[i] = v;
    st.last = [i, v]; draw();
  }
  function reveal() {
    const cov = coverage(); if (cov < 0.9) return Promise.resolve({ coverage: cov });
    st.revealed = true; st.reveal = 0;
    return animate(900, (p) => { st.reveal = p; draw(); }).then(() => ({ coverage: cov, err: fcErr(), f500: st.fc[20], real500: ab('lin', 500), cos500: ab('cos', 500) }));
  }
  const api = {
    reset() { st.fc = new Array(NC).fill(null); st.fc[0] = 1; st.revealed = false; st.reveal = 1; st.last = null; setScale('lin'); setSched('lin'); setT(0); },
    state: () => ({ t: st.t, scale: st.scale, sched: st.sched, lin: ab('lin', st.t), cos: ab('cos', st.t), coverage: coverage(), revealed: st.revealed }),
    /** Для автотестов: нарисовать прогноз функцией f(t) → ᾱ. */
    forecast(f) { for (let i = 1; i < NC; i++) st.fc[i] = Math.max(0, Math.min(1, f(i * 25))); draw(); },
    reveal, setT, setScale, setSched, paint, box: () => st.box,
  };
  const missions = [
    { short: 'Прогноз', title: 'Нарисуй, как тает сигнал', text: 'Нарисуй прогноз: как падает доля сигнала ᾱ на линейном расписании DDPM от t = 0 до t = 1000. Веди мышью или пальцем по графику. Облако слева подскажет, как выглядят точки на шаге t: двигай ползунок.',
      action: { label: 'Показать настоящую кривую', run: (X) => X.reveal() },
      criteria: [{ label: 'Прогноз нарисован от t = 0 до t = 1000', test: (r) => r.coverage >= 0.9 }],
      summary: (r) => (r.coverage >= 0.9 ? `ошибка прогноза ${fx(r.err, 2)}; на t = 500 в прогнозе ${fx(r.f500, 2)}, на деле ${fmtA(r.real500)}` : `прогноз нарисован на ${pc(r.coverage)} пути`),
      hint: 'Начни у левого края графика и веди вправо до t = 1000, не отпуская кнопку. Нарисованное можно перерисовать поверх.',
      fail: (r) => `Прогноз нарисован только на ${pc(r.coverage)} пути. Дорисуй его до t = 1000.`,
      explain: (r) => `Прогноз отличается от настоящей кривой в среднем на ${fx(r.err, 2)}. На середине пути в прогнозе ${fx(r.f500, 2)}, а на деле ${fmtA(r.real500)}: сигнала меньше десятой. Линейное расписание быстро теряет сигнал в начале пути, а во второй половине облако почти не меняется. Пунктиром — косинусное расписание: на середине у него ${fmtA(r.cos500)}, сигнал уходит плавнее.` },
    { short: 'Конец пути', title: 'Сколько сигнала остаётся в конце', text: 'На линейной шкале конец пути выглядит как ноль. Включи логарифмическую шкалу и найди, сколько сигнала остаётся на последнем шаге, t = 1000.', controls: ['scale'],
      criteria: [{ label: 'Логарифмическая шкала', test: (r, s) => s.scale === 'log' }, { label: 'Курсор на t = 1000', test: (r, s) => s.t === 1000 }],
      hint: 'Переключатель шкалы — под графиком. Ползунок t доведи до упора вправо.',
      explain: () => `В конце линейного расписания ᾱ = ${fmtA(ab('lin', 1000))}: сигнал не обнуляется, и x<sub>T</sub> — не идеальный шум. У косинусного расписания остаётся ${fmtA(ab('cos', 1000))}. Для картинок остаток важен: у Stable Diffusion его хватает, чтобы модель не умела очень тёмные и очень светлые изображения.` },
    { short: 'Где кончается', title: 'Где кончается сигнал', text: 'Найди шаг, на котором у линейного расписания остаётся около 1% сигнала: ᾱ от 0,008 до 0,012. Этот уровень отмечен на графике пунктиром.', controls: ['scale'],
      criteria: [{ label: 'ᾱ линейного расписания от 0,008 до 0,012', test: (r, s) => s.lin >= 0.008 && s.lin <= 0.012 }],
      hint: 'На логарифмической шкале уровень 1% виден лучше. Ищи во второй трети пути. Ползунок можно двигать стрелками клавиатуры по одному шагу.',
      explain: (s) => `Это t = ${s.t}. Сигнала меньше 1% становится с t = ${T1}, и до конца остаётся ещё ${1000 - T1 + 1} шагов — треть пути, на которой точки почти неотличимы от шума. У косинусного расписания тот же рубеж — t = ${T1c}. Поэтому в Improved DDPM конец линейного расписания назвали «too noisy»: до 20% обратного процесса можно выбросить почти без потерь. Отсюда и косинусное расписание.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай t, меняй шкалу и расписание облака. Сравни облако на t = 500 при двух расписаниях.', final: true },
  ];
  function init() {
    legend('#abCloudLegend', [['спираль 1', 'var(--ink-3)', 'dot'], ['спираль 2 (светлее)', 'color-mix(in srgb, var(--ink-3) 45%, transparent)', 'dot']]);
    $('#abT').addEventListener('input', (e) => setT(+e.target.value));
    $$('#abScale button').forEach((b) => b.addEventListener('click', () => setScale(b.dataset.v)));
    $$('#abSched button').forEach((b) => b.addEventListener('click', () => setSched(b.dataset.v)));
    const inBox = (p) => st.box && p.x > st.box.l - 12 && p.x < st.box.r + 12 && p.y > st.box.t - 12 && p.y < st.box.b + 12;
    HeroKit.drag($('#abPlot'), PW, PW, {
      hit: (p) => (canDraw() && inBox(p) ? 'draw' : null),
      start: (o, p) => { st.last = null; paint(p); }, move: (o, p) => paint(p), end: () => { st.last = null; },
      tap: (p) => { if (canDraw() && inBox(p)) { st.last = null; paint(p); } }, tapCursor: 'crosshair',
    });
    ctl = mountMissions('#abMis', missions, api, { controls: { scale: '#abScale', sched: '#abSched' }, onStep: (i) => { st.mis = i; draw(); } });
    setT(0); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Куда сдвигать точку: перемотка генерации идеальным денойзером,
   стрелки поля score на каждом шаге и пробная точка
   ===================================================================== */
const Score = (() => {
  const M = mkMap(420, 2.3), G = 15, EXT = 2.1, R_IN = 1.75, AL = 0.17, NST = 50, NP = 300;
  const TS = DF.taus(NST), tOf = (j) => (j < NST ? TS[j] : 1);
  const gen = DF.sample(DF.exactEps(DATA, SCH.lin), SCH.lin, { n: NP, steps: NST, eta: 0, seed: 11, frames: true });
  const st = { j: 0, probe: { x: 0.55, y: -0.32 }, mis: 0, w: new Float64Array(DATA.N), d: [0, 0], done: [false, false], playing: false, J1: null, J2: null, caption: '' };
  const nodes = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = -EXT + 2 * EXT * i / (G - 1), y = -EXT + 2 * EXT * j / (G - 1), q = NN.near(x, y, 3);
    nodes.push({ x, y, dm: Math.hypot(MEAN.x - x, MEAN.y - y), nn: q, inner: Math.hypot(x, y) < R_IN && !!q && q.d > 0.08 });
  }
  const cache = new Map();
  let ctl = null;
  const sigma = (t) => { const a = SCH.lin.abar[t]; return Math.sqrt((1 - a) / a); };
  /** Оценка чистой точки по точке x_t: денойзер EDM на x_t/√ᾱ с σ = √((1 − ᾱ)/ᾱ). */
  function est(x, y, t, out, wOut) { const a = SCH.lin.abar[t], sa = Math.sqrt(a); return DF.edmD(DATA, x / sa, y / sa, Math.sqrt((1 - a) / a), out, wOut); }
  function at(j) {
    if (cache.has(j)) return cache.get(j);
    const t = tOf(j), o = [0, 0], vec = new Float64Array(2 * nodes.length), okM = new Uint8Array(nodes.length), okS = new Uint8Array(nodes.length); let tm = 0, nm = 0, ts = 0, ns = 0;
    nodes.forEach((n, i) => {
      est(n.x, n.y, t, o); const vx = o[0] - n.x, vy = o[1] - n.y; vec[2 * i] = vx; vec[2 * i + 1] = vy;
      if (n.dm > 0.3) { nm++; if (ang(vx, vy, MEAN.x - n.x, MEAN.y - n.y) < 15) { okM[i] = 1; tm++; } }
      if (n.inner) { ns++; const p = n.nn.i; if (ang(vx, vy, DATA.X[2 * p] - n.x, DATA.X[2 * p + 1] - n.y) < 30) { okS[i] = 1; ts++; } }
    });
    const r = { t, s: sigma(t), toMean: tm / nm, toSp: ts / ns, vec, okM, okS }; cache.set(j, r); return r;
  }
  /** Границы этапов: последний шаг «к центру» и первый шаг «к своему витку». */
  function phases() {
    if (st.J1 != null) return;
    let j = 0; while (j < NST && at(j + 1).toMean >= 0.9) j++; st.J1 = j;
    let k = st.J1 + 1; while (k <= NST && at(k).toSp < 0.9) k++; st.J2 = k;
  }
  function arrow(c, x0, y0, x1, y1, col, lw) {
    const a = Math.atan2(y1 - y0, x1 - x0), hl = 5.5;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45)); c.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45)); c.closePath(); c.fill();
  }
  function strip() {
    const box = $('#rwStrip'); if (!box.children.length) for (let j = 0; j <= NST; j++) box.append(h('i'));
    const free = st.mis >= 2, s1 = st.done[0] || free, s3 = st.done[1] || free;
    if (s1 || s3) phases();
    [...box.children].forEach((e, j) => { e.className = (s1 && j <= st.J1 ? 'p1' : s3 && j >= st.J2 ? 'p3' : s1 && s3 && j > st.J1 && j < st.J2 ? 'p2' : '') + (j === st.j ? ' cur' : ''); });
    const it = []; if (s1) it.push(['к центру', 'color-mix(in srgb, var(--ink-3) 60%, transparent)', 'box']); if (s1 && s3) it.push(['выбор витка', 'color-mix(in srgb, var(--e2e) 50%, transparent)', 'box']); if (s3) it.push(['к своему витку', 'color-mix(in srgb, var(--good) 60%, transparent)', 'box']);
    legend('#rwStripLegend', it.length ? [['этапы генерации:', 'transparent', 'box']].concat(it) : []);
  }
  function draw() {
    const { c, k, P } = sceneBase($('#scCv'), M), r = at(st.j), F = gen.frames[st.j];
    drawData(c, M, P, { r: 1.5, a1: 0.38, a2: 0.2 });
    if (st.mis >= 1) { const o = M.map(0, 0); c.setLineDash([4, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.arc(o.x, o.y, R_IN * M.S, 0, 7); c.stroke(); c.setLineDash([]); }
    dots(c, F, NP, M, 2.2, P.e2e, 0.75);
    nodes.forEach((n, i) => {
      const vx = r.vec[2 * i], vy = r.vec[2 * i + 1], L = Math.hypot(vx, vy); if (L < 1e-9) return;
      const p = M.map(n.x, n.y), q = M.map(n.x + vx / L * AL, n.y + vy / L * AL);
      const hl = st.mis === 0 ? r.okM[i] : st.mis === 1 ? r.okS[i] : 0, faint = st.mis === 1 && !n.inner;
      c.globalAlpha = faint ? 0.35 : 1; arrow(c, p.x, p.y, q.x, q.y, hl ? P.good : st.mis >= 2 ? P.ink2 : P.ink3, hl ? 2 : 1.4); c.globalAlpha = 1;
    });
    const m = M.map(MEAN.x, MEAN.y); c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(m.x - 6, m.y); c.lineTo(m.x + 6, m.y); c.moveTo(m.x, m.y - 6); c.lineTo(m.x, m.y + 6); c.stroke();
    HeroKit.label(c, k, 'среднее', m.x, m.y + 13 * k, { px: 10.5, color: P.ink2, haloColor: P.bg });
    est(st.probe.x, st.probe.y, r.t, st.d, st.w);
    let wm = 0, nw = 0; for (let i = 0; i < DATA.N; i++) if (st.w[i] > wm) wm = st.w[i];
    for (let i = 0; i < DATA.N; i++) if (st.w[i] / wm >= 0.04) nw++;
    c.fillStyle = P.ink; const many = nw > 400; // денойзер усредняет почти всё — подсвечиваем ровным тоном
    for (let i = 0; i < DATA.N; i++) { const a = st.w[i] / wm; if (a < 0.04) continue; const q = M.map(DATA.X[2 * i], DATA.X[2 * i + 1]); c.globalAlpha = many ? 0.22 : Math.min(1, 0.2 + 0.7 * a); c.beginPath(); c.arc(q.x, q.y, many ? 1.6 : 1.3 + 1.7 * a, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    const pp = M.map(st.probe.x, st.probe.y), dd = M.map(st.d[0], st.d[1]);
    c.strokeStyle = P.ink; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(pp.x, pp.y); c.lineTo(dd.x, dd.y); c.stroke(); c.setLineDash([]);
    HeroKit.cross(c, dd.x, dd.y, 6, P.ink, 2.6);
    c.beginPath(); c.arc(pp.x, pp.y, 9, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.ink; c.stroke();
    c.beginPath(); c.arc(pp.x, pp.y, 2.5, 0, 7); c.fillStyle = P.ink; c.fill();
    const tt = st.j < NST ? r.t : 0, aTxt = fmtA(SCH.lin.abar[tt]);   // показываем долю сигнала ᾱ, введённую в разделе 2; σ — в «Под капотом»
    status(c, k, P, `шаг ${st.j} из ${NST} · t = ${tt} · ᾱ = ${aTxt}`);
    if (st.caption) HeroKit.label(c, k, st.caption, M.W / 2, M.W - 16 * k, { px: 12.5, weight: 700, color: P.ink, haloColor: P.bg });
    setOut($('#scOut'), `Шаг <b>${st.j}</b> из ${NST} (t = ${tt}, доля сигнала ᾱ = ${aTxt}) · в центр смотрят <b>${pc(r.toMean)}</b> стрелок${st.mis >= 1 ? ` · к ближайшей спирали ведут <b>${pc(r.toSp)}</b> стрелок внутри пунктирного круга` : ''}`);
    strip();
  }
  function setJ(j) { st.j = Math.max(0, Math.min(NST, Math.round(j))); const inp = $('#rwStep'); inp.value = st.j; inp.nextElementSibling.textContent = String(st.j); setRangeFill(inp); draw(); if (ctl) ctl.update(); }
  function setProbe(x, y) { st.probe = { x: Math.max(-2.2, Math.min(2.2, x)), y: Math.max(-2.2, Math.min(2.2, y)) }; draw(); }
  async function play() {
    if (st.playing) return; st.playing = true; phases(); if (st.j >= NST) setJ(0);
    const wait = (ms) => new Promise((res) => setTimeout(res, ms / SPEED.k));
    while (st.j < NST && st.playing) {
      await wait(110); setJ(st.j + 1);
      if (st.j === st.J1) { st.caption = 'конец этапа «к центру»: дальше точки выбирают виток'; draw(); await wait(1300); st.caption = ''; }
      if (st.j === st.J2) { st.caption = 'с этого шага каждая точка тянется к своему витку'; draw(); await wait(1300); st.caption = ''; }
    }
    st.playing = false; draw();
  }
  const api = {
    reset() { st.probe = { x: 0.55, y: -0.32 }; st.done = [false, false]; st.playing = false; st.caption = ''; setJ(0); },
    state: () => { const r = at(st.j); return { j: st.j, t: st.j < NST ? r.t : 0, s: r.s, toMean: r.toMean, toSp: r.toSp, nextToMean: st.j < NST ? at(st.j + 1).toMean : 0, prevToSp: st.j > 0 ? at(st.j - 1).toSp : 1 }; },
    setJ, setProbe, play, phases: () => { phases(); return { J1: st.J1, J2: st.J2 }; }, at,
  };
  const missions = [
    { short: 'К центру', title: 'Пока точки тянутся к центру', text: 'Перематывай генерацию от начала и найди последний шаг, на котором не меньше 90% стрелок ещё смотрят в общее среднее спиралей. Такие стрелки подсвечены зелёным.',
      criteria: [{ label: 'На этом шаге в среднее смотрят не меньше 90% стрелок', test: (r, s) => s.toMean >= 0.9 }, { label: 'На следующем шаге — уже меньше 90%', test: (r, s) => s.nextToMean < 0.9 }],
      hint: 'Двигай ползунок от начала вправо, кнопки ◀ и ▶ сдвигают на один шаг. Граница — примерно в середине генерации.',
      explain: (s) => `До шага ${s.j} (t = ${s.t}) в центр смотрят не меньше 90% стрелок. Шум ещё сильный: зашумлённая точка могла прийти почти откуда угодно, и денойзер усредняет почти все данные. Облако генерации в это время сжимается к центру. Со следующего шага стрелки начинают поворачивать к виткам.` },
    { short: 'К виткам', title: 'Когда точки выбирают виток', text: 'Теперь найди первый шаг, с которого не меньше 90% стрелок внутри пунктирного круга ведут к ближайшей спирали.',
      criteria: [{ label: 'На этом шаге к ближайшей спирали ведут не меньше 90% стрелок', test: (r, s) => s.toSp >= 0.9 }, { label: 'На прошлом шаге — меньше 90%', test: (r, s) => s.prevToSp < 0.9 }],
      hint: 'Это ближе к концу генерации, где шума мало.',
      explain: (s) => { phases(); return `С шага ${s.j} (t = ${s.t}) к ближайшей спирали ведут ${pc(s.toSp)} стрелок: шума мало, и денойзер усредняет только соседей. Между шагами ${st.J1 + 1} и ${s.j - 1} точка выбирает, на какой виток прийти. Поэтому итог генерации — точка на одной из спиралей, а не среднее двух: к среднему точки тянутся только в начале, пока шум скрывает, откуда они пришли.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Проиграй генерацию целиком: на границах этапов она ненадолго остановится. Поставь пробную точку между витками и найди шаг, на котором её оценка перескакивает с одного витка на другой.', final: true, controls: ['play'] },
  ];
  function init() {
    legend('#scLegend', [['сэмплы на этом шаге', 'var(--e2e)', 'dot'], ['куда денойзер тянет точки сцены', 'var(--ink-3)'], ['стрелки, выполняющие условие миссии', 'var(--good)'], ['пробная точка и её оценка', 'var(--ink)', 'ring']]);
    $('#rwStep').addEventListener('input', (e) => setJ(+e.target.value));
    $('#rwPrev').addEventListener('click', () => setJ(st.j - 1));
    $('#rwNext').addEventListener('click', () => setJ(st.j + 1));
    $('#rwPlay').addEventListener('click', () => play());
    HeroKit.drag($('#scCv'), M.W, M.W, {
      hit: (p) => { const q = M.map(st.probe.x, st.probe.y); return Math.hypot(p.x - q.x, p.y - q.y) < 30 ? 'p' : null; },
      move: (o, p) => { const w = M.inv(p.x, p.y); setProbe(w.x, w.y); }, tap: (p) => { const w = M.inv(p.x, p.y); setProbe(w.x, w.y); }, tapCursor: 'pointer',
    });
    ctl = mountMissions('#scMis', missions, api, { controls: { play: '#rwPlay' }, onStep: (i) => { st.mis = i; draw(); }, onDone: (i) => { if (i < 2) st.done[i] = true; draw(); } });
    setJ(0); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, at };
})();

/* =====================================================================
   3. Лаборатория: сеть-денойзер, DDPM и DDIM рядом, бассейны
   ===================================================================== */
const Lab = (() => {
  const M = mkMap(520, 2.4), STEPS = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100, 200], EPOCHS = [25, 50, 100, 200];
  const LTH = 0.234, FORM = { on: 0.8, outer: 0.25 }, NGEN = 1000, KEEP = 40, GSEED = 2, BASIN = { steps: 20, near: 0.25 };
  const st = {
    sched: 'lin', D: null, rng: null, ev: null, curve: [], loss: null, loss0: null, training: false, prog: 0, preview: null,
    R: null, gen: null, anim: 1, view: 'train', duo: false, showReg: false, etaIdx: 10, stepsIdx: 12, epochsIdx: 2,
    starts: [{ x: -1.5, y: 1.0 }, { x: 1.4, y: -1.1 }], basin: null, mis: 0, freeSeed: 100, busy: false, note: '', showMap: false, map: null,
  };
  let ctl = null;
  const epochs = () => st.D.steps / DF.LAB.perEpoch;
  const S = () => STEPS[st.stepsIdx], eta = () => st.etaIdx / 10;
  const holds = (s) => s.on >= FORM.on && s.outer >= FORM.outer;
  const sName = (e) => (e >= 0.999 ? 'DDPM' : e <= 0.001 ? 'DDIM' : `η = ${fx(e, 1)}`);
  function fresh() {
    st.D = DF.denoiser({ seed: 5, sched: st.sched }); st.rng = DF.rng(9); st.ev = DF.evalSet(DATA, 4000, 77, st.D.sched);
    st.loss0 = DF.evalLoss(st.D, st.ev); st.loss = st.loss0; st.curve = [[0, st.loss0]]; st.preview = null; st.gen = null; st.basin = null;
    st.view = st.mis === 4 ? 'basin' : 'train'; if (st.view === 'basin') basin();
  }

  /* ---------- обучение ---------- */
  const drawT = throttle(() => draw(), 60);
  function train(E) {
    if (st.training) return Promise.resolve(null);
    st.msg = false; st.training = true; st.prog = 0; if (st.view !== 'basin') st.view = 'train';
    const D = st.D, r = st.rng, total = E * DF.LAB.perEpoch; let done = 0;
    function* g() {
      while (done < total) {
        for (let j = 0; j < 8 && done < total; j++, done++) DF.trainStep(D, DATA, DF.LAB.bs, r, DF.labLr(D.steps), 0);
        if (D.steps % 80 === 0) { st.loss = DF.evalLoss(D, st.ev); st.curve.push([D.steps / DF.LAB.perEpoch, st.loss]); }
        if (D.steps % 400 === 0) st.preview = DF.sample(DF.netEps(D), D.sched, { n: 300, steps: 20, eta: 0, seed: 3 }).x;
        st.prog = done / total; yield done;
      }
    }
    return runChunked(g(), () => drawT(), 12).then(() => {
      if (D.steps % 80 !== 0) { st.loss = DF.evalLoss(D, st.ev); st.curve.push([D.steps / DF.LAB.perEpoch, st.loss]); }
      if (D.steps % 400 !== 0) st.preview = DF.sample(DF.netEps(D), D.sched, { n: 300, steps: 20, eta: 0, seed: 3 }).x;
      st.training = false; if (st.view === 'basin') basin(); draw();
      return { loss: st.loss, epochs: epochs(), loss0: st.loss0 };
    });
  }
  function regTrain() {
    if (st.R) return Promise.resolve(st.R);
    const R = DF.regressor(8);
    return runChunked(DF.regTrainGen(R, DATA, { steps: 400 }), () => {}, 12).then(() => { st.R = R; return R; });
  }

  /* ---------- генерация ---------- */
  function sampleChunked(epsFn, o) {
    const g = DF.sampleGen(epsFn, st.D.sched, o);
    return new Promise((res, rej) => {
      const step = () => { const t0 = performance.now(); try { for (;;) { const x = g.next(); if (x.done) { res(x.value); return; } if (performance.now() - t0 > 14) break; } } catch (e) { rej(e); return; } setTimeout(step, 0); };
      step();
    });
  }
  /** o: { S, etaA, duo, reg, seed, animate } → статистика обеих панелей. */
  async function generate(o) {
    o = Object.assign({ S: S(), etaA: 1, duo: false, reg: false, seed: GSEED, animate: true }, o);
    st.busy = true; st.note = 'считаю…'; draw();
    const net = DF.netEps(st.D);
    const A = await sampleChunked(net, { n: NGEN, steps: o.S, eta: o.etaA, seed: o.seed, keep: KEEP, frames: true });
    const B = o.duo ? await sampleChunked(net, { n: NGEN, steps: o.S, eta: 0, seed: o.seed, keep: KEEP, frames: true }) : null;
    let reg = null;
    if (o.reg) { const R = await regTrain(); const y = DF.regPredict(R, A.x0, NGEN); reg = { x: y, stats: DF.stats(DATA, NN, y, NGEN, RM) }; }
    const gen = { S: o.S, A: Object.assign(A, { eta: o.etaA, stats: DF.stats(DATA, NN, A.x, NGEN, RM) }), B: B ? Object.assign(B, { eta: 0, stats: DF.stats(DATA, NN, B.x, NGEN, RM) }) : null, reg };
    st.gen = gen; st.note = ''; if (st.view !== 'basin') st.view = 'gen';
    if (o.duo !== st.duo) setDuo(o.duo);
    if (o.animate) await animate(Math.max(800, Math.min(2000, 600 + o.S * 12)), (p) => { st.anim = p; draw(); });
    else { st.anim = 1; draw(); }
    st.busy = false; draw();
    return { S: o.S, A: gen.A.stats, B: gen.B ? gen.B.stats : null, reg: reg ? reg.stats : null, regR: reg ? meanR(reg.x) : null, epochs: epochs() };
  }
  const meanR = (x) => { let s = 0; for (let k = 0; k < x.length / 2; k++) s += Math.hypot(x[2 * k], x[2 * k + 1]); return s / (x.length / 2); };
  /** DDPM на всех числах шагов (тот же шум): с какого числа шагов форма теряется. */
  async function sweep() {
    const out = []; const net = DF.netEps(st.D);
    for (const s of STEPS) { if (s > 100) continue; const r = await sampleChunked(net, { n: NGEN, steps: s, eta: 1, seed: GSEED }); out.push([s, DF.stats(DATA, NN, r.x, NGEN, RM)]); }
    const ok = out.filter(([, s]) => holds(s)).map(([s]) => s);
    return { rows: out.map(([s, x]) => [s, x.on, x.outer]), Sstar: ok.length ? Math.min(...ok) : Infinity };
  }
  async function at8() {
    const net = DF.netEps(st.D), P = await sampleChunked(net, { n: NGEN, steps: 8, eta: 1, seed: GSEED }), I = await sampleChunked(net, { n: NGEN, steps: 8, eta: 0, seed: GSEED });
    return { P: DF.stats(DATA, NN, P.x, NGEN, RM), I: DF.stats(DATA, NN, I.x, NGEN, RM) };
  }

  /* ---------- бассейны: DDIM с η = 0, два старта ---------- */
  function basin() {
    const [a, b] = st.starts, s = DF.sample(DF.netEps(st.D), st.D.sched, { n: 2, steps: BASIN.steps, eta: 0, x0: new Float64Array([a.x, a.y, b.x, b.y]), keep: 2 });
    const q = DF.onSpiral(DATA, NN, s.x, 2);
    st.basin = { traj: s.traj, x: s.x, who: [q.who[0], q.who[1]], dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  /** Карта бассейнов: из узлов сетки 41 × 41 — DDIM на 20 шагах; узел красим по спирали финиша. */
  function basinMap() {
    const key = st.D.steps + st.sched; if (st.map && st.map.key === key) return st.map;
    const G = 41, E = 2.4, xs = new Float64Array(2 * G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i; xs[2 * k] = -E + 2 * E * i / (G - 1); xs[2 * k + 1] = E - 2 * E * j / (G - 1); }
    const s = DF.sample(DF.netEps(st.D), st.D.sched, { n: G * G, steps: BASIN.steps, eta: 0, x0: xs });
    st.map = { key, G, E, who: DF.onSpiral(DATA, NN, s.x, G * G).who }; return st.map;
  }
  function setStarts(a, b) { if (a) st.starts[0] = clampW(a); if (b) st.starts[1] = clampW(b); basin(); draw(); if (ctl) ctl.update(); }
  const clampW = (p) => ({ x: Math.max(-2.3, Math.min(2.3, p.x)), y: Math.max(-2.3, Math.min(2.3, p.y)) });

  /* ---------- рисование ---------- */
  function pane(which) {
    const cv = $(which === 'A' ? '#labCvA' : '#labCvB'), { c, k, P } = sceneBase(cv, M), circle = st.mis >= 2 && st.view !== 'basin';
    if (circle) { const o = M.map(0, 0); c.setLineDash([5, 5]); c.strokeStyle = P.ink2; c.lineWidth = 1.3; c.beginPath(); c.arc(o.x, o.y, RM * M.S, 0, 7); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'половина данных', o.x, o.y - RM * M.S - 9 * k, { px: 10.5, color: P.ink2, haloColor: P.bg }); }
    if (st.view === 'basin' && st.showMap) {
      const mp = basinMap(), cs = M.W / (mp.G - 1);
      for (let j = 0; j < mp.G; j++) for (let i = 0; i < mp.G; i++) { const w = mp.who[j * mp.G + i]; if (w < 0) continue; c.fillStyle = w === 0 ? P.ink3 : P.e2e; c.globalAlpha = w === 0 ? 0.2 : 0.16; c.fillRect(i * cs - cs / 2, j * cs - cs / 2, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    drawData(c, M, P, st.view === 'basin' ? { a1: 0.75, a2: 0.3, r: 1.7 } : {});
    if (st.view === 'basin') spiralTags(c, k, P, M);
    if (st.view === 'train') {
      if (st.preview) dots(c, st.preview, 300, M, 2.3, P.e2e, 0.9);
      status(c, k, P, st.training ? `обучение · эпоха ${Math.round(epochs())} · ${pc(st.prog)}` : st.preview ? `${Math.round(epochs())} эпох · сеть генерирует 300 точек` : 'сеть ещё не обучена');
    } else if (st.view === 'gen' && st.gen) {
      const g = which === 'A' ? st.gen.A : st.gen.B; if (!g) return;
      const n = g.frames.length - 1, f = Math.max(0, Math.min(1, st.anim || 0)) * n, i0 = Math.min(n, Math.floor(f)), i1 = Math.min(n, i0 + 1), u = f - i0, F0 = g.frames[i0], F1 = g.frames[i1];
      // траектории
      c.strokeStyle = P.e2e; c.lineWidth = 1.1; c.globalAlpha = 0.45;
      for (const tr of g.traj) {
        c.beginPath(); for (let j = 0; j <= i0; j++) { const p = M.map(tr[2 * j], tr[2 * j + 1]); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
        if (i1 > i0) { const p = M.map(tr[2 * i0] + (tr[2 * i1] - tr[2 * i0]) * u, tr[2 * i0 + 1] + (tr[2 * i1 + 1] - tr[2 * i0 + 1]) * u); c.lineTo(p.x, p.y); }
        c.stroke();
      }
      c.globalAlpha = 1;
      const cur = new Float64Array(2 * NGEN); for (let j = 0; j < 2 * NGEN; j++) cur[j] = F0[j] + (F1[j] - F0[j]) * u;
      dots(c, cur, NGEN, M, 2.1, P.e2e, 0.9);
      if (which === 'A' && st.gen.reg && st.anim >= 1 && (st.mis === 1 || st.showReg)) dots(c, st.gen.reg.x, NGEN, M, 2.1, P.ink, 0.85);
      status(c, k, P, `${sName(g.eta)} · ${nWord(st.gen.S, 'шаг', 'шага', 'шагов')}${st.anim < 1 ? ` · шаг ${Math.min(st.gen.S, Math.round(f))} из ${st.gen.S}` : ''}`);
    } else if (st.view === 'basin' && st.basin) {
      const b = st.basin, names = ['А', 'Б'];
      for (let s = 0; s < 2; s++) {
        const tr = b.traj[s]; c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath();
        for (let j = 0; j < tr.length / 2; j++) { const p = M.map(tr[2 * j], tr[2 * j + 1]); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.stroke();
        const e = M.map(b.x[2 * s], b.x[2 * s + 1]); c.beginPath(); c.arc(e.x, e.y, 5, 0, 7); c.fillStyle = P.e2e; c.fill(); c.lineWidth = 1.5; c.strokeStyle = P.bg; c.stroke();
        HeroKit.label(c, k, `${names[s]}: ${b.who[s] < 0 ? 'мимо' : 'спираль ' + (b.who[s] + 1)}`, e.x, e.y - 14 * k, { px: 11, weight: 700, color: P.e2e, haloColor: P.bg });
        const p0 = M.map(st.starts[s].x, st.starts[s].y); c.beginPath(); c.arc(p0.x, p0.y, 9, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.ink; c.stroke();
        HeroKit.label(c, k, names[s], p0.x, p0.y, { px: 11, weight: 800, color: P.ink, halo: false });
      }
      status(c, k, P, `DDIM · η = 0 · ${BASIN.steps} шагов`);
    } else status(c, k, P, st.note || '');
    if (st.note && st.view !== 'basin') HeroKit.label(c, k, st.note, M.W / 2, M.W / 2, { px: 13, weight: 700, color: P.ink2, haloColor: P.bg });
  }
  function statLine(el, s, form, extra) {
    setOut(el, `На спиралях <b>${pc(s.on)}</b> · доли спиралей ${pc(s.share[0])} и ${pc(s.share[1])} · за окружностью <b>${pc(s.outer)}</b>${extra || ''}`);
    el.className = 'pane-s' + (form ? (holds(s) ? ' ok' : ' bad') : '');
  }
  function stats() {
    const a = $('#labStatA'), b = $('#labStatB'), form = st.mis >= 2;
    if (st.view === 'basin' && st.basin) { setOut(a, `Старты А и Б в <b>${fx(st.basin.dist, 2)}</b> друг от друга · финиши: ${st.basin.who.map((w) => (w < 0 ? 'мимо спиралей' : 'спираль ' + (w + 1))).join(' и ')}`); a.className = 'pane-s'; return; }
    if (st.view === 'gen' && st.gen) {
      if (st.anim < 1) { setOut(a, 'Точки идут от шума к данным…'); a.className = 'pane-s'; if (st.gen.B) { setOut(b, 'Точки идут от шума к данным…'); b.className = 'pane-s'; } return; }
      // строка регрессии — частью той же строки через setOut, иначе при каждой перерисовке она дописывалась бы снова
      statLine(a, st.gen.A.stats, form, st.gen.reg && (st.mis === 1 || st.showReg) ? ` · регрессия: на спиралях <b>${pc(st.gen.reg.stats.on)}</b>` : '');
      if (st.gen.B) statLine(b, st.gen.B.stats, form);
      return;
    }
    setOut(a, st.training ? `Обучение: ${pc(st.prog)} нажатия` : `Ошибка <b>${fx(st.loss, 4)}</b> · эпох ${Math.round(epochs())}`); a.className = 'pane-s';
  }
  function lossPlot() {
    const W = 520, { c, k, H } = plotFit($('#labLoss'), W, 130, 190), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const yt = [[0, '0'], [0.1, '0,1'], [0.2, '0,2'], [0.3, '0,3'], [0.4, '0,4']], box = { l: Math.max(30, 40 * k), r: W - 12, t: 10, b: H - Math.max(22, 16 * k) };
    const xmax = Math.max(200, Math.ceil(epochs() / 100) * 100), x = (e) => box.l + e / xmax * (box.r - box.l), y = (v) => box.b - Math.min(0.45, v) / 0.45 * (box.b - box.t);
    axes(c, k, P, box, [[0, '0', 'left'], [xmax / 2, String(xmax / 2)], [xmax, `${xmax} эпох`, 'right']], yt, x, y);
    c.setLineDash([5, 4]); c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); c.moveTo(box.l, y(LTH)); c.lineTo(box.r, y(LTH)); c.stroke(); c.setLineDash([]);
    if (st.curve.length > 1) {
      c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath(); st.curve.forEach(([e, v], i) => (i ? c.lineTo(x(e), y(v)) : c.moveTo(x(e), y(v)))); c.stroke();
      const [e, v] = st.curve[st.curve.length - 1]; c.beginPath(); c.arc(x(e), y(v), 3.5, 0, 7); c.fillStyle = P.e2e; c.fill();
      HeroKit.label(c, k, fx(v, 4), Math.min(x(e) + 6 * k, box.r - 30 * k), y(v) - 10 * k, { align: 'left', px: 10.5, mono: true, weight: 700, color: P.e2e, haloColor: P.bg });
    }
  }
  function showLegend() {
    const it = [['обучающие точки: спираль 1 и светлее спираль 2', 'var(--ink-3)', 'dot']];
    if (st.view === 'basin') { it.push(['старты А и Б — перетаскивай мышью или пальцем', 'var(--ink)', 'ring'], ['путь DDIM и финиш', 'var(--e2e)']); if (st.showMap) it.push(['старт придёт на спираль 1', 'color-mix(in srgb, var(--ink-3) 35%, transparent)', 'box'], ['на спираль 2', 'color-mix(in srgb, var(--e2e) 30%, transparent)', 'box']); }
    else {
      it.push(['точки, которые генерирует сеть', 'var(--e2e)', 'dot']);
      if (st.view === 'gen') it.push(['траектории 40 точек', 'var(--e2e)']);
      if (st.gen && st.gen.reg && (st.mis === 1 || st.showReg)) it.push(['регрессия «шум → точка»', 'var(--ink)', 'dot']);
      if (st.mis >= 2) it.push(['окружность: за ней половина данных', 'var(--ink-2)', 'dash']);
    }
    legend('#labLegend', it);
  }
  function draw() {
    pane('A'); if (st.duo && st.view !== 'basin') pane('B');
    $('#labNameA').textContent = st.view === 'basin' ? 'DDIM' : st.view === 'gen' && st.gen ? sName(st.gen.A.eta) : 'Сеть-денойзер';
    $('#labCapA').textContent = st.view === 'basin' ? 'путь от шума детерминирован' : st.view === 'gen' && st.gen ? (st.gen.A.eta >= 0.999 ? 'на каждом шаге — свежий шум' : 'та же сеть') : (st.training ? 'учится' : 'вход — точка и номер шага, выход — шум');
    stats(); lossPlot(); showLegend();
    if (!st.msg) setOut($('#labOut'), st.training ? `Сеть учится: ${pc(st.prog)} нажатия, эпоха ${Math.round(epochs())}.` : epochs() ? `Сеть обучена на ${nWord(Math.round(epochs()), 'эпохе', 'эпохах', 'эпохах')}, ${st.sched === 'lin' ? 'линейное' : 'косинусное'} расписание. Ошибка ${fx(st.loss, 4)}.` : `Сеть ещё не обучалась: ошибка ${fx(st.loss, 2)}. Обучение запускает кнопка в карточке миссии.`);
  }
  function layout() { $('#labDuo').classList.toggle('two', st.duo && st.view !== 'basin'); $('#labPaneB').hidden = !(st.duo && st.view !== 'basin'); }
  function setDuo(v) { st.duo = !!v; $('#labDuoChk').checked = st.duo; layout(); draw(); }
  function rangeSync(id, v, text) { const e = $(id); e.value = v; e.nextElementSibling.textContent = text; setRangeFill(e); }
  function setSteps(s) { st.stepsIdx = Math.max(0, STEPS.indexOf(s) >= 0 ? STEPS.indexOf(s) : 12); rangeSync('#labSteps', st.stepsIdx, String(S())); }
  function setEpochs(E) { st.epochsIdx = Math.max(0, EPOCHS.indexOf(E)); rangeSync('#labEpochs', st.epochsIdx, String(EPOCHS[st.epochsIdx])); }
  function setEta(e) { st.etaIdx = Math.round(e * 10); rangeSync('#labEta', st.etaIdx, fx(eta(), 1)); }
  function setSched(v) {
    if (st.training || st.busy || v === st.sched) return;
    st.sched = v; $$('#wrapSched button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    fresh(); st.note = ''; st.msg = true; draw();
    setOut($('#labOut'), `Сеть сброшена: на ${v === 'lin' ? 'линейном' : 'косинусном'} расписании тот же номер шага значит другой уровень шума, и сеть нужно обучить заново. Нажми «Дообучить».`);
  }
  const api = {
    reset() { st.sched = 'lin'; $$('#wrapSched button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'lin'))); st.R = null; st.showReg = false; $('#labRegChk').checked = false; st.showMap = false; $('#labMapChk').checked = false; setEta(1); setSteps(100); setEpochs(100); st.starts = [{ x: -1.5, y: 1.0 }, { x: 1.4, y: -1.1 }]; fresh(); setDuo(false); draw(); },
    state: () => ({ epochs: epochs(), loss: st.loss, training: st.training, view: st.view, S: S(), duo: st.duo, sched: st.sched, gen: st.gen ? { S: st.gen.S, A: st.gen.A.stats, B: st.gen.B ? st.gen.B.stats : null } : null, basin: st.basin ? { dist: st.basin.dist, who: st.basin.who.slice() } : null }),
    train: (E) => train(E || EPOCHS[st.epochsIdx]), generate, sweep, at8, setStarts, setSteps, setEpochs, setDuo, setEta, setSched, starts: () => st.starts.map((p) => Object.assign({}, p)),
  };
  const formTxt = (s) => `на спиралях ${pc(s.on)}, за окружностью ${pc(s.outer)}`;
  const missions = [
    { short: 'Обучение', title: 'Обучи денойзер', text: `Начинаем с необученной сети: два скрытых слоя по 64 нейрона со случайными весами, а на сцене только ${DATA.N} серых обучающих точек двух спиралей. Нажимай «Обучить»: каждое нажатие даёт сети ещё 100 эпох (число меняет ползунок). Задача выполнена, когда ошибка на графике опустится ниже 0,234. По ходу видно, что сеть уже умеет: каждые 25 эпох она берёт 300 случайных точек шума, убирает из них шум и кладёт результат на сцену оранжевым.`,
      controls: ['epochs'],
      bet: { q: 'как пойдёт кривая ошибки?', options: ['Упадёт почти до нуля', 'Выйдет на плато заметно выше нуля', 'Не сдвинется'], answer: (r) => (r.loss < 0.03 ? 0 : r.loss > 0.9 * r.loss0 ? 2 : 1) },
      action: { label: 'Обучить', run: (X) => X.train() },
      criteria: [{ label: 'Ошибка ниже 0,234', test: (r) => r.loss < LTH }],
      summary: (r) => `${Math.round(r.epochs)} эпох: ошибка ${fx(r.loss, 4)}`,
      hint: 'Ставь 100 эпох за нажатие: порог берётся примерно за два нажатия.',
      fail: (r) => `Ошибка ${fx(r.loss, 4)}, порог 0,234. Спирали на сцене ещё размыты: обучи сеть ещё.`,
      explain: (r) => `Ошибка начала с ${fx(r.loss0, 2)} и за первые эпохи упала до 0,25, а дальше ползёт медленно: сейчас ${fx(r.loss, 4)}. Ниже она почти не опускается: даже через 800 эпох остаётся около 0,225. Часть шума угадать нельзя в принципе: при малом шуме непонятно, из какого места спирали стартовала точка, и сеть выдаёт среднее по всем вариантам. Медленный хвост кривой — это спирали: сеть учит тонкую структуру, и на сцене она проступает. Предсказывает сеть именно шум, а не чистую точку: так устроен DDPM.` },
    { short: 'Генерация', title: 'Сгенерируй обе спирали', text: `Начинаем с ${NGEN} случайных точек гауссова шума: это оранжевое облако, в котором спиралей нет. Нажми кнопку: сеть за 100 шагов DDPM убирает из точек шум, и ты увидишь, как они идут от шума к данным (тонкие линии — пути ${KEEP} из них). Результат засчитан, когда точки легли на спирали: не меньше 90% на спиралях и от 40 до 60% на каждой. Рядом на той же сцене — регрессия «шум → точка»: такая же сеть без номера шага, обученная по MSE выдавать точку данных по случайному шуму; ей достаются те же ${NGEN} стартовых точек шума.`,
      controls: ['epochs', 'train'],
      bet: { q: 'где окажутся точки регрессии?', options: ['На спиралях', 'Облаком в центре', 'Равномерно по всему полю'], answer: (r) => (r.reg.on > 0.6 ? 0 : r.regR < 0.5 ? 1 : 2) },
      action: { label: 'Сгенерировать 1000 точек', run: (X) => X.generate({ S: 100, etaA: 1, duo: false, reg: true }) },
      criteria: [{ label: 'На спиралях не меньше 90% точек диффузии', test: (r) => r.A.on >= 0.9 }, { label: 'На каждой спирали от 40 до 60% точек', test: (r) => r.A.share[0] >= 0.4 && r.A.share[0] <= 0.6 }],
      summary: (r) => `DDPM, 100 шагов: на спиралях ${pc(r.A.on)}, доли ${pc(r.A.share[0])} и ${pc(r.A.share[1])} · регрессия: на спиралях ${pc(r.reg.on)}`,
      hint: 'Если точки размазаны, дообучи сеть кнопкой «Дообучить» под сценой и сгенерируй снова.',
      fail: (r) => (r.A.on < 0.9 ? `На спиралях только ${pc(r.A.on)} точек. Дообучи сеть.` : `Доли спиралей ${pc(r.A.share[0])} и ${pc(r.A.share[1])}: одна спираль явно перевешивает. Дообучи сеть.`),
      explain: (r) => `На спиралях ${pc(r.A.on)} точек, доли спиралей ${pc(r.A.share[0])} и ${pc(r.A.share[1])}. Проследи траектории: каждая точка шума скатывается на одну из спиралей, и на какую — решает её старт. Регрессия кладёт облако в центр: средний радиус её точек ${fx(r.regR, 2)}, на спиралях ${pc(r.reg.on)}. Случайный шум ничего не говорит о том, какая точка нужна, и минимум MSE — среднее всех данных. То же среднее, что в уроке 1.3, только теперь между двумя спиралями.` },
    { short: 'Мало шагов', title: 'Найди, где DDPM теряет форму', text: `Те же ${NGEN} стартовых точек шума и та же сеть, но шагов DDPM меньше: их число задаёт ползунок «Шагов генерации». Уменьшай число шагов и генерируй заново, пока облако не потеряет форму: на крупных шагах точки стягиваются к центру. Результат — число шагов, при котором за пунктирной окружностью осталось меньше 25% точек, а у данных там половина.`,
      controls: ['steps', 'epochs', 'train'],
      bet: { q: 'до скольких шагов можно сократить DDPM без потери формы?', options: ['Примерно до 50', 'Примерно до 10', 'Почти до 3'], answer: (r) => (r.sweep.Sstar >= 30 ? 0 : r.sweep.Sstar >= 6 ? 1 : 2) },
      action: { label: 'Сгенерировать', run: async (X, ctx) => { const r = await X.generate({ etaA: 1, duo: false }); r.sweep = ctx.data.sweep || (ctx.data.sweep = await X.sweep()); return r; } },
      criteria: [{ label: 'DDPM потерял форму: за окружностью меньше 25% точек', test: (r) => r.A.outer < FORM.outer }],
      summary: (r) => `DDPM, ${nWord(r.S, 'шаг', 'шага', 'шагов')}: ${formTxt(r.A)}`,
      hint: 'Двигай ползунок «Шагов генерации» влево: 50, 20, 10, 8…',
      fail: (r) => `За окружностью ${pc(r.A.outer)}: форма ещё держится. Уменьши число шагов.`,
      explain: (r) => `На ${nWord(r.S, 'шаге', 'шагах', 'шагах')} за окружностью осталось ${pc(r.A.outer)} точек, а у данных — половина. Форма держится до ${nWord(r.sweep.Sstar, 'шага', 'шагов', 'шагов')}. Шаг DDPM собирается из оценки чистой точки и свежего шума. На крупном шаге оценка — размытое среднее, а предсказанный шум, который хранит направление движения, почти целиком заменяется свежим. Поэтому облако стягивается к центру. У картинок то же самое: на CIFAR-10 такой сэмплер на 10 шагах даёт FID 41,07 против 4,73 на 1000 шагах (чем меньше FID, тем ближе картинки к настоящим). Почему так, проверим в следующей миссии.` },
    { short: 'DDIM рядом', title: 'Спор двух объяснений', text: `На 8 шагах DDPM терял форму. Объяснений два. Первое: сеть недоучена, и на крупных шагах ей не хватает точности. Второе: виноват способ шагать — DDPM на каждом шаге заменяет предсказанный шум свежим. Выбери объяснение и проверь опытом: на обеих панелях те же ${NGEN} стартовых точек шума и та же сеть, слева DDPM, справа DDIM — шаги без свежего шума. Сгенерируй обе и подбери число шагов не больше 10, при котором DDIM держит форму (на спиралях от 80%, за окружностью от 25%), а DDPM уже нет.`,
      controls: ['steps', 'duo', 'epochs', 'train'],
      onEnter: (X) => { X.setDuo(true); X.setSteps(8); },
      bet: { q: 'почему DDPM на малом числе шагов теряет форму?', options: ['Сеть недоучена: на крупных шагах ей не хватает точности', 'Виноват способ шагать: DDPM заменяет предсказанный шум свежим'], answer: (r) => (r.at8.I.outer - r.at8.P.outer >= 0.05 ? 1 : 0) },
      action: { label: 'Сгенерировать обе', run: async (X, ctx) => { const r = await X.generate({ etaA: 1, duo: true }); r.at8 = ctx.data.at8 || (ctx.data.at8 = r.S === 8 ? { P: r.A, I: r.B } : await X.at8()); return r; } },
      criteria: [{ label: 'Шагов не больше 10', test: (r) => r.S <= 10 }, { label: 'DDIM держит форму: на спиралях от 80%, за окружностью от 25%', test: (r) => !!r.B && holds(r.B) }, { label: 'DDPM на тех же шагах — нет: за окружностью меньше 25%', test: (r) => r.A.outer < FORM.outer }],
      summary: (r) => `${nWord(r.S, 'шаг', 'шага', 'шагов')}: за окружностью DDPM ${pc(r.A.outer)} · DDIM ${pc(r.B.outer)}`,
      hint: 'Попробуй 6, 7 и 8 шагов.',
      fail: (r) => (r.S > 10 ? 'Шагов больше 10. Уменьши число шагов.' : !holds(r.B) ? `DDIM тоже потерял форму: ${formTxt(r.B)}. Возьми шагов чуть больше.` : `DDPM ещё держит форму: ${formTxt(r.A)}. Возьми шагов чуть меньше.`),
      explain: (r) => `Сеть одна и та же, а на ${nWord(r.S, 'шаге', 'шагах', 'шагах')} за окружностью у DDIM ${pc(r.B.outer)} точек, у DDPM — ${pc(r.A.outer)}. Значит, верно второе объяснение: дело в способе шагать. При η = 0 предсказанный шум не выбрасывается, а переносится на следующий шаг, и путь детерминирован. Первое объяснение можно проверить и напрямую: дообучи сеть и снова сгенерируй на 8 шагах — у DDPM облако всё равно стянется. На CIFAR-10 DDIM за 10, 20, 50, 100 и 1000 шагов даёт FID 13,36, 6,84, 4,67, 4,16 и 4,04, 50–100 шагов DDIM почти без потерь. Роботы так и делают: Diffusion Policy (урок 1.5) — DDIM на 10 шагах, π0 (урок 3.6) — 10 шагов flow matching, GR00T N1 (урок 3.7) — 4.` },
    { short: 'Бассейны', title: 'Найди границу бассейнов', text: `Теперь стартуем не из облака, а из двух точек А и Б, которые ты ставишь сам: из каждой DDIM с η = 0 делает ${BASIN.steps} шагов, путь детерминирован и виден целиком. Перетащи А и Б так, чтобы они стояли рядом, ближе 0,25 друг к другу, а пришли на разные спирали. Где-то между ними проходит граница бассейнов: по одну её сторону старты приходят на спираль 1, по другую — на спираль 2.`,
      controls: ['map'],
      criteria: [{ label: 'Старты ближе 0,25', test: (r, s) => !!s.basin && s.basin.dist < BASIN.near }, { label: 'Финиши на разных спиралях', test: (r, s) => !!s.basin && s.basin.who[0] >= 0 && s.basin.who[1] >= 0 && s.basin.who[0] !== s.basin.who[1] }],
      hint: 'Включи «карту бассейнов» под сценой: цвет узла показывает, на какую спираль придёт старт из этой точки. Поставь А и Б рядом по разные стороны границы цветов.',
      explain: (s) => `Старты в ${fx(s.basin.dist, 2)} друг от друга, а финиши — на разных спиралях. Начальный шум выбирает моду, денойзинг доводит до неё. В Diffusion Policy (урок 1.5) так же выбирается стратегия: от шума зависит, объедет Ада чайник слева или справа.` },
    { short: 'Свободно', title: 'Свободный режим', text: `Все ручки: число шагов, η левой панели от 0 (DDIM) до 1 (DDPM), DDIM рядом, регрессия, расписание. Смена расписания сбрасывает сеть: номер шага начинает значить другой уровень шума, и сеть придётся обучить заново. Каждая генерация в этом режиме начинается с ${NGEN} новых случайных точек шума.`,
      final: true,
      action: { label: 'Сгенерировать', run: (X) => X.generate({ etaA: eta(), duo: st.duo, reg: st.showReg, seed: st.freeSeed++ }) },
      summary: (r) => `${nWord(r.S, 'шаг', 'шага', 'шагов')}, η ${fx(eta(), 1)}: ${formTxt(r.A)}${r.B ? ` · DDIM: ${formTxt(r.B)}` : ''}` },
  ];
  function init() {
    fresh();
    legend('#labLossLegend', [['ошибка L_simple', 'var(--e2e)'], ['порог миссии 0,234', 'var(--good)', 'dash']]);
    $('#labEpochs').addEventListener('input', (e) => { st.epochsIdx = +e.target.value; rangeSync('#labEpochs', st.epochsIdx, String(EPOCHS[st.epochsIdx])); });
    $('#labSteps').addEventListener('input', (e) => { st.stepsIdx = +e.target.value; rangeSync('#labSteps', st.stepsIdx, String(S())); });
    $('#labEta').addEventListener('input', (e) => setEta(+e.target.value / 10));
    $('#labDuoChk').addEventListener('change', (e) => setDuo(e.target.checked));
    $('#labRegChk').addEventListener('change', (e) => { st.showReg = e.target.checked; draw(); });
    $('#labMapChk').addEventListener('change', (e) => { st.showMap = e.target.checked; draw(); });
    $$('#wrapSched button').forEach((b) => b.addEventListener('click', () => setSched(b.dataset.v)));
    $('#labTrain').addEventListener('click', async () => { if (st.training || st.busy || (ctl && ctl.busy)) return; $('#labTrain').disabled = true; await train(EPOCHS[st.epochsIdx]); $('#labTrain').disabled = false; });
    const cv = $('#labCvA');
    HeroKit.drag(cv, M.W, M.W, {
      hit: (p) => { if (st.view !== 'basin') return null; for (let s = 0; s < 2; s++) { const q = M.map(st.starts[s].x, st.starts[s].y); if (Math.hypot(p.x - q.x, p.y - q.y) < 26) return s + 1; } return null; },
      move: (o, p) => { const w = M.inv(p.x, p.y); setStarts(o === 1 ? w : null, o === 2 ? w : null); },
    });
    ctl = mountMissions('#labMis', missions, api, {
      controls: { epochs: '#wrapEpochs', train: '#labTrain', steps: '#wrapSteps', duo: '#wrapDuo', eta: '#wrapEta', reg: '#wrapReg', map: '#wrapMap', sched: '#wrapSched' },
      onStep: (i) => {
        st.mis = i;
        if (i === 4) { st.view = 'basin'; basin(); } else st.view = st.gen ? 'gen' : 'train';
        if (i < 3 && i !== 5) setDuo(false);
        cv.classList.toggle('drag', i === 4); layout(); draw();
      },
    });
    setSteps(100); setEpochs(100); setEta(1); layout(); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, STEPS, NGEN, KEEP, BASIN };
})();

/* =====================================================================
   4. Генерация по заказу: classifier-free guidance
   ===================================================================== */
const Guid = (() => {
  const M = mkMap(420, 2.2), PW = 420, TSTEPS = 3000, NS = 500;
  const st = { Dc: null, prog: 0, promise: null, trained: false, wi: 0, c: 0, pts: [], last: null, w0: null };
  let ctl = null;
  const W = () => st.wi / 2;
  const drawT = throttle(() => draw(), 80);
  function train() {
    if (st.promise) return st.promise;
    st.Dc = DF.denoiser({ seed: 6, classes: 2 });
    const g = DF.trainGen(st.Dc, DATA, { steps: TSTEPS, every: 10, rng: DF.rng(24), pUncond: 0.2, lr: (s) => (s < TSTEPS * 0.7 ? 3e-3 : 1e-3) });
    st.promise = runChunked(g, (e) => { st.prog = e.step / e.total; drawT(); }, 12).then(() => { st.trained = true; draw(); });
    return st.promise;
  }
  async function gen(w, c) {
    await train();
    const s = DF.sample(DF.cfgEps(st.Dc, c, w), SCH.lin, { n: NS, steps: 20, eta: 0, seed: 3 });
    return Object.assign({ x: s.x, w, c }, DF.precCov(DATA, NN, s.x, NS, c));
  }
  async function generate() {
    const w = W(), c = st.c, r = await gen(w, c);
    st.last = r; st.pts.push({ w, c, prec: r.prec, cov: r.cov });
    if (w === 0 && c === 0) st.w0 = r.prec;
    if (st.w0 == null) st.w0 = (await gen(0, 0)).prec;
    draw();
    const inZone = st.pts.filter((p) => p.prec >= 0.95 && p.cov >= 0.5);
    return { w, c, prec: r.prec, cov: r.cov, count: st.pts.length, w0: st.w0, zone: inZone.length ? inZone[inZone.length - 1] : null };
  }
  function drawScene() {
    const { c, k, P } = sceneBase($('#gdCv'), M);
    drawData(c, M, P, { hi: st.last ? st.last.c : st.c, a1: 0.55, a2: 0.55, r: 1.6 });
    spiralTags(c, k, P, M);
    if (st.last) dots(c, st.last.x, NS, M, 2.2, P.e2e, 0.9);
    status(c, k, P, !st.trained ? `сеть с условием учится: ${pc(st.prog)}` : st.last ? `w = ${fx(st.last.w, 1)} · спираль ${st.last.c + 1} · ${NS} точек` : 'сеть готова: нажми «Сгенерировать»');
  }
  function drawPlot() {
    const { c, k } = HeroKit.fit($('#gdPlot'), PW, PW), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PW);
    const box = { l: Math.max(42, 46 * k), r: PW - 14, t: 14, b: PW - Math.max(26, 20 * k) }, y0 = 0.4;
    const x = (v) => box.l + v * (box.r - box.l), y = (v) => box.b - (Math.max(y0, v) - y0) / (1 - y0) * (box.b - box.t);
    c.fillStyle = P.good; c.globalAlpha = 0.12; c.fillRect(x(0.5), y(1), x(1) - x(0.5), y(0.95) - y(1)); c.globalAlpha = 1;
    c.setLineDash([4, 4]); c.strokeStyle = P.good; c.lineWidth = 1.2; c.strokeRect(x(0.5), y(1), x(1) - x(0.5), y(0.95) - y(1)); c.setLineDash([]);
    HeroKit.label(c, k, 'цель', x(0.75), y(0.975), { px: 10.5, weight: 700, color: P.good, haloColor: P.bg });
    axes(c, k, P, box, [[0, '0', 'left'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%', 'right']], [[0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']], x, y);
    HeroKit.label(c, k, 'точность', box.l + 4 * k, box.t + 8 * k, { align: 'left', px: 10.5, color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, 'покрытие →', box.r, box.b - 10 * k, { align: 'right', px: 10.5, color: P.ink3, haloColor: P.bg });
    for (const cc of [0, 1]) {
      const ps = st.pts.filter((p) => p.c === cc).sort((a, b) => a.w - b.w); if (ps.length < 2) continue;
      c.strokeStyle = P.e2e; c.globalAlpha = 0.45; c.lineWidth = 1.4; c.beginPath(); ps.forEach((p, i) => (i ? c.lineTo(x(p.cov), y(p.prec)) : c.moveTo(x(p.cov), y(p.prec)))); c.stroke(); c.globalAlpha = 1;
    }
    const seen = new Set();
    st.pts.forEach((p, i) => {
      const X = x(p.cov), Y = y(p.prec), last = i === st.pts.length - 1;
      c.beginPath(); c.arc(X, Y, last ? 5.5 : 4, 0, 7); c.fillStyle = p.c ? P.surf : P.e2e; c.fill(); c.lineWidth = 2; c.strokeStyle = P.e2e; c.stroke();
      const key = `${p.c}:${p.w}`; if (seen.has(key)) return; seen.add(key);
      HeroKit.label(c, k, `w=${fx(p.w, 1).replace(',0', '')}`, X + 7 * k, Y - 9 * k, { align: 'left', px: 10, mono: true, color: P.ink2, haloColor: P.bg });
    });
  }
  function draw() {
    drawScene(); drawPlot();
    setOut($('#gdOut'), !st.trained ? `Сеть с условием учится: ${pc(st.prog)}. Это несколько секунд.` : st.last ? `w = <b>${fx(st.last.w, 1)}</b> · спираль ${st.last.c + 1} · точность <b>${pc(st.last.prec, 1)}</b> · покрыто <b>${pc(st.last.cov, 1)}</b> · точек на графике: ${st.pts.length}` : 'Сеть готова. Выбери w и нажми «Сгенерировать».');
  }
  function setW(wi) { st.wi = wi; const e = $('#gdW'); e.value = wi; e.nextElementSibling.textContent = fx(W(), 1).replace(',0', ''); setRangeFill(e); }
  function setC(c) { st.c = c; $$('#wrapCond button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === c))); }
  const api = { reset() { st.pts = []; st.last = null; setW(0); setC(0); draw(); }, state: () => ({ trained: st.trained, count: st.pts.length, pts: st.pts.slice() }), train, generate, setW: (w) => setW(Math.round(w * 2)), setC, gen };
  const missions = [
    { short: 'Кривая', title: 'Кривая «точность — разнообразие»', text: 'Меняй вес w и генерируй точки на спирали 1. Построй кривую хотя бы из четырёх точек и найди w, при котором точность не ниже 95%, а покрыто не меньше половины спирали.',
      controls: ['w'],
      bet: { q: 'сколько точек ляжет на спираль 1 без guidance, при w = 0?', options: ['Все', 'Около 80%', 'Около половины'], answer: (r) => (r.w0 >= 0.95 ? 0 : r.w0 >= 0.65 ? 1 : 2) },
      action: { label: 'Сгенерировать 500 точек', run: (X) => X.generate() },
      criteria: [{ label: 'На графике не меньше четырёх точек', test: (r) => r.count >= 4 }, { label: 'Есть w с точностью от 95% и покрытием от 50%', test: (r) => !!r.zone }],
      summary: (r) => `w = ${fx(r.w, 1)}: точность ${pc(r.prec, 1)}, покрыто ${pc(r.cov, 1)}`,
      hint: 'Начни с w = 0, потом попробуй 1, 2, 4 и 8.',
      fail: (r) => (!r.zone ? 'Пока ни одна точка не попала в зелёную зону. Попробуй другие w.' : `Точек на графике: ${r.count}. Построй кривую хотя бы из четырёх.`),
      explain: (r) => `При w = ${fx(r.zone.w, 1)} точность ${pc(r.zone.prec, 1)}, покрыто ${pc(r.zone.cov, 1)}. Без guidance на спираль 1 попадало ${pc(r.w0, 1)} точек. Чем сильнее guidance, тем увереннее точки ложатся на заказанную спираль, но тем меньше её частей они покрывают: точки сбиваются туда, где спираль 1 меньше всего похожа на спираль 2. При очень большом w точки перелетают спираль. У картинок лучший FID получается при w = 0,1–0,3, лучший IS — при w ≥ 4: это тот же обмен разнообразия на точность. У роботов: в Decision Diffuser шкала 1,2–1,8, авторы π*0.6 (поздняя модель Physical Intelligence; урок 3.8) предупреждают, что большие веса делают поведение агрессивным, π0.7 берёт β ∈ {1,3; 1,7; 2,2}. В статьях Diffusion Policy и π0 guidance нет.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Генерируй с любым w и на любой спирали. Посмотри, куда сбиваются точки при w = 8.', final: true, controls: ['w', 'cond'],
      action: { label: 'Сгенерировать 500 точек', run: (X) => X.generate() },
      summary: (r) => `спираль ${r.c + 1}, w = ${fx(r.w, 1)}: точность ${pc(r.prec, 1)}, покрыто ${pc(r.cov, 1)}` },
  ];
  function init() {
    legend('#gdLegend', [['заказанная спираль', 'var(--ink-3)', 'dot'], ['сгенерированные точки', 'var(--e2e)', 'dot']]);
    legend('#gdPlotLegend', [['генерации, подпись — вес w', 'var(--e2e)', 'dot'], ['цель: точность от 95%, покрытие от 50%', 'var(--good)', 'box']]);
    $('#gdW').addEventListener('input', (e) => setW(+e.target.value));
    $$('#wrapCond button').forEach((b) => b.addEventListener('click', () => setC(+b.dataset.v)));
    ctl = mountMissions('#gdMis', missions, api, { controls: { w: '#wrapW', cond: '#wrapCond' } });
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); train(); } }, { rootMargin: '300px' });
    io.observe($('#guide'));
    setW(0); setC(0); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   5. Память или обобщение: шторка «идеальный денойзер — сеть»
   ===================================================================== */
const Memo = (() => {
  const M = mkMap(420, 2.1), NS = [4, 8, 16, 32, 64, 128], TOT = 8000, EVERY = 1000, NSAMP = 300, RC = 0.02;
  const st = { N: 8, si: 8, cx: 0.5, runs: {}, busy: false, prog: 0, mis: 0 };
  let ctl = null;
  const drawT = throttle(() => draw(), 80);
  function snap(R, Dn) { const s = DF.sample(DF.netEps(Dn), SCH.lin, { n: NSAMP, steps: 50, eta: 0, seed: 4 }); R.snaps.push({ step: Dn.steps, x: s.x, copies: DF.copies(R.nnT, s.x, NSAMP, RC) }); }
  function run(N) {
    const old = st.runs[N]; if (old) return old.promise;
    const sub = DF.subset(DATA, N, 3), nnT = DF.nnIndex(sub, 0.1), ideal = DF.sample(DF.exactEps(sub, SCH.lin), SCH.lin, { n: NSAMP, steps: 50, eta: 0, seed: 4 });
    const R = { N, sub, nnT, ideal: { x: ideal.x, copies: DF.copies(nnT, ideal.x, NSAMP, RC) }, snaps: [], done: false };
    st.runs[N] = R; st.busy = true; st.prog = 0;
    const Dn = DF.denoiser({ seed: 5 }); snap(R, Dn);
    const g = DF.trainGen(Dn, sub, { steps: TOT, bs: 64, every: 50, rng: DF.rng(31), lr: 3e-3 });
    R.promise = runChunked(g, (e) => { if (Dn.steps % EVERY === 0) { snap(R, Dn); if (st.N === N) setSi(R.snaps.length - 1, true); } st.prog = e.step / e.total; drawT(); }, 12).then(() => { R.done = true; st.busy = false; draw(); if (ctl) ctl.update(); return R; });
    return R.promise;
  }
  const cur = () => st.runs[st.N];
  const copiesAt = (R, i) => (R && R.snaps[i] ? R.snaps[i].copies : null);
  function draw() {
    const { c, k, P } = sceneBase($('#mmCv'), M), R = cur(), cxp = st.cx * M.W;
    drawData(c, M, P, { a1: 0.16, a2: 0.1, r: 1.3 });
    const side = (x0, x1, pts) => { c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, M.W); c.clip(); if (pts) dots(c, pts, NSAMP, M, 2.3, P.e2e, 0.85); c.restore(); };
    if (R) {
      side(0, cxp, R.ideal.x);
      const sn = R.snaps[Math.min(st.si, R.snaps.length - 1)]; side(cxp, M.W, sn ? sn.x : null);
      c.lineWidth = 1.8; c.strokeStyle = P.ink;
      for (let i = 0; i < R.N; i++) { const q = M.map(R.sub.X[2 * i], R.sub.X[2 * i + 1]); c.beginPath(); c.arc(q.x, q.y, 4.2, 0, 7); c.stroke(); }
    }
    c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(cxp, 0); c.lineTo(cxp, M.W); c.stroke();
    c.beginPath(); c.arc(cxp, M.W / 2, 10, 0, 7); c.fillStyle = P.surf; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cxp - 4, M.W / 2 - 3); c.lineTo(cxp - 7, M.W / 2); c.lineTo(cxp - 4, M.W / 2 + 3); c.moveTo(cxp + 4, M.W / 2 - 3); c.lineTo(cxp + 7, M.W / 2); c.lineTo(cxp + 4, M.W / 2 + 3); c.stroke();
    const sn = R && R.snaps[Math.min(st.si, R.snaps.length - 1)];
    HeroKit.label(c, k, R ? `идеальный · копий ${pc(R.ideal.copies)}` : 'идеальный денойзер', 8 * k, 15 * k, { align: 'left', px: 11, mono: true, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, !R ? 'сеть' : !sn ? 'сеть учится…' : `сеть · шаг ${sn.step} · копий ${pc(sn.copies)}`, M.W - 8 * k, 15 * k, { align: 'right', px: 11, mono: true, color: P.ink2, haloColor: P.bg });
    if (R && !R.done) HeroKit.label(c, k, `обучение: ${pc(st.prog)}`, M.W - 8 * k, 32 * k, { align: 'right', px: 11, mono: true, color: P.e2e, haloColor: P.bg });
    if (!R) HeroKit.label(c, k, 'нажми «Обучить» в карточке миссии', M.W / 2, M.W / 2 + 28 * k, { px: 12, color: P.ink2, haloColor: P.bg });
    const ip = R ? pc(R.ideal.copies) : '—', np = sn ? `${pc(sn.copies)} на шаге ${sn.step}` : '—';
    setOut($('#mmOut'), `N = <b>${st.N}</b> · копий: идеальный денойзер <b>${ip}</b> · сеть <b>${np}</b>`);
    $$('#wrapN button').forEach((b) => { b.setAttribute('aria-pressed', String(+b.dataset.n === st.N)); const r = st.runs[+b.dataset.n]; b.title = r && r.done ? `копий в конце: ${pc(copiesAt(r, r.snaps.length - 1))}` : ''; });
  }
  function setSi(i, quiet) { st.si = Math.max(0, Math.min(8, i)); const e = $('#mmStep'); e.value = st.si; e.nextElementSibling.textContent = String(st.si * EVERY); setRangeFill(e); draw(); if (!quiet && ctl) ctl.update(); }
  function setN(N) { st.N = N; const R = cur(); setSi(R ? Math.min(8, R.snaps.length - 1) : 8, true); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.cx = 0.5; setN(8); },
    state: () => { const R = cur(); return { N: st.N, si: st.si, step: st.si * EVERY, done: !!(R && R.done), c: copiesAt(R, st.si), cprev: st.si > 0 ? copiesAt(R, st.si - 1) : null, cEnd: R && R.done ? copiesAt(R, 8) : null }; },
    run: async (N) => { if (N != null) setN(N); const R = await run(st.N); setSi(8); return { N: st.N, c1: copiesAt(R, 1), cEnd: copiesAt(R, 8), ideal: R.ideal.copies, curve: R.snaps.map((s) => s.copies) }; },
    setN, setSi, setCx: (v) => { st.cx = Math.max(0.03, Math.min(0.97, v)); draw(); },
  };
  const missions = [
    { short: 'Восемь точек', title: 'Сеть на восьми точках', text: 'Обучи сеть на восьми точках со спиралей: 8000 шагов, это несколько секунд. Каждые 1000 шагов сеть генерирует 300 точек, а ползунок шагов идёт следом.',
      controls: [], onEnter: (X) => X.setN(8),
      bet: { q: 'что будет с долей копий у сети по ходу обучения?', options: ['Будет расти', 'Будет падать', 'Не изменится'], answer: (r) => (r.cEnd - r.c1 > 0.1 ? 0 : r.cEnd - r.c1 < -0.1 ? 1 : 2) },
      action: { label: 'Обучить на 8 точках', run: (X) => X.run(8) },
      criteria: [{ label: 'К концу обучения копий больше половины', test: (r) => r.cEnd > 0.5 }],
      summary: (r) => `N = 8: копий через 1000 шагов ${pc(r.c1)}, к 8000 — ${pc(r.cEnd)}`,
      explain: (r) => `Через 1000 шагов сеть копирует ${pc(r.c1)} сэмплов, к 8000 — ${pc(r.cEnd)}. Идеальный денойзер копирует всегда: ${pc(r.ideal)}. Сначала сеть выучивает гладкую форму и кладёт точки рядом с обучающими, потом подгоняется под сами точки.` },
    { short: 'Когда', title: 'Когда начинается копирование', text: 'Двигай ползунок «Шаг обучения» и найди первое измерение, на котором сеть копирует больше половины сэмплов. Шторку можно сдвигать.',
      controls: ['step'], onEnter: (X) => { X.setN(8); X.setSi(0); },
      criteria: [{ label: 'На этом шаге копий больше половины', test: (r, s) => s.c != null && s.c > 0.5 }, { label: 'На прошлом измерении — не больше половины', test: (r, s) => s.cprev != null && s.cprev <= 0.5 }],
      hint: 'Начни с шага 1000 и иди вправо по одному измерению.',
      explain: (s) => `С шага ${s.step} сеть копирует ${pc(s.c)} сэмплов, а на шаге ${s.step - EVERY} было ${pc(s.cprev)}. До этого есть окно, где сеть уже генерирует точки рядом с обучающими, но ещё не повторяет их. На это окно рассчитана ранняя остановка: Bonnaire et al. показали, что время до запоминания растёт с размером выборки.` },
    { short: 'Сколько данных', title: 'Сколько нужно данных', text: 'Выбери число обучающих точек N и обучи сеть. Найди N, при котором копий меньше четверти даже в конце обучения.',
      controls: ['n', 'step'],
      action: { label: 'Обучить сеть', run: (X) => X.run() },
      criteria: [{ label: 'Копий в конце обучения меньше 25%', test: (r) => r.cEnd < 0.25 }],
      summary: (r) => `N = ${r.N}: копий в конце ${pc(r.cEnd)}`,
      hint: 'Попробуй N = 32, потом 64 и 128.',
      fail: (r) => `На ${r.N} точках копий в конце ${pc(r.cEnd)}. Возьми больше точек.`,
      explain: (r) => `На ${r.N} точках за 8000 шагов копий только ${pc(r.cEnd)}: сеть не успевает запомнить столько точек, хотя идеальный денойзер копирует ${pc(r.ideal)}. У картинок переход от запоминания к обобщению начинается около N = 1000 (Kadkhodaie et al.), а на CIFAR-10 — 0% копий на 50 тыс. картинок и больше 90% на 1 тыс. (Gu et al.). Diffusion Policy на малых данных ведёт себя как таблица поиска: даже на фото кошки выдаёт траекторию из обучения (препринт 2505.05787).` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй N, шаг обучения и шторку. Сравни, как сеть на 16 и на 128 точках копирует к концу обучения.', final: true, controls: ['n', 'step'] },
  ];
  function init() {
    legend('#mmLegend', [['обучающие точки', 'var(--ink)', 'ring'], ['сэмплы', 'var(--e2e)', 'dot'], ['шторка — перетаскивай мышью или пальцем', 'var(--ink)']]);
    NS.forEach((N) => { const b = h('button', { type: 'button', 'data-n': N }, `N = ${N}`); b.addEventListener('click', () => { setN(N); if (st.mis === 3) run(N); }); $('#wrapN').append(b); });
    $('#mmStep').addEventListener('input', (e) => setSi(+e.target.value));
    HeroKit.drag($('#mmCv'), M.W, M.W, {
      hit: (p) => (Math.abs(p.x - st.cx * M.W) < 22 ? 'c' : null), move: (o, p) => api.setCx(p.x / M.W), tap: (p) => api.setCx(p.x / M.W), tapCursor: 'ew-resize',
    });
    ctl = mountMissions('#mmMis', missions, api, { controls: { n: '#wrapN', step: '#wrapMemoStep' }, onStep: (i) => { st.mis = i; } });
    setSi(8, true); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, run };
})();

/* =====================================================================
   6. Те же точки, но это действия Ады: денойзер лаборатории учится на
   действиях объезда чайника из урока 1.3, рядом регрессия «шум → действие»
   ===================================================================== */
const Acts = (() => {
  const A = DF.ACT, PW = 420, E = 2.2, STEPS = [3, 5, 10, 20, 50, 100], SHARES = [0.5, 0.7, 0.9], NG = A.gen, GSEED = 2;
  const box = { l: 50, r: 408, t: 18, b: 376 };
  const X = (u) => box.l + (u + E) / (2 * E) * (box.r - box.l), Y = (v) => box.b - (v + E) / (2 * E) * (box.b - box.t);
  const cmv = (u) => fx(u * A.cm, 1);
  const st = { share: 0.5, data: {}, nets: {}, regs: {}, training: false, prog: 0, preview: null, gen: null, anim: 1, eta: 1, stepsIdx: 5, busy: false, freeSeed: 100, mis: 0, note: '' };
  let ctl = null;
  const data = (s) => st.data[s] || (st.data[s] = DF.actions(s, 4));
  const S = () => STEPS[st.stepsIdx];
  const drawT = throttle(() => draw(), 60);
  const sName = (e) => (e >= 0.999 ? 'DDPM' : 'DDIM');
  const shareTxt = (s) => `${Math.round(s * 100)} на ${Math.round((1 - s) * 100)}`;

  /* ---------- обучение и генерация ---------- */
  function train(s) {
    if (st.nets[s]) return Promise.resolve(st.nets[s]);
    const D = DF.actDenoiser(5), d = data(s); st.training = true; st.prog = 0; st.preview = null; draw();
    return runChunked(DF.actTrainGen(D, d, { every: 10 }), (e) => {
      st.prog = e.step / e.total;
      if (e.step % 500 === 0) st.preview = DF.sample(DF.netEps(D), D.sched, { n: NG, steps: 20, eta: 0, seed: 3 }).x;
      drawT();
    }, 12).then(() => { st.training = false; st.preview = null; st.nets[s] = D; draw(); return D; });
  }
  function regTrain(s) {
    if (st.regs[s]) return Promise.resolve(st.regs[s]);
    const R = DF.regressor(8);
    return runChunked(DF.regTrainGen(R, data(s), { steps: A.regSteps }), () => {}, 12).then(() => { st.regs[s] = R; return R; });
  }
  function sampleChunked(epsFn, sched, o) {
    const g = DF.sampleGen(epsFn, sched, o);
    return new Promise((res, rej) => {
      const step = () => { const t0 = performance.now(); try { for (;;) { const x = g.next(); if (x.done) { res(x.value); return; } if (performance.now() - t0 > 14) break; } } catch (e) { rej(e); return; } setTimeout(step, 0); };
      step();
    });
  }
  /** Обучить (если ещё нет), сгенерировать NG действий из шума, прогнать те же стартовые шумы через регрессию. */
  async function run(o) {
    o = Object.assign({ seed: GSEED, S: 100, eta: 1 }, o || {});
    const s = st.share; st.busy = true; st.gen = null; draw();
    const D = await train(s), R = await regTrain(s);
    st.note = 'считаю…'; draw();
    const G = await sampleChunked(DF.netEps(D), D.sched, { n: NG, steps: o.S, eta: o.eta, seed: o.seed, frames: true });
    const ry = DF.regPredict(R, G.x0, NG), sa = DF.actStats(G.x, NG), sr = DF.actStats(ry, NG);
    st.gen = { x: G.x, frames: G.frames, reg: ry, A: sa, R: sr, S: o.S, eta: o.eta, share: s }; st.note = '';
    await animate(Math.max(900, Math.min(2000, 500 + o.S * 12)), (p) => { st.anim = p; draw(); });
    st.busy = false; draw();
    return { A: sa, R: sr, S: o.S, eta: o.eta, share: s };
  }

  /* ---------- схема сверху: Ада, чайник, два объезда ---------- */
  function ada(c, P, x, y) {
    c.save(); c.translate(x, y);
    c.fillStyle = P.ink3; c.globalAlpha = 0.8;                                           // колёсная база
    c.beginPath(); c.roundRect(-20, -14, 40, 30, 7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = P.ink; c.beginPath(); c.roundRect(-24, -8, 6, 18, 2); c.roundRect(18, -8, 6, 18, 2); c.fill(); // колёса
    c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.e2e; c.stroke(); // корпус
    c.fillStyle = P.surf; c.strokeStyle = P.ink2; c.lineWidth = 1.5;                                                   // руки, вперёд
    for (const sx of [-1, 1]) { c.beginPath(); c.roundRect(sx * 15 - 3, -16, 6, 16, 3); c.fill(); c.stroke(); }
    c.beginPath(); c.roundRect(-5, -10, 10, 11, 4); c.fillStyle = '#1f2430'; c.fill();                                // голова, экран вперёд
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(-2.3, -6.5, 1.3, 0, 7); c.arc(2.3, -6.5, 1.3, 0, 7); c.fill();
    c.restore();
  }
  function kettle(c, P, x, y, hot) {
    const R = 13; c.save(); c.translate(x, y); c.lineWidth = 2; c.strokeStyle = hot ? P.bad : P.ink2; c.fillStyle = P.surf;
    c.beginPath(); c.moveTo(R - 2, -3); c.lineTo(R + 9, -7); c.lineTo(R + 10, -4); c.lineTo(R - 1, 3); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(-R - 1, 0, 6, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.45, 0, 7); c.stroke();
    c.restore();
  }
  function drawScheme() {
    const W = 300, H = 420, { c, k } = HeroKit.fit($('#acScheme'), W, H), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 30, P.grid);
    const cx = 150, yA = 372, yK = 212, yG = 46, s1 = 30, s2 = 30, g = st.gen && st.anim >= 1 ? st.gen : null;
    const route = (sg) => [[cx, yA - 22], [cx + sg * s1, 302], [cx + sg * (s1 + s2), 254], [cx + sg * (s1 + s2), 170], [cx, yG + 26]];
    const poly = (pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); };
    // цель
    c.setLineDash([4, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, yG, 14, 0, 7); c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, 'цель', cx + 30, yG, { align: 'left', px: 11, color: P.ink2, haloColor: P.bg });
    // объезды: до генерации — демонстрации пунктиром, после — доли действий диффузии
    for (const sg of [-1, 1]) {
      const pts = route(sg), n = g ? (sg < 0 ? g.A.left : g.A.right) : 0;
      if (g) { c.strokeStyle = P.e2e; c.lineWidth = n ? 1.5 + 6 * n / NG : 1; c.globalAlpha = n ? 1 : 0.3; c.setLineDash([]); }
      else { c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.setLineDash([5, 4]); }
      c.lineJoin = 'round'; poly(pts); c.setLineDash([]); c.globalAlpha = 1;
      // метки шагов 1 и 2 на концах отрезков
      for (const [j, t] of [[1, '1'], [2, '2']]) {
        const p = pts[j]; c.beginPath(); c.arc(p[0], p[1], 7, 0, 7); c.fillStyle = g ? P.e2e : P.ink3; c.fill();
        HeroKit.label(c, k, t, p[0], p[1], { px: 9.5, weight: 800, color: P.bg, halo: false });
      }
      const lx = cx + sg * (s1 + s2) + sg * 10, ly = 210, al = sg < 0 ? 'right' : 'left';
      if (g) HeroKit.label(c, k, `${n} из ${NG}`, lx, ly, { align: al, px: 11, weight: 700, color: P.e2e, haloColor: P.bg });
      else { HeroKit.label(c, k, 'объезд', lx, ly - 7, { align: al, px: 10.5, color: P.ink3, haloColor: P.bg }); HeroKit.label(c, k, sg < 0 ? 'слева' : 'справа', lx, ly + 7, { align: al, px: 10.5, color: P.ink3, haloColor: P.bg }); }
    }
    // регрессия: среднее двух объездов — прямо в чайник
    if (g) {
      const px = (u) => cx + u * A.cm;    // 1 px = 1 см
      c.strokeStyle = P.ink; c.lineWidth = 2.2; c.setLineDash([]); c.beginPath(); c.moveTo(cx, yA - 22); c.lineTo(px(g.R.mx), 302); c.lineTo(px(g.R.mx + g.R.my), 254); c.lineTo(px(g.R.mx + g.R.my), yK + 4); c.stroke();
      if (g.R.meanBand) { HeroKit.cross(c, px(g.R.mx + g.R.my), yK, 7, P.bad, 3); HeroKit.label(c, k, 'регрессия: в чайник', cx, yK - 24, { px: 11, weight: 700, color: P.bad, haloColor: P.bg }); }
      else { c.beginPath(); c.moveTo(px(g.R.mx + g.R.my), yK + 4); c.lineTo(px(g.R.mx + g.R.my), 170); c.lineTo(cx, yG + 26); c.stroke(); HeroKit.label(c, k, 'регрессия: мимо, за большинством', cx, yK - 26, { px: 11, weight: 700, color: P.ink, haloColor: P.bg }); }
    }
    kettle(c, P, cx, yK, !!(g && g.R.meanBand));
    HeroKit.label(c, k, 'чайник', cx, yK + 26, { px: 11, weight: 650, color: P.ink2, haloColor: P.bg });
    ada(c, P, cx, yA);
    HeroKit.label(c, k, 'Ада', cx + 36, yA + 2, { align: 'left', px: 11.5, weight: 700, color: P.ink, haloColor: P.bg });
    HeroKit.label(c, k, 'едет вверх', cx + 36, yA + 16, { align: 'left', px: 10, color: P.ink3, haloColor: P.bg });
    if (!g) HeroKit.label(c, k, 'демонстрации: пунктир', cx, H - 10, { px: 10.5, color: P.ink3, haloColor: P.bg });
    else HeroKit.label(c, k, `${sName(g.eta)}, ${nWord(g.S, 'шаг', 'шага', 'шагов')}`, cx, H - 10, { px: 10.5, color: P.ink3, haloColor: P.bg });
  }

  /* ---------- график действий ---------- */
  function drawPlot() {
    const { c, k } = HeroKit.fit($('#acCv'), PW, PW), P = pal(), d = data(st.share), narrow = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PW);
    const ticks = [-2, -1, 0, 1, 2];
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath();
    for (const u of ticks) { c.moveTo(X(u), box.t); c.lineTo(X(u), box.b); c.moveTo(box.l, Y(u)); c.lineTo(box.r, Y(u)); }
    c.stroke();
    c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(X(0), box.t); c.lineTo(X(0), box.b); c.moveTo(box.l, Y(0)); c.lineTo(box.r, Y(0)); c.stroke();
    for (const u of ticks) {
      const t = u ? `${u > 0 ? '+' : '−'}${Math.abs(u) * A.cm}` : '0';
      HeroKit.label(c, k, t, X(u), box.b + Math.max(12, 9 * k), { px: 10, mono: true, color: P.ink3, halo: false });
      HeroKit.label(c, k, t, box.l - 5, Y(u), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
    }
    HeroKit.label(c, k, narrow ? 'шаг 1, см: ← влево · вправо →' : 'сдвиг на шаге 1, см: ← влево · вправо →', (box.l + box.r) / 2, PW - 9, { px: 10.5, color: P.ink2, halo: false });
    c.save(); c.translate(11, (box.t + box.b) / 2); c.rotate(-Math.PI / 2);
    HeroKit.label(c, k, narrow ? 'шаг 2, см: ← влево · вправо →' : 'сдвиг на шаге 2, см: ← влево · вправо →', 0, 0, { px: 10.5, color: P.ink2, halo: false });
    c.restore();
    // полоса чайника: |x + y| < band
    c.save(); c.beginPath(); c.rect(box.l, box.t, box.r - box.l, box.b - box.t); c.clip();
    const b = A.band, q = E + 1, pts = [[-q, b + q], [b + q, -q], [-b + q, -q], [-q, -b + q]];
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.closePath();
    c.fillStyle = P.bad; c.globalAlpha = 0.07; c.fill(); c.globalAlpha = 1;
    HeroKit.hatch(c, box.l, box.t, box.r, box.b, P.bad, 12, 0.6);
    c.restore();
    c.save(); c.translate(X(-1.45), Y(1.45)); c.rotate(Math.PI / 4); HeroKit.label(c, k, narrow ? 'задевает чайник' : 'Ада задевает чайник', 0, 0, { px: 10.5, weight: 700, color: P.bad, haloColor: P.bg }); c.restore();
    c.save(); c.translate(X(1.15), Y(-1.15)); c.rotate(Math.PI / 4); HeroKit.label(c, k, narrow ? 'сдвиг < 30 см' : 'суммарный сдвиг меньше 30 см', 0, 0, { px: 10.5, weight: 700, color: P.bad, haloColor: P.bg }); c.restore();
    // сгустки: окружности радиуса R вокруг центров
    c.setLineDash([4, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.2;
    for (const sg of [-1, 1]) { c.beginPath(); c.arc(X(sg * A.c), Y(sg * A.c), A.R / (2 * E) * (box.r - box.l), 0, 7); c.stroke(); }
    c.setLineDash([]);
    HeroKit.label(c, k, 'оба шага влево', X(-A.c), Y(-A.c + A.R + 0.17), { px: 10.5, weight: 650, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, 'оба шага вправо', X(A.c), Y(A.c - A.R - 0.17), { px: 10.5, weight: 650, color: P.ink2, haloColor: P.bg });
    // демонстрации
    c.fillStyle = P.ink3; c.globalAlpha = 0.35; c.beginPath();
    for (let i = 0; i < d.N; i++) { const x = X(d.X[2 * i]), y = Y(d.X[2 * i + 1]); c.moveTo(x + 1.7, y); c.arc(x, y, 1.7, 0, 7); }
    c.fill(); c.globalAlpha = 1;
    const dot = (x, y, r, col, al) => { c.globalAlpha = al; c.fillStyle = col; c.beginPath(); c.arc(X(x), Y(y), r, 0, 7); c.fill(); c.globalAlpha = 1; };
    if (st.training && st.preview) for (let i = 0; i < NG; i++) dot(st.preview[2 * i], st.preview[2 * i + 1], 2.4, P.e2e, 0.6);
    const g = st.gen;
    if (g) {
      const n = g.frames.length - 1, f = Math.max(0, Math.min(1, st.anim)) * n, i0 = Math.min(n, Math.floor(f)), i1 = Math.min(n, i0 + 1), u = f - i0, F0 = g.frames[i0], F1 = g.frames[i1], fin = st.anim >= 1;
      for (let i = 0; i < NG; i++) { const x = F0[2 * i] + (F1[2 * i] - F0[2 * i]) * u, y = F0[2 * i + 1] + (F1[2 * i + 1] - F0[2 * i + 1]) * u; dot(x, y, 3, fin && g.A.who[i] < 0 ? P.bad : P.e2e, 0.85); }
      if (fin) {
        for (let i = 0; i < NG; i++) dot(g.reg[2 * i], g.reg[2 * i + 1], 2.4, P.ink, 0.7);
        HeroKit.cross(c, X(g.R.mx), Y(g.R.my), 7, P.ink, 3);
        HeroKit.label(c, k, 'среднее регрессии', X(g.R.mx) + 12 * k, Y(g.R.my) + 12 * k, { align: 'left', px: 10.5, weight: 700, color: P.ink, haloColor: P.bg });
      }
    }
    const txt = st.training ? `сеть учится на ${d.N} действиях: ${pc(st.prog)}` : st.note ? st.note : g ? `${sName(g.eta)} · ${nWord(g.S, 'шаг', 'шага', 'шагов')} · ${NG} действий${st.anim < 1 ? ` · шаг ${Math.min(g.S, Math.round(st.anim * g.S))}` : ''}` : `${d.N} действий из демонстраций · слева ${Math.round(st.share * 100)}%`;
    HeroKit.label(c, k, txt, box.l + 6, box.t + 9 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    if (!g && !st.training) HeroKit.label(c, k, narrow ? 'нажми «Обучить и сгенерировать»' : 'нажми «Обучить и сгенерировать» в карточке миссии', (box.l + box.r) / 2, Y(0.55), { px: 11.5, weight: 700, color: P.e2e, haloColor: P.bg });
  }
  function showLegend() {
    const it = [['действия из демонстраций', 'var(--ink-3)', 'dot'], ['сгусток: ближе 20 см к его центру', 'var(--ink-3)', 'dash'], ['полоса: Ада задевает чайник', 'var(--critical)', 'box'], ['действия диффузии', 'var(--e2e)', 'dot']];
    if (st.gen && st.gen.A.stray) it.push(['действие вне сгустков', 'var(--critical)', 'dot']);
    if (st.gen) it.push(['действия регрессии из тех же стартов, крест — их среднее', 'var(--ink)', 'dot']);
    legend('#acLegend', it);
  }
  function draw() {
    drawScheme(); drawPlot(); showLegend();
    const g = st.gen, d = data(st.share);
    setOut($('#acOut'), st.training ? `Сеть учится на ${d.N} действиях: ${pc(st.prog)}. Это несколько секунд.` : g && st.anim >= 1 ? `Диффузия: в сгустках <b>${g.A.inCluster} из ${NG}</b> (влево ${g.A.left}, вправо ${g.A.right}), в полосе чайника <b>${g.A.band}</b> · регрессия: в полосе <b>${g.R.band} из ${NG}</b>, среднее (${cmv(g.R.mx)}; ${cmv(g.R.my)}) см` : g ? 'Действия идут от шума к данным…' : `Демонстраций ${d.N}: «оба шага влево» ${Math.round(st.share * d.N)}, «оба вправо» ${d.N - Math.round(st.share * d.N)}. ${st.nets[st.share] ? 'Сеть обучена.' : 'Обучение запускает кнопка в карточке миссии.'}`);
  }
  function setShare(s) { if (st.training || st.busy) return; st.share = s; $$('#wrapActShare button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === s))); st.gen = null; draw(); if (ctl) ctl.update(); }
  function setSteps(s) { st.stepsIdx = Math.max(0, STEPS.indexOf(s) >= 0 ? STEPS.indexOf(s) : 5); const e = $('#acSteps'); e.value = st.stepsIdx; e.nextElementSibling.textContent = String(S()); setRangeFill(e); }
  function setEta(v) { st.eta = v; $$('#wrapActEta button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === v))); }
  const api = {
    reset() { st.gen = null; st.anim = 1; setSteps(100); setEta(1); setShare(0.5); },
    state: () => ({ share: st.share, trained: !!st.nets[st.share], S: S(), eta: st.eta, gen: st.gen ? { A: st.gen.A, R: st.gen.R, S: st.gen.S, eta: st.gen.eta, share: st.gen.share } : null }),
    run, setShare, setSteps, setEta, train: () => train(st.share),
  };
  const sumTxt = (r) => `${shareTxt(r.share)}, ${sName(r.eta)} на ${nWord(r.S, 'шаге', 'шагах', 'шагах')}: в сгустках ${r.A.inCluster} из ${NG} (влево ${r.A.left}, вправо ${r.A.right}), в полосе ${r.A.band} · регрессия в полосе ${r.R.band}`;
  const missions = [
    { short: 'Из шума', title: 'Сто действий из шума', text: `Обучи денойзер из лаборатории на ${A.n} действиях из демонстраций и сгенерируй ${NG} действий: DDPM, 100 шагов, как в лаборатории. Те же ${NG} стартовых шумов пройдут и через регрессию «шум → действие».`,
      bet: { q: `куда лягут ${NG} сгенерированных действий?`, options: ['В оба сгустка, примерно поровну', 'В один сгусток: сеть выберет сторону', 'Между сгустками, как регрессия'], answer: (r) => (r.A.inCluster >= 90 ? (Math.min(r.A.left, r.A.right) >= 20 ? 0 : 1) : 2) },
      action: { label: 'Обучить и сгенерировать', run: (X) => X.run() },
      criteria: [{ label: `Все ${NG} действий в сгустках`, test: (r) => r.A.inCluster === NG }, { label: 'Ни одного действия в полосе чайника', test: (r) => r.A.band === 0 }],
      summary: sumTxt,
      hint: 'Обучение занимает несколько секунд: по ходу на графике появляются пробные действия сети. Если действие легло вне сгустков, сгенерируй ещё раз.',
      fail: (r) => `В сгустках ${r.A.inCluster} из ${NG}, в полосе чайника ${r.A.band}. Нажми кнопку ещё раз.`,
      explain: (r) => `Диффузия: <b>${r.A.left}</b> действий «оба шага влево», <b>${r.A.right}</b> — «оба шага вправо», в полосе чайника <b>${r.A.band}</b>. Регрессия на тех же ${NG} стартовых шумах: <b>${r.R.band} из ${NG}</b> в полосе, её среднее — ${cmv(r.R.mx)} см на шаге 1 и ${cmv(r.R.my)} см на шаге 2, то есть прямо в чайник. Сеть та же, что на спиралях, и ведёт себя так же: при сильном шуме денойзер тянет действие к общему среднему, потом стартовый шум выбирает сторону, и денойзинг доводит действие до сгустка. Регрессия выбирать не умеет: минимум среднеквадратичной ошибки — среднее двух объездов, как в уроке 1.3.` },
    { short: '70 на 30', title: 'Перекос в демонстрациях', text: 'Теперь 70% демонстраций объезжают чайник слева (переключатель доли — под сценой). В уроке 1.3 регрессия при таком перекосе всё ещё задевала чайник. Обучи сеть заново и сгенерируй 100 действий.',
      controls: ['share'], onEnter: (X) => X.setShare(0.7),
      bet: { q: 'какая доля действий диффузии уйдёт влево?', options: ['Около 70%, как в демонстрациях', 'Почти все: сторона большинства', 'Около половины'], answer: (r) => (r.A.shareLeft >= 0.85 ? 1 : r.A.shareLeft >= 0.58 ? 0 : 2) },
      action: { label: 'Обучить и сгенерировать', run: (X) => X.run() },
      criteria: [{ label: 'В демонстрациях 70% объездов слева', test: (r) => r.share === 0.7 }, { label: 'Влево ушли от 60 до 80% действий', test: (r) => r.A.shareLeft >= 0.6 && r.A.shareLeft <= 0.8 }, { label: 'Ни одного действия в полосе чайника', test: (r) => r.A.band === 0 }],
      summary: sumTxt,
      hint: 'Доля 70% уже выбрана переключателем под сценой. Сеть на новых данных учится заново, это несколько секунд.',
      fail: (r) => (r.share !== 0.7 ? `Сейчас демонстраций слева ${Math.round(r.share * 100)}%: переключи на 70% под сценой.` : `Влево ушли ${pc(r.A.shareLeft)} действий, в полосе чайника ${r.A.band}. Нажми кнопку ещё раз.`),
      explain: (r) => `Влево ушли <b>${r.A.left}</b> действий из ${NG}, вправо <b>${r.A.right}</b>: диффузия воспроизвела долю из демонстраций, а не выбрала сторону большинства. Среднее регрессии сдвинулось к большинству, до ${cmv(r.R.mx)} см на шаге 1 и ${cmv(r.R.my)} см на шаге 2, но суммарный сдвиг ${fx(Math.abs(r.R.mx + r.R.my) * A.cm, 1)} см меньше 30 см: <b>${r.R.band} из ${NG}</b> её действий по-прежнему в полосе чайника. То же было в уроке 1.3: при 70 на 30 регрессия ещё задевала чайник и выходила из него только при перекосе около 80 на 20, и то со стороны большинства, без выбора.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй долю объездов слева, число шагов и сэмплер; каждая генерация — из нового шума. Проверь: при 90 на 10 среднее регрессии выходит из полосы, но со стороны большинства, выбора у неё по-прежнему нет. На 3 шагах часть действий остаётся между сгустками.',
      final: true,
      action: { label: 'Сгенерировать 100 действий', run: (X) => X.run({ seed: st.freeSeed++, S: S(), eta: st.eta }) },
      summary: sumTxt },
  ];
  function init() {
    SHARES.forEach((s) => { const b = h('button', { type: 'button', 'data-v': s, 'aria-pressed': String(s === 0.5) }, `слева ${Math.round(s * 100)}%`); b.addEventListener('click', () => setShare(s)); $('#wrapActShare').append(b); });
    $('#acSteps').addEventListener('input', (e) => { st.stepsIdx = +e.target.value; const el = e.target; el.nextElementSibling.textContent = String(S()); setRangeFill(el); });
    $$('#wrapActEta button').forEach((b) => b.addEventListener('click', () => setEta(+b.dataset.v)));
    ctl = mountMissions('#acMis', missions, api, { controls: { share: '#wrapActShare', steps: '#wrapActSteps', eta: '#wrapActEta' }, scene: '#acCv', onStep: (i) => { st.mis = i; draw(); } });
    setSteps(100); setEta(1); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, STEPS, SHARES };
})();

/* ---------- Квиз (как в уроке 1.3: вопрос, варианты, пояснение после ответа, итог «N из 8») ---------- */
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
  // Вопросы — о диффузионном подходе в целом, названия приёмов — только в пояснениях
  const A = DF.ACT;
  renderQuiz('#quizBox', [
    { q: 'У данных два правильных ответа. Чем генератор отличается от регрессии?', o: ['Ничем: обе модели выдают ответ, ближайший ко всем примерам сразу', 'Регрессия выдаёт среднее показанных ответов, генератор — один из них, и запуск за запуском разные', 'Генератор выдаёт оба ответа сразу, а робот выбирает лучший'], a: 1, e: 'Минимум среднеквадратичной ошибки — среднее показанных ответов, и среднее двух объездов ведёт в чайник. Генератор выдаёт сэмпл: точку на одной из спиралей или один из объездов. В разделе про действия Ады сгенерированные действия легли в два сгустка, а регрессия на тех же стартовых шумах — в полосу чайника.' },
    { q: 'Зачем данные портят шумом постепенно, за много шагов, а не превращают шум в данные за один раз?', o: ['Так данные занимают меньше памяти', 'За один раз не получается: такая сеть снова выдаёт среднее; а убрать небольшую порцию шума сеть выучить может, и на прямом пути для каждого шага известен правильный ответ', 'Чтобы шум в конце получился гауссовым'], a: 1, e: 'Регрессия «шум → точка» в лаборатории кладёт облако в центр: по случайному шуму нельзя угадать нужную точку, и минимум ошибки — среднее. Прямой путь нужен как задачник: на каждом шаге известно, какой шум добавили, и сеть учится угадывать его при любом уровне шума. Обратный путь складывается из тех же маленьких шагов.' },
    { q: 'Что сеть делает на обучении и что — на генерации?', o: ['На обучении запоминает точки данных, на генерации выбирает одну из них', 'На обучении по зашумлённой точке и номеру шага учится угадывать добавленный шум; на генерации предсказывает шум для случайного облака, и его часть убирают шаг за шагом', 'На обучении и на генерации одно и то же: превращает шум в точку за один проход'], a: 1, e: 'Обучение идёт только по прямому пути: сеть видит зашумлённую точку и номер шага, а правильный ответ, добавленный шум, известен. На генерации тот же предсказанный шум указывает направление к данным, и облако проходит обратный путь. Сеть данных не хранит; хранит их идеальный денойзер из раздела 3, и потому он только копирует.' },
    { q: 'Сеть одна и та же. Откуда у генератора разные ответы?', o: ['Сеть на каждом запуске обучается заново', 'Старт — новое случайное облако: на какой виток придёт точка, решает её стартовое положение, а у части способов шагать — ещё и свежий шум по ходу', 'Ответы на самом деле одинаковые, различия — ошибка округления'], a: 1, e: 'В миссии про бассейны два старта ближе 0,25 друг к другу приходили на разные спирали: между ними проходит граница бассейнов. При сильном шуме денойзер тянет все точки к центру, потом старт выбирает виток, и денойзинг доводит точку до него. Для Ады это выбор объезда: слева или справа.' },
    { q: 'Почему генерация стоит дорого по времени?', o: ['Сеть большая, и один её проход занимает секунды', 'Каждый шаг обратного пути — полный проход сети, а шагов десятки или сотни', 'Нужно перебрать все обучающие точки'], a: 1, e: 'Один проход маленькой сети быстрый, но в исходной модели DDPM шагов 1000. Роботы сокращают их до 4–20: шагают без свежего шума (DDIM), берут точные решатели или дистиллируют сеть. В лаборатории на 6–8 шагах облако стягивалось к центру только у шагов со свежим шумом.' },
    { q: 'Зачем генератору условие и что меняет его усиление (guidance)?', o: ['Условие ускоряет генерацию, а усиление делает её ещё быстрее', 'Условие говорит, какой ответ нужен: номер спирали, наблюдение камеры; усиление делает ответы точнее по условию, но беднее: точки сбиваются в немногие места', 'Условие нужно только картинкам, роботу оно не требуется'], a: 1, e: 'Роботу нужно не любое правдоподобное действие, а подходящее к тому, что видит камера. В опыте без усиления заметная часть точек ложилась не на заказанную спираль; с усилением точность росла, а покрытие спирали падало, и при больших весах точки перелетали спираль. У роботов большие веса делают поведение агрессивным.' },
    { q: 'Генератор всегда придумывает новые примеры?', o: ['Да: сгенерированное никогда не совпадает с обучающими точками', 'Нет: на малых данных и при долгом обучении сеть начинает повторять обучающие примеры, а идеальный денойзер только их и выдаёт', 'Нет: он всегда повторяет обучающие примеры'], a: 1, e: 'В разделе про память сеть на восьми точках к концу обучения копировала больше половины сэмплов, а на 128 точках — меньше четверти. Для робота это значит, что диффузионная политика на десятке демонстраций может повторять записанные движения вместо того, чтобы обобщать.' },
    { q: 'Что меняется, когда вместо точек на спиралях генератору дают действия робота?', o: ['Нужна другая модель: диффузия работает только с картинками и точками', 'В устройстве сети ничего: действие — такие же числа, и из шума получаются действия из показанных вариантов, а не их среднее', 'Генератор начинает выдавать среднее, как регрессия'], a: 1, e: `В конце урока та же сеть училась на ${A.n} действиях объезда чайника: из ${A.gen} сгенерированных действий ни одно не попало в полосу чайника, а регрессия на тех же стартовых шумах выдала среднее двух объездов. В уроке 1.5 условием станет наблюдение камеры, а вместо двух чисел — пачка действий.` },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('cycle', () => legend('#cycleLegend', [['точки данных, их зашумлённые копии и случайный шум', 'var(--ink-3)', 'dot'], ['точки на обратном пути: с каждым шагом ближе к спиралям', 'var(--e2e)', 'dot'], ['сеть-денойзер', 'color-mix(in srgb, var(--e2e) 25%, transparent)', 'box']]));
    safe('samplers', () => legend('#sampLegend', [['обучающие точки', 'var(--ink-3)', 'dot'], ['старт: одна и та же точка шума', 'var(--ink)', 'ring'], ['путь к данным и его конец', 'var(--e2e)'], ['DDIM за 10 шагов: узлы — шаги', 'var(--hybrid)', 'dash']]));
    safe('ab', () => { mis.ab = AB.init(); }); safe('score', () => { mis.score = Score.init(); });
    safe('lab', () => { mis.lab = Lab.init(); }); safe('guide', () => { mis.guide = Guid.init(); }); safe('memo', () => { mis.memo = Memo.init(); }); safe('acts', () => { mis.acts = Acts.init(); });
    safe('quiz', initQuiz);
    window.__l14 = { mis, SPEED, Cycle, Samp, AB, Score, Lab, Guid, Memo, Acts, DATA, RM }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
