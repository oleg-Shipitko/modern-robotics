/* =====================================================================
   ui-l63.js — урок 6.3 «Управление всем телом».
   0) анимированная схема `distill`: учитель с привилегированной информацией,
      ученик с командой по частям тела (маска, как в HOVER), DAgger и работа
      на роботе с VR-шлемом;
   1) лаборатория «Фильтр записей»: прогноз по десяти записям, прогон
      учителя в симуляторе, причины отказа, темп записи;
   2) лаборатория «Режимы команд»: одна политика-генералист и специалисты
      рядом, части команды включаются по одной, смена режима на ходу;
   3) лаборатория «Поправка к симулятору»: перенос на «настоящую» Аду,
      записи, подбор параметров, дельта-модель, дообучение;
   4) таблица абляций OmniH2O с наведением; квиз.
   Ада рисуется AdaBody из shared/ada-legs.js (тот же рисунок, что в 6.1 и 6.2).
   Движок — l63/engine.js (без DOM).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface'), e2eS: HeroKit.css('--e2e-soft'), clS: HeroKit.css('--classic-soft') });
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
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
const alpha = (col, a) => Anim.kit.alpha(col, a);
/** Логический размер канваса: широкая раскладка или узкая (телефон), с пропорциями в стиле элемента. */
function fitLayout(cv, wide, narrow) {
  const n = canvasNarrow(cv, wide[0]), L = n ? narrow : wide, ar = `${L[0]} / ${L[1]}`;
  if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
  const { c, k } = HeroKit.fit(cv, L[0], L[1]);
  return { c, k, W: L[0], H: L[1], narrow: n };
}
/** Обучение генератором кусками между кадрами (runChunked из ui-core) с полоской прогресса. */
const sleep0 = () => new Promise((r) => setTimeout(r, 0));

/* =====================================================================
   Фигуры: Ада — AdaBody (shared/ada-legs.js) по позе движка; поза — { x, y — таз, th — наклон корпуса вперёд, q[9] } (q[0] не используется).
   Стопы параллельны полу: угол голеностопа для рисунка = θ − бедро + колено.
   ===================================================================== */
const Fig = (() => {
  const E = L63;
  /** Поза движка → кадр AdaBody: центр корпуса, наклон против часовой стрелки, бедро, колено, голеностоп дальней ноги, потом ближней. */
  function frame(p) {
    const s = Math.sin(p.th), c = Math.cos(p.th), h = E.B.LT / 2, q = p.q;
    return [p.x + h * s, p.y + h * c, -p.th, q[5], q[6], p.th - q[5] + q[6], q[7], q[8], p.th - q[7] + q[8], 0];
  }
  const arms = (q) => [q[1], q[2], q[3], q[4]];
  /** Ада по позе: o — параметры AdaBody.side (color, ghost, badJoints, badFeet). */
  function ada(c, X, Y, p, o) { return AdaBody.side(c, X, Y, frame(p), Object.assign({ arms: arms(p.q) }, o || {})); }
  /** Поза из кадра записи t (таз в x0, если задан). */
  function refPose(r, t, x0) { t = Math.max(0, Math.min(r.T - 1, t)); const q = r.q.subarray(t * E.NJ, t * E.NJ + E.NJ); return { x: x0 == null ? r.x[t] : x0, y: r.y[t], th: q[0], q }; }
  /** Поза из кадра прогона (frames из rollout с keep). */
  const runPose = (f, x0) => ({ x: x0 == null ? f.x : x0, y: f.y, th: f.q[0], q: f.q });
  /** Пол: заливка, линия, засечки через 0,5 м со сдвигом (камера идёт за тазом), подписи метров. */
  function floor(c, k, X, Y, W, H, x0, o) {
    o = o || {}; const P = pal(), y = Y(0);
    c.fillStyle = P.grid; c.fillRect(0, y, W, H - y);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    for (let mx = Math.ceil((x0 - 6) * 2) / 2; mx <= x0 + 6; mx += 0.5) {
      const px = X(mx); if (px < -2 || px > W + 2) continue;
      c.strokeStyle = P.line; c.beginPath(); c.moveTo(px, y); c.lineTo(px, y + (Number.isInteger(mx) ? 10 : 5)); c.stroke();
      if (o.labels && Number.isInteger(mx) && px > 18 && px < W - 18) HeroKit.label(c, k, `${mx} м`, px, y + 22 * Math.max(1, k * 0.8), { px: 10, color: P.ink3, halo: false });
    }
  }
  /** Центр масс (кружок с крестом, пунктир до пола) и опора (отрезки под стоящими стопами: зелёные — центр масс над опорой, красные — нет). */
  function comMark(c, X, Y, cx, cy, feet, ok, P) {
    c.strokeStyle = ok ? P.good : P.bad; c.lineWidth = 5; c.lineCap = 'round';
    for (const [a, b] of feet) { c.beginPath(); c.moveTo(X(a), Y(0) + 3); c.lineTo(X(b), Y(0) + 3); c.stroke(); }
    c.setLineDash([3, 3]); c.strokeStyle = P.hy; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(cx), Y(cy)); c.lineTo(X(cx), Y(0)); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(X(cx), Y(cy), 5.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.hy; c.stroke();
    c.beginPath(); c.moveTo(X(cx) - 5.5, Y(cy)); c.lineTo(X(cx) + 5.5, Y(cy)); c.moveTo(X(cx), Y(cy) - 5.5); c.lineTo(X(cx), Y(cy) + 5.5); c.stroke();
  }
  /** Центр масс и стоящие стопы по позе и касаниям (c — биты: дальняя, ближняя). */
  function comOf(p, cont) {
    const F = E.newFK(); E.fkInto(p.q, p.x, p.y, F, p.th); const cm = E.com(F), P = F.pts, feet = [];
    for (let s = 0; s < 2; s++) if ((cont >> (1 - s)) & 1) { const ax = P[14 + 4 * s]; feet.push([ax - E.B.FH, ax + E.B.FT]); }
    let lo = Infinity, hi = -Infinity; for (const [a, b] of feet) { if (a < lo) lo = a; if (b > hi) hi = b; }
    return { cx: cm[0], cy: cm[1], feet, out: cm[0] < lo ? cm[0] - lo : cm[0] > hi ? cm[0] - hi : 0, pts: P };
  }
  return { frame, ada, refPose, runPose, floor, comMark, comOf };
})();

/* =====================================================================
   0. Анимированная схема `distill`: обучение ученика у учителя с маской команды и работа на роботе.
   Цвета: синий — запись, команда и то, что измерено; фиолетовый — учитель (привилегированная информация); оранжевый — ученик и его действие.
   Подписи не мельче 10 px: широкая раскладка — от 700 px ширины карточки, узкая — до 360 px.
   ===================================================================== */
const SchemeKit = (() => {
  const E = L63;
  let rec = null;
  const walk = () => rec || (rec = E.prepRef(E.BY_ID.walkWave));
  function box(c, k, A, P, b, title, sub, col, hot, o) {
    o = o || {};
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.16 : 0.05), col, hot ? 2.2 : 1.3);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + (o.ty || 15), { px: 12, weight: 700, color: hot ? col : A.alpha(col, 0.55), halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] - (o.sy || 12), { px: 10.5, weight: 600, color: hot ? P.ink2 : P.ink3, halo: false });
  }
  const R_ = (b) => [b[0] + b[2], b[1] + b[3] / 2], L_ = (b) => [b[0], b[1] + b[3] / 2], B_ = (b) => [b[0] + b[2] / 2, b[1] + b[3]], T_ = (b) => [b[0] + b[2] / 2, b[1]];
  const M0 = 100;
  /** Ада в прямоугольнике r: таз на месте, пол у нижнего края, m пикселей на метр (контекст уменьшается вместе с толщиной линий). */
  function adaIn(c, r, p, m, o) {
    o = o || {}; const fx = r[0] + r[2] * (o.at || 0.5), fy = r[1] + r[3] - (o.floor == null ? 6 : o.floor), P = pal();
    c.save(); c.beginPath(); c.rect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); c.clip();
    c.strokeStyle = P.line; c.lineWidth = 1.2; c.beginPath(); c.moveTo(r[0] + 6, fy + 0.5); c.lineTo(r[0] + r[2] - 6, fy + 0.5); c.stroke();
    c.translate(fx, fy); c.scale(m / M0, m / M0);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    Fig.ada(c, (x) => x * M0, (y) => -y * M0, Object.assign({}, p, { x: 0 }), { color: o.color, ghost: o.ghost });
    c.restore();
  }
  /** VR-шлем: корпус и ремешок, два окуляра. */
  function headset(c, x, y, s, col, P) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2; c.strokeStyle = col; c.fillStyle = P.surf;
    c.beginPath(); c.roundRect(-18, -10, 36, 20, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-18, -2); c.quadraticCurveTo(-28, -2, -26, 8); c.moveTo(18, -2); c.quadraticCurveTo(28, -2, 26, 8); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(-8, 0, 4, 0, 7); c.arc(8, 0, 4, 0, 7); c.fill();
    c.restore();
  }
  return { walk, box, R_, L_, B_, T_, adaIn, headset };
})();

/* ---------- Схема `distill`: учитель → ученик с маской команды → работа на роботе ----------
   Обучение (0–8 с): четыре эпизода по 2 с, у каждого своя маска частей команды (биты из Bernoulli(0,5), как в HOVER); учитель видит всё тело
   и запись вперёд, его действие — метка для ученика (DAgger: ученик едет сам, учитель размечает). На роботе (8–12 с): учителя нет, команду дают
   голова и кисти оператора в VR-шлеме (режим OmniH2O), ученик тот же. */
