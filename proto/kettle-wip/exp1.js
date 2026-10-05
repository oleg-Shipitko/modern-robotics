'use strict';
const C = require('./core.js');
const { rng, randn, clamp, RA, RK, V, UMAX, START, T, K0 } = C;
const norm = (x, y) => [(x - 300) / 60, (y - 215) / 160];
function pairs(demos) {
  const X = [], Y = [];
  for (const d of demos) for (let t = 0; t < d.pts.length - 1; t++) { const p = d.pts[t], q = d.pts[t + 1]; X.push(norm(p.x, p.y)); Y.push((q.x - p.x) / V); }
  return { X, Y };
}
function trainReg(demos, o) {
  o = o || {};
  const { X, Y } = pairs(demos), net = C.mlp([2, o.hid || 32, o.hid || 32, 1], o.seed || 3, o.act || 'tanh'), r = rng(o.seed || 3), bs = 64, it = o.iters || 1500;
  for (let k = 0; k < it; k++) {
    for (let b = 0; b < bs; b++) { const i = Math.floor(r() * X.length), cache = {}; const y = C.fwd(net, X[i], cache); C.bwd(net, cache, [2 * (y[0] - Y[i])]); }
    C.adam(net, o.lr || 0.003, bs);
  }
  return net;
}
function run(policy, k, seed, o) {
  o = o || {};
  const r = rng(seed); let x = START.x + randn(r) * (o.startJ == null ? 4 : o.startJ), y = START.y, hit = false; const pts = [{ x, y }];
  for (let t = 0; t < T; t++) {
    const dx = clamp(policy(x, y, t, r), -UMAX, UMAX) + randn(r) * (o.noise == null ? 0.5 : o.noise);
    x += dx; y -= V; pts.push({ x, y });
    if (Math.hypot(x - k.x, y - k.y) < RA + RK) hit = true;
  }
  return { hit, pts };
}
const regPol = (net) => (x, y) => C.fwd(net, norm(x, y))[0] * V;
function evalReg(N, pL, seed, o) {
  const demos = C.makeDemos(N, pL, K0, seed, o && o.demo);
  const net = trainReg(demos, o);
  let hits = 0; const peaks = [];
  for (let i = 0; i < (o && o.runs || 10); i++) { const res = run(regPol(net), K0, 1000 + i, o); if (res.hit) hits++; let pk = 0; for (const p of res.pts) if (Math.abs(p.y - K0.y) < 20) pk = Math.max(pk, Math.abs(p.x - 300)); peaks.push(pk.toFixed(0)); }
  return { hits, peaks: peaks.join(' ') };
}
const which = process.argv[2] || 'n';
if (which === 'n') {
  for (const N of [10, 40, 200, 1000]) {
    const out = [];
    for (const s of [1, 2, 3, 4, 5]) { const r = evalReg(N, 0.5, 100 + s, { runs: 20 }); out.push(r.hits); }
    console.log('N', N, 'crashes/20 by data seed:', out.join(' '));
  }
}
if (which === 'p') {
  for (const pL of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
    const out = [];
    for (const s of [1, 2, 3]) { const r = evalReg(40, pL, 100 + s, { runs: 10 }); out.push(r.hits + '(' + r.peaks.split(' ').slice(0, 3).join(',') + ')'); }
    console.log('pL', pL, 'crashes/10:', out.join('  '));
  }
}
module.exports = { trainReg, run, regPol, norm, pairs };
