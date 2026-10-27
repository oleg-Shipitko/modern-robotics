// Проверка страницы «Карта идей» (site/karta-idey.html и site/en/karta-idey.html, собирает python3 site/build.py)
// в headless Chrome: чистая консоль; чипов столько, сколько узлов в lessons/shared/ideas-map.json; подписи чипов
// не мельче 12 px; чипы не накладываются друг на друга, на заголовки дорожек и подписи осей на ширинах 1440, 1024,
// 768 и 390; дорожки идут сверху вниз в порядке JSON (первая — «Классика»); ось: работы до 2016 года стоят по порядку
// в равных слотах и занимают 20–24 % шкалы, с 2016 года ширина года пропорциональна 0,6 + наибольшему числу его работ
// в одной дорожке (узкие годы — не уже подписи), одна «молния» на стыке сверху и снизу, подписан каждый год с 2016,
// первая и последняя ранние даты, подписи лет не теснее 6 px (на 1440, 1024 и 768);
// в покое видны только линии внутри дорожек, и каждая — настоящая связь той же темы (ни одной межтемной);
// наведение на чип показывает его прямые связи; клик на RT-1 показывает карточку с «Урок 3.1», подсвечивает предков «←»
// и потомков «→» и их связи; Enter на чипе открывает карточку; фильтры «часть курса» (3 и 0) и «дорожка» («Данные»,
// «Классика») бледнят чужие чипы; Esc снимает выбор;
// на 390 px нет горизонтальной прокрутки, ось вертикальная, карточка открывается панелью снизу. Английская
// страница: то же, lang="en", карточка с «Lesson 3.1».
//   node tools/ideas_map.js            проверки и снимки shots/ideas-map-*.png
//   node tools/ideas_map.js --no-shots только проверки
// Выход с кодом 1, если хотя бы одна проверка не прошла.
const { launch, sleep } = require('./cdp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'site/karta-idey.html');
const PAGE_EN = path.join(ROOT, 'site/en/karta-idey.html');
const SHOTS = path.join(ROOT, 'shots');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/shared/ideas-map.json'), 'utf8'));
const shots = !process.argv.includes('--no-shots');
let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) bad++; };

