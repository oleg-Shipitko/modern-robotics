/* =====================================================================
   l51/engine.js — движок урока 5.1 «Основы RL: награда, ценность,
   преимущество». Без DOM: работает в браузере (window.L51) и в Node
   (require). Всё детерминировано, поэтому числа в тексте урока совпадают
   с тем, что видит читатель.

   Мир — квартира Ады из урока 0.4 (6 × 4 м), сетка 12 × 8 клеток по 50 см.
   Слева две спальни, посередине гостиная, справа кухня. Ада ездит на
   колёсной базе: в каждой клетке четыре действия — вверх, вправо, вниз,
   влево по плану. Переходы детерминированы: въехать в стену или мебель
   нельзя, Ада остаётся на месте.
   Награда за шаг s → s′:
     step                — за каждый шаг (по умолчанию 0);
     + goal              — если s′ — клетка у плиты (эпизод кончается);
     + puddle            — если s′ — лужа у мойки (по умолчанию −1).
   Цель — клетка у плиты; к ней два подъезда: мимо мойки (через лужу)
   и вокруг кухонного стола — на 2 шага длиннее.
   ===================================================================== */
'use strict';
(function (root) {
  const NX = 12, NY = 8, CELL = 50, N = NX * NY;
  const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const ANAME = ['вверх', 'вправо', 'вниз', 'влево'];
  const ARROW = ['↑', '→', '↓', '←'];
  const id = (i, j) => j * NX + i;
  const ij = (s) => [s % NX, (s / NX) | 0];

  /* ---------- план квартиры ---------- */
  /** Мебель — занятые клетки: [i0, j0, i1, j1] включительно, название. */
  const FURN = [
    { r: [0, 0, 1, 1], name: 'кровать' }, { r: [3, 0, 3, 0], name: 'тумба' },
    { r: [0, 4, 1, 5], name: 'кровать' }, { r: [3, 4, 3, 4], name: 'тумба' },
    { r: [5, 4, 6, 4], name: 'стол' }, { r: [7, 5, 7, 7], name: 'диван' },
    { r: [8, 0, 9, 0], name: 'мойка' }, { r: [10, 0, 11, 0], name: 'плита' },
    { r: [9, 2, 10, 2], name: 'стол' }, { r: [10, 6, 11, 7], name: 'холодильник' },
  ];
  /** Стены между клетками: вертикальные — x = 4 и x = 8 (между столбцами 3|4 и 7|8), горизонтальная — y = 4 (между строками 3|4) у спален. */
  const DOORS = { x4: [2, 6], x8: [3, 4] };          // строки, где в стене x = 4 и x = 8 проём
  const ROOMS = [['спальня', 2, 2.6], ['спальня', 2, 6.6], ['гостиная', 6, 0.9], ['кухня', 10, 4.4]];
  const START = id(1, 2), GOAL = id(10, 1), PUDDLE = id(9, 1);
  const blocked = new Uint8Array(N);
  for (const f of FURN) { const [i0, j0, i1, j1] = f.r; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[id(i, j)] = 1; }
  /** Есть ли стена между клетками (i, j) и (i + di, j + dj). */
  function wall(i, j, di, dj) {
    if (di) { const x = Math.max(i, i + di); if (x === 4) return !DOORS.x4.includes(j); if (x === 8) return !DOORS.x8.includes(j); return false; }
    if (dj) { const y = Math.max(j, j + dj); if (y === 4 && i <= 3) return true; }
    return false;
  }
  /** Куда приедет Ада из s по действию a (детерминированно). */
  const NEXT = new Int16Array(N * 4);
  for (let s = 0; s < N; s++) {
    const [i, j] = ij(s);
    for (let a = 0; a < 4; a++) {
      const ni = i + DX[a], nj = j + DY[a];
      const ok = !blocked[s] && ni >= 0 && nj >= 0 && ni < NX && nj < NY && !blocked[id(ni, nj)] && !wall(i, j, DX[a], DY[a]);
      NEXT[s * 4 + a] = ok ? id(ni, nj) : s;
    }
  }
  const FREE = []; for (let s = 0; s < N; s++) if (!blocked[s]) FREE.push(s);
  /** Отрезки стен для рисования: [x0, y0, x1, y1] в клетках. */
  function wallSegments() {
    const seg = [];
    for (let j = 0; j < NY; j++) { if (!DOORS.x4.includes(j)) seg.push([4, j, 4, j + 1]); if (!DOORS.x8.includes(j)) seg.push([8, j, 8, j + 1]); }
    seg.push([0, 4, 4, 4]);
    return seg;
  }

  /* ---------- награды ---------- */
  const DEF = { goal: 10, puddle: -1, step: 0 };
  /** Мир с наградами: o = { goal, puddle, step, dry } — dry: лужу вытерли. */
  function world(o) {
    o = Object.assign({}, DEF, o || {});
    const R = new Float64Array(N * 4);
    for (let s = 0; s < N; s++) for (let a = 0; a < 4; a++) {
      const t = NEXT[s * 4 + a];
      R[s * 4 + a] = o.step + (t === GOAL ? o.goal : 0) + (t === PUDDLE && !o.dry ? o.puddle : 0);
    }
    return { o, R, term: (s) => s === GOAL };
  }
  const reward = (W, s, a) => W.R[s * 4 + a];
  const next = (s, a) => NEXT[s * 4 + a];

  /* ---------- уравнение Беллмана и итерация ценности ---------- */
  /** Q(s, a) = r(s, a) + γ V(s′); у цели V = 0 (эпизод кончился). */
  function qOf(W, V, g, s, a) { const t = next(s, a); return reward(W, s, a) + g * (t === GOAL ? 0 : V[t]); }
  /** Одна итерация ценности (синхронно, по старым оценкам): V_{k+1}(s) = max_a [r + γ V_k(s′)]. */
  function viSweep(W, V, g) {
    const out = new Float64Array(N); let delta = 0;
    for (const s of FREE) {
      if (s === GOAL) continue;
      let best = -Infinity; for (let a = 0; a < 4; a++) best = Math.max(best, qOf(W, V, g, s, a));
      out[s] = best; delta = Math.max(delta, Math.abs(best - V[s]));
    }
    return { V: out, delta };
  }
  /** Итерации от нулевых оценок до сходимости (|ΔV| < tol) или maxIt; история оценок по итерациям. */
  function valueIteration(W, g, o) {
    o = Object.assign({ tol: 1e-9, maxIt: 3000 }, o || {});
    let V = new Float64Array(N); const hist = [V]; let it = 0, delta = Infinity;
    while (it < o.maxIt && delta >= o.tol) { const r = viSweep(W, V, g); V = r.V; delta = r.delta; hist.push(V); it++; }
    return { V, hist, iters: it, converged: delta < o.tol };
  }
  /** Номер итерации, на которой оценка клетки s впервые стала ненулевой. */
  function firstNonzero(hist, s) { for (let k = 0; k < hist.length; k++) if (Math.abs(hist[k][s]) > 1e-12) return k; return -1; }
  /** Номер последней итерации, на которой изменилась хоть одна оценка (дальше — без изменений). */
  function lastChange(hist, tol) { tol = tol || 1e-12; let last = 0; for (let k = 1; k < hist.length; k++) { let d = 0; for (const s of FREE) d = Math.max(d, Math.abs(hist[k][s] - hist[k - 1][s])); if (d > tol) last = k; } return last; }
  /** Жадная политика: в каждой клетке действие с наибольшим Q; при равенстве — первое по порядку ↑ → ↓ ←. */
  function greedy(W, V, g) {
    const pi = new Int8Array(N).fill(-1);
    for (const s of FREE) {
      if (s === GOAL) continue;
      let best = -Infinity, ba = 0;
      for (let a = 0; a < 4; a++) { const q = qOf(W, V, g, s, a); if (q > best + 1e-12) { best = q; ba = a; } }
      pi[s] = ba;
    }
    return pi;
  }
  /** Поездка по политике из s0: клетки, награды, отдача, была ли лужа, доехала ли до цели. */
  function rollout(W, pi, g, s0, maxSteps) {
    maxSteps = maxSteps || 60;
    const cells = [s0], rewards = []; let s = s0, ret = 0, disc = 1, puddle = false, done = false, loop = false;
    const seen = new Set([s0]);
    for (let t = 0; t < maxSteps; t++) {
      if (s === GOAL) { done = true; break; }
      const a = pi[s]; if (a < 0) break;
      const r = reward(W, s, a), t2 = next(s, a);
      rewards.push(r); ret += disc * r; disc *= g;
      if (t2 === PUDDLE) puddle = true;
      s = t2; cells.push(s);
      if (s === GOAL) { done = true; break; }
      if (seen.has(s)) { loop = true; break; }
      seen.add(s);
    }
    return { cells, rewards, ret, puddle, done, loop, steps: rewards.length };
  }
  /** Отдача с каждого шага: G_t = r_{t+1} + γ G_{t+1}, считается с конца. */
  function returns(rewards, g) { const G = new Array(rewards.length).fill(0); let acc = 0; for (let t = rewards.length - 1; t >= 0; t--) { acc = rewards[t] + g * acc; G[t] = acc; } return G; }

  /* ---------- оценка политики, преимущество, итерация политики ---------- */
  /** Ценность детерминированной политики: V^π(s) = r(s, π(s)) + γ V^π(s′), итерациями до сходимости. */
  function evaluate(W, pi, g, tol) {
    tol = tol || 1e-12; let V = new Float64Array(N);
    for (let it = 0; it < 20000; it++) {
      const out = new Float64Array(N); let d = 0;
      for (const s of FREE) { if (s === GOAL || pi[s] < 0) continue; const v = qOf(W, V, g, s, pi[s]); out[s] = v; d = Math.max(d, Math.abs(v - V[s])); }
      V = out; if (d < tol) break;
    }
    return V;
  }
  /** Q^π и преимущество A^π(s, a) = Q^π(s, a) − V^π(s) для всех клеток и действий. */
  function advantage(W, pi, g) {
    const V = evaluate(W, pi, g), Q = new Float64Array(N * 4), A = new Float64Array(N * 4);
    for (const s of FREE) { if (s === GOAL) continue; for (let a = 0; a < 4; a++) { const q = qOf(W, V, g, s, a); Q[s * 4 + a] = q; A[s * 4 + a] = q - V[s]; } }
    return { V, Q, A };
  }
  /** Улучшение политики: в каждой клетке — действие с наибольшим преимуществом (если оно больше нуля, иначе прежнее). */
  function improve(W, pi, g) {
    const { A } = advantage(W, pi, g), out = Int8Array.from(pi); let changed = 0;
    for (const s of FREE) {
      if (s === GOAL) continue;
      let best = 1e-9, ba = -1; for (let a = 0; a < 4; a++) if (A[s * 4 + a] > best) { best = A[s * 4 + a]; ba = a; }
      if (ba >= 0) { out[s] = ba; changed++; }
    }
    return { pi: out, changed };
  }
  /** Итерация политики: оценить → улучшить, пока улучшать есть что. Раунды с политикой, отдачей из спальни и числом переключённых клеток. */
  function policyIteration(W, pi0, g, maxRounds) {
    maxRounds = maxRounds || 50; const rounds = []; let pi = Int8Array.from(pi0);
    for (let r = 0; r < maxRounds; r++) {
      const V = evaluate(W, pi, g), imp = improve(W, pi, g);
      rounds.push({ pi, V, startV: V[START], changed: imp.changed });
      if (!imp.changed) break;
      pi = imp.pi;
    }
    return rounds;
  }

  /* ---------- привычная Ада: политика по демонстрациям ---------- */
  /** Оператор вёл Аду из спальни длинной дорогой: вдоль верхней стены гостиной, подальше от стола, и вокруг
   *  кухонного стола справа. Где оператор не ездил, политика повторяет самое частое действие из данных — «вправо». */
  const DEMO = [[1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [11, 2], [11, 1], [10, 1]];
  function habitPolicy() {
    const pi = new Int8Array(N).fill(-1);
    for (const s of FREE) if (s !== GOAL) pi[s] = RIGHT;
    for (let k = 0; k + 1 < DEMO.length; k++) {
      const [i, j] = DEMO[k], [i2, j2] = DEMO[k + 1];
      pi[id(i, j)] = DX.findIndex((d, a) => d === i2 - i && DY[a] === j2 - j);
    }
    return pi;
  }

  /* ---------- маршруты на кухне и пороги для разборов ---------- */
  const DOOR = id(8, 3);                              // клетка за кухонной дверью: здесь маршруты расходятся
  const VIA_SINK = [[8, 3], [8, 2], [8, 1], [9, 1], [10, 1]].map(([i, j]) => id(i, j));
  const AROUND = [[8, 3], [9, 3], [10, 3], [11, 3], [11, 2], [11, 1], [10, 1]].map(([i, j]) => id(i, j));
  /** Отдача вдоль заданной цепочки клеток (соседних), начиная с первой. */
  function pathReturn(W, cells, g) {
    const rw = [];
    for (let k = 0; k + 1 < cells.length; k++) { const a = DX.findIndex((d, q) => cells[k] + d + DY[q] * NX === cells[k + 1]); rw.push(reward(W, cells[k], a)); }
    return { rewards: rw, G: returns(rw, g)[0] };
  }
  /** Едет ли Ада по жадной политике через лужу. */
  function viaPuddle(o, g) { const W = world(o), vi = valueIteration(W, g); return rollout(W, greedy(W, vi.V, g), g, START).puddle; }
  /** Двоичный поиск порога на [lo, hi], где меняется ответ fn. */
  function threshold(fn, lo, hi, it) { let a = lo, b = hi; const fa = fn(a); for (let k = 0; k < (it || 40); k++) { const m = (a + b) / 2; if (fn(m) === fa) a = m; else b = m; } return (a + b) / 2; }

  /* ---------- прогноз отдачи: маршрут из спальни к плите ---------- */
  /** Задачи прогноза. Маршрут — кратчайший путь из спальни к плите без лужи (12 шагов).
   *  'g09': +10 у плиты, γ = 0,9; 'g05': то же, γ = 0,5; 'steps': награда как у π*0.6 —
   *  −1 за каждый шаг, 0 за последний, успешный, γ = 1. */
  const FORECAST = { g09: { g: 0.9, r: (k, n) => (k === n - 1 ? 10 : 0) }, g05: { g: 0.5, r: (k, n) => (k === n - 1 ? 10 : 0) }, steps: { g: 1, r: (k, n) => (k === n - 1 ? 0 : -1) } };
  let ROUTE0 = null;
  /** Кратчайший маршрут без лужи — по итерации ценности при γ = 0,9. */
  function shortRoute() {
    if (!ROUTE0) { const W0 = world({ dry: true }), vi = valueIteration(W0, 0.9); ROUTE0 = rollout(W0, greedy(W0, vi.V, 0.9), 0.9, START).cells; }
    return ROUTE0;
  }
  function forecast(kind) {
    const F = FORECAST[kind], cells = shortRoute(), n = cells.length - 1, rw = [];
    for (let k = 0; k < n; k++) rw.push(F.r(k, n));
    return { kind, g: F.g, cells, rewards: rw, G: returns(rw, F.g) };
  }
  /** Средняя абсолютная ошибка прогноза по шагам (null — шаг не нарисован). */
  function forecastError(pred, G) { let s = 0, n = 0, worst = 0, at = -1; for (let t = 0; t < G.length; t++) { if (pred[t] == null) return { mae: Infinity, missing: true }; const e = Math.abs(pred[t] - G[t]); s += e; n++; if (e > worst) { worst = e; at = t; } } return { mae: s / n, worst, at, missing: false }; }

  const API = {
    NX, NY, CELL, N, UP, RIGHT, DOWN, LEFT, DX, DY, ANAME, ARROW, FURN, DOORS, ROOMS, START, GOAL, PUDDLE, FREE, DEF,
    id, ij, blocked, wall, next, wallSegments, world, reward, qOf, viSweep, valueIteration, firstNonzero, lastChange, greedy, rollout, returns,
    evaluate, advantage, improve, policyIteration, DEMO, habitPolicy, DOOR, VIA_SINK, AROUND, pathReturn, viaPuddle, threshold, FORECAST, shortRoute, forecast, forecastError,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.L51 = API;
})(typeof window !== 'undefined' ? window : globalThis);
