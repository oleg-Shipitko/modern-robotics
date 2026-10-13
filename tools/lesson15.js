// Проверка урока 1.5: сначала цифры движка в Node, потом все интерактивы в браузере —
// награда Push-T, денойзинг пачки, сборка цикла, лаборатория (пять миссий и свободный режим), квиз;
// тёмная тема и телефон 390 px. Снимки — в shots/l15-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const K = require('../lessons/shared/kettle-core.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-5-diffusion-policy.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f1 = (v, d) => (+v).toFixed(d == null ? 1 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* Отсылки вперёд: модели из будущих уроков называем по имени, но первое упоминание в тексте урока должно
   сопровождаться номером урока «урок N.M» — в том же предложении или в 160 символах после имени.
   Возвращает список имён, у которых первого упоминания с номером урока нет. */
const FWD = ['RT-1', 'RT-2', 'OpenVLA', 'Octo', 'π0', 'GR00T', 'Helix', 'ACT', 'CVAE', 'ALOHA', 'CLIPort', 'PerAct', 'SayCan', 'VoxPoser', 'FAST'];
function fwdRefs(text, names) {
  const bad = [];
  for (const name of names) {
    const ascii = /^[A-Za-z]/.test(name) && /[A-Za-z0-9]$/.test(name);
    const re = ascii ? new RegExp('(?<![A-Za-z0-9])' + name.replace(/[-.]/g, '\\$&') + '(?![A-Za-z0-9])') : null;
    const i = re ? text.search(re) : text.indexOf(name);
    if (i < 0) continue;
    const back = text.slice(Math.max(0, i - 400), i), bm = back.match(/[.!?](?=\s)[^.!?]*$/);
    const start = bm ? i - bm[0].length + 1 : Math.max(0, i - 400);
    const em = text.slice(i).match(/[.!?](?=\s|$)/), end = em ? i + em.index + 1 : i + 160;
    const win = text.slice(start, Math.max(end, i + 160));
    if (!/урок[а-я]*\s+\d\.\d/.test(win)) bad.push(`${name} («…${text.slice(Math.max(0, i - 30), i + 70).replace(/\s+/g, ' ').trim()}…»)`);
  }
  return bad;
}

