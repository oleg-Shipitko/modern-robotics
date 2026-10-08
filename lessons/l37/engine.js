/* =====================================================================
   l37/engine.js — движок урока 3.7 «Двухуровневые архитектуры».
   Без DOM: работает в браузере (window.L37) и в Node (module.exports).
   1) Возраст данных: медленная модель с частотой f считает кадр T = 1/f
      секунд подряд, без пауз, плюс задержка сети L; команды руке идут
      200 раз в секунду из последней пачки или от быстрой системы.
   2) Рука Ады догоняет чашку (вид сверху): двухзвенная рука из
      shared/arm-core.js, шаг 1 мс. «Одна модель» ведёт захват туда, где
      чашка была на её кадре; «две системы»: медленная говорит, какую
      чашку брать, быстрая каждые 5 мс видит, где эта чашка сейчас.
      Обе — программы без ошибок восприятия: отличаются только тем,
      когда и что видят.
   ===================================================================== */
'use strict';
(function (root) {
  const Arm = (typeof module !== 'undefined' && module.exports) ? require('../shared/arm-core.js') : root.Arm;

  /* ---------- 1. Возраст данных ---------- */
  const T1 = 0.005;                    // такт быстрой системы и команд руке, с (200 Гц)
  /** Аналитически: возраст данных в установившемся режиме, с. */
  function ages(o) {
    const T = 1 / o.f, L = o.cloud || 0, c = T;
    const slow = { min: c + L, max: c + L + T, mean: c + L + T / 2 };
    const fast = o.fast ? { min: T1, max: 2 * T1, mean: 1.5 * T1 } : null;
    const pos = fast || slow;          // по каким данным рука знает, где чашка
    const v = o.v == null ? 0.15 : o.v;
    return { T, L, c, first: c + L, slow, fast, pos, react: { min: c + L, max: c + L + T }, miss: { min: v * pos.min, max: v * pos.max }, cmdHz: 1 / T1, modelHz: o.f };
  }
  /** Шкала времени на окне [0, W] с: выводы медленной модели, такты быстрой, возраст данных по миллисекундам. */
  function timeline(o, W) {
    W = W || 1; const T = 1 / o.f, L = o.cloud || 0, slow = [];
    for (let k = 0; k * T < W + 1e-9; k++) slow.push({ k, obs: k * T, done: k * T + T, arrive: k * T + T + L });
    const age = [], ageFast = [];
    for (let i = 0; i <= Math.round(W * 1000); i++) {
      const t = i / 1000;
      let last = null; for (const s of slow) if (s.arrive <= t + 1e-9) last = s;
      age.push(last ? t - last.obs : null);
      if (o.fast) { const j = Math.floor(t / T1 + 1e-9) - 1; ageFast.push(j >= 0 ? t - j * T1 : null); }
    }
    return { slow, age, ageFast: o.fast ? ageFast : null, W };
  }

  /* ---------- 2. Рука догоняет чашку ---------- */
  const DT = 0.001, TMAX = 5, VMAX = 0.6, AMAX = 3, TAU = 0.03, K = 25;
  const R_CUP = 0.04, R_CATCH = 0.02, HOLD = 0.15;
  const HAND0 = { x: 0.12, y: 0.38 };
  const TABLE = { x0: -0.62, x1: 0.62, y0: 0.14, y1: 0.92 };
  const RED0 = { x: -0.35, y: 0.62 }, BLUE0 = { x: -0.40, y: 0.30 }, X_END = 0.45;
  const T_SWITCH = 1.05;
  /** Положение чашки в момент t. Красную двигают вправо со скоростью v, у правого края — обратно. Синяя стоит. */
  function cupAt(id, t, o) {
    if (id === 'blue') return { x: BLUE0.x, y: BLUE0.y };
    const span = X_END - RED0.x, s = Math.max(0, (o.v || 0) * t), m = s % (2 * span), d = m <= span ? m : 2 * span - m;
    return { x: RED0.x + d, y: RED0.y };
  }
  const cmdAt = (t, o) => (o.scen === 'switch' && t >= (o.tSw == null ? T_SWITCH : o.tSw) ? 'blue' : 'red');
  function solve2(J, v) { // затухающие наименьшие квадраты для 2×2
    const lam = 0.0004, a = J[0][0], b = J[0][1], c = J[1][0], d = J[1][1];
    const A = [[a * a + c * c + lam, a * b + c * d], [a * b + c * d, b * b + d * d + lam]], r = [a * v.x + c * v.y, b * v.x + d * v.y];
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    return [(A[1][1] * r[0] - A[0][1] * r[1]) / det, (-A[1][0] * r[0] + A[0][0] * r[1]) / det];
  }
  /**
   * Прогон: o = { mode: 'single' | 'dual', f, cloud, v, scen: 'move' | 'switch', tSw }.
   * Кадры каждые 10 мс: { t, q, h, red, blue, aim, d, lat } — d: расстояние до чашки из текущей команды, см.
   */
  function chase(o) {
    const T = 1 / o.f, L = o.cloud || 0, tSw = o.tSw == null ? T_SWITCH : o.tSw;
    let q = Arm.ik(HAND0.x, HAND0.y)[0].slice(), ve = { x: 0, y: 0 }, u = { x: 0, y: 0 };
    const slow = []; for (let k = 0; k * T < TMAX; k++) slow.push({ obs: k * T, arrive: k * T + T + L });
    let si = -1, lat = null, aim = null, near = 0, caught = null, tCatch = null, react = null;
    const frames = [], arrivals = [];
    let lagMin = Infinity, lagMax = 0;
    const nSteps = Math.round(TMAX / DT);
    for (let i = 0; i <= nSteps; i++) {
      const t = i * DT, p = Arm.fk(q), h = { x: p.x, y: p.y };
      // медленная модель: новый вывод пришёл
      while (si + 1 < slow.length && slow[si + 1].arrive <= t + 1e-9) {
        si++; const s = slow[si], id = cmdAt(s.obs, o);
        lat = { id, obs: s.obs, n: si + 1 };
        arrivals.push({ t, obs: s.obs, id });
        if (react == null && o.scen === 'switch' && id === 'blue') react = t - tSw;
        if (o.mode === 'single') aim = cupAt(id, s.obs, o);   // пачка ведёт туда, где чашка была на кадре
      }
      // команда руке — каждые 5 мс
      if (i % 5 === 0 && !caught) {
        if (o.mode === 'dual' && lat) aim = cupAt(lat.id, Math.max(0, t - T1), o); // быстрая система видит кадр 5 мс назад
        u = aim ? { x: K * (aim.x - h.x), y: K * (aim.y - h.y) } : { x: 0, y: 0 };
      }
      if (caught) u = { x: 0, y: 0 };
      // нижний уровень: скорость захвата догоняет команду с запаздыванием τ, с ограничениями
      let ax = (u.x - ve.x) / TAU, ay = (u.y - ve.y) / TAU; const an = Math.hypot(ax, ay); if (an > AMAX) { ax *= AMAX / an; ay *= AMAX / an; }
      ve = { x: ve.x + ax * DT, y: ve.y + ay * DT }; const vn = Math.hypot(ve.x, ve.y); if (vn > VMAX) ve = { x: ve.x * VMAX / vn, y: ve.y * VMAX / vn };
      const dq = solve2(Arm.jac(q), ve); q = [q[0] + dq[0] * DT, q[1] + dq[1] * DT];
      // захват: ближе 2 см к чашке 0,15 с подряд
      const want = cmdAt(t, o), red = cupAt('red', caught === 'red' ? tCatch : t, o), blue = cupAt('blue', t, o);
      const cups = { red, blue };
      if (!caught) {
        let close = null; for (const id of ['red', 'blue']) if (Math.hypot(cups[id].x - h.x, cups[id].y - h.y) < R_CATCH) close = id;
        near = close ? (near && near.id === close ? { id: close, t0: near.t0 } : { id: close, t0: t }) : 0;
        if (near && t - near.t0 >= HOLD - 1e-9) { caught = near.id; tCatch = t; }
        if (t >= 1.5 && t <= 4 && o.scen !== 'switch') { const dd = Math.hypot(cups.red.x - h.x, cups.red.y - h.y); if (lat) { lagMin = Math.min(lagMin, dd); lagMax = Math.max(lagMax, dd); } }
      }
      if (i % 10 === 0) {
        const tc = cups[want], d = caught ? Math.hypot(cups[caught].x - h.x, cups[caught].y - h.y) : Math.hypot(tc.x - h.x, tc.y - h.y);
        frames.push({ t, q: q.slice(), h, red, blue, aim: aim ? { x: aim.x, y: aim.y } : null, d: d * 100, lat: lat ? lat.n : 0, want, caught });
      }
      if (caught && t - tCatch > 0.3) break;
    }
    const wrong = !!caught && caught !== cmdAt(tCatch, o);
    return { mode: o.mode, f: o.f, cloud: L, v: o.v, scen: o.scen || 'move', caught, tCatch, wrong, ok: !!caught && !wrong, react, frames, arrivals, first: T + L, lagMin: isFinite(lagMin) ? lagMin * 100 : null, lagMax: lagMax * 100 };
  }
  /** Обе руки на одной сцене. */
  const pair = (o) => ({ single: chase(Object.assign({}, o, { mode: 'single' })), dual: chase(Object.assign({}, o, { mode: 'dual' })) });

  const API = { T1, ages, timeline, DT, TMAX, VMAX, AMAX, TAU, K, R_CUP, R_CATCH, HOLD, HAND0, TABLE, RED0, BLUE0, X_END, T_SWITCH, cupAt, cmdAt, chase, pair, Arm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L37 = API;
})(typeof window !== 'undefined' ? window : globalThis);
