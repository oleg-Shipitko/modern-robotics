/* =====================================================================
   ui-l83.js — урок 8.3 «Надёжность». Схемы и лаборатории:
   0) анимированные схемы (shared/anim.js): сто заказов проходят цепочку
      шагов и редеют; что происходит после шага — детектор, повтор,
      человек, тихий отказ; как KnowNo решает, действовать или спросить;
   1) лаборатория «Сто латте»: две версии Ады на одних и тех же заказах —
      без проверки и с проверкой и повтором;
   2) лаборатория «Порог детектора»: день работы, гистограммы оценок,
      ложные тревоги, пропуски, вызовы человека и MTBI;
   3) лаборатория «Сколько запусков»: 40 проверок по n латте подряд,
      доля пройденных проверок и правило трёх;
   4) квиз.
   Движок — l83/engine.js (без DOM).
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
/** Проценты без лишних нулей: 95%, 99,9%, 99,95%. */
const pctS = (x, d) => (x * 100).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 2 : d }) + '%';
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
/** Минуты по-человечески: «18,8 мин», «30 с», «2 ч 30 мин». */
function fmtMin(m) {
  if (!isFinite(m)) return 'нет вызовов';
  if (m < 1) return fmt(m * 60, 0) + ' с';
  if (m < 60) return fmt(m, m < 10 ? 1 : 0) + ' мин';
  const h = Math.floor(m / 60), r = Math.round(m - h * 60);
  return h + ' ч' + (r ? ' ' + r + ' мин' : '');
}

/* ---------- маленькие рисунки, общие для схем и сцен ---------- */
/** Чашка латте: x, y — центр, s — размер. fill — цвет напитка (или null — пустой контур). */
function cupIcon(c, x, y, s, line, fill, cupFill) {
  const w = s, h = s * 0.82, x0 = x - w / 2, y0 = y - h / 2;
  c.lineWidth = Math.max(1, s * 0.09); c.strokeStyle = line; c.lineJoin = 'round';
  c.beginPath(); c.arc(x0 + w * 0.98, y0 + h * 0.45, h * 0.24, -Math.PI / 2, Math.PI / 2); c.stroke();
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + w * 0.86, y0); c.lineTo(x0 + w * 0.76, y0 + h); c.lineTo(x0 + w * 0.1, y0 + h); c.closePath();
  c.fillStyle = cupFill || 'transparent'; if (cupFill) c.fill();
  if (fill) { c.save(); c.clip(); c.fillStyle = fill; c.fillRect(x0, y0 + h * 0.16, w, h); c.restore(); }
  c.stroke();
}
/** Ада спереди: голова с экраном, корпус, руки, стойка и колёсная платформа (ног нет). x — центр, yb — низ колёс, s — масштаб. */
function adaFront(c, x, yb, s, P, dark) {
  const fillB = dark ? '#2a2926' : '#f4efe6', edge = dark ? '#b0afa6' : '#3d3c38';
  c.save(); c.translate(x, yb); c.scale(s, s);
  c.lineWidth = 2.2; c.strokeStyle = edge; c.fillStyle = fillB;
  // колёса и платформа
  for (const wx of [-13, 13]) { c.beginPath(); c.arc(wx, -8, 8, 0, 7); c.fillStyle = dark ? '#444' : '#55534d'; c.fill(); }
  c.fillStyle = fillB; c.beginPath(); c.roundRect(-22, -30, 44, 18, 8); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-5, -44, 10, 16, 3); c.fill(); c.stroke();
  // корпус и руки
  c.beginPath(); c.roundRect(-18, -86, 36, 44, 10); c.fill(); c.stroke();
  c.lineCap = 'round'; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(-18, -78); c.lineTo(-27, -56); c.moveTo(18, -78); c.lineTo(27, -56); c.stroke();
  // голова
  c.lineWidth = 2.2; c.beginPath(); c.roundRect(-17, -114, 34, 26, 9); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-12, -109, 24, 16, 6); c.fillStyle = '#1f2430'; c.fill();
  c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(-5, -101, 2, 3, 0, 0, 7); c.ellipse(5, -101, 2, 3, 0, 0, 7); c.fill();
  c.restore();
}

/* =====================================================================
   0а. Схема: сто заказов проходят восемь шагов по 95% (и сто шагов по 99%)
   ===================================================================== */
(() => {
  const T = 14, N8 = 8, CHIP = ['чашка', 'под машину', 'эспрессо', 'молоко', 'вспенить', 'влить', 'взять', 'подать'];
  const left = (i) => Math.round(100 * L83.ipow(0.95, i));   // сколько в среднем ещё без ошибок после i шагов
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, lab, alpha, rect, line } = A;
    // ---- верх: латте, 8 шагов
    const fa = seg(u, 0.3, 6.2), xs = g.xs, x0 = g.x0, x1 = g.x1, yc = g.yA, th = g.thA;
    lab(c, k, g.narrow ? 'Латте: 8 шагов по 95%' : 'Латте: 8 шагов, каждый удаётся в 95% случаев', g.tx, g.tyA, { px: g.narrow ? 11.5 : 12.5, weight: 700, color: P.ink, align: 'left', halo: false });
    const front = x0 + (x1 - x0) * fa;
    // полоса заказов без ошибок: толщина — доля оставшихся
    const pts = [[x0, 100]]; xs.forEach((x, i) => { pts.push([x, left(i)]); pts.push([x + 0.01, left(i + 1)]); }); pts.push([x1, left(N8)]);
    c.beginPath(); let first = true;
    for (const [x, v] of pts) { if (x > front) break; const y = yc - th * v / 200; if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
    let vf = 100; for (const [x, v] of pts) if (x <= front) vf = v;
    c.lineTo(front, yc - th * vf / 200); c.lineTo(front, yc + th * vf / 200);
    for (let i = pts.length - 1; i >= 0; i--) { const [x, v] = pts[i]; if (x > front) continue; c.lineTo(x, yc + th * v / 200); }
    c.closePath(); c.fillStyle = alpha(P.good, 0.35); c.fill(); c.strokeStyle = P.good; c.lineWidth = 1.4; c.stroke();
    // шаги и стопки испорченных
    xs.forEach((x, i) => {
      const on = front >= x;
      rect(c, x - g.chipW / 2, g.chipY, g.chipW, 20, 6, on ? alpha(P.mot, 0.16) : P.surf2, on ? P.mot : P.line, 1.2);
      lab(c, k, g.narrow ? String(i + 1) : CHIP[i], x, g.chipY + 10, { px: g.narrow ? 10 : 9.5, weight: 650, color: on ? P.ink : P.ink3, halo: false });
      if (on) {
        const lost = left(i) - left(i + 1), sq = g.sq;
        for (let j = 0; j < lost; j++) { const cx = x - sq - 1 + (j % 2) * (sq + 2), cy = g.chipY + 26 + Math.floor(j / 2) * (sq + 2); rect(c, cx, cy, sq, sq, 1.5, P.bad, null); }
        const xm = (x + (i < N8 - 1 ? xs[i + 1] : x1)) / 2;
        lab(c, k, String(left(i + 1)), xm, yc - th * left(i + 1) / 200 - 9, { px: 10, weight: 700, color: P.ink2, haloColor: P.surf2 });
      }
    });
    lab(c, k, '100', (x0 + xs[0]) / 2, yc - th / 2 - 9, { px: 10, weight: 700, color: P.ink2, haloColor: P.surf2 });
    if (fa >= 1) { if (g.narrow) lab(c, k, `итог ≈ ${left(N8)} из 100`, g.endX, g.tyA, { px: 11, weight: 750, color: P.good, align: 'right', halo: false }); else { lab(c, k, `≈ ${left(N8)} из 100`, g.endX, g.endYA, { px: 12, weight: 750, color: P.good, align: 'left', haloColor: P.surf2 }); lab(c, k, 'без ошибок', g.endX, g.endYA + 15, { px: 10, weight: 600, color: P.ink2, align: 'left', haloColor: P.surf2 }); } }
    if (g.narrow) lab(c, k, 'красные квадраты — испорченные латте', 12, 176, { px: 9.5, color: P.bad, align: 'left', halo: false });
    else { lab(c, k, 'красные квадраты —', 616, 140, { px: 9.5, color: P.bad, align: 'left', halo: false }); lab(c, k, 'испорченные заказы', 616, 153, { px: 9.5, color: P.bad, align: 'left', halo: false }); }
    // ---- низ: 100 шагов по 99%
    const fb = seg(u, 7.0, 12.4), yB = g.yB, thB = g.thB, bx0 = g.bx0, bx1 = g.bx1, X = (s) => bx0 + (bx1 - bx0) * s / 100;
    lab(c, k, g.narrow ? 'Уборка: 100 шагов по 99%' : 'Уборка стола: 100 шагов, каждый удаётся в 99% случаев', g.tx, g.tyB, { px: g.narrow ? 11.5 : 12.5, weight: 700, color: P.ink, align: 'left', halo: false });
    const sMax = Math.floor(100 * fb), top = [], bot = [];
    for (let s = 0; s <= sMax; s++) { const v = 100 * L83.ipow(0.99, s); top.push([X(s), yB - thB * v / 200]); bot.push([X(s), yB + thB * v / 200]); }
    if (top.length > 1) {
      c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); for (let i = bot.length - 1; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]); c.closePath();
      c.fillStyle = alpha(P.good, 0.35); c.fill(); c.strokeStyle = P.good; c.lineWidth = 1.2; c.stroke();
    }
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); for (let s = 0; s <= 100; s += 5) { const x = X(s); c.moveTo(x, yB + thB / 2 + 6); c.lineTo(x, yB + thB / 2 + (s % 25 ? 10 : 14)); } c.stroke();
    for (const s of [0, 25, 50, 75, 100]) lab(c, k, s ? `шаг ${s}` : 'старт', X(s), yB + thB / 2 + 24, { px: 9.5, color: P.ink3, halo: false });
    for (const s of [25, 50, 75]) if (sMax >= s) lab(c, k, String(Math.round(100 * L83.ipow(0.99, s))), X(s), yB - thB * L83.ipow(0.99, s) / 2 - 9, { px: 10, weight: 700, color: P.ink2, haloColor: P.surf2 });
    if (fb >= 1) { if (g.narrow) lab(c, k, `итог ≈ ${Math.round(100 * L83.ipow(0.99, 100))} из 100`, g.endX, g.tyB, { px: 11, weight: 750, color: P.good, align: 'right', halo: false }); else { lab(c, k, `≈ ${Math.round(100 * L83.ipow(0.99, 100))} из 100`, g.endX, g.endYB, { px: 12, weight: 750, color: P.good, align: 'left', haloColor: P.surf2 }); lab(c, k, 'без ошибок', g.endX, g.endYB + 15, { px: 10, weight: 600, color: P.ink2, align: 'left', haloColor: P.surf2 }); } }
  }
  const wide = { narrow: false, tx: 16, tyA: 20, x0: 24, x1: 604, xs: Array.from({ length: 8 }, (_, i) => 84 + i * 70), yA: 76, thA: 54, chipY: 112, chipW: 62, sq: 5, endX: 616, endYA: 70, endAlign: 'left', tyB: 206, yB: 254, thB: 40, bx0: 30, bx1: 604, endYB: 248 };
  const narrowL = { narrow: true, tx: 12, tyA: 18, x0: 16, x1: 344, xs: Array.from({ length: 8 }, (_, i) => 44 + i * 40), yA: 76, thA: 56, chipY: 116, chipW: 30, sq: 5, endX: 348, endYA: 0, endAlign: 'right', tyB: 236, yB: 290, thB: 44, bx0: 22, bx1: 338, endYB: 0 };
  Anim.add('funnel', {
    W: 720, H: 320, start: 13.5, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); },
    narrow: { W: 360, H: 350, draw(c, k, t, P, A) {
      draw(c, k, t, P, A, narrowL);
      A.lab(c, k, '1 чашка · 2 под кофемашину · 3 эспрессо · 4 молоко', 12, 192, { px: 9.5, color: P.ink3, align: 'left', halo: false });
      A.lab(c, k, '5 вспенить · 6 влить · 7 взять · 8 подать', 12, 206, { px: 9.5, color: P.ink3, align: 'left', halo: false });
    } },
  });
})();

