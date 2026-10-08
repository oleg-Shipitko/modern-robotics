// Урок 4.2 «Телеоперация и устройства сбора»: миссии проходятся через интерфейс (ставка, кнопка, критерии;
// руку Ады в записи ведёт модель оператора вместо мыши), разборы совпадают с расчётом, пять схем устройств
// движутся, калькулятор и сортировка дают обещанные исходы, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l42-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-31 python3 lessons/build.py l42.
const path = require('path');
const { launch, sleep } = require('./cdp');
const L42 = require('../lessons/l42/engine.js');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-2-teleoperatsiya.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const ru = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Пройти миссию через интерфейс: ставка (если есть), главная кнопка, при записи — модель оператора ведёт пульт. */
async function viaUI(p, mis, bet, drive) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 60));
    ${drive ? 'window.__l42.LabTele.api.autoHand();' : ''}
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
const teleState = (p) => p.eval(`JSON.stringify((({ ref, last }) => ({ ref: ref && { T: ref.T, pauses: ref.pauses, jitter: ref.jitter, extra: ref.extra, ok: ref.ok }, last: last && { T: last.T, pauses: last.pauses, jitter: last.jitter, extra: last.extra, ok: last.ok, mode: last.mode, delay: last.delay } }))(window.__l42.LabTele.api.state()))`).then(J);
const ANIMS = ['gello', 'vr', 'dexcap', 'exo', 'umi'];
const SECT = { gello: 'leader', vr: 'vr', dexcap: 'hands', exo: 'exo', umi: 'umi' };

