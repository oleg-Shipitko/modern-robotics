'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
for (const ds of [1, 2, 3]) {
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: ds });
  const reg = K.finish(K.trainReg13(D.demos)), gmm = K.finish(K.trainGMM13(D.demos, 2)), dif = K.diff13(D.demos);
  const rows = [];
  for (const [nm, pol, o] of [['reg', reg, {}], ['gmm32', gmm, { mode: 'chunk', H: 32 }], ['diff', dif, {}], ['step', gmm, { mode: 'step' }]]) {
    const b = K.batch13(pol, K.KETTLE, 10, 1, o); rows.push(`${nm}: touch ${b.touches} L/R ${b.left}/${b.right} sw ${b.runs.map((q) => q.sw).join('')}`);
  }
  const thr = []; for (const H of [20, 22, 24, 25, 26, 27, 28, 30, 32]) { const b = K.batch13(gmm, K.KETTLE, 10, 1, { mode: 'chunk', H }); thr.push(H + ':' + b.touches + '/' + b.maxSw); }
  console.log('data', ds, '\n  ' + rows.join('\n  ') + '\n  H:touch/maxSw ' + thr.join(' '));
}
