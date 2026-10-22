/* =====================================================================
   ui-l65.js — урок 6.5 «Аппаратная часть гуманоида».
   0) анимированная схема `drive`: мотор → редуктор → звено при двух передаточных
      числах (6 : 1 и 100 : 1): где растёт инерция ротора на выходе, откуда удар
      при касании пола и почему через большой редуктор силу в стопе не видно по току;
   1) анимированная схема `hand`: кисть с тросами (моторы в предплечье) против
      кисти с моторами в суставах пальцев;
   2) диаграммы чисел из статей и документации — общий модуль shared/stats-chart.js;
   3) лаборатория «Бюджет массы, мощности и вычислений»: читатель собирает Аду из
      приводов, кистей, вычислителя и батареи под задачу «нести коробку 5 кг два часа»
      и видит, во что упирается; сравнение рядом — закреплённая и текущая Ада;
   4) квиз.
   Ада рисуется AdaBody.front из shared/ada-legs.js (тот же рисунок, что в 6.1–6.4).
   Движок — l65/engine.js (без DOM, без случайности).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface'), e2eS: HeroKit.css('--e2e-soft'), clS: HeroKit.css('--classic-soft'), hyS: HeroKit.css('--hybrid-soft') });
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
/** Логический размер канваса: широкая раскладка или узкая (телефон), с пропорциями в стиле элемента. */
function fitLayout(cv, wide, narrow) {
  const n = canvasNarrow(cv, wide[0]), L = n ? narrow : wide, ar = `${L[0]} / ${L[1]}`;
  if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
  const { c, k } = HeroKit.fit(cv, L[0], L[1]);
  return { c, k, W: L[0], H: L[1], narrow: n };
}
const sleep0 = () => new Promise((r) => setTimeout(r, 0));

/* =====================================================================
   0. Схема `drive`: мотор → редуктор → звено. Два одинаковых мотора, как в лаборатории 1 урока 0.2
   (инерция ротора 1,2·10⁻⁴ кг·м², звено 0,09 кг·м²), с редукторами 6 : 1 и 100 : 1.
   Цикл 4 с: звено-нога опускается и в момент 2,4 с касается пола; пик момента при ударе растёт
   как корень из эффективной инерции J_звена + N²·J_ротора (0.2): у 100 : 1 он в 3,7 раза выше.
   Стрелка назад от стопы к мотору — оценка силы по току: через 6 : 1 она доходит (±10 %),
   через 100 : 1 теряется в трении и инерции — нужен датчик силы. Цвета как в 0.2: оранжевый — мотор
   и то, что он вращает; синий — звено и измеренное; фиолетовый — редуктор; серый — пол.
   ===================================================================== */
(() => {
  const T = 4.0, J_R = 1.2e-4, J_L = 0.09, ROWS = [{ N: 6, name: 'редуктор 6 : 1', kind: 'квазипрямой привод' }, { N: 100, name: 'редуктор 100 : 1', kind: 'волновой редуктор' }];
  const jEff = (N) => J_L + N * N * J_R, spike = (N) => Math.sqrt(jEff(N) / jEff(6));
  /** Фаза цикла: угол звена (0 — горизонталь, растёт к полу), касание в 2,4 с, после касания — отскок и отдых. */
  function phase(u) {
    if (u < 2.4) { const s = u / 2.4; return { ang: 0.05 + 0.6 * s * s, hit: 0, after: 0 }; }
    const d = u - 2.4; return { ang: 0.65 - 0.04 * Math.max(0, 1 - d / 0.3), hit: Math.max(0, 1 - d / 0.45), after: d };
  }
  function drawRow(c, k, A, P, g, row, u, n) {
    const { x, y } = g, ph = phase(u), N = row.N, hot = ph.hit;
    const lab = (txt, X, Y, o) => A.lab(c, k, txt, X, Y, Object.assign({ px: n ? 10 : 10.5, weight: 600, color: P.ink2, halo: false }, o || {}));
    lab(`${row.name} · ${row.kind}`, x, y, { px: n ? 11 : 12.5, weight: 700, color: P.ink, align: 'left' });
    // мотор: круг с метками, вращается в N раз быстрее звена
    const mx = x + (n ? 26 : 50), my = y + (n ? 64 : 76), mr = n ? 17 : 24;
    const spin = (u < 2.4 ? ph.ang : 0.65) * N * 2.2;
    A.circle(c, mx, my, mr + 4, A.alpha(P.mot, 0.12), null); A.circle(c, mx, my, mr, P.motS, P.mot, 2);
    for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3; c.strokeStyle = P.mot; c.lineWidth = 2; c.beginPath(); c.moveTo(mx + Math.cos(a) * mr * 0.35, my + Math.sin(a) * mr * 0.35); c.lineTo(mx + Math.cos(a) * mr * 0.85, my + Math.sin(a) * mr * 0.85); c.stroke(); }
    lab('мотор', mx, my + mr + (n ? 11 : 13), { color: P.mot });
    // редуктор: коробка с передаточным числом
    const gx = mx + mr + (n ? 12 : 24), gw = n ? 68 : 74, gh = n ? 40 : 50, gy = my - gh / 2;
    A.rect(c, gx, gy, gw, gh, 7, A.alpha(P.spr, 0.1), P.spr, 1.6);
    lab(`${N} : 1`, gx + gw / 2, my - 8, { px: n ? 11 : 13, weight: 700, color: P.spr });
    lab('редуктор', gx + gw / 2, my + 10, { px: n ? 10 : 10.5, color: P.spr });
    // инерция ротора на выходе — под мотором и редуктором, где звено не проходит
    lab(`J·N² на выходе ${A.fmt(N * N * J_R, N === 6 ? 4 : 1)} кг·м²`, x, my + mr + (n ? 28 : 32), { color: P.spr, align: 'left', px: n ? 10 : 10.5 });
    // звено: от выхода редуктора вниз к полу; стопа касается пола при ang ≈ 0,65
    const px0 = gx + gw + (n ? 8 : 18), py0 = my, L = n ? 84 : 200, ex = px0 + Math.cos(ph.ang) * L, ey = py0 + Math.sin(ph.ang) * L;
    const floorY = py0 + Math.sin(0.65) * L + 3;
    c.fillStyle = P.grid; c.fillRect(px0 - 6, floorY, n ? 215 : 400, 5);
    A.line(c, [[gx + gw, my], [px0, py0]], P.spr, 3);
    A.link(c, px0, py0, ex, ey, n ? 7 : 10, P.out, P.ink2);
    A.circle(c, px0, py0, n ? 4 : 5, P.ink2, null);
    A.circle(c, ex, ey, n ? 5 : 7, hot ? P.bad : P.out, null);
    lab('звено', (px0 + ex) / 2 + (n ? 10 : 16), (py0 + ey) / 2 - (n ? 11 : 14), { color: P.out });
    // удар: столбик пика момента за концом звена, растёт при касании и гаснет
    const sp = spike(N), bx = px0 + (n ? 140 : 260), full = (n ? 40 : 66) * sp / spike(100);
    const bh = full * Math.max(hot, ph.after > 0 && ph.after < 1.3 ? 1 - ph.after / 1.3 : 0);
    if (bh > 0.5) { c.fillStyle = A.alpha(P.bad, 0.75); c.fillRect(bx - (n ? 6 : 8), floorY - 2 - bh, n ? 12 : 16, bh); }
    lab(n ? `удар ×${A.fmt(sp, 1)}` : `удар: пик момента ×${A.fmt(sp, 1)}`, bx, floorY - 8 - (n ? 40 : 66) - (n ? 8 : 10), { color: P.bad, weight: 700 });
    // ток → сила: стрелка назад от стопы к мотору поверху
    const ty = y + (n ? 22 : 26), seen = N === 6, col = seen ? P.out : A.alpha(P.out, 0.4);
    A.line(c, [[ex, ey - 8], [ex, ty], [mx, ty]], col, 1.5, seen ? [] : [4, 4]); A.arrow(c, mx, ty, mx, my - mr - 3, col, 1.5, 6);
    lab(seen ? (n ? 'сила в стопе видна по току (±10 %)' : 'сила в стопе видна по току мотора (±10 %)') : (n ? 'по току силу не видно: нужен датчик' : 'по току силу не видно: нужен датчик силы'), (mx + px0 + L) / 2, ty - (n ? 9 : 11), { color: seen ? P.out : P.ink3 });
  }
  function draw(c, k, t, P, A, n) {
    const u = ((t % T) + T) % T;
    ROWS.forEach((row, i) => drawRow(c, k, A, P, { x: 14, y: (n ? 16 : 20) + i * (n ? 192 : 222) }, row, u, n));
  }
  Anim.add('drive', { W: 720, H: 472, start: 0.4, draw: (c, k, t, P, A) => draw(c, k, t, P, A, false), narrowAt: 560, narrow: { W: 360, H: 404, draw: (c, k, t, P, A) => draw(c, k, t, P, A, true) } });
})();

