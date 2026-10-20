// Урок 6.1 «Локомоция на основе RL»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, вшитые политики сверяются пересчётом, подписи схем помещаются
// в канвас и в свои блоки и не мельче 10 px, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l61-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l61.
// node tools/lesson61.js            — проверка в headless Chrome (компьютер 1440, телефон 390, тёмная тема);
// node tools/lesson61.js --numbers  — числа лабораторий в Node (по вшитым политикам и ритму), для сверки с текстами;
// node tools/lesson61.js --seeds    — устойчивость выводов: лаборатория 3 на зёрнах 1–10, лаборатории 1–2 на 20 стартах;
// node tools/lesson61.js --train ID — обучить вшитую политику ID заново в Node и сверить веса бит в бит (5–40 минут).
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l61/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const E = require('../lessons/l61/engine.js');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const f1 = (v) => fr(v, 1), f2 = (v) => fr(v, 2), f0 = (v) => fr(v, 0);
// зёрна лабораторий (те же константы в ui-l61.js: Reward.SEED, Command.SEED, Copies.SEED)
const SEED1 = 31, SEED2 = 88, SEED3 = 2;
// слова о расположении на экране: в подписях и текстах лабораторий говорим о ролях (на телефоне раскладка другая)
const POS = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;

/* ---------- числа лабораторий в Node: те же прогоны, что на странице ---------- */
function runStats(pol, o, seed, steps, sched) {
  const Env = E.newEnv(seed, Object.assign({}, E.CFG, o)), a = new Float64Array(E.NA); let vSum = 0, tauSum = 0, hipSum = 0, pitchSum = 0, lying = 0, fell = null, t = 0; const vHist = [];
  for (; t < steps; t++) {
    if (sched) for (const [s, v] of sched) if (t === Math.round(s / E.DT)) Env.cmd = v;
    pol.act(Env.S, Env.cmd, Env.S.t, a, Env.lastA);
    const st = E.envStep(Env, a, Object.assign({}, E.CFG, o, { parts: true }));
    vSum += st.c.vx; tauSum += st.c.tau2; hipSum += st.c.hipY; pitchSum += Math.abs(st.c.pitch); if (st.c.hipY < 0.4) lying++; vHist.push(st.c.vx);
    if (st.fell && fell == null) fell = t + 1;
    if (st.done === 1) { t++; break; }
  }
  const n = Math.max(1, t);
  return { t, secs: t * E.DT, dist: Env.S.b[0], v: vSum / n, tau: tauSum / n, hip: hipSum / n, pitch: pitchSum / n, fell, lying: lying / n, cmd: Env.cmd, vHist };
}
const polRun = (id, cmd, seed, steps, sched) => { const d = E.DATA.policies[id]; return runStats(E.policy(id), { WEIGHTS: E.PRESETS[d.preset], TERMINATE: d.terminate, cmdFixed: cmd }, seed, steps, sched); };
const settleOf = (vh, v) => { const i0 = Math.round(3 / E.DT); for (let i = i0; i < vh.length - 25; i++) { let ok = true; for (let j = i; j < i + 25; j++) if (Math.abs(vh[j] - v) > 0.12) { ok = false; break; } if (ok) return (i - i0) * E.DT; } return null; };
function commandNumbers(seed) {
  const R = {};
  for (const [k, cmd, sched] of [['c03', 0.3], ['c09', 0.9], ['sched', 0.4, [[3, 0.8]]]]) {
    const L = runStats(E.policy('full512'), { WEIGHTS: E.PRESETS.full, TERMINATE: true, cmdFixed: cmd }, seed, 300, sched), Rr = runStats(E.policy('fixed'), { WEIGHTS: E.PRESETS.full, TERMINATE: true, cmdFixed: cmd }, seed, 300, sched);
    R[k] = { L, R: Rr, settle: sched ? settleOf(L.vHist, 0.8) : null, tailR: sched ? Rr.vHist.slice(200).reduce((a, v) => a + v, 0) / Math.max(1, Rr.vHist.slice(200).length) : null };
  }
  return R;
}
function labNumbers() {
  const R = { reward: {} };
  for (const id of ['fwd', 'fwdFall', 'noSmooth', 'noAir', 'full512']) R.reward[id] = polRun(id, 0.6, SEED1, 300);
  R.command = commandNumbers(SEED2);
  R.copies = copiesNumbers(SEED3);
  return R;
}
/** Лаборатория 3 в Node: ARS с бюджетом 960 для 32, 2, 8 копий, 2 копии с бюджетом 3840 и 8 копий с бюджетом 240 (как в миссиях). */
function copiesNumbers(seed) {
  const cfg = (N, budget) => { const B = Math.max(1, Math.round(N / 2)), EVAL = 3, perIter = 2 * N * EVAL; return { WEIGHTS: E.PRESETS.fwdFall, TERMINATE: true, N, B, EVAL, EP: 200, ITERS: Math.max(1, Math.floor(budget / perIter)), SEED: seed, NU: 0.4, ALPHA: 0.25 }; };
  const one = (N, budget) => { const o = cfg(N, budget), r = E.runGen(E.trainARS(o)), ev = E.evaluate(E.gaitPolicy(r.z), { WEIGHTS: E.PRESETS.fwdFall, TERMINATE: true }, 8, 9001, 200); return { N, budget, iters: o.ITERS, score: ev.ret, train: r.score, ev: { ret: ev.ret, v: ev.vMean, ok: ev.ok, dist: ev.runs.reduce((s, x) => s + x.dist, 0) / ev.runs.length } }; };
  return { r32: one(32, 960), r2: one(2, 960), r8: one(8, 960), r2x4: one(2, 3840), r8s: one(8, 240) };
}
/** Лаборатории 1 и 2 на 20 стартах (зёрна 11·s + 33): сколько стартов дают исход, обещанный миссиями. */
function startsNumbers() {
  const S = Array.from({ length: 20 }, (_, i) => (i + 1) * 11 + 33), nF = (x) => x.fell == null;
  const L1 = S.map((s) => ({ fwd: polRun('fwd', 0.6, s, 300), fall: polRun('fwdFall', 0.6, s, 300), ns: polRun('noSmooth', 0.6, s, 300), full: polRun('full512', 0.6, s, 300) }));
  const L2 = S.map((s) => commandNumbers(s));
  return {
    n: S.length,
    lie: L1.filter((x) => x.fwd.lying > 0.5 && x.fwd.v > 1).length,
    fall: L1.filter((x) => x.fall.fell != null && x.fall.fell * E.DT < 2 && x.fall.v > x.full.v).length,
    tau: L1.filter((x) => nF(x.ns) && nF(x.full) && x.ns.tau > x.full.tau * TAU_RATIO).length,
    full: L1.filter((x) => nF(x.full)).length,
    c09: L2.filter((x) => nF(x.c09.L) && Math.abs(x.c09.L.v - 0.9) < 0.1).length, c09R: L2.filter((x) => x.c09.R.fell != null || x.c09.R.v < 0.8).length,
    c03: L2.filter((x) => nF(x.c03.L) && Math.abs(x.c03.L.v - 0.3) < 0.1).length, c03R: L2.filter((x) => nF(x.c03.R) && x.c03.R.v < 0.45).length,
    tailR: L2.filter((x) => x.sched.R.fell != null || x.sched.tailR < 0.75).length,
    settle: L2.filter((x) => x.sched.settle != null && x.sched.settle < 1).length,
  };
}
const TAU_RATIO = 2;

