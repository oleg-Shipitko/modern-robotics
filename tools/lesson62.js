// Урок 6.2 «Имитация движений человека»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, Ада нарисована общим рисунком (shared/ada-legs.js) и совпадает с моделью,
// подписи схем и канвасов помещаются и не мельче 10 px, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l62-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l62.
// node tools/lesson62.js             — проверка в headless Chrome (компьютер 1440, телефон 390, тёмная тема);
// node tools/lesson62.js --numbers   — числа лабораторий в Node (зерно 3), для сверки с текстами;
// node tools/lesson62.js --seeds     — устойчивость выводов лабораторий 2 и 3 на зёрнах 1–10 и диапазоны из «Под капотом»;
// node tools/lesson62.js --check     — пересчёт вшитой таблицы абляций (ABL) в Node и сверка с движком;
// node tools/lesson62.js --precompute — печать таблицы абляций JSON (вшивается в engine.js).
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l62/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const f0 = (v) => fr(v, 0), f1 = (v) => fr(v, 1), f2 = (v) => fr(v, 2);
const E = require('../lessons/l62/engine.js');
// слова о расположении на экране: в подписях и текстах лабораторий говорим о ролях (на телефоне раскладка другая)
const POS = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;

/* ---------- числа лабораторий в Node: те же расчёты, что на странице ---------- */
function rtNumbers() {
  const M = (motion, method, body) => E.rtMetrics(E.retarget(E.clipOf(E.HUMAN, motion), method, body ? Object.assign({}, E.ADA, body) : E.ADA));
  return { walkCopy: M('walk', 'copy'), squatCopy: M('squat', 'copy'), squatClamp: M('squat', 'clamp'), squatFix: M('squat', 'fix'), freeCopy: M('walk', 'copy', { L2: 0.20 }), freeFix: M('walk', 'fix', { L2: 0.20 }), humanV: E.clipOf(E.HUMAN, 'walk').v };
}
const freqAmp = (R, C, vf) => R.p[E.IDX.f0] + R.p[E.IDX.f1] * (C.v * vf - C.v);
function trainNumbers(seed) {
  const A = E.adaClip('walk'), B = E.swapLegs(A), M = E.meanClip(A, B), o = { SEED: seed };
  const T = E.run(E.train({ kind: 'track', clips: [A] }, o)), P = E.run(E.train({ kind: 'amp', clips: [A] }, o));
  const Mm = E.run(E.train({ kind: 'track', clips: [M] }, o)), Mx = E.run(E.train({ kind: 'track', clips: [A, B] }, o));
  const sm = (e) => ({ v: e.vMean, dist: e.dist, fell: e.fell, fellAt: e.fellAt, align: e.alignErr, rI: e.retI, rS: e.retS, stride: e.stride, lift: e.lift });
  const VF = [0.5, 0.75, 1, 1.25, 1.5], ev = (R) => Object.fromEntries(VF.map((vf) => [vf, sm(E.evaluate(R, vf))]));
  return { seed, clip: { v: A.v, f: A.f }, track: { ev: ev(T) }, amp: { ev: ev(P), f: VF.map((vf) => freqAmp(P, A, vf)), f0: P.p[E.IDX.f0], f1: P.p[E.IDX.f1], dacc: P.hist[P.hist.length - 1].dacc },
    mean: sm(E.evaluate(Mm, 1)), max: sm(E.evaluate(Mx, 1)) };
}
function ablCompute() {
  const A = E.adaClip('walk'), res = {};
  for (const [name, o] of [['both', {}], ['et', { RSI: false }], ['rsi', { ET: false }], ['none', { RSI: false, ET: false }]]) {
    res[name] = [];
    for (const seed of [1, 2, 3]) {
      const R = E.run(E.train({ kind: 'track', clips: [A] }, Object.assign({ SEED: seed }, o))), ev = E.evaluate(R, 1);
      const tail = R.hist.slice(Math.floor(R.hist.length * 2 / 3)), mRet = tail.reduce((a, h) => a + h.ret, 0) / tail.length;
      res[name].push({ seed, ret: +ev.ret.toFixed(3), rI: +ev.retI.toFixed(3), dist: +ev.dist.toFixed(2), v: +ev.vMean.toFixed(2), fell: ev.fellAt, align: +ev.alignErr.toFixed(1), tail: +mRet.toFixed(3), falls: R.hist.filter((h) => h.fell != null).length });
    }
  }
  return res;
}
/** Сводка по зёрнам для «Под капотом» лабораторий 2 и 3 — те же фразы, что в уроке. */
function seedTexts(S) {
  const n = S.length, mm = (f, d) => { const v = S.map(f); return `${fr(Math.min(...v), d)}–${fr(Math.max(...v), d)}`; }, cnt = (f) => S.filter(f).length;
  const walk = cnt((r) => !r.track.ev[1].fell && !r.amp.ev[1].fell && r.track.ev[1].dist >= 2 && r.amp.ev[1].dist >= 2);
  const distAll = S.flatMap((r) => [r.track.ev[1].dist, r.amp.ev[1].dist]);
  const alW = cnt((r) => r.amp.ev[1].align > r.track.ev[1].align);
  const fast = cnt((r) => !r.amp.ev[1.25].fell && r.amp.ev[1.25].v > r.track.ev[1.25].v);
  const fUp = cnt((r) => r.amp.f[3] > r.amp.f[2] && r.amp.f[2] > r.amp.f[1]);
  const fOwn = cnt((r) => Math.abs(r.amp.f[2] - r.clip.f) > 0.03);
  const up075 = cnt((r) => !r.track.ev[0.75].fell && !r.amp.ev[0.75].fell);
  const span = cnt((r) => !r.amp.ev[0.75].fell && !r.amp.ev[1.25].fell && (r.amp.ev[1.25].v - r.amp.ev[0.75].v) > (r.track.ev[1.25].v - r.track.ev[0.75].v));
  const all = (k) => k === n, wN = (k) => (all(k) ? 'на всех десяти зёрнах' : `на ${k} зёрнах из ${n}`);
  const t2 = `На зёрнах 1–10 обе политики при команде записи ${all(walk) ? 'идут без падения' : `идут без падения ${wN(walk)}`} и проходят ${fr(Math.min(...distAll), 1)}–${fr(Math.max(...distAll), 1)} м за 4 с. Ошибка позы после выравнивания у трекера ${mm((r) => r.track.ev[1].align, 1)}°, у политики AMP ${mm((r) => r.amp.ev[1].align, 1)}°, и ${all(alW) ? 'на каждом зерне у AMP она выше' : `у AMP она выше ${wN(alW)}`}. При команде записи цикл шага у политики AMP ${mm((r) => r.amp.f[2], 2)} Гц, и от частоты записи, ${fr(S[0].clip.f, 2)} Гц, он отличается больше чем на 0,03 Гц ${wN(fOwn)}. При команде 1,25× политика AMP быстрее трекера ${wN(fast)} (${mm((r) => r.amp.ev[1.25].v, 2)} против ${mm((r) => r.track.ev[1.25].v, 2)} м/с), а шагать чаще с ростом команды она научилась ${all(fUp) ? 'на всех десяти' : wN(fUp)}: при 1,25× цикл шага у неё ${mm((r) => r.amp.f[3], 2)} Гц. Между командами 0,75× и 1,25× её скорость меняется сильнее, чем у трекера, ${all(span) ? 'тоже на всех десяти' : wN(span)}, ${all(up075) ? 'и при 0,75× не падает ни одна политика' : `а при 0,75× обе политики не падают ${wN(up075)}`}.`;
  const ok3 = cnt((r) => !r.mean.fell && !r.max.fell && r.mean.dist >= 2 && r.max.dist >= 2), rIw = cnt((r) => r.mean.rI < r.max.rI - 0.1), alw = cnt((r) => r.mean.align > r.max.align), both3 = cnt((r) => r.mean.rI < r.max.rI - 0.1 && r.mean.align > r.max.align);
  const t3 = `На зёрнах 1–10 оба трекера ${all(ok3) ? 'идут без падения' : `идут без падения ${wN(ok3)}`}. Награда за имитацию у трекера по среднему ${mm((r) => r.mean.rI, 2)} против ${mm((r) => r.max.rI, 2)} у трекера с максимумом, ошибка позы ${mm((r) => r.mean.align, 1)}° против ${mm((r) => r.max.align, 1)}°, и ${all(both3) ? 'на каждом зерне трекер по среднему хуже по обеим метрикам' : `трекер по среднему хуже по обеим метрикам ${wN(both3)}`}. Размах шага у него ${mm((r) => r.mean.stride, 0)} см, хотя в его записи он равен нулю.`;
  return { t2, t3, stats: { walk, alW, fOwn, fast, fUp, up075, span, ok3, rIw, alw, n } };
}