/* =====================================================================
   1. Схема `hand`: тросы против моторов в пальцах. Два пальца с тремя суставами сгибаются и разгибаются
   (цикл 3 с). У первого моторы стоят в предплечье и тянут палец тросами (как Shadow Hand: 20 моторов
   в основании, 40 тросов, 24 сустава, 4,3 кг), у второго мотор стоит в каждом суставе (как Allegro Hand:
   16 моторов в пальцах, 16 суставов, 1,08 кг). Цвета: оранжевый — моторы, фиолетовый — тросы, синий — звенья.
   ===================================================================== */
(() => {
  const T = 3.0;
  const bend = (u) => { const s = (1 - Math.cos(u / T * 2 * Math.PI)) / 2; return 0.08 + 1.0 * s * s * (3 - 2 * s); };
  /** Палец: основание (x, y), три звена длиной l, каждое согнуто на ang (сгибается в сторону +x); возвращает суставы. */
  function finger(c, A, P, x, y, l, ang, w) {
    const pts = [[x, y]]; let a = -Math.PI / 2;
    for (let i = 0; i < 3; i++) { a += ang * (i === 0 ? 0.7 : 1); const q = pts[pts.length - 1]; pts.push([q[0] + Math.cos(a) * l[i], q[1] + Math.sin(a) * l[i]]); }
    for (let i = 0; i < 3; i++) A.link(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, P.out, P.ink2);
    return pts;
  }
  function panel(c, k, A, P, g, kind, u, n) {
    const { x, y, w, h } = g, b = bend(u), lab = (txt, X, Y, o) => A.lab(c, k, txt, X, Y, Object.assign({ px: n ? 10 : 10.5, weight: 600, color: P.ink2, halo: false }, o || {}));
    A.rect(c, x, y, w, h, 10, A.alpha(P.out, 0.03), A.alpha(P.out, 0.35), 1.2);
    const tendon = kind === 'tendon';
    lab(tendon ? 'тросы: моторы в предплечье' : 'моторы в суставах пальцев', x + w / 2, y + 16, { px: n ? 11 : 12.5, weight: 700, color: P.ink });
    lab(tendon ? (n ? 'Shadow: 20 моторов, 40 тросов, 4,3 кг' : 'как Shadow Hand: 20 моторов, 40 тросов') : (n ? 'Allegro: 16 моторов в пальцах, 1,08 кг' : 'как Allegro Hand: мотор в каждом из 16 суставов'), x + w / 2, y + 33, { px: n ? 10 : 10.5, color: P.ink3 });
    if (!n) lab(tendon ? '24 сустава, 4,3 кг вместе с основанием' : '16 суставов, 1,08 кг', x + w / 2, y + 48, { px: 10.5, color: P.ink3 });
    // предплечье внизу, ладонь над ним, палец вверх; палец сгибается в сторону +x, поэтому подписи ставим с другой стороны
    const fw = n ? 104 : 150, fh = n ? 58 : 64, fx = x + w / 2 - fw / 2 + (n ? 14 : 26), fy = y + h - fh - 12, cx = fx + fw / 2;
    A.rect(c, fx, fy, fw, fh, 8, A.alpha(P.ink3, 0.08), P.ink3, 1.2);
    lab('предплечье', cx, fy + fh - 9, { color: P.ink3 });
    const pw = n ? 54 : 60, phh = n ? 34 : 44, py = fy - 8 - phh;
    A.rect(c, cx - pw / 2, py, pw, phh, 6, A.alpha(P.out, 0.08), P.ink2, 1.4);
    lab('ладонь', cx, py + phh - 9, { color: P.ink3 });
    const l = n ? [40, 32, 24] : [58, 46, 34], pts = finger(c, A, P, cx, py, l, b, n ? 8 : 11);
    if (tendon) {
      const spoolY = fy + 16, sp = n ? 24 : 32;
      for (let i = 0; i < 3; i++) { const sx = cx + (i - 1) * sp; A.circle(c, sx, spoolY, n ? 7 : 9, P.motS, P.mot, 1.8); const a = b * 3 + i; c.strokeStyle = P.mot; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, spoolY); c.lineTo(sx + Math.cos(a) * 6, spoolY + Math.sin(a) * 6); c.stroke(); }
      lab('моторы', cx, spoolY + (n ? 15 : 19), { color: P.mot });
      const tip = pts[3], mid = pts[2];
      for (let i = 0; i < 2; i++) { const sx = cx + (i - 0.5) * sp, side = i === 0 ? -5 : 5; A.line(c, [[sx, spoolY - 8], [cx + side, py + 6], [pts[1][0] + side, pts[1][1]], [mid[0] + side, mid[1]], [tip[0], tip[1]]], P.spr, 1.6, [], -u * 30); }
      lab('тросы', cx - pw / 2 - 6, (py + pts[1][1]) / 2, { color: P.spr, align: 'right' });
      lab('палец лёгкий', cx - pw / 2 - 6, pts[2][1] - 10, { color: P.spr, align: 'right' });
      lab(n ? 'трос трётся и вытягивается' : 'трос трётся о направляющие и вытягивается', x + w / 2, y + (n ? 50 : 66), { color: P.spr });
    } else {
      const heat = 0.25 + 0.5 * b / 1.08;
      for (let i = 0; i < 3; i++) { const q = pts[i]; A.circle(c, q[0], q[1], (n ? 9 : 12) + 4 * heat, A.alpha(P.mot, 0.12 + 0.25 * heat), null); A.circle(c, q[0], q[1], n ? 7 : 10, P.motS, P.mot, 1.8); }
      lab(n ? 'мотор в суставе' : 'моторы в суставах', cx - pw / 2 - 6, pts[1][1], { color: P.mot, align: 'right' });
      lab('моторов нет', cx, fy + 22, { color: P.ink3 });
      lab(n ? 'масса и тепло в пальцах' : 'масса и тепло собираются на конце руки', x + w / 2, y + (n ? 50 : 66), { color: P.mot });
    }
  }
  function draw(c, k, t, P, A, n) {
    const u = ((t % T) + T) % T;
    if (n) { panel(c, k, A, P, { x: 10, y: 8, w: 340, h: 262 }, 'tendon', u, true); panel(c, k, A, P, { x: 10, y: 280, w: 340, h: 262 }, 'motors', u, true); }
    else { panel(c, k, A, P, { x: 12, y: 10, w: 342, h: 328 }, 'tendon', u, false); panel(c, k, A, P, { x: 366, y: 10, w: 342, h: 328 }, 'motors', u, false); }
  }
  Anim.add('hand', { W: 720, H: 348, start: 0.7, draw: (c, k, t, P, A) => draw(c, k, t, P, A, false), narrowAt: 560, narrow: { W: 360, H: 552, draw: (c, k, t, P, A) => draw(c, k, t, P, A, true) } });
})();

