// Урок 3.7 «Двухуровневые архитектуры: Helix, GR00T, Gemini Robotics»: лаборатории дают обещанные в тексте исходы,
// миссии проходятся через интерфейс, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l37-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-17 python3 lessons/build.py l37.
const path = require('path');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l37/engine.js');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-7-dvukhurovnevye-arkhitektury.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const ru = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
/** Двинуть ползунок так же, как рукой: значение и событие input. */
const slide = (p, id, v) => p.eval(`(() => { const i = document.getElementById('${id}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, id, v) => p.eval(`(() => { document.querySelector('#${id} button[data-v="${v}"]').click(); return true; })()`);
const animMoves = (p, kind, t1, t2) => p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); Anim.seek(cv, ${t1}); const a = cv.toDataURL(); Anim.seek(cv, ${t2}); const b = cv.toDataURL(); return a !== b; })()`);

(async () => {
  // ---------- движок без браузера: числа, на которые опираются тексты ----------
  console.log('движок');
  const a7 = E.ages({ f: 7, cloud: 0, v: 0.15 });
  check(Math.round(a7.slow.min * 1000) === 143 && Math.round(a7.slow.max * 1000) === 286 && ru(a7.miss.min * 100, 1) === '2,1' && ru(a7.miss.max * 100, 1) === '4,3', '7 Гц: данным 143–286 мс, промах 2,1–4,3 см при 15 см/с (раздел «Под капотом» лаборатории 1)');
  const a10 = E.ages({ f: 10, cloud: 0, v: 0.15 });
  check(Math.round(a10.slow.min * 1000) === 100 && ru(a10.miss.min * 100, 1) === '1,5' && ru(a10.miss.max * 100, 1) === '3,0', '10 Гц: данным от 100 мс, промах 1,5–3 см (инференс лаборатории 1 и подсказка миссии 2)');
  const tl = E.timeline({ f: 7, cloud: 0.16 }, 1.5), seen = tl.age.slice(700).filter((x) => x != null);
  check(Math.abs(Math.max(...seen) - E.ages({ f: 7, cloud: 0.16 }).slow.max) < 0.0015 && Math.abs(Math.min(...seen) - E.ages({ f: 7, cloud: 0.16 }).slow.min) < 0.0015, 'шкала времени по миллисекундам совпадает с формулой T + L … 2T + L');
  const c7 = E.pair({ f: 7, cloud: 0, v: 0.15, scen: 'move' });
  check(!c7.single.caught && c7.dual.ok && c7.single.lagMin > 2, `рука: одна модель не берёт чашку (отстаёт на ${ru(c7.single.lagMin, 1)}–${ru(c7.single.lagMax, 1)} см), две системы — за ${ru(c7.dual.tCatch, 2)} с`);
  const sw7 = E.pair({ f: 7, cloud: 0, v: 0.15, scen: 'switch' });
  check(sw7.dual.ok && sw7.dual.caught === 'blue' && Math.abs(sw7.dual.react - sw7.single.react) < 1e-9 && ru(sw7.dual.react, 2) === '0,24', `смена просьбы при 7 Гц: обе руки повернули через ${ru(sw7.dual.react, 2)} с (итоги урока и квиз: 0,24 с)`);
  const wrongF = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((f) => E.pair({ f, cloud: 0, v: 0.15, scen: 'switch' }).dual.wrong);
  check(wrongF.join(',') === '1,2', 'свободный режим: правая рука хватает не ту чашку при 1 и 2 Гц — ' + wrongF.join(', '));
  check(E.pair({ f: 3, cloud: 0, v: 0.1, scen: 'switch' }).dual.wrong, 'при 3 Гц и чашке на 10 см/с граница сдвигается: правая рука хватает красную');

  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^6 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.6: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="3-8-obobshchenie-i-rassuzhdenie.html"]')`), 'ссылка на урок 3.8 на месте');
  check(await p.eval(`!!document.querySelector('#delay .ada-note') && /колёсной базе/.test(document.querySelector('#delay .ada-note').textContent)`), 'сноска об Аде при первом упоминании — в лаборатории 1');
  await p.eval('window.__l37.SPEED.k = 20; true');

  // ---------- схемы ----------
  check(await animMoves(p, 'dual', 0.6, 2.1), 'схема Helix движется: кадры в 0,6 с и 2,1 с разные');
  check(await animMoves(p, 'orch', 2, 6.5), 'схема оркестратора движется: кадры в 2 с и 6,5 с разные');
  await p.eval(`(() => { Anim.seek(document.querySelector('canvas[data-anim="dual"]'), 2.1); Anim.seek(document.querySelector('canvas[data-anim="orch"]'), 6.4); return true; })()`);
  await p.shotEl(out('l37-dual.png'), '#dual .flow-card', 6);
  await p.shotEl(out('l37-orch.png'), '#gemini .flow-card', 6);

  // ---------- лаборатория 1 ----------
  console.log('лаборатория 1');
  const pre = await p.eval(`document.getElementById('dOut').textContent`);
  check(!/143|286/.test(pre), 'до запуска числа возраста данных не показаны (ставка не выдана)');
  let r = await viaUI(p, '#dMis', 2);
  const d1 = J(await p.eval(`JSON.stringify(window.__l37.LabDelay.api.state())`));
  check(r.ok && /ставка сыграла/i.test(r.out) && /143 мс/.test(r.out) && /286 мс/.test(r.out) && /2,1–4,3 см/.test(r.out), 'миссия 1: ставка «от 143 до 286 мс» сыграла, разбор называет 143, 286 мс и 2,1–4,3 см');
  check(Math.round(d1.pos.max * 1000) === 286, 'состояние после запуска: самым старым данным 286 мс');
  await p.eval(`document.getElementById('delay').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-delay.png'), '#delay .lab', 6);
  await nextMission(p, '#dMis'); await sleep(100);
  check(!(await critOk(p, '#dMis')), 'миссия 2: при 7 Гц без быстрой системы не засчитана');
  await slide(p, 'dF', 10); await sleep(100);
  const d2a = J(await p.eval(`JSON.stringify(window.__l37.LabDelay.api.state())`));
  check(!(await critOk(p, '#dMis')) && ru(d2a.missMax * 100, 1) === '3,0', 'при 10 Гц промах до 3 см — всё ещё не засчитана');
  await seg(p, 'dFast', '1'); await sleep(150);
  check(await critOk(p, '#dMis'), 'с быстрой системой промах не больше 1 см — засчитана');
  check(/0,08–0,15 см/.test(await outText(p, '#dMis')), 'разбор миссии 2: промах 0,08–0,15 см');
  await nextMission(p, '#dMis'); await sleep(100);
  check(!(await critOk(p, '#dMis')), 'миссия 3: без сети не засчитана');
  await slide(p, 'dL', 160); await sleep(150);
  const d3 = J(await p.eval(`JSON.stringify(window.__l37.LabDelay.api.state())`));
  check(await critOk(p, '#dMis'), `миссия 3: сеть 160 мс, промах ${ru(d3.missMax * 100, 2)} см — засчитана`);
  check(new RegExp(`${Math.round(d3.react.min * 1000)}–${Math.round(d3.react.max * 1000)} мс`).test(await outText(p, '#dMis')), `разбор миссии 3: новая просьба доходит через ${Math.round(d3.react.min * 1000)}–${Math.round(d3.react.max * 1000)} мс`);
  await p.eval(`document.getElementById('delay').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-delay-cloud.png'), '#delay .lab', 6);

  // ---------- лаборатория 2 ----------
  console.log('лаборатория 2');
  check(J(await p.eval(`JSON.stringify(window.__l37.LabChase.api.state())`)).shown === false, 'до запуска результат погони не показан');
  r = await viaUI(p, '#cMis', 1);
  const k1 = J(await p.eval(`JSON.stringify(window.__l37.LabChase.api.state())`));
  check(r.ok && /ставка сыграла/i.test(r.out), 'миссия 1: ставка «только правая» сыграла');
  check(!k1.single.caught && k1.dual.ok && k1.dual.dCatch < 1, `левая отстаёт на ${ru(k1.single.lagMin, 1)}–${ru(k1.single.lagMax, 1)} см, правая взяла за ${ru(k1.dual.tCatch, 2)} с, отставая на ${ru(k1.dual.dCatch, 1)} см`);
  check(r.out.includes(`${ru(k1.single.lagMin, 1)}–${ru(k1.single.lagMax, 1)} см`) && r.out.includes(`${ru(k1.dual.tCatch, 2)} с`), 'разбор миссии 1 совпадает с расчётом');
  await p.eval(`document.getElementById('chase').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-chase.png'), '#chase .lab', 6);
  await nextMission(p, '#cMis'); await sleep(100);
  check(!(await critOk(p, '#cMis')), 'миссия 2: при 7 Гц не засчитана');
  await slide(p, 'cF', 1); await sleep(150);
  const k2 = J(await p.eval(`JSON.stringify(window.__l37.LabChase.api.state())`));
  check(await critOk(p, '#cMis') && k2.dual.ok, `миссия 2: при 1 Гц правая рука взяла чашку за ${ru(k2.dual.tCatch, 2)} с`);
  const t2 = await outText(p, '#cMis');
  check(t2.includes(ru(k2.dual.tCatch, 2) + ' с') && t2.includes(ru(c7.dual.tCatch, 2) + ' с'), 'разбор миссии 2 называет оба времени из расчёта');
  await nextMission(p, '#cMis'); await sleep(100);
  r = await viaUI(p, '#cMis', 1);
  const k3 = J(await p.eval(`JSON.stringify(window.__l37.LabChase.api.state())`));
  check(r.ok && /ставка сыграла/i.test(r.out) && k3.dual.caught === 'blue' && ru(k3.dual.react, 2) === '0,24', `миссия 3: правая рука повернула через ${ru(k3.dual.react, 2)} с и взяла синюю`);
  check(r.out.includes(`через ${ru(k3.dual.react, 2)} с`) && r.out.includes(`${ru(k3.dual.blueObs - E.T_SWITCH, 2)} с после просьбы`), 'разбор миссии 3 совпадает с расчётом');
  await p.eval(`document.getElementById('chase').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-chase-switch.png'), '#chase .lab', 6);
  await nextMission(p, '#cMis'); await sleep(100);
  await slide(p, 'cF', 2); await sleep(150);
  const k4 = J(await p.eval(`JSON.stringify(window.__l37.LabChase.api.state())`));
  check(k4.scen === 'switch' && k4.dual.wrong && k4.dual.caught === 'red', 'свободный режим: при 2 Гц правая рука хватает красную, хотя просили синюю');
  check(await p.eval(`/не ту/.test(document.getElementById('cStatR').textContent)`), 'подпись правой руки: «взяла не ту»');

  // ---------- карточки, квиз, глоссарий, консоль ----------
  const sort = await p.eval(`(() => { const s = window.__l37.mis.levels, m = { which: 's2', order: 's2', eagle: 's2', track: 's1', palm: 's1', dit: 's1', joints: 's1', balance: 's0', motors: 's0', sim: 's0' }; for (const [k, v] of Object.entries(m)) s.place(k, v); s.check(); return document.querySelector('#lvSort .c-out').textContent; })()`);
  check(/^10 из 10/.test(sort), 'сортировка по уровням: ' + sort.slice(0, 20));
  await p.shotEl(out('l37-levels.png'), '#lvSort', 6);
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('delay').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-delay-dark.png'), '#delay .lab', 6);
  await p.eval(`document.getElementById('chase').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l37-chase-dark.png'), '#chase .lab', 6);
  await p.eval(`(() => { Anim.seek(document.querySelector('canvas[data-anim="orch"]'), 8.6); return true; })()`); await p.shotEl(out('l37-orch-dark.png'), '#gemini .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l37.SPEED.k = 20; true');
  await m.eval(`window.__l37.LabDelay.api.play().then(() => window.__l37.LabChase.api.play()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  check(await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].every((c) => c.dataset.layout === 'n')`), 'схемы на телефоне — в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(400);
  for (const [id, sel, n] of [['delay', '#delay .lab', 'l37-m-delay.png'], ['dual', '#dual .flow-card', 'l37-m-dual.png'], ['chase', '#chase .lab', 'l37-m-chase.png'], ['levels', '#lvSort', 'l37-m-levels.png'], ['gemini', '#gemini .flow-card', 'l37-m-orch.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
