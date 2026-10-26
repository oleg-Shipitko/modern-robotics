// Урок 3.4 «Open X-Embodiment»: карточки формата, таблицы статьи и лаборатория смеси дают обещанные в тексте исходы,
// миссии проходятся через интерфейс, схема движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l34-*.png.
// Урок собирается на дату выпуска части: MR_ASOF=2026-10-17 python3 lessons/build.py l34.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-4-open-x-embodiment.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const P2 = (v) => Math.round(v * 100);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    for (let i = 0; i < 900 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const shotSec = async (p, id, file, sel) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel || `#${id} .lab`, 6); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const heroMis = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^9 миссий с целью$/.test(heroMis), 'число миссий в шапке: ' + heroMis);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.3: три вопроса');
  check((await p.eval(`!!document.querySelector('a[href="3-5-otkrytye-vla.html"]')`)), 'ссылка на урок 3.5 на месте (сборка на 26.10)');
  check((await p.eval(`document.querySelectorAll('section.section').length`)) === 9 && (await p.eval(`[...document.querySelectorAll('.kicker .num')].map((e) => e.textContent).join(',')`)) === '3.4,1,2,3,4,5,6', 'девять разделов, нумерация только у текстовых: ' + await p.eval(`[...document.querySelectorAll('.kicker .num')].map((e) => e.textContent).join(',')`));
  await p.eval('window.__l34.SPEED.k = 20; true');

  // ---------- 1. карточки общего формата ----------
  console.log('Общий формат');
  check((await p.eval(`document.querySelectorAll('#fmtSort .c-card').length`)) === 13 && (await p.eval(`document.querySelectorAll('#fmtSort .c-zone').length`)) === 4, 'тринадцать карточек и четыре корзины');
  // одну карточку — через интерфейс: нажать карточку, потом корзину
  await p.eval(`(() => { const c = document.querySelector('#fmtSort .c-card[data-id="frame"]'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 })); c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 })); document.querySelector('#fmtSort .c-zone[data-zone="keep"] .c-zone-h').click(); return true; })()`);
  check((await p.eval(`document.querySelector('#fmtSort .c-body[data-zone="keep"] .c-card[data-id="frame"]') !== null`)), 'карточка «ось x в базе» через нажатия попала в «остаётся невыровненным»');
  await p.eval(`(() => { const F = window.__l34.FmtSort; F.ITEMS.forEach((it) => F.ctl.place(it.id, it.target)); F.ctl.check(); return true; })()`); await sleep(100);
  check((await p.eval(`document.querySelectorAll('#fmtSort .c-card.c-ok').length`)) === 13 && /13 из 13/.test(await p.eval(`document.querySelector('#fmtSort .c-out').textContent`)), 'все карточки на местах — 13 из 13');
  await shotSec(p, 'format', 'l34-format.png', '#fmtSort');

  // ---------- 2. таблицы статьи ----------
  console.log('Таблицы');
  check((await p.eval(`document.querySelectorAll('#tBox td.hid').length`)) === 6, 'до ставки числа RT-1-X и RT-2-X закрыты: 6 ячеек «?»');
  let r = await viaUI(p, '#tMis', 1);
  let ts = J(await p.eval(`JSON.stringify(window.__l34.LabTables.api.state())`));
  check(r.ok && ts.open1 && ts.rt1x.join(',') === '27,27,73' && ts.rt1.join(',') === '40,30,92' && ts.rt2x.join(',') === '50,30,91', 'миссия 1: таблица I открыта, числа как в статье: RT-1-X ' + ts.rt1x.join('/') + ', RT-1 ' + ts.rt1.join('/') + ', RT-2-X ' + ts.rt2x.join('/'));
  check(/ставка сыграла/i.test(r.out) && /27% против 40%/.test(r.out), 'ставка «хуже» сыграла, разбор называет 27% против 40%');
  await nextMission(p, '#tMis'); r = await viaUI(p, '#tMis', 1);
  ts = J(await p.eval(`JSON.stringify(window.__l34.LabTables.api.state())`));
  check(r.ok && ts.open2 && ts.em.join(',') === '27.3,75.8,42.8,44.4,14.5,0,48.7' && ts.gen.join(',') === '62,61,54,52,30,1,47', 'миссия 2: таблица II открыта, обе колонки как в статье');
  check(/ставка сыграла/i.test(r.out) && /75,8% против 27,3%/.test(r.out), 'ставка «втрое» сыграла, разбор называет 75,8% против 27,3%');
  await nextMission(p, '#tMis');
  await p.eval(`document.querySelector('#tBox tbody tr[data-row="1"]').click(); true`); await sleep(80);
  check(!(await critOk(p, '#tMis')), 'миссия 3: строка 2 — не ответ');
  await p.eval(`document.querySelector('#tBox tbody tr[data-row="2"]').click(); true`); await sleep(80);
  check(await critOk(p, '#tMis'), 'миссия 3: строка 3 «смесь без Bridge» засчитана');
  await nextMission(p, '#tMis');
  await p.eval(`document.querySelector('#tBox tbody tr[data-row="3"]').click(); true`); await sleep(80);
  check(await critOk(p, '#tMis'), 'миссия 4: строка 4 (5B с историей) засчитана');
  await p.eval(`(() => { const td = document.querySelector('#tBox tbody tr[data-row="1"]'); const r = td.getBoundingClientRect(); td.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 20, clientY: r.top + 8 })); return true; })()`); await sleep(50);
  check(await p.eval(`document.getElementById('tooltip').classList.contains('show') && /Bridge/.test(document.getElementById('tooltip').textContent)`), 'наведение на строку показывает подсказку');
  await p.eval(`document.getElementById('tooltip').classList.remove('show'); true`);
  await shotSec(p, 'results', 'l34-tables.png');

  // ---------- 3. смесь данных ----------
  console.log('Смесь данных');
  const robots = await p.eval(`document.querySelectorAll('#xRobots .robot canvas').length`);
  check(robots === 4, 'четыре кадра роботов на сцене');
  r = await viaUI(p, '#xMis', 0);
  let xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(r.ok && xs.own.every((v) => v != null), `миссия 1: свои политики — A ${P2(xs.own[0])}%, B ${P2(xs.own[1])}%, C ${P2(xs.own[2])}%, D ${P2(xs.own[3])}%`);
  check(xs.own[0] >= 0.6 && xs.own[1] > xs.own[2] && xs.own[2] > xs.own[3] && xs.own[3] < 0.25, 'успех идёт за числом демонстраций: A > B > C > D, как в разборе');
  check(/ставка сыграла/i.test(r.out), 'ставка «A» сыграла');
  await shotSec(p, 'mix', 'l34-mix-own.png');
  // миссия 2: смесь без выравнивания оси D
  await nextMission(p, '#xMis'); r = await viaUI(p, '#xMis', 1);
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  const dl = xs.delta;
  check(r.ok && dl[1] >= 0.15 && dl[2] >= 0.15 && Math.abs(dl[0]) <= 0.15 && xs.mix[3] < 0.25, `миссия 2: смесь — A ${P2(xs.mix[0])}% (${P2(dl[0])} п.п.), B ${P2(xs.mix[1])}% (+${P2(dl[1])}), C ${P2(xs.mix[2])}% (+${P2(dl[2])}), D ${P2(xs.mix[3])}% (${P2(dl[3])})`);
  check(/ставка сыграла/i.test(r.out) && /Почему D не выиграл/.test(r.out), 'ставка «малым датасетам» сыграла, разбор ведёт к роботу D');
  check(/де-нормализация/.test(await p.eval(`document.getElementById('xNative').textContent`)) && /клетка \(\d+, \d+\), захват 0/.test(await p.eval(`document.getElementById('xNative').textContent`)), 'родные действия: у B клетка и захват 0, как в описании');
  await shotSec(p, 'mix', 'l34-mix.png');
  // миссия 3: ось D — без выравнивания не засчитывается, с выравниванием — да
  await nextMission(p, '#xMis'); r = await viaUI(p, '#xMis', 1);
  check(!r.ok && /Переключи/.test(r.out), 'миссия 3: без выравнивания не засчитана, подсказка про переключатель');
  await p.eval(`document.querySelector('#xAlign button[data-v="1"]').click(); true`); await sleep(50);
  check(/обучи смесь заново/.test(await p.eval(`document.getElementById('xOut').textContent`)), 'после переключения оси результат смеси помечен устаревшим');
  r = await viaUI(p, '#xMis', 1);
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(r.ok && xs.align && xs.mix[3] >= 0.6 && Math.abs(xs.delta[0]) <= 0.15, `миссия 3: с выравниванием D ${P2(xs.mix[3])}%, A ${P2(xs.mix[0])}%`);
  check(/ставка сыграла/i.test(r.out), 'ставка «метки противоречат» сыграла');
  const ref = xs.ref; check(Array.isArray(ref) && ref[3] >= 0.6, 'полная смесь с выравниванием запомнена как опора: ' + ref.map(P2).join('/'));
  await shotSec(p, 'mix', 'l34-mix-align.png');
  // миссия 4: без данных A
  await nextMission(p, '#xMis');
  check(!(await p.eval(`document.getElementById('xWeights').hidden`)), 'ползунки весов появились в миссии 4');
  await p.eval(`(() => { const inp = document.getElementById('xW-a'); inp.value = 0; inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(50);
  r = await viaUI(p, '#xMis', 1);
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(r.ok && xs.wA === 0 && ref[2] - xs.mix[2] >= 0.15 && ref[3] - xs.mix[3] >= 0.15, `миссия 4: без A — B ${P2(xs.mix[1])}%, C ${P2(xs.mix[2])}%, D ${P2(xs.mix[3])}% против ${ref.slice(1).map(P2).join('/')} в полной смеси`);
  check(/ставка сыграла/i.test(r.out), 'ставка «все трое просядут» сыграла');
  // миссия 5: вес D ×10 роняет A, веса ×1 проходят
  await nextMission(p, '#xMis');
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(xs.w.join(',') === '1,1,1,10' && xs.align, 'миссия 5 стартует с весом D ×10 и выровненной осью');
  r = await viaUI(p, '#xMis', 1);
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(!r.ok && xs.mix[0] < 0.65 && /A упал/.test(r.out), `вес D ×10: A ${P2(xs.mix[0])}% — миссия не засчитана, подсказка про вес D`);
  check(/ставка сыграла/i.test(r.out) || /Ставка/.test(r.out) === false, 'ставка оценена при первом запуске');
  await p.eval(`window.__l34.LabMix.api.setWeights([1, 1, 1, 1]); true`);
  r = await viaUI(p, '#xMis', 1);
  xs = J(await p.eval(`JSON.stringify(window.__l34.LabMix.api.state())`));
  check(r.ok && xs.mix.every((v) => v >= 0.65), `веса ×1: все четыре не ниже 65% — ${xs.mix.map(P2).join('/')}`);
  await p.eval(`window.__l34.LabMix.api.setScene(7); true`); await sleep(100);
  await shotSec(p, 'mix', 'l34-mix-weights.png');

  // ---------- схема, квиз, глоссарий, консоль ----------
  const an = J(await p.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.1); const a = cv.toDataURL(); Anim.seek(cv, 5.3); const b = cv.toDataURL(); return { k: cv.dataset.anim, moves: a !== b, w: cv.width }; }))`));
  check(an.length === 1 && an[0].k === 'oxe' && an[0].moves && an[0].w > 600, 'схема oxe движется: разные кадры в 1,1 с и 5,3 с, широкая раскладка');
  await shotSec(p, 'models', 'l34-flow.png', '#models .flow-card');
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные (' + await p.eval(`document.querySelectorAll('.gl').length`) + ' шт.)');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 1, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await shotSec(p, 'mix', 'l34-mix-dark.png');
  await shotSec(p, 'results', 'l34-tables-dark.png');
  await shotSec(p, 'models', 'l34-flow-dark.png', '#models .flow-card');

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l34.SPEED.k = 20; true');
  await m.eval(`window.__l34.LabTables.api.open('t1').then(() => true)`, true);
  await m.eval(`window.__l34.LabMix.api.trainOwn().then(() => window.__l34.LabMix.api.trainMix()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const labs = J(await m.eval(`JSON.stringify([...document.querySelectorAll('.lab')].map((l) => ({ w: Math.round(l.getBoundingClientRect().width), pw: Math.round(l.parentElement.getBoundingClientRect().width) })))`));
  check(labs.length === 2 && labs.every((l) => l.w <= l.pw), 'ни одна .lab не шире своей карточки: ' + labs.map((l) => l.w + '/' + l.pw).join(', '));
  const anm = J(await m.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => ({ layout: cv.dataset.layout, w: Math.round(cv.getBoundingClientRect().width) })))`));
  check(anm[0].layout === 'n' && anm[0].w <= 390, 'схема на телефоне — узкая раскладка: ' + JSON.stringify(anm[0]));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, n, sel] of [['format', 'l34-m-format.png', '#fmtSort'], ['models', 'l34-m-flow.png', '#models .flow-card'], ['results', 'l34-m-tables.png'], ['mix', 'l34-m-mix.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel || '#' + id + ' .lab', 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