/* =====================================================================
   2. Числа из статей и документации — диаграммами (shared/stats-chart.js).
   ===================================================================== */
function initStats() {
  const el = (id) => document.getElementById(id);
  if (el('actBars')) StatsChart.bars(el('actBars'), {
    series: [{ id: 'peak', label: 'пиковый момент, Н·м', color: 'var(--e2e)' }, { id: 'sust', label: 'длительный момент, Н·м', color: 'var(--classic)' }],
    groups: [
      { label: 'Mini Cheetah, 0,48 кг', values: { peak: 17, sust: 6.9 } },
      { label: 'BH 5013, 0,25 кг', values: { peak: 9.7, sust: 4.59 } },
      { label: 'BH 8513, 0,76 кг', values: { peak: 45.3, sust: 18.9 } },
      { label: 'BH 8518, 0,86 кг', values: { peak: 62.6, sust: 26.1 } },
      { label: 'BH 10413, 1,01 кг', values: { peak: 81.1, sust: 34.2 } },
      { label: 'Nadia, плечо', values: { peak: 158, sust: 41 } },
    ], max: 160, unit: '', ticks: [0, 40, 80, 120, 160], digits: 0,
  });
  if (el('actMeter')) StatsChart.meter(el('actMeter'), { title: 'Какую долю пикового момента привод держит долго (Berkeley Humanoid, 10413)', label: 'держит долго', rest: 'только короткими пиками', value: 42, color: 'var(--classic)' });
  if (el('handBars')) StatsChart.bars(el('handBars'), {
    series: [{ id: 'j', label: 'суставов', color: 'var(--classic)' }, { id: 'a', label: 'приводов', color: 'var(--e2e)' }],
    groups: [
      { label: 'Shadow', values: { j: 24, a: 20 } },
      { label: 'Sharpa Wave', values: { j: 22, a: 22 } },
      { label: 'Allegro', values: { j: 16, a: 16 } },
      { label: 'LEAP', values: { j: 16, a: 16 } },
      { label: 'RUKA', values: { j: 15, a: 11 } },
      { label: 'Inspire', values: { j: 12, a: 6 } },
    ], max: 24, unit: '', ticks: [0, 8, 16, 24], digits: 0,
  });
  if (el('handMass')) StatsChart.bars(el('handMass'), {
    series: [{ id: 'm', label: 'масса, кг', color: 'var(--hybrid)' }],
    groups: [
      { label: 'Shadow', values: { m: 4.3 } }, { label: 'Sharpa Wave', values: { m: 1.3 } }, { label: 'Allegro', values: { m: 1.08 } }, { label: 'LEAP', values: { m: 0.595 } }, { label: 'Inspire', values: { m: 0.54 } },
    ], max: 5, unit: '', ticks: [0, 2.5, 5], digits: 2,
  });
  if (el('compPower')) StatsChart.bars(el('compPower'), {
    series: [{ id: 'w', label: 'наибольшая мощность, Вт', color: 'var(--e2e)' }],
    groups: [{ label: 'Orin NX 16 ГБ', values: { w: 40 } }, { label: 'AGX Orin 64 ГБ', values: { w: 60 } }, { label: 'Thor T4000', values: { w: 70 } }, { label: 'Thor T5000', values: { w: 130 } }],
    max: 140, unit: '', ticks: [0, 70, 140], digits: 0,
  });
  if (el('compTops')) StatsChart.bars(el('compTops'), {
    series: [{ id: 't', label: 'вычисления по метрике NVIDIA', color: 'var(--classic)' }],
    groups: [{ label: 'Orin NX 16 ГБ, TOPS', values: { t: 157 } }, { label: 'AGX Orin 64 ГБ, TOPS', values: { t: 275 } }, { label: 'Thor T4000, TFLOPS FP4', values: { t: 1200 } }, { label: 'Thor T5000, TFLOPS FP4', values: { t: 2070 } }],
    max: 2100, unit: '', ticks: [0, 700, 1400, 2100], digits: 0,
  });
  if (el('battEnergy')) StatsChart.bars(el('battEnergy'), {
    series: [{ id: 'e', label: 'энергия батареи, кВт·ч', color: 'var(--classic)' }],
    groups: [{ label: 'Unitree G1 (расчёт)', values: { e: 0.43 } }, { label: 'Unitree H1', values: { e: 0.86 } }, { label: 'Mobile ALOHA', values: { e: 1.26 } }, { label: 'Figure 03', values: { e: 2.3 } }, { label: 'Optimus, 2022', values: { e: 2.3 } }],
    max: 2.5, unit: '', ticks: [0, 1.25, 2.5], digits: 2,
  });
  if (el('battHours')) StatsChart.bars(el('battHours'), {
    series: [{ id: 'h', label: 'заявленное время работы, ч', color: 'var(--e2e)' }],
    groups: [{ label: 'Unitree G1', values: { h: 2 } }, { label: 'Figure 03', values: { h: 5 } }, { label: 'Atlas', values: { h: 4 } }, { label: 'Atlas с тяжёлым грузом', values: { h: 2 } }, { label: 'Digit', values: { h: 4 } }],
    max: 6, unit: '', ticks: [0, 3, 6], digits: 0,
  });
  if (el('cotBars')) StatsChart.bars(el('cotBars'), {
    series: [{ id: 'c', label: 'стоимость перемещения', color: 'var(--hybrid)' }],
    groups: [{ label: 'человек', values: { c: 0.2 } }, { label: 'Cassie, 1 м/с', values: { c: 0.7 } }, { label: 'Asimo', values: { c: 2 } }],
    max: 2, unit: '', ticks: [0, 1, 2], digits: 1,
  });
}

