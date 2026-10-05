'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
K.TP.wob = +(process.env.WOB || 4);
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
for (const [hid, it, pred] of [[64, 3000, 'eps'], [64, 3000, 'x0'], [96, 4000, 'x0']]) {
  const t0 = Date.now(); let last; const den = K.finish(K.trainDen15(D.demos, { hid, iters: it, pred }), (e) => { last = e; }); const ms = Date.now() - t0;
  const b8 = K.batch15(den, K.KETTLE, 20, 1, { Ta: 8 }), b1 = K.batch15(den, K.KETTLE, 20, 1, { Ta: 1 });
  const st = []; for (const steps of [1, 2, 3, 4, 6, 8, 16]) { const b = K.batch15(den, K.KETTLE, 10, 1, { Ta: 8, steps }); st.push(steps + ':' + b.touches); }
  console.log(pred, 'hid', hid, 'it', it, 'ms', ms, 'loss', last.loss.toFixed(3), '| Ta8 touch', b8.touches, 'L/R', b8.left, b8.right, 'sw', b8.runs.map((q) => q.sw).join(''), '| Ta1 touch', b1.touches, 'sw', b1.runs.map((q) => q.sw).join(''), '| steps:touch', st.join(' '));
}
