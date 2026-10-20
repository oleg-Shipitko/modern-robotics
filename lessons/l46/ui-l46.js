/* =====================================================================
   ui-l46.js — урок 4.6 «Пирамида данных и маховик». Схемы и интерактивы:
   0) анимированные схемы (shared/anim.js): пирамида данных — как слои
      попадают в одну модель; маховик — смена, разметка, переобучение;
   1) интерактив: восемь источников по трём слоям пирамиды (shared/cards.js);
   2) лаборатория «Бюджет данных»: демонстрации робота, симуляция и видео
      людей при одном бюджете, две модели рядом на одном доме проверки;
   3) лаборатория «Парк Ады»: смены парка, разметка отказов, переобучение;
   4) квиз.
   Движок — l46/engine.js (без DOM) поверх l21/engine.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const pct = (v) => Math.round(v * 100);
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Картинка движка (RGB 0…1) → холст того же размера; кэш по объекту картинки. */
const BM = new WeakMap();
function bitmap(img, w, hgt) {
  if (BM.has(img)) return BM.get(img);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); BM.set(img, cv); return cv;
}

/* =====================================================================
   0а. Схема: как слои пирамиды попадают в одну модель
   ===================================================================== */
(() => {
  const T = 11;                                                         // секунд на цикл: 8 примеров в пачку, потом пачка — в модель
  const SEQ = ['r', 'v', 's', 'r', 's', 'v', 'r', 's'];                 // откуда 8 примеров пачки: роботы 3, синтетика 3, видео 2
  const STEP = 0.95, FILL = SEQ.length * STEP;
  const LAYER = { r: 0, s: 1, v: 2 };
  const NAME = { r: ['записи роботов', 'мало, точно'], s: ['симуляция и сгенерированное видео', 'больше, но мир другой'], v: ['веб-данные и видео людей', 'больше всего, без действий робота'] };
  const NAME_N = { r: ['роботы', ''], s: ['синтетика', 'мир другой'], v: ['веб и видео людей', 'без действий робота'] };
  /** Цвет слоя: роботы — синий, синтетика — фиолетовый, люди — оранжевый. */
  const col = (P, k) => (k === 'r' ? P.out : k === 's' ? P.spr : P.mot);
  function pyr(c, k, P, A, G) {
    const { lab, alpha } = A, { px, py, pw, ph } = G;
    const xAt = (y, side) => px + side * (pw / 2) * ((y - py) / ph);
    const bands = [['r', py, py + ph * 0.34], ['s', py + ph * 0.34, py + ph * 0.66], ['v', py + ph * 0.66, py + ph]];
    for (const [key, y0, y1] of bands) {
      c.beginPath(); c.moveTo(xAt(y0, -1), y0); c.lineTo(xAt(y0, 1), y0); c.lineTo(xAt(y1, 1), y1); c.lineTo(xAt(y1, -1), y1); c.closePath();
      c.fillStyle = alpha(col(P, key), 0.16); c.fill(); c.strokeStyle = col(P, key); c.lineWidth = 1.6; c.stroke();
      const nm = G.narrow ? NAME_N[key] : NAME[key], ym = (y0 + y1) / 2 + (key === 'r' ? 14 : 0);
      const aw = Math.max(40, pw * ((ym - py) / ph) - 14), fitPx = (txt, p0, wt) => { let p = p0; A.K.font(c, k, p, wt); while (p > 8.5 && c.measureText(txt).width > aw) { p -= 0.5; A.K.font(c, k, p, wt); } return p; };
      lab(c, k, nm[0], px, ym - (nm[1] ? 8 : 0), { px: fitPx(nm[0], key === 'r' ? 10.5 : 11, 700), weight: 700, color: col(P, key), haloColor: P.surf });
      if (nm[1]) lab(c, k, nm[1], px, ym + 8, { px: fitPx(nm[1], 10, 600), color: P.ink3, haloColor: P.surf });
    }
    if (!G.narrow) {                                                    // ось справа: вверх — ближе к роботу, вниз — больше данных
      const ax = px + pw / 2 + 26;
      A.arrow(c, ax, py + ph * 0.5, ax, py + 6, P.ink3, 1.5, 6); A.arrow(c, ax, py + ph * 0.5, ax, py + ph - 4, P.ink3, 1.5, 6);
      lab(c, k, 'ближе к роботу', ax, py - 8, { px: 10, color: P.ink3, haloColor: P.surf });
      lab(c, k, 'больше данных', ax, py + ph + 12, { px: 10, color: P.ink3, haloColor: P.surf });
    }
    return (key) => { const [, y0, y1] = bands[LAYER[key]]; return [px + (key === 'r' ? 0 : pw * 0.22), (y0 + y1) / 2 + (key === 'r' ? 26 : 14)]; };
  }
  function draw(c, k, t, P, A, G) {
    const { lab, rect, line, alpha, ease, seg } = A, u = ((t % T) + T) % T;
    const from = pyr(c, k, P, A, G), { idm, bx, by, bw, bh, mx, my, mw, mh } = G;
    // блок восстановления действий для видео
    rect(c, idm[0] - idm[2] / 2, idm[1] - 15, idm[2], 30, 7, alpha(P.mot, 0.12), P.mot, 1.4);
    A.K.font(c, k, 10, 600); const idmLong = 'латентные действия, обратная динамика';
    lab(c, k, G.narrow || c.measureText(idmLong).width > idm[2] - 10 ? 'действия по кадрам' : idmLong, idm[0], idm[1], { px: 10, weight: 600, color: P.mot, halo: false });
    // пачка обучения
    rect(c, bx, by, bw, bh, 8, P.surf, P.ink3, 1.4);
    lab(c, k, 'пакет обучения', bx + bw / 2, by - 12, { px: 11, weight: 700, color: P.ink2, haloColor: P.surf });
    const n = Math.min(SEQ.length, Math.floor(u / STEP)), slotW = (bw - 12) / 4, slotH = (bh - 12) / 2;
    const slot = (i) => [bx + 6 + (i % 4) * slotW + slotW / 2, by + 6 + Math.floor(i / 4) * slotH + slotH / 2];
    const into = seg(u, FILL + 0.4, FILL + 2.2), fade = 1 - seg(u, T - 0.6, T);
    for (let i = 0; i < n; i++) {                                      // уже лежащие в пачке примеры
      const key = SEQ[i], [sx, sy] = slot(i), mv = ease(into), x = sx + (mx + mw / 2 - sx) * mv, y = sy + (my + mh / 2 - sy) * mv;
      c.globalAlpha = fade * (1 - 0.7 * mv);
      rect(c, x - 9, y - 7, 18, 14, 3, alpha(col(P, key), 0.85), null);
      if (key === 'v') rect(c, x + 4, y - 10, 8, 6, 2, P.mot, P.surf, 1);
      c.globalAlpha = 1;
    }
    if (u < FILL) {                                                     // пример в пути: от слоя к пачке (видео — через восстановление действий)
      const i = Math.floor(u / STEP), key = SEQ[i], s = ease(Math.min(1, (u - i * STEP) / (STEP * 0.85))), [x0, y0] = from(key), [x1, y1] = slot(i);
      let x, y;
      if (key === 'v') { const s1 = Math.min(1, s * 2), s2 = Math.max(0, s * 2 - 1); if (s < 0.5) { x = x0 + (idm[0] - x0) * s1; y = y0 + (idm[1] - y0) * s1; } else { x = idm[0] + (x1 - idm[0]) * s2; y = idm[1] + (y1 - idm[1]) * s2; } }
      else { x = x0 + (x1 - x0) * s; y = y0 + (y1 - y0) * s; }
      line(c, key === 'v' ? [[x0, y0], idm, [x1, y1]] : [[x0, y0], [x1, y1]], alpha(col(P, key), 0.45), 1.4, [4, 4], -t * 30);
      rect(c, x - 9, y - 7, 18, 14, 3, col(P, key), null);
      if (key === 'v' && s >= 0.5) rect(c, x + 4, y - 10, 8, 6, 2, P.mot, P.surf, 1);
    }
    // модель: общая часть и два выхода
    const glow = seg(u, FILL + 1.6, FILL + 2.6) * (1 - seg(u, T - 0.8, T));
    rect(c, mx, my, mw, mh, 9, alpha(P.ink3, 0.08 + 0.12 * glow), P.ink2, 1.6);
    lab(c, k, 'модель', mx + mw / 2, my + mh / 2 - 8, { px: 11.5, weight: 700, color: P.ink, halo: false });
    lab(c, k, 'общая часть', mx + mw / 2, my + mh / 2 + 9, { px: 10, color: P.ink3, halo: false });
    G.outs.forEach(([fx, ox, oy, txt, key]) => {
      A.arrow(c, fx, my + mh, ox, oy, alpha(col(P, key), 0.35 + 0.65 * glow), 1.8, 6);
      lab(c, k, txt, ox, oy + 12, { px: 10.5, weight: 650, color: col(P, key), haloColor: P.surf });
    });
    lab(c, k, G.narrow ? 'в пакете: роботы 3, синтетика 3, видео 2' : 'доли пакета задают веса смеси: здесь роботы 3, синтетика 3, видео 2 из 8', G.note[0], G.note[1], { px: 10, color: P.ink3, haloColor: P.surf });
  }
  Anim.add('pyramid', {
    W: 720, H: 360, start: 4.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { px: 160, py: 36, pw: 280, ph: 256, idm: [446, 282, 196], bx: 466, by: 118, bw: 124, bh: 74, mx: 612, my: 100, mw: 96, mh: 108, outs: [[634, 628, 246, 'действия робота', 'r'], [686, 640, 290, 'латентные действия', 'v']], note: [360, 346] }); },
    narrow: { W: 360, H: 650, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, px: 180, py: 20, pw: 300, ph: 240, idm: [92, 330, 150], bx: 196, by: 316, bw: 146, bh: 80, mx: 128, my: 436, mw: 104, mh: 84, outs: [[156, 96, 578, 'действия робота', 'r'], [204, 264, 578, 'латентные действия', 'v']], note: [180, 634] }); } },
  });
})();

