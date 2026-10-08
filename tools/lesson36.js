// Урок 3.6 «π0»: лаборатория и интерактивы дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// схема движется, консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l36-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-24 python3 lessons/build.py l36.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-6-pi0.html');
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
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hero = await p.eval(`document.getElementById('heroMis').textContent`);
  check(/^6 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.5: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="3-7-dvukhurovnevye-arkhitektury.html"]')`), 'ссылка на урок 3.7 на месте');
  await p.eval('window.__l36.SPEED.k = 20; true');

  // ---------- схема ----------
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="pi0"]'); Anim.seek(cv, 2); const a = cv.toDataURL(); Anim.seek(cv, 5.5); const b = cv.toDataURL(); Anim.seek(cv, 8.5); const c = cv.toDataURL(); return JSON.stringify({ ab: a !== b, bc: b !== c }); })()`));
  check(anim.ab && anim.bc, 'схема π0 движется: кадры в 2 с, 5,5 с и 8,5 с разные');
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="pi0"]'); Anim.seek(cv, 5.5); return true; })()`);
  await p.shotEl(out('l36-flow.png'), '#arch .flow-card', 6);

  // ---------- лаборатория ----------
  console.log('лаборатория');
  let r = await viaUI(p, '#lMis', 2);
  const s1 = J(await p.eval(`JSON.stringify(window.__l36.Lab.api.state())`));
  check(r.ok && s1.left && s1.left.hit && s1.right && s1.right.ok, 'миссия 1: на первой сцене A задела стенку, B вставила фигурку в гнездо');
  check(/ставка сыграла/i.test(r.out) && /на такте 4\b/.test(r.out), 'ставка «Только B» сыграла, разбор называет такт 4');
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l36-lab.png'), '#lab .lab', 6);
  await nextMission(p, '#lMis');
  r = await viaUI(p, '#lMis', 1);
  const s2 = J(await p.eval(`JSON.stringify(window.__l36.Lab.api.state())`));
  check(r.ok && s2.bOk === 19 && s2.aOk === 0, `миссия 2: на 20 сценах B ${s2.bOk}, A ${s2.aOk} (в досье и тексте: 19 и 0)`);
  check(/ставка сыграла/i.test(r.out) && /B прошла 19 из 20/.test(r.out) && /на сцене 2/.test(r.out), 'разбор миссии 2: 19 из 20, провал B на сцене 2');
  await nextMission(p, '#lMis'); await sleep(200);
  check(!(await critOk(p, '#lMis')), 'миссия 3: при темпе 1 не засчитана');
  const best = J(await p.eval(`JSON.stringify(window.__l36.Lab.api.state())`));
  await p.eval(`window.__l36.Lab.api.setTempo(${best.bestTempo}); true`); await sleep(200);
  const s3 = J(await p.eval(`JSON.stringify(window.__l36.Lab.api.state())`));
  check(await critOk(p, '#lMis'), `миссия 3: лучший темп ${s3.tempo} — A проходит ${s3.aOk} из 20, B — ${s3.bOk}`);
  check(s3.bestOk <= 5 && s3.bestOk < s3.bOk, 'даже при лучшем темпе A далеко от B');
  const t3 = await outText(p, '#lMis');
  check(new RegExp(`A проходит ${s3.bestOk} из 20`).test(t3), 'разбор миссии 3 совпадает с расчётом');
  await nextMission(p, '#lMis');
  r = await viaUI(p, '#lMis', 1);
  const pre = J(await p.eval(`window.__l36.Lab.api.pre().then((x) => JSON.stringify(x))`, true));
  check(r.ok && pre.PF.ok === 12 && pre.S.ok === 5 && pre.P.bump === 17, `миссия 4: с нуля ${pre.S.ok}, только предобучение ${pre.P.ok} (влетела в гнездо ${pre.P.bump}), предобучение + запись ${pre.PF.ok}`);
  check(/ставка сыграла/i.test(r.out) && new RegExp(`с нуля прошла ${pre.S.ok}`).test(r.out) && new RegExp(`с тем же первым поворотом модель с нуля прошла ${pre.sameOk} из ${pre.sameN}`).test(r.out), `разбор миссии 4: тот же поворот ${pre.sameOk} из ${pre.sameN}, обратный ${pre.otherOk} из ${pre.otherN}`);
  check(pre.otherOk === 0 && pre.sameOk === 5, 'модель с нуля проходит только желобки с тем же первым поворотом, что в записи');
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l36-lab-pre.png'), '#lab .lab', 6);
  await nextMission(p, '#lMis');
  await p.eval(`(window.__l36.Lab.api.setPair('ab'), window.__l36.Lab.api.setScene(1), true)`);
  const s5 = J(await p.eval(`JSON.stringify(window.__l36.Lab.api.state())`));
  check(s5.right && s5.right.hit, 'свободный режим: на сцене 2 модель B задевает стенку, как обещает разбор миссии 2');

  // ---------- FAST ----------
  console.log('FAST');
  r = await viaUI(p, '#fMis', 1);
  const f1 = J(await p.eval(`JSON.stringify(window.__l36.Fast.api.state())`));
  check(r.ok && f1.k < 10 && f1.err <= 1, `миссия 1: хватает k = ${f1.k}, ошибка ${f1.err.toFixed(2)} px, ненулевых ${f1.nonzero}`);
  check(/ставка сыграла/i.test(r.out), 'ставка «меньше десяти» сыграла');
  await p.eval(`document.getElementById('fast').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l36-fast.png'), '#fast .lab', 6);
  await nextMission(p, '#fMis');
  const m3 = J(await p.eval(`JSON.stringify(window.__l36.Fast.minErrK(3))`)), m10 = J(await p.eval(`JSON.stringify(window.__l36.Fast.minErrK(10))`));
  await p.eval(`(window.__l36.Fast.api.setG(3), window.__l36.Fast.api.setK(${m3.k}), true)`); await sleep(150);
  check(await critOk(p, '#fMis'), `миссия 2: γ = 3, наименьшая ошибка ${m3.err.toFixed(2)} px при k = ${m3.k} (при γ = 10 — ${m10.err.toFixed(2)})`);
  check(m3.err > m10.err, 'грубое округление даёт большую ошибку');

  // ---------- задачи, квиз, глоссарий, консоль ----------
  const sort = await p.eval(`(() => { const s = window.__l36.mis.sort, m = { laundry: 'in', mobile: 'in', dryer: 'in', bowls: 'near', towel: 'near', micro: 'near', towelroll: 'new', drawer: 'new', bussing: 'new', box: 'new', eggs: 'new', togo: 'new' }; for (const [k, v] of Object.entries(m)) s.place(k, v); s.check(); return document.querySelector('#taskSort .c-out').textContent; })()`);
  check(/^12 из 12/.test(sort), 'сортировка задач: ' + sort.slice(0, 20));
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`(window.__l36.Lab.api.setPair('ab'), window.__l36.Lab.api.setScene(0), true)`); await sleep(200);
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l36-lab-dark.png'), '#lab .lab', 6);
  await p.eval(`document.getElementById('fast').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l36-fast-dark.png'), '#fast .lab', 6);
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="pi0"]'); Anim.seek(cv, 8.5); return true; })()`);
  await p.shotEl(out('l36-flow-dark.png'), '#arch .flow-card', 6);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l36.SPEED.k = 20; true');
  await m.eval(`window.__l36.Lab.api.first().then(() => window.__l36.Lab.api.twenty()).then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
  check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['arch', '#arch .flow-card', 'l36-m-flow.png'], ['lab', '#lab .lab', 'l36-m-lab.png'], ['fast', '#fast .lab', 'l36-m-fast.png'], ['results', '#taskSort', 'l36-m-sort.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
