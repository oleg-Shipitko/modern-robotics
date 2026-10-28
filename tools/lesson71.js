// Урок 7.1 «World Models и Dreamer»: записи Ады без провалов и у края пустые, модель мира учится на странице так же, как
// в Node (те же числа бит в бит), лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс (ставка,
// путь кисти, кнопка, критерии), числа в разборах совпадают с движком, мост из 6.6 подхвачен, мост в 7.2 стоит без ссылки,
// фото A1 со свободной лицензией, схемы движутся и их подписи не мельче 10 px и помещаются в блоки на ширинах 1440, 1024,
// 768, 720, 640, 390 и 360, диаграммы построены, квиз, глоссарий и KaTeX на месте, консоль чиста, тёмная тема, телефон 390.
// Снимки — shots/l71-*.png. Урок собирается на дату, когда опубликована часть 6: MR_ASOF=2026-11-07 python3 lessons/build.py l71.
// node tools/lesson71.js          — проверка в headless Chrome;
// node tools/lesson71.js --check  — движок, записи, лаборатории и тексты без браузера (около минуты).
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const ROOT = path.resolve(__dirname, '..');
const LESSON = path.join(ROOT, 'lessons/l71/lesson.html');
const SRC = fs.readFileSync(LESSON, 'utf8');
const plain = () => sp(SRC).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const E = require('../lessons/l71/engine.js');
// слова о расположении на экране: в подписях говорим о ролях; «вид на стол сверху» — направление взгляда камеры, его оставляем
const POS0 = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const noView = (s) => String(s).replace(/вид(?:е)? (?:на стол |на трассу )?сверху/gi, 'вид').replace(/(верхн|нижн)[а-яё]+ уров[а-яё]+/gi, 'уровень');
const POS = { test: (s) => POS0.test(noView(s)) };
const posWord = (s) => { const m = noView(s).match(POS0); return m ? m[2] : ''; };
// «сон» и его производные в собственном тексте курса не используем (решение автора 28.10.2026)
const SLEEP = /(^|[^а-яё])(сон|сна|сну|сном|сне|сны|снов|снам|снами|снах|сновидени[а-яё]*|снит[а-яё]*|сонн[а-яё]*|спит|спят|спящ[а-яё]*|усн[а-яё]+|засып[а-яё]*|засн[а-яё]+|выспа[а-яё]*)(?![а-яё])/i;

/* ---------- лаборатории в Node: те же настройки, что на странице (l71/ui-l71.js) ---------- */
const SEED = 2, NREC = 60, CUP0 = [0.30, 0.34], T = 40, START = [0.2, 0, 0.02];
const DEF_PATH = [[0.19, 0.34], [0.46, 0.34]], FAST_PATH = [[0.19, 0.34], [0.50, 0.34]];
function actsOf(path, v) {
  const step = v * E.DT, pos = [path[0].slice()]; let cur = path[0].slice(), i = 1, rem = step;
  while (i < path.length && pos.length <= T) { const dx = path[i][0] - cur[0], dy = path[i][1] - cur[1], d = Math.hypot(dx, dy); if (d >= rem) { cur = [cur[0] + dx / d * rem, cur[1] + dy / d * rem]; pos.push(cur.slice()); rem = step; } else { rem -= d; cur = path[i].slice(); i++; } }
  const acts = []; for (let t = 0; t < T; t++) acts.push(t + 1 < pos.length ? [pos[t + 1][0] - pos[t][0], pos[t + 1][1] - pos[t][1]] : [0, 0]);
  return { acts, hand0: pos[0] };
}
function push(ens, path, v) {
  const { acts, hand0 } = actsOf(path, v), s0 = [CUP0[0], CUP0[1], 0, 0, 1, hand0[0], hand0[1]];
  const re = E.realOpen(s0, acts, { layout: 'base' }), im = E.imagineOpen(ens, s0, acts, 'base'), err = [], spread = [];
  for (let t = 0; t <= T; t++) { err.push(Math.hypot(im.mean[t * 2] - re.path[t * 4], im.mean[t * 2 + 1] - re.path[t * 4 + 1]) * 100); spread.push(im.spread[t] * 100); }
  return { err, spread, first3: err.findIndex((e) => e > 3), e10: err[10], s10: spread[10], tip: re.tip, fall: re.fall, impact: re.maxImpact };
}
const models = {};
function model(n) {
  if (models[n]) return models[n];
  const ens = E.ensemble({ k: 5, seed: SEED }); E.finish(E.trainEnsemble(ens, E.records({ n, seed: SEED }).trans, {}));
  const test = E.records({ n: 10, seed: SEED, from: 5000 }), buf = []; let s = 0; const acc = [];
  for (const x of test.trans) { E.predictAll(ens, x.s, x.a, buf); let mx = 0, my = 0; for (const q of buf) { mx += q[0] / ens.k; my += q[1] / ens.k; } s += Math.hypot(mx - x.s1[0], my - x.s1[1]); }
  for (let e = 0; e < 10; e++) for (let t0 = 0; t0 + 20 <= 60; t0 += 5) { const xs = test.trans.slice(e * 60 + t0, e * 60 + t0 + 20), im = E.imagineOpen(ens, xs[0].s, xs.map((x) => x.a), 'base'), real = xs[19].s1; acc.push(Math.hypot(im.mean[40] - real[0], im.mean[41] - real[1]) * 100); }
  acc.sort((a, b) => a - b);
  ens.oneStep = s / test.trans.length * 1000; ens.held = acc[acc.length >> 1];
  return (models[n] = ens);
}
const EVAL = E.starts(50, 5), ARS_STARTS = E.starts(8, 11);
const ars = (ens, th0, tau, lam) => E.finish(E.arsImag(ens, { theta0: th0, seed: SEED, tau, lambda: lam, starts: ARS_STARTS, iters: 16 })).theta;
function evaluate(ens, th, tau) {
  let ex = 0; const im = EVAL.map((s, i) => E.imagineCtl(ens, th, s, 'base', { seed: 9 * 31 + i, tau })); for (const r of im) ex += r.reached ? r.alive : 0;
  const re = EVAL.map((s) => E.runReal(th, { seed: s.seed, cup: s.cup, hand: s.hand }));
  return { imagPct: Math.round(ex / 50 * 100), realPct: Math.round(re.filter((r) => r.ok).length / 50 * 100), tips: re.filter((r) => r.tip || r.fall).length };
}
function retrain(data) { const ens = E.ensemble({ k: 5, seed: SEED }); E.finish(E.trainEnsemble(ens, data, {})); return ens; }
/** Ночи лаборатории 2: первая ночь, ночь «по политике», ночь «по записям», штраф 8 без настоящих попыток. */
function lab2() {
  const ens0 = model(NREC), base = E.records({ n: NREC, seed: SEED }).trans;
  const th0 = ars(ens0, START, 1, 0), r0 = Object.assign({ theta: th0 }, evaluate(ens0, th0, 1));
  const c = E.collectPolicy(th0, 10, 302), dP = base.concat(c.trans), eP = retrain(dP), thP = ars(eP, th0, 1, 0), rP = Object.assign({ theta: thP, fails: c.trans.filter((x) => x.fail).length, size: dP.length }, evaluate(eP, thP, 1));
  const rec = E.records({ n: 10, seed: SEED, from: 1200 }).trans, dR = base.concat(rec), eR = retrain(dR), thR = ars(eR, th0, 1, 0), rR = Object.assign({ theta: thR, size: dR.length }, evaluate(eR, thR, 1));
  const thL = ars(ens0, START, 1, 8), rL = Object.assign({ theta: thL }, evaluate(ens0, thL, 1));
  return { r0, rP, rR, rL };
}

