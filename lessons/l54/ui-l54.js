/* =====================================================================
   ui-l54.js — урок 5.4 «Перенос из симуляции: рандомизация». Схемы и
   интерактивы:
   0) анимированные схемы (shared/anim.js): путь команды в симуляторе и
      на настоящей руке; цикл автоматической рандомизации (ADR);
   1) интерактив «карта миров»: политика из номинального мира в мирах
      с другой задержкой, массой чашки, силой моторов и трением;
   2) лаборатория 1: с рандомизацией и без, шесть настоящих рук;
   3) лаборатория 2: ширина диапазонов — успех против скорости;
   4) лаборатория 3: ADR на руке Ады против широкого диапазона с начала;
   5) квиз.
   Движок — l54/engine.js (без DOM) поверх shared/arm-core.js.
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
const fmt = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const sec = (steps) => fmt(steps * 0.05, 2);                          // шаги управления → секунды
const of20 = (r) => Math.round(r * 20);
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
const narrowOf = (cv, at) => (cv.getBoundingClientRect().width || 600) < (at || 460);
/** Цвет с прозрачностью из CSS-цвета (#rrggbb или rgb()). */
function rgbOf(col) {
  const s = String(col).trim(); let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^rgba?\(([^)]+)\)$/.exec(s); if (m) return m[1].split(',').slice(0, 3).map((x) => +x.trim());
  return [128, 128, 128];
}
const mixCol = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const alphaCol = (c, a) => `rgba(${rgbOf(c).join(',')},${a})`;
/** Цвет клетки по доле удачных попыток: красный → жёлтый → зелёный. */
function rateCol(r, P) { const mid = mixCol(P.bad, P.good, 0.5), y = '#e0b43c'; return r < 0.5 ? mixCol(P.bad, y, r / 0.5) : mixCol(y, P.good, (r - 0.5) / 0.5); }
const fmt2 = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const fmtW = (k) => (k === 0.5 ? '×½' : '×' + fmt(k, 0));
/** Описание мира словами. */
const worldText = (w) => `задержка ${fmt(w.d, 0)} мс, чашка ${fmt(w.m, 2)} кг, трение ${fmt(w.f, 2)} Н·м, моторы ${fmt(w.s * 100, 0)}%`;

/* =====================================================================
   Кэш обученных политик: одна и та же политика нужна нескольким
   лабораториям (номинальная — карте миров и лаборатории 1, ×1 —
   лабораториям 1 и 2). Обучение — генератор, кусками между кадрами.
   ===================================================================== */
const Pol = (() => {
  const cache = {}, pending = {};
  const keyOf = (kind, o) => JSON.stringify([kind, o.seed, o.steps || null, o.adr || null]);
  function get(kind, o, onProg) {
    o = Object.assign({ seed: L54.LAB.SEED }, o || {}); const key = keyOf(kind, o);
    if (cache[key]) return Promise.resolve(cache[key]);
    if (!pending[key]) pending[key] = { subs: [], p: null };
    const pd = pending[key]; if (onProg) pd.subs.push(onProg);
    if (!pd.p) pd.p = runChunked(L54.train(kind, o), (e) => { if (e && e.of) pd.subs.forEach((f) => f(e.step / e.of)); }, 14).then((res) => { cache[key] = res; delete pending[key]; return res; });
    return pd.p;
  }
  const has = (kind, o) => !!cache[keyOf(kind, Object.assign({ seed: L54.LAB.SEED }, o || {}))];
  return { get, has, cache };
})();

/* =====================================================================
   0а. Схема: путь команды по кругу «политика → привод → рука → датчики».
   Сверху номинальный мир симулятора, снизу настоящая рука: команда ждёт
   40 мс, мотор даёт 85% момента, кружка 0,5 кг. Справа — расстояние до
   цели за 2 с; кривые считает движок урока для простого регулятора.
   ===================================================================== */