/* =====================================================================
   0б. Схема: маховик данных — смена, записи, разметка, переобучение
   Числа — запуск лаборатории 2 (16 роботов, разметка половины отказов,
   зерно 1); тест сверяет их с движком.
   ===================================================================== */
const FLY_ANIM = { rate: [35, 58, 70, 67, 74], shifts: [[48, 19, 29], [50, 21, 25], [73, 15, 8], [61, 13, 22]] };
(() => {
  const TT = 5, NT = FLY_ANIM.shifts.length, T = TT * NT + 2.5, ND = 10;
  const ST = [['роботы работают', 'в чужих домах'], ['записи смены', 'удачи и отказы'], ['люди размечают', 'отказы'], ['обучение', 'модели заново']];
  const ANG = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const stCol = (P, i) => (i === 2 ? P.mot : i === 3 ? P.spr : P.out);
  function draw(c, k, t, P, A, G) {
    const { lab, rect, circle, line, alpha, seg, ease } = A, u = ((t % T) + T) % T, turn = Math.min(NT - 1, Math.floor(u / TT)), v = u >= TT * NT ? TT : u - turn * TT;
    const { cx, cy, R } = G, at = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    // кольцо и стрелки по кругу
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.strokeStyle = P.line; c.lineWidth = 10; c.stroke();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.strokeStyle = alpha(P.ink3, 0.5); c.lineWidth = 1.5; c.setLineDash([3, 7]); c.lineDashOffset = -t * 18; c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 4; i++) { const a = ANG[i] + Math.PI / 4, [x, y] = at(a), d = [-Math.sin(a), Math.cos(a)]; A.arrow(c, x - d[0] * 8, y - d[1] * 8, x + d[0] * 8, y + d[1] * 8, P.ink3, 2, 7); }
    // где сейчас пакет записей: угол по кругу
    const keys = [[0, -Math.PI / 2], [1.1, -Math.PI / 2], [2.0, 0], [2.4, 0], [3.2, Math.PI / 2], [3.6, Math.PI / 2], [4.4, Math.PI], [4.6, Math.PI], [5, 1.5 * Math.PI]];
    let ang = keys[0][1]; for (let i = 1; i < keys.length; i++) if (v <= keys[i][0]) { const [a0, g0] = keys[i - 1], [a1, g1] = keys[i]; ang = g0 + (g1 - g0) * ease((v - a0) / (a1 - a0 || 1)); break; } else ang = keys[i][1];
    const [ok, fix, lost] = FLY_ANIM.shifts[turn], all = ok + fix + lost, nOk = Math.round(ND * ok / all), nFix = Math.round(ND * fix / all);
    const shown = seg(v, 0.2, 1.0), colored = v > 1.6, labeled = seg(v, 2.6, 3.4), merged = seg(v, 3.9, 4.5);
    const rin = G.rin || R - 46, [px, py] = [cx + rin * Math.cos(ang), cy + rin * Math.sin(ang)];
    for (let j = 0; j < ND; j++) {
      if (j / ND >= shown) continue;
      const kind = j < nOk ? 'ok' : j < nOk + nFix ? 'fix' : 'lost';
      const a = (j / ND) * Math.PI * 2, rr = 15 * (1 - merged), x = px + rr * Math.cos(a), y = py + rr * Math.sin(a);
      let fill = P.ink3, op = 1;
      if (colored) fill = kind === 'ok' ? P.good : P.bad;
      if (kind === 'fix' && labeled > 0) fill = labeled > 0.5 ? P.mot : P.bad;
      if (kind === 'lost') op = 1 - labeled;
      if (op <= 0.02) continue;
      c.globalAlpha = op; circle(c, x, y, 4.2, fill, P.surf, 1); c.globalAlpha = 1;
    }
    // станции
    ST.forEach(([a, b], i) => {
      const [x, y] = at(ANG[i]), w = i % 2 === 0 ? (G.swTB || G.sw) : G.sw, hgt = 38, hot = i === Math.floor(seg(v, 0, 5) * 4.999) % 4;
      rect(c, x - w / 2, y - hgt / 2, w, hgt, 9, alpha(stCol(P, i), hot ? 0.22 : 0.1), stCol(P, i), hot ? 2.2 : 1.4);
      lab(c, k, a, x, y - 7, { px: 11, weight: 700, color: stCol(P, i), halo: false });
      lab(c, k, b, x, y + 9, { px: 10, color: P.ink2, halo: false });
    });
    // в центре: смена, успех, данные
    const done = u >= TT * NT ? NT : turn + (v >= 4.6 ? 1 : 0), data = FLY_ANIM.shifts.slice(0, done).reduce((s, q) => s + q[0] + q[1], 0);
    const fs = G.narrow ? 0.85 : 1;
    lab(c, k, done >= NT ? `после ${NT} смен` : `смена ${turn + 1}`, cx, cy - 24 * fs, { px: 11.5 * fs, weight: 700, color: P.ink2, halo: false });
    lab(c, k, `успех ${FLY_ANIM.rate[done]}%`, cx, cy, { px: 15 * fs, weight: 800, color: P.ink, halo: false });
    lab(c, k, `в данных ${data} эп.`, cx, cy + 22 * fs, { px: 10.5 * fs, color: P.ink3, halo: false });
    // график: успех в новых домах по сменам
    const { gx, gy, gw, gh } = G;
    line(c, [[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]], P.ink3, 1.2);
    for (const q of [0, 50, 100]) { const y = gy + gh - gh * q / 100; line(c, [[gx, y], [gx + gw, y]], P.grid, 1); lab(c, k, `${q}%`, gx - 6, y, { px: 9.5, color: P.ink3, align: 'right', halo: false }); }
    lab(c, k, 'успех в новых домах', gx + gw / 2, gy - 12, { px: 10.5, weight: 650, color: P.ink2, haloColor: P.surf });
    const X = (i) => gx + gw * i / NT, Y = (r) => gy + gh - gh * r / 100;
    for (let i = 0; i <= NT; i++) lab(c, k, String(i), X(i), gy + gh + 11, { px: 9.5, color: P.ink3, halo: false });
    lab(c, k, 'смена', gx + gw / 2, gy + gh + 25, { px: 9.5, color: P.ink3, halo: false });
    const pts = FLY_ANIM.rate.slice(0, done + 1).map((r, i) => [X(i), Y(r)]);
    if (pts.length > 1) line(c, pts, P.mot, 2.4);
    pts.forEach(([x, y]) => circle(c, x, y, 3.6, P.mot, P.surf, 1.2));
  }
  Anim.add('flywheel', {
    W: 720, H: 380, start: 2.3, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { cx: 220, cy: 190, R: 132, sw: 150, gx: 470, gy: 70, gw: 220, gh: 230 }); },
    narrow: { W: 360, H: 600, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, cx: 180, cy: 200, R: 128, rin: 62, sw: 100, swTB: 140, gx: 60, gy: 410, gw: 270, gh: 140 }); } },
  });
})();

