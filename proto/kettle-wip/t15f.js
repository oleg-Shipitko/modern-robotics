'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
K.TP.wob = +(process.env.WOB || 0); K.TP.startJ = +(process.env.SJ || 0);
const ky = +(process.env.KY || 278), kettle = { x: 300, y: ky };
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
let mg = 1e9; for (const d of D.demos) for (let t = 0; t < K.T; t++) { const y = K.START.y - K.V * t; mg = Math.min(mg, Math.hypot(d.xs[t] - kettle.x, y - kettle.y) - K.RA - K.RK); }
console.log('kettle y', ky, 'demo min gap', mg.toFixed(1), 'open', JSON.stringify(D.open));
const ex = K.exact15(D.demos);
for (const Ta of [8, 1]) { const b = K.batch15(ex, kettle, 20, 1, { Ta }); console.log('exact Ta', Ta, 'touch', b.touches, 'L/R', b.left, b.right, 'sw', b.runs.map((q) => q.sw).join('')); }
for (const loss of ['mse', 'l1']) { const reg = K.finish(K.trainReg15(D.demos, { loss })); const b = K.batch15(reg, kettle, 20, 1, { Ta: 8 }); console.log('reg', loss, 'touch', b.touches, '/20'); }
const t0 = Date.now(); const den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0' })); console.log('den ms', Date.now() - t0);
for (const Ta of [8, 1, 16]) { const b = K.batch15(den, kettle, 20, 1, { Ta }); console.log('den Ta', Ta, 'touch', b.touches, 'L/R', b.left, b.right, 'sw', b.runs.map((q) => q.sw).join('')); }
const st = []; for (const steps of [1, 2, 3, 4, 6, 8, 16]) { const b = K.batch15(den, kettle, 10, 1, { Ta: 8, steps }); st.push(steps + ':' + b.touches); } console.log('den steps:touch', st.join(' '));
