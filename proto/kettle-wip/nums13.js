'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
// «больше данных» как в интерфейсе
const NS = [10, 40, 200, 1000], out = [];
let t0 = Date.now();
for (const N of NS) { let crash = 0, miss = 0; const splits = []; for (let j = 0; j < 20; j++) { const D = K.moreDataDemos(N, j); splits.push(D.nLeft); const reg = K.finish(K.trainReg13(D.demos, { iters: K.MD.iters, seed: 3 + j })); const q = K.moreDataRun(reg, j); if (q.touch) crash++; miss += q.miss; } out.push(`${N}: ${crash}/20 miss ${(miss / 20).toFixed(1)}` + (N === 10 ? ' splits ' + splits.join(',') : '')); }
console.log('more data:', out.join(' | '), 'ms', Date.now() - t0);
for (const base of [77, 11, 1]) { K.MD.base = base; const row = []; for (const N of NS) { let crash = 0; for (let j = 0; j < 20; j++) { const D = K.moreDataDemos(N, j); const reg = K.finish(K.trainReg13(D.demos, { iters: K.MD.iters, seed: 3 + j })); if (K.moreDataRun(reg, j).touch) crash++; } row.push(crash); } console.log('base', base, row.join(' ')); }
