// прототип движка «чайник» — эксперименты
'use strict';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const W = 600, H = 400, RA = 18, RK = 13, V = 6, UMAX = 7;
const START = { x: 300, y: 365 }, GOAL = { x: 300, y: 42 };
const T = Math.round((START.y - GOAL.y) / V);
const K0 = { x: 300, y: 215 };
const WALLS = [[-10, -10, 610, 0], [-10, 400, 610, 410], [-10, -10, 0, 410], [600, -10, 610, 410], [0, 100, 236, 108], [364, 100, 600, 108]];
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// желаемое боковое смещение учителя
function profile(y, k, side, A, w) {
  const u = Math.abs(y - k.y) / w, u0 = (RK + RA + 4) / w;
  const f = u <= u0 ? 1 : u >= 1 ? 0 : smooth((1 - u) / (1 - u0));
  const dk = k.x - 300, C = A;
  const peak = side < 0 ? Math.min(0, dk - C) : Math.max(0, dk + C);
  return peak * f;
}
function demo(k, side, r, o) {
  o = o || {};
  const A = (RK + RA + 9) + Math.abs(randn(r)) * (o.ampJ == null ? 6 : o.ampJ), w = (o.w || 105) + randn(r) * (o.wJ == null ? 12 : o.wJ);
  let x = START.x + randn(r) * (o.startJ == null ? 4 : o.startJ), y = START.y;
  const pts = [{ x, y }];
  let nz = 0;
  for (let t = 0; t < T; t++) {
    const yn = y - V, xs = 300 + profile(yn, k, side, A, w);
    nz = 0.7 * nz + randn(r) * (o.noise == null ? 0.6 : o.noise);
    let dx = clamp(0.5 * (xs - x) + (xs - (300 + profile(y, k, side, A, w))), -UMAX, UMAX) + nz;
    x += dx; y = yn; pts.push({ x, y });
  }
  return { side, pts };
}
function makeDemos(n, pLeft, k, seed, o) {
  const r = rng(seed), nl = Math.round(n * pLeft), sides = [];
  for (let i = 0; i < n; i++) sides.push(i < nl ? -1 : 1);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sides[i], sides[j]] = [sides[j], sides[i]]; }
  return sides.map((s) => demo(k, s, r, o));
}

/* ---------- MLP ---------- */
function mlp(sizes, seed, act) {
  const r = rng(seed), L = [];
  for (let i = 0; i < sizes.length - 1; i++) {
    const nin = sizes[i], nout = sizes[i + 1], Wm = new Float64Array(nin * nout), b = new Float64Array(nout), s = Math.sqrt((act === 'relu' ? 2 : 1) / nin);
    for (let j = 0; j < Wm.length; j++) Wm[j] = randn(r) * s;
    L.push({ nin, nout, W: Wm, b, mW: new Float64Array(nin * nout), vW: new Float64Array(nin * nout), mb: new Float64Array(nout), vb: new Float64Array(nout), gW: new Float64Array(nin * nout), gb: new Float64Array(nout) });
  }
  return { L, act: act || 'tanh', t: 0 };
}
function fwd(net, x, cache) {
  let h = x; const hs = [x];
  for (let li = 0; li < net.L.length; li++) {
    const l = net.L[li], o = new Float64Array(l.nout);
    for (let j = 0; j < l.nout; j++) { let s = l.b[j]; for (let i = 0; i < l.nin; i++) s += h[i] * l.W[i * l.nout + j]; o[j] = s; }
    if (li < net.L.length - 1) for (let j = 0; j < l.nout; j++) o[j] = net.act === 'relu' ? (o[j] > 0 ? o[j] : 0.01 * o[j]) : Math.tanh(o[j]);
    hs.push(o); h = o;
  }
  if (cache) cache.hs = hs;
  return h;
}
function bwd(net, cache, gout) {
  let g = gout; const hs = cache.hs;
  for (let li = net.L.length - 1; li >= 0; li--) {
    const l = net.L[li], hin = hs[li], hout = hs[li + 1];
    if (li < net.L.length - 1) { g = g.slice(); for (let j = 0; j < l.nout; j++) g[j] *= net.act === 'relu' ? (hout[j] > 0 ? 1 : 0.01) : (1 - hout[j] * hout[j]); }
    const gi = new Float64Array(l.nin);
    for (let i = 0; i < l.nin; i++) { let s = 0; for (let j = 0; j < l.nout; j++) { l.gW[i * l.nout + j] += hin[i] * g[j]; s += l.W[i * l.nout + j] * g[j]; } gi[i] = s; }
    for (let j = 0; j < l.nout; j++) l.gb[j] += g[j];
    g = gi;
  }
}
function adam(net, lr, bs) {
  net.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
  for (const l of net.L) {
    for (const [P, G, M, Vv] of [[l.W, l.gW, l.mW, l.vW], [l.b, l.gb, l.mb, l.vb]]) {
      for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; Vv[i] = b2 * Vv[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(Vv[i] / c2) + 1e-8); G[i] = 0; }
    }
  }
}
module.exports = { rng, randn, clamp, W, H, RA, RK, V, UMAX, START, GOAL, T, K0, WALLS, profile, demo, makeDemos, mlp, fwd, bwd, adam, smooth };
