/* =====================================================================
   ui-l04.js — урок 0.4 «Оценка состояния и планирование». Интерактивы —
   миссии на живых сценах (shared/missions.js): три Ады с разными
   оценками в одном коридоре, фильтр частиц в доме с похищением, карта
   со шторкой «одометрия / SLAM», Дейкстра и A* рядом с рисованием стен,
   калькулятор размерности, RRT и RRT* на общих случайных точках.
   Ниже — схема «классика рядом с нейросетями», сортировка методов
   (shared/cards.js) и квиз. Движок без DOM — l04/engine.js (window.L4).
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение проигрывания для автотестов; на результаты не влияет
const E4 = window.L4;
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), clSoft: HeroKit.css('--classic-soft'), hy: HeroKit.css('--hybrid'), bad: HeroKit.css('--critical'), good: HeroKit.css('--good'), surf: HeroKit.css('--surface'), bg2: HeroKit.css('--bg-2') });
const fmt1 = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }).replace('-', '−');
const fmtF = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }).replace('-', '−');
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind === 'dash' ? 'dash' : null, style: `--c:${col}` + (kind === 'box' ? ';height:10px;width:14px;border-radius:3px;background:' + col : kind === 'dot' ? ';height:10px;width:10px;border-radius:50%;background:' + col : kind === 'ring' ? ';height:12px;width:12px;border-radius:50%;background:transparent;border:2px solid ' + col : '') }), t)));
}
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Проигрывание по таймеру: шаги симуляции идут с частотой rate в секунду, даже если сцена ушла с экрана. */
function drive(rate, step, done, draw) {
  return new Promise((res) => {
    let acc = 0, last = performance.now();
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      acc += dt * rate * SPEED.k; let n = Math.floor(acc); acc -= n;
      while (n-- > 0 && !done()) step();
      try { draw(); } catch (e) { console.error(e); }
      if (done()) { res(); return; }
      setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
  });
}
function rgbOf(c) {
  c = c.trim();
  if (c[0] === '#') { const x = c.length === 4 ? c.slice(1).split('').map((q) => q + q).join('') : c.slice(1, 7); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  const m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}
/** Ада сверху: круглый корпус, экран-лицо, оранжевые глаза. */
function drawAda(c, x, y, th, r, color, alpha) {
  c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y); c.rotate(th);
  c.beginPath(); c.arc(0, 0, r, 0, 7); c.fillStyle = HeroKit.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = Math.max(1.5, r * 0.12); c.strokeStyle = color; c.stroke();
  c.beginPath(); c.roundRect(r * 0.22, -r * 0.5, r * 0.55, r, r * 0.22); c.fillStyle = '#1f2430'; c.fill();
  c.fillStyle = '#eb6834'; c.beginPath(); c.arc(r * 0.5, -r * 0.22, r * 0.1, 0, 7); c.arc(r * 0.5, r * 0.22, r * 0.1, 0, 7); c.fill();
  c.restore();
}
function crosshair(c, x, y, col, r) { r = r || 9; c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - r - 6, y); c.lineTo(x - r + 4, y); c.moveTo(x + r - 4, y); c.lineTo(x + r + 6, y); c.moveTo(x, y - r - 6); c.lineTo(x, y - r + 4); c.moveTo(x, y + r - 4); c.lineTo(x, y + r + 6); c.stroke(); }
/** Мелкие подписи осей на канвасе графика; названия осей — в HTML под ним. */
function axes(c, k, P, box, xt, yt, x, y) {
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (const [v, t] of yt) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, t, box.l - 6, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
  for (const [v, t, al] of xt) HeroKit.label(c, k, t, x(v), box.b + 13, { align: al || 'center', px: 10.5, mono: true, color: P.ink3, halo: false });
}
/** План дома Ады (600 × 400, см): сетка, подписи комнат, мебель со штриховкой, стены. */
function drawHouse(c, k, P, o) {
  const H = E4.House; o = o || {};
  c.fillStyle = P.bg; c.fillRect(0, 0, H.W, H.H); HeroKit.grid(c, H.W, H.H, 50, P.grid);
  if (o.rooms !== false) for (const [t, x, y] of H.ROOMS) HeroKit.label(c, k, t, x, y, { color: P.ink3, px: 11, weight: 600, haloColor: P.bg });
  for (const f of H.FURN) {
    const [x0, y0, x1, y1] = f.r; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); HeroKit.hatch(c, x0, y0, x1, y1, P.ink3, 7, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (o.names === false) continue;
    HeroKit.font(c, k, 10.5, 600); const tw = c.measureText(f.name).width + 8 * k, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (tw <= x1 - x0) HeroKit.label(c, k, f.name, cx, cy, { color: P.ink2, px: 10.5, haloColor: P.surf });
    else if (tw <= y1 - y0) { c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); HeroKit.label(c, k, f.name, 0, 0, { color: P.ink2, px: 10.5, haloColor: P.surf }); c.restore(); }
  }
  c.fillStyle = P.ink2; for (const r of H.WALLS) c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
}

