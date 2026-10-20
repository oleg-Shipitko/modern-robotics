/* =====================================================================
   ui-l51.js — урок 5.1 «Основы RL: награда, ценность, преимущество».
   0) анимированные схемы (shared/anim.js): обмен агента и среды за один
      эпизод; один пересчёт клетки по уравнению Беллмана;
   1) интерактив «Прогноз отдачи»: читатель рисует G_t по шагам маршрута;
   2) лаборатория «Итерация ценности»: волна оценок от плиты, две Ады
      с разным γ рядом, ручки наград, отладчик по итерациям;
   3) лаборатория «Стрелки преимущества»: привычная политика Ады,
      преимущество каждого действия, улучшение политики по клеткам и раундам;
   4) квиз.
   Движок — l51/engine.js (без DOM).
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
const E = L51;
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), hySoft: HeroKit.css('--hybrid-soft'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
/** Число по-русски: запятая, минус — длинный. */
const fmt = (v, d) => (d == null ? 2 : d) === 0 ? String(Math.round(v)).replace('-', '−') : v.toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }).replace('-', '−');
const sgn = (v, d) => (v > 0 ? '+' : '') + fmt(v, d);
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
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
/** Цвет из CSS-переменной с прозрачностью. */
function rgba(col, a) {
  const s = String(col).trim(); let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  m = /^rgba?\(([^)]+)\)$/.exec(s); if (m) { const p = m[1].split(',').map((x) => x.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
  return s;
}
/** Где клетка: комната и место словами — для разборов и подписей. */
function placeOf(s) {
  const [i, j] = E.ij(s);
  if (s === E.GOAL) return 'клетка у плиты';
  if (s === E.PUDDLE) return 'клетка у мойки';
  if (s === E.START) return 'клетка у кровати';
  if (i <= 3) return j <= 3 ? 'верхняя спальня' : 'нижняя спальня';
  if (i <= 7) return 'гостиная';
  return 'кухня';
}
const cellName = (s) => { const [i, j] = E.ij(s); return `(${i}, ${j})`; };
/** Где клетка — в предложном падеже: «в нижней спальне». */
const placeIn = (s) => ({ 'верхняя спальня': 'в верхней спальне', 'нижняя спальня': 'в нижней спальне', 'гостиная': 'в гостиной', 'кухня': 'на кухне' }[placeOf(s)] || '');

/* =====================================================================
   Ада сверху и спереди
   ===================================================================== */
/** Ада сверху: круглая колёсная база, экран-лицо смотрит по направлению th. */
function drawAdaTop(c, x, y, th, r, P) {
  c.save(); c.translate(x, y); c.rotate(th);
  c.beginPath(); c.arc(0, 0, r, 0, 7); c.fillStyle = HeroKit.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = Math.max(1.4, r * 0.14); c.strokeStyle = P.ink; c.stroke();
  c.beginPath(); c.roundRect(r * 0.2, -r * 0.5, r * 0.56, r, r * 0.22); c.fillStyle = '#1f2430'; c.fill();
  c.fillStyle = '#eb6834'; c.beginPath(); c.arc(r * 0.5, -r * 0.22, r * 0.11, 0, 7); c.arc(r * 0.5, r * 0.22, r * 0.11, 0, 7); c.fill();
  c.restore();
}
/** Ада спереди: голова с экраном, корпус, руки, колёсная база с двумя колёсами (ног у Ады нет). */
function drawAdaFront(c, x, y, s, P) {
  const body = HeroKit.dark() ? '#2a2926' : '#f4efe6', edge = P.ink2;
  c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 2.2; c.strokeStyle = edge; c.lineJoin = 'round';
  const capsule = (x1, y1, x2, y2) => { c.lineCap = 'round'; c.lineWidth = 9; c.strokeStyle = edge; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.lineWidth = 5.5; c.strokeStyle = body; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = edge; };
  capsule(-20, -6, -27, 22); capsule(20, -6, 27, 22);
  c.fillStyle = body; c.beginPath(); c.roundRect(-18, -12, 36, 46, 9); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-4, 32, 8, 12, 2); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-20, 42, 40, 16, 7); c.fill(); c.stroke();
  c.fillStyle = '#1f2430'; c.lineWidth = 1.6; for (const wx of [-11, 11]) { c.beginPath(); c.arc(wx, 61, 6.5, 0, 7); c.fill(); c.stroke(); }
  c.lineWidth = 2.2;
  c.fillStyle = body; c.beginPath(); c.roundRect(-16, -42, 32, 26, 8); c.fill(); c.stroke();
  c.fillStyle = '#1f2430'; c.beginPath(); c.roundRect(-11, -37, 22, 15, 5); c.fill();
  c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(-4.5, -29.5, 1.8, 2.6, 0, 0, 7); c.ellipse(4.5, -29.5, 1.8, 2.6, 0, 0, 7); c.fill();
  c.restore();
}
/** Крест-мишень: клетка у плиты, куда едет Ада. */
function crosshair(c, x, y, r, col, lw) {
  c.strokeStyle = col; c.lineWidth = lw || 1.8; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(x - r - 4, y); c.lineTo(x - r * 0.4, y); c.moveTo(x + r * 0.4, y); c.lineTo(x + r + 4, y); c.moveTo(x, y - r - 4); c.lineTo(x, y - r * 0.4); c.moveTo(x, y + r * 0.4); c.lineTo(x, y + r + 4); c.stroke();
}

/* =====================================================================
   0а. Схема: агент и среда за один эпизод
   Маршрут и награды — из движка (кратчайший путь к плите, +10 в конце,
   γ = 0,9), отдача в конце ленты — та же, что в прогнозе.
   ===================================================================== */
