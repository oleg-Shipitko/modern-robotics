// Урок 3.1 «RT-1»: лаборатория и интерактив дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// схемы «rt1» и «film» движутся, подписи схемы «film» помещаются в канвас, не налезают друг на друга и не мельче 10 px
// на ширинах 1440, 1024, 768, 720, 640 (компьютер) и 390, 360 (телефон) в обеих раскладках и на обоих языках,
// глоссарий подсвечивает «токен действия» своим термином, карточки «Что помогло» дают переложить ошибочные,
// консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l31-*.png.
// Урок собирается на дату выпуска части: MR_ASOF=2026-10-26 python3 lessons/build.py l31 --both.
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/3-1-rt-1.html');
const urlEn = 'file://' + path.resolve(__dirname, '../site/en/lessons/3-1-rt-1.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ');
// слова о расположении на экране: в подписях и текстах говорим о ролях (на телефоне раскладка другая)
const POS = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const FILM = [0.8, 2.5, 4.3, 6.4, 8.5, 10.2, 12.0];           // моменты схемы «film»: по одному на фазу и финал
const FILM_KEYS = ['масштаб 1, сдвиг 0: слой прозрачен', 'команда становится вектором', 'из вектора: масштаб и сдвиг на каждый канал', 'одни каналы усилены, другие погашены', 'карта признаков даёт 81 токен', 'TokenLearner оставляет 8 токенов', 'на каждый канал: ×масштаб, +сдвиг', 'Кадр', 'свёрточные блоки', 'FiLM-слой', 'Карта признаков', '512 каналов на клетку', '9 × 9 клеток', 'вектор команды', 'Масштаб γ и сдвиг β', 'два малых слоя', 'Масштаб и сдвиг', '512 каналов'];
const plain = (file) => sp(fs.readFileSync(path.resolve(__dirname, '../lessons/l31/' + file), 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const tState = (p) => p.eval(`JSON.stringify(window.__l31.LabTokens.api.state())`).then(J);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const seekShow = async (p, kind, t, file, pad) => { await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); Anim.seek(cv, ${t}); cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(300); await p.shotEl(out(file), `figure:has(> canvas[data-anim="${kind}"])`, pad == null ? 6 : pad); };
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
      rects = []; boxes = []; Anim.seek(cv, t); const Rr = rects, b = boxes; rects = boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 7) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      const Wc = cv.width, Hc = cv.height, dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of b) {
        texts.add(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px;
        if (px < 9.95) bad.add('мельче 10 px: «' + q.t + '» ' + px.toFixed(1));
        if (q.x0 < 1 || q.x1 > Wc - 1 || q.y0 < 0 || q.y1 > Hc) bad.add('за краем: «' + q.t + '»');
        const cx = (q.x0 + q.x1) / 2, own = Rr.filter(([x, y, w, h]) => cx >= x && cx <= x + w && q.cy >= y && q.cy <= y + h).sort((u, v) => u[2] * u[3] - v[2] * v[3])[0];
        if (own && (q.x0 < own[0] + 2 || q.x1 > own[0] + own[2] - 2)) bad.add('шире блока: «' + q.t + '»');
      }
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0); if (ox > 1 && oy > 1) bad.add('«' + b[i].t + '» на «' + b[j].t + '»'); }
    }
    Pr.fillText = oT; Pr.roundRect = oR;
    return JSON.stringify({ layout: cv.dataset.layout, bad: [...bad], texts: [...texts], minPx, distinct: prints.size, cssW: cv.getBoundingClientRect().width });
  })()`));
}
/** Подписи схемы «film» на нескольких ширинах окна: ширина меняется, схема перерисовывается. Возвращает набор увиденных раскладок. */
async function filmWidths(p, widths, mobile, tag) {
  const layouts = new Set();
  for (const w of widths) {
    await p.S('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
    await p.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
    const r = await schemeLabels(p, 'film', FILM); layouts.add(r.layout);
    check(!r.none && !r.bad.length && r.distinct === FILM.length, `${tag}, ширина ${w}: схема film (${r.layout === 'n' ? 'узкая' : 'широкая'} раскладка, канвас ${Math.round(r.cssW)} px) — подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${r.minPx && r.minPx.toFixed(1)}), в своих блоках, ${r.distinct} разных кадров` + (r.bad.length ? ': ' + r.bad.slice(0, 4).join('; ') : ''));
  }
  return layouts;
}
(async () => {
  // ---------- исходники: тексты по замечаниям автора ----------
  console.log('исходники');
  const ru = plain('lesson.html'), en = plain('lesson.en.html');
  check(ru.includes('Действие робота на каждом шаге состоит из 11 чисел: семь задают руку') && ru.includes('три задают движение базы; одно выбирает режим'), 'лид объясняет, из чего состоят 11 чисел действия');
  check(ru.includes('1,28 миллиона фотографий') && ru.includes('один из 1000 классов') && ru.includes('сравнивали CLIP и ResNet-50'), 'ImageNet объяснён на месте: 1,28 млн фотографий, 1000 классов, ссылка на 2.1');
  check(ru.includes('В Gato, модели DeepMind 2022 года (Reed и соавторы, «A Generalist Agent»)') && ru.includes('604 задачах') && ru.includes('Gato из раздела «Устройство»'), 'Gato представлен при первом упоминании и согласован в «Под капотом»');
  check(ru.includes('каждый канал умножают на свой масштаб и прибавляют к нему свой сдвиг') && ru.includes('масштаб у всех каналов равен 1, а сдвиг равен 0') && ru.includes('приходится 16 млн из 35 млн параметров модели'), 'абзац про FiLM: что делает слой, почему масштаб 1 и сдвиг 0, к чему относятся 16 млн');
  check(en.includes('seven set the arm') && en.includes('1.28 million photos') && en.includes('604 tasks') && en.includes('16M of the model\'s 35M parameters'), 'английская разметка содержит те же правки');
  const caps = [...fs.readFileSync(path.resolve(__dirname, '../lessons/l31/lesson.html'), 'utf8').matchAll(/<figcaption class="cv-note">([\s\S]*?)<\/figcaption>/g)].map((m) => m[1]);
  check(caps.length === 2 && /команда встречается с картинкой/.test(caps[0]) && !POS.test(caps[0]), 'подпись схемы film — по ролям, без «слева/справа/сверху/снизу»');
  const dict = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lessons/l31/i18n.en.json'), 'utf8'));
  const longer = FILM_KEYS.filter((k) => !dict[k] || dict[k].length > Math.max(k.length * 1.2, k.length + 2));
  check(!longer.length, 'английские подписи схемы film переведены и не длиннее русских больше чем на 20%' + (longer.length ? ': ' + longer.join(', ') : ''));
  const gjson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lessons/shared/glossary.json'), 'utf8'));
  const gTok = gjson.find((g) => g.id === 'action-token'), gBins = gjson.find((g) => g.id === 'action-bins');
  check(gTok && gTok.l === 'l31' && gTok.sec === 'arch' && !gBins.a.includes('токен(?:'), 'глоссарий: термин «Токен действия» ведёт в 3.1 «От кадра до токенов действия», из «Корзин действий» формы «токен действия» убраны');

  const B = await launch({ w: 1460, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^8 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.3: три вопроса');
  check((await p.eval(`!!document.querySelector('a[href="3-2-vision-language-modeli.html"]')`)), 'ссылка на урок 3.2 на месте');
  await p.eval('window.__l31.SPEED.k = 20; true');
  // глоссарий: «токен действия» подсвечен своим термином в разделе «Устройство»
  const gl = J(await p.eval(`(() => { const d = JSON.parse(document.getElementById('glData').textContent), e = document.querySelector('.gl[data-gl="action-token"]'); return JSON.stringify({ t: d['action-token'] && d['action-token'].t, here: d['action-token'] && d['action-token'].here, sec: e && e.closest('section').id, text: e && e.textContent, bins: (document.querySelector('.gl[data-gl="action-bins"]') || {}).textContent || '' }); })()`));
  check(gl.t === 'Токен действия' && gl.here === true && gl.sec === 'arch' && /токен действия/.test(gl.text) && !/^токен/i.test(gl.bins), `глоссарий на странице: «${gl.text}» → «${gl.t}» (раздел ${gl.sec}); «Корзины действий» подсвечены на «${gl.bins}»`);

  // ---------- схемы и калькулятор ----------
  console.log('схемы и калькулятор');
  const anim = J(await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="rt1"]'); Anim.seek(cv, 1.0); const a = cv.toDataURL(); Anim.seek(cv, 7.0); const b = cv.toDataURL(); Anim.seek(cv, 10.5); const c = cv.toDataURL(); return JSON.stringify({ ab: a !== b, bc: b !== c, w: cv.width }); })()`));
  check(anim.ab && anim.bc, 'схема RT-1 движется: кадры в 1, 7 и 10,5 с различаются');
  await show(p, 'arch', 'figure:has(> canvas[data-anim="rt1"])', 'l31-flow.png');
  const film = await schemeLabels(p, 'film', FILM);
  check(!film.none && film.layout === 'w' && film.distinct === FILM.length, `схема film движется: ${film.distinct} разных кадров из ${FILM.length}`);
  const want = ['масштаб 1, сдвиг 0: слой прозрачен', 'команда становится вектором', 'из вектора: масштаб и сдвиг на каждый канал', 'одни каналы усилены, другие погашены', 'карта признаков даёт 81 токен', 'TokenLearner оставляет 8 токенов', 'FiLM', 'USE', 'γ', 'β', '«возьми красный кубик»', 'EfficientNet-B3', 'Карта признаков', '81 токен', 'TokenLearner', '8 токенов', 'Sentence Encoder', 'Масштаб γ и сдвиг β'];
  const miss = want.filter((x) => !film.texts.includes(x));
  check(!miss.length, 'схема film называет все шаги: состояние слоя, команда → вектор → γ и β → каналы → 81 → 8 токенов' + (miss.length ? '; нет: ' + miss.join(', ') : ''));
  check(!film.texts.some((x) => POS.test(x)), 'схема film: в подписях нет слов о расположении');
  const layouts = await filmWidths(p, [1440, 1024, 768, 720, 640], false, 'RU');
  check(layouts.has('w') && layouts.size === 1, 'RU, компьютер: на ширинах 1440…640 схема film в широкой раскладке (узкая — на телефоне, 390 и 360)');
  await p.S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await p.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
  await seekShow(p, 'film', 6.4, 'l31-film-desk.png');
  check(/130\s?200/.test(await p.eval(`document.getElementById('cEpisodes').textContent`)) && /^17/.test(await p.eval(`document.getElementById('cMonths').textContent`)), 'калькулятор: 744 × 175 = 130 200 эпизодов, 17 месяцев');
  await p.eval(`(() => { const i = document.getElementById('cRobots'); i.value = 1; i.dispatchEvent(new Event('input')); return true; })()`);
  check(/лет/.test(await p.eval(`document.getElementById('cMonths').textContent`)), 'один робот: срок в годах — ' + await p.eval(`document.getElementById('cMonths').textContent`));
  // тексты миссий — по ролям и полными предложениями (без цепочек «X — Y» в разборах)
  const misTxt = J(await p.eval(`JSON.stringify(['LabTokens', 'LabAbl'].flatMap((k) => (window.__l31[k].missions || []).flatMap((m) => [m.title, m.text, m.hint, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean)))`));
  const misBad = misTxt.filter((x) => POS.test(x));
  check(misTxt.length > 30 && !misBad.length, `тексты миссий (${misTxt.length} строк) по ролям` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));

  // ---------- лаборатория «Действие как токен» ----------
  console.log('Действие как токен');
  let r = await viaUI(p, '#tMis', 1);
  let s = await tState(p);
  check(r.ok && s.B === 8 && s.quantHits === 10, `миссия 1: 8 корзин — центр корзины попадает в ${s.quantHits} из 30`);
  check(/ставка сыграла/i.test(r.out) && /попал в кубик в 10 сценах из 30/.test(r.out), 'разбор миссии 1 называет 10 сцен из 30, ставка «каждая третья» сыграла');
  await nextMission(p, '#tMis'); await sleep(100);
  s = await tState(p);
  check(s.small && s.B === 16 && s.quantHits === 22 && !(await critOk(p, '#tMis')), `миссия 2: мелкий кубик, 16 корзин — ${s.quantHits} из 30, ещё не засчитано`);
  await p.eval(`window.__l31.LabTokens.api.setBins(3); true`); await sleep(100);
  s = await tState(p);
  check(s.B === 32 && s.quantHits === 30 && await critOk(p, '#tMis'), 'миссия 2: 32 корзины — 30 из 30, засчитана');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 0);
  check(r.ok && /ставка сыграла/i.test(r.out), 'миссия 3: 8 корзин обучены — ставка «сетка ограничит» сыграла');
  s = await tState(p);
  check(s.last && s.last.B === 8 && s.last.hits === 10 && s.last.exact === 25, `модель 8 корзин: попаданий ${s.last.hits} из 30, точная корзина ${s.last.exact}`);
  const o3 = sp(r.out);
  check(new RegExp(`выучила разметку: в ${s.last.exact} сценах из 30 она назвала ту корзину`).test(o3) && new RegExp(`попал в кубик только в ${s.last.hits} сценах, столько же, сколько дала сетка без обучения в первой миссии`).test(o3) && /Причина в сетке, а не в модели/.test(o3) && /Цветная заливка на столе показывает, куда смотрела модель/.test(o3), 'разбор миссии 3: что выучила модель → что получил робот → почему → что показывает заливка, со своими числами');
  check(!/Классов на ось всего/.test(o3) && !POS.test(o3), 'разбор миссии 3 без старой телеграфной формулировки и без слов о расположении');
  await show(p, 'tokens', '#tokens .lab', 'l31-mission8-desk.png');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 1);
  s = await tState(p);
  check(r.ok && s.last.B === 256 && s.last.hits === 7 && s.last.exact === 0 && /ставка сыграла/i.test(r.out), `миссия 4: 256 корзин на 300 демонстрациях — ${s.last.hits} из 30, точных ${s.last.exact}`);
  check(new RegExp(`Модель попала в ${s.last.hits} сценах из 30, точную корзину назвала в ${s.last.exact}`).test(sp(r.out)), 'разбор миссии 4 полными предложениями со своими числами');
  await nextMission(p, '#tMis');
  await p.eval(`window.__l31.LabTokens.api.setBins(2); true`);
  r = await viaUI(p, '#tMis', 0);
  s = await tState(p);
  check(r.ok && s.last.B === 16 && s.last.hits === 22, `миссия 5: 16 корзин — ${s.last.hits} из 30, не меньше 20`);
  check(new RegExp(`С 16 корзинами модель попала в ${s.last.hits} сценах из 30 и в ${s.last.exact} назвала точную корзину`).test(sp(r.out)), 'разбор миссии 5 полными предложениями со своими числами');
  check((await p.eval(`document.querySelectorAll('#tModels .mdl').length`)) === 3, 'три модели рядом на одной сцене: карточки 8, 256 и 16');
  await show(p, 'tokens', '#tokens .lab', 'l31-tokens.png');
  await nextMission(p, '#tMis');
  r = await viaUI(p, '#tMis', 0);
  s = await tState(p);
  check(r.ok && s.last.B === 256 && s.last.n === 1000 && s.last.hits === 11 && /ставка сыграла/i.test(r.out), `миссия 6: 256 корзин на 1000 демонстраций — ${s.last.hits} из 30 вместо 7`);
  check(/попала в 11 сценах из 30 вместо 7/.test(sp(r.out)), 'разбор миссии 6 сравнивает 11 и 7');
  await nextMission(p, '#tMis'); await sleep(100);
  check(!(await p.eval(`document.getElementById('tTrain').hidden`)), 'свободный режим: кнопка «Обучить» видна');

  // ---------- интерактив «Разнообразие важнее объёма» ----------
  console.log('Разнообразие важнее объёма');
  check((await p.eval(`document.querySelectorAll('#ablBody tr:not(.hidden-row)').length`)) === 1, 'до ставки видна только строка полного набора');
  r = await viaUI(p, '#aMis', 2);
  check(r.ok && /Обобщение упало до 54% без четверти задач и до 50% без половины эпизодов/.test(sp(r.out)) && /ставка сыграла/i.test(r.out), 'миссия 1: строки открыты, разбор называет 54% и 50%, ставка «одинаково» сыграла');
  check((await p.eval(`document.querySelectorAll('#ablBody tr:not(.hidden-row)').length`)) === 5, 'после ставки открыты все пять строк');
  const det = await p.eval(`document.getElementById('ablDetail').textContent`);
  check(/75% задач/.test(det) && /−19|-19/.test(det), 'подробности по строке «75% задач»: обобщение −19 п. п.');
  await nextMission(p, '#aMis'); await sleep(100);
  // карточки: две ошибки → «Переложить ошибочные» → верные закреплены, неверные в наборе, разбор остался → проверить снова → засчитано
  await p.eval(`window.__l31.LabAbl.api.sortAll({ sim: 'up', kuka: 'up', auto: 'down', cont: 'down', hist: 'none', pre: 'down', t75: 'down' }); true`); await sleep(150);
  let srt = J(await p.eval(`JSON.stringify(window.__l31.LabAbl.api.state().sort)`));
  const cr = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#aMis .m-crit li')].map((li) => li.className))`));
  const redo = J(await p.eval(`(() => { const b = [...document.querySelectorAll('#ablSort .c-bar button')].find((x) => x.textContent === 'Переложить ошибочные'); return JSON.stringify({ has: !!b, visible: !!b && !b.hidden, out: document.querySelector('#ablSort .c-out').textContent }); })()`));
  check(srt && srt.score === 5 && srt.total === 7 && cr[0] === 'ok' && cr[1] !== 'ok' && !(await critOk(p, '#aMis')), 'карточки с двумя ошибками: 5 из 7, «проверены» ✓, «все верно» ещё нет');
  check(redo.has && redo.visible && /Разбор ошибок/.test(redo.out), 'после проверки с ошибками появилась кнопка «Переложить ошибочные», разбор ошибок показан');
  await p.eval(`[...document.querySelectorAll('#ablSort .c-bar button')].find((x) => x.textContent === 'Переложить ошибочные').click(); true`); await sleep(150);
  const after = J(await p.eval(`(() => { const q = (s) => document.querySelectorAll(s).length; const b = [...document.querySelectorAll('#ablSort .c-bar button')]; return JSON.stringify({ locked: q('#ablSort .c-zone .c-card.c-ok:disabled'), zoneCards: q('#ablSort .c-zone .c-card'), pool: q('#ablSort .c-pool .c-card'), poolBad: q('#ablSort .c-pool .c-card.c-bad'), poolOff: q('#ablSort .c-pool .c-card:disabled'), out: document.querySelector('#ablSort .c-out').textContent, status: document.querySelector('#ablSort .c-bar .muted-s').textContent, redoHidden: b.find((x) => x.textContent === 'Переложить ошибочные').hidden, checkOff: b.find((x) => x.textContent === 'Проверить').disabled, lockedIds: window.__l31.LabAbl.api.cardsLocked() }); })()`));
  check(after.locked === 5 && after.zoneCards === 5 && after.pool === 2 && !after.poolBad && !after.poolOff && /Разбор ошибок/.test(after.out) && /закреплены/.test(after.status) && after.redoHidden && after.checkOff && after.lockedIds.length === 5, `«Переложить ошибочные»: 5 верных закреплены на месте, 2 неверные вернулись в набор, разбор остался, статус «${after.status}»`);
  await show(p, 'diversity', '#ablSort', 'l31-cards-redo.png');
  // закреплённую карточку переложить нельзя, две неверные — можно; после второй проверки миссия засчитана
  await p.eval(`window.__l31.LabAbl.api.sortAll({ sim: 'down', auto: 'none', hist: 'down' }); true`); await sleep(150);
  srt = J(await p.eval(`JSON.stringify(window.__l31.LabAbl.api.state().sort)`));
  const simZone = await p.eval(`document.querySelector('#ablSort .c-card[data-id="sim"]').parentElement.dataset.zone`);
  check(srt && srt.score === 7 && srt.total === 7 && simZone === 'up' && await critOk(p, '#aMis'), 'вторая проверка: закреплённая карточка осталась в своей группе, 7 из 7, миссия засчитана');
  check((await p.eval(`[...document.querySelectorAll('#ablSort .c-bar button')].find((x) => x.textContent === 'Переложить ошибочные').hidden`)), 'после верной проверки кнопка «Переложить ошибочные» скрыта');
  await show(p, 'diversity', '#diversity .lab', 'l31-diversity.png');

  // ---------- квиз, глоссарий, формулы, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await show(p, 'tokens', '#tokens .lab', 'l31-tokens-dark.png');
  await show(p, 'arch', 'figure:has(> canvas[data-anim="rt1"])', 'l31-flow-dark.png');
  await seekShow(p, 'film', 6.4, 'l31-film-dark.png');

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l31.SPEED.k = 20; true');
  const lm = await filmWidths(m, [390, 360], true, 'RU, телефон');
  check(lm.has('n') && !lm.has('w'), 'RU, телефон: на 390 и 360 схема film в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await m.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
  await m.eval(`window.__l31.LabTokens.api.train().then(() => true)`, true);
  await m.eval(`window.__l31.LabAbl.api.reveal().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const labs = J(await m.eval(`JSON.stringify([...document.querySelectorAll('.lab')].map((l) => ({ w: Math.round(l.getBoundingClientRect().width), pw: Math.round(l.parentElement.getBoundingClientRect().width), sw: l.scrollWidth, cw: l.clientWidth })))`));
  check(labs.every((l) => l.w <= l.pw + 1 && l.sw <= l.cw + 1), 'ни одна .lab не шире своей карточки: ' + JSON.stringify(labs));
  const narrow = await m.eval(`document.querySelector('canvas[data-anim="rt1"]').dataset.layout`);
  check(narrow === 'n', 'схема rt1 на телефоне в узкой раскладке');
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await m.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
  await seekShow(m, 'film', 6.4, 'l31-film-phone.png', 4);
  for (const [id, n, sel] of [['data', 'l31-m-data.png', '#calc'], ['arch', 'l31-m-flow.png', 'figure:has(> canvas[data-anim="rt1"])'], ['tokens', 'l31-m-tokens.png', '#tokens .lab'], ['diversity', 'l31-m-diversity.png', '#diversity .lab']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));

  // ---------- английская версия: схема film на тех же ширинах ----------
  console.log('английская версия');
  const e = await B.page(urlEn, { width: 1280, height: 1000, light: true });
  await e.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const fe = await schemeLabels(e, 'film', FILM);
  check(!fe.none && !fe.texts.some((x) => /[А-Яа-яЁё]/.test(x)) && ['scale 1, shift 0: layer is transparent', 'some channels boosted, others muted', 'Feature map', 'Scale γ and shift β', '“pick up the red cube”'].every((x) => fe.texts.includes(x)), 'EN: подписи схемы film переведены, кириллицы нет');
  const le = await filmWidths(e, [1440, 1024, 768, 720, 640], false, 'EN');
  check(le.has('w') && le.size === 1, 'EN, компьютер: на ширинах 1440…640 схема film в широкой раскладке');
  await e.S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await e.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
  await seekShow(e, 'film', 6.4, 'l31-film-desk-en.png');
  const enRedo = await e.eval(`[...document.querySelectorAll('#ablSort .c-bar button')].map((b) => b.textContent).join(' | ')`);
  check(/Re-sort the wrong ones/.test(enRedo) && !/[А-Яа-яЁё]/.test(enRedo), 'EN: кнопки карточек переведены: ' + enRedo);
  check(!e.logs.length, 'консоль EN: ' + (e.logs.join(' | ') || 'чисто'));
  const me = await B.page(urlEn, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await me.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const lme = await filmWidths(me, [390, 360], true, 'EN, телефон');
  check(lme.has('n') && !lme.has('w'), 'EN, телефон: на 390 и 360 схема film в узкой раскладке');
  await me.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await me.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
  await seekShow(me, 'film', 6.4, 'l31-film-phone-en.png', 4);
  check(!me.logs.length, 'консоль EN телефона: ' + (me.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
