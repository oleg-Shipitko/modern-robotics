/* =====================================================================
   ui-l43.js — урок 4.3 «Датасеты роботов». Схема и интерактивы:
   0) анимированная схема записи эпизода DROID (shared/anim.js);
   1) лаборатория «Одна кухня или двадцать четыре»: две модели рядом на
      одной кухне проверки, 24 новые кухни, какие свойства кухонь меняются;
   2) интерактив: таблица шести наборов данных с подсказками к ячейкам;
   3) лаборатория «Проверка эпизодов»: 48 эпизодов, убрать испорченные,
      добавить ещё столько же, какой вид ошибки вредит сильнее;
   4) квиз.
   Движок — l43/engine.js (без DOM) поверх l21/engine.js.
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
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
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

/* =====================================================================
   0. Схема: как записывается один эпизод DROID
   ===================================================================== */
(() => {
  const T = 13;                                                       // секунд на цикл
  const PH = { rec: [0, 6.4], ok: [6.4, 7.8], lang: [7.8, 10.2], mix: [10.2, 12.6] };
  const NCOL = 12;                                                    // столбцов ленты: условно, по столбцу на несколько шагов
  // путь захвата при записи: дом → над маркером → вниз → вверх → над чашкой → вниз
  const KEYS = [[0, [176, 132]], [0.18, [196, 168]], [0.32, [196, 188]], [0.45, [196, 160]], [0.7, [214, 160]], [0.85, [214, 178]], [1, [214, 178]]];
  function eePath(u) {
    for (let i = 1; i < KEYS.length; i++) if (u <= KEYS[i][0]) { const [a, p] = KEYS[i - 1], [b, q] = KEYS[i], s = Anim.kit.ease((u - a) / (b - a || 1)); return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; }
    return KEYS[KEYS.length - 1][1];
  }
  /** Двухзвенная рука в плоскости вида сбоку: плечо (x0, y0), звенья L1, L2, конец (x, y). */
  function ik(x0, y0, x, y, L1, L2) {
    const dx = x - x0, dy = y - y0, d = Math.min(L1 + L2 - 0.5, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    const b = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const ea = a - b; return [x0 + L1 * Math.cos(ea), y0 + L1 * Math.sin(ea)];
  }
  /** Установка DROID, вид сбоку: стол на колёсах, рука, две внешние камеры, камера на запястье, оператор с пультом. */
  function rig(c, k, t, P, A, G) {
    const { seg, lab, line, rect, circle, alpha } = A, u = ((t % T) + T) % T;
    const rec = seg(u, ...PH.rec), mix = seg(u, ...PH.mix), shift = Math.sin(Math.PI * mix);
    const dx = 10 * shift;                                            // при перемешивании стол сдвигается
    const floorY = 300;
    line(c, [[6, floorY + 10], [354, floorY + 10]], P.line, 1.4);
    // стол на колёсах
    const tx0 = 70 + dx, tx1 = 262 + dx, ty = 200;
    rect(c, tx0, ty, tx1 - tx0, 9, 3, alpha(P.ink3, 0.35), P.ink3, 1.4);
    for (const lx of [tx0 + 14, tx1 - 14]) { line(c, [[lx, ty + 9], [lx, floorY]], P.ink3, 3); circle(c, lx, floorY + 4, 6, P.surf, P.ink3, 2); }
    // предметы: маркер и чашка; маркер едет в захвате между 0,32 и 0,85 записи
    const carry = rec > 0.32 && rec < 0.85 && u < PH.rec[1], ee = eePath(u < PH.rec[1] ? rec : u < PH.mix[0] ? 1 : 1 - mix);
    const eex = ee[0] + dx, eey = ee[1];
    const mk = carry ? [eex, eey + 12] : u >= PH.mix[0] ? [214 + dx - 18 * mix, 192 + 2 * mix] : rec >= 0.85 || u >= PH.rec[1] ? [214 + dx, 192] : [196 + dx, 194];
    // лампа: при перемешивании сцены свет меняется
    const warm = u >= PH.mix[0] + 0.5 * (PH.mix[1] - PH.mix[0]) || u < 0.3;
    line(c, [[190, 0], [190, 16]], P.ink3, 1.5); rect(c, 178, 16, 24, 9, 3, P.ink3, null);
    c.fillStyle = warm ? 'rgba(245, 180, 60, 0.10)' : 'rgba(120, 170, 255, 0.10)'; c.beginPath(); c.moveTo(180, 25); c.lineTo(200, 25); c.lineTo(250 + dx, ty); c.lineTo(130 + dx, ty); c.closePath(); c.fill();
    lab(c, k, 'лампа', 214, 20, { px: 10, align: 'left', color: P.ink3, haloColor: P.surf });
    rect(c, 200 + dx, 184, 28, 16, 3, alpha(P.ink3, 0.2), P.ink2, 1.4);  // чашка
    rect(c, mk[0] - 2.5, mk[1] - 8, 5, 14, 1.5, P.ink2, null);          // маркер
    // рука Franka: основание, плечо, два звена, захват
    const bx = 112 + dx, by = ty, sx = bx, sy = ty - 34;
    rect(c, bx - 12, by - 10, 24, 10, 3, P.cl, null);
    line(c, [[bx, by - 10], [sx, sy]], P.cl, 9);
    const el = ik(sx, sy, eex, eey - 12, 62, 56);
    A.link(c, sx, sy, el[0], el[1], 9, alpha(P.cl, 0.85), P.ink);
    A.link(c, el[0], el[1], eex, eey - 12, 8, alpha(P.cl, 0.85), P.ink);
    circle(c, sx, sy, 5, P.surf, P.ink, 2); circle(c, el[0], el[1], 4.5, P.surf, P.ink, 2);
    const open = carry ? 3 : 7;                                       // захват: пальцы раскрыты или сомкнуты
    line(c, [[eex - open, eey - 12], [eex - open, eey + 2]], P.ink, 2.4); line(c, [[eex + open, eey - 12], [eex + open, eey + 2]], P.ink, 2.4);
    line(c, [[eex - open, eey - 12], [eex + open, eey - 12]], P.ink, 2.4);
    rect(c, eex + 6, eey - 24, 12, 8, 2, P.cl, P.ink, 1.2);           // камера на запястье
    // внешние камеры на стойках: при перемешивании переезжают
    const cb = G.camB || [300, 96], camA = [34 + 18 * shift, 118 - 16 * shift], camB = [cb[0] - 22 * shift, cb[1] + 14 * shift];
    for (const [cx, cy] of [camA, camB]) {
      line(c, [[cx, cy + 8], [cx, floorY]], P.ink3, 2); line(c, [[cx - 10, floorY], [cx + 10, floorY]], P.ink3, 2);
      c.fillStyle = alpha(P.cl, 0.1); c.beginPath(); c.moveTo(cx, cy); c.lineTo(eex - 30, ty - 4); c.lineTo(eex + 30, ty - 4); c.closePath(); c.fill();
      rect(c, cx - 11, cy - 7, 22, 14, 3, P.cl, P.ink, 1.2);
    }
    // оператор с VR-пультом: человек и то, что он задаёт, — оранжевым
    const ox = 330 - (G.narrow ? 4 : 0), hy = 96;
    circle(c, ox, hy, 10, P.surf, P.mot, 2.2);
    rect(c, ox - 9, hy - 5, 13, 7, 2, P.mot, null);                   // шлем
    line(c, [[ox, hy + 10], [ox, 190]], P.mot, 2.6);
    line(c, [[ox, 190], [ox - 10, floorY]], P.mot, 2.6); line(c, [[ox, 190], [ox + 8, floorY]], P.mot, 2.6);
    const hand = [ox - 30 + (eex - 176 - dx) * 0.35, 150 + (eey - 132) * 0.35];
    line(c, [[ox, 128], hand], P.mot, 2.6);
    rect(c, hand[0] - 5, hand[1] - 4, 10, 8, 2, P.mot, null);         // пульт
    if (u < PH.rec[1]) line(c, [hand, [eex + 10, eey - 6]], alpha(P.mot, 0.8), 1.4, [4, 4], -t * 30);
    // подписи
    lab(c, k, 'Franka', bx - 4, ty + 22, { px: 10.5, color: P.cl, haloColor: P.surf });
    lab(c, k, 'Zed 2', camA[0], camA[1] - 16, { px: 10, color: P.cl, haloColor: P.surf });
    lab(c, k, 'Zed 2', camB[0], camB[1] - 16, { px: 10, color: P.cl, haloColor: P.surf });
    lab(c, k, G.narrow ? 'на запястье' : 'Zed Mini на запястье', eex + 12, eey - 36, { px: 10, color: P.cl, haloColor: P.surf });
    lab(c, k, 'оператор', ox - 2, hy - 22, { px: 10.5, color: P.mot, haloColor: P.surf });
    lab(c, k, 'VR-пульт', hand[0] - 2, hand[1] + 16, { px: 10, color: P.mot, haloColor: P.surf });
    lab(c, k, 'стол на колёсах', (tx0 + tx1) / 2, floorY - 8, { px: 10, color: P.ink3, haloColor: P.surf });
  }
  /** Лента эпизода: строки — три камеры, состояние руки, действие; столбцы — шаги записи. */
  function tape(c, k, t, P, A, G) {
    const { seg, lab, line, rect, alpha } = A, u = ((t % T) + T) % T;
    const rec = seg(u, ...PH.rec), ok = seg(u, ...PH.ok), lang = seg(u, ...PH.lang), mix = seg(u, ...PH.mix);
    const x0 = G.tx, y0 = G.ty, lw = G.lw, cw = (G.tw - lw) / NCOL, rh = G.rh, fade = 1 - Math.min(1, mix * 1.6);
    const rows = [['камера 1', 'cam'], ['камера 2', 'cam'], ['запястье', 'cam'], [G.narrow ? 'суставы' : 'суставы, захват', 'state'], ['действие', 'act']];
    const title = u < PH.rec[1] ? (G.narrow ? 'запись: 15 шагов в секунду' : 'запись эпизода: 15 шагов в секунду') : u < PH.ok[1] ? 'сборщик отмечает, удалась ли попытка' : u < PH.lang[1] ? (G.narrow ? 'разметчики: 1–3 описания задачи' : 'разметчики добавляют 1–3 описания задачи') : u < PH.mix[1] ? (G.narrow ? 'перемешать сцену' : 'перемешать сцену: камеры, стол, свет, предметы') : 'следующий эпизод';
    lab(c, k, title, x0 + G.tw / 2, y0 - 16, { px: 11.5, weight: 700, color: u < PH.rec[1] ? P.cl : u < PH.mix[0] ? P.mot : P.ink2, haloColor: P.surf });
    const n = u < PH.rec[1] ? Math.floor(rec * NCOL + 0.999) : NCOL;
    c.globalAlpha = fade;
    rows.forEach(([name, kind], r) => {
      const y = y0 + r * rh;
      lab(c, k, name, x0 + lw - 6, y + rh / 2, { px: 10, align: 'right', color: kind === 'act' ? P.mot : P.cl, haloColor: P.surf });
      line(c, [[x0 + lw, y + rh], [x0 + G.tw, y + rh]], P.grid, 1);
      for (let i = 0; i < n; i++) {
        const cx = x0 + lw + i * cw, s = i / (NCOL - 1), ee = eePath(s);
        if (kind === 'cam') {
          rect(c, cx + 2, y + 4, cw - 4, rh - 8, 2, P.surf, P.cl, 1.1);
          const ox = r === 2 ? 0.5 : (ee[0] - 150) / 110, oy = r === 2 ? 0.55 : (ee[1] - 120) / 90;
          c.fillStyle = alpha(P.cl, 0.75); c.fillRect(cx + 2 + (cw - 8) * Math.max(0, Math.min(1, ox + (r ? 0.1 : -0.1))), y + 4 + (rh - 12) * Math.max(0, Math.min(1, oy)), 4, 4);
        } else if (kind === 'state') {
          for (let j = 0; j < 4; j++) { const v = 0.5 + 0.4 * Math.sin(s * 5 + j * 1.3); c.fillStyle = alpha(P.cl, 0.75); c.fillRect(cx + 3 + j * (cw - 6) / 4, y + rh - 4 - v * (rh - 8), (cw - 6) / 4 - 1, v * (rh - 8)); }
        } else {
          const nx = eePath(Math.min(1, s + 0.08)), ax = nx[0] - ee[0], ay = nx[1] - ee[1], L = Math.hypot(ax, ay) || 1, sc = Math.min(1, L / 6) * (cw / 2 - 3);
          A.arrow(c, cx + cw / 2 - ax / L * sc, y + rh / 2 - ay / L * sc, cx + cw / 2 + ax / L * sc, y + rh / 2 + ay / L * sc, P.mot, 1.6, 4);
        }
      }
    });
    // ось шагов под лентой
    const yb = y0 + rows.length * rh + 12;
    if (n > 0) lab(c, k, G.narrow ? 'шаги эпизода →' : 'шаги эпизода, по 1/15 с →', x0 + lw + Math.max(n, 6) * cw / 2, yb, { px: 10, color: P.ink3, haloColor: P.surf });
    // отметка успеха
    if (u >= PH.ok[0]) {
      const bx = x0 + G.tw - G.flagW, by = yb + 10;
      c.globalAlpha = fade * Math.min(1, ok * 2.5);
      rect(c, bx, by, G.flagW, 22, 6, alpha(P.mot, 0.15), P.mot, 1.6);
      lab(c, k, '✓ удалась', bx + G.flagW / 2, by + 11, { px: 11, weight: 700, color: P.mot, halo: false });
      lab(c, k, 'отметка сборщика', bx - 8, by + 11, { px: 10, align: 'right', color: P.mot, haloColor: P.surf });
    }
    // описания задачи от разметчиков
    const TX = ['«положи маркер в чашку»', '«переложи маркер в кружку»', '«убери маркер в чашку»'];
    if (u >= PH.lang[0]) TX.forEach((tx, i) => {
      const vis = Math.max(0, Math.min(1, lang * 3.2 - i)); if (vis <= 0) return;
      const by = yb + 42 + i * 24;
      c.globalAlpha = fade * vis;
      rect(c, x0 + lw, by, G.tw - lw, 19, 9, P.surf, P.mot, 1.3);
      lab(c, k, tx, x0 + lw + (G.tw - lw) / 2, by + 9.5, { px: 10.5, color: P.ink, halo: false });
      if (i === 0) lab(c, k, 'описания', x0 + lw - 6, by + 9.5, { px: 10, align: 'right', color: P.mot, haloColor: P.surf });
    });
    c.globalAlpha = 1;
  }
  function draw(c, k, t, P0, A, G) { const P = Object.assign({ cl: P0.out }, P0); rig(c, k, t, P, A, G); tape(c, k, t, P, A, G); }
  Anim.add('droid', {
    W: 720, H: 340, start: 3.2, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { tx: 384, ty: 50, tw: 326, lw: 92, rh: 30, flagW: 92 }); },
    narrow: { W: 360, H: 640, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, camB: [272, 104], tx: 8, ty: 348, tw: 344, lw: 66, rh: 28, flagW: 92 }); } },
  });
})();

