'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
for (const wob of [0, 2, 3, 4, 6]) {
  K.TP.wob = wob;
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
  let dh = 0, mg = 1e9; for (const d of D.demos) for (let t = 0; t < K.T; t++) { const y = K.START.y - K.V * t; mg = Math.min(mg, Math.hypot(d.xs[t] - K.KETTLE.x, y - K.KETTLE.y) - K.RA - K.RK); }
  const ex = K.exact15(D.demos), b8 = K.batch15(ex, K.KETTLE, 20, 1, { Ta: 8 }), b1 = K.batch15(ex, K.KETTLE, 20, 1, { Ta: 1 });
  const out = [];
  for (const loss of ['l1', 'mse']) { const reg = K.finish(K.trainReg15(D.demos, { loss })); const b = K.batch15(reg, K.KETTLE, 20, 1, { Ta: 8 }); out.push(`${loss} touch ${b.touches}/20`); }
  console.log('wob', wob, 'demo min gap', mg.toFixed(1), '| exact Ta8 touch', b8.touches, 'L/R', b8.left, b8.right, '| Ta1 touch', b1.touches, 'sw', b1.runs.map((q) => q.sw).join(''), '|', out.join(' | '));
}
