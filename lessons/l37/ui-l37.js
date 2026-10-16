/* =====================================================================
   ui-l37.js — урок 3.7 «Двухуровневые архитектуры: Helix, GR00T,
   Gemini Robotics». Схемы и интерактивы:
   0) анимированные схемы (shared/anim.js): Helix во времени (S2 и S1)
      и оркестратор Gemini Robotics-ER, который раздаёт шаги VLA;
   1) лаборатория 1: шкала времени и возраст данных — медленная модель
      1–10 Гц, задержка сети, быстрая система 200 Гц;
   2) лаборатория 2: рука Ады догоняет чашку, одна модель и две системы
      рядом на одной сцене, смена просьбы на ходу;
   3) сортировка задач по уровням S2 / S1 / S0 (shared/cards.js) и квиз.
   Движок — l37/engine.js (без DOM) поверх shared/arm-core.js.
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
const ms = (s) => fmt(s * 1000, 0);
const cm = (m) => fmt(m * 100, m * 100 < 1 ? 2 : 1);
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);
/** Канвас графика: на узком экране логическая высота больше, чтобы подписи не слипались. */
function plotFit(cv, W, H, Hn) {
  const hh = cv.getBoundingClientRect().width < 460 ? Hn : H, ar = `${W} / ${hh}`;
  if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
  const f = HeroKit.fit(cv, W, hh); return { c: f.c, k: f.k, H: hh };
}
const lbl = (c, k, t, x, y, o) => HeroKit.label(c, k, t, x, y, Object.assign({ px: 11, weight: 600 }, o || {}));
/** Подпись пустого графика: что сделать, чтобы он заполнился. */
function emptyMsg(c, k, W, H, lines, P) { lines.forEach((t, i) => lbl(c, k, t, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 17 * k, { px: 12, color: P.ink3, halo: false })); }

/* =====================================================================
   0a. Схема Helix во времени: S2 раз в 130 мс, S1 каждые 5 мс
   ===================================================================== */
(() => {
  const SLOW = 0.13, TICK = 0.005, SLOWMO = 10;
  /** G: { x0, x1 — полоса времени; win — окно, с; lanes: { s2, s1, out } — y; labels: 'left' | 'top' } */
  function drawDual(c, k, t, P0, A, G) {
    const P = { hy: P0.spr, e2e: P0.mot, cl: P0.out, ink: P0.ink, ink2: P0.ink2, ink3: P0.ink3, line: P0.line, grid: P0.grid, surf: P0.surf, surf2: P0.surf2 };
    const { lab, rect, line } = A, win = G.win, now = ((t / SLOWMO) % win + win) % win;
    const X = (s) => G.x0 + (G.x1 - G.x0) * s / win, Y = G.lanes;
    const off = 0.045;                                   // первый вывод S2 начат до окна
    const blocks = []; for (let s = -off; s < win; s += SLOW) blocks.push({ a: s, b: s + SLOW, n: blocks.length + 1 });
    const latestAt = (s) => { let n = 0; for (const b of blocks) if (b.b + 0.012 <= s) n = b.n; return n; };   // 12 мс — передача вектора
    // подписи строк
    const names = G.labels === 'left'
      ? [['S2 · 7 млрд · 7–9 Гц', Y.s2], ['S1 · 80 млн · 200 Гц', Y.s1], ['команды телу', Y.out]]
      : [['S2: модель зрения и языка, 7–9 Гц', Y.s2], ['S1: политика, 200 Гц', Y.s1], ['команды верхней части тела', Y.out]];
    names.forEach(([tx, y], i) => {
      const col = [P.hy, P.e2e, P.ink2][i];
      if (G.labels === 'left') lab(c, k, tx, G.x0 - 10, y, { align: 'right', px: 11, weight: 700, color: col, haloColor: P.surf });
      else lab(c, k, tx, G.x0, i === 1 ? y + 44 : y - 24, { align: 'left', px: 11, weight: 700, color: col, haloColor: P.surf });
    });
    // ось времени
    line(c, [[G.x0, G.axis], [G.x1, G.axis]], P.line, 1.2);
    for (let s = 0; s <= win + 1e-9; s += G.step) {
      line(c, [[X(s), G.axis - 3], [X(s), G.axis + 3]], P.ink3, 1);
      lab(c, k, `${fmt(s * 1000, 0)} мс`, X(s), G.axis + 13, { px: 10, color: P.ink3, halo: false, align: s === 0 ? 'left' : s >= win - 1e-9 ? 'right' : 'center' });
    }
    lab(c, k, 'время · замедлено в 10 раз', (G.x0 + G.x1) / 2, G.axis + 28, { px: 10.5, color: P.ink3, haloColor: P.surf });
    // S2: выводы
    c.save(); c.beginPath(); c.rect(G.x0, 0, G.x1 - G.x0, G.axis); c.clip();
    for (const b of blocks) {
      const done = now >= b.b, active = now >= b.a && now < b.b, x0 = X(b.a), x1 = X(b.b);
      rect(c, x0 + 1, Y.s2 - 9, x1 - x0 - 2, 18, 4, rgba(P.hy, active ? 0.35 : done ? 0.22 : 0.08), rgba(P.hy, active || done ? 0.9 : 0.35), 1.2);
      if (now >= b.a) { c.fillStyle = P.cl; c.beginPath(); c.moveTo(x0, Y.s2 - 12); c.lineTo(x0 - 4, Y.s2 - 19); c.lineTo(x0 + 4, Y.s2 - 19); c.closePath(); c.fill(); }   // кадр
      if (active) lab(c, k, 'вывод ≈ 130 мс', (Math.max(x0, G.x0) + Math.min(x1, G.x1)) / 2, Y.s2, { px: 10, color: P.ink, halo: false });
      // латентный вектор летит вниз
      if (now >= b.b && b.b >= 0) {
        const u = Math.min(1, (now - b.b) / 0.012), yy = Y.s2 + 12 + (Y.s1 - Y.s2 - 30) * u, xx = X(b.b);
        if (u < 1) line(c, [[xx, Y.s2 + 10], [xx, yy]], rgba(P.hy, 0.7), 1.4, [3, 3]);
        rect(c, xx - 8, yy - 8, 16, 16, 3, P.hy, null);
        lab(c, k, String(b.n), xx, yy, { px: 9.5, weight: 800, color: '#fff', halo: false });
        if (b.n === latestAt(now) && u >= 1) lab(c, k, 'латентный вектор', xx + 12, yy, { align: 'left', px: 10.5, weight: 700, color: P.hy, haloColor: P.surf });
      }
    }
    // S1: такты каждые 5 мс, подложка — какой вектор в ходу
    for (const b of blocks) {
      const s0 = Math.max(0, b.b + 0.012), nb = blocks.find((x) => x.n === b.n + 1), s1 = nb ? Math.min(win, nb.b + 0.012) : win;
      if (s1 <= 0 || s0 >= win || now < s0) continue;
      c.fillStyle = rgba(b.n % 2 ? P.hy : P.e2e, 0.08); c.fillRect(X(s0), Y.s1 - 12, X(Math.min(s1, now)) - X(s0), 24);
    }
    const nT = Math.floor(win / TICK);
    for (let i = 0; i <= nT; i++) {
      const s = i * TICK; if (s > now) break;
      const x = X(s), cur = now - s < TICK, ver = latestAt(s);
      line(c, [[x, Y.s1 - 7], [x, Y.s1 + 7]], cur ? P.e2e : rgba(P.e2e, 0.55), cur ? 2.4 : 1.3);
      c.fillStyle = rgba(P.cl, cur ? 1 : 0.4); c.beginPath(); c.arc(x, Y.s1 - 10, cur ? 2.4 : 1.3, 0, 7); c.fill();       // свежий кадр
      if (ver) { line(c, [[x, Y.out - 7], [x, Y.out + 5]], cur ? P.ink : rgba(P.ink3, 0.6), cur ? 1.8 : 1); c.fillStyle = cur ? P.ink : rgba(P.ink3, 0.6); c.beginPath(); c.moveTo(x, Y.out + 9); c.lineTo(x - 3, Y.out + 3); c.lineTo(x + 3, Y.out + 3); c.closePath(); c.fill(); }
      if (cur) {
        line(c, [[x, Y.s1 + 9], [x, Y.out - 9]], rgba(P.ink2, 0.5), 1, [2, 3]);
        const right = x > (G.x0 + G.x1) / 2; lab(c, k, ver ? `вектор №${ver} + свежий кадр` : 'вектора ещё нет', right ? x - 6 : x + 6, Y.s1 + 22, { align: right ? 'right' : 'left', px: 10.5, weight: 700, color: P.e2e, haloColor: P.surf });
      }
    }
    c.restore();
    // курсор «сейчас»
    line(c, [[X(now), Y.s2 - 26], [X(now), G.axis]], rgba(P.ink, 0.35), 1, [4, 4]);
  }
  Anim.add('dual', {
    W: 720, H: 330, start: 1.6, narrowAt: 600,
    draw(c, k, t, P, A) { drawDual(c, k, t, P, A, { x0: 175, x1: 705, win: 0.4, step: 0.1, axis: 288, labels: 'left', lanes: { s2: 70, s1: 168, out: 238 } }); },
    narrow: { W: 360, H: 390, draw(c, k, t, P, A) { drawDual(c, k, t, P, A, { x0: 14, x1: 346, win: 0.2, step: 0.05, axis: 336, labels: 'top', lanes: { s2: 70, s1: 168, out: 284 } }); } },
  });
})();

