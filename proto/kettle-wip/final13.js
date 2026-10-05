'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const k = K.KETTLE;
for (const ds of [1, 2]) {
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds });
  const reg = K.finish(K.trainReg13(D.demos)), gmm = K.finish(K.trainGMM13(D.demos, 2)), dif = K.diff13(D.demos);
  const r = K.batch13(reg, k, 10, 1), g = K.batch13(gmm, k, 10, 1, { mode: 'chunk', H: 32 }), d = K.batch13(dif, k, 10, 1), s = K.batch13(gmm, k, 10, 1, { mode: 'step' });
  console.log('data', ds, '| reg', r.touches, '| gmm32', g.touches, 'L/R', g.left, g.right, 'sw', g.maxSw, '| diff', d.touches, 'L/R', d.left, d.right, '| step', s.touches, 'sw', s.runs.map((q) => q.sw + (q.touch ? '*' : '')).join(' '));
  const thr = []; for (const H of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]) { const b = K.batch13(gmm, k, 100, 1, { mode: 'chunk', H }); thr.push(H + ':' + b.touches + '/' + b.maxSw); }
  console.log('   H touches/100 / maxSw:', thr.join(' '));
  let ok = 0, okk = 0; for (let b = 0; b < 30; b++) { const B = K.batch13(gmm, k, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 2)) ok++; if (B.runs.some((q) => q.touch && q.sw >= 3)) okk++; }
  console.log('   M4 batches with touch&sw>=2:', ok + '/30', '>=3:', okk + '/30');
  const row = []; for (const p of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) { const DD = K.makeDemos({ n: 40, pLeft: p, seed: ds }); const rg = K.finish(K.trainReg13(DD.demos)); const b = K.batch13(rg, k, 10, 1); let gap = 1e9; for (const q of b.runs) for (let t = 0; t <= K.T; t++) gap = Math.min(gap, Math.hypot(q.xs[t] - k.x, K.START.y - K.V * t - k.y) - K.RA - K.RK); row.push(`${Math.round(p * 100)}:${b.touches}(${gap.toFixed(1)})`); }
  console.log('   M2 reg touches(min gap):', row.join(' '));
}
