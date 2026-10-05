'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const cfgs = JSON.parse(process.argv[2]);
for (const c of cfgs) {
  Object.assign(K.TP, { w: c.w, gap: c.gap, wob: c.wob || 0 }); K.SENS.sx = c.sx;
  const kettle = { x: 300, y: c.ky };
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
  const t0 = Date.now(); const den = K.finish(K.trainDen15(D.demos, { hid: c.hid || 64, iters: c.it || 3000, pred: 'x0' })); const ms = Date.now() - t0;
  const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse' })); const br = K.batch15(reg, kettle, 40, 1, { Ta: 8 });
  const out = [];
  for (const Ta of [8, 1]) { const b = K.batch15(den, kettle, 60, 1, { Ta }); out.push(`Ta${Ta} touch ${b.touches}/60 maxFlip ${b.maxFlip} runsFlip>=2 ${b.runs.filter((q) => q.flips >= 2).length}`); }
  const st = []; for (const steps of [1, 2, 3, 4]) st.push(steps + ':' + K.batch15(den, kettle, 30, 1, { Ta: 8, steps }).touches + '/30');
  // толчки
  const pc = [];
  for (const Ta of [1, 2, 4, 8, 16]) { let ok = 0; for (let i = 0; i < 40; i++) { const r = K.rng(5000 + i); const tp = (c.p0 || 3) + Math.floor(r() * (c.pw || 12)), dx = (r() < 0.5 ? -1 : 1) * (c.push || 35); const q = K.run15(den, kettle, 900 + i, { Ta, push: { t: tp, dx } }); if (!q.touch) ok++; } pc.push(Ta + ':' + ok + '/40'); }
  console.log(JSON.stringify(c), 'ms', ms, '| reg', br.touches + '/40', '|', out.join(' | '), '| steps', st.join(' '), '| push', pc.join(' '));
}
