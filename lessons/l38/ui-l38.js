/* =====================================================================
   ui-l38.js — урок 3.8 «Обобщение и рассуждение: от π0.5 до π0.7».
   0) анимированная схема изоляции знаний (shared/anim.js): градиент
      эксперта действий идёт в модель зрения и языка или останавливается;
   1) лаборатория 1: уборка стола, плоская и иерархическая политика на
      одной сцене рядом (одна модель действий), 20 столов, 2 и 32 записи;
   2) лаборатория 2: 96 записей в 1…96 домах, проверка в 16 новых домах,
      ползунок с перерасчётом, разброс по наборам домов;
   3) сортировка идей по моделям π0 → π0.7 (shared/cards.js) и квиз.
   Движок — l38/engine.js (без DOM) поверх l21/engine.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
const tables = (n) => nWord(n, 'стол', 'стола', 'столов'), cmds = (n) => nWord(n, 'команду', 'команды', 'команд');
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);
const rgbCss = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
/** Картинка движка (Float32Array RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
function drawBitmap(c, bm, x, y, w, hgt) { c.imageSmoothingEnabled = false; c.drawImage(bm, x, y, w, hgt); }

/* =====================================================================
   0. Схема: изоляция знаний
   ===================================================================== */
(() => {
  const T = 9, PH = { fwd: [0, 2.4], loss: [2.4, 3.0], bwd: [3.0, 6.4] };
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  /** Точка на ломаной по доле длины s ∈ [0, 1]. */
  function along(poly, s) {
    const L = []; let tot = 0; for (let i = 1; i < poly.length; i++) { const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); L.push(d); tot += d; }
    let r = Math.max(0, Math.min(1, s)) * tot;
    for (let i = 0; i < L.length; i++) { if (r <= L[i] || i === L.length - 1) { const u = L[i] ? Math.min(1, r / L[i]) : 0; return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * u, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * u]; } r -= L[i]; }
    return poly[poly.length - 1];
  }
  /** Поток точек по ломаной: n точек, фаза p ∈ [0, 1] — сколько пути уже пройдено. */
  function stream(c, poly, p, n, col, r) {
    for (let i = 0; i < n; i++) { const s = p * 1.25 - i * 0.25 / n; if (s < 0 || s > 1) continue; const q = along(poly, s); c.beginPath(); c.arc(q[0], q[1], r || 3, 0, 7); c.fillStyle = col; c.fill(); }
  }
  function row(c, k, u, P, A, G, ins) {
    const { seg, lab, rect, line, arrow } = A, pF = seg(u, ...PH.fwd), pL = seg(u, ...PH.loss), pB = seg(u, ...PH.bwd);
    const red = P.bad, blue = P.out, purple = P.spr, orange = P.mot;
    lab(c, k, ins ? (G.short ? 'С изоляцией знаний' : 'С изоляцией знаний: π0.5 и Knowledge Insulation') : (G.short ? 'Без изоляции: π0' : 'Без изоляции: π0'), G.title[0], G.title[1], { px: 12, weight: 700, color: P.ink, haloColor: P.surf2, align: 'left' });
    // входы
    for (const [x, y, w, hh, t] of G.inputs) { rect(c, x, y, w, hh, 6, P.surf, P.ink3, 1.2); lab(c, k, t, x + w / 2, y + hh / 2, { px: 10.5, color: P.ink2, halo: false }); }
    // модель зрения и языка
    const V = G.vlm, hurt = ins ? 0 : 0.45 * pB;
    rect(c, V[0], V[1], V[2], V[3], 10, rgba(P.ink3, 0.12), P.ink3, 1.6);
    for (let i = 1; i < 5; i++) { const yy = V[1] + V[3] * (0.25 + i * 0.15); const jag = !ins && pB > 0 ? Math.min(1, pB * 1.4) : 0; const pts = []; for (let j = 0; j <= 12; j++) { const x = V[0] + 10 + (V[2] - 50) * j / 12; pts.push([x, yy + jag * 4 * (hash(i * 13 + j) - 0.5)]); } line(c, pts, !ins && jag > 0 ? rgba(red, 0.35 + 0.4 * jag) : rgba(blue, 0.45), 1.3); }
    lab(c, k, 'модель зрения и языка', V[0] + (V[2] - 30) / 2, V[1] + 14, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, 'PaliGemma', V[0] + (V[2] - 30) / 2, V[1] + 28, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    // полоска знаний
    const M = G.meter, lvl = 1 - hurt; rect(c, M[0], M[1], M[2], M[3], 3, P.surf, P.ink3, 1);
    c.fillStyle = lvl > 0.8 ? blue : red; c.fillRect(M[0] + 1.5, M[1] + M[3] * (1 - lvl) + 1.5, M[2] - 3, M[3] * lvl - 3);
    lab(c, k, 'знания', M[0] + M[2] / 2 - 4, M[1] - 9, { px: 10, color: P.ink3, haloColor: P.surf2 });
    if (u > PH.bwd[1]) lab(c, k, ins ? 'знания сохранены' : 'знания портятся', V[0] + V[2] - 4, V[1] + V[3] + 11, { px: 10.5, weight: 700, color: ins ? blue : red, haloColor: P.surf2, align: 'right' });
    // эксперт действий
    const X = G.exp; rect(c, X[0], X[1], X[2], X[3], 10, rgba(orange, pF > 0.45 && pF < 1 ? 0.25 : 0.12), orange, 1.8);
    lab(c, k, 'эксперт действий', X[0] + X[2] / 2, X[1] + 15, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, 'случайные веса в начале', X[0] + X[2] / 2, X[1] + 30, { px: 10, color: P.ink2, haloColor: P.surf2 });
    // связь через внимание
    line(c, G.link, rgba(P.ink2, 0.6), 1.6, [5, 4]);
    lab(c, k, G.short ? 'ключи и значения' : 'внимание: ключи и значения', G.linkLab[0], G.linkLab[1], { px: 10, color: P.ink3, haloColor: P.surf2 });
    if (ins) { const B = G.bar; if (G.short) { line(c, [[B[0], B[1]], [B[0] + B[2], B[1]]], P.ink, 4); lab(c, k, 'стоп', B[0] - 20, B[1], { px: 10.5, weight: 700, color: P.ink, haloColor: P.surf2 }); } else { line(c, [[B[0], B[1]], [B[0], B[1] + B[2]]], P.ink, 4); lab(c, k, 'стоп', B[0], B[1] - 10, { px: 10.5, weight: 700, color: P.ink, haloColor: P.surf2 }); } }
    // пачка и её ошибка
    const C = G.chunk; rect(c, C[0], C[1], C[2], C[3], 6, P.surf, pL > 0 && pB < 1 ? red : P.line, 1.2);
    for (let i = 0; i < 25; i++) { const x = C[0] + 6 + (C[2] - 12) * i / 24, y = C[1] + C[3] / 2 + Math.sin(i / 24 * 5.5) * C[3] * 0.25 + (pF < 1 ? (hash(i) - 0.5) * C[3] * 0.4 : 0); c.beginPath(); c.arc(x, y, 1.8, 0, 7); c.fillStyle = orange; c.fill(); }
    lab(c, k, 'пачка действий', C[0] + C[2] / 2, C[1] - 9, { px: 10, color: P.ink3, haloColor: P.surf2 });
    if (pL > 0) lab(c, k, 'ошибка flow matching', C[0] + C[2] / 2, C[1] + C[3] + 11, { px: 10, weight: 700, color: red, haloColor: P.surf2 });
    // токены FAST и веб-данные — только с изоляцией
    if (ins) {
      const F = G.fast; for (let i = 0; i < 6; i++) rect(c, F[0] + i * 13, F[1], 10, 10, 2, rgba(purple, 0.3), purple, 1.1);
      lab(c, k, 'токены FAST и веб-данные', F[0], F[1] + 22, { px: 10, color: purple, haloColor: P.surf2, align: 'left' });
    }
    // прямой проход
    if (pF > 0 && pF < 1) { stream(c, G.fwd, pF, 6, blue, 3); }
    // обратный проход: красный — от ошибки эксперта; с изоляцией останавливается на границе
    if (pB > 0 && pB < 1) {
      stream(c, ins ? G.bwdStop : G.bwd, pB, 7, red, 3.2);
      if (ins) { const q = G.bwdStop[G.bwdStop.length - 1], fl = (pB * 7) % 1; c.beginPath(); c.arc(q[0], q[1], 4 + 6 * fl, 0, 7); c.strokeStyle = rgba(red, 0.6 * (1 - fl)); c.lineWidth = 1.5; c.stroke(); stream(c, G.fastBwd, pB, 4, purple, 3); }
    }
    G.arrows.forEach(([x1, y1, x2, y2]) => arrow(c, x1, y1, x2, y2, P.line, 1.4, 6));
  }
  function wide(c, k, t, P, A) {
    const u = ((t % T) + T) % T;
    const mk = (dy) => ({
      title: [14, dy + 14], inputs: [[14, dy + 44, 76, 26, 'картинки'], [14, dy + 82, 76, 26, 'текст']],
      vlm: [116, dy + 34, 240, 110], meter: [326, dy + 62, 12, 70], exp: [452, dy + 54, 128, 70], chunk: [606, dy + 64, 100, 46],
      link: [[356, dy + 89], [452, dy + 89]], linkLab: [404, dy + 114], bar: [404, dy + 76, 26], fast: [150, dy + 156],
      fwd: [[90, dy + 76], [226, dy + 89], [356, dy + 89], [516, dy + 89], [656, dy + 87]],
      bwd: [[656, dy + 87], [516, dy + 96], [452, dy + 96], [356, dy + 96], [220, dy + 100], [150, dy + 80]], bwdStop: [[656, dy + 87], [516, dy + 96], [452, dy + 96], [408, dy + 96]],
      fastBwd: [[189, dy + 154], [189, dy + 132], [280, dy + 112], [150, dy + 76]],
      arrows: [[90, dy + 57, 114, dy + 72], [90, dy + 95, 114, dy + 100], [580, dy + 89, 604, dy + 87]],
    });
    row(c, k, u, P, A, mk(0), false);
    A.line(c, [[10, 188], [710, 188]], P.grid, 1);
    row(c, k, u, P, A, mk(192), true);
  }
  function narrow(c, k, t, P, A) {
    const u = ((t % T) + T) % T;
    const mk = (dy) => ({
      short: true, title: [12, dy + 14], inputs: [[16, dy + 34, 76, 24, 'картинки'], [100, dy + 34, 60, 24, 'текст']],
      vlm: [16, dy + 70, 280, 100], meter: [266, dy + 98, 12, 62], exp: [96, dy + 236, 170, 64], chunk: [96, dy + 330, 170, 40],
      link: [[200, dy + 170], [200, dy + 236]], linkLab: [282, dy + 222], bar: [178, dy + 206, 44], fast: [16, dy + 186],
      fwd: [[60, dy + 58], [140, dy + 120], [200, dy + 170], [200, dy + 268], [180, dy + 350]],
      bwd: [[180, dy + 350], [190, dy + 268], [190, dy + 236], [190, dy + 170], [120, dy + 140], [60, dy + 110]], bwdStop: [[180, dy + 350], [190, dy + 268], [190, dy + 236], [190, dy + 206]],
      fastBwd: [[55, dy + 184], [55, dy + 164], [200, dy + 140], [60, dy + 110]],
      arrows: [[54, dy + 58, 54, dy + 68], [130, dy + 58, 130, dy + 68], [181, dy + 300, 181, dy + 328]],
    });
    row(c, k, u, P, A, mk(0), false);
    A.line(c, [[8, 396], [352, 396]], P.grid, 1);
    row(c, k, u, P, A, mk(400), true);
  }
  Anim.add('ki', { W: 720, H: 380, start: 4.6, narrowAt: 600, draw: wide, narrow: { W: 360, H: 790, draw: narrow } });
})();

