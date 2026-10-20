/* =====================================================================
   ui-l56.js — урок 5.6 «Offline RL». Схемы и лаборатории:
   0) анимированные схемы (shared/anim.js): откуда берётся опыт у PPO, SAC
      и offline RL; как максимум по Q находит завышенную оценку вне данных
      и как её гасят BCQ, CQL и IQL;
   1) лаборатория «Четыре политики»: логи трёх операторов, обучение BC,
      наивного Q-обучения, CQL и IQL на одних логах, сводка и обещания Q;
   2) лаборатория «Щуп»: Q по 18 действиям в точке маршрута, решения из
      логов рядом, что выходит на деле, вес штрафа CQL и BCQ;
   3) лаборатория «Какие логи»: BC и IQL на логах одного оператора;
   4) квиз.
   Движок — l56/engine.js (без DOM) поверх shared/drive-core.js.
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
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const fmtS = (v, d) => (v > 0 ? '+' : '') + fmt(v, d == null ? 2 : d);
/** Вес штрафа: 0,03, 0,1, 1, 10 — без лишних нулей. */
const fmtA = (a) => (+a).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;

/* Имена и цвета: операторы — серым (записи), методы — своими цветами */
const NAMES = { careful: 'Аккуратный оператор', hurried: 'Торопливый оператор', random: 'Случайный оператор', bc: 'BC', naive: 'Наивное Q-обучение', cql: 'CQL', iql: 'IQL', bcq: 'BCQ' };
const SHORT = { careful: 'аккуратный', hurried: 'торопливый', random: 'случайный', bc: 'BC', naive: 'наивное', cql: 'CQL', iql: 'IQL', bcq: 'BCQ' };
const colorOf = (k, P) => ({ bc: P.cl, naive: P.hy, cql: P.warn, iql: P.e2e, bcq: P.ink2 }[k] || P.ink3);
const isOp = (k) => k === 'careful' || k === 'hurried' || k === 'random';
/** Действие словами: «руль до упора влево, медленно». */
function actWords(a) {
  const st = L56.steerOf(a), v = L56.speedOf(a) > 50 ? 'быстро' : 'медленно';
  const s = st <= -0.99 ? 'руль до упора влево' : st >= 0.99 ? 'руль до упора вправо' : Math.abs(st) < 0.01 ? 'прямо' : `руль на ${fmt(Math.abs(st) * 100, 0)}% ${st < 0 ? 'влево' : 'вправо'}`;
  return `${s}, ${v}`;
}

/* =====================================================================
   Квартира Ады: план сверху (как DriveDraw в shared/drive-lab.js и Plan в 5.2)
   ===================================================================== */
const Plan = (() => {
  const D = Drive, K = HeroKit;
  function house(c, k, P, o) {
    o = o || {};
    c.fillStyle = P.bg; c.fillRect(0, 0, D.W, D.H); K.grid(c, D.W, D.H, 50, P.grid);
    const lab = k < 1.6 && o.labels !== false, small = k < 2.6 && o.labels !== false;
    if (small) for (const [t, x, y] of [['прихожая', 128, 22], ['гостиная', 300, 22], ['кухня', 470, 230]]) K.label(c, k, t, x, y, { color: P.ink3, px: lab ? 11 : 10, weight: 600, haloColor: P.bg });
    for (const f of D.FURN) {
      const [x0, y0, x1, y1] = f.r; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 7, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (lab) K.label(c, k, f.name, (x0 + x1) / 2, (y0 + y1) / 2, { color: P.ink2, px: 11, haloColor: P.surf });
    }
    c.fillStyle = P.ink2; for (const r of D.WALLS) c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    c.setLineDash([4, 5]); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.arc(D.GOAL.x, D.GOAL.y, D.GOAL.r, 0, 7); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(D.GOAL.x, D.GOAL.y, 4, 0, 7); c.fillStyle = P.ink2; c.fill();
  }
  function ada(c, s, color, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(s.x, s.y); c.rotate(s.th);
    c.beginPath(); c.arc(0, 0, D.R, 0, 7); c.fillStyle = K.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = color || K.css('--ink'); c.stroke();
    c.beginPath(); c.roundRect(4, -9, 10, 18, 4); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(9, -4, 1.8, 0, 7); c.arc(9, 4, 1.8, 0, 7); c.fill();
    c.restore();
  }
  function mark(c, x, y, outcome, P, r) {
    r = r || 7;
    if (outcome === 'crash') K.cross(c, x, y, r, P.bad, 2.6);
    else if (outcome === 'goal') K.check(c, x, y - 1, r, P.good, 2.6);
    else { c.beginPath(); c.arc(x, y, r * 0.6, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 2; c.stroke(); }
  }
  /** Поездки: тонкая линия — медленно, толстая — быстро; в конце — исход. */
  function trips(c, eps, color, P, o) {
    o = o || {}; const wSlow = o.thin || 1.4, wFast = o.thick || 3.6, NS = L56.CFG.NS;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color;
    for (const e of eps) {
      c.globalAlpha = o.alpha || 0.7;
      for (let i = 0; i < e.acts.length && i + 1 < e.traj.length; i++) {
        const a = e.traj[i], b = e.traj[i + 1]; c.lineWidth = e.acts[i] >= NS ? wFast : wSlow;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
    c.globalAlpha = 1;
    if (o.marks !== false) for (const e of eps) { const l = e.traj[e.traj.length - 1]; mark(c, l.x, l.y, e.outcome, P, o.markR || 7); }
  }
  return { house, ada, mark, trips };
})();

/* =====================================================================
   0а. Схема: откуда берётся опыт — PPO (порция и корзина), SAC (буфер
   и новые поездки), offline RL (готовые логи, новых поездок нет)
   ===================================================================== */
(() => {
  const T = 9;
  /** Маленькая Ада сверху: круг с глазами. */
  function adaIco(c, A, P, x, y, r, th) {
    c.save(); c.translate(x, y); c.rotate(th || 0);
    A.circle(c, 0, 0, r, P.dark ? '#2a2926' : '#f4efe6', P.ink, 1.8);
    c.beginPath(); c.roundRect(r * 0.2, -r * 0.5, r * 0.55, r, r * 0.2); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(r * 0.5, -r * 0.22, r * 0.1, 0, 7); c.arc(r * 0.5, r * 0.22, r * 0.1, 0, 7); c.fill();
    c.restore();
  }
  function box(c, k, A, P, b, title, sub, col, hot) {
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.16 : 0.06), col, hot ? 2.2 : 1.3);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + 13, { px: 10.5, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] - 10, { px: 10, color: P.ink2, halo: false });
  }
  /** Стопка записей: n полосок в прямоугольнике. */
  function stack(c, A, P, x, y, w, h, n, col) { const dy = Math.min(5, h / 8); for (let i = 0; i < n; i++) A.rect(c, x, y + h - (i + 1) * dy, w, dy * 0.66, 1.5, A.alpha(col, 0.75), null); }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, ease, alpha } = A;
    g.rows.forEach((row, ri) => {
      const [lx, ly] = row.label;
      A.lab(c, k, row.title, lx, ly, { px: g.narrow ? 11 : 11.5, weight: 700, color: P.ink, align: g.narrow ? 'left' : 'left', halo: false });
      A.lab(c, k, row.sub, lx, ly + 15, { px: 10, color: P.ink3, align: 'left', halo: false });
      const B = row.boxes;
      if (ri === 0) {   // PPO: ездит → порция → обновление → корзина
        const act = u < 2.4 ? 0 : u < 4.4 ? 1 : u < 6.8 ? 2 : 3;
        box(c, k, A, P, B[0], 'Ада ездит', g.narrow ? 'сама' : 'текущей политикой', P.out, act === 0);
        box(c, k, A, P, B[1], 'порция', '8 поездок', P.out, act === 1);
        box(c, k, A, P, B[2], g.narrow ? 'шаг' : 'обновление', '5 эпох', P.mot, act === 2);
        box(c, k, A, P, B[3], 'корзина', g.narrow ? 'выброшена' : 'порцию выбросили', P.ink3, act === 3);
        const cx = B[0][0] + B[0][2] / 2, cy = B[0][1] + B[0][3] / 2 + 2; adaIco(c, A, P, cx + Math.sin(u * 3) * B[0][2] * 0.25, cy, 8, Math.cos(u * 3) * 0.6);
        const n = act === 0 ? Math.floor(seg(u, 0, 2.4) * 8.99) : act <= 2 ? 8 : Math.round(8 * (1 - seg(u, 6.8, 7.6)));
        stack(c, A, P, B[1][0] + 12, B[1][1] + 24, B[1][2] - 24, B[1][3] - 46, n, P.out);
        for (let i = 0; i < 3; i++) A.arrow(c, B[i][0] + B[i][2] + 2, B[i][1] + B[i][3] / 2, B[i + 1][0] - 2, B[i + 1][1] + B[i + 1][3] / 2, P.ink3, 1.6, 6);
      } else if (ri === 1) {   // SAC: ездит → буфер растёт ↔ обновление
        box(c, k, A, P, B[0], 'Ада ездит', g.narrow ? 'и пишет в буфер' : 'и пополняет буфер', P.out, true);
        box(c, k, A, P, B[1], 'буфер', g.narrow ? 'старое и новое' : 'старые и новые шаги', P.out, false);
        box(c, k, A, P, B[2], 'обновление', g.narrow ? 'пакет' : 'пакет из буфера', P.mot, (u % 1.5) < 0.75);
        const cx = B[0][0] + B[0][2] / 2, cy = B[0][1] + B[0][3] / 2 + 2; adaIco(c, A, P, cx + Math.sin(u * 3) * B[0][2] * 0.25, cy, 8, Math.cos(u * 3) * 0.6);
        stack(c, A, P, B[1][0] + 12, B[1][1] + 24, B[1][2] - 24, B[1][3] - 46, 2 + Math.floor(seg(u, 0, T - 0.6) * 6.99), P.out);
        A.arrow(c, B[0][0] + B[0][2] + 2, B[0][1] + B[0][3] / 2, B[1][0] - 2, B[1][1] + B[1][3] / 2, P.ink3, 1.6, 6);
        A.arrow(c, B[1][0] + B[1][2] + 2, B[1][1] + B[1][3] / 2 - 6, B[2][0] - 2, B[2][1] + B[2][3] / 2 - 6, P.ink3, 1.6, 6);
        A.arrow(c, B[2][0] - 2, B[2][1] + B[2][3] / 2 + 8, B[1][0] + B[1][2] + 2, B[1][1] + B[1][3] / 2 + 8, alpha(P.mot, 0.6), 1.4, 5);
      } else {   // offline: логи → обновление много раз → Ада выезжает в конце
        const fin = u > 6.6, it = Math.min(4000, Math.round(seg(u, 0.3, 6.6) * 4000));
        box(c, k, A, P, B[0], g.narrow ? 'логи' : 'логи операторов', g.narrow ? 'новых нет' : 'новых поездок нет', P.out, !fin);
        box(c, k, A, P, B[1], 'обновление', g.narrow ? `шаг ${it}` : `шаг ${it} из 4000`, P.mot, !fin);
        box(c, k, A, P, B[2], 'проверка', fin ? 'Ада выехала' : (g.narrow ? 'в конце' : 'после обучения'), fin ? P.good : P.ink3, fin);
        stack(c, A, P, B[0][0] + 12, B[0][1] + 24, B[0][2] - 34, B[0][3] - 46, 8, P.out);
        // замок: в логи ничего не добавляется
        const lx2 = B[0][0] + B[0][2] - 12, ly2 = B[0][1] + 20; A.rect(c, lx2 - 5, ly2 + 4, 10, 8, 2, P.ink3, null); c.beginPath(); c.arc(lx2, ly2 + 4, 3.5, Math.PI, 0); c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.stroke();
        A.arrow(c, B[0][0] + B[0][2] + 2, B[0][1] + B[0][3] / 2, B[1][0] - 2, B[1][1] + B[1][3] / 2, P.ink3, 1.6, 6);
        A.arrow(c, B[1][0] + B[1][2] + 2, B[1][1] + B[1][3] / 2, B[2][0] - 2, B[2][1] + B[2][3] / 2, fin ? P.good : alpha(P.ink3, 0.5), 1.6, 6);
        // пакеты по кругу между логами и обновлением
        if (!fin) for (let i = 0; i < 3; i++) { const s = ((u * 0.9 + i / 3) % 1), x = B[0][0] + B[0][2] + (B[1][0] - B[0][0] - B[0][2]) * s; A.rect(c, x - 5, B[0][1] + B[0][3] / 2 - 13, 10, 6, 2, alpha(P.out, 0.85), null); }
        if (fin) { const cx = B[2][0] + B[2][2] / 2, cy = B[2][1] + B[2][3] / 2 + 2; adaIco(c, A, P, cx - B[2][2] * 0.25 + ease(seg(u, 6.6, 8.6)) * B[2][2] * 0.5, cy, 8, 0); }
      }
    });
  }
  const wide = (() => {
    const bx = (x, y, w) => [x, y, w, 72];
    return { narrow: false, rows: [
      { title: 'PPO, урок 5.2', sub: 'on-policy', label: [14, 44], boxes: [bx(140, 22, 132), bx(300, 22, 104), bx(432, 22, 104), bx(564, 22, 132)] },
      { title: 'SAC, урок 5.3', sub: 'off-policy', label: [14, 164], boxes: [bx(140, 142, 130), bx(298, 142, 144), bx(470, 142, 120)] },
      { title: 'offline RL', sub: 'этот урок', label: [14, 284], boxes: [bx(140, 262, 150), bx(328, 262, 140), bx(506, 262, 130)] },
    ] };
  })();
  const narrowL = (() => {
    const bx = (x, y, w) => [x, y, w, 70];
    return { narrow: true, rows: [
      { title: 'PPO, урок 5.2', sub: 'on-policy', label: [10, 14], boxes: [bx(6, 40, 82), bx(94, 40, 80), bx(180, 40, 84), bx(270, 40, 84)] },
      { title: 'SAC, урок 5.3', sub: 'off-policy', label: [10, 140], boxes: [bx(6, 166, 116), bx(136, 166, 108), bx(258, 166, 96)] },
      { title: 'offline RL', sub: 'этот урок', label: [10, 266], boxes: [bx(6, 292, 112), bx(130, 292, 106), bx(248, 292, 106)] },
    ] };
  })();
  Anim.add('loops', {
    W: 720, H: 380, start: 3.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); A.lab(c, k, 'Синим — записанные поездки, оранжевым — то, что обучается', 360, 362, { px: 10.5, color: P.ink3, halo: false }); },
    narrow: { W: 360, H: 400, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrowL); A.lab(c, k, 'синим — записи, оранжевым — обучение', 180, 386, { px: 10, color: P.ink3, halo: false }); } },
  });
})();

