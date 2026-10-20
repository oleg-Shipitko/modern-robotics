// Проверка урока 0.4: все миссии пяти лабораторий и калькулятора проходятся программно,
// сортировка и квиз, тёмная тема, телефон 390 px. Скриншоты — в shots/l04-*.png.
// Анимированные схемы (shared/anim.js, l04/anim-l04.js): цикл фильтра Калмана, фильтр частиц по шагам и один шаг SLAM —
// подписи в канвасе, не налезают и не мельче 9,6 px на 8–10 моментах, на ширинах 1440, 1280, 1024, 768, 720, 640, 390 и 360;
// кадры разных этапов различаются; итоговые кадры и данные: K растёт после провала дальномера и падает при шумном
// дальномере, два облака частиц сходятся в одно вокруг Ады, перебор поз совпадает с OccMap.match.
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/0-4-otsenka-sostoyaniya-i-planirovanie.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const J = JSON.stringify;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗ ' + msg); } };

function M(p, root) {
  const q = (s) => J(root + ' ' + s);
  const api = {
    async kicker() { return p.eval(`document.querySelector(${q('.g-kicker')}).textContent`); },
    async bet(text) { await p.eval(`(() => { const b = [...document.querySelectorAll(${q('.m-bet .opts button')})].find((x) => x.textContent.startsWith(${J(text)})); if (!b) throw new Error('нет ставки ' + ${J(text)}); b.click(); })()`); },
    async act() {
      await p.eval(`document.querySelector(${q('.g-go')}).click()`);
      await sleep(80);
      await p.waitFor(`!document.querySelector(${J(root)}).classList.contains('m-busy')`, 120000);
    },
    async crit() { return p.eval(`[...document.querySelectorAll(${q('.m-crit li')})].map((l) => l.className).join(',')`); },
    async done() { return p.eval(`!!document.querySelector(${q('.g-out.m-win')}) && !document.querySelector(${q('.g-out')}).hidden`); },
    async text() { return p.eval(`(() => { const o = document.querySelector(${q('.g-out')}); return o && !o.hidden ? o.textContent : ''; })()`); },
    async log() { return p.eval(`[...document.querySelectorAll(${q('.m-log li')})].map((l) => l.textContent).join(' | ')`); },
    async betMarks() { return p.eval(`[...document.querySelectorAll(${q('.m-bet .opts button')})].map((b) => (b.classList.contains('bet-right') ? '✓ ' : b.classList.contains('bet-wrong') ? '✗ ' : '') + b.textContent).filter((t) => /^[✓✗]/.test(t)).join(' / ')`); },
    async next() { await p.eval(`document.querySelector(${q('.g-next')}).click()`); await sleep(120); },
    async report(name) { const t = await api.text(); console.log(`  ${name}: ${t.slice(0, 420)}`); return t; },
  };
  return api;
}
const setRange = (p, sel, v) => p.eval(`(() => { const e = document.querySelector(${J(sel)}); e.value = ${J(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const setCheck = (p, sel, v) => p.eval(`(() => { const e = document.querySelector(${J(sel)}); e.checked = ${v}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const scrollTo = (p, sel) => p.eval(`document.querySelector(${J(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
/** Перетаскивание мышью по канвасу: from и to — доли ширины и высоты. */
async function mouseDrag(p, sel, from, to, steps) {
  const r = await p.eval(`(() => { const e = document.querySelector(${J(sel)}); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const a = { x: r.x + from[0] * r.w, y: r.y + from[1] * r.h }, b = { x: r.x + to[0] * r.w, y: r.y + to[1] * r.h };
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let t = 1; t <= (steps || 8); t++) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * t / (steps || 8), y: a.y + (b.y - a.y) * t / (steps || 8), button: 'left', buttons: 1 });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(150);
}

/* ---------- анимированные схемы ---------- */
const SCH = { 'kalman-cycle': [1.0, 2.5, 3.9, 5.8, 9, 12.5, 16.5, 19.6, 23.5], 'pf-cycle': [1.5, 3.9, 5.6, 6.6, 8.0, 11.9, 13.5, 16.8, 18.2, 22.6], 'slam-step': [1.5, 3.9, 6.0, 8.5, 12.4, 14.2, 16.5, 19.5] };
const SCH_SHOT = { 'kalman-cycle': [2.5, 12.5, 19.6], 'pf-cycle': [6.6, 11.9, 22.6], 'slam-step': [3.9, 8.5, 17.0] };
const SCH_NAME = { 'kalman-cycle': 'схема фильтра Калмана', 'pf-cycle': 'схема фильтра частиц', 'slam-step': 'схема шага SLAM' };
const chk = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); ok(cond, msg); };
/** Подписи схемы на кадрах frames: внутри канваса, не налезают друг на друга, не мельче 9,6 экранного пикселя;
 *  тексты кадров и число разных кадров. Без anim.js в сборке схемы нет: none = true. */
