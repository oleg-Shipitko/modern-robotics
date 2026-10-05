'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
const ex = K.exact15(D.demos);
let t0 = Date.now();
for (const Ta of [8, 1, 16]) { const b = K.batch15(ex, K.KETTLE, 20, 1, { Ta }); console.log('exact Ta', Ta, 'touch', b.touches, 'L/R', b.left, b.right, 'sw', b.runs.map((q) => q.sw).join(''), 'ms', Date.now() - t0); t0 = Date.now(); }
for (const loss of ['l1', 'mse']) {
  t0 = Date.now(); const reg = K.finish(K.trainReg15(D.demos, { loss })); const ms = Date.now() - t0;
  const b = K.batch15(reg, K.KETTLE, 10, 1, { Ta: 8 }); console.log('reg15', loss, 'train ms', ms, 'touch', b.touches, 'L/R', b.left, b.right);
}
