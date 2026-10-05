'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const k = K.KETTLE;
for (const [hid, it] of [[48, 2000], [40, 1600], [32, 1600], [32, 2000]]) {
  for (const ds of [1, 2]) {
    const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds }); const t0 = Date.now(); const g = K.finish(K.trainGMM13(D.demos, 2, { hid, iters: it })); const ms = Date.now() - t0;
    const c32 = K.batch13(g, k, 50, 1, { mode: 'chunk', H: 32 }); let ok2 = 0; for (let b = 0; b < 20; b++) { const B = K.batch13(g, k, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 2)) ok2++; }
    const th = []; for (const H of [14, 16, 18, 20]) th.push(H + ':' + K.batch13(g, k, 100, 1, { mode: 'chunk', H }).touches);
    const xin = new Float64Array([K.obs13(2)]); const e = K.gmmEval(g.m, xin, 2, g.HC); let mx = 0; for (let t = 0; t < 6; t++) { xin[0] = K.obs13(t); const ee = K.gmmEval(g.m, xin, 2, g.HC); for (const c of [0, 1]) mx = Math.max(mx, Math.abs(ee.mu(c, 0) * K.SC)); }
    console.log('hid', hid, 'it', it, 'data', ds, 'ms', ms, '| H32 touch', c32.touches, 'L/R', c32.left, c32.right, '| M4 ok', ok2 + '/20', '| H', th.join(' '), '| early mu err', mx.toFixed(1), 'pi', Array.from(e.pi).map((v) => v.toFixed(2)).join('/'));
  }
}
