/* =====================================================================
   ui-l44.js — урок 4.4 «Обучение на видео людей». Схемы и интерактивы:
   0) анимированные схемы (shared/anim.js): «ролик с очков → действие»
      и «одна политика на человеке и роботе» (EgoMimic);
   1) лаборатория «Рука человека и рука Ады»: ретаргетинг пути кисти
      человека на руку Ады, замедление, что теряется;
   2) лаборатория «Сколько видео людей заменяет час робота»: модели на
      демонстрациях робота и видео людей рядом, поправка, кривая;
   3) интерактив «Собери обработку ролика с очков»;
   4) квиз.
   Движок — l44/engine.js (без DOM) поверх shared/arm-core.js и l21/engine.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), clS: HeroKit.css('--classic-soft'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pct = (v) => Math.round(v * 100);
const cm = (v) => Math.round(v * 100);
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);
/** Картинка движка (RGB 0…1) → холст того же размера; кэш по объекту картинки. */
const BM = new WeakMap();
function bitmap(img, w, hgt) {
  if (BM.has(img)) return BM.get(img);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); BM.set(img, cv); return cv;
}
/** Где оператор сомкнул захват: перекрестие из четырёх рисок с открытым центром, белое с тёмным краем. */
function grip(c, x, y, r) {
  r = r || 4; const L = r + 5;
  c.lineCap = 'round';
  for (const [w, col] of [[4.2, '#1f2430'], [2.2, '#ffffff']]) {
    c.lineWidth = w; c.strokeStyle = col; c.beginPath();
    c.moveTo(x - L, y); c.lineTo(x - r, y); c.moveTo(x + r, y); c.lineTo(x + L, y); c.moveTo(x, y - L); c.lineTo(x, y - r); c.moveTo(x, y + r); c.lineTo(x, y + L);
    c.stroke();
  }
}
/** Кисть человека: 21 точка (запястье и по 4 на палец) в локальных координатах; open — раскрытие щепоти 0…1. */
function handPts(open) {
  const P = [[0, 0]], base = [[-0.2, -0.55], [0.05, -0.95], [0.25, -0.98], [0.42, -0.9], [0.55, -0.75]];
  base.forEach(([bx, by], f) => {
    const thumb = f === 0, len = thumb ? 0.55 : [0, 0.62, 0.68, 0.62, 0.5][f], ang = Math.atan2(by, bx) + (thumb ? -0.7 + 0.5 * (1 - open) : (f === 1 ? 0.35 * (1 - open) : 0.15 * (1 - open)));
    for (let s = 0; s < 4; s++) { const d = s === 0 ? 0 : len * s / 3 * (thumb || f === 1 ? 1 : 0.9 - 0.3 * (1 - open)); P.push([bx + Math.cos(ang) * d, by + Math.sin(ang) * d]); }
  });
  return P;
}
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];

/* =====================================================================
   0а. Схема: как ролик с очков превращается в действие
   ===================================================================== */
(() => {
  const T = 8;                                                           // секунд на цикл
  // кисть человека в своей системе (единицы схемы, плечо в 0,0): к чашке, захват, подъём, назад
  const KEYS = [[0, [34, 52]], [0.32, [112, 64]], [0.45, [112, 64]], [0.72, [104, 18]], [0.88, [70, 30]], [1, [34, 52]]];
  function handAt(u) {
    for (let i = 1; i < KEYS.length; i++) if (u <= KEYS[i][0]) { const [a, p] = KEYS[i - 1], [b, q] = KEYS[i], s = Anim.kit.ease((u - a) / (b - a || 1)); return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; }
    return KEYS[0][1];
  }
  const openAt = (u) => (u < 0.33 ? 1 : u < 0.43 ? 1 - (u - 0.33) / 0.1 * 0.7 : u < 0.86 ? 0.3 : u < 0.92 ? 0.3 + (u - 0.86) / 0.06 * 0.7 : 1);
  const headAt = (u) => 0.16 * Math.sin(2 * Math.PI * u + 0.6);       // наклон головы, рад
  const held = (u) => u > 0.43 && u < 0.88;
  function ik2(dx, dy, l1, l2) { const d = Math.min(l1 + l2 - 0.5, Math.hypot(dx, dy)), a = Math.atan2(dy, dx), b = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))); return a + b; }
  /** Человек сбоку: стол, чашка, рука; S — масштаб, (x0, y0) — плечо. */
  function person(c, k, u, P, A, G) {
    const { line, circle, rect, lab, alpha } = A, S = G.ps, x0 = G.px, y0 = G.py, X = (v) => x0 + v * S, Y = (v) => y0 + v * S;
    const floor = Y(170), tableY = Y(80), hd = handAt(u), th = headAt(u);
    line(c, [[X(-60), floor], [X(150), floor]], P.line, 1.4);
    rect(c, X(60), tableY, 90 * S, 6, 2, alpha(P.ink3, 0.35), P.ink3, 1.2);
    line(c, [[X(70), tableY + 6], [X(70), floor]], P.ink3, 2.5); line(c, [[X(142), tableY + 6], [X(142), floor]], P.ink3, 2.5);
    // чашка: на столе или в руке
    const cupX = held(u) ? X(hd[0]) + 4 : X(118), cupY = held(u) ? Y(hd[1]) + 3 : tableY - 22 * S;
    rect(c, cupX - 9 * S, cupY, 18 * S, 22 * S, 3, P.surf, P.ink2, 1.6);
    // тело
    const hip = [X(-4), Y(80)], head = [X(6) + 4 * Math.sin(th), Y(-26)];
    line(c, [hip, [X(0), Y(0)]], P.mot, 7); line(c, [hip, [X(-12), floor]], P.mot, 3.4); line(c, [hip, [X(8), floor]], P.mot, 3.4);
    circle(c, head[0], head[1], 14 * S, P.surf, P.mot, 2.2);
    // очки с камерой: смотрят вперёд и вниз с наклоном головы
    const gx = head[0] + 11 * S, gy = head[1] - 1, look = 0.75 + th;
    rect(c, gx - 4, gy - 3.5, 12, 7, 2, P.mot, null);
    c.fillStyle = alpha(P.mot, 0.07); c.beginPath(); c.moveTo(gx + 6, gy); c.lineTo(gx + 6 + Math.cos(look - 0.38) * 170 * S, gy + Math.sin(look - 0.38) * 170 * S); c.lineTo(gx + 6 + Math.cos(look + 0.38) * 170 * S, gy + Math.sin(look + 0.38) * 170 * S); c.closePath(); c.fill();
    // рука: плечо, локоть, кисть; два пальца — большой и указательный
    const e = ik2(hd[0], hd[1], 52, 50), el = [X(Math.cos(e) * 52), Y(Math.sin(e) * 52)], wr = [X(hd[0]), Y(hd[1])];
    line(c, [[X(0), Y(0)], el, wr], P.mot, 3.4);
    circle(c, X(0), Y(0), 3.5, P.surf, P.mot, 1.8); circle(c, el[0], el[1], 3, P.surf, P.mot, 1.8);
    const op = openAt(u) * 7 * S + 2;
    line(c, [wr, [wr[0] + 9 * S, wr[1] - op]], P.mot, 2.4); line(c, [wr, [wr[0] + 10 * S, wr[1] + op]], P.mot, 2.4);
    lab(c, k, 'очки с камерой', gx + 2, head[1] - 24 * S, { px: 10.5, color: P.mot, haloColor: P.surf });
    lab(c, k, 'чашка', X(118), tableY + 16, { px: 10, color: P.ink3, haloColor: P.surf });
    lab(c, k, 'человек', X(-24), Y(120), { px: 10.5, color: P.mot, haloColor: P.surf });
  }
  /** Кадр с очков: стол, чашка и кисть с 21 точкой; содержимое сдвигается с наклоном головы. */
  function frame(c, k, u, P, A, G) {
    const { rect, lab, line, circle, alpha, seg } = A, F = G.fr, hd = handAt(u), th = headAt(u), on = seg(((u * T) % T), 0, 0.6);
    lab(c, k, 'кадр с очков', F.x + F.w / 2, F.y - 11, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    rect(c, F.x, F.y, F.w, F.h, 8, P.surf2 || P.surf, P.ink3, 1.3);
    c.save(); c.beginPath(); c.roundRect(F.x, F.y, F.w, F.h, 8); c.clip();
    const sh = th * F.h * 0.9, fx = (v) => F.x + F.w * (0.12 + (v - 20) / 130 * 0.8), fy = (v) => F.y + F.h * (0.28 + (v - 10) / 80 * 0.62) - sh;
    c.fillStyle = alpha(P.ink3, 0.18); c.fillRect(F.x, fy(70), F.w, F.h);                   // стол
    const cupX = held(u) ? fx(hd[0]) + 8 : fx(118), cupY = held(u) ? fy(hd[1]) + 6 : fy(70) - 16;
    rect(c, cupX - 11, cupY, 22, 26, 4, P.surf, P.ink2, 1.6);
    // кисть: тень-силуэт и 21 точка трекера
    const op = openAt(u), pts = handPts(op), s = F.h * 0.27, ox = fx(hd[0]) - 6, oy = fy(hd[1]) + 16, rot = -0.55;
    const tp = pts.map(([x, y]) => [ox + (x * Math.cos(rot) - y * Math.sin(rot)) * s, oy + (x * Math.sin(rot) + y * Math.cos(rot)) * s]);
    c.fillStyle = alpha(P.mot, 0.22); c.beginPath(); tp.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
    line(c, [[ox - 30, oy + 40], [ox, oy]], alpha(P.mot, 0.45), 14);                        // предплечье
    for (const [a, b] of HAND_BONES) line(c, [tp[a], tp[b]], alpha(P.out, 0.8), 1.3);
    tp.forEach((p) => circle(c, p[0], p[1], 2.1, P.out, null));
    c.restore();
    void on;
    return { wrist: tp[0], thumb: tp[4], index: tp[8] };
  }
  /** Поза камеры и точки кисти — два измерения под кадром. */
  function chips(c, k, u, P, A, G) {
    const { rect, lab, line, circle } = A, C = G.ch, th = headAt(u);
    rect(c, C.x, C.y, C.w, 26, 8, P.surf, P.out, 1.4);
    const ax = C.x + 16, ay = C.y + 13;
    line(c, [[ax, ay], [ax + Math.cos(th) * 10, ay + Math.sin(th) * 10]], P.out, 2); line(c, [[ax, ay], [ax - Math.sin(th) * 10, ay + Math.cos(th) * 10]], P.out, 2);
    lab(c, k, G.narrow ? 'SLAM: поза камеры' : 'SLAM: поза камеры в кадре', C.x + 30, ay, { px: 10.5, align: 'left', color: P.out, halo: false });
    rect(c, C.x, C.y + 32, C.w, 26, 8, P.surf, P.out, 1.4);
    for (let i = 0; i < 5; i++) circle(c, C.x + 10 + i * 4, C.y + 45 + (i % 2 ? 2 : -2), 1.8, P.out, null);
    lab(c, k, G.narrow ? 'трекер: 21 точка кисти' : 'трекер рук: 21 точка кисти', C.x + 30, C.y + 45, { px: 10.5, align: 'left', color: P.out, halo: false });
  }
  /** Путь кисти в системе камеры момента t и захват Ады на выходе. */
  function pathPanel(c, k, u, P, A, G) {
    const { rect, lab, line, circle, arrow, alpha } = A, Q = G.pt, th = headAt(u);
    if (G.narrow) lab(c, k, 'путь кисти в системе камеры кадра t', Q.x, Q.y - 11, { px: 11.5, align: 'left', weight: 700, color: P.ink2, haloColor: P.surf });
    else lab(c, k, 'путь кисти в системе камеры момента t', Q.x + Q.w / 2, Q.y - 11, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.surf });
    rect(c, Q.x, Q.y, Q.w, Q.h, 8, P.surf, P.line, 1.2);
    const o = [Q.x + 22, Q.y + 22];
    rect(c, o[0] - 8, o[1] - 6, 14, 10, 2, P.out, null);
    arrow(c, o[0], o[1], o[0] + 34, o[1], P.out, 1.6, 6); arrow(c, o[0], o[1], o[0], o[1] + 30, P.out, 1.6, 6);
    lab(c, k, 'камера в момент t', o[0] + 40, o[1] - 2, { px: 10, align: 'left', color: P.out, haloColor: P.surf });
    // будущие точки кисти, повёрнутые в систему камеры момента t
    const n = 8, pts = [];
    for (let i = 0; i < n; i++) {
      const v = handAt(Math.min(0.999, u + i * 0.04)), dx = v[0] - 30, dy = v[1] - 6, cs = Math.cos(-th), sn = Math.sin(-th);
      pts.push([Q.x + 34 + (dx * cs - dy * sn) * Q.s, Q.y + 34 + (dx * sn + dy * cs) * Q.s]);
    }
    line(c, pts, alpha(P.out, 0.7), 2);
    pts.forEach((p, i) => circle(c, p[0], p[1], i ? 2.6 : 4, i ? P.out : P.surf, i ? null : P.out, 2));
    lab(c, k, G.narrow ? 'действие: t … t+h' : 'действие: точки t … t+h', Q.x + 10, Q.y + Q.h - 12, { px: 10, align: 'left', color: P.out, haloColor: P.surf });
    // ретаргетинг: захват Ады с раскрытием по большому и указательному
    const g = [Q.gx, Q.gy], op = 3 + openAt(u) * 9, nar = !!G.narrow;
    const a0 = nar ? [Q.x + Q.w + 4, Q.y + Q.h / 2] : [Q.x + Q.w / 2, Q.y + Q.h + 4], a1 = nar ? [g[0] - 18, g[1] - 22] : [g[0] - 4, g[1] - 30];
    arrow(c, a0[0], a0[1], a1[0], a1[1], P.ink3, 1.6, 6);
    if (!nar) lab(c, k, 'ретаргетинг', Q.x + Q.w / 2 + 8, (Q.y + Q.h + g[1] - 30) / 2 + 2, { px: 10, align: 'left', color: P.ink3, haloColor: P.surf });
    else lab(c, k, 'ретаргетинг', g[0], Q.y + 6, { px: 10, color: P.ink3, haloColor: P.surf });
    line(c, [[g[0], g[1] - 22], [g[0], g[1] - 12]], P.out, 4);
    line(c, [[g[0] - op - 2, g[1] - 12], [g[0] + op + 2, g[1] - 12]], P.out, 3.2);
    line(c, [[g[0] - op, g[1] - 12], [g[0] - op, g[1] + 6]], P.out, 3); line(c, [[g[0] + op, g[1] - 12], [g[0] + op, g[1] + 6]], P.out, 3);
    const tx = nar ? g[0] : g[0] + 22, al = nar ? 'center' : 'left', ty = nar ? [g[1] + 20, g[1] + 34, g[1] + 54] : [g[1] - 14, g[1] + 2, g[1] + 22];
    lab(c, k, 'захват Ады', tx, ty[0], { px: 10.5, align: al, color: P.out, haloColor: P.surf });
    lab(c, k, `раскрытие ${fmt(2 + openAt(u) * 6, 0)} см`, tx, ty[1], { px: 10, align: al, color: P.out, haloColor: P.surf });
    // чего в видео нет
    const nx = nar ? g[0] - 70 : tx, ny = ty[2];
    line(c, [[nx, ny - 5], [nx + 10, ny + 5]], P.ink3, 1.8); line(c, [[nx, ny + 5], [nx + 10, ny - 5]], P.ink3, 1.8);
    lab(c, k, nar ? 'силы в видео нет' : 'силы сжатия и касаний в видео нет', nx + 16, ny, { px: 10, align: 'left', color: P.ink3, haloColor: P.surf });
  }
  /** Лента записи: кадры, позы камеры, точки кисти; скобка — действие для текущего кадра. */
  function strip(c, k, u, P, A, G) {
    const { rect, lab, line, circle, alpha } = A, S = G.st, N = S.n, cw = (S.w - S.lw) / N, cur = Math.floor(u * N) % N;
    const rows = ['кадр', 'поза камеры', 'точки кисти'];
    rows.forEach((name, r) => lab(c, k, name, S.x + S.lw - 6, S.y + 8 + r * 14, { px: 9.5, align: 'right', color: r ? P.out : P.ink3, haloColor: P.surf }));
    for (let i = 0; i < N; i++) {
      const x = S.x + S.lw + i * cw, past = i <= cur;
      rect(c, x + 2, S.y + 2, cw - 4, 12, 2, past ? alpha(P.ink3, 0.25) : P.surf, P.ink3, 0.8);
      if (past) { circle(c, x + cw / 2, S.y + 22, 2.2, P.out, null); for (let j = 0; j < 3; j++) circle(c, x + cw / 2 - 4 + j * 4, S.y + 36, 1.6, P.out, null); }
    }
    const a = S.x + S.lw + cur * cw + 2, b = S.x + S.lw + Math.min(N, cur + 5) * cw - 2, yb = S.y + 46;
    line(c, [[a, yb], [a, yb + 5], [b, yb + 5], [b, yb]], P.out, 1.6);
    rect(c, a, S.y, cw, 42, 3, null, P.ink, 1.6);
    lab(c, k, G.narrow ? 'действие для кадра t' : 'действие для кадра t: следующие точки кисти в системе камеры кадра t', Math.min(a, S.x + S.w - (G.narrow ? 70 : 230)), yb + 16, { px: 10, align: 'left', color: P.out, haloColor: P.surf });
  }
  function draw(c, k, t, P0, A, G) {
    const P = Object.assign({ out: P0.out }, P0), u = ((t % T) + T) % T / T;
    person(c, k, u, P, A, G); frame(c, k, u, P, A, G); chips(c, k, u, P, A, G); pathPanel(c, k, u, P, A, G); strip(c, k, u, P, A, G);
    // переходы между частями
    for (const [x1, y1, x2, y2] of G.links) A.arrow(c, x1, y1, x2, y2, P.ink3, 1.5, 6);
  }
  Anim.add('ego2act', {
    W: 720, H: 380, start: 2.6, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { px: 70, py: 120, ps: 1, fr: { x: 236, y: 30, w: 200, h: 136 }, ch: { x: 236, y: 180, w: 200 }, pt: { x: 470, y: 30, w: 236, h: 132, s: 1.55, gx: 530, gy: 236 }, links: [[216, 96, 230, 96], [440, 96, 464, 96]], st: { x: 10, y: 300, w: 700, lw: 76, n: 22 } }); },
    narrow: { W: 360, H: 790, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, px: 90, py: 76, ps: 1.25, fr: { x: 20, y: 330, w: 320, h: 150 }, ch: { x: 20, y: 492, w: 320 }, pt: { x: 20, y: 580, w: 200, h: 124, s: 1.3, gx: 268, gy: 630 }, links: [[180, 296, 180, 316]], st: { x: 8, y: 720, w: 344, lw: 68, n: 12 } }); } },
  });
})();

