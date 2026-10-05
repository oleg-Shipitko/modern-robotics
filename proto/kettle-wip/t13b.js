'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
let t1 = Date.now(); const gmm = K.finish(K.trainGMM13(D.demos, 2)); console.log('gmm trained ms', Date.now() - t1);
const xin = new Float64Array(1);
for (const t of [0, 8, 16, 24, 32, 40]) { xin[0] = K.obs13(t); const g = K.gmmEval(gmm.m, xin, 2, gmm.HC); console.log('t', t, 'pi', Array.from(g.pi).map((v) => v.toFixed(2)).join('/'), 'mu0', [0, 1].map((k) => (g.mu(k, 0) * K.SC).toFixed(1)).join('/'), 'mu+10', [0, 1].map((k) => (g.mu(k, 10) * K.SC).toFixed(1)).join('/'), 'sg', Array.from(g.sg).map((v) => (v * K.SC).toFixed(1)).join('/')); }
const bg = K.batch13(gmm, K.KETTLE, 20, 1, { mode: 'chunk', H: K.T }); console.log('chunk T: touches', bg.touches, 'L/R', bg.left, bg.right, 'maxSw', bg.maxSw);
const bs = K.batch13(gmm, K.KETTLE, 20, 1, { mode: 'step' }); console.log('step: touches', bs.touches, 'sw', bs.runs.map((q) => q.sw + (q.touch ? '*' : '')).join(' '));
for (const H of [2, 4, 8, 12, 16, 20, 24, 26, 28, 30, 32, 36, 40, 52]) { const b = K.batch13(gmm, K.KETTLE, 20, 1, { mode: 'chunk', H }); const b2 = K.batch13(gmm, K.KETTLE, 10, 101, { mode: 'chunk', H }); console.log('H', H, 'touch/20', b.touches, 'maxSw', b.maxSw, '| seeds101 touch/10', b2.touches, 'maxSw', b2.maxSw); }