(() => {
  const F = E.forecast('g09'), n = F.rewards.length, D = 0.9, HOLD = 2.6, T = n * D + HOLD;
  const acts = F.cells.slice(0, -1).map((s, q) => E.DX.findIndex((d, a) => s + d + E.DY[a] * E.NX === F.cells[q + 1]));
  const g0 = F.G[0];
  function draw(c, k, t, P, A, G) {
    const { lab, rect, alpha, seg, ease, circle } = A, u = ((t % T) + T) % T;
    const step = Math.min(n, Math.floor(u / D)), v = u - step * D, done = u >= n * D;   // шаг, фаза внутри шага
    const cur = Math.min(step, n - 1), phAct = done ? 1 : seg(v, 0, 0.34), phMove = done ? 1 : seg(v, 0.34, 0.52), phBack = done ? 1 : seg(v, 0.52, 0.86);
    // где Ада: клетка шага, плавно к следующей
    const from = Plan.centre(F.cells[cur], G.CS), to = Plan.centre(F.cells[Math.min(cur + 1, n)], G.CS), m = done ? 1 : ease(phMove);
    const ax = from[0] + (to[0] - from[0]) * m, ay = from[1] + (to[1] - from[1]) * m;
    // агент
    rect(c, G.ag[0], G.ag[1], G.ag[2], G.ag[3], 12, alpha(P.mot, 0.06), P.mot, 1.4);
    lab(c, k, 'агент', G.agT[0], G.agT[1], { px: 12, weight: 750, color: P.mot, haloColor: P.surf, align: G.agT[2] || 'center' });
    lab(c, k, 'система управления Ады', G.agT[0], G.agT[1] + 17, { px: 10.5, color: P.ink2, halo: false, align: G.agT[2] || 'center' });
    lab(c, k, 'политика: клетка → действие', G.agT[0], G.agT[1] + 33, { px: 10, color: P.ink3, halo: false, align: G.agT[2] || 'center' });
    drawAdaFront(c, G.ada[0], G.ada[1], G.ada[2], { ink2: P.ink2 });
    // среда: мини-план с маршрутом
    rect(c, G.env[0], G.env[1], G.env[2], G.env[3], 12, alpha(P.out, 0.05), P.out, 1.4);
    lab(c, k, 'среда: квартира, вид сверху', G.envT[0], G.envT[1], { px: 11.5, weight: 700, color: P.out, haloColor: P.surf });
    c.save(); c.translate(G.map[0], G.map[1]);
    Plan.draw(c, k, Object.assign({}, P, { surf: P.surf, bg: P.surf2 || P.surf, grid: P.grid, cl: P.out, e2e: P.mot, hy: P.spr, good: P.good, bad: P.bad }), { CS: G.CS, names: false, puddle: false });
    c.strokeStyle = P.mot; c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
    F.cells.slice(0, cur + 1).forEach((s, q) => { const [x, y] = Plan.centre(s, G.CS); if (q) c.lineTo(x, y); else c.moveTo(x, y); }); c.lineTo(ax, ay); c.stroke();
    circle(c, ax, ay, G.CS * 0.32, P.mot, P.surf, 1.4);
    c.restore();
    // действие: от агента к среде
    const [a0, a1] = G.act, actWord = E.ANAME[acts[cur]];
    A.arrow(c, a0[0], a0[1], a1[0], a1[1], alpha(P.mot, 0.5), 2, 8);
    lab(c, k, 'действие', G.actL[0], G.actL[1], { px: 10.5, weight: 650, color: P.mot, haloColor: P.surf, align: G.actL[2] || 'center' });
    if (!done && phAct > 0 && phAct < 1) { const x = a0[0] + (a1[0] - a0[0]) * ease(phAct), y = a0[1] + (a1[1] - a0[1]) * ease(phAct); rect(c, x - 30, y - 10, 60, 20, 6, P.mot, null); lab(c, k, actWord, x, y, { px: 10.5, weight: 700, color: '#fff', halo: false }); }
    else lab(c, k, done ? '—' : actWord, G.actW[0], G.actW[1], { px: 11, weight: 700, color: P.ink, haloColor: P.surf, align: G.actW[2] || 'center' });
    // новая клетка и награда: от среды к агенту
    const [b0, b1] = G.back, rNow = F.rewards[cur], [ci, cj] = E.ij(F.cells[Math.min(cur + 1, n)]);
    A.arrow(c, b0[0], b0[1], b1[0], b1[1], alpha(P.out, 0.5), 2, 8);
    lab(c, k, 'новая клетка и награда', G.backL[0], G.backL[1], { px: 10.5, weight: 650, color: P.out, haloColor: P.surf, align: G.backL[2] || 'center' });
    const showBack = done || phBack > 0;
    if (!done && phBack > 0 && phBack < 1) { const x = b0[0] + (b1[0] - b0[0]) * ease(phBack), y = b0[1] + (b1[1] - b0[1]) * ease(phBack); rect(c, x - 44, y - 10, 88, 20, 6, P.out, null); lab(c, k, `(${ci}, ${cj}) · ${rNow > 0 ? '+' : ''}${rNow}`, x, y, { px: 10.5, weight: 700, color: '#fff', halo: false }); }
    else if (showBack) lab(c, k, `клетка (${ci}, ${cj}), награда ${rNow > 0 ? '+' : ''}${rNow}`, G.backW[0], G.backW[1], { px: 11, weight: 700, color: P.ink, haloColor: P.surf, align: G.backW[2] || 'center' });
    lab(c, k, done ? 'эпизод окончен' : `шаг t = ${cur}`, G.stepL[0], G.stepL[1], { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    // лента наград и отдача
    lab(c, k, 'награды за эпизод', G.tapeL[0], G.tapeL[1], { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf, align: 'left' });
    const got = done ? n : step + (phBack >= 1 ? 1 : 0);
    for (let q = 0; q < n; q++) {
      const [x, y] = G.chip(q), r = F.rewards[q], on = q < got;
      rect(c, x, y, G.cw, G.ch, 6, on ? (r > 0 ? alpha(P.good, 0.2) : alpha(P.out, 0.08)) : 'transparent', on ? (r > 0 ? P.good : P.out) : P.line, 1.2);
      if (on) lab(c, k, r > 0 ? `+${r}` : String(r), x + G.cw / 2, y + G.ch / 2, { px: 11, weight: 700, color: r > 0 ? P.good : P.ink2, halo: false });
    }
    const fin = done ? seg(u, n * D, n * D + 0.5) : 0;
    c.globalAlpha = fin;
    lab(c, k, 'отдача с первого шага', G.sum[0], G.sum[1] - 14, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf, align: G.sum[2] || 'center' });
    lab(c, k, `10 · 0,9¹¹ = ${fmt(g0, 2)}`, G.sum[0], G.sum[1] + 6, { px: 14, weight: 800, color: P.ink, haloColor: P.surf, align: G.sum[2] || 'center' });
    c.globalAlpha = 1;
  }
  Anim.add('loop', {
    W: 720, H: 360, start: 3.3, narrowAt: 600,
    draw(c, k, t, P, A) {
      draw(c, k, t, P, A, { CS: 16, ag: [14, 24, 222, 200], agT: [125, 44], ada: [125, 150, 1.05], env: [478, 24, 228, 200], envT: [592, 44], map: [496, 70],
        act: [[244, 84], [466, 84]], actL: [355, 66], actW: [355, 104], back: [[466, 178], [244, 178]], backL: [355, 160], backW: [355, 198], stepL: [355, 132],
        tapeL: [16, 262], chip: (q) => [16 + q * 38, 278], cw: 34, ch: 28, sum: [620, 292] });
    },
    narrow: { W: 360, H: 600, draw(c, k, t, P, A) {
      draw(c, k, t, P, A, { CS: 20, ag: [10, 10, 340, 128], agT: [118, 38, 'left'], ada: [62, 76, 0.86], env: [10, 238, 340, 196], envT: [180, 256], map: [60, 270],
        act: [[70, 142], [70, 232]], actL: [82, 160, 'left'], actW: [82, 177, 'left'], back: [[290, 232], [290, 142]], backL: [278, 200, 'right'], backW: [278, 217, 'right'], stepL: [210, 160],
        tapeL: [12, 452], chip: (q) => [12 + (q % 6) * 56, 466 + Math.floor(q / 6) * 40], cw: 50, ch: 32, sum: [180, 566] });
    } },
  });
})();

/* =====================================================================
   0б. Схема: один пересчёт клетки по уравнению Беллмана
   Ценности соседей — из итерации ценности без лужи при γ = 0,9.
   ===================================================================== */
const BACKUP = (() => {
  const W = E.world({ dry: true }), g = 0.9, V = E.valueIteration(W, g).V, s = E.DOOR;
  const nb = [0, 1, 2, 3].map((a) => { const t = E.next(s, a), r = E.reward(W, s, a); return { a, t, r, v: t === E.GOAL ? 0 : V[t], q: r + g * (t === E.GOAL ? 0 : V[t]) }; });
  let best = 0; nb.forEach((x, a) => { if (x.q > nb[best].q + 1e-12) best = a; });
  return { s, g, nb, best, v: V[s] };
})();
(() => {
  const T = 10, B = BACKUP, WORD = ['вверх', 'вправо', 'вниз', 'влево'], SIDE = ['выше', 'правее', 'ниже', 'левее'];
  function draw(c, k, t, P, A, G) {
    const { lab, rect, alpha, seg, ease } = A, u = ((t % T) + T) % T, fade = 1 - seg(u, T - 0.5, T);
    const { cx, cy, off, cs, ns } = G, pos = [[cx, cy - off], [cx + off, cy], [cx, cy + off], [cx - off, cy]];
    lab(c, k, 'клетка у двери кухни и её соседи', G.title[0], G.title[1], { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    // соседи с их ценностями
    B.nb.forEach((x, a) => {
      const [px, py] = pos[a]; rect(c, px - ns / 2, py - ns / 2, ns, ns, 8, alpha(P.out, 0.1), P.out, 1.4);
      lab(c, k, `V = ${fmt(x.v, 2)}`, px, py + 4, { px: 11, weight: 700, color: P.out, halo: false });
      lab(c, k, SIDE[a], px, py - ns / 2 + 11, { px: 10, color: P.ink3, halo: false });
    });
    // центр
    const fill = seg(u, 6.4, 7.0) * fade;
    rect(c, cx - cs / 2, cy - cs / 2, cs, cs, 10, alpha(P.mot, 0.06 + 0.14 * fill), fill > 0 ? P.mot : P.ink3, 1.8);
    lab(c, k, fill > 0.5 ? `V = ${fmt(B.v, 2)}` : 'V = ?', cx, cy + 2, { px: 12.5, weight: 800, color: fill > 0.5 ? P.mot : P.ink2, halo: false });
    // кандидаты: ценность соседа летит в центр, справа — строка Q
    B.nb.forEach((x, a) => {
      const t0 = 0.8 + 1.2 * a, mv = seg(u, t0, t0 + 0.8), [px, py] = pos[a];
      if (mv > 0 && mv < 1) { const e = ease(mv), x1 = px + (cx - px) * e, y1 = py + (cy - py) * e; rect(c, x1 - 22, y1 - 9, 44, 18, 5, P.out, null); lab(c, k, fmt(x.v, 2), x1, y1, { px: 10, weight: 700, color: '#fff', halo: false }); }
      const shown = seg(u, t0 + 0.7, t0 + 1.0) * fade; if (shown <= 0) return;
      const isBest = a === B.best, hl = seg(u, 5.6, 6.0) * fade, [lx, ly] = G.line(a);
      c.globalAlpha = shown * (isBest ? 1 : 1 - 0.55 * hl);
      if (isBest && hl > 0) rect(c, lx - 6, ly - 12, G.lw, 24, 6, alpha(P.mot, 0.14 * hl), null);
      lab(c, k, `${WORD[a]}: ${fmt(x.r, 0)} + ${fmt(B.g, 1)} × ${fmt(x.v, 2)} = ${fmt(x.q, 2)}`, lx, ly, { px: 11, weight: isBest ? 750 : 600, color: isBest && hl > 0 ? P.mot : P.ink2, halo: false, align: 'left', mono: true });
      c.globalAlpha = 1;
    });
    // итог: наибольшее Q становится новой ценностью, стрелка — к лучшему соседу
    if (fill > 0) {
      c.globalAlpha = fill; const [bx, by] = pos[B.best], dx = Math.sign(bx - cx), dy = Math.sign(by - cy);
      A.arrow(c, cx + dx * cs * 0.52, cy + dy * cs * 0.52, bx - dx * ns * 0.55, by - dy * ns * 0.55, P.mot, 3, 9);
      lab(c, k, `наибольшее: ${fmt(B.nb[B.best].q, 2)} → новая V клетки`, G.res[0], G.res[1], { px: 11.5, weight: 750, color: P.mot, haloColor: P.surf, align: G.res[2] || 'left' });
      c.globalAlpha = 1;
    }
    lab(c, k, 'r + γ · V(соседа) для каждого действия', G.head[0], G.head[1], { px: 10.5, weight: 650, color: P.ink3, haloColor: P.surf, align: G.head[2] || 'left' });
  }
  Anim.add('backup', {
    W: 720, H: 380, start: 7.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { cx: 200, cy: 196, off: 112, cs: 86, ns: 76, title: [200, 20], head: [418, 92], line: (a) => [418, 132 + a * 38], lw: 290, res: [418, 300] }); },
    narrow: { W: 360, H: 560, draw(c, k, t, P, A) { draw(c, k, t, P, A, { cx: 180, cy: 172, off: 100, cs: 78, ns: 68, title: [180, 16], head: [26, 330], line: (a) => [26, 362 + a * 34], lw: 312, res: [26, 510] }); } },
  });
})();

/* =====================================================================
   План квартиры на канвасе: клетки CS × CS, начало — левый верхний угол.
   o: { CS, V, vmax, numbers, arrows: Int8Array, route: [клетки], ada: [x, y, th] | null,
        puddle, sel, rooms, names, steps: { клетка: номер шага } }
   ===================================================================== */
const Plan = (() => {
  const centre = (s, CS) => { const [i, j] = E.ij(s); return [(i + 0.5) * CS, (j + 0.5) * CS]; };
  function floor(c, k, P, o) {
    const CS = o.CS, W = E.NX * CS, H = E.NY * CS;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    if (o.V) {
      const vmax = o.vmax || 10;
      for (const s of E.FREE) {
        if (s === E.GOAL) continue; const v = o.V[s]; if (!v) continue; const [i, j] = E.ij(s);
        const a = Math.min(1, Math.abs(v) / vmax);
        c.fillStyle = v > 0 ? rgba(P.cl, 0.05 + 0.6 * a) : rgba(P.bad, 0.08 + 0.5 * a);
        c.fillRect(i * CS, j * CS, CS, CS);
      }
    }
    c.strokeStyle = P.grid; c.lineWidth = 1 * k; c.beginPath();
    for (let i = 1; i < E.NX; i++) { c.moveTo(i * CS, 0); c.lineTo(i * CS, H); }
    for (let j = 1; j < E.NY; j++) { c.moveTo(0, j * CS); c.lineTo(W, j * CS); }
    c.stroke();
  }
  function furniture(c, k, P, o) {
    const CS = o.CS;
    for (const f of E.FURN) {
      const [i0, j0, i1, j1] = f.r, x0 = i0 * CS, y0 = j0 * CS, x1 = (i1 + 1) * CS, y1 = (j1 + 1) * CS;
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.bg; c.fill();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); HeroKit.hatch(c, x0, y0, x1, y1, rgba(P.ink3, 0.55), 6 * Math.max(0.7, CS / 40), 0.9 * k);
      c.strokeStyle = P.ink3; c.lineWidth = 1.2 * k; c.strokeRect(x0 + 0.5 * k, y0 + 0.5 * k, x1 - x0 - k, y1 - y0 - k);
      if (o.names === false) continue;
      HeroKit.font(c, k, 10, 600); const tw = c.measureText(f.name).width + 6 * k, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (tw <= x1 - x0) HeroKit.label(c, k, f.name, cx, cy, { px: 10, color: P.ink2, haloColor: P.bg });
      else if (tw <= y1 - y0) { c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); HeroKit.label(c, k, f.name, 0, 0, { px: 10, color: P.ink2, haloColor: P.bg }); c.restore(); }
    }
  }
  function walls(c, k, P, o) {
    const CS = o.CS, W = E.NX * CS, H = E.NY * CS;
    c.strokeStyle = P.ink2; c.lineCap = 'square'; c.lineWidth = Math.max(2.5 * k, CS * 0.09);
    c.beginPath();
    for (const [x0, y0, x1, y1] of E.wallSegments()) { c.moveTo(x0 * CS, y0 * CS); c.lineTo(x1 * CS, y1 * CS); }
    c.stroke();
    c.lineWidth = Math.max(3 * k, CS * 0.12); c.strokeRect(0, 0, W, H);
    c.lineCap = 'butt';
  }
  function puddle(c, k, P, o) {
    const CS = o.CS, [x, y] = centre(E.PUDDLE, CS);
    c.beginPath(); c.ellipse(x, y, CS * 0.44, CS * 0.3, -0.25, 0, 7); c.fillStyle = rgba(P.hy, 0.22); c.fill(); c.strokeStyle = P.hy; c.lineWidth = 1.6 * k; c.stroke();
    c.strokeStyle = rgba(P.hy, 0.8); c.lineWidth = 1.2 * k; c.beginPath();
    for (const dy of [-0.08, 0.08]) { const yy = y + dy * CS; c.moveTo(x - CS * 0.2, yy); c.quadraticCurveTo(x - CS * 0.1, yy - CS * 0.06, x, yy); c.quadraticCurveTo(x + CS * 0.1, yy + CS * 0.06, x + CS * 0.2, yy); }
    c.stroke();
  }
  function goal(c, k, P, o) {
    const CS = o.CS, [x, y] = centre(E.GOAL, CS);
    c.fillStyle = rgba(P.good, 0.14); const [i, j] = E.ij(E.GOAL); c.fillRect(i * CS, j * CS, CS, CS);
    crosshair(c, x, y, CS * 0.22, P.good, Math.max(1.6 * k, CS * 0.05));
  }
  /** Стрелка действия a в клетке s: от центра к краю клетки. */
  function arrow(c, s, a, CS, len, col, lw, head) {
    const [x, y] = centre(s, CS), dx = E.DX[a], dy = E.DY[a], x0 = x - dx * len * 0.35, y0 = y - dy * len * 0.35, x1 = x + dx * len * 0.65, y1 = y + dy * len * 0.65;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - dx * head * 0.6, y1 - dy * head * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - dx * head - dy * head * 0.6, y1 - dy * head + dx * head * 0.6); c.lineTo(x1 - dx * head + dy * head * 0.6, y1 - dy * head - dx * head * 0.6); c.closePath(); c.fill();
  }
  function route(c, k, P, o) {
    const CS = o.CS; if (!o.route || o.route.length < 2) return;
    c.strokeStyle = P.e2e; c.lineWidth = Math.max(2.4 * k, CS * 0.08); c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); o.route.forEach((s, q) => { const [x, y] = centre(s, CS); if (q) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
  }
  function numbers(c, k, P, o) {
    const CS = o.CS; if (!o.V || !o.numbers) return;
    for (const s of E.FREE) {
      if (s === E.GOAL) continue; const [x, y] = centre(s, CS), v = o.V[s];
      const t = Math.abs(v) < 0.005 ? (v === 0 ? '0' : (v > 0 ? '≈0' : '−≈0')) : fmt(v, Math.abs(v) >= 9.995 ? 1 : 2);
      HeroKit.label(c, k, t, x, y + CS * 0.28, { px: 9.5, weight: 600, color: P.ink, haloColor: P.surf, mono: true });
    }
  }
  function draw(c, k, P, o) {
    floor(c, k, P, o); furniture(c, k, P, o);
    if (o.puddle) puddle(c, k, P, o);
    goal(c, k, P, o); walls(c, k, P, o);
    if (o.rooms) for (const [t, x, y] of E.ROOMS) HeroKit.label(c, k, t, x * o.CS, y * o.CS, { px: 10.5, weight: 600, color: P.ink3, haloColor: P.surf });
    if (o.under) o.under(c, k, P);
    route(c, k, P, o);
    if (o.arrows) for (const s of E.FREE) if (s !== E.GOAL && o.arrows[s] >= 0) arrow(c, s, o.arrows[s], o.CS, o.CS * 0.42, rgba(P.ink2, 0.85), Math.max(1.3 * k, o.CS * 0.035), Math.max(4 * k, o.CS * 0.11));
    numbers(c, k, P, o);
    if (o.steps) for (const [s, t] of o.steps) { const [x, y] = centre(s, o.CS); HeroKit.label(c, k, String(t), x, y, { px: 10, weight: 700, color: P.ink, haloColor: P.surf }); }
    if (o.sel != null) { const [i, j] = E.ij(o.sel); c.strokeStyle = P.ink; c.lineWidth = 2.2 * k; c.strokeRect(i * o.CS + 1.5 * k, j * o.CS + 1.5 * k, o.CS - 3 * k, o.CS - 3 * k); }
    if (o.ada) drawAdaTop(c, o.ada[0], o.ada[1], o.ada[2], o.CS * 0.3, P);
  }
  /** Клетка под точкой канваса (логические координаты) или null. */
  function cellAt(p, CS) { const i = Math.floor(p.x / CS), j = Math.floor(p.y / CS); if (i < 0 || j < 0 || i >= E.NX || j >= E.NY) return null; const s = E.id(i, j); return E.blocked[s] ? null : s; }
  return { draw, centre, arrow, cellAt };
})();

