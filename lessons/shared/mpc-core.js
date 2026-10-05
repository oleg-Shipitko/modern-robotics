/* =====================================================================
   shared/mpc-core.js — планирование со скользящим горизонтом (идея MPC).
   Точка едет к цели с постоянной скоростью и выбирает курс. На каждом шаге
   ищем лучший план на H шагов вперёд (метод перекрёстной энтропии по пяти
   узлам курса), исполняем первый шаг и планируем заново. Между стартом и
   целью — ловушка в форме буквы П. Её можно двигать и менять: trap(o)
   строит стены по параметрам, run(H, { walls }) едет среди них.
   Без DOM: работает в браузере и в Node.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  let HIT = 2, NU = 20, NS = 64; // штраф за удар, число случайных и всех кандидатов
  const DT = 0.1, V = 0.5, R = 0.04, KN = 5, START = { x: -0.8, y: 0 }, GOAL = { x: 0.8, y: 0 };
  const YMAX = 0.7;
  /** Ловушка «П», открытая влево: x0 — концы боковых стенок, x1 — внешняя сторона задней стенки, y0 и y1 — нижний и верхний край, t — толщина. */
  function trap(o) { const t = o.t || 0.06; return [{ x0: o.x1 - t, x1: o.x1, y0: o.y0, y1: o.y1 }, { x0: o.x0, x1: o.x1, y0: o.y1 - t, y1: o.y1 }, { x0: o.x0, x1: o.x1, y0: o.y0, y1: o.y0 + t }]; }
  const TRAP = { x0: -0.25, x1: 0.26, y0: -0.32, y1: 0.32, t: 0.06 };
  const WALLS = trap(TRAP); // та же ловушка, что и раньше: задняя стенка 0,2…0,26, боковые −0,25…0,26
  const hitWall = (x, y, walls) => (walls || WALLS).some((w) => x > w.x0 - R && x < w.x1 + R && y > w.y0 - R && y < w.y1 + R) || Math.abs(x) > 1 - R || Math.abs(y) > YMAX - R;
  function headings(knots, H) { const out = new Float32Array(H); for (let k = 0; k < H; k++) { const u = H > 1 ? k / (H - 1) * (KN - 1) : 0, i = Math.min(KN - 2, Math.floor(u)), f = u - i; out[k] = knots[i] * (1 - f) + knots[i + 1] * f; } return out; }
  function rollout(x, y, hs, walls) { const pts = [[x, y]]; let hit = false; for (let k = 0; k < hs.length; k++) { const nx = x + V * DT * Math.cos(hs[k]), ny = y + V * DT * Math.sin(hs[k]); if (hitWall(nx, ny, walls)) { hit = true; break; } x = nx; y = ny; pts.push([x, y]); if (Math.hypot(GOAL.x - x, GOAL.y - y) < 0.05) break; } return { pts, hit }; }
  function cost(ro, H) { let run = 0; for (const [x, y] of ro.pts) run += Math.hypot(GOAL.x - x, GOAL.y - y); const [x, y] = ro.pts[ro.pts.length - 1], d = Math.hypot(GOAL.x - x, GOAL.y - y); return d + 0.3 * run / H + (ro.hit ? HIT : 0); }
  /** Один план: CEM по узлам курса. mean0 — тёплый старт (прошлый план, сдвинутый на шаг). */
  function plan(x, y, H, mean0, r, walls) {
    let mean = mean0 ? Float32Array.from(mean0) : new Float32Array(KN).fill(Math.atan2(GOAL.y - y, GOAL.x - x)), sd = new Float32Array(KN).fill(1.1);
    let best = null; const cands = [];
    for (let it = 0; it < 4; it++) {
      const pop = [];
      for (let s = 0; s < NS; s++) {
        // часть кандидатов — вокруг текущего плана, часть — случайные курсы по всему кругу
        const kn = new Float32Array(KN), uni = s >= NS - NU;
        for (let i = 0; i < KN; i++) kn[i] = uni ? (r() * 2 - 1) * Math.PI : mean[i] + (s === 0 ? 0 : randn(r) * sd[i]);
        const ro = rollout(x, y, headings(kn, H), walls), c = cost(ro, H); pop.push({ kn, ro, c });
        if (it === 3) cands.push(ro.pts);
      }
      pop.sort((a, b) => a.c - b.c); if (!best || pop[0].c < best.c) best = pop[0];
      const el = pop.slice(0, 8);
      for (let i = 0; i < KN; i++) { let m = 0; for (const e of el) m += e.kn[i]; m /= el.length; let v = 0; for (const e of el) v += (e.kn[i] - m) ** 2; mean[i] = m; sd[i] = Math.max(0.08, Math.sqrt(v / el.length)); }
    }
    return { best, cands };
  }
  /** Полный прогон: кадры { x, y, plan, cands } на каждом шаге управления. opts: { seed, T, walls }. */
  function run(H, opts) {
    opts = opts || {}; const r = rng(opts.seed || 11), T = opts.T || 14, walls = opts.walls || WALLS, frames = [];
    let x = START.x, y = START.y, warm = null, reached = false, t = 0;
    for (let k = 0; k < Math.round(T / DT); k++) {
      const p = plan(x, y, H, warm, r, walls), hs = headings(p.best.kn, H);
      frames.push({ x, y, plan: p.best.ro.pts, cands: p.cands });
      const nx = x + V * DT * Math.cos(hs[0]), ny = y + V * DT * Math.sin(hs[0]);
      if (!hitWall(nx, ny, walls)) { x = nx; y = ny; }
      // тёплый старт: тот же план, сдвинутый на шаг вперёд
      warm = new Float32Array(KN); const sh = H > 1 ? (KN - 1) / (H - 1) : 0; for (let i = 0; i < KN; i++) { const u = Math.min(KN - 1, i + sh), j = Math.min(KN - 2, Math.floor(u)), f = u - j; warm[i] = p.best.kn[j] * (1 - f) + p.best.kn[j + 1] * f; }
      t = (k + 1) * DT;
      if (Math.hypot(GOAL.x - x, GOAL.y - y) < 0.05) { reached = true; frames.push({ x, y, plan: [[x, y]], cands: [] }); break; }
    }
    return { frames, reached, t, dist: Math.hypot(GOAL.x - x, GOAL.y - y) };
  }
  /** Есть ли вообще путь от старта до цели среди стен: поиск в ширину по сетке 2 см. */
  function reachable(walls) {
    const h = 0.02, nx = Math.round(2 / h), ny = Math.round(2 * YMAX / h), id = (i, j) => j * (nx + 1) + i, X = (i) => -1 + i * h, Y = (j) => -YMAX + j * h;
    const cell = (p) => [Math.round((p.x + 1) / h), Math.round((p.y + YMAX) / h)];
    const [si, sj] = cell(START), [gi, gj] = cell(GOAL);
    if (hitWall(START.x, START.y, walls) || hitWall(GOAL.x, GOAL.y, walls)) return false;
    const seen = new Uint8Array((nx + 1) * (ny + 1)), q = [[si, sj]]; seen[id(si, sj)] = 1;
    while (q.length) {
      const [i, j] = q.shift(); if (i === gi && j === gj) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > nx || b > ny || seen[id(a, b)]) continue; seen[id(a, b)] = 1; if (!hitWall(X(a), Y(b), walls)) q.push([a, b]); }
    }
    return false;
  }
  const API = { DT, V, R, START, GOAL, WALLS, TRAP, YMAX, trap, hitWall, run, reachable, _set: (o) => { if (o.HIT != null) HIT = o.HIT; if (o.NU != null) NU = o.NU; if (o.NS != null) NS = o.NS; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Mpc = API;
})(typeof window !== 'undefined' ? window : globalThis);