/* ---------- 1. Цифры движка в Node: те же данные и зёрна, что в браузере ---------- */
const NODE = {};
function nodeNumbers() {
  console.log('Node: цифры движка');
  const k = K.KETTLE, D = K.makeDemos({ n: 40, pLeft: 0.5, seed: 1 });
  const t0 = Date.now(), den = K.finish(K.trainDen15(D.demos, { hid: 64, iters: 3000, pred: 'x0', seed: 5 })), ms = Date.now() - t0;
  const reg = K.finish(K.trainReg15(D.demos, { loss: 'mse', seed: 5 }));
  const b1 = [1, 11, 21].map((s) => K.batch15(den, k, 10, s));
  check(b1.every((b) => b.touches === 0 && b.left > 0 && b.right > 0 && b.maxSw === 0), `М1: касаний ${b1.map((b) => b.touches).join(', ')}; стороны ${b1.map((b) => `${b.left}/${b.right}`).join(', ')}; обучение ${ms} мс`);
  const r50 = [1, 11, 21, 31].map((s) => K.batch15(reg, k, 10, s).touches);
  check(r50.every((v) => v >= 2), `М2: регрессия при 50 на 50 задевает в ${r50.join(', ')} прогонах из 10`);
  const sh = {}; for (const p of [0.7, 0.8]) { const DD = K.makeDemos({ n: 40, pLeft: p, seed: 1 }); sh[p] = { reg: K.batch15(K.finish(K.trainReg15(DD.demos, { loss: 'mse', seed: 5 })), k, 10, 1).touches, den: K.batch15(K.finish(K.trainDen15(DD.demos, { hid: 64, iters: 3000, pred: 'x0', seed: 5 })), k, 10, 1).touches }; }
  check(sh[0.8].reg === 0 && sh[0.8].den === 0, `М2: при 80 на 20 регрессия ${sh[0.8].reg}, диффузия ${sh[0.8].den} касаний (при 70 на 30: ${sh[0.7].reg} и ${sh[0.7].den})`);
  const f1s = [1, 11, 21].map((s) => K.batch15(den, k, 10, s, { Ta: 1 }).runs.filter((q) => q.flips >= 2).length);
  check(f1s.every((v) => v >= 3), `М3: при исполнении по одному шагу план менял сторону ≥ 2 раз в ${f1s.join(', ')} прогонах из 10`);
  const st1 = [1, 11, 21, 31, 41].map((s) => K.batch15(den, k, 10, s, { steps: 1 }).touches), st4 = [1, 11, 21, 31, 41].map((s) => K.batch15(den, k, 10, s, { steps: 4 }).touches);
  check(st1.filter((v) => v > 0).length >= 4 && st4.every((v) => v === 0), `М4: касаний при 1 шаге денойзинга ${st1.join(', ')}, при 4 шагах ${st4.join(', ')}`);
  NODE.curve = {};
  for (const Ta of [1, 2, 4, 8, 16]) { let ok = 0; for (let i = 0; i < 20; i++) { const q = K.run15(den, k, 500 + i, { Ta, kpush: { t: 8 + ((500 + i) * 7) % 12, dx: 12, toward: true } }); if (!q.touch && q.flips < 2) ok++; } NODE.curve[Ta] = ok; }
  const c = NODE.curve, inner = Math.max(c[2], c[4], c[8]);
  check(inner > c[1] && inner > c[16] && c[1] < 10, `М5: из 20 без касаний и смен плана — ${Object.entries(c).map(([t, v]) => `${t}: ${v}`).join(', ')}`);
  const ex = [], MUS = D.demos.map((d) => { const v = new Float64Array(16); for (let j = 0; j < 16; j++) v[j] = (d.xs[9 + j] - K.RX) / K.SC; return v; });
  let L = 0, R = 0;
  for (let s = 0; s < 60; s++) { const o = K.ddimExact(MUS, null, 16, 16, K.rng(4000 + s + 1), true); const sd = o.x0s.map((x0) => (x0[9] * K.SC > 6 ? 1 : x0[9] * K.SC < -6 ? -1 : 0)); const fin = sd[15]; let f = 15; while (f > 0 && sd[f - 1] === fin) f--; ex.push(f + 1); if (fin < 0) L++; else if (fin > 0) R++; }
  const hist = {}; for (const v of ex) hist[v] = (hist[v] || 0) + 1;
  check(hist[2] === 51 && hist[3] === 8 && hist[5] === 1 && Object.keys(hist).length === 3 && L > 15 && R > 15, `денойзинг пачки: шаг выбора стороны по 60 пачкам — ${Object.entries(hist).map(([k, v]) => `${k}: ${v}`).join(', ')}; слева ${L}, справа ${R} (в разборе: 51, 8 и 1)`);
  // стартовая пачка интерактива (зерно 1): на шагах 1–2 оценка у чайника в коридоре ±6 см, с шага 3 — справа
  const o1 = K.ddimExact(MUS, null, 16, 16, K.rng(4001), true), d1 = o1.x0s.map((x0) => x0[9] * K.SC), s1 = d1.map((d) => (d > 6 ? 1 : d < -6 ? -1 : 0));
  check(s1[0] === 0 && s1[1] === 0 && s1.slice(2).every((v) => v === 1) && Math.abs(d1[1]) < 6 && Math.abs(d1[1]) > 3, `стартовая пачка: оценка у чайника по шагам ${d1.slice(0, 4).map((v) => f1(v)).join(', ')} см — сторона выбрана на шаге 3, а на шаге 2 кольцо ещё в коридоре`);
  NODE.at2 = hist[2];
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l15.mis.${key}.ctx.done[window.__l15.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(120); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) { await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`); await sleep(150); await p.waitFor(`!window.__l15.mis.${key}.busy`, 120000); await sleep(80); }
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(40); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150); }
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(8); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(80);
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size === document.querySelectorAll("[id]").length'), 'id без повторов');
  check(await p.eval('document.querySelectorAll(".katex").length > 10'), 'формулы отрисованы KaTeX: ' + await p.eval('document.querySelectorAll(".katex").length'));
  // отсылки вперёд: первое упоминание каждой модели из будущих уроков — с номером урока (разминку, глоссарий, формулы и таблицу систем — справку с номерами уроков — пропускаем; Diffusion Policy и RTC разбираются в этом уроке)
  const fwdText = () => p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#finale .links, #finale .links + *, #recall, #glData, .katex, .speed-tbl").forEach((e) => e.remove()); return m.textContent; })()');
  const fwdBad = fwdRefs(await fwdText(), FWD);
  check(fwdBad.length === 0, 'отсылки вперёд: первое упоминание каждой модели — с номером урока' + (fwdBad.length ? '; нет у: ' + fwdBad.join('; ') : ''));
  await p.shotEl(out('l15-hero.png'), '#top', 0);
  const deepSum = await p.eval('[...document.querySelectorAll("#scheme details.deep > summary")].map((e) => e.textContent).join(" | ")');
  const deepP = await p.eval('(document.querySelector("#scheme details.deep .body > p") || {}).textContent || ""');
  check(/Diffusion Policy \(Chi и соавторы, 2023\)/.test(deepSum) && /Diffusion Policy \(Chi и соавторы, 2023\)/.test(deepP), 'под капотом: заголовок и первая фраза называют статью — ' + deepSum);
  // таблица систем: столбцы не слипаются — у ячеек есть отступ справа, третий столбец не уже 110 px
  await center(p, '#speed .tbl-wrap');
  const tbl = await p.eval('(() => { const tds = [...document.querySelectorAll("#speed .speed-tbl tbody tr:first-child td")]; const w = tds.map((e) => e.getBoundingClientRect().width); const pr = tds.map((e) => parseFloat(getComputedStyle(e).paddingRight)); return { w, pr }; })()');
  check(tbl.w[2] >= 110 && tbl.pr.slice(0, 3).every((v) => v >= 12), `таблица систем: ширины столбцов ${tbl.w.map((v) => f1(v, 0)).join(' / ')}, отступ справа ${tbl.pr.map((v) => f1(v, 0)).join(' / ')}`);
  await p.shotEl(out('l15-speed.png'), '#speed .tbl-wrap', 6);

  // --- 1. Push-T: перетащить блок мышью, повернуть ползунком, подогнать стрелками
  await center(p, '#ptCv');
  const g = await p.eval('window.__l15.PushT.api.goal()'), s0 = await p.eval('window.__l15.PushT.api.state()');
  const a = await cpt(p, '#ptCv', 520, s0.x, s0.y), b = await cpt(p, '#ptCv', 520, g.x + 3, g.y + 2);
  const pts = []; for (let i = 0; i <= 14; i++) pts.push({ x: a.x + (b.x - a.x) * i / 14, y: a.y + (b.y - a.y) * i / 14 });
  await mouseDrag(p, pts);
  const s1 = await p.eval('window.__l15.PushT.api.state()');
  check(Math.hypot(s1.x - g.x - 3, s1.y - g.y - 2) < 3, `Push-T: блок перетащен мышью в (${f1(s1.x, 0)}; ${f1(s1.y, 0)}), покрытие ${f1(s1.cov * 100)}%`);
  await setRange(p, 'ptRot', 45);
  const s2 = await p.eval('window.__l15.PushT.api.state()');
  check(s2.deg === 45 && s2.cov > 0.9 && s2.reward < 1, `Push-T: поворот 45°, покрытие ${f1(s2.cov * 100)}%, награда ${f1(s2.reward, 3)} — ещё не 1`);
  await p.eval('document.querySelector("#ptNudge .l").click()'); await sleep(60);
  const s3 = await p.eval('window.__l15.PushT.api.state()');
  check(s3.reward >= 0.9999 && s3.cov < 0.99 && await done(p, 'pusht'), `Push-T: стрелкой влево — покрытие ${f1(s3.cov * 100)}%, награда 1; ` + (await outText(p, '#ptMis')).slice(0, 70));
  await p.shotEl(out('l15-pusht.png'), '#pusht .lab', 6);
  await p.eval('window.__l15.PushT.api.place(342, 158, 45)');
  const s4 = await p.eval('window.__l15.PushT.api.state()');
  check(Math.abs(s4.cov - 1) < 1e-6, `Push-T: блок ровно в цели — покрытие ${f1(s4.cov * 100, 2)}%`);

  // --- 2. Денойзинг пачки
  await center(p, '#scrubCv');
  const d0 = await p.eval('window.__l15.Scrub.api.state()');
  check(d0.decide === 3 && d0.sides[0] === 0 && d0.sides[1] === 0, `денойзинг: стартовая пачка — сторона выбрана на шаге ${d0.decide}, на шагах 1–2 в коридоре (${d0.dists.slice(0, 3).map((v) => f1(v)).join(', ')} см)`);
  await setRange(p, 'scrubS', 2);
  const ro2 = await p.eval('document.querySelector("#scrubOut").textContent');
  check(/Шаг 2:/.test(ro2) && /в коридоре/.test(ro2) && /Сторона не выбрана/.test(ro2) && ro2.includes(f1(Math.abs(d0.dists[1])).replace('.', ',')), 'денойзинг: подпись на шаге 2 — ' + ro2.slice(0, 110));
  await setRange(p, 'scrubS', d0.decide - 1); await p.eval('document.querySelector("#scrubMark").click()'); await sleep(60);
  const roM = await p.eval('document.querySelector("#scrubOut").textContent');
  check(!(await done(p, 'scrub')) && /ещё не выбрана/.test(roM), `денойзинг: отметка на шаге ${d0.decide - 1} не засчитана, объяснено почему — …${roM.slice(roM.indexOf('Отмечен'), roM.indexOf('Отмечен') + 90)}`);
  await setRange(p, 'scrubS', d0.decide); await p.eval('document.querySelector("#scrubMark").click()'); await sleep(60);
  const ex1 = await outText(p, '#scrubMis');
  check(await done(p, 'scrub') && ex1.includes(`на шаге ${d0.decide} из 16`) && ex1.includes(f1(Math.abs(d0.dists[1])).replace('.', ',')) && ex1.includes(f1(Math.abs(d0.dists[2])).replace('.', ',')) && /51, на шаге 3 — у 8, на шаге 5 — у одной/.test(ex1), 'денойзинг М1: ' + ex1.slice(0, 160));
  await p.shotEl(out('l15-scrub.png'), '#chunk .lab', 6);
  await next(p, '#scrubMis');
  let tries = 0; while (!(await done(p, 'scrub')) && tries < 20) { await p.eval('document.querySelector("#scrubNew").click()'); await sleep(40); tries++; }
  check(await done(p, 'scrub'), `денойзинг М2: обе стороны за ${tries} нажатий «Новый шум»`);
  await setRange(p, 'scrubS', 16); await p.shotEl(out('l15-scrub-end.png'), '#chunk .lab', 6);

  // --- 3. Собери цикл: ошибка порядка, лишний блок, верный порядок
  await center(p, '#pipeBank');
  const clickCard = (t, x) => p.eval(`(() => { const c = [...document.querySelectorAll('#pipeBank .pc')].find((e) => e.textContent.startsWith(${JSON.stringify(t)})); c.querySelector(${JSON.stringify(x ? '.pc-x' : '.pc-main')}).click(); })()`);
  await clickCard('Сеть 16 раз'); let ps = await p.eval('window.__l15.Pipe.api.state()');
  check(ps.placed === 0 && ps.errors === 1, 'цикл: денойзинг первым не принят');
  await clickCard('Зашумить кадры'); ps = await p.eval('window.__l15.Pipe.api.state()');
  check(ps.rejected === 1 && /лишний/.test(await p.eval('document.querySelector("#pipeOut").textContent')), 'цикл: лишний блок отброшен с объяснением');
  for (const t of ['Два последних кадра', 'Энкодер', 'Пачка из чистого', 'Сеть 16 раз', 'Робот исполняет', 'Новые наблюдения']) await clickCard(t);
  ps = await p.eval('window.__l15.Pipe.api.state()');
  check(ps.placed === 6 && !(await done(p, 'pipe')), 'цикл собран, но второй лишний блок ещё не отброшен');
  await clickCard('Усреднить', true);
  check(await done(p, 'pipe'), 'цикл: ' + (await outText(p, '#pipeMis')).slice(0, 80));
  await p.shotEl(out('l15-pipe.png'), '#scheme .lab', 6);

  // --- 4. Лаборатория
  await p.eval('window.__l15.SPEED.k = 4');
  await center(p, '#labMis');
  check(await p.eval('["#wrapReg", "#wrapShare", "#wrapTa", "#wrapSteps", "#wrapShift", "#wrapCurve", "#wrapFlips"].every((s) => document.querySelector(s).hidden) && !document.querySelector("#wrapPlan").hidden'), 'лаба М1: из ручек только показ пачки, полоска прогонов скрыта');
  await bet(p, '#labMis', 'Ни разу'); const tl = Date.now(); await go(p, '#labMis', 'lab');
  const r1 = await p.eval('window.__l15.mis.lab.ctx.results[0]');
  check(await done(p, 'lab') && r1.den.touches === 0, `лаба М1: касаний ${r1.den.touches}, слева ${r1.den.left}, справа ${r1.den.right}; обучение и прогон ${f1((Date.now() - tl) / 1000)} с`);
  await p.shotEl(out('l15-lab-m1.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('!document.querySelector("#wrapReg").hidden && document.querySelector("#labReg").checked && !document.querySelector("#wrapShare").hidden'), 'лаба М2: регрессия включена, появилась доля');
  await bet(p, '#labMis', 'Когда почти все'); await go(p, '#labMis', 'lab');
  const r2a = await p.eval('window.__l15.mis.lab.ctx.results[1]');
  check(!(await done(p, 'lab')) && r2a.regS.touches > 0 && r2a.den.touches === 0, `лаба М2, 50 на 50: регрессия ${r2a.regS.touches}/10, диффузия ${r2a.den.touches}/10`);
  for (const sh of [80, 90]) { if (await done(p, 'lab')) break; await setRange(p, 'labShare', sh); await go(p, '#labMis', 'lab'); }
  check(await done(p, 'lab'), 'лаба М2, сильный перекос: ' + (await outText(p, '#labMis')).slice(0, 90));
  console.log('  журнал М2:', await p.eval('document.querySelector("#labMis .m-log").textContent'));
  await p.shotEl(out('l15-lab-reg.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('window.__l15.Lab.st.Ta === 1 && window.__l15.Lab.st.share === 0.5 && !document.querySelector("#wrapTa").hidden && !document.querySelector("#wrapFlips").hidden'), 'лаба М3: исполнение по одному шагу, доля 50%, полоска прогонов видна');
  check(await p.eval('(() => { const cv = document.querySelector("#labFlips"); const c = cv.getContext("2d"); const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) < 20) n++; return cv.width > 0 && n > 0; })()') && (await p.eval('document.querySelector("#wrapFlips .cv-note").textContent.length > 60')), 'лаба М3: до запуска на полоске есть подсказка, под ней подпись и легенда');
  await bet(p, '#labMis', 'План начнёт'); for (let i = 0; i < 3 && !(await done(p, 'lab')); i++) await go(p, '#labMis', 'lab');
  const r3 = await p.eval('window.__l15.mis.lab.ctx.results[2]');
  check(await done(p, 'lab'), `лаба М3: план менял сторону ≥ 2 раз в ${r3.den.flips2} прогонах из 10, касаний ${r3.den.touches}`);
  // полоска прогонов: смены стороны по клеткам = смены в движке, число рядов в рамке = число в разборе
  const ch = await p.eval('(() => { const rs = window.__l15.Lab.st.res.den; return { n: rs.length, same: rs.every((q) => q.chain.flips === q.flips), marked: rs.filter((q) => q.flips >= 2).length, cells: rs.map((q) => q.chain.cells.length), max: Math.max(...rs.map((q) => q.flips)) }; })()');
  const ex3 = await outText(p, '#labMis');
  check(ch.n === 10 && ch.same && ch.marked === r3.den.flips2 && ch.cells.every((v) => v >= 10) && ex3.includes(`В ${r3.den.flips2} прогонах из 10`) && ex3.includes(`больше всего смен — ${ch.max} в прогоне ${r3.den.worst + 1}`) && ex3.includes(`${r3.den.touches} из 10`), `лаба М3: полоска — рядов в рамке ${ch.marked}, смены по клеткам совпали с движком, пачек у чайника в ряду ${Math.min(...ch.cells)}–${Math.max(...ch.cells)}; разбор: …${ex3.slice(0, 120)}`);
  check(await p.eval('/прогон, где план менял сторону/.test(document.querySelector("#labLegend").textContent)'), 'лаба М3: в легенде сцены появился пункт про яркие пути');
  await p.shotEl(out('l15-lab-ta1.png'), '#lab .lab', 6);
  await p.shotEl(out('l15-lab-flips.png'), '#wrapFlips', 6);
  await next(p, '#labMis');
  check(await p.eval('window.__l15.Lab.st.steps === 1 && !document.querySelector("#wrapSteps").hidden'), 'лаба М4: один шаг денойзинга');
  await bet(p, '#labMis', 'Начнёт задевать');
  for (let i = 0; i < 4 && !(await p.eval('window.__l15.Lab.st.log.some((q) => q.steps === 1 && q.den.touches > 0)')); i++) await go(p, '#labMis', 'lab');
  for (const st of [2, 3, 4]) { if (await done(p, 'lab')) break; await setRange(p, 'labSteps', st); await go(p, '#labMis', 'lab'); }
  check(await done(p, 'lab'), 'лаба М4: ' + (await outText(p, '#labMis')).slice(0, 90));
  console.log('  журнал М4:', await p.eval('document.querySelector("#labMis .m-log").textContent'));
  await next(p, '#labMis');
  check(await p.eval('window.__l15.Lab.st.shift && !document.querySelector("#wrapCurve").hidden'), 'лаба М5: сдвиг чайника включён, график виден');
  await bet(p, '#labMis', 'Где-то посередине');
  for (const ta of [1, 16, 8, 4]) { await p.eval(`document.querySelector('#wrapTa [data-ta="${ta}"]').click()`); await sleep(40); await go(p, '#labMis', 'lab'); }
  const cv = await p.eval('window.__l15.Lab.st.curve');
  check(await done(p, 'lab') && [1, 4, 8, 16].every((t) => cv[t] === NODE.curve[t]), `лаба М5: кривая ${Object.entries(cv).map(([t, v]) => `${t}: ${v}`).join(', ')} совпала с Node`);
  console.log('  разбор М5:', (await outText(p, '#labMis')).slice(0, 120));
  await p.shotEl(out('l15-lab-curve.png'), '#lab .lab', 6);
  await next(p, '#labMis');
  check(await p.eval('["#wrapReg", "#wrapShare", "#wrapTa", "#wrapSteps", "#wrapShift", "#wrapCurve", "#wrapPlan", "#wrapFlips"].every((s) => !document.querySelector(s).hidden)'), 'лаба, свободный режим: все ручки и полоска прогонов видны');
  await p.eval('document.querySelector("#labReg").checked = true; document.querySelector("#labReg").dispatchEvent(new Event("change"))'); await sleep(40);
  await go(p, '#labMis', 'lab');
  const rf = await p.eval('window.__l15.Lab.st.log.at(-1)');
  check(!!rf.regS, `свободный режим: регрессия со сдвигом чайника — касаний ${rf.regS.touches} из 10, диффузия ${rf.den.touches}`);

  // --- квиз
  await center(p, '#quizBox');
  await p.eval('document.querySelectorAll(".q-card").forEach((c) => c.querySelector(".q-opt").click())'); await sleep(80);
  check(/Итог: \d из 8/.test(await p.eval('document.querySelector("#quizScore").textContent')), 'квиз: ' + (await p.eval('document.querySelector("#quizScore").textContent')));
  await p.shotEl(out('l15-quiz.png'), '#quiz', 4);
  await p.shotEl(out('l15-finale.png'), '#finale', 4);
  // те же отсылки вперёд после прохождения миссий: в DOM появились разборы миссий
  const fwdBad2 = fwdRefs(await fwdText(), FWD);
  check(fwdBad2.length === 0, 'отсылки вперёд после миссий: первое упоминание каждой модели — с номером урока' + (fwdBad2.length ? '; нет у: ' + fwdBad2.join('; ') : ''));
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();

  // тёмная тема
  const B2 = await launch({ w: 1440, h: 1000 });
  const q = await B2.page(URL0, { width: 1440, height: 1000, dark: true });
  await q.waitFor('window.__lessonReady === true', 60000); await sleep(400);
  await q.shotEl(out('l15-pusht-dark.png'), '#pusht .lab', 6);
  await q.shotEl(out('l15-scrub-dark.png'), '#chunk .lab', 6);
  await q.eval('window.__l15.SPEED.k = 4'); await center(q, '#labMis'); await bet(q, '#labMis', 'Ни разу'); await go(q, '#labMis', 'lab');
  await q.shotEl(out('l15-lab-dark.png'), '#lab .lab', 6);
  check(q.logs.length === 0, 'консоль тёмной темы: ' + (q.logs.join(' | ') || 'чисто'));
  await B2.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.eval('window.__l15.SPEED.k = 3');
  await m.shotEl(out('l15-m-hero.png'), '#top', 0);
  await m.shotEl(out('l15-m-pusht.png'), '#pusht .lab', 4);
  await m.shotEl(out('l15-m-scrub.png'), '#chunk .lab', 4);
  await m.shotEl(out('l15-m-pipe.png'), '#scheme .lab', 4);
  await center(m, '#labMis'); await bet(m, '#labMis', 'Ни разу'); await go(m, '#labMis', 'lab');
  check(await done(m, 'lab'), 'телефон: лаба М1 пройдена');
  await m.shotEl(out('l15-m-lab.png'), '#lab .lab', 4);
  await m.eval('window.__l15.mis.lab.goto(2)'); await sleep(150);
  await bet(m, '#labMis', 'План начнёт'); for (let i = 0; i < 3 && !(await done(m, 'lab')); i++) await go(m, '#labMis', 'lab');
  const chm = await m.eval('(() => { const rs = window.__l15.Lab.st.res.den; return rs.every((q) => q.chain.flips === q.flips) && !document.querySelector("#wrapFlips").hidden; })()');
  check(await done(m, 'lab') && chm, 'телефон: лаба М3 пройдена, полоска прогонов видна и совпадает с движком');
  // снимок полоски: шапка позиционирована fixed и при снимке за пределами экрана попадает в кадр — прячем её только на время снимка
  await center(m, '#wrapFlips'); await sleep(400);
  await m.eval('document.querySelector(".topbar").style.visibility = "hidden"');
  await m.shotEl(out('l15-m-lab-flips.png'), '#wrapFlips', 4);
  await m.eval('document.querySelector(".topbar").style.visibility = ""');
  const fh = await m.eval('(() => { const r = document.querySelector("#labFlips").getBoundingClientRect(); return r.height / r.width; })()');
  check(fh > 0.4, `телефон: полоска прогонов выше (${f1(fh, 2)} от ширины), ряды не слипаются`);
  await m.shotEl(out('l15-m-speed.png'), '#speed', 4);
  check(await m.eval('getComputedStyle(document.querySelector("#speed .tbl-hint")).display === "block"'), 'телефон: под таблицей видна подсказка о прокрутке');
  const tw = await m.eval('(() => { const w = document.querySelector("#speed .tbl-wrap"); return { sw: w.scrollWidth, cw: w.clientWidth, ox: getComputedStyle(w).overflowX }; })()');
  check(tw.sw > tw.cw && tw.ox === 'auto', `телефон: таблица систем прокручивается внутри обёртки (${tw.sw} в ${tw.cw} px)`);
  const wdt = await m.eval('document.documentElement.scrollWidth');
  check(wdt <= 390, `телефон: ширина ${wdt} из 390`);
  check(m.logs.length === 0, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
}

(async () => {
  nodeNumbers();
  await desktop();
  await phone();
  console.log(fails ? `ИТОГ: ${fails} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
