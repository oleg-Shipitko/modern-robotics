// Урок 3.8 «Обобщение и рассуждение: от π0.5 до π0.7»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, схема изоляции знаний движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l38-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-17 python3 lessons/build.py l38.
const path = require('path');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l38/engine.js');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-8-obobshchenie-i-rassuzhdenie.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const run = (g) => { for (;;) { const r = g.next(); if (r.done) return r.value; } };
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 1600 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`);

(async () => {
  // ---------- числа «Под капотом» лаборатории 1: считаются в Node тем же движком ----------
  console.log('движок');
  const M8 = run(E.clearTrain(8)), f200 = E.clearEval(M8.m, M8.hm, 'flat', 200, 8000), rate = {};
  f200.runs.forEach((r) => r.steps.forEach((s) => { if (!s.obj) return; const k = s.obj.color + ' ' + s.obj.shape; rate[k] = rate[k] || [0, 0]; rate[k][1]++; if (s.res === 'wrong') rate[k][0]++; }));
  const pct = (k) => Math.round(rate[k][0] / rate[k][1] * 100);
  check(pct('blue ball') === 100 && pct('blue cube') === 97 && pct('purple ball') === 87 && pct('yellow bowl') === 74, `200 столов: синий мяч ${pct('blue ball')}%, синий кубик ${pct('blue cube')}%, фиолетовый мяч ${pct('purple ball')}%, жёлтая миска ${pct('yellow bowl')}% (в тексте 100, 97, 87, 74)`);
  const redOk = ['red ball', 'red cube', 'green ball', 'green cube', 'orange ball', 'orange cube'].every((k) => pct(k) <= 7);
  check(redOk, 'красные, зелёные и оранжевые игрушки плоская кладёт верно почти всегда');

  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^7 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.7: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="proverka-chasti-3.html"]')`), 'ссылка на проверку части 3 на месте');
  check(await p.eval(`!document.querySelector('a[href="4-1-masshtab-dannykh.html"]') && /Урок 4\\.1 · Масштаб данных/.test(document.querySelector('#finale .bridge-note').textContent)`), 'урок 4.1 ещё не вышел: ссылки нет, мост в урок 4.1 — текстом');
  check((await p.eval(`document.querySelectorAll('.ada-note').length`)) === 1 && /Ада — домашний гуманоид на колёсной базе/.test(await text(p, '.ada-note')), 'сноска об Аде одна, текст по новому правилу');
  await p.eval('window.__l38.SPEED.k = 20; true');

  // ---------- схема ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="ki"]'); Anim.seek(cv, 1.2); const a = cv.toDataURL(); Anim.seek(cv, 4.6); const b = cv.toDataURL(); Anim.seek(cv, 7.5); const c = cv.toDataURL(); return JSON.stringify({ ab: a !== b, bc: b !== c }); })()`));
  check(anim.ab && anim.bc, 'схема изоляции знаний движется: кадры в 1,2 с, 4,6 с и 7,5 с разные');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="ki"]'); Anim.seek(cv, 4.6); return true; })()`);
  await p.shotEl(out('l38-ki.png'), '#ki .flow-card', 6);

  // ---------- лаборатория 1 ----------
  console.log('лаборатория 1: уборка стола');
  let r = await viaUI(p, '#cMis', 2);
  const s1 = J(await p.eval(`JSON.stringify(window.__l38.Clear.api.state())`));
  check(r.ok && s1.left && !s1.left.ok && s1.left.wrong === 1 && s1.right && s1.right.ok, 'миссия 1: на первом столе плоская положила предмет не на место, иерархическая убрала стол');
  check(/ставка сыграла/i.test(r.out) && /на шаге 2 понесла фиолетовый кубик в мойку/.test(r.out) && /«положи фиолетовый кубик в ящик»/.test(r.out), 'ставка «Только иерархическая» сыграла, разбор: шаг 2, фиолетовый кубик');
  // кадр посреди уборки: подзадача над столом и рука Ады несёт предмет
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
  await p.eval(`(() => { const C = window.__l38.Clear; C.st.t = 1.8; C.api.render(); return true; })()`);
  await p.shotEl(out('l38-lab1-mid.png'), '#lab .lab', 6);
  await p.eval(`(() => { const C = window.__l38.Clear; C.st.t = null; C.api.render(); return true; })()`);
  await p.shotEl(out('l38-lab1.png'), '#lab .lab', 6);
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  const s2 = J(await p.eval(`JSON.stringify(window.__l38.Clear.api.state())`));
  check(r.ok && s2.flatOk === 7 && s2.hierOk === 20, `миссия 2: на 20 столах плоская ${s2.flatOk}, иерархическая ${s2.hierOk} (в тексте 7 и 20)`);
  check(/ставка сыграла/i.test(r.out) && /Плоская убрала 7 столов из 20, иерархическая — 20/.test(r.out) && /не на месте оказались 18 предметов из 80/.test(r.out) && /из 10 синих и фиолетовых игрушек в мойку ушли 8/.test(r.out), 'разбор миссии 2: 7 и 20, 18 предметов, 8 из 10 синих и фиолетовых');
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  const s3 = J(await p.eval(`JSON.stringify(window.__l38.Clear.api.state())`));
  check(r.ok && s3.rec === 2 && s3.hierOk === 2 && s3.flatOk === 1, `миссия 3: две записи — иерархическая ${s3.hierOk}, плоская ${s3.flatOk}`);
  check(/ставка сыграла/i.test(r.out) && /Все 30 ошибок иерархической — в словах/.test(r.out) && /сказал «положи [^»]+»/.test(r.out), 'разбор миссии 3: 30 ошибок, все в словах, пример подзадачи');
  check(/ошибка в словах/.test(await text(p, '#cJR')), 'журнал иерархической показывает ошибку в словах на столе из разбора');
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  const s4 = J(await p.eval(`JSON.stringify(window.__l38.Clear.api.state())`));
  check(r.ok && s4.rec === 32 && s4.flatOk === 17 && s4.hierOk === 19, `миссия 4: 32 записи — плоская ${s4.flatOk}, иерархическая ${s4.hierOk}`);
  check(/ставка сыграла/i.test(r.out) && /плоская убрала 17 столов из 20 против 7 с восемью, иерархическая — 19/.test(r.out), 'разбор миссии 4: 17 против 7, иерархическая 19');
  await nextMission(p, '#cMis');
  const fail32 = await p.eval(`(() => { const ev = window.__l38.Clear.api.evalOf(32); return ev.flat.runs.findIndex((q) => !q.ok && q.wrong > 0); })()`);
  check(fail32 >= 0, `свободный режим: есть стол, где плоская ошибается и при 32 записях (стол ${fail32 + 1})`);
  const fin = await text(p, '#finale');
  check(/плоская политика убрала 7 столов из 20, иерархическая с той же моделью действий — 20/.test(fin), 'итоги урока: 7 и 20 совпадают с лабораторией');

  // ---------- лаборатория 2 ----------
  console.log('лаборатория 2: дома');
  r = await viaUI(p, '#hMis', 1);
  const h1 = J(await p.eval(`JSON.stringify(window.__l38.Homes.api.state())`));
  check(r.ok && h1.ok === 85 && h1.inOk === 118 && h1.cloth === 37, `миссия 1: один дом ${h1.ok} из 128 (в скатерть ${h1.cloth}), проверочные дома ${h1.inOk}`);
  check(/ставка сыграла/i.test(r.out) && /выполнила 85 команд из 128, модель из самих проверочных домов — 118/.test(r.out) && /модель тянется к узору скатерти/.test(r.out), 'разбор миссии 1: 85 и 118, захват в узор скатерти');
  await p.eval(`document.getElementById('homes').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
  await p.shotEl(out('l38-lab2.png'), '#homes .lab', 6);
  await nextMission(p, '#hMis'); await sleep(200);
  check(!(await critOk(p, '#hMis')), 'миссия 2: при одном доме не засчитана');
  const curve = [];
  for (let i = 1; i < E.HO.counts.length; i++) {
    await p.eval(`window.__l38.Homes.api.setN(${i}).then(() => true)`, true); await sleep(80);
    const s = J(await p.eval(`JSON.stringify(window.__l38.Homes.api.state())`)); curve.push(`${s.n}:${s.ok}`);
    if (await critOk(p, '#hMis')) break;
  }
  const h2 = J(await p.eval(`JSON.stringify(window.__l38.Homes.api.state())`));
  check(await critOk(p, '#hMis') && h2.n === 12 && h2.ok === 114 && h2.prevOk === 104, `миссия 2: засчитана на ${h2.n} домах — ${h2.ok} против ${h2.inOk}, на ${h2.prevN} — ${h2.prevOk} (кривая ${curve.join(' ')})`);
  check(/С 12 домами модель выполнила 114 команд из 128/.test(await outText(p, '#hMis')) && /а с 8 — 104/.test(await outText(p, '#hMis')), 'разбор миссии 2 совпадает с расчётом');
  check(/из 12 домов — 114, а модель, обученная в самих проверочных домах, — 118/.test(fin) && /из одного дома дали 85 верных захватов из 128/.test(fin), 'итоги урока: 85, 114 и 118 совпадают с лабораторией');
  await nextMission(p, '#hMis');
  r = await viaUI(p, '#hMis', 1);
  const h3 = J(await p.eval(`window.__l38.Homes.api.sets().then((x) => JSON.stringify(x))`, true));
  check(r.ok && h3.one.join() === '85,73,108' && h3.all.join() === '108,108,113', `миссия 3: из одного дома ${h3.one.join(', ')}, из 96 домов ${h3.all.join(', ')}`);
  check(/ставка сыграла/i.test(r.out) && /разница до 35 команд/.test(r.out), 'разбор миссии 3: разброс 35 команд с одним домом');
  await p.shotEl(out('l38-lab2-sets.png'), '#homes .lab', 6);

  // ---------- ось, квиз, глоссарий, консоль ----------
  const sort = await p.eval(`(() => { const s = window.__l38.mis.axis, m = { chunk: 'p0', pre: 'p0', mix: 'p05', sub: 'p05', homes: 'p05', sg: 'p05', value: 'p06', adv: 'p06', corr: 'p06', meta: 'p07', goal: 'p07', coach: 'p07' }; for (const [k, v] of Object.entries(m)) s.place(k, v); s.check(); return document.querySelector('#axisSort .c-out').textContent; })()`);
  check(/^12 из 12/.test(sort), 'сортировка по моделям: ' + sort.slice(0, 20));
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`(window.__l38.Clear.api.setScene(0), true)`); await sleep(200);
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l38-lab1-dark.png'), '#lab .lab', 6);
  await p.eval(`document.getElementById('homes').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l38-lab2-dark.png'), '#homes .lab', 6);
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="ki"]'); Anim.seek(cv, 7.5); return true; })()`);
  await p.shotEl(out('l38-ki-dark.png'), '#ki .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l38.SPEED.k = 20; true');
  await m.eval(`window.__l38.Clear.api.first().then(() => window.__l38.Clear.api.twenty()).then(() => window.__l38.Homes.api.oneHome()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await m.eval(`(() => { const cv = document.querySelector('canvas[data-anim="ki"]'); Anim.seek(cv, 4.6); return true; })()`);
  for (const [id, sel, n] of [['mix', '#mix .mix-grid', 'l38-m-mix.png'], ['ki', '#ki .flow-card', 'l38-m-ki.png'], ['lab', '#lab .lab', 'l38-m-lab1.png'], ['homes', '#homes .lab', 'l38-m-lab2.png'], ['axis', '#axisSort', 'l38-m-axis.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
