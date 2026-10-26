// Урок 3.1 «RT-1»: лаборатория и интерактив дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// схема движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l31-*.png.
// Урок собирается на дату выпуска части: MR_ASOF=2026-10-26 python3 lessons/build.py l31.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-1-rt-1.html');
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
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const tState = (p) => p.eval(`JSON.stringify(window.__l31.LabTokens.api.state())`).then(J);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^8 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.3: три вопроса');
  check((await p.eval(`!!document.querySelector('a[href="3-2-vision-language-modeli.html"]')`)), 'ссылка на урок 3.2 на месте');
  await p.eval('window.__l31.SPEED.k = 20; true');

  // ---------- схема и калькулятор ----------
  console.log('схема и калькулятор');
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="rt1"]'); Anim.seek(cv, 1.0); const a = cv.toDataURL(); Anim.seek(cv, 7.0); const b = cv.toDataURL(); Anim.seek(cv, 10.5); const c = cv.toDataURL(); return JSON.stringify({ ab: a !== b, bc: b !== c, w: cv.width }); })()`));
  check(anim.ab && anim.bc, 'схема RT-1 движется: кадры в 1, 7 и 10,5 с различаются');
  await p.eval(`document.getElementById('arch').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l31-flow.png'), '.flow-card', 6);
  check(/130\s?200/.test(await p.eval(`document.getElementById('cEpisodes').textContent`)) && /^17/.test(await p.eval(`document.getElementById('cMonths').textContent`)), 'калькулятор: 744 × 175 = 130 200 эпизодов, 17 месяцев');
  await p.eval(`(() => { const i = document.getElementById('cRobots'); i.value = 1; i.dispatchEvent(new Event('input')); return true; })()`);
  check(/лет/.test(await p.eval(`document.getElementById('cMonths').textContent`)), 'один робот: срок в годах — ' + await p.eval(`document.getElementById('cMonths').textContent`));

  // ---------- лаборатория «Действие как токен» ----------
  console.log('Действие как токен');
  let r = await viaUI(p, '#tMis', 1);
  let s = await tState(p);
  check(r.ok && s.B === 8 && s.quantHits === 10, `миссия 1: 8 корзин — центр корзины попадает в ${s.quantHits} из 30`);
  check(/ставка сыграла/i.test(r.out) && /10 из 30/.test(r.out), 'разбор миссии 1 называет 10 из 30, ставка «каждая третья» сыграла');
  await nextMission(p, '#tMis'); await sleep(100);
  s = await tState(p);
  check(s.small && s.B === 16 && s.quantHits === 22 && !(await critOk(p, '#tMis')), `миссия 2: мелкий кубик, 16 корзин — ${s.quantHits} из 30, ещё не засчитано`);
  await p.eval(`window.__l31.LabTokens.api.setBins(3); true`); await sleep(100);
  s = await tState(p);
  check(s.B === 32 && s.quantHits === 30 && await critOk(p, '#tMis'), 'миссия 2: 32 корзины — 30 из 30, засчитана');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 0);
  check(r.ok && /ставка сыграла/i.test(r.out), 'миссия 3: 8 корзин обучены — ставка «сетка ограничит» сыграла');
  s = await tState(p);
  check(s.last && s.last.B === 8 && s.last.hits === 10 && s.last.exact === 25, `модель 8 корзин: попаданий ${s.last.hits} из 30, точная корзина ${s.last.exact}`);
  check(new RegExp(`${s.last.exact} сценах`).test(r.out) && new RegExp(`попаданий ${s.last.hits}`).test(r.out), 'разбор миссии 3 называет свои числа');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 1);
  s = await tState(p);
  check(r.ok && s.last.B === 256 && s.last.hits === 7 && s.last.exact === 0 && /ставка сыграла/i.test(r.out), `миссия 4: 256 корзин на 300 демонстрациях — ${s.last.hits} из 30, точных ${s.last.exact}`);
  await nextMission(p, '#tMis');
  await p.eval(`window.__l31.LabTokens.api.setBins(2); true`);
  r = await viaUI(p, '#tMis', 0);
  s = await tState(p);
  check(r.ok && s.last.B === 16 && s.last.hits === 22, `миссия 5: 16 корзин — ${s.last.hits} из 30, не меньше 20`);
  check((await p.eval(`document.querySelectorAll('#tModels .mdl').length`)) === 3, 'три модели рядом на одной сцене: карточки 8, 256 и 16');
  await p.eval(`document.getElementById('tokens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l31-tokens.png'), '#tokens .lab', 6);
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 0);
  s = await tState(p);
  check(r.ok && s.last.B === 256 && s.last.n === 1000 && s.last.hits === 11 && /ставка сыграла/i.test(r.out), `миссия 6: 256 корзин на 1000 демонстраций — ${s.last.hits} из 30 вместо 7`);
  check(/11 из 30 вместо 7/.test(r.out), 'разбор миссии 6 сравнивает 11 и 7');
  await nextMission(p, '#tMis'); await sleep(100);
  check(!(await p.eval(`document.getElementById('tTrain').hidden`)), 'свободный режим: кнопка «Обучить» видна');

  // ---------- интерактив «Разнообразие важнее объёма» ----------
  console.log('Разнообразие важнее объёма');
  check((await p.eval(`document.querySelectorAll('#ablBody tr:not(.hidden-row)').length`)) === 1, 'до ставки видна только строка полного набора');
  r = await viaUI(p, '#aMis', 2);
  check(r.ok && /54%/.test(r.out) && /50%/.test(r.out) && /ставка сыграла/i.test(r.out), 'миссия 1: строки открыты, разбор называет 54% и 50%, ставка «одинаково» сыграла');
  check((await p.eval(`document.querySelectorAll('#ablBody tr:not(.hidden-row)').length`)) === 5, 'после ставки открыты все пять строк');
  const det = await p.eval(`document.getElementById('ablDetail').textContent`);
  check(/75% задач/.test(det) && /−19|-19/.test(det), 'подробности по строке «75% задач»: обобщение −19 п. п.');
  await nextMission(p, '#aMis'); await sleep(100);
  await p.eval(`window.__l31.LabAbl.api.sortAll({ sim: 'up', kuka: 'up', auto: 'none', cont: 'down', hist: 'down', pre: 'down', t75: 'down' }); true`); await sleep(150);
  const srt = J(await p.eval(`JSON.stringify(window.__l31.LabAbl.api.state().sort)`));
  check(srt && srt.score === 7 && srt.total === 7 && await critOk(p, '#aMis'), 'миссия 2: карточки разложены верно, 7 из 7');
  await p.eval(`document.getElementById('diversity').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l31-diversity.png'), '#diversity .lab', 6);

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('tokens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l31-tokens-dark.png'), '#tokens .lab', 6);
  await p.eval(`document.getElementById('arch').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l31-flow-dark.png'), '.flow-card', 6);

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l31.SPEED.k = 20; true');
  await m.eval(`window.__l31.LabTokens.api.train().then(() => true)`, true);
  await m.eval(`window.__l31.LabAbl.api.reveal().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const labs = J(await m.eval(`JSON.stringify([...document.querySelectorAll('.lab')].map((l) => ({ w: Math.round(l.getBoundingClientRect().width), pw: Math.round(l.parentElement.getBoundingClientRect().width), sw: l.scrollWidth, cw: l.clientWidth })))`));
  check(labs.every((l) => l.w <= l.pw + 1 && l.sw <= l.cw + 1), 'ни одна .lab не шире своей карточки: ' + JSON.stringify(labs));
  const narrow = await m.eval(`document.querySelector('canvas[data-anim="rt1"]').dataset.layout`);
  check(narrow === 'n', 'схема на телефоне в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, n, sel] of [['data', 'l31-m-data.png', '#calc'], ['arch', 'l31-m-flow.png', '.flow-card'], ['tokens', 'l31-m-tokens.png', '#tokens .lab'], ['diversity', 'l31-m-diversity.png', '#diversity .lab']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
