/* =====================================================================
   ui-l23.js — урок 2.3 «LLM-планировщики и VoxPoser». Интерактивы — миссии
   на живой сцене (shared/missions.js):
   1) SayCan: три планировщика рядом на одной кухне Ады — только языковая
      модель, только аффорданс и их произведение; оценки на каждом шаге;
   2) Inner Monologue: журнал «подсказка модели — что случилось на кухне»,
      поиск шага, где план разошёлся с кухней, детектор успеха и его ошибка;
   3) Code as Policies: пошаговое исполнение программы, журнал вызовов
      функций робота и функции, которые модель дописывает сама;
   4) VoxPoser: код по строкам строит карты, планировщик ищет путь,
      вазу можно двигать, в том числе пока захват едет.
   Движок — l23/engine.js (без DOM).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
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
const n2 = (v) => fmt(v, 2);

/* =====================================================================
   Кухня спереди: шкаф, кофемашина, чайник, сахар, холодильник, стол, Ада.
   Логические координаты 720 × 300.
   ===================================================================== */
const KitchenDraw = (() => {
  const W = 720, H = 300, FLOOR = 266, TOP = 176;
  const AT = { cupboard: 82, machine: 211, kettle: 304, sugar: 373, fridge: 480, table: 552, idle: 300 };
  const colors = () => {
    const d = HeroKit.dark();
    return { cupFill: d ? '#d9d6cc' : '#ffffff', cupLine: d ? '#b0afa6' : '#3d3c38', coffee: '#6b3f22', milk: d ? '#e6dcc6' : '#efe6d2', oat: '#dcc79a',
      floor: d ? '#262624' : '#e9e6dc', wood: d ? '#3a352c' : '#d9c7a6', adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', steel: d ? '#55544f' : '#9a978d' };
  };
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.roundRect(x, y, w, hh, r); }
  /** Чашка: x — центр, y — низ. fill: null | 'coffee' | смесь. */
  function cup(c, x, y, K, P, w) {
    const cw = 22, ch = 20;
    c.lineWidth = 2; c.strokeStyle = K.cupLine;
    c.beginPath(); c.arc(x + cw / 2 + 1, y - ch / 2, 6, -Math.PI / 2, Math.PI / 2); c.stroke();
    rr(c, x - cw / 2, y - ch, cw, ch, [2, 2, 7, 7]); c.fillStyle = K.cupFill; c.fill(); c.stroke();
    if (w && (w.coffee || w.milkIn)) {
      const top = y - ch + 4; c.save(); rr(c, x - cw / 2 + 2, top, cw - 4, ch - 6, [1, 1, 5, 5]); c.clip();
      if (w.coffee) { c.fillStyle = K.coffee; c.fillRect(x - cw / 2, top + (w.milkIn ? 5 : 0), cw, ch); }
      if (w.milkIn) { c.fillStyle = w.milkIn === 'oat' ? K.oat : K.milk; c.fillRect(x - cw / 2, top, cw, w.coffee ? 5 : ch); }
      c.restore();
    }
  }
  function carton(c, x, y, kind, K, P) {           // x — центр, y — низ
    const w = 18, hh = 34;
    c.lineWidth = 1.6; c.strokeStyle = K.cupLine;
    c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - hh + 8); c.lineTo(x, y - hh); c.lineTo(x + w / 2, y - hh + 8); c.lineTo(x + w / 2, y); c.closePath();
    c.fillStyle = kind === 'oat' ? K.oat : K.cupFill; c.fill(); c.stroke();
    c.fillStyle = kind === 'oat' ? '#8a6d2f' : P.cl; c.fillRect(x - w / 2 + 3, y - 18, w - 6, 7);
  }
  function sugar(c, x, y, K) {
    c.lineWidth = 1.8; c.strokeStyle = K.cupLine; c.fillStyle = K.cupFill;
    c.beginPath(); c.moveTo(x - 15, y - 16); c.lineTo(x + 15, y - 16); c.quadraticCurveTo(x + 13, y, x, y); c.quadraticCurveTo(x - 13, y, x - 15, y - 16); c.fill(); c.stroke();
    rr(c, x - 13, y - 21, 26, 5, 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y - 23, 2.5, 0, 7); c.fillStyle = K.cupLine; c.fill();
  }
  function ada(c, x, K, P, w) {
    const top = 186;
    c.lineWidth = 2.4; c.strokeStyle = K.adaLine; c.fillStyle = K.adaFill;
    rr(c, x - 17, top + 36, 34, 38, 12); c.fill(); c.stroke();                       // корпус
    c.beginPath(); c.arc(x, top + 52, 4, 0, 7); c.fillStyle = P.hy; c.fill();        // метка
    c.fillStyle = K.adaFill; rr(c, x - 22, top, 44, 36, 14); c.fill(); c.stroke();    // голова
    rr(c, x - 15, top + 7, 30, 20, 8); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(x - 6, top + 17, 2.6, 3.6, 0, 0, 7); c.ellipse(x + 6, top + 17, 2.6, 3.6, 0, 0, 7); c.fill();
    c.strokeStyle = K.adaLine; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 17, top + 44); c.lineTo(x - 27, top + 58); c.moveTo(x + 17, top + 44); c.lineTo(x + 27, top + 58); c.stroke();
    if (w.cup === 'hand') cup(c, x + 30, top + 74, K, P, w);
    const held = w.held.slice(-1)[0];
    if (held === 'milk' || held === 'oat') carton(c, x - 30, top + 74, held, K, P);
    else if (held === 'sugar') sugar(c, x - 30, top + 74, K);
  }
  /** Нарисовать кухню в состоянии w. o: { at — где Ада, step — {n, text, ok, why} или null, title } */
  function draw(cv, w, o) {
    o = o || {};
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = K.floor; c.fillRect(0, FLOOR, W, H - FLOOR);
    // подсветка места, где Ада выполняет шаг
    if (o.step && o.at && AT[o.at] != null) {
      const x = AT[o.at]; c.setLineDash([5, 4]); c.lineWidth = 1.6; c.strokeStyle = o.step.ok ? P.good : P.bad;
      rr(c, x - 52, 26, 104, FLOOR - 20, 12); c.stroke(); c.setLineDash([]);
    }
    // верхний шкаф
    const cb = { x: 28, y: 34, w: 108, h: 94 };
    if (w.cupboard === 'open') {
      rr(c, cb.x, cb.y, cb.w, cb.h, 6); c.fillStyle = P.bg2; c.fill(); c.lineWidth = 1.6; c.strokeStyle = P.ink3; c.stroke();
      c.beginPath(); c.moveTo(cb.x, 96); c.lineTo(cb.x + cb.w, 96); c.stroke();
      c.beginPath(); c.moveTo(cb.x, cb.y); c.lineTo(cb.x - 22, cb.y + 10); c.lineTo(cb.x - 22, cb.y + cb.h - 10); c.lineTo(cb.x, cb.y + cb.h); c.closePath(); c.fillStyle = P.surf; c.fill(); c.stroke();
      if (w.cup === 'cupboard') cup(c, 82, 96, K, P, null);
    } else {
      rr(c, cb.x, cb.y, cb.w, cb.h, 6); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.6; c.strokeStyle = P.ink3; c.stroke();
      rr(c, cb.x + 6, cb.y + 6, cb.w - 12, cb.h - 12, 4); c.stroke();
      c.beginPath(); c.arc(cb.x + cb.w - 16, cb.y + cb.h - 18, 3.5, 0, 7); c.fillStyle = P.ink3; c.fill();
    }
    // столешница и тумбы
    c.fillStyle = K.wood; c.fillRect(14, TOP, 400, 8);
    c.fillStyle = P.surf; c.fillRect(18, TOP + 8, 392, FLOOR - TOP - 8); c.strokeStyle = P.line; c.lineWidth = 1.2;
    for (let x = 18; x < 410; x += 98) { c.strokeRect(x + 4, TOP + 14, 90, FLOOR - TOP - 20); }
    // кофемашина
    rr(c, 174, 88, 74, 88, 8); c.fillStyle = K.steel; c.fill(); c.strokeStyle = P.ink3; c.stroke();
    rr(c, 180, 94, 62, 30, 5); c.fillStyle = P.surf; c.fill();
    c.beginPath(); c.arc(229, 109, 5, 0, 7); c.fillStyle = w.coffee ? P.good : P.ink3; c.fill();
    c.fillStyle = P.ink2; c.fillRect(205, 124, 12, 10);
    c.fillStyle = P.ink3; c.fillRect(186, TOP - 6, 50, 6);
    if (w.spill) { c.beginPath(); c.ellipse(211, TOP - 1, 26, 4, 0, 0, 7); c.fillStyle = w.spill === 'coffee' ? K.coffee : K.milk; c.globalAlpha = 0.9; c.fill(); c.globalAlpha = 1; }
    if (w.cup === 'machine') cup(c, 211, TOP - 6, K, P, w);
    // чайник
    c.lineWidth = 2; c.strokeStyle = K.cupLine; c.fillStyle = P.surf;
    c.beginPath(); c.moveTo(288, TOP); c.lineTo(292, 140); c.lineTo(318, 140); c.lineTo(322, TOP); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(292, 146); c.lineTo(280, 138); c.stroke();
    c.beginPath(); c.arc(321, 156, 9, -Math.PI / 2, Math.PI / 2); c.stroke();
    if (w.kettle) { c.strokeStyle = P.ink3; c.lineWidth = 1.6; for (const dx of [-6, 2, 10]) { c.beginPath(); c.moveTo(300 + dx, 134); c.bezierCurveTo(296 + dx, 124, 306 + dx, 120, 300 + dx, 108); c.stroke(); } }
    // сахар
    if (!w.held.includes('sugar')) sugar(c, 373, TOP, K);
    // холодильник
    rr(c, 438, 30, 84, FLOOR - 30, 8); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(438, 96); c.lineTo(522, 96); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(512, 58); c.lineTo(512, 82); c.moveTo(512, 108); c.lineTo(512, 140); c.stroke();
    rr(c, 448, 150, 58, 70, 6); c.fillStyle = P.bg2; c.fill(); c.lineWidth = 1.2; c.strokeStyle = P.line; c.stroke();
    c.beginPath(); c.moveTo(448, 206); c.lineTo(506, 206); c.stroke();
    if (w.milkLeft && !w.held.includes('milk')) carton(c, 465, 206, 'milk', K, P);
    else if (!w.milkLeft) { c.setLineDash([3, 3]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(456, 172, 18, 34); c.setLineDash([]); HeroKit.label(c, k, 'нет', 465, 166, { px: 10.5, color: P.ink3, halo: false }); }
    if (!w.held.includes('oat')) carton(c, 491, 206, 'oat', K, P);
    // стол и человек
    c.beginPath(); c.arc(664, 146, 16, 0, 7); c.fillStyle = K.adaFill; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.8; c.stroke();
    rr(c, 636, 164, 56, 40, [16, 16, 4, 4]); c.fill(); c.stroke();
    c.fillStyle = K.wood; c.fillRect(584, 200, 130, 7); c.fillStyle = P.ink3; c.fillRect(592, 207, 5, FLOOR - 207); c.fillRect(702, 207, 5, FLOOR - 207);
    if (w.cup === 'user') cup(c, 618, 200, K, P, w);
    // Ада
    const ax = AT[o.at] != null ? AT[o.at] : AT.idle;
    ada(c, ax, K, P, w);
    // подписи
    // на узком экране подписи не помещаются рядом: чайник и сахарницу узнают по рисунку
    const narrow = k > 1.5;
    for (const [t, x, minor] of [['шкаф', 82], ['кофемашина', 211], ['чайник', 304, 1], ['сахар', 373, 1], ['холодильник', 480], ['ты', 664]]) if (!(narrow && minor)) HeroKit.label(c, k, t, x, 284, { px: narrow ? 10.5 : 11, color: P.ink3, haloColor: K.floor });
    if (o.title) HeroKit.label(c, k, o.title, W / 2, 14, { px: 12.5, weight: 700, color: o.step ? (o.step.ok ? P.good : P.bad) : P.ink2, haloColor: P.bg });
  }
  return { draw, AT, W, H };
})();
const stepTitle = (s) => s ? `Шаг ${s.n}: ${s.text}${s.id === 'done' ? '' : s.ok ? ' ✓' : ' ✗ ' + s.why}` : '';

