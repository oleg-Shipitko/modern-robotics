// Проверка части 6: все задания отвечаются, разделы для повторения существуют в уроках и их заголовки совпадают дословно,
// в вариантах ответов нет чисел, разборы — полными предложениями; задача «Смена Ады» проходится через интерфейс:
// журнал, диагноз, замены решений, смены заново и платформа урока 6.6; её исходы считают движки уроков 6.1–6.5,
// одинаково в Node и JavaScriptCore, а числа совпадают с текстами уроков. Компьютер 1440 и телефон 390, тёмная тема, консоль.
// Снимки — shots/c6-*.png. Страница датирована днём выпуска, собирать так: MR_ASOF=2026-11-07 python3 lessons/build.py c6
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..');
const url = 'file://' + path.join(ROOT, 'site/lessons/proverka-chasti-6.html');
const out = (n) => path.join(ROOT, 'shots', n);
const R = (f) => path.join(ROOT, 'lessons', f);
const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

/** Заголовок h2 раздела sec урока l (6.1 → lessons/l61/lesson.html): первый h2 внутри этого раздела. */
function h2Of(l, sec) {
  const html = fs.readFileSync(R(`l${l.replace('.', '')}/lesson.html`), 'utf8'), i = html.search(new RegExp(`<section[^>]*\\bid="${sec}"`));
  if (i < 0) return null;
  const j = html.indexOf('</section>', i), m = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html.slice(i, j < 0 ? undefined : j));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
}
/** Текст урока без разметки, пробелы приведены к обычным. */
const lessonText = (l) => fs.readFileSync(R(`l${l.replace('.', '')}/lesson.html`), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/[  \s]+/g, ' ');

/* ---------- 1. Без браузера: исходы сцены, движки уроков и таблица урока 6.6 ---------- */
console.log('без браузера');
for (const n of ['61', '62', '63', '64', '65']) globalThis['L' + n] = require(R(`l${n}/engine.js`));
const C6 = require(R('c6/ui-c6.js'));
const L66 = require(R('l66/engine.js'));
// хэш всех исходов: каждое испытание с каждым вариантом своего решения, Wi-Fi — ещё и с каждым вариантом уровней
const HASH_SRC = `function c6hash(C6) {
  var h = 0, add = function (s) { s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; };
  C6.TRIALS.forEach(function (tr) { C6.LAYER[tr.layer].opts.forEach(function (op) {
    var lv = tr.id === 'wifi' ? C6.LAYER.levels.opts.map(function (o) { return o.id; }) : [C6.DRAFT.levels];
    lv.forEach(function (l) { var sys = Object.assign({}, C6.DRAFT, { levels: l }); sys[tr.layer] = op.id; var r = C6.evaluate(tr.id, sys);
      add(tr.id + op.id + l + r.ok + r.text); Object.keys(r.m).sort().forEach(function (k) { add(k + '=' + String(r.m[k])); }); }); }); });
  return h; }`;
