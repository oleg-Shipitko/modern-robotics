// Урок 6.4 «Локоманипуляция»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, Ада нарисована общим рисунком (shared/ada-legs.js) и совпадает с моделью,
// подписи схемы и канвасов помещаются и не мельче 10 px, схема движется, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l64-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l64.
// node tools/lesson64.js             — проверка в headless Chrome (компьютер 1440, телефон 390, тёмная тема);
// node tools/lesson64.js --numbers   — числа лабораторий в Node, для сверки с текстами;
// node tools/lesson64.js --seeds     — устойчивость выводов: лаборатория 1 на десяти сериях толчков (зёрна 1–200), лаборатория 2 — пересчёт
//                                      вшитой таблицы на зёрнах обучения 1–10 (около 6 минут); сводка — shots/l64-seeds.json;
// node tools/lesson64.js --seedtexts — сверить тексты «Под капотом» с сохранённой сводкой shots/l64-seeds.json (без пересчёта);
// node tools/lesson64.js --check     — пересчитать вшитую таблицу лаборатории 2 на зёрнах 1 и 2 и сверить с движком (около минуты);
// node tools/lesson64.js --train     — посчитать таблицу лаборатории 2 на зёрнах 1–10 и вшить её в lessons/l64/engine.js.
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const ENGINE = path.resolve(__dirname, '../lessons/l64/engine.js'), LESSON = path.resolve(__dirname, '../lessons/l64/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const f0 = (v) => fr(v, 0), f1 = (v) => fr(v, 1), f2 = (v) => fr(v, 2);
const E = require('../lessons/l64/engine.js');
// слова о расположении на экране: в подписях и текстах лабораторий говорим о ролях (на телефоне раскладка другая)
const POS0 = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
// «верхний уровень» и «нижний уровень» (модель верхнего уровня, контроллер нижнего уровня) — уровни иерархии управления, а не места на экране
const noHier = (s) => String(s).replace(/(верхн|нижн)[а-яё]+ уров[а-яё]+/gi, 'уровень');
const POS = { test: (s) => POS0.test(noHier(s)) };
const posWord = (s) => { const m = noHier(s).match(POS0); return m ? m[2] : ''; };
const FREQS = [2, 5, 10, 25, 50], NS = [5, 10, 20, 40];
const rng = (a) => { const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? f0(lo) : `${f0(lo)}–${f0(hi)}`; };

/* ---------- числа лабораторий в Node: те же расчёты, что на странице ---------- */
function lab1() {
  const m1 = { d: E.episode('direct', 5, 1), w: E.episode('wbc', 5, 1) }, ser = {};
  for (const f of FREQS) ser[f] = { d: E.run(E.series('direct', f, 20, 1)), w: E.run(E.series('wbc', f, 20, 1)) };
  const one = { pushes: 'none', push: { t: 2.1, dv: 0.6 }, keep: true }, m4 = { d: E.episode('direct', 5, 1, one), w: E.episode('wbc', 5, 1, one) };
  const fw = m4.w.frames; let stepAfter = null;
  for (let i = 1; i < fw.length; i++) if (fw[i].st !== fw[i - 1].st && fw[i].t > 2.1) { const a = fw[i].st ? fw[i].f1 : fw[i].f0, b = fw[i].st ? fw[i].f0 : fw[i].f1; stepAfter = a - b; break; }
  let stepBefore = null; for (let i = 1; i < fw.length; i++) if (fw[i].st !== fw[i - 1].st && fw[i].t > 1.0 && fw[i].t < 2.1) { const a = fw[i].st ? fw[i].f1 : fw[i].f0, b = fw[i].st ? fw[i].f0 : fw[i].f1; stepBefore = a - b; }
  const calm = { d: E.episode('direct', 5, 1, { pushes: 'none' }), w: E.episode('wbc', 5, 1, { pushes: 'none' }) };
  return { m1, ser, m4, stepAfter, stepBefore, calm };
}
/** Лаборатория 2 на зерне обучения seed: конфигурации миссий. */
function lab2(seed) {
  const o = {};
  for (const [n, dp] of [[20, false], [40, false], [20, true], [5, false]]) o[n + '|' + (dp ? 1 : 0)] = E.run(E.bcExperiment(n, { demoPush: dp, seed }));
  return o;
}
const cnt = (r, push, who) => r.res[push ? 'push' : 'calm'][who];
/** Тексты «Под капотом» по сериям и зёрнам — те же фразы, что в уроке. */
function splitSeedText(S1) {
  const pd = (f) => rng(S1['direct' + f].map((x) => x.p)), pw = (f) => rng(S1['wbc' + f].map((x) => x.p));
  const falls = FREQS.reduce((a, f) => a + S1['wbc' + f].reduce((b, x) => b + x.fe, 0), 0), runs = FREQS.length * S1.wbc2.length * 20;
  const errs = FREQS.flatMap((f) => S1['wbc' + f].map((x) => x.err).filter((x) => x != null));
  const fallTxt = falls === 0 ? 'и ни разу не упала' : falls === 1 ? `а упала за все ${runs} прогонов один раз` : `а упала за все ${runs} прогонов ${f0(falls)} ${falls % 10 >= 2 && falls % 10 <= 4 && (falls % 100 < 12 || falls % 100 > 14) ? 'раза' : 'раз'}`;
  return `На десяти сериях по 20 прогонов с зёрнами толчков от 1 до 200 Ада с планом всего тела ставит чашку на 2 Гц в ${pd(2)} прогонах из 20, на 5 Гц — в ${pd(5)}, на 10 Гц — в ${pd(10)}, на 25 Гц — в ${pd(25)} и на 50 Гц — в ${pd(50)}. Ада с контроллером тела ставит чашку на 2 Гц в ${pw(2)} прогонах из 20, на 5 Гц — в ${pw(5)}, на 10 Гц — в ${pw(10)}, на 25 Гц — в ${pw(25)} и на 50 Гц — в ${pw(50)}, ${fallTxt}. Встаёт она в среднем в ${f1(Math.min(...errs) * 100)}–${f1(Math.max(...errs) * 100)} см от отметки.`;
}
function bcSeedText(D) {
  const list = (dp, k) => { const r = NS.map((n) => rng(D[dp][n][k])); return `${r.slice(0, 3).join(', ')} и ${r[3]}`; };
  return `На зёрнах обучения 1–10 без толчков при записи политика по шагам ставит чашку в спокойных проверках в ${list(0, 'calmA')} случаях из 20 при 5, 10, 20 и 40 записях, а в проверках с толчками — в ${list(0, 'pushA')}. Политика по командам в спокойных проверках ставит чашку в ${list(0, 'calmB')} случаях, а с толчками — в ${list(0, 'pushB')}. После записей с толчками политика по шагам в проверках с толчками ставит чашку в ${list(1, 'pushA')} случаях из 20, а политика по командам — в ${list(1, 'pushB')}.`;
}
/** Таблица лаборатории 2 на зёрнах seeds: { dp: { n: { calmA: [...], ... } } }. */
function bcTable(seeds, log) {
  const T = [{}, {}];
  for (const dp of [0, 1]) for (const n of NS) { T[dp][n] = { calmA: [], pushA: [], calmB: [], pushB: [] }; for (const seed of seeds) { const r = E.run(E.bcExperiment(n, { demoPush: !!dp, seed })); T[dp][n].calmA.push(cnt(r, false, 'A').placed); T[dp][n].pushA.push(cnt(r, true, 'A').placed); T[dp][n].calmB.push(cnt(r, false, 'B').placed); T[dp][n].pushB.push(cnt(r, true, 'B').placed); if (log) log(dp, n, seed, r); } }
  return T;
}
function embedTable(T) {
  let s = fs.readFileSync(ENGINE, 'utf8'); const a = s.indexOf('/*@DATA@*/'), b = s.indexOf('/*@/DATA@*/');
  const row = (d) => '{ ' + NS.map((n) => `${n}: { calmA: [${d[n].calmA.join(', ')}], pushA: [${d[n].pushA.join(', ')}], calmB: [${d[n].calmB.join(', ')}], pushB: [${d[n].pushB.join(', ')}] }`).join(', ') + ' }';
  const head = s.slice(a, s.indexOf('const DATA', a));
  fs.writeFileSync(ENGINE, s.slice(0, a) + head + 'const DATA = { bc: [\n    ' + row(T[0]) + ',\n    ' + row(T[1]) + ',\n  ] };\n  ' + s.slice(b));
}

if (process.argv.includes('--train')) {
  const t0 = Date.now(), T = bcTable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (dp, n, seed, r) => console.log(`${n}|${dp}|${seed}`, 'A', cnt(r, false, 'A').placed, cnt(r, true, 'A').placed, 'B', cnt(r, false, 'B').placed, cnt(r, true, 'B').placed, ((Date.now() - t0) / 1000).toFixed(0) + ' с'));
  embedTable(T); console.log(`вшито в ${ENGINE} за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
} else if (process.argv.includes('--check')) {
  const t0 = Date.now(), T = bcTable([1, 2]);
  for (const dp of [0, 1]) for (const n of NS) for (const k of ['calmA', 'pushA', 'calmB', 'pushB']) check(T[dp][n][k][0] === E.DATA.bc[dp][n][k][0] && T[dp][n][k][1] === E.DATA.bc[dp][n][k][1], `таблица лаборатории 2: ${n} записей${dp ? ' с толчками' : ''}, ${k} на зёрнах 1 и 2 — ${T[dp][n][k].join(', ')} (вшито ${E.DATA.bc[dp][n][k].slice(0, 2).join(', ')})`);
  console.log(`время ${((Date.now() - t0) / 1000).toFixed(0)} с`); finish();
} else if (process.argv.includes('--numbers')) {
  const L1 = lab1(), d = L1.m1.d, w = L1.m1.w;
  console.log('лаб. 1 М1 (5 Гц, зерно 1): с планом', d.out, 'чай', d.spilled && f2(d.spilled), 'упала', d.fell && f2(d.fell), '| с контроллером', w.out, w.placed && f2(w.placed));
  for (const f of FREQS) { const a = L1.ser[f].d, b = L1.ser[f].w; console.log(`лаб. 1 серия ${f} Гц: с планом поставила ${a.placed}, упала ${a.fell}, полка ${a.hit}, чай ${a.spilled}, мимо ${a.miss} | с контроллером поставила ${b.placed}, упала ${b.fell}, чай ${b.spilled}, ошибка ${b.err != null ? f2(b.err * 100) : '-'} см`); }
  console.log('лаб. 1 М4: с планом', L1.m4.d.out, L1.m4.d.fell && f2(L1.m4.d.fell), '| с контроллером', L1.m4.w.out, L1.m4.w.placed && f2(L1.m4.w.placed), 'шаг до толчка', f1(L1.stepBefore * 100), 'см, после', f1(L1.stepAfter * 100), 'см');
  console.log('лаб. 1 без толчков: с планом', L1.calm.d.out, f2(L1.calm.d.placed), '| с контроллером', L1.calm.w.out, f2(L1.calm.w.placed));
  const L2 = lab2(1);
  for (const k of Object.keys(L2)) { const r = L2[k], A = cnt(r, false, 'A'), B = cnt(r, false, 'B'), Ap = cnt(r, true, 'A'), Bp = cnt(r, true, 'B'); console.log(`лаб. 2 ${k}: без толчков A ${A.placed}/${A.fell}/${A.hit}/${A.spilled}/${A.miss}, B ${B.placed}/${B.fell}/${B.hit}/${B.spilled}/${B.miss} | с толчками A ${Ap.placed}/${Ap.fell}/${Ap.hit}/${Ap.spilled}/${Ap.miss}, B ${Bp.placed}/${Bp.fell}/${Bp.hit}/${Bp.spilled}/${Bp.miss} | пар ${r.pairsA}/${r.pairsB}, скорость в записях до ${f2(r.demoVMax)} м/с`); }
  console.log('лаб. 2 «Под капотом»:', bcSeedText(E.DATA.bc));
} else if (process.argv.includes('--seedtexts')) {
  const D = J(fs.readFileSync(out('l64-seeds.json'), 'utf8')), txt = plain(), t1 = splitSeedText(D.lab1);
  console.log('лаб. 1:', t1);
  check(txt.includes(sp(t1)), '«Под капотом» лаборатории 1 называет диапазоны по десяти сериям толчков (из shots/l64-seeds.json)');
  check(JSON.stringify(D.lab2) === JSON.stringify(E.DATA.bc), 'вшитая таблица лаборатории 2 совпадает с пересчётом из shots/l64-seeds.json');
  finish();
} else if (process.argv.includes('--seeds')) {
  const t0 = Date.now(), S1 = {};
  for (let b = 0; b < 10; b++) for (const f of FREQS) for (const m of ['direct', 'wbc']) { const c = E.run(E.series(m, f, 20, 1 + 20 * b)); (S1[m + f] = S1[m + f] || []).push({ p: c.placed, fe: c.fell, s: c.spilled, h: c.hit, mi: c.miss, err: c.err }); }
  console.log(`лаб. 1: десять серий за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  for (const f of FREQS) console.log(`  ${f} Гц: с планом ${S1['direct' + f].map((x) => x.p).join(',')} | с контроллером ${S1['wbc' + f].map((x) => x.p).join(',')}`);
  const T = bcTable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (dp, n, seed) => process.stdout.write(`\r  лаб. 2: ${n}|${dp}|${seed}   `));
  console.log(`\nвсего ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  fs.writeFileSync(out('l64-seeds.json'), JSON.stringify({ lab1: S1, lab2: T }));
  const txt = plain(), t1 = splitSeedText(S1); console.log('лаб. 1:', t1);
  check(txt.includes(sp(t1)), '«Под капотом» лаборатории 1 называет диапазоны по десяти сериям толчков');
  check(JSON.stringify(T) === JSON.stringify(E.DATA.bc), 'вшитая таблица лаборатории 2 совпадает с пересчётом на зёрнах 1–10');
  const d = (f) => S1['direct' + f].map((x) => x.p), w = (f) => S1['wbc' + f].map((x) => x.p);
  check([2, 5, 10].every((f) => Math.max(...d(f)) <= 1) && Math.max(...d(25)) <= 6 && Math.min(...d(50)) >= 17, `лаб. 1 на всех сериях: Ада с планом на 2–10 Гц ставит чашку не больше чем в одном прогоне из 20, на 25 Гц — не больше чем в шести, на 50 Гц — хотя бы в 17`);
  check(FREQS.every((f) => Math.min(...w(f)) >= 16) && FREQS.every((f) => S1['wbc' + f].every((x) => x.fe <= 1)), `лаб. 1 на всех сериях: Ада с контроллером тела на любой частоте ставит чашку хотя бы в 16 прогонах из 20 и почти не падает`);
  check(FREQS.filter((f) => f < 50).every((f) => d(f).every((v, i) => v < w(f)[i])), 'лаб. 1 на всех сериях и частотах ниже 50 Гц: Ада с контроллером тела ставит чашку чаще Ады с планом');
  const A = (dp, n, k) => T[dp][n][k], all = (a, fn) => a.every(fn);
  check(all(A(0, 20, 'calmA'), (v, i) => v + 2 < A(0, 20, 'calmB')[i]), 'лаб. 2 М1 на всех зёрнах: политика по командам ставит чашку чаще политики по шагам (ставка «по командам»)');
  check(Math.max(...A(0, 40, 'calmA')) < 17, 'лаб. 2 М2 на всех зёрнах: с 40 записями политика по шагам не ставит чашку «почти всегда»');
  check(all(A(0, 20, 'pushB'), (v) => v >= 15) && Math.max(...A(0, 20, 'pushA')) < 15, 'лаб. 2 М3 на всех зёрнах: с толчками политика по командам ставит чашку хотя бы в 15 проверках, политика по шагам — меньше');
  check(A(1, 20, 'pushA').filter((v) => v >= 17).length >= 7, `лаб. 2 М4: после записей с толчками политика по шагам ставит чашку с толчками хотя бы в 17 проверках на ${A(1, 20, 'pushA').filter((v) => v >= 17).length} зёрнах из 10`);
  finish();
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/6-4-lokomanipulyatsiya.html');
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 8000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const missing = (s, list) => list.filter((x) => !s.includes(sp(x)));
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
/** Подписи канвасов лабораторий во всех состояниях: не мельче 10 px, внутри канваса, без наложений. */
async function labLabels(p) {
  return J(await p.eval(`(() => {
    const W = window.__l64, Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, bad = new Set(), texts = []; let minPx = 99, cur = null, boxes = [];
    Pr.fillText = function (txt, x, y) { if (cur && this.canvas === cur) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign; const X = x * t.a + t.e, Y = y * t.d + t.f, Wt = m.width * t.a, x0 = a === 'center' ? X - Wt / 2 : a === 'right' ? X - Wt : X; boxes.push({ t: String(txt), x0, x1: x0 + Wt, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, fs: fs * t.a }); } return oT.apply(this, arguments); };
    const chk = (id, name, draw) => {
      const cv = document.getElementById(id); cur = cv; boxes = []; draw(); cur = null; const dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of boxes) { texts.push(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px; if (px < 9.95) bad.add(name + ': мельче 10 px «' + q.t + '»'); if (q.x0 < 0 || q.x1 > cv.width || q.y0 < 0 || q.y1 > cv.height) bad.add(name + ': за краем «' + q.t + '»'); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ox > 1 && oy > 1) bad.add(name + ': «' + a.t + '» на «' + b.t + '»'); }
    };
    const S = W.Split, ss = S.st, sk = { f: ss.f, push: ss.push, dv: ss.dv, t: ss.t, hold: ss.hold, shown: ss.shown, pair: ss.pair }; ss.hold = true;
    ss.shown = false; chk('sCv', 'частоты до миссии', () => S.api.drawScene());
    for (const [f, push] of [[5, 'random'], [5, 'one'], [2, 'random'], [50, 'none'], [10, 'random']]) { Object.assign(ss, { f, push, dv: 0.6 }); S.api.runPair(); ss.hold = true; for (const tt of [0.3, 1.3, 2.2, 4.0, 6.8, 8.9, 9.8]) { ss.t = tt; chk('sCv', 'частоты ' + f + ' ' + push + ' ' + tt, () => S.api.drawScene()); } }
    chk('sChart', 'сводка серий', () => S.api.drawChart());
    Object.assign(ss, sk); S.api.render();
    const Bc = W.Bc, bs = Bc.st, bk = { n: bs.n, dp: bs.dp, tp: bs.tp, t: bs.t, hold: bs.hold, shown: bs.shown, k: bs.k }; bs.hold = true;
    bs.shown = false; chk('bCv', 'записи до миссии', () => Bc.api.drawScene());
    for (const key of Object.keys(bs.res)) { const [n, dp] = key.split('|'); for (const tp of [false, true]) { Object.assign(bs, { n: +n, dp: dp === '1', tp, shown: true, k: null }); bs.replay = null; Bc.api.replay(); for (const tt of [0.3, 1.5, 3.5, 6.0, 8.5]) { bs.t = tt; chk('bCv', 'записи ' + key + (tp ? ' толчки ' : ' ') + tt, () => Bc.api.drawScene()); } chk('bChart', 'сводка записей ' + key + (tp ? ' толчки' : ''), () => Bc.api.drawChart()); } }
    Object.assign(bs, bk); bs.replay = null; Bc.api.render();
    Pr.fillText = oT;
    return JSON.stringify({ bad: [...bad], minPx, texts });
  })()`));
}
const FRAMES = { stack: [0.6, 1.4, 2.6, 3.9, 5.2, 5.9, 6.5, 7.7, 8.8, 10.1, 11.2, 11.9] };
const lessonsDir = path.resolve(__dirname, '../lessons');
(async () => {
  const L1 = lab1(), L2 = lab2(1), r20 = L2['20|0'], r40 = L2['40|0'], rdp = L2['20|1'];
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^8 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    // разминка по 6.3: разделы и их названия — как в уроке 6.3
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l63 = fs.readFileSync(path.join(lessonsDir, 'l63/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l63); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.3' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.3: три вопроса, разделы и названия совпадают с h2 урока 6.3: ' + rec.q.map((q) => q.sec).join(', '));
    const lead = await text(p, '.hero .lead');
    check(/^В уроке 6\.3 Ада научилась повторять любое выполнимое движение всего тела/.test(lead) && ['HumanPlus (2024)', 'TWIST2', 'SONIC', 'Helix 02', 'урок 3.7'].every((x) => lead.includes(x)), 'шапка подхватывает мост из 6.3 и называет работы урока');
    const l63bridge = /<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(l63)[1].replace(/<[^>]+>/g, '');
    check(/модель, которая видит сцену и понимает задачу/.test(l63bridge) && lead.includes('модель, которая видит сцену и понимает задачу'), 'начало урока отвечает на мост 6.3: «модель, которая видит сцену и понимает задачу»');
    const note = await text(p, '#why .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#why .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде при первом упоминании: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href') })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /Урок 6\.5 · Аппаратная часть гуманоида: как /.test(bn[0].t) && /через 5–10 минут/.test(bn[0].t) && bn[0].a === '6-5-apparatnaya-chast.html', 'мост в конце урока: ' + bn.map((b) => `${b.sec} «${b.t.slice(0, 90)}…» → ${b.a || 'без ссылки'}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check(!(await p.eval(`/учител/i.test(document.querySelector('main').innerText)`)), 'слова «учитель» в уроке нет (поле except у термина teacher не нужно)');
    // Ада: общий рисунок из shared/ada-legs.js с теми же размерами, что тело Ады в движке; точки рисунка совпадают с позой движка
    const body = J(await p.eval(`(() => { const A = AdaBody.BODY, Bd = L64.B, eq = (a, b) => Math.abs(a - b) < 1e-9;
      const dims = eq(A.L1, Bd.L1) && eq(A.L2, Bd.L2) && eq(A.LT, Bd.LT) && eq(A.HF, Bd.HA) && eq(A.LF / 2 + A.FA, Bd.FH) && eq(A.LF / 2 - A.FA, Bd.FT) && eq(A.LT * 0.8, Bd.LS);
      let worst = 0; const ep = L64.episode('wbc', 5, 1, { keep: true });
      for (let i = 0; i < ep.frames.length; i += 9) { const fr = ep.frames[i], Q = L64.poseOf(fr), Pd = AdaBody.points(Q.f);
        for (const [a, b] of [[Pd.L.ankle, Q.ankles[0]], [Pd.R.ankle, Q.ankles[1]], [Pd.hip, [fr.x, Q.pz]]]) worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
        worst = Math.max(worst, (fr.ds || fr.st === 0) ? Math.abs(Pd.L.heel[1]) : 0, (fr.ds || fr.st === 1) ? Math.abs(Pd.R.heel[1]) : 0);
        const s = Math.sin, c = Math.cos, sh = [Q.f[0], Q.f[1] + Bd.LT * 0.3], a1 = Q.arms[2], a2 = a1 + Q.arms[3], hd = [sh[0] + s(a1) * 0.2 + s(a2) * 0.17, sh[1] - c(a1) * 0.2 - c(a2) * 0.17];
        worst = Math.max(worst, Math.hypot(hd[0] - Q.hand[0], hd[1] - Q.hand[1])); }
      return JSON.stringify({ dims, worst }); })()`));
    check(body.dims && body.worst < 1e-6, `Ада нарисована AdaBody из shared/ada-legs.js: размеры как в движке и в уроке 6.1, стопы, таз и кисть рисунка совпадают с позой движка (наибольшее расхождение ${body.worst.toExponential(1)} м)`);
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схема ----------
    const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="stack"]'); Anim.seek(cv, 1.0); const x = cv.toDataURL(); Anim.seek(cv, 9.0); return x !== cv.toDataURL(); })()`);
    check(moved, 'схема stack движется: кадры в 1 и 9 с разные');
    const sl = await schemeLabels(p, 'stack', FRAMES.stack);
    check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES.stack.length, `схема stack (широкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
    check(!sl.texts.some((x) => POS.test(x)), 'схема stack: в подписях нет слов о расположении');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="stack"]'), 2.2); true`); await show(p, 'teleop', '#teleop .flow-card', 'l64-stack.png');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="stack"]'), 8.2); true`); await show(p, 'teleop', '#teleop .flow-card', 'l64-stack-auto.png');
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен и схемы и вступления лабораторий — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map(posWord).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify(['Split', 'Bc'].flatMap((k) => window.__l64[k].missions.flatMap((m) => [m.title, m.text, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean)))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    const outs = [];

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    const S5 = L1.ser[5], S2 = L1.ser[2], S50 = L1.ser[50], m1 = L1.m1, m4 = L1.m4;
    check(!(await visible(p, '#wrapSFreq')) && !(await visible(p, '#wrapSPush')) && !(await visible(p, '#wrapSDv')), 'миссия 1: частота, толчки и сила толчка скрыты');
    check(/^Нажми кнопку миссии/.test(await text(p, '#sOut')), 'до кнопки миссии итог не показан (ставка не выдана)');
    await show(p, 'split', '#split .lab', 'l64-split-start.png');
    let r = await viaUI(p, '#sMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && m1.d.out === 'fell' && m1.w.ok && r.out.includes(`упала на ${f1(m1.d.fell)} с, а чай пролила ещё на ${f1(m1.d.spilled)} с`) && r.out.includes(`поставила чашку за ${f1(m1.w.placed)} с`), `миссия 1 (5 Гц): с планом пролила чай на ${f2(m1.d.spilled)} с и упала на ${f2(m1.d.fell)} с, с контроллером поставила чашку за ${f2(m1.w.placed)} с`);
    await p.eval(`(() => { const S = window.__l64.Split; S.st.hold = true; S.st.t = 1.3; S.api.render(); return true; })()`); await show(p, 'split', '#split .lab', 'l64-split-m1.png'); await p.eval(`window.__l64.Split.st.hold = false; true`);
    await nextMission(p, '#sMis');
    check(await visible(p, '#wrapSFreq') && !(await visible(p, '#wrapSPush')), 'миссия 2: видна частота модели, толчки скрыты');
    await seg(p, '#sFreq', '5'); r = await viaUI(p, '#sMis'); outs.push(r.out);
    check(!r.ok && r.crit[0] !== 'ok' && r.out.includes(`поставила чашку в ${f0(S5.d.placed)} прогонах из 20`), `миссия 2: одна частота (5 Гц) не засчитывается: ${r.out.slice(0, 80)}`);
    await seg(p, '#sFreq', '10'); r = await viaUI(p, '#sMis');
    await seg(p, '#sFreq', '50'); r = await viaUI(p, '#sMis'); outs.push(r.out);
    const ser = J(await p.eval(`JSON.stringify(Object.fromEntries(Object.entries(window.__l64.Split.st.series).map(([k, v]) => [k, v.placed])))`));
    check(r.ok && ser['5|direct'] === S5.d.placed && ser['50|direct'] === S50.d.placed && ser['10|wbc'] === L1.ser[10].w.placed && r.out.includes('только на 50 Гц') && r.out.includes(`50 Гц — ${f0(S50.d.placed)}`), `миссия 2: серии 5, 10 и 50 Гц как в Node (с планом ${S5.d.placed}, ${L1.ser[10].d.placed}, ${S50.d.placed} из 20), засчитано на 50 Гц`);
    await show(p, 'split', '#split .lab', 'l64-split-series.png');
    await nextMission(p, '#sMis');
    r = await viaUI(p, '#sMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && S2.w.placed >= 18 && r.out.includes(`поставила чашку в ${f0(S2.w.placed)} прогонах из 20`) && r.out.includes(`в ${f1(S2.w.err * 100)} см от отметки`) && r.out.includes(`упала в ${f0(S2.d.fell)} прогонах из 20`), `миссия 3 (2 Гц): с контроллером ${S2.w.placed} из 20 (${f1(S2.w.err * 100)} см от отметки), с планом упала в ${S2.d.fell} из 20`);
    await nextMission(p, '#sMis');
    r = await viaUI(p, '#sMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && m4.d.out === 'fell' && m4.w.ok && r.out.includes(`упала на ${f1(m4.d.fell)} с`) && r.out.includes(`поставила чашку за ${f1(m4.w.placed)} с`) && r.out.includes(`шаг вырос с ${f0(L1.stepBefore * 100)} до ${f0(L1.stepAfter * 100)} см`) && L1.stepAfter > L1.stepBefore + 0.05, `миссия 4 (толчок 168 Н): с планом упала на ${f2(m4.d.fell)} с, с контроллером поставила чашку за ${f2(m4.w.placed)} с, шаг после толчка ${f1(L1.stepAfter * 100)} см вместо ${f1(L1.stepBefore * 100)}`);
    await p.eval(`(() => { const S = window.__l64.Split; S.st.hold = true; S.st.t = 2.3; S.api.render(); return true; })()`); await show(p, 'split', '#split .lab', 'l64-split-push.png'); await p.eval(`window.__l64.Split.st.hold = false; true`);
    await nextMission(p, '#sMis');
    check(await visible(p, '#wrapSFreq') && await visible(p, '#wrapSPush') && await visible(p, '#wrapSDv'), 'свободный режим: частота, толчки и сила толчка видны');
    const sa = await text(p, '#splitAfter');
    const wbcR = FREQS.map((f) => L1.ser[f].w.placed);
    const saMiss = missing(sa, [`пролила чай на ${f1(m1.d.spilled)} с`, `на ${f1(m1.d.fell)} с упала у полки`, `поставила чашку за ${f1(m1.w.placed)} с`, `в ${f0(S5.d.spilled)} прогонах она пролила чай, в ${f0(S5.d.hit)} упёрлась в полку и в ${f0(S5.d.fell)} упала`, `на полке в ${f0(S50.d.placed)} прогонах из 20`, `ставит чашку в ${rng(wbcR)} прогонах из 20 при любой частоте модели`, `падает в ${f0(S2.d.fell)} прогонах из 20`, `в среднем в ${f1(S2.w.err * 100)} см от отметки, а на 50 Гц — в ${f1(S50.w.err * 100)} см`, `на ${f0(L1.stepAfter * 100)} см вперёд вместо ${f0(L1.stepBefore * 100)}`, `упала на ${f1(m4.d.fell)} с`, `за одно и то же время, ${f1(L1.calm.d.placed)} с`]);
    check(!saMiss.length && S5.d.placed === 0 && L1.ser[10].d.fell === 0 && L1.ser[25].d.fell === 0 && L1.ser[10].d.spilled >= 18 && L1.ser[25].d.spilled >= 18 && Math.abs(L1.calm.d.placed - L1.calm.w.placed) < 1e-9 && FREQS.filter((f) => L1.ser[f].d.placed >= 18).join() === '50', 'текст после лаборатории 1 называет те же числа и выводы' + (saMiss.length ? ' — нет: ' + saMiss.join(', ') : ''));

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapBN')) && !(await visible(p, '#wrapBDP')) && !(await visible(p, '#wrapBTP')), 'миссия 1: число записей и толчки скрыты');
    check(/^Нажми кнопку миссии/.test(await text(p, '#bOut')), 'до кнопки миссии итог не показан');
    const A20 = cnt(r20, false, 'A'), B20 = cnt(r20, false, 'B'), A40 = cnt(r40, false, 'A'), A20p = cnt(r20, true, 'A'), B20p = cnt(r20, true, 'B'), Adp = cnt(rdp, true, 'A');
    let t0 = Date.now(); r = await viaUI(p, '#bMis', 1); outs.push(r.out); const tTrain = (Date.now() - t0) / 1000;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`Политика по шагам поставила чашку в ${f0(A20.placed)} прогонах из 20`) && r.out.includes(`Политика по командам поставила чашку в ${f0(B20.placed)} прогонах из 20`) && r.out.includes(`в ${rng(E.DATA.bc[0][20].calmA)} прогонах из 20, политика по командам — в ${rng(E.DATA.bc[0][20].calmB)}`), `миссия 1 (${tTrain.toFixed(1)} с в браузере): 20 записей, по шагам ${A20.placed} из 20, по командам ${B20.placed} из 20, как в Node`);
    check(tTrain < 15, `обучение двух политик в браузере занимает несколько секунд, как сказано во вступлении: ${tTrain.toFixed(1)} с`);
    const pageRes = J(await p.eval(`JSON.stringify(window.__l64.Bc.st.res['20|0'].res)`));
    check(JSON.stringify(pageRes.calm.A.runs) === JSON.stringify(A20.runs) && JSON.stringify(pageRes.push.B.runs) === JSON.stringify(B20p.runs), 'исходы всех 40 проверок на странице совпадают с Node бит в бит');
    await p.eval(`(() => { const Bc = window.__l64.Bc; Bc.st.hold = true; Bc.st.t = 3.0; Bc.api.render(); return true; })()`); await show(p, 'bc', '#bc .lab', 'l64-bc-m1.png'); await p.eval(`window.__l64.Bc.st.hold = false; true`);
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBN') && !(await visible(p, '#wrapBDP')), 'миссия 2: видно число записей, толчки скрыты');
    r = await viaUI(p, '#bMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`С 40 записями политика по шагам поставила чашку в ${f0(A40.placed)} прогонах из 20`), `миссия 2: 40 записей, по шагам ${A40.placed} из 20`);
    await nextMission(p, '#bMis');
    r = await viaUI(p, '#bMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`С толчками политика по шагам поставила чашку в ${f0(A20p.placed)} прогонах из 20, а политика по командам — в ${f0(B20p.placed)} и ни разу не упала`) && B20p.fell === 0, `миссия 3: с толчками по шагам ${A20p.placed}, по командам ${B20p.placed} из 20 без падений`);
    await nextMission(p, '#bMis');
    r = await viaUI(p, '#bMis', 0); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`политика по шагам поставила чашку в ${f0(Adp.placed)} прогонах из 20 с толчками`) && r.out.includes(`в ${rng(E.DATA.bc[1][20].pushA)}`), `миссия 4: записи с толчками, по шагам ${Adp.placed} из 20 с толчками`);
    await p.eval(`(() => { const Bc = window.__l64.Bc; Bc.st.hold = true; Bc.st.t = 3.0; Bc.api.render(); return true; })()`); await show(p, 'bc', '#bc .lab', 'l64-bc-m4.png'); await p.eval(`window.__l64.Bc.st.hold = false; true`);
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBN') && await visible(p, '#wrapBDP') && await visible(p, '#wrapBTP'), 'свободный режим: число записей и оба переключателя толчков видны');
    const ba = await text(p, '#bcAfter'), D0 = E.DATA.bc[0], D1 = E.DATA.bc[1];
    const baMiss = missing(ba, [`чашку в ${f0(A20.placed)} прогонах из 20: в ${f0(A20.hit)} она не затормозила вовремя и упёрлась в полку, в ${f0(A20.miss)} остановилась не у отметки, а в одной упала`, `С 40 записями политика по шагам справилась в ${f0(A40.placed)} прогонах из 20`, `в ${rng(D0[5].calmA)} прогонах при 5 записях, в ${rng(D0[10].calmA)} при 10, в ${rng(D0[20].calmA)} при 20 и в ${rng(D0[40].calmA)} при 40`, `справилась в одном прогоне из 20`, `в 20 прогонах из 20, а на зёрнах 1–10 — в ${rng(D1[20].pushA)}`]);
    check(!baMiss.length && A20.fell === 1 && B20.placed === 20 && A20p.placed === 1 && B20p.placed === 20 && Adp.placed === 20 && [10, 20, 40].every((n) => D0[n].calmB.every((v) => v === 20)), 'текст после лаборатории 2 называет те же числа' + (baMiss.length ? ' — нет: ' + baMiss.join(', ') : ''));
    const deep2 = await text(p, '#bcSeeds');
    check(deep2.includes(sp(bcSeedText(E.DATA.bc))), '«Под капотом» лаборатории 2: диапазоны по зёрнам 1–10 совпадают со вшитой таблицей');
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map(posWord).join(', ') : ''));
    const ll = await labLabels(p);
    check(!ll.bad.length && ll.minPx >= 9.95, `канвасы лабораторий (компьютер): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ll.minPx.toFixed(1)})` + (ll.bad.length ? ': ' + ll.bad.slice(0, 4).join('; ') : ''));
    check(!ll.texts.some((x) => POS.test(x)), 'канвасы лабораторий: в подписях нет слов о расположении');

    // ---------- интерактив, итоги, квиз, глоссарий, формулы, консоль ----------
    const sort = J(await p.eval(`(() => { const I = window.__l64.IFACE; for (const it of I.items) I.ctl.place(it.id, it.target); I.ctl.check(); return JSON.stringify({ n: I.items.length, out: document.querySelector('#ifaceSort .c-out').textContent }); })()`));
    check(/^\d+ из \d+\. Всё верно\./.test(sp(sort.out).trim()) && sort.n === 10, 'интерактив: десять систем раскладываются по четырём корзинам, разбор показывается: ' + sp(sort.out).slice(0, 70));
    await show(p, 'iface', '#ifaceSort', 'l64-iface.png');
    const fin = await text(p, '#finale .takeaways');
    const finMiss = missing(fin, ['не донесла чашку ни в одном из 20 прогонов', `в ${rng(wbcR)} прогонах из 20 даже на 2 Гц`, `ставила чашку в ${f0(A20.placed)} прогонах из 20`, '68% успеха против 27%', 'в 6 попытках из 10']);
    check(!finMiss.length && S5.d.placed === 0, 'итоги урока называют числа лабораторий и статей' + (finMiss.length ? ' — нет: ' + finMiss.join(', ') : ''));
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l64.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел');
    const answers = J(await p.eval(`JSON.stringify(window.__l64.QUIZ.map((q) => q.a))`));
    check(new Set(answers).size >= 2, 'квиз: верные ответы стоят на разных местах в данных: ' + answers.join(''));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    const links = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('http') && !h.startsWith('#')))`));
    check(links.every((h) => /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h)) && links.includes('6-5-apparatnaya-chast.html'), 'ссылки на уроки курса: ' + [...new Set(links)].join(', '));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    await p.eval(`(() => { const W = window.__l64; W.Split.api.set({ f: 5, push: 'random' }); W.Split.api.runPair(); W.Split.st.hold = true; W.Split.st.t = 1.3; W.Split.api.render(); W.Bc.st.hold = true; W.Bc.st.t = 3.0; W.Bc.api.render(); return true; })()`);
    for (const [id, sel, n] of [['split', '#split .lab', 'l64-split-dark.png'], ['bc', '#bc .lab', 'l64-bc-dark.png'], ['teleop', '#teleop .flow-card', 'l64-stack-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l64; W.Split.api.set({ f: 5, push: 'random' }); W.Split.api.runPair(); await W.Split.api.seriesAt(5); W.Split.st.hold = true; W.Split.st.t = 1.3; W.Split.api.render(); W.Bc.api.set({ n: 20, dp: false, tp: false }); await W.Bc.api.train(); W.Bc.st.hold = true; W.Bc.st.t = 3.0; W.Bc.api.render(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const sm2 = await schemeLabels(m, 'stack', FRAMES.stack);
    check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length, `телефон, схема stack (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    const ml = await labLabels(m);
    check(!ml.bad.length && ml.minPx >= 9.95, `телефон, канвасы лабораторий: подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ml.minPx.toFixed(1)})` + (ml.bad.length ? ': ' + ml.bad.slice(0, 4).join('; ') : ''));
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['teleop', '#teleop .flow-card', 'l64-m-stack.png'], ['split', '#split .lab', 'l64-m-split.png'], ['bc', '#bc .lab', 'l64-m-bc.png'], ['iface', '#ifaceSort', 'l64-m-iface.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