/* =====================================================================
   Модели: обучаются по кнопке, один раз; проверки кэшируются
   ===================================================================== */
const Store = (() => {
  const E = L43, st = { models: {}, checks: {}, sets: {}, busy: null, prog: 0 };
  const subs = [], emit = () => subs.forEach((f) => f());
  let test = null, home = null;
  const testSet = () => test || (test = E.testSet());
  const homeSet = () => home || (home = E.homeSet());
  /** Набор лаборатории 1: 'one' — 48 эпизодов дома; '111', '100'… — 24 кухни, где меняются отмеченные свойства. */
  function kitSet(key) {
    if (!st.sets[key]) st.sets[key] = key === 'one' ? E.dataset(1, E.AX_NONE) : E.dataset(24, { table: key[0] === '1', light: key[1] === '1', objs: key[2] === '1' });
    return st.sets[key];
  }
  /** Обучить модели по списку [имя, эпизоды]; прогресс — общий на все. */
  async function trainAll(list, tag) {
    const todo = list.filter(([name]) => !st.models[name]);
    if (!todo.length) return;
    st.busy = tag || 'train'; st.prog = 0; emit();
    for (let q = 0; q < todo.length; q++) {
      const [name, demos] = todo[q];
      st.models[name] = await runChunked(E.train(demos, { seed: 5 }), (e) => { st.prog = (q + (e.it + 1) / e.iters) / todo.length; emit(); }, 14);
    }
    st.busy = null; st.prog = 1; emit();
  }
  /** Проверка модели на 24 новых кухнях ('test') или дома ('home'). */
  function check(name, where) {
    const m = st.models[name]; if (!m) return null;
    const key = name + '@' + (where || 'test');
    if (!st.checks[key]) st.checks[key] = E.check(m, where === 'home' ? homeSet() : testSet());
    return st.checks[key];
  }
  return { st, on: (f) => subs.push(f), emit, kitSet, trainAll, check, testSet, homeSet, has: (n) => !!st.models[n] };
})();