(() => {
  const E = L54, TGT = E.TASK.TEST[1], REALW = Object.assign({}, E.NOM, { m: 0.5, d: 40, s: 0.85 });
  /** Простой регулятор: целиться в цель пропорционально ошибке (×3) и притормаживать по скорости захвата (×0,1 с). */
  function run(w) {
    const S = E.armInit(w), ds = [E.distTo(S, TGT)];
    for (let k = 0; k < E.TASK.T; k++) {
      const p = E.fk(S.q), J = E.jac(S.q), vx = J[0][0] * S.dq[0] + J[0][1] * S.dq[1], vy = J[1][0] * S.dq[0] + J[1][1] * S.dq[1];
      E.ctrlStep(S, [E.clamp((3 * (TGT.x - p.x) - 0.1 * vx) / E.ARM.DP, -1, 1), E.clamp((3 * (TGT.y - p.y) - 0.1 * vy) / E.ARM.DP, -1, 1)]);
      ds.push(E.distTo(S, TGT));
    }
    return ds;
  }
  let TR = null;
  const traces = () => { if (!TR) TR = { sim: run(E.NOM), real: run(REALW) }; return TR; };
  const SLOW = 4, TPLAY = 2 * SLOW, TT = TPLAY + 1.2, PER = 0.05 * SLOW;    // 2 с попытки идут 8 с; команда — каждые 0,2 с схемы
  function lane(c, k, P, A, G, y, real, u) {
    const { lab, rect, circle, line, arrow } = A, B = G.box, h = G.bh, ink = P.ink2;
    lab(c, k, real ? (G.narrow ? 'Настоящая рука' : 'Настоящая рука Ады') : (G.narrow ? 'Симулятор' : 'Симулятор: номинальный мир'), G.titleX, y - h / 2 - 14, { px: 12, weight: 750, color: real ? P.bad : P.ink, align: 'left', haloColor: P.surf });
    const box = (b, t1, t2, col) => { rect(c, b[0], y - h / 2, b[1] - b[0], h, 8, A.alpha(col, 0.1), col, 1.5); lab(c, k, t1, (b[0] + b[1]) / 2, y - (t2 ? 7 : 0), { px: G.px, weight: 700, color: col, halo: false }); if (t2) lab(c, k, t2, (b[0] + b[1]) / 2, y + 9, { px: Math.max(10, G.px - 1.5), color: P.ink3, halo: false }); };
    box(B.pol, 'политика', G.narrow ? '20 Гц' : '20 раз в с', P.mot);
    if (real) box(B.q, 'очередь', '40 мс', P.bad);
    box(B.act, 'привод', real ? 'момент 85%' : 'момент 100%', real ? P.bad : P.ink2);
    box(B.arm, 'рука', real ? 'кружка 0,5 кг' : 'чашка 0,25 кг', real ? P.bad : P.ink2);
    // стрелки команд и обратный путь датчиков
    if (real) { arrow(c, B.pol[1] + 2, y, B.q[0] - 2, y, P.ink3, 1.4, 6); arrow(c, B.q[1] + 2, y, B.act[0] - 2, y, P.ink3, 1.4, 6); }
    else arrow(c, B.pol[1] + 2, y, B.act[0] - 2, y, P.ink3, 1.4, 6);
    arrow(c, B.act[1] + 2, y, B.arm[0] - 2, y, P.ink3, 1.4, 6);
    const yb = y + h / 2 + G.ret, xa = (B.arm[0] + B.arm[1]) / 2, xp = (B.pol[0] + B.pol[1]) / 2;
    line(c, [[xa, y + h / 2], [xa, yb], [xp, yb]], A.alpha(P.out, 0.6), 1.4, [4, 3]); arrow(c, xp, yb, xp, y + h / 2 + 2, A.alpha(P.out, 0.8), 1.4, 6);
    lab(c, k, G.narrow ? 'датчики' : 'датчики: углы и скорости суставов', (xa + xp) / 2, yb + 10, { px: Math.max(10, G.px - 1.5), color: P.out, haloColor: P.surf });
    // команды: оранжевые кружки; в очереди ждут 40 мс (0,16 с схемы)
    const tr = Math.min(u, TPLAY);
    for (let n = Math.max(0, Math.floor(tr / PER) - 3); n <= Math.floor(tr / PER); n++) {
      const age = tr - n * PER; let x = null;
      if (!real) { if (age < 0.12) x = B.pol[1] + (B.act[0] - B.pol[1]) * age / 0.12; }
      else if (age < 0.06) x = B.pol[1] + (B.q[0] + 8 - B.pol[1]) * age / 0.06;
      else if (age < 0.22) x = B.q[0] + 8 + (B.q[1] - B.q[0] - 16) * (age - 0.06) / 0.16;
      else if (age < 0.28) x = B.q[1] - 8 + (B.act[0] - B.q[1] + 8) * (age - 0.22) / 0.06;
      if (x != null) circle(c, x, y - (real && age >= 0.06 && age < 0.22 ? h / 2 : 0), 4.2, P.mot, P.surf, 1);   // в очереди — по верхнему краю блока, не на подписи «40 мс»
      const sAge = age - 0.05; if (sAge > 0 && sAge < 0.15) { const f = sAge / 0.15, L1 = yb - (y + h / 2), L2 = xa - xp, s = f * (L1 + L2 + (yb - y - h / 2)); let px, py; if (s < L1) { px = xa; py = y + h / 2 + s; } else if (s < L1 + L2) { px = xa - (s - L1); py = yb; } else { px = xp; py = yb - (s - L1 - L2); } circle(c, px, py, 3.6, P.out, P.surf, 1); }
    }
  }
  function plot(c, k, P, A, G, u) {
    const T = traces(), { lab, line } = A, R = G.plot, x0 = R[0], y0 = R[1], w = R[2], hh = R[3], ymax = 0.6;
    const X = (t) => x0 + w * t / 2, Y = (d) => y0 + hh * (1 - Math.min(d, ymax) / ymax);
    c.strokeStyle = P.grid; c.lineWidth = 1; for (const v of [0, 0.2, 0.4, 0.6]) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x0 + w, Y(v)); c.stroke(); lab(c, k, fmt(v * 100, 0), x0 - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    for (const t of [0, 1, 2]) lab(c, k, fmt(t, 0), X(t), y0 + hh + 12, { px: 10, color: P.ink3, halo: false });
    lab(c, k, 'время, с', x0 + w / 2, y0 + hh + 26, { px: 10.5, color: P.ink3, halo: false });
    lab(c, k, 'до цели, см', x0, y0 - 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    line(c, [[x0, Y(0.03)], [x0 + w, Y(0.03)]], A.alpha(P.good, 0.8), 1.2, [3, 3]);
    lab(c, k, 'зона 3 см', x0 + w - 2, Y(0.03) - 8, { px: 10, color: P.good, align: 'right', haloColor: P.surf });
    const tr = Math.min(u, TPLAY) / SLOW, n = Math.min(40, Math.floor(tr / 0.05));
    for (const [arr, col] of [[T.sim, P.ink2], [T.real, P.bad]]) { const pts = []; for (let i = 0; i <= n; i++) pts.push([X(i * 0.05), Y(arr[i])]); if (pts.length > 1) line(c, pts, col, 2.2); }
    [['симулятор', P.ink2], ['настоящая рука', P.bad]].forEach(([txt, col], i) => { const ly = Y(0.55) + i * 16, lx = X(G.narrow ? 1.05 : 1.15); line(c, [[lx, ly], [lx + 18, ly]], col, 2.4); lab(c, k, txt, lx + 24, ly, { px: 10.5, weight: 700, color: col, align: 'left', haloColor: P.surf }); });
    lab(c, k, `t = ${fmt(tr, 2)} с`, x0 + w, y0 - 12, { px: 10.5, weight: 650, color: P.ink2, align: 'right', halo: false });
  }
  function draw(c, k, t, P, A, G) { const u = ((t % TT) + TT) % TT; lane(c, k, P, A, G, G.y[0], false, u); lane(c, k, P, A, G, G.y[1], true, u); plot(c, k, P, A, G, u); }
  const WIDE = { titleX: 20, y: [74, 224], bh: 40, px: 11.5, ret: 26, box: { pol: [20, 100], q: [118, 196], act: [214, 300], arm: [318, 410] }, plot: [470, 54, 236, 220] };
  const NARROW = { narrow: true, titleX: 8, y: [52, 178], bh: 38, px: 10.5, ret: 22, box: { pol: [8, 72], q: [86, 146], act: [160, 236], arm: [250, 352] }, plot: [44, 300, 300, 104] };
  Anim.add('gaploop', {
    W: 720, H: 330, start: 6.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 450, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   0б. Схема: цикл автоматической рандомизации (ADR). Слева — обычное
   обучение по кругу: мир из диапазонов → попытка → шаг PPO. Справа —
   пограничная проверка: параметр на краю диапазона, пять попыток,
   доля удач против порогов — край наружу или обратно. Числа условные.
   ===================================================================== */
(() => {
  const TT = 12, LOOP = 1.2;
  const BARS = [['масса чашки', 0.15, 0.35], ['трение', 0.05, 0.3], ['задержка', 0, 0.3], ['моторы', 0.48, 0.8]];
  const CHECKS = [{ t0: 2.5, row: 2, side: 1, res: [1, 1, 1, 1, 1], d: 0.12 }, { t0: 7, row: 3, side: 0, res: [1, 0, 0, 1, 0], d: 0.07 }];
  const phase = (u) => { for (const ch of CHECKS) if (u >= ch.t0 && u < ch.t0 + 3) return ch; return null; };
  function bars(u) {
    const b = BARS.map((x) => [x[1], x[2]]);
    for (const ch of CHECKS) { const s = A_ease((u - ch.t0 - 2.6) / 0.35); if (u >= ch.t0 + 2.6) { if (ch.side === 1) b[ch.row][1] += ch.d * s; else b[ch.row][0] += ch.d * s; } }
    return b;
  }
  const A_ease = (x) => { x = Math.max(0, Math.min(1, x)); return (1 - Math.cos(Math.PI * x)) / 2; };
  function draw(c, k, t, P, A, G) {
    const u = ((t % TT) + TT) % TT, { lab, rect, circle, arrow } = A, ch = phase(u), b = bars(u);
    // ---- цикл обучения ----
    const box = (key, t1, t2, on) => { const [x, y, w, h] = G.box[key]; rect(c, x - w / 2, y - h / 2, w, h, 9, A.alpha(on ? P.mot : P.ink3, on ? 0.16 : 0.06), on ? P.mot : P.line, on ? 2 : 1.3); lab(c, k, t1, x, y - (t2 ? 7 : 0), { px: G.px, weight: 700, color: on ? P.ink : P.ink2, halo: false }); if (t2) lab(c, k, t2, x, y + 9, { px: Math.max(10, G.px - 1.5), color: P.ink3, halo: false }); };
    const run = !ch, v = run ? (u % LOOP) / LOOP : 0, seg = Math.floor(v * 3);
    box('w', 'мир из диапазонов', 'масса, трение, задержка, моторы', run && seg === 0);
    box('e', 'попытка 2 с', run ? 'политика собирает опыт' : 'один параметр на краю', (run && seg === 1) || !run);
    box('p', 'шаг PPO', 'политика обновляется', run && seg === 2);
    const ctr = (key) => [G.box[key][0], G.box[key][1]], pts = [ctr('w'), ctr('e'), ctr('p')];
    for (let i = 0; i < 3; i++) { const a = pts[i], z = pts[(i + 1) % 3], dx = z[0] - a[0], dy = z[1] - a[1], L = Math.hypot(dx, dy), sh = G.sh; arrow(c, a[0] + dx * sh / L, a[1] + dy * sh / L, z[0] - dx * sh / L, z[1] - dy * sh / L, P.ink3, 1.4, 7); }
    if (run) { const f = v * 3 - seg, a = pts[seg], z = pts[(seg + 1) % 3]; circle(c, a[0] + (z[0] - a[0]) * f, a[1] + (z[1] - a[1]) * f, 5, P.mot, P.surf, 1.2); }
    // на телефоне подпись проверки — в две строки, иначе шире канваса
    (run ? ['обычное обучение'] : G.two ? ['проверка границы:', 'эти попытки тоже идут в обучение'] : ['проверка границы: эти попытки тоже идут в обучение'])
      .forEach((tx, i, arr) => lab(c, k, tx, G.cap[0], G.cap[1] + (i - (arr.length - 1) / 2) * 15, { px: 11, weight: 650, color: run ? P.ink2 : P.mot, haloColor: P.surf }));
    // ---- диапазоны и пограничная проверка ----
    lab(c, k, 'диапазоны параметров', G.bx0, G.by0 - 26, { px: 12, weight: 750, color: P.ink, align: 'left', haloColor: P.surf });
    BARS.forEach((r, i) => {
      const y = G.by0 + i * G.bdy, x0 = G.bx0 + G.lw, w = G.bw, [lo, hi] = b[i];
      lab(c, k, r[0], G.bx0, y, { px: 11, color: P.ink2, align: 'left', halo: false });
      c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w, y); c.stroke();
      rect(c, x0 + w * lo, y - 6, Math.max(3, w * (hi - lo)), 12, 4, A.alpha(P.out, 0.75), null);
      if (ch && ch.row === i) { const bx = x0 + w * (ch.side ? hi : lo); c.strokeStyle = P.mot; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, y - 11); c.lineTo(bx, y + 11); c.stroke(); }
    });
    if (ch) {
      const y = G.by0 + 4 * G.bdy - 4, n = Math.min(5, Math.floor((u - ch.t0) / 0.45)), ok = ch.res.slice(0, n).reduce((s, x) => s + x, 0);
      lab(c, k, `${BARS[ch.row][0]}: ${ch.side ? 'верхний' : 'нижний'} край, 5 попыток`, G.bx0, y, { px: 11, weight: 650, color: P.mot, align: 'left', haloColor: P.surf });
      for (let j = 0; j < 5; j++) { const x = G.bx0 + 8 + j * 22, yy = y + 22; if (j < n) { circle(c, x, yy, 8, A.alpha(ch.res[j] ? P.good : P.bad, 0.18), ch.res[j] ? P.good : P.bad, 1.5); lab(c, k, ch.res[j] ? '✓' : '✗', x, yy + 0.5, { px: 11, weight: 800, color: ch.res[j] ? P.good : P.bad, halo: false }); } else circle(c, x, yy, 8, null, P.line, 1.2); }
      if (u >= ch.t0 + 2.3) lab(c, k, ok >= 4 ? `${ok} из 5 ≥ 80%: край наружу` : `${ok} из 5 ≤ 40%: край обратно`, G.bx0 + 124, y + 22, { px: 11, weight: 700, color: ok >= 4 ? P.good : P.bad, align: 'left', haloColor: P.surf });
    }
  }
  const WIDE = { px: 11.5, sh: 30, box: { w: [175, 56, 170, 44], e: [285, 186, 150, 44], p: [70, 186, 120, 44] }, cap: [175, 262], bx0: 400, by0: 70, bdy: 40, lw: 92, bw: 210 };
  const NARROW = { two: true, px: 10.5, sh: 28, box: { w: [180, 40, 170, 42], e: [272, 150, 150, 42], p: [78, 150, 130, 42] }, cap: [180, 200], bx0: 16, by0: 252, bdy: 30, lw: 92, bw: 240 };
  Anim.add('adrloop', {
    W: 720, H: 320, start: 4.6, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 430, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   Рисование: вид сбоку на Аду и её руку с чашкой. Логический канвас
   360 × 360, 260 пикселей на метр, плечо Ады в точке (100, 150).
   ===================================================================== */
const View = (() => {
  const W = 360, H = 360, SC = 260, OX = 100, OY = 150;
  const X = (x) => OX + x * SC, Y = (y) => OY - y * SC;
  const colors = () => { const d = HeroKit.dark(); return { adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', cupFill: d ? '#d9d6cc' : '#ffffff', cupLine: d ? '#b0afa6' : '#3d3c38' }; };
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
  /** Рука: два звена, суставы, захват и чашка; размер чашки растёт с массой. */
  function arm(c, q, P, K, col, m) {
    const f = L54.fk(q), b = [X(0), Y(0)], e = [X(f.x1), Y(f.y1)], w = [X(f.x), Y(f.y)];
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [lw, cc] of [[11, col], [6.5, P.surf]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.stroke(); }
    const cw = 9 + 9 * Math.min(1, (m == null ? 0.25 : m) / 1), ch = cw * 1.15;           // чашка висит в захвате
    c.lineWidth = 1.8; c.strokeStyle = K.cupLine; c.fillStyle = K.cupFill;
    rr(c, w[0] - cw / 2, w[1] + 2, cw, ch, [2, 2, 5, 5]); c.fill(); c.stroke();
    c.beginPath(); c.arc(w[0] + cw / 2 + 1, w[1] + 2 + ch * 0.45, cw * 0.28, -Math.PI / 2, Math.PI / 2); c.stroke();
    for (const p of [b, e]) { c.beginPath(); c.arc(p[0], p[1], 4.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    c.beginPath(); c.arc(w[0], w[1], 4, 0, 7); c.fillStyle = col; c.fill();
    c.restore(); return { x: w[0], y: w[1] };
  }
  /** Цель: зелёное кольцо, пунктиром — зона 3 см. */
  function target(c, t, P) {
    c.setLineDash([3, 3]); c.lineWidth = 1.5; c.strokeStyle = P.good; c.beginPath(); c.arc(X(t.x), Y(t.y), L54.TASK.HOLD * SC, 0, 7); c.stroke(); c.setLineDash([]);
    c.lineWidth = 4.5; c.strokeStyle = P.surf; c.beginPath(); c.arc(X(t.x), Y(t.y), 5.5, 0, 7); c.stroke();
    c.lineWidth = 2.6; c.strokeStyle = P.good; c.beginPath(); c.arc(X(t.x), Y(t.y), 5.5, 0, 7); c.stroke();
  }
  /** Путь захвата: линия и точки через каждые 0,05 с. */
  function path(c, qs, col) {
    if (!qs || qs.length < 2) return; const pts = qs.map((q) => L54.fk(q));
    c.save(); c.strokeStyle = col; c.lineWidth = 1.6; c.globalAlpha = 0.9; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke();
    c.fillStyle = col; for (const p of pts) { c.beginPath(); c.arc(X(p.x), Y(p.y), 1.9, 0, 7); c.fill(); } c.restore();
  }
  /** Сцена: попытка ep (кадры q) или исходная поза; подпись сверху. */
  function scene(cv, ep, o) {
    o = o || {}; const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors(), col = o.color || P.e2e, sh = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = P.grid; c.fillRect(0, Y(-0.645), W, H - Y(-0.645));
    ada(c, K, P); const t = o.target || L54.TASK.TEST[o.ti || 0];
    if (!ep) { arm(c, L54.ARM.Q0, P, K, col, o.m); target(c, t, P); if (o.empty) HeroKit.label(c, k, sh && o.emptyShort ? o.emptyShort : o.empty, W / 2 + 30, 336, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.grid }); return; }
    const qs = ep.frames.map((f) => f.q); arm(c, qs[qs.length - 1], P, K, col, ep.w.m); path(c, qs, col); target(c, t, P);
    const lh = 15 * Math.max(1, k), y1 = 6 + 9 * Math.max(1, k), title = sh && o.titleShort ? o.titleShort : o.title;
    if (title) HeroKit.label(c, k, title, 8, y1, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    const d = ep.final * 100, okTxt = ep.ok ? (sh ? `удержала, ${fmt(d, 1)} см` : `удержала, в конце ${fmt(d, 1)} см`) : (sh ? `${fmt(d, 1)} см от цели` : `в конце ${fmt(d, 1)} см от цели`);
    HeroKit.label(c, k, okTxt, 8, title ? y1 + lh : y1, { px: 11.5, weight: 650, color: ep.ok ? P.good : P.bad, align: 'left', haloColor: P.bg });
  }
  return { W, H, SC, X, Y, scene };
})();

/* =====================================================================
   Карта миров: клетки по двум параметрам, цвет — доля удачных попыток.
   o: { key, cells: { 'i,j': { rate } }, sel: [i, j], rect: { x: [a, b], y: [a, b] }, real: bool, empty }
   ===================================================================== */
const MapView = (() => {
  const AX = {
    dm: { xl: 'задержка команды, мс', xs: 'задержка, мс', yl: 'масса чашки, кг', ys: 'чашка, кг', xf: (v) => fmt(v, 0), yf: (v) => fmt(v, 2) },
    sf: { xl: 'сила моторов, % от номинала', xs: 'моторы, %', yl: 'трение в суставах, Н·м', ys: 'трение, Н·м', xf: (v) => fmt(v * 100, 0), yf: (v) => fmt(v, 1) },
  };
  function geom(cv) { const narrow = narrowOf(cv, 460), W = narrow ? 380 : 560, H = narrow ? 300 : 330; return { narrow, W, H, L: narrow ? 56 : 58, R: 10, T: 12, B: narrow ? 40 : 42 }; }
  function draw(cv, o) {
    const G = geom(cv), M = L54.MAPS[o.key], ax = AX[o.key];
    if (cv.style.aspectRatio !== `${G.W} / ${G.H}`) cv.style.aspectRatio = `${G.W} / ${G.H}`;
    const { c, k } = HeroKit.fit(cv, G.W, G.H), P = pal(), nx = M.xs.length, ny = M.ys.length, gw = G.W - G.L - G.R, gh = G.H - G.T - G.B, cw = gw / nx, chh = gh / ny;
    c.fillStyle = P.surf; c.fillRect(0, 0, G.W, G.H);
    const cx = (i) => G.L + cw * (i + 0.5), cy = (j) => G.T + gh - chh * (j + 0.5);
    const vx = (v) => G.L + cw * (0.5 + (v - M.xs[0]) / (M.xs[1] - M.xs[0])), vy = (v) => G.T + gh - chh * (0.5 + (v - M.ys[0]) / (M.ys[1] - M.ys[0]));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = G.L + i * cw, y = G.T + gh - (j + 1) * chh, r = o.cells && o.cells[i + ',' + j];
      c.fillStyle = r ? rateCol(r.rate, P) : P.bg; c.fillRect(x + 1, y + 1, cw - 2, chh - 2);
      if (r && cw > 30) HeroKit.label(c, k, String(pct(r.rate)), x + cw / 2, y + chh / 2, { px: G.narrow ? 9.5 : 11, weight: 700, color: r.rate > 0.35 && r.rate < 0.75 ? '#2b2a26' : '#ffffff', halo: false });
    }
    for (let i = 0; i < nx; i++) HeroKit.label(c, k, ax.xf(M.xs[i]), cx(i), G.T + gh + 11, { px: 10, color: P.ink3, halo: false });
    for (let j = 0; j < ny; j++) HeroKit.label(c, k, ax.yf(M.ys[j]), G.L - 6, cy(j), { px: 10, color: P.ink3, align: 'right', halo: false });
    HeroKit.label(c, k, G.narrow ? ax.xs : ax.xl, G.L + gw / 2, G.H - 9, { px: 11, color: P.ink3, halo: false });
    c.save(); c.translate(G.narrow ? 9 : 11, G.T + gh / 2); c.rotate(-Math.PI / 2); HeroKit.label(c, k, G.narrow ? ax.ys : ax.yl, 0, 0, { px: 11, color: P.ink3, halo: false }); c.restore();
    if (o.rect) {                                                       // область обучения: клетки, чьи центры внутри диапазонов
      const inside = (vals, r) => { const ids = vals.map((v, n) => (v >= Math.min(r[0], r[1]) - 1e-9 && v <= Math.max(r[0], r[1]) + 1e-9 ? n : -1)).filter((n) => n >= 0); return ids.length ? [Math.min(...ids), Math.max(...ids)] : null; };
      const I = inside(M.xs, o.rect.x), Jr = inside(M.ys, o.rect.y);
      if (I && Jr) { const x0 = G.L + I[0] * cw, x1 = G.L + (I[1] + 1) * cw, y0 = G.T + gh - (Jr[1] + 1) * chh, y1 = G.T + gh - Jr[0] * chh; c.setLineDash([6, 4]); c.strokeStyle = P.e2e; c.lineWidth = 2.6; c.strokeRect(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3); c.setLineDash([]); }
    }
    const nom = L54.NOM; c.strokeStyle = P.ink; c.lineWidth = 2.4; c.beginPath(); c.arc(vx(nom[M.x]), vy(nom[M.y]), Math.min(cw, chh) * 0.32, 0, 7); c.stroke();
    if (o.real) L54.REAL.forEach((w, n) => { const x = vx(w[M.x]), y = vy(w[M.y]); c.beginPath(); c.arc(x, y, 7.5, 0, 7); c.fillStyle = P.cl; c.fill(); c.lineWidth = 1.5; c.strokeStyle = P.surf; c.stroke(); HeroKit.label(c, k, String(n + 1), x, y + 0.5, { px: 10, weight: 800, color: '#ffffff', halo: false }); });
    if (o.sel) { const x = G.L + o.sel[0] * cw, y = G.T + gh - (o.sel[1] + 1) * chh; c.strokeStyle = P.ink; c.lineWidth = 2.6; c.strokeRect(x + 1, y + 1, cw - 2, chh - 2); }
    if (o.empty) HeroKit.label(c, k, o.empty, G.L + gw / 2, G.T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
    return G;
  }
  /** Клетка под точкой нажатия (или null). */
  function hit(cv, e, key) {
    const G = geom(cv), M = L54.MAPS[key], r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * G.W, y = (e.clientY - r.top) / r.height * G.H;
    const gw = G.W - G.L - G.R, gh = G.H - G.T - G.B, i = Math.floor((x - G.L) / (gw / M.xs.length)), j = Math.floor((G.T + gh - y) / (gh / M.ys.length));
    return i >= 0 && i < M.xs.length && j >= 0 && j < M.ys.length ? [i, j] : null;
  }
  return { draw, hit };
})();

/** График линий: series [{ pts: [[x, y]], color, dash, label, w }]. */
function lineChart(cv, o) {
  const narrow = narrowOf(cv, 460), W = narrow ? 380 : 640, H = narrow ? 250 : 260;
  if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
  const { c, k } = HeroKit.fit(cv, W, H), P = pal(), L = narrow ? 44 : 52, R = narrow ? 14 : 20, T = 26, B = 40, gw = W - L - R, gh = H - T - B;
  c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
  const x0 = o.xMin || 0, X = (v) => L + gw * (v - x0) / (o.xMax - x0), Y = (v) => T + gh * (1 - (v - (o.yMin || 0)) / ((o.yMax || 100) - (o.yMin || 0)));
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const v of o.yTicks || [0, 25, 50, 75, 100]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); HeroKit.label(c, k, `${fmt(v, o.yDig || 0)}${o.yUnit == null ? '%' : o.yUnit}`, L - 7, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
  for (const v of o.xTicks) { const last = X(v) > W - 24; HeroKit.label(c, k, o.xFmt ? o.xFmt(v) : fmtInt(v), last ? X(v) + 4 : X(v), T + gh + 13, { px: 10.5, color: P.ink3, align: last ? 'right' : 'center', halo: false }); }
  HeroKit.label(c, k, narrow && o.xShort ? o.xShort : o.xLabel, L + gw / 2, H - 9, { px: 11, color: P.ink3, halo: false });
  HeroKit.label(c, k, narrow && o.yShort ? o.yShort : o.yLabel, L, 11, { px: 11, color: P.ink3, align: 'left', halo: false });
  if (o.cursor != null) { c.setLineDash([3, 4]); c.strokeStyle = P.ink2; c.beginPath(); c.moveTo(X(o.cursor), T); c.lineTo(X(o.cursor), T + gh); c.stroke(); c.setLineDash([]); }
  if (o.hline != null) { c.setLineDash([2, 4]); c.strokeStyle = P.good; c.lineWidth = 1.2; c.beginPath(); c.moveTo(L, Y(o.hline)); c.lineTo(L + gw, Y(o.hline)); c.stroke(); c.setLineDash([]); if (o.hlabel) HeroKit.label(c, k, o.hlabel, L + 6, Y(o.hline) - 8, { px: 10, color: P.good, align: 'left', haloColor: P.surf }); }
  const tags = [];
  for (const s of o.series || []) {
    if (!s.pts.length) continue;
    c.strokeStyle = s.color; c.lineWidth = s.w || 2.4; c.setLineDash(s.dash || []); c.lineJoin = 'round';
    c.beginPath(); s.pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke(); c.setLineDash([]);
    const [lx, ly] = s.pts[s.pts.length - 1]; c.beginPath(); c.arc(X(lx), Y(ly), 3.4, 0, 7); c.fillStyle = s.color; c.fill();
    if (s.label) tags.push({ x: X(lx), y: Y(ly), text: s.label, color: s.color });
  }
  for (const s of o.points || []) {
    c.beginPath(); c.arc(X(s.x), Y(s.y), s.r || 6, 0, 7); c.fillStyle = s.color; c.fill(); c.lineWidth = s.sel ? 2.6 : 1.4; c.strokeStyle = s.sel ? P.ink : P.surf; c.stroke();
    if (s.label) tags.push({ x: X(s.x), y: Y(s.y), text: s.label, color: s.sel ? P.ink : P.ink2, pt: true });
  }
  for (const t of tags) t.ty = t.pt ? t.y : (t.y < T + 14 ? t.y + 13 : t.y - 10);
  tags.sort((a, b) => a.ty - b.ty); for (let i = 1; i < tags.length; i++) if (Math.abs(tags[i].x - tags[i - 1].x) < 30 && tags[i].ty < tags[i - 1].ty + 14) tags[i].ty = tags[i - 1].ty + 14;
  for (const t of tags) { const right = !t.pt && t.x > L + gw * 0.7; HeroKit.label(c, k, t.text, t.pt ? t.x + 10 : right ? t.x - 7 : t.x + 7, t.ty, { px: 11, weight: 700, color: t.color, align: t.pt || !right ? 'left' : 'right', haloColor: P.surf }); }
  if (o.empty) HeroKit.label(c, k, o.empty, L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf });
  return { X, Y };
}

/* =====================================================================
   1. Интерактив «карта миров»: политика из номинального мира (PPO,
   12 000 шагов) в мирах, которых она не видела.
   ===================================================================== */
const SHOW_T = 1;                                                  // цель проверки на сценах (вторая из 20)
const Probe = (() => {
  const E = L54;
  const st = { key: 'dm', open: { dm: {}, sf: {} }, sel: { dm: null, sf: null }, pol: null, busy: false, prog: 0, ep: null, label: '' };
  let ctl = null;
  async function policy() {
    if (st.pol) return st.pol;
    st.busy = true; st.label = 'Политика учится в номинальном мире'; st.prog = 0; render();
    try { st.pol = await Pol.get('nom', null, (p) => { st.prog = p; render(); }); } finally { st.busy = false; }
    return st.pol;
  }
  function openCell(key, i, j) {
    const c = E.cell(st.pol.act, key, i, j); st.open[key][i + ',' + j] = c; st.sel[key] = [i, j];
    st.ep = E.episode(st.pol.act, E.cellWorld(key, i, j), E.TASK.TEST[SHOW_T], true); return c;
  }
  async function click(i, j) { await policy(); openCell(st.key, i, j); render(); if (ctl) ctl.update(); }
  async function openAll() {
    await policy(); const M = E.MAPS[st.key]; st.busy = true; st.label = 'Ада пробует все миры карты'; st.prog = 0;
    try {
      const jobs = []; for (let j = 0; j < M.ys.length; j++) for (let i = 0; i < M.xs.length; i++) if (!st.open[st.key][i + ',' + j]) jobs.push([i, j]);
      const sel = st.sel[st.key];
      await runChunked((function* () { let n = 0; for (const [i, j] of jobs) { st.open[st.key][i + ',' + j] = E.cell(st.pol.act, st.key, i, j); n++; yield { step: n, of: jobs.length }; } })(), (e) => { st.prog = e.step / e.of; render(); }, 14);
      if (sel) openCell(st.key, sel[0], sel[1]);
    } finally { st.busy = false; render(); if (ctl) ctl.update(); }
  }
  function render() {
    const M = E.MAPS[st.key], sel = st.sel[st.key];
    MapView.draw($('#pMap'), { key: st.key, cells: st.open[st.key], sel, empty: Object.keys(st.open[st.key]).length || st.busy ? null : 'нажми на клетку, чтобы Ада попробовала этот мир' });
    const w = sel ? E.cellWorld(st.key, sel[0], sel[1]) : E.NOM;
    View.scene($('#pCv'), sel && st.ep ? st.ep : null, { ti: SHOW_T, m: w.m, title: sel ? (st.key === 'dm' ? `задержка ${M.xs[sel[0]]} мс, чашка ${fmt(M.ys[sel[1]], 2)} кг` : `моторы ${fmt(M.xs[sel[0]] * 100, 0)}%, трение ${fmt(M.ys[sel[1]], 1)} Н·м`) : null, titleShort: sel ? (st.key === 'dm' ? `${M.xs[sel[0]]} мс, ${fmt(M.ys[sel[1]], 2)} кг` : `${fmt(M.xs[sel[0]] * 100, 0)}%, ${fmt(M.ys[sel[1]], 1)} Н·м`) : null, empty: st.busy ? 'политика учится…' : 'выбери мир на карте', emptyShort: st.busy ? 'учится…' : 'выбери мир' });
    const pg = $('#pProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    $$('#wrapPAxes button').forEach((b) => { b.disabled = st.busy; });
    if (st.busy) { setOut($('#pOut'), `${st.label}: <b>${pct(st.prog)}%</b>`); return; }
    const c = sel && st.open[st.key][sel[0] + ',' + sel[1]];
    const nOpen = Object.keys(st.open[st.key]).length;
    if (!c) { setOut($('#pOut'), nOpen ? `На этой карте открыто миров: ${nOpen}. Нажми на клетку, чтобы увидеть попытку Ады в этом мире.` : 'Политика ещё не пробовала другие миры. В номинальном мире — чашка 0,25 кг, трение 0,1 Н·м, без задержки, моторы 100% — она удерживает чашку во всех 20 попытках.'); return; }
    setOut($('#pOut'), `Мир: ${worldText(w)}. Удачных попыток: <b>${of20(c.rate)} из 20</b>${c.arrive ? `, в удачных Ада приходит к цели за ${sec(c.arrive)} с` : ''}. На сцене — попытка к одной из 20 целей.`);
  }
  const rateAt = (key, i, j) => { const c = st.open[key][i + ',' + j]; return c ? c.rate : null; };
  function state() { return { key: st.key, open: st.open, busy: st.busy }; }
  /** Граница по задержке в строке номинальной чашки: открытая клетка с успехом ≥ 80% и справа от неё < 50%. */
  function edge() {
    for (let i = 0; i < 8; i++) { const a = rateAt('dm', i, 1), b = rateAt('dm', i + 1, 1); if (a != null && b != null && a >= 0.8 && b < 0.5) return { i, a, b }; }
    return null;
  }
  const api = {
    reset() { st.open = { dm: {}, sf: {} }; st.sel = { dm: null, sf: null }; st.key = 'dm'; st.ep = null; segSet('#pAxes', 'dm'); render(); },
    state, render, st, click, openAll, edge,
    setKey(k) { if (st.busy) return; st.key = k; segSet('#pAxes', k); const s = st.sel[k]; st.ep = s && st.pol ? E.episode(st.pol.act, E.cellWorld(k, s[0], s[1]), E.TASK.TEST[SHOW_T], true) : null; render(); },
    async both() {
      await policy(); st.key = 'dm'; segSet('#pAxes', 'dm');
      const heavy = openCell('dm', 0, 6), late = openCell('dm', 4, 1); render();
      return { heavy: heavy.rate, late: late.rate, lateEp: st.ep };
    },
  };
  const missions = [
    { short: 'Тяжелее или позже', title: 'Что сильнее собьёт политику',
      text: 'Политика училась с чашкой 0,25 кг и без задержки. Проверим её в двух мирах. В первом в захвате литровая кружка 1 кг — вчетверо тяжелее, задержки нет. Во втором чашка обычная, но команда доходит до привода через 40 мс — меньше одного шага управления.',
      bet: { q: 'где Ада чаще не удержит чашку?', options: ['С кружкой 1 кг: такой массы политика не видела, рука просядет', 'С задержкой 40 мс: команды будут исполняться позже, чем она рассчитывает', 'Нигде: политика видит, где захват, и поправит'], answer: (r) => (r.heavy >= 0.9 && r.late >= 0.9 ? 2 : r.late < r.heavy ? 1 : 0) },
      action: { label: 'Проверить оба мира', run: (X) => X.both() },
      criteria: [{ label: 'Кружку 1 кг Ада удерживает хотя бы в 18 попытках из 20', test: (r) => r.heavy >= 0.9 }, { label: 'С задержкой 40 мс удач меньше, чем с кружкой', test: (r) => r.late < r.heavy }],
      explain: (r) => `Кружка 1 кг без задержки: ${of20(r.heavy)} удачных попыток из 20. Чашка 0,25 кг с задержкой 40 мс: ${of20(r.late)} из 20. Масса — постоянная помеха: рука проседает, политика видит, что захват ниже цели, и целится выше. Задержка нарушает саму обратную связь: политика исправляет ошибку, которой к моменту исполнения команды уже нет. На сцене — попытка с задержкой: захват подходит к цели и топчется вокруг неё, в конце он в ${fmt(r.lateEp.final * 100, 1)} см.` },
    { short: 'Граница', title: 'Где задержка становится опасной',
      text: 'Теперь найди границу. Открой клетки во второй снизу строке — с обычной чашкой 0,25 кг — и найди первую задержку, при которой Ада удерживает чашку реже чем в половине попыток.',
      criteria: [{ label: 'В строке 0,25 кг открыта клетка, где удач не меньше 80%', test: (r, s) => Object.keys(s.open.dm).some((k0) => k0.endsWith(',1') && s.open.dm[k0].rate >= 0.8) }, { label: 'Справа от такой клетки, на 10 мс дальше, открыта клетка, где удач меньше 50%', test: () => !!edge() }],
      hint: 'Начни с 20 мс и иди по строке вправо: 30, 40, 50 мс.',
      explain: () => { const e = edge(), M = E.MAPS.dm; return `Граница — между ${M.xs[e.i]} и ${M.xs[e.i + 1]} мс: ${of20(e.a)} и ${of20(e.b)} удачных попыток из 20. Задержка в 10 мс — пятая часть шага управления, а успех на границе меняется в разы. У настоящих рук Ады задержки 25–45 мс, и граница проходит прямо среди них.`; } },
    { short: 'Свободно', title: 'Свободный режим: сила моторов и трение', final: true, controls: ['axes'],
      text: 'Переключи карту на «сила моторов × трение» и открой её целиком. Найди, какой из двух параметров решает, удержит ли Ада чашку, а какой почти ни на что не влияет. Подумай, поможет ли здесь любая политика.' },
  ];
  function init() {
    $('#pMap').addEventListener('click', (e) => { if (st.busy) return; const c = MapView.hit(e.currentTarget, e, st.key); if (c) click(c[0], c[1]); });
    segBind('#pAxes', (v) => api.setKey(v));
    $('#pAll').addEventListener('click', () => { if (!st.busy) openAll(); });
    ctl = mountMissions('#pMis', missions, api, { controls: { axes: '#wrapPAxes' }, scene: '#pMap' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория 1: одна задача, один бюджет — без рандомизации и с ней,
   проверка на шести «настоящих» руках.
   ===================================================================== */
const Compare = (() => {
  const E = L54;
  const st = { seed: E.LAB.SEED, res: {}, arm: 0, world: 'real', shown: false, busy: false, prog: 0, label: '' };
  let ctl = null;
  const COL = () => ({ nom: HeroKit.css('--hybrid'), rnd: HeroKit.css('--e2e') });
  /** Обе политики для зерна: результат обучения + разбор по рукам. */
  async function train(seed) {
    if (st.res[seed]) return st.res[seed];
    const part = (a, b) => (p) => { st.prog = a + (b - a) * p; render(); };
    const nom = await Pol.get('nom', { seed }, part(0, 0.5)), rnd = await Pol.get(1, { seed }, part(0.5, 1));
    const sum = (res) => { const ev = E.evaluate(res.act, E.REAL), nm = E.evaluate(res.act, [E.NOM]); return { act: res.act, rate: ev.rate, per: ev.per, arrive: ev.arrive, nomRate: nm.rate, nomArrive: nm.arrive }; };
    st.res[seed] = { nom: sum(nom), rnd: sum(rnd) }; return st.res[seed];
  }
  const worldOf = () => (st.world === 'nom' ? E.NOM : E.REAL[st.arm]);
  function pane(kind) {
    const cv = $(kind === 'nom' ? '#cCvN' : '#cCvR'), R = st.res[st.seed], col = COL()[kind], el = $(kind === 'nom' ? '#cStatN' : '#cStatR');
    if (!R || !st.shown) { View.scene(cv, null, { ti: SHOW_T, color: col, m: worldOf().m, empty: st.busy ? 'учится…' : 'ещё не обучена: нажми кнопку миссии', emptyShort: st.busy ? 'учится…' : 'не обучена' }); setOut(el, st.busy ? 'Учится в браузере…' : 'Ещё не обучена'); el.className = 'pane-stat'; return; }
    const p = R[kind], w = worldOf(), ep = E.episode(p.act, w, E.TASK.TEST[SHOW_T], true);
    View.scene(cv, ep, { ti: SHOW_T, color: col, title: st.world === 'nom' ? 'номинальный мир' : `${w.name}: ${w.note}`, titleShort: st.world === 'nom' ? 'номинал' : w.name });
    if (st.world === 'nom') { setOut(el, `<b>В номинальном мире: ${of20(p.nomRate)} из 20</b> · до цели ${sec(p.nomArrive)} с`); el.className = 'pane-stat ' + (p.nomRate >= 0.9 ? 'ok' : 'bad'); }
    else { setOut(el, `<b>Успех на шести руках: ${pct(p.rate)}%</b> · здесь ${of20(p.per[st.arm])} из 20`); el.className = 'pane-stat ' + (p.rate >= 0.9 ? 'ok' : 'bad'); }
  }
  function table() {
    const box = $('#cArms'), R = st.shown ? st.res[st.seed] : null, C = COL(); box.innerHTML = '';
    const bar = (v, col) => h('div', { class: 'arm-bar' + (v == null ? ' empty' : '') }, h('div', { class: 'bt' }, h('i', { style: `width:${v == null ? 0 : (v * 100).toFixed(1)}%;--c:${col}` })), h('span', { class: 'bn' }, v == null ? '—' : `${of20(v)}/20`));
    box.append(h('div', { class: 'arm-row arm-h', role: 'row' }, h('span', { role: 'columnheader' }, 'Рука'), h('span', { role: 'columnheader' }, 'Чашка, трение, задержка, моторы'), h('span', { role: 'columnheader' }, 'Без рандомизации'), h('span', { role: 'columnheader' }, 'С рандомизацией')));
    E.REAL.forEach((w, n) => {
      const row = h('div', { class: 'arm-row' + (st.world === 'real' && st.arm === n ? ' sel' : ''), role: 'row', tabindex: '0', 'data-arm': String(n) },
        h('span', { class: 'an', role: 'cell' }, h('b', null, w.name), h('span', null, w.note)),
        h('span', { class: 'ap', role: 'cell' }, `${fmt(w.m, 2)} кг · ${fmt(w.f, 2)} Н·м · ${w.d} мс · ${fmt(w.s * 100, 0)}%`),
        bar(R ? R.nom.per[n] : null, C.nom), bar(R ? R.rnd.per[n] : null, C.rnd));
      box.append(row);
    });
  }
  function render() {
    pane('nom'); pane('rnd'); table();
    const pg = $('#cProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) setOut($('#cOut'), `${st.label}: <b>${pct(st.prog)}%</b>`);
    else if (st.shown) setOut($('#cOut'), st.world === 'nom' ? 'На сценах — номинальный мир симулятора, тот, в котором училась первая политика.' : `На сценах — ${E.REAL[st.arm].name} (${worldText(E.REAL[st.arm])}) и одна из 20 целей; нажми на строку таблицы, чтобы выбрать другую руку.`);
    else setOut($('#cOut'), 'Обе руки ещё не обучены. У них одинаковые сети — два слоя по 24 нейрона — и одинаковый бюджет: 12 000 шагов.');
    $('#cSeedRun').disabled = st.busy;
  }
  async function busy(label, fn) { st.busy = true; st.label = label; st.prog = 0; render(); try { return await fn(); } finally { st.busy = false; render(); if (ctl) ctl.update(); } }
  const worstArm = (R) => R.nom.per.reduce((b, v, i) => (v < R.nom.per[b] ? i : b), 0);
  function state() { return { arm: st.arm, world: st.world, shown: st.shown, seed: st.seed }; }
  const api = {
    reset() { st.seed = E.LAB.SEED; st.arm = 0; st.world = 'real'; st.shown = false; segSet('#cSeed', st.seed); render(); },
    state, render, st,
    selectArm(n) { st.arm = n; st.world = 'real'; render(); if (ctl) ctl.update(); },
    first() { return busy('Обе руки учатся в браузере', async () => { const R = await train(st.seed); st.shown = true; st.world = 'real'; const n = worstArm(R); return { nom: R.nom.rate, rnd: R.rnd.rate, worst: n, worstNom: R.nom.per[n] }; }); },
    nominal() { return busy('Проверка в номинальном мире', async () => { const R = await train(st.seed); st.shown = true; st.world = 'nom'; return { nomRate: R.nom.nomRate, rndRate: R.rnd.nomRate, nomT: R.nom.nomArrive, rndT: R.rnd.nomArrive }; }); },
    runSeed() { return busy(`Зерно ${st.seed}: обе руки учатся`, async () => { const R = await train(st.seed); st.shown = true; st.world = 'real'; return { nom: R.nom.rate, rnd: R.rnd.rate }; }); },
  };
  const missions = [
    { short: 'Ставка', title: 'Кто удержит чашку на настоящих руках',
      text: 'Обе руки учатся одинаково: 12 000 шагов PPO, одна награда, одни сети. Первая учится только в номинальном мире. Вторая в каждой попытке получает новый мир: чашка 0,1–0,6 кг, трение 0–0,5 Н·м, задержка 0–50 мс, моторы 75–110%. Потом каждая делает по 20 попыток на каждой из шести настоящих рук.',
      bet: { q: 'кто чаще удержит чашку на шести настоящих руках?', options: ['Без рандомизации: её мир точный, и она выучила его лучше', 'Поровну: задача и бюджет одинаковые', 'С рандомизацией'], answer: (r) => (r.rnd > r.nom + 0.1 ? 2 : r.nom > r.rnd + 0.1 ? 0 : 1) },
      action: { label: 'Обучить обе руки', run: (X) => X.first() },
      criteria: [{ label: 'С рандомизацией — не меньше 95% удачных попыток', test: (r) => r.rnd >= 0.95 }, { label: 'Разница — хотя бы 10 пунктов', test: (r) => r.rnd >= r.nom + 0.1 }],
      explain: (r) => `На шести настоящих руках политика без рандомизации удержала чашку в ${pct(r.nom)}% попыток, с рандомизацией — в ${pct(r.rnd)}%. Учились они одинаковое число шагов; разница только в том, какие миры они видели. Таблица под сценами показывает, где первая теряет попытки. В следующей миссии найди руку, на которой разница больше всего.` },
    { short: 'Где разница', title: 'На какой руке разница больше всего',
      text: 'Нажимай на строки таблицы под сценами и сравнивай пути захвата. Выбери руку, на которой политика без рандомизации промахивается чаще всего.',
      criteria: [{ label: 'Выбрана рука, где у политики без рандомизации меньше всего удачных попыток', test: (r, s) => { const R = st.res[s.seed]; return !!R && s.shown && s.world === 'real' && R.nom.per[s.arm] === Math.min(...R.nom.per); } }],
      hint: 'Посмотри на столбец «Без рандомизации» и на задержку в строке.',
      explain: () => { const R = st.res[st.seed], w = E.REAL[st.arm], n = st.arm; return `${w.name} — ${w.note}: задержка ${w.d} мс. Без рандомизации — ${of20(R.nom.per[n])} удачных попыток из 20, с рандомизацией — ${of20(R.rnd.per[n])}. Слева захват приходит к цели и раскачивается вокруг неё, справа подходит плавнее и останавливается. Политика с рандомизацией видела задержки до 50 мс и не рассчитывает, что мотор ответит сразу.`; } },
    { short: 'Номинал', title: 'А в номинальном мире?',
      text: 'Вернёмся в мир, в котором училась первая политика: чашка 0,25 кг, трение 0,1 Н·м, без задержки, моторы 100%. Сравним, сколько в среднем длится дорога до цели в удачных попытках.',
      bet: { q: 'кто в номинальном мире быстрее доносит чашку до цели?', options: ['С рандомизацией: она видела больше миров и действует увереннее', 'Одинаково: в этом мире обе справляются', 'Без рандомизации'], answer: (r) => (r.nomT < r.rndT - 0.05 ? 2 : r.rndT < r.nomT - 0.05 ? 0 : 1) },
      action: { label: 'Проверить в номинальном мире', run: (X) => X.nominal() },
      criteria: [{ label: 'Обе удерживают чашку во всех 20 попытках', test: (r) => r.nomRate >= 1 && r.rndRate >= 1 }, { label: 'Без рандомизации дорога до цели короче', test: (r) => r.nomT < r.rndT }],
      explain: (r) => `В номинальном мире обе удерживают чашку во всех 20 попытках, но без рандомизации дорога до цели в среднем ${sec(r.nomT)} с, с рандомизацией — ${sec(r.rndT)} с. Политика, которая видела задержки до 50 мс, подходит к цели осторожнее и в мире без задержки. Это и есть цена рандомизации, о которой пишут Tan и соавторы: устойчивость покупают пиковым качеством в своём мире. Насколько велика эта цена, зависит от ширины диапазонов — об этом лаборатория 2.` },
    { short: 'Свободно', title: 'Свободный режим: другие зёрна', final: true, controls: ['seed'],
      text: 'Выбери другое зерно случайности и обучи обе руки заново. Найди зерно, на котором политика без рандомизации переносится лучше всего, и проверь, догоняет ли она при этом рандомизированную.' },
  ];
  function init() {
    const sel = (e) => { const row = e.target.closest('.arm-row[data-arm]'); if (row && st.shown && !st.busy) api.selectArm(+row.dataset.arm); };
    $('#cArms').addEventListener('click', sel);
    $('#cArms').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(e); } });
    segBind('#cSeed', (v) => { if (st.busy) return; st.seed = +v; segSet('#cSeed', v); st.shown = !!st.res[st.seed]; render(); });
    $('#cSeedRun').addEventListener('click', () => { if (!st.busy) api.runSeed().then((r) => setOut($('#cOut'), `Зерно ${st.seed}: без рандомизации — ${pct(r.nom)}% удачных попыток на шести руках, с рандомизацией — ${pct(r.rnd)}%.`)); });
    ctl = mountMissions('#cMis', missions, api, { controls: { seed: '#wrapCSeed' }, scene: '#cDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория 2: ширина диапазонов — успех на настоящих руках против
   времени до цели. Каждая ширина — своё обучение (кэш).
   ===================================================================== */
const Width = (() => {
  const E = L54, WS = E.LAB.WIDTHS;
  const st = { i: 2, runs: {}, busy: false, prog: 0, label: '' };
  let ctl = null;
  const kOf = () => WS[st.i];
  async function ensure(k) {
    if (st.runs[k]) return st.runs[k];
    const res = await Pol.get(k === 0 ? 'nom' : k, null, (p) => { st.prog = 0.75 * p; render(); });
    const ev = E.evaluate(res.act, E.REAL), nm = E.evaluate(res.act, [E.NOM]);
    const map = await runChunked(E.mapGen(res.act, 'dm'), (e) => { st.prog = 0.75 + 0.25 * e.done / e.of; render(); }, 14);
    st.runs[k] = { k, rate: ev.rate, arrive: ev.arrive, per: ev.per, nomRate: nm.rate, nomArrive: nm.arrive, map };
    return st.runs[k];
  }
  function rangesText(k) {
    if (!k) return 'Ширина ×0: рандомизации нет, политика учится только в номинальном мире.';
    const R = E.ranges(k), r2 = (a) => `${fmt2(a[0])}–${fmt2(a[1])}`;
    return `Ширина ${fmtW(k)}: чашка ${r2(R.m)} кг · трение ${r2(R.f)} Н·м · задержка ${fmt(R.d[0], 0)}–${fmt(R.d[1], 0)} мс · моторы ${fmt(R.s[0] * 100, 0)}–${fmt(R.s[1] * 100, 0)}%`;
  }
  function render() {
    const k = kOf(), q = st.runs[k], R = E.ranges(k), cells = {};
    if (q) q.map.forEach((row, j) => row.forEach((c, i) => { cells[i + ',' + j] = c; }));
    MapView.draw($('#wMap'), { key: 'dm', cells, rect: { x: R.d, y: R.m }, real: true, empty: q ? null : (st.busy ? 'политика учится…' : 'нажми кнопку миссии: карта заполнится') });
    const P = pal(), pts = WS.filter((w) => st.runs[w] && st.runs[w].arrive).map((w) => ({ x: st.runs[w].arrive * 0.05, y: st.runs[w].rate * 100, color: w === 0 ? P.hy : P.e2e, label: fmtW(w), sel: w === k }));
    const xs = pts.map((p) => p.x), xMin = Math.min(0.6, ...xs.map((x) => Math.floor(x * 10) / 10)), xMax = Math.max(1.1, ...xs.map((x) => Math.ceil(x * 10) / 10)), ticks = []; for (let v = xMin; v <= xMax + 1e-9; v += 0.1) ticks.push(Math.round(v * 10) / 10);
    const yMin = Math.min(50, ...pts.map((p) => Math.floor(p.y / 10) * 10)), yT = []; for (let v = yMin; v <= 100; v += yMin < 50 ? 20 : 10) yT.push(v);
    lineChart($('#wChart'), { xMin, xMax, xTicks: ticks, xFmt: (v) => fmt(v, 1), xLabel: 'время до цели на настоящих руках, с (меньше — быстрее)', xShort: 'время до цели, с', yLabel: 'удачных попыток на шести настоящих руках', yShort: 'удачных попыток', yMin, yMax: 104, yTicks: yT, points: pts, empty: pts.length ? null : 'точки появятся после обучения' });
    const inp = $('#wK'); inp.value = st.i; syncRange(inp, fmtW(k)); inp.disabled = st.busy;
    setOut($('#wRanges'), rangesText(k));
    const pg = $('#wProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) setOut($('#wOut'), `${st.label}: <b>${pct(st.prog)}%</b>`);
    else if (q) setOut($('#wOut'), `Ширина ${fmtW(k)}: на шести настоящих руках удачных попыток <b>${pct(q.rate)}%</b>, дорога до цели в удачных — <b>${sec(q.arrive)} с</b>; в номинальном мире — ${sec(q.nomArrive)} с.`);
    else setOut($('#wOut'), 'Политика этой ширины ещё не обучена.');
  }
  async function train(i, label) { st.i = i; st.busy = true; st.label = label || `Политика ширины ${fmtW(WS[i])} учится в браузере`; st.prog = 0; render(); try { return await ensure(WS[i]); } finally { st.busy = false; render(); if (ctl) ctl.update(); } }
  function state() { return { i: st.i, k: kOf(), busy: st.busy, q: st.runs[kOf()] }; }
  const api = {
    reset() { st.i = 2; render(); },
    state, render, st,
    setI(i) { if (st.busy) return Promise.resolve(); return train(Math.max(0, Math.min(WS.length - 1, i))); },
    async half() { await train(0, 'Политика без рандомизации учится'); const q0 = st.runs[0]; const q = await train(1); return { rate: q.rate, rate0: q0.rate, arrive: q.arrive }; },
    async wide() { const q1 = await train(2, 'Политика ширины ×1 учится'); const q3 = await train(4); return { rate1: q1.rate, rate3: q3.rate, t1: q1.arrive, t3: q3.arrive, n1: q1.nomArrive, n3: q3.nomArrive }; },
  };
  const missions = [
    { short: 'Узко', title: 'Узкие диапазоны: ×½',
      text: 'При ширине ×½ задержка при обучении не больше 25 мс, а чашка не тяжелее 0,43 кг. А у настоящих рук задержки до 45 мс, и у Ады 2 кружка весит 0,5 кг. Обучим политику ×½ и для сравнения — без рандомизации.',
      bet: { q: 'как политика ×½ справится на настоящих руках?', options: ['Как без рандомизации: настоящие задержки почти вдвое больше тех, что она видела', 'Почти везде справится', 'Хуже, чем без рандомизации: она не выучила точно ни один мир'], answer: (r) => (r.rate >= 0.9 ? 1 : r.rate < r.rate0 - 0.05 ? 2 : 0) },
      action: { label: 'Обучить при ×½', run: (X) => X.half() },
      criteria: [{ label: 'Удачных попыток на настоящих руках — не меньше 90%', test: (r) => r.rate >= 0.9 }],
      explain: (r) => `При ×½ — ${pct(r.rate)}% удачных попыток, без рандомизации — ${pct(r.rate0)}%. На карте зелёная область выходит за оранжевую рамку: политика, которая видела хоть какую-то задержку, перестала рассчитывать на мгновенный ответ мотора и подходит к цели плавнее, а это помогает и за пределами диапазона обучения. Но не бесконечно: посмотри на правые столбцы карты.` },
    { short: 'Широко', title: 'Широкие диапазоны: ×3',
      text: 'При ×3 задержка при обучении доходит до 150 мс, чашка — до 1,3 кг, а моторы слабеют до 30% силы. Все настоящие руки наверняка оказываются внутри этих диапазонов. Обучим политику ×3 и для сравнения ×1.',
      bet: { q: 'что будет на настоящих руках по сравнению с ×1?', options: ['Лучше: чем шире диапазоны, тем надёжнее', 'Удачных попыток не больше, а Ада станет медленнее', 'То же самое, только обучение дольше'], answer: (r) => (r.t3 >= r.t1 * 1.1 && r.rate3 <= r.rate1 + 0.005 ? 1 : r.rate3 > r.rate1 + 0.02 ? 0 : 2) },
      action: { label: 'Обучить при ×3', run: (X) => X.wide() },
      criteria: [{ label: 'Удачных попыток не больше, чем при ×1', test: (r) => r.rate3 <= r.rate1 }, { label: 'Дорога до цели хотя бы на 10% дольше, чем при ×1', test: (r) => r.t3 >= r.t1 * 1.1 }],
      explain: (r) => `При ×3 удачных попыток ${pct(r.rate3)}% против ${pct(r.rate1)}% при ×1, а дорога до цели — ${sec(r.t3)} с против ${sec(r.t1)} с, на ${pct(r.t3 / r.t1 - 1)}% дольше. В номинальном мире — ${sec(r.n3)} с против ${sec(r.n1)} с. Среди миров обучения много таких, где быстрый подход кончается раскачкой или где моторов едва хватает удержать кружку, и политика без памяти выбирает осторожность для всех миров сразу. Шире реального разброса рандомизировать незачем: надёжности это не добавило, а скорость отняло.` },
    { short: 'Свободно', title: 'Свободный режим: лучшая ширина', final: true, controls: ['k'],
      text: 'Двигай ползунок: каждая ширина учится заново, это одна-две секунды. Пройди все ширины и найди ту, при которой удачных попыток на настоящих руках не меньше 95%, а дорога до цели самая короткая.' },
  ];
  function init() {
    $('#wK').addEventListener('input', (e) => { if (!st.busy) api.setI(+e.target.value); else e.target.value = st.i; });
    ctl = mountMissions('#wMis', missions, api, { controls: { k: '#wrapWK' }, scene: '#wMap' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   4. Лаборатория 3: ADR на руке Ады. Диапазоны растут, пока на их границе
   Ада справляется; сравнение с фиксированным диапазоном ×3 с первого шага.
   ===================================================================== */
const Adr = (() => {
  const E = L54, BUD = E.LAB.ADR_BUDGET, SHOWN = { m: [0, 1.5], f: [0, 1.5], d: [0, 150], s: [0.3, 1.3] };
  const st = { th: 0.8, runs: {}, fix: null, at: BUD, busy: false, prog: 0, label: '', showFix: false, anim: 0 };
  let ctl = null;
  const thKey = () => String(st.th);
  async function runAdr(th) {
    if (st.runs[th]) return st.runs[th];
    const res = await Pol.get('adr', { adr: { TH: th } }, (p) => { st.prog = p; render(); });
    const ev = E.evaluate(res.act, E.REAL);
    st.runs[th] = { res, curve: res.curve, R: res.adr.R, rate: ev.rate, arrive: ev.arrive, to90: to90(res.curve) };
    return st.runs[th];
  }
  async function runFix() {
    if (st.fix) return st.fix;
    const res = await Pol.get(3, { steps: BUD }, (p) => { st.prog = p; render(); });
    const ev = E.evaluate(res.act, E.REAL);
    st.fix = { res, curve: res.curve, rate: ev.rate, arrive: ev.arrive, to90: to90(res.curve) };
    return st.fix;
  }
  const to90 = (c) => { const p = c.find((q) => q.real.rate >= 0.9 - 1e-9); return p ? p.step : null; };
  const snapAt = (run, at) => { let p = run.curve[0]; for (const q of run.curve) if (q.step <= at) p = q; return p; };
  const unitTxt = (key, v) => (key === 'm' || key === 'f' ? fmt2(v) : key === 'd' ? fmt(v, 0) : fmt(v * 100, 0));
  const UNITS = { m: ' кг', f: ' Н·м', d: ' мс', s: '%' };
  function bars() {
    const box = $('#aRanges'), run = st.runs[thKey()], snap = run ? snapAt(run, st.at) : null, R = snap && snap.R ? snap.R : null, P = pal(), FX = E.ranges(3);
    if (!box.dataset.built) {
      box.innerHTML = ''; box.dataset.built = '1';
      for (const p of E.PARAMS) box.append(h('div', { class: 'rg-row' }, h('div', { class: 'rg-name' }, p.name, h('small', { 'data-rg': p.key }, '')), h('canvas', { class: 'rg-cv', 'data-rgcv': p.key, width: '420', height: '46' })));
    }
    for (const p of E.PARAMS) {
      const cv = box.querySelector(`[data-rgcv="${p.key}"]`), w = Math.max(240, Math.round(cv.getBoundingClientRect().width || 420)), { c, k } = HeroKit.fit(cv, w, 46), [a, b] = SHOWN[p.key], L = 10, Wd = w - 20, X = (v) => L + Wd * (Math.min(b, Math.max(a, v)) - a) / (b - a), y = 20;
      c.fillStyle = P.surf; c.fillRect(0, 0, w, 46);
      c.strokeStyle = P.line; c.lineWidth = 1.2; c.beginPath(); c.moveTo(L, y); c.lineTo(L + Wd, y); c.stroke();
      if (st.showFix) { c.setLineDash([4, 3]); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.strokeRect(X(FX[p.key][0]), y - 9, Math.max(2, X(FX[p.key][1]) - X(FX[p.key][0])), 18); c.setLineDash([]); }
      if (R) { const x0 = X(R[p.key][0]), x1 = X(R[p.key][1]); c.fillStyle = P.e2e; c.beginPath(); c.roundRect(x0 - 2, y - 6, Math.max(4, x1 - x0 + 4), 12, 4); c.fill(); }
      for (const r of E.REAL) { const x = X(r[p.key]); c.strokeStyle = P.cl; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x, y + 15); c.stroke(); }
      const xn = X(E.NOM[p.key]); c.strokeStyle = P.ink; c.lineWidth = 2.4; c.beginPath(); c.moveTo(xn, y - 12); c.lineTo(xn, y + 12); c.stroke();
      HeroKit.label(c, k, unitTxt(p.key, a), L, 40, { px: 9.5, color: P.ink3, align: 'left', halo: false }); HeroKit.label(c, k, unitTxt(p.key, b) + UNITS[p.key], L + Wd, 40, { px: 9.5, color: P.ink3, align: 'right', halo: false });
      const lab = box.querySelector(`[data-rg="${p.key}"]`); lab.textContent = R ? `${unitTxt(p.key, R[p.key][0])}–${unitTxt(p.key, R[p.key][1])}${UNITS[p.key]}` : `${unitTxt(p.key, E.NOM[p.key])}${UNITS[p.key]}, номинал`;
    }
  }
  function chart() {
    const run = st.runs[thKey()], series = [];
    if (st.showFix && st.fix) series.push({ pts: st.fix.curve.map((q) => [q.step, q.real.rate * 100]), color: HeroKit.css('--ink-3'), dash: [6, 4], label: '×3 с первого шага' });
    if (run) series.push({ pts: run.curve.filter((q) => q.step <= st.at).map((q) => [q.step, q.real.rate * 100]), color: HeroKit.css('--e2e'), label: 'ADR', w: 2.6 });
    lineChart($('#aChart'), { xMax: BUD, xTicks: [0, 6000, 12000, 18000, 24000], xLabel: 'шаги обучения', yLabel: 'удачных попыток на шести настоящих руках', yShort: 'удачных попыток', series, cursor: run ? st.at : null, hline: 90, hlabel: '90%', empty: series.length ? null : 'нажми кнопку миссии: кривые появятся здесь' });
  }
  function render() {
    bars(); chart();
    const inp = $('#aAt'); inp.value = st.at; syncRange(inp, fmtInt(st.at)); inp.disabled = st.busy || !st.runs[thKey()];
    $$('#aTh button').forEach((b) => { b.disabled = st.busy; }); $('#aRun').disabled = st.busy;
    const pg = $('#aProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const run = st.runs[thKey()];
    if (st.busy) setOut($('#aOut'), `${st.label}: <b>${pct(st.prog)}%</b>`);
    else if (run) { const s = snapAt(run, st.at); setOut($('#aOut'), `Порог ${pct(st.th)}%. Шаг ${fmtInt(s.step)}: на шести настоящих руках удачных попыток <b>${pct(s.real.rate)}%</b>. ADR ${run.to90 ? 'дошёл до 90% к ' + fmtInt(run.to90) + '-му шагу' : 'до 90% не дошёл'}, а дорога до цели к концу обучения занимает ${sec(run.arrive)} с.`); }
    else setOut($('#aOut'), 'ADR ещё не запускали. Все диапазоны в номинале: полосы — одна точка.');
  }
  /** После обучения показать, как росли диапазоны: ползунок момента идёт от 0 до конца. */
  function play() {
    const id = ++st.anim; st.at = 0; render();
    return new Promise((res) => { let last = performance.now(); const tick = (now) => { if (id !== st.anim) return res(); st.at = Math.min(BUD, st.at + (now - last) / 1000 * 8000 * SPEED.k); last = now; render(); if (st.at < BUD) requestAnimationFrame(tick); else { st.at = BUD; render(); res(); } }; requestAnimationFrame(tick); });
  }
  async function busy(label, fn) { st.busy = true; st.label = label; st.prog = 0; render(); try { return await fn(); } finally { st.busy = false; render(); if (ctl) ctl.update(); } }
  function state() { return { th: st.th, at: st.at, run: st.runs[thKey()] }; }
  const api = {
    reset() { st.th = 0.8; st.at = BUD; st.showFix = false; st.anim++; segSet('#aTh', '0.8'); render(); },
    state, render, st,
    setAt(v) { st.anim++; st.at = Math.max(0, Math.min(BUD, v)); render(); },
    async first() { const r = await busy('ADR учит руку в браузере', () => runAdr(0.8)); st.th = 0.8; await play(); return { dHi: r.R.d[1], sLo: r.R.s[0], mHi: r.R.m[1], fHi: r.R.f[1], rate: r.rate, to90: r.to90 }; },
    async versus() { const a = await busy('ADR учит руку в браузере', () => runAdr(0.8)); const f = await busy('Учится политика с диапазоном ×3', () => runFix()); st.showFix = true; st.at = BUD; render(); return { adr90: a.to90, fix90: f.to90, adrT: a.arrive, fixT: f.arrive, adrRate: a.rate, fixRate: f.rate }; },
    async runTh() { const th = st.th; const r = await busy(`ADR с порогом ${pct(th)}% учит руку`, () => runAdr(th)); await play(); return r; },
  };
  const missions = [
    { short: 'Задержка', title: 'Как далеко ADR раздвинет задержку',
      text: 'ADR начинает с номинала: задержки нет. Политика из интерактива «карта миров» промахивалась уже при 40 мс. Запустим ADR на 24 000 шагов и посмотрим, куда уйдут границы всех четырёх диапазонов.',
      bet: { q: 'до какой задержки дорастёт диапазон?', options: ['Не дальше 40 мс: на большей задержке Ада промахивается', 'Дальше 60 мс: политика научится переживать задержку', 'Останется на нуле: пограничные попытки с задержкой будут неудачными'], answer: (r) => (r.dHi >= 60 ? 1 : r.dHi <= 0 ? 2 : 0) },
      action: { label: 'Запустить ADR', run: (X) => X.first() },
      criteria: [{ label: 'Диапазон задержки накрыл все настоящие руки — до 45 мс', test: (r) => r.dHi >= 45 }, { label: 'Удачных попыток на настоящих руках — не меньше 95%', test: (r) => r.rate >= 0.95 }],
      explain: (r) => `К концу обучения диапазон задержки — 0–${fmt(r.dHi, 0)} мс, дальше всех настоящих рук. Политика научилась переживать задержку, подходя к цели плавнее. А нижняя граница силы моторов остановилась на ${fmt(r.sLo * 100, 0)}%, масса чашки — на ${fmt(r.mHi, 2)} кг: со слабыми моторами и тяжёлой кружкой у руки не хватает момента, пограничные попытки там не набирают 80%, и ADR туда не идёт. На настоящих руках — ${pct(r.rate)}% удачных попыток. Ползунок «момент обучения» показывает, как росли полосы.` },
    { short: 'Против запаса', title: 'ADR или запас с первого шага',
      text: 'Без ADR диапазоны пришлось бы задать вручную, с запасом. Возьмём ширину ×3 из лаборатории 2 — она шире всего, до чего дошёл ADR, — и обучим с первого шага тем же PPO, тем же бюджетом в 24 000 шагов. Её диапазоны на полосах — серые пунктирные рамки.',
      controls: ['at'],
      bet: { q: 'кто раньше дойдёт до 90% удачных попыток на настоящих руках?', options: ['Широкий с первого шага: он с самого начала видит все миры', 'Одновременно: бюджет и метод одинаковые', 'ADR'], answer: (r) => (r.fix90 == null || r.adr90 * 1.5 <= r.fix90 ? 2 : r.fix90 * 1.5 <= r.adr90 ? 0 : 1) },
      action: { label: 'Обучить с диапазоном ×3', run: (X) => X.versus() },
      criteria: [{ label: 'ADR дошёл до 90% хотя бы в полтора раза быстрее', test: (r) => r.adr90 != null && (r.fix90 == null || r.adr90 * 1.5 <= r.fix90) }],
      explain: (r) => `ADR дошёл до 90% к ${fmtInt(r.adr90)}-му шагу, диапазон ×3 ${r.fix90 ? '— к ' + fmtInt(r.fix90) + '-му' : 'до 90% не дошёл'}. ADR сначала учится в простом мире и добавляет трудные, когда политика к ним готова, а широкий диапазон с первого шага заставляет учиться всему сразу. К концу у ADR ${pct(r.adrRate)}% удачных попыток и ${sec(r.adrT)} с до цели, у ×3 — ${pct(r.fixRate)}% и ${sec(r.fixT)} с. У OpenAI то же: чем шире фиксированная рандомизация, тем дольше учится политика, а ADR продвигается быстрее за счёт учебного плана.` },
    { short: 'Свободно', title: 'Свободный режим: порог расширения', final: true, controls: ['at', 'th'],
      text: 'Меняй порог расширения и запускай ADR заново — около трёх секунд на запуск. Найди порог, при котором диапазон задержки к концу шире всего, и проверь, не стала ли Ада от этого медленнее.' },
  ];
  function init() {
    $('#aAt').addEventListener('input', (e) => api.setAt(+e.target.value));
    segBind('#aTh', (v) => { if (st.busy) return; st.th = +v; segSet('#aTh', v); st.at = BUD; render(); });
    $('#aRun').addEventListener('click', () => { if (!st.busy) api.runTh(); });
    ctl = mountMissions('#aMis', missions, api, { controls: { at: '#wrapAAt', th: '#wrapATh' }, scene: '#aRanges' });
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
    { q: 'Если откалибровать симулятор точно, рандомизация не нужна?', o: ['Да: точной модели достаточно', 'Нет: всего не измерить — люфт, износ, задержки меняются, а робот со временем стареет; на практике точную модель и рандомизацию используют вместе', 'Нет: рандомизация нужна только для картинки с камеры'], a: 1, e: 'Hwangbo и соавторы пишут, что на практике оба подхода применяют вместе: у ANYmal выученная модель привода и 30 вариантов инерции. Tan и соавторы задавали диапазоны вокруг измеренных значений с небольшим запасом.' },
    { q: 'Политика без рандомизации точнее выучила свой мир. Значит, на роботе она надёжнее?', o: ['Да: точность переносится', 'Нет: она подстроилась под особенности одного мира; на шести настоящих руках Ады у неё 78% удачных попыток против 99% у рандомизированной при том же бюджете', 'Да, если обучать её дольше'], a: 1, e: 'У Peng и соавторов политика без рандомизации на настоящей руке не справилась ни в одной из 10 попыток, с рандомизацией — в 67–89%.' },
    { q: 'Что сильнее собьёт политику руки Ады из точного симулятора: кружка вчетверо тяжелее или задержка команды 40 мс?', o: ['Кружка: масса меняет всю динамику руки', 'Задержка: она нарушает обратную связь — политика исправляет ошибку, которой уже нет', 'Одинаково'], a: 1, e: 'Кружку 1 кг политика удерживала в 20 попытках из 20, с задержкой 40 мс — в 9. Просадку от массы политика видит и компенсирует. У Peng и соавторов без случайного времени между действиями успех на роботе упал с 89 до 29%.' },
    { q: 'Чем шире диапазоны рандомизации, тем лучше перенос?', o: ['Да: настоящий мир точно окажется внутри', 'Нет: лишняя ширина делает политику осторожнее и медленнее и требует больше обучения', 'Нет: широкие диапазоны всегда портят перенос'], a: 1, e: 'При ×3 Ада шла к цели 0,88 с против 0,72 с при ×1, и удачных попыток не прибавилось. Tan и соавторы: рандомизация меняет оптимальность на устойчивость. В Dactyl полная рандомизация стоила 100 лет опыта против 3 лет без неё.' },
    { q: 'Можно ли рандомизацией параметров закрыть любой разрыв с роботом?', o: ['Да, если менять достаточно параметров', 'Нет: если симулятор устроен иначе, чем робот, например не моделирует привод или задержку, настоящего мира среди вариантов нет', 'Нет: она закрывает только разрыв по картинке'], a: 1, e: 'У Tan и соавторов без модели мотора или без задержки политики Minitaur на роботе не работали; у Hwangbo и соавторов политика с идеальным приводом не смогла сделать ни шага.' },
    { q: 'ADR расширяет диапазоны, пока не упрётся в край шкалы?', o: ['Да, это его задача', 'Нет: граница сдвигается наружу, только если на ней политика справляется не хуже верхнего порога, и возвращается, если хуже нижнего', 'Нет, ADR только сужает диапазоны'], a: 1, e: 'На руке Ады диапазон задержки ушёл до 75 мс, а сила моторов остановилась на 63%: со слабыми моторами и тяжёлой кружкой не хватает момента, и пограничные попытки там не проходят порог.' },
    { q: 'Знает ли рандомизированная политика без памяти, в каком мире оказалась?', o: ['Да: она видела все миры при обучении', 'Нет: она выбирает одно поведение, приемлемое во всех мирах, поэтому и осторожничает', 'Да, по первому же наблюдению'], a: 1, e: 'Понять мир можно только по истории: как рука ответила на прошлые команды. У Peng и соавторов сеть с памятью на роботе справилась в 89% попыток против 67% у сети без памяти, у OpenAI по памяти LSTM размер кубика предсказывался с точностью больше 80%. Подробно — в уроке 5.5.' },
    { q: 'Зачем ADR начинает с одного калиброванного мира, а не сразу с широких диапазонов?', o: ['Чтобы сэкономить память компьютера', 'Это учебный план: в простом мире политика учится быстро, а трудные миры добавляются, когда она к ним готова', 'Так требует PPO'], a: 1, e: 'На руке Ады ADR дошёл до 90% на настоящих руках к 4800-му шагу, а широкий диапазон с первого шага — к 10 800-му. У OpenAI чем шире фиксированная рандомизация, тем дольше политика учится с нуля.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('probe', () => { mis.probe = Probe.init(); });
    safe('compare', () => { mis.compare = Compare.init(); });
    safe('width', () => { mis.width = Width.init(); });
    safe('adr', () => { mis.adr = Adr.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['pMis', 'cMis', 'wMis', 'aMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l54 = { mis, SPEED, Probe, Compare, Width, Adr, L54, View, Pol }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