/* =====================================================================
   Общее: дома проверки и кэш эпизодов источников
   ===================================================================== */
const World = (() => {
  const E = L46; let test = null; const src = {};
  const testSet = () => test || (test = E.testSet());
  /** Эпизоды источника: наборы вложены (первые n эпизодов одинаковы при любом n), поэтому храним самый длинный. */
  function source(k, n) {
    const have = src[k] || (src[k] = []);
    if (have.length < n) have.push(...E.source(k, n - have.length, E.CFG.OFF + have.length));
    return have.slice(0, n);
  }
  const COLOR = Object.fromEntries(L21.COLORS.map((q) => [q.id, q]));
  const objWord = (q) => L21.phrase(q.color, q.shape);
  const homeText = (ep) => { const kt = ep.kit; return `скатерть — ${E.TABLES[kt.table].name}, свет — ${E.LIGHTS[kt.light].name}, кубик ${COLOR[kt.cube].m}, рядом ${kt.objs.map((j) => objWord(E.OTHERS[j])).join(', ')}`; };
  const plainDay = (ep) => ep.kit.light === 0 && E.TABLES[ep.kit.table].pat === 'plain';
  /** Сцена сверху: картинка дома, вероятности захвата оранжевой заливкой, кубик — зелёным кольцом, зона удержания — белым кружком. */
  function drawHome(cv, ep, m, busyText, head) {
    const CW = 360, { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), sc = CW / L21.TW;
    c.imageSmoothingEnabled = false; c.drawImage(bitmap(ep.img, L21.TW, L21.TW), 0, 0, CW, CW);
    if (m) {
      const p = L21.softmax(E.scores(m, E.feats(ep), null, head || 0)); let mx = 1e-12; for (const v of p) mx = Math.max(mx, v);
      const cs = CW / L21.G; c.fillStyle = P.e2e;
      for (let i = 0; i < p.length; i++) { const a = Math.pow(p[i] / mx, 0.6); if (a < 0.04) continue; c.globalAlpha = 0.85 * a; c.fillRect((i % L21.G) * cs, Math.floor(i / L21.G) * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    const t = ep.target;
    c.beginPath(); c.arc(t.x * sc, t.y * sc, L21.RT * sc * 1.25, 0, 7); c.lineWidth = 3; c.strokeStyle = P.good; c.stroke();
    c.beginPath(); c.arc(t.x * sc, t.y * sc, E.CFG.HOLD * sc, 0, 7); c.lineWidth = 1.6; c.strokeStyle = '#ffffff'; c.stroke();
    if (!m) { const tx = busyText || 'модель ещё не обучена'; let p = 13; HeroKit.font(c, k, p, 700); while (p > 10 && c.measureText(tx).width > CW - 20) { p -= 0.5; HeroKit.font(c, k, p, 700); } HeroKit.label(c, k, tx, CW / 2, CW / 2, { px: p, weight: 700, color: P.ink, haloColor: P.surf }); }
  }
  return { testSet, source, homeText, plainDay, drawHome, COLOR };
})();

/* =====================================================================
   2. Лаборатория: бюджет данных под задачу
   ===================================================================== */
const Budget = (() => {
  const E = L46, SRC = E.SRC;
  const st = { plan: { robot: 16, sim: 400, video: 400 }, head: 'own', mode: 'eq', home: 0, left: null, right: null, bars: [], busy: false, prog: 0 };
  const models = {};
  let ctl = null;
  const BASE = { robot: 32, sim: 0, video: 0 };
  const keyOf = (plan, o) => `${plan.robot || 0}-${plan.sim || 0}-${plan.video || 0}-${(o && o.mode) || 'eq'}-${o && o.sameHead ? 'same' : 'own'}`;
  const optsNow = () => ({ mode: st.mode, sameHead: st.head === 'same' });
  st.left = keyOf(BASE, {});
  const planText = (plan) => SRC.filter((k) => plan[k]).map((k) => `${plan[k]} ${k === 'robot' ? plural(plan[k], 'демонстрация', 'демонстрации', 'демонстраций') : k === 'sim' ? 'симуляции' : 'видео'}`).join(' + ') || 'ничего';
  const short = (plan) => `${plan.robot || 0} + ${plan.sim || 0} + ${plan.video || 0}`;
  /** Обучить модель на плане (если её ещё нет) и проверить на 48 домах. */
  async function trainPlan(plan, o, label) {
    o = o || {}; const key = keyOf(plan, o);
    if (!models[key]) {
      const gs = E.groups(plan, Object.assign({ source: World.source }, o));
      const m = await runChunked(E.train(gs), (e) => { st.prog = (e.it + 1) / e.iters; render(); }, 14);
      models[key] = { key, plan: Object.assign({}, plan), o: Object.assign({}, o), m, res: E.check(m, World.testSet()), cost: E.cost(plan) };
    }
    const q = models[key];
    if (label && !st.bars.some((b) => b.key === key)) st.bars.push({ key, label });
    return q;
  }
  async function busyRun(fn) { st.busy = true; st.prog = 0; render(); try { return await fn(); } finally { st.busy = false; render(); } }
  const rateOf = (key) => (models[key] ? models[key].res.rate : null);
  function drawPanes() {
    const ep = World.testSet()[st.home], L = models[st.left], R = st.right && models[st.right];
    World.drawHome($('#bCvL'), ep, L && L.m, st.busy ? 'модель учится…' : null);
    World.drawHome($('#bCvR'), ep, R && R.m, st.busy ? 'модель учится…' : null);
    for (const [side, q] of [['L', L], ['R', R]]) {
      const el = $('#bStat' + side);
      if (!q) { setOut(el, st.busy ? 'Модель учится…' : 'Модель ещё не обучена'); el.className = 'pane-stat'; continue; }
      const v = q.res.runs[st.home].p;
      setOut(el, `<b>Удержит кубик: ${pct(v)}% попыток</b> · в 48 домах — ${pct(q.res.rate)}%`); el.className = 'pane-stat ' + (v >= 0.5 ? 'ok' : 'bad');
    }
    if (R) { $('#bHeadR').textContent = R.o.sameHead ? 'Смесь, видео в выходе робота' : 'Смесь'; setOut($('#bSubR'), `${short(R.plan)} · ${R.cost.total} у. е.${R.o.mode === 'prop' ? ' · пакеты по числу эпизодов' : ''}`); }
    else { $('#bHeadR').textContent = 'Смесь'; setOut($('#bSubR'), 'обучи её в миссии'); }
  }
  function drawPlan() {
    const c = E.cost(st.plan);
    $$('#bPlan .plan-row').forEach((row) => {
      const k = row.dataset.src, inp = row.querySelector('input'); inp.value = st.plan[k]; syncRange(inp, String(st.plan[k]));
      row.querySelector('.pl-cost').textContent = `${c.by[k]} у. е.`;
    });
    const bb = $('#bBudget'); bb.classList.toggle('over', !c.ok);
    bb.querySelector('i').style.width = Math.min(100, c.total / E.PLAN.BUDGET * 100).toFixed(1) + '%';
    bb.querySelector('.bb-text').textContent = c.ok ? `${c.total} из ${E.PLAN.BUDGET} у. е.` : `${c.total} у. е. — больше бюджета`;
  }
  function drawBars() {
    const box = $('#bBars'); box.innerHTML = '';
    if (!st.bars.length) return;
    box.append(h('div', { class: 'sc-h muted-s' }, 'Доля попыток, в которых Ада удержит кубик в 48 новых домах'));
    for (const b of st.bars) {
      const q = models[b.key]; if (!q) continue;
      const row = h('div', { class: 'bar-row' + (b.key === st.left ? ' base' : '') + (b.key === st.right ? ' cur' : '') }, h('span', { class: 'bl' }, b.label), h('div', { class: 'bt' }, h('i', { style: `width:${(q.res.rate * 100).toFixed(1)}%` })), h('span', { class: 'bn' }, `${pct(q.res.rate)}%`));
      box.append(row);
    }
  }
  function render() {
    drawPanes(); drawPlan(); drawBars();
    const pg = $('#bProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const ep = World.testSet()[st.home];
    setOut($('#bOut'), st.busy ? `Модель учится в браузере: <b>${pct(st.prog)}%</b>` : `Дом проверки ${st.home + 1} из 48: ${World.homeText(ep)}.`);
    $('#bTrain').disabled = st.busy || !E.cost(st.plan).ok;
  }
  function setHome(i) { st.home = Math.max(0, Math.min(47, i)); const inp = $('#bHome'); inp.value = st.home + 1; syncRange(inp, String(st.home + 1)); render(); }
  function setPlan(p) { Object.assign(st.plan, p); render(); if (ctl) ctl.update(); }
  /** Дом, где правая модель сильнее всего обходит левую. */
  function bestHome() {
    const L = models[st.left], R = models[st.right]; if (!L || !R) return st.home;
    let b = 0; R.res.runs.forEach((q, i) => { if (q.p - L.res.runs[i].p > R.res.runs[b].p - L.res.runs[b].p) b = i; }); return b;
  }
  /** Средний успех по двум группам домов: дневной свет и однотонная скатерть — и все остальные. */
  function split(key) {
    const q = models[key], ts = World.testSet(), a = [], b = [];
    ts.forEach((ep, i) => (World.plainDay(ep) ? a : b).push(q.res.runs[i].p));
    const avg = (x) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
    return { plain: avg(a), plainN: a.length, other: avg(b), otherN: b.length };
  }
  function state() { return { plan: Object.assign({}, st.plan), cost: E.cost(st.plan), head: st.head, mode: st.mode, left: rateOf(st.left), right: st.right ? rateOf(st.right) : null, busy: st.busy }; }
  const api = {
    reset() { st.bars = []; st.right = null; st.head = 'own'; st.mode = 'eq'; segSet('#bHead', 'own'); segSet('#bMode', 'eq'); setPlan({ robot: 16, sim: 400, video: 400 }); setHome(0); },
    state, setHome, setPlan, render, models, st,
    setHead(v) { st.head = v; segSet('#bHead', v); render(); },
    setMode(v) { st.mode = v; segSet('#bMode', v); render(); },
    /** Миссия 1: весь бюджет на робота против смеси 16 + 400 + 400. */
    first() {
      return busyRun(async () => {
        await trainPlan(BASE, {}, 'Весь бюджет на робота: 32 демонстрации');
        const mix = { robot: 16, sim: 400, video: 400 }, q = await trainPlan(mix, {}, 'Смесь 16 + 400 + 400');
        st.right = q.key; st.home = bestHome(); setHome(st.home);
        const L = models[st.left], sl = split(st.left), sr = split(q.key);
        return { left: L.res.rate, right: q.res.rate, costL: L.cost.total, costR: q.cost.total, okL: L.cost.ok, okR: q.cost.ok, sl, sr, home: st.home, homeL: L.res.runs[st.home].p, homeR: q.res.runs[st.home].p };
      });
    },
    /** Миссия 2: действия из видео в выходе робота; смесь без видео; одно видео. */
    heads() {
      return busyRun(async () => {
        const mix = { robot: 16, sim: 400, video: 400 };
        await trainPlan(BASE, {}, 'Весь бюджет на робота: 32 демонстрации');
        const own = await trainPlan(mix, {}, 'Смесь 16 + 400 + 400');
        const same = await trainPlan(mix, { sameHead: true }, 'Та же смесь, видео в выходе робота');
        const novid = await trainPlan({ robot: 16, sim: 400, video: 0 }, {}, 'Смесь 16 + 400 без видео');
        const vonly = await trainPlan({ robot: 0, sim: 0, video: 800 }, {}, 'Только видео людей, 800 роликов');
        st.right = same.key; render();
        return { own: own.res.rate, same: same.res.rate, novid: novid.res.rate, vonly: vonly.res.rate };
      });
    },
    /** Миссия 3 и свободный режим: обучить текущий план. */
    mine() {
      return busyRun(async () => {
        const plan = Object.assign({}, st.plan), c = E.cost(plan), o = optsNow();
        if (!c.ok || !(plan.robot + plan.sim + plan.video)) return { plan, cost: c, rate: null, left: rateOf(st.left) };
        if (!models[st.left]) await trainPlan(BASE, {}, 'Весь бюджет на робота: 32 демонстрации');
        const q = await trainPlan(plan, o, `Мой план: ${short(plan)}${o.sameHead ? ', видео в выходе робота' : ''}${o.mode === 'prop' ? ', по числу эпизодов' : ''}`);
        st.right = q.key; render();
        return { plan, cost: c, rate: q.res.rate, left: rateOf(st.left), o };
      });
    },
  };
  const missions = [
    { short: 'Ставка', title: 'Весь бюджет на самые точные данные', text: 'Бюджет — 100 у. е. Левая модель тратит всё на демонстрации робота: 32 эпизода в четырёх домах, 96 у. е. Правая тратит столько же на смесь: 16 демонстраций робота, 400 эпизодов симуляции и 400 роликов людей. Нажми кнопку: обе модели обучатся в браузере, и каждую проверят в 48 домах, где Ада не была.',
      controls: ['home'],
      bet: { q: 'какая модель удержит кубик чаще в новых домах?', options: ['Левая: демонстрации робота самые точные, а у симуляции и видео свои изъяны', 'Поровну: бюджет одинаковый', 'Правая'], answer: (r) => (r.right > r.left + 0.05 ? 2 : r.left > r.right + 0.05 ? 0 : 1) },
      action: { label: 'Обучить обе модели и проверить', run: (X) => X.first() },
      criteria: [{ label: 'Обе модели уложились в бюджет', test: (r) => r.okL && r.okR }, { label: 'Смесь удачнее хотя бы на 10 процентных пунктов', test: (r) => r.right >= r.left + 0.1 }],
      explain: (r) => `В новых домах модель на одних демонстрациях робота удерживает кубик в ${pct(r.left)}% попыток, смесь — в ${pct(r.right)}%. В ${nWord(r.sl.plainN, 'доме', 'домах', 'домах')} с дневным светом и однотонной скатертью — ${pct(r.sl.plain)}% против ${pct(r.sr.plain)}%, в остальных ${r.sl.otherN} — ${pct(r.sl.other)}% против ${pct(r.sr.other)}%. Демонстрации робота точны, но их 32, и все из четырёх домов. Симуляция за 30 у. е. показала 400 разных кухонь, видео — 400 настоящих домов. На сцене сейчас дом ${r.home + 1}: здесь разница больше всего, ${pct(r.homeL)}% против ${pct(r.homeR)}%.` },
    { short: 'Чьи действия', title: 'Действия человека в выходе робота', text: 'Действия из видео людей восстановлены по кадрам: человек берёт кубик пальцами сбоку, и точка захвата смещена, а в каждом десятом ролике это другой предмет. До сих пор их учил свой выход сети, как у GR00T N1, где видео людей — отдельное воплощение. Обучим ту же смесь, но пусть действия из видео учит тот же выход, что действия робота. Заодно обучим смесь без видео и модель на одном видео.',
      controls: ['home'],
      bet: { q: 'что будет со смесью, если действия из видео учит выход робота?', options: ['Станет лучше: у выхода робота будет вдвое больше примеров', 'Ничего не изменится', 'Станет хуже'], answer: (r) => (r.same < r.own - 0.03 ? 2 : r.same > r.own + 0.03 ? 0 : 1) },
      action: { label: 'Обучить три модели', run: (X) => X.heads() },
      criteria: [{ label: 'С действиями из видео в выходе робота смесь хуже, чем со своим выходом', test: (r) => r.same < r.own - 0.05 }],
      explain: (r) => `Своим выходом — ${pct(r.own)}%, выходом робота — ${pct(r.same)}%: действия человека тянут захват Ады туда, где кубик держат пальцы, а не захват. Без видео та же смесь даёт ${pct(r.novid)}%: в нашем мире видео почти ничего не добавило к роботу и симуляции — как веб-данные у π0.5 в учебных домах. А модель только на видео в выходе робота ничего не умеет, ${pct(r.vonly)}%: этот выход ни разу не видел действий робота. Нижний слой пирамиды не заменяет верхний.` },
    { short: 'Свой план', title: 'Распредели бюджет сам', text: 'Ползунки под сценой задают, сколько эпизодов купить из каждого источника; полоска показывает, сколько потрачено. Собери план не дороже 100 у. е., на котором модель удержит кубик хотя бы в 65% попыток в новых домах, и нажми кнопку.',
      controls: ['home', 'plan'],
      action: { label: 'Обучить мою смесь', run: (X) => X.mine() },
      criteria: [{ label: 'План не дороже 100 у. е.', test: (r) => r.cost.ok }, { label: 'Успех в новых домах не меньше 65%', test: (r) => r.rate != null && r.rate >= 0.65 }],
      hint: 'Одной симуляции не хватает: её захват держит не так, как настоящий, а картинка другая. Оставь в плане хотя бы несколько демонстраций робота.',
      summary: (r) => `${short(r.plan)}: ${r.cost.total} у. е., ${r.rate == null ? 'не обучена' : pct(r.rate) + '%'}`,
      fail: (r) => (!r.cost.ok ? `План стоит ${r.cost.total} у. е. — это больше бюджета.` : r.rate == null ? 'В плане нет ни одного эпизода.' : `${pct(r.rate)}% — меньше 65%. ${r.plan.robot ? '' : 'В плане нет демонстраций робота: выход робота учится только на симуляции. '}Попробуй другое сочетание.`),
      explain: (r) => `${short(r.plan)} за ${r.cost.total} у. е. — ${pct(r.rate)}% против ${pct(r.left)}% у модели на одних демонстрациях робота. Хватает нескольких демонстраций робота, чтобы привязать модель к его камере и к тому, где захват держит, а широту даёт симуляция.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Найди самый дешёвый план, на котором модель удержит кубик хотя бы в 65% попыток. Попробуй и веса: пакеты по числу эпизодов вместо «робот 40%, остальное поровну».', final: true, controls: ['home', 'plan', 'opts', 'train'] },
  ];
  function init() {
    legend('#bLegend', [['вероятность сомкнуть захват в клетке', 'var(--e2e)', 'band'], ['кубик, который надо взять', 'var(--good)', 'ring'], ['зона, где захват удержит кубик', '#ffffff', 'hold']]);
    $('#bHome').addEventListener('input', (e) => setHome(+e.target.value - 1));
    $$('#bPlan .plan-row').forEach((row) => row.querySelector('input').addEventListener('input', (e) => { if (st.busy) { e.target.value = st.plan[row.dataset.src]; return; } setPlan({ [row.dataset.src]: +e.target.value }); }));
    segBind('#bHead', (v) => { if (!st.busy) api.setHead(v); });
    segBind('#bMode', (v) => { if (!st.busy) api.setMode(v); });
    $('#bTrain').addEventListener('click', () => { if (!st.busy) api.mine(); });
    ctl = mountMissions('#bMis', missions, api, { controls: { home: '#wrapBHome', plan: '#bPlan', opts: '#wrapBOpts', train: '#wrapBTrain' }, scene: '#bDuo' });
    syncRange($('#bHome'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: парк Ады в чужих домах
   ===================================================================== */
const Fleet = (() => {
  const E = L46, SEED = 1;
  const st = { robots: 16, share: 0.5, runs: {}, order: [], cur: null, busy: false, prog: 0 };
  let ctl = null, m0 = null;
  const keyOf = (robots, share) => `${robots}-${Math.round(share * 100)}`;
  const runLabel = (q) => `${q.robots} роб., ${Math.round(q.share * 100)}%`;
  async function run(robots, share) {
    const key = keyOf(robots, share);
    if (!st.runs[key]) {
      st.busy = true; st.prog = 0; render();
      try {
        if (!m0) m0 = await runChunked(E.train(E.flyBase(), { iters: E.FLY.TRAIN }), () => {}, 14);
        const hist = await runChunked(E.flywheel({ robots, share, test: World.testSet(), seed: SEED, m0 }), (e) => { st.prog = (e.it - 1 + e.frac) / (e.of - 1); render(); }, 14);
        st.runs[key] = { key, robots, share, hist };
      } finally { st.busy = false; }
    }
    st.order = st.order.filter((k) => k !== key).concat([key]); st.cur = key; render();
    return st.runs[key];
  }
  const rates = (q) => q.hist.map((x) => x.rate);
  function drawChart() {
    const cv = $('#fCv'), narrow = (cv.getBoundingClientRect().width || 640) < 500, W = narrow ? 380 : 640, H = narrow ? 280 : 300;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = HeroKit.fit(cv, W, H), P = pal();
    const L = narrow ? 44 : 56, R = narrow ? 84 : 128, T = 24, B = 40, gw = W - L - R, gh = H - T - B, NS = E.FLY.SHIFTS;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (i) => L + gw * i / NS, Y = (v) => T + gh * (1 - v);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); HeroKit.label(c, k, `${v * 100}%`, L - 8, Y(v), { px: 11, color: P.ink3, align: 'right', halo: false }); }
    for (let i = 0; i <= NS; i++) HeroKit.label(c, k, String(i), X(i), T + gh + 14, { px: 11, color: P.ink3, halo: false });
    HeroKit.label(c, k, narrow ? 'смена' : 'смена парка (0 — модель из лаборатории)', L + gw / 2, H - 10, { px: 11, color: P.ink3, halo: false });
    HeroKit.label(c, k, narrow ? 'успех' : 'успех в 48 новых домах', L + 4, 10, { px: 11, color: P.ink3, align: 'left', halo: false });
    if (!st.order.length) {
      const full = st.busy ? 'парк работает, модель обучается заново…' : 'нажми «Запустить», чтобы парк вышел на смены', brief = st.busy ? 'парк работает…' : 'нажми «Запустить»';
      HeroKit.font(c, k, 13, 700); HeroKit.label(c, k, c.measureText(full).width > gw - 16 ? brief : full, L + gw / 2, T + gh / 2, { px: 13, weight: 700, color: P.ink2, haloColor: P.surf }); return;
    }
    const tags = [];
    for (const key of st.order) {
      const q = st.runs[key], cur = key === st.cur, rs = rates(q), pts = rs.map((v, i) => [X(i), Y(v)]);
      c.strokeStyle = cur ? P.e2e : P.ink3; c.lineWidth = cur ? 3 : 1.6; c.setLineDash(cur ? [] : [5, 4]);
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.setLineDash([]);
      pts.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, cur ? 4 : 3, 0, 7); c.fillStyle = cur ? P.e2e : P.ink3; c.fill(); });
      tags.push({ y: Y(rs[rs.length - 1]), text: `${runLabel(q)} · ${pct(rs[rs.length - 1])}%`, short: `${q.robots}р ${Math.round(q.share * 100)}%: ${pct(rs[rs.length - 1])}`, cur });
    }
    tags.sort((a, b) => a.y - b.y); for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + 15);
    tags.forEach((t) => HeroKit.label(c, k, narrow ? t.short : t.text, L + gw + 6, t.y, { px: narrow ? 10 : 11, weight: t.cur ? 700 : 500, color: t.cur ? P.e2e : P.ink3, align: 'left', haloColor: P.surf }));
  }
  function drawFleet() {
    const box = $('#fFleet'), q = st.cur && st.runs[st.cur];
    const key = q ? q.key : ''; if (box.dataset.key === key) return; box.dataset.key = key; box.innerHTML = '';
    if (!q) return;
    const last = q.hist[q.hist.length - 2]; box.classList.toggle('n32', q.robots > 16);
    last.log.forEach((row) => {
      const ep = row[row.length - 1].ep, cv = h('canvas', { width: 96, height: 96, 'aria-hidden': 'true' });
      cv.getContext('2d').drawImage(bitmap(ep.img, L21.TW, L21.TW), 0, 0);
      box.append(h('div', { class: 'fl-r' }, cv, h('div', { class: 'fl-a' }, ...row.map((a) => h('i', { class: a.kind, title: a.kind === 'ok' ? 'удача' : a.kind === 'fix' ? 'отказ, размечен' : 'отказ без разметки' })))));
    });
  }
  function render() {
    drawChart(); drawFleet();
    const pg = $('#fProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const q = st.cur && st.runs[st.cur];
    if (st.busy) setOut($('#fOut'), `Парк работает, модель обучается заново в браузере: <b>${pct(st.prog)}%</b>`);
    else if (q) { const l = q.hist[q.hist.length - 2], rs = rates(q); setOut($('#fOut'), `Парк ${nWord(q.robots, 'робот', 'робота', 'роботов')}, размечают ${Math.round(q.share * 100)}% отказов. Последняя смена: ${l.ok} удач, ${l.fix} размеченных отказов, ${l.lost} потеряно; в данных парка ${q.hist[q.hist.length - 1].data} эпизодов. Успех: ${rs.map(pct).join(' → ')}%.`); }
    else setOut($('#fOut'), `Модель из лаборатории: 16 демонстраций, все кубики красные. Парк: ${st.robots} роботов, по 6 попыток за смену, люди размечают ${Math.round(st.share * 100)}% отказов.`);
    $('#fRun').disabled = st.busy;
  }
  function setRobots(n) { st.robots = n; const inp = $('#fRobots'); inp.value = n; syncRange(inp, String(n)); render(); }
  function setShare(v) { st.share = v; const inp = $('#fShare'); inp.value = Math.round(v * 100); syncRange(inp, `${Math.round(v * 100)}%`); render(); }
  /** Сводка запуска для разборов. */
  function sum(q) {
    const rs = rates(q), fl = q.hist.slice(0, -1), first = fl[0];
    const red = (sh) => { const oks = sh.log.flat().filter((a) => a.kind === 'ok'); return { n: oks.length, red: oks.filter((a) => a.ep.kit.cube === 'red').length }; };
    const redHomes = first.log.filter((row) => row[0].ep.kit.cube === 'red').length;
    return { robots: q.robots, share: q.share, start: rs[0], end: rs[rs.length - 1], after1: rs[1], after2: rs[2], rates: rs, data: q.hist[q.hist.length - 1].data, firstOk: red(first), redHomes, attempts: q.robots * E.FLY.ATTEMPTS, perShift: fl.map((x) => x.ok + x.fix) };
  }
  function state() { const q = st.cur && st.runs[st.cur]; return { robots: st.robots, share: st.share, busy: st.busy, cur: q ? sum(q) : null }; }
  const api = {
    reset() { st.order = []; st.cur = null; setRobots(16); setShare(0.5); },
    state, render, setRobots, setShare, st, sum,
    async go(robots, share) { setRobots(robots); setShare(share); return sum(await run(robots, share)); },
    async both(robots, share) { const a = sum(await run(16, 0.5)), b = await api.go(robots, share); st.cur = keyOf(robots, share); render(); return { base: a, alt: b }; },
    runNow() { return run(st.robots, st.share).then(sum); },
  };
  const missions = [
    { short: 'Маховик', title: 'Первая версия едет к людям', text: 'Парк — 16 роботов, каждый за смену делает 6 попыток в новом доме. Удачи сами идут в данные, половину отказов размечают люди. После каждой смены модель обучается заново. Нажми кнопку: парк отработает 4 смены, а модель после каждой проверят на 48 новых домах.',
      action: { label: 'Запустить 4 смены', run: (X) => X.go(16, 0.5) },
      criteria: [{ label: 'За 4 смены успех в новых домах вырос хотя бы на 25 пунктов', test: (r) => r.end >= r.start + 0.25 }],
      explain: (r) => `Модель из лаборатории удерживала кубик в ${pct(r.start)}% попыток, после смен — ${r.rates.slice(1).map(pct).join(', ')}%. За смену парк делает ${r.attempts} попыток, и в данные попадает от ${Math.min(...r.perShift)} до ${Math.max(...r.perShift)} эпизодов; всего за 4 смены — ${r.data}. Это записи из настоящих домов с узорными скатертями, вечерним светом и кубиками всех цветов — того, чего в лаборатории не было.` },
    { short: 'Без разметки', title: 'Если отказы никто не смотрит', text: 'Тот же парк из 16 роботов, но людей для разметки нет: в данные идут только удачи, отказы пропадают.',
      bet: { q: 'раскрутится ли маховик без разметки отказов?', options: ['Да, только медленнее: удач всё равно десятки за смену', 'Почти не раскрутится', 'Быстрее: в данных не будет ошибок'], answer: (r) => (r.alt.end < r.alt.start + 0.1 ? 1 : r.alt.end > r.base.end + 0.03 ? 2 : 0) },
      action: { label: 'Запустить без разметки', run: (X) => X.both(16, 0) },
      criteria: [{ label: 'Без разметки рост за 4 смены меньше 10 пунктов', test: (r) => r.alt.end < r.alt.start + 0.1 }],
      explain: (r) => `Без разметки — ${pct(r.alt.start)} → ${pct(r.alt.end)}%, с разметкой половины отказов — до ${pct(r.base.end)}%. В первую смену из ${r.alt.firstOk.n} удач ${r.alt.firstOk.red} — с красным кубиком, хотя красный кубик был только в ${nWord(r.alt.redHomes, 'доме', 'домах', 'домах')} из 16. Модель учится на том, что уже умеет, и тянется к красному ещё увереннее, а отказы в домах с синими и зелёными кубиками пропадают.` },
    { short: 'Вдвое больше', title: 'Удвоить парк', text: 'Теперь в парке 32 робота: записей за смену вдвое больше, люди по-прежнему размечают половину отказов.',
      bet: { q: 'что будет через 4 смены?', options: ['Успех вырастет вдвое быстрее и уйдёт выше', 'Через 4 смены почти так же, как у 16 роботов', 'Хуже: данных слишком много для маленькой модели'], answer: (r) => (Math.abs(r.alt.end - r.base.end) <= 0.05 ? 1 : r.alt.end > r.base.end ? 0 : 2) },
      action: { label: 'Запустить 32 робота', run: (X) => X.both(32, 0.5) },
      criteria: [{ label: 'Через 4 смены разница с 16 роботами не больше 5 пунктов', test: (r) => Math.abs(r.alt.end - r.base.end) <= 0.05 }],
      explain: (r) => `32 робота: ${r.alt.rates.map(pct).join(' → ')}%, 16 роботов: ${r.base.rates.map(pct).join(' → ')}%. В данных у большого парка ${r.alt.data} эпизодов против ${r.base.data}, а к четвёртой смене успех тот же. Модель упирается в свой потолок, и новые записи похожи на уже собранные — как вдвое больше демонстраций в тех же сценах в уроке 4.1.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй размер парка и долю размеченных отказов. Найди наименьшую долю разметки, при которой парк из 16 роботов за 4 смены доходит хотя бы до 65%.', final: true, controls: ['ctl', 'run'] },
  ];
  function init() {
    $('#fRobots').addEventListener('input', (e) => { if (!st.busy) setRobots(+e.target.value); else e.target.value = st.robots; });
    $('#fShare').addEventListener('input', (e) => { if (!st.busy) setShare(+e.target.value / 100); else e.target.value = Math.round(st.share * 100); });
    $('#fRun').addEventListener('click', () => { if (!st.busy) api.runNow(); });
    ctl = mountMissions('#fMis', missions, api, { controls: { ctl: '#wrapFCtl', run: '#wrapFRun' }, scene: '#fCv' });
    setRobots(16); setShare(0.5); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   1. Интерактив: восемь источников по трём слоям пирамиды
   ===================================================================== */
function initLayers() {
  return Cards.sort('#layerSort', {
    targets: [{ id: 'base', label: 'Основание: веб-данные и видео людей', note: 'больше всего, действий робота нет' }, { id: 'mid', label: 'Середина: синтетика', note: 'посчитано или сгенерировано' }, { id: 'top', label: 'Вершина: настоящие роботы', note: 'мало, зато действия робота' }],
    items: [
      { id: 'ego4d', label: 'Ego4D: 3670 часов роликов с камер на голове', target: 'base', why: 'Люди занимаются своими делами, действия робота восстанавливают латентными действиями. В предобучении GR00T N1 — 2145 часов из этого набора.' },
      { id: 'web', label: 'Подписи к картинкам и вопросы-ответы о картинках', target: 'base', why: 'Веб-данные, на которых учили модель зрения и языка Eagle-2: названия и свойства предметов, без движений.' },
      { id: 'epic', label: 'EPIC-KITCHENS: люди готовят, камера на голове', target: 'base', why: 'Видео людей от первого лица, 31,7 часа в таблице 7 GR00T N1.' },
      { id: 'dexmg', label: '780 тысяч траекторий DexMimicGen за 11 часов', target: 'mid', why: 'Симуляция: несколько десятков демонстраций оператора размножены в симуляторе, оставлены только удачные.' },
      { id: 'neural', label: '827 часов видео, сгенерированных из 88 часов телеоперации', target: 'mid', why: 'Синтетика, хоть и выглядит как запись робота: видеомодель дорисовала новые ролики, действия в них восстанавливают так же, как для видео людей.' },
      { id: 'robocasa', label: 'Кухни и задачи RoboCasa, собранные в симуляторе', target: 'mid', why: 'Сцены и задачи генерирует программа (урок 4.5), демонстрации — MimicGen.' },
      { id: 'gr1', label: '88 часов телеоперации гуманоида GR-1', target: 'top', why: 'Собственные записи робота, на котором проверяют модель: его камера, тело и действия. Около 1% часов предобучения.' },
      { id: 'droid', label: 'DROID: 76 тысяч траекторий руки Franka', target: 'top', why: 'Чужой робот, но настоящий, с настоящими действиями: в таблице 7 GR00T N1 это «Real robot», 428 часов; сами авторы DROID пишут о 350 часах.' },
    ],
    after: 'Чем ниже слой, тем больше данных и тем больше работы, чтобы они стали понятны роботу: восстановить действия, перенести их на другое тело, закрыть разрыв с реальностью.',
  });
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
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'В пирамиде GR00T N1 видео людей лежит в основании. Значит, в таблице часов предобучения видео людей больше, чем записей роботов?', o: ['Да, основание всегда самое большое по часам', 'Нет: записей роботов 3289 часов, видео людей 2517; основание широкое за счёт веб-данных внутри модели зрения и языка', 'Нет, видео людей в предобучение не входит'], a: 1, e: 'Пирамида — про количество данных вообще и про близость к роботу. Веб-данные в таблицу 7 не входят: их модель получила вместе с Eagle-2. Собственные записи GR-1 — 88 часов, около 1%.' },
    { q: 'Можно ли учить действия, восстановленные по видео людей, тем же выходом сети, что действия робота?', o: ['Да, это просто ещё данные', 'Лучше не стоит: это действия другого тела; GR00T N1 учит латентные действия как отдельное воплощение', 'Нельзя вообще использовать видео без действий'], a: 1, e: 'На столе Ады смесь со своим выходом для видео дала 70%, с общим — 54%. Модель на одном видео в выходе робота — 3%: этот выход не видел действий робота.' },
    { q: 'Бюджет ограничен. Тратить его целиком на демонстрации своего робота — лучший план, ведь они самые точные?', o: ['Да, точность важнее всего', 'Нет: при равном бюджете смесь с симуляцией обходит — демонстраций мало, и они из немногих мест', 'Нет, демонстрации робота не нужны вовсе'], a: 1, e: 'На столе Ады 32 демонстрации в четырёх домах дали 48%, смесь 16 демонстраций, 400 эпизодов симуляции и 400 роликов людей за ту же цену — 70%. Без демонстраций робота модель тоже хуже.' },
    { q: 'Чем больше источник, тем больший вес ему дают в смеси?', o: ['Да, вес равен доле часов', 'Нет: вес — доля пакета, её подбирают опытами; малые точные источники часто берут чаще их доли', 'Веса всегда равные'], a: 1, e: 'GR00T N1 на постобучении смешивает реальные траектории со сгенерированными 1 : 1, хотя сгенерированных можно сделать сколько угодно. У π0.5 97,6% примеров первого этапа — не целевые данные, но и без них хуже.' },
    { q: 'π0.5 без веб-данных в учебных домах справлялся почти так же. Значит, веб-данные ему не нужны?', o: ['Да, их можно убрать', 'Нет: без них робот заметно хуже справлялся с предметами незнакомых категорий', 'Нет, без них модель вообще не обучается'], a: 1, e: 'Польза слоя видна на той проверке, где нужно то, чему он учит. Без записей других роботов π0.5 был заметно хуже и в учебных домах.' },
    { q: 'Маховик данных крутится сам: роботы работают, данные собираются, модель улучшается?', o: ['Да, достаточно запустить парк', 'Нет: отказы надо разметить, иначе модель учится только на том, что уже умеет', 'Нет, данные с работающих роботов бесполезны'], a: 1, e: 'Без разметки парк Ады вырос с 35 до 42%, с разметкой половины отказов — до 74%. В RECAP исход оценивают люди, они же вмешиваются и возвращают сцену; авторы пишут, что система не полностью автономна.' },
    { q: 'Вдвое больше роботов — маховик крутится вдвое быстрее?', o: ['Да, данных вдвое больше', 'Не обязательно: модель упирается в потолок, а новые записи похожи на старые', 'Нет, больше роботов всегда хуже'], a: 1, e: 'Парк из 32 роботов к четвёртой смене пришёл к тому же успеху, что из 16: 74%. Растёт маховик тогда, когда роботы попадают в новые условия, а модель может их вместить.' },
    { q: 'Флот Tesla отправляет в компанию все записи подряд?', o: ['Да, чем больше, тем лучше', 'Нет: по описанию Карпати, флот присылает примеры по запросу и по триггерам — например, при вмешательстве водителя', 'Нет, флот ничего не присылает, данные собирают отдельные машины'], a: 1, e: 'Data engine Tesla с 2019 года: запросить у флота клипы, похожие на трудный случай, найти, где сеть ошибается, разметить. Новую сеть сначала запускают в теневом режиме — она считает, но не управляет.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('layers', () => { mis.layers = initLayers(); });
    safe('budget', () => { mis.budget = Budget.init(); });
    safe('fleet', () => { mis.fleet = Fleet.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['bMis', 'fMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l46 = { mis, SPEED, World, Budget, Fleet, FLY_ANIM, L46 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