async function schemeLabels(p, kind, frames) {
  return JSON.parse(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]');
    if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [], small: [] });
    const orig = CanvasRenderingContext2D.prototype.fillText, bad = [], small = [], texts = {};
    let boxes = null, W = 0, H = 0;
    CanvasRenderingContext2D.prototype.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) {
        const m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const x0 = a === 'center' ? x - m.width / 2 : a === 'right' ? x - m.width : x;
        boxes.push({ t: String(txt), fs, x0, x1: x0 + m.width, y0: y - fs / 2, y1: y + fs / 2 });
      }
      return orig.apply(this, arguments);
    };
    const prints = new Set();
    for (const t of ${JSON.stringify(frames)}) {
      boxes = []; Anim.seek(cv, t); const b = boxes; boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 3) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      [W, H] = cv.style.aspectRatio.split('/').map(Number); texts[t] = b.map((q) => q.t);
      const kk = W / cv.getBoundingClientRect().width;
      b.forEach((q) => { if (q.x0 < 1 || q.x1 > W - 1 || q.y0 < 0 || q.y1 > H) bad.push('t = ' + t + ': за краем «' + q.t + '»'); if (q.fs / kk < 9.6) small.push('t = ' + t + ': «' + q.t + '» ' + (q.fs / kk).toFixed(1) + ' px'); });
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0);
        if (ox > 1 && oy > 1) bad.push('t = ' + t + ': «' + b[i].t + '» на «' + b[j].t + '»');
      }
    }
    CanvasRenderingContext2D.prototype.fillText = orig;
    return JSON.stringify({ layout: cv.dataset.layout, W, H, bad, small, texts, distinct: prints.size });
  })()`));
}
const kOf = (texts) => { const s = (texts || []).find((x) => /^K = \d,\d\d$/.test(x)); return s ? +s.slice(4).replace(',', '.') : NaN; };
/** Три схемы: подписи, различие кадров, содержание кадров и данных, снимки shots/l04-<схема>-<t>.png (телефон — l04-m-…). */
async function schemeChecks(p, where, layout, shots) {
  for (const kind of Object.keys(SCH)) {
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(250);
    const r = await schemeLabels(p, kind, SCH[kind]);
    if (r.none) { chk(false, `${where}${SCH_NAME[kind]}: схемы нет — в build.py для l04 нужны shared/anim.js и l04/anim-l04.js перед l04/ui-l04.js`); continue; }
    chk(r.layout === layout && r.bad.length === 0 && r.small.length === 0, `${where}${SCH_NAME[kind]} ${r.W}×${r.H}: подписи в канвасе, не налезают и не мельче 9,6 px` + (r.bad.length || r.small.length ? ': ' + r.bad.concat(r.small).slice(0, 4).join('; ') : ''));
    chk(r.distinct === SCH[kind].length, `${where}${SCH_NAME[kind]}: кадры ${SCH[kind].length} моментов различаются (разных ${r.distinct})`);
    const tx = (t) => (r.texts[String(t)] || []).join(' ');
    if (kind === 'kalman-cycle') {
      const k1 = kOf(r.texts['5.8']), k8 = kOf(r.texts['19.6']), kw = kOf(r.texts['23.5']);
      chk(tx(1).includes('Фильтр хранит оценку положения') && /Предсказание: оценку сдвигают/.test(tx(2.5)) && tx(12.5).includes('нет измерения') && /Дальномер молчит/.test(tx(12.5))
        && k1 > 0.45 && k1 < 0.65 && k8 > 0.65 && kw < 0.3 && /Если дальномер шумит сильнее/.test(tx(23.5)),
        `${where}схема Калмана: предсказание → коррекция, K = ${k1} на первом шаге, ${k8} после провала дальномера, ${kw} при шумном дальномере`);
    }
    if (kind === 'pf-cycle') {
      const d = JSON.parse(await p.eval(`(() => { const D = window.__anim04.pf(), a0 = window.__anim04.pfA0, a1 = window.__anim04.pfA1;
        const up = D.S1.filter((q) => q.x < 200 && q.y < 196).length, lo = D.S1.filter((q) => q.x < 200 && q.y > 204).length;
        const far = D.S3.filter((q) => Math.hypot(q.x - a1.x, q.y - a1.y) > 45).length;
        const sum = (W, f) => W.reduce((s, w, i) => s + (f(i) ? w : 0), 0);
        return JSON.stringify({ n: D.S0.length, up, lo, far, w1: sum(D.W1, (i) => D.S0[i].x < 200 && Math.abs(D.S0[i].y - (a0.y + 102)) > 60), w2low: sum(D.W2, (i) => D.S2[i].y > 250) }); })()`));
      chk(d.n === 30 && d.up >= 10 && d.lo >= 10 && d.w1 > 0.95 && d.w2low < 0.01 && d.far === 0, `${where}схема частиц: 30 частиц; после первого пересэмплирования облака ${d.up} и ${d.lo}; у двери вес нижнего облака ${d.w2low.toFixed(4)}; в конце все частицы ближе 45 см к Аде`);
      chk(tx(1.5).includes('Ада не знает, где она.') && tx(6.6).includes('такой же скан') && tx(6.6).includes('другой скан') && /остаются два облака/.test(tx(11.9)) && /У двери Ада снимает новый скан/.test(tx(16.8)) && /остаётся одно облако/.test(tx(22.6)),
        `${where}схема частиц: шаги «разброс → скан и вес → отбор → движение → новый скан» и подписи сравнения сканов`);
    }
    if (kind === 'slam-step') {
      const d = JSON.parse(await p.eval(`(() => { const D = window.__anim04.slam(); return JSON.stringify({ same: Math.abs(D.match.x - D.best.x) < 1e-9 && Math.abs(D.match.y - D.best.y) < 1e-9 && Math.abs(D.match.th - D.best.th) < 1e-9, err: Math.hypot(D.best.x - D.s.x, D.best.y - D.s.y), eth: Math.abs(D.best.th - D.s.th) * 180 / Math.PI, sc0: D.sc0, sc1: D.sc1, changed: D.changed.length }); })()`));
      chk(d.same && d.err < 5 && d.eth < 1.5 && d.sc1 > d.sc0 * 1.5 && d.changed > 50, `${where}схема SLAM: перебор совпал с OccMap.match, ошибка позы ${d.err.toFixed(1)} см и ${d.eth.toFixed(1)}°, оценка ${d.sc0.toFixed(0)} → ${d.sc1.toFixed(0)}, обновлено клеток ${d.changed}`);
      chk(tx(1.5).includes('Колёса говорят, куда Ада сдвинулась') && /Сопоставление: перебираем сдвиги/.test(tx(8.5)) && tx(8.5).includes('оценка совпадения') && tx(12.4).includes('точнее: шаг 1,5 см') && /становится поправленной позой/.test(tx(14.2)) && /дорисовывает карту/.test(tx(16.5)),
        `${where}схема SLAM: предсказание → новый скан → перебор → поправка → карта`);
    }
    for (const t of (shots && shots[kind]) || []) {
      await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`);
      await p.shotEl(out(`l04-${where ? 'm-' : ''}${kind}-${t}.png`), `figure:has(> canvas[data-anim=${kind}])`, where ? 4 : 6);
    }
  }
}
/** Подписи схем на других ширинах: ширина окна меняется, схема перерисовывается. */
async function schemeWidths(p, widths, mobile) {
  for (const w of widths) {
    await p.S('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: !!mobile });
    await p.eval(`window.dispatchEvent(new Event('resize')); true`); await sleep(350);
    for (const kind of Object.keys(SCH)) {
      await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(150);
      const r = await schemeLabels(p, kind, SCH[kind]);
      chk(!r.none && r.bad.length === 0 && r.small.length === 0, `ширина ${w}: ${SCH_NAME[kind]} (${r.layout === 'n' ? 'узкая' : 'широкая'} раскладка) — подписи в канвасе, не налезают и не мельче 9,6 px` + (r.bad.length || r.small.length ? ': ' + r.bad.concat(r.small).slice(0, 3).join('; ') : ''));
    }
  }
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  await p.eval('window.__l04.SPEED.k = 6');
  await p.shot(out('l04-hero.png'));
  await p.shotEl(out('l04-questions.png'), '#questions .q-stack', 6);

  console.log('— Калман');
  const kf = M(p, '#kfMis'); await scrollTo(p, '#kalman .lab');
  ok(!(await p.eval('document.querySelector("#kfOut").textContent')).includes('Калман'), 'Калман: ответ виден до ставки');
  await kf.bet('Фильтр Калмана'); await kf.act(); await kf.report('М1'); console.log('    ставка:', await kf.betMarks());
  ok(await kf.done(), 'Калман М1 не засчитана'); await kf.next();
  ok(!(await kf.done()), 'Калман М2 засчитана сразу');
  await setRange(p, '#kfSq', 3); await setRange(p, '#kfSr', 3); await sleep(100);
  console.log('    критерии М2:', await kf.crit()); ok(await kf.done(), 'Калман М2 не засчитана при σ 1 и 10'); await kf.report('М2');
  await p.shotEl(out('l04-kalman.png'), '#kalman .lab', 6);
  await kf.next(); await kf.bet('Расширится'); await kf.act(); console.log('    М3 с σ модели 1:', await kf.crit(), '|', await kf.text());
  ok(!(await kf.done()), 'Калман М3 засчитана при σ модели 1');
  await setRange(p, '#kfSq', 4); await kf.act(); ok(await kf.done(), 'Калман М3 не засчитана при σ модели 2'); await kf.report('М3'); console.log('    журнал:', await kf.log());
  await p.shotEl(out('l04-kalman-drop.png'), '#kalman .lab', 6);
  await kf.next(); console.log('    ', await kf.kicker());

  console.log('— Фильтр частиц');
  const pf = M(p, '#pfMis'); await scrollTo(p, '#particles .lab');
  await pf.bet('За несколько секунд'); await pf.act(); await pf.report('М1'); console.log('    ставка:', await pf.betMarks()); ok(await pf.done(), 'частицы М1');
  await pf.next();
  await p.eval('window.__l04.PfLab.api.place(300, 120)'); await pf.act(); console.log('    М2 в гостиной:', await pf.crit(), '|', await pf.text());
  // перетащить Аду мышью в верхнюю спальню, подальше от двери: из (300,120) в (100,125) на плане 600×400
  await mouseDrag(p, "#pfCv", [300 / 600, 120 / 400], [100 / 600, 125 / 400]);
  console.log('    после перетаскивания:', J(await p.eval('window.__l04.PfLab.api.state().place')));
  await pf.act(); ok(await pf.done(), 'частицы М2 в спальне'); await pf.report('М2');
  await p.shotEl(out('l04-particles-twin.png'), '#particles .lab', 6);
  await pf.next(); await pf.bet('Нет'); await pf.act(); await pf.report('М3'); console.log('    ставка:', await pf.betMarks());
  await pf.next(); await pf.act(); console.log('    М4 без флажка:', await pf.crit());
  await setCheck(p, '#pfAug', true); await pf.act(); ok(await pf.done(), 'частицы М4'); await pf.report('М4');
  await p.shotEl(out('l04-particles.png'), '#particles .lab', 6);
  await pf.next(); await sleep(1500); console.log('    свободный режим, t =', await p.eval('window.__l04.PfLab.st.W.t'));
  await mouseDrag(p, '#pfCv', [0.5, 0.5], [0.85, 0.5]);

  console.log('— Карта');
  const mp = M(p, '#mapMis'); await scrollTo(p, '#slam .lab');
  await mp.bet('Ничего'); await mp.act(); await mp.report('М1'); ok(await mp.done(), 'карта М1');
  await p.shotEl(out('l04-map-exact.png'), '#slam .lab', 6);
  await mp.next(); await mp.bet('Стены поплывут'); await mp.act(); await mp.report('М2'); console.log('    ставка:', await mp.betMarks()); ok(await mp.done(), 'карта М2');
  await p.shotEl(out('l04-map-odo.png'), '#slam .lab', 6);
  await mp.next(); await mp.act(); console.log('    М3 без флажка:', await mp.crit(), '|', await mp.text());
  await setCheck(p, '#mapSlam', true); await mp.act(); ok(await mp.done(), 'карта М3'); await mp.report('М3');
  await mouseDrag(p, '#mapCv', [0.5, 0.5], [0.35, 0.5]);
  console.log('    шторка:', await p.eval('window.__l04.MapLab.st.curtain'));
  await p.shotEl(out('l04-map-slam.png'), '#slam .lab', 6);
  await mp.next();

  console.log('— Дейкстра и A*');
  const g = M(p, '#gMis'); await scrollTo(p, '#astar .lab');
  ok((await p.eval('document.querySelector("#gStatA").textContent')).includes('ещё не'), 'A*: счётчик виден до ставки');
  await g.bet('A*'); await g.act(); await g.report('М1'); console.log('    ставка:', await g.betMarks()); ok(await g.done(), 'A* М1');
  await g.next();
  // одна клетка мышью, потом ловушка программно
  await mouseDrag(p, '#gCvA', [15.5 / 30, 5.5 / 20], [15.5 / 30, 7.5 / 20], 4);
  console.log('    нарисовано мышью клеток:', await p.eval('window.__l04.GridLab.api.state().user'));
  await p.eval('window.__l04.GridLab.api.setWalls(window.__l04.GridLab.TRAP)'); await sleep(100);
  console.log('    критерии М2:', await g.crit()); ok(await g.done(), 'A* М2'); await g.report('М2');
  await p.shotEl(out('l04-astar-trap.png'), '#astar .lab', 6);
  await g.next(); await setRange(p, '#gEps', '2'); console.log('    ε = 2:', await g.crit());
  await setRange(p, '#gEps', '3'); ok(await g.done(), 'A* М3 при ε = 3'); await g.report('М3');
  await p.shotEl(out('l04-astar.png'), '#astar .lab', 6);
  await g.next();

  console.log('— Размерность');
  const d = M(p, '#dimMis'); await scrollTo(p, '#dims .dim-card');
  await setRange(p, '#dimD', 9); console.log('    9 степеней:', await d.crit()); await setRange(p, '#dimD', 10); ok(await d.done(), 'размерность'); await d.report('М1');
  await p.shotEl(out('l04-dims.png'), '#dims .dim-card', 6);

  console.log('— RRT');
  const r = M(p, '#rrtMis'); await scrollTo(p, '#rrt .lab');
  await r.bet('На одной и той же'); await r.act(); await r.report('М1'); console.log('    ставка:', await r.betMarks()); ok(await r.done(), 'RRT М1');
  await r.next(); await r.bet('Только RRT*'); await r.act(); console.log('    М2 после 1000:', await r.crit());
  if (!(await r.done())) await r.act();
  ok(await r.done(), 'RRT М2'); await r.report('М2'); console.log('    ставка:', await r.betMarks());
  await p.shotEl(out('l04-rrt.png'), '#rrt .lab', 6);
  await r.next();
  // створки мышью: верхнюю вниз до 180, нижнюю вверх до 220 (в долях канваса 600×400)
  await mouseDrag(p, '#rrtCvA', [300 / 600, 120 / 400], [300 / 600, 180 / 400]);
  await mouseDrag(p, '#rrtCvA', [300 / 600, 280 / 400], [300 / 600, 220 / 400]);
  console.log('    проход после перетаскивания:', await p.eval('window.__l04.RrtLab.api.state().gap'));
  await r.act(); console.log('    М3:', await r.crit(), '|', await r.log());
  if (!(await r.done())) { await p.eval('window.__l04.RrtLab.api.setDoor(180, 220)'); await r.act(); }
  ok(await r.done(), 'RRT М3'); await r.report('М3');
  await p.shotEl(out('l04-rrt-narrow.png'), '#rrt .lab', 6);
  await r.next();

  console.log('— Сегодня, сортировка, квиз');
  const nToday = await p.eval("document.querySelectorAll(\"#todaySeg button\").length"); console.log("  систем в схеме:", nToday);
  for (let i = 0; i < nToday; i++) await p.eval(`document.querySelectorAll("#todaySeg button")[${i}].click()`);
  await p.eval('document.querySelectorAll("#todaySeg button")[0].click()');
  await p.shotEl(out('l04-today.png'), '#today .stack-card', 6);
  const sortRes = await p.eval(`(() => { const S = window.L4_SORT, c = window.__l04.mis.sort; S.items.forEach((it, k) => c.place(it.id, k === 0 ? 'pf' : it.target)); c.check(); return document.querySelector('#methodSort .c-out').textContent; })()`);
  console.log('  сортировка (одна ошибка нарочно):', sortRes.slice(0, 260));
  await p.shotEl(out('l04-sort.png'), '#methodSort', 6);
  await p.eval(`(() => { const Q = window.L4_QUIZ; document.querySelectorAll('#quizBox .q-card').forEach((c, i) => { [...c.querySelectorAll('.q-opt')].find((b) => b.textContent === Q[i].o[Q[i].a]).click(); }); })()`);
  console.log('  квиз:', await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l04-quiz.png'), '#quiz .quiz', 6);
  await p.shotEl(out('l04-finale.png'), '#finale .prose', 6);
  const ids = await p.eval('(() => { const all = [...document.querySelectorAll("[id]")].map((e) => e.id), d = all.filter((x, i) => all.indexOf(x) !== i); return d.join(",") || "нет"; })()');
  console.log('  повторы id:', ids); ok(ids === 'нет', 'повторяются id');

  console.log('— Схемы');
  await schemeChecks(p, '', 'w', SCH_SHOT);
  await p.click('#themeBtn'); await sleep(400);
  for (const [kind, t] of [['kalman-cycle', 12.5], ['pf-cycle', 11.9], ['slam-step', 14.2]]) {
    if (!(await p.eval(`!!document.querySelector('canvas[data-anim=${kind}]') && typeof Anim !== 'undefined'`))) continue;
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); cv.scrollIntoView({ block: 'center' }); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`); await sleep(200);
    await p.shotEl(out(`l04-${kind}-dark.png`), `figure:has(> canvas[data-anim=${kind}])`, 6);
  }
  await p.shotEl(out('l04-kalman-dark.png'), '#kalman .lab', 6);
  await p.shotEl(out('l04-particles-dark.png'), '#particles .lab', 6);
  await p.shotEl(out('l04-map-dark.png'), '#slam .lab', 6);
  await p.shotEl(out('l04-astar-dark.png'), '#astar .lab', 6);
  await p.shotEl(out('l04-rrt-dark.png'), '#rrt .lab', 6);
  await schemeWidths(p, [1280, 1024, 768, 720, 640]);
  const logs = p.logs.filter((l) => !/fonts\.g/.test(l));
  console.log('логи десктопа:', logs.join(' | ') || 'нет'); ok(!logs.length, 'есть сообщения в консоли');
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  await m.eval('window.__l04.SPEED.k = 6');
  await m.shot(out('l04-m-hero.png'));
  const kf = M(m, '#kfMis'); await scrollTo(m, '#kalman .lab'); await kf.bet('Фильтр Калмана'); await kf.act(); ok(await kf.done(), 'телефон: Калман М1');
  await m.shotEl(out('l04-m-kalman.png'), '#kalman .lab', 4);
  const pf = M(m, '#pfMis'); await scrollTo(m, '#particles .lab'); await pf.bet('За несколько секунд'); await pf.act(); ok(await pf.done(), 'телефон: частицы М1');
  await m.shotEl(out('l04-m-particles.png'), '#particles .lab', 4);
  const g = M(m, '#gMis'); await scrollTo(m, '#astar .lab'); await g.bet('A*'); await g.act(); ok(await g.done(), 'телефон: A* М1');
  await g.next();
  // касание по клетке: ставит стену и не блокирует прокрутку
  const before = await m.eval('window.__l04.GridLab.api.state().user');
  const r0 = await m.eval(`(() => { const b = document.querySelector('#gCvA').getBoundingClientRect(); return { x: b.left + b.width * 15.5 / 30, y: b.top + b.height * 4.5 / 20 }; })()`);
  await m.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r0.x, y: r0.y }] });
  await m.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  console.log('  телефон: клеток до касания', before, 'после', await m.eval('window.__l04.GridLab.api.state().user'));
  await m.shotEl(out('l04-m-astar.png'), '#astar .lab', 4);
  const r = M(m, '#rrtMis'); await scrollTo(m, '#rrt .lab'); await r.bet('На одной и той же'); await r.act(); ok(await r.done(), 'телефон: RRT М1');
  await m.shotEl(out('l04-m-rrt.png'), '#rrt .lab', 4);
  await m.shotEl(out('l04-m-map.png'), '#slam .lab', 4);
  await m.shotEl(out('l04-m-dims.png'), '#dims .dim-card', 4);
  await m.eval('document.querySelectorAll("#todaySeg button")[2].click()');
  await m.shotEl(out('l04-m-today.png'), '#today .stack-card', 4);
  await m.shotEl(out('l04-m-sort.png'), '#methodSort', 4);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(300);
  console.log('— Схемы на телефоне');
  await schemeChecks(m, 'телефон: ', 'n', { 'kalman-cycle': [12.5], 'pf-cycle': [11.9], 'slam-step': [8.5] });
  await schemeWidths(m, [360], true);
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(300);
  const w = await m.eval('document.documentElement.scrollWidth');
  console.log('телефон: ширина', w, 'из 390'); ok(w <= 390, 'телефон шире 390');
  const logs = m.logs.filter((l) => !/fonts\.g/.test(l));
  console.log('логи телефона:', logs.join(' | ') || 'нет'); ok(!logs.length, 'телефон: сообщения в консоли');
  await B.close();
}

(async () => {
  await desktop();
  await phone();
  console.log(fails ? `ИТОГ: ${fails} ошибок` : 'ИТОГ: всё прошло');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