// предки и потомки по JSON — чтобы сверить подсветку
const byId = new Map(DATA.nodes.map((n) => [n.id, n]));
const children = new Map(DATA.nodes.map((n) => [n.id, []]));
DATA.nodes.forEach((n) => (n.parents || []).forEach((p) => children.get(p).push(n.id)));
function closure(id, next) { const seen = new Set(), q = [id]; while (q.length) next(q.pop()).forEach((x) => { if (!seen.has(x)) { seen.add(x); q.push(x); } }); return seen; }
const edgesTotal = DATA.nodes.reduce((s, x) => s + (x.parents || []).length, 0);
const laneCounts = {}; DATA.nodes.forEach((n) => { laneCounts[n.lane] = (laneCounts[n.lane] || 0) + 1; });
// в покое линия ведёт к каждой работе, у которой есть предок в той же дорожке (ближайший по времени)
// ось: ранние даты (до 2016 года) и веса лет с 2016 года — так же, как их считает assets/ideas-map.js
const tOf = (n) => n.year + ((n.month || 7) - 0.5) / 12;
const EARLY_DATES = [...new Set(DATA.nodes.map(tOf).filter((t) => t < 2016))].sort((a, b) => a - b);
const EARLY_FIRST = Math.floor(EARLY_DATES[0]), EARLY_LAST = Math.floor(EARLY_DATES[EARLY_DATES.length - 1]);
const LATE_YEARS = []; for (let y = 2016; y <= Math.floor(Math.max(...DATA.nodes.map(tOf))); y++) LATE_YEARS.push(y);
const WEIGHT = Object.fromEntries(LATE_YEARS.map((y) => [y, 0.6 + Math.max(...DATA.lanes.map((l) => DATA.nodes.filter((n) => n.lane === l.id && tOf(n) >= y && tOf(n) < y + 1).length))]));
const AXIS_INFO = `JSON.stringify((() => {
  const ax = document.querySelector('#imSvg .im-axis');
  const top = [...ax.querySelectorAll('text')].filter((t) => t.getAttribute('y') === '20').map((t) => { const r = t.getBoundingClientRect(); return { txt: t.textContent, l: r.left, r: r.right }; }).sort((a, b) => a.l - b.l);
  const years = [...document.querySelectorAll('#imSvg .im-grid line[data-year]')].map((l) => [+l.dataset.year, +l.getAttribute('x1')]).sort((a, b) => a[0] - b[0]);
  const xd = Object.fromEntries([...document.querySelectorAll('#imSvg .node')].map((g) => [g.dataset.id, +g.dataset.xd]));
  const rows = {}; document.querySelectorAll('#imSvg .node').forEach((g) => { const l = g.getAttribute('class').match(/lane-([a-z]+)/)[1]; (rows[l] = rows[l] || new Set()).add(g.querySelector('.chip').getAttribute('y')); });
  return { early: +ax.dataset.early, top, years, xd, breaks: ax.querySelectorAll('.im-break').length, rows: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.size])) };
})())`;
function axisChecks(W, A) {
  ok(A.breaks === 2, `${W}: одна «молния» на стыке с 2016 годом, сверху и снизу`);
  ok(A.early >= 0.195 && A.early <= 0.245, `${W}: ранняя часть занимает ${(A.early * 100).toFixed(1)} % шкалы`);
  const gaps = A.top.slice(1).map((t, i) => t.l - A.top[i].r);
  ok(gaps.every((g) => g >= 5.5), `${W}: подписи лет не теснее 6 px (наименьший зазор ${Math.min(...gaps).toFixed(1)} px)`);
  const txt = new Set(A.top.map((t) => t.txt)), missing = LATE_YEARS.filter((y) => !txt.has(String(y)));
  ok(!missing.length && txt.has(String(EARLY_FIRST)) && txt.has(String(EARLY_LAST)), `${W}: подписаны все годы с 2016, первая (${EARLY_FIRST}) и последняя (${EARLY_LAST}) ранние даты` + (missing.length ? '; нет ' + missing.join(', ') : ''));
  const pos = EARLY_DATES.map((t) => DATA.nodes.filter((n) => tOf(n) === t).map((n) => A.xd[n.id]));
  const steps = pos.slice(1).map((xs, i) => xs[0] - pos[i][0]);
  ok(pos.every((xs) => xs.every((x) => Math.abs(x - xs[0]) < 0.6)) && steps.every((d) => d > 0 && Math.abs(d - steps[0]) < 0.6),
    `${W}: работы до 2016 года по порядку: ${EARLY_DATES.length} дат в равных слотах по ${steps[0].toFixed(1)} px`);
  const wy = Object.fromEntries(A.years.slice(0, -1).map(([y, x], i) => [y, A.years[i + 1][1] - x]));
  const free = LATE_YEARS.filter((y) => wy[y] > 34.6), k = free.reduce((sum, y) => sum + wy[y], 0) / free.reduce((sum, y) => sum + WEIGHT[y], 0);
  const off = free.filter((y) => Math.abs(wy[y] - k * WEIGHT[y]) > 1.5);
  ok(!off.length && LATE_YEARS.every((y) => free.includes(y) || Math.abs(wy[y] - 34) < 1.1),
    `${W}: ширина года пропорциональна 0,6 + наибольшему числу работ в дорожке (${LATE_YEARS.map((y) => y + ' ' + Math.round(wy[y])).join(', ')})` + (off.length ? '; не так у ' + off.join(', ') : ''));
  ok([2016, 2017, 2018, 2019].every((y) => wy[2022] > wy[y]), `${W}: плотный 2022 год шире 2016–2019`);
  console.log(`  · ${W}: подстрок по дорожкам ${DATA.lanes.map((l) => l.id + ' ' + (A.rows[l.id] || 0)).join(', ')}`);
}
const railsTotal = DATA.nodes.filter((n) => (n.parents || []).some((p) => byId.get(p) && byId.get(p).lane === n.lane)).length;

