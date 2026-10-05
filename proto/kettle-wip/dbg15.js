'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
Object.assign(K.TP, { w: +process.env.W, gap: 22 }); K.SENS.sx = +process.env.SX;
const kettle = { x: 300, y: +process.env.KY };
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse' }));
for (let i = 1; i <= 8; i++) { const q = K.run15(reg, kettle, i, { Ta: 8, keepPlans: true }); console.log('run', i, q.touch ? 'TOUCH' : 'pass ', 'x:', q.pts.slice(0, 17).map((p) => (p.x - 300).toFixed(0)).join(' '), '| plan0 end', (q.plans[0].c[14] * 50).toFixed(1)); }
// средняя демонстрация
const m = []; for (let t = 0; t <= 16; t++) { let s = 0; for (const d of D.demos) s += d.xs[t] - 300; m.push((s / D.demos.length).toFixed(1)); } console.log('mean demo x:', m.join(' '));
const L = D.demos.find((d) => d.side < 0); console.log('left demo x:', Array.from(L.xs.slice(0, 17)).map((v) => (v - 300).toFixed(0)).join(' '));
