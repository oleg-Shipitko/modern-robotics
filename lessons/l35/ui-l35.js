/* =====================================================================
   ui-l35.js — урок 3.5 «Открытые VLA: Octo и OpenVLA». Интерактивы —
   миссии на живой сцене (shared/missions.js):
   1) дообучение мини-VLA на новую руку: все веса, LoRA и заморозка рядом,
      одна и та же новая сцена у четырёх моделей, успех по командам;
   2) голова действий: регрессия, токены и диффузия на столе с двумя
      мисками — ответы по одному, ползунок корзин и доли записей;
   3) таблицы OpenVLA по категориям с наведением и поиском строк;
   схемы на shared/anim.js: LoRA, устройство Octo и устройство OpenVLA
   (build.py не подключает flow.js урока, поэтому схемы — в этом файле).
   Движок — l35/engine.js (без DOM).
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение для автотестов: больше вычислений за кадр; на результаты не влияет
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Прогнать генератор обучения кусками по ~14 мс между кадрами, чтобы страница не замирала. */
async function runGen(gen, onEv) {
  for (;;) {
    const t0 = performance.now(), budget = 14 * SPEED.k;
    while (performance.now() - t0 < budget) { const r = gen.next(); if (r.done) return r.value; if (onEv && r.value !== undefined) onEv(r.value); }
    await nextFrame();
  }
}
/** Картинка движка (RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
const rgbCss = (id) => { const [r, g, b] = L21.COLORS[L21.CI[id]].rgb; return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`; };
const CMD_F = { red: 'красная', blue: 'синяя', green: 'зелёная' }, CMD_A = { red: 'красную', blue: 'синюю', green: 'зелёную' };
/** Канвас с двумя раскладками: широкая и узкая (телефон). Возвращает контекст, k и выбранную раскладку. */
function fit2(cv, wide, narrow, at) {
  const w = cv.getBoundingClientRect().width || wide.W, L = w < (at || 520) ? narrow : wide, id = L === wide ? 'w' : 'n';
  if (cv.dataset.layout !== id) { cv.style.aspectRatio = `${L.W} / ${L.H}`; cv.dataset.layout = id; }
  const r = HeroKit.fit(cv, L.W, L.H); return Object.assign(r, { L, narrow: L === narrow });
}
/** Кольцо вокруг предмета и крестик выбора на картинке стола (x0, y0 — угол, s — пикселей на единицу 96). */
function ring(c, x0, y0, s, q, col, lw) { c.beginPath(); c.arc(x0 + q.x * s, y0 + q.y * s, L21.RT * s * 1.25, 0, 7); c.strokeStyle = col; c.lineWidth = lw || 2; c.stroke(); }
function cross(c, x, y, r, col) { HeroKit.cross(c, x, y, r, '#ffffff', 5); HeroKit.cross(c, x, y, r, col, 2.6); }

/* =====================================================================
   Предобучение мини-VLA: идёт при загрузке страницы кусками
   ===================================================================== */
const Store = (() => {
  const E = L35; let base = null, zero = null, home = null, prog = 0; const subs = [];
  const ready = (async () => {
    await nextFrame();
    base = await runGen(E.pretrain({}), (ev) => { prog = Math.min(0.999, ev.step / ev.steps); subs.forEach((f) => f()); });
    zero = E.evaluate(base, E.DOMAINS.lab, E.LAB.nEval); home = E.evaluate(base, E.DOMAINS.home, E.LAB.nEval);
    prog = 1; subs.forEach((f) => f());
    return base;
  })();
  return { ready, get base() { return base; }, get zero() { return zero; }, get home() { return home; }, get prog() { return prog; }, on: (f) => subs.push(f) };
})();

/* =====================================================================
   1. Дообучение: все веса, LoRA и заморозка на новой руке
   ===================================================================== */
