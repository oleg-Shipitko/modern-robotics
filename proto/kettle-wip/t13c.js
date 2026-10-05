'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
const xin = new Float64Array(1);
for (const [name, o] of [['base', {}], ['it2500', { iters: 2500 }], ['HC32', { HC: 32 }], ['HC32 it2500', { HC: 32, iters: 2500 }], ['lr2e-3 it3000', { lr: 0.002, iters: 3000 }]]) {
  const t1 = Date.now(); const gmm = K.finish(K.trainGMM13(D.demos, 2, o)); const ms = Date.now() - t1;
  // ошибка первого шага плана против среднего данных
  let e0 = 0, n = 0; for (let t = 0; t < 8; t++) { xin[0] = K.obs13(t); const g = K.gmmEval(gmm.m, xin, 2, gmm.HC); for (const k of [0, 1]) { e0 = Math.max(e0, Math.abs(g.mu(k, 0) * K.SC - 0)); n++; } }
  xin[0] = K.obs13(0); const g0 = K.gmmEval(gmm.m, xin, 2, gmm.HC);
  console.log(name, 'ms', ms, 'max|mu0| t<8', e0.toFixed(1), 'pi@0', Array.from(g0.pi).map((v) => v.toFixed(2)).join('/'));
}
