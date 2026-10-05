'use strict';
const K = require(process.env.HOME + '/Documents/robotics-course/lessons/shared/kettle-core.js');
// диффузия: 200 прогонов
const D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 }); const dif = K.diff13(D.demos);
let t0 = Date.now(); const b = K.batch13(dif, K.KETTLE, 200, 1); console.log('diff 200: touch', b.touches, 'L/R', b.left, b.right, 'maxSw', b.maxSw, 'ms', Date.now() - t0);
// М3: где чайник делает данные одномодальными
const grid = [];
for (let y = 112; y <= 340; y += 12) { let row = ''; for (let x = 222; x <= 378; x += 6) { const k = { x, y }; if (!K.kettleOK(k)) { row += '#'; continue; } const s = K.sides(k); const on = K.onRoute(k); row += !s.left && !s.right ? 'X' : (!s.left || !s.right) ? (on ? 'U' : 'u') : (on ? 'b' : '.'); } grid.push(y + ' ' + row); }
console.log('x 222..378 шаг 6; U — одна сторона и на маршруте; b — две стороны и на маршруте; X — проезда нет\n' + grid.join('\n'));
// пример: чайник у края проёма
for (const k of [{ x: 275, y: 130 }, { x: 270, y: 150 }, { x: 330, y: 140 }, { x: 300, y: 130 }]) {
  const DD = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1, kettle: k }); if (DD.blocked) { console.log(JSON.stringify(k), 'blocked'); continue; }
  const reg = K.finish(K.trainReg13(DD.demos)); const bb = K.batch13(reg, k, 10, 1);
  console.log(JSON.stringify(k), 'open', JSON.stringify(DD.open), 'L/R', DD.nLeft, DD.nRight, 'onRoute', K.onRoute(k), 'reg touch', bb.touches);
}
