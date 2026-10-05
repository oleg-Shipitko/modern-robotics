'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const k = K.KETTLE;
for (const Kc of [1, 2, 3, 4]) {
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 }); const t0 = Date.now(); const g = K.finish(K.trainGMM13(D.demos, Kc)); const ms = Date.now() - t0;
  const b = K.batch13(g, k, 20, 1, { mode: 'chunk', H: 32 }); const xin = new Float64Array([K.obs13(0)]); const e = K.gmmEval(g.m, xin, Kc, g.HC);
  console.log('K', Kc, 'ms', ms, 'touch', b.touches, 'L/R', b.left, b.right, 'pi@0', Array.from(e.pi).map((v) => v.toFixed(2)).join('/'));
}
for (const N of [10, 100, 200]) { const D = K.makeDemos({ n: N, pLeft: 0.5, seed: 1 }); let t0 = Date.now(); const reg = K.finish(K.trainReg13(D.demos)); const g = K.finish(K.trainGMM13(D.demos, 2)); const ms = Date.now() - t0; const br = K.batch13(reg, k, 10, 1), bg = K.batch13(g, k, 10, 1, { mode: 'chunk', H: 32 }); console.log('N', N, 'train ms', ms, 'reg', br.touches, 'gmm', bg.touches, bg.left, bg.right); }