if (process.argv.includes('--precompute')) {
  process.stdout.write(JSON.stringify(ablCompute()) + '\n');
} else if (process.argv.includes('--check')) {
  const t0 = Date.now(), got = ablCompute(), want = E.ABL;
  check(JSON.stringify(got) === JSON.stringify(want), `таблица абляций ABL совпадает с пересчётом бит в бит (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  if (JSON.stringify(got) !== JSON.stringify(want)) console.log(JSON.stringify(got));
  finish();
} else if (process.argv.includes('--numbers')) {
  const R = rtNumbers(), N = trainNumbers(E.CFG.SEED);
  const rt = (k) => { const m = R[k]; return `под полом ${f1(m.pen)} см, над полом ${f1(m.float)} см, за пределами ${f0(m.overShare * 100)}% (бедро ${f0(m.overJ[0])}°, колено ${f0(m.overJ[1])}°, голеностоп ${f0(m.overJ[2])}°), точки ${f1(m.kp)} см, центр масс ${m.com == null ? '—' : f1(m.com) + ' см ' + (m.comFwd ? 'вперёд' : 'назад') + ' в ' + f0(m.comShare * 100) + '%'}, корпус ${f0(m.lean)}°`; };
  for (const k of ['walkCopy', 'squatCopy', 'squatClamp', 'squatFix', 'freeCopy', 'freeFix']) console.log('лаб. 1', k + ':', rt(k));
  console.log('лаб. 1 скорость человека', f2(R.humanV), 'м/с; запись Ады', f2(N.clip.v), 'м/с,', f2(N.clip.f), 'Гц');
  const e = (x) => `${f2(x.v)} м/с, ${f2(x.dist)} м${x.fell ? ', падение ' + f1(x.fellAt * E.DT) + ' с' : ''}, поза ${f1(x.align)}°, имитация ${f2(x.rI)}, стиль ${f2(x.rS)}, шаг ${f0(x.stride)} см`;
  for (const vf of [0.5, 0.75, 1, 1.25, 1.5]) console.log('лаб. 2', vf + '×', '(' + f2(N.clip.v * vf) + ' м/с): трекер', e(N.track.ev[vf]), '| AMP', e(N.amp.ev[vf]));
  console.log('лаб. 2 AMP частота при 0,5…1,5×:', N.amp.f.map((x) => f2(x)).join(' / '), 'Гц; дискриминатор', JSON.stringify(N.amp.dacc));
  console.log('лаб. 3 по среднему:', e(N.mean), '| максимум:', e(N.max));
  for (const off of [0.4, 0.5]) { const m = E.mixStats(E.adaClip('walk'), off); console.log('лаб. 3 сдвиг', off, 'шаг', f1(m.stride), 'см, стопы', f1(m.lift), 'см'); }
} else if (process.argv.includes('--seed')) {
  process.stdout.write(JSON.stringify(trainNumbers(+process.argv[process.argv.indexOf('--seed') + 1])));
} else if (process.argv.includes('--seeds')) {
  /* ---------- пять пар процессов: зёрна 1–10 в Node, результат — shots/l62-seeds.json ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R = {};
  const runOne = (s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed', String(s)], { maxBuffer: 1 << 26 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    const t0 = Date.now(); let i = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (i < seeds.length) { const s = seeds[i++]; const r = await runOne(s); R[s] = r;
      console.log(`зерно ${s}: трекер ${f2(r.track.ev[1].v)} м/с (${f1(r.track.ev[1].align)}°), AMP ${f2(r.amp.ev[1].v)} м/с (${f1(r.amp.ev[1].align)}°, ${f2(r.amp.f[2])} Гц); 1,25×: ${f2(r.track.ev[1.25].v)}${r.track.ev[1.25].fell ? '↓' : ''} / ${f2(r.amp.ev[1.25].v)}${r.amp.ev[1.25].fell ? '↓' : ''}; 0,75×: ${f2(r.track.ev[0.75].v)}${r.track.ev[0.75].fell ? '↓' : ''} / ${f2(r.amp.ev[0.75].v)}${r.amp.ev[0.75].fell ? '↓' : ''}; лаб. 3: имитация ${f2(r.mean.rI)} / ${f2(r.max.rI)}, поза ${f1(r.mean.align)}° / ${f1(r.max.align)}°, шаг ${f0(r.mean.stride)} см`); } }));
    console.log(`время ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    const S = seeds.map((s) => R[s]), T = seedTexts(S), txt = plain();
    fs.writeFileSync(path.resolve(__dirname, '../shots/l62-seeds.json'), JSON.stringify({ seeds: R, stats: T.stats }));
    console.log('лаб. 2:', T.t2); console.log('лаб. 3:', T.t3);
    check(txt.includes(sp(T.t2)), '«Под капотом» лаборатории 2 называет диапазоны по зёрнам 1–10');
    check(txt.includes(sp(T.t3)), '«Под капотом» лаборатории 3 называет диапазоны по зёрнам 1–10');
    check(T.stats.walk === 10 && T.stats.ok3 === 10, `обе политики и оба трекера идут без падения на всех зёрнах: ${T.stats.walk}, ${T.stats.ok3}`);
    check(T.stats.fast >= 8 && T.stats.fUp >= 8 && T.stats.rIw >= 8, `выводы миссий держатся хотя бы на 8 зёрнах из 10: AMP быстрее при 1,25× — ${T.stats.fast}, шагает чаще — ${T.stats.fUp}, имитация у среднего ниже — ${T.stats.rIw}`);
    const s3 = R[E.CFG.SEED];
    check(!s3.amp.ev[1.25].fell && s3.amp.ev[1.25].v > s3.track.ev[1.25].v && s3.mean.rI < s3.max.rI - 0.1 && s3.amp.ev[1].align > s3.track.ev[1].align, `на зерне лабораторий (${E.CFG.SEED}) выполняются все выводы миссий`);
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/6-2-imitatsiya-dvizheniy.html');
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 6000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const missing = (s, list) => list.filter((x) => !s.includes(sp(x)));
/** «a, b и c» */
const andList = (arr) => arr.slice(0, -1).join(', ') + ' и ' + arr[arr.length - 1];
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
/** Подписи канвасов лабораторий во всех состояниях: не мельче 10 px, внутри канваса, без наложений (после обучения политик). */
async function labLabels(p) {
  return J(await p.eval(`(() => {
    const W = window.__l62, Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, bad = new Set(), texts = []; let minPx = 99, cur = null, boxes = [];
    Pr.fillText = function (txt, x, y) { if (cur && this.canvas === cur) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign; const X = x * t.a + t.e, Y = y * t.d + t.f, Wt = m.width * t.a, x0 = a === 'center' ? X - Wt / 2 : a === 'right' ? X - Wt : X; boxes.push({ t: String(txt), x0, x1: x0 + Wt, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, fs: fs * t.a }); } return oT.apply(this, arguments); };
    const chk = (id, name, draw) => {
      const cv = document.getElementById(id); cur = cv; boxes = []; draw(); cur = null; const dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of boxes) { texts.push(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px; if (px < 9.95) bad.add(name + ': мельче 10 px «' + q.t + '»'); if (q.x0 < 0 || q.x1 > cv.width || q.y0 < 0 || q.y1 > cv.height) bad.add(name + ': за краем «' + q.t + '»'); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ox > 1 && oy > 1) bad.add(name + ': «' + a.t + '» на «' + b.t + '»'); }
    };
    const R = W.Retarget, st = R.st, keep = { motion: st.motion, method: st.method, phi: st.phi, L1: st.L1, L2: st.L2, shown: st.shown };
    st.shown = false; chk('rCvA', 'Ада до миссии', () => R.api.render()); st.shown = true;
    for (const [mo, me] of [['walk', 'copy'], ['squat', 'copy'], ['squat', 'clamp'], ['squat', 'fix'], ['wave', 'fix']]) for (const ph of [0.1, 0.35, 0.5, 0.75]) { st.motion = mo; st.method = me; st.phi = ph; chk('rCvH', 'человек ' + mo, () => R.api.render()); chk('rCvA', 'Ада ' + mo + '/' + me, () => R.api.render()); }
    st.L2 = 0.2; st.motion = 'walk'; st.method = 'copy'; for (const ph of [0.2, 0.6]) { st.phi = ph; chk('rCvA', 'Ада с голенью 20 см', () => R.api.render()); }
    Object.assign(st, keep); R.api.render();
    const T = W.Track, tk = { pol: T.st.pol, vf: T.st.vf, t: T.st.t, view: T.st.view };
    for (const pol of ['track', 'amp']) for (const vf of [0.5, 1, 1.25]) for (const tt of [0.3, 2.5]) { Object.assign(T.st, { pol, vf, t: tt }); chk('tCv', 'сцена ' + pol, () => T.api.render()); }
    for (const view of ['curve', 'speed']) { T.st.view = view; chk('tChart', 'сводка ' + view, () => T.api.render()); }
    Object.assign(T.st, tk); T.api.render();
    const M = W.Mix, mk = { mode: M.st.mode, off: M.st.off, t: M.st.t };
    for (const off of [0, 0.25, 0.5]) { Object.assign(M.st, { mode: 'kin', off }); chk('mCv', 'среднее ' + off, () => M.api.render()); }
    M.st.mode = 'pol'; for (const tt of [0.5, 2]) { M.st.t = tt; chk('mCv', 'трекеры', () => M.api.render()); }
    Object.assign(M.st, mk); M.api.render();
    Pr.fillText = oT;
    return JSON.stringify({ bad: [...bad], minPx, texts });
  })()`));
}
const FRAMES = { mimic: [0.5, 2.2, 4.3, 6.9, 7.2, 9.5, 11.6], amp: [0.8, 2.4, 4.6, 6.5, 7.4, 9.1] };
const RT = rtNumbers(), N = trainNumbers(E.CFG.SEED);
const lessonsDir = path.resolve(__dirname, '../lessons');
(async () => {
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    // разминка по 6.1: разделы и их названия — как в уроке 6.1
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l61 = fs.readFileSync(path.join(lessonsDir, 'l61/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l61); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.1' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.1: три вопроса, разделы и названия совпадают с h2 урока 6.1: ' + rec.q.map((q) => q.sec).join(', '));
    const lead = await text(p, '.hero .lead');
    check(/^В уроке 6\.1 Ада с наградой из девяти слагаемых/.test(lead) && ['3,4 шага в секунду по 18 см', '0,5–5 секундам', '60 миллионов', 'ExBody (2024)'].every((x) => lead.includes(x)), 'шапка подхватывает мост из 6.1 и называет числа статей');
    const note = await text(p, '#natural .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#natural .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href') })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /Урок 6\.3 · Управление всем телом: как /.test(bn[0].t) && bn[0].a === '6-3-upravlenie-vsem-telom.html', 'мост в конце урока: ' + bn.map((b) => `${b.sec} «${b.t.slice(0, 100)}…» → ${b.a}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check((await p.eval(`L62.CFG.SEED`)) === 3 && (await p.eval(`L62.CFG.ITERS`)) === 100, 'зерно 3, 100 итераций');
    // Ада: общий рисунок из shared/ada-legs.js с теми же размерами, что тело Ады в движке, и точки рисунка совпадают с моделью
    const body = J(await p.eval(`(() => { const B = AdaBody.BODY, A = L62.ADA, eq = (a, b) => Math.abs(a - b) < 1e-9;
      const dims = eq(B.L1, A.L1) && eq(B.L2, A.L2) && eq(B.LT, A.LT) && eq(B.HF, A.HA) && eq(B.LF / 2 + B.FA, A.FH) && eq(B.LF / 2 - B.FA, A.FT) && eq(B.LT + 0.02 + B.HEAD / 2, A.HC);
      let worst = 0; const H = L62.clipOf(L62.HUMAN, 'squat'), R = L62.retarget(H, 'fix');
      for (const f of R.frames.filter((_, i) => i % 9 === 0)) { const pose = { x: 0.3, y: f.y, th: f.th, q: f.q, arm: f.arm }, Pe = L62.fk(A, pose), Pd = AdaBody.points(window.__l62.Fig.frame(pose));
        for (const [a, b] of [[Pe.hip, Pd.hip], [Pe.kneeL, Pd.L.knee], [Pe.ankleL, Pd.L.ankle], [Pe.heelL, Pd.L.heel], [Pe.toeL, Pd.L.toe], [Pe.kneeR, Pd.R.knee], [Pe.heelR, Pd.R.heel], [Pe.toeR, Pd.R.toe], [Pe.top, Pd.top]]) worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1])); }
      return JSON.stringify({ dims, worst }); })()`));
    check(body.dims && body.worst < 1e-9, `Ада нарисована AdaBody из shared/ada-legs.js: размеры как в движке и в уроке 6.1, точки рисунка совпадают с моделью (наибольшее расхождение ${body.worst.toExponential(1)} м)`);
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b, snap] of [['mimic', 'deepmimic', 1.0, 6.9, 1.6], ['amp', 'amp', 1.0, 7.0, 2.2]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      const sl = await schemeLabels(p, id, FRAMES[id]);
      check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES[id].length, `схема ${id} (широкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
      check(!sl.texts.some((x) => POS.test(x)), `схема ${id}: в подписях нет слов о расположении`);
      await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="${id}"]'), ${snap}); true`);
      await show(p, sec, `#${sec} .flow-card`, `l62-${id}.png`);
    }
    // таблица абляций: строки из ABL, наведение
    check((await p.eval(`document.querySelectorAll('#ablOurs .num-row[data-k]').length`)) === 4, 'таблица абляций: четыре строки из ABL');
    await p.eval(`document.querySelector('#ablOurs .num-row[data-k="et"]').dispatchEvent(new Event('mouseenter')); true`);
    const ablT = await text(p, '#ablOut'), rng = (k, f, d) => { const v = E.ABL[k].map(f); return `${fr(Math.min(...v), d)}–${fr(Math.max(...v), d)}`; };
    check(/^Без старта из записи/.test(ablT) && ablT.includes(rng('et', (x) => x.ret, 2)), 'наведение на строку «только ранний останов» показывает разбор с числами: ' + ablT.slice(0, 90));
    await show(p, 'deepmimic', '#ablOurs', 'l62-abl.png');
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен и схем и вступления лабораторий — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify(['Retarget', 'Track', 'Mix'].flatMap((k) => window.__l62[k].missions.flatMap((m) => [m.title, m.text, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean)))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapRMotion')) && !(await visible(p, '#wrapRMethod')) && !(await visible(p, '#wrapRL1')), 'миссия 1: выбор записи, способа и ползунки скрыты');
    check(/^Нажми кнопку миссии/.test(await text(p, '#rOut')), 'до кнопки миссии итог переноса не показан (ставка не выдана)');
    await show(p, 'retarget', '#retarget .lab', 'l62-rt-start.png');
    const outs = [];
    let r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const w1 = RT.walkCopy;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`не больше чем на ${f1(w1.pen)} см`) && r.out.includes(`в среднем на ${f1(w1.kp)} см`), `миссия 1 (ходьба, углы как есть): под полом ${f1(w1.pen)} см, над полом ${f1(w1.float)} см, точки ${f1(w1.kp)} см`);
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const s1 = RT.squatCopy;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`В ${f0(s1.overShare * 100)}% кадров`) && r.out.includes(`до ${f0(s1.overJ[0])}°`), `миссия 2 (присед, углы как есть): бедро за пределом в ${f0(s1.overShare * 100)}% кадров, до ${f0(s1.overJ[0])}°`);
    await p.eval(`(() => { const R = window.__l62.Retarget; R.st.hold = true; R.st.phi = 0.5; R.api.render(); return true; })()`);
    await show(p, 'retarget', '#retarget .lab', 'l62-rt-squat.png');
    await p.eval(`window.__l62.Retarget.st.hold = false; true`);
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const s2 = RT.squatClamp;
    check(r.ok && /ставка сыграла/i.test(r.out) && s2.comFwd && r.out.includes(`вперёд, за носки, до ${f1(s2.com)} см в ${f0(s2.comShare * 100)}% кадров`) && r.out.includes(`на ${f1(s2.kp)} см`), `миссия 3 (присед, углы в пределах): центр масс вперёд за опору до ${f1(s2.com)} см в ${f0(s2.comShare * 100)}% кадров, точки ${f1(s2.kp)} см`);
    await p.eval(`(() => { const R = window.__l62.Retarget; R.st.hold = true; R.st.phi = 0.5; R.api.render(); return true; })()`);
    await show(p, 'retarget', '#retarget .lab', 'l62-rt-clamp.png');
    await p.eval(`window.__l62.Retarget.st.hold = false; true`);
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const s3 = RT.squatFix;
    check(r.ok && /ставка сыграла/i.test(r.out) && !s3.comFwd && r.out.includes(`всего на ${f1(s3.kp)} см против ${f1(s2.kp)}`) && r.out.includes(`выпрямить на ${f0(s3.lean)}°`) && r.out.includes(`назад, за пятки, до ${f1(s3.com)} см`), `миссия 4 (присед, точки, пределы и пол): точки ${f1(s3.kp)} см, корпус выпрямлен на ${f0(s3.lean)}°, центр масс назад до ${f1(s3.com)} см`);
    await p.eval(`(() => { const R = window.__l62.Retarget; R.st.hold = true; R.st.phi = 0.5; R.api.render(); return true; })()`);
    await show(p, 'retarget', '#retarget .lab', 'l62-rt-fix.png');
    await p.eval(`window.__l62.Retarget.st.hold = false; true`);
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRMotion') && await visible(p, '#wrapRMethod') && await visible(p, '#wrapRL1') && await visible(p, '#wrapRL2'), 'свободный режим: запись, способ и ползунки видны');
    await seg(p, '#rMotion', 'walk'); await seg(p, '#rMethod', 'copy'); await setRange(p, '#rL2', 20); await sleep(100);
    const fc = J(await p.eval(`JSON.stringify(window.__l62.Retarget.api.state())`));
    await seg(p, '#rMethod', 'fix'); await sleep(100);
    const ff = J(await p.eval(`JSON.stringify(window.__l62.Retarget.api.state())`));
    check(fc.pen > 2 && ff.pen < 0.05 && Math.abs(fc.pen - RT.freeCopy.pen) < 1e-9, `свободный режим: с голенью 20 см копирование углов уводит стопу под пол на ${f1(fc.pen)} см, подгонка точек — на ${f1(ff.pen)} см`);
    await setRange(p, '#rL2', 30); await seg(p, '#rMethod', 'copy');
    const ra = await text(p, '#retargetAfter');
    const raMiss = missing(ra, [`не больше чем на ${f1(w1.pen)} см`, `в ${f0(s1.overShare * 100)}% кадров оно за пределом, до ${f0(s1.overJ[0])}°`, `за опору до ${f1(s2.com)} см`, `с ошибкой ${f1(s3.kp)} см`, `выпрямить на ${f0(s3.lean)}°`, `за пятки до ${f1(s3.com)} см`]);
    check(!raMiss.length, 'текст после лаборатории 1 называет те же числа' + (raMiss.length ? ' — нет: ' + raMiss.join(', ') : ''));
    const deep1 = await text(p, '#retarget .deep');
    check(deep1.includes(`${f2(RT.humanV)} м/с у человека`), `«Под капотом» лаборатории 1: скорость записи человека ${f2(RT.humanV)} м/с`);

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapTPol')) && !(await visible(p, '#wrapTV')) && !(await visible(p, '#wrapTView')), 'миссия 1: политика, команда и сводка скрыты');
    await show(p, 'track', '#track .lab', 'l62-track-empty.png');
    let t0 = Date.now(); r = await viaUI(p, '#tMis', 1); outs.push(r.out);
    const tr = N.track.ev[1], am = N.amp.ev[1], Tt = (Date.now() - t0) / 1000;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`прошёл ${f2(tr.dist)} м`) && r.out.includes(`${f1(tr.align)}°`) && r.out.includes(`идёт ${f2(N.clip.v)} м/с`), `миссия 1 (${Tt.toFixed(0)} с): трекер ${f2(tr.dist)} м, ${f2(tr.v)} м/с, ${f1(tr.align)}°`);
    await show(p, 'track', '#track .lab', 'l62-track-tracker.png');
    await nextMission(p, '#tMis');
    t0 = Date.now(); r = await viaUI(p, '#tMis', 1); outs.push(r.out);
    const Ta = (Date.now() - t0) / 1000;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`${f2(N.amp.f[2])} Гц против ${f2(N.clip.f)} Гц`) && r.out.includes(`${f1(am.align)}° против ${f1(tr.align)}°`) && r.out.includes(`проверке ${f2(am.rS)}`) && r.out.includes(`в ${f0(N.amp.dacc.accR * 100)}% случаев`), `миссия 2 (${Ta.toFixed(0)} с): AMP ${f2(am.dist)} м, ${f2(N.amp.f[2])} Гц, ${f1(am.align)}°, стиль ${f2(am.rS)}`);
    await show(p, 'track', '#track .lab', 'l62-track-amp.png');
    await nextMission(p, '#tMis');
    r = await viaUI(p, '#tMis', 1); outs.push(r.out);
    const vs = [0.75, 1, 1.25];
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`трекер идёт ${vs.map((vf) => f2(N.track.ev[vf].v)).join(', ')} м/с, AMP — ${vs.map((vf) => f2(N.amp.ev[vf].v)).join(', ')} м/с`) && r.out.includes(`${vs.map((vf, i) => f2(N.amp.f[i + 1])).join(', ')} Гц`), `миссия 3: трекер ${vs.map((vf) => f2(N.track.ev[vf].v)).join('/')}, AMP ${vs.map((vf) => f2(N.amp.ev[vf].v)).join('/')}, частота AMP ${N.amp.f.slice(1, 4).map((x) => f2(x)).join('/')} Гц`);
    await show(p, 'track', '#track .lab', 'l62-track-speed.png');
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTPol') && await visible(p, '#wrapTV') && await visible(p, '#wrapTView'), 'свободный режим: политика, команда и сводка видны');
    await setRange(p, '#tV', 50); await seg(p, '#tPol', 'track'); await sleep(200);
    const to = await text(p, '#tOut');
    check(N.track.ev[0.5].fell && to.includes(`команде ${f2(N.clip.v * 0.5)} м/с`) && /трекер записи[^.]*упала/.test(to), `свободный режим: при команде 0,5× трекер падает (${f1(N.track.ev[0.5].fellAt * E.DT)} с) — ответ задания «найди команду, при которой политика падает»`);
    await setRange(p, '#tV', 100);
    const ta = await text(p, '#trackAfter');
    const taMiss = missing(ta, [`проходит ${f2(tr.dist)} м`, `${f2(tr.v)} м/с`, `${f1(tr.align)}°`, `проходит ${f2(am.dist)} м`, `${f2(N.amp.f[2])} Гц против ${f2(N.clip.f)}`, `${f1(am.align)}°`, `стиля в проверке ${f2(am.rS)}`, `трекер идёт ${andList(vs.map((vf) => f2(N.track.ev[vf].v)))} м/с`, `AMP ${andList(vs.map((vf) => f2(N.amp.ev[vf].v)))} м/с`, `${andList(N.amp.f.slice(1, 4).map((x) => f2(x)))} Гц`]);
    check(!taMiss.length, 'текст после лаборатории 2 называет те же числа' + (taMiss.length ? ' — нет: ' + taMiss.join(', ') : ''));
    const intro2 = await text(p, '#track .lab-intro');
    check(intro2.includes(`скоростью ${f2(N.clip.v)} м/с`) && intro2.includes(`${f2(N.clip.f)} цикла в секунду`), `вступление лаборатории 2: запись ${f2(N.clip.v)} м/с, ${f2(N.clip.f)} Гц`);

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapMOff')) && !(await visible(p, '#wrapMMode')), 'миссия 1: ползунок сдвига и переключатель сцены скрыты до ставки');
    await show(p, 'mix', '#mix .lab', 'l62-mix-start.png');
    r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    const mx = E.mixStats(E.adaClip('walk'), 0.5);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`размах шага у среднего ${f0(mx.stride)} см`), `миссия 1: размах шага среднего ${f0(mx.stride)} см`);
    await show(p, 'mix', '#mix .lab', 'l62-mix-mean.png');
    await nextMission(p, '#mMis');
    check(await visible(p, '#wrapMOff'), 'миссия 2: ползунок сдвига виден');
    t0 = Date.now(); r = await viaUI(p, '#mMis', 1); outs.push(r.out);
    const mm = N.mean, xx = N.max;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`прошёл ${f2(mm.dist)} м и шагает с размахом ${f0(mm.stride)} см`) && r.out.includes(`${f2(mm.rI)} против ${f2(xx.rI)}`) && r.out.includes(`${f1(mm.align)}° против ${f1(xx.align)}°`), `миссия 2 (${((Date.now() - t0) / 1000).toFixed(0)} с): по среднему ${f2(mm.dist)} м, шаг ${f0(mm.stride)} см, имитация ${f2(mm.rI)}; максимум ${f2(xx.dist)} м, имитация ${f2(xx.rI)}`);
    await p.eval(`(() => { const M = window.__l62.Mix; M.st.hold = true; M.st.t = 1.6; M.api.render(); return true; })()`);
    await show(p, 'mix', '#mix .lab', 'l62-mix-two.png');
    await p.eval(`window.__l62.Mix.st.hold = false; true`);
    await nextMission(p, '#mMis');
    check(await visible(p, '#wrapMOff') && await visible(p, '#wrapMMode'), 'свободный режим: ползунок и переключатель сцены видны');
    await setRange(p, '#mOff', 40); await sleep(100);
    const half = J(await p.eval(`JSON.stringify(window.__l62.Mix.api.state())`)), s0 = E.mixStats(E.adaClip('walk'), 0);
    check(Math.abs(half.stride - s0.stride / 2) < 2, `свободный режим: при сдвиге 40% размах шага среднего ${f0(half.stride)} см — вдвое меньше ${f0(s0.stride)} см (ответ задания)`);
    const ma = await text(p, '#mixAfter');
    const maMiss = missing(ma, [`размах шага ${f0(mx.stride)} см`, `${f2(mm.dist)} м за 4 секунды`, `размахом ${f0(mm.stride)} см`, `${f2(mm.rI)} против ${f2(xx.rI)}`, `${f1(mm.align)}° против ${f1(xx.align)}°`]);
    check(!maMiss.length, 'текст после лаборатории 3 называет те же числа' + (maMiss.length ? ' — нет: ' + maMiss.join(', ') : ''));
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    const ll = await labLabels(p);
    check(!ll.bad.length && ll.minPx >= 9.95, `канвасы лабораторий (компьютер): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ll.minPx.toFixed(1)})` + (ll.bad.length ? ': ' + ll.bad.slice(0, 4).join('; ') : ''));
    check(!ll.texts.some((x) => POS.test(x)), 'канвасы лабораторий: в подписях нет слов о расположении');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    const finMiss = missing(fin, [`не больше чем на ${f1(w1.pen)} см`, `до ${f0(s1.overJ[0])}° сверх него`, `${f1(tr.align)}°`, `${f2(N.amp.f[2])} Гц`, `${f2(N.amp.ev[1.25].v)} м/с против ${f2(N.track.ev[1.25].v)}`, `${f2(mm.rI)} против ${f2(xx.rI)}`, '0,030 против 0,018']);
    check(!finMiss.length, 'итоги урока называют числа лабораторий и статей' + (finMiss.length ? ' — нет: ' + finMiss.join(', ') : ''));
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l62.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /\d+,\d+|\d+ ?%/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел лабораторий и статей');
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 12 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    await p.eval(`(() => { const W = window.__l62; W.Retarget.st.hold = true; W.Retarget.st.motion = 'squat'; W.Retarget.st.method = 'fix'; W.Retarget.st.phi = 0.5; W.Retarget.api.render(); return true; })()`);
    for (const [id, sel, n] of [['retarget', '#retarget .lab', 'l62-rt-dark.png'], ['track', '#track .lab', 'l62-track-dark.png'], ['mix', '#mix .lab', 'l62-mix-dark.png'], ['deepmimic', '#deepmimic .flow-card', 'l62-mimic-dark.png'], ['amp', '#amp .flow-card', 'l62-amp-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l62; await W.Retarget.api.set('squat', 'fix'); W.Retarget.st.hold = true; W.Retarget.st.phi = 0.5; await W.Track.api.speeds(); W.Track.st.view = 'curve'; W.Mix.st.off = 0.5; W.Mix.api.render(); W.Retarget.api.render(); W.Track.api.render(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    for (const id of ['mimic', 'amp']) {
      const sl = await schemeLabels(m, id, FRAMES[id]);
      check(!sl.none && sl.layout === 'n' && !sl.bad.length, `телефон, схема ${id} (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
    }
    await m.eval(`(async () => { await window.__l62.Mix.api.two(); return true; })()`, true);
    const ml = await labLabels(m);
    check(!ml.bad.length && ml.minPx >= 9.95, `телефон, канвасы лабораторий: подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ml.minPx.toFixed(1)})` + (ml.bad.length ? ': ' + ml.bad.slice(0, 4).join('; ') : ''));
    await m.eval(`(() => { const W = window.__l62; W.Mix.st.mode = 'kin'; W.Mix.st.off = 0.5; W.Mix.api.render(); W.Track.st.view = 'speed'; W.Track.api.render(); return true; })()`);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['deepmimic', '#deepmimic .flow-card', 'l62-m-mimic.png'], ['amp', '#amp .flow-card', 'l62-m-amp.png'], ['retarget', '#retarget .lab', 'l62-m-rt.png'], ['track', '#track .lab', 'l62-m-track.png'], ['mix', '#mix .lab', 'l62-m-mix.png'], ['deepmimic', '#ablOurs', 'l62-m-abl.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
