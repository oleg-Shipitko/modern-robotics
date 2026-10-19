/* =====================================================================
   ui-l41.js — урок 4.1 «Масштаб данных в робототехнике». Схема и интерактивы:
   0) анимированная схема опыта Lin и соавторов (shared/anim.js);
   1) калькулятор разрыва: годы чтения корпуса и годы записи датасетов,
      парк устройств сбора, сравнение в токенах;
   2) лаборатория масштабирования: политика на столе из урока 2.1 учится на
      наборах из M сцен по K демонстраций, проверка на 100 новых сценах,
      доля провалов в логарифмических осях и подгонка прямой;
   3) интерактив «удвоить демонстрации или сцены»: две модели рядом;
   4) квиз.
   Движок — l41/engine.js (без DOM) поверх l21/engine.js.
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
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
const demos = (n) => nWord(n, 'демонстрация', 'демонстрации', 'демонстраций');
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);
/** Большие числа словами: 90 тыс., 1,9 млрд. */
function big(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return fmt(v / 1e12, v / 1e12 < 10 ? 1 : 0) + ' трлн';
  if (a >= 1e9) return fmt(v / 1e9, v / 1e9 < 10 ? 1 : 0) + ' млрд';
  if (a >= 1e6) return fmt(v / 1e6, v / 1e6 < 10 ? 1 : 0) + ' млн';
  if (a >= 1e4) return fmt(v / 1e3, 0) + ' тыс.';
  if (a >= 100) return fmt(v, 0);
  if (a >= 10) return fmt(v, 0);
  if (a >= 1) return Math.abs(v - Math.round(v)) < 0.05 ? fmt(Math.round(v), 0) : fmt(v, 1);
  return fmt(v, 2);
}
/** Два значащих знака — для оценок «около …». */
const approx = (v) => { if (Math.abs(v) < 100) return v; const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1); return Math.round(v / p) * p; };
/** «в 79 тыс. раз», «в 7862 раза». */
const times = (v) => `${big(v)} ${Math.abs(v) >= 1e4 ? 'раз' : plural(Math.round(v), 'раз', 'раза', 'раз')}`;
/** «1,1 года», «57 лет». */
const yearsW = (v) => `${big(v)} ${Math.abs(v) < 10 && Math.abs(v - Math.round(v)) >= 0.05 ? 'года' : Math.abs(v) >= 1e4 ? 'лет' : plural(Math.round(v), 'год', 'года', 'лет')}`;

/* =====================================================================
   0. Схема: опыт Lin и соавторов — среды, выбор части, обучение, проверка, точка
   ===================================================================== */
(() => {
  const T0 = 2.6, RD = 2.3, NR = 6, T = T0 + RD * NR + 2.2;          // сбор, шесть кругов по m = 0…5, пауза
  const FIT = (x) => 0.827 * Math.pow(x, -0.466);                     // рис. 5 статьи: Mouse Arrangement, среды
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const tint = (i, P) => (P.dark ? `hsl(${Math.round(hash(i) * 360)}, 18%, ${26 + 10 * hash(i + 40)}%)` : `hsl(${Math.round(hash(i) * 360)}, 30%, ${80 + 10 * hash(i + 40)}%)`);
  function draw(c, k, t, P, A, G) {
    const u = ((t % T) + T) % T, { seg, lab, rect, line, arrow, circle } = A;
    const fill = seg(u, 0, T0 * 0.9), round = u < T0 ? -1 : Math.min(NR - 1, Math.floor((u - T0) / RD)), ru = u < T0 ? 0 : (u - T0 - round * RD) / RD;
    const done = u < T0 ? 0 : u >= T0 + RD * NR ? NR : round + (ru > 0.78 ? 1 : 0);        // сколько точек уже на графике
    const m = round < 0 ? -1 : round, nSel = m >= 0 ? 1 << m : 0, inRound = u >= T0 && u < T0 + RD * NR;
    const pSel = inRound ? seg(ru, 0, 0.25) : 0, pTrain = inRound ? seg(ru, 0.25, 0.5) : 0, pTest = inRound ? seg(ru, 0.5, 0.75) : 0;
    // 1. 32 среды
    lab(c, k, G.short ? '32 среды · 120 демонстраций' : '32 среды × 120 демонстраций, ручной захват UMI', G.env[0] + G.env[4] * 4 - 2, G.env[1] - 14, { px: 11, weight: 700, color: P.ink2, haloColor: P.surf2 });
    for (let i = 0; i < 32; i++) {
      const cx = G.env[0] + (i % 8) * G.env[4], cy = G.env[1] + Math.floor(i / 8) * G.env[4], s = G.env[4] - 4;
      const sel = inRound && i < nSel && pSel > 0;
      rect(c, cx, cy, s, s, 4, tint(i, P), sel ? P.mot : P.line, sel ? 2.2 : 1);
      const nd = Math.round(Math.max(0, Math.min(1, fill * 1.6 - i / 32)) * 6);
      for (let d = 0; d < nd; d++) circle(c, cx + 5 + (d % 3) * (s - 10) / 2, cy + s * 0.38 + Math.floor(d / 3) * s * 0.3, 1.7, sel ? P.mot : rgba(P.mot, 0.55));
    }
    // 2. обучение
    const B = G.train, act = pTrain > 0 && pTrain < 1;
    rect(c, B[0], B[1], B[2], B[3], 10, rgba(P.mot, act ? 0.2 : 0.08), act ? P.mot : rgba(P.mot, 0.6), 1.6);
    lab(c, k, 'обучение', B[0] + B[2] / 2, B[1] + 14, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, 'Diffusion Policy', B[0] + B[2] / 2, B[1] + 29, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    c.fillStyle = rgba(P.ink3, 0.2); c.fillRect(B[0] + 12, B[1] + B[3] - 16, B[2] - 24, 5);
    c.fillStyle = P.mot; c.fillRect(B[0] + 12, B[1] + B[3] - 16, (B[2] - 24) * (inRound ? pTrain : u >= T0 + RD * NR ? 1 : 0), 5);
    if (inRound) lab(c, k, `${nSel} ${plural(nSel, 'среда', 'среды', 'сред')}`, B[0] + B[2] / 2, B[1] + 45, { px: 11, weight: 700, color: P.mot, haloColor: P.surf2 });
    // 3. проверка в 8 новых средах по 5 попыток
    const Q = G.test, gap = m >= 0 ? FIT(nSel) : 0;
    lab(c, k, G.short ? 'проверка: 8 новых сред' : 'проверка: 8 новых сред × 5 попыток', Q[0] + Q[2] * 2 - 2, Q[1] - 12, { px: 10.5, weight: 700, color: P.ink2, haloColor: P.surf2 });
    for (let i = 0; i < 8; i++) {
      const cx = Q[0] + (i % 4) * Q[2], cy = Q[1] + Math.floor(i / 4) * Q[2], s = Q[2] - 4;
      rect(c, cx, cy, s, s, 4, tint(100 + i, P), P.line, 1);
      const okN = Math.round(5 * (1 - gap) - 0.25 + 0.5 * hash(i + 7 * m + 3));
      for (let d = 0; d < 5; d++) { const on = pTest > 0 && d < Math.ceil(pTest * 5); circle(c, cx + 4 + d * (s - 8) / 4, cy + s - 6, 1.9, on ? (d < okN ? P.out : rgba(P.ink3, 0.6)) : rgba(P.ink3, 0.18)); }
    }
    // 4. график: разрыв до оптимума от числа сред, обе оси логарифмические
    const Pl = G.plot, X = (x) => Pl[0] + Pl[2] * Math.log2(x) / 5, Y = (y) => Pl[1] + Pl[3] * (-Math.log10(y));     // y от 1 до 0,1
    c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(Pl[0], Pl[1], Pl[2], Pl[3]);
    for (const x of [1, 2, 4, 8, 16, 32]) lab(c, k, String(x), X(x), Pl[1] + Pl[3] + 10, { px: 9.5, color: P.ink3, halo: false });
    for (const [y, tx] of [[1, '1'], [0.3, '0,3'], [0.1, '0,1']]) lab(c, k, tx, Pl[0] - 4, Y(y), { px: 9.5, color: P.ink3, align: 'right', halo: false });
    lab(c, k, 'сред в обучении', Pl[0] + Pl[2] / 2, Pl[1] + Pl[3] + 24, { px: 10, color: P.ink3, halo: false });
    lab(c, k, '1 − балл', Pl[0] + 2, Pl[1] - 9, { px: 10, color: P.ink3, align: 'left', halo: false });
    if (done >= 2) { const pts = []; for (let x = 1; x <= 32; x *= 1.25) pts.push([X(x), Y(FIT(x))]); pts.push([X(32), Y(FIT(32))]); line(c, pts, rgba(P.ink2, 0.8), 1.3, [4, 4]); }
    for (let j = 0; j < done; j++) circle(c, X(1 << j), Y(FIT(1 << j)), 3.6, P.out, P.surf, 1.2);
    if (done >= NR) lab(c, k, '0,83 · x^−0,47', X(6), Y(FIT(6)) - 14, { px: 10, color: P.ink2, haloColor: P.surf2 });
    // стрелки и подпись шага
    G.arrows.forEach(([x1, y1, x2, y2], i) => arrow(c, x1, y1, x2, y2, [pSel, pTrain, pTest][i] > 0 && inRound ? P.ink2 : P.line, 1.6, 6));
    const step = u < T0 ? 'запись демонстраций в 32 средах' : !inRound ? 'шесть наборов — шесть точек на прямой' : pTest > 0 ? `проверка: ${nSel} ${plural(nSel, 'среда', 'среды', 'сред')} → точка на графике` : pTrain > 0 ? 'обучение политики на выбранных средах' : `берём ${nSel} ${plural(nSel, 'среду', 'среды', 'сред')} из 32`;
    lab(c, k, step, G.title[0], G.title[1], { px: 11, weight: 700, color: P.ink2, haloColor: P.surf2 });
  }
  Anim.add('sweep', {
    W: 720, H: 250, start: 7.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { env: [16, 70, 0, 0, 28], train: [258, 92, 112, 72], test: [392, 98, 30], plot: [566, 40, 140, 160], arrows: [[242, 128, 256, 128], [372, 128, 388, 128], [514, 128, 534, 128]], title: [360, 16] }); },
    narrow: { W: 360, H: 630, draw(c, k, t, P, A) { draw(c, k, t, P, A, { short: true, env: [20, 46, 0, 0, 40], train: [116, 228, 128, 80], test: [104, 350, 38], plot: [70, 464, 262, 104], arrows: [[180, 208, 180, 224], [180, 310, 180, 324], [180, 430, 180, 446]], title: [180, 616] }); } },
  });
})();

