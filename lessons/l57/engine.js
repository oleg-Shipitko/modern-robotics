/* =====================================================================
   l57/engine.js — движок урока 5.7 «RL на реальных роботах и дообучение
   VLA». Без DOM: работает в браузере (window.L57, поверх window.Arm из
   shared/arm-core.js) и в Node (require).
   1) Мир: рука Ады из урока 0.3 — два звена 0,5 и 0,4 м, вид сбоку, плечо
      в начале координат. Справа шкаф: стена на x = 0,6 м с одной нишей —
      проёмом высотой 10 см и глубиной 12 см на высоте, которая меняется от
      попытки к попытке. Задача: завести чашку в захвате в нишу на 8 см, не
      задев кромку. Каждый шаг политика задаёт сдвиг захвата (до 4 см по
      каждой оси); регулятор руки пересчитывает его в повороты суставов
      через якобиан, как в уроках 0.3 и 5.3. Попытка — до 28 шагов.
   2) Демонстрации: учитель-программа (роль оператора) ведёт чашку по
      правилу «сначала высота, потом вперёд» из обычной стартовой позы.
      Политика по демонстрациям (BC, регрессия со средним квадратом) учится
      на них. На работе робот стартует и из необычных поз — рядом со шкафом —
      и там промахивается: систематический хвост ошибок.
   3) Опыт робота: 100 попыток политики с небольшим случайным разбросом
      действий, около 80 удачных и 20 неудачных.
   4) Функция ценности V(s) — регрессия на отдачу (−1/T за шаг, −1 за
      столкновение), преимущество на N шагов A = Σr + V(s_N) − V(s_0), метка
      I = [A > ε] (порог — перцентиль, как в RECAP). Три дообучения на одних
      и тех же попытках: только удачные, все с меткой преимущества во входе,
      все без разметки. Одна сеть, один бюджет шагов, одна проверка.
   5) Вмешательства: часть шагов попытки делает человек (или учитель-
      программа); такие шаги всегда помечены I = 1, как исправления в RECAP.
   6) Итерации «опыт + исправления» и кривая «ещё демонстрации» для
      лаборатории 3.
   Экспонента, логарифм, tanh, синус, косинус и арктангенс посчитаны сами:
   встроенные Math.* в разных браузерах расходятся в последнем бите, а
   обучение раздувает разницу. Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const Arm = (typeof module !== 'undefined' && module.exports) ? require('../shared/arm-core.js') : root.Arm;
  const { rng } = Arm;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- 0. детерминированная математика (как в l56/engine.js) ---------- */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }
    const EXPC = [1]; for (let n = 1; n <= 14; n++) EXPC.push(EXPC[n - 1] / n);
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = EXPC[14]; for (let n = 13; n >= 0; n--) sm = EXPC[n] + r * sm;
      return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
      let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
      f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
      u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];
      if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
      const sv = (m - 1) / (m + 1), s2 = sv * sv; let t = sv, sum = sv;
      for (let n = 3; n <= 41; n += 2) { t *= s2; sum += t / n; }
      return e * LN2_HI + (e * LN2_LO + 2 * sum);
    }
    function tanh(x) {
      const ax = x < 0 ? -x : x; let v;
      if (ax > 20) v = 1; else if (ax < 0.5) { const e = expm1Small(2 * ax); v = e / (e + 2); } else v = 1 - 2 / (exp(2 * ax) + 1);
      return x < 0 ? -v : v;
    }
    const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
    function sincos(x) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      return q === 0 ? [sn, cs] : q === 1 ? [cs, -sn] : q === 2 ? [-sn, -cs] : [-cs, sn];
    }
    const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
    function atan(z) {
      let sg = 1; if (z < 0) { z = -z; sg = -1; }
      let inv = false; if (z > 1) { z = 1 / z; inv = true; }
      let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
      const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
      const a = off + sm; return sg * (inv ? PIO2 - a : a);
    }
    function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
    /** arccos через atan2: одинаков везде. */
    function acos(c) { c = clamp(c, -1, 1); return atan2(Math.sqrt(1 - c * c), c); }
    return { exp, log, tanh, sincos, atan2, acos };
  })();
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  /* ---------- 1. рука: кинематика из урока 0.3 на переносимых sin и cos ---------- */
  const L1 = Arm.L1, L2 = Arm.L2;
  function fk(q) { const [s1, c1] = DM.sincos(q[0]), [s12, c12] = DM.sincos(q[0] + q[1]), x1 = L1 * c1, y1 = L1 * s1; return { x1, y1, x: x1 + L2 * c12, y: y1 + L2 * s12 }; }
  function jac(q) { const [s1, c1] = DM.sincos(q[0]), [s12, c12] = DM.sincos(q[0] + q[1]); return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]]; }
  /** Обратная кинематика с локтем вниз (θ2 > 0), как в лабораториях 5.3. */
  function ik(x, y) {
    const d2 = x * x + y * y, c2 = clamp((d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1), q2 = DM.acos(c2);
    const [s2, cc2] = DM.sincos(q2);
    return [DM.atan2(y, x) - DM.atan2(L2 * s2, L1 + L2 * cc2), q2];
  }
  const ARM = { DP: 0.04, DQ: 0.35, QLIM: [[-1.9, 1.6], [0.05, 2.75]] };
  /** Сдвиг захвата на DP·a через якобиан (затухающие наименьшие квадраты), как в 0.3 и 5.3. */
  function stepQ(q, a) {
    const J = jac(q), dx = ARM.DP * clamp(a[0], -1, 1), dy = ARM.DP * clamp(a[1], -1, 1), l2 = 0.0025;
    const m00 = J[0][0] * J[0][0] + J[0][1] * J[0][1] + l2, m01 = J[0][0] * J[1][0] + J[0][1] * J[1][1], m11 = J[1][0] * J[1][0] + J[1][1] * J[1][1] + l2, det = m00 * m11 - m01 * m01;
    const u = (m11 * dx - m01 * dy) / det, v = (-m01 * dx + m00 * dy) / det;
    const d0 = clamp(J[0][0] * u + J[1][0] * v, -ARM.DQ, ARM.DQ), d1 = clamp(J[0][1] * u + J[1][1] * v, -ARM.DQ, ARM.DQ);
    return [clamp(q[0] + d0, ARM.QLIM[0][0], ARM.QLIM[0][1]), clamp(q[1] + d1, ARM.QLIM[1][0], ARM.QLIM[1][1])];
  }

  /* ---------- 2. мир: шкаф с нишей ---------- */
  const CFG = {
    XW: 0.60,          // стена шкафа, м от плеча
    NH: 0.10,          // высота проёма ниши
    ND: 0.12,          // глубина ниши
    PITCH: 0.14,       // шаг полок: соседние ниши на 14 см выше и ниже, между ними полка 4 см
    RG: 0.025,         // радиус чашки в захвате: зазор до кромки — 2,5 см сверху и снизу
    IN: 0.08,          // успех: чашка заведена в нужную нишу на 8 см
    YN: [-0.12, 0.42], // высота нужной ниши: равномерно в этом диапазоне
    HOME: { x: [0.20, 0.32], y: [0.04, 0.26] },       // обычная стартовая поза захвата
    NEAR: { x: [0.46, 0.54], y: [-0.14, 0.44], gap: 0.12 },   // необычная: у самого шкафа, не на высоте ниши (|Δy| ≥ gap)
    SHELF: { depth: [0.0, 0.05] },                    // необычная: чашка ещё в соседней нише, на такой глубине
    P_NEAR: 0.25, P_SHELF: 0.1,                       // доли необычных стартов на работе
    P_NEAR_DEMO: 0, P_SHELF_DEMO: 0,                  // в демонстрациях оператора необычных стартов нет
    T: 28,             // шагов в попытке
    R_FAIL: 1,         // штраф за столкновение (награда −1/T за шаг)
    N_DEMO: 40, N_ROLL: 100, N_EVAL: 60, N_EVAL_HARD: 20,
    ITER_N: 25, ITERS: 6, DEMO_CURVE: [80, 120, 160, 320], STEPS_PER_DEMO: 12,   // лаборатория 3: первые 40 демонстраций — те же, что у базовой политики
    EXPLORE: 0.25,     // разброс действий робота при сборе опыта
    P_REACT: 0.5,      // учитель-наблюдатель успевает вмешаться на опасном шаге с такой вероятностью
    H: 32, LR: 3e-3, BATCH: 64, STEPS_BC: 2500, STEPS_FT: 3000, STEPS_V: 3000,
    NSTEP: 4, POS_SHARE: 0.4,   // преимущество на 4 шага; порог — чтобы ~40% шагов были «positive»
    SEED: 1, EVAL_SEED: 77,
  };
  const OD = 7, AD = 2, ID = OD + 1;   // наблюдение, действие, вход политики (наблюдение + метка)
  /** Куда ведёт учитель и куда смотрит наблюдение: дно нужной ниши (с учётом радиуса чашки); успех засчитывается раньше, на глубине IN. */
  const goalOf = (yn) => ({ x: CFG.XW + CFG.ND - CFG.RG, y: yn });
  /** Точка (x, y) с чашкой внутри какого-нибудь проёма шкафа (нужная ниша и соседние полки)? */
  function inOpening(y, yn) { const d = y - yn, k = Math.round(d / CFG.PITCH); return Math.abs(d - k * CFG.PITCH) <= CFG.NH / 2 - CFG.RG; }
  /** Отрезок от p к q задевает стену или полку (с учётом радиуса чашки)? Проверяем по 4 точкам шага. */
  function hitsWall(p, q, yn) {
    for (let k = 1; k <= 4; k++) {
      const s = k / 4, x = p.x + (q.x - p.x) * s, y = p.y + (q.y - p.y) * s;
      if (x + CFG.RG > CFG.XW && !inOpening(y, yn)) return true;
    }
    return false;
  }
  const inNiche = (p, yn) => p.x >= CFG.XW + CFG.IN && Math.abs(p.y - yn) <= CFG.NH / 2 - CFG.RG;
  /** Старт попытки: обычная поза, «у шкафа» или «в соседней нише». r — случайности. */
  function startOf(r, pNear, pShelf) {
    const yn = CFG.YN[0] + (CFG.YN[1] - CFG.YN[0]) * r();
    const u = r(), pn = pNear == null ? CFG.P_NEAR : pNear, ps = pShelf == null ? CFG.P_SHELF : pShelf;
    const kind = u < ps ? 'shelf' : u < ps + pn ? 'near' : 'home';
    let x, y;
    if (kind === 'shelf') { const up = yn + CFG.PITCH <= CFG.YN[1] + 0.02 && (yn - CFG.PITCH < CFG.YN[0] - 0.02 || r() < 0.5); y = yn + (up ? 1 : -1) * CFG.PITCH; x = CFG.XW - CFG.RG + CFG.SHELF.depth[0] + (CFG.SHELF.depth[1] - CFG.SHELF.depth[0]) * r(); }
    else if (kind === 'near') { const B = CFG.NEAR; x = B.x[0] + (B.x[1] - B.x[0]) * r(); for (;;) { y = B.y[0] + (B.y[1] - B.y[0]) * r(); if (Math.abs(y - yn) >= B.gap) break; } }
    else { const B = CFG.HOME; x = B.x[0] + (B.x[1] - B.x[0]) * r(); y = B.y[0] + (B.y[1] - B.y[0]) * r(); }
    return { q: ik(x, y), yn, kind };
  }
  const qn = (q, o) => { o[0] = (q[0] + 0.15) / 1.75; o[1] = (q[1] - 1.4) / 1.35; };
  /** Наблюдение: углы суставов, положение захвата и вектор к дну ниши — грубо (÷30 см) и точно по высоте (÷5 см). */
  function observe(st, o) {
    o = o || new Float64Array(OD); const p = fk(st.q), g = goalOf(st.yn), dx = g.x - p.x, dy = g.y - p.y;
    qn(st.q, o); o[2] = (p.x - 0.4) / 0.3; o[3] = (p.y - 0.15) / 0.3; o[4] = dx / 0.3; o[5] = dy / 0.3; o[6] = DM.tanh(dy / 0.05);
    return o;
  }
  /** Один шаг: сдвиг захвата по действию; исход — 'goal', 'crash' или null. Награда −1/T за шаг, −1 за столкновение. У дна ниши чашка упирается и не двигается. */
  function envStep(st, a) {
    const p = fk(st.q), lim = CFG.XW + CFG.ND - CFG.RG; let q2 = stepQ(st.q, a), p2 = fk(q2);
    if (p2.x > lim + 1e-9 && p2.x > p.x) { const k = Math.max(0, (lim - p.x) / (p2.x - p.x)); q2 = stepQ(st.q, [a[0] * k, a[1] * k]); p2 = fk(q2); }   // у дна шаг укорачивается
    let outcome = null, r = -1 / CFG.T;
    if (hitsWall(p, p2, st.yn)) { outcome = 'crash'; r -= CFG.R_FAIL; }
    else { st.q = q2; if (inNiche(p2, st.yn)) outcome = 'goal'; }
    return { r, outcome };
  }
  /** Учитель-программа (роль оператора): из чужой ниши сначала назад, у шкафа — не вперёд, пока не выровнена высота; потом вперёд. */
  function teacher(st, a, r) {
    const p = fk(st.q), g = goalOf(st.yn), dy = g.y - p.y, dx = g.x - p.x, DP = ARM.DP;
    const aligned = Math.abs(dy) < 0.012, inside = p.x + CFG.RG > CFG.XW - 0.004, wrongNiche = inside && Math.abs(dy) > CFG.NH / 2 - CFG.RG - 0.006, nearWall = p.x > CFG.XW - 0.07;
    if (wrongNiche) { a[0] = -1; a[1] = 0; }
    else { a[1] = clamp(dy / DP, -1, 1); a[0] = aligned ? clamp(dx / DP, -1, 1) : nearWall ? clamp((CFG.XW - 0.08 - p.x) / DP, -1, 0) : 0.35; }
    if (r) { a[0] = clamp(a[0] + 0.08 * randn(r), -1, 1); a[1] = clamp(a[1] + 0.08 * randn(r), -1, 1); }
    return a;
  }
  /** Попытка: ctl(st, t, obs, a) заполняет действие a и возвращает true, если шаг сделал человек (или учитель). */
  function rollout(ctl, st, keepObs) {
    const traj = [fk(st.q)], qs = [st.q.slice()], acts = [], rews = [], obs = [], who = [], a = new Float64Array(AD); let outcome = 'timeout', ret = 0;
    for (let t = 0; t < CFG.T; t++) {
      const x = observe(st); const w = ctl(st, t, x, a) ? 1 : 0;
      const r = envStep(st, a);
      if (keepObs) obs.push(x);
      acts.push([a[0], a[1]]); rews.push(r.r); who.push(w); ret += r.r; traj.push(fk(st.q)); qs.push(st.q.slice());
      if (r.outcome) { outcome = r.outcome; break; }
    }
    if (keepObs) obs.push(observe(st));
    return { traj, qs, acts, rews, obs, who, outcome, ret, T: acts.length, yn: st.yn, kind: st.kind || 'home' };
  }
  /** Попытка по шагам (для живой сцены): begin → step(a, who) … → done. Форма результата — как у rollout. */
  function begin(s0) {
    const st = { q: s0.q.slice(), yn: s0.yn, kind: s0.kind || 'home' };
    return { st, traj: [fk(st.q)], qs: [st.q.slice()], acts: [], rews: [], obs: [], who: [], outcome: null, ret: 0, T: 0, yn: st.yn, kind: st.kind, src: 'robot' };
  }
  function stepEp(ep, a, who) {
    if (ep.outcome) return ep.outcome;
    const x = observe(ep.st), r = envStep(ep.st, a);
    ep.obs.push(x); ep.acts.push([a[0], a[1]]); ep.rews.push(r.r); ep.who.push(who ? 1 : 0); ep.ret += r.r; ep.traj.push(fk(ep.st.q)); ep.qs.push(ep.st.q.slice()); ep.T++;
    if (r.outcome) ep.outcome = r.outcome; else if (ep.T >= CFG.T) ep.outcome = 'timeout';
    if (ep.outcome) ep.obs.push(observe(ep.st));
    return ep.outcome;
  }
  /** Демонстрации учителя: n попыток из обычной позы (с разбросом рук оператора). */
  function demos(n, seed) {
    seed = seed == null ? CFG.SEED : seed; const out = [];
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 100003 + k * 7919 + 11), rn = rng(seed * 7 + k * 1301 + 3), st = startOf(r, CFG.P_NEAR_DEMO, CFG.P_SHELF_DEMO);
      out.push(Object.assign(rollout((s, t, x, a) => { teacher(s, a, rn); return true; }, st, true), { src: 'demo' }));
    }
    return out;
  }

  /* ---------- 3. сети: два скрытых слоя, ReLU с утечкой, Adam (как в 5.6) ---------- */
  function net(sizes, seed, outScale) {
    const r = rng(seed), L = sizes.length - 1, W = [], B = [];
    for (let l = 0; l < L; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), sc = (l < L - 1 ? Math.sqrt(2) : (outScale == null ? 1 : outScale)) * Math.sqrt(1 / a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * sc;
      W.push(w); B.push(new Float64Array(b));
    }
    const z = (arr) => arr.map((x) => new Float64Array(x.length));
    return { sizes, L, W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0, p1: 1, p2: 1 };
  }
  const clone = (n) => ({ sizes: n.sizes, L: n.L, W: n.W.map((w) => w.slice()), B: n.B.map((b) => b.slice()), mW: n.mW.map((w) => w.slice()), vW: n.vW.map((w) => w.slice()), mB: n.mB.map((b) => b.slice()), vB: n.vB.map((b) => b.slice()), t: n.t, p1: n.p1, p2: n.p2 });
  function ws(n) { return { a: n.sizes.map((k) => new Float64Array(k)), d: n.sizes.map((k) => new Float64Array(k)) }; }
  function grads(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  function zero(g) { for (const w of g.W) w.fill(0); for (const b of g.B) b.fill(0); }
  function fwd(n, c, x) {
    const a0 = c.a[0]; for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    for (let l = 0; l < n.L; l++) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], b = n.B[l], ai = c.a[l], ao = c.a[l + 1], hid = l < n.L - 1;
      for (let o = 0; o < nO; o++) ao[o] = b[o];
      for (let i = 0; i < nI; i++) { const v = ai[i]; if (v === 0) continue; const off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
      if (hid) for (let o = 0; o < nO; o++) { const z = ao[o]; if (z < 0) ao[o] = 0.01 * z; }
    }
    return c.a[n.L];
  }
  function bwd(n, c, gOut, g) {
    const dL = c.d[n.L]; for (let o = 0; o < dL.length; o++) dL[o] = gOut[o];
    for (let l = n.L - 1; l >= 0; l--) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = c.a[l], dO = c.d[l + 1], dI = c.d[l], gw = g.W[l], gb = g.B[l];
      for (let o = 0; o < nO; o++) gb[o] += dO[o];
      if (l === 0) { for (let i = 0; i < nI; i++) { const v = ai[i]; if (v === 0) continue; const off = i * nO; for (let o = 0; o < nO; o++) gw[off + o] += v * dO[o]; } break; }
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; let sm = 0; for (let o = 0; o < nO; o++) { gw[off + o] += v * dO[o]; sm += w[off + o] * dO[o]; } dI[i] = ai[i] < 0 ? sm * 0.01 : sm; }
    }
  }
  function adam(n, g, lr, scale) {
    n.t++; const b1 = 0.9, b2 = 0.999; n.p1 *= b1; n.p2 *= b2; const c1 = 1 - n.p1, c2 = 1 - n.p2;
    for (let l = 0; l < n.L; l++) for (let h = 0; h < 2; h++) {
      const Pp = h ? n.B[l] : n.W[l], G = h ? g.B[l] : g.W[l], M = h ? n.mB[l] : n.mW[l], V = h ? n.vB[l] : n.vW[l];
      for (let i = 0; i < Pp.length; i++) { const gi = G[i] * scale; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; Pp[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }

  /* ---------- 4. политика: вход — наблюдение и метка I (+1, −1 или 0 — без условия); выход — tanh ---------- */
  function policy(seed, o) { const n = net([ID, o.H, o.H, AD], seed, 0.1); return { n, w: ws(n), g: grads(n), x: new Float64Array(ID), gOut: new Float64Array(AD) }; }
  const clonePolicy = (P) => ({ n: clone(P.n), w: ws(P.n), g: grads(P.n), x: new Float64Array(ID), gOut: new Float64Array(AD) });
  /** Действие политики в наблюдении obs с меткой I. */
  function act(P, obs, I, a) {
    const x = P.x; for (let i = 0; i < OD; i++) x[i] = obs[i]; x[OD] = I || 0;
    const out = fwd(P.n, P.w, x); a = a || new Float64Array(AD); a[0] = DM.tanh(out[0]); a[1] = DM.tanh(out[1]); return a;
  }
  /** Переходы из попыток: наблюдение, действие, награда, следующее наблюдение, конец, кто сделал шаг, номер попытки. */
  function transitions(eps) {
    const S = [], A = [], R = [], S2 = [], DN = [], WHO = [], EP = [], TT = [];
    eps.forEach((e, k) => { for (let t = 0; t < e.T; t++) { S.push(e.obs[t]); A.push(e.acts[t]); R.push(e.rews[t]); S2.push(e.obs[t + 1]); DN.push(t === e.T - 1 && e.outcome !== 'timeout' ? 1 : 0); WHO.push(e.who[t]); EP.push(k); TT.push(t); } });
    return { S, A, R: Float64Array.from(R), S2, DN: Uint8Array.from(DN), WHO: Uint8Array.from(WHO), EP: Int32Array.from(EP), TT: Int32Array.from(TT), N: A.length, eps };
  }
  /** Шаги обучения политики регрессией со средним квадратом: idx — переходы, lab(j) — метка во входе. */
  /** prio — второй буфер (номера переходов): если задан, половина каждого пакета берётся из него (симметричная выборка RLPD). */
  function* trainPolicy(P, T, idx, lab, o, seed, prio) {
    const r = rng(seed * 7717 + 5), n = o.BATCH, x = P.x, gOut = P.gOut, half = prio && prio.length ? n >> 1 : 0;
    for (let it = 0; it < o.STEPS; it++) {
      zero(P.g);
      for (let m = 0; m < n; m++) {
        const j = m < half ? prio[Math.floor(r() * prio.length)] : idx[Math.floor(r() * idx.length)]; const s = T.S[j], a = T.A[j];
        for (let i = 0; i < OD; i++) x[i] = s[i]; x[OD] = lab ? lab(j) : 0;
        const out = fwd(P.n, P.w, x);
        for (let k = 0; k < AD; k++) { const y = DM.tanh(out[k]), e = y - a[k]; gOut[k] = 2 * e * (1 - y * y); }
        bwd(P.n, P.w, gOut, P.g);
      }
      adam(P.n, P.g, o.LR, 1 / n);
      if ((it + 1) % (o.every || 50) === 0) yield { it: it + 1, of: o.STEPS };
    }
    return P;
  }
  const allIdx = (T) => Int32Array.from({ length: T.N }, (_, j) => j);

  /* ---------- 5. функция ценности и преимущество ---------- */
  /** Отдача из каждого шага до конца попытки (без дисконта, как в RECAP). */
  function returns(T) { const G = new Float64Array(T.N); for (let j = T.N - 1; j >= 0; j--) G[j] = T.R[j] + (j + 1 < T.N && T.EP[j + 1] === T.EP[j] ? G[j + 1] : 0); return G; }
  function valueNet(seed, o) { const n = net([OD, o.H, o.H, 1], seed, 0.1); return { n, w: ws(n), g: grads(n), g1: new Float64Array(1) }; }
  function* trainValue(V, T, o, seed) {
    const G = returns(T), r = rng(seed * 991 + 3), n = o.BATCH;
    for (let it = 0; it < o.STEPS_V; it++) {
      zero(V.g);
      for (let m = 0; m < n; m++) { const j = Math.floor(r() * T.N); const v = fwd(V.n, V.w, T.S[j])[0]; V.g1[0] = 2 * (v - G[j]); bwd(V.n, V.w, V.g1, V.g); }
      adam(V.n, V.g, o.LR, 1 / n);
      if ((it + 1) % (o.every || 50) === 0) yield { it: it + 1, of: o.STEPS_V };
    }
    return V;
  }
  const vOf = (V, s) => fwd(V.n, V.w, s)[0];
  /** Преимущество на N шагов: Σ r + V(s_{t+N}) − V(s_t); если попытка кончилась раньше — без V в конце. */
  function advantages(V, T, N) {
    const A = new Float64Array(T.N);
    for (let j = 0; j < T.N; j++) {
      let s = 0, k = j, done = false;
      for (let m = 0; m < N; m++) { s += T.R[k]; if (T.DN[k] || k + 1 >= T.N || T.EP[k + 1] !== T.EP[j]) { done = true; break; } k++; }
      A[j] = s + (done ? 0 : vOf(V, T.S2[k - 0 >= 0 ? k : j])) - vOf(V, T.S[j]);
    }
    return A;
  }
  /** Порог: доля share шагов с A > ε. */
  function threshold(A, share) { const v = Array.from(A).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * (1 - share)))]; }
  /** Метки: I = +1, если A > ε; шаги человека — всегда +1. */
  function labels(A, T, eps) { const I = new Float64Array(T.N); for (let j = 0; j < T.N; j++) I[j] = T.WHO[j] ? 1 : (A[j] > eps ? 1 : -1); return I; }

  /* ---------- 6. проверка ---------- */
  function evalStarts(n, seed, pNear, pShelf) { const r = rng(seed), out = []; for (let k = 0; k < n; k++) out.push(startOf(r, pNear, pShelf)); return out; }
  const STARTS = {};
  /** Проверочные старты: 'all' — как на работе (60), 'shelf' — только из соседней ниши (20), 'near' — только у шкафа (20). */
  function starts(kind) {
    kind = kind || 'all';
    if (!STARTS[kind]) STARTS[kind] = kind === 'all' ? evalStarts(CFG.N_EVAL, CFG.EVAL_SEED) : kind === 'shelf' ? evalStarts(CFG.N_EVAL_HARD, CFG.EVAL_SEED + 1, 0, 1) : evalStarts(CFG.N_EVAL_HARD, CFG.EVAL_SEED + 2, 1, 0);
    return STARTS[kind];
  }
  /** Попытки политики с одних и тех же стартов, без разброса, метка I при запуске. */
  function evaluate(P, I, set) {
    set = set || starts('all'); const res = [];
    for (const s0 of set) { const st = { q: s0.q.slice(), yn: s0.yn, kind: s0.kind }; res.push(rollout((s, t, x, a) => { act(P, x, I, a); return false; }, st, false)); }
    return summarize(res);
  }
  /** Время попытки: 0,2 с на шаг и 3 с на возврат сцены; пропускная способность — удачных попыток в час, как в π*0.6. */
  const STEP_S = 0.2, RESET_S = 3;
  function summarize(res) {
    const ok = res.filter((e) => e.outcome === 'goal'), cnt = (arr) => arr.filter((e) => e.outcome === 'goal').length, by = {};
    for (const k of ['home', 'near', 'shelf']) { const arr = res.filter((e) => e.kind === k); by[k] = { n: arr.length, ok: cnt(arr) }; }
    const secs = res.reduce((a, e) => a + e.T * STEP_S + RESET_S, 0);
    return { eps: res, n: res.length, ok: ok.length, crash: res.filter((e) => e.outcome === 'crash').length, timeout: res.filter((e) => e.outcome === 'timeout').length, by,
      tGoal: ok.length ? ok.reduce((a, e) => a + e.T, 0) / ok.length : null, ret: res.reduce((a, e) => a + e.ret, 0) / res.length, perHour: ok.length / secs * 3600 };
  }

  /* ---------- 7. сценарии урока ---------- */
  /** Базовая политика по демонстрациям. */
  function* trainBase(o) {
    o = Object.assign({}, CFG, o || {}); const D = demos(o.N_DEMO, o.SEED), T = transitions(D), P = policy(o.SEED * 1000 + 17, o);
    yield* trainPolicy(P, T, allIdx(T), null, Object.assign({}, o, { STEPS: o.STEPS_BC }), o.SEED);
    return { P, D, T };
  }
  /** Опыт робота: n попыток политики с разбросом действий на стартах с работы. */
  function collect(P, n, seed, o, pNear, pShelf, I) {
    o = Object.assign({}, CFG, o || {}); const out = [];
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 104729 + k * 7919 + 1), rn = rng(seed * 31 + k * 977 + 7), st = startOf(r, pNear, pShelf);
      out.push(Object.assign(rollout((s, t, x, a) => { act(P, x, I || 0, a); a[0] = clamp(a[0] + o.EXPLORE * randn(rn), -1, 1); a[1] = clamp(a[1] + o.EXPLORE * randn(rn), -1, 1); return false; }, st, true), { src: 'robot' }));
    }
    return out;
  }
  /** Опыт с вмешательствами учителя-программы: он берёт управление, когда чашка у шкафа не на высоте ниши, и ведёт до входа. */
  /** Правило учителя-наблюдателя: вмешаться, когда чашка у шкафа или внутри него не на высоте нужной ниши; вернуть управление, когда она в проёме. */
  function danger(st) { const p = fk(st.q), dy = st.yn - p.y; return p.x > CFG.XW - 0.09 && Math.abs(dy) > CFG.NH / 2 - CFG.RG - 0.005; }
  function safe(st) { const p = fk(st.q), dy = st.yn - p.y; return p.x > CFG.XW + 0.02 && Math.abs(dy) < 0.012; }
  function collectWithTeacher(P, n, seed, o, pNear, pShelf, I) {
    o = Object.assign({}, CFG, o || {}); const out = [];
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 104729 + k * 7919 + 1), rn = rng(seed * 31 + k * 977 + 7), rt = rng(seed * 53 + k * 613 + 9), st = startOf(r, pNear, pShelf); let hold = false;
      out.push(Object.assign(rollout((s, t, x, a) => {
        if (!hold && danger(s) && rt() < o.P_REACT) hold = true;
        if (hold && safe(s)) hold = false;
        if (hold) { teacher(s, a, null); return true; }
        act(P, x, I || 0, a); a[0] = clamp(a[0] + o.EXPLORE * randn(rn), -1, 1); a[1] = clamp(a[1] + o.EXPLORE * randn(rn), -1, 1); return false;
      }, st, true), { src: 'robot' }));
    }
    return out;
  }
  const METHODS = ['success', 'adv', 'all'];
  /** Дообучение базовой политики на попытках eps одним из трёх способов. Генератор: прогресс, в конце — { P, V, eps(порог), A, I }. */
  /** o.PRIO = 'human' — шаги человека лежат во втором буфере и дают половину каждого пакета (как вмешательства в HIL-SERL). */
  function* finetune(base, eps, method, o) {
    o = Object.assign({}, CFG, o || {}); const T = transitions(eps), P = clonePolicy(base), seed = o.SEED * 100 + METHODS.indexOf(method) + 3, po = Object.assign({}, o, { STEPS: o.STEPS_FT });
    const prio = o.PRIO === 'human' ? Int32Array.from(Array.from(allIdx(T)).filter((j) => T.WHO[j])) : null;
    if (method === 'success') { const idx = Int32Array.from(Array.from(allIdx(T)).filter((j) => eps[T.EP[j]].outcome === 'goal')); yield* trainPolicy(P, T, idx, null, po, seed, prio); return { P, T, idx }; }
    if (method === 'all') { yield* trainPolicy(P, T, allIdx(T), null, po, seed, prio); return { P, T }; }
    const V = valueNet(o.SEED * 1000 + 31, o); yield* trainValue(V, T, o, seed);
    const A = advantages(V, T, o.NSTEP), eps0 = threshold(A, o.POS_SHARE), I = labels(A, T, eps0);
    yield* trainPolicy(P, T, allIdx(T), (j) => I[j], po, seed, prio);
    return { P, T, V, A, I, eps: eps0, prio };
  }
  function run(gen) { let r; while (!(r = gen.next()).done) { /* синхронно */ } return r.value; }

  const API = { CFG, DM, OD, AD, ID, ARM, L1, L2, fk, jac, ik, stepQ, goalOf, inOpening, hitsWall, inNiche, startOf, danger, safe, STEP_S, RESET_S, observe, envStep, teacher, rollout, demos,
    net, clone, fwd, bwd, adam, policy, clonePolicy, act, transitions, trainPolicy, allIdx, returns, valueNet, trainValue, vOf, advantages, threshold, labels,
    evalStarts, starts, evaluate, summarize, trainBase, collect, collectWithTeacher, METHODS, finetune, run, randn, clamp, begin, stepEp,
    /** Политика по N демонстрациям для кривой лаборатории 3: шагов обучения — STEPS_BC + STEPS_PER_DEMO · N. */
    trainDemoPolicy: function* (n, o) { o = Object.assign({}, CFG, o || {}); const D = demos(n, o.SEED), T = transitions(D), P = policy(o.SEED * 1000 + 17, o); yield* trainPolicy(P, T, allIdx(T), null, Object.assign({}, o, { STEPS: o.STEPS_BC + o.STEPS_PER_DEMO * n }), o.SEED); return { P, D, T }; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L57 = API;
})(typeof window !== 'undefined' ? window : globalThis);