/* =====================================================================
   0б. Схема: одна политика на человеке и роботе (EgoMimic, рис. 4 и алгоритм 1)
   ===================================================================== */
(() => {
  const T = 6;                                                           // цикл: пример человека, затем пример робота
  /** Кадр очков с закрашенной рукой или захватом и красной линией по направлению. */
  function glassesFrame(c, x, y, w, hh, robot, P, A) {
    const { rect, line, alpha } = A;
    rect(c, x, y, w, hh, 6, P.surf, robot ? P.out : P.mot, 1.6);
    c.fillStyle = alpha(P.ink3, 0.2); c.fillRect(x + 1, y + hh * 0.55, w - 2, hh * 0.45 - 1);
    rect(c, x + w * 0.62, y + hh * 0.42, w * 0.12, hh * 0.22, 2, P.surf, P.ink3, 1.2);                // предмет
    c.fillStyle = '#1f2430'; c.beginPath();                                                      // маска руки или захвата
    if (robot) { c.roundRect(x + w * 0.18, y + hh * 0.18, w * 0.16, hh * 0.62, 3); c.roundRect(x + w * 0.3, y + hh * 0.5, w * 0.16, hh * 0.18, 3); }
    else { c.ellipse(x + w * 0.4, y + hh * 0.6, w * 0.13, hh * 0.15, -0.4, 0, 7); c.roundRect(x + w * 0.05, y + hh * 0.66, w * 0.3, hh * 0.18, 4); }
    c.fill();
    line(c, [[x + w * (robot ? 0.38 : 0.42), y + hh * (robot ? 0.58 : 0.56)], [x + w * 0.6, y + hh * 0.5]], '#e5484d', 2.4);
  }
  function draw(c, k, t, P, A, G) {
    const { rect, lab, line, circle, arrow, alpha, seg, ease } = A, u = ((t % T) + T) % T, robot = u >= T / 2, s = (u % (T / 2)) / (T / 2);
    const H0 = G.hum, R0 = G.rob, SH = G.sh, HP = G.hp, HQ = G.hq, col = robot ? P.out : P.mot;
    // источники
    lab(c, k, 'человек', H0.x + H0.w / 2, H0.y - 12, { px: 11.5, weight: 700, color: P.mot, haloColor: P.surf });
    glassesFrame(c, H0.x, H0.y, H0.w, H0.h, false, P, A);
    lab(c, k, G.narrow ? 'путь кисти' : 'путь кисти — поза', H0.x + H0.w / 2, H0.y + H0.h + 12, { px: 10, color: P.mot, haloColor: P.surf });
    lab(c, k, 'робот', R0.x + R0.w / 2, R0.y - 12, { px: 11.5, weight: 700, color: P.out, haloColor: P.surf });
    glassesFrame(c, R0.x, R0.y, R0.w * 0.68, R0.h, true, P, A);
    for (const yy of [R0.y, R0.y + R0.h * 0.55]) { const wx = R0.x + R0.w * 0.74, ww = R0.w * 0.26, hh2 = R0.h * 0.45; rect(c, wx, yy, ww, hh2, 4, P.surf, P.out, 1.2); c.fillStyle = alpha(P.ink3, 0.2); c.fillRect(wx + 1, yy + hh2 * 0.6, ww - 2, hh2 * 0.4 - 1); line(c, [[wx + ww * 0.3, yy + 2], [wx + ww * 0.3, yy + hh2 * 0.55]], P.ink2, 2.4); line(c, [[wx + ww * 0.7, yy + 2], [wx + ww * 0.7, yy + hh2 * 0.55]], P.ink2, 2.4); }
    lab(c, k, G.narrow ? 'поза и углы' : 'поза и углы суставов', R0.x + R0.w / 2, R0.y + R0.h + 12, { px: 10, color: P.out, haloColor: P.surf });
    lab(c, k, 'запястья', R0.x + R0.w * 0.87, R0.y - 4 + (G.narrow ? -8 : 0), { px: 9, color: P.out, haloColor: P.surf });
    // нормировка — у каждого источника своя
    for (const [B, cc, name] of [[G.nh, P.mot, 'нормировка людей'], [G.nr, P.out, 'нормировка робота']]) { rect(c, B.x, B.y, B.w, 24, 7, P.surf, cc, 1.5); lab(c, k, G.narrow ? name.replace('нормировка ', 'норм. ') : name, B.x + B.w / 2, B.y + 12, { px: 10, color: cc, halo: false }); }
    // общая часть
    rect(c, SH.x, SH.y, SH.w, SH.h, 12, alpha(P.spr, 0.1), P.spr, 2);
    lab(c, k, 'общий энкодер', SH.x + SH.w / 2, SH.y + SH.h * 0.36, { px: 11.5, weight: 700, color: P.spr, halo: false });
    lab(c, k, 'и трансформер ACT', SH.x + SH.w / 2, SH.y + SH.h * 0.36 + 16, { px: 11.5, weight: 700, color: P.spr, halo: false });
    lab(c, k, 'один набор весов', SH.x + SH.w / 2, SH.y + SH.h * 0.36 + 36, { px: 10, color: P.ink3, halo: false });
    // головы
    rect(c, HP.x, HP.y, HP.w, HP.h, 9, P.surf, P.spr, 1.6); lab(c, k, 'голова поз', HP.x + HP.w / 2, HP.y + HP.h / 2 - 7, { px: 11, weight: 700, color: P.ink, halo: false }); lab(c, k, 'человек и робот', HP.x + HP.w / 2, HP.y + HP.h / 2 + 9, { px: 9.5, color: P.ink3, halo: false });
    rect(c, HQ.x, HQ.y, HQ.w, HQ.h, 9, P.surf, P.out, 1.6); lab(c, k, 'голова углов', HQ.x + HQ.w / 2, HQ.y + HQ.h / 2 - 7, { px: 11, weight: 700, color: P.ink, halo: false }); lab(c, k, 'только робот', HQ.x + HQ.w / 2, HQ.y + HQ.h / 2 + 9, { px: 9.5, color: P.ink3, halo: false });
    // связи
    const src = robot ? R0 : H0, nb = robot ? G.nr : G.nh;
    for (const [a, b, cc] of G.wires) arrow(c, a[0], a[1], b[0], b[1], cc === 'h' ? alpha(P.mot, 0.5) : cc === 'r' ? alpha(P.out, 0.5) : alpha(P.spr, 0.5), 1.4, 6);
    // движение примера: источник → нормировка → общая часть → головы
    const p0 = [src.x + src.w / 2, src.y + src.h + 22], p1 = [nb.x + nb.w / 2, nb.y + 12], p2 = [SH.x + SH.w / 2, SH.y + SH.h * 0.84], pH = [HP.x + HP.w / 2, HP.y + HP.h / 2], pQ = [HQ.x + HQ.w / 2, HQ.y + HQ.h / 2];
    const mv = (a, b, x) => [a[0] + (b[0] - a[0]) * ease(x), a[1] + (b[1] - a[1]) * ease(x)];
    let dots = [];
    if (s < 0.3) dots = [mv(p0, p1, s / 0.3)]; else if (s < 0.6) dots = [mv(p1, p2, (s - 0.3) / 0.3)];
    else { const x = (s - 0.6) / 0.3; dots = [mv(p2, pH, Math.min(1, x))]; if (robot) dots.push(mv(p2, pQ, Math.min(1, x))); }
    dots.forEach((d) => circle(c, d[0], d[1], 6, col, P.surf, 2));
    if (s > 0.9) {
      rect(c, HP.x - 2, HP.y - 2, HP.w + 4, HP.h + 4, 10, null, col, 2.4);
      if (robot) rect(c, HQ.x - 2, HQ.y - 2, HQ.w + 4, HQ.h + 4, 10, null, col, 2.4);
    }
    const cap = robot ? (G.narrow ? 'пример робота: учатся обе головы' : 'пример робота: учатся голова поз и голова углов') : (G.narrow ? 'пример человека: учится голова поз' : 'пример человека: учится только голова поз');
    lab(c, k, cap, G.cap[0], G.cap[1], { px: 11, weight: 700, color: col, haloColor: P.surf });
    void seg; void line;
  }
  Anim.add('cotrain', {
    W: 720, H: 330, start: 1.2, narrowAt: 600,
    draw(c, k, t, P, A) {
      draw(c, k, t, P, A, { hum: { x: 20, y: 36, w: 130, h: 80 }, rob: { x: 20, y: 196, w: 150, h: 80 }, nh: { x: 186, y: 70, w: 120 }, nr: { x: 196, y: 226, w: 120 }, sh: { x: 340, y: 90, w: 170, h: 150 }, hp: { x: 560, y: 70, w: 140, h: 52 }, hq: { x: 560, y: 210, w: 140, h: 52 }, cap: [360, 304],
        wires: [[[150, 82], [184, 82], 'h'], [[172, 238], [194, 238], 'r'], [[306, 82], [340, 130], 'h'], [[316, 238], [340, 200], 'r'], [[510, 140], [558, 98], 's'], [[510, 200], [558, 234], 's']] });
    },
    narrow: { W: 360, H: 560, draw(c, k, t, P, A) {
      draw(c, k, t, P, A, { narrow: true, hum: { x: 14, y: 30, w: 150, h: 84 }, rob: { x: 190, y: 30, w: 156, h: 84 }, nh: { x: 24, y: 150, w: 130 }, nr: { x: 203, y: 150, w: 130 }, sh: { x: 70, y: 222, w: 220, h: 120 }, hp: { x: 20, y: 390, w: 150, h: 52 }, hq: { x: 190, y: 390, w: 150, h: 52 }, cap: [180, 486],
        wires: [[[89, 132], [89, 148], 'h'], [[268, 132], [268, 148], 'r'], [[89, 176], [130, 220], 'h'], [[268, 176], [230, 220], 'r'], [[140, 344], [95, 388], 's'], [[220, 344], [265, 388], 's']] });
    } },
  });
})();