/* =====================================================================
   0б. Схема: максимум находит завышенную оценку вне данных; три исправления.
   Числа условные (так сказано в подписи).
   ===================================================================== */
(() => {
  const T = 15, DATA = [];
  { const r = HeroKit.rng(5); for (let i = 0; i < 46; i++) { let u = 0, v = 0; while (!u) u = r(); v = r(); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); DATA.push(Math.max(-0.95, Math.min(0.95, 0.1 + 0.28 * z))); } }
  const base = (x) => 2.2 - 1.6 * (x - 0.1) * (x - 0.1);
  const bump = (x, a) => { const z = (x + 0.86) / 0.13; return a * Math.exp(-z * z); };
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, ease, alpha, lab, line, circle } = A;
    // шкала с запасом сверху: выросший пик (3,9) не доходит до подписи оси, и «максимум» над кольцом её не задевает
    const { x0, x1, y0, y1 } = g, X = (x) => x0 + (x + 1) / 2 * (x1 - x0), Y = (v) => y1 - (v + 0.6) / 5.2 * (y1 - y0);
    const it = u < 1.6 ? 0 : Math.min(4, Math.floor(seg(u, 1.6, 6.4) * 4.999));
    const amp = [1.0, 1.5, 2.0, 2.6, 3.2][it];
    const bcq = seg(u, 6.6, 7.2) * (1 - seg(u, 8.8, 9.2)), cql = ease(seg(u, 9.2, 10.4)) * (1 - seg(u, 11.6, 12)), iql = seg(u, 12, 12.6) * (1 - seg(u, T - 0.4, T));
    const q = (x) => base(x) + bump(x, amp) * (1 - cql * 0.9) - cql * 1.2 * Math.max(0, Math.abs(x - 0.1) - 0.55);
    // оси
    line(c, [[x0, y1], [x1, y1]], P.ink3, 1.2); line(c, [[x0, y0], [x0, y1]], P.ink3, 1.2);
    lab(c, k, g.narrow ? 'влево' : 'руль до упора влево', x0, y1 + 30, { px: 10, color: P.ink3, align: 'left', halo: false });
    lab(c, k, g.narrow ? 'вправо' : 'до упора вправо', x1, y1 + 30, { px: 10, color: P.ink3, align: 'right', halo: false });
    lab(c, k, 'оценка Q', x0 + 4, y0 - 8, { px: 10, color: P.ink3, align: 'left', halo: false });
    // BCQ: серым — редкие действия
    if (bcq > 0) { c.globalAlpha = bcq * 0.35; c.fillStyle = P.ink3; c.fillRect(x0, y0, X(-0.5) - x0, y1 - y0); c.fillRect(X(0.7), y0, x1 - X(0.7), y1 - y0); c.globalAlpha = 1; }
    // данные — синие точки у оси
    DATA.forEach((d, i) => circle(c, X(d), y1 - 6 - (i % 3) * 5, 2.6, alpha(P.out, 0.85), null));
    // кривая Q
    const pts = []; for (let i = 0; i <= 120; i++) { const x = -1 + 2 * i / 120; pts.push([X(x), Y(q(x))]); }
    line(c, pts, P.mot, 2.6);
    // максимум
    let best = -1, bv = -Infinity; const lo = bcq > 0.5 ? -0.5 : -1, hi = bcq > 0.5 ? 0.7 : 1;
    for (let i = 0; i <= 200; i++) { const x = -1 + 2 * i / 200; if (x < lo || x > hi) continue; const v = q(x); if (v > bv) { bv = v; best = x; } }
    if (iql < 0.5) { circle(c, X(best), Y(bv), 7, null, P.ink, 2.2); lab(c, k, 'максимум', X(best) + (best < -0.5 ? 10 : 0), Y(bv) - 16, { px: 10, weight: 700, color: P.ink, align: best < -0.5 ? 'left' : 'center', haloColor: P.surf }); }
    // IQL: экспектиль по значениям у точек данных
    if (iql > 0) {
      const vals = DATA.map((d) => base(d)).sort((a, b) => a - b), V = vals[Math.floor(vals.length * 0.8)];
      c.globalAlpha = iql; DATA.forEach((d) => circle(c, X(d), Y(base(d)), 2.4, P.out, null));
      line(c, [[x0, Y(V)], [x1, Y(V)]], P.mot, 2, [6, 4]); lab(c, k, 'V(s) — экспектиль по действиям из логов', x1 - 4, Y(V) - 11, { px: 10, weight: 650, color: P.mot, align: 'right', haloColor: P.surf }); c.globalAlpha = 1;
    }
    // подпись этапа
    const cap = u < 1.6 ? ['посередине Q держат данные,', 'по краям она достроена как получится']
      : u < 6.6 ? [`итерация ${it + 1}: целевое значение`, 'r + γ·max Q переносит пик']
        : u < 9.2 ? ['BCQ: редкие действия закрыты,', 'максимум — только среди частых']
          : u < 12 ? ['CQL: штраф опускает оценки', 'там, где данных нет']
            : ['IQL: максимума по кривой нет —', 'только экспектиль по данным'];
    const [tx, ty] = g.cap;
    lab(c, k, cap[0], tx, ty, { px: g.narrow ? 11 : 12, weight: 700, color: P.ink, align: g.capAlign || 'left', halo: false });
    lab(c, k, cap[1], tx, ty + 18, { px: g.narrow ? 11 : 12, weight: 600, color: P.ink2, align: g.capAlign || 'left', halo: false });
    if (u >= 1.6 && u < 6.6) lab(c, k, `пик растёт: ${fmt(base(-0.86) + bump(-0.86, amp), 1)}`, tx, ty + 40, { px: 10.5, color: P.mot, align: g.capAlign || 'left', halo: false });
  }
  Anim.add('maxpeak', {
    W: 720, H: 380, start: 4.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { x0: 50, x1: 470, y0: 30, y1: 320, cap: [500, 150] }); },
    narrow: { W: 360, H: 470, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, x0: 30, x1: 340, y0: 24, y1: 330, cap: [30, 392] }); } },
  });
})();