/* =====================================================================
   1. SayCan: три планировщика на одной кухне
   ===================================================================== */
const LabPlan = (() => {
  const E = L23, MODES = [['llm', 'Только языковая модель'], ['aff', 'Только аффорданс'], ['saycan', 'SayCan: произведение']];
  const COLS = { llm: 0, aff: 1, saycan: 2 };
  const st = { cupboard: 'closed', milk: 'yes', cup: 'cupboard', plans: {}, shown: new Set(), sel: null, anim: {}, busy: false };
  let ctl = null;
  const worldOpts = () => ({ cupboard: st.cupboard, milk: st.milk === 'yes', cup: st.cup });
  const compute = (m) => { st.plans[m] = E.plan(m, E.world(worldOpts())); };
  /** Какой шаг показать после плана: при неудаче — первый сорвавшийся или последний, при успехе — первый (там видно, почему план не совпал с рецептом). */
  function defaultSel(m) { const p = st.plans[m]; if (!p) return null; if (p.success) return { mode: m, n: 1 }; const f = p.steps.find((s) => !s.ok && s.id !== 'done'); return { mode: m, n: f ? f.n : p.steps.length }; }
  function fixSel() {
    if (st.sel && st.plans[st.sel.mode] && st.shown.has(st.sel.mode) && st.sel.n <= st.plans[st.sel.mode].steps.length) return;
    const m = ['saycan', 'aff', 'llm'].find((x) => st.shown.has(x) && st.plans[x]); st.sel = m ? defaultSel(m) : null;
  }
  function sum(m) {
    const p = st.plans[m]; if (!p || !st.shown.has(m)) return null;
    const f = p.steps.find((s) => !s.ok && s.id !== 'done');
    return { mode: m, success: p.success, finished: p.finished, ids: p.steps.map((s) => s.id), n: p.steps.length, fails: p.failedSteps, firstFail: f ? { n: f.n, id: f.id, why: f.why } : null, verdict: p.verdict.text };
  }
  function state() { return { cupboard: st.cupboard, milk: st.milk, cup: st.cup, llm: sum('llm'), aff: sum('aff'), saycan: sum('saycan'), sel: st.sel }; }
  function selStep() { if (!st.sel) return null; const p = st.plans[st.sel.mode]; return p ? p.steps[st.sel.n - 1] : null; }
  function drawScene() {
    const s = selStep(), w = s ? s.after : E.world(worldOpts());
    KitchenDraw.draw($('#sCv'), w, { at: s ? (s.id === 'done' ? lastAt(st.sel) : E.SKILLS[s.pick].at) : null, step: s && s.id !== 'done' ? s : null, title: s ? (st.sel ? MODES[COLS[st.sel.mode]][1] + ' · ' : '') + stepTitle(s) : 'Просьба: «Ада, сделай мне кофе с молоком»' });
  }
  function lastAt(sel) { const p = st.plans[sel.mode]; for (let i = sel.n - 2; i >= 0; i--) { const a = E.SKILLS[p.steps[i].pick].at; if (a) return a; } return null; }
  function renderPlans() {
    const box = $('#sPlans'); box.innerHTML = '';
    for (const [m, name] of MODES) {
      const p = st.plans[m], col = h('div', { class: 'plan-col', 'data-mode': m, hidden: !st.shown.has(m) });
      const upto = st.anim[m] != null ? st.anim[m] : p ? p.steps.length : 0, complete = p && upto >= p.steps.length;
      const v = complete ? h('span', { class: 'plan-v ' + (p.success ? 'ok' : 'no') }, (p.success ? '✓ ' : '✗ ') + p.verdict.text + (p.finished ? '' : ', план оборван')) : h('span', { class: 'plan-v' }, p ? 'составляется…' : '');
      col.append(h('div', { class: 'plan-h' }, h('b', null, name), v));
      const ol = h('ol', { class: 'plan-steps' });
      if (p) for (const s of p.steps.slice(0, upto)) {
        const sel = st.sel && st.sel.mode === m && st.sel.n === s.n;
        const li = h('li', { class: (s.id === 'done' ? '' : s.ok ? 'ok' : 'no') + (sel ? ' sel' : ''), 'data-n': s.n, title: 'Показать оценки на этом шаге' }, h('span', { class: 'pn' }, s.n + '.'), h('span', { class: 'pt' }, s.text), h('span', { class: 'pi' }, s.id === 'done' ? '' : s.ok ? '✓' : '✗'));
        if (!s.ok && s.id !== 'done') li.append(h('small', { class: 'pw' }, s.why));
        li.addEventListener('click', () => { if (st.busy) return; st.sel = { mode: m, n: s.n }; render(); });
        ol.append(li);
      }
      if (!p) ol.append(h('li', { class: 'plan-empty' }, 'план ещё не составлен'));
      col.append(ol); box.append(col);
    }
  }
  function renderScores() {
    const box = $('#sScores'); box.innerHTML = '';
    const s = selStep(); if (!s) return;
    const m = st.sel.mode, used = { llm: 'llm', aff: 'aff', saycan: 'prod' }[m], pmax = Math.max(1e-9, ...s.prod);
    box.append(h('div', { class: 'sc-h' }, `Выбор на шаге ${s.n} · ${MODES[COLS[m]][1]}`));
    const g = h('div', { class: 'sc-grid' });
    g.append(h('div', { class: 'sc-th' }, 'навык'), h('div', { class: 'sc-th' + (used === 'llm' ? ' used' : '') }, 'полезно: LLM'), h('div', { class: 'sc-th' + (used === 'aff' ? ' used' : '') }, 'выполнимо: аффорданс'), h('div', { class: 'sc-th' + (used === 'prod' ? ' used' : '') }, 'произведение'));
    E.SKILLS.forEach((sk, i) => {
      const pick = i === s.pick;
      g.append(h('div', { class: 'sc-name' + (pick ? ' sc-row-sel' : '') }, sk.text));
      for (const [key, col] of [['llm', 'var(--e2e)'], ['aff', 'var(--classic)'], ['prod', 'var(--hybrid)']]) {
        const v = s[key][i], wv = key === 'prod' ? v / pmax : v;
        g.append(h('div', { class: 'bar' + (key === used ? ' used' : '') + (key === used && pick ? ' pick' : ''), style: `--c:${col}` }, h('i', { style: `width:${Math.min(100, wv * 100).toFixed(1)}%` }), h('b', null, n2(v))));
      }
    });
    box.append(g, h('p', { class: 'sc-note' }, 'Оценки языковой модели заданы заранее: они иллюстрируют принцип, а не ответы настоящей модели. Аффордансы — правила от состояния кухни. Полоски произведения — в долях от наибольшего на этом шаге.'));
  }
  function out() {
    const s = selStep();
    if (!s) { setOut($('#sOut'), 'Составь план: шаги появятся под сценой, а при нажатии на шаг — оценки всех 11 навыков на этом шаге.'); return; }
    const p = st.plans[st.sel.mode];
    setOut($('#sOut'), `${MODES[COLS[st.sel.mode]][1]}: ${p.steps.length} ${plural(p.steps.length, 'шаг', 'шага', 'шагов')}, сорвалось ${p.failedSteps}. Итог: <b>${p.verdict.text}</b>.`);
  }
  function render() { renderPlans(); renderScores(); drawScene(); out(); }
  async function run(m) {
    st.busy = true; compute(m); st.shown.add(m); const p = st.plans[m];
    for (let n = 1; n <= p.steps.length; n++) { st.anim[m] = n; st.sel = { mode: m, n }; render(); await wait(380); }
    delete st.anim[m]; st.sel = defaultSel(m); render(); st.busy = false;
    return Object.assign(sum(m), { first: firstScores(m) });
  }
  function firstScores(m) { const p = st.plans[m], s = p.steps[0], i = (id) => E.SI[id]; return { llmCup: s.llm[i('cup')], affCup: s.aff[i('cup')], prodCup: s.prod[i('cup')], llmOpen: s.llm[i('open')], affOpen: s.aff[i('open')], prodOpen: s.prod[i('open')] }; }
  function setWorld(key, v) { if (st.busy) return; st[key] = v; segSet({ cupboard: '#sCupboard', milk: '#sMilk', cup: '#sCup' }[key], v); for (const m of st.shown) compute(m); fixSel(); render(); if (ctl) ctl.update(); }
  function show(list) { st.shown = new Set(list); for (const m of list) compute(m); st.sel = null; fixSel(); render(); }
  function setAll(o) { Object.assign(st, o); segSet('#sCupboard', st.cupboard); segSet('#sMilk', st.milk); segSet('#sCup', st.cup); }
  const api = {
    reset() { setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); st.plans = {}; show([]); },
    state, run, setWorld, show, setAll,
    select(m, n) { st.sel = { mode: m, n }; render(); },
    firstScores,
  };
  const missions = [
    { short: 'Языковая модель', title: 'Шаги выбирает только языковая модель', text: 'Просьба — «Ада, сделай мне кофе с молоком». Шкаф с чашкой закрыт. На каждом шаге языковая модель оценивает 11 навыков, и Ада выполняет самый полезный по её мнению. Составь план и посмотри, как Ада его выполнит.',
      onEnter: (X) => { X.setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); X.show([]); },
      bet: { q: 'справится ли Ада?', options: ['Да: модель знает, как варят кофе', 'Нет: первый же шаг не выйдет, шкаф закрыт', 'Нет: модель предложит сходить в кофейню'], answer: (r) => (r.success ? 0 : r.firstFail && r.firstFail.n === 1 ? 1 : 2) },
      action: { label: 'Составить план', run: (X) => X.run('llm') },
      criteria: [{ label: 'План составлен до шага «готово»', test: (r) => r.finished }, { label: 'В плане есть шаг, который Ада не может выполнить', test: (r) => !!r.firstFail }],
      explain: (r) => `Модель выбрала шаги в порядке рецепта: чашка, кофемашина, кофе, молоко, налить, принести. Порядок верный, но первый же шаг невыполним: ${r.firstFail.why}, а закрытую дверцу модель не видит. Дальше план идёт как написан: Ада «ставит» под кофемашину чашку, которой нет в захвате, и кофе льётся на поддон. Кофейни в плане нет: модель выбирает только из навыков робота. Нажми на любой шаг — под планом видно, как модель оценила все 11 навыков.` },
    { short: 'Аффорданс', title: 'Шаги выбирает только функция ценности', text: 'Теперь наоборот: Ада выполняет навык, который в текущем состоянии кухни удастся с наибольшей вероятностью. Полезность для просьбы не учитывается.',
      onEnter: (X) => { X.setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); X.show(['llm']); },
      bet: { q: 'что Ада сделает первым?', options: ['Откроет шкаф: без этого кофе не сварить', 'Вскипятит чайник: этот навык удаётся надёжнее всех', 'Возьмёт чашку из шкафа'], answer: (r) => ({ open: 0, kettle: 1, cup: 2 }[r.ids[0]] == null ? 1 : { open: 0, kettle: 1, cup: 2 }[r.ids[0]]) },
      action: { label: 'Составить план', run: (X) => X.run('aff') },
      criteria: [{ label: 'План составлен до шага «готово»', test: (r) => r.finished }, { label: 'Каждый шаг удался', test: (r) => r.fails === 0 }, { label: 'Просьба всё равно не выполнена', test: (r) => !r.success }],
      explain: () => 'Функция ценности знает кухню, но не знает просьбы. Первым идёт чайник — самый надёжный навык, потом шкаф и сахар. Все шаги удались, а человек получил пустую чашку: «принести» выполнимо, и сварен ли кофе, функции ценности всё равно. Одна оценка знает задачу, другая — кухню, и нужны обе.' },
    { short: 'SayCan', title: 'Перемножь две оценки', text: 'SayCan выбирает навык с наибольшим произведением: полезность от языковой модели умножается на выполнимость от функции ценности. Составь план на той же кухне.',
      onEnter: (X) => { X.setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); X.show(['llm', 'aff']); },
      bet: { q: 'с какого шага начнёт SayCan?', options: ['«Взять чашку из шкафа»: так начинается рецепт', '«Открыть шкаф»: полезность ниже, зато шаг выполним', '«Вскипятить чайник»: он выполним надёжнее всех'], answer: (r) => ({ cup: 0, open: 1, kettle: 2 }[r.ids[0]] == null ? 1 : { cup: 0, open: 1, kettle: 2 }[r.ids[0]]) },
      action: { label: 'Составить план', run: (X) => X.run('saycan') },
      criteria: [{ label: 'Кофе с молоком у тебя', test: (r) => r.success }, { label: 'Ни одного сорвавшегося шага', test: (r) => r.fails === 0 }],
      explain: (r) => `SayCan выполнил просьбу за ${r.n} шагов. На первом шаге у «взять чашку из шкафа» полезность ${n2(r.first.llmCup)}, но выполнимость ${n2(r.first.affCup)}, и произведение ${n2(r.first.prodCup)}. У «открыть шкаф» полезность всего ${n2(r.first.llmOpen)}, зато выполнимость ${n2(r.first.affOpen)}, и произведение ${n2(r.first.prodOpen)} — больше всех. Так в плане появился шаг, которого нет в рецепте. В статье PaLM-SayCan составил верный план для 84% из 101 просьбы, а без функций ценности — для 67%.` },
    { short: 'Нет молока', title: 'Шкаф открыт, а молоко кончилось', text: 'Открой шкаф: тогда первый шаг рецепта станет выполнимым. Потом убери из холодильника молоко. Все три плана пересчитываются сразу.',
      controls: ['cupboard', 'milk'], onEnter: (X) => { X.setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); X.show(['llm', 'aff', 'saycan']); },
      criteria: [{ label: 'Шкаф открыт', test: (r, s) => s.cupboard === 'open' }, { label: 'Молока нет', test: (r, s) => s.milk === 'no' }, { label: 'Только языковая модель: просьба не выполнена', test: (r, s) => !!s.llm && !s.llm.success && s.milk === 'no' }, { label: 'SayCan: просьба выполнена', test: (r, s) => !!s.saycan && s.saycan.success && s.milk === 'no' }],
      hint: 'Переключатели «Шкаф» и «Молоко» — под сценой. Посмотри и на промежуточный результат: с открытым шкафом и молоком языковая модель справляется одна.',
      explain: () => 'С открытым шкафом рецепт языковой модели совпадает с кухней, и модель справляется одна. Без молока она всё равно выбирает «взять молоко»: в рецепте молоко, а пустого холодильника модель не видит. У SayCan выполнимость этого шага 0,02, и выигрывает «взять овсяное молоко»: полезность ниже, но шаг выполним. Аффорданс отсекает невозможное, а из оставшегося выбирает языковая модель.' },
    { short: 'Чашка на месте', title: 'Чашка уже стоит под кофемашиной', text: 'Шкаф снова закрыт, молоко есть. Пусть кто-то уже поставил чашку под кофемашину: переключи «Чашка» и посмотри, с какого шага начнёт SayCan.',
      controls: ['cupboard', 'milk', 'cup'], onEnter: (X) => { X.setAll({ cupboard: 'closed', milk: 'yes', cup: 'cupboard' }); X.show(['llm', 'aff', 'saycan']); },
      criteria: [{ label: 'Чашка под кофемашиной', test: (r, s) => s.cup === 'machine' }, { label: 'SayCan начинает с «сварить кофе»', test: (r, s) => !!s.saycan && s.saycan.ids[0] === 'brew' }, { label: 'SayCan выполнил просьбу', test: (r, s) => !!s.saycan && s.saycan.success }],
      explain: () => 'SayCan пропустил три шага рецепта. «Поставить чашку под кофемашину» уже сделано, и аффорданс у этого навыка ноль: так и в статье — навык, результат которого уже есть, не выбирают. «Взять чашку из шкафа» почти невыполнимо, а у «сварить кофе» выполнимость стала высокой, и произведение вышло наибольшим. Одна языковая модель по-прежнему начинает с «взять чашку из шкафа» и «поставить чашку под кофемашину»: оба шага срываются, хотя вреда не приносят.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй кухню и сравнивай три плана, нажимай на шаги, чтобы видеть оценки. Найди кухню, где одна языковая модель справляется, а SayCan начинает с другого шага, и объясни почему.', final: true, controls: ['cupboard', 'milk', 'cup'] },
  ];
  function init() {
    segBind('#sCupboard', (v) => setWorld('cupboard', v)); segBind('#sMilk', (v) => setWorld('milk', v)); segBind('#sCup', (v) => setWorld('cup', v));
    ctl = mountMissions('#sMis', missions, api, { controls: { cupboard: '#wrapSCupboard', milk: '#wrapSMilk', cup: '#wrapSCup' } });
    render(); redrawOn(drawScene);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Inner Monologue: журнал подсказки и кухни, детектор успеха
   ===================================================================== */
const LabMono = (() => {
  const E = L23;
  const st = { fb: 'none', det: 'ok', slip: '1', plan: null, key: null, upto: null, sel: null, busy: false, detective: false };
  let ctl = null;
  const key = () => [st.fb, st.det, st.slip].join('|');
  function compute() { st.plan = E.plan('saycan', E.world({ slips: +st.slip }), { feedback: st.fb, liar: st.fb === 'success' && st.det === 'liar' ? 1 : 0 }); st.key = key(); }
  /** Первый шаг, после которого модель считает одно, а на кухне другое. */
  function diverge(p) { const s = p && p.steps.find((x) => !x.ok && x.id !== 'done' && x.fb !== false); return s ? s.n : null; }
  function sum() {
    const p = st.plan; if (!p) return { has: false, fb: st.fb, det: st.det, slip: st.slip, sel: st.sel };
    return { has: true, current: st.key === key(), success: p.success, finished: p.finished, fb: st.fb, det: st.det, slip: st.slip, cupTries: p.steps.filter((s) => s.id === 'cup').length, lied: p.steps.some((s) => s.lied), diverge: diverge(p), n: p.steps.length, verdict: p.verdict.text, sel: st.sel };
  }
  function renderLog() {
    const box = $('#mLog'); box.innerHTML = '';
    const p = st.plan; if (!p) return;
    const upto = st.upto != null ? st.upto : p.steps.length;
    box.append(h('div', { class: 'mono-h' }, h('div', null, 'Подсказка языковой модели'), h('div', null, 'Что случилось на кухне')));
    box.append(h('div', { class: 'mono-r' }, h('div', { class: 'mp' }, 'Человек: ' + E.INSTRUCTION), h('div', { class: 'mw' }, '')));
    const dv = diverge(p);
    for (const s of p.steps.slice(0, upto)) {
      const mp = h('div', { class: 'mp' }, `Ада: ${s.n}. ${s.text}`);
      if (s.fb !== undefined) mp.append(h('span', { class: 'mfb' + (s.lied ? ' lie' : '') }, `Детектор: успех — ${s.fb ? 'да' : 'нет'}`));
      const mw = s.id === 'done' ? h('div', { class: 'mw ' + (p.success ? 'ok' : 'no') }, (p.success ? '✓ ' : '✗ ') + p.verdict.text) : h('div', { class: 'mw ' + (s.ok ? 'ok' : 'no') }, s.ok ? '✓ получилось' : '✗ ' + s.why);
      const row = h('div', { class: 'mono-r step' + (st.sel === s.n ? (st.detective && st.sel === dv ? ' found' : ' sel') : ''), 'data-n': s.n, title: 'Показать кухню после этого шага' }, mp, mw);
      row.addEventListener('click', () => { if (st.busy) return; st.sel = s.n; render(); if (ctl) ctl.update(); });
      box.append(row);
    }
  }
  function drawScene() {
    const p = st.plan, n = st.sel || (p ? (st.upto != null ? st.upto : p.steps.length) : 0), s = p && n ? p.steps[n - 1] : null;
    const w = s ? s.after : E.world({ slips: +st.slip });
    let at = s ? E.SKILLS[s.pick].at : null; if (s && !at) for (let i = n - 2; i >= 0 && !at; i--) at = E.SKILLS[p.steps[i].pick].at;
    KitchenDraw.draw($('#mCv'), w, { at, step: s && s.id !== 'done' ? s : null, title: s ? stepTitle(s) : 'Просьба: «Ада, сделай мне кофе с молоком»' });
  }
  function out() {
    const p = st.plan;
    if (!p) { setOut($('#mOut'), 'Запусти SayCan: журнал появится под сценой. Нажми на строку журнала, чтобы увидеть кухню после этого шага.'); return; }
    const stale = st.key !== key() ? ' Настройки изменились — запусти ещё раз.' : '';
    setOut($('#mOut'), `${st.fb === 'success' ? 'С детектором успеха' : 'Без обратной связи'}: ${p.steps.length} ${plural(p.steps.length, 'шаг', 'шага', 'шагов')}, итог — <b>${p.verdict.text}</b>.${stale}`);
  }
  function render() { renderLog(); drawScene(); out(); }
  async function run() {
    st.busy = true; compute(); st.sel = null;
    for (let n = 1; n <= st.plan.steps.length; n++) { st.upto = n; render(); await wait(380); }
    st.upto = null; st.busy = false; render();
    return sum();
  }
  function set(o) { Object.assign(st, o); segSet('#mFb', st.fb); segSet('#mDet', st.det); segSet('#mSlip', st.slip); render(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.plan = null; st.sel = null; st.upto = null; st.detective = false; set({ fb: 'none', det: 'ok', slip: '1' }); },
    state: sum, run, set,
    /** Для миссии «найди шаг»: журнал без обратной связи должен быть на месте. */
    ensure(o) { st.detective = true; set(o); if (!st.plan || st.key !== key()) { compute(); st.upto = null; } st.sel = null; render(); },
    select(n) { st.sel = n; render(); if (ctl) ctl.update(); },
  };
  const missions = [
    { short: 'Без обратной связи', title: 'Чашка выскользнула', text: 'Обратной связи нет: языковая модель видит только просьбу и выбранные шаги. При первой попытке чашка выскользнет из захвата. Запусти SayCan.',
      onEnter: (X) => X.set({ fb: 'none', det: 'ok', slip: '1' }),
      bet: { q: 'что будет после того, как чашка выскользнет?', options: ['SayCan возьмёт чашку ещё раз: аффорданс покажет, что захват пуст', 'План пойдёт дальше, будто чашка в захвате', 'Ада сразу скажет «готово»'], answer: (r) => (r.cupTries > 1 ? 0 : r.n <= 3 ? 2 : 1) },
      action: { label: 'Запустить SayCan', run: (X) => X.run() },
      criteria: [{ label: 'План выполнен до шага «готово»', test: (r) => r.finished }, { label: 'Просьба не выполнена', test: (r) => !r.success }],
      explain: () => 'Аффорданс у «поставить чашку под кофемашину» упал почти до нуля: захват пуст, и этот шаг SayCan не выбрал. Но «взять чашку» снова никто не предложил. Повтор может предложить только языковая модель, а в её истории шаг сделан, и следующим по рецепту она ждёт молоко. Дальше Ада берёт молоко и наливает его туда, где чашки нет.' },
    { short: 'Найди шаг', title: 'Найди, где план разошёлся с кухней', text: 'Сорвались три шага, но причина у них одна. Нажми в журнале на шаг, после которого подсказка языковой модели перестала совпадать с тем, что на кухне.',
      onEnter: (X) => X.ensure({ fb: 'none', det: 'ok', slip: '1' }),
      criteria: [{ label: 'Выбран шаг, после которого план разошёлся с кухней', test: (r, s) => s.has && s.sel != null && s.sel === s.diverge }],
      hint: 'Ищи первую строку, где справа ✗, а в подсказке слева об этом ничего нет.',
      explain: () => 'После шага 2 в подсказке записано «взять чашку из шкафа», и модель считает, что чашка в захвате, а чашка осталась в шкафу. Все следующие сбои выросли отсюда: «налить молоко» и «принести чашку» сорвались, потому что чашки нет. Чтобы модель узнала о сбое, его нужно вписать в ту же подсказку.' },
    { short: 'Детектор', title: 'Верни модели результат шага', text: 'Включи детектор успеха: после каждого шага в подсказку добавляется строка «Детектор: успех — да» или «нет». Модель та же, оценки те же.',
      controls: ['fb'], onEnter: (X) => X.set({ fb: 'none', det: 'ok', slip: '1' }),
      bet: { q: 'сколько раз Ада возьмётся за чашку?', options: ['Один: модель уже выбрала этот шаг', 'Два: после «нет» модель повторит шаг', 'Пока не кончатся шаги'], answer: (r) => (r.cupTries <= 1 ? 0 : r.cupTries === 2 ? 1 : 2) },
      action: { label: 'Запустить SayCan', run: (X) => X.run() },
      criteria: [{ label: 'Детектор успеха включён', test: (r) => r.fb === 'success' }, { label: 'Ада взялась за чашку второй раз', test: (r) => r.cupTries === 2 }, { label: 'Кофе с молоком у тебя', test: (r) => r.success }],
      fail: (r) => (r.fb !== 'success' ? 'Включи детектор успеха: переключатель «Обратная связь» под сценой.' : ''),
      explain: () => 'Строка «Детектор: успех — нет» вернула шаг в список несделанных, и языковая модель снова предложила «взять чашку из шкафа». Модель не дообучали: она прочитала обратную связь как продолжение диалога. В статье на кухне с помехами SayCan в задачах с перемещением не довёл до конца ни одной попытки, а Inner Monologue с детектором успеха и списком предметов — 75%.' },
    { short: 'Ошибка детектора', title: 'Детектор ответил неверно', text: 'Детектор успеха — тоже модель, и он ошибается. Пусть на сорвавшемся шаге он ответит «да».',
      controls: ['fb', 'det'], onEnter: (X) => X.set({ fb: 'success', det: 'liar', slip: '1' }),
      bet: { q: 'что будет с планом?', options: ['Ничего страшного: аффорданс всё поправит', 'План пойдёт так же, как без обратной связи', 'Модель всё равно повторит шаг'], answer: (r) => (r.success ? 0 : r.cupTries > 1 ? 2 : 1) },
      action: { label: 'Запустить SayCan', run: (X) => X.run() },
      criteria: [{ label: 'Детектор ответил «да» на сорвавшемся шаге', test: (r) => r.lied }, { label: 'Просьба не выполнена', test: (r) => !r.success }],
      fail: (r) => (!r.lied ? 'Нужен детектор, который ошибается: «Обратная связь» — детектор успеха, «Детектор» — ошибается.' : ''),
      explain: () => 'Модель верит обратной связи: «да» на шаге 2 значит для неё, что чашка в захвате, и план пошёл как без детектора. Потом детектор верно ответил «нет» на «налить молоко», модель повторила шаг, снова получила «нет» и закончила. В статье отмечают оба вида ошибок: ложное «нет» добавляет лишние повторы, ложное «да» прячет от модели настоящее состояние сцены.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй обратную связь, детектор и помеху, запускай SayCan и листай журнал. Сравни, сколько шагов стоит одна выскользнувшая чашка с детектором и без него.', final: true, controls: ['fb', 'det', 'slip'],
      action: { label: 'Запустить SayCan', run: (X) => X.run() } },
  ];
  function init() {
    segBind('#mFb', (v) => { if (!st.busy) set({ fb: v }); }); segBind('#mDet', (v) => { if (!st.busy) set({ det: v }); }); segBind('#mSlip', (v) => { if (!st.busy) set({ slip: v }); });
    ctl = mountMissions('#mMis', missions, api, { controls: { fb: '#wrapMFb', det: '#wrapMDet', slip: '#wrapMSlip' } });
    render(); redrawOn(drawScene);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   Панель кода: подсветка Python и строки с отметками
   ===================================================================== */
const CodeView = (() => {
  const KW = new Set(['def', 'for', 'in', 'if', 'and', 'or', 'not', 'return', 'while', 'break', 'True', 'False', 'None', 'lambda', 'range', 'len', 'max']);
  const PERCEPT = new Set(['detect_objects', 'get_pos', 'detect']), ACT = new Set(['pick_place', 'execute']), GENF = new Set(['is_empty', 'dist', 'stack_objects']);
  /** Разметка одной строки: комментарии, строки, ключевые слова, числа, функции робота и функции, которые пишет модель. */
  function hl(src) {
    let html = '', i = 0;
    const esc = (t) => escapeHtml(t);
    while (i < src.length) {
      const ch = src[i];
      if (ch === '#') { html += `<span class="tk-c">${esc(src.slice(i))}</span>`; break; }
      if (ch === '"' || ch === "'") { let j = i + 1; while (j < src.length && src[j] !== ch) j++; html += `<span class="tk-s">${esc(src.slice(i, j + 1))}</span>`; i = j + 1; continue; }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j), call = src[j] === '(';
        const cls = KW.has(w) ? 'tk-k' : call && PERCEPT.has(w) ? 'tk-p' : call && ACT.has(w) ? 'tk-a' : (GENF.has(w)) ? 'tk-g' : null;
        html += cls ? `<span class="${cls}">${esc(w)}</span>` : esc(w); i = j; continue;
      }
      if (/[0-9]/.test(ch)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; html += `<span class="tk-n">${esc(src.slice(i, j))}</span>`; i = j; continue; }
      html += esc(ch); i++;
    }
    return html;
  }
  /** blocks: [{ id, head?, lines: [text], fresh? }]; mark(id, l) → { cls, note, tog } */
  function render(box, blocks, mark) {
    box.innerHTML = '';
    let gl = 0;
    for (const b of blocks) {
      const blk = h('div', { class: 'code-blk' + (b.fresh ? ' fresh' : ''), 'data-b': b.id });
      if (b.head) blk.append(h('div', { class: 'code-blk-h' }, b.head));
      b.lines.forEach((t, l) => {
        gl++;
        const m = mark ? mark(b.id, l) || {} : {};
        const ln = h('div', { class: 'code-ln' + (m.cls ? ' ' + m.cls : '') + (m.tog ? ' tog' : ''), 'data-l': l, 'data-b': b.id });
        ln.append(h('span', { class: 'gut' }, String(gl)), h('span', { class: 'src', html: hl(t) + (m.note ? `<span class="note">${escapeHtml(m.note)}</span>` : '') }));
        if (m.title) ln.title = m.title;
        blk.append(ln);
      });
      box.append(blk);
    }
  }
  return { render, hl };
})();

/* =====================================================================
   3. Code as Policies: программа по шагам, журнал вызовов
   ===================================================================== */
const LabCode = (() => {
  const E = L23, TW = 400, TH = 240, S = 400;              // 400 px на метр
  const st = { prog: 'stack', lemon: 'yellow', slip: '0', gen: null, cw: null, calls: [], frames: [], cur: null, done: false, generated: [], fresh: null, notes: {}, executed: new Set(), steps: 0, log: [], lastCalls: [], playing: false, busy: false };
  let ctl = null, playTok = 0;
  const GEN_HEAD = { is_empty: 'модель дописала функцию is_empty', dist: 'модель дописала функцию dist', stack_objects: 'модель дописала функцию stack_objects' };
  function restart() {
    stopPlay();
    st.cw = E.capWorld({ lemon: st.lemon, slip: st.slip === '1' }); st.calls = []; st.frames = [];
    st.gen = E.capRun(st.prog, st.cw, st.calls, st.frames);
    st.cur = null; st.done = false; st.generated = []; st.fresh = null; st.notes = {}; st.executed = new Set(); st.steps = 0; st.log = []; st.lastCalls = [];
    render();
  }
  const fmtV = (v) => (Array.isArray(v) ? '[' + v.map(fmtV).join(', ') + ']' : typeof v === 'string' ? `'${v}'` : v == null ? 'None' : String(v));
  /** Выполнить до следующей остановки: строка или вызов функции, которой ещё нет. */
  function stepOnce() {
    if (st.done) return false;
    const before = st.calls.length; st.fresh = null;
    for (;;) {
      const r = st.gen.next();
      if (r.done) { st.done = true; st.cur = null; break; }
      const e = r.value;
      if (e.t === 'ret') continue;
      if (e.t === 'call') {
        if (!e.gen) continue;
        st.generated.push(e.b); st.fresh = e.b; st.cur = { b: e.from.b, l: e.from.l, calling: e.b };
        st.log.push({ k: 'g', t: `${e.b}: функции нет — модель пишет её` });
        break;
      }
      const k2 = e.b + ':' + e.l; st.executed.add(k2); st.notes[k2] = e.note; st.cur = { b: e.b, l: e.l };
      break;
    }
    st.lastCalls = st.calls.slice(before);
    for (const c of st.lastCalls) st.log.push({ k: c.kind === 'percept' ? 'p' : 'a', t: `${c.fn}(${c.args.map(fmtV).join(', ')})` + (c.kind === 'percept' ? ' → ' + fmtV(c.ret) : '') });
    if (st.done) st.log.push({ k: 'e', t: 'программа завершена' });
    st.steps++;
    return !st.done;
  }
  function blocks() {
    const code = E.CAP_CODE[st.prog].blocks, list = [{ id: 'main', lines: code.main }];
    for (const b of st.generated) list.push({ id: b, head: GEN_HEAD[b], lines: code[b], fresh: st.fresh === b });
    return list;
  }
  function renderCode() {
    CodeView.render($('#cCode'), blocks(), (b, l) => {
      const k2 = b + ':' + l, cur = st.cur && st.cur.b === b && st.cur.l === l;
      if (cur && st.cur.calling) return { cls: 'calling', note: `вызов ${st.cur.calling}…` };
      if (cur) return { cls: 'cur', note: st.notes[k2] };
      if (st.executed.has(k2)) return { cls: 'done', note: st.notes[k2] };
      return null;
    });
    if (st.cur) { const ln = $(`#cCode .code-ln[data-b="${st.cur.b}"][data-l="${st.cur.l}"]`); if (ln) { const box = $('#cCode'), r = ln.getBoundingClientRect(), rb = box.getBoundingClientRect(); if (r.left < rb.left || r.right > rb.right) box.scrollLeft = Math.max(0, ln.offsetLeft - 8); } }
  }
  function renderLog() {
    const box = $('#cLog'); box.innerHTML = '';
    box.append(h('div', { class: 'lg-h' }, `Журнал: ${st.calls.length} ${plural(st.calls.length, 'вызов', 'вызова', 'вызовов')} функций робота`));
    const tail = st.log.slice(-40);
    for (const e of tail) box.append(h('div', { class: 'lg-' + e.k }, e.t));
    box.scrollTop = box.scrollHeight;
  }
  function drawTable() {
    const { c, k } = HeroKit.fit($('#cCv'), TW, TH), P = pal(), dark = HeroKit.dark();
    c.fillStyle = P.bg; c.fillRect(0, 0, TW, TH); HeroKit.grid(c, TW, TH, 40, P.grid);
    const COL = { red: '#d14b3c', green: '#3b9a4a', blue: '#3a6fd1', yellow: '#e2b52b' };
    const cw = st.cw, X = (v) => v * S, Y = (v) => v * S;
    // кольца вокруг предметов, которые программа спросила на этом шаге
    const asked = new Set(); for (const cl of st.lastCalls) if (cl.fn === 'get_pos') asked.add(cl.args[0]); else if (cl.fn === 'detect_objects') (cl.ret || []).forEach((n) => asked.add(n));
    for (const q of cw.objs.filter((o) => o.kind === 'bowl')) {
      c.beginPath(); c.arc(X(q.x), Y(q.y), 28, 0, 7); c.fillStyle = dark ? '#2f2e2b' : '#fbfaf6'; c.fill(); c.lineWidth = 5; c.strokeStyle = COL[q.color]; c.stroke();
      HeroKit.label(c, k, q.name, X(q.x), Y(q.y) + 42, { px: 11, color: P.ink2, haloColor: P.bg });
    }
    if (st.prog === 'push') { const b = E.objByName(cw, 'синяя миска'); c.setLineDash([4, 4]); c.strokeStyle = COL.blue; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(b.x), 0); c.lineTo(X(b.x), TH); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'x синей миски', X(b.x) + 4, TH - 12, { px: 10.5, align: 'left', color: COL.blue, haloColor: P.bg }); }
    const lemon = E.objByName(cw, 'лимон');
    c.beginPath(); c.ellipse(X(lemon.x), Y(lemon.y), 11, 8, -0.4, 0, 7); c.fillStyle = COL.yellow; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#a07d10'; c.stroke();
    // кубики: стопки рисуем со сдвигом
    const level = (name) => { let n = 0, cur = name; while (cw.stackOn[cur] && n < 9) { cur = cw.stackOn[cur]; n++; } return n; };
    const blocksList = cw.objs.filter((o) => o.kind === 'block').sort((a, b) => level(a.name) - level(b.name));
    for (const q of blocksList) {
      const lv = level(q.name), off = lv ? (lv - 1) * 5 : 0;
      c.fillStyle = COL[q.color]; c.strokeStyle = dark ? '#111' : '#2b2a27'; c.lineWidth = 1.2;
      c.beginPath(); c.rect(X(q.x) - 10 + off, Y(q.y) - 10 - off, 20, 20); c.fill(); c.stroke();
    }
    for (const n of asked) { const q = E.objByName(cw, n); if (!q) continue; c.beginPath(); c.arc(X(q.x), Y(q.y), q.kind === 'bowl' ? 34 : 16, 0, 7); c.setLineDash([4, 3]); c.lineWidth = 2; c.strokeStyle = P.cl; c.stroke(); c.setLineDash([]); }
    for (const cl of st.lastCalls) if (cl.fn === 'pick_place' && cl.from) {
      const q = E.objByName(cw, cl.args[0]), x0 = X(cl.from[0]), y0 = Y(cl.from[1]), x1 = X(q.x), y1 = Y(q.y);
      c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 30, x1, y1); c.stroke();
      const a = Math.atan2(y1 - (Math.min(y0, y1) - 30), x1 - (x0 + x1) / 2); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 9 * Math.cos(a - 0.4), y1 - 9 * Math.sin(a - 0.4)); c.lineTo(x1 - 9 * Math.cos(a + 0.4), y1 - 9 * Math.sin(a + 0.4)); c.closePath(); c.fillStyle = P.e2e; c.fill();
    }
  }
  function state() {
    const red = E.objByName(st.cw, 'красный кубик'), bowl = E.objByName(st.cw, 'синяя миска');
    return { prog: st.prog, lemon: st.lemon, slip: st.slip, done: st.done, gens: st.generated.slice(), stackIn: E.capStackIn(st.cw), redX: red.x, bowlX: bowl.x, moves: st.calls.filter((c) => c.fn === 'pick_place').length, getposRed: st.calls.filter((c) => c.fn === 'get_pos' && c.args[0] === 'красный кубик').length, calls: st.calls.length, steps: st.steps };
  }
  function out() {
    const s = state();
    let t;
    if (!st.steps) t = 'Нажми «Шаг» или «Пуск». Подсвеченная строка только что выполнилась, справа от неё — итог.';
    else if (!st.done) t = `Шаг ${st.steps}. Стек вызовов: ${st.frames.join(' → ') || 'main'}.`;
    else if (st.prog === 'stack') { const where = Object.keys(s.stackIn)[0]; t = `Программа завершена: ${s.calls} ${plural(s.calls, 'вызов', 'вызова', 'вызовов')} функций робота, модель дописала ${s.gens.length} ${plural(s.gens.length, 'функцию', 'функции', 'функций')}. ` + (where ? `Кубики стопкой: <b>${where}</b>.` : 'Стопки нет.'); }
    else t = `Программа завершена: ${s.moves} ${plural(s.moves, 'сдвиг', 'сдвига', 'сдвигов')}, положение кубика спрошено ${s.getposRed} ${plural(s.getposRed, 'раз', 'раза', 'раз')}. Кубик на x = ${fmt(s.redX, 2)}, миска — на ${fmt(s.bowlX, 2)}.`;
    setOut($('#cOut'), t);
    $('#cStep').disabled = st.done || st.busy; $('#cPlay').disabled = st.done && !st.playing;
    $('#cPlay').textContent = st.playing ? 'Пауза' : 'Пуск';
    $('#cPlay').classList.toggle('on', st.playing);
  }
  function render() { renderCode(); renderLog(); drawTable(); out(); }
  function stopPlay() { playTok++; st.playing = false; }
  async function play() {
    if (st.playing) { stopPlay(); out(); return; }
    st.playing = true; const tok = ++playTok; out();
    while (st.playing && tok === playTok && !st.done) { stepOnce(); render(); if (ctl) ctl.update(); await wait(260); }
    if (tok === playTok) st.playing = false; out();
  }
  /** Выполнить программу с начала до конца (для миссий с кнопкой): быстро, с анимацией. */
  async function runAll() {
    st.busy = true; restart();
    while (!st.done) { stepOnce(); if (st.steps % 3 === 0) { render(); await wait(40); } }
    render(); st.busy = false; out();
    return state();
  }
  function setProg(v) { st.prog = v; segSet('#cProg', v); restart(); if (ctl) ctl.update(); }
  function setLemon(v) { st.lemon = v; segSet('#cLemon', v); restart(); if (ctl) ctl.update(); }
  function setSlip(v) { st.slip = v; segSet('#cSlip', v); restart(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.prog = 'stack'; st.lemon = 'yellow'; st.slip = '0'; segSet('#cProg', 'stack'); segSet('#cLemon', 'yellow'); segSet('#cSlip', '0'); restart(); },
    state, runAll, setProg, setLemon, setSlip, restart,
    step() { stepOnce(); render(); if (ctl) ctl.update(); return state(); },
    /** До конца без анимации (для тестов). */
    finish() { stopPlay(); while (!st.done) stepOnce(); render(); if (ctl) ctl.update(); return state(); },
  };
  const missions = [
    { short: 'По шагам', title: 'Пройди программу по шагам', text: 'Команда — «поставь кубики стопкой в пустую миску». Выше — код, который написала модель. «Шаг» выполняет одну строку, «Пуск» — подряд. Следи за журналом справа от стола: какие функции робота вызывает программа и какие функции модель дописывает сама.',
      onEnter: (X) => { X.setProg('stack'); X.setLemon('yellow'); X.setSlip('0'); },
      criteria: [{ label: 'Программа выполнена до конца', test: (r, s) => s.prog === 'stack' && s.done }, { label: 'Модель дописала функции is_empty, dist и stack_objects', test: (r, s) => s.prog === 'stack' && s.gens.length === 3 }, { label: 'Кубики стопкой в синей миске', test: (r, s) => (s.stackIn['синяя миска'] || []).length === 3 }],
      hint: 'Шагов больше пятидесяти. Нажми «Пуск»: программа пойдёт сама, её можно остановить.',
      explain: () => 'Программа спросила детектор, какие есть кубики и миски, проверила миски по очереди и в жёлтой нашла лимон. Функций is_empty, dist и stack_objects в списке функций робота не было: модель написала их отдельными запросами, когда программа до них дошла, причём dist понадобилась уже внутри is_empty. Управление — три вызова pick_place: каждый кладёт следующий кубик на предыдущий.' },
    { short: 'Лимон', title: 'Переложи лимон в синюю миску', text: 'Переложи лимон в синюю миску и выполни ту же программу. Код не меняется.',
      controls: ['lemon'],
      bet: { q: 'куда встанут кубики?', options: ['В синюю миску: так было в прошлый раз, а код тот же', 'В жёлтую: код снова спросит детектор и найдёт пустую миску', 'Никуда: программа рассчитана на другую пустую миску'], answer: (r) => (r.stackIn['жёлтая миска'] ? 1 : r.stackIn['синяя миска'] ? 0 : 2) },
      action: { label: 'Выполнить программу', run: (X) => X.runAll() },
      criteria: [{ label: 'Лимон в синей миске', test: (r) => r.lemon === 'blue' }, { label: 'Кубики стопкой в жёлтой миске', test: (r) => (r.stackIn['жёлтая миска'] || []).length === 3 }],
      fail: (r) => (r.lemon !== 'blue' ? 'Сначала переложи лимон: переключатель «Лимон» под столом.' : ''),
      explain: () => 'Код тот же, а результат другой: программа решает по ответам детектора во время выполнения, а не по тому, что было, когда модель её писала. План из навыков, как в SayCan, тоже пересчитывается на каждом шаге, но условие «в пустую миску» в нём не записать: понадобился бы навык «положить в пустую миску».' },
    { short: 'Цикл', title: 'Двигай, пока кубик левее миски', text: 'Вторая команда из статьи: «пока красный кубик левее синей миски, двигай его вправо на 5 см». Пусть кубик проскальзывает и за шаг сдвигается только на 3 см.',
      controls: ['prog', 'slip'], onEnter: (X) => { X.setProg('push'); X.setSlip('1'); },
      bet: { q: 'где остановится кубик?', options: ['Левее миски: программа рассчитана на шаги по 5 см', 'Не левее миски: цикл перед каждым шагом заново спрашивает, где кубик', 'Нигде: цикл не закончится'], answer: (r) => (r.redX >= r.bowlX ? 1 : 0) },
      action: { label: 'Выполнить программу', run: (X) => X.runAll() },
      criteria: [{ label: 'Команда «двигай, пока левее»', test: (r) => r.prog === 'push' }, { label: 'Кубик проскальзывает', test: (r) => r.slip === '1' }, { label: 'Красный кубик не левее синей миски', test: (r) => r.prog === 'push' && r.redX >= r.bowlX }],
      fail: (r) => (r.prog !== 'push' ? 'Выбери команду «двигай, пока левее».' : r.slip !== '1' ? 'Включи проскальзывание кубика.' : ''),
      explain: (r) => `Цикл сделал ${r.moves} ${plural(r.moves, 'сдвиг', 'сдвига', 'сдвигов')} вместо 9 и спросил положение кубика ${r.getposRed} ${plural(r.getposRed, 'раз', 'раза', 'раз')}: в условии перед каждым шагом и внутри шага. Программа с заранее посчитанным числом шагов остановилась бы левее миски. Это обратная связь, записанная прямо в коде: восприятие внутри цикла управления.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай команду, перекладывай лимон, включай проскальзывание. Найди настройку, при которой программа чаще всего обращается к восприятию, и подумай, сколько из этих вызовов действительно нужно.', final: true, controls: ['prog', 'lemon', 'slip'] },
  ];
  function init() {
    segBind('#cProg', (v) => { if (!st.busy) setProg(v); }); segBind('#cLemon', (v) => { if (!st.busy) setLemon(v); }); segBind('#cSlip', (v) => { if (!st.busy) setSlip(v); });
    $('#cStep').addEventListener('click', () => { if (st.busy) return; stopPlay(); api.step(); });
    $('#cPlay').addEventListener('click', () => { if (!st.busy) play(); });
    $('#cRestart').addEventListener('click', () => { if (!st.busy) { restart(); if (ctl) ctl.update(); } });
    const lg = $('#cCodeLegend');
    lg.append(h('span', null, h('b', { class: 'tk-p' }, 'detect_objects'), ', ', h('b', { class: 'tk-p' }, 'get_pos'), ' — восприятие'), h('span', null, h('b', { class: 'tk-a' }, 'pick_place'), ' — управление'), h('span', null, h('b', { class: 'tk-g' }, 'is_empty'), ' — функции, которые дописала модель'));
    restart();
    ctl = mountMissions('#cMis', missions, api, { controls: { prog: '#wrapCProg', lemon: '#wrapCLemon', slip: '#wrapCSlip' }, scene: '#cCode' });
    redrawOn(drawTable);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   4. VoxPoser: код строит карты, планировщик — путь
   ===================================================================== */
const LabVox = (() => {
  const E = L23, CW = 600, CH = 400, CS = CW / E.VW;     // 10 пикселей на клетку
  const V_SPEED = 9;                                     // клеток в секунду
  const LINES = [
    { t: '# открой верхний ящик и не задень вазу' },
    { t: 'gripper = detect("захват")[0]' },
    { t: 'handles = detect("ручка ящика")' },
    { t: 'top_handle = max(handles, key=lambda h: h.pos[2])' },
    { t: 'affordance_map = get_empty_affordance_map()' },
    { t: 'affordance_map[top_handle.pos] = 1' },
    { t: 'vase = detect("ваза")[0]', av: true },
    { t: 'avoidance_map = get_empty_avoidance_map()', av: true },
    { t: 'set_voxel_by_radius(avoidance_map, vase.pos,\n                    radius_cm=8, value=1)', av: true },
    { t: 'execute(gripper,\n        affordance_map=affordance_map,\n        avoidance_map=avoidance_map)', t2: 'execute(gripper,\n        affordance_map=affordance_map)' },
  ];
  const st = { pc: 0, avoid: true, vase: Object.assign({}, E.VASE0), wo: 1, view: 'cost', plan: null, grip: Object.assign({}, E.START), trail: [], oldPath: null, onOld: false, moving: false, movedDuring: false, collided: false, reached: false, replans: 0, drag: null, stale: false };
  let ctl = null;
  const cm = (v) => fmt(v * E.CM, 1);
  /** Что видно из строк, выполненных к этому моменту. */
  const has = { grip: () => st.pc >= 2, handles: () => st.pc >= 3, top: () => st.pc >= 4, aff: () => st.pc >= 6, vase: () => st.avoid && st.pc >= 7, avoid: () => st.avoid && st.pc >= 9, path: () => st.pc >= LINES.length };
  function recompute() {
    if (!has.aff()) { st.plan = null; return; }
    st.plan = E.voxPlan({ vase: st.vase, avoid: has.avoid(), wo: st.wo, start: st.moving ? st.grip : E.START });
  }
  function stats() {
    if (!st.plan || !has.path()) return null;
    const ps = E.pathStats(st.plan.path, st.vase);
    return { reached: st.plan.reached, hit: ps.hit, gapCm: ps.gapCm, lenCm: ps.lenCm };
  }
  function state() {
    const s = stats();
    return { pc: st.pc, all: st.pc >= LINES.length, avoid: st.avoid, wo: st.wo, vase: Object.assign({}, st.vase), path: !!s, reached: !!s && s.reached, hit: !!s && s.hit, gapCm: s ? s.gapCm : null, lenCm: s ? s.lenCm : null, onOld: st.onOld, moving: st.moving };
  }
  function lineNote(i) {
    if (i >= st.pc) return '';
    switch (i) {
      case 1: return `→ захват: x = ${cm(E.START.x)}, y = ${cm(E.START.y)} см`;
      case 2: return '→ 3 ручки, одна над другой';
      case 3: return '→ верхняя ручка';
      case 4: return '→ сетка из нулей';
      case 5: return '→ притяжение к ручке';
      case 6: return `→ ваза: x = ${cm(st.vase.x)}, y = ${cm(st.vase.y)} см`;
      case 7: return '→ сетка из нулей';
      case 8: return '→ избегание вокруг вазы';
      case 9: { const s = stats(); return s ? `→ путь ${fmt(s.lenCm, 0)} см${s.hit ? ', задевает вазу' : ''}` : ''; }
    }
    return '';
  }
  function renderCode() {
    const rows = [], stmt = [], last = [];
    LINES.forEach((L, i) => { const parts = (L.av && !st.avoid ? L.t.split('\n').map((x) => '# ' + x).join('\n') : !st.avoid && L.t2 ? L.t2 : L.t).split('\n'); parts.forEach((t, j) => { rows.push(t); stmt.push(i); last.push(j === parts.length - 1); }); });
    CodeView.render($('#vCode'), [{ id: 'main', lines: rows }], (b, r) => {
      const i = stmt[r], L = LINES[i], cls = [];
      if (i < st.pc) cls.push(i === st.pc - 1 ? 'cur' : 'done');
      if (L.av && !st.avoid) cls.push('off');
      return { cls: cls.join(' '), note: !last[r] || (L.av && !st.avoid) ? '' : lineNote(i), tog: !!L.av, title: L.av ? 'Нажми, чтобы закомментировать или вернуть строки карты избегания' : null };
    });
    $('#vStep').disabled = st.pc >= LINES.length || st.moving; $('#vAll').disabled = st.pc >= LINES.length || st.moving;
    setOut($('#vHint'), st.pc >= LINES.length ? '' : `выполнено строк: ${Math.max(0, st.pc - 1)} из ${LINES.length - 1}`);
  }
  function heatLayer(c, vals, col, amax, f) {
    let mx = 1e-9, mn = Infinity; for (const v of vals) { if (v > mx) mx = v; if (v < mn) mn = v; }
    c.fillStyle = col;
    for (let i = 0; i < vals.length; i++) { const a = f ? f(vals[i], mn, mx) : vals[i] / mx; if (a < 0.02) continue; c.globalAlpha = Math.min(1, a) * amax; c.fillRect((i % E.VW) * CS, Math.floor(i / E.VW) * CS, CS + 0.5, CS + 0.5); }
    c.globalAlpha = 1;
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#vCv'), CW, CH), P = pal(), dark = HeroKit.dark();
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CH); HeroKit.grid(c, CW, CH, CS * 5, P.grid);
    // карта
    const plan = st.plan;
    if (plan) {
      if (st.view === 'aff') heatLayer(c, plan.A, P.good, 0.55, (v) => v * v);
      else if (st.view === 'avoid') { if (plan.O) heatLayer(c, plan.O, P.bad, 0.6); }
      else heatLayer(c, plan.C, P.hy, 0.6, (v, mn, mx) => Math.pow((v - mn) / (mx - mn || 1), 1.6));
    }
    // комод с ящиками
    const D = E.DRESSER, dx0 = D.x0 * CS, dx1 = (D.x1 + 1) * CS, dy1 = (D.y1 + 1) * CS;
    c.beginPath(); c.rect(dx0, 0, dx1 - dx0, dy1); c.fillStyle = P.surf; c.fill(); HeroKit.hatch(c, dx0, 0, dx1, dy1, P.ink3, 9, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.strokeRect(dx0, 0, dx1 - dx0, dy1);
    HeroKit.label(c, k, 'комод: три ящика друг над другом', (dx0 + dx1) / 2, dy1 / 2, { px: 11.5, color: P.ink2, haloColor: P.surf });
    // ручка
    const T = E.TARGET, hx = T.x * CS + CS / 2, hy = dy1 + 4;
    c.fillStyle = has.top() ? P.good : P.ink3; c.fillRect(hx - 22, hy - 3, 44, 6);
    if (has.handles()) {                      // на узком экране подпись уходит под ручку, чтобы не выйти за край
      const t = has.top() ? 'ручка верхнего ящика' : 'ручки'; HeroKit.font(c, k, 11);
      const w = c.measureText(t).width, x = Math.min(hx + 32, CW - 6 - w), y = x < hx + 32 ? hy + 6 + 6 * k : hy + 12;
      HeroKit.label(c, k, t, x, y, { px: 11, align: 'left', color: has.top() ? P.good : P.ink3, haloColor: P.bg });
    }
    // старый путь (до перетаскивания вазы)
    if (st.oldPath && st.oldPath.length > 1) { c.setLineDash([5, 5]); c.strokeStyle = P.ink3; c.lineWidth = 2; c.beginPath(); st.oldPath.forEach((p, i) => (i ? c.lineTo(p.x * CS + CS / 2, p.y * CS + CS / 2) : c.moveTo(p.x * CS + CS / 2, p.y * CS + CS / 2))); c.stroke(); c.setLineDash([]); }
    // пройденный путь
    if (st.trail.length > 1) { c.strokeStyle = P.ink2; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); st.trail.forEach((p, i) => (i ? c.lineTo(p.x * CS + CS / 2, p.y * CS + CS / 2) : c.moveTo(p.x * CS + CS / 2, p.y * CS + CS / 2))); c.stroke(); }
    // план (после езды показываем только пройденный путь)
    const s = stats();
    if (s && plan.path.length > 1 && (st.moving || !st.trail.length)) {
      c.strokeStyle = s.hit ? P.bad : P.e2e; c.lineWidth = 3.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
      plan.path.forEach((p, i) => (i ? c.lineTo(p.x * CS + CS / 2, p.y * CS + CS / 2) : c.moveTo(p.x * CS + CS / 2, p.y * CS + CS / 2))); c.stroke();
    }
    // ваза
    const vx = st.vase.x * CS + CS / 2, vy = st.vase.y * CS + CS / 2, vr = E.R_VASE * CS;
    c.beginPath(); c.arc(vx, vy, vr, 0, 7); c.fillStyle = dark ? '#3a3f5c' : '#dfe3f6'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = s && s.hit ? P.bad : (dark ? '#9aa6e6' : '#4a5aa8'); c.stroke();
    c.beginPath(); c.arc(vx, vy, vr * 0.45, 0, 7); c.lineWidth = 1.4; c.stroke();
    if (has.vase()) { c.setLineDash([4, 3]); c.beginPath(); c.arc(vx, vy, vr + 6, 0, 7); c.strokeStyle = P.cl; c.lineWidth = 1.6; c.stroke(); c.setLineDash([]); }
    HeroKit.label(c, k, st.drag ? 'ваза' : 'ваза — перетащи', vx, vy + vr + 14, { px: 11, color: P.ink2, haloColor: P.bg });
    // захват
    const g = st.moving || st.trail.length ? st.grip : E.START, gx = g.x * CS + CS / 2, gy = g.y * CS + CS / 2;
    c.save(); c.translate(gx, gy); c.strokeStyle = P.cl; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, -8); c.lineTo(-9, 8); c.moveTo(9, -8); c.lineTo(9, 8); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); c.restore();
    if (has.grip()) { c.setLineDash([4, 3]); c.beginPath(); c.arc(gx, gy, 15, 0, 7); c.strokeStyle = P.cl; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]); }
    HeroKit.label(c, k, 'захват', gx, gy + 24, { px: 11, color: P.cl, haloColor: P.bg });
    if (st.reached && !st.moving && st.trail.length) HeroKit.label(c, k, 'захват у ручки — дальше потянуть на себя', CW / 2, CH - 14, { px: 12, weight: 700, color: P.good, haloColor: P.bg });
    else if (st.collided) HeroKit.label(c, k, 'захват задел вазу', CW / 2, CH - 14, { px: 12, weight: 700, color: P.bad, haloColor: P.bg });
    else if (!has.aff()) HeroKit.label(c, k, 'карт ещё нет: выполни код', CW / 2, CH - 14, { px: 12, color: P.ink3, haloColor: P.bg });
    out();
  }
  function out() {
    const s = stats(), o = $('#vOut');
    if (!st.plan) { setOut(o, 'Код ещё не выполнен: нажми «Выполнить строку».'); return; }
    if (!s) { setOut(o, `Карты готовы${has.avoid() ? '' : ' (пока только притяжение)'}. Путь появится после строки <code>execute</code>.`); return; }
    const gap = s.hit ? `<b>задевает вазу</b>` : `зазор до вазы <b>${fmt(s.gapCm, 1)} см</b>`;
    setOut(o, `Путь ${fmt(s.lenCm, 0)} см, ${gap}${st.avoid ? '' : ' (карты избегания нет)'}. Веса: притяжение 2, избегание ${fmt(st.wo, 1)}.${st.moving ? ` Пересчётов пути: ${st.replans}.` : ''}`);
  }
  function render() { recompute(); renderCode(); draw(); }
  function stepLine() { if (st.pc < LINES.length) { st.pc = st.pc === 0 ? 2 : st.pc + 1; render(); if (ctl) ctl.update(); } }
  function runAll() { st.pc = LINES.length; render(); if (ctl) ctl.update(); return state(); }
  function setAvoid(v) { if (st.moving) return; st.avoid = v; st.pc = 0; st.trail = []; st.reached = false; st.collided = false; st.oldPath = null; render(); if (ctl) ctl.update(); }
  function setW(v) { st.wo = Math.round(v * 10) / 10; $('#vW').value = st.wo; syncRange($('#vW'), fmt(st.wo, 1)); render(); if (ctl) ctl.update(); }
  function setView(v) { st.view = v; segSet('#vView', v); draw(); }
  /** Не пускаем вазу в комод, на ручку и вплотную к захвату. */
  function clampVase(p) {
    const R = E.R_VASE, x = E.clamp(p.x, R + 0.5, E.VW - R - 1.5); let y = E.clamp(p.y, R + 0.5, E.VH - R - 1.5);
    if (x > E.DRESSER.x0 - R && x < E.DRESSER.x1 + R) y = Math.max(y, E.DRESSER.y1 + R + 1);
    const q = { x, y }, g = st.moving || st.trail.length ? st.grip : E.START;
    for (const [c0, dmin] of [[E.TARGET, R + E.R_GRIP + 1.5], [g, R + E.R_GRIP + 3]]) {
      const d = Math.hypot(q.x - c0.x, q.y - c0.y); if (d < dmin) { const ux = d ? (q.x - c0.x) / d : 1, uy = d ? (q.y - c0.y) / d : 0; q.x = c0.x + ux * dmin; q.y = c0.y + uy * dmin; }
    }
    q.x = E.clamp(q.x, R + 0.5, E.VW - R - 1.5); q.y = E.clamp(q.y, R + 0.5, E.VH - R - 1.5);
    return q;
  }
  function moveVase(p) {
    const q = clampVase(p); if (Math.hypot(q.x - st.vase.x, q.y - st.vase.y) < 0.05) return;
    if (st.moving) st.movedDuring = true;
    st.vase = q;
    if (st.oldPath) st.onOld = E.pathStats(st.oldPath, st.vase).hit;
    if (!st.moving) { st.trail = []; st.reached = false; st.collided = false; }
    render(); if (ctl) ctl.update();
  }
  /** Поехать: захват идёт по пути, путь пересчитывается 5 раз в секунду по текущему положению вазы. */
  function go() {
    if (st.moving) return Promise.resolve(state());
    if (st.pc < LINES.length) st.pc = LINES.length;
    st.moving = true; st.movedDuring = false; st.collided = false; st.reached = false; st.replans = 0; st.oldPath = null; st.onOld = false;
    st.grip = Object.assign({}, E.START); st.trail = [Object.assign({}, st.grip)];
    recompute(); let idx = 1, since = 0, last = performance.now();
    renderCode();
    return new Promise((resolve) => {
      const finish = () => { st.moving = false; renderCode(); draw(); if (ctl) ctl.update(); resolve({ reached: st.reached, collided: st.collided, movedDuring: st.movedDuring, replans: st.replans, avoid: st.avoid }); };
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000) * SPEED.k; last = now;
        since += dt;
        if (since >= 0.2) { since = 0; recompute(); st.replans++; idx = 1; }
        let move = V_SPEED * dt;
        const path = st.plan ? st.plan.path : [st.grip];
        while (move > 0 && idx < path.length) {
          const tx = path[idx].x, ty = path[idx].y, d = Math.hypot(tx - st.grip.x, ty - st.grip.y);
          if (d <= move) { st.grip = { x: tx, y: ty }; move -= d; idx++; } else { st.grip = { x: st.grip.x + (tx - st.grip.x) * move / d, y: st.grip.y + (ty - st.grip.y) * move / d }; move = 0; }
        }
        st.trail.push(Object.assign({}, st.grip));
        if (Math.hypot(st.grip.x - st.vase.x, st.grip.y - st.vase.y) < E.R_VASE + E.R_GRIP) st.collided = true;
        if (Math.hypot(st.grip.x - E.TARGET.x, st.grip.y - E.TARGET.y) < 1) st.reached = true;
        draw();
        if (st.collided || st.reached || st.trail.length > 4000) finish(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const VASE_M3 = { x: 46, y: 28 };
  const api = {
    reset() { st.vase = Object.assign({}, E.VASE0); st.avoid = true; st.pc = 0; st.trail = []; st.reached = false; st.collided = false; st.oldPath = null; st.onOld = false; setView('cost'); setW(1); },
    state, stepLine, runAll, setAvoid, setW, setView, go,
    /** Подготовка миссии: код выполнен, ваза на месте, без следа прошлой езды. */
    prepare(o) { o = o || {}; if (o.vase) st.vase = clampVase(o.vase); if (o.avoid != null) st.avoid = o.avoid; if (o.wo != null) { st.wo = o.wo; $('#vW').value = st.wo; syncRange($('#vW'), fmt(st.wo, 1)); } if (o.run) st.pc = LINES.length; st.trail = []; st.reached = false; st.collided = false; st.oldPath = null; st.onOld = false; render(); },
    /** Для тестов: перетащить вазу программно (как мышью: старый путь запоминается). */
    dragVase(p, during) { if (!during) { st.oldPath = st.plan ? st.plan.path.map((q) => Object.assign({}, q)) : null; } moveVase(p); return state(); },
    moveVase,
  };
  const missions = [
    { short: 'Карты', title: 'Собери карты строка за строкой', text: 'Код написала языковая модель. Выполняй его по строке: detect находит предметы, следующие строки заполняют карту притяжения к ручке и карту избегания вокруг вазы, а execute передаёт карты планировщику.',
      controls: ['view'], onEnter: (X) => X.prepare({ vase: E.VASE0, avoid: true, wo: 1 }),
      criteria: [{ label: 'Все строки кода выполнены', test: (r, s) => s.all }, { label: 'Путь доходит до ручки', test: (r, s) => s.path && s.reached }, { label: 'Путь не задевает вазу', test: (r, s) => s.path && !s.hit }],
      hint: 'Кнопка «Выполнить строку» — под кодом. Переключатель «Карта» под сценой показывает каждую карту отдельно.',
      explain: () => 'Языковая модель не выдала ни одной точки пути. Она решила, к чему тянуться и чего избегать, и записала это кодом; детектор нашёл ручку и вазу, а путь построил планировщик по взвешенной сумме карт. Переключи «Карта»: притяжение растёт к ручке, избегание — пятно вокруг вазы, стоимость — их сумма с весами 2 и 1.' },
    { short: 'Без избегания', title: 'Закомментируй карту избегания', text: 'Что, если модель забудет про вазу? Закомментируй строки, которые строят карту избегания: нажми на любую из них в коде. Потом выполни код.',
      controls: ['view'],
      bet: { q: 'что станет с путём?', options: ['Не изменится: про вазу сказано в просьбе', 'Пойдёт к ручке напрямую и заденет вазу', 'Планировщик не найдёт путь'], answer: (r) => (r.hit ? 1 : r.reached ? 0 : 2) },
      action: { label: 'Выполнить код', run: (X) => X.runAll() },
      criteria: [{ label: 'Строки карты избегания закомментированы', test: (r) => !r.avoid }, { label: 'Путь задевает вазу', test: (r) => r.hit }],
      fail: (r) => (r.avoid ? 'Сначала закомментируй строки карты избегания: нажми на одну из них в коде.' : ''),
      explain: () => 'Без карты избегания стоимость зависит только от расстояния до ручки, и лучший путь — прямая через вазу. Языковая модель знала про вазу, но планировщик видит только карты: знание, которое не попало в код, до движения не доходит.' },
    { short: 'Подвинь вазу', title: 'Поставь вазу на пути', text: 'Строки избегания снова на месте. Перетащи вазу туда, где сейчас проходит путь. Код тот же: detect находит вазу на новом месте, карты и путь пересчитываются.',
      controls: ['view'], onEnter: (X) => X.prepare({ vase: VASE_M3, avoid: true, run: true, wo: 1 }),
      criteria: [{ label: 'Ваза стоит там, где проходил путь', test: (r, s) => s.onOld }, { label: 'Новый путь не задевает вазу', test: (r, s) => s.onOld && s.path && !s.hit }, { label: 'Путь доходит до ручки', test: (r, s) => s.onOld && s.path && s.reached }],
      hint: 'Возьми вазу мышью или пальцем. Серый пунктир — путь до того, как ты её подвинул.',
      explain: () => 'Языковую модель не спрашивали заново: код подзадачи тот же, поменялся только ответ детектора. В статье путь пересчитывают 5 раз в секунду, поэтому VoxPoser справлялся и тогда, когда предметы двигали во время движения.' },
    { short: 'На ходу', title: 'Помешай захвату на ходу', text: 'Нажми «Поехать» и, пока захват едет, поставь вазу у него на пути. Путь пересчитывается 5 раз в секунду, как в статье.',
      controls: ['view'], onEnter: (X) => X.prepare({ vase: VASE_M3, avoid: true, run: true, wo: 1 }),
      bet: { q: 'что сделает захват?', options: ['Заденет вазу: путь построен до того, как её подвинули', 'Обойдёт вазу: путь пересчитывается на ходу', 'Остановится и будет ждать нового кода'], answer: (r) => (r.collided ? 0 : r.reached ? 1 : 2) },
      action: { label: 'Поехать', run: (X) => X.go() },
      criteria: [{ label: 'Вазу двигали, пока захват ехал', test: (r) => r.movedDuring }, { label: 'Захват у ручки', test: (r) => r.reached }, { label: 'Ваза не задета', test: (r) => !r.collided }],
      fail: (r) => (!r.movedDuring ? 'Подвинь вазу, пока захват едет: возьми её мышью или пальцем.' : r.collided ? 'Захват задел вазу. Не ставь вазу вплотную перед захватом: планировщику нужно время.' : ''),
      explain: (r) => `Путь пересчитывался ${r.replans} ${plural(r.replans, 'раз', 'раза', 'раз')}: каждые 0,2 секунды планировщик брал свежее положение вазы и строил путь от того места, где захват был сейчас. Это MPC из урока 0.3: исполнить начало плана и пересчитать. В статье с помехами — толкали руку, переставляли предметы — VoxPoser выполнил 70% попыток, а код с примитивами — 0%.` },
    { short: 'Вес', title: 'Подбери вес избегания', text: 'Ваза вернулась на прежнее место, а вес карты избегания упал до 0,2. Подбери вес так, чтобы захват прошёл мимо вазы, но без лишнего крюка: зазор не больше 5 см.',
      controls: ['view', 'w'], onEnter: (X) => X.prepare({ vase: E.VASE0, avoid: true, run: true, wo: 0.2 }),
      criteria: [{ label: 'Путь не задевает вазу', test: (r, s) => s.path && !s.hit }, { label: 'Зазор до вазы не больше 5 см', test: (r, s) => s.path && !s.hit && s.gapCm <= 5 }, { label: 'Путь доходит до ручки', test: (r, s) => s.path && s.reached }],
      hint: 'Ползунок «Вес избегания» — под сценой. Вес притяжения остаётся 2.',
      explain: (r, ctx) => `Вес задаёт, насколько планировщик готов удлинить путь ради зазора: маленький — захват идёт впритирку и задевает вазу, большой — делает крюк. В статье веса 2 и 1, и у нас вес 1 при весе притяжения 2 тоже попадает в окно. Подбирают такие числа вручную, и это одна из настроек, которую авторы называют ограничением метода вместе с ручной настройкой подсказок.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай вазу, меняй вес и карту, закомментируй строки избегания, поезжай. Найди место для вазы, где путь меняет сторону обхода, и посмотри, как при этом выглядит карта стоимости.', final: true, controls: ['view', 'w', 'go'] },
  ];
  function init() {
    const cv = $('#vCv');
    HeroKit.drag(cv, CW, CH, {
      hit: (p) => (Math.hypot(p.x / CS - 0.5 - st.vase.x, p.y / CS - 0.5 - st.vase.y) < E.R_VASE + 2 ? true : null),
      start: () => { st.drag = true; if (!st.moving) st.oldPath = st.plan && has.path() ? st.plan.path.map((q) => Object.assign({}, q)) : null; },
      move: (o, p) => moveVase({ x: p.x / CS - 0.5, y: p.y / CS - 0.5 }),
      end: () => { st.drag = false; draw(); if (ctl) ctl.update(); },
    });
    $('#vCode').addEventListener('click', (e) => { const ln = e.target.closest('.code-ln.tog'); if (ln && !st.moving) setAvoid(!st.avoid); });
    $('#vStep').addEventListener('click', stepLine);
    $('#vAll').addEventListener('click', runAll);
    $('#vGo').addEventListener('click', () => { if (!st.moving) go(); });
    segBind('#vView', setView);
    $('#vW').addEventListener('input', (e) => setW(+e.target.value));
    syncRange($('#vW'), fmt(st.wo, 1));
    legend('#vLegend', [['стоимость: темнее — дороже', 'var(--hybrid)'], ['путь захвата', 'var(--e2e)'], ['найдено детектором', 'var(--classic)', 'dash'], ['путь до того, как подвинули вазу', 'var(--ink-3)', 'dash']]);
    ctl = mountMissions('#vMis', missions, api, { controls: { view: '#wrapVView', w: '#wrapVW', go: '#vGo' }, scene: '#vCv' });
    render(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, LINES };
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
    { q: 'Языковая модель в SayCan пишет план свободным текстом?', o: ['Да, а потом текст переводят в команды робота', 'Нет: она оценивает описания навыков, которые умеет робот, и выбирает из них', 'Нет: она выдаёт углы суставов'], a: 1, e: 'Свободный текст может предложить пылесос, которого нет. В SayCan модель оценивает, насколько каждое описание навыка подходит следующим шагом, и план собирается только из навыков робота.' },
    { q: 'Откуда SayCan знает, что шаг выполним прямо сейчас?', o: ['Языковая модель видит картинку с камеры', 'Функция ценности навыка оценивает вероятность успеха по текущему наблюдению', 'Из описания навыка'], a: 1, e: 'Функцию ценности обучают с подкреплением на награде 1 за успех и 0 за неудачу, поэтому ценность и есть вероятность успеха. Языковая модель камеры не видит.' },
    { q: 'Почему SayCan перемножает оценки, а не складывает?', o: ['Так быстрее считать', 'Произведение мало, если мала любая из оценок: шаг должен быть и полезным, и выполнимым', 'Сумма дала бы тот же выбор'], a: 1, e: 'Сумма оставляет шанс очень полезному, но невыполнимому шагу: 0,9 + 0,04 больше, чем 0,1 + 0,8. Произведение такой шаг отсекает: 0,036 против 0,08. В статье произведение следует из допущения, что сорвавшийся навык задачу не продвигает.' },
    { q: 'Чашка выскользнула из захвата. SayCan без обратной связи повторит «взять чашку»?', o: ['Да: аффорданс покажет, что захват пуст', 'Нет: в истории языковой модели шаг уже сделан, и она ведёт план дальше', 'Да: так устроен алгоритм'], a: 1, e: 'Аффорданс не пустит невыполнимый следующий шаг, но предложить повтор может только языковая модель, а она считает шаг выполненным. В опытах Inner Monologue на кухне с помехами SayCan в задачах с перемещением не довёл до конца ни одной попытки.' },
    { q: 'Inner Monologue дообучает языковую модель на обратной связи?', o: ['Да, после каждого эпизода', 'Нет: обратную связь дописывают в подсказку словами, модель не меняется', 'Да, с подкреплением'], a: 1, e: 'Модель заморожена и работает по нескольким примерам в подсказке. Детектор успеха, описание сцены и ответы человека приходят текстом, и модель читает их как продолжение диалога.' },
    { q: 'Code as Policies обучает новую политику под каждую команду?', o: ['Да, по нескольким демонстрациям', 'Нет: модель пишет код, который вызывает готовые функции восприятия и управления', 'Нет: она выбирает навык из списка, как SayCan'], a: 1, e: 'Программа считает координаты, проверяет условия и повторяет действие в цикле, пока восприятие не скажет, что цель достигнута. Обучения нет, но и двигается робот готовыми примитивами.' },
    { q: 'VoxPoser выдаёт траекторию текстом?', o: ['Да: языковая модель пишет точки пути', 'Нет: код строит карты, а путь по карте стоимости ищет классический планировщик', 'Нет: траекторию выдаёт обученная политика'], a: 1, e: 'Языковая модель решает, к чему тянуться и чего избегать, и пишет код, который заполняет карты. Путь строит планировщик, и ни одна часть не обучается под задачу.' },
    { q: 'Вазу передвинули, пока захват едет. Что делает VoxPoser?', o: ['Просит языковую модель написать код заново', 'Исполняет тот же код: детектор находит вазу на новом месте, карта и путь пересчитываются на ходу', 'Останавливается: план больше не верен'], a: 1, e: 'Код подзадачи не меняется, поэтому ответ модели запоминают, а карты строят заново по свежим ответам детектора 5 раз в секунду. С помехами VoxPoser выполнил 70% попыток, код с примитивами — 0%.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('plan', () => { mis.plan = LabPlan.init(); }); safe('mono', () => { mis.mono = LabMono.init(); });
    safe('code', () => { mis.code = LabCode.init(); }); safe('vox', () => { mis.vox = LabVox.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['sMis', 'mMis', 'cMis', 'vMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l23 = { mis, SPEED, LabPlan, LabMono, LabCode, LabVox, L23 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
