// вариант 2: оператор стартует с разных мест, сторона объезда не зависит от старта
'use strict';
const C = require('./core.js');
const { rng, randn, clamp, RA, RK, V, UMAX, START, T, K0, smooth } = C;
const P = { spread: 26, approach: 0.0, ampBase: RK + RA + 10, ampJ: 5, w: 110, wJ: 10, noise: 0.5 };
// фаза объезда φ(y): 0 до начала, 1 на «полке» у чайника
function phi(y, k, w) { const u = Math.abs(y - k.y) / w, u0 = (RK + RA + 4) / w; return u <= u0 ? 1 : u >= 1 ? 0 : smooth((1 - u) / (1 - u0)); }
function demo2(k, side, r, o) {
  o = Object.assign({}, P, o || {});
  const A = o.ampBase + Math.abs(randn(r)) * o.ampJ, w = o.w + randn(r) * o.wJ;
  const x0 = START.x + (r() * 2 - 1) * o.spread;
  const dk = k.x - 300, peak = side < 0 ? Math.min(0, dk - A) : Math.max(0, dk + A);
  // желаемая траектория: от старта сходимся к профилю объезда; сходимость синхронна с фазой
  const target = (y) => { const f = phi(y, k, w), conv = y > k.y ? f : 1; return 300 + (x0 - 300) * (1 - conv) + peak * f; };
  let x = x0, y = START.y, nz = 0; const pts = [{ x, y }];
  for (let t = 0; t < T; t++) {
    const yn = y - V, xs = target(yn);
    nz = 0.6 * nz + randn(r) * o.noise;
    const dx = clamp(0.6 * (xs - x) + (xs - target(y)), -UMAX, UMAX) + nz;
    x += dx; y = yn; pts.push({ x, y });
  }
  return { side, pts, x0 };
}
function makeDemos2(n, pLeft, k, seed, o) {
  const r = rng(seed), nl = Math.round(n * pLeft), sides = [];
  for (let i = 0; i < n; i++) sides.push(i < nl ? -1 : 1);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sides[i], sides[j]] = [sides[j], sides[i]]; }
  return sides.map((s) => demo2(k, s, r, o));
}
module.exports = { P, phi, demo2, makeDemos2 };
