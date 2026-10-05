'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
K.TP.wob = +(process.env.WOB || 4);
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse' }));
for (let i = 1; i <= 12; i++) { const q = K.run15(reg, K.KETTLE, i, { Ta: 8, keepPlans: true }); const at = (t) => (q.pts[t].x - 300).toFixed(1); console.log('run', i, 'touch', q.touch, 'x@8', at(8), 'x@16', at(16), 'x@20', at(20), 'x@24', at(24), 'plan@16 end dx', (q.plans[2].c[30] * 50).toFixed(1)); }
// регрессия: как выход зависит от x в разрыве на t=16
const ob = new Float64Array(4); const y = K.START.y - 16 * K.V;
for (const dx of [-20, -10, -5, -2, 0, 2, 5, 10, 20]) { K.obs15(300 + dx, y + 6, 300 + dx, y, ob); const c = K.fwd(reg.m, ob); console.log('t16 x', dx, '→ chunk dx@8', (c[14] * 50).toFixed(1), '@16', (c[30] * 50).toFixed(1)); }
