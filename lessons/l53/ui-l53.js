/* =====================================================================
   ui-l53.js — урок 5.3 «Off-policy и SAC». Схемы и интерактивы:
   0) анимированные схемы (shared/anim.js): куда уходят данные у PPO и у
      off-policy ученика; одно обновление SAC — критики, политика, α;
   1) интерактив «буфер воспроизведения»: DQN на руке Ады по шагам —
      какие переходы попадают в пакет, сколько раз, и что без буфера;
   2) лаборатория «PPO и SAC на одной руке»: успех по шагам взаимодействия,
      две сцены рядом, цена вычислений;
   3) лаборатория «температура α»: две одинаковые чашки на двух полках;
   4) квиз.
   Движок — l53/engine.js (без DOM) поверх shared/arm-core.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const pct = (v) => Math.round(v * 100);
const fmtA = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const fmt = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const nWord = (n, a, b, c) => `${fmtInt(n)} ${plural(n, a, b, c)}`;
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Узкая раскладка канваса: ширина на экране меньше порога. */
const narrowOf = (cv, at) => (cv.getBoundingClientRect().width || 600) < (at || 460);

/* =====================================================================
   0а. Схема: куда уходят данные у PPO и у off-policy ученика.
   Сверху PPO: порция опыта → эпохи обновлений → порция в корзину.
   Снизу SAC: каждый шаг — в буфер и обновление по случайному пакету.
   Шаги у обоих идут в одном темпе; пока PPO обновляется, роботы стоят.
   ===================================================================== */
(() => {
  const STEP = 0.32, NB = 10, NE = 3;                          // секунд на шаг; переходов в порции PPO; эпох на схеме (в лаборатории — 20)
  const T_COL = NB * STEP, T_UPD = 2.4, T_BIN = 0.9, CYC = T_COL + T_UPD + T_BIN, NC = 3, T = CYC * NC;
  const stepsAt = (u) => { const cyc = Math.floor(u / CYC), v = u - cyc * CYC; return cyc * NB + (v < T_COL ? Math.floor(v / STEP) + 1 : NB); };
  function draw(c, k, t, P, A, G) {
    const { lab, rect, circle, alpha, ease, seg, line } = A, u = ((t % T) + T) % T;
    const cyc = Math.floor(u / CYC), v = u - cyc * CYC, steps = stepsAt(u), collecting = v < T_COL;
    const updOn = v >= T_COL && v < T_COL + T_UPD, ep = updOn ? Math.min(NE, Math.floor((v - T_COL) / (T_UPD / NE)) + 1) : 0, inBin = seg(v, T_COL + T_UPD, T_COL + T_UPD + T_BIN * 0.8);
    const R = G.rows, pol = (y, col, t1, t2) => { rect(c, G.px - 44, y - 22, 88, 44, 9, alpha(col, 0.12), col, 1.6); lab(c, k, t1, G.px, y - 7, { px: 11, weight: 700, color: col, halo: false }); lab(c, k, t2, G.px, y + 9, { px: 10, color: P.ink3, halo: false }); };
    // ---- PPO ----
    const y1 = R[0];
    lab(c, k, G.narrow ? 'PPO (on-policy)' : 'PPO (on-policy): порция → обновления → в корзину', G.cx, y1 - 52, { px: 12.5, weight: 750, color: P.spr, haloColor: P.surf });
    pol(y1, P.spr, 'политика', `версия ${cyc + 1}`);
    const bx = G.bx, bw = G.bw, by = y1 - 24, bh = 48;
    rect(c, bx, by, bw, bh, 8, P.surf, P.ink3, 1.3);
    lab(c, k, 'порция опыта', bx + bw / 2, by - 10, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf });
    A.arrow(c, G.px + 46, y1, bx - 4, y1, P.ink3, 1.6, 7);
    const n = collecting ? Math.floor(v / STEP) + 1 : NB, cols = 5, cw = (bw - 20) / (cols - 1);
    const binX = bx + bw + G.binDx, binY = y1;
    for (let i = 0; i < n; i++) {
      let x = bx + 10 + (i % cols) * cw, y = by + 14 + Math.floor(i / cols) * 20; const e = ease(inBin);
      x += (binX - x) * e; y += (binY - y) * e; c.globalAlpha = 1 - 0.85 * e;
      circle(c, x, y, 5, updOn ? P.spr : P.out, P.surf, 1.2); c.globalAlpha = 1;
    }
    c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.beginPath(); c.moveTo(binX - 13, binY - 12); c.lineTo(binX - 10, binY + 14); c.lineTo(binX + 10, binY + 14); c.lineTo(binX + 13, binY - 12); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(binX - 16, binY - 12); c.lineTo(binX + 16, binY - 12); c.stroke();
    const ay = by + bh + 16;
    line(c, [[bx + bw / 2, by + bh + 2], [bx + bw / 2, ay], [G.px, ay], [G.px, y1 + 24]], updOn ? P.spr : alpha(P.ink3, 0.5), updOn ? 2.2 : 1.4, updOn ? [] : [4, 4], -u * 20);
    lab(c, k, updOn ? `эпоха ${ep} из ${NE}: учится только на этой порции` : 'учится только на этой порции', (bx + bw / 2 + G.px) / 2, ay + 11, { px: 10, color: updOn ? P.spr : P.ink3, haloColor: P.surf });
    const thrown = cyc * NB + (inBin > 0.8 ? NB : 0);
    lab(c, k, `в корзине: ${thrown}`, binX, binY + 30, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf });
    // ---- SAC ----
    const y2 = R[1];
    lab(c, k, G.narrow ? 'SAC (off-policy)' : 'SAC (off-policy): каждый шаг — в буфер, обновление — по пакету из всего буфера', G.cx, y2 - 64, { px: 12.5, weight: 750, color: P.mot, haloColor: P.surf });
    pol(y2, P.mot, 'политика', 'и две Q');
    const qx = G.bx, qw = G.qw, qy = y2 - 30, qh = 60;
    rect(c, qx, qy, qw, qh, 8, P.surf, P.out, 1.5);
    lab(c, k, `буфер: ${steps} ${plural(steps, 'переход', 'перехода', 'переходов')}`, qx + qw / 2, qy - 10, { px: 10.5, weight: 650, color: P.out, haloColor: P.surf });
    A.arrow(c, G.px + 46, y2, qx - 4, y2, P.ink3, 1.6, 7);
    const qc = G.qcols, qcw = (qw - 16) / qc, shown = Math.min(steps, qc * 3), off = steps - shown;
    const pick = new Set(); let h0 = (steps * 2654435761) >>> 0; for (let i = 0; i < Math.min(4, steps); i++) { h0 = (h0 * 1103515245 + 12345) >>> 0; pick.add(h0 % steps); }
    for (let i = 0; i < shown; i++) { const id = off + i, x = qx + 8 + qcw / 2 + (i % qc) * qcw, y = qy + 12 + Math.floor(i / qc) * 17; circle(c, x, y, 4.6, pick.has(id) ? P.mot : alpha(P.out, 0.8), P.surf, 1); }
    const ay2 = qy + qh + 16;
    line(c, [[qx + qw / 2, qy + qh + 2], [qx + qw / 2, ay2], [G.px, ay2], [G.px, y2 + 24]], collecting ? P.mot : alpha(P.ink3, 0.5), collecting ? 2.2 : 1.4, collecting ? [6, 4] : [4, 4], -u * 30);
    lab(c, k, G.narrow ? 'после шага: пакет из буфера' : 'после каждого шага: обновление по случайному пакету (оранжевые)', (qx + qw / 2 + G.px) / 2 + (G.narrow ? 0 : 30), ay2 + 11, { px: 10, color: collecting ? P.mot : P.ink3, haloColor: P.surf });
    if (!collecting) lab(c, k, 'ждёт, пока PPO обновляется', qx + qw / 2, y2 + (G.narrow ? 44 : 0), { px: 10.5, weight: 650, color: P.ink3, haloColor: P.surf });
    lab(c, k, `шагов взаимодействия у каждого: ${steps}`, G.cx, G.foot, { px: 11.5, weight: 750, color: P.ink, haloColor: P.surf });
  }
  Anim.add('dataflow', {
    W: 720, H: 330, start: 2.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { cx: 360, px: 70, bx: 160, bw: 150, binDx: 70, qw: 420, qcols: 22, rows: [78, 238], foot: 318 }); },
    narrow: { W: 360, H: 380, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, cx: 180, px: 52, bx: 112, bw: 132, binDx: 46, qw: 236, qcols: 11, rows: [82, 262], foot: 368 }); } },
  });
})();

/* =====================================================================
   0б. Схема: одно обновление SAC. Пакет из буфера → цель для двух Q
   (меньшая из двух целевых Q минус α·log π) → шаг Q-функций → шаг
   политики через действие → шаг температуры → целевые копии догоняют.
   ===================================================================== */
