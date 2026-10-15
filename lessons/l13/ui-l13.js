/* =====================================================================
   ui-l13.js — урок 1.3 «Мультимодальность действий».
   Порядок урока: сначала опыт (Ада учится у учителя, который объезжает
   чайник с двух сторон, и едет в чайник; больше данных не помогает),
   потом причина (нарисуй объезды — ответы MSE и L1), источники нескольких
   стратегий в данных (калибровка уверенности), способы выдать распределение
   (бины и авторегрессия на двух шагах объезда), лаборатория «Три Ады и чайник»,
   пачки действий (длина пачки на сцене) и их стыки (два способа на графике), квиз.
   Движок без DOM — shared/kettle-core.js, рисование — shared/kettle-draw.js,
   миссии — shared/missions.js, схемы — l13/modes.js на shared/anim.js.
   ===================================================================== */
'use strict';

/*OWNMATH-BEGIN*/
/* ---------- Своя математика для обучения в браузере ----------
   Движок урока (shared/kettle-core.js) зовёт Math.exp, Math.log, Math.tanh, Math.pow, Math.sin и Math.cos.
   В Chrome, Safari и Node они отличаются в последнем бите, а обучение раздувает разницу до разных
   чисел в лабораториях. Здесь те же функции собраны из сложений, умножений, делений и Math.sqrt
   (по IEEE 754 одинаковых везде), как в lessons/l52/engine.js, и подменяют встроенные на этой
   странице. Отличие от Math.* — не больше 1e-15. Тот же блок вызывает tools/lesson13.js в Node. */
const OwnMath = (() => {
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
  function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
  const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
  function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }
  function exp(x) {
    if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
    const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
    let sm = 1, t = 1; for (let n = 1; n <= 14; n++) { t = t * r / n; sm += t; }
    return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
  }
  function log(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
    let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
    f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
    u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    const sv = (m - 1) / (m + 1), s2 = sv * sv; let t = sv, sum = sv;
    for (let n = 3; n <= 41; n += 2) { t *= s2; sum += t / n; }
    return e * LN2_HI + (e * LN2_LO + 2 * sum);
  }
  function tanh(x) {
    const ax = x < 0 ? -x : x; let v;
    if (ax > 20) v = 1; else if (ax < 0.5) { const e = expm1Small(2 * ax); v = e / (e + 2); } else v = 1 - 2 / (exp(2 * ax) + 1);
    return x < 0 ? -v : v;
  }
  const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
  function sincos(x) {
    if (x !== x || x === Infinity || x === -Infinity) return [NaN, NaN];
    const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
    let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
    let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
    const q = ((k % 4) + 4) % 4;
    return q === 0 ? [sn, cs] : q === 1 ? [cs, -sn] : q === 2 ? [-sn, -cs] : [-cs, sn];
  }
  const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
  function atan(z) {
    let sg = 1; if (z < 0) { z = -z; sg = -1; }
    let inv = false; if (z > 1) { z = 1 / z; inv = true; }
    let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
    const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
    const a = off + sm; return sg * (inv ? PIO2 - a : a);
  }
  function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
  /** Степень: целый показатель — возведением в квадрат (точные умножения), иначе через exp и log. */
  function pow(b, e) {
    if (e === 0) return 1; if (e !== e || b !== b) return NaN;
    if (Number.isInteger(e) && Math.abs(e) < 1073741824) { let n = Math.abs(e), r = 1, x = b; while (n) { if (n & 1) r *= x; x *= x; n >>= 1; } return e < 0 ? 1 / r : r; }
    if (b < 0) return NaN; if (b === 0) return e > 0 ? 0 : Infinity;
    return exp(e * log(b));
  }
  function hypot() { let s = 0; for (let i = 0; i < arguments.length; i++) { const v = +arguments[i]; if (v === Infinity || v === -Infinity) return Infinity; s += v * v; } return Math.sqrt(s); }
  const own = { exp, log, tanh, sin: (x) => sincos(x)[0], cos: (x) => sincos(x)[1], atan2, pow, hypot };
  /** Подменить встроенные функции на странице (или в Node) на свои. */
  function install(M) { M = M || Math; for (const k of Object.keys(own)) Object.defineProperty(M, k, { value: own[k], writable: true, configurable: true }); return own; }
  return Object.assign({ install, sincos, pow2 }, own);
})();
/*OWNMATH-END*/
OwnMath.install();

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
const E = Kettle, KD = KettleDraw;
function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
const fmt1 = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
function legend(sel, items) {
  const box = $(sel); if (!box) return; box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (!el) return; if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
const reduced = () => HeroKit.reduced();
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
/** Поля графика под подписи: подписи 10,5 px на экране, k — логических единиц в пикселе. */
function plotBox(k, W, H, yt, extraB) { const n = Math.max(...yt.map((t) => t[1].length)); return { l: Math.max(30, 10 + n * 6.6 * k), r: W - 12, t: 12, b: H - Math.max(22, 15 * k) - (extraB || 0) }; }
function axes(c, k, P, box, xt, yt, x, y) {
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const [v, t] of yt) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, t, box.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
  const ly = box.b + Math.max(13, 8.5 * k);
  for (const [v, t, al] of xt) HeroKit.label(c, k, t, x(v), ly, { align: al || 'center', px: 10.5, mono: true, color: P.ink3, halo: false });
}
/** Пошаговое проигрывание: возвращает долю пройденного времени 0…1 и вызывает onEnd. */
function playback(dur, onEnd) {
  const pl = { t0: performance.now(), dur: reduced() ? 1 : dur / SPEED.k, done: false };
  pl.u = () => Math.min(1, (performance.now() - pl.t0) / pl.dur);
  setTimeout(() => { pl.done = true; onEnd(); }, pl.dur + 30);
  return pl;
}
/** Первая точка касания пути xs с чайником k (для крестика). */
function touchAt(xs, k) {
  for (let t = 0; t < xs.length - 1; t++) {
    const a = { x: xs[t], y: E.START.y - E.V * t }, b = { x: xs[t + 1], y: E.START.y - E.V * (t + 1) };
    if (E.segHit(a, b, k)) return { t, x: xs[t + 1], y: b.y };
  }
  return null;
}
const sideWord = (x) => (x < -6 ? 'слева' : x > 6 ? 'справа' : 'по центру');

