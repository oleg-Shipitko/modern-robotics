'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const kettle = K.KETTLE;
for (const ds of [1, 2]) {
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds });
  let t0 = Date.now(); const den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0' })); const ms = Date.now() - t0;
  const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse' }));
  const b8 = K.batch15(den, kettle, 50, 1, { Ta: 8 }), b1 = K.batch15(den, kettle, 50, 1, { Ta: 1 }), br = K.batch15(reg, kettle, 50, 1, { Ta: 8 });
  const st = []; for (const steps of [1, 2, 3, 4, 6, 8]) st.push(steps + ':' + K.batch15(den, kettle, 50, 1, { Ta: 8, steps }).touches);
  console.log('data', ds, 'ms', ms, '| den Ta8 touch', b8.touches + '/50 L/R', b8.left, b8.right, 'maxFlip', b8.maxFlip, '| Ta1 touch', b1.touches, 'flip>=2 runs', b1.runs.filter((q) => q.flips >= 2).length, '| reg touch', br.touches + '/50', '| steps', st.join(' '));
  // доли для М2
  const row = [];
  for (const p of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) { const DD = K.makeDemos({ n: 40, pLeft: p, seed: ds }); const rg = K.finish(K.trainReg15(DD.demos, { loss: 'mse' })); const dn = K.finish(K.trainDen15(DD.demos, { hid: 64, iters: 3000, pred: 'x0' })); row.push(`${Math.round(p * 100)}: reg ${K.batch15(rg, kettle, 20, 1, { Ta: 8 }).touches} den ${K.batch15(dn, kettle, 20, 1, { Ta: 8 }).touches}`); }
  console.log('   M2 touches/20:', row.join(' | '));
}