const CLICK = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('нет ' + ${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`;
const HOVER = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('нет ' + ${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true; })()`;
const UNHOVER = `document.getElementById('imSvg').dispatchEvent(new MouseEvent('mouseleave'))`;
// наложения: чипы между собой, чипы с подписями дорожек и осей; подпись чипа должна лежать внутри своего чипа
const OVERLAPS = `(() => {
  const rects = [];
  document.querySelectorAll('#imSvg .node').forEach((g) => {
    const id = g.dataset.id, r = g.querySelector('.chip').getBoundingClientRect(), t = g.querySelector('.chip-t').getBoundingClientRect();
    rects.push({ id: 'chip:' + id, r });
    if (t.left < r.left - 0.5 || t.right > r.right + 0.5 || t.top < r.top - 0.5 || t.bottom > r.bottom + 0.5) rects.push({ id: 'text-out:' + id, r: t, out: true });
    const tag = g.querySelector('.lane-tag'); if (tag) rects.push({ id: 'tag:' + id, r: tag.getBoundingClientRect() });
  });
  document.querySelectorAll('#imSvg .im-lane-t text, #imSvg .im-axis text, #imSvg .im-year text').forEach((t) => rects.push({ id: 'label:' + t.textContent, r: t.getBoundingClientRect() }));
  const out = rects.filter((a) => a.out).map((a) => a.id);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.out || b.out) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 0.5 && h > 0.5) out.push(a.id + ' × ' + b.id);
  }
  return out;
})()`;
const MIN_FONT = `Math.min(...[...document.querySelectorAll('#imSvg .chip-t')].map((t) => parseFloat(getComputedStyle(t).fontSize)))`;
const EDGES_ON = `document.querySelectorAll('#imSvg .edge.on').length`;
const SEL = `JSON.stringify({ anc: [...document.querySelectorAll('#imSvg .node.anc')].map((g) => g.dataset.id).sort(), desc: [...document.querySelectorAll('#imSvg .node.desc')].map((g) => g.dataset.id).sort(), on: document.querySelectorAll('#imSvg .edge.on').length, direct: document.querySelectorAll('#imSvg .edge.on.direct').length, off: document.querySelectorAll('#imSvg .node.off').length, sel: (document.querySelector('#imSvg .node.sel') || { dataset: {} }).dataset.id || null, mkl: [...document.querySelectorAll('#imSvg .node.anc .mk-l')].filter((t) => getComputedStyle(t).opacity === '1').length, mkr: [...document.querySelectorAll('#imSvg .node.desc .mk-r')].filter((t) => getComputedStyle(t).opacity === '1').length })`;

async function open(B, url, width, height, extra) {
  const p = await B.page(url, Object.assign({ width, height, light: true }, extra || {}));
  await p.waitFor('window.__ideasReady === true', 20000);
  await sleep(300);
  return p;
}
async function fullShot(p, file) {
  const h = await p.eval('document.documentElement.scrollHeight');
  const w = await p.eval('document.documentElement.clientWidth');
  await p.shot(file, { x: 0, y: 0, width: w, height: Math.min(h, 4000) });
  console.log('  снимок ' + path.relative(ROOT, file));
}
async function key(p, k, code) {
  await p.S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: code === 'Enter' ? 13 : 27 });
  await p.S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: code === 'Enter' ? 13 : 27 });
}

