/* =====================================================================
   ui-l61.js — урок 6.1 «Локомоция на основе RL».
   0) анимированные схемы (shared/anim.js; Ада с ногами сбоку и спереди —
      AdaBody из shared/ada-legs.js, общий рисунок для уроков 6.1–6.3):
      контур обучения ходьбы в симуляторе с тысячами копий и наградой из
      слагаемых; история наблюдений и действий как токены трансформера;
   1) лаборатория «Конструктор награды»: слагаемые с весами, политики PPO,
      посчитанные в Node и вшитые в движок, живая симуляция двух Ад рядом;
   2) лаборатория «Команда скорости»: политика на случайных командах против
      политики на одной команде, ползунок, график слежения;
   3) лаборатория «Сколько копий»: живой поиск по популяции (ARS) для ритма
      шагов в браузере, кривые по числу копий;
   4) квиз.
   Движок — l61/engine.js (без DOM).
   ===================================================================== */
'use strict';

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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;

/* =====================================================================
   0б. Схема `loop`: контур обучения ходьбы в симуляторе по Rudin et al.
   4096 копий Ады шагают одновременно: наблюдения → политика → целевые углы
   → ПД-регулятор → моменты → копии; награда шага складывается из слагаемых;
   через 24 шага порция опыта уходит в PPO, и все копии получают новые веса.
   Подписи не мельче 10 px на экране и помещаются в свои блоки: широкая
   раскладка — от 700 px ширины карточки (k ≤ 1,1), узкая — до 360 px (k ≤ 1,25).
   ===================================================================== */
