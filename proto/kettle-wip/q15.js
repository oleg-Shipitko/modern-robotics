'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const [hid, it, lr] = process.argv.slice(2).map(Number);
let tot = 0, totRuns = 0; const t0 = Date.now(); const rows = [];
for (const [ds, p] of [[1, 0.5], [2, 0.5], [3, 0.5], [1, 0.75], [1, 0.8], [1, 0.9]]) {
  const D = K.makeDemos({ n: 40, pLeft: p, seed: ds });
  const den = K.finish(K.trainDen15(D.demos, { hid, iters: it, pred: 'x0', lr: lr || 0.003 }));
  const b = K.batch15(den, K.KETTLE, 60, 1, { Ta: 8 }); tot += b.touches; totRuns += 60; rows.push(`${ds}/${p}:${b.touches}`);
}
console.log('hid', hid, 'it', it, 'lr', lr || 0.003, 'touches', tot + '/' + totRuns, rows.join(' '), 'ms/model', Math.round((Date.now() - t0) / 6));