async function checkWide(B, url, lang) {
  const ru = lang === 'ru';
  console.log(`${lang}: 1440 px`);
  let p = await open(B, url, 1440, 1000);
  ok(p.logs.length === 0, 'консоль чистая' + (p.logs.length ? ': ' + p.logs.join(' | ') : ''));
  ok(await p.eval('document.documentElement.lang') === lang, `lang="${lang}"`);
  const n = await p.eval(`document.querySelectorAll('#imSvg .node').length`);
  ok(n === DATA.nodes.length, `чипов ${n} из ${DATA.nodes.length} узлов в JSON`);
  const e = await p.eval(`document.querySelectorAll('#imSvg .edge').length`);
  ok(e === edgesTotal, `связей в разметке ${e} из ${edgesTotal} в JSON`);
  const rails = await p.eval(`document.querySelectorAll('#imSvg .rail').length`);
  const railPairs = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .rail')].map((r) => [r.dataset.a, r.dataset.b]))`));
  const fake = railPairs.filter(([a, b]) => !(byId.get(b).parents || []).includes(a) || byId.get(a).lane !== byId.get(b).lane);
  ok(rails > 0 && rails <= railsTotal && !fake.length, `линий внутри дорожек ${rails} из ${railsTotal} возможных, все — настоящие связи той же темы${fake.length ? ': лишние ' + fake.map((x) => x.join('→')).join(', ') : ''}`);
  ok(await p.eval(EDGES_ON) === 0, 'в покое ни одна связь «выросло из» не видна');
  ok(await p.eval(`document.querySelectorAll('#imSvg .im-lane-t').length`) === DATA.lanes.length, `дорожек ${DATA.lanes.length} с заголовками`);
  ok(await p.eval(`!!document.querySelector('#imSvg .im-axis') && document.querySelectorAll('#imSvg .im-axis text').length >= 20`), 'ось лет сверху и снизу');
  const laneOrder = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .im-lane-t')].map((g) => g.getAttribute('class').replace('im-lane-t lane-', '')))`));
  ok(laneOrder.join() === DATA.lanes.map((l) => l.id).join(), `дорожки сверху вниз в порядке JSON: ${laneOrder.join(', ')}`);
  const soon = await p.eval(`document.querySelectorAll('#imSvg .node.soon').length`);
  console.log(`  · чипов с невышедшим уроком: ${soon}`);
  for (const [W, H] of [[1440, 1000], [1024, 900], [768, 1000]]) {
    const q = W === 1440 ? p : await open(B, url, W, H);
    const ov = await q.eval(OVERLAPS), mf = await q.eval(MIN_FONT);
    ok(ov.length === 0, `${W}: чипы и подписи не накладываются` + (ov.length ? ` (${ov.length}): ` + ov.slice(0, 8).join('; ') : ''));
    ok(mf >= 12, `${W}: подпись чипа не мельче 12 px (${mf})`);
    const sw = await q.eval(`Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)`);
    ok(sw <= W, `${W}: нет горизонтальной прокрутки (${sw})`);
    axisChecks(W, JSON.parse(await q.eval(AXIS_INFO)));
    if (ru && W === 1440 && shots) await fullShot(q, path.join(SHOTS, 'ideas-map-desk.png'));
    if (ru && W === 1024 && shots) await fullShot(q, path.join(SHOTS, 'ideas-map-1024.png'));
    if (ru && W === 768 && shots) await fullShot(q, path.join(SHOTS, 'ideas-map-tablet.png'));
    if (!ru && W === 1440 && shots) await fullShot(q, path.join(SHOTS, 'ideas-map-en.png'));
  }
  // наведение: прямые связи RT-1 появляются, уход — исчезают (вкладка — на передний план, иначе переходы CSS в фоне стоят)
  await p.S('Page.bringToFront').catch(() => {});
  await p.eval(HOVER('#imSvg .node[data-id="rt1"]'));
  await sleep(250);
  const directN = (byId.get('rt1').parents || []).length + children.get('rt1').length;
  const hov = await p.eval(EDGES_ON);
  ok(hov === directN, `наведение на RT-1 показывает прямые связи: ${hov} из ${directN}`);
  await p.eval(UNHOVER);
  await sleep(250);
  ok(await p.eval(EDGES_ON) === 0, 'после ухода курсора связи скрыты');
  // клик на RT-1
  await p.eval(CLICK('#imSvg .node[data-id="rt1"]'));
  await sleep(500);
  const cardText = await p.eval(`document.getElementById('imCard').textContent`);
  ok((ru ? /Урок 3\.1/ : /Lesson 3\.1/).test(cardText), `карточка RT-1 содержит «${ru ? 'Урок' : 'Lesson'} 3.1»`);
  const labels = ru ? ['Проблема', 'Вклад', 'Выросло из', 'Привело к'] : ['Problem', 'Contribution', 'Grew out of', 'Led to'];
  ok(labels.every((l) => cardText.includes(l)), `в карточке есть «${labels.join('», «')}»`);
  const href = await p.eval(`(document.querySelector('#imCard a.im-lesson') || { getAttribute: () => '' }).getAttribute('href')`);
  ok(/3-1-rt-1\.html$/.test(href || ''), `ссылка на урок: ${href}`);
  const anc = closure('rt1', (id) => byId.get(id).parents || []), desc = closure('rt1', (id) => children.get(id));
  const H = JSON.parse(await p.eval(SEL));
  ok(H.sel === 'rt1', 'RT-1 выделен');
  ok(H.anc.join() === [...anc].sort().join(), `предки подсвечены (${H.anc.length}): ${H.anc.join(', ')}`);
  ok(H.desc.join() === [...desc].sort().join(), `потомки подсвечены (${H.desc.length})`);
  ok(H.mkl === H.anc.length && H.mkr === H.desc.length, `пометки «←» у предков (${H.mkl}) и «→» у потомков (${H.mkr})`);
  ok(H.on > 0 && H.direct === directN, `связи показаны: всего ${H.on}, прямых ${H.direct}`);
  ok(H.off === DATA.nodes.length - 1 - anc.size - desc.size, `остальные чипы побледнели: ${H.off}`);
  ok(await p.eval(`location.hash === '#rt1'`), 'адрес получил #rt1');
  if (ru && shots) await fullShot(p, path.join(SHOTS, 'ideas-map-card.png'));
  // клавиатура: Enter на чипе DAgger
  await p.eval(`document.querySelector('#imSvg .node[data-id="dagger"]').focus()`);
  await key(p, 'Enter', 'Enter');
  await sleep(200);
  ok(/DAgger/.test(await p.eval(`document.querySelector('#imCard h2').innerText`)), 'Enter на чипе открывает карточку (DAgger)');
  // кнопка «Привело к» в карточке ведёт к потомку
  await p.eval(CLICK('#imCard .im-chip.desc'));
  await sleep(150);
  ok(await p.eval(`document.querySelector('#imSvg .node.sel').dataset.id !== 'dagger'`), 'кнопка «Привело к» выбирает потомка');
  // Escape снимает выбор
  await key(p, 'Escape', 'Escape');
  await sleep(250);
  ok(await p.eval(`!document.querySelector('#imSvg .node.sel') && !!document.querySelector('#imCard .im-card-hint')`) && await p.eval(EDGES_ON) === 0, 'Escape снимает выбор, связи скрыты');
  // фильтр части «3»
  await p.eval(CLICK('#imFilter button[data-key="3"]'));
  await sleep(150);
  let dim = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .node.dim')].map((g) => g.dataset.id).sort())`));
  let expect = DATA.nodes.filter((x) => x.lesson.split('.')[0] !== '3').map((x) => x.id).sort();
  ok(dim.join() === expect.join(), `фильтр части «3»: побледнели ${dim.length} чипов других частей, остальные ${DATA.nodes.length - dim.length} — часть 3`);
  ok(await p.eval(`document.querySelector('#imFilter button[data-key="3"]').getAttribute('aria-pressed') === 'true'`), 'кнопка «3» нажата');
  await p.eval(CLICK('#imFilter button[data-key="0"]'));
  await sleep(150);
  dim = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .node.dim')].map((g) => g.dataset.id).sort())`));
  expect = DATA.nodes.filter((x) => x.lesson.split('.')[0] !== '0').map((x) => x.id).sort();
  ok(dim.join() === expect.join(), `фильтр части «0»: остались ${DATA.nodes.length - dim.length} работ части 0`);
  await p.eval(CLICK('#imFilter button[data-key="all"]'));
  // фильтр дорожки «data»
  await p.eval(CLICK('#imLanes button[data-key="data"]'));
  await sleep(150);
  dim = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .node.dim')].map((g) => g.dataset.id).sort())`));
  expect = DATA.nodes.filter((x) => x.lane !== 'data').map((x) => x.id).sort();
  ok(dim.join() === expect.join(), `фильтр дорожки «Данные»: побледнели ${dim.length}, остались ${DATA.nodes.length - dim.length}`);
  ok(await p.eval(`document.querySelectorAll('#imLanes button').length`) === DATA.lanes.length + 1, `кнопок дорожек ${DATA.lanes.length} + «все»`);
  await p.eval(CLICK('#imLanes button[data-key="classic"]'));
  await sleep(150);
  dim = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#imSvg .node.dim')].map((g) => g.dataset.id).sort())`));
  expect = DATA.nodes.filter((x) => x.lane !== 'classic').map((x) => x.id).sort();
  ok(dim.join() === expect.join(), `фильтр дорожки «Классика»: остались ${DATA.nodes.length - dim.length}`);
  await p.eval(CLICK('#imLanes button[data-key="all"]'));
  await sleep(100);
  ok(await p.eval(`document.querySelectorAll('#imSvg .node.dim').length`) === 0, 'фильтр «все» возвращает всё');
  ok(p.logs.length === 0, 'консоль чистая после действий' + (p.logs.length ? ': ' + p.logs.join(' | ') : ''));
  // тёмная тема — снимок для автора
  if (ru && shots) { const d = await open(B, url, 1440, 1000, { dark: true, light: false }); await d.eval(CLICK('#imSvg .node[data-id="rt1"]')); await sleep(300); await fullShot(d, path.join(SHOTS, 'ideas-map-dark.png')); }
}

