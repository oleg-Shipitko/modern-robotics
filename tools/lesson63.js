// Урок 6.3 «Управление всем телом»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, Ада нарисована общим рисунком (shared/ada-legs.js) и совпадает с моделью,
// подписи схемы и канвасов помещаются и не мельче 10 px, схема движется, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l63-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l63.
// node tools/lesson63.js            — проверка в headless Chrome (компьютер 1440, телефон 390, тёмная тема);
// node tools/lesson63.js --numbers  — числа лабораторий в Node, для сверки с текстами;
// node tools/lesson63.js --seeds    — устойчивость выводов лабораторий 2 и 3 на зёрнах 1–10 и диапазоны из «Под капотом» (около 10 минут);
// node tools/lesson63.js --seedtexts — сверить тексты «Под капотом» с сохранённой сводкой зёрен shots/l63-seeds.json (без пересчёта);
// node tools/lesson63.js --check    — обучить вшитые политики заново (зерно 1) и сверить с движком бит в бит (около минуты);
// node tools/lesson63.js --train    — обучить вшитые политики и вшить их в lessons/l63/engine.js.
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const ENGINE = path.resolve(__dirname, '../lessons/l63/engine.js'), LESSON = path.resolve(__dirname, '../lessons/l63/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const f0 = (v) => fr(v, 0), f1 = (v) => fr(v, 1), f2 = (v) => fr(v, 2);
const E = require('../lessons/l63/engine.js');
// слова о расположении на экране: в подписях и текстах лабораторий говорим о ролях (на телефоне раскладка другая)
const POS = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const NETS = ['gen', 'all', 'h2o', 'omni', 'exbody'];

/* ---------- числа лабораторий в Node: те же расчёты, что на странице ---------- */
const L1_IDS = ['arabesque', 'pistol', 'kneeLift', 'lunge', 'kickSlow', 'kickFast', 'bowFast', 'sprint', 'backbend', 'reachFar'];
function lab1() {
  const res = {}; for (const id of L1_IDS) res[id] = E.check(E.prepRef(E.BY_ID[id]));
  const slow = (id) => { for (let s = 10; s >= 4; s--) if (E.check(E.prepRef(E.BY_ID[id], s / 10)).ok) return s / 10; return null; };
  return { res, slow: { bowFast: slow('bowFast'), kickFast: slow('kickFast'), sprint: slow('sprint'), backbend: slow('backbend'), reachFar: slow('reachFar') }, bow07: E.check(E.prepRef(E.BY_ID.bowFast, 0.7)), bow08: E.check(E.prepRef(E.BY_ID.bowFast, 0.8)), kin: L1_IDS.filter((id) => E.prepRef(E.BY_ID[id]).margT > 0.25) };
}
/** Лаборатория 2: политики pol (объект { gen, all, h2o, omni, exbody } → ученики). */
function lab2(pol) {
  const run = (p, rec, mode, sw) => E.rollout(E.prepRef(E.BY_ID[rec]), mode, E.ctlOf(pol[p]), E.NOM, sw ? { switchAt: sw } : {});
  const m1 = { g: run('gen', 'squat12', 'h2o'), s: run('h2o', 'squat12', 'h2o') }, m2 = { g: run('gen', 'squat12', 'exbody'), s: run('h2o', 'squat12', 'exbody') };
  const m3 = { g: run('gen', 'bow3', 'omni'), s: run('omni', 'bow3', 'omni') };
  const sw = { t: 75, mode: E.MODES.h2o.m }, m4 = { g: run('gen', 'walk085', 'exbody', sw), s: run('exbody', 'walk085', 'exbody', sw) };
  const train = E.setOf('train').map((m) => E.prepRef(m)), test = E.setOf('test').map((m) => E.prepRef(m)), table = {};
  for (const p of NETS) { table[p] = {}; for (const m of E.MODE_IDS) { const a = E.evaluate(E.ctlOf(pol[p]), m, train, E.NOM), b = E.evaluate(E.ctlOf(pol[p]), m, test, E.NOM); table[p][m] = { tr: a.errK, te: b.errK, falls: a.falls + b.falls }; } }
  const kneeAll = run('gen', 'kneeLift', 'all').errK, knee2 = {};
  for (const m of [[1, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 0, 0, 0, 1], [0, 1, 1, 0, 0], [1, 1, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 0, 0, 1], [1, 0, 0, 1, 0], [0, 0, 0, 1, 1], [0, 0, 1, 0, 1]]) knee2[m.join('')] = run('gen', 'kneeLift', m).errK;
  return { m1, m2, m3, m4, table, kneeAll, knee2 };
}
const embedded = () => Object.fromEntries(NETS.map((n) => [n, E.policy(n)]));
/** Лаборатория 3, как на странице (Gap): перенос, записи, SysID, дельта-модель, дообучение (зерно seed). */
const FT = { rounds: 8, per: 12, steps: 300 };
function lab3(seed, withSysid) {
  const train = () => E.setOf('train').map((m) => E.prepRef(m)), ev = () => E.setOf('train').concat(E.setOf('test')).map((m) => E.prepRef(m));
  const evalOf = (S) => { const C = E.ctlOf(S); return { sim: E.evaluate(C, 'all', ev(), E.NOM), real: E.evaluate(C, 'all', ev(), E.REAL) }; };
  const G = E.policy('gen'), base = evalOf(G), eps = E.collect(E.ctlOf(G), train(), E.REAL), simErr = E.oneStep(eps, E.NOM, null), sid = E.sysid(eps), D = E.fitDelta(eps), dErr = E.oneStep(eps, E.NOM, D.fn);
  const tune = (W, delta) => E.run(E.fineTune(G, { W, delta, refs: train(), rounds: FT.rounds, per: FT.per, steps: FT.steps, seed, teachRefs: train().slice(0, 8) }));
  const A = tune(E.NOM, D.fn), P = tune(E.NOM, null), Sy = withSysid ? tune(sid.W, null) : null;
  return { seed, base, steps: eps.reduce((a, e) => a + e.steps.length, 0), simErr, sid: { W: sid.W, err: sid.err, n: sid.grid.length }, dErr, C: D.C, asap: evalOf(A.S), plain: evalOf(P.S), sysid: Sy ? evalOf(Sy.S) : null, tA: A.teacher.predict, tP: P.teacher.predict, tS: Sy ? Sy.teacher.predict : null };
}
const sm = (e) => ({ sim: e.sim.errK, real: e.real.errK, simBad: e.sim.n - e.sim.ok, realBad: e.real.n - e.real.ok, falls: e.real.falls });

/* ---------- обучение и вшивание политик ---------- */
function trainAll(seed) { const o = {}; for (const n of NETS) { const t0 = Date.now(), R = E.run(E.trainPolicy(n, seed)); o[n] = { S: R.S, w: E.packNet(R.S.n), t: (Date.now() - t0) / 1000 }; } return o; }
function embedNets(nets) {
  let s = fs.readFileSync(ENGINE, 'utf8'); const a = s.indexOf('/*@DATA@*/'), b = s.indexOf('/*@/DATA@*/');
  const body = '/*@DATA@*/\n  const DATA = { nets: {\n' + NETS.map((n) => `    ${n}: { H: ${E.TRAIN.H}, w: '${nets[n].w}' },`).join('\n') + '\n  } };\n  ';
  fs.writeFileSync(ENGINE, s.slice(0, a) + body + s.slice(b));
}

/** Тексты «Под капотом» по зёрнам — те же фразы, что в уроке. */
function seedTexts(S2, S3) {
  const n = S2.length, mm = (arr, d) => `${fr(Math.min(...arr), d)}–${fr(Math.max(...arr), d)}`, all = (k) => k === n, wN = (k) => (all(k) ? 'на всех десяти зёрнах' : `на ${k} зёрнах из ${n}`);
  const own = S2.filter((r) => E.MODE_IDS.every((m) => r.table[m][m].tr < r.table.gen[m].tr)).length;
  const m1 = S2.filter((r) => r.m1s < r.m1g).length, m2 = S2.filter((r) => r.m2s > 3 * r.m2g).length, m3 = S2.filter((r) => r.m3up < 6 && r.m3leg > 10).length, m4 = S2.filter((r) => !r.m4fall && r.m4g < 5).length;
  const genTe = S2.flatMap((r) => E.MODE_IDS.map((m) => r.table.gen[m].te)), foreign = S2.flatMap((r) => E.MODE_IDS.flatMap((p) => E.MODE_IDS.filter((m) => m !== p && !(p === 'omni' && m === 'h2o')).map((m) => r.table[p][m].tr)));
  const genFalls = S2.reduce((a, r) => a + E.MODE_IDS.reduce((b, m) => b + r.table.gen[m].falls, 0), 0);
  const runs = n * E.MODE_IDS.length * (E.setOf('train').length + E.setOf('test').length);
  const ownTxt = own === m1 ? `во всех четырёх режимах и на новом приседе в режиме «кисти и стопы» — ${wN(own)}` : `во всех четырёх режимах ${wN(own)}, а на новом приседе в режиме «кисти и стопы» ${wN(m1)}`;
  const t2 = `На зёрнах 1–10 все пять политик обучены заново. Специалист в своём режиме точнее генералиста на учебных записях ${ownTxt}. Ошибка генералиста на проверочных записях во всех режимах ${mm(genTe, 1)} см, ${genFalls ? `и за все ${runs} прогонов он упал ${genFalls} ${genFalls % 10 >= 2 && genFalls % 10 <= 4 && (genFalls % 100 < 12 || genFalls % 100 > 14) ? 'раза' : 'раз'}` : 'и ни одного падения'}. У специалистов в чужих режимах, кроме специалиста «голова и кисти» в режиме «кисти и стопы», где его три точки тоже заданы, ошибка на учебных записях ${mm(foreign, 1)} см. Специалист «кисти и стопы» с командой «углы рук и таз» ошибается хотя бы втрое сильнее генералиста ${wN(m2)}. На поклоне в режиме «голова и кисти» у генералиста ${wN(m3)} голова и кисти ближе 6 см к записи, а углы ног расходятся больше чем на 10°. Смену режима во время ходьбы он проходит без падения и с ошибкой меньше 5 см ${wN(m4)}.`;
  const n3 = S3.length, all3 = (k) => k === n3, w3 = (k) => (all3(k) ? 'на всех десяти зёрнах' : `на ${k} зёрнах из ${n3}`);
  const better = S3.filter((r) => r.asap.real < r.plain.real).length, betterS = S3.filter((r) => r.asap.real < r.sysid.real).length, betterB = S3.filter((r) => r.asap.real < r.base.real).length;
  const tch = S3.filter((r) => r.tA === 1 && r.tP === 0 && r.tS === 0).length, same = better === betterS && better === betterB, up = (s) => s[0].toUpperCase() + s.slice(1);
  const cmp = same ? `${up(w3(better))} политика с поправкой точнее, чем после обычного дообучения, после дообучения с SysID и без дообучения.` : `Политика с поправкой точнее, чем после обычного дообучения, ${w3(better)}, чем после дообучения с SysID, ${w3(betterS)}, и чем без дообучения, ${w3(betterB)}.`;
  const t3 = `На зёрнах дообучения 1–10 политика, дообученная с дельта-моделью, ошибается на настоящей Аде на ${mm(S3.map((r) => r.asap.real), 2)} см и срывает ${mm(S3.map((r) => r.asap.realBad), 0)} записей из 21. После обычного дообучения политика ошибается на ${mm(S3.map((r) => r.plain.real), 2)} см и срывает ${mm(S3.map((r) => r.plain.realBad), 0)} записей, а после дообучения с SysID ошибается на ${mm(S3.map((r) => r.sysid.real), 2)} см и срывает ${mm(S3.map((r) => r.sysid.realBad), 0)} записей. ${cmp} Учитель, который прогоняет шаг вперёд, лучше в симуляторе с поправкой, а отвечающий на текущее состояние — в обычном и в симуляторе с SysID, ${same && tch === better ? 'тоже ' : ''}${w3(tch)}. В самом симуляторе политика с поправкой ошибается на ${mm(S3.map((r) => r.asap.sim), 2)} см, а после обычного дообучения на ${mm(S3.map((r) => r.plain.sim), 2)} см.`;
  return { t2, t3, stats: { own, m1, m2, m3, m4, better, betterS, betterB, tch, n, n3, genFalls } };
}

if (process.argv.includes('--train')) {
  const t0 = Date.now(), nets = trainAll(E.CFG.SEED); embedNets(nets);
  for (const n of NETS) console.log(n, nets[n].t.toFixed(1), 'с,', nets[n].w.length, 'символов base64');
  console.log(`вшито в ${ENGINE} за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
} else if (process.argv.includes('--check')) {
  const t0 = Date.now(), nets = trainAll(E.CFG.SEED), src = fs.readFileSync(ENGINE, 'utf8');
  for (const n of NETS) check(src.includes(`${n}: { H: ${E.TRAIN.H}, w: '${nets[n].w}' }`), `политика ${n}: обучение заново (зерно ${E.CFG.SEED}) совпадает с вшитыми весами бит в бит (${nets[n].t.toFixed(0)} с)`);
  console.log(`время ${((Date.now() - t0) / 1000).toFixed(0)} с`); finish();
} else if (process.argv.includes('--numbers')) {
  const L1 = lab1();
  for (const id of L1_IDS) { const c = L1.res[id], e = c.e; console.log('лаб. 1', id, c.ok ? '✓' : '✗', c.cause, 'наибольшее отклонение', f1(e.maxP), 'см (точка', e.whoP + ')', 'на', f2(e.tP / E.FPS), 'с', e.fall ? 'падение на ' + f2(e.tFall) + ' с' : ''); }
  console.log('лаб. 1 темп: самый быстрый проходящий', JSON.stringify(L1.slow), 'поклон 0,7×:', f1(L1.bow07.e.maxP), 'см; кинематика отсеяла бы', L1.kin.join(', '));
  const L2 = lab2(embedded());
  console.log('лаб. 2 М1 генералист', f2(L2.m1.g.errK), 'специалист', f2(L2.m1.s.errK), '| М2', f2(L2.m2.g.errK), f2(L2.m2.s.errK), L2.m2.s.fall ? 'падение' : '', '| М3 голова и кисти', f2(L2.m3.g.part.upK), 'см, углы ног', f1(L2.m3.g.part.legJ), '°, таз', f2(L2.m3.g.part.h), 'см | М4', f2(L2.m4.g.errK), L2.m4.g.fall ? 'падение' : '', 'специалист', f2(L2.m4.s.errK));
  for (const p of NETS) console.log('лаб. 2 таблица', p, E.MODE_IDS.map((m) => `${m} ${f2(L2.table[p][m].tr)}/${f2(L2.table[p][m].te)}${L2.table[p][m].falls ? ' ↓' + L2.table[p][m].falls : ''}`).join(' | '));
  console.log('лаб. 2 свободный режим: подъём колена, все части', f2(L2.kneeAll), '; две части', JSON.stringify(Object.fromEntries(Object.entries(L2.knee2).map(([k, v]) => [k, +v.toFixed(2)]))));
  const L3 = lab3(E.CFG.SEED, true);
  console.log('лаб. 3 без дообучения', JSON.stringify(sm(L3.base)), '| шагов', L3.steps, '| шаг: симулятор', f2(L3.simErr), 'SysID', f2(L3.sid.err), JSON.stringify(L3.sid.W), 'дельта', f2(L3.dErr), 'голеностоп', Array.from(L3.C[0]).map((v) => f2(v)).join(' '));
  console.log('лаб. 3 с поправкой', JSON.stringify(sm(L3.asap)), '| обычный', JSON.stringify(sm(L3.plain)), '| SysID', JSON.stringify(sm(L3.sysid)), '| учителя', L3.tA, L3.tP, L3.tS);
} else if (process.argv.includes('--seedtexts')) {
  const D = J(fs.readFileSync(path.resolve(__dirname, '../shots/l63-seeds.json'), 'utf8')), seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], T = seedTexts(seeds.map((s) => D.lab2[s]), seeds.map((s) => D.lab3[s])), txt = plain();
  console.log('лаб. 2:', T.t2); console.log('лаб. 3:', T.t3);
  check(txt.includes(sp(T.t2)), '«Под капотом» лаборатории 2 называет диапазоны по зёрнам 1–10 (из shots/l63-seeds.json)');
  check(txt.includes(sp(T.t3)), '«Под капотом» лаборатории 3 называет диапазоны по зёрнам 1–10 (из shots/l63-seeds.json)');
  finish();
} else if (process.argv.includes('--seed2')) {
  const seed = +process.argv[process.argv.indexOf('--seed2') + 1], nets = trainAll(seed), pol = Object.fromEntries(NETS.map((n) => [n, E.quantize(nets[n].S)])), L2 = lab2(pol), tb = {};
  for (const p of NETS) { tb[p] = {}; for (const m of E.MODE_IDS) tb[p][m] = L2.table[p][m]; }
  process.stdout.write(JSON.stringify({ seed, table: tb, m1g: L2.m1.g.errK, m1s: L2.m1.s.errK, m2g: L2.m2.g.errK, m2s: L2.m2.s.errK, m3up: L2.m3.g.part.upK, m3leg: L2.m3.g.part.legJ, m4g: L2.m4.g.errK, m4fall: L2.m4.g.fall }));
} else if (process.argv.includes('--seed3')) {
  const seed = +process.argv[process.argv.indexOf('--seed3') + 1], L3 = lab3(seed, true);
  process.stdout.write(JSON.stringify({ seed, base: sm(L3.base), asap: sm(L3.asap), plain: sm(L3.plain), sysid: sm(L3.sysid), tA: L3.tA, tP: L3.tP, tS: L3.tS }));
} else if (process.argv.includes('--seeds')) {
  /* ---------- зёрна 1–10 в двух процессах: лаб. 2 (обучение пяти политик заново) и лаб. 3 (дообучение); итог — shots/l63-seeds.json ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R2 = {}, R3 = {}, jobs = seeds.map((s) => ['--seed2', s]).concat(seeds.map((s) => ['--seed3', s]));
  const runOne = (a, s) => new Promise((res, rej) => execFile(process.execPath, [__filename, a, String(s)], { maxBuffer: 1 << 26 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    const t0 = Date.now(); let i = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (i < jobs.length) { const [a, s] = jobs[i++]; const r = await runOne(a, s);
      if (a === '--seed2') { R2[s] = r; console.log(`зерно ${s}, лаб. 2: М1 ${f2(r.m1s)} / ${f2(r.m1g)} см, М2 ${f2(r.m2s)} / ${f2(r.m2g)}, М3 ${f2(r.m3up)} см, ${f1(r.m3leg)}°, М4 ${f2(r.m4g)}${r.m4fall ? '↓' : ''}`); }
      else { R3[s] = r; console.log(`зерно ${s}, лаб. 3: с поправкой ${f2(r.asap.real)} см (${r.asap.realBad}), обычное ${f2(r.plain.real)} (${r.plain.realBad}), SysID ${f2(r.sysid.real)}; учителя ${r.tA}${r.tP}${r.tS}`); } } }));
    console.log(`время ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    const T = seedTexts(seeds.map((s) => R2[s]), seeds.map((s) => R3[s])), txt = plain();
    fs.writeFileSync(path.resolve(__dirname, '../shots/l63-seeds.json'), JSON.stringify({ lab2: R2, lab3: R3, stats: T.stats }));
    console.log('лаб. 2:', T.t2); console.log('лаб. 3:', T.t3);
    check(txt.includes(sp(T.t2)), '«Под капотом» лаборатории 2 называет диапазоны по зёрнам 1–10');
    check(txt.includes(sp(T.t3)), '«Под капотом» лаборатории 3 называет диапазоны по зёрнам 1–10');
    const s = T.stats;
    check(s.m2 >= 9 && s.m3 >= 8 && s.m4 >= 9, `выводы миссий лаборатории 2 держатся хотя бы на 8 зёрнах из 10: М2 ${s.m2}, М3 ${s.m3}, М4 ${s.m4}`);
    check(s.better === 10 && s.betterS === 10 && s.betterB === 10 && s.tch === 10, `выводы лаборатории 3 на всех зёрнах: с поправкой лучше обычного дообучения ${s.better}, лучше дообучения с SysID ${s.betterS}, лучше без дообучения ${s.betterB}, учителя (шаг вперёд с поправкой, текущее состояние в обычном и с SysID) ${s.tch}`);
    const r1 = R2[E.CFG.SEED]; check(r1.m1s < r1.m1g && r1.m2s > 3 * r1.m2g && r1.m3up < 6 && r1.m3leg > 10 && !r1.m4fall && r1.m4g < 5, `на зерне лабораторий (${E.CFG.SEED}) выполняются все выводы миссий лаборатории 2`);
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/6-3-upravlenie-vsem-telom.html');
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 8000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const liveCrit = (p, mis) => p.eval(`JSON.stringify([...document.querySelectorAll('${mis} .m-crit li')].map((li) => li.className))`).then(J);
const outOf = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`).then(sp);
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const missing = (s, list) => list.filter((x) => !s.includes(sp(x)));
/** Подписи схемы: в канвасе, без наложений, не мельче 10 px на экране и внутри своего блока (наименьший скруглённый прямоугольник вокруг центра подписи). */
async function schemeLabels(p, kind, frames) {
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(250);
  return J(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]'); if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [] });
    const Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, oR = Pr.roundRect, bad = new Set(), texts = new Set(), prints = new Set();
    let rects = null, boxes = null, minPx = 99;
    Pr.roundRect = function (x, y, w, h) { if (rects && this.canvas === cv) { const t = this.getTransform(); rects.push([x * t.a + t.e, y * t.d + t.f, w * t.a, h * t.d]); } return oR.apply(this, arguments); };
    Pr.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const X = x * t.a + t.e, Y = y * t.d + t.f, W = m.width * t.a, x0 = a === 'center' ? X - W / 2 : a === 'right' ? X - W : X; boxes.push({ t: String(txt), x0, x1: x0 + W, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, cy: Y, fs: fs * t.a }); }
      return oT.apply(this, arguments);
    };
    for (const t of ${JSON.stringify(frames)}) {
      rects = []; boxes = []; Anim.seek(cv, t); const R = rects, b = boxes; rects = boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 7) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      const Wc = cv.width, Hc = cv.height, dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of b) {
        texts.add(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px;
        if (px < 9.95) bad.add('мельче 10 px: «' + q.t + '» ' + px.toFixed(1));
        if (q.x0 < 1 || q.x1 > Wc - 1 || q.y0 < 0 || q.y1 > Hc) bad.add('за краем: «' + q.t + '»');
        const cx = (q.x0 + q.x1) / 2, own = R.filter(([x, y, w, h]) => cx >= x && cx <= x + w && q.cy >= y && q.cy <= y + h).sort((u, v) => u[2] * u[3] - v[2] * v[3])[0];
        if (own && (q.x0 < own[0] + 2 || q.x1 > own[0] + own[2] - 2)) bad.add('шире блока: «' + q.t + '»');
      }
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0); if (ox > 1 && oy > 1) bad.add('«' + b[i].t + '» на «' + b[j].t + '»'); }
    }
    Pr.fillText = oT; Pr.roundRect = oR;
    return JSON.stringify({ layout: cv.dataset.layout, bad: [...bad], texts: [...texts], minPx, distinct: prints.size });
  })()`));
}
/** Подписи канвасов лабораторий во всех состояниях: не мельче 10 px, внутри канваса, без наложений. */
async function labLabels(p) {
  return J(await p.eval(`(() => {
    const W = window.__l63, Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, bad = new Set(), texts = []; let minPx = 99, cur = null, boxes = [];
    Pr.fillText = function (txt, x, y) { if (cur && this.canvas === cur) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign; const X = x * t.a + t.e, Y = y * t.d + t.f, Wt = m.width * t.a, x0 = a === 'center' ? X - Wt / 2 : a === 'right' ? X - Wt : X; boxes.push({ t: String(txt), x0, x1: x0 + Wt, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, fs: fs * t.a }); } return oT.apply(this, arguments); };
    const chk = (id, name, draw) => {
      const cv = document.getElementById(id); cur = cv; boxes = []; draw(); cur = null; const dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of boxes) { texts.push(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px; if (px < 9.95) bad.add(name + ': мельче 10 px «' + q.t + '»'); if (q.x0 < 0 || q.x1 > cv.width || q.y0 < 0 || q.y1 > cv.height) bad.add(name + ': за краем «' + q.t + '»'); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ox > 1 && oy > 1) bad.add(name + ': «' + a.t + '» на «' + b.t + '»'); }
    };
    const F = W.Filter, fs = F.st, fk = { sel: fs.sel, checked: fs.checked, speed: fs.speed, t: fs.t, hold: fs.hold }; fs.hold = true;
    for (const checked of [false, true]) for (const id of F.IDS) for (const sp of (checked && (id === 'bowFast' || id === 'kickFast') ? [1, 0.7, 0.4] : [1])) for (const tt of [0.1, 0.6, 1.0, 1.9, 3.5]) { Object.assign(fs, { checked, sel: id, speed: sp, t: tt }); chk('fCv', 'фильтр ' + id, () => F.api.render()); }
    Object.assign(fs, fk); F.api.render();
    const M = W.Modes, ms = M.st, mk = { mask: ms.mask.slice(), spec: ms.spec, rec: ms.rec, sw: ms.sw, shown: ms.shown, t: ms.t, hold: ms.hold }; ms.hold = true;
    ms.shown = false; chk('mCv', 'режимы до миссии', () => M.api.render()); ms.shown = true;
    for (const pr of M.PRESETS) for (const rec of M.RECS) for (const tt of [0.2, 1.5, 3.4]) { Object.assign(ms, { mask: L63.MODES[pr].m.slice(), spec: pr, rec, t: tt }); chk('mCv', 'режимы ' + pr + ' ' + rec, () => M.api.render()); }
    Object.assign(ms, mk); M.api.render();
    const G = W.Gap, gs = G.st, gk = { pol: gs.pol, rec: gs.rec, view: gs.view, t: gs.t, hold: gs.hold }; gs.hold = true;
    for (const pol of G.POLS) for (const rec of G.RECS) for (const tt of [0.3, 1.6, 3.4]) { if (!gs.pols[pol] && pol !== 'base') continue; Object.assign(gs, { pol, rec, t: tt }); chk('gCv', 'перенос ' + pol + ' ' + rec, () => G.api.render()); }
    for (const view of ['real', 'pred']) { gs.view = view; chk('gChart', 'сводка ' + view, () => G.api.render()); }
    Object.assign(gs, gk); G.api.render();
    Pr.fillText = oT;
    return JSON.stringify({ bad: [...bad], minPx, texts });
  })()`));
}
const FRAMES = { distill: [0.5, 1.7, 3.1, 4.6, 6.4, 8.5, 10.2, 11.7] };
const lessonsDir = path.resolve(__dirname, '../lessons');
(async () => {
  const L1 = lab1(), L2 = lab2(embedded()), L3 = lab3(E.CFG.SEED, true);
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^12 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    // разминка по 6.2: разделы и их названия — как в уроке 6.2
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l62 = fs.readFileSync(path.join(lessonsDir, 'l62/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l62); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.2' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.2: три вопроса, разделы и названия совпадают с h2 урока 6.2: ' + rec.q.map((q) => q.sec).join(', '));
    const lead = await text(p, '.hero .lead');
    check(/^В уроке 6\.2 трекер повторял одну запись/.test(lead) && ['8,5 тысячи', 'H2O (2024)', 'OmniH2O', 'HOVER', 'ASAP', 'BeyondMimic'].every((x) => lead.includes(x)), 'шапка подхватывает мост из 6.2 и называет работы урока');
    const note = await text(p, '#tracker .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#tracker .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде при первом упоминании: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href') })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /Урок 6\.4 · Локоманипуляция: как /.test(bn[0].t) && /40 минутах телеоперации/.test(bn[0].t), 'мост в конце урока: ' + bn.map((b) => `${b.sec} «${b.t.slice(0, 90)}…» → ${b.a || 'без ссылки'}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check((await p.eval(`L63.CFG.SEED`)) === 1 && (await p.eval(`Object.keys(L63.DATA.nets).join(',')`)) === NETS.join(','), 'зерно 1, вшиты пять политик: ' + NETS.join(', '));
    // Ада: общий рисунок из shared/ada-legs.js с теми же размерами, что тело Ады в движке; точки рисунка совпадают с моделью
    const body = J(await p.eval(`(() => { const A = AdaBody.BODY, Bd = L63.B, eq = (a, b) => Math.abs(a - b) < 1e-9;
      const dims = eq(A.L1, Bd.L1) && eq(A.L2, Bd.L2) && eq(A.LT, Bd.LT) && eq(A.HF, Bd.HA) && eq(A.LF / 2 + A.FA, Bd.FH) && eq(A.LF / 2 - A.FA, Bd.FT) && eq(A.LT + 0.02 + A.HEAD / 2, Bd.HC) && eq(A.LT * 0.8, Bd.LS);
      let worst = 0; const r = L63.prepRef(L63.BY_ID.kneeLift), F = L63.newFK();
      for (let t = 0; t < r.T; t += 7) { const pose = window.__l63.Fig.refPose(r, t), Pd = AdaBody.points(window.__l63.Fig.frame(pose)); L63.fkInto(pose.q, pose.x, pose.y, F, pose.th); const P = F.pts;
        for (const [a, b] of [[[P[0], P[1]], Pd.hip], [[P[12], P[13]], Pd.L.knee], [[P[14], P[15]], Pd.L.ankle], [[P[16], P[17]], Pd.R.knee], [[P[18], P[19]], Pd.R.ankle], [[P[20], P[21]], Pd.head]]) worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
        const heel = Pd.L.heel, toe = Pd.L.toe; worst = Math.max(worst, Math.abs(heel[0] - (P[14] - Bd.FH)), Math.abs(toe[0] - (P[14] + Bd.FT)), Math.abs(heel[1] - (P[15] - Bd.HA))); }
      return JSON.stringify({ dims, worst }); })()`));
    check(body.dims && body.worst < 1e-9, `Ада нарисована AdaBody из shared/ada-legs.js: размеры как в движке и в уроке 6.1, точки рисунка совпадают с моделью (наибольшее расхождение ${body.worst.toExponential(1)} м)`);
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схема ----------
    const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="distill"]'); Anim.seek(cv, 1.0); const x = cv.toDataURL(); Anim.seek(cv, 9.0); return x !== cv.toDataURL(); })()`);
    check(moved, 'схема distill движется: кадры в 1 и 9 с разные');
    const sl = await schemeLabels(p, 'distill', FRAMES.distill);
    check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES.distill.length, `схема distill (широкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
    check(!sl.texts.some((x) => POS.test(x)), 'схема distill: в подписях нет слов о расположении');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="distill"]'), 1.2); true`); await show(p, 'hover', '#hover .flow-card', 'l63-distill.png');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="distill"]'), 9.2); true`); await show(p, 'hover', '#hover .flow-card', 'l63-distill-robot.png');
    // таблица OmniH2O: строки, наведение
    check((await p.eval(`document.querySelectorAll('#ablOmni .num-row[data-k]').length`)) === 6, 'таблица OmniH2O: шесть строк');
    await p.eval(`document.querySelector('#ablOmni .num-row[data-k="rl25"]').dispatchEvent(new Event('mouseenter')); true`);
    const ablT = await text(p, '#ablOut');
    check(/47,11% против 94,10%/.test(ablT), 'наведение на строку «история 25 шагов, с подкреплением» показывает разбор: ' + ablT.slice(0, 80));
    await show(p, 'student', '#ablOmni', 'l63-omni.png');
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен и схемы и вступления лабораторий — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify(['Filter', 'Modes', 'Gap'].flatMap((k) => window.__l63[k].missions.flatMap((m) => [m.title, m.text, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean)))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    const outs = [];

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapFSpeed')), 'миссия 1: ползунок темпа скрыт');
    check(/^Прогноз отмечен для 0 из 10/.test(await text(p, '#fOut')), 'до прогона итог не показан (прогноз не выдан)');
    const preds = { arabesque: 0, pistol: 1, kneeLift: 1, lunge: 1, kickSlow: 1, kickFast: 1, bowFast: 0, sprint: 0, backbend: 0, reachFar: 0 };
    let r = await viaUI(p, '#fMis'); check(!r.ok && /Отмечено 0 из 10/.test(r.out), 'миссия 1 без прогноза не засчитывается: ' + r.out.slice(0, 60));
    for (const [id, v] of Object.entries(preds)) await p.eval(`document.querySelector('#fGrid .f-chip[data-id="${id}"] button[data-act="p${v}"]').click(); true`);
    await show(p, 'filter', '#filter .lab', 'l63-filter-start.png');
    r = await viaUI(p, '#fMis'); outs.push(r.out);
    const badIds = L1_IDS.filter((id) => !L1.res[id].ok), hits = L1_IDS.filter((id) => preds[id] === (L1.res[id].ok ? 1 : 0)).length;
    check(r.ok && badIds.length === 5 && r.out.includes(`Не прошли ${badIds.length} записей из 10`) && r.out.includes(`Прогноз совпал в ${hits} из 10`) && ['kickFast', 'bowFast', 'sprint', 'backbend', 'reachFar'].every((id) => badIds.includes(id)), `миссия 1: не прошли ${badIds.join(', ')}; прогноз совпал в ${hits} из 10`);
    check(L1.kin.join(',') === 'sprint,backbend,reachFar' && r.out.includes('вместе с бегом и обычную ходьбу'), 'миссия 1: кинематическая проверка отсеяла бы только бег, прогиб и дотягивание');
    await nextMission(p, '#fMis');
    r = await viaUI(p, '#fMis', 1); outs.push(r.out);
    const bf = L1.res.bowFast;
    check(r.ok && /ставка сыграла/i.test(r.out) && bf.cause === 'speed' && r.out.includes(`на ${f1(bf.e.maxP)} см на ${f2(bf.e.tP / E.FPS)} с`), `миссия 2 (резкий поклон): опорная нога не успевает, голова отстаёт на ${f1(bf.e.maxP)} см`);
    await p.eval(`(() => { const F = window.__l63.Filter; F.st.hold = true; F.st.t = ${bf.e.tP / E.FPS}; F.api.render(); return true; })()`); await show(p, 'filter', '#filter .lab', 'l63-filter-bow.png'); await p.eval(`window.__l63.Filter.st.hold = false; true`);
    await nextMission(p, '#fMis');
    r = await viaUI(p, '#fMis', 1); outs.push(r.out);
    const bb = L1.res.backbend;
    check(r.ok && /ставка сыграла/i.test(r.out) && bb.cause === 'com-' && r.out.includes(`падает на ${f2(bb.e.tFall)} с`), `миссия 3 (прогиб назад): центр масс за пятками, падение на ${f2(bb.e.tFall)} с`);
    await nextMission(p, '#fMis');
    check(await visible(p, '#wrapFSpeed'), 'миссия 4: ползунок темпа виден');
    await setRange(p, '#fSpeed', 80); await sleep(150);
    let lc = await liveCrit(p, '#fMis'); check(lc[1] !== 'ok', 'миссия 4: в темпе 0,8× поклон не засчитан');
    await setRange(p, '#fSpeed', 70); await sleep(200);
    lc = await liveCrit(p, '#fMis'); const o4 = await outOf(p, '#fMis'); outs.push(o4);
    check(lc.every((c) => c === 'ok') && L1.slow.bowFast === 0.7 && L1.slow.kickFast === 0.7 && L1.slow.backbend === null && o4.includes(`наибольшее отклонение ${f1(L1.bow07.e.maxP)} см`) && o4.includes(`с темпа ${f1(L1.slow.kickFast)}×`), `миссия 4: поклон проходит в темпе 0,7× (${f1(L1.bow07.e.maxP)} см), в 0,8× нет; удар — с 0,7×, прогиб — ни в каком`);
    await show(p, 'filter', '#filter .lab', 'l63-filter-tempo.png');
    await nextMission(p, '#fMis');
    check(await visible(p, '#wrapFSpeed'), 'свободный режим: ползунок темпа виден');
    const fa = await text(p, '#filterAfter');
    const faMiss = missing(fa, [`на ${f1(L1.res.kickFast.e.maxP)} см`, `на ${f1(bf.e.maxP)} см`, `назад на ${f2(bb.e.tFall)} с`, `вперёд на ${f2(L1.res.reachFar.e.tFall)} с`, `В темпе ${f1(L1.slow.bowFast)}×`]);
    check(!faMiss.length, 'текст после лаборатории 1 называет те же числа' + (faMiss.length ? ' — нет: ' + faMiss.join(', ') : ''));

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapMParts')) && !(await visible(p, '#wrapMSpec')) && !(await visible(p, '#wrapMRec')), 'миссия 1: части команды, специалист и запись скрыты');
    check(/^Нажми кнопку миссии/.test(await text(p, '#mOut')), 'до кнопки миссии ошибки политик не показаны (ставка не выдана)');
    await show(p, 'modes', '#modes .lab', 'l63-modes-start.png');
    r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`у специалиста ${f1(L2.m1.s.errK)} см, у генералиста ${f1(L2.m1.g.errK)} см`), `миссия 1: специалист ${f2(L2.m1.s.errK)} см, генералист ${f2(L2.m1.g.errK)} см`);
    await p.eval(`(() => { const M = window.__l63.Modes; M.st.hold = true; M.st.t = 1.0; M.api.render(); return true; })()`); await show(p, 'modes', '#modes .lab', 'l63-modes-own.png'); await p.eval(`window.__l63.Modes.st.hold = false; true`);
    await nextMission(p, '#mMis');
    r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`у специалиста ${f1(L2.m2.s.errK)} см`) && r.out.includes(`у генералиста ${f1(L2.m2.g.errK)} см`), `миссия 2: в чужом режиме специалист ${f2(L2.m2.s.errK)} см, генералист ${f2(L2.m2.g.errK)} см`);
    await nextMission(p, '#mMis');
    r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в ${f1(L2.m3.g.part.upK)} см от записи`) && r.out.includes(`на ${f0(L2.m3.g.part.legJ)}°`), `миссия 3: голова и кисти ${f2(L2.m3.g.part.upK)} см, углы ног ${f1(L2.m3.g.part.legJ)}°`);
    await p.eval(`(() => { const M = window.__l63.Modes; M.st.hold = true; M.st.t = 1.2; M.api.render(); return true; })()`); await show(p, 'modes', '#modes .lab', 'l63-modes-omni.png'); await p.eval(`window.__l63.Modes.st.hold = false; true`);
    await nextMission(p, '#mMis');
    r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && !L2.m4.g.fall && r.out.includes(`с ошибкой точек ${f1(L2.m4.g.errK)} см`) && r.out.includes(`ошибка ${f1(L2.m4.s.errK)} см`), `миссия 4: смена режима на ходу, генералист ${f2(L2.m4.g.errK)} см без падения, специалист ${f2(L2.m4.s.errK)} см`);
    await nextMission(p, '#mMis');
    check(await visible(p, '#wrapMParts') && await visible(p, '#wrapMSpec') && await visible(p, '#wrapMRec') && await visible(p, '#wrapMSw'), 'свободный режим: части команды, специалист, запись и смена режима видны');
    await seg(p, '#mSw', 'off'); await seg(p, '#mRec', 'kneeLift'); await seg(p, '#mPreset', 'all'); await sleep(100);
    const kneeA = J(await p.eval(`JSON.stringify(window.__l63.Modes.api.state().g.errK)`));
    await p.eval(`(() => { const M = window.__l63.Modes; M.api.set({ mask: [1, 0, 1, 0, 0] }); return true; })()`); await sleep(100);
    const knee2 = J(await p.eval(`JSON.stringify(window.__l63.Modes.api.state().g.errK)`)), best2 = Object.entries(L2.knee2).sort((a, b) => a[1] - b[1])[0];
    check(Math.abs(kneeA - L2.kneeAll) < 1e-9 && best2[0] === '10100' && Math.abs(knee2 - best2[1]) < 1e-9, `свободный режим: подъём колена со всеми частями ${f2(kneeA)} см, лучшая пара частей — углы рук и ног, ${f2(knee2)} см (ответ задания)`);
    const ma = await text(p, '#modesAfter');
    const maMiss = missing(ma, [`ошибка ${f2(L2.m1.s.errK)} см против ${f2(L2.m1.g.errK)} см`, `ошибается на ${f2(L2.m2.s.errK)} см, а генералист на ${f2(L2.m2.g.errK)} см`, `в ${f2(L2.m3.g.part.upK)} см от записи`, `расходятся на ${f0(L2.m3.g.part.legJ)}°`, `с ошибкой ${f2(L2.m4.g.errK)} см`, `ошибается на ${f2(L2.m4.s.errK)} см`, `генералист даже немного точнее: ${f2(L2.table.gen.exbody.te)} см против ${f2(L2.table.exbody.exbody.te)} см`]);
    check(!maMiss.length, 'текст после лаборатории 2 называет те же числа' + (maMiss.length ? ' — нет: ' + maMiss.join(', ') : ''));
    const T = L2.table, deep2 = await text(p, '#modes .deep');
    const tMiss = missing(deep2, E.MODE_IDS.map((m) => `${f2(T.gen[m].tr)} и ${f2(T.gen[m].te)} см`).concat(E.MODE_IDS.map((m) => `${f2(T[m][m].tr)} и ${f2(T[m][m].te)} см`)));
    check(!tMiss.length, '«Под капотом» лаборатории 2: таблица режимов совпадает с вшитыми политиками' + (tMiss.length ? ' — нет: ' + tMiss.join(', ') : ''));

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapGPol')) && !(await visible(p, '#wrapGRec')) && !(await visible(p, '#wrapGView')), 'миссия 1: политика, запись и сводка скрыты');
    await show(p, 'delta', '#delta .lab', 'l63-delta-start.png');
    const bs = sm(L3.base), as = sm(L3.asap), ps = sm(L3.plain), ss = sm(L3.sysid);
    let t0 = Date.now(); r = await viaUI(p, '#gMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`${f2(bs.sim)} см и сорвано ${bs.simBad} записей из 21`) && r.out.includes(`${f2(bs.real)} см и ${bs.realBad} из 21`), `миссия 1 (${((Date.now() - t0) / 1000).toFixed(0)} с): в симуляторе ${f2(bs.sim)} см (${bs.simBad}), на настоящей Аде ${f2(bs.real)} см (${bs.realBad})`);
    await p.eval(`(() => { const G = window.__l63.Gap; G.st.hold = true; G.st.t = 1.3; G.api.render(); return true; })()`); await show(p, 'delta', '#delta .lab', 'l63-delta-base.png'); await p.eval(`window.__l63.Gap.st.hold = false; true`);
    await nextMission(p, '#gMis');
    t0 = Date.now(); r = await viaUI(p, '#gMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в среднем на ${f2(L3.simErr)}°`) && r.out.includes(`даёт ${f2(L3.sid.err)}°`) && r.out.includes(`масса ×${f2(L3.sid.W.mass)}`), `миссия 2 (${((Date.now() - t0) / 1000).toFixed(0)} с): шаг ${f2(L3.simErr)}° → SysID ${f2(L3.sid.err)}° (масса ×${f2(L3.sid.W.mass)}, трение ×${f1(L3.sid.W.damp)})`);
    await nextMission(p, '#gMis');
    t0 = Date.now(); r = await viaUI(p, '#gMis', 1); outs.push(r.out);
    const a0 = L3.C[0];
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`ошибка шага ${f2(L3.dErr)}°`) && r.out.includes(`равна ${f2(a0[0])} × новая команда + ${f2(a0[1])} × прошлая`), `миссия 3 (${((Date.now() - t0) / 1000).toFixed(0)} с): дельта-модель ${f2(L3.dErr)}°, голеностоп ${f2(a0[0])} × новая + ${f2(a0[1])} × прошлая`);
    await p.eval(`(() => { const G = window.__l63.Gap; G.st.view = 'pred'; G.api.render(); return true; })()`); await show(p, 'delta', '#delta .lab', 'l63-delta-pred.png');
    await nextMission(p, '#gMis');
    t0 = Date.now(); r = await viaUI(p, '#gMis', 1); outs.push(r.out); const tTune = (Date.now() - t0) / 1000;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`с поправкой, ${f2(as.real)} см, сорвано ${as.realBad} записей из 21`) && r.out.includes(`${f2(ps.real)} см и сорвано ${ps.realBad} из 21`) && r.out.includes(`после дообучения с SysID — ${f2(ss.real)} см и ${ss.realBad} из 21`) && L3.tA === 1 && L3.tP === 0 && L3.tS === 0, `миссия 4 (${tTune.toFixed(0)} с в браузере): с поправкой ${f2(as.real)} см (${as.realBad}), обычное дообучение ${f2(ps.real)} см (${ps.realBad}), с SysID ${f2(ss.real)} см (${ss.realBad}), без дообучения ${f2(bs.real)} см`);
    const gEv = J(await p.eval(`JSON.stringify(window.__l63.Gap.POLS.map((id) => { const e = window.__l63.Gap.st.evals[id]; return e ? [e.sim.errK, e.real.errK] : null; }))`)), gWant = [bs, ps, ss, as];
    check(gEv.every((e, i) => e && Math.abs(e[0] - gWant[i].sim) < 1e-9 && Math.abs(e[1] - gWant[i].real) < 1e-9), 'сводка после миссии 4: столбики у всех четырёх политик (без дообучения, обычный симулятор, SysID, дельта-модель), числа как в Node');
    check(tTune < 25, `дообучение трёх политик в браузере занимает около 15 секунд, как сказано в миссии: ${tTune.toFixed(1)} с`);
    await p.eval(`(() => { const G = window.__l63.Gap; G.st.hold = true; G.st.t = 1.3; G.st.view = 'real'; G.api.render(); return true; })()`); await show(p, 'delta', '#delta .lab', 'l63-delta-tuned.png'); await p.eval(`window.__l63.Gap.st.hold = false; true`);
    await nextMission(p, '#gMis');
    check(await visible(p, '#wrapGPol') && await visible(p, '#wrapGRec') && await visible(p, '#wrapGView'), 'свободный режим: политика, запись и сводка видны');
    await seg(p, '#gPol', 'sysid'); await sleep(150);
    const gs = J(await p.eval(`JSON.stringify({ pol: window.__l63.Gap.st.pol, busy: window.__l63.Gap.st.busy, real: window.__l63.Gap.st.evals.sysid.real.errK })`));
    check(gs.pol === 'sysid' && !gs.busy && Math.abs(gs.real - ss.real) < 1e-9, `свободный режим: политика с SysID уже дообучена в миссии 4 и показывается сразу, без нового дообучения: ${f2(gs.real)} см на настоящей Аде, как в Node`);
    const da = await text(p, '#deltaAfter');
    const daMiss = missing(da, [`с ${f2(bs.sim)} до ${f2(bs.real)} см`, `${bs.realBad} записей из 21 против ${bs.simBad}`, `с ${f2(L3.simErr)}° до ${f2(L3.sid.err)}°`, `массу ×${f1(L3.sid.W.mass)}`, `до ${f2(L3.dErr)}°`, `${f2(a0[0])} × новая команда + ${f2(a0[1])} × прошлая`, `сдвиг ${f1(a0[4] * E.HALF[0] * 180 / Math.PI)}°`, `ошибка на настоящей Аде ${f2(as.real)} см и сорвано ${as.realBad} записей`, `ошибка ${f2(ps.real)} см и сорвано ${ps.realBad} записей`, `${f2(ss.real)} см и ${ss.realBad} записей`, `${f2(as.sim)} см против ${f2(ps.sim)} см`]);
    check(!daMiss.length, 'текст после лаборатории 3 называет те же числа' + (daMiss.length ? ' — нет: ' + daMiss.join(', ') : ''));
    const deep3 = await text(p, '#delta .deep');
    check(deep3.includes(`всего ${L3.steps} шагов`) && deep3.includes(`${L3.sid.n} сочетаний`), `«Под капотом» лаборатории 3: ${L3.steps} записанных шагов, ${L3.sid.n} сочетаний SysID`);
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    const ll = await labLabels(p);
    check(!ll.bad.length && ll.minPx >= 9.95, `канвасы лабораторий (компьютер): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ll.minPx.toFixed(1)})` + (ll.bad.length ? ': ' + ll.bad.slice(0, 4).join('; ') : ''));
    check(!ll.texts.some((x) => POS.test(x)), 'канвасы лабораторий: в подписях нет слов о расположении');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    const finMiss = missing(fin, ['5 записей из 10', `(${f2(L2.m1.s.errK)} против ${f2(L2.m1.g.errK)} см на новом приседе)`, `на ${f2(L2.m2.s.errK)} см`, `с ${f2(bs.real)} до ${f2(as.real)} см`, `только до ${f2(ps.real)} см`, '94,10%', '47,11%', `Резкий удар и резкий поклон в темпе ${f1(L1.slow.bowFast)}× проходят`]);
    check(!finMiss.length && L1.slow.kickFast === L1.slow.bowFast && L1.slow.sprint < L1.slow.bowFast, `итоги урока называют числа лабораторий и статей; в темпе ${f1(L1.slow.bowFast)}× проходят только резкий удар и резкий поклон, бег — с ${f1(L1.slow.sprint)}×` + (finMiss.length ? ' — нет: ' + finMiss.join(', ') : ''));
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l63.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел');
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    await p.eval(`(() => { const W = window.__l63; W.Filter.st.hold = true; W.Filter.st.sel = 'bowFast'; W.Filter.st.speed = 1; W.Filter.st.t = 0.6; W.Filter.api.render(); W.Modes.st.hold = true; W.Modes.st.t = 1.2; W.Modes.api.render(); W.Gap.st.hold = true; W.Gap.st.t = 1.3; W.Gap.api.render(); return true; })()`);
    for (const [id, sel, n] of [['filter', '#filter .lab', 'l63-filter-dark.png'], ['modes', '#modes .lab', 'l63-modes-dark.png'], ['delta', '#delta .lab', 'l63-delta-dark.png'], ['hover', '#hover .flow-card', 'l63-distill-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l63; L63.MODE_IDS; W.Filter.IDS.forEach((id) => W.Filter.api.predict(id, 1)); await W.Filter.api.runAll(); W.Filter.st.hold = true; W.Filter.st.sel = 'bowFast'; W.Filter.st.t = 0.6; W.Filter.api.render(); W.Modes.api.set({ preset: 'h2o', spec: 'h2o', rec: 'squat12', sw: null }); W.Modes.st.hold = true; W.Modes.st.t = 1.2; W.Modes.api.render(); await W.Gap.api.tuneAll(); W.Gap.st.hold = true; W.Gap.st.t = 1.3; W.Gap.api.render(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const sm2 = await schemeLabels(m, 'distill', FRAMES.distill);
    check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length, `телефон, схема distill (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    const ml = await labLabels(m);
    check(!ml.bad.length && ml.minPx >= 9.95, `телефон, канвасы лабораторий: подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ml.minPx.toFixed(1)})` + (ml.bad.length ? ': ' + ml.bad.slice(0, 4).join('; ') : ''));
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['hover', '#hover .flow-card', 'l63-m-distill.png'], ['filter', '#filter .lab', 'l63-m-filter.png'], ['modes', '#modes .lab', 'l63-m-modes.png'], ['delta', '#delta .lab', 'l63-m-delta.png'], ['student', '#ablOmni', 'l63-m-omni.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