if (process.argv.includes('--numbers')) {
  const R = labNumbers();
  const line = (s) => `${f2(s.v)} м/с, ${f1(s.dist)} м за ${f1(s.secs)} с, падение ${s.fell == null ? 'нет' : f1(s.fell * E.DT) + ' с'}, лежит ${f0(s.lying * 100)}%, бедро ${f0(s.hip * 100)} см, наклон ${f2(s.pitch)}, tau ${f0(s.tau)}`;
  for (const id in R.reward) console.log('лаб. 1', id + ':', line(R.reward[id]));
  for (const k in R.command) console.log('лаб. 2', k + ': L', line(R.command[k].L), '| R', line(R.command[k].R), '| settle', R.command[k].settle);
  const C = R.copies; for (const k in C) console.log('лаб. 3', k + ':', `N=${C[k].N} budget=${C[k].budget} iters=${C[k].iters} score=${C[k].score.toFixed(1)} ev v=${f2(C[k].ev.v)} dist=${f2(C[k].ev.dist)} ok=${C[k].ev.ok}/8`);
} else if (process.argv.includes('--seeds')) {
  const rows = []; const txt = plain();
  for (let s = 1; s <= 10; s++) { const C = copiesNumbers(s); rows.push(C); console.log(`зерно ${s}: 2 → ${C.r2.score.toFixed(0)}, 8 → ${C.r8.score.toFixed(0)}, 32 → ${C.r32.score.toFixed(0)}, 2×4 → ${C.r2x4.score.toFixed(0)}, 8/240 → ${C.r8s.score.toFixed(0)}`); }
  const n8 = rows.filter((C) => C.r8.score > C.r2.score && C.r8.score > C.r32.score).length, n8gt2 = rows.filter((C) => C.r8.score > C.r2.score).length, n8gt32 = rows.filter((C) => C.r8.score > C.r32.score).length, nA = rows.filter((C) => C.r2x4.score < C.r8.score * 0.9).length, nB = rows.filter((C) => C.r32.score > C.r8s.score).length;
  const med = (f) => { const v = rows.map(f).sort((a, b) => a - b); return (v[4] + v[5]) / 2; };
  console.log(`8 копий лучше обоих на ${n8} зёрнах из 10; лучше 2 — на ${n8gt2}; лучше 32 — на ${n8gt32}; 2×4 хуже 8 — на ${nA}; 32/960 > 8/240 — на ${nB}; медианы 2/8/32: ${med((C) => C.r2.score).toFixed(0)}/${med((C) => C.r8.score).toFixed(0)}/${med((C) => C.r32.score).toFixed(0)}`);
  check(txt.includes(`8 копий обгоняют и 2, и 32 копии на ${n8} зёрнах из 10`), `«Под капотом» лаборатории 3: 8 лучше обоих на ${n8}`);
  check(txt.includes(`лучше двух копий на ${n8gt2}, лучше 32 на ${n8gt32}`), `«Под капотом» лаборатории 3: 8 лучше 2 на ${n8gt2}, лучше 32 на ${n8gt32}`);
  check(txt.includes(`2 копии с бюджетом 3840 отстают от 8 копий с бюджетом 960 на ${nA} зёрнах из 10`), `«Под капотом» лаборатории 3: 2×4 хуже 8 на ${nA}`);
  check(txt.includes(`32 копии обгоняют 8 копий с бюджетом 240 на ${nB} зёрнах`), `«Под капотом» лаборатории 3: 32/960 > 8/240 на ${nB}`);
  check(txt.includes(`медианы по десяти зёрнам — ${med((C) => C.r2.score).toFixed(0)}, ${med((C) => C.r8.score).toFixed(0)} и ${med((C) => C.r32.score).toFixed(0)}`), '«Под капотом» лаборатории 3: медианы наград');
  const St = startsNumbers();
  console.log('старты лабораторий 1–2:', JSON.stringify(St));
  check(txt.includes(`лежит и ползёт быстрее 1 м/с на ${St.lie} стартах из ${St.n}`), `«Под капотом» лаборатории 1: «только вперёд» ползёт на ${St.lie} из ${St.n}`);
  check(txt.includes(`разгоняется и падает в первые 2 секунды на ${St.fall}`), `«Под капотом» лаборатории 1: «вперёд и падение» падает на ${St.fall}`);
  check(txt.includes(`в ${String(TAU_RATIO).replace('.', ',')} раза больше моментов на ${St.tau}`), `«Под капотом» лаборатории 1: моменты на ${St.tau}`);
  check(txt.includes(`полной наградой не падает на ${St.full} стартах из ${St.n}`), `«Под капотом» лаборатории 1: полная награда без падений на ${St.full}`);
  check(txt.includes(`держит 0,9 м/с на ${St.c09} стартах из ${St.n}, а 0,3 м/с — на ${St.c03}`), `«Под капотом» лаборатории 2: случайные команды держат 0,9 на ${St.c09}, 0,3 на ${St.c03}`);
  check(txt.includes(`быстрее чем за секунду на ${St.settle}`), `«Под капотом» лаборатории 2: выход на новую команду быстрее секунды на ${St.settle}`);
  check(txt.includes(`идёт медленнее 0,8 м/с или падает при команде 0,9 на ${St.c09R} стартах`), `«Под капотом» лаборатории 2: одна команда не догоняет 0,9 на ${St.c09R}`);
  check(txt.includes(`при команде 0,3 идёт медленнее 0,45 м/с на ${St.c03R}`), `«Под капотом» лаборатории 2: одна команда замедляется при 0,3 на ${St.c03R}`);
  check(txt.includes(`не доходит до 0,75 м/с на ${St.tailR}`), `«Под капотом» лаборатории 2: одна команда после скачка не доходит до 0,75 на ${St.tailR}`);
  fs.writeFileSync(path.resolve(__dirname, '../shots/l61-seeds.json'), JSON.stringify({ copies: rows, starts: St }));
  finish();
} else if (process.argv.includes('--train')) {
  const id = process.argv[process.argv.indexOf('--train') + 1], d = E.DATA.policies[id];
  if (!d) { console.log('нет политики', id); process.exit(1); }
  const o = { WEIGHTS: E.PRESETS[d.preset], TERMINATE: d.terminate, ITERS: d.iters, N_ENV: d.nenv, T: 24, SEED: d.seed, MB: d.nenv * 24 / 4 }; if (d.cmdFixed != null) o.cmdFixed = d.cmdFixed;
  const t0 = Date.now(), r = E.runGen(E.trainPPO(o)), got = E.packB64(E.packNet(r.A.pi)).b64;
  check(got === d.pi.b64, `политика ${id}: повторное обучение в Node (${((Date.now() - t0) / 60000).toFixed(1)} мин) даёт те же веса бит в бит`);
  finish();
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/6-1-lokomotsiya.html');
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
const chip = (p, id) => p.eval(`(() => { const b = document.querySelector('#rChips .chip[data-id="${id}"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
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
const FRAMES = { loop: [0.5, 2.2, 4.4, 6.5, 7.2, 8.6], tokens: [1.2, 3.4, 5.6, 7.1, 9.3, 11.6] };
const N = labNumbers();
(async () => {
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.7: три вопроса');
    check((await p.eval(`JSON.stringify(Object.keys(L61.DATA.policies).sort())`)) === JSON.stringify(['fixed', 'full512', 'fwd', 'fwdFall', 'noAir', 'noSmooth']), 'вшиты шесть политик: ' + await p.eval(`Object.keys(L61.DATA.policies).join(', ')`));
    check((await p.eval(`L61.CFG.SEED`)) === 1 && (await p.eval(`[window.__l61.Reward.SEED, window.__l61.Command.SEED, window.__l61.Copies.SEED].join(',')`)) === [SEED1, SEED2, SEED3].join(','), `зёрна: обучение 1, сцены лабораторий ${SEED1}, ${SEED2}, ${SEED3}`);
    const note = await text(p, '#legs .ada-note');
    check(/Ада — домашний гуманоид курса; с этого урока у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#legs .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде: с этого урока у неё ноги, ссылка на 0.1');
    const lead = await text(p, '.hero .lead');
    check(/^В уроке 5\.7 человек стоял рядом с роботом/.test(lead) && ['4096', '1500', '20 минут', '16 пар', '25%'].every((x) => lead.includes(x)), 'шапка подхватывает мост из 5.7 и называет числа статей');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href') })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /Урок 6\.2 · Имитация движений: как /.test(bn[0].t) && bn[0].a === '6-2-imitatsiya-dvizheniy.html', 'мост в конце урока: ' + bn.map((b) => `${b.sec} «${b.t.slice(0, 120)}…» → ${b.a}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; window.__l61.Reward.st.fast = true; window.__l61.Command.st.fast = true; window.__l61.Copies.st.fast = true; true`);
    // ---------- схемы ----------
    for (const [id, sec, a, b, snap] of [['loop', 'why', 1.0, 7.0, 3.0], ['tokens', 'humanoid', 2.0, 6.5, 6.5]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      const sl = await schemeLabels(p, id, FRAMES[id]);
      check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES[id].length, `схема ${id} (широкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
      check(!sl.texts.some((x) => POS.test(x)), `схема ${id}: в подписях нет слов о расположении`);
      await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="${id}"]'), ${snap}); true`);
      await show(p, sec, `#${sec} .flow-card`, `l61-${id}.png`);
    }
    await show(p, 'legs', '#legs .ada-legs', 'l61-ada.png');
    const caps = await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`).then(J);
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен и схем и вступления лабораторий — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    const misTxt = await p.eval(`JSON.stringify(['Reward', 'Command', 'Copies'].flatMap((k) => window.__l61[k].missions.flatMap((m) => [m.title, m.text, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean)))`).then(J);
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapRCmd')) && !(await visible(p, '#rPush')) && !(await visible(p, '#rRun')), 'миссия 1: ползунок команды, своя кнопка и толчок скрыты');
    await show(p, 'reward', '#reward .lab', 'l61-reward-empty.png');
    const outs = [];
    let r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const n1 = N.reward.fwd, nF = N.reward.full512;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`падает на ${f1(n1.fell * E.DT)} с`) && r.out.includes(`${f0(n1.lying * 100)}% времени лежит`) && r.out.includes(`${f2(n1.v)} м/с в среднем`) && r.out.includes(`идёт ${f2(nF.v)} м/с`), 'миссия 1 (только вперёд): ' + r.out.slice(0, 220));
    await show(p, 'reward', '#reward .lab', 'l61-reward-fwd.png');
    await nextMission(p, '#rMis');
    check(await chip(p, 'fall'), 'миссия 2: слагаемое «падение» открылось и включено');
    r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const n2 = N.reward.fwdFall;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`разгоняется до ${f2(n2.v)} м/с в среднем и падает на ${f1(n2.fell * E.DT)} с`) && r.out.includes(`полной наградой идёт ${f2(nF.v)} м/с`), 'миссия 2 (вперёд и падение): ' + r.out.slice(0, 220));
    await show(p, 'reward', '#reward .lab', 'l61-reward-fall.png');
    await nextMission(p, '#rMis');
    await chip(p, 'fwd'); for (const id of ['track', 'height', 'orient', 'zvel', 'air']) await chip(p, id);
    r = await viaUI(p, '#rMis', 1); outs.push(r.out);
    const n3 = N.reward.noSmooth;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`с этим набором ${f2(n3.v)} м/с, с полной наградой ${f2(nF.v)}`) && r.out.includes(`${f0(n3.tau)}, у Ады с полной наградой ${f0(nF.tau)}`), 'миссия 3 (осанка и шаги): ' + r.out.slice(0, 260));
    await show(p, 'reward', '#reward .lab', 'l61-reward-nosmooth.png');
    await nextMission(p, '#rMis');
    for (const id of ['torque', 'rate', 'accel']) await chip(p, id);
    r = await viaUI(p, '#rMis'); outs.push(r.out);
    check(r.ok && r.out.includes(`${f2(nF.v)} м/с, бедро на высоте ${f0(nF.hip * 100)} см`), 'миссия 4 (полная награда): ' + r.out.slice(0, 160));
    await show(p, 'reward', '#reward .lab', 'l61-reward-full.png');
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRCmd') && await visible(p, '#rPush') && await visible(p, '#rRun'), 'свободный режим: ползунок команды, своя кнопка и толчок видны');
    // свободный режим: набор «всё, кроме шагов стопы» при 0,9 м/с падает, полная награда идёт (ответ задания)
    const fr1 = J(await p.eval(`(async () => { const W = window.__l61.Reward; if (W.st.on.air) document.querySelector('#rChips .chip[data-id="air"]').click(); const sl = document.querySelector('#rCmd'); sl.value = 0.9; sl.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#rRun').click(); await new Promise((r) => setTimeout(r, 100)); for (let i = 0; i < 400 && W.st.busy; i++) await new Promise((r) => setTimeout(r, 50)); const L = W.st.last; return JSON.stringify({ id: L && L.id, fL: L && L.L.fell, fR: L && L.R.fell }); })()`, true));
    check(fr1.id === 'noAir' && fr1.fL != null && fr1.fR == null, `свободный режим лаборатории 1: без шагов стопы при 0,9 м/с Ада падает (${fr1.fL && f1(fr1.fL * E.DT)} с), с полной наградой идёт`);
    const ra = await text(p, '#rewardAfter');
    check([`${f2(n1.v)} м/с`, `${f1(n1.fell * E.DT)} с`, `${f2(n2.v)}`].every((x) => ra.includes(x)), 'вывод после лаборатории 1 называет те же числа');
    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#cmPush')) && !(await visible(p, '#cmRun')), 'миссии 1–3: толчок и своя кнопка скрыты');
    await show(p, 'command', '#command .lab', 'l61-command-empty.png');
    r = await viaUI(p, '#cmMis', 1); outs.push(r.out);
    const c9 = N.command.c09;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`идёт ${f2(c9.L.v)} м/с, а Ада с одной командой — ${f2(c9.R.v)} м/с`), 'миссия 1 (0,9 м/с): ' + r.out.slice(0, 200));
    await show(p, 'command', '#command .lab', 'l61-command-09.png');
    await nextMission(p, '#cmMis');
    r = await viaUI(p, '#cmMis', 1); outs.push(r.out);
    const c3 = N.command.c03;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`идёт ${f2(c3.L.v)} м/с, и Ада с одной командой тоже замедлилась, до ${f2(c3.R.v)} м/с`), 'миссия 2 (0,3 м/с): ' + r.out.slice(0, 200));
    await show(p, 'command', '#command .lab', 'l61-command-03.png');
    await nextMission(p, '#cmMis');
    r = await viaUI(p, '#cmMis', 0); outs.push(r.out);
    const cs = N.command.sched;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`за ${f1(cs.settle)} с`) && r.out.includes(`после скачка идёт в среднем ${f2(cs.tailR)} м/с`), 'миссия 3 (смена команды): ' + r.out.slice(0, 220));
    await show(p, 'command', '#command .lab', 'l61-command-sched.png');
    await nextMission(p, '#cmMis');
    check(await visible(p, '#cmPush') && await visible(p, '#cmRun'), 'свободный режим: толчок и своя кнопка видны');
    const ca = await text(p, '#commandAfter');
    check([`${f2(c3.L.v)}`, `${f2(c3.R.v)}`, `${f2(c9.L.v)}`, `${f2(c9.R.v)}`, `${f1(cs.settle)} с`].every((x) => ca.includes(x)), 'вывод после лаборатории 2 называет те же числа');
    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapCN')) && !(await visible(p, '#cRun')), 'миссия 1: выбор копий и своя кнопка скрыты');
    await show(p, 'copies', '#copies .lab', 'l61-copies-empty.png');
    let t0 = Date.now(); r = await viaUI(p, '#cMis', 1); outs.push(r.out);
    const C = N.copies;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`2 копии — ${f0(C.r2.score)}, 8 копий — ${f0(C.r8.score)}, 32 копии — ${f0(C.r32.score)}`) && r.out.includes(`проходит ${C.r8.ev.ok} из 8 проверочных эпизодов`), `миссия 1 (${((Date.now() - t0) / 1000).toFixed(0)} с): ` + r.out.slice(0, 200));
    await show(p, 'copies', '#copies .lab', 'l61-copies-three.png');
    await nextMission(p, '#cMis');
    t0 = Date.now(); r = await viaUI(p, '#cMis', 1); outs.push(r.out);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`2 копии за 320 обновлений набрали ${f0(C.r2x4.score)} против ${f0(C.r8.score)}`) && r.out.includes(`32 копии дают ${f0(C.r32.score)} против ${f0(C.r8s.score)}`), `миссия 2 (${((Date.now() - t0) / 1000).toFixed(0)} с): ` + r.out.slice(0, 200));
    await show(p, 'copies', '#copies .lab', 'l61-copies-budget.png');
    await nextMission(p, '#cMis');
    check(await visible(p, '#wrapCN') && await visible(p, '#wrapCBudget') && await visible(p, '#cRun'), 'свободный режим: копии, бюджет и кнопка видны');
    // свободный режим: 32 копии с бюджетом 3120 догоняют 8 копий с бюджетом 960 (ответ задания)
    const fr3 = J(await p.eval(`(async () => { const W = window.__l61.Copies; document.querySelector('#cN button[data-v="32"]').click(); const sl = document.querySelector('#cBudget'); sl.value = 3120; sl.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#cRun').click(); await new Promise((r) => setTimeout(r, 100)); for (let i = 0; i < 2000 && W.st.busy; i++) await new Promise((r) => setTimeout(r, 50)); const r = W.st.runs.find((x) => x.N === 32 && x.budget === 3120); return JSON.stringify({ s: r && r.score }); })()`, true));
    check(fr3.s > C.r8.score, `свободный режим лаборатории 3: 32 копии с бюджетом 3120 набирают ${f0(fr3.s)}, больше ${f0(C.r8.score)} у 8 копий с бюджетом 960`);
    const cpa = await text(p, '#copiesAfter');
    check([f0(C.r2.score), f0(C.r8.score), f0(C.r32.score), f0(C.r2x4.score), f0(C.r8s.score)].every((x) => cpa.includes(x)), 'вывод после лаборатории 3 называет те же числа');
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map((x) => x.match(POS)[2]).join(', ') : ''));
    // ---------- тексты ----------
    const fin = await text(p, '#finale .takeaways');
    check([`${f2(n1.v)} м/с`, `${f2(c9.R.v)} м/с`, f0(C.r8.score)].every((x) => fin.includes(x)), 'итоги урока называют числа лабораторий');
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['reward', '#reward .lab', 'l61-reward-dark.png'], ['command', '#command .lab', 'l61-command-dark.png'], ['copies', '#copies .lab', 'l61-copies-dark.png'], ['why', '#why .flow-card', 'l61-loop-dark.png'], ['humanoid', '#humanoid .flow-card', 'l61-tokens-dark.png'], ['legs', '#legs .ada-legs', 'l61-ada-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; window.__l61.Reward.st.fast = true; window.__l61.Command.st.fast = true; window.__l61.Copies.st.fast = true; true`);
    await m.eval(`(async () => { const W = window.__l61; await W.Reward.go(); await W.Command.go(0.3); await W.Copies.train(8, 960); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    for (const id of ['loop', 'tokens']) {
      const sl = await schemeLabels(m, id, FRAMES[id]);
      check(!sl.none && sl.layout === 'n' && !sl.bad.length, `телефон, схема ${id} (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
    }
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['why', '#why .flow-card', 'l61-m-loop.png'], ['humanoid', '#humanoid .flow-card', 'l61-m-tokens.png'], ['legs', '#legs .ada-legs', 'l61-m-ada.png'], ['reward', '#reward .lab', 'l61-m-reward.png'], ['command', '#command .lab', 'l61-m-command.png'], ['copies', '#copies .lab', 'l61-m-copies.png'], ['terms', '#terms .num-table', 'l61-m-terms.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
