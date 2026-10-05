'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const cfgs = JSON.parse(process.argv[2]);
for (const c of cfgs) {
  Object.assign(K.TP, { w: c.w, gap: c.gap, wob: c.wob || 0 }); K.SENS.sx = c.sx;
  const kettle = { x: 300, y: c.ky };
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
  const den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0' }));
  for (const Ta of [8, 4, 2, 1]) { const b = K.batch15(den, kettle, 30, 1, { Ta }); console.log(JSON.stringify(c), 'Ta', Ta, 'touch', b.touches, 'L/R', b.left, b.right, 'sw', b.runs.map((q) => q.sw).join(''), 'flips', b.runs.map((q) => q.flips).join('')); }
}