/* =====================================================================
   1. Лаборатория: рука человека и рука Ады (ретаргетинг)
      Вид сбоку, метры; плечо Ады в (0, 0). Логические координаты 340 × 300, 205 пикселей на метр.
   ===================================================================== */
const Retarget = (() => {
  const E = L44, S = E.S, W = 340, H = 300, SC = 205, OX = 92, OY = 150;
  const X = (x) => OX + x * SC, Y = (y) => OY - y * SC;
  const MODE = { joints: 'углы суставов', shoulder: 'от плеча', table: 'от стола' };
  const CLIP = { cup: 'чашка со стола на полку', jar: 'банка с крупой на полку', far: 'чашка на дальний край полки' };
  const st = { mode: 'table', slow: 1, clip: 'cup', run: null, f: 0, playing: false };
  let ctl = null, raf = 0;
  const colors = () => { const d = HeroKit.dark(); return { adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', wood: d ? '#3a352c' : '#d9c7a6', objFill: d ? '#d9d6cc' : '#ffffff', objLine: d ? '#b0afa6' : '#3d3c38', jar: d ? '#c9a46a' : '#e9c98f' }; };
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.roundRect(x, y, w, hh, r); }
  /** Стол и полка, общие для обеих сцен. */
  function room(c, P, K) {
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = K.wood; c.fillRect(X(S.table.x0), Y(S.table.y), X(S.wall) - X(S.table.x0) + 2, 6);
    c.fillStyle = P.ink3; c.fillRect(X(S.table.x0) + 6, Y(S.table.y) + 6, 4, H - Y(S.table.y)); c.fillRect(X(S.wall) - 10, Y(S.table.y) + 6, 4, H - Y(S.table.y));
    c.fillStyle = K.wood; c.fillRect(X(S.shelf.x0), Y(S.shelf.y), X(S.wall) - X(S.shelf.x0) + 2, S.shelf.th * SC);
    c.strokeStyle = P.ink3; c.lineWidth = 1; c.strokeRect(X(S.shelf.x0), Y(S.shelf.y), X(S.wall) - X(S.shelf.x0) + 2, S.shelf.th * SC);
  }
  /** Предмет: чашка с ручкой или банка; (x, yb) — центр дна, метры. */
  function item(c, it, x, yb, K) {
    const px = X(x), py = Y(yb), w = it.w * SC, hh = it.h * SC;
    c.lineWidth = 1.8; c.strokeStyle = K.objLine; c.fillStyle = it.w > 0.1 ? K.jar : K.objFill;
    if (it.w < 0.1) { c.beginPath(); c.arc(px + w / 2 + 1.5, py - hh * 0.55, hh * 0.24, -Math.PI / 2, Math.PI / 2); c.stroke(); }
    rr(c, px - w / 2, py - hh, w, hh, it.w > 0.1 ? 3 : [2, 2, 5, 5]); c.fill(); c.stroke();
    if (it.w > 0.1) { c.fillStyle = K.objLine; c.fillRect(px - w / 2 - 1, py - hh - 3, w + 2, 4); }
  }
  /** Ада сбоку: корпус, голова, колёсная база. */
  function ada(c, K, P) {
    c.lineWidth = 2; c.strokeStyle = K.adaLine; c.fillStyle = K.adaFill;
    rr(c, X(-0.31), Y(0.07), 0.3 * SC, 0.5 * SC, 20); c.fill(); c.stroke();
    c.beginPath(); c.arc(X(-0.16), Y(-0.1), 4, 0, 7); c.fillStyle = P.hy; c.fill();
    c.fillStyle = K.adaFill; rr(c, X(-0.27), Y(0.33), 0.24 * SC, 0.2 * SC, 18); c.fill(); c.stroke();
    rr(c, X(-0.13), Y(0.29), 0.11 * SC, 0.11 * SC, 9); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(X(-0.065), Y(0.235), 3, 4.5, 0, 0, 7); c.fill();
    c.fillStyle = K.adaFill; c.strokeStyle = K.adaLine;
    rr(c, X(-0.34), Y(-0.45), 0.36 * SC, 0.13 * SC, 10); c.fill(); c.stroke();
    for (const wx of [-0.26, -0.06]) { c.beginPath(); c.arc(X(wx), Y(-0.6), 0.045 * SC, 0, 7); c.fillStyle = P.ink3; c.fill(); }
  }
  /** Захват под кистью: пальцы раскрыты на ap метров. */
  function gripper(c, w, ap, col, lw) {
    const x = X(w.x), y = Y(w.y), hw = Math.max(0.012, ap / 2) * SC, y0 = y + 0.018 * SC, y1 = y + S.finger * SC;
    c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = lw || 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y0); c.moveTo(x - hw - 2, y0); c.lineTo(x + hw + 2, y0); c.moveTo(x - hw, y0); c.lineTo(x - hw, y1); c.moveTo(x + hw, y0); c.lineTo(x + hw, y1); c.stroke();
  }
  const objOf = (clip, tc) => {                                             // где предмет у человека в момент tc
    const it = clip.item, hd = E.handAt(clip, tc);
    if (tc >= clip.tGrip && tc < clip.tOpen) return { x: hd.x, y: hd.y - S.hang - it.h };
    return tc >= clip.tOpen ? { x: it.to, y: S.shelf.y } : { x: it.x, y: S.table.y };
  };
  /** Левая сцена: человек в очках с камерой у того же стола; tc — время видео. */
  function human(cv, clip, tc) {
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors(), sh = clip.sh(tc), dx = sh.x - 0.18, col = P.e2e;
    room(c, P, K);
    // путь кисти за весь ролик — пунктиром
    c.setLineDash([3, 4]); c.strokeStyle = rgba(col, 0.55); c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i <= 50; i++) { const p = E.handAt(clip, clip.T * i / 50); i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)); } c.stroke(); c.setLineDash([]);
    const o = objOf(clip, tc); item(c, clip.item, o.x, o.y, K);
    // тело: бёдра, корпус, голова с очками
    const hip = [X(0.05 + dx * 0.8), Y(-0.33)], shp = [X(sh.x), Y(sh.y)], head = [X(sh.x - 0.02), Y(sh.y + 0.15)];
    c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(hip[0], hip[1]); c.lineTo(X(0.0 + dx * 0.5), H + 4); c.moveTo(hip[0], hip[1]); c.lineTo(X(0.09 + dx * 0.6), H + 4); c.stroke();
    c.lineWidth = 7; c.beginPath(); c.moveTo(hip[0], hip[1]); c.lineTo(shp[0] - 3, shp[1] + 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(shp[0] - 3, shp[1]); c.lineTo(head[0], head[1] + 0.06 * SC); c.stroke();
    c.beginPath(); c.arc(head[0], head[1], 0.068 * SC, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.2; c.stroke();
    c.fillStyle = col; rr(c, head[0] + 0.05 * SC, head[1] - 4, 11, 7, 2); c.fill();
    // рука: плечо, локоть, кисть; большой и указательный пальцы
    const q = E.humanQ(clip, tc), el = [X(sh.x + E.HUM.l1 * Math.cos(q[0])), Y(sh.y + E.HUM.l1 * Math.sin(q[0]))], hd = E.handAt(clip, tc), wr = [X(hd.x), Y(hd.y)];
    c.lineWidth = 4.5; c.beginPath(); c.moveTo(shp[0], shp[1]); c.lineTo(el[0], el[1]); c.lineTo(wr[0], wr[1]); c.stroke();
    for (const p of [shp, el]) { c.beginPath(); c.arc(p[0], p[1], 3.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.8; c.stroke(); }
    const ap = E.apAt(clip, tc), hw = ap / 2 * SC;
    c.lineWidth = 2.6; c.beginPath(); c.moveTo(wr[0], wr[1]); c.lineTo(wr[0] - hw, wr[1] + 0.06 * SC); c.moveTo(wr[0], wr[1]); c.lineTo(wr[0] + hw, wr[1] + 0.06 * SC); c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.arc(wr[0] + s * hw, wr[1] + 0.06 * SC, 2.6, 0, 7); c.fillStyle = col; c.fill(); }
    const nar = k > 1.4;
    HeroKit.label(c, k, `видео: ${fmt(tc, 1)} с из ${fmt(clip.T, 1)}`, 8, 14, { px: 11.5, align: 'left', color: P.ink2, weight: 700, haloColor: P.bg });
    if (!nar) { HeroKit.label(c, k, 'очки с камерой', head[0] + 6, head[1] - 0.1 * SC, { px: 10.5, color: col, haloColor: P.bg }); HeroKit.label(c, k, 'полка', X(0.95), Y(S.shelf.y) - 9, { px: 10.5, color: P.ink3, haloColor: P.bg }); }
    HeroKit.label(c, k, 'стол', X(0.85), Y(S.table.y) + 16, { px: 10.5, color: P.ink3, haloColor: P.bg });
  }
  /** Правая сцена: Ада повторяет путь; fr — кадр прогона (или null до запуска). */
  function robot(cv, run, fi) {
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors(), clip = E.clipOf(st.clip), it = clip.item;
    room(c, P, K);
    // досягаемость: дуга радиуса L1 + L2 вокруг плеча
    c.setLineDash([4, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.arc(X(0), Y(0), E.REACH * SC, -Math.PI / 2, Math.PI / 2.6); c.stroke(); c.setLineDash([]);
    // заданный ретаргетингом путь — оранжевым пунктиром
    c.setLineDash([5, 4]); c.strokeStyle = rgba(P.e2e, 0.85); c.lineWidth = 1.8; c.beginPath();
    for (let i = 0; i <= 60; i++) { const p = E.targetAt(clip, clip.T * i / 60, st.mode); i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)); } c.stroke(); c.setLineDash([]);
    ada(c, K, P);
    const fr = run ? run.frames[Math.min(fi, run.frames.length - 1)] : null;
    if (run) { c.strokeStyle = rgba(P.cl, 0.9); c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= Math.min(fi, run.frames.length - 1); i++) { const w = run.frames[i].w; i ? c.lineTo(X(w.x), Y(w.y)) : c.moveTo(X(w.x), Y(w.y)); } c.stroke(); }
    const pv = st.preview || (st.preview = E.retarget({ clip: st.clip, mode: st.mode, slow: 1 }));
    const q = fr ? fr.q : pv.frames[0].q, obj = fr ? fr.obj : { x: it.x, y: S.table.y }, held = fr && fr.held;
    if (!held) item(c, it, obj.x, obj.y, K);
    const f = Arm.fk(q), b = [X(0), Y(0)], e = [X(f.x1), Y(f.y1)], w = [X(f.x), Y(f.y)];
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [lw, cc] of [[11, P.cl], [7, P.clS]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.stroke(); }
    gripper(c, { x: f.x, y: f.y }, fr ? fr.ap : 0.06, P.cl, 3);
    for (const p of [b, e, w]) { c.beginPath(); c.arc(p[0], p[1], 4.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.8; c.strokeStyle = P.cl; c.stroke(); }
    if (held) item(c, it, obj.x, obj.y, K);
    if (fr && fr.apH > E.GRIP_MAX + 0.005 && fr.t / st.slow < clip.tGrip + 0.05) HeroKit.label(c, k, 'нужно шире захвата', w[0], w[1] - 16, { px: 10.5, color: P.bad, weight: 700, haloColor: P.bg });
    const t = fr ? fr.t : 0;
    HeroKit.label(c, k, `Ада: ${fmt(t, 1)} с`, 8, 14, { px: 11.5, align: 'left', color: P.ink2, weight: 700, haloColor: P.bg });
    if (k < 1.4) HeroKit.label(c, k, 'досягаемость', X(0.62), Y(-0.66) + 2, { px: 10, color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, 'Ада', X(-0.16), Y(-0.24), { px: 11, color: P.ink3, weight: 700, haloColor: K.adaFill });
  }
  const WHY = (r) => ({
    ok: `${r.item.name === 'чашка' ? 'Чашка' : 'Банка'} на полке за ${fmt(r.T, 1)} с; Ада отставала от пути не больше чем на ${cm(r.maxLag)} см`,
    reach: `${fmt(r.out * 100, 0)}% пути — дальше, чем дотягивается рука Ады`,
    wide: `${r.item.name === 'банка с крупой' ? 'Банка' : 'Предмет'} шириной ${cm(r.item.w)} см, а захват Ады раскрывается только на ${cm(E.GRIP_MAX)} см`,
    table: `Пальцы Ады задели стол: в момент захвата кисть в ${cm(r.graspErr)} см от ${r.item.name === 'чашка' ? 'чашки' : 'предмета'}`,
    bump: `${r.item.name === 'чашка' ? 'Чашка задела' : 'Банка задела'} полку: Ада отставала от пути до ${cm(r.maxLag)} см и срезала угол`,
    grasp: `Захват сомкнулся в ${cm(r.graspErr)} см от ${r.item.name === 'чашка' ? 'чашки' : 'предмета'}: Ада не успела к моменту захвата`,
    place: 'Предмет поставлен мимо полки',
  }[r.why]);
  function stats() {
    const clip = E.clipOf(st.clip);
    setOut($('#rStatL'), `<b>Человек: ${fmt(clip.T, 1)} с</b> · пальцы раскрыты до ${cm(Math.max(...clip.ap.map((a) => a[1])))} см`);
    const r = st.run, el = $('#rStatR');
    if (!r) { setOut(el, 'Нажми «Запустить Аду»'); el.className = 'pane-stat'; return; }
    const done = st.f >= r.frames.length - 1;
    setOut(el, done ? `<b>${r.ok ? 'Получилось' : 'Не получилось'}.</b> ${WHY(r)}` : 'Ада повторяет путь…'); el.className = 'pane-stat' + (done ? (r.ok ? ' ok' : ' bad') : '');
  }
  function draw() {
    const clip = E.clipOf(st.clip), fr = st.run ? st.run.frames[Math.min(st.f, st.run.frames.length - 1)] : null;
    human($('#rCvL'), clip, fr ? fr.tc : 0); robot($('#rCvR'), st.run, st.f);
    setOut($('#rSubL'), CLIP[st.clip] + (st.slow > 1 ? `, замедлено ×${st.slow}` : ''));
    setOut($('#rSubR'), `ретаргетинг ${MODE[st.mode]}, замедление ×${st.slow}`);
    stats();
    const r = st.run;
    setOut($('#rOut'), r ? `Прогон: ${MODE[r.mode]}, ×${r.slow}, ${CLIP[r.clip]}. Отклонение кисти от ${r.item.name === 'чашка' ? 'чашки' : 'банки'} в момент захвата — ${r.graspErr == null ? '—' : cm(r.graspErr) + ' см'}, наибольшее отставание от пути — ${cm(r.maxLag)} см, вне досягаемости — ${fmt(r.out * 100, 0)}% пути.` : 'На одной сцене видео человека, на другой рука Ады до запуска. Оранжевый пунктир на сцене Ады показывает путь, который задаёт выбранный ретаргетинг.');
  }
  function fresh() { st.preview = null; st.run = null; st.f = 0; if (raf) cancelAnimationFrame(raf); raf = 0; st.playing = false; draw(); }
  function set(o) {
    if (st.playing) return;
    if (o.mode) { st.mode = o.mode; segSet('#rMode', st.mode); }
    if (o.slow) { st.slow = +o.slow; $('#rSlow').value = st.slow; syncRange($('#rSlow'), '×' + st.slow); }
    if (o.clip) { st.clip = o.clip; segSet('#rClip', st.clip); }
    fresh();
  }
  /** Прогон с анимацией: время Ады идёт не дольше ~6 с на экране. */
  function run(o) {
    if (o) set(o);
    const r = E.retarget({ clip: st.clip, mode: st.mode, slow: st.slow });
    st.run = r; st.f = 0; st.playing = true;
    const n = r.frames.length, dur = Math.min(6, r.T + 0.4) * 1000 / SPEED.k, t0 = performance.now();
    return new Promise((res) => {
      const step = (now) => { st.f = Math.min(n - 1, Math.floor((now - t0) / dur * n)); draw(); if (st.f < n - 1) raf = requestAnimationFrame(step); else { raf = 0; st.playing = false; draw(); res(r); } };
      raf = requestAnimationFrame(step);
    });
  }
  const api = {
    reset() { set({ mode: 'table', slow: 1, clip: 'cup' }); },
    state: () => ({ mode: st.mode, slow: st.slow, clip: st.clip, run: st.run }),
    set, run: (o) => run(o),
    /** Для разбора миссии 2: что было бы при замедлении на ступень меньше. */
    prev: (r) => (r.slow > 1 ? E.retarget({ clip: r.clip, mode: r.mode, slow: r.slow - 1 }) : null),
  };
  const missions = [
    { short: 'Один в один', title: 'Углы суставов один в один', text: 'В уроке 4.2 ведущая рука передавала роботу свои углы один в один. Попробуем так же с рукой человека: углы его плеча и локтя — руке Ады, в том же темпе, что на видео.',
      onEnter: (X) => X.set({ mode: 'joints', slow: 1, clip: 'cup' }),
      bet: { q: 'поставит ли Ада чашку на полку?', options: ['Да: в уроке 4.2 углы ведущей руки передавались роботу один в один', 'Нет: звенья у Ады другой длины, и её кисть окажется не там, где была кисть человека', 'Нет, но только потому, что человек двигается быстрее'], answer: (r) => (r.ok ? 0 : r.graspErr > 0.05 ? 1 : 2) },
      action: { label: 'Запустить Аду', run: (X) => X.run({ mode: 'joints', slow: 1, clip: 'cup' }) },
      criteria: [{ label: 'В момент захвата кисть Ады дальше 5 см от чашки', test: (r) => r.graspErr > 0.05 }, { label: 'Чашка осталась на столе', test: (r) => !r.ok }],
      explain: (r) => `В момент захвата кисть Ады оказалась в ${cm(r.graspErr)} см от чашки, и пальцы задели стол. Углы плеча и локтя человека на звеньях Ады длиной 0,5 и 0,4 м дают другую точку: рука человека от плеча до середины ладони — 0,57 м, рука Ады — 0,9 м, и плечи у них на разной высоте. Ведущая рука ALOHA и GELLO повторяет пропорции робота, поэтому её углы годятся один в один, а рука человека — нет.` },
    { short: 'Перенос', title: 'Найди перенос, при котором Ада ставит чашку', text: 'Выбери способ ретаргетинга и замедление так, чтобы Ада взяла чашку и поставила её на полку. Замедлять сильнее, чем в 4 раза, нельзя: в HAT записи людей замедляют ровно в 4 раза.',
      controls: ['mode', 'slow'], onEnter: (X) => X.set({ clip: 'cup' }),
      action: { label: 'Запустить Аду', run: (X) => X.run() },
      criteria: [{ label: 'Захват сомкнулся на чашке', test: (r) => r.graspErr != null && r.graspErr < 0.03 }, { label: 'Чашка стоит на полке', test: (r) => r.ok }, { label: 'Замедление не больше ×4', test: (r) => r.slow <= 4 }],
      summary: (r) => `${MODE[r.mode]}, ×${r.slow}: ${WHY(r)}`,
      hint: 'Сначала выбери способ, при котором путь проходит через чашку и полку: оранжевый пунктир на сцене Ады показывает его до запуска. Потом поднимай замедление, пока Ада не перестанет отставать на поворотах.',
      fail: (r) => (r.ok ? `Чашка на полке, но замедление ×${r.slow} больше ×4. Попробуй меньше.` : WHY(r) + '.'),
      explain: (r) => { const p = Retarget.api.prev(r); return `Способ «${MODE[r.mode]}» сохраняет место: человек и Ада работают у одного стола, и путь кисти переносится в координатах стола — так же, как EgoMimic переводит путь в систему камеры, чья поза известна по SLAM. При ×${r.slow} Ада отставала от пути не больше чем на ${cm(r.maxLag)} см${p && !p.ok ? `, а при ×${p.slow} отставала до ${cm(p.maxLag)} см, срезала угол и задела полку` : ''}. Пределы скорости моторов Ады в лаборатории подобраны, но порядок тот же, что в статьях: у HAT люди в среднем в 4 раза быстрее гуманоида.`; } },
    { short: 'Банка', title: 'Широкая банка', text: 'Другое видео: человек переносит на полку банку с крупой шириной 13 см и берёт её всей ладонью. Ретаргетинг — от стола, замедление ×4, как в миссии 2.',
      onEnter: (X) => X.set({ mode: 'table', slow: 4, clip: 'jar' }),
      bet: { q: 'что помешает Аде?', options: ['Ничего: настройки из миссии 2 подойдут', 'Досягаемость: банка выше и тяжелее чашки', 'Пальцы: человек обхватил банку ладонью, а захват Ады раскрывается только на 9 см'], answer: (r) => (r.ok ? 0 : r.why === 'wide' ? 2 : 1) },
      action: { label: 'Запустить Аду', run: (X) => X.run({ mode: 'table', slow: 4, clip: 'jar' }) },
      criteria: [{ label: 'Ада вовремя у банки: путь перенесён от стола и замедлен', test: (r) => r.graspErr != null && r.graspErr < 0.03 }, { label: 'Захват не охватывает банку: 13 см против 9', test: (r) => r.wide }],
      explain: () => 'Путь и время перенеслись, а хват — нет. Человек берёт банку пятью пальцами и ладонью, а у Ады два пальца, которые расходятся на 9 см. Расстояние между большим и указательным пальцами здесь 15 см — роботу такой команды не выполнить. Physical Intelligence поэтому вообще не берёт раскрытие захвата из видео людей и учит его по данным робота, а HAT и EgoScale ставят на роботов многопалые кисти и переносят на них движения пальцев человека.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Найди видео, которое Аде не повторить ни при каких настройках ретаргетинга и замедления, и посмотри, что именно мешает. Подсказка: следи за серой дугой.', final: true, controls: ['mode', 'slow', 'clip', 'run'] },
  ];
  function init() {
    legend('#rLegend', [['рука, очки с камерой и пальцы человека', 'var(--e2e)', 'solid'], ['кончики большого и указательного пальцев', 'var(--e2e)', 'dot'], ['путь, который задал ретаргетинг', 'var(--e2e)', 'dash'], ['рука Ады и путь, который прошла её кисть', 'var(--classic)', 'solid'], ['предел досягаемости Ады', 'var(--ink-3)', 'arc']]);
    segBind('#rMode', (v) => { set({ mode: v }); if (ctl) ctl.update(); });
    segBind('#rClip', (v) => { set({ clip: v }); if (ctl) ctl.update(); });
    $('#rSlow').addEventListener('input', (e) => { set({ slow: +e.target.value }); if (ctl) ctl.update(); });
    $('#rRun').addEventListener('click', () => { if (!st.playing) run(); });
    ctl = mountMissions('#rMis', missions, api, { controls: { mode: '#wrapRMode', slow: '#wrapRSlow', clip: '#wrapRClip', run: '#wrapRRun' }, scene: '#rDuo' });
    syncRange($('#rSlow'), '×' + st.slow); draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, missions };
})();