/* =====================================================================
   1. Лаборатория: одна кухня или двадцать четыре
   ===================================================================== */
const Kitchens = (() => {
  const E = L43, CW = 360, AXES = E.AXES;
  const st = { scene: 0, axes: { table: true, light: true, objs: true }, bars: null };
  let ctl = null;
  const axKey = () => E.axKey(st.axes);
  const rightName = () => 'k' + axKey();
  const COLOR = Object.fromEntries(L21.COLORS.map((q) => [q.id, q]));
  const objWord = (q) => (q ? L21.phrase(q.color, q.shape) : 'стол');
  const cubeWord = (col) => `${COLOR[col].m} кубик`;
  /** Сцена проверки сверху: картинка стола, вероятности захвата оранжевой заливкой, кубик — зелёным кольцом. */
  function drawPane(cv, name) {
    const { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), ep = Store.testSet()[st.scene], sc = CW / L21.TW;
    c.imageSmoothingEnabled = false; c.drawImage(bitmap(ep.img, L21.TW, L21.TW), 0, 0, CW, CW);
    const m = Store.st.models[name];
    if (m) {
      const p = E.probs(m, ep); let mx = 1e-12; for (const v of p) mx = Math.max(mx, v);
      const cs = CW / L21.G; c.fillStyle = P.e2e;
      for (let i = 0; i < p.length; i++) { const a = Math.pow(p[i] / mx, 0.6); if (a < 0.04) continue; c.globalAlpha = 0.85 * a; c.fillRect((i % L21.G) * cs, Math.floor(i / L21.G) * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    const t = ep.target; c.beginPath(); c.arc(t.x * sc, t.y * sc, L21.RT * sc * 1.25, 0, 7); c.lineWidth = 3; c.strokeStyle = P.good; c.stroke();
    if (!m) HeroKit.label(c, k, Store.st.busy ? 'модель учится…' : 'модель ещё не обучена', CW / 2, CW / 2, { px: 13, weight: 700, color: P.ink, haloColor: P.surf });
  }
  /** Шесть эпизодов набора: картинка и кольцо там, где оператор сомкнул захват. */
  function drawThumbs(box, set) {
    if (box.dataset.key === set.key) return; box.dataset.key = set.key; box.innerHTML = '';
    box.append(h('span', { class: 'th-l' }, 'в данных:'));
    set.demos.slice(0, 6).forEach((d) => {
      const cv = h('canvas', { width: 96, height: 96, 'aria-hidden': 'true' }), c = cv.getContext('2d');
      c.imageSmoothingEnabled = false; c.drawImage(bitmap(d.ep.img, L21.TW, L21.TW), 0, 0);
      const q = L21.cellXY(d.cell); grip(c, q.x, q.y, 6);
      box.append(cv);
    });
  }
  function paneStat(name) {
    const r = Store.check(name);
    if (!r) return { html: Store.st.busy ? 'Модель учится…' : 'Модель ещё не обучена', cls: '' };
    const q = r.runs[st.scene], v = pct(q.p);
    return { html: `<b>В кубик: ${v}% попыток</b> · чаще всего — ${q.topOk ? 'кубик' : objWord(q.top)}`, cls: v >= 50 ? 'ok' : 'bad' };
  }
  const AX_TXT = (key) => (key === '111' ? 'всё' : key === '000' ? 'ничего' : AXES.filter((a, i) => key[i] === '1').map((a) => E.AXIS_NAME[a]).join(' и '));
  function bars() {
    const box = $('#kBars'); box.innerHTML = '';
    if (!st.bars) return;
    const rows = st.bars.map(([lbl, name, where]) => [lbl, Store.check(name, where)]);
    if (rows.some((r) => !r[1])) return;
    box.append(h('div', { class: 'sc-h muted-s' }, st.barsTitle || 'Доля попыток, в которых Ада берёт кубик'));
    for (const [lbl, r] of rows) {
      const bt = h('div', { class: 'bt' }, h('i', { class: 'ok', style: `width:${(r.rate * 100).toFixed(1)}%` }));
      box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, lbl), bt, h('span', { class: 'bn' }, `${pct(r.rate)}%`)));
    }
  }
  function out() {
    const el = $('#kOut');
    if (Store.st.busy) { setOut(el, `Модели учатся в браузере: <b>${pct(Store.st.prog)}%</b>`); return; }
    const ep = Store.testSet()[st.scene], kt = ep.kit;
    setOut(el, `Кухня проверки ${st.scene + 1} из 24: скатерть — ${E.TABLES[kt.table].name}, свет — ${E.LIGHTS[kt.light].name}, ${cubeWord(kt.cube)}, рядом ${kt.objs.map((j) => L21.phrase(E.OTHERS[j].color, E.OTHERS[j].shape)).join(', ')}.`);
  }
  function render() {
    const rn = rightName();
    for (const [side, name, L] of [[0, 'one', 'L'], [1, rn, 'R']]) {
      drawPane($('#kCv' + L), name);
      const s = paneStat(name); setOut($('#kStat' + L), s.html); $('#kStat' + L).className = 'pane-stat' + (s.cls ? ' ' + s.cls : '');
      const set = Store.kitSet(side ? axKey() : 'one'); set.key = side ? axKey() : 'one'; drawThumbs($('#kTh' + L), set);
    }
    setOut($('#kSubR'), axKey() === '111' ? 'по 2 эпизода в каждой' : `по 2 эпизода; меняется: ${AX_TXT(axKey())}`);
    bars(); out();
    const pg = $('#kProg'); pg.hidden = !(Store.st.busy && Store.st.busy.startsWith('k')); pg.firstElementChild.style.width = (Store.st.prog * 100).toFixed(1) + '%';
  }
  function setScene(i) { st.scene = Math.max(0, Math.min(23, i)); const inp = $('#kScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); if (ctl) ctl.update(); }
  /** Свойства кухонь у правой модели; модель для нового сочетания учится сразу. */
  async function setAxes(ax) {
    st.axes = Object.assign({}, ax); $$('#kAxes button').forEach((b) => b.setAttribute('aria-pressed', String(!!st.axes[b.dataset.v])));
    render();
    if (Store.st.busy) return;
    const key = axKey(); if (key !== '000' && !Store.has('k' + key)) await Store.trainAll([['k' + key, Store.kitSet(key).demos]], 'k-ax');
    render(); if (ctl) ctl.update();
  }
  function toggleAxis(a) { if (Store.st.busy) return; const ax = Object.assign({}, st.axes); ax[a] = !ax[a]; if (!ax.table && !ax.light && !ax.objs) return; setAxes(ax); }
  function state() { const one = Store.check('one'), many = Store.check('k111'); return { trained: !!(one && many), scene: st.scene, axes: axKey(), one: one ? one.rate : null, many: many ? many.rate : null, right: Store.check(rightName()) ? Store.check(rightName()).runs[st.scene].p : null, left: one ? one.runs[st.scene].p : null }; }
  const api = {
    reset() { st.bars = null; setAxes({ table: true, light: true, objs: true }); setScene(0); },
    state, setScene, setAxes, render,
    /** Миссия 1: обе модели, 24 новые кухни и дом. */
    async first() {
      await Store.trainAll([['one', Store.kitSet('one').demos], ['k111', Store.kitSet('111').demos]], 'k1');
      st.bars = [['Одна кухня, новые кухни', 'one'], ['24 кухни, новые кухни', 'k111'], ['Одна кухня, дома', 'one', 'home'], ['24 кухни, дома', 'k111', 'home']]; st.barsTitle = 'Доля попыток, в которых Ада берёт кубик: 24 новые кухни и 24 эпизода дома';
      await setAxes({ table: true, light: true, objs: true });
      const one = Store.check('one'), many = Store.check('k111'), ts = Store.testSet();
      let best = 0; one.runs.forEach((q, i) => { if (many.runs[i].p - q.p > many.runs[best].p - one.runs[best].p) best = i; });
      const red = ts.map((ep, i) => i).filter((i) => ts[i].kit.cube === 'red'), oth = ts.map((ep, i) => i).filter((i) => ts[i].kit.cube !== 'red');
      const avg = (c, idx) => idx.reduce((s, i) => s + c.runs[i].p, 0) / Math.max(1, idx.length);
      setScene(best);
      return { one: one.rate, many: many.rate, homeOne: Store.check('one', 'home').rate, homeMany: Store.check('k111', 'home').rate, best, bestCube: ts[best].kit.cube, bestTop: one.runs[best].top, bestOne: one.runs[best].p, bestMany: many.runs[best].p,
        redN: red.length, redOne: avg(one, red), redMany: avg(many, red), othN: oth.length, othOne: avg(one, oth), othMany: avg(many, oth) };
    },
    /** Миссия 2: три модели, у каждой меняется одно свойство кухонь. */
    async axes() {
      await Store.trainAll([['one', Store.kitSet('one').demos], ['k111', Store.kitSet('111').demos], ['k100', Store.kitSet('100').demos], ['k010', Store.kitSet('010').demos], ['k001', Store.kitSet('001').demos]], 'k2');
      st.bars = [['Одна кухня', 'one'], ['24 кухни, разные скатерти', 'k100'], ['24 кухни, разный свет', 'k010'], ['24 кухни, разные предметы', 'k001'], ['24 кухни, разное всё', 'k111']]; st.barsTitle = 'Доля попыток, в которых Ада берёт кубик в 24 новых кухнях';
      await setAxes({ table: false, light: false, objs: true });
      const r = (n) => Store.check(n).rate;
      return { one: r('one'), table: r('k100'), light: r('k010'), objs: r('k001'), all: r('k111') };
    },
  };
  const missions = [
    { short: 'Ставка', title: 'Кто справится в новых кухнях', text: 'Обе модели учатся на 48 эпизодах: левая — на 48 эпизодах в домашней кухне, правая — на двух эпизодах в каждой из 24 разных кухонь. Нажми кнопку: модели обучатся в браузере, и каждую проверят в 24 новых кухнях и в 24 эпизодах дома.',
      controls: ['scene'],
      bet: { q: 'какая модель чаще возьмёт кубик в новых кухнях?', options: ['Одна кухня: 48 записей одной обстановки выучат задачу твёрже', 'Поровну: эпизодов одинаково', '24 кухни'], answer: (r) => (r.many > r.one + 0.05 ? 2 : r.one > r.many + 0.05 ? 0 : 1) },
      action: { label: 'Обучить обе модели и проверить', run: (X) => X.first() },
      criteria: [{ label: 'Дома обе модели берут кубик не меньше чем в 95% попыток', test: (r) => r.homeOne >= 0.95 && r.homeMany >= 0.95 }, { label: 'В новых кухнях модель из 24 кухонь удачнее хотя бы в полтора раза', test: (r) => r.many >= 1.5 * r.one }],
      explain: (r) => `Дома обе модели почти не ошибаются: ${pct(r.homeOne)}% и ${pct(r.homeMany)}% попыток. В новых кухнях модель из одной кухни попадает в кубик в ${pct(r.one)}% попыток, модель из 24 кухонь — в ${pct(r.many)}%. Разница почти вся там, где кубик не красный: в ${nWord(r.othN, 'такой кухне', 'таких кухнях', 'таких кухнях')} ${pct(r.othOne)}% против ${pct(r.othMany)}%, а в ${r.redN} кухнях с красным кубиком — ${pct(r.redOne)}% против ${pct(r.redMany)}%. На сцене сейчас кухня ${r.best + 1}: кубик ${COLOR[r.bestCube].m}, и левая модель чаще всего берёт ${r.bestTop ? L21.phrase(r.bestTop.color, r.bestTop.shape) : 'пустой стол'} — дома красным был только кубик.` },
    { short: 'Что менять', title: 'Какое отличие кухонь важнее', text: 'В 24 кухнях правой модели менялось всё сразу: скатерть, свет и предметы. Обучим ещё три модели, тоже на 24 кухнях по 2 эпизода, но в каждой меняется только одно свойство, остальное — как дома. Проверка та же: 24 новые кухни, где меняется всё.',
      controls: ['scene'],
      bet: { q: 'какое свойство поможет сильнее всего?', options: ['Скатерть: на новых скатертях модель путается чаще всего', 'Свет: он меняет все цвета сразу', 'Предметы'], answer: (r) => { const v = [r.table, r.light, r.objs]; return v.indexOf(Math.max(...v)); } },
      action: { label: 'Обучить три модели', run: (X) => X.axes() },
      criteria: [{ label: 'Сильнее всего помогли разные предметы', test: (r) => r.objs > r.table && r.objs > r.light }, { label: 'Все свойства сразу — не хуже, чем одни предметы', test: (r) => r.all >= r.objs }],
      explain: (r) => `Одна кухня — ${pct(r.one)}%, разные скатерти — ${pct(r.table)}%, разный свет — ${pct(r.light)}%, разные предметы — ${pct(r.objs)}%, всё сразу — ${pct(r.all)}%. Пока кубик во всех кухнях красный, правило «тянись к красному» работает в данных, как бы ни менялись скатерть и свет, и форме модель не учится. Разные предметы ломают это правило, а скатерти и свет добавляют к ним устойчивость к фону и освещению. Разнообразие помогает по той оси, по которой меняется мир проверки, — поэтому DROID считает отдельно сцены, предметы, задачи и точки обзора.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Включай и выключай свойства кухонь у правой модели и листай кухни проверки. Найди кухню, где ошибается даже модель, у которой менялось всё, и посмотри, с чем она путает кубик.', final: true, controls: ['scene', 'axes'] },
  ];
  function init() {
    legend('#kLegend', [['вероятность сомкнуть захват в клетке', 'var(--e2e)', 'band'], ['кубик, который надо взять', 'var(--good)', 'ring'], ['где оператор сомкнул захват (в примерах из данных)', '#ffffff', 'grip']]);
    $('#kScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    segBind('#kAxes', (v) => toggleAxis(v));
    let last = 0; Store.on(() => { const now = performance.now(); if (!Store.st.busy || now - last > 150) { last = now; render(); } });
    ctl = mountMissions('#kMis', missions, api, { controls: { scene: '#wrapKScene', axes: '#wrapKAxes' }, scene: '#kDuo' });
    syncRange($('#kScene'), '1'); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Интерактив: шесть наборов данных в одной таблице
   ===================================================================== */
const Datasets = (() => {
  const E = L43, D = E.DATASETS, st = { col: 'off', sel: null, open: false, hover: null };
  let ctl = null;
  const nf = (v) => Math.round(v).toLocaleString('ru-RU');
  const TRAJ = { robonet: '≈162 тыс.', rt1: '≈130 тыс.', bridge: '60 096', oxe: '1,4 млн', droid: '76 тыс.', agibot: '1 001 552' };
  const TASKS = { rt1: ['744', 'инструкции'], bridge: ['13', 'навыков'], oxe: ['527', 'навыков'], droid: ['86', 'глаголов'], agibot: ['217', 'задач'] };
  const COLS_ALL = [['name', 'Набор, год, как собирали'], ['models', 'Моделей роботов'], ['traj', 'Траектории'], ['hours', 'Часы'], ['scenes', 'Сцены'], ['tasks', 'Задачи'], ['per', 'Траекторий на сцену']];
  const cols = () => COLS_ALL.filter((c) => c[0] !== 'per' || st.col === 'per');
  const per = (d) => d.traj / d.scenes;
  function cellText(d, key) {
    if (key === 'name') return h('span', null, h('b', null, d.name), ' · ' + d.year, h('small', null, d.how));
    if (key === 'models') return String(d.models);
    if (key === 'traj') return TRAJ[d.id];
    if (key === 'hours') return d.hours ? nf(d.hours) : '';
    if (key === 'scenes') return st.open ? nf(d.scenes) : '?';
    if (key === 'tasks') return TASKS[d.id] ? h('span', null, TASKS[d.id][0], h('small', null, ' ' + TASKS[d.id][1])) : '';
    if (key === 'per') return st.open ? '≈' + nf(per(d)) : '?';
    return '';
  }
  function note(d, key) {
    if (key === 'name') return `${d.n.how || ''}`;
    if (key === 'per') return `Траектории разделить на сцены: ${TRAJ[d.id]} / ${nf(d.scenes)}. ${d.id === 'agibot' ? 'Сцены AgiBot World посчитаны по их определению, поэтому сравнение приблизительное.' : 'Обе величины — из таблицы I статьи DROID.'}`;
    if (key === 'scenes' && !st.open) return 'Число сцен откроется после ставки в первой миссии.';
    return d.n[key] || '';
  }
  function render() {
    const box = $('#dsTable'); box.innerHTML = '';
    const tbl = h('table', { class: 'ptable ds-table' }), thead = h('thead'), tbody = h('tbody'), trh = h('tr');
    cols().forEach(([key, t]) => trh.append(h('th', { class: key === 'name' ? '' : 'num' }, t)));
    thead.append(trh);
    for (const d of D) {
      const tr = h('tr', { class: st.sel === d.id ? 'sel' : '', 'data-id': d.id, tabindex: '0' });
      cols().forEach(([key]) => {
        const td = h('td', { class: (key === 'name' ? 'rowhead' : 'num') + (st.hover && st.hover[0] === d.id && st.hover[1] === key ? ' hl' : ''), 'data-k': key });
        const v = cellText(d, key); if (typeof v === 'string') td.textContent = v; else td.append(v);
        if ((key === 'scenes' || key === 'per') && !st.open) td.classList.add('hid');
        tr.append(td);
      });
      tbody.append(tr);
    }
    tbl.append(thead, tbody); box.append(tbl);
    out();
  }
  function out() {
    const el = $('#dsOut');
    if (st.hover) { const d = D.find((q) => q.id === st.hover[0]), col = COLS_ALL.find((c) => c[0] === st.hover[1]); setOut(el, `<b>${d.name}${st.hover[1] === 'name' ? ', ' + d.year : ' · ' + col[1].toLowerCase()}.</b> ${note(d, st.hover[1])}`); return; }
    setOut(el, 'Наведи на ячейку или нажми на неё — здесь появится, откуда число и как его считали.');
  }
  function hover(id, key) { st.hover = id ? [id, key] : null; $$('#dsTable td.hl').forEach((x) => x.classList.remove('hl')); if (id) { const td = $(`#dsTable tr[data-id="${id}"] td[data-k="${key}"]`); if (td) td.classList.add('hl'); } out(); }
  function select(id) { st.sel = id; $$('#dsTable tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === id)); if (ctl) ctl.update(); }
  function setCol(v) { st.col = v; segSet('#dsCol', v); render(); if (ctl) ctl.update(); }
  const state = () => ({ col: st.col, sel: st.sel, open: st.open });
  const api = {
    reset() { st.open = false; st.sel = null; st.hover = null; setCol('off'); },
    state, setCol, select, hover,
    async reveal() { st.open = true; render(); await wait(150); const top = D.reduce((m, d) => (d.scenes > m.scenes ? d : m), D[0]); return { top: top.id, scenes: Object.fromEntries(D.map((d) => [d.id, d.scenes])) }; },
  };
  const missions = [
    { short: 'Сцены', title: 'У кого больше всего сцен', text: 'Сцена в таблице I статьи DROID — отдельное рабочее место робота: другая комната или заметно другой стол, а не перестановка предметов. Сделай ставку и открой столбец «Сцены».',
      bet: { q: 'в каком наборе больше всего сцен?', options: ['AgiBot World: миллион траекторий', 'Open X-Embodiment: в нём 60 наборов', 'DROID'], answer: (r) => ['agibot', 'oxe', 'droid'].indexOf(r.top) },
      action: { label: 'Открыть столбец «Сцены»', run: (X) => X.reveal() },
      criteria: [{ label: 'Больше всего сцен у DROID', test: (r) => r.top === 'droid' }],
      explain: (r) => `DROID — ${r.scenes.droid} сцен, Open X-Embodiment — ${r.scenes.oxe}, хотя это 60 наборов вместе, AgiBot World — ${r.scenes.agibot} по собственному подсчёту, BridgeData V2 — ${r.scenes.bridge}, RoboNet — ${r.scenes.robonet}, RT-1 — ${r.scenes.rt1}. Миллион траекторий AgiBot World записан на одной площадке, а DROID возили по 52 зданиям.` },
    { short: 'На сцену', title: 'Сколько траекторий приходится на сцену', text: 'Покажи столбец «траекторий на сцену» и нажми на строку набора, где на одну сцену приходится меньше всего записей.',
      controls: ['col'],
      criteria: [{ label: 'Столбец «траекторий на сцену» показан', test: (r, s) => s.col === 'per' }, { label: 'Выбран набор, где на сцену меньше всего траекторий', test: (r, s) => s.col === 'per' && s.open && s.sel === D.reduce((m, d) => (per(d) < per(m) ? d : m), D[0]).id }],
      hint: 'Переключатель — под таблицей. Нажми на любую ячейку строки, чтобы выбрать набор.',
      explain: () => `${D.slice().sort((a, b) => per(a) - per(b)).map((d) => `${d.name} — около ${nf(per(d))}`).join(', ')}. Это два пути из текста: DROID тратит записи на новые места, AgiBot World и RT-1 — на много попыток в немногих местах. В лаборатории ниже эти пути сравним при одном бюджете.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Наведи на ячейки столбца «Задачи» и сравни, что каждый набор называет задачей. Найди набор, у которого инструкций сотни, а глаголов, по подсчёту DROID, всего два.', final: true, controls: ['col'] },
  ];
  function init() {
    render();
    const box = $('#dsTable');
    box.addEventListener('mouseover', (e) => { const td = e.target.closest('td'); if (td) hover(td.parentElement.dataset.id, td.dataset.k); });
    box.addEventListener('click', (e) => { const td = e.target.closest('td'); if (!td) return; hover(td.parentElement.dataset.id, td.dataset.k); select(td.parentElement.dataset.id); });
    box.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr[data-id]'); if (tr) { e.preventDefault(); hover(tr.dataset.id, 'name'); select(tr.dataset.id); } });
    segBind('#dsCol', (v) => setCol(v));
    ctl = mountMissions('#dsMis', missions, api, { controls: { col: '#wrapDsCol' }, scene: '#dsTable' });
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: проверка эпизодов — выбросить испорченные или записать ещё
   ===================================================================== */
const Curation = (() => {
  const E = L43, st = { off: new Set(), reveal: false, bars: null, barsTitle: '' };
  let ctl = null, D = null, X = null;
  const set = () => D || (D = E.curationSet(0));
  const extra = () => X || (X = E.curationSet(1));
  const isBad = (d) => d.kind !== 'good';
  const KIND = { miss: 'мимо', wrong: 'не тот предмет' };
  /** Имя модели по набору включённых эпизодов: маска из 48 бит. */
  const sig = (keep) => 'c:' + set().map((_, i) => (keep(i) ? 1 : 0)).join('');
  async function trainKeep(keep, tag) { const name = sig(keep); await Store.trainAll([[name, set().filter((_, i) => keep(i))]], tag); return name; }
  function card(i) {
    const d = set()[i], b = h('button', { type: 'button', class: 'ep', 'data-i': String(i), 'aria-pressed': 'false', 'aria-label': `Эпизод ${i + 1}` });
    // крупный план: участок 36 × 36 px вокруг места захвата, как кадр с камеры на запястье в момент захвата
    const S = 90, Z = 36, q = L21.cellXY(d.cell), sx = Math.max(0, Math.min(L21.TW - Z, q.x - Z / 2)), sy = Math.max(0, Math.min(L21.TW - Z, q.y - Z / 2));
    const cv = h('canvas', { width: S, height: S, 'aria-hidden': 'true' }), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false; c.drawImage(bitmap(d.ep.img, L21.TW, L21.TW), sx, sy, Z, Z, 0, 0, S, S);
    grip(c, (q.x - sx) * S / Z, (q.y - sy) * S / Z, 9);
    b.append(cv, h('span', { class: 'ep-n' }, String(i + 1)), h('span', { class: 'ep-k' }, isBad(d) ? KIND[d.kind] : ''));
    return b;
  }
  function renderGrid() {
    const g = $('#cGrid');
    if (!g.children.length) set().forEach((_, i) => g.append(card(i)));
    [...g.children].forEach((b) => { const i = +b.dataset.i, d = set()[i], off = st.off.has(i); b.classList.toggle('off', off); b.setAttribute('aria-pressed', String(off)); b.classList.toggle('rv', st.reveal); b.classList.toggle('bad', st.reveal && isBad(d)); b.dataset.kind = st.reveal ? d.kind : ''; });
  }
  function counts() { let bad = 0, good = 0; st.off.forEach((i) => (isBad(set()[i]) ? bad++ : good++)); return { bad, good, kept: set().length - st.off.size }; }
  function bars() {
    const box = $('#cBars'); box.innerHTML = '';
    if (!st.bars) return;
    const rows = st.bars.map(([lbl, name]) => [lbl, Store.check(name)]);
    if (rows.some((r) => !r[1])) return;
    box.append(h('div', { class: 'sc-h muted-s' }, st.barsTitle));
    for (const [lbl, r] of rows) box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, lbl), h('div', { class: 'bt' }, h('i', { class: 'ok', style: `width:${(r.rate * 100).toFixed(1)}%` })), h('span', { class: 'bn' }, `${pct(r.rate)}%`)));
  }
  function render() {
    renderGrid(); bars();
    const c = counts();
    setOut($('#cCount'), `В наборе ${nWord(c.kept, 'эпизод', 'эпизода', 'эпизодов')}, убрано ${st.off.size}`);
    const el = $('#cOut');
    if (Store.st.busy && Store.st.busy.startsWith('c')) setOut(el, `Модель учится в браузере: <b>${pct(Store.st.prog)}%</b>`);
    else if (st.reveal) setOut(el, c.bad || c.good ? `Испорченные эпизоды подписаны. Убрано испорченных — ${c.bad} из 16, хороших — ${c.good}.` : 'Испорченные эпизоды подписаны: «мимо» и «не тот предмет».');
    else setOut(el, 'Смотри, где перекрестие: на кубике, рядом с ним на столе или на другом предмете.');
    const pg = $('#cProg'); pg.hidden = !(Store.st.busy && Store.st.busy.startsWith('c')); pg.firstElementChild.style.width = (Store.st.prog * 100).toFixed(1) + '%';
  }
  function toggle(i) { if (st.off.has(i)) st.off.delete(i); else st.off.add(i); render(); if (ctl) ctl.update(); }
  function setOff(list) { st.off = new Set(list); render(); if (ctl) ctl.update(); }
  const state = () => Object.assign({ reveal: st.reveal }, counts());
  const all = () => trainKeep(() => true, 'c0');
  const api = {
    reset() { st.off = new Set(); st.reveal = false; st.bars = null; render(); },
    state, toggle, setOff, render,
    badIdx: () => set().map((d, i) => (isBad(d) ? i : -1)).filter((i) => i >= 0),
    /** Миссия 1: обучить на оставшихся и сравнить со всеми 48. */
    async mine() {
      const base = await all(), keep = (i) => !st.off.has(i), name = await trainKeep(keep, 'c1'), c = counts();
      st.bars = [['Все 48 эпизодов', base], [`Без убранных: ${c.kept}`, name]]; st.barsTitle = 'Доля попыток, в которых Ада берёт кубик в 24 новых кухнях';
      render();
      return { base: Store.check(base).rate, mine: Store.check(name).rate, removedBad: c.bad, removedGood: c.good, kept: c.kept };
    },
    /** Миссия 2: вдвое больше эпизодов той же смеси против 32 хороших. */
    async more() {
      const base = await all(), good = await trainKeep((i) => !isBad(set()[i]), 'c2');
      await Store.trainAll([['c96', set().concat(extra())]], 'c2');
      st.bars = [['Все 48 эпизодов', base], ['96 эпизодов, испорчен каждый третий', 'c96'], ['32 хороших эпизода', good]]; st.barsTitle = 'Доля попыток, в которых Ада берёт кубик в 24 новых кухнях';
      st.reveal = true; render();
      return { all: Store.check(base).rate, more: Store.check('c96').rate, good: Store.check(good).rate };
    },
    /** Миссия 3: убрать только один вид испорченных. */
    async kinds() {
      const base = await all(), good = await trainKeep((i) => !isBad(set()[i]), 'c3');
      const noWrong = await trainKeep((i) => set()[i].kind !== 'wrong', 'c3'), noMiss = await trainKeep((i) => set()[i].kind !== 'miss', 'c3');
      st.bars = [['Все 48 эпизодов', base], ['Убраны 8 «не тот предмет», «мимо» остались', noWrong], ['Убраны 8 «мимо», «не тот предмет» остались', noMiss], ['Убраны все 16', good]]; st.barsTitle = 'Доля попыток, в которых Ада берёт кубик в 24 новых кухнях';
      st.reveal = true; render();
      const m = Store.st.models[noWrong], tbl = (mm) => { let t = 0; for (const ep of Store.testSet()) { const p = E.probs(mm, ep); for (let i = 0; i < p.length; i++) { const q = L21.cellXY(i); if (!ep.objs.some((o) => L21.hitObj(o, q.x, q.y))) t += p[i]; } } return t / Store.testSet().length; };
      return { all: Store.check(base).rate, keepMiss: Store.check(noWrong).rate, keepWrong: Store.check(noMiss).rate, good: Store.check(good).rate, tableMiss: tbl(m), tableGood: tbl(Store.st.models[good]) };
    },
  };
  const missions = [
    { short: 'Проверка', title: 'Найди испорченные эпизоды', text: 'В наборе 16 испорченных эпизодов из 48. Нажимай на те, где оператор сомкнул захват не на кубике: на столе рядом или на другом предмете, — они уберутся из набора. Когда закончишь, обучи модель на оставшихся и сравни с моделью на всех 48.',
      action: { label: 'Обучить на оставшихся и проверить', run: (X) => X.mine() },
      criteria: [{ label: 'Убрано не меньше 14 испорченных эпизодов из 16', test: (r) => r.removedBad >= 14 }, { label: 'Хороших эпизодов убрано не больше 3', test: (r) => r.removedGood <= 3 }],
      hint: 'В испорченном эпизоде центр перекрестия — на пустом столе возле кубика или на миске либо банке. Кубик — единственный квадратный предмет на столе; миска — кольцо, банка — узкий прямоугольник.',
      fail: (r) => `Убрано испорченных — ${r.removedBad} из 16, хороших — ${r.removedGood}. Модель на оставшихся ${r.kept} эпизодах попадает в кубик в ${pct(r.mine)}% попыток, на всех 48 — в ${pct(r.base)}%. Поищи ещё.`,
      explain: (r) => `На всех 48 эпизодах модель попадает в кубик в ${pct(r.base)}% попыток в новых кухнях, на оставшихся ${r.kept} — в ${pct(r.mine)}%. Убрано испорченных — ${r.removedBad} из 16, хороших — ${r.removedGood}. Эпизодов стало ${r.kept} вместо 48, а успех вырос: модель больше не учится брать стол и банки. Так работают разметчики AgiBot World, только у них эпизодов миллион.` },
    { short: 'Ещё или меньше', title: 'Записать ещё или выбросить', text: 'Проверка требует времени. Может быть, проще записать вдвое больше: ещё 48 эпизодов в тех же кухнях, у тех же операторов, с той же долей испорченных? Сравним 96 таких эпизодов с 32 хорошими.',
      bet: { q: 'что даст больше удачных попыток?', options: ['96 эпизодов: данных втрое больше, ошибки утонут в хороших', '32 хороших эпизода', 'Поровну'], answer: (r) => (r.more > r.good + 0.03 ? 0 : r.good > r.more + 0.03 ? 1 : 2) },
      action: { label: 'Обучить на 96 и на 32 хороших', run: (X) => X.more() },
      criteria: [{ label: '32 хороших эпизода лучше, чем 96 с испорченными', test: (r) => r.good > r.more }, { label: '96 эпизодов почти не лучше, чем 48: разница меньше 5 пунктов', test: (r) => r.more - r.all < 0.05 }],
      explain: (r) => `48 эпизодов — ${pct(r.all)}%, 96 с той же долей испорченных — ${pct(r.more)}%, 32 хороших — ${pct(r.good)}%. Политика подражает распределению действий в данных, и вдвое больший набор той же смеси учит той же смеси. У AgiBot World так же: 528 проверенных траекторий дали 0,59 доли выполненной задачи, они же с 482 непроверенными — 0,41.` },
    { short: 'Что вредит', title: 'Какая ошибка вредит сильнее', text: 'Испорченных эпизодов два вида, по 8: «мимо» и «не тот предмет». Обучим две модели: в одной убраны только «не тот предмет», в другой — только «мимо».',
      bet: { q: 'какие эпизоды вредят сильнее?', options: ['«Не тот предмет»: модель учится брать банки и миски', '«Мимо»', 'Одинаково: их поровну'], answer: (r) => (r.keepWrong > r.keepMiss + 0.03 ? 1 : r.keepMiss > r.keepWrong + 0.03 ? 0 : 2) },
      action: { label: 'Обучить две модели', run: (X) => X.kinds() },
      criteria: [{ label: 'Обе модели обучены и проверены', test: (r) => r.keepMiss != null && r.keepWrong != null }],
      explain: (r) => `Убрали только «не тот предмет» — ${pct(r.keepMiss)}%, только «мимо» — ${pct(r.keepWrong)}%, все 16 — ${pct(r.good)}%. ${r.keepWrong > r.keepMiss ? `Сильнее вредят «мимо»: в них целью отмечен пустой стол, а клеток стола на картинке сотни. Модель с «мимо» в данных отдаёт пустому столу ${pct(r.tableMiss)}% вероятности против ${pct(r.tableGood)}% у модели на хороших эпизодах.` : 'Сильнее вредит «не тот предмет»: модель учится брать банки и миски, похожие на кубик.'} Какая ошибка опаснее, зависит от того, как устроена политика, поэтому авторы DemInf советуют отдельно убирать неудачные попытки и паузы.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Убирай и возвращай эпизоды и обучай модель заново. Найди, сколько испорченных эпизодов можно оставить в наборе, пока успех ещё заметно выше, чем у всех 48.', final: true },
  ];
  function init() {
    $('#cGrid').addEventListener('click', (e) => { const b = e.target.closest('.ep'); if (b && !(Store.st.busy && Store.st.busy.startsWith('c'))) toggle(+b.dataset.i); });
    $('#cReset').addEventListener('click', () => setOff([]));
    let last = 0; Store.on(() => { const now = performance.now(); if (!Store.st.busy || now - last > 150) { last = now; render(); } });
    ctl = mountMissions('#cMis', missions, api, { scene: '#cGrid' });
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
    { q: 'Если записать вдвое больше эпизодов в той же кухне, модель станет вдвое лучше справляться в новых кухнях?', o: ['Да, данных больше — обобщение лучше', 'Нет: при том же бюджете больше даёт разнообразие сцен; повторы одной обстановки учат её особенностям', 'Нет, лишние данные только мешают'], a: 1, e: 'У BridgeData V2 при равном объёме 13 навыков дали 65% на новой задаче против 30% у трёх, у DROID выборка из всех сцен обошла выборку из 20 сцен с тем же числом траекторий. На столе Ады — 67% против 28%.' },
    { q: 'RoboNet записан операторами, как BridgeData V2 и DROID?', o: ['Да, телеоперацией', 'Нет: роботы двигались сами, случайными движениями из заданного человеком распределения', 'Нет, это синтетические данные из симулятора'], a: 1, e: 'Около 162 тысяч траекторий 7 роботов собраны почти без присмотра. На них учили модель, предсказывающую кадры, а не политику по демонстрациям.' },
    { q: 'DROID — самый большой набор по числу траекторий среди шести из таблицы?', o: ['Да, 76 тысяч — рекорд', 'Нет: траекторий больше у AgiBot World, Open X-Embodiment, RoboNet и RT-1, а DROID впереди по числу сцен — 564', 'Нет: меньше всех'], a: 1, e: 'AgiBot World — больше миллиона траекторий, Open X-Embodiment — 1,4 млн по таблице DROID, у RoboNet и RT-1 — около 162 и 130 тысяч. Зато на сцену у DROID приходится около 135 траекторий: записи потрачены на новые места.' },
    { q: 'В DROID новая сцена — это любая перестановка предметов или камер?', o: ['Да, так сцен и набралось 564', 'Нет: только заметное изменение рабочего места робота; из 2080 номеров сцен после проверки осталось 564', 'Нет: сцена — это здание'], a: 1, e: 'Перестановку предметов и сдвиг камер авторы считают «перемешиванием» одной сцены. Камеры при этом дают 1417 разных точек обзора.' },
    { q: 'Неудачные попытки в DROID выброшены?', o: ['Да, их удаляют сразу', 'Нет: сборщик отмечает каждую попытку, около 16 тысяч неудачных выложены отдельно и в 76 тысяч не входят', 'Нет: они смешаны с удачными без отметок'], a: 1, e: 'Отметка «удалась» — единственная проверка качества в DROID. AgiBot World добавляет просмотр каждого эпизода разметчиками и разметку ошибок с исправлениями.' },
    { q: 'Разнообразие состояний в данных всегда помогает политике?', o: ['Да, чем шире покрытие, тем лучше', 'Нет: разнообразие от шума мира помогает, а от разброса действий оператора вредит', 'Нет, оно всегда вредит'], a: 1, e: 'В задаче Square при одинаковом наборе состояний шум мира дал 82,0%, шум в действиях демонстратора — 73,0% на 200 эпизодах и 69,7% против 49,3% на 50.' },
    { q: 'Чтобы исправить набор с испорченными записями, достаточно записать ещё столько же?', o: ['Да, хорошие записи перевесят', 'Нет: политика подражает той же смеси; выбросить испорченное выгоднее', 'Нет, нужно начать сбор заново'], a: 1, e: 'У AgiBot World 528 проверенных траекторий дали 0,59 доли выполненной задачи, а вместе с 482 непроверенными — 0,41. На столе Ады 96 эпизодов с той же долей ошибок не лучше 48.' },
    { q: 'DemInf находит неудачные демонстрации?', o: ['Да, это его главная задача', 'Нет: он оценивает, насколько предсказуемы действия по состояниям, предполагает, что все демонстрации успешные, и паузы получают у него высокую оценку', 'Нет, он оценивает только длину эпизода'], a: 1, e: 'DemInf считает вклад эпизода во взаимную информацию между состояниями и действиями. Неудачи и паузы авторы советуют отсеивать отдельно — отметками успеха или проверкой человеком.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('table', () => { mis.table = Datasets.init(); });
    safe('kitchens', () => { mis.kitchens = Kitchens.init(); });
    safe('curation', () => { mis.curation = Curation.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['dsMis', 'kMis', 'cMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l43 = { mis, SPEED, Store, Kitchens, Datasets, Curation, L43 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
