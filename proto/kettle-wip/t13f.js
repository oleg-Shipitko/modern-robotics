'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
// M2: доля, при которой регрессия проезжает
for (const ds of [1, 2, 3]) {
  const row = [];
  for (const p of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
    const D = K.makeDemos({ n: 40, pLeft: p, seed: ds }); const reg = K.finish(K.trainReg13(D.demos));
    const b = K.batch13(reg, K.KETTLE, 10, 1); let gap = 1e9; for (const q of b.runs) for (let t = 0; t <= K.T; t++) { const y = K.START.y - K.V * t; gap = Math.min(gap, Math.hypot(q.xs[t] - K.KETTLE.x, y - K.KETTLE.y) - K.RA - K.RK); }
    row.push(`${Math.round(p * 100)}:${b.touches}(${gap.toFixed(1)})`);
  }
  console.log('data', ds, row.join(' '));
}
// M4: доля пачек по 10 прогонов, где есть прогон «касание и ≥3 смены» / «≥2»
for (const ds of [1, 2]) {
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds }); const gmm = K.finish(K.trainGMM13(D.demos, 2));
  let ok3 = 0, ok2 = 0, nb = 30; const hist = {};
  for (let b = 0; b < nb; b++) { const B = K.batch13(gmm, K.KETTLE, 10, 1 + 10 * b, { mode: 'step' }); if (B.runs.some((q) => q.touch && q.sw >= 3)) ok3++; if (B.runs.some((q) => q.touch && q.sw >= 2)) ok2++; for (const q of B.runs) hist[q.sw] = (hist[q.sw] || 0) + 1; }
  console.log('M4 data', ds, 'batches with touch&sw>=3:', ok3 + '/' + nb, ' >=2:', ok2 + '/' + nb, 'sw hist', JSON.stringify(hist));
  // M5: H=26 и 24 на 200 прогонах
  for (const H of [22, 24, 26, 28]) { const B = K.batch13(gmm, K.KETTLE, 200, 1, { mode: 'chunk', H }); console.log('   H', H, 'touch/200', B.touches, 'maxSw', B.maxSw); }
}