/* =====================================================================
   1. Калькулятор разрыва
   ===================================================================== */
const Gap = (() => {
  const E = L41, CW = 640, CH = 330, CAL = 10;                    // календарных лет для парка
  const st = { corpus: 'llama3', wpm: 238, tpw: 1.33, read: 24, fleet: 2, shift: 8, unit: 'years', stage: 0 };
  let ctl = null;
  const N = () => Math.round(Math.pow(10, st.fleet));
  const corpusYears = () => E.readYears(E.CORPORA[st.corpus].tokens, { wpm: st.wpm, wordsPerToken: 1 / st.tpw, hoursDay: st.read });
  const yearH = () => st.read * 365;                                                      // часов в «годе»: круглосуточно или по 8 ч в день — одинаково для всех полос
  const corpusHours = () => E.CORPORA[st.corpus].tokens / st.tpw / st.wpm / 60;
  const fleetYears = () => N() * st.shift * 365 * CAL / yearH();                          // лет записи за 10 календарных лет
  const parity = () => corpusHours() / (N() * 365 * st.shift);                           // за сколько календарных лет парк сравняется
  function rows(P) {
    const tok = st.unit === 'tokens', out = [], C = E.CORPORA[st.corpus];
    out.push({ name: C.name, sub: tok ? 'токенов текста' : st.read === 24 ? 'лет чтения без сна' : 'лет чтения по 8 ч в день', v: tok ? C.tokens : corpusYears(), col: P.ink3, hide: st.stage < 1 });
    E.ROBOT.forEach((d) => out.push({ name: d.name, sub: tok ? 'токенов FAST' : `${big(d.hours)} ч записи`, v: tok ? d.hours * 3600 * E.FAST_PER_S : d.hours / yearH(), col: P.cl, hide: st.stage < 2 }));
    if (!tok) out.push({ name: `Парк: ${big(N())}`, sub: `лет записи за ${CAL} лет`, v: fleetYears(), col: P.e2e, hide: st.stage < 3 });
    return out;
  }
  function draw() {
    const cv = $('#gCv'), P = pal(), tok = st.unit === 'tokens';
    const narrow = (cv.parentElement.getBoundingClientRect().width || CW) < 480, W = narrow ? 360 : CW, H = narrow ? 470 : CH;
    if (cv.dataset.layout !== (narrow ? 'n' : 'w')) { cv.style.aspectRatio = `${W} / ${H}`; cv.dataset.layout = narrow ? 'n' : 'w'; }
    const { c, k } = HeroKit.fit(cv, W, H);
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const R = rows(P), L = narrow ? 0 : 150, x0 = narrow ? 12 : L + 8, x1 = W - (narrow ? 64 : 96), top = narrow ? 30 : 34, rh = (H - top - 34) / R.length;
    const lo = tok ? 7 : -2, hi = tok ? 14 : 6, X = (v) => x0 + (x1 - x0) * (Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo);
    // сетка и шкала
    const ticks = tok ? [[1e8, '100 млн'], [1e10, '10 млрд'], [1e12, '1 трлн'], [1e14, '100 трлн']] : [[0.01, '0,01'], [1, '1'], [100, '100'], [1e4, '10 тыс.'], [1e6, '1 млн']];
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const [v, t] of ticks) { const x = X(v); c.beginPath(); c.moveTo(x, top - 6); c.lineTo(x, H - 30); c.stroke(); HeroKit.label(c, k, t, x, H - 18, { px: 11, color: P.ink3, halo: false }); }
    HeroKit.label(c, k, tok ? 'токенов, логарифмическая шкала' : 'лет, логарифмическая шкала', (x0 + x1) / 2, 14, { px: 11.5, weight: 650, color: P.ink2, halo: false });
    R.forEach((r, i) => {
      const y = top + i * rh, bh = Math.min(16, rh * (narrow ? 0.34 : 0.5)), mid = narrow ? y + rh * 0.66 : y + rh / 2;
      if (narrow) { HeroKit.label(c, k, r.name, x0, y + rh * 0.24, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.surf }); c.font = `700 ${12 * k}px Inter, system-ui, sans-serif`; HeroKit.label(c, k, r.sub, x0 + c.measureText(r.name).width + 8, y + rh * 0.24, { px: 10.5, color: P.ink3, align: 'left', haloColor: P.surf }); }
      else { HeroKit.label(c, k, r.name, L, mid - 6, { px: 12, weight: 700, color: P.ink, align: 'right', halo: false }); HeroKit.label(c, k, r.sub, L, mid + 8, { px: 10, color: P.ink3, align: 'right', halo: false }); }
      if (r.hide) { c.setLineDash([3, 4]); c.strokeStyle = P.line; c.strokeRect(x0, mid - bh / 2, (x1 - x0) * 0.25, bh); c.setLineDash([]); HeroKit.label(c, k, '?', x0 + (x1 - x0) * 0.25 + 12, mid, { px: 12, weight: 700, color: P.ink3, halo: false }); return; }
      const w = Math.max(2, X(r.v) - x0); c.fillStyle = r.col; c.beginPath(); c.roundRect(x0, mid - bh / 2, w, bh, 3); c.fill();
      const vt = '≈ ' + big(r.v); c.font = `650 ${11.5 * k}px Inter, system-ui, -apple-system, sans-serif`; const vw = c.measureText(vt).width;
      if (x0 + w + 6 + vw > W - 4 && w > vw + 12) HeroKit.label(c, k, vt, x0 + w - 6, mid, { px: 11.5, weight: 650, color: P.surf, align: 'right', halo: false });
      else HeroKit.label(c, k, vt, x0 + w + 6, mid, { px: 11.5, weight: 650, color: P.ink, align: 'left', halo: false });
    });
    if (st.stage < 1) { const cx = (x0 + x1) / 2 + 20, cy = top + rh * 2.5; c.fillStyle = rgba(P.surf, 0.92); c.fillRect(cx - (narrow ? 130 : 170), cy - 16, narrow ? 260 : 340, 32); HeroKit.label(c, k, narrow ? 'Сделай ставку и нажми «Посчитать»' : 'Сделай ставку и нажми «Посчитать» — появятся полосы', cx, cy, { px: 12, weight: 650, color: P.ink2, halo: false }); }
    out();
  }
  function out() {
    const C = E.CORPORA[st.corpus], el = $('#gOut');
    if (st.stage < 1) return setOut(el, 'Полосы появятся после расчёта.');
    const words = C.tokens / st.tpw, hours = words / st.wpm / 60, y = corpusYears();
    let html = `<b>${C.name}:</b> ${big(C.tokens)} токенов → ${big(words)} слов → ${big(hours)} часов чтения → <b>≈ ${big(y)} лет</b>${st.read === 8 ? ' по 8 часов в день' : ' без перерыва'}.`;
    if (st.stage >= 2) { const pi = E.ROBOT.find((d) => d.id === 'pi0'); html += st.unit === 'tokens' ? ` π0: ${big(pi.hours * 3600 * E.FAST_PER_S)} токенов FAST — в ${times(C.tokens / (pi.hours * 3600 * E.FAST_PER_S))} меньше; без сжатия ${big(pi.hours * 3600 * E.RAW_PER_S)} — в ${times(C.tokens / (pi.hours * 3600 * E.RAW_PER_S))} меньше.` : ` π0: ${yearsW(pi.hours / yearH())} записи — в ${times(corpusHours() / pi.hours)} меньше.`; }
    if (st.stage >= 3 && st.unit === 'years') html += ` Парк из ${big(N())} устройств по ${st.shift} ч в день сравняется с корпусом за <b>${yearsW(parity())}</b>.`;
    setOut(el, html);
  }
  function state() { return { corpus: st.corpus, stage: st.stage, unit: st.unit, shift: st.shift, fleet: N(), years: corpusYears(), parity: parity() }; }
  const api = {
    reset() { Object.assign(st, { corpus: 'llama3', wpm: 238, tpw: 1.33, read: 24, fleet: 2, shift: 8, unit: 'years', stage: 0 }); sync(); draw(); },
    state,
    calcCorpus() { Object.assign(st, { corpus: 'llama3', wpm: 238, tpw: 1.33, read: 24, unit: 'years' }); st.stage = Math.max(st.stage, 1); sync(); draw(); const C = E.CORPORA.llama3, words = C.tokens / 1.33; return Promise.resolve({ words, hours: words / 238 / 60, years: corpusYears() }); },
    addRobots() { st.stage = Math.max(st.stage, 2); st.unit = 'years'; sync(); draw(); const y = corpusYears(), yr = (id) => E.robotYears(E.ROBOT.find((d) => d.id === id).hours); return Promise.resolve({ pi0: yr('pi0'), gen0: yr('gen0'), gen1: yr('gen1'), ratio: y / yr('pi0'), ratioGen1: y / yr('gen1') }); },
    showFleet() { st.stage = Math.max(st.stage, 3); st.unit = 'years'; sync(); draw(); },
    setFleet(v) { st.fleet = Math.max(0, Math.min(5, v)); sync(); draw(); upd(); },
    set(kv) { Object.assign(st, kv); sync(); draw(); upd(); },
  };
  const upd = () => { if (ctl) ctl.update(); };
  function sync() {
    segSet('#gCorpus', st.corpus); segSet('#gRead', st.read); segSet('#gShift', st.shift); segSet('#gUnit', st.unit);
    $('#gWpm').value = st.wpm; syncRange($('#gWpm'), String(st.wpm)); $('#gTpw').value = st.tpw; syncRange($('#gTpw'), fmt(st.tpw, 2));
    $('#gFleet').value = st.fleet; syncRange($('#gFleet'), big(N()));
  }
  const missions = [
    { short: 'Llama 3', title: 'Сколько лет читать корпус', text: 'Llama 3 обучена на 15 трлн с лишним токенов. Возьмём допущения Блэка: 238 слов в минуту и 1,33 токена на слово — и пусть человек читает без сна и отдыха.',
      controls: [],
      bet: { q: 'сколько лет он читал бы этот корпус?', options: ['Около 300 лет: за жизнь человек читает немало', 'Около 90 000 лет', 'Около 30 млн лет'], answer: (r) => (r.years > 3e6 ? 2 : r.years > 3000 ? 1 : 0) },
      action: { label: 'Посчитать', run: (X) => X.calcCorpus() },
      criteria: [{ label: 'Корпус пересчитан в годы чтения', test: (r) => !!r }, { label: 'Вышло больше 10 000 лет', test: (r) => r.years > 1e4 }],
      explain: (r) => `15 трлн токенов — это ${big(r.words)} слов и ${big(r.hours)} часов чтения, как на слайде Блэка, то есть около ${big(approx(r.years))} лет без перерыва. Если читать по 8 часов в день, выйдет втрое больше, около ${big(approx(r.years * 3))} лет.` },
    { short: 'Роботы', title: 'Датасеты роботов на той же шкале', text: 'π0 предобучали на 10 тысячах с лишним часов записей роботов. Добавим на шкалу и другие датасеты, у которых известен объём в часах: DROID, AgiBot World, GEN-0 и GEN-1. Час записи считаем часом круглосуточной работы.',
      controls: [],
      bet: { q: 'сколько лет записи в 10 000 часах π0?', options: ['Около года', 'Около 100 лет', 'Около 10 000 лет'], answer: (r) => (r.pi0 < 10 ? 0 : r.pi0 < 1000 ? 1 : 2) },
      action: { label: 'Добавить датасеты роботов', run: (X) => X.addRobots() },
      criteria: [{ label: 'Датасеты роботов на шкале', test: (r) => !!r }, { label: 'Корпус Llama 3 больше записей π0 в десятки тысяч раз', test: (r) => r.ratio > 1e4 }],
      explain: (r) => `10 000 часов — ${yearsW(r.pi0)} записи, и корпус Llama 3 при тех же допущениях больше в ${times(r.ratio)}: отсюда и порядок 100 000. Самая длинная синяя полоса, полмиллиона часов GEN-1, — около ${yearsW(r.gen1)}, всё ещё в ${times(approx(r.ratioGen1))} меньше. И это не часы роботов: базовую модель GEN-1 учили на записях носимых устройств на людях, а данные GEN-0 собирали и устройства сбора, и роботы.` },
    { short: 'Парк', title: 'Сколько устройств нужно, чтобы сравняться', text: 'Голдберг не ждёт гуманоидов, которые справятся с домашней работой, ни через пять, ни через десять лет. Проверь, успеет ли за это время сбор данных: каждое устройство сбора записывает смену в 8 часов в день. Найди, сколько устройств нужно, чтобы за 10 лет набрать столько лет записи, сколько лет чтения в корпусе Llama 3, и не больше чем вдвое.',
      controls: ['fleet'], onEnter: (X) => X.showFleet(),
      criteria: [{ label: 'Парк сравнивается с корпусом Llama 3 не дольше чем за 10 лет', test: (r, s) => s.corpus === 'llama3' && s.shift === 8 && s.parity <= 10 }, { label: 'И не быстрее чем за 5 лет: лишних устройств нет', test: (r, s) => s.corpus === 'llama3' && s.parity >= 5 }],
      hint: 'Ползунок «Устройств сбора» — под графиком, шкала у него логарифмическая. Ответ — несколько десятков тысяч.',
      explain: () => { const s = state(), need = E.fleetFor(s.years, CAL, 8), weeks = s.years * E.HOURS_YEAR / 10000; return `Нужно около ${big(approx(need))} устройств и столько же людей, которые работают с ними каждый день 10 лет. GEN-0 прибавляет 10 тысяч часов в неделю; таким темпом ${big(approx(s.years))} лет записи набирались бы около ${yearsW(approx(weeks / 52))}. Поэтому разрыв сокращают не только числом устройств: данные берут из видео людей, симуляции и с роботов, которые уже работают.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй корпус, допущения о чтении, парк и единицы. Переключи единицы на токены и найди, во сколько раз токенов действий в 10 000 часах π0 меньше, чем токенов текста в Llama 3, со сжатием FAST и без него. Почему в годах разрыв в десять раз больше, чем в токенах?', final: true, controls: ['corpus', 'wpm', 'tpw', 'read', 'fleet', 'shift', 'unit'], onEnter: (X) => X.showFleet() },
  ];
  function init() {
    segBind('#gCorpus', (v) => api.set({ corpus: v })); segBind('#gRead', (v) => api.set({ read: +v })); segBind('#gShift', (v) => api.set({ shift: +v })); segBind('#gUnit', (v) => api.set({ unit: v }));
    $('#gWpm').addEventListener('input', (e) => api.set({ wpm: +e.target.value })); $('#gTpw').addEventListener('input', (e) => api.set({ tpw: +e.target.value }));
    $('#gFleet').addEventListener('input', (e) => api.setFleet(+e.target.value));
    ctl = mountMissions('#gMis', missions, api, { controls: { corpus: '#wrapGCorpus', wpm: '#wrapGWpm', tpw: '#wrapGTpw', read: '#wrapGRead', fleet: '#wrapGFleet', shift: '#wrapGShift', unit: '#wrapGUnit' }, scene: '#gCv' });
    sync(); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   Модели стола: обучаются по запросу, по одной; результаты кэшируются
   ===================================================================== */
const Store = (() => {
  const E = L41, res = {}, subs = [], st = { busy: null, prog: 0 };
  let test = null, chain = Promise.resolve(), last = 0;
  const key = (M, K) => `${M}x${K}`;
  const getTest = () => test || (test = E.testSet(100));
  const emit = (force) => { const now = performance.now(); if (force || now - last > 90) { last = now; subs.forEach((f) => f()); } };
  async function one(M, K, onP) {
    const set = await runChunked(E.datasetGen(M, K), (e) => onP(0.08 * e.it / e.iters), 12);
    const m = await runChunked(E.polTrain(set), (e) => onP(0.08 + 0.77 * (e.it + 1) / e.iters), 12);
    const r = await runChunked(E.evaluateGen(m, getTest()), (e) => onP(0.85 + 0.15 * (e.it + 1) / e.iters), 12);
    res[key(M, K)] = Object.assign({ M, K, total: M * K }, r);
  }
  /** Обучить и проверить все наборы из списка [[M, K], …], которых ещё нет; tag — кто ждёт. */
  function ensure(list, tag) {
    const p = chain.then(async () => {
      const need = list.filter(([M, K]) => !res[key(M, K)]);
      st.busy = tag; st.prog = 0; emit(true);
      for (let i = 0; i < need.length; i++) await one(need[i][0], need[i][1], (q) => { st.prog = (i + q) / need.length; emit(); });
      st.busy = null; st.prog = 1; emit(true);
      return list.map(([M, K]) => res[key(M, K)]);
    });
    chain = p.catch(() => {});
    return p;
  }
  const get = (M, K) => res[key(M, K)] || null;
  const all = () => Object.values(res);
  return { st, ensure, get, all, getTest, on: (f) => subs.push(f) };
})();

/* ---------- плитки сцен: картинка 96×96 → канвас, кэш ---------- */
const Thumb = (() => {
  const C = new Map();
  function of(sc) {
    const key = sc.id + ':' + sc.k; if (C.has(key)) return C.get(key);
    const W = L41.TW, cv = document.createElement('canvas'); cv.width = W; cv.height = W;
    const g = cv.getContext('2d'), im = g.createImageData(W, W);
    for (let i = 0; i < W * W; i++) { im.data[i * 4] = sc.img[i * 3]; im.data[i * 4 + 1] = sc.img[i * 3 + 1]; im.data[i * 4 + 2] = sc.img[i * 3 + 2]; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); C.set(key, cv); return cv;
  }
  /** Нарисовать сцену в квадрат (x, y, s); run — итог проверки (куда опустился захват). */
  function draw(c, k, sc, x, y, s, P, o) {
    o = o || {}; c.save(); c.beginPath(); c.roundRect(x, y, s, s, Math.max(2, s * 0.06)); c.clip();
    c.imageSmoothingEnabled = s > 96; c.drawImage(of(sc), x, y, s, s); c.restore();
    c.strokeStyle = o.frame || P.line; c.lineWidth = o.frame ? 2.2 : 1; c.beginPath(); c.roundRect(x, y, s, s, Math.max(2, s * 0.06)); c.stroke();
    const f = s / L41.TW;
    if (o.run) {
      const px = x + o.run.p.x * f, py = y + o.run.p.y * f, r = Math.max(3.5, 7 * f);
      if (o.run.ok) { c.strokeStyle = P.good; c.lineWidth = Math.max(1.8, 2.6 * f); c.beginPath(); c.arc(px, py, r, 0, 7); c.stroke(); }
      else {
        const t = sc.target, R = t.R * f + 2; c.setLineDash([3, 2]); c.strokeStyle = P.ink; c.lineWidth = 1.2; c.strokeRect(x + t.x * f - R, y + t.y * f - R, 2 * R, 2 * R); c.setLineDash([]);
        HeroKit.cross(c, px, py, r * 0.75, P.bad, Math.max(1.8, 2.4 * f));
      }
    }
    if (o.badge && s / k >= 34) HeroKit.label(c, k, o.badge, x + s - 4, y + 9 * Math.min(1.4, Math.max(0.8, s / 60)), { px: s < 50 ? 9 : 10.5, weight: 700, color: o.badgeCol || P.ink, align: 'right', haloColor: P.surf });
  }
  return { of, draw };
})();
const K_COL = { 1: '--hybrid', 2: '--ink-3', 4: '--good', 8: '--classic', 16: '--e2e' };
const kCol = (K) => HeroKit.css(K_COL[K] || '--ink-2');

/* =====================================================================
   2. Лаборатория масштабирования: серии моделей и прямая в лог-осях
   ===================================================================== */
const Scale = (() => {
  const E = L41, MS = [1, 2, 4, 8, 16, 32], PW = 640, PH = 340;
  const st = { K: 8, M: 8, show: null, seen: new Set() };         // show — какой набор показан в панелях; seen — наборы, обученные в этой лаборатории
  let ctl = null;
  const serRes = (K) => MS.filter((M) => st.seen.has(M + 'x' + K)).map((M) => Store.get(M, K)).filter(Boolean);
  const fitOf = (K) => E.powerFit(serRes(K).map((r) => ({ x: r.M, y: r.gap })));
  /** Набор и проверка в двух панелях. */
  function drawPanes() {
    const P = pal(), M = st.show ? st.show[0] : st.M, K = st.show ? st.show[1] : st.K, r = Store.get(M, K);
    { const { c, k } = HeroKit.fit($('#sTrain'), 400, 400); c.fillStyle = P.surf; c.fillRect(0, 0, 400, 400);
      const cols = M <= 1 ? 1 : M <= 4 ? 2 : M <= 9 ? 3 : M <= 16 ? 4 : 6, s = (400 - 8) / cols;
      for (let i = 0; i < cols * cols; i++) {
        const x = 4 + (i % cols) * s, y = 4 + Math.floor(i / cols) * s;
        if (i < M) Thumb.draw(c, k, E.arrange(E.POOL.base + i, 0), x + 2, y + 2, s - 4, P, { badge: '×' + K });
        else { c.setLineDash([3, 4]); c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(x + 2, y + 2, s - 4, s - 4); c.setLineDash([]); }
      } }
    { const { c, k } = HeroKit.fit($('#sTest'), 400, 400), T = Store.getTest(), s = (400 - 8) / 4; c.fillStyle = P.surf; c.fillRect(0, 0, 400, 400);
      for (let i = 0; i < 16; i++) Thumb.draw(c, k, T[i], 4 + (i % 4) * s + 2, 4 + Math.floor(i / 4) * s + 2, s - 4, P, { run: r ? r.runs[i] : null });
      if (!r) HeroKit.label(c, k, 'Обучи модель — здесь появятся попытки', 200, 200, { px: 12.5, weight: 700, color: P.ink2 }); }
    $('#sHeadL').textContent = `Набор: ${nWord(M, 'сцена', 'сцены', 'сцен')} × ${K}`;
    $('#sSubL').textContent = `${nWord(M * K, 'демонстрация', 'демонстрации', 'демонстраций')}, по одной расстановке на плитке`;
    const sl = $('#sStatL'), sr = $('#sStatR');
    setOut(sl, `Сцен в наборе: <b>${M}</b> из 32 возможных, по <b>${K}</b> ${plural(K, 'демонстрации', 'демонстрации', 'демонстраций')}`);
    setOut(sr, r ? `Взят кубик: <b>${r.ok} из 100</b> новых сцен` : 'Модель на этом наборе ещё не обучена');
    sr.classList.toggle('ok', !!r && r.ok >= 90);
  }
  /** График: доля провалов от числа сцен, обе оси логарифмические. */
  function drawPlot() {
    const cv = $('#sPlot'), narrow = (cv.parentElement.getBoundingClientRect().width || PW) < 480, W = narrow ? 360 : PW, H = narrow ? 300 : PH;
    if (cv.dataset.layout !== (narrow ? 'n' : 'w')) { cv.style.aspectRatio = `${W} / ${H}`; cv.dataset.layout = narrow ? 'n' : 'w'; }
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), L = narrow ? 46 : 56, R = W - 16, T = narrow ? 44 : 52, B = H - 46;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (m) => L + (R - L) * Math.log2(m) / 5, Y = (g) => T + (B - T) * (-Math.log10(Math.max(g, 0.006))) / 2.2;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const m of MS) { c.beginPath(); c.moveTo(X(m), T); c.lineTo(X(m), B); c.stroke(); HeroKit.label(c, k, String(m), X(m), B + 13, { px: 11, color: P.ink3, halo: false }); }
    for (const [g, t] of [[1, '100%'], [0.3, '30%'], [0.1, '10%'], [0.03, '3%'], [0.01, '1%']]) { c.beginPath(); c.moveTo(L, Y(g)); c.lineTo(R, Y(g)); c.stroke(); HeroKit.label(c, k, t, L - 6, Y(g), { px: 11, color: P.ink3, align: 'right', halo: false }); }
    HeroKit.label(c, k, 'сцен в наборе', (L + R) / 2, B + 31, { px: 11.5, weight: 650, color: P.ink2, halo: false });
    HeroKit.label(c, k, narrow ? 'доля провалов на 100 новых сценах' : 'доля провалов на 100 новых сценах', L - (narrow ? 40 : 0), narrow ? T - 14 : T - 16, { px: 11.5, weight: 650, color: P.ink2, align: 'left', halo: false });
    const Ks = [1, 2, 4, 8, 16].filter((K) => serRes(K).length);
    if (!Ks.length) HeroKit.label(c, k, narrow ? 'Обучи серию — появятся точки' : 'Сделай ставку и обучи серию в миссии — здесь появятся точки', (L + R) / 2, (T + B) / 2, { px: 12.5, weight: 650, color: P.ink2 });
    Ks.forEach((K) => {
      const col = kCol(K), f = fitOf(K), pts = serRes(K);
      if (f && pts.length >= 3) { c.strokeStyle = col; c.lineWidth = 1.6; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(X(1), Y(f.at(1))); c.lineTo(X(32), Y(f.at(32))); c.stroke(); c.setLineDash([]); }
      for (const r of pts) { const zero = r.gap <= 0; c.beginPath(); c.arc(X(r.M), Y(zero ? 0.006 : r.gap), 4.6, 0, 7); if (zero) { c.strokeStyle = col; c.lineWidth = 2; c.stroke(); } else { c.fillStyle = col; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1.2; c.stroke(); } }
    });
    // легенда цветов
    let lx = R; const ly = narrow ? T - 34 : 16; [...Ks].reverse().forEach((K) => { const t = narrow ? String(K) : `${K} на сцену`; c.font = `600 ${11 * k}px Inter, system-ui, sans-serif`; const w = c.measureText(t).width; lx -= w + 22; c.fillStyle = kCol(K); c.beginPath(); c.arc(lx + 5, ly, 4.5, 0, 7); c.fill(); HeroKit.label(c, k, t, lx + 13, ly, { px: 11, color: P.ink2, align: 'left', halo: false }); });
    if (narrow && Ks.length) HeroKit.label(c, k, 'демонстраций на сцену:', lx - 6, ly, { px: 11, color: P.ink3, align: 'right', halo: false });
  }
  function readout() {
    const el = $('#sOut');
    if (Store.st.busy === 'scale') return setOut(el, `Обучение и проверка… ${Math.round(Store.st.prog * 100)}%`);
    const M = st.show ? st.show[0] : st.M, K = st.show ? st.show[1] : st.K, r = Store.get(M, K), f = fitOf(K);
    if (!r) return setOut(el, '');
    const tbl = r.runs.filter((q) => !q.ok && q.miss === 'table').length, dis = r.runs.filter((q) => !q.ok && q.miss !== 'table').length;
    setOut(el, `<b>${M} × ${K} = ${demos(M * K)}:</b> кубик взят в ${r.ok} из 100 новых сцен; промахов по помехам — ${dis}, по пустому столу — ${tbl}.` + (f && serRes(K).length >= 3 ? ` Прямая для ${K} на сцену: доля провалов ≈ ${fmt(f.beta, 2)} · M<sup>−${fmt(f.alpha, 2)}</sup>, r = ${fmt(f.r, 2)}.` : ''));
  }
  function render() { drawPanes(); drawPlot(); readout(); const pg = $('#sProg'); pg.hidden = Store.st.busy !== 'scale'; pg.firstElementChild.style.width = (Store.st.prog * 100).toFixed(1) + '%'; $('#sOne').disabled = !!Store.st.busy; }
  /** Серия: шесть наборов 1–32 сцены по K демонстраций. */
  async function series(K) {
    st.K = K; segSet('#sK', K); render();
    MS.forEach((M) => st.seen.add(M + 'x' + K));
    await Store.ensure(MS.map((M) => [M, K]), 'scale');
    st.show = [32, K]; render();
    const R = serRes(K), f = fitOf(K), g = (M) => Store.get(M, K).gap;
    return { K, n: R.length, fit: f, g1: g(1), g32: g(32), f1: Math.round(g(1) * 100), f32: Math.round(g(32) * 100), flat: Math.abs(g(8) - g(32)) < 0.03 };
  }
  const meanDiff = (Ka, Kb) => MS.reduce((s, M) => s + Math.abs(Store.get(M, Ka).ok - Store.get(M, Kb).ok), 0) / MS.length;
  const api = {
    reset() { st.K = 8; st.M = 8; st.show = null; st.seen = new Set(); segSet('#sK', 8); segSet('#sM', 8); render(); },
    state: () => ({ K: st.K, M: st.M, show: st.show, busy: Store.st.busy }),
    setK(K) { st.K = K; segSet('#sK', K); st.show = null; render(); },
    setM(M) { st.M = M; segSet('#sM', M); st.show = null; render(); },
    series,
    async one(M, K) { st.seen.add(M + 'x' + K); await Store.ensure([[M, K]], 'scale'); st.show = [M, K]; render(); return Store.get(M, K); },
    s1: () => series(8),
    async s2() { await series(8); const r = await series(1), f8 = fitOf(8); return Object.assign(r, { fit1: r.fit, fit8: f8, f32_1: Math.round(Store.get(32, 1).gap * 100), f32_8: Math.round(Store.get(32, 8).gap * 100), meanDiff: meanDiff(1, 8), above: MS.filter((M) => Store.get(M, 1).gap > Store.get(M, 8).gap).length }); },
    async s3() { await series(8); const r = await series(16); return Object.assign(r, { meanDiff: meanDiff(16, 8), below: MS.filter((M) => Store.get(M, 16).gap < Store.get(M, 8).gap * 0.75).length, ok16: Store.get(32, 16).ok, ok8: Store.get(32, 8).ok, f16: fitOf(16), f8: fitOf(8) }); },
  };
  const missions = [
    { short: 'Прямая', title: 'Как падает доля провалов', text: 'Обучим шесть моделей — на 1, 2, 4, 8, 16 и 32 сценах, по 8 демонстраций в каждой — и проверим каждую на 100 новых сценах. На графике будет доля провалов, обе оси логарифмические.',
      controls: [], onEnter: (X) => X.setK(8),
      bet: { q: 'как лягут точки?', options: ['Почти на прямую: каждое удвоение сцен умножает долю провалов на одно и то же число', 'Сначала вниз, потом полка: после нескольких сцен ничего не меняется', 'На прямую в обычных осях: каждая новая сцена убирает одно и то же число провалов'], answer: (r) => (Math.abs(r.fit.r) >= 0.9 ? 0 : r.flat ? 1 : 2) },
      action: { label: 'Обучить серию: 1–32 сцены', run: (X) => X.s1() },
      criteria: [{ label: 'Шесть моделей обучены и проверены', test: (r) => r.n === 6 }, { label: 'Точки близко к прямой: |r| не меньше 0,9', test: (r) => Math.abs(r.fit.r) >= 0.9 }, { label: 'При 32 сценах провалов хотя бы в 5 раз меньше, чем при одной', test: (r) => r.g32 * 5 <= r.g1 }],
      explain: (r) => `Провалов при одной сцене ${r.f1} из 100, при 32 сценах — ${r.f32}. Прямая: доля провалов ≈ ${fmt(r.fit.beta, 2)} · M<sup>−${fmt(r.fit.alpha, 2)}</sup>, коэффициент корреляции ${fmt(r.fit.r, 2)}. Каждое удвоение сцен умножает долю провалов примерно на ${fmt(Math.pow(2, -r.fit.alpha), 2)}, то есть убирает ${fmt((1 - Math.pow(2, -r.fit.alpha)) * 100, 0)}% оставшихся. У Lin и соавторов показатель для Mouse Arrangement по парам «среда — предмет» — 0,68: мир и политика другие, а форма зависимости та же.` },
    { short: '1 на сцену', title: 'Одна демонстрация на сцену', text: 'Теперь те же шесть наборов сцен, но в каждой сцене по одной демонстрации — данных в восемь раз меньше.',
      controls: [],
      bet: { q: 'где окажутся новые точки?', options: ['Там же: важны сцены, а не демонстрации', 'Выше, и прямая положе: провалов больше, и с ростом сцен они убывают медленнее', 'Ниже: на малых данных модель меньше переобучается'], answer: (r) => (r.meanDiff <= 5 ? 0 : r.above <= 1 ? 2 : 1) },
      action: { label: 'Обучить серию с одной демонстрацией', run: (X) => X.s2() },
      criteria: [{ label: 'Серия обучена', test: (r) => r.n === 6 }, { label: 'При 32 сценах провалов больше, чем с 8 демонстрациями', test: (r) => r.f32_1 > r.f32_8 }],
      explain: (r) => `С одной демонстрацией на сцену при 32 сценах провалов ${r.f32_1} из 100, с восемью — ${r.f32_8}; наклон прямой ${fmt(r.fit1.alpha, 2)} против ${fmt(r.fit8.alpha, 2)}. Одной расстановки мало, чтобы сеть отделила кубик от помех этой сцены: демонстрации на сцену нужны, пока их мало. У Lin и соавторов то же видно по баллу: на кривых для 1/32 и 1/16 демонстраций он ниже, чем на остальных.` },
    { short: '16 на сцену', title: 'Шестнадцать демонстраций на сцену', text: 'А если записать по 16 демонстраций в каждой сцене — вдвое больше, чем в первой серии?',
      controls: [],
      bet: { q: 'что станет с точками?', options: ['Опустятся: провалов везде станет примерно вдвое меньше', 'Почти совпадут с точками для 8 демонстраций', 'Лягут на более крутую прямую: больше демонстраций — быстрее рост'], answer: (r) => (r.meanDiff < 5 ? 1 : r.below >= 4 ? 0 : 2) },
      action: { label: 'Обучить серию с 16 демонстрациями', run: (X) => X.s3() },
      criteria: [{ label: 'Серия обучена', test: (r) => r.n === 6 }, { label: 'Точки для 8 и 16 демонстраций в среднем расходятся меньше чем на 5 сцен из 100', test: (r) => r.meanDiff < 5 }],
      explain: (r) => `В среднем точки для 8 и 16 демонстраций расходятся на ${fmt(r.meanDiff, 1)} сцены из 100, при 32 сценах — ${r.ok16} и ${r.ok8} из 100. Вдвое больше записей — почти тот же результат: после порога демонстрации в тех же сценах перестают помогать. У Lin и соавторов то же видно по совпадающим кривым для половины и всех демонстраций, а порог — около 50 демонстраций на пару «среда — предмет».` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Обучай отдельные модели: выбери число сцен и демонстраций на сцену и нажми «Обучить и проверить». Найди самый маленький по общему числу демонстраций набор, который берёт кубик хотя бы в 90 из 100 новых сцен.', final: true, controls: ['K', 'M', 'one'] },
  ];
  function init() {
    segBind('#sK', (v) => api.setK(+v)); segBind('#sM', (v) => api.setM(+v));
    $('#sOne').addEventListener('click', () => { if (!Store.st.busy) api.one(st.M, st.K); });
    Store.on(render);
    ctl = mountMissions('#sMis', missions, api, { controls: { K: '#wrapSK', M: '#wrapSM', one: '#sOne' }, scene: '#sPlot' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, fitOf, MS };
})();

/* =====================================================================
   3. Интерактив: удвоить демонстрации или сцены — две модели рядом
   ===================================================================== */
const Dbl = (() => {
  const E = L41, st = { M: 1, K: 4, done: false };
  let ctl = null;
  const sets = () => ({ B: [st.M, st.K], L: [st.M, st.K * 2], R: [st.M * 2, st.K] });
  /** Панель: полоса сцен набора сверху, 9 проверочных сцен ниже. */
  function pane(cv, side) {
    const { c, k } = HeroKit.fit(cv, 400, 400), P = pal(), S = sets(), [M, K] = S[side], r = st.done ? Store.get(M, K) : null;
    c.fillStyle = P.surf; c.fillRect(0, 0, 400, 400);
    const shown = Math.min(M, 8), ts = Math.min(64, (392 - 8) / Math.max(shown + (M > 8 ? 1 : 0), 4));
    for (let i = 0; i < shown; i++) Thumb.draw(c, k, E.arrange(E.POOL.base + i, 0), 6 + i * (ts + 2), 6, ts, P, { badge: '×' + K, badgeCol: side === 'L' ? P.e2e : null, frame: i >= st.M ? P.e2e : P.ink3 });
    if (M > 8) HeroKit.label(c, k, `+${M - 8}`, 6 + shown * (ts + 2) + ts / 2, 6 + ts / 2, { px: 13, weight: 700, color: P.e2e, halo: false });
    const y0 = 6 + ts + 12, s = Math.min((400 - 12) / 3, (400 - y0 - 6) / 3), x0 = (400 - 3 * s) / 2, T = Store.getTest();
    for (let i = 0; i < 9; i++) Thumb.draw(c, k, T[i], x0 + (i % 3) * s + 2, y0 + Math.floor(i / 3) * s + 2, s - 4, P, { run: r ? r.runs[i] : null });
    if (!r) HeroKit.label(c, k, 'Сделай ставку и нажми кнопку', 200, y0 + 1.5 * s, { px: 12.5, weight: 700, color: P.ink2 });
  }
  function render() {
    const S = sets(), b = st.done ? Store.get(...S.B) : null;
    pane($('#dCvL'), 'L'); pane($('#dCvR'), 'R');
    $('#dSubL').textContent = `${nWord(st.M, 'сцена', 'сцены', 'сцен')} × ${st.K * 2}`; $('#dSubR').textContent = `${nWord(st.M * 2, 'сцена', 'сцены', 'сцен')} × ${st.K}`;
    ['L', 'R'].forEach((sd) => { const r = st.done ? Store.get(...S[sd]) : null, el = $('#dStat' + sd); setOut(el, r && b ? `Взят кубик: <b>${r.ok} из 100</b> (было ${b.ok}, ${r.ok - b.ok >= 0 ? '+' : '−'}${Math.abs(r.ok - b.ok)})` : `Набор: ${demos(S[sd][0] * S[sd][1])}, исходный — ${st.M * st.K}`); });
    const L = st.done ? Store.get(...S.L) : null, R = st.done ? Store.get(...S.R) : null;
    $('#dStatL').classList.toggle('ok', !!(L && R && L.ok > R.ok)); $('#dStatR').classList.toggle('ok', !!(L && R && R.ok > L.ok));
    const pg = $('#dProg'); pg.hidden = Store.st.busy !== 'dbl'; pg.firstElementChild.style.width = (Store.st.prog * 100).toFixed(1) + '%';
    $('#dGo').disabled = !!Store.st.busy;
    setOut($('#dOut'), Store.st.busy === 'dbl' ? `Обучение трёх моделей и проверка… ${Math.round(Store.st.prog * 100)}%` : b ? `<b>Исходный набор ${st.M} × ${st.K}:</b> кубик взят в ${b.ok} из 100 новых сцен. Удвоение демонстраций: ${L.ok - b.ok >= 0 ? '+' : '−'}${Math.abs(L.ok - b.ok)}, удвоение сцен: ${R.ok - b.ok >= 0 ? '+' : '−'}${Math.abs(R.ok - b.ok)}.` : '');
  }
  function setBase(M, K) { st.M = M; st.K = K; st.done = !!(Store.get(M, K) && Store.get(M, K * 2) && Store.get(M * 2, K)); segSet('#dM', M); segSet('#dK', K); render(); }
  async function compare() {
    const S = sets(); st.done = false; render();
    const [B, L, R] = await Store.ensure([S.B, S.L, S.R], 'dbl');
    st.done = true; render();
    return { M: st.M, K: st.K, B: B.ok, L: L.ok, R: R.ok };
  }
  const api = {
    reset() { setBase(1, 4); },
    state: () => ({ M: st.M, K: st.K, done: st.done }),
    setBase, compare,
  };
  const missions = [
    { short: '1 сцена', title: 'Одна сцена, четыре демонстрации', text: 'Исходный набор — одна сцена и 4 демонстрации в ней. Слева в той же сцене записали ещё 4 демонстрации, справа — 4 демонстрации во второй сцене. Нажми кнопку: обучатся три модели — на исходном наборе и на двух удвоенных.',
      controls: [], onEnter: (X) => X.setBase(1, 4),
      bet: { q: 'вдвое больше демонстраций в той же сцене — успех удвоится?', options: ['Да: данных вдвое больше, и кубик будет взят вдвое чаще', 'Вырастет, но меньше, чем от второй сцены с теми же 4 демонстрациями', 'Почти не изменится, а вторая сцена поднимет успех заметно'], answer: (r) => (r.L >= 1.8 * r.B ? 0 : r.L - r.B <= 3 && r.R - r.B >= 10 ? 2 : 1) },
      action: { label: 'Обучить и сравнить', run: (X) => X.compare() },
      criteria: [{ label: 'Три модели обучены и проверены', test: (r) => !!r }, { label: 'Вторая сцена дала больше, чем вдвое больше демонстраций в первой', test: (r) => r.R > r.L }],
      explain: (r) => `Исходный набор — ${r.B} из 100. Вдвое больше демонстраций в той же сцене — ${r.L}, вторая сцена с теми же четырьмя демонстрациями — ${r.R}. Новые расстановки той же сцены ничего не добавили: стол, свет и помехи остались прежними. Вторая сцена принесла новый стол, свет, помехи и кубик — то, что меняется и в проверке.` },
    { short: '16 сцен', title: 'Шестнадцать сцен по одной демонстрации', text: 'Теперь исходный набор — 16 сцен, в каждой по одной демонстрации. Слева в каждой сцене записали вторую демонстрацию, справа — 16 новых сцен по одной.',
      controls: [], onEnter: (X) => X.setBase(16, 1),
      bet: { q: 'что даст больше?', options: ['Снова новые сцены: разнообразие важнее всегда', 'Вторая демонстрация в каждой сцене — не меньше, чем 16 новых сцен', 'Ничего: обе добавки почти не помогут'], answer: (r) => (r.L >= r.R - 2 ? 1 : r.R - r.B <= 3 && r.L - r.B <= 3 ? 2 : 0) },
      action: { label: 'Обучить и сравнить', run: (X) => X.compare() },
      criteria: [{ label: 'Три модели обучены и проверены', test: (r) => !!r }, { label: 'Вторая демонстрация в сцене дала не меньше, чем новые сцены (с точностью до 2 из 100)', test: (r) => r.L >= r.R - 2 }],
      explain: (r) => `Исходный набор — ${r.B} из 100. Вторая демонстрация в каждой сцене — ${r.L}, 16 новых сцен по одной демонстрации — ${r.R}. По одной расстановке сеть плохо отделяет кубик от помех своей сцены, и вторая расстановка помогает не меньше новых сцен. Правило «только разнообразие» неверно: демонстраций на сцену нужно столько, чтобы дойти до порога, а дальше выгоднее добавлять сцены.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай исходный набор и сравнивай оба удвоения. Найди исходный набор, при котором удвоение демонстраций и удвоение сцен дают почти одинаковый прирост, и посмотри, сколько в нём демонстраций на сцену.', final: true, controls: ['M', 'K', 'go'] },
  ];
  function init() {
    segBind('#dM', (v) => setBase(+v, st.K)); segBind('#dK', (v) => setBase(st.M, +v));
    $('#dGo').addEventListener('click', () => { if (!Store.st.busy) compare(); });
    Store.on(render);
    ctl = mountMissions('#dMis', missions, api, { controls: { M: '#wrapDM', K: '#wrapDK', go: '#dGo' }, scene: '#dDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
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
    { q: '«Разрыв в 100 000 лет» — точная мера того, насколько данных роботов меньше, чем текста?', o: ['Да, её посчитали по всем датасетам', 'Нет: это мысленный эксперимент, перевод корпуса во время чтения; допущения меняют ответ в разы, а порядок величины остаётся', 'Нет: разрыв на самом деле около 100 лет'], a: 1, e: 'Кевин Блэк сам назвал своё сравнение несерьёзным мысленным экспериментом, а Голдберг сослался на него в колонке. Скорость чтения, токены на слово, учёт картинок — каждое допущение сдвигает число, но не на пять порядков.' },
    { q: 'Если записать вдвое больше демонстраций в той же обстановке, успех на новых обстановках вырастет вдвое?', o: ['Да, если демонстрации аккуратные', 'Нет: после небольшого порога демонстрации в той же обстановке почти перестают помогать', 'Нет: он упадёт из-за переобучения'], a: 1, e: 'У Lin и соавторов кривые для половины и всех демонстраций почти совпадают. В лаборатории вдвое больше демонстраций в одной сцене не изменили успех, а вторая сцена подняла его в полтора с лишним раза.' },
    { q: 'Значит, демонстрации на обстановку вообще не важны — нужны только новые обстановки?', o: ['Да, всегда добавляй обстановки', 'Нет: ниже порога демонстрации нужны; с одной демонстрацией на сцену вторая помогает не меньше новых сцен', 'Нет: демонстрации важнее обстановок'], a: 1, e: 'Порог зависит от задачи: у Lin и соавторов — около 50 на пару «среда — предмет». Выгоднее держать демонстраций на обстановку у порога и тратить остальное на разнообразие.' },
    { q: 'Что у Lin и соавторов убывает по степенному закону?', o: ['Число демонстраций, нужное для задачи', 'Разрыв до оптимума — единица минус балл на новых средах и предметах — в зависимости от числа сред, предметов или их пар', 'Время обучения политики'], a: 1, e: 'В логарифмических осях это прямая: каждое удвоение числа сред умножает разрыв на одно и то же число. От общего числа демонстраций такой зависимости нет: r всего −0,62 и −0,79.' },
    { q: 'Степенной закон значит, что успех будет расти без предела, если добавлять среды?', o: ['Да, прямая в логарифмических осях не кончается', 'Нет: у задачи есть неустранимая доля провалов, а прямую провели через шесть точек; прогноз на 1191 пару авторы оставили непроверенным', 'Нет, закон работает только до 8 сред'], a: 1, e: 'Модель с третьим параметром, пределом, авторы не подгоняли: на шести точках она не обоснована. Чем дальше прогноз от данных, тем меньше ему можно доверять.' },
    { q: '270 тысяч часов GEN-0 — это 270 тысяч часов работы роботов?', o: ['Да, это крупнейший парк роботов', 'Нет: данные собирают тысячи устройств сбора и роботов, а базовую модель GEN-1 учили вообще без данных роботов', 'Нет, это часы симуляции'], a: 1, e: 'Generalist AI пишет о сети из тысяч устройств сбора и роботов. Для GEN-1 на полмиллионе часов прямо сказано: записи сделаны носимыми устройствами на людях.' },
    { q: 'Ошибка действий на проверочных демонстрациях показывает, как поведёт себя робот?', o: ['Да, это стандартная мера', 'Нет: у Lin и соавторов она часто не совпадала с поведением на роботе, поэтому оценивали баллом проверяющего на настоящих попытках', 'Да, если демонстраций больше тысячи'], a: 1, e: 'Средний квадрат ошибки действий подчиняется похожему закону, но слабее, с выбросами. Робот действует в замкнутом контуре, и маленькая ошибка в начале может увести его туда, где демонстраций нет.' },
    { q: 'Чтобы политика лучше обобщала, достаточно увеличить сеть?', o: ['Да, как у языковых моделей', 'Нет: у Lin и соавторов рост энкодера картинок помог, а рост сети действий — нет; у GEN-0 модели меньше 7 млрд параметров «окостеневают» на больших данных', 'Нет: размер модели не влияет вовсе'], a: 1, e: 'ViT-S, B и L дали баллы 0,66, 0,81 и 0,90, а большой U-Net — 0,83 против 0,90 у базового. Данные и размер модели нужно растить согласованно.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('gap', () => { mis.gap = Gap.init(); }); safe('scale', () => { mis.scale = Scale.init(); }); safe('dbl', () => { mis.dbl = Dbl.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['gMis', 'sMis', 'dMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l41 = { mis, SPEED, Store, Gap, Scale, Dbl, L41 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
