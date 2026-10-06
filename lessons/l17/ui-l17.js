/* =====================================================================
   ui-l17.js — урок 1.7 «ACT: action chunking». Интерактивы — миссии на
   живых сценах (shared/missions.js), у каждого своя механика:
   накопление ошибки (статистика по 200 прогонам), лаборатория с пачками
   1, 10 и 100 рядом (сравнительный симулятор), «Собери ACT» (песочница
   архитектуры), L1 / z = 0 / случайный z (прогноз перед запуском),
   temporal ensembling изнутри («мысли» модели), задержка и стыки
   (переключатели и ползунки условий), квиз. Движок — l17/engine.js (ACT).
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение проигрывания для автотестов; на результаты не влияет
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
const css = (n) => HeroKit.css(n);
const pal = () => ({ bg: css('--surface-2'), grid: css('--line'), ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), e2e: css('--e2e'), cl: css('--classic'), bad: css('--critical'), good: css('--good'), surf: css('--surface'), k1: css('--k1'), k10: css('--k10'), k100: css('--k100'), kyou: css('--kyou'), up: css('--up'), down: css('--down'), l1: css('--c-l1'), act: css('--c-act'), rnd: css('--c-rnd'), warn: css('--warning') });
const fmt1 = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: d == null ? 0 : Math.min(d, 2) }).replace('-', '−');
const fx = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }).replace('-', '−');
const sec = (v) => fx(v, 2).replace(/0$/, '').replace(/,$/, '') + ' с';
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, dash]) => box.append(h('span', null, h('i', { class: dash === true ? 'dash' : dash || null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (typeof el === 'string') el = $(el); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
/** Проигрывание кадров: dt — миллисекунд на кадр при обычной скорости. Конец — по таймеру, даже если сцена ушла с экрана. */
function playback(n, dt, onEnd) {
  const pl = { t0: performance.now(), n, dt, done: false, timer: 0 };
  pl.index = () => Math.min(pl.n - 1, Math.floor((performance.now() - pl.t0) * SPEED.k / pl.dt));
  pl.arm = () => { clearTimeout(pl.timer); const left = Math.max(0, (pl.n - 1) * pl.dt / SPEED.k - (performance.now() - pl.t0)); pl.timer = setTimeout(() => { pl.done = true; onEnd(); }, left + 40); };
  pl.setN = (n2) => { pl.n = n2; pl.arm(); };
  pl.arm();
  return pl;
}
/** График: на узком экране логическая высота больше, чтобы подписи не слипались. */
function plotFit(cv, W, H, Hn) {
  const hh = cv.getBoundingClientRect().width < 460 ? Hn : H, ar = `${W} / ${hh}`;
  if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
  const f = HeroKit.fit(cv, W, hh); return { c: f.c, k: f.k, H: hh };
}
function fitAR(cv, W, H) { const ar = `${W} / ${H}`; if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; } return HeroKit.fit(cv, W, H); }
const niceUp = (v, steps) => steps.find((s) => s >= v) || steps[steps.length - 1];
function wireRange(id, fmt, onInput) {
  const inp = $('#' + id), out = inp.nextElementSibling;
  const sync = () => { if (out) out.textContent = fmt(+inp.value); setRangeFill(inp); };
  inp.addEventListener('input', () => { sync(); onInput(+inp.value); });
  sync();
  return { set(v) { inp.value = v; sync(); }, get v() { return +inp.value; }, sync };
}
function wireSeg(sel, attr, onPick) {
  const box = $(sel), btns = $$('button', box);
  const set = (v) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(v))));
  btns.forEach((b) => b.addEventListener('click', () => { set(b.dataset[attr]); onPick(b.dataset[attr]); }));
  return { set };
}
function arrow(c, x0, y0, x1, y1, col, lw) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = 8;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw || 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - L * Math.cos(a - 0.45), y1 - L * Math.sin(a - 0.45)); c.lineTo(x1 - L * Math.cos(a + 0.45), y1 - L * Math.sin(a + 0.45)); c.closePath(); c.fill();
}

/* ---------- 1. ALOHA: результаты и видео по нажатию ---------- */
function initAloha() {
  const R = [['Slot Battery', 96], ['Put On Shoe', 92], ['Slide Ziploc', 88], ['Open Cup', 84], ['Prep Tape', 64], ['Thread Velcro', 20]];
  const box = $('#alohaBars');
  R.forEach(([n, v]) => box.append(h('div', { class: 'rb' }, h('span', null, n), h('span', { class: 'bar' }, h('i', { style: `--v:${v}%` })), h('b', null, v + '%'))));
  $$('.vid').forEach((b) => b.addEventListener('click', () => {
    const v = h('video', { src: b.dataset.src, controls: true, autoplay: true, muted: true, playsinline: true, preload: 'auto' });
    v.muted = true; const wrap = h('div', { class: 'vid-box' }, v); b.replaceWith(wrap);
  }));
}

