// Цифры урока 0.2 без браузера: движки работают в Node, зёрна фиксированы.
// Запуск: node tools/l02_numbers.js — сверяет числа, которые стоят в текстах урока.
const A = require('../lessons/shared/actuator-core.js');
const { ArmK, ImuK, CMDS } = require('../lessons/l02/engine-l02.js');
const deg = (v) => v * 180 / Math.PI, r1 = (v) => Math.round(v * 10) / 10;
let fails = 0;
const eq = (got, want, what) => { const ok = got === want; console.log(`${ok ? '✓' : '✗'} ${what}: ${got}${ok ? '' : ' (ждём ' + want + ')'}`); if (!ok) fails++; };

console.log('— Редуктор и удар');
eq([6, 30, 100, 160].map((n) => Math.round(A.impact(n, 3).peak)).join(' / '), '134 / 210 / 608 / 978', 'пик удара при 6, 30, 100, 160 : 1, Н·м');
const p6 = A.push(6, 2, -0.3, -1.2), p100 = A.push(100, 2, -0.3, -1.2);
eq(`${Math.round(p6.deg)}° за ${r1(p6.tStop)} с / ${Math.round(p100.deg)}°`, '52° за 0.3 с / 0°', 'толчок 2 Н·м: 6 : 1 и 100 : 1');
const RATIOS = [1, 2, 3, 4, 6, 9, 12, 15, 20, 30, 50, 80, 100, 120, 160];
eq(RATIOS.filter((n) => A.props(n).torque >= 18 && A.impact(n, 3).peak <= 160).join(', '), '12, 15', 'колено: момент ≥ 18 Н·м и удар ≤ 160 Н·м');

console.log('— IMU');
const run = (o) => ImuK.run(Object.assign({ alpha: 0.98 }, o));
const base = run({ alpha: 0.5 });
eq(`${Math.round(base.gyro.end)}° / ${r1(base.acc.rmse)}° / ${r1(base.filt.rmse)}°`, '18° / 4.7° / 3.4°', 'дрейф гироскопа за 10 с / акселерометр / фильтр α = 0,5');
eq(`${r1(run({}).filt.rmse)}° / ${r1(run({ alpha: 1 }).filt.rmse)}°`, '1.5° / 11.2°', 'фильтр α = 0,98 / α = 1');
const AL = [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.96, 0.97, 0.98, 0.99, 0.995, 1];
eq(AL.filter((a) => run({ alpha: a }).filt.rmse < 1.6).join(', '), '0.97, 0.98', 'α, при которых ошибка < 1,6°');
eq([1, 2, 3].map((l) => `${r1(run({ shake: l }).acc.rmse)}/${r1(run({ shake: l }).filt.rmse)}`).join(' '), '6.6/1.5 8.2/1.9 9.5/1.8', 'тряска 1–3: акселерометр/фильтр при α = 0,98');

console.log('— Модель привода');
const tr = (f, o) => { const real = A.track(A.makeReal(o), 5, f), sim = A.track(A.makeSim(), 5, f); return { real, err: deg(A.rmse(real, sim)) }; };
eq(['slow', 'mix', 'fast', 'steps'].map((k) => r1(tr(CMDS[k].f).err)).join(' / '), '1.6 / 3.8 / 5.9 / 4.6', 'разрыв симулятора: медленная / две частоты / быстрая / ступеньки');
const netErr = (T, o, real) => { const d = A.collect(T, 4, o), m = A.mlp(2), g = A.trainGen(m, d, 1500); while (!g.next().done); return { n: d.X.length, err: deg(A.rmse(real, A.track(A.makeSim(A.netTau(m)), 5, CMDS.mix.f))) }; };
const mix = tr(CMDS.mix.f), n20 = netErr(20, undefined, mix.real);
eq(`${r1(mix.err)}° → ${r1(n20.err)}° на ${n20.n}`, '3.8° → 0.6° на 7997', 'модель привода по данным');
eq([2, 5, 10].map((T) => r1(netErr(T, undefined, mix.real).err)).concat(r1(n20.err)).join(' / '), '1.2 / 0.7 / 0.6 / 0.6', 'ошибка от объёма данных: 2 / 5 / 10 / 20 с');
const broken = { delay: 16, backlash: 0 }, br = tr(CMDS.mix.f, broken);
eq(`${r1(br.err)}° / ${r1(netErr(20, broken, br.real).err)}°`, '8.4° / 3.5°', 'задержка 40 мс: симулятор / переобученная сеть');

console.log('— Рука из звеньев');
const two = [true, false].map((up) => ArmK.judge(ArmK.L2, ArmK.ik2(ArmK.L2[0], ArmK.L2[1], ArmK.GRASP[0], ArmK.GRASP[1], up), false));
eq(two.map((j) => `${j.atCup ? 'у чашки' : 'мимо'}, ${j.hit ? 'задевает ' + j.what : 'чисто'}`).join(' | '), 'у чашки, задевает box | у чашки, задевает table', 'две позы двух звеньев');
const q3 = ArmK.convert(ArmK.L2, ArmK.ik2(ArmK.L2[0], ArmK.L2[1], ArmK.GRASP[0], ArmK.GRASP[1], true), ArmK.L3), j3 = ArmK.judge(ArmK.L3, q3, false);
eq(`${j3.atCup && !j3.hit}, запас ${Math.round(j3.clear * 100)} см`, 'true, запас 4 см', 'три сустава у чашки, кисть вертикально');
const lampHit = ArmK.judge(ArmK.L3, q3, true).hit, qe = ArmK.solveElbow(ArmK.L3, q3, ArmK.GRASP, [0.27, 0.32]), je = ArmK.judge(ArmK.L3, qe, true);
eq(`${lampHit} → ${!je.hit}, сдвиг захвата ${je.dist.toFixed(4)} м`, 'true → true, сдвиг захвата 0.0000 м', 'лампа: локоть задевает, после отвода — чисто');

console.log(fails ? `НЕ СОШЛОСЬ: ${fails}` : 'Все цифры сходятся');
process.exit(fails ? 1 : 0);