/* ---------- 1. Схема стека ---------- */
function initFlow() {
  const B = [['Восприятие', 'камеры, лидар → препятствия, объекты', 'урок 0.1', false], ['Оценка состояния', 'где я и как двигаюсь: фильтр Калмана, фильтр частиц, SLAM', 'этот урок', true], ['Планирование', 'каким путём ехать: Дейкстра, A*, RRT', 'этот урок', true], ['Управление', 'регулятор тянет к цели: ПД, импеданс, MPC', 'урок 0.3', false]];
  const box = $('#qFlow');
  B.forEach(([t, d, where, here], j) => {
    if (j) box.append(h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→'));
    box.append(h('div', { class: 'flow-box' + (here ? '' : ' dim'), style: '--c:var(--classic)' }, h('h4', null, t), h('p', null, d), h('span', { class: 'here', style: here ? null : 'color:var(--ink-3)' }, where)));
  });
}

/* ---------- Лаборатория 1: три Ады в коридоре ---------- */
const KfLab = (() => {
  const K = E4.KF, W = 520, PW = 520, SQ = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20], SR = [1, 2, 5, 10, 20, 50, 100], AL = [0.5, 0.7, 0.8, 0.9, 0.95, 0.98];
  const X0 = 30, XS = 462 / 520, GAP = 9, TOP0 = 8;
  /** Высота сцены берётся из пропорций канваса в CSS: на телефоне дорожки выше. */
  const hOf = (sel, w, def) => { const r = $(sel).getBoundingClientRect(); return r.width ? Math.round(w * r.height / r.width) : def; };
  const st = { o: { sq: 1, sr: 10, alpha: 0.98, carpet: false, drop: false }, res: null, i: K.N - 1, playing: false, reveal: K.N - 1, lastRun: null, shown: false };
  let ctl = null;
  const xp = (cm) => X0 + cm * XS;
  const meanBand = (r) => { let s = 0; for (let i = 0; i < r.P.length; i++) s += 2 * Math.sqrt(r.P[i]); return s / r.P.length; };
  function summary(r) {
    let c = 0, n = 0; for (let i = 0; i < K.N; i++) { const t = i * K.DT; if (t >= K.DROP[0] && t < K.DROP[1]) { n++; if (Math.abs(r.kf[i] - r.d.x[i]) <= 2 * Math.sqrt(r.P[i])) c++; } }
    return { raw: r.m.raw.rmse, comp: r.m.comp.rmse, kf: r.m.kf.rmse, cover: r.cover, band: meanBand(r), Kend: r.Kend, dropC: c, dropN: n, b1: 2 * r.sigAt(10.9), b2: 2 * r.sigAt(13.9), b3: 2 * r.sigAt(14.5), afterComp: r.after.comp, afterKf: r.after.kf, sq: st.o.sq, sr: st.o.sr, alpha: st.o.alpha, carpet: st.o.carpet, drop: st.o.drop };
  }
  function compute() { st.res = K.run(st.o); st.sum = summary(st.res); }
  const LANES = [['дальномер', 'raw', 'ink3'], ['комплементарный, α = ', 'comp', 'ink2'], ['Калман', 'kf', 'cl']];
  function draw() {
    const H = hOf('#kfCv', W, 236), LANE = (H - 2 * TOP0 - 2 * GAP) / 3, { c, k } = HeroKit.fit($('#kfCv'), W, H), P = pal(), r = st.res, i = st.i;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    LANES.forEach(([name, key, colk], li) => {
      const y0 = TOP0 + li * (LANE + GAP), yc = y0 + LANE / 2 + 6 * k, col = P[colk];
      c.fillStyle = P.surf; c.beginPath(); c.roundRect(6, y0, W - 12, LANE, 9); c.fill(); c.strokeStyle = P.grid; c.lineWidth = 1; c.stroke();
      if (st.o.carpet) { const a = xp(K.CARPET[0]), b = xp(K.CARPET[1]); c.beginPath(); c.rect(a, y0 + 1, b - a, LANE - 2); c.fillStyle = HeroKit.dark() ? 'rgba(235,104,52,.10)' : 'rgba(235,104,52,.08)'; c.fill(); c.beginPath(); c.rect(a, y0 + 1, b - a, LANE - 2); HeroKit.hatch(c, a, y0, b, y0 + LANE, P.e2e, 9, 0.6); }
      c.fillStyle = P.ink2; c.fillRect(xp(520), y0 + 6, 6, LANE - 12);
      c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(xp(0), yc + 13); c.lineTo(xp(520), yc + 13); c.stroke();
      const lab = key === 'comp' ? name + fmt1(st.o.alpha, 2) : name;
      HeroKit.label(c, k, lab, 14, y0 + 11, { align: 'left', px: 11, weight: 700, color: col, haloColor: P.surf });
      if (!r) return;
      const tx = r.d.x[i], ex = r[key][i], err = ex - tx;
      if (!st.shown) { drawAda(c, xp(tx), yc, 0, 12, P.ink2, 0.9); return; }
      HeroKit.label(c, k, `ошибка ${fmt1(Math.abs(err), 0)} см`, xp(520) - 8, y0 + 11, { align: 'right', px: 10.5, mono: true, color: P.ink3, haloColor: P.surf });
      if (key === 'kf') { const s2 = 2 * Math.sqrt(r.P[i]); c.fillStyle = HeroKit.dark() ? 'rgba(57,135,229,.22)' : 'rgba(42,120,214,.16)'; c.beginPath(); c.roundRect(xp(ex - s2), yc - 12, Math.max(2, (xp(ex + s2) - xp(ex - s2))), 24, 8); c.fill(); }
      if (key === 'raw') {
        const has = !Number.isNaN(r.d.z[i]);
        if (has) { c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.moveTo(xp(tx) + 12, yc); c.lineTo(xp(520), yc); c.stroke(); c.setLineDash([]); }
        else HeroKit.label(c, k, 'нет замера', xp(470), yc - 18, { color: P.bad, px: 11, weight: 700, haloColor: P.surf });
      }
      drawAda(c, xp(tx), yc, 0, 12, P.ink3, 0.45);
      c.beginPath(); c.arc(xp(ex), yc, 6.5, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
    });
  }
  function plot() {
    const PH = hOf('#kfPlot', PW, 150), { c, k } = HeroKit.fit($('#kfPlot'), PW, PH), P = pal(), r = st.res, box = { l: 36, r: PW - 10, t: 8, b: PH - 14 * k - 6 };
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const YM = 30, x = (t) => box.l + t / K.T * (box.r - box.l), y = (v) => box.b - (Math.max(-YM, Math.min(YM, v)) + YM) / (2 * YM) * (box.b - box.t);
    if (st.o.drop) { c.fillStyle = HeroKit.dark() ? 'rgba(208,59,59,.14)' : 'rgba(208,59,59,.09)'; c.fillRect(x(K.DROP[0]), box.t, x(K.DROP[1]) - x(K.DROP[0]), box.b - box.t); }
    if (r && st.o.carpet) { c.fillStyle = HeroKit.dark() ? 'rgba(235,104,52,.12)' : 'rgba(235,104,52,.08)'; for (let j = 0; j < K.N; j++) if (r.d.carpet[j]) c.fillRect(x(j * K.DT) - 0.5, box.t, (box.r - box.l) / K.N + 1, box.b - box.t); }
    axes(c, k, P, box, [[0, '0', 'left'], [5, '5'], [10, '10'], [15, '15'], [20, '20 с', 'right']], [[-20, '−20'], [0, '0'], [20, '20']], x, y);
    if (!r) return;
    if (!st.shown) { HeroKit.label(c, k, 'график появится после запуска', (box.l + box.r) / 2, (box.t + box.b) / 2, { px: 12, color: P.ink3, haloColor: P.bg }); return; }
    const n = Math.min(st.reveal, K.N - 1);
    c.fillStyle = HeroKit.dark() ? 'rgba(57,135,229,.22)' : 'rgba(42,120,214,.16)'; c.beginPath();
    for (let j = 0; j <= n; j++) { const s2 = 2 * Math.sqrt(r.P[j]); j ? c.lineTo(x(j * K.DT), y(s2)) : c.moveTo(x(0), y(s2)); }
    for (let j = n; j >= 0; j--) c.lineTo(x(j * K.DT), y(-2 * Math.sqrt(r.P[j]))); c.closePath(); c.fill();
    const line = (arr, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); for (let j = 0; j <= n; j++) { const v = arr[j] - r.d.x[j]; j ? c.lineTo(x(j * K.DT), y(v)) : c.moveTo(x(0), y(v)); } c.stroke(); c.setLineDash([]); };
    line(r.raw, P.ink3, 1, null); line(r.comp, P.ink2, 1.6, [5, 3]); line(r.kf, P.cl, 2.4, null);
    const tc = x(st.i * K.DT); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(tc, box.t); c.lineTo(tc, box.b); c.stroke();
  }
  function out() {
    const el = $('#kfOut'), s = st.sum;
    if (!s || !st.shown) { setOut(el, 'Ада ездит туда и обратно. Запуск — кнопкой в карточке миссии.'); return; }
    if (st.playing) { setOut(el, `t = ${fmtF(st.i * K.DT, 1)} с`); return; }
    setOut(el, `Ошибка за проезд (СКО): дальномер <b>${fmt1(s.raw)} см</b> · комплементарный <b>${fmt1(s.comp)} см</b> · Калман <b>${fmt1(s.kf)} см</b><br>Истина в полосе ±2σ: <b>${fmt1(s.cover * 100, 0)} %</b> времени · полоса в среднем <b>±${fmt1(s.band)} см</b> · K в конце <b>${fmtF(s.Kend, 3)}</b>`);
  }
  function render() { draw(); plot(); out(); }
  function syncCtl() {
    const sq = $('#kfSq'), sr = $('#kfSr'), al = $('#kfAl');
    st.o.sq = SQ[+sq.value]; st.o.sr = SR[+sr.value]; st.o.alpha = AL[+al.value]; st.o.carpet = $('#kfCarpet').checked; st.o.drop = $('#kfDrop').checked;
    sq.nextElementSibling.textContent = fmt1(st.o.sq) + ' см'; sr.nextElementSibling.textContent = fmt1(st.o.sr) + ' см'; al.nextElementSibling.textContent = fmt1(st.o.alpha, 2);
  }
  function onCtl() { syncCtl(); if (st.playing) return; compute(); st.reveal = K.N - 1; render(); if (ctl) ctl.update(); }
  function setCtl(o) { if (o.sq != null) $('#kfSq').value = SQ.indexOf(o.sq); if (o.sr != null) $('#kfSr').value = SR.indexOf(o.sr); if (o.alpha != null) $('#kfAl').value = AL.indexOf(o.alpha); if (o.carpet != null) $('#kfCarpet').checked = o.carpet; if (o.drop != null) $('#kfDrop').checked = o.drop; onCtl(); }
  async function run() {
    syncCtl(); compute(); st.playing = true; st.shown = true; st.i = 0; st.reveal = 0;
    await drive(K.N / 7, () => { st.i++; st.reveal = st.i; }, () => st.i >= K.N - 1, render);
    st.playing = false; st.i = K.N - 1; st.reveal = K.N - 1; render(); st.lastRun = st.sum;
    return Object.assign({}, st.sum);
  }
  // свободная анимация: когда не идёт запуск, Ады едут по кругу
  let idleT = 0;
  function idle(dt) { if (st.playing || !st.res || HeroKit.reduced()) return; idleT = (idleT + dt * 3.4) % K.T; st.i = Math.min(K.N - 1, Math.floor(idleT / K.DT)); draw(); plot(); }
  const api = { reset() { st.shown = false; setCtl({ sq: 1, sr: 10, alpha: 0.98, carpet: false, drop: false }); }, state: () => Object.assign({}, st.sum), run, setCtl, show() { st.shown = true; render(); } };
  const cm = (v) => fmt1(v) + ' см';
  const missions = [
    { short: 'Кто точнее', title: 'Кто точнее знает, где Ада', text: 'Три Ады едут по одному коридору с одними и теми же датчиками. Разница только в том, как каждая обрабатывает замеры. Ада проедет к стене и обратно за 20 секунд.', controls: [],
      onEnter: (X) => X.setCtl({ sq: 1, sr: 10, alpha: 0.98, carpet: false, drop: false }),
      bet: { q: 'чья оценка положения окажется точнее?', options: ['Дальномер: он не копит ошибку', 'Комплементарный фильтр', 'Фильтр Калмана'], answer: (r) => [r.raw, r.comp, r.kf].indexOf(Math.min(r.raw, r.comp, r.kf)) },
      action: { label: 'Проехать по коридору', run: (X) => X.run() },
      summary: (r) => `дальномер ${cm(r.raw)} · компл. ${cm(r.comp)} · Калман ${cm(r.kf)}`,
      explain: (r) => `Средняя ошибка: дальномер ${cm(r.raw)}, комплементарный фильтр ${cm(r.comp)}, Калман <b>${cm(r.kf)}</b>. Калман сам выбрал, насколько верить замеру: к концу K = ${fmtF(r.Kend, 3)}, то есть каждый замер сдвигает оценку примерно на десятую часть расхождения. Комплементарному фильтру мы дали α = 0,98 из урока 0.2, и замер сдвигает его всего на 2 %. Колёса завышают путь на 4 %, и эта ошибка не успевает уходить. С α = 0,9 он дал бы ${cm(E4.KF.run({ alpha: 0.9 }).m.comp.rmse)}, как Калман: 1 − K и есть лучший α. Только вес Калман считает по шумам Q и R, а их задаёт инженер. Что будет, если задать их неверно?` },
    { short: 'Шумы', title: 'Подбери шумы Q и R', text: 'Фильтру задали неверные шумы: σ модели 10 см, σ дальномера 2 см. Он считает дальномер точнее колёс, верит каждому замеру и дёргается вместе с ним, а полоса неуверенности врёт. Подбери шумы так, чтобы оценка была точной, а полоса ±2σ — честной: истина почти всегда внутри, и полоса не шире, чем нужно.', controls: ['sq', 'sr'],
      onEnter: (X) => { X.show(); X.setCtl({ sq: 10, sr: 2, alpha: 0.98, carpet: false, drop: false }); },
      criteria: [{ label: 'Ошибка Калмана меньше 4 см', test: (r, s) => s.kf < 4 }, { label: 'Истина внутри полосы ±2σ не меньше 90 % времени', test: (r, s) => s.cover >= 0.9 }, { label: 'Полоса в среднем не шире ±9 см', test: (r, s) => s.band <= 9 }],
      hint: 'σ дальномера известна: замеры гуляют примерно на 10 см. σ модели — насколько колёса ошибаются за один шаг 0,1 с. Это доли сантиметра, но лучше взять с запасом.',
      explain: (s) => `σ модели ${cm(s.sq)}, σ дальномера ${cm(s.sr)}: ошибка ${cm(s.kf)}, истина в полосе ${fmt1(s.cover * 100, 0)} % времени, полоса ±${cm(s.band)}. Попробуй σ модели 2 см и σ дальномера 20 см: ошибка почти та же, потому что оценка зависит только от отношения Q к R. А полоса станет шире, чем нужно. Отношение шумов определяет оценку, а их величина — честность неуверенности.` },
    { short: 'Провал', title: 'Дальномер замолчал', text: 'Шумы подобраны, но проверены только на проезде, где замеры приходят исправно. А на середине пути дальномер на 3 секунды теряет стену: Ада проезжает мимо открытой двери, и всё это время фильтр может опираться только на колёса. σ дальномера оставим 10 см, ручка осталась одна — σ модели.', controls: ['sq'],
      onEnter: (X) => { X.show(); X.setCtl({ sq: 1, sr: 10, drop: true, carpet: false }); },
      bet: { q: 'что будет с полосой ±2σ, пока замеров нет?', options: ['Сузится: шумных замеров нет', 'Не изменится', 'Расширится, а потом снова сузится'], answer: (r) => (r.b2 > r.b1 * 1.2 ? 2 : r.b2 < r.b1 * 0.8 ? 0 : 1) },
      action: { label: 'Проехать с провалом', run: (X) => X.run() },
      criteria: [{ label: 'Истина внутри полосы ±2σ всё время провала', test: (r) => r.dropC === r.dropN }, { label: 'Ошибка Калмана за проезд меньше 4,5 см', test: (r) => r.kf < 4.5 }],
      summary: (r) => `σ модели ${cm(r.sq)} → в полосе ${r.dropC} из ${r.dropN} шагов провала, ошибка ${cm(r.kf)}`,
      fail: (r) => (r.dropC < r.dropN ? `Во время провала истина была в полосе только ${r.dropC} шагов из ${r.dropN}: колёса копят ошибку быстрее, чем думает фильтр.` : `Полоса честная, но ошибка ${cm(r.kf)}: фильтр слишком мало верит колёсам и дёргается за замерами.`),
      hint: 'Пока замеров нет, дисперсия растёт на Q каждый шаг. Если она растёт медленнее, чем копится настоящая ошибка колёс, фильтр переоценивает себя.',
      explain: (r) => `Пока дальномер молчал, полоса выросла с ±${cm(r.b1)} до ±${cm(r.b2)}, а с первыми замерами снова сузилась до ±${cm(r.b3)}: K подскочил, и фильтр быстро вернулся к дальномеру. Комплементарный фильтр после провала ошибался до ${cm(r.afterComp)}, Калман — до ${cm(r.afterKf)}. В Q прячется всё, чего модель не знает: ошибка масштаба колеса, проскальзывание. Поэтому Q берут с запасом и проверяют, честна ли полоса.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Все ручки открыты. Включи ковёр, где колёса проскальзывают на 30 %, и посмотри, при каком σ модели Калман его переживает. Подбери α комплементарного фильтра, чтобы он догнал Калмана.', final: true, onEnter: (X) => X.show(),
      action: { label: 'Проехать', run: (X) => X.run() } },
  ];
  function init() {
    legend('#kfLegend', [['бледная Ада — где она на самом деле', 'var(--ink-3)', 'ring'], ['оценка дальномера', 'var(--ink-3)', 'dot'], ['комплементарного фильтра', 'var(--ink-2)', 'dot'], ['Калмана и полоса ±2σ', 'var(--classic)', 'dot']]);
    legend('#kfPlotLegend', [['дальномер', 'var(--ink-3)'], ['комплементарный', 'var(--ink-2)', 'dash'], ['Калман', 'var(--classic)'], ['полоса ±2σ', 'var(--classic-soft)', 'box'], ['провал или ковёр', 'var(--critical-soft)', 'box']]);
    ['#kfSq', '#kfSr', '#kfAl'].forEach((q) => $(q).addEventListener('input', onCtl)); ['#kfCarpet', '#kfDrop'].forEach((q) => $(q).addEventListener('change', onCtl));
    syncCtl(); compute();
    ctl = Missions.mount('#kfMis', missions, api, { controls: { sq: '#wrapSq', sr: '#wrapSr', al: '#wrapAl', carpet: '#wrapCarpet', drop: '#wrapDrop' } });
    render(); redrawOn(render); HeroKit.loop($('#kfCv'), idle);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Лаборатория 2: фильтр частиц в доме ---------- */
const PfLab = (() => {
  const PF = E4.PF, HS = E4.House, W = HS.W, H = HS.H, NS = [150, 300, 600, 1000, 2000], RATE = 8;
  const WPK = [[470, 190], [480, 110], [560, 110], [560, 240], [470, 250]];
  const WPA = [[290, 330], [230, 300], [230, 140], [330, 110], [370, 170], [300, 180], [230, 180], [230, 300], [290, 330], [230, 300], [230, 140]];
  const KID = { x: 290, y: 330, th: -Math.PI / 2 };
  const st = { W: null, n: 600, aug: false, mode: 'idle', busy: false, place: { x: 300, y: 120, th: 0 }, edit: false, showP: true, free: false, paused: false, last: null, info: '' };
  let ctl = null;
  function fresh(o) { st.W = PF.world(Object.assign({ n: st.n, augment: st.aug }, o)); st.last = st.W.measure(); }
  function draw() {
    const { c, k } = HeroKit.fit($('#pfCv'), W, H), P = pal(), Wd = st.W;
    drawHouse(c, k, P);
    if (Wd) {
      const s = Wd.s, z = Wd.z;
      if (st.mode !== 'placing') {
        c.strokeStyle = P.cl; c.globalAlpha = 0.28; c.lineWidth = 1;
        for (let b = 0; b < PF.NB; b++) { const a = s.th + 2 * Math.PI * b / PF.NB, d = z[b] || 0; if (!d) continue; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d); c.stroke(); }
        c.globalAlpha = 1;
      }
      if (st.showP) {
        const pf = Wd.pf; let mx = 0; for (let i = 0; i < pf.n; i++) mx = Math.max(mx, pf.w[i]);
        c.fillStyle = P.cl; c.strokeStyle = P.cl; c.lineWidth = 1.1;
        for (let i = 0; i < pf.n; i++) {
          const x = pf.x[i], y = pf.y[i], a = 0.25 + 0.75 * Math.sqrt(pf.w[i] / (mx || 1)); c.globalAlpha = a;
          c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(pf.th[i]) * 7, y + Math.sin(pf.th[i]) * 7); c.stroke();
        }
        c.globalAlpha = 1;
        const L = st.last; if (L && L.cl && Wd.k > 0) for (const cl of L.cl) { if (cl.w < 0.08) continue; c.strokeStyle = P.cl; c.lineWidth = 2; c.beginPath(); c.arc(cl.x, cl.y, 26, 0, 7); c.stroke(); HeroKit.label(c, k, fmt1(cl.w * 100, 0) + ' %', cl.x, cl.y - 38, { color: P.cl, px: 12, weight: 800, haloColor: P.bg }); }
      }
      drawAda(c, s.x, s.y, s.th, HS.R, st.mode === 'placing' ? P.e2e : P.ink, 1);
      if (st.edit && !st.showP) HeroKit.label(c, k, 'тащи Аду', s.x, s.y - 34, { color: P.ink2, px: 11, weight: 650, haloColor: P.bg });
    }
    const info = st.info || (st.free ? (st.paused ? 'пауза' : 'Ада катается сама') : '');
    if (info) HeroKit.label(c, k, info, 10 * k, 14 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    out();
  }
  function out() {
    const el = $('#pfOut'), L = st.last, Wd = st.W;
    if (!Wd || !L) { setOut(el, ''); return; }
    const big = L.cl.filter((c) => c.w >= 0.1).length;
    if (Wd.k === 0 && st.mode !== 'run') { setOut(el, `Частиц: ${Wd.pf.n}. Фильтр ещё не видел ни одного скана.`); return; }
    setOut(el, `t = ${fmtF(Wd.t, 2)} с · облаков: <b>${big}</b> · ошибка оценки: <b>${L.err > 900 ? '—' : fmt1(L.err, 0) + ' см'}</b> · частиц: ${Wd.pf.n}${st.aug ? ' · подмешивание включено' : ''}${Wd.pinj > 0 ? ` · случайных сейчас <b>${fmt1(Wd.pinj * 100, 0)} %</b>` : ''}`);
  }
  function step() { st.last = st.W.step(); }
  /** Сценарий 1: глобальная локализация из верхней спальни, 10 с. */
  async function runGlobal() {
    st.free = false; st.edit = false; st.mode = 'run'; fresh({ start: 'global' }); st.info = 'фильтр не знает, где Ада';
    const R = { first: st.last.cl.slice(0, 2).map((c) => c.w), two: 0, wrongMax: 0, trueMin: 1, trueMax: 0, conv: null };
    let k = 0;
    await drive(RATE, () => {
      step(); k++; const L = st.last, s = st.W.s, big = L.cl.filter((c) => c.w >= 0.1);
      if (big.length >= 2) R.two = st.W.t;
      if (L.err > 60) { R.wrongMax = Math.max(R.wrongMax, L.cl[0].w); const tc = L.cl.find((c) => Math.hypot(c.x - s.x, c.y - s.y) < 60); const w = tc ? tc.w : 0; R.trueMin = Math.min(R.trueMin, w); R.trueMax = Math.max(R.trueMax, w); }
      if (R.conv == null && L.err < 25 && L.cl[0].w > 0.8 && L.sp < 30) R.conv = st.W.t;
      if (k === 1) R.first = L.cl.slice(0, 2).map((c) => c.w);
    }, () => k >= 40, draw);
    st.mode = 'idle'; st.info = ''; draw();
    return R;
  }
  /** Сценарий 2: частицы по всему дому, Ада стоит на месте 2 с. */
  async function runTwin() {
    st.mode = 'run'; const p = st.place; fresh({ start: 'global', at: { x: p.x, y: p.y, th: p.th } }); st.info = 'Ада стоит и смотрит лидаром';
    let k = 0; await drive(RATE, () => { st.last = st.W.stand(1); k++; }, () => k >= 8, draw);
    st.mode = 'idle'; st.info = ''; draw();
    const L = st.last, big = L.cl.filter((c) => c.w >= 0.2);
    return { err: L.err, big: big.length, top: L.cl[0].w, x: p.x, y: p.y };
  }
  /** Сценарий 3–4: Ада в кухне, через 2 с её переносят к зарядке. */
  async function runKid() {
    st.free = false; st.edit = false; st.mode = 'run'; fresh({ start: 'known', wps: WPK, augment: false }); st.info = 'Ада в кухне, фильтр знает где';
    const R = { rec: null, errEnd: 0, maxInj: 0, aug: st.aug }; let k = 0;
    await drive(RATE, () => {
      if (k === 8) { st.W.o.augment = st.aug; st.W.kidnap(KID.x, KID.y, KID.th, WPA); st.info = 'Аду перенесли к зарядке'; }
      step(); k++; const L = st.last; R.maxInj = Math.max(R.maxInj, st.W.pinj || 0);
      if (k > 8 && R.rec == null && L.err < 25 && L.cl[0].w > 0.6) R.rec = (k - 8) * PF.DT;
      R.errEnd = L.err;
    }, () => k >= 48, draw);
    st.mode = 'idle'; st.info = ''; draw();
    return R;
  }
  /** Свободный режим: Ада катается сама, пока сцена видна. */
  let freeAcc = 0;
  function freeTick(dt) {
    if (!st.free || st.paused || st.mode !== 'idle' || st.busy) return;
    freeAcc += dt * RATE; let n = Math.min(3, Math.floor(freeAcc)); freeAcc -= Math.floor(freeAcc);
    while (n-- > 0) step(); draw();
  }
  function setAug(v) { st.aug = v; $('#pfAug').checked = v; if (st.W) st.W.o.augment = v; draw(); }
  function setN(idx) { $('#pfN').value = idx; st.n = NS[idx]; $('#pfN').nextElementSibling.textContent = st.n; }
  const api = {
    reset() { st.free = false; st.edit = false; setAug(false); setN(2); st.place = { x: 300, y: 120, th: 0 }; fresh({ start: 'global' }); draw(); },
    state: () => ({ aug: st.aug, place: Object.assign({}, st.place) }),
    runGlobal, runTwin, runKid, setAug,
    place(x, y) { st.place = { x, y, th: 0 }; if (st.W) { st.W.s = { x, y, th: 0 }; } draw(); },
  };
  const pc = (v) => fmt1(v * 100, 0) + ' %';
  const missions = [
    { short: 'Где я?', title: 'Где я?', text: 'Ада включилась в одной из спален и не знает, в какой. Частицы раскиданы по всему дому. Сейчас она поедет в гостиную и дальше в кухню.', controls: [],
      onEnter: () => { st.free = false; st.edit = false; st.showP = true; st.info = ''; fresh({ start: 'global' }); draw(); },
      bet: { q: 'через сколько секунд облако частиц соберётся вокруг Ады?', options: ['Сразу, за полсекунды', 'За несколько секунд', 'Без подсказки не соберётся'], answer: (r) => (r.conv == null ? 2 : r.conv <= 0.5 ? 0 : 1) },
      action: { label: 'Поехали', run: (X) => X.runGlobal() },
      summary: (r) => `сошёлся за ${r.conv == null ? '—' : fmt1(r.conv, 2) + ' с'}, неверное облако до ${pc(r.wrongMax)}`,
      explain: (r) => `После первого скана облаков два, в обеих спальнях: ${pc(r.first[0])} и ${pc(r.first[1])}. Вскоре фильтр на ${pc(r.wrongMax)} уверен, что Ада в <b>нижней</b> спальне: там скан чуть лучше совпал с шумом. Верное облако выживает с весом от ${pc(r.trueMin)} до ${pc(r.trueMax)}, и через ${fmt1(r.conv, 2)} с, когда лидар заглядывает в дверь, фильтр переключается на верное. Калман с одним колоколом так не умеет: ему пришлось бы выбрать одну спальню и уверенно ошибаться.` },
    { short: 'Двойник', title: 'Найди двойника', text: 'В первой миссии фильтр нашёл Аду, когда она поехала и лидар заглянул в дверь. А если Ада стоит на месте? Перетащи её в любое место дома. Кнопка раскидает частицы по всему дому, и фильтр 2 секунды будет смотреть лидаром. Найди место, где он ошибётся.', controls: [],
      onEnter: () => { st.free = false; st.edit = true; st.info = ''; st.place = { x: 300, y: 120, th: 0 }; fresh({ start: 'global', at: st.place }); st.showP = false; draw(); },
      action: { label: 'Раскидать частицы и смотреть 2 с', run: (X) => { st.showP = true; return X.runTwin(); } },
      criteria: [{ label: 'Фильтр ошибся больше чем на 1 м или мечется между местами', test: (r) => r.err > 100 || r.big >= 2 }],
      summary: (r) => `(${fmt1(r.x / 100, 1)}; ${fmt1(r.y / 100, 1)}) м → ${r.big >= 2 ? 'облаков ' + r.big : 'ошибка ' + fmt1(r.err, 0) + ' см'}`,
      fail: (r) => `Фильтр нашёл Аду: ошибка ${fmt1(r.err, 0)} см. Это место ни на что не похоже.`,
      hint: 'Ищи место, которое лидар не отличит от другого. В доме есть две одинаковые комнаты. Встань подальше от их дверей: через дверь видно, что за ней.',
      explain: (r) => `${r.big >= 2 ? `Фильтр мечется между ${r.big} местами.` : `Фильтр уверенно выбрал не то место: ошибка ${fmt1(r.err / 100, 1)} м.`} С 24 лучами на 2,5 м сканы в одинаковых местах почти совпадают, и по одному скану места не различить. Пока Ада стоит, это не исправить: помогает только движение, как в первой миссии. Такие места есть в любом доме: одинаковые двери, коридоры, углы.` },
    { short: 'Похищение', title: 'Похищение', text: 'Фильтр уверенно ведёт Аду по кухне. Через 2 секунды её поднимут и перенесут в гостиную, к зарядке. Колёса в это время не крутятся, и одометрия ничего не заметит.', controls: [],
      onEnter: (X) => { st.free = false; st.edit = false; st.showP = true; st.info = ''; X.setAug(false); fresh({ start: 'known', wps: WPK }); draw(); },
      bet: { q: 'найдёт ли фильтр Аду за 10 секунд после похищения?', options: ['Да, сразу', 'Да, за несколько секунд', 'Нет'], answer: (r) => (r.errEnd < 25 ? (r.rec != null && r.rec <= 0.5 ? 0 : 1) : 2) },
      action: { label: 'Похитить Аду', run: (X) => X.runKid() },
      summary: (r) => `подмешивание ${r.aug ? 'вкл.' : 'выкл.'} → ошибка в конце ${fmt1(r.errEnd, 0)} см`,
      explain: (r) => `Через 10 секунд фильтр всё ещё уверен, что Ада в кухне: ошибка ${fmt1(r.errEnd / 100, 1)} м. Рядом с настоящим местом нет ни одной частицы, а пересэмплирование только размножает те, что есть. Веса у всех плохие, но после нормировки кто-то всё равно оказывается лучшим. Нужны частицы там, где их сейчас нет.` },
    { short: 'Почини', title: 'Почини фильтр', text: 'Рядом с новым местом Ады нет частиц, и взяться им неоткуда. Включи подмешивание случайных частиц и повтори похищение. Фильтр следит, насколько скан совпадает с ожиданием, и, если совпадение резко упало, разбрасывает часть частиц по всему дому.', controls: ['aug'],
      onEnter: () => { st.free = false; st.edit = false; st.showP = true; fresh({ start: 'known', wps: WPK }); draw(); },
      action: { label: 'Похитить Аду', run: (X) => X.runKid() },
      criteria: [{ label: 'Подмешивание включено', test: (r) => r.aug }, { label: 'Через 10 с после похищения ошибка меньше 25 см', test: (r) => r.errEnd < 25 }],
      summary: (r) => `подмешивание ${r.aug ? 'вкл.' : 'выкл.'} → ${r.rec != null ? 'нашёл через ' + fmt1(r.rec, 2) + ' с' : 'не нашёл'}, в конце ${fmt1(r.errEnd, 0)} см`,
      fail: (r) => (r.aug ? 'Не успел: попробуй ещё раз.' : 'Без подмешивания фильтру неоткуда взять частицы рядом с Адой.'),
      hint: 'Флажок под сценой.',
      explain: (r) => `Сразу после похищения скан перестал совпадать с ожиданием, и фильтр разбросал по дому до ${fmt1(r.maxInj * 100, 0)} % частиц. Несколько упали рядом с Адой, получили большой вес и через ${fmt1(r.rec, 2)} с собрали облако вокруг неё. Пока скан совпадает с картой, случайных частиц нет, и точность не страдает. Этот приём из книги «Probabilistic Robotics» называется Augmented MCL.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Ада катается сама. Тащи её в любое место — это похищение. Меняй число частиц, включай и выключай подмешивание, раскидывай частицы по дому.', final: true,
      onEnter: () => { st.edit = true; st.showP = true; st.info = ''; fresh({ start: 'known', at: { x: 290, y: 330, th: -Math.PI / 2 } }); st.free = true; st.paused = false; $('#pfPlay').textContent = 'Пауза'; draw(); } },
  ];
  function init() {
    legend('#pfLegend', [['настоящая Ада и лучи лидара', 'var(--ink)'], ['частицы: яркость — вес', 'var(--classic)'], ['облака и их вес', 'var(--classic)', 'dash']]);
    $('#pfAug').addEventListener('change', (e) => { setAug(e.target.checked); if (ctl) ctl.update(); });
    $('#pfN').addEventListener('input', (e) => { setN(+e.target.value); if (st.free) { const s = st.W.s; fresh({ start: 'known', at: s }); st.free = true; draw(); } });
    $('#pfPlay').addEventListener('click', () => { st.paused = !st.paused; $('#pfPlay').textContent = st.paused ? 'Пуск' : 'Пауза'; draw(); });
    $('#pfScatter').addEventListener('click', () => { if (!st.W) return; PF.scatter(st.W.pf); st.last = st.W.measure(); draw(); });
    HeroKit.drag($('#pfCv'), W, H, {
      hit: (p) => { if (!st.edit || st.mode !== 'idle' || !st.W) return null; const s = st.W.s; return Math.hypot(p.x - s.x, p.y - s.y) < 34 ? 'ada' : null; },
      start: () => { st.busy = true; },
      move: (o, p) => { const x = Math.max(20, Math.min(W - 20, p.x)), y = Math.max(20, Math.min(H - 20, p.y)); st.W.s = { x, y, th: st.W.s.th }; draw(); },
      end: () => {
        st.busy = false; let s = st.W.s;
        if (!HS.freeAt(s.x, s.y)) { const q = nearestFree(s.x, s.y); s = { x: q[0], y: q[1], th: s.th }; }
        if (st.free) st.W.kidnap(s.x, s.y, s.th); else { st.place = { x: s.x, y: s.y, th: 0 }; st.W.s = { x: s.x, y: s.y, th: 0 }; }
        draw(); if (ctl) ctl.update();
      },
    });
    setN(2); fresh({ start: 'global' });
    ctl = Missions.mount('#pfMis', missions, api, { controls: { aug: '#wrapAug', n: '#wrapPn', btns: '#wrapPfBtns' } });
    draw(); redrawOn(draw); HeroKit.loop($('#pfCv'), freeTick);
    return ctl;
  }
  function nearestFree(x, y) { let best = [HS.DOCK.x, HS.DOCK.y], bd = Infinity; for (let r = 4; r < 200; r += 4) for (let a = 0; a < 16; a++) { const qx = x + Math.cos(a * Math.PI / 8) * r, qy = y + Math.sin(a * Math.PI / 8) * r; if (HS.freeAt(qx, qy)) { const d = Math.hypot(qx - x, qy - y); if (d < bd) { bd = d; best = [qx, qy]; } } } return best; }
  return { init, api, st };
})();

