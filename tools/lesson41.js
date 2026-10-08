// Урок 4.1 «Масштаб данных в робототехнике»: калькулятор, лаборатория масштабирования и интерактив «удвоение»
// дают обещанные в тексте исходы, миссии проходятся через интерфейс, схема движется, консоль чиста,
// телефон без горизонтальной прокрутки. Снимки — shots/l41-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-31 python3 lessons/build.py l41.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-1-masshtab-dannykh.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.offsetParent !== null; })()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^8 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.8: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="4-2-teleoperatsiya.html"]')`), 'ссылка на урок 4.2 на месте');
  await p.eval('window.__l41.SPEED.k = 20; true');

  // ---------- схема ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="sweep"]'); Anim.seek(cv, 1.5); const a = cv.toDataURL(); Anim.seek(cv, 6); const b = cv.toDataURL(); Anim.seek(cv, 14); const c = cv.toDataURL(); return JSON.stringify({ ab: a !== b, bc: b !== c }); })()`));
  check(anim.ab && anim.bc, 'схема опыта движется: кадры в 1,5 с, 6 с и 14 с разные');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="sweep"]'); Anim.seek(cv, 9); return true; })()`);
  await p.eval(`document.getElementById('laws').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
  await p.shotEl(out('l41-flow.png'), '#laws .flow-card', 6);

  // ---------- калькулятор разрыва ----------
  console.log('калькулятор разрыва');
  check(!(await visible(p, '#wrapGFleet')) && !(await visible(p, '#wrapGWpm')), 'миссия 1: лишние ручки скрыты');
  let r = await viaUI(p, '#gMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /790 млн часов/.test(r.out) && /около 90 тыс\. лет/.test(r.out), 'миссия 1: 15 трлн токенов — 790 млн часов, около 90 тыс. лет: ' + r.out.slice(0, 120));
  await p.eval(`document.getElementById('gap').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l41-gap.png'), '#gap .lab', 6);
  await nextMission(p, '#gMis');
  r = await viaUI(p, '#gMis', 0);
  check(r.ok && /ставка сыграла/i.test(r.out) && /1,1 года записи/.test(r.out) && /в 79 тыс\. раз/.test(r.out) && /около 57 лет/.test(r.out) && /в 1\s?600 раз меньше/.test(r.out), 'миссия 2: π0 — 1,1 года, корпус больше в 79 тыс. раз, GEN-1 — 57 лет');
  await nextMission(p, '#gMis'); await sleep(150);
  check(await visible(p, '#wrapGFleet'), 'миссия 3: ползунок парка появился');
  check(!(await critOk(p, '#gMis')), 'миссия 3: при 100 устройствах не засчитана');
  await p.eval(`window.__l41.Gap.api.setFleet(Math.log10(30000)); true`); await sleep(150);
  const g3 = J(await p.eval(`JSON.stringify(window.__l41.Gap.api.state())`));
  check(await critOk(p, '#gMis'), `миссия 3: 30 тыс. устройств по 8 ч сравниваются с корпусом за ${g3.parity.toFixed(1)} лет`);
  const t3 = await outText(p, '#gMis');
  check(/около 27 тыс\. устройств/.test(t3) && /около 1\s?500 лет/.test(t3), 'разбор миссии 3: 27 тыс. устройств, темпом GEN-0 — около 1500 лет: ' + t3.slice(0, 90));
  await nextMission(p, '#gMis'); await sleep(150);
  await p.eval(`window.__l41.Gap.api.set({ unit: 'tokens' }); true`); await sleep(100);
  const gt = await p.eval(`document.getElementById('gOut').textContent`);
  check(/в 7\s?862 раза меньше/.test(gt) && /в 595 раз меньше/.test(gt), 'свободный режим: токенов FAST в 7862 раза меньше, без сжатия — в 595 раз: ' + gt.slice(0, 160));
  await p.eval(`window.__l41.Gap.api.set({ unit: 'years' }); true`);

  // ---------- лаборатория масштабирования ----------
  console.log('лаборатория масштабирования');
  check(!(await visible(p, '#wrapSK')) && !(await visible(p, '#sOne')), 'миссия 1: ручки свободного режима скрыты');
  const empty = await p.eval(`(() => { const cv = document.getElementById('sPlot'); return cv.toDataURL().length; })()`);
  r = await viaUI(p, '#sMis', 0);
  const s1 = J(await p.eval(`(() => { const f = window.__l41.Scale.fitOf(8), g = (M) => window.__l41.Store.get(M, 8); return JSON.stringify({ a: f.alpha, r: f.r, ok: [1, 2, 4, 8, 16, 32].map((M) => g(M).ok) }); })()`));
  check(r.ok && /ставка сыграла/i.test(r.out), `миссия 1: точки на прямой, α = ${s1.a.toFixed(2)}, r = ${s1.r.toFixed(2)}, успехи ${s1.ok.join(' ')}`);
  check(s1.ok.join(' ') === '31 60 76 82 97 96', 'числа серии с 8 демонстрациями совпадают с досье: 31 60 76 82 97 96');
  check(/при одной сцене 69 из 100, при 32 сценах — 4/.test(r.out), 'разбор миссии 1: провалов 69 и 4');
  check((await p.eval(`document.getElementById('sPlot').toDataURL().length`)) !== empty, 'на графике появились точки');
  await p.eval(`document.getElementById('scaling').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l41-scale.png'), '#scaling .lab', 6);
  await nextMission(p, '#sMis');
  r = await viaUI(p, '#sMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /при 32 сценах провалов 20 из 100, с восемью — 4/.test(r.out), 'миссия 2: одна демонстрация на сцену — 20 провалов при 32 сценах против 4: ' + r.out.slice(0, 110));
  await nextMission(p, '#sMis');
  r = await viaUI(p, '#sMis', 1);
  const md = await p.eval(`(() => { const S = window.__l41.Store; return [1, 2, 4, 8, 16, 32].reduce((s, M) => s + Math.abs(S.get(M, 16).ok - S.get(M, 8).ok), 0) / 6; })()`);
  check(r.ok && /ставка сыграла/i.test(r.out) && md < 5, `миссия 3: 16 и 8 демонстраций расходятся в среднем на ${md.toFixed(1)} сцены из 100`);
  await nextMission(p, '#sMis'); await sleep(150);
  check(await visible(p, '#wrapSK') && await visible(p, '#sOne'), 'свободный режим: ручки появились');
  const free = J(await p.eval(`window.__l41.Scale.api.one(32, 2).then((x) => JSON.stringify({ ok: x.ok }))`, true));
  check(free.ok >= 90, `свободный режим: 32 сцены × 2 = 64 демонстрации берут кубик в ${free.ok} из 100`);
  await p.eval(`document.getElementById('scaling').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l41-scale-free.png'), '#scaling .lab', 6);

  // ---------- удвоение ----------
  console.log('удвоение');
  r = await viaUI(p, '#dMis', 2);
  const d1 = J(await p.eval(`(() => { const S = window.__l41.Store; return JSON.stringify({ B: S.get(1, 4).ok, L: S.get(1, 8).ok, R: S.get(2, 4).ok }); })()`));
  check(r.ok && /ставка сыграла/i.test(r.out), `миссия 1: 1 × 4 — ${d1.B}, 1 × 8 — ${d1.L}, 2 × 4 — ${d1.R}`);
  check(Math.abs(d1.L - d1.B) <= 3 && d1.R / d1.B >= 1.5 && d1.R / d1.B < 2, 'вдвое больше демонстраций почти ничего не дали, вторая сцена — в полтора с лишним раза (как в тексте и квизе)');
  check(new RegExp(`Исходный набор — ${d1.B} из 100.*той же сцене — ${d1.L}.*демонстрациями — ${d1.R}`).test(r.out), 'разбор миссии 1 совпадает с расчётом');
  await p.eval(`document.getElementById('double').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l41-double.png'), '#double .lab', 6);
  await nextMission(p, '#dMis');
  r = await viaUI(p, '#dMis', 1);
  const d2 = J(await p.eval(`(() => { const S = window.__l41.Store; return JSON.stringify({ B: S.get(16, 1).ok, L: S.get(16, 2).ok, R: S.get(32, 1).ok }); })()`));
  check(r.ok && /ставка сыграла/i.test(r.out) && d2.L >= d2.R - 2, `миссия 2: 16 × 1 — ${d2.B}, 16 × 2 — ${d2.L}, 32 × 1 — ${d2.R}`);
  await nextMission(p, '#dMis'); await sleep(150);
  check(await visible(p, '#dGo'), 'свободный режим: кнопка «Сравнить» появилась');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  for (const [id, sel, n] of [['gap', '#gap .lab', 'l41-gap-dark.png'], ['scaling', '#scaling .lab', 'l41-scale-dark.png'], ['double', '#double .lab', 'l41-double-dark.png']]) {
    await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
  }
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="sweep"]'); Anim.seek(cv, 14); return true; })()`);
  await p.eval(`document.getElementById('laws').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
  await p.shotEl(out('l41-flow-dark.png'), '#laws .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l41.SPEED.k = 20; true');
  await m.eval(`window.__l41.Gap.api.calcCorpus().then(() => window.__l41.Gap.api.addRobots()).then(() => (window.__l41.Gap.api.showFleet(), window.__l41.Scale.api.s1())).then(() => window.__l41.Dbl.api.compare()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const fwide = await m.eval(`[...document.querySelectorAll('.formula')].filter((f) => { f.closest('details') && (f.closest('details').open = true); return f.scrollWidth > f.clientWidth + 1; }).length`);
  check(fwide === 0, 'формулы помещаются в 390 px: ' + fwide);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['laws', '#laws .flow-card', 'l41-m-flow.png'], ['gap', '#gap .lab', 'l41-m-gap.png'], ['scaling', '#scaling .lab', 'l41-m-scale.png'], ['double', '#double .lab', 'l41-m-double.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