/* =====================================================================
   0б. Схема: что происходит после шага — детектор, повтор, человек, тихий отказ
   ===================================================================== */
(() => {
  const SEG = 0.62, HOLD = 1.3;
  /** Четыре случая: узлы пути и исход каждой попытки шага. */
  const CASES = [
    { nodes: ['step', 'det', 'next'], res: ['ok'], title: 'Случай 1: шаг удался, детектор молчит', short: '1: шаг удался' },
    { nodes: ['step', 'det', 'retry', 'step', 'det', 'next'], res: ['fail', 'ok'], title: 'Случай 2: шаг сорвался, тревога, повтор исправил', short: '2: тревога, повтор помог' },
    { nodes: ['step', 'det', 'retry', 'step', 'det', 'retry', 'step', 'det', 'human'], res: ['fail', 'fail', 'fail'], title: 'Случай 3: три попытки подряд сорвались — громкий отказ', short: '3: повторы не помогли' },
    { nodes: ['step', 'det', 'spoil'], res: ['fail'], title: 'Случай 4: шаг сорвался, а детектор промолчал — тихий отказ', short: '4: детектор промолчал' },
  ];
  const durOf = (cs) => (cs.nodes.length - 1) * SEG + HOLD;
  const T = CASES.reduce((a, cs) => a + durOf(cs), 0);
  function draw(c, k, t, P, A, g) {
    const { seg, ease, lab, rect, arrow, line, alpha } = A, WARN = HeroKit.css('--warning');
    let u = ((t % T) + T) % T, ci = 0; while (u >= durOf(CASES[ci])) { u -= durOf(CASES[ci]); ci++; }
    const cs = CASES[ci], si = Math.min(cs.nodes.length - 1, Math.floor(u / SEG)), fr = ease(seg(u - si * SEG, 0.15, SEG - 0.05));
    const atEnd = u >= (cs.nodes.length - 1) * SEG;
    // сколько раз уже прошли узел «шаг» — номер попытки и её исход
    let tries = 0; for (let j = 0; j <= Math.min(si, cs.nodes.length - 1); j++) if (cs.nodes[j] === 'step') tries++;
    const res = cs.res[Math.max(0, tries - 1)];
    const cur = cs.nodes[si], nxt = cs.nodes[Math.min(si + 1, cs.nodes.length - 1)];
    const B = g.box, col = { step: P.mot, det: P.out, retry: P.mot, next: P.good, human: WARN, spoil: P.bad };
    const hot = (id) => (atEnd ? cs.nodes[cs.nodes.length - 1] === id : cur === id || (fr > 0.6 && nxt === id));
    // рёбра
    for (const e of g.edges) {
      const used = cs.nodes.some((n, j) => j < cs.nodes.length - 1 && n === e.a && cs.nodes[j + 1] === e.b);
      const c0 = e.b === 'spoil' ? P.bad : used ? P.ink2 : alpha(P.ink3, 0.55);
      for (let j = 0; j < e.pts.length - 2; j++) line(c, [e.pts[j], e.pts[j + 1]], c0, used ? 1.8 : 1.3, e.dash ? [5, 4] : null);
      const p1 = e.pts[e.pts.length - 2], p2 = e.pts[e.pts.length - 1];
      if (e.dash) { line(c, [p1, p2], c0, used ? 1.8 : 1.3, [5, 4]); arrow(c, p2[0] - (p2[0] - p1[0]) * 0.01, p2[1] - (p2[1] - p1[1]) * 0.01, p2[0], p2[1], c0, 0.1, 7); }
      else arrow(c, p1[0], p1[1], p2[0], p2[1], c0, used ? 1.8 : 1.3, 7);
      if (e.lab) lab(c, k, e.lab, e.lx, e.ly, { px: g.narrow ? 9 : 10, weight: 600, color: e.b === 'spoil' ? P.bad : P.ink2, align: e.la || 'center', haloColor: P.surf2 });
    }
    // блоки
    for (const id of Object.keys(B)) {
      const b = B[id], h = hot(id);
      rect(c, b[0], b[1], b[2], b[3], 9, alpha(col[id], h ? 0.2 : 0.07), col[id], h ? 2.4 : 1.3);
      lab(c, k, g.title[id], b[0] + b[2] / 2, b[1] + (g.narrow ? 15 : 18), { px: g.narrow ? 10.5 : 11.5, weight: 750, color: col[id] === P.good ? P.ink : col[id], halo: false });
      lab(c, k, g.sub[id], b[0] + b[2] / 2, b[1] + b[3] - (g.narrow ? 12 : 14), { px: g.narrow ? 9 : 9.5, color: P.ink2, halo: false });
    }
    // чашка: едет от узла к узлу
    const pa = g.at[cur], pb = g.at[nxt], s = atEnd ? 1 : fr;
    const x = pa[0] + (pb[0] - pa[0]) * s, y = pa[1] + (pb[1] - pa[1]) * s;
    const spoilt = res === 'fail' && cur !== 'retry' && !(cur === 'step' && !atEnd && s < 0.5);
    cupIcon(c, x, y, g.narrow ? 14 : 18, P.ink, spoilt ? P.bad : '#b98a5e', P.dark ? '#d9d6cc' : '#ffffff');
    if (spoilt) lab(c, k, '✗', x + (g.narrow ? 11 : 14), y - (g.narrow ? 9 : 11), { px: 11, weight: 800, color: P.bad, haloColor: P.surf2 });
    if (tries > 1 && !(atEnd && cs.nodes[cs.nodes.length - 1] === 'next')) lab(c, k, `попытка ${tries}`, x + (g.narrow ? 11 : 14), y + 1, { px: 9.5, weight: 750, color: P.mot, align: 'left', haloColor: P.surf2 });
    // подпись случая
    lab(c, k, g.narrow ? `Случай ${cs.short}` : cs.title, g.capX, g.capY, { px: g.narrow ? 11 : 12.5, weight: 750, color: P.ink, align: 'left', halo: false });
    CASES.forEach((q, j) => A.circle(c, g.dotX + j * 14, g.dotY, 4.2, j === ci ? P.ink : alpha(P.ink3, 0.4), null));
  }
  const wide = {
    narrow: false, capX: 16, capY: 18, dotX: 640, dotY: 18,
    box: { step: [30, 150, 140, 62], det: [250, 150, 140, 62], next: [520, 40, 176, 56], human: [520, 152, 176, 58], spoil: [520, 276, 176, 58], retry: [250, 286, 140, 54] },
    title: { step: 'шаг латте', det: 'детектор', next: 'следующий шаг', human: 'позвать человека', spoil: 'испорченный латте', retry: 'повтор шага' },
    sub: { step: 'Ада делает шаг', det: 'проверяет результат', next: 'шаг удался', human: 'громкий отказ', spoil: 'тихий отказ', retry: 'не больше двух раз' },
    at: { step: [100, 136], det: [320, 136], next: [608, 26], human: [608, 138], spoil: [608, 262], retry: [320, 272] },
    edges: [
      { a: 'step', b: 'det', pts: [[170, 181], [250, 181]] },
      { a: 'det', b: 'next', pts: [[390, 165], [450, 68], [520, 68]], lab: 'молчит', lx: 456, ly: 100, la: 'left' },
      { a: 'det', b: 'human', pts: [[390, 181], [520, 181]], lab: 'тревога после 2 повторов', lx: 455, ly: 168 },
      { a: 'det', b: 'retry', pts: [[320, 212], [320, 286]], lab: 'тревога', lx: 330, ly: 248, la: 'left' },
      { a: 'retry', b: 'step', pts: [[250, 313], [100, 313], [100, 212]] },
      { a: 'det', b: 'spoil', pts: [[390, 197], [450, 305], [520, 305]], dash: true, lab: 'молчит, а шаг сорвался', lx: 456, ly: 262, la: 'left' },
    ],
  };
  const narrowL = {
    narrow: true, capX: 12, capY: 16, dotX: 296, dotY: 16,
    box: { step: [16, 46, 150, 54], retry: [194, 46, 150, 54], det: [105, 150, 150, 54], next: [6, 300, 110, 56], human: [125, 300, 110, 56], spoil: [244, 300, 110, 56] },
    title: { step: 'шаг латте', det: 'детектор', next: 'дальше', human: 'человек', spoil: 'испорчен', retry: 'повтор' },
    sub: { step: 'Ада делает шаг', det: 'проверяет', next: 'шаг удался', human: 'громкий отказ', spoil: 'тихий отказ', retry: 'не больше 2 раз' },
    at: { step: [91, 34], retry: [269, 34], det: [180, 138], next: [61, 288], human: [180, 288], spoil: [299, 288] },
    edges: [
      { a: 'step', b: 'det', pts: [[91, 100], [150, 150]] },
      { a: 'det', b: 'retry', pts: [[210, 150], [269, 100]], lab: 'тревога', lx: 262, ly: 128, la: 'left' },
      { a: 'retry', b: 'step', pts: [[194, 66], [166, 66]] },
      { a: 'det', b: 'next', pts: [[150, 204], [61, 300]], lab: 'молчит', lx: 66, ly: 246, la: 'left' },
      { a: 'det', b: 'human', pts: [[180, 204], [180, 300]], lab: 'после 2 повторов', lx: 186, ly: 268, la: 'left' },
      { a: 'det', b: 'spoil', pts: [[210, 204], [299, 300]], dash: true, lab: 'молчит, а шаг сорвался', lx: 352, ly: 232, la: 'right' },
    ],
  };
  Anim.add('monitor', {
    W: 720, H: 380, start: 5.0, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); A.lab(c, k, 'Оранжевым — что делает Ада, синим — проверка, пунктиром — путь тихого отказа', 360, 366, { px: 10, color: P.ink3, halo: false }); },
    narrow: { W: 360, H: 400, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrowL); A.lab(c, k, 'оранжевым — Ада, синим — проверка', 180, 386, { px: 9.5, color: P.ink3, halo: false }); } },
  });
})();

