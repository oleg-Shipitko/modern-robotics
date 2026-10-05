'use strict';
const C = require('./core.js'), E = require('./exp1.js');
const { K0 } = C;
// резкий поздний объезд: ширина w меньше
for (const wv of [70, 55]) {
  for (const sj of [0, 2, 4]) {
    const res = [];
    for (const N of [10, 40, 200, 1000]) {
      const out = [];
      for (const s of [1, 2, 3]) {
        const demos = C.makeDemos(N, 0.5, K0, 100 + s, { w: wv, wJ: 6, ampJ: 4, startJ: sj });
        let dh = 0; for (const d of demos) if (d.pts.some((p) => Math.hypot(p.x - K0.x, p.y - K0.y) < C.RA + C.RK)) dh++; if (dh) out.push('demoHit' + dh);
        const net = E.trainReg(demos);
        let h = 0; for (let i = 0; i < 20; i++) if (E.run(E.regPol(net), K0, 1000 + i, { startJ: sj }).hit) h++;
        out.push(h);
      }
      res.push('N' + N + ':' + out.join(','));
    }
    console.log('w', wv, 'startJ', sj, res.join('  '));
  }
}