/* =====================================================================
   3. Лаборатория «Бюджет массы, мощности и вычислений». Сравнение рядом: закреплённая Ада и текущая.
   ===================================================================== */
const Budget = (() => {
  const E = L65, K = HeroKit;
  const st = { cfg: Object.assign({}, E.DEFAULT), pinned: Object.assign({}, E.DEFAULT), pinnedName: 'Ада из урока 6.1', shown: false, res: null, pinRes: null };
  const names = { legs: 'legs', arms: 'arms', hands: 'hands', comp: 'comp', batt: 'batt' };
  const actLabel = (id) => `${id} · ${fmt(E.ACT[id].peak, 0)} Н·м`;
  const r1 = (x) => fmt(x, 1), r0 = (x) => fmt(x, 0);
  const okTxt = (b) => (b ? '✓' : '✗');
  function set(o) {
    Object.assign(st.cfg, o);
    for (const kkey of Object.keys(names)) segSet('#b' + kkey[0].toUpperCase() + kkey.slice(1), st.cfg[kkey]);
    render();
  }
  function state() { return { cfg: Object.assign({}, st.cfg), res: st.res }; }
  /** Запуск расчёта: результат становится «текущей» Адой на сцене. */
  async function run() { await sleep0(); st.res = E.compute(st.cfg); st.shown = true; render(); return st.res; }
  function pin(cfg, name) { st.pinned = Object.assign({}, cfg); st.pinnedName = name || 'закреплённая'; st.pinRes = E.compute(st.pinned); render(); }
  /* ---------- сцена: две Ады с частями и три полосы под каждой ---------- */
  const cv = () => $('#bCv');
  function adaCol(c, k, P, x, w, res, title, L, dim) {
    const n = L.narrow, s = n ? 1.0 : 1.3, yb = n ? 158 : 190, lab = (t, X, Y, o) => K.label(c, k, t, X, Y, Object.assign({ px: n ? 10 : 11, weight: 600, color: P.ink2, halo: false }, o || {}));
    lab(title, x, n ? 14 : 16, { px: n ? 11 : 12.5, weight: 700, color: P.ink });
    if (!res) { lab('нажми кнопку миссии', x, yb - 60, { color: P.ink3 }); return; }
    c.save(); if (dim) c.globalAlpha = 0.85;
    AdaBody.front(c, x, yb, s);
    // батарея: блок в корпусе, высота пропорциональна энергии (2,3 кВт·ч — весь нижний корпус)
    const bh = Math.max(4, 26 * res.parts.B.wh / 2300) * s; c.fillStyle = Anim.kit.alpha(P.cl, 0.75); c.fillRect(x - 14 * s, yb - 46 * s - bh, 28 * s, bh);
    // вычислитель: чип в верхней части корпуса, насыщенность по мощности
    c.fillStyle = Anim.kit.alpha(P.hy, 0.35 + 0.65 * res.parts.C.w / 130); c.fillRect(x - 7 * s, yb - 84 * s, 14 * s, 9 * s);
    // кисти: круги у кистей, радиус по массе
    for (const sx of [-1, 1]) { const hr = (2.5 + 3.5 * Math.sqrt(res.parts.H.m / 4.3)) * s; c.beginPath(); c.arc(x + sx * 28 * s, yb - 56 * s, hr, 0, 7); c.fillStyle = Anim.kit.alpha(P.e2e, 0.8); c.fill(); }
    // приводы ног и рук: точки на суставах, радиус по массе привода
    const dot = (X, Y, m, bad) => { c.beginPath(); c.arc(X, Y, (1.6 + 3.2 * Math.sqrt(m)) * s, 0, 7); c.fillStyle = Anim.kit.alpha(P.e2e, 0.85); c.fill(); if (bad) { c.strokeStyle = P.bad; c.lineWidth = 2.2; c.beginPath(); c.arc(X, Y, (1.6 + 3.2 * Math.sqrt(m)) * s + 3.5, 0, 7); c.stroke(); } };
    for (const sx of [-1, 1]) { dot(x + sx * 9 * s, yb - 43 * s, res.parts.L.m, false); dot(x + sx * 9 * s, yb - 25 * s, res.parts.L.m, !res.checks.legs); dot(x + sx * 9 * s, yb - 8 * s, res.parts.L.m, false); dot(x + sx * 18 * s, yb - 80 * s, res.parts.A.m, !res.checks.arms); dot(x + sx * 23 * s, yb - 69 * s, res.parts.A.m, false); }
    c.restore();
    // груз: коробка перед Адой
    c.fillStyle = Anim.kit.alpha(P.warn, 0.6); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.beginPath(); c.roundRect(x - 13 * s, yb - 66 * s, 26 * s, 16 * s, 2); c.fill(); c.stroke();
    lab(`${r1(res.mass.total)} кг`, x, yb + (n ? 12 : 14), { px: n ? 11 : 12, weight: 700, color: P.ink });
    lab(`руки ${okTxt(res.checks.arms)} · ноги ${okTxt(res.checks.legs)} · 2 ч ${okTxt(res.checks.time)}`, x, yb + (n ? 26 : 30), { color: res.checks.all ? P.good : P.bad, weight: 700 });
    // полосы: масса, средняя мощность, время работы
    const bx = x - w / 2 + (n ? 6 : 10), bw = w - (n ? 12 : 20), rows = [
      ['масса без груза', res.mass.total, 70, [[res.mass.frame, P.ink3], [res.mass.batt, P.cl], [res.mass.arms, P.e2e], [res.mass.hands, P.warn], [res.mass.legs, P.hy]], `${r1(res.mass.total)} кг`],
      ['средняя мощность', res.power.avg, 420, [[res.power.walkAvg, P.hy], [res.power.comp, P.cl], [res.power.idle - res.power.comp, P.ink3]], `${r0(res.power.avg)} Вт`],
      ['время работы', res.hours, 8, [[res.hours, res.checks.time ? P.good : P.bad]], `${r1(res.hours)} ч`],
    ];
    rows.forEach(([name, v, max, segs, val], i) => {
      const y = yb + (n ? 56 : 52) + i * (n ? 46 : 50), hgt = n ? 12 : 14;
      lab(name, bx, y - (n ? 9 : 10), { align: 'left', color: P.ink3, px: n ? 10 : 10.5 });
      c.fillStyle = P.bg; c.fillRect(bx, y, bw, hgt);
      let acc = 0; for (const [sv, col] of segs) { const wpx = Math.min(bw - acc, sv / max * bw); c.fillStyle = col; c.fillRect(bx + acc, y, Math.max(0, wpx), hgt); acc += wpx; }
      if (i === 2) { const mx = bx + 2 / max * bw; c.strokeStyle = P.ink; c.setLineDash([3, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(mx, y - 3); c.lineTo(mx, y + hgt + 3); c.stroke(); c.setLineDash([]); lab('2 ч', mx, y + hgt + (n ? 9 : 10), { color: P.ink3, px: 10 }); }
      lab(val, bx + bw, y - (n ? 9 : 10), { align: 'right', color: P.ink, weight: 700, px: n ? 10 : 11 });
      void v;
    });
  }
  function drawScene() {
    const L = fitLayout(cv(), [640, 400], [360, 440]), { c, k, W, H } = L, P = pal();
    c.clearRect(0, 0, W, H); c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 + 0.5, 8); c.lineTo(W / 2 + 0.5, H - 8); c.stroke();
    const w = W / 2 - 8;
    adaCol(c, k, P, W / 4, w, st.pinRes, st.pinnedName, L, true);
    adaCol(c, k, P, 3 * W / 4, w, st.shown ? st.res : null, 'текущая Ада', L, false);
  }
  /* ---------- таблица под сценой ---------- */
  function table() {
    const a = st.pinRes, b = st.shown ? st.res : null;
    if (!b) return `<p class="muted-s" style="margin:0">Нажми кнопку миссии: расчёт покажет массу, моменты, мощность и время работы текущей Ады рядом с закреплённой.</p>`;
    const row = (name, fa, fb, bad) => `<tr><th>${name}</th><td>${fa}</td><td class="${bad ? 'bad' : ''}">${fb}</td></tr>`;
    const tq = (r, part) => `нужно ${r1(r[part].peakNeed)} / ${r1(r[part].sustNeed)}, есть ${r1(r[part].peak)} / ${r1(r[part].sust)}`;
    const bind = { arms: 'не хватает момента приводам рук', legs: 'не хватает момента приводам ног', time: 'двух часов не выходит', null: 'задача выполнима' };
    return `<table class="bud-table"><thead><tr><th></th><th>${st.pinnedName}</th><th>текущая Ада</th></tr></thead><tbody>
      ${row('приводы ног · рук', `${a.parts.L.id} · ${a.parts.A.id}`, `${b.parts.L.id} · ${b.parts.A.id}`)}
      ${row('кисти', a.parts.H.name, b.parts.H.name)}
      ${row('вычислитель', a.parts.C.name, b.parts.C.name)}
      ${row('батарея', `${fmt(a.parts.B.wh / 1000, 2)} кВт·ч`, `${fmt(b.parts.B.wh / 1000, 2)} кВт·ч`)}
      ${row('масса без груза · с коробкой, кг', `${r1(a.mass.total)} · ${r1(a.mass.withLoad)}`, `${r1(b.mass.total)} · ${r1(b.mass.withLoad)}`)}
      ${row('момент плеча, Н·м (пик / долго)', tq(a, 'arm'), tq(b, 'arm'), !b.checks.arms)}
      ${row('момент колена, Н·м (ступенька / ходьба)', tq(a, 'knee'), tq(b, 'knee'), !b.checks.legs)}
      ${row('мощность, Вт: ходьба · покой · средняя', `${r0(a.power.walk)} · ${r0(a.power.idle)} · ${r0(a.power.avg)}`, `${r0(b.power.walk)} · ${r0(b.power.idle)} · ${r0(b.power.avg)}`)}
      ${row('пик мощности, Вт (ток при 48 В)', `${r0(a.power.peak)} (${r1(a.power.peakAmps)} А)`, `${r0(b.power.peak)} (${r1(b.power.peakAmps)} А)`)}
      ${row('время работы, ч', r1(a.hours), r1(b.hours), !b.checks.time)}
      ${row('задержка верхнего уровня, мс', `${r0(a.lat)} (${r1(a.latCm)} см пути)`, `${r0(b.lat)} (${r1(b.latCm)} см пути)`)}
      ${row('итог', bind[a.binding], bind[b.binding], !!b.binding)}
    </tbody></table>`;
  }
  function render() { drawScene(); setOut($('#bOut'), table()); if (ctl) ctl.update(); }
  let ctl = null;
  /* ---------- миссии ---------- */
  const dm = (cfg) => E.compute(cfg);
  const missions = [
    { short: 'Ада 6.1', title: 'Ада из урока 6.1 берёт коробку',
      text: 'Ада весит 28 кг, как в уроке 6.1: приводы ног 8513 (45 Н·м пиком), руки на приводах 5013 (9,7 Н·м), кисти Inspire по 0,54 кг, Orin NX с малой политикой и батарея как у G1. Задача на весь урок: взять со стола коробку 5 кг, нести её перед собой по квартире, подняться на ступеньку и проработать так два часа. Посчитай бюджет.',
      onEnter: () => set(Object.assign({}, E.DEFAULT)),
      bet: { q: 'Что подведёт Аду первым?', options: ['Батарея: двух часов не хватит', 'Руки: приводам плеча не хватит момента на коробку', 'Ничего: 5 кг для робота в 28 кг немного'], answer: (r) => (r.binding === 'arms' ? 1 : r.binding === 'time' ? 0 : 2) },
      action: { label: 'Посчитать бюджет', run: async () => { set(Object.assign({}, E.DEFAULT)); return run(); } },
      criteria: [{ label: 'Бюджет посчитан', test: (r) => !!r }],
      summary: (r) => `Ада 6.1 с коробкой: ${r1(r.mass.withLoad)} кг, руки ${okTxt(r.checks.arms)}, ноги ${okTxt(r.checks.legs)}, ${r1(r.hours)} ч`,
      explain: (r) => `Коробка 5 кг в двух руках требует от привода плеча ${r1(r.arm.peakNeed)} Н·м, чтобы взять её вытянутыми руками, и ${r1(r.arm.sustNeed)} Н·м, чтобы нести перед собой, а привод 5013 даёт ${r1(r.arm.peak)} Н·м пиком и ${fmt(r.arm.sust, 2)} Н·м длительно. Ноги тоже на пределе: колену на ступеньке с коробкой нужно ${r1(r.knee.peakNeed)} Н·м при ${r1(r.knee.peak)} у привода 8513, а при ходьбе ${r1(r.knee.sustNeed)} Н·м длительно при ${r1(r.knee.sust)}. Батарея как раз не подводит: средняя мощность ${r0(r.power.avg)} Вт, из них ходьба ${r0(r.power.walkAvg)} Вт, и ${fmt(r.parts.B.wh / 1000, 2)} кВт·ч хватает на ${r1(r.hours)} ч. Ада из урока 6.1 ходила без груза, и приводов ей хватало. Коробка меняет бюджет сразу в двух местах.` },
    { short: 'Руки', title: 'Приводы рук под коробку',
      text: 'Поставь в руки приводы, которые держат коробку и пиком, и длительно. Рука из четырёх приводов, поэтому каждая ступень вверх добавляет массу на обе руки.',
      controls: ['arms'], onEnter: () => set({ arms: '5013' }),
      bet: { q: 'На сколько потяжелеет Ада с приводами рук 8513 вместо 5013?', options: ['Меньше чем на килограмм', 'Примерно на 4 кг', 'Больше чем на 10 кг'], answer: (r) => { const d = r.mass.total - dm(Object.assign({}, r.cfg, { arms: '5013' })).mass.total; return d < 1 ? 0 : d > 10 ? 2 : 1; } },
      action: { label: 'Посчитать бюджет', run: async () => run() },
      criteria: [{ label: 'Приводы плеча держат коробку: и пик, и длительно', test: (r) => r.checks.arms }],
      summary: (r) => `руки ${r.parts.A.id}: ${r1(r.mass.total)} кг, руки ${okTxt(r.checks.arms)}, ноги ${okTxt(r.checks.legs)}`,
      explain: (r) => { const d = r.mass.total - dm(Object.assign({}, r.cfg, { arms: '5013' })).mass.total; return `Приводы ${r.parts.A.id} держат ${r1(r.arm.peak)} Н·м пиком и ${r1(r.arm.sust)} Н·м длительно при нужных ${r1(r.arm.peakNeed)} и ${r1(r.arm.sustNeed)}. Восемь приводов рук прибавили ${r1(d)} кг, и теперь Ада весит ${r1(r.mass.total)} кг. Масса не остаётся в руках: колену на ступеньке нужно уже ${r1(r.knee.peakNeed)} Н·м${r.checks.legs ? ', и ноги это держат' : ` при ${r1(r.knee.peak)} у привода ${r.parts.L.id}, а при ходьбе ${r1(r.knee.sustNeed)} Н·м длительно при ${r1(r.knee.sust)}`}. Так одна замена тянет за собой другую.`; } },
    { short: 'Ноги', title: 'Приводы ног под новую массу',
      text: 'Теперь подбери приводы ног: колено должно выдержать подъём на ступеньку с коробкой пиком и час за часом ходьбы длительно, без перегрева.',
      controls: ['arms', 'legs'], onEnter: () => set({ legs: '8513' }),
      bet: { q: 'Хватит ли ног на приводах 8518 (63 Н·м) со ступенькой и коробкой?', options: ['Хватит и пика, и длительного момента', 'Нет, нужен 10413', 'Хватит пика, но при ходьбе моторы перегреются'], answer: (r) => { const q = dm(Object.assign({}, r.cfg, { legs: '8518' })); return q.checks.legs ? 0 : q.checks.kneePeak ? 2 : 1; } },
      action: { label: 'Посчитать бюджет', run: async () => run() },
      criteria: [{ label: 'Руки держат коробку', test: (r) => r.checks.arms }, { label: 'Ноги держат ступеньку и ходьбу', test: (r) => r.checks.legs }],
      summary: (r) => `ноги ${r.parts.L.id}: ${r1(r.mass.total)} кг, ноги ${okTxt(r.checks.legs)}, ${r1(r.hours)} ч`,
      explain: (r) => `Приводы ${r.parts.L.id} дают колену ${r1(r.knee.peak)} Н·м пиком при нужных ${r1(r.knee.peakNeed)} на ступеньке и ${r1(r.knee.sust)} Н·м длительно при нужных ${r1(r.knee.sustNeed)} в ходьбе. Запас по длительному моменту важнее, чем по пику: моторы G1 в TWIST перегревались через 5–10 минут приседаний, потому что работали у предела долго. Ада теперь весит ${r1(r.mass.total)} кг против 28 у Ады из 6.1 и работает ${r1(r.hours)} ч: батареи по-прежнему хватает, потому что груз и лишние ${r1(r.mass.total - 28)} кг приводов добавили к ходьбе всего ${r0(r.power.walkAvg - dm(E.DEFAULT).power.walkAvg)} Вт.` },
    { short: 'Кисти', title: 'Ловкие кисти: тросы или моторы в пальцах',
      text: 'Поставь Аде кисти Shadow: 20 моторов в основании тянут 24 сустава сорока тросами, 4,3 кг вместе с основанием. Пальцы у такой кисти лёгкие, а масса переезжает на конец руки целиком. Подбери приводы так, чтобы Ада снова держала коробку и ступеньку.',
      controls: ['hands', 'arms', 'legs'], onEnter: () => set({ hands: 'inspire' }),
      bet: { q: 'Что придётся менять с кистями по 4,3 кг?', options: ['Только приводы рук', 'Приводы рук и ног', 'Ничего: тросы вынесли моторы из пальцев, и кисть лёгкая'], answer: (r) => { const q = dm(Object.assign({}, r.cfg, { hands: 'shadow' })); if (q.checks.arms && q.checks.legs) return 2; const arms = E.minAct(q.arm.peakNeed, q.arm.sustNeed); const q2 = dm(Object.assign({}, q.cfg, { arms })); return q2.checks.legs ? 0 : 1; } },
      action: { label: 'Посчитать бюджет', run: async () => run() },
      criteria: [{ label: 'Кисти Shadow', test: (r) => r.cfg.hands === 'shadow' }, { label: 'Руки держат коробку', test: (r) => r.checks.arms }, { label: 'Ноги держат ступеньку и ходьбу', test: (r) => r.checks.legs }],
      summary: (r) => `кисти ${r.parts.H.name}, руки ${r.parts.A.id}, ноги ${r.parts.L.id}: ${r1(r.mass.total)} кг, ${r1(r.hours)} ч`,
      explain: (r) => { const base = dm(Object.assign({}, r.cfg, { hands: 'inspire', arms: '8513', legs: '8518' })); return `Кисть 4,3 кг вместо 0,54 кг на конце руки длиной 0,37 м требует от плеча ${r1(r.arm.sustNeed)} Н·м длительно, и привод 8513 с его ${fmt(18.9, 1)} Н·м уже не держит. Пришлось поставить ${r.parts.A.id} в руки и ${r.parts.L.id} в ноги, и Ада весит ${r1(r.mass.total)} кг, на ${r1(r.mass.total - base.mass.total)} кг больше, чем с кистями Inspire на тех же приводах 8513 и 8518. Время работы упало до ${r1(r.hours)} ч${r.checks.time ? ', пока ещё больше двух' : ', меньше двух'}. Тросы делают лёгкими пальцы, но не руку: моторы с основанием всё равно висят на конце руки, и за ловкость платят приводы плеча.`; } },
    { short: 'Модель', title: 'Модель верхнего уровня на борту',
      text: 'Политике Ады нужна модель зрения и языка (урок 3.7). Вариантов три: оставить на борту малую политику на Orin NX, держать VLA в облаке или поставить Thor и считать VLA на борту. Переключи вычислитель и посчитай.',
      controls: ['hands', 'arms', 'legs', 'comp'], onEnter: () => set({ comp: 'nx' }),
      bet: { q: 'С Thor на 130 Вт вместо Orin NX на 25 Вт время работы Ады…', options: ['почти не изменится: главное едят моторы', 'упадёт на треть или больше', 'вырастет: Thor даёт больше вычислений на ватт'], answer: (r) => { const a = dm(Object.assign({}, r.cfg, { comp: 'nx' })).hours, b = dm(Object.assign({}, r.cfg, { comp: 'thor' })).hours; return b > a ? 2 : 1 - b / a >= 0.3 ? 1 : 0; } },
      action: { label: 'Посчитать бюджет', run: async () => run() },
      criteria: [{ label: 'VLA работает на борту: вычислитель Thor', test: (r) => r.cfg.comp === 'thor' }],
      summary: (r) => `${r.parts.C.name}: ${r0(r.power.avg)} Вт, ${r1(r.hours)} ч, задержка ${r0(r.lat)} мс`,
      explain: (r) => { const a = dm(Object.assign({}, r.cfg, { comp: 'nx' })), cl = dm(Object.assign({}, r.cfg, { comp: 'cloud' })); return `Thor добавил ${r0(r.power.comp - a.power.comp)} Вт к покою: средняя мощность выросла с ${r0(a.power.avg)} до ${r0(r.power.avg)} Вт, и это сравнимо с ходьбой, на которую уходит ${r0(r.power.walkAvg)} Вт в среднем. Время работы упало с ${r1(a.hours)} до ${r1(r.hours)} ч${r.checks.time ? '' : ', меньше двух'}. Облако обошлось бы в те же ${r0(cl.power.comp)} Вт на борту, но ответ приходил бы через ${r0(cl.lat)} мс, за которые Ада на 0,5 м/с проходит ${r1(cl.latCm)} см (урок 3.7), а контроллер тела из урока 6.4 в любом случае остаётся на борту.`; } },
    { short: 'Батарея', title: 'Батарея под два часа',
      text: 'Верни Аде два часа работы с VLA на борту. Батарея как у H1 хранит вдвое больше, как у Figure 03 — в пять раз больше, и каждая весит по 130 Вт·ч на килограмм.',
      controls: ['hands', 'arms', 'legs', 'comp', 'batt'], onEnter: () => set({ comp: 'thor', batt: 'g1' }),
      bet: { q: 'Батарея 0,86 кВт·ч вместо 0,43 даст Аде…', options: ['вдвое больше времени', 'меньше чем вдвое: батарея сама себя несёт', 'больше чем вдвое'], answer: (r) => { const a = dm(Object.assign({}, r.cfg, { batt: 'g1' })).hours, b = dm(Object.assign({}, r.cfg, { batt: 'h1' })).hours, q = b / a; return q < 1.98 ? 1 : q > 2.02 ? 2 : 0; } },
      action: { label: 'Посчитать бюджет', run: async () => run() },
      criteria: [{ label: 'VLA на борту (Thor)', test: (r) => r.cfg.comp === 'thor' }, { label: 'Два часа работы', test: (r) => r.checks.time }, { label: 'Руки и ноги держат коробку и ступеньку', test: (r) => r.checks.arms && r.checks.legs }],
      summary: (r) => `батарея ${fmt(r.parts.B.wh / 1000, 2)} кВт·ч: ${r1(r.mass.total)} кг, ${r1(r.hours)} ч, ноги ${okTxt(r.checks.legs)}`,
      explain: (r) => { const a = dm(Object.assign({}, r.cfg, { batt: 'g1' })), f = dm(Object.assign({}, r.cfg, { batt: 'f3' })); return `Батарея ${fmt(r.parts.B.wh / 1000, 2)} кВт·ч весит ${r1(r.mass.batt)} кг, и Ада работает ${r1(r.hours)} ч против ${r1(a.hours)} с батареей 0,43 кВт·ч: в ${fmt(r.hours / a.hours, 2)} раза дольше, а не в ${fmt(r.parts.B.wh / a.parts.B.wh, 1)}, потому что лишние ${r1(r.mass.batt - a.mass.batt)} кг тоже надо носить. Колену на ступеньке теперь нужно ${r1(r.knee.peakNeed)} Н·м при ${r1(r.knee.peak)} у привода ${r.parts.L.id}. Батарея как у Figure 03 на 2,3 кВт·ч весила бы ${r1(f.mass.batt)} кг: времени ${r1(f.hours)} ч, но колену понадобилось бы ${r1(f.knee.peakNeed)} Н·м${f.checks.legs ? '' : `, больше, чем даёт любой привод из набора (${r1(E.ACT['10413'].peak)} у 10413)`}. Робот с такой батареей — другого размера: Figure 03 и Atlas на 90 кг.`; } },
    { short: 'Свободно', final: true, title: 'Свободный режим',
      text: 'Собери самую лёгкую Аду, которая берёт коробку 5 кг, поднимается с ней на ступеньку и работает два часа с VLA на борту. Потом проверь, что происходит с кистями Sharpa Wave на 22 степени свободы и с батареей 2,3 кВт·ч. Кнопка «Закрепить» делает текущую Аду опорной для сравнения.',
      controls: 'all',
      action: { label: 'Посчитать бюджет', run: async () => run() },
      summary: (r) => `${r.parts.L.id} · ${r.parts.A.id} · ${r.parts.H.name} · ${r.parts.C.name.split(',')[0]} · ${fmt(r.parts.B.wh / 1000, 2)} кВт·ч: ${r1(r.mass.total)} кг, ${r1(r.hours)} ч, ${r.checks.all ? 'задача выполнима' : 'не выполнима'}` },
  ];
  /** Перед каждой миссией опорной становится Ада, с которой закончилась прошлая миссия. */
  function onStep(i) { if (i > 0 && ctl) { const prev = ctl.ctx.results[i - 1]; if (prev) pin(prev.cfg, `после миссии ${i}`); } else if (i === 0) pin(E.DEFAULT, 'Ада из урока 6.1'); }
  function init() {
    for (const kkey of Object.keys(names)) segBind('#b' + kkey[0].toUpperCase() + kkey.slice(1), (v) => set({ [kkey]: v }));
    $('#bPin').addEventListener('click', () => { if (st.res) pin(st.res.cfg, 'закреплённая'); });
    st.pinRes = E.compute(st.pinned);
    redrawOn(render);
    ctl = mountMissions('#bMis', missions, { reset() { st.shown = false; st.res = null; set(Object.assign({}, E.DEFAULT)); pin(E.DEFAULT, 'Ада из урока 6.1'); }, state }, { controls: { legs: '#wrapBLegs', arms: '#wrapBArms', hands: '#wrapBHands', comp: '#wrapBComp', batt: '#wrapBBatt', pin: '#wrapBPin' }, scene: '#bCv', onStep });
    render();
    return ctl;
  }
  return { init, st, missions, api: { render, set, state, run, pin, drawScene, table } };
})();


/* =====================================================================
   Раздел 1: Ада спереди с подписями частей, которые выбираются в лаборатории (статичный канвас).
   ===================================================================== */
function initParts() {
  const cv = $('#partsCv'); if (!cv) return;
  const draw = () => {
    const { c, k } = HeroKit.fit(cv, 220, 300), P = pal(), W = 220, H = 300;
    c.clearRect(0, 0, W, H); c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const x = 64, yb = 262, s = 1.9;
    AdaBody.front(c, x, yb, s);
    const bh = 20 * s; c.fillStyle = Anim.kit.alpha(P.cl, 0.75); c.fillRect(x - 14 * s, yb - 46 * s - bh, 28 * s, bh);
    c.fillStyle = Anim.kit.alpha(P.hy, 0.85); c.fillRect(x - 7 * s, yb - 84 * s, 14 * s, 9 * s);
    const dot = (X, Y, r) => { c.beginPath(); c.arc(X, Y, r, 0, 7); c.fillStyle = Anim.kit.alpha(P.e2e, 0.85); c.fill(); };
    for (const sx of [-1, 1]) { dot(x + sx * 9 * s, yb - 43 * s, 5); dot(x + sx * 9 * s, yb - 25 * s, 5); dot(x + sx * 9 * s, yb - 8 * s, 5); dot(x + sx * 18 * s, yb - 80 * s, 4.5); dot(x + sx * 23 * s, yb - 69 * s, 4.5); c.beginPath(); c.arc(x + sx * 28 * s, yb - 56 * s, 7, 0, 7); c.fillStyle = Anim.kit.alpha(P.warn, 0.85); c.fill(); }
    const lab = (t, X, Y, col) => HeroKit.label(c, k, t, X, Y, { px: 10, weight: 650, color: col, halo: false, align: 'left' });
    const lead = (x1, y1, x2, y2, col) => { c.strokeStyle = col; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const lx = 122;
    lead(x + 7 * s, yb - 80 * s, lx - 4, yb - 86 * s, P.hy); lab('вычислитель', lx, yb - 86 * s, P.hy);
    lead(x + 14 * s, yb - 56 * s, lx - 4, yb - 62 * s, P.cl); lab('батарея', lx, yb - 62 * s, P.cl);
    lead(x + 28 * s + 7, yb - 56 * s, lx + 20, yb - 44 * s, P.warn); lab('кисть и', lx, yb - 44 * s, P.warn); lab('кончики пальцев', lx, yb - 38 * s, P.warn);
    lead(x + 9 * s + 5, yb - 25 * s, lx - 4, yb - 22 * s, P.e2e); lab('приводы ног', lx, yb - 22 * s, P.e2e);
    lead(x + 18 * s + 4, yb - 80 * s, x + 48 * s, yb - 98 * s, P.e2e); lab('приводы рук', x + 40 * s - 56, yb - 104 * s, P.e2e);
  };
  redrawOn(draw); draw();
}

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
const QUIZ = [
  { q: 'Чем больше передаточное число редуктора, тем сильнее сустав. Почему гуманоиды для обучения всё же ставят в ноги приводы с малым передаточным числом?', o: ['Большие редукторы слишком дорогие', 'С ростом передаточного числа инерция ротора на выходе растёт как его квадрат: привод сильнее бьёт при касании пола, хуже уступает толчку, а силу в стопе уже не оценить по току мотора', 'Большие редукторы не работают с нейросетевыми политиками'], a: 1, e: 'Так устроены Mini Cheetah, Berkeley Humanoid и ноги Unitree. Через редуктор 100 : 1 трение и инерция съедают связь между силой на выходе и током, и производителям приходится ставить датчики момента на выход.' },
  { q: 'У кисти Shadow 24 сустава и 20 моторов, у Inspire 12 суставов и 6 приводов. Значит ли это, что суставов без мотора нельзя двигать?', o: ['Да, такие суставы неподвижны', 'Нет: один привод через тяги или тросы ведёт несколько суставов сразу, но тогда их углы связаны и по отдельности не задаются', 'Нет: ими управляет пружина, а не привод'], a: 1, e: 'Это недоприводные суставы: у Shadow четыре движения пальцев связаны, у Inspire шесть приводов двигают двенадцать суставов через тяги. Политика управляет только тем числом величин, сколько есть приводов.' },
  { q: 'Тросы выносят моторы из пальцев в предплечье. Почему это не делает руку гуманоида легче?', o: ['Моторы никуда не исчезают: они переезжают в основание кисти, которое всё равно висит на конце руки, а приводу плеча важна вся масса за запястьем', 'Тросы весят больше моторов', 'Тросовые кисти всегда дороже, и экономят на приводах рук'], a: 0, e: 'Кисть Shadow весит 4,3 кг вместе с основанием, где стоят 20 моторов. В лаборатории такие кисти потребовали приводов 8518 в руках и 10413 в ногах. Лёгкими становятся пальцы: у RUKA это дало больше силы при тех же моторах, что у LEAP.' },
  { q: 'Digit 360 называют тактильным датчиком. Что в нём есть кроме камеры за гелем, как у GelSight?', o: ['Только более чёткая камера', 'Датчики давления, вибрации, тепла и газа, а также нейросетевой ускоритель прямо в пальце, который обрабатывает касание на месте', 'Лазерный дальномер'], a: 1, e: 'Авторы сравнивают ускоритель в пальце с рефлекторной дугой: реакция на событие касания не ждёт, пока данные дойдут до главного вычислителя. Камера даёт 240 кадров в секунду, а вибрации текстуры слышны до 10 кГц.' },
  { q: 'Самый мощный вычислитель на борту даёт модели больше возможностей. Почему его всё же не ставят всем гуманоидам?', o: ['Он не помещается в корпус', 'Он тратит столько же энергии, сколько ходьба: в лаборатории Thor срезал время работы Ады на треть и больше при любой конфигурации', 'Большим моделям на борту нечего делать'], a: 1, e: 'Thor потребляет до 130 Вт, Orin NX до 40 Вт, а на ходьбу Ады в среднем уходит около ста ватт. Поэтому компании делят модель между бортом и облаком или ставят вычислитель под размер робота.' },
  { q: 'Вдвое большая батарея даст роботу вдвое больше времени работы?', o: ['Да, время растёт вместе с энергией', 'Нет, больше чем вдвое: большие батареи эффективнее', 'Нет, меньше чем вдвое: батарея тяжелее, нести её дороже, а на ступеньке её массу должны держать колени'], a: 2, e: 'В лаборатории батарея как у H1 вместо батареи как у G1 давала в 1,5–2 раза больше времени при любой конфигурации. Батарея как у Figure 03 на 2,3 кВт·ч весила бы почти 18 кг, и колену Ады не хватило бы ни одного привода из набора.' },
  { q: 'В таблице привода написано: пик 62,6 Н·м, длительно 26,1 Н·м. Что из этого важно для часа ходьбы с грузом?', o: ['Пик: ходьба состоит из коротких усилий', 'Длительный момент: он задан нагревом мотора, и моторы, которые работают у пика долго, перегреваются, как у робота Unitree в TWIST через несколько минут приседаний', 'Оба числа равнозначны'], a: 1, e: 'У приводов Berkeley Humanoid длительный момент составляет 42–47 % пикового, у приводов Nadia — около четверти. Пик нужен для ступеньки, длительный момент — для часа ходьбы.' },
  { q: 'Облако снимает проблему бортовых вычислений: модель любого размера, а робот только исполняет. Что не так?', o: ['В облаке нельзя запускать модели зрения', 'Ответ приходит с задержкой около четверти секунды, за которую идущий робот проходит сантиметры, а контроллер тела и регуляторы суставов должны оставаться на борту и работать десятки и тысячи раз в секунду', 'Облачные модели не умеют работать с несколькими роботами'], a: 1, e: 'Так устроены Gemini Robotics из урока 3.7 с декодером на роботе и системы урока 6.4 с контроллером тела внизу. Облако подходит для редких решений, а не для равновесия.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('stats', initStats); safe('parts', initParts);
    safe('budget', () => { mis.budget = Budget.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['bMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l65 = { mis, Budget, L65, QUIZ }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