/* =====================================================================
   0в. Схема: KnowNo — варианты, порог из калибровки, множество, вопрос
   ===================================================================== */
(() => {
  const EX = [
    { ask: '«Поставь миску в микроволновку»', items: [['пластиковая', '#7aa7d9'], ['металлическая', '#9a978d']],
      opts: [['пластиковую — в микроволновку', 0.44], ['металлическую — в микроволновку', 0.41], ['пластиковую — в контейнер для переработки', 0.08], ['металлическую — в мусор', 0.03]],
      q: 'Какую миску: пластиковую или металлическую?', a: '«Пластиковую»', act: 'Ада ставит пластиковую миску', thr: 0.21 },
    { ask: '«Дай мне яблоко»', items: [['яблоко', '#c9473b'], ['апельсин', '#e8963a']],
      opts: [['взять яблоко', 0.86], ['взять апельсин', 0.06], ['взять банан', 0.05], ['другое', 0.03]],
      q: null, a: null, act: 'Ада сама берёт яблоко', thr: 0.21 },
  ];
  const TE = 7.5, T = TE * EX.length;
  function bubble(c, k, A, x, y, w, h, text, col, P, px, lines) {
    A.rect(c, x, y, w, h, 10, A.alpha(col, 0.12), col, 1.4);
    (lines || [text]).forEach((s, i, arr) => A.lab(c, k, s, x + w / 2, y + h / 2 + (i - (arr.length - 1) / 2) * (px + 4), { px, weight: 650, color: P.ink, halo: false }));
  }
  function draw(c, k, t, P, A, g) {
    const { seg, ease, lab, rect, line, alpha, circle } = A;
    const u = ((t % T) + T) % T, ei = Math.floor(u / TE), v = u - ei * TE, ex = EX[ei];
    // слева: просьба и стол
    const L = g.left;
    lab(c, k, ei === 0 ? 'Пример из статьи' : 'Условный пример', L.x, L.y, { px: 10, weight: 700, color: P.ink3, align: 'left', halo: false });
    if (v > 0.2) bubble(c, k, A, L.x, L.y + 12, L.w, 34, ex.ask, P.ink3, P, g.narrow ? 10.5 : 11);
    const ty = L.y + 96; line(c, [[L.x, ty], [L.x + L.w, ty]], P.ink3, 2);
    ex.items.forEach(([name, col], j) => {
      const cx = L.x + L.w * (0.28 + 0.44 * j);
      if (ei === 0) { c.beginPath(); c.ellipse(cx, ty - 9, 20, 9, 0, 0, Math.PI); c.fillStyle = col; c.fill(); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.stroke(); line(c, [[cx - 20, ty - 9], [cx + 20, ty - 9]], P.ink2, 1.2); }
      else circle(c, cx, ty - 10, 9, col, P.ink2, 1.2);
      lab(c, k, name, cx, ty + 13, { px: 9.5, color: P.ink2, halo: false });
    });
    // середина: варианты и оценки
    const M = g.mid, sc = (s) => M.bw * s, grow = ease(seg(v, 0.8, 2.4)), thrOn = seg(v, 2.6, 3.3), setOn = seg(v, 3.5, 4.1);
    lab(c, k, 'варианты модели и их оценки', M.x, M.y, { px: 10, weight: 700, color: P.ink3, align: 'left', halo: false });
    const inSet = ex.opts.map((o) => o[1] >= ex.thr);
    if (thrOn > 0) {
      const xt = M.x + sc(ex.thr), y0 = M.y + 26, y1 = M.y + 18 + 4 * M.row;
      c.globalAlpha = thrOn; line(c, [[xt, y0], [xt, y1]], P.out, 2, [5, 4]);
      lab(c, k, `порог ${fmt(ex.thr, 2)} из калибровки`, xt + 4, y1 + 8, { px: 9.5, weight: 700, color: P.out, align: 'left', halo: false }); c.globalAlpha = 1;
    }
    ex.opts.forEach(([text, s], j) => {
      const y = M.y + 18 + j * M.row, on = setOn > 0 && inSet[j];
      lab(c, k, `${String.fromCharCode(65 + j)}) ${text}`, M.x, y + 6, { px: g.narrow ? 9.5 : 10.5, weight: on ? 750 : 600, color: on ? P.ink : P.ink2, align: 'left', haloColor: P.surf2 });
      rect(c, M.x, y + 14, Math.max(1.5, sc(s) * grow), 10, 3, on ? P.mot : alpha(P.mot, 0.45), null);
      if (grow > 0.95) lab(c, k, fmt(s, 2), M.x + sc(s) + 6, y + 19, { px: 9.5, weight: 650, color: P.ink2, align: 'left', halo: false });
    });
    // справа: множество и решение
    const R = g.right, n = inSet.filter(Boolean).length;
    if (setOn > 0) {
      c.globalAlpha = setOn;
      lab(c, k, `в множестве: ${n} ${n === 1 ? 'вариант' : 'варианта'}`, R.x, R.y, { px: g.narrow ? 11 : 12, weight: 750, color: n > 1 ? HeroKit.css('--warning') : P.good, align: 'left', halo: false });
      lab(c, k, n > 1 ? 'больше одного — спросить' : 'один — действовать', R.x, R.y + 17, { px: 10, color: P.ink2, align: 'left', halo: false });
      c.globalAlpha = 1;
    }
    const qOn = seg(v, 4.3, 4.9), aOn = seg(v, 5.4, 5.9), actOn = seg(v, ex.q ? 6.2 : 4.6, ex.q ? 6.7 : 5.2);
    if (ex.q && qOn > 0) { c.globalAlpha = qOn; adaFront(c, R.x + 20, R.y + R.qh + 64, 0.5, P, P.dark); bubble(c, k, A, R.x + 44, R.y + 34, R.w - 44, R.qh, '', P.mot, P, 10, g.narrow ? ['Какую миску: пластиковую', 'или металлическую?'] : ['Какую миску:', 'пластиковую', 'или металлическую?']); c.globalAlpha = 1; }
    if (ex.q && aOn > 0) { c.globalAlpha = aOn; bubble(c, k, A, R.x + 44, R.y + 44 + R.qh, R.w - 44, 28, `человек: ${ex.a}`, P.out, P, 10.5); c.globalAlpha = 1; }
    if (actOn > 0) { c.globalAlpha = actOn; lab(c, k, ex.act, R.x, R.y + (ex.q ? 92 + R.qh : 50), { px: 10.5, weight: 700, color: P.good, align: 'left', halo: false }); c.globalAlpha = 1; }
    EX.forEach((q, j) => circle(c, g.dotX + j * 14, g.dotY, 4.2, j === ei ? P.ink : alpha(P.ink3, 0.4), null));
  }
  const wide = { narrow: false, left: { x: 16, y: 40, w: 200 }, mid: { x: 240, y: 40, bw: 230, row: 46 }, right: { x: 520, y: 60, w: 190, qh: 52 }, dotX: 676, dotY: 18 };
  const narrowL = { narrow: true, left: { x: 12, y: 14, w: 336 }, mid: { x: 12, y: 150, bw: 280, row: 40 }, right: { x: 12, y: 350, w: 336, qh: 52 }, dotX: 312, dotY: 16 };
  Anim.add('knowno', {
    W: 720, H: 310, start: 6.9, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); A.lab(c, k, 'Оранжевым — оценки вариантов, синим — порог; варианты не ниже порога входят в множество', 360, 296, { px: 10, color: P.ink3, halo: false }); },
    narrow: { W: 360, H: 540, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrowL); A.lab(c, k, 'оранжевым — оценки, синим — порог', 180, 528, { px: 9.5, color: P.ink3, halo: false }); } },
  });
})();