/* ===================== 1. Опыт: Ада учится у учителя и едет в чайник; больше данных не помогает ===================== */
const Exp = (() => {
  const NS = [10, 40, 200, 1000], PW = 420, PH = 250, FIXED = 1;   // точку для 40 поездок даёт первая миссия
  const st = { fc: [null, null, null, null], res: [null, null, null, null], view: -1, busy: false, prog: 0, sample: null, plotOn: false };
  let ctl = null;
  function sampleDemos() { if (!st.sample) st.sample = E.makeDemosCoin({ n: 40, pLeft: 0.5, seed: 5 }).demos; return st.sample; }
  function drawScene() {
    const { c, k } = HeroKit.fit($('#mdCv'), E.W, E.H), P = KD.pal();
    KD.house(c, k, P);
    const r = st.view >= 0 ? st.res[st.view] : null;
    KD.demos(c, P, r ? r.demos0 : sampleDemos(), r ? 0.25 : 0.4);
    KD.kettle(c, k, P, E.KETTLE, { label: true });
    if (r) {
      c.lineWidth = 2; c.lineJoin = 'round';
      for (const q of r.runs) { c.strokeStyle = q.touch ? P.bad : P.good; c.globalAlpha = 0.75; KD.pathXs(c, q.xs, q.touch ? q.hit.t + 1 : null); c.globalAlpha = 1; if (q.touch) HeroKit.cross(c, q.hit.x, q.hit.y, 5, P.bad, 2.2); }
    }
    KD.ada(c, E.START.x, E.START.y, -Math.PI / 2, P.reg);
    const txt = st.busy ? `обучение и поездки… ${fmt1(st.prog * 100, 0)}%` : r ? `${NS[st.view]} поездок учителя · 20 поездок Ады` : '40 поездок учителя · до обучения';
    HeroKit.label(c, k, txt, 10, E.H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    const el = $('#mdOut');
    if (st.busy) setOut(el, `Идёт опыт: сеть обучается и Ада едет, ${fmt1(st.prog * 100, 0)}%.`);
    else if (r) setOut(el, `<b>${NS[st.view]} поездок учителя.</b> Касаний чайника: <b>${r.crash} из 20</b> поездок Ады. В среднем Ада проходит в <b>${fmt1(r.miss, 1)} см</b> от центра чайника; касание начинается ближе 31 см. Серые линии — поездки учителя из первой из 20 попыток.`);
    else setOut(el, 'Серые линии — 40 поездок учителя: сторону каждой выбирала монетка, в чайник не заехала ни одна. Сеть учится повторять их и потом едет сама.');
  }
  const xOf = (box, i) => box.l + 28 + (Math.log10(NS[i]) - 1) / 2 * (box.r - box.l - 56);
  const mdBox = (k) => { const b = plotBox(k, PW, PH, [[0, '20']], 13 * k); b.t = 12 + 13 * k; return b; };
  function plot() {
    const cv = $('#mdPlot'); if (!cv) return;
    const { c, k } = HeroKit.fit(cv, PW, PH), P = KD.pal(), yt = [[0, '0'], [5, '5'], [10, '10'], [15, '15'], [20, '20']], box = mdBox(k);
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const y = (v) => box.b - v / 20 * (box.b - box.t);
    axes(c, k, P, box, NS.map((n, i) => [i, String(n)]), yt, (i) => xOf(box, i), y);
    HeroKit.label(c, k, 'касаний чайника из 20 поездок Ады', box.l, 9 * k, { align: 'left', px: 10.5, color: P.ink2, halo: false });
    HeroKit.label(c, k, 'поездок учителя', (box.l + box.r) / 2, PH - 7 * k, { px: 10.5, color: P.ink2, halo: false });
    // прогноз: пунктир через три точки читателя и измеренную точку для 40
    const val = (i) => (i === FIXED && st.res[FIXED] ? st.res[FIXED].crash : st.fc[i] == null ? 10 : st.fc[i]);
    c.setLineDash([6, 5]); c.strokeStyle = P.ink2; c.lineWidth = 2; c.beginPath();
    NS.forEach((n, i) => { const yy = y(val(i)); i ? c.lineTo(xOf(box, i), yy) : c.moveTo(xOf(box, i), yy); }); c.stroke(); c.setLineDash([]);
    NS.forEach((n, i) => {
      if (i === FIXED) return;
      const xx = xOf(box, i), yy = y(val(i)), v = st.fc[i];
      c.beginPath(); c.arc(xx, yy, 8, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.2; c.strokeStyle = P.ink2;
      if (v == null) c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
      if (v == null) HeroKit.label(c, k, '?', xx, yy, { px: 11, weight: 800, color: P.ink2, halo: false });
    });
    if (!st.fc.some((v, i) => i !== FIXED && v != null)) HeroKit.label(c, k, 'перетащи точки «?» вверх или вниз', (box.l + box.r) / 2, box.t + 14 * k, { px: 10.5, weight: 650, color: P.e2e, haloColor: P.bg });
    const done = st.res.filter(Boolean).length;
    if (done) {
      c.strokeStyle = P.e2e; c.lineWidth = 2.5; c.beginPath(); let first = true;
      st.res.forEach((r, i) => { if (!r) return; const xx = xOf(box, i), yy = y(r.crash); first ? c.moveTo(xx, yy) : c.lineTo(xx, yy); first = false; }); c.stroke();
      st.res.forEach((r, i) => { if (!r) return; const xx = xOf(box, i), yy = y(r.crash); c.beginPath(); c.arc(xx, yy, 5.5, 0, 7); c.fillStyle = P.e2e; c.fill(); HeroKit.label(c, k, String(r.crash), xx + 12, yy, { align: 'left', px: 11, weight: 750, color: P.e2e, haloColor: P.bg }); });
    }
  }
  const fcDone = () => st.fc.every((v, i) => i === FIXED || v != null);
  function setFc(i, v) { if (st.busy || i === FIXED) return; st.fc[i] = Math.max(0, Math.min(20, Math.round(v))); plot(); if (ctl) ctl.update(); }
  function* experiment(list) {
    const total = list.length * 20; let n = 0;
    for (const i of list) {
      const runs = []; let crash = 0, miss = 0, demos0 = null;
      for (let j = 0; j < 20; j++) {
        const D = E.moreDataDemos(NS[i], j); if (!j) demos0 = NS[i] > 200 ? D.demos.slice(0, 200) : D.demos;
        const reg = yield* E.trainReg13(D.demos, { iters: E.MD.iters, seed: 3 + j });
        const q = E.moreDataRun(reg, j); q.hit = q.touch ? touchAt(q.xs, E.KETTLE) : null;
        runs.push(q); if (q.touch) crash++; miss += q.miss;
        yield { prog: ++n / total };
      }
      st.res[i] = { runs, crash, miss: miss / 20, demos0 }; st.view = i;
      yield { point: i };
    }
  }
  function viewButtons() { $$('#mdView button').forEach((b, i) => { b.setAttribute('aria-pressed', String(i === st.view)); b.disabled = !st.res[i]; }); }
  async function runList(list) {
    st.busy = true; st.prog = 0; drawScene(); $('#mdProg').hidden = false;
    await runChunked(experiment(list), (e) => { if (e.prog != null) { st.prog = e.prog; $('#mdProg i').style.width = (e.prog * 100).toFixed(1) + '%'; } if (e.point != null) plot(); drawScene(); }, 14);
    st.busy = false; $('#mdProg').hidden = true; viewButtons(); plot(); drawScene();
  }
  const api = {
    reset() { st.fc = [null, null, null, null]; st.res = [null, null, null, null]; st.view = -1; viewButtons(); plot(); drawScene(); },
    async runFirst() { await runList([FIXED]); const r = st.res[FIXED]; return { crash: r.crash, miss: r.miss }; },
    async runRest() {
      if (!fcDone()) return { fcDone: false, done: false };
      const list = [0, 2, 3].filter((i) => !st.res[i]); if (list.length) await runList(list);
      return { fcDone: true, done: st.res.every(Boolean), crash: st.res.map((r) => r.crash), miss: st.res.map((r) => r.miss), fc: st.fc.slice() };
    },
    setFc, state: () => ({ fcDone: fcDone(), done: st.res.every(Boolean) }),
  };
  const missions = [
    { short: 'Первая поездка', title: 'Ада учится у учителя и едет сама', text: 'Учитель записал 40 поездок к столу: чайник он объезжает то слева, то справа, сторону выбирает монетка. Обучи сеть повторять за учителем и отправь Аду к столу 20 раз. В каждой из 20 попыток учитель записывает новые 40 поездок, сеть учится заново и Ада едет один раз.', controls: [],
      bet: { q: 'как проедет Ада после обучения?', options: ['Объедет чайник, как учитель', 'Заденет чайник почти в каждой поездке', 'Объедет примерно в половине поездок'], answer: (r) => (r.crash >= 15 ? 1 : r.crash <= 5 ? 0 : 2) },
      action: { label: 'Обучить и прогнать 20 раз', run: (X) => X.runFirst() },
      summary: (r) => `40 поездок учителя → касаний ${r.crash} из 20`,
      explain: (r) => `Касаний — <b>${r.crash} из 20</b>. Все 40 поездок учителя проходят мимо чайника, а Ада задевает его ${r.crash === 20 ? 'в каждой поездке' : `в ${r.crash} поездках из 20`}: проходит в среднем в ${fmt1(r.miss, 1)} см от центра чайника, а касание начинается ближе 31 см. Путь, которым едет Ада, не встречается ни в одной демонстрации.` },
    { short: 'Больше данных', title: 'Поможет ли больше поездок учителя', text: 'В уроке 1.1 новые поездки закрывали пробелы в данных, и ошибки уходили. Проверим, поможет ли это здесь. На графике под сценой нарисуй прогноз: сколько касаний из 20 будет при 10, 200 и 1000 поездках учителя (точку для 40 уже дал опыт). Потом проверь прогноз опытом.', controls: ['plot', 'view'],
      action: { label: 'Проверить прогноз опытом', run: (X) => X.runRest() },
      criteria: [{ label: 'Прогноз нарисован для 10, 200 и 1000 поездок', test: (r) => r.fcDone }, { label: 'Опыт проведён для всех трёх точек', test: (r) => r.done }],
      hint: 'Точки «?» на графике перетаскиваются мышью или пальцем. Кнопка запускает опыт только после прогноза.',
      fail: (r) => (!r.fcDone ? 'Сначала нарисуй прогноз: перетащи три точки «?» на графике под сценой вверх или вниз.' : 'Опыт не завершён, попробуй ещё раз.'),
      summary: (r) => (r.done ? `опыт: ${r.crash.join(', ')} касаний из 20` : 'прогноз не нарисован'),
      explain: (r) => {
        const err = [0, 2, 3].reduce((s, i) => s + Math.abs(r.fc[i] - r.crash[i]), 0) / 3, fcDrop = r.fc[3] < r.crash[1] - 2;
        return `<p><b>Опыт: ${r.crash.join(', ')} касаний из 20</b> для 10, 40, 200 и 1000 поездок учителя. Твой прогноз для 10, 200 и 1000: ${[0, 2, 3].map((i) => r.fc[i]).join(', ')}, в среднем он разошёлся с опытом на ${fmt1(err, 1)} ${plural(Math.round(err), 'поездку', 'поездки', 'поездок')} из 20.${fcDrop ? ' Прогноз обещал пользу от данных: так подсказывает опыт урока 1.1, где новые поездки закрывали пробелы.' : ''}</p>` +
          `<p>Здесь данные не помогли: от 40 поездок и дальше Ада задевает чайник в каждой попытке. При 10 поездках монетка иногда даёт сильный перекос, например 8 к 2, и сеть случайно проезжает мимо. Чем больше поездок, тем ближе их доля к 50 на 50 и тем точнее Ада едет в середину: средний промах мимо центра чайника падает с ${fmt1(r.miss[0], 0)} до ${fmt1(r.miss[3], 1)} см.</p>`;
      } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Кнопками под сценой переключай число поездок учителя и смотри поездки Ады. Сравни, насколько близко к центру чайника она проходит при 10 и при 1000 поездках, и найди при 10 поездках попытки, где Ада проехала мимо.', final: true },
  ];
  function init() {
    legend('#mdLegend', [['поездки учителя', 'var(--ink-3)'], ['поездка Ады без касания', 'var(--good)'], ['поездка Ады с касанием', 'var(--critical)']]);
    legend('#mdPlotLegend', [['твой прогноз', 'var(--ink-2)', 'dash'], ['опыт', 'var(--e2e)']]);
    const view = $('#mdView'); NS.forEach((n, i) => { const b = h('button', { type: 'button', 'aria-pressed': 'false' }, `${n} поездок`); b.disabled = true; b.addEventListener('click', () => { if (!st.res[i]) return; st.view = i; viewButtons(); drawScene(); }); view.append(b); });
    const cv = $('#mdPlot');
    const toVal = (p) => { const k = HeroKit.fit(cv, PW, PH).k, box = mdBox(k); return (box.b - p.y) / (box.b - box.t) * 20; };
    const near = (p) => { const k = HeroKit.fit(cv, PW, PH).k, box = mdBox(k); let bi = -1, bd = 30; NS.forEach((n, i) => { if (i === FIXED) return; const d = Math.abs(p.x - xOf(box, i)); if (d < bd) { bd = d; bi = i; } }); return bi; };
    HeroKit.drag(cv, PW, PH, { hit: (p) => { const i = near(p); return i >= 0 ? { i } : null; }, move: (o, p) => setFc(o.i, toVal(p)), start: (o, p) => setFc(o.i, toVal(p)), tap: (p) => { const i = near(p); if (i >= 0) setFc(i, toVal(p)); } });
    ctl = mountMissions('#mdMis', missions, api, { controls: { plot: '#wrapMdPlot', view: '#wrapMdView' }, onStep: () => { plot(); } });
    plot(); drawScene(); redrawOn(() => { plot(); drawScene(); });
    return ctl;
  }
  return { init, st, setFc, api };
})();

/* ===================== 2. Нарисуй объезды: ответы MSE и L1 ===================== */
const Draw = (() => {
  const st = { demos: [], stroke: null, msg: '' };
  let ctl = null;
  function stats() {
    const n = st.demos.length, nl = st.demos.filter((d) => d.side < 0).length, bad = st.demos.filter((d) => d.hit).length;
    if (!n) return { n, nl, nr: 0, bad, mm: null };
    const mm = E.meanMedian(st.demos.map((d) => d.xs)), mse = E.profileHit(mm.mean), l1 = E.profileHit(mm.med), tk = Math.round((E.START.y - E.KETTLE.y) / E.V);
    return { n, nl, nr: n - nl, bad, mm, mse, l1, mseX: mm.mean[tk] - E.KETTLE.x, l1X: mm.med[tk] - E.KETTLE.x, band: mm.hi[tk] - mm.lo[tk] };
  }
  function draw() {
    const { c, k } = HeroKit.fit($('#drawCv'), E.W, E.H), P = KD.pal(), s = stats();
    KD.house(c, k, P, { startDx: !st.demos.length && !st.stroke ? 62 : 36 });
    KD.kettle(c, k, P, E.KETTLE, { label: true, halo: true });
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const d of st.demos) { c.strokeStyle = d.hit ? P.bad : P.demo; c.lineWidth = 1.8; c.globalAlpha = 0.9; KD.pathXs(c, d.xs); c.globalAlpha = 1; }
    if (s.mm) {
      if (s.n % 2 === 0) { c.fillStyle = P.ink3; c.globalAlpha = 0.14; c.beginPath(); for (let t = 0; t <= E.T; t++) c.lineTo(s.mm.lo[t], E.START.y - E.V * t); for (let t = E.T; t >= 0; t--) c.lineTo(s.mm.hi[t], E.START.y - E.V * t); c.closePath(); c.fill(); c.globalAlpha = 1; }
      c.strokeStyle = P.reg; c.lineWidth = 3.2; KD.pathXs(c, s.mm.mean);
      c.setLineDash([8, 6]); c.strokeStyle = P.ink2; c.lineWidth = 2.4; KD.pathXs(c, s.mm.med); c.setLineDash([]);
      const tk = Math.round((E.START.y - E.KETTLE.y) / E.V), yk = E.START.y - E.V * tk;
      for (const [xs, hit, name, dx] of [[s.mm.mean, s.mse.hit, 'MSE', 1], [s.mm.med, s.l1.hit, 'L1', -1]]) {
        c.beginPath(); c.arc(xs[tk], yk, E.RA, 0, 7); c.strokeStyle = hit ? P.bad : P.good; c.lineWidth = 2; c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]);
        HeroKit.label(c, k, name, xs[tk] + dx * (E.RA + 18), yk - 22, { px: 11.5, weight: 800, mono: true, color: hit ? P.bad : P.good, haloColor: P.bg });
      }
    }
    if (st.stroke && st.stroke.length > 1) { c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.beginPath(); st.stroke.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke(); }
    KD.ada(c, E.START.x, E.START.y, -Math.PI / 2, P.reg);
    if (!st.demos.length && !st.stroke) { c.strokeStyle = P.e2e; c.lineWidth = 2; c.setLineDash([3, 4]); c.beginPath(); c.arc(E.START.x, E.START.y, 40, 0, 7); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'начни линию здесь', E.START.x - 112, E.START.y - 8, { px: 11.5, weight: 700, color: P.e2e, haloColor: P.bg }); }
    out(s);
  }
  function out(s) {
    const el = $('#drawOut');
    if (st.msg) { setOut(el, st.msg); return; }
    if (!s.n) { setOut(el, 'Веди линию от Ады вверх, мимо чайника, к столу. Пунктирный круг вокруг чайника — где не должен проходить центр Ады.'); return; }
    const pass = (hp, x) => (hp.hit ? `<b>задевает чайник</b>, проходит в ${fmt1(Math.abs(x), 0)} см от его центра` : `объезжает ${sideWord(x)}, в ${fmt1(Math.abs(x), 0)} см от центра`);
    setOut(el, `Демонстраций: <b>${s.n}</b> — слева ${s.nl}, справа ${s.nr}${s.bad ? `, задевают чайник: <b>${s.bad}</b>` : ''}.<br>MSE ${pass(s.mse, s.mseX)}. L1 ${pass(s.l1, s.l1X)}${s.n % 2 === 0 && s.band > 1 ? `; при чётном числе линий подходит любой путь в серой полосе шириной ${fmt1(s.band, 0)} см` : ''}.`);
  }
  function add(pts) {
    const xs = E.strokeProfile(pts, E.KETTLE);
    if (!xs) { st.msg = 'Линия не засчитана: начни её у Ады и доведи дальше чайника.'; return false; }
    st.msg = ''; const hp = E.profileHit(xs), tk = Math.round((E.START.y - E.KETTLE.y) / E.V);
    st.demos.push({ xs, hit: hp.hit, side: xs[tk] < E.KETTLE.x ? -1 : 1 }); if (st.demos.length > 16) st.demos.shift();
    return true;
  }
  function changed() { draw(); if (ctl) ctl.update(); }
  /** Нарисовать объезд программно: side −1/+1, amp — смещение у чайника, см (для тестов и подсказок). */
  function synth(side, amp) {
    const pts = []; for (let y = E.START.y; y >= E.GOAL.y + 10; y -= 4) { const f = E.bump(y, E.KETTLE, 96); pts.push({ x: E.RX + side * amp * f, y }); }
    add(pts); changed();
  }
  const api = {
    reset() { st.demos = []; st.msg = ''; draw(); },
    state() { const s = stats(); return { n: s.n, nl: s.nl, nr: s.nr, bad: s.bad, mseHit: s.n ? s.mse.hit : null, l1Hit: s.n ? s.l1.hit : null, mseX: s.mseX, l1X: s.l1X }; },
    synth, add: (pts) => { add(pts); changed(); },
  };
  const missions = [
    { short: 'Среднее', title: 'Ни одна линия не в чайнике, а среднее — в нём', text: 'Нарисуй не меньше четырёх объездов так, чтобы ни один не задевал чайник, а ответ MSE (сплошная линия) задевал.',
      criteria: [{ label: 'Демонстраций не меньше четырёх', test: (r, s) => s.n >= 4 }, { label: 'Ни одна демонстрация не задевает чайник', test: (r, s) => s.n > 0 && s.bad === 0 }, { label: 'Ответ MSE задевает чайник', test: (r, s) => s.mseHit === true }],
      hint: 'Рисуй объезды с обеих сторон, примерно поровну. Каждая линия должна обходить пунктирный круг.',
      explain: (s) => `Демонстраций ${s.n}: слева ${s.nl}, справа ${s.nr}, и все проходят мимо. Их среднее проходит в ${fmt1(Math.abs(s.mseX), 0)} см от центра чайника. Сеть с MSE на этих данных поедет по средней линии, хотя такой поездки нет ни в одной демонстрации. Именно это случилось в опыте: сеть выучила среднее объездов.` },
    { short: 'Медиана', title: 'L1 объезжает слева, MSE всё ещё в чайнике', text: 'Добавь или убери линии так, чтобы ответ L1 (пунктир) объезжал чайник слева, а ответ MSE по-прежнему задевал его. Все демонстрации должны проходить мимо.',
      criteria: [{ label: 'L1 объезжает чайник слева', test: (r, s) => s.l1Hit === false && s.l1X < 0 }, { label: 'MSE задевает чайник', test: (r, s) => s.mseHit === true }, { label: 'Ни одна демонстрация не задевает чайник', test: (r, s) => s.n > 0 && s.bad === 0 }],
      hint: 'Медиана идёт за большинством. Слева должно быть больше линий, чем справа, но ненамного: например, три против двух.',
      explain: (s) => `Слева ${s.nl}, справа ${s.nr}: медиана ушла к большинству и объезжает чайник, а среднее сдвинулось к большинству лишь на долю пути и проходит в ${fmt1(Math.abs(s.mseX), 0)} см от его центра. При равном счёте ответ L1 не определён: годится любой путь в серой полосе, в том числе прямо через чайник.` },
    { short: 'Перекос', title: 'Когда проезжает и MSE', text: 'Добейся, чтобы и ответ MSE проехал мимо чайника, но так, чтобы с другой стороны осталась хотя бы одна демонстрация.',
      criteria: [{ label: 'MSE объезжает чайник', test: (r, s) => s.mseHit === false }, { label: 'Есть демонстрации с обеих сторон', test: (r, s) => s.nl > 0 && s.nr > 0 }, { label: 'Ни одна демонстрация не задевает чайник', test: (r, s) => s.bad === 0 }],
      hint: 'Нужен сильный перекос. Попробуй четыре-пять линий с одной стороны и одну с другой. Помогают и широкие объезды.',
      explain: (s) => `Слева ${s.nl}, справа ${s.nr}: среднее наконец вышло из чайника и проходит в ${fmt1(Math.abs(s.mseX), 0)} см от центра. MSE проезжает только при сильном перекосе. Поэтому в опыте сеть иногда проезжала при 10 поездках учителя: монетка давала перекос вроде 8 к 2. При 1000 поездок такого не бывает.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Рисуй что угодно: объезд, который возвращается на маршрут не сразу, широкий и узкий объезды с одной стороны, линию прямо через чайник. Следи, как двигаются средняя и медиана.', final: true },
  ];
  function init() {
    legend('#drawLegend', [['демонстрации', 'var(--ink-3)'], ['ответ MSE — среднее', 'var(--pol-reg)'], ['ответ L1 — медиана', 'var(--ink-2)', 'dash'], ['задевает чайник', 'var(--critical)']]);
    const cv = $('#drawCv');
    HeroKit.drag(cv, E.W, E.H, {
      hit: (p) => (Math.hypot(p.x - E.START.x, p.y - E.START.y) < 46 ? 'stroke' : null),
      start: (o, p) => { st.stroke = [{ x: E.START.x, y: E.START.y }, p]; st.msg = ''; draw(); },
      move: (o, p) => { if (st.stroke) { st.stroke.push(p); draw(); } },
      end: () => { if (st.stroke) { add(st.stroke); st.stroke = null; changed(); } },
      tapCursor: 'default',
    });
    $('#drawUndo').addEventListener('click', () => { st.demos.pop(); st.msg = ''; changed(); });
    $('#drawClear').addEventListener('click', () => { st.demos = []; st.msg = ''; changed(); });
    ctl = mountMissions('#drawMis', missions, api);
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ===================== 3. Калибровка уверенности: где в данных несколько стратегий ===================== */
const Calib = (() => {
  const DS = [
    { id: 'pusht', name: 'Push-T', note: 'Круглый толкатель двигает Т-образный блок в цель на столе. 200 демонстраций в симуляции; к блоку можно подойти с двух сторон.', k10: 1.07, k30: 1.01 },
    { id: 'libero', name: 'LIBERO', note: 'Стандартный бенчмарк для политик манипуляции: задачи на столе для одной руки, демонстрации записаны людьми. Регрессия с L1 из OpenVLA-OFT даёт на нём 97,1% успеха.', k10: 1.01, k30: 1.03 },
    { id: 'mw', name: 'MetaWorld', note: 'Ещё один стандартный бенчмарк из того же сравнения: много разных задач для одной руки.', k10: 1.04, k30: 1.07 },
    { id: 'kitchen', name: 'Franka Kitchen', note: '566 демонстраций в виртуальной реальности. Оператор выполняет 4 подзадачи из 7 в разном порядке.', k10: 1.14, k30: 1.23 },
    { id: 'grasp', name: 'Захват ткани', note: 'Хирургический робот берёт ткань слева или справа от опасной зоны. 90 демонстраций, 45 на 45.', k10: 1.47, k30: 2.27 },
  ];
  const st = { p: DS.map(() => 50), touched: DS.map(() => false), checked: false };
  const truth = (d) => (d.k10 >= 1.1 ? 1 : 0);
  function score() { let s = 0; DS.forEach((d, i) => { const e = st.p[i] / 100 - truth(d); s += e * e; }); return { pen: s, pts: Math.round(100 - 20 * s) }; }
  function render() {
    const box = $('#calib'); box.innerHTML = '';
    const rows = h('div', { class: 'cal-rows' });
    DS.forEach((d, i) => {
      const inp = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(st.p[i]), 'aria-label': `Вероятность для ${d.name}`, id: 'cal-' + d.id });
      const outv = h('output', { class: 'cal-v' }, st.touched[i] ? `${st.p[i]}%` : '—');
      inp.disabled = st.checked;
      inp.addEventListener('input', () => { st.p[i] = +inp.value; st.touched[i] = true; outv.textContent = `${st.p[i]}%`; bar(); });
      const row = h('div', { class: 'cal-row' + (st.checked ? (Math.abs(st.p[i] / 100 - truth(d)) < 0.5 ? ' ok' : ' bad') : '') },
        h('div', { class: 'cal-name' }, h('b', null, d.name), h('span', null, d.note)),
        h('div', { class: 'cal-in' }, h('span', { class: 'cal-l' }, 'одна стратегия'), inp, h('span', { class: 'cal-r' }, 'несколько'), outv));
      if (st.checked) {
        const e = st.p[i] / 100 - truth(d), pen = e * e;
        row.append(h('div', { class: 'cal-res' }, h('span', { class: 'cal-k' }, `мод ≈ ${fmt1(d.k10, 2)}`), h('i', { class: 'cal-scale' }, h('em', { style: `left:${Math.min(100, (d.k10 - 1) / 0.5 * 100)}%` }), h('u', { style: 'left:20%' })), h('span', null, truth(d) ? 'несколько стратегий' : 'почти одна стратегия'), h('span', { class: 'cal-pen' }, `штраф ${fmt1(pen, 2)}`)));
      }
      rows.append(row);
    });
    box.append(rows);
    const barEl = h('div', { class: 'c-bar' }), go = h('button', { class: 'btn primary sm', type: 'button', id: 'calGo' }, 'Проверить'), again = h('button', { class: 'btn sm', type: 'button' }, 'Начать заново'), status = h('span', { class: 'muted-s', id: 'calStatus' });
    go.addEventListener('click', check); again.addEventListener('click', () => { st.p = DS.map(() => 50); st.touched = DS.map(() => false); st.checked = false; render(); });
    barEl.append(go, again, status); box.append(barEl);
    const out = h('div', { class: 'g-out', id: 'calOut' }); out.hidden = !st.checked; box.append(out);
    if (st.checked) {
      const sc = score();
      out.className = 'g-out m-win';
      out.innerHTML = `<p><b>${sc.pts} очков из 100.</b> Сумма штрафов ${fmt1(sc.pen, 2)}; ответ «50%» везде дал бы 75 очков.</p><p>Заметно больше одной стратегии только у Franka Kitchen, где подзадачи идут в разном порядке, и у захвата ткани, где операторы нарочно расходятся. На Push-T, LIBERO и MetaWorld у одного наблюдения почти всегда одно продолжение: оценка числа мод от 1,01 до 1,07. Даже Push-T, на котором Diffusion Policy показывала объезд блока с двух сторон, по этой оценке почти одномодален.</p>`;
    }
    bar();
  }
  function bar() { const n = st.touched.filter(Boolean).length, s = $('#calStatus'), go = $('#calGo'); if (!s) return; go.disabled = st.checked || n < DS.length; s.textContent = st.checked ? '' : n < DS.length ? `Оценено ${n} из ${DS.length}` : 'Всё оценено — можно проверять'; }
  function check() { if (st.touched.filter(Boolean).length < DS.length) return; st.checked = true; render(); }
  function set(id, v) { const i = DS.findIndex((d) => d.id === id); st.p[i] = v; st.touched[i] = true; render(); }
  function init() { render(); }
  return { init, st, set, check, score, DS };
})();

/* ===================== 4. Бины по двум шагам и авторегрессия ===================== */
const Bins = (() => {
  // Точки движка: моды (−1, +1) и (+1, −1), «неправильно» — x·y > 0. На экране вторую ось переворачиваем:
  // по горизонтали — сдвиг на шаге 1, по вертикали — на шаге 2 (вверх — вправо), моды «оба влево» и «оба вправо».
  const S = 440, data = E.binsData(4), Hst = E.binsHist(data);
  const st = { mode: 'ind', last: null, seed: 1, runs: [] };
  let ctl = null;
  const PAD = 58, TOPP = 14, RIGHTP = 14;
  const map = (v) => PAD + (v - E.BINS.lo) / (E.BINS.hi - E.BINS.lo) * (S - PAD - RIGHTP), mapY = (v) => S - PAD - (-v - E.BINS.lo) / (E.BINS.hi - E.BINS.lo) * (S - PAD - TOPP);
  function draw() {
    const { c, k } = HeroKit.fit($('#binsCv'), S, S), P = KD.pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, S, S);
    const x0 = map(E.BINS.lo), x1 = map(E.BINS.hi), yTop = S - PAD - (S - PAD - TOPP), yBot = S - PAD, cx = map(0), cy = mapY(0);
    // углы, которых нет в данных: шаг 1 влево и шаг 2 вправо (верхний левый), шаг 1 вправо и шаг 2 влево (нижний правый)
    for (const [ax, ay, bx, by] of [[x0, yTop, cx, cy], [cx, cy, x1, yBot]]) { c.beginPath(); c.rect(ax, ay, bx - ax, by - ay); c.fillStyle = P.bad; c.globalAlpha = 0.06; c.fill(); c.globalAlpha = 1; c.beginPath(); c.rect(ax, ay, bx - ax, by - ay); HeroKit.hatch(c, ax, ay, bx, by, P.bad, 12, 0.6); }
    HeroKit.label(c, k, 'шаг 1 влево, шаг 2 вправо', (x0 + cx) / 2, yTop + 14, { px: 10, color: P.bad, haloColor: P.bg });
    HeroKit.label(c, k, 'такого в данных не было', (x0 + cx) / 2, yTop + 28, { px: 10, color: P.bad, haloColor: P.bg });
    HeroKit.label(c, k, 'шаг 1 вправо, шаг 2 влево', (cx + x1) / 2, yBot - 28, { px: 10, color: P.bad, haloColor: P.bg });
    HeroKit.label(c, k, 'такого в данных не было', (cx + x1) / 2, yBot - 14, { px: 10, color: P.bad, haloColor: P.bg });
    // сетка бинов
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let b = 0; b <= E.BINS.n; b++) { const v = E.BINS.lo + b * (E.BINS.hi - E.BINS.lo) / E.BINS.n; c.beginPath(); c.moveTo(map(v), yTop); c.lineTo(map(v), yBot); c.moveTo(x0, mapY(v)); c.lineTo(x1, mapY(v)); c.stroke(); }
    c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(cx, yTop); c.lineTo(cx, yBot); c.moveTo(x0, cy); c.lineTo(x1, cy); c.stroke();
    // столбец бина шага 1 первого действия (авторегрессия)
    const bw = (x1 - x0) / E.BINS.n, ar = st.last && st.last.mode === 'ar' ? st.last.first : null;
    if (ar) { c.fillStyle = P.e2e; c.globalAlpha = 0.14; c.fillRect(x0 + ar.i * bw, yTop, bw, yBot - yTop); c.globalAlpha = 1; }
    // данные
    c.fillStyle = P.ink3; c.globalAlpha = 0.35; for (const p of data) { c.beginPath(); c.arc(map(p.x), mapY(p.y), 1.6, 0, 7); c.fill(); } c.globalAlpha = 1;
    HeroKit.label(c, k, 'оба шага влево', map(-1), mapY(1) + 36, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, 'оба шага вправо', map(1), mapY(-1) - 36, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.bg });
    // таблицы бинов: шаг 1 снизу, шаг 2 слева (бин b движка по y стоит на экране сверху вниз)
    const mx = Math.max(...Hst.hx, ...Hst.hy);
    c.fillStyle = P.classic; c.globalAlpha = 0.55;
    for (let b = 0; b < E.BINS.n; b++) { const hx = Hst.hx[b] / mx * 34, hy = Hst.hy[b] / mx * 34; if (hx) c.fillRect(x0 + b * bw + 1, yBot + 6, bw - 2, hx); if (hy) c.fillRect(x0 - 6 - hy, yTop + b * bw + 1, hy, bw - 2); }
    c.globalAlpha = 1;
    if (ar) {
      let cm = 0; for (let j = 0; j < E.BINS.n; j++) cm = Math.max(cm, Hst.joint[ar.i * E.BINS.n + j]);
      c.fillStyle = P.e2e; c.globalAlpha = 0.85;
      for (let j = 0; j < E.BINS.n; j++) { const v = Hst.joint[ar.i * E.BINS.n + j]; if (!v) continue; const hy = v / cm * 34; c.fillRect(x0 - 6 - hy, yTop + j * bw + 1, hy, bw - 2); }
      c.globalAlpha = 1;
      // в левой половине вверху подпись угла «такого в данных не было» — там подпись столбца ставим ниже неё
      HeroKit.label(c, k, 'корзина шага 1', x0 + ar.i * bw + bw / 2, ar.i < E.BINS.n / 2 ? yTop + 46 : yTop + 8, { px: 10, weight: 650, color: P.e2e, haloColor: P.bg });
    }
    HeroKit.label(c, k, 'таблица шага 1: ← влево · вправо →', (x0 + x1) / 2, yBot + 48, { px: 10.5, color: P.ink3, halo: false });
    c.save(); c.translate(x0 - 46, (yTop + yBot) / 2); c.rotate(-Math.PI / 2); HeroKit.label(c, k, 'таблица шага 2: ← влево · вправо →', 0, 0, { px: 10.5, color: P.ink3, halo: false }); c.restore();
    // действия
    if (st.last) for (const p of st.last.pts) { c.beginPath(); c.arc(map(p.x), mapY(p.y), 3.4, 0, 7); c.fillStyle = p.wrong ? P.bad : P.good; c.fill(); }
    if (ar) { const p = st.last.pts[0]; c.beginPath(); c.arc(map(p.x), mapY(p.y), 6.5, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 2; c.stroke(); }
    const el = $('#binsOut');
    if (st.last && st.last.mode === 'ar') setOut(el, `<b>По очереди (авторегрессия)</b>: шаг 1 первого действия попал в оранжевый столбец, шаг 2 выбран по оранжевой таблице этого столбца (точка в кольце). Виляющих действий: <b>${st.last.bad} из 100</b>.`);
    else if (st.last) setOut(el, `<b>Независимые корзины</b>: шаг 1 и шаг 2 каждого действия выбраны по своим синим таблицам, не глядя друг на друга. Виляющих действий (в пустых углах): <b>${st.last.bad} из 100</b>.`);
    else setOut(el, 'Серые точки — действия из демонстраций: сдвиг на шаге 1 (по горизонтали) и на шаге 2 (по вертикали). Два сгустка: оба шага влево и оба вправо. Синие столбики — таблицы корзин: по 16 интервалов на каждый шаг с их частотами.');
  }
  function sample() {
    const r = E.binsSample(Hst, st.mode, 100, 1000 + st.seed++), first = { i: E.binOf(r.pts[0].x) };
    st.last = { pts: r.pts, bad: r.bad, mode: st.mode, first }; st.runs.push({ mode: st.mode, bad: r.bad }); draw();
    return Promise.resolve({ bad: r.bad, mode: st.mode });
  }
  function setMode(m) { st.mode = m; $$('#wrapBinsMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); if (ctl) ctl.update(); }
  const api = { reset() { st.last = null; st.runs = []; setMode('ind'); draw(); }, sample, setMode, state: () => ({ mode: st.mode }) };
  const modeName = (m) => (m === 'ar' ? 'по очереди' : 'независимые корзины');
  const missions = [
    { short: 'Независимо', title: 'Два шага по двум отдельным таблицам', text: 'Действие — два числа: сдвиг Ады вбок на двух соседних шагах объезда. В демонстрациях оба шага идут влево или оба вправо. Модель хранит для каждого шага свою таблицу корзин — 16 интервалов с частотами, синие столбики — и выбирает шаг 1 и шаг 2 по их таблицам независимо. Возьми из модели 100 действий.', controls: [],
      onEnter: (X) => X.setMode('ind'),
      bet: { q: 'сколько из 100 действий окажутся виляющими — шаг 1 в одну сторону, шаг 2 в другую?', options: ['Ни одного: таких не было в данных', 'Около четверти', 'Около половины', 'Почти все'], answer: (r) => (r.bad < 8 ? 0 : r.bad < 38 ? 1 : r.bad < 70 ? 2 : 3) },
      action: { label: '100 действий', run: (X) => X.sample() },
      summary: (r) => `${modeName(r.mode)}: виляющих ${r.bad} из 100`,
      explain: (r) => `Виляющих действий — <b>${r.bad} из 100</b>, они легли в красные углы. Таблица шага 1 говорит «влево или вправо поровну», таблица шага 2 — то же самое, а того, что шаг 2 должен повторить сторону шага 1, в двух отдельных таблицах нет. Распределение каждого шага модель знает точно, а связь между шагами потеряла.` },
    { short: 'По очереди', title: 'Ни одного виляющего действия', text: 'Авторегрессия — выбирать измерения по очереди: сначала шаг 1 по его таблице, потом шаг 2 по таблице, собранной только из тех демонстраций, где шаг 1 попал в ту же корзину. Переключи режим под сценой и добейся, чтобы из 100 действий ни одно не виляло.', controls: ['mode'],
      action: { label: '100 действий', run: (X) => X.sample() },
      criteria: [{ label: 'Ни одного действия в красных углах', test: (r) => r.bad === 0 }],
      summary: (r) => `${modeName(r.mode)}: виляющих ${r.bad} из 100`,
      hint: 'Переключатель под сценой: «по очереди (авторегрессия)». После запуска оранжевый столбец на сцене — корзина шага 1 первого действия, оранжевые столбики слева — таблица шага 2 только для этого столбца.',
      fail: (r) => (r.mode === 'ind' ? `Виляющих ${r.bad} из 100. Пока шаги выбираются независимо, так будет всегда: переключи режим под сценой.` : `${r.bad} из 100. Попробуй ещё раз.`),
      explain: () => 'Виляющих — <b>0 из 100</b>. Оранжевый столбец на сцене — корзина, куда попал шаг 1 первого действия; оранжевые столбики слева — таблица шага 2, собранная только из точек этого столбца. У неё один пик, и шаг 2 повторяет сторону шага 1. Связь между измерениями вернулась, но за цену: по одному проходу модели на каждое измерение. Так декодируют действия RT-2 и OpenVLA (уроки 3.3 и 3.5): измерение за измерением, как слова в тексте.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Сравни режимы несколько раз. Запусти независимые корзины пять раз подряд: доля виляющих действий всегда около половины?', final: true, action: { label: '100 действий', run: (X) => X.sample() }, summary: (r) => `${modeName(r.mode)}: виляющих ${r.bad} из 100` },
  ];
  function init() {
    legend('#binsLegend', [['действия из демонстраций', 'var(--ink-3)', 'dot'], ['действие модели в сгустке данных', 'var(--good)', 'dot'], ['виляющее действие в пустом углу', 'var(--critical)', 'dot'], ['таблицы корзин по шагам', 'var(--classic)'], ['корзина шага 1 и таблица шага 2 для неё', 'var(--e2e)']]);
    $$('#wrapBinsMode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    ctl = mountMissions('#binsMis', missions, api, { controls: { mode: '#wrapBinsMode' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ===================== 5. Сцена «Ады и чайник»: фабрика лаборатории ===================== */
/** Обученные модели общие для двух лабораторий на одной сцене: ключ — данные и вид модели. */
const ModelCache = {};
function compSides(g, kettle) {
  // какая компонента смеси объезжает слева, какая справа: знак плана за 8 шагов до чайника
  const tk = Math.round((E.START.y - kettle.y) / E.V), x = new Float64Array(1); x[0] = E.obs13(Math.max(0, tk - 8));
  const ev = E.gmmEval(g.m, x, g.K, g.HC); return Array.from({ length: g.K }, (_, c) => (ev.mu(c, 7) < 0 ? -1 : 1));
}
/** cfg: { ids: { cv, stats, loss, mis, legend, lossLegend, share, H, N, K, mode, show, drag }, pols, seams, missions(api, T) } */
function makeLab(cfg) {
  const NVALS = [10, 20, 40, 100, 200], I = cfg.ids, POL = [['reg', 'Регрессия (MSE)', 'var(--pol-reg)'], ['gmm', 'Смесь гауссиан', 'var(--pol-gmm)'], ['dif', 'Диффузия', 'var(--pol-dif)']].filter((p) => cfg.pols.includes(p[0]));
  const st = {
    share: 0.5, N: 40, K: 2, mode: 'chunk', H: 32, kettle: { x: E.KETTLE.x, y: E.KETTLE.y }, show: { reg: cfg.pols.includes('reg'), gmm: cfg.pols.includes('gmm'), dif: cfg.pols.includes('dif'), heat: false },
    data: null, dataKey: '', res: null, play: null, batchNo: 0, training: false, prog: 0, loss: { reg: [], gmm: [] }, log: [], drag: false,
  };
  let ctl = null;
  const el = (key) => (I[key] ? $(I[key]) : null);
  const key = () => `${st.share}|${st.N}|${st.kettle.x.toFixed(0)}|${st.kettle.y.toFixed(0)}`;
  function ensureData() {
    if (st.data && st.dataKey === key()) return st.data;
    st.data = E.makeDemos({ n: st.N, pLeft: st.share, seed: 1, kettle: st.kettle }); st.dataKey = key();
    st.heat = E.heat(st.data.demos, 60, 40);
    return st.data;
  }
  const models = () => (ModelCache[key()] = ModelCache[key()] || {});
  function* trainAll() {
    const D = ensureData(), M = models();
    if (cfg.pols.includes('reg') && !M.reg) { st.loss.reg = []; M.reg = yield* E.trainReg13(D.demos); }
    const gk = 'gmm' + st.K;
    if (cfg.pols.includes('gmm') && !M[gk]) { st.loss.gmm = []; const g = yield* E.trainGMM13(D.demos, st.K); g.sides = compSides(g, st.kettle); M[gk] = g; }
    if (cfg.pols.includes('dif') && !M.dif) M.dif = E.diff13(D.demos);
  }
  const need = () => { const M = models(); return (cfg.pols.includes('reg') && !M.reg) || (cfg.pols.includes('gmm') && !M['gmm' + st.K]); };
  async function run() {
    const D = ensureData();
    if (D.blocked) { st.res = null; draw(); return { blocked: true, share: st.share, onRoute: E.onRoute(st.kettle) }; }
    if (need()) {
      st.training = true; st.prog = 0; draw();
      const it = { reg: 0, gmm: 0 };
      await runChunked(trainAll(), (e) => {
        if (e.iters === 1200) { st.loss.reg.push([e.it, e.loss]); it.reg = e.it / e.iters; } else { st.loss.gmm.push([e.it, e.loss]); it.gmm = e.it / e.iters; }
        st.prog = cfg.pols.includes('reg') ? (it.reg + it.gmm) / 2 : it.gmm; drawStats(); plotLoss();
      }, 14);
      st.training = false;
    }
    const M = models(), seed0 = 1 + 10 * st.batchNo++, k = st.kettle, res = {};
    if (cfg.pols.includes('reg')) res.reg = E.batch13(M.reg, k, 10, seed0);
    if (cfg.pols.includes('gmm')) { res.gmm = E.batch13(M['gmm' + st.K], k, 10, seed0, { mode: st.mode, H: st.H }); res.gmm.sides = M['gmm' + st.K].sides; }
    if (cfg.pols.includes('dif')) res.dif = E.batch13(M.dif, k, 10, seed0);
    for (const p of cfg.pols) res[p].runs.forEach((q) => { q.hit = q.touch ? touchAt(q.xs, k) : null; });
    const r = { share: st.share, N: st.N, K: st.K, mode: st.mode, H: st.H, kettle: { x: k.x, y: k.y }, onRoute: E.onRoute(k), nLeft: D.nLeft, nRight: D.nRight, blocked: false };
    for (const p of cfg.pols) r[p] = sum(res[p]);
    if (res.gmm) r.gmmRuns = res.gmm.runs.map((q) => ({ touch: q.touch, sw: q.sw, seamSwitch: seamSwitch(q, st.H) }));
    st.log.push(r);
    return new Promise((resolve) => { st.res = res; st.play = playback(1900, () => { st.play = null; draw(); resolve(r); }); });
  }
  const sum = (b) => ({ touches: b.touches, maxSw: b.maxSw, left: b.left, right: b.right });
  /** Сменила ли смесь компоненту на каком-нибудь стыке до касания (режим «раз в пачку»). */
  function seamSwitch(q, H) { let n = 0; for (let t = H; t < q.comps.length; t += H) if (q.comps[t] !== q.comps[t - 1]) n++; return n; }
  /* ---------- рисование ---------- */
  function draw() {
    const cv = el('cv'); if (!cv) return;
    const { c, k } = HeroKit.fit(cv, E.W, E.H), P = KD.pal(), D = ensureData(), S = { l: P.left, r: P.right };
    KD.house(c, k, P);
    if (st.show.heat && st.heat) KD.heat(c, P, st.heat, P.classic);
    KD.demos(c, P, D.demos, st.res ? 0.22 : 0.4);
    KD.kettle(c, k, P, st.kettle, { label: true, halo: st.drag });
    if (D.blocked) HeroKit.label(c, k, 'проезда нет: чайник перекрыл проём', st.kettle.x, st.kettle.y - 30, { px: 12, weight: 750, color: P.bad, haloColor: P.bg });
    const u = st.play ? st.play.u() : 1, tNow = Math.round(u * E.T);
    if (st.res) {
      c.lineJoin = 'round'; c.lineCap = 'round';
      for (const [p] of POL) {
        if (!st.show[p]) continue; const color = P[p], runs = st.res[p].runs;
        if (!st.play) { c.strokeStyle = color; c.lineWidth = 1.4; c.globalAlpha = 0.45; for (let i = 1; i < runs.length; i++) KD.pathXs(c, runs[i].xs, runs[i].hit ? runs[i].hit.t + 1 : null); c.globalAlpha = 1; for (let i = 1; i < runs.length; i++) if (runs[i].hit) HeroKit.cross(c, runs[i].hit.x, runs[i].hit.y, 4, P.bad, 1.8); }
        const q = runs[0], stop = q.hit ? Math.min(tNow, q.hit.t + 1) : tNow;
        if (cfg.seams && p === 'gmm') {
          // путь смеси окрашен по выбранной стороне, точки — стыки пачек
          const sides = st.res.gmm.sides || [-1, 1];
          for (let t = 0; t < stop; t++) { const sd = sides[q.comps[t]] || 1; c.strokeStyle = sd < 0 ? S.l : S.r; c.lineWidth = 3.2; c.beginPath(); c.moveTo(q.xs[t], E.START.y - E.V * t); c.lineTo(q.xs[t + 1], E.START.y - E.V * (t + 1)); c.stroke(); }
          for (let t = st.H; t < stop && t < E.T; t += st.H) { c.beginPath(); c.arc(q.xs[t], E.START.y - E.V * t, 3.6, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.6; c.strokeStyle = P.ink; c.stroke(); }
        } else { c.strokeStyle = color; c.lineWidth = 3; if (p === 'reg') c.setLineDash([7, 5]); if (p === 'gmm') c.setLineDash([2, 4]); KD.pathXs(c, q.xs, stop); c.setLineDash([]); }
      }
      for (const [p] of POL) {
        if (!st.show[p]) continue; const q = st.res[p].runs[0], t = q.hit ? Math.min(tNow, q.hit.t + 1) : tNow, x = q.xs[t], y = E.START.y - E.V * t, xp = q.xs[Math.max(0, t - 1)], yp = E.START.y - E.V * Math.max(0, t - 1);
        KD.ada(c, x, y, KD.heading(xp, yp, x, y), P[p]);
        if (q.hit && tNow >= q.hit.t + 1) HeroKit.cross(c, q.hit.x, q.hit.y - E.RA - 8, 6, P.bad, 2.6);
      }
    } else {
      POL.forEach(([p], i) => { if (st.show[p]) KD.ada(c, E.START.x + (POL.length > 1 ? (i - 1) * 9 : 0), E.START.y, -Math.PI / 2, P[p], 0.95); });
    }
    const state = st.training ? `обучение ${fmt1(st.prog * 100, 0)}%` : st.play ? `прогон 1 из 10 · шаг ${tNow}/${E.T}` : st.res ? '10 прогонов' : 'до запуска';
    const txt = k > 1.5 ? (st.training || st.play ? state : (cfg.seams ? `пачка ${st.H} · ` : '') + `${D.nLeft} слева, ${D.nRight} справа`) : `${state} · демонстраций ${D.nLeft} слева, ${D.nRight} справа` + (cfg.seams ? ` · пачка ${st.H} шагов` : '');
    HeroKit.label(c, k, txt, 10, E.H - 12, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    drawStats();
  }
  function drawStats() {
    const box = el('stats'); if (!box) return;
    const sig = [st.training ? Math.round(st.prog * 50) : -1, !!(st.res && !st.play), st.mode, st.H, JSON.stringify(st.show), st.res && !st.play ? st.batchNo : 0].join('|');
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = '';
    for (const [p, name, col] of POL) {
      const r = st.res && !st.play ? st.res[p] : null;
      let sub = p === 'gmm' ? (st.mode === 'step' ? 'сторона на каждом шаге' : cfg.seams ? `пачка ${st.H} шагов, стыков до чайника: ${Math.floor(17 / st.H)}` : st.H >= 32 ? 'сторона на всю поездку' : `сторона раз в ${st.H} шагов`) : p === 'dif' ? 'вся поездка сразу' : 'одно среднее действие';
      if (st.training && p !== 'dif') sub = `обучается… ${fmt1(st.prog * 100, 0)}%`;
      const v = r ? `касаний: ${r.touches} из 10 · смен стороны: до ${r.maxSw} · слева ${r.left}, справа ${r.right}` : '—';
      box.append(h('div', { class: 'st' + (st.show[p] ? '' : ' off'), style: `--c:${col}` }, h('b', null, name), h('span', null, sub), h('div', { class: 'v' }, v)));
    }
  }
  function plotLoss() {
    const cv = el('loss'); if (!cv) return;
    const W = 520, H = 96, { c, k } = HeroKit.fit(cv, W, H), P = KD.pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const half = W / 2;
    for (const [i, kind, title] of [[0, 'reg', 'регрессия: MSE'], [1, 'gmm', 'смесь: −log p']]) {
      const L = st.loss[kind], x0 = i * half + 10, x1 = (i + 1) * half - 10, y0 = 22, y1 = H - 10;
      HeroKit.label(c, k, title, x0, 11, { align: 'left', px: 10.5, mono: true, color: P.ink3, halo: false });
      c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (L.length < 2) { HeroKit.label(c, k, 'заполнится при обучении', (x0 + x1) / 2, (y0 + y1) / 2, { px: 10.5, color: P.ink3, halo: false }); continue; }
      const its = L[L.length - 1][0] || 1, vs = L.map((q) => q[1]), lo = Math.min(...vs), hi = Math.max(...vs) || 1;
      c.strokeStyle = P[kind]; c.lineWidth = 2; c.beginPath();
      L.forEach(([it, v], j) => { const x = x0 + it / Math.max(its, kind === 'reg' ? 1199 : 1599) * (x1 - x0), y = y1 - (v - lo) / Math.max(1e-6, hi - lo) * (y1 - y0 - 4); j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
  }
  /* ---------- ручки ---------- */
  function syncCtl() {
    const sh = el('share'), hh = el('H'), nn = el('N'), kk = el('K');
    if (sh) { st.share = +sh.value / 100; sh.nextElementSibling.textContent = `${sh.value}%`; }
    if (hh) { st.H = +hh.value; hh.nextElementSibling.textContent = hh.value; }
    if (nn) { st.N = NVALS[+nn.value]; nn.nextElementSibling.textContent = String(st.N); }
    if (kk) { st.K = +kk.value; kk.nextElementSibling.textContent = kk.value; }
    if (st.dataKey !== key()) st.res = null;
    draw(); if (ctl) ctl.update();
  }
  function setCtl(o) {
    if (o.share != null && el('share')) el('share').value = Math.round(o.share * 100);
    if (o.H != null && el('H')) el('H').value = o.H;
    if (o.N != null && el('N')) el('N').value = NVALS.indexOf(o.N);
    if (o.K != null && el('K')) el('K').value = o.K;
    if (o.mode) setMode(o.mode, true);
    if (o.kettle) { st.kettle = { x: o.kettle.x, y: o.kettle.y }; st.res = null; }
    syncCtl();
  }
  function setMode(m, silent) { st.mode = m; if (I.mode) $$(I.mode + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); if (!silent) { draw(); if (ctl) ctl.update(); } }
  function setKettle(x, y) {
    const k = { x: Math.max(120, Math.min(480, x)), y: Math.max(70, Math.min(300, y)) };
    if (!E.kettleOK(k)) return false;
    st.kettle = k; st.res = null; draw(); if (ctl) ctl.update(); return true;
  }
  const DEF = Object.assign({ share: 0.5, H: 32, N: 40, K: 2, mode: 'chunk', kettle: E.KETTLE }, cfg.defaults || {});
  const api = {
    reset() { st.log = []; st.batchNo = 0; st.res = null; st.show = { reg: cfg.pols.includes('reg'), gmm: cfg.pols.includes('gmm'), dif: cfg.pols.includes('dif'), heat: false }; if (I.show) $$(I.show + ' input').forEach((i) => { i.checked = i.dataset.show !== 'heat'; }); setCtl(DEF); },
    run, setCtl, setKettle, setMode,
    state: () => ({ share: st.share, mode: st.mode, H: st.H, onRoute: E.onRoute(st.kettle), kettle: Object.assign({}, st.kettle), log: st.log.slice() }),
  };
  function init() {
    for (const kk of ['share', 'H', 'N', 'K']) if (el(kk)) el(kk).addEventListener('input', syncCtl);
    if (I.mode) $$(I.mode + ' button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    if (I.show) $$(I.show + ' input').forEach((i) => i.addEventListener('change', () => { st.show[i.dataset.show] = i.checked; draw(); }));
    const cv = el('cv');
    if (cfg.drag) HeroKit.drag(cv, E.W, E.H, {
      hit: (p) => (st.drag && !st.play && !st.training && Math.hypot(p.x - st.kettle.x, p.y - st.kettle.y) < 34 ? 'k' : null),
      start: (o, p) => { st.grab = { dx: st.kettle.x - p.x, dy: st.kettle.y - p.y }; },
      move: (o, p) => { setKettle(p.x + st.grab.dx, p.y + st.grab.dy); },
    });
    HeroKit.loop(cv, () => { if (st.play) draw(); });
    const missions = cfg.missions(api);
    const controls = {}; for (const kk of ['share', 'drag', 'mode', 'H', 'N', 'K', 'show']) if (cfg.wrap && cfg.wrap[kk]) controls[kk] = cfg.wrap[kk];
    ctl = mountMissions(I.mis, missions, api, {
      controls,
      onStep: (i) => { st.drag = !!cfg.drag && (missions[i].drag || missions[i].final); cv.classList.toggle('can-drag', st.drag); draw(); },
    });
    setCtl(DEF); plotLoss(); redrawOn(() => { draw(); plotLoss(); });
    return ctl;
  }
  return { init, api, st, draw };
}

/* ---------- 5а. Лаборатория «Три Ады и чайник» ---------- */
const Lab = (() => {
  const pct = (v) => `${Math.round(v * 100)}`;
  const shareTxt = (r) => `${pct(r.share)} на ${100 - Math.round(r.share * 100)}`;
  const sumTxt = (r) => `регрессия ${r.reg.touches}/10 · смесь ${r.gmm.touches}/10 · диффузия ${r.dif.touches}/10`;
  const missions = () => [
    { short: 'Три Ады', title: 'Три Ады, одна сцена', text: '40 демонстраций, поровну слева и справа. Регрессия выдаёт одно действие. Смесь в начале поездки выбирает одну из двух своих компонент — левый или правый объезд — и едет по её плану. Диффузия выбирает целую поездку. Обучи всех трёх и прогони по 10 раз: найди Аду, которая каждый раз объезжает чайник, и ту, что задевает его в большинстве прогонов.', controls: [],
      onEnter: (X) => X.setCtl({ share: 0.5, mode: 'chunk', H: 32, kettle: E.KETTLE }),
      bet: { q: 'кто объедет чайник?', options: ['Никто', 'Только регрессия', 'Смесь и диффузия', 'Все трое'], answer: (r) => { const ok = (p) => r[p].touches === 0; return ok('reg') && ok('gmm') && ok('dif') ? 3 : ok('gmm') && ok('dif') ? 2 : ok('reg') ? 1 : 0; } },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Хотя бы одна Ада проехала 10 прогонов из 10 без касаний', test: (r) => ['reg', 'gmm', 'dif'].some((p) => r[p].touches === 0) }, { label: 'Найдена Ада, которая задевает чайник в большинстве прогонов', test: (r) => ['reg', 'gmm', 'dif'].some((p) => r[p].touches >= 6) }],
      summary: (r) => sumTxt(r),
      explain: (r) => `Регрессия задела чайник в <b>${r.reg.touches} прогонах из 10</b>: она едет по средней линии демонстраций, а средняя проходит через чайник. Смесь и диффузия выбирают сторону: смесь объехала слева ${r.gmm.left} раз и справа ${r.gmm.right}, диффузия — ${r.dif.left} и ${r.dif.right}. Данные у всех трёх одни и те же, разница только в том, что модель выдаёт: одно действие или распределение.` },
    { short: 'Доля', title: 'Найди долю, при которой регрессия проезжает', text: 'Подбери долю объездов слева так, чтобы регрессия не задевала чайник, а в демонстрациях остались объезды с обеих сторон.', controls: ['share'],
      bet: { q: 'есть ли такая доля?', options: ['Нет, регрессия задевает при любой', 'Да, уже около 60 на 40', 'Да, только при сильном перекосе'], answer: () => 2 },
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Регрессия проехала 10 из 10 без касаний', test: (r) => r.reg.touches === 0 }, { label: 'Меньшая сторона — не меньше 10% демонстраций', test: (r) => Math.min(r.share, 1 - r.share) >= 0.1 - 1e-9 && Math.min(r.nLeft, r.nRight) >= 1 }],
      summary: (r) => `доля ${shareTxt(r)} → регрессия: ${r.reg.touches} касаний из 10`,
      hint: 'Двигай ползунок шагами по 10% и следи, куда сдвигается средняя линия демонстраций относительно чайника.',
      fail: (r) => (r.reg.touches ? `При ${shareTxt(r)} регрессия задела чайник ${nWord(r.reg.touches, 'раз', 'раза', 'раз')} из 10. Средняя линия всё ещё проходит слишком близко к чайнику.` : 'Регрессия проехала, но у демонстраций должна остаться и вторая сторона.'),
      explain: (r) => `При ${shareTxt(r)} регрессия проехала 10 из 10. Среднее сдвигается к большинству постепенно: при 70 на 30 оно ещё между модами и задевает чайник, и только при перекосе около 80 на 20 выходит из чайника. При этом ни при какой доле регрессия не объезжает со стороны меньшинства: она не выбирает, а усредняет. Усреднение не неизбежно: в симуляторе вождения CARLA при демонстрациях 50 на 50 регрессия в 98% прогонов поворачивала направо, то есть схлопнулась в одну моду. Но гарантии нет ни в том, ни в другом.` },
    { short: 'У проёма', title: 'Убери мультимодальность, не трогая долю', text: 'Доля стоит на 50%. Перетащи чайник так, чтобы регрессия проехала, а чайник остался на маршруте Ады.', controls: ['drag'], drag: true,
      onEnter: (X) => X.setCtl({ share: 0.5, mode: 'chunk', H: 32 }),
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Чайник стоит на прямом пути Ады', test: (r) => r.onRoute }, { label: 'Регрессия проехала 10 из 10', test: (r) => !r.blocked && r.reg.touches === 0 }],
      summary: (r) => (r.blocked ? 'проезда нет' : `чайник (${fmt1(r.kettle.x - E.RX, 0)}; ${fmt1(E.START.y - r.kettle.y, 0)}) см → слева ${r.nLeft}, справа ${r.nRight}; регрессия ${r.reg.touches}/10`),
      hint: 'Сделай так, чтобы с одной стороны объехать было нельзя. Попробуй поставить чайник у края дверного проёма в кухню.',
      fail: (r) => (r.blocked ? 'Так чайник перекрывает проём целиком, и учитель не может проехать. Сдвинь его к одному краю проёма.' : !r.onRoute ? 'Чайник ушёл с маршрута: Ада проедет его и без объезда. Верни его на пунктирную линию.' : `Учитель всё ещё объезжает с двух сторон: слева ${r.nLeft}, справа ${r.nRight}. Найди место, где с одной стороны не хватает места.`),
      explain: (r) => `У края проёма объезд остался один: слева ${r.nLeft}, справа ${r.nRight}. Демонстрации стали одномодальными, и среднее совпало с единственной модой — регрессия проехала. Мультимодальность задают данные, а не модель. На стандартных бенчмарках условных мод почти нет, поэтому регрессия там не хуже: OpenVLA-OFT с L1 даёт 97,1% на LIBERO, с оговоркой авторов про «a consistent strategy per task».` },
    { short: 'Каждый шаг', title: 'Смесь выбирает сторону на каждом шаге', text: 'Чайник снова посередине. Теперь смесь выбирает компоненту заново на каждом шаге, а не один раз на поездку. Найди прогон, в котором Ада-смесь задевает чайник.', controls: ['mode'],
      onEnter: (X) => X.setCtl({ share: 0.5, mode: 'step', H: 32, kettle: E.KETTLE }),
      bet: { q: 'что сделает смесь при выборе на каждом шаге?', options: ['Объедет, как раньше', 'Поедет прямо', 'Будет прыгать между сторонами'], answer: (r) => (r.gmm.touches === 0 ? 0 : r.gmm.maxSw >= 1 ? 2 : 1) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Найден прогон смеси с касанием чайника', test: (r) => r.gmmRuns.some((q) => q.touch) }, { label: 'В этом прогоне сторона сменилась не меньше двух раз', test: (r) => r.gmmRuns.some((q) => q.touch && q.sw >= 2) }],
      summary: (r) => `смесь, ${r.mode === 'step' ? 'на каждом шаге' : `раз в ${r.H} шагов`}: касаний ${r.gmm.touches}, смен стороны до ${r.gmm.maxSw}`,
      hint: 'Проверь, что выбран режим «на каждом шаге». Прогонов много: если такого нет, нажми ещё раз.',
      fail: (r) => (r.mode !== 'step' ? 'Сейчас смесь выбирает сторону один раз на поездку. Переключи режим на «на каждом шаге».' : 'В этих 10 прогонах такого не нашлось. Попробуй ещё раз: зёрна каждый раз новые.'),
      explain: (r) => `Касаний — ${r.gmm.touches} из 10. Соседние шаги берутся из разных компонент: шаг влево, шаг вправо, и Ада топчется посередине, пока не упрётся в чайник. При независимом выборе 50 на 50 за T шагов в среднем набегает (T − 1)/2 смены компоненты; видимых смен стороны меньше, потому что Ада не успевает перебежать. Авторы Diffusion Policy пишут об этом «jittery actions that alternate between the two valid trajectories»; на их Push-T так ведёт себя BeT, который «fails to commit».` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Доступны все ручки: доля, положение чайника, число демонстраций, число компонент смеси, режим выбора стороны и через сколько шагов смесь выбирает заново. Попробуй смесь из одной компоненты: что она делает и почему? А что меняют три компоненты?', final: true,
      action: { label: 'Обучить и прогнать 10 раз', run: (X) => X.run() }, summary: (r) => (r.blocked ? 'проезда нет' : `${r.N} демонстраций, ${shareTxt(r)}, K = ${r.K} → ${sumTxt(r)}`) },
  ];
  const L = makeLab({
    ids: { cv: '#labCv', stats: '#labStats', loss: '#labLoss', mis: '#labMis', share: '#labShare', H: '#labH', N: '#labN', K: '#labK', mode: '#wrapMode', show: '#wrapShow' },
    wrap: { share: '#wrapShare', drag: '#wrapDrag', mode: '#wrapMode', H: '#wrapH', N: '#wrapN', K: '#wrapK', show: '#wrapShow' },
    pols: ['reg', 'gmm', 'dif'], drag: true, missions,
  });
  function init() {
    legend('#labLegend', [['регрессия (MSE)', 'var(--pol-reg)', 'dash'], ['смесь гауссиан', 'var(--pol-gmm)', 'dotted'], ['диффузия', 'var(--pol-dif)'], ['демонстрации', 'var(--ink-3)'], ['касание', 'var(--critical)']]);
    legend('#labLossLegend', [['ошибка обучения регрессии', 'var(--pol-reg)'], ['смеси', 'var(--pol-gmm)']]);
    return L.init();
  }
  return { init, api: L.api, st: L.st };
})();

/* ---------- 5б. Пачки действий на сцене: длина пачки и стыки ---------- */
const ChunkLab = (() => {
  const missions = () => [
    { short: 'Пачка 4', title: 'Короткая пачка: сторона выбирается на каждом стыке', text: 'Смесь выдаёт пачку из 4 шагов: выбирает компоненту, едет по её плану 4 шага, на стыке выбирает заново. До чайника 18 шагов, то есть 4 стыка. Прогони 10 раз.', controls: [],
      onEnter: (X) => X.setCtl({ H: 4 }),
      bet: { q: 'что будет с Адой?', options: ['Объедет: сторона выбрана, и 4 шагов хватает', 'На одном из стыков сменит сторону и заденет чайник', 'Поедет прямо в чайник, как регрессия'], answer: (r) => (r.gmm.touches === 0 ? 0 : r.gmm.maxSw >= 1 ? 1 : 2) },
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'Найден прогон с касанием, в котором на стыке сменилась компонента', test: (r) => r.gmmRuns.some((q) => q.touch && q.seamSwitch >= 1) }],
      summary: (r) => `пачка ${r.H} → касаний ${r.gmm.touches} из 10, смен стороны до ${r.gmm.maxSw}`,
      hint: 'Прогонов много: если в этих 10 касания не было, нажми ещё раз.',
      fail: () => 'В этих 10 прогонах касания со сменой компоненты не нашлось. Нажми ещё раз: зёрна каждый раз новые.',
      explain: (r) => `Касаний — <b>${r.gmm.touches} из 10</b>, смен стороны до ${r.gmm.maxSw}. На сцене путь первого прогона окрашен по выбранной компоненте, точки на нём — стыки пачек. Там, где цвет меняется, новая пачка выбрала другую сторону. Внутри пачки Ада сторону держит; перебегает она только на стыках, и если стык пришёлся на подъезд к чайнику, Ада перебегает прямо перед ним.` },
    { short: 'Длина', title: 'Подбери длину пачки', text: 'Найди самую короткую пачку, при которой Ада объезжает чайник в 10 прогонах из 10 и не меняет сторону после начала объезда. Ползунок под сценой задаёт длину пачки.', controls: ['H'],
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() },
      criteria: [{ label: 'У смеси ни одного касания за 10 прогонов', test: (r) => r.gmm.touches === 0 }, { label: 'Не больше одной смены стороны за прогон', test: (r) => r.gmm.maxSw <= 1 }, { label: 'С пачкой на 2 шага короче Ада задевала чайник', test: (r, s) => s.log.some((q) => q.H === r.H - 2 && q.gmm.touches > 0) }],
      summary: (r) => `пачка ${r.H} → касаний ${r.gmm.touches}, смен стороны до ${r.gmm.maxSw}`,
      hint: 'Смены стороны случаются только на стыках. Сравни длину пачки с тем, через сколько шагов Ада поравняется с чайником: это 18 шагов.',
      fail: (r) => (r.gmm.touches ? `С пачкой ${r.H} Ада задела чайник ${nWord(r.gmm.touches, 'раз', 'раза', 'раз')}: стык пришёлся на подъезд к чайнику. Сделай пачку длиннее.` : 'Без касаний. А пачка на 2 шага короче тоже справится? Проверь.'),
      explain: (r) => `Самая короткая рабочая пачка — <b>${r.H} шагов</b>. Ада поравняется с чайником на 18-м шаге: если стык приходится раньше, новая пачка может выбрать другую сторону. С пачкой от 18 шагов первый стык наступает, когда чайник уже рядом или позади. Длинная пачка проходит миссию, зато всё, что случится внутри пачки, Ада заметит только на следующем стыке: эту цену — плавность против скорости реакции — разберём в уроке 1.7.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Длина пачки от 2 до 32 шагов. Сколько стыков до чайника при пачке в 2 шага и как часто Ада задевает чайник? А при 32?', final: true,
      action: { label: 'Прогнать 10 раз', run: (X) => X.run() }, summary: (r) => `пачка ${r.H} → касаний ${r.gmm.touches} из 10, смен стороны до ${r.gmm.maxSw}` },
  ];
  const L = makeLab({
    ids: { cv: '#chCv', stats: '#chStats', mis: '#chMis', H: '#chH' },
    wrap: { H: '#wrapChH' }, pols: ['gmm'], seams: true, defaults: { H: 4 }, missions,
  });
  function init() {
    legend('#chLegend', [['демонстрации', 'var(--ink-3)'], ['пачка с объездом слева', 'var(--side-l)'], ['пачка с объездом справа', 'var(--side-r)'], ['стык пачек', 'var(--ink)', 'dot'], ['касание', 'var(--critical)']]);
    return L.init();
  }
  return { init, api: L.api, st: L.st };
})();

