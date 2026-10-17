/* =====================================================================
   ui-l21.js — урок 2.1 «Transporter и CLIPort». Интерактивы — миссии
   на живой сцене (shared/missions.js):
   1) мини-CLIP: матрица сходства во время обучения и поиск по описанию,
      в том числе сочетания, которого не было в обучении;
   2) карта «где взять» против регрессии координат на 30 новых сценах;
   3) укладка: поиск вырезки по 36 поворотам; график из статьи Transporter;
   4) CLIPort в миниатюре: «что» от мини-CLIP, «где» от фильтра, новые цвета.
   Движок — l21/engine.js (без DOM).
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
const pc = (v, d) => fmt(v * 100, d == null ? 0 : d) + '%';
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
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
/** Прогнать генератор обучения кусками между кадрами, чтобы страница не замирала. */
async function runGen(gen, perFrame, onEv) {
  for (;;) {
    let r; for (let i = 0; i < (perFrame || 1); i++) { r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); }
    await nextFrame();
  }
}
/** Картинка движка (Float32Array RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
function drawBitmap(c, bm, x, y, w, hgt) { c.imageSmoothingEnabled = false; c.drawImage(bm, x, y, w, hgt); }
/** Карта по клеткам поверх картинки: цвет col, прозрачность по значению 0…1. */
function heat(c, vals, n, x0, y0, size, col, amax) {
  const s = size / n; let mx = 1e-12; for (const v of vals) mx = Math.max(mx, v);
  c.fillStyle = col;
  for (let i = 0; i < vals.length; i++) { const a = Math.min(1, vals[i] / mx); if (a < 0.02) continue; c.globalAlpha = a * (amax || 0.75); c.fillRect(x0 + (i % n) * s, y0 + Math.floor(i / n) * s, s + 0.5, s + 0.5); }
  c.globalAlpha = 1;
}
/** Оценки карты для показа: 0…1 от минимума до максимума, степень подчёркивает пики. */
function show01(vals, pw) { let mn = 1e9, mx = -1e9; for (const v of vals) { mn = Math.min(mn, v); mx = Math.max(mx, v); } const o = new Float64Array(vals.length); for (let i = 0; i < vals.length; i++) o[i] = Math.pow((vals[i] - mn) / (mx - mn || 1), pw || 3); return o; }
/** Для мини-карт: ниже медианы — ноль (фон), выше — 0…1 со степенью. Без этого фон карты закрашен, а вокруг предметов белые провалы. */
function peaks01(vals, pw) {
  const srt = Array.from(vals).sort((a, b) => a - b), floor = srt[Math.floor(srt.length / 2)], mx = srt[srt.length - 1], o = new Float64Array(vals.length);
  for (let i = 0; i < vals.length; i++) o[i] = Math.pow(Math.max(0, (vals[i] - floor) / Math.max(1e-12, mx - floor)), pw || 1.5);
  return o;
}
/** Мини-карта 24 × 24: фон, сетка клеток и оценки цветом col. */
function drawMini(sel, vals, col, empty) {
  const cv = $(sel), S = 144, { c } = HeroKit.fit(cv, S, S), P = pal();
  c.fillStyle = P.bg; c.fillRect(0, 0, S, S);
  if (!vals) { HeroKit.label(c, 1, empty || 'нет', S / 2, S / 2, { px: 12, color: P.ink3, halo: false }); return; }
  heat(c, peaks01(vals, 1.5), L21.G, 0, 0, S, col, 0.95);
  c.strokeStyle = P.grid; c.lineWidth = 0.6; c.beginPath();
  for (let i = 1; i < L21.G; i++) { const v = i * S / L21.G; c.moveTo(v, 0); c.lineTo(v, S); c.moveTo(0, v); c.lineTo(S, v); }
  c.stroke();
}
const colorWord = (id, g) => { const c = L21.COLORS[L21.CI[id]]; return g === 'f' ? c.f : c.m; };
const rgbCss = (id) => { const [r, g, b] = L21.COLORS[L21.CI[id]].rgb; return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`; };

/* ---------- общий мини-CLIP: обучается в лаборатории 1, нужен и в лаборатории 3 ---------- */
const Store = (() => {
  let cl = L21.clipInit(7), trained = false, busy = null;
  return {
    get cl() { return cl; }, get trained() { return trained; },
    /** Обучить (или дождаться идущего обучения); onEv — прогресс. */
    train(onEv) {
      if (trained) return Promise.resolve(cl);
      if (busy) return busy;
      busy = runGen(L21.clipTrain(cl, { seed: 7 }), Math.max(1, Math.round(1 * SPEED.k)), onEv).then(() => { trained = true; busy = null; return cl; });
      return busy;
    },
    reset() { if (busy) return; cl = L21.clipInit(7); trained = false; },
  };
})();

/* ---------- 1. Мини-CLIP: матрица сходства и поиск по описанию ---------- */
const LabClip = (() => {
  const E = L21, W = 440, MAT = [['red', 'cube'], ['blue', 'ball'], ['green', 'bowl'], ['yellow', 'can'], ['purple', 'ball'], ['orange', 'cube'], ['blue', 'bowl'], ['red', 'can']];
  const GW = 520, GH = 200, gal = [];
  const st = { mat: null, steps: 0, loss: null, color: 'blue', shape: 'bowl', rank: null, training: false };
  let ctl = null, matBms = [], galBms = [];
  function recompute() {
    st.mat = E.clipMatrix(Store.cl, MAT, 5);
    { const M = st.mat.M; let hits = 0; for (let i = 0; i < M.length; i++) { let bj = 0; for (let j = 1; j < M.length; j++) if (M[j][i] > M[bj][i]) bj = j; if (bj === i) hits++; } st.mat.hits = hits; }
    matBms = st.mat.imgs.map((im) => bitmap(im, E.IS, E.IS));
    st.rank = E.clipSearch(Store.cl, gal, E.tokens(st.color, st.shape));
  }
  function state() {
    const top = st.rank ? gal[st.rank[0].i] : null;
    return { trained: Store.trained, hits: st.mat ? st.mat.hits : 0, color: st.color, shape: st.shape, topColor: top && top.c, topShape: top && top.s, topOk: !!top && top.c === st.color && top.s === st.shape, steps: st.steps };
  }
  function drawMat() {
    // ширина столбца подписей зависит от экрана: шрифт задан в экранных пикселях
    const cv = $('#cMat'), n = MAT.length, k0 = W / (cv.getBoundingClientRect().width || W), c0 = cv.getContext('2d');
    HeroKit.font(c0, k0, 11, 600); let lw = 0; for (const [cc, ss] of MAT) lw = Math.max(lw, c0.measureText(E.phrase(cc, ss)).width);
    const L = Math.ceil(lw) + 14, s = (W - L - 8) / n, T = s + 10, MH = Math.round(T + n * s + 10);
    cv.style.aspectRatio = `${W} / ${MH}`;
    const { c, k } = HeroKit.fit(cv, W, MH), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, MH);
    // столбцы — картинки сверху, строки — подписи слева
    for (let j = 0; j < n; j++) drawBitmap(c, matBms[j], L + j * s + 4, T - s + 8, s - 8, s - 8);
    for (let i = 0; i < n; i++) { const [cc, ss] = MAT[i]; HeroKit.label(c, k, E.phrase(cc, ss), L - 8, T + i * s + s / 2, { align: 'right', px: 11, color: P.ink2, halo: false }); }
    const M = st.mat.M;                                   // M[картинка][подпись]
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = M[j][i], a = Math.max(0, Math.min(1, (v + 0.2) / 1.1)), x = L + j * s + 2, y = T + i * s + 2;
      c.fillStyle = P.e2e; c.globalAlpha = 0.08 + 0.9 * a; c.fillRect(x, y, s - 4, s - 4); c.globalAlpha = 1;
      if (i === j) { c.strokeStyle = P.ink; c.lineWidth = 1.6; c.strokeRect(x - 1, y - 1, s - 2, s - 2); }
    }
    // для каждой подписи — картинка, ближайшая к ней: точка
    for (let i = 0; i < n; i++) { let bj = 0; for (let j = 1; j < n; j++) if (M[j][i] > M[bj][i]) bj = j; c.beginPath(); c.arc(L + bj * s + s / 2, T + i * s + s / 2, 4, 0, 7); c.fillStyle = bj === i ? P.good : P.bad; c.fill(); }
  }
  function drawGal() {
    const { c, k } = HeroKit.fit($('#cGal'), GW, GH), P = pal(), cols = 8, rows = 3, s = Math.min((GW - 8) / cols, (GH - 8) / rows);
    c.fillStyle = P.bg; c.fillRect(0, 0, GW, GH);
    const place = new Map(); if (st.rank) st.rank.slice(0, 3).forEach((r, q) => place.set(r.i, q + 1));
    gal.forEach((g, i) => {
      const x = 4 + (i % cols) * s, y = 4 + Math.floor(i / cols) * s;
      drawBitmap(c, galBms[i], x + 6, y + 6, s - 12, s - 12);
      const p = place.get(i);
      if (p) {
        c.strokeStyle = p === 1 ? P.e2e : P.ink3; c.lineWidth = p === 1 ? 3 : 1.6; c.strokeRect(x + 3, y + 3, s - 6, s - 6);
        c.beginPath(); c.arc(x + 14, y + 14, 10, 0, 7); c.fillStyle = p === 1 ? P.e2e : P.ink3; c.fill();
        HeroKit.label(c, k, String(p), x + 14, y + 14, { px: 11, weight: 800, color: '#fff', halo: false });
      }
      if (E.isHeld(g.c, g.s)) { c.setLineDash([4, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.strokeRect(x + 1, y + 1, s - 2, s - 2); c.setLineDash([]); }
    });
  }
  function out() {
    const s = state(), top = st.rank && gal[st.rank[0].i];
    setOut($('#cOut'), (Store.trained ? `Обучено: ${st.steps} шагов` : st.steps ? `Обучение: шаг ${st.steps} из 600` : 'Сеть не обучена: векторы случайны') + (st.loss != null ? ` · ошибка ${fmt(st.loss, 2)}` : '') + ` · подпись нашла свою картинку: <b>${s.hits} из 8</b>`);
    if (top) setOut($('#cGalOut'), `Описание «${E.phrase(st.color, st.shape)}» → первое место: <b>${E.phrase(top.c, top.s)}</b>, сходство ${fmt(st.rank[0].s, 2)}${s.topOk ? '' : ' — не то, что искали'}`);
  }
  function draw() { drawMat(); drawGal(); out(); }
  function setQuery(color, shape) {
    if (color) st.color = color; if (shape) st.shape = shape;
    $$('#cColor button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.color)));
    $$('#cShape button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.shape)));
    st.rank = E.clipSearch(Store.cl, gal, E.tokens(st.color, st.shape)); draw(); if (ctl) ctl.update();
  }
  const api = {
    reset() { Store.reset(); st.steps = 0; st.loss = null; recompute(); setQuery('blue', 'bowl'); },
    state,
    async train() {
      if (Store.trained) { recompute(); draw(); return state(); }
      st.training = true; let n = 0;
      await Store.train((ev) => { st.steps = ev.steps; st.loss = ev.loss; if (++n % 3 === 0) { recompute(); draw(); } });
      st.training = false; recompute(); draw(); if (LabCliport.onClip) LabCliport.onClip();
      return state();
    },
    async search() { if (!Store.trained) await api.train(); st.rank = E.clipSearch(Store.cl, gal, E.tokens(st.color, st.shape)); draw(); return state(); },
    setQuery,
  };
  const missions = [
    { short: 'Обучи', title: 'Обучи мини-CLIP', text: 'Сеть ещё не обучена: векторы картинок и подписей случайны, поэтому и сходство случайное. Диагональ матрицы не выделяется, и почти каждая подпись ближе всего к чужой картинке — красная точка. Запусти обучение. На каждом шаге модель берёт пакет из 16 пар «картинка — подпись», сближает векторы верных пар и разводит векторы неверных.',
      bet: { q: 'что станет с диагональю матрицы?', options: ['Станет самой яркой: каждая подпись ближе всего к своей картинке', 'Вся матрица станет одинаково яркой', 'Ничего не изменится: шестисот шагов мало'], answer: () => 0 },
      action: { label: 'Обучить', run: (X) => X.train() },
      criteria: [{ label: 'Каждая подпись нашла свою картинку: 8 из 8', test: (r) => r.hits === 8 }],
      explain: () => 'Диагональ стала самой яркой: контрастная цель тянет друг к другу векторы верных пар и расталкивает неверные. Матрица на сцене — картинки, нарисованные заново, а не те, на которых модель училась. CLIP делает то же на 400 миллионах пар, и в его пакете не 16 пар, а 32 768: чем больше неверных пар в пакете, тем тоньше различия, которые приходится выучить.' },
    { short: 'Найди', title: 'Найди синюю миску по описанию', text: 'Теперь поиск. Выбери слова описания: цвет и форму. Модель сравнит вектор описания с векторами всех 24 предметов, и первое место получит ближайший.',
      controls: ['color', 'shape'],
      criteria: [{ label: 'Описание — «синяя миска»', test: (r, s) => s.color === 'blue' && s.shape === 'bowl' }, { label: 'Первое место — синяя миска', test: (r, s) => s.color === 'blue' && s.shape === 'bowl' && s.topOk }],
      hint: 'Цвет и форма выбираются кнопками под матрицей.',
      explain: () => 'Классов в модели нет: поиск — это сравнение векторов. Описание можно собрать из любых слов словаря, и модель найдёт ближайшую картинку. Так CLIP классифицирует без обучения на классах: каждому классу пишут подпись вроде «A photo of a dog», и побеждает подпись, ближайшая к картинке.' },
    { short: 'Новое', title: 'Найди то, чего не было в обучении', text: 'Фиолетового кубика нет ни в одной паре обучения: фиолетовый модель видела только на мяче, миске и банке, а кубики — только пяти других цветов. Опиши фиолетовый кубик и запусти поиск.',
      controls: ['color', 'shape'],
      onEnter: (X) => X.setQuery('purple', 'cube'),
      bet: { q: 'найдёт ли модель фиолетовый кубик?', options: ['Да, на первом месте', 'Нет: такой картинки она не видела', 'Найдёт фиолетовый мяч'], answer: (r) => (r.topOk ? 0 : r.topColor === 'purple' ? 2 : 1) },
      action: { label: 'Искать', run: (X) => X.search() },
      criteria: [{ label: 'Описание — «фиолетовый кубик»', test: (r) => r.color === 'purple' && r.shape === 'cube' }, { label: 'Первое место — фиолетовый кубик', test: (r) => r.color === 'purple' && r.shape === 'cube' && r.topOk }],
      fail: () => 'Нужно описание «фиолетовый кубик»: выбери оба слова и запусти поиск.',
      explain: () => 'Модель нашла предмет, которого не видела. Вектор описания — сумма векторов слов, а цвет и форму картинки сеть научилась кодировать по отдельности. Новое сочетание знакомых признаков попало туда, куда указывает сумма слов. Это нулевой перенос: CLIP описывает словами классы, которых не было в его обучении, и узнаёт их на картинках. В нашей маленькой модели перенос получается не при любом начальном зерне, у CLIP его дают масштаб и разнообразие данных.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Ищи любые сочетания цвета и формы. Найди описание, на котором второе место почти догоняет первое, и подумай, почему эти предметы оказались рядом.', final: true, controls: ['color', 'shape'] },
  ];
  function init() {
    const r = E.rng(2024);
    for (const c of E.COLORS) for (const s of E.SHAPES) gal.push({ c: c.id, s: s.id, img: E.icon(c.id, s.id, r) });
    galBms = gal.map((g) => bitmap(g.img, E.IS, E.IS));
    const cBox = $('#cColor'), sBox = $('#cShape');
    E.COLORS.forEach((c) => { const b = h('button', { type: 'button', 'data-v': c.id, 'aria-pressed': 'false' }, h('i', { class: 'sw', style: `background:${rgbCss(c.id)}` }), c.m); cBox.append(b); });
    E.SHAPES.forEach((s) => sBox.append(h('button', { type: 'button', 'data-v': s.id, 'aria-pressed': 'false' }, s.name)));
    cBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setQuery(b.dataset.v, null); });
    sBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setQuery(null, b.dataset.v); });
    legend('#cMatLegend', [['сходство векторов', 'var(--e2e)'], ['ближайшая к подписи картинка: своя', 'var(--good)', 'dot'], ['чужая', 'var(--critical)', 'dot']]);
    recompute();
    ctl = mountMissions('#cMis', missions, api, { controls: { color: '#cColor', shape: '#cShape' } });
    setQuery('blue', 'bowl'); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, refresh: () => { recompute(); draw(); } };
})();

/* ---------- 2. Карта «где взять» против регрессии координат ---------- */
const LabPick = (() => {
  const E = L21, W = 440, NT = 30;
  const st = { n: 1, task: 'redCube', scene: 1, res: null, busy: false, demo0: null };
  let ctl = null;
  const cache = {};
  async function trainModels(n, task) {
    const key = task + ':' + n; if (cache[key]) return cache[key];
    const demos = []; for (let i = 0; i < n; i++) demos.push(E.demo(task, 100 + i));
    const map = await runGen(E.pickTrain(E.pickInit(4), demos), 4), reg = await runGen(E.regTrain(demos), 6);
    return (cache[key] = { map, reg, demos });
  }
  async function run() {
    st.busy = true; setOut($('#pOut'), 'Обучаю обе модели…'); await nextFrame();
    const m = await trainModels(st.n, st.task);
    const a = E.evalPick('map', m.map, st.task, NT), b = E.evalPick('reg', m.reg, st.task, NT);
    st.res = { n: st.n, task: st.task, map: a.rate, reg: b.rate, mapRuns: a.runs, regRuns: b.runs, model: m.map };
    st.busy = false; draw();
    return { n: st.n, task: st.task, map: a.rate, reg: b.rate };
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#pCv'), W, W), P = pal();
    let scene, mapRun = null, regRun = null;
    if (st.res && st.res.task === st.task && st.res.n === st.n) { mapRun = st.res.mapRuns[st.scene - 1]; regRun = st.res.regRuns[st.scene - 1]; scene = mapRun.scene; }
    else scene = (st.demo0 = E.demo(st.task, 100)).scene;
    drawBitmap(c, bitmap(scene.img, E.TW, E.TW), 0, 0, W, W);
    const sc = W / E.TW;
    drawMini('#pMap', mapRun ? E.pickScores(st.res.model, scene.grid) : null, P.e2e, 'обучи модели');
    if (mapRun) {
      heat(c, show01(E.pickScores(st.res.model, scene.grid), 3), E.G, 0, 0, W, P.e2e, 0.7);
      const p = mapRun.p; c.beginPath(); c.arc(p.x * sc, p.y * sc, 16, 0, 7); c.lineWidth = 3; c.strokeStyle = mapRun.ok ? P.good : P.bad; c.stroke();
      const q = regRun.p; HeroKit.cross(c, q.x * sc, q.y * sc, 9, regRun.ok ? P.good : P.ink, 3.2);
      HeroKit.label(c, k, 'карта', p.x * sc, p.y * sc - 26, { px: 11.5, weight: 700, color: P.e2e });
      HeroKit.label(c, k, 'регрессия', q.x * sc, q.y * sc + 22, { px: 11.5, weight: 700, color: P.ink });
    } else if (st.demo0) {
      const t = E.cellXY(st.demo0.target); c.beginPath(); c.arc(t.x * sc, t.y * sc, 16, 0, 7); c.setLineDash([5, 4]); c.lineWidth = 2.5; c.strokeStyle = P.ink; c.stroke(); c.setLineDash([]);
      HeroKit.label(c, k, 'демонстрация: взять здесь', t.x * sc, t.y * sc - 26, { px: 11.5, weight: 700, color: P.ink });
    }
    out();
  }
  function out() {
    const r = st.res;
    if (!r || r.task !== st.task || r.n !== st.n) { setOut($('#pOut'), `Демонстраций: ${st.n}. Пунктир — где оператор взял в первой демонстрации. Обучи модели, и здесь появятся сцены проверки.`); return; }
    const mr = r.mapRuns[st.scene - 1], rr = r.regRuns[st.scene - 1];
    setOut($('#pOut'), `Новые сцены: карта взяла правильно <b>${Math.round(r.map * NT)} из ${NT}</b>, регрессия — <b>${Math.round(r.reg * NT)} из ${NT}</b>. Сцена ${st.scene}: карта ${mr.ok ? '✓' : '✗'}, регрессия ${rr.ok ? '✓' : '✗'}.`);
  }
  function setN(n) { st.n = n; $$('#pDemos button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === n))); draw(); if (ctl) ctl.update(); }
  function setTask(t) { st.task = t; $$('#pTask button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t))); draw(); if (ctl) ctl.update(); }
  const api = { reset() { st.res = null; st.scene = 1; $('#pScene').value = 1; syncRange($('#pScene'), '1'); setN(1); setTask('redCube'); }, state: () => ({ n: st.n, task: st.task, res: st.res }), run, setN, setTask };
  const missions = [
    { short: 'Одна', title: 'Научи брать по одной демонстрации', text: 'Оператор один раз взял красный кубик — место отмечено пунктиром. Обучи на этой демонстрации карту и регрессию координат и проверь обе на 30 новых сценах, где предметы лежат в других местах.',
      onEnter: (X) => { X.setN(1); X.setTask('redCube'); },
      bet: { q: 'какая модель возьмёт красный кубик в новых сценах?', options: ['Обе', 'Только карта', 'Только регрессия', 'Ни одна'], answer: (r) => (r.map >= 0.9 && r.reg >= 0.9 ? 0 : r.map >= 0.9 ? 1 : r.reg >= 0.9 ? 2 : 3) },
      action: { label: 'Обучить и проверить', run: (X) => X.run() },
      criteria: [{ label: 'Карта берёт красный кубик не меньше чем в 27 сценах из 30', test: (r) => r.map >= 0.9 }],
      explain: (r) => `Карта взяла правильно в ${Math.round(r.map * NT)} сценах из ${NT}, регрессия — в ${Math.round(r.reg * NT)}. Фильтр карты одинаков во всех клетках и после одной демонстрации отвечает на «красный кубик» в любом месте стола. Регрессия запомнила, где был кубик в демонстрации, и тянется туда. Листай сцены проверки ползунком: оранжевое пятно — карта, крестик — регрессия.` },
    { short: 'Двадцать', title: 'Дай регрессии больше примеров', text: 'Может быть, регрессии просто мало данных? Дай обеим моделям 20 демонстраций и проверь снова.',
      controls: ['demos'],
      action: { label: 'Обучить и проверить', run: (X) => X.run() },
      criteria: [{ label: 'Обучено на 20 демонстрациях', test: (r) => r.n === 20 }, { label: 'Карта по-прежнему берёт правильно в 27 сценах и больше', test: (r) => r.n === 20 && r.map >= 0.9 }],
      fail: (r) => (r.n !== 20 ? 'Выбери 20 демонстраций.' : ''),
      explain: (r) => `С 20 демонстрациями регрессия берёт правильно в ${Math.round(r.reg * NT)} сценах из ${NT}. Ей нужно выучить, как каждое положение кубика превращается в два числа, а 20 примеров покрывают стол очень редко. В статье Transporter свёрточная сеть с регрессией вставляет блок в гнездо в 8% попыток даже после тысячи демонстраций, а карта — в 100% после одной.` },
    { short: 'Два кубика', title: 'Два одинаковых кубика', text: 'Теперь на столе два красных кубика, и в демонстрациях оператор берёт то один, то другой. Обучи модели на 20 таких демонстрациях.',
      controls: ['demos', 'task'], onEnter: (X) => { X.setTask('twoRed'); X.setN(20); },
      bet: { q: 'куда попадёт регрессия?', options: ['В один из кубиков', 'Между кубиками', 'В миску'], answer: (r) => (r.reg >= 0.5 ? 0 : 1) },
      action: { label: 'Обучить и проверить', run: (X) => X.run() },
      criteria: [{ label: 'Задача — два красных кубика', test: (r) => r.task === 'twoRed' }, { label: 'Карта берёт один из кубиков не меньше чем в 27 сценах из 30', test: (r) => r.task === 'twoRed' && r.map >= 0.9 }],
      explain: () => 'У карты два пика — по одному на каждый кубик, и робот берёт там, где пик выше. Регрессия выдаёт одну точку, и лучшая точка по среднему квадрату ошибки — между кубиками, в пустом месте стола. Это та же история, что с чайником в уроке 1.3: карта — это распределение действий, а регрессия — его среднее.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число демонстраций и задачу, листай сцены проверки. Найди сцену, где карта ошиблась, если такая есть, и посмотри, на что был похож её пик.', final: true, controls: ['demos', 'task', 'scene'] },
  ];
  function init() {
    legend('#pLegend', [['карта «где взять»', 'var(--e2e)'], ['выбор карты', 'var(--good)', 'ring'], ['точка регрессии', 'var(--ink)', 'cross']]);
    $('#pDemos').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) setN(+b.dataset.v); });
    $('#pTask').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) setTask(b.dataset.v); });
    $('#pScene').addEventListener('input', (e) => { st.scene = +e.target.value; syncRange(e.target, String(st.scene)); draw(); });
    syncRange($('#pScene'), '1');
    ctl = mountMissions('#pMis', missions, api, { controls: { demos: '#pDemos', task: '#pTask', scene: '#wrapPScene' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 3. Укладка: поиск вырезки по 36 поворотам, график из статьи ---------- */
const LabPlace = (() => {
  const E = L21, W = 440, FX = { x: 16, y: 16 };
  const st = { fa: 40, k: 0, fx: null, map: null, best: null, scan: null };
  let ctl = null;
  function recompute() { st.fx = E.fixture(FX.x, FX.y, st.fa * Math.PI / 180); st.map = E.transportMap(st.fx, st.k); const i = E.argmax(st.map); st.cur = { s: st.map[i], x: i % E.PG, y: Math.floor(i / E.PG) }; }
  function state() { return { k: st.k, fa: st.fa, score: st.cur.s, deg: st.k * 10 }; }
  function draw() {
    const { c, k } = HeroKit.fit($('#tCv'), W, W), P = pal(), s = W / E.PG;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, W);
    for (let i = 0; i < E.PG * E.PG; i++) { const v = st.fx[i]; if (!v) continue; c.fillStyle = v > 0 ? P.surf : P.ink3; c.globalAlpha = v > 0 ? 1 : 0.55; c.fillRect((i % E.PG) * s, Math.floor(i / E.PG) * s, s, s); }
    c.globalAlpha = 1;
    const pos = new Float64Array(st.map.length); for (let i = 0; i < pos.length; i++) pos[i] = Math.max(0, st.map[i]);
    heat(c, pos, E.PG, 0, 0, W, P.e2e, 0.75);
    // деталь в лучшем месте для текущего поворота: заливка и контур по границе клеток
    const cells = E.pieceCells(st.k * Math.PI / 18), set = new Set(cells.map(([dx, dy]) => dx + ',' + dy));
    c.fillStyle = P.cl; c.globalAlpha = 0.28;
    for (const [dx, dy] of cells) c.fillRect((st.cur.x + dx) * s, (st.cur.y + dy) * s, s + 0.5, s + 0.5);
    c.globalAlpha = 1; c.strokeStyle = P.cl; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath();
    for (const [dx, dy] of cells) {
      const x = (st.cur.x + dx) * s, y = (st.cur.y + dy) * s;
      if (!set.has(dx + ',' + (dy - 1))) { c.moveTo(x, y); c.lineTo(x + s, y); }
      if (!set.has(dx + ',' + (dy + 1))) { c.moveTo(x, y + s); c.lineTo(x + s, y + s); }
      if (!set.has((dx - 1) + ',' + dy)) { c.moveTo(x, y); c.lineTo(x, y + s); }
      if (!set.has((dx + 1) + ',' + dy)) { c.moveTo(x + s, y); c.lineTo(x + s, y + s); }
    }
    c.stroke();
    HeroKit.label(c, k, `вырезка, ${st.k * 10}°`, (st.cur.x + 0.5) * s, (st.cur.y - 9) * s, { px: 12, weight: 700, color: P.cl });
    out();
  }
  function out() { setOut($('#tOut'), `Поворот вырезки ${st.k * 10}°: лучшее совпадение <b>${pc(Math.max(0, st.cur.s))}</b>, в этом месте и стоит синяя деталь.` + (st.scan ? ` Перебор 36 карт: лучший поворот — <b>${st.scan.k * 10}°</b>, ${pc(st.scan.s)}.` : '')); }
  function setK(kk) { st.k = ((kk % 36) + 36) % 36; $('#tAng').value = st.k; syncRange($('#tAng'), `${st.k * 10}°`); recompute(); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.fa = 40; st.scan = null; setK(0); },
    state,
    async rotateAndScan() {
      st.fa = 130; st.scan = null; setK(0);
      let best = { s: -1e9, k: 0 };
      for (let kk = 0; kk < 36; kk++) { setK(kk); if (st.cur.s > best.s) best = { s: st.cur.s, k: kk }; await new Promise((r) => setTimeout(r, 70 / SPEED.k)); }
      st.scan = best; setK(best.k);
      return { fa: st.fa, k: best.k, s: best.s };
    },
    setK,
  };
  const missions = [
    { short: 'Угол', title: 'Найди поворот, при котором деталь войдёт в гнездо', text: 'Синяя деталь — вырезка вокруг взятого предмета. Для выбранного поворота карта показывает, насколько хорошо деталь ложится в каждую клетку, и деталь стоит в лучшей. Крути поворот, пока деталь не встанет в прорезь целиком.',
      controls: ['ang'],
      criteria: [{ label: 'Совпадение не меньше 95%', test: (r, s) => s.score >= 0.95 }],
      hint: 'Прорезь — светлые клетки внутри серых стенок. Сравни её с формой детали.',
      explain: (r, ctx) => 'На верном повороте карта даёт один яркий пик ровно в прорези, на соседних поворотах совпадение резко падает: часть детали упирается в стенки. Transporter не учит угол как число: он строит 36 карт для повёрнутых копий вырезки и берёт самую яркую клетку среди всех. Поворот становится ещё одной осью карты.' },
    { short: 'Повернуть', title: 'Поверни гнездо', text: 'Повернём гнездо на 130°. Модель запустит перебор: построит карты для всех 36 поворотов вырезки и выберет лучший.',
      bet: { q: 'нужно ли обучать модель заново, чтобы найти новый угол?', options: ['Да, нужны демонстрации с гнездом под 130°', 'Нет: карты для 36 поворотов покрывают и этот угол', 'Нет, но совпадение будет хуже'], answer: () => 1 },
      action: { label: 'Повернуть гнездо и перебрать повороты', run: (X) => X.rotateAndScan() },
      criteria: [{ label: 'Найден поворот 130°', test: (r) => r.k * 10 === 130 }, { label: 'Совпадение не меньше 95%', test: (r) => r.s >= 0.95 }],
      explain: () => 'Модель нашла новый угол без обучения: поворот гнезда превращается в сдвиг пика по оси поворотов. Это вторая симметрия, которую использует Transporter, вместе со сдвигом по столу. В статье вставка блока в гнездо с одной демонстрацией даёт 100% на новых положениях и поворотах гнезда.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Крути поворот и смотри, как меняется карта. Найди поворот, при котором у карты два почти одинаковых пика, и подумай, когда это нормально.', final: true, controls: ['ang'] },
  ];
  /* график из статьи: успех трёх моделей при 1, 10, 100, 1000 демонстрациях (табл. 2) */
  const DATA = {
    'block-insertion': { name: 'Вставить блок в гнездо', T: [100, 100, 100, 100], GT: [4, 52, 96, 99], CM: [0, 5, 6, 8] },
    'palletizing-boxes': { name: 'Сложить коробки на паллету', T: [63.2, 77.4, 91.7, 97.9], GT: [0.6, 6.4, 30.2, 30.1], CM: [31.4, 37.4, 34.6, 32.0] },
    'assembling-kits': { name: 'Собрать набор из новых предметов', T: [28.4, 78.6, 90.4, 94.6], GT: [0, 0, 1.2, 11.8], CM: [0, 0.2, 0.2, 0] },
    'manipulating-rope': { name: 'Уложить верёвку', T: [21.9, 73.2, 85.4, 92.1], GT: [5.5, 11.5, 43.6, 47.4], CM: [3.7, 6.6, 3.8, 10.8] },
  };
  const SER = [['T', 'Transporter', '--e2e'], ['GT', 'GT-State MLP: точные позы на входе', '--classic'], ['CM', 'Conv. MLP: регрессия по картинке', '--ink-3']];
  const chart = { task: 'block-insertion', hover: null };
  function drawChart() {
    const cv = $('#dCv'), CW = 640, CH = 260, { c, k } = HeroKit.fit(cv, CW, CH), P = pal(), d = DATA[chart.task];
    const box = { l: 46, r: CW - 16, t: 14, b: CH - 30 }, X = (i) => box.l + (box.r - box.l) * i / 3, Y = (v) => box.b - (box.b - box.t) * v / 100;
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CH);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 25, 50, 75, 100]) { c.beginPath(); c.moveTo(box.l, Y(v)); c.lineTo(box.r, Y(v)); c.stroke(); HeroKit.label(c, k, v + '%', box.l - 6, Y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    ['1', '10', '100', '1000'].forEach((t, i) => HeroKit.label(c, k, t, X(i), box.b + 14, { px: 10.5, mono: true, color: P.ink3, halo: false }));
    for (const [key, , col] of SER) {
      const cc = HeroKit.css(col); c.strokeStyle = cc; c.lineWidth = 2.4; c.beginPath(); d[key].forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke();
      d[key].forEach((v, i) => { c.beginPath(); c.arc(X(i), Y(v), 4.5, 0, 7); c.fillStyle = cc; c.fill(); c.lineWidth = 2; c.strokeStyle = P.bg; c.stroke(); });
    }
    if (chart.hover) { const { i, key } = chart.hover, v = d[key][i]; HeroKit.label(c, k, `${fmt(v, v % 1 ? 1 : 0)}%`, X(i), Y(v) - 14, { px: 11.5, weight: 700, color: P.ink }); }
  }
  function initChart() {
    const box = $('#dTask');
    Object.entries(DATA).forEach(([id, d]) => box.append(h('button', { type: 'button', 'data-v': id, 'aria-pressed': String(id === chart.task) }, d.name)));
    box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; chart.task = b.dataset.v; $$('button', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawChart(); });
    legend('#dLegend', SER.map(([, t, col]) => [t, `var(${col})`]));
    const cv = $('#dCv');
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 640, y = (e.clientY - r.top) / r.height * 260, d = DATA[chart.task];
      let best = null, bd = 400;
      for (const [key] of SER) d[key].forEach((v, i) => { const px = 46 + (640 - 62) * i / 3, py = 246 - 232 * v / 100 - 0, dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = { i, key }; } });
      chart.hover = bd < 30 ? best : null; drawChart();
    });
    cv.addEventListener('pointerleave', () => { chart.hover = null; drawChart(); });
    drawChart(); redrawOn(drawChart);
  }
  function init() {
    legend('#tLegend', [['совпадение вырезки со сценой', 'var(--e2e)'], ['вырезка в лучшем месте', 'var(--classic)'], ['стенки гнезда', 'var(--ink-3)', 'box'], ['прорезь, куда должна войти деталь', 'var(--surface)', 'box']]);
    $('#tAng').addEventListener('input', (e) => setK(+e.target.value));
    recompute();
    ctl = mountMissions('#tMis', missions, api, { controls: { ang: '#wrapTAng' } });
    setK(0); redrawOn(draw); initChart();
    return ctl;
  }
  return { init, api, st, DATA };
})();

/* ---------- 4. CLIPort в миниатюре: «что» + «где», знакомые и новые цвета ---------- */
const LabCliport = (() => {
  const E = L21, W = 440, NS = 20;
  const st = { mode: 'none', color: 'red', scene: 1, res: null, models: null, cur: null, busy: false };
  let ctl = null;
  async function models() {
    if (st.models) return st.models;
    const demos = E.cmdDemos(9, 300);
    const where = await runGen(E.pickTrain(E.pickInit(4), demos), 4), cond = await runGen(E.condTrain(demos), 4);
    return (st.models = { where, cond });
  }
  function scoresFor(sc, mode, color) {
    const m = st.models, where = E.pickScores(m.where, sc.grid);
    if (mode === 'none') return { where, what: null, both: where };
    if (mode === 'robot') { const both = E.condScores(m.cond, sc.grid, color); return { where, what: null, both }; }
    const what = E.whatMap(Store.cl, sc.img, E.tokens(color, 'cube')); return { where, what, both: E.fuse(where, what) };
  }
  async function ensure() {
    if (!st.models) { setOut($('#kOut'), 'Обучаю фильтр «где» на девяти демонстрациях робота…'); await nextFrame(); await models(); }
    if (st.mode === 'cliport' && !Store.trained) { setOut($('#kOut'), 'Для CLIPort нужен мини-CLIP из лаборатории 1 — обучаю его…'); await Store.train(); LabClip.refresh(); }
  }
  async function preview() {
    await ensure();
    const sc = E.cmdScene(st.color, 900 + st.scene - 1), s = scoresFor(sc, st.mode, st.color), i = E.argmax(s.both), p = E.cellXY(i);
    st.cur = { sc, s, p, ok: E.hitObj(sc.target, p.x, p.y) }; draw();
  }
  async function run() {
    st.busy = true; await ensure(); let ok = 0;
    for (let i = 0; i < NS; i++) { const sc = E.cmdScene(st.color, 900 + i), s = scoresFor(sc, st.mode, st.color), p = E.cellXY(E.argmax(s.both)); if (E.hitObj(sc.target, p.x, p.y)) ok++; if (i % 5 === 4) await nextFrame(); }
    st.res = { mode: st.mode, color: st.color, rate: ok / NS, ok, n: NS, seen: E.SEEN.includes(st.color) };
    st.busy = false; await preview();
    return Object.assign({}, st.res);
  }
  function drawMap(sel, vals, col) { drawMini(sel, vals, col, 'нет'); }
  function draw() {
    const { c, k } = HeroKit.fit($('#kCv'), W, W), P = pal();
    const cmd = `возьми ${colorWord(st.color, 'm')} кубик`;
    $('#kCmd').innerHTML = `Команда: <b>«${cmd}»</b>${E.SEEN.includes(st.color) ? '' : ' <span class="tag new">цвета не было в демонстрациях</span>'}`;
    if (!st.cur) { c.fillStyle = P.bg; c.fillRect(0, 0, W, W); out(); return; }
    const sc = W / E.TW;
    drawBitmap(c, bitmap(st.cur.sc.img, E.TW, E.TW), 0, 0, W, W);
    heat(c, show01(st.cur.s.both, 4), E.G, 0, 0, W, P.e2e, 0.55);
    const p = st.cur.p; c.beginPath(); c.arc(p.x * sc, p.y * sc, 17, 0, 7); c.lineWidth = 3.2; c.strokeStyle = st.cur.ok ? P.good : P.bad; c.stroke();
    HeroKit.label(c, k, st.cur.ok ? 'берёт названный кубик' : 'берёт не тот предмет', p.x * sc, p.y * sc - 28, { px: 11.5, weight: 700, color: st.cur.ok ? P.good : P.bad });
    drawMap('#kWhere', st.cur.s.where, P.cl); drawMap('#kWhat', st.cur.s.what, P.hy); drawMap('#kBoth', st.cur.s.both, P.e2e);
    out();
  }
  const MODE = { none: 'без слов', robot: 'слова из демонстраций', cliport: 'CLIPort' };
  function out() {
    const r = st.res;
    setOut($('#kOut'), (r ? `Последняя проверка: ${MODE[r.mode]}, «${colorWord(r.color, 'm')} кубик» — правильно в <b>${r.ok} из ${r.n}</b> сцен. ` : '') + (st.cur ? `Сцена ${st.scene}: ${st.cur.ok ? '✓' : '✗'}.` : ''));
  }
  function setMode(m) { st.mode = m; $$('#kMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === m))); preview(); if (ctl) ctl.update(); }
  function setColor(c) { st.color = c; $$('#kColor button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c))); preview(); if (ctl) ctl.update(); }
  const api = { reset() { st.res = null; st.scene = 1; $('#kScene').value = 1; syncRange($('#kScene'), '1'); setMode('none'); setColor('red'); }, state: () => ({ mode: st.mode, color: st.color, res: st.res }), run, setMode, setColor };
  const missions = [
    { short: 'Без слов', title: 'Возьми названный кубик без слов', text: 'На столе три кубика разных цветов и миска. Фильтр «где» обучен на девяти демонстрациях: оператор брал кубик, названный в команде, но саму команду фильтр не видит. Проверь его на 20 сценах с командой «возьми красный кубик».',
      onEnter: (X) => { X.setMode('none'); X.setColor('red'); },
      bet: { q: 'как часто модель без слов возьмёт красный кубик?', options: ['Почти всегда', 'Примерно в половине сцен или реже', 'Никогда'], answer: (r) => (r.rate >= 0.85 ? 0 : r.rate > 0 ? 1 : 2) },
      action: { label: 'Проверить на 20 сценах', run: (X) => X.run() },
      criteria: [{ label: 'Проверено без слов', test: (r) => r.mode === 'none' }],
      explain: (r) => `Без слов модель взяла красный кубик в ${r.ok} сценах из ${r.n}. Она хорошо знает, где кубики, — карта «где» горит на всех трёх, — но не знает, какой нужен, и берёт тот, что ярче по её фильтру. Карте нужна команда.` },
    { short: 'Слова робота', title: 'Новый цвет для модели, выучившей слова по демонстрациям', text: 'Модель «слова из демонстраций» выучила для каждого слова свой фильтр: в демонстрациях были только красный, синий и зелёный. Дай ей команду «возьми фиолетовый кубик».',
      controls: ['color'], onEnter: (X) => { X.setMode('robot'); X.setColor('purple'); },
      bet: { q: 'как часто она возьмёт фиолетовый кубик?', options: ['Почти всегда', 'Почти никогда'], answer: (r) => (r.rate >= 0.5 ? 0 : 1) },
      action: { label: 'Проверить на 20 сценах', run: (X) => X.run() },
      criteria: [{ label: 'Проверено на цвете, которого не было в демонстрациях', test: (r) => r.mode === 'robot' && !r.seen }],
      fail: () => 'Нужен цвет, которого не было в демонстрациях: фиолетовый, оранжевый или жёлтый.',
      explain: (r) => `На новом цвете модель права в ${r.ok} сценах из ${r.n}. Для слова «${colorWord(r.color, 'm')}» у неё нет фильтра: она знает только то, что видела в демонстрациях робота. Переключи цвет на красный и проверь — там она права почти всегда. Чтобы выучить новый цвет, ей нужны новые демонстрации.` },
    { short: 'CLIPort', title: 'Тот же новый цвет у CLIPort', text: 'Теперь «что» берётся из мини-CLIP: он видел фиолетовые предметы в парах «картинка — подпись», хотя робот ни разу не брал фиолетовый кубик. Проверь CLIPort на той же команде.',
      controls: ['color'], onEnter: (X) => { X.setMode('cliport'); X.setColor('purple'); },
      action: { label: 'Проверить на 20 сценах', run: (X) => X.run() },
      criteria: [{ label: 'CLIPort на цвете, которого не было в демонстрациях', test: (r) => r.mode === 'cliport' && !r.seen }, { label: 'Правильно не меньше чем в 18 сценах из 20', test: (r) => r.mode === 'cliport' && r.rate >= 0.9 }],
      explain: (r) => `CLIPort взял ${colorWord(r.color, 'm')} кубик в ${r.ok} сценах из ${r.n}. Карта «где» по-прежнему горит на всех кубиках, карта «что» — на предмете, похожем на описание, а их произведение — только на нужном кубике. Демонстрации научили модель брать кубики, слова дал CLIP. В статье CLIPort так же переносит цвета, которых не было в демонстрациях, а одна модель учит 10 задач.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй модель, цвет и сцену. Найди цвет и сцену, где CLIPort ошибается, и посмотри, какая из двух карт его подвела.', final: true, controls: ['mode', 'color', 'scene'] },
  ];
  function init() {
    const box = $('#kColor');
    E.COLORS.forEach((c) => box.append(h('button', { type: 'button', 'data-v': c.id, 'aria-pressed': String(c.id === st.color) }, h('i', { class: 'sw', style: `background:${rgbCss(c.id)}` }), c.m)));
    box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) setColor(b.dataset.v); });
    $('#kMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) setMode(b.dataset.v); });
    $('#kScene').addEventListener('input', (e) => { st.scene = +e.target.value; syncRange(e.target, String(st.scene)); preview(); });
    syncRange($('#kScene'), '1');
    ctl = mountMissions('#kMis', missions, api, { controls: { mode: '#kMode', color: '#kColor', scene: '#wrapKScene' } });
    draw(); redrawOn(draw);
    // фильтр «где» обучаем, когда раздел приближается к экрану
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); preview(); } }, { rootMargin: '400px 0px' });
    io.observe($('#cliport'));
    return ctl;
  }
  return { init, api, st, onClip: () => { if (st.mode === 'cliport') preview(); } };
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
    { q: 'CLIP обучали на размеченных классах, как классификаторы ImageNet?', o: ['Да, на тысяче классов', 'Нет: на 400 миллионах пар «картинка — подпись» из интернета, задача — угадать, какая подпись к какой картинке', 'На видео с роботов'], a: 1, e: 'Классов в обучении нет. Классы появляются потом: их описывают словами, и побеждает подпись, ближайшая к картинке. Так CLIP без обучения на ImageNet угадывает 76,2% классов.' },
    { q: 'CLIP находит только то, что видел в обучении в точности?', o: ['Да, только знакомые пары', 'Нет: подпись — сочетание слов, и знакомые признаки в новом сочетании он тоже находит', 'Только после дообучения'], a: 1, e: 'В лаборатории модель нашла фиолетовый кубик, которого не было ни в одной паре: цвет и форму она кодирует по отдельности. CLIP так описывает словами классы, которых не было в его обучении.' },
    { q: 'Transporter выдаёт координаты предмета числами?', o: ['Да, как политики части 1', 'Нет: он оценивает каждый пиксель вида сверху и берёт там, где карта ярче', 'Он выдаёт углы суставов'], a: 1, e: 'Действие уже лежит в картинке: каждый пиксель вида сверху — место на столе. Сеть оценивает все пиксели сразу, и робот берёт в самом ярком.' },
    { q: 'Почему карте хватило одной демонстрации?', o: ['Сеть очень большая', 'Её фильтр одинаков во всех клетках: сдвинули кубик — сдвинулся и пик карты', 'Демонстрация была длинной'], a: 1, e: 'Это эквивариантность сдвига. Регрессии же нужно выучить, как каждое положение кубика превращается в числа, и ей мало даже двадцати демонстраций.' },
    { q: 'Если на столе два одинаковых кубика, карта усредняет их, как регрессия?', o: ['Да', 'Нет: у карты два пика, и робот берёт один из них', 'Карта ничего не покажет'], a: 1, e: 'Карта — распределение по местам, у него может быть несколько мод. Регрессия выдаёт одно среднее, и с двумя кубиками это пустое место между ними.' },
    { q: 'Как Transporter находит поворот при укладке?', o: ['Регрессией угла', 'Поворачивает вырезку на 36 углов через 10° и строит карту для каждого', 'Перебирает позы в симуляторе'], a: 1, e: 'Поворот становится ещё одной осью карты: H × W × 36. Поворот гнезда превращается в сдвиг пика по этой оси, и обучать сеть заново не нужно.' },
    { q: 'CLIPort понимает цвет, которого не было в демонстрациях робота?', o: ['Нет, только цвета из демонстраций', 'Да: слова дают признаки CLIP, обученного на парах из интернета', 'Только если добавить демонстрации с этим цветом'], a: 1, e: 'Демонстрации учат брать и класть, а «что» берётся из CLIP. В статье робота учат на одних цветах и проверяют на других; модель, которая учит слова только по демонстрациям, на новых словах ошибается.' },
    { q: 'Карта по пикселям стола подходит для любой задачи робота?', o: ['Да', 'Нет: она задаёт место на плоскости и поворот вокруг вертикали; для высоты и наклонов нужны 3D-представления', 'Только для мобильных роботов'], a: 1, e: 'Открыть ящик или поставить чашку на полку — задачи в объёме. Их решает PerAct (политика с 3D-сеткой, 2022; урок 2.2): следующую позу он ищет среди вокселей.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('clip', () => { mis.clip = LabClip.init(); }); safe('pick', () => { mis.pick = LabPick.init(); });
    safe('place', () => { mis.place = LabPlace.init(); }); safe('cliport', () => { mis.cliport = LabCliport.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['clip', 'pick', 'place', 'cliport'].reduce((s, k) => s + (mis[k] ? $$('#' + { clip: 'c', pick: 'p', place: 't', cliport: 'k' }[k] + 'Mis .g-steps li').length - 1 : 0), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l21 = { mis, SPEED, Store, LabClip, LabPick, LabPlace, LabCliport, L21 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* =====================================================================
   Схема 'contrast' (раздел 1): контрастное обучение на пакете из четырёх пар
   «картинка — подпись». Векторы — стрелки на плоскости (у CLIP в векторе сотни
   чисел): точка — конец стрелки картинки, кольцо — конец стрелки подписи.
   Матрица 4 × 4 — сходство (косинус угла) каждой подписи с каждой картинкой.
   Шаги обучения поворачивают стрелки: сходство верных пар (диагональ) растёт,
   неверных — падает. Путь стрелок посчитан градиентным спуском по той же
   симметричной контрастной цели, что у мини-CLIP, только векторы двигаются
   напрямую, без сетей. Рисует shared/anim.js; без него схемы нет, а остальной
   урок работает.
   ===================================================================== */
(() => {
  if (typeof Anim === 'undefined') {                       // shared/anim.js не подключён: пустую рамку схемы не показываем
    document.querySelectorAll('canvas[data-anim=contrast]').forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, E = L21, TAU = Math.PI * 2;
  const ITEMS = [['red', 'cube'], ['blue', 'ball'], ['green', 'bowl'], ['yellow', 'can']], N = ITEMS.length;
  const GOOD = { r: 0, c: 0 }, BAD = { r: 1, c: 2 };       // клетки [подпись, картинка]: верная пара и подпись «синий мяч» с картинкой зелёной миски
  /* путь стрелок: углы картинок u и подписей v по шагам спуска, от случайного начала до обученного состояния */
  const PATH = (() => {
    const tau = 0.25, lr = 0.004, steps = 3000, rad = Math.PI / 180, out = [];
    // начало подобрано так, чтобы сходство верной пары «красный кубик» только росло, а у подписи «синий мяч» с картинкой
    // зелёной миски только падало; до обучения ни одна подпись не ближе всего к своей картинке
    const u = [240, 40, 140, 340].map((d) => d * rad), v = [5, 115, 80, 210].map((d) => d * rad);
    for (let s = 0; s <= steps; s++) {
      if (s % 10 === 0) out.push({ u: u.slice(), v: v.slice() });
      const L = u.map((a) => v.map((b) => Math.cos(a - b) / tau)), G = u.map(() => new Array(N).fill(0));
      for (let i = 0; i < N; i++) { const mx = Math.max(...L[i]); let z = 0; for (let j = 0; j < N; j++) z += Math.exp(L[i][j] - mx); for (let j = 0; j < N; j++) G[i][j] += (Math.exp(L[i][j] - mx) / z - (i === j ? 1 : 0)) / (2 * N); }
      for (let j = 0; j < N; j++) { let mx = -1e9; for (let i = 0; i < N; i++) mx = Math.max(mx, L[i][j]); let z = 0; for (let i = 0; i < N; i++) z += Math.exp(L[i][j] - mx); for (let i = 0; i < N; i++) G[i][j] += (Math.exp(L[i][j] - mx) / z - (i === j ? 1 : 0)) / (2 * N); }
      const gu = new Array(N).fill(0), gv = new Array(N).fill(0);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const d = -Math.sin(u[i] - v[j]) / tau * G[i][j]; gu[i] += d; gv[j] -= d; }
      for (let i = 0; i < N; i++) { u[i] -= lr * gu[i]; v[i] -= lr * gv[i]; }
    }
    // длина пути от начала: по ней движение идёт с ровной скоростью
    const len = [0]; for (let i = 1; i < out.length; i++) { let d = 0; for (let j = 0; j < N; j++) d += Math.abs(out[i].u[j] - out[i - 1].u[j]) + Math.abs(out[i].v[j] - out[i - 1].v[j]); len.push(len[i - 1] + d); }
    const total = len[len.length - 1];
    return (p) => {
      const d = Math.max(0, Math.min(1, p)) * total; let i = 1; while (i < len.length - 1 && len[i] < d) i++;
      const f = len[i] > len[i - 1] ? (d - len[i - 1]) / (len[i] - len[i - 1]) : 0, a = out[i - 1], b = out[i];
      return { u: a.u.map((x, j) => x + (b.u[j] - x) * f), v: a.v.map((x, j) => x + (b.v[j] - x) * f) };
    };
  })();
  const T = 16, PH = { batch: [0.1, 1.0], enc: [1.1, 2.3], sim: [2.3, 3.3], train: [3.6, 10.6], fade: [14.9, 15.8] };
  let icons = null;                                        // картинки предметов, как в лаборатории: 16 × 16 пикселей
  const icon = (i) => { if (!icons) { const r = E.rng(41); icons = ITEMS.map(([c, s]) => bitmap(E.icon(c, s, r), E.IS, E.IS)); } return icons[i]; };
  const fmt1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace('-', '−');
  /** Подпись ужимается до ширины maxW; массив — несколько строк с общим размером, y — середина блока. */
  function fit(c, k, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * 1.28, y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => K.label(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
  }
  function iconAt(c, P, A, i, x, y, sz) {
    A.rect(c, x - sz / 2 - 2, y - sz / 2 - 2, sz + 4, sz + 4, 5, P.surf, P.grid, 1);
    c.imageSmoothingEnabled = false; c.drawImage(icon(i), x - sz / 2, y - sz / 2, sz, sz); c.imageSmoothingEnabled = true;
  }
  function flowDots(c, A, x1, y1, x2, y2, prog, col) {
    if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < 3; i++) { const f = (prog * 1.6 + i / 3) % 1; A.circle(c, A.lerp(x1, x2, f), A.lerp(y1, y2, f), 2.6, col); }
  }
  /** Дуга угла между направлениями a и b (математические углы, против часовой) — по короткой стороне.
   *  dir > 0 — наконечники от концов к середине (векторы сближают), dir < 0 — от середины наружу (разводят). */
  function angArc(c, A, cx, cy, r, a, b, col, dir) {
    let d = ((b - a) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
    const at = (f) => [cx + r * Math.cos(a + d * f), cy - r * Math.sin(a + d * f)], pts = [];
    for (let i = 0; i <= 24; i++) pts.push(at(i / 24));
    A.line(c, pts, col, 2.4);
    if (!dir || r * Math.abs(d) < 30) return;                // короткой дуге наконечники не нужны
    const f = Math.min(0.3, 11 / (r * Math.abs(d)));
    for (const [e, inner] of [[0, f], [1, 1 - f]]) { const [x0, y0] = at(e), [x1, y1] = at(inner); if (dir > 0) A.arrow(c, x0, y0, x1, y1, col, 2.4, 7); else A.arrow(c, x1, y1, x0, y0, col, 2.4, 7); }
  }
  function draw(c, k, t, P, A, G) {
    const { seg, ease } = A, u = ((t % T) + T) % T;
    const pB = seg(u, ...PH.batch), pE = seg(u, ...PH.enc), pS = seg(u, ...PH.sim), pT = seg(u, ...PH.train);
    const fade = 1 - seg(u, ...PH.fade), ang = PATH(ease(pT));
    const col = ITEMS.map(([cc]) => rgbCss(cc)), cap = ITEMS.map(([cc, ss]) => E.phrase(cc, ss));
    const sim = (r, cc) => Math.cos(ang.u[cc] - ang.v[r]);    // подпись r, картинка cc
    const nm = (x) => `«${x}»`;
    c.globalAlpha = fade;
    // ---------- пакет ----------
    const B = G.batch;
    fit(c, k, 'Пакет из 4 пар', B.title[0], B.title[1], B.maxW, { px: 12.5, weight: 750, color: P.ink, align: 'left' });
    fit(c, k, 'у CLIP — 32 768 пар за шаг', B.sub[0], B.sub[1], B.maxW, { px: 10.5, color: P.ink3, align: 'left' });
    ITEMS.forEach((_, i) => {
      const [x, y] = B.rows[i], a = seg(pB, i * 0.18, i * 0.18 + 0.45);
      if (a <= 0) return;
      c.globalAlpha = fade * a;
      iconAt(c, P, A, i, x, y, B.icon);
      fit(c, k, cap[i], x + B.icon / 2 + 8, y, B.capW, { px: 11, weight: 650, color: P.ink, align: 'left' });
      c.globalAlpha = fade;
    });
    // ---------- стрелка: две сети дают векторы ----------
    const [ax1, ay1, ax2, ay2] = G.a1, training = u >= PH.train[0] && u < PH.train[1];
    A.arrow(c, ax1, ay1, ax2, ay2, pE > 0 ? P.ink2 : P.line, 1.6, 7);
    flowDots(c, A, ax1, ay1, ax2, ay2, training ? (u * 0.9) % 1 : pE, P.mot);
    fit(c, k, G.a1Lab.text, G.a1Lab.x, G.a1Lab.y, G.a1Lab.w, { px: 10, weight: 650, color: P.ink2, align: G.a1Lab.align || 'center' });
    // ---------- векторы ----------
    const V = G.vec, R = V.R;
    fit(c, k, 'Векторы', V.title[0], V.title[1], V.titleW, { px: 12.5, weight: 750, color: P.ink, align: V.title[2] });
    fit(c, k, 'стрелки на плоскости', V.sub[0], V.sub[1], V.titleW, { px: 10.5, color: P.ink3, align: V.sub[2] });
    A.circle(c, V.cx, V.cy, R, P.surf, P.grid, 1);
    A.line(c, [[V.cx - R, V.cy], [V.cx + R, V.cy]], P.grid, 1); A.line(c, [[V.cx, V.cy - R], [V.cx, V.cy + R]], P.grid, 1);
    if (pE > 0) {
      const gr = (i) => ease(seg(pE, i * 0.12, i * 0.12 + 0.55)), tip = (a, g) => [V.cx + Math.cos(a) * R * 0.86 * g, V.cy - Math.sin(a) * R * 0.86 * g];
      if (pE >= 1) {                                       // углы двух выделенных пар
        angArc(c, A, V.cx, V.cy, R * 0.42, ang.u[GOOD.c], ang.v[GOOD.r], P.good, training ? 1 : 0);
        angArc(c, A, V.cx, V.cy, R * 0.66, ang.u[BAD.c], ang.v[BAD.r], P.bad, training ? -1 : 0);
      }
      for (let i = 0; i < N; i++) { const g = gr(i); if (g <= 0) continue; const [x, y] = tip(ang.v[i], g); A.line(c, [[V.cx, V.cy], [x, y]], col[i], 1.8, [4, 3]); A.circle(c, x, y, 6.5, P.surf, col[i], 2.2); }
      for (let i = 0; i < N; i++) { const g = gr(i); if (g <= 0) continue; const [x, y] = tip(ang.u[i], g); A.line(c, [[V.cx, V.cy], [x, y]], col[i], 2.6); A.circle(c, x, y, 4, col[i]); }
      A.circle(c, V.cx, V.cy, 2.6, P.ink2);
    }
    // легенда: точка — картинка, кольцо — подпись
    { const [lx, ly] = V.legend, gap = V.legendGap;
      A.line(c, [[lx, ly], [lx + 18, ly]], P.ink2, 2.4); A.circle(c, lx + 20, ly, 3.6, P.ink2);
      fit(c, k, 'картинка', lx + 30, ly, gap - 36, { px: 10.5, color: P.ink2, align: 'left' });
      A.line(c, [[lx + gap, ly], [lx + gap + 16, ly]], P.ink2, 1.6, [4, 3]); A.circle(c, lx + gap + 21, ly, 5, P.surf, P.ink2, 1.8);
      fit(c, k, 'подпись', lx + gap + 32, ly, 80, { px: 10.5, color: P.ink2, align: 'left' }); }
    // ---------- стрелка: сходство всех пар ----------
    const [bx1, by1, bx2, by2] = G.a2;
    A.arrow(c, bx1, by1, bx2, by2, pS > 0 ? P.ink2 : P.line, 1.6, 7);
    flowDots(c, A, bx1, by1, bx2, by2, training ? (u * 0.9 + 0.5) % 1 : pS, P.mot);
    fit(c, k, G.a2Lab.text, G.a2Lab.x, G.a2Lab.y, G.a2Lab.w, { px: 10, weight: 650, color: P.ink2, align: G.a2Lab.align || 'center' });
    // ---------- матрица сходства ----------
    const M = G.mat, s = M.s;
    fit(c, k, 'Матрица сходства', M.title[0], M.title[1], M.titleW, { px: 12.5, weight: 750, color: P.ink, align: M.title[2] });
    fit(c, k, 'строки — подписи, столбцы — картинки', M.sub[0], M.sub[1], M.titleW, { px: 10.5, color: P.ink3, align: M.sub[2] });
    for (let j = 0; j < N; j++) iconAt(c, P, A, j, M.x0 + (j + 0.5) * s, M.headY, M.icon);
    for (let r = 0; r < N; r++) fit(c, k, cap[r], M.x0 - 8, M.y0 + (r + 0.5) * s, M.labW, { px: 10, weight: 650, color: P.ink2, align: 'right' });
    for (let r = 0; r < N; r++) for (let cc = 0; cc < N; cc++) {
      const x = M.x0 + cc * s, y = M.y0 + r * s;
      A.rect(c, x + 2, y + 2, s - 4, s - 4, 4, P.surf, P.grid, 1);
      if (pS <= 0) continue;
      const v = sim(r, cc), a = Math.max(0, Math.min(1, (v + 0.2) / 1.2)), on = seg(pS, (r * N + cc) / 22, (r * N + cc) / 22 + 0.3);
      c.globalAlpha = fade * on * (0.08 + 0.9 * a); A.rect(c, x + 2, y + 2, s - 4, s - 4, 4, P.mot, null); c.globalAlpha = fade * on;
      fit(c, k, fmt1(v), x + s / 2, y + s / 2, s - 6, { px: 10, weight: 700, mono: true, color: a > 0.62 ? '#fff' : P.ink2 });
      c.globalAlpha = fade;
    }
    for (let r = 0; r < N; r++) { const x = M.x0 + r * s, y = M.y0 + r * s; A.rect(c, x + 1, y + 1, s - 2, s - 2, 5, null, P.ink, 1.4); }
    if (pS >= 1) {
      for (const [h, cl] of [[GOOD, P.good], [BAD, P.bad]]) A.rect(c, M.x0 + h.c * s, M.y0 + h.r * s, s, s, 6, null, cl, 2.6);
    }
    fit(c, k, G.note.text, G.note.x, G.note.y, G.note.w, { px: 10, color: P.ink3, align: G.note.align || 'center' });
    // ---------- что происходит ----------
    const st = u < PH.enc[0] ? ['Пакет — пары, которые берут', 'за один шаг обучения']
      : u < PH.train[0] ? ['До обучения: стрелки смотрят', 'куда попало, сходство случайное']
      : u < PH.train[1] ? ['Обучение: векторы верных пар сближают,', 'векторы неверных — разводят']
      : ['После обучения: каждая подпись', 'ближе всего к своей картинке'];
    fit(c, k, st, G.state.x, G.state.y, G.state.w, { px: 11.5, weight: 700, color: P.ink, align: 'left' });
    // полоса шагов обучения
    const Bar = G.bar;
    fit(c, k, 'шаги обучения', Bar.x, Bar.y, Bar.labW, { px: 10, color: P.ink3, align: 'left' });
    A.rect(c, Bar.x + Bar.labW + 6, Bar.y - 4, Bar.w, 8, 4, P.surf2, P.grid, 1);
    if (pT > 0) A.rect(c, Bar.x + Bar.labW + 6, Bar.y - 4, Math.max(8, Bar.w * pT), 8, 4, P.mot, null);
    // две выделенные пары: угол и сходство сейчас
    if (pS > 0) {
      const H = G.hl, arrowOf = (d) => (pT <= 0 ? '' : d > 0 ? ' ↑' : ' ↓'), lh = 10.5 * k * 1.28;
      let y = H.y0;
      [[P.good, `верная пара ${nm(cap[GOOD.r])}: сходство ${fmt1(sim(GOOD.r, GOOD.c))}${arrowOf(1)}`, null],
       [P.bad, `подпись ${nm(cap[BAD.r])} и картинка`, `${nm(cap[BAD.c])}: ${fmt1(sim(BAD.r, BAD.c))}${arrowOf(-1)}`]].forEach(([cl, a, b]) => {
        const lines = b == null ? [a] : H.two ? [a, b] : [a + ' ' + b];
        A.line(c, [[H.x, y], [H.x + 16, y]], cl, 2.6);
        fit(c, k, lines, H.x + 24, y + (lines.length - 1) * lh / 2, H.w - 24, { px: 10.5, weight: 650, color: P.ink, align: 'left' });
        y += H.dy + (lines.length - 1) * lh;
      });
    }
    c.globalAlpha = 1;
  }
  Anim.add('contrast', {
    W: 720, H: 344, start: 6.5, narrowAt: 680,
    draw(c, k, t, P, A) {
      draw(c, k, t, P, A, {
        batch: { title: [14, 18], sub: [14, 35], maxW: 160, rows: [[30, 70], [30, 114], [30, 158], [30, 202]], icon: 26, capW: 96 },
        a1: [150, 136, 214, 136], a1Lab: { text: ['две сети', 'дают векторы'], x: 185, y: 112, w: 76 },
        vec: { cx: 312, cy: 142, R: 88, title: [312, 18, 'center'], sub: [312, 35, 'center'], titleW: 170, legend: [228, 252], legendGap: 98 },
        a2: [408, 142, 470, 142], a2Lab: { text: ['сходство', 'всех пар'], x: 439, y: 118, w: 60 },
        mat: { x0: 568, y0: 84, s: 34, headY: 64, icon: 20, labW: 84, title: [592, 18, 'center'], sub: [592, 35, 'center'], titleW: 224 },
        note: { text: ['диагональ — 4 верные пары,', '12 клеток вне её — неверные'], x: 636, y: 244, w: 200 },
        state: { x: 14, y: 284, w: 290 },
        bar: { x: 14, y: 320, labW: 90, w: 186 },
        hl: { x: 316, y0: 284, dy: 26, w: 392 },
      });
    },
    narrow: {
      W: 360, H: 884,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          batch: { title: [14, 16], sub: [14, 33], maxW: 330, rows: [[30, 64], [196, 64], [30, 104], [196, 104]], icon: 26, capW: 120 },
          a1: [180, 128, 180, 162], a1Lab: { text: 'две сети дают векторы', x: 192, y: 145, w: 160, align: 'left' },
          vec: { cx: 180, cy: 290, R: 92, title: [14, 180, 'left'], sub: [14, 197, 'left'], titleW: 150, legend: [88, 410], legendGap: 104 },
          a2: [180, 424, 180, 456], a2Lab: { text: 'сходство всех пар', x: 192, y: 440, w: 160, align: 'left' },
          mat: { x0: 178, y0: 534, s: 42, headY: 512, icon: 24, labW: 150, title: [14, 474, 'left'], sub: [14, 491, 'left'], titleW: 330 },
          note: { text: ['диагональ — 4 верные пары,', '12 клеток вне её — неверные'], x: 14, y: 726, w: 332, align: 'left' },
          state: { x: 14, y: 770, w: 332 },
          bar: { x: 14, y: 806, labW: 100, w: 220 },
          hl: { x: 14, y0: 832, dy: 26, w: 332, two: true },
        });
      },
    },
  });
})();