/* ---------- Лаборатория 3: сетка занятости и SLAM ---------- */
const MapLab = (() => {
  const M = E4.OccMap, HS = E4.House, W = HS.W, H = HS.H, DR = [0, 0.5, 1, 2, 3], RATE = 30;
  const st = { T: null, drift: 1, slam: false, playing: false, curtain: 300, both: false, res: null, exact: false };
  let ctl = null;
  const off = { a: null, b: null };
  function paint(cvKey, m) {
    if (!off[cvKey]) { off[cvKey] = document.createElement('canvas'); off[cvKey].width = M.NX; off[cvKey].height = M.NY; }
    const cv = off[cvKey], cx = cv.getContext('2d'), img = cx.createImageData(M.NX, M.NY), P = pal();
    const fr = rgbOf(P.surf), oc = rgbOf(P.ink), un = rgbOf(HeroKit.css('--muted'));
    for (let k = 0; k < M.NX * M.NY; k++) {
      const l = m[k], p = 1 / (1 + Math.exp(-l)); let r, g, b;
      if (p >= 0.5) { const t = (p - 0.5) * 2; r = un[0] + (oc[0] - un[0]) * t; g = un[1] + (oc[1] - un[1]) * t; b = un[2] + (oc[2] - un[2]) * t; }
      else { const t = (0.5 - p) * 2; r = un[0] + (fr[0] - un[0]) * t; g = un[1] + (fr[1] - un[1]) * t; b = un[2] + (fr[2] - un[2]) * t; }
      img.data[4 * k] = r; img.data[4 * k + 1] = g; img.data[4 * k + 2] = b; img.data[4 * k + 3] = 255;
    }
    cx.putImageData(img, 0, 0); return cv;
  }
  function trail(c, pts, col, w, dash) { if (pts.length < 2) return; c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); }
  function draw() {
    const { c, k } = HeroKit.fit($('#mapCv'), W, H), P = pal(), T = st.T;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    if (!T) { c.fillStyle = HeroKit.css('--muted'); c.fillRect(0, 0, W, H); HeroKit.label(c, k, 'карта пуста: все клетки серые — неизвестно', W / 2, H / 2, { color: P.ink, px: 12, weight: 650, haloColor: HeroKit.css('--muted') }); return; }
    c.imageSmoothingEnabled = false;
    const A = paint('a', T.mOdo), cur = st.both ? st.curtain : W;
    c.save(); c.beginPath(); c.rect(0, 0, cur, H); c.clip(); c.drawImage(A, 0, 0, W, H); c.restore();
    if (st.both) { const B = paint('b', T.mSlam); c.save(); c.beginPath(); c.rect(cur, 0, W - cur, H); c.clip(); c.drawImage(B, 0, 0, W, H); c.restore(); }
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.7; trail(c, T.trail.truth, P.ink3, 1.2, [2, 4]); c.globalAlpha = 1;
    if (!st.exact) { c.save(); c.beginPath(); c.rect(0, 0, cur, H); c.clip(); trail(c, T.trail.odo, P.bad, 1.6); c.restore(); }
    if (st.both) { c.save(); c.beginPath(); c.rect(cur, 0, W - cur, H); c.clip(); trail(c, T.trail.slam, P.cl, 1.8); c.restore(); }
    drawAda(c, T.s.x, T.s.y, T.s.th, HS.R, P.ink, 0.95);
    if (!st.exact) { const po = T.pOdo; c.strokeStyle = P.bad; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(po.x, po.y, HS.R, 0, 7); c.stroke(); c.setLineDash([]); }
    if (st.both) {
      c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(cur, 0); c.lineTo(cur, H); c.stroke();
      c.beginPath(); c.arc(cur, H / 2, 15, 0, 7); c.fillStyle = P.surf; c.fill(); c.stroke();
      HeroKit.label(c, k, '⇆', cur, H / 2, { color: P.ink, px: 13, weight: 800, halo: false });
      if (cur > 70) HeroKit.label(c, k, 'по одометрии', cur - 10, 14 * k + 4, { align: 'right', color: P.bad, px: 11.5, weight: 800, haloColor: P.bg });
      if (cur < W - 40) HeroKit.label(c, k, 'SLAM', cur + 10, 14 * k + 4, { align: 'left', color: P.cl, px: 11.5, weight: 800, haloColor: P.bg });
    }
    out();
  }
  function out() {
    const el = $('#mapOut'), T = st.T, r = st.res;
    if (!T) { setOut(el, 'Карта пуста. Запуск — кнопкой в карточке миссии.'); return; }
    if (st.playing || !r) { setOut(el, `Объезд: ${fmt1(T.k / T.n * 100, 0)} % · ошибка позы по одометрии <b>${fmt1(Math.hypot(T.pOdo.x - T.s.x, T.pOdo.y - T.s.y), 0)} см</b>${st.slam ? ` · после сопоставления <b>${fmt1(Math.hypot(T.pSlam.x - T.s.x, T.pSlam.y - T.s.y), 0)} см</b>` : ''}`); return; }
    const one = (name, j, e) => `${name}: лишних стен <b>${fmt1(j.ghost * 100, 1)} %</b> · путь в кухню <b>${j.path ? 'есть' : 'нет'}</b>${e != null ? ` · ошибка позы в конце <b>${fmt1(e, 0)} см</b>` : ''}`;
    if (r.exact) setOut(el, `Известно ${fmt1(r.odo.coverage * 100, 0)} % свободного места · ${one('карта', r.odo, null)}`);
    else setOut(el, one('По одометрии', r.odo, r.endErr.odo) + (r.slam ? '<br>' + one('SLAM', r.slam, r.endErr.slam) : ''));
  }
  async function run() {
    syncCtl(); st.T = M.tour({ exact: st.exact, drift: st.drift, slam: st.slam && !st.exact }); st.both = st.slam && !st.exact; st.curtain = W / 2; st.res = null; st.playing = true;
    await drive(RATE, () => st.T.step(), () => st.T.done, draw);
    st.playing = false; st.res = st.T.result(); draw();
    let len = 0; const R = M.ROUTE; for (let i = 1; i < R.length; i++) len += Math.hypot(R[i].x - R[i - 1].x, R[i].y - R[i - 1].y);
    return Object.assign({ len: len / 100 }, st.res);
  }
  function syncCtl() { const d = $('#mapDrift'); st.drift = DR[+d.value]; d.nextElementSibling.textContent = fmt1(st.drift) + '°/м'; st.slam = $('#mapSlam').checked; }
  function setCtl(o) { if (o.drift != null) $('#mapDrift').value = DR.indexOf(o.drift); if (o.slam != null) $('#mapSlam').checked = o.slam; syncCtl(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.T = null; st.res = null; st.both = false; st.exact = false; setCtl({ drift: 1, slam: false }); draw(); },
    state: () => ({ drift: st.drift, slam: st.slam }), run, setCtl,
  };
  const missions = [
    { short: 'Карта', title: 'Карта по точной позе', text: 'Сначала схитрим: дадим построению настоящую позу Ады, как будто её кто-то знает. Ада объедет все комнаты, лидар — 90 лучей на 3,5 м.', controls: [],
      onEnter: () => { st.exact = true; },
      bet: { q: 'что окажется на карте внутри дивана и под кроватями, куда не заглядывает лидар?', options: ['Стена', 'Пустое место', 'Ничего: клетки останутся серыми'], answer: () => 2 },
      action: { label: 'Объехать дом', run: (X) => X.run() },
      summary: (r) => `известно ${fmt1(r.odo.coverage * 100, 0)} %, лишних стен ${fmt1(r.odo.ghost * 100, 1)} %`,
      explain: (r) => `За объезд в ${fmt1(r.len, 1)} м Ада нанесла на карту ${fmt1(r.odo.coverage * 100, 0)} % свободного места, лишних стен нет. Внутри мебели клетки остались серыми: туда не дошёл ни один луч. Сетка занятости честно различает «пусто», «занято» и «не знаю», и планировщик сам решает, как обходиться с неизвестным. Но настоящую позу роботу никто не скажет.` },
    { short: 'Одометрия', title: 'Карта по одометрии', text: 'Теперь позу считают колёса. Одометрия завышает путь на 1 % и уводит курс: ручка задаёт, на сколько градусов за метр пути.', controls: ['drift'],
      onEnter: (X) => { st.exact = false; X.setCtl({ drift: 1, slam: false }); },
      bet: { q: 'одометрия уводит курс на 1° за метр. Что станет с картой?', options: ['Почти ничего: градус — это мало', 'Стены поплывут и раздвоятся', 'Карта станет бледнее'], answer: (r) => (r.odo.ghost > 0.1 ? 1 : 0) },
      action: { label: 'Объехать дом', run: (X) => X.run() },
      criteria: [{ label: 'По карте нельзя проехать от зарядки в кухню', test: (r) => !r.odo.path }],
      summary: (r) => `увод ${fmt1(r.drift)}°/м → лишних стен ${fmt1(r.odo.ghost * 100, 0)} %, путь ${r.odo.path ? 'есть' : 'нет'}`,
      fail: () => 'Путь в кухню на карте ещё есть: увод слишком мал. Сделай его больше.',
      explain: (r) => `За ${fmt1(r.len, 1)} м курс ушёл на ${fmt1(r.drift * r.len, 0)}°, и к концу объезда поза ошиблась на ${fmt1(r.endErr.odo, 0)} см. Каждую стену Ада видела несколько раз из «разных» мест, и на карте стены раздвоились: ${fmt1(r.odo.ghost * 100, 0)} % занятых клеток — лишние. Двойники перегородили проход в кухню, и планировщик по такой карте честно ответит: пути нет.` },
    { short: 'SLAM', title: 'Почини карту', text: 'Позу по колёсам можно поправлять по самой карте. Включи сопоставление: каждый новый скан Ада прикладывает к уже построенной карте и поправляет позу. Проверь его на уводе 2°/м или сильнее.', controls: ['drift', 'slam'],
      onEnter: (X) => { st.exact = false; X.setCtl({ drift: 2 }); },
      action: { label: 'Объехать дом', run: (X) => X.run() },
      criteria: [{ label: 'Увод не меньше 2°/м, сопоставление включено', test: (r) => r.drift >= 2 && !!r.slam }, { label: 'На карте SLAM меньше 2 % лишних стен', test: (r) => !!r.slam && r.slam.ghost < 0.02 }, { label: 'По карте SLAM можно проехать в кухню', test: (r) => !!r.slam && r.slam.path }],
      summary: (r) => `увод ${fmt1(r.drift)}°/м, ${r.slam ? 'с сопоставлением' : 'без сопоставления'} → ${r.slam ? 'лишних ' + fmt1(r.slam.ghost * 100, 1) + ' %' : 'лишних ' + fmt1(r.odo.ghost * 100, 0) + ' %'}`,
      fail: (r) => (!r.slam ? 'Сопоставление выключено — включи флажок под сценой.' : 'Увод должен быть не меньше 2°/м.'),
      explain: (r) => `Одометрия к концу ошиблась на ${fmt1(r.endErr.odo, 0)} см, поза после сопоставления — на ${fmt1(r.endErr.slam, 0)} см. Лишних стен на карте SLAM ${fmt1(r.slam.ghost * 100, 1)} %. Тащи шторку по карте: слева то, что нарисовала одометрия, справа — SLAM. Пока Ада видит знакомые стены, ошибка не копится. В большом здании этого мало: там нужно ещё замыкание петель.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй увод и включай сопоставление. Тащи шторку, чтобы сравнить две карты одного объезда.', final: true,
      onEnter: () => { st.exact = false; },
      action: { label: 'Объехать дом', run: (X) => X.run() } },
  ];
  function init() {
    legend('#mapLegend', [['стена на карте', 'var(--ink)', 'box'], ['неизвестно', 'var(--muted)', 'box'], ['путь по одометрии', 'var(--critical)'], ['поза после сопоставления', 'var(--classic)'], ['настоящий путь', 'var(--ink-3)', 'dash']]);
    $('#mapDrift').addEventListener('input', () => { syncCtl(); if (ctl) ctl.update(); });
    $('#mapSlam').addEventListener('change', () => { syncCtl(); if (ctl) ctl.update(); });
    HeroKit.drag($('#mapCv'), W, H, {
      hit: (p) => (st.both && !st.playing && Math.abs(p.x - st.curtain) < 30 ? 'cur' : null),
      move: (o, p) => { st.curtain = Math.max(0, Math.min(W, p.x)); draw(); },
      tap: (p) => { if (st.both && !st.playing) { st.curtain = Math.max(0, Math.min(W, p.x)); draw(); } }, tapCursor: 'ew-resize',
    });
    syncCtl();
    ctl = Missions.mount('#mapMis', missions, api, { controls: { drift: '#wrapDrift', slam: '#wrapSlam' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Лаборатория 4: Дейкстра и A* ---------- */
const GridLab = (() => {
  const G = E4.Grid, NX = G.NX, NY = G.NY, CW = 10, W = NX * CW, H = NY * CW;
  const TRAP = (() => { const t = []; for (let j = 3; j <= 14; j++) t.push([17, j]); for (let i = 13; i <= 17; i++) { t.push([i, 3]); t.push([i, 14]); } return t; })();
  const BASE = G.base(), WALLK = new Uint8Array(NX * NY);
  G.BLOCKS.slice(0, 6).forEach(([i0, j0, i1, j1]) => { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) WALLK[j * NX + i] = 1; });
  const st = { user: new Uint8Array(NX * NY), eps: 1, s: Object.assign({}, G.START), t: Object.assign({}, G.GOAL), d: null, a: null, opt: null, anim: null, edit: false, moveEnds: false, shown: false };
  let ctl = null;
  const grid = () => { const g = BASE.slice(); for (let k = 0; k < NX * NY; k++) if (st.user[k]) g[k] = 1; return g; };
  function compute() { const g = grid(); st.d = G.search(g, st.s, st.t, 'dijkstra'); st.a = G.search(g, st.s, st.t, 'astar', st.eps); st.opt = st.eps === 1 ? st.a : G.search(g, st.s, st.t, 'astar', 1); }
  function drawPane(sel, res, n) {
    const { c, k } = HeroKit.fit($(sel), W, H), P = pal(), dark = HeroKit.dark();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const shown = Math.min(n == null ? Infinity : n, res.order.length), cl = rgbOf(P.cl);
    for (let q = 0; q < shown; q++) { const kk = res.order[q], i = kk % NX, j = (kk / NX) | 0, f = q / Math.max(1, res.order.length); c.fillStyle = `rgba(${cl[0]},${cl[1]},${cl[2]},${(dark ? 0.2 : 0.14) + 0.3 * (1 - f)})`; c.fillRect(i * CW, j * CW, CW, CW); }
    c.strokeStyle = P.grid; c.lineWidth = 0.6; c.beginPath(); for (let i = 1; i < NX; i++) { c.moveTo(i * CW, 0); c.lineTo(i * CW, H); } for (let j = 1; j < NY; j++) { c.moveTo(0, j * CW); c.lineTo(W, j * CW); } c.stroke();
    for (let kk = 0; kk < NX * NY; kk++) {
      const i = kk % NX, j = (kk / NX) | 0;
      if (BASE[kk]) { c.fillStyle = WALLK[kk] ? P.ink2 : P.ink3; c.globalAlpha = WALLK[kk] ? 1 : 0.55; c.fillRect(i * CW, j * CW, CW, CW); c.globalAlpha = 1; }
      else if (st.user[kk]) { c.fillStyle = HeroKit.css('--warning'); c.fillRect(i * CW + 0.5, j * CW + 0.5, CW - 1, CW - 1); c.strokeStyle = P.ink2; c.lineWidth = 1; c.strokeRect(i * CW + 1, j * CW + 1, CW - 2, CW - 2); }
    }
    if (res.path && st.shown && (n == null || shown >= res.order.length)) { c.strokeStyle = P.cl; c.lineWidth = 3; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); res.path.forEach((kk, q) => { const x = (kk % NX + 0.5) * CW, y = (((kk / NX) | 0) + 0.5) * CW; q ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
    drawAda(c, (st.s.i + 0.5) * CW, (st.s.j + 0.5) * CW, 0, 6.5, P.ink, 1);
    crosshair(c, (st.t.i + 0.5) * CW, (st.t.j + 0.5) * CW, P.ink, 5);
  }
  const cellsM = (cost) => fmt1(cost * G.CELL / 100, 2);
  function stat(sel, res) {
    if (!st.shown) { setOut($(sel), 'ещё не искали'); return; }
    const el = $(sel), shown = st.anim ? Math.min(st.anim.n, res.order.length) : res.order.length;
    setOut(el, `раскрыто <b>${shown}</b> ${plural(shown, 'клетка', 'клетки', 'клеток')}${(!st.anim || shown >= res.order.length) ? ` · путь <b>${res.path ? cellsM(res.cost) + ' м' : 'не найден'}</b>` : ''}`);
  }
  function draw() {
    const n = !st.shown ? 0 : st.anim ? st.anim.n : null;
    drawPane('#gCvD', st.d, n); drawPane('#gCvA', st.a, n); stat('#gStatD', st.d); stat('#gStatA', st.a);
    const free = G.free(grid()), ratio = st.a.path && st.opt.path ? st.a.cost / st.opt.cost : 1;
    setOut($('#gOut'), `Свободных клеток: ${free}. ${st.eps !== 1 ? `Вес эвристики ε = ${fmtF(st.eps, 1)}: путь A* длиннее кратчайшего на <b>${fmt1((ratio - 1) * 100, 1)} %</b>.` : 'A* с ε = 1: эвристика допустимая, путь кратчайший.'}`);
  }
  async function run() {
    compute(); const N = Math.max(st.d.order.length, st.a.order.length); st.anim = { n: 0 }; st.shown = true;
    await drive(N / 2.6, () => { st.anim.n++; }, () => st.anim.n >= N, draw);
    st.anim = null; draw();
    return state();
  }
  function state() { return { d: st.d.expanded, a: st.a.expanded, path: !!st.a.path, len: st.a.path ? st.a.cost * G.CELL / 100 : 0, ratio: st.a.path && st.opt.path ? st.a.cost / st.opt.cost : Infinity, eps: st.eps, free: G.free(grid()), user: st.user.reduce((x, y) => x + y, 0) }; }
  function refresh() { compute(); draw(); if (ctl) ctl.update(); }
  function setEps(v) { st.eps = Math.round(v * 10) / 10; $('#gEps').value = st.eps; $('#gEps').nextElementSibling.textContent = fmtF(st.eps, 1); }
  function setWalls(list) { st.user.fill(0); for (const [i, j] of list) st.user[j * NX + i] = 1; }
  const api = {
    reset() { st.user.fill(0); st.shown = false; st.s = Object.assign({}, G.START); st.t = Object.assign({}, G.GOAL); setEps(1); refresh(); },
    state, run, setEps: (v) => { setEps(v); refresh(); }, setWalls: (l) => { setWalls(l); refresh(); },
    toggle(i, j, v) { const kk = j * NX + i; if (BASE[kk] || (i === st.s.i && j === st.s.j) || (i === st.t.i && j === st.t.j)) return; st.user[kk] = v == null ? 1 - st.user[kk] : v; refresh(); },
  };
  const m = (v) => fmt1(v, 2) + ' м';
  const missions = [
    { short: 'Кто быстрее', title: 'Кто раскроет меньше клеток', text: 'Обе сетки одинаковые: стены, мебель, Ада в верхней спальне, цель в кухне. Алгоритмы ищут путь одновременно, по одной клетке за такт.', controls: [],
      onEnter: () => { st.edit = false; st.moveEnds = false; },
      bet: { q: 'кто раскроет меньше клеток, пока не найдёт путь?', options: ['Дейкстра', 'A*', 'Поровну'], answer: (r) => (r.a < r.d ? 1 : r.a > r.d ? 0 : 2) },
      action: { label: 'Искать путь', run: (X) => X.run() },
      summary: (r) => `Дейкстра ${r.d} · A* ${r.a}`,
      explain: (r) => `Дейкстра раскрыла ${r.d} из ${r.free} свободных клеток, A* — <b>${r.a}</b>. Пути одинаковые: ${m(r.len)}. Волна Дейкстры расходится во все стороны, потому что алгоритм не знает, где цель. A* из двух клеток с одинаковым пройденным путём раньше раскрывает ту, что ближе к кухне, и почти сразу идёт к цели.` },
    { short: 'Сломай A*', title: 'Сломай A*', text: 'На открытой карте эвристика сэкономила A* почти всю работу. Найдём карту, где она не помогает. Дорисуй стены: нажимай на клетки любой из сеток, мышью можно рисовать, не отпуская кнопку. Добейся, чтобы A* раскрыл больше 150 клеток, а путь в кухню остался.', controls: ['clear'],
      onEnter: () => { st.edit = true; st.moveEnds = false; st.shown = true; draw(); },
      criteria: [{ label: 'A* раскрыл больше 150 клеток', test: (r, s) => s.a > 150 }, { label: 'Путь в кухню есть', test: (r, s) => s.path }],
      hint: 'Эвристика не знает о стенах. Поставь стену поперёк прямой от Ады к кухне — лучше буквой П, открытой к Аде.',
      explain: (s) => `A* раскрыл ${nWord(s.a, 'клетку', 'клетки', 'клеток')}, Дейкстра — ${s.d}. Эвристика тянет A* в тупик: пока внутри ловушки g + h меньше, чем в обход, он заполняет её целиком. Путь у обоих по-прежнему одинаковый, ${m(s.len)}: с допустимой эвристикой A* всегда находит кратчайший путь, просто иногда дорогой ценой.` },
    { short: 'Жадность', title: 'Раздуй эвристику', text: 'Чтобы A* меньше блуждал в ловушке, его можно сильнее тянуть к цели — увеличить вес эвристики. Мы поставили в гостиной ловушку, и теперь A* раскрывает клетки по g + ε·h. Найди вес ε, при котором A* раскроет меньше 100 клеток, а путь станет длиннее кратчайшего не больше чем на 6 %.', controls: ['eps'],
      onEnter: (X) => { st.edit = false; st.moveEnds = false; st.shown = true; X.setWalls(TRAP); X.setEps(1); },
      criteria: [{ label: 'A* раскрыл меньше 100 клеток', test: (r, s) => s.a < 100 }, { label: 'Путь длиннее кратчайшего не больше чем на 6 %', test: (r, s) => s.ratio <= 1.06 }],
      hint: 'Двигай ползунок под сценой и смотри на счётчик A*. Жадность помогает не везде.',
      explain: (s) => `При ε = ${fmtF(s.eps, 1)} A* раскрыл ${nWord(s.a, 'клетку', 'клетки', 'клеток')} вместо 160, а путь длиннее кратчайшего на ${fmt1((s.ratio - 1) * 100, 1)} %. Это взвешенный A*: раскрывает меньше, но гарантия слабее — путь не длиннее ε × кратчайший. При ε от 1,1 до 1,3 клеток уже меньше, а путь ещё кратчайший. При ε больше 3,4 жадность перестаёт помогать: A* глубже уходит в ловушку.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Рисуй и стирай стены, двигай вес эвристики. Аду и цель тоже можно перетаскивать.', final: true,
      onEnter: () => { st.edit = true; st.moveEnds = true; st.shown = true; draw(); },
      action: { label: 'Искать путь с анимацией', run: (X) => X.run() } },
  ];
  function init() {
    legend('#gLegend', [['раскрытые клетки: темнее — раньше', 'var(--classic-soft)', 'box'], ['путь', 'var(--classic)'], ['твои стены', 'var(--warning)', 'box'], ['стены и мебель', 'var(--ink-2)', 'box']]);
    let pointerType = 'mouse', paint = 1;
    const cellOf = (p) => ({ i: Math.max(0, Math.min(NX - 1, Math.floor(p.x / CW))), j: Math.max(0, Math.min(NY - 1, Math.floor(p.y / CW))) });
    ['#gCvD', '#gCvA'].forEach((sel) => {
      const cv = $(sel);
      cv.addEventListener('pointerdown', (e) => { pointerType = e.pointerType; }, true);
      HeroKit.drag(cv, W, H, {
        hit: (p) => {
          if (st.anim) return null; const q = cellOf(p);
          if (st.moveEnds && q.i === st.s.i && q.j === st.s.j) return 's';
          if (st.moveEnds && q.i === st.t.i && q.j === st.t.j) return 't';
          if (st.edit && pointerType === 'mouse' && !matchMedia('(hover: none)').matches) return 'paint';
          return null;
        },
        start: (o, p) => { if (o === 'paint') { const q = cellOf(p), kk = q.j * NX + q.i; paint = st.user[kk] ? 0 : 1; api.toggle(q.i, q.j, paint); } },
        move: (o, p) => {
          const q = cellOf(p), kk = q.j * NX + q.i;
          if (o === 'paint') { if (st.user[kk] !== paint) api.toggle(q.i, q.j, paint); return; }
          if (BASE[kk] || st.user[kk]) return;
          if (o === 's' && !(q.i === st.t.i && q.j === st.t.j)) st.s = q; if (o === 't' && !(q.i === st.s.i && q.j === st.s.j)) st.t = q; refresh();
        },
        tap: (p) => { if (!st.edit || st.anim) return; const q = cellOf(p); api.toggle(q.i, q.j); }, tapCursor: 'cell',
      });
    });
    $('#gEps').addEventListener('input', (e) => { setEps(+e.target.value); refresh(); });
    $('#gClear').addEventListener('click', () => { st.user.fill(0); refresh(); });
    compute();
    ctl = Missions.mount('#gMis', missions, api, { controls: { eps: '#wrapEps', clear: '#wrapGClear' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, TRAP };
})();

/* ---------- Калькулятор размерности ---------- */
const DimCalc = (() => {
  const NS = [10, 20, 50, 100], RATE = 1e9, YEAR = 365.25 * 24 * 3600, CW = 520, CH = 92;
  const st = { d: 2, n: 50 };
  let ctl = null;
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sci = (v) => { if (v < 1e6) return Math.round(v).toLocaleString('ru-RU'); const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${fmt1(m, 1)}·10${String(e).split('').map((q) => SUP[+q]).join('')}`; };
  function bytes(b) { const u = [['байт', 1], ['КБ', 1e3], ['МБ', 1e6], ['ГБ', 1e9], ['ТБ', 1e12], ['ПБ', 1e15], ['ЭБ', 1e18]]; let k = 0; while (k < u.length - 1 && b >= u[k + 1][1]) k++; const v = b / u[k][1]; return v >= 1e3 ? sci(b) + ' байт' : `${fmt1(v, v < 10 ? 1 : 0)} ${u[k][0]}`; }
  function dur(s) { if (s < 1) return 'меньше секунды'; if (s < 120) return `${fmt1(s, 0)} с`; if (s < 7200) return `${fmt1(s / 60, 0)} мин`; if (s < 2 * 86400) return `${fmt1(s / 3600, 0)} ч`; if (s < YEAR) return `${fmt1(s / 86400, 0)} сут`; const y = s / YEAR; return y < 1e6 ? `${fmt1(y, y < 10 ? 1 : 0)} ${plural(Math.round(y), 'год', 'года', 'лет')}` : `${sci(y)} лет`; }
  const calc = (d, n) => { const cells = n ** d; return { cells, mem: cells / 8, time: cells / RATE }; };
  function draw() {
    const { c, k } = HeroKit.fit($('#dimCv'), CW, CH), P = pal(), box = { l: 16, r: CW - 16, t: 26, b: CH - 30 };
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CH);
    const E = 24, x = (e) => box.l + e / E * (box.r - box.l), r = calc(st.d, st.n), ev = Math.log10(r.cells);
    c.fillStyle = P.grid; c.fillRect(box.l, box.b - 8, box.r - box.l, 8);
    c.fillStyle = P.cl; c.fillRect(box.l, box.b - 8, Math.max(2, x(Math.min(E, ev)) - box.l), 8);
    const ticks = [[0, '1'], [3, 'тысяча'], [6, 'миллион'], [9, 'миллиард'], [12, 'триллион'], [15, '10¹⁵'], [18, '10¹⁸'], [21, '10²¹'], [24, '10²⁴']];
    for (const [e, t] of ticks) { c.fillStyle = P.ink3; c.fillRect(x(e) - 0.5, box.b - 12, 1, 16); HeroKit.label(c, k, t, x(e), box.b + 16, { px: 10.5, color: P.ink3, halo: false, align: e === 0 ? 'left' : e === E ? 'right' : 'center' }); }
    const yr = Math.log10(YEAR * RATE); c.setLineDash([4, 3]); c.strokeStyle = P.bad; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x(yr), box.t - 6); c.lineTo(x(yr), box.b); c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, 'год перебора', x(yr), box.t - 14, { px: 10.5, color: P.bad, weight: 700, haloColor: P.bg });
    const px = x(Math.min(E, ev)); c.beginPath(); c.arc(px, box.b - 4, 6, 0, 7); c.fillStyle = P.cl; c.fill(); c.strokeStyle = P.surf; c.lineWidth = 2; c.stroke();
    $('#dimOut').innerHTML = `<span>Клеток: <b>${sci(r.cells)}</b></span><span>Память по биту на клетку: <b>${bytes(r.mem)}</b></span><span>Обойти все клетки при миллиарде в секунду: <b>${dur(r.time)}</b></span>`;
  }
  function sync() { const d = $('#dimD'), n = $('#dimN'); st.d = +d.value; st.n = NS[+n.value]; d.nextElementSibling.textContent = st.d; n.nextElementSibling.textContent = st.n; draw(); if (ctl) ctl.update(); }
  const api = { reset() { $('#dimD').value = 2; $('#dimN').value = 2; sync(); }, state: () => Object.assign({}, st, calc(st.d, st.n), { prev: st.d > 1 ? calc(st.d - 1, st.n).time : 0 }), set(d, ni) { $('#dimD').value = d; if (ni != null) $('#dimN').value = ni; sync(); } };
  const missions = [
    { short: 'Сколько суставов', title: 'Сколько суставов выдержит сетка', text: 'Допустим, компьютер проверяет миллиард клеток в секунду. При 50 клетках на ось найди число степеней свободы, начиная с которого обход всех клеток займёт больше года.',
      criteria: [{ label: '50 клеток на ось', test: (r, s) => s.n === 50 }, { label: 'Обход дольше года', test: (r, s) => s.time > YEAR }, { label: 'С одной степенью свободы меньше — быстрее года', test: (r, s) => s.prev < YEAR }],
      hint: 'Каждая новая степень свободы умножает число клеток на 50.',
      explain: (s) => `Год перебора наступает с ${s.d} степеней свободы: ${sci(s.cells)} клеток, около ${dur(s.time)}. У гуманоида их несколько десятков. Рука с 7 суставами при той же сетке — ${sci(50 ** 7)} клеток: обход за ${dur(50 ** 7 / RATE)}, но ${bytes(50 ** 7 / 8)} памяти даже по биту на клетку. И это одна проверка, без поиска пути.` },
  ];
  function init() { ['#dimD', '#dimN'].forEach((q) => $(q).addEventListener('input', sync)); sync(); ctl = Missions.mount('#dimMis', missions, api); redrawOn(draw); return ctl; }
  return { init, api, st };
})();

/* ---------- Лаборатория 5: RRT и RRT* ---------- */
const RrtLab = (() => {
  const R = E4.RRT, W = R.W, H = R.H, SC = 0.5, PW = 520, PH = 130, DOOR0 = { a: 140, b: 260 };
  const st = { door: Object.assign({}, DOOR0), A: null, B: null, opt: null, seed: 1, playing: false, edit: false, stats: null, view: 'cost', baseMedian: null };
  let ctl = null;
  function fresh(seed) { st.seed = seed || st.seed; st.A = R.tree({ seed: st.seed, door: st.door }); st.B = R.tree({ seed: st.seed, door: st.door, star: true }); st.opt = R.optimal(R.inflate(R.obstacles(st.door))); }
  const gap = () => st.door.b - st.door.a;
  function drawTree(sel, T, P) {
    const { c, k } = HeroKit.fit($(sel), W * SC, H * SC);
    c.save(); c.scale(SC, SC);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); HeroKit.grid(c, W, H, 50, P.grid);
    const obs = R.obstacles(st.door);
    obs.forEach((r, i) => { const door = i >= R.FIXED.length, x0 = r[0], y0 = Math.max(0, r[1]), x1 = r[2], y1 = Math.min(H, r[3]); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); HeroKit.hatch(c, x0, y0, x1, y1, door ? P.ink2 : P.ink3, 9, 1.4); c.strokeStyle = door ? P.ink2 : P.ink3; c.lineWidth = 2; c.strokeRect(x0, y0, x1 - x0, y1 - y0); if (door && st.edit) { const yy = i === obs.length - 2 ? y1 - 12 : y0 + 12; c.fillStyle = P.ink2; c.beginPath(); c.roundRect((x0 + x1) / 2 - 12, yy - 4, 24, 8, 4); c.fill(); } });
    if (T) {
      c.strokeStyle = P.cl; c.globalAlpha = 0.45; c.lineWidth = 2; c.beginPath();
      for (let i = 1; i < T.x.length; i++) { const p = T.par[i]; c.moveTo(T.x[p], T.y[p]); c.lineTo(T.x[i], T.y[i]); }
      c.stroke(); c.globalAlpha = 1;
      const path = T.path(); if (path) { c.strokeStyle = P.cl; c.lineWidth = 7; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); path.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke(); }
    }
    drawAda(c, R.START.x, R.START.y, 0, 22, P.ink, 1); crosshair(c, R.GOAL.x, R.GOAL.y, P.ink, 16);
    c.restore();
    if (gap() <= 2 * R.R) HeroKit.label(c, k, 'проход закрыт', W * SC / 2, 12 * k, { color: P.bad, px: 11, weight: 700, haloColor: P.bg });
  }
  function plot() {
    const { c, k } = HeroKit.fit($('#rrtPlot'), PW, PH), P = pal(), box = { l: 40, r: PW - 12, t: 10, b: PH - 22 };
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    if (st.view === 'stats' && st.stats) {
      const lo = 1, hi = Math.log10(R.MAXIT), x = (v) => box.l + (Math.log10(Math.max(10, v)) - lo) / (hi - lo) * (box.r - box.l);
      axes(c, k, P, box, [[10, '10', 'left'], [100, '100'], [1000, '1000'], [R.MAXIT, '6000', 'right']], [], x, () => 0);
      c.strokeStyle = P.grid; c.beginPath(); c.moveTo(box.l, box.b); c.lineTo(box.r, box.b); c.stroke();
      if (st.baseMedian) { c.setLineDash([4, 3]); c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x(st.baseMedian), box.t); c.lineTo(x(st.baseMedian), box.b); c.stroke(); c.setLineDash([]); }
      const its = st.stats.its.slice().sort((a, b) => a - b), cnt = {};
      its.forEach((v) => { const bx = Math.round(x(v) / 7); cnt[bx] = (cnt[bx] || 0) + 1; c.beginPath(); c.arc(x(v), box.b - 6 - (cnt[bx] - 1) * 9, 4, 0, 7); c.fillStyle = v >= R.MAXIT ? P.bad : P.cl; c.fill(); });
      c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x(st.stats.median), box.t); c.lineTo(x(st.stats.median), box.b); c.stroke();
      HeroKit.label(c, k, `медиана ${fmt1(st.stats.median, 0)}`, x(st.stats.median), box.t + 2, { px: 10.5, color: P.ink, weight: 700, haloColor: P.bg, align: x(st.stats.median) > box.r - 60 ? 'right' : 'center' });
      return;
    }
    const A = st.A, B = st.B, n = Math.max(1, A ? A.it : 1), xmax = Math.max(200, Math.ceil(n / 200) * 200), opt = st.opt.cost;
    const ymin = isFinite(opt) ? Math.floor(opt / 100 * 10) / 10 - 0.2 : 4, ymax = ymin + 2.4;
    const x = (it) => box.l + it / xmax * (box.r - box.l), y = (v) => box.b - (Math.max(ymin, Math.min(ymax, v / 100)) - ymin) / (ymax - ymin) * (box.b - box.t);
    axes(c, k, P, box, [[0, '0', 'left'], [xmax / 2, String(xmax / 2)], [xmax, String(xmax), 'right']], [[(ymin + 0.4) * 100, fmt1(ymin + 0.4, 1)], [(ymin + 1.2) * 100, fmt1(ymin + 1.2, 1)], [(ymin + 2) * 100, fmt1(ymin + 2, 1)]], x, y);
    if (isFinite(opt)) { c.setLineDash([5, 4]); c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); c.moveTo(box.l, y(opt)); c.lineTo(box.r, y(opt)); c.stroke(); c.setLineDash([]); }
    const line = (T, col, w, dash) => {
      if (!T) return; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); let on = 0, last = null;
      T.hist.forEach((v, i) => { if (!isFinite(v)) return; const px = x(i + 1), py = y(v); on ? c.lineTo(px, py) : c.moveTo(px, py); on++; last = [px, py]; });
      c.stroke(); c.setLineDash([]); if (last) { c.beginPath(); c.arc(last[0], last[1], 3, 0, 7); c.fill(); }
    };
    line(A, P.ink3, 2, [5, 3]); line(B, P.cl, 2.4);
  }
  function stat(sel, T) {
    const el = $(sel); if (!T) { setOut(el, ''); return; }
    setOut(el, `итераций <b>${T.it}</b> · вершин ${T.x.length}${T.first != null ? ` · первый путь на <b>${T.first}</b> · длина <b>${fmt1(T.best / 100, 2)} м</b>` : ' · пути пока нет'}`);
  }
  function draw() {
    const P = pal(); drawTree('#rrtCvA', st.A, P); drawTree('#rrtCvB', st.B, P); stat('#rrtStatA', st.A); stat('#rrtStatB', st.B); plot();
    const opt = st.opt.cost;
    if (st.legView !== st.view) { st.legView = st.view; legend('#rrtPlotLegend', st.view === 'stats' ? [['запуск RRT', 'var(--classic)', 'dot'], ['не нашёл путь за 6000', 'var(--critical)', 'dot'], ['медиана', 'var(--ink)'], ['медиана для прохода 120 см', 'var(--ink-3)', 'dash']] : [['RRT', 'var(--ink-3)', 'dash'], ['RRT*', 'var(--classic)'], ['кратчайший путь', 'var(--good)', 'dash']]); }
    $('#rrtPlotCap').textContent = st.view === 'stats' ? 'Каждая точка — один запуск RRT: сколько итераций понадобилось до первого пути, логарифмическая шкала. Красные — не нашли за 6000. Пунктир — медиана для прохода 120 см.' : 'По горизонтали — итерации. По вертикали — длина лучшего найденного пути, м.';
    setOut($('#rrtOut'), `Проход между створками: <b>${fmt1(gap(), 0)} см</b>${gap() <= 2 * R.R ? ' — Ада не пролезет' : ''} · кратчайший путь: <b>${isFinite(opt) ? fmt1(opt / 100, 2) + ' м' : 'нет'}</b>`);
  }
  async function grow(until) {
    st.view = 'cost'; st.playing = true;
    await drive(until.rate, () => { st.A.step(); st.B.step(); }, until.done, draw);
    st.playing = false; draw();
    return res();
  }
  function res() { const A = st.A, B = st.B, opt = st.opt.cost; return { firstA: A.first, firstB: B.first, a: A.best, b: B.best, opt, ratioA: A.best / opt, ratioB: B.best / opt, it: A.it, aImproved: st.prevA != null && A.best < st.prevA - 0.5, bImproved: st.prevB != null && B.best < st.prevB - 0.5 }; }
  async function runFirst() { fresh(1); return grow({ rate: 60, done: () => st.A.first != null && st.A.it >= st.A.first + 30 }); }
  async function runMore() { if (!st.A || st.A.first == null) { fresh(1); while (st.A.first == null) { st.A.step(); st.B.step(); } } st.prevA = st.A.best; st.prevB = st.B.best; const end = st.A.it + 1000; return grow({ rate: 400, done: () => st.A.it >= end }); }
  async function runStats() {
    st.playing = true; draw(); await new Promise((r) => setTimeout(r, 30));
    const exists = isFinite(st.opt.cost);
    if (!st.baseMedian) st.baseMedian = R.stats(DOOR0, 20).median;
    st.stats = exists ? R.stats(st.door, 20) : null; st.view = exists ? 'stats' : 'cost';
    fresh(st.seed); for (let i = 0; i < 6000 && (st.A.first == null || st.A.it < st.A.first + 100); i++) { st.A.step(); st.B.step(); }
    st.playing = false; draw();
    return { exists, gap: gap(), median: exists ? st.stats.median : Infinity, fails: exists ? st.stats.fails : 20, base: st.baseMedian };
  }
  async function runAgain() { fresh(st.seed + 1); return grow({ rate: 120, done: () => st.A.it >= 1500 }); }
  const api = {
    reset() { st.door = Object.assign({}, DOOR0); st.view = 'cost'; st.stats = null; fresh(1); draw(); },
    state: () => ({ gap: gap() }), runFirst, runMore, runStats, runAgain,
    setDoor(a, b) { st.door = { a, b }; fresh(st.seed); st.view = 'cost'; draw(); if (ctl) ctl.update(); },
  };
  const mm = (v) => fmt1(v / 100, 2) + ' м';
  const missions = [
    { short: 'Кто первым', title: 'Кто первым найдёт путь', text: 'Деревья растут одновременно, по одной итерации за такт, на одних и тех же случайных точках. Ада слева, цель справа за перегородкой.', controls: [],
      onEnter: () => { st.edit = false; st.view = 'cost'; },
      bet: { q: 'на какой итерации каждое дерево найдёт первый путь?', options: ['RRT раньше: итерация проще', 'RRT* раньше: дерево аккуратнее', 'На одной и той же'], answer: (r) => (r.firstA === r.firstB ? 2 : r.firstA < r.firstB ? 0 : 1) },
      action: { label: 'Вырастить деревья', run: (X) => X.runFirst() },
      summary: (r) => `первый путь: RRT ${r.firstA}, RRT* ${r.firstB} · ${mm(r.a)} и ${mm(r.b)}`,
      explain: (r) => `Оба нашли первый путь на итерации ${r.firstA}. Вершины у деревьев одни и те же: случайные точки общие, а ближайшую вершину и шаг к точке RRT и RRT* выбирают одинаково. Различаются только рёбра. Путь RRT — ${mm(r.a)}, RRT* — ${mm(r.b)}, кратчайший — ${mm(r.opt)}. Итерация RRT* дороже: нужно найти соседей и перепривязать их. Зачем тогда RRT*? Это видно, если растить деревья дальше.` },
    { short: 'Дай время', title: 'Дай деревьям время', text: 'Пусть деревья растут дальше. Кнопку можно нажимать несколько раз: каждый раз — ещё 1000 итераций.', controls: [],
      onEnter: () => { st.edit = false; st.view = 'cost'; draw(); },
      bet: { q: 'если растить деревья дальше, чей путь станет короче?', options: ['Оба', 'Только RRT*', 'Ни один'], answer: (r) => (r.aImproved && r.bImproved ? 0 : r.bImproved ? 1 : r.aImproved ? 0 : 2) },
      action: { label: 'Ещё 1000 итераций', run: (X) => X.runMore() },
      criteria: [{ label: 'Путь RRT* длиннее кратчайшего меньше чем на 2 %', test: (r) => r.ratioB < 1.02 }],
      summary: (r) => `${nWord(r.it, 'итерация', 'итерации', 'итераций')}: RRT ${mm(r.a)}, RRT* ${mm(r.b)}`,
      fail: (r) => `RRT* пока длиннее кратчайшего на ${fmt1((r.ratioB - 1) * 100, 1)} %. Ещё итераций.`,
      explain: (r) => `После ${nWord(r.it, 'итерации', 'итераций', 'итераций')} путь RRT* — ${mm(r.b)}, на ${fmt1((r.ratioB - 1) * 100, 1)} % длиннее кратчайшего. RRT остался на ${mm(r.a)}: старые рёбра у него не меняются, а новые ветки до цели почти всегда длиннее. Karaman и Frazzoli в 2011 году доказали это строго: RRT почти наверняка сходится к неоптимальному пути, а RRT* — к кратчайшему.` },
    { short: 'Узкий проход', title: 'Найди проход, где RRT буксует', text: 'Если путь существует, RRT его найдёт: вероятность стремится к единице с ростом числа итераций. Но сколько итераций понадобится? Двигай створки перегородки мышью или пальцем. Сделай проход таким узким, чтобы RRT в среднем тратил на первый путь больше 500 итераций, но путь существовал. Кнопка прогонит 20 запусков с разными случайными числами.', controls: [],
      onEnter: () => { st.edit = true; draw(); },
      action: { label: 'Прогнать 20 запусков', run: (X) => X.runStats() },
      criteria: [{ label: 'Путь существует', test: (r) => r.exists }, { label: 'Медиана больше 500 итераций', test: (r) => r.median > 500 }],
      summary: (r) => `проход ${fmt1(r.gap, 0)} см → ${r.exists ? 'медиана ' + fmt1(r.median, 0) + ', не нашёл за 6000: ' + r.fails + ' из 20' : 'пути нет'}`,
      fail: (r) => (!r.exists ? 'Проход закрыт, пути нет. Раздвинь створки: Аде нужно больше 30 см.' : `Медиана ${fmt1(r.median, 0)}: проход ещё широкий. Сузь его.`),
      hint: 'Ада — круг радиусом 15 см. Проход уже 45 см заметно мешает дереву.',
      explain: (r) => `При проходе ${fmt1(r.gap, 0)} см медиана — ${nWord(Math.round(r.median), 'итерация', 'итерации', 'итераций')} против ${fmt1(r.base, 0)} для прохода 120 см${r.fails ? `, а в ${r.fails} из 20 запусков RRT не нашёл путь за 6000 итераций` : ''}. Вероятностная полнота обещает, что путь найдётся, но не говорит когда. Случайная точка попадает в узкий проход редко, примерно пропорционально его площади.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай створки и выращивай деревья заново: каждый раз на новых случайных точках.', final: true,
      onEnter: () => { st.edit = true; st.view = 'cost'; draw(); },
      action: { label: 'Вырастить заново', run: (X) => X.runAgain() } },
  ];
  function init() {
    legend('#rrtLegend', [['дерево', 'var(--classic)'], ['найденный путь', 'var(--classic)'], ['створки перегородки', 'var(--ink-2)', 'box']]);
    ['#rrtCvA', '#rrtCvB'].forEach((sel) => {
      HeroKit.drag($(sel), W * SC, H * SC, {
        hit: (p) => {
          if (!st.edit || st.playing) return null; const x = p.x / SC, y = p.y / SC;
          if (x < 260 || x > 340) return null;
          if (Math.abs(y - st.door.a) < 34 || (y < st.door.a && y > st.door.a - 80)) return 'a';
          if (Math.abs(y - st.door.b) < 34 || (y > st.door.b && y < st.door.b + 80)) return 'b';
          return null;
        },
        move: (o, p) => { const y = Math.round(p.y / SC); if (o === 'a') st.door.a = Math.max(20, Math.min(st.door.b, y)); else st.door.b = Math.min(380, Math.max(st.door.a, y)); fresh(st.seed); st.view = 'cost'; draw(); },
        end: () => { if (ctl) ctl.update(); },
      });
    });
    fresh(1);
    ctl = Missions.mount('#rrtMis', missions, api);
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Классика рядом с нейросетями ---------- */
const Today = (() => {
  const S = window.L4_TODAY || [];
  const COL = { nn: 'var(--e2e)', cl: 'var(--classic)', hw: 'var(--ink-3)' };
  function show(i) {
    $$('#todaySeg button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const s = S[i], box = $('#todayBox'); box.innerHTML = '';
    const flow = h('div', { class: 'flow' });
    s.flow.forEach(([t, f, d, kind], j) => {
      if (j) flow.append(h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→'));
      flow.append(h('div', { class: 'flow-box', style: `--c:${COL[kind]}` }, h('h4', null, t), f ? h('div', { class: 'fq' }, f) : null, d ? h('p', null, d) : null));
    });
    box.append(flow, h('p', { class: 'today-note', html: s.note }));
  }
  function init() {
    if (!S.length) return;
    S.forEach((s, i) => { const b = h('button', { type: 'button' }, s.name); b.addEventListener('click', () => show(i)); $('#todaySeg').append(b); });
    $('#todayBox').before(h('div', { class: 'cv-legend', style: 'margin:0 0 4px' }, ...[['обученная модель', COL.nn], ['классический модуль', COL.cl], ['датчики и железо', COL.hw]].map(([t, c]) => h('span', null, h('i', { style: `--c:${c};height:8px;width:14px;border-radius:3px;background:${c}` }), t))));
    show(0);
  }
  return { init };
})();

/* ---------- Задача: какой метод для какой задачи ---------- */
function initMethodSort() {
  return Cards.sort('#methodSort', window.L4_SORT);
}

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
function initQuiz() { renderQuiz('#quizBox', window.L4_QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav); safe('flow', initFlow);
    safe('kf', () => { mis.kf = KfLab.init(); }); safe('pf', () => { mis.pf = PfLab.init(); }); safe('map', () => { mis.map = MapLab.init(); });
    safe('grid', () => { mis.grid = GridLab.init(); }); safe('dim', () => { mis.dim = DimCalc.init(); }); safe('rrt', () => { mis.rrt = RrtLab.init(); });
    safe('today', () => Today.init()); safe('sort', () => { mis.sort = initMethodSort(); }); safe('quiz', initQuiz);
    window.__l04 = { mis, SPEED, KfLab, PfLab, MapLab, GridLab, DimCalc, RrtLab }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
