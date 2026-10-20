/* =====================================================================
   ui-l52.js — урок 5.2 «Policy gradient и PPO». Схемы и интерактивы:
   0) анимированные схемы (shared/anim.js): шаг градиента политики на
      гауссиане руля (отдача → преимущество → сдвиг колокола) и цикл PPO;
   1) интерактив «поездка по шагам»: отдача, ценность и преимущество GAE
      каждого решения руля в одной поездке;
   2) лаборатория «Две Ады»: живое обучение без обрезки и PPO рядом;
   3) лаборатория «Обрезка»: один член целевой функции PPO и настоящие
      отношения вероятностей после пяти эпох на одной пачке;
   4) лаборатория «Сколько шагов»: калькулятор по числам Rudin et al.;
   5) квиз.
   Движок — l52/engine.js (без DOM) поверх shared/drive-core.js.
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
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const fmtS = (v, d) => (v > 0 ? '+' : '') + fmt(v, d == null ? 2 : d);
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
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
/** KL — две значащие цифры: 0,0095, 0,29, 3,6. */
const KLD = (v) => (v > 0 ? fmt(v, Math.max(0, 1 - Math.floor(Math.log10(v)))) : '0');

/* =====================================================================
   Квартира Ады: план сверху (как в shared/drive-lab.js, но без лаборатории 1.1)
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
  /** Значок исхода в конце поездки: галочка, крест или кружок (время вышло). */
  function mark(c, x, y, outcome, P, r) {
    r = r || 7;
    if (outcome === 'crash') K.cross(c, x, y, r, P.bad, 2.6);
    else if (outcome === 'goal') K.check(c, x, y - 1, r, P.good, 2.6);
    else { c.beginPath(); c.arc(x, y, r * 0.6, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 2; c.stroke(); }
  }
  /** Дуга: куда приведёт постоянный руль w за T секунд. */
  function arc(c, s, w, T, color, lw, dash) {
    let q = { x: s.x, y: s.y, th: s.th }; c.beginPath(); c.moveTo(q.x, q.y);
    for (let t = 0; t < T; t += D.DT) { q = D.step(q, w); c.lineTo(q.x, q.y); }
    c.strokeStyle = color; c.lineWidth = lw || 3; c.lineCap = 'round'; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
    const a = q.th, L = 9; c.beginPath(); c.moveTo(q.x + Math.cos(a) * 3, q.y + Math.sin(a) * 3); c.lineTo(q.x - Math.cos(a - 0.5) * L, q.y - Math.sin(a - 0.5) * L); c.moveTo(q.x + Math.cos(a) * 3, q.y + Math.sin(a) * 3); c.lineTo(q.x - Math.cos(a + 0.5) * L, q.y - Math.sin(a + 0.5) * L); c.stroke();
  }
  return { house, ada, mark, arc };
})();

/* =====================================================================
   0а. Схема: шаг градиента политики на гауссиане руля
   Числа на схеме условные: шесть попробованных значений руля, их отдачи
   и ценность состояния подобраны для наглядности.
   ===================================================================== */
