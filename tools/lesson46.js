// Урок 4.6 «Пирамида данных и маховик»: лаборатории дают обещанные в тексте исходы, миссии проходятся через
// интерфейс, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l46-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-24 python3 lessons/build.py l46.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/4-6-piramida-dannykh.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ');
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
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
/** Ползунок плана через событие input, как при перетаскивании. */
const slide = (p, src, v) => p.eval(`(() => { const i = document.querySelector('#bPlan .plan-row[data-src="${src}"] input'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^6 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 4.5: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="proverka-chasti-4.html"]')`), 'ссылка на проверку части 4 на месте (выходит вместе с уроком 24.10)');
  check(/часть 5|части 5/.test(await text(p, '#finale .bridge')), 'в итогах — абзац-мост в часть 5');
  await p.eval('window.__l46.SPEED.k = 20; true');

  // ---------- схемы ----------
  for (const [id, a, b] of [['pyramid', 2, 9.6], ['flywheel', 1.5, 13]]) {
    const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
    check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
    await p.shotEl(out(`l46-${id}.png`), `#${id} .flow-card`, 6);
  }

  // ---------- интерактив: слои пирамиды ----------
  console.log('слои');
  await p.eval(`(() => { const S = window.__l46.mis.layers, T = { ego4d: 'base', web: 'base', epic: 'base', dexmg: 'mid', neural: 'mid', robocasa: 'mid', gr1: 'top', droid: 'top' }; Object.entries(T).forEach(([id, z]) => S.place(id, z)); S.check(); return true; })()`);
  const ls = await text(p, '#layerSort .c-out');
  check(/8 из 8/.test(ls) && (await p.eval(`document.querySelectorAll('#layerSort .c-ok').length`)) === 8, 'сортировка: 8 из 8 при верной раскладке');
  await p.eval(`(() => { const S = window.__l46.mis.layers; S.reset(); ['ego4d','web','epic','dexmg','robocasa','gr1','droid'].forEach((id) => S.place(id, { ego4d: 'base', web: 'base', epic: 'base', dexmg: 'mid', robocasa: 'mid', gr1: 'top', droid: 'top' }[id])); S.place('neural', 'top'); S.check(); return true; })()`);
  check(/7 из 8/.test(await text(p, '#layerSort .c-out')) && /выглядит как запись робота/.test(await text(p, '#layerSort .c-out')), 'сортировка: сгенерированное видео на вершине — ошибка с разбором');
  await p.eval(`document.getElementById('layers').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l46-layers.png'), '#layers .layer-sort', 6);

  // ---------- лаборатория 1: бюджет ----------
  console.log('лаборатория 1');
  check(!(await visible(p, '#bPlan')) && !(await visible(p, '#wrapBTrain')), 'миссия 1: ползунки плана и своя кнопка скрыты');
  let r = await viaUI(p, '#bMis', 2);
  let b1 = J(await p.eval(`JSON.stringify(window.__l46.Budget.api.state())`));
  const L = Math.round(b1.left * 100), R = Math.round(b1.right * 100);
  check(r.ok && L === 48 && R === 70, `миссия 1: весь бюджет на робота ${L}%, смесь ${R}% (в тексте: 48% и 70%)`);
  check(/ставка сыграла/i.test(r.out) && new RegExp(`удерживает кубик в ${L}% попыток, смесь — в ${R}%`).test(r.out), 'разбор миссии 1 называет те же числа');
  await p.eval(`document.getElementById('budget').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l46-budget.png'), '#budget .lab', 6);
  await nextMission(p, '#bMis');
  r = await viaUI(p, '#bMis', 2);
  const m2 = r.out.match(/Своим выходом — (\d+)%, выходом робота — (\d+)%.*даёт (\d+)%.*ничего не умеет, (\d+)%/);
  check(r.ok && /ставка сыграла/i.test(r.out) && m2 && m2[1] === '70' && m2[2] === '54' && m2[3] === '71' && +m2[4] <= 5, `миссия 2: свой выход ${m2 && m2[1]}%, общий ${m2 && m2[2]}%, без видео ${m2 && m2[3]}%, одно видео ${m2 && m2[4]}%`);
  await nextMission(p, '#bMis');
  check(await visible(p, '#bPlan'), 'миссия 3: ползунки плана видны');
  await slide(p, 'robot', 32); await slide(p, 'sim', 400); await sleep(100);
  check(/больше бюджета/.test(await text(p, '#bBudget')), 'план 32 + 400 + 400 дороже бюджета — полоска это показывает');
  r = await viaUI(p, '#bMis');
  check(!r.ok && /больше бюджета/.test(r.out), 'миссия 3: план дороже бюджета не засчитан');
  await slide(p, 'robot', 0); await slide(p, 'sim', 400); await slide(p, 'video', 400); await sleep(100);
  r = await viaUI(p, '#bMis');
  check(!r.ok && /нет демонстраций робота/.test(r.out), 'миссия 3: без демонстраций робота меньше 65%, подсказка про робота — ' + r.out.slice(0, 40));
  await slide(p, 'robot', 16); await slide(p, 'video', 0); await sleep(100);
  r = await viaUI(p, '#bMis');
  check(r.ok && /16 \+ 400 \+ 0 за 78 у\. е\. — 71%/.test(r.out), 'миссия 3: 16 + 400 + 0 за 78 у. е. — 71%, засчитана');
  await nextMission(p, '#bMis');
  check((await visible(p, '#wrapBOpts')) && (await visible(p, '#wrapBTrain')), 'свободный режим: веса, выход для видео и своя кнопка видны');
  await p.eval(`document.querySelector('#bMode button[data-v="prop"]').click(); true`); await slide(p, 'video', 400);
  await p.eval(`document.getElementById('bTrain').click(); true`); await sleep(200);
  await p.waitFor(`!window.__l46.Budget.st.busy`, 60000);
  const prop = J(await p.eval(`JSON.stringify(window.__l46.Budget.api.state())`));
  check(prop.right != null && Math.round(prop.right * 100) === 67, `свободный режим: пакеты по числу эпизодов — ${Math.round(prop.right * 100)}% (в «Под капотом»: разница от −4 до +8)`);
  const after1 = await text(p, '#budgetAfter');
  check(after1.includes('отняло 16 пунктов'), 'инференс после лаборатории 1: видео в общем выходе отняло 70 − 54 = 16 пунктов');

  // ---------- лаборатория 2: парк ----------
  console.log('лаборатория 2');
  check(!(await visible(p, '#wrapFCtl')), 'миссии парка: ползунки скрыты до свободного режима');
  r = await viaUI(p, '#fMis');
  const f1 = J(await p.eval(`JSON.stringify(window.__l46.Fleet.api.state().cur)`));
  const rr = f1.rates.map((v) => Math.round(v * 100));
  check(r.ok && rr.join(',') === '35,58,70,67,74', `миссия 1: 16 роботов, 50% разметки — ${rr.join(' → ')}%`);
  const fa = J(await p.eval(`(() => { const q = window.__l46.Fleet.st.runs['16-50']; return JSON.stringify({ rate: q.hist.map((h) => Math.round(h.rate * 100)), sh: q.hist.slice(0, -1).map((h) => [h.ok, h.fix, h.lost]), A: window.__l46.FLY_ANIM }); })()`));
  check(JSON.stringify(fa.rate) === JSON.stringify(fa.A.rate) && JSON.stringify(fa.sh) === JSON.stringify(fa.A.shifts), 'числа схемы маховика совпадают с запуском лаборатории 2');
  await p.eval(`document.getElementById('fleet').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l46-fleet.png'), '#fleet .lab', 6);
  await nextMission(p, '#fMis');
  r = await viaUI(p, '#fMis', 1);
  const f2 = r.out.match(/Без разметки — (\d+) → (\d+)%.*до (\d+)%.*из (\d+) удач (\d+) — с красным кубиком.*в (\d+) дом/);
  check(r.ok && /ставка сыграла/i.test(r.out) && f2 && f2[2] === '42' && f2[3] === '74' && (+f2[5]) / (+f2[4]) > 1.5 * (+f2[6]) / 16, `миссия 2: без разметки ${f2 && f2[1]} → ${f2 && f2[2]}%; красных среди удач ${f2 && f2[5]} из ${f2 && f2[4]} при ${f2 && f2[6]} красных домах из 16`);
  await nextMission(p, '#fMis');
  r = await viaUI(p, '#fMis', 1);
  const f3 = r.out.match(/32 робота: ([\d → ]+)%, 16 роботов: ([\d → ]+)%/);
  check(r.ok && /ставка сыграла/i.test(r.out) && f3 && /74$/.test(f3[1].trim()) && /74$/.test(f3[2].trim()), `миссия 3: 32 робота — ${f3 && f3[1]}, 16 — ${f3 && f3[2]}`);
  await p.eval(`document.getElementById('fleet').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l46-fleet-32.png'), '#fleet .lab', 6);
  await nextMission(p, '#fMis');
  check(await visible(p, '#wrapFCtl'), 'свободный режим парка: ползунки видны');

  // ---------- тексты совпадают с расчётом ----------
  const fin = await text(p, '#finale');
  check(fin.includes('70% против 48%') && fin.includes('— 54%') && fin.includes('с 35 до 42%') && fin.includes('до 74%'), 'итоги урока называют числа лабораторий');
  const fl = await text(p, '#fleet .deep');
  check(fl.includes('без разметки — 40–42%') && fl.includes('71–74%'), '«Под капотом» лаборатории 2: разброс по зёрнам совпадает с INTEGRATION.md');
  const bd = await text(p, '#budget .deep');
  check(bd.includes('от 47 до 60%') && bd.includes('от 60 до 71%') && bd.includes('от 51 до 56%'), '«Под капотом» лаборатории 1: разброс по наборам');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 4, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  for (const [id, sel, n] of [['budget', '#budget .lab', 'l46-budget-dark.png'], ['fleet', '#fleet .lab', 'l46-fleet-dark.png'], ['flywheel', '#flywheel .flow-card', 'l46-flywheel-dark.png'], ['pyramid', '#pyramid .flow-card', 'l46-pyramid-dark.png']]) {
    await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
  }
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l46.SPEED.k = 20; true');
  await m.eval(`window.__l46.Budget.api.first().then(() => window.__l46.Fleet.api.go(16, 0.5)).then(() => window.__l46.Fleet.api.go(32, 0.5)).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
  check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['sources', '#sources .src-table', 'l46-m-sources.png'], ['pyramid', '#pyramid .flow-card', 'l46-m-pyramid.png'], ['layers', '#layers .layer-sort', 'l46-m-layers.png'], ['budget', '#budget .lab', 'l46-m-budget.png'], ['flywheel', '#flywheel .flow-card', 'l46-m-flywheel.png'], ['fleet', '#fleet .lab', 'l46-m-fleet.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