(() => {
  const T = 9;
  // слагаемые: полное имя (широкая раскладка), короткое (узкая), знак
  const TERMS = [['скорость по команде', 'по команде', '+'], ['падение', 'падение', '−'], ['высота корпуса', 'высота', '−'], ['наклон корпуса', 'наклон', '−'],
    ['энергия', 'энергия', '−'], ['плавность', 'плавность', '−'], ['шаги стопы', 'шаги стопы', '+']];
  const r_ = (b) => [b[0] + b[2], b[1] + b[3] / 2], l_ = (b) => [b[0], b[1] + b[3] / 2], bt = (b) => [b[0] + b[2] / 2, b[1] + b[3]], tp = (b) => [b[0] + b[2] / 2, b[1]];
  function box(c, k, A, P, b, title, sub, col, hot) {
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.18 : 0.06), col, hot ? 2.2 : 1.3);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + 15, { px: 11.5, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] - 13, { px: 10, color: P.ink2, halo: false });
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { alpha } = A, B = g.b, n = g.narrow;
    const upd = u > 6.4 && u < 7.8, nSteps = Math.min(24, Math.floor(u * 4)), stepPh = (u * 4) % 1;
    const lab = (txt, x, y, o) => A.lab(c, k, txt, x, y, Object.assign({ px: 10, halo: false }, o));
    // копии Ады: сетка маленьких Ад спереди, одна подсвечена и переступает
    const sim = B.sim;
    box(c, k, A, P, sim, '4096 копий Ады в симуляторе', n ? 'у каждой свои трение и толчки' : 'у каждой копии своё трение пола и свои толчки', P.out, false);
    const gx0 = sim[0] + 14, gx1 = sim[0] + sim[2] - 14, gy0 = sim[1] + 30, gy1 = sim[1] + sim[3] - 30, sx = (gx1 - gx0) / g.cols, sy = (gy1 - gy0) / g.rows, s = Math.min(sx / 60, sy / 122);
    for (let r = 0; r < g.rows; r++) for (let q = 0; q < g.cols; q++) {
      const hot = r === 0 && q === 2, x = gx0 + sx * (q + 0.5), y = gy0 + sy * (r + 1) - 2;
      c.save(); c.globalAlpha = hot ? 1 : 0.45; AdaBody.front(c, x, y - (hot ? Math.abs(Math.sin(stepPh * Math.PI)) * 3 : 0), s, P, P.dark); c.restore();
    }
    box(c, k, A, P, B.pol, n ? 'политика π' : 'политика π (нейросеть)', n ? 'целевые углы' : 'вход: наблюдения и команда', P.mot, !upd);
    box(c, k, A, P, B.pd, n ? 'ПД-регулятор' : 'ПД-регулятор суставов', n ? 'моменты копиям' : 'τ = Kp·(q* − q) − Kd·dq/dt', P.ink3, false);
    box(c, k, A, P, B.ppo, n ? 'PPO: новые веса' : 'PPO: 5 эпох по порции', n ? 'порция 98 304 шага' : 'порция: 4096 × 24 = 98 304 шага', P.spr, upd);
    // награда шага: список слагаемых, текущее подсвечено
    const rw = B.rew, lit = Math.floor(stepPh * TERMS.length);
    box(c, k, A, P, rw, n ? 'награда шага' : 'награда шага = сумма слагаемых', null, P.spr, false);
    TERMS.forEach(([full, short, sign], i) => {
      const col = n ? 0 : Math.floor(i / 4), row = n ? i : i % 4, x = rw[0] + 12 + col * g.termCol, y = rw[1] + g.term0 + row * g.termDy, on = i === lit;
      lab(`${sign} ${n ? short : full}`, x, y, { weight: on ? 800 : 600, color: on ? P.spr : P.ink2, align: 'left' });
    });
    const wc = upd ? P.spr : alpha(P.spr, 0.45), wl = upd ? 2.4 : 1.4;
    if (n) {
      A.arrow(c, 60, bt(sim)[1] + 2, 60, tp(B.pol)[1] - 2, P.out, 1.8, 7); lab('наблюдения', 68, (bt(sim)[1] + tp(B.pol)[1]) / 2, { color: P.out, align: 'left' });
      A.arrow(c, 130, bt(B.pol)[1] + 2, 130, tp(B.pd)[1] - 2, P.mot, 1.8, 7);
      A.line(c, [[B.pd[0] - 2, l_(B.pd)[1]], [14, l_(B.pd)[1]], [14, bt(sim)[1] + 9]], P.ink3, 1.6); A.arrow(c, 14, bt(sim)[1] + 9, 14, bt(sim)[1] + 2, P.ink3, 1.6, 6);
      A.arrow(c, 270, bt(sim)[1] + 2, 270, tp(rw)[1] - 2, P.spr, 1.6, 6); lab('каждый шаг', 262, (bt(sim)[1] + tp(rw)[1]) / 2, { color: P.spr, align: 'right' });
      A.arrow(c, 320, bt(rw)[1] + 2, 320, tp(B.ppo)[1] - 2, wc, wl, 7); lab(`${nSteps} из 24 шагов`, 312, (bt(rw)[1] + tp(B.ppo)[1]) / 2, { color: P.spr, align: 'right' });
      const gx = 179; A.line(c, [[B.ppo[0] - 2, l_(B.ppo)[1]], [gx, l_(B.ppo)[1]], [gx, r_(B.pol)[1]]], wc, wl); A.arrow(c, gx, r_(B.pol)[1], r_(B.pol)[0] + 2, r_(B.pol)[1], wc, wl, 7);
    } else {
      const yo = B.pol[1] + 32;
      A.arrow(c, r_(sim)[0] + 2, yo, B.pol[0] - 2, yo, P.out, 1.8, 7); lab('наблюдения и команда', (r_(sim)[0] + B.pol[0]) / 2, yo - 12, { color: P.out });
      A.arrow(c, tp(B.pol)[0], bt(B.pol)[1] + 2, tp(B.pd)[0], tp(B.pd)[1] - 2, P.mot, 1.8, 7); lab('целевые углы', tp(B.pol)[0] - 8, (bt(B.pol)[1] + tp(B.pd)[1]) / 2, { color: P.mot, align: 'right' });
      A.arrow(c, B.pd[0] - 2, l_(B.pd)[1], r_(sim)[0] + 2, l_(B.pd)[1], P.ink3, 1.6, 6); lab('моменты в суставах', (r_(sim)[0] + B.pd[0]) / 2, l_(B.pd)[1] - 12, { color: P.ink3 });
      A.arrow(c, tp(rw)[0], bt(sim)[1] + 2, tp(rw)[0], tp(rw)[1] - 2, P.spr, 1.6, 6); lab('каждый шаг', tp(rw)[0] + 8, (bt(sim)[1] + tp(rw)[1]) / 2, { color: P.spr, align: 'left' });
      const yr = l_(B.ppo)[1];
      A.arrow(c, r_(rw)[0] + 2, yr, B.ppo[0] - 2, yr, wc, wl, 7); lab('порция опыта', (r_(rw)[0] + B.ppo[0]) / 2, yr - 12, { color: P.spr }); lab(`${nSteps} из 24 шагов`, (r_(rw)[0] + B.ppo[0]) / 2, yr + 13, { color: P.spr });
      const gx = B.ppo[0] + B.ppo[2] + 8; A.line(c, [[r_(B.ppo)[0] + 2, yr], [gx, yr], [gx, r_(B.pol)[1]]], wc, wl); A.arrow(c, gx, r_(B.pol)[1], r_(B.pol)[0] + 2, r_(B.pol)[1], wc, wl, 7);
      lab('новые веса', r_(B.pd)[0], (bt(B.pd)[1] + tp(B.ppo)[1]) / 2, { color: P.spr, align: 'right' });
    }
    const cap = upd ? (n ? ['Порция собрана: PPO делает 5 эпох', 'и присылает копиям новые веса'] : ['Порция из 98 304 шагов собрана: PPO делает по ней 5 эпох', 'и присылает всем копиям новые веса политики'])
      : (n ? ['Копии шагают 50 раз в секунду; награда', 'каждого шага складывается из слагаемых'] : ['Все копии шагают одновременно, 50 раз в секунду, и каждый шаг', 'получает награду — сумму слагаемых с весами']);
    lab(cap[0], g.cap[0], g.cap[1], { px: n ? 10.5 : 12, weight: 700, color: P.ink, align: 'left' });
    lab(cap[1], g.cap[0], g.cap[1] + 18, { px: n ? 10.5 : 12, weight: 600, color: P.ink2, align: 'left' });
  }
  const WIDE = { narrow: false, cols: 8, rows: 3, termCol: 146, term0: 30, termDy: 16,
    b: { sim: [16, 34, 300, 172], pol: [480, 34, 224, 66], pd: [480, 144, 224, 62], rew: [16, 240, 300, 104], ppo: [480, 262, 224, 62] }, cap: [16, 374] };
  const NARROW = { narrow: true, cols: 7, rows: 2, termCol: 0, term0: 32, termDy: 16,
    b: { sim: [10, 10, 340, 150], pol: [26, 196, 142, 58], pd: [26, 292, 142, 58], rew: [190, 196, 160, 154], ppo: [190, 380, 160, 58] }, cap: [10, 458] };
  Anim.add('loop', {
    W: 720, H: 410, start: 2.5, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 490, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   0в. Схема `tokens`: политика Digit (Radosavovic et al. 2024) — каузальный
   трансформер по истории из 16 пар «наблюдение, действие»: лента токенов
   ползёт, внимание последнего токена идёт только назад, выход — следующее
   действие; при толчке меняется история, а не веса (адаптация в контексте).
   ===================================================================== */
(() => {
  const T = 12, N = 16;
  /** Digit схематично, вид спереди: корпус, руки, ноги со стопами; x — центр, yb — низ стоп, s — масштаб (рост 100·s). */
  function digit(c, x, yb, s, P, A, lean) {
    c.save(); c.translate(x, yb); c.rotate(lean || 0); c.scale(s, s);
    const ln = P.ink2, fill = A.alpha(P.ink3, 0.18);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const lx of [-7, 7]) { c.strokeStyle = ln; c.lineWidth = 4; c.beginPath(); c.moveTo(lx, -52); c.lineTo(lx * 1.25, -28); c.lineTo(lx, -4); c.stroke(); A.rect(c, lx - 7, -5, 14, 5, 2, ln, null); }
    A.rect(c, -14, -88, 28, 38, 7, fill, ln, 2);
    c.strokeStyle = ln; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-14, -82); c.lineTo(-22, -60); c.lineTo(-18, -44); c.moveTo(14, -82); c.lineTo(22, -60); c.lineTo(18, -44); c.stroke();
    A.rect(c, -9, -100, 18, 10, 3, fill, ln, 2);
    c.restore();
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, alpha } = A, n = g.narrow;
    const lab = (txt, x, y, o) => A.lab(c, k, txt, x, y, Object.assign({ px: 10, halo: false }, o));
    const push = u > 5 && u < 8.5, shift = (u * 2) % 1;              // толчок в середине цикла; лента ползёт: новая пара каждые 0,5 с схемы
    const { x0, x1, y } = g.tape, tw = (x1 - x0) / N;
    lab(n ? 'история: 16 пар «наблюдение, действие»' : 'история робота: 16 последних пар «наблюдение, действие», по токену на пару', x0, g.title, { px: 10.5, weight: 700, color: P.ink, align: 'left' });
    c.save(); c.beginPath(); c.rect(x0, y - 16, x1 - x0, 34); c.clip();
    for (let i = -1; i < N; i++) {
      const x = x0 + tw * (i + 1 - shift), hot = push && i >= N - 6, fade = i < 3 ? 0.35 : 0.85;
      A.rect(c, x + 1, y - 14, tw - 2, 12, 2, alpha(hot ? P.bad : P.out, fade), null);
      A.rect(c, x + 1, y + 2, tw - 2, 12, 2, alpha(hot ? P.bad : P.mot, fade), null);
    }
    c.restore();
    if (!n) { lab('наблюдения', x0 - 8, y - 8, { color: P.out, align: 'right' }); lab('действия', x0 - 8, y + 8, { color: P.mot, align: 'right' }); }
    // внимание: от последнего токена к прошлым (только назад), дуги под лентой
    const lastX = x1 - tw / 2;
    for (let i = N - 10; i < N - 1; i++) { const x = x0 + tw * (i + 0.5), a = 0.15 + 0.7 * seg(i, N - 10, N - 2); c.strokeStyle = alpha(P.spr, a); c.lineWidth = 1.3; c.beginPath(); c.moveTo(lastX, y + 16); c.quadraticCurveTo((lastX + x) / 2, y + 30 + (lastX - x) * 0.04, x, y + 16); c.stroke(); }
    lab('шаг t − 15', x0, g.steps, { color: P.ink3, align: 'left' });
    lab(n ? '16 шагов = 0,32 с' : '16 шагов по 20 мс = 0,32 с', (x0 + x1) / 2 - (n ? 20 : 0), g.steps, { color: P.ink3 });
    lab('шаг t', lastX - 10, g.steps, { color: P.ink3, align: 'right' });
    if (n) {   // легенда цветов ленты
      A.rect(c, x0, g.legend - 5, 10, 10, 2, alpha(P.out, 0.85), null); lab('наблюдение', x0 + 14, g.legend, { color: P.out, align: 'left' });
      A.rect(c, x0 + 110, g.legend - 5, 10, 10, 2, alpha(P.mot, 0.85), null); lab('действие', x0 + 124, g.legend, { color: P.mot, align: 'left' });
    }
    const tb = g.tr;
    A.arrow(c, lastX, y + 18, lastX, tb[1] - 2, P.spr, 2, 7);
    A.rect(c, tb[0], tb[1], tb[2], tb[3], 10, alpha(P.spr, 0.1), P.spr, 1.6);
    lab(n ? 'каузальный трансформер' : 'каузальный трансформер: 4 блока, 1,4 млн параметров', tb[0] + tb[2] / 2, tb[1] + 17, { px: 11.5, weight: 700, color: P.spr });
    lab(n ? 'видит только прошлые токены' : 'каждый токен смотрит только на прошлые токены', tb[0] + tb[2] / 2, tb[1] + tb[3] - 15, { color: P.ink2 });
    // выход: следующее действие → робот; при толчке — красная стрелка, робот кренится
    const rb = g.rob, lean = push ? -0.08 * Math.sin(Math.PI * seg(u, 5, 8.5)) : 0;
    if (n) {
      A.arrow(c, rb[0], tb[1] + tb[3] + 2, rb[0], rb[1] - 104 * g.rs, P.mot, 2.2, 8);
      lab('выход: действие t + 1,', g.out[0], g.out[1], { px: 10.5, weight: 700, color: P.mot, align: 'left' });
      lab('целевые углы и коэффициенты ПД', g.out[0], g.out[1] + 16, { color: P.mot, align: 'left' });
    } else {
      A.arrow(c, tb[0] + tb[2] + 2, tb[1] + tb[3] / 2, rb[0] - 30 * g.rs, tb[1] + tb[3] / 2, P.mot, 2.2, 8);
      lab('выход: целевые углы 16 суставов и коэффициенты ПД 8 суставов ног', tb[0] + tb[2] / 2, g.out[1], { px: 10.5, weight: 700, color: P.mot });
      // новая пара уходит в историю
      const fy = y - 1, fx = rb[0];
      A.line(c, [[fx, rb[1] - 104 * g.rs - 4], [fx, fy], [x1 + 14, fy]], alpha(P.ink3, 0.7), 1.4); A.arrow(c, x1 + 14, fy, x1 + 4, fy, alpha(P.ink3, 0.7), 1.4, 6);
      lab('новая пара', (x1 + fx) / 2 + 6, fy - 12, { color: P.ink3 });
    }
    digit(c, rb[0], rb[1], g.rs, P, A, lean);
    lab('Digit', rb[0], rb[1] + 13, { weight: 700, color: P.ink2 });
    if (push) { const ay = rb[1] - 70 * g.rs; A.arrow(c, g.push[1], ay, g.push[0], ay, P.bad, 2.4, 8); lab('толчок', (g.push[0] + g.push[1]) / 2, ay - 13, { px: 10.5, weight: 700, color: P.bad }); }
    const cap = push ? (n ? ['Толчок попал в историю: веса те же,', 'а действия уже другие'] : ['Толчок попал в историю: последние пары необычны, а веса сети те же,', 'и политика меняет шаги по контексту, как языковая модель по подсказке'])
      : (n ? ['Каждые 20 мс в историю приходит пара,', 'и сеть выдаёт следующее действие'] : ['Каждые 20 мс в историю добавляется новая пара, и сеть', 'предсказывает следующее действие, как языковая модель — слово']);
    lab(cap[0], g.cap[0], g.cap[1], { px: n ? 10.5 : 12, weight: 700, color: P.ink, align: 'left' });
    lab(cap[1], g.cap[0], g.cap[1] + 18, { px: n ? 10.5 : 12, weight: 600, color: P.ink2, align: 'left' });
  }
  Anim.add('tokens', {
    W: 720, H: 330, start: 1.0, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { title: 28, tape: { x0: 110, x1: 560, y: 62 }, steps: 112, tr: [110, 134, 450, 62], out: [0, 216], rob: [646, 236], rs: 1, push: [668, 712], cap: [20, 284] }); },
    narrow: { W: 360, H: 410, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, title: 16, tape: { x0: 10, x1: 350, y: 46 }, steps: 98, legend: 118, tr: [10, 138, 340, 64], out: [10, 244], rob: [262, 340], rs: 0.95, push: [282, 336], cap: [10, 374] }); } },
  });
})();

