// Урок 4.3 «Датасеты роботов»: лаборатории и интерактив дают обещанные в тексте исходы, миссии проходятся через
// интерфейс, схема движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l43-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-24 python3 lessons/build.py l43.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-3-datasety-robotov.html');
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
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
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
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^7 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.2: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="4-4-video-lyudey.html"]')`), 'ссылка на урок 4.4 на месте (часть 4 выходит целиком 24.10)');
  await p.eval('window.__l43.SPEED.k = 20; true');

  // ---------- схема ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="droid"]'); const f = (t) => { Anim.seek(cv, t); return cv.toDataURL(); }; const a = f(2), b = f(7), c = f(9.5), d = f(11.4); return JSON.stringify({ ab: a !== b, bc: b !== c, cd: c !== d }); })()`));
  check(anim.ab && anim.bc && anim.cd, 'схема DROID движется: кадры в 2; 7; 9,5 и 11,4 с разные');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="droid"]'); Anim.seek(cv, 9.5); return true; })()`);
  await p.shotEl(out('l43-flow.png'), '#droid .flow-card', 6);

  // ---------- таблица наборов ----------
  console.log('таблица');
  let r = await viaUI(p, '#dsMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && /DROID — 564 сцен/.test(r.out) && /AgiBot World — 106/.test(r.out), 'миссия 1: больше всего сцен у DROID (564), у AgiBot World — 106');
  await nextMission(p, '#dsMis'); await sleep(150);
  check(!(await critOk(p, '#dsMis')), 'миссия 2: без столбца «траекторий на сцену» не засчитана');
  await p.eval(`(window.__l43.Datasets.api.setCol('per'), window.__l43.Datasets.api.select('agibot'), true)`); await sleep(150);
  check(!(await critOk(p, '#dsMis')), 'миссия 2: AgiBot World — неверный выбор');
  await p.eval(`document.querySelector('#dsTable tr[data-id="droid"] td[data-k="per"]').click(); true`); await sleep(150);
  const t2 = (await outText(p, '#dsMis')).replace(/[\u00a0\u202f]/g, ' ');
  check(await critOk(p, '#dsMis') && /DROID — около 135/.test(t2) && /RT-1 — около 65 000/.test(t2), 'миссия 2: на сцену меньше всего у DROID — около 135 траекторий');
  await p.eval(`(() => { const td = document.querySelector('#dsTable tr[data-id="rt1"] td[data-k="tasks"]'); td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true; })()`); await sleep(100);
  check(/2 глагола|их 2/.test(await text(p, '#dsOut')), 'подсказка к ячейке: у RT-1 по подсчёту DROID 2 глагола');
  await p.eval(`document.getElementById('table').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-table.png'), '#table .lab', 6);

  // ---------- лаборатория 1: кухни ----------
  console.log('лаборатория 1');
  r = await viaUI(p, '#kMis', 2);
  const k1 = J(await p.eval(`JSON.stringify(window.__l43.Kitchens.api.state())`));
  check(r.ok && pc(k1.one) === 28 && pc(k1.many) === 67, `миссия 1: одна кухня ${pc(k1.one)}%, 24 кухни ${pc(k1.many)}% (в тексте: 28% и 67%)`);
  check(/ставка сыграла/i.test(r.out) && new RegExp(`модель из одной кухни попадает в кубик в ${pc(k1.one)}%`).test(r.out) && /дома красным был только кубик/.test(r.out), 'разбор миссии 1 называет те же числа и показывает кухню с наибольшей разницей');
  check(/в 20 таких кухнях 23% против 66%/.test(r.out), 'разбор миссии 1: кухни с некрасным кубиком — 23% против 66%');
  await p.eval(`document.getElementById('kitchens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-kitchens.png'), '#kitchens .lab', 6);
  await nextMission(p, '#kMis');
  r = await viaUI(p, '#kMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out), 'миссия 2: сильнее всего помогли разные предметы, ставка «Предметы» сыграла');
  check(/Одна кухня — 28%, разные скатерти — 43%, разный свет — 36%, разные предметы — 58%, всё сразу — 67%/.test(r.out), 'разбор миссии 2: 28, 43, 36, 58 и 67%');
  await nextMission(p, '#kMis');
  await p.eval(`window.__l43.Kitchens.api.setAxes({ table: true, light: true, objs: true }).then(() => window.__l43.Kitchens.api.setScene(15))`, true); await sleep(200);
  const k3 = J(await p.eval(`JSON.stringify(window.__l43.Kitchens.api.state())`));
  check(k3.right != null && k3.right < 0.05, `свободный режим: в кухне 16 (тёмная полосатая скатерть) ошибается даже модель из 24 кухонь — ${pc(k3.right)}%`);
  const lt = await text(p, '#kitchens');
  check(/кубик синий, зелёный или фиолетовый/.test(lt), 'вывод после лаборатории 1 согласован с разбором ошибок');

  // ---------- лаборатория 2: отбор ----------
  console.log('лаборатория 2');
  r = await viaUI(p, '#cMis', 0);
  check(!r.ok && /Убрано испорченных — 0 из 16/.test(r.out), 'миссия 1: без отбора не засчитана, подсказка называет 0 из 16');
  const badIdx = J(await p.eval(`JSON.stringify(window.__l43.Curation.api.badIdx())`));
  check(badIdx.length === 16, 'испорченных эпизодов 16');
  await p.eval(`(() => { const ids = ${JSON.stringify(badIdx.slice(0, 15))}; ids.forEach((i) => document.querySelector('#cGrid .ep[data-i="' + i + '"]').click()); return true; })()`);
  r = await viaUI(p, '#cMis', 0);
  check(r.ok && /убрано испорченных — 15 из 16/i.test(r.out), 'миссия 1: найдено 15 из 16 через щелчки по эпизодам — засчитана');
  await p.eval(`window.__l43.Curation.api.setOff(${JSON.stringify(badIdx)}); true`);
  r = await viaUI(p, '#cMis', 0);
  const m1 = r.out.match(/На всех 48 эпизодах модель попадает в кубик в (\d+)% .*на оставшихся 32 — в (\d+)%/);
  check(r.ok && m1 && m1[1] === '38' && m1[2] === '69', `миссия 1: все 48 — ${m1 && m1[1]}%, 32 хороших — ${m1 && m1[2]}% (в тексте: 38% и 69%)`);
  await p.eval(`document.getElementById('curation').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-curation.png'), '#curation .lab', 6);
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /48 эпизодов — 38%, 96 с той же долей испорченных — 35%, 32 хороших — 69%/.test(r.out), 'миссия 2: 96 эпизодов той же смеси — 35%, 32 хороших — 69%');
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /только «не тот предмет» — 44%, только «мимо» — 53%/.test(r.out), 'миссия 3: сильнее вредят «мимо» (44% против 53%)');
  const tm = r.out.match(/отдаёт пустому столу (\d+)% вероятности против (\d+)%/);
  check(tm && +tm[1] > 2 * +tm[2], `разбор миссии 3: с «мимо» модель отдаёт столу ${tm && tm[1]}% против ${tm && tm[2]}%`);
  await p.eval(`document.getElementById('curation').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-curation-kinds.png'), '#curation .lab', 6);

  // ---------- тексты совпадают с расчётом ----------
  const fin = await text(p, '#finale');
  check(fin.includes('67% против 28%') && fin.includes('69% против 38% у всех 48 и 35%'), 'итоги урока называют числа лабораторий');
  const hk = await text(p, '#kitchens .deep');
  check(hk.includes('одна кухня — 28%, 24 кухни — 67%'), '«Под капотом» лаборатории 1: средние по зёрнам согласованы с набором миссий');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`(window.__l43.Kitchens.api.setScene(13), true)`); await sleep(200);
  await p.eval(`document.getElementById('kitchens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-kitchens-dark.png'), '#kitchens .lab', 6);
  await p.eval(`document.getElementById('table').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l43-table-dark.png'), '#table .lab', 6);
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="droid"]'); Anim.seek(cv, 3); return true; })()`);
  await p.shotEl(out('l43-flow-dark.png'), '#droid .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l43.SPEED.k = 20; true');
  await m.eval(`window.__l43.Kitchens.api.first().then(() => window.__l43.Datasets.api.reveal()).then(() => (window.__l43.Datasets.api.setCol('per'), window.__l43.Curation.api.setOff(window.__l43.Curation.api.badIdx().slice(0, 6)), true))`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 && !c.querySelector('.tbl-wrap')); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const tblScroll = await m.eval(`(() => { const w = document.querySelector('#dsTable'); return getComputedStyle(w).overflowX; })()`);
  check(tblScroll === 'auto', 'таблица наборов на телефоне прокручивается внутри своей рамки');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['droid', '#droid .flow-card', 'l43-m-flow.png'], ['table', '#table .lab', 'l43-m-table.png'], ['kitchens', '#kitchens .lab', 'l43-m-kitchens.png'], ['curation', '#curation .lab', 'l43-m-curation.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
