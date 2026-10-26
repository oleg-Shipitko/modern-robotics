// Урок 4.4 «Обучение на видео людей»: лаборатории и интерактив дают обещанные в тексте исходы, миссии проходятся через
// интерфейс, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l44-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-26 python3 lessons/build.py l44.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-4-video-lyudey.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const pc = (v) => Math.round(v * 100);
const norm = (s) => s.replace(/[  ]/g, ' ');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 1600 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: norm(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(norm);
const clickSeg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const chain = (p, ids) => p.eval(`(() => { document.getElementById('pReset').click(); ${JSON.stringify(ids)}.forEach((id) => document.querySelector('#pPool .pl-step[data-id="' + id + '"]').click()); return true; })()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.3: три вопроса');
  check(await p.eval(`!!document.querySelector('#finale a[href="4-5-simulyatsiya.html"]')`), 'ссылка «Дальше» на урок 4.5 на месте: он выходит в тот же день');
  await p.eval('window.__l44.SPEED.k = 20; true');

  // ---------- схемы ----------
  for (const [kind, ts, sel, shot] of [['ego2act', [1, 3.5, 6], '#actions .flow-card', 'l44-ego2act.png'], ['cotrain', [1, 2.6, 4.4], '#egomimic .flow-card', 'l44-cotrain.png']]) {
    const a = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); const f = (t) => { Anim.seek(cv, t); return cv.toDataURL(); }; const fr = ${JSON.stringify(ts)}.map(f); return JSON.stringify({ ab: fr[0] !== fr[1], bc: fr[1] !== fr[2] }); })()`));
    check(a.ab && a.bc, `схема ${kind} движется: кадры в ${ts.join('; ')} с разные`);
    await p.eval(`(() => { Anim.seek(document.querySelector('canvas[data-anim="${kind}"]'), ${ts[1]}); return true; })()`);
    await p.shotEl(out(shot), sel, 6);
  }

  // ---------- лаборатория 1: ретаргетинг ----------
  console.log('лаборатория 1');
  let r = await viaUI(p, '#rMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /кисть Ады оказалась в 17 см от чашки/.test(r.out), 'миссия 1: углы суставов один в один — кисть в 17 см от чашки, ставка «звенья другой длины» сыграла');
  await p.eval(`document.getElementById('retarget').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-retarget.png'), '#retarget .lab', 6);
  await nextMission(p, '#rMis'); await sleep(100);
  const vis1 = J(await p.eval(`JSON.stringify({ mode: !document.getElementById('wrapRMode').hidden, slow: !document.getElementById('wrapRSlow').hidden, clip: document.getElementById('wrapRClip').hidden, run: document.getElementById('wrapRRun').hidden })`));
  check(vis1.mode && vis1.slow && vis1.clip && vis1.run, 'миссия 2: видны только способ ретаргетинга и замедление');
  await clickSeg(p, '#rMode', 'shoulder'); await setRange(p, '#rSlow', 4);
  r = await viaUI(p, '#rMis');
  check(!r.ok && /Пальцы Ады задели стол: в момент захвата кисть в 20 см от чашки/.test(r.out), 'миссия 2: «от плеча» ×4 — кисть в 20 см от чашки, не засчитано');
  await clickSeg(p, '#rMode', 'table'); await setRange(p, '#rSlow', 3);
  r = await viaUI(p, '#rMis');
  check(!r.ok && /Чашка задела полку: Ада отставала от пути до 16 см/.test(r.out), 'миссия 2: «от стола» ×3 — чашка задела полку (отставание 16 см)');
  await setRange(p, '#rSlow', 4);
  r = await viaUI(p, '#rMis');
  check(r.ok && /При ×4 Ада отставала от пути не больше чем на 2 см, а при ×3 отставала до 16 см/.test(r.out), 'миссия 2: «от стола» ×4 — чашка на полке, отставание 2 см против 16 при ×3');
  const log = await text(p, '#rMis .m-log');
  check((log.match(/от плеча, ×4|от стола, ×3|от стола, ×4/g) || []).length === 3, 'журнал попыток миссии 2: три прогона');
  await nextMission(p, '#rMis'); await sleep(100);
  r = await viaUI(p, '#rMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && /15 см/.test(r.out), 'миссия 3: банка — не хватает раскрытия захвата (ставка «пальцы»)');
  await p.eval(`document.getElementById('retarget').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-retarget-jar.png'), '#retarget .lab', 6);
  await nextMission(p, '#rMis'); await sleep(100);
  check(!(await p.eval(`document.getElementById('wrapRRun').hidden`)), 'свободный режим: кнопка запуска под сценой');
  await clickSeg(p, '#rClip', 'far');
  const far = [];
  for (const [m, s] of [['table', 4], ['table', 6], ['shoulder', 6], ['joints', 6]]) {
    await clickSeg(p, '#rMode', m); await setRange(p, '#rSlow', s);
    await p.eval(`window.__l44.Retarget.api.run().then(() => true)`, true);
    far.push(J(await p.eval(`JSON.stringify((({ ok, why, out }) => ({ ok, why, out }))(window.__l44.Retarget.st.run))`)));
  }
  check(far.every((q) => !q.ok) && far[0].why === 'reach' && far[0].out > 0.3, `свободный режим: дальний край полки не повторить ни при каких настройках (от стола ×4: ${pc(far[0].out)}% пути вне досягаемости)`);
  const stR = await text(p, '#rStatR');
  check(/дальше, чем дотягивается рука Ады/.test(await p.eval(`(() => { window.__l44.Retarget.api.set({ mode: 'table', slow: 4 }); return window.__l44.Retarget.api.run().then(() => document.getElementById('rStatR').textContent); })()`, true)) || /дотягивается/.test(stR), 'подпись под сценой Ады называет причину: досягаемость');

  // ---------- лаборатория 2: смесь ----------
  console.log('лаборатория 2');
  r = await viaUI(p, '#mMis', 2);
  const m1 = r.out.match(/модель только на роботе берёт кубик в (\d+)% попыток, смесь — в (\d+)%/);
  check(r.ok && /ставка сыграла/i.test(r.out) && m1 && m1[1] === '36' && m1[2] === '52', `миссия 1: только робот ${m1 && m1[1]}%, смесь ${m1 && m1[2]}% в новых кухнях (в тексте: 36% и 52%)`);
  check(/почти не ошибаются: 100% и 98%/.test(r.out), 'миссия 1: в кухнях лаборатории 100% и 98%');
  await p.eval(`document.getElementById('mix').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-mix.png'), '#mix .lab', 6);
  await nextMission(p, '#mMis');
  r = await viaUI(p, '#mMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /Без выравнивания — 23% в новых кухнях против 36% у одного робота и 52% с выравниванием, а в кухнях лаборатории — 48% против 100%/.test(r.out), 'миссия 2: без выравнивания 23% (лаборатория 48%)');
  const dy = r.out.match(/в среднем на ([\d,]+) см ближе к человеку/);
  check(dy && parseFloat(dy[1].replace(',', '.')) > 1, 'миссия 2: модель без выравнивания берёт ближе к человеку: ' + (dy && dy[1]) + ' см');
  await p.eval(`document.getElementById('mix').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-mix-raw.png'), '#mix .lab', 6);
  await nextMission(p, '#mMis');
  check(!(await p.eval(`document.getElementById('wrapMChart').hidden`)) && /Нажми «Построить кривую»/.test(await text(p, '#mChart')), 'миссия 3: пустой график подсказывает, что нажать');
  r = await viaUI(p, '#mMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /Только робот — 36%, четверть времени на видео людей — 49%, половина — 52%, три четверти — 54%, 90% — 39%, всё время — 22%/.test(r.out), 'миссия 3: кривая 36, 49, 52, 54, 39, 22%');
  check(/Лучше всего 75%: 6 демонстраций робота и 175 видео/.test(r.out) && /сдвиг на 2 клетки вместо одной/.test(r.out), 'миссия 3: максимум при 75%, при 90% поправка неточная');
  await p.eval(`document.getElementById('mix').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-mix-curve.png'), '#mix .lab', 6);
  await nextMission(p, '#mMis');
  await p.eval(`window.__l44.Mix.api.setRight(0.25, false).then(() => true)`, true);
  const free = J(await p.eval(`JSON.stringify(window.__l44.Mix.api.state())`));
  check(free.right === '0.25|0' && !free.busy, 'свободный режим: правая модель обучается заново по ползунку и переключателю');
  const mixT = await text(p, '#mix');
  check(/36%/.test(mixT) && /33–36%/.test(mixT) && /46–53%/.test(mixT), '«Под капотом» лаборатории 2 согласован с миссиями');

  // ---------- интерактив: конвейер ----------
  console.log('интерактив');
  await chain(p, ['slam', 'hands', 'joints', 'frame', 'grip']);
  r = await viaUI(p, '#pMis');
  check(!r.ok && /углы суставов один в один/.test(r.out), 'миссия 1: цепочка с углами один в один не засчитана');
  await chain(p, ['frame', 'slam', 'hands', 'grip']);
  r = await viaUI(p, '#pMis');
  check(!r.ok && /Порядок нарушен/.test(r.out) && (await p.eval(`document.querySelectorAll('#pChain li.bad').length`)) === 1, 'миссия 1: перевод в систему камеры раньше SLAM — порядок нарушен, шаг отмечен');
  await chain(p, ['hands', 'slam', 'frame', 'grip']);
  r = await viaUI(p, '#pMis');
  check(r.ok, 'миссия 1: SLAM, трекер, система камеры, раскрытие — засчитано');
  await nextMission(p, '#pMis'); await sleep(100);
  await p.eval(`(() => { ['norm', 'mask'].forEach((id) => document.querySelector('#pPool .pl-step[data-id="' + id + '"]').click()); return true; })()`);
  r = await viaUI(p, '#pMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && /79 баллов вместо 128/.test(r.out), 'миссия 2: рецепт EgoMimic, ставка «нормировка» сыграла');
  await nextMission(p, '#pMis'); await sleep(100);
  await p.eval(`(() => { ['tips', 'slow', 'jitter'].forEach((id) => document.querySelector('#pPool .pl-step[data-id="' + id + '"]').click()); return true; })()`);
  r = await viaUI(p, '#pMis');
  check(r.ok && /1 удачный захват из 10/.test(r.out), 'миссия 3: рецепт HAT засчитан');
  await p.eval(`document.getElementById('pipeline').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l44-pipeline.png'), '#pipeline .lab', 6);

  // ---------- тексты совпадают с расчётом ----------
  const fin = await text(p, '#finale');
  check(fin.includes('увели кисть на 17 см') && fin.includes('52% в новых кухнях против 36%') && fin.includes('без выравнивания — 23%') && fin.includes('одни видео людей — 22%'), 'итоги урока называют числа лабораторий');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`window.__l44.Retarget.api.set({ clip: 'cup', mode: 'table', slow: 4 }); window.__l44.Retarget.api.run().then(() => true)`, true);
  for (const [id, sel, n] of [['retarget', '#retarget .lab', 'l44-retarget-dark.png'], ['mix', '#mix .lab', 'l44-mix-dark.png']]) {
    await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
  }
  await p.eval(`(() => { Anim.seek(document.querySelector('canvas[data-anim="ego2act"]'), 3.5); return true; })()`); await p.shotEl(out('l44-ego2act-dark.png'), '#actions .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l44.SPEED.k = 20; true');
  await m.eval(`window.__l44.Retarget.api.set({ clip: 'cup', mode: 'table', slow: 4 }); window.__l44.Retarget.api.run().then(() => window.__l44.Mix.api.first()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['actions', '#actions .flow-card', 'l44-m-ego2act.png'], ['egomimic', '#egomimic .flow-card', 'l44-m-cotrain.png'], ['retarget', '#retarget .lab', 'l44-m-retarget.png'], ['mix', '#mix .lab', 'l44-m-mix.png'], ['pipeline', '#pipeline .lab', 'l44-m-pipeline.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    if (id === 'actions' || id === 'egomimic') await m.eval(`(() => { Anim.seek(document.querySelector('#${id} canvas[data-anim]'), 3.5); return true; })()`);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
