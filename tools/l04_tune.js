// Урок 0.4: все цифры, которые упоминаются в текстах, считаются здесь тем же движком, что в браузере.
// Запуск: node tools/l04_tune.js
const L = require('../lessons/l04/engine.js');
const f1 = (v) => v.toFixed(1), f0 = (v) => v.toFixed(0);
const meanBand = (r) => { let s = 0; for (let i = 0; i < r.P.length; i++) s += 2 * Math.sqrt(r.P[i]); return s / r.P.length; };
const dropCover = (r) => { let c = 0, n = 0; for (let i = 0; i < r.P.length; i++) { const t = i * L.KF.DT; if (t >= L.KF.DROP[0] && t < L.KF.DROP[1]) { n++; if (Math.abs(r.kf[i] - r.d.x[i]) <= 2 * Math.sqrt(r.P[i])) c++; } } return [c, n]; };

console.log('== Калман');
const k1 = L.KF.run({});
console.log(`М1 (σq=1, σr=10, α=0,98): дальномер ${f1(k1.m.raw.rmse)} · компл. ${f1(k1.m.comp.rmse)} · Калман ${f1(k1.m.kf.rmse)} · K в конце ${k1.Kend.toFixed(3)} · одометрия ${f1(k1.m.odo.rmse)} · в полосе ${f0(k1.cover * 100)}% · полоса ±${f1(meanBand(k1))}`);
console.log(`   компл. с α=0,9: ${f1(L.KF.run({ alpha: 0.9 }).m.comp.rmse)} см`);
const k2 = L.KF.run({ sq: 10, sr: 2 });
console.log(`М2 старт (σq=10, σr=2): Калман ${f1(k2.m.kf.rmse)} · в полосе ${f0(k2.cover * 100)}% · полоса ±${f1(meanBand(k2))}`);
const SQ = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20], SR = [1, 2, 5, 10, 20, 50, 100];
const pass2 = []; for (const sq of SQ) for (const sr of SR) { const r = L.KF.run({ sq, sr }); if (r.m.kf.rmse < 4 && r.cover >= 0.9 && meanBand(r) <= 9) pass2.push(`(${sq}, ${sr}): ${f1(r.m.kf.rmse)} см, ${f0(r.cover * 100)}%, ±${f1(meanBand(r))}`); }
console.log('   проходят М2:', pass2.join(' | '));
const pass3 = []; for (const sq of SQ) { const r = L.KF.run({ sq, sr: 10, drop: true }); const [c, n] = dropCover(r); pass3.push(`σq=${sq}: в полосе при провале ${c}/${n}, ошибка ${f1(r.m.kf.rmse)}`); }
console.log('М3 (σr=10, провал):', pass3.join(' | '));
for (const sq of [1, 2]) { const r = L.KF.run({ sq, sr: 10, drop: true }); console.log(`   σq=${sq}: 2σ до ${f1(2 * r.sigAt(10.9))} → в конце провала ${f1(2 * r.sigAt(13.9))} → через 0,5 с ${f1(2 * r.sigAt(14.5))}; после провала макс. ошибка компл. ${f1(r.after.comp)}, Калман ${f1(r.after.kf)}; дальномер ${f1(r.m.raw.rmse)}`); }
for (const sq of [1, 2, 5]) { const r = L.KF.run({ sq, sr: 10, carpet: true }); let mx = 0; for (let i = 0; i < r.P.length; i++) if (r.d.carpet[i]) mx = Math.max(mx, Math.abs(r.kf[i] - r.d.x[i])); console.log(`   ковёр σq=${sq}: на ковре до ${f1(mx)} см, в полосе ${f0(r.cover * 100)}%`); }

console.log('== Фильтр частиц');
{ const W = L.PF.world({ start: 'global' }); let two = null, wrongMax = 0, conv = null, log = [];
  for (let i = 0; i < 40; i++) { const f = W.step(); const big = f.cl.filter((c) => c.w >= 0.1); if (big.length >= 2) two = f.t; if (f.err > 60) wrongMax = Math.max(wrongMax, f.cl[0].w); if (conv == null && f.err < 25 && f.cl[0].w > 0.8 && f.sp < 30) conv = f.t; if (i < 16) log.push(`${f.t.toFixed(2)}:${f.cl.slice(0, 3).map((c) => `${c.w.toFixed(2)}@(${f0(c.x)},${f0(c.y)})`).join(' ')}`); }
  console.log(`М1: два облака до ${two} с; вес неверного облака до ${f0(wrongMax * 100)}%; сошёлся в ${conv} с`); console.log('   ', log.join('\n    ')); }
{ const WPK = [[470, 190], [480, 110], [560, 110], [560, 240], [470, 250]], WPA = [[290, 330], [230, 300], [230, 140], [330, 110], [370, 170], [300, 180], [230, 180], [230, 300], [290, 330], [230, 300], [230, 140]];
  for (const aug of [false, true]) { const W = L.PF.world({ start: 'known', wps: WPK }); let rec = null, end = 0, mx = 0;
    for (let i = 0; i < 48; i++) { if (i === 8) { W.o.augment = aug; W.kidnap(290, 330, -Math.PI / 2, WPA); } const f = W.step(); mx = Math.max(mx, f.pinj); if (i >= 8 && rec == null && f.err < 25 && f.cl[0].w > 0.6) rec = (i - 7) * L.PF.DT; end = f.err; }
    console.log(`М3/М4 похищение, augment=${aug}: нашлась через ${rec} с, ошибка в конце ${f0(end)} см, доля случайных до ${f0(mx * 100)}%`); } }