/* =====================================================================
   1. Интерактив: прогноз отдачи по шагам маршрута
   ===================================================================== */
const Forecast = (() => {
  const TOL = { g09: 0.4, g05: 0.4, steps: 0.6 };
  const RANGE = { g09: [0, 10.5, [0, 2, 4, 6, 8, 10]], g05: [0, 10.5, [0, 2, 4, 6, 8, 10]], steps: [-12, 0.6, [-12, -10, -8, -6, -4, -2, 0]] };
  const st = { kind: 'g09', F: E.forecast('g09'), pred: [], shown: false, err: null, busy: false };
  let ctl = null, drawing = false, lastT = null;
  const n = () => st.F.G.length;
  const box = () => ({ W: 440, H: 320, L: 50, R: 16, T: 26, B: 92 });
  function setKind(kind) { st.kind = kind; st.F = E.forecast(kind); st.pred = new Array(n()).fill(null); st.shown = false; st.err = null; render(); }
  const X = (t) => { const b = box(); return b.L + (b.W - b.L - b.R) * (t + 0.5) / n(); };
  const Y = (v) => { const b = box(), [lo, hi] = RANGE[st.kind]; return b.T + (b.H - b.T - b.B) * (1 - (v - lo) / (hi - lo)); };
  const Yinv = (y) => { const b = box(), [lo, hi] = RANGE[st.kind]; return lo + (hi - lo) * (1 - (y - b.T) / (b.H - b.T - b.B)); };
  function drawMap() {
    const cv = $('#fcMap'), CS = 30, { c, k } = HeroKit.fit(cv, E.NX * CS, E.NY * CS), P = pal(), cells = st.F.cells;
    const steps = cells.slice(0, -1).map((s, t) => [s, t]);
    Plan.draw(c, k, P, { CS, names: false, route: cells, steps, ada: (() => { const [x, y] = Plan.centre(E.START, CS); return [x, y - CS * 0.05, 0]; })(), under: null });
    // Ада закрывает номер 0 — подпишем его рядом
    const [x0, y0] = Plan.centre(E.START, CS); HeroKit.label(c, k, '0', x0 - CS * 0.36, y0 - CS * 0.34, { px: 10, weight: 700, color: P.ink, haloColor: P.surf });
    HeroKit.label(c, k, 'плита', Plan.centre(E.GOAL, CS)[0], Plan.centre(E.GOAL, CS)[1] + CS * 0.62, { px: 10, weight: 650, color: P.good, haloColor: P.surf });
  }
  function drawChart() {
    const cv = $('#fcCv'), b = box(), { c, k } = HeroKit.fit(cv, b.W, b.H), P = pal(), F = st.F, [lo, hi, ticks] = RANGE[st.kind];
    c.fillStyle = P.surf; c.fillRect(0, 0, b.W, b.H);
    const x0 = b.L, x1 = b.W - b.R, yb = b.H - b.B;
    c.strokeStyle = P.grid; c.lineWidth = 1 * k;
    for (const v of ticks) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); HeroKit.label(c, k, fmt(v, 0), x0 - 7, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false, mono: true }); }
    if (lo < 0 && hi > 0) { c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x1, Y(0)); c.stroke(); }
    HeroKit.label(c, k, 'отдача G с шага t', x0, 12, { px: 10.5, weight: 650, color: P.ink3, align: 'left', halo: false });
    HeroKit.label(c, k, `γ = ${fmt(F.g, F.g === 1 ? 0 : 1)}`, x1, 12, { px: 11, weight: 700, color: P.ink2, align: 'right', halo: false });
    for (let t = 0; t < n(); t++) HeroKit.label(c, k, String(t), X(t), yb + 13, { px: 10.5, color: P.ink3, halo: false, mono: true });
    HeroKit.label(c, k, 'шаг t', x1, yb + 30, { px: 10.5, color: P.ink3, align: 'right', halo: false });
    // награды за шаг: лента под осью
    HeroKit.label(c, k, 'награда за шаг', x0 - 44, yb + 52, { px: 10, weight: 650, color: P.ink3, align: 'left', halo: false });
    for (let t = 0; t < n(); t++) {
      const r = F.rewards[t], cw = Math.min(30, (x1 - x0) / n() - 3), x = X(t);
      c.fillStyle = r > 0 ? rgba(P.good, 0.18) : r < 0 ? rgba(P.bad, 0.12) : P.bg; c.strokeStyle = r > 0 ? P.good : r < 0 ? P.bad : P.line;
      c.lineWidth = 1 * k; c.beginPath(); c.roundRect(x - cw / 2, yb + 62, cw, 20, 5); c.fill(); c.stroke();
      HeroKit.label(c, k, r > 0 ? `+${r}` : fmt(r, 0), x, yb + 72, { px: 10, weight: 700, color: r > 0 ? P.good : r < 0 ? P.bad : P.ink3, halo: false, mono: true });
    }
    // расчёт (после сравнения): синие точки и линия
    if (st.shown) {
      c.strokeStyle = rgba(P.cl, 0.75); c.lineWidth = 2 * k; c.setLineDash([5 * k, 4 * k]); c.beginPath();
      F.G.forEach((v, t) => (t ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v)))); c.stroke(); c.setLineDash([]);
      F.G.forEach((v, t) => { c.beginPath(); c.arc(X(t), Y(v), 4 * k, 0, 7); c.fillStyle = P.cl; c.fill(); });
      // разница прогноза и расчёта
      st.pred.forEach((v, t) => { if (v == null) return; c.strokeStyle = rgba(P.ink3, 0.6); c.lineWidth = 1 * k; c.beginPath(); c.moveTo(X(t), Y(v)); c.lineTo(X(t), Y(F.G[t])); c.stroke(); });
    }
    // прогноз читателя: оранжевые точки
    c.strokeStyle = P.e2e; c.lineWidth = 2.4 * k; c.beginPath(); let pen = false;
    st.pred.forEach((v, t) => { if (v == null) { pen = false; return; } if (pen) c.lineTo(X(t), Y(v)); else c.moveTo(X(t), Y(v)); pen = true; }); c.stroke();
    st.pred.forEach((v, t) => { if (v == null) return; c.beginPath(); c.arc(X(t), Y(v), 4.2 * k, 0, 7); c.fillStyle = P.e2e; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1.2 * k; c.stroke(); });
    if (st.pred.every((v) => v == null)) {
      const cy = (b.T + yb) / 2;
      HeroKit.label(c, k, 'Проведи мышью или пальцем', (x0 + x1) / 2, cy - 10, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
      HeroKit.label(c, k, 'и нарисуй прогноз для каждого шага', (x0 + x1) / 2, cy + 10, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
    }
  }
  function render() {
    drawMap(); drawChart();
    const drawn = st.pred.filter((v) => v != null).length;
    setOut($('#fcStat'), `Прогноз нарисован на ${drawn} из ${n()} шагов`);
    if (st.shown && st.err) setOut($('#fcOut'), `Средняя ошибка прогноза — <b>${fmt(st.err.mae, 2)}</b>, больше всего на шаге ${st.err.at}: ${fmt(st.pred[st.err.at], 2)} против ${fmt(st.F.G[st.err.at], 2)} по формуле.`);
    else setOut($('#fcOut'), st.kind === 'steps' ? 'Награда −1 за каждый шаг, 0 за последний, γ = 1.' : `Награда +10 за въезд к плите, 0 за остальные шаги, γ = ${fmt(st.F.g, 1)}.`);
  }
  /** Поставить прогноз на шаге t (значение в единицах отдачи); между соседними касаниями — по прямой. */
  function put(t, v) {
    const [lo, hi] = RANGE[st.kind]; v = Math.max(lo, Math.min(hi, v));
    if (lastT != null && Math.abs(t - lastT) > 1 && st.pred[lastT] != null) { const a = lastT, va = st.pred[lastT], dir = Math.sign(t - a); for (let q = a + dir; q !== t; q += dir) st.pred[q] = va + (v - va) * (q - a) / (t - a); }
    st.pred[t] = v; lastT = t;
  }
  function pointer(e) {
    const cv = $('#fcCv'), r = cv.getBoundingClientRect(), b = box(), x = (e.clientX - r.left) / r.width * b.W, y = (e.clientY - r.top) / r.height * b.H;
    const t = Math.max(0, Math.min(n() - 1, Math.round((x - b.L) / ((b.W - b.L - b.R) / n()) - 0.5)));
    put(t, Yinv(y)); render(); if (ctl) ctl.update();
  }
  /** Прогноз целиком (для проверок): массив значений по шагам. */
  function setPred(arr) { st.pred = arr.map((v) => (v == null ? null : +v)); lastT = null; render(); }
  function compare() {
    const err = E.forecastError(st.pred, st.F.G);
    if (!err.missing) { st.shown = true; st.err = err; }
    render();
    return Promise.resolve({ kind: st.kind, mae: err.mae, at: err.at, worst: err.worst, missing: err.missing, G: st.F.G.slice(), pred: st.pred.slice(), tol: TOL[st.kind] });
  }
  const api = { reset() { setKind('g09'); }, state: () => ({ kind: st.kind, drawn: st.pred.filter((v) => v != null).length, n: n() }), compare, setPred, setKind, st, TOL };
  const tail = (r) => `Средняя ошибка твоего прогноза — ${fmt(r.mae, 2)}, больше всего на шаге ${r.at}.`;
  const fail = (r) => (r.missing ? 'Прогноз нарисован не на всех шагах: проведи по графику от шага 0 до шага 11.' : `Средняя ошибка — ${fmt(r.mae, 2)} при допуске ${fmt(r.tol, 1)}. Синие точки — расчёт; сильнее всего прогноз разошёлся на шаге ${r.at}: ${fmt(r.pred[r.at], 2)} против ${fmt(r.G[r.at], 2)}. Поправь прогноз и сравни ещё раз.`);
  const missions = [
    { short: 'γ = 0,9', title: 'Награда только у плиты', text: 'Ада получает +10, когда въезжает в клетку у плиты, за остальные шаги — 0, γ = 0,9. Нарисуй, какую отдачу она соберёт, начиная с каждого шага маршрута, и нажми «Сравнить с расчётом».',
      onEnter: (X) => X.setKind('g09'),
      action: { label: 'Сравнить с расчётом', run: (X) => X.compare() },
      criteria: [{ label: 'Прогноз нарисован на всех 12 шагах', test: (r) => !r.missing }, { label: 'Средняя ошибка не больше 0,4', test: (r) => r.mae <= TOL.g09 }],
      hint: 'Начни с конца. С последнего шага Ада получает +10 сразу. Шагом раньше — те же +10, но через шаг, с весом 0,9. Ещё шагом раньше — с весом 0,9 · 0,9.',
      fail,
      explain: (r) => `С последнего шага отдача равна ${fmt(r.G[11], 0)}: +10 приходит сразу. Шагом раньше она равна ${fmt(r.G[10], 0)}, двумя шагами раньше — ${fmt(r.G[9], 1)}: каждый шаг назад умножает отдачу на 0,9. У кровати, за 12 шагов до плиты, отдача равна ${fmt(r.G[0], 2)}, то есть 10 · 0,9¹¹. Кривая выгнута: у плиты она растёт быстрее, чем в начале пути. ${tail(r)}` },
    { short: 'γ = 0,5', title: 'Нетерпеливая Ада', text: 'Маршрут и награда те же, но γ = 0,5: награда через шаг весит вдвое меньше той же награды сейчас. Нарисуй прогноз заново.',
      onEnter: (X) => X.setKind('g05'),
      action: { label: 'Сравнить с расчётом', run: (X) => X.compare() },
      criteria: [{ label: 'Прогноз нарисован на всех 12 шагах', test: (r) => !r.missing }, { label: 'Средняя ошибка не больше 0,4', test: (r) => r.mae <= TOL.g05 }],
      hint: 'С последнего шага отдача по-прежнему +10. Шагом раньше она вдвое меньше, а ещё шагом раньше — ещё вдвое меньше.',
      fail,
      explain: (r) => `При γ = 0,5 вес награды падает вдвое за каждый шаг. С последнего шага отдача равна ${fmt(r.G[11], 0)}, шагом раньше — ${fmt(r.G[10], 0)}, двумя шагами раньше — ${fmt(r.G[9], 1)}, тремя — ${fmt(r.G[8], 2)}, а у кровати всего ${fmt(r.G[0], 3)}. Почти весь путь отдача близка к нулю: такая Ада замечает плиту, только когда до неё остаётся три-четыре шага. ${tail(r)}` },
    { short: 'Как у π*0.6', title: 'Минус один за каждый шаг', text: 'Теперь награда как у π*0.6 из урока 3.8: −1 за каждый шаг и 0 за последний, когда Ада въезжает к плите, дисконта нет, γ = 1. Нарисуй прогноз.',
      onEnter: (X) => X.setKind('steps'),
      action: { label: 'Сравнить с расчётом', run: (X) => X.compare() },
      criteria: [{ label: 'Прогноз нарисован на всех 12 шагах', test: (r) => !r.missing }, { label: 'Средняя ошибка не больше 0,6', test: (r) => r.mae <= TOL.steps }],
      hint: 'Без дисконта отдача — просто сумма наград до конца. Посчитай, сколько раз по −1 Ада ещё получит с каждого шага.',
      fail,
      explain: (r) => `Без дисконта отдача равна сумме оставшихся наград: у кровати ${fmt(r.G[0], 0)}, на шаге 6 ${fmt(r.G[6], 0)}, с последнего шага ${fmt(r.G[11], 0)}, и точки ложатся на прямую. Это минус число шагов, которые остаются до последнего, — именно такую ценность учит предсказывать функция ценности π*0.6, только по картинкам с камер, а за неудачу у неё ещё большой штраф. ${tail(r)}` },
  ];
  function init() {
    const cv = $('#fcCv');
    cv.addEventListener('pointerdown', (e) => { if (e.button > 0 || st.busy) return; drawing = true; lastT = null; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } pointer(e); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (drawing) pointer(e); });
    const end = () => { drawing = false; lastT = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    $('#fcClear').addEventListener('click', () => { st.pred = new Array(n()).fill(null); st.shown = false; st.err = null; render(); if (ctl) ctl.update(); });
    st.pred = new Array(n()).fill(null);
    ctl = mountMissions('#fcMis', missions, api, { scene: '#fcCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: итерация ценности в квартире Ады
   ===================================================================== */
const VI = (() => {
  const CS = 40, DEFW = { goal: 10, puddle: -1, step: 0 };
  const pane = (g) => ({ g, V: new Float64Array(E.N), k: 0, delta: null, changed: 0, conv: false, lastCells: [], lastK: 0 });
  const st = { w: Object.assign({ dry: true }, DEFW), panes: [pane(0.9), pane(0.99)], right: false, busy: false, sel: null, selPane: 0, hover: null, hoverPane: 0, ada: [null, null], mode: 'wave' };
  let ctl = null, Wc = null;
  const world = () => Wc || (Wc = E.world(st.w));
  function setW(o) { Object.assign(st.w, o); Wc = null; }
  function zero(p) { Object.assign(p, pane(p.g)); }
  function step(p) {
    const r = E.viSweep(world(), p.V, p.g), ch = [];
    for (const s of E.FREE) if (Math.abs(r.V[s] - p.V[s]) > 1e-12) ch.push(s);
    p.V = r.V; p.k++; p.delta = r.delta; p.changed = ch.length; p.conv = r.delta < 1e-9;
    if (ch.length) { p.lastCells = ch; p.lastK = p.k; }
    return p;
  }
  function converge(p) { zero(p); for (let i = 0; i < 5000 && !p.conv; i++) step(p); }
  /** Стрелки по текущим оценкам: лучшее действие, если в клетке действия не все равны. */
  function arrows(p) {
    const W = world(), pi = new Int8Array(E.N).fill(-1);
    for (const s of E.FREE) {
      if (s === E.GOAL) continue; let best = -Infinity, worst = Infinity, ba = -1;
      for (let a = 0; a < 4; a++) { const q = E.qOf(W, p.V, p.g, s, a); if (q > best + 1e-12) { best = q; ba = a; } worst = Math.min(worst, q); }
      if (best - worst > 1e-12) pi[s] = ba;
    }
    return pi;
  }
  const routeOf = (p) => E.rollout(world(), arrows(p), p.g, E.START, 60);
  const small = (v) => (v === 0 ? '0' : Math.abs(v) >= 0.01 ? fmt(v, 2) : v.toLocaleString('ru-RU', { maximumSignificantDigits: 2 }).replace('-', '−'));
  function info(i) {
    const p = st.panes[i], ro = routeOf(p);
    return { g: p.g, puddle: ro.done && ro.puddle, done: ro.done, steps: ro.steps, vStart: p.V[E.START], ret: ro.ret, k: p.k, conv: p.conv };
  }
  function drawPane(i) {
    const cv = $(i ? '#viCvR' : '#viCvL'); if (i && !st.right) return;
    const { c, k } = HeroKit.fit(cv, E.NX * CS, E.NY * CS), P = pal(), p = st.panes[i], ro = routeOf(p);
    const cellPx = (cv.getBoundingClientRect().width || 480) / E.NX;
    let ada = st.ada[i];
    if (!ada) { const [x, y] = Plan.centre(E.START, CS), a = ro.cells.length > 1 ? E.DX.findIndex((d, q) => E.START + d + E.DY[q] * E.NX === ro.cells[1]) : 1; ada = [x, y, Math.atan2(E.DY[a], E.DX[a])]; }
    const sel = st.sel != null && st.selPane === i ? st.sel : st.hover != null && st.hoverPane === i ? st.hover : null;
    Plan.draw(c, k, P, { CS, V: p.V, vmax: Math.max(1, st.w.goal), numbers: cellPx >= 40 && p.k > 0, arrows: arrows(p), route: ro.cells.length > 1 ? ro.cells : null, puddle: !st.w.dry, sel, ada, names: cellPx >= 30 });
    if (p.k === 0 && !st.busy) {
      const cx = 6 * CS, cy = 3 * CS, bw = Math.min(E.NX * CS - 20, 250 * k), bh = 50 * k;
      c.fillStyle = rgba(P.surf, 0.92); c.strokeStyle = P.line; c.lineWidth = 1 * k; c.beginPath(); c.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8 * k); c.fill(); c.stroke();
      HeroKit.label(c, k, 'все оценки пока равны нулю', cx, cy - 10 * k, { px: 12.5, weight: 700, color: P.ink2, halo: false });
      HeroKit.label(c, k, st.mode === 'free' ? 'нажми «Одна итерация»' : st.right ? 'нажми кнопку в миссии' : 'запусти итерации в миссии', cx, cy + 10 * k, { px: 12, weight: 600, color: P.ink3, halo: false });
    }
  }
  function stat(i) {
    const el = $(i ? '#viStatR' : '#viStatL'), p = st.panes[i], ro = routeOf(p);
    let t = `Оценка у кровати: <b>${small(p.V[E.START])}</b>`;
    if (ro.done) t += ` · маршрут <b>${nWord(ro.steps, 'шаг', 'шага', 'шагов')}</b>${st.w.dry ? '' : ro.puddle ? ', <b>через лужу</b>' : ', <b>в объезд лужи</b>'}`;
    else t += p.k ? ' · до кровати оценка ещё не дошла' : '';
    setOut(el, t); el.className = 'pane-stat' + (ro.done && !st.w.dry ? (ro.puddle ? ' bad' : ' ok') : '');
  }
  function heads() {
    const L = st.panes[0], R = st.panes[1];
    $('#viHeadL').textContent = st.mode === 'wave' ? `γ = ${fmt(L.g, 1)}` : `γ = ${fmt(L.g, 2)}${L.g === 0.5 ? ' · нетерпеливая' : ''}`;
    $('#viHeadR').textContent = `γ = ${fmt(R.g, 2)}${R.g === 0.99 ? ' · дальновидная' : ''}`;
    const sub = st.w.dry ? 'лужи нет' : `плита ${sgn(st.w.goal, 0)}, лужа ${fmt(st.w.puddle, 1)}${st.w.step ? `, шаг ${fmt(st.w.step, 2)}` : ''}`;
    setOut($('#viSubL'), sub); setOut($('#viSubR'), sub);
  }
  function iterLine() {
    const ps = st.right ? [0, 1] : [0];
    const one = (i) => { const p = st.panes[i], who = st.right ? `${i ? 'Ада 2' : 'Ада 1'}, γ = ${fmt(p.g, 2)}: ` : ''; if (!p.k) return `${who}итераций ещё не было`; return `${who}итерация <b>${p.k}</b> · изменилось ${nWord(p.changed, 'клетка', 'клетки', 'клеток')} · наибольшее изменение ${small(p.delta)}${p.conv ? ' · <b>оценки сошлись</b>' : ''}`; };
    setOut($('#viIter'), ps.map(one).join('<br>'));
  }
  function readout() {
    const s = st.sel != null ? st.sel : st.hover, i = st.sel != null ? st.selPane : st.hoverPane;
    if (s == null || s === E.GOAL) { setOut($('#viOut'), s === E.GOAL ? 'Клетка у плиты: здесь эпизод кончается, ценность равна 0 — наград дальше нет. +10 Ада получает за въезд сюда.' : (matchMedia('(hover: none)').matches ? 'Нажми на клетку' : 'Наведи курсор на клетку или нажми на неё') + ' — здесь появится её пересчёт по уравнению Беллмана.'); return; }
    const p = st.panes[i], W = world(), qs = [0, 1, 2, 3].map((a) => ({ a, t: E.next(s, a), r: E.reward(W, s, a) }));
    qs.forEach((x) => { x.v = x.t === E.GOAL ? 0 : p.V[x.t]; x.q = x.r + p.g * x.v; });
    const best = Math.max(...qs.map((x) => x.q)), worst = Math.min(...qs.map((x) => x.q));
    const li = qs.map((x) => `<li class="${x.q === best && best > worst ? 'best' : ''}">${E.ANAME[x.a]}: ${x.t === s ? 'стена, Ада стоит · ' : ''}${fmt(x.r, x.r % 1 ? 2 : 0)} + ${fmt(p.g, 2)} × ${small(x.v)} = ${small(x.q)}${x.q === best && best > worst ? ' ← наибольшее' : ''}</li>`).join('');
    const what = p.conv ? 'оценки сошлись, и пересчёт по уравнению Беллмана даёт ту же V' : p.k ? 'пересчёт по уравнению Беллмана, r + γ · V(соседа) по текущим оценкам; наибольшее станет оценкой клетки на следующей итерации' : 'пересчёт по уравнению Беллмана по нулевым оценкам; наибольшее станет оценкой клетки на первой итерации';
    setOut($('#viOut'), `<b>${cellName(s)}, ${placeOf(s)}</b>${st.right ? (i ? ', Ада 2' : ', Ада 1') : ''}: сейчас V = ${small(p.V[s])} (итерация ${p.k}), ${what}:<ul class="bell">${li}</ul>`);
  }
  function render() { heads(); drawPane(0); drawPane(1); stat(0); if (st.right) stat(1); iterLine(); readout(); $$('#wrapViStep button').forEach((b) => { b.disabled = st.busy; }); }
  /** Проехать маршрутами: Ада в каждой панели движется по своим стрелкам. */
  async function drive(idx) {
    const routes = idx.map((i) => routeOf(st.panes[i]).cells), len = Math.max(...routes.map((r) => r.length)), F = 6;
    for (let q = 0; q < len - 1; q++) for (let f = 1; f <= F; f++) {
      idx.forEach((i, n) => { const r = routes[n], a = r[Math.min(q, r.length - 1)], b = r[Math.min(q + 1, r.length - 1)], [x0, y0] = Plan.centre(a, CS), [x1, y1] = Plan.centre(b, CS), e = f / F; st.ada[i] = [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, a === b ? (st.ada[i] ? st.ada[i][2] : 0) : Math.atan2(y1 - y0, x1 - x0)]; });
      drawPane(0); drawPane(1); await wait(26);
    }
  }
  const doorVals = (g) => { const W = world(); return { via: E.pathReturn(W, E.VIA_SINK, g).G, around: E.pathReturn(W, E.AROUND, g).G }; };
  const TH = {};   // пороги для разбора миссии 3: считаются один раз
  function thresholds() {
    if (!TH.p) { TH.p = E.threshold((x) => E.viaPuddle({ puddle: -x }, 0.99), 0, 3); TH.c = E.threshold((x) => E.viaPuddle({ step: -x }, 0.99), 0, 2); TH.R = E.threshold((x) => E.viaPuddle({ goal: x }, 0.99), 1, 100); }
    return TH;
  }
  function syncSliders() {
    const g = $('#viGoal'), pu = $('#viPuddle'), sp = $('#viStep'), gl = $('#viGL'), gr = $('#viGR');
    g.value = st.w.goal; syncRange(g, sgn(st.w.goal, 0)); pu.value = st.w.puddle; syncRange(pu, fmt(st.w.puddle, 1)); sp.value = st.w.step; syncRange(sp, fmt(st.w.step, 2));
    gl.value = st.panes[0].g; syncRange(gl, fmt(st.panes[0].g, 2)); gr.value = st.panes[1].g; syncRange(gr, fmt(st.panes[1].g, 2));
  }
  /** Сравнение рядом: две Ады с лужей, оценки до сходимости. */
  function setupCmp(gL, gR, keepW) {
    if (!keepW) setW(Object.assign({ dry: false }, DEFW));
    st.right = true; st.ada = [null, null]; st.panes[0].g = gL; st.panes[1].g = gR; converge(st.panes[0]); converge(st.panes[1]); syncSliders(); render();
  }
  const api = {
    reset() { st.mode = 'wave'; st.right = false; st.sel = null; st.hover = null; st.ada = [null, null]; setW(Object.assign({ dry: true }, DEFW)); st.panes[0].g = 0.9; st.panes[1].g = 0.99; zero(st.panes[0]); zero(st.panes[1]); syncSliders(); render(); },
    state() { return { L: info(0), R: st.right ? info(1) : null, w: Object.assign({}, st.w), busy: st.busy, mode: st.mode }; },
    render, st, info, thresholds, doorVals,
    /** Миссия 1: итерации по одной, пока оценки не перестанут меняться. */
    async wave() {
      st.mode = 'wave'; st.right = false; st.ada = [null, null]; setW(Object.assign({ dry: true }, DEFW)); const p = st.panes[0]; p.g = 0.9; zero(p); st.busy = true; render();
      let reach = -1;
      try {
        while (!p.conv && p.k < 300) { step(p); if (reach < 0 && p.V[E.START] !== 0) reach = p.k; render(); await wait(360); }
        st.busy = false; render(); await drive([0]);
      } finally { st.busy = false; }
      const ro = routeOf(p), far = p.lastCells.slice().sort((a, b) => a - b)[0];
      render();
      return { reach, dist: ro.steps, last: p.lastK, iters: p.k, vStart: p.V[E.START], converged: p.conv, far, farPlace: placeOf(far) };
    },
    /** Миссия 2: γ = 0,5 и γ = 0,99 рядом, с лужей. */
    async compare() {
      st.mode = 'cmp'; st.right = true; st.ada = [null, null]; setW(Object.assign({ dry: false }, DEFW)); st.panes[0].g = 0.5; st.panes[1].g = 0.99; zero(st.panes[0]); zero(st.panes[1]); syncSliders(); st.busy = true; render();
      try {
        while (!(st.panes[0].conv && st.panes[1].conv)) { st.panes.forEach((p) => { if (!p.conv) step(p); }); render(); await wait(120); }
        st.busy = false; render(); await drive([0, 1]);
      } finally { st.busy = false; }
      render();
      return { L: info(0), R: info(1), dL: doorVals(0.5), dR: doorVals(0.99) };
    },
    setupCmp,
    /** Ползунки наград и γ (свободный режим и миссия 3): оценки сразу до сходимости. */
    setRewards(o) { setW(o); st.panes.forEach((p, i) => { if (i === 0 || st.right) converge(p); }); st.ada = [null, null]; syncSliders(); render(); if (ctl) ctl.update(); },
    setGamma(i, g) { st.panes[i].g = Math.round(g * 100) / 100; converge(st.panes[i]); st.ada = [null, null]; syncSliders(); render(); if (ctl) ctl.update(); },
    stepOnce() { (st.right ? st.panes : [st.panes[0]]).forEach((p) => { if (!p.conv) step(p); }); st.ada = [null, null]; render(); if (ctl) ctl.update(); },
    async stepAll() { st.busy = true; render(); try { while (!(st.right ? st.panes : [st.panes[0]]).every((p) => p.conv)) { api.stepOnce(); await wait(90); } } finally { st.busy = false; render(); } },
    zeroAll() { (st.right ? st.panes : [st.panes[0]]).forEach(zero); st.ada = [null, null]; render(); },
    select(i, s) { st.sel = s; st.selPane = i; render(); },
  };
  const f2 = (v) => fmt(v, 2);
  const missions = [
    { short: 'Волна', title: 'Как ценность растекается от плиты', text: 'Лужи пока нет, γ = 0,9. Все оценки равны нулю. Нажми кнопку: движок будет пересчитывать все клетки по уравнению Беллмана, по одной итерации за раз, пока оценки не перестанут меняться. Следи за клеткой у кровати, где стоит Ада.',
      controls: [], onEnter: (X) => { if (st.mode !== 'wave') X.reset(); },
      bet: { q: 'через сколько итераций оценка клетки у кровати станет больше нуля?', options: ['Через одну: за итерацию пересчитываются все клетки сразу', 'Через столько, сколько шагов от Ады до плиты', 'Примерно через сотню: оценки уточняются понемногу'], answer: (r) => (r.reach === r.dist ? 1 : r.reach <= 1 ? 0 : 2) },
      action: { label: 'Запустить итерации', run: (X) => X.wave() },
      criteria: [{ label: 'Оценка клетки у кровати стала больше нуля', test: (r) => r.vStart > 0 }, { label: 'Оценки сошлись: за итерацию не изменилась ни одна', test: (r) => r.converged }],
      explain: (r) => `Оценка клетки у кровати стала больше нуля на итерации ${r.reach}, а от Ады до плиты как раз ${nWord(r.dist, 'шаг', 'шага', 'шагов')}. Каждая клетка берёт оценки соседей с прошлой итерации, поэтому весть о награде продвигается от плиты на одну клетку за итерацию. Дальше всех от плиты — клетка ${cellName(r.far)} ${placeIn(r.far)}: туда оценка дошла на итерации ${r.last}, и это было последнее изменение. Итерация ${r.iters} не изменила ничего — оценки сошлись. У кровати — ${f2(r.vStart)}, то есть 10 · 0,9¹¹, ровно как отдача с первого шага в прогнозе. Стрелки теперь из любой клетки ведут к плите кратчайшим путём.` },
    { short: 'Лужа', title: 'Нетерпеливая и дальновидная', text: 'У мойки пролили воду: въезд в эту клетку стоит −1, колёса могут проскользнуть. Короткий путь к плите идёт мимо мойки, объезд вокруг кухонного стола на два шага длиннее. Ада 1 считает с γ = 0,5, Ада 2 — с γ = 0,99, награды у них одинаковые. Нажми кнопку: для каждой посчитаются оценки до сходимости, и Ада поедет по своим стрелкам.',
      controls: ['right'], onEnter: (X) => { st.mode = 'cmp'; st.right = true; setW(Object.assign({ dry: false }, DEFW)); st.panes[0].g = 0.5; st.panes[1].g = 0.99; zero(st.panes[0]); zero(st.panes[1]); st.ada = [null, null]; syncSliders(); X.render(); },
      bet: { q: 'как поедут две Ады?', options: ['Обе объедут лужу: штраф для обеих одинаковый', 'Нетерпеливая объедет: лужа близко, а плита далеко. Дальновидная поедет через лужу, чтобы быстрее получить +10', 'Нетерпеливая поедет через лужу, дальновидная объедет'], answer: (r) => (r.L.puddle && !r.R.puddle ? 2 : !r.L.puddle && r.R.puddle ? 1 : 0) },
      action: { label: 'Посчитать обе и отправить Аду', run: (X) => X.compare() },
      criteria: [{ label: 'Маршруты разошлись: одна Ада едет через лужу, другая в объезд', test: (r) => r.L.puddle !== r.R.puddle }],
      explain: (r) => `Ада 1 ${r.L.puddle ? 'едет через лужу' : 'объезжает лужу'}, ${nWord(r.L.steps, 'шаг', 'шага', 'шагов')}, Ада 2 — ${r.R.puddle ? 'через лужу' : 'вокруг стола'}, ${nWord(r.R.steps, 'шаг', 'шага', 'шагов')}. Обе считают одно и то же, отдачу, но с разным γ. За кухонной дверью маршруты расходятся. Нетерпеливой Аде путь мимо мойки стоит там ${f2(r.dL.via)}: −1 за лужу через два шага, с весом 0,25, и +10 через три, с весом 0,125. Объезд — всего ${f2(r.dL.around)}: плита на два шага дальше, и её вес падает ещё вчетверо. У дальновидной — ${f2(r.dR.via)} против ${f2(r.dR.around)}: два лишних шага срезают 2% награды, а лужа отнимает почти целый балл. Сравни оценки у кровати: ${small(r.L.vStart)} слева и ${f2(r.R.vStart)} справа. Нетерпеливая Ада плиту почти не видит, но её стрелки всё равно ведут к плите: решение зависит от того, у какого соседа оценка выше, а не от самих чисел.` },
    { short: 'Цена лужи', title: 'Когда и дальновидной выгодно через лужу', text: 'Ползунки под сценой меняют награды; оценки сразу пересчитываются до сходимости. Не трогая γ, сделай так, чтобы дальновидная Ада 2 поехала через лужу.',
      controls: ['right', 'rew'], onEnter: () => { st.mode = 'live'; if (!st.right || st.panes[0].g !== 0.5 || st.panes[1].g !== 0.99 || !st.panes[1].conv) setupCmp(0.5, 0.99, st.w.dry === false); },
      criteria: [{ label: 'Ада с γ = 0,99 едет через лужу', test: (r, s) => !!(s && s.R && s.R.puddle) }],
      hint: 'Дальновидной Аде два лишних шага стоят около 2% награды у плиты. Сделай лужу дешевле этой доли или каждый шаг — дороже.',
      explain: (s) => { const t = thresholds(); return `Сейчас лужа стоит ${fmt(s.w.puddle, 1)}, каждый шаг — ${fmt(s.w.step, 2)}, плита даёт ${sgn(s.w.goal, 0)}, и дальновидная Ада едет через лужу. С наградой +10 и без штрафа за шаг так бывает, когда лужа дешевле ${fmt(t.p, 3)}: столько при γ = 0,99 стоят два лишних шага, 10 · 0,99 · (1 − 0,99²). Штраф за шаг дороже ${fmt(t.c, 2)} делает невыгодным весь объезд. А награда у плиты почти не помогает: два лишних шага стоят долю от неё, и при луже −1 порог — ${fmt(t.R, 1)}, далеко за краем ползунка. ${s.L.puddle ? 'Нетерпеливая Ада 1 едет через лужу при любых этих настройках: для неё объезд всегда дорог.' : ''}`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй награды и γ обеих Ад, пересчитывай оценки по одной итерации или до сходимости, обнуляй и смотри, как волна идёт заново. Найди с наградами по умолчанию наименьший γ у Ады 2, при котором Ада ещё объезжает лужу.', final: true,
      controls: ['right', 'rew', 'gamma', 'step'], onEnter: () => { st.mode = 'free'; if (!st.right) setupCmp(0.5, 0.99); } },
  ];
  function init() {
    legend('#viLegend', [['Ада у кровати, откуда она едет', 'var(--ink)', 'ada'], ['клетка у плиты: +10, эпизод кончается', 'var(--good)', 'goal'], ['лужа у мойки: штраф за въезд', 'var(--hybrid)', 'puddle'], ['оценка ценности клетки: чем темнее, тем больше', 'var(--classic)', 'heat'], ['отрицательная оценка', 'var(--critical)', 'heat-neg'], ['лучшее действие по текущим оценкам', 'var(--ink-2)', 'arrow'], ['маршрут Ады по стрелкам', 'var(--e2e)'], ['стены', 'var(--ink-2)', 'wall'], ['мебель', 'var(--ink-3)', 'hatch']]);
    [['#viCvL', 0], ['#viCvR', 1]].forEach(([sel, i]) => {
      const cv = $(sel), at = (e) => { const r = cv.getBoundingClientRect(); return Plan.cellAt({ x: (e.clientX - r.left) / r.width * E.NX * CS, y: (e.clientY - r.top) / r.height * E.NY * CS }, CS); };
      cv.addEventListener('click', (e) => { const s = at(e); st.sel = s === st.sel && st.selPane === i ? null : s; st.selPane = i; render(); });
      cv.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const s = at(e); if (s !== st.hover || st.hoverPane !== i) { st.hover = s; st.hoverPane = i; render(); } });
      cv.addEventListener('pointerleave', () => { if (st.hover != null) { st.hover = null; render(); } });
    });
    $('#viGoal').addEventListener('input', (e) => api.setRewards({ goal: +e.target.value }));
    $('#viPuddle').addEventListener('input', (e) => api.setRewards({ puddle: Math.round(+e.target.value * 10) / 10 }));
    $('#viStep').addEventListener('input', (e) => api.setRewards({ step: Math.round(+e.target.value * 100) / 100 }));
    $('#viDef').addEventListener('click', () => api.setRewards(Object.assign({}, DEFW)));
    $('#viGL').addEventListener('input', (e) => api.setGamma(0, +e.target.value));
    $('#viGR').addEventListener('input', (e) => api.setGamma(1, +e.target.value));
    $('#viOne').addEventListener('click', () => { if (!st.busy) api.stepOnce(); });
    $('#viAll').addEventListener('click', () => { if (!st.busy) api.stepAll(); });
    $('#viZero').addEventListener('click', () => { if (!st.busy) api.zeroAll(); });
    syncSliders();
    ctl = mountMissions('#viMis', missions, api, { controls: { right: '#viPaneR', rew: '#wrapViRew', gamma: '#wrapViGamma', step: '#wrapViStep' }, scene: '#viDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: стрелки преимущества и улучшение политики
   ===================================================================== */
const AV = (() => {
  const CS = 40, g = 0.9, W = E.world({ dry: true }), HABIT = E.habitPolicy();
  const st = { pi: Int8Array.from(HABIT), ad: null, shown: false, sel: null, canEdit: false, busy: false, anyPos: false, lastSwitch: null, rounds: null };
  let ctl = null;
  const recompute = () => { st.ad = E.advantage(W, st.pi, g); };
  recompute();
  const base = E.rollout(W, HABIT, g, E.START, 80);
  const vStar = E.valueIteration(W, g).V[E.START];
  const routeNow = () => E.rollout(W, st.pi, g, E.START, 80);
  const posCount = () => { let n = 0; for (const s of E.FREE) if (s !== E.GOAL) for (let a = 0; a < 4; a++) if (st.ad.A[s * 4 + a] > 1e-9) n++; return n; };
  /** Наибольшее преимущество: среди клеток маршрута от кровати и среди всех клеток. */
  function bests() {
    const route = new Set(routeNow().cells); let onR = null, all = null;
    for (const s of E.FREE) { if (s === E.GOAL) continue; for (let a = 0; a < 4; a++) { const A = st.ad.A[s * 4 + a]; if (!all || A > all.A + 1e-12) all = { s, a, A }; if (route.has(s) && (!onR || A > onR.A + 1e-12)) onR = { s, a, A }; } }
    return { onR, all };
  }
  function draw() {
    const cv = $('#avCv'), { c, k } = HeroKit.fit(cv, E.NX * CS, E.NY * CS), P = pal(), ro = routeNow();
    const cellPx = (cv.getBoundingClientRect().width || 480) / E.NX;
    const a0 = ro.cells.length > 1 ? E.DX.findIndex((d, q) => E.START + d + E.DY[q] * E.NX === ro.cells[1]) : E.RIGHT, [ax, ay] = Plan.centre(E.START, CS);
    let amax = 1e-9; if (st.shown) for (const s of E.FREE) for (let a = 0; a < 4; a++) amax = Math.max(amax, Math.abs(st.ad.A[s * 4 + a]));
    Plan.draw(c, k, P, { CS, V: st.shown ? st.ad.V : null, vmax: 10, route: ro.cells.length > 1 ? ro.cells : null, sel: null, names: cellPx >= 30, ada: null });
    for (const s of E.FREE) {
      if (s === E.GOAL || s === E.START) continue;
      drawCell(c, k, P, s, amax);
    }
    drawCell(c, k, P, E.START, amax);
    drawAdaTop(c, ax, ay, Math.atan2(E.DY[a0], E.DX[a0]), CS * 0.24, P);
    if (st.sel != null) { const [i, j] = E.ij(st.sel); c.strokeStyle = P.ink; c.lineWidth = 2.4 * k; c.beginPath(); c.arc((i + 0.5) * CS, (j + 0.5) * CS, CS * 0.47, 0, 7); c.stroke(); }
    if (!ro.done && ro.cells.length) { const [x, y] = Plan.centre(ro.cells[ro.cells.length - 1], CS); HeroKit.label(c, k, 'стоп', x, y - CS * 0.42, { px: 10.5, weight: 700, color: P.bad, haloColor: P.surf }); }
  }
  /** Клетка: четыре треугольника преимущества у краёв и чёрная стрелка привычного действия. */
  function drawCell(c, k, P, s, amax) {
    const [x, y] = Plan.centre(s, CS);
    if (st.shown) for (let a = 0; a < 4; a++) {
      const A = st.ad.A[s * 4 + a], dx = E.DX[a], dy = E.DY[a], m = Math.sqrt(Math.min(1, Math.abs(A) / amax));
      const pos = A > 1e-9, col = pos ? rgba(P.good, 0.55 + 0.45 * m) : A < -1e-9 ? rgba(P.bad, 0.18 + 0.45 * m) : rgba(P.ink3, 0.35);
      const tip = CS * (pos ? 0.49 : 0.46), bse = CS * (pos ? 0.27 : 0.33), hw = CS * (pos ? 0.16 : 0.1);
      c.beginPath(); c.moveTo(x + dx * tip, y + dy * tip); c.lineTo(x + dx * bse - dy * hw, y + dy * bse + dx * hw); c.lineTo(x + dx * bse + dy * hw, y + dy * bse - dx * hw); c.closePath(); c.fillStyle = col; c.fill();
    }
    const a = st.pi[s]; if (a < 0) return;
    const dx = E.DX[a], dy = E.DY[a], x0 = x - dx * CS * 0.12, y0 = y - dy * CS * 0.12, x1 = x + dx * CS * 0.24, y1 = y + dy * CS * 0.24, hd = CS * 0.1;
    for (const [col, lw] of [[P.surf, 5.5 * k], [P.ink, 2.4 * k]]) {
      c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.beginPath(); c.moveTo(x1 + dx * hd * 0.6, y1 + dy * hd * 0.6); c.lineTo(x1 - dx * hd * 0.5 - dy * hd, y1 - dy * hd * 0.5 + dx * hd); c.lineTo(x1 - dx * hd * 0.5 + dy * hd, y1 - dy * hd * 0.5 - dx * hd); c.closePath();
      if (col === P.surf) { c.lineJoin = 'round'; c.stroke(); } else { c.fillStyle = col; c.fill(); }
    }
  }
  function panel() {
    const box = $('#avCell'), s = st.sel; box.innerHTML = '';
    if (s == null) { box.append(h('div', { class: 'av-note' }, 'Нажми на клетку плана: здесь появятся её четыре действия.')); return; }
    if (s === E.GOAL) { box.append(h('div', { class: 'av-h' }, `${cellName(s)}, клетка у плиты`), h('div', { class: 'av-note' }, 'Здесь эпизод кончается: действий нет, ценность 0.')); return; }
    box.append(h('div', { class: 'av-h' }, `${cellName(s)} ${placeIn(s)}: привычно — ${E.ANAME[st.pi[s]]}${st.shown ? `, V = ${fmt(st.ad.V[s], 2)}` : ''}`));
    const row = h('div', { class: 'av-acts', role: 'group', 'aria-label': 'Действия в выбранной клетке' });
    for (let a = 0; a < 4; a++) {
      const A = st.ad.A[s * 4 + a], Q = st.ad.Q[s * 4 + a], cls = !st.shown ? '' : A > 1e-9 ? 'pos' : A < -1e-9 ? 'neg' : '';
      const b = h('button', { type: 'button', class: cls, 'data-a': a, 'aria-pressed': String(st.pi[s] === a), disabled: !st.canEdit || st.busy || null },
        h('b', null, E.ARROW[a]), h('span', null, E.ANAME[a] + (st.pi[s] === a ? ' · привычно' : '')),
        st.shown ? h('span', { class: 'q' }, `Q = ${fmt(Q, 2)}`) : null, st.shown ? h('span', { class: 'a' }, `A = ${Math.abs(A) < 5e-3 ? '0' : sgn(A, 2)}`) : null);
      b.addEventListener('click', () => api.choose(s, a));
      row.append(b);
    }
    box.append(row);
    box.append(h('div', { class: 'av-note' }, !st.shown ? 'Числа появятся после расчёта в первой миссии.' : st.canEdit ? 'Нажми на действие, чтобы сделать его привычным в этой клетке.' : 'Менять действия вручную можно во второй миссии и в свободном режиме.'));
  }
  function render() {
    draw(); panel();
    const ro = routeNow(), el = $('#avStat');
    if (ro.done) setOut(el, `Маршрут от кровати: <b>${nWord(ro.steps, 'шаг', 'шага', 'шагов')}</b>, отдача <b>${fmt(ro.ret, 2)}</b>`);
    else setOut(el, `Ада не доезжает до плиты: упирается в стену в клетке ${cellName(ro.cells[ro.cells.length - 1])}, отдача <b>0</b>`);
    el.className = 'pane-stat' + (ro.done && Math.abs(ro.ret - vStar) < 1e-9 ? ' ok' : '');
    $('#avHead').textContent = st.rounds ? `После ${nWord(st.rounds.length, 'раунда', 'раундов', 'раундов')} улучшения` : Array.from(st.pi).some((a, s) => a !== HABIT[s]) ? 'Ада после переключений' : 'Привычная Ада';
    setOut($('#avSub'), `γ = 0,9 · лужи нет · плита +10`);
    const out = st.shown ? `Действий лучше привычного, с A &gt; 0: <b>${posCount()}</b>.${st.rounds ? ` Раунды: переключено ${st.rounds.map((r) => r.changed).join(', ')} клеток.` : ''}` : 'Преимущество ещё не посчитано: видны только привычные действия.';
    setOut($('#avOut'), out);
    $$('#wrapAvFree button').forEach((b) => { b.disabled = st.busy; });
  }
  const api = {
    reset() { st.pi = Int8Array.from(HABIT); recompute(); st.shown = false; st.sel = null; st.canEdit = false; st.anyPos = false; st.lastSwitch = null; st.rounds = null; render(); },
    state() { const ro = routeNow(); return { ret: ro.done ? ro.ret : 0, done: ro.done, steps: ro.steps, base: base.ret, anyPos: st.anyPos, npos: posCount(), shown: st.shown, last: st.lastSwitch }; },
    render, st, base, vStar,
    /** Миссия 1: оценить привычную политику и посчитать преимущество. */
    async compute() {
      st.busy = true; render(); await wait(250);
      st.pi = Int8Array.from(HABIT); recompute(); st.shown = true; st.busy = false; render();
      let zero = true; for (const s of E.FREE) if (s !== E.GOAL && Math.abs(st.ad.A[s * 4 + st.pi[s]]) > 1e-12) zero = false;
      const b = bests();
      return { habitZero: zero, npos: posCount(), onR: b.onR, all: b.all, steps: base.steps, ret: base.ret };
    },
    /** Сменить привычное действие в клетке s на a. */
    choose(s, a) {
      if (!st.canEdit || st.busy || s == null || s === E.GOAL) return;
      const A = st.ad.A[s * 4 + a], before = routeNow(), Vb = st.ad.V.slice();
      st.pi[s] = a; recompute();
      const after = routeNow(); let worse = 0; for (const q of E.FREE) if (st.ad.V[q] < Vb[q] - 1e-9) worse++;
      st.lastSwitch = { s, a, A, before: before.done ? before.ret : 0, after: after.done ? after.ret : 0, worse };
      if (A > 1e-9) st.anyPos = true;
      render(); if (ctl) ctl.update();
    },
    /** Один раунд: в каждой клетке — действие с наибольшим положительным преимуществом. */
    round() { const imp = E.improve(W, st.pi, g); st.pi = imp.pi; recompute(); st.shown = true; render(); return imp.changed; },
    /** Миссия 3: раунды от привычной Ады, пока улучшать есть что. */
    async iterate() {
      st.busy = true; st.pi = Int8Array.from(HABIT); recompute(); st.shown = true; st.rounds = []; render();
      const rets = [routeNow().ret]; let startOptAt = null;
      try {
        for (let r = 0; r < 50; r++) {
          await wait(650);
          const imp = E.improve(W, st.pi, g); if (!imp.changed) break;
          st.pi = imp.pi; recompute(); st.rounds.push({ changed: imp.changed });
          const ro = routeNow(); rets.push(ro.done ? ro.ret : 0); if (startOptAt == null && ro.done && Math.abs(ro.ret - vStar) < 1e-9) startOptAt = st.rounds.length;
          render();
        }
      } finally { st.busy = false; render(); }
      const ro = routeNow();
      return { rounds: st.rounds.length, changes: st.rounds.map((x) => x.changed), rets, ret: ro.ret, steps: ro.steps, vStar, npos: posCount(), startOptAt };
    },
    resetPolicy() { st.pi = Int8Array.from(HABIT); recompute(); st.rounds = null; render(); },
    select(s) { st.sel = s; render(); },
  };
  const missions = [
    { short: 'Привычка', title: 'Сколько стоит привычный маршрут', text: 'Толстые стрелки — привычные действия Ады. Нажми кнопку: движок оценит, сколько Ада наберёт из каждой клетки, если будет ездить как обычно, и посчитает преимущество каждого из четырёх действий в каждой клетке.',
      onEnter: () => { st.canEdit = false; },
      bet: { q: 'какое преимущество окажется у привычного действия в клетке?', options: ['Наибольшее из четырёх: Ада ведь его и выбирает', 'Ноль', 'Отрицательное: привычка хуже лучшего действия'], answer: (r) => (r.habitZero ? 1 : 0) },
      action: { label: 'Посчитать преимущество', run: (X) => X.compute() },
      criteria: [{ label: 'У привычного действия в каждой клетке A = 0', test: (r) => r.habitZero }],
      explain: (r) => `Во всех 70 клетках у привычного действия A = 0: ценность V — это и есть отдача, когда Ада делает привычное действие, и Q этого действия с ней совпадает. Зелёных стрелок — ${r.npos}: столько действий лучше привычных. На маршруте от кровати самая яркая — в клетке ${cellName(r.onR.s)} ${placeIn(r.onR.s)}: «${E.ANAME[r.onR.a]}» с A = ${sgn(r.onR.A, 2)}. Оттуда Ада срезала бы путь мимо стола, а не ехала вдоль стены. Ещё ярче стрелки там, где Ада упирается в стену и стоит: там V = 0, и любое действие, выводящее на маршрут, лучше привычного. Сильнее всего — в клетке ${cellName(r.all.s)} ${placeIn(r.all.s)}: «${E.ANAME[r.all.a]}», A = ${sgn(r.all.A, 2)}. Привычный маршрут — ${nWord(r.steps, 'шаг', 'шага', 'шагов')}, отдача от кровати ${fmt(r.ret, 2)}.` },
    { short: 'Одна клетка', title: 'Переключи одно действие', text: 'Выбери на маршруте Ады клетку с зелёной стрелкой: нажми на клетку, потом под сценой — на действие с положительным A. Оно станет привычным в этой клетке, а Ада везде, кроме неё, будет ездить как раньше.',
      onEnter: () => { st.canEdit = true; st.anyPos = false; if (!st.shown) { st.shown = true; } api.resetPolicy(); },
      criteria: [{ label: 'Привычное действие заменено на действие с A &gt; 0', test: (r, s) => !!(s && s.anyPos) }, { label: 'Отдача от кровати выросла', test: (r, s) => !!(s && s.done && s.ret > s.base + 1e-9) }],
      hint: 'На маршруте зелёные стрелки — в гостиной: сразу за дверью спальни и у верхней стены. Клетки, где Ада не ездит, на отдачу от кровати не влияют.',
      explain: (s) => `Отдача от кровати выросла с ${fmt(s.base, 2)} до ${fmt(s.ret, 2)}, маршрут — ${nWord(s.steps, 'шаг', 'шага', 'шагов')} вместо 18. Ада по-прежнему ездит как обычно везде, кроме одной клетки, и этого хватило. Так бывает всегда: по теореме об улучшении политики переход на действие с положительным преимуществом не уменьшает ценность ни в одной клетке${s.last && s.last.worse === 0 ? ' — и правда, ни одна оценка не упала' : ''}. Стрелки пересчитались: теперь преимущество считается относительно новой привычки.` },
    { short: 'Все клетки', title: 'Улучшать, пока есть что', text: 'Начнём снова с привычной Ады. В каждой клетке переключим привычное действие на действие с наибольшим положительным A, заново оценим ценности и пересчитаем стрелки — это один раунд. Раунды идут, пока зелёных стрелок не останется.',
      onEnter: () => { st.canEdit = false; st.rounds = null; st.pi = Int8Array.from(HABIT); recompute(); st.shown = true; render(); },
      bet: { q: 'сколько раундов понадобится?', options: ['Один: после него в каждой клетке уже выбрано лучшее', 'Несколько: после переключения меняются ценности, и находятся новые улучшения', 'Десятки, как итераций ценности'], answer: (r) => (r.rounds === 1 ? 0 : r.rounds >= 12 ? 2 : 1) },
      action: { label: 'Улучшать по раундам', run: (X) => X.iterate() },
      criteria: [{ label: 'Зелёных стрелок не осталось', test: (r) => r.npos === 0 }, { label: 'Отдача от кровати — как у итерации ценности', test: (r) => Math.abs(r.ret - r.vStar) < 1e-9 }],
      explain: (r) => `Раундов с переключениями — ${r.rounds}: ${r.changes.join(', ')} клеток. Отдача от кровати по раундам: ${r.rets.map((v) => fmt(v, 2)).join(' → ')}. Уже после раунда ${r.startOptAt} маршрут от кровати стал кратчайшим, ${nWord(r.steps, 'шаг', 'шага', 'шагов')}, но в нижней спальне и в нижних частях гостиной и кухни стрелки ещё менялись: улучшения доходили туда раунд за раундом, от клеток, которые уже вели к плите. После раунда ${r.rounds} зелёных стрелок нет. Отдача от кровати — ${fmt(r.ret, 2)}, как у итерации ценности: итерация политики пришла к той же оптимальной политике, только через преимущества.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай действия в любых клетках, улучшай по раунду или верни привычную Аду. Найди у привычной Ады клетку маршрута, где лучшее действие обгоняет привычное сильнее всего, и проверь, сколько раундов нужно, если начать с твоих переключений.', final: true,
      controls: ['free'], onEnter: () => { st.canEdit = true; render(); } },
  ];
  function init() {
    legend('#avLegend', [['привычное действие в клетке', 'var(--ink)', 'arrow'], ['действие лучше привычного: A > 0', 'var(--good)', 'arrow'], ['действие хуже привычного: A < 0', 'var(--critical)', 'arrow'], ['так же, как привычное: A = 0', 'var(--ink-3)', 'arrow'], ['ценность клетки при привычной езде', 'var(--classic)', 'heat'], ['маршрут Ады от кровати', 'var(--e2e)'], ['клетка у плиты', 'var(--good)', 'goal'], ['выбранная клетка', 'var(--ink)', 'ring'], ['стены', 'var(--ink-2)', 'wall'], ['мебель', 'var(--ink-3)', 'hatch']]);
    const cv = $('#avCv');
    cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(), s = Plan.cellAt({ x: (e.clientX - r.left) / r.width * E.NX * CS, y: (e.clientY - r.top) / r.height * E.NY * CS }, CS); st.sel = s === st.sel ? null : s; render(); });
    $('#avRound').addEventListener('click', () => { if (!st.busy) { api.round(); if (ctl) ctl.update(); } });
    $('#avReset').addEventListener('click', () => { if (!st.busy) api.resetPolicy(); });
    ctl = mountMissions('#avMis', missions, api, { controls: { free: '#wrapAvFree' }, scene: '#avCv' });
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
/** Числа квиза — из движка: те же, что в лабораториях. */
function quizData() {
  const F = E.forecast('g09'), Wd = E.world({ dry: true }), vi = E.valueIteration(Wd, 0.9), rounds = E.policyIteration(Wd, E.habitPolicy(), 0.9);
  return [
    { q: 'Награда и отдача — одно и то же?', o: ['Да, это два названия одного числа', 'Нет: награда приходит за один шаг, отдача — сумма будущих наград с весами γ в степени номера шага', 'Нет: отдача — это награда в конце эпизода'], a: 1, e: `+10 у плиты — награда за один шаг. Отдача у кровати при γ = 0,9 — ${fmt(F.G[0], 2)}: те же +10, но через 12 шагов.` },
    { q: 'Чтобы шахматная программа играла лучше, стоит награждать её и за взятые фигуры?', o: ['Да, это ускорит обучение', 'Нет: награда должна говорить, чего добиться, а не как, иначе программа научится брать фигуры ценой партии', 'Нет, награда в шахматах вообще не нужна'], a: 1, e: 'Пример Саттона и Барто. У ANYmal похожая ловушка: неограниченный штраф за ошибку делал выгодным упасть и закончить эпизод.' },
    { q: 'Чем ближе γ к 1, тем лучше?', o: ['Да: агент учитывает всё будущее', 'Не всегда: γ меняет само поведение, а слишком большой γ замедляет обучение; его подбирают под задачу', 'Нет, лучше всего γ = 0,5'], a: 1, e: 'В квартире Ады с γ = 0,5 и 0,99 выбраны разные маршруты. Авторы ANYmal подбирали γ для каждой задачи и предупреждают, что слишком большой γ может замедлить сходимость.' },
    { q: 'За одну итерацию ценности пересчитываются все клетки. Значит, после первой итерации ценность известна везде?', o: ['Да', 'Нет: за итерацию весть о награде продвигается на одну клетку, до кровати — 12 итераций', 'Нет: нужно по одной итерации на каждую клетку квартиры, то есть 70'], a: 1, e: `Каждая клетка берёт оценки соседей с прошлой итерации. Оценка у кровати стала ненулевой на итерации ${E.firstNonzero(vi.hist, E.START)}, последняя клетка изменилась на итерации ${E.lastChange(vi.hist)}.` },
    { q: 'У Ады детерминированная политика. Какое преимущество у действия, которое она обычно выбирает?', o: ['Наибольшее из всех действий', 'Ноль: ценность и есть отдача при привычном действии', 'Отрицательное'], a: 1, e: 'A = Q − V, а V совпадает с Q привычного действия. Положительное преимущество бывает только у других действий — тех, что лучше привычки.' },
    { q: 'Ада сменила действие в одной клетке на действие с положительным преимуществом. Может ли от этого стать хуже в других клетках?', o: ['Да, другие клетки на это не рассчитаны', 'Нет: по теореме об улучшении политики новая политика не хуже старой ни в одном состоянии', 'Может, если клетка далеко от цели'], a: 1, e: `Итерация политики повторяет это для всех клеток: привычная Ада дошла до отдачи ${fmt(rounds[rounds.length - 1].startV, 2)} у кровати за ${nWord(rounds.length - 1, 'раунд', 'раунда', 'раундов')} с переключениями, и ни на одном раунде отдача не падала.` },
    { q: 'Итерация ценности — это и есть обучение с подкреплением на роботе?', o: ['Да, это основной метод RL на роботах', 'Нет: это планирование по известной модели — переходам и наградам; методы RL оценивают ценность по опыту', 'Нет: итерация ценности не использует награды'], a: 1, e: 'Саттон и Барто называют её динамическим программированием и подчёркивают, что ей нужна точная модель среды. DQN учит Q без модели, по выборкам из игры.' },
    { q: 'Зачем ε-жадной стратегии случайные действия, если лучшее действие уже известно?', o: ['Незачем, это просто шум', 'Лучшим оно кажется по текущим оценкам; не пробуя другие, агент может так и не узнать о лучшем варианте', 'Чтобы робот двигался плавнее'], a: 1, e: 'У Саттона и Барто жадная стратегия нашла лучший из десяти вариантов лишь примерно в трети задач. DQN начинала с ε = 1 и снижала до 0,1.' },
  ];
}
function initQuiz() { renderQuiz('#quizBox', quizData(), '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('forecast', () => { mis.forecast = Forecast.init(); });
    safe('vi', () => { mis.vi = VI.init(); });
    safe('av', () => { mis.av = AV.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['fcMis', 'viMis', 'avMis'].reduce((s, id) => s + $$('#' + id + ' .g-steps li span').filter((x) => x.textContent !== 'Свободно').length, 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l51 = { mis, SPEED, Forecast, VI, AV, BACKUP, L51: E }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
