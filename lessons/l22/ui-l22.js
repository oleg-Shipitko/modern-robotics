/* =====================================================================
   ui-l22.js — урок 2.2 «PerAct: 3D-представления и язык». Интерактивы —
   миссии на живой сцене (shared/missions.js):
   1) ключевые позы: порог остановки на графике скорости суставов, условие
      про захват, позы через равные промежутки; планировщик по прямой;
   2) следующий лучший воксель: регрессия и классификатор рядом в 3D-сетке,
      команда выбирает полку, окно по высоте (поле зрения);
   3) счёт памяти на внимание: все со всеми и Perceiver; выходы поворота;
   задача с карточками «собери PerAct по шагам»: какой шаг даёт тензор какой формы;
   график из таблицы 1 статьи: столбики по задачам, упорядоченным по успеху PerAct.
   Схемы (перекрёстная энтропия, латенты, путь данных) — l22/flow.js. Движок — l22/engine.js (без DOM).
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pc = (v, d) => fmt(v * 100, d == null ? 0 : d) + '%';
const int = (v) => Math.round(v).toLocaleString('ru-RU');
/** Байты в десятичных единицах: «3,7 ГБ», «384 ТБ». */
function bytes(b) {
  for (const [u, v] of [['ПБ', 1e15], ['ТБ', 1e12], ['ГБ', 1e9], ['МБ', 1e6], ['КБ', 1e3]]) if (b >= v * 0.9995) { const x = b / v; return fmt(x, x >= 10 ? 0 : 1) + ' ' + u; }
  return int(b) + ' Б';
}
/** Большие числа словами: «65,2 млн», «1,0 трлн». */
function big(n) { if (n >= 1e12) return fmt(n / 1e12, 1) + ' трлн'; if (n >= 1e9) return fmt(n / 1e9, 1) + ' млрд'; if (n >= 1e6) return fmt(n / 1e6, n >= 1e8 ? 0 : 1) + ' млн'; if (n >= 1e4) return fmt(n / 1e3, 0) + ' тыс.'; return int(n); }
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
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
/** Прогнать генератор обучения кусками между кадрами, чтобы страница не замирала. */
async function runGen(gen, perFrame, onEv) {
  for (;;) {
    let r; for (let i = 0; i < (perFrame || 1); i++) { r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); }
    await nextFrame();
  }
}
/** Прямоугольник со скруглёнными углами (путь). */
function rr(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + hh - r); c.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh); c.lineTo(x + r, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
/** Цвет #rrggbb → [r, g, b]; затемнить или осветлить множителем. */
function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const shade = (hex, f, a) => { const [r, g, b] = rgb(hex); return `rgba(${Math.round(Math.min(255, r * f))},${Math.round(Math.min(255, g * f))},${Math.round(Math.min(255, b * f))},${a == null ? 1 : a})`; };
const WOOD = () => (HeroKit.dark() ? { fill: '#7a6650', edge: '#5a4a39', soft: '#4a4034' } : { fill: '#dcc6a3', edge: '#b89e78', soft: '#efe4d2' });
const CUPC = () => (HeroKit.dark() ? { fill: '#3e8f99', edge: '#2c6a72' } : { fill: '#62aeb8', edge: '#3f8790' });

/* ---------- 1. Ключевые позы ---------- */
const LabKey = (() => {
  const E = L22, W = 640, H = 424, PW = 640, PH = 200, LIMIT6 = 6;
  const demo = E.buildDemo();
  const BOX = { x0: -0.15, x1: 1.0, z1: 0.70 }, S = W / (BOX.x1 - BOX.x0);
  const X = (x) => (x - BOX.x0) * S, Z = (z) => (BOX.z1 - z) * S;
  const st = { eps: 0.04, grip: true, mode: 'stops', kf: null, res: null, roles: null, anim: null, done: null };
  let ctl = null, animId = 0;
  /** Сколько поз по остановкам при текущем пороге (с условием про захват): столько же берём через равные промежутки. */
  const nStops = () => Math.max(3, Math.min(12, E.keyframes(demo, st.eps, true).kfs.length));
  function recompute() {
    st.kf = st.mode === 'interval' ? E.intervalKeyframes(demo, nStops()) : E.keyframes(demo, st.eps, st.grip);
    st.res = E.replay(st.kf.kfs); st.roles = E.roles(st.kf.kfs); st.done = null;
  }
  function state() { const r = st.res; return { eps: st.eps, grip: st.grip, mode: st.mode, n: demo.n, nk: st.kf.kfs.length, ok: r.ok, type: r.type, msg: r.msg, k: r.k, roles: Object.assign({}, st.roles) }; }
  /** Пороги, при которых по остановкам ровно шесть поз и чашка встаёт на полку. */
  const band = (() => { let lo = null, hi = null; for (let i = 1; i <= 40; i++) { const e = i / 100, k = E.keyframes(demo, e, true); if (k.kfs.length === LIMIT6 && E.replay(k.kfs).ok) { if (lo == null) lo = e; hi = e; } } return { lo, hi }; })();
  const inBand = () => st.eps >= band.lo && st.eps <= band.hi;

  /* --- сцена сбоку --- */
  function drawKettle(c, P) {
    c.save(); c.lineWidth = 2; c.strokeStyle = P.ink3; c.fillStyle = P.surf; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(X(0.535), Z(0.075)); c.lineTo(X(0.562), Z(0.152)); c.lineTo(X(0.553), Z(0.157)); c.lineTo(X(0.535), Z(0.118)); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(X(0.445), Z(0.15)); c.bezierCurveTo(X(0.418), Z(0.15), X(0.418), Z(0.05), X(0.445), Z(0.05)); c.lineWidth = 3; c.stroke(); c.lineWidth = 2;
    rr(c, X(0.445), Z(0.185), X(0.535) - X(0.445), Z(0) - Z(0.185), 9); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(X(0.452), Z(0.185)); c.quadraticCurveTo(X(0.49), Z(0.212), X(0.528), Z(0.185)); c.fill(); c.stroke();
    c.beginPath(); c.arc(X(0.49), Z(0.212), 3.5, 0, 7); c.fill(); c.stroke();
    c.restore();
  }
  function drawShelf(c, P) {
    const Wd = WOOD();
    c.fillStyle = Wd.soft; c.fillRect(X(E.SHELF.xf), Z(0.62), X(0.94) - X(E.SHELF.xf), Z(0) - Z(0.62));
    for (const o of E.OBST) if (/^board|roof|back/.test(o.id)) { c.fillStyle = Wd.fill; c.fillRect(X(o.x0), Z(o.z1), X(o.x1) - X(o.x0), Z(o.z0) - Z(o.z1)); c.strokeStyle = Wd.edge; c.lineWidth = 1; c.strokeRect(X(o.x0), Z(o.z1), X(o.x1) - X(o.x0), Z(o.z0) - Z(o.z1)); }
  }
  function drawCup(c, P, x, zb, ghost) {
    const C = CUPC(), x0 = X(x - E.CUP.r), x1 = X(x + E.CUP.r), y0 = Z(zb + E.CUP.h), y1 = Z(zb);
    c.save(); if (ghost) { c.setLineDash([4, 3]); c.globalAlpha = 0.75; }
    c.lineWidth = 2; c.strokeStyle = C.edge; c.fillStyle = ghost ? 'transparent' : C.fill;
    rr(c, x0, y0, x1 - x0, y1 - y0, 4); if (!ghost) c.fill(); c.stroke();
    c.beginPath(); c.arc(x1 + 1, (y0 + y1) / 2, 9, -1.15, 1.15); c.lineWidth = 3; c.stroke();
    c.restore();
  }
  function drawArm(c, P, x, z, open) {
    const a = E.armPoints(x, z), gap = open ? 0.034 : 0.021;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    // корпус Ады
    c.fillStyle = P.surf; c.strokeStyle = P.ink3; c.lineWidth = 2; rr(c, X(-0.2), Z(0.68), X(-0.035) - X(-0.2), Z(0.12) - Z(0.68), 18); c.fill(); c.stroke();
    c.strokeStyle = P.ink3; c.lineWidth = 13; c.beginPath(); c.moveTo(X(a.s[0]), Z(a.s[1])); c.lineTo(X(a.e[0]), Z(a.e[1])); c.stroke();
    c.lineWidth = 11; c.beginPath(); c.moveTo(X(a.e[0]), Z(a.e[1])); c.lineTo(X(a.w[0]), Z(a.w[1])); c.stroke();
    c.lineWidth = 6; c.strokeStyle = P.ink2; c.beginPath(); c.moveTo(X(a.w[0]), Z(z)); c.lineTo(X(x - 0.045), Z(z)); c.stroke();
    for (const p of [a.s, a.e, a.w]) { c.beginPath(); c.arc(X(p[0]), Z(p[1]), 6.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.2; c.strokeStyle = P.ink2; c.stroke(); }
    c.strokeStyle = P.ink2; c.lineWidth = 4; c.beginPath(); c.moveTo(X(x - 0.045), Z(z - gap)); c.lineTo(X(x - 0.045), Z(z + gap)); c.stroke();
    c.lineWidth = 3.4; c.beginPath(); c.moveTo(X(x - 0.045), Z(z + gap)); c.lineTo(X(x + 0.04), Z(z + gap)); c.moveTo(X(x - 0.045), Z(z - gap)); c.lineTo(X(x + 0.04), Z(z - gap)); c.stroke();
    c.restore();
  }
  /** Что видно в момент i пути исполнения: поза захвата, его состояние и где чашка. */
  function frameAt(i) {
    const r = st.res, path = r.path, p = path[Math.max(0, Math.min(path.length - 1, i))];
    let open = 1, cup = { x: E.CUP.x, zb: 0 }, held = false;
    for (const ev of r.ev) {
      if (ev.i > i) break;
      if (ev.type === 'grasp') { open = 0; held = true; }
      else if (ev.type === 'miss') open = 0;
      else if (ev.type === 'place' || ev.type === 'drop') { open = 1; held = false; cup = { x: ev.at[0], zb: ev.at[1] - E.CUP.gz }; }
    }
    // состояние захвата между событиями — по ключевым позам, которые уже пройдены
    let kDone = -1; r.segs.forEach((s, k) => { if (s.i1 != null && s.i1 <= i) kDone = k; });
    if (kDone >= 0 && !r.ev.some((ev) => ev.i <= i && ev.k === kDone)) open = st.kf.kfs[kDone].open;
    if (held) cup = { x: p[0], zb: p[1] - E.CUP.gz };
    return { p, open, cup, held };
  }
  function drawScene() {
    const { c, k } = HeroKit.fit($('#kCv'), W, H), P = pal(), r = st.res;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let x = -0.1; x <= 1.0001; x += 0.1) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), Z(0)); c.stroke(); }
    for (let z = 0.1; z <= 0.70001; z += 0.1) { c.beginPath(); c.moveTo(0, Z(z)); c.lineTo(W, Z(z)); c.stroke(); }
    c.fillStyle = P.bg2; c.fillRect(0, Z(0), W, H - Z(0)); c.strokeStyle = P.ink3; c.lineWidth = 2; c.beginPath(); c.moveTo(0, Z(0)); c.lineTo(W, Z(0)); c.stroke();
    drawShelf(c, P); drawKettle(c, P);
    HeroKit.label(c, k, 'верхняя полка', X(0.775), Z(0.57), { px: 11, color: P.ink3, haloColor: WOOD().soft });
    HeroKit.label(c, k, 'нижняя полка', X(0.775), Z(0.27), { px: 11, color: P.ink3, haloColor: WOOD().soft });
    HeroKit.label(c, k, 'чайник', X(0.49), Z(0.1), { px: 11, color: P.ink3, haloColor: P.surf });
    // путь демонстрации
    c.save(); c.strokeStyle = P.ink2; c.lineWidth = 2.2; c.setLineDash([4, 4]); c.globalAlpha = 0.9; c.beginPath();
    demo.pos.forEach((p, i) => (i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])))); c.stroke(); c.restore();
    // план: от начала через все ключевые позы (пунктир), исполненная часть — сплошная
    const plan = [E.POSE.home].concat(st.kf.kfs.map((f) => f.p));
    c.save(); c.strokeStyle = P.cl; c.lineWidth = 2; c.globalAlpha = 0.45; c.setLineDash([6, 5]); c.beginPath(); plan.forEach((p, i) => (i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])))); c.stroke(); c.restore();
    const upTo = st.anim ? Math.floor(st.anim.i) : r.path.length - 1;
    c.strokeStyle = P.cl; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i <= upTo && i < r.path.length; i++) { const p = r.path[i]; i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])); } c.stroke();
    // чашка и рука
    const fr = frameAt(upTo), fin = !st.anim && st.done;
    if (st.anim || fin) drawCup(c, P, fr.cup.x, fr.cup.zb, false);
    else { drawCup(c, P, E.CUP.x, 0, false); const pl = r.ev.find((e) => e.type === 'place'); if (r.ok && pl) drawCup(c, P, pl.at[0], pl.at[1] - E.CUP.gz, true); }
    const ap = st.anim || fin ? fr.p : E.POSE.home;
    drawArm(c, P, ap[0], ap[1], st.anim || fin ? fr.open : 1);
    HeroKit.label(c, k, 'Ада', Math.max(24, (X(-0.2) + X(-0.035)) / 2), Z(0.62), { px: 11, weight: 700, color: P.ink3, halo: false });
    // крест неудачи — под кружками ключевых поз и крупнее их, чтобы номер позы оставался виден
    if (!st.anim && !r.ok && r.at) HeroKit.cross(c, X(r.at[0]), Z(r.at[1]), 15, P.bad, 3.4);
    // ключевые позы
    let prevOpen = 1;
    st.kf.kfs.forEach((f, i) => {
      const x = X(f.p[0]), y = Z(f.p[1]);
      c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = P.e2e; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
      HeroKit.label(c, k, String(i + 1), x, y, { px: 10.5, weight: 800, color: '#fff', halo: false });
      if (f.open !== prevOpen) HeroKit.label(c, k, f.open ? 'разжать' : 'сжать', x, y + 17, { px: 10.5, weight: 700, color: P.e2e });
      prevOpen = f.open;
    });
    // итог
    if (!st.anim) {
      if (r.ok) { const pl = r.ev.find((e) => e.type === 'place'); if (pl) { HeroKit.check(c, X(pl.at[0]) + 34, Z(pl.at[1]) - 30, 8, P.good, 3); } }
      else if (r.at) {
        const x = X(r.at[0]), y = Z(r.at[1]);
        HeroKit.font(c, k, 12, 700); const w = c.measureText(r.msg).width;   // подпись не выходит за край сцены
        const lx = Math.max(6, Math.min(W - 6 - w, x < W * 0.6 ? x + 20 : x - 20 - w));
        HeroKit.label(c, k, r.msg, lx, y - 22, { px: 12, weight: 700, color: P.bad, align: 'left' });
      }
    }
  }
  /* --- график скорости --- */
  const G = { L: 50, R: PW - 12, T: 18, B: 150, G0: 160, G1: 171 };
  const lo = Math.log10(0.008), hi = Math.log10(2.5);
  const yv = (v) => G.B - (G.B - G.T) * (Math.log10(Math.max(v, 0.008)) - lo) / (hi - lo);
  const vy = (y) => Math.pow(10, lo + (G.B - y) / (G.B - G.T) * (hi - lo));
  const xf = (i) => G.L + (G.R - G.L) * i / (demo.n - 1);
  function drawSpeed() {
    const cv = $('#kSpd'), { c, k } = HeroKit.fit(cv, PW, PH), P = pal(), n = demo.n;
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const narrow = k > 1.5;                   // на телефоне график низкий: подписей по оси меньше, поле слева шире
    G.L = narrow ? 76 : 50;
    const cw = (G.R - G.L) / (n - 1);
    for (const v of narrow ? [0.01, 0.1, 1] : [0.01, 0.03, 0.1, 0.3, 1]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(G.L, yv(v)); c.lineTo(G.R, yv(v)); c.stroke(); HeroKit.label(c, k, fmt(v, v < 0.1 ? 2 : v < 1 ? 1 : 0), G.L - 6, yv(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    if (!narrow) HeroKit.label(c, k, 'рад/с', G.L - 6, G.T - 9, { align: 'right', px: 10, color: P.ink3, halo: false });
    for (let s = 0; s <= n / 30; s += 2) HeroKit.label(c, k, s + ' с', xf(Math.min(n - 1, s * 30)), PH - 11, { px: 10.5, mono: true, color: P.ink3, halo: false });
    if (st.kf.ok) { c.fillStyle = P.e2e; c.globalAlpha = 0.14; for (let i = 0; i < n; i++) if (st.kf.ok[i]) c.fillRect(xf(i) - cw / 2, G.T, cw + 0.6, G.B - G.T); c.globalAlpha = 1; }
    st.kf.kfs.forEach((f) => { const x = xf(f.f); c.strokeStyle = P.e2e; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, G.T + 6); c.lineTo(x, G.G1); c.stroke(); });
    c.strokeStyle = P.ink2; c.lineWidth = 1.7; c.lineJoin = 'round'; c.beginPath(); for (let i = 0; i < n; i++) { const x = xf(i), y = yv(demo.speed[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    st.kf.kfs.forEach((f, i) => { const x = xf(f.f); c.beginPath(); c.arc(x, G.T, 7.5, 0, 7); c.fillStyle = P.e2e; c.fill(); HeroKit.label(c, k, String(i + 1), x, G.T, { px: 9.5, weight: 800, color: '#fff', halo: false }); });
    if (st.mode === 'stops') {
      const y = yv(st.eps); c.setLineDash([7, 5]); c.strokeStyle = P.e2e; c.lineWidth = 2.2; c.beginPath(); c.moveTo(G.L, y); c.lineTo(G.R, y); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(G.R - 6, y, 5, 0, 7); c.fillStyle = P.e2e; c.fill();
      HeroKit.label(c, k, `порог ${fmt(st.eps, 2)}`, G.R - 16, y + (y < G.T + 30 ? 12 : -11), { align: 'right', px: 11, weight: 700, color: P.e2e, haloColor: P.bg });
    }
    for (let i = 0; i < n; i++) { c.fillStyle = demo.open[i] ? P.grid : P.ink3; c.fillRect(xf(i) - cw / 2, G.G0, cw + 0.6, G.G1 - G.G0); }
    HeroKit.label(c, k, 'захват', G.L - 6, (G.G0 + G.G1) / 2, { align: 'right', px: 10, color: P.ink3, halo: false });
  }
  function out() {
    const s = state(), r = st.res, nk = s.nk;
    const head = `Кадров: <b>${demo.n}</b> · ключевых поз: <b>${nk}</b>` + (nk ? ` — решений в ${Math.round(demo.n / nk)} ${plural(Math.round(demo.n / nk), 'раз', 'раза', 'раз')} меньше` : '');
    let tail;
    if (r.ok) tail = `✓ ${r.msg}`;
    else { const where = /Hit|knock/.test(r.type) ? `на пути к позе ${r.k + 1}: ` : /missGrasp|drop/.test(r.type) ? `в позе ${r.k + 1}: ` : ''; tail = `✗ ${where}${r.msg}`; }
    setOut($('#kOut'), `${head}. Исполнение: <b>${tail}</b>.`);
  }
  function draw() { drawScene(); drawSpeed(); out(); }
  function syncCtl() {
    $('#kEps').value = Math.round(st.eps * 100); syncRange($('#kEps'), `${fmt(st.eps, 2)} рад/с`);
    $('#kGrip').checked = st.grip;
    $$('#kMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.mode)));
  }
  function stopAnim() { animId++; st.anim = null; }
  function setEps(v) { stopAnim(); st.eps = Math.max(0.01, Math.min(0.4, Math.round(v * 100) / 100)); syncCtl(); recompute(); draw(); if (ctl) ctl.update(); }
  function setGrip(b) { stopAnim(); st.grip = !!b; syncCtl(); recompute(); draw(); if (ctl) ctl.update(); }
  function setMode(m) { stopAnim(); st.mode = m; syncCtl(); recompute(); draw(); if (ctl) ctl.update(); }
  /** Проиграть исполнение: захват едет по пути планировщика, чашка — по событиям. */
  function play() {
    const id = ++animId, path = st.res.path, n = path.length;
    let len = 0; const cum = [0]; for (let i = 1; i < n; i++) { len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); cum.push(len); }
    const pauses = new Set(st.res.ev.map((e) => e.i).concat(st.res.segs.map((s) => s.i1).filter((v) => v != null)));
    return new Promise((resolve) => {
      if (HeroKit.reduced() || SPEED.k >= 50) { st.anim = null; st.done = true; draw(); resolve(state()); return; }
      const v = 0.42 * SPEED.k; let t0 = null, i = 0, hold = 0, last = 0;
      st.anim = { i: 0 };
      const tick = (now) => {
        if (id !== animId) { resolve(state()); return; }
        if (t0 == null) { t0 = now; last = now; }
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (hold > 0) hold -= dt;
        else { const target = cum[i] + v * dt; while (i < n - 1 && cum[i + 1] <= target) { i++; if (pauses.has(i)) { hold = 0.18 / SPEED.k; break; } } }
        st.anim.i = i; drawScene();
        if (i >= n - 1 && hold <= 0) { st.anim = null; st.done = true; draw(); resolve(state()); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const api = {
    reset() { stopAnim(); st.eps = 0.04; st.grip = true; st.mode = 'stops'; syncCtl(); recompute(); draw(); },
    state, setEps, setGrip, setMode, play, band: () => Object.assign({}, band),
  };
  const roleList = () => 'перед чашкой, захват, подъём над чайником, перед полкой, отпускание, отвод руки';
  const missions = [
    { short: 'Порог', title: 'Найди остановки', text: 'Внизу — скорость самого быстрого сустава по кадрам демонстрации. Кадр ключевой, если скорость ниже порога, а захват не меняет состояние. При пороге 0,04 рад/с не найдена остановка, где оператор отпускает чашку на полке: захват разжимается уже при отводе руки, и чашка падает. Подбери порог так, чтобы ключевые позы поймали все остановки и ничего лишнего.',
      controls: ['eps'], onEnter: (X) => { X.setGrip(true); X.setMode('stops'); },
      criteria: [
        { label: 'Захват чашки — ключевая поза', test: (r, s) => s.roles.grasp },
        { label: 'Отпускание на полке — ключевая поза', test: (r, s) => s.roles.place },
        { label: 'По ключевым позам планировщик ставит чашку на полку', test: (r, s) => s.ok && s.mode === 'stops' },
        { label: 'Ключевых поз не больше шести', test: (r, s) => s.nk > 0 && s.nk <= LIMIT6 },
      ],
      hint: 'Тяни пунктир порога на графике. В остановках дрожь руки не должна подниматься выше порога, а заминка оператора над чайником не должна опускаться ниже.',
      explain: () => `Шесть поз: ${roleList()}. Политике остаётся шесть решений вместо ${demo.n}. Подходит порог от ${fmt(band.lo, 2)} до ${fmt(band.hi, 2)} рад/с. Ниже дрожь руки сначала дробит остановку перед полкой на две, потом теряется остановка, где чашку отпускают, и она падает, а при самом низком пороге пропадает и захват чашки. Выше ключевой становится заминка оператора над чайником: лишнее решение посреди пути. Нажми «Проиграть», чтобы увидеть исполнение.` },
    { short: 'Захват', title: 'Только скорость', text: 'Уберём второе условие: ключевая поза — любая остановка, даже если в ней сжимается захват. Порог оставим прежним.',
      controls: ['eps', 'grip'], onEnter: (X) => { X.setMode('stops'); X.setGrip(true); if (!inBand()) X.setEps(0.12); },
      bet: { q: 'что изменится, если искать остановки только по скорости?', options: ['Ничего: остановки те же', 'Захват сожмётся не там, где чашка', 'Ключевых поз станет вдвое больше'], answer: (r) => (r.ok ? 0 : r.type === 'missGrasp' ? 1 : r.nk >= 10 ? 2 : 1) },
      action: { label: 'Убрать условие и проиграть', run: (X) => { X.setGrip(false); return X.play(); } },
      criteria: [{ label: 'Условие про захват выключено', test: (r) => !r.grip }],
      explain: (r) => `${r.ok ? 'Чашка доехала.' : 'Захват сжался в воздухе над чайником, и чашка осталась на столе.'} У чашки рука стоит на месте, пока сжимается захват. Без второго условия вся эта остановка — одна, и ключевая поза — её первый кадр, когда захват ещё открыт. Следующая поза — над чайником, уже со сжатым захватом, поэтому планировщик сжимает его там. Условие про захват разрезает остановку: кадры, где захват меняет состояние, не считаются, и поза берётся после того, как он сжался. Включи условие снова и проиграй: чашка встанет на полку.` },
    { short: 'Промежутки', title: 'Равные промежутки', text: 'Может быть, остановки не нужны и хватит шести поз через равные промежутки времени? Условие про захват вернём.',
      controls: ['mode'], onEnter: (X) => { X.setGrip(true); if (!inBand()) X.setEps(0.12); X.setMode('stops'); },
      bet: { q: 'сработают ли шесть поз через равные промежутки?', options: ['Да: поз столько же, планировщик довезёт', 'Нет: позы не попадут туда, где захват сжимается и разжимается', 'Да, но рука поедет медленнее'], answer: (r) => (r.ok ? 0 : 1) },
      action: { label: 'Проиграть равные промежутки', run: (X) => { X.setMode('interval'); return X.play(); } },
      criteria: [{ label: 'Позы через равные промежутки', test: (r) => r.mode === 'interval' }],
      explain: (r) => `${r.ok ? 'Чашка доехала: промежутки случайно совпали с остановками.' : `Не вышло: ${r.msg}.`} Поза 2 пришлась на подъезд к чашке, когда захват ещё открыт, а поза 3 — на путь над чайником, где он уже сжат. Планировщик сжал захват в воздухе. В статье ключевые позы через равные промежутки или в случайных кадрах дают нулевой успех на задаче с ящиком: важно не число поз, а то, что они попадают в те моменты, где решается задача: захват, отпускание, обход препятствия.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй порог, условие про захват и способ выбора поз, проигрывай исполнение. Найди порог, при котором поз больше всего, а чашка всё равно встаёт на полку, и посмотри, где появились лишние позы.', final: true },
  ];
  function init() {
    legend('#kLegend', [['демонстрация', 'var(--ink-3)', 'dash'], ['ключевая поза', 'var(--e2e)', 'dot'], ['путь планировщика', 'var(--classic)'], ['кадр — кандидат в остановку', 'color-mix(in srgb, var(--e2e) 30%, transparent)', 'sq']]);
    $('#kEps').addEventListener('input', (e) => setEps(+e.target.value / 100));
    $('#kGrip').addEventListener('change', (e) => setGrip(e.target.checked));
    $('#kMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !(ctl && ctl.busy)) setMode(b.dataset.v); });
    $('#kPlay').addEventListener('click', () => { if (!(ctl && ctl.busy)) play(); });
    HeroKit.drag($('#kSpd'), PW, PH, {
      hit: (p) => (st.mode === 'stops' && Math.abs(p.y - yv(st.eps)) < 16 && p.x > G.L - 10 ? 'thr' : null),
      move: (o, p) => setEps(vy(Math.max(G.T, Math.min(G.B, p.y)))),
      tap: (p) => { if (st.mode === 'stops' && p.y >= G.T && p.y <= G.B && p.x >= G.L) setEps(vy(p.y)); },
      tapCursor: 'ns-resize',
    });
    recompute(); syncCtl();
    ctl = mountMissions('#kMis', missions, api, { controls: { eps: '#wrapKEps', grip: '#wrapKGrip', mode: '#kMode' } });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, demo, band };
})();

/* ---------- 2. Следующий лучший воксель ---------- */
const LabVox = (() => {
  const E = L22, CW = 320, N = E.VN, NT = 30;
  const SHOW = E.voxScene(5);
  const demos = E.voxDemos(24, 400);
  const VIEWS = { iso: { th: -0.62, ph: 0.52 }, front: { th: 0, ph: 0.03 }, top: { th: 0, ph: Math.PI / 2 - 0.004 } };
  const st = { cmd: 'any', view: 'iso', th: VIEWS.iso.th, ph: VIEWS.iso.ph, K: 8, scene: 0, models: {}, cur: null, reg: null, trained: false, training: false, seenUpper: false, seenLower: false, ev: null, evK: null, allowAuto: false, prog: null };
  let ctl = null, cache = null, rafPending = false;
  const sceneAt = (i) => (i === 0 ? SHOW : E.voxScene(7000 + i - 1));
  const modelNow = () => st.models[st.K] || null;
  /** Результаты обеих моделей на текущей сцене и команде (с кэшем: при повороте сцены не пересчитываем). */
  function results() {
    const m = modelNow() || (st.training ? st.cur : null), key = [st.scene, st.K, st.cmd, m ? m.t : -1, st.reg ? 1 : 0].join('|');
    if (cache && cache.key === key) return cache;
    const sc = sceneAt(st.scene); let cls = null, reg = null;
    if (m) {
      const fx = E.features(sc, m.K), { q, p } = E.voxQ(m, sc, st.cmd, fx), a = E.voxArgmax(q, 11 + st.scene * 2 + (st.cmd === 'upper' ? 0 : 1));
      let pu = 0, pl = 0, pm = 0; for (let i = 0; i < p.length; i++) { const s = E.shelfOf(sc, i); if (s === 'upper') pu += p[i]; else if (s === 'lower') pl += p[i]; if (p[i] > pm) pm = p[i]; }
      cls = { p, a, shelf: E.shelfOf(sc, a), pu, pl, pm };
    }
    if (st.reg) { const pt = E.regPredict(st.reg, sc, st.cmd); reg = { pt, where: E.regWhere(sc, pt) }; }
    cache = { key, sc, cls, reg };
    if (cls && !st.training) { if (st.cmd === 'upper' && cls.shelf === 'upper') st.seenUpper = true; if (st.cmd === 'lower' && cls.shelf === 'lower') st.seenLower = true; }
    return cache;
  }
  function state() {
    const R = results(), reg = R.reg, cls = R.cls;
    return { cmd: st.cmd, K: st.K, scene: st.scene, trained: !!modelNow() && !!st.reg, clsShelf: cls ? cls.shelf : null, pu: cls ? cls.pu : 0, pl: cls ? cls.pl : 0,
      regShelf: reg ? reg.where.shelf : null, regGapCm: reg ? reg.where.gap * E.VS * 100 : null, regBelow: reg ? reg.where.below : null, regZ: reg ? reg.pt[2] : null,
      seenUpper: st.seenUpper, seenLower: st.seenLower, ev: st.ev ? { K: st.evK, ok: st.ev.upper + st.ev.lower, upper: st.ev.upper, lower: st.ev.lower, rate: st.ev.rate } : null };
  }

  /* --- 3D: проекция и рисование вокселей --- */
  const FACES = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], sh: 0.8 },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], sh: 0.8 },
    { n: [0, 1, 0], v: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], sh: 0.9 },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], sh: 0.9 },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], sh: 1.0 },
  ];
  function camera(W) {
    const c = Math.cos(st.th), s = Math.sin(st.th), cp = Math.cos(st.ph), sp = Math.sin(st.ph), cx = N / 2, cy = N / 2;
    const P = (x, y, z) => { const xx = x - cx, yy = y - cy, xr = xx * c + yy * s, yr = -xx * s + yy * c; return [xr, -z * cp - yr * sp, yr * cp - z * sp]; };
    let mu = 1e9, Mu = -1e9, mv = 1e9, Mv = -1e9;
    for (const x of [0, N]) for (const y of [0, N]) for (const z of [0, 15]) { const p = P(x, y, z); mu = Math.min(mu, p[0]); Mu = Math.max(Mu, p[0]); mv = Math.min(mv, p[1]); Mv = Math.max(Mv, p[1]); }
    const pad = 16, sc = Math.min((W - 2 * pad) / (Mu - mu), (W - 2 * pad) / (Mv - mv)), ou = W / 2 - sc * (mu + Mu) / 2, ov = W / 2 - sc * (mv + Mv) / 2;
    return { P, S: (x, y, z) => { const p = P(x, y, z); return [ou + sc * p[0], ov + sc * p[1]]; }, D: (x, y, z) => P(x, y, z)[2], sc, t: [s * cp, -c * cp, sp] };
  }
  function face(c, cam, x, y, z, f) { c.beginPath(); f.v.forEach((d, i) => { const [u, v] = cam.S(x + d[0], y + d[1], z + d[2]); i ? c.lineTo(u, v) : c.moveTo(u, v); }); c.closePath(); }
  function drawVox(sel, mode) {
    const cv = $(sel), { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), R = results(), sc = R.sc, occ = sc.occ, cam = camera(CW), Wd = WOOD(), C = CUPC();
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CW);
    // стол — плоскость z = 1 с сеткой вокселей
    c.fillStyle = P.bg2; face(c, cam, 0, 0, 0, { v: [[0, 0, 1], [N, 0, 1], [N, N, 1], [0, N, 1]] }); c.fill();
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i <= N; i++) { let [a, b] = cam.S(i, 0, 1), [d, e] = cam.S(i, N, 1); c.moveTo(a, b); c.lineTo(d, e); [a, b] = cam.S(0, i, 1); [d, e] = cam.S(N, i, 1); c.moveTo(a, b); c.lineTo(d, e); }
    c.stroke();
    const vis = FACES.filter((f) => f.n[0] * cam.t[0] + f.n[1] * cam.t[1] + f.n[2] * cam.t[2] > 1e-6);
    const items = [];
    for (let z = 1; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = occ[E.vi(x, y, z)]; if (v) items.push({ x, y, z, v, d: cam.D(x + 0.5, y + 0.5, z + 0.5) }); }
    const cls = R.cls;
    if (mode === 'cls' && cls) for (let i = 0; i < cls.p.length; i++) { const a = cls.p[i] / cls.pm; if (a < 0.05 || occ[i]) continue; const [x, y, z] = E.vxyz(i); items.push({ x, y, z, heat: a, d: cam.D(x + 0.5, y + 0.5, z + 0.5) }); }
    items.sort((a, b) => b.d - a.d);
    const isOcc = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N && occ[E.vi(x, y, z)] && z > 0;
    for (const it of items) {
      if (it.heat != null) {
        for (const f of vis) { face(c, cam, it.x, it.y, it.z, f); c.fillStyle = shade(P.e2e, 0.82 + 0.18 * f.sh, 0.12 + 0.62 * Math.pow(it.heat, 0.7)); c.fill(); }
        continue;
      }
      const base = it.v === E.OCC.shelf ? Wd.fill : it.v === E.OCC.cup ? C.fill : P.ink3, edge = it.v === E.OCC.shelf ? Wd.edge : it.v === E.OCC.cup ? C.edge : P.ink2;
      for (const f of vis) {
        if (isOcc(it.x + f.n[0], it.y + f.n[1], it.z + f.n[2])) continue;
        face(c, cam, it.x, it.y, it.z, f); c.fillStyle = shade(base, f.sh); c.fill(); c.strokeStyle = edge; c.lineWidth = 0.6; c.stroke();
      }
    }
    const lab = (t, x, y, z, o) => { const [u, v] = cam.S(x, y, z); HeroKit.label(c, k, t, u, v, Object.assign({ px: 10.5, color: P.ink3, haloColor: P.bg }, o || {})); };
    if (st.ph < 1.2) { lab('верхняя', sc.x0 - 0.2, sc.y0, E.SH.b[1] + 1.5, { align: 'right' }); lab('нижняя', sc.x0 - 0.2, sc.y0, E.SH.b[0] + 1.5, { align: 'right' }); }
    if (mode === 'cls' && winOn()) {             // окно по высоте: столбец, который видит классификатор
      const [x, y, z] = E.vxyz(cls ? cls.a : sc.target[st.cmd === 'lower' ? 'lower' : 'upper']), z0 = Math.max(0, z - st.K), z1 = Math.min(N, z + st.K + 1);
      for (let zz = z0; zz < z1; zz++) for (const f of vis) { face(c, cam, x, y, zz, f); c.fillStyle = shade(P.cl, 1, zz === z ? 0.28 : 0.13); c.fill(); c.strokeStyle = shade(P.cl, 1, 0.55); c.lineWidth = 0.7; c.stroke(); }
      const box = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      c.setLineDash([4, 3]); c.strokeStyle = P.cl; c.lineWidth = 1.8; c.beginPath();
      for (const zz of [z0, z1]) box.forEach(([a, b], i) => { const [u, v] = cam.S(a, b, zz); i ? c.lineTo(u, v) : c.moveTo(u, v); if (i === 3) { const [u0, v0] = cam.S(box[0][0], box[0][1], zz); c.lineTo(u0, v0); } });
      for (const [a, b] of box) { const [u0, v0] = cam.S(a, b, z0), [u1, v1] = cam.S(a, b, z1); c.moveTo(u0, v0); c.lineTo(u1, v1); }
      c.stroke(); c.setLineDash([]);
      const [u, v] = cam.S(x + 1, y, z1); HeroKit.label(c, k, `окно ±${st.K}`, u + 6, v, { px: 11, weight: 700, color: P.cl, align: 'left', haloColor: P.bg });
    }
    if (mode === 'cls') {
      if (cls) {
        const [x, y, z] = E.vxyz(cls.a); c.lineWidth = 2.4; c.strokeStyle = P.ink;
        for (const f of vis) { face(c, cam, x, y, z, f); c.stroke(); }
        const [u, v] = cam.S(x + 0.5, y + 0.5, z + 1.2); HeroKit.label(c, k, 'выбор', u, v - 9, { px: 11, weight: 700, color: P.ink });
      } else HeroKit.label(c, k, st.training ? 'обучается…' : `окно ±${st.K}: модель не обучена`, CW / 2, 18, { px: 11.5, weight: 700, color: P.ink3 });
    } else {
      if (R.reg) {
        const [px, py, pz] = R.reg.pt, cxv = px + 0.5, cyv = py + 0.5, czv = pz + 0.5, zs = R.reg.where.below + 1;
        const [u0, v0] = cam.S(cxv, cyv, czv), [u1, v1] = cam.S(cxv, cyv, zs);
        c.setLineDash([3, 3]); c.strokeStyle = P.ink; c.lineWidth = 1.6; c.beginPath(); c.moveTo(u0, v0); c.lineTo(u1, v1); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.ellipse(u1, v1, 0.35 * cam.sc, 0.35 * cam.sc * Math.max(0.15, Math.sin(st.ph)), 0, 0, 7); c.strokeStyle = P.ink; c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.arc(u0, v0, Math.max(5, 0.42 * cam.sc), 0, 7); c.fillStyle = P.ink; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
        HeroKit.label(c, k, R.reg.where.shelf ? 'точка регрессии' : 'точка регрессии — в воздухе', u0, v0 - Math.max(5, 0.42 * cam.sc) - 10, { px: 11, weight: 700, color: P.ink });
      } else HeroKit.label(c, k, 'регрессия не обучена', CW / 2, 18, { px: 11.5, weight: 700, color: P.ink3 });
    }
  }
  const SHELF_RU = { upper: 'верхней полке', lower: 'нижней полке' };
  function out() {
    const R = results(); let s = '';
    if (st.ev && st.evK === st.K) s += `Окно ±${st.K}: полка верная в <b>${st.ev.upper + st.ev.lower} проверках из ${2 * NT}</b> (по команде «на верхнюю» — ${st.ev.upper} из ${NT}, «на нижнюю» — ${st.ev.lower} из ${NT}). `;
    if (!R.reg && !R.cls) { setOut($('#vOut'), s + 'Модели не обучены. Демонстраций — 24, по 8 на каждую команду; для команды «на полку» — 4 на верхнюю полку и 4 на нижнюю.'); return; }
    if (R.reg) { const w = R.reg.where; s += w.shelf ? `Регрессия: на ${SHELF_RU[w.shelf]}. ` : `Регрессия: <b>в ${fmt(w.gap * E.VS * 100, 1)} см над ${w.below === E.SH.b[0] ? 'нижней полкой' : w.below === E.SH.b[1] ? 'верхней полкой' : w.below === 0 ? 'столом' : 'опорой'}</b> — чашку отпустят в воздухе. `; }
    if (R.cls) s += `Классификатор: ${R.cls.shelf ? `воксель на <b>${SHELF_RU[R.cls.shelf]}</b>` : '<b>воксель не на полке</b>'}; вероятность на полках: верхняя ${pc(R.cls.pu)}, нижняя ${pc(R.cls.pl)}.`;
    if (st.scene > 0 && R.cls && st.cmd !== 'any') s += ` Сцена проверки ${st.scene}: ${R.cls.shelf === st.cmd ? '✓' : '✗'}.`;
    setOut($('#vOut'), s);
  }
  function drawCmd() {
    const t = E.CMD_TEXT[st.cmd];
    $('#vCmd').innerHTML = `Команда: <b>«${t}»</b>` + (st.cmd === 'any' ? ' <span class="tag-note">в демонстрациях — то верхняя, то нижняя</span>' : '');
  }
  const winOn = () => !$('#vWinBox').hidden;
  /** Что попадает в окно ±K для трёх мест: на столе перед стеллажом, на нижней и на верхней полке. */
  function winCols() {
    const sc = sceneAt(st.scene), occ = sc.occ, K = st.K, tx = sc.x0 + 4, ty = sc.y0 + 2;
    return [['на столе', tx, sc.y0 - 1, 1], ['на нижней полке', tx, ty, E.SH.b[0] + 1], ['на верхней полке', tx, ty, E.SH.b[1] + 1]].map(([name, x, y, z]) => {
      const cells = []; for (let d = K; d >= -K; d--) { const zz = z + d; cells.push({ d, v: zz < 0 || zz >= N ? -1 : occ[E.vi(x, y, zz)] }); }
      return { name, cells, code: cells.map((q) => (q.v > 0 ? 1 : 0)).join('') };
    });
  }
  function drawWin() {
    if (!winOn()) return;
    const cols = winCols(), K = st.K, n = 2 * K + 1, box = $('#vWin');
    box.innerHTML = '';
    for (const col of cols) {
      const stack = h('div', { class: 'win-stack' });
      for (const q of col.cells) stack.append(h('i', { class: 'wc ' + (q.d === 0 ? 'me' : q.v < 0 ? 'out' : q.v === E.OCC.shelf ? 'wood' : q.v === E.OCC.table ? 'table' : q.v > 0 ? 'cup' : 'empty') }));
      box.append(h('div', { class: 'win-col' }, stack, h('div', { class: 'win-cap' }, col.name)));
    }
    $('#vWinH').textContent = `Окно ±${K}: ${n} ${plural(n, 'воксель', 'вокселя', 'вокселей')} по высоте, по ${K * 5} см вверх и вниз от места, куда ставят чашку`;
    const [T, L, U] = cols, same = T.code === L.code && L.code === U.code, diff = T.code !== L.code && L.code !== U.code && T.code !== U.code;
    const edge = cols[0].cells.some((q) => q.v < 0) ? ' Ниже стола сетка кончается, и там модель видит пустоту.' : '';
    setOut($('#vWinNote'), same ? `Для классификатора все три места одинаковы: опора снизу, сверху пусто. Отличить полку от стола он не может и угадывает.${edge}`
      : diff ? `Все три места выглядят по-разному: окно достаёт до следующей доски сверху, а под нижней полкой — до стола.${edge}`
      : `Часть мест ещё не различить: ${[[T, L], [L, U], [T, U]].filter(([a, b]) => a.code === b.code).map(([a, b]) => `${a.name} и ${b.name}`).join(', ')} выглядят одинаково.${edge}`);
  }
  function draw() { drawCmd(); drawVox('#vReg', 'reg'); drawVox('#vCls', 'cls'); drawWin(); out(); }
  const schedule = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; drawVox('#vReg', 'reg'); drawVox('#vCls', 'cls'); }); };
  function sync() {
    $$('#vCmdSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.cmd)));
    $$('#vView button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.view)));
    $('#vK').value = st.K; syncRange($('#vK'), `±${st.K} ${plural(st.K, 'воксель', 'вокселя', 'вокселей')}`);
    $('#vScene').value = st.scene; syncRange($('#vScene'), st.scene ? `${st.scene} из ${NT}` : 'пример');
  }
  async function trainK(K) {
    if (st.models[K]) return st.models[K];
    const m = E.clsInit(K); st.cur = m; st.training = true;
    await runGen(E.clsTrain(m, demos), Math.max(1, Math.round(2 * SPEED.k)), () => { cache = null; draw(); });
    st.training = false; st.models[K] = m; cache = null;
    return m;
  }
  async function train() {
    if (!st.reg) st.reg = E.regTrain(demos);
    await trainK(st.K); cache = null; draw(); if (ctl) ctl.update();
    return state();
  }
  async function evaluate() {
    await trainK(st.K); await nextFrame();
    st.ev = E.voxEval(st.models[st.K], NT, 7000); st.evK = st.K; st.allowAuto = true; cache = null; draw(); if (ctl) ctl.update();
    return { K: st.K, rate: st.ev.rate, ok: st.ev.upper + st.ev.lower, upper: st.ev.upper, lower: st.ev.lower };
  }
  function setCmd(c) { st.cmd = c; cache = null; sync(); draw(); if (ctl) ctl.update(); }
  function setView(v) { st.view = v; st.th = VIEWS[v].th; st.ph = VIEWS[v].ph; sync(); draw(); }
  function setK(K) { st.K = K; cache = null; sync(); draw(); if (ctl) ctl.update(); if (!st.models[K] && st.allowAuto && st.reg) trainK(K).then(() => { draw(); if (ctl) ctl.update(); }); }
  function setScene(i) { st.scene = i; cache = null; sync(); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.cmd = 'any'; st.K = 8; st.scene = 0; st.ev = null; st.evK = null; st.seenUpper = st.seenLower = false; st.allowAuto = false; cache = null; setView('iso'); sync(); draw(); },
    state, train, evaluate, setCmd, setView, setK, setScene,
    resetSeen() { st.seenUpper = st.seenLower = false; },
  };
  const missions = [
    { short: 'Две полки', title: 'Одна команда, две полки', text: 'Команда — «поставь чашку на полку». В половине демонстраций оператор ставил чашку на верхнюю полку, в половине — на нижнюю. Обучи обе модели: слева появится точка регрессии, справа — оценки вокселей и выбранный воксель.',
      onEnter: (X) => X.setCmd('any'),
      bet: { q: 'куда регрессия поставит чашку?', options: ['На верхнюю полку', 'На ту полку, куда ставили чаще', 'Между полками, в воздух'], answer: (r) => (r.regShelf === 'upper' ? 0 : r.regShelf ? 1 : 2) },
      action: { label: 'Обучить обе модели', run: (X) => X.train() },
      criteria: [{ label: 'Классификатор выбрал воксель на одной из полок', test: (r) => !!r.clsShelf }],
      explain: (r) => `Регрессия выдала точку в ${fmt(r.regGapCm, 1)} см над нижней полкой: это среднее двух верных ответов, и чашку отпустили бы в воздухе. У классификатора два пика: ${pc(r.pu)} вероятности на верхней полке и ${pc(r.pl)} на нижней, и он выбрал ${r.clsShelf === 'upper' ? 'верхнюю' : 'нижнюю'}. Это та же история, что с двумя кубиками в уроке 2.1, только среднее теперь висит между полками. У PerAct тоже бывает несколько пиков, когда подходят несколько предметов: в статье это показано на задаче «сложи 3 жёлтых блока».` },
    { short: 'Команда', title: 'Команда выбирает полку', text: 'Теперь команда называет полку. Переключи её на «верхнюю» и на «нижнюю» и посмотри, куда переходит пик. Сцену можно поворачивать мышью или пальцем.',
      controls: ['cmd', 'view'], onEnter: (X) => X.resetSeen(),
      criteria: [{ label: 'По команде «на верхнюю» выбран воксель на верхней полке', test: (r, s) => s.seenUpper }, { label: 'По команде «на нижнюю» — на нижней полке', test: (r, s) => s.seenLower }],
      hint: 'Включи вид сверху: обе полки — один столбец вокселей.',
      explain: () => 'Команда меняет вектор весов, и пик переходит на названную полку. Регрессия с командой тоже попадает на полку: верный ответ теперь один. Сверху обе полки — один столбец, поэтому карте стола из урока 2.1 пришлось бы искать высоту отдельно. В PerAct команду кодирует текстовый энкодер CLIP, и одна модель учит 18 задач с 249 вариациями. Без команды она работает на уровне случайного выбора: не знает, какой ящик открыть и на какую полку ставить.' },
    { short: 'Поле зрения', title: 'Сколько сцены нужно видеть', text: 'Классификатор оценивает воксель по столбцу над и под ним. Сейчас окно ±8 вокселей, по 40 см вверх и вниз. Сузим его до ±1, то есть до соседей сверху и снизу. Под сценой видно, что попадает в окно на столе и на каждой полке. Обучи модель и проверь на 30 новых сценах по командам «на верхнюю» и «на нижнюю». Потом найди самое узкое окно, при котором верны все 60 проверок.',
      controls: ['k', 'win'], onEnter: (X) => { X.setCmd('upper'); X.setK(1); },
      bet: { q: 'что будет с окном ±1?', options: ['Ничего: полку и так видно', 'Модель спутает полки друг с другом и со столом', 'Модель перестанет обучаться'], answer: (r) => (r.rate >= 0.9 ? 0 : 1) },
      action: { label: 'Обучить и проверить', run: (X) => X.evaluate() },
      criteria: [{ label: 'Окно уже ±8', test: (r) => r.K < 8 }, { label: 'Полка верная во всех 60 проверках', test: (r) => r.ok === 2 * NT }],
      summary: (r) => `±${r.K}: ${r.ok} из ${2 * NT}`,
      fail: (r) => (r.ok < 2 * NT ? `Окно ±${r.K}: верно в ${r.ok} проверках из ${2 * NT}. Расширь окно ползунком и проверь снова.` : 'Все проверки верны, но окно не уже прежнего: сузь его.'),
      explain: (r) => `Окно ±${r.K} справилось. Самое узкое рабочее окно — ±4 вокселя, по 20 см вверх и вниз. С окном ±1–3 стол и обе полки выглядят одинаково: опора снизу и пустота сверху, и модель угадывает примерно в трети проверок. С окном ±4 видно, что над полкой через 20 см следующая доска, а над столом пусто, и что под нижней полкой стол, а под верхней — пустое отделение. Настоящей сети такие подсказки нужно найти самой, поэтому ей нужна вся сцена.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй команду, окно и сцену проверки, поворачивай сцену. Найди сцену, где с окном ±3 модель выбирает стол, и посмотри, чем этот воксель похож на полку.', final: true,
      onEnter: () => { st.allowAuto = true; if (!st.reg) st.reg = E.regTrain(demos); if (!st.models[st.K]) trainK(st.K).then(() => { draw(); }); } },
  ];
  function init() {
    legend('#vLegend', [['оценка вокселя', 'var(--e2e)', 'cube'], ['выбранный воксель', 'var(--ink)', 'cube'], ['точка регрессии', 'var(--ink)', 'dot'], ['стеллаж', WOOD().fill, 'sq'], ['чашка', CUPC().fill, 'sq'], ['захват руки Ады', 'var(--ink-3)', 'cube']]);
    $('#vCmdSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !(ctl && ctl.busy)) setCmd(b.dataset.v); });
    $('#vView').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
    $('#vK').addEventListener('input', (e) => { if (!(ctl && ctl.busy)) setK(+e.target.value); else sync(); });
    $('#vScene').addEventListener('input', (e) => setScene(+e.target.value));
    for (const sel of ['#vReg', '#vCls']) {
      const cv = $(sel); let down = null;
      cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, th: st.th, ph: st.ph }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } cv.classList.add('grabbing'); });
      cv.addEventListener('pointermove', (e) => {
        if (!down) return;
        st.th = down.th + (e.clientX - down.x) * 0.012; st.ph = Math.max(0.03, Math.min(Math.PI / 2 - 0.004, down.ph + (e.clientY - down.y) * 0.01));
        st.view = null; $$('#vView button').forEach((b) => b.setAttribute('aria-pressed', 'false')); schedule();
      });
      const up = () => { down = null; cv.classList.remove('grabbing'); };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }
    sync();
    legend('#vWinLegend', [['место для чашки', 'var(--classic)', 'sq'], ['доска стеллажа', WOOD().fill, 'sq'], ['стол', 'var(--ink-3)', 'sq']]);
    ctl = mountMissions('#vMis', missions, api, { controls: { cmd: '#vCmdSeg', view: '#vView', k: '#wrapVK', scene: '#wrapVScene', win: '#vWinBox' }, scene: '#vReg', onStep: () => draw() });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- 3. Сколько стоит внимание ---------- */
const LabCost = (() => {
  const E = L22, W = 640, H = 236, RW = 640, RH = 176, LIMIT = 16e9;
  const st = { G: 100, p: 1, L: 2048, step: 5, joint: false, revealed: false };
  let ctl = null;
  function state() {
    const f = E.attnCost(st.G, st.p, 'full', st.L), q = E.attnCost(st.G, st.p, 'perceiver', st.L);
    return { G: st.G, p: st.p, L: st.L, N: f.N, fullBytes: f.bytes, percBytes: q.bytes, fullEx: f.perEx, percEx: q.perEx, revealed: st.revealed, step: st.step, joint: st.joint, rot: E.rotOutputs(st.step, st.joint), rotAxis: E.rotOutputs(st.step, false), rotJoint: E.rotOutputs(st.step, true) };
  }
  function drawMem() {
    const cv = $('#pCv'), { c, k } = HeroKit.fit(cv, W, H), P = pal(), s = state();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const L = 172, R = W - 20, lo = 6, hi = 17, top = 22, bot = H - 30;
    const xb = (b) => L + (R - L) * (Math.log10(Math.max(b, 1e6)) - lo) / (hi - lo);
    for (const [v, t] of [[1e6, '1 МБ'], [1e9, '1 ГБ'], [1e12, '1 ТБ'], [1e15, '1 ПБ']]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(xb(v), top - 8); c.lineTo(xb(v), bot); c.stroke(); HeroKit.label(c, k, t, xb(v), bot + 14, { px: 10.5, mono: true, color: P.ink3, halo: false }); }
    const xl = xb(LIMIT); c.setLineDash([5, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.8; c.beginPath(); c.moveTo(xl, top - 8); c.lineTo(xl, bot); c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, 'видеокарта 16 ГБ', xl + 5, top - 4, { px: 10.5, weight: 700, color: P.bad, align: 'left', haloColor: P.bg });
    const rows = [
      { name: 'Все со всеми', sub: `${big(s.N * s.N)} пар на слой`, b: s.fullBytes, col: P.ink3 },
      { name: 'Perceiver', sub: `${int(s.L)} латентов`, b: s.percBytes, col: P.e2e },
    ];
    rows.forEach((r, i) => {
      const y = top + 26 + i * 76, bh = 30;
      HeroKit.label(c, k, r.name, L - 12, y + 6, { px: 12.5, weight: 700, color: P.ink, align: 'right', halo: false });
      HeroKit.label(c, k, r.sub, L - 12, y + 24, { px: 10.5, color: P.ink3, align: 'right', halo: false });
      if (!s.revealed) { HeroKit.label(c, k, '?', L + 16, y + 15, { px: 15, weight: 800, color: P.ink3, halo: false }); return; }
      const x1 = Math.max(L + 4, xb(r.b)); rr(c, L, y, x1 - L, bh, 5); c.fillStyle = r.col; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
      const fits = r.b <= LIMIT, t = `${bytes(r.b)} ${fits ? '✓ помещается' : '✗ не помещается'}`, inside = x1 > R - 150;
      HeroKit.label(c, k, t, inside ? x1 - 8 : x1 + 8, y + bh / 2, { px: 12, weight: 700, align: inside ? 'right' : 'left', color: inside ? '#fff' : (fits ? P.good : P.bad), halo: !inside, haloColor: P.bg });
    });
  }
  function drawRot() {
    const cv = $('#pRot'), { c, k } = HeroKit.fit(cv, RW, RH), P = pal(), s = state();
    c.fillStyle = P.bg; c.fillRect(0, 0, RW, RH);
    const L = 172, R = RW - 20, hi = 9, top = 14, bot = RH - 26, xb = (v) => L + (R - L) * Math.log10(Math.max(v, 1)) / hi;
    for (const [v, t] of [[1, '1'], [1e3, '10³'], [1e6, '10⁶'], [1e9, '10⁹']]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(xb(v), top - 4); c.lineTo(xb(v), bot); c.stroke(); HeroKit.label(c, k, t, xb(v), bot + 13, { px: 10.5, mono: true, color: P.ink3, halo: false }); }
    const rows = [['Перенос', `воксели ${s.G}³`, Math.pow(s.G, 3), P.ink3], ['Поворот', s.joint ? `все сочетания, шаг ${s.step}°` : `3 оси по ${Math.round(360 / s.step)} корзин`, s.rot, P.e2e], ['Захват', 'открыт или сжат', 2, P.ink3], ['Столкновения', 'обходить или нет', 2, P.ink3]];
    rows.forEach(([n, sub, v, col], i) => {
      const y = top + i * 34, bh = 18;
      HeroKit.label(c, k, n, L - 12, y + 5, { px: 12, weight: 700, color: P.ink, align: 'right', halo: false });
      HeroKit.label(c, k, sub, L - 12, y + 19, { px: 10, color: P.ink3, align: 'right', halo: false });
      const x1 = Math.max(L + 3, xb(v)); rr(c, L, y + 2, x1 - L, bh, 4); c.fillStyle = col; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
      HeroKit.label(c, k, int(v), x1 + 7, y + 2 + bh / 2, { px: 11.5, weight: 700, align: 'left', color: P.ink, haloColor: P.bg });
    });
  }
  function out() {
    const s = state();
    const tok = st.p === 1 ? `каждый воксель — токен: ${int(s.N - E.LANG)}` : `патчи 5 × 5 × 5: (${st.G}/5)³ = ${int(s.N - E.LANG)}`;
    setOut($('#pOut'), `Сетка ${st.G}³, ${tok} + 77 токенов текста = <b>${int(s.N)} токенов</b>. ` + (s.revealed ? `Оценок внимания за пример: все со всеми — ${big(s.fullEx)}, Perceiver — ${big(s.percEx)}.` : 'Нажми «Посчитать», чтобы увидеть память.'));
  }
  function draw() { drawMem(); drawRot(); out(); }
  function sync() {
    $('#pG').value = st.G; syncRange($('#pG'), `${st.G}³`);
    $$('#pPatch button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === st.p)));
    $$('#pLat button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === st.L)));
    $$('#pStep button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === st.step)));
    $$('#pJoint button').forEach((b) => b.setAttribute('aria-pressed', String(!!+b.dataset.v === st.joint)));
  }
  const upd = () => { sync(); draw(); if (ctl) ctl.update(); };
  const api = {
    reset() { Object.assign(st, { G: 100, p: 1, L: 2048, step: 5, joint: false, revealed: false }); upd(); },
    state,
    setG(v) { st.G = v; upd(); }, setPatch(v) { st.p = v; upd(); }, setLat(v) { st.L = v; upd(); }, setStep(v) { st.step = v; upd(); }, setJoint(b) { st.joint = !!b; upd(); },
    async reveal() { st.revealed = true; upd(); await nextFrame(); return state(); },
    async joint() { st.step = 5; st.joint = true; upd(); await nextFrame(); return state(); },
  };
  const ratio = (G2, arch) => { const a = E.attnCost(G2, 5, arch, st.L), b = E.attnCost(st.G, 5, arch, st.L); return a.perEx / b.perEx; };
  const missions = [
    { short: 'Воксели', title: 'Каждый воксель — токен', text: 'Сетка 100³, каждый воксель — отдельный токен, плюс 77 токенов текста. Внимание всех ко всем, 6 слоёв, пакет из 16 примеров, как при обучении PerAct. Считаем только матрицы оценок внимания: одна голова, 4 байта на число.',
      onEnter: (X) => { X.setG(100); X.setPatch(1); },
      bet: { q: 'сколько памяти займут оценки внимания?', options: ['Около 4 ГБ, как у больших языковых моделей', 'Сотни терабайт', 'Около 40 МБ: это просто числа'], answer: () => 1 },
      action: { label: 'Посчитать', run: (X) => X.reveal() },
      criteria: [{ label: 'Посчитано для сетки 100³, токен — воксель', test: (r) => r.G === 100 && r.p === 1 }],
      fail: () => 'Нужна сетка 100³, где каждый воксель — токен.',
      explain: (r) => `${bytes(r.fullBytes)}: миллион токенов дают ${big(r.N * r.N)} пар на слой, и один слой одного примера — уже ${bytes(r.N * r.N * 4)}. Perceiver с 2048 латентами на миллионе токенов тоже не поместился бы: ${bytes(r.percBytes)}, ведь кросс-внимание читает каждый токен. Поэтому PerAct сначала режет сетку на патчи.` },
    { short: 'Латенты', title: 'Уложи обучение в 16 ГБ', text: 'Сетку 100³ уменьшать нельзя: точным задачам нужен воксель 1 см. Выбери, что считать токеном, и число латентов так, чтобы оценки внимания у Perceiver уместились в видеокарту на 16 ГБ. Посмотри, что при этом со вниманием всех ко всем.',
      controls: ['patch', 'lat'], onEnter: (X) => X.setG(100),
      criteria: [{ label: 'Сетка 100³', test: (r, s) => s.G === 100 }, { label: 'Perceiver укладывается в 16 ГБ', test: (r, s) => s.revealed && s.percBytes <= LIMIT }],
      hint: 'Сначала сократи число токенов: пусть токеном будет патч 5 × 5 × 5.',
      explain: (s) => `Патчи 5 × 5 × 5 сокращают вход до ${int(s.N)} токенов. Perceiver с ${int(s.L)} латентами занимает ${bytes(s.percBytes)}, а внимание всех ко всем на тех же токенах — ${bytes(s.fullBytes)}: в видеокарту оно не помещается. Удвоим сторону сетки — токенов станет в 8 раз больше: Perceiver подорожает в ${fmt(ratio(200, 'perceiver'), 1)} раза, внимание всех ко всем — в ${Math.round(ratio(200, 'full'))} раза. Авторы проверяли и 512 латентов: на их задачах это не хуже 2048, а иногда лучше.` },
    { short: 'Повороты', title: 'Сколько выходов у поворота', text: 'Поворот делят на корзины по 5°: по 72 на каждую из трёх осей. PerAct учит три классификации отдельно — 216 выходов. А если учить одну классификацию по всем сочетаниям трёх углов?',
      controls: ['rot'], onEnter: (X) => { X.setStep(5); X.setJoint(false); },
      bet: { q: 'сколько выходов будет у классификации по всем сочетаниям?', options: ['216, столько же', 'Около 373 тысяч', 'Около 15 тысяч'], answer: () => 1 },
      action: { label: 'Посчитать все сочетания', run: (X) => X.joint() },
      criteria: [{ label: 'Посчитаны все сочетания при шаге 5°', test: (r) => r.joint && r.step === 5 }],
      explain: (r) => `Все сочетания — 72³ = ${int(r.rotJoint)} выходов, и большинство сочетаний в демонстрациях не встретится ни разу. Три отдельные классификации дают ${r.rotAxis} выходов. Цена — модель не может выразить, что угол по одной оси зависит от угла по другой. Перенос — тоже отдельная голова: если бы оценку считали для каждой пары «воксель — поворот», выходов было бы 10⁶ × 216, больше 200 миллионов.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй сетку, токены, число латентов и корзины поворота. Найди самую большую сетку, при которой Perceiver с 2048 латентами ещё укладывается в 16 ГБ, и сравни со вниманием всех ко всем.', final: true, onEnter: () => { st.revealed = true; upd(); } },
  ];
  function init() {
    $('#pG').addEventListener('input', (e) => api.setG(+e.target.value));
    $('#pPatch').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) api.setPatch(+b.dataset.v); });
    $('#pLat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) api.setLat(+b.dataset.v); });
    $('#pStep').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) api.setStep(+b.dataset.v); });
    $('#pJoint').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) api.setJoint(!!+b.dataset.v); });
    sync();
    ctl = mountMissions('#pMis', missions, api, { controls: { g: '#wrapPG', patch: '#pPatch', lat: '#pLat', rot: '#pRotBox', step: '#pStep', joint: '#pJoint' }, scene: '#pCv' });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Задача: собери PerAct по шагам ---------- */
function initSort() {
  $('#shapeSort').classList.add('shape-sort');
  return Cards.sort('#shapeSort', {
    targets: [
      { id: 'grid', label: '1 · 100 × 100 × 100 × 10', note: 'миллион вокселей, в каждом 10 чисел' },
      { id: 'text', label: '2 · 77 × 512', note: '77 токенов по 512 чисел' },
      { id: 'seq', label: '3 · 8077 × 128', note: '8077 токенов по 128 чисел' },
      { id: 'lat', label: '4 · 2048 × 512', note: '2048 векторов по 512 чисел' },
      { id: 'feat', label: '5 · 100 × 100 × 100 × 64', note: 'миллион вокселей, в каждом 64 признака' },
      { id: 'q', label: '6 · 100 × 100 × 100 × 1', note: 'одно число на воксель' },
      { id: 'rot', label: '7 · 216', note: 'три оси по 72 корзины' },
      { id: 'open', label: '8 · 2', note: 'два варианта' },
    ],
    items: [
      { id: 'i5', label: 'Патчи спрашивают латенты, и сетку растягивают обратно', sub: 'Каждый патч получает от латентов ответ. Затем сетку 20 × 20 × 20 патчей увеличивают до 100 × 100 × 100 вокселей: значения между соседними патчами плавно достраивают, как при увеличении картинки (это трилинейное повышение разрешения), и свёртка даёт каждому вокселю 64 признака.', target: 'feat', why: 'После обратного кросс-внимания и повышения разрешения у каждого из миллиона вокселей 64 признака.' },
      { id: 'i2', label: 'Текстовый энкодер CLIP кодирует команду', sub: 'Токенизатор CLIP всегда выдаёт 77 токенов, дополняя короткую команду пустыми, а энкодер даёт вектор на каждый токен.', target: 'text', why: '77 токенов, по 512 чисел на токен.' },
      { id: 'i7', label: 'Голова поворота: max-pool по всей сетке и линейный слой', sub: 'Max-pool берёт по каждому из 64 признаков его наибольшее значение среди всех вокселей: остаётся 64 числа о сцене целиком. Линейный слой превращает их в оценки корзин поворота: 72 корзины по 5° на каждую из трёх осей.', target: 'rot', why: '3 оси × 72 корзины = 216 оценок.' },
      { id: 'i1', label: 'Облака точек с камер сводят в сетку над столом', sub: 'Каждый воксель получает цвет, координаты точки, занят ли он и свой индекс в сетке.', target: 'grid', why: 'Сетка 100³, в вокселе 10 чисел: 3 цвета, 3 координаты, занятость и 3 индекса.' },
      { id: 'i6', label: 'Голова переноса: свёртка 1 × 1 × 1 сжимает признаки вокселя до одного числа', sub: 'Это число и есть оценка Q вокселя. Действие — воксель с самой высокой оценкой.', target: 'q', why: 'Одна оценка на каждый из миллиона вокселей.' },
      { id: 'i3', label: 'Сетку режут на патчи и приклеивают к ним слова', sub: 'Свёртка с ядром и шагом 5 даёт (100/5)³ патчей. К каждому патчу добавляют 64 числа о состоянии захвата, а токены команды сжимают линейным слоем до той же ширины и ставят в ту же последовательность.', target: 'seq', why: '8000 патчей и 77 токенов текста по 128 чисел: 64 канала вокселей и 64 — проприоцепции, текст сжат с 512 до 128.' },
      { id: 'i8', label: 'Голова захвата: линейный слой по тем же 64 числам', sub: 'Открыт захват или сжат. У флага столкновений такой же выход: обходить всё или ничего.', target: 'open', why: 'Два варианта: открыт или сжат.' },
      { id: 'i4', label: 'Латенты читают вход, потом шесть слоёв внимания между латентами', sub: 'Размер этого тензора не зависит от длины входа: латентов всегда столько же.', target: 'lat', why: '2048 латентов по 512 чисел, сколько бы токенов ни было на входе.' },
    ],
    after: 'Миллион вокселей сжимается в 8000 патчей, патчи вместе с текстом — в 2048 латентов, и обратно в миллион. Самый большой тензор — 100³ × 64 признака на выходе декодера: из него голова переноса оценивает каждый воксель, а остальные головы берут max-pool по всему объёму.',
  });
}

/* ---------- График из таблицы 1 статьи ---------- */
const T1 = (() => {
  const E = L22, W = 640, st = { nd: 100, hover: null };
  // серии в каждой строке сверху вниз: ключ, подпись легенды, цвет, вид столбика (filled или outline)
  const SER = [['peract', 'PerAct', '--e2e', 'bar'], ['nolang', 'PerAct без команды словами', '--e2e', 'bar-o'], ['c2f', 'C2FARM-BC: 3D-свёрточная сеть', '--classic', 'bar'], ['img', 'Image-BC: по картинке, лучший из CNN и ViT', '--ink-3', 'bar']];
  const val = (key, t) => (key === 'img' ? Math.max(E.TABLE1.at('cnn', t, st.nd), E.TABLE1.at('vit', t, st.nd)) : E.TABLE1.at(key, t, st.nd));
  /** Порядок задач: по убыванию успеха PerAct при выбранном числе демонстраций; при равенстве — по C2FARM-BC, потом порядок таблицы. */
  const order = () => E.TABLE1.ru.map((_, t) => t).sort((a, b) => val('peract', b) - val('peract', a) || val('c2f', b) - val('c2f', a) || a - b);
  let geo = null;
  function draw() {
    const cv = $('#tCv'), cssW = cv.getBoundingClientRect().width || W, k0 = W / cssW, c0 = cv.getContext('2d'), n = E.TABLE1.ru.length, ord = order();
    HeroKit.font(c0, k0, 11.5, 600); let lw = 0; for (const t of E.TABLE1.ru) lw = Math.max(lw, c0.measureText(t).width);
    // размеры в CSS-пикселях, умноженные на k0: на телефоне строки не сжимаются вместе с канвасом
    const bh = 6 * k0, bg = 1.5 * k0, rowH = SER.length * (bh + bg) + 8 * k0, top = 10 * k0, axisH = 44 * k0;
    const L = Math.ceil(lw) + 18, R = W - 24 * k0, Ht = Math.round(top + n * rowH + axisH), yb = top + n * rowH;
    cv.style.aspectRatio = `${W} / ${Ht}`;
    const { c, k } = HeroKit.fit(cv, W, Ht), P = pal(), xv = (v) => L + (R - L) * v / 100;
    geo = { L, R, top, rowH, Ht, ord };
    c.fillStyle = P.bg; c.fillRect(0, 0, W, Ht);
    for (const v of [0, 25, 50, 75, 100]) { c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(xv(v), top - 4); c.lineTo(xv(v), yb + 3); c.stroke(); HeroKit.label(c, k, v + '%', xv(v), yb + 12 * k0, { px: 10.5, mono: true, color: P.ink3, halo: false }); }
    HeroKit.label(c, k, 'доля успешных эпизодов, %', (L + R) / 2, yb + 30 * k0, { px: 11, weight: 650, color: P.ink2, halo: false });
    ord.forEach((t, i) => {
      const y0 = top + i * rowH, yc = y0 + rowH / 2;
      if (st.hover === t) { c.fillStyle = P.grid; c.fillRect(4, y0, W - 8, rowH); }
      HeroKit.label(c, k, E.TABLE1.ru[t], L - 10, yc, { px: 11.5, align: 'right', color: st.hover === t ? P.ink : P.ink2, halo: false });
      SER.forEach(([key, , col, kind], j) => {
        const v = val(key, t), y = y0 + 4 * k0 + j * (bh + bg), x1 = xv(v), cc = HeroKit.css(col);
        if (v === 0) { c.fillStyle = cc; c.fillRect(L, y, 1.5 * k0, bh); return; }   // нулевой успех — чёрточка у оси
        if (kind === 'bar-o') { c.fillStyle = P.bg; c.fillRect(L, y, x1 - L, bh); c.strokeStyle = cc; c.lineWidth = 1.2 * k0; c.strokeRect(L + 0.6 * k0, y + 0.6 * k0, x1 - L - 1.2 * k0, bh - 1.2 * k0); }
        else { c.fillStyle = cc; c.fillRect(L, y, x1 - L, bh); }
      });
    });
    out();
  }
  function out() {
    const t = st.hover;
    if (t == null) { setOut($('#tOut'), `${st.nd} демонстраций на задачу. Наведи на строку или нажми её, чтобы увидеть числа.`); return; }
    setOut($('#tOut'), `<b>${E.TABLE1.ru[t]}</b> (${E.TABLE1.tasks[t]}), ${st.nd} демонстраций: PerAct — <b>${val('peract', t)}%</b>, без команды — ${val('nolang', t)}%, C2FARM-BC — ${val('c2f', t)}%, Image-BC — ${val('img', t)}% (CNN ${E.TABLE1.at('cnn', t, st.nd)}%, ViT ${E.TABLE1.at('vit', t, st.nd)}%).`);
  }
  function rowAt(e) {
    const cv = $('#tCv'), r = cv.getBoundingClientRect(); if (!geo) return null;
    const y = (e.clientY - r.top) / r.height * geo.Ht, i = Math.floor((y - geo.top) / geo.rowH);
    return i >= 0 && i < geo.ord.length ? geo.ord[i] : null;
  }
  function init() {
    legend('#tLegend', SER.map(([, name, col, kind]) => [name, `var(${col})`, kind]));
    $('#tDemos').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.nd = +b.dataset.v; $$('#tDemos button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    const cv = $('#tCv');
    cv.addEventListener('pointermove', (e) => { const t = rowAt(e); if (t !== st.hover) { st.hover = t; draw(); } });
    cv.addEventListener('pointerdown', (e) => { const t = rowAt(e); st.hover = t; draw(); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { st.hover = null; draw(); } });
    draw(); redrawOn(draw);
  }
  return { init, st, val, draw, order, setHover: (t) => { st.hover = t; draw(); }, setDemos: (nd) => { st.nd = nd; $$('#tDemos button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.v === nd))); draw(); } };
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
    { q: 'PerAct предсказывает действие на каждом кадре, как политики части 1?', o: ['Да, 30 раз в секунду', 'Нет: только следующую ключевую позу, а путь до неё строит планировщик движения', 'Нет: всю траекторию сразу одним выходом'], a: 1, e: 'Каждый кадр демонстрации — пример «наблюдение и команда → следующая ключевая поза». В лаборатории из 325 решений осталось шесть.' },
    { q: 'Ключевые позы можно брать через равные промежутки — главное, чтобы их было мало?', o: ['Да, планировщик всё равно довезёт', 'Нет: позы должны попасть в те моменты, где решается задача: захват, отпускание, обход препятствия', 'Да, если промежутков больше десяти'], a: 1, e: 'В лаборатории шесть поз через равные промежутки сжали захват в воздухе. В статье равные промежутки и случайные кадры дают нулевой успех.' },
    { q: 'Второе условие эвристики — «захват не меняет состояние» — ни на что не влияет?', o: ['Не влияет, важна только скорость', 'Влияет: без него поза берётся, когда захват ещё открыт, и он сжимается не там', 'Влияет только на число поз'], a: 1, e: 'Пока захват сжимается, рука стоит. Без условия вся эта остановка — одна, её первый кадр — с открытым захватом, и в лаборатории захват сжимался уже над чайником.' },
    { q: 'PerAct выдаёт координаты захвата регрессией?', o: ['Да, три числа', 'Нет: оценивает каждый из миллиона вокселей и берёт лучший', 'Нет: перебирает позы в симуляторе'], a: 1, e: 'Следующий лучший воксель — классификация. Она сохраняет несколько верных ответов, а регрессия в лаборатории поставила чашку между полками.' },
    { q: 'Поворот PerAct предсказывает одной классификацией по всем сочетаниям углов?', o: ['Да, так точнее', 'Нет: три отдельные классификации по 72 корзины, 216 выходов вместо 373 248', 'Нет: поворот выбирает планировщик'], a: 1, e: 'Корзины по 5° на каждую из трёх осей. Цена раздельных осей — модель не выражает, что угол по одной оси зависит от угла по другой.' },
    { q: 'Если взять видеокарту побольше, обычный трансформер справится с миллионом вокселей?', o: ['Да', 'Нет: это 10¹² пар на слой, сотни терабайт на одни оценки внимания при обучении', 'Да, если считать в половинной точности'], a: 1, e: 'Даже 8000 патчей обычному трансформеру, по словам авторов, трудно уместить в память. Perceiver сжимает вход в 2048 латентов.' },
    { q: 'Perceiver — обычный трансформер с меньшим числом слоёв?', o: ['Нет: внимание всех ко всем идёт только между латентами, а вход с латентами связывает кросс-внимание, поэтому стоимость растёт линейно по числу токенов', 'Да', 'Нет: в нём нет внимания, только свёртки'], a: 0, e: 'Латентов 2048, и их число не зависит от длины входа. Авторы проверяли и 512: на их задачах это не хуже.' },
    { q: 'Нужна ли PerAct команда словами, если задачу и так видно по сцене?', o: ['Не нужна: модель поймёт задачу по сцене', 'Нужна: одна сцена допускает разные задачи — какой ящик открыть, на какую полку поставить; без команды PerAct работает на уровне случайного выбора', 'Нужна только на настоящем роботе'], a: 1, e: 'В лаборатории на команду «на полку» у классификатора два пика, команда с названием полки оставляет один. Текст кодирует энкодер CLIP.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('key', () => { mis.key = LabKey.init(); }); safe('vox', () => { mis.vox = LabVox.init(); }); safe('cost', () => { mis.cost = LabCost.init(); });
    safe('sort', () => { mis.sort = initSort(); }); safe('t1', () => T1.init()); safe('quiz', initQuiz);
    safe('count', () => { const n = ['kMis', 'vMis', 'pMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l22 = { mis, SPEED, LabKey, LabVox, LabCost, T1, L22 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