/* =====================================================================
   Сцена: одна Ада в живой симуляции, вид сбоку. Логический канвас 320 × 240,
   105 пикселей на метр, пол на y = 206, камера следует за Адой по x.
   Ада рисуется AdaBody из shared/ada-legs.js.
   ===================================================================== */
const Pane = (() => {
  const W = 320, H = 240, M = 105, FLOOR = 206, CX = 150;
  /** run — Runner (ниже); o: { title, titleShort, color, empty, emptyShort } */
  function draw(cv, run, o) {
    o = o || {}; const { c, k } = HeroKit.fit(cv, W, H), P = pal(), sh = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const x0 = run && run.E ? run.E.S.b[0] : 0;
    const X = (x) => CX + (x - x0) * M, Y = (y) => FLOOR - y * M;
    // пол с метками каждые 0,5 м и подписями метров
    c.fillStyle = P.grid; c.fillRect(0, FLOOR, W, H - FLOOR);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, FLOOR + 0.5); c.lineTo(W, FLOOR + 0.5); c.stroke();
    const m0 = Math.floor((x0 - CX / M) * 2) / 2;
    for (let mx = m0; mx < x0 + (W - CX) / M + 0.5; mx += 0.5) { const px = X(mx); c.strokeStyle = P.line; c.beginPath(); c.moveTo(px, FLOOR); c.lineTo(px, FLOOR + (Number.isInteger(mx) ? 10 : 5)); c.stroke(); if (Number.isInteger(mx) && px > 16 && px < W - 16) HeroKit.label(c, k, `${mx} м`, px, FLOOR + 22, { px: 10, color: P.ink3, halo: false }); }
    const title = sh && o.titleShort ? o.titleShort : o.title, ty = 6 + 9 * Math.max(1, k);
    if (!run || !run.E) {
      if (title) HeroKit.label(c, k, title, 8, ty, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
      if (o.empty) HeroKit.label(c, k, sh && o.emptyShort ? o.emptyShort : o.empty, W / 2, 110, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.bg });
      return { c, k, P };
    }
    // след бедра за последние секунды
    if (run.trail.length > 1) { c.strokeStyle = HeroKit.css('--e2e-soft'); c.lineWidth = 2; c.beginPath(); run.trail.forEach(([tx, ty2], i) => (i ? c.lineTo(X(tx), Y(ty2)) : c.moveTo(X(tx), Y(ty2)))); c.stroke(); }
    AdaBody.side(c, X, Y, L61.snap(run.E.S), { color: o.color });
    // команда и фактическая скорость корпуса
    if (run.cmdShow !== false) HeroKit.label(c, k, `команда ${fmt(run.cmd, 1)} м/с · идёт ${fmt(Math.max(-9, run.vNow), 2)} м/с`, 8, 22 + (title ? 15 * Math.max(1, k) : 0), { px: 11, weight: 650, color: P.ink2, align: 'left', haloColor: P.bg });
    if (title) HeroKit.label(c, k, title, 8, ty, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    if (run.lying) HeroKit.label(c, k, 'корпус на полу', X(x0), FLOOR - 118, { px: 11, weight: 700, color: P.bad, haloColor: P.bg });
    else if (run.fell != null) HeroKit.label(c, k, 'падение', X(x0), FLOOR - 118, { px: 11, weight: 700, color: P.bad, haloColor: P.bg });
    return { c, k, P };
  }
  return { W, H, M, FLOOR, draw };
})();

/* =====================================================================
   Раннер: одна копия Ады с политикой; шаг 50 Гц; копит статистику прогона.
   pol — политика движка (policy(id) или gaitPolicy), o — переопределения CFG.
   ===================================================================== */
