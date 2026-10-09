// Урок 3.3 «RT-2»: интерактивы дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах совпадают с состоянием, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l33-*.png. Урок собирается с датой: MR_ASOF=2026-10-17 python3 lessons/build.py l33.
// Числа лаборатории сверяются бит-в-бит с прогоном того же движка в Node и в jsc (JavaScriptCore, как в Safari):
// хэши весов всех четырёх моделей на зёрнах А, Б, В — в REF.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-3-rt-2.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; дождаться конца обучения. */
async function viaUI(p, mis, bet, noBet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && !${!!noBet}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < 1800 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    const o = root.querySelector('.g-out:not([hidden])');
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: o ? o.textContent : '', win: !!(o && o.classList.contains('m-win')), betRight: [...bets].findIndex((b) => b.classList.contains('bet-right')), betWrong: [...bets].findIndex((b) => b.classList.contains('bet-wrong')) });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
/** Ползунок интерактива 1 по номеру поля: как пользователь — значение и событие input. */
const slide = (p, i, v) => p.eval(`(() => { const inp = document.querySelectorAll('#tSliders input')[${i}]; inp.value = ${v}; inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
/** Хэши весов моделей лаборатории (Node и jsc дают одинаковые; движок l33 считает exp, log, tanh, cos сам). */
const REF = {
  a: { scratch: 'f99498aca9cd90ba', vlm: '24fad6c9ca67d9d8', ft: 'f4c168f52f60ee4a', co: '377e7e8411a8630' },
  b: { scratch: 'bc84d2d3455acc6c', vlm: '111bd5b397b77e22', ft: '288d464d58922920', co: '83c5b1de2cc1cd94' },
  c: { scratch: '8fdc781a70d69100', vlm: '4a975d33bb9cdea3', ft: '307e24b5c1bfda0e', co: 'b071dbecd7acac35' },
};
/** Тот же хэш, что в сверке Node/jsc: FNV по двум словам каждого числа float64, все параметры L33.PARAMS подряд. */
const weightHashes = (p, seed) => p.eval(`(() => {
  const hashNums = (arr) => { const f = new Float64Array(1), u = new Uint32Array(f.buffer); let h1 = 0x811c9dc5, h2 = 0x01000193; for (const x of arr) { f[0] = x; h1 = Math.imul(h1 ^ u[0], 16777619) >>> 0; h2 = Math.imul(h2 ^ u[1], 16777619) >>> 0; h1 = Math.imul(h1 ^ u[1], 2246822519) >>> 0; } return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16); };
  const st = window.__l33.LabVla.st, o = {};
  for (const k of ['scratch', 'vlm', 'ft', 'co']) { const r = st.M[k === 'scratch' ? 'scratch:${seed}' : k + ':240:${seed}']; o[k] = r ? hashNums([].concat(...L33.PARAMS.map((q) => Array.from(r.model[q].v)))) : null; }
  return JSON.stringify(o);
})()`).then(J);
const labsFit = (p) => p.eval(`JSON.stringify([...document.querySelectorAll('.lab')].map((l) => [...l.children].map((c) => c.scrollWidth - c.clientWidth)).flat().filter((d) => d > 1))`).then(J);

/** Обучить все четыре модели лаборатории на зерне seed в отдельном браузере — для чисел «по трём зёрнам». */
async function seedRun(seed) {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(300);
    await p.eval(`window.__l33.LabVla.api.setSeed('${seed}'); true`);
    const r = {};
    for (const k of ['scratch', 'vlm', 'ft', 'co']) r[k] = J(await p.eval(`window.__l33.LabVla.api.train('${k}').then((x) => JSON.stringify(x))`, true));
    r.wh = await weightHashes(p, seed);
    return r;
  } finally { await B.close(); }
}

(async () => {
  const others = Promise.all([seedRun('b'), seedRun('c')]);   // идут параллельно с основной проверкой
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^8 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 3.2: три вопроса');
  check(await p.eval(`!!document.querySelector('a[href="3-4-open-x-embodiment.html"]')`), 'ссылка «Дальше» на урок 3.4 на месте (сборка на 17.10)');
  check(await p.eval(`!!document.querySelector('a[href="https://robotics-transformer2.github.io"]')`), 'ссылка на страницу проекта RT-2');

  // ---------- 1. Действие словами ----------
  console.log('Действие словами');
  check(!(await critOk(p, '#tMis')), 'миссия 1 не засчитана до движения ползунков');
  await slide(p, 1, 200); await slide(p, 7, 10); await sleep(100);
  const t1 = J(await p.eval(`JSON.stringify(window.__l33.LabTok.api.state())`));
  check(await critOk(p, '#tMis') && t1.bins.join(' ') === '0 200 128 128 128 128 128 10', 'миссия 1: Δx = 200, захват 10 — строка ' + t1.bins.join(' '));
  check((await p.eval(`document.getElementById('tStr').textContent`)) === '0 200 128 128 128 128 128 10', 'строка под сценой совпадает с корзинами');
  check((await p.eval(`[...document.querySelectorAll('#tTokens .tok-tile')].map((t) => t.firstChild.textContent).join(' ')`)) === '0 200 128 128 128 128 128 10', 'PaLI-X: восемь числовых токенов');
  check((await outText(p, '#tMis')).includes('«0 200 128 128 128 128 128 10»'), 'разбор миссии 1 называет ту же строку');
  await p.eval(`document.getElementById('tokens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l33-tok.png'), '#tokens .lab', 6);
  await nextMission(p, '#tMis');
  check((await p.eval(`document.getElementById('tInput').value`)) === window_paper(), 'миссия 2: в поле строка из статьи');
  let r = await viaUI(p, '#tMis', 1);
  check(!r.ok && r.betRight === 2 && r.betWrong === 1 && /семью числами/.test(r.out), 'строка из статьи (7 чисел) не принята, ставка «признак завершения» не сыграла, подсказка про восьмое число');
  await p.eval(`window.__l33.LabTok.api.setInput('${window_paper()} 127'); true`);
  r = await viaUI(p, '#tMis', 0, true);
  const t2 = J(await p.eval(`JSON.stringify(window.__l33.LabTok.api.state())`));
  check(r.ok && t2.term === 1 && r.out.includes('«1 128 91 241 5 101 127 127»'), 'с восьмым числом строка принята, признак завершения 1, разбор называет строку');
  await nextMission(p, '#tMis');
  await slide(p, 7, 255); await p.eval(`document.querySelector('#tTok button[data-v="palme"]').click(); true`); await sleep(100);
  check(await critOk(p, '#tMis'), 'миссия 3: захват 255 и токенизатор PaLM-E');
  check((await p.eval(`[...document.querySelectorAll('#tTokens .tok-tile')].map((t) => t.firstChild.textContent).slice(-1)[0]`)) === '⟨r255⟩', 'PaLM-E: корзина 255 — редкий токен ⟨r255⟩');
  await p.eval(`document.getElementById('tokens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l33-tok-palme.png'), '#tokens .lab', 6);

  // ---------- таблицы и схема ----------
  console.log('Таблицы и схема');
  await p.eval(`(() => { const td = document.querySelectorAll('#rtT4 tbody tr')[4].children[8]; td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true; })()`);
  check(/RT-2-PaLI-X-55B.*62%/.test(await p.eval(`document.getElementById('rtNote').textContent`)), 'наведение на ячейку: «RT-2-PaLI-X-55B … 62%»');
  await p.eval(`document.querySelector('#rtPick button[data-v="t6"]').click(); true`);
  check(await p.eval(`document.getElementById('rtT4').hidden && !document.getElementById('rtT6').hidden`), 'переключение на таблицу 6');
  const t6 = await p.eval(`[...document.querySelectorAll('#rtT6 tbody tr')].map((r) => r.children[8].textContent).join(',')`);
  check(t6 === '9,42,44,52,63', 'таблица 6: средние 9, 42, 44, 52, 63 — ' + t6);
  const an = J(await p.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.0); const a = cv.toDataURL(); Anim.seek(cv, 7.5); const b = cv.toDataURL(); return { k: cv.dataset.anim, moves: a !== b }; }))`));
  check(an.length === 1 && an.every((x) => x.moves), 'анимированная схема rt2 движется: ' + JSON.stringify(an));
  await p.eval(`document.querySelector('canvas[data-anim]').scrollIntoView({ block: 'center', behavior: 'instant' }); Anim.seek(document.querySelector('canvas[data-anim]'), 9.5); true`); await sleep(200); await p.shotEl(out('l33-flow.png'), '.flow-card', 4);

  // ---------- 2. Лаборатория: мини-VLA ----------
  console.log('Лаборатория');
  r = await viaUI(p, '#lMis', 1);
  const S = () => p.eval(`JSON.stringify(window.__l33.LabVla.api.state())`).then(J);
  let s = await S();
  check(r.ok && s.scratch.red >= 16 && s.scratch.purple <= 8, `миссия 1: с нуля — красный ${s.scratch.red}/20, фиолетовый ${s.scratch.purple}/20`);
  check(r.betRight === 1 && r.out.includes(`красный ${s.scratch.red} из 20, фиолетовый ${s.scratch.purple} из 20`), 'ставка «нет» сыграла, числа разбора совпадают');
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l33-lab-scratch.png'), '#lab .lab', 6);
  await nextMission(p, '#lMis'); r = await viaUI(p, '#lMis');
  s = await S();
  check(r.ok && s.vlm.cap >= 43 && s.vlm.red <= 5 && r.out.includes(`в ${s.vlm.cap} подписях из 48`), `миссия 2: VLM — цвет в подписях ${s.vlm.cap}/48, красный кубик ${s.vlm.red}/20`);
  await nextMission(p, '#lMis'); r = await viaUI(p, '#lMis', 1);
  s = await S();
  check(r.ok && s.ft.red >= 16 && s.ft.cap <= s.vlm.cap - 5, `миссия 3: дообучение — красный ${s.ft.red}/20, подписи ${s.vlm.cap} → ${s.ft.cap}`);
  check(r.betRight === 1 && r.out.includes(`с ${s.vlm.cap} до ${s.ft.cap} из 48`) && r.out.includes(`в ${s.ft.purple} сценах из 20`), 'ставка «ухудшатся» сыграла, числа разбора совпадают');
  await nextMission(p, '#lMis'); r = await viaUI(p, '#lMis', 0);
  s = await S();
  check(r.ok && s.co.purple >= 12 && s.co.cap >= 43 && s.co.red >= 16, `миссия 4: совместное — фиолетовый ${s.co.purple}/20, подписи ${s.co.cap}/48, красный ${s.co.red}/20`);
  check(r.betRight === 0 && r.out.includes(`фиолетовый ${s.co.purple} из 20 против ${s.ft.purple}`) && r.out.includes(`подписи ${s.co.cap} из 48 против ${s.ft.cap}`), `ставка «совместная» сыграла (${s.co.purple} > ${s.ft.purple}), числа разбора совпадают`);
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l33-lab-all.png'), '#lab .lab', 6);
  await nextMission(p, '#lMis');
  check(!(await critOk(p, '#lMis')), 'миссия 5 не засчитана, пока команда про фиолетовый');
  await p.eval(`document.querySelector('#lColor button[data-v="red"]').click(); true`); await sleep(150);
  check(await critOk(p, '#lMis') && (await outText(p, '#lMis')).includes(`с нуля ${s.scratch.red}, дообучение ${s.ft.red}, совместное ${s.co.red} из 20`), 'миссия 5: красный кубик — все три модели справляются, числа разбора совпадают');
  check((await p.eval(`document.querySelectorAll('#lModels .vm:not([hidden])').length`)) === 4, 'на сцене четыре карточки моделей рядом');
  // «по трём зёрнам»: разборы миссий 3 и 4 называют диапазоны — проверяем их по зёрнам Б и В
  const [sb, sc] = await others, all = [s, { scratch: sb.scratch, ft: sb.ft, co: sb.co }, { scratch: sc.scratch, ft: sc.ft, co: sc.co }];
  const rng = (f) => [Math.min(...all.map(f)), Math.max(...all.map(f))];
  const ftCap = rng((x) => x.ft.cap), coCap = rng((x) => x.co.cap), ftP = rng((x) => x.ft.purple), coP = rng((x) => x.co.purple);
  console.log(`  зёрна А/Б/В: дообучение — подписи ${ftCap}, фиолетовый ${ftP}; совместное — подписи ${coCap}, фиолетовый ${coP}`);
  const txt3 = await p.eval(`window.__l33.LabVla.MIS[2].explain(window.__l33.LabVla.api.summary('ft'))`), txt4 = await p.eval(`window.__l33.LabVla.MIS[3].explain(window.__l33.LabVla.api.summary('co'))`);
  check(txt3.includes(`от ${ftCap[0]} до ${ftCap[1]} из 48`), `разбор 3: подписи после дообучения «от ${ftCap[0]} до ${ftCap[1]}» по трём зёрнам`);
  const coCapTxt = coCap[0] === coCap[1] ? `${coCap[0]} из 48 на всех зёрнах` : `${coCap[0]}–${coCap[1]} из 48`;
  check(txt4.includes(`в ${coP[0]}–${coP[1]} сценах`) && txt4.includes(`— в ${ftP[0]}–${ftP[1]};`) && txt4.includes(`${coCapTxt} против ${ftCap[0]}–${ftCap[1]}`), `разбор 4: диапазоны по трём зёрнам ${coP.join('–')}, ${ftP.join('–')}, ${coCapTxt} против ${ftCap.join('–')}`);
  check(txt4.includes('на зерне В совместная даже уступает') === (sc.co.purple < sc.ft.purple), `разбор 4: про зерно В сказано верно (совместная ${sc.co.purple}, дообученная ${sc.ft.purple})`);
  check(all.every((x) => x.co.cap > x.ft.cap + 5 && x.scratch.purple <= 8), 'на всех трёх зёрнах: совместная сохраняет подписи лучше дообученной, модель с нуля не берёт фиолетовый');
  // Chrome = Node = jsc: веса всех моделей на трёх зёрнах совпадают бит-в-бит с эталоном
  const whA = await weightHashes(p, 'a');
  for (const [nm, got] of [['a', whA], ['b', sb.wh], ['c', sc.wh]]) check(JSON.stringify(got) === JSON.stringify(REF[nm]), `зерно ${({ a: 'А', b: 'Б', c: 'В' })[nm]}: веса четырёх моделей совпадают с Node и jsc бит-в-бит` + (JSON.stringify(got) === JSON.stringify(REF[nm]) ? '' : ' — ' + JSON.stringify(got)));

  // ---------- 3. Сортировка ----------
  console.log('Что появилось само');
  const placed = J(await p.eval(`(() => {
    const items = window.__l33.EMERGENT; let n = 0;
    for (const it of items) {
      const c = document.querySelector('#eSort .c-card[data-id="' + it.id + '"]');
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1 }));
      c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1 }));
      document.querySelector('#eSort .c-zone[data-zone="' + it.target + '"]').click(); n++;
    }
    document.querySelector('#eSort .c-bar .btn.primary').click();
    return JSON.stringify({ n, out: document.querySelector('#eSort .c-out').textContent });
  })()`));
  check(placed.n === 12 && /^12 из 12/.test(placed.out), 'сортировка через интерфейс: ' + placed.out.slice(0, 40));
  await p.eval(`document.getElementById('emergent').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200); await p.shotEl(out('l33-sort.png'), '#eSort', 6);

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  const fit1 = await labsFit(p); check(!fit1.length, 'ни одна карточка .lab не шире себя: ' + JSON.stringify(fit1));
  check((await p.eval('document.documentElement.scrollWidth')) <= 1280, 'компьютер: без горизонтальной прокрутки');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('lab').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l33-lab-dark.png'), '#lab .lab', 6);
  await p.eval(`document.getElementById('tokens').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l33-tok-dark.png'), '#tokens .lab', 6);
  await p.eval(`document.querySelector('canvas[data-anim]').scrollIntoView({ block: 'center', behavior: 'instant' }); Anim.seek(document.querySelector('canvas[data-anim]'), 5.5); true`); await sleep(200); await p.shotEl(out('l33-flow-dark.png'), '.flow-card', 4);
  check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval(`window.__l33.LabVla.api.train('scratch').then(() => true)`, true);
  await m.eval(`(window.__l33.LabTok.api.setBins([1, 200, 40, 128, 128, 90, 128, 255]), true)`);
  await sleep(300);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const fit2 = await labsFit(m); check(!fit2.length, 'телефон: ни одна карточка .lab не шире себя: ' + JSON.stringify(fit2));
  check((await m.eval(`document.querySelector('canvas[data-anim]').dataset.layout`)) === 'n', 'телефон: схема в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  for (const [sel, n] of [['#tokens .lab', 'l33-m-tok.png'], ['.flow-card', 'l33-m-flow.png'], ['#cofinetune .rt-tables', 'l33-m-table.png'], ['#lab .lab', 'l33-m-lab.png'], ['#eSort', 'l33-m-sort.png']]) {
    await m.eval(`document.querySelector('${sel}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
function window_paper() { return '1 128 91 241 5 101 127'; }
