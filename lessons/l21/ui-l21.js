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
    { short: 'Угол', title: 'Найди поворот, при котором деталь войдёт в гнездо', text: 'Синяя деталь показывает вырезку: кусок карты признаков вокруг точки, где робот взял деталь. В интерактиве в вырезку попадает только сама деталь, без окружения. Вырезку поворачивают на выбранный угол и прикладывают к каждой клетке сцены, а карта показывает, насколько хорошо она там совпадает с гнездом. Синяя деталь стоит в клетке, где совпадение лучше всего. Крути поворот, пока деталь не встанет в прорезь целиком.',
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
  const SER = [['T', 'Transporter', '--e2e'], ['GT', 'GT-State MLP: на входе точные позы предметов', '--classic'], ['CM', 'Conv. MLP: на входе вид стола сверху', '--ink-3']];
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
  const MS = 240;                                          // логический размер карт «Где», «Что», «Итог»
  /** Контуры предметов стола поверх карты: видно, какой предмет светится. Цвет контура — цвет предмета. */
  function outlines(c, objs, s, P, k) {
    for (const q of objs) {
      const x = q.x * s, y = q.y * s, r = E.RT * s;
      c.beginPath();
      if (q.shape === 'cube') { const hh = r * 0.8; c.rect(x - hh, y - hh, 2 * hh, 2 * hh); }
      else if (q.shape === 'bowl') { c.arc(x, y, r, 0, 7); c.moveTo(x + r * 0.55, y); c.arc(x, y, r * 0.55, 0, 7); }
      else if (q.shape === 'ball') c.arc(x, y, r * 0.9, 0, 7);
      else c.rect(x - r * 0.5, y - r, r, 2 * r);
      c.lineJoin = 'round'; c.globalAlpha = 0.75; c.lineWidth = 3.2 * k; c.strokeStyle = P.bg; c.stroke();
      c.globalAlpha = 0.8; c.lineWidth = 1.5 * k; c.strokeStyle = rgbCss(q.color); c.stroke(); c.globalAlpha = 1;
    }
  }
  /** Карта лаборатории 3: оценки цветом col, сетка клеток, контуры предметов; на итоговой — кольцо выбранной клетки. */
  function drawKMap(sel, vals, col, empty, ring) {
    const cv = $(sel), { c, k } = HeroKit.fit(cv, MS, MS), P = pal(), s = MS / E.TW;
    c.fillStyle = P.bg; c.fillRect(0, 0, MS, MS);
    if (vals) heat(c, peaks01(vals, 1.5), E.G, 0, 0, MS, col, 0.95);
    c.strokeStyle = P.grid; c.lineWidth = 0.7 * k; c.beginPath();
    for (let i = 1; i < E.G; i++) { const v = i * MS / E.G; c.moveTo(v, 0); c.lineTo(v, MS); c.moveTo(0, v); c.lineTo(MS, v); }
    c.stroke();
    if (st.cur) outlines(c, st.cur.sc.objs, s, P, k);
    if (!vals && empty) {                                  // карты нет: надпись на плашке поверх сетки и контуров
      HeroKit.font(c, k, 12.5, 700); const tw = Math.max(...empty.map((t) => c.measureText(t).width)) + 20 * k, th = (empty.length * 17 + 12) * k;
      c.beginPath(); c.roundRect(MS / 2 - tw / 2, MS / 2 - th / 2, tw, th, 8 * k); c.fillStyle = P.surf; c.fill(); c.lineWidth = k; c.strokeStyle = P.line; c.stroke();
      empty.forEach((t, i) => HeroKit.label(c, k, t, MS / 2, MS / 2 + (i - (empty.length - 1) / 2) * 17 * k, { px: 12.5, weight: i ? 600 : 700, color: P.ink2, halo: false }));
    }
    if (ring) { const p = st.cur.p; c.beginPath(); c.arc(p.x * s, p.y * s, 6.6 * s, 0, 7); c.lineWidth = 2.8 * k; c.strokeStyle = st.cur.ok ? P.good : P.bad; c.stroke(); }
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#kCv'), W, W), P = pal();
    const cmd = `возьми ${colorWord(st.color, 'm')} кубик`;
    $('#kCmd').innerHTML = `Команда: <b>«${cmd}»</b>${E.SEEN.includes(st.color) ? '' : ' <span class="tag new">цвета не было в демонстрациях</span>'}`;
    $('#kMaps').classList.toggle('k-nofuse', st.mode !== 'cliport');
    if (!st.cur) { c.fillStyle = P.bg; c.fillRect(0, 0, W, W); out(); return; }
    const sc = W / E.TW;
    drawBitmap(c, bitmap(st.cur.sc.img, E.TW, E.TW), 0, 0, W, W);
    const p = st.cur.p; c.beginPath(); c.arc(p.x * sc, p.y * sc, 6.6 * sc, 0, 7); c.lineWidth = 3 * k; c.strokeStyle = st.cur.ok ? P.good : P.bad; c.stroke();
    const okTxt = st.cur.ok ? 'берёт названный кубик' : 'берёт не тот предмет', pk = $('#kPick');
    setOut(pk, `${st.cur.ok ? '✓' : '✗'} Сцена ${st.scene}: модель ${okTxt}`); pk.classList.toggle('ok', st.cur.ok); pk.classList.toggle('no', !st.cur.ok);
    const noWhat = st.mode === 'none' ? ['карты нет:', 'модель не видит команду'] : ['карты нет:', 'у слова свой фильтр'];
    drawKMap('#kWhere', st.cur.s.where, P.cl); drawKMap('#kWhat', st.cur.s.what, P.hy, noWhat); drawKMap('#kBoth', st.cur.s.both, P.e2e, null, true);
    out();
  }
  const MODE = { none: 'без слов', robot: 'слова из демонстраций', cliport: 'CLIPort' };
  function out() {
    const r = st.res;
    setOut($('#kOut'), r ? `Последняя проверка: ${MODE[r.mode]}, «${colorWord(r.color, 'm')} кубик» — правильно в <b>${r.ok} из ${r.n}</b> сцен. ` : '');
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

/* =====================================================================
   Схемы устройства моделей (shared/anim.js), по образцу 'contrast':
     clip-arch   (раздел 1) — CLIP: картинка → патчи → энкодер картинок → вектор;
                 подпись → токены → энкодер текста → вектор той же длины; оба вектора
                 приводят к длине 1, перемножают числа на одних местах и складывают
                 (косинус); без дообучения картинку сравнивают с тремя подписями;
     transporter (раздел 2) — взятие: вид сверху RGB-D → полносвёрточная сеть → карта
                 «где взять»; укладка: вырезка ψ на 36 поворотах прикладывается к
                 признакам сцены φ → карта «куда положить» для каждого угла → лучшие
                 место и поворот; карты укладки считаются здесь же взаимной корреляцией
                 признаков, заданных вручную, как в интерактиве раздела 2;
     cliport     (раздел 3) — два потока: семантический (замороженный CLIP; вектор
                 команды умножают на признаки декодера на трёх уровнях) и
                 пространственный (сеть Transporter по RGB-D), боковые связи, сложение →
                 карта «где взять»; тем же способом по вырезке и сцене — «куда положить».
   Цвета по соглашению anim.js: оранжевый — то, что считается сейчас; синий —
   измеренное и выход; серый — неподвижное. В схеме CLIPort фиолетовый —
   семантический поток («что»), синий — пространственный («где»), как карты
   лаборатории 3. Без shared/anim.js схем нет, а остальной урок работает.
   ===================================================================== */
(() => {
  const KINDS = ['clip-arch', 'transporter', 'cliport'];
  if (typeof Anim === 'undefined') {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, E = L21, TAU = Math.PI * 2;
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const fx2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−');
  const nm = (x) => `«${x}»`;
  /** Фраза — в строки не шире maxW; неразрывный пробел (\u00a0) не даёт разорвать слова. */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const ws = text.split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись, ужатая до ширины maxW; массив — несколько строк с общим размером, y — середина блока;
   *  o.wrap — сначала перенести строку по словам. */
  function txt(c, k, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * (o.lh || 1.28), y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => K.label(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
  }
  /** Блок сети: скруглённый прямоугольник с названием и строкой пояснения; on — блок сейчас считает. */
  function box(c, k, A, P, b, title, sub, on, col) {
    const [x, y, w, h] = b, cc = col || P.mot;
    A.rect(c, x, y, w, h, 9, on ? A.alpha(cc, 0.12) : P.surf, on ? cc : P.line, on ? 1.8 : 1.2);
    K.font(c, k, 11, 750);                                   // чуть шире блока — ужать, заметно шире — перенести
    const lines = Array.isArray(title) ? title : c.measureText(title).width > (w - 10) * 1.12 ? wrap(c, k, title, w - 10, 11, 750) : [title];
    const n = lines.length + (sub ? 1 : 0), lh = 13 * k, y0 = y + h / 2 - (n - 1) * lh / 2;
    lines.forEach((t, i) => txt(c, k, t, x + w / 2, y0 + i * lh, w - 10, { px: 11, weight: 750, color: P.ink }));
    if (sub) txt(c, k, sub, x + w / 2, y0 + lines.length * lh, w - 10, { px: 10, weight: 600, color: P.ink3 });
  }
  /** Точки бегут по стрелке, пока prog между 0 и 1. */
  function flowDots(c, A, x1, y1, x2, y2, prog, col) {
    if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < 3; i++) { const f = (prog * 1.6 + i / 3) % 1; A.circle(c, A.lerp(x1, x2, f), A.lerp(y1, y2, f), 2.6, col); }
  }
  /** Плашка-слово: скруглённая рамка с текстом. */
  function chip(c, k, A, P, text, cx, cy, w, h, col, a) {
    if (a <= 0) return;
    const ga = c.globalAlpha; c.globalAlpha = ga * a;
    A.rect(c, cx - w / 2, cy - h / 2, w, h, h / 2.4, A.alpha(col, 0.12), col, 1.3);
    txt(c, k, text, cx, cy, w - 8, { px: 10.5, weight: 650, color: P.ink });
    c.globalAlpha = ga;
  }
  let icons = null;
  const icon = (color, shape) => { icons = icons || {}; const key = color + shape; if (!icons[key]) icons[key] = bitmap(E.icon(color, shape, E.rng(41)), E.IS, E.IS); return icons[key]; };

  /* ---------- clip-arch: как CLIP превращает картинку и подпись в векторы и сравнивает их ---------- */
  (() => {
    const T = 15, PH = { img: [0.3, 2.3], txt: [2.4, 4.4], norm: [4.6, 5.4], cos: [5.6, 7.6], z2: [8.0, 9.6], z3: [9.6, 11.2], win: [11.4, 12.2], fade: [14.2, 15] };
    // векторы по 8 чисел (у CLIP их сотни), числа условные: картинка красного кубика и три подписи
    const U = [0.85, -0.5, 0.62, 0.3, -0.72, 0.42, 0.12, -0.38];
    const V = [[0.85, -0.06, 0.38, 0.53, -0.52, -0.01, 0.32, -0.19], [-0.18, 0.35, 0.71, -0.4, -0.36, 0.38, 0.5, 0.29], [0.26, 0.48, -0.38, 0.47, 0.29, -0.23, 0.54, -0.48]];
    const CAPS = [['red', 'cube'], ['blue', 'ball'], ['green', 'bowl']];
    const len = (v) => Math.hypot(...v), unit = (v) => v.map((x) => x / len(v));
    const Un = unit(U), Vn = V.map(unit), COS = Vn.map((v) => v.reduce((s, x, i) => s + x * Un[i], 0));
    const words = (j) => { const [cc, ss] = CAPS[j], col = E.COLORS[E.CI[cc]], sh = E.SHAPES[E.SI[ss]]; return [sh.g === 'f' ? col.f : col.m, sh.name]; };
    /** Вектор — полоса из 8 клеток, в каждой столбик от середины: вверх — плюс, вниз — минус. */
    function strip(c, A, P, S, vals, col, grow, hi) {
      const [x0, y0, cw, ch] = S, mid = y0 + ch / 2, sc = (ch / 2 - 2) / 0.85;
      for (let i = 0; i < 8; i++) {
        const x = x0 + i * cw;
        A.rect(c, x + 1, y0, cw - 2, ch, 3, P.surf, hi === i ? P.ink : P.grid, hi === i ? 1.6 : 1);
        const g = vals ? Math.max(0, Math.min(1, grow * 8 - i)) : 0;
        if (g > 0) { const v = vals[i] * sc * g; c.fillStyle = col; c.fillRect(x + cw * 0.24, Math.min(mid, mid - v), cw * 0.52, Math.abs(v)); }
        A.line(c, [[x + 3, mid], [x + cw - 3, mid]], P.grid, 1);
      }
    }
    function draw(c, k, t, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t % T) + T) % T;
      const pI = seg(u, ...PH.img), pT = seg(u, ...PH.txt), pN = ease(seg(u, ...PH.norm)), pC = seg(u, ...PH.cos), p2 = seg(u, ...PH.z2), p3 = seg(u, ...PH.z3), pW = seg(u, ...PH.win);
      const fade = 1 - seg(u, ...PH.fade);
      c.globalAlpha = fade;
      const cur = p3 > 0 ? 2 : p2 > 0 ? 1 : 0, pz = cur === 2 ? p3 : cur === 1 ? p2 : pT;     // какая подпись сейчас идёт через энкодер текста
      // ---------- ряд картинки ----------
      const [ix, iy, isz] = G.img, aImg = seg(pI, 0, 0.15);
      if (aImg > 0) {
        c.globalAlpha = fade * aImg;
        A.rect(c, ix - isz / 2 - 2, iy - isz / 2 - 2, isz + 4, isz + 4, 5, P.surf, P.grid, 1);
        c.imageSmoothingEnabled = false; c.drawImage(icon('red', 'cube'), ix - isz / 2, iy - isz / 2, isz, isz); c.imageSmoothingEnabled = true;
        const cut = seg(pI, 0.12, 0.3);                                   // сетка патчей на картинке
        for (let i = 1; i < 4; i++) { A.line(c, [[ix - isz / 2 + i * isz / 4, iy - isz / 2], [ix - isz / 2 + i * isz / 4, iy + isz / 2]], A.alpha(P.out, 0.85 * cut), 1.3); A.line(c, [[ix - isz / 2, iy - isz / 2 + i * isz / 4], [ix + isz / 2, iy - isz / 2 + i * isz / 4]], A.alpha(P.out, 0.85 * cut), 1.3); }
        c.globalAlpha = fade;
        txt(c, k, G.imgLab[2], G.imgLab[0], G.imgLab[1], G.labW, { px: 10.5, color: P.ink2 });
      }
      A.arrow(c, ...G.a1, pI > 0.2 ? P.ink2 : P.line, 1.5, 6);
      // патчи: кусочки картинки 4 × 4 разлетаются в сетку с промежутками
      const [px, py, ps, pg] = G.pat, fly = ease(seg(pI, 0.2, 0.45)), bmp = icon('red', 'cube');
      if (fly > 0) {
        const tot = 4 * ps + 3 * pg;
        for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
          const sx = ix - isz / 2 + q * isz / 4, sy = iy - isz / 2 + r * isz / 4, tx = px - tot / 2 + q * (ps + pg), ty = py - tot / 2 + r * (ps + pg);
          const x = lerp(sx, tx, fly), y = lerp(sy, ty, fly), s2 = lerp(isz / 4, ps, fly);
          c.imageSmoothingEnabled = false; c.drawImage(bmp, q * 4, r * 4, 4, 4, x, y, s2, s2); c.imageSmoothingEnabled = true;
          c.strokeStyle = A.alpha(P.out, 0.9); c.lineWidth = 1.2; c.strokeRect(x, y, s2, s2);
        }
        txt(c, k, G.patLab[2], G.patLab[0], G.patLab[1], G.labW, { px: 10.5, color: P.ink2 });
      }
      A.arrow(c, ...G.a2, pI > 0.45 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a2, seg(pI, 0.45, 0.75), P.mot);
      box(c, k, A, P, G.enc1, 'энкодер картинок', 'ResNet или ViT', pI > 0.45 && pI < 1);
      A.arrow(c, ...G.a3, pI > 0.75 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a3, seg(pI, 0.72, 0.98), P.mot);
      // ---------- ряд подписи ----------
      const [cx, cy, cw, chh] = G.cap, aCap = seg(pT, 0, 0.15), w2 = words(cur);
      if (aCap > 0) {
        const swap = cur > 0 ? Math.min(1, pz * 6) : 1;                   // смена подписи в начале шага «без дообучения»
        chip(c, k, A, P, nm(E.phrase(...CAPS[cur])), cx, cy, cw, chh, P.ink3, aCap * swap);
        txt(c, k, G.capLab[2], G.capLab[0], G.capLab[1], G.labW, { px: 10.5, color: P.ink2 });
        const tk = seg(cur > 0 ? Math.min(1, pz * 3) : pT, 0.15, 0.4);
        G.tok.forEach(([tx, ty], i) => chip(c, k, A, P, w2[i], lerp(cx, tx, ease(tk)), ty, G.tokW, G.tokH, P.mot, tk));
        if (tk > 0 || pT >= 1) txt(c, k, G.tokLab[2], G.tokLab[0], G.tokLab[1], G.labW, { px: 10.5, color: P.ink2 });
      }
      A.arrow(c, ...G.a4, pT > 0.12 ? P.ink2 : P.line, 1.5, 6);
      A.arrow(c, ...G.a5, pT > 0.4 ? P.ink2 : P.line, 1.5, 6);
      const encOn = (pT > 0.4 && pT < 1) || (cur > 0 && pz > 0.25 && pz < 0.7);
      flowDots(c, A, ...G.a5, cur > 0 ? seg(pz, 0.25, 0.5) : seg(pT, 0.4, 0.75), P.mot);
      box(c, k, A, P, G.enc2, 'энкодер текста', 'трансформер', encOn);
      A.arrow(c, ...G.a6, pT > 0.75 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a6, cur > 0 ? seg(pz, 0.45, 0.7) : seg(pT, 0.72, 0.98), P.mot);
      // ---------- векторы: длина 1, произведения, сумма ----------
      const vt = cur === 0 ? V[0].map((x, i) => lerp(x, Vn[0][i], pN)) : Vn[cur - 1].map((x, i) => lerp(x, Vn[cur][i], ease(seg(pz, 0.5, 0.75))));
      const vu = U.map((x, i) => lerp(x, Un[i], pN));
      txt(c, k, G.v1Lab[2], G.v1Lab[0], G.v1Lab[1], G.v1Lab[3], { px: 10.5, weight: 700, color: P.ink2, align: G.v1Lab[4], wrap: true });
      txt(c, k, G.v2Lab[2], G.v2Lab[0], G.v2Lab[1], G.v2Lab[3], { px: 10.5, weight: 700, color: P.ink2, align: G.v2Lab[4], wrap: true });
      const step = pC > 0 && pC < 1 ? Math.floor(pC * 8) : -1;
      strip(c, A, P, G.v1, pI > 0.75 ? vu : null, P.out, seg(pI, 0.75, 1), step);
      strip(c, A, P, G.v2, pT > 0.75 ? vt : null, P.mot, cur > 0 ? 1 : seg(pT, 0.75, 1), step);
      if (pN > 0) {
        const L1 = lerp(len(U), 1, pN), L2 = cur === 0 ? lerp(len(V[0]), 1, pN) : 1;
        txt(c, k, `длина ${fx2(L1)}`, G.len1[0], G.len1[1], 70, { px: 10, mono: true, color: pN >= 1 ? P.ink2 : P.mot, align: 'left' });
        txt(c, k, `длина ${fx2(L2)}`, G.len2[0], G.len2[1], 70, { px: 10, mono: true, color: pN >= 1 ? P.ink2 : P.mot, align: 'left' });
      }
      // произведения чисел на одних местах: столбики между векторами и их сумма
      const done = pC <= 0 ? 0 : pC >= 1 ? 8 : Math.floor(pC * 8) + 1, prodAll = cur > 0 ? ease(seg(pz, 0.6, 0.85)) : 0;
      if (pC > 0) {
        const [x0, ym, cw] = G.prod, n = cur === 0 ? done : 8, sc = (G.prodH || 12) / 0.3;
        const vv = cur === 0 ? Vn[0] : Vn[cur - 1].map((x, i) => lerp(x, Vn[cur][i], prodAll));
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const pr = Un[i] * vv[i], x = x0 + i * cw + cw / 2; sum += pr;
          A.line(c, [[x, G.v1[1] + G.v1[3] + 2], [x, G.v2[1] - 2]], A.alpha(i === step ? P.ink : P.mot, i === step ? 0.8 : 0.28), i === step ? 1.6 : 1, [3, 3]);
          const h = pr * sc; c.fillStyle = pr >= 0 ? P.mot : P.ink3; c.fillRect(x - cw * 0.24, Math.min(ym, ym - h), cw * 0.48, Math.abs(h));
        }
        A.line(c, [[x0 + 2, ym], [x0 + 8 * cw - 2, ym]], P.grid, 1);
        txt(c, k, G.prodLab[2], G.prodLab[0], G.prodLab[1], G.prodLab[3], { px: 10, color: P.ink3, align: G.prodLab[4] });
        const shown = sum;
        txt(c, k, ['сумма', fx2(shown)], G.sum[0], G.sum[1], 64, { px: 11, weight: 750, mono: true, color: P.mot, align: G.sum[2] });
      }
      // ---------- сравнение: сходство и выбор без дообучения ----------
      const R = G.res, zs = u >= PH.z2[0];
      txt(c, k, zs ? 'Без дообучения' : 'Сходство', R.title[0], R.title[1], R.w, { px: 12, weight: 750, color: P.ink, align: R.align });
      txt(c, k, zs ? 'одна картинка и подписи классов' : 'косинус угла между векторами', R.sub[0], R.sub[1], R.w, { px: 10, color: P.ink3, align: R.align });
      const ready = [pC > 0, p2 >= 0.85, p3 >= 0.85];
      const part = Un.slice(0, done).reduce((s, x, i) => s + x * Vn[0][i], 0);   // первая подпись: сумма растёт вместе с произведениями
      for (let j = 0; j < 3; j++) {
        if (!ready[j]) continue;
        const y = R.y0 + j * R.dy, v = j === 0 && pC < 1 ? part : COS[j], win = pW > 0 && j === 0;
        if (win) A.rect(c, R.x - 6, y - 10, R.w + 12, R.two ? 34 : 22, 7, A.alpha(P.good, 0.1 * Math.min(1, pW * 3)), P.good, 1.6);
        txt(c, k, nm(E.phrase(...CAPS[j])), R.x, y, R.capW, { px: 10.5, weight: 650, color: P.ink, align: 'left' });
        const by = R.two ? y + 15 : y, bw = Math.max(0, v) * R.barW, nw = Math.max(0, -v) * R.barW;
        A.line(c, [[R.bar0, by - 6], [R.bar0, by + 6]], P.ink3, 1);
        if (bw > 0) A.rect(c, R.bar0, by - 4, bw, 8, 3, j === 0 ? P.out : A.alpha(P.out, 0.55), null);
        if (nw > 0) A.rect(c, R.bar0 - nw, by - 4, nw, 8, 3, P.ink3, null);
        txt(c, k, fx2(v) + (win ? ' ✓' : ''), R.val, by, 54, { px: 10.5, weight: 700, mono: true, color: win ? P.good : P.ink2, align: 'right' });
      }
      if (pW > 0) txt(c, k, 'ответ: самая похожая подпись', R.verdict[0], R.verdict[1], R.w, { px: 10.5, weight: 700, color: P.good, align: R.align });
      // ---------- что происходит ----------
      const st = u < PH.txt[0] ? 'Энкодер картинок превращает картинку в вектор'
        : u < PH.norm[0] ? 'Энкодер текста превращает подпись в вектор той же длины'
        : u < PH.cos[0] ? 'Оба вектора приводят к длине 1'
        : u < PH.z2[0] ? 'Числа на одних местах перемножают и складывают: получается косинус, сходство векторов'
        : u < PH.win[0] ? 'Без дообучения ту же картинку сравнивают с подписями других классов'
        : 'Ответом становится подпись, самая похожая на картинку';
      txt(c, k, st, G.state[0], G.state[1], G.state[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35 });
      c.globalAlpha = 1;
    }
    Anim.add('clip-arch', {
      W: 720, H: 330, start: 12.4, narrowAt: 680,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          img: [52, 86, 56], imgLab: [52, 128, 'картинка'], pat: [144, 86, 11, 3], patLab: [144, 128, 'патчи'], labW: 70,
          a1: [83, 86, 113, 86], a2: [173, 86, 185, 86], enc1: [188, 60, 104, 52], a3: [295, 86, 318, 86],
          cap: [52, 214, 96, 24], capLab: [52, 240, 'подпись'], tok: [[144, 201], [144, 227]], tokW: 52, tokH: 20, tokLab: [144, 252, 'токены'],
          a4: [103, 214, 115, 214], a5: [173, 214, 185, 214], enc2: [188, 188, 104, 52], a6: [295, 214, 318, 214],
          v1: [322, 70, 16, 32], v2: [322, 198, 16, 32], v1Lab: [386, 56, 'вектор картинки', 128, 'center'], v2Lab: [386, 244, 'вектор подписи', 128, 'center'],
          len1: [458, 86], len2: [458, 214], prod: [322, 150, 16], prodH: 13, prodLab: [314, 150, 'произведения', 120, 'right'], sum: [458, 150, 'left'],
          res: { x: 540, w: 166, align: 'left', title: [540, 30], sub: [540, 46], y0: 78, dy: 44, two: true, capW: 160, bar0: 562, barW: 100, val: 706, verdict: [540, 214] },
          state: [14, 300, 692],
        });
      },
      narrow: {
        W: 360, H: 560,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            img: [40, 52, 50], imgLab: [40, 90, 'картинка'], pat: [118, 52, 10, 2], patLab: [118, 90, 'патчи'], labW: 64,
            a1: [68, 52, 91, 52], a2: [145, 52, 161, 52], enc1: [164, 30, 182, 44], a3: [255, 77, 255, 104],
            cap: [59, 264, 106, 24], capLab: [58, 292, 'подпись'], tok: [[157, 251], [157, 277]], tokW: 56, tokH: 20, tokLab: [157, 302, 'токены'],
            a4: [115, 264, 126, 264], a5: [188, 264, 200, 264], enc2: [203, 242, 143, 44], a6: [274, 240, 274, 218],
            v1: [100, 106, 22, 30], v2: [100, 186, 22, 30], v1Lab: [14, 121, 'вектор картинки', 80, 'left'], v2Lab: [14, 201, 'вектор подписи', 80, 'left'],
            len1: [282, 121], len2: [282, 201], prod: [100, 161, 22], prodH: 12, prodLab: [92, 161, 'произведения', 80, 'right'], sum: [282, 161, 'left'],
            res: { x: 24, w: 312, align: 'left', title: [24, 332], sub: [24, 348], y0: 376, dy: 30, two: false, capW: 120, bar0: 168, barW: 130, val: 346, verdict: [24, 472] },
            state: [14, 514, 332],
          });
        },
      },
    });
  })();

  /* ---------- transporter: взятие по карте, укладка поиском вырезки на 36 поворотах ---------- */
  (() => {
    const T = 16, PH = { tv: [0.3, 1.1], pick: [1.1, 2.5], grab: [2.5, 3.3], crop: [3.4, 4.4], scan0: [4.5, 6.1], scan: [6.1, 12.0], best: [12.2, 13.2], fade: [15.2, 16] };
    // мир схемы: стол 36 × 36 клеток; деталь-уголок из пяти квадратов 3 × 3, как в интерактиве, но мельче;
    // точка взятия — центр углового квадрата; гнездо повёрнуто на 120°
    const N = 36, Q = 3, SQ = new Set(['0,0', '1,0', '2,0', '0,1', '0,2']), G0 = 1.5, AF = 12, GRIP = [10, 24], SLOT = [26, 12], CR = 9;
    /** Клетки детали, повёрнутой на угол a вокруг точки взятия (смещения от неё); клетка входит, если после
     *  обратного поворота её центр попадает в квадрат детали — так фигура сплошная на любом угле. */
    function L(a) { const out = [], c = Math.cos(-a), s = Math.sin(-a); for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) { const uu = dx * c - dy * s + G0, vv = dx * s + dy * c + G0; if (uu >= 0 && vv >= 0 && SQ.has(Math.floor(uu / Q) + ',' + Math.floor(vv / Q))) out.push([dx, dy]); } return out; }
    let W0 = null;
    /** Признаки сцены φ (прорезь +1, стенки −1, как в интерактиве), 36 карт укладки и карта взятия — один раз. */
    function world() {
      if (W0) return W0;
      const id = (x, y) => y * N + x, inN = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
      const phi = new Float32Array(N * N), piece = new Uint8Array(N * N);
      const hole = L(AF * Math.PI / 18).map(([dx, dy]) => [SLOT[0] + dx, SLOT[1] + dy]);
      for (const [x, y] of hole) if (inN(x, y)) phi[id(x, y)] = 1;
      for (const [x, y] of hole) for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) { const X = x + ox, Y = y + oy; if (inN(X, Y) && !phi[id(X, Y)]) phi[id(X, Y)] = -1; }
      for (const [dx, dy] of L(0)) piece[id(GRIP[0] + dx, GRIP[1] + dy)] = 1;
      const maps = [], maxk = []; let best = { s: -9, k: 0, x: 0, y: 0 };
      for (let k = 0; k < 36; k++) {
        const C = L(k * Math.PI / 18), m = new Float32Array(N * N); let mk = -9;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          let t = 0; for (const [dx, dy] of C) t += inN(x + dx, y + dy) ? phi[id(x + dx, y + dy)] : -1;
          t /= C.length; m[id(x, y)] = t; if (t > mk) mk = t; if (t > best.s) best = { s: t, k, x, y };
        }
        maps.push(m); maxk.push(mk);
      }
      const pick = new Float32Array(N * N);                 // карта «где взять» для примера: пятно на детали
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d2 = (x - GRIP[0]) ** 2 + (y - GRIP[1]) ** 2; pick[id(x, y)] = Math.exp(-d2 / 22) * (piece[id(x, y)] ? 1 : 0.22); }
      // вид сверху: цвет (стол, рамка гнезда, деталь) и высота (выше — светлее)
      const rgb = document.createElement('canvas'), dep = document.createElement('canvas'); rgb.width = dep.width = N; rgb.height = dep.height = N;
      const a = rgb.getContext('2d').createImageData(N, N), b = dep.getContext('2d').createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const col = piece[i] ? [219, 56, 51] : phi[i] < 0 ? [128, 124, 116] : phi[i] > 0 ? [205, 200, 190] : [237, 235, 227];
        const h = piece[i] ? 244 : phi[i] < 0 ? 196 : 128;
        const n = (hash(i) - 0.5) * 8;
        for (let q = 0; q < 3; q++) { a.data[i * 4 + q] = col[q] + n; b.data[i * 4 + q] = h + n; }
        a.data[i * 4 + 3] = b.data[i * 4 + 3] = 255;
      }
      rgb.getContext('2d').putImageData(a, 0, 0); dep.getContext('2d').putImageData(b, 0, 0);
      return (W0 = { phi, piece, maps, maxk, best, pick, rgb, dep });
    }
    /** Сетка N × N как картинка: значения 0…1 цветом col поверх фона. */
    function cells(c, vals, x0, y0, s, col, amax, upto) {
      const cs = s / N; c.fillStyle = col;
      for (let i = 0; i < N * N; i++) { if (upto != null && i > upto) break; const v = vals[i]; if (v <= 0.02) continue; c.globalAlpha = Math.min(1, v) * amax * fadeA; c.fillRect(x0 + (i % N) * cs, y0 + Math.floor(i / N) * cs, cs + 0.4, cs + 0.4); }
      c.globalAlpha = fadeA;
    }
    let fadeA = 1;
    /** Признаки сцены φ: прорезь светлая, стенки серые, как в интерактиве. */
    function phiMap(c, A, P, w, x0, y0, s, faint) {
      A.rect(c, x0, y0, s, s, 4, P.surf2, P.grid, 1);
      const cs = s / N;
      for (let i = 0; i < N * N; i++) { const v = w.phi[i]; if (!v) continue; c.fillStyle = v > 0 ? P.surf : P.ink3; c.globalAlpha = fadeA * (v > 0 ? (faint ? 0.6 : 1) : faint ? 0.22 : 0.55); c.fillRect(x0 + (i % N) * cs, y0 + Math.floor(i / N) * cs, cs + 0.4, cs + 0.4); }
      c.globalAlpha = fadeA;
    }
    /** Деталь (вырезка ψ) на угле k в точке (gx, gy) сетки: заливка и контур по границам клеток. */
    function pieceAt(c, P, k, gx, gy, x0, y0, s, alphaFill) {
      const cs = s / N, C = L(k * Math.PI / 18), set = new Set(C.map(([dx, dy]) => dx + ',' + dy));
      c.fillStyle = P.out; c.globalAlpha = fadeA * (alphaFill == null ? 0.3 : alphaFill);
      for (const [dx, dy] of C) c.fillRect(x0 + (gx + dx) * cs, y0 + (gy + dy) * cs, cs + 0.4, cs + 0.4);
      c.globalAlpha = fadeA; c.strokeStyle = P.out; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath();
      for (const [dx, dy] of C) {
        const x = x0 + (gx + dx) * cs, y = y0 + (gy + dy) * cs;
        if (!set.has(dx + ',' + (dy - 1))) { c.moveTo(x, y); c.lineTo(x + cs, y); }
        if (!set.has(dx + ',' + (dy + 1))) { c.moveTo(x, y + cs); c.lineTo(x + cs, y + cs); }
        if (!set.has((dx - 1) + ',' + dy)) { c.moveTo(x, y); c.lineTo(x, y + cs); }
        if (!set.has((dx + 1) + ',' + dy)) { c.moveTo(x + cs, y); c.lineTo(x + cs, y + cs); }
      }
      c.stroke();
    }
    /** Вырезка признаков ψ: квадрат (2·CR + 1) клеток вокруг точки взятия, деталь синим; ang — поворот в радианах. */
    function crop(c, A, P, cx, cy, s, ang, a) {
      if (a <= 0) return;
      const n = 2 * CR + 1, cs = s / n, ga = c.globalAlpha;
      c.save(); c.translate(cx, cy); c.rotate(ang); c.globalAlpha = ga * a;
      A.rect(c, -s / 2, -s / 2, s, s, 3, P.surf, P.out, 1.4);
      c.fillStyle = A.alpha(P.out, 0.75);
      for (const [dx, dy] of L(0)) c.fillRect((dx - 0.5) * cs, (dy - 0.5) * cs, cs + 0.3, cs + 0.3);
      A.circle(c, 0, 0, 2.2, P.ink);
      c.restore(); c.globalAlpha = ga;
    }
    function draw(c, k, t, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t % T) + T) % T, w = world();
      const pTv = seg(u, ...PH.tv), pPk = seg(u, ...PH.pick), pGr = seg(u, ...PH.grab), pCr = ease(seg(u, ...PH.crop)), pS0 = seg(u, ...PH.scan0), pSc = seg(u, ...PH.scan), pB = seg(u, ...PH.best);
      fadeA = 1 - seg(u, ...PH.fade); c.globalAlpha = fadeA;
      // какой поворот сейчас перебирается и докуда открыта его карта
      const kNow = pB > 0 ? w.best.k : pSc > 0 ? Math.min(35, 1 + Math.floor(pSc * 35)) : 0;
      const scanned = pB > 0 ? 36 : pSc > 0 ? kNow + 1 : pS0 >= 1 ? 1 : 0;
      // ---------- взятие ----------
      txt(c, k, 'Взятие', G.t1[0], G.t1[1], 120, { px: 12.5, weight: 750, color: P.ink, align: 'left' });
      const [tx, ty, ts] = G.tv;
      if (pTv > 0) {
        const off = G.dOff * ease(seg(pTv, 0.3, 1));            // слой высоты выезжает из-под цветного
        c.imageSmoothingEnabled = false;
        if (off > 0) { c.globalAlpha = fadeA * Math.min(1, pTv * 2); c.drawImage(w.dep, tx + off, ty - off, ts, ts); A.rect(c, tx + off, ty - off, ts, ts, 3, null, P.line, 1); }
        c.globalAlpha = fadeA * Math.min(1, pTv * 2); c.drawImage(w.rgb, tx, ty, ts, ts); A.rect(c, tx, ty, ts, ts, 3, null, P.line, 1);
        c.imageSmoothingEnabled = true; c.globalAlpha = fadeA;
        txt(c, k, G.tvLab[2], G.tvLab[0], G.tvLab[1], G.tvLab[3], { px: 10.5, color: P.ink2, wrap: true });
        if (pGr > 0.4) {                                        // квадрат вырезки вокруг точки взятия
          const cs = ts / N; c.setLineDash([4, 3]); c.strokeStyle = P.out; c.lineWidth = 1.6;
          c.strokeRect(tx + (GRIP[0] - CR) * cs, ty + (GRIP[1] - CR) * cs, (2 * CR + 1) * cs, (2 * CR + 1) * cs); c.setLineDash([]);
        }
      }
      A.arrow(c, ...G.a1, pPk > 0 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a1, seg(pPk, 0, 0.35), P.mot);
      box(c, k, A, P, G.fcn, G.fcnT, G.fcnS, pPk > 0.1 && pPk < 0.8);
      A.arrow(c, ...G.a2, pPk > 0.5 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a2, seg(pPk, 0.45, 0.8), P.mot);
      const [mx, my, ms] = G.pk;
      A.rect(c, mx, my, ms, ms, 3, P.surf2, P.grid, 1);
      if (pPk > 0.6) {
        phiMap(c, A, P, w, mx, my, ms, true);
        cells(c, w.pick, mx, my, ms, P.mot, 0.92, Math.floor(N * N * seg(pPk, 0.6, 1)));
        txt(c, k, G.pkLab[2], G.pkLab[0], G.pkLab[1], G.pkLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      if (pGr > 0) {
        const cs = ms / N, gx = mx + (GRIP[0] + 0.5) * cs, gy = my + (GRIP[1] + 0.5) * cs;
        A.circle(c, gx, gy, 4 + 6 * ease(Math.min(1, pGr * 2)), null, P.ink, 2.2);
        txt(c, k, 'взять', gx + G.grabOff[0], gy + G.grabOff[1], 50, { px: 10.5, weight: 750, color: P.ink, haloColor: P.surf2, halo: true, align: 'left' });
      }
      // ---------- что происходит ----------
      const stT = u < PH.crop[0] ? 'Взятие: сеть оценивает каждую клетку вида сверху, и робот берёт в самой яркой.'
        : u < PH.scan0[0] ? 'Укладка: вокруг точки взятия берут вырезку признаков ψ.'
        : u < PH.scan[0] ? 'Вырезку прикладывают к каждой клетке признаков сцены φ, и получается карта для одного угла.'
        : u < PH.best[0] ? 'То же делают для каждого из 36 поворотов вырезки.'
        : 'Самая яркая клетка самой яркой карты даёт место и поворот.';
      txt(c, k, stT, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', lh: 1.35, wrap: true });
      // ---------- укладка ----------
      txt(c, k, 'Укладка', G.t2[0], G.t2[1], 120, { px: 12.5, weight: 750, color: P.ink, align: 'left' });
      const [ccx, ccy, csz] = G.cr;
      if (pCr > 0) {
        // вырезка перелетает с вида сверху на своё место
        const fs = ts / N * (2 * CR + 1), fx0 = tx + (GRIP[0] + 0.5) * ts / N, fy0 = ty + (GRIP[1] + 0.5) * ts / N;
        crop(c, A, P, lerp(fx0, ccx, pCr), lerp(fy0, ccy, pCr), lerp(fs, csz, pCr), 0, 1);
        if (pCr >= 1) txt(c, k, G.crLab[2], G.crLab[0], G.crLab[1], G.crLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      A.arrow(c, ...G.a3, pS0 > 0 ? P.ink2 : P.line, 1.5, 6);
      const [rx, ry, rs] = G.rot;
      if (pS0 > 0) {
        for (let j = 3; j >= 1; j--) { const kk = kNow - j * 3; if (kk >= 0 && pSc > 0) crop(c, A, P, rx, ry, rs, kk * Math.PI / 18, 0.12 * (4 - j)); }
        crop(c, A, P, rx, ry, rs, kNow * Math.PI / 18, 1);
        txt(c, k, G.rotLab[2], G.rotLab[0], G.rotLab[1], G.rotLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      A.arrow(c, ...G.a4, pS0 > 0 ? P.ink2 : P.line, 1.5, 6);
      const [fx, fy, fs2] = G.phi;
      if (pCr > 0.5) {
        c.globalAlpha = fadeA * Math.min(1, (pCr - 0.5) * 2);
        phiMap(c, A, P, w, fx, fy, fs2, false);
        c.globalAlpha = fadeA;
        txt(c, k, G.phiLab[2], G.phiLab[0], G.phiLab[1], G.phiLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      // где сейчас вырезка на сцене: первый угол — перебор клеток по порядку, дальше — лучшая клетка карты
      let upto = null, at = null;
      if (pS0 > 0 && pS0 < 1) { const steps = 64, j = Math.min(steps - 1, Math.floor(pS0 * steps)), gx = 2 + (j % 8) * 5, gy = 2 + Math.floor(j / 8) * 5; at = [gx, gy]; upto = gy * N + gx + 2; }
      else if (pS0 >= 1) { const m = w.maps[kNow]; let bi = 0; for (let i = 1; i < m.length; i++) if (m[i] > m[bi]) bi = i; at = [bi % N, Math.floor(bi / N)]; }
      if (at && pB <= 0) pieceAt(c, P, kNow, at[0], at[1], fx, fy, fs2, 0.25);
      A.arrow(c, ...G.a5, pS0 > 0 ? P.ink2 : P.line, 1.5, 6);
      flowDots(c, A, ...G.a5, pS0 > 0 && pS0 < 1 ? pS0 : pSc > 0 && pSc < 1 ? (u * 0.8) % 1 : 0, P.mot);
      // стопка карт «куда положить»: по одной на каждый угол
      const [sx, sy, ss] = G.stack;
      const layers = Math.min(3, Math.floor(scanned / 6) + (scanned ? 1 : 0));
      for (let j = layers; j >= 1; j--) A.rect(c, sx + j * G.stOff, sy - j * G.stOff, ss, ss, 3, P.surf2, P.line, 1);
      A.rect(c, sx, sy, ss, ss, 3, P.surf2, P.grid, 1);
      if (scanned > 0 || (pS0 > 0)) {
        phiMap(c, A, P, w, sx, sy, ss, true);
        cells(c, w.maps[kNow].map((v) => Math.max(0, v)), sx, sy, ss, P.mot, 0.92, upto);
        const cs = ss / N;
        if (at && pS0 < 1) A.rect(c, sx + at[0] * cs - 1, sy + at[1] * cs - 1, cs + 2, cs + 2, 1, null, P.ink, 1.4);   // клетка, которую сейчас считают
        if (pB > 0) A.circle(c, sx + (w.best.x + 0.5) * cs, sy + (w.best.y + 0.5) * cs, 7, null, P.out, 2.2);
        txt(c, k, G.stLab[2], G.stLab[0], G.stLab[1], G.stLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      A.arrow(c, ...G.a6, pB > 0 ? P.ink2 : P.line, 1.5, 6);
      // лучшие место и поворот
      const [bx, by, bs] = G.best;
      A.rect(c, bx, by, bs, bs, 3, P.surf2, P.grid, 1);
      if (pB > 0) {
        c.globalAlpha = fadeA * Math.min(1, pB * 2);
        phiMap(c, A, P, w, bx, by, bs, false);
        pieceAt(c, P, w.best.k, w.best.x, w.best.y, bx, by, bs, 0.55);
        c.globalAlpha = fadeA;
        txt(c, k, G.bLab[2], G.bLab[0], G.bLab[1], G.bLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      // столбики: лучшая оценка на каждом из 36 поворотов
      const B = G.bars, bw = B.w / 36;
      txt(c, k, B.lab[2], B.lab[0], B.lab[1], B.lab[3], { px: 10, color: P.ink3, align: B.lab[4] || 'left', wrap: true });
      A.line(c, [[B.x, B.y], [B.x + B.w, B.y]], P.grid, 1);
      for (let j = 0; j < 36; j++) {
        const x = B.x + j * bw + bw * 0.18, hgt = j < scanned ? Math.max(1.5, w.maxk[j] * B.h) : 0;
        const col = pB > 0 && j === w.best.k ? P.out : j === kNow && scanned ? P.mot : A.alpha(P.ink3, 0.55);
        if (hgt > 0) A.rect(c, x, B.y - hgt, bw * 0.64, hgt, 1.5, col, null);
        else A.rect(c, x, B.y - 1.5, bw * 0.64, 1.5, 1, P.grid, null);
      }
      txt(c, k, '0°', B.x + bw / 2, B.y + 10, 30, { px: 10, mono: true, color: P.ink3 });
      txt(c, k, '350°', B.x + B.w - bw / 2, B.y + 10, 40, { px: 10, mono: true, color: P.ink3 });
      if (scanned) txt(c, k, pB > 0 ? `лучший поворот ${w.best.k * 10}°` : `поворот ${kNow * 10}°`, B.ang[0], B.ang[1], B.ang[2], { px: 11, weight: 750, mono: false, color: pB > 0 ? P.out : P.mot, align: B.ang[3] || 'left' });
      c.globalAlpha = 1;
    }
    Anim.add('transporter', {
      W: 720, H: 382, start: 12.8, narrowAt: 680,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          t1: [14, 16], tv: [22, 40, 92], dOff: 7, tvLab: [70, 150, 'вид сверху: цвет\u00a0и\u00a0высота', 128],
          a1: [124, 86, 148, 86], fcn: [152, 60, 144, 52], fcnT: 'полносвёрточная сеть', fcnS: 'одни веса для всех клеток', a2: [300, 86, 318, 86],
          pk: [322, 40, 92], pkLab: [368, 148, 'карта «где взять»', 120], grabOff: [9, -11],
          st: [442, 70, 264],
          t2: [14, 176], cr: [54, 236, 60], crLab: [54, 296, 'вырезка ψ у\u00a0точки взятия', 88],
          a3: [90, 236, 112, 236], rot: [160, 236, 60], rotLab: [160, 296, '36 поворотов через\u00a010°', 84], a4: [208, 236, 230, 236],
          phi: [234, 190, 92], phiLab: [280, 296, 'признаки сцены φ', 104], a5: [330, 236, 352, 236],
          stack: [356, 190, 92], stOff: 4, stLab: [402, 296, 'карта «куда\u00a0положить» для\u00a0каждого\u00a0угла', 132], a6: [466, 236, 488, 236],
          best: [492, 190, 92], bLab: [538, 296, 'лучшие место и\u00a0поворот', 96],
          bars: { x: 130, y: 362, w: 470, h: 34, lab: [14, 346, 'лучшая оценка на\u00a0каждом\u00a0угле', 110], ang: [612, 346, 106] },
        });
      },
      narrow: {
        W: 360, H: 632,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            t1: [14, 16], tv: [14, 40, 76], dOff: 6, tvLab: [52, 138, 'вид сверху: цвет\u00a0и\u00a0высота', 100],
            a1: [100, 78, 109, 78], fcn: [111, 54, 134, 50], fcnT: 'полносвёрточная сеть', fcnS: null, a2: [249, 78, 263, 78],
            pk: [266, 40, 76], pkLab: [304, 138, 'карта «где взять»', 112], grabOff: [8, -10],
            st: [14, 192, 332],
            t2: [14, 242], cr: [44, 304, 54], crLab: [44, 356, 'вырезка ψ у\u00a0точки взятия', 76],
            a3: [76, 304, 94, 304], rot: [136, 304, 54], rotLab: [136, 356, '36 поворотов через\u00a010°', 84], a4: [180, 304, 222, 304],
            phi: [228, 264, 104], phiLab: [280, 252, 'признаки сцены φ', 120], a5: [280, 372, 280, 392],
            stack: [228, 406, 104], stOff: 4, stLab: [280, 526, 'карта «куда\u00a0положить» для\u00a0каждого\u00a0угла', 132], a6: [222, 458, 156, 458],
            best: [48, 406, 104], bLab: [100, 526, 'лучшие место и\u00a0поворот', 110],
            bars: { x: 14, y: 610, w: 332, h: 34, lab: [14, 564, 'лучшая оценка на\u00a0каждом\u00a0угле', 210], ang: [346, 564, 120, 'right'] },
          });
        },
      },
    });
  })();

  /* ---------- cliport: два потока — семантический (CLIP) и пространственный (Transporter) ---------- */
  (() => {
    const T = 15, PH = { inp: [0.2, 1.0], txt: [1.0, 2.2], img: [1.6, 3.0], sp: [2.4, 4.2], dec: [4.2, 7.6], fuse: [7.8, 9.0], place: [9.4, 11.4], fade: [14.2, 15] };
    const SEED = 938, G24 = 24;                             // сцена лаборатории 3: синий кубик, ещё два кубика и миска
    let S0 = null;
    function scene() {
      if (S0) return S0;
      const sc = E.cmdScene('blue', SEED), dep = new Float32Array(E.TW * E.TW * 3);
      for (let y = 0; y < E.TW; y++) for (let x = 0; x < E.TW; x++) {
        let h = 0.42; for (const q of sc.objs) if (E.inShape(q.shape, x + 0.5 - q.x, y + 0.5 - q.y, E.RT)) h = q.shape === 'cube' ? 0.95 : 0.74;
        const n = (hash(y * E.TW + x) - 0.5) * 0.03, o = (y * E.TW + x) * 3; dep[o] = dep[o + 1] = dep[o + 2] = h + n;
      }
      const blob = (q, r2) => { const m = new Float32Array(G24 * G24); for (let i = 0; i < m.length; i++) { const p = E.cellXY(i); m[i] = Math.exp(-((p.x - q.x) ** 2 + (p.y - q.y) ** 2) / r2); } return m; };
      const cube = sc.objs.find((q) => q.color === 'blue' && q.shape === 'cube'), bowl = sc.objs.find((q) => q.shape === 'bowl');
      return (S0 = { sc, rgb: bitmap(sc.img, E.TW, E.TW), dep: bitmap(dep, E.TW, E.TW), pick: blob(cube, 70), place: blob(bowl, 110) });
    }
    /** Карта 24 × 24 для примера: фон, оценки цветом col, контуры предметов. */
    function map24(c, A, P, s0, vals, x0, y0, s, col, pr) {
      A.rect(c, x0, y0, s, s, 4, P.surf2, P.grid, 1);
      const cs = s / G24, ga = c.globalAlpha;
      if (vals && pr > 0) { c.fillStyle = col; for (let i = 0; i < vals.length; i++) { const v = vals[i] * pr; if (v < 0.03) continue; c.globalAlpha = ga * Math.min(1, v) * 0.9; c.fillRect(x0 + (i % G24) * cs, y0 + Math.floor(i / G24) * cs, cs + 0.3, cs + 0.3); } c.globalAlpha = ga; }
      const sc = s / E.TW;
      for (const q of s0.sc.objs) {
        c.beginPath(); const x = x0 + q.x * sc, y = y0 + q.y * sc, r = E.RT * sc;
        if (q.shape === 'cube') { const hh = r * 0.8; c.rect(x - hh, y - hh, 2 * hh, 2 * hh); } else { c.arc(x, y, r, 0, TAU); c.moveTo(x + r * 0.55, y); c.arc(x, y, r * 0.55, 0, TAU); }
        c.lineWidth = 1.3; c.strokeStyle = rgbCss(q.color); c.globalAlpha = ga * 0.85; c.stroke(); c.globalAlpha = ga;
      }
    }
    /** Блок признаков: квадрат с сеткой; on — сейчас считается. */
    function feat(c, A, P, cx, cy, s, col, a, on, n) {
      if (a <= 0) return;
      const ga = c.globalAlpha; c.globalAlpha = ga * a;
      A.rect(c, cx - s / 2, cy - s / 2, s, s, 3, A.alpha(col, on ? 0.32 : 0.14), col, on ? 1.8 : 1.2);
      const m = n || 3; c.strokeStyle = A.alpha(col, 0.45); c.lineWidth = 0.8; c.beginPath();
      for (let i = 1; i < m; i++) { c.moveTo(cx - s / 2 + i * s / m, cy - s / 2 + 2); c.lineTo(cx - s / 2 + i * s / m, cy + s / 2 - 2); c.moveTo(cx - s / 2 + 2, cy - s / 2 + i * s / m); c.lineTo(cx + s / 2 - 2, cy - s / 2 + i * s / m); }
      c.stroke(); c.globalAlpha = ga;
    }
    function poly(c, A, pts, col, lw, dash, head) {
      if (pts.length > 2) A.line(c, pts.slice(0, -1), col, lw, dash);
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      if (head === false) A.line(c, [a, b], col, lw, dash); else if (dash) { A.line(c, [a, b], col, lw, dash); A.arrow(c, b[0] - (b[0] - a[0]) * 0.001, b[1] - (b[1] - a[1]) * 0.001, b[0], b[1], col, lw, 6); } else A.arrow(c, a[0], a[1], b[0], b[1], col, lw, 6);
    }
    function draw(c, k, t, P, A, G) {
      const { seg, ease } = A, u = ((t % T) + T) % T, s0 = scene();
      const pIn = seg(u, ...PH.inp), pTx = seg(u, ...PH.txt), pIm = seg(u, ...PH.img), pSp = seg(u, ...PH.sp), pDe = seg(u, ...PH.dec), pFu = seg(u, ...PH.fuse), pPl = seg(u, ...PH.place);
      const fade = 1 - seg(u, ...PH.fade); c.globalAlpha = fade;
      const lvl = pDe <= 0 ? -1 : pDe >= 1 ? 3 : Math.floor(pDe * 3), lp = pDe >= 1 ? 1 : (pDe * 3) % 1;   // уровень декодера и доля его шага
      const on = (x) => (x ? P.ink2 : P.line);
      // ---------- полосы потоков ----------
      for (const [b, ti, col] of [[G.band1, G.band1T, P.spr], [G.band2, G.band2T, P.out]]) {
        A.rect(c, b[0], b[1], b[2], b[3], 12, A.alpha(col, 0.05), A.alpha(col, 0.35), 1.2);
        txt(c, k, ti[2], ti[0], ti[1], ti[3], { px: 11.5, weight: 750, color: col, align: 'left', wrap: true });
      }
      // ---------- входы ----------
      if (pIn > 0) {
        const a = Math.min(1, pIn * 2), ga = c.globalAlpha; c.globalAlpha = ga * a;
        const [qx, qy, qw, qh] = G.cmd;
        A.rect(c, qx - qw / 2, qy - qh / 2, qw, qh, 9, P.surf, P.ink3, 1.3);
        txt(c, k, G.cmdText, qx, qy, qw - 10, { px: 10.5, weight: 650, color: P.ink, wrap: true });
        const [rx, ry, rs] = G.rgb, [dx, dy, ds] = G.rgbd;
        c.imageSmoothingEnabled = false;
        c.drawImage(s0.rgb, rx, ry, rs, rs); A.rect(c, rx, ry, rs, rs, 3, null, P.line, 1);
        c.drawImage(s0.dep, dx + G.dOff, dy - G.dOff, ds, ds); A.rect(c, dx + G.dOff, dy - G.dOff, ds, ds, 3, null, P.line, 1);
        c.drawImage(s0.rgb, dx, dy, ds, ds); A.rect(c, dx, dy, ds, ds, 3, null, P.line, 1);
        c.imageSmoothingEnabled = true; c.globalAlpha = ga;
        txt(c, k, G.rgbLab[2], G.rgbLab[0], G.rgbLab[1], G.rgbLab[3], { px: 10.5, color: P.ink2, wrap: true });
        txt(c, k, G.rgbdLab[2], G.rgbdLab[0], G.rgbdLab[1], G.rgbdLab[3], { px: 10.5, color: P.ink2, wrap: true });
      }
      // ---------- семантический поток: текст ----------
      poly(c, A, G.aCmd, on(pTx > 0), 1.5);
      flowDots(c, A, ...G.aCmd[0], ...G.aCmd[G.aCmd.length - 1], seg(pTx, 0, 0.4), P.spr);
      box(c, k, A, P, G.tenc, G.tencT, 'заморожен', pTx > 0.2 && pTx < 0.8, P.spr);
      poly(c, A, G.aVec, on(pTx > 0.6), 1.5);
      const [vx, vy, vw, vh] = G.vec;
      for (let i = 0; i < 8; i++) { const g = Math.max(0, Math.min(1, seg(pTx, 0.6, 1) * 8 - i)); A.rect(c, vx + i * vw + 1, vy, vw - 2, vh, 2, g > 0 ? A.alpha(P.spr, 0.2 + 0.6 * hash(i + 5) * g) : P.surf, A.alpha(P.spr, 0.6), 1); }
      if (pTx > 0.6) txt(c, k, G.vecLab[2], G.vecLab[0], G.vecLab[1], G.vecLab[3], { px: 10.5, color: P.ink2, align: G.vecLab[4] || 'center', wrap: true });
      // ---------- семантический поток: картинка ----------
      poly(c, A, G.aRgb, on(pIm > 0), 1.5);
      flowDots(c, A, ...G.aRgb[0], ...G.aRgb[G.aRgb.length - 1], seg(pIm, 0, 0.35), P.spr);
      box(c, k, A, P, G.ienc, G.iencT, G.iencS, pIm > 0.2 && pIm < 0.8, P.spr);
      poly(c, A, G.aF7, on(pIm > 0.7), 1.5);
      feat(c, A, P, ...G.f7, P.spr, seg(pIm, 0.7, 1), false, 7);
      if (pIm > 0.7) txt(c, k, '7 × 7', G.f7Lab[0], G.f7Lab[1], 40, { px: 10, mono: true, color: P.ink3, align: G.f7Lab[2] || 'center' });
      // ---------- пространственный поток: сеть Transporter ----------
      poly(c, A, G.aRgbd, on(pSp > 0), 1.5);
      txt(c, k, G.trLab[2], G.trLab[0], G.trLab[1], G.trLab[3], { px: 10.5, weight: 700, color: P.ink2, align: G.trLab[4] || 'center', wrap: true });
      G.spEnc.forEach(([x, y, s], i) => { const a = seg(pSp, i / G.spEnc.length * 0.8, i / G.spEnc.length * 0.8 + 0.25); feat(c, A, P, x, y, s, P.out, Math.max(0.25, a), a > 0 && a < 1 && pSp < 1); if (i) poly(c, A, [[G.spEnc[i - 1][0] + G.spEnc[i - 1][2] / 2 * G.encDir[0] + 2 * G.encDir[0], G.spEnc[i - 1][1] + G.spEnc[i - 1][2] / 2 * G.encDir[1] + 2 * G.encDir[1]], [x - s / 2 * G.encDir[0] - 3 * G.encDir[0], y - s / 2 * G.encDir[1] - 3 * G.encDir[1]]], on(a > 0), 1.3); });
      // ---------- декодеры, умножение на вектор команды, боковые связи ----------
      if (G.vecTap) A.line(c, G.vecTap, lvl >= 0 ? A.alpha(P.spr, 0.5) : P.line, 1.2, [4, 3]);
      G.sem.forEach(([x, y, s], i) => {
        const done = lvl > i || (lvl === i && lp > 0.55), act = lvl === i;
        const [sx, sy, ss] = G.spDec[i], spOn = lvl > i || (lvl === i && lp > 0.05);
        feat(c, A, P, sx, sy, ss, P.out, spOn ? 1 : 0.25, act && lp < 0.5);
        poly(c, A, G.spLink[i], on(spOn), 1.3);
        poly(c, A, G.lat[i], act && lp > 0.15 && lp < 0.7 ? P.out : spOn ? A.alpha(P.out, 0.7) : P.line, act ? 2 : 1.5);
        if (act) flowDots(c, A, ...G.lat[i][0], ...G.lat[i][G.lat[i].length - 1], seg(lp, 0.15, 0.6), P.out);
        const [mx, my] = G.mul[i];
        A.line(c, G.dash[i], spOn || done ? A.alpha(P.spr, act ? 0.9 : 0.5) : P.line, act ? 1.6 : 1.2, [4, 3]);
        A.circle(c, mx, my, 8, act && lp > 0.3 ? A.alpha(P.spr, 0.18) : P.surf, done || act ? P.spr : P.line, 1.5);
        txt(c, k, '×', mx, my + 0.5, 16, { px: 12, weight: 800, color: done || act ? P.spr : P.ink3 });
        poly(c, A, G.mulLink[i], on(done || act), 1.3);
        feat(c, A, P, x, y, s, P.spr, done ? 1 : 0.25, act && lp > 0.4);
        if (i) poly(c, A, G.semLink[i - 1], on(done), 1.3);
      });
      poly(c, A, G.semLink0, on(lvl >= 0), 1.3);
      txt(c, k, G.latLab[2], G.latLab[0], G.latLab[1], G.latLab[3], { px: 10, weight: 650, color: P.out, align: G.latLab[4] || 'center', wrap: true });
      txt(c, k, G.mulLab[2], G.mulLab[0], G.mulLab[1], G.mulLab[3], { px: 10, weight: 650, color: P.spr, align: G.mulLab[4] || 'center', wrap: true });
      // ---------- слияние и карты ----------
      poly(c, A, G.semOut, pFu > 0 ? P.spr : P.line, 1.5); poly(c, A, G.spOut, pFu > 0 ? P.out : P.line, 1.5);
      flowDots(c, A, ...G.semOut[G.semOut.length - 2], ...G.semOut[G.semOut.length - 1], seg(pFu, 0, 0.5), P.spr);
      flowDots(c, A, ...G.spOut[G.spOut.length - 2], ...G.spOut[G.spOut.length - 1], seg(pFu, 0, 0.5), P.out);
      const [px, py] = G.plus;
      A.circle(c, px, py, 11, pFu > 0 ? A.alpha(P.mot, 0.16) : P.surf, pFu > 0 ? P.mot : P.line, 1.6);
      txt(c, k, '+', px, py + 0.5, 18, { px: 14, weight: 800, color: pFu > 0 ? P.mot : P.ink3 });
      if (G.plusLab) txt(c, k, G.plusLab[2], G.plusLab[0], G.plusLab[1], 80, { px: 10, weight: 650, color: pFu > 0 ? P.mot : P.ink3, align: G.plusLab[3] || 'left' });
      poly(c, A, G.aPick, pFu > 0.4 ? P.ink2 : P.line, 1.5);
      const [kx, ky, ks] = G.pick;
      map24(c, A, P, s0, s0.pick, kx, ky, ks, P.mot, ease(seg(pFu, 0.4, 1)));
      txt(c, k, G.pickLab[2], G.pickLab[0], G.pickLab[1], G.pickLab[3], { px: 10.5, weight: 700, color: pFu > 0.4 ? P.ink : P.ink3, wrap: true });
      poly(c, A, G.aPlace, pPl > 0 ? P.ink2 : P.line, 1.5, [4, 3]);
      const [lx, ly, ls] = G.place;
      map24(c, A, P, s0, s0.place, lx, ly, ls, P.mot, ease(seg(pPl, 0.35, 1)));
      txt(c, k, G.placeLab[2], G.placeLab[0], G.placeLab[1], G.placeLab[3], { px: 10.5, weight: 700, color: pPl > 0.35 ? P.ink : P.ink3, wrap: true });
      if (pPl > 0 && G.note) txt(c, k, G.note[2], G.note[0], G.note[1], G.note[3], { px: 10, color: P.ink2, align: G.note[4] || 'center', wrap: true });
      // ---------- что происходит ----------
      const stT = u < PH.sp[0] ? 'Семантический поток: замороженный CLIP превращает картинку и команду в признаки.'
        : u < PH.dec[0] ? 'Пространственный поток: сеть Transporter считает признаки по цвету и глубине.'
        : u < PH.fuse[0] ? 'В декодере признаки картинки умножают на вектор команды, а по боковым связям приходят признаки Transporter.'
        : u < PH.place[0] ? 'Признаки двух потоков складывают, и получается карта «где взять».'
        : 'Карту «куда положить» строят тем же способом по вырезке и всей сцене.';
      txt(c, k, stT, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', lh: 1.35, wrap: true });
      c.globalAlpha = 1;
    }
    Anim.add('cliport', {
      W: 720, H: 420, start: 12.6, narrowAt: 680,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          band1: [108, 8, 470, 190], band1T: [120, 184, 'Семантический поток: что\u00a0брать', 300],
          band2: [108, 212, 470, 162], band2T: [120, 360, 'Пространственный поток: где\u00a0брать', 300],
          cmd: [56, 36, 96, 40], cmdText: '«положи синий кубик в\u00a0миску»',
          rgb: [24, 94, 64], rgbLab: [56, 172, 'цвет, RGB', 90], rgbd: [22, 272, 64], dOff: 5, rgbdLab: [56, 354, 'цвет и глубина, RGB-D', 96],
          aCmd: [[104, 36], [120, 36]], tenc: [122, 16, 140, 40], tencT: 'энкодер текста CLIP', aVec: [[264, 36], [278, 36]],
          vec: [282, 29, 11, 14], vecLab: [378, 36, 'вектор команды', 96, 'left'],
          aRgb: [[90, 126], [120, 126]], ienc: [122, 100, 140, 52], iencT: 'энкодер картинок CLIP', iencS: 'ResNet-50, заморожен', aF7: [[264, 126], [284, 126]],
          f7: [300, 126, 28], f7Lab: [300, 152],
          trLab: [208, 242, 'сеть Transporter, обучается\u00a0с\u00a0нуля', 150],
          aRgbd: [[90, 300], [116, 300]], spEnc: [[144, 300, 50], [200, 300, 38], [248, 300, 28], [290, 300, 20]], encDir: [1, 0],
          sem: [[352, 126, 26], [414, 126, 34], [484, 126, 42]], semLink0: [[316, 126], [337, 126]], semLink: [[[367, 126], [395, 126]], [[433, 126], [461, 126]]],
          spDec: [[352, 300, 26], [414, 300, 34], [484, 300, 42]], spLink: [[[302, 300], [337, 300]], [[367, 300], [395, 300]], [[433, 300], [461, 300]]],
          lat: [[[352, 286], [352, 141]], [[414, 282], [414, 145]], [[484, 278], [484, 149]]], latLab: [536, 236, 'боковые связи', 78],
          mul: [[352, 84], [414, 84], [484, 84]], mulLink: [[[352, 92], [352, 111]], [[414, 92], [414, 107]], [[484, 92], [484, 103]]],
          dash: [[[306, 44], [352, 76]], [[326, 44], [414, 76]], [[346, 44], [484, 76]]], mulLab: [500, 84, 'умножение на\u00a0вектор', 76, 'left'],
          semOut: [[507, 126], [600, 126], [600, 186]], spOut: [[507, 300], [600, 300], [600, 214]], plus: [600, 200], plusLab: null,
          aPick: [[613, 200], [626, 200]], pick: [630, 160, 80], pickLab: [668, 148, 'карта «где взять»', 92],
          aPlace: [[600, 238], [600, 320], [626, 320]], place: [630, 280, 80], placeLab: [670, 374, 'карта «куда\u00a0положить»', 96],
          note: [666, 256, 'тем же способом по\u00a0вырезке и\u00a0сцене', 104],
          st: [14, 402, 600],
        });
      },
      narrow: {
        W: 360, H: 880,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            band1: [6, 8, 186, 560], band1T: [16, 22, 'Семантический поток: что\u00a0брать', 160],
            band2: [198, 8, 156, 560], band2T: [208, 22, 'Пространственный поток: где\u00a0брать', 140],
            cmd: [99, 72, 160, 36], cmdText: '«положи синий кубик в\u00a0миску»',
            rgb: [28, 214, 48], rgbLab: [52, 274, 'цвет, RGB', 70], rgbd: [250, 56, 48], dOff: 5, rgbdLab: [274, 120, 'цвет и глубина, RGB-D', 130],
            aCmd: [[99, 91], [99, 106]], tenc: [24, 108, 150, 38], tencT: 'энкодер текста CLIP', aVec: [[99, 147], [99, 160]],
            vec: [43, 163, 14, 14], vecTap: [[43, 170], [18, 170]], vecLab: [99, 188, 'вектор команды', 150],
            aRgb: [[78, 238], [88, 238]], ienc: [88, 212, 98, 52], iencT: 'энкодер картинок CLIP', iencS: 'заморожен', aF7: [[137, 266], [137, 282]],
            f7: [137, 298, 28], f7Lab: [102, 298, 'right'],
            trLab: [274, 168, 'сеть Transporter, обучается\u00a0с\u00a0нуля', 140],
            aRgbd: [[274, 186], [274, 204]], spEnc: [[274, 230, 46], [274, 280, 34], [274, 318, 24]], encDir: [0, 1],
            sem: [[137, 360, 26], [137, 426, 34], [137, 500, 42]], semLink0: [[137, 314], [137, 345]], semLink: [[[137, 375], [137, 407]], [[137, 445], [137, 477]]],
            spDec: [[274, 360, 26], [274, 426, 34], [274, 500, 42]], spLink: [[[274, 332], [274, 345]], [[274, 375], [274, 407]], [[274, 445], [274, 477]]],
            lat: [[[259, 360], [152, 360]], [[255, 426], [156, 426]], [[251, 500], [160, 500]]], latLab: [205, 344, 'боковые связи', 90],
            mul: [[78, 360], [78, 426], [78, 500]], mulLink: [[[86, 360], [122, 360]], [[86, 426], [118, 426]], [[86, 500], [114, 500]]],
            dash: [[[18, 170], [18, 360], [70, 360]], [[18, 170], [18, 426], [70, 426]], [[18, 170], [18, 500], [70, 500]]], mulLab: [24, 538, 'умножение на\u00a0вектор', 160, 'left'],
            semOut: [[137, 523], [137, 590], [168, 600]], spOut: [[274, 523], [274, 590], [192, 600]], plus: [180, 604], plusLab: [196, 621, 'сложение', 'left'],
            aPick: [[180, 616], [180, 632], [90, 632], [90, 655]], pick: [40, 660, 100], pickLab: [90, 774, 'карта «где взять»', 130],
            aPlace: [[146, 710], [214, 710]], place: [220, 660, 100], placeLab: [270, 774, 'карта «куда\u00a0положить»', 130],
            note: null,
            st: [14, 836, 332],
          });
        },
      },
    });
  })();
})();