function Runner(pol, o, seed) {
  const E = L61, R = { pol, o: Object.assign({}, E.CFG, o), E: null, t: 0, cmd: 0, vNow: 0, fell: null, lying: false, lyingSteps: 0, vSum: 0, tauSum: 0, hipSum: 0, pitchSum: 0, trail: [], vHist: [], cmdHist: [], done: false, dist: 0, parts: {} };
  for (const t of E.TERMS) R.parts[t.id] = 0;
  const a = new Float64Array(E.NA), parts = {};
  R.reset = (sd) => { R.E = E.newEnv(sd == null ? seed : sd, R.o); R.cmd = R.E.cmd; R.t = 0; R.vNow = 0; R.fell = null; R.lying = false; R.lyingSteps = 0; R.vSum = R.tauSum = R.hipSum = R.pitchSum = 0; R.trail = []; R.vHist = []; R.cmdHist = []; R.done = false; R.dist = 0; for (const k in R.parts) R.parts[k] = 0; };
  R.setCmd = (v) => { R.cmd = v; if (R.E) R.E.cmd = v; };
  R.push = (dv) => { if (R.E) R.E.S.b[3] += dv; };
  /** Один шаг: действие политики, физика, награда по весам прогона. */
  R.step = () => {
    if (!R.E || R.done) return;
    R.pol.act(R.E.S, R.cmd, R.E.S.t, a, R.E.lastA);
    const st = E.envStep(R.E, a, Object.assign({}, R.o, { parts: true }));
    E.reward(R.o.WEIGHTS, st.c, parts); for (const k in parts) R.parts[k] += parts[k];
    R.t++; R.vNow = st.c.vx; R.vSum += st.c.vx; R.tauSum += st.c.tau2; R.hipSum += st.c.hipY; R.pitchSum += Math.abs(st.c.pitch); R.dist = R.E.S.b[0];
    R.lying = st.c.hipY < 0.4; if (R.lying) R.lyingSteps++;                     // «у пола»: бедро ниже 40 см
    if (st.fell && R.fell == null) R.fell = R.t;
    const hip = E.hipY(R.E.S); R.trail.push([R.E.S.b[0], hip]); if (R.trail.length > 60) R.trail.shift();
    R.vHist.push(st.c.vx); R.cmdHist.push(R.cmd);
    if (st.done === 1) R.done = true;
  };
  R.stats = () => { const n = Math.max(1, R.t); return { t: R.t, secs: R.t * E.DT, dist: R.dist, v: R.vSum / n, tau: R.tauSum / n, hip: R.hipSum / n, pitch: R.pitchSum / n, fell: R.fell, lying: R.lyingSteps / n, cmd: R.cmd, parts: Object.assign({}, R.parts), ret: Object.values(R.parts).reduce((s, v) => s + v, 0) }; };
  R.reset(seed);
  return R;
}
/** Проиграть прогоны в реальном времени (50 шагов/с) на канвасах; резолв, когда все кончились или прошло steps шагов. fast — без ожидания кадров. */
function playRuns(runs, steps, onFrame, fast) {
  return new Promise((resolve) => {
    let acc = 0, last = null;
    const tick = (now) => {
      const dt = last == null ? 0.02 : Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
      let n = fast ? steps : Math.floor(acc * 50); if (n > 4 && !fast) n = 4; acc -= n / 50;
      for (let i = 0; i < n; i++) for (const r of runs) if (!r.done && r.t < steps) r.step();
      onFrame();
      if (runs.every((r) => r.done || r.t >= steps)) resolve(runs.map((r) => r.stats())); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const MAIN_ID = 'full512';   // политика с полной наградой (512 копий, 500 обновлений)
const PRESET_KEY = {};       // ключ набора слагаемых → id политики
(() => { for (const id of ['fwd', 'fwdFall', 'noAir', 'noSmooth']) PRESET_KEY[Object.keys(L61.PRESETS[id]).sort().join(',')] = id; PRESET_KEY[Object.keys(L61.PRESETS.full).sort().join(',')] = MAIN_ID; })();
const presetOf = (on) => PRESET_KEY[Object.keys(on).filter((k) => on[k]).sort().join(',')] || null;
const sec = (s) => fmt(s, 1) + ' с';

/* =====================================================================
   1. Лаборатория: конструктор награды — слагаемые с весами, две Ады рядом:
   с набором, который собрал читатель, и с полной наградой
   ===================================================================== */
const Reward = (() => {
  const E = L61, STEPS = 300, SEED = 31, CMD = 0.6;
  const st = { on: { fwd: true }, unlocked: { fwd: true }, left: null, right: null, busy: false, fast: false, last: null, cmd: CMD };
  let ctl = null;
  const RIGHT_ID = MAIN_ID;
  function runnerFor(id, cmd) { const d = E.DATA.policies[id], pol = E.policy(id); return pol ? Runner(pol, { WEIGHTS: E.PRESETS[d.preset], TERMINATE: d.terminate, cmdFixed: cmd }, SEED) : null; }
  const setName = (id) => ({ fwd: 'только вперёд', fwdFall: 'вперёд и падение', noSmooth: 'по команде, осанка и шаги', noAir: 'всё, кроме шагов стопы', full512: 'полная награда' }[id] || id);
  function renderChips() {
    const box = $('#rChips'); box.innerHTML = '';
    for (const t of E.TERMS) {
      const b = h('button', { type: 'button', class: 'chip' + (st.on[t.id] ? ' on' : '') + (st.unlocked[t.id] ? '' : ' locked'), 'data-id': t.id, 'aria-pressed': String(!!st.on[t.id]) }, h('b', null, (t.w > 0 ? '+' : '−') + ' ' + t.t), h('span', null, fmt(Math.abs(t.w), t.w === 1 || Math.abs(t.w) === 2 ? 0 : 7).replace(/0+$/, '').replace(/[,.]$/, '')));
      if (!st.unlocked[t.id]) b.disabled = true;
      b.addEventListener('click', () => { if (st.busy) return; st.on[t.id] = !st.on[t.id]; render(); if (ctl) ctl.update(); });
      box.append(b);
    }
    const id = presetOf(st.on);
    setOut($('#rSet'), id ? `Набор: <b>${setName(id)}</b>${E.DATA.policies[id].terminate ? ', падение заканчивает эпизод' : ', эпизод идёт до конца даже после падения'}; политика PPO посчитана заранее в Node.` : 'Для такого набора политика не посчитана: собери набор, который просит миссия (в свободном режиме — любой из пяти).');
  }
  function drawPanes() {
    const P = pal();
    Pane.draw($('#rCvL'), st.left, { title: st.left ? `награда: ${setName(st.left.id)}` : 'набор, который ты собрал', titleShort: st.left ? setName(st.left.id) : 'твой набор', color: P.e2e, empty: st.busy ? 'Ада идёт…' : 'нажми кнопку миссии', emptyShort: 'нажми кнопку миссии' });
    Pane.draw($('#rCvR'), st.right, { title: 'полная награда для сравнения', titleShort: 'полная награда', color: P.cl, empty: 'Ада выйдет при запуске', emptyShort: 'выйдет при запуске' });
  }
  function statLine(R) { if (!R) return 'ещё не запускалась'; const s = R.stats(); return `${fmt(s.v, 2)} м/с, ${fmt(s.dist, 1)} м за ${sec(s.secs)}${s.fell != null ? `, падение на ${sec(s.fell * E.DT)}` : ''}${s.lying > 0.3 ? `, корпус на полу ${fmt(s.lying * 100, 0)}% времени` : ''}; бедро ${fmt(s.hip * 100, 0)} см, наклон ${fmt(s.pitch, 2)} рад, Σ τ² ${fmt(s.tau, 0)}`; }
  function render() {
    renderChips(); drawPanes();
    setOut($('#rOut'), st.busy ? 'Обе Ады идут 6 секунд…' : `${st.left ? `Награда «${setName(st.left.id)}»` : 'Твой набор'}: ${statLine(st.left)}. Полная награда: ${statLine(st.right)}.`);
    const wrap = $('#wrapRCmd'); if (!wrap.hidden) { const sl = $('#rCmd'); sl.value = st.cmd; syncRange(sl, `${fmt(st.cmd, 1)} м/с`); }
  }
  /** Запустить обе Ады: с текущим набором и с полной наградой. */
  async function go() {
    const id = presetOf(st.on); if (!id || !E.DATA.policies[id]) return { noPolicy: true, id: null };
    st.left = runnerFor(id, st.cmd); st.left.id = id; st.right = runnerFor(RIGHT_ID, st.cmd); st.right.id = RIGHT_ID;
    st.busy = true; render();
    const [L, R] = await playRuns([st.left, st.right], STEPS, drawPanes, st.fast);
    st.busy = false; st.last = { id, L, R }; render(); if (ctl) ctl.update();
    return { id, L, R };
  }
  function state() { return { set: presetOf(st.on), on: Object.assign({}, st.on), busy: st.busy, last: st.last }; }
  const api = {
    reset() { st.on = { fwd: true }; st.unlocked = { fwd: true }; st.left = st.right = null; st.last = null; st.cmd = CMD; render(); },
    state, render, st, go,
    unlock(ids, on) { for (const id of ids) st.unlocked[id] = true; if (on) for (const id of E.TERMS.map((t) => t.id)) st.on[id] = on.includes(id); render(); },
  };
  const needSet = (id) => ({ label: `Собран набор «${setName(id)}»`, test: (r, s) => (s ? s.set : presetOf(st.on)) === id });
  const noPol = (r) => (r.noPolicy ? 'Для такого набора слагаемых политика не посчитана. Собери набор, который просит миссия: нужные слагаемые уже открыты.' : '');
  const cm = (v) => fmt(v * 100, 0);
  const missions = [
    { short: 'Вперёд', title: 'Награда — только скорость вперёд', text: 'В награде одно слагаемое: скорость корпуса вперёд, +1 за каждый метр в секунду на каждом шаге. Падение ничем не наказано, и эпизод идёт до конца, даже если Ада лежит. Политику с такой наградой PPO учил на 256 копиях Ады 300 обновлений. Рядом для сравнения пойдёт Ада с полной наградой, и обеим задана команда 0,6 м/с.',
      bet: { q: 'что сделает Ада, если награда — только скорость вперёд?', options: ['Научится быстро идти: скорость и есть цель задачи', 'Ляжет и будет отталкиваться ногами от пола: так тоже движешься вперёд, а держать равновесие не нужно', 'Будет стоять на месте: любой шаг рискует падением'], answer: (r) => (r.L.lying > 0.5 && r.L.v > 0.8 ? 1 : r.L.v > 0.3 ? 0 : 2) },
      action: { label: 'Запустить обеих Ад', run: () => go() },
      criteria: [needSet('fwd'), { label: 'Ада с наградой «только вперёд» большую часть прогона лежит корпусом на полу', test: (r) => r.L && r.L.lying > 0.5 }, { label: 'И движется при этом быстрее 1 м/с в среднем', test: (r) => r.L && r.L.v > 1 }],
      fail: noPol,
      explain: (r) => `Ада с наградой «только вперёд» падает на ${sec(r.L.fell * E.DT)} и дальше ${fmt(r.L.lying * 100, 0)}% времени лежит корпусом на полу, отталкиваясь ногами. Она движется со скоростью ${fmt(r.L.v, 2)} м/с в среднем и проходит ${fmt(r.L.dist, 1)} м за ${sec(r.L.secs)}, быстрее Ады с полной наградой: та идёт ${fmt(r.R.v, 2)} м/с и проходит ${fmt(r.R.dist, 1)} м. Награда получена, а задача не решена, потому что в награде не сказано, что корпус должен быть над полом. Похожее видели Smith и соавторы: их A1 «нырял» вперёд и падал на голову, пока скорость считали в системе координат робота.` },
    { short: 'Падение', title: 'Добавь штраф за падение', text: 'Открылось слагаемое «падение»: −1 за касание пола корпусом, и на этом эпизод заканчивается, как у Rudin и соавторов, где касание пола корпусом считается аварией и сбросом. Включи его и запусти снова.',
      bet: { q: 'что получится, если наказано только падение?', options: ['Ада пойдёт, как Ада с полной наградой: без падений остаётся только ходьба', 'Ада разгонится быстрее Ады с полной наградой и всё равно упадёт: −1 за падение мало рядом с наградой за секунду быстрого бега', 'Ада встанет и не сдвинется: падение дороже любой скорости'], answer: (r) => (r.L.fell != null && r.L.v > r.R.v ? 1 : r.L.v < 0.2 ? 2 : 0) },
      action: { label: 'Запустить обеих Ад', run: () => go() },
      criteria: [needSet('fwdFall'), { label: 'Ада с наградой «вперёд и падение» быстрее Ады с полной наградой в среднем по прогону', test: (r) => r.L && r.L.v > r.R.v }, { label: 'И падает в первые 2 секунды', test: (r) => r.L && r.L.fell != null && r.L.fell * E.DT < 2 }],
      onEnter: (X) => X.unlock(['fall']), fail: noPol,
      explain: (r) => `Ада с наградой «вперёд и падение» разгоняется до ${fmt(r.L.v, 2)} м/с в среднем и падает на ${sec(r.L.fell * E.DT)}: за эти шаги она набирает больше награды, чем теряет на падении, а держать равновесие и идти ровно награда не требует. Ада с полной наградой идёт ${fmt(r.R.v, 2)} м/с и не падает. Бедро у первой в среднем на высоте ${cm(r.L.hip)} см против ${cm(r.R.hip)}, а корпус наклонён на ${fmt(r.L.pitch, 2)} рад против ${fmt(r.R.pitch, 2)}. Штраф за падение закрывает лазейку «лечь и ползти», но открывает другую: разогнаться и упасть. Поэтому у Rudin и соавторов скорость награждается по ограниченному ядру exp(−ошибка²/0,25): идти быстрее команды не выгоднее, чем точно по ней, а каждый шаг без падения приносит награду.` },
    { short: 'Осанка', title: 'Скорость по команде, осанка и шаги', text: 'Теперь вместо «вперёд» нужно слагаемое «скорость по команде» с ядром exp(−ошибка²/0,25), как у Rudin и соавторов, а к нему штрафы за высоту корпуса, наклон и подскоки и награда за время стопы в воздухе. Выключи «вперёд», включи эти пять слагаемых и запусти.',
      bet: { q: 'чем Ада с этим набором будет отличаться от Ады с полной наградой, у которой есть ещё энергия и плавность?', options: ['Ничем заметным: осанка и команда уже всё задают', 'Пойдёт с той же скоростью, но с заметно бо́льшими моментами в суставах: резкие движения ей ничего не стоят', 'Упадёт: без штрафа за энергию политика не выучится'], answer: (r) => (r.L.fell != null ? 2 : r.L.tau > r.R.tau * 2 ? 1 : 0) },
      action: { label: 'Запустить обеих Ад', run: () => go() },
      criteria: [needSet('noSmooth'), { label: 'Ада с этим набором идёт по команде: ошибка скорости меньше 0,15 м/с', test: (r) => r.L && r.L.fell == null && Math.abs(r.L.v - r.L.cmd) < 0.15 }, { label: 'И тратит моментов хотя бы вдвое больше Ады с полной наградой', test: (r) => r.L && r.L.tau > r.R.tau * 2 }],
      onEnter: (X) => X.unlock(['track', 'height', 'orient', 'zvel', 'air']), fail: noPol,
      explain: (r) => `Обе Ады идут по команде: с этим набором ${fmt(r.L.v, 2)} м/с, с полной наградой ${fmt(r.R.v, 2)}, бедро на высоте ${cm(r.L.hip)} и ${cm(r.R.hip)} см. Разница в цене: сумма квадратов моментов за шаг у Ады с этим набором ${fmt(r.L.tau, 0)}, у Ады с полной наградой ${fmt(r.R.tau, 0)}, в ${fmt(r.L.tau / r.R.tau, 1)} раза меньше. Rudin и соавторы штрафуют моменты, ускорения суставов и смену целевых углов ради более плавного и естественного движения, а на настоящем роботе ещё и ради приводов.` },
    { short: 'Энергия', title: 'Энергия и плавность', text: 'Последняя группа: моменты (−0,00002 на единицу Σ τ²), смена целевых углов суставов и ускорения суставов. Включи их, и получится полная награда из девяти слагаемых, та же, что у Ады для сравнения.',
      action: { label: 'Запустить обеих Ад', run: () => go() },
      criteria: [needSet('full512'), { label: 'Обе Ады идут одинаково: разница скоростей меньше 0,02 м/с', test: (r) => r.L && r.L.fell == null && Math.abs(r.L.v - r.R.v) < 0.02 }],
      onEnter: (X) => X.unlock(['torque', 'rate', 'accel']), fail: noPol,
      explain: (r) => `Теперь у обеих Ад одна и та же политика: ${fmt(r.L.v, 2)} м/с, бедро на высоте ${cm(r.L.hip)} см, Σ τ² ${fmt(r.L.tau, 0)}. Девять слагаемых понадобились, чтобы «идти по команде» значило то же, что для человека: не падать, не приседать, не дёргаться и переставлять ноги. Ни одно из них не описывает походку, она получилась сама.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Собирай любой из пяти посчитанных наборов (есть ещё «всё, кроме шагов стопы»), меняй команду скорости и толкай Аду на ходу. Посмотри, как переставляет ноги Ада без награды за шаги стопы, и найди две команды, при которых она падает, хотя Ада с полной наградой идёт.', final: true, controls: ['cmd', 'run', 'push'],
      onEnter: (X) => X.unlock(E.TERMS.map((t) => t.id)) },
  ];
  function init() {
    $('#rCmd').addEventListener('input', (e) => { st.cmd = +e.target.value; if (st.left) st.left.setCmd(st.cmd); if (st.right) st.right.setCmd(st.cmd); render(); });
    $('#rPush').addEventListener('click', () => { for (const R of [st.left, st.right]) if (R && !R.done) R.push(0.8); });
    $('#rRun').addEventListener('click', () => { if (!st.busy) go(); });
    ctl = mountMissions('#rMis', missions, api, { controls: { cmd: '#wrapRCmd', run: '#rRun', push: '#rPush' }, scene: '#rDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, go, missions, SEED };
})();

/* =====================================================================
   2. Лаборатория: команда скорости — политика на случайных командах против
   политики на одной команде; ползунок; график слежения
   ===================================================================== */
const Command = (() => {
  const E = L61, K = HeroKit, STEPS = 300, SEED = 88, LEFT = MAIN_ID, RIGHT = 'fixed';
  const st = { cmd: 0.3, left: null, right: null, busy: false, fast: false, last: null, sched: null };
  let ctl = null;
  function runnerFor(id, cmd) { const pol = E.policy(id); return pol ? Runner(pol, { WEIGHTS: E.PRESETS.full, TERMINATE: true, cmdFixed: cmd }, SEED) : null; }
  function drawPanes() {
    const P = pal();
    Pane.draw($('#cmCvL'), st.left, { title: 'училась на командах 0,2–1,0 м/с', titleShort: 'команды 0,2–1,0 м/с', color: P.e2e, empty: st.busy ? 'Ада идёт…' : 'выбери команду и нажми кнопку миссии', emptyShort: 'нажми кнопку миссии' });
    Pane.draw($('#cmCvR'), st.right, { title: 'училась на одной команде 0,6 м/с', titleShort: 'одна команда 0,6 м/с', color: P.cl, empty: 'выйдет при запуске', emptyShort: 'выйдет при запуске' });
    drawChart();
  }
  function drawChart() {
    const cv = $('#cmChart'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 220 : 200;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), L = narrow ? 36 : 44, R = 12, T = narrow ? 44 : 30, B = narrow ? 38 : 34, gw = W - L - R, gh = H - T - B;   // деления оси выше подписи «секунды прогона»
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (t) => L + gw * t / (STEPS * E.DT), Y = (v) => T + gh * (1 - (v + 0.2) / 1.6);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 0.4, 0.8, 1.2]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); K.label(c, k, fmt(v, 1), L - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    for (let t = 0; t <= 6; t += 1) K.label(c, k, `${t}`, X(t), H - B + 12, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'секунды' : 'секунды прогона', L + gw / 2, H - 8, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'скорость, м/с' : 'скорость корпуса вперёд, м/с', L, 10, { px: 10, color: P.ink3, align: 'left', halo: false });
    // легенда: в узкой раскладке — вторая строка над графиком
    let lx = narrow ? L : L + 200 / Math.max(1, k); const ly = narrow ? 27 : 10;
    for (const [name, col, dash] of [['команда', P.ink2, true], [narrow ? 'случайные' : 'случайные команды', P.e2e], [narrow ? 'одна' : 'одна команда', P.cl]]) {
      if (dash) { c.setLineDash([4, 4]); c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 14, ly); c.stroke(); c.setLineDash([]); } else { c.fillStyle = col; c.fillRect(lx, ly - 2, 14, 4); }
      K.label(c, k, name, lx + 18, ly, { px: 10, color: P.ink2, align: 'left', halo: false }); K.font(c, k, 10, 600); lx += 18 + c.measureText(name).width + 10 * k;
    }
    if (!st.left) { K.label(c, k, narrow ? 'график заполнится при запуске' : 'график скоростей заполнится, когда запустишь обеих Ад', L + gw / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    // команда — пунктир по истории первой Ады
    c.setLineDash([4, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.beginPath(); st.left.cmdHist.forEach((v, i) => (i ? c.lineTo(X(i * E.DT), Y(v)) : c.moveTo(X(0), Y(v)))); c.stroke(); c.setLineDash([]);
    for (const [R0, col] of [[st.left, P.e2e], [st.right, P.cl]]) { if (!R0) continue; c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath(); R0.vHist.forEach((v, i) => { const y = Y(Math.max(-0.2, Math.min(1.4, v))); if (i) c.lineTo(X(i * E.DT), y); else c.moveTo(X(0), y); }); c.stroke(); if (R0.fell != null) K.cross(c, X(R0.fell * E.DT), Y(Math.max(-0.2, R0.vHist[R0.fell - 1] || 0)), 5, P.bad, 2); }
  }
  const statOf = (R0) => { if (!R0) return 'ещё не запускалась'; const s = R0.stats(), sw = st.sched && st.sched.length && !st.busy ? st.sched[0] : null; return (sw ? `${fmt(s.v, 2)} м/с в среднем, после скачка на ${fmt(sw[1], 1)} — ${fmt(tail(R0, sw[0] + 1), 2)} м/с` : `${fmt(s.v, 2)} м/с при команде ${fmt(s.cmd, 1)}`) + (s.fell != null ? `, падение на ${sec(s.fell * E.DT)}` : ''); };
  function render() {
    drawPanes(); const sl = $('#cmCmd'); sl.value = st.cmd; syncRange(sl, `${fmt(st.cmd, 1)} м/с`);
    setOut($('#cmOut'), st.busy ? 'Обе Ады идут 6 секунд…' : `Случайные команды: ${statOf(st.left)}. Одна команда 0,6 м/с: ${statOf(st.right)}.`);
  }
  /** Прогон при команде cmd; sched — [[секунда, команда], …] для смены на ходу. */
  async function go(cmd, sched) {
    st.cmd = cmd; st.sched = sched || null;
    st.left = runnerFor(LEFT, cmd); st.right = runnerFor(RIGHT, cmd); if (!st.left || !st.right) return { noPolicy: true };
    st.busy = true; render();
    const stepHook = () => { if (st.sched) for (const [s, v] of st.sched) for (const R0 of [st.left, st.right]) if (R0.t === Math.round(s / E.DT) && R0.cmd !== v) { R0.setCmd(v); st.cmd = v; } };
    const runs = [st.left, st.right]; const origStep = runs.map((R0) => R0.step);
    runs.forEach((R0, i) => { R0.step = () => { stepHook(); origStep[i](); }; });
    const [L, R] = await playRuns(runs, STEPS, drawPanes, st.fast);
    st.busy = false; st.last = { L, R };
    // время выхода на новую команду после смены: ошибка меньше 0,12 м/с и дальше держится 0,5 с
    let settle = null; if (sched && sched.length) { const [s0, v] = sched[0], i0 = Math.round(s0 / E.DT), hist = st.left.vHist; for (let i = i0; i < hist.length - 25; i++) { let ok = true; for (let j = i; j < i + 25; j++) if (Math.abs(hist[j] - v) > 0.12) { ok = false; break; } if (ok) { settle = (i - i0) * E.DT; break; } } }
    const tailR = sched && sched.length ? tail(st.right, sched[0][0] + 1) : null;   // одна команда: средняя скорость через секунду после скачка
    render(); if (ctl) ctl.update();
    return { L, R, cmd, settle, tailR, sched: sched || null };
  }
  function state() { return { cmd: st.cmd, busy: st.busy, last: st.last }; }
  const api = { reset() { st.cmd = 0.3; st.left = st.right = null; st.last = null; render(); }, state, render, st, go };
  const okTrack = (s, cmd, tol) => s.fell == null && Math.abs(s.v - cmd) < tol;
  const fellTxt = (s) => (s.fell != null ? ` и падает на ${sec(s.fell * E.DT)}` : '');
  /** Средняя скорость за последние секунды прогона (после скачка команды). */
  const tail = (R0, from) => { const h = R0 ? R0.vHist.slice(Math.round(from / E.DT)) : []; return h.length ? h.reduce((s, v) => s + v, 0) / h.length : NaN; };
  const missions = [
    { short: 'Быстро', title: 'Команда 0,9 м/с', text: 'Ада со случайными командами училась так, что каждая копия получала свою случайную команду от 0,2 до 1,0 м/с на весь эпизод. У Ады с одной командой та же сеть и та же награда, но на обучении команда у неё всегда была 0,6 м/с. Сначала попросим обеих идти быстрее: 0,9 м/с.',
      bet: { q: 'что сделает Ада с одной командой при команде 0,9?', options: ['Пойдёт 0,9: команда есть у неё во входе', 'Не дойдёт до 0,9 и пойдёт заметно медленнее: быстрее 0,6 м/с она на обучении не ходила', 'Сразу упадёт: незнакомый вход ломает политику'], answer: (r) => (r.R.fell != null && r.R.fell * E.DT < 2 ? 2 : r.R.v < 0.8 ? 1 : 0) },
      action: { label: 'Запустить при 0,9 м/с', run: () => go(0.9) },
      criteria: [{ label: 'Ада со случайными командами держит 0,9 м/с с ошибкой меньше 0,1', test: (r) => okTrack(r.L, 0.9, 0.1) }, { label: 'Ада с одной командой идёт медленнее 0,8 м/с или падает', test: (r) => r.R.fell != null || r.R.v < 0.8 }],
      explain: (r) => `Ада со случайными командами идёт ${fmt(r.L.v, 2)} м/с, а Ада с одной командой — ${fmt(r.R.v, 2)} м/с${fellTxt(r.R)}. Число 0,9 во входе вторая видит впервые: на обучении там всегда стояло 0,6, и связывать это число со скоростью её никто не учил. Диапазон команд на обучении становится диапазоном, в котором политика работает. Radosavovic и соавторы выбирают новую команду каждые 10 секунд и отмечают, что их политика справляется и с плавно меняющимися командами с джойстика, хотя таких на обучении не было.` },
    { short: 'Медленно', title: 'Команда 0,3 м/с', text: 'Теперь команда ниже той, на которой училась Ада с одной командой.',
      bet: { q: 'что сделает Ада с одной командой при команде 0,3?', options: ['Пойдёт около 0,6, как привыкла: других чисел во входе она не видела', 'Замедлится примерно до 0,3: постоянное число во входе работало у неё как смещение нейронов, и меньшее число её притормаживает', 'Упадёт: незнакомый вход ломает политику'], answer: (r) => (r.R.fell != null ? 2 : Math.abs(r.R.v - 0.3) < 0.1 ? 1 : 0) },
      action: { label: 'Запустить при 0,3 м/с', run: () => go(0.3) },
      criteria: [{ label: 'Ада со случайными командами держит 0,3 м/с с ошибкой меньше 0,1', test: (r) => okTrack(r.L, 0.3, 0.1) }, { label: 'Ада с одной командой тоже идёт медленнее 0,45 м/с', test: (r) => r.R.fell == null && r.R.v < 0.45 }],
      explain: (r) => `Ада со случайными командами идёт ${fmt(r.L.v, 2)} м/с, и Ада с одной командой тоже замедлилась, до ${fmt(r.R.v, 2)} м/с. Для сети постоянное число во входе ничем не отличается от смещения нейронов, и что будет, если его изменить, на обучении не проверялось. В нашем прогоне меньшее число притормозило Аду, а большее не разогнало, как показала первая миссия. Такая связь «команда — скорость» получилась случайно и работает только в одну сторону, поэтому команды на обучении делают случайными.` },
    { short: 'На ходу', title: 'Смена команды на ходу', text: 'Первые 3 секунды команда равна 0,4 м/с, потом она прыгает на 0,8. На обучении команда менялась только между эпизодами. Сколько времени нужно Аде со случайными командами, чтобы выйти на новую скорость?',
      bet: { q: 'за сколько Ада со случайными командами выйдет на 0,8 после скачка?', options: ['Быстрее чем за секунду, за пару шагов', 'За 2–3 секунды: разгон идёт постепенно', 'Не выйдет: смены команды на ходу в обучении не было'], answer: (r) => (r.settle == null ? 2 : r.settle < 1 ? 0 : 1) },
      action: { label: 'Запустить со сменой команды', run: () => go(0.4, [[3, 0.8]]) },
      criteria: [{ label: 'Ада со случайными командами выходит на 0,8 м/с (ошибка меньше 0,12) быстрее чем за секунду', test: (r) => r.settle != null && r.settle < 1 }, { label: 'Ада с одной командой после скачка так и не доходит до 0,75 м/с', test: (r) => r.R.fell != null || r.tailR < 0.75 }],
      explain: (r) => `Ада со случайными командами вышла на новую команду за ${sec(r.settle)} и держит её, а Ада с одной командой ${r.R.fell != null ? `упала на ${sec(r.R.fell * E.DT)}` : `после скачка идёт в среднем ${fmt(r.tailR, 2)} м/с`}. Политика видит команду на каждом шаге и реагирует на неё, как на любое другое наблюдение, если на обучении эта связь была. Digit у Radosavovic и соавторов набирает с места 1 м/с меньше чем за секунду.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай ползунок прямо во время прогона и толкай обеих Ад. Найди, с какой команды Ада с одной командой перестаёт её догонять.', final: true, controls: ['live', 'push'] },
  ];
  function init() {
    $('#cmCmd').addEventListener('input', (e) => { st.cmd = +e.target.value; if (st.left) st.left.setCmd(st.cmd); if (st.right) st.right.setCmd(st.cmd); render(); });
    $('#cmPush').addEventListener('click', () => { for (const R0 of [st.left, st.right]) if (R0 && !R0.done) R0.push(0.8); });
    $('#cmRun').addEventListener('click', () => { if (!st.busy) go(st.cmd); });
    ctl = mountMissions('#cmMis', missions, api, { controls: { live: '#cmLive', push: '#cmPush', run: '#cmRun' }, scene: '#cmDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, go, missions, SEED };
})();

/* =====================================================================
   3. Лаборатория: сколько копий — живой поиск по популяции (ARS) для ритма
   шагов, бюджет эпизодов один, число копий разное
   ===================================================================== */
const Copies = (() => {
  const E = L61, K = HeroKit, BUDGET = 960, SEED = 2, CMD = 0.6, SHOW = 200;
  const st = { N: 8, budget: BUDGET, runs: [], busy: false, prog: 0, msg: '', play: null, fast: false, cur: null };
  let ctl = null;
  const cfgFor = (N, budget) => { const B = Math.max(1, Math.round(N / 2)), EVAL = 3, perIter = 2 * N * EVAL; return { WEIGHTS: E.PRESETS.fwdFall, TERMINATE: true, N, B, EVAL, EP: 200, ITERS: Math.max(1, Math.floor(budget / perIter)), SEED, NU: 0.4, ALPHA: 0.25, perIter }; };
  /** Итоговая проверка ритма: 8 эпизодов по 4 с с другими стартами и командами (та же награда). */
  const evalZ = (z) => E.evaluate(E.gaitPolicy(z), { WEIGHTS: E.PRESETS.fwdFall, TERMINATE: true }, 8, 9001, 200);
  const copiesW = (N) => `${N} ${plural(N, 'копия', 'копии', 'копий')}`;
  /** Обучить ритм с N копиями при бюджете budget эпизодов; кривая — награда по потраченным эпизодам. */
  async function train(N, budget) {
    const o = cfgFor(N, budget), curve = [], gen = E.trainARS(o);
    st.busy = true; st.prog = 0; st.msg = `${copiesW(N)}, ${o.ITERS} ${plural(o.ITERS, 'обновление', 'обновления', 'обновлений')}: обучение`; st.cur = { N, curve };
    const hist = await runChunked(gen, (hh) => { curve.push([hh.copies, hh.score]); st.prog = (hh.it + 1) / o.ITERS; render(); }, 14);
    const pol = E.gaitPolicy(hist.z), ev = evalZ(hist.z);
    curve.push([curve.length ? curve[curve.length - 1][0] : 0, ev.ret]);   // последняя точка — итоговая проверка
    const run = { N, budget, iters: o.ITERS, perIter: o.perIter, score: ev.ret, train: hist.score, curve, z: Array.from(hist.z), ev: { ret: ev.ret, v: ev.vMean, ok: ev.ok, dist: ev.runs.reduce((s, x) => s + x.dist, 0) / ev.runs.length } };
    st.runs = st.runs.filter((r) => !(r.N === N && r.budget === budget)); st.runs.push(run);
    st.busy = false; st.cur = null; st.play = Runner(pol, { WEIGHTS: E.PRESETS.fwdFall, TERMINATE: true, cmdFixed: CMD }, 555); st.play.id = `ритм после обучения: ${copiesW(N)}${budget !== BUDGET ? `, бюджет ${budget}` : ''}`; st.play.short = `${copiesW(N)}${budget !== BUDGET ? `, ${budget} эп.` : ''}`;
    render(); if (ctl) ctl.update();
    playRuns([st.play], SHOW, drawScene, st.fast);
    return run;
  }
  function drawScene() { const P = pal(); Pane.draw($('#cCv'), st.play, { title: st.play ? st.play.id : 'ритм шагов после обучения', titleShort: st.play ? st.play.short : 'ритм после обучения', color: P.e2e, empty: st.busy ? 'ритм учится…' : 'обучи ритм, и он пойдёт здесь', emptyShort: 'обучи ритм' }); }
  function drawChart() {
    const cv = $('#cChart'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 240 : 220;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), L = narrow ? 36 : 46, R = 12, T = 24, B = narrow ? 36 : 32, gw = W - L - R, gh = H - T - B;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const maxEp = Math.max(st.budget, ...st.runs.map((r) => r.budget)), maxS = 250, minS = -50;
    const X = (e) => L + gw * e / maxEp, Y = (s) => T + gh * (1 - (Math.max(minS, Math.min(maxS, s)) - minS) / (maxS - minS));
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const s of [0, 100, 200]) { c.beginPath(); c.moveTo(L, Y(s)); c.lineTo(W - R, Y(s)); c.stroke(); K.label(c, k, String(s), L - 6, Y(s), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    const stepE = maxEp >= 3000 ? 960 : narrow && maxEp > 960 ? 480 : 240;
    for (let e = 0; e <= maxEp; e += stepE) { K.font(c, k, 10, 600); const hw = c.measureText(String(e)).width / 2; K.label(c, k, String(e), Math.min(X(e), W - 1 - hw), H - B + 12, { px: 10, color: P.ink3, halo: false }); }   // последнее деление не выходит за край
    K.label(c, k, narrow ? 'эпизодов симуляции' : 'потрачено эпизодов симуляции', L + gw / 2, H - 9, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'награда ритма' : 'награда ритма за эпизод (вперёд и падение)', L, 10, { px: 10, color: P.ink3, align: 'left', halo: false });
    const all = st.runs.slice(); if (st.cur) all.push({ N: st.cur.N, curve: st.cur.curve, live: true });
    if (!all.length) { K.label(c, k, narrow ? 'кривые появятся при обучении' : 'кривые обучения появятся, когда нажмёшь кнопку миссии', L + gw / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const colOf = (N) => (N <= 2 ? P.hy : N <= 8 ? P.e2e : P.cl);
    // подписи концов кривых: справа от точки, без наложений друг на друга
    const tags = [];
    for (const r of all) {
      if (!r.curve.length) continue; const col = colOf(r.N); c.strokeStyle = col; c.lineWidth = 1.6; c.lineJoin = 'round'; c.globalAlpha = r.live ? 0.9 : 0.55; c.setLineDash(r.budget && r.budget !== st.budget ? [5, 4] : []);
      // кривая обучения шумная: награду каждого обновления считают по трём эпизодам; точка в конце — проверка на восьми новых
      const pts = r.live ? r.curve : r.curve.slice(0, -1); c.beginPath(); c.moveTo(X(0), Y(pts.length ? pts[0][1] : 0)); pts.forEach(([e, s]) => c.lineTo(X(e), Y(s))); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      const last = r.curve[r.curve.length - 1]; if (r.live) continue; c.beginPath(); c.arc(X(last[0]), Y(last[1]), 5, 0, 7); c.fillStyle = col; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1.5; c.stroke();
      tags.push({ txt: `${r.N} коп.${r.budget && r.budget !== st.budget ? `, ${r.budget} эп.` : ''}: ${fmt(last[1], 0)}`, x: X(last[0]), y: Y(last[1]) - 10, col });
    }
    tags.sort((a, b) => a.y - b.y); const lh = 13 * k;
    for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < lh && Math.abs(tags[i].x - tags[i - 1].x) < 120) tags[i].y = tags[i - 1].y + lh;
    for (const tg of tags) { K.font(c, k, 10, 700); const w = c.measureText(tg.txt).width; K.label(c, k, tg.txt, Math.max(L + 2, Math.min(tg.x + 6, W - 4 - w)), Math.max(T, Math.min(H - B - 6, tg.y)), { px: 10, weight: 700, color: tg.col, haloColor: P.surf, align: 'left' }); }
  }
  function render() {
    drawScene(); drawChart(); segSet('#cN', st.N); const sl = $('#cBudget'); sl.value = st.budget; syncRange(sl, `${st.budget} эп.`);
    const pg = $('#cProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#cOut'), `${st.msg} ${Math.round(st.prog * 100)}%.`); return; }
    const parts = st.runs.slice().sort((a, b) => a.N - b.N || a.budget - b.budget).map((r) => `${copiesW(r.N)}, ${r.iters} ${plural(r.iters, 'обновление', 'обновления', 'обновлений')} по ${r.perIter} ${plural(r.perIter, 'эпизод', 'эпизода', 'эпизодов')}${r.budget !== BUDGET ? ` (бюджет ${r.budget})` : ''}: награда на проверке ${fmt(r.score, 0)}, в среднем ${fmt(r.ev.dist, 1)} м за эпизод, без падения ${r.ev.ok} из 8`);
    setOut($('#cOut'), parts.length ? parts.join('. ') + '.' : `Бюджет равен ${st.budget} эпизодам по 4 секунды, и каждое обновление тратит по 6 эпизодов на копию.`);
  }
  const best = (runs) => runs.reduce((b, r) => (b == null || r.score > b.score ? r : b), null);
  function state() { return { N: st.N, budget: st.budget, busy: st.busy, runs: st.runs.map((r) => ({ N: r.N, budget: r.budget, score: r.score })) }; }
  const api = {
    reset() { st.N = 8; st.budget = BUDGET; st.runs = []; st.play = null; render(); },
    state, render, st, train,
    async three() { for (const N of [32, 2, 8]) await train(N, BUDGET); const r = (N) => st.runs.find((x) => x.N === N && x.budget === BUDGET); return { r2: r(2), r8: r(8), r32: r(32), best: best([r(2), r(8), r(32)]) }; },
    async more() { const r2x4 = await train(2, BUDGET * 4); const r8s = await train(8, BUDGET / 4); const r8 = st.runs.find((x) => x.N === 8 && x.budget === BUDGET), r32 = st.runs.find((x) => x.N === 32 && x.budget === BUDGET); return { r2x4, r8s, r8, r32 }; },
    async one() { return train(st.N, st.budget); },
  };
  const m = (r) => fmt(r.ev.dist, 1);
  const missions = [
    { short: 'Три', title: 'Один бюджет, три числа копий', text: 'Здесь обучение идёт прямо в браузере, но политика проще сети: ритм шагов из десяти чисел. Их подбирает поиск по популяции: на каждом обновлении каждая копия Ады получает своё случайное изменение ритма и пробует его в обе стороны, а ритм сдвигается туда, где награда выше. Награда взята из лаборатории 1, «вперёд и падение». Бюджет один, 960 эпизодов по 4 секунды, а копий 2, 8 или 32, то есть 80, 20 или 5 обновлений. Расчёт займёт несколько секунд.',
      bet: { q: 'какое число копий даст лучший ритм при одном бюджете?', options: ['2 копии: 80 обновлений, больше всего шагов обучения', '8 копий: 20 обновлений', '32 копии: 5 обновлений, зато каждое по 192 эпизодам'], answer: (r) => [2, 8, 32].indexOf(r.best.N) },
      action: { label: 'Обучить ритм с 32, 2 и 8 копиями', run: (X) => X.three() },
      criteria: [{ label: '8 копий набрали больше, чем 2 и чем 32', test: (r) => r.r8.score > r.r2.score && r.r8.score > r.r32.score }],
      explain: (r) => `Награда ритма на проверке после обучения: 2 копии — ${fmt(r.r2.score, 0)}, 8 копий — ${fmt(r.r8.score, 0)}, 32 копии — ${fmt(r.r32.score, 0)}. За эпизод в 4 секунды это в среднем ${m(r.r2)}, ${m(r.r8)} и ${m(r.r32)} м. Двум копиям не хватает выборки: каждое обновление сравнивает всего два направления по три эпизода, и шаг идёт по шуму. Тридцати двум не хватает обновлений: пяти шагов в верную сторону мало. Ритм с восемью копиями при этом не идеален: награда «вперёд и падение» ценит пройденный путь, и без падения он проходит ${r.r8.ev.ok} из 8 проверочных эпизодов. Rudin и соавторы видели похожее на ANYmal: при порции в 98 304 шага лучшими оказались 2048–4096 роботов, при слишком большом числе роботов качество резко падало, а при малом медленно снижалось.` },
    { short: 'Бюджет', title: 'Дай двум копиям вчетверо больше', text: 'Двум копиям не хватило выборки или обновлений? Дай им вчетверо больший бюджет: 3840 эпизодов, то есть 320 обновлений вместо 80. Заодно посчитаем 8 копий с бюджетом 240: это 5 обновлений, столько же, сколько было у 32 копий.',
      bet: { q: 'догонят ли 2 копии с бюджетом 3840 восемь копий с бюджетом 960?', options: ['Да: 320 обновлений хватит с запасом', 'Нет: оценка направления по двум копиям остаётся шумной, сколько ни обновляй', 'Обгонят: у них вчетверо больше шагов обучения'], answer: (r) => (r.r2x4.score >= r.r8.score * 1.1 ? 2 : r.r2x4.score >= r.r8.score * 0.9 ? 0 : 1) },
      action: { label: 'Обучить ещё два ритма', run: (X) => X.more() },
      criteria: [{ label: '2 копии с бюджетом 3840 всё ещё хуже 8 копий с бюджетом 960', test: (r) => r.r2x4.score < r.r8.score * 0.9 }, { label: 'При равных 5 обновлениях 32 копии (бюджет 960) лучше 8 копий (бюджет 240)', test: (r) => r.r32.score > r.r8s.score }],
      explain: (r) => `2 копии за 320 обновлений набрали ${fmt(r.r2x4.score, 0)} против ${fmt(r.r8.score, 0)} у 8 копий за 20: вчетверо дороже и всё равно хуже. Каждое обновление по двум направлениям идёт почти по шуму, и число обновлений этого не лечит. А при равных пяти обновлениях 32 копии дают ${fmt(r.r32.score, 0)} против ${fmt(r.r8s.score, 0)} у 8: копии делают каждое обновление точнее и стоят только времени симуляции. В Isaac Gym тысячи копий считаются на одной видеокарте одновременно, и Rudin и соавторы пишут, что время обучения почти линейно падает до 4000 роботов. В браузере копии считаются по очереди, и за них платишь секундами.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай число копий и бюджет. Найди, какой бюджет нужен 32 копиям, чтобы догнать 8 копий с бюджетом 960, и посмотри, что происходит с двумя копиями, когда бюджет растёт.', final: true, controls: ['N', 'budget', 'run'] },
  ];
  function init() {
    segBind('#cN', (v) => { if (!st.busy) { st.N = +v; render(); } });
    $('#cBudget').addEventListener('input', (e) => { st.budget = +e.target.value; render(); });
    $('#cRun').addEventListener('click', () => { if (!st.busy) api.one(); });
    ctl = mountMissions('#cMis', missions, api, { controls: { N: '#wrapCN', budget: '#wrapCBudget', run: '#cRun' }, scene: '#cCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, train, missions, SEED };
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
    { q: 'Политику ходьбы награждают только за скорость корпуса вперёд. Что она, скорее всего, выучит?', o: ['Ровную быструю походку: скорость и есть ходьба', 'Любой способ двигаться вперёд, в том числе лёжа: в награде не сказано, что корпус должен быть над полом', 'Стоять на месте: любой шаг рискует падением'], a: 1, e: 'В лаборатории 1 Ада с наградой только за скорость падает за 0,6 с, а дальше лежит и отталкивается ногами, двигаясь со скоростью 1,37 м/с, быстрее Ады с полной наградой. Награда задаёт, чего добиться, а не как; поэтому у Rudin и соавторов слагаемых девять, а у Margolis и Agrawal восемнадцать.' },
    { q: 'Зачем на обучении каждой копии дают свою случайную команду скорости?', o: ['Чтобы копии в симуляторе не мешали друг другу', 'Чтобы политика научилась связывать число во входе со скоростью: если команда всегда одна, вход ничего не сообщает, и читать его незачем', 'Чтобы обучение шло быстрее'], a: 1, e: 'В лаборатории 2 Ада с одной командой при 0,9 м/с шла 0,71 м/с, а после скачка команды до 0,8 м/с — около 0,68 м/с. Ада со случайными командами держала и 0,3, и 0,9 м/с. Hwangbo и соавторы берут команды из интервалов, а Radosavovic и соавторы выбирают новую каждые 10 секунд.' },
    { q: 'Почему политика ходьбы выдаёт целевые углы суставов, а не моменты моторов?', o: ['Так проще посчитать градиент', 'С целевыми углами и ПД-регулятором робот умеет стоять с самого начала обучения, а политике, которая выдаёт моменты, пришлось бы сначала учиться не падать', 'Моменты моторов у настоящих роботов задавать нельзя'], a: 1, e: 'Так объясняют выбор Hwangbo и соавторы, и так же устроены политики Rudin и соавторов, Margolis и Agrawal и Radosavovic и соавторов. У Digit политика выдаёт ещё и коэффициенты ПД для суставов ног, а сами ПД-регуляторы работают в 20 раз чаще политики.' },
    { q: 'Копии в симуляторе почти ничего не стоят. Почему Rudin и соавторы не берут их в десять раз больше при той же порции опыта?', o: ['Видеокарта не вмещает больше копий', 'При той же порции у каждой копии остаётся меньше шагов подряд, а GAE нужны награды нескольких шагов подряд', 'Чем больше копий, тем больше ошибок симулятора'], a: 1, e: 'Авторы видели, что качество резко падает, когда шагов подряд меньше 25, то есть меньше 0,5 с. Лучшим компромиссом для порции около 100 тысяч шагов они называют 2048–4096 роботов, а время обучения почти линейно падает до 4000 роботов.' },
    { q: 'В лаборатории 3 поиск с 32 копиями проиграл восьми копиям при одном бюджете эпизодов. Что из этого следует?', o: ['Много копий вредит обучению', 'Бюджет ушёл на точность каждого обновления, а самих обновлений осталось слишком мало: при равном числе обновлений 32 копии лучше восьми', 'Копий всегда должно быть восемь'], a: 1, e: 'При бюджете 960 эпизодов 32 копиям хватило только на 5 обновлений, и на проверке они набрали 37 против 89 у восьми копий. При равных пяти обновлениях 32 копии, наоборот, лучше восьми: 37 против 15. В Isaac Gym тысячи копий считаются на одной видеокарте одновременно, поэтому там копии почти ничего не стоят.' },
    { q: 'Робота Digit толкнули, и политика тут же поменяла шаги. Что изменилось в ней?', o: ['Веса сети: она дообучается прямо на ходу', 'История во входе: последние пары «наблюдение, действие» стали необычными, и сеть с прежними весами выдаёт другие действия', 'Ничего: политика не замечает толчков, их гасят ПД-регуляторы'], a: 1, e: 'Radosavovic и соавторы называют это адаптацией в контексте, по аналогии с языковыми моделями, которые меняют ответ по подсказке без изменения весов. В абляциях трансформер по истории обошёл MLP, TCN и LSTM, а длинный контекст оказался лучше короткого.' },
    { q: 'Политика ANYmal у Rudin и соавторов ходит рысью. Где в награде задана рысь?', o: ['В слагаемом за время стопы в воздухе', 'Нигде: ни награда, ни пространство действий не зависят от походки, и рысь возникает сама', 'В учебном плане по рельефу'], a: 1, e: 'Время стопы в воздухе поощряет только длинные шаги. Артефакты вроде волочащейся ноги авторы убирали подстройкой весов, а для двуногого Cassie добавили награду за стояние на одной ноге. Margolis и Agrawal, наоборот, подают параметры походки во вход, и одна политика ходит разными походками.' },
    { q: 'Почему слагаемое за следование команде у Rudin и соавторов ограничено, exp(−ошибка²/0,25), а не равно минус квадрату ошибки?', o: ['Так быстрее считать', 'Если штраф растёт с ошибкой без предела, то при большой ошибке выгоднее упасть и закончить эпизод, чем догонять команду', 'Ограниченная награда нужна, чтобы работал GAE'], a: 1, e: 'Об этом прямо пишут Hwangbo и соавторы: с евклидовой нормой ошибки падение становится выгодной стратегией. Ограниченная награда за каждый шаг, наоборот, делает выгодным каждый шаг без падения.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('reward', () => { mis.reward = Reward.init(); });
    safe('command', () => { mis.command = Command.init(); });
    safe('copies', () => { mis.copies = Copies.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['rMis', 'cmMis', 'cMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l61 = { mis, Reward, Command, Copies, AdaBody, Pane, L61 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
