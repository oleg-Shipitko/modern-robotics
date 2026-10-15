/* =====================================================================
   ui-l45.js — урок 4.5 «Симуляция и синтетические данные». Схема и интерактивы:
   0) анимированная схема MimicGen (shared/anim.js): запись оператора →
      куски к кубику и к миске → перенос к новой расстановке → прямые
      переезды → исполнение в симуляторе → проверка и счётчик попыток;
   1) лаборатория «Рандомизация на глаз»: обучение на столе симулятора,
      проверка на столе Ады, кривые успеха от ширины рандомизации;
   2) интерактив: абляции рандомизаций Dactyl (табл. 3 и 4 статьи);
   3) лаборатория «Генерация демонстраций»: 10 записей против 10 + 300
      сгенерированных, проверка генерации в симуляторе;
   4) квиз.
   Движок — l45/engine.js (без DOM) поверх l21/engine.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение ожиданий для автотестов; на результаты не влияет
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pct = (v) => Math.round(v * 100);
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);
const rgbCss = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;
/** Картинка движка (RGB 0…1) → холст того же размера; кэш по объекту картинки. */
const BM = new WeakMap();
function bitmap(img, w, hgt) {
  if (BM.has(img)) return BM.get(img);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); BM.set(img, cv); return cv;
}
/** Раскладка графика: широкая или узкая (телефон) — по ширине холста на странице. */
const chartDims = (cv, wide, narrow) => ((cv.getBoundingClientRect().width || wide[0]) < 520 ? narrow : wide);
/** Обучение-генератор кусками между кадрами; onEv получает события генератора. */
function runGen(gen, onEv, budget) { return runChunked(gen, onEv, budget || 14); }

/* =====================================================================
   0. Схема: как MimicGen делает новую демонстрацию
   ===================================================================== */
const MGScheme = (() => {
  const E = L45, M = E.MG, T = 14;
  const PH = { rec: [0, 3.4], move: [3.6, 5.4], exec: [5.6, 9.4], ok: [9.4, 10.6], count: [10.6, 13.4] };
  // исходная запись и новая расстановка — из движка лаборатории 2
  const src = { cube: [30, 36], bowl: [64, 34] }, demo = E.operatorDemo({ cube: src.cube, bowl: src.bowl }, 3);
  const dst = { cube: [56, 22], bowl: [44, 60] };
  const dc = [dst.cube[0] - src.cube[0], dst.cube[1] - src.cube[1]], db = [dst.bowl[0] - src.bowl[0], dst.bowl[1] - src.bowl[1]];
  const s1 = demo.pts.slice(0, demo.k1), s2 = demo.pts.slice(demo.k1);
  const t1 = s1.map((p) => [p[0] + dc[0], p[1] + dc[1]]), t2 = s2.map((p) => [p[0] + db[0], p[1] + db[1]]);
  const T_ = [], Gr = [];
  for (let i = 1; i <= M.NI; i++) { T_.push([M.HOME[0] + (t1[0][0] - M.HOME[0]) * i / M.NI, M.HOME[1] + (t1[0][1] - M.HOME[1]) * i / M.NI]); Gr.push(0); }
  t1.forEach((p, i) => { T_.push(p); Gr.push(demo.grip[i]); });
  const e1 = t1[t1.length - 1];
  for (let i = 1; i <= M.NI; i++) { T_.push([e1[0] + (t2[0][0] - e1[0]) * i / M.NI, e1[1] + (t2[0][1] - e1[1]) * i / M.NI]); Gr.push(1); }
  t2.forEach((p, i) => { T_.push(p); Gr.push(demo.grip[demo.k1 + i]); });
  const ex = E.execute({ cube: dst.cube, bowl: dst.bowl }, T_, Gr), path = ex.path, gripAt = Gr.indexOf(1);
  const ATT = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1];                         // счётчик: 9 из 10, как в лаборатории ниже
  const sub = (pts, u) => { const n = Math.max(1, Math.floor(u * (pts.length - 1)) + 1); return pts.slice(0, n); };
  function table(c, k, G, ox, oy, title, P, A) {
    const s = G.s, W = 96 * s;
    A.rect(c, ox, oy, W, W, 8, P.surf2, P.line, 1.2);
    A.lab(c, k, title, ox + W / 2, oy - 12, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    const hx = ox + M.HOME[0] * s, hy = oy + M.HOME[1] * s;
    A.circle(c, hx, hy, 5, P.surf, P.ink3, 1.5);
  }
  const at = (G, ox, oy, p) => [ox + p[0] * G.s, oy + p[1] * G.s];
  function cube(c, G, ox, oy, p, P) { const [x, y] = at(G, ox, oy, p), r = 4.5 * G.s; c.fillStyle = '#db3833'; c.fillRect(x - r, y - r, 2 * r, 2 * r); c.strokeStyle = P.ink; c.lineWidth = 1; c.strokeRect(x - r, y - r, 2 * r, 2 * r); }
  function bowl(c, G, ox, oy, p, P, A) { const [x, y] = at(G, ox, oy, p); A.circle(c, x, y, M.BOWL_R * G.s, null, P.ink2, 3.2); A.circle(c, x, y, M.BOWL_R * G.s - 4, null, Anim.kit.alpha(P.ink2, 0.35), 1); }
  function poly(c, G, ox, oy, pts, col, lw, dash, A) { if (pts.length < 2) return; A.line(c, pts.map((p) => at(G, ox, oy, p)), col, lw, dash); }
  function draw(c, k, t, P0, A, G) {
    const P = Object.assign({}, P0), u = ((t % T) + T) % T, { seg, lab } = A;
    const L = G.L, R = G.R;
    table(c, k, G, L[0], L[1], 'запись оператора', P, A);
    table(c, k, G, R[0], R[1], G.narrow ? 'новая расстановка' : 'новая расстановка в симуляторе', P, A);
    // 1. запись оператора: кусок 1 сплошной, кусок 2 пунктиром
    const rec = seg(u, ...PH.rec), all = demo.pts, n = Math.floor(rec * (all.length - 1)) + 1;
    const p1 = all.slice(0, Math.min(n, demo.k1)), p2 = n > demo.k1 ? all.slice(demo.k1 - 1, n) : [];
    const carry1 = n > demo.k1 && rec < 1;
    bowl(c, G, L[0], L[1], src.bowl, P, A);
    poly(c, G, L[0], L[1], p1, P.mot, 3, null, A); poly(c, G, L[0], L[1], p2, P.mot, 3, [6, 5], A);
    cube(c, G, L[0], L[1], carry1 ? all[n - 1] : rec >= 1 ? src.bowl : src.cube, P);
    if (rec < 1) { const g = at(G, L[0], L[1], all[n - 1]); A.circle(c, g[0], g[1], 5, P.mot, P.ink, 1.2); }
    if (rec > 0.35) { const q = at(G, L[0], L[1], s1[Math.floor(s1.length * 0.45)]); lab(c, k, 'кусок 1: к кубику', q[0] - 8, q[1], { px: 10.5, align: 'right', color: P.mot, haloColor: P.surf2 }); }
    if (rec > 0.8) { const q = at(G, L[0], L[1], s2[Math.floor(s2.length * 0.5)]); lab(c, k, 'кусок 2: к миске', q[0], q[1] - 12, { px: 10.5, color: P.mot, haloColor: P.surf2 }); }
    // 2. перенос: куски летят к новым предметам
    const mv = seg(u, ...PH.move), ex2 = seg(u, ...PH.exec);
    bowl(c, G, R[0], R[1], dst.bowl, P, A);
    if (u >= PH.move[0]) {
      const e = A.ease(mv), fly = (pts, d) => pts.map((p) => { const a = at(G, L[0], L[1], p), b = at(G, R[0], R[1], [p[0] + d[0], p[1] + d[1]]); return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]; });
      const fade = u < PH.exec[1] ? 1 : 0.45;
      A.line(c, fly(s1, dc), Anim.kit.alpha(P.mot, 0.75 * fade), 2.4); A.line(c, fly(s2, db), Anim.kit.alpha(P.mot, 0.75 * fade), 2.4, [6, 5]);
      if (mv < 1) { const a = G.mid; A.arrow(c, a[0], a[1], a[2], a[3], P.ink3, 2, 8); if (G.narrow) lab(c, k, 'перенос вместе с предметами', a[0] + 12, (a[1] + a[3]) / 2, { px: 10.5, align: 'left', color: P.ink2, haloColor: P.surf }); else lab(c, k, 'перенос вместе с предметами', (a[0] + a[2]) / 2, (a[1] + a[3]) / 2 - 12, { px: 10.5, color: P.ink2, haloColor: P.surf }); }
    }
    // 3. прямые переезды и исполнение в симуляторе
    if (u >= PH.exec[0]) {
      const i1 = [M.HOME, t1[0]], i2 = [e1, t2[0]];
      poly(c, G, R[0], R[1], i1, P.ink3, 1.6, [3, 4], A); poly(c, G, R[0], R[1], i2, P.ink3, 1.6, [3, 4], A);
      const pp = sub(path, ex2); poly(c, G, R[0], R[1], pp, P.spr, 3.2, null, A);
      const last = pp[pp.length - 1], held = pp.length - 1 >= gripAt && pp.length - 1 < path.length - 3 && ex2 < 1;
      cube(c, G, R[0], R[1], held ? last : ex2 >= 1 ? dst.bowl : dst.cube, P);
      if (ex2 < 1) { const g = at(G, R[0], R[1], last); A.circle(c, g[0], g[1], 5, P.spr, P.ink, 1.2); }
      if (ex2 < 0.25) { const q = at(G, R[0], R[1], [(M.HOME[0] + t1[0][0]) / 2, (M.HOME[1] + t1[0][1]) / 2]); lab(c, k, 'прямой переезд, 5 шагов', q[0] + 8, q[1], { px: 10.5, align: 'left', color: P.ink2, haloColor: P.surf2 }); }
    } else cube(c, G, R[0], R[1], dst.cube, P);
    // 4. проверка и счётчик
    if (u >= PH.ok[0]) {
      const okA = Math.min(1, seg(u, ...PH.ok) * 3), qx = R[0] + 48 * G.s, qy = R[1] + 18;
      c.globalAlpha = okA; A.rect(c, qx - 58, qy - 11, 116, 22, 7, P.surf, P.good, 1.5); A.rect(c, qx - 58, qy - 11, 116, 22, 7, Anim.kit.alpha(P.good, 0.16), null);
      lab(c, k, '✓ кубик в миске', qx, qy, { px: 11, weight: 700, color: P.good, halo: false }); c.globalAlpha = 1;
    }
    const cx = G.cnt[0], cy = G.cnt[1], cw = G.cnt[2], nOn = u >= PH.count[0] ? Math.min(10, Math.floor(seg(u, ...PH.count) * 10.99)) : u >= PH.ok[0] ? 1 : 0;
    lab(c, k, 'попытки генерации:', cx, G.narrow ? cy - 12 : cy + 10, { px: 11, align: 'left', color: P.ink2, haloColor: P.surf });
    for (let i = 0; i < 10; i++) {
      const x = cx + G.cnt[3] + i * (cw + 4), on = i < nOn, ok = ATT[i];
      A.rect(c, x, cy, cw, 20, 4, on ? Anim.kit.alpha(ok ? P.good : P.bad, 0.18) : null, on ? (ok ? P.good : P.bad) : P.line, 1.3);
      if (on) lab(c, k, ok ? '✓' : '✗', x + cw / 2, cy + 10, { px: 11, weight: 700, color: ok ? P.good : P.bad, halo: false });
    }
    if (nOn >= 10) lab(c, k, G.narrow ? 'в набор — 9 из 10; ✗ — рука не успела к кубику' : 'в набор идут 9 из 10; ✗ — рука не успела к кубику, попытка отброшена', cx + G.cnt[3], cy + 36, { px: 10.5, align: 'left', color: P.ink3, haloColor: P.surf });
  }
  Anim.add('mimicgen', {
    W: 720, H: 360, start: 2.4, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { s: 2.3, L: [22, 40], R: [478, 40], mid: [268, 284, 450, 284], cnt: [22, 308, 34, 128] }); },
    narrow: { W: 360, H: 660, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, s: 2.6, L: [55, 30], R: [55, 334], mid: [180, 286, 180, 314], cnt: [24, 614, 26, 0] }); } },
  });
  return { ex };
})();