/* =====================================================================
   0b. Схема оркестратора: Gemini Robotics-ER планирует, VLA двигает
   ===================================================================== */
(() => {
  const T = 15;
  const PH = [ // [начало, конец, подпись]
    [0, 1.4, 'Человек: «Разложи мусор по правилам моего города»'],
    [1.4, 3.6, 'Оркестратор ищет правила сортировки: вызов поиска'],
    [3.6, 4.6, 'Оркестратор составляет план из двух шагов'],
    [4.6, 5.6, 'Шаг 1 словами исполнителю: «положи банку в синий бак»'],
    [5.6, 8.2, 'Исполнитель выдаёт пачки движений, рука несёт банку'],
    [8.2, 9.3, 'Кадры с камеры: оркестратор проверяет, что шаг выполнен'],
    [9.3, 10.3, 'Шаг 2 словами: «положи кожуру банана в зелёный бак»'],
    [10.3, 12.9, 'Исполнитель выдаёт пачки движений, рука несёт кожуру'],
    [12.9, 14.2, 'Проверка по камере: оба шага выполнены'],
    [14.2, 15, 'Готово'],
  ];
  function box(c, k, A, P, b, col, title, sub, on) {
    A.rect(c, b[0], b[1], b[2], b[3], 10, rgba(col, on ? 0.2 : 0.08), on ? col : rgba(col, 0.6), on ? 2 : 1.4);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + 17, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + 34, { px: 10.5, color: P.ink2, haloColor: P.surf });
  }
  /** Ломаная со стрелкой и пакет, который бежит по ней при u ∈ (0, 1). */
  function packet(c, k, A, P, pts, u, col, text) {
    const n = pts.length - 1, L = []; let tot = 0;
    for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(d); tot += d; }
    if (n > 1) A.line(c, pts.slice(0, n), rgba(col, 0.55), 1.6);
    A.arrow(c, pts[n - 1][0], pts[n - 1][1], pts[n][0], pts[n][1], rgba(col, 0.55), 1.6, 6);
    if (u <= 0 || u >= 1) return;
    let d = A.ease(u) * tot, i = 0; while (i < n - 1 && d > L[i]) { d -= L[i]; i++; }
    const s = L[i] ? Math.min(1, d / L[i]) : 0, x = A.lerp(pts[i][0], pts[i + 1][0], s), y = A.lerp(pts[i][1], pts[i + 1][1], s);
    A.circle(c, x, y, 5, col, null);
    if (text) {   // у края канваса подпись сдвигается внутрь, пакет остаётся на пути
      const W = c.canvas.width / c.getTransform().a; HeroKit.font(c, k, 10.5, 700); const hw = c.measureText(text).width / 2 + 4;
      A.lab(c, k, text, Math.min(Math.max(x, hw), W - hw), y - 13, { px: 10.5, weight: 700, color: col, haloColor: P.surf });
    }
  }
  function scene(c, k, A, P, b, u) { // стол, два бака, рука и предметы; u — время цикла
    A.rect(c, b[0], b[1], b[2], b[3], 10, rgba(P.ink3, 0.06), P.line, 1.2);
    A.lab(c, k, 'робот у стола, вид спереди', b[0] + 10, b[1] + 14, { align: 'left', px: 10.5, color: P.ink2, haloColor: P.surf });
    const camX = b[0] + b[2] - 16, camY = b[1] + 16;   // камера
    A.rect(c, camX - 8, camY - 5, 16, 10, 2, P.out, null); A.circle(c, camX, camY, 2.5, P.surf, null);
    const tableY = b[1] + b[3] - 24;
    A.line(c, [[b[0] + 10, tableY], [b[0] + b[2] - 10, tableY]], P.ink3, 3);
    const binB = [b[0] + b[2] - 84, tableY - 30], binG = [b[0] + b[2] - 34, tableY - 30];
    A.rect(c, binB[0] - 14, binB[1], 28, 30, 3, rgba(P.out, 0.25), P.out, 1.4); A.rect(c, binG[0] - 14, binG[1], 28, 30, 3, rgba(P.good, 0.25), P.good, 1.4);
    A.lab(c, k, 'синий', binB[0], tableY + 11, { px: 9.5, color: P.ink3, halo: false }); A.lab(c, k, 'зелёный', binG[0], tableY + 11, { px: 9.5, color: P.ink3, halo: false });
    const can0 = [b[0] + 34, tableY - 6], peel0 = [b[0] + 64, tableY - 4];
    const s1 = A.seg(u, 5.6, 8.2), s2 = A.seg(u, 10.3, 12.9);
    const path = (p0, p1, s) => [A.lerp(p0[0], p1[0], A.ease(s)), A.lerp(p0[1], p1[1], A.ease(s)) - Math.sin(Math.PI * s) * 34];
    const can = s1 > 0 ? path(can0, [binB[0], binB[1] + 8], s1) : can0, peel = s2 > 0 ? path(peel0, [binG[0], binG[1] + 8], s2) : peel0;
    A.rect(c, can[0] - 5, can[1] - 9, 10, 14, 2, P.ink3, null);
    c.fillStyle = '#e8c547'; c.beginPath(); c.ellipse(peel[0], peel[1], 9, 4, -0.4, 0, 7); c.fill();
    const sh = [b[0] + 20, b[1] + 40], hand = s1 > 0 && s1 < 1 ? [can[0], can[1] - 12] : s2 > 0 && s2 < 1 ? [peel[0], peel[1] - 10] : [b[0] + 76, b[1] + 58];
    const el = [(sh[0] + hand[0]) / 2 - 6, Math.min(sh[1], hand[1]) - 12];
    A.link(c, sh[0], sh[1], el[0], el[1], 6, P.surf, P.ink2); A.link(c, el[0], el[1], hand[0], hand[1], 5, P.surf, P.ink2);
    A.circle(c, hand[0], hand[1], 3.5, P.mot, null);
    return { cam: [camX, camY - 6] };
  }
  /** Подпись в несколько строк по ширине maxW. */
  function wrapLab(c, k, A, P, text, x, y, maxW) {
    HeroKit.font(c, k, 11.5, 700); const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    lines.forEach((s, i) => A.lab(c, k, s, x, y + (i - (lines.length - 1) / 2) * 16 * Math.max(1, k * 0.9), { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf }));
  }
  function drawOrch(c, k, t, P0, A, G) {
    const P = Object.assign({}, P0), u = ((t % T) + T) % T, { seg } = A;
    const on = (a, b) => u >= a && u < b;
    A.rect(c, G.ask[0], G.ask[1], G.ask[2], G.ask[3], 12, rgba(P.ink3, 0.1), on(0, 1.4) ? P.ink : P.line, 1.4);
    A.lab(c, k, 'человек', G.ask[0] + 10, G.ask[1] - 8, { align: 'left', px: 10, color: P.ink3, haloColor: P.surf });
    G.askText.forEach((s, i) => A.lab(c, k, s, G.ask[0] + G.ask[2] / 2, G.ask[1] + 16 + i * 15, { px: 10.5, color: P.ink, halo: false }));
    box(c, k, A, P, G.er, P.spr, 'Gemini Robotics-ER', 'оркестратор: планирует', on(1.4, 5.6) || on(8.2, 10.3) || on(12.9, 15));
    box(c, k, A, P, G.srch, P.out, 'Поиск Google', 'инструмент', on(1.4, 3.6));
    box(c, k, A, P, G.vla, P.mot, 'Gemini Robotics', 'VLA: шаг → движения', on(4.6, 8.2) || on(9.3, 12.9));
    const sc = scene(c, k, A, P, G.scene, u);
    A.rect(c, G.plan[0], G.plan[1], G.plan[2], G.plan[3], 10, rgba(P.spr, 0.06), rgba(P.spr, 0.5), 1.2);
    A.lab(c, k, 'план оркестратора', G.plan[0] + 10, G.plan[1] + 14, { px: 10.5, weight: 700, color: P.spr, align: 'left', haloColor: P.surf });
    const steps = [['1. банку — в синий бак', 3.9, 9.3], ['2. кожуру — в зелёный', 4.2, 14.2]];
    steps.forEach(([s, a, ok], i) => { if (u < a) return; A.lab(c, k, (u >= ok ? '✓ ' : '') + s, G.plan[0] + 10, G.plan[1] + 34 + i * 18, { px: 10.5, color: u >= ok ? P.good : P.ink, align: 'left', haloColor: P.surf }); });
    if (u >= 2.6) A.lab(c, k, 'правила: банки — синий, еда — зелёный', G.plan[0] + 10, G.plan[1] + G.plan[3] - 12, { px: 10, color: P.out, align: 'left', haloColor: P.surf });
    const er = G.er, sr = G.srch;
    packet(c, k, A, P, G.askPath, seg(u, 0.2, 1.4), P.ink2, 'просьба');
    packet(c, k, A, P, [[er[0] + er[2], er[1] + 18], [sr[0], sr[1] + 18]], seg(u, 1.5, 2.4), P.spr, 'запрос');
    packet(c, k, A, P, [[sr[0], sr[1] + sr[3] - 14], [er[0] + er[2], sr[1] + sr[3] - 14]], seg(u, 2.5, 3.5), P.out, 'правила');
    packet(c, k, A, P, [[er[0] + er[2] / 2, er[1] + er[3]], [G.vla[0] + G.vla[2] / 2, G.vla[1]]], u < 9.3 ? seg(u, 4.7, 5.6) : seg(u, 9.4, 10.3), P.spr, u < 9.3 ? '«банку — в синий»' : '«кожуру — в зелёный»');
    const toS = G.toScene;
    A.arrow(c, toS[0][0], toS[0][1], toS[1][0], toS[1][1], rgba(P.mot, 0.55), 1.6, 6);
    if (on(5.6, 8.2) || on(10.3, 12.9)) {
      const ph = (u * 2.2) % 1;
      for (let j = 0; j < 3; j++) { const q = (ph + j / 3) % 1, x = A.lerp(toS[0][0], toS[1][0], q), y = A.lerp(toS[0][1], toS[1][1], q); A.rect(c, x - 6, y - 3, 12, 6, 2, P.mot, null); }
      A.lab(c, k, 'пачки движений', G.chunkLab[0], G.chunkLab[1], { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf });
    }
    packet(c, k, A, P, [sc.cam].concat(G.camPath), u < 12 ? seg(u, 8.2, 9.2) : seg(u, 12.9, 13.9), P.out, 'кадры: шаг выполнен?');
    const cur = PH.find(([a, b]) => u >= a && u < b) || PH[PH.length - 1];
    wrapLab(c, k, A, P, cur[2], G.cap[0], G.cap[1], G.capW);
  }
  Anim.add('orch', {
    W: 720, H: 340, start: 6.4, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawOrch(c, k, t, P, A, {
        ask: [14, 22, 214, 50], askText: ['«Разложи мусор', 'по правилам моего города»'], askPath: [[228, 47], [270, 47]],
        er: [270, 14, 190, 64], srch: [530, 14, 172, 64],
        vla: [270, 196, 190, 58], toScene: [[460, 225], [518, 225]], chunkLab: [489, 208], scene: [520, 150, 186, 150],
        camPath: [[690, 112], [440, 112], [440, 78]],
        plan: [14, 150, 228, 112], cap: [360, 320], capW: 680,
      });
    },
    narrow: {
      W: 360, H: 640,
      draw(c, k, t, P, A) {
        drawOrch(c, k, t, P, A, {
          ask: [70, 18, 220, 46], askText: ['«Разложи мусор', 'по правилам моего города»'], askPath: [[180, 64], [111, 96]],
          er: [16, 96, 190, 62], srch: [222, 96, 124, 62],
          vla: [16, 206, 190, 58], toScene: [[111, 264], [111, 300]], chunkLab: [190, 282], scene: [16, 302, 330, 160],
          camPath: [[336, 312], [336, 180], [190, 180], [190, 158]],
          plan: [16, 480, 330, 84],
          cap: [180, 606], capW: 330,
        });
      },
    },
  });
})();