/* ===================== 6. Стыки пачек: два способа удержать сторону ===================== */
const Seams = (() => {
  const W = 560, H = 320, S = E.SEAM;
  const st = { mode: 'naive', res: null, batchNo: 0, tried: {} };
  let ctl = null;
  const box = () => ({ l: 44, r: W - 14, t: 16, b: H - 30 });
  function draw() {
    const { c, k } = HeroKit.fit($('#seamCv'), W, H), P = KD.pal(), b = box();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const x = (t) => b.l + t / S.T * (b.r - b.l), y = (v) => (b.t + b.b) / 2 - v / 80 * (b.b - b.t) / 2;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [-80, -40, 0, 40, 80]) { c.beginPath(); c.moveTo(b.l, y(v)); c.lineTo(b.r, y(v)); c.stroke(); HeroKit.label(c, k, fmt1(v, 0), b.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let t = 0; t <= S.T; t += 4) HeroKit.label(c, k, String(t), x(t), b.b + 14, { px: 10.5, mono: true, color: P.ink3, halo: false });
    // стыки: новая пачка каждые 4 шага
    c.strokeStyle = P.grid; c.setLineDash([2, 4]); for (let t = S.every; t < S.T; t += S.every) { c.beginPath(); c.moveTo(x(t), b.t); c.lineTo(x(t), b.b); c.stroke(); } c.setLineDash([]);
    // чайник
    const kx0 = x(S.tk - 4), kx1 = x(S.tk + 4), ky0 = y(E.RA + E.RK), ky1 = y(-(E.RA + E.RK));
    c.beginPath(); c.rect(kx0, ky0, kx1 - kx0, ky1 - ky0); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(kx0, ky0, kx1 - kx0, ky1 - ky0); HeroKit.hatch(c, kx0, ky0, kx1, ky1, P.ink3, 7, 1); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.strokeRect(kx0, ky0, kx1 - kx0, ky1 - ky0);
    HeroKit.label(c, k, 'чайник', (kx0 + kx1) / 2, ky0 - 10, { px: 11, weight: 650, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, 'слева', b.l + 8, y(-70), { align: 'left', px: 10.5, color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, 'справа', b.l + 8, y(70), { align: 'left', px: 10.5, color: P.ink3, haloColor: P.bg });
    if (st.res) {
      const runs = st.res.runs, q = runs[0];
      c.lineWidth = 1.2; c.globalAlpha = 0.5;
      for (let i = 1; i < runs.length; i++) { c.strokeStyle = runs[i].touch ? P.bad : P.ink3; c.beginPath(); runs[i].xs.forEach((v, t) => (t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke(); }
      c.globalAlpha = 1;
      for (const ch of q.chunks) { c.strokeStyle = ch.side < 0 ? P.left : P.right; c.lineWidth = 1.3; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(x(ch.t0), y(q.xs[ch.t0])); ch.c.forEach((v, j) => c.lineTo(x(ch.t0 + j + 1), y(v))); c.stroke(); c.globalAlpha = 1; }
      c.strokeStyle = q.touch ? P.bad : P.ink; c.lineWidth = 3.4; c.beginPath(); q.xs.forEach((v, t) => (t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke();
      if (q.touch) { let tt = S.tk; for (let t = S.tk - 4; t <= S.tk + 4; t++) if (Math.abs(q.xs[t]) < E.RA + E.RK) { tt = t; break; } HeroKit.cross(c, x(tt), y(q.xs[tt]), 6, P.bad, 2.4); }
    } else HeroKit.label(c, k, k > 1.5 ? 'нажми «20 прогонов»' : 'нажми «20 прогонов», чтобы увидеть пачки и путь Ады', (b.l + b.r) / 2, b.t + 16, { px: 11, weight: 650, color: P.e2e, haloColor: P.bg });
    HeroKit.label(c, k, 'шаг', b.l - 12, b.b + 14, { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false });
    HeroKit.label(c, k, 'смещение, см', b.l + 2, 9, { align: 'left', px: 10.5, mono: true, color: P.ink3, halo: false });
    const el = $('#seamOut'), names = { naive: 'последняя пачка', te: 'сглаживание', bid: 'согласование' };
    if (st.res) setOut(el, `<b>${names[st.res.mode]}</b>: касаний <b>${st.res.touches} из 20</b>, смен стороны у чайника до ${st.res.maxSw}, проходов сети на шаг — <b>${fmt1(st.res.passes, 2)}</b>. Жирная линия — первый прогон, тонкие серые — остальные 19.`);
    else setOut(el, 'Каждые 4 шага (пунктирные линии) смесь выдаёт новую пачку на 16 шагов вперёд, сторону пачки выбирает заново. Запусти 20 прогонов.');
  }
  function run() {
    const seed0 = 1 + 20 * st.batchNo++, b = E.seamsBatch(st.mode, 20, seed0);
    st.res = { mode: st.mode, runs: b.runs, touches: b.touches, maxSw: b.maxSw, passes: b.passes }; st.tried[st.mode] = { touches: b.touches, passes: b.passes };
    draw(); return Promise.resolve({ mode: st.mode, touches: b.touches, maxSw: b.maxSw, passes: b.passes, tried: Object.assign({}, st.tried) });
  }
  function setMode(m) { st.mode = m; $$('#wrapSeamMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); if (ctl) ctl.update(); }
  const api = { reset() { st.res = null; st.tried = {}; st.batchNo = 0; setMode('naive'); draw(); }, run, setMode, state: () => ({ mode: st.mode, tried: Object.assign({}, st.tried) }) };
  const names = { naive: 'последняя пачка', te: 'сглаживание', bid: 'согласование' };
  const missions = [
    { short: 'Стыки', title: 'Слушаться каждой новой пачки', text: 'Пачка здесь 16 шагов, новая выходит каждые 4 шага, и Ада всегда исполняет самую свежую: на каждом стыке переключается на новую. Сторону каждой пачки смесь выбирает заново, 50 на 50.', controls: [],
      onEnter: (X) => X.setMode('naive'),
      bet: { q: 'в скольких прогонах из 20 Ада заденет чайник?', options: ['Ни в одном', 'В нескольких', 'Почти во всех'], answer: (r) => (r.touches === 0 ? 0 : r.touches < 12 ? 1 : 2) },
      action: { label: '20 прогонов', run: (X) => X.run() },
      summary: (r) => `${names[r.mode]}: касаний ${r.touches} из 20`,
      explain: (r) => `Касаний — <b>${r.touches} из 20</b>. Пачка держит сторону 4 шага, а дальше её сменяет новая, и в половине случаев новая выбирает другую сторону. На графике это видно: бирюзовые и фиолетовые пачки чередуются, а жирный путь Ады перебегает от одной к другой. До чайника Ада успевает перебежать туда и обратно, и стык рядом с чайником почти всегда кончается касанием.` },
    { short: 'Два способа', title: 'Удержи сторону двумя способами', text: 'Попробуй оба способа. Сглаживание: действие на шаге — взвешенное среднее всех пачек, которые его предсказали. Согласование: из нескольких сэмплов новой пачки берём тот, что ближе к продолжению прошлой. Нужно, чтобы после начала объезда сторона не менялась и чтобы за 20 прогонов не было ни одного касания.', controls: ['mode'],
      action: { label: '20 прогонов', run: (X) => X.run() },
      criteria: [{ label: 'Сторона не меняется после начала объезда', test: (r) => r.maxSw === 0 }, { label: 'Ни одного касания за 20 прогонов', test: (r) => r.touches === 0 }, { label: 'Опробованы оба способа', test: (r) => !!r.tried.te && !!r.tried.bid }],
      summary: (r) => `${names[r.mode]}: касаний ${r.touches}, проходов сети на шаг ${fmt1(r.passes, 2)}`,
      hint: 'Начни со сглаживания: оно дешевле. Посмотри, куда уводит Аду среднее двух пачек с разных сторон.',
      fail: (r) => (r.mode === 'te' ? `Сглаживание: касаний ${r.touches} из 20. Пачки с разных сторон усредняются, и Ада снова едет посередине. Попробуй согласование.` : r.mode === 'naive' ? 'Это исходный режим. Выбери один из двух способов.' : (!r.tried.te ? 'Согласование справилось. Теперь проверь и сглаживание, чтобы сравнить цену.' : `Касаний ${r.touches}.`)),
      explain: (r) => `Согласование: ни одного касания и ни одной смены стороны, но сеть вызывают ${fmt1(r.tried.bid.passes, 0)} раза на шаг вместо ${fmt1(r.tried.te ? r.tried.te.passes : 0.25, 2)}. Сглаживание убрало рывки, но не моды: среднее пачек с разных сторон снова ведёт в чайник, касаний ${r.tried.te ? r.tried.te.touches : '—'} из 20. В RTC про такое сглаживание сказано, что оно «produces poor actions». Сами авторы RTC идут третьим путём: замораживают шаги, которые уже исполняются, и дорисовывают остальные. Его разберём в уроке 1.5.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Сравни три режима несколько раз подряд. Почему согласование почти никогда не меняет сторону, даже если сэмплов мало?', final: true, action: { label: '20 прогонов', run: (X) => X.run() }, summary: (r) => `${names[r.mode]}: касаний ${r.touches}, проходов ${fmt1(r.passes, 2)}` },
  ];
  function init() {
    legend('#seamLegend', [['пачка с объездом слева', 'var(--side-l)'], ['пачка с объездом справа', 'var(--side-r)'], ['что исполняет Ада', 'var(--ink)'], ['прогон с касанием', 'var(--critical)']]);
    $$('#wrapSeamMode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    ctl = mountMissions('#seamMis', missions, api, { controls: { mode: '#wrapSeamMode' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ===================== Квиз ===================== */
function renderQuiz(boxSel, Q, scoreSel) {
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $(boxSel); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true }), pm = perms[qi % perms.length];
    pm.forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[pm.indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Регрессия с MSE выберет самое частое действие?', o: ['Да, она идёт за большинством', 'Нет: она выдаёт условное среднее, при 70 на 30 это точка между модами', 'Только если данных много'], a: 1, e: 'В лаборатории при 70 на 30 регрессия задевала чайник: среднее сдвигается к большинству постепенно и выходит из чайника только при перекосе около 80 на 20.' },
    { q: 'Достаточно заменить MSE на L1?', o: ['Да, медиана всегда выбирает одну из мод', 'Нет: L1 даёт медиану по каждой координате, при 50 на 50 решение не единственно', 'L1 ничем не отличается от MSE'], a: 1, e: 'При перевесе одной стороны медиана выбирает её, при равном счёте годится любой ответ между модами. Авторы OpenVLA-OFT сами оговаривают, что с «truly multimodal» данными L1 может не справиться.' },
    { q: 'Гауссиана с выученной дисперсией — это уже распределение действий?', o: ['Да, раз есть дисперсия', 'Нет: мода у неё одна, среднее остаётся средним', 'Да, если дисперсия большая'], a: 1, e: 'Сэмплы такой гауссианы попадают «between two modes». В RT-1 замена корзин на гауссиану стоила 29 процентных пунктов на знакомых задачах. В лаборатории смесь из одной компоненты едет в чайник, как регрессия.' },
    { q: 'Модель хранит для каждого измерения действия свою таблицу корзин и выбирает измерения независимо. Она знает распределение действий целиком?', o: ['Да: корзин много, любая форма распределения описана', 'Нет: по каждому измерению — да, а связи между измерениями в отдельных таблицах нет', 'Да, если измерений не больше двух'], a: 1, e: 'В интерактиве с двумя шагами объезда около половины действий виляли: шаг 1 в одну сторону, шаг 2 в другую, хотя таких демонстраций не было. Связь между измерениями возвращает выбор по очереди — авторегрессия, как в RT-2 и OpenVLA.' },
    { q: 'ACT с CVAE на тесте выбирает разные стили движения?', o: ['Да, каждый раз сэмплирует новый стиль', 'Нет: на тесте латент z ставят в ноль, и политика каждый раз выдаёт одно и то же', 'Только если операторов было несколько'], a: 1, e: 'CVAE помогает при обучении: без него на человеческих демонстрациях успех падал с 35,3 до 2%. При исполнении латент обнуляют, и выбора стиля нет. Подробнее об ACT — в уроке 1.7.' },
    { q: 'Генеративная модель сама по себе даёт плавное движение?', o: ['Да, она же выбирает моду', 'Нет: если сэмплировать каждый шаг независимо, политика прыгает между модами', 'Да, если обучена на многих данных'], a: 1, e: 'В лаборатории смесь с выбором стороны на каждом шаге прыгала между сторонами и задевала чайник. Помогают пачки действий, но смены стороны бывают и на стыках пачек.' },
    { q: 'Сглаживание стыков — усреднение перекрывающихся пачек — безопасно убирает смены стороны?', o: ['Да, усреднение всегда сглаживает', 'Нет: среднее пачек из разных мод — то же усреднение мод', 'Да, если пачки длинные'], a: 1, e: 'В интерактиве со стыками сглаживание вело Аду в чайник почти так же часто, как исполнение последней пачки. В RTC сказано, что оно «not guaranteed to produce valid actions».' },
    { q: 'Диффузия выигрывает у регрессии, потому что данные мультимодальны?', o: ['Да, это доказано на всех бенчмарках', 'Не всегда: на стандартных бенчмарках условных мод почти нет, а при реально конфликтующих демонстрациях — да', 'Нет, мультимодальность ни при чём'], a: 1, e: 'По оценке Mazza и соавторов число условных мод на Push-T, LIBERO и MetaWorld — от 1,01 до 1,07. А на данных разных операторов в ALOHA Unleashed диффузия даёт 70% против 25% у регрессии с L1.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('exp', () => { mis.exp = Exp.init(); }); safe('draw', () => { mis.draw = Draw.init(); }); safe('calib', () => Calib.init());
    safe('bins', () => { mis.bins = Bins.init(); }); safe('lab', () => { mis.lab = Lab.init(); }); safe('chunk', () => { mis.chunk = ChunkLab.init(); }); safe('seams', () => { mis.seams = Seams.init(); });
    safe('quiz', initQuiz);
    window.__l13 = { mis, SPEED, OwnMath, Exp, Draw, Calib, Bins, Lab, ChunkLab, Seams }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