async function checkPhone(B, url, lang) {
  const ru = lang === 'ru';
  console.log(`${lang}: 390 px`);
  const p = await open(B, url, 390, 844, { mobile: true });
  ok(p.logs.length === 0, 'консоль чистая' + (p.logs.length ? ': ' + p.logs.join(' | ') : ''));
  const sw = await p.eval(`Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)`);
  ok(sw <= 390, `нет горизонтальной прокрутки (ширина содержимого ${sw})`);
  ok(await p.eval(`!document.querySelector('#imSvg .im-axis') && document.querySelectorAll('#imSvg .im-year text').length > 3`), 'ось времени вертикальная, годы подписаны');
  ok(await p.eval(`document.querySelectorAll('#imSvg .node').length`) === DATA.nodes.length, 'чипов столько же');
  ok(await p.eval(`document.querySelectorAll('#imSvg .node .lane-tag').length`) === DATA.nodes.length, 'у каждого чипа метка дорожки');
  ok(await p.eval(EDGES_ON) === 0, 'в покое связей нет');
  const ov = await p.eval(OVERLAPS), mf = await p.eval(MIN_FONT);
  ok(ov.length === 0, '390: чипы и подписи не накладываются' + (ov.length ? `: ${ov.slice(0, 6).join('; ')}` : ''));
  ok(mf >= 12, `390: подпись чипа не мельче 12 px (${mf})`);
  if (ru && shots) await fullShot(p, path.join(SHOTS, 'ideas-map-phone.png'));
  await p.eval(CLICK('#imSvg .node[data-id="rt1"]'));
  await sleep(350);
  const directN = (byId.get('rt1').parents || []).length + children.get('rt1').length;
  ok(await p.eval(EDGES_ON) === directN, `связи только у выбранной работы: ${directN}`);
  const sheet = await p.eval(`(() => { const c = document.getElementById('imCard'); const r = c.getBoundingClientRect(); return { open: c.classList.contains('open'), fixed: getComputedStyle(c).position, bottom: Math.round(innerHeight - r.bottom), text: c.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60) }; })()`);
  ok(sheet.open && sheet.fixed === 'fixed' && Math.abs(sheet.bottom) < 2, `карточка открылась панелью снизу (${sheet.text}…)`);
  if (ru && shots) { await p.shot(path.join(SHOTS, 'ideas-map-phone-card.png')); console.log('  снимок shots/ideas-map-phone-card.png'); }
  await p.eval(CLICK('#imCard .im-close'));
  await sleep(300);
  ok(await p.eval(`!document.getElementById('imCard').classList.contains('open')`), 'кнопка × закрывает панель');
}

(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  try {
    await checkWide(B, PAGE, 'ru');
    await checkPhone(B, PAGE, 'ru');
    if (fs.existsSync(PAGE_EN)) {
      await checkWide(B, 'file://' + PAGE_EN, 'en');
      await checkPhone(B, 'file://' + PAGE_EN, 'en');
    } else console.log('— site/en/karta-idey.html не собрана, английская страница не проверена');
  } finally {
    await B.close();
  }
  console.log(bad ? `\n✗ не прошло проверок: ${bad}` : '\n✓ все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
