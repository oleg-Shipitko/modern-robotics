// Подбор препятствий и целей для интерактива C-space: тени не только «полосы», путь требует обхода.
const L1 = 0.5, L2 = 0.4, LINK = 0.035, N = 96, PI = Math.PI, TAU = 2 * PI;
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const dwrap = (a, b) => wrap(b - a);
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); return Math.hypot(ax + dx * t - px, ay + dy * t - py); }
function fk(q) { const x1 = L1 * Math.cos(q[0]), y1 = L1 * Math.sin(q[0]); return [x1, y1, x1 + L2 * Math.cos(q[0] + q[1]), y1 + L2 * Math.sin(q[0] + q[1])]; }
function make(obs) {
  const collides = (q) => { const [x1, y1, x2, y2] = fk(q); let m = 0; obs.forEach((o, n) => { if (segDist(o.x, o.y, 0, 0, x1, y1) < o.r + LINK || segDist(o.x, o.y, x1, y1, x2, y2) < o.r + LINK) m |= 1 << n; }); return m; };
  const cellQ = (i) => -PI + (i + 0.5) * TAU / N, qCell = (a) => Math.min(N - 1, Math.max(0, Math.floor((wrap(a) + PI) / TAU * N)));
  const occ = new Uint8Array(N * N); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) occ[j * N + i] = collides([cellQ(i), cellQ(j)]);
  function ik(gx, gy) { const d = Math.hypot(gx, gy); const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2); return [1, -1].map((s) => { const t2 = s * Math.acos(Math.max(-1, Math.min(1, c2))); return [wrap(Math.atan2(gy, gx) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2))), wrap(t2)]; }); }
  function plan(q, sols) {
    const goals = sols.filter((s) => !collides(s)); if (!goals.length) return null;
    const si = qCell(q[0]), sj = qCell(q[1]), gc = goals.map((g) => [qCell(g[0]), qCell(g[1])]);
    const g = new Float64Array(N * N).fill(Infinity), vis = new Uint8Array(N * N); const open = [[0, si, sj]]; g[sj * N + si] = 0;
    while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k; const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop(); const id = j * N + i; if (vis[id]) continue; vis[id] = 1;
      const gi = gc.findIndex(([a, b]) => a === i && b === j); if (gi >= 0) return { cost: g[id], goal: goals[gi] };
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { if (!di && !dj) continue; const ni = (i + di + N) % N, nj = (j + dj + N) % N, nid = nj * N + ni; if (occ[nid] && !occ[id]) continue; const ng = g[id] + (di && dj ? Math.SQRT2 : 1); if (ng < g[nid]) { g[nid] = ng; open.push([ng, ni, nj]); } } }
    return null;
  }
  const direct = (a, sols) => Math.min(...sols.filter((s) => !collides(s)).map((s) => Math.hypot(dwrap(a[0], s[0]), dwrap(a[1], s[1])) / (TAU / N)));
  return { collides, occ, ik, plan, direct };
}
// варианты препятствий
const cands = [
  [{ x: 0.5, y: 0.52, r: 0.16 }, { x: -0.52, y: -0.5, r: 0.14 }],
  [{ x: 0.48, y: 0.54, r: 0.17 }, { x: -0.5, y: -0.52, r: 0.15 }],
  [{ x: 0.55, y: 0.45, r: 0.14 }, { x: -0.6, y: -0.38, r: 0.12 }],
  [{ x: 0.5, y: 0.52, r: 0.15 }, { x: -0.52, y: -0.5, r: 0.13 }],
  [{ x: 0.6, y: 0.35, r: 0.14 }, { x: -0.35, y: -0.62, r: 0.13 }],
  [{ x: 0.0, y: 0.72, r: 0.14 }, { x: 0.62, y: -0.36, r: 0.13 }],
  [{ x: 0.42, y: 0.42, r: 0.15 }, { x: -0.46, y: -0.34, r: 0.13 }],
];
cands.forEach((obs, ci) => {
  const M = make(obs);
  let free = 0, l1band = 0; for (let i = 0; i < N * N; i++) if (!M.occ[i]) free++;
  // доля столбцов θ1, полностью занятых (это «полосы» от первого звена)
  for (let i = 0; i < N; i++) { let all = true; for (let j = 0; j < N; j++) if (!M.occ[j * N + i]) { all = false; break; } if (all) l1band++; }
  // кольцо целей, ищем последовательность с обходами
  const pts = []; for (let a = 0; a < 24; a++) for (const r of [0.55, 0.7, 0.82]) pts.push([r * Math.cos(a * TAU / 24), r * Math.sin(a * TAU / 24)]);
  const ok = pts.filter((p) => M.ik(...p).some((s) => !M.collides(s)) && obs.every((o) => Math.hypot(p[0] - o.x, p[1] - o.y) > o.r + 0.08));
  // жадно строим цепочку из 6 целей с максимальным «крюком» (стоимость A* / прямая)
  let q = M.ik(...ok[0]).find((s) => !M.collides(s)); const chain = [ok[0]]; let detSum = 0;
  for (let step = 0; step < 5; step++) {
    let best = null;
    for (const p of ok) { if (chain.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) < 0.4)) continue; const sols = M.ik(...p); const r = M.plan(q, sols); if (!r) continue; const d = M.direct(q, sols); const det = r.cost / Math.max(1, d); if (r.cost > 25 && (!best || det > best.det)) best = { p, det, goal: r.goal, cost: r.cost }; }
    if (!best) break; chain.push(best.p.map((v) => +v.toFixed(2))); q = best.goal; detSum += best.det;
  }
  console.log(ci, 'свободно', (free / N / N * 100).toFixed(0) + '%', 'полос θ1', l1band, 'цепочка', JSON.stringify(chain), 'крюк ср.', (detSum / 5).toFixed(2));
});