/* ---------- 2. Накопление ошибки: 200 прогонов ---------- */
const ErrLab = (() => {
  const KS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 100];
  const st = { ki: 7, lam: 0.97, s: null, shown: ACT.MC.N, anim: null, hide: false };
  let ctl = null, rk = null, rl = null;
  const ctl0 = () => ctl || { ctx: { done: [] } };
  const k = () => KS[st.ki];
  const lamTxt = (l) => fx(l, 2);
  function compute() { st.s = ACT.mcStats(k(), st.lam); }
  function draw() {
    const cv = $('#errCv'), W = 640, { c, k: kk, H } = plotFit(cv, W, 300, 440), P = pal(), s = st.s;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const R = niceUp(3.2 * s.sdStep, [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 60, 80]), NB = 40, bw = 2 * R / NB;
    const L = 16, Rr = W - 16, ax = (v) => L + (v + R) / (2 * R) * (Rr - L);
    const n = st.shown, hist = (arr) => { const b = new Array(NB).fill(0); let lo = 0, hi = 0; for (let i = 0; i < n; i++) { const v = arr[i]; if (v < -R) lo++; else if (v >= R) hi++; else b[Math.min(NB - 1, Math.floor((v + R) / bw))]++; } return { b, lo, hi }; };
    const hs = hist(s.step), hc = hist(s.chunk), mx = Math.max(4, ...hs.b, ...hc.b), hid = st.hide;
    const gap = 26 * kk, rowH = (H - 3 * gap - 18 * kk) / 2, rows = [{ hg: hs, col: P.k1, top: gap, name: 'пошаговая политика', sd: s.sdStep }, { hg: hc, col: P.e2e, top: 2 * gap + rowH, name: k() === 1 ? 'пачка k = 1' : `пачка из ${k()} действий`, sd: s.sdChunk }];
    for (const r of rows) {
      const base = r.top + rowH;
      c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(L, base + 0.5); c.lineTo(Rr, base + 0.5); c.stroke();
      c.setLineDash([3, 4]); c.beginPath(); c.moveTo(ax(0), r.top - 4); c.lineTo(ax(0), base); c.stroke(); c.setLineDash([]);
      if (hid) { HeroKit.label(c, kk, `${r.name} · ещё не прогоняли`, L + 2, r.top - 10 * kk, { align: 'left', px: 12, weight: 700, color: P.ink3, haloColor: P.bg }); continue; }
      c.fillStyle = r.col;
      r.hg.b.forEach((v, i) => { if (!v) return; const hh = v / mx * (rowH - 6); c.fillRect(ax(-R + i * bw) + 0.6, base - hh, (Rr - L) / NB - 1.2, hh); });
      HeroKit.label(c, kk, `${r.name} · σ = ${fx(r.sd, 2)} см`, L + 2, r.top - 10 * kk, { align: 'left', px: 12, weight: 700, color: P.ink, haloColor: P.bg });
      if (r.hg.lo) { arrow(c, L + 34, base - 10, L + 6, base - 10, P.bad, 2); HeroKit.label(c, kk, String(r.hg.lo), L + 46, base - 10, { color: P.bad, px: 11, weight: 700, mono: true, haloColor: P.bg }); }
      if (r.hg.hi) { arrow(c, Rr - 34, base - 10, Rr - 6, base - 10, P.bad, 2); HeroKit.label(c, kk, String(r.hg.hi), Rr - 46, base - 10, { color: P.bad, px: 11, weight: 700, mono: true, haloColor: P.bg }); }
    }
    const ty = H - 10 * kk;
    for (const v of [-R, -R / 2, 0, R / 2, R]) HeroKit.label(c, kk, (v > 0 ? '+' : '') + fmt1(v, 1), ax(v), ty, { px: 10.5, mono: true, color: P.ink3, halo: false, align: v === -R ? 'left' : v === R ? 'right' : 'center' });
  }
  function out() {
    const s = st.s, kk = k(), r = s.ratio;
    if (st.hide) { setOut('#errOut', `Решений за 4 с: пошаговая — ${s.decStep}, пачка из ${kk} — ${s.decChunk}. Сделай ставку и прогони 200 эпизодов.`); return; }
    const cmp = kk === 1 ? 'это та же пошаговая политика' : r <= 0.98 ? `в ${fmt1(1 / r, 1)} раза меньше` : r >= 1.02 ? `в ${fmt1(r, 1)} раза <b>больше</b>` : 'почти так же';
    setOut('#errOut', `Разброс σ: пошаговая <b>${fx(s.sdStep, 2)} см</b>, пачка из ${kk} — <b>${fx(s.sdChunk, 2)} см</b>, ${cmp}. Решений за 4 с: ${s.decStep} и ${s.decChunk}.`);
  }
  function render() { draw(); out(); }
  function sync() { compute(); if (!st.anim) st.shown = ACT.MC.N; render(); if (ctl) ctl.update(); }
  function set(o) { if (o.k != null) { st.ki = KS.indexOf(o.k); rk.set(st.ki); } if (o.lam != null) { st.lam = o.lam; rl.set(Math.round(o.lam * 100)); } sync(); }
  function run() {
    compute(); st.hide = false; st.shown = 0; render();
    return new Promise((res) => {
      const t0 = performance.now(), dur = 1200 / SPEED.k;
      st.anim = true;
      const tick = () => { const f = Math.min(1, (performance.now() - t0) / dur); st.shown = Math.max(1, Math.round(f * ACT.MC.N)); draw(); if (f < 1) setTimeout(tick, 30); else { st.anim = null; render(); res(state()); } };
      setTimeout(tick, 30);
    });
  }
  const state = () => ({ k: k(), lam: st.lam, ratio: st.s.ratio, sdStep: st.s.sdStep, sdChunk: st.s.sdChunk });
  const api = { reset() { st.hide = true; set({ k: 10, lam: 0.97 }); }, state, set, run };
  const halfK = (lam) => KS.find((q) => q > 1 && ACT.mcStats(q, lam).ratio <= 0.5);
  const missions = [
    { short: 'Ставка', title: 'Уже или шире', text: 'Обе политики одинаково ошибаются на каждом решении. Пошаговая решает 200 раз за эпизод, пачка из 10 действий — 20 раз, но между решениями едет вслепую. λ = 0,97: система сама понемногу гасит отклонение.', controls: [],
      onEnter: (X) => X.set({ k: 10, lam: 0.97 }),
      bet: { q: 'каким будет разброс у пачки из 10 действий?', options: ['Уже, чем у пошаговой', 'Шире', 'Такой же'], answer: (r) => (r.ratio < 0.9 ? 0 : r.ratio > 1.1 ? 1 : 2) },
      action: { label: 'Прогнать 200 раз', run: (X) => X.run() },
      summary: (r) => `k = ${r.k}, λ = ${lamTxt(r.lam)}: σ ${fx(r.sdStep, 2)} и ${fx(r.sdChunk, 2)} см`,
      explain: (r) => `Разброс пачки — <b>${fx(r.sdChunk, 2)} см</b> против <b>${fx(r.sdStep, 2)} см</b> у пошаговой политики, в ${fmt1(1 / r.ratio, 1)} раза меньше. Решений в 10 раз меньше, а между решениями устойчивая система сама гасит отклонение. Пошаговая политика на каждом шаге добавляет свою ошибку и чуть-чуть уводит дальше.` },
    { short: 'Вдвое', title: 'Вдвое меньше разброс', text: 'Найди длину пачки, при которой разброс вдвое меньше, чем у пошаговой политики. Устойчивость оставь меньше 1.', controls: ['k', 'lam'],
      onEnter: (X) => X.set({ k: 1 }),
      criteria: [{ label: 'λ меньше 1', test: (r, s) => s.lam < 1 }, { label: 'Разброс пачки не больше половины пошагового', test: (r, s) => s.k > 1 && s.ratio <= 0.5 }],
      hint: 'Начни с k = 2 и прибавляй. Смотри на σ под графиком.',
      explain: (r) => { const hk = halfK(r.lam), r3 = hk && hk > 2 ? ACT.mcStats(KS[KS.indexOf(hk) - 1], r.lam).ratio : null; return `При λ = ${lamTxt(r.lam)} разброс вдвое меньше начиная с <b>k = ${hk}</b>${r3 ? ` (k = ${KS[KS.indexOf(hk) - 1]} даёт ${fmt1(r3, 2)} от пошагового)` : ''}. Чем длиннее пачка, тем меньше решений и тем дольше система сама гасит ошибку между ними. Подвинь λ к 0,99: разброс пошаговой политики начнёт расти экспоненциально по горизонту — об этом работа COLT 2025.`; } },
    { short: 'Вред', title: 'Когда пачка вредит', text: 'Теперь найди устойчивость λ, при которой пачка хуже пошаговой политики. Длину пачки можно не менять.', controls: ['k', 'lam'],
      criteria: [{ label: 'Разброс пачки больше, чем у пошаговой', test: (r, s) => s.k > 1 && s.ratio > 1 }],
      hint: 'Сдвинь λ правее 1: система начинает сама разгонять отклонение.',
      explain: (r) => `При λ = ${lamTxt(r.lam)} отклонение без управления растёт на ${fmt1((r.lam - 1) * 100, 0)}% за каждые 20 мс. Пошаговая политика гасит рост на каждом шаге, как эксперт, а пачку исполняют вслепую: за ${r.k} шагов отклонение успевает вырасти в ${fmt1(Math.pow(r.lam, r.k), 1)} раза. Так говорит и теория: по ICLR 2026 длинная пачка ограничивает накопление ошибки, только если система устойчива без обратной связи. Для неустойчивых систем нужен шум при сборе демонстраций, чтобы в данных были поправки.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй длину пачки и устойчивость. Посмотри, как растёт разброс пошаговой политики, когда λ подходит к 1, и при какой λ вредит даже пачка из 100 действий.', final: true },
  ];
  function init() {
    legend('#errLegend', [['пошаговая политика: решение на каждом шаге', 'var(--k1)'], ['пачка: решение раз в k шагов', 'var(--e2e)']]);
    rk = wireRange('errK', (v) => String(KS[v]), (v) => { st.ki = v; sync(); });
    rl = wireRange('errLam', (v) => fx(v / 100, 2), (v) => { st.lam = v / 100; sync(); });
    compute();
    ctl = mountMissions('#errMis', missions, api, { controls: { k: '#wrapEk', lam: '#wrapElam' }, onStep: (i) => { st.hide = i === 0 && !ctl0().ctx.done[0]; render(); } });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 3. Лаборатория: пачки 1, 10 и 100 рядом ---------- */
const ChunkLab = (() => {
  const L = ACT.LAB, W = 760, LH = 120, PADY = 10, S = 820, OX = 30, FRAME = 20 / 1.6; // мс на кадр: проигрываем в 1,6 раза быстрее жизни
  const X = (x) => OX + x * S, Y = (i, y) => PADY + i * LH + LH / 2 + (0.03 - y) * S;
  const st = { mis: 0, lanes: [], pauses: 'short', pushV: 7, push: null, runs: null, play: null, show: true, cmp: true, k: 10, ex: 10, te: false, m: 0.01, hist: [] };
  let ctl = null, ui = {};
  const pushSec = (v) => (v ? Math.round((0.4 + 0.1 * (v - 1)) * 10) / 10 : null);
  const kCol = (k, P) => (k === 1 ? P.k1 : k === 10 ? P.k10 : k === 100 ? P.k100 : P.e2e);
  const kVar = (k) => (k === 1 ? 'var(--k1)' : k === 10 ? 'var(--k10)' : k === 100 ? 'var(--k100)' : 'var(--e2e)');
  /** Дорожки и условия текущей миссии. */
  function config() {
    const m = st.mis;
    if (m === 0) { st.pauses = 'short'; st.push = null; st.lanes = [1, 10, 100].map((k) => ({ k, ex: k, te: false })); }
    else if (m === 1) { st.pauses = 'short'; st.push = pushSec(st.pushV) == null ? null : { t: Math.round(pushSec(st.pushV) / L.DT) }; st.lanes = [10, 100].map((k) => ({ k, ex: k, te: false })); }
    else if (m === 2) { st.pauses = 'long'; st.push = { x: L.XPUSH }; st.lanes = [{ k: st.k, ex: st.k, te: false, one: true }]; }
    else if (m === 3) { st.pauses = 'long'; st.push = { x: L.XPUSH }; st.lanes = [{ k: st.k, ex: Math.min(st.ex, st.k), te: false, one: true }]; }
    else {
      st.push = pushSec(st.pushV) == null ? null : { t: Math.round(pushSec(st.pushV) / L.DT) };
      st.lanes = [{ k: st.k, ex: Math.min(st.ex, st.k), te: st.te, m: st.m, you: true }].concat(st.cmp ? [1, 10, 100].map((k) => ({ k, ex: k, te: false })) : []);
    }
  }
  const laneName = (ln) => (ln.you ? 'твоя рука: ' : '') + `k = ${ln.k}` + (ln.te ? `, TE m = ${fx(ln.m, 2)}` : ln.ex < ln.k ? `, исполнять ${ln.ex}` : '');
  const laneCol = (ln, P) => (ln.you ? P.kyou : ln.one ? P.e2e : kCol(ln.k, P));
  const laneVar = (ln) => (ln.you ? 'var(--kyou)' : ln.one ? 'var(--e2e)' : kVar(ln.k));
  function compute(push) {
    return st.lanes.map((ln) => ACT.labRun({ k: ln.k, exec: ln.ex, te: ln.te, m: ln.m, pauses: st.pauses, push: push || undefined }));
  }
  const nFrames = () => Math.max(...st.runs.map((r) => r.fr.length));
  function summary() {
    return { mis: st.mis, pauses: st.pauses, push: st.runs[0].pushT != null ? st.runs[0].pushT * L.DT : st.push && st.push.t != null ? st.push.t * L.DT : null,
      lanes: st.runs.map((r, i) => ({ k: r.k, ex: r.ex, te: r.te, m: r.m, onShelf: r.onShelf, released: r.released, stuck: r.stuck, T: r.T, pauseT: r.pauseT, passed: r.passed, react: r.react, reactSteps: r.reactSteps, jumps: r.jumps, decisions: r.decisions, pushT: r.pushT, miss: r.rel ? Math.abs(r.rel[1] - ACT.labY(L.L)) : null, you: !!st.lanes[i].you })) };
  }
  function run() {
    config(); st.runs = compute(st.push); st.end = null;
    $('#chunkPushBtn').disabled = !(st.mis === 1 || st.mis === 4);
    return new Promise((res) => {
      st.play = playback(nFrames(), FRAME, () => { st.play = null; $('#chunkPushBtn').disabled = true; render(); const s = summary(); st.hist.push(s); res(s); });
      render();
    });
  }
  /** Толчок прямо сейчас: пересчитываем дорожки с толчком на текущем шаге и продолжаем проигрывание. */
  function pushNow() {
    if (!st.play || !(st.mis === 1 || st.mis === 4)) return false;
    const i = st.play.index() + 1; st.push = { t: i }; st.runs = compute(st.push);
    const v = Math.round((i * L.DT - 0.4) / 0.1) + 1; if (v >= 1 && v <= 36) { st.pushV = v; ui.pushT.set(v); }
    st.play.setN(nFrames()); render(); return true;
  }
  /* ----- рисование ----- */
  function drawHand(c, P, x, y, mx, my, col, i) {
    const hx = X(x), hy = Y(i, y), cx = X(mx), cy = Y(i, my), r = 0.018 * S;
    c.fillStyle = col; c.globalAlpha = 0.9; c.beginPath(); c.roundRect ? c.roundRect(hx - r - 9, hy - 0.03 * S, 7, 0.06 * S, 3) : c.rect(hx - r - 9, hy - 0.03 * S, 7, 0.06 * S); c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.arc(cx + r * 0.95, cy, r * 0.45, -1.2, 1.2); c.strokeStyle = col; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.4; c.strokeStyle = col; c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.55, 0, 7); c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 1.2; c.stroke(); c.globalAlpha = 1;
  }
  function draw() {
    const cv = $('#chunkCv'), n = st.lanes.length, H = n * LH + 2 * PADY, { c, k } = fitAR(cv, W, H), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 0.05 * S, P.grid);
    const D = ACT.labData(st.pauses).D, idx = st.play ? st.play.index() : st.runs ? Infinity : 0;
    for (let li = 0; li < n; li++) {
      const top = PADY + li * LH, ln = st.lanes[li], col = laneCol(ln, P), run = st.runs && st.runs[li];
      if (li) { c.strokeStyle = P.ink3; c.globalAlpha = 0.5; c.lineWidth = 1; c.beginPath(); c.moveTo(0, top + 0.5); c.lineTo(W, top + 0.5); c.stroke(); c.globalAlpha = 1; }
      // полка и зона, куда ставить кружку
      const sx0 = X(L.L - L.SHELF), sx1 = X(L.L + L.SHELF), sy0 = Y(li, L.SHELF), sy1 = Y(li, -L.SHELF);
      c.fillStyle = P.good; c.globalAlpha = 0.1; c.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0); c.globalAlpha = 1;
      c.strokeStyle = P.good; c.globalAlpha = 0.6; c.setLineDash([4, 3]); c.lineWidth = 1.3; c.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0); c.setLineDash([]); c.globalAlpha = 1;
      c.beginPath(); c.rect(sx1 + 6, top + 8, 10, LH - 16); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(sx1 + 6, top + 8, 10, LH - 16); HeroKit.hatch(c, sx1 + 6, top + 8, sx1 + 16, top + LH - 8, P.ink3, 5, 1);
      // демонстрации
      c.strokeStyle = P.ink3; c.globalAlpha = 0.28; c.lineWidth = 1;
      for (const d of D) { c.beginPath(); d.pts.forEach((p, j) => (j ? c.lineTo(X(p[0]), Y(li, p[1])) : c.moveTo(X(p[0]), Y(li, p[1])))); c.stroke(); }
      c.globalAlpha = 1;
      // отметка паузы
      if (st.pauses !== 'none') { const px = X(L.PX); c.strokeStyle = P.ink3; c.setLineDash([2, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(px, top + 22); c.lineTo(px, top + LH - 6); c.stroke(); c.setLineDash([]); }
      HeroKit.label(c, k, laneName(ln), 8, top + 13, { align: 'left', px: 12, weight: 750, color: col, haloColor: P.bg });
      if (li === 0) {
        if (st.pauses !== 'none') HeroKit.label(c, k, st.pauses === 'long' ? 'пауза ≈ 0,6 с' : 'пауза ≈ 0,3 с', X(L.PX), top + 13, { px: 11, color: P.ink3, haloColor: P.bg });
        HeroKit.label(c, k, 'полка', (sx0 + sx1) / 2, top + 13, { px: 11, color: P.good, weight: 700, haloColor: P.bg });
      }
      if (!run) { drawHand(c, P, 0, 0, 0, 0, col, li); continue; }
      const fr = run.fr, i = Math.min(idx, fr.length - 1);
      // пройденный путь и стыки пачек
      c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath();
      for (let j = 0; j <= i; j++) { const p = fr[j]; j ? c.lineTo(X(p[2]), Y(li, p[3])) : c.moveTo(X(p[2]), Y(li, p[3])); } c.stroke();
      if (!run.te && run.ex >= 5) { c.fillStyle = col; for (const t of run.dec) { if (t > i) break; const p = fr[Math.max(0, t - 1)] || fr[0]; c.beginPath(); c.arc(X(p[2]), Y(li, p[3]), 2.6, 0, 7); c.fill(); } }
      // текущая пачка: исполняемая часть пунктиром, хвост — точками
      if (st.show && i < fr.length - 1) {
        let ch = null; for (const q of run.chunks) { if (q.t <= i) ch = q; else break; }
        if (ch) {
          const ex = ch.ex || 1, g = ch.g || [0, 0];
          c.lineWidth = 1.6; c.strokeStyle = col; c.setLineDash([5, 4]); c.beginPath();
          ch.pts.slice(0, Math.max(ex, 2)).forEach((p, j) => (j ? c.lineTo(X(p.x + g[0]), Y(li, p.y + g[1])) : c.moveTo(X(p.x + g[0]), Y(li, p.y + g[1])))); c.stroke();
          if (ch.pts.length > ex) { c.setLineDash([1.5, 4]); c.globalAlpha = 0.55; c.beginPath(); ch.pts.slice(ex - 1).forEach((p, j) => (j ? c.lineTo(X(p.x + g[0]), Y(li, p.y + g[1])) : c.moveTo(X(p.x + g[0]), Y(li, p.y + g[1])))); c.stroke(); c.globalAlpha = 1; }
          c.setLineDash([]);
        }
      }
      const p = fr[i];
      if (run.pushT != null && i >= run.pushT && i < run.pushT + 30) { arrow(c, X(p[2]), Y(li, p[3]) + 34, X(p[2]), Y(li, p[3]) + 17, P.bad, 2.4); HeroKit.label(c, k, 'толчок', X(p[2]) + 26, Y(li, p[3]) + 30, { px: 11, color: P.bad, weight: 700, haloColor: P.bg }); }
      drawHand(c, P, p[0], p[1], p[2], p[3], col, li);
      if (i >= fr.length - 1) {
        if (run.released) { (run.onShelf ? HeroKit.check : HeroKit.cross)(c, X(p[2]) + 24, Y(li, p[3]) - 22, 6, run.onShelf ? P.good : P.bad, 2.6); }
        else HeroKit.label(c, k, run.stuck ? 'застряла' : 'не успела', X(p[2]), Y(li, p[3]) + 30, { px: 12, weight: 750, color: P.bad, haloColor: P.bg });
      }
    }
    drawTl();
  }
  function drawTl() {
    const cv = $('#chunkTl'), n = st.lanes.length, RH = 20, H = 24 + n * RH + 6, { c, k } = fitAR(cv, W, H), P = pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const T0 = 96, T1 = W - 14, TM = L.TMAX * L.DT, tx = (t) => T0 + t / TM * (T1 - T0);
    for (let s = 0; s <= TM; s++) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(tx(s), 18); c.lineTo(tx(s), H - 4); c.stroke(); HeroKit.label(c, k, s + ' с', tx(s), 9, { px: 10.5, mono: true, color: P.ink3, halo: false, align: s === 0 ? 'left' : s === TM ? 'right' : 'center' }); }
    const idx = st.play ? st.play.index() : Infinity;
    st.lanes.forEach((ln, li) => {
      const y = 24 + li * RH + RH / 2, col = laneCol(ln, P), run = st.runs && st.runs[li];
      HeroKit.label(c, k, ln.you ? 'твоя' : `k = ${ln.k}`, 6, y, { align: 'left', px: 11, weight: 700, color: col, halo: false });
      if (!run) return;
      const end = Math.min(run.fr.length - 1, idx);
      c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 6; c.lineCap = 'butt'; c.beginPath(); c.moveTo(tx(0), y); c.lineTo(tx(end * L.DT), y); c.stroke(); c.globalAlpha = 1;
      if (!run.te) { c.strokeStyle = col; c.lineWidth = run.ex < 5 ? 0.6 : 1.6; for (const t of run.dec) { if (t > end) break; c.beginPath(); c.moveTo(tx(t * L.DT), y - 7); c.lineTo(tx(t * L.DT), y + 7); c.stroke(); } }
      if (run.pushT != null && run.pushT <= end) { const px = tx(run.pushT * L.DT); c.fillStyle = P.bad; c.beginPath(); c.moveTo(px, y - 1); c.lineTo(px - 5, y + 8); c.lineTo(px + 5, y + 8); c.closePath(); c.fill(); }
      if (end >= run.fr.length - 1 && run.released) (run.onShelf ? HeroKit.check : HeroKit.cross)(c, tx(end * L.DT) + 9, y, 4, run.onShelf ? P.good : P.bad, 2);
    });
    if (!st.runs && st.push && st.push.t != null) { const px = tx(st.push.t * L.DT); c.strokeStyle = P.bad; c.setLineDash([3, 3]); c.lineWidth = 1.4; c.beginPath(); c.moveTo(px, 18); c.lineTo(px, H - 4); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'толчок', px + 4, H - 10, { align: 'left', px: 10.5, color: P.bad, weight: 700, halo: false }); }
    if (st.play) { const x = tx(idx * L.DT); c.strokeStyle = P.ink; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 18); c.lineTo(x, H - 4); c.stroke(); }
  }
  function out() {
    const P = st.runs, idx = st.play ? st.play.index() : Infinity;
    const rows = st.lanes.map((ln, li) => {
      const r = P && P[li], name = `<i style="--c:${laneVar(ln)}"></i><b>${laneName(ln)}</b>`;
      if (!r) return `<div class="lo">${name}<span>${st.mis === 2 || st.mis === 3 ? 'толчок придёт после паузы, сразу после начала новой пачки' : 'готова к запуску'}</span></div>`;
      if (idx < r.fr.length - 1) return `<div class="lo">${name}<span>в пути · ${fx(idx * L.DT, 1)} с</span></div>`;
      const parts = [];
      parts.push(r.onShelf ? `<span class="ok">на полке за ${fx(r.T, 1)} с</span>` : r.released ? `<span class="bad">мимо полки на ${fx(Math.abs(r.rel[1] - ACT.labY(L.L)) * 100, 0)} см</span>` : `<span class="bad">${r.stuck ? 'застряла у паузы' : 'не довезла за 8 с'}</span>`);
      if (st.pauses !== 'none') parts.push(r.passed ? `у паузы ${fx(r.pauseT, 1)} с` : 'паузу не прошла');
      if (r.pushT != null) parts.push(r.reactSteps != null ? `${r.te ? 'вернулась на путь' : 'реакция'} через ${fx(r.react, 2)} с` : 'на толчок не успела');
      parts.push(`рывков ${r.jumps}`);
      return `<div class="lo">${name}${parts.map((t) => `<span>${t}</span>`).join('<span>·</span>')}</div>`;
    });
    setOut('#chunkOut', rows.join(''));
  }
  function render() { draw(); out(); }
  function reset() { st.runs = null; if (st.play) return; config(); render(); }
  function setCtl(o) {
    if (o.k != null) { st.k = o.k; ui.k.set(o.k); }
    if (o.ex != null) st.ex = o.ex;
    const inp = $('#chunkEx'); inp.max = String(st.k); if (st.ex > st.k) st.ex = st.k; ui.ex.set(st.ex);
    if (o.pushV != null) { st.pushV = o.pushV; ui.pushT.set(o.pushV); }
    if (o.te != null) { st.te = o.te; $('#chunkTe').checked = o.te; }
    if (o.m != null) { st.m = o.m; ui.m.set(Math.round(o.m * 100)); }
    if (o.pauses != null) { st.pauses = o.pauses; ui.pauses.set(o.pauses); }
    if (o.cmp != null) { st.cmp = o.cmp; $('#chunkCmp').checked = o.cmp; }
    reset(); if (ctl) ctl.update();
  }
  const state = () => ({ k: st.k, ex: st.ex, pushV: st.pushV, te: st.te, m: st.m, pauses: st.pauses, mis: st.mis });
  const api = { reset() { st.hist = []; setCtl({ k: 10, ex: 10, pushV: 7, te: false, m: 0.01, pauses: 'short', cmp: true }); }, run, pushNow, setCtl, state };
  const act = { label: 'Прогнать', run: (Xa) => Xa.run() };
  const ln = (r, k) => r.lanes.find((q) => q.k === k && !q.you);
  const stat = (l) => (l.onShelf ? 'на полке' : l.released ? 'мимо' : l.stuck ? 'застряла' : 'не довезла');
  const missions = [
    { short: 'Кто довезёт', title: 'Кто довезёт кружку', text: 'На трёх дорожках одна и та же политика, разная только длина пачки: 1, 10 и 100 действий. Пачка из 100 действий — это 2 секунды движения. В демонстрациях оператор стоял у отметки «пауза» около 0,3 с.', controls: ['show'],
      bet: { q: 'кто довезёт кружку до полки?', options: ['Только k = 1', 'k = 10 и k = 100', 'Все три', 'Никто'], answer: (r) => { const d = r.lanes.map((l) => l.onShelf); return d[0] && d[1] && d[2] ? 2 : !d[0] && d[1] && d[2] ? 1 : d[0] && !d[1] && !d[2] ? 0 : !d[0] && !d[1] && !d[2] ? 3 : -1; } },
      action: act,
      criteria: [{ label: 'Хотя бы одна кружка на полке', test: (r) => r.lanes.some((l) => l.onShelf) }, { label: 'Одна из рук застряла у паузы', test: (r) => r.lanes.some((l) => l.stuck) }],
      summary: (r) => r.lanes.map((l) => `k=${l.k}: ${stat(l)}`).join(' · '),
      explain: (r) => `Застряла рука с <b>k = 1</b>. В точке паузы в данных есть и «стоять», и «ехать», но кадров «стоять» намного больше: оператор стоял там по 12–19 шагов. Медиана — «стоять», а сколько захват уже стоит, пошаговая политика не знает. Пачка несёт продолжение движения: после паузы оператор поехал дальше, и это попадает в пачку. Рука с k = 10 простояла у паузы ${fx(ln(r, 10).pauseT, 1)} с, с k = 100 — ${fx(ln(r, 100).pauseT, 1)} с. Заметь и рывки: у k = 1 их ${ln(r, 1).jumps}, у k = 100 — ${ln(r, 100).jumps}. В абляции ACT без temporal ensembling успех был 1% при k = 1 и 44% при k = 100.` },
    { short: 'Толчок', title: 'Толчок посреди пачки', text: 'Теперь кружку толкнут: она съедет в захвате на 6 см вбок. Ползунок выбирает момент толчка, а кнопка «Толкнуть сейчас» толкает прямо во время движения. Найди момент, при котором рука с k = 100 промахнётся мимо полки, а рука с k = 10 — нет.', controls: ['show', 'pushT', 'pushBtn'],
      bet: { q: 'кто быстрее вернёт кружку на путь?', options: ['k = 10', 'k = 100', 'Одинаково'], answer: (r) => { const a = r.lanes[0].react, b = r.lanes[1].react; if (a == null && b == null) return 2; if (b == null) return 0; if (a == null) return 1; return Math.abs(a - b) < 0.03 ? 2 : a < b ? 0 : 1; } },
      action: act,
      criteria: [{ label: 'Рука с k = 100 не попала на полку', test: (r) => r.push != null && !r.lanes[1].onShelf }, { label: 'Рука с k = 10 попала', test: (r) => r.lanes[0].onShelf }],
      summary: (r) => `толчок ${r.push == null ? 'не было' : 'на ' + fx(r.push, 1) + ' с'} → k=10 ${stat(r.lanes[0])} · k=100 ${stat(r.lanes[1])}`,
      hint: 'Толкай сразу после начала новой пачки: смотри на ленту под сценой. Рука с k = 100 исполняет старый план ещё 2 секунды — это 100 шагов на 50 Гц.',
      fail: (r) => (r.push == null ? 'Толчка не было: выбери момент на ползунке.' : r.lanes[1].onShelf ? 'Рука с k = 100 успела составить новую пачку после толчка и вернула кружку. Толкни позже, когда она уже начала последнюю пачку.' : 'Рука с k = 10 тоже не попала: толчок слишком близко к полке. Толкни раньше.'),
      explain: (r) => `Пока пачка исполняется, новые кадры не учитываются: захват работает без обратной связи. Рука с k = 10 составила новую пачку через ${fx(r.lanes[0].react, 2)} с после толчка и вернула кружку на путь. Рука с k = 100 исполняла старый план до самой полки и поставила кружку в ${fx(r.lanes[1].miss * 100, 0)} см от отметки. ACT решает это иначе: опрашивает модель на каждом шаге и смешивает пачки. Это temporal ensembling, о нём — ниже.` },
    { short: 'Подбери k', title: 'Подбери длину пачки', text: 'Возьмём демонстрации, где оператор думал дольше: паузы около 0,6 с. Кружку толкают после паузы, сразу после начала новой пачки, то есть в самый неудобный момент. Подбери длину пачки, чтобы рука прошла паузу и успела отреагировать на толчок.', controls: ['show', 'k'],
      onEnter: (Xa) => Xa.setCtl({ k: 10 }),
      action: act,
      criteria: [{ label: 'Рука прошла паузу', test: (r) => r.lanes[0].passed }, { label: 'Отреагировала на толчок не позже чем через 0,5 с — столько π0 исполняет одну пачку', test: (r) => r.lanes[0].reactSteps != null && r.lanes[0].reactSteps <= 25 }, { label: 'Кружка на полке', test: (r) => r.lanes[0].onShelf }],
      summary: (r) => { const l = r.lanes[0]; return `k = ${l.k}: ${l.passed ? 'пауза ' + fx(l.pauseT, 1) + ' с' : 'застряла'}${l.reactSteps != null ? ', реакция ' + fx(l.react, 2) + ' с' : l.passed ? ', не успела' : ''}, ${stat(l)}`; },
      hint: 'Начни с k = 10 и удваивай. Смотри, какой критерий ломается первым.',
      fail: (r) => { const l = r.lanes[0]; if (!l.passed) return `С k = ${l.k} захват застрял у паузы: пачке не хватает длины, чтобы её перешагнуть. Сделай пачку длиннее.`; if (l.reactSteps == null || l.reactSteps > 25) return `Пачка из ${l.k} действий исполняется ${fx(l.k * L.DT, 2)} с, и всё это время захват не замечает толчка. Сделай пачку короче.`; return 'Пауза пройдена и реакция вовремя, но захват слишком долго раздумывал у паузы и не довёз кружку за 8 с.'; },
      explain: (r) => `С k = ${r.lanes[0].k} рука прошла паузу и отреагировала через ${fx(r.lanes[0].react, 2)} с. Рабочее окно в нашей игрушке — от 14 до 25 действий: короче — застревает на паузе, длиннее — не успевает отреагировать. У настоящих систем окно тоже есть: у ACT успех немного падает при k = 200 и 400, у SmolVLA на LIBERO — 84% при пачке 10 и 74,5% при пачке 100.` },
    { short: 'Часть пачки', title: 'Исполняй часть пачки', text: 'Оставь k = 100 и подбери, сколько действий исполнять до новой пачки, чтобы рука и прошла паузу, и вовремя отреагировала на толчок. Паузы по-прежнему около 0,6 с.', controls: ['show', 'k', 'ex'],
      onEnter: (Xa) => Xa.setCtl({ k: 100, ex: 100 }),
      bet: { q: 'сколько действий из 100 исполнять?', options: ['Все 100', 'Около четверти', 'По одному'], answer: () => 1 },
      action: act,
      criteria: [{ label: 'k = 100', test: (r) => r.lanes[0].k === 100 }, { label: 'Пауза пройдена', test: (r) => r.lanes[0].passed }, { label: 'Реакция на толчок не дольше 0,5 с', test: (r) => r.lanes[0].reactSteps != null && r.lanes[0].reactSteps <= 25 }],
      summary: (r) => { const l = r.lanes[0]; return `k = ${l.k}, исполнять ${l.ex}: ${l.passed ? 'пауза ' + fx(l.pauseT, 1) + ' с' : 'застряла'}${l.reactSteps != null ? ', реакция ' + fx(l.react, 2) + ' с' : l.passed ? ', не успела' : ''}`; },
      hint: 'Исполнять одно действие — та же пошаговая политика. Все 100 — 2 секунды вслепую. Ищи между.',
      fail: (r) => { const l = r.lanes[0]; if (l.k !== 100) return 'Верни k = 100: в этой миссии меняем только, сколько исполнять.'; if (!l.passed) return `Исполняя по ${l.ex}, захват застрял у паузы: пачку перепланируют раньше, чем она её перешагнёт.`; return `Исполняя по ${l.ex}, захват ${fx(l.ex * L.DT, 2)} с не замечает толчка. Исполняй меньше.`; },
      explain: () => 'Так устроены большие системы: π0 генерирует 50 действий и исполняет 25 на 50 Гц, Diffusion Policy и TRI LBM — 8 из 16, Atlas LBM — 24 из 48. Исполнять по одному — та же пошаговая политика, и пауза снова не проходится. Исполнять все 100 — реакция 2 с. В игрушке подходит от 14 до 25 действий из 100. Неисполненный хвост пачки в нашей модели ничего не даёт, а в настоящих системах он помогает склеивать пачки без рывков: так работает RTC в конце урока.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Все ручки сразу: длина пачки, сколько исполнять, temporal ensembling, паузы в демонстрациях и толчок. Рядом для сравнения — пачки из 1, 10 и 100 действий. Задача на любопытство: выключи паузы в демонстрациях и проверь, проходит ли теперь k = 1.', final: true,
      onEnter: (Xa) => Xa.setCtl({ pauses: 'short' }),
      action: act, summary: (r) => r.lanes.map((l) => `${l.you ? 'твоя' : 'k=' + l.k}: ${stat(l)}`).join(' · ') },
  ];
  function init() {
    legend('#chunkLegend', [['пачка, которую исполняют', 'var(--ink-2)', true], ['хвост пачки, который не исполнят', 'var(--ink-3)', 'dots'], ['моменты, когда составили новую пачку', 'var(--ink-2)', 'dot'], ['демонстрации оператора', 'var(--ink-3)']]);
    ui.k = wireRange('chunkK', (v) => String(v), (v) => { st.k = v; const inp = $('#chunkEx'); inp.max = String(v); if (st.ex > v) { st.ex = v; } ui.ex.set(st.ex); reset(); if (ctl) ctl.update(); });
    ui.ex = wireRange('chunkEx', (v) => String(v), (v) => { st.ex = v; reset(); if (ctl) ctl.update(); });
    ui.pushT = wireRange('chunkPushT', (v) => (v ? fx(pushSec(v), 1) + ' с' : 'нет'), (v) => { st.pushV = v; reset(); if (ctl) ctl.update(); });
    ui.m = wireRange('chunkM', (v) => fx(v / 100, 2), (v) => { st.m = v / 100; reset(); });
    ui.pauses = wireSeg('#wrapPauses', 'p', (v) => { st.pauses = v; reset(); });
    $('#chunkShow').addEventListener('change', (e) => { st.show = e.target.checked; draw(); });
    $('#chunkTe').addEventListener('change', (e) => { st.te = e.target.checked; reset(); });
    $('#chunkCmp').addEventListener('change', (e) => { st.cmp = e.target.checked; reset(); });
    $('#chunkPushBtn').addEventListener('click', () => pushNow());
    ui.pauses.set('short');
    HeroKit.loop($('#chunkCv'), () => { if (st.play) render(); });
    ctl = mountMissions('#chunkMis', missions, api, { scene: '#chunkCv', controls: { show: '#wrapShow', pushT: '#wrapPushT', pushBtn: '#wrapPushBtn', k: '#wrapK', ex: '#wrapEx', te: '#wrapTe', m: '#wrapM', pauses: '#wrapPauses', cmp: '#wrapCmp' }, onStep: (i) => { st.mis = i; st.runs = null; config(); render(); } });
    redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 4. Песочница «Собери ACT» ---------- */
const ArchLab = (() => {
  const A = ACT.ARCH, ORDER = ['resnetcls', 'flat', 'lin7', 'zero', 'enc256', 'resnet', 'head7', 'cvae', 'dec512', 'vec', 'lin14', 'zrand', 'head14', 'enc512'];
  const KQ = [1, 10, 25, 50, 90, 100, 200];
  const st = { placed: {}, k: 50, cams: 4, sel: null, free: false };
  let ctl = null, drag = null;
  const B = (id) => A.blocks.find((b) => b.id === id);
  const ev = () => ACT.archEval(st.placed, st.k, st.cams);
  const io = (b) => (b.in === '—' ? `→ ${b.out}` : b.in === 'demo' ? `k×14 действий → ${b.out}` : `${b.in} → ${b.out}`);
  function place(slot, id) {
    for (const s of Object.keys(st.placed)) if (st.placed[s] === id) delete st.placed[s];
    if (id) st.placed[slot] = id; else delete st.placed[slot];
    st.sel = null; render(); if (ctl) ctl.update();
  }
  function select(id) { st.sel = st.sel === id ? null : id; render(); }
  function blockBtn(b) {
    const el = h('button', { type: 'button', class: 'ab' + (st.sel === b.id ? ' sel' : ''), 'data-id': b.id }, h('span', null, b.label), h('small', null, io(b)));
    el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = { id: b.id, x: e.clientX, y: e.clientY, on: false, el }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== b.id) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.on = true; const r = el.getBoundingClientRect(); drag.ghost = el.cloneNode(true); drag.ghost.classList.add('ab-ghost'); drag.ghost.style.width = r.width + 'px'; document.body.append(drag.ghost); drag.dx = drag.x - r.left; drag.dy = drag.y - r.top; el.classList.add('dragging'); }
      if (drag.on) { drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`; const u = document.elementFromPoint(e.clientX, e.clientY), z = u && u.closest('.af-slot'); $$('#archFlow .af-slot.over').forEach((x) => x.classList.remove('over')); if (z) z.classList.add('over'); }
    });
    const end = (e) => {
      if (!drag || drag.id !== b.id) return;
      const d = drag; drag = null;
      if (d.on) { d.ghost.remove(); el.classList.remove('dragging'); const u = document.elementFromPoint(e.clientX, e.clientY), z = u && u.closest('.af-slot'); if (z) place(z.dataset.slot, b.id); else render(); }
      else select(b.id);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; render(); });
    return el;
  }
  function renderPal() {
    const box = $('#archPal'); box.innerHTML = '';
    box.append(h('div', { class: 'pal-h' }, st.sel ? 'Теперь нажми на место в схеме' : 'Блоки'));
    const used = new Set(Object.values(st.placed));
    ORDER.filter((id) => !used.has(id)).forEach((id) => box.append(blockBtn(B(id))));
    if (used.size === ORDER.length) box.append(h('div', { class: 'muted-s' }, 'Все блоки в схеме'));
  }
  function slot(id, e) {
    const sd = A.slots.find((q) => q.id === id), b = st.placed[id] ? B(st.placed[id]) : null, err = e.err[id];
    const el = h('div', { class: 'af-slot' + (b ? ' filled' : '') + (b && !err ? ' good' : '') + (err ? ' err' : ''), 'data-slot': id, role: 'button', tabindex: '0' },
      h('div', { class: 'sl' }, sd.label),
      b ? h('div', { class: 'sv' }, b.label, h('small', null, io(b))) : h('div', { class: 'sv empty' }, st.sel ? 'нажми, чтобы поставить блок' : 'пусто'),
      err ? h('div', { class: 'se' }, err) : null);
    el.addEventListener('click', () => { if (st.sel) place(id, st.sel); else if (b) place(id, null); });
    el.addEventListener('keydown', (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); el.click(); } });
    return el;
  }
  const conn = (txt, ok) => h('div', { class: 'af-conn' + (ok === true ? ' ok' : ok === false ? ' bad' : '') }, txt);
  function renderFlow() {
    const e = ev(), j = e.j, box = $('#archFlow'); box.innerHTML = '';
    $('#archFlow').closest('.arch-box').classList.toggle('arch-selecting', !!st.sel);
    const camsRow = h('div', { class: 'af-src' }, `Камеры: ${st.cams}`, h('small', null, '480×640×3 каждая'));
    if (st.free) { const sg = h('span', { class: 'seg', style: 'margin-left:8px' }); [1, 2, 3, 4].forEach((n) => { const bt = h('button', { type: 'button', 'aria-pressed': String(n === st.cams) }, String(n)); bt.addEventListener('click', () => { st.cams = n; render(); if (ctl) ctl.update(); }); sg.append(bt); }); camsRow.append(sg); }
    box.append(h('div', { class: 'af-group' }, 'Картинки'), camsRow, conn('480×640×3'), slot('cnn', e));
    box.append(conn(j.cnn ? `${j.cnn} на камеру` : '?', j.cnn ? !e.err.cnn && !e.err.tok : null), slot('tok', e));
    const nt = j.tok && /^\d+×512$/.test(j.tok) ? parseInt(j.tok, 10) : null;
    box.append(conn(j.tok ? (nt ? `${j.tok} на камеру → ${st.cams} × ${nt} = ${st.cams * nt} токенов` : j.tok) : '?', j.tok ? !e.err.tok && !e.err.cat : null));
    if (e.err.cat) box.append(h('div', { class: 'af-slot err', style: 'cursor:default' }, h('div', { class: 'se' }, e.err.cat)));
    box.append(h('div', { class: 'af-group' }, 'Суставы и стиль'), h('div', { class: 'af-src' }, 'Суставы ведомых рук', h('small', null, '14 чисел')), conn('14'), slot('joint', e), conn(j.joint ? j.joint : '?', j.joint ? !e.err.joint : null));
    box.append(h('div', { class: 'af-row' }, slot('ztr', e), slot('zinf', e)), conn('z: 32 числа → линейный слой → 1×512', j.ztr && j.zinf ? !e.err.ztr && !e.err.zinf : null));
    box.append(h('div', { class: 'af-group' }, 'Трансформер'), h('div', { class: 'af-src' }, 'Склейка: картинки + суставы + z', h('small', null, j.cat || '?')), conn(j.cat || '?', j.cat ? true : null), slot('enc', e), conn(j.enc || '?', j.enc ? true : null));
    const kr = h('div', { class: 'af-k' }, 'Запросов декодера k:'), sg = h('span', { class: 'seg' });
    KQ.forEach((q) => { const bt = h('button', { type: 'button', 'aria-pressed': String(q === st.k) }, String(q)); bt.addEventListener('click', () => { st.k = q; render(); if (ctl) ctl.update(); }); sg.append(bt); });
    kr.append(sg); box.append(kr, slot('dec', e), conn(j.dec || '?', j.dec ? true : null), slot('head', e));
    box.append(h('div', { class: 'af-out' + (e.allOk && e.out === '100×14' ? ' ok' : '') }, 'Выход: ', h('b', null, e.out ? `${e.out}` : '?'), e.out ? ` — ${parseInt(e.out, 10)} действий по ${e.out.split('×')[1]} чисел` : ''));
  }
  function render() { renderPal(); renderFlow(); }
  const state = () => Object.assign(ev(), { k: st.k, cams: st.cams });
  function setCtl(o) { if (o.placed) st.placed = Object.assign({}, o.placed); if (o.k != null) st.k = o.k; if (o.cams != null) st.cams = o.cams; st.sel = null; render(); if (ctl) ctl.update(); }
  const api = { reset() { setCtl({ placed: {}, k: 50, cams: 4 }); }, state, setCtl, place, select };
  const missions = [
    { short: 'Собери', title: 'Собери политику ACT', text: 'Расставь блоки так, чтобы на каждом стыке сошлись размерности, на выходе было 100 действий по 14 чисел, а энкодер CVAE работал только при обучении.',
      criteria: [{ label: 'Все стыки сошлись', test: (r, s) => s.allOk }, { label: 'На выходе 100 × 14', test: (r, s) => s.out === '100×14' }, { label: 'Энкодер CVAE — только при обучении, на выводе z = 0', test: (r, s) => s.zOk }],
      hint: 'Начни с картинок: какой блок превращает кадр 480×640 в карту 15×20×512? Дальше сверяй числа на стыках. Число запросов декодера выбирается в строке «Запросов k».',
      explain: (r) => `Сошлось. С ${r.cams} камер выходит ${r.cams * 300} токенов, вместе с суставами и z — ${r.tokens}. Около 80 млн параметров, вывод — около 10 мс. Декодер выдаёт все 100 действий за один проход: запросы не ждут друг друга, как слова в языковой модели. Каждое действие — 14 абсолютных целевых положений, а энкодер CVAE на выводе не нужен: в нём нечего кодировать.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число камер и запросов, переставляй блоки. Сколько токенов получит энкодер, если оставить одну камеру сверху?', final: true },
  ];
  function init() {
    render();
    ctl = mountMissions('#archMis', missions, api, { onStep: (i) => { st.free = !!missions[i].final; if (!st.free) st.cams = 4; render(); } });
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 5. Регрессия L1, ACT с z = 0 и случайный z ---------- */
const CvaeLab = (() => {
  const st = { beta: 10, nLeft: 26, res: null, t0: null, hist: [], verdict: null, mine: null };
  let ctl = null, ui = {};
  const PANES = [['l1', '#cvL1', '#cvL1Out'], ['act', '#cvAct', '#cvActOut'], ['rnd', '#cvRnd', '#cvRndOut']];
  function compute() { st.res = ACT.cvaeRuns({ beta: st.beta, nLeft: st.nLeft }); }
  const sides = (kind) => { const r = st.res; return kind === 'l1' ? new Array(10).fill(r.l1) : kind === 'act' ? new Array(10).fill(r.act) : r.rnd; };
  function drawPane(kind, sel) {
    const cv = $(sel), rect = cv.getBoundingClientRect(), W = 300, H = rect.width ? Math.round(W * rect.height / rect.width) || 230 : 230, { c, k } = HeroKit.fit(cv, W, H), P = pal();
    const col = kind === 'l1' ? P.l1 : kind === 'act' ? P.act : P.rnd, sc = Math.min((W - 28) / 0.9, H - 28);
    // робот едет снизу вверх; «слева» — левее на экране
    const X = (lat) => W / 2 - lat * sc, Y = (u) => H - 14 - u * (H - 28);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 20, P.grid);
    const vr = 0.12 * sc;
    c.beginPath(); c.arc(X(0), Y(0.5), vr, 0, 7); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.arc(X(0), Y(0.5), vr, 0, 7); HeroKit.hatch(c, X(0) - vr, Y(0.5) - vr, X(0) + vr, Y(0.5) + vr, P.ink3, 5, 1); c.beginPath(); c.arc(X(0), Y(0.5), vr, 0, 7); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.stroke();
    HeroKit.label(c, k, 'ваза', X(0), Y(0.5), { px: 11, color: P.ink2, weight: 650, haloColor: P.surf });
    c.lineWidth = 1; c.strokeStyle = P.ink3; c.globalAlpha = 0.25;
    for (let i = 0; i < ACT.CV.N; i++) { const d = ACT.cvaeDemo(i, st.nLeft); c.beginPath(); for (let q = 0; q <= 40; q++) { const u = q / 40, v = ACT.cvaePath(d.side, u, d); q ? c.lineTo(X(v), Y(u)) : c.moveTo(X(v), Y(u)); } c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); c.arc(X(0), Y(0), 5, 0, 7); c.fillStyle = P.ink2; c.fill();
    c.strokeStyle = P.ink; c.lineWidth = 1.6; c.beginPath(); c.arc(X(0), Y(1), 6, 0, 7); c.stroke();
    HeroKit.label(c, k, 'слева', 8, 12, { align: 'left', px: 10.5, color: P.ink3, halo: false });
    HeroKit.label(c, k, 'справа', W - 8, 12, { align: 'right', px: 10.5, color: P.ink3, halo: false });
    if (!st.res || st.t0 === null) return;
    const el = (performance.now() - st.t0) * SPEED.k / 1000;
    sides(kind).forEach((sd, j) => {
      const f = Math.max(0, Math.min(1, (el - j * 0.08) / 0.7)); if (f <= 0) return;
      c.strokeStyle = col; c.lineWidth = 2.4; c.globalAlpha = 0.85; c.beginPath();
      const uEnd = sd === 0 ? Math.min(f, 0.38) : f;
      for (let q = 0; q <= 50; q++) { const u = q / 50 * uEnd, v = ACT.cvaePath(sd, u); q ? c.lineTo(X(v), Y(u)) : c.moveTo(X(v), Y(u)); }
      c.stroke(); c.globalAlpha = 1;
      if (sd === 0 && f > 0.38) HeroKit.cross(c, X(0), Y(0.38), 6, P.bad, 2.6);
    });
  }
  function caption(kind) {
    if (!st.res || st.t0 === null) return 'нажми «Запустить»';
    const s = sides(kind), L = s.filter((v) => v === 1).length, R = s.filter((v) => v === -1).length, M = s.filter((v) => v === 0).length;
    if (M === 10) return '<b>10 из 10</b> — прямо в вазу';
    if (L === 10) return '<b>10 из 10</b> слева';
    if (R === 10) return '<b>10 из 10</b> справа';
    return `слева <b>${L}</b>, справа <b>${R}</b>` + (M ? `, в вазу <b>${M}</b>` : '');
  }
  function renderDispute() {
    $$('#cvDispute .disp').forEach((d) => {
      const x = d.dataset.x, win = st.verdict === x, lose = st.verdict && st.verdict !== x;
      d.classList.toggle('win', !!win); d.classList.toggle('lose', !!lose); d.classList.toggle('mine', st.mine === x);
      d.querySelector('.verdict').textContent = win ? 'опыт подтвердил' : lose ? 'опыт опроверг' : '';
    });
  }
  function render() { PANES.forEach(([kind, sel, outSel]) => { drawPane(kind, sel); const el = $(outSel); setOut(el, caption(kind)); el.classList.toggle('bad', !!st.res && st.t0 !== null && sides(kind).some((v) => v === 0)); }); renderDispute(); }
  let anim = null;
  function run() {
    compute(); st.t0 = performance.now();
    return new Promise((res) => {
      const dur = 1700 / SPEED.k; clearInterval(anim);
      anim = setInterval(render, 30);
      setTimeout(() => { clearInterval(anim); anim = null; const r = state(); if (ctlRef() && ctlRef().index === 0) { const same = r.act !== 0; st.verdict = same ? 'b' : null; } render(); st.hist.push(r); res(r); }, dur);
    });
  }
  const state = () => ({ beta: st.beta, nLeft: st.nLeft, l1: st.res ? st.res.l1 : null, act: st.res ? st.res.act : null, rndLeft: st.res ? st.res.rndLeft : 0, rndRight: st.res ? st.res.rndRight : 0, rndMid: st.res ? st.res.rndMid : 0, mu: st.res ? st.res.fit.mu : null });
  function setCtl(o) { if (o.beta != null) { st.beta = o.beta; ui.beta.set(o.beta); } if (o.nLeft != null) { st.nLeft = o.nLeft; ui.left.set(o.nLeft); } st.res = null; st.t0 = null; render(); if (ctl) ctl.update(); }
  const ctlRef = () => ctl;
  const api = { reset() { st.hist = []; st.verdict = null; st.mine = null; setCtl({ beta: 10, nLeft: 26 }); }, run, state, setCtl };
  const sideTxt = (v) => (v === 1 ? 'слева' : v === -1 ? 'справа' : 'в вазу');
  const missions = [
    { short: 'Спор', title: 'Какое объяснение верно', text: 'Два объяснения того, что даёт z, — над схемами. Выбери одно и проверь опытом: политику обучили как ACT, β = 10. Три варианта по 10 запусков: регрессия с L1 без латентной переменной, ACT с z = 0, как на выводе, и тот же декодер со случайным z.', controls: [],
      onEnter: (Xa) => Xa.setCtl({ beta: 10, nLeft: 26 }),
      bet: { q: 'какое объяснение верно для ACT на выводе?', options: ['А: выбирает стиль', 'Б: каждый раз одно и то же'], answer: () => 1 },
      action: { label: 'Проверить: по 10 запусков', run: (Xa) => { const b = [...document.querySelectorAll('#cvMis .m-bet .opts button')].findIndex((q) => q.getAttribute('aria-pressed') === 'true'); st.mine = b === 0 ? 'a' : b === 1 ? 'b' : null; return Xa.run(); } },
      summary: (r) => `β = ${r.beta}: L1 ${sideTxt(r.l1)}, z = 0 ${sideTxt(r.act)}, случайный z: слева ${r.rndLeft}, справа ${r.rndRight}`,
      explain: () => 'Опыт на стороне объяснения Б. ACT с z = 0 все десять раз объезжает вазу слева, так же как регрессия с L1: на выводе z один и тот же, и выход детерминирован. L1 выдаёт медиану — сторону, где демонстраций больше, 26 против 24. Даже случайный z при β = 10 ничего не меняет: энкодеру выгоднее ничего не кодировать, и декодер на z не смотрит.' },
    { short: 'Когда верно А', title: 'Когда объяснение А было бы верным', text: 'Объяснение А появилось не на пустом месте: z может нести стиль. Найди условия, при которых случайный z выбирает сторону объезда. Подсказка в названии штрафа: ослабь KL до β = 1 и запусти снова.', controls: ['beta'],
      action: { label: 'Запустить по 10 раз', run: (Xa) => Xa.run() },
      criteria: [{ label: 'β = 1', test: (r) => r.beta === 1 }, { label: 'Случайный z даёт обе стороны', test: (r) => r.rndLeft > 0 && r.rndRight > 0 }, { label: 'ACT с z = 0 по-прежнему едет одной стороной', test: (r) => r.act !== 0 }],
      summary: (r) => `β = ${r.beta}: z = 0 ${sideTxt(r.act)}, случайный z: слева ${r.rndLeft}, справа ${r.rndRight}`,
      fail: (r) => (r.beta !== 1 ? 'При β = 10 энкодер ничего не кодирует. Переключи β.' : 'Попробуй ещё раз.'),
      explain: (r) => `При β = 1 энкодер кодирует сторону, и случайный z даёт слева ${r.rndLeft}, справа ${r.rndRight}: для случайного z объяснение А верно. Но ACT на выводе подаёт z = 0 и получает одну и ту же траекторию, слева, — для настоящей ACT верно Б. Чтобы выбирать стороны по-настоящему, нужна генеративная голова, например диффузия из урока 1.5.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй β и число демонстраций слева. Поставь 25 слева и 25 справа: что выдаст регрессия, когда медиана не определена?', final: true,
      action: { label: 'Запустить по 10 раз', run: (Xa) => Xa.run() },
      summary: (r) => `β = ${r.beta}, слева ${r.nLeft}: L1 ${sideTxt(r.l1)}, z = 0 ${sideTxt(r.act)}, случайный z: ${r.rndLeft}/${r.rndRight}` },
  ];
  function init() {
    legend('#cvLegend', [['регрессия с L1', 'var(--c-l1)'], ['ACT, z = 0', 'var(--c-act)'], ['тот же декодер, случайный z', 'var(--c-rnd)'], ['демонстрации', 'var(--ink-3)']]);
    ui.beta = wireSeg('#wrapBeta', 'b', (v) => { st.beta = +v; st.res = null; st.t0 = null; render(); if (ctl) ctl.update(); });
    ui.left = wireRange('cvLeft', (v) => String(v), (v) => { st.nLeft = v; st.res = null; st.t0 = null; render(); });
    ui.beta.set(10);
    ctl = mountMissions('#cvMis', missions, api, { scene: '#cvAct', controls: { beta: '#wrapBeta', left: '#wrapLeft' } });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 6. Temporal ensembling изнутри ---------- */
const TeLab = (() => {
  const T = ACT.TE, W = 760;
  const st = { t: 150, mi: 2, two: false, tape: null, sel: null };
  let ctl = null, ui = {};
  const m = () => st.mi * 0.005;
  const wL0 = (k) => Math.max(46, 12 + 32 * k); // поле слева под подписи процентов
  function compute() { st.tape = ACT.teTape({ m: m(), two: st.two }); }
  const at = () => ACT.teAt(st.tape, st.t);
  function drawTape() {
    const cv = $('#teCv'), { c, k, H } = plotFit(cv, W, 300, 440), P = pal(), a = at();
    const x = (t) => 34 + t / (T.T - 1) * (W - 46), y = (cm) => H / 2 - cm * (H / 2 - 18) / 13;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    for (const v of [-8, 0, 8]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(34, y(v)); c.lineTo(W - 12, y(v)); c.stroke(); HeroKit.label(c, k, (v > 0 ? '+' : '') + v, 28, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let t = 0; t < T.T; t += 50) HeroKit.label(c, k, String(t), x(t), H - 8 * k, { px: 10.5, mono: true, color: P.ink3, halo: false, align: t === 0 ? 'left' : 'center' });
    // препятствие
    const ox0 = x(T.TO - T.OT), ox1 = x(T.TO + T.OT), oy0 = y(T.OY), oy1 = y(-T.OY);
    c.beginPath(); c.rect(ox0, oy0, ox1 - ox0, oy1 - oy0); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(ox0, oy0, ox1 - ox0, oy1 - oy0); HeroKit.hatch(c, ox0, oy0, ox1, oy1, a.inObs ? P.bad : P.ink3, 6, 1); c.strokeStyle = a.inObs ? P.bad : P.ink2; c.lineWidth = 1.4; c.strokeRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
    // эталонные объезды
    c.setLineDash([4, 5]); c.lineWidth = 1.2;
    for (const [sg, col] of st.two ? [[1, P.up], [-1, P.down]] : [[1, P.up]]) { c.strokeStyle = col; c.globalAlpha = 0.5; c.beginPath(); for (let t = 0; t < T.T; t += 2) { const v = sg * T.A * ACT.teBump(t); t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)); } c.stroke(); }
    c.setLineDash([]); c.globalAlpha = 1;
    // пачки, которые предсказали выбранный шаг
    const mx = Math.max(...a.preds.map((p) => p.w));
    a.preds.forEach((p, i) => {
      const ch = st.tape.chunks[p.s], col = ch.sg > 0 ? P.up : P.down, sel = st.sel === i;
      c.strokeStyle = col; c.globalAlpha = sel ? 1 : 0.1 + 0.55 * p.w / mx; c.lineWidth = sel ? 2.6 : 1; c.beginPath();
      for (let j = 0; j < T.K && p.s + j < T.T; j += 2) { const t = p.s + j; j ? c.lineTo(x(t), y(ch.ys[j])) : c.moveTo(x(t), y(ch.ys[j])); }
      c.stroke();
    });
    c.globalAlpha = 1;
    // исполненный путь
    c.strokeStyle = P.ink; c.lineWidth = 2.6; c.beginPath(); for (let t = 0; t < T.T; t++) { t ? c.lineTo(x(t), y(st.tape.ex[t])) : c.moveTo(x(t), y(st.tape.ex[t])); } c.stroke();
    // выбранный шаг
    c.strokeStyle = P.ink2; c.setLineDash([3, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x(st.t), 8); c.lineTo(x(st.t), H - 18 * k); c.stroke(); c.setLineDash([]);
    a.preds.forEach((p, i) => { const col = st.tape.chunks[p.s].sg > 0 ? P.up : P.down; c.fillStyle = col; c.globalAlpha = st.sel === i ? 1 : 0.75; c.beginPath(); c.arc(x(st.t), y(p.y), 1.6 + 3.2 * p.w / mx, 0, 7); c.fill(); });
    c.globalAlpha = 1;
    c.beginPath(); c.arc(x(st.t), y(a.y), 7, 0, 7); c.fillStyle = a.inObs ? P.bad : P.ink; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
    HeroKit.label(c, k, `шаг ${st.t}`, x(st.t), 10, { px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
  }
  function drawW() {
    const cv = $('#teW'), { c, k, H } = plotFit(cv, W, 150, 210), P = pal(), a = at(), n = a.preds.length;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const L0 = wL0(k), R0 = W - 12, top = 16, bot = H - 26 * k, bw = (R0 - L0) / Math.max(n, 1), mx = Math.max(...a.preds.map((p) => p.w));
    const vmax = niceUp(mx * 100, [0.5, 1, 1.5, 2, 3, 5, 10, 20, 50, 100]);
    for (const v of [0, vmax / 2, vmax]) { const yy = bot - v / vmax * (bot - top); c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(L0, yy); c.lineTo(R0, yy); c.stroke(); HeroKit.label(c, k, fmt1(v, 2) + '%', L0 - 5, yy, { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    a.preds.forEach((p, i) => { const hh = p.w * 100 / vmax * (bot - top); c.fillStyle = st.tape.chunks[p.s].sg > 0 ? P.up : P.down; c.globalAlpha = st.sel == null || st.sel === i ? 0.9 : 0.45; c.fillRect(L0 + i * bw + 0.3, bot - hh, Math.max(1, bw - 0.6), hh); });
    c.globalAlpha = 1;
    if (st.sel != null && st.sel < n) { const p = a.preds[st.sel], hh = p.w * 100 / vmax * (bot - top); c.strokeStyle = P.ink; c.lineWidth = 2; c.strokeRect(L0 + st.sel * bw - 1, bot - hh - 2, bw + 2, hh + 2); }
    HeroKit.label(c, k, '← самое старое', L0, H - 10 * k, { align: 'left', px: 11, color: P.ink3, halo: false });
    HeroKit.label(c, k, 'самое свежее →', R0, H - 10 * k, { align: 'right', px: 11, color: P.ink3, halo: false });
  }
  function out() {
    const a = at(), p = st.sel != null && st.sel < a.preds.length ? a.preds[st.sel] : null;
    const quiet = ctl && ctl.index === 0 && !ctl.ctx.done[0];
    setOut('#teOut', `Шаг ${st.t}: предсказаний <b>${a.preds.length}</b>. ` + (quiet ? 'Наведи на столбик, чтобы увидеть его вес. ' : `Самое старое весит <b>${fx(a.oldest * 100, 2)}%</b>, самое свежее — <b>${fx(a.newest * 100, 2)}%</b>. `) + `Действие: ${a.y >= 0 ? '+' : ''}${fx(a.y, 1)} см${a.inObs ? ' — <b style="color:var(--critical)">внутри препятствия</b>' : ''}.` + (p ? `<br>Выбрано: пачка с шага ${p.s}, ${st.tape.chunks[p.s].sg > 0 ? 'объезд сверху' : 'объезд снизу'}, вес <b>${fx(p.w * 100, 2)}%</b>, предсказание ${p.y >= 0 ? '+' : ''}${fx(p.y, 1)} см.` : ''));
  }
  function render() { drawTape(); drawW(); out(); }
  function sync() { compute(); render(); if (ctl) ctl.update(); }
  function pick(e) {
    const cv = $('#teW'), r = cv.getBoundingClientRect(), n = at().preds.length, xl = (e.clientX - r.left) / r.width * W, L0 = wL0(W / r.width), R0 = W - 12;
    const i = Math.floor((xl - L0) / ((R0 - L0) / n)); if (i < 0 || i >= n) return;
    if (st.sel !== i) { st.sel = i; render(); if (ctl) ctl.update(); }
  }
  const state = () => { const a = at(), mx = Math.max(...a.preds.map((p) => p.w)); return { t: st.t, m: m(), mi: st.mi, two: st.two, sel: st.sel, selMax: st.sel != null && st.sel < a.preds.length && a.preds[st.sel].w >= mx - 1e-12, oldest: a.oldest, newest: a.newest, inObs: a.inObs, y: a.y }; };
  function setCtl(o) { if (o.t != null) { st.t = o.t; ui.t.set(o.t); } if (o.mi != null) { st.mi = o.mi; ui.m.set(o.mi); } if (o.two != null) { st.two = o.two; $('#teTwo').checked = o.two; } if (o.sel !== undefined) st.sel = o.sel; sync(); }
  const api = { reset() { setCtl({ t: 150, mi: 2, two: false, sel: null }); }, state, setCtl, pickIndex: (i) => { st.sel = i; render(); if (ctl) ctl.update(); } };
  const missions = [
    { short: 'Чей голос', title: 'Чьё предсказание весит больше', text: 'Шаг 150, m = 0,01, как в коде ACT. Найди на нижнем графике предсказание с наибольшим весом: веди по столбикам курсором или нажимай на них.', controls: [],
      onEnter: (Xa) => Xa.setCtl({ mi: 2, t: 150 }),
      criteria: [{ label: 'm = 0,01', test: (r, s) => s.mi === 2 }, { label: 'Выбрано предсказание с наибольшим весом', test: (r, s) => s.selMax }],
      explain: (r) => `Тяжелее всех — самое старое предсказание: ${fx(r.oldest * 100, 2)}% против ${fx(r.newest * 100, 2)}% у самого свежего. Веса exp(−0,01·i) отсчитываются от самой старой пачки, поэтому temporal ensembling в ACT больше доверяет прошлому: он сглаживает движение, но медленнее реагирует на новое.` },
    { short: 'Свежее', title: 'Сделай свежее весомее', text: 'Подвинь m так, чтобы самое свежее предсказание весило больше самого старого.', controls: ['m'],
      criteria: [{ label: 'Самое свежее весит больше самого старого', test: (r, s) => s.newest > s.oldest }],
      hint: 'Веса exp(−m·i) убывают с i, только если m > 0.',
      explain: (r) => `При m = ${fx(r.m, 3)} самое свежее предсказание весит ${fx(r.newest * 100, 2)}%, самое старое — ${fx(r.oldest * 100, 2)}%. Новые кадры учитываются быстрее, но сглаживания меньше, и стыки пачек снова заметнее. В ACT выбрали m = 0,01, то есть плавность.` },
    { short: 'Две стратегии', title: 'Где среднее ведёт в препятствие', text: 'Включи режим двух стратегий: пачки до шага 100 объезжают препятствие сверху, а после — снизу. Найди шаг, на котором среднее пачек ведёт прямо в препятствие.', controls: ['two', 't'],
      onEnter: (Xa) => Xa.setCtl({ mi: 2, t: 60, sel: null }),
      criteria: [{ label: 'Включены две стратегии', test: (r, s) => s.two }, { label: 'Выбран шаг, где среднее пачек внутри препятствия', test: (r, s) => s.two && s.inObs }],
      hint: 'Ищи шаг внутри препятствия (132–168), где пачек сверху и снизу примерно поровну.',
      explain: (r) => `На шаге ${r.t} одни пачки объезжают сверху, другие снизу, а их среднее, ${fx(r.y, 1)} см, — внутри препятствия. Каждая стратегия допустима, их среднее — нет. Так temporal ensembling ломается, когда соседние пачки выбирают разные стратегии; тот же эффект показан на рис. 2 статьи RTC.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй шаг, m и стратегии. При каком m среднее двух стратегий проскакивает мимо препятствия?', final: true },
  ];
  function init() {
    legend('#teLegend', [['пачки с объездом сверху', 'var(--up)'], ['пачки с объездом снизу', 'var(--down)'], ['исполненный путь', 'var(--ink)'], ['эталонные объезды', 'var(--ink-3)', true]]);
    ui.t = wireRange('teT', (v) => String(v), (v) => { st.t = v; render(); if (ctl) ctl.update(); });
    ui.m = wireRange('teM', (v) => fx(v * 0.005, 3), (v) => { st.mi = v; sync(); });
    $('#teTwo').addEventListener('change', (e) => { st.two = e.target.checked; sync(); });
    const w = $('#teW'); w.addEventListener('pointermove', pick); w.addEventListener('pointerdown', pick);
    compute();
    ctl = mountMissions('#teMis', missions, api, { scene: '#teCv', controls: { t: '#wrapTeT', m: '#wrapTeM', two: '#wrapTwo' }, onStep: () => render(), onDone: () => render() });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 7. Задержка вывода и стыки пачек ---------- */
const DelayLab = (() => {
  const DL = ACT.DL, W = 760, FRAME = 20 / 1.6, NAMES = { sync: 'синхронно', naive: 'наивно асинхронно', te: 'temporal ensembling', rtc: 'RTC' };
  const NB = 84, BIN = 0.1; // прогноз скорости: отрезки по 0,1 с
  const st = { mode: 'sync', d: 10, obst: true, run: null, prev: null, play: null, hist: [], pred: new Array(NB).fill(null), drawOn: false, drawing: false, last: null };
  let ctl = null, ui = {};
  const S = (W - 40) / 1.1, X = (x) => 20 + (x + 0.04) * S;
  const predBins = () => st.pred.filter((v) => v != null).length;
  /** Сравнение прогноза с настоящей скоростью: средняя ошибка по нарисованным отрезкам. */
  function score(r) {
    let err = 0, n = 0, dips = 0;
    st.pred.forEach((pv, b) => {
      if (pv == null) return; const i0 = b * 5, i1 = Math.min(r.v.length - 1, i0 + 4); if (i0 >= r.v.length) return;
      let s2 = 0; for (let i = i0; i <= i1; i++) s2 += r.v[i]; const av = s2 / (i1 - i0 + 1);
      err += Math.abs(pv - av); n++; if (pv < 0.08 && b * BIN > 0.4 && b * BIN < r.T - 0.3) dips++;
    });
    return { predBins: n, match: n ? Math.round(Math.max(0, 1 - err / n / 0.25) * 100) : 0, dips: dips >= 2 };
  }
  function run() {
    const r = ACT.delayRun({ mode: st.mode, d: st.d, obst: st.obst });
    if (st.run) st.prev = st.run; st.run = r;
    return new Promise((res) => { st.play = playback(r.fr.length, FRAME, () => { st.play = null; render(); const s = summary(r); st.hist.push(s); res(s); }); render(); });
  }
  const summary = (r) => Object.assign({ mode: r.mode, d: r.d, ms: r.ms, obst: r.obst, pauseT: r.pauseT, jump: r.jump, hit: r.hit, ok: r.ok, T: r.T }, score(r));
  /** Геометрия графиков: та же, что при рисовании, — нужна, чтобы переводить касания в скорость и время. */
  function geo() {
    const cv = $('#dlPlot'), cw = cv.getBoundingClientRect().width || W, H = cw < 460 ? 520 : 240, k = W / cw, TM = DL.TMAX * DL.DT, L0 = Math.max(50, 14 + 30 * k), R0 = W - 12, gap = Math.max(8, 14 * k), rh = (H - 22 * k - gap * 2) / 3;
    const top = (rh + gap) + 4, bot = top + rh;
    return { H, k, TM, L0, R0, top, bot, x: (t) => L0 + t / TM * (R0 - L0), tAt: (x) => (x - L0) / (R0 - L0) * TM, vAt: (y) => (bot - y) / (bot - top) * 0.5, y: (v) => bot - v / 0.5 * (bot - top) };
  }
  function toLogical(e) { const cv = $('#dlPlot'), r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.width * W }; }
  function addPt(p) {
    const g = geo(), t = Math.max(0, Math.min(g.TM - 1e-6, g.tAt(p.x))), v = Math.max(0, Math.min(0.5, g.vAt(p.y))), b = Math.floor(t / BIN);
    if (st.last && st.last.b !== b) { const a = st.last, dir = b > a.b ? 1 : -1; for (let q = a.b + dir; q !== b; q += dir) st.pred[q] = a.v + (v - a.v) * (q - a.b) / (b - a.b); }
    st.pred[b] = v; st.last = { b, v }; drawPlots();
  }
  function drawScene() {
    const cv = $('#dlCv'), H = 300, { c, k } = fitAR(cv, W, H), P = pal(), Y = (y) => H / 2 - y * S;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 0.05 * S, P.grid);
    const r = st.run, i = r ? (st.play ? st.play.index() : r.fr.length - 1) : 0, hitNow = r && r.hit && r.fr.slice(0, i + 1).some((p) => Math.hypot(p[0] - DL.XO, p[1]) < DL.RO + DL.RR);
    if (st.obst) {
      const R = DL.RO * S; c.beginPath(); c.arc(X(DL.XO), Y(0), R, 0, 7); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.arc(X(DL.XO), Y(0), R, 0, 7); HeroKit.hatch(c, X(DL.XO) - R, Y(0) - R, X(DL.XO) + R, Y(0) + R, hitNow ? P.bad : P.ink3, 6, 1);
      c.beginPath(); c.arc(X(DL.XO), Y(0), R, 0, 7); c.strokeStyle = hitNow ? P.bad : P.ink2; c.lineWidth = hitNow ? 3 : 1.5; c.stroke();
    }
    c.beginPath(); c.arc(X(0), Y(0), 6, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.stroke(); HeroKit.label(c, k, 'старт', X(0), Y(0) + 22, { px: 11, color: P.ink3, haloColor: P.bg });
    c.strokeStyle = P.ink; c.lineWidth = 1.6; c.beginPath(); c.arc(X(DL.X1), Y(0), 9, 0, 7); c.stroke(); HeroKit.label(c, k, 'цель', X(DL.X1), Y(0) + 24, { px: 11, color: P.ink2, haloColor: P.bg });
    if (st.prev) { c.strokeStyle = P.ink3; c.setLineDash([4, 4]); c.lineWidth = 1.5; c.beginPath(); st.prev.fr.forEach((p, j) => (j ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); c.setLineDash([]); }
    if (!r) { c.beginPath(); c.arc(X(0), Y(0), DL.RR * S, 0, 7); c.fillStyle = P.e2e; c.fill(); return; }
    c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.lineJoin = 'round'; c.beginPath(); for (let j = 0; j <= i; j++) { const p = r.fr[j]; j ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])); } c.stroke();
    if (r.mode !== 'te') { c.fillStyle = P.ink; for (const t of r.marks) { if (t > i) break; const p = r.fr[t]; c.beginPath(); c.arc(X(p[0]), Y(p[1]), 2.8, 0, 7); c.fill(); } }
    if (st.play) { let pl = null; for (const q of r.plans) { if (q.t <= i) pl = q; else break; } if (pl) { c.strokeStyle = P.e2e; c.globalAlpha = 0.6; c.setLineDash([4, 4]); c.lineWidth = 1.4; c.beginPath(); pl.pts.forEach((p, j) => (j ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; } }
    const p = r.fr[i]; c.beginPath(); c.arc(X(p[0]), Y(p[1]), DL.RR * S, 0, 7); c.fillStyle = P.e2e; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
    HeroKit.label(c, k, `${NAMES[r.mode]} · ${r.ms} мс`, 10, 14, { align: 'left', px: 12, weight: 750, color: P.e2e, haloColor: P.bg });
  }
  function drawPlots() {
    const cv = $('#dlPlot'), { c, k, H } = plotFit(cv, W, 240, 520), P = pal(), TM = DL.TMAX * DL.DT;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const L0 = Math.max(50, 14 + 30 * k), R0 = W - 12, x = (t) => L0 + t / TM * (R0 - L0), rows = 3, gap = Math.max(8, 14 * k), rh = (H - 22 * k - gap * (rows - 1)) / rows;
    const series = (r) => { const fr = r.fr, y = fr.map((p) => p[1] * 100), v = r.v, dv = v.map((_, j) => { if (j < 2) return 0; const ax = fr[j][0] - 2 * fr[j - 1][0] + fr[j - 2][0], ay = fr[j][1] - 2 * fr[j - 1][1] + fr[j - 2][1]; return Math.hypot(ax, ay) / DL.DT; }); return [y, v, dv]; };
    const defs = [{ name: 'боковое положение, см', lo: -16, hi: 16 }, { name: 'скорость, м/с', lo: 0, hi: 0.5 }, { name: 'скачок скорости за шаг, м/с', lo: 0, hi: 0.5, thr: DL.JUMP }];
    const cur = st.run ? series(st.run) : null, prev = st.prev ? series(st.prev) : null, i = st.run ? (st.play ? st.play.index() : st.run.fr.length - 1) : 0;
    defs.forEach((d, ri) => {
      const top = ri * (rh + gap) + 4, bot = top + rh, y = (v) => bot - (Math.max(d.lo, Math.min(d.hi, v)) - d.lo) / (d.hi - d.lo) * (bot - top);
      c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(L0, top, R0 - L0, rh);
      HeroKit.label(c, k, fmt1(d.hi, d.hi >= 1 ? 0 : 2), L0 - 5, top + 6, { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
      HeroKit.label(c, k, fmt1(d.lo, Math.abs(d.lo) >= 1 ? 0 : 2), L0 - 5, bot - 4, { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
      HeroKit.label(c, k, d.name, L0 + 6, top + 9, { align: 'left', px: 11, weight: 650, color: P.ink2, haloColor: P.bg });
      if (d.thr) { c.strokeStyle = P.bad; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(L0, y(d.thr)); c.lineTo(R0, y(d.thr)); c.stroke(); c.setLineDash([]); HeroKit.label(c, k, 'порог 0,15', R0 - 4, y(d.thr) - 8, { align: 'right', px: 10.5, color: P.bad, weight: 700, haloColor: P.bg }); }
      const line = (arr, col, dash, n) => { c.strokeStyle = col; c.lineWidth = dash ? 1.2 : 1.8; c.setLineDash(dash ? [3, 3] : []); c.beginPath(); for (let j = 0; j < Math.min(arr.length, n); j++) { const t = j * DL.DT; j ? c.lineTo(x(t), y(arr[j])) : c.moveTo(x(t), y(arr[j])); } c.stroke(); c.setLineDash([]); };
      if (prev) line(prev[ri], P.ink3, true, Infinity);
      if (cur) line(cur[ri], P.e2e, false, i + 1);
      if (ri === 1 && st.drawOn) {
        if (predBins()) { c.strokeStyle = P.ink; c.lineWidth = 2.6; c.setLineDash([7, 4]); c.beginPath(); let on = false; st.pred.forEach((v, b) => { if (v == null) { on = false; return; } const px = x((b + 0.5) * 0.1), py = y(v); on ? c.lineTo(px, py) : c.moveTo(px, py); on = true; }); c.stroke(); c.setLineDash([]); }
        else if (!cur) HeroKit.label(c, k, 'нарисуй здесь, как будет меняться скорость', (L0 + R0) / 2, (top + bot) / 2, { px: 12, weight: 700, color: P.ink2, haloColor: P.bg });
      }
    });
    for (let s = 0; s <= TM; s += k > 1.6 ? 2 : 1) HeroKit.label(c, k, s + ' с', x(s), H - 8 * k, { px: 10.5, mono: true, color: P.ink3, halo: false, align: s === 0 ? 'left' : 'center' });
  }
  function out() {
    const r = st.run;
    if (!r) { setOut('#dlOut', `Режим: <b>${NAMES[st.mode]}</b>, задержка <b>${st.d * 20} мс</b>${st.obst ? '' : ', без препятствия'}. Запуск — кнопкой в карточке миссии.`); return; }
    if (st.play) { setOut('#dlOut', `<b>${NAMES[r.mode]}</b>, ${r.ms} мс · прошло ${fx(st.play.index() * DL.DT, 1)} с`); return; }
    setOut('#dlOut', `<b>${NAMES[r.mode]}</b>, ${r.ms} мс: паузы <b>${fx(r.pauseT, 2)} с</b> · скачок скорости <b>${fx(r.jump, 2)} м/с</b> (порог 0,15) · ${r.obst ? (r.hit ? '<b style="color:var(--critical)">задел препятствие</b>' : 'препятствие не задето') : 'без препятствия'} · путь ${fx(r.T, 1)} с`);
  }
  function render() { drawScene(); drawPlots(); out(); }
  function setCtl(o) { if (o.mode) { st.mode = o.mode; ui.mode.set(o.mode); } if (o.d != null) { st.d = o.d; ui.d.set(o.d); } if (o.obst != null) { st.obst = o.obst; $('#dlObst').checked = o.obst; } if (!st.play) { st.run = null; } render(); if (ctl) ctl.update(); }
  const state = () => ({ mode: st.mode, d: st.d, obst: st.obst, hist: st.hist.slice(), predBins: predBins() });
  const erase = () => { st.pred.fill(null); st.last = null; drawPlots(); if (ctl) ctl.update(); };
  const api = { reset() { st.hist = []; st.prev = null; st.pred.fill(null); setCtl({ mode: 'sync', d: 10, obst: true }); }, run, state, setCtl, erase, addPt: (t, v) => { const g = geo(); addPt({ x: g.x(t), y: g.y(v) }); } };
  const act = { label: 'Прогнать', run: (Xa) => Xa.run() };
  const sum = (r) => `${NAMES[r.mode]}, ${r.ms} мс${r.obst ? '' : ', без препятствия'}: паузы ${fx(r.pauseT, 1)} с, скачок ${fx(r.jump, 2)} м/с${r.hit ? ', удар' : ''}`;
  const pair = (hist) => { for (const a of hist) if (a.mode === 'naive' && a.ok) for (const b of hist) if (b.mode === 'naive' && !b.ok && b.obst === a.obst && b.d === a.d + 1) return a; return null; };
  const okRun = (r) => r.pauseT < DL.PAUSE && r.jump < DL.JUMP && !r.hit;
  const missions = [
    { short: 'Прогноз', title: 'Нарисуй скорость', text: 'Задержка вывода — 200 мс, режим синхронный: робот исполняет 25 действий, а потом стоит, пока модель считает новую пачку. Нарисуй на среднем графике, как будет меняться скорость робота: веди линию мышью или пальцем слева направо. Потом запусти и сравни.', controls: ['erase'],
      onEnter: (Xa) => Xa.setCtl({ mode: 'sync', d: 10, obst: true }),
      action: { label: 'Прогнать синхронно', run: (Xa) => Xa.run() },
      criteria: [{ label: 'Прогноз нарисован до запуска', test: (r) => r.predBins >= 10 }],
      summary: (r) => (r.predBins >= 10 ? `прогноз совпал на ${r.match}%` : 'запуск без прогноза'),
      fail: () => 'Сначала нарисуй прогноз на графике скорости: проведи линию хотя бы на секунду пути.',
      explain: (r) => `Совпадение с прогнозом — ${r.match}%${r.dips ? ', и провалы скорости в прогнозе угаданы' : ''}. Скорость падает до нуля каждые 0,7 с: полсекунды робот едет и 0,2 с стоит, пока модель считает пачку. За путь набирается ${fx(r.pauseT, 1)} с стоянок, а на каждом старте и остановке — скачок скорости. Чем больше задержка, тем длиннее стоянки.` },
    { short: 'Ставка', title: 'Какой режим выдержит 200 мс', text: 'Задержка вывода — 200 мс, это 10 шагов на 50 Гц. Выбирай режим и запускай. Нужен режим без пауз, без скачков на стыках пачек и без удара о препятствие.', controls: ['mode'],
      onEnter: (Xa) => Xa.setCtl({ d: 10, obst: true }),
      bet: { q: 'какой режим выдержит задержку 200 мс?', options: ['Синхронный', 'Наивный асинхронный', 'Temporal ensembling', 'RTC'], answer: () => 3 },
      action: act,
      criteria: [{ label: 'Пауз нет', test: (r) => r.pauseT < DL.PAUSE }, { label: 'Скачок скорости ниже 0,15 м/с', test: (r) => r.jump < DL.JUMP }, { label: 'Препятствие не задето', test: (r) => !r.hit }],
      summary: sum,
      fail: (r) => ({ sync: `Робот стоит, пока ждёт новую пачку: ${fx(r.pauseT, 1)} с пауз за путь, и дёргается на каждом старте.`, naive: `На стыках скачок до ${fx(r.jump, 2)} м/с: новая пачка посчитана по кадру 200-миллисекундной давности и не совпадает со старой.`, te: 'Пачки выбирают разные стороны объезда, и их среднее повело робота на препятствие.', rtc: 'RTC не прошёл — проверь задержку.' })[r.mode],
      explain: (r) => { const s = ACT.delayRun({ mode: 'sync', d: r.d, obst: r.obst }); return `RTC выдержал: пауз нет, скачок ${fx(r.jump, 2)} м/с, препятствие объехано. Путь занял ${fx(r.T, 1)} с, синхронный режим с той же задержкой — ${fx(s.T, 1)} с. Замороженные действия совпадают со старой пачкой, поэтому стык гладкий, а дорисовка продолжает ту же сторону объезда.`; } },
    { short: 'Без препятствия', title: 'Когда смешивание работает', text: 'Temporal ensembling провалился из-за двух объездов. Убери препятствие и найди режим, кроме RTC, который выдерживает те же 200 мс.', controls: ['mode', 'obst'],
      onEnter: (Xa) => Xa.setCtl({ d: 10 }),
      action: act,
      criteria: [{ label: 'Препятствия нет', test: (r) => !r.obst }, { label: 'Режим — не RTC', test: (r) => r.mode !== 'rtc' }, { label: 'Пауз нет и скачок ниже 0,15 м/с', test: (r) => r.pauseT < DL.PAUSE && r.jump < DL.JUMP }],
      summary: sum,
      hint: 'Синхронный режим всё равно стоит, наивный всё равно даёт скачки на стыках. Остаётся один.',
      fail: (r) => (r.obst ? 'Сначала убери препятствие.' : r.mode === 'rtc' ? 'RTC проходит и так. Найди другой режим.' : r.mode === 'sync' ? 'Синхронный режим стоит, пока ждёт пачку, и без препятствия.' : 'Наивное переключение дёргается и без препятствия: пачки посчитаны по разным кадрам.'),
      explain: (r) => `Без препятствия пачки согласны между собой, и temporal ensembling сглаживает стыки: скачок ${fx(r.jump, 2)} м/с. В нашей игрушке он ломается, когда соседние пачки выбирают разные стратегии. У ACT пачки детерминированы (z = 0), и смешивание там помогало. В π0 каждая пачка — новая выборка генеративной модели, и авторы отказались от смешивания: оно ухудшало работу.` },
    { short: 'Порог', title: 'Сколько терпит наивный режим', text: 'Найди наибольшую задержку, при которой наивный асинхронный режим ещё проходит: с ней всё в порядке, а с задержкой на 20 мс больше — уже нет.', controls: ['mode', 'delay'],
      onEnter: (Xa) => Xa.setCtl({ mode: 'naive', d: 0, obst: true }),
      action: act,
      criteria: [{ label: 'Наивный режим прошёл', test: (r, s) => s.hist.some((q) => q.mode === 'naive' && q.ok) }, { label: 'С задержкой на 20 мс больше он уже не проходит', test: (r, s) => !!pair(s.hist) }],
      summary: sum,
      hint: 'Начни с 0 мс и прибавляй по 20.',
      fail: (r) => (r.mode !== 'naive' ? 'В этой миссии нужен наивный режим.' : okRun(r) ? 'Проходит. Прибавь задержку.' : 'Не проходит. Найди задержку, при которой ещё проходит.'),
      explain: () => { const a = pair(DelayLab.st.hist); return `Порог — ${a ? a.ms : '?'} мс. Для сравнения: π0 выдаёт пачку за 73 мс на RTX 4090, а у Gemini Robotics путь от наблюдения до пачки занимает около 250 мс. Наивное переключение терпит только почти незаметную задержку, поэтому большим моделям нужен RTC или похожий способ склейки.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Все переключатели сразу. Сравни время пути синхронного режима и RTC при разных задержках: прошлый запуск остаётся на сцене серым пунктиром. Можно снова рисовать прогноз скорости перед запуском.', final: true, action: act, summary: sum },
  ];
  function init() {
    legend('#dlLegend', [['текущий запуск', 'var(--e2e)'], ['прошлый запуск', 'var(--ink-3)', true], ['твой прогноз скорости', 'var(--ink)', true], ['начала пачек', 'var(--ink)', 'dot']]);
    ui.mode = wireSeg('#wrapMode', 'm', (v) => { st.mode = v; if (!st.play) st.run = null; render(); if (ctl) ctl.update(); });
    ui.d = wireRange('dlDelay', (v) => v * 20 + ' мс', (v) => { st.d = v; if (!st.play) st.run = null; render(); if (ctl) ctl.update(); });
    $('#dlObst').addEventListener('change', (e) => { st.obst = e.target.checked; if (!st.play) st.run = null; render(); if (ctl) ctl.update(); });
    ui.mode.set('sync');
    HeroKit.loop($('#dlCv'), () => { if (st.play) render(); });
    const cv = $('#dlPlot');
    cv.addEventListener('pointerdown', (e) => { if (!st.drawOn || st.play) return; const p = toLogical(e), g = geo(); if (p.y < g.top - 12 || p.y > g.bot + 12 || p.x < g.L0 - 4 || p.x > g.R0 + 4) return; st.drawing = true; st.last = null; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } addPt(p); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (st.drawing) addPt(toLogical(e)); });
    const stop = () => { if (st.drawing) { st.drawing = false; st.last = null; if (ctl) ctl.update(); } };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    $('#dlErase').addEventListener('click', erase);
    ctl = mountMissions('#dlMis', missions, api, { scene: '#dlCv', controls: { mode: '#wrapMode', delay: '#wrapDelay', obst: '#wrapObst', erase: '#wrapErase' }, onStep: (i) => { st.drawOn = i === 0 || !!missions[i].final; cv.classList.toggle('drawing', st.drawOn); render(); } });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, geo };
})();

/* ---------- Квиз ---------- */
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
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, часть 1 пройдена.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Temporal ensembling в ACT больше доверяет свежим предсказаниям?', o: ['Да, свежие весят больше', 'Нет: w₀ — самое старое, при m = 0,01 и k = 100 оно даёт ≈ 1,6% итогового действия, самое свежее — ≈ 0,6%', 'Все предсказания весят одинаково'], a: 1, e: 'В коде ACT веса exp(−0,01·i) отсчитываются от самой старой пачки. Чтобы свежие весили больше, m нужно сделать отрицательным, как в разделе про смешивание пачек.' },
    { q: 'ACT — стохастическая генеративная политика?', o: ['Да: каждый раз выдаёт новое действие', 'Нет: CVAE нужен только при обучении, на выводе z = 0 и выход детерминирован', 'Да, если обучать с β = 10'], a: 1, e: 'Энкодер CVAE на выводе выбрасывают. Независимый перезапуск, препринт 2026 года, не воспроизвёл даже пользу CVAE из исходной абляции.' },
    { q: 'Чем длиннее пачка, тем лучше?', o: ['Да, всегда', 'Нет: у ACT успех немного падает при k = 200 и 400, у SmolVLA на LIBERO — 84% при пачке 10 и 74,5% при пачке 100', 'Пачки длиннее 10 действий не используют'], a: 1, e: 'Длинная пачка проходит паузы, но поздно реагирует на неожиданное. В лаборатории окно было от 14 до 25 действий, у Diffusion Policy лучше всего исполнять 8 шагов.' },
    { q: 'Большие VLA используют temporal ensembling из ACT?', o: ['Да, это стандарт', 'Нет: в π0 он ухудшал работу, в ALOHA Unleashed не понадобился, в экспериментах RTC раскачивал робота', 'Только на роботах с частотой 50 Гц'], a: 1, e: 'Вместо смешивания большие системы исполняют часть пачки и склеивают пачки, например через RTC.' },
    { q: 'ACT предсказывает приращения положений суставов?', o: ['Да, так устойчивее', 'Нет: абсолютные целевые положения ведущих рук; с приращениями было хуже', 'Нет: моменты моторов'], a: 1, e: 'Положения отрабатывает ПИД в моторах. Позиционные цели вместе с регулятором дают систему, устойчивую без обратной связи, — то условие, при котором пачки помогают.' },
    { q: 'Камеры ALOHA снимают на 50 Гц?', o: ['Да, как и всё остальное', 'Нет: камеры дают 30 кадров в секунду, а 50 Гц — частота управления и записи', 'Нет: 5 Гц'], a: 1, e: 'Частота управления важна: если снизить её до 5 Гц, операторы тратят на задачу на 62% больше времени.' },
    { q: 'Пачки помогают только тем, что решений становится в k раз меньше?', o: ['Да, и только этим', 'Нет: по ICLR 2026 механизм — устойчивость системы без обратной связи, а препринты 2026 года указывают на немарковость демонстраций', 'Пачки вообще не помогают'], a: 1, e: 'В интерактиве с 200 прогонами при λ > 1 пачка вредила, хотя решений было так же мало. А в лаборатории пачка проходила паузу, где пошаговая политика застревала.' },
    { q: 'Mobile ALOHA сам приготовил обед из трёх блюд?', o: ['Да, полностью автономно', 'Нет: ролик подписан «Teleoperating…», это телеоперация. Автономно робот готовил креветку с успехом 40%', 'Да, но с подсказками голосом'], a: 1, e: 'Всегда смотри подпись к ролику: телеоперация показывает, что умеет железо, а не политика.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav); safe('aloha', initAloha);
    safe('err', () => { mis.err = ErrLab.init(); }); safe('chunk', () => { mis.chunk = ChunkLab.init(); }); safe('arch', () => { mis.arch = ArchLab.init(); });
    safe('cvae', () => { mis.cvae = CvaeLab.init(); }); safe('te', () => { mis.te = TeLab.init(); }); safe('delay', () => { mis.delay = DelayLab.init(); });
    safe('quiz', initQuiz);
    window.__l17 = { mis, SPEED, ErrLab, ChunkLab, ArchLab, CvaeLab, TeLab, DelayLab }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