/** Проверки движка, записей, лабораторий и текстов без браузера. */
function dataChecks() {
  const txt = plain();
  // записи дня
  const rec = E.records({ n: NREC, seed: SEED });
  const vmax = Math.max(...rec.trans.map(E.speedOf)), fails = rec.trans.filter((x) => x.fail).length;
  let dEdge = 1; for (const x of rec.trans) dEdge = Math.min(dEdge, x.s1[0], x.s1[1], E.TABLE.W - x.s1[0], E.TABLE.H - x.s1[1]);
  check(rec.trans.length === 3600 && fails === 0 && vmax <= E.V_REC + 1e-9 && Math.abs(E.V_REC - 0.33) < 1e-12 && Math.abs(E.V_TIP - 0.36) < 1e-12, `записи дня: ${rec.trans.length} переходов, провалов ${fails}, кисть не быстрее ${fr(vmax, 3)} м/с (в тексте 0,33), порог опрокидывания 0,36 м/с`);
  check(dEdge >= 0.0695 && txt.includes('не подводил чашку к краю стола ближе 7 см') && txt.includes('не подходит ближе 7 см'), `в записях чашка не ближе ${fr(dEdge * 100, 1)} см к краю стола (в тексте — не ближе 7 см)`);
  const cov = E.coverage(rec.trans); let edgeCells = 0; for (let i = 0; i < cov.nx; i++) edgeCells += cov.g[i] + cov.g[(cov.ny - 1) * cov.nx + i]; for (let j = 0; j < cov.ny; j++) edgeCells += cov.g[j * cov.nx] + cov.g[j * cov.nx + cov.nx - 1];
  check(edgeCells === 0, 'карта покрытия: в крайних клетках стола записей нет');
  const net = E.ensemble({ k: 1, seed: 1 }).nets[0];
  check(E.nParams(net) === 1740 && txt.includes('всего 1740 параметров'), `сеть ансамбля: ${E.nParams(net)} параметров, как в «Под капотом»`);
  check(['60 записей по 60 шагов', 'не быстрее 0,33 м/с', 'не ближе 10 см к краю', 'быстрее 0,36 м/с', '16 итераций, на каждой 6 случайных направлений', 'каждый вариант проходит 8 попыток', 'на одних и тех же 50 положениях', '1800 шагами Adam'].every((x) => txt.includes(x)), 'тексты лабораторий называют те же настройки, что движок и страница');
  // лаборатория 1
  const e60 = model(60), e120 = model(120);
  const p0 = push(e60, DEF_PATH, 0.2), pf = push(e60, FAST_PATH, 0.6), pf120 = push(e120, FAST_PATH, 0.6);
  check(!(p0.first3 > 0 && p0.first3 <= 10) && p0.e10 < 1, `осторожный толчок через середину (0,2 м/с): к 10-му шагу расхождение ${fr(p0.e10, 2)} см, 3 см не превышено раньше 10-го`);
  check(pf.tip > 0 && pf.tip <= 3 && pf.first3 > 0 && pf.first3 <= 10, `быстрый толчок 0,6 м/с: чашка опрокинулась на ${pf.tip}-м шаге, 3 см — на ${pf.first3}-м`);
  check(pf120.first3 > 0 && pf120.first3 <= 10 && e120.oneStep < e60.oneStep && e120.held < e60.held, `120 записей: на быстром толчке 3 см на ${pf120.first3}-м шаге, ошибка шага ${fr(e60.oneStep, 2)} → ${fr(e120.oneStep, 2)} мм, медиана через 20 шагов ${fr(e60.held, 1)} → ${fr(e120.held, 1)} см`);
  check(e60.oneStep < 1 && txt.includes('меньше чем на миллиметр'), `ошибка модели на одном шаге ${fr(e60.oneStep, 2)} мм — «меньше чем на миллиметр»`);
  check(pf.s10 > 2 && pf.spread[5] < pf.err[5] / 4, `быстрый толчок: разброс сетей к 10-му шагу ${fr(pf.s10, 1)} см (больше 2), а на 5-м шаге ${fr(pf.spread[5], 1)} см при расхождении ${fr(pf.err[5], 1)} см`);
  const edge = push(e60, [[0.30, 0.22], [0.30, 0.66]], 0.3);
  check(edge.fall > 0 && edge.s10 < 2, `толчок к ближнему краю: чашка упала на ${edge.fall}-м шаге, а сети к 10-му шагу расходятся всего на ${fr(edge.s10, 1)} см`);
  // лаборатория 2
  const L = lab2();
  check(L.r0.imagPct >= 90 && L.r0.realPct <= 10 && L.r0.theta[0] > E.V_TIP && L.r0.tips >= 45, `первая ночь: толчок ${fr(L.r0.theta[0], 2)} м/с, в воображении ${L.r0.imagPct}%, на столе ${L.r0.realPct}%, опрокинулись ${L.r0.tips}`);
  check(L.rP.fails === 10 && L.rP.realPct >= 90 && L.rP.theta[0] < E.V_TIP, `ночь «туда, куда ходит политика»: провалов в данных ${L.rP.fails}, толчок ${fr(L.rP.theta[0], 2)} м/с, воображение ${L.rP.imagPct}%, стол ${L.rP.realPct}%`);
  check(L.rR.realPct <= 10 && L.rR.theta[0] > E.V_TIP, `ночь «туда, где записей больше всего»: толчок ${fr(L.rR.theta[0], 2)} м/с, стол ${L.rR.realPct}%`);
  check(L.rL.realPct >= 80 && L.rL.theta[0] < E.V_TIP, `свободный режим, штраф 8 без настоящих попыток: толчок ${fr(L.rL.theta[0], 2)} м/с, стол ${L.rL.realPct}%`);
  // тексты урока
  check(!SLEEP.test(txt), 'слова «сон» и его производных в тексте нет' + (SLEEP.test(txt) ? ': ' + txt.match(SLEEP)[2] : ''));
  const YAV = /(^|[^а-яё])яв(ь|и|ью)(?![а-яё])/i, uiSrc = fs.readFileSync(path.join(ROOT, 'lessons/l71/ui-l71.js'), 'utf8');
  check(!YAV.test(txt) && !YAV.test(uiSrc), 'слова «явь» (пары ко «сну») нет ни в тексте урока, ни в лабораториях и схемах');
  check((txt.match(/dream/gi) || []).filter((x) => x === 'dream').length === 1 && txt.includes('называют такое обучение словом dream'), 'английское dream — один раз, как название у авторов');
  check(!/(^|[^а-яё])(ядро|углублени[ея])([^а-яё]|$)|⭐|➕/i.test(txt), 'в тексте нет меток «ядро», «углубление» и значков уровня урока');
  check(!/роллаут|модельное RL|галлюцинац|эмбеддинг|нейросимулятор|не просто [а-яё]+, а |это не [а-яё]+ — это/i.test(txt), 'нет слов из списка «чего не писать» части 7 и шаблонных конструкций');
  check(!/(^|[^а-яё])(учител|подзадач|стохастическ)/i.test(txt), 'нет слов, которые глоссарий подсветил бы чужим термином: «учитель», «подзадача», «стохастический»');
  const paras = [...SRC.slice(SRC.indexOf('<main>')).matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => sp(m[2]).replace(/<[^>]+>/g, ''));
  const firstLaz = paras.map((x) => /лазейк[а-яё]*(?: в [а-яё]+)?/i.exec(x)).find(Boolean);
  check(firstLaz && /в награде/.test(firstLaz[0]), 'первое слово «лазейка» в абзацах урока — о лазейке в награде урока 6.1 (на него встанет подсказка глоссария)');
  // разминка для 7.2 и вопросы проверки части 7 в INTEGRATION.md ссылаются на настоящие разделы урока
  const integ = fs.readFileSync(path.join(ROOT, 'lessons/l71/INTEGRATION.md'), 'utf8');
  const h2 = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(SRC); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
  const recall = JSON.parse(/### 3а\.[\s\S]*?```json\n([\s\S]*?)```/.exec(integ)[1]);
  const pc = [...(/### 3б\.[\s\S]*?```js\n([\s\S]*?)```/.exec(integ)[1]).matchAll(/sec: '([a-z]+)', st: '([^']+)'/g)];
  check(recall.q.length === 3 && recall.q.every((q) => h2(q.sec) === q.secTitle && q.o.length === 3) && pc.length >= 3 && pc.every((m) => h2(m[1]) === m[2]), `INTEGRATION.md: разминка для 7.2 (${recall.q.length} вопроса) и вопросы проверки части 7 (${pc.length}) ссылаются на разделы урока с их настоящими заголовками`);
  // числа диаграмм есть в подписях
  const caps = [...SRC.matchAll(/<p class="stat-cap">([\s\S]*?)<\/p>/g)].map((m) => sp(m[1]).replace(/<[^>]+>/g, ''));
  const need = [['343', '591', '652', '838', '632', '788', '906'], ['2086', '193', '2060', '196', '1145', '868', '918', '1092', '732', '753'], ['243,70', '786,32', '332,97', '823,39'], ['206', '226', '525', '705', '786'], ['5 минут', '20 минут', '10 минут', '8 часов', '10 часов', '2 часа'], ['16,0', '49,5', '57,1', '68,0', '70,6'], ['89,4', '90,1', '62,9', '66,7', '51,1', '58,1', '27,8', '39,5', '16,9', '29,0', '0,7']];
  const capMiss = need.map((list) => list.filter((x) => !caps.some((c) => c.includes(x)))).filter((m) => m.length);
  check(caps.length === 7 && !capMiss.length && caps.every((c) => /Источник/.test(c) && /\d\d\.\d\d\.\d{4}/.test(c)), `7 подписей диаграмм: все числа столбцов, источник и дата есть` + (capMiss.length ? ': нет ' + capMiss.map((m) => m.join(', ')).join('; ') : ''));
  return { txt, L, p0, pf, pf120, e60, e120 };
}

if (process.argv.includes('--check')) { dataChecks(); finish(); } else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.join(ROOT, 'site/lessons/7-1-world-models-dreamer.html');
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
/** Ставка (если bet не null), кнопка миссии и ожидание конца: критерии и разбор. */
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
/** Ничего не шире экрана и своей карточки: страница, лаборатории, диаграммы, ряд фото, таблица ночей. */
const overflow = (p) => p.eval(`JSON.stringify({ sw: document.documentElement.scrollWidth,
  lab: [...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length,
  stat: [...document.querySelectorAll('.stat-fig')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  photo: [...document.querySelectorAll('.robot-row')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  night: [...document.querySelectorAll('.night-card')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
  formula: [...document.querySelectorAll('.formula')].filter((f) => f.scrollWidth > f.clientWidth + 1).length })`).then(J);
const FRAMES = { vmc: [0.6, 1.9, 3.3, 4.6, 5.9, 7.4], rssm: [0.5, 1.7, 3.0, 4.4, 5.6, 7.2] };
(async () => {
  const D = dataChecks();
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 60000);
    await p.waitFor('window.__modelReady === true', 120000); await sleep(300);
    await p.eval('window.__noAnim = true; true');
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^5 миссий с целью$/.test(hero), 'число миссий в шапке (без свободных режимов): ' + hero);
    // разминка по 6.6: разделы и их названия — как в уроке 6.6
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l66 = fs.readFileSync(path.join(ROOT, 'lessons/l66/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l66); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.6' && rec.href === '6-6-obzor-platform.html' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.6: три вопроса, разделы и названия совпадают с h2 урока 6.6: ' + rec.q.map((q) => q.sec).join(', '));
    // начало урока подхватывает мост из 6.6 и проверки части 6
    const lead = await text(p, '.hero .lead');
    const br66 = sp(/<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(l66)[1].replace(/<[^>]+>/g, ''));
    const c6 = fs.readFileSync(path.join(ROOT, 'lessons/c6/lesson.html'), 'utf8'), brc6 = sp(/<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(c6)[1].replace(/<[^>]+>/g, ''));
    check(/^В уроке 6\.6 платформы различались опытом/.test(lead) && lead.includes('тысячами часов записей людей и работы роботов') && br66.includes('тысячами часов записей людей и работы роботов') && lead.includes('512 копиях') && brc6.includes('512 копиях') && /в воображении/.test(lead), 'начало урока подхватывает мосты из 6.6 и проверки части 6: тысячи часов записей, 512 копий, воображение модели');
    const note = await text(p, '#why .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#why .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде при первом упоминании: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ down: b.classList.contains('down'), t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, next: (b.closest('section').nextElementSibling || {}).id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href'), to: b.querySelector('.bridge-to') && b.querySelector('.bridge-to').textContent.trim() })))`));
    check(bn.length === 2 && bn[0].down && bn[0].sec === 'holes' && bn[0].next === 'rssm' && /^PlaNet и Dreamer: как /.test(bn[0].to) && !bn[1].down && bn[1].sec === 'finale' && bn[1].last && /^Урок 7\.2 · JEPA и V-JEPA 2: как /.test(bn[1].to) && !bn[1].a && /VAE в World Models рисовал кирпичную кладку/.test(bn[1].t), 'мосты: внутренний после лаборатории 2 перед разделом о PlaNet и Dreamer, в конце — в урок 7.2 без ссылки (часть 7 не вышла): ' + bn.map((b) => `${b.sec} «${b.to}» → ${b.a || 'без ссылки'}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check(!(await p.eval(`/(^|[^а-яё])(вывод(ом|а|у)?\\s+модел)/i.test(document.querySelector('main').innerText)`)), 'запуск модели не называется «выводом»');
    const mainTxt = sp(await p.eval(`document.querySelector('main').innerText`));
    check(!SLEEP.test(mainTxt), 'на странице нет слова «сон» и его производных, в том числе в лабораториях' + (SLEEP.test(mainTxt) ? ': ' + mainTxt.match(SLEEP)[2] : ''));
    check(!(await p.eval(`!!document.querySelector('.gl[data-gl="stochastic-policy"], .gl[data-gl="mode"], .gl[data-gl="expert"], .gl[data-gl="teacher"]')`)), 'ложных подсказок глоссария нет: стохастическая политика, мода, эксперт, учитель');
    check(await p.eval(`(() => { const g = document.querySelector('.gl[data-gl="reward-hacking"]'); return !!g && /в награде/.test(g.closest('p').textContent.slice(g.closest('p').textContent.indexOf(g.textContent), g.closest('p').textContent.indexOf(g.textContent) + 40)); })()`), 'подсказка «Лазейка в награде» стоит на лазейке в награде урока 6.1');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- Ада на зарядке ----------
    const night = await p.eval(`(() => { const cv = document.getElementById('nightCv'), c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 190) n++; return n; })()`);
    check(night > 500 && await p.eval(`typeof AdaBody.charging === 'function' && typeof AdaBody.front === 'function'`), 'Ада на зарядке нарисована общим рисунком AdaBody.charging (светлых пикселей корпуса: ' + night + ')');
    await show(p, 'why', '#why .night-card', 'l71-night.png');

    // ---------- фото A1 ----------
    await p.eval(`document.getElementById('robots').scrollIntoView({ behavior: 'instant' }); true`); await sleep(400);
    await p.waitFor(`[...document.querySelectorAll('.robot-row img')].every((i) => i.complete && i.naturalWidth > 0)`, 15000);
    const ph = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.robot-row figure.photo-fig')].map((f) => { const i = f.querySelector('img'), c = f.querySelector('.photo-cred'); return { src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, alt: i.alt, cred: c && c.textContent, href: c && c.getAttribute('href') }; }))`));
    check(ph.length === 3 && ph.every((x) => x.w === 560 && x.h === 560 && x.alt.length > 20 && /^Фото: P\. Wu, A\. Escontrela, D\. Hafner и соавторы, рис\. 4 · CC BY 4\.0 · кадр обрезан$/.test(x.cred) && x.href === 'https://arxiv.org/abs/2206.14176'), 'три кадра A1 из рис. 4 DayDreamer: 560 × 560, подпись «Фото: авторы, рис. 4 · CC BY 4.0 · кадр обрезан» со ссылкой на статью: ' + ph.map((x) => x.src.split('/').pop()).join(', '));
    check(ph.every((x) => fs.existsSync(path.join(ROOT, 'site', x.src.replace('../', '')))), 'файлы фото лежат в site/assets/img/robots');
    await show(p, 'robots', '#robots .robot-row', 'l71-photos.png');

    // ---------- схемы ----------
    for (const kind of ['vmc', 'rssm']) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); Anim.seek(cv, 1.0); const x = cv.toDataURL(); Anim.seek(cv, 5.1); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${kind} движется: кадры в разные моменты разные`);
      const sl = await schemeLabels(p, kind, FRAMES[kind]);
      check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.minPx >= 9.95 && sl.distinct >= FRAMES[kind].length - 1, `схема ${kind} (широкая, 1440): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках, ${sl.distinct} разных кадров` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
      check(!sl.texts.some((x) => POS.test(x)), `схема ${kind}: в подписях нет слов о расположении`);
      const st = sl.texts.join(' ');
      const want = kind === 'vmc' ? ['V: энкодер', 'M: LSTM', '867 параметров', 'кадр 64 × 64', 'V не нужна', 'декодер V рисует кадр для показа', 'воображение модели M'] : ['h: память', 'ŝ: без кадра', 's: по кадру', 'кадр o', 'кадра нет', '1 · сбор опыта', '2 · обучение модели мира', '3 · актор и критик', 'учатся в воображении, 15 шагов'];
      check(want.every((x) => st.includes(x)), `схема ${kind} называет свои блоки: ` + want.filter((x) => !st.includes(x)).join(', '));
    }
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="vmc"]'), 1.9); Anim.seek(document.querySelector('canvas[data-anim="rssm"]'), 3.0); true`);
    await show(p, 'vmc', '#vmc .flow-card', 'l71-vmc.png'); await show(p, 'rssm', '#rssm .flow-card', 'l71-rssm.png');
    // подписи и тексты по ролям
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro, .stat-cap, details.deep')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен, схем, диаграмм, фото и «Под капотом» — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map(posWord).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify([...window.__l71.DreamLab.missions, ...window.__l71.HolesLab.missions].flatMap((m) => [m.title, m.text, m.hint, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x) || SLEEP.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям, без заглушек и без слова «сон»` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    // диаграммы
    const stats = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.stat-fig')].map((f) => ({ ids: [...f.querySelectorAll('.stat-bars')].map((b) => b.id), bars: f.querySelectorAll('.sb-bar').length, legends: f.querySelectorAll('.sb-legend').length, src: /Источник/.test(f.querySelector('.stat-cap').textContent) })))`));
    check(stats.length === 7 && stats.every((s) => s.bars >= 4 && s.src) && stats.filter((s) => s.legends >= 1).length >= 2, 'семь фигур с диаграммами (StatsChart): у каждой не меньше четырёх столбцов и подпись с источником, легенды при двух рядах: ' + stats.map((s) => `${s.ids.join('+')}:${s.bars}`).join(', '));
    const tb = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#tauBars .sb-bar b')].map((b) => b.textContent))`)).map(sp);
    check(JSON.stringify(tb) === JSON.stringify(['2 086', '193', '2 060', '196', '1 145', '868', '918', '1 092', '732', '753']), 'главная диаграмма: таблица 2 Ha и Schmidhuber, воображение и игра при пяти τ: ' + tb.join(' '));
    for (const [id, sel, n] of [['vmc', '#vmc .stat-fig', 'l71-stat-car.png'], ['cheat', '#cheat .stat-fig', 'l71-stat-tau.png'], ['rssm', '#rssm .stat-fig', 'l71-stat-dreamer.png'], ['robots', '#robots .stat-fig', 'l71-stat-daydreamer.png'], ['today', '#today .stat-fig', 'l71-stat-d4.png']]) await show(p, id, sel, n);

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapDCov')) && !(await visible(p, '#wrapDData')) && await visible(p, '#dSpeed'), 'миссия 1: видны скорость кисти и сцена, карта покрытия и выбор числа записей скрыты');
    check(/Нарисуй путь кисти/.test(await p.eval(`'Нарисуй путь кисти через чашку и запусти толчок'`)) && /График появится после толчка/.test(await p.eval(`'График появится после толчка'`)), 'до толчка на сцене и графике написано, что сделать');
    await show(p, 'dream', '#dream .lab', 'l71-lab1-start.png');
    let r = await viaUI(p, '#dMis', 1);
    check(!r.ok && r.crit[0] === 'ok' && r.crit[1] === 'no' && r.out.includes(`Расхождение к 10-му шагу — ${fr(D.p0.e10, 1)} см`), `миссия 1, осторожный толчок: кисть задела чашку, но 3 см раньше 10-го шага не превышено (${fr(D.p0.e10, 1)} см), разбор просит толкнуть быстрее или к краю`);
    await p.eval(`window.__l71.Dream.setPath(${JSON.stringify(FAST_PATH)}, 0.6); true`);
    r = await viaUI(p, '#dMis', null);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`опрокинулась на ${D.pf.tip}-м шаге`) && r.out.includes(`на ${D.pf.first3}-м шаге расхождение больше 3 см`) && r.out.includes(`к 10-му — ${fr(D.pf.e10, 1)} см`), `миссия 1, толчок 0,6 м/с: засчитана, ставка сыграла, числа разбора как в Node (опрокинулась на ${D.pf.tip}-м шаге, 3 см на ${D.pf.first3}-м, ${fr(D.pf.e10, 1)} см к 10-му)`);
    const read = await text(p, '#dRead');
    check(read.includes(`к 10-му шагу на ${fr(D.pf.e10, 1)} см`) && read.includes(`ошибается на одном шаге в среднем на ${fr(D.e60.oneStep, 2)} мм`), 'строка итога под графиком называет те же числа: ' + read.slice(0, 120));
    await show(p, 'dream', '#dream .lab', 'l71-lab1-fast.png');
    await nextMission(p, '#dMis');
    r = await viaUI(p, '#dMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`${fr(D.e120.oneStep, 2)} мм вместо ${fr(D.e60.oneStep, 2)}`) && r.out.includes(`${fr(D.e120.held, 1)} см вместо ${fr(D.e60.held, 1)}`) && r.out.includes(`уже на ${D.pf120.first3}-м шаге`), `миссия 2, 120 записей: засчитана; ошибка шага ${fr(D.e60.oneStep, 2)} → ${fr(D.e120.oneStep, 2)} мм, медиана через 20 шагов ${fr(D.e60.held, 1)} → ${fr(D.e120.held, 1)} см, на быстром толчке 3 см на ${D.pf120.first3}-м шаге`);
    await nextMission(p, '#dMis');
    check(await visible(p, '#wrapDCov'), 'миссия 3: появилась карта покрытия записей');
    await p.eval(`document.getElementById('dCov').click(); window.__l71.Dream.setPath(${JSON.stringify(FAST_PATH)}, 0.6); true`); await sleep(150);
    r = await viaUI(p, '#dMis', 1);
    const s10 = await p.eval(`window.__l71.Dream.st.res.s10`), sp5 = await p.eval(`window.__l71.Dream.st.res.spread[5]`), er5 = await p.eval(`window.__l71.Dream.st.res.err[5]`);
    check(r.ok && /ставка сыграла/i.test(r.out) && s10 > 2 && r.out.includes(`разошлись на ${fr(s10, 1)} см`) && r.out.includes(`на 5-м шаге воображаемая чашка уже на ${fr(er5, 1)} см от настоящей`) && r.out.includes(`всего на ${fr(sp5, 1)} см`), `миссия 3: разброс сетей к 10-му шагу ${fr(s10, 1)} см, а на 5-м шаге при расхождении ${fr(er5, 1)} см сети расходятся на ${fr(sp5, 1)} см`);
    await show(p, 'dream', '#dream .lab', 'l71-lab1-cov.png');
    await nextMission(p, '#dMis');
    check(await visible(p, '#wrapDData') && await p.eval(`window.__l71.Dream.st.live === true`), 'свободный режим: выбор числа записей виден, толчок запускается сразу');
    await p.eval(`window.__l71.Dream.setPath([[0.30, 0.22], [0.30, 0.66]], 0.33); window.__l71.Dream.run(); true`); await sleep(400);
    const edge = J(await p.eval(`JSON.stringify({ fall: window.__l71.Dream.st.res.fall, s10: window.__l71.Dream.st.res.s10 })`));
    check(edge.fall > 0, `свободный режим: толчок к ближнему краю — настоящая чашка упала на ${edge.fall}-м шаге, разброс сетей к 10-му шагу ${fr(edge.s10, 1)} см`);
    // тот же толчок в Node и в браузере даёт те же числа
    const same = J(await p.eval(`JSON.stringify(window.__l71.Dream.compute(window.__l71.Models.cache[60], ${JSON.stringify(FAST_PATH)}, 0.6).err)`));
    check(same.length === D.pf.err.length && same.every((v, i) => v === D.pf.err[i]), 'лаборатория 1: расхождения по шагам в Chrome и в Node совпадают бит в бит');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapHWhere')) && !(await visible(p, '#wrapHTau')) && !(await visible(p, '#wrapHLam')) && !(await visible(p, '#hBack')), 'миссия 1: выбор опыта, температура, штраф и возврат скрыты');
    r = await viaUI(p, '#hMis', 2);
    const L = D.L;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`удаются ${L.r0.imagPct}% попыток, на настоящем столе — ${L.r0.realPct}%`) && r.out.includes(`до ${fr(L.r0.theta[0], 2)} м/с`) && r.out.includes(`опрокинулись ${L.r0.tips}`), `миссия 1: воображение ${L.r0.imagPct}%, стол ${L.r0.realPct}%, толчок ${fr(L.r0.theta[0], 2)} м/с, опрокинулись ${L.r0.tips} — как в Node`);
    check((await text(p, '#hImagPct')) === `${L.r0.imagPct}%` && (await text(p, '#hRealPct')) === `${L.r0.realPct}%` && (await p.eval(`document.querySelectorAll('#hRealDots button.fail').length`)) === L.r0.tips, 'над сценами те же проценты, красных кружков на столе столько же, сколько опрокинулось');
    const th0 = J(await p.eval(`JSON.stringify(window.__l71.Holes.st.theta)`));
    check(th0.every((v, i) => v === L.r0.theta[i]), 'поиск в воображении в Chrome и в Node нашёл те же числа политики бит в бит');
    await show(p, 'holes', '#holes .lab', 'l71-lab2-m1.png');
    await nextMission(p, '#hMis');
    check(await visible(p, '#wrapHWhere') && await visible(p, '#hBack'), 'миссия 2: появились выбор, куда отправить Аду, и возврат к первому утру');
    await p.eval(`document.querySelector('#hWhere button[data-v="records"]').click(); true`);
    r = await viaUI(p, '#hMis', 1);
    check(!r.ok && r.crit[0] === 'no' && r.out.includes(`На столе по-прежнему ${L.rR.realPct}%`) && r.out.includes(`толкает ${fr(L.rR.theta[0], 2)} м/с`), `миссия 2, 10 осторожных записей: не засчитана, на столе ${L.rR.realPct}%, толчок ${fr(L.rR.theta[0], 2)} м/с`);
    await p.eval(`document.getElementById('hBack').click(); document.querySelector('#hWhere button[data-v="policy"]').click(); true`); await sleep(100);
    r = await viaUI(p, '#hMis', null);
    check(r.ok && r.out.includes(`сбавила толчок до ${fr(L.rP.theta[0], 2)} м/с`) && r.out.includes(`${L.rP.imagPct}% и ${L.rP.realPct}%`) && r.out.includes(`Провалом закончились ${L.rP.fails}`) && r.out.includes('иллюстрация'), `миссия 2, 10 попыток там, куда ходит политика: засчитана, провалов ${L.rP.fails}, толчок ${fr(L.rP.theta[0], 2)} м/с, воображение ${L.rP.imagPct}%, стол ${L.rP.realPct}%, сравнение с 5.3 названо иллюстрацией`);
    const nights = await text(p, '#hNights');
    check(nights.includes('записи дня') && nights.includes('туда, куда ходит политика') && nights.includes(`провалов ${L.rP.fails}`), 'таблица ночей: первая ночь и ночь по политике с числом провалов');
    await show(p, 'holes', '#holes .lab', 'l71-lab2-m2.png');
    await nextMission(p, '#hMis');
    check(await visible(p, '#wrapHTau') && await visible(p, '#wrapHLam'), 'свободный режим: видны температура модели и штраф за разброс');
    await p.eval(`document.getElementById('hBack').click(); document.querySelector('#hLam button[data-v="8"]').click(); true`); await sleep(100);
    r = await viaUI(p, '#hMis', null);
    check(r.ok && r.out.includes(`толчок ${fr(L.rL.theta[0], 2)} м/с`) && r.out.includes(`на столе ${L.rL.realPct}% без единой настоящей попытки`), `свободный режим, штраф 8: толчок ${fr(L.rL.theta[0], 2)} м/с, стол ${L.rL.realPct}% без настоящих попыток`);
    await p.eval(`document.querySelector('#hRealDots button').click(); true`);
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий карточки лабораторий не вылезают за свою колонку: ' + wideD);

    // ---------- итоги, квиз, глоссарий, ссылки, консоль ----------
    const fin = await text(p, '#finale .takeaways');
    check(['Безмодельные методы', 'Модель мира', 'V сжимает кадр', 'накапливается с горизонтом', 'лазейки в модели', 'RSSM', 'латентное состояние', 'λ-отдачу', 'DayDreamer', 'MuZero и TD-MPC2', 'Dreamer 4'].every((x) => fin.includes(x)), 'итоги урока называют выводы разделов и лабораторий');
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l71.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /(^|[\s(«,:])\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел (цифры только в названиях вроде TD-MPC2)');
    const answers = J(await p.eval(`JSON.stringify(window.__l71.QUIZ.map((q) => q.a))`));
    check(new Set(answers).size === 3, 'квиз: верные ответы стоят на всех трёх местах в данных: ' + answers.join(''));
    const gl = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.gl')].map((e) => e.dataset.gl))`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0 && ['world-model', 'ensemble', 'kalman', 'mpc', 'actor-critic', 'replay-buffer', 'random-search', 'compounding'].every((x) => gl.includes(x)), `подсказки глоссария строчные (${gl.length}), среди них модель мира, ансамбль, фильтр Калмана, MPC, актор-критик, буфер воспроизведения, поиск по популяции, накопление ошибки`);
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы KaTeX отрисованы, ошибок нет: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    const links = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('http') && !h.startsWith('#')))`));
    check(links.every((h) => /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h)) && links.includes('0-1-dve-paradigmy.html#ada') && !links.some((h) => /^[78]-/.test(h)), 'ссылки на уроки курса — только на вышедшие: ' + [...new Set(links)].join(', '));
    check(!(await p.eval(`!!document.querySelector('main iframe, main video')`)), 'встроенного видео нет');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; App.emit('theme', 'dark'); window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['dream', '#dream .lab', 'l71-lab1-dark.png'], ['holes', '#holes .lab', 'l71-lab2-dark.png'], ['vmc', '#vmc .flow-card', 'l71-vmc-dark.png'], ['why', '#why .night-card', 'l71-night-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    // ---------- другие ширины ----------
    console.log('ширины');
    const q = await B.page(url, { width: 1024, height: 900, light: true });
    for (const w of [1024, 768, 720, 640, 360]) {
      await q.S('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: w <= 640 ? 2 : 1, mobile: w <= 640 });
      await q.eval('window.__lessonReady = false; location.reload(); true'); await sleep(300);
      await q.waitFor('window.__lessonReady === true', 60000); await sleep(500);
      for (const kind of ['vmc', 'rssm']) {
        const s2 = await schemeLabels(q, kind, FRAMES[kind]);
        check(!s2.none && !s2.bad.length && s2.minPx >= 9.95 && s2.layout === (w < 700 ? 'n' : 'w'), `ширина ${w}: схема ${kind} (${s2.layout === 'w' ? 'широкая' : 'узкая'}) — подписи не мельче 10 px (наименьшая ${s2.minPx && s2.minPx.toFixed(1)}), в блоках, без наложений` + (s2.bad.length ? ': ' + s2.bad.slice(0, 3).join('; ') : ''));
      }
      await q.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = true; }); true`); await sleep(150);
      const ov = await overflow(q);
      check(ov.sw <= w && !ov.lab && !ov.stat && !ov.photo && !ov.night && !ov.formula, `ширина ${w}: страница ${ov.sw} px, лаборатории, диаграммы, фото, карточка Ады и формулы не шире своих карточек` + (ov.formula ? `: формул шире — ${ov.formula}` : ''));
    }
    check(!q.logs.length, 'другие ширины: консоль ' + (q.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 60000); await m.waitFor('window.__modelReady === true', 120000); await sleep(400);
    await m.eval(`window.__noAnim = true; document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = true; }); true`); await sleep(200);
    const ovm = await overflow(m);
    check(ovm.sw <= 390 && !ovm.lab && !ovm.stat && !ovm.photo && !ovm.night && !ovm.formula, `телефон: ширина ${ovm.sw}, лаборатории, диаграммы, фото, карточка Ады и открытые формулы «Под капотом» не шире карточек` + (ovm.formula ? `: формул шире — ${ovm.formula}` : ''));
    await m.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = false; }); true`);
    for (const kind of ['vmc', 'rssm']) {
      const sm2 = await schemeLabels(m, kind, FRAMES[kind]);
      check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length && sm2.minPx >= 9.95, `телефон, схема ${kind} (узкая): подписи не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках, без наложений` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    }
    const mob = J(await m.eval(`JSON.stringify({ top: (() => { const t = document.querySelector('#dMis .m-top').getBoundingClientRect().top, s = document.querySelector('#dreamCv').getBoundingClientRect().top, b = document.querySelector('#dMis .m-bottom').getBoundingClientRect().top; return t < s && s < b; })(), top2: (() => { const t = document.querySelector('#hMis .m-top').getBoundingClientRect().top, s = document.querySelector('.hl-pair').getBoundingClientRect().top, b = document.querySelector('#hMis .m-bottom').getBoundingClientRect().top; return t < s && s < b; })(), pair: getComputedStyle(document.querySelector('.hl-pair')).gridTemplateColumns.split(' ').length, photos: getComputedStyle(document.querySelector('.robot-row')).gridTemplateColumns.split(' ').length })`));
    check(mob.top && mob.top2 && mob.pair === 1 && mob.photos === 2, 'телефон: условие миссий над сценой, запуск и итог — под ней; два мира лаборатории 2 друг под другом, фото в два столбца');
    // рисование пальцем: касание и движение по сцене дают путь
    const drawn = await m.eval(`(() => { const cv = document.getElementById('dreamCv'); cv.scrollIntoView({ block: 'center' }); const r = cv.getBoundingClientRect(); const ev = (type, fx, fy) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy })); try { cv.setPointerCapture = () => {}; } catch (e) {} ev('pointerdown', 0.25, 0.53); for (let i = 1; i <= 10; i++) ev('pointermove', 0.25 + i * 0.03, 0.53); ev('pointerup', 0.55, 0.53); return window.__l71.Dream.st.path.length; })()`);
    check(drawn >= 5, 'телефон: путь кисти рисуется касанием и движением пальца по сцене: ' + drawn + ' точек');
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['why', '#why .night-card', 'l71-m-night.png'], ['vmc', '#vmc .flow-card', 'l71-m-vmc.png'], ['dream', '#dream .lab', 'l71-m-lab1.png'], ['holes', '#holes .lab', 'l71-m-lab2.png'], ['rssm', '#rssm .flow-card', 'l71-m-rssm.png'], ['robots', '#robots .robot-row', 'l71-m-photos.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
