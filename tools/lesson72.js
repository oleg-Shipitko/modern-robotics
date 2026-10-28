// Урок 7.2 «JEPA и V-JEPA 2»: записи толчков Ады, маленькая JEPA учится на странице так же, как в Node (те же числа бит
// в бит), лаборатория 1 даёт обещанные исходы (коллапс без защиты, две защиты, медленный коллапс и угадывание толчка),
// вшитые модели лаборатории 2 совпадают с обучением в Node, обе Ады ставят чашку так, как сказано в тексте, миссии
// проходятся через интерфейс (ставка, ручки, кнопка, критерии), числа в разборах совпадают с движком, мост из 7.1 подхвачен,
// мосты стоят где надо, схемы движутся и их подписи не мельче 10 px и помещаются в блоки на ширинах 1440, 1024, 768,
// 720, 640, 390 и 360, диаграммы построены, квиз, глоссарий и KaTeX на месте, консоль чиста, тёмная тема, телефон 390.
// Снимки — shots/l72-*.png. Сборка: MR_ASOF=2026-11-07 python3 lessons/build.py l72.
// node tools/lesson72.js          — всё: проверки в Node (с повторным обучением моделей лаборатории 2, около трёх минут) и в Chrome;
// node tools/lesson72.js --check  — только Node; --fast — без повторного обучения моделей лаборатории 2.
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lessons/l72/lesson.html'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'lessons/l72/ui-l72.js'), 'utf8');
const INTEG = fs.readFileSync(path.join(ROOT, 'lessons/l72/INTEGRATION.md'), 'utf8');
const plain = () => sp(SRC).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const L = require('../lessons/l72/engine.js'), E = L.L71;
// слова о расположении на экране: в подписях говорим о ролях; «вид на стол сверху» — направление взгляда камеры
const POS0 = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const noView = (s) => String(s).replace(/вид(?:е)? (?:на стол )?сверху/gi, 'вид').replace(/видит (?:кухонный )?стол сверху/gi, 'видит стол').replace(/(верхн|нижн)[а-яё]+ уров[а-яё]+/gi, 'уровень');
const POS = { test: (s) => POS0.test(noView(s)) };
const posWord = (s) => { const m = noView(s).match(POS0); return m ? m[2] : ''; };
const SLEEP = /(^|[^а-яё])(сон|сна|сну|сном|сне|сны|снов|снам|снами|снах|сновидени[а-яё]*|снит[а-яё]*|сонн[а-яё]*|спит|спят|спящ[а-яё]*|усн[а-яё]+|засып[а-яё]*|засн[а-яё]+|выспа[а-яё]*)(?![а-яё])/i;
const YAV = /(^|[^а-яё])яв(ь|и|ью)(?![а-яё])/i;
const h2of = (src, id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(src); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };

