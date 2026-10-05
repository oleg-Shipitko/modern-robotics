'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
// «больше данных»: 20 опытов на точку, монетка, регрессия, один прогон
function point(N, its, base) {
  let crash = 0, miss = 0; const t0 = Date.now(); const splits = [];
  for (let j = 0; j < 20; j++) {
    const D = K.makeDemosCoin({ n: N, pLeft: 0.5, seed: (base || 0) + N * 1000 + j }); splits.push(D.nLeft);
    const reg = K.finish(K.trainReg13(D.demos, { iters: its }));
    const q = K.run13(reg, K.KETTLE, 7000 + j);
    if (q.touch) crash++;
    const tk = Math.round((K.START.y - K.KETTLE.y) / K.V); miss += Math.abs(q.xs[tk] - K.KETTLE.x);
  }
  return { crash, miss: miss / 20, ms: Date.now() - t0, splits };
}
for (const its of [400, 1200]) for (const N of [10, 40, 200, 1000]) { const p = point(N, its); console.log('its', its, 'N', N, 'crash/20', p.crash, 'miss', p.miss.toFixed(1), 'ms', p.ms, N === 10 ? 'splits ' + p.splits.join(',') : ''); }
for (const base of [1, 2, 3]) { const row = []; for (const N of [10, 40, 200, 1000]) { const p = point(N, 400, base * 77); row.push(`${N}:${p.crash}/${p.miss.toFixed(1)}`); } console.log('base', base, row.join(' ')); }