console.log('== Карта');
const ex = L.OccMap.run({ exact: true }); console.log(`М1 точная поза: известно ${f0(ex.odo.coverage * 100)}% свободного, лишних стен ${f1(ex.odo.ghost * 100)}%, путь ${ex.odo.path}; длина объезда ${f0(L.OccMap.ROUTE.length * L.OccMap.DT)} с`);
for (const d of [0, 0.5, 1, 2, 3]) { const r = L.OccMap.run({ drift: d, slam: true }); console.log(`увод ${d}°/м: одометрия — лишних ${f1(r.odo.ghost * 100)}%, путь ${r.odo.path}, в конце ошибка ${f0(r.endErr.odo)} см | SLAM — лишних ${f1(r.slam.ghost * 100)}%, путь ${r.slam.path}, ошибка ${f0(r.endErr.slam)} см`); }
{ let len = 0; const R = L.OccMap.ROUTE; for (let i = 1; i < R.length; i++) len += Math.hypot(R[i].x - R[i - 1].x, R[i].y - R[i - 1].y); console.log(`   длина маршрута ${f1(len / 100)} м`); }

console.log('== Сетка');
const G = L.Grid, g0 = G.base(), d0 = G.search(g0, G.START, G.GOAL, 'dijkstra'), a0 = G.search(g0, G.START, G.GOAL, 'astar');
console.log(`М1: свободных ${G.free(g0)}, Дейкстра ${d0.expanded}, A* ${a0.expanded}, путь ${f1(a0.cost * G.CELL / 100 * 10) / 10} м (${a0.cost.toFixed(2)} кл.)`);
const trap = []; for (let j = 3; j <= 14; j++) trap.push([17, j]); for (let i = 13; i <= 17; i++) { trap.push([i, 3]); trap.push([i, 14]); }
const gt = G.base(); for (const [i, j] of trap) gt[j * G.NX + i] = 1;
const dt = G.search(gt, G.START, G.GOAL, 'dijkstra'), at = G.search(gt, G.START, G.GOAL, 'astar');
console.log(`ловушка: Дейкстра ${dt.expanded}, A* ${at.expanded}, путь ${at.cost.toFixed(2)} кл.`);
let ok = []; for (let e = 1; e <= 5.0001; e += 0.1) { const w = G.search(gt, G.START, G.GOAL, 'astar', e); if (w.expanded < 100 && w.cost / at.cost <= 1.06) ok.push(`${e.toFixed(1)}:${w.expanded}/${(w.cost / at.cost).toFixed(3)}`); }
console.log('М3 проходят ε:', ok.join(' '));

console.log('== RRT');
const R = L.RRT, door = { a: 140, b: 260 }, opt = R.optimal(R.inflate(R.obstacles(door)));
const A = R.tree({ seed: 1, door }), B = R.tree({ seed: 1, door, star: true }); while (A.first == null) { A.step(); B.step(); }
console.log(`М1: первый путь RRT на ${A.first}, RRT* на ${B.first}; длины ${f0(A.best)} и ${f0(B.best)} см; кратчайший ${f0(opt.cost)} см`);
for (let i = 0; i < 1000; i++) { A.step(); B.step(); }
console.log(`М2: через +1000 итераций (${A.it}): RRT ${f0(A.best)} (${(A.best / opt.cost).toFixed(3)}), RRT* ${f0(B.best)} (${(B.best / opt.cost).toFixed(3)})`);
for (let i = 0; i < 2000; i++) { A.step(); B.step(); }
console.log(`   ещё +2000 (${A.it}): RRT ${f0(A.best)}, RRT* ${f0(B.best)} (${(B.best / opt.cost).toFixed(3)})`);
const sw = R.stats(door, 20); console.log(`М3: широкий проход 120 см — медиана ${sw.median} итераций`);
for (const gap of [60, 50, 45, 40, 36, 32]) { const dd = { a: 200 - gap / 2, b: 200 + gap / 2 }, s2 = R.stats(dd, 20); console.log(`   проход ${gap} см: медиана ${s2.median}, не нашли за 6000: ${s2.fails}`); }
