// Урок 2.1 «Transporter и CLIPort»: лаборатории дают обещанные в тексте исходы, консоль чиста, телефон без горизонтальной прокрутки.
// Схема контрастного обучения (shared/anim.js) — подписи в канвасе на всех кадрах; мосты — один внутри урока (↓) и один в конце (→).
// Схемы устройства CLIP, Transporter и CLIPort — подписи в канвасе и не налезают, кадры разных этапов различаются, на компьютере и телефоне.
// Лаборатория 3: карты «Где», «Что», «Итог» крупнее стола (компьютер — от 200 px, телефон — от 160 px или во всю ширину).
// Снимки — shots/l21-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-10 python3 lessons/build.py l21.
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/2-1-transporter-i-cliport.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const SCHEME_T = [0.8, 2.0, 3.0, 5.0, 8.0, 11.2, 15.2];
// схемы устройства моделей: моменты разных этапов анимации (вход, сети, сравнение, итог)
const ARCH = { 'clip-arch': [1.0, 3.5, 5.0, 6.6, 9.2, 12.4], transporter: [0.8, 2.2, 3.0, 4.0, 5.3, 8.5, 13.0], cliport: [0.8, 2.0, 3.5, 5.5, 8.6, 10.6, 12.6] };
const ARCH_SHOT = { 'clip-arch': [3.5, 6.6, 12.4], transporter: [2.2, 5.3, 13.0], cliport: [2.0, 5.5, 12.6] };
/** Схема контрастного обучения (shared/anim.js): на каждом кадре подписи внутри канваса и не налезают друг на друга;
 *  тексты кадров — для проверки сходства выделенных пар. Без anim.js в сборке схемы нет: none = true. */