(() => {
  const S = SchemeKit, T = 12, MASKS = [[1, 0, 1, 0, 1], [0, 1, 0, 1, 0], [1, 0, 0, 0, 1], [0, 1, 1, 0, 0]], DEPLOY = [0, 1, 0, 0, 0];
  const SLOT = ['углы рук', 'голова и кисти', 'углы ног', 'стопы', 'таз: скорость, высота'], SLOT_N = ['углы рук', 'голова, кисти', 'углы ног', 'стопы', 'таз'];
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, deploy = u >= 8, ep = Math.min(3, Math.floor(u / 2)), mask = deploy ? DEPLOY : MASKS[ep], B = g.b, n = g.narrow;
    const r = S.walk(), fr = Math.floor((u * 50) % (r.T - 1)), pose = Fig.refPose(r, fr, 0);
    const ar = (a, b2, col, lw) => A.arrow(c, a[0], a[1], b2[0], b2[1], col, lw || 1.7, 7);
    const dash = (a, b2, col) => { A.line(c, [a, [b2[0], b2[1] - 6]], col, 1.6, [5, 4]); A.arrow(c, b2[0], b2[1] - 8, b2[0], b2[1], col, 1.6, 7); };
    const lab = (txt, x, y, col, al, w) => A.lab(c, k, txt, x, y, { px: 10.5, weight: w || 650, color: col, halo: false, align: al || 'center' });
    const tch = deploy ? A.alpha(P.spr, 0.35) : P.spr;
    // запись или оператор в VR-шлеме
    if (!deploy) { S.box(c, k, A, P, B.rec, 'запись движения', n ? null : 'кадр t+1, все звенья', P.out, true); S.adaIn(c, [B.rec[0], B.rec[1] + 22, B.rec[2], B.rec[3] - (n ? 26 : 40)], pose, g.m, { ghost: true }); }
    else { S.box(c, k, A, P, B.rec, n ? 'оператор в VR-шлеме' : 'оператор в VR-шлеме', n ? null : 'голова и кисти, 3 точки', P.out, true); S.headset(c, B.rec[0] + B.rec[2] / 2, B.rec[1] + B.rec[3] / 2 + (n ? 6 : 2), n ? 1 : 1.2, P.out, P); }
    // учитель
    S.box(c, k, A, P, B.teach, deploy ? (n ? 'учителя нет' : 'учителя на роботе нет') : 'учитель', null, P.spr, !deploy);
    if (!deploy) g.tl.forEach((tx, i) => lab(tx, B.teach[0] + B.teach[2] / 2, B.teach[1] + 40 + i * 17, P.ink2, 'center', 600));
    // команда по частям тела
    S.box(c, k, A, P, B.cmd, n ? 'команда' : 'команда по частям тела', null, P.out, true);
    const x0 = B.cmd[0] + 12, y0 = B.cmd[1] + 30;
    for (let i = 0; i < 5; i++) {
      const on = !!mask[i], yy = y0 + i * g.slot;
      A.rect(c, x0, yy, 14, 14, 3, on ? P.out : P.surf, on ? P.out : P.line, 1.4);
      A.lab(c, k, (n ? SLOT_N : SLOT)[i], x0 + 22, yy + 7, { px: 10.5, weight: on ? 700 : 500, color: on ? P.ink : P.ink3, halo: false, align: 'left' });
    }
    lab(deploy ? (n ? 'с VR-шлема' : 'маска режима OmniH2O') : (n ? `эпизод ${ep + 1}` : `маска эпизода ${ep + 1}`), B.cmd[0] + B.cmd[2] / 2, B.cmd[1] + B.cmd[3] - 11, P.ink3, 'center', 600);
    // ученик и Ада
    S.box(c, k, A, P, B.stu, 'ученик', n ? 'датчики Ады и команда' : 'датчики Ады и команда с маской', P.mot, true);
    lab('сеть 80 → 64 → 64 → 9', B.stu[0] + B.stu[2] / 2, B.stu[1] + B.stu[3] / 2 + 1, P.mot, 'center', 600);
    S.box(c, k, A, P, B.sim, deploy ? 'настоящая Ада' : 'Ада в симуляторе', null, P.ink2, true);
    S.adaIn(c, [B.sim[0], B.sim[1] + 22, B.sim[2], B.sim[3] - 24], Object.assign({}, pose, { th: pose.th + 0.03 * Math.sin(u * 2.1) }), g.m, { color: P.mot });
    // стрелки
    const R_ = S.R_, L_ = S.L_, B_ = S.B_, T_ = S.T_;
    if (!n) {
      if (!deploy) { ar([R_(B.rec)[0] + 2, B.rec[1] + 62], [L_(B.teach)[0] - 2, B.rec[1] + 62], tch, 1.6); lab('вся запись', (R_(B.rec)[0] + L_(B.teach)[0]) / 2, B.rec[1] + 50, tch); }
      ar([B_(B.rec)[0], B_(B.rec)[1] + 2], [T_(B.cmd)[0], T_(B.cmd)[1] - 2], P.out); lab(deploy ? 'три точки' : 'части кадра', B_(B.rec)[0] + 10, (B_(B.rec)[1] + T_(B.cmd)[1]) / 2, P.out, 'left');
      const yS = B.stu[1] + B.stu[3] / 2;
      ar([R_(B.cmd)[0] + 2, yS], [L_(B.stu)[0] - 2, yS], P.out); lab('по маске', (R_(B.cmd)[0] + L_(B.stu)[0]) / 2, yS - 11, P.out);
      ar([R_(B.stu)[0] + 2, yS], [L_(B.sim)[0] - 2, yS], P.mot, 2.2); lab('действие', (R_(B.stu)[0] + L_(B.sim)[0]) / 2, yS - 12, P.mot); lab('ученика', (R_(B.stu)[0] + L_(B.sim)[0]) / 2, yS + 13, P.mot);
      // датчики Ады — ученику
      const xs = B_(B.sim)[0], yb = Math.max(B_(B.sim)[1], B_(B.stu)[1]) + 16, xu = B_(B.stu)[0] + 40;
      A.line(c, [[xs, B_(B.sim)[1] + 2], [xs, yb], [xu, yb]], P.out, 1.4); A.arrow(c, xu, yb, xu, B_(B.stu)[1] + 2, P.out, 1.4, 7);
      lab('датчики Ады', (xs + xu) / 2, yb + 11, P.out);
      if (!deploy) {
        // всё состояние Ады — учителю; действие учителя — метка ученику
        const yt = B.teach[1] + 90; A.line(c, [[T_(B.sim)[0], B.sim[1] - 2], [T_(B.sim)[0], yt], [R_(B.teach)[0] + 8, yt]], P.spr, 1.4); A.arrow(c, R_(B.teach)[0] + 8, yt, R_(B.teach)[0] + 2, yt, P.spr, 1.4, 7);
        lab('всё состояние', (T_(B.sim)[0] + R_(B.teach)[0]) / 2 + 6, yt - 11, P.spr);
        const xl = B_(B.teach)[0]; dash([xl, B_(B.teach)[1] + 2], [xl, B.stu[1] - 2], P.spr);
        lab('действие учителя — метка', xl - 8, (B_(B.teach)[1] + B.stu[1]) / 2, P.spr, 'right');
      }
    } else {
      const g1 = (B_(B.rec)[1] + B.cmd[1]) / 2;
      ar([B.cmd[0] + B.cmd[2] / 2, B_(B.rec)[1] + 2], [B.cmd[0] + B.cmd[2] / 2, B.cmd[1] - 2], P.out); lab(deploy ? 'три точки' : 'части кадра', B.cmd[0] + B.cmd[2] / 2 + 8, g1, P.out, 'left');
      if (!deploy) { ar([B.teach[0] + B.teach[2] / 2, B_(B.rec)[1] + 2], [B.teach[0] + B.teach[2] / 2, B.teach[1] - 2], tch, 1.6); lab('вся запись', B.teach[0] + B.teach[2] / 2 + 8, g1, tch, 'left'); }
      const g2 = (B_(B.cmd)[1] + B.stu[1]) / 2;
      ar([B.cmd[0] + B.cmd[2] / 2, B_(B.cmd)[1] + 2], [B.cmd[0] + B.cmd[2] / 2, B.stu[1] - 2], P.out);
      if (!deploy) { const xl = B.teach[0] + B.teach[2] / 2; dash([xl, B_(B.teach)[1] + 2], [xl, B.stu[1] - 2], P.spr); lab('метка', xl + 8, g2, P.spr, 'left'); }
      const g3 = (B_(B.stu)[1] + B.sim[1]) / 2, xa = B.stu[0] + 110;
      ar([xa, B_(B.stu)[1] + 2], [xa, B.sim[1] - 2], P.mot, 2.2); lab('действие ученика', xa + 10, g3, P.mot, 'left');
    }
    const cc = deploy ? (n ? ['На роботе учителя нет:', 'команда — голова и кисти'] : ['На роботе учителя нет. Команду дают голова и кисти оператора', 'в VR-шлеме, остальные части маски выключены'])
      : (n ? ['Ученик едет сам, учитель', 'размечает его шаги (DAgger)'] : ['Обучение: у каждого эпизода своя маска частей команды. Ученик', 'едет сам, а учитель размечает его шаги своим действием (DAgger)']);
    A.lab(c, k, cc[0], g.cap[0], g.cap[1], { px: 12, weight: 700, color: P.ink, halo: false, align: 'left' });
    A.lab(c, k, cc[1], g.cap[0], g.cap[1] + 18, { px: 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  const WIDE = { narrow: false, m: 58, slot: 22, tl: ['видит все звенья и скорости', 'и всю запись вперёд', 'знает модель тела и массы'],
    b: { rec: [16, 14, 180, 124], teach: [266, 14, 200, 124], cmd: [16, 182, 180, 156], stu: [266, 194, 200, 100], sim: [536, 182, 168, 124] }, cap: [16, 376] };
  const NARROW = { narrow: true, m: 54, slot: 21, tl: ['видит всё тело', 'и всю запись', 'знает массы'],
    b: { rec: [14, 12, 332, 100], cmd: [14, 146, 176, 150], teach: [200, 146, 146, 150], stu: [14, 336, 332, 76], sim: [14, 456, 332, 116] }, cap: [12, 604] };
  Anim.add('distill', {
    W: 720, H: 420, start: 1.0, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 640, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   1. Лаборатория «Фильтр записей»: десять записей, прогноз читателя, прогон учителя с привилегированной информацией в симуляторе,
   причина отказа на сцене (центр масс и опора, суставы на пределе), темп записи.
   ===================================================================== */
const Filter = (() => {
  const E = L63, K = HeroKit;
  const IDS = ['arabesque', 'pistol', 'kneeLift', 'lunge', 'kickSlow', 'kickFast', 'bowFast', 'sprint', 'backbend', 'reachFar'];
  const CAUSE = { ok: 'повторяет', 'com+': 'центр масс за носками', 'com-': 'центр масс за пятками', speed: 'опорная нога не успевает', torque: 'приводу не хватает момента' };
  const CAUSE_LONG = { 'com+': 'центр масс ушёл за носки, и Ада падает вперёд', 'com-': 'центр масс ушёл за пятки, и Ада падает назад', speed: 'суставы опорной ноги упираются в предел скорости, и тело отстаёт от записи', torque: 'приводы ноги в воздухе на пределе момента, и стопа отстаёт от записи' };
  const WHO = ['голова', 'кисть дальней руки', 'кисть ближней руки', 'стопа дальней ноги', 'стопа ближней ноги'];
  const st = { sel: 'arabesque', pred: {}, checked: false, speed: 1, t: 0, hold: false, cache: {} };
  let ctl = null;
  const nameOf = (id) => E.BY_ID[id].name;
  const res = (id, sp) => { const k = id + '@' + (sp || 1); return st.cache[k] || (st.cache[k] = E.check(E.prepRef(E.BY_ID[id], sp || 1))); };
  const cur = () => (st.checked ? res(st.sel, st.speed) : null);
  /** Сводка прогона по всем записям в темпе 1×. */
  function summary() { const all = IDS.map((id) => res(id, 1)); return { all, bad: all.filter((r) => !r.ok), kin: all.filter((r) => r.kinCom > 0.25).map((r) => r.id), hits: IDS.filter((id) => st.pred[id] != null && st.pred[id] === (res(id, 1).ok ? 1 : 0)).length }; }
  const W = 640, H = 300, SC = 150;
  function drawScene() {
    const cv = $('#fCv'), L = fitLayout(cv, [640, 300], [360, 300]), { c, k, narrow } = L, Wc = L.W, Hc = L.H, P = pal(), FLOOR = Hc - 44;
    c.fillStyle = P.bg; c.fillRect(0, 0, Wc, Hc);
    const r = E.prepRef(E.BY_ID[st.sel], st.checked ? st.speed : 1), R = cur();
    const frames = R ? R.e.frames : null, n = frames ? frames.length : r.T, idx = Math.floor((st.t * E.FPS) % (n + 25)), i = Math.min(idx, n - 1);
    const pose = R ? Fig.runPose(frames[i]) : Fig.refPose(r, i), camX = pose.x, X = (x) => Wc * 0.45 + (x - camX) * SC, Y = (y) => FLOOR - y * SC;
    Fig.floor(c, k, X, Y, Wc, Hc, camX, { labels: true });
    const t1 = 6 + 9 * Math.max(1, k);
    if (!R) {
      Fig.ada(c, X, Y, pose, { ghost: true });
      K.label(c, k, narrow ? 'запись: ' + nameOf(st.sel) : 'запись: ' + nameOf(st.sel) + ' (кадры записи без физики)', 8, t1, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
      K.label(c, k, narrow ? 'прогноз отметь в карточках' : 'отметь прогноз в карточках записей и нажми кнопку миссии', 8, t1 + 16 * Math.max(1, k), { px: 11, weight: 600, color: P.ink2, align: 'left', haloColor: P.bg });
      return L;
    }
    const f = frames[i], ghost = Fig.refPose(r, Math.min(r.T - 1, i), pose.x), cm = Fig.comOf(pose, f.c), okCom = Math.abs(cm.out) <= E.CFG.BAL_MARGIN;
    Fig.ada(c, X, Y, ghost, { ghost: true });
    Fig.comMark(c, X, Y, cm.cx, cm.cy, cm.feet, okCom, P);
    // суставы на пределе: кольца (ноги — у AdaBody, руки — свои)
    const lim = f.sat | f.rate, bad = [], an = f.an;
    if (lim & 1) bad.push(an ? 5 : 2); if (lim & (1 << 5)) bad.push(0); if (lim & (1 << 6)) bad.push(1); if (lim & (1 << 7)) bad.push(3); if (lim & (1 << 8)) bad.push(4);
    const Pp = Fig.ada(c, X, Y, pose, { badJoints: bad });
    if (lim & 0b11110) { c.strokeStyle = P.bad; c.lineWidth = 2.4; const sh = cm.pts; for (const [bit, pi] of [[1, 1], [2, 2], [3, 1], [4, 4]]) if (lim & (1 << bit)) { c.beginPath(); c.arc(X(sh[2 * pi]), Y(sh[2 * pi + 1]), 8, 0, 7); c.stroke(); } }
    const fell = R.e.fall && i >= n - 1;
    if (fell) K.cross(c, X(pose.x) + 40, Y(0.95), 9, P.bad, 3);
    const tt = Math.min(i, n - 1) / E.FPS, verdict = R.ok ? '✓ повторяет' : '✗ ' + CAUSE[R.cause];
    K.label(c, k, (narrow ? '' : 'учитель в симуляторе: ') + nameOf(st.sel) + (st.speed !== 1 ? ` · темп ${fmt(st.speed, 1)}×` : ''), 8, t1, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    K.label(c, k, `t = ${fmt(tt, 1)} с · ${verdict}`, 8, t1 + 16 * Math.max(1, k), { px: 11, weight: 650, color: R.ok ? P.good : P.bad, align: 'left', haloColor: P.bg });
    const cmTxt = okCom ? 'центр масс над опорой' : cm.out > 0 ? `центр масс за носками на ${fmt(cm.out * 100, 1)} см` : `центр масс за пятками на ${fmt(-cm.out * 100, 1)} см`;
    K.label(c, k, cmTxt, 8, t1 + 32 * Math.max(1, k), { px: 11, weight: 650, color: okCom ? P.good : P.bad, align: 'left', haloColor: P.bg });
    void Pp;
    return L;
  }
  function chips() {
    const box = $('#fGrid'); if (!box) return;
    box.innerHTML = IDS.map((id) => { const R = st.checked ? res(id, 1) : null, p = st.pred[id];
      return `<div class="f-chip${st.sel === id ? ' sel' : ''}${R ? (R.ok ? ' ok' : ' no') : ''}" data-id="${id}"><button type="button" class="f-name" data-act="sel">${nameOf(id)}</button>`
        + (R ? `<span class="f-res">${R.ok ? '✓' : '✗'} ${CAUSE[R.cause]}${p != null ? (p === (R.ok ? 1 : 0) ? ' · прогноз верный' : ' · прогноз неверный') : ''}</span>`
          : `<span class="f-pred"><button type="button" data-act="p1" aria-pressed="${p === 1}">повторит</button><button type="button" data-act="p0" aria-pressed="${p === 0}">не повторит</button></span>`) + '</div>'; }).join('');
  }
  function readout() {
    if (!st.checked) { const n = Object.keys(st.pred).length; setOut($('#fOut'), `Прогноз отмечен для ${n} из ${IDS.length} записей. Нажми на название записи, чтобы посмотреть её кадры на сцене.`); return; }
    const R = cur(), e = R.e;
    let s = `<b>${nameOf(st.sel)}</b>${st.speed !== 1 ? ` в темпе ${fmt(st.speed, 1)}×` : ''}: `;
    if (R.ok) s += `учитель повторяет запись, наибольшее отклонение точки тела ${fmt(e.maxP, 1)} см (${WHO[e.whoP]}).`;
    else if (e.fall) s += `${CAUSE_LONG[R.cause]} на ${fmt(e.tFall, 2)} с.`;
    else s += `${CAUSE_LONG[R.cause]}: ${WHO[e.whoP]} уходит от записи на ${fmt(e.maxP, 1)} см на ${fmt(e.tP / E.FPS, 2)} с.`;
    const S = summary(); s += ` Всего не прошли ${S.bad.length} из ${IDS.length} записей.`;
    setOut($('#fOut'), s);
  }
  function render() {
    drawScene(); chips(); readout();
    const sl = $('#fSpeed'); sl.value = Math.round(st.speed * 100); syncRange(sl, `${fmt(st.speed, 1)}×`);
  }
  function state() { const R = cur(); return { sel: st.sel, speed: st.speed, checked: st.checked, marked: Object.keys(st.pred).length, n: IDS.length, ok: R ? R.ok : null, cause: R ? R.cause : null, R }; }
  const api = {
    reset() { st.sel = 'arabesque'; st.pred = {}; st.checked = false; st.speed = 1; render(); },
    state, render, st, res, summary, IDS, CAUSE,
    async runAll() { if (Object.keys(st.pred).length < IDS.length) return { incomplete: true, marked: Object.keys(st.pred).length }; IDS.forEach((id) => res(id, 1)); st.checked = true; st.speed = 1; st.t = 0; render(); return Object.assign({ incomplete: false, marked: IDS.length }, summary()); },
    async show(id) { st.sel = id; st.speed = 1; st.t = 0; render(); if (ctl) ctl.update(); return Object.assign({ shown: true }, state(), { R: res(id, 1) }); },
    predict(id, v) { st.pred[id] = v; render(); if (ctl) ctl.update(); },
  };
  const tw = (id) => res(id, 1);
  const missions = [
    { short: 'Прогноз', title: 'Какие записи Ада повторит', text: 'Все десять записей прошли ретаргетинг третьим способом из урока 6.2, поэтому суставы в пределах, а стопы стоят на полу. Отметь в карточках записей, какие из них Ада сможет повторить. Проверять будет учитель с привилегированной информацией: он знает модель тела Ады и всю запись вперёд и в симуляторе повторяет записи лучше любой политики на датчиках. Запись не проходит, если Ада падает или голова, кисть либо стопа уходит от записи дальше чем на 20 см.',
      action: { label: 'Прогнать учителя по всем записям', run: (X) => X.runAll() },
      criteria: [{ label: 'Прогноз отмечен для всех десяти записей', test: (r) => r && !r.incomplete }, { label: 'Учитель прогнан по всем записям', test: (r) => r && r.bad && r.bad.length > 0 }],
      fail: (r) => `Отмечено ${r.marked} из 10. Отметь прогноз для каждой записи, чтобы было с чем сравнить итог.`,
      explain: (r) => `Не прошли ${r.bad.length} записей из 10: ${r.bad.map((x) => `«${nameOf(x.id)}» (${CAUSE[x.cause]})`).join(', ')}. Прогноз совпал в ${r.hits} из 10. Кинематическая проверка из урока 6.2, центр масс над опорой в кадрах записи, отсеяла бы ${r.kin.map((id) => `«${nameOf(id)}»`).join(', ')}, но вместе с бегом и обычную ходьбу: при ходьбе центр масс выходит за опору между шагами. Резкий удар и резкий поклон в кадрах выглядят безобидно, а моменты и скорости приводов проверяет только физика. «Ласточка» и «присесть на одной ноге» выглядят труднее, но проходят. Нажимай на названия, чтобы посмотреть каждую запись.` },
    { short: 'Поклон', title: 'Почему не получается резкий поклон', text: 'Резкий поклон наклоняет корпус на 46° за 0,15 с. Посмотри, как его повторяет учитель. Красные кольца на сцене отмечают суставы на пределе, а отрезки под стопами показывают опору.',
      bet: { q: 'что мешает Аде повторить резкий поклон?', options: ['Центр масс уходит за носки: корпус наклоняется слишком далеко', 'Суставы опорной ноги не успевают: бедро поворачивается не быстрее своего предела скорости, и корпус отстаёт от записи', 'Ногам не хватает момента удержать корпус'], answer: (r) => (r.R.cause === 'speed' ? 1 : r.R.cause === 'com+' ? 0 : 2) },
      action: { label: 'Показать резкий поклон', run: (X) => X.show('bowFast') },
      criteria: [{ label: 'Запись «резкий поклон» на сцене', test: (r) => r && r.sel === 'bowFast' }, { label: 'Отказ из-за скорости суставов опорной ноги', test: (r) => r && r.R.cause === 'speed' }],
      explain: (r) => `Голова отстаёт от записи на ${fmt(r.R.e.maxP, 1)} см на ${fmt(r.R.e.tP / E.FPS, 2)} с, а центр масс всё время над опорой. Бедро опорной ноги поворачивается не быстрее ${fmt(E.CFG.RATE, 0)} рад/с, а поклону нужно больше: корпус догоняет запись, когда она уже возвращается назад. Человек в записи сделал это легко, а приводы Ады медленнее его мышц.` },
    { short: 'Прогиб', title: 'Почему Ада падает в прогибе назад', text: 'Теперь прогиб назад с поднятыми руками. Учитель может наклонить голеностоп и сместить тело над стопами, но только в пределах угла голеностопа.',
      bet: { q: 'почему Ада не повторяет прогиб?', options: ['Не хватает скорости: прогиб слишком быстрый', 'Центр масс уходит за пятки, и наклоном голеностопа его не вернуть, не исказив позу', 'Колено упирается в предел'], answer: (r) => (r.R.cause === 'com-' ? 1 : r.R.cause === 'speed' ? 0 : 2) },
      action: { label: 'Показать прогиб назад', run: (X) => X.show('backbend') },
      criteria: [{ label: 'Запись «прогнуться назад» на сцене', test: (r) => r && r.sel === 'backbend' }, { label: 'Отказ из-за центра масс', test: (r) => r && (r.R.cause === 'com-' || r.R.cause === 'com+') }],
      explain: (r) => `Ада падает на ${fmt(r.R.e.tFall, 2)} с: центр масс уходит за пятки, хотя суставы в пределах и скорости хватает. В кадрах записи центр масс за опорой ${fmt(E.prepRef(E.BY_ID.backbend).margT, 1)} с из ${fmt(E.prepRef(E.BY_ID.backbend).dur, 1)} с, это видно и без физики. Такую запись не исправит и меньший темп: равновесию всё равно, как быстро поза достигнута.` },
    { short: 'Темп', title: 'Поможет ли замедление?', text: 'Ползунок меняет темп записи на сцене: 0,5× значит, что запись идёт вдвое медленнее. Найди самый быстрый темп, в котором Ада повторяет резкий поклон.', controls: ['speed'],
      onEnter: () => { st.sel = 'bowFast'; st.t = 0; render(); },
      criteria: [{ label: 'На сцене резкий поклон', test: (r, s) => s.sel === 'bowFast' }, { label: 'В этом темпе поклон проходит', test: (r, s) => s.sel === 'bowFast' && s.ok === true }, { label: 'Быстрее этого темпа поклон уже не проходит', test: (r, s) => s.sel === 'bowFast' && s.ok === true && !res('bowFast', Math.round((s.speed + 0.1) * 10) / 10).ok }],
      explain: (r) => `В темпе ${fmt(r.speed, 1)}× поклон проходит, наибольшее отклонение ${fmt(r.R.e.maxP, 1)} см, а в темпе ${fmt(r.speed + 0.1, 1)}× уже нет. С резким ударом ногой так же: он проходит с темпа ${fmt(slowestOk('kickFast'), 1)}×. Прогиб назад не проходит ни в каком темпе. H2O записи не правит, а выбрасывает: из 10 тысяч записей после фильтра осталось около 8,5 тысячи.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай запись в карточках и темп ползунком. Найди запись, которую кинематическая проверка пропустила бы, а учитель в симуляторе нет, и найди темп, в котором Ада проходит бег.', final: true, controls: ['speed'] },
  ];
  /** Наибольший темп (шаг 0,1), в котором запись проходит. */
  function slowestOk(id) { for (let s = 10; s >= 4; s--) if (res(id, s / 10).ok) return s / 10; return null; }
  function init() {
    $('#fGrid').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const id = b.closest('.f-chip').dataset.id, act = b.dataset.act;
      if (act === 'sel') { st.sel = id; st.t = 0; if (!st.checked) st.speed = 1; render(); if (ctl) ctl.update(); } else if (act === 'p1' || act === 'p0') api.predict(id, act === 'p1' ? 1 : 0); });
    $('#fSpeed').addEventListener('input', (e) => { st.speed = +e.target.value / 100; st.t = 0; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#fMis', missions, api, { controls: { speed: '#wrapFSpeed' }, scene: '#fCv' });
    render(); redrawOn(render);
    K.loop($('#fCv'), (dt) => { if (!st.hold) st.t += dt; drawScene(); });
    return ctl;
  }
  return { init, api, st, missions, IDS, CAUSE, slowestOk };
})();

/* =====================================================================
   2. Лаборатория «Режимы команд»: генералист (маски частей команды на обучении случайные) и специалист (один режим) рядом на одной записи,
   одна и та же команда; части команды, режимы прежних работ (таблица I HOVER), смена режима на ходу. Политики вшиты в движок.
   ===================================================================== */
const Modes = (() => {
  const E = L63, K = HeroKit;
  const PRESETS = ['exbody', 'h2o', 'omni', 'all'];
  const PNAME = { exbody: 'углы рук и таз', h2o: 'кисти и стопы', omni: 'голова и кисти', all: 'все углы и таз' };
  const PSHORT = { exbody: 'углы рук, таз', h2o: 'кисти, стопы', omni: 'голова, кисти', all: 'всё' };
  const PART = ['углы рук', 'голова и кисти', 'углы ног', 'стопы', 'таз'];
  const RECS = ['squat12', 'bow3', 'kneeLift', 'walk085', 'walk055', 'walkWave2'];
  const st = { mask: MODES_COPY('h2o'), preset: 'h2o', spec: 'h2o', rec: 'squat12', sw: null, t: 0, hold: false, shown: false, cache: {} };
  function MODES_COPY(id) { return E.MODES[id].m.slice(); }
  let ctl = null;
  const maskKey = (m) => m.join('');
  const presetOf = (m) => PRESETS.find((id) => maskKey(E.MODES[id].m) === maskKey(m)) || null;
  /** Прогон политики pol ('gen' или имя специалиста) на записи rec с маской; sw = { at, mask } — смена на ходу. Результаты — в памяти. */
  function run(pol, rec, mask, sw) {
    const key = [pol, rec, maskKey(mask), sw ? sw.at + ':' + maskKey(sw.mask) : ''].join('|');
    if (st.cache[key]) return st.cache[key];
    const r = E.prepRef(E.BY_ID[rec]), o = { keep: true }; if (sw) o.switchAt = { t: sw.at, mode: sw.mask };
    return (st.cache[key] = E.rollout(r, mask, E.ctlOf(E.policy(pol)), E.NOM, o));
  }
  const pair = () => ({ g: run('gen', st.rec, st.mask, st.sw), s: run(st.spec, st.rec, st.mask, st.sw) });
  /** Цели включённых частей команды для рисования: точки (голова, кисти, стопы) и скорость таза, относительно таза Ады. */
  function targets(r, t, mask) {
    const K2 = 2 * E.NK, t1 = Math.min(r.T - 1, t + 1), pts = [];
    if (mask[1]) for (let i = 0; i < 3; i++) pts.push([r.kp[t1 * K2 + 2 * i], r.kp[t1 * K2 + 2 * i + 1]]);
    if (mask[3]) for (let i = 3; i < 5; i++) pts.push([r.kp[t1 * K2 + 2 * i], r.kp[t1 * K2 + 2 * i + 1] + E.B.HA]);
    return { pts, v: mask[4] ? r.v[t1] : null, h: mask[4] ? r.y[t1] : null };
  }
  function half(c, k, P, X0, Wh, Hc, FLOOR, e, r, mask, title, col, narrow) {
    const SC = narrow ? 110 : 125, n = e.frames.length, idx = Math.floor((st.t * E.FPS) % (n + 25)), i = Math.min(idx, n - 1), f = e.frames[i];
    const pose = Fig.runPose(f), X = (x) => X0 + Wh * 0.5 + (x - pose.x) * SC, Y = (y) => FLOOR - y * SC;
    c.save(); c.beginPath(); c.rect(X0, 0, Wh, Hc); c.clip();
    Fig.floor(c, k, X, Y, X0 + Wh, Hc, pose.x);
    const m = st.sw && i >= st.sw.at ? st.sw.mask : mask;
    Fig.ada(c, X, Y, Fig.refPose(r, i, pose.x), { ghost: true });
    Fig.ada(c, X, Y, pose, { color: col });
    const T = targets(r, i, m);
    c.lineWidth = 2; c.strokeStyle = P.hy; for (const [x, y] of T.pts) { c.beginPath(); c.arc(X(pose.x + x), Y(y), 5, 0, 7); c.stroke(); }
    if (T.v != null) { const y = Y(T.h + 0.62), x = X(pose.x); Anim.kit.arrow(c, x, y, x + Math.max(6, T.v * 46), y, P.hy, 2.4, 7); }
    if (e.fall && i >= n - 1) K.cross(c, X(pose.x) + 34, Y(0.9), 9, P.bad, 3);
    c.restore();
    const t1 = 6 + 9 * Math.max(1, k);
    K.label(c, k, title, X0 + 8, t1, { px: 12, weight: 700, color: col, align: 'left', haloColor: P.bg });
    K.label(c, k, narrow ? `ошибка ${fmt(e.errK, 1)} см${e.fall ? ', упала' : ''}` : `ошибка точек ${fmt(e.errK, 1)} см${e.fall ? ', упала' : ''}`, X0 + Wh / 2, FLOOR + 26, { px: 10.5, weight: 650, color: e.fall ? P.bad : P.ink2, haloColor: P.grid });
  }
  function drawScene() {
    const cv = $('#mCv'), L = fitLayout(cv, [640, 300], [360, 300]), { c, k, narrow } = L, Wc = L.W, Hc = L.H, P = pal(), FLOOR = Hc - 46;
    c.fillStyle = P.bg; c.fillRect(0, 0, Wc, Hc);
    if (!st.shown) { Fig.floor(c, k, (x) => Wc / 2 + x * 120, (y) => FLOOR - y * 120, Wc, Hc, 0); K.label(c, k, 'нажми кнопку миссии', Wc / 2, FLOOR / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.bg }); return L; }
    const r = E.prepRef(E.BY_ID[st.rec]), { g, s } = pair();
    half(c, k, P, 0, Wc / 2, Hc, FLOOR, g, r, st.mask, 'генералист', P.e2e, narrow);
    half(c, k, P, Wc / 2, Wc / 2, Hc, FLOOR, s, r, st.mask, narrow ? 'специалист' : `специалист: ${PNAME[st.spec]}`, P.cl, narrow);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(Wc / 2, 0); c.lineTo(Wc / 2, Hc); c.stroke();
    return L;
  }
  const partsTxt = (m) => PART.filter((_, i) => m[i]).join(', ') || 'ничего';
  function readout() {
    if (!st.shown) { setOut($('#mOut'), 'Нажми кнопку миссии: генералист и специалист повторят одну и ту же новую запись по одной и той же команде.'); return; }
    const { g, s } = pair(), pr = presetOf(st.mask), mt = (e) => `ошибка точек ${fmt(e.errK, 1)} см (голова и кисти ${fmt(e.part.upK, 1)} см, стопы ${fmt(e.part.footK, 1)} см, углы ног ${fmt(e.part.legJ, 0)}°, высота таза ${fmt(e.part.h, 1)} см)${e.fall ? `, упала на ${fmt(e.tFall, 1)} с` : ''}`;
    setOut($('#mOut'), `Запись «${E.BY_ID[st.rec].name}», команда: ${partsTxt(st.mask)}${pr ? ` (режим «${PNAME[pr]}»)` : ''}${st.sw ? `, на ${fmt(st.sw.at / E.FPS, 1)} с — ${partsTxt(st.sw.mask)}` : ''}. <b>Генералист</b>: ${mt(g)}. <b>Специалист «${PNAME[st.spec]}»</b>: ${mt(s)}.`);
  }
  function controls() {
    segSet('#mPreset', presetOf(st.mask) || ''); segSet('#mSpec', st.spec); segSet('#mRec', st.rec);
    $$('#mParts button').forEach((b, i) => b.setAttribute('aria-pressed', String(!!st.mask[i])));
    segSet('#mSw', st.sw ? 'on' : 'off');
  }
  function render() { drawScene(); controls(); readout(); }
  function state() { const p = st.shown ? pair() : null; return { mask: st.mask.slice(), preset: presetOf(st.mask), spec: st.spec, rec: st.rec, sw: st.sw, shown: st.shown, g: p && p.g, s: p && p.s }; }
  function set(o) { if (o.preset) st.mask = MODES_COPY(o.preset); if (o.mask) st.mask = o.mask.slice(); if (o.spec) st.spec = o.spec; if (o.rec) st.rec = o.rec; if ('sw' in o) st.sw = o.sw; st.shown = true; st.t = 0; render(); if (ctl) ctl.update(); return state(); }
  const api = {
    reset() { st.mask = MODES_COPY('h2o'); st.spec = 'h2o'; st.rec = 'squat12'; st.sw = null; st.shown = false; render(); },
    state, render, st, run, set, PNAME,
  };
  const missions = [
    { short: 'Свой режим', title: 'Специалист в своём режиме', text: 'Генералист учился с маской частей команды, которую в каждом эпизоде выбирали случайно, как в HOVER. Специалист «кисти и стопы» учился только в этом режиме, как H2O. Учитель, учебные записи и число эпизодов у них одни. Обе политики повторяют новую запись, которой не было в обучении: Ада приседает и вытягивает руки вперёд.',
      bet: { q: 'кто точнее повторит новую запись в режиме «кисти и стопы»?', options: ['Генералист: он видел больше разных команд', 'Специалист: вся его сеть училась только этому режиму', 'Одинаково: учитель у них один'], answer: (r) => (Math.abs(r.g.errK - r.s.errK) < 0.2 ? 2 : r.s.errK < r.g.errK ? 1 : 0) },
      action: { label: 'Запустить обоих в режиме «кисти и стопы»', run: (X) => X.set({ preset: 'h2o', spec: 'h2o', rec: 'squat12', sw: null }) }, controls: ['preset'],
      criteria: [{ label: 'Обе политики повторяют запись без падения', test: (r) => r && !r.g.fall && !r.s.fall }],
      explain: (r) => `Ошибка точек у специалиста ${fmt(r.s.errK, 1)} см, у генералиста ${fmt(r.g.errK, 1)} см. Сеть у них одного размера, но генералисту она нужна для всех сочетаний частей команды, а специалисту только для одного. У HOVER вышло наоборот: генералист обогнал специалистов, но их учили с подкреплением с нуля, а не по одному учителю. Авторы HOVER сами показывают, что выигрыш даёт дистилляция из учителя: даже на одном режиме она лучше обучения с подкреплением.` },
    { short: 'Чужой режим', title: 'Команда, которой специалист не видел', text: 'Та же запись и тот же специалист «кисти и стопы», но команда теперь в другом виде, как у ExBody: углы суставов рук и скорость, высота и наклон таза, а положений кистей и стоп нет.',
      bet: { q: 'что сделает специалист «кисти и стопы» с такой командой?', options: ['Справится: команда описывает то же движение', 'Не справится: таких частей команды он не видел, а нужных ему точек в ней нет', 'Сразу упадёт'], answer: (r) => (r.s.fall && r.s.tFall < 0.5 ? 2 : r.s.errK > 3 * r.g.errK ? 1 : 0) },
      action: { label: 'Подать команду «углы рук и таз»', run: (X) => X.set({ preset: 'exbody', spec: 'h2o', rec: 'squat12', sw: null }) }, controls: ['preset'],
      criteria: [{ label: 'Ошибка специалиста хотя бы втрое больше, чем у генералиста', test: (r) => r && r.s.errK > 3 * r.g.errK }],
      explain: (r) => `Ошибка точек у специалиста ${fmt(r.s.errK, 1)} см${r.s.fall ? ', и он падает' : ''}, у генералиста ${fmt(r.g.errK, 1)} см. Нули на месте точек специалист понимает как «кисти и стопы у таза», а углы рук ему ни о чём не говорят. Каждому интерфейсу пришлось бы учить свою политику, а генералист один работает со всеми четырьмя режимами из таблицы прежних работ.` },
    { short: 'Без ног', title: 'Что не задано командой', text: 'Режим «голова и кисти», как у OmniH2O с VR-шлемом: в команде только три точки, а ноги и таз не заданы. В записи неглубокий поклон с руками вперёд, колени в ней согнуты, а таз опущен.', controls: ['preset'],
      bet: { q: 'что будет с ногами генералиста, если задать только голову и кисти?', options: ['Повторят запись: по голове и кистям поза восстанавливается однозначно', 'Политика выберет позу ног сама: голова и кисти встанут на место, а колени и таз — нет', 'Ноги останутся прямыми и неподвижными'], answer: (r) => (r.g.part.upK < 6 && r.g.part.legJ > 10 ? 1 : r.g.part.legJ <= 10 ? 0 : 2) },
      action: { label: 'Подать команду «голова и кисти»', run: (X) => X.set({ preset: 'omni', spec: 'omni', rec: 'bow3', sw: null }) },
      criteria: [{ label: 'Голова и кисти ближе 6 см к записи', test: (r) => r && r.g.part.upK < 6 }, { label: 'Углы ног расходятся с записью больше чем на 10°', test: (r) => r && r.g.part.legJ > 10 }],
      explain: (r) => `У генералиста голова и кисти в среднем в ${fmt(r.g.part.upK, 1)} см от записи, а углы ног расходятся на ${fmt(r.g.part.legJ, 0)}° и таз на ${fmt(r.g.part.h, 1)} см выше или ниже, чем в записи. Наклониться так, чтобы голова и кисти встали на место, можно разными позами ног, и политика выбирает свою. Для VR-шлема это и нужно: оператор управляет руками, а равновесие и ноги остаются политике.` },
    { short: 'На ходу', title: 'Смена режима на ходу', text: 'Ходьба 0,85 м/с. Первые 1,5 с команда задана, как у ExBody, углами рук и скоростью таза, а потом переключается на «кисти и стопы», как у H2O. Так авторы HOVER переключали режимы на роботе прямо во время ходьбы. Специалисту «углы рук и таз» после смены достаются части команды, которых он не знает.', controls: ['preset'],
      bet: { q: 'что будет с генералистом после смены режима?', options: ['Споткнётся: в момент смены у него другая задача', 'Продолжит идти: сеть та же, поменялись только биты маски', 'Остановится и будет ждать'], answer: (r) => (r.g.fall ? 0 : r.g.errK < 5 ? 1 : 2) },
      action: { label: 'Пройти со сменой режима', run: (X) => X.set({ preset: 'exbody', spec: 'exbody', rec: 'walk085', sw: { at: 75, mask: E.MODES.h2o.m.slice() } }) },
      criteria: [{ label: 'Генералист проходит запись без падения', test: (r) => r && !r.g.fall }, { label: 'Ошибка генералиста меньше 5 см', test: (r) => r && r.g.errK < 5 }],
      explain: (r) => `Генералист проходит всю запись с ошибкой точек ${fmt(r.g.errK, 1)} см. Специалист «углы рук и таз» после смены получает кисти и стопы вместо углов и скорости, и его ошибка ${fmt(r.s.errK, 1)} см${r.s.fall ? ', а потом он падает' : ''}. Выбирать режим на роботе в HOVER пока должен человек: автоматическое переключение авторы называют будущей работой.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Включай и выключай части команды по одной, выбирай запись и специалиста, включай смену режима на 1,5 с. Найди две части команды, с которыми генералист повторяет подъём колена с руками вверх почти так же точно, как в режиме «все углы и таз».', final: true, controls: ['preset', 'parts', 'spec', 'rec', 'sw'] },
  ];
  function init() {
    segBind('#mPreset', (v) => set({ preset: v }));
    segBind('#mSpec', (v) => set({ spec: v }));
    segBind('#mRec', (v) => set({ rec: v }));
    segBind('#mSw', (v) => set({ sw: v === 'on' ? { at: 75, mask: presetOf(st.mask) === 'h2o' ? E.MODES.exbody.m.slice() : E.MODES.h2o.m.slice() } : null }));
    $('#mParts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i, m = st.mask.slice(); m[i] = m[i] ? 0 : 1; if (!m.some((x) => x)) return; set({ mask: m }); });
    ctl = mountMissions('#mMis', missions, api, { controls: { preset: '#wrapMPreset', parts: '#wrapMParts', spec: '#wrapMSpec', rec: '#wrapMRec', sw: '#wrapMSw' }, scene: '#mCv', onStep: (i) => { if (missions[i].final && !st.shown) { st.shown = true; render(); } } });
    render(); redrawOn(render);
    K.loop($('#mCv'), (dt) => { if (!st.hold) st.t += dt; drawScene(); });
    return ctl;
  }
  return { init, api, st, missions, PRESETS, PNAME, RECS };
})();

/* =====================================================================
   3. Лаборатория «Поправка к симулятору»: политика-генералист в режиме «все углы и таз» переносится на «настоящую» Аду (тяжелее, приводы слабее,
   сдвиг нуля голеностопа, задержка команды 20 мс), записи прогонов, подбор параметров (SysID), дельта-модель действий (ASAP), дообучение
   в симуляторе с поправкой и без неё. Всё считается в браузере.
   ===================================================================== */
const Gap = (() => {
  const E = L63, K = HeroKit;
  const POLS = ['base', 'plain', 'sysid', 'asap'], PNAME = { base: 'без дообучения', plain: 'дообучена в обычном симуляторе', sysid: 'дообучена с SysID', asap: 'дообучена с дельта-моделью' };
  const PSHORT = { base: 'без дообучения', plain: 'обычный симулятор', sysid: 'SysID', asap: 'дельта-модель' }, PSHORT_N = { base: 'исходная', plain: 'обычный', sysid: 'SysID', asap: 'с дельтой' };
  const RECS = ['walk07', 'walkWave', 'walk055', 'squat', 'lunge', 'kneeLift'];
  const FT = { rounds: 8, per: 12, steps: 300 };
  const st = { pol: 'base', rec: 'walk07', view: 'real', t: 0, hold: false, busy: false, prog: 0, msg: '', data: null, sid: null, delta: null, pols: {}, evals: {} };
  let ctl = null;
  const train = () => E.setOf('train').map((m) => E.prepRef(m)), evalRefs = () => E.setOf('train').concat(E.setOf('test')).map((m) => E.prepRef(m));
  const polOf = (id) => (id === 'base' ? E.policy('gen') : st.pols[id] || null);
  /** Оценка политики на 21 записи в симуляторе и на настоящей Аде (в памяти). */
  function evalOf(id) {
    if (st.evals[id]) return st.evals[id];
    const S = polOf(id); if (!S) return null;
    const C = E.ctlOf(S), sim = E.evaluate(C, 'all', evalRefs(), E.NOM), real = E.evaluate(C, 'all', evalRefs(), E.REAL);
    return (st.evals[id] = { sim, real });
  }
  const runs = {};
  function runOf(id, W, rec) { const key = id + '|' + W.name + '|' + rec; if (runs[key]) return runs[key]; const S = polOf(id); if (!S) return null; return (runs[key] = E.rollout(E.prepRef(E.BY_ID[rec]), 'all', E.ctlOf(S), W, { keep: true })); }
  function drawHalf(c, k, P, X0, Wh, Hc, FLOOR, e, r, title, col, narrow) {
    const SC = narrow ? 110 : 125, n = e.frames.length, idx = Math.floor((st.t * E.FPS) % (n + 25)), i = Math.min(idx, n - 1), f = e.frames[i];
    const pose = Fig.runPose(f), X = (x) => X0 + Wh * 0.5 + (x - pose.x) * SC, Y = (y) => FLOOR - y * SC;
    c.save(); c.beginPath(); c.rect(X0, 0, Wh, Hc); c.clip();
    Fig.floor(c, k, X, Y, X0 + Wh, Hc, pose.x);
    Fig.ada(c, X, Y, Fig.refPose(r, i, pose.x), { ghost: true });
    Fig.ada(c, X, Y, pose, { color: col });
    if (e.fall && i >= n - 1) K.cross(c, X(pose.x) + 34, Y(0.9), 9, P.bad, 3);
    c.restore();
    const t1 = 6 + 9 * Math.max(1, k);
    K.label(c, k, title, X0 + 8, t1, { px: 12, weight: 700, color: col, align: 'left', haloColor: P.bg });
    K.label(c, k, narrow ? `ошибка ${fmt(e.errK, 1)} см` : `ошибка точек ${fmt(e.errK, 1)} см${e.ok ? '' : ' · запись сорвана'}`, X0 + Wh / 2, FLOOR + 26, { px: 10.5, weight: 650, color: e.ok ? P.ink2 : P.bad, haloColor: P.grid });
  }
  function drawScene() {
    const cv = $('#gCv'), L = fitLayout(cv, [640, 300], [360, 300]), { c, k, narrow } = L, Wc = L.W, Hc = L.H, P = pal(), FLOOR = Hc - 46;
    c.fillStyle = P.bg; c.fillRect(0, 0, Wc, Hc);
    if (!st.evals.base) { Fig.floor(c, k, (x) => Wc / 2 + x * 120, (y) => FLOOR - y * 120, Wc, Hc, 0); K.label(c, k, 'нажми кнопку миссии', Wc / 2, FLOOR / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.bg }); return L; }
    const pid = polOf(st.pol) ? st.pol : 'base', r = E.prepRef(E.BY_ID[st.rec]);
    drawHalf(c, k, P, 0, Wc / 2, Hc, FLOOR, runOf(pid, E.NOM, st.rec), r, 'в симуляторе', P.cl, narrow);
    drawHalf(c, k, P, Wc / 2, Wc / 2, Hc, FLOOR, runOf(pid, E.REAL, st.rec), r, 'настоящая Ада', P.e2e, narrow);
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(Wc / 2, 0); c.lineTo(Wc / 2, Hc); c.stroke();
    return L;
  }
  function drawChart() {
    const cv = $('#gChart'), L = fitLayout(cv, [640, 220], [380, 270]), { c, k, narrow } = L, Wc = L.W, Hc = L.H, P = pal();
    const Lm = narrow ? 40 : 46, Rm = 14, T = 44, Bm = narrow ? 52 : 46, gw = Wc - Lm - Rm, gh = Hc - T - Bm;
    c.fillStyle = P.surf; c.fillRect(0, 0, Wc, Hc);
    if (st.view === 'real') {
      const items = POLS.filter((id) => st.evals[id]), vmax = 6;
      const Y = (v) => T + gh * (1 - Math.min(1, v / vmax));
      for (const v of [0, 2, 4, 6]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(Lm, Y(v)); c.lineTo(Wc - Rm, Y(v)); c.stroke(); K.label(c, k, fmt(v, 0), Lm - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
      K.label(c, k, narrow ? 'ошибка точек, см' : 'средняя ошибка точек тела на 21 записи, см', Lm, 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
      if (!items.length) { K.label(c, k, narrow ? 'столбики появятся после миссии 1' : 'столбики появятся, когда нажмёшь кнопку первой миссии', Lm + gw / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf }); }
      const gwid = gw / POLS.length, bw = Math.min(30, gwid / 3.2);
      POLS.forEach((id, gi) => {
        const gx = Lm + gwid * gi, ev = st.evals[id];
        K.label(c, k, (narrow ? PSHORT_N : PSHORT)[id], gx + gwid / 2, Hc - Bm + 13, { px: 10, color: P.ink2, halo: false });
        if (!ev) return;
        [[ev.sim, P.cl], [ev.real, P.e2e]].forEach(([s, col], j) => { const x = gx + gwid / 2 + (j - 0.5) * (bw + 6) - bw / 2, v = s.errK; c.fillStyle = col; c.globalAlpha = 0.9; c.fillRect(x, Y(v), bw, Y(0) - Y(v)); c.globalAlpha = 1; K.label(c, k, fmt(v, 1), x + bw / 2, Y(v) - 8, { px: 10, weight: 650, color: P.ink2, haloColor: P.surf }); });
      });
      let lx = Lm + 4; c.font = `600 ${10.5 * k}px Inter, system-ui, sans-serif`;
      for (const [nm, col] of [['в симуляторе', P.cl], ['на настоящей Аде', P.e2e]]) { c.fillStyle = col; c.fillRect(lx, 30 - 5, 10, 10); K.label(c, k, nm, lx + 14, 30, { px: 10.5, color: P.ink2, align: 'left', halo: false }); lx += 14 + c.measureText(nm).width + 16; }
      K.label(c, k, narrow ? 'политика' : 'политика: какой симулятор был при дообучении', Lm + gw / 2, Hc - 12, { px: 10.5, color: P.ink3, halo: false });
    } else {
      const items = [['симулятор', st.data ? st.data.simErr : null, P.cl], ['SysID', st.sid ? st.sid.err : null, P.hy], ['дельта-модель', st.delta ? st.delta.err : null, P.e2e]], vmax = 1.6;
      const Y = (v) => T + gh * (1 - Math.min(1, v / vmax));
      for (const v of [0, 0.4, 0.8, 1.2, 1.6]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(Lm, Y(v)); c.lineTo(Wc - Rm, Y(v)); c.stroke(); K.label(c, k, fmt(v, 1), Lm - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
      K.label(c, k, narrow ? 'ошибка шага, градусы' : 'ошибка предсказания следующего шага настоящей Ады, градусы', Lm, 12, { px: 10.5, color: P.ink3, align: 'left', halo: false });
      const gwid = gw / items.length, bw = Math.min(40, gwid / 2.2);
      items.forEach(([nm, v, col], gi) => { const gx = Lm + gwid * gi, x = gx + gwid / 2 - bw / 2; K.label(c, k, nm, gx + gwid / 2, Hc - Bm + 13, { px: 10, color: P.ink2, halo: false }); if (v == null) return; c.fillStyle = col; c.globalAlpha = 0.9; c.fillRect(x, Y(v), bw, Y(0) - Y(v)); c.globalAlpha = 1; K.label(c, k, fmt(v, 2) + '°', x + bw / 2, Y(v) - 8, { px: 10, weight: 650, color: P.ink2, haloColor: P.surf }); });
      if (!st.data) K.label(c, k, narrow ? 'появится после миссии 2' : 'столбики появятся после записи прогонов в миссии 2', Lm + gw / 2, T + gh / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.surf });
      K.label(c, k, narrow ? 'чем предсказывали шаг' : 'чем предсказывали шаг: симулятор как есть, с подобранными параметрами, с поправкой', Lm + gw / 2, Hc - 12, { px: 10.5, color: P.ink3, halo: false });
    }
    return L;
  }
  function readout() {
    const pg = $('#gProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#gOut'), `${st.msg} ${Math.round(st.prog * 100)}%.`); return; }
    const parts = [];
    for (const id of POLS) { const ev = st.evals[id]; if (ev) parts.push(`<b>${PNAME[id]}</b>: в симуляторе ${fmt(ev.sim.errK, 2)} см, сорвано ${ev.sim.n - ev.sim.ok} из ${ev.sim.n}; на настоящей Аде ${fmt(ev.real.errK, 2)} см, сорвано ${ev.real.n - ev.real.ok} из ${ev.real.n}.`); }
    if (st.data) parts.push(`Предсказание шага настоящей Ады: симулятор ${fmt(st.data.simErr, 2)}°${st.sid ? `, с подобранными параметрами ${fmt(st.sid.err, 2)}°` : ''}${st.delta ? `, с дельта-моделью ${fmt(st.delta.err, 2)}°` : ''}.`);
    setOut($('#gOut'), parts.join(' ') || 'Нажми кнопку миссии: политика-генералист в режиме «все углы и таз» поедет на настоящей Аде.');
  }
  function render() { drawScene(); drawChart(); segSet('#gPol', st.pol); segSet('#gRec', st.rec); segSet('#gView', st.view); readout(); }
  async function busy(msg, gen, w0, w1) { st.busy = true; st.msg = msg; render(); let last = 0; const R = await runChunked(gen, (h) => { const now = performance.now(); st.prog = w0 + (w1 - w0) * (h.it / h.of); if (now - last > 120) { last = now; readout(); } }, 14); return R; }
  async function base() { if (!st.evals.base) { st.busy = true; st.msg = 'Прогоны на 21 записи в симуляторе и на настоящей Аде:'; st.prog = 0.5; render(); await sleep0(); evalOf('base'); st.busy = false; } st.pol = 'base'; render(); if (ctl) ctl.update(); return { ev: st.evals.base }; }
  async function collectData() {
    await base();
    if (!st.data) { st.busy = true; st.msg = 'Пятнадцать прогонов на настоящей Аде:'; st.prog = 0.1; render(); await sleep0(); const eps = E.collect(E.ctlOf(E.policy('gen')), train(), E.REAL); st.data = { eps, simErr: E.oneStep(eps, E.NOM, null) }; }
    if (!st.sid) { const R = await busy('Подбор массы, трения и жёсткости по записям:', E.sysidG(st.data.eps), 0.2, 1); st.sid = { W: R.W, err: R.err, grid: R.grid }; st.busy = false; }
    st.view = 'pred'; render(); if (ctl) ctl.update();
    return { data: st.data, sid: st.sid };
  }
  async function fitD() {
    if (!st.data) await collectData();
    if (!st.delta) { const R = await busy('Дельта-модель: поправки по записям настоящей Ады:', E.fitDeltaG(st.data.eps), 0, 1); st.delta = { C: R.C, fn: R.fn, err: E.oneStep(st.data.eps, E.NOM, R.fn) }; st.busy = false; }
    st.view = 'pred'; render(); if (ctl) ctl.update();
    return { data: st.data, sid: st.sid, delta: st.delta };
  }
  async function tune(id) {
    if (st.pols[id]) return st.pols[id];
    if (id === 'asap' && !st.delta) await fitD();
    if (id === 'sysid' && !st.sid) await collectData();
    const W = id === 'sysid' ? st.sid.W : E.NOM, delta = id === 'asap' ? st.delta.fn : null;
    const R = await busy(`Дообучение (${PSHORT[id]}):`, E.fineTune(E.policy('gen'), { W, delta, refs: train(), rounds: FT.rounds, per: FT.per, steps: FT.steps, seed: E.CFG.SEED, teachRefs: train().slice(0, 8) }), 0, 0.9);
    st.pols[id] = R.S; st.pols[id].teacher = R.teacher; st.busy = true; st.msg = 'Прогоны на 21 записи:'; st.prog = 0.95; readout(); await sleep0(); evalOf(id); st.busy = false;
    return st.pols[id];
  }
  async function tuneTwo() { await tune('asap'); await tune('plain'); st.pol = 'asap'; st.view = 'real'; render(); if (ctl) ctl.update(); return { asap: st.evals.asap, plain: st.evals.plain, base: st.evals.base, teacher: st.pols.asap.teacher, teacherPlain: st.pols.plain.teacher }; }
  function state() { return { pol: st.pol, rec: st.rec, view: st.view, busy: st.busy, evals: st.evals, data: st.data, sid: st.sid, delta: st.delta }; }
  const api = {
    reset() { st.pol = 'base'; st.rec = 'walk07'; st.view = 'real'; render(); },
    state, render, st, base, collectData, fitD, tune, tuneTwo, evalOf, PNAME,
  };
  const ankle = (C) => C[0];
  const missions = [
    { short: 'Перенос', title: 'Перенос на настоящую Аду без поправок', text: 'Генералист из лаборатории 2 в режиме «все углы и таз» повторяет 21 запись, учебные и проверочные. Настоящая Ада отличается от симулятора так, как бывает у роботов: она на 15% тяжелее, её приводы на 10% слабее, жёсткость их регуляторов на 15% ниже, трение в суставах в полтора раза больше, у голеностопа сдвинут ноль, а команда доходит до приводов с опозданием на 20 мс.',
      bet: { q: 'что будет на настоящей Аде с политикой, которая в симуляторе не падает?', options: ['Повторит так же: отличия всего на 10–15%', 'Будет повторять заметно хуже и сорвёт часть записей, хотя падать не будет', 'Упадёт на первых шагах'], answer: (r) => (r.ev.real.falls > 5 ? 2 : r.ev.real.errK > 1.3 * r.ev.sim.errK ? 1 : 0) },
      action: { label: 'Перенести политику на настоящую Аду', run: (X) => X.base() },
      criteria: [{ label: 'На настоящей Аде ошибка хотя бы в 1,3 раза больше, чем в симуляторе', test: (r) => r && r.ev.real.errK > 1.3 * r.ev.sim.errK }],
      explain: (r) => `В симуляторе средняя ошибка точек тела ${fmt(r.ev.sim.errK, 2)} см и сорвано ${r.ev.sim.n - r.ev.sim.ok} записей из 21, на настоящей Аде — ${fmt(r.ev.real.errK, 2)} см и ${r.ev.real.n - r.ev.real.ok} из 21, падений ${r.ev.real.falls}. Сильнее всего страдает ходьба: на сцене видно, как настоящая Ада отстаёт от записи и сбивает шаг. Так же было у ASAP: политика, обученная в IsaacGym, в IsaacSim и Genesis и на роботе G1 повторяла движения хуже.` },
    { short: 'Подбор', title: 'Записи и подбор параметров', text: 'Записываем 15 прогонов настоящей Ады на учебных записях: состояние, команду политики и следующее состояние на каждом шаге. Потом из каждого записанного состояния повторяем в симуляторе ту же команду и сравниваем следующий шаг с записью. Первый способ уменьшить разницу — подобрать параметры симулятора (SysID): перебрать множители массы, трения и жёсткости приводов и взять лучшие.',
      bet: { q: 'совпадёт ли симулятор с настоящей Адой, если подобрать массу, трение и жёсткость?', options: ['Да: Ада тяжелее и слабее, это и подбираем', 'Отчасти: ошибка уменьшится, но того, что мешает больше всего, в списке параметров нет', 'Нет: станет только хуже'], answer: (r) => (r.sid.err < r.data.simErr * 0.6 ? 0 : r.sid.err < r.data.simErr ? 1 : 2) },
      action: { label: 'Записать прогоны и подобрать параметры', run: (X) => X.collectData() },
      criteria: [{ label: 'С подобранными параметрами ошибка шага меньше', test: (r) => r && r.sid.err < r.data.simErr }],
      explain: (r) => `Симулятор как есть ошибается на следующем шаге в среднем на ${fmt(r.data.simErr, 2)}° по суставам. Лучшее из ${r.sid.grid.length} сочетаний даёт ${fmt(r.sid.err, 2)}°: масса ×${fmt(r.sid.W.mass, 2)}, трение ×${fmt(r.sid.W.damp, 1)}, жёсткость ×${fmt(r.sid.W.kp, 2)}. На самом деле Ада тяжелее в 1,15 раза, а трение больше в 1,5 раза: подбор объясняет расхождение тем, что есть в его списке, а задержки команды и сдвига голеностопа в списке нет. ASAP пишет о том же: SysID нужен заранее заданный набор параметров.` },
    { short: 'Поправка', title: 'Дельта-модель: поправка к команде', text: 'Второй способ, как в ASAP: ничего не угадывать, а учить по тем же записям поправку к команде. Для каждого шага ищем такую Δa, при которой симулятор из записанного состояния с командой a + Δa даёт то же, что настоящая Ада с командой a. Потом учим модель, которая предсказывает Δa по состоянию и команде. У нас она линейная по каждому суставу: в ней новая и прошлая команды, угол и скорость сустава.',
      bet: { q: 'что найдёт дельта-модель в записях настоящей Ады?', options: ['Поправку, похожую на лишнюю массу: команды надо чуть усилить', 'Что настоящая Ада выполняет прошлую команду: поправка почти отменяет новую команду и возвращает прошлую', 'Ничего устойчивого: в записях только шум'], answer: (r) => (ankle(r.delta.C)[0] < -0.7 && ankle(r.delta.C)[1] > 0.6 ? 1 : r.delta.err < r.data.simErr * 0.8 ? 0 : 2) },
      action: { label: 'Обучить дельта-модель', run: (X) => X.fitD() },
      criteria: [{ label: 'С дельта-моделью ошибка шага меньше, чем с подобранными параметрами', test: (r) => r && r.delta.err < r.sid.err }],
      explain: (r) => { const a = ankle(r.delta.C); return `С поправкой ошибка шага ${fmt(r.delta.err, 2)}° против ${fmt(r.sid.err, 2)}° у SysID и ${fmt(r.data.simErr, 2)}° у симулятора как есть. Для голеностопа поправка равна ${fmt(a[0], 2)} × новая команда + ${fmt(a[1], 2)} × прошлая + ${fmt(a[2], 2)} × угол сустава и постоянный сдвиг: новая команда почти отменяется, а прошлая возвращается. Модель сама нашла, что команда доходит до приводов с опозданием на шаг, хотя слова «задержка» в ней нет. Постоянный сдвиг ${fmt(a[4] * E.HALF[0] * 180 / Math.PI, 1)}° — это сдвиг нуля голеностопа, у настоящей Ады он ${fmt(E.REAL.ank * 180 / Math.PI, 1)}°.`; } },
    { short: 'Дообучение', title: 'Дообучить и вернуться на робота', text: 'Дообучаем политику DAgger в симуляторе с поправкой: она применяется к каждой команде, и симулятор ведёт себя как настоящая Ада. Для сравнения столько же дообучаем копию той же политики в обычном симуляторе. Учитель в каждом симуляторе тот, который в нём лучше: отвечающий на текущее состояние или сначала прогоняющий шаг вперёд. На настоящей Аде обе политики работают без поправки.',
      bet: { q: 'станет ли политика лучше на настоящей Аде, если поправку при этом не включать?', options: ['Нет: на роботе поправки нет, значит, и пользы нет', 'Да: в симуляторе с поправкой она научилась подавать команду заранее, и на роботе ошибка заметно меньше, чем после обычного дообучения', 'Станет лучше ровно настолько, насколько и после обычного дообучения'], answer: (r) => (r.asap.real.errK < r.plain.real.errK - 0.3 ? 1 : r.asap.real.errK < r.base.real.errK - 0.2 ? 2 : 0) },
      action: { label: 'Дообучить в двух симуляторах', run: (X) => X.tuneTwo() },
      criteria: [{ label: 'С поправкой на настоящей Аде ошибка меньше, чем после обычного дообучения', test: (r) => r && r.asap.real.errK < r.plain.real.errK }, { label: 'И меньше, чем без дообучения', test: (r) => r && r.asap.real.errK < r.base.real.errK }],
      explain: (r) => `На настоящей Аде ошибка политики, дообученной с поправкой, ${fmt(r.asap.real.errK, 2)} см, сорвано ${r.asap.real.n - r.asap.real.ok} записей из 21. После обычного дообучения ошибка ${fmt(r.plain.real.errK, 2)} см и сорвано ${r.plain.real.n - r.plain.real.ok} из 21, а без дообучения ошибка ${fmt(r.base.real.errK, 2)} см. В симуляторе с поправкой лучшим оказался учитель, который прогоняет шаг вперёд, а в обычном — тот, что отвечает на текущее состояние: задержку видит только симулятор с поправкой. У ASAP на роботе G1 ошибка удара ногой уменьшилась с 61,2 до 50,2 мм.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай политику и запись: на сцене одна и та же политика в симуляторе и на настоящей Аде. Сводка показывает ошибку всех обученных политик или ошибку предсказания шага. Дообучи и политику с подобранными параметрами и найди запись, на которой даже дообучение с поправкой не спасает настоящую Аду.', final: true, controls: ['pol', 'rec', 'view'] },
  ];
  function init() {
    segBind('#gPol', async (v) => { if (st.busy) return; if (!polOf(v)) { await tune(v); } st.pol = v; render(); });
    segBind('#gRec', (v) => { st.rec = v; st.t = 0; render(); });
    segBind('#gView', (v) => { st.view = v; render(); });
    ctl = mountMissions('#gMis', missions, api, { controls: { pol: '#wrapGPol', rec: '#wrapGRec', view: '#wrapGView' }, scene: '#gCv' });
    render(); redrawOn(render);
    K.loop($('#gCv'), (dt) => { if (!st.hold) st.t += dt; if (!st.busy) drawScene(); });
    return ctl;
  }
  return { init, api, st, missions, POLS, PNAME, RECS, FT };
})();

/* ---------- Таблица 1 OmniH2O (симуляция, 14 тысяч записей): учитель, ученик и абляции DAgger и истории; наведение — разбор ---------- */
function initAbl() {
  const box = $('#ablOmni'); if (!box) return;
  const rows = [
    ['teacher', 'Учитель: всё состояние тела', '913', '94,77%', '126,5'],
    ['h2o', 'H2O: восемь точек и скорость таза', '138', '87,52%', '148,1'],
    ['omni', 'Ученик OmniH2O: три точки, история 25 шагов, DAgger', '1665', '94,10%', '141,1'],
    ['hist0', 'То же без истории, DAgger', '90', '93,80%', '141,2'],
    ['rl0', 'Без истории, с подкреплением', '90', '90,62%', '163,4'],
    ['rl25', 'История 25 шагов, с подкреплением', '1665', '47,11%', '223,3'],
  ];
  box.insertAdjacentHTML('beforeend', rows.map(([k, n, d, sr, e]) => `<div class="num-row" role="row" data-k="${k}"><span role="cell"><b>${n}</b></span><span role="cell">${d}</span><span role="cell">${sr}</span><span role="cell">${e}</span></div>`).join(''));
  const texts = {
    teacher: 'Учитель видит положения, повороты и скорости всех звеньев и разницу с записью на следующий кадр: 913 чисел. В симуляторе это верхняя граница, 94,77% успешных записей, но на роботе таких данных нет.',
    h2o: 'H2O учил политику с подкреплением сразу на том, что есть у робота, и подавал ей восемь точек тела. Для скорости таза на роботе нужна была система записи движения, а успех в симуляции 87,52%.',
    omni: 'Ученик OmniH2O видит три точки (голову и кисти) и 25 последних шагов своих суставов вместо скорости таза. Он почти догоняет учителя: 94,10% против 94,77%, и на роботе ему не нужна система записи движения.',
    hist0: 'Без истории DAgger даёт 93,80%, почти столько же. В симуляторе история почти не помогает, а на роботе ошибка без неё больше: 83,26 мм против 47,94 мм у 25 шагов.',
    rl0: 'Тот же короткий вход, но вместо DAgger обучение с подкреплением: 90,62%. Без истории разница с DAgger небольшая.',
    rl25: 'С историей из 25 шагов обучение с подкреплением почти не справляется: 47,11% против 94,10% у DAgger с тем же входом. Авторы пишут, что с подкреплением политике трудно освоить длинную историю, а DAgger получает правильное действие в каждом состоянии.',
  };
  const out = $('#ablOut');
  $$('#ablOmni .num-row[data-k]').forEach((r) => { const show = () => { $$('#ablOmni .num-row').forEach((x) => x.classList.toggle('hot', x === r)); setOut(out, texts[r.dataset.k]); }; r.addEventListener('mouseenter', show); r.addEventListener('focus', show); r.addEventListener('click', show); r.tabIndex = 0; });
  setOut(out, 'Наведи на строку или нажми на неё, чтобы увидеть разбор. Числа взяты из таблицы 1 статьи OmniH2O: доля записей, которые политика повторила без срыва, и средняя ошибка положений звеньев в мировых координатах.');
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
  { q: 'Универсальный трекер получает во вход кадр записи, а не фазу, как в DeepMimic. Что это меняет?', o: ['Трекер точнее повторяет одну запись', 'Политике не нужно знать, какая это запись и где она сейчас: целевая поза приходит в команде, и одна сеть повторяет любую запись', 'Трекеру больше не нужна физическая симуляция'], a: 1, e: 'Так H2O учит одну политику на тысячи записей, а OmniH2O и HOVER повторяют позы, которые приходят из VR-шлема, камеры или генератора движений по тексту. В уроке 6.2 трекер с фазой был привязан к одной записи и к её темпу.' },
  { q: 'Учитель с привилегированной информацией не смог повторить запись в симуляторе. Что это говорит о записи?', o: ['Ничего: учителя просто плохо обучили', 'Её почти наверняка не повторит и политика на датчиках: учитель знает больше и служит верхней границей, поэтому такие записи выбрасывают', 'Её нужно только замедлить, и она пройдёт'], a: 1, e: 'Так работает фильтр H2O: из 10 тысяч перенесённых записей учитель не справился примерно с 1,5 тысячи. В лаборатории 1 замедление спасло резкий поклон и резкий удар, но не прогиб назад: причины отказа бывают разные.' },
  { q: 'Ретаргетинг соблюдает пределы суставов и ставит стопы на пол. Зачем ещё прогон в физике?', o: ['Чтобы проверить, нет ли в записи шума', 'Кинематика не проверяет моменты и скорости приводов и равновесие в движении: запись может выглядеть нормально в кадрах, а приводы её не повторят', 'Чтобы ускорить обучение'], a: 1, e: 'В лаборатории 1 проверка центра масс по кадрам записи нашла бы только прогиб назад и дотягивание вперёд. Резкий поклон и резкий удар в кадрах выглядят безобидно, а не проходят из-за предела скорости опорной ноги и предела момента привода.' },
  { q: 'Почему ученика OmniH2O учат повторять учителя (DAgger), а не сразу с подкреплением?', o: ['DAgger быстрее считает физику', 'У ученика мало информации о теле и длинная история на входе; с подкреплением такая политика училась плохо, а у DAgger в каждом состоянии есть правильное действие', 'С подкреплением нельзя учить политику для робота'], a: 1, e: 'В таблице OmniH2O ученик с историей из 25 шагов набирал 94,10% с DAgger и 47,11% с подкреплением. Тот же приём в уроке 5.5 позволил ученику без данных о трении ездить почти как учитель.' },
  { q: 'Что такое маска команды в HOVER?', o: ['Фильтр, который убирает шум из команды', 'Биты, которые говорят политике, какие части команды заданы; на обучении они случайны, поэтому одна политика понимает любые сочетания частей', 'Веса слагаемых награды для разных режимов'], a: 1, e: 'Каждый бит маски берут из Bernoulli(0,5) в начале эпизода. Поэтому генералист в лаборатории 2 работал со всеми четырьмя режимами прежних систем и переключался между ними прямо во время ходьбы.' },
  { q: 'В лаборатории 2 специалист в своём режиме точнее генералиста. Значит, HOVER ошибается насчёт генералиста?', o: ['Да, специалист всегда лучше', 'Нет: HOVER сравнивал генералиста со специалистами, которых учили с подкреплением, а у нас оба учатся у одного учителя; часть выигрыша HOVER даёт сама дистилляция', 'Нет: наши специалисты просто переобучились'], a: 1, e: 'У HOVER генералист, обученный дистилляцией, обгоняет и специалистов, и политику с теми же масками, обученную с подкреплением с нуля, поэтому часть его выигрыша даёт сама дистилляция. У нас специалист точнее в своём режиме, но в чужом его ошибка в несколько раз больше, а генералист один на все режимы.' },
  { q: 'После дообучения в симуляторе с дельта-моделью политику ставят на робота без поправки. Почему это работает?', o: ['Поправка слишком медленная для робота, и её отключают ради скорости', 'Поправка нужна, чтобы симулятор вёл себя как робот; на самом роботе это поведение есть и так, а политика уже научилась с ним справляться', 'Не работает: на роботе поправку тоже приходится включать'], a: 1, e: 'В лаборатории 3 поправка нашла, что команда действует с опозданием на шаг. Политика, дообученная в таком симуляторе, научилась подавать команду заранее и на настоящей Аде ошибалась меньше, чем после того же дообучения в обычном симуляторе.' },
  { q: 'Что даёт BeyondMimic направление диффузии по градиенту стоимости?', o: ['Ускоряет обучение трекера с подкреплением', 'Новую задачу, например команду с джойстика, точку на полу или препятствие, можно поставить на инференсе без нового обучения: градиент стоимости подправляет шаги денойзинга', 'Убирает задержку между командой и приводами'], a: 1, e: 'Диффузионная модель BeyondMimic учится на прогонах трекеров без разметки задач. Стоимость задачи дифференцируема, и её градиент на каждом шаге денойзинга сдвигает план к выполнению задачи. Так одна модель ходит по джойстику, идёт к точке и обходит препятствие.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('filter', () => { mis.filter = Filter.init(); });
    safe('modes', () => { mis.modes = Modes.init(); });
    safe('gap', () => { mis.gap = Gap.init(); });
    safe('abl', initAbl); safe('quiz', initQuiz);
    safe('count', () => { const n = ['fMis', 'mMis', 'gMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l63 = { mis, Filter, Modes, Gap, L63, Fig, QUIZ }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
