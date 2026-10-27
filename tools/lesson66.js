// Урок 6.6 «Обзор гуманоидных платформ»: таблица лаборатории сходится с правилами движка и с текстами,
// миссии проходятся через интерфейс (ставка, отметки, проверка, разбор ошибок и вторая попытка), фото платформ
// со свободной лицензией и одним соотношением сторон, схема движется и её подписи помещаются и не мельче 10 px
// на ширинах 1440, 1024, 768, 720, 640, 390 и 360, диаграммы построены, консоль чиста, телефон без прокрутки вбок.
// Снимки — shots/l66-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l66.
// node tools/lesson66.js          — проверка в headless Chrome (компьютер 1440, другие ширины, телефон 390, тёмная тема);
// node tools/lesson66.js --check  — данные таблицы, ответы миссий и числа текстов без браузера.
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const ROOT = path.resolve(__dirname, '..');
const LESSON = path.join(ROOT, 'lessons/l66/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const E = require('../lessons/l66/engine.js');
// слова о расположении на экране: в подписях и текстах говорим о ролях; «верхний/нижний уровень» — уровни управления, а не места на экране
const POS0 = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const noHier = (s) => String(s).replace(/(верхн|нижн)[а-яё]+ (уров[а-яё]+|блок[а-яё]*|стек[а-яё]*)/gi, 'уровень');
const POS = { test: (s) => POS0.test(noHier(s)) };
const posWord = (s) => { const m = noHier(s).match(POS0); return m ? m[2] : ''; };
const GEN = ['ни одной', 'одной', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми'];
const plat = (ids) => ids.filter((id) => id !== 'ada');
const names = (ids) => { const n = ids.map((id) => E.rowById(id).name); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' и ' + n[n.length - 1]; };
const ORDER = ['push', 'offline', 'human', 'shift', 'customer'];
const AXIS_OF_Q = { push: 'ctl', offline: 'ctl', human: 'data', shift: 'body', customer: 'use' };

/** Проверки данных и текстов без браузера. */
function dataChecks() {
  const txt = plain();
  check(E.ROWS.length === 9 && E.ROWS.filter((r) => r.ada).length === 1 && E.AXES.length === 4 && E.AXES.every((a) => a.cols.length === 3), `таблица: ${E.ROWS.length} строк (восемь платформ и Ада), четыре оси по три колонки`);
  const cellsBad = [];
  for (const r of E.ROWS) for (const c of Object.keys(E.COLS)) {
    const x = r.cells[c];
    if (!x) { cellsBad.push(`${r.id}.${c}: нет ячейки`); continue; }
    if (!x.t || /@@/.test(x.t)) cellsBad.push(`${r.id}.${c}: пустой текст`);
    if (!E.SRC[x.s]) cellsBad.push(`${r.id}.${c}: нет источника ${x.s}`);
    else if (!r.ada && !(E.SRC[x.s].u && /^https?:\/\//.test(E.SRC[x.s].u) && E.SRC[x.s].d)) cellsBad.push(`${r.id}.${c}: у источника нет адреса или даты`);
    if (!['nn', 'cl', 'mix', 'yes', 'no', 'na', 'i'].includes(x.m)) cellsBad.push(`${r.id}.${c}: метка ${x.m}`);
  }
  check(!cellsBad.length, 'у каждой ячейки есть текст, метка и источник с адресом и датой (у Ады — урок курса)' + (cellsBad.length ? ': ' + cellsBad.slice(0, 4).join('; ') : ''));
  const dossier = fs.readFileSync(path.join(ROOT, 'sources/dossier/6.6-obzor-platform.md'), 'utf8');
  const srcMiss = Object.entries(E.SRC).filter(([, s]) => s.u && !dossier.includes(s.u)).map(([k]) => k);
  check(!srcMiss.length, 'адреса всех источников таблицы есть в досье урока' + (srcMiss.length ? ': ' + srcMiss.join(', ') : ''));
  for (const q of ORDER) {
    const ra = E.ruleAnswer(q);
    check(JSON.stringify(ra) === JSON.stringify(E.Q[q].answer) && E.AXIS_OF[E.Q[q].col] === AXIS_OF_Q[q], `миссия «${q}»: ответ (${names(ra)}) выводится правилом из колонки «${E.COLS[E.Q[q].col].label}» оси «${AXIS_OF_Q[q]}»`);
  }
  const A = (q) => plat(E.Q[q].answer);
  check(A('push').length === 5 && A('offline').length === 5 && A('human').length === 4 && A('shift').length === 3 && A('customer').length === 5, `число платформ в ответах: толчок ${A('push').length}, без сети ${A('offline').length}, записи людей ${A('human').length}, смена ${A('shift').length}, заказчик ${A('customer').length}`);
  // текст после лаборатории
  const ta = sp(/<div class="prose"[^>]*id="tableAfter">([\s\S]*?)<\/div>/.exec(fs.readFileSync(LESSON, 'utf8'))[1]).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  const cnt = {}; for (const r of E.ROWS) if (!r.ada) for (const x of Object.values(r.cells)) cnt[x.m] = (cnt[x.m] || 0) + 1;
  const per = {}; for (const q of ORDER) for (const id of E.Q[q].answer) per[id] = (per[id] || 0) + 1;
  const near = E.ROWS.filter((r) => !r.ada).map((r) => [r.id, E.compare('ada', r.id).ndiff]).sort((a, b) => a[1] - b[1]);
  check(ta.includes(`у ${GEN[A('push').length]} платформ из восьми`) && A('offline').length === A('push').length && ta.includes(`у ${GEN[A('human').length]} платформ`) && ta.includes(`только ${names(A('shift'))}`), 'вывод после лаборатории называет те же числа и платформы, что движок');
  check(per.figure === 5 && per.atlas === 4 && per.digit === 4 && per.unitree === 1 && per.apollo === 1 && ta.includes('Figure 03 подходит под все пять ситуаций') && ta.includes('Atlas и Digit — под четыре'), `совпадения по платформам: ${JSON.stringify(per)}`);
  check(cnt.na >= 2 * cnt.no && cnt.na < 2.5 * cnt.no && ta.includes('вдвое чаще'), `«не опубликовано» встречается ${cnt.na} раз, «нет» — ${cnt.no}: «вдвое чаще», как в тексте`);
  check(near[0][0] === 'neo' && near[0][1] < near[1][1] && ta.includes('меньше всего Ада расходится с NEO'), `ближе всех к Аде — ${near[0][0]} (${near[0][1]} колонка), следующая — ${near[1][0]} (${near[1][1]})`);
  const ctlAll = []; const ids = E.ROWS.map((r) => r.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (E.compare(ids[i], ids[j]).rows.filter((x) => x.axis === 'ctl' && x.diff).length === 3) ctlAll.push(ids[i] + '–' + ids[j]);
  check(ctlAll.length >= 1, 'в свободном режиме есть пара платформ, которая расходится во всех трёх колонках управления: ' + ctlAll.join(', '));
  // тексты урока
  check(!/(^|[^а-яё])(ядро|углублени[ея])([^а-яё]|$)|⭐|➕/i.test(txt), 'в тексте нет меток «ядро», «углубление» и значков уровня урока');
  return txt;
}
if (process.argv.includes('--check')) { dataChecks(); finish(); } else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.join(ROOT, 'site/lessons/6-6-obzor-platform.html');
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
/** Отметить строки нажатием на названия (сначала снять все отметки), поставить ставку (если bet не null) и нажать «Проверить отметки». */
async function viaUI2(p, ids, bet) {
  const r = J(await p.eval(`(async () => {
    const root = document.querySelector('#tMis'), want = new Set(${JSON.stringify(ids)});
    const press = () => [...document.querySelectorAll('#tTable .pt-name')];
    // таблица перерисовывается после каждого нажатия, поэтому кнопку ищем заново каждый раз
    for (let b, k = 0; k < 20 && (b = document.querySelector('#tTable .pt-name[aria-pressed="true"]')); k++) b.click();
    for (const id of want) { const b = document.querySelector('#tTable .pt-name[data-row="' + id + '"]'); if (b) b.click(); }
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 150));
    for (let i = 0; i < 200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    const rows = Object.fromEntries([...document.querySelectorAll('#tTable .pt-row')].map((r) => [r.querySelector('.pt-name').dataset.row, r.className]));
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '', rows, sel: press().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.row) });
  })()`, true));
  r.out = sp(r.out); return r;
}
const nextMission = (p) => p.eval(`(() => { const b = document.querySelector('#tMis .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
/** Подписи схемы: в канвасе, без наложений, не мельче 10 px на экране и внутри своего блока (наименьший скруглённый прямоугольник вокруг центра подписи). */
async function schemeLabels(p, kind, frames) {
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(250);
  return J(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]'); if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [] });
    const Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, oR = Pr.roundRect, bad = new Set(), texts = new Set(), prints = new Set();
    let rects = null, boxes = null, minPx = 99;
    Pr.roundRect = function (x, y, w, h) { if (rects && this.canvas === cv) { const t = this.getTransform(); rects.push([x * t.a + t.e, y * t.d + t.f, w * t.a, h * t.d]); } return oR.apply(this, arguments); };
    Pr.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const X = x * t.a + t.e, Y = y * t.d + t.f, W = m.width * t.a, x0 = a === 'center' ? X - W / 2 : a === 'right' ? X - W : X; boxes.push({ t: String(txt), x0, x1: x0 + W, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, cy: Y, fs: fs * t.a }); }
      return oT.apply(this, arguments);
    };
    for (const t of ${JSON.stringify(frames)}) {
      rects = []; boxes = []; Anim.seek(cv, t); const R = rects, b = boxes; rects = boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 7) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      const Wc = cv.width, Hc = cv.height, dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of b) {
        texts.add(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px;
        if (px < 9.95) bad.add('мельче 10 px: «' + q.t + '» ' + px.toFixed(1));
        if (q.x0 < 1 || q.x1 > Wc - 1 || q.y0 < 0 || q.y1 > Hc) bad.add('за краем: «' + q.t + '»');
        const cx = (q.x0 + q.x1) / 2, own = R.filter(([x, y, w, h]) => cx >= x && cx <= x + w && q.cy >= y && q.cy <= y + h).sort((u, v) => u[2] * u[3] - v[2] * v[3])[0];
        if (own && (q.x0 < own[0] + 2 || q.x1 > own[0] + own[2] - 2)) bad.add('шире блока: «' + q.t + '»');
      }
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0); if (ox > 1 && oy > 1) bad.add('«' + b[i].t + '» на «' + b[j].t + '»'); }
    }
    Pr.fillText = oT; Pr.roundRect = oR;
    return JSON.stringify({ layout: cv.dataset.layout, bad: [...bad], texts: [...texts], minPx, distinct: prints.size });
  })()`));
}
/** Ничего не шире экрана и своей карточки: страница, лаборатория, таблица, диаграммы, ряд фото. */
const overflow = (p, w) => p.eval(`JSON.stringify({ sw: document.documentElement.scrollWidth,
  lab: [...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length,
  stat: [...document.querySelectorAll('.stat-fig')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  photo: [...document.querySelectorAll('.robot-row')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  cells: [...document.querySelectorAll('#tTable .pt-cell')].filter((c) => c.scrollWidth > c.clientWidth + 1).length })`).then(J);
const FRAMES = [0.5, 1.7, 3.1, 4.7, 5.4, 6.6, 7.6];
(async () => {
  const txt = dataChecks();
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^5 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    // разминка по 6.5: разделы и их названия — как в уроке 6.5
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l65 = fs.readFileSync(path.join(ROOT, 'lessons/l65/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l65); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.5' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.5: три вопроса, разделы и названия совпадают с h2 урока 6.5: ' + rec.q.map((q) => q.sec).join(', '));
    const lead = await text(p, '.hero .lead');
    const l65bridge = sp(/<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(l65)[1].replace(/<[^>]+>/g, ''));
    check(/^В уроке 6\.5 мы собрали Аду/.test(lead) && ['продаёт G1 от $13 500', 'волновых редукторах и линейных приводах', 'Atlas весит 90 кг'].every((x) => lead.includes(x) && l65bridge.includes(x)) && /что в каждой делает нейросеть, а что классика/.test(l65bridge) && lead.includes('что у них делает нейросеть, а что написали люди'), 'начало урока подхватывает мост из 6.5: цена G1, приводы Optimus, масса Atlas и вопрос «что делает нейросеть, а что классика»');
    const note = await text(p, '#axes .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#axes .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде при первом упоминании в тексте: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href'), to: b.querySelector('.bridge-to') && b.querySelector('.bridge-to').textContent.trim() })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /^Урок 7\.1 · Модели мира и Dreamer: как /.test(bn[0].to) && !bn[0].a && /модел[иь] мира/i.test(bn[0].t), 'мост в часть 7 в конце урока, без ссылки (файла 7.1 ещё нет): ' + bn.map((b) => `${b.sec} «${b.to}» → ${b.a || 'без ссылки'}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check(!(await p.eval(`/учител|подзадач|[^а-яё]мод(а|ы|у|ой)[^а-яё]/i.test(document.querySelector('main').innerText)`)) && !(await p.eval(`!!document.querySelector('.gl[data-gl="expert"]')`)), 'слов «учитель», «подзадача», «мода» нет, «эксперт» не подсвечен как термин из части 1 (ложных подсказок глоссария нет)');
    check(!(await p.eval(`/(^|[^а-яё])(вывод(ом|а|у)?\\s+модел)/i.test(document.querySelector('main').innerText)`)), 'запуск модели не называется «выводом»');
    check(!/[^а-яё](демонстраци[а-яё]+)\s+(Optimus|роботов на публике|на вечере)/i.test(txt) && txt.includes('показ'), 'публичные выступления называются «показом», а не «демонстрацией» (это слово занято записями для обучения)');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- фото платформ ----------
    await p.eval(`document.getElementById('axes').scrollIntoView({ behavior: 'instant' }); true`); await sleep(400);
    await p.waitFor(`[...document.querySelectorAll('.robot-row img')].every((i) => i.complete && i.naturalWidth > 0)`, 15000);
    const ph = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.robot-row figure.photo-fig')].map((f) => { const i = f.querySelector('img'), c = f.querySelector('.photo-cred'); return { src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, alt: i.alt, cred: c && c.textContent, href: c && c.getAttribute('href') }; }))`));
    const lic = /· (CC0|CC BY 2\.0|CC BY 4\.0|CC BY-SA 4\.0) · кадр обрезан$/;
    check(ph.length === 5 && ph.every((x) => x.w * 3 === x.h * 2 && x.alt.length > 20 && /^Фото: /.test(x.cred) && lic.test(x.cred) && /^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|arxiv\.org\/abs\/)/.test(x.href)), 'пять фото платформ: все 2 : 3 (600 × 900), подпись «Фото: автор · свободная лицензия · кадр обрезан» со ссылкой на страницу файла или статью: ' + ph.map((x) => x.src.split('/').pop() + ' ' + x.w + '×' + x.h).join(', '));
    check(ph.every((x) => fs.existsSync(path.join(ROOT, 'site', x.src.replace('../', '')))), 'файлы фото лежат в site/assets/img/robots');
    const dossier = fs.readFileSync(path.join(ROOT, 'sources/dossier/6.6-obzor-platform.md'), 'utf8');
    void dossier;
    await show(p, 'axes', '#axes .robot-row', 'l66-photos.png');

    // ---------- схема ----------
    const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="stacks"]'); Anim.seek(cv, 1.0); const x = cv.toDataURL(); Anim.seek(cv, 4.9); return x !== cv.toDataURL(); })()`);
    check(moved, 'схема stacks движется: кадры в разные моменты разные');
    const sl = await schemeLabels(p, 'stacks', FRAMES);
    check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES.length, `схема stacks (широкая, 1440): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках, ${sl.distinct} разных кадров` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
    check(!sl.texts.some((x) => POS.test(x)), 'схема: в подписях нет слов о расположении');
    const st = sl.texts.join(' ');
    check(['MPC-планировщик', 'контроллер всего тела', 'LBM: 450 млн параметров', 'MPC Boston Dynamics', 'S2: модель зрения и языка', 'S1: цели всех суставов', 'S0: сеть на 10 млн', '200 раз в секунду', '1000 раз в секунду, равновесие', 'толчок в корпус'].every((x) => st.includes(x)), 'схема называет блоки трёх стеков, частоты Helix 02 и толчок');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="stacks"]'), 4.9); true`); await show(p, 'control', '#control .flow-card', 'l66-stacks.png');
    // подписи и тексты по ролям
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro, .stat-cap, details.deep')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи фото, схемы, диаграмм, таблицы и «Под капотом» — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map(posWord).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify(window.__l66.TabLab.missions.flatMap((m) => [m.title, m.text, m.hint, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    const cellTxt = E.ROWS.flatMap((r) => Object.values(r.cells).map((x) => x.t));
    check(!cellTxt.some((x) => POS.test(x)), 'ячейки таблицы без слов о расположении');
    // диаграммы
    const stats = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.stat-fig')].map((f) => ({ id: f.querySelector('.stat-bars') && f.querySelector('.stat-bars').id, bars: f.querySelectorAll('.sb-bar').length, caps: f.querySelectorAll('.stat-cap').length, legends: f.querySelectorAll('.sb-legend').length, src: /Источник/.test(f.querySelector('.stat-cap').textContent) })))`));
    check(stats.length === 7 && stats.every((s) => s.bars >= 3 && s.caps === 1 && s.src) && stats.filter((s) => s.legends >= 1).length >= 2, 'семь диаграмм чисел (StatsChart): у каждой не меньше трёх столбцов и подпись с источником, легенды при двух рядах: ' + stats.map((s) => `${s.id}:${s.bars}`).join(', '));
    const zb = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#zestBars .sb-bar b')].map((b) => b.textContent))`));
    check(JSON.stringify(zb) === JSON.stringify(['2,7', '3,2', '6,7', '4,4', '13,6', '5,0', '8,4', '4,9', '5,5']), 'диаграмма ZEST: ошибки из таблицы 2 статьи, переведённые в градусы, как в подписи: ' + zb.join(' '));
    for (const [id, sel, n] of [['control', '#control .stat-fig', 'l66-stat-zest.png'], ['data', '#data .stat-fig', 'l66-stat-data.png'], ['body', '#body .stat-fig', 'l66-stat-mass.png'], ['work', '#work .stat-fig', 'l66-stat-price.png'], ['today', '#today .stat-fig:last-of-type', 'l66-stat-gr2.png']]) await show(p, id, sel, n);

    // ---------- лаборатория ----------
    console.log('лаборатория');
    check(!(await visible(p, '#wrapTAxis')) && (await p.eval(`document.querySelectorAll('#tTable .pt-row').length`)) === 9 && (await p.eval(`document.querySelectorAll('#tTable .pt-head > div').length`)) === 4, 'миссия 1: переключатель осей скрыт, таблица: 9 строк и три колонки оси «Управление»');
    check(/^Отметь строки/.test(await text(p, '#tCount')) && !(await visible(p, '#tSrc')), 'до отметок итог не показан, подсказка «Отметь строки»');
    await p.eval(`document.querySelector('#tTable .pt-cell[data-row="figure"][data-col="low"]').click(); true`);
    const srcLine = await text(p, '#tSrc');
    check(srcLine.startsWith('Figure 03 · Нижний уровень.') && srcLine.includes('Источник: Figure, «Helix 02», 27.01.2026'), 'нажатие на ячейку показывает факт и источник с датой: ' + srcLine.slice(0, 90));
    await p.eval(`document.querySelector('#tTable .pt-cell[data-row="figure"][data-col="low"]').click(); true`);
    await show(p, 'table', '#table .lab', 'l66-lab-start.png');
    const outs = [];
    const betRight = J(await p.eval(`JSON.stringify(window.__l66.TabLab.missions.slice(0, 5).map((m, i) => m.bet.answer(window.__l66.L66.check(${JSON.stringify(ORDER)}[i], []))))`));
    for (let i = 0; i < ORDER.length; i++) {
      const q = ORDER[i], ans = E.Q[q].answer, axis = AXIS_OF_Q[q];
      if (i >= 2) {
        check(await visible(p, '#wrapTAxis'), `миссия ${i + 1}: переключатель осей виден, ось выбирает читатель`);
        await p.eval(`document.querySelector('#tAxis button[data-v="${axis}"]').click(); true`);
        check((await p.eval(`document.querySelectorAll('#tTable .pt-head > div').length`)) === 4 && (await text(p, '#tTable .pt-head')).includes(E.COLS[E.Q[q].col].label), `миссия ${i + 1}: на оси «${axis}» видна колонка «${E.COLS[E.Q[q].col].label}»`);
      } else check(!(await visible(p, '#wrapTAxis')), `миссия ${i + 1}: ось «Управление» задана, переключатель скрыт`);
      // первая попытка: одна верная строка пропущена, одна лишняя
      const wrongExtra = E.ROWS.map((r) => r.id).find((id) => !ans.includes(id));
      const first = ans.slice(1).concat([wrongExtra]);
      let r = await viaUI2(p, first, betRight[i]); outs.push(r.out);
      check(!r.ok && r.rows[ans[0]].includes('pt-miss') && r.rows[wrongExtra].includes('pt-extra') && /Пока не так/.test(r.out) && r.out.includes('Пропущены:') && r.out.includes('Лишние:') && r.out.includes(E.rowById(ans[0]).name + ':'), `миссия ${i + 1} (${q}), первая попытка: пропущена ${ans[0]}, лишняя ${wrongExtra} — строки обведены, разбор называет обе`);
      r = await viaUI2(p, ans, null); outs.push(r.out);
      const expNames = q === 'offline' ? names(plat(ans).concat(['ada'])) : names(plat(ans));
      check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(expNames) && r.out.includes(E.Q[q].rest.slice(0, 40)), `миссия ${i + 1} (${q}), вторая попытка засчитана: ставка сыграла, разбор называет ${expNames}`);
      if (i === 0) { check(r.out.includes(`то есть у ${GEN[plat(ans).length]} платформ из восьми`), 'разбор миссии 1 называет число платформ словами, как вывод после лаборатории'); await show(p, 'table', '#table .lab', 'l66-lab-m1.png'); }
      if (i === 3) await show(p, 'table', '#table .lab', 'l66-lab-m4.png');
      await nextMission(p);
    }
    // свободный режим: две платформы рядом
    check(await visible(p, '#wrapTAxis') && /Нажми на названия двух платформ/.test(await text(p, '#tCount')), 'свободный режим: переключатель осей виден, подсказка про две платформы');
    await p.eval(`document.querySelector('#tTable .pt-name[data-row="ada"]').click(); document.querySelector('#tTable .pt-name[data-row="neo"]').click(); true`); await sleep(150);
    const cmp = await text(p, '#tCmp'), nd = E.compare('ada', 'neo').ndiff;
    check(await visible(p, '#tCmp') && cmp.includes('Ада') && cmp.includes('NEO') && cmp.includes(`расходятся: ${nd} из 12`) && (await p.eval(`document.querySelectorAll('#tCmp tr.pt-diff').length`)) === nd, `сравнение Ады и NEO рядом: ${nd} из 12 колонок расходятся, они подсвечены`);
    await p.eval(`document.querySelector('#tTable .pt-name[data-row="unitree"]').click(); true`); await sleep(100);
    check((await text(p, '#tCount')).includes('Сравниваются NEO и Unitree G1'), 'третье нажатие заменяет первую платформу сравнения');
    await show(p, 'table', '#table .lab', 'l66-lab-free.png');
    const ta = await text(p, '#tableAfter');
    check(ta.includes(`у ${GEN[plat(E.Q.push.answer).length]} платформ из восьми`) && ta.includes(`только ${names(plat(E.Q.shift.answer))}`), 'текст после лаборатории называет те же числа, что разборы');
    const deep = await text(p, '#table details.deep');
    check(deep.includes('Ответ на каждую миссию выводится из меток одной колонки') && deep.includes('Случайности в лаборатории нет'), '«Под капотом» описывает, как выводятся ответы, и что случайности нет');
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map(posWord).join(', ') : ''));
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);

    // ---------- итоги, квиз, глоссарий, ссылки, консоль ----------
    const fin = await text(p, '#finale .takeaways');
    check(['вдвое чаще', 'S0 у Figure', 'моторная кора', 'ZEST', 'Большая поведенческая модель', 'RaaS', 'пилоты', 'We, Robot', 'ближе всех к NEO', 'Модели мира'].every((x) => fin.includes(x)), 'итоги урока называют выводы разделов и лаборатории');
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l66.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел');
    const answers = J(await p.eval(`JSON.stringify(window.__l66.QUIZ.map((q) => q.a))`));
    check(new Set(answers).size === 3, 'квиз: верные ответы стоят на всех трёх местах в данных: ' + answers.join(''));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'ошибок KaTeX нет');
    const links = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('http') && !h.startsWith('#')))`));
    check(links.every((h) => /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h)) && links.includes('0-1-dve-paradigmy.html#ada') && !links.some((h) => /^7-1/.test(h)), 'ссылки на уроки курса: ' + [...new Set(links)].join(', '));
    const ext = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href^="http"]')].map((a) => a.getAttribute('href')))`));
    check(!ext.some((h) => /theverge|techcrunch|bloomberg|electrek|youtube\.com\/embed/.test(h)) && !(await p.eval(`!!document.querySelector('main iframe, main video')`)), 'ссылки — на первоисточники, пересказов прессы и встроенного видео нет');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    await p.eval(`window.__l66.Tab.enter('push', 'ctl'); window.__l66.Tab.pick(['figure', 'atlas']); true`);
    for (const [id, sel, n] of [['table', '#table .lab', 'l66-lab-dark.png'], ['control', '#control .flow-card', 'l66-stacks-dark.png'], ['axes', '#axes .robot-row', 'l66-photos-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    // ---------- другие ширины ----------
    console.log('ширины');
    const q = await B.page(url, { width: 1024, height: 900, light: true });
    for (const w of [1024, 768, 720, 640, 360]) {
      await q.S('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: w <= 640 ? 2 : 1, mobile: w <= 640 });
      await q.eval('window.__lessonReady = false; location.reload(); true'); await sleep(300);
      await q.waitFor('window.__lessonReady === true', 30000); await sleep(500);
      const s2 = await schemeLabels(q, 'stacks', FRAMES), ov = await overflow(q, w);
      check(!s2.none && !s2.bad.length && s2.minPx >= 9.95 && s2.layout === (w <= 640 ? 'n' : 'w'), `ширина ${w}: схема (${s2.layout === 'w' ? 'широкая' : 'узкая'}) — подписи не мельче 10 px (наименьшая ${s2.minPx && s2.minPx.toFixed(1)}), в блоках, без наложений` + (s2.bad.length ? ': ' + s2.bad.slice(0, 3).join('; ') : ''));
      check(ov.sw <= w && !ov.lab && !ov.stat && !ov.photo && !ov.cells, `ширина ${w}: страница ${ov.sw} px, лаборатория, диаграммы, фото и ячейки таблицы не шире карточек`);
    }
    check(!q.logs.length, 'другие ширины: консоль ' + (q.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    const ovm = await overflow(m, 390);
    check(ovm.sw <= 390 && !ovm.lab && !ovm.stat && !ovm.photo && !ovm.cells, `телефон: ширина ${ovm.sw}, лаборатория, диаграммы, фото и ячейки не шире карточек`);
    const sm2 = await schemeLabels(m, 'stacks', FRAMES);
    check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length && sm2.minPx >= 9.95, `телефон, схема (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    const mob = J(await m.eval(`JSON.stringify({ head: getComputedStyle(document.querySelector('#tTable .pt-head')).display, label: getComputedStyle(document.querySelector('#tTable .pt-cell .pt-col-l')).display, cols: getComputedStyle(document.querySelector('.robot-row')).gridTemplateColumns.split(' ').length, top: (() => { const t = document.querySelector('#tMis .m-top').getBoundingClientRect().top, s = document.querySelector('#tTable').getBoundingClientRect().top, b = document.querySelector('#tMis .m-bottom').getBoundingClientRect().top; return t < s && s < b; })() })`));
    check(mob.head === 'none' && mob.label === 'block' && mob.cols === 2 && mob.top, 'телефон: строки таблицы стали карточками с названиями колонок, фото в два столбца, условие миссии над таблицей, проверка — под ней');
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['axes', '#axes .robot-row', 'l66-m-photos.png'], ['control', '#control .flow-card', 'l66-m-stacks.png'], ['table', '#table .lab', 'l66-m-lab.png'], ['control', '#control .stat-fig', 'l66-m-stat-zest.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