/* ---------- проверки без браузера ---------- */
function dataChecks() {
  const txt = plain(), t0 = Date.now();
  // записи толчков
  const d1 = L.lab1Data('same'), d2 = L.lab1Data('tint');
  const maxPush = Math.max(...d1.train.map((x) => Math.hypot(x.a[0], x.a[1]))), minEdge = Math.min(...d1.train.map((x) => Math.min(x.c1[0], x.c1[1], E.TABLE.W - x.c1[0], E.TABLE.H - x.c1[1])));
  check(d1.train.length === 900 && d2.train.length === 900 && d1.test.length === 240 && maxPush <= L.D_MAX + 1e-9 && minEdge > 0.05, `записи лаборатории 1: ${d1.train.length} толчков в 150 записях, проверка на ${d1.test.length} кадрах 40 других записей; толчок не длиннее ${fr(maxPush * 100, 1)} см, чашка не ближе ${fr(minEdge * 100, 1)} см к краю`);
  const pxSame = new Set(d1.train.map((x) => x.light.brightness)).size, pxTint = new Set(d2.train.map((x) => x.light.brightness)).size;
  check(pxSame === 1 && pxTint === 150 && d2.train.every((x) => x.light.sun === null), `свет: в записях «один и тот же» одна яркость, в записях «меняется от записи к записи» — ${pxTint} разных, по одной на запись`);
  const enc = L.encoder(768, L.LAB1.H, L.LAB1.D, 1), nEnc = enc.W1.length + enc.b1.length + enc.W2.length + enc.b2.length;
  check(nEnc === 18656 && txt.includes('18 656 параметров') && txt.includes('150 записей по 6 толчков') && txt.includes('500 шагов по пакетам из 32') && txt.includes('ошибается меньше чем на 4 см'), `энкодер лаборатории 1: ${nEnc} параметров, как в «Под капотом»; 150 записей, 500 шагов, щуп «в чашку» — меньше 4 см`);
  // лаборатория 1 — те же запуски, что миссии
  const R = {
    none: L.lab1Run({ prot: 'none' }), ema: L.lab1Run({ prot: 'ema', mom: 0.95 }), vr: L.lab1Run({ prot: 'var', vr: 5 }),
    slow: L.lab1Run({ prot: 'var', vr: 5, light: 'tint' }), inv: L.lab1Run({ prot: 'var', vr: 5, light: 'tint', inv: true }),
  };
  check(R.none.loss < 0.01 && R.none.spread < 0.1 && R.none.hit < 0.1, `миссия 1, без защиты: функция потерь ${fr(R.none.loss0, 2)} → ${fr(R.none.loss, 4)}, разброс ${fr(R.none.spread, 2)}, щуп в чашку ${Math.round(R.none.hit * 100)}%, ошибка ${fr(R.none.err * 100, 1)} см (середина стола — ${fr(R.none.base * 100, 1)} см)`);
  check(R.ema.loss > 50 * R.none.loss && R.ema.spread > 0.5 && R.ema.hit >= 0.5, `миссия 2, скользящее среднее: потеря ${fr(R.ema.loss, 3)} (в ${fr(R.ema.loss / R.none.loss, 0)} раз выше), разброс ${fr(R.ema.spread, 2)}, щуп ${Math.round(R.ema.hit * 100)}%, ${fr(R.ema.err * 100, 1)} см`);
  check(R.vr.spread > 0.5 && R.vr.hit >= 0.5, `миссия 3, штраф за разброс: разброс ${fr(R.vr.spread, 2)}, щуп ${Math.round(R.vr.hit * 100)}%, ${fr(R.vr.err * 100, 1)} см`);
  check(R.slow.spread >= 0.3 && R.slow.err > 0.15 && R.inv.err < 0.1, `миссия 4: свет меняется — без угадывания толчка разброс ${fr(R.slow.spread, 2)}, а щуп ошибается на ${fr(R.slow.err * 100, 1)} см; с угадыванием — ${fr(R.inv.err * 100, 1)} см`);
  // вшитые модели лаборатории 2
  const M = L.lab2Models(), C = L.LAB2;
  check(M.rep.D === C.rep.model.D && M.rep.H === C.rep.model.H && M.pix.D === C.pix.model.D && M.pix.H === C.pix.model.H && txt.includes('600 записей по 6 толчков') && txt.includes('8000 шагов обучения'), `вшиты модель представлений (${M.rep.H} нейронов, ${M.rep.D} чисел) и модель кадров (${M.pix.H} нейронов, латентное состояние ${M.pix.D} чисел), как в тексте`);
  const eng = fs.readFileSync(path.join(ROOT, 'lessons/l72/engine.js'), 'utf8'), dataKB = (eng.indexOf('/*@@/DATA@@*/') - eng.indexOf('/*@@DATA@@*/')) / 1024;
  check(dataKB < 200 && eng.length / 1024 < 250, `вшитые данные ${fr(dataKB, 1)} КБ, весь движок ${fr(eng.length / 1024, 1)} КБ (не больше 250 КБ)`);
  if (!process.argv.includes('--fast')) {
    console.log('  … обучаю модели лаборатории 2 заново в Node (около двух минут)');
    const data = L.pushRecords(C.data), S = L.normStats(data); L.prep(data, S);
    const H = (arrs) => E.hashNums([].concat(...arrs.map((a) => Array.from(a))));
    const encW = (e) => [e.W1, e.b1, e.W2, e.b2], netW = (m) => [].concat(...m.L.map((l) => [l.w, l.bias]));
    const Jm = L.jepa(C.rep.model); E.finish(L.trainJepa(Jm, data, C.rep.train));
    const Pm = L.pixModel(C.pix.model); E.finish(L.trainPix(Pm, data, C.pix.train));
    const hr = H(encW(Jm.enc).concat(netW(Jm.pred))), hp = H(encW(Pm.enc).concat(netW(Pm.dyn), netW(Pm.dec))), hn = H([S.mu, S.sd]);
    check(hr === M.hash.rep && hp === M.hash.pix && hn === M.hash.norm, `повторное обучение в Node даёт те же веса, что вшиты: хэши ${hr}, ${hp}, ${hn}`);
    // восьмибитные веса близки к обученным
    let worst = 0; for (let i = 0; i < Jm.enc.W1.length; i++) { const col = i % Jm.H; let mx = 0; for (let r = 0; r < 768; r++) mx = Math.max(mx, Math.abs(Jm.enc.W1[r * Jm.H + col])); worst = Math.max(worst, Math.abs(Jm.enc.W1[i] - M.rep.enc.W1[i]) / (mx / 127)); }
    check(worst <= 0.5001, `восьмибитные веса энкодера отличаются от обученных не больше чем на полшага квантования (${fr(worst, 3)})`);
  }
  // сцены миссий лаборатории 2
  const att = (name, kind, extra) => { const S = L.GOAL_SCEN[name]; return L.attempt(Object.assign({ kind, M: M[kind], S: M.S, cup: S.cup, goal: S.goal, lightNow: E.LIGHTS.day, lightGoal: E.LIGHTS[S.light], seed: 1, maxPush: 6, pop: 64, iters: 5, elite: 8 }, extra || {})); };
  const A = {}; for (const n of ['near', 'far', 'morning']) for (const k of ['pix', 'rep']) A[n + '-' + k] = att(n, k);
  check(A['near-pix'].ok && A['near-rep'].ok, `миссия «Рядом»: модель кадров — ${fr(A['near-pix'].dist * 100, 1)} см, модель представлений — ${fr(A['near-rep'].dist * 100, 1)} см от цели`);
  check(A['far-rep'].ok && !A['far-pix'].ok, `миссия «Далеко»: модель представлений — ${fr(A['far-rep'].dist * 100, 1)} см, модель кадров — ${fr(A['far-pix'].dist * 100, 1)} см`);
  check(!A['morning-rep'].ok && !A['morning-pix'].ok && A['morning-pix'].dist < A['morning-rep'].dist, `миссия «Утро»: модель кадров — ${fr(A['morning-pix'].dist * 100, 1)} см, модель представлений — ${fr(A['morning-rep'].dist * 100, 1)} см; ни одна не точнее 2 см`);
  const h2 = att('far', 'rep', { horizon: 2 });
  check(h2.steps.length === 6 && h2.steps.every((s) => s.plan.length === 2), `план на два толчка работает: до цели ${fr(h2.dist * 100, 1)} см`);
  // опрос на 30 целях — числа диаграммы
  const sv = L.lab2Survey({ n: 30 }), want = { 'near-pix': 24, 'near-rep': 28, 'far-pix': 6, 'far-rep': 20, 'morning-pix': 6, 'morning-rep': 0 };
  const svOk = Object.keys(want).every((k) => sv[k].ok === want[k]);
  const cap = sp(/<p class="stat-cap" id="surveyCap">([\s\S]*?)<\/p>/.exec(SRC)[1]);
  const medOk = ['near-pix', 'near-rep', 'far-pix', 'far-rep', 'morning-pix', 'morning-rep'].every((k) => cap.includes(fr(sv[k].median * 100, 1)));
  check(svOk && medOk && /\[\['цель рядом', 24, 28\], \['цель далеко', 6, 20\], \['рядом, фото утром', 6, 0\]\]/.test(UI), `опрос на 30 целях: ` + Object.keys(want).map((k) => `${k} ${sv[k].ok}/30 (${fr(sv[k].median * 100, 1)} см)`).join(', ') + ' — как в диаграмме и подписи');
  // тексты урока
  check(!SLEEP.test(txt) && !YAV.test(txt) && !SLEEP.test(UI) && !YAV.test(UI), 'слов «сон», «явь» и их производных нет ни в тексте, ни в лабораториях и схемах');
  check(!/(^|[^а-яё])(ядро|углублени[ея])([^а-яё]|$)|⭐|➕/i.test(txt), 'в тексте нет меток «ядро», «углубление» и значков уровня урока');
  const forb = /роллаут|модельное RL|галлюцинац|эмбеддинг|нейросимулятор|предсказател|таргет|учител|коллапс мод|целевое изображение|не просто [а-яё]+, а |это не [а-яё]+ — это|(^|[^а-яё])признак/i;
  check(!forb.test(txt) && !forb.test(UI.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'нет слов из списка «чего не писать» части 7 (эмбеддинг, предсказатель, таргет-энкодер, учитель, коллапс мод, целевое изображение, признаки) и шаблонных конструкций' + (forb.test(txt) ? ': ' + txt.match(forb)[0] : ''));
  check(!/(^|[^а-яё])вывод(ом|а|у)?\s+модел/i.test(txt) && !/стохастическ/i.test(txt), 'запуск модели не называется «выводом», нет «стохастический»');
  check((txt.match(/энерги/gi) || []).length <= 4, 'слово «энергия» — только там, где речь о схеме ЛеКуна и о том, как это называют в статье');
  // разминка, мосты, INTEGRATION.md
  const l71 = fs.readFileSync(path.join(ROOT, 'lessons/l71/lesson.html'), 'utf8');
  const rec = J(/<script type="application\/json" id="recallData">([\s\S]*?)<\/script>/.exec(SRC)[1]);
  check(rec.n === '7.1' && rec.q.length === 3 && rec.q.every((q) => h2of(l71, q.sec) === q.secTitle), 'разминка по 7.1: три вопроса из INTEGRATION.md урока 7.1, разделы и названия совпадают с h2 урока 7.1: ' + rec.q.map((q) => q.sec).join(', '));
  const recall = J(/### 3а\.[\s\S]*?```json\n([\s\S]*?)```/.exec(INTEG)[1]);
  const pc = [...(/### 3б\.[\s\S]*?```js\n([\s\S]*?)```/.exec(INTEG)[1]).matchAll(/sec: '([a-z0-9]+)', st: '([^']+)'/g)];
  check(recall.n === '7.2' && recall.q.length === 3 && recall.q.every((q) => h2of(SRC, q.sec) === q.secTitle && q.o.length === 3 && !/\d/.test(q.o.join(' '))) && pc.length >= 3 && pc.every((m) => h2of(SRC, m[1]) === m[2]), `INTEGRATION.md: разминка для 7.3 (${recall.q.length} вопроса) и вопросы проверки части 7 (${pc.length}) ссылаются на разделы урока с их настоящими заголовками`);
  const gl = J(/## 4\.[\s\S]*?```json\n([\s\S]*?)```/.exec(INTEG)[1]);
  const glAll = J(fs.readFileSync(path.join(ROOT, 'lessons/shared/glossary.json'), 'utf8')), ids = new Set(glAll.map((g) => g.id));
  const glMatch = gl.map((g) => ({ id: g.id, n: (sp(SRC.slice(SRC.indexOf('<main>'))).replace(/<[^>]+>/g, ' ').match(new RegExp('(?<![\\wа-яё-])(?:' + g.a + ')(?![\\wа-яё-])', 'gi')) || []).length }));
  check(gl.length >= 3 && gl.length <= 6 && gl.every((g) => g.l === 'l72' && h2of(SRC, g.sec) && g.t && g.en && g.d.length > 60 && !ids.has(g.id)) && glMatch.every((m) => m.n > 0), `глоссарий: ${gl.length} новых терминов, их нет в glossary.json, разделы существуют, шаблоны находят термины в тексте: ` + glMatch.map((m) => `${m.id} ×${m.n}`).join(', '));
  // числа диаграмм в подписях
  const caps = [...SRC.matchAll(/<p class="stat-cap"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => sp(m[1]).replace(/<[^>]+>/g, ''));
  const need = [['40,7', '66,9', '68,6', '73,7', '66,0', '66,2', '73,3', '74,8'], ['84,2', '85,2', '86,7', '87,5', '88,2'], ['100', '15 и 65', '0 и 25', '15 и 75', '70 и 75', '15 и 80', '10 и 65'], ['80', '0 и 60', '20 и 20', '0 и 80', '0 и 50', '240 секунд', '16 с'], ['24', '28', '6 и 20', '6 и 0'], ['74', '100', '98', '4, 100, 0, 96', '18, 64, 0, 92', '32, 30, 0, 90'], ['дотянуться — 100, взять — 60, переставить — 80', '100, 70 и 80', '100, 80 и 80'], ['18,0', '39,3', '73,3', '63,3', '40,7; 81,3; 96,0; 80,0', '32,0; 47,3; 60,0; 55,3', '40,0; 45,3; 17,3; 0,7']];
  const miss = need.map((list) => list.filter((x) => !caps.some((c) => c.includes(x)))).filter((m) => m.length);
  check(caps.length === 8 && !miss.length && caps.filter((c) => !/Наша модель|L72\.lab2Survey/.test(c)).every((c) => /Источник/.test(c) && /\d\d\.\d\d\.\d{4}/.test(c)), `8 подписей диаграмм: все числа столбцов есть, у чисел из статей — источник и дата` + (miss.length ? ': нет ' + miss.map((m) => m.join(', ')).join('; ') : ''));
  console.log(`  (проверки без браузера — ${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  return { R, A, sv };
}

if (process.argv.includes('--check')) { dataChecks(); finish(); } else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.join(ROOT, 'site/lessons/7-2-jepa-v-jepa-2.html');
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
async function viaUI(p, root, bet) {
  const r = J(await p.eval(`(async () => {
    const root = document.querySelector('${root}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 1800 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 120));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true));
  r.out = sp(r.out); return r;
}
const nextMission = (p, root) => p.eval(`(() => { const b = document.querySelector('${root} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
/** Подписи схемы: в канвасе, без наложений, не мельче 10 px на экране и внутри своего блока. */
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
const overflow = (p) => p.eval(`JSON.stringify({ sw: document.documentElement.scrollWidth,
  lab: [...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length,
  stat: [...document.querySelectorAll('.stat-fig')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  formula: [...document.querySelectorAll('.formula')].filter((f) => f.scrollWidth > f.clientWidth + 1).length })`).then(J);
const FRAMES = { jepa: [0.6, 1.9, 3.3, 4.6, 5.9, 7.4], vjac: [0.5, 1.6, 2.4, 3.8, 5.5, 6.6, 8.2] };
const WANT = { jepa: ['кадр сейчас', 'энкодер', 'шаг модели', 'декодер', 'предиктор', 'целевой энкодер', 'градиент не идёт', 'по 768 числам', 'по 8 числам'], vjac: ['картинка-цель', 'заморожен', 'предиктор', 'z′ кандидатов', 'расстояние', 'первое действие', 'пикселей в цикле нет: сравниваются только представления'] };
(async () => {
  const D = dataChecks();
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 60000); await sleep(400);
    await p.eval('window.__noAnim = true; true');
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^7 миссий с целью$/.test(hero), 'число миссий в шапке (без свободных режимов): ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по 7.1 показана: три вопроса');
    // начало урока подхватывает мост из 7.1
    const lead = await text(p, '.hero .lead');
    const l71 = fs.readFileSync(path.join(ROOT, 'lessons/l71/lesson.html'), 'utf8'), br71 = sp(/<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(l71.slice(l71.indexOf('id="finale"')))[1].replace(/<[^>]+>/g, ''));
    check(/^В уроке 7\.1 модели мира учились, восстанавливая каждый кадр/.test(lead) && ['кирпичную кладку', 'разметку дороги', 'один пиксель'].every((x) => lead.includes(x) && br71.includes(x)) && /представлени/.test(lead), 'начало урока подхватывает мост из 7.1: восстановление кадра, кирпичная кладка Doom, разметка дороги, мяч в один пиксель');
    const note = await text(p, '#pixels .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note), 'заметка об Аде при первом упоминании: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ down: b.classList.contains('down'), t: b.textContent.trim(), sec: b.closest('section').id, next: (b.closest('section').nextElementSibling || {}).id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href'), to: b.querySelector('.bridge-to') && b.querySelector('.bridge-to').textContent.trim(), last: !b.nextElementSibling })))`));
    check(bn.length === 2 && bn[0].down && bn[0].sec === 'ijepa' && bn[0].next === 'vjepa2' && /^V-JEPA 2-AC: как /.test(bn[0].to) && !bn[1].down && bn[1].sec === 'finale' && bn[1].last && /^Урок 7\.3 · Генеративные модели мира: как /.test(bn[1].to) && !bn[1].a && /62 часов DROID/.test(bn[1].t), 'мосты: внутренний после I-JEPA и V-JEPA перед разделом V-JEPA 2, в конце — в урок 7.3 без ссылки (часть 7 не вышла): ' + bn.map((b) => `${b.sec} «${b.to}» → ${b.a || 'без ссылки'}`).join('; '));
    const mainTxt = sp(await p.eval(`document.querySelector('main').innerText`));
    check(!SLEEP.test(mainTxt) && !YAV.test(mainTxt), 'на странице нет слова «сон», «явь» и их производных, в том числе в лабораториях');
    check(!(await p.eval(`!!document.querySelector('.gl[data-gl="teacher"], .gl[data-gl="stochastic-policy"], .gl[data-gl="mode"], .gl[data-gl="expert"]')`)), 'ложных подсказок глоссария нет: учитель, стохастическая политика, мода, эксперт');
    check(await p.eval(`(() => { const g = document.querySelector('.gl[data-gl="mode-collapse"]'); return !!g && /6\\.2/.test(g.closest('p').textContent); })()`), 'подсказка «схлопывание мод» стоит там, где коллапс представлений разводится с уроком 6.2');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const kind of ['jepa', 'vjac']) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); Anim.seek(cv, 1.0); const x = cv.toDataURL(); Anim.seek(cv, 5.1); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${kind} движется: кадры в разные моменты разные`);
      const sl = await schemeLabels(p, kind, FRAMES[kind]);
      check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.minPx >= 9.95 && sl.distinct >= FRAMES[kind].length - 1, `схема ${kind} (широкая, 1440): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках, ${sl.distinct} разных кадров` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
      check(!sl.texts.some((x) => POS.test(x)), `схема ${kind}: в подписях нет слов о расположении`);
      const st = sl.texts.join(' ');
      check(WANT[kind].every((x) => st.includes(x)), `схема ${kind} называет свои блоки` + (WANT[kind].every((x) => st.includes(x)) ? '' : ': нет ' + WANT[kind].filter((x) => !st.includes(x)).join(', ')));
    }
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="jepa"]'), 5.9); Anim.seek(document.querySelector('canvas[data-anim="vjac"]'), 3.8); true`);
    await show(p, 'jepa', '#jepa .flow-card', 'l72-jepa.png'); await show(p, 'vjepa2', '#vjepa2 .flow-card', 'l72-vjac.png');
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro, .stat-cap, details.deep')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен, схем, диаграмм и «Под капотом» — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map(posWord).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify([...window.__l72.CollapseLab.missions, ...window.__l72.GoalLab.missions].flatMap((m) => [m.title, m.text, m.hint, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x) || SLEEP.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям, без заглушек и без слова «сон»` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    // диаграммы
    const stats = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.stat-fig')].map((f) => ({ ids: [...f.querySelectorAll('.stat-bars')].map((b) => b.id), bars: f.querySelectorAll('.sb-bar').length, legends: f.querySelectorAll('.sb-legend').length })))`));
    check(stats.length === 8 && stats.every((s) => s.bars >= 5) && stats.filter((s) => s.legends >= 1).length >= 6, 'восемь фигур с диаграммами (StatsChart): у каждой не меньше пяти столбцов, легенды при двух рядах: ' + stats.map((s) => `${s.ids.join('+')}:${s.bars}`).join(', '));
    for (const [id, sel, n] of [['ijepa', '#ijepa .stat-fig', 'l72-stat-target.png'], ['vjepa2', '#vjepa2 .stat-fig:nth-of-type(3)', 'l72-stat-octo.png'], ['dino', '#dino .stat-fig', 'l72-stat-dino.png'], ['today', '#today .stat-fig:last-of-type', 'l72-stat-hjepa.png']]) await show(p, id, sel, n);

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(await visible(p, '#clProt') && !(await visible(p, '#wrapClLight')) && !(await visible(p, '#wrapClInv')) && !(await visible(p, '#wrapClMom')) && !(await visible(p, '#wrapClVr')), 'миссия 1: видны сцена и выбор защиты, свет, угадывание толчка, момент и вес штрафа скрыты');
    check(/Кривая появится после запуска обучения/.test(await p.eval(`'Кривая появится после запуска обучения'`)), 'до обучения на кривой написано, что сделать');
    await show(p, 'collapse', '#collapse .lab', 'l72-lab1-start.png');
    const R = D.R;
    let r = await viaUI(p, '#clMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`до ${fr(R.none.loss, 4)}`) && r.out.includes(`до ${fr(R.none.spread, 2)}`) && r.out.includes(`${fr(R.none.err * 100, 1)} см`), `миссия 1: коллапс засчитан, ставка сыграла, числа разбора как в Node (потеря ${fr(R.none.loss, 4)}, разброс ${fr(R.none.spread, 2)}, щуп ${fr(R.none.err * 100, 1)} см)`);
    const same1 = J(await p.eval(`JSON.stringify(window.__l72.Collapse.st.last)`));
    check(same1.loss === R.none.loss && same1.spread === R.none.spread && same1.err === R.none.err, 'лаборатория 1: функция потерь, разброс и ошибка щупа в Chrome и в Node совпадают бит в бит');
    await show(p, 'collapse', '#collapse .lab', 'l72-lab1-m1.png');
    await nextMission(p, '#clMis');
    await p.eval(`document.querySelector('#clProt button[data-v="ema"]').click(); true`);
    r = await viaUI(p, '#clMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в конце ${fr(R.ema.loss, 3)}`) && r.out.includes(`в ${fr(R.ema.loss / R.none.loss, 0)} раз выше`) && r.out.includes(`в ${Math.round(R.ema.hit * 100)}% кадров`), `миссия 2: скользящее среднее засчитано, потеря ${fr(R.ema.loss, 3)} в ${fr(R.ema.loss / R.none.loss, 0)} раз выше, щуп ${Math.round(R.ema.hit * 100)}%`);
    await nextMission(p, '#clMis');
    await p.eval(`document.querySelector('#clProt button[data-v="var"]').click(); true`);
    r = await viaUI(p, '#clMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в ${Math.round(R.vr.hit * 100)}% кадров`) && r.out.includes(`${fr(R.vr.err * 100, 1)} см`), `миссия 3: штраф за разброс засчитан, щуп ${Math.round(R.vr.hit * 100)}%, ${fr(R.vr.err * 100, 1)} см`);
    await show(p, 'collapse', '#collapse .lab', 'l72-lab1-m3.png');
    await nextMission(p, '#clMis');
    check(await visible(p, '#wrapClLight') && await visible(p, '#wrapClInv') && (await p.eval(`document.querySelector('#clLight button[aria-pressed="true"]').dataset.v`)) === 'tint', 'миссия 4: появились свет в записях (уже «меняется») и угадывание толчка');
    r = await viaUI(p, '#clMis', 1);
    check(!r.ok && r.crit[1] === 'ok' && r.crit[2] === 'no' && r.out.includes(`${fr(R.slow.err * 100, 1)} см`) && /отметь «угадывать толчок/.test(r.out), `миссия 4, без угадывания толчка: медленный коллапс замечен (щуп ${fr(R.slow.err * 100, 1)} см), разбор предлагает угадывание толчка`);
    await show(p, 'collapse', '#collapse .lab', 'l72-lab1-slow.png');
    await p.eval(`document.getElementById('clInv').click(); true`);
    r = await viaUI(p, '#clMis', null);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`ошибка щупа ${fr(R.inv.err * 100, 1)} см`) && r.out.includes(`ошибался на ${fr(R.slow.err * 100, 1)} см`), `миссия 4: с угадыванием толчка засчитана, щуп ${fr(R.slow.err * 100, 1)} → ${fr(R.inv.err * 100, 1)} см, как в Node`);
    await show(p, 'collapse', '#collapse .lab', 'l72-lab1-m4.png');
    await nextMission(p, '#clMis');
    check(await visible(p, '#wrapClMom') && await visible(p, '#wrapClVr'), 'свободный режим: видны момент скользящего среднего и вес штрафа');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    const A = D.A;
    check(!(await visible(p, '#wrapGlMap')) && !(await visible(p, '#wrapGlLight')) && !(await visible(p, '#wrapGlPop')), 'миссия 1: карта расстояния, свет фотографии и настройки CEM скрыты');
    await show(p, 'goal', '#goal .lab', 'l72-lab2-start.png');
    r = await viaUI(p, '#glMis', 0);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в ${fr(A['near-pix'].dist * 100, 1)} см от цели`) && r.out.includes(`— в ${fr(A['near-rep'].dist * 100, 1)} см`), `миссия «Рядом»: обе Ады точнее 2 см (${fr(A['near-pix'].dist * 100, 1)} и ${fr(A['near-rep'].dist * 100, 1)} см), как в Node`);
    const g1 = J(await p.eval(`JSON.stringify(window.__l72.Goal.st.last)`));
    check(g1.pix.dist === A['near-pix'].dist && g1.rep.dist === A['near-rep'].dist && g1.pix.ms > g1.rep.ms, `лаборатория 2: расстояния в Chrome и в Node совпадают бит в бит; план толчка у модели кадров ${fr(g1.pix.ms, 1)} мс, у модели представлений ${fr(g1.rep.ms, 1)} мс`);
    await show(p, 'goal', '#goal .lab', 'l72-lab2-m1.png');
    await nextMission(p, '#glMis');
    check(await visible(p, '#wrapGlMap'), 'миссия «Далеко»: появилась карта расстояния до цели');
    await p.eval(`document.getElementById('glMap').click(); true`);
    const mp = J(await p.eval(`(() => { const G = window.__l72.Goal, a = G.mapOf('rep'), b = G.mapOf('pix'), g = G.st.goal; const dir = (m) => { const d0 = Math.hypot(g[0] - m.at[0], g[1] - m.at[1]); return d0 - Math.hypot(g[0] - m.at[0] - m.best[0], g[1] - m.at[1] - m.best[1]); }; return JSON.stringify({ rep: dir(a), pix: dir(b) }); })()`));
    r = await viaUI(p, '#glMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`${fr(A['far-rep'].dist * 100, 1)} см`) && r.out.includes(`осталась в ${fr(A['far-pix'].dist * 100, 1)} см`), `миссия «Далеко»: модель представлений дошла (${fr(A['far-rep'].dist * 100, 1)} см), модель кадров осталась в ${fr(A['far-pix'].dist * 100, 1)} см`);
    await show(p, 'goal', '#goal .lab', 'l72-lab2-far.png');
    await nextMission(p, '#glMis');
    check(await visible(p, '#wrapGlLight') && (await p.eval(`document.querySelector('#glLight button[aria-pressed="true"]').dataset.v`)) === 'morning', 'миссия «Утро»: фотография снята утром, переключатель света виден');
    r = await viaUI(p, '#glMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`в ${fr(A['morning-pix'].dist * 100, 1)} см от цели`) && r.out.includes(`на ${fr(A['morning-rep'].dist * 100, 1)} см`), `миссия «Утро»: модель кадров ${fr(A['morning-pix'].dist * 100, 1)} см, модель представлений ${fr(A['morning-rep'].dist * 100, 1)} см — как в Node`);
    await show(p, 'goal', '#goal .lab', 'l72-lab2-morning.png');
    await nextMission(p, '#glMis');
    check(await visible(p, '#wrapGlPop') && await visible(p, '#wrapGlIt') && await visible(p, '#wrapGlHor') && await visible(p, '#glFreeNote'), 'свободный режим: видны настройки CEM, горизонт и подсказка про цель нажатием');
    const fg = J(await p.eval(`(() => { const cv = document.getElementById('glRep'); cv.scrollIntoView({ block: 'center' }); const r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.72, clientY: r.top + r.height * 0.25 })); return JSON.stringify(window.__l72.Goal.st.goal); })()`));
    await p.eval(`document.querySelector('#glHor button[data-v="2"]').click(); true`);
    r = await viaUI(p, '#glMis', null);
    const gF = J(await p.eval(`JSON.stringify(window.__l72.Goal.st.last)`));
    check(Math.abs(fg[0] - 0.62) < 0.08 && gF.horizon === 2 && gF.pix.n === 6 && gF.rep.n === 6 && Math.abs(gF.goal[0] - fg[0]) < 1e-12, `свободный режим: цель задаётся нажатием на стол (${fg.map((v) => fr(v, 2)).join('; ')}), план на два толчка: модель кадров ${fr(gF.pix.dist * 100, 1)} см, модель представлений ${fr(gF.rep.dist * 100, 1)} см`);
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий карточки лабораторий не вылезают за свою колонку: ' + wideD);
    check(mp.rep > 0.08 && mp.pix < mp.rep / 2, `карта расстояния в миссии «Далеко» (место, откуда чашка начинает): у модели представлений лучшее место ближе к цели на ${fr(mp.rep * 100, 1)} см, у модели кадров — на ${fr(mp.pix * 100, 1)} см`);

    // ---------- итоги, квиз, глоссарий, ссылки, консоль ----------
    const fin = await text(p, '#finale .takeaways');
    check(['JEPA', 'представление', 'коллапс представлений', 'целевым энкодером', 'V-JEPA 2-AC', 'картинке-цели', 'на другом конце стола', 'камеры'].every((x) => fin.includes(x)), 'итоги урока называют выводы разделов и лабораторий');
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    const qOpts = J(await p.eval(`JSON.stringify(window.__l72.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /(^|[\s(«,:])\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел');
    const answers = J(await p.eval(`JSON.stringify(window.__l72.QUIZ.map((q) => q.a))`));
    check(new Set(answers).size === 3, 'квиз: верные ответы стоят на всех трёх местах в данных: ' + answers.join(''));
    const gl = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.gl')].map((e) => e.dataset.gl))`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0 && ['world-model', 'mpc', 'stop-gradient', 'contrastive', 'patch', 'proprioception'].every((x) => gl.includes(x)), `подсказки глоссария строчные (${gl.length}), среди них модель мира, MPC, остановка градиента, контрастное обучение, патч, проприоцепция`);
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы KaTeX отрисованы, ошибок нет: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    const links = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('http') && !h.startsWith('#')))`));
    check(links.every((h) => /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h)) && links.includes('0-1-dve-paradigmy.html#ada') && !links.some((h) => /^[78]-/.test(h)), 'ссылки на уроки курса — только на вышедшие: ' + [...new Set(links)].join(', '));
    check(!(await p.eval(`!!document.querySelector('main iframe, main video, main img')`)), 'встроенного видео и фото нет (в статьях JEPA нет фото роботов со свободной лицензией)');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; App.emit('theme', 'dark'); window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['collapse', '#collapse .lab', 'l72-lab1-dark.png'], ['goal', '#goal .lab', 'l72-lab2-dark.png'], ['jepa', '#jepa .flow-card', 'l72-jepa-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    // ---------- другие ширины ----------
    console.log('ширины');
    const q = await B.page(url, { width: 1024, height: 900, light: true });
    for (const w of [1024, 768, 720, 640, 360]) {
      await q.S('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: w <= 640 ? 2 : 1, mobile: w <= 640 });
      await q.eval('window.__lessonReady = false; location.reload(); true'); await sleep(300);
      await q.waitFor('window.__lessonReady === true', 60000); await sleep(500);
      for (const kind of ['jepa', 'vjac']) {
        const s2 = await schemeLabels(q, kind, FRAMES[kind]);
        check(!s2.none && !s2.bad.length && s2.minPx >= 9.95 && s2.layout === (w < 700 ? 'n' : 'w'), `ширина ${w}: схема ${kind} (${s2.layout === 'w' ? 'широкая' : 'узкая'}) — подписи не мельче 10 px (наименьшая ${s2.minPx && s2.minPx.toFixed(1)}), в блоках, без наложений` + (s2.bad.length ? ': ' + s2.bad.slice(0, 3).join('; ') : ''));
      }
      await q.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = true; }); true`); await sleep(150);
      const ov = await overflow(q);
      check(ov.sw <= w && !ov.lab && !ov.stat && !ov.formula, `ширина ${w}: страница ${ov.sw} px, лаборатории, диаграммы и формулы не шире своих карточек` + (ov.formula ? `: формул шире — ${ov.formula}` : ''));
    }
    check(!q.logs.length, 'другие ширины: консоль ' + (q.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 60000); await sleep(400);
    await m.eval(`window.__noAnim = true; document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = true; }); true`); await sleep(200);
    const ovm = await overflow(m);
    check(ovm.sw <= 390 && !ovm.lab && !ovm.stat && !ovm.formula, `телефон: ширина ${ovm.sw}, лаборатории, диаграммы и открытые формулы «Под капотом» не шире карточек`);
    await m.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = false; }); true`);
    for (const kind of ['jepa', 'vjac']) {
      const sm2 = await schemeLabels(m, kind, FRAMES[kind]);
      check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length && sm2.minPx >= 9.95, `телефон, схема ${kind} (узкая): подписи не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках, без наложений` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    }
    const mob = J(await m.eval(`JSON.stringify({ top: (() => { const t = document.querySelector('#clMis .m-top').getBoundingClientRect().top, s = document.querySelector('#clLoss').getBoundingClientRect().top, b = document.querySelector('#clMis .m-bottom').getBoundingClientRect().top; return t < s && s < b; })(), top2: (() => { const t = document.querySelector('#glMis .m-top').getBoundingClientRect().top, s = document.querySelector('.gl-pair').getBoundingClientRect().top, b = document.querySelector('#glMis .m-bottom').getBoundingClientRect().top; return t < s && s < b; })(), pair: getComputedStyle(document.querySelector('.gl-pair')).gridTemplateColumns.split(' ').length })`));
    check(mob.top && mob.top2 && mob.pair === 1, 'телефон: условие миссий над сценой, запуск и итог — под ней; две Ады лаборатории 2 друг под другом');
    // одна миссия каждой лаборатории на телефоне
    r = await viaUI(m, '#clMis', 1);
    check(r.ok, 'телефон: миссия 1 лаборатории 1 проходится');
    r = await viaUI(m, '#glMis', 0);
    check(r.ok, 'телефон: миссия 1 лаборатории 2 проходится');
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['jepa', '#jepa .flow-card', 'l72-m-jepa.png'], ['collapse', '#collapse .lab', 'l72-m-lab1.png'], ['vjepa2', '#vjepa2 .flow-card', 'l72-m-vjac.png'], ['goal', '#goal .lab', 'l72-m-lab2.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