(async () => {
  // ожидания из движка: те же числа должны получиться в браузере и в текстах
  const exp = { lead: L42.runAuto({ mode: 'leader', delay: 0, seed: 11 }).m };
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^7 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.1: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="4-3-datasety-robotov.html"]')`), 'ссылка на урок 4.3 на месте');
  await p.eval('window.__l42.SPEED.k = 20; true');

  // ---------- схемы устройств ----------
  for (const a of ANIMS) {
    const r = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${a}"]'); Anim.seek(cv, 1.5); const x = cv.toDataURL(); Anim.seek(cv, 4.5); const y = cv.toDataURL(); Anim.seek(cv, 7.5); const z = cv.toDataURL(); return JSON.stringify({ ab: x !== y, bc: y !== z }); })()`));
    check(r.ab && r.bc, `схема ${a} движется: кадры в 1,5 с, 4,5 с и 7,5 с разные`);
  }
  for (const a of ANIMS) {
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${a}"]'); Anim.seek(cv, ${a === 'umi' ? 2.4 : 4.6}); return true; })()`);
    await p.shotEl(out(`l42-${a}.png`), `#${SECT[a]} .dev-fig`, 6);
  }
  check((await p.eval(`document.querySelectorAll('.dev-fig .cv-note').length`)) === 5, 'у каждой схемы подпись cv-note');

  // ---------- лаборатория ----------
  console.log('лаборатория');
  await p.eval(`document.getElementById('tele').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
  let r = await viaUI(p, '#tMis', 0, true);
  let s = await teleState(p);
  check(r.ok && s.ref && s.ref.ok, `миссия 1: ведущая рука без задержки — чашка на полке за ${ru(s.ref.T, 1)} с (модель в Node: ${ru(exp.lead.T, 1)} с)`);
  check(Math.abs(s.ref.T - exp.lead.T) < 0.05, 'длительность эталона совпадает с расчётом движка');
  check(new RegExp(`${ru(s.ref.T, 1)} с`).test(r.out), 'разбор миссии 1 называет длительность записи');
  await p.shotEl(out('l42-lab.png'), '#tele .lab', 6);
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 1, true); s = await teleState(p);
  check(r.ok && s.last.delay === 300, `миссия 2: задержка 300 мс — ${ru(s.last.T, 1)} с против ${ru(s.ref.T, 1)} с, паузы ${ru(s.last.pauses, 1)} с`);
  check(/ставка сыграла/i.test(r.out) && s.last.T > s.ref.T * 1.25, 'ставка «дольше и с паузами» сыграла');
  check(r.out.includes(`${ru(s.last.T, 1)} с против ${ru(s.ref.T, 1)} с`) && /62%/.test(r.out), 'разбор миссии 2: числа записи и 62% из ALOHA');
  await p.shotEl(out('l42-lab-delay.png'), '#tele .lab', 6);
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 1, true); s = await teleState(p);
  check(r.ok && s.last.mode === 'air' && s.last.jitter > 2 * s.ref.jitter, `миссия 3: рука в воздухе — дрожь действий ${ru(s.last.jitter, 1)} мм против ${ru(s.ref.jitter, 1)} мм`);
  check(/ставка сыграла/i.test(r.out) && r.out.includes(`${ru(s.last.jitter, 1)} мм против ${ru(s.ref.jitter, 1)} мм`) && /0,92/.test(r.out), 'разбор миссии 3: дрожь и успех GELLO 0,92');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 1, true); s = await teleState(p);
  check(r.ok && s.last.mode === 'keys' && s.last.T > s.ref.T * 1.2, `миссия 4: клавиши — ${ru(s.last.T, 1)} с против ${ru(s.ref.T, 1)} с`);
  check(/ставка сыграла/i.test(r.out) && r.out.includes(`${ru(s.last.T, 1)} с против ${ru(s.ref.T, 1)} с`), 'разбор миссии 4 совпадает с расчётом');
  await p.shotEl(out('l42-lab-keys.png'), '#tele .lab', 6);
  check(await nextMission(p, '#tMis'), 'свободный режим открыт');
  check(await p.eval(`!document.getElementById('wrapTMode').hidden && !document.getElementById('wrapTDelay').hidden && !document.getElementById('tRec').hidden`), 'в свободном режиме видны все ручки и кнопка записи');
  r = await p.eval(`(async () => { const A = window.__l42.LabTele.api; A.setMode('leader'); A.setDelay(500); document.getElementById('tRec').click(); await new Promise((q) => setTimeout(q, 50)); A.autoHand(); for (let i = 0; i < 1200 && A.state().recording; i++) await new Promise((q) => setTimeout(q, 50)); const s = A.state(); return JSON.stringify({ ok: s.last.ok, T: s.last.T, ref: s.ref.T, pauses: s.last.pauses }); })()`, true).then(J);
  check(r.ok && r.T >= 2 * r.ref && r.pauses > 1, `свободный режим: ведущая рука с задержкой 500 мс — ${ru(r.T, 1)} с (вдвое дольше эталона), паузы ${ru(r.pauses, 1)} с`);
  const html = await p.eval(`document.getElementById('tele').innerHTML`);
  check(/5,9 с, с задержкой 300 мс — 14,6 с/.test(html) && Math.abs(exp.lead.T - 5.9) < 0.05, '«Под капотом» лаборатории: 5,9 и 14,6 с совпадают с моделью оператора');
  // неудачная запись: остановить до конца — критерии не засчитаны
  r = await p.eval(`(async () => { window.__l42.LabTele.api.setDelay(300); const pr = window.__l42.LabTele.api.record(); await new Promise((q) => setTimeout(q, 50)); window.__l42.LabTele.api.stop(); const x = await pr; return JSON.stringify({ ok: x.ok, ab: x.aborted }); })()`, true).then(J);
  check(!r.ok && r.ab, 'остановленная запись не засчитывается');

  // ---------- калькулятор ----------
  console.log('калькулятор');
  await p.eval(`document.getElementById('cost').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
  check(/Сделай ставку/.test(await p.eval(`document.getElementById('cRows').textContent`)), 'до ставки расчёт скрыт');
  const c1 = L42.costCalc({ budget: 100000, people: 10, wage: 25 }), by = Object.fromEntries(c1.map((x) => [x.id, x]));
  r = await viaUI(p, '#cMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out), 'миссия 1: UMI раньше всех, ставка сыграла');
  check(by.aloha.kits === 5 && by.gello.kits === 3 && by.umi.kits === 10 && r.out.includes(`На $100 000 выходит 5 комплектов ALOHA и 3`), `разбор: комплектов ALOHA ${by.aloha.kits}, GELLO ${by.gello.kits}, UMI ${by.umi.kits}`);
  check(r.out.includes(`UMI — ${ru(by.umi.days, 1)} дня`) && r.out.includes(`ALOHA — ${ru(by.aloha.days, 1)} дня`), `разбор: UMI ${ru(by.umi.days, 1)} дня, ALOHA ${ru(by.aloha.days, 1)} дня`);
  await p.shotEl(out('l42-cost.png'), '#cost .lab', 6);
  await nextMission(p, '#cMis');
  check(!(await critOk(p, '#cMis')), 'миссия 2: при $100 000 не засчитана');
  await p.eval(`window.__l42.LabCost.api.setB(200000); true`); await sleep(200);
  check(await critOk(p, '#cMis'), 'миссия 2: при $200 000 у каждого свой комплект ALOHA, и она всё равно медленнее UMI');
  const c2 = Object.fromEntries(L42.costCalc({ budget: 200000, people: 10, wage: 25 }).map((x) => [x.id, x]));
  check((await outText(p, '#cMis')).includes(`собирает ${ru(c2.aloha.perDay, 0)} демонстраций в день против ${ru(c2.umi.perDay, 0)} у UMI`), 'разбор миссии 2 совпадает с расчётом');
  await nextMission(p, '#cMis'); await sleep(100);
  check(!(await critOk(p, '#cMis')), 'миссия 3: при ставке $40 не засчитана');
  await p.eval(`window.__l42.LabCost.api.setW(10); true`); await sleep(200);
  check(await critOk(p, '#cMis') && /\$10 в час/.test(await outText(p, '#cMis')), 'миссия 3: при ставке $10 оборудование ALOHA и люди поровну');

  // ---------- сортировка, квиз, глоссарий, консоль ----------
  const sort = await p.eval(`(() => { const s = window.__l42.mis.sort, m = { aloha: 'look', mobile: 'look', tv: 'cam', homie: 'cam', dexcap: 'none', umi: 'none', airexo: 'none' }; for (const [k, v] of Object.entries(m)) s.place(k, v); s.check(); return document.querySelector('#devSort .c-out').textContent; })()`);
  check(/^7 из 7/.test(sort), 'сортировка устройств: ' + sort.slice(0, 20));
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('tele').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l42-lab-dark.png'), '#tele .lab', 6);
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="exo"]'); Anim.seek(cv, 4.6); return true; })()`); await p.shotEl(out('l42-exo-dark.png'), '#exo .dev-fig', 6);
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="vr"]'); Anim.seek(cv, 5.8); return true; })()`); await p.shotEl(out('l42-vr-dark.png'), '#vr .dev-fig', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l42.SPEED.k = 20; true');
  await m.eval(`document.getElementById('tele').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
  r = await viaUI(m, '#tMis', 0, true);
  check(r.ok, 'телефон: первая запись проходит');
  await m.eval(`window.__l42.LabCost.api.compute().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const narrow = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((cv) => cv.dataset.layout).join(',')`);
  check(narrow === 'n,n,n,n,n', 'телефон: у всех схем узкая раскладка: ' + narrow);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['leader', '#leader .dev-fig', 'l42-m-gello.png'], ['umi', '#umi .dev-fig', 'l42-m-umi.png'], ['tele', '#tele .lab', 'l42-m-lab.png'], ['cost', '#cost .lab', 'l42-m-cost.png'], ['sort', '#devSort', 'l42-m-sort.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
