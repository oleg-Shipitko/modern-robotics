/* =====================================================================
   ui-l15.js — урок 1.5 «Diffusion Policy».
   Интерактивы: награда Push-T (перетащи блок в цель); денойзинг пачки
   (перемотка шагов: где выбирается сторона); собери политику по шагам;
   лаборатория «Ада и диффузионная политика» на миссиях (shared/missions.js):
   десять прогонов, регрессия рядом, исполнение по одному шагу, шаги
   денойзинга, сколько исполнять из 16 при сдвиге чайника; квиз.
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
  const st = { seed: 1, s: 0, out: null, sides: [], decide: 1, mark: null, seen: { l: false, r: false }, samples: 0 };
  let ctl = null;
  const sideOf = (v) => (v * E.SC > 6 ? 1 : v * E.SC < -6 ? -1 : 0);
  function sample() {
    st.out = E.ddimExact(MUS, null, 16, STEPS, E.rng(4000 + st.seed), true);
    st.sides = st.out.x0s.map((x0) => sideOf(x0[JK]));
    const fin = st.sides[STEPS - 1]; let f = STEPS - 1; while (f > 0 && st.sides[f - 1] === fin) f--;
    st.decide = f + 1; st.mark = null; st.samples++;
    if (fin < 0) st.seen.l = true; else if (fin > 0) st.seen.r = true;
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#scrubCv'), W, H), P = KD.pal(), sx = W / (VIEW.x1 - VIEW.x0);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.save(); c.scale(sx, sx); c.translate(-VIEW.x0, -VIEW.y0);
    KD.house(c, k / sx, P, { labels: false });
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
    c.restore();
    HeroKit.label(c, k, s === 0 ? 'шаг 0: чистый шум' : s === STEPS ? `шаг ${s}: готовая пачка` : `шаг ${s} из ${STEPS}`, 10, H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    // полоска сторон
    const strip = $('#scrubStrip'); strip.innerHTML = '';
    for (let i = 1; i <= STEPS; i++) {
      const sd = st.sides[i - 1], cell = h('span', { class: 'ss ' + (sd < 0 ? 'l' : sd > 0 ? 'r' : 'n') + (i === s ? ' cur' : '') + (i === st.mark ? ' mark' : ''), title: `шаг ${i}: ${sd < 0 ? 'слева' : sd > 0 ? 'справа' : 'сторона не выбрана'}` }, String(i));
      cell.addEventListener('click', () => setStep(i)); strip.append(cell);
    }
    const sideTxt = (v) => (v < 0 ? 'слева' : v > 0 ? 'справа' : 'не выбрана');
    let msg = s === 0 ? 'Шаг 0 — чистый гауссов шум. Двигай ползунок вправо.' : `На шаге ${s} оценка чистой пачки (пунктир) объезжает чайник: <b>${sideTxt(st.sides[s - 1])}</b>.`;
    if (st.mark != null) msg += st.mark === st.decide ? ` Отмечен шаг ${st.mark}: дальше сторона не меняется.` : st.mark < st.decide ? ` Отмечен шаг ${st.mark}, но после него сторона ещё менялась.` : ` Отмечен шаг ${st.mark}, но сторона была выбрана раньше.`;
    setOut($('#scrubOut'), msg);
    $('#scrubS').value = s; $('#scrubS').nextElementSibling.textContent = String(s);
    if (ctl) ctl.update();
  }
  function setStep(s) { st.s = Math.max(0, Math.min(STEPS, s)); draw(); }
  const api = {
    reset() { st.seed = 1; st.seen = { l: false, r: false }; st.samples = 0; sample(); st.s = 0; draw(); },
    state: () => ({ s: st.s, decide: st.decide, mark: st.mark, seen: Object.assign({}, st.seen), samples: st.samples, side: st.sides[STEPS - 1] }),
    setStep, newNoise() { st.seed++; sample(); st.s = 0; draw(); }, mark() { st.mark = st.s || null; draw(); },
  };
  const missions = [
    { short: 'Шаг выбора', title: 'Найди, где выбрана сторона', text: 'Оранжевые точки — пачка из 16 шагов на текущем шаге денойзинга, пунктир — оценка чистой пачки. Перематывай ползунком и отметь шаг, после которого сторона объезда уже не меняется.', controls: ['mark'],
      criteria: [{ label: 'Отмечен шаг, после которого сторона не меняется', test: (r, s) => s.mark != null && s.mark === s.decide }],
      hint: 'Полоска под сценой показывает сторону оценки на каждом шаге. Найди, с какого шага цвет больше не меняется.',
      explain: (s) => `Сторона выбрана уже на шаге <b>${s.decide} из 16</b>. Пока шум большой, оценка чистой пачки смотрит в середину между объездами. Но пачка — это 16 точек сразу, и даже сквозь сильный шум видно, к какому объезду она ближе целиком. Поэтому выбор происходит рано, а оставшиеся шаги доводят форму объезда. Из 60 пачек с разным шумом сторона выбрана уже на втором шаге у 51, а не позже шестого — у всех.` },
    { short: 'Другая сторона', title: 'Получи другую сторону', text: 'Нажимай «Новый шум»: найди пачку, которая объезжает чайник с другой стороны.', controls: ['mark', 'noise'],
      criteria: [{ label: 'Есть пачка с объездом слева', test: (r, s) => s.seen.l }, { label: 'Есть пачка с объездом справа', test: (r, s) => s.seen.r }],
      explain: () => 'Сеть, данные и наблюдение те же, отличается только начальный шум. Он и выбирает стратегию, как на спиралях в уроке 1.4: соседние стартовые точки уходят в один бассейн, далёкие — в разные. Денойзинг не усредняет объезды, а доводит пачку до одного из них.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Перематывай и пробуй новый шум. Найди пачку, где сторона менялась на полпути.', final: true },
  ];
  function init() {
    sample();
    $('#scrubS').addEventListener('input', (e) => setStep(+e.target.value));
    $('#scrubNew').addEventListener('click', () => api.newNoise());
    $('#scrubMark').addEventListener('click', () => api.mark());
    legend('#scrubLegend', [['пачка на этом шаге', 'var(--pol-dif)', 'dot'], ['оценка чистой пачки', 'var(--ink-2)', 'dash'], ['демонстрации', 'var(--ink-3)']]);
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
    { id: 'noise', t: 'Пачка из чистого гауссова шума', note: '16 шагов × размерность действия' },
    { id: 'den', t: 'Сеть 16 раз убирает часть шума при условии признаков', note: 'DDIM; при обучении — 100 шагов' },
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
    if (ex) { st.errors++; st.rejected.push(id); st.msg = `<b>Этот шаг лишний.</b> ${ex.why}`; render(); return; }
    const next = STEPS[st.placed.length];
    if (next.id === id) { st.placed.push(id); st.msg = st.placed.length === STEPS.length ? 'Цикл собран.' : ''; }
    else { st.errors++; st.msg = '<b>Этот шаг позже.</b> Подумай, что политике нужно раньше.'; }
    render();
  }
  function discard(id) {
    if (st.placed.includes(id) || st.rejected.includes(id)) return;
    if (EXTRA.some((q) => q.id === id)) { st.rejected.push(id); st.msg = `<b>Верно, лишний.</b> ${EXTRA.find((q) => q.id === id).why}`; }
    else { st.errors++; st.msg = '<b>Этот шаг нужен.</b> Без него цикл не замкнётся.'; }
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
    setOut($('#pipeOut'), st.msg || (st.placed.length ? `Собрано шагов: ${st.placed.length} из ${STEPS.length}.` : 'Нажми на блок, который идёт первым.'));
    if (ctl) ctl.update();
  }
  const api = {
    reset() { st.placed = []; st.rejected = []; st.errors = 0; st.msg = ''; render(); },
    state: () => ({ placed: st.placed.length, rejected: st.rejected.length, errors: st.errors }),
    place, discard,
  };
  const missions = [
    { short: 'Цикл', title: 'Собери Diffusion Policy', text: 'Нажимай блоки в том порядке, в котором работает политика на роботе. Два блока лишние: отбрось их крестиком.',
      criteria: [{ label: 'Цикл собран: шесть шагов по порядку', test: (r, s) => s.placed === STEPS.length }, { label: 'Оба лишних блока отброшены', test: (r, s) => s.rejected === EXTRA.length }],
      hint: 'Политика сначала смотрит, потом думает, потом действует. Шум появляется до денойзинга, а наблюдения в нём не участвуют.',
      explain: (s) => `Цикл собран${s.errors ? `, ошибок по дороге: ${s.errors}` : ' без ошибок'}. На реальном Push-T так и работает политика авторов: камера и положение захвата за 2 шага, ResNet-18 на каждую камеру без предобучения, одномерный UNet по времени с условием через FiLM, 16 шагов DDIM и исполнение 6–8 действий из 16. Политика выдаёт пачку 10 раз в секунду, а контроллер робота интерполирует её до 125 Гц.` },
  ];
  function init() { ctl = mountMissions('#pipeMis', missions, api, { scene: '#pipeLine' }); render(); return ctl; }
  return { init, api, st };
})();

/* ===================== 4. Лаборатория: Ада и диффузионная политика ===================== */
const Lab = (() => {
  const TAS = [1, 2, 4, 8, 16], SHIFT = 12;
  const st = {
    share: 0.5, Ta: 8, steps: 16, reg: false, shift: false, plan: true,
    data: null, dataKey: '', cache: {}, res: null, play: null, batchNo: 0, training: false, prog: 0, loss: { den: [], reg: [] }, log: [], curve: {},
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
    left: rs.filter((q) => !q.touch && q.side < 0).length, right: rs.filter((q) => !q.touch && q.side > 0).length, ok: rs.filter((q) => !q.touch && q.flips < 2).length, passes: rs[0].passes / Math.max(1, rs[0].chunks) });
  async function run(o) {
    o = o || {}; const D = ensureData();
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
    const opt = (i) => { const q = { Ta: st.Ta, steps: st.steps, keepPlans: i === 0 }; if (st.shift) q.kpush = { t: 8 + ((seed0 + i) * 7) % 12, dx: SHIFT, toward: true }; return q; };
    const res = { den: [], reg: [] };
    for (let i = 0; i < n; i++) res.den.push(E.run15(m.den, E.KETTLE, seed0 + i, opt(i)));
    if (st.reg) for (let i = 0; i < n; i++) res.reg.push(E.run15(m.reg, E.KETTLE, seed0 + i, opt(i)));
    for (const p of ['den', 'reg']) res[p].forEach((q) => { q.hit = q.touch ? hitAt(q) : null; });
    const r = { share: st.share, Ta: st.Ta, steps: st.steps, shift: st.shift, reg: st.reg, n, nLeft: D.nLeft, nRight: D.nRight, den: summ(res.den), regS: st.reg ? summ(res.reg) : null };
    if (st.shift && n >= 20) st.curve[st.Ta] = r.den.ok;
    st.log.push(r);
    return new Promise((resolve) => { st.res = res; st.play = playback(2200, () => { st.play = null; try { draw(); plotCurve(); } finally { resolve(r); } }); });
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
      const q0 = st.res.den[0], tN = Math.min(q0.pts.length - 1, Math.round(u * (q0.pts.length - 1)));
      const kx = q0.kpath[Math.min(tN, q0.kpath.length - 1)];
      if (st.shift && Math.abs(kx - E.KETTLE.x) > 0.5) KD.kettle(c, k, P, E.KETTLE, { ghost: true });
      KD.kettle(c, k, P, { x: kx, y: E.KETTLE.y }, { label: true });
      c.lineJoin = 'round'; c.lineCap = 'round';
      for (const p of ['reg', 'den']) {
        const runs = st.res[p]; if (!runs.length) continue; const color = p === 'den' ? P.dif : P.reg;
        if (!st.play) { c.strokeStyle = color; c.lineWidth = 1.3; c.globalAlpha = 0.4; if (p === 'reg') c.setLineDash([6, 5]); for (let i = 1; i < runs.length; i++) KD.pathPts(c, runs[i].pts, runs[i].hit ? runs[i].hit.t + 1 : null); c.setLineDash([]); c.globalAlpha = 1; for (let i = 1; i < runs.length; i++) if (runs[i].hit) HeroKit.cross(c, runs[i].hit.x, runs[i].hit.y, 4, P.bad, 1.8); }
        const q = runs[0], tq = Math.min(tN, q.pts.length - 1), stop = q.hit ? Math.min(tq, q.hit.t + 1) : tq;
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
    const D2 = ensureData(), txt = (st.training ? `обучение ${fmt1(st.prog * 100, 0)}%` : st.play ? `прогон 1 · шаг ${Math.round(u * (st.res.den[0].pts.length - 1))}` : st.res ? `${st.res.den.length} прогонов` : 'до запуска') + ` · демонстраций ${D2.nLeft} слева, ${D2.nRight} справа`;
    HeroKit.label(c, k, txt, 10, E.H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    drawStats();
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
    if (st.res && st.dataKey !== key()) st.res = null;
    draw(); plotLoss(); plotCurve(); if (ctl) ctl.update();
  }
  function setCtl(o) {
    if (o.share != null) $('#labShare').value = Math.round(o.share * 100);
    if (o.steps != null) $('#labSteps').value = o.steps;
    if (o.reg != null) $('#labReg').checked = o.reg;
    if (o.shift != null) $('#labShift').checked = o.shift;
    if (o.Ta != null) st.Ta = o.Ta;
    if (o.clear) { st.res = null; }
    syncCtl();
  }
  const api = {
    reset() { st.log = []; st.batchNo = 0; st.res = null; st.curve = {}; $('#labPlan').checked = true; setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: false }); },
    run, setCtl,
    state: () => ({ share: st.share, Ta: st.Ta, steps: st.steps, reg: st.reg, shift: st.shift, log: st.log.slice(), curve: Object.assign({}, st.curve) }),
  };
  const shareTxt = (r) => `${Math.round(r.share * 100)} на ${100 - Math.round(r.share * 100)}`;
  const bestTa = (cv) => { let b = null; for (const ta of TAS) if (cv[ta] != null && (b == null || cv[ta] > cv[b])) b = ta; return b; };
  const edgeOk = (cv) => { const inner = [2, 4, 8].filter((t) => cv[t] != null), edge = [1, 16].filter((t) => cv[t] != null); if (Object.keys(cv).length < 4 || !inner.length) return false; return Math.max(...inner.map((t) => cv[t])) > Math.max(-1, ...edge.map((t) => cv[t])); };
  const missions = [
    { short: 'Десять прогонов', title: 'Десять прогонов', text: '40 демонстраций, поровну слева и справа. Обучи диффузионную политику и проведи Аду мимо чайника десять раз подряд. Точки впереди Ады — её текущая пачка: закрашенные шаги она исполнит, остальные заменит новая пачка.', controls: ['plan'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: false, clear: true }),
      bet: { q: 'сколько раз из 10 Ада заденет чайник?', options: ['Ни разу', '1–3 раза', 'Примерно половину', 'Почти всегда'], answer: (r) => (r.den.touches === 0 ? 0 : r.den.touches <= 3 ? 1 : r.den.touches <= 6 ? 2 : 3) },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Ни одного касания за 10 прогонов', test: (r) => r.den.touches === 0 }, { label: 'Есть объезды с обеих сторон', test: (r) => r.den.left > 0 && r.den.right > 0 }, { label: 'Ни в одном прогоне Ада не перебегала на другую сторону', test: (r) => r.den.maxSw === 0 }],
      summary: (r) => `диффузия: касаний ${r.den.touches} из 10 · слева ${r.den.left}, справа ${r.den.right}`,
      fail: (r) => `Касаний: ${r.den.touches}, смен стороны: до ${r.den.maxSw}. Попробуй ещё раз: следующие 10 прогонов идут с другими зёрнами.`,
      explain: (r) => `Ни одного касания: слева ${nWord(r.den.left, 'раз', 'раза', 'раз')}, справа ${nWord(r.den.right, 'раз', 'раза', 'раз')}. Сторону выбирает шум первой пачки, а пачка на 16 шагов её держит: следующая пачка начинается там, где Ада уже обходит чайник, и продолжает тот же объезд. В статье то же на Push-T: Diffusion Policy держит выбранную сторону весь прогон, LSTM-GMM и IBC смещены к одной стороне, а BET «fails to commit». На реальном Push-T у Diffusion Policy 95% успеха, у IBC — 0%, у LSTM-GMM — 20%.` },
    { short: 'Регрессия рядом', title: 'Когда хватает регрессии', text: 'Включи регрессию с пачками: она выдаёт всю пачку за один проход сети. Найди долю объездов, при которой регрессия проезжает 10 из 10, как и диффузия, и сравни, сколько проходов сети тратит каждая.', controls: ['plan', 'reg', 'share'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: true, shift: false, clear: true }),
      bet: { q: 'когда регрессия с пачками справляется не хуже диффузии?', options: ['Ни при какой доле', 'Уже при 50 на 50', 'Когда почти все объезды с одной стороны'], answer: () => 2 },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Регрессия проехала 10 из 10', test: (r) => !!r.regS && r.regS.touches === 0 }, { label: 'Диффузия тоже проехала 10 из 10', test: (r) => r.den.touches === 0 }, { label: 'В демонстрациях есть объезды с обеих сторон', test: (r) => r.nLeft > 0 && r.nRight > 0 }],
      summary: (r) => `доля ${shareTxt(r)}: регрессия — касаний ${r.regS ? r.regS.touches : '—'} из 10, диффузия — ${r.den.touches}`,
      hint: 'Сдвигай долю шагами по 10%. Регрессия выдаёт среднее, и оно уходит от чайника только при заметном перекосе.',
      fail: (r) => (!r.regS ? 'Включи регрессию флажком под сценой.' : r.regS.touches ? `При ${shareTxt(r)} регрессия задела чайник ${nWord(r.regS.touches, 'раз', 'раза', 'раз')} из 10.` : !(r.nLeft > 0 && r.nRight > 0) ? 'Регрессия проехала, но в демонстрациях осталась одна сторона. Оставь хотя бы несколько объездов с другой.' : `Регрессия проехала, а диффузия задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')}. Нажми ещё раз.`),
      explain: (r) => `При ${shareTxt(r)} регрессия проехала 10 из 10, потратив <b>1 проход сети</b> на пачку против ${r.steps} у диффузии. При 50 на 50 она иногда тоже проезжает: Ада видит своё положение, и случайный уход в сторону закрепляется. Но гарантии нет, и часть прогонов заканчивается в чайнике. Когда стратегия в данных одна, регрессия с пачками не хуже и намного дешевле: OpenVLA-OFT с L1 даёт 97,1% на LIBERO и генерирует в 26 раз быстрее, с оговоркой авторов про «a consistent strategy per task». Pan и соавторы на 28 бенчмарках не нашли преимущества генеративной головы, кроме задач на высокую точность. Когда демонстрации разных операторов расходятся, выигрывает диффузия: в ALOHA Unleashed — 70% против 25% у L1.` },
    { short: 'По одному шагу', title: 'Исполняй по одному шагу', text: 'Пусть политика строит новую пачку на каждом шаге и исполняет только её первое действие. Найди прогон, в котором план Ады дважды или больше сменил сторону объезда.', controls: ['plan', 'Ta'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 1, steps: 16, reg: false, shift: false, clear: true }),
      bet: { q: 'что будет, если пересчитывать пачку на каждом шаге?', options: ['Ада поедет точнее', 'Ничего не изменится', 'План начнёт менять сторону'], answer: (r) => (r.den.flips2 > 0 ? 2 : 1) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Исполняется по одному шагу из пачки', test: (r) => r.Ta === 1 }, { label: 'Найден прогон, где план сменил сторону два раза или больше', test: (r) => r.den.flips2 > 0 }],
      summary: (r) => `исполнять ${r.Ta} из 16: план менял сторону ≥ 2 раз в ${r.den.flips2} прогонах из 10, касаний ${r.den.touches}`,
      hint: 'Включи показ плана и следи за точками перед Адой у развилки: при исполнении по одному шагу они перескакивают с одной стороны на другую.',
      fail: (r) => (r.Ta !== 1 ? 'Выбери исполнение по одному шагу.' : 'В этих прогонах план держал сторону. Нажми ещё раз: зёрна новые.'),
      explain: (r) => `В ${r.den.flips2} прогонах из 10 план дважды и больше менял сторону. Каждая пачка — новый сэмпл, и пока Ада у развилки, он с близкой вероятностью выбирает любой объезд. Здесь Ада успевает по каждому плану сделать один шаг и почти не отклоняется, поэтому касаний мало. Зато решения нет: Ада держится середины, и если чайник сдвинется, уйти она не успеет — это миссия 5. Авторы Diffusion Policy описывают такое поведение как «jittery actions that alternate between the two valid trajectories», в статье BID — как «oscillations between different strategies».` },
    { short: 'Шаги денойзинга', title: 'Сколько шагов денойзинга нужно', text: 'Сейчас пачку строят за 1 шаг денойзинга вместо 16. Посмотри, что сделает Ада, а потом найди число шагов не больше 4, при котором она проезжает 10 из 10.', controls: ['plan', 'steps'],
      onEnter: (X) => X.setCtl({ share: 0.5, Ta: 8, steps: 1, reg: false, shift: false, clear: true }),
      bet: { q: 'что сделает Ада при одном шаге денойзинга?', options: ['Объедет, как при 16', 'Начнёт задевать чайник', 'Будет менять сторону'], answer: (r) => (r.den.touches > 0 ? 1 : r.den.flips2 > 0 ? 2 : 0) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'При одном шаге Ада задела чайник', test: (r, s) => s.log.some((q) => q.steps === 1 && !q.shift && q.Ta === 8 && q.den.touches > 0) }, { label: 'Найдено число шагов не больше 4, при котором 10 из 10', test: (r) => r.steps <= 4 && r.Ta === 8 && !r.shift && r.den.touches === 0 }],
      summary: (r) => `${nWord(r.steps, 'шаг', 'шага', 'шагов')} денойзинга: касаний ${r.den.touches} из 10, проходов сети на пачку ${r.steps}`,
      hint: 'Начни с одного шага, потом прибавляй по одному.',
      fail: (r) => (r.steps > 4 ? 'Шагов больше четырёх. Найди меньшее число.' : r.steps === 1 && r.den.touches ? `При одном шаге Ада задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')} из 10. Теперь прибавь шагов.` : r.den.touches ? `При ${r.steps} шагах Ада задела чайник ${nWord(r.den.touches, 'раз', 'раза', 'раз')}. Прибавь шаг.` : 'Без касаний. Посмотри ещё, что происходит при одном шаге.'),
      explain: (r) => `Уже ${nWord(r.steps, 'шага', 'шагов', 'шагов')} хватает на 10 из 10, а при одном шаге Ада задевает чайник. Один шаг из чистого шума — это оценка денойзера при максимальном шуме, а она близка к среднему демонстраций, то есть к той же регрессии: в уроке 1.4 стрелки score при большом шуме смотрели в среднее. У настоящих систем: Diffusion Policy — 16 шагов DDIM (в разделе 3.4 статьи — 10 шагов и 0,1 с на RTX 3080), π0 — 10 шагов flow matching, GR00T N1 — 4. Одношаговые политики получают дистилляцией: Consistency Policy работает за 1–3 шага, 21–22 мс против примерно 195 мс у DDIM на 15 шагах.` },
    { short: 'Сколько исполнять', title: 'Сколько исполнять из 16', text: `Теперь в случайный момент чайник сдвигают на ${SHIFT} см в сторону, куда объезжает Ада. Каждый запуск — 20 прогонов, одни и те же для любой длины исполнения. Построй кривую: сколько прогонов из 20 прошли без касания и без смен плана при 1, 2, 4, 8 и 16 исполняемых шагах.`, controls: ['plan', 'Ta', 'curve'],
      onEnter: (X) => { X.setCtl({ share: 0.5, Ta: 8, steps: 16, reg: false, shift: true, clear: true }); },
      bet: { q: 'где будет максимум?', options: ['При 1: чем чаще пересчитываем, тем лучше', 'Где-то посередине', 'При 16: пачку лучше исполнять целиком'], answer: () => 1 },
      action: { label: 'Прогнать 20 раз', run: (X) => X.run({ n: 20 }) },
      criteria: [{ label: 'На графике не меньше четырёх точек', test: (r, s) => Object.keys(s.curve).length >= 4 }, { label: 'Лучший результат — не на краю, не при 1 и не при 16', test: (r, s) => edgeOk(s.curve) }],
      summary: (r) => `исполнять ${r.Ta} из 16: без касаний и смен плана ${r.den.ok} из 20`,
      hint: 'Переключай длину исполнения кнопками под сценой и запускай 20 прогонов для каждой.',
      fail: (r, ctx) => { const cv = Lab.st.curve, n = Object.keys(cv).length; return n < 4 ? `Точек на графике: ${n}. Нужно хотя бы четыре разные длины исполнения.` : 'Пока лучший результат на краю. Добавь недостающие точки.'; },
      explain: () => { const cv = Lab.st.curve, b = bestTa(cv), all = TAS.filter((t) => cv[t] === cv[b]); return `Лучше всего — исполнять <b>${all.join(' и ')} из 16</b>: ${cv[b]} прогонов из 20 без касаний и смен плана. При одном-двух шагах план меняет сторону, и Ада не успевает уйти от сдвинутого чайника. При 16 она исполняет старый план и замечает сдвиг поздно. Авторы Diffusion Policy пришли к тем же цифрам: наблюдают 2 шага, предсказывают 16, исполняют 8 (на реальном Push-T — 6), а качество держится при задержке до 4 шагов.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Доступны все ручки: доля объездов, регрессия рядом, длина исполнения, шаги денойзинга и сдвиг чайника. Попробуй регрессию со сдвигом чайника: что с ней происходит и почему?', final: true,
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() }, summary: (r) => `${shareTxt(r)}, исполнять ${r.Ta}, шагов ${r.steps}${r.shift ? ', сдвиг' : ''} → диффузия ${r.den.touches}/10${r.regS ? `, регрессия ${r.regS.touches}/10` : ''}` },
  ];
  function init() {
    legend('#labLegend', [['диффузионная политика', 'var(--pol-dif)'], ['регрессия с пачками', 'var(--pol-reg)', 'dash'], ['план: исполнит / заменит', 'var(--pol-dif)', 'dot'], ['демонстрации', 'var(--ink-3)'], ['касание', 'var(--critical)']]);
    legend('#labLossLegend', [['ошибка денойзера', 'var(--pol-dif)'], ['регрессии', 'var(--pol-reg)']]);
    for (const id of ['#labShare', '#labSteps']) $(id).addEventListener('input', syncCtl);
    for (const id of ['#labReg', '#labShift', '#labPlan']) $(id).addEventListener('change', syncCtl);
    $$('#wrapTa button').forEach((b) => b.addEventListener('click', () => { st.Ta = +b.dataset.ta; syncCtl(); }));
    HeroKit.loop($('#labCv'), () => { if (st.play) draw(); });
    ctl = mountMissions('#labMis', missions, api, {
      controls: { plan: '#wrapPlan', reg: '#wrapReg', share: '#wrapShare', Ta: '#wrapTa', steps: '#wrapSteps', shift: '#wrapShift', curve: '#wrapCurve' },
      scene: '#labCv',
    });
    syncCtl(); plotLoss(); plotCurve(); redrawOn(() => { draw(); plotLoss(); plotCurve(); });
    return ctl;
  }
  return { init, api, st };
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
    { q: 'Diffusion Policy выдаёт одно действие за вывод?', o: ['Да, как обычная политика', 'Нет: пачку из 16 действий, из которых исполняет 8', 'Нет: всю траекторию до цели'], a: 1, e: 'Пачка из 16 действий держит выбранную стратегию, а исполнение половины пачки оставляет возможность реагировать на сцену. В лаборатории так Ада объезжала чайник 10 раз из 10.' },
    { q: 'Шум добавляют и к кадрам с камер?', o: ['Да, вместе с действиями', 'Нет: наблюдения — только условие, шумится пачка действий', 'Только к первому кадру'], a: 1, e: 'Кадры сеть получает на каждом шаге денойзинга как условие. Энкодер считает их признаки один раз на всю пачку.' },
    { q: 'На роботе нужно 100 шагов денойзинга, как при обучении?', o: ['Да, иначе пачка будет шумной', 'Нет: при выводе 16 шагов DDIM у Diffusion Policy, 10 у π0, 4 у GR00T N1, 1–3 после дистилляции', 'Нет, достаточно одного шага без дистилляции'], a: 1, e: 'В лаборатории хватало трёх-четырёх шагов, а один шаг без дистилляции давал оценку, близкую к среднему демонстраций, и Ада задевала чайник.' },
    { q: 'Пачку лучше исполнять целиком или по одному действию?', o: ['Целиком: так движение плавнее', 'Ни то ни другое: лучший результат посередине, у авторов — 8 из 16', 'По одному: так быстрее реакция'], a: 1, e: 'При исполнении по одному шагу план меняет сторону, а при исполнении целиком робот поздно замечает изменения сцены. В лаборатории лучший результат был в середине кривой.' },
    { q: 'Стыки пачек можно сгладить, усреднив старую и новую пачку?', o: ['Да, это безопасно', 'Нет: среднее двух стратегий бывает недопустимым действием', 'Да, если пачки длинные'], a: 1, e: 'Если старая пачка объезжает чайник слева, а новая справа, их среднее ведёт в чайник. Поэтому в Real-Time Chunking новую пачку достраивают к уже исполняемой, а не усредняют с ней.' },
    { q: 'Диффузионной политике удобнее выдавать скорости, а не положения?', o: ['Да, скорости гладче', 'Нет: в статье позиционное управление стабильно лучше скоростного', 'Разницы нет'], a: 1, e: 'У бейзлайнов в статье было наоборот. Авторы объясняют это тем, что позиционное управление меньше страдает от накопления ошибки и задержки исполнения пачки.' },
    { q: 'Прирост 46,9% из статьи — это результат на реальных роботах?', o: ['Да, на четырёх роботах', 'Нет: это средний прирост по задачам в симуляции', 'Да, на Push-T'], a: 1, e: 'На реальных роботах авторы приводят отдельные цифры: 95% на Push-T против 0% у IBC и 20% у LSTM-GMM, 90% на задаче с кружкой.' },
    { q: 'Доказано, что метод выигрывает из-за мультимодальности данных?', o: ['Да, это показано на всех бенчмарках', 'Нет: это объяснение авторов, и у него есть контраргументы', 'Нет, мультимодальность здесь ни при чём'], a: 1, e: 'На стандартных бенчмарках условных мод почти нет (урок 1.3), а работа 2025 года связывает выигрыш генеративных политик с шумом при обучении и итеративными шагами. Когда демонстрации разных операторов действительно расходятся, генеративная голова нужна.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('pusht', () => { mis.pusht = PushT.init(); }); safe('scrub', () => { mis.scrub = Scrub.init(); }); safe('pipe', () => { mis.pipe = Pipe.init(); });
    safe('lab', () => { mis.lab = Lab.init(); });
    safe('quiz', initQuiz);
    window.__l15 = { mis, SPEED, PushT, Scrub, Pipe, Lab }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