/* =====================================================================
   1. Лаборатория 1: шкала времени и возраст данных
   ===================================================================== */
const LabDelay = (() => {
  const E = L37, W = 640;
  const st = { f: 7, fast: false, cloud: 0, v: 0.15, cur: 0.75, played: false, playing: false };
  let ctl = null;
  const win = () => Math.max(1, Math.ceil((3 / st.f + st.cloud) * 2) / 2);   // окно шкалы, с: хотя бы три вывода
  function state() {
    const a = E.ages(st);
    return Object.assign({}, a, { f: st.f, fast: st.fast, cloud: st.cloud, v: st.v, played: st.played, missMin: a.miss.min, missMax: a.miss.max, win: win() });
  }
  function ageAt(tl, t) { let last = null; for (const s of tl.slow) if (s.arrive <= t + 1e-9) last = s; return last; }
  function drawTL() {
    const cv = $('#dCv'), narrow = cv.getBoundingClientRect().width < 460;
    const { c, k, H } = plotFit(cv, W, 220, 520), P = pal(), Wt = win(), tl = E.timeline(st, Wt);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const x0 = narrow ? 14 : 104, x1 = W - 16, X = (t) => x0 + (x1 - x0) * t / Wt;
    const Y = narrow ? { frame: 66, slow: 146, net: 226, fast: 306, hand: 386, axis: 452 } : { frame: 24, slow: 56, net: 88, fast: 120, hand: 152, axis: 186 };
    const names = [['кадры', Y.frame, P.cl], ['модель', Y.slow, P.hy], ['сеть', Y.net, P.ink3], ['быстрая', Y.fast, P.e2e], ['рука', Y.hand, P.ink2]];
    for (const [t, y, col] of names) {
      if (narrow) lbl(c, k, t, x0, y - 27, { align: 'left', px: 10.5, weight: 700, color: col, haloColor: P.bg });
      else lbl(c, k, t, x0 - 10, y, { align: 'right', px: 11, weight: 700, color: col, haloColor: P.bg });
      c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    }
    // ось
    c.strokeStyle = P.line; c.beginPath(); c.moveTo(x0, Y.axis); c.lineTo(x1, Y.axis); c.stroke();
    const step = Wt <= 1 ? 0.2 : 0.5;
    for (let t = 0; t <= Wt + 1e-9; t += step) lbl(c, k, `${fmt(t * 1000, 0)}${t === 0 ? ' мс' : ''}`, X(t), Y.axis + 13, { px: 10, color: P.ink3, halo: false, mono: true, align: t === 0 ? 'left' : t >= Wt - 1e-9 ? 'right' : 'center' });
    // выводы медленной модели и сеть
    for (const s of tl.slow) {
      if (s.obs > Wt) break;
      c.fillStyle = P.cl; c.beginPath(); c.moveTo(X(s.obs), Y.frame + 6); c.lineTo(X(s.obs) - 5, Y.frame - 4); c.lineTo(X(s.obs) + 5, Y.frame - 4); c.closePath(); c.fill();
      const a = X(s.obs), b = X(Math.min(Wt, s.done));
      c.beginPath(); c.roundRect(a + 1, Y.slow - 8, Math.max(2, b - a - 2), 16, 4); c.fillStyle = rgba(P.hy, 0.3); c.fill(); c.strokeStyle = P.hy; c.lineWidth = 1.3; c.stroke();
      if (s.k === 0 && b - a > 46 * k) lbl(c, k, `${ms(1 / st.f)} мс`, (a + b) / 2, Y.slow, { px: 10, color: P.ink, halo: false });
      if (st.cloud > 0 && s.done < Wt) {
        const na = X(s.done), nb = X(Math.min(Wt, s.arrive));
        const rows = Math.max(1, Math.ceil(st.cloud * st.f - 1e-9)), nh = 16 / rows - 1, ny = Y.net - 8 + (s.k % rows) * (nh + 1);   // ответы, которые в пути одновременно, — в разные ряды
        c.beginPath(); c.rect(na, ny, Math.max(1, nb - na), nh); c.strokeStyle = P.ink3; c.lineWidth = 1; c.stroke(); HeroKit.hatch(c, na, ny, nb, ny + nh, P.ink3, 5, 1);
      }
    }
    if (!(st.cloud > 0)) lbl(c, k, 'без задержки', x0 + 6, Y.net, { align: 'left', px: 10, color: P.ink3, halo: false });
    // быстрая система и команды руке
    const first = tl.slow[0].arrive;
    if (st.fast) { c.strokeStyle = P.e2e; c.lineWidth = 1; c.beginPath(); for (let t = 0; t <= Wt + 1e-9; t += E.T1) { c.moveTo(X(t), Y.fast - 6); c.lineTo(X(t), Y.fast + 6); } c.stroke(); }
    else lbl(c, k, 'выключена', x0 + 6, Y.fast, { align: 'left', px: 10, color: P.ink3, halo: false });
    c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); for (let t = first; t <= Wt + 1e-9; t += E.T1) { c.moveTo(X(t), Y.hand - 6); c.lineTo(X(t), Y.hand + 6); } c.stroke();
    if (X(first) - x0 > 72 * k) lbl(c, k, 'ждёт пачку', (x0 + X(first)) / 2, Y.hand, { px: 10, color: P.ink3, halo: false });
    // курсор: команда под ним и кадр, по которому она построена
    const tc = Math.min(Wt, st.cur * Wt), s = ageAt(tl, tc);
    c.strokeStyle = rgba(P.ink, 0.45); c.setLineDash([4, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(X(tc), Y.frame - 12); c.lineTo(X(tc), Y.axis); c.stroke(); c.setLineDash([]);
    if (s && st.played) {
      const xa = X(tc), xb = X(s.obs);
      c.strokeStyle = P.hy; c.lineWidth = 1.8; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(xa, Y.hand - 7); c.bezierCurveTo(xa, Y.frame + 30, xb, Y.frame + 40, xb, Y.frame + 8); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(xa, Y.hand, 4, 0, 7); c.fillStyle = P.ink; c.fill();
      const txt = st.fast ? `где чашка: ${ms(Math.min(2 * E.T1, tc % E.T1 + E.T1))} мс · что брать: ${ms(tc - s.obs)} мс` : `данным ${ms(tc - s.obs)} мс`;
      HeroKit.font(c, k, 10.5, 700); const hw = c.measureText(txt).width / 2 + 6;   // подпись целиком внутри шкалы
      lbl(c, k, txt, 2 * hw > x1 - x0 ? (x0 + x1) / 2 : Math.min(Math.max(xa, x0 + hw), x1 - hw), Y.hand + 10 + 8 * k, { px: 10.5, weight: 700, color: st.fast ? P.e2e : P.hy, haloColor: P.bg });
    }
  }
  function drawPlot() {
    const cv = $('#dPlot'), { c, k, H } = plotFit(cv, W, 170, 320), P = pal(), Wt = win();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    if (!st.played) { emptyMsg(c, k, W, H, k > 1.5 ? ['Нажми «Проиграть секунду»', 'в карточке миссии — здесь', 'появится возраст данных'] : ['Нажми «Проиграть секунду» в карточке миссии —', 'здесь появится возраст данных'], P); return; }
    const tl = E.timeline(st, Wt), a = E.ages(st);
    const vmax = [100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000].find((x) => x >= a.slow.max * 1000 + 1) || 4000;
    const box = { l: Math.max(64, 12 + 8 * 6.6 * k), r: W - 12, t: 12, b: H - Math.max(24, 16 * k) };
    const X = (t) => box.l + (box.r - box.l) * t / Wt, Yv = (v) => box.b - Math.min(1, v / vmax) * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, vmax / 2, vmax]) { c.beginPath(); c.moveTo(box.l, Yv(v)); c.lineTo(box.r, Yv(v)); c.stroke(); lbl(c, k, v === vmax ? `${fmt(v, 0)} мс` : fmt(v, 0), box.l - 6, Yv(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    const step = Wt <= 1 ? 0.2 : 0.5;
    for (let t = 0; t <= Wt + 1e-9; t += step) lbl(c, k, `${fmt(t, 1)} с`, X(t), box.b + Math.max(12, 9 * k), { px: 10.5, mono: true, color: P.ink3, halo: false, align: t === 0 ? 'left' : t >= Wt - 1e-9 ? 'right' : 'center' });
    // где чашка уходит на 2 см
    if (st.v > 0) { const thr = 0.02 / st.v * 1000; if (thr < vmax) { c.strokeStyle = P.ink3; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(box.l, Yv(thr)); c.lineTo(box.r, Yv(thr)); c.stroke(); c.setLineDash([]); lbl(c, k, `промах 2 см при ${fmt(st.v * 100, 0)} см/с`, box.r - 4, Yv(thr) - 9, { align: 'right', px: 10, color: P.ink3, haloColor: P.bg }); } }
    const upto = st.playing ? Math.round(Math.min(Wt, st.cur * Wt) * 1000) : Math.round(Wt * 1000);
    const series = (arr, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); let pen = false; for (let i = 0; i <= upto && i < arr.length; i++) { const v = arr[i]; if (v == null) { pen = false; continue; } const x = X(i / 1000), y = Yv(v * 1000); if (pen) c.lineTo(x, y); else c.moveTo(x, y); pen = true; } c.stroke(); };
    series(tl.age, P.hy, 2);
    if (tl.ageFast) series(tl.ageFast, P.e2e, 2);
  }
  function out() {
    if (!st.played) { setOut($('#dOut'), 'Возраст данных и промах появятся здесь, когда проиграешь секунду: кнопка — в карточке миссии.'); return; }
    const a = state(), v = fmt(st.v * 100, 0);
    const pos = st.fast ? `Где чашка, рука знает от быстрой системы по кадру <b>${ms(a.pos.min)}–${ms(a.pos.max)} мс</b> давности` : `Где чашка, рука знает по кадру <b>${ms(a.pos.min)}–${ms(a.pos.max)} мс</b> давности`;
    setOut($('#dOut'), `<span class="ro-row">Команды руке — ${fmt(a.cmdHz, 0)} в секунду. ${pos}: при ${v} см/с промах <b>${cm(a.miss.min)}–${cm(a.miss.max)} см</b>.</span><span class="ro-row">Новую просьбу человека рука получит через <b>${ms(a.react.min)}–${ms(a.react.max)} мс</b>: её читает только медленная модель.</span>`);
  }
  function render() { drawTL(); drawPlot(); out(); }
  function set(o) {
    if (st.playing) return;
    Object.assign(st, o);
    $('#dF').value = st.f; syncRange($('#dF'), `${st.f} Гц`);
    $('#dL').value = Math.round(st.cloud * 1000); syncRange($('#dL'), `${Math.round(st.cloud * 1000)} мс`);
    $('#dV').value = Math.round(st.v * 100); syncRange($('#dV'), `${Math.round(st.v * 100)} см/с`);
    segSet('#dFast', st.fast ? 1 : 0);
    render(); if (ctl) ctl.update();
  }
  function play() {
    st.playing = true; st.played = true; const t0 = performance.now(), dur = 2500;
    return new Promise((res) => {
      const tick = () => {
        st.cur = Math.min(1, (performance.now() - t0) * SPEED.k / dur); render();
        if (st.cur < 1) requestAnimationFrame(tick); else { st.playing = false; st.cur = 0.75; render(); res(state()); }
      };
      requestAnimationFrame(tick);
    });
  }
  const api = { reset() { st.played = false; st.cur = 0.75; set({ f: 7, fast: false, cloud: 0, v: 0.15 }); }, state, set, play };
  const missions = [
    { short: 'Пачка', title: 'Команды частые, а данные?', text: 'Медленная модель на борту думает 7 раз в секунду, а рука получает команды из её пачки каждые 5 мс. Чашку двигают со скоростью 15 см/с. Проиграй секунду и посмотри, по каким кадрам движется рука.',
      onEnter: (X) => X.set({ f: 7, fast: false, cloud: 0, v: 0.15 }),
      bet: { q: 'сколько времени прошло с кадра, по которому построена команда, которую рука исполняет сейчас?', options: ['Не больше 5 мс: команды приходят каждые 5 мс', 'Всегда 143 мс: столько модель думает над кадром', 'От 143 до 286 мс: модель думает, а пачка ждёт следующую'], answer: (r) => (r.pos.max <= 0.011 ? 0 : r.pos.max - r.pos.min < 0.01 ? 1 : 2) },
      action: { label: 'Проиграть секунду', run: (X) => X.play() },
      criteria: [{ label: 'Команды руке идут 200 раз в секунду', test: (r) => r.cmdHz === 200 }, { label: 'Самым старым данным больше 0,2 с', test: (r) => r.pos.max > 0.2 }],
      explain: (r) => `Сразу после прихода пачки её кадру ${ms(r.pos.min)} мс — столько модель над ним думала. Пачка исполняется, пока модель думает над следующим кадром, и к концу её кадру уже ${ms(r.pos.max)} мс. Команды идут каждые 5 мс, но все построены по одному старому кадру. Чашка за это время уезжает на ${cm(r.miss.min)}–${cm(r.miss.max)} см, а захвату надо попасть в неё точнее 2 см.` },
    { short: 'Промах', title: 'Промах не больше сантиметра', text: 'Чашка едет со скоростью 15 см/с. Сделай так, чтобы рука целилась в чашку с промахом не больше 1 см. Начни с частоты модели.',
      controls: ['f', 'fast'], onEnter: (X) => X.set({ f: 7, fast: false, cloud: 0, v: 0.15 }),
      criteria: [{ label: 'Промах не больше 1 см', test: (r, s) => s.missMax <= 0.01 + 1e-9 }],
      hint: 'Даже при 10 Гц данным от 100 до 200 мс, и промах 1,5–3 см. Нужен второй контур, который смотрит на чашку чаще: переключатель «Быстрая система» под графиком.',
      explain: (r) => `Быстрая система берёт свежий кадр каждые 5 мс, поэтому её данным 5–10 мс, а промах — ${cm(r.miss.min)}–${cm(r.miss.max)} см. Медленная модель при этом осталась на ${r.f} Гц: она решает, какую чашку брать, а это знание не стареет, пока чашка та же. Так устроен Helix: модель зрения и языка на 7–9 Гц и политика на 200 Гц.` },
    { short: 'Облако', title: 'Медленная модель в облаке', text: 'Перенесём медленную модель в облако, как основу Gemini Robotics, а быструю систему оставим на борту. Добавь задержку сети не меньше 150 мс, не выключай быструю систему и посмотри на обе строки под графиком: промах руки и время, за которое до неё доходит новая просьба.',
      controls: ['f', 'fast', 'cloud'], onEnter: (X) => X.set({ fast: true, cloud: 0, v: 0.15 }),
      criteria: [{ label: 'Задержка сети не меньше 150 мс', test: (r, s) => s.cloud >= 0.15 - 1e-9 }, { label: 'Быстрая система включена', test: (r, s) => s.fast }, { label: 'Промах не больше 1 см', test: (r, s) => s.missMax <= 0.01 + 1e-9 }],
      hint: 'Ползунок «Задержка сети» — под графиком. Сеть задерживает только ответ медленной модели.',
      explain: (r) => `Промах остался ${cm(r.miss.min)}–${cm(r.miss.max)} см: быстрая система на борту, и сеть её не задерживает. Зато новую просьбу рука получит через ${ms(r.react.min)}–${ms(r.react.max)} мс. Это схема «облако плюс быстрая система», а не устройство Gemini Robotics. Там облачная основа отвечает быстрее 160 мс, а на роботе работает декодер действий: по словам авторов, он компенсирует задержку основы, весь путь от кадра до пачки занимает около 250 мс, а действия идут с эффективной частотой 50 Гц. Как устроен декодер, в статье не сказано.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй частоту, задержку, скорость чашки и быструю систему. Найди сочетание, при котором рука промахивается меньше чем на сантиметр, а новая просьба доходит до неё дольше полсекунды.', final: true, controls: ['f', 'fast', 'cloud', 'v'] },
  ];
  function init() {
    $('#dF').addEventListener('input', (e) => set({ f: +e.target.value }));
    $('#dL').addEventListener('input', (e) => set({ cloud: +e.target.value / 1000 }));
    $('#dV').addEventListener('input', (e) => set({ v: +e.target.value / 100 }));
    segBind('#dFast', (v) => set({ fast: v === '1' }));
    HeroKit.drag($('#dCv'), W, 220, { hit: () => null, tap: (p) => { if (st.playing) return; const cv = $('#dCv'), narrow = cv.getBoundingClientRect().width < 460, x0 = narrow ? 14 : 104; st.cur = Math.max(0, Math.min(1, (p.x - x0) / (W - 16 - x0))); render(); }, tapCursor: 'ew-resize' });
    ctl = mountMissions('#dMis', missions, api, { controls: { f: '#wrapDF', fast: '#wrapDFast', cloud: '#wrapDL', v: '#wrapDV' }, scene: '#dCv' });
    set({}); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория 2: рука Ады догоняет чашку — одна модель и две системы
   ===================================================================== */
const LabChase = (() => {
  const E = L37, CW = 400, S = 300, OX = 200, OY = 330, PW = 640;
  const map = (x, y) => ({ x: OX + x * S, y: OY - y * S });
  const cupCol = () => (HeroKit.dark() ? { red: '#e0675b', blue: '#5b8fe6' } : { red: '#cf4436', blue: '#2f6cc9' });
  const st = { v: 0.15, f: 7, cloud: 0, scen: 'move', res: null, idx: null, live: false, playing: false };
  let ctl = null;
  const params = () => ({ v: st.v, f: st.f, cloud: st.cloud, scen: st.scen });
  function sum(r) {
    const blue = r.arrivals.find((a) => a.id === 'blue');
    const fc = r.tCatch != null ? r.frames.find((f) => f.t >= r.tCatch - 1e-9) : null;
    return { caught: r.caught, ok: r.ok, wrong: r.wrong, tCatch: r.tCatch, react: r.react, lagMin: r.lagMin, lagMax: r.lagMax, first: r.first, blueObs: blue ? blue.obs : null, dCatch: fc ? fc.d : null };
  }
  function state() { const p = params(); return st.res ? Object.assign(p, { single: sum(st.res.single), dual: sum(st.res.dual), shown: true }) : Object.assign(p, { single: null, dual: null, shown: false }); }
  /** Кадр прогона в момент индекса i (кадры каждые 10 мс). */
  const frameAt = (r, i) => r.frames[Math.min(r.frames.length - 1, i)];
  function drawAda(c, P) {
    const b0 = map(-0.42, 0.09), b1 = map(0.06, -0.2);
    c.beginPath(); c.roundRect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y, 14); c.fillStyle = rgba(P.ink3, 0.12); c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]);
    const t0 = map(-0.36, 0.05), t1 = map(0.03, -0.1);
    c.beginPath(); c.roundRect(t0.x, t0.y, t1.x - t0.x, t1.y - t0.y, 12); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.ink2; c.lineWidth = 2; c.stroke();
    const hd = map(-0.165, -0.03); c.beginPath(); c.arc(hd.x, hd.y, 0.075 * S, 0, 7); c.fillStyle = P.surf; c.fill(); c.stroke();
    c.fillStyle = '#eb6834'; for (const dx of [-0.03, 0.03]) { const e = map(-0.165 + dx, 0.025); c.beginPath(); c.arc(e.x, e.y, 2.6, 0, 7); c.fill(); }   // глаза смотрят на стол
    const ls = map(-0.33, 0), le = map(-0.45, 0.12), lh = map(-0.36, 0.2);                                                                          // левая рука опущена на стол
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = P.ink3; c.lineWidth = 8; c.beginPath(); c.moveTo(ls.x, ls.y); c.lineTo(le.x, le.y); c.lineTo(lh.x, lh.y); c.stroke();
    c.strokeStyle = P.surf; c.lineWidth = 4; c.stroke();
  }
  function drawCup(c, p, col, P) {
    const q = map(p.x, p.y), r = E.R_CUP * S;
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(q.x + r + 1, q.y, r * 0.45, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(q.x, q.y, r, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = P.surf; c.stroke();
    c.beginPath(); c.arc(q.x, q.y, r * 0.55, 0, 7); c.strokeStyle = rgba('#ffffff', 0.55); c.lineWidth = 1.2; c.stroke();
  }
  function cross(c, p, col) { const q = map(p.x, p.y); HeroKit.cross(c, q.x, q.y, 6, col, 2.2); }
  function drawPane(cv, run, i, col) {
    const { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), C = cupCol();
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CW);
    const a = map(E.TABLE.x0, E.TABLE.y1), b = map(E.TABLE.x1, E.TABLE.y0);
    c.beginPath(); c.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 8); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.line; c.lineWidth = 1.2; c.stroke();
    c.save(); c.beginPath(); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); c.clip(); c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath();
    for (let x = -0.6; x <= 0.61; x += 0.1) { const p = map(x, 0); c.moveTo(p.x, a.y); c.lineTo(p.x, b.y); }
    for (let y = 0.2; y <= 0.91; y += 0.1) { const p = map(0, y); c.moveTo(a.x, p.y); c.lineTo(b.x, p.y); }
    c.stroke(); c.restore();
    // путь красной чашки
    const p0 = map(E.RED0.x, E.RED0.y), p1 = map(E.X_END, E.RED0.y);
    c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke(); c.setLineDash([]);
    c.fillStyle = P.ink3; c.beginPath(); c.moveTo(p1.x + 7, p1.y); c.lineTo(p1.x - 1, p1.y - 5); c.lineTo(p1.x - 1, p1.y + 5); c.closePath(); c.fill();
    drawAda(c, P);
    const t = run ? frameAt(run, i).t : 0;
    const f = run ? frameAt(run, i) : { q: E.Arm.ik(E.HAND0.x, E.HAND0.y)[0], red: E.cupAt('red', 0, st), blue: E.cupAt('blue', 0, st), aim: null, lat: 0, caught: null, want: 'red' };
    // след захвата
    if (run) { c.strokeStyle = rgba(col, 0.75); c.lineWidth = 2; c.beginPath(); for (let j = 0; j <= Math.min(i, run.frames.length - 1); j++) { const q = map(run.frames[j].h.x, run.frames[j].h.y); if (j) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); } c.stroke(); }
    // чашки
    const P2 = E.Arm.fk(f.q), hand = { x: P2.x, y: P2.y };
    drawCup(c, f.caught === 'blue' ? hand : f.blue, C.blue, P);
    drawCup(c, f.caught === 'red' ? hand : f.red, C.red, P);
    if (f.aim && !f.caught) cross(c, f.aim, col);
    // рука
    const sh = map(0, 0), el = map(P2.x1, P2.y1), hd = map(P2.x, P2.y);
    c.lineCap = 'round'; c.strokeStyle = P.ink2; c.lineWidth = 9; c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(el.x, el.y); c.lineTo(hd.x, hd.y); c.stroke();
    c.strokeStyle = P.surf; c.lineWidth = 5; c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(el.x, el.y); c.lineTo(hd.x, hd.y); c.stroke();
    for (const [pt, r] of [[sh, 6], [el, 5]]) { c.beginPath(); c.arc(pt.x, pt.y, r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke(); }
    c.beginPath(); c.arc(hd.x, hd.y, 6, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
    // подписи
    const px = k > 1.5 ? 10 : 11;
    lbl(c, k, `t = ${fmt(t, 2)} с`, 10, 14 * Math.max(1, k * 0.8), { align: 'left', px, color: P.ink2, haloColor: P.bg });
    lbl(c, k, k > 1.5 ? `ответов: ${f.lat}` : `ответов медленной модели: ${f.lat}`, CW - 10, 14 * Math.max(1, k * 0.8), { align: 'right', px, color: P.hy, haloColor: P.bg });
    const said = st.scen === 'switch' && t >= E.T_SWITCH ? '«нет, синюю»' : '«дай красную»', sp = map(0.36, -0.13);
    lbl(c, k, said, sp.x, sp.y, { px: k > 1.5 ? 9.5 : 11, weight: 700, color: P.ink, haloColor: P.bg });
  }
  function drawPlot() {
    const cv = $('#cPlot'), { c, k, H } = plotFit(cv, PW, 170, 320), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, H);
    if (!st.res) { emptyMsg(c, k, PW, H, k > 1.5 ? ['Нажми «Запустить обе руки»', 'в карточке миссии — здесь', 'появится расстояние до чашки'] : ['Нажми «Запустить обе руки» в карточке миссии —', 'здесь появится расстояние до чашки'], P); return; }
    const vmax = 12, Tm = E.TMAX, box = { l: Math.max(44, 12 + 5 * 6.6 * k), r: PW - 12, t: 12, b: H - Math.max(24, 16 * k) };
    const X = (t) => box.l + (box.r - box.l) * t / Tm, Y = (v) => box.b - Math.min(1, v / vmax) * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 4, 8, 12]) { c.beginPath(); c.moveTo(box.l, Y(v)); c.lineTo(box.r, Y(v)); c.stroke(); lbl(c, k, v === 12 ? '12 см' : String(v), box.l - 6, Y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let t = 0; t <= Tm; t++) lbl(c, k, `${t} с`, X(t), box.b + Math.max(12, 9 * k), { px: 10.5, mono: true, color: P.ink3, halo: false, align: t === 0 ? 'left' : t === Tm ? 'right' : 'center' });
    c.strokeStyle = P.ink3; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(box.l, Y(2)); c.lineTo(box.r, Y(2)); c.stroke(); c.setLineDash([]);
    lbl(c, k, 'допуск 2 см', box.l + 6, Y(2) - 9, { align: 'left', px: 10, color: P.ink3, haloColor: P.bg });
    if (st.scen === 'switch') { c.strokeStyle = P.ink2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(E.T_SWITCH), box.t); c.lineTo(X(E.T_SWITCH), box.b); c.stroke(); c.setLineDash([]); lbl(c, k, '«нет, синюю»', X(E.T_SWITCH) + 4, box.t + 8, { align: 'left', px: 10, color: P.ink2, haloColor: P.bg }); }
    const tNow = st.idx == null ? Infinity : st.idx * 0.01;
    if (st.scen === 'switch' && st.res.dual.react != null && E.T_SWITCH + st.res.dual.react <= tNow) {   // пришёл ответ медленной модели с новой просьбой
      const tr = E.T_SWITCH + st.res.dual.react; c.strokeStyle = P.hy; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(tr), box.t + 16); c.lineTo(X(tr), box.b); c.stroke(); c.setLineDash([]);
      lbl(c, k, k > 1.5 ? 'ответ с новой просьбой' : 'медленная модель ответила с новой просьбой', X(tr) + 4, box.t + 26, { align: 'left', px: 10, color: P.hy, haloColor: P.bg });
    }
    for (const [r, col] of [[st.res.single, P.hy], [st.res.dual, P.e2e]]) {
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); let started = false;
      for (const fr of r.frames) { if (fr.t > tNow) break; const x = X(fr.t), y = Y(fr.d); if (started) c.lineTo(x, y); else { c.moveTo(x, y); started = true; } }
      c.stroke();
      if (r.tCatch != null && r.tCatch <= tNow) { const fr = r.frames.find((q) => q.t >= r.tCatch - 1e-9) || r.frames[r.frames.length - 1]; c.beginPath(); c.arc(X(r.tCatch), Y(fr.d), 5, 0, 7); c.fillStyle = r.wrong ? P.bad : col; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1.5; c.stroke(); }
    }
  }
  const cupName = (id) => (id === 'red' ? 'красную' : 'синюю');
  function statText(r) {
    if (r.wrong) return [`Взяла не ту: <b>${cupName(r.caught)}</b>, хотя просили ${cupName(r.caught === 'red' ? 'blue' : 'red')}`, 'bad'];
    if (r.caught) return [`Взяла ${cupName(r.caught)} за <b>${fmt(r.tCatch, 2)} с</b>${r.react != null ? `; повернула к синей через ${fmt(r.react, 2)} с после просьбы` : ''}`, 'ok'];
    return [`Не успела за ${E.TMAX} с${r.lagMin != null ? `: отстаёт от чашки на <b>${fmt(r.lagMin, 1)}–${fmt(r.lagMax, 1)} см</b>` : ''}`, 'bad'];
  }
  function render() {
    const i = st.idx == null ? 1e9 : st.idx;
    drawPane($('#cCvL'), st.res && st.res.single, i, pal().hy);
    drawPane($('#cCvR'), st.res && st.res.dual, i, pal().e2e);
    drawPlot();
    const T = 1 / st.f;
    $('#cSubL').textContent = `кадр раз в ${ms(T)} мс${st.cloud ? ` + сеть ${ms(st.cloud)} мс` : ''}`;
    $('#cSubR').textContent = `медленная ${st.f} Гц${st.cloud ? ` (сеть ${ms(st.cloud)} мс)` : ''} + быстрая 200 Гц`;
    for (const [id, key] of [['#cStatL', 'single'], ['#cStatR', 'dual']]) {
      const el = $(id);
      if (!st.res || st.playing) { el.className = 'pane-stat'; setOut(el, st.playing ? 'Едет…' : '—'); continue; }
      const [txt, cls] = statText(sum(st.res[key])); el.className = 'pane-stat ' + cls; setOut(el, txt);
    }
    const tc = st.scen === 'switch' ? 'Просьба: «дай красную», через 1,05 с — «нет, синюю».' : 'Просьба: «дай красную».';
    setOut($('#cOut'), `${tc} Красная чашка едет со скоростью <b>${fmt(st.v * 100, 0)} см/с</b>, медленная модель — <b>${st.f} Гц</b>${st.cloud ? `, сеть — <b>${ms(st.cloud)} мс</b>` : ', без сети'}. ${st.res ? '' : st.live ? '' : 'Запуск — кнопкой в карточке миссии.'}`);
  }
  function compute() { st.res = E.pair(params()); st.idx = null; }
  function syncCtl() {
    $('#cV').value = Math.round(st.v * 100); syncRange($('#cV'), `${Math.round(st.v * 100)} см/с`);
    $('#cF').value = st.f; syncRange($('#cF'), `${st.f} Гц`);
    $('#cL').value = Math.round(st.cloud * 1000); syncRange($('#cL'), `${Math.round(st.cloud * 1000)} мс`);
    segSet('#cCmd', st.scen);
  }
  function set(o) {
    if (st.playing) return;
    Object.assign(st, o); syncCtl();
    if (st.live) compute(); else { st.res = null; st.idx = null; }
    render(); if (ctl) ctl.update();
  }
  /** Подготовка миссии: live — пересчитывать сразу, иначе ждать запуска (результат не выдаёт ответ ставки). */
  function prepare(o, live) { st.live = !!live; st.res = null; set(o); }
  function play() {
    if (st.playing) return Promise.resolve(state());
    compute(); st.playing = true;
    const n = Math.max(st.res.single.frames.length, st.res.dual.frames.length), t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        st.idx = Math.min(n - 1, Math.floor((performance.now() - t0) * SPEED.k / 10));
        if (st.idx >= n - 1) { st.playing = false; st.idx = null; render(); if (ctl) ctl.update(); res(state()); return; }
        render(); requestAnimationFrame(tick);
      };
      render(); requestAnimationFrame(tick);
    });
  }
  const tAt = (f) => E.chase({ mode: 'dual', f, cloud: 0, v: 0.15, scen: 'move' }).tCatch;
  const api = { reset() { prepare({ v: 0.15, f: 7, cloud: 0, scen: 'move' }, false); }, state, set, prepare, play, tAt };
  const missions = [
    { short: 'Чашку двигают', title: 'Кто возьмёт движущуюся чашку', text: 'Человек двигает красную чашку вправо со скоростью 15 см/с. Обе медленные модели думают 7 раз в секунду, сети нет. Слева одна модель ведёт захват по своим пачкам, справа быстрая система каждые 5 мс видит, где чашка сейчас. Запусти обе руки: движение идёт в реальном времени, до 5 с.',
      onEnter: (X) => X.prepare({ v: 0.15, f: 7, cloud: 0, scen: 'move' }, false),
      bet: { q: 'кто возьмёт чашку?', options: ['Обе: модели думают одинаково часто', 'Только правая: её быстрая система видит свежие кадры', 'Только левая: пачка ведёт захват плавнее'], answer: (r) => (r.single.ok && r.dual.ok ? 0 : r.dual.ok ? 1 : 2) },
      action: { label: 'Запустить обе руки', run: (X) => X.play() },
      criteria: [{ label: 'Правая рука взяла красную чашку', test: (r) => r.dual.ok && r.dual.caught === 'red' }, { label: 'Левая не успела за 5 с', test: (r) => !r.single.caught }],
      explain: (r) => `Левая рука всё время тянется туда, где чашка была на кадре, снятом 143–286 мс назад, и отстаёт от неё на ${fmt(r.single.lagMin, 1)}–${fmt(r.single.lagMax, 1)} см — больше допуска в 2 см: пока захват доезжает до старой точки, чашка уже ушла. Правая взяла чашку за ${fmt(r.dual.tCatch, 2)} с, и в момент захвата отставала на ${fmt(r.dual.dCatch, 1)} см. Медленная модель у правой руки та же, 7 Гц, но от неё нужно одно: какую чашку брать.` },
    { short: '1 Гц', title: 'Замедли медленную модель', text: 'Пусть медленная модель думает всего раз в секунду. Передвинь ползунок «Медленная модель» на 1 Гц и посмотри, возьмёт ли правая рука движущуюся чашку. Результат пересчитывается сразу, «Проиграть» покажет движение.',
      controls: ['f', 'play'], onEnter: (X) => X.prepare({ v: 0.15, f: 7, cloud: 0, scen: 'move' }, true),
      criteria: [{ label: 'Медленная модель — 1 Гц', test: (r, s) => s.f <= 1 }, { label: 'Правая рука взяла чашку', test: (r, s) => s.f <= 1 && !!s.dual && s.dual.ok }],
      hint: 'Ползунок «Медленная модель» — под графиком.',
      explain: (r) => `При 1 Гц правая рука взяла чашку за ${fmt(r.dual.tCatch, 2)} с, при 7 Гц — за ${fmt(api.tAt(7), 2)} с. Опоздала она потому, что ждала первого ответа: над первым кадром медленная модель думает целую секунду, и всё это время рука стоит. Дальше медленной модели сообщать нечего: чашка та же, а где она, быстрая система видит сама. Левая рука при 1 Гц отстаёт уже на ${fmt(r.single.lagMin, 0)}–${fmt(r.single.lagMax, 0)} см.` },
    { short: 'Передумал', title: 'Человек передумал', text: 'Медленная модель снова думает 7 раз в секунду. Через 1,05 с после начала человек говорит: «нет, дай синюю». Синяя чашка стоит слева. Просьбу слышит только медленная модель: быстрая система правой руки её не читает.',
      controls: ['cmd'], onEnter: (X) => X.prepare({ v: 0.15, f: 7, cloud: 0, scen: 'switch' }, false),
      bet: { q: 'через сколько правая рука повернёт к синей чашке?', options: ['Почти сразу, через 5 мс: быстрая система работает 200 раз в секунду', 'Через 0,1–0,3 с: просьбу должна увидеть и обдумать медленная модель', 'Не повернёт: быстрая система уже ведёт руку к красной'], answer: (r) => (r.dual.react == null ? 2 : r.dual.react < 0.02 ? 0 : 1) },
      action: { label: 'Запустить обе руки', run: (X) => X.play() },
      criteria: [{ label: 'Просьба сменилась на ходу', test: (r) => r.scen === 'switch' }, { label: 'Правая рука взяла синюю чашку', test: (r) => r.dual.ok && r.dual.caught === 'blue' }],
      fail: (r) => (r.scen !== 'switch' ? 'Включи смену просьбы: переключатель «Просьба» под графиком.' : ''),
      explain: (r) => `Обе руки повернули к синей чашке через ${fmt(r.dual.react, 2)} с после просьбы, одновременно. Медленная модель взяла новый кадр через ${fmt(r.dual.blueObs - E.T_SWITCH, 2)} с после просьбы — раньше она думала над старым — и досчитала его ещё через ${fmt(1 / r.f, 2)} с. Быстрая система правой руки здесь ничего не ускорила: она точно ведёт захват, но о новой просьбе узнаёт только из ответа медленной. Правая взяла синюю за ${fmt(r.dual.tCatch, 2)} с, левая — за ${fmt(r.single.tCatch, 2)} с: синяя стоит на месте, и старые кадры левой не мешают.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй скорость чашки, частоту медленной модели, задержку сети и просьбу, нажимай «Проиграть». Найди частоту медленной модели, при которой правая рука хватает красную чашку, хотя человек уже передумал. Потом замедли красную чашку и найди границу снова: почему она сдвинулась?', final: true, controls: ['v', 'f', 'cloud', 'cmd', 'play'],
      onEnter: (X) => X.prepare({}, true) },
  ];
  function init() {
    $('#cV').addEventListener('input', (e) => set({ v: +e.target.value / 100 }));
    $('#cF').addEventListener('input', (e) => set({ f: +e.target.value }));
    $('#cL').addEventListener('input', (e) => set({ cloud: +e.target.value / 1000 }));
    segBind('#cCmd', (v) => set({ scen: v }));
    $('#cPlay').addEventListener('click', () => { if (!st.playing) play(); });
    const C = cupCol(), V = (n) => `var(--${n})`;
    legend('#cLegend', [['Ада сверху: база, корпус и голова', V('ink-2'), 'body'], ['рука: два звена', V('ink-2'), 'line'], ['захват одной модели', V('hybrid'), 'dot'], ['захват двух систем', V('e2e'), 'dot'], ['красная чашка', C.red, 'cup'], ['синяя чашка', C.blue, 'cup'], ['путь красной чашки', V('ink-3'), 'dash'], ['след захвата одной модели', V('hybrid'), 'line'], ['след захвата двух систем', V('e2e'), 'line'], ['крестик — куда модель ведёт захват, цветом своей руки', V('ink-2'), 'cross']]);
    ctl = mountMissions('#cMis', missions, api, { controls: { v: '#wrapCV', f: '#wrapCF', cloud: '#wrapCL', cmd: '#wrapCCmd', play: '#cPlay' }, scene: '#cDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Сортировка задач по уровням S2 / S1 / S0
   ===================================================================== */
function initLevels() {
  return Cards.sort('#lvSort', {
    targets: [
      { id: 's2', label: 'S2 — медленная система', note: 'понять сцену и просьбу, решить, что делать · несколько раз в секунду' },
      { id: 's1', label: 'S1 — быстрая система', note: 'вести руки и тело по свежим кадрам · 100–200 раз в секунду' },
      { id: 's0', label: 'S0 — нижний уровень Helix 02', note: 'равновесие и приводы · 1000 раз в секунду' },
    ],
    items: [
      { id: 'which', label: 'Понять, что «дай красную» — это левая из двух чашек', target: 's2', why: 'Нужно связать слова с картинкой — это работа модели зрения и языка. Ответ не меняется, пока не изменится просьба.' },
      { id: 'order', label: 'Решить, что сначала надо открыть посудомойку, а потом вынимать тарелки', target: 's2', why: 'Порядок действий задаёт S2: в Helix 02 она понимает сцену и язык и решает, что за чем делать.' },
      { id: 'eagle', label: 'Eagle-2 в GR00T N1 читает кадры и команду 10 раз в секунду', target: 's2', why: 'Модель зрения и языка — это System 2 GR00T N1, 10 Гц на L40.' },
      { id: 'track', label: 'Вести захват к чашке, которую двигают по столу', target: 's1', why: 'Нужны свежие кадры каждые несколько миллисекунд — как у правой руки в лаборатории 2.' },
      { id: 'palm', label: 'Поправить позу запястья по свежему кадру с камеры в ладони', target: 's1', why: 'Кадры и датчики S1 читает 200 раз в секунду и выдаёт цели суставам.' },
      { id: 'dit', label: 'DiT в GR00T N1 строит пачку из 16 действий за 4 шага flow', target: 's1', why: 'Диффузионный трансформер — System 1 GR00T N1: действия идут 120 раз в секунду.' },
      { id: 'joints', label: 'Выдать цели всем суставам тела по картинке и латентному вектору', target: 's1', why: 'Так работает S1 в Helix 02: 200 раз в секунду, цели для суставов всего тела.' },
      { id: 'balance', label: 'Удержать равновесие, когда робот наклоняется за тарелкой', target: 's0', why: 'Равновесие, контакты и согласование всего тела — работа S0 на 1 кГц.' },
      { id: 'motors', label: 'Выдавать команды приводам 1000 раз в секунду по состоянию суставов', target: 's0', why: 'S0 получает состояние всех суставов и движение базы и выдаёт команды приводам.' },
      { id: 'sim', label: 'Сеть на 10 млн параметров, обученная в симуляции вместо 109\u00a0504 строк C++', target: 's0', why: 'Это и есть S0 Helix 02: её учили в более чем 200 тысячах параллельных сред.' },
    ],
    after: 'Сверху вниз уровни работают всё чаще, а сети становятся всё меньше: 7 млрд параметров у S2 Helix, 80 млн у S1, 10 млн у S0 Helix 02.',
  });
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
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Рука получает команды из пачки 200 раз в секунду. Значит, данные в каждой команде не старше 5 мс?', o: ['Да: каждая команда свежая', 'Нет: все команды пачки построены по кадру, снятому до начала вывода; при 7 Гц ему от 143 до 286 мс', 'Нет: данным всегда больше секунды'], a: 1, e: 'Частота команд и свежесть данных — разные вещи. Пачку исполняют, пока модель думает над следующим кадром, поэтому возраст данных — время вывода плюс ожидание следующей пачки плюс сеть.' },
    { q: 'Что медленная система Helix передаёт быстрой?', o: ['Координаты цели и траекторию', 'Один латентный вектор, смысл которого появляется при обучении', 'Текст подзадачи'], a: 1, e: 'S2 сводит всё, что о задаче нужно знать для движений, в один непрерывный вектор. S1 переводит его в токен и ставит рядом с признаками своей картинки, а где предмет сейчас, видит сама.' },
    { q: 'Человек передумал и просит другую чашку. Когда двухуровневая система начнёт тянуться к ней?', o: ['Через 5 мс: быстрая система работает 200 раз в секунду', 'Когда медленная система увидит просьбу и досчитает: до её периода плюс время вывода плюс сеть', 'Только после того, как возьмёт первую чашку'], a: 1, e: 'Просьбу читает только медленная система. В лаборатории 2 при 7 Гц обе руки повернули к синей чашке через 0,24 с, одновременно: быстрая система ведёт руку точнее, но новую просьбу не ускоряет.' },
    { q: 'Как обучают S1 и S2 в Helix?', o: ['По отдельности: сначала S2, потом S1', 'Вместе, end-to-end, со сдвигом во времени между их входами, как на роботе', 'S2 не обучают, обучают только S1'], a: 1, e: 'На роботе S1 видит кадр свежее, чем тот, по которому посчитан последний вектор S2. Сдвиг при обучении подбирают под разницу их задержек, чтобы S1 училась в тех же условиях, в каких будет работать.' },
    { q: 'Как System 1 в GR00T N1 получает то, что поняла System 2?', o: ['Получает от неё один вектор, как в Helix', 'Читает токены 12-го слоя её языковой модели через cross-attention', 'Получает текстовую инструкцию'], a: 1, e: 'В DiT чередуются self-attention по токенам действий и состояния и cross-attention к токенам среднего слоя Eagle-2. Средний слой, по словам авторов, даёт и более быстрый вывод, и более высокий успех.' },
    { q: 'Может ли основная часть модели работать в облаке, если роботу нужны частые команды?', o: ['Нет: облако отвечает за секунды', 'Да, как в Gemini Robotics: облачная основа отвечает быстрее 160 мс, декодер на роботе компенсирует задержку, а пачки дают эффективные 50 Гц', 'Да, но робот стоит, пока облако думает'], a: 1, e: 'Путь от кадра до пачки у Gemini Robotics — около 250 мс. Точно вести руку за движущейся целью по таким данным нельзя, поэтому быстрая часть должна быть на борту.' },
    { q: 'Двигает ли руками оркестратор Gemini Robotics-ER 1.5?', o: ['Да: он выдаёт углы суставов', 'Нет: он планирует шаги, вызывает инструменты и передаёт шаги VLA обычными словами', 'Да, но только в простых задачах'], a: 1, e: 'Движения выдаёт VLA Gemini Robotics 1.5. ER 2, по словам Google, передаёт исполнение любой VLA нижнего уровня и следит за ходом задачи по видео.' },
    { q: 'S0 в Helix 02 — написанный вручную регулятор равновесия?', o: ['Да, на C++', 'Нет: нейросеть на 10 млн параметров, обученная в симуляции; она заменила 109\u00a0504 строки C++', 'Нет: это часть модели зрения и языка'], a: 1, e: 'S0 1000 раз в секунду получает состояние всех суставов и движение базы и выдаёт команды приводам. Учили её в более чем 200 тысячах параллельных сред на движениях людей, перенесённых на робота.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('delay', () => { mis.delay = LabDelay.init(); }); safe('chase', () => { mis.chase = LabChase.init(); });
    safe('levels', () => { mis.levels = initLevels(); }); safe('quiz', initQuiz);
    safe('count', () => { const n = ['dMis', 'cMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l37 = { mis, SPEED, LabDelay, LabChase, L37 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
