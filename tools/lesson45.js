// Урок 4.5 «Симуляция и синтетические данные»: лаборатории и интерактив дают обещанные в тексте исходы, миссии
// проходятся через интерфейс, схема движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l45-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-24 python3 lessons/build.py l45.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-5-simulyatsiya.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const pc = (v) => Math.round(v * 100);
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
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`);
const shot = async (p, id, sel, name) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(name), sel, 6); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^7 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.4: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="4-6-piramida-dannykh.html"]')`), 'ссылка «Дальше» на урок 4.6 есть (он выходит в тот же день)');
  await p.eval('window.__l45.SPEED.k = 20; true');

  // ---------- схема MimicGen ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="mimicgen"]'); const f = (t) => { Anim.seek(cv, t); return cv.toDataURL(); }; const a = f(2), b = f(4.6), c = f(7.6), d = f(12.6); return JSON.stringify({ ab: a !== b, bc: b !== c, cd: c !== d }); })()`));
  check(anim.ab && anim.bc && anim.cd, 'схема MimicGen движется: кадры в 2; 4,6; 7,6 и 12,6 с разные');
  check(await p.eval(`window.__l45.MGScheme.ex.ok`), 'в схеме сгенерированная попытка на самом деле удаётся в симуляторе движка');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="mimicgen"]'); Anim.seek(cv, 8.2); return true; })()`);
  await p.shotEl(out('l45-flow.png'), '#mimicgen .flow-card', 6);

  // ---------- лаборатория 1: рандомизация ----------
  console.log('лаборатория 1');
  let r = await viaUI(p, '#rMis', 2);
  let s = J(await p.eval(`JSON.stringify(window.__l45.Rand.api.state())`));
  check(r.ok && /ставка сыграла/i.test(r.out) && pc(s.sim) === 100 && pc(s.real) === 68, `миссия 1: в симуляторе ${pc(s.sim)}%, на столе Ады ${pc(s.real)}% (в тексте: 100% и 68%)`);
  check(/на столе Ады — 68%/.test(r.out) && /на сам стол — \d+%/.test(r.out), 'разбор миссии 1 называет те же числа и куда уходят попытки');
  await shot(p, 'randomize', '#randomize .lab', 'l45-rand-base.png');
  await nextMission(p, '#rMis');
  r = await viaUI(p, '#rMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && /68%, 69%, 81%, 94%, 87%/.test(r.out), 'миссия 2: скатерть и свет 0–4 — 68, 69, 81, 94, 87%');
  await nextMission(p, '#rMis');
  r = await viaUI(p, '#rMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /94%, 97%, 96%, 69%, 37%/.test(r.out) && /70% против 100%/.test(r.out), 'миссия 3 (ловушка): краска 0–4 — 94, 97, 96, 69, 37%, в симуляторе на уровне 4 — 70%');
  await shot(p, 'randomize', '#randomize .lab', 'l45-rand-curves.png');
  await nextMission(p, '#rMis');
  check(await p.eval(`!document.getElementById('rTrain').hidden`), 'свободный режим: кнопка «Обучить при этих ползунках» видна');
  await p.eval(`window.__l45.Rand.api.setLv({ table: 3, light: 3, color: 1 }); true`);
  check(await p.eval(`document.getElementById('rTrain').disabled`), 'для обученной настройки кнопка обучения неактивна');
  await p.eval(`window.__l45.Rand.api.setLv({ table: 4, light: 3, color: 1 }); document.getElementById('rTrain').click(); true`);
  await p.waitFor(`!window.__l45.Rand.api.state().busy && window.__l45.Rand.api.state().trained`, 60000);
  s = J(await p.eval(`JSON.stringify(window.__l45.Rand.api.state())`));
  check(s.real != null && s.real >= 0.9, `свободный режим: обучение по кнопке при 4-3-1 — на столе Ады ${pc(s.real)}%`);

  // ---------- интерактив Dactyl ----------
  console.log('интерактив Dactyl');
  r = await viaUI(p, '#dMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && /без шума наблюдений — 8,5, без физики — 2, без неучтённых эффектов — 2, без рандомизаций — 0/.test(r.out), 'миссия 1: медианы 13; 8,5; 2; 2; 0 — как в табл. 4');
  await nextMission(p, '#dMis'); await sleep(100);
  check(!(await critOk(p, '#dMis')), 'миссия 2: по маркерам не засчитана');
  await p.eval(`document.querySelector('#dPose button[data-v="vision"]').click(); document.querySelector('#dGroup button[data-v="noise"]').click(); true`); await sleep(150);
  check(await critOk(p, '#dMis') && /3,5/.test(await outText(p, '#dMis')), 'миссия 2: камеры и «без шума наблюдений» — засчитана, медиана 3,5');
  await p.eval(`document.querySelector('#dGroup button[data-v="physics"]').click(); true`); await sleep(100);
  check(/не проверяли/.test(await text(p, '#dOut')), 'для сочетания, которого нет в статье, интерактив так и пишет');
  await p.eval(`document.querySelector('#dGroup button[data-v="noise"]').click(); true`);
  await shot(p, 'ablation', '#ablation .lab', 'l45-dactyl.png');

  // ---------- лаборатория 2: генерация ----------
  console.log('лаборатория 2');
  r = await viaUI(p, '#gMis', 2);
  s = J(await p.eval(`JSON.stringify(window.__l45.Gen.api.state())`));
  check(r.ok && /ставка сыграла/i.test(r.out) && pc(s.src) === 3 && pc(s.ok) === 67, `миссия 1: 10 записей — ${pc(s.src)}%, с 300 сгенерированными — ${pc(s.ok)}% (в тексте: 3% и 67%)`);
  check(/положила кубик в 3%/.test(r.out) && /сгенерированными — 67%/.test(r.out) && /удались 300/.test(r.out), 'разбор миссии 1 называет те же числа и долю удачной генерации');
  await shot(p, 'generate', '#generate .lab', 'l45-gen.png');
  await nextMission(p, '#gMis');
  r = await viaUI(p, '#gMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && /С проверкой — 67%, без неё — 47%/.test(r.out), 'миссия 2: без проверки в симуляторе — 47% против 67%');
  await shot(p, 'generate', '#generate .lab', 'l45-gen-nofilter.png');

  // ---------- тексты совпадают с расчётом ----------
  const fin = await text(p, '#finale');
  check(fin.includes('с 68 до 94%') && fin.includes('до 37%') && fin.includes('С 3% до 67%'.replace('С', 'с')) && fin.includes('только до 47%'), 'итоги урока называют числа лабораторий');
  const hk1 = await text(p, '#randomize .deep'), hk2 = await text(p, '#generate .deep');
  check(hk1.includes('4, 51 и 58%') && hk2.includes('62–72%') && hk2.includes('45–58%'), '«Под капотом»: разброс по зёрнам описан');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await shot(p, 'randomize', '#randomize .lab', 'l45-rand-dark.png');
  await shot(p, 'generate', '#generate .lab', 'l45-gen-dark.png');
  await shot(p, 'ablation', '#ablation .lab', 'l45-dactyl-dark.png');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="mimicgen"]'); Anim.seek(cv, 12.8); return true; })()`);
  await p.shotEl(out('l45-flow-dark.png'), '#mimicgen .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l45.SPEED.k = 20; true');
  await m.eval(`window.__l45.Rand.api.base().then(() => window.__l45.Dactyl.api.reveal()).then(() => window.__l45.Gen.api.first()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const nar = await m.eval(`(() => { const cv = document.querySelector('canvas[data-anim="mimicgen"]'); Anim.seek(cv, 8.2); return cv.dataset.layout; })()`);
  check(nar === 'n', 'на телефоне схема MimicGen в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['mimicgen', '#mimicgen .flow-card', 'l45-m-flow.png'], ['randomize', '#randomize .lab', 'l45-m-rand.png'], ['ablation', '#ablation .lab', 'l45-m-dactyl.png'], ['generate', '#generate .lab', 'l45-m-gen.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
