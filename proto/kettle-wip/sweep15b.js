'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const cfgs = JSON.parse(process.argv[2]);
for (const c of cfgs) {
  Object.assign(K.TP, { w: c.w, gap: c.gap, wob: c.wob || 0 }); K.SENS.sx = c.sx;
  const kettle = { x: 300, y: c.ky };
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
  const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse' })); const br = K.batch15(reg, kettle, 20, 1, { Ta: 8 });
  const den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0' }));
  const b8 = K.batch15(den, kettle, 20, 1, { Ta: 8 }), b1 = K.batch15(den, kettle, 20, 1, { Ta: 1 });
  const st = []; for (const steps of [1, 2, 3, 4, 6]) st.push(steps + ':' + K.batch15(den, kettle, 20, 1, { Ta: 8, steps }).touches);
  console.log(JSON.stringify(c), '| reg touch', br.touches, 'L/R', br.left, br.right, '| den8', b8.touches, 'L/R', b8.left, b8.right, 'sw', b8.runs.map((q) => q.sw).join(''), '| den1', b1.touches, 'sw', b1.runs.map((q) => q.sw).join(''), '| steps', st.join(' '));
}