/* =====================================================================
   Общие рисовалки стола: предметы как в уроке 2.1, рука Ады
   ===================================================================== */
const COLOR_RGB = Object.fromEntries(L21.COLORS.map((c) => [c.id, c.rgb]));
/** Предмет в координатах канваса: кубик, мяч, миска (кольцо), банка (высокий прямоугольник). */
function drawShape(c, shape, x, y, R, rgb, edge) {
  const col = rgbCss(rgb); c.lineJoin = 'round';
  c.beginPath();
  if (shape === 'cube') c.roundRect(x - 0.8 * R, y - 0.8 * R, 1.6 * R, 1.6 * R, R * 0.12);
  else if (shape === 'ball') c.arc(x, y, 0.9 * R, 0, 7);
  else if (shape === 'can') c.roundRect(x - 0.5 * R, y - R, R, 2 * R, R * 0.15);
  if (shape === 'bowl') { c.arc(x, y, 0.775 * R, 0, 7); c.strokeStyle = col; c.lineWidth = 0.45 * R; c.stroke(); if (edge) { c.beginPath(); c.arc(x, y, R, 0, 7); c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); } return; }
  c.fillStyle = col; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); }
}
/** Захват Ады сверху: две губки буквой П, открытый или закрытый. */
function drawGrip(c, x, y, s, col, closed) {
  const w = closed ? s * 0.55 : s * 0.9;
  c.strokeStyle = col; c.lineWidth = Math.max(2.5, s * 0.22); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x - w, y + s * 0.7); c.lineTo(x - w, y - s * 0.4); c.lineTo(x + w, y - s * 0.4); c.lineTo(x + w, y + s * 0.7); c.stroke();
  c.beginPath(); c.moveTo(x, y - s * 0.4); c.lineTo(x, y - s * 1.1); c.stroke();
}

/* =====================================================================
   1. Лаборатория: уборка стола, плоская и иерархическая политика
   ===================================================================== */
