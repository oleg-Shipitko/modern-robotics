// Урок 5.7 «RL на реальных роботах и дообучение VLA»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без
// горизонтальной прокрутки. Снимки — shots/l57-*.png. Урок собирается на дату выпуска:
// MR_ASOF=2026-10-31 python3 lessons/build.py l57.
// node tools/lesson57.js          — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема);
// node tools/lesson57.js --seeds  — проверка в Node: выводы лабораторий на зёрнах 1–10 и диапазоны из «Под капотом».
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l57/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

/* ---------- режим --seed N: одно зерно в Node (JSON) ---------- */
if (process.argv.includes('--seed')) {
  const E = require('../lessons/l57/engine.js'), seed = +process.argv[process.argv.indexOf('--seed') + 1]; E.CFG.SEED = seed;
  const sm = (ev) => ({ ok: ev.ok, t: ev.tGoal, ph: ev.perHour, shelf: ev.by.shelf.ok, near: ev.by.near.ok });
  const b = E.run(E.trainBase()), res = { seed, base: sm(E.evaluate(b.P, 0)) };
  const W = E.collectWithTeacher(b.P, E.CFG.N_ROLL, seed * 17 + 1); res.robot = W.filter((e) => e.outcome === 'goal').length;
  for (const m of E.METHODS) { const R = E.run(E.finetune(b.P, W, m)); res[m] = sm(E.evaluate(R.P, m === 'adv' ? 1 : 0)); }
  if (seed <= 3) {   // лаборатория 2: исправления наблюдателя из соседней ниши
    const A = E.collect(b.P, E.CFG.N_ROLL, seed * 17 + 1); res.lab2 = {};
    for (const k of [1, 3, 10]) { const iv = E.collectWithTeacher(b.P, k, seed * 5 + 3, { P_REACT: 1 }, 0, 1); const Rp = E.run(E.finetune(b.P, A.concat(iv), 'adv', { PRIO: 'human' })), R0 = E.run(E.finetune(b.P, A.concat(iv), 'adv')); res.lab2[k] = { prio: E.evaluate(Rp.P, 1, E.starts('shelf')).ok, plain: E.evaluate(R0.P, 1, E.starts('shelf')).ok }; }
  }
  if (seed <= 2) {   // лаборатория 3: 320 демонстраций и шесть итераций
    const d = E.run(E.trainDemoPolicy(320)); res.lab3 = { demo320: sm(E.evaluate(d.P, 0)), iters: [] };
    let data = b.D.slice(), P = b.P;
    for (let it = 1; it <= E.CFG.ITERS; it++) { const eps = E.collectWithTeacher(P, E.CFG.ITER_N, seed * 101 + it, {}, undefined, undefined, it > 1 ? 1 : 0); data = data.concat(eps); const R = E.run(E.finetune(b.P, data, 'adv', { PRIO: 'human' })); P = R.P; res.lab3.iters.push(sm(E.evaluate(P, 1))); }
  }
  process.stdout.write(JSON.stringify(res));
} else if (process.argv.includes('--seeds')) {
/* ---------- режим --seeds: десять зёрен в Node, по процессу на зерно (результат — shots/l57-seeds.json) ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R = {};
  const runOne = (s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed', String(s)], { maxBuffer: 1 << 24 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    const pool = 2; let i = 0;
    await Promise.all(Array.from({ length: pool }, async () => { while (i < seeds.length) { const s = seeds[i++]; R[s] = await runOne(s); const r = R[s]; console.log(`зерно ${s}: база ${r.base.ok}, робот ${r.robot}/100; только удачные ${r.success.ok} (${r.success.t.toFixed(2)}), с меткой ${r.adv.ok} (${r.adv.t.toFixed(2)}), без разметки ${r.all.ok} (${r.all.t.toFixed(2)})`); } }));
    fs.writeFileSync(path.resolve(__dirname, '../shots/l57-seeds.json'), JSON.stringify(R));
    const S = seeds.map((s) => R[s]), mm = (f) => { const v = S.map(f); return [Math.min(...v), Math.max(...v)]; }, cnt = (f) => S.filter(f).length, txt = plain();
    const [r0, r1] = mm((x) => x.robot), allMin = cnt((x) => x.all.ok <= Math.min(x.success.ok, x.adv.ok)), allLt = cnt((x) => x.all.ok < x.success.ok), fast = cnt((x) => x.adv.t < x.success.t), plus8 = cnt((x) => x.success.ok >= x.base.ok + 8 && x.adv.ok >= x.base.ok + 8);
    const [s0, s1] = mm((x) => x.success.ok), [a0, a1] = mm((x) => x.adv.ok), [l0, l1] = mm((x) => x.all.ok);
    console.log(`лаб. 1: робот ${r0}–${r1}; без разметки ≤ min на ${allMin}, < только удачных на ${allLt}; с меткой быстрее на ${fast}; +8 на ${plus8}; диапазоны ${s0}–${s1} / ${a0}–${a1} / ${l0}–${l1}`);
    check(txt.includes(`в ${r0}–${r1} попытках из 100`), `«Под капотом» лаборатории 1: удачных попыток робота ${r0}–${r1}`);
    check(txt.includes(`ни «все с меткой» на ${allMin} зёрнах из 10 и уступает «только удачным» на ${allLt}`), `«все без разметки» ≤ обоих на ${allMin}, меньше «только удачных» на ${allLt}`);
    check(txt.includes(`чем «только удачные», на ${fast} зёрнах из 10`), `«все с меткой» быстрее на ${fast} зёрнах`);
    const phUp = cnt((x) => x.adv.ph > x.success.ph), phMax = Math.ceil(Math.max(...S.map((x) => Math.abs(x.adv.ph / x.success.ph - 1))) * 100);
    console.log(`лаб. 1: удачных в час «все с меткой» больше на ${phUp} зёрнах, разница не больше ${phMax}%`);
    check(txt.includes(`по удачным попыткам в час впереди на ${phUp} зёрнах из 10, но не больше чем на ${phMax}%`), `удачных в час: «все с меткой» впереди на ${phUp} зёрнах, не больше чем на ${phMax}%`);
    check(txt.includes(`по демонстрациям на ${plus8} зёрнах из 10`), `+8 стартов на ${plus8} зёрнах`);
    check(txt.includes(`«только удачные» — ${s0}–${s1}, «все с меткой» — ${a0}–${a1}, «все без разметки» — ${l0}–${l1}`), `диапазоны удачных: ${s0}–${s1}, ${a0}–${a1}, ${l0}–${l1}`);
    const L2 = [1, 2, 3].map((s) => R[s].lab2), m2 = (k, f) => { const v = L2.map((x) => x[k][f]); return [Math.min(...v), Math.max(...v)]; };
    const [p10, p11] = m2(1, 'prio'), [p30, p31] = m2(3, 'prio'), [pa0, pa1] = m2(10, 'prio'), [q0, q1] = m2(10, 'plain');
    console.log(`лаб. 2 (зёрна 1–3): 1 исправление ${p10}–${p11}; 3 — ${p30}–${p31}; 10 — ${pa0}–${pa1}; без буфера при 10 — ${q0}–${q1}`);
    check(txt.includes(`от ${p10} до ${p11} удачных стартов из 20, три — от ${p30} до ${p31}, десять — от ${pa0} до ${pa1}; без буфера исправлений при десяти — от ${q0} до ${q1}`), '«Под капотом» лаборатории 2: диапазоны по числу исправлений');
    const l3a = R[1].lab3, l3b = R[2].lab3;
    console.log(`лаб. 3: зерно 1 — 320 демонстраций ${l3a.demo320.ok} (ниша ${l3a.demo320.shelf}), итерация 6 — ${l3a.iters[5].ok}; зерно 2 — ${l3b.demo320.ok} (ниша ${l3b.demo320.shelf}), ${l3b.iters[5].ok}`);
    check(txt.includes(`На зерне 2 политика по 320 демонстрациям даёт ${l3b.demo320.ok} из 60 и ${l3b.demo320.shelf} из 8 из соседней ниши, а шестая итерация опыта — ${l3b.iters[5].ok} из 60; на зерне 1 — ${l3a.demo320.ok} и ${l3a.iters[5].ok}`), '«Под капотом» лаборатории 3: зёрна 1 и 2');
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-7-rl-na-realnykh-robotakh.html');
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
/** Читатель ведёт чашку сам: эмуляция перетаскивания — цель курсора каждые 0,38 с ставится по правилу учителя, до конца попытки. */
const dragLikeTeacher = (p) => p.eval(`(async () => {
  const H = window.__l57.Hands, E = L57, st = H.st; const s0 = E.starts('shelf').filter((x) => x.kind === 'shelf')[st.step % 20];
  const aim = () => { const ep = st.ep; if (!ep || ep.outcome) return; const a = new Float64Array(2); E.teacher(ep.st, a, null); const pp = E.fk(ep.st.q); st.target = { x: pp.x + a[0] * E.ARM.DP, y: pp.y + a[1] * E.ARM.DP }; };
  st.target = { x: 0, y: 0 }; H.api.start(true); aim();
  const t0 = Date.now(); while (st.running && Date.now() - t0 < 20000) { await new Promise((r) => setTimeout(r, 40)); aim(); }
  st.hold = false; st.target = null; await new Promise((r) => setTimeout(r, 200));
  return JSON.stringify({ outcome: st.ep.outcome, T: st.ep.T, human: st.ep.who.reduce((a, b) => a + b, 0), mine: st.mine.length });
})()`, true).then(J);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.6: три вопроса');
    check(await p.eval(`!!document.querySelector('a[href="proverka-chasti-5.html"]')`), 'ссылка на проверку части 5 на месте (сборка на 31.10)');
    check(await p.eval(`!document.querySelector('a[href^="6-"]')`), 'ссылки на уроки части 6 нет');
    const bridge = await text(p, '#finale .bridge');
    check(/часть 6/.test(bridge) && /6\.1/.test(bridge) && /5\.2/.test(bridge) && /ноги/.test(bridge), 'в итогах — абзац-мост в часть 6 без ссылки, с ногами у Ады');
    check((await p.eval(`L57.CFG.SEED`)) === 1 && (await p.eval(`L57.CFG.STEPS_FT`)) === 3000 && (await p.eval(`L57.CFG.N_ROLL`)) === 100, 'зерно 1, 100 попыток, 3000 шагов дообучения');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b, snap] of [['hil', 'loop', 1.0, 4.2, 4.2], ['recap', 'recap', 2.0, 8.5, 5.0]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="${id}"]'), ${snap}); true`);
      await show(p, sec, `#${sec} .flow-card`, `l57-${id}.png`);
    }

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapTStart')) && !(await visible(p, '#wrapTView')), 'миссия 1: ползунок старта и переключатель сводки скрыты');
    await show(p, 'trio', '#trio .lab', 'l57-trio-empty.png');
    let t0 = Date.now(), r = await viaUI(p, '#tMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && /Удачных 81 из 100, промахов 19/.test(r.out) && /Из обычной позы робот промахнулся в 8 попытках из 71, у шкафа — в 2 из 16, из соседней ниши — в 9 из 13/.test(r.out) && /вмешивался в 27 попытках и довёл до ниши 23/.test(r.out) && /шагов в записях 173 из 1401/.test(r.out) && /0 из 8 на проверке/.test(r.out), `миссия 1 (${((Date.now() - t0) / 1000).toFixed(0)} с): ` + r.out.slice(0, 400));
    await show(p, 'trio', '#trio .lab', 'l57-trio-map.png');
    await nextMission(p, '#tMis');
    t0 = Date.now(); r = await viaUI(p, '#tMis', 1);
    const secs = (Date.now() - t0) / 1000;
    check(r.ok && /ставка сыграла/i.test(r.out) && /По демонстрациям: 44 из 60/.test(r.out) && /Только удачные: 59 из 60, у шкафа 12 из 12, из соседней ниши 7 из 8/.test(r.out) && /Все с меткой: 56 из 60, у шкафа 12 из 12, из ниши 4 из 8/.test(r.out) && /Все без разметки: 51 из 60, из ниши 1 из 8/.test(r.out) && /положительная у 659 шагов из 1401/.test(r.out) && /в 19 неудачных попытках таких шагов 56 из 149/.test(r.out) && /в удачных 649 из 1252/.test(r.out), `миссия 2 (${secs.toFixed(0)} с): ` + r.out.slice(0, 600));
    const stat = await text(p, '#tStat1');
    check(/56 из 60 удачных · 13,3 шага до ниши · 612 в час/.test(stat), 'панель «все с меткой»: ' + stat);
    await show(p, 'trio', '#trio .lab', 'l57-trio.png');
    await nextMission(p, '#tMis');
    r = await viaUI(p, '#tMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /по демонстрациям 13,6, только удачные 13,8, все с меткой 13,3, все без разметки 14,6/.test(r.out) && /510, 618, 612 и 551/.test(r.out) && /почти равны — 618 и 612: метка выигрывает 0,5 шага на попытку, а «только удачные» — 3 удачных старта из 60/.test(r.out), 'миссия 3: ' + r.out.slice(0, 120));
    await show(p, 'trio', '#trio .lab', 'l57-trio-speed.png');
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTStart') && await visible(p, '#wrapTView'), 'свободный режим: ползунок старта и переключатель сводки видны');
    await setRange(p, '#tStart', 7); await seg(p, '#tView', 'ok'); await sleep(200);
    check(/старт 8 из 60/.test(await p.eval(`window.__l57.Trio.st.k + 1 === 8 ? 'старт 8 из 60' : 'нет'`)), 'ползунок переключает проверочный старт');
    const ta = await text(p, '#trioAfter');
    check(['Из 100 попыток удачны 81', '8 раз из 71', '2 из 16', '9 из 13', 'в 27 попытках', '23 из них', '173 из 1401', '59 стартах из 60', 'в 56', 'в 51', '1 попытка из 8', '13,6 шага', '510', '13,8 шага и 618', '13,3 шага и 612', '14,6 и 551', '149 шагов', '56 помечены', '649 шагов из 1252', 'на три старта из соседней ниши', 'на полшага', 'на 1%'].every((x) => ta.includes(x)), 'инференс после лаборатории 1 называет те же числа');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapHKind')) && !(await visible(p, '#wrapHPrio')), 'миссия 1: выбор старта и буфера скрыты');
    await show(p, 'hands', '#hands .lab', 'l57-hands-empty.png');
    r = await viaUI(p, '#hMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /Чашка задела полку на шаге 1\./.test(r.out) && /\(0 из 20\)/.test(r.out) && /из соседней ниши удачных 0 из 13/.test(r.out), 'миссия 1: ' + r.out.slice(0, 100));
    await show(p, 'hands', '#hands .lab', 'l57-hands-robot.png');
    await nextMission(p, '#hMis');
    const d1 = await dragLikeTeacher(p);
    check(d1.outcome === 'goal' && d1.human === d1.T && d1.mine === 1, `читатель ведёт чашку сам: ${d1.outcome} за ${d1.T} шагов, своих ${d1.human}`);
    r = await liveDone(p, '#hMis', 10000);
    check(r.ok && /Исправленных попыток 1, из них в нише 1/.test(r.out), 'миссия 2 засчитана сама: ' + r.out.slice(0, 80));
    await show(p, 'hands', '#hands .lab', 'l57-hands-mine.png');
    await nextMission(p, '#hMis');
    t0 = Date.now(); r = await viaUI(p, '#hMis', 1);
    const st3 = J(await p.eval(`JSON.stringify((() => { const r = window.__l57.Hands.st.result; return { prio: r.prio.evShelf.ok, plain: r.plain.evShelf.ok, all: r.prio.ev.ok }; })())`));
    check(r.ok && /ставка/i.test(r.out) && st3.prio > 0 && r.out.includes(`С буфером исправлений: ${st3.prio} из 20`) && r.out.includes(`${st3.plain} из 20`), `миссия 3 (${((Date.now() - t0) / 1000).toFixed(0)} с): с буфером ${st3.prio} из 20, без ${st3.plain} из 20, всего ${st3.all} из 60`);
    await show(p, 'hands', '#hands .lab', 'l57-hands-corr1.png');
    await nextMission(p, '#hMis');
    t0 = Date.now(); r = await viaUI(p, '#hMis', 0);
    const st4 = J(await p.eval(`JSON.stringify((() => { const r = window.__l57.Hands.st.result; return { prio: r.prio.evShelf.ok, plain: r.plain.evShelf.ok, corr: r.corr, human: r.human }; })())`));
    check(r.ok && st4.corr === 10 && st4.prio >= 15 && r.out.includes(`дали ${st4.prio} из 20`), `миссия 4 (${((Date.now() - t0) / 1000).toFixed(0)} с): 10 исправлений → ${st4.prio} из 20 (без буфера ${st4.plain})`);
    await show(p, 'hands', '#hands .lab', 'l57-hands-corr10.png');
    await nextMission(p, '#hMis');
    check(await visible(p, '#wrapHKind') && await visible(p, '#wrapHPrio'), 'свободный режим: выбор старта и буфера виден');
    // числа текста — для исправлений наблюдателя (без попыток читателя)
    const ref = J(await p.eval(`(async () => { const H = window.__l57.Hands; H.api.reset(); H.api.scripted(1); const a = await H.api.corrected(); const b = await H.api.more(); return JSON.stringify({ one: [a.prio.evShelf.ok, a.plain.evShelf.ok, a.human], ten: [b.prio.evShelf.ok, b.plain.evShelf.ok, b.prio.ev.ok, b.human] }); })()`, true));
    check(ref.one[0] === 3 && ref.one[1] === 1 && ref.one[2] === 9 && ref.ten[0] === 19 && ref.ten[1] === 15 && ref.ten[2] === 58, `исправления наблюдателя: одно — ${ref.one[0]}/${ref.one[1]} из 20 (${ref.one[2]} шагов), десять — ${ref.ten[0]}/${ref.ten[1]} из 20, ${ref.ten[2]} из 60`);
    const ha = await text(p, '#handsAfter');
    check(['9 его шагов', '3 удачных старта из 20', 'без него — 1', '19 из 20 и 58 из 60', '15 из 20'].every((x) => ha.includes(x)), 'инференс после лаборатории 2 называет те же числа');

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapBMin')), 'миссии 1–2: ползунок бюджета скрыт');
    await show(p, 'budget', '#budget .lab', 'l57-budget-empty.png');
    t0 = Date.now(); r = await viaUI(p, '#bMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /80 демонстраций \(7,9 мин\): 44 из 60, из соседней ниши 0 из 8/.test(r.out) && /была 44 из 60/.test(r.out) && /75 попыток с присмотром \(7,6 мин\): 60 из 60, из соседней ниши 8 из 8/.test(r.out), `миссия 1 (${((Date.now() - t0) / 1000).toFixed(0)} с): ` + r.out.slice(0, 120));
    await show(p, 'budget', '#budget .lab', 'l57-budget-8.png');
    await nextMission(p, '#bMis');
    t0 = Date.now(); r = await viaUI(p, '#bMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /320 демонстраций \(31,5 мин\): 55 из 60 — у шкафа 12 из 12, из соседней ниши 3 из 8/.test(r.out) && /57 → 59 → 60 → 60 → 59 → 59 из 60/.test(r.out) && /из соседней ниши 7 из 8 за 15,3 мин/.test(r.out), `миссия 2 (${((Date.now() - t0) / 1000).toFixed(0)} с): ` + r.out.slice(0, 120));
    await show(p, 'budget', '#budget .lab', 'l57-budget-32.png');
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBMin'), 'свободный режим: ползунок бюджета виден');
    await setRange(p, '#bMin', 5); await sleep(150);
    const bo = await text(p, '#bOut');
    check(/За 5 мин\. Ещё демонстрации: 40 демонстраций \(3,9 мин\): 44 из 60/.test(bo) && /25 попыток с присмотром \(2,4 мин, итерация 1\): 57 из 60/.test(bo), 'бюджет 5 мин: ' + bo.slice(0, 160));
    const ba = await text(p, '#budgetAfter');
    check(['80 демонстраций дают 44', '75 попыток робота, дают 60 из 60', '320 демонстраций, поднимают результат до 55', 'во всех 12 стартах', 'только в 3 из 8', '57, 59, 60, 60, 59, 59 из 60', '7–8 из 8'].every((x) => ba.includes(x)), 'инференс после лаборатории 3 называет те же числа');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    check(['47% и 46%', '49,7%', '51 из 60', '59 и 56 из 60', '618 и 612', '13,3 шага против 13,8', '3 удачных старта из 20', 'десять — 19', 'без него 15', '59–60 из 60', '55'].every((x) => fin.includes(x)), 'итоги урока называют числа лабораторий и статей');
    const lead = await text(p, '.hero .lead');
    check(['1–2,5 часа', '100% успеха', '49,7%', '3D-мышью'].every((x) => lead.includes(x)), 'шапка: числа HIL-SERL');
    const ceil = await text(p, '#ceiling');
    check(['47% и 46%', '41,7% и 58,3%', '93,3%', 'справляется в 44', '40 из 40', '4 из 12', '0 из 8'].every((x) => ceil.includes(x)), 'раздел 1: числа статей и базовой политики');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    const quiz = await p.eval(`document.getElementById('quizBox').textContent`).then(sp);
    const qMiss = ['47%', '46%', '49,7%', '96,3%', '31,9%', '200 примерах', '1000 примерах', 'AWR'].filter((x) => !quiz.includes(x));
    check(!qMiss.length, 'квиз: числа в вопросах и объяснениях' + (qMiss.length ? ' — нет: ' + qMiss.join(', ') : ''));
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['trio', '#trio .lab', 'l57-trio-dark.png'], ['hands', '#hands .lab', 'l57-hands-dark.png'], ['budget', '#budget .lab', 'l57-budget-dark.png'], ['loop', '#loop .flow-card', 'l57-hil-dark.png'], ['recap', '#recap .flow-card', 'l57-recap-dark.png'], ['vla', '#vla .num-table', 'l57-vla-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l57; await W.Trio.api.map(); await W.Trio.api.three(); await W.Hands.api.robot(); await W.Budget.api.eight(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['loop', '#loop .flow-card', 'l57-m-hil.png'], ['recap', '#recap .flow-card', 'l57-m-recap.png'], ['trio', '#trio .lab', 'l57-m-trio.png'], ['hands', '#hands .lab', 'l57-m-hands.png'], ['budget', '#budget .lab', 'l57-m-budget.png'], ['vla', '#vla .num-table', 'l57-m-vla.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