/* =====================================================================
   1. Лаборатория: сто латте — без проверки и с проверкой и повтором
   ===================================================================== */
const Latte = (() => {
  const E = L83, K = HeroKit, PS = [0.9, 0.95, 0.98, 0.99, 0.995, 0.999, 0.9995, 0.9999];
  const st = { pi: 1, d: 0.9, R: 2, n: 8, right: false, ranL: false, ranR: false, anim: 1, busy: false };
  let ctl = null, resL = null, resR = null, tok = 0;
  const p = () => PS[st.pi];
  function compute() { resL = E.orders({ p: p(), n: st.n, d: 0, R: 0 }); resR = E.orders({ p: p(), n: st.n, d: st.d, R: st.R }); }
  const modelL = () => E.taskModel(p(), st.n, 0, 0), modelR = () => E.taskModel(p(), st.n, st.d, st.R);
  const W = 400, H = 430, X0 = 20, Y0 = 10, CELL = 36;
  function drawPane(side) {
    const cv = $('#lCv' + side), { c, k } = K.fit(cv, W, H), P = pal(), dark = K.dark();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const res = side === 'L' ? resL : resR, shown = side === 'L' ? st.ranL : st.right && st.ranR, upto = shown ? Math.round(st.anim * 100) : 0;
    const colOf = { ok: P.good, saved: P.good, loud: P.warn, silent: P.bad };
    for (let i = 0; i < 100; i++) {
      const cx = X0 + (i % 10) * CELL + CELL / 2, cy = Y0 + Math.floor(i / 10) * CELL + CELL / 2, r = CELL * 0.4;
      if (i >= upto) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.strokeStyle = P.line; c.lineWidth = 1.2; c.stroke(); continue; }
      const o = res.list[i].out, col = colOf[o];
      c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fillStyle = col; c.globalAlpha = o === 'ok' || o === 'saved' ? 0.85 : 0.95; c.fill(); c.globalAlpha = 1;
      if (o === 'saved') { c.beginPath(); c.arc(cx, cy, r + 1.5, 0, 7); c.strokeStyle = P.warn; c.lineWidth = 3.4; c.stroke(); }
      if (k < 1.6) cupIcon(c, cx - 1.5, cy + 0.5, CELL * 0.42, dark ? '#1c1b19' : '#ffffff', o === 'silent' ? null : (dark ? '#1c1b19' : '#ffffff'), null);
      if (o === 'silent') K.cross(c, cx + r * 0.62, cy - r * 0.62, 4.2, dark ? '#fff' : '#fff', 2.2);
      if (o === 'loud') K.label(c, k, '!', cx + r * 0.62, cy - r * 0.55, { px: 11, weight: 900, color: '#fff', halo: false });
    }
    if (side === 'R' && !st.right) { K.label(c, k, k > 1.5 ? 'появится в миссии 3' : 'Ада с проверкой появится в миссии 3', W / 2, 190, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); }
    else if (!shown) K.label(c, k, k > 1.5 ? 'нажми кнопку миссии' : 'сделай ставку и нажми кнопку миссии', W / 2, 190, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
    // шаги задачи и сколько раз каждый сорвался
    const ys = Y0 + 10 * CELL + 8;
    if (st.n <= 8) {
      const cw = (W - 2 * X0 - 7 * 4) / 8;
      for (let j = 0; j < st.n; j++) {
        const x = X0 + j * (cw + 4), f = res.per[j].fail;
        A_rect(c, x, ys, cw, 20, 6, P.bg, P.line);
        K.label(c, k, String(j + 1), x + cw / 2, ys + 10, { px: k > 1.5 ? 9 : 10.5, weight: 700, color: P.ink2, halo: false });
        if (shown && st.anim >= 1) K.label(c, k, f ? (k > 1.5 ? String(f) : `✗ ${f}`) : '—', x + cw / 2, ys + 34, { px: k > 1.5 ? 9 : 10.5, weight: 700, color: f ? P.bad : P.ink3, halo: false });
      }
    } else if (shown && st.anim >= 1) {
      const f = res.per.reduce((a, q) => a + q.fail, 0);
      K.label(c, k, `${st.n} шагов · сорвалось попыток: ${f}`, W / 2, ys + 18, { px: 11, weight: 650, color: P.ink2, halo: false });
    }
  }
  function A_rect(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  function statText(side) {
    const res = side === 'L' ? resL : resR, cn = res.cnt, shown = side === 'L' ? st.ranL : st.right && st.ranR;
    if (!shown || st.anim < 1) return [side === 'R' && !st.right ? 'Ещё не включена' : st.busy ? 'Ада готовит латте…' : 'Ещё не готовила', ''];
    const parts = [`<b>${cn.good} из 100 без ошибок</b>`];
    if (cn.saved) parts.push(`спасено повтором ${cn.saved}`);
    parts.push(`тихих ${cn.silent}`); if (side === 'R' || cn.loud) parts.push(`громких ${cn.loud}`);
    return [parts.join(' · '), cn.good >= 95 ? 'ok' : cn.good < 75 ? 'bad' : ''];
  }
  function render() {
    compute(); drawPane('L'); drawPane('R');
    for (const side of ['L', 'R']) { const [t, cls] = statText(side), el = $('#lStat' + side); setOut(el, t); el.className = 'pane-stat ' + cls; }
    $('#lDuo').children[1].classList.toggle('off', !st.right);
    setOut($('#lSubR'), st.R ? `замечает ${pctS(st.d, 0)} ошибок, до ${st.R} ${plural(st.R, 'повтора', 'повторов', 'повторов')}` : `замечает ${pctS(st.d, 0)} ошибок, без повторов`);
    setOut($('#lSubL'), `шаг удаётся в ${pctS(p())} · ${st.n} ${plural(st.n, 'шаг', 'шага', 'шагов')}`);
    $('#lP').value = st.pi; syncRange($('#lP'), pctS(p()));
    $('#lD').value = Math.round(st.d * 100); syncRange($('#lD'), pctS(st.d, 0));
    segSet('#lR', st.R); segSet('#lN', st.n);
    const mL = modelL(), mR = modelR();
    if (!st.ranL || (st.busy && st.anim < 1)) { setOut($('#lOut'), st.busy ? 'Ада готовит латте…' : 'Сделай ставку и приготовь латте — здесь появится расчёт по формуле.'); return; }
    setOut($('#lOut'), `По формуле при ${pctS(p())} на шаг и ${st.n} ${plural(st.n, 'шаге', 'шагах', 'шагах')}: без проверки задача удаётся в <b>${pctS(mL.ok, 1)}</b> случаев.` + (st.right && st.ranR ? ` С проверкой шаг удаётся в ${pctS(mR.step.ok, 2)}, задача — в <b>${pctS(mR.ok, 1)}</b>, тихие отказы — ${pctS(mR.silent, 1)}, громкие — ${pctS(mR.loud, 2)}.` : ''));
  }
  /** Показать заказы по одному за ~1,2 с. */
  function animate() {
    const my = ++tok; st.anim = 0; st.busy = true; render();
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => { if (my !== tok) return res(); st.anim = Math.min(1, (now - t0) / 1200); if (st.anim >= 1) { st.busy = false; render(); return res(); } drawPane('L'); drawPane('R'); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  function set(o) { tok++; st.anim = 1; st.busy = false; Object.assign(st, o); render(); if (ctl) ctl.update(); }
  function state() { const mL = modelL(), mR = modelR(); return { p: p(), d: st.d, R: st.R, n: st.n, right: st.right, ranL: st.ranL, ranR: st.ranR, L: resL.cnt, Rc: resR.cnt, mL: mL.ok, mR: mR.ok, busy: st.busy }; }
  const api = {
    reset() { set({ pi: 1, d: 0.9, R: 2, n: 8, right: false, ranL: false, ranR: false }); },
    state, render, st, set, PS,
    async cookL() { set({ pi: 1, n: 8, ranL: true }); await animate(); return { L: resL.cnt, m: modelL().ok, per: resL.per }; },
    async cookBoth() { set({ pi: 1, n: 8, d: 0.9, R: 2, right: true, ranL: true, ranR: true }); await animate(); return { L: resL.cnt, R: resR.cnt, step: modelR().step, m: modelR().ok }; },
  };
  const missions = [
    { short: '95%', title: 'Восемь шагов по 95%', text: 'Каждый шаг латте удаётся в 95% случаев. Левая Ада готовит 100 латте и ошибок не проверяет: после сорвавшегося шага она идёт дальше.',
      onEnter: (X) => X.set({ pi: 1, n: 8, right: false }),
      bet: { q: 'сколько латте из 100 выйдут без единой ошибки?', options: ['Около 95: каждый шаг почти всегда удаётся', 'Около 80', 'Около двух третей'], answer: (r) => (r.L.good >= 88 ? 0 : r.L.good >= 74 ? 1 : 2) },
      action: { label: 'Приготовить 100 латте', run: (X) => X.cookL() },
      criteria: [{ label: 'Сто заказов приготовлены', test: (r) => r.L.ok + r.L.saved + r.L.loud + r.L.silent === 100 }],
      explain: (r) => `Без ошибок — ${r.L.good} латте из 100; по формуле 0,95⁸ ≈ ${pctS(r.m, 1)}. Остальные ${r.L.silent} испорчены, и все отказы тихие: Ада не проверяла шаги и подала каждую чашку. Под сеткой видно, что сорвался не один «плохой» шаг — ошибки разбросаны по всем восьми, по ${Math.min(...r.per.map((q) => q.fail))}–${Math.max(...r.per.map((q) => q.fail))} на шаг.` },
    { short: 'Шаг', title: 'Сколько нужно на шаг', text: 'Двигай надёжность шага. Заказы те же, у каждой попытки то же случайное число, поэтому с ростом надёжности ошибки только исчезают. Найди надёжность шага, при которой в среднем выходит не меньше 99 латте из 100.',
      controls: ['p'], onEnter: (X) => X.set({ ranL: true, right: false }),
      criteria: [{ label: 'По формуле не меньше 99 латте из 100', test: (r, s) => s.n === 8 && s.mL >= 0.99 }, { label: 'На сцене не меньше 99 латте без ошибок', test: (r, s) => s.n === 8 && s.L.good >= 99 }],
      hint: 'Ошибка на одном шаге из восьми портит латте целиком. Если допустим один испорченный латте на сто, на каждый шаг остаётся примерно одна ошибка на восемьсот попыток.',
      explain: (r) => `Нужно ${pctS(r.p)} на шаг: по формуле задача удаётся в ${pctS(r.mL, 1)} случаев, на сцене — ${r.L.good} латте из 100. Это одна ошибка на тысячу движений. При 300 латте в день — в среднем ${fmt(300 * (1 - E.taskModel(0.999, 8, 0, 0).ok), 1)} испорченных ежедневно, и все тихие.` },
    { short: 'Повтор', title: 'Проверка и повтор', text: 'Справа — Ада, которая после каждого шага проверяет себя, замечает 90% своих ошибок и повторяет сорвавшийся шаг до двух раз. Слева — та же Ада без проверок. Надёжность шага снова 95%, заказы те же.',
      onEnter: (X) => X.set({ pi: 1, n: 8, d: 0.9, R: 2, right: true, ranR: false }),
      bet: { q: 'сколько латте без ошибок выйдет справа?', options: ['Около 70: повтор мало что меняет', 'Около 95', 'Все 100: каждая ошибка исправлена'], answer: (r) => (r.R.good >= 99 ? 2 : r.R.good >= 85 ? 1 : 0) },
      action: { label: 'Приготовить на обеих', run: (X) => X.cookBoth() },
      criteria: [{ label: 'Справа больше латте без ошибок, чем слева', test: (r) => r.R.good > r.L.good }, { label: 'Справа всё равно есть испорченные латте', test: (r) => r.R.silent + r.R.loud > 0 }],
      explain: (r) => `Слева ${r.L.good}, справа ${r.R.good} латте без ошибок: повтор спас ${r.R.saved} ${plural(r.R.saved, 'заказ', 'заказа', 'заказов')}. Шаг с проверкой и повтором удаётся в ${pctS(r.step.ok, 2)} случаев вместо 95%. Остались ${r.R.silent} ${plural(r.R.silent, 'испорченный латте', 'испорченных латте', 'испорченных латте')} — в каждом Ада не заметила ошибку, а незамеченную ошибку она не повторяет.${r.R.loud ? ` Громких отказов — ${r.R.loud}.` : ' Громких отказов нет: после трёх сорвавшихся попыток подряд Ада звала бы человека, но так не случилось ни разу.'}` },
    { short: 'Заметить', title: 'Сколько ошибок нужно замечать', text: 'Надёжность шага та же — 95%. Подбери долю замеченных ошибок и число повторов так, чтобы справа в среднем выходило не меньше 99 латте из 100.',
      controls: ['d', 'R'], onEnter: (X) => X.set({ pi: 1, n: 8, right: true, ranR: true, d: 0.9, R: 2 }),
      criteria: [{ label: 'Надёжность шага — 95%, восемь шагов', test: (r, s) => s.p === 0.95 && s.n === 8 }, { label: 'Справа по формуле не меньше 99 латте из 100', test: (r, s) => s.p === 0.95 && s.n === 8 && s.mR >= 0.99 }],
      hint: 'С одним повтором не выйдет при любой доле замеченных ошибок. Поставь два-три повтора и поднимай долю замеченных ошибок.',
      explain: (r) => `При ${pctS(r.d, 0)} замеченных ошибок и ${r.R} ${plural(r.R, 'повторе', 'повторах', 'повторах')} задача удаётся в ${pctS(r.mR, 1)} случаев, на сцене справа — ${r.Rc.good} латте. С двумя повторами нужно замечать не меньше ${pctS(minD(2), 0)} ошибок, с тремя — тоже ${pctS(minD(3), 0)}, а с одним повтором 99% недостижимы: даже при всех замеченных ошибках выходит ${pctS(E.taskModel(0.95, 8, 1, 1).ok, 1)}. Каждая незамеченная ошибка — тихий отказ, и повтор её не исправит.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Открыты все ручки, включая число шагов: 8 — латте, 100 — уборка стола после ужина. Найди, что выгоднее для задачи из 100 шагов: поднять надёжность шага с 99 до 99,9% или при 99% замечать 90% ошибок и повторять шаг дважды.',
      final: true, controls: ['p', 'd', 'R', 'n'], onEnter: (X) => X.set({ right: true, ranL: true, ranR: true }) },
  ];
  /** Наименьшая доля замеченных ошибок (с шагом 1%), при которой Ада с R повторами даёт 99% при 95% на шаг. */
  function minD(R) { for (let d = 0; d <= 100; d++) if (E.taskModel(0.95, 8, d / 100, R).ok >= 0.99) return d / 100; return null; }
  function init() {
    $('#lP').addEventListener('input', (e) => set({ pi: +e.target.value }));
    $('#lD').addEventListener('input', (e) => set({ d: +e.target.value / 100 }));
    segBind('#lR', (v) => set({ R: +v }));
    segBind('#lN', (v) => set({ n: +v }));
    compute();
    ctl = mountMissions('#lMis', missions, api, { controls: { p: '#wrapLP', d: '#wrapLD', R: '#wrapLR', n: '#wrapLN' }, scene: '#lDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, minD };
})();

/* =====================================================================
   2. Лаборатория: порог детектора — день работы, тревоги и пропуски
   ===================================================================== */
const Thresh = (() => {
  const E = L83, K = HeroKit, BINS = 40, NAMES = { sens: 'датчики', vlm: 'VLM по камере', both: 'оба детектора' };
  const st = { mode: 'sens', ti: 10, ran: false };
  let ctl = null, D = null;
  const cache = {}, hcache = {};
  const T = () => st.ti / 20;
  const day = () => (D || (D = E.day()));
  const kinds = () => { const k = { ok: 0, gross: 0, subtle: 0 }; for (const c of day().checks) k[c.kind]++; return k; };
  function res(mode, ti) { const key = mode + '|' + ti; return cache[key] || (cache[key] = E.judge(day(), ti / 20, mode)); }
  const cur = () => res(st.mode, st.ti);
  function hist(mode) { return hcache[mode] || (hcache[mode] = E.hist(day(), mode, BINS)); }
  let geo = null;
  function drawHist() {
    const cv = $('#tHist'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 330 : 360;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = narrow ? 14 : 40, R = narrow ? 14 : 24, x0 = L, x1 = W - R, X = (s) => x0 + (x1 - x0) * s;
    const top = { y0: narrow ? 40 : 36, y1: narrow ? 136 : 150 }, bot = { y0: narrow ? 198 : 200, y1: narrow ? 288 : 312 };
    geo = { W, H, X, x0, x1, y0: top.y0 - 14, y1: bot.y1 };
    const kk = kinds();
    const titles = () => {
      const t1 = st.ran ? `удачные шаги: ${kk.ok}` : 'удачные шаги', t2 = !st.ran ? 'сорвавшиеся шаги' : narrow ? `сорвались ${kk.gross + kk.subtle}: грубых ${kk.gross}, тонких ${kk.subtle}` : `сорвавшиеся шаги: ${kk.gross + kk.subtle} — грубых ${kk.gross}, тонких ${kk.subtle}`;
      for (const [t, y] of [[t1, top.y0 - 18], [t2, bot.y0 - 18]]) {
        K.font(c, k, 10.5, 700); const w = c.measureText(t).width, hh = 10.5 * k * 1.5;
        c.fillStyle = P.surf; c.fillRect(x0 - 3, y - hh / 2, w + 6, hh);
        K.label(c, k, t, x0, y, { px: 10.5, weight: 700, color: P.ink2, align: 'left', halo: false });
      }
    };
    for (const pnl of [top, bot]) { c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, pnl.y1 + 0.5); c.lineTo(x1, pnl.y1 + 0.5); c.stroke(); }
    for (const s of [0, 0.25, 0.5, 0.75, 1]) K.label(c, k, fmt(s, s % 0.5 ? 2 : s ? 1 : 0), X(s), bot.y1 + 13, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'оценка детектора «шаг сорвался»' : 'оценка детектора «шаг сорвался»: правее порога — тревога', (x0 + x1) / 2, bot.y1 + 31, { px: 10.5, color: P.ink3, halo: false });
    if (!st.ran) { titles(); K.label(c, k, narrow ? 'сделай ставку и нажми кнопку миссии' : 'сделай ставку и нажми «Прожить день» — здесь появятся оценки детектора за день', W / 2, (top.y0 + top.y1) / 2 + 6, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const h = hist(st.mode), t = T(), bw = (x1 - x0) / BINS, tb = Math.round(t * BINS);
    // зоны: ложные тревоги сверху справа, пропуски снизу слева
    c.fillStyle = HeroKit.css('--warning-soft') || 'rgba(230,160,40,.12)'; c.globalAlpha = 0.6; c.fillRect(X(t), top.y0, x1 - X(t), top.y1 - top.y0); c.globalAlpha = 1;
    c.fillStyle = HeroKit.css('--critical-soft') || 'rgba(220,60,40,.10)'; c.globalAlpha = 0.6; c.fillRect(x0, bot.y0, X(t) - x0, bot.y1 - bot.y0); c.globalAlpha = 1;
    const mOk = Math.max(1, ...h.ok), mF = Math.max(1, ...h.gross.map((g, i) => g + h.subtle[i]));
    for (let b = 0; b < BINS; b++) {
      const xb = x0 + b * bw + 0.6, alarm = b >= tb;
      if (h.ok[b]) { const hh = Math.max(1.5, (top.y1 - top.y0) * Math.sqrt(h.ok[b] / mOk)); c.fillStyle = alarm ? P.warn : P.ink3; c.globalAlpha = alarm ? 0.95 : 0.55; c.fillRect(xb, top.y1 - hh, bw - 1.2, hh); c.globalAlpha = 1; }
      const g = h.gross[b], sb = h.subtle[b], u = (bot.y1 - bot.y0) / mF;
      if (g + sb) { c.globalAlpha = alarm ? 0.5 : 1; c.fillStyle = P.e2e; c.fillRect(xb, bot.y1 - g * u, bw - 1.2, g * u); c.fillStyle = P.bad; c.fillRect(xb, bot.y1 - (g + sb) * u, bw - 1.2, sb * u); c.globalAlpha = 1; }
    }
    // порог
    const r = cur(), xt = X(t);
    c.strokeStyle = P.ink; c.lineWidth = 2.2; c.beginPath(); c.moveTo(xt, top.y0 - 6); c.lineTo(xt, bot.y1); c.stroke();
    c.beginPath(); c.arc(xt, top.y0 - 6, 6, 0, 7); c.fillStyle = P.ink; c.fill();
    const right = xt < x1 - 90;
    K.label(c, k, `порог ${fmt(t, 2)}`, right ? xt + 8 : xt - 8, top.y1 + 13, { px: 11, weight: 750, color: P.ink, align: right ? 'left' : 'right', haloColor: P.surf });
    K.label(c, k, `ложных тревог: ${r.falseAlarms}`, x1 - 2, top.y0 + 6, { px: 10.5, weight: 700, color: P.ink, align: 'right', haloColor: P.surf });
    K.label(c, k, `пропущено: ${r.missed}`, x0 + 2, bot.y0 + 6, { px: 10.5, weight: 700, color: P.bad, align: 'left', haloColor: P.surf });
    K.label(c, k, `поймано: ${r.caught}`, x1 - 2, bot.y0 + 6, { px: 10.5, weight: 700, color: P.ink2, align: 'right', haloColor: P.surf });
    titles();
    if (!narrow) { K.label(c, k, 'высота — корень из числа проверок', x1 - 2, top.y0 - 18, { px: 9.5, color: P.ink3, align: 'right', halo: false }); }
  }
  function drawDay() {
    const cv = $('#tDay'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 120 : 110;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = 14, x1 = W - 14, X = (i) => x0 + (x1 - x0) * (i + 0.5) / 300;
    K.label(c, k, 'вызовы человека', x0, 11, { px: 10, weight: 650, color: P.ink2, align: 'left', halo: false });
    K.label(c, k, 'испорченные латте', x0, 58, { px: 10, weight: 650, color: P.ink2, align: 'left', halo: false });
    c.strokeStyle = P.line; c.lineWidth = 1; for (const y of [46, 92]) { c.beginPath(); c.moveTo(x0, y + 0.5); c.lineTo(x1, y + 0.5); c.stroke(); }
    for (let hh = 0; hh <= 15; hh += 5) K.label(c, k, `${hh} ч`, x0 + (x1 - x0) * hh / 15, H - 8, { px: 9.5, color: P.ink3, align: hh === 0 ? 'left' : hh === 15 ? 'right' : 'center', halo: false });
    if (!st.ran) { K.label(c, k, 'лента появится после первого дня', W / 2, 40, { px: 11.5, weight: 650, color: P.ink2, haloColor: P.surf }); return; }
    const r = cur();
    c.lineWidth = narrow ? 1 : 1.4;
    for (const e of r.events) {
      const x = X(e.i);
      if (e.e === 'spoiled') { c.strokeStyle = P.bad; c.beginPath(); c.moveTo(x, 66); c.lineTo(x, 92); c.stroke(); }
      else { c.strokeStyle = e.e === 'caught' ? P.cl : P.ink3; c.globalAlpha = e.e === 'caught' ? 1 : 0.55; c.beginPath(); c.moveTo(x, 20); c.lineTo(x, 46); c.stroke(); c.globalAlpha = 1; }
    }
  }
  function tiles() {
    if (!st.ran) { setOut($('#tTiles'), ''); return; }
    const r = cur(), t = (v, l, cls) => `<div class="t-tile ${cls || ''}"><b>${v}</b><span>${l}</span></div>`;
    setOut($('#tTiles'), t(fmt(r.alarms, 0), 'вызовов человека за день', r.alarms > 60 ? 'bad' : '') + t(fmt(r.falseAlarms, 0), 'из них ложных тревог') + t(fmt(r.spoiled, 0), 'испорченных латте дошли до людей', r.spoiled > 3 ? 'bad' : 'good') + t(fmtMin(r.mtbi), 'MTBI — время между вызовами', r.mtbi < 15 ? 'bad' : 'good'));
  }
  function render() {
    drawHist(); drawDay(); tiles(); segSet('#tDet', st.mode); $('#tT').value = st.ti; syncRange($('#tT'), fmt(T(), 2));
    if (!st.ran) { setOut($('#tOut'), `Детектор — ${NAMES[st.mode]}, порог ${fmt(T(), 2)}. День ещё не начался.`); return; }
    const r = cur();
    setOut($('#tOut'), `Детектор — ${NAMES[st.mode]}, порог ${fmt(T(), 2)}: поймано ${r.caught} из ${r.fails} отказов (грубых пропущено ${r.missedGross}, тонких — ${r.missedSubtle}), ложных тревог ${fmt(r.falseAlarms, 0)}. Человека звали ${fmt(r.alarms, 0)} ${plural(r.alarms, 'раз', 'раза', 'раз')} — в среднем раз в ${fmtMin(r.mtbi)}; испорченных латте — <b>${r.spoiled}</b>.`);
  }
  function set(o) { Object.assign(st, o); render(); if (ctl) ctl.update(); }
  function state() { const r = cur(); return { mode: st.mode, T: T(), ti: st.ti, ran: st.ran, spoiled: r.spoiled, alarms: r.alarms, falseAlarms: r.falseAlarms, mtbi: r.mtbi, missed: r.missed, r }; }
  const api = {
    reset() { set({ mode: 'sens', ti: 10, ran: false }); },
    state, render, st, set, res, kinds, day,
    async live() { set({ mode: 'sens', ti: 10, ran: true }); const r = res('sens', 10), kk = kinds(); return Object.assign({ checks: day().checks.length, gross: kk.gross, subtle: kk.subtle }, r); },
    async both() { set({ mode: 'both', ti: 10, ran: true }); return { both: res('both', 10), sens: res('sens', 10), vlm: res('vlm', 10) }; },
  };
  const missions = [
    { short: 'Датчики', title: 'Один день с датчиками', text: 'Детектор — датчики: весы под чашкой и датчик силы в захвате. Порог 0,5: Ада зовёт человека, если датчики уверены в срыве шага хотя бы наполовину. Нажми кнопку — Ада проработает целый день, 300 латте.',
      onEnter: (X) => X.set({ mode: 'sens', ti: 10 }),
      bet: { q: 'сколько испорченных латте за день дойдёт до людей?', options: ['Ни одного: детектор проверяет каждый шаг', 'Несколько', 'Около двадцати'], answer: (r) => (r.spoiled === 0 ? 0 : r.spoiled <= 8 ? 1 : 2) },
      action: { label: 'Прожить день', run: (X) => X.live() },
      criteria: [{ label: 'День прожит: 2400 проверок', test: (r) => r.checks === 2400 }],
      explain: (r) => `Человека звали ${r.alarms} ${plural(r.alarms, 'раз', 'раза', 'раз')}, из них ${r.falseAlarms} — зря. До людей дошли ${r.spoiled} ${plural(r.spoiled, 'испорченный латте', 'испорченных латте', 'испорченных латте')}. Из ${r.gross} грубых отказов датчики пропустили ${r.missedGross}, из ${r.subtle} тонких — ${r.missedSubtle}: на гистограмме тонкие отказы лежат там же, где удачные шаги. Время между вызовами — ${fmtMin(r.mtbi)}.` },
    { short: 'Порог', title: 'Опусти порог датчиков', text: 'Двигай порог — мышью на гистограмме или ползунком. Найди порог, при котором испорченных латте за день не больше трёх, и посмотри, сколько раз тогда зовут человека.',
      controls: ['T'], onEnter: (X) => X.set({ mode: 'sens', ran: true }),
      criteria: [{ label: 'Детектор — датчики', test: (r, s) => s.mode === 'sens' }, { label: 'Не больше трёх испорченных латте за день', test: (r, s) => s.mode === 'sens' && s.spoiled <= 3 }],
      hint: 'Тонкие отказы у датчиков получают оценки около 0,2 — почти как удачные шаги. Порог придётся опустить очень низко.',
      explain: (r) => `При пороге ${fmt(r.T, 2)} испорченных ${r.spoiled}, но человека звали ${fmt(r.alarms, 0)} раз, из них ${fmt(r.falseAlarms, 0)} — зря: в среднем раз в ${fmtMin(r.mtbi)}. Порогом не исправить детектор, который не видит тонких отказов: на его шкале они лежат среди удачных шагов, и чтобы поймать их, приходится тревожиться почти на каждом шаге.` },
    { short: 'Оба', title: 'Добавь модель по камере', text: 'Второй детектор — модель зрения и языка по кадру камеры. В режиме «оба» Ада зовёт человека, если сработал хотя бы один детектор, — так устроен Sentinel. Порог снова 0,5.',
      bet: { q: 'что будет с ложными тревогами по сравнению с одними датчиками?', options: ['Станет меньше: второй детектор перепроверит первый', 'Столько же: модель по камере добавит только пойманные тонкие отказы', 'Станет больше: ложные тревоги обоих складываются'], answer: (r) => (r.both.falseAlarms < r.sens.falseAlarms ? 0 : r.both.falseAlarms === r.sens.falseAlarms ? 1 : 2) },
      action: { label: 'Прожить день с двумя детекторами', run: (X) => X.both() },
      criteria: [{ label: 'Не больше трёх испорченных латте за день', test: (r) => r.both.spoiled <= 3 }, { label: 'Не больше 60 вызовов за день — MTBI не меньше 15 минут', test: (r) => r.both.alarms <= 60 }],
      explain: (r) => `Оба детектора: испорченных латте ${r.both.spoiled}, вызовов ${r.both.alarms}, из них ложных ${r.both.falseAlarms} — против ${r.sens.falseAlarms} у одних датчиков. Время между вызовами — ${fmtMin(r.both.mtbi)}. Датчики ловят грубые отказы, модель по камере — тонкие; одна модель по камере пропустила бы ${r.vlm.missedGross} ${plural(r.vlm.missedGross, 'грубый отказ', 'грубых отказа', 'грубых отказов')} и дала ${r.vlm.spoiled} испорченных латте. Похоже вышло в Sentinel: на отказах хода задачи проверка согласованности ловила 44%, вместе с моделью зрения и языка — 93%, а ложных тревог стало на 7% больше.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай детекторы и двигай порог. Найди порог, при котором у двух детекторов меньше всего вызовов, а испорченных латте не больше одного, и сравни число вызовов с числом настоящих отказов за день.',
      final: true, controls: ['det', 'T'], onEnter: (X) => X.set({ ran: true }) },
  ];
  function init() {
    segBind('#tDet', (v) => set({ mode: v }));
    $('#tT').addEventListener('input', (e) => set({ ti: +e.target.value }));
    const cv = $('#tHist');
    K.drag(cv, 640, 360, {
      hit: (p) => { if (!st.ran || !geo) return null; const sx = p.x * geo.W / 640, sy = p.y * geo.H / 360; return Math.abs(sx - geo.X(T())) < 22 && sy > geo.y0 - 10 && sy < geo.y1 + 6 ? { thr: true } : null; },
      move: (o, p) => { const sx = p.x * geo.W / 640, s = (sx - geo.x0) / (geo.x1 - geo.x0); const ti = Math.max(1, Math.min(19, Math.round(s * 20))); if (ti !== st.ti && isFree()) set({ ti }); },
      tap: (p) => { if (!st.ran || !geo || !isFree()) return; const sx = p.x * geo.W / 640, s = (sx - geo.x0) / (geo.x1 - geo.x0); if (s >= 0 && s <= 1) set({ ti: Math.max(1, Math.min(19, Math.round(s * 20))) }); }, tapCursor: 'pointer',
    });
    ctl = mountMissions('#tMis', missions, api, { controls: { det: '#wrapTDet', T: '#wrapTT' }, scene: '#tHist' });
    render(); redrawOn(render);
    return ctl;
  }
  /** Порог можно двигать, только когда открыт ползунок (миссия 2 и свободный режим). */
  const isFree = () => !$('#wrapTT').hidden;
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: сколько удачных запусков подряд нужно
   ===================================================================== */
const Runs = (() => {
  const E = L83, K = HeroKit, NS = [10, 20, 30, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000], ROWS = 40, CAP = 3000;
  const st = { ni: 1, p: 0.95, shown: false };
  let ctl = null;
  const series = {};
  const S = (p) => series[p] || (series[p] = E.series(p, ROWS, CAP));
  const n = () => NS[st.ni];
  function drawRows() {
    const cv = $('#rRows'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = 400;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = narrow ? 12 : 30, x1 = W - (narrow ? 30 : 60), y0 = 34, rh = (H - y0 - 34) / ROWS, N = n(), X = (v) => x0 + (x1 - x0) * Math.min(v, N) / N;
    const ser = S(st.p), pass = E.passed(ser, N);
    const head = narrow ? (st.shown ? `40 проверок по ${N} · Ада ${pctS(st.p)} · прошли ${pass}` : `40 проверок по ${N} латте`) : (st.shown ? `40 проверок по ${N} латте подряд · Ада с надёжностью ${pctS(st.p)} · прошли ${pass} из 40` : `40 проверок по ${N} латте подряд`);
    K.label(c, k, head, x0, 14, { px: narrow ? 10.5 : 11.5, weight: 700, color: P.ink, align: 'left', halo: false });
    // линия длины проверки
    c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(N), y0 - 6); c.lineTo(X(N), H - 30); c.stroke(); c.setLineDash([]);
    K.label(c, k, `n = ${N}`, X(N), H - 20, { px: 10, weight: 700, color: P.ink2, haloColor: P.surf });
    K.label(c, k, '0', x0, H - 20, { px: 10, color: P.ink3, halo: false });
    if (!narrow) K.label(c, k, 'латте подряд без ошибок →', (x0 + x1) / 2, H - 20, { px: 10, color: P.ink3, haloColor: P.surf });
    if (!st.shown) {
      for (let r = 0; r < ROWS; r++) { const y = y0 + r * rh; c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(x0, y + rh * 0.2, x1 - x0, rh * 0.6); }
      K.label(c, k, narrow ? 'сделай ставку и нажми кнопку миссии' : 'сделай ставку и нажми кнопку миссии — здесь появятся 40 проверок', W / 2, H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
      return;
    }
    const cells = N <= 50;
    for (let r = 0; r < ROWS; r++) {
      const y = y0 + r * rh, run = ser[r].run, ok = run >= N, bh = rh * 0.62, by = y + (rh - bh) / 2;
      if (cells) {
        const cw = (x1 - x0) / N;
        for (let i = 0; i < Math.min(N, run + 1); i++) { const bad = i === run; c.fillStyle = bad ? P.bad : ok ? P.good : P.ink3; c.globalAlpha = bad ? 1 : ok ? 0.85 : 0.5; c.fillRect(x0 + i * cw + 0.5, by, Math.max(1, cw - 1), bh); }
        c.globalAlpha = 1;
      } else {
        c.fillStyle = ok ? P.good : P.ink3; c.globalAlpha = ok ? 0.85 : 0.5; c.fillRect(x0, by, Math.max(1.5, X(run) - x0), bh); c.globalAlpha = 1;
        if (!ok) K.cross(c, X(run), by + bh / 2, Math.min(4, bh / 2), P.bad, 1.8);
      }
      if (ok) K.check(c, x1 + (narrow ? 12 : 16), by + bh / 2, Math.min(5, bh / 2), P.good, 2);
    }
  }
  function drawCurve() {
    const cv = $('#rCurve'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = 260;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const x0 = narrow ? 40 : 54, x1 = W - (narrow ? 16 : 24), y0 = 26, y1 = H - 46, N = n();
    const X = (lf) => x0 + (x1 - x0) * (-1 - lf) / 3, Y = (v) => y1 - (y1 - y0) * v;   // lf = log10(доля отказов) от −1 до −4
    c.strokeStyle = P.line; c.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(x0, Y(v) + 0.5); c.lineTo(x1, Y(v) + 0.5); c.stroke(); K.label(c, k, pctS(v, 0), x0 - 6, Y(v), { px: 9.5, color: P.ink3, align: 'right', halo: false }); }
    for (const [lf, t] of [[-1, '90%'], [-2, '99%'], [-3, '99,9%'], [-4, '99,99%']]) { c.beginPath(); c.moveTo(X(lf), y0); c.lineTo(X(lf), y1); c.stroke(); K.label(c, k, t, X(lf), y1 + 13, { px: 10, color: P.ink3, align: lf === -4 ? 'right' : lf === -1 ? 'left' : 'center', halo: false }); }
    K.label(c, k, narrow ? 'настоящая надёжность Ады' : 'настоящая надёжность Ады (шкала доли отказов логарифмическая)', (x0 + x1) / 2, y1 + 31, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, `доля проверок длиной ${N}, пройденных без ошибок`, x0, 11, { px: 10.5, weight: 700, color: P.ink2, align: 'left', halo: false });
    if (!st.shown) { K.label(c, k, narrow ? 'появится после первых проверок' : 'кривая появится после первых 40 проверок', (x0 + x1) / 2, (y0 + y1) / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    c.setLineDash([4, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x0, Y(0.05)); c.lineTo(x1, Y(0.05)); c.stroke(); c.setLineDash([]);
    K.label(c, k, '5%', x1 - 2, Y(0.05) - 9, { px: 9.5, weight: 700, color: P.bad, align: 'right', haloColor: P.surf });
    c.beginPath();
    for (let i = 0; i <= 150; i++) { const lf = -1 - 3 * i / 150, f = Math.pow(10, lf), v = E.passProb(1 - f, N); const x = X(lf), y = Y(v); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.stroke();
    const lfA = Math.log10(1 - st.p), vA = E.passProb(st.p, N);
    c.beginPath(); c.arc(X(lfA), Y(vA), 6, 0, 7); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.ink; c.lineWidth = 2.2; c.stroke();
    K.label(c, k, `Ада ${pctS(st.p)}: ${pctS(vA, 1)}`, X(lfA) + (lfA < -3 ? -10 : 10), Y(vA) + (vA > 0.85 ? 14 : -14), { px: 10.5, weight: 750, color: P.ink, align: lfA < -3 ? 'right' : 'left', haloColor: P.surf });
  }
  function render() {
    drawRows(); drawCurve();
    $('#rN').value = st.ni; syncRange($('#rN'), fmt(n(), 0)); segSet('#rP', st.p);
    const N = n(), ub = E.upperBound(N), pr = E.passProb(st.p, N);
    if (!st.shown) { setOut($('#rOut'), `Проверка — ${fmt(N, 0)} латте подряд. Сделай ставку и проведи 40 проверок.`); return; }
    setOut($('#rOut'), `Проверка — ${fmt(N, 0)} латте подряд. Ада с надёжностью ${pctS(st.p)} проходит её с вероятностью <b>${pctS(pr, 1)}</b>${st.shown ? `, на сцене прошли ${E.passed(S(st.p), N)} из 40` : ''}. Пройденная проверка подтверждает, что доля отказов меньше ${pctS(ub, 2)}, то есть надёжность выше ${pctS(1 - ub, 2)} — по правилу трёх примерно 3/${N}.`);
  }
  function set(o) { Object.assign(st, o); render(); if (ctl) ctl.update(); }
  function state() { const N = n(); return { n: N, p: st.p, shown: st.shown, pr: E.passProb(st.p, N), pr99: E.passProb(0.99, N), passed: E.passed(S(st.p), N) }; }
  const api = {
    reset() { set({ ni: 1, p: 0.95, shown: false }); },
    state, render, st, set, NS,
    async run20() { set({ ni: 1, p: 0.95, shown: true }); return { k: E.passed(S(0.95), 20), pr: E.passProb(0.95, 20), ub: E.upperBound(20) }; },
    async run999() { set({ ni: NS.indexOf(3000), p: 0.999, shown: true }); const need = E.needRuns(0.001); return { need, hours: need * E.CFG.MIN_PER_LATTE / 60, k: E.passed(S(0.999), 3000), pr: E.passProb(0.999, need), good: E.passProb(0.9995, need) }; },
  };
  const missions = [
    { short: '20 подряд', title: 'Двадцать латте без ошибок', text: 'Проверка: 20 латте подряд без единой ошибки. Проходит ли её Ада, которая на деле ошибается в каждом двадцатом латте, — с надёжностью 95%? На сцене будет 40 таких проверок.',
      onEnter: (X) => X.set({ ni: 1, p: 0.95 }),
      bet: { q: 'сколько проверок из 40 пройдёт Ада с 95%?', options: ['Ни одной: за 20 латте ошибка почти неизбежна', 'Около трети', 'Почти все'], answer: (r) => (r.k <= 2 ? 0 : r.k <= 25 ? 1 : 2) },
      action: { label: 'Провести 40 проверок', run: (X) => X.run20() },
      criteria: [{ label: 'Хотя бы одна проверка пройдена', test: (r) => r.k > 0 }],
      explain: (r) => `Прошли ${r.k} проверок из 40, по формуле 0,95²⁰ ≈ ${pctS(r.pr, 0)}. «Двадцать подряд без ошибок» не отличает 95% от 99%: Ада, которая ошибается в каждом двадцатом латте, проходит такую проверку примерно в каждом третьем случае. Двадцать удачных подряд говорят лишь, что доля отказов, скорее всего, меньше ${pctS(r.ub, 0)}.` },
    { short: '99%', title: 'Проверка для 99%', text: 'Теперь Ада с надёжностью 99%. Подбери длину проверки так, чтобы такая Ада проходила её не чаще чем в 5 случаях из 100. Тогда пройденная проверка позволяет утверждать, что надёжность выше 99%, с уверенностью 95%.',
      controls: ['n'], onEnter: (X) => X.set({ p: 0.99, shown: true }),
      criteria: [{ label: 'Ада с 99% проходит проверку не чаще чем в 5% случаев', test: (r, s) => s.pr99 <= 0.05 }],
      hint: 'Смотри на кружок на графике: он должен опуститься ниже красного пунктира. Сотня латте для этого мало.',
      explain: (r) => `Нужно ${fmt(r.n, 0)} латте подряд: Ада с 99% проходит такую проверку в ${pctS(r.pr99, 1)} случаев${r.p === 0.99 ? `, на сцене прошли ${r.passed} из 40` : ''}. Это правило трёх: если за n запусков не было ни одной ошибки, доля отказов с уверенностью 95% меньше примерно 3/n. Для 99% — 300 запусков, точнее ${E.needRuns(0.01)}.` },
    { short: '99,9%', title: 'Проверка для 99,9%', text: 'Хотим утверждать 99,9% — одна испорченная чашка на тысячу.',
      bet: { q: 'сколько латте подряд без ошибок нужно увидеть?', options: ['Около 300, как для 99%: там уже много', 'Около 1000', 'Около 3000'], answer: (r) => (r.need >= 2500 ? 2 : r.need >= 700 ? 1 : 0) },
      action: { label: 'Посчитать и проверить', run: (X) => X.run999() },
      criteria: [{ label: 'Ада с 99,9% проходит проверку не чаще чем в 5% случаев', test: (r) => r.pr <= 0.05 }],
      explain: (r) => `Нужно ${fmt(r.need, 0)} латте подряд, по правилу трёх — 3000. При 3 минутах на латте это ${fmt(r.hours, 0)} часов работы, больше шести суток без перерыва. Ада ровно с 99,9% проходит такую проверку в ${pctS(r.pr, 0)} случаев (на сцене — ${r.k} из 40 проверок по 3000 латте), а Ада вдвое надёжнее, с 99,95%, — лишь в ${pctS(r.good, 0)}: строгая проверка отсекает и хорошие версии.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй длину проверки и настоящую надёжность Ады. Найди самую длинную проверку, которую Ада с 99,9% проходит хотя бы в трёх случаях из четырёх, и посмотри в строке под сценой, какую надёжность такая проверка подтверждает.',
      final: true, controls: ['n', 'p'], onEnter: (X) => X.set({ shown: true }) },
  ];
  function init() {
    $('#rN').addEventListener('input', (e) => set({ ni: +e.target.value }));
    segBind('#rP', (v) => set({ p: +v }));
    ctl = mountMissions('#rMis', missions, api, { controls: { n: '#wrapRN', p: '#wrapRP' }, scene: '#rRows' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, S };
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
  const E = L83, base = E.orders({ p: 0.95, n: 8 }).cnt, retry = E.orders({ p: 0.95, n: 8, d: 0.9, R: 2 }).cnt, s5 = Thresh.api.res('sens', 10), s2 = Thresh.api.res('sens', 2), b5 = Thresh.api.res('both', 10);
  renderQuiz('#quizBox', [
    { q: 'Каждый шаг задачи удаётся в 99% случаев. Значит, задача из 100 шагов удаётся почти всегда?', o: ['Да: 99% — это почти всегда', 'Нет: при независимых шагах надёжности перемножаются, и 0,99¹⁰⁰ — около 37%', 'Да, если шаги простые'], a: 1, e: `Длинная задача удаётся, только если удались все шаги. Даже латте из восьми шагов по 95% выходит без ошибок лишь в двух случаях из трёх: на сцене — ${base.good} из 100.` },
    { q: 'Если Ада повторяет шаг после каждой ошибки, испорченных латте не останется?', o: ['Да: любая ошибка исправляется повтором', 'Нет: повтор исправляет только замеченные ошибки, а незамеченные остаются тихими отказами', 'Нет: повтор только мешает'], a: 1, e: `С проверкой, которая замечает 90% ошибок, и двумя повторами вышло ${retry.good} латте из 100 вместо ${base.good}, но ${retry.silent} всё равно испорчены — в них Ада ошибку не заметила.` },
    { q: 'Чем ниже порог тревоги детектора, тем лучше?', o: ['Да: меньше пропущенных отказов', 'Нет: пропусков меньше, но ложных тревог больше, и каждая — вызов человека', 'Порог ни на что не влияет'], a: 1, e: `Датчики при пороге 0,5 пропустили ${s5.missed} отказов, а при пороге 0,10 — ${s2.missed}, но звали человека ${fmt(s2.alarms, 0)} раз за день вместо ${s5.alarms}.` },
    { q: 'Два детектора объединили через «или»: Ада зовёт человека, если сработал хотя бы один. Ложных тревог станет меньше?', o: ['Да: второй детектор перепроверит первый', 'Нет: ложные тревоги обоих складываются, зато пропусков меньше', 'Не изменится'], a: 1, e: `В лаборатории 2 у одних датчиков было ${s5.falseAlarms} ложных тревог за день, у двух детекторов — ${b5.falseAlarms}. В Sentinel добавление модели зрения и языка подняло долю пойманных отказов хода задачи с 44 до 93% ценой роста ложных тревог на 7%.` },
    { q: 'Хороший детектор отказов делает робота надёжнее?', o: ['Да: он убирает отказы', 'Он превращает тихие отказы в громкие: испорченных латте меньше, но каждый пойманный отказ — вмешательство человека', 'Нет, детекторы бесполезны'], a: 1, e: `Даже идеальный детектор не опустит число вызовов ниже числа отказов — на нашем дне их ${b5.fails}. Чтобы людей звали реже, нужны надёжнее сами шаги или повтор.` },
    { q: 'KnowNo гарантирует, что каждая просьба будет выполнена с вероятностью не ниже 1 − ε?', o: ['Да, для каждой просьбы', 'Нет: гарантия средняя по сценариям из того же распределения, что калибровочные; о непохожих сценариях она ничего не говорит', 'Нет: гарантии у KnowNo нет'], a: 1, e: 'Порог выбирают по калибровочному набору — в статье 400 размеченных сценариев. Гарантия держится, если рабочие сценарии похожи на калибровочные, и при любой языковой модели: слабая модель просто чаще просит помощи.' },
    { q: 'Ада приготовила 20 латте подряд без ошибок. Можно писать «надёжность 99%»?', o: ['Да: 20 из 20 — это даже 100%', 'Нет: Ада с 95% проходит такую проверку примерно в каждом третьем случае; 20 удачных подряд подтверждают лишь долю отказов меньше 14%', 'Да, если латте были разные'], a: 1, e: `На сцене Ада с 95% прошла ${E.passed(Runs.S(0.95), 20)} проверок по 20 латте из 40. Для 99% по правилу трёх нужно около 300 удачных запусков подряд.` },
    { q: 'Для 99,9% достаточно тысячи удачных запусков подряд?', o: ['Да: тысяча — с запасом', 'Нет: по правилу трёх тысяча подтверждает только долю отказов меньше 0,3%; для 99,9% нужно около 3000', 'Нужно ровно 999'], a: 1, e: `Точно — ${fmt(E.needRuns(0.001), 0)} запусков: около 150 часов работы при 3 минутах на латте. Поэтому надёжность продукта меряют всё время, пока роботы работают.` },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('latte', () => { mis.latte = Latte.init(); });
    safe('thresh', () => { mis.thresh = Thresh.init(); });
    safe('runs', () => { mis.runs = Runs.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['lMis', 'tMis', 'rMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l83 = { mis, Latte, Thresh, Runs, L83 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
