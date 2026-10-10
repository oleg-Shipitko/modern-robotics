// Урок 5.2 «Policy gradient и PPO»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l52-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-31 python3 lessons/build.py l52.
// node tools/lesson52.js          — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема);
// node tools/lesson52.js --seeds  — проверка в Node: выводы лабораторий на зёрнах 1–10 и диапазоны из «Под капотом».
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };

/* ---------- режим --seeds: десять зёрен в Node ---------- */
if (process.argv.includes('--seeds')) {
  const E = require('../lessons/l52/engine.js');
  const html = sp(fs.readFileSync(path.resolve(__dirname, '../lessons/l52/lesson.html'), 'utf8')).replace(/<[^>]+>/g, '');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], V = { ppo: { clip: 0.2 }, noclip: { clip: 0 }, small: { clip: 0, LR: 3e-4 }, lam0: { clip: 0.2, LAMBDA: 0 }, lr01: { clip: 0.2, LR: 0.01 } };
  const R = {};
  for (const seed of seeds) {
    const row = {};
    for (const [k, o] of Object.entries(V)) row[k] = E.summary(E.run(Object.assign({ seed }, o)).hist);
    const sn = E.snapshot(10, { seed }), a = E.ratioTest(sn, 0.2, { seed }), b = E.ratioTest(sn, 0, { seed });
    const outF = (res) => res.ratios.filter((q) => Math.abs(q - 1) > 0.2).length / res.N;
    row.ratio = { ppoOut: outF(a), ncOut: outF(b), ppoKl: a.kl, ncKl: b.kl, ppoMax: a.max, ncMax: b.max };
    R[seed] = row;
    console.log(`зерно ${seed}: PPO ${Math.round(row.ppo.last10 * 100)}%, без обрезки ${Math.round(row.noclip.last10 * 100)}% (${row.noclip.okAll} из 400), малый шаг ${Math.round(row.small.last10 * 100)}%, λ = 0 ${Math.round(row.lam0.last10 * 100)}%, шаг 0,01 ${Math.round(row.lr01.last10 * 100)}%; r за [0,8; 1,2]: ${Math.round(row.ratio.ppoOut * 100)}% против ${Math.round(row.ratio.ncOut * 100)}%`);
  }
  const all = (f) => seeds.every((s) => f(R[s])), mm = (f) => { const v = seeds.map((s) => f(R[s])); return [Math.min(...v), Math.max(...v)]; };
  const pc = (v) => Math.round(v * 100);
  const [p0, p1] = mm((r) => r.ppo.last10), [s0, s1] = mm((r) => r.small.last10), [l0, l1] = mm((r) => r.lam0.last10), [q0, q1] = mm((r) => r.lr01.last10);
  check(all((r) => r.ppo.last10 >= 0.75), `PPO на всех зёрнах доезжает хотя бы в 75% поездок последних 10 обновлений: от ${pc(p0)} до ${pc(p1)}%`);
  check(html.includes(`PPO — от ${pc(p0)} до ${pc(p1)}%`), `текст «Под капотом» лаборатории 1: PPO от ${pc(p0)} до ${pc(p1)}%`);
  check(all((r) => r.noclip.last10 < 0.1) && seeds.filter((s) => R[s].noclip.last10 === 0).length === 9, 'без обрезки: 0% на девяти зёрнах, меньше 10% на всех');
  const [n0, n1] = mm((r) => r.noclip.okAll);
  check(html.includes(`от ${n0} до ${n1} поездок до кухни из 400`), `текст: без обрезки за всё обучение от ${n0} до ${n1} поездок`);
  check(all((r) => r.small.last10 <= r.ppo.last10 - 0.3 && r.small.last10 > r.noclip.last10), `малый шаг на каждом зерне выше «без обрезки» и хотя бы на 30 пунктов ниже PPO: от ${pc(s0)} до ${pc(s1)}%`);
  check(html.includes(`от ${pc(s0)} до ${pc(s1)}%, на каждом зерне хотя бы на 30 пунктов ниже PPO`), 'текст: диапазон малого шага');
  check(all((r) => r.lam0.last10 < r.ppo.last10) && html.includes(`— от ${pc(l0)} до ${pc(l1)}%, и на каждом зерне хуже`), `λ = 0 хуже λ = 0,95 на каждом зерне: от ${pc(l0)} до ${pc(l1)}%`);
  check(html.includes(`с шагом 0,01 — от ${pc(q0)} до ${pc(q1)}%`) && html.includes(`гуляет от ${pc(q0)} до ${pc(q1)}%`), `текст: шаг 0,01 — от ${pc(q0)} до ${pc(q1)}%`);
  const f2 = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
  const [k0, k1] = mm((r) => r.ppo.klMed), [x0, x1] = mm((r) => r.noclip.klMax), [y0, y1] = mm((r) => r.ppo.klMax);
  check(k0 >= 0.0075 && k1 <= 0.0115 && html.includes('PPO — от 0,0077 до 0,011'), `медиана KL PPO от ${f2(k0)} до ${f2(k1)}`);
  check(x0 >= 1.25 && x1 < 4.85 && y0 >= 0.029 && y1 < 0.11 && html.includes('у PPO — от 0,03 до 0,11, без обрезки — от 1,3 до 4,8'), `наибольшее KL: PPO ${f2(y0)}–${f2(y1)}, без обрезки ${f2(x0)}–${f2(x1)}`);
  const [a0, a1] = mm((r) => r.ratio.ppoOut), [b0, b1] = mm((r) => r.ratio.ncOut);
  check(all((r) => r.ratio.ncOut > r.ratio.ppoOut) && html.includes(`вышли от ${pc(a0)} до ${pc(a1)}% решений`) && html.includes(`без обрезки — от ${pc(b0)} до ${pc(b1)}% решений`), `лаборатория 2: с обрезкой ${pc(a0)}–${pc(a1)}%, без — ${pc(b0)}–${pc(b1)}%, на каждом зерне без обрезки больше`);
  finish();
}

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-2-ppo.html');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 4800 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
/** Живая миссия: состояние критериев и разбор. */
const live = (p, mis) => p.eval(`(() => { const root = document.querySelector('${mis}'); const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className); return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' }); })()`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^11 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.1: три вопроса');
    const bridge = await text(p, '#finale .bridge');
    check(/5\.3/.test(bridge) && /off-policy/i.test(bridge) && (await p.eval(`!!document.querySelector('#finale .bridge a[href="5-3-sac.html"]')`)), 'в итогах — мост в урок 5.3 со ссылкой (5.3 выходит в тот же день)');
    check((await p.eval(`L52.CFG.SEED`)) === 5 && (await p.eval(`L52.CFG.ITERS`)) === 50, 'зерно 5, 50 обновлений');

    // ---------- схемы ----------
    for (const [id, a, b, sec] of [['pg', 1.0, 6.0, 'baseline'], ['loop', 1.0, 4.6, 'trust']]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await show(p, sec, `#${sec} .flow-card`, `l52-${id}.png`);
    }

    // ---------- интерактив: поездка по шагам ----------
    console.log('поездка по шагам');
    await p.waitFor('!!window.__l52.Trace.st.q', 60000);
    const tq = J(await p.eval(`(() => { const q = window.__l52.Trace.st.q, l = q.traj[q.T]; return JSON.stringify({ T: q.T, outcome: q.outcome, x: l.x, y: l.y, gpos: q.G.filter((g) => g > 0).length, k: L52.TRACE.k, ep: L52.TRACE.ep, i1: q.G.findIndex((g, t) => g > 0 && q.adv[0.95][t] < 0), i2: q.adv[0].findIndex((a, t) => t >= q.T - 10 && a > 0) }); })()`));
    const bi = await text(p, '#baseline .lab-intro'), bd = await text(p, '#baseline .deep');
    check(tq.outcome === 'crash' && tq.x > 370 && tq.x < 400 && tq.y > 70 && tq.y < 150 && bi.includes('врезалась в край проёма на кухню'), `поездка кончилась столкновением у проёма на кухню (${Math.round(tq.x)}, ${Math.round(tq.y)}), как в тексте`);
    check(tq.k === 10 && tq.ep === 6 && bd.includes('седьмая из восьми') && bd.includes('перед 11-м обновлением'), '«Под капотом»: седьмая поездка пачки перед 11-м обновлением');
    check(tq.gpos === 49 && tq.T === 68 && (await text(p, '#pg')).includes('отдача положительна на 49 шагах из 68'), `отдача положительна на ${tq.gpos} шагах из ${tq.T} (в разделе о градиенте и в квизе — 49 из 68)`);
    check(!(await visible(p, '#wrapELam')) && (await visible(p, '#wrapEWeight')), 'миссия 1: окраска пути видна, λ скрыт');
    await setRange(p, '#eT', tq.i1 + 1); await sleep(150);
    let r = await live(p, '#eMis');
    check(r.ok && /отдача \+/.test(r.out) && /преимущество −/.test(r.out), `миссия 1: шаг ${tq.i1 + 1} — отдача положительная, преимущество отрицательное`);
    await show(p, 'baseline', '#baseline .lab', 'l52-trace.png');
    await nextMission(p, '#eMis');
    await seg(p, '#eLam', '0'); await setRange(p, '#eT', tq.i2 + 1); await sleep(150);
    r = await live(p, '#eMis');
    check(r.ok && /при λ = 0 преимущество \+/.test(r.out) && r.out.includes('0–57%'), `миссия 2: шаг ${tq.i2 + 1} — при λ = 0 лучше обычного; разбор — ${r.out.slice(0, 60)}…`);
    await nextMission(p, '#eMis');
    check(await visible(p, '#wrapELam'), 'свободный режим поездки: λ виден');

    // ---------- лаборатория 1: две Ады ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapPView')) && !(await visible(p, '#wrapPOpts')) && !(await visible(p, '#wrapPTrain')), 'миссия 1: переключатель графика и настройки скрыты');
    const t0 = Date.now();
    r = await viaUI(p, '#pMis', 2);
    const secs = (Date.now() - t0) / 1000;
    const c1 = J(await p.eval(`(() => { const C = window.__l52.Corr, K = C.KEY, a = C.st.runs[K.noclip].sum, b = C.st.runs[K.ppo].sum; return JSON.stringify({ nc: a, ppo: b, ncK: KLD(a.klMed), ppoK: KLD(b.klMed), ncMax: KLD(a.klMax), ppoHist: C.st.runs[K.ppo].hist.map((h) => [h.ok, h.steps]) }); })()`));
    check(r.ok && /ставка сыграла/i.test(r.out), `миссия 1 засчитана, ставка «только PPO» сыграла (обучение ${secs.toFixed(1)} с)`);
    check(c1.nc.okAll === 0 && c1.nc.last10 === 0 && c1.ppo.okAll === 295 && Math.round(c1.ppo.last10 * 100) === 99, `без обрезки ${c1.nc.okAll} из 400 и ${Math.round(c1.nc.last10 * 100)}%, PPO ${c1.ppo.okAll} из 400 и ${Math.round(c1.ppo.last10 * 100)}%`);
    check(r.out.includes(`${c1.ppo.okAll} поездках из 400`) && r.out.includes(`обновлению ${c1.ppo.reach}`) && r.out.includes(`${c1.ncK} без обрезки и ${c1.ppoK} у PPO`), 'разбор миссии 1 называет те же числа: ' + `${c1.ncK} и ${c1.ppoK}, выход на 75% к обновлению ${c1.ppo.reach}`);
    const LA = J(await p.eval(`JSON.stringify(window.__l52.LOOP_ANIM)`));
    check(LA.it.every((it, j) => c1.ppoHist[it - 1][0] === LA.ok[j] && c1.ppoHist[it - 1][1] === LA.steps[j]), `числа схемы цикла PPO совпадают с обучением: ${LA.ok.join(', ')} из 8, ${LA.steps.join(', ')} шагов`);
    await show(p, 'corridor', '#corridor .lab', 'l52-corridor.png');
    await nextMission(p, '#pMis');
    r = await viaUI(p, '#pMis', 1);
    const c2 = J(await p.eval(`(() => { const C = window.__l52.Corr, s = C.st.runs[C.KEY.small].sum; return JSON.stringify({ s, k: KLD(s.klMed) }); })()`));
    check(r.ok && /ставка сыграла/i.test(r.out) && Math.round(c2.s.last10 * 100) === 48 && c2.k === '0,0025' && r.out.includes('примерно в 4 раза меньше'), `миссия 2: малый шаг — ${Math.round(c2.s.last10 * 100)}%, медиана KL ${c2.k}`);
    const after = await text(p, '#corridorAfter'), fin = await text(p, '#finale');
    check(after.includes('ни одной поездки до кухни из 400') && after.includes(`медиана KL за обновление — ${c1.ncK} против ${c1.ppoK}`) && after.includes(`самый большой скачок — ${c1.ncMax}`) && after.includes(`${c1.ppo.okAll} поездок до кухни из 400`) && after.includes('десяти обновлениях — 99%'), 'вывод после лаборатории 1 совпадает с обучением');
    check(after.includes(`медиана KL за обновление у него ${c2.k}`) && after.includes('почти вчетверо меньше') && after.includes('лишь в 48% поездок'), 'вывод про малый шаг совпадает с обучением');
    check(fin.includes(`${c1.ncK} против ${c1.ppoK}`) && fin.includes('PPO — 99% в последних 10 обновлениях') && fin.includes('48% против 99%'), 'итоги урока называют числа лаборатории 1');
    await nextMission(p, '#pMis');
    check(await visible(p, '#wrapPView'), 'миссия 3: переключатель графика виден');
    await seg(p, '#pView', 'kl'); await setRange(p, '#pIter', c1.nc.klMaxIt + 1); await sleep(200);
    r = await live(p, '#pMis');
    check(r.ok && r.out.includes(`KL = ${c1.ncMax}`) && /кончились в прихожей/.test(r.out), `миссия 3: обновление ${c1.nc.klMaxIt + 1} — KL ${c1.ncMax}; ${r.out.slice(0, 70)}…`);
    await show(p, 'corridor', '#corridor .lab', 'l52-corridor-kl.png');
    await nextMission(p, '#pMis');
    check((await visible(p, '#wrapPOpts')) && (await visible(p, '#wrapPTrain')), 'свободный режим: настройки и кнопка видны');
    await seg(p, '#pLr', '0.01'); await p.click('#pTrain'); await sleep(200); await p.waitFor('!window.__l52.Corr.st.busy', 180000);
    const lr01 = await p.eval(`window.__l52.Corr.st.runs['0.2|0.01|5|0.95'].sum.last10`);
    check(lr01 === 0 && fin.includes('с шагом 0,01 вместо 0,003 в последних обновлениях не доезжает до кухни ни разу'), `свободный режим: PPO с шагом 0,01 — ${Math.round(lr01 * 100)}% (как в открытом вопросе)`);
    await seg(p, '#pLr', '0.003'); await seg(p, '#pLam', '0'); await p.click('#pTrain'); await sleep(200); await p.waitFor('!window.__l52.Corr.st.busy', 180000);
    const lam0 = await p.eval(`window.__l52.Corr.st.runs['0.2|0.003|5|0'].sum.last10`);
    check(lam0 < c1.ppo.last10 - 0.5, `свободный режим: PPO с λ = 0 — ${Math.round(lam0 * 100)}% против ${Math.round(c1.ppo.last10 * 100)}% при λ = 0,95`);

    // ---------- лаборатория 2: обрезка ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapKEps')) && !(await visible(p, '#wrapKSign')), 'миссия 1: ε и знак преимущества скрыты');
    await setRange(p, '#kR', 1.35); await sleep(100);
    r = await live(p, '#kMis');
    check(r.ok && r.out.includes('1 + ε = 1,2'), 'миссия 1: при r = 1,35 и A > 0 градиент примера равен нулю');
    await nextMission(p, '#kMis');
    r = await viaUI(p, '#kMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes('−1,6') && r.out.includes('−1,2'), 'миссия 2: при A < 0 и r = 1,6 градиент тянет вниз в полную силу');
    await nextMission(p, '#kMis');
    r = await viaUI(p, '#kMis', 2);
    const k3 = J(await p.eval(`(() => { const s = window.__l52.Clip.st.res, n = s.nc, q = s[0.2], o = (x) => x.ratios.filter((v) => Math.abs(v - 1) > 0.2).length / x.N; return JSON.stringify({ N: q.N, po: o(q), no: o(n), pmax: q.max, nmax: n.max, nmin: n.min }); })()`));
    const ca = await text(p, '#clipAfter'), ci = await text(p, '#clip .lab-intro');
    check(r.ok && /ставка сыграла/i.test(r.out) && Math.round(k3.no * 100) === 72 && Math.round(k3.po * 100) === 20, `миссия 3: без обрезки за [0,8; 1,2] ${Math.round(k3.no * 100)}%, с обрезкой ${Math.round(k3.po * 100)}%`);
    check(k3.N === 772 && ci.includes('772 решения руля') && ca.includes('72% решений') && ca.includes('С обрезкой таких 20%') && k3.nmax > 7.5 && k3.nmax < 8 && ca.includes('почти в 8 раз') && k3.nmin < 0.01 && ca.includes('больше чем в сто раз') && k3.pmax < 2 && ca.includes('не выросла даже вдвое'), `тексты лаборатории 2 совпадают: N ${k3.N}, r до ${k3.nmax.toFixed(2)} и от ${k3.nmin.toFixed(4)}, с обрезкой до ${k3.pmax.toFixed(2)}`);
    await show(p, 'clip', '#clip .lab', 'l52-clip.png');
    await nextMission(p, '#kMis');
    check(await visible(p, '#wrapKEps'), 'свободный режим: ε виден');
    await setRange(p, '#kEps', 0.1); await sleep(400);
    check(await p.eval(`!!window.__l52.Clip.st.res[0.1]`), 'свободный режим: гистограмма пересчитана для ε = 0,1');

    // ---------- лаборатория 3: шаги ----------
    console.log('лаборатория 3');
    check(/Сначала сделай ставку/.test(await text(p, '#sOut')), 'до ставки калькулятор ответ не показывает');
    r = await viaUI(p, '#sMis', 2);
    const st3 = J(await p.eval(`JSON.stringify(window.__l52.Steps.api.state())`));
    check(r.ok && /ставка сыграла/i.test(r.out) && st3.total === 147456000 && r.out.includes('147 456 000') && r.out.includes('34,1 суток') && r.out.includes('лишь 12 минут') && r.out.includes('2400 раз'), `миссия 1: ${st3.total} шагов, ${st3.days.toFixed(1)} суток`);
    const sa = await text(p, '#stepsAfter');
    check(sa.includes('всего 12 минут') && sa.includes('147 миллионов шагов') && Math.round(st3.perRobotSec / 60) === 12, 'вывод после калькулятора совпадает с расчётом');
    await nextMission(p, '#sMis');
    await setRange(p, '#sRobots', 7); await setRange(p, '#sSteps', 0); await sleep(100);
    r = await live(p, '#sMis');
    check(r.ok && r.out.includes('16 384 × 6 = 98 304') && /0,12 с/.test(r.out), 'миссия 2: 16 384 робота по 6 шагов — та же пачка, отрезок 0,12 с');
    check(/меньше 25 \(0,5 с\)/.test(await text(p, '#sWarn')), 'калькулятор предупреждает о коротком отрезке');
    await nextMission(p, '#sMis');
    await setRange(p, '#sRobots', 1); await setRange(p, '#sSteps', 6); await sleep(100);
    r = await live(p, '#sMis');
    check(r.ok && r.out.includes('128 × 768 = 98 304'), 'миссия 3: 128 роботов по 768 шагов');
    await show(p, 'steps', '#steps .lab', 'l52-steps.png');
    await nextMission(p, '#sMis');

    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const quiz = sp(await p.eval(`document.getElementById('quizBox').textContent`));
    check(quiz.includes('48% поездок до кухни против 99% у PPO') && quiz.includes('около 0,0025, у PPO — около 0,0095') && quiz.includes('20% решений руля, а без обрезки — 72%') && quiz.includes('на 49 шагах из 68'), 'квиз называет числа лабораторий');
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.formula .katex').length`)) >= 8 && (await p.eval(`document.querySelectorAll('.katex').length`)) >= 60, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
    for (const [id, sel, n] of [['baseline', '#baseline .lab', 'l52-trace-dark.png'], ['corridor', '#corridor .lab', 'l52-corridor-dark.png'], ['clip', '#clip .lab', 'l52-clip-dark.png'], ['steps', '#steps .lab', 'l52-steps-dark.png'], ['baseline', '#baseline .flow-card', 'l52-pg-dark.png'], ['trust', '#trust .flow-card', 'l52-loop-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`window.__l52.Corr.api.first().then(() => window.__l52.Clip.api.batch()).then(() => window.__l52.Steps.api.paper()).then(() => window.__l52.Trace.api.ready()).then(() => true)`, true);
    await sleep(300);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    for (const [id, sel, n] of [['baseline', '#baseline .flow-card', 'l52-m-pg.png'], ['baseline', '#baseline .lab', 'l52-m-trace.png'], ['trust', '#trust .flow-card', 'l52-m-loop.png'], ['corridor', '#corridor .lab', 'l52-m-corridor.png'], ['clip', '#clip .lab', 'l52-m-clip.png'], ['steps', '#steps .lab', 'l52-m-steps.png']]) await show(m, id, sel, n, 4);
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
