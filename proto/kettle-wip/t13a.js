'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const t0 = Date.now();
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
console.log('demos', D.nLeft, D.nRight, 'open', JSON.stringify(D.open), 'T', K.T);
// проверка демонстраций: касания и минимальный зазор
let dh = 0, minGap = 1e9; for (const d of D.demos) { for (let t = 0; t < K.T; t++) { const a = { x: d.xs[t], y: K.START.y - K.V * t }, b = { x: d.xs[t + 1], y: K.START.y - K.V * (t + 1) }; if (K.segHit(a, b, K.KETTLE)) { dh++; break; } minGap = Math.min(minGap, Math.hypot(a.x - K.KETTLE.x, a.y - K.KETTLE.y) - K.RA - K.RK); } }
console.log('demo touches', dh, 'min gap', minGap.toFixed(1));
let t1 = Date.now(); const reg = K.finish(K.trainReg13(D.demos)); console.log('reg trained ms', Date.now() - t1);
t1 = Date.now(); const gmm = K.finish(K.trainGMM13(D.demos, 2)); console.log('gmm trained ms', Date.now() - t1);
const dif = K.diff13(D.demos);
const br = K.batch13(reg, K.KETTLE, 10, 1); console.log('reg touches', br.touches, 'maxSw', br.maxSw);
const bg = K.batch13(gmm, K.KETTLE, 10, 1, { mode: 'chunk', H: K.T }); console.log('gmm chunk T touches', bg.touches, 'L/R', bg.left, bg.right, 'maxSw', bg.maxSw);
t1 = Date.now(); const bd = K.batch13(dif, K.KETTLE, 10, 1); console.log('diff touches', bd.touches, 'L/R', bd.left, bd.right, 'maxSw', bd.maxSw, 'ms', Date.now() - t1);
const bs = K.batch13(gmm, K.KETTLE, 10, 1, { mode: 'step' }); console.log('gmm step touches', bs.touches, 'sw', bs.runs.map((q) => q.sw + (q.touch ? '*' : '')).join(' '));
// профиль регрессии и смеси
const xin = new Float64Array(1);
for (const t of [0, 8, 16, 20, 24, 28, 32, 40]) { xin[0] = K.obs13(t); const yr = K.fwd(reg.m, xin)[0] * K.SC; const g = K.gmmEval(gmm.m, xin, 2); console.log('t', t, 'reg', yr.toFixed(1), 'gmm pi', Array.from(g.pi).map((v) => v.toFixed(2)).join('/'), 'mu', Array.from(g.mu).map((v) => (v * K.SC).toFixed(1)).join('/'), 'sg', Array.from(g.sg).map((v) => (v * K.SC).toFixed(1)).join('/')); }
console.log('total ms', Date.now() - t0);