/* =====================================================================
   Общее: логи и обученные политики (каждая учится один раз, потом из памяти)
   ===================================================================== */
const Store = (() => {
  const E = L56, logs = {}, models = {}, pending = {};
  function data(set) {
    if (!logs[set]) { const trips = E.logs(E.SETS[set], E.CFG.SEED); logs[set] = { trips, T: E.transitions(trips), st: E.opStats(trips) }; }
    return logs[set];
  }
  const alphaOf = (j) => (j.kind === 'cql' ? (j.alpha == null ? E.CFG.CQL_ALPHA : j.alpha) : null);
  const keyOf = (j) => `${j.set}|${j.kind}|${alphaOf(j) == null ? '' : alphaOf(j)}`;
  const get = (set, kind, alpha) => models[keyOf({ set, kind, alpha })] || null;
  /** Обучить несколько политик вперемешку, по кусочку каждой за раз. onProg(доля от 0 до 1). */
  async function train(jobs, onProg) {
    const todo = jobs.filter((j, i) => !models[keyOf(j)] && jobs.findIndex((x) => keyOf(x) === keyOf(j)) === i);
    const mine = todo.filter((j) => !pending[keyOf(j)]), others = todo.filter((j) => pending[keyOf(j)]);
    if (mine.length) {
      const gens = mine.map((j) => { const o = { seed: E.CFG.SEED, every: 10 }; if (j.kind === 'cql') o.CQL_ALPHA = alphaOf(j); return { j, g: E.train(j.kind, data(j.set).T, o), it: 0, done: false }; });
      const total = gens.length * E.CFG.STEPS;
      function* multi() {
        for (;;) {
          let alive = false;
          for (const x of gens) {
            if (x.done) continue;
            const r = x.g.next();
            if (r.done) { x.done = true; x.it = E.CFG.STEPS; models[keyOf(x.j)] = { M: r.value, ev: E.evaluate(r.value), kind: x.j.kind, set: x.j.set, alpha: alphaOf(x.j) }; }
            else { x.it = r.value.it; alive = true; }
            yield 1;
          }
          if (!alive) return;
        }
      }
      let last = 0;   // прогресс показываем не чаще раза в 150 мс: перерисовка дороже самого обучения
      const run = runChunked(multi(), () => { const now = performance.now(); if (onProg && now - last > 150) { last = now; onProg(gens.reduce((a, x) => a + x.it, 0) / total); } }, 14);
      mine.forEach((j) => { pending[keyOf(j)] = run; });
      try { await run; } finally { mine.forEach((j) => { delete pending[keyOf(j)]; }); }
    }
    if (others.length) await Promise.all(others.map((j) => pending[keyOf(j)]));
    return jobs.map((j) => models[keyOf(j)]);
  }
  return { data, get, train, models };
})();
/** Итог поездок одной строкой: «18 из 20 · 10,9 с · +1,98». */
function tripsLine(s, n) { return `${s.ok} из ${n || s.n}${s.tGoal ? ' · ' + fmt(s.tGoal, 1) + ' с' : ''} · ${fmtS(s.ret)}`; }

/* =====================================================================
   1. Лаборатория: четыре политики на одних логах
   ===================================================================== */
