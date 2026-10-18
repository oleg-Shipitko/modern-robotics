// Урок 5.6 «Offline RL»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l56-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-31 python3 lessons/build.py l56.
// node tools/lesson56.js          — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема);
// node tools/lesson56.js --seeds  — проверка в Node: выводы лабораторий на зёрнах 1–10 и диапазоны из «Под капотом».
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l56/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const r2 = (v, d) => (+v).toFixed(d).replace('.', ',');

/* ---------- режим --seed N: одно зерно в Node, все числа, о которых урок говорит «на десяти зёрнах» (JSON) ---------- */
if (process.argv.includes('--seed')) {
  const E = require('../lessons/l56/engine.js'), seed = +process.argv[process.argv.indexOf('--seed') + 1];
  const sm = (ev) => ({ ok: ev.ok, t: ev.tGoal, ret: ev.ret, Q0: ev.Q0, G0: ev.G0, fast: ev.fast });
  const trips = E.logs(E.MIX, seed), T = E.transitions(trips), res = { seed, ops: E.opStats(trips), lab1: {}, alpha: {}, sets: {} }, M = {};
  for (const k of ['bc', 'naive', 'cql', 'iql', 'bcq']) { M[k] = E.run(k, T, { seed }); res.lab1[k] = sm(E.evaluate(M[k])); }
  const s0 = trips.find((e) => e.op === 'careful').traj[10], cnt = E.localCounts(trips, s0), tot = cnt.reduce((a, b) => a + b, 0), ref = cnt.indexOf(Math.max(...cnt)), x = E.observe(s0);
  const probe = (m) => { const q = E.qOf(m, x), a = E.act(m, x); return { a, share: cnt[a] / tot, rel: q[a] - q[ref], isRef: a === ref }; };
  res.probe = { tot, ref, naive: probe(M.naive), bcq: probe(M.bcq) };
  for (const a of [0.03, 0.1, 0.3, 1, 3, 10]) { const m = a === 1 ? M.cql : E.run('cql', T, { seed, CQL_ALPHA: a }); res.alpha[a] = Object.assign(sm(E.evaluate(m)), { probe: probe(m) }); }
  for (const set of ['careful', 'hurried', 'random']) { const tr = E.logs(E.SETS[set], seed), TT = E.transitions(tr); res.sets[set] = { op: E.opStats(tr)[set], bc: sm(E.evaluate(E.run('bc', TT, { seed }))), iql: sm(E.evaluate(E.run('iql', TT, { seed }))) }; }
  process.stdout.write(JSON.stringify(res));
} else if (process.argv.includes('--seeds')) {
/* ---------- режим --seeds: десять зёрен в Node, по процессу на зерно (результат — shots/l56-seeds.json) ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R = {};
  const runOne = (s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed', String(s)], { maxBuffer: 1 << 24 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    const pool = 5; let i = 0;
    await Promise.all(Array.from({ length: pool }, async () => { while (i < seeds.length) { const s = seeds[i++]; R[s] = await runOne(s); console.log(`зерно ${s}: BC ${R[s].lab1.bc.ok}, наивное ${R[s].lab1.naive.ok}, CQL ${R[s].lab1.cql.ok}, IQL ${R[s].lab1.iql.ok} из 20; отдача IQL ${r2(R[s].lab1.iql.ret, 2)}, лучший оператор ${r2(Math.max(R[s].ops.careful.ret, R[s].ops.hurried.ret), 2)}`); } }));
    fs.writeFileSync(path.resolve(__dirname, '../shots/l56-seeds.json'), JSON.stringify(R));
    const S = seeds.map((s) => R[s]), mm = (f) => { const v = S.map(f); return [Math.min(...v), Math.max(...v)]; }, cnt = (f) => S.filter(f).length;
    const txt = plain();
    const best = (x) => Math.max(x.ops.careful.ret, x.ops.hurried.ret);
    const [i0, i1] = mm((x) => x.lab1.iql.ok), [b0, b1] = mm((x) => x.lab1.bc.ok), [c0, c1] = mm((x) => x.lab1.cql.ok);
    const iqlBeat = cnt((x) => x.lab1.iql.ret > best(x)), iqlBc = cnt((x) => x.lab1.iql.ret > x.lab1.bc.ret), naive0 = cnt((x) => x.lab1.naive.ok === 0);
    const [q0, q1] = mm((x) => x.lab1.naive.Q0);
    console.log(`лаб. 1: IQL ${i0}–${i1}, BC ${b0}–${b1}, CQL ${c0}–${c1}; IQL выше лучшего оператора на ${iqlBeat}, выше BC на ${iqlBc}; наивное 0 из 20 на ${naive0}; обещание наивной ${r2(q0, 0)}–${r2(q1, 0)}`);
    check(naive0 === 10, 'наивное Q-обучение не доезжает ни разу на всех десяти зёрнах');
    const [k0, k1] = mm((x) => x.lab1.bcq.ok), cqlBc = cnt((x) => x.lab1.cql.ret > x.lab1.bc.ret);
    check(txt.includes(`IQL доезжает в ${i0}–${i1} поездках из 20`) && txt.includes(`BC — в ${b0}–${b1}`) && txt.includes(`CQL — в ${c0}–${c1}`) && txt.includes(`BCQ — в ${k0}–${k1}`), `«Под капотом» лаборатории 1: диапазоны IQL ${i0}–${i1}, BC ${b0}–${b1}, CQL ${c0}–${c1}, BCQ ${k0}–${k1}`);
    check(txt.includes(`обходит BC по отдаче лишь на ${cqlBc} зёрнах из 10`), `CQL выше BC по отдаче на ${cqlBc} зёрнах`);
    check(txt.includes(`больше лучшего оператора на ${iqlBeat} зёрнах из 10`) && txt.includes(`больше BC — на ${iqlBc}`), `IQL выше лучшего оператора на ${iqlBeat} зёрнах, выше BC на ${iqlBc}`);
    check(txt.includes(`от ${r2(q0, 0)} до ${r2(q1, 0)}`), `обещание наивной Q-функции на старте: от ${r2(q0, 0)} до ${r2(q1, 0)}`);
    const okA = (a) => mm((x) => x.alpha[a].ok);
    const lowA = cnt((x) => x.alpha['0.03'].ok <= 5), midA = cnt((x) => x.alpha['0.3'].ok >= 15), refHi = cnt((x) => x.alpha['10'].probe.isRef), shareN = cnt((x) => x.probe.naive.share < 0.05);
    const [a00, a01] = okA('0.03'), [a30, a31] = okA('0.3'), [a10, a11] = okA('1');
    console.log(`лаб. 2: α 0,03 — ${a00}–${a01}; α 0,3 — ${a30}–${a31}; α 1 — ${a10}–${a11}; наивный выбор вне данных (<5%) на ${shareN}; при α 10 выбор = самое частое на ${refHi}`);
    const [a10b, a11b] = okA('0.1');
    check(a01 === 0 && txt.includes('при α = 0,03 не доезжает ни разу ни на одном зерне') && txt.includes(`при α = 0,1 — от ${a10b} до ${a11b}`) && txt.includes(`при α = 0,3 — от ${a30} до ${a31}`) && txt.includes(`при α = 1 — от ${a10} до ${a11}`), '«Под капотом» лаборатории 2: диапазоны по α');
    check(txt.includes(`выбирает самое частое действие логов на ${refHi} зёрнах из 10`), `при α = 10 выбор совпадает с самым частым на ${refHi} зёрнах`);
    check(txt.includes(`реже чем в 5% решений рядом на ${shareN} зёрнах из 10`), `наивная Q-функция выбирает редкое действие перед проёмом на ${shareN} зёрнах`);
    const st = (set, f) => mm((x) => f(x.sets[set]));
    const tie = cnt((x) => Math.abs(x.sets.careful.iql.t - x.sets.careful.op.tGoal) < 0.5 && x.sets.careful.iql.fast === 0);
    const hurFast = cnt((x) => x.sets.hurried.iql.fast >= 0.99), rndWin = cnt((x) => x.sets.random.iql.ret > x.sets.random.bc.ret);
    const [ri0, ri1] = st('random', (s) => s.iql.ok), [rb0, rb1] = st('random', (s) => s.bc.ok);
    console.log(`лаб. 3: аккуратный — IQL как оператор на ${tie}; торопливый — IQL всегда быстро на ${hurFast}; случайный — IQL ${ri0}–${ri1}, BC ${rb0}–${rb1}, IQL выше BC на ${rndWin}`);
    check(txt.includes(`едет как оператор на ${tie} зёрнах из 10`) && txt.includes(`всегда быстро — на ${hurFast}`), 'лаборатория 3: логи одного оператора');
    check(txt.includes(`IQL — от ${ri0} до ${ri1}`) && txt.includes(`BC — от ${rb0} до ${rb1}`) && txt.includes(`IQL набирает больше BC на ${rndWin}`), 'лаборатория 3: логи случайного оператора');
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-6-offline-rl.html');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 6000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
async function liveDone(p, mis, timeout) {
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 60000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const idle = (p, lab) => p.waitFor(`!window.__l56.${lab}.st.busy`, 240000);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.5: три вопроса');
    check(await p.eval(`!!document.querySelector('#finale .bridge-note a[href="5-7-rl-na-realnykh-robotakh.html"]')`), 'в мосте ссылка на урок 5.7 (выходит в тот же день)');
    const bridge = await text(p, '#finale .bridge-note');
    check(/5\.7/.test(bridge) && /RL на реальных роботах/.test(bridge) && /подстраховывает/.test(bridge), 'в итогах — мост в 5.7 «RL на реальных роботах»');
    check((await p.eval(`L56.CFG.SEED`)) === 1 && (await p.eval(`L56.CFG.STEPS`)) === 4000, 'зерно 1, 4000 шагов обучения');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['loops', 'why', 1.0, 7.2], ['maxpeak', 'ideas', 2.0, 10.5]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await show(p, sec, `#${sec} .flow-card`, `l56-${id}.png`);
    }

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapDSides')) && !(await visible(p, '#wrapDView')), 'миссия 1: выбор панелей и вид графика скрыты');
    await show(p, 'duel', '#duel .lab', 'l56-duel-empty.png');
    let r = await viaUI(p, '#dMis', 2);
    const m1 = r.out.match(/Аккуратный: (\d+) поездок из (\d+), ([\d,]+) с, в среднем \+([\d,]+) за поездку\. Торопливый: (\d+) из (\d+), ([\d,]+) с, \+([\d,]+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m1 && m1[1] === '20' && m1[3] === '15,1' && m1[4] === '0,51' && m1[5] === '22' && m1[6] === '40' && m1[7] === '8,9' && m1[8] === '0,45', `миссия 1: аккуратный ${m1 && m1[4]}, торопливый ${m1 && m1[8]} — почти поровну`);
    await show(p, 'duel', '#duel .lab', 'l56-duel-logs.png');
    await nextMission(p, '#dMis');
    const t0 = Date.now();
    r = await viaUI(p, '#dMis', 2);
    const secs = (Date.now() - t0) / 1000;
    const m2 = r.out.match(/IQL: (\d+) из 20, ([\d,]+) с, \+([\d,]+) за поездку.*?BC: (\d+) из 20, (-?[\d,]+).*?CQL: (\d+) из 20 за ([\d,]+) с, \+?(-?[\d,]+).*?в среднем получило (-?[\d,]+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m2 && m2[1] === '18' && m2[2] === '10,9' && m2[3] === '1,98' && m2[4] === '14' && m2[5] === '-0,08' && m2[6] === '17' && m2[7] === '14,2' && m2[8] === '0,01' && m2[9] === '-8,25', `миссия 2 (${secs.toFixed(0)} с): IQL ${m2 && m2[1]} из 20, ${m2 && m2[3]}; BC ${m2 && m2[4]}, ${m2 && m2[5]}; CQL ${m2 && m2[6]}; наивное ${m2 && m2[9]}`);
    const reg = J(await p.eval(`(() => { const S = window.__l56.Store, reg = (s) => (s.x < 200 ? 'h' : s.x < 396 ? 'l' : 'k'); const o = {}; for (const k of ['bc', 'iql']) { const ev = S.get('mix', k).ev, f = {}, c = {}; let crK = 0, cr = 0; for (const e of ev.eps) { e.acts.forEach((a, t) => { const g = reg(e.traj[t]); c[g] = (c[g] || 0) + 1; if (a >= L56.CFG.NS) f[g] = (f[g] || 0) + 1; }); if (e.outcome === 'crash') { cr++; if (reg(e.traj[e.traj.length - 1]) === 'k') crK++; } } o[k] = { h: (f.h || 0) / c.h, l: (f.l || 0) / c.l, k: (f.k || 0) / c.k, cr, crK }; } const hu = window.__l56.Store.data('mix').trips.filter((e) => e.op === 'hurried' && e.outcome === 'crash'); o.hurK = hu.filter((e) => reg(e.traj[e.traj.length - 1]) === 'k').length; o.hur = hu.length; return JSON.stringify(o); })()`));
    const da = await text(p, '#duelAfter');
    check(reg.bc.cr === 6 && reg.bc.crK === 6 && da.includes('все шесть аварий — на кухне') && reg.hurK === 18 && reg.hur === 18 && da.includes('в 18 поездках из 40 врезается'), `BC: ${reg.bc.crK} из ${reg.bc.cr} аварий на кухне; торопливый: ${reg.hurK} из ${reg.hur} на кухне`);
    check(Math.round(reg.iql.k * 100) === 9 && reg.iql.h > 0.55 && reg.iql.h < 0.65 && reg.iql.l > 0.55 && reg.iql.l < 0.65 && da.includes('примерно в 60% решений, а на кухне — в 9%'), `IQL быстро: прихожая ${Math.round(reg.iql.h * 100)}%, гостиная ${Math.round(reg.iql.l * 100)}%, кухня ${Math.round(reg.iql.k * 100)}%`);
    check(reg.bc.k > reg.bc.h && reg.bc.k > reg.bc.l, `BC быстрее на кухне (${Math.round(reg.bc.k * 100)}%), чем в прихожей (${Math.round(reg.bc.h * 100)}%)`);
    await show(p, 'duel', '#duel .lab', 'l56-duel.png');
    await nextMission(p, '#dMis');
    r = await viaUI(p, '#dMis', 2);
    const m3 = r.out.match(/обещала ([\d,]+), а вышло (-[\d,]+).*?CQL обещает ([\d,]+) при (-[\d,]+).*?IQL обещает ([\d,]+) и получает ([\d,]+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m3 && m3[1] === '93,0' && m3[2] === '-3,92' && m3[3] === '11,2' && m3[4] === '-0,45' && m3[5] === '0,60' && m3[6] === '0,66', `миссия 3: наивная ${m3 && m3[1]} против ${m3 && m3[2]}, CQL ${m3 && m3[3]}, IQL ${m3 && m3[5]} против ${m3 && m3[6]}`);
    check(['93,0', '-3,92', '11,2', '-0,45', '18 из 20 за 10,9 секунды', '+1,98', '+0,51 и +0,45', '14 поездок из 20'].every((x) => da.includes(x)), 'инференс после лаборатории 1 называет те же числа');
    await show(p, 'duel', '#duel .lab', 'l56-duel-promise.png');
    await nextMission(p, '#dMis');
    check(await visible(p, '#wrapDSides') && await visible(p, '#wrapDView'), 'свободный режим: выбор панелей и вида виден');
    await seg(p, '#dView', 'ret'); await seg(p, '#dLeft', 'bcq'); await sleep(200); await idle(p, 'Duel'); await sleep(200);
    const bcqStat = await text(p, '#dStatL');
    check(/17 из 20 доехали · 10,3 с · отдача \+1,83/.test(bcqStat), 'свободный режим: BCQ обучился при выборе — ' + bcqStat);

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapRMethod')) && !(await visible(p, '#wrapRAlpha')), 'миссия 1: выбор Q-функции и ползунок α скрыты');
    r = await viaUI(p, '#rMis', 1);
    const p1 = r.out.match(/Лучшим она считает руль до упора влево, медленно: оценка на ([\d,]+) выше.*?записано (\d+) таких решений из (\d+).*?на ([+-][\d,]+)\..*?Наивная Ада делает это действие снова и снова: (\d+) поездок из 20/);
    check(r.ok && /ставка сыграла/i.test(r.out) && p1 && p1[1] === '12,5' && p1[2] === '5' && p1[3] === '375' && p1[4] === '+0,01' && p1[5] === '0', `миссия 1: пик ${p1 && p1[1]}, ${p1 && p1[2]} из ${p1 && p1[3]} рядом, на деле ${p1 && p1[4]}`);
    await show(p, 'probe', '#probe .lab', 'l56-probe-naive.png');
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRAlpha') && !(await visible(p, '#wrapRMethod')), 'миссия 2: виден ползунок α');
    for (const i of [0, 1, 2]) { await setRange(p, '#rAlpha', i); await sleep(150); await idle(p, 'Probe'); await sleep(200); }
    r = await liveDone(p, '#rMis', 30000);
    check(r.ok && /α = 0,03: 0 из 20; α = 0,1: 5 из 20; α = 0,3: 15 из 20/.test(r.out), 'миссия 2 засчитана сама: ' + r.out.slice(0, 90));
    await show(p, 'probe', '#probe .lab', 'l56-probe-cql.png');
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /BCQ: 17 поездок из 20 за 10,3 с, отдача \+1,83/.test(r.out), 'миссия 3: ' + r.out.slice(0, 80));
    await show(p, 'probe', '#probe .lab', 'l56-probe-bcq.png');
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRMethod') && await visible(p, '#wrapRAlpha'), 'свободный режим: выбор Q-функции и α виден');
    const pa = await text(p, '#probeAfter');
    check(['12,5', '5 таких решений из 375', 'α = 0,03', 'при α = 0,1 — в 5 поездках из 20', 'α = 0,3 — уже в 15'].every((x) => pa.includes(x)), 'инференс после лаборатории 2 называет те же числа');
    // утверждение текста: при α от 1 и выше в точке щупа CQL выбирает самое частое действие (проверка в движке)
    const hiRef = J(await p.eval(`(() => { const E = L56, d = window.__l56.Store.data('mix'), s = d.trips.find((e) => e.op === 'careful').traj[10], cnt = E.localCounts(d.trips, s), ref = cnt.indexOf(Math.max(...cnt)), x = E.observe(s); return JSON.stringify([1, 3, 10].map((a) => { const m = a === 1 ? window.__l56.Store.get('mix', 'cql', 1).M : E.run('cql', d.T, { seed: E.CFG.SEED, CQL_ALPHA: a }); return E.act(m, x) === ref; })); })()`));
    check(hiRef.every(Boolean), 'при α = 1, 3 и 10 CQL в точке щупа выбирает самое частое действие: ' + hiRef.join(','));

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapSSet')), 'миссии 1–3: выбор набора скрыт');
    await show(p, 'sets', '#sets .lab', 'l56-sets-empty.png');
    r = await viaUI(p, '#sMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /IQL: 20 из 20 · 15,1 с/.test(r.out), 'миссия 1 (аккуратный): ' + r.out.slice(0, 120));
    await nextMission(p, '#sMis');
    r = await viaUI(p, '#sMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /IQL: 8 из 20 .*быстрых решений 100%/.test(r.out) && /BC: 11 из 20/.test(r.out), 'миссия 2 (торопливый): ' + r.out.slice(0, 120));
    await nextMission(p, '#sMis');
    r = await viaUI(p, '#sMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && /Оператор: 17 из 100/.test(r.out) && /BC: 20 из 20 · 12,3 с · \+1,90/.test(r.out) && /IQL: 20 из 20 · 8,2 с · \+4,02/.test(r.out), 'миссия 3 (случайный): ' + r.out.slice(0, 140));
    await show(p, 'sets', '#sets .lab', 'l56-sets.png');
    await nextMission(p, '#sMis');
    check(await visible(p, '#wrapSSet'), 'свободный режим: выбор набора виден');
    const sa = await text(p, '#setsAfter');
    check(['20 поездок из 20 за 15,1 секунды', 'в 17 поездках из 100', '20 поездок из 20 за 8,2 секунды', '+4,02', '12,3 секунды'].every((x) => sa.includes(x)), 'инференс после лаборатории 3 называет те же числа');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    check(['+1,98', '+0,51', '93,0', '-3,92', '5 раз из 375', '17 поездках из 100', '20 из 20 за 8,2 секунды', '87%', '96%'].every((x) => fin.includes(x)), 'итоги урока называют числа лабораторий и статей');
    const lead = await text(p, '.hero .lead');
    check(['580 тысяч', '7 роботах', '87%', '28 тысяч', '96%'].every((x) => lead.includes(x)), 'шапка: числа QT-Opt');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    const quiz = await p.eval(`document.getElementById('quizBox').textContent`).then(sp);
    const qMiss = ['93,0', '-3,92', '-0,08', '+0,51', 'α = 0,03', 'α = 0,3', '15 поездках из 20', '0,60', '0,66', '17 поездках из 100', '8,2 с'].filter((x) => !quiz.includes(x));
    check(!qMiss.length, 'квиз: числа в объяснениях совпадают с лабораториями' + (qMiss.length ? ' — нет: ' + qMiss.join(', ') : ''));
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 20 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['duel', '#duel .lab', 'l56-duel-dark.png'], ['probe', '#probe .lab', 'l56-probe-dark.png'], ['sets', '#sets .lab', 'l56-sets-dark.png'], ['why', '#why .flow-card', 'l56-loops-dark.png'], ['ideas', '#ideas .flow-card', 'l56-maxpeak-dark.png'], ['robots', '#robots .num-table', 'l56-robots-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l56; await W.Duel.api.logs(); await W.Duel.api.four(); await W.Probe.api.naive(); await W.Sets.api.train('random'); return true; })()`, true);
    await m.eval(`window.__l56.Duel.st.view = 'promise'; window.__l56.Duel.api.render(); true`);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['why', '#why .flow-card', 'l56-m-loops.png'], ['ideas', '#ideas .flow-card', 'l56-m-maxpeak.png'], ['duel', '#duel .lab', 'l56-m-duel.png'], ['probe', '#probe .lab', 'l56-m-probe.png'], ['sets', '#sets .lab', 'l56-m-sets.png'], ['robots', '#robots .num-table', 'l56-m-robots.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
