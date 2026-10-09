// Урок 5.1 «Основы RL: награда, ценность, преимущество»: интерактив и лаборатории дают обещанные в тексте исходы,
// миссии проходятся через интерфейс (ставка, кнопка, ползунки, рисование мышью), числа в тексте совпадают с движком,
// схемы движутся, консоль чиста, телефон без горизонтальной прокрутки, тёмная тема. Снимки — shots/l51-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-11-14 python3 lessons/build.py l51.
const path = require('path');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l51/engine.js');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-1-osnovy-rl.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ');
const ru = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия, и текст итога. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
/** Итог живой миссии: критерии и разбор (если засчитана). */
const liveState = (p, mis) => p.eval(`JSON.stringify((() => { const root = document.querySelector('${mis}'); const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className); return { crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' }; })())`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const slide = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
/** Нарисовать прогноз мышью: события указателя по графику через точки (шаг t, значение). */
const drawForecast = (p, vals) => p.eval(`(async () => {
  const cv = document.getElementById('fcCv'), F = window.__l51.Forecast, st = F.st, R = { g09: [0, 10.5], g05: [0, 10.5], steps: [-12, 0.6] }[st.kind];
  cv.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60));
  const rc = cv.getBoundingClientRect(), W = 440, H = 320, L = 50, Rr = 16, T = 26, B = 92, n = ${vals.length};
  const at = (t, v) => ({ clientX: rc.left + (L + (W - L - Rr) * (t + 0.5) / n) / W * rc.width, clientY: rc.top + (T + (H - T - B) * (1 - (v - R[0]) / (R[1] - R[0]))) / H * rc.height });
  const vals = ${JSON.stringify(vals)}, ev = (type, q) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1 }, q)));
  ev('pointerdown', at(0, vals[0])); for (let t = 1; t < n; t++) ev('pointermove', at(t, vals[t])); ev('pointerup', at(n - 1, vals[n - 1]));
  return JSON.stringify(st.pred);
})()`, true).then(J);
/** Нажать на клетку плана (i, j) на канвасе. */
const clickCell = (p, sel, i, j) => p.eval(`(() => { const cv = document.querySelector('${sel}'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + (${i} + 0.5) / 12 * r.width, clientY: r.top + (${j} + 0.5) / 8 * r.height })); return true; })()`);

let Bglob = null;
(async () => {
  // ---------- числа движка, на которые опирается текст ----------
  const Wd = E.world({ dry: true }), vi9 = E.valueIteration(Wd, 0.9), F9 = E.forecast('g09'), F5 = E.forecast('g05'), FS = E.forecast('steps');
  const reach = E.firstNonzero(vi9.hist, E.START), last = E.lastChange(vi9.hist), habit = E.rollout(Wd, E.habitPolicy(), 0.9, E.START, 80), PI = E.policyIteration(Wd, E.habitPolicy(), 0.9);
  const thP = E.threshold((x) => E.viaPuddle({ puddle: -x }, 0.99), 0, 3), thC = E.threshold((x) => E.viaPuddle({ step: -x }, 0.99), 0, 2), thR = E.threshold((x) => E.viaPuddle({ goal: x }, 0.99), 1, 100), thG = E.threshold((g) => E.viaPuddle({}, g), 0.5, 0.99);
  const gLow = (() => { let a = 0.05, b = 0.3; const f = (g) => 10 * g * (1 - g * g) - 1; for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (f(m) > 0) b = m; else a = m; } return (a + b) / 2; })();
  console.log('движок');
  check(E.FREE.length === 71, 'свободных клеток 71 (в тексте раздела 2): ' + E.FREE.length);
  check(reach === 12 && last === 16 && vi9.iters === 17, `волна: до кровати на итерации ${reach}, последнее изменение ${last}, итераций ${vi9.iters}`);
  check(Math.abs(F9.G[0] - vi9.V[E.START]) < 1e-12 && ru(F9.G[0], 2) === '3,14', 'отдача с первого шага в прогнозе = V* у кровати = 3,14');
  check(habit.steps === 18 && ru(habit.ret, 2) === '1,67', `привычная Ада: ${habit.steps} шагов, отдача ${ru(habit.ret, 2)}`);
  check(PI.length === 7 && PI.map((r) => r.changed).join(',') === '15,7,4,11,3,1,0', 'итерация политики: переключено 15, 7, 4, 11, 3, 1 клеток, седьмая оценка без улучшений');
  check(ru(thP, 3) === '0,197' && ru(thC, 3) === '0,412' && ru(thR, 1) === '50,8' && ru(thG, 3) === '0,946' && ru(gLow, 2) === '0,10', `пороги лужи: ${ru(thP, 3)}, шаг ${ru(thC, 3)}, плита ${ru(thR, 1)}, γ от ${ru(gLow, 2)} до ${ru(thG, 3)}`);
  const hl = (g) => Math.log(2) / Math.log(1 / g);
  check(ru(hl(0.9), 1) === '6,6' && Math.round(hl(0.99)) === 69 && ru(hl(0.9), 2) === '6,58' && ru(hl(0.99), 2) === '68,97' && Math.round(hl(0.9988)) === 577, 'половина веса: 6,6 (6,58), 69 (68,97) и 577 шагов');

  const B = Bglob = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.6: три вопроса');
  check(await p.eval(`!!document.querySelector('#finale a[href="5-2-ppo.html"]')`), 'ссылка на урок 5.2 есть (5.2 выходит в тот же день, блок <!--if--> оставлен)');
  check(/Policy gradient|градиент политики/.test(await text(p, '#finale .bridge')) && /5\.2/.test(await text(p, '#finale .bridge')), 'в итогах — абзац-мост в урок 5.2');
  await p.eval('window.__l51.SPEED.k = 20; true');

  // ---------- схемы ----------
  for (const [id, a, b, sel] of [['loop', 2, 9.5, '#mdp .flow-card'], ['backup', 2, 7.5, '#bellman .flow-card']]) {
    const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
    check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
    await p.shotEl(out(`l51-${id}.png`), sel, 6);
  }
  const bk = J(await p.eval(`JSON.stringify(window.__l51.BACKUP)`));
  check(Math.abs(bk.v - vi9.V[E.DOOR]) < 1e-12 && ru(bk.v, 2) === '7,29' && bk.best === 0 && ru(bk.nb[0].v, 2) === '8,10', 'схема пересчёта: соседи и итог 7,29 — из итерации ценности');

  // ---------- интерактив: прогноз отдачи ----------
  console.log('прогноз');
  const lin = F9.G.map((_, t) => F9.G[0] + (10 - F9.G[0]) * t / 11);
  let pred = await drawForecast(p, lin);
  check(pred.every((v) => v != null), 'прогноз рисуется мышью: заполнены все 12 шагов');
  let r = await viaUI(p, '#fcMis');
  check(!r.ok && /допуске 0,4/.test(r.out), 'прямая вместо степенной кривой не проходит: ' + r.out.slice(0, 60));
  await p.eval(`document.getElementById('forecast').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l51-forecast-miss.png'), '#forecast .lab', 6);
  await drawForecast(p, F9.G.map((v) => v + 0.15));
  r = await viaUI(p, '#fcMis');
  check(r.ok && /10 · 0,9¹¹/.test(r.out) && r.out.includes(`— ${ru(F9.G[0], 2)},`), 'миссия 1: степенная кривая проходит, разбор называет 3,14 = 10 · 0,9¹¹');
  await p.shotEl(out('l51-forecast.png'), '#forecast .lab', 6);
  await nextMission(p, '#fcMis');
  await drawForecast(p, F9.G);
  r = await viaUI(p, '#fcMis');
  check(!r.ok, 'миссия 2: кривая для γ = 0,9 не подходит для γ = 0,5');
  await drawForecast(p, F5.G);
  r = await viaUI(p, '#fcMis');
  check(r.ok && r.out.includes(ru(F5.G[0], 3)) && /тремя — 1,25/.test(r.out), 'миссия 2: при γ = 0,5 у кровати 0,005, тремя шагами раньше плиты 1,25');
  await nextMission(p, '#fcMis');
  await drawForecast(p, FS.G);
  r = await viaUI(p, '#fcMis');
  check(r.ok && /у кровати −11/.test(r.out) && /последнего шага — 0/.test(r.out), 'миссия 3: награда как у π*0.6 — прямая от −11 до 0');

  // ---------- лаборатория 1: итерация ценности ----------
  console.log('лаборатория 1');
  check(!(await visible(p, '#viPaneR')) && !(await visible(p, '#wrapViRew')) && !(await visible(p, '#wrapViStep')), 'миссия 1: правая сцена, ползунки и кнопки итераций скрыты');
  r = await viaUI(p, '#viMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes('на итерации 12, а от Ады до плиты как раз 12 шагов') && r.out.includes('на итерации 16') && r.out.includes('Итерация 17 не изменила') && r.out.includes('— 3,14'), 'миссия 1: волна — 12 итераций до кровати, последнее изменение на 16-й, итерация 17 без изменений, 3,14');
  check(r.out.includes('(0, 7) в нижней спальне'), 'миссия 1: дальше всех — угол нижней спальни (0, 7)');
  await p.eval(`document.getElementById('iterate').scrollIntoView({ behavior: 'instant' }); true`); await sleep(250); await p.shotEl(out('l51-iterate-wave.png'), '#iterate .lab', 6);
  await clickCell(p, '#viCvL', 8, 3); await sleep(80);
  check(/\(8, 3\), кухня: сейчас V = 7,29 \(итерация 17\), оценки сошлись.*вверх: 0 \+ 0,90 × 8,10 = 7,29 ← наибольшее/.test(await text(p, '#viOut')), 'отладчик: пересчёт клетки (8, 3) по уравнению Беллмана — 7,29, как на схеме');
  await nextMission(p, '#viMis');
  check(await visible(p, '#viPaneR'), 'миссия 2: две сцены рядом');
  r = await viaUI(p, '#viMis', 2);
  check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes('Слева Ада едет через лужу, 12 шагов, справа — вокруг стола, 14 шагов'), 'миссия 2: γ = 0,5 — через лужу, 12 шагов; γ = 0,99 — в объезд, 14 шагов');
  check(['1,00', '0,31', '8,72', '9,51', '0,0039', '8,78'].every((x) => r.out.includes(x)), 'миссия 2: числа у двери (1,00/0,31, 8,72/9,51) и у кровати (0,0039, 8,78)');
  await p.eval(`document.getElementById('iterate').scrollIntoView({ behavior: 'instant' }); true`); await sleep(250); await p.shotEl(out('l51-iterate.png'), '#iterate .lab', 6);
  await nextMission(p, '#viMis');
  check(await visible(p, '#wrapViRew'), 'миссия 3: ползунки наград видны');
  await slide(p, '#viPuddle', -0.2); await sleep(80);
  check(!(await liveState(p, '#viMis')).ok, 'лужа −0,2: дальновидная Ада ещё объезжает (порог 0,197)');
  await slide(p, '#viPuddle', -0.1); await sleep(80);
  let ls = await liveState(p, '#viMis');
  check(ls.ok && ls.out.includes('дешевле 0,197') && ls.out.includes('дороже 0,41') && ls.out.includes('50,8'), 'миссия 3: лужа −0,1 — через лужу, разбор называет пороги 0,197, 0,41, 50,8');
  await nextMission(p, '#viMis');
  check((await visible(p, '#wrapViGamma')) && (await visible(p, '#wrapViStep')), 'свободный режим: γ и кнопки итераций видны');
  await p.click('#viDef'); await sleep(50);
  await slide(p, '#viGR', 0.94); await sleep(50);
  const g94 = J(await p.eval(`JSON.stringify(window.__l51.VI.api.state())`));
  await slide(p, '#viGR', 0.95); await sleep(50);
  const g95 = J(await p.eval(`JSON.stringify(window.__l51.VI.api.state())`));
  check(g94.R.puddle && !g95.R.puddle, 'свободный режим: γ = 0,94 — через лужу, 0,95 — в объезд (порог 0,946 в «Под капотом»)');
  await p.click('#viZero'); for (let q = 0; q < 3; q++) { await p.click('#viOne'); await sleep(30); }
  check(/итерация 3 /.test(await text(p, '#viIter')), 'кнопки отладчика: обнулить и три итерации — ' + (await text(p, '#viIter')).slice(0, 70));
  const deep1 = await text(p, '#iterate .deep');
  check(['0,197', '0,412', '50,8', '0,946', '0,10'].every((x) => deep1.includes(x)), '«Под капотом» лаборатории 1: пороги совпадают с движком');

  // ---------- лаборатория 2: преимущество ----------
  console.log('лаборатория 2');
  check(!(await visible(p, '#wrapAvFree')), 'миссии: кнопки свободного режима скрыты');
  r = await viaUI(p, '#avMis', 1);
  const npos = J(await p.eval(`JSON.stringify(window.__l51.AV.api.state())`)).npos;
  check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`Зелёных стрелок — ${npos}`) && r.out.includes('(4, 2) в гостиной: «вправо» с A = +1,20') && r.out.includes('18 шагов, отдача от кровати 1,67'), `миссия 1: у привычного действия A = 0, зелёных стрелок ${npos}, на маршруте — (4, 2) «вправо» +1,20`);
  await p.eval(`document.getElementById('adv').scrollIntoView({ behavior: 'instant' }); true`); await sleep(250); await p.shotEl(out('l51-adv.png'), '#adv .lab', 6);
  await nextMission(p, '#avMis');
  await clickCell(p, '#avCv', 4, 2); await sleep(60);
  check(/\(4, 2\) в гостиной: привычно — вверх, V = 2,29/.test(await text(p, '#avCell')), 'клетка (4, 2): привычно «вверх», V = 2,29');
  await p.eval(`document.querySelector('#avCell button[data-a="1"]').click(); true`); await sleep(80);
  ls = await liveState(p, '#avMis');
  const sw = J(await p.eval(`JSON.stringify(window.__l51.AV.st.lastSwitch)`));
  check(ls.ok && ls.out.includes('с 1,67 до 2,54') && ls.out.includes('14 шагов вместо 18') && sw.worse === 0, 'миссия 2: «вправо» в (4, 2) — отдача 1,67 → 2,54, 14 шагов, ни одна ценность не упала');
  await nextMission(p, '#avMis');
  r = await viaUI(p, '#avMis', 1);
  check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes('Раундов с переключениями — 6: 15, 7, 4, 11, 3, 1 клеток') && r.out.includes('1,67 → 2,54 → 3,14') && r.out.includes('Уже после раунда 2'), 'миссия 3: 6 раундов, 15, 7, 4, 11, 3, 1 клеток, отдача 1,67 → 2,54 → 3,14');
  await p.shotEl(out('l51-adv-done.png'), '#adv .lab', 6);
  await nextMission(p, '#avMis');
  check(await visible(p, '#wrapAvFree'), 'свободный режим: кнопки раунда и сброса видны');

  // ---------- тексты совпадают с расчётом ----------
  const fin = await text(p, '#finale');
  check(['3,14 из 10', 'за 12 итераций', 'после 16-й', '75%', '2%', 'с 18 шагов и отдачи 1,67 до 12 шагов и 3,14'].every((x) => fin.includes(x)), 'итоги урока называют числа лабораторий');
  check((await text(p, '#iterateAfter')).includes('75% награды, дальновидной — 2%'), 'вывод лаборатории 1: 1 − 0,5² = 75%, 1 − 0,99² ≈ 2%');
  check((await text(p, '#mdp')).includes('свободных клеток 71') && (await text(p, '#adv .lab-intro')).includes('18 шагов вместо 12'), 'раздел 2 и вступление лаборатории 2: 71 клетка, 18 шагов вместо 12');
  check((await text(p, '#return')).includes('примерно через 6,6, при 0,99 — через 69') && (await text(p, '#forecast .deep')).includes('6,58 при 0,9, 68,97 при 0,99 и 577'), 'половина веса в тексте совпадает с формулой');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 30, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  for (const [id, sel, n] of [['forecast', '#forecast .lab', 'l51-forecast-dark.png'], ['iterate', '#iterate .lab', 'l51-iterate-dark.png'], ['adv', '#adv .lab', 'l51-adv-dark.png'], ['mdp', '#mdp .flow-card', 'l51-loop-dark.png'], ['bellman', '#bellman .flow-card', 'l51-backup-dark.png']]) {
    await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
  }
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l51.SPEED.k = 20; true');
  await drawForecast(m, F9.G);
  r = await viaUI(m, '#fcMis');
  check(r.ok, 'телефон: прогноз рисуется пальцем по графику и проходит');
  r = await viaUI(m, '#viMis', 1); await nextMission(m, '#viMis'); r = await viaUI(m, '#viMis', 2);
  check(r.ok && (await visible(m, '#viPaneR')), 'телефон: миссии 1–2 лаборатории 1 через интерфейс, две сцены одна под другой');
  r = await viaUI(m, '#avMis', 1);
  check(r.ok, 'телефон: миссия 1 лаборатории 2 через интерфейс');
  await m.eval(`window.__l51.AV.api.select(${E.id(4, 2)}); true`);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
  check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['mdp', '#mdp .flow-card', 'l51-m-loop.png'], ['forecast', '#forecast .lab', 'l51-m-forecast.png'], ['bellman', '#bellman .flow-card', 'l51-m-backup.png'], ['iterate', '#iterate .lab', 'l51-m-iterate.png'], ['adv', '#adv .lab', 'l51-m-adv.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch(async (e) => { console.error(e); if (Bglob) await Bglob.close(); process.exit(1); });
