// Урок 5.5 «Обучение с привилегированной информацией»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без
// горизонтальной прокрутки. Снимки — shots/l55-*.png. Сборка: MR_ASOF=2026-10-31 python3 lessons/build.py l55.
// node tools/lesson55.js --seeds — проверка в Node на зёрнах 1–8: выводы лабораторий и диапазоны из «Под капотом».
const path = require('path');

/* ---------- режим --seeds: восемь зёрен в Node (каждое — в своём процессе) ---------- */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
function seedWorker(seed) {
  const E = require('../lessons/l55/engine.js'), F = E.FLOORS, FL = ['carpet', 'tile', 'wet', 'wetKitchen'], CHECK = FL.map((k) => F[k].mu), run = E.runGen;
  const T = run(E.trainPPO('priv', { seed })).A;
  const st = (kind, mode) => run(E.distill(T, kind, mode, { seed, check: CHECK, checkN: 10 }));
  const DS = st('sens', 'dagger'), DH = st('hist', 'dagger'), BH = st('hist', 'bc');
  const RS = run(E.trainPPO('sens', { seed })).A, RH = run(E.trainPPO('hist', { seed })).A;
  const pol = { T: E.ctlPPO(T), S: E.ctlStudent(DS.S), H: E.ctlStudent(DH.S), RS: E.ctlPPO(RS), RH: E.ctlPPO(RH) };
  const lab1 = {};
  for (const fk of FL) { lab1[fk] = {}; for (const [k, c] of Object.entries(pol)) { const t = E.trips(c, F[fk].mu, 20); lab1[fk][k] = { ok: E.okShare(t), time: E.meanTime(t) }; } }
  const curve = (d) => d.hist.map((h) => h.ok);
  const lab2 = { DH: curve(DH), BH: curve(BH), DS: curve(DS) };
  const an = (M, floor) => {
    const e = E.ride(E.ctlRMA(T, M), floor, E.TEST_SEED, null, M); let ch = -1; for (let t = 1; t < e.T; t++) if (e.mus[t] !== e.mus[t - 1]) { ch = t; break; }
    let det = -1; for (let t = ch; t < e.T; t++) if (Math.abs(e.est[t] - e.mus[t]) < 0.1) { det = t; break; }
    const a = e.est.slice(ch, Math.min(e.T, ch + 10));
    return { lag: det >= 0 ? det - ch : null, max1s: Math.max(...a), mean1s: a.reduce((x, y) => x + y, 0) / a.length, outcome: e.outcome };
  };
  const all1 = (M) => { const e = E.ride(E.ctlRMA(T, M), 1, E.TEST_SEED, null, M), a = e.est.slice(10); return a.reduce((x, y) => x + y, 0) / a.length; };
  const lab3 = {};
  for (const k of [20, 5]) { const M = run(E.trainModule(T, k, { seed })).M; lab3[k] = { wet: an(M, [1, 1, 0.45]), back: an(M, [0.45, 0.45, 1]), carpet: all1(M) }; }
  return { seed, lab1, lab2, lab3 };
}
if (process.argv[2] === '--seed-worker') { process.stdout.write(JSON.stringify(seedWorker(+process.argv[3]))); process.exit(0); }
if (process.argv.includes('--seeds')) {
  const { execFile } = require('child_process');
  let bad = 0; const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
  Promise.all(SEEDS.map((s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed-worker', String(s)], { maxBuffer: 1 << 24 }, (e, out) => (e ? rej(e) : res(JSON.parse(out))))))).then((rs) => {
    const R = Object.fromEntries(rs.map((r) => [r.seed, r])), all = (f) => SEEDS.every((s) => f(R[s])), mm = (f) => { const v = SEEDS.map((s) => f(R[s])); return [Math.min(...v), Math.max(...v)]; };
    const p = (v) => Math.round(v * 100), t2 = (v) => (v == null ? '—' : v.toFixed(2));
    for (const s of SEEDS) { const r = R[s], L = r.lab1; console.log(`зерно ${s}: учитель ${['carpet', 'tile', 'wet', 'wetKitchen'].map((f) => p(L[f].T.ok) + '%/' + t2(L[f].T.time)).join(' ')} | без истории ${['carpet', 'tile', 'wet', 'wetKitchen'].map((f) => p(L[f].S.ok) + '%/' + t2(L[f].S.time)).join(' ')} | с историей ${['carpet', 'tile', 'wet', 'wetKitchen'].map((f) => p(L[f].H.ok) + '%/' + t2(L[f].H.time)).join(' ')} | RL без μ ковёр ${t2(L.carpet.RS.time)}, RL с историей ${t2(L.carpet.RH.time)} | BC ${p(r.lab2.BH[5])}%, DAgger ${p(r.lab2.DH[5])}%, DAgger без истории ${p(r.lab2.DS[5])}% | модуль 2 с: мокрая кухня ${r.lab3[20].wet.lag} шагов, ковёр за 1 с ${r.lab3[20].back.max1s.toFixed(2)}; 0,5 с: ${r.lab3[5].wet.lag} шагов, ${r.lab3[5].back.max1s.toFixed(2)}`); }
    const FLs = ['carpet', 'tile', 'wet', 'wetKitchen'], good = SEEDS.filter((s) => FLs.every((f) => R[s].lab1[f].T.ok >= 0.95));
    check(good.length >= 7, `учитель доезжает хотя бы в 95% поездок на всех полах на ${good.length} зёрнах из 8 (не на: ${SEEDS.filter((s) => !good.includes(s)).join(', ') || '—'})`);
    check(all((r) => r.lab1.wet.S.ok <= 0.2), 'миссия 2: ученик без истории на мокром полу ≤ 20%: ' + JSON.stringify(mm((r) => r.lab1.wet.S.ok)));
    check(all((r) => r.lab1.wet.H.ok >= 0.9), 'миссия 2: ученик с историей на мокром полу ≥ 90%: ' + JSON.stringify(mm((r) => r.lab1.wet.H.ok)));
    check(all((r) => FLs.slice(0, 1).every((f) => r.lab1[f].T.ok >= 0.95 && r.lab1[f].S.ok >= 0.95 && r.lab1[f].H.ok >= 0.95) && r.lab1.carpet.S.time > r.lab1.carpet.T.time), 'миссия 1: на ковре доезжают все трое, ученик без истории медленнее учителя на ' + JSON.stringify(mm((r) => +(r.lab1.carpet.S.time - r.lab1.carpet.T.time).toFixed(2))) + ' с');
    const lose = (x, t) => x.time == null || x.time >= t.time + 0.4 || false;
    check(all((r) => (lose(r.lab1.carpet.RS, r.lab1.carpet.T) || r.lab1.wet.RS.ok < 0.9) && (lose(r.lab1.carpet.RH, r.lab1.carpet.T) || r.lab1.wet.RH.ok < 0.9)), 'миссия 3: RL без учителя (обе) уступает учителю — медленнее на ковре хотя бы на 0,4 с или врезается на мокром полу');
    check(all((r) => Math.abs(r.lab1.carpet.H.time - r.lab1.carpet.T.time) <= 0.15), 'миссия 3: ученик с историей на ковре в пределах 0,15 с от учителя: ' + JSON.stringify(mm((r) => +(r.lab1.carpet.H.time - r.lab1.carpet.T.time).toFixed(2))));
    check(all((r) => r.lab2.DH[5] >= r.lab2.BH[5]), 'лаборатория 2: DAgger не хуже BC после 6 итераций на всех зёрнах');
    check(SEEDS.filter((s) => R[s].lab2.DH[5] >= 0.9 && R[s].lab2.BH[5] < R[s].lab2.DH[5]).length >= 6 && good.every((s) => R[s].lab2.DH[5] >= 0.9), 'миссия 1 лаборатории 2 (DAgger ≥ 90%, BC реже) — на ' + SEEDS.filter((s) => R[s].lab2.DH[5] >= 0.9 && R[s].lab2.BH[5] < R[s].lab2.DH[5]).length + ' зёрнах из 8; DAgger ≥ 90% на всех зёрнах, где учитель обучился');
    check(all((r) => r.lab2.DS[5] <= 0.7), 'миссия 3 лаборатории 2: DAgger без истории ≤ 70%: ' + JSON.stringify(mm((r) => r.lab2.DS[5])));
    check(all((r) => r.lab3[20].wet.lag != null && r.lab3[20].wet.lag < 10), 'миссия 1 лаборатории 3: модуль 2 с замечает мокрую кухню меньше чем за 1 с: ' + JSON.stringify(mm((r) => r.lab3[20].wet.lag)));
    check(all((r) => r.lab3[20].back.mean1s < 0.9), 'миссия 2 лаборатории 3: в первую секунду на ковре после мокрого пола оценка в среднем ниже 0,9: ' + JSON.stringify(mm((r) => +r.lab3[20].back.mean1s.toFixed(2))));
    check(all((r) => r.lab3[20].carpet >= 0.8 && r.lab3[20].carpet < 0.95), 'миссия 3 лаборатории 3: на ковре всюду оценка в среднем от 0,8 до 0,95: ' + JSON.stringify(mm((r) => +r.lab3[20].carpet.toFixed(2))));
    check(all((r) => r.lab3[5].wet.lag != null && r.lab3[5].wet.lag < 10), 'свободный режим: модуль 0,5 с замечает мокрую кухню меньше чем за 1 с: ' + JSON.stringify(mm((r) => r.lab3[5].wet.lag)) + '; ковёр после мокрого за 1 с до ' + JSON.stringify(mm((r) => +r.lab3[5].back.max1s.toFixed(2))));
    console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
  return;
}

const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-5-privilegirovannyy-uchitel.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2212\u2014]/g, '-');
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
/** Перетащить метку прогноза m ('bc' | 'dagger') на графике лаборатории 2 к значению v (0…1) настоящими событиями указателя. */
const dragFc = (p, m, v) => p.eval(`(() => {
  const cv = document.getElementById('fCv'), r = cv.getBoundingClientRect(), W = 640, H = r.width < 500 ? 380 : 300, k = W / r.width, ky = Math.max(1, k * 0.8);
  const L = 40 * ky, R = 92, T = 30 * ky, B = 34 + 14 * ky, gh = H - T - B, fx = W - R + (${JSON.stringify(m)} === 'bc' ? 30 : 64), y0 = T + gh * 0.5, y1 = T + gh * (1 - ${v});
  const ev = (type, y) => cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + fx / W * r.width, clientY: r.top + y / H * r.height, pointerId: 1, bubbles: true, pointerType: 'mouse', isPrimary: true }));
  ev('pointerdown', y0); ev('pointermove', y1); ev('pointerup', y1); return window.__l55.Fore.st.fc[${JSON.stringify(m)}];
})()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.4: три вопроса');
    const bridge = await text(p, '#finale .bridge');
    check(/5\.6/.test(bridge) && /Offline RL/.test(bridge) && /симулятор/.test(bridge), 'в итогах — абзац-мост в 5.6');
    await p.eval("window.__l55.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['stages', 'teacher', 1.2, 6.3], ['rma', 'rma', 2.0, 7.4]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await p.shotEl(out(`l55-${id}.png`), `#${sec} .flow-card`, 6);
    }

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapTFloor')) && !(await visible(p, '#wrapTGo')) && !(await visible(p, '#wrapTTrip')), 'миссия 1: выбор пола, поездки и кнопка свободного режима скрыты');
    await p.eval(`document.getElementById('trio').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l55-trio-empty.png'), '#trio .lab', 6);
    let r = await viaUI(p, '#tMis', 2);
    const t1 = r.out.match(/Учитель - в среднем за ([\d,]+) с, ученик с историей - за ([\d,]+) с, ученик без истории - за ([\d,]+) с\. .*?учитель держит (\d+) см\/с, ученик с историей - (\d+), а ученик без истории сбрасывает скорость до (\d+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && t1 && t1[1] === '5,0' && t1[2] === '4,9' && t1[3] === '5,4' && t1[4] === '111' && t1[5] === '114' && t1[6] === '61', `миссия 1 (ковёр): учитель ${t1 && t1[1]} с, с историей ${t1 && t1[2]} с, без истории ${t1 && t1[3]} с; у поворота ${t1 && t1.slice(4, 7).join('/')} см/с`);
    await sleep(600); await p.shotEl(out('l55-trio-carpet.png'), '#trio .lab', 6);
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTTrip'), 'миссия 2: ползунок поездки виден');
    r = await viaUI(p, '#tMis', 1);
    const t2 = r.out.match(/Учитель доезжает в (\d+)% поездок, в среднем за ([\d,]+) с; ученик с историей - в (\d+)%, за ([\d,]+) с; ученик без истории - в (\d+)%\. .*?до (\d+) см\/с, ученик с историей - до (\d+)\. .*?ещё (\d+) см\/с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && t2 && t2[1] === '100' && t2[2] === '6,5' && t2[3] === '100' && t2[4] === '6,4' && t2[5] === '0' && t2[6] === '46' && t2[7] === '41' && t2[8] === '94', `миссия 2 (мокрый пол): учитель ${t2 && t2[1]}%, с историей ${t2 && t2[3]}%, без истории ${t2 && t2[5]}%; у поворота ${t2 && t2.slice(6, 9).join('/')} см/с`);
    await sleep(600); await p.shotEl(out('l55-trio-wet.png'), '#trio .lab', 6);
    await nextMission(p, '#tMis');
    r = await viaUI(p, '#tMis', 1);
    const t3 = r.out.match(/На ковре политика без μ тратит ([\d,]+) с, политика с историей - ([\d,]+) с, учитель - ([\d,]+) с, ученик с историей - ([\d,]+) с\. На мокром полу: ([\d,]+) с, ([\d,]+) с, ([\d,]+) с и ([\d,]+) с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && t3 && t3.slice(1, 9).join(' ') === '6,3 6,1 5,0 4,9 7,4 6,7 6,5 6,4', 'миссия 3 (без учителя): ' + (t3 ? t3.slice(1, 9).join(' ') : r.out.slice(0, 120)));
    await sleep(600); await p.shotEl(out('l55-trio-rl.png'), '#trio .lab', 6);
    const table = await text(p, '#tTable');
    check((await p.eval(`document.querySelectorAll('#tTable tbody tr').length`)) === 4 && /RL без μ/.test(table), 'таблица итогов: 4 пола, 5 политик');
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTFloor') && await visible(p, '#wrapTGo'), 'свободный режим: выбор пола и кнопка видны');
    await p.eval(`document.querySelector('#tFloor button[data-v="tile"]').click(); true`); await sleep(400);
    check(/^Плитка, поездка 1: /.test(await text(p, '#tOut')), 'свободный режим: плитка — ' + (await text(p, '#tOut')).slice(0, 90));
    const trioAfter = await text(p, '#trioAfter'), trioDeep = await text(p, '#trioSeeds');
    check(/консервативное/.test(trioAfter), 'вывод после лаборатории 1 ссылается на RMA');
    check(['зёрнах 1–8', '0,05–0,82 с', '90–100%', '6,35–6,95 с', '4,97–5,13 с'].every((x) => trioDeep.includes(x)), '«Под капотом» лаборатории 1: разброс по восьми зёрнам совпадает с INTEGRATION.md');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapFWho')) && !(await visible(p, '#wrapFFree')), 'миссия 1: карта по итерациям и выбор учеников скрыты');
    await p.eval(`document.getElementById('forecast').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    r = await viaUI(p, '#fMis');
    check(!r.ok && /Сначала перетащи обе метки/.test(r.out), 'без прогноза кнопка не обучает, а просит перетащить метки');
    const fb = await dragFc(p, 'bc', 0.7), fd = await dragFc(p, 'dagger', 0.6);
    check(Math.abs(fb - 0.7) < 0.03 && Math.abs(fd - 0.6) < 0.03, `метки прогноза перетаскиваются: BC ${fb}, DAgger ${fd}`);
    await p.shotEl(out('l55-forecast-bet.png'), '#forecast .lab', 6);
    r = await viaUI(p, '#fMis');
    const f1 = r.out.match(/Твой прогноз: BC - (\d+)%, DAgger - (\d+)%\. Вышло: BC - (\d+)%, DAgger - (\d+)%.*?- по (\d+)%/);
    check(r.ok && f1 && f1[1] === '70' && f1[2] === '60' && f1[3] === '48' && f1[4] === '100' && f1[5] === '28', `миссия 1: прогноз ${f1 && f1[1]}/${f1 && f1[2]}, вышло BC ${f1 && f1[3]}%, DAgger ${f1 && f1[4]}%, после первой итерации ${f1 && f1[5]}%`);
    await p.shotEl(out('l55-forecast.png'), '#forecast .lab', 6);
    await nextMission(p, '#fMis');
    check(await visible(p, '#wrapFWho') && await visible(p, '#wrapFIt'), 'миссия 2: карта и ползунок итерации видны');
    await p.eval(`document.querySelector('#fWho button[data-v="dagger"]').click(); const e = document.getElementById('fIt'); e.value = 2; e.dispatchEvent(new Event('input', { bubbles: true })); true`);
    r = await liveDone(p, '#fMis', 10000);
    const f2 = r.out.match(/На итерации (\d) ученик врезался в (\d) поездках из 8\..*?доезжал в (\d+)% .*?после неё - в (\d+)%\. У BC после той же итерации - (\d+)%/);
    check(r.ok && f2 && f2[1] === '2' && f2[2] === '5' && f2[3] === '28' && f2[4] === '80' && f2[5] === '43', `миссия 2 засчитана сама: итерация ${f2 && f2[1]}, ${f2 && f2[2]} столкновений, ${f2 && f2[3]}% → ${f2 && f2[4]}%, BC ${f2 && f2[5]}%`);
    await p.shotEl(out('l55-forecast-map.png'), '#forecast .lab', 6);
    await nextMission(p, '#fMis');
    r = await viaUI(p, '#fMis', 1);
    const f3 = r.out.match(/без истории после 6 итераций доезжает в (\d+)% .*?BC без истории - в (\d+)%; с историей DAgger доезжал в (\d+)%/);
    check(r.ok && /ставка сыграла/i.test(r.out) && f3 && f3[1] === '50' && f3[3] === '100', `миссия 3: DAgger без истории ${f3 && f3[1]}%, BC без истории ${f3 && f3[2]}%, с историей ${f3 && f3[3]}%`);
    await nextMission(p, '#fMis');
    check(await visible(p, '#wrapFFree'), 'свободный режим: выбор учеников виден');
    const foreDeep = await text(p, '#forecastSeeds');
    check(['95–100%', 'от 35 до 100%', 'на 25–52 пункта', 'от 48 до 60%'].every((x) => foreDeep.includes(x)), '«Под капотом» лаборатории 2: разброс по восьми зёрнам');

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapAK')) && !(await visible(p, '#wrapAGo')), 'миссии 1–3: длина истории и кнопка свободного режима скрыты');
    await p.eval(`document.getElementById('adapt').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l55-adapt-empty.png'), '#adapt .lab', 6);
    r = await viaUI(p, '#aMis', 1);
    const a1 = r.out.match(/Ада въехала на кухню на ([\d,]+) с\. До этого модуль оценивал сцепление в ([\d,]+), а через (\d) шага \(([\d,]+) с\) - уже в ([\d,]+) при настоящем ([\d,]+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a1 && a1[1] === '3,3' && a1[2] === '0,89' && a1[3] === '2' && a1[4] === '0,2' && a1[5] === '0,47' && a1[6] === '0,45', 'миссия 1 (мокрая кухня): ' + (a1 ? a1.slice(1).join(' ') : r.out.slice(0, 140)));
    await p.shotEl(out('l55-adapt-wet.png'), '#adapt .lab', 6);
    await nextMission(p, '#aMis');
    r = await viaUI(p, '#aMis', 1);
    const a2 = r.out.match(/оценивает сцепление в среднем в (\d+,\d+), не выше (\d+,\d+), при настоящем (\d+,\d+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a2 && a2[1] === '0,51' && a2[2] === '0,55' && a2[3] === '1,00' && /не попадает до самой цели/.test(r.out), `миссия 2 (снова ковёр): в среднем ${a2 && a2[1]}, не выше ${a2 && a2[2]}`);
    await p.shotEl(out('l55-adapt-back.png'), '#adapt .lab', 6);
    await nextMission(p, '#aMis');
    r = await viaUI(p, '#aMis', 1);
    const a3 = r.out.match(/оценивает сцепление в среднем в ([\d,]+), а не в 1\..*?доезжает в (\d+)% проверочных поездок по ковру, в среднем за ([\d,]+) с, а учитель с настоящим μ - в (\d+)%, за ([\d,]+) с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a3 && +a3[1].replace(',', '.') >= 0.8 && +a3[1].replace(',', '.') < 0.95 && a3[2] === '100' && a3[4] === '100' && a3[5] === '5,0', `миссия 3 (весь ковёр): оценка ${a3 && a3[1]}, Ада ${a3 && a3[2]}% за ${a3 && a3[3]} с, учитель ${a3 && a3[4]}% за ${a3 && a3[5]} с`);
    await p.shotEl(out('l55-adapt-carpet.png'), '#adapt .lab', 6);
    await nextMission(p, '#aMis');
    check(await visible(p, '#wrapAGo') && await visible(p, '#wrapAK'), 'свободный режим: длина истории и кнопка «Поехать» видны');
    const fl0 = await p.eval(`JSON.stringify(window.__l55.Adapt.st.floor)`);
    await p.eval(`(() => { const cv = document.getElementById('aCv'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true })); return true; })()`);
    const fl1 = await p.eval(`JSON.stringify(window.__l55.Adapt.st.floor)`);
    check(fl0 !== fl1, `свободный режим: нажатие на гостиную меняет её пол (${fl0} → ${fl1})`);
    const adaptAfter = await text(p, '#adaptAfter'), adaptDeep = await text(p, '#adaptSeeds');
    check(/2 секунды/.test(adaptAfter) && ['1–9 шагов', '0,85–0,91', '0,46–0,49', 'от 0,47 до 0,85'].every((x) => adaptDeep.includes(x)), 'вывод и «Под капотом» лаборатории 3: разброс по восьми зёрнам');

    // ---------- тексты совпадают с расчётом ----------
    const tk = await text(p, '#takeaways');
    check(tk.includes('не доехал ни разу') && tk.includes('100% проверочных поездок, BC - в 48%') && tk.includes('6,3 с против 5,0 с'), 'итоги урока называют числа лабораторий');
    const lead = await text(p, '.hero .lead');
    check(lead.includes('31 минуту'), 'шапка: Этцель за 31 минуту');

    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 15 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
    for (const [id, sel, n] of [['trio', '#trio .lab', 'l55-trio-dark.png'], ['forecast', '#forecast .lab', 'l55-forecast-dark.png'], ['adapt', '#adapt .lab', 'l55-adapt-dark.png'], ['teacher', '#teacher .flow-card', 'l55-stages-dark.png'], ['rma', '#rma .flow-card', 'l55-rma-dark.png']]) {
      await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
    }
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval("window.__l55.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");
    await m.eval(`(async () => { const W = window.__l55; await W.Trio.api.wet(); W.Fore.api.setFc('bc', 0.7); W.Fore.api.setFc('dagger', 0.6); await W.Fore.api.run(); await W.Adapt.api.wetKitchen(); return true; })()`, true);
    await sleep(800);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['teacher', '#teacher .flow-card', 'l55-m-stages.png'], ['trio', '#trio .lab', 'l55-m-trio.png'], ['forecast', '#forecast .lab', 'l55-m-forecast.png'], ['rma', '#rma .flow-card', 'l55-m-rma.png'], ['adapt', '#adapt .lab', 'l55-m-adapt.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