async function schemeLabels(p, kind, frames) {
  return JSON.parse(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]');
    if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [] });
    const orig = CanvasRenderingContext2D.prototype.fillText, bad = [], texts = {};
    let boxes = null, W = 0, H = 0;
    CanvasRenderingContext2D.prototype.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) {
        const m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const x0 = a === 'center' ? x - m.width / 2 : a === 'right' ? x - m.width : x;
        boxes.push({ t: String(txt), x0, x1: x0 + m.width, y0: y - fs / 2, y1: y + fs / 2 });
      }
      return orig.apply(this, arguments);
    };
    const prints = new Set();
    for (const t of ${JSON.stringify(frames)}) {
      boxes = []; Anim.seek(cv, t); const b = boxes; boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 3) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      [W, H] = cv.style.aspectRatio.split('/').map(Number); texts[t] = b.map((q) => q.t);
      b.forEach((q) => { if (q.x0 < 1 || q.x1 > W - 1 || q.y0 < 0 || q.y1 > H) bad.push('t = ' + t + ': за краем «' + q.t + '»'); });
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0);
        if (ox > 1 && oy > 1) bad.push('t = ' + t + ': «' + b[i].t + '» на «' + b[j].t + '»');
      }
    }
    CanvasRenderingContext2D.prototype.fillText = orig;
    return JSON.stringify({ layout: cv.dataset.layout, W, H, bad, texts, distinct: prints.size });
  })()`));
}
/** Сходство выделенной пары в подписи кадра: «верная пара …: сходство 1,0 ↑» → 1. */
const simOf = (texts, re) => { const s = (texts || []).find((x) => re.test(x)); const m = s && /(−?\d+,\d)\s*[↑↓]?$/.exec(s); return m ? +m[1].replace('−', '-').replace(',', '.') : NaN; };
const NO_ANIM = 'схемы нет: в build.py для l21 нужен shared/anim.js перед l21/ui-l21.js';
/** Схемы устройства CLIP, Transporter и CLIPort: подписи в канвасе и не налезают, кадры этапов различаются, содержание итоговых кадров. */
async function archChecks(p, where, layout, shots) {
  const NAMES = { 'clip-arch': 'схема CLIP', transporter: 'схема Transporter', cliport: 'схема CLIPort' };
  for (const kind of Object.keys(ARCH)) {
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(250);
    const r = await schemeLabels(p, kind, ARCH[kind]);
    if (r.none) { check(false, `${where}${NAMES[kind]}: ${NO_ANIM}`); continue; }
    check(r.layout === layout && r.bad.length === 0, `${where}${NAMES[kind]} ${r.W}×${r.H}: подписи в канвасе и не налезают` + (r.bad.length ? ': ' + r.bad.slice(0, 4).join('; ') : ''));
    check(r.distinct === ARCH[kind].length, `${where}${NAMES[kind]}: кадры ${ARCH[kind].length} этапов различаются (разных ${r.distinct})`);
    const tx = (t) => r.texts[String(t)] || [];
    if (kind === 'clip-arch') check(tx(12.4).includes('0,86 ✓') && tx(12.4).includes('0,20') && tx(12.4).includes('−0,10') && tx(6.6).some((q) => /^Числа на одних местах/.test(q)), `${where}схема CLIP: верная подпись самая похожая (0,86 против 0,20 и −0,10)`);
    if (kind === 'transporter') check(tx(13).includes('лучший поворот 120°') && tx(5.3).includes('признаки сцены φ'), `${where}схема Transporter: перебор 36 поворотов находит 120°`);
    if (kind === 'cliport') check(tx(5.5).filter((q) => q === '×').length === 3 && tx(5.5).join(' ').includes('боковые связи') && tx(12.6).includes('+'), `${where}схема CLIPort: умножение на трёх уровнях, боковые связи и сложение потоков`);
    for (const t of shots[kind] || []) {
      await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`);
      await p.shotEl(out(`l21-${where ? 'm-' : ''}${kind}-${t}.png`), `figure:has(> canvas[data-anim=${kind}])`, where ? 4 : 6);
    }
  }
}
/** Лаборатория 3: размеры стола и трёх карт, заголовки карт и знаки между ними. */
async function mapsInfo(p) {
  return J(await p.eval(`JSON.stringify({ w: ['kCv', 'kWhere', 'kWhat', 'kBoth'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().width)),
    inner: Math.round(document.querySelector('#cliport .scene-card').clientWidth - 28),
    caps: [...document.querySelectorAll('#kMaps figcaption')].map((e) => e.textContent.trim()),
    ops: [...document.querySelectorAll('#kMaps .km-op')].map((e) => e.textContent.trim()) })`));
}
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^1[01] миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q, #recall [data-recall] *').length`)) > 0, 'разминка по уроку 1.8 на месте');
  const lead = await p.eval(`document.querySelector('#top .lead').textContent`);
  check(/^В части 1 мы разбирали/.test(lead) && /В уроке разберём/.test(lead) && !/Политики части 1/.test(lead), 'вступление: что разбирали в части 1 и что разберём в уроке');
  // мосты: внутри урока один — от CLIP к картам действий (↓, последним в разделе), в конце урока — к уроку 2.2 (→, со ссылкой)
  const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), down: b.classList.contains('down'), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('a') && b.querySelector('a').getAttribute('href') })))`));
  check(bn.length === 2 && bn.every((b) => b.last) && bn[0].down && bn[0].sec === 'words' && /^CLIP связывает слова с картинками/.test(bn[0].t) && /Действие — клетка на картинке: как/.test(bn[0].t) && !bn[0].a
    && !bn[1].down && bn[1].sec === 'finale' && /Урок 2\.2 · PerAct/.test(bn[1].t) && bn[1].a === '2-2-peract.html', 'мосты: ' + bn.map((b) => `${b.sec}${b.down ? ' ↓' : ' →'} «${b.t}»`).join('; '));
  check(!(await p.eval(`!!document.querySelector('.bridge-q')`)) && !(await p.eval(`[...document.querySelectorAll('#finale .callout strong')].some((e) => /^Дальше/.test(e.textContent))`)), 'старых вопросов-переходов и плашки «Дальше» нет');
  // схема контрастного обучения: кадры с подписями в канвасе; верная пара сходится, неверная расходится
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(300);
  const sc = await schemeLabels(p, 'contrast', SCHEME_T);
  check(!sc.none && sc.layout === 'w' && sc.bad.length === 0, sc.none ? 'схема контрастного обучения: ' + NO_ANIM : `схема контрастного обучения ${sc.W}×${sc.H}: подписи в канвасе и не налезают` + (sc.bad.length ? ': ' + sc.bad.slice(0, 4).join('; ') : ''));
  if (!sc.none) {
    const g0 = simOf(sc.texts['3'], /^верная пара/), g1 = simOf(sc.texts['11.2'], /^верная пара/), b0 = simOf(sc.texts['3'], /^подпись «/), b1 = simOf(sc.texts['11.2'], /^подпись «/);
    check(g0 < 0 && g1 >= 0.95 && b0 >= 0.8 && b1 <= 0.2, `схема: верная пара ${g0} → ${g1}, неверная ${b0} → ${b1}`);
    for (const t of [3.0, 8.0, 11.2]) { await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`); await p.shotEl(out(`l21-contrast-${t}.png`), '#words .scheme-fig', 6); }
  }
  await archChecks(p, '', 'w', ARCH_SHOT);
  await p.shotEl(out('l21-bridge.png'), '#words .bridge-note', 12);
  await p.shotEl(out('l21-bridge-end.png'), '#finale .bridge-note', 12);
  // отсылки вперёд: первое упоминание модели из будущего урока в основном тексте (без разминки, глоссария, формул,
  // раздела «Сегодня» и итога) и в исходниках интерактивов идёт с номером урока «урок N.M» не дальше 160 символов; остальные упоминания свободны
  const fwdNames = ['RT-1', 'RT-2', 'Open X-Embodiment', 'Octo', 'OpenVLA', 'SmolVLA', 'π0', 'PaliGemma', 'Helix', 'GR00T', 'Gemini', 'PaLM-E', 'PerAct', 'VoxPoser', 'SayCan', 'Code as Policies', 'Inner Monologue'];
  const fwdSrc = ['../lessons/l21/ui-l21.js'].map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');
  const fwdCheck = async () => {
    const body = await p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#recall, #glData, #today, #finale, .katex").forEach((e) => e.remove()); return m.textContent; })()');
    const near = (t, w) => { const i = t.indexOf(w); return i < 0 || /урок[а-яё]*\s+\d\.\d/i.test(t.slice(Math.max(0, i - 160), i + w.length + 160)); };
    const bad = fwdNames.filter((w) => !near(body, w) || !near(fwdSrc, w));
    check(bad.length === 0, 'первое упоминание модели из будущего урока — с номером урока' + (bad.length ? ': ' + bad.join(', ') : ''));
  };
  await p.eval('window.__l21.SPEED.k = 20; true');
  // 1. мини-CLIP
  const c0 = J(await p.eval(`JSON.stringify(window.__l21.LabClip.api.state())`));
  check(c0.hits < 8, 'до обучения диагональ не выделяется: подписей со своей картинкой ' + c0.hits + ' из 8');
  const c1 = J(await p.eval(`window.__l21.LabClip.api.train().then((s) => JSON.stringify(s))`, true));
  check(c1.hits === 8, 'после обучения каждая подпись нашла свою картинку: ' + c1.hits + ' из 8');
  await p.eval(`window.__l21.LabClip.api.setQuery('blue', 'bowl'); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabClip.api.state())`)).topOk, 'поиск «синяя миска» находит синюю миску');
  const c2 = J(await p.eval(`window.__l21.LabClip.api.setQuery('purple', 'cube'), window.__l21.LabClip.api.search().then((s) => JSON.stringify(s))`, true));
  check(c2.topOk, 'фиолетовый кубик, которого не было в обучении, найден на первом месте');
  await p.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-clip.png'), '#words .lab', 6);
  // 2. карта против регрессии
  const k1 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k1.map >= 0.9 && k1.reg <= 0.2, `одна демонстрация: карта ${Math.round(k1.map * 30)}/30, регрессия ${Math.round(k1.reg * 30)}/30`);
  await p.eval(`window.__l21.LabPick.api.setN(20); true`);
  const k2 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k2.map >= 0.9 && k2.reg <= 0.3, `двадцать демонстраций: карта ${Math.round(k2.map * 30)}/30, регрессия ${Math.round(k2.reg * 30)}/30`);
  await p.eval(`window.__l21.LabPick.api.setTask('twoRed'); true`);
  const k3 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k3.map >= 0.9 && k3.reg <= 0.3, `два кубика: карта ${Math.round(k3.map * 30)}/30, регрессия ${Math.round(k3.reg * 30)}/30`);
  await p.eval(`document.getElementById('maps').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-pick.png'), '#maps .lab', 6);
  // 3. укладка
  await p.eval(`window.__l21.LabPlace.api.setK(4); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabPlace.api.state())`)).score >= 0.95, 'гнездо под 40°: поворот 40° даёт совпадение не меньше 95%');
  await p.eval(`window.__l21.LabPlace.api.setK(2); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabPlace.api.state())`)).score < 0.8, 'на 20° совпадение заметно хуже');
  const t1 = J(await p.eval(`window.__l21.LabPlace.api.rotateAndScan().then((s) => JSON.stringify(s))`, true));
  check(t1.k * 10 === 130 && t1.s >= 0.95, 'после поворота гнезда перебор нашёл 130°');
  await p.eval(`document.getElementById('place').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-place.png'), '#place .lab', 6); await p.shotEl(out('l21-chart.png'), '#place .chart-card', 6);
  // 4. CLIPort
  const res = {};
  for (const [mode, color] of [['none', 'red'], ['robot', 'red'], ['robot', 'purple'], ['cliport', 'purple'], ['cliport', 'orange']]) {
    await p.eval(`window.__l21.LabCliport.api.setMode('${mode}'); window.__l21.LabCliport.api.setColor('${color}'); true`); await sleep(200);
    res[mode + ':' + color] = J(await p.eval(`window.__l21.LabCliport.api.run().then((s) => JSON.stringify(s))`, true)).rate;
  }
  check(res['none:red'] < 0.85, 'без слов красный кубик — ' + Math.round(res['none:red'] * 20) + '/20');
  check(res['robot:red'] >= 0.9 && res['robot:purple'] <= 0.2, `слова из демонстраций: красный ${Math.round(res['robot:red'] * 20)}/20, фиолетовый ${Math.round(res['robot:purple'] * 20)}/20`);
  check(res['cliport:purple'] >= 0.9 && res['cliport:orange'] >= 0.9, `CLIPort на новых цветах: фиолетовый ${Math.round(res['cliport:purple'] * 20)}/20, оранжевый ${Math.round(res['cliport:orange'] * 20)}/20`);
  const km = await mapsInfo(p);
  check(km.w.slice(1).every((w) => w >= 200 && w > km.w[0]), `лаборатория 3: карты ${km.w.slice(1).join(', ')} px крупнее стола ${km.w[0]} px`);
  check(/^Где:.*команды/.test(km.caps[0]) && /^Что:.*команд/.test(km.caps[1]) && /^Итог: где взять/.test(km.caps[2]) && km.ops.join(' ') === '× =', 'лаборатория 3: заголовки карт «' + km.caps.join('», «') + '» и знаки ' + km.ops.join(' '));
  await p.eval(`document.getElementById('cliport').scrollIntoView({ behavior: 'instant' }); true`); await sleep(400); await p.shotEl(out('l21-cliport.png'), '#cliport .lab', 6);
  // квиз
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  await fwdCheck();
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-clip-dark.png'), '#words .lab', 6);
  if (!sc.none) { await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); Anim.seek(cv, 8); cv.classList.remove('paused'); return true; })()`); await p.shotEl(out('l21-contrast-dark.png'), '#words .scheme-fig', 6); }
  for (const [kind, t] of [['clip-arch', 6.6], ['transporter', 13.0], ['cliport', 12.6]]) {
    if (!(await p.eval(`!!document.querySelector('canvas[data-anim=${kind}]') && typeof Anim !== 'undefined'`))) continue;
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); cv.scrollIntoView({ block: 'center' }); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`); await sleep(200);
    await p.shotEl(out(`l21-${kind}-dark.png`), `figure:has(> canvas[data-anim=${kind}])`, 6);
  }
  await p.eval(`document.getElementById('cliport').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-cliport-dark.png'), '#cliport .lab', 6);
  await p.shotEl(out('l21-bridge-dark.png'), '#words .bridge-note', 12);
  await p.shotEl(out('l21-bridge-end-dark.png'), '#finale .bridge-note', 12);
  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l21.SPEED.k = 20; true');
  await m.eval(`window.__l21.LabClip.api.train().then(() => true)`, true);
  await m.eval(`window.__l21.LabPick.api.run().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await m.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out('l21-m-clip.png'), '#words .lab', 4);
  await m.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(300);
  const msc = await schemeLabels(m, 'contrast', SCHEME_T);
  check(!msc.none && msc.layout === 'n' && msc.bad.length === 0, msc.none ? 'телефон: ' + NO_ANIM : `телефон: схема в узкой раскладке ${msc.W}×${msc.H}, подписи в канвасе и не налезают` + (msc.bad.length ? ': ' + msc.bad.slice(0, 4).join('; ') : ''));
  if (!msc.none) { await m.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); Anim.seek(cv, 8); cv.classList.remove('paused'); return true; })()`); await m.shotEl(out('l21-m-contrast.png'), '#words .scheme-fig', 4); }
  await archChecks(m, 'телефон: ', 'n', { 'clip-arch': [6.6], transporter: [13.0], cliport: [12.6] });
  const mk = await mapsInfo(m);
  check(mk.w.slice(1).every((w) => w >= 160 || w >= mk.inner * 0.9), `телефон: карты лаборатории 3 ${mk.w.slice(1).join(', ')} px при ширине сцены ${mk.inner} px, стол ${mk.w[0]} px`);
  await m.eval(`document.getElementById('cliport').scrollIntoView({ behavior: 'instant' }); true`); await sleep(400); await m.shotEl(out('l21-m-cliport.png'), '#cliport .scene-card', 4);
  await m.shotEl(out('l21-m-bridge.png'), '#finale .bridge-note', 12);
  await m.eval(`document.getElementById('maps').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out('l21-m-pick.png'), '#maps .lab', 4);
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
