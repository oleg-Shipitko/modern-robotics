'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const k = K.KETTLE;
for (const [hid, it, HC] of [[32, 1600, 24], [32, 1600, 32], [40, 1600, 24]]) {
  for (const ds of [1, 2]) {
    const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds }); const t0 = Date.now(); const g = K.finish(K.trainGMM13(D.demos, 2, { hid, iters: it, HC })); const ms = Date.now() - t0;
    const c = K.batch13(g, k, 50, 1, { mode: 'chunk', H: HC }); let ok2 = 0; for (let b = 0; b < 20; b++) { const B = K.batch13(g, k, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 2)) ok2++; }
    const th = []; for (const H of [14, 16, 18, 20]) th.push(H + ':' + K.batch13(g, k, 100, 1, { mode: 'chunk', H }).touches);
    // ошибка первого элемента плана против среднего данных той же стороны
    let err = 0; const xin = new Float64Array(1);
    for (let t = 0; t < 12; t++) { xin[0] = K.obs13(t); const e = K.gmmEval(g.m, xin, 2, g.HC); const L = D.demos.filter((d) => d.side < 0), R = D.demos.filter((d) => d.side > 0); const mL = L.reduce((s, d) => s + d.xs[t + 1] - 300, 0) / L.length, mR = R.reduce((s, d) => s + d.xs[t + 1] - 300, 0) / R.length; const mus = [e.mu(0, 0) * K.SC, e.mu(1, 0) * K.SC].sort((a, b) => a - b); err = Math.max(err, Math.abs(mus[0] - Math.min(mL, mR)), Math.abs(mus[1] - Math.max(mL, mR))); }
    console.log('hid', hid, 'it', it, 'HC', HC, 'data', ds, 'ms', ms, '| Hmax touch', c.touches, 'L/R', c.left, c.right, '| M4', ok2 + '/20', '| H', th.join(' '), '| first-elem err', err.toFixed(1));
  }
}