const Clear = (() => {
  const E = L38, CW = 400, CH = 490, SC = CW / L21.TW, STEP_MS = 1500, TICK = 30;
  const S = { models: {}, evals: {}, busy: null, prog: 0 };
  const st = { rec: 8, scene: 0, t: null, playing: false, tok: 0, bars: false };
  let ctl = null;
  const subs = [], emit = () => subs.forEach((f) => f());
  async function train(n) {
    if (S.models[n]) return S.models[n];
    S.busy = n; S.prog = 0; emit();
    S.models[n] = await runChunked(E.clearTrain(n), (e) => { S.prog = (e.it + 1) / e.iters; emit(); }, 14);
    S.busy = null; emit(); return S.models[n];
  }
  function evalOf(n) {
    const M = S.models[n]; if (!M) return null;
    if (!S.evals[n]) S.evals[n] = { flat: E.clearEval(M.m, M.hm, 'flat'), hier: E.clearEval(M.m, M.hm, 'hier') };
    return S.evals[n];
  }
  const runsNow = () => { const ev = evalOf(st.rec); return ev ? [ev.flat.runs[st.scene], ev.hier.runs[st.scene]] : [null, null]; };
  const tableOf = (i) => E.clearTable(E.CL.evalSeed + i);
  /* ---------- раскладка анимации ---------- */
  const X = (px) => px * SC;
  const BOXES = [[12, 410, 182, 72], [206, 410, 182, 72]], REST = [200, 402];
  const slotXY = (c, j) => [BOXES[c][0] + 26 + j * 42, BOXES[c][1] + 46];
  /** По шагам прохода: откуда рука идёт, где берёт, куда несёт, в какую ячейку места. */
  function plan(run) {
    let at = REST.slice(); const used = [0, 0], out = [];
    for (const s of run.steps) {
      const pick = s.cell >= 0 ? [X(s.at.x), X(s.at.y)] : at.slice();
      const step = { s, from: at.slice(), pick, end: at.slice(), slot: null };
      if (s.hit >= 0) { const j = used[s.c]++; step.slot = j; step.end = slotXY(s.c, j); }
      else step.end = at.slice();
      out.push(step); at = step.end.slice();
    }
    return out;
  }
  const bmCache = new Map();
  function tableBitmap(objs) {
    const key = objs.map((q) => q.color + q.shape + q.x.toFixed(1)).join('|');
    if (!bmCache.has(key)) { if (bmCache.size > 120) bmCache.clear(); bmCache.set(key, bitmap(E.gridOf(objs).img, L21.TW, L21.TW)); }
    return bmCache.get(key);
  }
  const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const ease = (u) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
  function drawPane(cv, run, side) {
    const { c, k } = HeroKit.fit(cv, CW, CH), P = pal(), col = side ? P.e2e : P.cl, narrow = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CH);
    const objs0 = tableOf(st.scene);
    if (!run) {
      drawBitmap(c, tableBitmap(objs0), 0, 0, CW, CW); drawBoxes(c, k, P, []);
      HeroKit.label(c, k, S.busy != null ? 'модель учится…' : 'модель ещё не обучена', CW / 2, CW / 2, { px: 13, weight: 700, color: '#3d3c38', haloColor: '#fffdf8' });
      return;
    }
    const pl = plan(run), T = pl.length, t = st.t == null ? T : Math.min(st.t, T), kk = Math.min(T - 1, Math.floor(t)), fr = t >= T ? 1 : t - kk, done = t >= T;
    const cur = pl[kk], carrying = !done && cur.s.hit >= 0 && fr > 0.62;
    // стол: предметы, которые ещё на столе в этот момент
    let objs = done ? run.left : cur.s.objs;
    if (carrying) objs = objs.filter((q) => q !== cur.s.obj);
    drawBitmap(c, tableBitmap(objs), 0, 0, CW, CW);
    c.strokeStyle = 'rgba(60,60,60,0.10)'; c.lineWidth = 1; c.beginPath();
    for (let g = 0; g <= L21.G; g += 2) { const v = g * L21.CELL * SC; c.moveTo(v, 0); c.lineTo(v, CW); c.moveTo(0, v); c.lineTo(CW, v); }
    c.stroke();
    // уже уложенные предметы
    const placed = []; for (let i = 0; i < (done ? T : kk); i++) if (pl[i].slot != null) placed.push(pl[i]);
    if (!done && cur.slot != null && fr >= 1) placed.push(cur);
    drawBoxes(c, k, P, placed);
    // подзадача или команда
    const sub = !done && side ? cur.s.sub : null, pillText = side ? (done ? '' : narrow ? `${E.accPhrase(sub.color, sub.shape)} → ${sub.c ? 'мойка' : 'ящик'}` : '→ ' + sub.text) : (done ? '' : narrow ? 'убери со стола' : 'команда: убери со стола');
    if (pillText) pill(c, k, pillText, CW / 2, 18, side && !done ? P.e2e : '#5a5852', P, narrow);
    // текущий шаг: путь руки и захват
    let hand = REST.slice(), closed = false;
    if (!done) {
      c.setLineDash([5, 4]); c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); c.moveTo(cur.from[0], cur.from[1]); c.lineTo(cur.pick[0], cur.pick[1]); c.lineTo(cur.end[0], cur.end[1]); c.stroke(); c.setLineDash([]);
      if (fr < 0.25) hand = cur.from;
      else if (fr < 0.62) hand = lerp2(cur.from, cur.pick, ease((fr - 0.25) / 0.37));
      else { hand = lerp2(cur.pick, cur.end, ease((fr - 0.62) / 0.33)); closed = cur.s.hit >= 0; }
      if (cur.s.hit < 0 && fr > 0.5) HeroKit.cross(c, cur.pick[0], cur.pick[1], 8, P.bad, 3);
      if (carrying) { const q = cur.s.obj; drawShape(c, q.shape, hand[0], hand[1] + 4, L21.RT * SC * 0.8, COLOR_RGB[q.color], 'rgba(0,0,0,.35)'); }
    }
    drawGrip(c, hand[0], hand[1] - (closed ? 2 : 0), 9, '#5f5c56', closed);
    // итог
    if (done) {
      const msg = run.ok ? `убрано за ${nWord(T, 'шаг', 'шага', 'шагов')}` : run.wrong ? `не на месте: ${run.wrong}` : `осталось на столе: ${run.left.length}`;
      HeroKit.label(c, k, msg, CW / 2, 18, { px: narrow ? 11 : 12.5, weight: 700, color: run.ok ? '#1d7a3a' : '#c0392b', haloColor: '#fffdf8' });
    }
  }
  function pill(c, k, text, x, y, col, P, narrow) {
    HeroKit.font(c, k, narrow ? 10 : 12, 700); const w = Math.min(CW - 12, c.measureText(text).width + 18 * k), hh = (narrow ? 17 : 21) * k;
    Anim.kit.rect(c, x - w / 2, y - hh / 2, w, hh, hh / 2, '#fffdf8', col, 1.6);         // стол на картинке всегда светлый
    HeroKit.label(c, k, text, x, y + 0.5, { px: narrow ? 10 : 12, weight: 700, color: col, halo: false });
  }
  function drawBoxes(c, k, P, placed) {
    const narrow = k > 1.5;
    BOXES.forEach(([x, y, w, hh], i) => {
      if (i === 0) { Anim.kit.rect(c, x, y, w, hh, 4, rgba('#a0703c', 0.12), '#a0703c', 2.2); }
      else { Anim.kit.rect(c, x, y, w, hh, 14, rgba(P.cl, 0.14), P.ink3, 2.2); }
      HeroKit.label(c, k, i === 0 ? (narrow ? 'ящик' : 'ящик для игрушек') : 'мойка', x + 9, y + 13, { px: narrow ? 10 : 11, weight: 700, color: P.ink2, haloColor: P.bg, align: 'left' });
    });
    for (const p of placed) {
      const q = p.s.obj, [sx, sy] = slotXY(p.s.c, p.slot);
      drawShape(c, q.shape, sx, sy, 11, COLOR_RGB[q.color], 'rgba(0,0,0,.3)');
      if (p.s.res === 'wrong') HeroKit.cross(c, sx + 14, sy - 13, 5, P.bad, 2.6); else HeroKit.check(c, sx + 14, sy - 13, 5, P.good, 2.4);
    }
  }
  const objName = (q) => E.nomPhrase(q.color, q.shape);
  const placeName = (c) => (c ? 'в мойке' : 'в ящике');
  function paneStat(run) {
    if (!run) return { html: S.busy != null ? 'Модель учится…' : 'Модель ещё не обучена', cls: '' };
    if (run.ok) return { html: `<b>✓ стол убран</b> за ${nWord(run.steps.length, 'шаг', 'шага', 'шагов')}`, cls: 'ok' };
    const bad = run.placed.filter((q) => !q.ok).map((q) => `${objName(q)} ${placeName(q.c)}`);
    if (bad.length) return { html: `<b>✗ не на месте:</b> ${bad.join(', ')}`, cls: 'bad' };
    return { html: `<b>✗ на столе осталось:</b> ${run.left.map(objName).join(', ')}`, cls: 'bad' };
  }
  function journal(el, run, side) {
    el.innerHTML = ''; if (!run) return;
    const T = run.steps.length, t = st.t == null ? T : st.t;
    run.steps.forEach((s, i) => {
      if (i > Math.floor(t) || (i === Math.floor(t) && t < T && t - i < 0.62)) return;
      const act = s.hit < 0 ? 'захват мимо предметов' : `взяла ${E.accPhrase(s.obj.color, s.obj.shape)} → ${s.c ? 'мойка' : 'ящик'}`;
      const mark = s.res === 'wrong' || s.res === 'miss' ? ' ✗' : ' ✓';
      const li = h('li', { class: (s.res === 'wrong' || s.res === 'miss' ? 'bad' : '') + (st.t != null && i === Math.floor(t) ? ' cur' : '') });
      if (side) li.innerHTML = `<span class="sub">«${s.sub.text}»</span> → ${act}${mark}${s.level === 'words' ? ' — ошибка в словах' : s.level === 'action' ? ' — ошибка в действии' : ''}`;
      else li.textContent = act + mark;
      el.append(li);
    });
  }
  function bars() {
    const box = $('#cBars'); box.innerHTML = ''; const ev = st.bars ? evalOf(st.rec) : null; if (!ev) return;
    box.append(h('div', { class: 'sc-h muted-s' }, `Проверка на 20 новых столах · записей длинной задачи: ${st.rec}`));
    for (const [name, r] of [['Плоская', ev.flat], ['Иерархическая', ev.hier]]) {
      const bt = h('div', { class: 'bt' }); bt.append(h('i', { class: 'ok', style: `width:${r.ok / r.n * 100}%` }), h('i', { class: 'bad', style: `width:${(r.n - r.ok) / r.n * 100}%` }));
      box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, `${name}: ${nWord(r.objs - r.right, 'предмет', 'предмета', 'предметов')} не на месте`), bt, h('span', { class: 'bn' }, `${r.ok} из ${r.n}`)));
    }
    box.append(h('div', { class: 'bars-key' }, ...[['стол убран', 'var(--good)'], ['стол не убран', 'var(--critical)']].map(([t, cc]) => h('span', null, h('i', { style: `background:${cc}` }), t))));
  }
  function out() {
    const el = $('#cOut');
    if (S.busy != null) { setOut(el, `Модель учится в браузере на ${nWord(S.busy, 'записи', 'записях', 'записях')} длинной задачи и 160 коротких командах: <b>${Math.round(S.prog * 100)}%</b>`); return; }
    if (!S.models[st.rec]) { setOut(el, `Модель для ${nWord(st.rec, 'записи', 'записей', 'записей')} длинной задачи ещё не обучена: кнопка — в карточке миссии.`); return; }
    const objs = tableOf(st.scene);
    setOut(el, `Стол ${st.scene + 1} из 20: ${objs.map(objName).join(', ')}. Записей длинной задачи — ${st.rec}.`);
  }
  function draw() {
    const [a, b] = runsNow(); drawPane($('#cCvL'), a, 0); drawPane($('#cCvR'), b, 1); journal($('#cJL'), a, 0); journal($('#cJR'), b, 1);
    if (st.t != null) for (const [run, L] of [[a, 'L'], [b, 'R']]) { if (!run) continue; const T = run.steps.length; setOut($('#cStat' + L), st.t < T ? `Шаг ${Math.floor(st.t) + 1} из ${T}…` : 'Стол готов'); $('#cStat' + L).className = 'pane-stat'; }
  }
  function render() {
    const [a, b] = runsNow();
    for (const [run, L] of [[a, 'L'], [b, 'R']]) { const s = paneStat(run); setOut($('#cStat' + L), s.html); $('#cStat' + L).className = 'pane-stat' + (s.cls && st.t == null ? ' ' + s.cls : ''); }
    draw(); bars(); out();
    const pg = $('#cProg'); pg.hidden = S.busy == null; pg.firstElementChild.style.width = (S.prog * 100).toFixed(1) + '%';
    $('#cPlay').disabled = !a;
  }
  /** Проиграть обе сцены синхронно, шаг за шагом. */
  async function play() {
    const tok = ++st.tok, [a, b] = runsNow(); if (!a) return;
    const T = Math.max(a.steps.length, b.steps.length); st.playing = true;
    for (let t = 0; t <= T && tok === st.tok; t += TICK / STEP_MS) { st.t = t; draw(); await wait(TICK); }
    if (tok === st.tok) { st.t = null; st.playing = false; render(); }
  }
  function stop() { st.tok++; st.t = null; st.playing = false; }
  function setScene(i) { stop(); st.scene = Math.max(0, Math.min(19, i)); const inp = $('#cScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); if (ctl) ctl.update(); }
  async function setRec(n) { stop(); st.rec = +n; segSet('#cRec', st.rec); render(); if (!S.models[st.rec]) await train(st.rec); render(); if (ctl) ctl.update(); }
  /** Сколько синих и фиолетовых игрушек ушло в мойку и жёлтых и оранжевых мисок и банок — в ящик. */
  function colorSlips(ev) {
    let cool = 0, coolN = 0, warm = 0, warmN = 0;
    ev.flat.runs.forEach((r) => r.placed.forEach((q) => {
      const toy = E.placeOf(q.shape) === 0;
      if (toy && (q.color === 'blue' || q.color === 'purple')) { coolN++; if (!q.ok) cool++; }
      if (!toy && (q.color === 'yellow' || q.color === 'orange')) { warmN++; if (!q.ok) warm++; }
    }));
    return { cool, coolN, warm, warmN };
  }
  function state() {
    const ev = evalOf(st.rec), [a, b] = runsNow();
    return { rec: st.rec, scene: st.scene, trained: !!S.models[st.rec], flatOk: ev ? ev.flat.ok : null, hierOk: ev ? ev.hier.ok : null,
      left: a ? { ok: a.ok, wrong: a.wrong } : null, right: b ? { ok: b.ok, wrong: b.wrong } : null };
  }
  const firstWrong = (run) => run.steps.find((s) => s.res === 'wrong' || s.res === 'miss');
  const api = {
    reset() { stop(); st.bars = false; st.rec = 8; segSet('#cRec', 8); setScene(0); },
    state, setScene, setRec, play, stop, render, evalOf, train,
    /** Миссия 1: обучить модель на 8 записях и проиграть первый стол. */
    async first() {
      await train(8); st.rec = 8; segSet('#cRec', 8); st.bars = false; setScene(0); await play();
      const [a, b] = runsNow(), w = firstWrong(a);
      return { aOk: a.ok, aWrong: a.wrong, bOk: b.ok, bSteps: b.steps.length, wStep: w ? a.steps.indexOf(w) + 1 : 0, wObj: w && w.obj ? E.accPhrase(w.obj.color, w.obj.shape) : '', wPlace: w ? (w.c ? 'в мойку' : 'в ящик') : '', wSub: w && w.obj ? (b.steps.find((s) => s.obj && s.obj.color === w.obj.color) || {}).sub : null };
    },
    /** Миссия 2: 20 новых столов. */
    async twenty() {
      await train(8); st.rec = 8; segSet('#cRec', 8); st.bars = true; render();
      const ev = evalOf(8);
      return { fOk: ev.flat.ok, hOk: ev.hier.ok, fBad: ev.flat.objs - ev.flat.right, hBad: ev.hier.objs - ev.hier.right, ...colorSlips(ev) };
    },
    /** Миссия 3: две записи длинной задачи. */
    async few() {
      await setRec(2); st.bars = true; render();
      const ev = evalOf(2); let words = 0, action = 0, ex = null;
      ev.hier.runs.forEach((r, i) => r.steps.forEach((s) => { if (s.res === 'wrong' || s.res === 'miss') { if (s.level === 'words') { words++; if (!ex) ex = { i, text: s.sub.text }; } else action++; } }));
      if (ex) setScene(ex.i);
      return { hOk: ev.hier.ok, fOk: ev.flat.ok, words, action, exI: ex ? ex.i : -1, exText: ex ? ex.text : '' };
    },
    /** Миссия 4: 32 записи длинной задачи. */
    async many() {
      await train(8); const e8 = evalOf(8); await setRec(32); st.bars = true; render();
      const ev = evalOf(32);
      return { f32: ev.flat.ok, h32: ev.hier.ok, f8: e8.flat.ok, h8: e8.hier.ok };
    },
  };
  const missions = [
    { short: 'Один стол', title: 'Кто уберёт стол', text: 'Модель действий одна: она учится на 160 коротких командах и 8 записях «убери со стола». Плоская политика отдаёт ей команду «убери со стола», иерархическая — подзадачу, которую сама называет словами. Нажми кнопку: модель обучится в браузере, и обе политики уберут первый стол.',
      controls: ['scene', 'play'],
      bet: { q: 'кто уберёт стол?', options: ['Обе: модель действий у них одна и та же', 'Только плоская: ей не нужно сначала говорить', 'Только иерархическая'], answer: (r) => (r.aOk && r.bOk ? 0 : r.aOk ? 1 : 2) },
      action: { label: 'Обучить и запустить', run: (X) => X.first() },
      criteria: [{ label: 'Модель обучена', test: (r) => !!r }, { label: 'Плоская положила предмет не на место', test: (r) => r.aWrong > 0 }, { label: 'Иерархическая убрала стол', test: (r) => r.bOk }],
      explain: (r) => `Плоская на шаге ${r.wStep} понесла ${r.wObj} ${r.wPlace}. Иерархическая сначала сказала${r.wSub ? ` «${r.wSub.text}»` : ' подзадачу словами'} и убрала стол за ${nWord(r.bSteps, 'шаг', 'шага', 'шагов')}. Модель действий у них одна и та же, разница только в словах, которые она получает: «убери со стола» не говорит, куда нести этот предмет, а подзадача говорит.` },
    { short: '20 столов', title: 'Проверь на 20 новых столах', text: 'Один стол — ещё не вывод. Проверим обе политики на 20 столах, которых не было в записях: предметы и их цвета везде разные.',
      controls: ['scene', 'play'], onEnter: (X) => { st.bars = false; X.render(); },
      bet: { q: 'сколько столов из 20 уберёт плоская?', options: ['Почти все: на первом столе ей не повезло', 'Меньше половины', 'Столько же, сколько иерархическая'], answer: (r) => (r.fOk === r.hOk ? 2 : r.fOk >= 15 ? 0 : r.fOk < 10 ? 1 : 0) },
      action: { label: 'Проверить на 20 столах', run: (X) => X.twenty() },
      criteria: [{ label: 'Иерархическая убирает не меньше 18 столов', test: (r) => r.hOk >= 18 }, { label: 'Плоская — не больше 10', test: (r) => r.fOk <= 10 }],
      explain: (r) => `Плоская убрала ${tables(r.fOk)} из 20, иерархическая — ${r.hOk}. У плоской не на месте оказались ${nWord(r.fBad, 'предмет', 'предмета', 'предметов')} из 80, и ошибки не случайны: из ${r.coolN} синих и фиолетовых игрушек в мойку ушли ${r.cool}, из ${r.warmN} жёлтых и оранжевых мисок и банок в ящик — ${r.warm}. Чтобы понять, игрушка это или посуда, плоской политике нужно отличить форму по пикселям, а отклик её фильтра зависит от цвета не меньше, чем от формы. По 32 шагам записей она выучила смесь того и другого. Иерархической правило «миска — в мойку» досталось в словах, где форма — отдельное слово.` },
    { short: '2 записи', title: 'Всего две записи длинной задачи', text: 'Записей «убери со стола» теперь только две — 8 шагов. Короткие команды остались те же 160.',
      controls: ['scene', 'play', 'rec'],
      bet: { q: 'где теперь будет ошибаться иерархическая?', options: ['В действии: модель действий не найдёт названный предмет', 'В словах: верхний уровень назовёт не то место', 'Нигде: правило «что куда» простое'], answer: (r) => (r.hOk === 20 ? 2 : r.words >= r.action ? 1 : 0) },
      action: { label: 'Обучить на двух записях и проверить', run: (X) => X.few() },
      criteria: [{ label: 'Иерархическая не убрала хотя бы 5 столов', test: (r) => r.hOk <= 15 }, { label: 'Все её ошибки — в словах подзадачи', test: (r) => r.words > 0 && r.action === 0 }],
      explain: (r) => `С двумя записями иерархическая убрала ${tables(r.hOk)} из 20, плоская — ${r.fOk}. Все ${nWord(r.words, 'ошибка', 'ошибки', 'ошибок')} иерархической — в словах: верхний уровень называет не то место. На столе ${r.exI + 1}, который сейчас на сцене, он сказал «${r.exText}», и модель действий точно это исполнила. По 8 шагам правило не отделилось от цветов: каждый цвет встречался в них раз-другой. Зато ошибку видно прямо в журнале шагов, а у плоской политики — только по результату. В π0.5 верхний уровень учится не только на подписях шагов: веб-данные и словесные инструкции дают ему намного больше примеров.` },
    { short: '32 записи', title: 'Больше записей длинной задачи', text: 'Теперь записей «убери со стола» 32 — вчетверо больше, 128 шагов. Модель действий и короткие команды прежние.',
      controls: ['scene', 'play', 'rec'],
      bet: { q: 'догонит ли плоская иерархическую?', options: ['Да, сравняется: данных хватит', 'Подтянется, но останется позади', 'Не изменится: дело не в данных'], answer: (r) => (r.f32 >= r.h32 ? 0 : r.f32 > r.f8 ? 1 : 2) },
      action: { label: 'Обучить на 32 записях и проверить', run: (X) => X.many() },
      criteria: [{ label: 'Плоская убирает больше столов, чем с 8 записями', test: (r) => r.f32 > r.f8 }, { label: 'Иерархическая по-прежнему не хуже', test: (r) => r.h32 >= r.f32 }],
      explain: (r) => `С 32 записями плоская убрала ${tables(r.f32)} из 20 против ${r.f8} с восемью, иерархическая — ${r.h32}. Плоская политика может выучить правило и по пикселям, но ей нужно в разы больше записей длинной задачи, а они самые дорогие: оператор проводит робота через всю задачу целиком. Иерархической хватило восьми: длинные записи нужны ей только для выбора следующего шага, а действия она учит на коротких командах из любых задач — как π0.5 на данных других роботов.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Листай столы и число записей, проигрывай уборку. Найди стол, на котором плоская ошибается даже при 32 записях, и посмотри в журнале, какой предмет она несёт не туда.', final: true, controls: ['scene', 'play', 'rec'] },
  ];
  function init() {
    legend('#cLegend', [['рука Ады, захват сверху', '#5f5c56', 'grip'], ['путь руки у плоской политики', 'var(--classic)', 'dash'], ['путь руки у иерархической', 'var(--e2e)', 'dash'], ['подзадача словами над столом', 'var(--e2e)', 'pill'], ['ящик для игрушек', '#a0703c', 'box'], ['мойка', 'var(--ink-3)', 'sink'], ['предмет на своём месте — галочка', 'var(--good)', 'dot'], ['не на месте или захват мимо', 'var(--critical)', 'cross']]);
    $('#cScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    segBind('#cRec', (v) => { setRec(v); });
    $('#cPlay').addEventListener('click', () => { if (st.playing) stop(); play(); });
    let last = 0; subs.push(() => { const now = performance.now(); if (S.busy == null || now - last > 120) { last = now; render(); } });
    ctl = mountMissions('#cMis', missions, api, { controls: { scene: '#wrapCScene', rec: '#wrapCRec', play: '#cPlay' }, scene: '#cDuo' });
    syncRange($('#cScene'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, S };
})();

/* =====================================================================
   2. Лаборатория: сколько домов нужно, чтобы работать в новом
   ===================================================================== */
const Homes = (() => {
  const E = L38, HO = E.HO, CW = 400, PW = 640;
  const S = { models: {}, evals: {}, busy: null, prog: 0, tests: null };
  const st = { nIdx: 0, set: 0, home: 0, table: 0, cmd: 0 };
  let ctl = null;
  const subs = [], emit = () => subs.forEach((f) => f());
  const tests = () => S.tests || (S.tests = E.homeTests());
  const key = (set, n) => `${set}:${n}`;
  async function trainKey(kk, data, a, b) {
    S.busy = kk; emit();
    S.models[kk] = await runChunked(E.homeTrain(data), (e) => { S.prog = a + (b - a) * (e.it + 1) / e.iters; emit(); }, 14);
    return S.models[kk];
  }
  /** Обучить недостающие модели по списку ключей ('in' или 'набор:число домов'), с общей полоской прогресса. */
  async function ensure(keys) {
    const need = keys.filter((kk) => !S.models[kk]); if (!need.length) return;
    S.prog = 0;
    for (let i = 0; i < need.length; i++) {
      const kk = need[i], [set, n] = kk === 'in' ? [null, null] : kk.split(':').map(Number);
      if (S.models[kk]) continue;
      await trainKey(kk, kk === 'in' ? E.inHomeDemos(HO.budget) : E.homeDemos(n, HO.budget, HO.sets[set]), i / need.length, (i + 1) / need.length);
    }
    S.busy = null; emit();
  }
  function evalKey(kk) { if (!S.models[kk]) return null; if (!S.evals[kk]) S.evals[kk] = E.homeEval(S.models[kk], tests()); return S.evals[kk]; }
  const nOf = (i) => HO.counts[i];
  const curKey = () => key(st.set, nOf(st.nIdx));
  const tableNow = () => tests()[st.home * HO.tablesPer + st.table];
  /** Сколько команд верно в каждом новом доме у модели kk. */
  function perHome(kk) { const ev = evalKey(kk); if (!ev) return null; const out = Array(HO.testHomes).fill(0); ev.per.forEach((p) => { if (p.ok) out[Math.floor(p.ti / HO.tablesPer)]++; }); return out; }
  /* ---------- сцена ---------- */
  const bms = new Map();
  function drawScene() {
    const cv = $('#hCv'), { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), t = tableNow(), sc = CW / L21.TW;
    if (!bms.has(t)) bms.set(t, bitmap(t.img, L21.TW, L21.TW));
    drawBitmap(c, bms.get(t), 0, 0, CW, CW);
    const m = S.models[curKey()], q = t.objs[st.cmd];
    if (m) {
      const pr = E.mapProbs(m, t.W, [q.color, q.shape]), p = pr.P[0]; let mx = 1e-12; for (const v of p) mx = Math.max(mx, v);
      const cs = L21.CELL * sc;
      t.W.cells.forEach((cell, a) => { const v = Math.sqrt(p[a] / mx); if (v < 0.08) return; c.fillStyle = rgba(P.e2e, 0.75 * v); c.fillRect((cell % L21.G) * cs, Math.floor(cell / L21.G) * cs, cs, cs); });
    }
    c.beginPath(); c.arc(q.x * sc, q.y * sc, L21.RT * sc * 1.25, 0, 7); c.strokeStyle = P.ink; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.arc(q.x * sc, q.y * sc, L21.RT * sc * 1.25, 0, 7); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.stroke();
    const narrow = k > 1.5;
    if (m) {
      const pk = E.pickOf(m, t, q), at = L21.cellXY(pk.cell);
      if (pk.ok) HeroKit.check(c, q.x * sc + 22, q.y * sc - 22, 9, P.good, 4);
      else { c.setLineDash([5, 4]); c.strokeStyle = P.bad; c.lineWidth = 2; c.beginPath(); c.moveTo(q.x * sc, q.y * sc); c.lineTo(at.x * sc, at.y * sc); c.stroke(); c.setLineDash([]); HeroKit.cross(c, at.x * sc, at.y * sc, 9, P.bad, 4); }
      HeroKit.label(c, k, `«возьми ${E.accPhrase(q.color, q.shape)}»`, CW / 2, 16, { px: narrow ? 11 : 13, weight: 700, color: '#1f2430', haloColor: '#ffffff' });
    } else HeroKit.label(c, k, S.busy != null ? 'модель учится…' : 'модель ещё не обучена', CW / 2, CW / 2, { px: 13, weight: 700, color: '#1f2430', haloColor: '#ffffff' });
  }
  /* ---------- образцы скатертей ---------- */
  function swatch(hm) {
    const i = h('i'), b = rgbCss(hm.base.rgb.map((v, ch) => Math.min(1, v * hm.light * hm.tint[ch]))), s2 = rgbCss(hm.second.map((v, ch) => Math.min(1, v * hm.light * hm.tint[ch])));
    i.style.background = hm.pat === 1 ? `repeating-linear-gradient(${hm.vertical ? 90 : 0}deg, ${b} 0 3px, ${s2} 3px 6px)` : hm.pat === 2 ? `conic-gradient(${b} 25%, ${s2} 0 50%, ${b} 0 75%, ${s2} 0) 0 0 / 8px 8px` : b;
    i.title = E.homeName(hm); return i;
  }
  function swatches() {
    const tr = $('#hTrainSw'); tr.innerHTML = '';
    for (let j = 0; j < nOf(st.nIdx); j++) tr.append(swatch(E.home(HO.sets[st.set] + j)));
    const te = $('#hTestSw'); te.innerHTML = ''; const ph = perHome(curKey());
    for (let j = 0; j < HO.testHomes; j++) {
      const v = ph ? ph[j] : null, b = h('b', { class: (j === st.home ? 'cur ' : '') + (v == null ? '' : v >= 6 ? 'ok' : v <= 3 ? 'bad' : ''), title: `Новый дом ${j + 1}` }, swatch(E.home(HO.testSeed + j)), v == null ? '·' : `${v}/8`);
      b.addEventListener('click', () => setHome(j)); te.append(b);
    }
  }
  /* ---------- график ---------- */
  function drawChart() {
    const cv = $('#hChart'), tall = cv.getBoundingClientRect().width < 480, PH = tall ? 380 : 230;
    if (cv.dataset.tall !== String(tall)) { cv.style.aspectRatio = `${PW} / ${PH}`; cv.dataset.tall = String(tall); }
    const { c, k } = HeroKit.fit(cv, PW, PH), P = pal(), narrow = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const box = { l: Math.round(34 * k) + 14, r: PW - 16, t: 14, b: PH - Math.round(18 * k) - 10 };
    const lx = (n) => box.l + Math.log(n) / Math.log(HO.counts[HO.counts.length - 1]) * (box.r - box.l), ly = (v) => box.b - v * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(box.l, ly(v)); c.lineTo(box.r, ly(v)); c.stroke(); HeroKit.label(c, k, `${v * 100}%`, box.l - 5, ly(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (const n of HO.counts) { if (narrow && [3, 6, 12, 24].includes(n)) continue; HeroKit.label(c, k, String(n), lx(n), box.b + 12 * k * 0.9 + 2, { px: 10.5, mono: true, color: n === nOf(st.nIdx) ? P.ink : P.ink3, halo: false, weight: n === nOf(st.nIdx) ? 700 : 600 }); }
    const ein = evalKey('in');
    if (ein) { c.setLineDash([6, 5]); c.strokeStyle = P.cl; c.lineWidth = 2; c.beginPath(); c.moveTo(box.l, ly(ein.rate)); c.lineTo(box.r, ly(ein.rate)); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, narrow ? `в самих домах: ${ein.ok}/${ein.n}` : `обучена в самих проверочных домах: ${ein.ok} из ${ein.n}`, box.l + 8, ly(ein.rate) - 10, { align: 'left', px: 10.5, color: P.cl, haloColor: P.bg }); }
    const pts = HO.counts.map((n) => [n, evalKey(key(st.set, n))]).filter((x) => x[1]);
    c.strokeStyle = rgba(P.e2e, 0.55); c.lineWidth = 1.6; c.beginPath(); pts.forEach(([n, ev], i) => (i ? c.lineTo(lx(n), ly(ev.rate)) : c.moveTo(lx(n), ly(ev.rate)))); c.stroke();
    for (const [n, ev] of pts) { c.beginPath(); c.arc(lx(n), ly(ev.rate), n === nOf(st.nIdx) ? 6 : 4.2, 0, 7); c.fillStyle = P.e2e; c.fill(); if (n === nOf(st.nIdx)) { c.strokeStyle = P.ink; c.lineWidth = 1.6; c.stroke(); HeroKit.label(c, k, `${ev.ok}/${ev.n}`, lx(n) + (n === 1 ? 9 : 0), ly(ev.rate) - 13, { px: 10.5, weight: 700, color: P.ink, haloColor: P.bg, align: n === 1 ? 'left' : 'center' }); } }
    if (!pts.length) HeroKit.label(c, k, narrow ? 'Двигай ползунок «Домов в обучении»' : 'Пока пусто: двигай ползунок «Домов в обучении» — точка появится, когда модель обучится', (box.l + box.r) / 2, (box.t + box.b) / 2, { px: narrow ? 11 : 12, weight: 650, color: P.ink3, haloColor: P.bg });
  }
  function out() {
    const el = $('#hOut');
    if (S.busy != null) { setOut(el, `Модель учится в браузере на ${HO.budget} записях: <b>${Math.round(S.prog * 100)}%</b>`); return; }
    const t = tableNow(), q = t.objs[st.cmd], ev = evalKey(curKey()), ein = evalKey('in'), ph = perHome(curKey());
    let s = `Новый дом ${st.home + 1}: ${E.homeName(t.hm)}. Команда — «возьми ${E.accPhrase(q.color, q.shape)}».`;
    if (ev) s += ` Модель из ${nWord(nOf(st.nIdx), 'дома', 'домов', 'домов')} (набор ${'АБВ'[st.set]}): в этом доме верно <b>${ph[st.home]} из 8</b>, во всех новых — <b>${ev.ok} из ${ev.n}</b>, захват в скатерть — ${ev.cloth}.`;
    else s += ' Модель для этого числа домов ещё не обучена.';
    if (ein) s += ` Модель из самих проверочных домов — ${ein.ok} из ${ein.n}.`;
    setOut(el, s);
  }
  function render() {
    drawScene(); swatches(); drawChart(); out();
    const pg = $('#hProg'); pg.hidden = S.busy == null; pg.firstElementChild.style.width = (S.prog * 100).toFixed(1) + '%';
  }
  let chain = Promise.resolve();
  /** Очередь обучения: модели учатся по одной, даже если ползунок двигают быстро. */
  const queue = (keys) => (chain = chain.then(() => ensure(keys)).then(() => { render(); if (ctl) ctl.update(); }));
  function needKeys() { const ks = [curKey()]; if (st.nIdx > 0) ks.push(key(st.set, nOf(st.nIdx - 1))); return ks; }
  function setN(i, quiet) { st.nIdx = Math.max(0, Math.min(HO.counts.length - 1, i)); const inp = $('#hN'); inp.value = st.nIdx; syncRange(inp, String(nOf(st.nIdx))); render(); if (ctl) ctl.update(); return quiet ? chain : queue(needKeys()); }
  function setSet(v, quiet) { st.set = +v; segSet('#hSet', st.set); render(); if (ctl) ctl.update(); return quiet ? chain : queue(needKeys()); }
  function setHome(j) { st.home = Math.max(0, Math.min(HO.testHomes - 1, j)); const inp = $('#hHome'); inp.value = st.home + 1; syncRange(inp, String(st.home + 1)); render(); if (ctl) ctl.update(); }
  function setTable(v) { st.table = +v; segSet('#hTable', st.table); render(); }
  function setCmd(i) { st.cmd = i; render(); }
  function state() {
    const ev = evalKey(curKey()), ein = evalKey('in'), pv = st.nIdx > 0 ? evalKey(key(st.set, nOf(st.nIdx - 1))) : null;
    return { nIdx: st.nIdx, n: nOf(st.nIdx), set: st.set, home: st.home, trained: !!ev, ok: ev ? ev.ok : null, cloth: ev ? ev.cloth : null, inOk: ein ? ein.ok : null, prevOk: pv ? pv.ok : null, prevN: st.nIdx > 0 ? nOf(st.nIdx - 1) : null };
  }
  const describe = (t, p) => (p.hit >= 0 ? E.accPhrase(t.objs[p.hit].color, t.objs[p.hit].shape) : 'узору скатерти');
  const api = {
    reset() { st.home = 0; st.table = 0; st.cmd = 0; setTable(0); setHome(0); setSet(0, true); setN(0, true); },
    state, setN, setSet, setHome, setTable, setCmd, render, evalKey, perHome,
    /** Миссия 1: модель из одного дома против модели из самих проверочных домов. */
    async oneHome() {
      setSet(0, true); setN(0, true);
      await queue(['in', key(0, 1)]);
      const ev = evalKey(key(0, 1)), ein = evalKey('in'), far = (x) => { if (x.hit >= 0) return -1; const c = L21.cellXY(x.cell); return Math.min(...tests()[x.ti].objs.map((o) => Math.hypot(c.x - o.x, c.y - o.y))); };
      const p = ev.per.reduce((m, x) => (far(x) > far(m) ? x : m), ev.per[0]);
      const t = tests()[p.ti]; st.home = Math.floor(p.ti / HO.tablesPer); st.table = p.ti % HO.tablesPer; st.cmd = t.objs.indexOf(p.q);
      setTable(st.table); setHome(st.home);
      return { n: ev.n, ok: ev.ok, inOk: ein.ok, cloth: ev.cloth, other: ev.other, home: st.home + 1, homeName: E.homeName(t.hm), cmd: E.accPhrase(p.q.color, p.q.shape), to: describe(t, p), train: E.homeName(E.home(HO.sets[0])) };
    },
    /** Миссия 3: три набора домов, один дом и все 96. */
    async sets() {
      const NMAX = HO.counts[HO.counts.length - 1];
      await queue([0, 1, 2].flatMap((s) => [key(s, 1), key(s, NMAX)]));
      const one = [0, 1, 2].map((s) => evalKey(key(s, 1)).ok), all = [0, 1, 2].map((s) => evalKey(key(s, NMAX)).ok);
      return { nmax: NMAX, n: evalKey(key(0, 1)).n, one, all, names: [0, 1, 2].map((s) => E.homeName(E.home(HO.sets[s]))), spread1: Math.max(...one) - Math.min(...one), spread48: Math.max(...all) - Math.min(...all) };
    },
  };
  const missions = [
    { short: 'Один дом', title: 'Все записи из одного дома', text: 'Все 96 записей сделаны в одном доме — на белой скатерти. Другую модель учат на тех же 96 записях, но собранных прямо в 16 проверочных домах, на других столах. Нажми кнопку: обе модели обучатся в браузере и выполнят по 128 команд в новых домах.',
      controls: ['home', 'table'],
      bet: { q: 'сколько команд выполнит модель из одного дома?', options: ['Почти все: команды и предметы те же', 'Заметно меньше, чем модель из проверочных домов', 'Столько же, сколько модель из проверочных домов'], answer: (r) => (r.ok >= 0.9 * r.n ? 0 : Math.abs(r.ok - r.inOk) <= 0.05 * r.n ? 2 : 1) },
      action: { label: 'Обучить обе модели и проверить', run: (X) => X.oneHome() },
      criteria: [{ label: 'Модель из проверочных домов выполнила больше 85% команд', test: (r) => r.inOk > r.n * 0.85 }, { label: 'Модель из одного дома отстала от неё больше чем на 20 команд', test: (r) => r.inOk - r.ok > 20 }],
      explain: (r) => `Модель из одного дома выполнила ${cmds(r.ok)} из ${r.n}, модель из самих проверочных домов — ${r.inOk}. Из ${r.n - r.ok} промахов ${r.cloth} — захват в скатерть, остальные — в другой предмет. На сцене новый дом ${r.home}: ${r.homeName}. По команде «возьми ${r.cmd}» модель тянется к ${r.to}: на белой скатерти ей не приходилось отличать предмет от узора того же цвета.` },
    { short: 'Больше домов', title: 'Те же 96 записей из разных домов', text: 'Двигай ползунок «Домов в обучении»: записей по-прежнему 96, меняется только, из скольких домов они. Найди наименьшее число домов, при котором модель в новых домах отстаёт от модели, обученной прямо в них, не больше чем на 5 команд из 128.',
      controls: ['n', 'home', 'table'],
      criteria: [{ label: 'При этом числе домов отставание не больше 5 команд', test: (r, s) => s.trained && s.inOk != null && s.inOk - s.ok <= 5 }, { label: 'При предыдущем числе домов на ползунке — больше 5', test: (r, s) => s.prevOk != null && s.inOk - s.prevOk > 5 }],
      hint: 'Ползунок «Домов в обучении» — под графиком. Каждая новая модель учится около секунды, потом на графике появляется точка.',
      explain: () => { const s = api.state(); return `С ${nWord(s.n, 'домом', 'домами', 'домами')} модель выполнила ${cmds(s.ok)} из 128 — почти как модель из самих проверочных домов (${s.inOk}), а с ${s.prevN} — ${s.prevOk}. Записей столько же, 96; изменилось только разнообразие скатертей. Кривая растёт неровно: соседние точки могут меняться местами, потому что каждый новый дом приносит свои узоры. В π0.5 так же: при одинаковом числе примеров результат в целом растёт с числом мест, а модель из 104 мест работает примерно как модель, обученная в самих проверочных домах.`; } },
    { short: 'Повезло?', title: 'Какой дом попался', text: 'Модель из одного дома училась на белой скатерти. А если бы единственный дом был другим? Наборы домов Б и В начинаются с других домов. Обучим на каждом наборе модель из одного дома и модель из 96 домов — шесть моделей, несколько секунд.',
      controls: ['n', 'set', 'home', 'table'],
      bet: { q: 'как результат зависит от того, какие дома попались?', options: ['Никак: записей столько же', 'С одним домом — сильно, с 96 домами — почти нет', 'С 96 домами разброс больше: домов больше'], answer: (r) => (r.spread1 > 2 * r.spread48 + 4 ? 1 : r.spread48 > r.spread1 ? 2 : 0) },
      action: { label: 'Обучить на трёх наборах', run: (X) => X.sets() },
      criteria: [{ label: 'Модели из одного дома различаются больше чем на 20 команд', test: (r) => r.spread1 > 20 }, { label: 'Модели из 96 домов — не больше чем на 6', test: (r) => r.spread48 <= 6 }],
      explain: (r) => `Из одного дома: ${cmds(r.one[0])} из ${r.n} (набор А, ${r.names[0]}), ${r.one[1]} (Б, ${r.names[1]}), ${r.one[2]} (В, ${r.names[2]}) — разница до ${cmds(r.spread1)}. Из ${r.nmax} домов: ${r.all.join(', ')} — разница ${r.spread48}. С одним домом всё решает, какой он попался; с многими случайности усредняются. Поэтому и в π0.5 смотрят на кривую по многим местам, а не на одну точку: там она тоже неровная, и авторы пишут, что результат «в целом растёт».` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число домов, набор, новый дом и стол, нажимай на предметы на сцене. Найди новый дом, где даже модель из 96 домов хватает скатерть, и посмотри, чем узор похож на предмет.', final: true, controls: ['n', 'set', 'home', 'table'] },
  ];
  function init() {
    $('#hN').addEventListener('input', (e) => setN(+e.target.value));
    $('#hHome').addEventListener('input', (e) => setHome(+e.target.value - 1));
    segBind('#hTable', (v) => setTable(v)); segBind('#hSet', (v) => setSet(v));
    $('#hCv').addEventListener('click', (e) => {
      const r = $('#hCv').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * L21.TW, y = (e.clientY - r.top) / r.height * L21.TW, t = tableNow();
      let bi = 0, bd = Infinity; t.objs.forEach((q, i) => { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; bi = i; } });
      if (bd < 14) setCmd(bi);
    });
    let last = 0; subs.push(() => { const now = performance.now(); if (S.busy == null || now - last > 120) { last = now; render(); } });
    ctl = mountMissions('#hMis', missions, api, { controls: { n: '#wrapHN', set: '#wrapHSet', home: '#wrapHHome', table: '#wrapHTable' }, scene: '#hCv' });
    syncRange($('#hN'), '1'); syncRange($('#hHome'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, S };
})();

/* ---------- Ось: что добавила каждая модель ---------- */
function initAxis() {
  return Cards.sort('#axisSort', {
    targets: [{ id: 'p0', label: 'π0', note: 'октябрь 2024' }, { id: 'p05', label: 'π0.5', note: 'апрель 2025' }, { id: 'p06', label: 'π*0.6', note: 'ноябрь 2025' }, { id: 'p07', label: 'π0.7', note: 'апрель 2026' }],
    items: [
      { id: 'sub', label: 'Модель сама называет подзадачу словами, потом выдаёт действия', target: 'p05', why: 'В π0 подзадачи говорила отдельная модель; в π0.5 оба уровня — одни и те же веса.' },
      { id: 'value', label: 'Функция ценности оценивает, сколько шагов осталось до успеха', target: 'p06', why: 'Из неё RECAP считает преимущество каждого действия.' },
      { id: 'chunk', label: 'Пачка из 50 действий от эксперта на flow matching', target: 'p0', why: 'Это π0 из урока 3.6; все следующие модели сохранили эксперт и пачку.' },
      { id: 'meta', label: 'Скорость, качество и ошибки эпизода в подсказке', target: 'p07', why: 'Метаданные эпизода делают π0.7 управляемой и позволяют учиться на данных разного качества.' },
      { id: 'sg', label: 'Градиент эксперта действий не идёт в модель зрения и языка', target: 'p05', why: 'Работа об изоляции знаний вышла через месяц после π0.5 и формализует её рецепт.' },
      { id: 'corr', label: 'Исправления оператора и собственные попытки робота в данных', target: 'p06', why: 'π*0.6 учится на опыте: автономные эпизоды с оценкой и исправления человека.' },
      { id: 'homes', label: 'Уборка в домах, которых не было в обучении', target: 'p05', why: 'π0.5 проверяли в трёх новых домах и в макетах.' },
      { id: 'goal', label: 'Картинки подцели от модели-генератора', target: 'p07', why: 'До трёх изображений того, как должна выглядеть сцена после подзадачи.' },
      { id: 'pre', label: 'Предобучение на 10 тысячах часов записей, потом постобучение на задаче', target: 'p0', why: 'Два этапа обучения появились в π0.' },
      { id: 'adv', label: '«Advantage: positive» во входе модели', target: 'p06', why: 'Условие на преимущество — ядро RECAP: модель учится на всех попытках, а работает с хорошим условием.' },
      { id: 'coach', label: 'Новая длинная задача по подсказкам человека шаг за шагом', target: 'p07', why: 'Коучинг π0.7. В π0.5 словесные инструкции служили только для сбора данных обучения.' },
      { id: 'mix', label: 'Записи нужной задачи — 2,4% смеси, остальное — другие роботы и веб-данные', target: 'p05', why: 'Ко-обучение на шести видах данных — главная идея π0.5.' },
    ],
    after: 'Каждая следующая модель сохраняла всё, что было до неё: эксперт и пачка из π0, подзадачи из π0.5, данные с оценками из π*0.6 вошли в обучение π0.7.',
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
    { q: 'π0.5 учили в основном на записях мобильных роботов, которые убирают в домах?', o: ['Да, иначе она не работала бы в домах', 'Нет: такие записи — около 400 часов, лишь 2,4% примеров первого этапа; остальное — другие роботы, веб-данные и подписи шагов', 'Нет: её учили только на веб-данных'], a: 1, e: 'Записи мобильных роботов из примерно 100 домов — малая часть смеси. Без данных других роботов (ME или CE) результат в новых домах заметно падает.' },
    { q: 'Иерархическая π0.5 — это две модели: планировщик и политика?', o: ['Да, как SayCan', 'Нет: одна и та же модель сначала пишет подзадачу текстом, потом выдаёт пачку действий, зависящую только от подзадачи', 'Нет: подзадачи ей диктует человек'], a: 1, e: 'Авторы подчёркивают, что используют одну модель для обоих уровней. Человек может подсказывать подзадачи, но это вариант для сравнения, а не устройство π0.5.' },
    { q: 'Чтобы модель работала в новом доме, достаточно записать больше демонстраций в одном доме?', o: ['Да, количество решает', 'Нет: при равном числе примеров результат растёт с числом разных мест; π0.5 из 104 мест работает примерно как модель, обученная в самих проверочных домах', 'Нет: нужно записывать только в проверочном доме'], a: 1, e: 'В опыте π0.5 число шагов обучения подобрали так, чтобы каждая модель видела одинаковое число примеров. В лаборатории 96 записей из одного дома дали 85 верных захватов из 128, из 12 домов — 114.' },
    { q: 'Если модель зрения и языка учится вместе с экспертом действий, ей это только на пользу?', o: ['Да: она узнаёт больше о действиях', 'Нет: градиент случайно инициализированного эксперта портит её знания — модель хуже следует командам и учится медленнее', 'Нет: она перестаёт видеть картинки'], a: 1, e: 'В статье о изоляции знаний π0 на просьбу убрать ложку брала мусор и требовала в 7,5 раза больше шагов обучения. Решение — остановить градиент эксперта и учить модель действиям через токены FAST.' },
    { q: 'Остановка градиента значит, что модель зрения и языка заморожена?', o: ['Да, её веса не меняются', 'Нет: она продолжает учиться на токенах FAST и веб-данных; не проходит в неё только градиент эксперта', 'Нет: заморожен эксперт'], a: 1, e: 'Заморозить модель целиком нельзя: в опытах статьи такая модель не справилась ни разу. Изоляция отделяет только ошибку эксперта.' },
    { q: 'Рассуждение цепочкой перед действием достаётся бесплатно?', o: ['Да, токенов почти не прибавляется', 'Нет: ECoT пишет около 350 токенов на шаг вместо 7, поэтому план и подзадачу пересчитывают раз в 5 шагов', 'Нет: оно требует второго робота'], a: 1, e: 'Успех OpenVLA вырос на 28 пунктов, но вывод заметно замедлился. У π0.5 подзадача — короткое рассуждение, и верхний уровень работает реже нижнего.' },
    { q: 'π*0.6 учится на опыте, выбрасывая неудачные попытки?', o: ['Да, остаются только успешные эпизоды', 'Нет: модель учится на всех данных, а во вход пишут «Advantage: positive» или «negative»; при работе ставят positive', 'Нет: неудачные попытки она повторяет'], a: 1, e: 'Методы взвешенной регрессии фактически выбрасывают большую часть данных, а условие на преимущество использует всё. Исправления оператора всегда помечены как positive.' },
    { q: '«Quality: 5» в подсказке π0.7 — это оценка, которую выдаёт модель?', o: ['Да, модель так оценивает свою работу', 'Нет: это вход; в обучении он описывает эпизод, а при работе в него ставят лучшее значение, чтобы получить лучшее поведение', 'Нет: это номер версии модели'], a: 1, e: 'Метаданные позволяют учиться на данных разного качества: без них модель на большей смеси может стать хуже, с ними — продолжает улучшаться.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('clear', () => { mis.clear = Clear.init(); }); safe('homes', () => { mis.homes = Homes.init(); });
    safe('axis', () => { mis.axis = initAxis(); }); safe('quiz', initQuiz);
    safe('count', () => { const n = ['cMis', 'hMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l38 = { mis, SPEED, Clear, Homes, L38 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