const Duel = (() => {
  const E = L56, D = Drive, K = HeroKit, METHODS = ['bc', 'naive', 'cql', 'iql'];
  const st = { left: 'careful', right: 'hurried', view: 'ret', opsShown: false, busy: false, prog: 0 };
  let ctl = null;
  const mix = () => Store.data('mix');
  const res = (k) => Store.get('mix', k);
  function bestOp() { const s = mix().st; return Object.keys(s).reduce((b, k) => (s[k].ret > s[b].ret ? k : b), 'careful'); }
  function drawPane(side) {
    const key = side === 'L' ? st.left : st.right, cv = $('#dCv' + side), { c, k } = K.fit(cv, D.W, D.H), P = pal();
    Plan.house(c, k, P);
    const head = $('#dHead' + side), sub = $('#dSub' + side), stat = $('#dStat' + side);
    if (isOp(key)) {
      const s = mix().st[key], eps = mix().trips.filter((e) => e.op === key);
      Plan.trips(c, eps, P.ink3, P, { alpha: 0.45, thin: 1.2, thick: 3, markR: 6 });
      Plan.ada(c, D.START, P.ink);
      head.textContent = 'Логи'; head.className = 'c-ops'; setOut(sub, `${SHORT[key]} оператор, ${s.n} поездок`);
      setOut(stat, st.opsShown ? `<b>${s.ok} из ${s.n} доехали</b> · ${fmt(s.tGoal, 1)} с · отдача ${fmtS(s.ret)}` : `${s.ok} из ${s.n} доехали · отдача — после ставки`);
      stat.className = 'pane-stat'; return;
    }
    head.textContent = NAMES[key]; head.className = 'c-' + key; setOut(sub, key === 'cql' ? `политика, α = ${fmt(E.CFG.CQL_ALPHA, 0)}` : 'политика');
    const r = res(key);
    if (!r) {
      K.label(c, k, st.busy ? 'Ада учится…' : (k > 1.5 ? 'ещё не обучена' : 'ещё не обучена: нажми кнопку миссии'), D.W / 2, D.H / 2 + 40, { px: 12.5, weight: 700, color: P.ink, haloColor: P.bg });
      Plan.ada(c, D.START, P.ink); setOut(stat, st.busy ? 'Ада учится…' : 'Ещё не обучена'); stat.className = 'pane-stat'; return;
    }
    Plan.trips(c, r.ev.eps, colorOf(key, P), P, {});
    Plan.ada(c, D.START, P.ink);
    setOut(stat, `<b>${r.ev.ok} из 20 доехали</b>${r.ev.tGoal ? ' · ' + fmt(r.ev.tGoal, 1) + ' с' : ''} · отдача ${fmtS(r.ev.ret)}`);
    stat.className = 'pane-stat ' + (r.ev.ok >= 15 ? 'ok' : r.ev.ok <= 5 ? 'bad' : '');
  }
  function drawBoard() {
    const cv = $('#dBoard'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 330 : 300;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const promise = st.view === 'promise';
    const rows = [];
    if (promise) { for (const m of ['naive', 'cql', 'iql', 'bcq']) { const r = res(m); if (r) rows.push({ key: m, q: r.ev.Q0, g: r.ev.G0 }); } }
    else {
      if (st.opsShown) for (const o of ['careful', 'hurried', 'random']) { const s = mix().st[o]; rows.push({ key: o, v: s.ret, text: tripsLine(s) }); }
      for (const m of METHODS.concat(['bcq'])) { const r = res(m); if (r) rows.push({ key: m, v: r.ev.ret, text: tripsLine(r.ev, 20) }); }
    }
    if (!rows.length) { K.label(c, k, promise ? (narrow ? 'обучи политики в миссии 2' : 'обещания появятся, когда политики обучатся во второй миссии') : (narrow ? 'нажми кнопку миссии' : 'сводка появится после первой миссии: сделай ставку и нажми кнопку'), W / 2, H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    if (promise) rows.forEach((r) => { r.text = `обещала ${fmtS(r.q, 1)} · вышло ${fmtS(r.g)}`; });
    // поля под подписи слева и справа — по самой длинной подписи: чем уже канвас, тем шире подписи в пикселях канваса
    let L = 12, R = 12;
    if (!narrow) {
      K.font(c, k, 10.5, 650); L = Math.max(170, Math.ceil(Math.max(...rows.map((r) => c.measureText(NAMES[r.key]).width)) + 16));
      K.font(c, k, 10, 600); R = Math.max(150, Math.ceil(Math.max(...rows.map((r) => c.measureText(r.text).width)) + 14));
    }
    const T = narrow ? 30 : 26, B = 30, gw = W - L - R;
    const lo = promise ? -6 : Math.min(-2, Math.floor(Math.min(...rows.map((r) => r.v)))), hi = promise ? 14 : Math.max(3, Math.ceil(Math.max(...rows.map((r) => r.v))));
    const X = (v) => L + gw * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo), rowH = (H - T - B) / rows.length;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    const step = hi - lo > 12 ? 2 : 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { c.beginPath(); c.moveTo(X(v), T - 4); c.lineTo(X(v), H - B); c.stroke(); if (!narrow || v % (2 * step) === 0) K.label(c, k, fmt(v, 0), X(v), H - B + 12, { px: 10, color: P.ink3, halo: false }); }
    c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(X(0), T - 4); c.lineTo(X(0), H - B); c.stroke();
    const ttl = promise ? (narrow ? 'обещание Q и что вышло, с дисконтом' : 'на старте: обещание Q-функции и что вышло, отдача с дисконтом') : (narrow ? 'средняя отдача за поездку' : 'средняя отдача за поездку, без дисконта');
    K.label(c, k, ttl, 8, 10, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    rows.forEach((r, i) => {
      const y = T + rowH * i, col = colorOf(r.key, P);
      if (promise) {
        const bh = Math.min(10, rowH * 0.28), yq = narrow ? y + rowH * 0.45 : y + rowH * 0.3, yg = yq + bh + 3;
        c.globalAlpha = 0.25; c.fillStyle = col; c.fillRect(Math.min(X(0), X(r.q)), yq, Math.abs(X(r.q) - X(0)), bh); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 1.6; c.strokeRect(Math.min(X(0), X(r.q)), yq, Math.abs(X(r.q) - X(0)), bh);
        c.fillStyle = P.cl; c.fillRect(Math.min(X(0), X(r.g)), yg, Math.max(1.5, Math.abs(X(r.g) - X(0))), bh);
        if (r.q > hi) K.label(c, k, `${fmt(r.q, 1)} →`, X(hi) - 2, yq + bh / 2, { px: 10, weight: 700, color: P.ink, align: 'right', haloColor: P.surf });
        const txt = r.text;
        if (narrow) K.label(c, k, `${NAMES[r.key]}: ${txt}`, L, y + rowH * 0.2, { px: 10, weight: 650, color: P.ink2, align: 'left', haloColor: P.surf });
        else { K.label(c, k, NAMES[r.key], L - 8, yq + bh, { px: 10.5, weight: 650, color: P.ink2, align: 'right', halo: false }); K.label(c, k, txt, W - R + 6, yq + bh, { px: 10, color: P.ink2, align: 'left', halo: false }); }
      } else {
        const bh = narrow ? rowH * 0.32 : rowH * 0.56, by = narrow ? y + rowH * 0.55 : y + (rowH - bh) / 2;
        c.fillStyle = col; c.globalAlpha = isOp(r.key) ? 0.55 : 0.9; c.fillRect(Math.min(X(0), X(r.v)), by, Math.max(1.5, Math.abs(X(r.v) - X(0))), bh); c.globalAlpha = 1;
        if (narrow) K.label(c, k, `${NAMES[r.key]} · ${r.text}`, L, y + rowH * 0.25, { px: 10, weight: 650, color: P.ink2, align: 'left', haloColor: P.surf });
        else { K.label(c, k, NAMES[r.key], L - 8, by + bh / 2, { px: 10.5, weight: 650, color: isOp(r.key) ? P.ink3 : P.ink2, align: 'right', halo: false }); K.label(c, k, r.text, W - R + 6, by + bh / 2, { px: 10, color: P.ink2, align: 'left', halo: false }); }
      }
    });
    if (promise && !narrow) {   // легенда справа от заголовка, а если рядом не помещается — строкой ниже
      const lg = 'контур — обещание, синяя — вышло';
      K.font(c, k, 10.5, 600); const wt = c.measureText(ttl).width; K.font(c, k, 10, 600); const wl = c.measureText(lg).width;
      K.label(c, k, lg, W - 8, 8 + wt + 16 + wl <= W - 8 ? 10 : 10 + 13 * k, { px: 10, color: P.ink3, align: 'right', haloColor: P.surf });
    }
  }
  function render() {
    drawPane('L'); drawPane('R'); drawBoard();
    segSet('#dLeft', st.left); segSet('#dRight', st.right); segSet('#dView', st.view);
    const pg = $('#dProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    $('#dBoardNote').textContent = st.view === 'promise'
      ? 'У каждой политики с Q-функцией контур показывает, сколько отдачи с дисконтом Q-функция обещала на старте: это оценка выбранного действия, усреднённая по 20 стартам. Синяя полоса показывает, сколько вышло на деле в тех же поездках. Стрелка означает, что обещание не помещается на шкале.'
      : 'Средняя отдача за поездку равна сумме наград без дисконта. Серые полосы показывают отдачу операторов, посчитанную по их собственным записям, а цветные полосы показывают отдачу политик на 20 проверочных поездках. Подпись у полосы называет, сколько поездок доехало до кухни и сколько в среднем длились те, что доехали.';
    if (st.busy) setOut($('#dOut'), `Политики учатся в браузере: ${Math.round(st.prog * 100)}%.`);
    else {
      const t = METHODS.filter((m) => res(m));
      setOut($('#dOut'), t.length ? t.map((m) => `${NAMES[m]}: ${tripsLine(res(m).ev, 20)}`).join('; ') + '.' : (st.opsShown ? 'Логи посчитаны; политики ещё не обучены.' : 'Политики ещё не обучены.'));
    }
  }
  function progress() { const pg = $('#dProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%'; setOut($('#dOut'), `Политики учатся в браузере: ${Math.round(st.prog * 100)}%.`); }
  async function ensure(kinds) {
    if (kinds.every((m) => res(m))) { render(); return; }
    st.busy = true; st.prog = 0; render();
    try { await Store.train(kinds.map((kind) => ({ set: 'mix', kind })), (p) => { st.prog = p; progress(); }); }
    finally { st.busy = false; }
    render(); if (ctl) ctl.update();
  }
  function setSide(side, v) { if (side === 'L') st.left = v; else st.right = v; render(); if (!isOp(v) && !res(v) && !st.busy) ensure([v]); if (ctl) ctl.update(); }
  function state() {
    const r = {}; for (const m of METHODS.concat(['bcq'])) if (res(m)) r[m] = res(m).ev;
    return { left: st.left, right: st.right, view: st.view, busy: st.busy, opsShown: st.opsShown, ev: r };
  }
  const api = {
    reset() { st.left = 'careful'; st.right = 'hurried'; st.view = 'ret'; render(); },
    state, render, st,
    async logs() { st.left = 'careful'; st.right = 'hurried'; st.opsShown = true; render(); const s = mix().st; return { c: s.careful, h: s.hurried, r: s.random }; },
    async four() { st.opsShown = true; st.left = 'bc'; st.right = 'iql'; st.view = 'ret'; await ensure(METHODS); const e = (m) => res(m).ev; return { bc: e('bc'), naive: e('naive'), cql: e('cql'), iql: e('iql'), best: mix().st[bestOp()], bestKey: bestOp() }; },
    async promises() { st.left = 'naive'; st.right = 'cql'; st.view = 'promise'; await ensure(METHODS); const e = (m) => res(m).ev; return { naive: e('naive'), cql: e('cql'), iql: e('iql') }; },
  };
  const missions = [
    { short: 'Логи', title: 'Кто из операторов лучше', text: 'На панелях показаны 20 поездок аккуратного оператора и 40 поездок торопливого. Где линия тонкая, Ада едет медленно, а где толстая, едет быстро. Аккуратный доезжает всегда, но медленно; торопливый едет вдвое быстрее, но часто врезается на кухне. Награда: +1 за метр к кухне, −0,5 за секунду в пути, +2 за кухню, −5 за столкновение.',
      bet: { q: 'кто из них в среднем набирает больше награды за поездку?', options: ['Аккуратный: он доезжает всегда', 'Торопливый: он вдвое быстрее', 'Почти поровну: один тратит время, другой врезается'], answer: (r) => (Math.abs(r.c.ret - r.h.ret) < 0.15 ? 2 : r.c.ret > r.h.ret ? 0 : 1) },
      action: { label: 'Посчитать отдачу по логам', run: (X) => X.logs() },
      criteria: [{ label: 'Средняя отдача операторов посчитана', test: (r) => !!r && r.c.n === 20 }],
      explain: (r) => `Аккуратный: ${r.c.ok} поездок из ${r.c.n}, ${fmt(r.c.tGoal, 1)} с, в среднем ${fmtS(r.c.ret)} за поездку. Торопливый: ${r.h.ok} из ${r.h.n}, ${fmt(r.h.tGoal, 1)} с, ${fmtS(r.h.ret)}. Случайный доехал в ${r.r.ok} поездках из ${r.r.n} и в среднем теряет ${fmt(-r.r.ret, 2)}. Аккуратный тратит на поездку на ${fmt(r.c.tGoal - r.h.tGoal, 1)} с больше, а это −${fmt(0.5 * (r.c.tGoal - r.h.tGoal), 1)} награды; торопливый расплачивается авариями. Ни один оператор не ездит нарочно быстро в прихожей и медленно в повороте на кухню — так, чтобы и успеть, и не врезаться.` },
    { short: 'Обучение', title: 'Четыре политики на одних логах', text: 'BC копирует действия логов, наивное Q-обучение учит Q-функцию из урока 5.3 без новых поездок, CQL добавляет штраф, IQL берёт экспектиль и копирует действия с весом от преимущества. Нажми кнопку: все четыре обучатся в браузере на одних и тех же записях, с одними сетями и одним числом шагов, и проедут по 20 раз. Слева появится BC, справа — IQL.',
      bet: { q: 'кто из трёх наберёт за поездку больше всех?', options: ['BC: он копирует операторов, а их отдача известна', 'Наивное Q-обучение: оно берёт действие с наибольшей оценкой', 'IQL'], answer: (r) => { const v = [r.bc.ret, r.naive.ret, r.iql.ret]; return v.indexOf(Math.max(...v)); } },
      action: { label: 'Обучить четыре политики', run: (X) => X.four() },
      criteria: [{ label: 'IQL набирает больше лучшего оператора', test: (r) => r.iql.ret > r.best.ret }, { label: 'Наивное Q-обучение не доехало ни разу', test: (r) => r.naive.ok === 0 }],
      explain: (r) => `IQL: ${r.iql.ok} из 20, ${fmt(r.iql.tGoal, 1)} с, ${fmtS(r.iql.ret)} за поездку — больше, чем ${r.bestKey === 'careful' ? 'аккуратный' : 'торопливый'} оператор (${fmtS(r.best.ret)}). BC: ${r.bc.ok} из 20, ${fmtS(r.bc.ret)} — он копирует самые частые действия логов и все аварии у него на кухне. CQL: ${r.cql.ok} из 20 за ${fmt(r.cql.tGoal, 1)} с, ${fmtS(r.cql.ret)} — доезжает, но осторожно. Наивное Q-обучение не доехало ни разу и в среднем получило ${fmtS(r.naive.ret)}. Переключи панели в свободном режиме, чтобы увидеть поездки каждой политики.` },
    { short: 'Обещание', title: 'Что обещала Q-функция', text: 'У наивного Q-обучения, CQL и IQL есть Q-функция, и на старте она оценивает, сколько отдачи с дисконтом соберёт Ада. Слева теперь наивная политика, справа — CQL. Наивная на деле получила в среднем около −3,9 с дисконтом.',
      bet: { q: 'сколько наивная Q-функция обещала на старте?', options: ['Примерно столько же: она училась на тех же наградах', 'Чуть больше, около нуля', 'В десятки раз больше, чем вышло'], answer: (r) => (r.naive.Q0 - r.naive.G0 > 10 ? 2 : r.naive.Q0 - r.naive.G0 > 1 ? 1 : 0) },
      action: { label: 'Показать обещания', run: (X) => X.promises() },
      criteria: [{ label: 'Наивная Q-функция обещает больше 10 сверх того, что вышло', test: (r) => r.naive.Q0 - r.naive.G0 > 10 }, { label: 'У IQL обещание отличается от итога меньше чем на 1', test: (r) => Math.abs(r.iql.Q0 - r.iql.G0) < 1 }],
      explain: (r) => `Наивная Q-функция обещала ${fmt(r.naive.Q0, 1)}, а вышло ${fmtS(r.naive.G0)}: все 20 поездок кончились столкновением ещё в прихожей. CQL обещает ${fmt(r.cql.Q0, 1)} при ${fmtS(r.cql.G0)} на деле — тоже больше, чем вышло, но уже не в десятки раз. IQL обещает ${fmt(r.iql.Q0, 2)} и получает ${fmt(r.iql.G0, 2)}: его Q-функция ни разу не оценивала действия вне логов. Откуда наивная Q-функция взяла свои ${fmt(r.naive.Q0, 0)}, посмотрим в лаборатории 2.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай, что показать на каждой панели: логи любого оператора или любую из политик, включая BCQ (она обучится при первом выборе). Найди политику, которая доезжает быстрее всех, и сравни её поездки с IQL.', final: true, controls: ['sides', 'view'] },
  ];
  function init() {
    segBind('#dLeft', (v) => setSide('L', v));
    segBind('#dRight', (v) => setSide('R', v));
    segBind('#dView', (v) => { st.view = v; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#dMis', missions, api, { controls: { sides: '#wrapDSides', view: '#wrapDView' }, scene: '#dDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: щуп — Q по 18 действиям в одной точке маршрута
   ===================================================================== */
const Probe = (() => {
  const E = L56, D = Drive, K = HeroKit, ALPHAS = [0.03, 0.1, 0.3, 1, 3, 10], T0 = 10, NEED = 15;
  const st = { t: T0, method: 'naive', ai: 3, shown: false, busy: false, prog: 0 };
  let ctl = null, route = null;
  const cache = {};
  const mix = () => Store.data('mix');
  const alpha = () => ALPHAS[st.ai];
  function routeOf() { if (!route) route = mix().trips.find((e) => e.op === 'careful'); return route; }
  /** Решения логов рядом с точкой: число каждого действия и их положения (для карты), что выходит на деле. */
  function local(t) {
    if (cache[t]) return cache[t];
    const s = routeOf().traj[t], cnt = E.localCounts(mix().trips, s), pts = [];
    for (const ep of mix().trips) for (let i = 0; i < ep.T; i++) { const q = ep.traj[i], dx = q.x - s.x, dy = q.y - s.y; let d = Math.abs(q.th - s.th); if (d > Math.PI) d = 2 * Math.PI - d; if (dx * dx + dy * dy < 625 && d < 0.35) pts.push(q); }
    const tot = cnt.reduce((a, b) => a + b, 0), ref = cnt.indexOf(Math.max(...cnt)), real = E.realValues(s);
    return (cache[t] = { s, cnt, pts, tot, ref, real, x: E.observe(s) });
  }
  const modelOf = () => (st.method === 'cql' ? Store.get('mix', 'cql', alpha()) : Store.get('mix', st.method));
  /** Что видно в точке: оценки относительно самого частого действия, выбор, доля выбора в логах. */
  function view() {
    const L = local(st.t), m = modelOf();
    if (!m) return { L, ready: false };
    const q = E.qOf(m.M, L.x), a = E.act(m.M, L.x), mask = st.method === 'bcq' ? E.bcqMask(m.M, L.x) : null;
    return { L, ready: true, m, q, a, mask, rel: q.map((v) => v - q[L.ref]), real: L.real.map((v) => v - L.real[L.ref]), share: L.cnt[a] / L.tot };
  }
  function drawMap() {
    const cv = $('#rMap'), { c, k } = K.fit(cv, D.W, D.H), P = pal(), L = local(st.t), R = routeOf();
    Plan.house(c, k, P);
    c.strokeStyle = P.ink3; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); R.traj.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke(); c.setLineDash([]);
    c.fillStyle = P.cl; c.globalAlpha = 0.55; for (const q of L.pts) { c.beginPath(); c.arc(q.x, q.y, 2.2, 0, 7); c.fill(); } c.globalAlpha = 1;
    c.beginPath(); c.arc(L.s.x, L.s.y, 25, 0, 7); c.strokeStyle = P.cl; c.lineWidth = 1.6; c.stroke();
    Plan.ada(c, L.s, P.ink);
    K.label(c, k, k > 1.5 ? 'тяни Аду' : 'тяни Аду вдоль маршрута', Math.min(D.W - 70, Math.max(70, L.s.x)), L.s.y + (L.s.y > 300 ? -44 : 44), { px: 11, weight: 650, color: P.ink2, haloColor: P.bg });
  }
  function drawPlot() {
    const cv = $('#rPlot'), W = 600, v = view(), NS = E.CFG.NS;
    // Подписи держат размер в CSS-пикселях, а поле графика — в пикселях канваса. Чем уже канвас на экране (больше u),
    // тем больше места отводится подписям сверху и снизу и тем выше канвас: на телефоне строки подписей не налезают.
    const u = W / (cv.getBoundingClientRect().width || W);
    const top = Math.round(48 * u), base = top + 260, cntTop = base + Math.round(20 * u), cntH = 48;
    const yArrow = cntTop + cntH + 10 * u, ySpeed = yArrow + 14 * u, H = Math.round(ySpeed + 9.5 * u);
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    // шкала оценок и её деления; левое поле — по самой длинной подписи деления
    let lo = 0, hi = 1, tick = 1;
    const ticks = [], tickTxt = (y) => fmtS(y, tick < 0.1 ? 2 : tick < 1 ? 1 : 0);
    if (v.ready) {
      const vals = v.rel.concat(v.real); lo = Math.min(0, ...vals); hi = Math.max(0, ...vals); const pad = (hi - lo) * 0.12 + 0.05; lo -= pad; hi += pad;
      const raw = (hi - lo) / 6, mag = Math.pow(10, Math.floor(Math.log10(raw))); tick = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw);
      for (let y = Math.ceil(lo / tick) * tick; y <= hi; y += tick) if (Math.abs(y) > tick / 2) ticks.push(y);
    }
    K.font(c, k, 10, 600);
    const L0 = Math.max(48, Math.ceil(Math.max(0, ...ticks.map((y) => c.measureText(tickTxt(y)).width)) + 10)), R0 = 14, gap = 26, slot = (W - L0 - R0 - gap) / 18;
    const X = (a) => L0 + slot * (a + 0.5) + (a >= NS ? gap : 0);
    K.label(c, k, 'медленно, 40 см/с', (X(0) + X(NS - 1)) / 2, ySpeed, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    K.label(c, k, 'быстро, 80 см/с', (X(NS) + X(2 * NS - 1)) / 2, ySpeed, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    for (const g of [0, NS]) { K.label(c, k, '←', X(g), yArrow, { px: 10, color: P.ink3, halo: false }); K.label(c, k, '→', X(g + NS - 1), yArrow, { px: 10, color: P.ink3, halo: false }); K.label(c, k, 'руль', (X(g) + X(g + NS - 1)) / 2, yArrow, { px: 10, color: P.ink3, halo: false }); }
    // сколько раз записано рядом: подпись — своей строкой над столбиками, чтобы не ложиться на высокий столбик
    const L = v.L, mc = Math.max(...L.cnt);
    L.cnt.forEach((n, a) => { if (!n) return; const h = Math.max(1.5, cntH * n / mc); c.fillStyle = P.cl; c.globalAlpha = 0.75; c.fillRect(X(a) - slot * 0.32, cntTop + cntH - h, slot * 0.64, h); c.globalAlpha = 1; });
    K.label(c, k, `в логах рядом: ${L.tot}`, L0, base + 10 * u, { px: 10, color: P.cl, align: 'left', haloColor: P.surf });
    if (!v.ready) {
      c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(L0, (top + base) / 2); c.lineTo(W - R0, (top + base) / 2); c.stroke();
      K.label(c, k, st.busy ? 'Q-функция учится…' : (k > 1.3 ? 'нажми кнопку миссии' : 'нажми кнопку миссии, чтобы увидеть Q-функцию'), W / 2, (top + base) / 2 - 24, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
      return;
    }
    const Y = (x) => top + (base - top) * (hi - x) / (hi - lo);
    if (v.mask) v.mask.forEach((ok, a) => { if (ok) return; c.save(); c.beginPath(); c.rect(X(a) - slot / 2, top, slot, base - top); K.hatch(c, X(a) - slot / 2, top, X(a) + slot / 2, base, P.ink3, 6, 1); c.restore(); });
    // нулевая линия — самое частое действие
    c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.moveTo(L0, Y(0)); c.lineTo(W - R0, Y(0)); c.stroke();
    for (const y of ticks) { c.strokeStyle = P.grid; c.beginPath(); c.moveTo(L0, Y(y)); c.lineTo(W - R0, Y(y)); c.stroke(); K.label(c, k, tickTxt(y), L0 - 6, Y(y), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    K.label(c, k, '0', L0 - 6, Y(0), { px: 10, color: P.ink3, align: 'right', halo: false });
    const col = colorOf(st.method, P);
    v.rel.forEach((r, a) => { c.fillStyle = col; c.globalAlpha = a === v.a ? 1 : 0.7; c.fillRect(X(a) - slot * 0.3, Math.min(Y(0), Y(r)), slot * 0.6, Math.max(1.2, Math.abs(Y(r) - Y(0)))); c.globalAlpha = 1; });
    v.real.forEach((r, a) => { const x = X(a), y = Y(r); c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.closePath(); c.fillStyle = P.cl; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1; c.stroke(); });
    // выбор Ады — над кольцом и ромбом, самое частое — под нулевой линией; обе подписи не выходят за поле графика
    const ringY = Math.min(Y(v.rel[v.a]), Y(0)) - 9, tA = 'выбор Ады', tF = 'чаще всего';
    c.beginPath(); c.arc(X(v.a), ringY, 6.5, 0, 7); c.strokeStyle = P.ink; c.lineWidth = 2.2; c.stroke();
    const inside = (x, w) => Math.max(L0 + 2 + w / 2, Math.min(W - 2 - w / 2, x));
    K.font(c, k, 10.5, 700); const wA = c.measureText(tA).width;
    K.label(c, k, tA, inside(X(v.a), wA), Math.max(40 * u, Math.min(ringY - 6.5, Y(v.real[v.a]) - 5) - 3 - 5.25 * u), { px: 10.5, weight: 700, color: P.ink, haloColor: P.surf });
    K.font(c, k, 10, 650); const wF = c.measureText(tF).width;
    K.label(c, k, tF, inside(X(L.ref), wF), Y(0) + 4 + 5 * u, { px: 10, weight: 650, color: P.ink2, haloColor: P.surf });
    K.label(c, k, `▮ ${NAMES[st.method]}${st.method === 'cql' ? ', α = ' + fmtA(alpha()) : ''}: Q минус Q самого частого`, 8, 10 * u, { px: 10.5, weight: 650, color: col, align: 'left', haloColor: P.surf });
    K.label(c, k, '◆ на деле: сделать действие и ехать, как аккуратный', 8, 25 * u, { px: 10.5, weight: 650, color: P.cl, align: 'left', haloColor: P.surf });
  }
  function render() {
    drawMap(); drawPlot();
    segSet('#rMethod', st.method); $('#rAlpha').value = st.ai; syncRange($('#rAlpha'), fmtA(alpha()));
    const pg = $('#rProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const v = view(), L = v.L;
    if (!v.ready) { setOut($('#rOut'), st.busy ? `Q-функция учится в браузере: ${Math.round(st.prog * 100)}%.` : `Точка щупа: ${L.tot} записанных решений рядом, чаще всего — ${actWords(L.ref)} (${L.cnt[L.ref]}).`); return; }
    const ev = v.m.ev;
    setOut($('#rOut'), `Рядом ${L.tot} записанных решений, чаще всего — ${actWords(L.ref)} (${L.cnt[L.ref]}). ${NAMES[st.method]}${st.method === 'cql' ? ' при α = ' + fmtA(alpha()) : ''} выбирает <b>${actWords(v.a)}</b>: в логах рядом ${L.cnt[v.a]} из ${L.tot} (${fmt(v.share * 100, 1)}%), оценка ${fmtS(v.rel[v.a])} к самому частому, на деле ${fmtS(v.real[v.a])}. Политика целиком: <b>${ev.ok} поездок из 20</b>${ev.tGoal ? ' за ' + fmt(ev.tGoal, 1) + ' с' : ''}, отдача ${fmtS(ev.ret)}.`);
  }
  async function ensure() {
    if (modelOf()) { render(); return; }
    st.busy = true; st.prog = 0; render();
    try { await Store.train([{ set: 'mix', kind: st.method, alpha: st.method === 'cql' ? alpha() : undefined }], (p) => { st.prog = p; const pg = $('#rProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#rOut'), `Q-функция учится в браузере: ${Math.round(p * 100)}%.`); }); }
    finally { st.busy = false; }
    render(); if (ctl) ctl.update();
  }
  function setT(t) { const n = routeOf().traj.length; st.t = Math.max(0, Math.min(n - 2, t)); render(); if (ctl) ctl.update(); }
  function setMethod(m) { st.method = m; render(); ensure(); if (ctl) ctl.update(); }
  function setAlpha(i) { st.ai = i; render(); ensure(); if (ctl) ctl.update(); }
  function state() { const v = view(); return { t: st.t, method: st.method, alpha: alpha(), busy: st.busy, ready: v.ready, share: v.ready ? v.share : null, ok: v.ready ? v.m.ev.ok : null, a: v.ready ? v.a : null, fast: v.ready ? v.a >= E.CFG.NS : null }; }
  const tried = () => ALPHAS.map((a) => ({ a, r: Store.get('mix', 'cql', a) })).filter((x) => x.r);
  const api = {
    reset() { st.t = T0; st.method = 'naive'; st.ai = 3; render(); },
    state, render, st, setT, setMethod, setAlpha, ALPHAS, local, view,
    async naive() { st.t = T0; st.method = 'naive'; await ensure(); const v = view(); return { a: v.a, share: v.share, n: v.L.cnt[v.a], tot: v.L.tot, rel: v.rel[v.a], real: v.real[v.a], ev: v.m.ev, ref: v.L.ref }; },
    async bcq() { st.method = 'bcq'; await ensure(); const v = view(); return { ev: v.m.ev, a: v.a, allowed: v.mask.filter(Boolean).length, cql: Store.get('mix', 'cql', 1) && Store.get('mix', 'cql', 1).ev }; },
  };
  const missions = [
    { short: 'Пик', title: 'Что наивная Q-функция считает лучшим', text: 'Ада стоит перед проёмом из прихожей в гостиную. Чаще всего операторы здесь ехали прямо и медленно. Нажми кнопку — на графике появятся оценки наивной Q-функции из лаборатории 1 для всех 18 действий.',
      bet: { q: 'какое действие наивная Q-функция назовёт лучшим?', options: ['То, что операторы делали здесь чаще всего', 'Руль до упора влево на малой скорости — рядом таких решений единицы', 'Быстро прямо, как торопливый оператор'], answer: (r) => (r.a === r.ref ? 0 : r.share < 0.05 ? 1 : 2) },
      action: { label: 'Показать Q-функцию', run: (X) => X.naive() },
      criteria: [{ label: 'Лучшее по наивной Q-функции действие встречается рядом реже чем в 5% решений', test: (r) => r.share < 0.05 }],
      explain: (r) => `Лучшим она считает ${actWords(r.a)}: оценка на ${fmt(r.rel, 1)} выше самого частого действия. Рядом записано ${r.n} таких решений из ${r.tot} — их сделал случайный оператор, — и на деле это действие отличается от самого частого на ${fmtS(r.real)}. Оценку никто не проверял, а максимум в целевом значении раз за разом выбирал именно её. Наивная Ада делает это действие снова и снова: ${r.ev.ok} поездок из 20 до кухни. Перетащи Аду по маршруту: пик вне данных есть почти везде.` },
    { short: 'Штраф', title: 'Сколько штрафа нужно CQL', text: 'Теперь на графике CQL. Двигай ползунок α — вес штрафа: для каждого значения CQL учится заново на тех же логах, несколько секунд. Найди значение, при котором Ада доезжает хотя бы в 15 поездках из 20, а в точке щупа выбирает действие, которое рядом встречается хотя бы в 5% записанных решений.',
      controls: ['alpha'],
      onEnter: (X) => { X.setAlpha(0); X.setMethod('cql'); },
      criteria: [{ label: 'Q-функция CQL', test: (r, s) => s.method === 'cql' }, { label: 'Выбор в точке щупа — не реже 5% записанных решений рядом', test: (r, s) => s.ready && s.method === 'cql' && s.share >= 0.05 }, { label: `Ада доезжает хотя бы в ${NEED} поездках из 20`, test: (r, s) => s.ready && s.method === 'cql' && s.ok >= NEED }],
      hint: 'Малые α почти не меняют наивную Q-функцию. Пробуй значения по порядку.',
      explain: () => `${tried().map((x) => `α = ${fmtA(x.a)}: ${x.r.ev.ok} из 20`).join('; ')}. При слабом штрафе пик вне данных остаётся и Ада врезается. Когда штраф достаточно велик, оценки действий, которых в логах почти нет, опускаются ниже записанных, и CQL выбирает из того, что операторы делали на самом деле. Подними α до 10: в этой точке CQL выберет самое частое действие, как BC.` },
    { short: 'BCQ', title: 'Не рассматривать редкие действия', text: 'BCQ не меняет оценки, а запрещает действия: разрешены только те, что модель обучения по демонстрациям считает хотя бы на 30% такими же вероятными, как самое частое здесь. Запрещённые действия на графике заштрихованы. Нажми кнопку — BCQ обучится на тех же логах.',
      bet: { q: 'как поедет Ада с BCQ?', options: ['Доедет, но медленно, как BC', 'Доедет и быстро: выбирает лучшее среди частых действий', 'Врежется, как наивная Q-функция'], answer: (r) => (r.ev.ok >= NEED && r.ev.tGoal < 12 ? 1 : r.ev.ok >= NEED ? 0 : 2) },
      action: { label: 'Обучить BCQ', run: (X) => X.bcq() },
      criteria: [{ label: `BCQ доезжает хотя бы в ${NEED} поездках из 20`, test: (r) => r.ev.ok >= NEED }],
      explain: (r) => `BCQ: ${r.ev.ok} поездок из 20 за ${fmt(r.ev.tGoal, 1)} с, отдача ${fmtS(r.ev.ret)}. В точке щупа ${r.allowed === 1 ? 'разрешено одно действие из 18 — самое частое' : `разрешено ${r.allowed} ${plural(r.allowed, 'действие', 'действия', 'действий')} из 18, и среди них он берёт лучшее по своей Q-функции`}. Оценки запрещённых действий могут быть какими угодно: их не спрашивают ни при выборе действия, ни в целевом значении.${r.cql ? ` CQL при α = 1 для сравнения: ${r.cql.ok} из 20 за ${fmt(r.cql.tGoal, 1)} с.` : ''}` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Перетаскивай Аду вдоль маршрута, переключай Q-функции и вес штрафа. Найди точку, где CQL при α = 1 выбирает быструю скорость, и посмотри, что там говорит ромб «на деле».', final: true, controls: ['method', 'alpha'] },
  ];
  function init() {
    const cv = $('#rMap');
    const near = (p) => { let b = 0, bd = Infinity; routeOf().traj.forEach((q, i) => { const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
    K.drag(cv, D.W, D.H, { hit: (p) => { const s = local(st.t).s; return (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < 40 * 40 ? { ada: true } : null; }, move: (o, p) => setT(near(p)), tap: (p) => setT(near(p)), tapCursor: 'pointer' });
    segBind('#rMethod', (v) => setMethod(v));
    $('#rAlpha').addEventListener('input', (e) => setAlpha(+e.target.value));
    ctl = mountMissions('#rMis', missions, api, { controls: { method: '#wrapRMethod', alpha: '#wrapRAlpha' }, scene: '#rPlot' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: какие логи нужны — BC и IQL на записях одного оператора
   ===================================================================== */
const Sets = (() => {
  const E = L56, D = Drive, K = HeroKit, ORDER = ['careful', 'hurried', 'random', 'mix'];
  const TITLE = { careful: 'аккуратный', hurried: 'торопливый', random: 'случайный', mix: 'смесь' };
  const st = { set: 'careful', busy: false, prog: 0 };
  let ctl = null;
  const r = (set, kind) => Store.get(set, kind);
  /** Лучший оператор набора по своим записям. */
  function best(set) { const s = Store.data(set).st; const k = Object.keys(s).reduce((b, x) => (b == null || s[x].ret > s[b].ret ? x : b), null); return Object.assign({ key: k }, s[k]); }
  function drawMap() {
    const cv = $('#sMap'), { c, k } = K.fit(cv, D.W, D.H), P = pal(), dd = Store.data(st.set);
    Plan.house(c, k, P);
    Plan.trips(c, dd.trips, P.ink3, P, { alpha: dd.trips.length > 60 ? 0.3 : 0.45, thin: 1.1, thick: 2.8, markR: 5 });
    Plan.ada(c, D.START, P.ink);
    K.label(c, k, `логи: ${TITLE[st.set]} · ${dd.trips.length} поездок`, 10, 388, { px: 11.5, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
  }
  function drawChart() {
    const cv = $('#sChart'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 330 : 300;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    // подписи под столбиками: на узком графике время идёт отдельной строкой, поэтому строк до четырёх и нижнее поле растёт с k
    const step = narrow ? Math.max(15, 13 * k) : 15, first = narrow ? 19 + 10 * k : 32;
    const L = narrow ? 30 : 44, R = 10, T = 30, B = narrow ? Math.round(28 + 15 * k + 3 * step) : 70, gw = W - L - R, gh = H - T - B, lo = -4, hi = 5;
    const Y = (v) => T + gh * (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = lo; v <= hi; v++) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); if (v % 2 === 0 || !narrow) K.label(c, k, fmt(v, 0), L - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(W - R, Y(0)); c.stroke();
    K.label(c, k, narrow ? 'средняя отдача за поездку' : 'средняя отдача за поездку: серый — оператор, синий — BC, оранжевый — IQL', L, 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    const gwid = gw / ORDER.length;
    ORDER.forEach((set, i) => {
      const gx = L + gwid * i, bw = Math.min(26, gwid / 4.4), cx = gx + gwid / 2;
      const items = [['op', best(set).ret, P.ink3, null], ['bc', r(set, 'bc') && r(set, 'bc').ev.ret, P.cl, r(set, 'bc')], ['iql', r(set, 'iql') && r(set, 'iql').ev.ret, P.e2e, r(set, 'iql')]];
      items.forEach(([key, v, col], j) => {
        const x = cx + (j - 1) * (bw + 4) - bw / 2;
        if (v == null) { c.strokeStyle = P.line; c.setLineDash([3, 3]); c.strokeRect(x, Y(0.6), bw, Y(0) - Y(0.6)); c.setLineDash([]); K.label(c, k, '?', x + bw / 2, Y(0.3), { px: 10, color: P.ink3, halo: false }); return; }
        c.fillStyle = col; c.globalAlpha = key === 'op' ? 0.55 : 0.9; c.fillRect(x, Math.min(Y(0), Y(v)), bw, Math.max(1.5, Math.abs(Y(v) - Y(0)))); c.globalAlpha = 1;
        if (!narrow) K.label(c, k, fmtS(v, 1), x + bw / 2, v >= 0 ? Y(v) - 8 : Y(v) + 9, { px: 10, color: P.ink2, haloColor: P.surf });
      });
      const sel = set === st.set;
      K.label(c, k, TITLE[set], cx, H - B + 16, { px: narrow ? 10 : 11, weight: sel ? 800 : 600, color: sel ? P.ink : P.ink2, halo: false });
      const lines = [];
      const bc = r(set, 'bc'), iq = r(set, 'iql');
      if (bc) lines.push([`BC ${bc.ev.ok}/20${bc.ev.tGoal ? ' · ' + fmt(bc.ev.tGoal, 1) + ' с' : ''}`, P.cl]);
      if (iq) lines.push([`IQL ${iq.ev.ok}/20${iq.ev.tGoal ? ' · ' + fmt(iq.ev.tGoal, 1) + ' с' : ''}`, P.e2e]);
      // «BC 20/20 · 12,3 с»: на узком графике в одну строку не помещается — число доехавших и время идут двумя строками
      lines.flatMap(([t, col]) => (narrow ? t.split(' · ') : [t]).map((x) => [x, col])).forEach(([t, col], n) => K.label(c, k, t, cx, H - B + first + n * step, { px: 10, color: col, halo: false }));
      if (sel) { c.strokeStyle = P.ink3; c.lineWidth = 1; c.strokeRect(gx + 3, T - 6, gwid - 6, H - T + 1); }
    });
    if (!r('careful', 'bc') && !r('mix', 'bc')) K.label(c, k, narrow ? 'нажми кнопку миссии' : 'столбики BC и IQL появятся, когда политики обучатся: нажми кнопку миссии', W / 2, Y(3.2), { px: 12, weight: 700, color: P.ink2, haloColor: P.surf });
  }
  function render() {
    drawMap(); drawChart(); segSet('#sSet', st.set);
    const pg = $('#sProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const b = best(st.set), bc = r(st.set, 'bc'), iq = r(st.set, 'iql');
    const op = `${st.set === 'mix' ? 'Лучший оператор смеси' : 'Оператор'} (${TITLE[b.key]}): ${b.ok} из ${b.n} поездок${b.tGoal ? ', ' + fmt(b.tGoal, 1) + ' с' : ''}, отдача ${fmtS(b.ret)}.`;
    setOut($('#sOut'), st.busy ? `Политики учатся в браузере: ${Math.round(st.prog * 100)}%.` : `${op}${bc ? ` BC: ${tripsLine(bc.ev, 20)}.` : ''}${iq ? ` IQL: ${tripsLine(iq.ev, 20)}, быстрых решений ${fmt(iq.ev.fast * 100, 0)}%.` : ''}`);
  }
  async function train(set) {
    st.set = set; render();
    if (!(r(set, 'bc') && r(set, 'iql'))) {
      st.busy = true; st.prog = 0; render();
      try { await Store.train([{ set, kind: 'bc' }, { set, kind: 'iql' }], (p) => { st.prog = p; const pg = $('#sProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#sOut'), `Политики учатся в браузере: ${Math.round(p * 100)}%.`); }); }
      finally { st.busy = false; }
    }
    render(); if (ctl) ctl.update();
    return { op: best(set), bc: r(set, 'bc').ev, iql: r(set, 'iql').ev };
  }
  function setSet(v) { st.set = v; render(); if (ctl) ctl.update(); if (ctl && ctl.index === 3 && !st.busy) train(v); }
  const api = {
    reset() { st.set = 'careful'; render(); },
    state: () => ({ set: st.set, busy: st.busy }), render, st, train, setSet,
  };
  const missions = [
    { short: 'Аккуратный', title: 'Логи одного аккуратного оператора', text: '60 поездок аккуратного: все медленные, все доехали. Быстрая скорость в этих логах не встречается ни разу.', onEnter: (X) => X.setSet('careful'),
      bet: { q: 'станет ли IQL на этих логах быстрее оператора?', options: ['Да: обучение с подкреплением найдёт, где можно ехать быстрее', 'Нет: быстрых действий в логах нет, взять их неоткуда', 'Станет заметно хуже BC'], answer: (r) => (r.iql.tGoal < r.op.tGoal - 0.5 ? 0 : r.iql.ret < r.bc.ret - 0.3 ? 2 : 1) },
      action: { label: 'Обучить BC и IQL', run: (X) => X.train('careful') },
      criteria: [{ label: 'IQL не быстрее оператора: разница во времени меньше 0,5 с', test: (r) => r.iql.tGoal != null && Math.abs(r.iql.tGoal - r.op.tGoal) < 0.5 }, { label: 'IQL ни разу не выбрал быструю скорость', test: (r) => r.iql.fast === 0 }],
      explain: (r) => `Оператор: ${fmt(r.op.tGoal, 1)} с, отдача ${fmtS(r.op.ret)}. BC: ${tripsLine(r.bc, 20)}. IQL: ${tripsLine(r.iql, 20)}. Оба едут как оператор: Q-функцию IQL никто не спрашивает о быстрых действиях, а в весах его политики есть только медленные. Обзор Levine и соавторов прямо пишет, что offline RL не найдёт действий лучше тех, что есть в данных.` },
    { short: 'Торопливый', title: 'Логи одного торопливого оператора', text: '60 поездок торопливого: все быстрые, почти в каждой второй он врезается на кухне. Медленных действий в логах нет.', onEnter: (X) => X.setSet('hurried'),
      bet: { q: 'научится ли IQL тормозить перед поворотом на кухню?', options: ['Да: по логам видно, где торопливый врезается', 'Нет: медленных действий в логах нет', 'Да, но только если учить дольше'], answer: (r) => (r.iql.fast < 0.99 ? 0 : 1) },
      action: { label: 'Обучить BC и IQL', run: (X) => X.train('hurried') },
      criteria: [{ label: 'IQL всегда едет быстро', test: (r) => r.iql.fast >= 0.99 }, { label: 'IQL доезжает не чаще, чем в 15 поездках из 20', test: (r) => r.iql.ok <= 15 }],
      explain: (r) => `Оператор: ${r.op.ok} из ${r.op.n}, отдача ${fmtS(r.op.ret)}. BC: ${tripsLine(r.bc, 20)}. IQL: ${tripsLine(r.iql, 20)}, быстрых решений ${fmt(r.iql.fast * 100, 0)}%. По логам видно, что быстрый поворот на кухню часто кончается столкновением, но альтернативы в данных нет: IQL может только выбрать, какие быстрые поездки копировать сильнее.` },
    { short: 'Случайный', title: 'Логи случайного оператора', text: '100 поездок случайного оператора: в половине решений он жмёт что попало, скорость то и дело меняет. До кухни он доехал всего в 17 поездках из 100.', onEnter: (X) => X.setSet('random'),
      bet: { q: 'что получится у IQL на этих логах?', options: ['Почти ничего: из плохих логов хорошей политики не выйдет', 'Доедет, но не быстрее аккуратного оператора', 'Доедет почти всегда и быстрее любого оператора урока'], answer: (r) => (r.iql.ok >= 15 && r.iql.tGoal < Math.min(...Object.values(Store.data('mix').st).map((x) => x.tGoal || 99)) ? 2 : r.iql.ok >= 15 ? 1 : 0) },
      action: { label: 'Обучить BC и IQL', run: (X) => X.train('random') },
      criteria: [{ label: 'IQL доезжает хотя бы в 18 поездках из 20', test: (r) => r.iql.ok >= 18 }, { label: 'IQL набирает больше BC', test: (r) => r.iql.ret > r.bc.ret }],
      explain: (r) => `Оператор: ${r.op.ok} из ${r.op.n}, отдача ${fmtS(r.op.ret)}. BC: ${tripsLine(r.bc, 20)} — самое частое действие случайного оператора всё-таки «ехать к кухне», и BC берёт именно его, но скорость копирует какую придётся. IQL: ${tripsLine(r.iql, 20)} — лучшая политика урока. В этих логах есть и быстрые, и медленные действия почти везде, и видно, чем каждое кончилось. Так и пишет обзор Levine и соавторов: на широких данных действий вне данных меньше.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай наборы логов — политики обучатся при первом выборе. Найди набор, на котором BC обходит IQL, и объясни почему.', final: true, controls: ['set'] },
  ];
  function init() {
    segBind('#sSet', (v) => setSet(v));
    ctl = mountMissions('#sMis', missions, api, { controls: { set: '#wrapSSet' }, scene: '#sMap' });
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
    { q: 'Offline RL — это то же самое, что off-policy обучение из урока 5.3?', o: ['Да: и там и там учатся на старом опыте из буфера', 'Нет: off-policy метод продолжает собирать новые шаги и дополняет буфер, а offline RL учится только на заранее записанных логах и выезжает лишь после обучения', 'Нет: offline RL не использует награду'], a: 1, e: 'SAC из урока 5.3 учится на старых переходах, но каждый шаг добавляет новый. Если новых шагов нет совсем, ошибки Q-функции на действиях вне данных некому исправить — отсюда вся трудность offline RL.' },
    { q: 'Если запустить Q-обучение на логах хорошего оператора, политика выйдет хотя бы на его уровень?', o: ['Да: в данных только хорошие действия', 'Нет: максимум в целевом значении выбирает действия, которых в логах почти нет, и их завышенные оценки растут', 'Да, если учить достаточно долго'], a: 1, e: 'В опыте BCQ агент DDPG на миллионе переходов эксперта быстро научился неэкспертным действиям под видом оптимистичной экстраполяции. В лаборатории 1 наивное Q-обучение не доехало ни разу из 20.' },
    { q: 'Q-функция обещает на старте высокую отдачу. Значит, политика хорошая?', o: ['Да: Q-функция и есть оценка политики', 'Не обязательно: вне данных оценки ничем не проверены — наивная Q-функция обещала 93,0, а вышло −3,92', 'Да, если оценка больше нуля'], a: 1, e: 'Проверить обещание можно только поездками, а в offline RL их нет. Авторы CQL называют выбор числа шагов обучения без поездок открытой задачей, а обзор Levine и соавторов пишет, что оценка политики без поездок — область, где исследования ещё идут.' },
    { q: 'Обучение по демонстрациям на смеси логов выйдет на уровень лучшего оператора?', o: ['Да: оно копирует всех, значит, и лучшего', 'Не обязательно: оно копирует самые частые действия в каждой точке, а они могут прийти от разных операторов', 'Нет, оно всегда хуже худшего оператора'], a: 1, e: 'BC Ады ехал медленно в прихожей и быстро на кухне — как чаще всего ездили в логах именно там — и все шесть его аварий случились на кухне. Отдача −0,08 против +0,51 у лучшего оператора.' },
    { q: 'Может ли offline RL научиться действию, которого в логах нет вовсе?', o: ['Да, на то он и обучение с подкреплением', 'Нет: он может выбирать и комбинировать записанные действия, но не придумать новые', 'Да, если поднять вес штрафа CQL'], a: 1, e: 'На логах одного аккуратного оператора IQL ехал так же медленно, как он, а на логах торопливого так и не научился тормозить. Обзор Levine и соавторов прямо пишет, что offline RL не найдёт действий лучше тех, что есть в данных.' },
    { q: 'Чем больше вес штрафа CQL, тем лучше политика?', o: ['Да: чем осторожнее, тем безопаснее', 'Нет: слабый штраф оставляет пики вне данных, а слишком сильный прижимает Q-функцию к частоте действий в логах, и CQL начинает копировать самое частое, как BC', 'Вес штрафа ни на что не влияет'], a: 1, e: 'В лаборатории 2 при α = 0,03 Ада не доехала ни разу, при α = 0,3 — в 15 поездках из 20, а при α от 1 в точке щупа CQL выбирал самое частое действие логов. Обзор Levine и соавторов называет избыточный пессимизм одной из главных трудностей.' },
    { q: 'IQL оценивает Q-функцию на действиях, которых нет в логах?', o: ['Да, как и любое Q-обучение: в целевом значении стоит максимум', 'Нет: целевое значение для Q равно r + γV(s′), где V(s) — экспектиль оценок только записанных действий, а политика копирует записанные действия с весом от преимущества', 'Только в начале обучения'], a: 1, e: 'Поэтому обещание IQL на старте — 0,60 — почти совпало с тем, что вышло на деле, 0,66. При τ = 0,5 экспектиль становится средним, и метод превращается в SARSA.' },
    { q: 'Для offline RL лучше всего логи, где каждая поездка образцовая?', o: ['Да: хорошие данные — хорошая политика', 'Не обязательно: важно, чтобы в логах были разные действия и было видно, к чему они привели', 'Нет: лучше всего полностью случайные действия'], a: 1, e: 'На логах одного аккуратного оператора IQL не стал лучше него, а на логах случайного оператора, доехавшего в 17 поездках из 100, получил лучшую политику урока — 20 из 20 за 8,2 с. Чисто случайные нажатия без поездок к кухне не помогли бы: нужны и разнообразие, и удачные исходы.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('duel', () => { mis.duel = Duel.init(); });
    safe('probe', () => { mis.probe = Probe.init(); });
    safe('sets', () => { mis.sets = Sets.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['dMis', 'rMis', 'sMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l56 = { mis, Duel, Probe, Sets, Store, L56 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
