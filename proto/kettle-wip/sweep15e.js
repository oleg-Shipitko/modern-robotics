'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
const cfgs = JSON.parse(process.argv[2]);
for (const c of cfgs) {
  Object.assign(K.TP, { w: c.w, gap: c.gap }); K.SENS.sx = c.sx;
  const kettle = { x: 300, y: c.ky };
  const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle });
  const den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: c.it || 3000, pred: 'x0', kettle }));
  const b8 = K.batch15(den, kettle, 40, 1, { Ta: 8 });
  const pc = [];
  for (const Ta of [1, 2, 4, 8, 16]) { let ok = 0; for (let i = 0; i < 40; i++) { const r = K.rng(5000 + i); const tp = c.p0 + Math.floor(r() * c.pw); const q = K.run15(den, kettle, 900 + i, { Ta, kpush: { t: tp, dx: c.push, toward: true } }); if (!q.touch) ok++; } pc.push(Ta + ':' + ok); }
  console.log(JSON.stringify(c), '| Ta8 no push touch', b8.touches + '/40', '| kettle push ok/40', pc.join(' '));
}