const nodeHash = new Function('C6', HASH_SRC + '\nreturn c6hash(C6);')(C6);
let jscHash = null;
try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-jsc-')), f = path.join(tmp, 'hash.js');
  fs.writeFileSync(f, ['61', '62', '63', '64', '65'].map((n) => `load(${JSON.stringify(R(`l${n}/engine.js`))});`).join('\n') + `\nload(${JSON.stringify(R('c6/ui-c6.js'))});\n${HASH_SRC}\nprint('HASH ' + c6hash(this.C6));\n`);
  jscHash = +(/HASH (\d+)/.exec(execFileSync(JSC, [f], { encoding: 'utf8', timeout: 120000 })) || [])[1];
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { console.log('    jsc: ' + e.message.split('\n')[0]); }
check(jscHash === nodeHash, `исходы сцены одинаковы в Node и JavaScriptCore: ${nodeHash} и ${jscHash}`);
// политики урока 6.2 вшиты в ui-c6.js: обучение тем же движком с теми же настройками даёт те же параметры бит в бит
{
  const E = L62, A = E.adaClip('walk'), M = E.meanClip(A, E.swapLegs(A)), diff = [];
  for (const [key, mode] of [['track', { kind: 'track', clips: [A] }], ['amp', { kind: 'amp', clips: [A] }], ['mean', { kind: 'track', clips: [M] }]]) {
    const p = Array.from(E.run(E.train(mode, {})).p); if (p.length !== C6.P62[key].length || p.some((v, i) => v !== C6.P62[key][i])) diff.push(key);
  }
  check(!diff.length, 'параметры трекера, AMP и трекера по среднему совпадают с обучением движком урока 6.2' + (diff.length ? ': ' + diff.join(', ') : ''));
}
// исходы: первая версия проваливает все испытания, лучшие решения проходят все, у каждого решения свои отказы
const evalAll = (sys) => Object.fromEntries(C6.TRIALS.map((tr) => [tr.id, C6.evaluate(tr.id, sys)]));
const D = evalAll(C6.DRAFT), Bst = evalAll(C6.BEST);
check(C6.TRIALS.every((tr) => !D[tr.id].ok), 'первая версия системы не проходит ни одного испытания');
check(C6.TRIALS.every((tr) => Bst[tr.id].ok), 'с лучшими решениями Ада проходит все шесть испытаний');
{
  const exp = { walk: { full512: 1 }, style: { amp: 1 }, body: { gen: 1 }, levels: { wbc: 1 } }, wrong = [];
  for (const [lid, good] of Object.entries(exp)) for (const op of C6.LAYER[lid].opts) {
    const tid = C6.TRIALS.find((tr) => tr.layer === lid).id, r = C6.evaluate(tid, Object.assign({}, C6.BEST, { [lid]: op.id }));
    if (r.ok !== !!good[op.id]) wrong.push(`${lid}/${op.id}`);
  }
  const hw = { base: [false, false], cloud: [true, false], thorG1: [false, true], thorH1: [true, true], thorF3: [false, true] };
  for (const [o, [b, w]] of Object.entries(hw)) { const s = Object.assign({}, C6.BEST, { hw: o }); if (C6.evaluate('box', s).ok !== b || C6.evaluate('wifi', s).ok !== w) wrong.push('hw/' + o); }
  check(!wrong.length, 'каждое решение, кроме лучшего, проваливает своё испытание; железо: облако подводит без сети, Thor с малой батареей — по времени, с большой — колено' + (wrong.length ? ': ' + wrong.join(', ') : ''));
  const c = C6.hwCalc('thorG1'), h1 = C6.hwCalc('thorH1'), f3 = C6.hwCalc('thorF3'), base = C6.hwCalc('base');
  check(base.binding === 'arms' && c.binding === 'time' && f3.binding === 'legs' && h1.binding === null, `бюджет урока 6.5: плечо, время, колено и успех — ${base.binding}, ${c.binding}, ${f3.binding}, ${h1.binding}`);
}
// числа сцены совпадают с текстами уроков
{
  const S = (tid, layer, o, extra) => C6.evaluate(tid, Object.assign({}, C6.DRAFT, { [layer]: o }, extra || {})).text, miss = [];
  const pairs = [
    [S('hall', 'walk', 'fixed'), '0,71', '6.1', 'только 0,71 м/с'], [S('hall', 'walk', 'full512'), '0,88', '6.1', 'идёт 0,88 м/с'],
    [S('guests', 'style', 'terms'), '3,4 шага в секунду по 18 см', '6.1', '3,4 шага в секунду по 18 см'],
    [S('guests', 'style', 'terms'), 'требует значительной доли человеческого понимания', '6.2', 'требует значительной доли человеческого понимания и часто даёт лишь скромное улучшение'],
    [S('guests', 'style', 'track'), '0,92 м/с', '6.2', '0,92 м/с'], [S('guests', 'style', 'amp'), '1,12 Гц', '6.2', '1,12 Гц'], [S('guests', 'style', 'amp'), '1,03 м/с', '6.2', '1,03 м/с'],
    [S('lead', 'body', 'spec'), '14,8 см', '6.3', '14,82 см'], [S('lead', 'body', 'gen'), '3,6 см', '6.3', '3,63 см'],
    [S('tea', 'levels', 'direct5'), 'на 1,2 с, чай пролился', '6.4', 'пролила чай на 1,2 с'], [S('tea', 'levels', 'direct5'), 'на 8,4 с Ада упала', '6.4', 'на 8,4 с упала у полки'],
    [S('tea', 'levels', 'wbc'), '7,0 с', '6.4', 'поставила чашку за 7,0 с'],
    [S('box', 'hw', 'base'), 'плечу нужно 12,1 Н·м', '6.5', 'плечу нужно 12,1 Н·м'], [S('box', 'hw', 'base'), 'даёт 9,7', '6.5', 'даёт 9,7'],
    [S('box', 'hw', 'cloud'), '33,2 кг', '6.5', '33,2 кг'], [S('box', 'hw', 'thorG1'), '1,6 ч', '6.5', 'до 1,6 ч'], [S('box', 'hw', 'thorH1'), '36,5 кг', '6.5', '36,5 кг'],
    [S('box', 'hw', 'thorH1'), '3,2 ч', '6.5', '3,2 ч'], [S('box', 'hw', 'thorF3'), '17,7 кг', '6.5', '17,7 кг'],
  ];
  for (const [text, inScene, l, inLesson] of pairs) if (!text.includes(inScene) || !lessonText(l).includes(inLesson)) miss.push(`«${inScene}» / ${l} «${inLesson}»`);
  check(!miss.length, `числа в журнале смены совпадают с текстами уроков (${pairs.length} пар)` + (miss.length ? ': ' + miss.join('; ') : ''));
}
// разделы уроков у испытаний и у задачи на сцене
{
  const miss = Object.entries(C6.LINK).filter(([, k]) => h2Of(k.l, k.sec) !== k.st).map(([t, k]) => `${t}: ${k.l} #${k.sec} «${k.st}» ≠ «${h2Of(k.l, k.sec)}»`);
  check(!miss.length, 'ссылки журнала ведут на разделы уроков, заголовки h2 совпадают дословно' + (miss.length ? ': ' + miss.join('; ') : ''));
}
// платформы урока 6.6: сколько колонок таблицы расходится с Адой, и NEO ближе всех
{
  const nd = Object.fromEntries(L66.ROWS.filter((r) => r.id !== 'ada').map((r) => [r.id, L66.compare('ada', r.id).ndiff])), wrong = C6.PLATFORMS.filter((p) => nd[p.id] !== p.nd).map((p) => `${p.id} ${p.nd}≠${nd[p.id]}`);
  const min = Math.min(...Object.values(nd)), closest = Object.keys(nd).filter((k) => nd[k] === min);
  check(!wrong.length && closest.join() === 'neo' && C6.PLATFORMS.filter((p) => p.ok).map((p) => p.id).join() === 'neo', `расхождения с Адой по таблице 6.6: ${JSON.stringify(nd)}; ближе всех ${closest.join(', ')}` + (wrong.length ? '; не совпали: ' + wrong.join(', ') : ''));
}
// ссылки на 7.1 нет: в site/config.json у урока 7.1 нет файла
{
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/config.json'), 'utf8')), has71 = (cfg.PUBLISHED || []).some((p) => p.n === '7.1' && p.file);
  const html = fs.readFileSync(path.join(ROOT, 'site/lessons/proverka-chasti-6.html'), 'utf8');
  check(!has71 && !/href="7-1-/.test(html) && /<p class="bridge-to">Урок 7\.1 · Модели мира и Dreamer: как [^<]+<\/p>/.test(html), 'мост в часть 7: строка «Урок 7.1 · Модели мира и Dreamer: как …» без ссылки, у 7.1 в config.json файла нет');
}

/* ---------- 2. Страница в браузере: компьютер 1440 и телефон 390 в тёмной теме ---------- */
(async () => {
  const B = await launch({ w: 1440, h: 900 });
  for (const vp of [{ width: 1440, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    // все надписи на канвасах — для проверки слов о расположении
    await p.eval(`(() => { window.__c6texts = new Set(); const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, x, y, w) { window.__c6texts.add(String(t)); return f.call(this, t, x, y, w); }; return true; })()`);
    const N = await p.eval('window.__c6.Q.length'), S = N - 1, sc = '#q' + N;
    check(N === 25 && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${N}`);
    const per = JSON.parse(await p.eval('JSON.stringify(window.__c6.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))'));
    check(['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'].every((l) => per[l] >= 4) && Object.keys(per).length === 6, 'по каждому уроку 6.1–6.6 не меньше четырёх заданий: ' + JSON.stringify(per));
    const types = JSON.parse(await p.eval('JSON.stringify(window.__c6.Q.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {}))'));
    check(types.choice && types.predict && types.order >= 3 && types.scene === 1, 'типы заданий: ' + JSON.stringify(types));
    check((await p.eval('window.__c6.Q[window.__c6.Q.length - 1].t')) === 'scene', 'последнее задание — задача на сцене');
    const first = JSON.parse(await p.eval('JSON.stringify(window.__c6.Q.slice(0, 6).map((q) => q.l))'));
    check(first.join() === '6.1,6.2,6.3,6.4,6.5,6.6', 'задания идут вперемешку по урокам: ' + first.join(' '));
    check((await p.eval('document.getElementById("chkCount").textContent')) === '24 вопроса и задача на сцене', 'в шапке: ' + (await p.eval('document.getElementById("chkCount").textContent')));
    if (vp.t === 'desk') {
      const Q = JSON.parse(await p.eval('JSON.stringify(window.__c6.Q)'));
      const miss = Q.filter((q) => h2Of(q.l, q.sec) !== q.st).map((q) => `${q.l} #${q.sec} «${q.st}» ≠ «${h2Of(q.l, q.sec)}» (${q.q.slice(0, 40)}…)`);
      check(!miss.length, 'разделы для повторения есть в уроках, st совпадает с h2 дословно' + (miss.length ? ': ' + miss.join('; ') : ''));
      const digits = Q.flatMap((q) => (q.o || q.items || []).filter((s) => /\d/.test(s)).map((s) => `${q.l}: ${s.slice(0, 50)}`));
      check(!digits.length, 'в вариантах ответов и пунктах порядка нет чисел' + (digits.length ? ': ' + digits.join('; ') : ''));
      const short = Q.filter((q) => !q.e || q.e.length < 120 || !/[.»]$/.test(q.e) || q.e.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length < 2).map((q) => q.q.slice(0, 40));
      check(!short.length, 'у каждого задания есть разбор из нескольких полных предложений' + (short.length ? ': ' + short.join('; ') : ''));
      const lonely = Q.filter((q) => q.t === 'choice' || q.t === 'predict').filter((q) => q.o.length !== 3 || q.a < 0 || q.a >= q.o.length).map((q) => q.q.slice(0, 40));
      check(!lonely.length, 'у вопросов с выбором по три варианта и верный среди них' + (lonely.length ? ': ' + lonely.join('; ') : ''));
    }
    // первое задание с выбором — неверно, остальные — верно
    await p.eval(`(() => { const Q = window.__c6.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);

    /* --- задача на сцене через интерфейс --- */
    const row = (tid) => `${sc} .c6-log > li[data-t="${tid}"]`;
    const st = (tid) => p.eval(`(() => { const li = document.querySelector('${row(tid)}'), hn = li.querySelector('.c6-hint'); return { cls: li.className, text: li.querySelector('.c6-res').textContent, diag: !li.querySelector('.c6-diag').hidden, fix: !li.querySelector('.c6-fix').hidden, hint: hn && !hn.hidden ? hn.textContent : '' }; })()`).then((x) => x);
    const clickIn = (sel) => p.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) throw new Error('нет ' + ${JSON.stringify(sel)}); if (b.disabled) return 'disabled'; b.click(); return 'ok'; })()`);
    const diag = async (tid, lid) => { const r = await clickIn(`${row(tid)} .c6-chip[data-l="${lid}"]`); await sleep(40); return r; };
    const pick = async (tid, oid) => { const r = await clickIn(`${row(tid)} .c6-opt[data-o="${oid}"]`); await sleep(40); return r; };
    const goSel = `${sc} .c6-go .btn.primary`;
    const runShift = async () => { const n = await p.eval('window.__c6S.st.runs'); await clickIn(goSel); await p.waitFor(`window.__c6S.st.runs === ${n + 1} && !window.__c6S.st.busy`, 30000); await sleep(120); };
    const okMap = () => p.eval(`JSON.stringify(Object.fromEntries(Object.entries(window.__c6S.st.res).map(([k, v]) => [k, v.ok])))`).then(JSON.parse);
    const cvAR = await p.eval(`document.querySelector('${sc} canvas').style.aspectRatio`);
    check(cvAR === (vp.t === 'desk' ? '720 / 340' : '360 / 440'), `раскладка сцены: ${cvAR}`);
    check(await p.eval(`[...document.querySelectorAll('${sc} .c6-log > li')].every((li) => li.classList.contains('wait')) && document.querySelector('${goSel}').textContent === 'Запустить смену' && !document.querySelector('${goSel}').disabled`), 'до запуска: шесть испытаний ждут запуска, кнопка «Запустить смену» доступна');
    const sysTxt = await p.eval(`[...document.querySelectorAll('${sc} .c6-sys-v')].map((s) => s.textContent).join(' | ')`);
    check(/всегда команда 0,6 м\/с/.test(sysTxt) && /Ещё штрафы/.test(sysTxt) && /ExBody/.test(sysTxt) && /5 раз в секунду/.test(sysTxt) && /из урока 6\.1/.test(sysTxt), 'в системе Ады — первая версия: ' + sysTxt.slice(0, 120));
    // порядок на экране: условие → система → сцена → запуск → журнал
    check(await p.eval(`(() => { const w = document.querySelector('${sc} .c6-scene'), k = [...w.children].map((e) => e.className.split(' ')[0] || e.tagName); return k.indexOf('c6-sys') < k.indexOf('chk-cv') && k.indexOf('chk-cv') < k.indexOf('chk-row') && k.indexOf('chk-row') < k.indexOf('c6-log'); })()`), 'до запуска на экране: условие, система Ады, сцена, запуск, журнал');
    const shotCard = async (name) => { await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`); await p.shotEl(out(name), sc, vp.t === 'desk' ? 6 : 4); await p.eval(`document.querySelector('.topbar').style.visibility = ''; true`); };
    await shotCard(vp.t === 'desk' ? 'c6-scene-start.png' : 'c6-phone-scene-start.png');
    await runShift();
    let m = await okMap();
    check(Object.values(m).every((v) => v === false), 'первая смена: Ада не проходит ни одного испытания');
    check((await p.eval(`document.querySelector('${sc} .readout').textContent`)).startsWith('Смена 1: Ада не прошла ни одного испытания из шести.'), 'итог смены в строке под сценой');
    check(await p.eval(`(() => { const w = document.querySelector('${sc} .c6-scene'), k = [...w.children].map((e) => e.className.split(' ')[0]); return k.indexOf('c6-log') < k.indexOf('chk-row'); })()`) && (await p.eval(`document.querySelector('${goSel}').disabled`)) && (await p.eval(`document.querySelector('${goSel}').textContent`)) === 'Запустить смену заново', 'после смены кнопка запуска стоит за журналом и ждёт замен');
    const sym = { lead: /14,8 см при допуске 5 см/, hall: /только 0,71 м\/с/, tea: /на 1,2 с, чай пролился, а на 8,4 с Ада упала/, guests: /ходит как робот/, box: /плечу нужно 12,1 Н·м, а привод 5013 даёт 9,7/, wifi: /Ада упала: план всего тела приходил из облака/ };
    const symBad = [];
    for (const [tid, rx] of Object.entries(sym)) { const s = await st(tid); if (!/\bno\b/.test(s.cls) || !rx.test(s.text) || !s.diag || s.fix) symBad.push(`${tid}: ${s.text.slice(0, 70)}`); }
    check(!symBad.length, 'журнал называет признаки отказа, у каждого проваленного испытания — выбор решения' + (symBad.length ? ': ' + symBad.join('; ') : ''));
    // сцена: нажатие на испытание на шкале смены
    await p.eval(`(() => { const cv = document.querySelector('${sc} canvas'), S = window.__c6S.st, h = S.hit.find((x) => x.id === 'tea'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + h.x / S.lw * r.width, clientY: r.top + h.y / S.lh * r.height, bubbles: true })); return true; })()`);
    await sleep(100);
    check((await p.eval('window.__c6S.st.sel')) === 'tea' && /\bcur\b/.test((await st('tea')).cls), 'нажатие на шкале смены выбирает испытание на сцене и в журнале');
    await p.eval('window.__c6S.seek(1.3); true'); await sleep(200);
    await shotCard(vp.t === 'desk' ? 'c6-scene-run.png' : 'c6-phone-scene-run.png');
    // коридор: сначала неверный диагноз, потом верный, замена-ловушка и лучшая
    await diag('hall', 'hw'); let s = await st('hall');
    check(/Не это решение/.test(s.hint) && s.diag && !s.fix && (await p.eval(`document.querySelector('${row('hall')} .c6-chip[data-l="hw"]').disabled`)), 'неверный диагноз: подсказка, выбор остаётся, ошибочный вариант выключен');
    await diag('hall', 'walk'); s = await st('hall');
    check(!s.diag && s.fix && (await p.eval(`document.querySelectorAll('${row('hall')} .c6-opt').length`)) === 4 && (await p.eval(`document.querySelector('${row('hall')} .c6-opt[data-o="fixed"]').getAttribute('aria-pressed')`)) === 'true', 'верный диагноз открывает замены решения 6.1, нынешнее отмечено');
    await pick('hall', 'fwd');
    check((await p.eval(`document.querySelector('${sc} .c6-sys-row[data-l="walk"] .c6-sys-tag').textContent`)) === 'заменено' && /\bstale\b/.test((await st('hall')).cls) && !(await p.eval(`document.querySelector('${goSel}').disabled`)), 'замена отмечена в системе Ады и в журнале, запуск снова доступен');
    await runShift(); s = await st('hall');
    check(/\bno\b/.test(s.cls) && /ложится на пол/.test(s.text) && s.fix && !s.diag, 'награда только за скорость: Ада ложится и ползёт, замены открыты сразу: ' + s.text.slice(0, 80));
    await pick('hall', 'full512'); await runShift(); s = await st('hall');
    check(/\bok\b/.test(s.cls) && /0,30 м\/с, а после звонка 0,88 м\/с/.test(s.text) && (await p.eval(`!!document.querySelector('${row('hall')} .c6-res a[href="6-1-lokomotsiya.html#command"]')`)), 'случайные команды: 0,30 и 0,88 м/с, ссылка на раздел урока 6.1');
    // хозяин: трекер с фазой — ловушка, генералист — решение
    await diag('lead', 'body'); await pick('lead', 'perRec'); await runShift(); s = await st('lead');
    check(/\bno\b/.test(s.cls) && /стоит на месте/.test(s.text), 'трекер с фазой на каждую запись: Ада стоит на месте');
    await pick('lead', 'gen'); await runShift(); s = await st('lead');
    check(/\bok\b/.test(s.cls) && /3,6 см/.test(s.text), 'генералист с маской команд: ' + s.text.slice(0, 70));
    // кухня: модель чаще — ловушка, контроллер тела — решение
    await diag('tea', 'walk'); s = await st('tea');
    check(/Кто ведёт ноги Ады/.test(s.hint), 'подсказка к кухне: кто ведёт ноги');
    await diag('tea', 'levels'); await pick('tea', 'direct25'); await runShift(); s = await st('tea');
    check(/\bno\b/.test(s.cls) && /на 8,1 с, но чай уже пролит/.test(s.text), 'модель на 25 Гц: Ада не падает, но чай пролит');
    await pick('tea', 'wbc'); await runShift(); s = await st('tea');
    check(/\bok\b/.test(s.cls) && /через 7,0 с чашка на полке/.test(s.text), 'контроллер тела под моделью: чашка на полке через 7,0 с');
    // гости: трекер одной записи и трекер по среднему — ловушки, AMP — решение
    await diag('guests', 'walk'); await diag('guests', 'style'); await pick('guests', 'track'); await runShift(); s = await st('guests');
    check(/\bno\b/.test(s.cls) && /идёт 0,92 м\/с/.test(s.text), 'трекер с фазой отстаёт от гостей: 0,92 м/с');
    await pick('guests', 'mean'); await runShift(); s = await st('guests');
    check(/\bno\b/.test(s.cls) && /награда за имитацию у неё только 0,47/.test(s.text), 'трекер по среднему двух записей: поза далека от записи');
    await pick('guests', 'amp'); await runShift(); s = await st('guests');
    check(/\bok\b/.test(s.cls) && /1,12 Гц/.test(s.text) && /1,03 м\/с/.test(s.text), 'AMP подстраивает шаг под гостей: 1,12 Гц и 1,03 м/с');
    // железо: Thor с малой батареей, с большой батареей, облако и, наконец, батарея как у H1
    await diag('box', 'hw'); await pick('box', 'thorG1'); await runShift(); m = await okMap(); s = await st('box');
    check(!m.box && m.wifi && /батарея села через 1,6 ч из двух/.test(s.text), 'Thor и малая батарея: Wi-Fi не страшен, но батарея садится на 1,6 ч');
    await pick('box', 'thorF3'); await runShift(); m = await okMap(); s = await st('box');
    check(!m.box && m.wifi && /17,7 кг/.test(s.text) && /78,8 Н·м/.test(s.text) && /81,7 Н·м при 81,1/.test(s.text), 'большая батарея: колену не хватает ни одного привода');
    await pick('box', 'cloud'); await runShift(); m = await okMap(); s = await st('box');
    const w1 = await st('wifi');
    check(m.box && !m.wifi && /33,2 кг/.test(s.text) && /встала с коробкой в руках/.test(w1.text) && w1.diag, 'облако: коробка и смена в порядке, а без сети Ада встаёт и ждёт');
    await diag('wifi', 'levels'); await diag('wifi', 'hw'); await pick('wifi', 'thorH1'); await runShift(); m = await okMap(); s = await st('box');
    check(Object.values(m).every(Boolean) && /36,5 кг/.test(s.text) && /3,2 ч/.test(s.text), 'Thor и батарея как у H1: все шесть испытаний пройдены');
    check((await p.eval(`document.querySelector('${sc} .readout').textContent`)).includes('Ада прошла все шесть испытаний') && !(await p.eval(`document.querySelector('${sc} .c6-final').hidden`)) && (await p.eval(`document.querySelector('${goSel}').disabled`)), 'после всех испытаний — последний шаг с платформами урока 6.6');
    // текст на канвасе помещается: строки состояния по всем испытаниям
    const overs = [];
    for (const tr of C6.TRIALS) { await p.eval(`window.__c6S.select('${tr.id}'); window.__c6S.seek(2); true`); const o = await p.eval('window.__c6S.st.over'); if (o > 0.5) overs.push(`${tr.id} ${o.toFixed(1)}`); }
    check(!overs.length, 'заголовок испытания и строки состояния помещаются в ширину канваса' + (overs.length ? ': ' + overs.join(', ') : ''));
    await p.eval(`window.__c6S.select('box'); window.__c6S.seek(5.0); true`); await sleep(150);
    // платформа: сначала Figure, потом NEO
    await clickIn(`${sc} .c6-final .c6-chip[data-p="figure"]`); await sleep(60);
    check(/четырёх колонках из двенадцати/.test(await p.eval(`document.querySelector('${sc} .c6-final .c6-hint').textContent`)) && (await p.eval(`window.__c6.res[${S}]`)) === null, 'Figure: разбор по таблице урока 6.6, задача ещё не решена');
    await clickIn(`${sc} .c6-final .c6-chip[data-p="neo"]`); await sleep(120);
    check((await p.eval(`window.__c6.res[${S}]`)) === true && /одной колонке из двенадцати/.test(await p.eval(`document.querySelector('${sc} .c6-final .c6-hint').textContent`)), 'NEO: задача решена, Ада расходится с NEO в одной колонке');
    check(await p.eval(`(() => { const w = document.querySelector('${sc} .c6-scene'); return document.querySelector('${sc} .g-restart').hidden && [...w.querySelectorAll('button')].every((b) => b.disabled || b.classList.contains('c6-name')); })()`), 'после решения всё, кроме просмотра испытаний, выключено');
    const exp = await p.eval(`document.querySelector('${sc} .chk-exp').textContent`);
    check(/Раздел «Что из этого уже есть у Ады» урока 6\.6/.test(exp) && /NEO/.test(exp), 'разбор задачи ссылается на раздел урока 6.6 «Что из этого уже есть у Ады»');
    await shotCard(vp.t === 'desk' ? 'c6-scene-fixed.png' : 'c6-phone-scene-fixed.png');
    // итог проверки
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\. Часть 6 усвоена`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    check((await p.eval('document.querySelectorAll("#chkTable .chk-tr").length')) === 6, 'в таблице итога шесть уроков');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-6'] && pr['proverka-chasti-6'].f, 'проверка отмечена пройденной в прогрессе');
    check(await p.eval(`(() => { const b = document.querySelector('#result .bridge-note'); return !!b && !b.querySelector('a') && /^Урок 7\\.1 · Модели мира и Dreamer: как /.test(b.querySelector('.bridge-to').textContent) && !!document.querySelector('#result a[href="../index.html#program"]'); })()`), 'в конце — мост в урок 7.1 без ссылки и ссылка «Программа курса и даты выхода»');
    // вёрстка
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(await p.eval(`(() => { const card = document.querySelector('${sc}').getBoundingClientRect(); return [...document.querySelectorAll('${sc} canvas, ${sc} .c6-sys, ${sc} .c6-log > li, ${sc} .c6-opt, ${sc} .c6-chips, ${sc} .c6-final')].every((e) => e.getBoundingClientRect().right <= card.right + 0.5); })()`), 'сцена, система, журнал и варианты замены не шире карточки');
    // слова о расположении: в тексте страницы и на канвасах только «верхний/нижний уровень» и «верхняя часть тела»
    const words = await p.eval(`(() => { const txt = document.querySelector('main').innerText + ' ' + [...window.__c6texts].join(' '), bad = [];
      for (const m of txt.matchAll(/(^|[^а-яё])(слева|справа|сверху|снизу|вверху|внизу|наверху|налево|направо)(?=[^а-яё]|$)/gi)) bad.push(m[2]);
      for (const m of txt.matchAll(/(^|[^а-яё])((верхн|нижн)[а-яё]*)((?:[\\s,]+[а-яё]+){1,3})/gi)) if (!/уров|част/i.test(m[4])) bad.push(m[2] + m[4]);
      for (const m of txt.matchAll(/(^|[^а-яё])(вывод[а-яё]*)/gi)) bad.push(m[2]);
      return bad; })()`);
    check(!words.length, 'нет слов о расположении и «вывода» вместо «инференса»' + (words.length ? ': ' + words.slice(0, 6).join('; ') : ''));
    // тёмная тема: на телефоне — по настройке системы, на компьютере — кнопкой
    if (vp.t === 'phone') check((await p.eval('document.documentElement.dataset.theme')) === 'dark', 'на телефоне тёмная тема по настройке системы');
    else {
      const bg0 = await p.eval(`getComputedStyle(document.querySelector('${sc}')).backgroundColor`);
      await p.eval('document.getElementById("themeBtn").click(); true'); await sleep(250);
      const bg1 = await p.eval(`getComputedStyle(document.querySelector('${sc}')).backgroundColor`);
      check((await p.eval('document.documentElement.dataset.theme')) === 'dark' && bg1 !== bg0, `кнопка темы включает тёмную тему: фон карточки ${bg0} → ${bg1}`);
      await p.eval(`window.__c6S.select('tea'); window.__c6S.seek(1.3); true`); await sleep(150);
      await p.shotEl(out('c6-scene-dark.png'), sc + ' canvas', 6);
      await p.eval('document.getElementById("themeBtn").click(); localStorage.removeItem("mr-theme"); true'); await sleep(200);   // выбор темы не переносится на телефон
    }
    if (vp.t === 'desk') { await p.shotEl(out('c6-choice.png'), '#q1', 6); await p.shotEl(out('c6-order.png'), '#q' + (1 + (await p.eval('window.__c6.Q.findIndex((q) => q.t === "order")'))), 6); await p.shotEl(out('c6-result.png'), '#result .prose', 6); }
    else await p.shotEl(out('c6-phone-q1.png'), '#q1', 4);
    // «Пройти ещё раз» и пропуск задачи
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')) && (await p.eval(`[...document.querySelectorAll('${sc} .c6-log > li')].every((li) => li.classList.contains('wait'))`)), '«Пройти ещё раз» очищает ответы и смену');
    await p.eval(`document.querySelector('${sc} .g-restart').click(); true`); await sleep(200);
    check((await p.eval(`window.__c6.res[${S}]`)) === false && (await p.eval(`document.querySelector('${sc} .g-restart').hidden`)) && /батарея как у H1/.test(await p.eval(`document.querySelector('${sc} .chk-right').textContent`)) && /NEO/.test(await p.eval(`document.querySelector('${sc} .chk-right').textContent`)), 'задачу можно пропустить: засчитана как неверная, показано решение');
    if (vp.t === 'desk') await shotCard('c6-scene-skip.png');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
