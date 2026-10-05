'use strict';
const C = require('./core.js'), D = require('./core2.js');
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
// смесь из K гауссиан по Δx
function trainGMM(demos, K, o) {
  o = o || {};
  const { X, Y } = pairs(demos), net = C.mlp([2, o.hid || 32, o.hid || 32, 3 * K], o.seed || 3, 'tanh'), r = rng(o.seed || 3), bs = 64, it = o.iters || 2500;
  const SMIN = 0.04;
  for (let k = 0; k < it; k++) {
    for (let b = 0; b < bs; b++) {
      const i = Math.floor(r() * X.length), cache = {}, out = C.fwd(net, X[i], cache), a = Y[i];
      // out: logits[K], mu[K], logs[K]
      let mx = -1e9; for (let j = 0; j < K; j++) mx = Math.max(mx, out[j]);
      const pi = [], ls = []; let z = 0; for (let j = 0; j < K; j++) { pi[j] = Math.exp(out[j] - mx); z += pi[j]; }
      for (let j = 0; j < K; j++) pi[j] /= z;
      const lp = [], sg = []; let lmx = -1e9;
      for (let j = 0; j < K; j++) { sg[j] = SMIN + Math.exp(out[2 * K + j]); const e = (a - out[K + j]) / sg[j]; lp[j] = Math.log(pi[j] + 1e-12) - 0.5 * e * e - Math.log(sg[j]); lmx = Math.max(lmx, lp[j]); }
      let s = 0; for (let j = 0; j < K; j++) s += Math.exp(lp[j] - lmx);
      const g = new Float64Array(3 * K);
      for (let j = 0; j < K; j++) {
        const rj = Math.exp(lp[j] - lmx) / s, e = (a - out[K + j]) / sg[j];
        g[j] = pi[j] - rj;                                   // d(-log)/d logit
        g[K + j] = -rj * e / sg[j];                          // d/dmu
        g[2 * K + j] = rj * (1 - e * e) * (sg[j] - SMIN) / sg[j]; // d/dlogs
      }
      C.bwd(net, cache, g);
    }
    C.adam(net, o.lr || 0.003, bs);
  }
  net.K = K; net.SMIN = SMIN;
  return net;
}
function gmmOut(net, x, y) {
  const out = C.fwd(net, norm(x, y)), K = net.K; let mx = -1e9; for (let j = 0; j < K; j++) mx = Math.max(mx, out[j]);
  const pi = []; let z = 0; for (let j = 0; j < K; j++) { pi[j] = Math.exp(out[j] - mx); z += pi[j]; }
  return { pi: pi.map((p) => p / z), mu: Array.from(out.slice(K, 2 * K)).map((m) => m * V), sg: Array.from(out.slice(2 * K)).map((l) => (net.SMIN + Math.exp(l)) * V) };
}
function run(policy, k, seed, o) {
  o = o || {};
  const r = rng(seed); let x = START.x + (r() * 2 - 1) * (o.spread == null ? 26 : o.spread), y = START.y, hit = false; const pts = [{ x, y }];
  const st = { k: -1 };
  for (let t = 0; t < T; t++) {
    const dx = clamp(policy(x, y, t, r, st), -UMAX, UMAX) + randn(r) * (o.noise == null ? 0.5 : o.noise);
    x += dx; y -= V; pts.push({ x, y });
    if (Math.hypot(x - k.x, y - k.y) < RA + RK) hit = true;
  }
  // смены стороны у чайника: знак смещения в зоне ±130 см от чайника, с мёртвой зоной 3 см
  let side = 0, sw = 0;
  for (const p of pts) { if (Math.abs(p.y - k.y) > 130) continue; const d = p.x - k.x; const s = d > 3 ? 1 : d < -3 ? -1 : 0; if (s && side && s !== side) sw++; if (s) side = s; }
  return { hit, pts, sw, side };
}
const regPol = (net) => (x, y) => C.fwd(net, norm(x, y))[0] * V;
const gmmPol = (net, H) => (x, y, t, r, st) => {
  const g = gmmOut(net, x, y);
  if (st.k < 0 || t % H === 0) { let u = r(), k = 0; while (k < g.pi.length - 1 && u > g.pi[k]) { u -= g.pi[k]; k++; } st.k = k; }
  return g.mu[st.k];
};
module.exports = { trainReg, trainGMM, gmmOut, run, regPol, gmmPol, norm, pairs };
if (require.main === module) {
  const which = process.argv[2] || 'n';
  if (which === 'n') {
    for (const N of [10, 40, 200, 1000]) {
      const out = [];
      for (const s of [1, 2, 3, 4, 5]) { const demos = D.makeDemos2(N, 0.5, K0, 100 + s); const net = trainReg(demos); let h = 0; for (let i = 0; i < 20; i++) if (run(regPol(net), K0, 1000 + i).hit) h++; out.push(h); }
      console.log('N', N, 'crashes/20 by data seed:', out.join(' '));
    }
  }
  if (which === 'p') {
    for (const pL of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
      const out = [];
      for (const s of [1, 2, 3]) { const demos = D.makeDemos2(40, pL, K0, 100 + s); const net = trainReg(demos); let h = 0; for (let i = 0; i < 10; i++) if (run(regPol(net), K0, 1000 + i).hit) h++; out.push(h); }
      console.log('pL', pL, 'crashes/10:', out.join(' '));
    }
  }
  if (which === 'g') {
    for (const s of [1, 2, 3]) {
      const demos = D.makeDemos2(40, 0.5, K0, 100 + s); const net = trainGMM(demos, 2);
      const g0 = gmmOut(net, 300, 300), g1 = gmmOut(net, 300, 250), g2 = gmmOut(net, 280, 250);
      console.log('seed', s, 'pi@300,300', g0.pi.map((v) => v.toFixed(2)).join('/'), 'mu', g0.mu.map((v) => v.toFixed(1)).join('/'), '| pi@300,250', g1.pi.map((v) => v.toFixed(2)).join('/'), 'mu', g1.mu.map((v) => v.toFixed(1)).join('/'), '| pi@280,250', g2.pi.map((v) => v.toFixed(2)).join('/'));
      for (const H of [1, 2, 4, 6, 8, 10, 12, 16, 20, 30, 60]) {
        let h = 0, swMax = 0, swHit = 0, sides = 0; for (let i = 0; i < 20; i++) { const res = run(gmmPol(net, H), K0, 2000 + i); if (res.hit) { h++; swHit = Math.max(swHit, res.sw); } swMax = Math.max(swMax, res.sw); if (res.side < 0) sides++; }
        console.log('   H', H, 'crash/20', h, 'maxSw', swMax, 'maxSwInCrash', swHit, 'left', sides);
      }
    }
  }
}