/* =====================================================================
   1. Лаборатория: рандомизация на глаз
   ===================================================================== */
const Rand = (() => {
  const E = L45, CW = 360, LV = ['table', 'light', 'color'];
  const st = { scene: 0, lv: { table: 0, light: 0, color: 0 }, models: {}, checks: {}, busy: null, prog: 0, fresh: null };
  let ctl = null, simT = null, realT = null;
  const simTest = () => simT || (simT = E.testSet('sim'));
  const realTest = () => realT || (realT = E.testSet('real'));
  const key = (lv) => E.lvKey(lv || st.lv);
  const lvOf = (k) => ({ table: +k[0], light: +k[1], color: +k[2] });
  const SER_A = ['000', '110', '220', '330', '440'], SER_B = ['330', '331', '332', '333', '334'];
  /** Обучить модели по ключам; прогресс общий; проверки — сразу после обучения. */
  async function trainKeys(keys, tag) {
    const todo = keys.filter((k) => !st.models[k]); if (!todo.length) return;
    st.busy = tag; st.prog = 0; render();
    for (let q = 0; q < todo.length; q++) {
      const k = todo[q], set = E.simSet(lvOf(k));
      st.models[k] = await runGen(E.train(set, { seed: 5 }), (e) => { st.prog = (q + (e.it + 1) / e.iters) / todo.length; tick(); });
      st.checks[k] = { sim: E.check(st.models[k], simTest()), real: E.check(st.models[k], realTest()) };
    }
    st.busy = null; st.prog = 1; render();
  }
  let last = 0; function tick() { const now = performance.now(); if (now - last > 120) { last = now; render(); } }
  const res = (k) => st.checks[k] || null;
  /** Куда уходят попытки на столе Ады: красный кубик, кубик другого цвета, миски и банки, стол. */
  function split(k) {
    const r = res(k).real, m = [0, 0, 0, 0];
    r.runs.forEach((q) => { m[0] += q.mass[0]; m[1] += q.mass[1]; m[2] += q.mass[2] + q.mass[3]; });
    m[0] /= r.n; m[1] /= r.n; m[2] /= r.n; m[3] = Math.max(0, 1 - m[0] - m[1] - m[2]); return m;
  }
  /* ---- рисование ---- */
  const simCache = {};
  function simScenes() { const k = key(); return simCache[k] || (simCache[k] = [0, 1, 2, 3].map((i) => E.scene(E.CFG.SIM_SEED + i, 'sim', lvOf(k)))); }
  function drawSim() {
    const cv = $('#rCvSim'), { c } = HeroKit.fit(cv, CW, CW), P = pal(), half = CW / 2;
    c.imageSmoothingEnabled = false;
    simScenes().forEach((sc, i) => { c.drawImage(bitmap(sc.img, L21.TW, L21.TW), (i % 2) * half, Math.floor(i / 2) * half, half, half); });
    c.strokeStyle = P.surf; c.lineWidth = 3; c.beginPath(); c.moveTo(half, 0); c.lineTo(half, CW); c.moveTo(0, half); c.lineTo(CW, half); c.stroke();
  }
  function drawReal() {
    const cv = $('#rCvReal'), { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), sc = realTest()[st.scene], s = CW / L21.TW, m = st.models[key()];
    c.imageSmoothingEnabled = false; c.drawImage(bitmap(sc.img, L21.TW, L21.TW), 0, 0, CW, CW);
    if (m) {
      c.fillStyle = 'rgba(20, 24, 32, 0.42)'; c.fillRect(0, 0, CW, CW);
      const p = E.probs(m, sc); let mx = 1e-12; for (const v of p) mx = Math.max(mx, v);
      const cs = CW / L21.G; c.fillStyle = P.e2e;
      for (let i = 0; i < p.length; i++) { const a = Math.pow(p[i] / mx, 0.6); if (a < 0.05) continue; c.globalAlpha = 0.9 * a; c.fillRect((i % L21.G) * cs, Math.floor(i / L21.G) * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    const t = sc.target; c.beginPath(); c.arc(t.x * s, t.y * s, L21.RT * s * 1.3, 0, 7); c.lineWidth = 3; c.strokeStyle = P.good; c.stroke();
    if (!m) HeroKit.label(c, k, st.busy ? 'модель учится…' : 'модель для этих ползунков не обучена', CW / 2, 22, { px: 13, weight: 700, color: P.ink, haloColor: P.surf });
  }
  const OBJ = (q) => (q ? L21.phrase(q.color, q.shape) : 'стол');
  function stats() {
    const k = key(), r = res(k), L = $('#rStatL'), R = $('#rStatR');
    if (!r) { setOut(L, st.busy ? 'Модель учится…' : 'Ещё не обучена'); L.className = 'pane-stat'; setOut(R, st.busy ? 'Модель учится…' : 'Ещё не проверена'); R.className = 'pane-stat'; return; }
    setOut(L, `<b>В симуляторе: ${pct(r.sim.rate)}%</b> попыток`); L.className = 'pane-stat' + (r.sim.rate >= 0.9 ? ' ok' : ' bad');
    const q = r.real.runs[st.scene], sc = realTest()[st.scene], top = q.top >= 0 ? sc.objs[q.top] : null;
    setOut(R, `<b>На столе Ады: ${pct(r.real.rate)}%</b> · здесь ${pct(q.p)}%, чаще всего — ${q.top === 0 ? 'красный кубик' : OBJ(top)}`); R.className = 'pane-stat' + (r.real.rate >= 0.85 ? ' ok' : ' bad');
  }
  function rangeNote() {
    const lv = st.lv, tR = [0, 0.14, 0.31, 0.5, 0.7][lv.table], b = E.LIGHT_B[lv.light], tt = E.LIGHT_T[lv.light], hue = E.HUE[lv.color], sv = E.SV[lv.color];
    const tab = lv.table ? `цвет стола ±${fmt(tR, 2)} по каналу${lv.table >= 2 ? ', бывают полосы и клетка' : ''}` : 'серый пластик';
    const li = lv.light ? `яркость ×${fmt(Math.exp(-b), 2)}…${fmt(Math.exp(b), 2)}, оттенок ±${Math.round(tt * 100)}%` : 'ровный';
    const co = lv.color ? (lv.color === 4 ? 'любой оттенок' : `оттенок ±${hue}°`) + `, насыщенность и яркость ±${Math.round(sv * 100)}%` : 'точная';
    setOut($('#rRange'), `Сейчас в симуляторе: скатерть — ${tab}; свет — ${li}; краска — ${co}.`);
  }
  function drawChart() {
    const cv = $('#rChart'), [W, H, nar] = chartDims(cv, [640, 250, false], [360, 290, true]), { c, k } = HeroKit.fit(cv, W, H), P = pal(), short = nar || k > 1.5;
    const x0 = short ? 52 : 70, x1 = W - (short ? 14 : 24), y0 = 18, y1 = H - 46, X = (i) => x0 + (x1 - x0) * i / 4, Y = (v) => y1 - (y1 - y0) * v;
    c.clearRect(0, 0, W, H); c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); HeroKit.label(c, k, short ? String(v * 100) : `${v * 100}%`, x0 - 8, Y(v), { px: 11, align: 'right', color: P.ink3, haloColor: P.surf }); }
    for (let i = 0; i <= 4; i++) HeroKit.label(c, k, i === 0 ? (short ? '0' : '0 — как есть') : i === 4 ? (short ? '4' : '4 — шире всего') : String(i), X(i) + (i === 0 && !short ? -6 : i === 4 && !short ? 6 : 0), y1 + 14, { px: 11, align: i === 0 && !short ? 'left' : i === 4 && !short ? 'right' : 'center', color: P.ink3, haloColor: P.surf });
    HeroKit.label(c, k, short ? 'ширина рандомизации' : 'ширина рандомизации, уровень', (x0 + x1) / 2, H - 12, { px: 11.5, weight: 650, color: P.ink2, haloColor: P.surf });
    c.save(); c.translate(short ? 10 : 16, (y0 + y1) / 2); c.rotate(-Math.PI / 2); HeroKit.label(c, k, short ? 'берёт кубик, %' : 'берёт кубик, % попыток', 0, 0, { px: 11.5, weight: 650, color: P.ink2, haloColor: P.surf }); c.restore();
    let any = false;
    for (const [ser, col] of [[SER_A, P.cl], [SER_B, P.hy]]) {
      for (const [which, dash] of [['sim', [5, 4]], ['real', null]]) {
        const pts = ser.map((kk, i) => (res(kk) ? [X(i), Y(res(kk)[which].rate)] : null));
        c.strokeStyle = col; c.lineWidth = which === 'real' ? 2.6 : 1.6; c.setLineDash(dash || []); c.beginPath(); let on = false;
        pts.forEach((p) => { if (!p) { on = false; return; } if (on) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); on = true; }); c.stroke(); c.setLineDash([]);
        pts.forEach((p) => { if (!p) return; any = true; c.beginPath(); c.arc(p[0], p[1], which === 'real' ? 4.5 : 3, 0, 7); c.fillStyle = which === 'real' ? col : P.surf; c.fill(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); });
      }
    }
    const kk = key(), r = res(kk);
    if (r && !SER_A.includes(kk) && !SER_B.includes(kk)) { const xs = (st.lv.table + st.lv.light + st.lv.color) / 3; c.beginPath(); c.arc(X(xs), Y(r.real.rate), 6, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 2.5; c.stroke(); HeroKit.label(c, k, `${kk[0]}-${kk[1]}-${kk[2]}: ${pct(r.real.rate)}%`, X(xs), Y(r.real.rate) - 14, { px: 11, weight: 700, color: P.e2e, haloColor: P.surf }); any = true; }
    if (!any) HeroKit.label(c, k, short ? 'точки появятся во 2-й и 3-й миссиях' : 'Точки появятся, когда модели обучатся во второй и третьей миссиях', (x0 + x1) / 2, (y0 + y1) / 2, { px: 12.5, weight: 650, color: P.ink3, haloColor: P.surf });
  }
  function render() {
    for (const a of LV) { const inp = $('#r' + a[0].toUpperCase() + a.slice(1)); if (+inp.value !== st.lv[a]) inp.value = st.lv[a]; syncRange(inp, String(st.lv[a])); }
    setOut($('#rSubL'), st.lv.table + st.lv.light + st.lv.color ? `четыре обучающие сцены, рандомизация ${st.lv.table}-${st.lv.light}-${st.lv.color}` : 'четыре обучающие сцены, без рандомизации');
    drawSim(); drawReal(); stats(); rangeNote(); drawChart();
    const pg = $('#rProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    $('#rTrain').disabled = !!st.busy || !!st.models[key()];
    const el = $('#rOut');
    if (st.busy) setOut(el, `Модели учатся в браузере на сценах симулятора: <b>${pct(st.prog)}%</b>`);
    else setOut(el, `Сцена проверки ${st.scene + 1} из 48. Ползунки: скатерть ${st.lv.table}, свет ${st.lv.light}, краска ${st.lv.color}.${st.models[key()] ? '' : ' Модели для этих ползунков пока нет.'}`);
  }
  function setScene(i) { st.scene = Math.max(0, Math.min(47, i)); const inp = $('#rScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); }
  function setLv(lv) { st.lv = Object.assign({}, st.lv, lv); render(); if (ctl) ctl.update(); }
  /** Самая показательная сцена: где модель key ошибается сильнее всего. */
  function worst(k) { const r = res(k).real; let b = 0; r.runs.forEach((q, i) => { if (q.p < r.runs[b].p) b = i; }); return b; }
  const state = () => { const k = key(), r = res(k); return { key: k, lv: Object.assign({}, st.lv), trained: !!r, sim: r ? r.sim.rate : null, real: r ? r.real.rate : null, busy: !!st.busy }; };
  const api = {
    reset() { setLv({ table: 0, light: 0, color: 0 }); setScene(0); },
    state, setScene, setLv, render, res, split,
    async base() {
      await trainKeys(['000'], 'r1'); setLv({ table: 0, light: 0, color: 0 });
      const r = res('000'), m = split('000'); setScene(worst('000'));
      return { sim: r.sim.rate, real: r.real.rate, cube: m[0], other: m[1], misc: m[2], table: m[3] };
    },
    async sweepTL() {
      await trainKeys(SER_A, 'r2'); const v = SER_A.map((k) => res(k).real.rate), best = v.indexOf(Math.max(...v));
      setLv(lvOf(SER_A[best])); setScene(worst('000'));
      return { v, best, base: v[0], top: v[best], sim: SER_A.map((k) => res(k).sim.rate) };
    },
    async sweepC() {
      await trainKeys(SER_B, 'r3'); const v = SER_B.map((k) => res(k).real.rate), s = SER_B.map((k) => res(k).sim.rate);
      setLv(lvOf('334')); const m = split('334');
      return { v, sim: s, table: m[3], objs: m[1] + m[2], best12: Math.max(v[1], v[2]), c0: v[0], c4: v[4] };
    },
    async trainHere() { await trainKeys([key()], 'r4'); if (ctl) ctl.update(); return state(); },
  };
  const missions = [
    { short: 'Перенос', title: 'Из симулятора на стол Ады', text: 'Обучи модель на 96 сценах симулятора без рандомизации: серый стол, ровный свет, точные краски. Её проверят на 48 расстановках дважды — в симуляторе и на столе Ады.',
      controls: ['scene'],
      bet: { q: 'как модель справится на столе Ады?', options: ['Так же, как в симуляторе: стол, предметы и задача те же', 'Немного хуже, в пределах 10 процентных пунктов', 'Заметно хуже'], answer: (r) => (r.sim - r.real >= 0.2 ? 2 : r.sim - r.real >= 0.05 ? 1 : 0) },
      action: { label: 'Обучить в симуляторе и проверить', run: (X) => X.base() },
      criteria: [{ label: 'В симуляторе модель берёт кубик не меньше чем в 95% попыток', test: (r) => r.sim >= 0.95 }, { label: 'На столе Ады — хуже хотя бы на 20 процентных пунктов', test: (r) => r.sim - r.real >= 0.2 }],
      explain: (r) => `В симуляторе — ${pct(r.sim)}% попыток, на столе Ады — ${pct(r.real)}%. Остальные попытки уходят на сам стол — ${pct(r.table)}%: края предметов, тени и волокна дуба под тёплой лампой выглядят для модели почти как кубик; ${pct(r.other)}% — на кубик другого цвета и ${pct(r.misc)}% — на миски и банки. На сцене сейчас расстановка, где модель ошибается сильнее всего. Модель выучила красный цвет и серый фон симулятора, а настоящий кубик под лампой темнее, и фон другой.` },
    { short: 'Скатерть и свет', title: 'Менять скатерть и свет', text: 'Обучим ещё четыре модели. В их симуляторе скатерть и свет меняются с шириной 1, 2, 3 и 4, краска — как была. Каждую проверят на тех же 48 расстановках, точки лягут на график.',
      controls: ['scene', 'table', 'light'],
      bet: { q: 'что станет с успехом на столе Ады?', options: ['Не изменится: дубового стола и вечерней лампы в симуляторе всё равно нет', 'Упадёт: модели придётся учить лишнее', 'Вырастет'], answer: (r) => (r.top - r.base >= 0.1 ? 2 : r.base - r.top >= 0.1 ? 1 : 0) },
      action: { label: 'Обучить четыре модели', run: (X) => X.sweepTL() },
      criteria: [{ label: 'Лучшая ширина даёт на столе Ады не меньше 90%', test: (r) => r.top >= 0.9 }, { label: 'Без рандомизации хуже лучшей хотя бы на 15 процентных пунктов', test: (r) => r.top - r.base >= 0.15 }],
      explain: (r) => `На столе Ады при ширине 0–4: ${r.v.map((v) => pct(v) + '%').join(', ')}; в симуляторе все модели берут кубик почти всегда. Дубового стола и лампы в симуляторе так и нет, но среди сотни случайных скатертей и ламп нашлись похожие, и модель научилась не смотреть на фон и оттенок света. Лучше всего — ширина ${r.best}, а дальше прибавки нет: ${pct(r.v[4])}% на уровне 4.` },
    { short: 'Краска', title: 'Краску — тоже как можно шире?', text: 'Скатерть и свет оставим на ширине 3. Добавим рандомизацию краски предметов: оттенок, насыщенность и яркость каждого предмета — от ±5° оттенка на уровне 1 до любого цвета на уровне 4.',
      controls: ['scene', 'table', 'light', 'color'],
      bet: { q: 'как широко менять краску?', options: ['Как можно шире: тогда стол Ады точно окажется одним из вариантов', 'Узко: шире реальных отличий краски менять незачем', 'Неважно: успех почти не изменится'], answer: (r) => (r.c4 < r.best12 - 0.2 ? 1 : r.c4 >= Math.max(...r.v) - 0.02 ? 0 : 2) },
      action: { label: 'Обучить четыре модели', run: (X) => X.sweepC() },
      criteria: [{ label: 'Узкая рандомизация краски (уровень 1 или 2) не хуже, чем без неё', test: (r) => r.best12 >= r.c0 }, { label: 'Краска любого цвета хуже, чем без рандомизации краски, хотя бы на 30 пунктов', test: (r) => r.c0 - r.c4 >= 0.3 }],
      explain: (r) => `Краска 0–4: ${r.v.map((v) => pct(v) + '%').join(', ')} на столе Ады. Немного краски помогает: настоящий красный кубик темнее, чем в симуляторе, и модель привыкает к разбросу. А на уровне 4 красный кубик в обучении бывает любого цвета — синим, зелёным, оранжевым, — и главный признак кубика пропадает: модель уже не уверена, где он, и вероятность расплывается — ${pct(r.table)}% попыток уходит на стол, ${pct(r.objs)}% — на другие предметы. Хуже стало даже в симуляторе: ${pct(r.sim[4])}% против ${pct(r.sim[0])}%. Тобин и соавторы рандомизировали цвет целиком, потому что их задача от цвета не зависела; здесь цвет и есть задача.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Ставь ползунки как хочешь и нажимай «Обучить при этих ползунках». Найди настройку, при которой Ада на своём столе берёт кубик чаще, чем на лучшей точке кривых, и посмотри на сценах, куда уходят оставшиеся попытки.', final: true },
  ];
  function init() {
    legend('#rLegend', [['вероятность сомкнуть захват в клетке', 'var(--e2e)', 'band'], ['красный кубик, который надо взять', 'var(--good)', 'ring'], ['график: меняются скатерть и свет', 'var(--classic)', 'thick'], ['график: скатерть и свет на 3, меняется краска', 'var(--hybrid)', 'thick'], ['сплошная линия — стол Ады, пунктир — симулятор', 'var(--ink-3)', 'dash']]);
    $('#rScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    for (const a of LV) $('#r' + a[0].toUpperCase() + a.slice(1)).addEventListener('input', (e) => setLv({ [a]: +e.target.value }));
    $('#rTrain').addEventListener('click', () => { if (!st.busy) api.trainHere(); });
    ctl = mountMissions('#rMis', missions, api, { controls: { scene: '#wrapRScene', table: '#wrapRTable', light: '#wrapRLight', color: '#wrapRColor', train: '#rTrain' }, scene: '#rDuo' });
    syncRange($('#rScene'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Интерактив: без каких рандомизаций рука Dactyl роняет кубик
   ===================================================================== */
const Dactyl = (() => {
  const E = L45, D = E.DACTYL;
  let W = 640, H = 340;
  const st = { group: 'all', pose: 'markers', open: { markers: false, vision: false }, hover: null };
  let ctl = null, dots = [];
  const ROWS = [['all', 'markers'], ['noise', 'markers'], ['physics', 'markers'], ['unmodeled', 'markers'], ['none', 'markers'], ['all', 'vision'], ['noise', 'vision']];
  const SHORT = { all: 'всё', noise: 'без шума', physics: 'без физики', unmodeled: 'без эффектов', none: 'без рандомизаций' };
  const visible = (id, pose) => (id === 'all' && pose === 'markers') || st.open[pose] || (pose === 'vision' && id === 'all' && st.open.markers);
  function draw() {
    const cv = $('#dChart'), dm = chartDims(cv, [640, 340, false], [360, 392, true]); W = dm[0]; H = dm[1];
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), short = dm[2] || k > 1.5;
    const x0 = short ? 128 : 210, x1 = W - (short ? 14 : 20), y0 = 26, rh = short ? 40 : 34, X = (v) => x0 + (x1 - x0) * v / 50;
    dots = []; c.clearRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 10, 20, 30, 40, 50]) { c.beginPath(); c.moveTo(X(v), y0 - 8); c.lineTo(X(v), y0 + rh * 8 - 6); c.stroke(); HeroKit.label(c, k, String(v), X(v), y0 + rh * 8 + 8, { px: 11, color: P.ink3, haloColor: P.surf }); }
    HeroKit.label(c, k, short ? 'поворотов подряд' : 'поворотов подряд до падения кубика (попытку останавливали на 50)', (x0 + x1) / 2, H - 12, { px: 11.5, weight: 650, color: P.ink2, haloColor: P.surf });
    // строка симулятора: только медиана и среднее (100 попыток, отдельных чисел в статье нет)
    const ys = y0 + rh * 0.5;
    HeroKit.label(c, k, short ? 'симулятор' : 'в симуляторе, всё', x0 - 10, ys, { px: 11.5, align: 'right', weight: 650, color: P.ink2, haloColor: P.surf });
    c.fillStyle = rgba(P.ink3, 0.18); c.fillRect(X(D.sim.mean), ys - 7, X(50) - X(D.sim.mean), 14);
    c.strokeStyle = P.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(X(D.sim.median), ys - 11); c.lineTo(X(D.sim.median), ys + 11); c.stroke();
    HeroKit.label(c, k, short ? 'медиана 50' : 'медиана 50, среднее 43,4 (100 попыток)', X(D.sim.mean) - 8, ys, { px: 10.5, align: 'right', color: P.ink3, haloColor: P.surf });
    ROWS.forEach(([id, pose], ri) => {
      const y = y0 + rh * (ri + 1.5) + (pose === 'vision' ? 6 : 0), row = E.dactyl(id, pose), vis = visible(id, pose), sel = st.group === id && st.pose === pose;
      if (sel) { c.fillStyle = rgba(P.e2e, 0.12); c.fillRect(4, y - rh / 2 + 1, W - 8, rh - 2); }
      const name = short ? SHORT[id] : row.name + (pose === 'vision' ? ', по камерам' : '');
      const fs = short ? 10.5 : 11.5;
      HeroKit.label(c, k, name, x0 - 8, y, { px: fs, align: 'right', weight: sel ? 750 : 550, color: vis ? P.ink : P.ink3, haloColor: P.surf });
      if (!vis) { HeroKit.label(c, k, '?', X(25), y, { px: 13, weight: 700, color: P.ink3, haloColor: P.surf }); return; }
      const seen = {};
      row.trials.forEach((v) => { const n = seen[v] = (seen[v] || 0) + 1, dy = (n % 2 ? 1 : -1) * Math.floor(n / 2) * 6, x = X(v), yy = y + dy; c.beginPath(); c.arc(x, yy, 4.2, 0, 7); c.fillStyle = sel ? P.cl : rgba(P.cl, 0.55); c.fill(); c.strokeStyle = P.surf; c.lineWidth = 1; c.stroke(); dots.push({ x, y: yy, v, row }); });
      c.strokeStyle = P.ink; c.lineWidth = 2.5; c.beginPath(); c.moveTo(X(row.median), y - 12); c.lineTo(X(row.median), y + 12); c.stroke();
    });
    // разделитель «по маркерам / по камерам»
    const yv = y0 + rh * 6 + 3; c.strokeStyle = P.line; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(8, yv); c.lineTo(W - 8, yv); c.stroke(); c.setLineDash([]);
    if (short) { HeroKit.label(c, k, 'по маркерам ↑', 8, yv - 7, { px: 10, align: 'left', color: P.ink3, haloColor: P.surf }); HeroKit.label(c, k, 'по камерам ↓', 8, yv + 8, { px: 10, align: 'left', color: P.ink3, haloColor: P.surf }); }
  }
  function out() {
    const el = $('#dOut'), row = E.dactyl(st.group, st.pose);
    if (st.hover) { const d = st.hover; setOut(el, `<b>${d.v} ${plural(d.v, 'поворот', 'поворота', 'поворотов')} подряд</b> — одна из 10 попыток политики «${d.row.name}», положение кубика ${d.row.pose === 'vision' ? 'по камерам' : 'по маркерам'}.`); return; }
    if (!row) { setOut(el, 'Политику без этой группы рандомизаций на камерах авторы не проверяли: в таблице 4 для камер есть только «все рандомизации» и «без шума наблюдений».'); return; }
    if (!visible(st.group, st.pose)) { setOut(el, 'Эта строка откроется в миссии.'); return; }
    const g = D.groups[st.group];
    setOut(el, `<b>${row.name[0].toUpperCase() + row.name.slice(1)}, ${st.pose === 'vision' ? 'по камерам' : 'по маркерам'}:</b> медиана ${fmt(row.median, row.median % 1 ? 1 : 0)}, среднее ${fmt(row.mean)} поворота подряд. ${g ? g : st.group === 'none' ? 'Обычный симулятор: ни физику, ни шум, ни неучтённые эффекты не меняли.' : 'Обучена со всеми группами: физика, неучтённые эффекты, шум наблюдений.'}`);
  }
  function render() { segSet('#dGroup', st.group); segSet('#dPose', st.pose); draw(); out(); }
  function setGroup(v) { st.group = v; render(); if (ctl) ctl.update(); }
  function setPose(v) { st.pose = v; if (v === 'vision') st.open.vision = true; render(); if (ctl) ctl.update(); }
  const state = () => ({ group: st.group, pose: st.pose, open: Object.assign({}, st.open), row: E.dactyl(st.group, st.pose) });
  const api = {
    reset() { st.open = { markers: false, vision: false }; st.group = 'all'; st.pose = 'markers'; st.hover = null; render(); },
    state, setGroup, setPose,
    async reveal() { st.open.markers = true; render(); await wait(120); const m = (id) => E.dactyl(id, 'markers').median; return { all: m('all'), noise: m('noise'), physics: m('physics'), unmodeled: m('unmodeled'), none: m('none') }; },
  };
  const missions = [
    { short: 'Что убрать', title: 'Без какой группы рука потеряет меньше всего', text: 'Авторы обучили политики, убирая по одной группе рандомизаций, и проверили каждую на реальной руке по 10 раз. Пока открыта только политика со всеми рандомизациями: медиана 13 поворотов подряд. Положение кубика политика узнаёт по маркерам motion capture.',
      bet: { q: 'без какой группы медиана упадёт меньше всего?', options: ['Без физики: массы и трение измерены при калибровке', 'Без неучтённых эффектов: люфт и задержки малы', 'Без шума наблюдений'], answer: (r) => { const v = [r.physics, r.unmodeled, r.noise]; return v.indexOf(Math.max(...v)); } },
      action: { label: 'Открыть все пять политик', run: (X) => X.reveal() },
      criteria: [{ label: 'Без шума наблюдений медиана выше, чем без физики и без неучтённых эффектов', test: (r) => r.noise > r.physics && r.noise > r.unmodeled }],
      explain: (r) => `Медианы: все рандомизации — ${r.all}, без шума наблюдений — ${fmt(r.noise, 1)}, без физики — ${r.physics}, без неучтённых эффектов — ${r.unmodeled}, без рандомизаций — ${r.none}. Калибровки мало: настоящая рука всё равно отличается от модели в MuJoCo, и политика, которая видела одну физику, роняет кубик через пару поворотов. Шум наблюдений почти не нужен, потому что маркеры точные, — авторы так это и объясняют.` },
    { short: 'Камеры', title: 'Когда положение кубика оценивают по камерам', text: 'В реальной системе положение кубика оценивает сеть по трём камерам, обученная только на картинках симулятора. Её оценка шумнее, чем у маркеров. Переключи «Положение кубика» на камеры и выбери политику без шума наблюдений.',
      controls: ['pose'],
      criteria: [{ label: 'Положение кубика — по камерам', test: (r, s) => s.pose === 'vision' }, { label: 'Выбрана политика без шума наблюдений', test: (r, s) => s.pose === 'vision' && s.group === 'noise' }],
      hint: 'Переключатели — над графиком: «Положение кубика» и «При обучении».',
      explain: () => 'По камерам со всеми рандомизациями медиана 11,5 — немного меньше, чем по маркерам, хотя сеть зрения ни разу не видела настоящих кадров. А без шума наблюдений — 3,5: оценка по камерам шумная, и политика, привыкшая к точным данным, ошибается. Рандомизировать надо то, что в реальной системе действительно гуляет.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Сравни каждую политику со строкой симулятора. Найди политику, у которой хотя бы одна попытка на реальной руке дошла до 40 поворотов, хотя медиана у неё ниже 10.', final: true, controls: ['pose'] },
  ];
  function init() {
    segBind('#dGroup', setGroup); segBind('#dPose', setPose);
    const cv = $('#dChart');
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect(), sx = W / r.width, x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sx;
      let best = null, bd = 12 * sx; for (const d of dots) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
      if (best !== st.hover) { st.hover = best; out(); }
    });
    cv.addEventListener('mouseleave', () => { st.hover = null; out(); });
    ctl = mountMissions('#dMis', missions, api, { controls: { pose: '#wrapDPose' }, scene: '#dChart' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: генерация демонстраций в духе MimicGen
   ===================================================================== */
const Gen = (() => {
  const E = L45, M = E.MG, CW = 360, S = CW / 96, N_GEN = 300;
  const st = { scene: 0, keep: 'ok', models: {}, checks: {}, busy: null, prog: 0, gen: {}, bars: null };
  let ctl = null, SRC = null, TESTS = null, D0 = null;
  const src = () => SRC || (SRC = E.sources());
  const tests = () => TESTS || (TESTS = E.mgTest());
  const d0 = () => { if (!D0) { D0 = []; for (let i = 0; i < 30; i++) D0.push(E.mgScene(9900 + i, 'D0')); } return D0; };
  /** Сгенерированный набор: 'ok' — только удачные попытки, 'all' — все попытки подряд. */
  const gen = (kind) => st.gen[kind] || (st.gen[kind] = E.generate(src(), N_GEN, kind === 'all'));
  const demos = (name) => (name === 'src' ? src() : src().concat(gen(name).kept));
  async function trainModels(names, tag) {
    const todo = names.filter((n) => !st.models[n]); if (!todo.length) return;
    st.busy = tag; st.prog = 0; render();
    for (let q = 0; q < todo.length; q++) {
      const n = todo[q], d = demos(n);
      st.models[n] = await runGen(E.polTrain(d), (e) => { st.prog = (q + (e.it + 1) / e.iters) / todo.length; tick(); });
      st.checks[n] = E.mgCheck(st.models[n], tests());
    }
    st.busy = null; st.prog = 1; render();
  }
  let last = 0; function tick() { const now = performance.now(); if (now - last > 120) { last = now; render(); } }
  const rightName = () => st.keep;
  const FAIL = { grasp: 'сомкнула захват мимо кубика', drop: 'разжала захват мимо миски', carry: 'не донесла кубик до миски за 90 шагов', time: 'не взяла кубик за 90 шагов' };
  /* ---- рисование ---- */
  const at = (p) => [p[0] * S, p[1] * S];
  function path(c, pts, col, lw, a) { if (pts.length < 2) return; c.globalAlpha = a == null ? 1 : a; c.beginPath(); pts.forEach((p, i) => { const q = at(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); c.globalAlpha = 1; }
  function scene(c, k, sc, P) {
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CW);
    // зоны, где лежали предметы при записи оператора
    c.setLineDash([5, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.3;
    for (const z of [M.D0.cube, M.D0.bowl]) c.strokeRect(z[0][0] * S, z[1][0] * S, (z[0][1] - z[0][0]) * S, (z[1][1] - z[1][0]) * S);
    c.setLineDash([]);
    HeroKit.label(c, k, k > 1.5 ? 'зона записи' : 'зона записи оператора', ((M.D0.cube[0][0] + M.D0.bowl[0][1]) / 2) * S, M.D0.cube[1][0] * S - 10, { px: 10.5, color: P.ink3, haloColor: P.bg });
    const h0 = at(M.HOME); c.beginPath(); c.arc(h0[0], h0[1], 7, 0, 7); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.stroke();
  }
  function objects(c, sc, P, run) {
    const b = at(sc.bowl); c.beginPath(); c.arc(b[0], b[1], M.BOWL_R * S, 0, 7); c.strokeStyle = P.ink2; c.lineWidth = 5; c.stroke();
    const okEnd = run && run.ok, cp = okEnd ? sc.bowl : sc.cube, q = at(cp), r = 4.5 * S;
    c.fillStyle = '#db3833'; c.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r); c.strokeStyle = '#1f2430'; c.lineWidth = 1.2; c.strokeRect(q[0] - r, q[1] - r, 2 * r, 2 * r);
  }
  function endMark(c, run, P) {
    const e = at(run.path[run.path.length - 1]);
    c.beginPath(); c.arc(e[0], e[1], 9, 0, 7); c.fillStyle = run.ok ? P.good : P.bad; c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.beginPath();
    if (run.ok) { c.moveTo(e[0] - 4, e[1]); c.lineTo(e[0] - 1, e[1] + 3.5); c.lineTo(e[0] + 4.5, e[1] - 3.5); } else { c.moveTo(e[0] - 3.5, e[1] - 3.5); c.lineTo(e[0] + 3.5, e[1] + 3.5); c.moveTo(e[0] + 3.5, e[1] - 3.5); c.lineTo(e[0] - 3.5, e[1] + 3.5); }
    c.stroke();
  }
  function drawPane(cv, name) {
    const { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), sc = tests()[st.scene];
    scene(c, k, sc, P);
    if (name !== 'src' && st.gen[name]) gen(name).kept.slice(0, 30).forEach((d) => path(c, d.path, P.hy, 1.2, 0.32));
    src().forEach((d) => path(c, d.path, P.e2e, 1.4, 0.7));
    const ch = st.checks[name], run = ch ? ch.runs[st.scene] : null;
    objects(c, sc, P, run);
    if (run) { path(c, run.path, P.cl, 4.2, 0.95); endMark(c, run, P); }
    else HeroKit.label(c, k, st.busy ? 'модель учится…' : name !== 'src' && !st.gen[name] ? 'генерация ещё не запускалась' : 'модель ещё не обучена', CW / 2, 20, { px: 13, weight: 700, color: P.ink, haloColor: P.bg });
  }
  function paneStat(el, name) {
    const ch = st.checks[name];
    if (!ch) { setOut(el, st.busy ? 'Модель учится…' : 'Модель ещё не обучена'); el.className = 'pane-stat'; return; }
    const n = Math.round(ch.rate * ch.n), run = ch.runs[st.scene];
    setOut(el, `<b>Кубик в миске: ${n} из ${ch.n}</b> (${pct(ch.rate)}%) · здесь ${run.ok ? '✓' : '✗ ' + FAIL[run.fail]}`); el.className = 'pane-stat' + (ch.rate >= 0.5 ? ' ok' : ' bad');
  }
  function bars() {
    const box = $('#gBars'); box.innerHTML = '';
    if (!st.bars || st.bars.some(([, n]) => !st.checks[n])) return;
    box.append(h('div', { class: 'sc-h muted-s' }, 'Доля из 60 новых расстановок, где кубик оказался в миске'));
    for (const [lbl, n] of st.bars) { const r = st.checks[n].rate; box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, lbl), h('div', { class: 'bt' }, h('i', { style: `width:${(r * 100).toFixed(1)}%` })), h('span', { class: 'bn' }, `${pct(r)}%`))); }
  }
  function render() {
    drawPane($('#gCvL'), 'src'); drawPane($('#gCvR'), rightName());
    paneStat($('#gStatL'), 'src'); paneStat($('#gStatR'), rightName());
    segSet('#gKeep', st.keep);
    setOut($('#gSubR'), st.keep === 'ok' ? 'только удачные попытки' : 'все попытки, без проверки');
    bars();
    const pg = $('#gProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const el = $('#gOut'), sc = tests()[st.scene], g = st.gen[st.keep];
    if (st.busy) setOut(el, `Модели учатся в браузере: <b>${pct(st.prog)}%</b>`);
    else setOut(el, `Расстановка ${st.scene + 1} из 60: кубик в ${Math.round(sc.cube[0] / 2)} см от левого края и ${Math.round(sc.cube[1] / 2)} см от дальнего, миска — в ${Math.round(sc.bowl[0] / 2)} и ${Math.round(sc.bowl[1] / 2)} см.${g ? ` Генератор: ${g.tries} ${plural(g.tries, 'попытка', 'попытки', 'попыток')}, удачных ${g.okN} (${pct(g.rate)}%).` : ''}`);
  }
  function setScene(i) { st.scene = Math.max(0, Math.min(59, i)); const inp = $('#gScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); if (ctl) ctl.update(); }
  async function setKeep(v) { st.keep = v; render(); if (v === 'all' && !st.models.all && !st.busy) await trainModels(['all'], 'g3'); if (ctl) ctl.update(); }
  const cnt = (name, f) => st.checks[name].runs.filter((q) => q.fail === f).length;
  const state = () => ({ scene: st.scene, keep: st.keep, src: st.checks.src ? st.checks.src.rate : null, ok: st.checks.ok ? st.checks.ok.rate : null, all: st.checks.all ? st.checks.all.rate : null, busy: !!st.busy });
  const api = {
    reset() { st.bars = null; st.keep = 'ok'; setScene(0); },
    state, setScene, setKeep, render,
    async first() {
      gen('ok'); await trainModels(['src', 'ok'], 'g1');
      st.bars = [['10 записей оператора', 'src'], ['10 записей и 300 сгенерированных', 'ok']];
      const a = st.checks.src, b = st.checks.ok; let pick = 0;
      for (let i = 0; i < a.n; i++) if (!a.runs[i].ok && b.runs[i].ok) { pick = i; break; }
      setScene(pick);
      const g = gen('ok'), dz = E.mgCheck(st.models.src, d0());
      return { src: a.rate, ok: b.rate, srcD0: dz.rate, tries: g.tries, okN: g.okN, rate: g.rate, srcFail: { grasp: cnt('src', 'grasp'), time: cnt('src', 'time') } };
    },
    async noFilter() {
      gen('all'); await trainModels(['src', 'ok', 'all'], 'g2');
      st.bars = [['10 записей оператора', 'src'], ['+300 сгенерированных, только удачные', 'ok'], ['+300 попыток генерации без проверки', 'all']];
      st.keep = 'all'; render();
      const g = gen('all');
      return { ok: st.checks.ok.rate, all: st.checks.all.rate, failN: g.kept.filter((d) => !d.ok).length, graspOk: cnt('ok', 'grasp'), graspAll: cnt('all', 'grasp') };
    },
  };
  const missions = [
    { short: 'Перенос', title: 'Десять записей или триста сгенерированных', text: 'Нажми кнопку: генератор сделает 300 удачных демонстраций из 10 записей оператора, обе модели обучатся в браузере, и каждую проверят на 60 новых расстановках.',
      controls: ['scene'],
      bet: { q: 'какая модель чаще положит кубик в миску?', options: ['На 10 записях: в них настоящие движения оператора, без склеек', 'Поровну: новых движений генератор не придумывает', 'Со сгенерированными'], answer: (r) => (r.ok > r.src + 0.1 ? 2 : r.src > r.ok + 0.1 ? 0 : 1) },
      action: { label: 'Сгенерировать и обучить обе модели', run: (X) => X.first() },
      criteria: [{ label: 'Модель со сгенерированными данными справляется хотя бы в половине расстановок', test: (r) => r.ok >= 0.5 }, { label: 'Модель на 10 записях — меньше чем в каждой десятой', test: (r) => r.src < 0.1 }],
      explain: (r) => `Модель на 10 записях положила кубик в ${pct(r.src)}% новых расстановок. В зоне, где записывал оператор, она справляется в ${pct(r.srcD0)}% случаев, а за её пределами не знает, куда ехать: чаще всего смыкает захват мимо кубика. Модель с 300 сгенерированными — ${pct(r.ok)}%. Генератор сделал ${r.tries} попыток, удались ${r.okN} — ${pct(r.rate)}%. На сцене — расстановка, где левая модель ошибается, а правая нет. В MimicGen та же картина: 10 записей в узкой зоне и 1000 сгенерированных подняли успех в задаче Square с 11,3% до 90,7%.` },
    { short: 'Проверка', title: 'Нужна ли проверка в симуляторе', text: 'Генератор оставлял только попытки, в которых кубик оказался в миске. Обучим третью модель на 300 попытках подряд, удачных и нет: в части из них рука не успевала доехать до кубика и смыкала захват мимо.',
      controls: ['scene'],
      bet: { q: 'что будет, если оставить и неудачные попытки?', options: ['Станет лучше: данных про разные расстановки больше', 'Почти ничего: неудачных — около каждой десятой', 'Станет хуже'], answer: (r) => (r.all < r.ok - 0.05 ? 2 : r.all > r.ok + 0.05 ? 0 : 1) },
      action: { label: 'Обучить на всех попытках', run: (X) => X.noFilter() },
      criteria: [{ label: 'Без проверки модель хуже хотя бы на 10 процентных пунктов', test: (r) => r.ok - r.all >= 0.1 }],
      explain: (r) => `С проверкой — ${pct(r.ok)}%, без неё — ${pct(r.all)}%. В наборе без проверки ${r.failN} ${plural(r.failN, 'неудачная попытка', 'неудачные попытки', 'неудачных попыток')} из 300, почти все — захват, сомкнутый мимо кубика. Модель учится и этому: сомкнуть захват мимо кубика теперь её главная ошибка — в ${r.graspAll} расстановках против ${r.graspOk}. Это тот же отбор данных, что в уроке 4.3, только проверяет записи не человек, а симулятор, который знает, где кубик и миска.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Листай расстановки и переключай правую модель. Найди расстановку, где ошибается и модель с проверенными сгенерированными данными, и посмотри, далеко ли кубик и миска от зоны записи и где модель смыкает захват.', final: true, controls: ['scene', 'keep'] },
  ];
  function init() {
    legend('#gLegend', [['кубик', '#db3833', 'sq'], ['миска', 'var(--ink-2)', 'ring'], ['записи оператора', 'var(--e2e)'], ['сгенерированные демонстрации', 'var(--hybrid)'], ['путь захвата модели', 'var(--classic)', 'thick'], ['зона записи оператора', 'var(--ink-3)', 'box'], ['кубик в миске / ошибка', 'var(--good)', 'dot']]);
    $('#gScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    segBind('#gKeep', (v) => setKeep(v));
    ctl = mountMissions('#gMis', missions, api, { controls: { scene: '#wrapGScene', keep: '#wrapGKeep' }, scene: '#gDuo' });
    syncRange($('#gScene'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
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
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Модель берёт кубик в симуляторе почти всегда. Значит, и на настоящем роботе будет так же?', o: ['Да, если симулятор хороший', 'Нет: между симулятором и реальностью есть разрыв — свет, краски, трение, задержки', 'Нет, в реальности модели из симулятора не работают совсем'], a: 1, e: 'У Dactyl медиана 50 поворотов в симуляторе и 13 на руке, у детектора Тобина ошибка 0,3–0,5 см в симуляторе и 1,5 см на снимках, на столе Ады — 100% и 68%. Рандомизация и калибровка сокращают разрыв, но не убирают.' },
    { q: 'Чтобы перенос из симулятора удался, картинка должна быть фотореалистичной?', o: ['Да, иначе модель не узнает реальный мир', 'Нет: Тобин и соавторы учили детектор на ненастоящих случайных текстурах, и робот взял предмет в 38 попытках из 40', 'Нет, картинка вообще не важна'], a: 1, e: 'Рендерер MuJoCo, который они использовали, и не пытается быть реалистичным. Важно разнообразие: меньше 1000 разных текстур — и точность заметно падает.' },
    { q: 'Чем шире рандомизация, тем лучше перенос?', o: ['Да, реальный мир тогда точно окажется одним из вариантов', 'Нет: менять надо то, к чему модель должна быть безразлична, и примерно в пределах реальных отличий', 'Нет, рандомизация всегда вредит'], a: 1, e: 'На столе Ады краска любого цвета уронила успех с 94% до 37%: красный цвет и есть задача. У Dactyl диапазоны стояли вокруг измеренных значений, а полная рандомизация стоила 100 лет опыта в симуляторе вместо 3.' },
    { q: 'Если массы и трение руки точно измерены, рандомизация физики не нужна?', o: ['Да, калибровки достаточно', 'Нет: у Dactyl без рандомизации физики медиана упала с 13 поворотов до 2, хотя диапазоны стояли вокруг калиброванных значений', 'Нет, но только для ног, не для рук'], a: 1, e: 'Модель MuJoCo не знает, например, люфта сухожилий и задержек — без неучтённых эффектов тоже было 2. Шум наблюдений при точных маркерах почти не нужен, а при оценке положения по камерам без него медиана падает с 11,5 до 3,5.' },
    { q: 'Ткань, жидкости и тонкий контакт пальцев симулятор считает так же надёжно, как твёрдые тела?', o: ['Да, современные движки считают всё одинаково', 'Нет: мягкое, жидкое и контакт многих пальцев симулировать заметно труднее', 'Нет, такие задачи в симуляторе вообще не задать'], a: 1, e: 'Isaac Lab и Genesis добавляют конечные элементы и частицы, но авторы DreamGen прямо называют складывание полотенец и вытирание жидкости задачами, которые трудно симулировать. Рука Dactyl так и не научилась вращать шар.' },
    { q: 'MimicGen придумывает новые движения робота?', o: ['Да, генеративная модель рисует новые траектории', 'Нет: он переносит куски записей оператора к новым положениям предметов и добавляет прямые переезды; новое — расстановки', 'Нет, он просто повторяет записи без изменений'], a: 1, e: 'Каждая подзадача привязана к своему предмету, и её кусок сдвигается вместе с предметом. Поэтому MimicGen нужны подзадачи и позы предметов, а задачи — с твёрдыми предметами.' },
    { q: 'Неудачные попытки генерации тоже стоит оставить — данных же больше?', o: ['Да, любые данные полезны', 'Нет: модель учится и ошибкам; MimicGen оставляет только попытки, удавшиеся в симуляторе', 'Без разницы'], a: 1, e: 'На столе Ады без проверки успех упал с 67% до 47%: модель научилась смыкать захват мимо кубика. Это тот же отбор данных, что в уроке 4.3, только проверяет симулятор.' },
    { q: 'Демонстрации, сгенерированные MimicGen, заметно хуже записанных людьми?', o: ['Да, синтетика всегда хуже', 'Нет: в большинстве задач 200 сгенерированных из 10 человеческих дали столько же, сколько 200 записанных людьми', 'Нет, они всегда лучше'], a: 1, e: 'Плюс сгенерированных — их можно сделать сколько угодно: с 200 до 1000 успех заметно рос. Но с 1000 до 5000 — почти нет, и без реальных данных синтетика не обходится: в RoboCasa на реальной кухне её добавляли к 50 реальным демонстрациям.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('rand', () => { mis.rand = Rand.init(); });
    safe('dactyl', () => { mis.dactyl = Dactyl.init(); });
    safe('gen', () => { mis.gen = Gen.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['rMis', 'dMis', 'gMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l45 = { mis, SPEED, Rand, Dactyl, Gen, MGScheme, L45 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
