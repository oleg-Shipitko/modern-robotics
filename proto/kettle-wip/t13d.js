'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const xin = new Float64Array(1);
for (const [name, o] of [['HC32 h48 it2000', { HC: 32, hid: 48, iters: 2000 }], ['HC32 h48 it2000 lr3e-3', { HC: 32, hid: 48, iters: 2000, lr: 0.003 }], ['HC24 h32 it2000', { HC: 24, iters: 2000 }]]) {
  for (const ds of [1, 2, 3]) {
    const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds });
    const t1 = Date.now(); const gmm = K.finish(K.trainGMM13(D.demos, 2, o)); const ms = Date.now() - t1;
    let e0 = 0; for (let t = 0; t < 8; t++) { xin[0] = K.obs13(t); const g = K.gmmEval(gmm.m, xin, 2, gmm.HC); for (const k of [0, 1]) e0 = Math.max(e0, Math.abs(g.mu(k, 0) * K.SC)); }
    const thr = []; for (const H of [16, 20, 22, 24, 26, 28, 30, 32].filter((h) => h <= gmm.HC)) { const b = K.batch13(gmm, K.KETTLE, 20, 1, { mode: 'chunk', H }); thr.push(H + ':' + b.touches); }
    const st = K.batch13(gmm, K.KETTLE, 20, 1, { mode: 'step' });
    console.log(name, 'data', ds, 'ms', ms, 'max|mu0|', e0.toFixed(1), '| H:touches/20', thr.join(' '), '| step touches', st.touches, 'sw', st.runs.map((q) => q.sw).join(''));
  }
}