(() => {
  const PH = [['пакет из буфера', 1.6], ['целевое значение для Q', 2.6], ['шаг Q1 и Q2', 1.8], ['шаг политики', 2.6], ['шаг температуры', 1.8], ['целевые копии', 1.6]];
  const T = PH.reduce((s, p) => s + p[1], 0);
  const phaseAt = (u) => { let a = 0; for (let i = 0; i < PH.length; i++) { if (u < a + PH[i][1]) return [i, (u - a) / PH[i][1]]; a += PH[i][1]; } return [PH.length - 1, 1]; };
  // ребро прямоугольника по направлению к точке
  const edge = (b, tx, ty) => { const [x, y, w, hh] = b, dx = tx - x, dy = ty - y, s = Math.min(Math.abs((w / 2 + 3) / (dx || 1e-9)), Math.abs((hh / 2 + 3) / (dy || 1e-9))); return [x + dx * s, y + dy * s]; };
  const ARROWS = [['buf', 'bat', 0], ['bat', 'piT', 1], ['piT', 'tq', 1], ['tq', 'y', 1], ['bat', 'q', 2], ['y', 'q', 2], ['bat', 'piA', 3], ['piA', 'qA', 3], ['qA', 'stp', 3], ['stp', 'al', 4], ['q', 'tq', 5]];
  function draw(c, k, t, P, A, G) {
    const { lab, rect, alpha } = A, u = ((t % T) + T) % T, [ph, s] = phaseAt(u), B = G.b;
    const col = { buf: P.out, bat: P.out, piT: P.mot, tq: P.spr, y: P.ink2, q: P.mot, piA: P.mot, qA: P.mot, stp: P.mot, al: P.ink2 };
    const hot = new Set(ARROWS.filter((a) => a[2] === ph).flatMap((a) => [a[0], a[1]]));
    let dot = null;
    for (const [f, to, p] of ARROWS) {
      const bf = B[f], bt = B[to], a0 = edge(bf, bt[0], bt[1]), a1 = edge(bt, bf[0], bf[1]), on = p === ph;
      A.arrow(c, a0[0], a0[1], a1[0], a1[1], on ? col[to] : alpha(P.ink3, 0.4), on ? 2.2 : 1.2, 7);
      if (on && !dot) dot = [a0, a1];
    }
    for (const [key, t1, t2] of G.text) {
      const b = B[key], on = hot.has(key);
      rect(c, b[0] - b[2] / 2, b[1] - b[3] / 2, b[2], b[3], 8, alpha(col[key], on ? 0.2 : 0.06), on ? col[key] : alpha(col[key], 0.5), on ? 2.2 : 1.2);
      // название в одну или две строки (массив); с пояснением t2 — над ним
      const t1s = Array.isArray(t1) ? t1 : [t1];
      t1s.forEach((tx, i) => lab(c, k, tx, b[0], b[1] - (t2 ? 8 : 0) + (i - (t1s.length - 1) / 2) * 14, { px: key === 'y' ? 10 : 11, weight: 700, color: on ? (key === 'y' || key === 'al' ? P.ink : col[key]) : P.ink2, halo: false }));
      if (t2) lab(c, k, t2, b[0], b[1] + 9, { px: 10, color: P.ink3, halo: false });
    }
    for (const [x, y, txt, cc] of G.lanes) lab(c, k, txt, x, y, { px: 10.5, weight: 700, color: cc === 'mot' ? P.mot : P.spr, align: 'left', haloColor: P.surf });
    if (dot) { const e = A.ease(s); A.circle(c, dot[0][0] + (dot[1][0] - dot[0][0]) * e, dot[0][1] + (dot[1][1] - dot[0][1]) * e, 5, P.ink, P.surf, 1.4); }
    const msg = G.msg[ph];
    lab(c, k, `${ph + 1}. ${PH[ph][0]}`, G.cap[0], G.cap[1], { px: 12, weight: 750, color: P.ink, haloColor: P.surf });
    msg.forEach((m, i) => lab(c, k, m, G.cap[0], G.cap[1] + 17 + i * 15, { px: 10.5, color: P.ink2, haloColor: P.surf }));
  }
  const TEXT_W = [['buf', 'буфер', 'весь опыт'], ['bat', 'пакет', "32 × (s, a, r, s′)"], ['piT', 'политика в s′', "a′ ~ π, log π(a′|s′)"], ['tq', 'целевые Q′1, Q′2', "меньшая в (s′, a′)"], ['y', 'целевое значение', "r + γ(min Q′ − α log π)"], ['q', 'Q1, Q2 в (s, a)', 'тянутся к y'], ['piA', 'политика в s', 'ã = tanh(μ + σε)'], ['qA', 'Q1, Q2 в (s, ã)', 'меньшая из двух'], ['stp', 'шаг политики', 'min Q − α log π ↑'], ['al', 'температура α', 'целевая энтропия −2']];
  const MSG_W = [
    ['Из буфера берут 32 случайных перехода — свежих и давних вперемешку'],
    ['Политика выбирает действие a′ в следующем состоянии s′, целевые копии оценивают его,', 'меньшая из двух оценок минус α log π даёт будущее, а с наградой r — целевое значение y'],
    ['Обе Q-функции подтягивают свою оценку записанного действия a к целевому значению y'],
    ['Политика пробует действие ã в состоянии s и сдвигает среднее и разброс туда,', 'где меньшая из двух Q выше, а α log π ниже: градиент проходит через само действие'],
    ['Если энтропия политики ниже целевой (−2), α растёт, если выше — падает'],
    ['Целевые копии сдвигаются к обучаемым Q на 1%: целевое значение меняется медленно'],
  ];
  const MSG_N = [
    ['32 случайных перехода из буфера'], ['a′ ~ π в s′; y = r + γ(min Q′ − α log π)'], ['Q1, Q2 тянутся к y в записанном (s, a)'],
    ['π сдвигает ã туда, где min Q − α log π больше'], ['α растёт, если энтропия ниже целевой'], ['Q′ сдвигаются к Q на 1%'],
  ];
  const WIDE = {
    b: { buf: [62, 145, 96, 44], bat: [190, 145, 116, 50], piT: [350, 62, 132, 46], tq: [510, 62, 132, 46], y: [660, 62, 104, 46], q: [510, 145, 132, 46], piA: [350, 228, 132, 46], qA: [510, 228, 132, 46], stp: [660, 228, 104, 46], al: [660, 145, 104, 46] },
    text: TEXT_W, msg: MSG_W, cap: [360, 298],
    lanes: [[288, 26, 'целевое значение для Q', 'spr'], [288, 264, 'шаг политики', 'mot']],
  };
  const NARROW = {
    narrow: true,
    b: { buf: [62, 36, 100, 40], bat: [250, 36, 130, 44], piT: [62, 122, 108, 44], tq: [180, 122, 108, 44], y: [298, 122, 104, 44], q: [180, 196, 108, 44], al: [298, 196, 110, 44], piA: [62, 270, 108, 44], qA: [180, 270, 108, 44], stp: [298, 270, 110, 44] },
    text: TEXT_W.map(([k0, a, b]) => [k0, a.replace('целевые Q′1, Q′2', 'целевые Q′').replace('политика в s′', 'π в s′').replace('политика в s', 'π в s'), b.replace('r + γ(min Q′ − α log π)', 'r и min Q′ − α log π').replace('целевая энтропия −2', 'энтропия → −2').replace('меньшая в (s′, a′)', 'меньшая')]).map((e) => (e[0] === 'y' ? ['y', ['целевое', 'значение y'], ''] : e)),
    msg: MSG_N, cap: [180, 318], lanes: [],
    // на телефоне «целевое значение» в две строки: формула y — в подписи шага
  };
  Anim.add('sacupd', {
    W: 720, H: 350, start: 4.1, narrowAt: 760,   // уже 760 px подписи широкой раскладки не помещаются в блоки
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 360, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   Рисование: вид сбоку на Аду и её руку. Логический канвас 360 × 360,
   260 пикселей на метр, плечо Ады в точке (100, 150).
   ===================================================================== */
const View = (() => {
  const W = 360, H = 360, SC = 260, OX = 100, OY = 150;
  const X = (x) => OX + x * SC, Y = (y) => OY - y * SC;
  const colors = () => { const d = HeroKit.dark(); return { adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', wood: d ? '#5a4c38' : '#d9c7a6', cupFill: d ? '#d9d6cc' : '#ffffff', cupLine: d ? '#b0afa6' : '#3d3c38' }; };
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.roundRect(x, y, w, hh, r); }
  /** Ада сбоку: голова, корпус, колёсная база; плечо — в начале координат. */
  function ada(c, K, P) {
    c.lineWidth = 2.2; c.strokeStyle = K.adaLine; c.fillStyle = K.adaFill;
    rr(c, X(-0.33), Y(0.07), 0.3 * SC, 0.5 * SC, 22); c.fill(); c.stroke();
    c.fillStyle = K.adaFill; rr(c, X(-0.29), Y(0.33), 0.24 * SC, 0.2 * SC, 20); c.fill(); c.stroke();
    rr(c, X(-0.15), Y(0.29), 0.11 * SC, 0.11 * SC, 9); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(X(-0.085), Y(0.235), 3.5, 5, 0, 0, 7); c.fill();
    c.fillStyle = K.adaFill; c.strokeStyle = K.adaLine; rr(c, X(-0.36), Y(-0.45), 0.36 * SC, 0.13 * SC, 10); c.fill(); c.stroke();
    for (const wx of [-0.28, -0.08]) { c.beginPath(); c.arc(X(wx), Y(-0.6), 0.045 * SC, 0, 7); c.fillStyle = P.ink3; c.fill(); }
  }
  /** Рука: два звена, суставы и захват. */
  function arm(c, q, P, col, o) {
    o = o || {}; const f = Arm.fk(q), b = [X(0), Y(0)], e = [X(f.x1), Y(f.y1)], w = [X(f.x), Y(f.y)];
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; if (o.ghost) c.globalAlpha = 0.35;
    for (const [lw, cc] of [[11, col], [6.5, P.surf]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.stroke(); }
    const ang = q[0] + q[1], ux = Math.cos(ang), uy = -Math.sin(ang), nx = -uy, ny = ux;
    c.strokeStyle = col; c.lineWidth = 3;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(w[0] + nx * 6 * s, w[1] + ny * 6 * s); c.lineTo(w[0] + nx * 6 * s + ux * 9, w[1] + ny * 6 * s + uy * 9); c.stroke(); }
    c.beginPath(); c.moveTo(w[0] + nx * 6, w[1] + ny * 6); c.lineTo(w[0] - nx * 6, w[1] - ny * 6); c.stroke();
    for (const p of [b, e]) { c.beginPath(); c.arc(p[0], p[1], 4.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    c.restore(); return { x: w[0], y: w[1] };
  }
  /** Цель: зелёное кольцо, пунктиром — зона, где попытка засчитана. */
  function target(c, t, P, hold) {
    c.setLineDash([3, 3]); c.lineWidth = 1.3; c.strokeStyle = P.good; c.beginPath(); c.arc(X(t.x), Y(t.y), hold * SC, 0, 7); c.stroke(); c.setLineDash([]);
    c.lineWidth = 2.6; c.beginPath(); c.arc(X(t.x), Y(t.y), 5.5, 0, 7); c.stroke();
  }
  /** Путь захвата: точки через шаг. */
  function path(c, pts, col, o) {
    o = o || {}; if (!pts || pts.length < 2) return;
    c.save(); c.globalAlpha = o.alpha == null ? 1 : o.alpha; c.strokeStyle = col; c.lineWidth = o.lw || 1.6; c.setLineDash(o.dash || []);
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke(); c.setLineDash([]);
    if (o.dots) for (const p of pts) { c.beginPath(); c.arc(X(p.x), Y(p.y), 1.8, 0, 7); c.fillStyle = col; c.fill(); }
    c.restore();
  }
  /** Фон сцены: пол, Ада, прямоугольник, где появляются цели. */
  function base(cv, o) {
    o = o || {}; const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = P.grid; c.fillRect(0, Y(-0.645), W, H - Y(-0.645));
    if (o.area) { const A = L53.REACH.AREA; c.setLineDash([4, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.strokeRect(X(A.x0), Y(A.y1), (A.x1 - A.x0) * SC, (A.y1 - A.y0) * SC); c.setLineDash([]); }
    ada(c, K, P);
    return { c, k, P, K, sh: k > 1.5 };
  }
  /** Полка с чашкой: доска под целью и чашка на ней. */
  function shelf(c, t, P, K, col) {
    const bw = 0.16, x0 = t.x - bw / 2, top = t.y - 0.045;
    c.fillStyle = P.ink3; c.fillRect(X(t.x) - 2, Y(top), 4, Y(-0.645) - Y(top));
    c.fillStyle = K.wood; c.fillRect(X(x0), Y(top), bw * SC, 0.018 * SC);
    const cw = 0.05, ch = 0.06; c.lineWidth = 1.8; c.strokeStyle = col || K.cupLine; c.fillStyle = K.cupFill;
    rr(c, X(t.x - cw / 2), Y(top + ch), cw * SC, ch * SC, [2, 2, 5, 5]); c.fill(); c.stroke();
    c.beginPath(); c.arc(X(t.x + cw / 2) + 1, Y(top + ch * 0.55), 4, -Math.PI / 2, Math.PI / 2); c.stroke();
  }
  return { W, H, SC, X, Y, colors, ada, arm, target, path, base, shelf };
})();

/** График: успех по шагам. series: [{ pts: [[x, y]], color, dash, label, w }]. */
function lineChart(cv, o) {
  const narrow = narrowOf(cv, 460), W = narrow ? 380 : 640, H = narrow ? 250 : 260;
  if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
  const { c, k } = HeroKit.fit(cv, W, H), P = pal(), L = narrow ? 44 : 52, R = narrow ? 14 : 20, T = 26, B = 40, gw = W - L - R, gh = H - T - B;
  c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
  const X = (v) => L + gw * v / o.xMax, Y = (v) => T + gh * (1 - v / (o.yMax || 100));
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const v of o.yTicks || [0, 25, 50, 75, 100]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); HeroKit.label(c, k, `${v}${o.yUnit == null ? '%' : o.yUnit}`, L - 7, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
  const step = o.xStep || niceStep(o.xMax, narrow ? 4 : 6);
  for (let v = 0; v <= o.xMax + 1e-9; v += step) { const last = v + step > o.xMax + 1e-9 && X(v) > W - 24; HeroKit.label(c, k, fmtInt(v), last ? X(v) + 4 : X(v), T + gh + 13, { px: 10.5, color: P.ink3, align: last ? 'right' : 'center', halo: false }); }
  HeroKit.label(c, k, narrow && o.xShort ? o.xShort : o.xLabel, L + gw / 2, H - 9, { px: 11, color: P.ink3, halo: false });
  HeroKit.label(c, k, narrow && o.yShort ? o.yShort : o.yLabel, L, 11, { px: 11, color: P.ink3, align: 'left', halo: false });
  if (o.cursor != null) { c.setLineDash([3, 4]); c.strokeStyle = P.ink2; c.beginPath(); c.moveTo(X(o.cursor), T); c.lineTo(X(o.cursor), T + gh); c.stroke(); c.setLineDash([]); }
  if (o.marks) for (const m of o.marks) { c.setLineDash([2, 4]); c.strokeStyle = m.color; c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(m.x), T); c.lineTo(X(m.x), T + gh); c.stroke(); c.setLineDash([]); }
  const tags = [];
  for (const s of o.series) {
    if (!s.pts.length) continue;
    c.strokeStyle = s.color; c.lineWidth = s.w || 2.4; c.setLineDash(s.dash || []); c.lineJoin = 'round';
    c.beginPath(); s.pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke(); c.setLineDash([]);
    const [lx, ly] = s.pts[s.pts.length - 1]; c.beginPath(); c.arc(X(lx), Y(ly), 3.4, 0, 7); c.fillStyle = s.color; c.fill();
    if (s.label) tags.push({ x: X(lx), y: Y(ly), text: s.label, color: s.color });
  }
  for (const t of tags) t.ty = t.y < T + 14 ? t.y + 13 : t.y - 10;
  tags.sort((a, b) => a.ty - b.ty); for (let i = 1; i < tags.length; i++) if (Math.abs(tags[i].x - tags[i - 1].x) < 120 && tags[i].ty < tags[i - 1].ty + 15) tags[i].ty = tags[i - 1].ty + 15;
  for (const t of tags) { const right = t.x > L + gw * 0.7; HeroKit.label(c, k, t.text, right ? t.x - 7 : t.x + 7, t.ty, { px: 11, weight: 700, color: t.color, align: right ? 'right' : 'left', haloColor: P.surf }); }
  if (o.empty) HeroKit.label(c, k, o.empty, L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
  return { X, Y, L, T, gw, gh, W, H };
}
function niceStep(max, n) { const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p; return 10 * p; }

/* =====================================================================
   1. Интерактив: буфер воспроизведения по шагам (DQN на руке Ады)
   ===================================================================== */
const ACT_NAME = (a) => { const [dx, dy] = L53.ACTS[a]; const h0 = dx < 0 ? 'к Аде' : dx > 0 ? 'от Ады' : '', v0 = dy > 0 ? 'вверх' : dy < 0 ? 'вниз' : ''; return [v0, h0].filter(Boolean).join(' и ') || 'стоять на месте'; };
const Replay = (() => {
  const E = L53, SEED = 3, STEPS = 1500, T = E.REACH.T;
  const st = { D: null, sel: null, busy: false, prog: 0, cmp: null, cap: 'all', mode: 'buf', free: false };
  let ctl = null;
  const fresh = (o) => E.dqnInit(Object.assign({ seed: SEED, steps: STEPS }, o || {}));
  st.D = fresh();
  /** Сколько раз в среднем попали в пакеты переходы эпизода ep (среди тех, что ещё в буфере). */
  function epUse(D, ep) { let s = 0, n = 0; for (let k = 0; k < D.buf.n; k++) if (D.buf.ep[k] === ep) { s += D.buf.used[k]; n++; } return n ? s / n : 0; }
  function drawScene() {
    const cv = $('#rCv'), D = st.D, { c, k, P, sh } = View.base(cv, { area: true });
    const k0 = st.sel != null ? st.sel : D.lastK;
    if (k0 == null || !D.meta[k0]) {
      View.arm(c, E.ARM.Q0, P, P.cl);
      HeroKit.label(c, k, sh ? 'нажми «1 шаг»' : 'нажми «1 шаг» или «+1 эпизод»', View.W / 2 + 30, 340, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.grid });
      return;
    }
    const m = D.meta[k0], p0 = Arm.fk(m.q), p1 = Arm.fk(m.q2);
    View.target(c, m.t, P, E.REACH.HOLD);
    View.arm(c, m.q2, P, P.cl, { ghost: true });
    View.arm(c, m.q, P, P.cl);
    A_arrow(c, View.X(p0.x), View.Y(p0.y), View.X(p1.x), View.Y(p1.y), P.e2e);
    const b = D.buf, used = b.used[k0], ep = b.ep[k0] + 1, sIn = b.born[k0] % T + 1;
    HeroKit.label(c, k, `эпизод ${ep}, шаг ${sIn}`, 10, 16, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    HeroKit.label(c, k, `в пакетах: ${used} ${plural(used, 'раз', 'раза', 'раз')}`, 10, 34, { px: 11.5, color: P.ink2, align: 'left', haloColor: P.bg });
  }
  function A_arrow(c, x1, y1, x2, y2, col) {
    if (Math.hypot(x2 - x1, y2 - y1) < 3) return; const a = Math.atan2(y2 - y1, x2 - x1);
    c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - 5 * Math.cos(a), y2 - 5 * Math.sin(a)); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 8 * Math.cos(a - 0.5), y2 - 8 * Math.sin(a - 0.5)); c.lineTo(x2 - 8 * Math.cos(a + 0.5), y2 - 8 * Math.sin(a + 0.5)); c.closePath(); c.fillStyle = col; c.fill();
  }
  /** Буфер: столбец — эпизод, строка — шаг эпизода; цвет — сколько раз переход попал в пакет; оранжевые точки — текущий пакет. */
  const GRID = { W: 360, H: 230, L: 30, T: 26, R: 8, B: 30 };
  function cellRect(born) { const D = st.D, eps = Math.max(1, Math.ceil(D.o.steps / T)), gw = GRID.W - GRID.L - GRID.R, gh = GRID.H - GRID.T - GRID.B, cw = gw / eps, chh = gh / T; return [GRID.L + Math.floor(born / T) * cw, GRID.T + (born % T) * chh, cw, chh]; }
  function drawGrid() {
    const cv = $('#rBuf'), { c, k } = HeroKit.fit(cv, GRID.W, GRID.H), P = pal(), D = st.D, b = D.buf;
    c.fillStyle = P.surf; c.fillRect(0, 0, GRID.W, GRID.H);
    const gw = GRID.W - GRID.L - GRID.R, gh = GRID.H - GRID.T - GRID.B;
    c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(GRID.L, GRID.T, gw, gh);
    const alive = new Set(); for (let j = 0; j < b.n; j++) alive.add(b.born[j]);
    const byBorn = new Map(); for (let j = 0; j < b.n; j++) byBorn.set(b.born[j], j);
    for (let s = 0; s < D.step; s++) {
      const [x, y, w, hh] = cellRect(s);
      if (!alive.has(s)) { c.fillStyle = P.grid; c.fillRect(x + 0.3, y + 0.3, w - 0.6, hh - 0.6); continue; }
      const u = b.used[byBorn.get(s)], a = 0.16 + 0.84 * Math.min(1, u / 80);
      c.globalAlpha = a; c.fillStyle = P.cl; c.fillRect(x + 0.3, y + 0.3, w - 0.6, hh - 0.6); c.globalAlpha = 1;
    }
    if (D.last) for (const j of D.last) { const [x, y, w, hh] = cellRect(b.born[j]); c.beginPath(); c.arc(x + w / 2, y + hh / 2, Math.max(2.2, Math.min(w, hh) * 0.42), 0, 7); c.fillStyle = P.e2e; c.fill(); }
    const kk = st.sel != null ? st.sel : D.lastK;
    if (kk != null && D.step) { const [x, y, w, hh] = cellRect(b.born[kk]); c.strokeStyle = P.ink; c.lineWidth = 1.6; c.strokeRect(x - 1, y - 1, w + 2, hh + 2); }
    const nar = k > 1.4;
    HeroKit.label(c, k, nar ? 'эпизод →' : 'эпизод (столбец) →', GRID.L + gw / 2, GRID.H - 10, { px: 11, color: P.ink3, halo: false });
    HeroKit.label(c, k, '1', GRID.L + 3, GRID.T + gh + 10, { px: 10, color: P.ink3, align: 'left', halo: false });
    HeroKit.label(c, k, String(Math.ceil(D.o.steps / T)), GRID.L + gw, GRID.T + gh + 10, { px: 10, color: P.ink3, align: 'right', halo: false });
    HeroKit.label(c, k, nar ? 'шаг ↓' : 'шаг эпизода ↓', GRID.L - 4, 12, { px: 11, color: P.ink3, align: 'left', halo: false });
    HeroKit.label(c, k, '1', GRID.L - 6, GRID.T + 5, { px: 10, color: P.ink3, align: 'right', halo: false });
    HeroKit.label(c, k, String(T), GRID.L - 6, GRID.T + gh - 5, { px: 10, color: P.ink3, align: 'right', halo: false });
    if (!D.step) HeroKit.label(c, k, 'буфер пуст: сделай шаг', GRID.L + gw / 2, GRID.T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
  }
  function drawChart() {
    const D = st.D, series = [];
    if (st.cmp) {
      series.push({ pts: st.cmp.buf.map((p) => [p.step, p.rate * 100]), color: HeroKit.css('--classic'), label: 'с буфером' });
      series.push({ pts: st.cmp.rec.map((p) => [p.step, p.rate * 100]), color: HeroKit.css('--critical'), label: 'последние 32 подряд', dash: [6, 4] });
    }
    if ((!st.cmp || st.free) && D.step >= 100) series.push({ pts: D.curve.map((p) => [p.step, p.rate * 100]), color: HeroKit.css('--e2e'), label: st.free ? 'текущий запуск' : 'DQN', w: 2.6 });
    lineChart($('#rChart'), { xMax: STEPS, xLabel: 'шаги взаимодействия', yLabel: 'успех на 40 целях проверки', yShort: 'успех', series, cursor: D.step, empty: D.step < 100 ? 'кривая появится после первых 100 шагов' : null });
  }
  function readout() {
    const D = st.D, b = D.buf, kk = st.sel != null ? st.sel : D.lastK;
    if (st.busy) { setOut($('#rOut'), `Ада делает шаги, сеть учится в браузере: <b>${pct(st.prog)}%</b>`); return; }
    const fr = st.free && D.step >= STEPS ? `Буфер хранит ${st.cap === 'all' ? 'все переходы' : st.cap + ' последних переходов'}, а пакет состоит из ${st.mode === 'recent' ? '32 последних переходов подряд' : '32 случайных переходов буфера'}. Средний успех на последних пяти проверках: <b>${pct(mean5(D.curve))}%</b>. ` : '';
    if (kk == null || !D.step) { setOut($('#rOut'), 'Буфер пуст. Каждый шаг Ады добавит в него один переход: состояние, действие, награду и следующее состояние.'); return; }
    const y = E.dqnTarget(D, kk), y0 = D.y0[kk], nb = b.n;
    const first = Number.isNaN(y0) ? 'в пакет ещё не попадал' : `целевое значение при первом попадании в пакет — <b>${fmt(y0, 2)}</b>, сейчас — <b>${fmt(y, 2)}</b>`;
    setOut($('#rOut'), `${fr}Шаг ${fmtInt(D.step)}, в буфере ${nWord(nb, 'переход', 'перехода', 'переходов')}${D.o.CAP < 1e8 ? ` (вмещает ${D.o.CAP})` : ''}. Выбран переход: эпизод ${b.ep[kk] + 1}, шаг ${b.born[kk] % T + 1}, действие — ${ACT_NAME(b.a[kk])}, награда <b>${fmt(b.r[kk], 2)}</b>; ${first}. Случайных действий сейчас: ${pct(D.lastEps)}%.`);
  }
  function render() { drawScene(); drawGrid(); drawChart(); readout(); const pg = $('#rProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%'; $$('#wrapRStep button, #wrapRFree button').forEach((b) => { b.disabled = st.busy || (b.dataset.n && st.D.step >= STEPS); }); }
  /** n шагов с перерисовкой: порциями между кадрами. */
  function advance(n, chunk) {
    return new Promise((res) => {
      const D = st.D, goal = Math.min(STEPS, D.step + n), from = D.step; st.busy = n > 30; st.sel = null; st.prog = 0;
      const tick = () => {
        const m = Math.max(1, (chunk || 30) * SPEED.k); for (let i = 0; i < m && D.step < goal; i++) E.dqnStep(D);
        st.prog = (D.step - from) / Math.max(1, goal - from);
        if (D.step < goal) { render(); requestAnimationFrame(tick); } else { st.busy = false; render(); if (ctl) ctl.update(); res(state()); }
      };
      tick();
    });
  }
  function state() { const D = st.D; return { step: D.step, n: D.buf.n, batch: !!D.last, ep1: epUse(D, 0), rate: D.curve[D.curve.length - 1].rate }; }
  const cache = {};
  function runFull(o) {
    const key = JSON.stringify(o); if (cache[key]) return Promise.resolve(cache[key]);
    return new Promise((res) => { const D = fresh(o); const tick = () => { const t0 = performance.now(); while (D.step < STEPS && performance.now() - t0 < 14) E.dqnStep(D); st.prog = D.step / STEPS; render(); if (D.step < STEPS) requestAnimationFrame(tick); else { cache[key] = D; res(D); } }; tick(); });
  }
  const mean5 = (c) => c.slice(-5).reduce((s, p) => s + p.rate, 0) / 5;
  const api = {
    reset() { st.D = fresh(); st.sel = null; st.cmp = null; st.free = false; render(); },
    state, render, st,
    step1: () => advance(1, 1), stepEp: () => advance(T - (st.D.step % T), 5), step250: () => advance(250, 30),
    async to1000() { await advance(1000 - st.D.step, 40); st.sel = 0; render(); const D = st.D; return { step: D.step, n: D.buf.n, ep1: epUse(D, 0), y0: D.y0[0], y: E.dqnTarget(D, 0), used0: D.buf.used[0], rate: D.curve[D.curve.length - 1].rate }; },
    async compare() {
      st.busy = true; st.prog = 0; render();
      try {
        const A = await runFull({}), B = await runFull({ recent: true });
        st.cmp = { buf: A.curve, rec: B.curve }; st.D = B; st.sel = null;
        return { buf: mean5(A.curve), rec: mean5(B.curve), bufMin: Math.min(...A.curve.slice(-5).map((p) => p.rate)), recMin: Math.min(...B.curve.slice(-5).map((p) => p.rate)), buf90: E.reach(A.curve, 0.9), rec90: E.reach(B.curve, 0.9), recUsed: B.buf.used[0] };
      } finally { st.busy = false; render(); }
    },
    async runFree() {
      st.busy = true; st.prog = 0; render();
      try { const o = { recent: st.mode === 'recent' }; if (st.cap !== 'all') o.CAP = +st.cap; st.D = await runFull(o); st.sel = null; return { rate: mean5(st.D.curve) }; } finally { st.busy = false; render(); }
    },
  };
  const missions = [
    { short: 'Первый пакет', title: 'Буфер заполняется', text: 'Ада учится дотягиваться до цели, как в лаборатории ниже, но у неё 9 действий: сдвинуть захват на 5 см в одну из 8 сторон или стоять. Каждый шаг кладёт в буфер один переход. Первые 100 шагов Ада только собирает опыт, дальше после каждого шага сеть учится на пакете из 32 случайных переходов. Сделай 4 эпизода кнопкой «+1 эпизод», а потом ещё один шаг.',
      controls: ['step'],
      criteria: [{ label: 'В буфере больше 100 переходов', test: (r, s) => s.step > 100 }, { label: 'Сеть сделала первое обновление по пакету', test: (r, s) => s.batch }],
      explain: () => 'Оранжевые точки на карте буфера — пакет этого шага: 32 перехода из всех эпизодов вперемешку, а не последние 32. Нажми «1 шаг» ещё раз: пакет каждый раз новый, и любой переход может в него попасть, сколько бы ему ни было лет.' },
    { short: 'Старые', title: 'Учат ли старые переходы', text: 'Переходы первого эпизода Ада сделала, когда сеть ещё ничего не умела и почти все действия были случайными. Пусть Ада дойдёт до 1000 шагов.',
      controls: ['step'],
      bet: { q: 'сколько раз к шагу 1000 каждый переход первого эпизода попадёт в пакеты?', options: ['Почти ни разу: данные случайной политики только мешают', 'Несколько раз, пока они свежие', 'Десятки раз, как и остальные'], answer: (r) => (r.ep1 >= 20 ? 2 : r.ep1 >= 4 ? 1 : 0) },
      action: { label: 'Дойти до 1000 шагов', run: (X) => X.to1000() },
      criteria: [{ label: 'В буфере все 1000 переходов', test: (r) => r.n === 1000 }, { label: 'Переходы первого эпизода были в пакетах в среднем хотя бы 20 раз', test: (r) => r.ep1 >= 20 }],
      explain: (r) => `Каждый переход первого эпизода побывал в пакетах в среднем ${fmt(r.ep1, 0)} ${plural(Math.round(r.ep1), 'раз', 'раза', 'раз')}. На сцене — самый первый переход, сам он был в пакетах ${r.used0} ${plural(r.used0, 'раз', 'раза', 'раз')}. Когда он впервые попал в пакет, целевое значение было ${fmt(r.y0, 2)}: сеть ещё ничего не знала о будущем, и оно почти равнялось одной награде. Сейчас целевое значение того же перехода — ${fmt(r.y, 2)}: в него входит оценка того, сколько ещё стоит путь из следующего состояния. Переход тот же, а учит он новому. Успех на проверке — ${pct(r.rate)}%.` },
    { short: 'Без буфера', title: 'Учиться только на свежем', text: 'Обучим двух Аду с нуля по 1500 шагов. Первую — как раньше, пакетами из всего буфера. Вторую — без буфера: на каждом шаге пакет из 32 последних переходов подряд, каждый переход учит 32 шага и уходит.',
      bet: { q: 'что будет без буфера?', options: ['То же самое: переходы ведь те же', 'Лучше: данные свежие, от текущей политики', 'Хуже и неровно'], answer: (r) => (r.rec < r.buf - 0.1 ? 2 : r.rec > r.buf + 0.05 ? 1 : 0) },
      action: { label: 'Обучить обе', run: (X) => X.compare() },
      criteria: [{ label: 'Без буфера средний успех на последних пяти проверках ниже хотя бы на 10 пунктов', test: (r) => r.rec < r.buf - 0.1 }],
      explain: (r) => `На последних пяти проверках (шаги 1100–1500) с буфером в среднем ${pct(r.buf)}%, без буфера — ${pct(r.rec)}%, а самая слабая проверка без буфера — ${pct(r.recMin)}%. Подряд идущие переходы похожи друг на друга: один эпизод, одна цель, соседние позы руки. Сеть подгоняется под последние 32 шага и забывает остальные, кривая скачет. Карта «Буфер» теперь показывает Аду без буфера: каждый переход попадает в пакеты 32 шага подряд, пока он среди последних, и больше никогда.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй размер буфера и способ набирать пакет и обучай заново на 1500 шагов. Найди самый маленький буфер, с которым средний успех на последних пяти проверках не ниже 85%.', final: true, controls: ['step', 'free'] },
  ];
  function init() {
    legend('#rLegend', [['рука до шага', 'var(--classic)'], ['рука после шага (бледная)', 'color-mix(in srgb, var(--classic) 40%, transparent)'], ['сдвиг захвата за шаг', 'var(--e2e)'], ['цель эпизода', 'var(--good)', 'ring'], ['зона 4 см вокруг цели', 'var(--good)', 'dash'], ['где появляются цели', 'var(--ink-3)', 'dash'], ['переход в буфере: темнее — чаще в пакетах', 'var(--classic)', 'cell'], ['переход, вытесненный из буфера', 'var(--line)', 'cell'], ['пакет последнего шага', 'var(--e2e)', 'dot'], ['выбранный переход', 'var(--ink)', 'box']]);
    $('#rStep1').addEventListener('click', () => { if (!st.busy) api.step1(); });
    $('#rStepEp').addEventListener('click', () => { if (!st.busy) api.stepEp(); });
    $('#rStep250').addEventListener('click', () => { if (!st.busy) api.step250(); });
    segBind('#rCap', (v) => { if (st.busy) return; st.cap = v; segSet('#rCap', v); });
    segBind('#rMode', (v) => { if (st.busy) return; st.mode = v; segSet('#rMode', v); });
    $('#rRun').addEventListener('click', () => { if (!st.busy) { st.free = true; api.runFree(); } });
    $('#rBuf').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * GRID.W, y = (e.clientY - r.top) / r.height * GRID.H, D = st.D;
      const eps = Math.ceil(D.o.steps / T), gw = GRID.W - GRID.L - GRID.R, gh = GRID.H - GRID.T - GRID.B, col = Math.floor((x - GRID.L) / (gw / eps)), row = Math.floor((y - GRID.T) / (gh / T));
      const born = col * T + row; if (col < 0 || row < 0 || row >= T || born >= D.step) return;
      for (let j = 0; j < D.buf.n; j++) if (D.buf.born[j] === born) { st.sel = j; render(); return; }
    });
    ctl = mountMissions('#rMis', missions, api, { controls: { step: '#wrapRStep', free: '#wrapRFree' }, scene: '#rDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: PPO и SAC на одной руке — успех по шагам взаимодействия
   ===================================================================== */
const Race = (() => {
  const E = L53, BUDGET = 750, LONG = 3000, SHOW = 16; // SHOW — номер цели проверки на сценах (в середине области целей)
  const st = { seed: 1, sac: {}, ppo: {}, show: { sac: false, ppo: false }, ppoMax: BUDGET, at: BUDGET, busy: false, prog: 0, label: '' };
  let ctl = null;
  const COL = () => ({ sac: HeroKit.css('--e2e'), ppo: HeroKit.css('--hybrid') });
  async function train(kind, steps) {
    const box = st[kind], key = st.seed;
    if (box[key] && box[key].steps >= steps) return box[key];
    const g = kind === 'sac' ? E.sacRun(E.REACH, { seed: key, steps, snap: true }) : E.ppoRun(E.REACH, { seed: key, steps, snap: true });
    const res = await runChunked(g, (e) => { st.prog = e.step / e.of; render(); }, 14);
    box[key] = Object.assign(res, { steps, reuse: res.buf ? E.reuse(res.buf) : null });
    return box[key];
  }
  const pointAt = (res, step) => { let p = res.curve[0]; for (const q of res.curve) if (q.step <= step) p = q; return p; };
  function pane(kind) {
    const cv = $(kind === 'sac' ? '#cCvS' : '#cCvP'), res = st[kind][st.seed], col = COL()[kind];
    const { c, k, P, sh } = View.base(cv, { area: true }), t = E.REACH.TEST[SHOW];
    View.target(c, t, P, E.REACH.HOLD);
    if (!res || !st.show[kind]) { View.arm(c, E.ARM.Q0, P, col); HeroKit.label(c, k, st.busy ? 'учится…' : (sh ? 'не обучен' : 'ещё не обучен: нажми кнопку миссии'), View.W / 2 + 30, 340, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.grid }); setOut($(kind === 'sac' ? '#cStatS' : '#cStatP'), st.busy ? 'Учится в браузере…' : 'Ещё не обучен'); return; }
    const p = pointAt(res, st.at), act = E.snapAct(p.pol, kind), ro = E.rollout(E.REACH, act, E.REACH.reset(null, t), true);
    View.path(c, ro.path, col, { dots: true, lw: 1.8 });
    View.arm(c, ro.st.q, P, col);
    HeroKit.label(c, k, `после ${fmtInt(p.step)} шагов`, 10, 16, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    const d = E.dist(ro.st.q, t), el = $(kind === 'sac' ? '#cStatS' : '#cStatP');
    setOut(el, `<b>Успех на 40 целях: ${pct(p.rate)}%</b> · здесь промах ${fmt(d * 100, 0)} см`); el.className = 'pane-stat ' + (p.rate >= 0.9 ? 'ok' : 'bad');
  }
  function chart() {
    const C = COL(), series = [], S = st.sac[st.seed], Pp = st.ppo[st.seed];
    if (Pp && st.show.ppo) series.push({ pts: Pp.curve.filter((q) => q.step <= st.ppoMax).map((q) => [q.step, q.rate * 100]), color: C.ppo, label: 'PPO' });
    if (S && st.show.sac) series.push({ pts: S.curve.map((q) => [q.step, q.rate * 100]), color: C.sac, label: 'SAC' });
    const xMax = Math.max(BUDGET, st.ppoMax);
    lineChart($('#cChart'), { xMax, xStep: xMax > 1000 ? (narrowOf($('#cChart')) ? 1000 : 500) : 250, xLabel: 'шаги взаимодействия с миром (не время вычислений)', xShort: 'шаги взаимодействия с миром', yLabel: 'успех на 40 целях проверки', yShort: 'успех', series, cursor: series.length ? st.at : null, empty: series.length ? null : 'нажми кнопку миссии: кривые появятся здесь' });
  }
  function render() {
    pane('sac'); pane('ppo'); chart();
    const inp = $('#cAt'); inp.max = Math.max(BUDGET, st.ppoMax); inp.value = st.at; syncRange(inp, fmtInt(st.at));
    const pg = $('#cProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) setOut($('#cOut'), `${st.label}: <b>${pct(st.prog)}%</b>`);
    else setOut($('#cOut'), st.show.sac || st.show.ppo ? `Сцены показывают попытку каждой политики на одной цели проверки после ${fmtInt(st.at)} шагов взаимодействия; ползунок двигает этот момент.` : 'Обе руки ещё не обучены. Сети одинаковые: два слоя по 24 нейрона у политики и у оценок ценности.');
    $('#cSeedRun').disabled = st.busy;
  }
  async function busy(label, fn) { st.busy = true; st.label = label; st.prog = 0; render(); try { return await fn(); } finally { st.busy = false; render(); if (ctl) ctl.update(); } }
  const sumOf = (res) => ({ s90: E.reach(res.curve, 0.9), at: (n) => pointAt(res, n).rate, ops: (n) => pointAt(res, n).ops, upd: res.updates, ms: res.ms, reuse: res.reuse });
  function state() { return { at: st.at, seed: st.seed }; }
  const api = {
    reset() { st.seed = 1; st.show = { sac: false, ppo: false }; st.ppoMax = BUDGET; st.at = BUDGET; segSet('#cSeed', 1); render(); },
    state, render, st,
    setAt(v) { st.at = Math.max(0, Math.min(Math.max(BUDGET, st.ppoMax), v)); render(); },
    first() {
      return busy('Обе руки учатся в браузере', async () => {
        const S = await train('sac', BUDGET), Pp = await train('ppo', LONG);
        st.show = { sac: true, ppo: true }; st.ppoMax = BUDGET; st.at = BUDGET;
        return { sac: pointAt(S, BUDGET).rate, ppo: pointAt(Pp, BUDGET).rate, sac90: E.reach(S.curve, 0.9), reuse: S.reuse };
      });
    },
    longer() {
      return busy('PPO учится дальше', async () => {
        const S = await train('sac', BUDGET), Pp = await train('ppo', LONG);
        st.show = { sac: true, ppo: true }; st.ppoMax = LONG; const p90 = E.reach(Pp.curve, 0.9); st.at = p90 || LONG;
        return { sac90: E.reach(S.curve, 0.9), ppo90: p90, ratio: p90 / E.reach(S.curve, 0.9), batches: Math.round((p90 || LONG) / E.PPO.N), epochs: E.PPO.EPOCHS, reuse: S.reuse };
      });
    },
    cost() {
      return busy('Считаем умножения', async () => {
        const S = sumOf(await train('sac', BUDGET)), Pp = sumOf(await train('ppo', LONG));
        st.show = { sac: true, ppo: true }; st.ppoMax = LONG;
        const sOps = S.ops(S.s90), pOps = Pp.ops(Pp.s90);
        return { s90: S.s90, p90: Pp.s90, sOps, pOps, ratio: sOps / pOps, perS: sOps / S.s90, perP: pOps / Pp.s90 };
      });
    },
    runSeed() {
      return busy(`Зерно ${st.seed}: обе руки учатся`, async () => { const S = await train('sac', BUDGET), Pp = await train('ppo', LONG); st.show = { sac: true, ppo: true }; st.ppoMax = LONG; return { sac90: E.reach(S.curve, 0.9), ppo90: E.reach(Pp.curve, 0.9) }; });
    },
  };
  const M = (v) => fmt(v / 1e6, 0);
  const missions = [
    { short: 'Ставка', title: 'Одинаковый бюджет шагов', text: 'Задача — дотянуться захватом до цели, которая каждый эпизод появляется в новом месте. У обеих рук одинаковые сети, одна и та же награда и по 750 шагов взаимодействия: 30 эпизодов по 25 шагов. PPO собирает порцию из 5 эпизодов, делает по ней 20 эпох обновлений и выбрасывает её. SAC кладёт каждый шаг в буфер и после каждого шага учится на пакете из всего буфера.',
      bet: { q: 'кто к 750-му шагу будет дотягиваться до цели чаще?', options: ['PPO: обрезка не даёт его политике испортиться, он устойчивее', 'Поровну: задача и сети одинаковые', 'SAC'], answer: (r) => (r.sac > r.ppo + 0.15 ? 2 : r.ppo > r.sac + 0.15 ? 0 : 1) },
      action: { label: 'Обучить обе руки по 750 шагов', run: (X) => X.first() },
      criteria: [{ label: 'SAC дотягивается хотя бы в 90% попыток', test: (r) => r.sac >= 0.9 }, { label: 'SAC опережает PPO хотя бы на 40 пунктов', test: (r) => r.sac >= r.ppo + 0.4 }],
      explain: (r) => `К 750-му шагу SAC дотягивается до цели в ${pct(r.sac)}% попыток, PPO — в ${pct(r.ppo)}%. SAC прошёл 90% уже к ${fmtInt(r.sac90)}-му шагу. Каждый переход его буфера побывал в пакетах в среднем ${fmt(r.reuse, 1)} раза, в том числе когда политика давно стала другой. У PPO каждый переход учит 20 эпох подряд, пока его политика почти та же, что собрала порцию, а потом уходит в корзину. В следующей миссии под сценами появится ползунок: им видно, на каком шаге каждая рука начинает попадать.` },
    { short: 'Сколько шагов', title: 'Догонит ли PPO', text: 'Дадим PPO ещё шагов, до 3000, и посмотрим, когда он дойдёт до тех же 90%.',
      controls: ['at'],
      bet: { q: 'во сколько раз больше шагов нужно PPO, чтобы дойти до 90%?', options: ['Столько же: он просто медленнее начинает', 'В 2–4 раза больше', 'В сотни раз больше: on-policy нужны миллионы шагов'], answer: (r) => (r.ratio == null || r.ratio >= 8 ? 2 : r.ratio >= 1.6 ? 1 : 0) },
      action: { label: 'Учить PPO до 3000 шагов', run: (X) => X.longer() },
      criteria: [{ label: 'PPO дошёл до 90%', test: (r) => r.ppo90 != null }, { label: 'Ему понадобилось хотя бы вдвое больше шагов, чем SAC', test: (r) => r.ppo90 != null && r.ratio >= 2 }],
      explain: (r) => `PPO дошёл до 90% к ${fmtInt(r.ppo90)}-му шагу, SAC — к ${fmtInt(r.sac90)}-му: в ${fmt(r.ratio, 1)} раза больше шагов. За это время PPO собрал ${r.batches} порций, и каждую выбросил после ${r.epochs} эпох. На простой задаче разница в разы, на сложных — больше: в таблице из статьи TD3 через миллион шагов PPO набирает на HalfCheetah в пять с лишним раз меньше очков, чем TD3.` },
    { short: 'Вычисления', title: 'А по времени вычислений?', text: 'Шаги взаимодействия — то, что стоит дорого на настоящем роботе. Но есть и вторая цена — вычисления. Посчитаем, сколько умножений сделали сети каждой руки, пока она не дошла до 90%.',
      controls: ['at'],
      bet: { q: 'кто дешевле по вычислениям до 90%?', options: ['SAC: ему нужно в разы меньше шагов', 'PPO: каждый его шаг проще', 'Примерно поровну'], answer: (r) => (r.ratio < 0.67 ? 0 : r.ratio > 1.5 ? 1 : 2) },
      action: { label: 'Посчитать умножения', run: (X) => X.cost() },
      criteria: [{ label: 'На один шаг взаимодействия SAC тратит хотя бы вдвое больше умножений', test: (r) => r.perS >= 2 * r.perP }],
      explain: (r) => `До 90% SAC сделал около ${M(r.sOps)} млн умножений, PPO — около ${M(r.pOps)} млн. На один шаг взаимодействия у SAC выходит в ${fmt(r.perS / r.perP, 1)} раза больше умножений: каждый шаг — обновление двух Q-функций, их целевых копий и политики по пакету из 32 переходов. SAC экономит шаги, а не вычисления. Поэтому в симуляции, где шаг почти ничего не стоит и тысячи роботов идут параллельно, выбирают PPO, а на настоящем роботе, где каждый шаг — секунды работы и износ, — off-policy методы.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбери другое зерно случайности и обучи обе руки заново. Найди зерно, на котором PPO отстаёт по шагам сильнее всего.', final: true, controls: ['at', 'seed'] },
  ];
  function init() {
    legend('#cLegend', [['путь захвата SAC', 'var(--e2e)'], ['путь захвата PPO', 'var(--hybrid)'], ['цель', 'var(--good)', 'ring'], ['зона 4 см вокруг цели', 'var(--good)', 'dash'], ['область, где появляются цели', 'var(--ink-3)', 'dash']]);
    $('#cAt').addEventListener('input', (e) => api.setAt(+e.target.value));
    segBind('#cSeed', (v) => { if (st.busy) return; st.seed = +v; segSet('#cSeed', v); st.show = { sac: !!st.sac[st.seed], ppo: !!st.ppo[st.seed] }; render(); });
    $('#cSeedRun').addEventListener('click', () => { if (!st.busy) api.runSeed().then((r) => setOut($('#cOut'), `Зерно ${st.seed}: SAC дошёл до 90% к ${fmtInt(r.sac90)}-му шагу, PPO — к ${r.ppo90 ? fmtInt(r.ppo90) + '-му' : 'концу не дошёл'}${r.ppo90 ? `, в ${fmt(r.ppo90 / r.sac90, 1)} раза позже` : ''}.`)); });
    ctl = mountMissions('#cMis', missions, api, { controls: { at: '#wrapCAt', seed: '#wrapCSeed' }, scene: '#cDuo' });
    syncRange($('#cAt'), String(BUDGET)); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: температура α — две одинаковые чашки на двух полках
   ===================================================================== */
const Temp = (() => {
  const E = L53, SEED = 3, STEPS = 2000, AL = [0.003, 0.01, 0.03, 0.1, 0.2, 0.3, 1];
  const st = { i: 1, auto: false, runs: {}, busy: false, prog: 0, last: null };
  let ctl = null;
  const keyOf = () => (st.auto ? 'auto' : String(AL[st.i]));
  async function train(key) {
    if (st.runs[key]) return st.runs[key];
    const o = Object.assign({ seed: SEED, steps: STEPS, EVERY: 250 }, key === 'auto' ? { ALPHA0: 1 } : { alpha: +key });
    const res = await runChunked(E.sacRun(E.SHELF, o), (e) => { st.prog = e.step / e.of; render(); }, 14);
    const c = res.curve[res.curve.length - 1];
    st.runs[key] = { key, A: c.A, B: c.B, none: c.none, ret: c.ret, paths: c.paths, qs: c.qs, det: c.det, alpha: c.alpha, alphas: res.curve.map((p) => p.alpha) };
    return st.runs[key];
  }
  function scene() {
    const cv = $('#tCv'), { c, k, P, K, sh } = View.base(cv), q = st.runs[keyOf()];
    View.shelf(c, E.SHELF.A, P, K); View.shelf(c, E.SHELF.B, P, K);
    for (const t of [E.SHELF.A, E.SHELF.B]) { c.setLineDash([3, 3]); c.strokeStyle = P.good; c.lineWidth = 1.2; c.beginPath(); c.arc(View.X(t.x), View.Y(t.y), E.SHELF.HOLD * View.SC, 0, 7); c.stroke(); c.setLineDash([]); }
    HeroKit.label(c, k, sh ? 'полка 1' : 'полка 1 (дальняя)', View.X(E.SHELF.A.x), View.Y(E.SHELF.A.y) + 34, { px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, sh ? 'полка 2' : 'полка 2 (ближняя)', View.X(E.SHELF.B.x) + 6, View.Y(E.SHELF.B.y) - 48, { px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
    if (!q) { View.arm(c, E.ARM.Q0, P, P.e2e); HeroKit.label(c, k, st.busy ? 'Ада учится…' : (sh ? 'не обучена' : 'ещё не обучена: нажми кнопку миссии'), View.W / 2 + 30, 340, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.grid }); return; }
    const where = (p) => { const L = p[p.length - 1], dA = Math.hypot(L.x - E.SHELF.A.x, L.y - E.SHELF.A.y), dB = Math.hypot(L.x - E.SHELF.B.x, L.y - E.SHELF.B.y); return dA < E.SHELF.HOLD ? 'A' : dB < E.SHELF.HOLD ? 'B' : '0'; };
    q.paths.slice(0, 8).forEach((p) => { const w = where(p); View.path(c, p, w === '0' ? P.ink3 : w === 'A' ? P.cl : P.hy, { alpha: 0.5, lw: 1.1 }); });
    View.arm(c, q.qs[0], P, P.e2e);
    for (const p of q.paths) { const w = where(p), L = p[p.length - 1]; c.beginPath(); c.arc(View.X(L.x), View.Y(L.y), 3.4, 0, 7); c.fillStyle = w === '0' ? P.ink3 : w === 'A' ? P.cl : P.hy; c.fill(); c.lineWidth = 1; c.strokeStyle = P.surf; c.stroke(); }
    HeroKit.label(c, k, `α = ${st.auto ? 'сама, к концу ' + fmtA(q.alpha) : fmtA(AL[st.i])}`, 10, 16, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
  }
  function bars() {
    const box = $('#tBars'), q = st.runs[keyOf()]; box.innerHTML = '';
    if (!q) return;
    const n = E.SHELF.EVAL, row = (label, v, cls) => h('div', { class: 'bar-row ' + cls }, h('span', { class: 'bl' }, label), h('div', { class: 'bt' }, h('i', { style: `width:${(v * 100).toFixed(1)}%` })), h('span', { class: 'bn' }, `${Math.round(v * n)} из ${n}`));
    box.append(h('div', { class: 'sc-h muted-s' }, `Где закончились ${E.SHELF.EVAL} попыток Ады с этой политикой`), row('у полки 1', q.A, 'ta'), row('у полки 2', q.B, 'tb'), row('ни у одной', q.none, 'tn'));
  }
  function render() {
    scene(); bars();
    const inp = $('#tAlpha'); inp.value = st.i; syncRange(inp, fmtA(AL[st.i])); inp.disabled = st.auto || st.busy;
    const pg = $('#tProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const q = st.runs[keyOf()];
    if (st.busy) setOut($('#tOut'), `Ада учится в браузере, 2000 шагов: <b>${pct(st.prog)}%</b>`);
    else if (q) setOut($('#tOut'), `${st.auto ? `Температура подстраивалась сама: начала с 1 и к концу пришла к ${fmtA(q.alpha)}. ` : ''}Средняя награда за шаг — <b>${fmt(q.ret, 2)}</b> (у чашки — до 1).`);
    else setOut($('#tOut'), 'Политика ещё не обучена при этой температуре.');
  }
  async function ensure() { const key = keyOf(); if (st.runs[key]) { render(); return st.runs[key]; } st.busy = true; st.prog = 0; render(); try { return await train(key); } finally { st.busy = false; render(); if (ctl) ctl.update(); } }
  function setI(i) { st.i = Math.max(0, Math.min(AL.length - 1, i)); st.auto = false; segSet('#tMode', 'fix'); render(); return ensure(); }
  function state() { const q = st.runs[keyOf()]; return { i: st.i, alpha: AL[st.i], auto: st.auto, busy: st.busy, q }; }
  const api = {
    reset() { st.i = 1; st.auto = false; segSet('#tMode', 'fix'); render(); },
    state, render, st, setI,
    at(alpha) { return setI(AL.indexOf(alpha)).then((q) => Object.assign({ alpha }, q)); },
    auto() { st.auto = true; segSet('#tMode', 'auto'); render(); return ensure(); },
  };
  const one = (q) => Math.max(q.A, q.B);
  const missions = [
    { short: 'Малая α', title: 'Почти без бонуса за случайность', text: 'На двух полках стоят одинаковые чашки, до обеих захвату примерно одинаково далеко — около 38 см. Награда за шаг у любой чашки одна и та же. Температура α = 0,01: бонус за случайность почти не влияет на выбор. Обучим SAC 2000 шагов и посмотрим, куда Ада поедет в 40 попытках со своей обученной случайной политикой.',
      bet: { q: 'куда поедет Ада в 40 попытках?', options: ['К обеим полкам примерно поровну: чашки одинаковые', 'Почти всегда к одной полке', 'Никуда: без случайности нечем исследовать'], answer: (r) => (one(r) >= 0.9 ? 1 : r.none >= 0.5 ? 2 : 0) },
      action: { label: 'Обучить при α = 0,01', run: (X) => X.at(0.01) },
      criteria: [{ label: 'Хотя бы 90% попыток ведут к одной и той же полке', test: (r) => one(r) >= 0.9 }],
      explain: (r) => `${pct(one(r))}% попыток ведут к полке ${r.A > r.B ? 1 : 2}, а ${pct(Math.min(r.A, r.B))}% — к другой. Все пути почти совпадают: политика нашла одну стратегию и перестала пробовать другие. Ничего плохого в этой полке нет, но, если её займут, Аде придётся учиться заново: про вторую она знает только по первым случайным шагам.` },
    { short: 'Большая α', title: 'Бонус за случайность больше награды', text: 'Теперь α = 1: энтропия весит столько же, сколько награда у полки.',
      bet: { q: 'что будет при α = 1?', options: ['Поровну к обеим полкам: случайность поможет выбрать обе', 'Почти всегда к одной полке', 'Почти никуда: Ада не удержится ни у одной'], answer: (r) => (r.none >= 0.8 ? 2 : one(r) >= 0.9 ? 1 : 0) },
      action: { label: 'Обучить при α = 1', run: (X) => X.at(1) },
      criteria: [{ label: 'У полок заканчивается не больше 10% попыток', test: (r) => r.A + r.B <= 0.1 }],
      explain: (r) => `У полок заканчиваются ${pct(r.A + r.B)}% попыток. Политика почти равномерно случайна: выгоднее быть непредсказуемой, чем стоять у чашки. Средняя награда за шаг — ${fmt(r.ret, 2)} из возможной 1. Авторы SAC описывают то же: при слишком малом масштабе награды, то есть большой α, политика становится почти равномерной и не пользуется наградой.` },
    { short: 'Обе полки', title: 'α, при которой Ада ещё пробует обе полки', text: 'Двигай ползунок температуры: при каждом новом значении SAC обучается заново, это занимает пару секунд. Найди α, при которой Ада ездит к обеим полкам и хотя бы в 40% попыток до них доезжает.',
      controls: ['alpha'],
      criteria: [{ label: 'К каждой полке ведут хотя бы 5% попыток', test: (r, s) => !!s.q && !s.busy && s.q.A >= 0.05 && s.q.B >= 0.05 }, { label: 'У полок заканчиваются хотя бы 40% попыток', test: (r, s) => !!s.q && !s.busy && s.q.A + s.q.B >= 0.4 }],
      hint: 'При α = 0,1 политика ещё держится одной полки, при 0,3 уже почти не доезжает. Попробуй между ними.',
      explain: (r) => `При α = ${fmtA(r.alpha)} к полке 1 ведут ${pct(r.q.A)}% попыток, к полке 2 — ${pct(r.q.B)}%, а мимо проходят ${pct(r.q.none)}%. Ада ещё пробует обе полки, но поровну попытки не делит: у гауссианы одна вершина, и, чтобы дотянуться до обеих полок, ей приходится расшириться, а часть попыток уходит мимо. Окно узкое: на шести зёрнах такая картина при α = 0,2 получилась в трёх (см. «Под капотом»). Во второй версии SAC α подбирается автоматически — проверь в свободном режиме, к скольким полкам Ада ездит тогда.` },
    { short: 'Свободно', title: 'Свободный режим: α подбирается сама', text: 'Переключи температуру на «подбирать самой»: SAC начинает с α = 1 и меняет её так, чтобы энтропия политики держалась у целевой, −2. Сравни с ручными значениями: к скольким полкам теперь ездит Ада?', final: true, controls: ['alpha', 'mode'] },
  ];
  function init() {
    legend('#tLegend', [['конец попытки у полки 1', 'var(--classic)', 'dot'], ['конец попытки у полки 2', 'var(--hybrid)', 'dot'], ['конец попытки мимо полок', 'var(--ink-3)', 'dot'], ['пути первых 8 попыток', 'var(--ink-3)'], ['рука в конце первой попытки', 'var(--e2e)'], ['зона 6 см вокруг чашки', 'var(--good)', 'dash']]);
    $('#tAlpha').addEventListener('input', (e) => { if (!st.busy) setI(+e.target.value); else e.target.value = st.i; });
    segBind('#tMode', (v) => { if (st.busy) return; if (v === 'auto') api.auto(); else setI(st.i); });
    ctl = mountMissions('#tMis', missions, api, { controls: { alpha: '#wrapTAlpha', mode: '#wrapTMode' }, scene: '#tCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, AL };
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
    { q: 'Off-policy метод учится без взаимодействия с миром?', o: ['Да, ему хватает чужих записей', 'Нет: он сам собирает опыт, но может учиться на переходах, которые собрала любая политика, в том числе его же старые версии', 'Нет, off-policy — это только про обучение в симуляции'], a: 1, e: 'SAC в лаборатории 1 сам сделал все 750 шагов. Отличие от PPO в другом: целевое значение для Q-функции не зависит от того, какая политика выбрала записанное действие, поэтому старые переходы из буфера продолжают учить.' },
    { q: 'Зачем DQN буфер воспроизведения, если можно учиться на каждом новом переходе сразу?', o: ['Только чтобы сэкономить память', 'Переходы подряд похожи друг на друга, а случайный пакет из буфера разбивает эту связь; к тому же каждый переход учит много раз', 'Чтобы сеть видела только самые свежие данные'], a: 1, e: 'Авторы DQN называют обе причины. В интерактиве без буфера, на 32 последних переходах подряд, средний успех на последних проверках упал с 96 до 52%, а кривая скачет.' },
    { q: 'Почему PPO не может просто учиться дальше на старых порциях, как SAC на буфере?', o: ['Может, просто так не принято', 'Градиент политики оценивают по действиям той политики, которая их выбрала: после обновления порция описывает уже другую политику, и обрезка 1 ± ε не даёт уйти от неё далеко', 'Старые порции занимают слишком много памяти'], a: 1, e: 'Отношение вероятностей r(θ) сравнивает новую политику с той, что собрала порцию. Когда политика уходит дальше 1 ± ε, градиент обнуляется — порция больше ничему не учит. Q-функции такое ограничение не нужно.' },
    { q: 'Можно ли управлять рукой с 7 суставами через DQN, разбив каждый мотор на «назад, стоп, вперёд»?', o: ['Да, это стандартный способ', 'Плохо: действий станет 3⁷ = 2187, а для точного управления нужно больше делений, и максимум по ним искать трудно', 'Нет, DQN работает только с картинками'], a: 1, e: 'Этот пример приводят авторы DDPG. Вместо перебора действий DDPG учит отдельную сеть-актёра, которая выдаёт действие, а критик Q(s, a) подсказывает, куда его сдвинуть.' },
    { q: 'Зачем TD3 и SAC две Q-функции?', o: ['Чтобы усреднить их и получить точнее', 'Чтобы брать меньшую из двух оценок в целевом значении: максимум по шумной оценке систематически её завышает', 'Чтобы одна училась на старых данных, а другая на новых'], a: 1, e: 'Это переоценка: политика тянется туда, где Q ошибочно высока, и ошибка накапливается через целевое значение. Минимум двух независимых оценок может занижать, но авторы TD3 считают это меньшим злом: заниженное действие политика не выбирает.' },
    { q: 'Чем больше температура α, тем лучше SAC исследует и тем лучше результат?', o: ['Да, исследования много не бывает', 'Нет: при α = 1 Ада почти не доезжала ни до одной полки, политика стала почти равномерно случайной', 'Нет, α влияет только на скорость обучения'], a: 1, e: 'При α = 0,01 почти все попытки шли к одной полке, при α = 1 у полок заканчивались 3% попыток. Поэтому во второй версии SAC (2018) α подбирается сама: энтропию политики держат около целевой. А поделить попытки поровну между двумя полками гауссова политика не может: вершина у неё одна.' },
    { q: 'SAC лучше PPO во всём?', o: ['Да, он новее', 'Нет: SAC экономит шаги взаимодействия, но на каждый шаг тратит в разы больше вычислений; в быстрой параллельной симуляции чаще выбирают PPO', 'Нет, SAC хуже по шагам, но быстрее по времени'], a: 1, e: 'В лаборатории 1 SAC дошёл до 90% за 500 шагов, PPO — за 1250, а умножений до 90% у обоих вышло примерно поровну. На роботе дорог шаг, в симуляции — время вычислений.' },
    { q: 'SERL научила руку вставлять разъём в плату за 20 минут. Значит, RL на настоящем роботе стартует с нуля и обходится без людей?', o: ['Да, достаточно награды', 'Нет: обучение начинали с 20 демонстраций оператора, успех определял классификатор или датчик, а сброс сцены был автоматизирован', 'Нет, SERL учили в симуляторе'], a: 1, e: 'Off-policy метод позволяет класть демонстрации прямо в буфер: в SERL половину каждого пакета берут из них. Minitaur у авторов SAC учился с нуля — 160 тысяч шагов, около двух часов, — но людям приходилось поднимать его после падений.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('replay', () => { mis.replay = Replay.init(); });
    safe('race', () => { mis.race = Race.init(); });
    safe('temp', () => { mis.temp = Temp.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['rMis', 'cMis', 'tMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l53 = { mis, SPEED, Replay, Race, Temp, L53, View }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
