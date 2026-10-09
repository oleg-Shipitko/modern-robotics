// Урок 5.4 «Перенос из симуляции: рандомизация»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l54-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-14 python3 lessons/build.py l54.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-4-perenos-iz-simulyatsii.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2212\u2014]/g, '-');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
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
/** Живая миссия: дождаться, пока критерии станут ✓, вернуть разбор. */
async function liveDone(p, mis, timeout) {
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 60000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const clickWait = async (p, sel, idle) => { await p.click(sel); await sleep(80); await p.waitFor(idle, 60000); await sleep(80); };
/** Нажать на клетку карты миров (i — столбец, j — строка снизу) настоящим событием мыши по координатам канваса. */
const clickCell = (p, cv, i, j) => p.eval(`(() => {
  const cv = document.querySelector('${cv}'), r = cv.getBoundingClientRect(), narrow = r.width < 460, W = narrow ? 380 : 560, H = narrow ? 300 : 330, L = narrow ? 56 : 58, R = 10, T = 12, B = narrow ? 40 : 42;
  const gw = W - L - R, gh = H - T - B, x = L + gw / 9 * (${i} + 0.5), y = T + gh - gh / 7 * (${j} + 0.5);
  cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x / W * r.width, clientY: r.top + y / H * r.height })); return true; })()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.3: три вопроса');
    check(await p.eval(`!document.querySelector('a[href^="5-5"]')`), 'на дату 14.11 ссылки на урок 5.5 нет: блок <!--if--> вырезан при сборке');
    const bridge = await text(p, '#finale .bridge');
    check(/5\.5/.test(bridge) && /привилегированной информацией/.test(bridge) && /в каком мире/.test(bridge), 'в итогах — абзац-мост в 5.5 «Обучение с привилегированной информацией»');
    await p.eval("window.__l54.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['gaploop', 'gap', 1.2, 7.5], ['adrloop', 'auto', 1.0, 8.2]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await p.shotEl(out(`l54-${id}.png`), `#${sec} .flow-card`, 6);
    }

    // ---------- интерактив: карта миров ----------
    console.log('карта миров');
    check(!(await visible(p, '#wrapPAxes')), 'миссия 1: переключатель карты скрыт до свободного режима');
    await p.eval(`document.getElementById('probe').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l54-probe-empty.png'), '#probe .lab', 6);
    const idleP = '!window.__l54.Probe.st.busy';
    let r = await viaUI(p, '#pMis', 1);
    const p1 = r.out.match(/Кружка 1 кг без задержки: (\d+) удачных попыток из 20\. Чашка 0,25 кг с задержкой 40 мс: (\d+) из 20\..*?в конце он в ([\d,]+) см/);
    check(r.ok && /ставка сыграла/i.test(r.out) && p1 && p1[1] === '20' && p1[2] === '9' && p1[3] === '3,3', `миссия 1: кружка 1 кг — ${p1 && p1[1]}/20, задержка 40 мс — ${p1 && p1[2]}/20, в конце ${p1 && p1[3]} см`);
    await p.shotEl(out('l54-probe-both.png'), '#probe .lab', 6);
    await nextMission(p, '#pMis');
    for (const i of [2, 3, 4]) { await clickCell(p, '#pMap', i, 1); await sleep(80); await p.waitFor(idleP, 30000); }
    r = await liveDone(p, '#pMis', 10000);
    const p2 = r.out.match(/Граница - между (\d+) и (\d+) мс: (\d+) и (\d+) удачных/);
    check(r.ok && p2 && p2[1] === '30' && p2[2] === '40' && p2[3] === '17' && p2[4] === '9', `миссия 2 засчитана нажатиями по карте: граница ${p2 && p2[1]}–${p2 && p2[2]} мс (${p2 && p2[3]} и ${p2 && p2[4]} из 20)`);
    await nextMission(p, '#pMis');
    check(await visible(p, '#wrapPAxes'), 'свободный режим: переключатель карты виден');
    await p.eval(`document.querySelector('#pAxes button[data-v="sf"]').click(); true`); await sleep(100);
    await clickWait(p, '#pAll', idleP); await sleep(200);
    const sf = await p.eval(`JSON.stringify(window.__l54.Probe.st.open.sf)`).then(J);
    const col = (i) => [0, 1, 2, 3, 4, 5, 6].map((j) => sf[i + ',' + j].rate);
    check(Object.keys(sf).length === 63 && col(2).every((v) => v === 1) && Math.round(sf['6,0'].rate * 100) === 85 && Math.round(sf['7,0'].rate * 100) === 55,
      `свободный режим: при моторах 100% все строки трения — 100%; моторы 60% — ${Math.round(sf['6,0'].rate * 100)}%, 50% — ${Math.round(sf['7,0'].rate * 100)}%`);
    await p.shotEl(out('l54-probe-sf.png'), '#probe .lab', 6);
    const prDeep = await text(p, '#probe .deep');
    check(['90–100%', '30–55%', '40–50 мс', '70–85%', '45–65%'].every((x) => prDeep.includes(x)), '«Под капотом» карты миров: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- лаборатория 1: с рандомизацией и без ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapCSeed')), 'миссия 1: выбор зерна скрыт');
    await p.eval(`document.getElementById('compare').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l54-compare-empty.png'), '#compare .lab', 6);
    r = await viaUI(p, '#cMis', 2);
    const c1 = r.out.match(/без рандомизации удержала чашку в (\d+)% попыток, с рандомизацией - в (\d+)%/);
    check(r.ok && /ставка сыграла/i.test(r.out) && c1 && c1[1] === '78' && c1[2] === '99', `миссия 1: без рандомизации ${c1 && c1[1]}%, с рандомизацией ${c1 && c1[2]}%`);
    await nextMission(p, '#cMis');
    await p.eval(`document.querySelector('#cArms .arm-row[data-arm="1"]').click(); true`); await sleep(100);
    check(!(await p.eval(`[...document.querySelectorAll('#cMis .m-crit li')].every((li) => li.className === 'ok')`)), 'миссия 2: рука 2 — ещё не та, где разница больше всего');
    await p.eval(`document.querySelector('#cArms .arm-row[data-arm="3"]').click(); true`);
    r = await liveDone(p, '#cMis', 10000);
    const c2 = r.out.match(/Ада 4 - медленная связь: задержка 45 мс\. Без рандомизации - (\d+) удачных попыток из 20, с рандомизацией - (\d+)/);
    check(r.ok && c2 && c2[1] === '7' && c2[2] === '19', `миссия 2 засчитана нажатием на строку: Ада 4 — ${c2 && c2[1]} и ${c2 && c2[2]} из 20`);
    await p.shotEl(out('l54-compare.png'), '#compare .lab', 6);
    await nextMission(p, '#cMis');
    r = await viaUI(p, '#cMis', 2);
    const c3 = r.out.match(/без рандомизации дорога до цели в среднем ([\d,]+) с, с рандомизацией - ([\d,]+) с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && c3 && c3[1] === '0,49' && c3[2] === '0,55', `миссия 3: в номинальном мире ${c3 && c3[1]} с без рандомизации против ${c3 && c3[2]} с`);
    await nextMission(p, '#cMis');
    check(await visible(p, '#wrapCSeed'), 'свободный режим: выбор зерна виден');
    await p.eval(`document.querySelector('#cSeed button[data-v="4"]').click(); true`);
    await clickWait(p, '#cSeedRun', '!window.__l54.Compare.st.busy'); await sleep(200);
    check(/Зерно 4: без рандомизации - 63% удачных попыток на шести руках, с рандомизацией - 97%/.test(await text(p, '#cOut')), 'свободный режим, зерно 4: ' + (await text(p, '#cOut')));
    const cDeep = await text(p, '#compare .deep');
    check(['48–88%', '97–100%', '10–50%'].every((x) => cDeep.includes(x)), '«Под капотом» лаборатории 1: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- лаборатория 2: ширина ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapWK')), 'миссии 1–2: ползунок ширины скрыт');
    await p.eval(`document.getElementById('width').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l54-width-empty.png'), '#width .lab', 6);
    r = await viaUI(p, '#wMis', 1);
    const w1 = r.out.match(/При ×½ - (\d+)% удачных попыток, без рандомизации - (\d+)%/);
    check(r.ok && /ставка сыграла/i.test(r.out) && w1 && w1[1] === '100' && w1[2] === '78', `миссия 1: ×½ — ${w1 && w1[1]}%, без рандомизации — ${w1 && w1[2]}%`);
    await p.shotEl(out('l54-width-half.png'), '#width .lab', 6);
    await nextMission(p, '#wMis');
    r = await viaUI(p, '#wMis', 1);
    const w2 = r.out.match(/При ×3 удачных попыток (\d+)% против (\d+)% при ×1, а дорога до цели - ([\d,]+) с против ([\d,]+) с, на (\d+)% дольше\. В номинальном мире - ([\d,]+) с против ([\d,]+) с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && w2 && w2[1] === '98' && w2[2] === '99' && w2[3] === '0,88' && w2[4] === '0,72' && w2[5] === '23' && w2[6] === '0,72' && w2[7] === '0,55',
      `миссия 2: ×3 — ${w2 && w2[1]}% и ${w2 && w2[3]} с, ×1 — ${w2 && w2[2]}% и ${w2 && w2[4]} с (+${w2 && w2[5]}%)`);
    await p.shotEl(out('l54-width-wide.png'), '#width .lab', 6);
    await nextMission(p, '#wMis');
    check(await visible(p, '#wrapWK'), 'свободный режим: ползунок ширины виден');
    await p.eval(`(() => { const e = document.getElementById('wK'); e.value = 3; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(100);
    await p.waitFor('!window.__l54.Width.st.busy', 60000); await sleep(150);
    const wOut = await text(p, '#wOut');
    check(/Ширина ×2: на шести настоящих руках удачных попыток 98%, дорога до цели в удачных - 0,80 с/.test(wOut), 'свободный режим, ×2: ' + wOut);
    const wDeep = await text(p, '#width .deep');
    check(['94–100%', '97–100%', '40–98%', '0,84–1,02 с', '0,69–0,78 с', 'в 3 попытках из 20'].every((x) => wDeep.includes(x)), '«Под капотом» лаборатории 2: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- лаборатория 3: ADR ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapAAt')) && !(await visible(p, '#wrapATh')), 'миссия 1: ползунок момента и порог скрыты');
    await p.eval(`document.getElementById('adr').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l54-adr-empty.png'), '#adr .lab', 6);
    r = await viaUI(p, '#aMis', 1);
    const a1 = r.out.match(/диапазон задержки - 0–(\d+) мс.*?остановилась на (\d+)%, масса чашки - на ([\d,]+) кг.*?На настоящих руках - (\d+)% удачных/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a1 && a1[1] === '75' && a1[2] === '63' && a1[3] === '0,78' && a1[4] === '100', `миссия 1: задержка до ${a1 && a1[1]} мс, моторы до ${a1 && a1[2]}%, чашка до ${a1 && a1[3]} кг, на руках ${a1 && a1[4]}%`);
    await p.shotEl(out('l54-adr.png'), '#adr .lab', 6);
    await nextMission(p, '#aMis');
    check(await visible(p, '#wrapAAt'), 'миссия 2: ползунок момента обучения виден');
    r = await viaUI(p, '#aMis', 2);
    const a2 = r.out.match(/ADR дошёл до 90% к (\d[\d ]*)-му шагу, диапазон ×3 - к (\d[\d ]*)-му\..*?К концу у ADR (\d+)% удачных попыток и ([\d,]+) с до цели, у ×3 - (\d+)% и ([\d,]+) с/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a2 && a2[1].replace(/ /g, '') === '4800' && a2[2].replace(/ /g, '') === '10800' && a2[4] === '0,68' && a2[6] === '0,80',
      `миссия 2: ADR — 90% к ${a2 && a2[1]}, ×3 — к ${a2 && a2[2]}; до цели ${a2 && a2[4]} с против ${a2 && a2[6]} с`);
    await p.shotEl(out('l54-adr-vs.png'), '#adr .lab', 6);
    await nextMission(p, '#aMis');
    check(await visible(p, '#wrapATh'), 'свободный режим: порог расширения виден');
    await p.eval(`document.querySelector('#aTh button[data-v="1"]').click(); true`); await sleep(50);
    await clickWait(p, '#aRun', '!window.__l54.Adr.st.busy'); await p.waitFor('window.__l54.Adr.st.at >= 24000', 30000); await sleep(150);
    const dHi1 = await p.eval(`window.__l54.Adr.st.runs['1'].R.d[1]`);
    check(/^Порог 100%/.test(await text(p, '#aOut')) && dHi1 <= 75, `свободный режим, порог 100%: задержка до ${dHi1} мс — не шире, чем при 80%`);
    const aDeep = await text(p, '#adr .deep');
    check(['3600–4800', '10 800–14 400', '97–100%', '93–100%', '0,68–0,73 с', '0,75–0,93 с', '75–150 мс', '63–81%', '0,6–0,78 кг'].every((x) => sp(aDeep).includes(sp(x))), '«Под капотом» лаборатории 3: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    check(['100% удачных', 'до 45%', '78% без рандомизации и 99% с ней', '0,55 с против 0,49 с', '0,88 с против 0,72 с', '4800-му шагу против 10 800', 'до 75 мс', 'на 63%', '67–89%'].every((x) => sp(fin).includes(sp(x))), 'итоги урока называют числа лабораторий и статей');
    const after = await text(p, '#probeAfter');
    check(after.includes('25–45 мс'), 'вывод после карты миров: задержки настоящих рук 25–45 мс');

    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 15 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
    for (const [id, sel, n] of [['probe', '#probe .lab', 'l54-probe-dark.png'], ['compare', '#compare .lab', 'l54-compare-dark.png'], ['width', '#width .lab', 'l54-width-dark.png'], ['adr', '#adr .lab', 'l54-adr-dark.png'], ['gap', '#gap .flow-card', 'l54-gaploop-dark.png'], ['auto', '#auto .flow-card', 'l54-adrloop-dark.png']]) {
      await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
    }
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval("window.__l54.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");
    await m.eval(`(async () => { const W = window.__l54; await W.Probe.api.both(); await W.Compare.api.first(); W.Compare.api.selectArm(3); await W.Width.api.wide(); await W.Adr.api.first(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['gap', '#gap .flow-card', 'l54-m-gaploop.png'], ['probe', '#probe .lab', 'l54-m-probe.png'], ['compare', '#compare .lab', 'l54-m-compare.png'], ['width', '#width .lab', 'l54-m-width.png'], ['auto', '#auto .flow-card', 'l54-m-adrloop.png'], ['adr', '#adr .lab', 'l54-m-adr.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