/* =====================================================================
   2. Лаборатория: сколько видео людей заменяет час робота
   ===================================================================== */
const Mix = (() => {
  const E = L44, CW = 360, SHARES = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const st = { scene: 0, share: 2, align: true, right: '0.5|1', bars: null, curve: false, busy: null, prog: 0 };
  const models = {}, checks = {}, sets = {};
  let ctl = null, test = null, lab = null;
  const testSet = () => test || (test = E.testSet());
  const labSet = () => lab || (lab = E.labSet());
  const setOf = (share) => sets[share] || (sets[share] = E.mix(share));
  const key = (share, align) => (share === 0 ? '0|1' : `${share}|${align ? 1 : 0}`);
  const COLOR = Object.fromEntries(L21.COLORS.map((q) => [q.id, q]));
  /** Обучить недостающие модели по списку ключей; общий прогресс. */
  async function trainAll(keys, tag) {
    const todo = [...new Set(keys)].filter((k) => !models[k]);
    if (!todo.length) return;
    st.busy = tag || 'train'; st.prog = 0; render();
    for (let q = 0; q < todo.length; q++) {
      const [s, a] = todo[q].split('|'), share = +s;
      models[todo[q]] = await runChunked(E.train(setOf(share).demos, { align: a === '1' }), (e) => { st.prog = (q + (e.it + 1) / e.iters) / todo.length; const now = performance.now(); if (now - (st.last || 0) > 120) { st.last = now; render(); } }, 14);
    }
    st.busy = null; st.prog = 1; render();
  }
  function check(k, where) {
    const m = models[k]; if (!m) return null;
    const ck = k + '@' + (where || 'test');
    if (!checks[ck]) checks[ck] = E.check(m, where === 'lab' ? labSet() : testSet());
    return checks[ck];
  }
  /** Сцена проверки сверху: картинка, вероятности захвата Ады оранжевой заливкой, кубик — зелёным кольцом. */
  function drawPane(cv, k) {
    const { c, k: kk } = HeroKit.fit(cv, CW, CW), P = pal(), ep = testSet()[st.scene], sc = CW / L21.TW;
    c.imageSmoothingEnabled = false; c.drawImage(bitmap(ep.img, L21.TW, L21.TW), 0, 0, CW, CW);
    const m = models[k];
    if (m) {
      const p = E.probs(m, ep); let mx = 1e-12; for (const v of p) mx = Math.max(mx, v);
      const cs = CW / L21.G; c.fillStyle = P.e2e;
      for (let i = 0; i < p.length; i++) { const a = Math.pow(p[i] / mx, 0.6); if (a < 0.04) continue; c.globalAlpha = 0.85 * a; c.fillRect((i % L21.G) * cs, Math.floor(i / L21.G) * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    const t = ep.target; c.beginPath(); c.arc(t.x * sc, t.y * sc, L21.RT * sc * 1.25, 0, 7); c.lineWidth = 3; c.strokeStyle = P.good; c.stroke();
    if (!m) HeroKit.label(c, kk, st.busy ? 'модель учится…' : 'модель ещё не обучена', CW / 2, CW / 2, { px: 13, weight: 700, color: P.ink, haloColor: P.surf });
  }
  /** Примеры из данных: демонстрации робота с перекрестием, видео людей с рукой и точкой ладони. */
  function drawThumbs(box, share) {
    const tag = 'th' + share; if (box.dataset.key === tag) return; box.dataset.key = tag; box.innerHTML = '';
    box.append(h('span', { class: 'th-l' }, 'в данных:'));
    const set = setOf(share), R = set.demos.filter((d) => d.src === 'robot'), Hm = set.demos.filter((d) => d.src === 'human');
    const nR = !Hm.length ? 6 : !R.length ? 0 : 2, pick = R.slice(0, nR).concat(Hm.slice(0, 6 - nR));
    pick.forEach((d) => {
      const cv = h('canvas', { width: 96, height: 96, 'aria-hidden': 'true', title: d.src === 'robot' ? 'демонстрация робота' : 'видео человека' }), c = cv.getContext('2d');
      c.imageSmoothingEnabled = false; c.drawImage(bitmap(d.ep.img, L21.TW, L21.TW), 0, 0);
      if (d.src === 'robot') { const q = L21.cellXY(d.cell); grip(c, q.x, q.y, 6); }
      else {
        const p = d.palm; c.lineCap = 'round';
        c.strokeStyle = 'rgba(214,160,125,0.95)'; c.lineWidth = 12; c.beginPath(); c.moveTo(p.x + 14, 100); c.lineTo(p.x + 2, p.y + 8); c.stroke();
        c.fillStyle = 'rgba(224,172,138,0.97)'; c.beginPath(); c.ellipse(p.x, p.y + 1, 8, 7, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(224,172,138,0.97)'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(p.x - 5, p.y - 2); c.lineTo(p.x - 5, p.y - 9); c.moveTo(p.x + 5, p.y - 2); c.lineTo(p.x + 5, p.y - 9); c.stroke();
        c.beginPath(); c.arc(p.x, p.y, 3.4, 0, 7); c.fillStyle = HeroKit.css('--e2e'); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#1f2430'; c.stroke();
      }
      box.append(cv);
    });
  }
  const rightShare = () => +st.right.split('|')[0], rightAlign = () => st.right.split('|')[1] === '1';
  function paneStat(k) {
    const r = check(k); if (!r) return { html: st.busy ? 'Модель учится…' : 'Модель ещё не обучена', cls: '' };
    const q = r.runs[st.scene], v = pct(q.p);
    return { html: `<b>В кубик: ${v}% попыток</b> · в 24 новых кухнях — ${pct(r.rate)}%`, cls: v >= 50 ? 'ok' : 'bad' };
  }
  function subR() {
    const s = rightShare(), set = setOf(s);
    return s === 0 ? `${set.nR} демонстраций робота` : s === 1 ? `${set.nH} видео людей, без робота` : `${set.nR} демонстр. робота и ${set.nH} видео, ${rightAlign() ? 'с выравниванием' : 'метки как есть'}`;
  }
  function bars() {
    const box = $('#mBars'); box.innerHTML = '';
    if (!st.bars) return;
    const rows = st.bars.map(([lbl, k, where]) => [lbl, check(k, where), where]);
    if (rows.some((r) => !r[1])) return;
    box.append(h('div', { class: 'sc-h muted-s' }, 'Доля попыток, в которых Ада берёт кубик: 24 новые кухни и 24 эпизода в кухнях лаборатории'));
    for (const [lbl, r, where] of rows) box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, lbl), h('div', { class: 'bt' }, h('i', { class: where === 'lab' ? 'labk' : 'ok', style: `width:${(r.rate * 100).toFixed(1)}%` })), h('span', { class: 'bn' }, `${pct(r.rate)}%`)));
  }
  /** Кривая: доля времени на видео людей → успех в новых кухнях; пунктир — только робот. */
  function chart() {
    const svg = $('#mChart'), w = Chart.width(svg, 300, 640), hh = 250, box = { l: 46, r: w - 16, t: 26, b: hh - 64 };
    svg.setAttribute('viewBox', `0 0 ${w} ${hh}`); svg.setAttribute('height', hh); Chart.clear(svg);
    const x = Chart.scaleLinear(0, 1, box.l, box.r), y = Chart.scaleLinear(0, 0.8, box.b, box.t), P = pal();
    Chart.frame(svg, box, x, y, [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: `${v * 100}` })), [0, 0.2, 0.4, 0.6, 0.8].map((v) => ({ v, label: `${v * 100}` })), { xTitle: 'доля 10 минут на видео людей, %', yTitle: 'успех в новых кухнях, %' });
    const base = check('0|1');
    if (base) { svg.append(s('line', { x1: box.l, x2: box.r, y1: y(base.rate), y2: y(base.rate), stroke: P.cl, 'stroke-width': 2, 'stroke-dasharray': '6 5' })); svg.append(s('text', { x: x(0.375), y: y(base.rate) + 17, 'text-anchor': 'middle', fill: P.cl, style: 'font-weight:650' }, `только робот: ${pct(base.rate)}%`)); }
    const lx = (box.l + box.r) / 2 - 110, ly = hh - 10;
    svg.append(s('circle', { cx: lx, cy: ly - 4, r: 4, fill: P.e2e })); svg.append(s('text', { x: lx + 8, y: ly, fill: P.ink2 }, 'с выравниванием'));
    svg.append(s('circle', { cx: lx + 140, cy: ly - 4, r: 3.5, fill: P.surf, stroke: P.ink3, 'stroke-width': 2 })); svg.append(s('text', { x: lx + 148, y: ly, fill: P.ink2 }, 'метки как есть'));
    for (const [al, col] of [[true, P.e2e], [false, P.ink3]]) {
      const pts = SHARES.map((v) => [v, check(key(v, al))]).filter((q) => q[1] && (al || q[0] > 0)).map((q) => [q[0], q[1].rate]);
      if (!al && pts.length < 1) continue;
      if (pts.length > 1) svg.append(s('path', { d: Chart.path(pts, x, y), fill: 'none', stroke: col, 'stroke-width': al ? 2.5 : 1.8, 'stroke-dasharray': al ? null : '3 4' }));
      pts.forEach(([v, r]) => { svg.append(s('circle', { cx: x(v), cy: y(r), r: al ? 4.5 : 3.5, fill: al ? col : P.surf, stroke: col, 'stroke-width': 2 })); if (al && st.curve) svg.append(s('text', { x: x(v), y: y(r) - 10, 'text-anchor': 'middle', fill: P.ink2, style: 'font-size:11.5px;font-weight:650' }, `${pct(r)}`)); });
    }
    const sel = SHARES[st.share]; svg.append(s('line', { x1: x(sel), x2: x(sel), y1: box.t, y2: box.b, stroke: P.ink3, 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    if (!st.curve && !SHARES.some((v) => v > 0 && v !== 0.5 && check(key(v, true)))) svg.append(s('text', { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 + 20, 'text-anchor': 'middle', class: 'hint' }, 'Нажми «Построить кривую» в миссии 3'));
  }
  function out() {
    const el = $('#mOut');
    if (st.busy) { setOut(el, `Модели учатся в браузере: <b>${pct(st.prog)}%</b>`); return; }
    const ep = testSet()[st.scene], kt = ep.kit, m = models[st.right];
    const sh = m && (m.shift[0] || m.shift[1]) ? ` Поправка правой модели: сдвиг на ${Math.hypot(...m.shift).toFixed(0)} ${plural(Math.round(Math.hypot(...m.shift)), 'клетку', 'клетки', 'клеток')} к человеку, около ${2 * Math.round(Math.hypot(...m.shift))} см.` : '';
    setOut(el, `Кухня проверки ${st.scene + 1} из 24: скатерть — ${E.TABLES[kt.table].name}, свет — ${E.LIGHTS[kt.light].name}, кубик ${COLOR[kt.cube].m}, рядом ${kt.objs.map((j) => L21.phrase(E.OTHERS[j].color, E.OTHERS[j].shape)).join(', ')}.${sh}`);
  }
  function render() {
    for (const [k, L] of [['0|1', 'L'], [st.right, 'R']]) {
      drawPane($('#mCv' + L), k);
      const sp = paneStat(k); setOut($('#mStat' + L), sp.html); $('#mStat' + L).className = 'pane-stat' + (sp.cls ? ' ' + sp.cls : '');
    }
    drawThumbs($('#mThL'), 0); drawThumbs($('#mThR'), rightShare());
    setOut($('#mSubR'), subR());
    bars(); out(); if (!$('#wrapMChart').hidden) chart();
    const pg = $('#mProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
  }
  function setScene(i) { st.scene = Math.max(0, Math.min(23, i)); const inp = $('#mScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); if (ctl) ctl.update(); }
  /** Правая модель: доля и выравнивание; недостающая модель учится сразу. */
  async function setRight(share, align) {
    st.share = SHARES.indexOf(share); st.align = align; st.right = key(share, align);
    $('#mShare').value = st.share; syncRange($('#mShare'), `${share * 100}%`); segSet('#mAlign', align ? '1' : '0');
    render();
    if (!st.busy && !models[st.right]) await trainAll([st.right], 'free');
    render(); if (ctl) ctl.update();
  }
  const R = (k, w) => check(k, w).rate;
  const api = {
    reset() { st.bars = null; st.curve = false; setRight(0.5, true); setScene(0); },
    state: () => ({ scene: st.scene, right: st.right, busy: !!st.busy, share: SHARES[st.share], align: st.align }),
    setScene, setRight, models: () => Object.keys(models),
    /** Миссия 1: только робот против смеси пополам с выравниванием. */
    async first() {
      await trainAll(['0|1', '0.5|1'], 'm1');
      st.bars = [['Только робот, новые кухни', '0|1'], ['Робот и видео людей, новые кухни', '0.5|1'], ['Только робот, кухни лаборатории', '0|1', 'lab'], ['Робот и видео людей, кухни лаборатории', '0.5|1', 'lab']];
      await setRight(0.5, true);
      const a = check('0|1'), b = check('0.5|1'); let best = 0; a.runs.forEach((q, i) => { if (b.runs[i].p - q.p > b.runs[best].p - a.runs[best].p) best = i; });
      setScene(best);
      return { robot: a.rate, mix: b.rate, robotLab: R('0|1', 'lab'), mixLab: R('0.5|1', 'lab'), best, bestR: a.runs[best].p, bestM: b.runs[best].p, bestCube: testSet()[best].kit.cube, shift: models['0.5|1'].shift };
    },
    /** Миссия 2: та же смесь без выравнивания. */
    async raw() {
      await trainAll(['0|1', '0.5|1', '0.5|0'], 'm2');
      st.bars = [['Только робот, новые кухни', '0|1'], ['С выравниванием, новые кухни', '0.5|1'], ['Метки как есть, новые кухни', '0.5|0'], ['Метки как есть, кухни лаборатории', '0.5|0', 'lab']];
      await setRight(0.5, false);
      // насколько ниже кубика модель без выравнивания ставит захват: средний сдвиг самой вероятной клетки
      const r = check('0.5|0'), a = check('0.5|1'), ts = testSet(); let dy = 0, best = 0; r.runs.forEach((q, i) => { dy += L21.cellXY(q.cell).y - ts[i].target.y; if (a.runs[i].p - q.p > a.runs[best].p - r.runs[best].p) best = i; }); dy /= r.runs.length;
      setScene(best);
      return { robot: R('0|1'), mix: R('0.5|1'), raw: R('0.5|0'), robotLab: R('0|1', 'lab'), rawLab: R('0.5|0', 'lab'), dy };
    },
    /** Миссия 3: кривая по доле времени на видео людей. */
    async curve() {
      await trainAll(SHARES.map((v) => key(v, true)), 'm3');
      st.curve = true; st.bars = null; $('#wrapMChart').hidden = false;
      await setRight(0.75, true);
      const v = SHARES.map((x) => R(key(x, true))), sets9 = setOf(0.9);
      return { v, robot: v[0], shift9: models[key(0.9, true)].shift, n9: sets9.nR, best: v.indexOf(Math.max(...v)), sets: SHARES.map((x) => setOf(x)) };
    },
  };
  const SH_TXT = (i) => `${SHARES[i] * 100}%`;
  const missions = [
    { short: 'Ставка', title: 'Десять минут: только робот или пополам', text: 'Левая модель учится на 22 демонстрациях робота из двух кухонь лаборатории — это все 10 минут. Правая — на 5 минутах робота и 5 минутах видео людей: 11 демонстраций и 117 видео из разных кухонь, с выравниванием. Нажми кнопку: модели обучатся в браузере, и каждую проверят в 24 новых кухнях и в 24 эпизодах в кухнях лаборатории.',
      controls: ['scene'],
      bet: { q: 'какая модель чаще возьмёт кубик в новых кухнях?', options: ['Только робот: его метки точные, а рука человека — другое тело', 'Поровну: времени на запись одинаково', 'Робот и видео людей'], answer: (r) => (r.mix > r.robot + 0.05 ? 2 : r.robot > r.mix + 0.05 ? 0 : 1) },
      action: { label: 'Обучить обе модели и проверить', run: (X) => X.first() },
      criteria: [{ label: 'В кухнях лаборатории обе берут кубик не меньше чем в 95% попыток', test: (r) => r.robotLab >= 0.95 && r.mixLab >= 0.95 }, { label: 'В новых кухнях смесь удачнее хотя бы в 1,3 раза', test: (r) => r.mix >= 1.3 * r.robot }],
      explain: (r) => `В кухнях лаборатории обе модели почти не ошибаются: ${pct(r.robotLab)}% и ${pct(r.mixLab)}%. В новых кухнях модель только на роботе берёт кубик в ${pct(r.robot)}% попыток, смесь — в ${pct(r.mix)}%. Демонстраций робота у смеси вдвое меньше, зато видео людей принесли 117 разных кухонь, а 11 демонстраций хватило, чтобы найти поправку: сдвиг на ${Math.round(Math.hypot(...r.shift))} ${plural(Math.round(Math.hypot(...r.shift)), 'клетку', 'клетки', 'клеток')} от ладони к месту захвата. На сцене кухня ${r.best + 1}, где разница больше всего: ${pct(r.bestR)}% против ${pct(r.bestM)}%. Похоже и в HAT: в знакомых условиях видео людей добавили немного, 49 удачных попыток из 60 против 42, а в новых — 101 из 170 против 59.` },
    { short: 'Как есть', title: 'Метки людей без выравнивания', text: 'Та же смесь — 11 демонстраций и 117 видео, — но метки людей берём как есть: модель учится на всех примерах вперемешку, без поправки между ладонью и местом захвата.',
      controls: ['scene'],
      bet: { q: 'что будет с успехом в новых кухнях?', options: ['Почти то же: 117 видео перевесят неточность меток', 'Станет хуже, чем у модели только на роботе', 'Станет лучше: без поправки модель свободнее'], answer: (r) => (r.raw < r.robot - 0.03 ? 1 : r.raw > r.mix + 0.03 ? 2 : 0) },
      action: { label: 'Обучить модель без выравнивания', run: (X) => X.raw() },
      criteria: [{ label: 'Без выравнивания успех ниже, чем у модели только на роботе', test: (r) => r.raw < r.robot }, { label: 'Даже в кухнях лаборатории модель промахивается намного чаще', test: (r) => r.rawLab < r.robotLab - 0.2 }],
      explain: (r) => `Без выравнивания — ${pct(r.raw)}% в новых кухнях против ${pct(r.robot)}% у одного робота и ${pct(r.mix)}% с выравниванием, а в кухнях лаборатории — ${pct(r.rawLab)}% против ${pct(r.robotLab)}%. Видео людей в смеси в десять раз больше, и модель учится ставить захват туда, где была ладонь: самая вероятная клетка в среднем на ${fmt(r.dy / 2, 1)} см ближе к человеку, чем центр кубика. В EgoMimic то же видно по абляции: без нормировки действий для каждого источника — 79 баллов вместо 128, почти как без данных людей вовсе.` },
    { short: 'Кривая', title: 'Сколько времени отдать видео людей', text: 'Те же 10 минут делим по-разному: 0, 25, 50, 75, 90 и 100% времени — на видео людей, остальное — на робота. Все модели с выравниванием. Построй кривую.',
      controls: ['scene', 'chart'],
      bet: { q: 'что будет, если все 10 минут отдать видео людей: 233 видео и ни одной демонстрации робота?', options: ['Лучше всего: видео в десять раз больше', 'Хуже, чем при нескольких демонстрациях робота', 'Почти так же, как при 90%'], answer: (r) => (r.v[5] >= Math.max(...r.v) - 0.01 ? 0 : Math.abs(r.v[5] - r.v[4]) < 0.05 ? 2 : 1) },
      action: { label: 'Построить кривую', run: (X) => X.curve() },
      criteria: [{ label: 'Кривая построена для шести долей', test: (r) => r.v.length === 6 }, { label: 'Наибольший успех там, где есть и робот, и люди', test: (r) => r.best > 0 && r.best < 5 }],
      explain: (r) => `Только робот — ${pct(r.v[0])}%, четверть времени на видео людей — ${pct(r.v[1])}%, половина — ${pct(r.v[2])}%, три четверти — ${pct(r.v[3])}%, 90% — ${pct(r.v[4])}%, всё время — ${pct(r.v[5])}%. Лучше всего ${SH_TXT(r.best)}: ${r.sets[r.best].nR} демонстраций робота и ${r.sets[r.best].nH} видео. При 90% остаётся ${r.n9} ${plural(r.n9, 'демонстрация', 'демонстрации', 'демонстраций')} робота, и поправка выходит неточной — сдвиг на ${Math.round(Math.hypot(...r.shift9))} клетки вместо одной. Без робота поправку взять неоткуда, и модель берёт там, где у людей была ладонь. В статьях пропорции другие, но вывод тот же: у EgoScale на этапе выравнивания 50 часов людей и 4 часа робота.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай долю времени на видео людей и переключай выравнивание: правая модель обучится заново. Найди самую большую долю видео людей, при которой смесь всё ещё обходит модель только на роботе, и проверь, как без выравнивания меняется кривая.', final: true, controls: ['scene', 'share', 'align', 'chart'] },
  ];
  function init() {
    legend('#mLegend', [['вероятность сомкнуть захват в клетке', 'var(--e2e)', 'band'], ['кубик, который надо взять', 'var(--good)', 'ring'], ['демонстрация робота: где оператор сомкнул захват', '#ffffff', 'grip'], ['видео человека: ладонь по трекеру рук — метка', 'var(--e2e)', 'dot']]);
    $('#mScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    $('#mShare').addEventListener('input', (e) => { const i = +e.target.value; syncRange(e.target, SH_TXT(i)); if (!st.busy) setRight(SHARES[i], st.align); });
    segBind('#mAlign', (v) => { if (!st.busy) setRight(SHARES[st.share], v === '1'); });
    ctl = mountMissions('#mMis', missions, api, { controls: { scene: '#wrapMScene', share: '#wrapMShare', align: '#wrapMAlign', chart: '#wrapMChart' }, scene: '#mDuo', onStep: () => render() });
    syncRange($('#mScene'), '1'); syncRange($('#mShare'), '50%'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, missions };
})();

/* =====================================================================
   3. Интерактив: собери обработку ролика с очков
   ===================================================================== */
const Pipeline = (() => {
  // шаг: подпись, какой разрыв закрывает, что должно стоять раньше
  const STEPS = [
    { id: 'slam', t: 'SLAM: поза камеры в каждом кадре', gap: 'метки', need: [] },
    { id: 'hands', t: 'Трекер рук: 3D-точки кисти и пальцев', gap: 'метки', need: [] },
    { id: 'frame', t: 'Путь кисти — в систему камеры момента t', gap: 'координаты', need: ['slam', 'hands'] },
    { id: 'grip', t: 'Раскрытие захвата — по большому и указательному пальцам', gap: 'пальцы', need: ['hands'] },
    { id: 'tips', t: 'Кончики пяти пальцев — на кисть робота напрямую', gap: 'пальцы', need: ['hands'] },
    { id: 'norm', t: 'Нормировать действия отдельно для людей и для робота', gap: 'распределения', need: ['frame'] },
    { id: 'mask', t: 'Закрасить руку и робота на кадрах, провести линию', gap: 'вид', need: ['hands'] },
    { id: 'jitter', t: 'Случайно менять цвета и размывать кадры при обучении', gap: 'вид', need: [] },
    { id: 'slow', t: 'Замедлить записи человека в 4 раза', gap: 'скорость', need: ['frame'] },
    { id: 'text', t: 'Подписать подзадачи словами', gap: 'метки', need: [] },
    { id: 'joints', t: 'Углы плеча и локтя человека — роботу один в один', gap: 'координаты', need: ['hands'] },
  ];
  const BY = Object.fromEntries(STEPS.map((s) => [s.id, s]));
  const st = { chain: [], checked: null };
  let ctl = null;
  /** Проверка цепочки: у каждого шага — на месте ли то, что нужно раньше; шаг «углы один в один» портит перенос. */
  function verdict() {
    const pos = Object.fromEntries(st.chain.map((id, i) => [id, i]));
    const rows = st.chain.map((id, i) => {
      const s = BY[id], miss = s.need.filter((n) => pos[n] == null || pos[n] > i);
      if (id === 'joints') return { id, ok: false, why: 'У руки человека другие пропорции: углы один в один уводят кисть робота мимо цели (лаборатория 1).' };
      if (miss.length) return { id, ok: false, why: 'Раньше должно стоять: ' + miss.map((n) => { const w = BY[n].t.split(':')[0]; return /^\p{Lu}{2}/u.test(w) ? w : w[0].toLowerCase() + w.slice(1); }).join(', ') + '.' };
      return { id, ok: true, why: '' };
    });
    const ok = (id) => rows.some((r) => r.id === id && r.ok), has = (id) => pos[id] != null;
    return { rows, ok, has, order: rows.every((r) => r.ok), n: st.chain.length };
  }
  function render() {
    const pool = $('#pPool'), chain = $('#pChain'); pool.innerHTML = ''; chain.innerHTML = '';
    const v = st.checked ? verdict() : null;
    for (const s of STEPS) {
      const b = h('button', { type: 'button', class: 'pl-step', 'data-id': s.id, disabled: st.chain.includes(s.id) || null }, h('span', { class: 'gap' }, s.gap), s.t);
      pool.append(b);
    }
    st.chain.forEach((id, i) => {
      const s = BY[id], row = v ? v.rows[i] : null;
      const li = h('li', { class: row ? (row.ok ? 'ok' : 'bad') : null }, h('button', { type: 'button', class: 'pl-step', 'data-id': id }, h('span', { class: 'gap' }, s.gap), s.t));
      if (row && row.why) li.append(h('span', { class: 'why' }, row.why));
      chain.append(li);
    });
    const gaps = [...new Set(st.chain.filter((id) => !v || v.ok(id)).map((id) => BY[id].gap))];
    setOut($('#pOut'), st.chain.length ? `В цепочке ${st.chain.length} ${plural(st.chain.length, 'шаг', 'шага', 'шагов')}. Закрыто: ${gaps.join(', ') || 'ничего'}.` : 'Цепочка пуста.');
  }
  function toggle(id) { const i = st.chain.indexOf(id); if (i >= 0) st.chain.splice(i, 1); else st.chain.push(id); st.checked = null; render(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.chain = []; st.checked = null; render(); },
    state: () => ({ chain: st.chain.slice() }),
    setChain(ids) { st.chain = ids.slice(); st.checked = null; render(); },
    async check() { st.checked = true; render(); await wait(150); return verdict(); },
  };
  const base = (v) => v.ok('slam') && v.ok('hands') && v.ok('frame');
  const missions = [
    { short: 'Метки', title: 'Метки действий для Ады', text: 'Робот — Ада: рука с двухпалым захватом, камера на голове. Собери самую короткую цепочку, после которой у каждого кадра есть действие: путь кисти и команда захвата. Потом нажми «Проверить цепочку».',
      action: { label: 'Проверить цепочку', run: (X) => X.check() },
      criteria: [{ label: 'Путь кисти переведён в систему камеры, и всё нужное для этого стоит раньше', test: (v) => base(v) }, { label: 'Есть команда захвата для двух пальцев', test: (v) => v.ok('grip') }, { label: 'Нет шагов, которые портят перенос, и лишних шагов', test: (v) => v.order && !v.has('joints') && v.n <= 4 }],
      hint: 'Действие для кадра — это будущий путь кисти относительно камеры этого кадра. Для него нужны поза камеры и точки кисти, а для захвата — расстояние между двумя пальцами.',
      fail: (v) => (v.has('joints') ? 'В цепочке есть углы суставов один в один: в лаборатории 1 они увели кисть Ады на 17 см от чашки.' : !v.order ? 'Порядок нарушен: шаг, отмеченный красным, стоит раньше того, что ему нужно.' : v.n > 4 ? 'Работает, но длиннее, чем нужно: оставь только то, без чего нет действия.' : 'Чего-то не хватает: посмотри на критерии.'),
      explain: () => 'Это минимум, без которого видео не даёт действий: SLAM и трекер рук в любом порядке, потом перевод пути в систему камеры и раскрытие захвата. EgoMimic берёт и позу очков, и позы рук из записей очков Aria: их считает сервис обработки данных Aria по боковым камерам.' },
    { short: 'EgoMimic', title: 'Одна политика на человеке и роботе', text: 'Теперь человек и робот учат одну политику, как в EgoMimic: у робота две руки ViperX с двухпалыми захватами. Добавь к цепочке шаги, которые закрывают разрывы распределений и вида, и проверь.',
      onEnter: (X) => { if (!X.state().chain.length) X.setChain(['slam', 'hands', 'frame', 'grip']); },
      bet: { q: 'какой из двух шагов EgoMimic по абляциям дал больше?', options: ['Маска на кадрах: рука и робот выглядят совсем по-разному', 'Нормировка действий для каждого источника', 'Одинаково'], answer: () => 1 },
      action: { label: 'Проверить цепочку', run: (X) => X.check() },
      criteria: [{ label: 'Минимум из миссии 1 на месте', test: (v) => base(v) && v.ok('grip') }, { label: 'Действия нормированы после перевода в систему камеры', test: (v) => v.ok('norm') }, { label: 'Рука и робот закрашены на кадрах', test: (v) => v.ok('mask') }, { label: 'Нет углов один в один', test: (v) => !v.has('joints') }],
      explain: () => 'По таблице IV статьи: без нормировки действий EgoMimic набирает 79 баллов вместо 128, без маски и линии — 95. Нормировка важнее: без неё политика учит два разных распределения действий, как модель «как есть» во второй лаборатории.' },
    { short: 'HAT', title: 'Гуманоид с пятипалыми кистями', text: 'Робот — гуманоид Unitree H1 с пятипалыми кистями, как в HAT, а данных людей много и они разнообразные. Собери цепочку по рецепту HAT: маски не нужны, пальцы переносятся без захвата.',
      onEnter: (X) => X.setChain(['slam', 'hands', 'frame']),
      action: { label: 'Проверить цепочку', run: (X) => X.check() },
      criteria: [{ label: 'Записи людей замедлены', test: (v) => v.ok('slow') }, { label: 'Кончики пальцев переносятся напрямую, двухпалого захвата нет', test: (v) => v.ok('tips') && !v.has('grip') }, { label: 'Вид закрыт искажениями кадров, без масок', test: (v) => v.ok('jitter') && !v.has('mask') }, { label: 'Порядок верный, углов один в один нет', test: (v) => v.order && !v.has('joints') }],
      explain: () => 'В HAT состояние и действие человека и робота — одни и те же 54 числа: повороты головы и запястий, положения запястий и десяти кончиков пальцев. Без замедления в 4 раза — 1 удачный захват из 10, без общего пространства — 0, с обоими — 4. Разрыв вида при большом наборе закрывают случайным изменением цветов и размытием.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Собери рецепт Physical Intelligence для π0.5 + ego: какие шаги из списка они делают, а каких нарочно нет? Сверься с разделом «Перенос и масштаб» ниже.', final: true },
  ];
  function init() {
    $('#pPool').addEventListener('click', (e) => { const b = e.target.closest('.pl-step'); if (b && !b.disabled) toggle(b.dataset.id); });
    $('#pChain').addEventListener('click', (e) => { const b = e.target.closest('.pl-step'); if (b) toggle(b.dataset.id); });
    $('#pReset').addEventListener('click', () => { st.chain = []; st.checked = null; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#pMis', missions, api, { scene: '#pChain' });
    render();
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
    { q: 'Ego4D — готовый набор для обучения политики робота?', o: ['Да: 3670 часов демонстраций', 'Нет: это видео от первого лица с описаниями словами, действий робота в нём нет; первые работы брали из него только кадры для предобучения энкодера', 'Нет: это записи телеоперации роботов'], a: 1, e: 'Ego4D собирали для задач восприятия. Чтобы видео учило действовать, действие приходится восстанавливать: трекером рук и SLAM, моделью обратной динамики или латентными действиями.' },
    { q: 'Ведущая рука ALOHA передаёт роботу углы один в один. Можно ли так же передать роботу углы руки человека?', o: ['Да, это одно и то же', 'Нет: ведущая рука повторяет пропорции робота, а у человека другие длины звеньев и положение плеча, и кисть робота окажется не там', 'Да, если замедлить запись'], a: 1, e: 'В лаборатории 1 углы человека на руке Ады увели её кисть на 17 см от чашки. Работает перенос пути кисти в общей системе координат — стола или камеры.' },
    { q: 'Почему модели обратной динамики нужно меньше данных, чем политике?', o: ['Она меньше по размеру', 'Она видит и кадр до действия, и кадр после, а политика по прошлому должна угадать намерение', 'Ей не нужны метки'], a: 1, e: 'В VPT довольно точную модель обратной динамики получали уже по 100 часам размеченной игры, а размечала она около 70 тысяч часов роликов.' },
    { q: 'Что MimicPlay берёт из видео людей?', o: ['Готовые команды для руки робота', 'План: латентный вектор, по которому предсказывается трёхмерный путь руки; движения захвата нижний уровень учит по телеоперации', 'Только кадры для энкодера'], a: 1, e: '10 минут игры человека на среду и меньше 30 минут телеоперации. Ограничение — точность нижнего уровня, который видео людей не учат.' },
    { q: 'Какой шаг выравнивания в EgoMimic оказался важнее всего?', o: ['Красная линия на кадрах', 'Нормировка действий отдельно для людей и для робота', 'Маска на руке'], a: 1, e: 'Без нормировки — 79 баллов вместо 128, без маски и линии — 95, без линии — 112, без данных рук — 68.' },
    { q: 'В HAT видео людей подняли успех и в знакомых условиях, и в новых одинаково?', o: ['Да, везде примерно вдвое', 'Нет: в знакомых прибавка меньше (49 из 60 против 42), в новых больше — 101 из 170 против 59', 'Нет: только в знакомых'], a: 1, e: 'Видео людей приносят разнообразие фонов, предметов и расположений, которого нет в данных робота. На столе Ады так же: в кухнях лаборатории обе модели почти не ошибались.' },
    { q: 'Physical Intelligence добавила видео людей к π0.5. Помогли бы они любой VLA?', o: ['Да, видео людей помогают всегда', 'Нет: без предобучения и при 25% разнообразия данных роботов выигрыша не было, он появился при 75–100%', 'Нет: только моделям без предобучения'], a: 1, e: 'С ростом разнообразия предобучения представления кадров человека и робота внутри модели сходятся. Авторы считают перенос свойством, которое появляется с масштабом.' },
    { q: 'Если видео людей в десять раз дешевле, выгоднее отдать им всё время записи?', o: ['Да, данных будет в десять раз больше', 'Нет: несколько демонстраций робота нужны, чтобы связать руку человека с захватом робота', 'Нет: видео людей вообще не помогают'], a: 1, e: 'На столе Ады без единой демонстрации робота успех 22% против 54% у смеси с шестью демонстрациями. У EgoScale на этапе выравнивания — 50 часов людей и 4 часа робота.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('retarget', () => { mis.retarget = Retarget.init(); });
    safe('mix', () => { mis.mix = Mix.init(); });
    safe('pipeline', () => { mis.pipeline = Pipeline.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['rMis', 'mMis', 'pMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l44 = { mis, SPEED, Retarget, Mix, Pipeline, L44 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
