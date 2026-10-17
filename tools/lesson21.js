// Урок 2.1 «Transporter и CLIPort»: лаборатории дают обещанные в тексте исходы, консоль чиста, телефон без горизонтальной прокрутки.
// Схема контрастного обучения (shared/anim.js) — подписи в канвасе на всех кадрах; вопросы-переходы — в конце разделов.
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
    for (const t of ${JSON.stringify(frames)}) {
      boxes = []; Anim.seek(cv, t); const b = boxes; boxes = null;
      [W, H] = cv.style.aspectRatio.split('/').map(Number); texts[t] = b.map((q) => q.t);
      b.forEach((q) => { if (q.x0 < 1 || q.x1 > W - 1 || q.y0 < 0 || q.y1 > H) bad.push('t = ' + t + ': за краем «' + q.t + '»'); });
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0);
        if (ox > 1 && oy > 1) bad.push('t = ' + t + ': «' + b[i].t + '» на «' + b[j].t + '»');
      }
    }
    CanvasRenderingContext2D.prototype.fillText = orig;
    return JSON.stringify({ layout: cv.dataset.layout, W, H, bad, texts });
  })()`));
}
/** Сходство выделенной пары в подписи кадра: «верная пара …: сходство 1,0 ↑» → 1. */
const simOf = (texts, re) => { const s = (texts || []).find((x) => re.test(x)); const m = s && /(−?\d+,\d)\s*[↑↓]?$/.exec(s); return m ? +m[1].replace('−', '-').replace(',', '.') : NaN; };
const NO_ANIM = 'схемы нет: в build.py для l21 нужен shared/anim.js перед l21/ui-l21.js';
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^1[01] миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q, #recall [data-recall] *').length`)) > 0, 'разминка по уроку 1.8 на месте');
  const lead = await p.eval(`document.querySelector('#top .lead').textContent`);
  check(/^В части 1 мы разбирали/.test(lead) && /В уроке разберём/.test(lead) && !/Политики части 1/.test(lead), 'вступление: что разбирали в части 1 и что разберём в уроке');
  // вопросы-переходы: последний абзац раздела, вопрос, на который отвечает следующий раздел
  const bq = J(await p.eval(`JSON.stringify([...document.querySelectorAll('p.bridge-q')].map((q) => ({ t: q.textContent.trim(), last: !q.nextElementSibling, prose: !!q.closest('.prose'), sec: q.closest('section').id })))`));
  check(bq.length === 4 && bq.every((q) => q.last && q.prose && /\?$/.test(q.t)) && bq.map((q) => q.sec).join() === 'words,maps,place,cliport',
    'вопросы-переходы: ' + bq.map((q) => `${q.sec} «${q.t}»`).join('; '));
  // схема контрастного обучения: кадры с подписями в канвасе; верная пара сходится, неверная расходится
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(300);
  const sc = await schemeLabels(p, 'contrast', SCHEME_T);
  check(!sc.none && sc.layout === 'w' && sc.bad.length === 0, sc.none ? 'схема контрастного обучения: ' + NO_ANIM : `схема контрастного обучения ${sc.W}×${sc.H}: подписи в канвасе и не налезают` + (sc.bad.length ? ': ' + sc.bad.slice(0, 4).join('; ') : ''));
  if (!sc.none) {
    const g0 = simOf(sc.texts['3'], /^верная пара/), g1 = simOf(sc.texts['11.2'], /^верная пара/), b0 = simOf(sc.texts['3'], /^подпись «/), b1 = simOf(sc.texts['11.2'], /^подпись «/);
    check(g0 < 0 && g1 >= 0.95 && b0 >= 0.8 && b1 <= 0.2, `схема: верная пара ${g0} → ${g1}, неверная ${b0} → ${b1}`);
    for (const t of [3.0, 8.0, 11.2]) { await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=contrast]'); Anim.seek(cv, ${t}); cv.classList.remove('paused'); return true; })()`); await p.shotEl(out(`l21-contrast-${t}.png`), '#words .scheme-fig', 6); }
  }
  await p.shotEl(out('l21-bridge.png'), '#words p.bridge-q', 12);
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
  await p.shotEl(out('l21-bridge-dark.png'), '#words p.bridge-q', 12);
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
  await m.shotEl(out('l21-m-bridge.png'), '#maps p.bridge-q', 12);
  await m.eval(`document.getElementById('maps').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out('l21-m-pick.png'), '#maps .lab', 4);
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