const LabFT = (() => {
  const E = L35, MODES = [['zero', 'Без дообучения'], ['full', 'Все веса'], ['lora', 'LoRA'], ['frozen', 'Заморозка']];
  const st = { n: 5, rank: 2, set: E.LAB.set, res: {}, ranks: null, sceneI: 0, busy: false, phase: '' };
  let ctl = null, bms = [], domBms = null;
  const evalScenes = () => E.evalSet(E.DOMAINS.lab, E.LAB.nEval);
  const cmdCount = (ev) => Object.fromEntries(E.CMD.map((c) => [c, ev.byCmd[c].ok]));
  function summary() {
    const R = st.res, done = !!(R.full && R.lora && R.frozen), z = Store.zero;
    const o = { n: st.n, rank: st.rank, set: st.set, done, ready: !!z, zero: z ? z.rate : null, ranks: st.ranks ? st.ranks.map((q) => ({ rank: q.rank, rate: q.ev.rate, trainable: q.info.trainable, share: q.info.share })) : null, ranksN: st.ranksN || null };
    for (const m of ['full', 'lora', 'frozen']) if (R[m]) { o[m] = R[m].ev.rate; o[m + 'Train'] = R[m].info.trainable; o[m + 'Share'] = R[m].info.share; }
    if (R.full) o.all = R.full.info.all;
    o.cmd = { zero: z ? cmdCount(z) : null }; for (const m of ['full', 'lora', 'frozen']) if (R[m]) o.cmd[m] = cmdCount(R[m].ev);
    if (done) { const arr = ['full', 'lora', 'frozen']; o.best = arr.reduce((a, b) => (R[b].ev.rate > R[a].ev.rate ? b : a), 'full'); o.loraShare = R.lora.info.share; o.loraTrain = R.lora.info.trainable; }
    return o;
  }
  /* ---------- сцены: робот из 2.1 и новая рука ---------- */
  function drawDom() {
    const cv = $('#fDom'); if (!domBms) { const a = E.scene(E.DOMAINS.home, 'red', 911), b = E.scene(E.DOMAINS.lab, 'red', 911); domBms = [{ sc: a, bm: bitmap(a.img, L21.TW, L21.TW) }, { sc: b, bm: bitmap(b.img, L21.TW, L21.TW) }]; }
    const { c, k, narrow, L } = fit2(cv, { W: 720, H: 170 }, { W: 360, H: 330 }), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, L.W, L.H);
    const items = [['Робот из урока 2.1', 'кубики, обычная камера', '«возьми красный кубик»'], ['Новая рука', 'банки, тёплая камера', '«возьми красную банку»']];
    items.forEach(([t1, t2, t3], i) => {
      const x0 = narrow ? 10 : 10 + i * 360, y0 = narrow ? 10 + i * 160 : 15, S = 140;
      c.imageSmoothingEnabled = false; c.drawImage(domBms[i].bm, x0, y0, S, S);
      c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(x0, y0, S, S);
      ring(c, x0, y0, S / L21.TW, domBms[i].sc.target, P.ink, 2.2);
      const tx = x0 + S + 14;
      HeroKit.label(c, k, t1, tx, y0 + 22, { align: 'left', px: 13, weight: 700, color: P.ink, haloColor: P.bg });
      HeroKit.label(c, k, t2, tx, y0 + 22 + 20 * Math.min(k, 1.6), { align: 'left', px: 11.5, color: P.ink2, haloColor: P.bg });
      HeroKit.label(c, k, t3, tx, y0 + 22 + 40 * Math.min(k, 1.6), { align: 'left', px: 11.5, color: P.ink3, haloColor: P.bg });
      HeroKit.label(c, k, i ? 'на ней модель дообучаем' : 'на нём модель предобучена', tx, y0 + 22 + 62 * Math.min(k, 1.6), { align: 'left', px: 11, color: i ? P.e2e : P.cl, weight: 650, haloColor: P.bg });
    });
  }
  /* ---------- одна новая сцена у четырёх моделей ---------- */
  const predCache = new Map();
  function pred(mode, i) {
    const R = mode === 'zero' ? (Store.base ? { m: Store.base } : null) : st.res[mode]; if (!R) return null;
    const key = mode + ':' + i; let p = predCache.get(key);
    if (!p || p.m !== R.m) { p = Object.assign(E.predict(R.m, evalScenes()[i]), { m: R.m }); predCache.set(key, p); }
    return p;
  }
  function draw() {
    const cv = $('#fCv'), { c, k, narrow, L } = fit2(cv, { W: 720, H: 272 }, { W: 360, H: 476 }), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, L.W, L.H);
    const set = evalScenes(), sc = set[st.sceneI]; if (!bms[st.sceneI]) bms[st.sceneI] = bitmap(sc.img, L21.TW, L21.TW);
    MODES.forEach(([mode, name], j) => {
      const S = narrow ? 160 : 168, x0 = narrow ? 12 + (j % 2) * 176 : 8 + j * 178, y0 = narrow ? 70 + Math.floor(j / 2) * 218 : 70, s = S / L21.TW;
      const R = mode === 'zero' ? Store.zero : st.res[mode] && st.res[mode].ev;
      const nm = mode === 'lora' ? `LoRA, ранг ${st.res.lora ? st.res.lora.rank : st.rank}` : name;
      HeroKit.label(c, k, nm, x0 + S / 2, y0 - 26, { px: 12, weight: 700, color: mode === 'zero' ? P.ink2 : P.ink, haloColor: P.bg });
      HeroKit.label(c, k, R ? `успех ${pc(R.rate)}` : mode === 'zero' ? 'предобучение…' : 'не дообучена', x0 + S / 2, y0 - 10, { px: 11, color: R ? P.ink2 : P.ink3, haloColor: P.bg });
      c.imageSmoothingEnabled = false; c.drawImage(bms[st.sceneI], x0, y0, S, S);
      const p = pred(mode, st.sceneI);
      if (p) {
        let mx = 0; for (const v of p.probs) if (v > mx) mx = v;
        c.fillStyle = P.e2e;
        for (let i = 0; i < p.probs.length; i++) { const a = p.probs[i] / mx; if (a < 0.1) continue; c.globalAlpha = 0.75 * a * a; c.fillRect(x0 + (i % L21.G) * L21.CELL * s, y0 + Math.floor(i / L21.G) * L21.CELL * s, L21.CELL * s + 0.5, L21.CELL * s + 0.5); }
        c.globalAlpha = 1;
      } else { c.fillStyle = P.bg; c.globalAlpha = 0.55; c.fillRect(x0, y0, S, S); c.globalAlpha = 1; }
      ring(c, x0, y0, s, sc.target, P.ink, 2);
      if (p) cross(c, x0 + p.x * s, y0 + p.y * s, 6, p.ok ? P.good : P.bad);
      c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(x0, y0, S, S);
      if (p) HeroKit.label(c, k, p.ok ? 'взяла нужную' : 'мимо', x0 + S / 2, y0 + S + 12, { px: 11, weight: 650, color: p.ok ? P.good : P.bad, haloColor: P.bg });
    });
    HeroKit.label(c, k, `Сцена ${st.sceneI + 1}. Команда: «возьми ${CMD_A[L21.COLORS[sc.word].id]} банку»`, L.W / 2, 15, { px: 12, weight: 650, color: P.ink2, haloColor: P.bg });
  }
  /* ---------- записи, результаты, подписи ---------- */
  function renderDemos() {
    const box = $('#fDemos'); box.innerHTML = '';
    const ds = E.labDemos(st.n, st.set);
    box.append(h('span', { class: 'd-h' }, `Записи новой руки (${st.n}):`));
    for (const d of ds) box.append(h('span', { class: 'd-chip', style: `--c:${rgbCss(d.color)}`, title: `«возьми ${CMD_A[d.color]} банку»` }));
    const cnt = {}; ds.forEach((d) => { cnt[d.color] = (cnt[d.color] || 0) + 1; });
    box.append(h('span', null, ' ' + E.CMD.map((c) => `${CMD_F[c]} — ${cnt[c] || 0}`).join(', ')));
  }
  function col(mode, name, R, best) {
    const el = h('div', { class: 'ft-col' + (best ? ' best' : '') });
    el.append(h('b', { class: 'ft-name' }, mode === 'lora' && R ? `${name}, ранг ${R.rank}` : name));
    const ev = mode === 'zero' ? Store.zero : R && R.ev, info = mode === 'zero' ? null : R && R.info;
    el.append(h('div', { class: 'ft-rate' + (ev ? '' : ' wait') }, ev ? pc(ev.rate) : st.busy && st.phase === mode ? 'учится…' : 'не дообучена'));
    el.append(h('div', { class: 'ft-par' }, mode === 'zero' ? 'ничего не учится' : info ? `учится ${fmtInt(info.trainable)} из ${fmtInt(info.all)} (${pc(info.share, 1)})` : '—'));
    if (ev) { const g = h('div', { class: 'ft-cmd' }); for (const cc of E.CMD) { const b = ev.byCmd[cc]; g.append(h('i', { style: `--c:${rgbCss(cc)}` }), h('div', { class: 'bar' }, h('span', { style: `width:${(b.rate * 100).toFixed(0)}%` })), h('em', null, `${b.ok}/${b.n}`)); } el.append(g); }
    return el;
  }
  function renderRes() {
    const box = $('#fRes'); box.innerHTML = '';
    const s = summary();
    box.append(h('div', { class: 'ft-hd' }, `Успех на ${E.LAB.nEval} новых сценах новой руки и по командам: сколько раз из 20 модель взяла нужную банку.`));
    for (const [mode, name] of MODES) box.append(col(mode, name, st.res[mode], s.done && s.best === mode));
    if (st.ranks) {
      const rb = h('div', { class: 'rank-box' }, h('div', { class: 'rk-h' }, `LoRA разных рангов, ${st.ranksN} записей: успех и сколько чисел учится`));
      for (const q of st.ranks) rb.append(h('div', { class: 'rank-row' }, h('span', null, `ранг ${q.rank}`), h('div', { class: 'bar' }, h('span', { style: `width:${(q.ev.rate * 100).toFixed(0)}%` })), h('b', null, pc(q.ev.rate, 1)), h('span', null, `${fmtInt(q.info.trainable)} · ${pc(q.info.share, 1)}`)));
      box.append(rb);
    }
  }
  function out() {
    const s = summary();
    $('#fSceneN').textContent = `сцена ${st.sceneI + 1} из ${E.LAB.nEval}`;
    $('#fSetN').textContent = `набор ${st.set}`;
    $('#fGo').disabled = st.busy || !s.ready; $('#fSet').disabled = st.busy;
    let t;
    if (!s.ready) t = 'Модель предобучается на роботе из урока 2.1 — это несколько секунд.';
    else if (st.busy) t = st.phase === 'rank' ? 'Дообучается LoRA разных рангов…' : 'Дообучение идёт…';
    else if (s.done) t = `${st.n} записей, набор ${st.set}. Все веса — <b>${pc(s.full)}</b>, LoRA — <b>${pc(s.lora)}</b>, заморозка — <b>${pc(s.frozen)}</b>; без дообучения было ${pc(s.zero)}. Листай сцены стрелками, чтобы увидеть, где модели ошибаются.`;
    else t = `Без дообучения модель берёт нужную банку в <b>${pc(s.zero)}</b> новых сцен. Дообучи её на ${st.n} записях новой руки.`;
    setOut($('#fOut'), t);
  }
  function status() {
    const p = Store.prog, bar = $('#fProg i');
    bar.style.width = (p * 100).toFixed(1) + '%';
    $('#fStatus').textContent = p < 1 ? `Предобучение на роботе из урока 2.1: ${Math.round(p * 400)} шагов из 400` : `Модель предобучена: на новых сценах робота из урока 2.1 она берёт названный кубик в ${pc(Store.home.rate)} случаев.`;
  }
  function render() { renderDemos(); renderRes(); draw(); out(); }
  /* ---------- обучение ---------- */
  async function trainOne(mode, rank) {
    const base = await Store.ready, total = E.FT[mode].steps;
    const gen = E.finetune(base, mode, E.labDemos(st.n, st.set), { seed: st.set, rank });
    const m = await runGen(gen, (ev) => { $('#fProg i').style.width = (ev.step / total * 100).toFixed(1) + '%'; $('#fStatus').textContent = `${MODES.find((x) => x[0] === mode)[1]}${mode === 'lora' ? ', ранг ' + rank : ''}: шаг ${ev.step} из ${total}, потеря ${fmt(ev.loss, 2)}`; });
    return { m, ev: E.evaluate(m, E.DOMAINS.lab, E.LAB.nEval), info: E.paramInfo(m), rank };
  }
  async function trainAll() {
    if (st.busy) return summary();
    await Store.ready; st.busy = true; st.res = {}; render();
    for (const mode of ['full', 'lora', 'frozen']) { st.phase = mode; renderRes(); out(); st.res[mode] = await trainOne(mode, st.rank); predCache.clear(); render(); }
    st.busy = false; st.phase = ''; status(); render(); if (ctl) ctl.update();
    return summary();
  }
  async function rankSweep() {
    if (st.busy) return summary();
    await Store.ready; st.busy = true; st.phase = 'rank'; st.ranks = []; st.ranksN = st.n; out();
    for (const r of [1, 2, 4, 8]) { st.ranks.push(await trainOne('lora', r)); renderRes(); }
    st.busy = false; st.phase = ''; status(); render(); if (ctl) ctl.update();
    return summary();
  }
  function setup(o) { if (st.busy) return; Object.assign(st, o); st.res = {}; st.ranks = null; predCache.clear(); segSet('#fN', st.n); segSet('#fR', st.rank); render(); if (ctl) ctl.update(); }
  function setScene(i) { st.sceneI = (i + E.LAB.nEval) % E.LAB.nEval; draw(); out(); }
  const api = {
    reset() { setup({ n: 5, rank: 2, set: E.LAB.set, sceneI: 0 }); },
    state: summary, trainAll, rankSweep, setup, setScene,
    ready: () => Store.ready.then(() => true),
  };
  const missions = [
    { short: '5 записей', title: 'Пять записей новой руки', text: 'Оператор записал на новой руке 5 сцен: четыре с командой «возьми красную банку» и одну — «синюю». Дообучи модель тремя способами и проверь на 60 новых сценах.',
      controls: ['scene'], onEnter: (X) => X.setup({ n: 5, rank: 2, set: L35.LAB.set }),
      bet: { q: 'какой способ возьмёт нужную банку в большем числе новых сцен?', options: ['Все веса: учится больше всего чисел', 'LoRA: добавка малого ранга к каждой матрице', 'Заморозка: учится только новая голова'], answer: (r) => ['full', 'lora', 'frozen'].indexOf(r.best) },
      action: { label: 'Дообучить тремя способами', run: (X) => X.trainAll() },
      criteria: [{ label: 'Три способа дообучены на 5 записях', test: (r) => r.done && r.n === 5 }, { label: 'Каждый способ лучше модели без дообучения', test: (r) => r.done && r.full > r.zero && r.lora > r.zero && r.frozen > r.zero }],
      explain: (r) => `Заморозка взяла нужную банку в ${pc(r.frozen)} новых сцен, LoRA — в ${pc(r.lora)}, все веса — в ${pc(r.full)}. Посмотри на строки по командам под сценой. Все веса подняли «красную» с ${r.cmd.zero.red} до ${r.cmd.full.red} из 20, но «синюю» опустили с ${r.cmd.zero.blue} до ${r.cmd.full.blue}: признаки цвета подогнаны под команду, которой в записях больше. Заморозка признаков не трогала: «синяя» — ${r.cmd.frozen.blue} из 20. «Зелёной» в записях нет, и её не выучил ни один способ.` },
    { short: '40 записей', title: 'Сорок записей', text: 'Оператор записал ещё 35 сцен: всего 40 — 16 с «красной», 12 с «синей» и 12 с «зелёной». Первые пять — те же. Дообучи модель тремя способами заново.',
      controls: ['scene'], onEnter: (X) => X.setup({ n: 40, rank: 2, set: L35.LAB.set }),
      bet: { q: 'что изменится по сравнению с пятью записями?', options: ['Заморозка останется лучшей: она меньше всех переобучается', 'Все веса и LoRA обгонят заморозку', 'Все три сравняются: данных хватит всем'], answer: (r) => (r.best === 'frozen' ? 0 : r.full > r.frozen && r.lora > r.frozen ? 1 : 2) },
      action: { label: 'Дообучить тремя способами', run: (X) => X.trainAll() },
      criteria: [{ label: 'Три способа дообучены на 40 записях', test: (r) => r.done && r.n === 40 }, { label: 'Все веса и LoRA лучше заморозки', test: (r) => r.done && r.full > r.frozen && r.lora > r.frozen }, { label: 'LoRA учит меньше 15% чисел модели', test: (r) => r.done && r.loraShare < 0.15 }],
      explain: (r) => `Все веса — ${pc(r.full)}, LoRA — ${pc(r.lora)}, заморозка — ${pc(r.frozen)}. LoRA учит ${fmtInt(r.loraTrain)} чисел из ${fmtInt(r.all)} (${pc(r.loraShare, 1)}), а результат как у всех весов. В OpenVLA так же: 68,2% у LoRA против 69,7% у всех весов при 1,4% обучаемых параметров. Заморозка упёрлась в предел: «красную» она берёт ${r.cmd.frozen.red} раз из 20, а все веса — ${r.cmd.full.red}. Исправить признаки цвета, которые испортила новая камера, новая голова не может. В таблице OpenVLA замороженное зрение дало 47,0%.` },
    { short: 'Ранг', title: 'Какой ранг нужен добавке', text: 'Ранг r — сколько чисел проходит между матрицами A и B. Дообучи LoRA рангов 1, 2, 4 и 8 на тех же 40 записях и сравни успех и число обучаемых чисел.',
      controls: ['scene'], onEnter: (X) => X.setup({ n: 40, rank: 2, set: L35.LAB.set }),
      bet: { q: 'что даст ранг 8 вместо ранга 1?', options: ['Заметно больше успехов: обучаемых чисел в 7 раз больше', 'Почти столько же: добавке хватает малого ранга', 'Меньше успехов: модель переобучится'], answer: (r) => { const a = r.ranks[0].rate, b = r.ranks[3].rate; return Math.abs(b - a) <= 0.05 ? 1 : b > a ? 0 : 2; } },
      action: { label: 'Дообучить LoRA четырёх рангов', run: (X) => X.rankSweep() },
      criteria: [{ label: 'Четыре ранга дообучены на 40 записях', test: (r) => !!r.ranks && r.ranks.length === 4 && r.ranksN === 40 }, { label: 'Разница между рангами не больше 5 процентных пунктов', test: (r) => !!r.ranks && Math.max(...r.ranks.map((q) => q.rate)) - Math.min(...r.ranks.map((q) => q.rate)) <= 0.05 }],
      explain: (r) => `Успех при рангах 1, 2, 4 и 8: ${r.ranks.map((q) => pc(q.rate, 1)).join(', ')}. Обучаемых чисел — от ${fmtInt(r.ranks[0].trainable)} до ${fmtInt(r.ranks[3].trainable)}, от ${pc(r.ranks[0].share, 1)} до ${pc(r.ranks[3].share, 1)} модели. Похоже, изменению, которое нужно для новой руки, хватает одного направления в каждой матрице. В OpenVLA ранги 32 и 64 дали одинаковые 68,2%, и авторы советуют ранг 32.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число записей, ранг и набор записей и дообучай заново. Найди набор из 5 записей, на котором все веса обходят заморозку, и посмотри по командам, чем он отличается.', final: true, controls: ['scene', 'n', 'rank', 'set', 'go'] },
  ];
  function init() {
    segBind('#fN', (v) => setup({ n: +v })); segBind('#fR', (v) => { if (st.busy) return; st.rank = +v; segSet('#fR', v); delete st.res.lora; predCache.clear(); render(); if (ctl) ctl.update(); });
    $('#fSet').addEventListener('click', () => setup({ set: st.set % 7 + 1 }));
    $('#fGo').addEventListener('click', () => trainAll());
    $('#fPrev').addEventListener('click', () => setScene(st.sceneI - 1)); $('#fNext').addEventListener('click', () => setScene(st.sceneI + 1));
    ctl = mountMissions('#fMis', missions, api, { controls: { scene: '#wrapFScene', n: '#wrapFN', rank: '#wrapFR', set: '#wrapFSet', go: '#fGo' }, scene: '#fCv' });
    Store.on(() => { status(); if (Store.prog >= 1) { predCache.clear(); render(); if (ctl) ctl.update(); } });
    status(); render(); drawDom(); redrawOn(() => { draw(); drawDom(); });
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Голова действий: регрессия, токены и диффузия на столе с двумя мисками
   ===================================================================== */
const LabHead = (() => {
  const E = L35, W = 440, H = 436, T0 = { x: 14, y: 52, S: 356 }, HEADS = [['mse', 'Регрессия'], ['tok', 'Токены'], ['diff', 'Диффузия']];
  const st = { K: 24, nLeft: 21, heads: ['mse'], ans: { mse: [], tok: [], diff: [] }, diff: null, diffKey: null, diffIdx: 0, path: null, busy: false, msg: '' };
  let ctl = null; const dsCache = {};
  const ds = () => dsCache[st.nLeft] || (dsCache[st.nLeft] = E.placeDemos(40, st.nLeft));
  const tokNow = () => E.headTokens(ds(), st.K);
  const near = (p) => Math.min(...E.BOWLS.map((b) => Math.hypot(p.x - b.x, p.y - b.y)));
  const cnt = (a) => ({ n: a.length, left: a.filter((q) => q.b === 0).length, right: a.filter((q) => q.b === 1).length, miss: a.filter((q) => q.b === -1).length });
  function summary() {
    const t = tokNow(), m = E.headMSE(ds());
    return { K: st.K, nLeft: st.nLeft, heads: st.heads.slice(), mse: cnt(st.ans.mse), tok: cnt(st.ans.tok), diff: cnt(st.ans.diff), tokBowl: E.whichBowl(t), tokMiss: E.whichBowl(t) === -1, tokDist: near(t), tokX: t.x, tokY: t.y, tokW: t.w,
      pL: t.px[Math.floor(E.BOWLS[0].x / t.w)], pR: t.px[Math.floor(E.BOWLS[1].x / t.w)], mseX: m.x, mseY: m.y, mseBowl: E.whichBowl(m), trained: st.diffKey === st.nLeft };
  }
  /* ---------- сцена ---------- */
  const sx = (v) => T0.x + v * T0.S / L21.TW, sy = (v) => T0.y + v * T0.S / L21.TW, sc = T0.S / L21.TW;
  function square(c, x, y, r, col) { c.fillStyle = col; c.fillRect(x - r, y - r, 2 * r, 2 * r); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.strokeRect(x - r, y - r, 2 * r, 2 * r); }
  function diamond(c, x, y, r, col) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); }
  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); }
  function draw() {
    const { c, k } = HeroKit.fit($('#hCv'), W, H), P = pal(), narrow = k > 1.5, show = new Set(st.heads), t = tokNow();
    const tokOpen = show.has('tok') && (st.ans.tok.length > 0 || st.heads.length === 1);   // корзины и вероятности — только после ответа, чтобы не выдать ставку
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = P.surf; c.fillRect(T0.x, T0.y, T0.S, T0.S);
    c.save(); c.beginPath(); c.rect(T0.x, T0.y, T0.S, T0.S); c.clip();
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); for (let v = 8; v < 96; v += 8) { c.moveTo(sx(v), T0.y); c.lineTo(sx(v), T0.y + T0.S); c.moveTo(T0.x, sy(v)); c.lineTo(T0.x + T0.S, sy(v)); } c.stroke();
    if (tokOpen) {                                           // корзины токенов и выбранная клетка
      c.fillStyle = P.cl; c.globalAlpha = 0.1; c.fillRect(sx(t.bx * t.w), T0.y, t.w * sc, T0.S); c.globalAlpha = 0.16; c.fillRect(sx(t.bx * t.w), sy(t.by * t.w), t.w * sc, t.w * sc); c.globalAlpha = 1;
      c.setLineDash([3, 4]); c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < st.K; i++) { const v = i * t.w; c.moveTo(sx(v), T0.y); c.lineTo(sx(v), T0.y + T0.S); c.moveTo(T0.x, sy(v)); c.lineTo(T0.x + T0.S, sy(v)); } c.stroke(); c.setLineDash([]);
    }
    E.BOWLS.forEach((b, i) => {
      c.beginPath(); c.arc(sx(b.x), sy(b.y), E.BOWL_R * sc, 0, 7); c.fillStyle = P.bg; c.fill(); c.lineWidth = 3.5; c.strokeStyle = P.ink3; c.stroke();
      c.beginPath(); c.arc(sx(b.x), sy(b.y), E.BOWL_R * sc * 0.62, 0, 7); c.lineWidth = 1.2; c.stroke();
      HeroKit.label(c, k, narrow ? (i ? 'правая' : 'левая') : (i ? 'правая миска' : 'левая миска'), sx(b.x), sy(b.y) + (i ? 1 : -1) * (E.BOWL_R * sc + 12), { px: 11, color: P.ink2, haloColor: P.surf });
    });
    for (const d of ds()) { c.beginPath(); c.arc(sx(d.x), sy(d.y), 2.3, 0, 7); c.fillStyle = P.ink3; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1; }
    if (st.path && st.path.length > 1) { c.setLineDash([4, 3]); c.strokeStyle = P.e2e; c.lineWidth = 1.6; c.beginPath(); st.path.forEach((p, i) => (i ? c.lineTo(sx(p.x), sy(p.y)) : c.moveTo(sx(p.x), sy(p.y)))); c.stroke(); c.setLineDash([]); const p0 = st.path[0]; c.beginPath(); c.arc(sx(p0.x), sy(p0.y), 3, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 1.4; c.stroke(); }
    for (const q of st.ans.diff) dot(c, sx(q.x), sy(q.y), 4.6, P.e2e);
    if (st.ans.tok.length) { const q = st.ans.tok[0]; diamond(c, sx(q.x), sy(q.y), 7, P.cl); HeroKit.label(c, k, '×' + st.ans.tok.length, sx(q.x) + 11, sy(q.y) - 9, { px: 11, weight: 700, align: 'left', color: P.cl, haloColor: P.surf }); }
    else if (show.has('tok') && !show.has('mse')) diamond(c, sx(t.x), sy(t.y), 7, P.cl);
    if (st.ans.mse.length) { const q = st.ans.mse[0]; square(c, sx(q.x), sy(q.y), 5.5, P.ink2); HeroKit.label(c, k, '×' + st.ans.mse.length, sx(q.x) + 10, sy(q.y) + 10, { px: 11, weight: 700, align: 'left', color: P.ink2, haloColor: P.surf }); }
    c.restore();
    c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(T0.x, T0.y, T0.S, T0.S);
    if (tokOpen) {                                           // вероятности токенов x и y
      let mx = 1e-9; for (const v of t.px) mx = Math.max(mx, v);
      for (let i = 0; i < st.K; i++) { const hh = t.px[i] / mx * 34; if (hh < 0.5) continue; c.fillStyle = P.cl; c.globalAlpha = i === t.bx ? 0.95 : 0.45; c.fillRect(sx(i * t.w) + 1, T0.y - 4 - hh, t.w * sc - 2, hh); }
      let my = 1e-9; for (const v of t.py) my = Math.max(my, v);
      for (let i = 0; i < st.K; i++) { const ww = t.py[i] / my * 46; if (ww < 0.5) continue; c.fillStyle = P.cl; c.globalAlpha = i === t.by ? 0.95 : 0.45; c.fillRect(T0.x + T0.S + 4, sy(i * t.w) + 1, ww, t.w * sc - 2); }
      c.globalAlpha = 1;
      HeroKit.label(c, k, narrow ? 'токен x' : 'вероятности токена x', T0.x + 4, 10, { px: 11, align: 'left', color: P.cl, haloColor: P.bg });
      HeroKit.label(c, k, narrow ? 'токен y при x' : 'вероятности токена y при выбранном x', W - 4, T0.y + T0.S + 16, { px: 11, align: 'right', color: P.cl, haloColor: P.bg });
    } else HeroKit.label(c, k, 'Стол сверху: кубик в захвате, положить в любую миску', T0.x + 4, 22, { px: 12, align: 'left', color: P.ink2, haloColor: P.bg });
  }
  function renderTally() {
    const box = $('#hTally'); box.innerHTML = '';
    for (const [id, name] of HEADS) {
      const a = st.ans[id], n = cnt(a), colEl = h('div', { class: 'h-col', hidden: !st.heads.includes(id) });
      colEl.append(h('b', null, name), h('div', { class: 'h-n' }, n.n ? `ответов ${n.n}: в левой ${n.left}, в правой ${n.right}, мимо ${n.miss}` : 'ещё не спрашивали'));
      const chips = h('div', { class: 'h-chips' }); for (const q of a) chips.append(h('span', { class: q.b === 0 ? 'l' : q.b === 1 ? 'r' : 'm' }, q.b === 0 ? 'Л' : q.b === 1 ? 'П' : '✗'));
      colEl.append(chips); box.append(colEl);
    }
  }
  function out() {
    const s = summary();
    setOut($('#hOut'), st.msg || `Записей ${40}: в левой миске ${s.nLeft}, в правой ${40 - s.nLeft}. Токены: ${s.K} ${plural(s.K, 'корзина', 'корзины', 'корзин')} на ось, корзина шириной ${fmt(s.tokW, 1)} клетки.`);
    $('#hAsk').disabled = st.busy; $('#hClear').disabled = st.busy;
  }
  function render() { draw(); renderTally(); out(); }
  /* ---------- вопросы к головам ---------- */
  async function ensureDiff() {
    if (st.diffKey === st.nLeft && st.diff) return st.diff;
    st.msg = 'Диффузионная голова обучается на 40 записях…'; out();
    st.diff = await runGen(E.diffTrain(ds()), (ev) => { st.msg = `Диффузионная голова обучается: шаг обучения ${ev.it} из ${ev.iters}, потеря ${fmt(ev.loss, 3)}`; out(); });
    st.diffKey = st.nLeft; st.diffIdx = 0; st.msg = ''; return st.diff;
  }
  async function askOne(id) {
    if (id === 'mse') { const p = E.headMSE(ds()); st.ans.mse.push({ x: p.x, y: p.y, b: E.whichBowl(p) }); render(); await wait(70); return; }
    if (id === 'tok') { const p = tokNow(); st.ans.tok.push({ x: p.x, y: p.y, b: E.whichBowl(p) }); render(); await wait(70); return; }
    const m = await ensureDiff(), s = E.diffSample(m, 1000 + st.diffIdx++);
    for (let j = 1; j <= s.path.length; j++) { st.path = s.path.slice(0, j); draw(); await wait(18); }
    st.ans.diff.push({ x: s.x, y: s.y, b: E.whichBowl(s) }); render();
  }
  async function ask(id, n) {
    if (st.busy) return summary(); st.busy = true; out();
    for (let i = 0; i < n; i++) for (const hd of (id === 'all' ? st.heads : [id])) await askOne(hd);
    st.busy = false; render(); if (ctl) ctl.update();
    return summary();
  }
  function clear() { st.ans = { mse: [], tok: [], diff: [] }; st.path = null; st.diffIdx = 0; render(); if (ctl) ctl.update(); }
  function setK(v) { st.K = Math.round(v); $('#hK').value = st.K; syncRange($('#hK'), String(st.K)); st.ans.tok = []; render(); if (ctl) ctl.update(); }
  function setShare(v) { st.nLeft = Math.round(v); $('#hS').value = st.nLeft; syncRange($('#hS'), `${st.nLeft} из 40`); st.ans = { mse: [], tok: [], diff: [] }; st.path = null; st.diffIdx = 0; render(); if (ctl) ctl.update(); }
  function prepare(o) { if (st.busy) return; st.heads = o.heads; setK(o.K || 24); setShare(o.nLeft == null ? 21 : o.nLeft); clear(); }
  const api = {
    reset() { prepare({ heads: ['mse'] }); }, state: summary, ask, clear, setK, setShare, prepare,
  };
  const missions = [
    { short: 'Регрессия', title: 'Спроси регрессию', text: 'Голова-регрессия выдаёт точку на столе. Операторы клали кубик в левую миску 21 раз из 40, в правую — 19. Спроси регрессию 10 раз.',
      onEnter: (X) => X.prepare({ heads: ['mse'] }),
      bet: { q: 'куда регрессия положит кубик?', options: ['В левую миску: туда клали чаще', 'Между мисками, на стол', 'То в одну миску, то в другую'], answer: (r) => (r.mse.miss === r.mse.n ? 1 : r.mse.left === r.mse.n ? 0 : 2) },
      action: { label: 'Спросить регрессию 10 раз', run: (X) => X.ask('mse', 10) },
      criteria: [{ label: '10 ответов регрессии', test: (r) => r.mse.n >= 10 }, { label: 'Ни один ответ не попал в миску', test: (r) => r.mse.n > 0 && r.mse.miss === r.mse.n }],
      explain: (r) => `Все 10 ответов — одна точка (${fmt(r.mseX, 1)}; ${fmt(r.mseY, 1)}) клетки, на столе между мисками. Оптимум среднего квадрата ошибки — среднее записей, а среднее 21 точки у левой миски и 19 у правой лежит посередине. Это та же ошибка, что у Ады с чайником в уроке 1.3. У Octo с такой головой успех был 35%, с диффузионной — 83%.` },
    { short: 'Токены', title: 'Спроси токены', text: 'Голова с токенами делит стол на 24 корзины по каждой оси, выдаёт сначала самый вероятный токен x, потом самый вероятный токен y при этом x. После ответа над столом и справа появятся вероятности токенов. Спроси токены 10 раз.',
      onEnter: (X) => X.prepare({ heads: ['mse', 'tok'] }),
      bet: { q: 'что ответят токены на 10 вопросов?', options: ['То левую миску, то правую, как в записях', 'Всегда одну и ту же миску', 'Точку между мисками, как регрессия'], answer: (r) => (r.tok.miss === r.tok.n ? 2 : r.tok.left === r.tok.n || r.tok.right === r.tok.n ? 1 : 0) },
      action: { label: 'Спросить токены 10 раз', run: (X) => X.ask('tok', 10) },
      criteria: [{ label: '10 ответов токенов', test: (r) => r.tok.n >= 10 }, { label: 'Все ответы — в одной и той же миске', test: (r) => r.tok.n > 0 && (r.tok.left === r.tok.n || r.tok.right === r.tok.n) }],
      explain: (r) => `У корзины x левой миски вероятность ${fmt(r.pL, 3)}, у правой — ${fmt(r.pR, 3)}: выигрывает левая. Токен y выбирают, уже зная x, а при этом x все записи — у левой миски. Ответ всегда один — центр корзины (${fmt(r.tokX, 1)}; ${fmt(r.tokY, 1)}), в ${fmt(r.tokDist, 1)} клетки от центра миски. В правую миску эта голова не положит кубик никогда, хотя операторы клали туда почти в половине записей. Среднего токены не выдают, и кубик попадает в правильную миску, только всегда в одну и ту же.` },
    { short: 'Диффузия', title: 'Спроси диффузию', text: 'Диффузионная голова начинает со случайной точки и за 20 шагов денойзинга убирает шум. Сначала она обучится на тех же 40 записях — это пара секунд. Спроси её 12 раз.',
      onEnter: (X) => X.prepare({ heads: ['mse', 'tok', 'diff'] }),
      bet: { q: 'что ответит диффузия на 12 вопросов?', options: ['Всегда левую миску: туда клали чаще', 'То одну миску, то другую', 'Точку между мисками'], answer: (r) => (r.diff.left >= 3 && r.diff.right >= 3 ? 1 : r.diff.left > r.diff.right ? 0 : 2) },
      action: { label: 'Спросить диффузию 12 раз', run: (X) => X.ask('diff', 12) },
      criteria: [{ label: '12 ответов диффузии', test: (r) => r.diff.n >= 12 }, { label: 'В каждой миске хотя бы 3 ответа', test: (r) => r.diff.left >= 3 && r.diff.right >= 3 }, { label: 'Мимо мисок не больше 2 ответов', test: (r) => r.diff.n >= 12 && r.diff.miss <= 2 }],
      explain: (r) => `Из 12 ответов ${r.diff.left} — в левой миске, ${r.diff.right} — в правой, ${r.diff.miss} — мимо. Каждый ответ начинается со своего шума, и денойзинг приводит его к одной из мисок: голова выучила распределение записей с двумя пиками, а не одну точку. Пунктир — путь последнего ответа за 20 шагов денойзинга. Сеть маленькая и обучена за пару секунд, поэтому изредка ответ останавливается между мисками.` },
    { short: 'Корзины', title: 'Сколько корзин нужно токенам', text: 'Ответ токенов — центр корзины, и точнее ширины корзины он быть не может. Уменьшай число корзин на ось и найди, при каком числе ответ токенов выходит за край миски.',
      controls: ['K'], onEnter: (X) => X.prepare({ heads: ['tok'] }),
      criteria: [{ label: 'Ответ токенов — мимо миски', test: (r, s) => s.tokMiss }],
      hint: 'Ползунок «Корзин на ось» — под сценой. Синий ромб — ответ токенов, пунктир на столе — границы корзин.',
      explain: (r) => `При ${r.K} ${plural(r.K, 'корзине', 'корзинах', 'корзинах')} на ось ширина корзины — ${fmt(r.tokW, 1)} клетки, и центр выбранной корзины оказался в ${fmt(r.tokDist, 1)} клетки от центра миски, дальше её края в 7 клеток. Чем меньше корзин, тем грубее действие. В RT-2 и OpenVLA по 256 корзин на ось. Голова Octo с таким же числом корзин, по словам авторов, действовала решительно, но неточно и часто промахивалась при захвате.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй долю записей в левой миске и число корзин, спрашивай все головы. Найди долю, при которой токены переходят в правую миску, и посмотри, как при этом меняются ответы диффузии.', final: true, controls: ['K', 'share', 'ask', 'clear'], onEnter: (X) => X.prepare({ heads: ['mse', 'tok', 'diff'] }) },
  ];
  function init() {
    $('#hK').addEventListener('input', (e) => { if (!st.busy) setK(+e.target.value); });
    $('#hS').addEventListener('input', (e) => { if (!st.busy) setShare(+e.target.value); });
    $('#hAsk').addEventListener('click', () => ask('all', 1));
    $('#hClear').addEventListener('click', () => { if (!st.busy) clear(); });
    syncRange($('#hK'), '24'); syncRange($('#hS'), '21 из 40');
    legend('#hLegend', [['миска — правильная цель', 'var(--ink-3)', 'ring'], ['запись оператора', 'var(--ink-3)', 'dot'], ['ответ регрессии', 'var(--ink-2)', 'sq'], ['ответ токенов', 'var(--classic)', 'dia'], ['ответ диффузии', 'var(--e2e)', 'circ'], ['путь ответа диффузии от шума', 'var(--e2e)', 'dash'], ['корзины и вероятности токенов', 'var(--classic)', 'patch']]);
    ctl = mountMissions('#hMis', missions, api, { controls: { K: '#wrapHK', share: '#wrapHS', ask: '#hAsk', clear: '#hClear' }, scene: '#hCv' });
    render(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Таблицы OpenVLA: категории задач, наведение и поиск строк
   ===================================================================== */
const LabTbl = (() => {
  const E = L35, st = { sel: null, hover: null, sumDone: false };
  let ctl = null;
  const bridge = E.TBL.filter((r) => r.robot === 'bridge'), google = E.TBL.filter((r) => r.robot === 'google');
  const ROWS = [
    { g: 'WidowX · BridgeData V2 · 17 задач по 10 попыток' }, ...bridge.map((r) => ({ id: r.id, name: r.name, note: r.note, rows: [r] })), { id: 'bridge', name: 'Все 17 задач', rows: bridge, sum: true },
    { g: 'Мобильный манипулятор Google · 12 задач по 5 попыток' }, ...google.map((r) => ({ id: r.id, name: r.name, note: r.note, rows: [r] })), { id: 'google', name: 'Все 12 задач', rows: google, sum: true },
    { g: 'Обе платформы' }, { id: 'all', name: 'Все 29 задач', rows: E.TBL, sum: true },
  ];
  const rowById = (id) => ROWS.find((r) => r.id === id);
  function summary() {
    const r = st.sel ? rowById(st.sel) : null, t = r ? E.tblRate(r.rows) : null;
    return { sel: st.sel, name: r ? r.name : null, sum: r ? !!r.sum : false, rates: t ? t.rates : null, succ: t ? t.succ : null, trials: t ? t.trials : 0,
      rt2xWins: !!t && t.rates[2] > t.rates[3] + 1e-9, octoLoses: !!t && t.rates[1] < t.rates[0] - 1e-9, sumDone: st.sumDone };
  }
  function render() {
    const box = $('#tTbl'); box.innerHTML = '';
    const hd = h('div', { class: 'vr vh' }, h('div', { class: 'vn' }, 'Категория задач'));
    for (const m of E.MODELS) hd.append(h('div', { class: 'vm' }, m.name, h('small', { class: m.open ? null : 'cl' }, `${m.params} · ${m.open ? 'открыта' : 'закрыта'}`)));
    box.append(hd);
    for (const row of ROWS) {
      if (row.g) { box.append(h('div', { class: 'vr vg' }, row.g)); continue; }
      const t = E.tblRate(row.rows), top = Math.max(...t.rates);
      const el = h('div', { class: 'vr' + (row.sum ? ' sum' : '') + (st.sel === row.id ? ' sel' : ''), 'data-id': row.id, tabindex: '0', role: 'button' }, h('div', { class: 'vn' }, row.name, row.note ? h('small', null, row.note) : null));
      t.rates.forEach((v, k) => el.append(h('div', { class: 'vc' + (Math.abs(v - top) < 1e-9 ? ' top' : ''), style: '--c:var(--classic)' }, h('i', { style: `width:${(v * 100).toFixed(1)}%` }), h('b', null, fmt(v * 100, 1)))));
      el.addEventListener('mouseenter', () => { st.hover = row.id; detail(); });
      el.addEventListener('mouseleave', () => { st.hover = null; detail(); });
      el.addEventListener('click', () => select(row.id));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(row.id); } });
      box.append(el);
    }
    detail(); out();
  }
  function detail() {
    const box = $('#tDetail'); box.innerHTML = '';
    const row = rowById(st.hover || st.sel); if (!row) return;
    box.append(h('div', { class: 'td-h' }, row.sum ? `${row.name}: категории` : `${row.name}: задачи и число успешных попыток из ${row.rows[0].trials}`));
    const tb = h('table'), tr = h('tr', null, h('th', null, row.sum ? 'категория' : 'задача')); E.MODELS.forEach((m) => tr.append(h('th', null, m.name))); tb.append(tr);
    const lines = row.sum ? row.rows.map((r) => [r.name, E.tblRate([r]).rates.map((v) => fmt(v * 100, 1) + '%'), E.tblRate([r]).rates]) : row.rows[0].tasks.map((t) => [t[0], t.slice(1).map((v) => fmt(v, v % 1 ? 1 : 0)), t.slice(1)]);
    for (const [name, txt, vals] of lines) { const mx = Math.max(...vals), r2 = h('tr', null, h('td', null, name)); txt.forEach((v, k) => r2.append(h('td', { class: vals[k] === mx ? 'top' : null }, v))); tb.append(r2); }
    box.append(tb);
  }
  function out() {
    const s = summary();
    setOut($('#tOut'), s.sel ? `«${s.name}»: RT-1-X — ${fmt(s.rates[0] * 100, 1)}%, Octo — ${fmt(s.rates[1] * 100, 1)}%, RT-2-X — ${fmt(s.rates[2] * 100, 1)}%, OpenVLA — <b>${fmt(s.rates[3] * 100, 1)}%</b>.` : 'Выбери строку: нажми её или наведи на неё мышь.');
  }
  function select(id) { st.sel = id; render(); if (ctl) ctl.update(); }
  async function sumAll() { select('all'); st.sumDone = true; await wait(250); const s = summary(); return Object.assign(s, { diff: s.rates[3] - s.rates[2] }); }
  const api = { reset() { st.sel = null; st.hover = null; st.sumDone = false; render(); }, state: summary, select, sumAll };
  const missions = [
    { short: 'RT-2-X сильнее', title: 'Где закрытая модель сильнее', text: 'В целом OpenVLA сильнее RT-2-X. Найди категорию задач, в которой RT-2-X на 55 млрд параметров всё-таки выполнила больше попыток, и нажми её.',
      onEnter: (X) => X.reset(),
      criteria: [{ label: 'Выбрана строка, где у RT-2-X успех выше, чем у OpenVLA', test: (r, s) => s.rt2xWins }],
      hint: 'Смотри на два правых столбца. Подсказка: категория про понятия, которых нет в данных роботов.',
      explain: (r) => `«${r.name}»: RT-2-X — ${fmt(r.rates[2] * 100, 1)}%, OpenVLA — ${fmt(r.rates[3] * 100, 1)}%. Это задачи с предметами, командами и понятиями, которых нет в данных робота. RT-2-X дообучали на смеси действий робота и веб-данных, и знание из интернета у неё сохранилось лучше; OpenVLA дообучали только на данных роботов.` },
    { short: 'Octo слабее', title: 'Где Octo хуже RT-1-X', text: 'Octo обучена на 800 тысячах эпизодов, RT-1-X — на 350 тысячах. Найди строку, в которой Octo всё же выполнила меньше попыток, чем RT-1-X.',
      onEnter: (X) => X.reset(),
      criteria: [{ label: 'Выбрана строка, где у Octo успех ниже, чем у RT-1-X', test: (r, s) => s.octoLoses }],
      hint: 'Сравни два левых столбца; таких строк несколько, в том числе у робота Google.',
      explain: (r) => `«${r.name}»: Octo — ${fmt(r.rates[1] * 100, 1)}%, RT-1-X — ${fmt(r.rates[0] * 100, 1)}%. Обе модели в этих тестах справлялись плохо: часто брали не тот предмет, когда рядом лежали другие, а иногда просто водили рукой. Авторы OpenVLA нарочно сделали тесты труднее, чем в прошлых статьях, — в статье Octo на знакомых задачах WidowX было 85%. Одна цифра без условий теста мало говорит о модели.` },
    { short: 'Итог', title: 'Сложи все 29 задач', text: 'В аннотации статьи сказано, на сколько OpenVLA сильнее RT-2-X по всем задачам на двух роботах. Сложи успехи по всем 29 задачам.',
      onEnter: (X) => X.reset(),
      bet: { q: 'на сколько OpenVLA впереди RT-2-X по всем 29 задачам?', options: ['Почти поровну: на роботе Google они рядом', 'На 16,5 процентного пункта', 'В 7 раз: во столько у неё меньше параметров'], answer: (r) => (Math.abs(r.diff) < 0.05 ? 0 : Math.abs(r.diff - 0.165) < 0.002 ? 1 : 2) },
      action: { label: 'Сложить все 29 задач', run: (X) => X.sumAll() },
      criteria: [{ label: 'Сложены 230 попыток', test: (r) => r.trials === 230 }, { label: 'OpenVLA впереди RT-2-X', test: (r) => r.diff > 0 }],
      explain: (r) => `OpenVLA — ${fmt(r.succ[3], 0)} успешных попыток из 230, ${fmt(r.rates[3] * 100, 1)}%; RT-2-X — ${fmt(r.succ[2], 0)}, ${fmt(r.rates[2] * 100, 1)}%. Разница ${fmt(r.diff * 100, 1)} процентного пункта — та самая из аннотации. Параметров у OpenVLA в 7 раз меньше: 7 млрд против 55 млрд. Почти весь отрыв — на WidowX: на роботе Google модели в пределах погрешности, 85,0% и 78,3%.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Наводи на строки и смотри задачи. Найди задачу, в которой Octo обошла все три другие модели, и подумай, чем она отличается от остальных.', final: true, onEnter: (X) => X.reset() },
  ];
  function init() { render(); ctl = mountMissions('#tMis', missions, api, { scene: '#tTbl' }); return ctl; }
  return { init, api, st };
})();

/* =====================================================================
   Схема: слой с LoRA — W заморожена, учатся A и B
   ===================================================================== */
Anim.add('lora', (() => {
  const T = 11, D_IN = 29, D_OUT = 40, R = 2;
  function scheme(c, k, t, P, A, G) {
    const { rect, line, circle, arrow, lab, alpha, seg, ease, lerp } = A, u = ((t % T) + T) % T;
    const fwd = seg(u, 0.3, 3.4), bwd = seg(u, 3.8, 6.6), merge = ease(seg(u, 7.2, 8.6));
    const xs = G.x, ys = G.y;
    // вход и выход
    const col = (x0, y0, n, gap, color) => { for (let i = 0; i < n; i++) circle(c, x0, y0 + i * gap, 4.5, color, null); };
    col(xs[0], G.vy, 6, G.vg, P.out); col(xs[4], G.vy, 6, G.vg, P.out);
    lab(c, k, 'вход x', xs[0], G.vy - 18, { px: 11, color: P.ink2, haloColor: P.surf2 });
    lab(c, k, 'выход', xs[4], G.vy - 18, { px: 11, color: P.ink2, haloColor: P.surf2 });
    // W — заморожена
    const Wb = G.W; rect(c, Wb[0], Wb[1], Wb[2], Wb[3], 8, merge > 0 ? alpha(P.mot, 0.12 * merge) : alpha(P.ink3, 0.18), P.ink3, 1.6);
    lab(c, k, merge > 0.5 ? 'W + B·A' : 'W', Wb[0] + Wb[2] / 2, Wb[1] + Wb[3] / 2 - 9, { px: 15, weight: 800, color: P.ink, haloColor: P.surf2 });
    lab(c, k, `${D_OUT} × ${D_IN} = ${D_OUT * D_IN} чисел`, Wb[0] + Wb[2] / 2, Wb[1] + Wb[3] / 2 + 10, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    // замок
    const lx = Wb[0] + Wb[2] - 16, ly = Wb[1] + 14; c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.beginPath(); c.arc(lx, ly - 2, 4, Math.PI, 0); c.stroke(); rect(c, lx - 6, ly - 2, 12, 9, 2, P.ink3, null);
    // A и B — учатся (после слияния уходят в W)
    const ab = 1 - merge, Ab = G.A, Bb = G.B;
    c.globalAlpha = Math.max(0.15, ab);
    const dy = merge * (Wb[1] - Ab[1]);
    rect(c, Ab[0], Ab[1] + dy, Ab[2], Ab[3], 6, alpha(P.mot, 0.22), P.mot, 1.8); rect(c, Bb[0], Bb[1] + dy, Bb[2], Bb[3], 6, alpha(P.mot, 0.22), P.mot, 1.8);
    lab(c, k, 'A', Ab[0] + Ab[2] / 2, Ab[1] + dy + Ab[3] / 2 - 7, { px: 14, weight: 800, color: P.mot, haloColor: P.surf2 }); lab(c, k, `${R} × ${D_IN}`, Ab[0] + Ab[2] / 2, Ab[1] + dy + Ab[3] / 2 + 9, { px: 10, color: P.ink2, haloColor: P.surf2 });
    lab(c, k, 'B', Bb[0] + Bb[2] / 2, Bb[1] + dy + Bb[3] / 2 - 7, { px: 14, weight: 800, color: P.mot, haloColor: P.surf2 }); lab(c, k, `${D_OUT} × ${R}`, Bb[0] + Bb[2] / 2, Bb[1] + dy + Bb[3] / 2 + 9, { px: 10, color: P.ink2, haloColor: P.surf2 });
    for (let i = 0; i < R; i++) circle(c, G.r[0], G.r[1] + dy + (i - 0.5) * 14, 5, P.mot, null);
    lab(c, k, `r = ${R}`, G.r[0], G.r[1] + dy + 26, { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf2 });
    c.globalAlpha = 1;
    // провода
    const sumX = G.sum[0], sumY = G.sum[1];
    line(c, [[xs[0] + 8, G.mid], [Wb[0], G.mid]], P.line, 1.6); line(c, [[Wb[0] + Wb[2], G.mid], [sumX - 10, sumY]], P.line, 1.6);
    if (ab > 0.2) { line(c, [[xs[0] + 8, G.mid], [Ab[0], Ab[1] + Ab[3] / 2]], P.line, 1.6); line(c, [[Ab[0] + Ab[2], Ab[1] + Ab[3] / 2], [G.r[0] - 6, G.r[1]]], P.line, 1.6); line(c, [[G.r[0] + 6, G.r[1]], [Bb[0], Bb[1] + Bb[3] / 2]], P.line, 1.6); line(c, [[Bb[0] + Bb[2], Bb[1] + Bb[3] / 2], [sumX - 8, sumY + 8]], P.line, 1.6); }
    circle(c, sumX, sumY, 11, P.surf, P.ink2, 1.6); lab(c, k, '+', sumX, sumY, { px: 15, weight: 800, color: P.ink, halo: false });
    arrow(c, sumX + 12, sumY, xs[4] - 9, G.mid, P.ink2, 1.6, 6);
    // прямой проход: точки входа идут по двум путям
    const along = (pts, s) => { let L = 0; const seg2 = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg2.push(d); L += d; } let q = s * L; for (let i = 1; i < pts.length; i++) { if (q <= seg2[i - 1]) { const f = q / seg2[i - 1]; return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; } q -= seg2[i - 1]; } return pts[pts.length - 1]; };
    const top = [[xs[0], G.mid], [Wb[0], G.mid], [Wb[0] + Wb[2], G.mid], [sumX, sumY], [xs[4], G.mid]];
    const bot = [[xs[0], G.mid], [Ab[0], Ab[1] + Ab[3] / 2], [Ab[0] + Ab[2], Ab[1] + Ab[3] / 2], [G.r[0], G.r[1]], [Bb[0], Bb[1] + Bb[3] / 2], [Bb[0] + Bb[2], Bb[1] + Bb[3] / 2], [sumX, sumY], [xs[4], G.mid]];
    if (fwd > 0 && fwd < 1) for (let j = 0; j < 4; j++) { const s = ((fwd * 1.6 + j * 0.2) % 1); const p1 = along(top, s), p2 = along(bot, s); circle(c, p1[0], p1[1], 3.4, P.out, null); circle(c, p2[0], p2[1], 3.4, P.out, null); }
    // обратный проход: градиент идёт только в B и A
    if (bwd > 0 && bwd < 1) {
      const back = bot.slice().reverse().slice(0, 7);
      for (let j = 0; j < 4; j++) { const s = ((bwd * 1.6 + j * 0.2) % 1); const p = along(back, s); circle(c, p[0], p[1], 3.4, P.bad, null); }
      const s0 = (bwd * 1.6) % 1, p = along([[xs[4], G.mid], [sumX, sumY], [Wb[0] + Wb[2], G.mid]], Math.min(1, s0 * 1.4));
      circle(c, p[0], p[1], 3.4, P.bad, null);
      HeroKit.cross(c, Wb[0] + Wb[2] + 9, G.mid - 12, 5, P.bad, 2);
      lab(c, k, 'к W градиент не идёт', Wb[0] + Wb[2] / 2, Wb[1] - 12, { px: 10.5, weight: 650, color: P.bad, haloColor: P.surf2 });
    }
    // подписи этапа
    const phase = u < 3.6 ? 'Прямой проход: выход = W·x + B·A·x' : u < 7 ? 'Обучение: меняются только A и B' : u < 9 ? 'После обучения добавку прибавляют к W' : 'Модель той же скорости, что исходная';
    lab(c, k, phase, G.cap[0], G.cap[1], { px: 12, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, `учится r·(${D_IN} + ${D_OUT}) = ${R * (D_IN + D_OUT)} чисел вместо ${D_OUT * D_IN} — ${fmtPct(R * (D_IN + D_OUT) / (D_IN * D_OUT), 0)}`, G.cnt[0], G.cnt[1], { px: 11, color: P.mot, weight: 650, haloColor: P.surf2 });
  }
  return {
    W: 720, H: 300, start: 1.2, narrowAt: 560,
    draw(c, k, t, P, A) { scheme(c, k, t, P, A, { x: [60, 0, 0, 0, 662], vy: 92, vg: 22, mid: 147, W: [210, 92, 190, 110], A: [180, 222, 96, 50], B: [356, 222, 96, 50], r: [318, 247], sum: [560, 160], cap: [360, 22], cnt: [360, 288] }); },
    narrow: { W: 360, H: 420, draw(c, k, t, P, A) { scheme(c, k, t, P, A, { x: [26, 0, 0, 0, 334], vy: 130, vg: 22, mid: 185, W: [78, 120, 176, 100], A: [54, 270, 86, 50], B: [204, 270, 86, 50], r: [172, 295], sum: [300, 200], cap: [180, 24], cnt: [180, 400] }); } },
  };
})());

/* =====================================================================
   Схемы устройства моделей (shared/anim.js), по образцу схем урока 2.1:
     octo-arch    (раздел 2) — Octo: команда → языковой энкодер t5-base → 16 токенов
                  задачи (вместо команды может быть картинка цели); кадры двух камер на
                  двух шагах → небольшая свёрточная сеть → патчи 16 × 16 → токены
                  наблюдения; после наблюдений каждого шага — токен-считыватель. Маска по
                  дугам: наблюдение видит задачу и наблюдения своего и прошлых шагов, но не
                  будущих и не считыватели; считыватель читает задачу и наблюдения. Выход
                  считывателя → диффузионная голова → 20 шагов денойзинга → пачка действий;
     openvla-arch (раздел 3) — OpenVLA: квадраты картинки читают DINOv2 и SigLIP, признаки
                  ставят рядом, проектор переводит их в токены картинки для Llama 2;
                  команда → токены словаря Llama; Llama 2 дописывает 7 токенов действия по
                  одному, и каждый новый становится входом для следующего; токен — номер
                  одной из 256 корзин между 1-м и 99-м процентилем, по нему получается число.
   Цвета по соглашению anim.js: оранжевый — то, что считается сейчас (и токены действия),
   синий — измеренное (кадры камер и их токены), серый — неподвижное (токены команды).
   В схеме OpenVLA признаки DINOv2 синие («где»), SigLIP — фиолетовые («что»), как два
   потока CLIPort в уроке 2.1. Числа действия и границы корзин условные.
   Без shared/anim.js схем нет, а остальной урок работает.
   ===================================================================== */
(() => {
  const KINDS = ['octo-arch', 'openvla-arch'];
  if (typeof Anim === 'undefined') {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit;
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const num1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace('-', '−');
  const sgn1 = (v) => (v >= 0.05 ? '+' : '') + num1(v);
  /** Фраза — в строки не шире maxW; неразрывный пробел ( ) не даёт разорвать слова. */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const ws = text.split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись, ужатая до ширины maxW; массив — несколько строк, y — середина блока; o.wrap — перенос по словам,
   *  o.top — y задаёт первую строку, а не середину. */
  function txt(c, k, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * (o.lh || 1.28), y0 = o.top ? y : y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => K.label(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
  }
  /** Блок сети: скруглённый прямоугольник с названием и строкой пояснения; on — блок сейчас считает. */
  function box(c, k, A, P, b, title, sub, on, col) {
    const [x, y, w, h] = b, cc = col || P.mot;
    A.rect(c, x, y, w, h, 9, on ? A.alpha(cc, 0.13) : P.surf, on ? cc : P.line, on ? 1.8 : 1.2);
    K.font(c, k, 11, 750);
    const lines = Array.isArray(title) ? title : c.measureText(title).width > (w - 10) * 1.12 ? wrap(c, k, title, w - 10, 11, 750) : [title];
    const n = lines.length + (sub ? 1 : 0), lh = 13 * k, y0 = y + h / 2 - (n - 1) * lh / 2;
    lines.forEach((t, i) => txt(c, k, t, x + w / 2, y0 + i * lh, w - 10, { px: 11, weight: 750, color: P.ink }));
    if (sub) txt(c, k, sub, x + w / 2, y0 + lines.length * lh, w - 10, { px: 10, weight: 600, color: P.ink3 });
  }
  /** Точка на ломаной по доле длины s ∈ [0, 1]. */
  function along(pts, s) {
    const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
    let r = Math.max(0, Math.min(1, s)) * tot;
    for (let i = 0; i < L.length; i++) { if (r <= L[i] || i === L.length - 1) { const f = L[i] ? Math.min(1, r / L[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; } r -= L[i]; }
    return pts[pts.length - 1];
  }
  /** Стрелка по ломаной. */
  function poly(c, A, pts, col, lw, dash) {
    if (!pts || pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (pts.length > 2) A.line(c, pts.slice(0, -1), col, lw, dash);
    if (dash) { A.line(c, [a, b], col, lw, dash); A.arrow(c, b[0] - (b[0] - a[0]) * 0.001, b[1] - (b[1] - a[1]) * 0.001, b[0], b[1], col, lw, 6); }
    else A.arrow(c, a[0], a[1], b[0], b[1], col, lw, 6);
  }
  /** Точки бегут по ломаной, пока prog между 0 и 1. */
  function dots(c, A, pts, prog, col) {
    if (prog <= 0 || prog >= 1 || !pts) return;
    for (let i = 0; i < 3; i++) { const q = along(pts, (prog * 1.6 + i / 3) % 1); A.circle(c, q[0], q[1], 2.6, col); }
  }
  /** Токен — квадратик; hollow — только контур. */
  function tok(c, A, P, x, y, s, col, hollow) {
    if (hollow) A.rect(c, x, y, s, s, 2.5, P.surf, col, 1.6);
    else A.rect(c, x, y, s, s, 2.5, col, null);
  }
  /** Команда словами — в скруглённой рамке. */
  function chip(c, k, A, P, text, b, on) {
    const [x, y, w, h] = b;
    A.rect(c, x, y, w, h, 9, P.surf, on ? P.ink2 : P.ink3, on ? 1.6 : 1.3);
    txt(c, k, text, x + w / 2, y + h / 2, w - 12, { px: 10.5, weight: 650, color: P.ink, wrap: true });
  }
  /* ---------- кадры камер: стол, предметы, губки захвата ---------- */
  const tableCol = (P) => (P.dark ? '#5a4a36' : '#e3d3b6');
  function frame(c, A, P, x, y, w, h, kind, on) {
    const s = Math.min(w, h), dk = P.dark;
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 4); c.clip();
    c.fillStyle = tableCol(P); c.fillRect(x, y, w, h);
    const plate = (px, py, r) => { A.circle(c, px, py, r, dk ? '#d9d6cf' : '#fbfaf7', dk ? '#9c978c' : '#c4bdae', 1); A.circle(c, px, py, r * 0.6, null, dk ? '#b3aea3' : '#e2ddd2', 0.8); };
    const knife = (kx, ky, L, ang, lw) => { c.save(); c.translate(kx, ky); c.rotate(ang); A.line(c, [[0, 0], [L * 0.55, 0]], dk ? '#c9ccd2' : '#8f97a2', lw); A.line(c, [[-L * 0.45, 0], [0, 0]], dk ? '#1f1b18' : '#3b3530', lw * 1.3); c.restore(); };
    const jaws = (jx, jy, sc) => { c.fillStyle = dk ? '#1d1b19' : '#46423e'; c.fillRect(jx - sc * 0.5, jy - sc * 0.12, sc, sc * 0.16); c.fillRect(jx - sc * 0.5, jy, sc * 0.2, sc * 0.45); c.fillRect(jx + sc * 0.3, jy, sc * 0.2, sc * 0.45); };
    if (kind === 'side') { plate(x + w * 0.68, y + h * 0.6, s * 0.24); knife(x + w * 0.3, y + h * 0.66, s * 0.5, -0.35, 2); jaws(x + w * 0.4, y + h * 0.1, s * 0.34); }
    else if (kind === 'wrist') { plate(x + w * 0.72, y + h * 0.78, s * 0.55); knife(x + w * 0.42, y + h * 0.45, s * 1.1, -0.25, 3); c.fillStyle = dk ? '#1d1b19' : '#46423e'; c.fillRect(x, y + h * 0.7, w * 0.13, h * 0.3); c.fillRect(x + w * 0.87, y + h * 0.7, w * 0.13, h * 0.3); }
    else if (kind === 'goal') { plate(x + w * 0.58, y + h * 0.55, s * 0.36); knife(x + w * 0.56, y + h * 0.55, s * 0.5, -0.35, 1.8); }
    else if (kind === 'carrot') {
      A.circle(c, x + w * 0.7, y + h * 0.62, s * 0.21, dk ? '#7f9fc2' : '#a9c3de', dk ? '#5d7ea3' : '#6f8fb0', 1.2);
      A.circle(c, x + w * 0.7, y + h * 0.62, s * 0.13, dk ? '#6d8db0' : '#c4d7ea', null);
      c.save(); c.translate(x + w * 0.32, y + h * 0.6); c.rotate(0.45);
      c.beginPath(); c.moveTo(-s * 0.2, -s * 0.06); c.lineTo(s * 0.18, 0); c.lineTo(-s * 0.2, s * 0.06); c.closePath(); c.fillStyle = '#e8772e'; c.fill();
      A.line(c, [[-s * 0.2, 0], [-s * 0.29, -s * 0.06]], '#3f8f3a', 2); A.line(c, [[-s * 0.2, 0], [-s * 0.3, s * 0.03]], '#3f8f3a', 2);
      c.restore();
      jaws(x + w * 0.44, y + h * 0.1, s * 0.26);
    }
    c.restore();
    A.rect(c, x, y, w, h, 4, null, on ? P.ink : P.line, on ? 1.6 : 1);
  }

  /* ---------- octo-arch: токены задачи и наблюдений, маска, считыватели и диффузионная голова ---------- */
  (() => {
    const T = 18, PH = { tsk: [0.2, 1.6], obs: [1.6, 3.6], rd: [3.6, 4.6], mA: [4.8, 6.8], mB: [6.8, 8.8], mC: [8.8, 10.8], hd: [11.0, 14.4], out: [14.4, 15.2], fade: [17.2, 18] };
    // группы последовательности: задача, наблюдение шага 1, считыватель 1, наблюдение шага 2, считыватель 2 (на схеме — по нескольку квадратиков)
    const GR = [{ n: 4, kind: 'task' }, { n: 5, kind: 'obs' }, { n: 1, kind: 'rd' }, { n: 5, kind: 'obs' }, { n: 1, kind: 'rd' }];
    const NPT = 22, TGT = Array.from({ length: NPT }, (_, i) => 0.6 * Math.sin(Math.PI * i / (NPT - 1) * 1.4 + 0.3) - 0.15), NOISE = Array.from({ length: NPT }, (_, i) => (hash(i + 3) + hash(i + 40) - 1) * 1.6);
    function draw(c, k, t, P, A, G) {
      const { seg, ease } = A, u = ((t % T) + T) % T;
      const pT = seg(u, ...PH.tsk), pO = seg(u, ...PH.obs), pR = seg(u, ...PH.rd), pA = seg(u, ...PH.mA), pB = seg(u, ...PH.mB), pC = seg(u, ...PH.mC), pH = seg(u, ...PH.hd), pX = seg(u, ...PH.out);
      const fade = 1 - seg(u, ...PH.fade); c.globalAlpha = fade;
      const on = (x) => (x ? P.ink2 : P.line);
      // ---------- входы: задача ----------
      chip(c, k, A, P, '«положи нож на тарелку»', G.cmd, pT > 0 && pT < 0.5);
      poly(c, A, G.aCmd, on(pT > 0), 1.4); dots(c, A, G.aCmd, seg(pT, 0, 0.3), P.ink3);
      box(c, k, A, P, G.t5, 'языковой энкодер', 't5-base, 111 млн', pT > 0.2 && pT < 0.8, P.ink2);
      const [gx, gy, gw, gh] = G.goal;
      c.globalAlpha = fade * 0.75; frame(c, A, P, gx, gy, gw, gh, 'goal', false); c.globalAlpha = fade;
      txt(c, k, 'или картинка цели', G.goalLab[0], G.goalLab[1], G.goalLab[2], { px: 10, color: P.ink3, align: G.goalLab[3] || 'left' });
      poly(c, A, G.aTask, on(pT > 0.6), 1.5); dots(c, A, G.aTask, seg(pT, 0.6, 1), P.ink3);
      // ---------- входы: кадры двух камер на двух шагах ----------
      G.steps.forEach((S, j) => {
        const act = pO > j * 0.35 && pO < j * 0.35 + 0.45;
        txt(c, k, j ? 'шаг 2' : 'шаг 1', S.lab[0], S.lab[1], 60, { px: 10.5, weight: 700, color: P.ink2, align: 'left' });
        frame(c, A, P, ...S.side, 'side', act); frame(c, A, P, ...S.wrist, 'wrist', act);
        poly(c, A, S.aIn, on(pO > j * 0.35), 1.4); dots(c, A, S.aIn, seg(pO, j * 0.35, j * 0.35 + 0.25), P.out);
        poly(c, A, S.aOut, on(pO > j * 0.35 + 0.3), 1.5); dots(c, A, S.aOut, seg(pO, j * 0.35 + 0.3, j * 0.35 + 0.6), P.out);
      });
      txt(c, k, 'сбоку', G.camLab[0][0], G.camLab[0][1], 50, { px: 10, color: P.ink3 });
      txt(c, k, 'запястье', G.camLab[1][0], G.camLab[1][1], 60, { px: 10, color: P.ink3 });
      box(c, k, A, P, G.cnn, 'свёрточная сеть', 'патчи 16 × 16', pO > 0.1 && pO < 0.95, P.out);
      // ---------- трансформер: последовательность токенов ----------
      const B = G.tf, F = G.col;
      A.rect(c, B[0], B[1], B[2], B[3], 12, A.alpha(P.ink3, 0.06), P.ink3, 1.2);
      txt(c, k, 'трансформер Octo', G.tfT[0], G.tfT[1], 160, { px: 12, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, '12 слоёв, ширина 768', G.tfS[0], G.tfS[1], 160, { px: 10, color: P.ink3, align: 'left' });
      const ys = [], gc = [];                               // y каждого квадратика и середина каждой группы
      { let y = F.y0; GR.forEach((g) => { const a = []; for (let i = 0; i < g.n; i++) { a.push(y); y += F.step; } ys.push(a); gc.push((a[0] + a[a.length - 1] + F.s) / 2); y += F.gap - F.step + F.s; }); }
      const shown = [pT > 0.6 ? 4 * seg(pT, 0.6, 1) : 0, 5 * seg(pO, 0.25, 0.6), pR > 0 ? 1 : 0, 5 * seg(pO, 0.6, 0.95), pR > 0.5 ? 1 : 0];
      const rdFull = pC > 0.5 || u >= PH.hd[0];
      const NAMES = [['задача', '16 токенов'], ['наблюдение 1', '256 + 64'], ['считыватель 1'], ['наблюдение 2', '256 + 64'], ['считыватель 2']];
      GR.forEach((g, gi) => {
        const col = g.kind === 'task' ? P.ink3 : g.kind === 'obs' ? P.out : P.mot;
        for (let i = 0; i < g.n; i++) {
          const vis = Math.max(0, Math.min(1, shown[gi] - i)); if (vis <= 0) { A.rect(c, F.x, ys[gi][i], F.s, F.s, 2.5, null, P.grid, 1); continue; }
          c.globalAlpha = fade * vis; tok(c, A, P, F.x, ys[gi][i], F.s, col, g.kind === 'rd' && !rdFull); c.globalAlpha = fade;
        }
        const nm = NAMES[gi], lx = F.x - F.labGap;
        if (nm.length > 1) { txt(c, k, nm[0], lx, gc[gi] - 7, F.labW, { px: 10.5, weight: 700, color: g.kind === 'obs' ? P.out : P.ink2, align: 'right' }); txt(c, k, nm[1], lx, gc[gi] + 7, F.labW, { px: 9.5, color: P.ink3, align: 'right' }); }
        else txt(c, k, nm[0], lx, gc[gi], F.labW, { px: 10.5, weight: 700, color: P.mot, align: 'right' });
      });
      // ---------- маска: дуги от выбранного токена к тем, кого он видит ----------
      const ax = F.x + F.s + 3, cy = (gi, i) => ys[gi][i] + F.s / 2;
      const arc = (y1, y2, col, lw, dash, cross) => {
        const b = Math.min(F.maxB, 16 + Math.abs(y2 - y1) * 0.55);
        c.beginPath(); c.moveTo(ax, y1); c.quadraticCurveTo(ax + b, (y1 + y2) / 2, ax, y2);
        c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
        if (cross) K.cross(c, ax + b / 2, (y1 + y2) / 2, 4.5, P.bad, 2);
      };
      // правила: [источник, кого видит (группы), кого не видит (группа)]
      const RULES = [[[1, 2], [0, 1], 3], [[3, 2], [0, 1, 3], 2], [[4, 0], [0, 1, 3], null]];
      const ps = [pA, pB, pC], ri = pC > 0 ? 2 : pB > 0 ? 1 : pA > 0 ? 0 : -1;
      if (ri >= 0 && u < PH.hd[0]) {
        const [[sg, si], seeG, notG] = RULES[ri], p = ps[ri], y0 = cy(sg, si), tg = [];
        seeG.forEach((g2) => ys[g2].forEach((_, i) => { if (!(g2 === sg && i === si)) tg.push([g2, i]); }));
        const nOn = Math.ceil(tg.length * Math.min(1, p * 1.6));
        tg.slice(0, nOn).forEach(([g2, i], q) => arc(y0, cy(g2, i), A.alpha(P.mot, 0.3 + 0.55 * hash(q + ri * 17)), 1 + 1.4 * hash(q + ri * 5)));
        if (notG != null && p > 0.3) arc(y0, gc[notG], A.alpha(P.ink3, 0.85), 1.5, [4, 3], true);
        A.rect(c, F.x - 2, ys[sg][si] - 2, F.s + 4, F.s + 4, 3.5, null, P.ink, 1.8);
      }
      // ---------- что видит маска: правило словами ----------
      const M = G.mask;
      txt(c, k, 'Маска внимания', M.t[0], M.t[1], M.w, { px: 12, weight: 750, color: P.ink, align: 'left' });
      const rule = ri < 0 || u >= PH.hd[0] && ri < 0 ? 'Маска решает, какие токены видит каждый токен.'
        : ri === 0 ? 'Наблюдение 1 видит задачу и само себя, но не наблюдение 2: оно из будущего.'
        : ri === 1 ? 'Наблюдение 2 видит задачу и наблюдения обоих шагов, но не считыватель.'
        : 'Считыватель читает задачу и наблюдения своего и прошлых шагов, а его не читает никто.';
      txt(c, k, rule, M.r[0], M.r[1], M.w, { px: 11, weight: 650, color: P.ink2, align: 'left', wrap: true, top: true, lh: 1.32 });
      const [lx, ly, ldy] = M.leg;
      A.line(c, [[lx, ly], [lx + 24, ly]], A.alpha(P.mot, 0.8), 2);
      txt(c, k, 'видит', lx + 30, ly, 60, { px: 10, color: P.ink3, align: 'left' });
      A.line(c, [[lx + ldy[0], ly + ldy[1]], [lx + ldy[0] + 24, ly + ldy[1]]], A.alpha(P.ink3, 0.8), 1.4, [4, 3]); K.cross(c, lx + ldy[0] + 12, ly + ldy[1], 4, P.bad, 2);
      txt(c, k, 'не видит', lx + ldy[0] + 30, ly + ldy[1], 70, { px: 10, color: P.ink3, align: 'left' });
      // ---------- выход считывателя → диффузионная голова → пачка ----------
      poly(c, A, G.aRd, on(pH > 0), 1.6); dots(c, A, G.aRd, seg(pH, 0, 0.2), P.mot);
      const steps = pH <= 0.15 ? 0 : Math.min(20, Math.ceil((pH - 0.15) / 0.8 * 20)), denoise = pH > 0.15 && pH < 0.95;
      box(c, k, A, P, G.head, 'диффузионная голова', '3 слоя по 256', denoise);
      A.line(c, G.loop, denoise ? P.mot : P.line, denoise ? 1.6 : 1.2, [4, 3], -u * 24);
      const lp = G.loop[G.loop.length - 1], lq = G.loop[G.loop.length - 2];
      A.arrow(c, lq[0] + (lp[0] - lq[0]) * 0.6, lq[1] + (lp[1] - lq[1]) * 0.6, lp[0], lp[1], denoise ? P.mot : P.line, denoise ? 1.6 : 1.2, 5);
      txt(c, k, '× 20', G.loopLab[0], G.loopLab[1], 40, { px: 10, mono: true, weight: 700, color: denoise ? P.mot : P.ink3 });
      poly(c, A, G.aHead, on(steps > 0), 1.5);
      const [qx, qy, qw, qh] = G.chunk, mid = qy + qh / 2, sy = qh * 0.3, uu = steps / 20;
      A.rect(c, qx, qy, qw, qh, 7, P.surf, pX > 0 ? P.mot : P.line, pX > 0 ? 1.6 : 1.2);
      if (steps > 0) {
        c.fillStyle = P.mot;
        const pts = []; for (let i = 0; i < NPT; i++) { const v = NOISE[i] * (1 - uu) + TGT[i] * uu, px2 = qx + 6 + (qw - 12) * i / (NPT - 1); pts.push([px2, mid - v * sy]); c.beginPath(); c.arc(px2, mid - v * sy, 1.8, 0, Math.PI * 2); c.fill(); }
        if (steps >= 20) A.line(c, pts, P.mot, 1.4);
      }
      txt(c, k, 'пачка действий', G.chunkLab[0], G.chunkLab[1], qw + 20, { px: 10, color: P.ink2 });
      if (steps > 0) txt(c, k, `шаг денойзинга ${steps} из 20`, G.cnt[0], G.cnt[1], G.cnt[3], { px: 10, weight: 700, color: P.mot, align: G.cnt[2] });
      // ---------- что происходит ----------
      const st = u < PH.obs[0] ? 'Команду читает языковой энкодер t5-base: получается 16 токенов задачи.'
        : u < PH.rd[0] ? 'Кадры двух камер на двух шагах проходят свёрточную сеть и режутся на патчи 16 × 16.'
        : u < PH.mA[0] ? 'После наблюдений каждого шага в последовательность вставляют токен-считыватель.'
        : u < PH.hd[0] ? 'Трансформер читает все токены, а маска внимания решает, кто кого видит.'
        : u < PH.out[0] ? 'Выход считывателя получает диффузионная голова: за 20 шагов денойзинга шум становится пачкой действий.'
        : 'Основа считается один раз, а все 20 шагов денойзинга идут в маленькой голове.';
      txt(c, k, st, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35, top: true });
      c.globalAlpha = 1;
    }
    Anim.add('octo-arch', {
      W: 720, H: 404, start: 15.0, narrowAt: 720,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          cmd: [14, 16, 182, 28], aCmd: [[105, 44], [105, 54]], t5: [14, 56, 182, 40], aTask: [[196, 76], [204, 90]],
          goal: [14, 104, 34, 24], goalLab: [54, 116, 140],
          steps: [
            { lab: [14, 145], side: [14, 154, 48, 38], wrist: [66, 160, 32, 24], aIn: [[100, 173], [107, 173]], aOut: [[198, 173], [204, 168]] },
            { lab: [14, 211], side: [14, 220, 48, 38], wrist: [66, 226, 32, 24], aIn: [[100, 239], [107, 239]], aOut: [[198, 239], [204, 272]] },
          ],
          camLab: [[38, 270], [82, 270]], cnn: [108, 150, 90, 112],
          tf: [206, 14, 272, 332], tfT: [218, 32], tfS: [218, 48],
          col: { x: 345, s: 10, step: 13, gap: 16, y0: 70, labGap: 9, labW: 120, maxB: 112 },
          mask: { t: [494, 30], r: [494, 52], w: 212, leg: [494, 134, [0, 18]] },
          aRd: [[358, 322], [488, 322]], head: [490, 299, 104, 46], loop: [[578, 299], [578, 285], [506, 285], [506, 297]], loopLab: [542, 277],
          aHead: [[594, 322], [604, 322]], chunk: [606, 293, 100, 58], chunkLab: [656, 283], cnt: [706, 364, 'right', 200],
          st: [14, 382, 692],
        });
      },
      narrow: {
        W: 360, H: 850,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            cmd: [14, 14, 230, 28], aCmd: [[129, 42], [129, 50]], t5: [14, 52, 230, 40], aTask: [[244, 72], [334, 72], [334, 276]],
            goal: [14, 100, 32, 24], goalLab: [52, 112, 180],
            steps: [
              { lab: [14, 140], side: [14, 148, 56, 42], wrist: [76, 154, 38, 28], aIn: [[116, 169], [126, 169]], aOut: [[175, 252], [175, 276]] },
              { lab: [14, 204], side: [14, 212, 56, 42], wrist: [76, 218, 38, 28], aIn: [[116, 233], [126, 233]], aOut: null },
            ],
            camLab: [[42, 264], [95, 264]], cnn: [128, 146, 94, 106],
            tf: [14, 278, 332, 400], tfT: [26, 296], tfS: [26, 312],
            col: { x: 150, s: 9, step: 12, gap: 15, y0: 430, labGap: 9, labW: 120, maxB: 170 },
            mask: { t: [26, 336], r: [26, 356], w: 308, leg: [26, 408, [110, 0]] },
            aRd: [[154.5, 669], [154.5, 700]], head: [40, 702, 150, 46], loop: [[176, 748], [176, 760], [54, 760], [54, 750]], loopLab: [115, 772],
            aHead: [[190, 725], [204, 725]], chunk: [206, 696, 140, 58], chunkLab: [276, 686], cnt: [276, 772, 'center', 150],
            st: [14, 796, 332],
          });
        },
      },
    });
  })();

  /* ---------- openvla-arch: два энкодера, проектор, Llama 2 и семь токенов действия по одному ---------- */
  (() => {
    const T = 18, PH = { img: [0.2, 1.0], enc: [1.0, 2.6], cat: [2.6, 3.6], proj: [3.6, 4.8], txt: [4.8, 6.2], gen: [6.4, 13.4], act: [13.6, 14.6], fade: [17.2, 18] };
    // 7 чисел действия: смещение захвата по x, y, z (см), поворот (°) и раскрытие захвата. Числа и границы корзин условные:
    // ось от 1-го до 99-го процентиля делят на 256 равных корзин, токен — номер корзины, число — её середина.
    const DIMS = [[-2, 2, 0.6], [-2, 2, -0.3], [-2, 2, -0.9], [-6, 6, 1], [-6, 6, -2], [-6, 6, 0.5], [0, 1, 1]].map(([lo, hi, v]) => {
      const bin = Math.max(0, Math.min(255, Math.floor((v - lo) / (hi - lo) * 256)));
      return { lo, hi, bin, val: lo + (bin + 0.5) * (hi - lo) / 256 };
    });
    const NI = 5, NT = 4, NA = 7;                          // на схеме: 5 токенов картинки, 4 токена команды, 7 токенов действия
    function draw(c, k, t, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t % T) + T) % T;
      const pI = seg(u, ...PH.img), pE = seg(u, ...PH.enc), pC = ease(seg(u, ...PH.cat)), pP = seg(u, ...PH.proj), pX = seg(u, ...PH.txt), pG = seg(u, ...PH.gen), pA = seg(u, ...PH.act);
      const fade = 1 - seg(u, ...PH.fade); c.globalAlpha = fade;
      const on = (x) => (x ? P.ink2 : P.line);
      // какой токен действия сейчас и доля его шага: до 0,4 Llama читает вход, 0,4–0,6 новый токен встаёт в конец,
      // с 0,6 его номер корзины становится числом
      const jf = pG * NA, cur = pG <= 0 ? -1 : pG >= 1 ? NA : Math.min(NA - 1, Math.floor(jf)), ls = pG >= 1 ? 1 : jf - Math.floor(jf);
      const made = (j) => j < cur || (j === cur && ls >= 0.4), decoded = (j) => j < cur || (j === cur && ls >= 0.62);
      const R = G.row, rx = (i) => R.x0 + i * R.step, gl = R.y + R.s / 2;
      // ---------- картинка и два энкодера ----------
      const [ix, iy, is] = G.img;
      frame(c, A, P, ix, iy, is, is, 'carrot', pE > 0 && pE < 1);
      const cut = seg(pI, 0.3, 1);
      if (cut > 0) for (let i = 1; i < 4; i++) {
        A.line(c, [[ix + i * is / 4, iy], [ix + i * is / 4, iy + is]], A.alpha(P.out, 0.8 * cut), 1.2);
        A.line(c, [[ix, iy + i * is / 4], [ix + is, iy + i * is / 4]], A.alpha(P.out, 0.8 * cut), 1.2);
      }
      txt(c, k, 'картинка 224 × 224', G.imgLab[0], G.imgLab[1], G.imgLab[2], { px: 10.5, color: P.ink2 });
      G.aImg.forEach((pts) => { poly(c, A, pts, on(pE > 0), 1.5); dots(c, A, pts, seg(pE, 0, 0.45), P.out); });
      box(c, k, A, P, G.dino, 'DINOv2', 'где что лежит', pE > 0.3 && pE < 1, P.out);
      box(c, k, A, P, G.sig, 'SigLIP', 'что на снимке', pE > 0.3 && pE < 1, P.spr);
      const [cw, ch] = G.cell;
      const strip = (x, y, col, g, off) => { for (let i = 0; i < 4; i++) { const v = Math.max(0, Math.min(1, g * 4 - i)); A.rect(c, x + i * cw + 0.5, y, cw - 1, ch, 2, v > 0 ? A.alpha(col, 0.25 + 0.6 * hash(i + off) * v) : P.surf, A.alpha(col, 0.7), 1); } };
      G.aEnc.forEach((pts) => poly(c, A, pts, on(pE > 0.6), 1.4));
      strip(G.dS[0], G.dS[1], P.out, seg(pE, 0.6, 1), 1); strip(G.sS[0], G.sS[1], P.spr, seg(pE, 0.6, 1), 9);
      // признаки двух энкодеров ставят рядом: копии полосок съезжаются в одну
      G.aCat.forEach((pts) => poly(c, A, pts, on(pC > 0), 1.4));
      const [qx, qy] = G.cat;
      for (let i = 0; i < 8; i++) A.rect(c, qx + i * cw + 0.5, qy, cw - 1, ch, 2, P.surf, P.grid, 1);
      if (pC > 0) for (const [S, col, off, o] of [[G.dS, P.out, 1, 0], [G.sS, P.spr, 9, 4]]) {
        const x0 = lerp(S[0], qx + o * cw, pC), y0 = lerp(S[1], qy, pC);
        for (let i = 0; i < 4; i++) A.rect(c, x0 + i * cw + 0.5, y0, cw - 1, ch, 2, A.alpha(col, 0.25 + 0.6 * hash(i + off)), A.alpha(col, 0.7), 1);
      }
      txt(c, k, 'признаки рядом', G.catLab[0], G.catLab[1], G.catLab[2], { px: 10.5, color: P.ink2, align: G.catLab[3] || 'center' });
      poly(c, A, G.aProj, on(pP > 0), 1.5); dots(c, A, G.aProj, seg(pP, 0, 0.3), P.spr);
      box(c, k, A, P, G.proj, 'проектор', '2 слоя', pP > 0.15 && pP < 0.7);
      // ---------- команда и её токены ----------
      chip(c, k, A, P, '«положи морковь в миску»', G.cmd, pX > 0 && pX < 0.4);
      poly(c, A, G.aCmd, on(pX > 0), 1.5); dots(c, A, G.aCmd, seg(pX, 0, 0.35), P.ink3);
      box(c, k, A, P, G.tokz, 'токенизатор Llama', null, pX > 0.2 && pX < 0.6, P.ink2);
      // ---------- вход Llama: токены картинки, команды и уже выданные токены действия ----------
      G.aIn.forEach((pts, i) => poly(c, A, pts, on(i === 0 ? pP > 0.5 : pX > 0.6), 1.5));
      [['картинка', 0, NI], ['команда', NI, NT], ['действие', NI + NT, NA]].forEach(([w, a, n]) => txt(c, k, w, (rx(a) + rx(a + n - 1) + R.s) / 2, R.labY, 80, { px: 10, color: P.ink3 }));
      for (let i = 0; i < NI + NT + NA; i++) A.rect(c, rx(i), R.y, R.s, R.s, 2.5, null, P.grid, 1);
      const flyIn = (pts, f, i, col) => { const q = along(pts.concat([[rx(i) + R.s / 2, gl]]), f); tok(c, A, P, q[0] - R.s / 2, q[1] - R.s / 2, R.s, col); };
      for (let i = 0; i < NI; i++) {                                    // токены картинки выходят из проектора
        const f = ease(seg(pP, 0.45 + i * 0.07, 0.7 + i * 0.06)); if (f > 0) flyIn(G.aIn[0], f, i, P.out);
      }
      for (let i = 0; i < NT; i++) {                                    // токены команды: у токенизатора, потом на вход
        const a = seg(pX, 0.4 + i * 0.04, 0.5 + i * 0.04); if (a <= 0) continue;
        const f = ease(seg(pX, 0.62 + i * 0.05, 0.85 + i * 0.05)), x0 = G.tTok[0] + i * R.step, y0 = G.tTok[1];
        if (f <= 0) tok(c, A, P, x0, y0, R.s, P.ink3); else flyIn([[x0 + R.s / 2, y0 + R.s / 2]].concat(G.aIn[1].slice(1)), f, NI + i, P.ink3);
      }
      // ---------- Llama 2: читает вход и дописывает в конец новый токен ----------
      const L = G.llama, busy = pG > 0 && pG < 1 && ls < 0.4, below = L[1] > R.y;
      A.rect(c, L[0], L[1], L[2], L[3], 10, busy ? A.alpha(P.mot, 0.12) : A.alpha(P.ink3, 0.08), busy ? P.mot : P.ink3, busy ? 1.8 : 1.3);
      txt(c, k, 'Llama 2', G.llT[0], G.llT[1], 120, { px: 12, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, '7 млрд параметров', G.llS[0], G.llS[1], 140, { px: 10, color: P.ink3, align: 'left' });
      if (pG > 0) txt(c, k, pG >= 1 ? 'все 7 токенов' : `токен ${cur + 1} из 7`, G.llC[0], G.llC[1], 110, { px: 10.5, weight: 700, color: P.mot, align: 'right' });
      const edge = below ? L[1] : L[1] + L[3];
      if (busy) for (let i = 0; i < 5; i++) { const x = rx(Math.floor(hash(i + cur * 7) * (NI + NT + cur))) + R.s / 2, y = lerp(below ? R.y + R.s : R.y, below ? L[1] + L[3] * 0.45 : L[1] + L[3] * 0.55, ((ls / 0.4) * 1.3 + i / 5) % 1); A.circle(c, x, y, 2.4, P.mot); }
      for (let j = 0; j < NA; j++) {
        if (!made(j)) continue;
        const x1 = rx(NI + NT + j), f = j === cur ? ease(seg(ls, 0.4, 0.6)) : 1;
        tok(c, A, P, x1, lerp(edge + (below ? -R.s * 0.2 : -R.s * 0.8), R.y, f), R.s, P.mot);
        if (j === cur && pG < 1) A.rect(c, x1 - 2, R.y - 2, R.s + 4, R.s + 4, 3.5, null, P.ink, 1.6);
      }
      // ---------- корзины: номер токена → число ----------
      const X = G.axis, bw = (X.x1 - X.x0) / 256, jj = pG >= 1 ? NA - 1 : cur, S = G.cells, sx = (j) => S.x0 + j * S.step;
      A.rect(c, X.x0, X.y - 4, X.x1 - X.x0, 8, 3, P.surf2, P.line, 1);
      for (let b = 32; b < 256; b += 32) A.line(c, [[X.x0 + b * bw, X.y - 4], [X.x0 + b * bw, X.y + 4]], P.grid, 1);
      txt(c, k, '1-й процентиль', X.x0, X.endY, 120, { px: 10, color: P.ink3, align: 'left' });
      txt(c, k, '99-й процентиль', X.x1, X.endY, 120, { px: 10, color: P.ink3, align: 'right' });
      if (jj >= 0 && made(jj)) {
        const d = DIMS[jj], mx = X.x0 + (d.bin + 0.5) * bw, live = jj === cur && pG < 1;
        A.rect(c, mx - 2, X.y - 8, 4, 16, 1.5, P.mot, null);
        txt(c, k, `корзина ${d.bin} из 256`, Math.max(X.x0 + 58, Math.min(X.x1 - 58, mx)), X.binY, 120, { px: 10, weight: 700, color: P.mot });
        if (live && G.link) {
          A.line(c, [[rx(NI + NT + jj) + R.s / 2, R.y + R.s + 3], [mx, X.binY - 8]], A.alpha(P.mot, 0.65), 1.2, [3, 3]);
          if (ls >= 0.62) A.line(c, [[mx, X.y + 9], [sx(jj) + S.w / 2, S.y - 2]], A.alpha(P.mot, 0.65), 1.2, [3, 3]);
        }
      }
      // ---------- действие: 7 чисел ----------
      for (let j = 0; j < NA; j++) {
        const x = sx(j), ok = decoded(j), now = j === cur && pG < 1;
        A.rect(c, x, S.y, S.w, S.h, 4, ok ? A.alpha(P.mot, pA > 0 ? 0.22 : 0.1) : P.surf, ok ? (now || pA > 0 ? P.mot : A.alpha(P.mot, 0.55)) : P.grid, now ? 1.8 : 1.1);
        if (ok) txt(c, k, j === NA - 1 ? num1(DIMS[j].val) : sgn1(DIMS[j].val), x + S.w / 2, S.y + S.h / 2 + 0.5, S.w - 4, { px: 9.5, weight: 700, mono: true, color: P.ink });
      }
      const grp = (a, b, text) => { const x0 = sx(a), x1 = sx(b) + S.w; A.line(c, [[x0 + 1, S.brY], [x1 - 1, S.brY]], P.ink3, 1); txt(c, k, text, (x0 + x1) / 2, S.labY, x1 - x0 + 12, { px: 10, color: P.ink3 }); };
      grp(0, 2, 'смещение, см'); grp(3, 5, 'поворот, °'); grp(6, 6, 'захват');
      // ---------- что происходит ----------
      const st = u < PH.cat[0] ? 'Каждый квадрат картинки читают два энкодера: DINOv2 и SigLIP.'
        : u < PH.proj[0] ? 'Признаки квадрата от двух энкодеров ставят рядом в один вектор.'
        : u < PH.txt[0] ? 'Проектор переводит эти векторы в токены картинки для Llama 2.'
        : u < PH.gen[0] ? 'Команду режут на токены словаря Llama и ставят после токенов картинки.'
        : u < PH.gen[0] + (PH.gen[1] - PH.gen[0]) / NA ? 'Llama 2 выдаёт первый токен действия: это номер одной из 256 корзин.'
        : u < PH.act[0] ? 'Новый токен встаёт в конец входа, и модель выдаёт следующий: всего 7 токенов.'
        : 'Семь чисел уходят руке. С новым кадром всё повторяется, около 6 раз в секунду.';
      txt(c, k, st, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35, top: true });
      c.globalAlpha = 1;
    }
    Anim.add('openvla-arch', {
      W: 720, H: 252, start: 13.9, narrowAt: 720,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          img: [14, 30, 84], imgLab: [56, 128, 106],
          dino: [116, 20, 112, 46], sig: [116, 80, 112, 46], aImg: [[[98, 62], [114, 45]], [[98, 82], [114, 101]]],
          cell: [9, 14], dS: [240, 36], sS: [240, 96], aEnc: [[[228, 43], [238, 43]], [[228, 103], [238, 103]]],
          cat: [296, 66], aCat: [[[277, 43], [287, 43], [287, 70], [294, 70]], [[277, 103], [287, 103], [287, 76], [294, 76]]], catLab: [332, 92, 100],
          aProj: [[369, 73], [382, 73]], proj: [384, 51, 76, 44],
          cmd: [14, 150, 126, 40], aCmd: [[140, 170], [154, 170]], tokz: [156, 150, 112, 40], tTok: [284, 165],
          aIn: [[[460, 73], [469, 73], [469, 91], [481, 91]], [[268, 170], [469, 170], [469, 91], [481, 91]]],
          row: { x0: 486, step: 13, s: 10, y: 86, labY: 108 }, llama: [476, 14, 230, 56], llT: [488, 33], llS: [488, 52], llC: [698, 42], link: true,
          axis: { x0: 486, x1: 696, y: 150, binY: 132, endY: 168 },
          cells: { x0: 486, step: 30.5, w: 28, y: 182, h: 22, brY: 210, labY: 222 },
          st: [14, 208, 440],
        });
      },
      narrow: {
        W: 360, H: 604,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            img: [77, 14, 76], imgLab: [115, 102, 120],
            dino: [12, 116, 104, 44], sig: [120, 116, 104, 44], aImg: [[[100, 90], [64, 114]], [[130, 90], [172, 114]]],
            cell: [8, 12], dS: [48, 176], sS: [156, 176], aEnc: [[[64, 160], [64, 174]], [[172, 160], [172, 174]]],
            cat: [83, 214], aCat: [[[64, 188], [64, 200], [94, 212]], [[172, 188], [172, 200], [136, 212]]], catLab: [154, 220, 100, 'left'],
            aProj: [[115, 226], [115, 250]], proj: [65, 252, 100, 40],
            cmd: [232, 40, 114, 46], aCmd: [[289, 86], [289, 114]], tokz: [232, 116, 114, 44], tTok: [263, 176],
            aIn: [[[115, 292], [115, 306], [108.5, 306], [108.5, 324]], [[289, 188], [289, 306], [167, 306], [167, 324]]],
            row: { x0: 76, step: 13, s: 10, y: 326, labY: 350 }, llama: [14, 364, 332, 54], llT: [26, 383], llS: [26, 402], llC: [336, 392], link: false,
            axis: { x0: 43, x1: 317, y: 452, binY: 436, endY: 470 },
            cells: { x0: 43, step: 40, w: 34, y: 486, h: 24, brY: 516, labY: 528 },
            st: [14, 552, 332],
          });
        },
      },
    });
  })();
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
    { q: 'Octo и OpenVLA устроены одинаково, просто OpenVLA больше?', o: ['Да: обе — трансформеры на данных Open X-Embodiment', 'Нет: Octo обучена с нуля на данных роботов и выдаёт действия диффузионной головой, OpenVLA — модель зрения и языка, которая выдаёт действия токенами', 'Нет: Octo — модель зрения и языка, а OpenVLA обучена с нуля'], a: 1, e: 'Octo — трансформер на 93 млн параметров без предобучения на интернете, кроме языкового энкодера t5. OpenVLA построена на Prismatic-7B с Llama 2 и двумя зрительными энкодерами и повторяет рецепт RT-2: 256 корзин на ось, действия — токены словаря.' },
    { q: 'Токены-считыватели в Octo меняют то, что видят токены наблюдения?', o: ['Да, через внимание в обе стороны', 'Нет: они читают остальные токены, но их не читает никто', 'Они заменяют токены наблюдения'], a: 1, e: 'Считыватели похожи на [CLS] в BERT: собирают сводку о наблюдении для головы действий и ни на что не влияют. Поэтому новую голову можно добавить, не трогая основу.' },
    { q: 'LoRA дообучает только последний слой модели?', o: ['Да, остальные слои заморожены', 'Нет: она добавляет к каждой матрице весов добавку B·A малого ранга, а сами матрицы заморожены', 'Нет: она дообучает только зрительный энкодер'], a: 1, e: 'Дообучение только последнего слоя у OpenVLA дало 30,3% успешных попыток, LoRA на всех линейных слоях — 68,2%, почти как все веса (69,7%).' },
    { q: 'Чем выше ранг LoRA, тем лучше результат?', o: ['Да, ранг 64 вдвое лучше ранга 32', 'Почти не влияет: у OpenVLA ранги 32 и 64 дали одинаковые 68,2%', 'Нет: высокий ранг всегда переобучается'], a: 1, e: 'Параметров при ранге 64 вдвое больше, а успех тот же. В нашей лаборатории ранги от 1 до 8 тоже дали почти одинаковый успех. Авторы советуют ранг 32.' },
    { q: 'После дообучения через LoRA модель работает медленнее: добавились новые матрицы?', o: ['Да, примерно вдвое', 'Нет: добавку B·A можно прибавить к W, и слой снова одна матрица того же размера', 'Да, если ранг больше 8'], a: 1, e: 'W + B·A — матрица того же размера, что W. Её считают один раз после обучения, и модель работает так же быстро, как исходная.' },
    { q: 'Квантование OpenVLA до 4 бит сильно портит модель?', o: ['Да, 4 бита — слишком грубо для действий', 'Нет: 71,9% против 71,3% в 16 битах при 7,0 ГБ памяти вместо 16,8 ГБ', 'Да, но 8 бит не портят'], a: 1, e: 'Хуже вышло как раз с 8 битами — 58,1%, но из-за скорости: модель выдавала 1,2 действия в секунду. Когда робот ждал каждое действие, все три варианта сравнялись.' },
    { q: 'Голова с токенами действий, как и регрессия, выдаёт среднее двух правильных действий?', o: ['Да, токены тоже усредняют', 'Нет: самый вероятный токен выбирает одно действие и всегда одно и то же; среднее выдаёт регрессия', 'Нет: токены выбирают действие случайно'], a: 1, e: 'Токен x выбирает одну миску, токен y — согласованно с ним. Ответ точен до ширины корзины и не меняется от вопроса к вопросу. Ответы то в одну, то в другую миску даёт диффузия.' },
    { q: 'OpenVLA сильнее RT-2-X во всех категориях задач?', o: ['Да, на 16,5 процентного пункта в каждой', 'Нет: в задачах, где нужно знание из интернета, RT-2-X сильнее', 'Нет: RT-2-X сильнее везде, кроме робота Google'], a: 1, e: 'В семантическом обобщении на WidowX у RT-2-X 38,8%, у OpenVLA — 36,3%. RT-2-X дообучали вместе с веб-данными, OpenVLA — только на данных роботов.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('ft', () => { mis.ft = LabFT.init(); }); safe('head', () => { mis.head = LabHead.init(); }); safe('tbl', () => { mis.tbl = LabTbl.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['fMis', 'hMis', 'tMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l35 = { mis, SPEED, Store, LabFT, LabHead, LabTbl, L35 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