(() => {
  const T = 11;
  const S = [-0.8, -0.48, -0.18, 0.12, 0.42, 0.76];     // попробованные значения руля, доли предельного
  const G = [1.35, 2.7, 2.3, 1.25, 0.8, 0.6];            // отдача после каждого
  const V = 1.5;                                         // ценность состояния — обычная отдача отсюда
  const MU0 = 0.1, SD0 = 0.42, MU1 = -0.32, SD1 = 0.36;  // колокол до и после шага
  const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  function scene(c, k, t, P, A, g) {
    const { lab, rect, line, seg, alpha } = A, u = ((t % T) + T) % T;
    const { x, y, w, h } = g;
    rect(c, x, y, w, h, 10, P.surf2, P.line, 1);
    // стена с проёмом: проём выше и правее Ады — чтобы попасть в него, надо повернуть влево
    const wx = x + w * 0.72, gy0 = y + h * 0.19, gy1 = y + h * 0.45;
    c.fillStyle = P.ink2; c.fillRect(wx - 4, y + 6, 8, gy0 - y - 6); c.fillRect(wx - 4, gy1, 8, y + h - 6 - gy1);
    lab(c, k, 'проём', wx + 8, gy0 - 10, { px: 10, color: P.ink3, align: 'left', haloColor: P.surf2 });
    const ax = x + w * 0.2, ay = y + h * 0.7;
    // дуги шести попыток: куда Ада приедет с каждым рулём (схематично)
    const shown = Math.min(S.length, Math.floor(seg(u, 0.2, 1.8) * S.length + 0.001));
    for (let i = 0; i < shown; i++) {
      const ye = ay + h * (-0.207 + 0.517 * S[i]), pass = ye > gy0 + 6 && ye < gy1 - 6;
      const xe = pass ? wx + w * 0.16 : wx - 8, cx = ax + (wx - ax) * 0.45, cy = ay - (wx - ax) * 0.45 * 0.36;
      const pts = []; for (let j = 0; j <= 24; j++) { const s = j / 24, xx = (1 - s) * (1 - s) * ax + 2 * (1 - s) * s * cx + s * s * xe, yy = (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * cy + s * s * ye; pts.push([xx, yy]); }
      const col = u < 5.6 ? P.out : (G[i] - V > 0 ? P.good : P.bad);
      line(c, pts, alpha(col, 0.85), 2.2);
      if (pass) A.circle(c, xe, ye, 3.2, col, null); else HeroKit.cross(c, xe - 4, ye, 4, col, 2);
    }
    // Ада: круг с глазами, смотрит вправо-вверх
    c.save(); c.translate(ax, ay); c.rotate(-0.35);
    A.circle(c, 0, 0, 13, HeroKit.dark() ? '#2a2926' : '#f4efe6', P.ink, 2);
    c.beginPath(); c.roundRect(3, -6.5, 7, 13, 3); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(6.5, -3, 1.3, 0, 7); c.arc(6.5, 3, 1.3, 0, 7); c.fill();
    c.restore();
    lab(c, k, 'Ада, вид сверху', ax + 6, y + h - 12, { px: 10, color: P.ink3, haloColor: P.surf2 });
  }
  function bell(c, k, t, P, A, g) {
    const { lab, line, seg, ease, alpha } = A, u = ((t % T) + T) % T;
    const { x, y, w, h } = g, X = (a) => x + (a + 1) / 2 * w, base = y + h * 0.56;
    const grow = ease(seg(u, 1.8, 3.4)), vline = seg(u, 3.4, 4.2), drop = ease(seg(u, 4.6, 5.8)), shift = ease(seg(u, 6.4, 8.6));
    const fade = 1 - seg(u, T - 0.5, T);
    c.globalAlpha = fade;
    // ось руля
    line(c, [[x, base], [x + w, base]], P.ink3, 1.2);
    for (const [a, txt, al] of [[-1, g.narrow ? 'влево' : 'до упора влево', 'left'], [0, '0', 'center'], [1, g.narrow ? 'вправо' : 'до упора вправо', 'right']]) { line(c, [[X(a), base - 3], [X(a), base + 3]], P.ink3, 1.2); lab(c, k, txt, X(a), base + 44, { px: 10, color: P.ink3, align: al, haloColor: P.surf }); }
    lab(c, k, 'руль', x + w / 2, base + 59, { px: 10, color: P.ink3, haloColor: P.surf });
    // колокол политики
    const mu = MU0 + (MU1 - MU0) * shift, sd = SD0 + (SD1 - SD0) * shift, top = y + 14, hb = base - top, peak = gauss(0, 0, SD1);
    const pts = []; for (let i = 0; i <= 80; i++) { const a = -1 + 2 * i / 80; pts.push([X(a), base - hb * gauss(a, mu, sd) / peak * 0.42]); }
    if (shift > 0) { const p0 = []; for (let i = 0; i <= 80; i++) { const a = -1 + 2 * i / 80; p0.push([X(a), base - hb * gauss(a, MU0, SD0) / peak * 0.42]); } line(c, p0, alpha(P.mot, 0.35), 1.6, [4, 4]); }
    line(c, pts, P.mot, 2.6);
    lab(c, k, shift > 0.5 ? 'политика после шага' : 'политика π(a | s)', X(mu), base - hb * gauss(mu, mu, sd) / peak * 0.42 - 20, { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf });
    // столбики: отдача G, потом преимущество G − V
    const unit = g.unit, vy = base - V * unit * vline;
    S.forEach((a, i) => {
      const hG = G[i] * unit * grow, hA = (G[i] - V) * unit;
      const top0 = base - hG, top1 = base - hA, yTop = top0 + (top1 - top0) * drop, ybot = base;
      const col = drop < 0.5 ? P.out : (G[i] - V > 0 ? P.good : P.bad);
      if (grow > 0) { c.fillStyle = alpha(col, 0.8); const y0 = Math.min(yTop, ybot), y1 = Math.max(yTop, ybot); c.fillRect(X(a) - 6, y0, 12, Math.max(1, y1 - y0)); }
      A.circle(c, X(a), base, 3.4, P.ink2, P.surf, 1);
    });
    if (vline > 0 && drop < 1) {
      const yy = base - V * unit * (1 - drop) * vline;
      c.globalAlpha = fade * vline * (1 - drop * 0.8);
      line(c, [[x, yy], [x + w, yy]], P.ink2, 1.4, [5, 4]);
      lab(c, k, 'V(s) — обычная отдача отсюда', x + w - 4, yy - 9, { px: 10, color: P.ink2, align: 'right', haloColor: P.surf });
      c.globalAlpha = fade;
    }
    const cap = u < 1.8 ? 'Ада пробует шесть значений руля' : u < 3.4 ? 'после каждого — своя отдача G' : u < 4.6 ? 'критик знает, сколько обычно бывает отсюда' : u < 6.4 ? 'преимущество A = G − V: лучше или хуже обычного' : 'колокол сдвигается к зелёным';
    lab(c, k, cap, x + w / 2, y + h - 6, { px: g.narrow ? 10.5 : 11.5, weight: 650, color: P.ink, haloColor: P.surf });
    c.globalAlpha = 1;
  }
  Anim.add('pg', {
    W: 720, H: 340, start: 7.4, narrowAt: 560,
    draw(c, k, t, P, A) { scene(c, k, t, P, A, { x: 10, y: 20, w: 250, h: 290, sc: 1.05 }); bell(c, k, t, P, A, { x: 300, y: 10, w: 400, h: 320, unit: 34 }); },
    narrow: { W: 360, H: 530, draw(c, k, t, P, A) { scene(c, k, t, P, A, { x: 10, y: 8, w: 340, h: 230, sc: 1.25 }); bell(c, k, t, P, A, { narrow: true, x: 22, y: 236, w: 316, h: 290, unit: 30 }); } },
  });
})();

/* =====================================================================
   0б. Схема: цикл PPO — поездки, критик и GAE, 5 эпох с обрезкой, пачку выбросить.
   Числа в центре — настоящий запуск PPO из лаборатории 1 (зерно CFG.SEED);
   тест сверяет их с движком.
   ===================================================================== */
const LOOP_ANIM = { it: [1, 10, 20, 50], ok: [0, 3, 7, 8], steps: [266, 557, 729, 811] };
(() => {
  const TT = 7, NT = LOOP_ANIM.it.length, T = TT * NT;
  const RS = [0.93, 1.04, 1.12, 0.86, 1.27, 0.97, 0.78, 1.18, 1.09, 0.9];     // отношения r после эпох (условные)
  const AS = [1, -1, 1, -1, 1, 1, -1, 1, -1, -1];                              // знак преимущества
  function draw(c, k, t, P, A, g) {
    const { lab, rect, line, arrow, circle, seg, ease, alpha } = A, u = ((t % T) + T) % T, cyc = Math.floor(u / TT), v = u - cyc * TT;
    const ok = LOOP_ANIM.ok[cyc], it = LOOP_ANIM.it[cyc], st = g.st;
    const act = v < 1.6 ? 0 : v < 2.6 ? 1 : v < 3.6 ? 2 : v < 5.6 ? 3 : 4;
    // заголовок станции, пояснение и его короткий вариант: на узком канвасе длинное пояснение не влезает в блок
    const head = [['Ада ездит', '8 поездок текущей политикой', '8 поездок'], ['порция опыта', 'положения, руль, награды', 'шаги всех поездок'], ['критик', 'V(s) и преимущества GAE', 'V(s) и GAE'], ['актор', '5 эпох, обрезка 1 ± 0,2', '5 эпох, 1 ± 0,2']];
    const colOf = (i) => (i <= 1 ? P.out : P.mot);
    st.forEach(([x, y, w, h], i) => {
      const hot = act === i;
      rect(c, x, y, w, h, 10, alpha(colOf(i), hot ? 0.16 : 0.06), colOf(i), hot ? 2.2 : 1.3);
      lab(c, k, head[i][0], x + w / 2, y + 14, { px: 11.5, weight: 700, color: colOf(i), halo: false });
      HeroKit.font(c, k, 10, 600);
      lab(c, k, c.measureText(head[i][1]).width <= w - 8 * k ? head[i][1] : head[i][2], x + w / 2, y + 30, { px: 10, color: P.ink2, halo: false });
    });
    for (let i = 0; i < 3; i++) { const [a1, b1] = g.links[i]; arrow(c, a1[0], a1[1], b1[0], b1[1], act === i + 1 ? colOf(i + 1) : P.ink3, 2, 7); }
    // 1: поездки — 8 линий от старта, доехавшие до кухни с галочкой
    { const [x, y, w, h] = st[0], shown = act === 0 && v < 1.4 ? Math.floor(seg(v, 0, 1.4) * 8.999) : 8;
      const x0 = x + 14, x1 = x + w - 18, yb = y + 42, hh = h - 50;
      for (let j = 0; j < shown; j++) {
        const good = j < ok, yy = yb + hh * (j + 0.5) / 8, end = good ? x1 : x0 + (x1 - x0) * (0.25 + 0.6 * ((j * 37) % 10) / 10);
        line(c, [[x0, yy], [(x0 + end) / 2, yy + (j % 2 ? -3 : 3)], [end, yy]], alpha(P.out, 0.75), 1.6);
        if (good) HeroKit.check(c, end + 6, yy, 3.5, P.good, 1.8); else HeroKit.cross(c, end + 5, yy, 3, P.bad, 1.6);
      } }
    // 2: пачка — таблица «положение, руль, награда»
    { const [x, y, w, h] = st[1], tx = x + 18, tw = w - 36, ty = y + 44, rh = (h - 72) / 5;
      ['s', 'a', 'r'].forEach((t2, j) => lab(c, k, t2, tx + tw * (j + 0.5) / 3, ty + rh * 0.5, { px: 10, weight: 700, color: P.ink2, halo: false }));
      for (let r = 1; r < 5; r++) for (let j = 0; j < 3; j++) rect(c, tx + tw * j / 3 + 3, ty + rh * r + 2, tw / 3 - 6, rh - 4, 2, alpha(P.out, act === 1 ? 0.35 : 0.18), null);
      lab(c, k, `${LOOP_ANIM.steps[cyc]} шагов`, x + w / 2, y + h - 12, { px: 10, color: P.ink2, halo: false }); }
    // 3: критик — столбики преимуществ
    { const [x, y, w, h] = st[2], base = y + 44 + (h - 60) / 2, grow = act === 2 ? seg(v, 2.7, 3.4) : act > 2 || act === 4 ? 1 : 0.35;
      line(c, [[x + 14, base], [x + w - 14, base]], P.ink3, 1);
      for (let j = 0; j < 10; j++) { const a = AS[j] * (0.4 + ((j * 13) % 7) / 10), hh = a * 20 * grow; c.fillStyle = alpha(a > 0 ? P.good : P.bad, act === 2 ? 1 : 0.6); c.fillRect(x + 18 + j * (w - 36) / 10, Math.min(base, base - hh), (w - 36) / 10 - 3, Math.abs(hh)); } }
    // 4: актор — ось r, полоса 1 ± ε, точки расходятся по эпохам и гаснут за полосой в выгодную сторону
    { const [x, y, w, h] = st[3], ax0 = x + 12, ax1 = x + w - 12, ay = y + h - 20, R = (r) => ax0 + (r - 0.6) / 0.8 * (ax1 - ax0);
      c.fillStyle = alpha(P.ink3, 0.16); c.fillRect(R(0.8), ay - 34, R(1.2) - R(0.8), 34);
      line(c, [[ax0, ay], [ax1, ay]], P.ink3, 1.2);
      for (const [r, tx] of [[0.8, '0,8'], [1, '1'], [1.2, '1,2']]) lab(c, k, tx, R(r), ay + 10, { px: 10, color: P.ink3, halo: false });
      const ep = act === 3 ? Math.min(5, Math.floor(seg(v, 3.7, 5.5) * 5.999)) : act === 4 ? 5 : 0, sp = ep / 5;
      RS.forEach((r, j) => { const rr = 1 + (r - 1) * sp, off = (AS[j] > 0 && rr > 1.2) || (AS[j] < 0 && rr < 0.8); circle(c, R(rr), ay - 7 - (j % 4) * 6, 3.2, off ? alpha(P.ink3, 0.5) : alpha(AS[j] > 0 ? P.good : P.bad, act >= 3 ? 1 : 0.5), null); });
      lab(c, k, act >= 3 ? `эпоха ${Math.max(1, ep)} из 5` : 'r = 1 до обновления', x + w / 2, y + 48, { px: 10, color: P.ink2, halo: false }); }
    // пакет данных: по дорожке под станциями, потом в корзину
    let px, py, pa = 1; const L = g.lane;
    const mv = (i, j, a0, a1) => { const s2 = ease(seg(v, a0, a1)), a = L(i), b = L(j); return [a[0] + (b[0] - a[0]) * s2, a[1] + (b[1] - a[1]) * s2]; };
    if (v < 1.6) [px, py] = L(0); else if (v < 2.1) [px, py] = mv(0, 1, 1.6, 2.1); else if (v < 2.6) [px, py] = L(1);
    else if (v < 3.1) [px, py] = mv(1, 2, 2.6, 3.1); else if (v < 3.6) [px, py] = L(2); else if (v < 4.0) [px, py] = mv(2, 3, 3.6, 4.0);
    else if (v < 5.6) [px, py] = L(3); else { const s2 = ease(seg(v, 5.6, 6.3)), a = L(3), b = g.bin; px = a[0] + (b[0] - a[0]) * s2; py = a[1] + (b[1] - a[1]) * s2; pa = 1 - seg(v, 6.0, 6.4); }
    if (v >= 1.4 && pa > 0.02) {
      c.globalAlpha = pa * seg(v, 1.4, 1.6);
      rect(c, px - 22, py - 14, 44, 28, 5, P.surf, P.out, 1.6);
      for (let r = 0; r < 3; r++) line(c, [[px - 16, py - 7 + r * 7], [px + 16, py - 7 + r * 7]], alpha(P.out, 0.7), 1.4);
      c.globalAlpha = 1;
    }
    // возврат: новая политика снова едет; корзина для отработанной пачки
    const hotRet = v >= 6.3, [ra, rb] = g.ret;
    line(c, g.retPath, hotRet ? P.mot : alpha(P.ink3, 0.6), hotRet ? 2.4 : 1.5, [6, 5], -t * 20);
    arrow(c, ra[0], ra[1], rb[0], rb[1], hotRet ? P.mot : P.ink3, hotRet ? 2.4 : 1.5, 7);
    lab(c, k, 'новая политика едет снова', g.retLab[0], g.retLab[1], { px: 10, align: g.retAlign || 'center', color: hotRet ? P.mot : P.ink3, haloColor: P.surf });
    const [bx, by] = g.bin; rect(c, bx - 24, by - 2, 48, 24, 5, null, P.ink3, 1.2); line(c, [[bx - 28, by - 2], [bx + 28, by - 2]], P.ink3, 1.6);
    lab(c, k, 'порцию выбросили', bx, by + 34, { px: 10, color: P.ink3, haloColor: P.surf });
    lab(c, k, `обновление ${it}: до кухни доехали ${ok} из 8`, g.txt[0], g.txt[1], { px: g.narrow ? 12 : 13, weight: 750, color: P.ink, haloColor: P.surf });
  }
  Anim.add('loop', {
    W: 720, H: 360, start: 4.4, narrowAt: 600,
    draw(c, k, t, P, A) {
      const st = [[14, 22, 160, 150], [198, 22, 152, 150], [374, 22, 152, 150], [550, 22, 158, 150]];
      draw(c, k, t, P, A, { st, lane: (i) => [st[i][0] + st[i][2] / 2, 202],
        links: [[[176, 97], [196, 97]], [[352, 97], [372, 97]], [[528, 97], [548, 97]]],
        bin: [672, 262], retPath: [[586, 174], [586, 300], [94, 300], [94, 192]], ret: [[94, 190], [94, 174]], retLab: [330, 300], txt: [360, 338] });
    },
    narrow: { W: 360, H: 724, draw(c, k, t, P, A) {
      const st = [[46, 40, 234, 128], [46, 194, 234, 120], [46, 340, 234, 120], [46, 486, 234, 132]];
      draw(c, k, t, P, A, { narrow: true, st, lane: (i) => [312, st[i][1] + st[i][3] / 2 + 10],
        links: [[[163, 170], [163, 192]], [[163, 316], [163, 338]], [[163, 462], [163, 484]]],
        bin: [300, 646], retPath: [[46, 552], [20, 552], [20, 104], [42, 104]], ret: [[32, 104], [44, 104]], retLab: [14, 20], retAlign: 'left', txt: [180, 706] });
    } },
  });
})();

/* =====================================================================
   Общее: Ада PPO после 10 обновлений и её пачка — для интерактива
   «поездка по шагам» и лаборатории 2 (считается один раз, кусками)
   ===================================================================== */
const Snap = (() => {
  let p = null, snap = null;
  function get() { if (!p) p = runChunked(L52.snapshotGen(L52.TRACE.k), null, 14).then((s) => (snap = s)); return p; }
  return { get, now: () => snap };
})();

/* =====================================================================
   1. Интерактив: поездка по шагам — отдача, ценность, преимущество
   ===================================================================== */
const Trace = (() => {
  const E = L52, D = Drive, K = HeroKit;
  const st = { t: 0, lam: 0.95, weight: 'A', q: null };
  let ctl = null;
  const advOf = () => st.q.adv[st.lam];
  const wOf = () => (st.weight === 'A' ? advOf() : st.q.G);
  function state() {
    if (!st.q) return { ready: false };
    const t = st.t, q = st.q;
    return { ready: true, t, T: q.T, lam: st.lam, weight: st.weight, G: q.G[t], A: advOf()[t], V: q.V[t], r: q.r[t], a: q.a[t], mu: q.mu[t] };
  }
  function drawScene() {
    const cv = $('#eCv'), { c, k } = K.fit(cv, D.W, D.H), P = pal();
    Plan.house(c, k, P);
    if (!st.q) { K.label(c, k, 'поездка загружается…', D.W / 2, D.H / 2, { px: 13, weight: 700, color: P.ink, haloColor: P.surf }); return; }
    const q = st.q, w = wOf(); let mx = 1e-9; for (const v of w) mx = Math.max(mx, Math.abs(v));
    c.lineCap = 'round';
    for (let t = 0; t < q.T; t++) {
      const a = q.traj[t], b = q.traj[t + 1], v = w[t];
      c.strokeStyle = v >= 0 ? P.good : P.bad; c.globalAlpha = 0.25 + 0.75 * Math.abs(v) / mx; c.lineWidth = t === st.t ? 7 : 5;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    c.globalAlpha = 1;
    const end = q.traj[q.T]; Plan.mark(c, end.x, end.y, q.outcome, P, 9);
    const s = q.traj[st.t];
    Plan.arc(c, s, D.clamp(q.a[st.t], -1, 1) * D.WMAX, 0.9, P.e2e, 3);
    Plan.ada(c, s, P.ink);
  }
  function drawChart() {
    const cv = $('#eChart'), narrowC = (cv.getBoundingClientRect().width || 600) < 500, W = narrowC ? 400 : 600, H = narrowC ? 260 : 220;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = 46, R = 14, Tp = 30, B = 34, gw = W - L - R, gh = H - Tp - B;
    if (!st.q) { K.label(c, k, 'поездка загружается…', W / 2, H / 2, { px: 13, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const q = st.q, A = advOf(); let lo = 0, hi = 0;
    for (const arr of [A, q.G, q.V]) for (const v of arr) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.floor(lo * 2) / 2 - 0.25; hi = Math.ceil(hi * 2) / 2 + 0.25;
    const X = (t) => L + gw * (t + 0.5) / q.T, Y = (v) => Tp + gh * (hi - v) / (hi - lo), bw = Math.max(1.5, gw / q.T - 1.5);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = Math.ceil(lo); v <= hi; v += 1) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); K.label(c, k, fmt(v, 0), L - 7, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(L + gw, Y(0)); c.stroke();
    for (let t = 0; t < q.T; t++) { c.fillStyle = A[t] >= 0 ? P.good : P.bad; c.globalAlpha = t === st.t ? 1 : 0.75; const y0 = Y(Math.max(0, A[t])), y1 = Y(Math.min(0, A[t])); c.fillRect(X(t) - bw / 2, y0, bw, Math.max(1, y1 - y0)); }
    c.globalAlpha = 1;
    const path = (arr, col, lw, dash) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); arr.forEach((v, t) => (t ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v)))); c.stroke(); c.setLineDash([]); };
    path(q.V, P.ink3, 1.8, [5, 4]); path(q.G, P.cl, 2.4);
    c.strokeStyle = P.ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(st.t), Tp - 4); c.lineTo(X(st.t), Tp + gh); c.stroke();
    // подписи линий над графиком: длинные — в широкой раскладке, если все три встают в строку и не налезают друг на друга
    const tops = (sh) => [[sh ? 'отдача G' : 'отдача G после шага', L + 4, 'left', P.cl], [sh ? 'ценность V' : 'ценность V(s), которую ждал критик', L + (sh ? 110 : 170), 'left', P.ink3],
      [sh ? `A, λ = ${fmt(st.lam, 2)}` : `преимущество A, λ = ${fmt(st.lam, 2)}`, W - R - 2, 'right', P.good]];
    K.font(c, k, 10.5, 650);
    const fits = (row) => { const [a, b, d] = row.map(([t]) => c.measureText(t).width), gap = 8 * k; return row[0][1] + a + gap <= row[1][1] && row[1][1] + b + gap <= row[2][1] - d; };
    const narrow = narrowC || !fits(tops(false));
    tops(narrow).forEach(([t, x, al, col]) => K.label(c, k, t, x, 11, { px: 10.5, color: col, align: al, weight: 650, haloColor: P.surf }));
    K.label(c, k, narrow ? 'шаг поездки (0,1 с)' : 'шаг поездки, по 0,1 с', L + gw / 2, H - 10, { px: 10.5, color: P.ink3, halo: false });
  }
  function render() {
    drawScene(); drawChart();
    const s = state();
    if (!s.ready) { setOut($('#eOut'), 'Поездка загружается: в браузере повторяются первые 10 обновлений PPO из лаборатории 1.'); return; }
    const inp = $('#eT'); if (+inp.max !== s.T) inp.max = s.T; inp.value = s.t + 1; syncRange(inp, `${s.t + 1}`);
    const w = st.weight === 'A' ? s.A : s.G;
    setOut($('#eOut'), `Шаг ${s.t + 1} из ${s.T}, ${fmt(s.t * 0.1, 1)} с от старта. Руль ${fmtS(s.a)} (среднее политики ${fmtS(s.mu)}), награда за шаг ${fmtS(s.r)}. <b>Отдача G = ${fmtS(s.G)}</b>, ценность V = ${fmtS(s.V)}, <b>преимущество A = ${fmtS(s.A)}</b> при λ = ${fmt(st.lam, 2)}. ${st.weight === 'A' ? 'Градиент с преимуществом' : 'REINFORCE без базовой линии'} ${w >= 0 ? 'подталкивает этот руль вверх' : 'снижает вероятность этого руля'}.`);
  }
  const api = {
    reset() { st.t = 0; st.lam = 0.95; st.weight = 'A'; segSet('#eLam', '0.95'); segSet('#eWeight', 'A'); render(); },
    state, render, st,
    setT(t) { if (!st.q) return; st.t = Math.max(0, Math.min(st.q.T - 1, t)); render(); if (ctl) ctl.update(); },
    setLam(v) { st.lam = v; segSet('#eLam', String(v)); render(); if (ctl) ctl.update(); },
    setWeight(v) { st.weight = v; segSet('#eWeight', v); render(); if (ctl) ctl.update(); },
    ready: () => Snap.get().then(() => !!st.q),
  };
  const missions = [
    { short: 'Отдача и преимущество', title: 'Награда есть, а решение хуже обычного', text: 'Путь окрашен по преимуществу. Двигай ползунок по шагам поездки и найди решение руля, после которого отдача ещё положительная — Ада дальше продвинется к кухне, — а преимущество уже отрицательное.',
      controls: ['weight'],
      criteria: [{ label: 'Отдача после этого шага больше нуля', test: (r, s) => s.ready && s.G > 0 }, { label: 'Преимущество при λ = 0,95 меньше нуля', test: (r, s) => s.ready && s.lam === 0.95 && s.A < 0 }],
      hint: 'Отдача почти везде положительная, а преимущество меняет знак во второй половине поездки: Ада подъезжает к проёму на кухню не так, как обычно.',
      explain: (s) => `Шаг ${s.t + 1}: отдача ${fmtS(s.G)} — после него Ада ещё продвинется к кухне, и REINFORCE подтолкнул бы этот руль вверх. Но критик ждал из этого места ${fmtS(s.V)}, а вышло меньше: преимущество ${fmtS(s.A)}, и градиент с базовой линией снижает вероятность этого решения. Переключи окраску на «отдаче, как в REINFORCE»: зелёной станет бо́льшая часть пути, включая повороты, которые вели к столкновению.` },
    { short: 'λ = 0', title: 'Кто виноват в столкновении', text: 'Поставь λ = 0 — преимущество по одному шагу: награда шага плюс ценность следующего состояния минус ценность текущего. Найди среди последних 10 шагов перед столкновением решение, которое такая оценка считает лучше обычного.',
      controls: ['weight', 'lam'],
      criteria: [{ label: 'λ = 0', test: (r, s) => s.ready && s.lam === 0 }, { label: 'Выбран один из последних 10 шагов', test: (r, s) => s.ready && s.t >= s.T - 10 }, { label: 'Преимущество при λ = 0 больше нуля', test: (r, s) => s.ready && s.lam === 0 && s.A > 0 }],
      explain: (s) => { const q = Trace.st.q; return `Шаг ${s.t + 1}, за ${fmt((s.T - s.t) * 0.1, 1)} с до удара: при λ = 0 преимущество ${fmtS(q.adv[0][s.t])}, при λ = 0,95 — ${fmtS(q.adv[0.95][s.t])}, при λ = 1 — ${fmtS(q.adv[1][s.t])}. Оценка по одному шагу видит только награду этого шага и ценность следующего, а критик после 10 обновлений ещё не знает, что отсюда Ада врежется: он ждёт ${fmtS(s.V)}. Вся вина за столкновение достаётся последнему решению — ${fmtS(q.adv[0][s.T - 1])}. С λ = 0,95 в оценку входят и награды следующих шагов, включая −1 за удар. На десяти зёрнах PPO с λ = 0 в последних обновлениях доезжал до кухни в 0–57% поездок, с λ = 0,95 — в 84–99%; проверь это в свободном режиме лаборатории 1.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай окраску пути и λ. Найди шаг, где отдача и преимущество при λ = 1 расходятся сильнее всего, и посмотри, чего ждал там критик.', final: true },
  ];
  function init() {
    $('#eT').addEventListener('input', (e) => api.setT(+e.target.value - 1));
    segBind('#eLam', (v) => api.setLam(+v));
    segBind('#eWeight', (v) => api.setWeight(v));
    ctl = mountMissions('#eMis', missions, api, { controls: { weight: '#wrapEWeight', lam: '#wrapELam' }, scene: '#eCv' });
    render(); redrawOn(render);
    Snap.get().then((snap) => { st.q = E.trace(snap, E.TRACE.ep); render(); ctl.update(); });
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: две Ады учатся рядом — без обрезки и PPO
   ===================================================================== */
const Corr = (() => {
  const E = L52, D = Drive, K = HeroKit, N = E.CFG.ITERS;
  const BASE = { clip: 0.2, LR: 0.003, EPOCHS: 5, LAMBDA: 0.95 };
  const keyOf = (o) => `${o.clip}|${o.LR}|${o.EPOCHS}|${o.LAMBDA}`;
  const CONF = {};
  const reg = (o) => { const k = keyOf(o); CONF[k] = Object.assign({}, o); return k; };
  const KEY = { ppo: reg(BASE), noclip: reg(Object.assign({}, BASE, { clip: 0 })), small: reg(Object.assign({}, BASE, { clip: 0, LR: 0.0003 })) };
  const st = { runs: {}, live: {}, order: [], left: KEY.noclip, right: KEY.ppo, it: N, view: 'ok', busy: false, prog: 0, opts: Object.assign({}, BASE) };
  let ctl = null;
  const lrTxt = (v) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: v < 0.001 ? 4 : 3 });
  /** Чем настройка отличается от PPO лаборатории: «ε = 0,1», «шаг 0,01», «1 эпоха», «λ = 0». */
  function diffOf(o) {
    const d = [];
    if (o.clip && o.clip !== BASE.clip) d.push(`ε = ${fmt(o.clip, 1)}`);
    if (o.LR !== BASE.LR) d.push(`шаг ${lrTxt(o.LR)}`);
    if (o.EPOCHS !== BASE.EPOCHS) d.push(nWord(o.EPOCHS, 'эпоха', 'эпохи', 'эпох'));
    if (o.LAMBDA !== BASE.LAMBDA) d.push(`λ = ${fmt(o.LAMBDA, o.LAMBDA % 1 ? 2 : 0)}`);
    return d;
  }
  function nameOf(k) {
    if (k === KEY.ppo) return 'PPO'; if (k === KEY.noclip) return 'Без обрезки'; if (k === KEY.small) return 'Без обрезки, малый шаг';
    const o = CONF[k], d = diffOf(o); return (o.clip ? 'PPO' : 'Без обрезки') + (d.length ? ', ' + d.join(', ') : '');
  }
  /** Короткое имя для подписи на графике. */
  function shortOf(k) { if (k === KEY.small) return 'Малый шаг'; if (k === KEY.ppo || k === KEY.noclip) return nameOf(k); const o = CONF[k], d = diffOf(o); return (o.clip ? '' : 'без обр., ') + (d.join(', ') || 'PPO'); }
  function subOf(k) { const o = CONF[k]; return `${o.clip ? 'ε = ' + fmt(o.clip, 1) + ' · ' : ''}шаг ${lrTxt(o.LR)} · ${nWord(o.EPOCHS, 'эпоха', 'эпохи', 'эпох')}${o.LAMBDA !== 0.95 ? ' · λ = ' + fmt(o.LAMBDA, o.LAMBDA % 1 ? 2 : 0) : ''}`; }
  const histOf = (k) => (k && st.runs[k] ? st.runs[k].hist : k && st.live[k]) || null;
  /** Обучить несколько вариантов вперемешку, по обновлению каждого за раз; готовые берутся из кэша. */
  async function trainAll(keys) {
    const todo = keys.filter((k, i) => !st.runs[k] && keys.indexOf(k) === i);
    keys.forEach((k) => { st.order = st.order.filter((x) => x !== k).concat([k]); });
    if (!todo.length) { render(); return; }
    st.busy = true; st.prog = 0; todo.forEach((k) => { st.live[k] = []; }); render();
    const gens = todo.map((k) => ({ k, g: E.train(Object.assign({ keep: true }, CONF[k])), done: false }));
    function* multi() {
      for (;;) {
        let alive = false;
        for (const x of gens) {
          if (x.done) continue;
          const r = x.g.next();
          if (r.done) { x.done = true; st.runs[x.k] = { key: x.k, hist: r.value.hist, sum: E.summary(r.value.hist) }; delete st.live[x.k]; }
          else { st.live[x.k].push(r.value); alive = true; }
        }
        if (!alive) return;
        yield 1;
      }
    }
    try {
      await runChunked(multi(), () => { const n = Math.min(...todo.map((k) => (histOf(k) || []).length)); st.prog = n / N; st.it = Math.max(1, n); render(); }, 14);
    } finally { st.busy = false; }
    st.it = N; render();
  }
  const pal2 = () => pal();
  function colOf(k, P) { return k === st.right ? P.e2e : k === st.left ? (k === KEY.small ? P.cl : P.hy) : P.ink3; }
  function drawPane(side) {
    const key = side === 'L' ? st.left : st.right, cv = $('#pCv' + side), { c, k } = K.fit(cv, D.W, D.H), P = pal2();
    Plan.house(c, k, P);
    const hist = histOf(key), h = hist && hist[st.it - 1];
    if (!h) { K.label(c, k, st.busy ? 'Ада учится…' : (k > 1.5 ? 'нажми кнопку миссии' : 'нажми кнопку миссии, и Ада начнёт учиться'), D.W / 2, D.H / 2 + 40, { px: 12.5, weight: 700, color: P.ink, haloColor: P.bg }); Plan.ada(c, D.START, P.ink); return; }
    const col = colOf(key, P);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const e of h.eps) {
      c.strokeStyle = col; c.globalAlpha = 0.75; c.lineWidth = 2.4; c.beginPath();
      for (let i = 0; i < e.xy.length; i += 2) (i ? c.lineTo(e.xy[i], e.xy[i + 1]) : c.moveTo(e.xy[i], e.xy[i + 1]));
      c.stroke(); c.globalAlpha = 1;
    }
    for (const e of h.eps) Plan.mark(c, e.xy[e.xy.length - 2], e.xy[e.xy.length - 1], e.outcome, P, 8);
    Plan.ada(c, D.START, P.ink);
  }
  function drawStats() {
    for (const side of ['L', 'R']) {
      const key = side === 'L' ? st.left : st.right, hist = histOf(key), h = hist && hist[st.it - 1], el = $('#pStat' + side);
      $('#pHead' + side).textContent = nameOf(key); $('#pHead' + side).className = side === 'R' ? 'fm' : key === KEY.small ? 'sm' : 'nc';
      setOut($('#pSub' + side), subOf(key));
      if (!h) { setOut(el, st.busy ? 'Ада учится…' : 'Ещё не обучена'); el.className = 'pane-stat'; continue; }
      const tot = hist.slice(0, st.it).reduce((a, x) => a + x.ok, 0), narrowP = (el.getBoundingClientRect().width || 300) < 260;
      setOut(el, narrowP ? `<b>${h.ok} из 8 до кухни</b> · KL ${KLD(h.kl)}` : `<b>Перед обновлением ${st.it}: ${h.ok} из 8 до кухни</b> · KL этого обновления ${KLD(h.kl)} · всего ${tot} из ${st.it * 8}`);
      el.className = 'pane-stat ' + (h.ok >= 6 ? 'ok' : h.ok <= 2 ? 'bad' : '');
    }
  }
  function drawChart() {
    const cv = $('#pChart'), narrow = (cv.getBoundingClientRect().width || 640) < 500, W = narrow ? 380 : 640, H = 260;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal2();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = narrow ? 60 : 54, R = narrow ? 64 : 150, T = 24, B = 38, gw = W - L - R, gh = H - T - B;
    const X = (i) => L + gw * (i - 1) / (N - 1), kl = st.view === 'kl';
    const Y = kl ? (v) => T + gh * (1 - (Math.log10(Math.max(1e-4, Math.min(10, v))) + 4) / 5) : (v) => T + gh * (1 - v);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    const ticks = kl ? [[1e-4, '0,0001'], [1e-3, '0,001'], [1e-2, '0,01'], [0.1, '0,1'], [1, '1'], [10, '10']] : [[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']];
    for (const [v, t] of ticks) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); K.label(c, k, t, L - 6, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    for (const i of [1, 10, 20, 30, 40, 50]) K.label(c, k, String(i), X(i), T + gh + 13, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, 'обновление', L + gw / 2, H - 8, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, kl ? (narrow ? 'KL за обновление' : 'насколько обновление изменило политику, KL') : (narrow ? 'доехали до кухни' : 'доля 8 поездок перед обновлением, доехавших до кухни'), L, 10, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    if (kl) { c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.beginPath(); c.moveTo(L, Y(0.01)); c.lineTo(L + gw, Y(0.01)); c.stroke(); c.setLineDash([]); K.label(c, k, 'δ = 0,01 TRPO', L + 4, Y(0.01) + 10, { px: 10, color: P.ink2, align: 'left', haloColor: P.surf }); }
    const keys = st.order.filter((x) => histOf(x) && histOf(x).length);
    if (!keys.length) { K.label(c, k, st.busy ? 'Ады учатся…' : (narrow ? 'нажми кнопку миссии' : 'график заполнится, когда Ады начнут учиться: нажми кнопку миссии'), L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    // сначала фоновые линии, потом выбранные пары
    const sorted = keys.filter((x) => x !== st.left && x !== st.right).concat(keys.filter((x) => x === st.left), keys.filter((x) => x === st.right));
    const tags = [];
    for (const key of sorted) {
      const hist = histOf(key), main = key === st.left || key === st.right, col = colOf(key, P);
      c.strokeStyle = col; c.lineWidth = main ? 2.4 : 1.3; c.setLineDash(main ? [] : [4, 4]); c.globalAlpha = main ? 1 : 0.7;
      c.beginPath(); hist.forEach((h, i) => { const v = kl ? h.kl : h.ok / h.n, x = X(i + 1), y = Y(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      if (hist.length === N) { const s = st.runs[key] ? st.runs[key].sum : null, v = !s ? '' : kl ? KLD(s.klMed) : pct(s.last10) + '%'; tags.push({ y: Y(kl ? hist[N - 1].kl : hist[N - 1].ok / 8), col: main ? col : P.ink3, main, name: narrow ? '' : shortOf(key), v }); }
    }
    // подписи концов линий у правого края: по высоте, не ближе 13 px друг к другу; если внизу места не хватает,
    // вся группа поднимается, так что подписи не налезают друг на друга и остаются в пределах графика
    const n = tags.length, gap = n > 1 ? Math.min(13 * k, gh / (n - 1)) : 0, xT = L + gw + 6, room = W - xT - 2 * k;
    tags.sort((a, b) => a.y - b.y);
    for (let i = 0; i < n; i++) tags[i].y = Math.max(tags[i].y, i ? tags[i - 1].y + gap : T);
    const yMax = T + gh + Math.min(0, 13 - 11.5 * k);   // ниже — деление «50» под осью
    for (let i = n - 1; i >= 0; i--) tags[i].y = Math.min(tags[i].y, i < n - 1 ? tags[i + 1].y - gap : yMax);
    tags.forEach((t) => {
      const o = { px: t.main ? 10.5 : 10, weight: t.main ? 650 : 500, color: t.col, align: 'left', haloColor: P.surf };
      // длинное имя настройки укорачиваем по запятым, пока подпись не встанет в поле справа от графика
      K.font(c, k, o.px, o.weight);
      const join = (nm) => (nm ? nm + (t.v ? ' · ' + t.v : '') : t.v), parts = t.name ? t.name.split(', ') : [];
      let s = join(t.name);
      while (c.measureText(s).width > room && parts.length > 1) { parts.pop(); s = join(parts.join(', ') + '…'); }
      if (c.measureText(s).width > room) s = t.v;
      K.label(c, k, s, xT, t.y, o);
    });
    if (n && !narrow) K.label(c, k, kl ? 'медиана KL' : '% — за последние 10', xT, 10, { px: 10, color: P.ink3, align: 'left', halo: false });
    c.strokeStyle = P.ink; c.lineWidth = 1.3; c.beginPath(); c.moveTo(X(st.it), T - 2); c.lineTo(X(st.it), T + gh); c.stroke();
  }
  function render() {
    drawPane('L'); drawPane('R'); drawStats(); drawChart();
    const pg = $('#pProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const inp = $('#pIter'); inp.value = st.it; syncRange(inp, String(st.it));
    const R = st.runs[st.right], Lr = st.runs[st.left];
    if (st.busy) setOut($('#pOut'), `Ады учатся в браузере: обновление <b>${st.it}</b> из ${N}.`);
    else if (R && Lr) setOut($('#pOut'), `${nameOf(st.left)}: ${Lr.sum.okAll} поездок до кухни из 400, в последних 10 обновлениях — ${pct(Lr.sum.last10)}%, медиана KL ${KLD(Lr.sum.klMed)}. ${nameOf(st.right)}: ${R.sum.okAll} из 400, ${pct(R.sum.last10)}%, медиана KL ${KLD(R.sum.klMed)}.`);
    else setOut($('#pOut'), 'Политики ещё не обучены.');
    $('#pTrain').disabled = st.busy;
    $('#pChartNote').textContent = st.view === 'kl'
      ? 'По горизонтали — номер обновления, по вертикали — насколько обновление изменило политику: оценка KL между политикой до и после него, логарифмическая шкала. Пунктир — δ = 0,01, граница TRPO. Нажми на график или двигай ползунок, чтобы посмотреть поездки любого обновления.'
      : 'По горизонтали — номер обновления, по вертикали — сколько из 8 поездок перед этим обновлением доехали до кухни. Нажми на график или двигай ползунок под ним, чтобы посмотреть поездки любого обновления.';
  }
  function setIt(i) { st.it = Math.max(1, Math.min(N, Math.round(i))); render(); if (ctl) ctl.update(); }
  function setView(v) { st.view = v; segSet('#pView', v); render(); if (ctl) ctl.update(); }
  function sumOf(k) { return st.runs[k].sum; }
  /** Выбрано ли обновление с самым большим KL у Ады без обрезки. */
  function atMax(it) { const r = st.runs[KEY.noclip]; return !!(r && it === r.sum.klMaxIt + 1); }
  function state() { return { it: st.it, view: st.view, busy: st.busy, left: st.left, right: st.right, atMax: atMax(st.it), trained: !!st.runs[KEY.noclip] && !!st.runs[KEY.ppo] }; }
  const api = {
    reset() { st.left = KEY.noclip; st.right = KEY.ppo; st.order = st.order.filter((k) => st.runs[k] && (k === KEY.noclip || k === KEY.ppo)); setView('ok'); setOpts(BASE); st.it = N; render(); },
    state, render, st, KEY, setIt, setView, sumOf, atMax,
    async first() { st.left = KEY.noclip; st.right = KEY.ppo; await trainAll([KEY.noclip, KEY.ppo]); return { nc: sumOf(KEY.noclip), ppo: sumOf(KEY.ppo), ncHist: st.runs[KEY.noclip].hist }; },
    async small() { st.left = KEY.small; st.right = KEY.ppo; await trainAll([KEY.noclip, KEY.ppo, KEY.small]); return { nc: sumOf(KEY.noclip), ppo: sumOf(KEY.ppo), small: sumOf(KEY.small) }; },
    async mine() { const k = reg(st.opts); st.left = st.left === k ? KEY.noclip : st.left; st.right = k; await trainAll([st.left, k]); return { key: k, sum: sumOf(k), o: CONF[k] }; },
  };
  function setOpts(o) { Object.assign(st.opts, o); segSet('#pClip', String(st.opts.clip)); segSet('#pLr', String(st.opts.LR)); segSet('#pEp', String(st.opts.EPOCHS)); segSet('#pLam', String(st.opts.LAMBDA)); }
  const missions = [
    { short: 'Обрезка', title: 'Один шаг, разная целевая функция', text: 'Обе Ады начинают с одной политики, у обеих шаг Adam 0,003 и 5 эпох на каждой порции опыта. Слева — целевая функция без обрезки, справа — PPO с ε = 0,2. Нажми кнопку: обе обучатся по 50 обновлений, по 8 поездок перед каждым.',
      bet: { q: 'какая из Ад будет доезжать до кухни в последних 10 обновлениях?', options: ['Обе: шаг и данные одинаковые, а без обрезки политика ещё и свободнее', 'Только левая: обрезка мешает учиться', 'Только PPO справа'], answer: (r) => (r.ppo.last10 >= 0.75 && r.nc.last10 < 0.1 ? 2 : r.nc.last10 > r.ppo.last10 ? 1 : 0) },
      action: { label: 'Обучить обеих Ад', run: (X) => X.first() },
      criteria: [{ label: 'PPO доезжает хотя бы в 75% поездок последних 10 обновлений', test: (r) => r.ppo.last10 >= 0.75 }, { label: 'Без обрезки — меньше чем в 10%', test: (r) => r.nc.last10 < 0.1 }],
      explain: (r) => `За 50 обновлений PPO доехала до кухни в ${r.ppo.okAll} поездках из 400, а в последних десяти обновлениях доезжала в ${pct(r.ppo.last10)}% поездок. В среднем по пяти обновлениям она вышла на 75% к обновлению ${r.ppo.reach}. У Ады без обрезки таких поездок ${r.nc.okAll} из 400: она так и не научилась доезжать. Медиана KL за обновление равна ${KLD(r.nc.klMed)} без обрезки и ${KLD(r.ppo.klMed)} у PPO. У PPO она почти совпадает с границей TRPO 0,01, хотя PPO эту границу нигде не задаёт. Без обрезки самый большой скачок политики за одно обновление составил KL = ${KLD(r.nc.klMax)}.` },
    { short: 'Малый шаг', title: 'А если шагать осторожнее?', text: 'Может, без обрезки хватит шага поменьше? Слева теперь Ада без обрезки с шагом Adam 0,0003 — в десять раз меньше. Справа — та же PPO.',
      bet: { q: 'что будет с левой Адой за 50 обновлений?', options: ['Научится так же, как PPO, только немного позже', 'Не развалится, но будет доезжать заметно реже PPO', 'Развалится, как с большим шагом'], answer: (r) => (r.small.last10 >= r.ppo.last10 - 0.1 ? 0 : r.small.last10 <= 0.05 ? 2 : 1) },
      action: { label: 'Обучить с малым шагом', run: (X) => X.small() },
      criteria: [{ label: 'С малым шагом Ада доезжает чаще, чем без обрезки с большим', test: (r) => r.small.last10 > r.nc.last10 }, { label: '…но хотя бы на 30 пунктов реже PPO', test: (r) => r.small.last10 <= r.ppo.last10 - 0.3 }],
      explain: (r) => `С шагом 0,0003 без обрезки Ада доезжает до кухни в ${pct(r.small.last10)}% поездок последних десяти обновлений, а за всё обучение доехала в ${r.small.okAll} поездках из 400. Политика не разваливается, но учится медленно. Медиана KL за обновление равна ${KLD(r.small.klMed)}: это примерно в ${nWord(Math.round(r.ppo.klMed / r.small.klMed), 'раз', 'раза', 'раз')} меньше, чем у PPO (${KLD(r.ppo.klMed)}). Авторы TRPO писали о том же: штраф, которого требует теория, делает шаги очень маленькими. PPO оставляет шаг большим и гасит его только для тех примеров, где политика уже ушла достаточно далеко.` },
    { short: 'Скачок', title: 'Обновление, которое изменило политику сильнее всего', text: 'Переключи график на «насколько изменилась политика» и найди обновление, после которого политика Ады без обрезки изменилась сильнее всего. Номер обновления выбирай ползунком или нажатием на график; на сценах — поездки перед выбранным обновлением.',
      controls: ['view'],
      onEnter: (X) => { X.st.left = X.KEY.noclip; X.st.right = X.KEY.ppo; X.render(); },
      criteria: [{ label: 'На графике — насколько изменилась политика', test: (r, s) => s.view === 'kl' }, { label: 'Выбрано обновление с самым большим KL у Ады без обрезки', test: (r, s) => s.atMax }],
      hint: 'Ищи самый высокий пик фиолетовой линии — он выше пунктира δ на два с лишним порядка.',
      explain: (s) => { const h = Corr.st.runs[Corr.KEY.noclip].hist, p = Corr.st.runs[Corr.KEY.ppo].hist, i = s.it - 1, nx = h[i + 1], back = nx ? nx.eps.filter((e) => e.xy[e.xy.length - 2] < 100).length : 0, cr = (q) => q.eps.filter((e) => e.outcome === 'crash').length; return `Обновление ${s.it}: без обрезки KL = ${KLD(h[i].kl)}, у PPO на том же номере — ${KLD(p[i].kl)}, в ${nWord(Math.round(h[i].kl / p[i].kl), 'раз', 'раза', 'раз')} меньше. Перед этим обновлением левая Ада в среднем получала отдачу ${fmtS(h[i].ret)}: ${cr(h[i])} из 8 поездок кончились столкновением${h[i].ok ? `, ${h[i].ok} — на кухне` : ''}.${nx ? ` После него средняя отдача — ${fmtS(nx.ret)}${back ? `, и ${back} из 8 поездок кончились в прихожей: Ада разворачивается и едет назад` : ''}.` : ''} Порцию опыта для следующего обновления собирает уже эта, другая политика, и преимущества, посчитанные для прежней, к ней почти не относятся.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Слева остаётся Ада без обрезки. Меняй настройки Ады справа и обучай её заново: каждая настройка учится один раз, потом берётся из памяти. Найди самый большой шаг Adam, при котором PPO ещё учится устойчиво, и проверь, что будет при λ = 0.', final: true, controls: ['view', 'opts', 'train'] },
  ];
  function init() {
    const cv = $('#pChart');
    const pick = (e) => { const r = cv.getBoundingClientRect(), narrow = r.width < 500, W = narrow ? 380 : 640, L = narrow ? 60 : 54, R = narrow ? 64 : 150, x = (e.clientX - r.left) / r.width * W; setIt(1 + (x - L) / (W - L - R) * (N - 1)); };
    let down = false;
    cv.addEventListener('pointerdown', (e) => { down = true; pick(e); });
    cv.addEventListener('pointermove', (e) => { if (down) pick(e); });
    window.addEventListener('pointerup', () => { down = false; });
    $('#pIter').addEventListener('input', (e) => setIt(+e.target.value));
    segBind('#pView', (v) => setView(v));
    segBind('#pClip', (v) => { if (!st.busy) setOpts({ clip: +v }); });
    segBind('#pLr', (v) => { if (!st.busy) setOpts({ LR: +v }); });
    segBind('#pEp', (v) => { if (!st.busy) setOpts({ EPOCHS: +v }); });
    segBind('#pLam', (v) => { if (!st.busy) setOpts({ LAMBDA: +v }); });
    $('#pTrain').addEventListener('click', () => { if (!st.busy) api.mine(); });
    ctl = mountMissions('#pMis', missions, api, { controls: { view: '#wrapPView', opts: '#wrapPOpts', train: '#wrapPTrain' }, scene: '#pDuo' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, KEY };
})();

/* =====================================================================
   3. Лаборатория: обрезка в действии — один член L^CLIP и настоящие r
   ===================================================================== */
const Clip = (() => {
  const E = L52, K = HeroKit;
  const st = { sign: 1, eps: 0.2, r: 1, res: {}, shown: false, busy: false };
  let ctl = null;
  const R0 = 0.3, R1 = 2.0;
  function geo(W, H) { return { L: 48, R: 16, T: 26, B: 36, W, H }; }
  function drawPlot() {
    const cv = $('#kCv'), narrow = (cv.getBoundingClientRect().width || 600) < 500, W = 600, H = narrow ? 440 : 300;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), g = geo(W, H), gw = W - g.L - g.R, gh = H - g.T - g.B - (narrow ? 14 : 0);
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const A = st.sign, e = st.eps, X = (r) => g.L + gw * (r - R0) / (R1 - R0);
    const lo = A > 0 ? 0 : -2.1, hi = A > 0 ? 2.1 : 0, Y = (v) => g.T + gh * (hi - v) / (hi - lo);
    // полоса 1 ± ε и область, где градиент примера равен нулю
    c.fillStyle = P.bg; c.fillRect(X(1 - e), g.T, X(1 + e) - X(1 - e), gh);
    const z0 = A > 0 ? X(1 + e) : X(R0), z1 = A > 0 ? X(R1) : X(1 - e);
    c.save(); c.beginPath(); c.rect(z0, g.T, z1 - z0, gh); K.hatch(c, z0, g.T, z1, g.T + gh, HeroKit.css('--line-2'), 9, 1); c.restore();
    // сетка и оси
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-9; v += 0.5) { c.beginPath(); c.moveTo(g.L, Y(v)); c.lineTo(g.L + gw, Y(v)); c.stroke(); K.label(c, k, fmt(v, 1), g.L - 6, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    for (const r of [0.5, 1, 1.5]) K.label(c, k, fmt(r, r % 1 ? 1 : 0), X(r), g.T + gh + 13 * Math.max(1, k * 0.8), { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, 'r', X(R1), g.T + gh + 27 * Math.max(1, k * 0.8), { px: 11, weight: 700, color: P.ink2, align: 'right', halo: false });
    K.label(c, k, `вклад примера, A = ${A > 0 ? '+1' : '−1'}`, g.L, 11, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    K.label(c, k, `1 − ε`, X(1 - e), g.T + gh + 27 * Math.max(1, k * 0.8), { px: 10, color: P.ink3, halo: false });
    K.label(c, k, `1 + ε`, X(1 + e), g.T + gh + 27 * Math.max(1, k * 0.8), { px: 10, color: P.ink3, halo: false });
    // r·A без обрезки и член PPO
    c.setLineDash([5, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X(R0), Y(R0 * A)); c.lineTo(X(R1), Y(R1 * A)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = P.e2e; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 170; i++) { const r = R0 + (R1 - R0) * i / 170, v = E.clipTerm(r, A, e); i ? c.lineTo(X(r), Y(v)) : c.moveTo(X(r), Y(v)); }
    c.stroke();
    const dl = A > 0 ? 1.8 : 0.62; K.label(c, k, 'без обрезки, r·A', X(dl), Y(dl * A) - 14 * Math.max(1, k * 0.8), { px: 10, color: P.ink3, haloColor: P.surf });
    K.label(c, k, 'член PPO', X(A > 0 ? 1.7 : 0.45), Y(E.clipTerm(A > 0 ? 1.7 : 0.45, A, e)) + (A > 0 ? -12 : 12), { px: 10.5, weight: 700, color: P.e2e, haloColor: P.surf });
    // точка r и стрелка градиента
    const r = st.r, v = E.clipTerm(r, A, e), sl = E.clipSlope(r, A, e), px = X(r), py = Y(v);
    if (sl) { const dir = Math.sign(sl), x2 = px + dir * 46; c.strokeStyle = P.good; c.fillStyle = P.good; c.lineWidth = 3; c.beginPath(); c.moveTo(px + dir * 9, py); c.lineTo(x2, py); c.stroke(); c.beginPath(); c.moveTo(x2 + dir * 8, py); c.lineTo(x2, py - 6); c.lineTo(x2, py + 6); c.closePath(); c.fill(); }
    c.beginPath(); c.arc(px, py, 7, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 3; c.strokeStyle = P.ink; c.stroke();
    K.label(c, k, sl ? (sl > 0 ? 'тянет вправо: вероятность растёт' : 'тянет влево: вероятность падает') : 'градиент 0: пример не тянет', Math.max(g.L + 90 * k, Math.min(W - g.R - 90 * k, px)), py + (A > 0 ? -22 : 22) * Math.max(1, k * 0.8), { px: 10.5, weight: 650, color: sl ? P.good : P.ink2, haloColor: P.surf });
  }
  const BINS = 36, LO = Math.log10(0.05), HI = Math.log10(20);
  function hist(ratios) { const n = new Array(BINS).fill(0); for (const q of ratios) { const b = Math.max(0, Math.min(BINS - 1, Math.floor((Math.log10(q) - LO) / (HI - LO) * BINS))); n[b]++; } return n; }
  const outside = (res, e) => { let n = 0; for (const q of res.ratios) if (Math.abs(q - 1) > e) n++; return n; };
  function drawHist() {
    const cv = $('#kHist'), narrow = (cv.getBoundingClientRect().width || 600) < 500, W = 600, H = narrow ? 360 : 250;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), L = 14, R = 14, gw = W - L - R;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (r) => L + gw * (Math.log10(r) - LO) / (HI - LO), e = st.eps;
    const top = st.res[e], nc = st.res.nc;
    if (!st.shown || !top || !nc) { K.label(c, k, st.busy ? 'политика обновляется…' : (k > 1.5 ? 'нажми кнопку миссии 3' : 'здесь появятся настоящие r: нажми «Обновить политику на одной порции» в миссии 3'), W / 2, H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const rows = [[top, `с обрезкой, ε = ${fmt(e, 2)}`, P.e2e, narrow ? 44 : 22], [nc, 'без обрезки', P.hy, narrow ? 196 : 128]], hmax = narrow ? 104 : 78;
    const cnt = rows.map(([res]) => hist(res.ratios)), mx = Math.max(...cnt.flat());
    rows.forEach(([res, name, col, y0], j) => {
      const base = y0 + hmax;
      c.fillStyle = P.bg; c.fillRect(X(1 - e), y0, X(1 + e) - X(1 - e), hmax);
      c.fillStyle = col; cnt[j].forEach((n, b) => { if (!n) return; const x0 = L + gw * b / BINS, hh = Math.max(1.5, hmax * Math.sqrt(n / mx)); c.fillRect(x0 + 0.5, base - hh, gw / BINS - 1, hh); });
      c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(L, base); c.lineTo(L + gw, base); c.stroke();
      const o = outside(res, e);
      K.label(c, k, narrow ? `${name}: за полосой ${pct(o / res.N)}%, KL ${KLD(res.kl)}` : `${name}: за полосой ${pct(o / res.N)}% (${o} из ${res.N}), KL ${KLD(res.kl)}`, L + 2, y0 - (narrow ? 14 * k * 0.8 : 0) + 2, { px: 10.5, weight: 650, color: col, align: 'left', haloColor: P.surf });
    });
    for (const [r, t] of [[0.1, '0,1'], [0.5, '0,5'], [1, '1'], [2, '2'], [10, '10']]) K.label(c, k, t, X(r), H - 10, { px: 10.5, color: P.ink3, halo: false });
  }
  function state() {
    const sl = E.clipSlope(st.r, st.sign, st.eps), top = st.res[st.eps], nc = st.res.nc;
    return { sign: st.sign, eps: st.eps, r: st.r, slope: sl, term: E.clipTerm(st.r, st.sign, st.eps), shown: st.shown,
      ppoOut: top ? outside(top, st.eps) / top.N : null, ncOut: nc ? outside(nc, st.eps) / nc.N : null };
  }
  function render() {
    drawPlot(); drawHist();
    syncRange($('#kR'), fmt(st.r, 2)); $('#kR').value = st.r; syncRange($('#kEps'), fmt(st.eps, 2)); $('#kEps').value = st.eps;
    const s = state();
    setOut($('#kOut'), `r = ${fmt(s.r, 2)}, преимущество ${s.sign > 0 ? 'положительное' : 'отрицательное'}, ε = ${fmt(s.eps, 2)}: вклад примера ${fmtS(s.term)}; ${s.slope ? `градиент тянет r ${s.slope > 0 ? 'вверх — вероятность действия растёт' : 'вниз — вероятность действия падает'}` : 'градиент этого примера равен нулю — он больше не тянет веса'}.${s.shown && s.ppoOut != null ? ` На настоящей порции опыта за полосой ${fmt(1 - s.eps, 2)}…${fmt(1 + s.eps, 2)}: с обрезкой ${pct(s.ppoOut)}%, без обрезки ${pct(s.ncOut)}%.` : ''}`);
  }
  async function ensure(e) {
    const snap = await Snap.get();
    if (!st.res.nc) st.res.nc = E.ratioTest(snap, 0);
    if (!st.res[e]) st.res[e] = E.ratioTest(snap, e);
  }
  const upd = () => { render(); if (ctl) ctl.update(); };
  const api = {
    reset() { st.sign = 1; st.eps = 0.2; st.r = 1; st.shown = false; segSet('#kSign', '1'); render(); },
    state, render, st,
    setR(r) { st.r = Math.max(R0, Math.min(R1, Math.round(r * 100) / 100)); upd(); },
    setSign(v) { st.sign = v; segSet('#kSign', String(v)); upd(); },
    async setEps(e) { st.eps = Math.round(e * 100) / 100; if (st.shown) { await ensure(st.eps); } upd(); },
    async wrong() { st.sign = -1; segSet('#kSign', '-1'); st.r = 1.6; upd(); return { slope: E.clipSlope(1.6, -1, st.eps), term: E.clipTerm(1.6, -1, st.eps), clipped: -(1 + st.eps), eps: st.eps }; },
    async batch() { st.busy = true; render(); try { await ensure(st.eps); } finally { st.busy = false; } st.shown = true; upd(); const top = st.res[st.eps], nc = st.res.nc; return { eps: st.eps, ppo: { out: outside(top, st.eps) / top.N, kl: top.kl, max: top.max, min: top.min }, nc: { out: outside(nc, st.eps) / nc.N, kl: nc.kl, max: nc.max, min: nc.min }, N: top.N }; },
  };
  const missions = [
    { short: 'A > 0', title: 'Действие лучше обычного', text: 'Преимущество положительное: этот поворот руля оказался лучше, чем обычно бывает из этого места, и обучение поднимает его вероятность — r растёт. Тяни точку вправо (или двигай ползунок r) и найди, где пример перестаёт тянуть.',
      controls: ['r'],
      criteria: [{ label: 'Преимущество положительное', test: (r, s) => s.sign > 0 }, { label: 'Точка там, где градиент этого примера равен нулю', test: (r, s) => s.slope === 0 }],
      explain: (s) => `При r = ${fmt(s.r, 2)} вероятность действия уже выросла больше чем в 1 + ε = ${fmt(1 + s.eps, 1)} раза. Обрезанный член — ${fmt((1 + s.eps), 1)}·A, он не растёт с r, и минимум выбирает его: дальше поднимать вероятность этого действия невыгодно, пример больше не тянет веса. Остальные примеры порции продолжают учить политику.` },
    { short: 'A < 0', title: 'Плохое действие стало вероятнее', text: 'Бывает и так: преимущество отрицательное — действие хуже обычного, — но после нескольких мини-пакетов его вероятность выросла в 1,6 раза: общие веса сдвинулись ради других примеров. Нажми кнопку — точка встанет в r = 1,6 при A < 0.',
      controls: ['r', 'sign'],
      bet: { q: 'исправит ли обучение эту ошибку?', options: ['Нет: r за пределами [0,8; 1,2], обрезка гасит градиент', 'Да, в полную силу: градиент тянет r вниз', 'Да, но слабее, чем внутри отрезка'], answer: (r) => (r.slope < 0 ? 1 : 0) },
      action: { label: 'Поставить r = 1,6 при A < 0', run: (X) => X.wrong() },
      criteria: [{ label: 'Градиент тянет r вниз', test: (r) => r.slope < 0 }],
      explain: (r) => `Необрезанный член r·A = ${fmtS(-1.6, 1)}, обрезанный — ${fmtS(r.clipped, 1)}, и минимум выбирает первый: он хуже. Значит, градиент тот же, что без обрезки, и вероятность ошибочного действия снижается в полную силу. Так авторы PPO и описывают свою целевую функцию: изменение r не учитывается, когда оно её улучшает, и учитывается, когда ухудшает. Обрезка ограничивает только выгодные шаги.` },
    { short: 'Порция', title: 'Пять эпох по одной порции опыта', text: 'Теперь настоящие числа. Ада PPO из лаборатории 1 после 10 обновлений проехала 8 поездок — 772 решения руля. Её политику обновляют пять эпох мини-пакетами по этой порции дважды, с одной и той же копии: с обрезкой ε = 0,2 и без. Для каждого решения считают, во сколько раз изменилась его вероятность.',
      controls: ['r', 'sign'],
      onEnter: (X) => { if (X.st.eps !== 0.2) X.setEps(0.2); },
      bet: { q: 'у какой доли решений без обрезки r выйдет за пределы [0,8; 1,2]?', options: ['Меньше десятой: пять эпох — это немного', 'Около четверти', 'Больше половины'], answer: (r) => (r.nc.out < 0.1 ? 0 : r.nc.out < 0.4 ? 1 : 2) },
      action: { label: 'Обновить политику на одной порции', run: (X) => X.batch() },
      criteria: [{ label: 'Без обрезки за пределами отрезка больше половины решений', test: (r) => r.nc.out > 0.5 }, { label: 'С обрезкой — меньше четверти', test: (r) => r.ppo.out < 0.25 }],
      explain: (r) => `Без обрезки ${pct(r.nc.out)}% решений изменили вероятность больше чем на 20%: у одного она выросла в ${fmt(r.nc.max, 1)} раза, у другого упала до ${fmt(r.nc.min, 3)} от прежней. KL между политиками до и после — ${KLD(r.nc.kl)}. С обрезкой за пределами отрезка ${pct(r.ppo.out)}%, r от ${fmt(r.ppo.min, 2)} до ${fmt(r.ppo.max, 2)}, KL — ${KLD(r.ppo.kl)}. Порция одна и та же, политика до обновления одна и та же — разница только в целевой функции.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй ε: верхняя гистограмма пересчитывается для нового ε, нижняя показывает, сколько решений без обрезки вышло бы за новую полосу. Найди ε, при котором с обрезкой за свою полосу выходит больше 10% решений, и посмотри, как растёт KL.', final: true },
  ];
  function init() {
    const cv = $('#kCv'), W = 600, H = 300, g = geo(W, H), gw = W - g.L - g.R;
    const toR = (p) => R0 + (p.x - g.L) / gw * (R1 - R0);
    const X = (r) => g.L + gw * (r - R0) / (R1 - R0);
    K.drag(cv, W, H, { hit: (p) => (Math.abs(p.x - X(st.r)) < 34 ? { r: true } : null), move: (o, p) => api.setR(toR(p)), tap: (p) => api.setR(toR(p)), tapCursor: 'pointer' });
    $('#kR').addEventListener('input', (e) => api.setR(+e.target.value));
    $('#kEps').addEventListener('input', (e) => api.setEps(+e.target.value));
    segBind('#kSign', (v) => api.setSign(+v));
    ctl = mountMissions('#kMis', missions, api, { controls: { r: '#wrapKR', sign: '#wrapKSign', eps: '#wrapKEps' }, scene: '#kCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   4. Лаборатория: сколько шагов симуляции нужно ходьбе (числа Rudin et al.)
   ===================================================================== */
const Steps = (() => {
  const E = L52, K = HeroKit, PR = E.PAPER;
  const ROBOTS = [1, 128, 512, 1024, 2048, 4096, 8192, 16384, 20000], STEPS = [6, 12, 24, 50, 100, 200, 768], UPD = [500, 1000, 1500, 2000];
  const st = { ri: 5, si: 2, ui: 2, shown: false };
  let ctl = null;
  const q = () => ({ robots: ROBOTS[st.ri], steps: STEPS[st.si], updates: UPD[st.ui], hz: PR.rudin.hz });
  const big = (n) => (Math.abs(n) < 10000 ? String(Math.round(n)) : fmt(n, 0));   // четырёхзначные — без пробела
  const f1 = (v) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const yearsWord = (y) => (y % 1 ? 'года' : plural(y, 'год', 'года', 'лет'));   // 1 год, 2 года, 5 лет, 1,5 года
  const days = (d) => { if (d < 1) return `${f1(d * 24)} ч`; if (d < 365) return `${d < 100 ? f1(d) : fmt(d, 0)} сут`; const y = Math.round(d / 36.5) / 10; return `${f1(y)} ${yearsWord(y)}`; };
  const dur = (sec) => (sec < 120 ? `${fmt(sec, 0)} с` : sec < 7200 ? `${f1(sec / 60)} мин` : `${f1(sec / 3600)} ч`);
  function warnings(x, r) {
    const out = [];
    if (x.robots === 1) out.push(['', 'Один робот: так учился бы настоящий робот, и опыт набирался бы в реальном времени.']);
    if (x.steps < 24) out.push(['warn', `Каждый робот делает за обновление ${x.steps} шагов подряд — ${fmt(r.horizon, 2)} с. Авторы пишут, что алгоритм с трудом сходится, когда шагов меньше 25 (0,5 с): GAE нужны награды нескольких шагов подряд.`]);
    else if (x.steps === 24) out.push(['', 'Каждый робот делает за обновление 24 шага подряд, это 0,48 с. Такой отрезок лежит у самой границы в 25 шагов, которую называют авторы, и именно его они брали в своём обучении.']);
    if (x.robots > 1 && x.robots <= 512 && r.B >= 49152) out.push(['warn', `Когда такую порцию собирают ${x.robots} роботов, каждый из них проходит за обновление длинный отрезок, и соседние шаги в нём похожи друг на друга. У авторов с малым числом роботов политика получалась немного хуже, а время обучения почти линейно росло, когда роботов было меньше 4000.`]);
    if (r.B >= 500000) out.push(['', 'Порция от полумиллиона шагов: у авторов 20 000 роботов × 50 шагов = 1 млн дали лучшую политику, но ценой заметно более долгого обучения.']);
    if (x.robots >= 2048 && x.robots <= 4096 && r.B >= 90000 && r.B <= 220000) out.push(['good', 'Зона, которую авторы называют лучшим компромиссом для своей задачи: 2048–4096 роботов, порция около 100–200 тысяч шагов.']);
    return out;
  }
  function drawOut() {
    const x = q(), r = E.calc(x);
    syncRange($('#sRobots'), big(x.robots)); syncRange($('#sSteps'), String(x.steps)); syncRange($('#sUpd'), big(x.updates));
    if (!st.shown) { setOut($('#sOut'), '<div class="calc-wait">Сначала сделай ставку и нажми «Посчитать» в первой миссии.</div>'); setOut($('#sWarn'), ''); return; }
    setOut($('#sOut'), [
      ['Порция за обновление', big(r.B), `${big(x.robots)} × ${x.steps}`],
      ['Всего шагов политики', big(r.total), `× ${big(x.updates)} обновлений`],
      ['Опыт одного робота', days(r.days), `${big(r.sec)} с подряд`, 'main'],
      ['Каждая копия проходит', dur(r.perRobotSec), `отрезками по ${fmt(r.horizon, 2)} с`],
    ].map(([a, b, cc, m]) => `<div class="co${m ? ' ' + m : ''}"><span>${a}</span><b>${b}</b><small>${cc}</small></div>`).join(''));
    setOut($('#sWarn'), warnings(x, r).map(([cl, t]) => `<p class="${cl}">${t}</p>`).join(''));
  }
  function drawBars() {
    const cv = $('#sCv'), narrow = (cv.getBoundingClientRect().width || 640) < 500, W = narrow ? 380 : 640, H = narrow ? 300 : 250;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    if (!st.shown) { K.label(c, k, narrow ? 'появится после расчёта' : 'график появится после расчёта в первой миссии', W / 2, H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const x = q(), r = E.calc(x), gae = PR.gae.dt * PR.gae.batch * PR.gae.iters / 86400, rud = E.calc({ robots: PR.rudin.robots, steps: PR.rudin.steps, updates: PR.rudin.updates, hz: PR.rudin.hz });
    const rows = [
      ['Двуногий робот, GAE, 2015', gae, '≈ 2 ч на 16 ядрах', P.cl, '≈ 2 ч'],
      ['ANYmal, бег, TRPO, 2019', PR.anymal.simDays, '4 ч, 1 CPU + 1 GPU', P.cl, '4 ч'],
      ['ANYmal, подъём, TRPO, 2019', PR.anymal.recoverDays, '11 ч', P.cl, '11 ч'],
      ['ANYmal, PPO, Rudin et al., 2021', rud.days, '< 20 мин, 1 GPU', P.cl, '< 20 мин'],
      ['Твоя настройка', r.days, '', P.e2e, ''],   // сколько шло бы обучение, калькулятор не знает: это сказано в подписи под графиком
    ];
    const L = narrow ? 12 : 220, R = narrow ? 12 : 150, T = 12, rowH = narrow ? (H - T - 26) / rows.length : (H - T - 28) / rows.length;
    const lo = Math.log10(0.01), hi = Math.log10(1000), gw = W - L - R, X = (d) => L + gw * (Math.log10(Math.max(0.01, Math.min(1000, d))) - lo) / (hi - lo);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    const ticks = [[0.01, '15 мин'], [0.1, '2,4 ч'], [1, '1 сут'], [10, '10 сут'], [100, '100 сут'], [1000, '1000 сут']];
    K.font(c, k, 10, 600);
    const sparse = narrow || ticks.some(([d, t], i) => i && (c.measureText(t).width + c.measureText(ticks[i - 1][1]).width) / 2 + 6 * k > X(d) - X(ticks[i - 1][0]));
    for (const [d, t] of ticks) { c.beginPath(); c.moveTo(X(d), T); c.lineTo(X(d), H - 24); c.stroke(); K.label(c, k, sparse && (d === 0.1 || d === 100) ? '' : t, X(d), H - 12, { px: 10, color: P.ink3, align: narrow && d === 0.01 ? 'left' : narrow && d === 1000 ? 'right' : 'center', halo: false }); }
    rows.forEach(([name, d, time, col, tShort], i) => {
      const y = T + rowH * i, bh = narrow ? rowH * 0.34 : rowH * 0.56, by = narrow ? y + rowH * 0.5 : y + (rowH - bh) / 2;
      c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(L, by, Math.max(2, X(d) - L), bh); c.globalAlpha = 1;
      if (narrow) {
        K.font(c, k, 10, 650);
        const full = `${name} · ${days(d)}${tShort ? ' за ' + tShort : ''}`;
        K.label(c, k, c.measureText(full).width <= W - L - 2 * k ? full : `${name} · ${days(d)}`, L, y + rowH * 0.28, { px: 10, weight: 650, color: col === P.e2e ? P.e2e : P.ink2, align: 'left', haloColor: P.surf });
      }
      else {
        K.label(c, k, name, L - 8, by + bh / 2, { px: 10.5, weight: 650, color: col === P.e2e ? P.e2e : P.ink2, align: 'right', halo: false });
        K.label(c, k, time ? `${days(d)} · ${time}` : days(d), Math.min(X(d), L + gw) + 6, by + bh / 2, { px: 10, color: P.ink2, align: 'left', haloColor: P.surf });
      }
    });
  }
  function render() { drawOut(); drawBars(); ['sRobots', 'sSteps', 'sUpd'].forEach((id) => setRangeFill($('#' + id))); }
  function set(o) { if (o.ri != null) st.ri = o.ri; if (o.si != null) st.si = o.si; if (o.ui != null) st.ui = o.ui; ['ri', 'si', 'ui'].forEach((kk, j) => { $(['#sRobots', '#sSteps', '#sUpd'][j]).value = st[kk]; }); render(); if (ctl) ctl.update(); }
  function state() { const x = q(), r = E.calc(x); return Object.assign({ shown: st.shown }, x, r); }
  const api = {
    reset() { st.shown = false; set({ ri: 5, si: 2, ui: 2 }); },
    state, render, st, set, ROBOTS, STEPS, UPD,
    paper() { set({ ri: ROBOTS.indexOf(PR.rudin.robots), si: STEPS.indexOf(PR.rudin.steps), ui: UPD.indexOf(PR.rudin.updates) }); st.shown = true; render(); return Promise.resolve(state()); },
  };
  const missions = [
    { short: 'Опыт', title: 'Сколько опыта за 20 минут', text: 'Ползунки стоят на настройке Rudin et al.: 4096 роботов, по 24 шага каждого за обновление, 1500 обновлений, 50 решений в секунду. На видеокарте это заняло меньше 20 минут.',
      controls: ['robots', 'steps', 'upd'],
      bet: { q: 'сколько это опыта, если пересчитать на одного робота, который шагает без перерывов?', options: ['Около суток: обучение заняло всего 20 минут', 'Около недели', 'Больше месяца'], answer: (r) => (r.days < 2 ? 0 : r.days < 14 ? 1 : 2) },
      action: { label: 'Посчитать', run: (X) => X.paper() },
      criteria: [{ label: 'Порция — 98 304 шага, как в таблице 3 статьи', test: (r) => r.B === 98304 }, { label: 'Опыт одного робота больше 30 суток', test: (r) => r.days > 30 }],
      explain: (r) => `${big(r.robots)} × ${r.steps} = ${big(r.B)} шага в порции, × ${big(r.updates)} обновлений = ${big(r.total)} шагов. При 50 решениях в секунду это ${big(r.sec)} с — ${fmt(r.days, 1)} суток без перерывов. А каждая из 4096 копий проходит за всё обучение лишь ${fmt(r.perRobotSec / 60, 0)} минут. Обучение заняло меньше 20 минут — больше чем в ${big(Math.floor(r.days * 1440 / 20 / 100) * 100)} раз быстрее реального времени (наш расчёт). ANYmal в 2019 году набрал 9 суток опыта за 4 часа — в 54 раза быстрее, двуногий робот из статьи GAE — 5,8 суток примерно за 2 часа.` },
    { short: 'Больше роботов', title: 'Та же порция — шестнадцать тысяч роботов', text: 'Видеокарта Rudin et al. тянула до 16 384 роботов на неровном рельефе. Раздай им ту же порцию — около 98 тысяч шагов: поставь 16 384 робота и подбери число шагов каждого.',
      controls: ['robots', 'steps'],
      criteria: [{ label: '16 384 робота', test: (r, s) => s.shown && s.robots === 16384 }, { label: 'Порция — 98 304 шага', test: (r, s) => s.shown && s.B === 98304 }],
      explain: (s) => `${big(s.robots)} × ${s.steps} = ${big(s.B)}: порция та же, но каждый робот за обновление проходит ${s.steps} шагов — ${fmt(s.horizon, 2)} с. У авторов при слишком большом числе роботов результат резко падал: отрезок каждого робота становится слишком коротким, а GAE нужны награды нескольких шагов подряд. Больше роботов полезно, пока у каждого остаётся хотя бы около 25 шагов.` },
    { short: 'Меньше роботов', title: 'Та же порция — 128 роботов', text: 'Теперь в обратную сторону: 128 роботов, как в прежних реализациях на процессорах, и та же порция около 98 тысяч шагов.',
      controls: ['robots', 'steps'],
      criteria: [{ label: '128 роботов', test: (r, s) => s.shown && s.robots === 128 }, { label: 'Порция — 98 304 шага', test: (r, s) => s.shown && s.B === 98304 }],
      explain: (s) => `${big(s.robots)} × ${s.steps} = ${big(s.B)}: каждый робот проходит за обновление ${fmt(s.horizon, 1)} с подряд, и соседние шаги похожи друг на друга. Авторы видели при меньшем числе роботов медленное снижение качества, а время обучения почти линейно сокращается с ростом числа роботов примерно до 4000. Поэтому их выбор — 4096 роботов по 24 шага.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Найди настройку, при которой опыт одного робота превысит год, и посмотри, во что обходится порция в миллион шагов: 20 000 роботов × 50 шагов дали у авторов лучшую политику, но обучение заметно дольше.', final: true },
  ];
  function init() {
    $('#sRobots').addEventListener('input', (e) => set({ ri: +e.target.value }));
    $('#sSteps').addEventListener('input', (e) => set({ si: +e.target.value }));
    $('#sUpd').addEventListener('input', (e) => set({ ui: +e.target.value }));
    ctl = mountMissions('#sMis', missions, api, { controls: { robots: '#wrapSRobots', steps: '#wrapSSteps', upd: '#wrapSUpd' }, scene: '#sCalc' });
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
    { q: 'Политику руля Ады можно учить таблицей ценностей действий, как в сетке квартиры из урока 5.1?', o: ['Да, если сделать таблицу подробнее', 'Нет: руль и наблюдения непрерывны, состояние не повторяется, а выбор руля потребовал бы искать максимум по всем значениям на каждом шаге — поэтому учат саму политику', 'Да, градиент политики и есть такая таблица'], a: 1, e: 'Стохастическая политика выдаёт распределение руля — среднее и разброс, — и её веса двигают градиентом политики. Sutton и Barto предлагают так поступать с непрерывными действиями в разделе 13.7.' },
    { q: 'REINFORCE подталкивает только действия, после которых отдача положительная?', o: ['Да, остальные он не трогает', 'Нет: каждое действие подталкивается с весом своей отдачи; если отдачи почти всегда положительные, вверх идут почти все действия, и сигнал тонет в шуме', 'Нет, он подталкивает только самое удачное действие эпизода'], a: 1, e: 'В поездке Ады из интерактива отдача положительна на 49 шагах из 68, хотя поездка кончилась столкновением. Базовая линия V(s) превращает отдачу в преимущество, у которого есть оба знака.' },
    { q: 'Базовая линия b(s) смещает оценку градиента — поэтому её берут маленькой?', o: ['Да, чем больше b, тем сильнее смещение', 'Нет: если b зависит только от состояния, среднее направление градиента не меняется, а разброс может заметно упасть; естественный выбор — ценность V(s)', 'Базовая линия нужна только для дискретных действий'], a: 1, e: 'Вычтенная часть, усреднённая по действиям политики, даёт ноль (Sutton и Barto, разд. 13.4). Смещение появляется в другом месте — когда оценка преимущества доверяет неточному критику, как GAE с λ = 0.' },
    { q: 'Чем больше эпох по одной порции опыта, тем больше пользы от собранных данных — и обрезка для этого не нужна?', o: ['Да, данные надо использовать по максимуму', 'Нет: без ограничения несколько эпох по одной порции уводят политику слишком далеко — в коридоре Ады без обрезки 0% поездок до кухни в конце обучения', 'Нет, больше одной эпохи нельзя никогда'], a: 1, e: 'PPO и придуман, чтобы проходить по порции несколько эпох без разрушительных обновлений. В статье PPO вариант без обрезки и штрафа получил −0,39 — хуже случайной политики.' },
    { q: 'Обрезка в PPO не даёт отношению вероятностей r выйти за пределы [1 − ε, 1 + ε]?', o: ['Да, r жёстко зажато в этом отрезке', 'Нет: обрезка гасит градиент отдельного примера, но общие веса двигаются ради других, и r этого примера может уйти дальше', 'Да, но только при положительном преимуществе'], a: 1, e: 'В лаборатории 2 после пяти эпох с ε = 0,2 за пределами [0,8; 1,2] оказались 20% решений руля, а без обрезки — 72%. Rudin et al. дополнительно подстраивали шаг обучения по KL.' },
    { q: 'Действие хуже обычного, но его вероятность после нескольких мини-пакетов выросла в 1,6 раза. Обрезка помешает это исправить?', o: ['Да: r за пределами отрезка, градиент равен нулю', 'Нет: минимум выбирает необрезанный член, он хуже, и градиент тянет вероятность вниз в полную силу', 'Да, если ε меньше 0,6'], a: 1, e: 'Целевая функция PPO — пессимистичная оценка: изменение r не учитывается, когда оно её улучшает, и учитывается, когда ухудшает. Ограничены только выгодные шаги.' },
    { q: 'Если без обрезки политика разваливается, хватит просто уменьшить шаг обучения?', o: ['Да, и это ничем не хуже PPO', 'Политика перестанет разваливаться, но будет учиться медленно: в коридоре Ады с шагом в 10 раз меньше — 48% поездок до кухни против 99% у PPO', 'Нет, с маленьким шагом политика разваливается ещё быстрее'], a: 1, e: 'У малого шага медиана KL за обновление около 0,0025, у PPO — около 0,0095. Авторы TRPO писали, что штраф, которого требует теория, делает шаги очень маленькими, и заменили его ограничением.' },
    { q: 'При той же порции опыта больше параллельных роботов в симуляторе — всегда лучше?', o: ['Да, больше роботов — больше разнообразия', 'Нет: каждый робот получает меньше шагов подряд, а GAE нужны награды нескольких шагов; у Rudin et al. алгоритм с трудом сходился, когда шагов было меньше 25', 'Нет, число роботов ни на что не влияет'], a: 1, e: 'Лучшим компромиссом для своей задачи авторы называют 2048–4096 роботов и порции около 100–200 тысяч шагов. Их итоговая настройка — 4096 роботов по 24 шага.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('trace', () => { mis.trace = Trace.init(); });
    safe('corr', () => { mis.corr = Corr.init(); });
    safe('clip', () => { mis.clip = Clip.init(); });
    safe('steps', () => { mis.steps = Steps.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['eMis', 'pMis', 'kMis', 'sMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l52 = { mis, SPEED, Trace, Corr, Clip, Steps, Snap, LOOP_ANIM, L52 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
