/* =====================================================================
   ui-l31.js — урок 3.1 «RT-1». Интерактивы:
   1) калькулятор сбора данных: задачи × демонстрации × роботы → эпизоды
      и месяцы при темпе RT-1 (деление цифр статьи);
   2) лаборатория «Действие как токен»: сетка корзин на столе из урока 2.1,
      квантование точки захвата, мини-RT-1 (FiLM-токенизатор, мягкий отбор
      токенов, классификация корзин) обучается на странице; модели с разным
      числом корзин сравниваются рядом на одной сцене;
   3) интерактив «Разнообразие важнее объёма»: таблица абляций статьи с
      наведением и карточки «что помогло, что нет».
   Движок — l31/engine.js (без DOM) поверх l21/engine.js.
   ===================================================================== */
'use strict';

/* ---------- схема пути данных RT-1 (Anim «rt1»): кадр и команда → EfficientNet-B3 с FiLM (81 токен) →
   TokenLearner (8) → история из 6 кадров (48) → трансформер (8 слоёв) → 11 токенов действия → робот, 3 раза в секунду.
   Синим — токены картинки, оранжевым — команда и действия, фиолетовым — трансформер; две раскладки. ---------- */
(() => {
  const T = 13;                                      // секунд на полный проход
  const PH = [[0, 1.4], [1.4, 3.0], [3.0, 4.4], [4.4, 5.6], [5.6, 8.0], [8.0, 9.6], [9.6, 11.2]];
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const CUBES = [[0.72, 0.3, '#d14b3c'], [0.3, 0.68, '#3a6fd1'], [0.56, 0.74, '#3b9a4a']], BOWL = [0.28, 0.3];

  /** Кадр с камеры: стол сверху, три кубика, миска и захват; grip — доля пути захвата к красному кубику. */
  function frame(c, k, cx, cy, w, h, P, A, pr, grip) {
    const { rect, circle, alpha } = A, x0 = cx - w / 2, y0 = cy - h / 2;
    rect(c, x0, y0, w, h, 4, P.surf, P.ink3, 1.4);
    if (pr <= 0) return;
    c.globalAlpha = Math.min(1, pr * 2);
    c.fillStyle = alpha(P.ink3, 0.12); c.fillRect(x0 + 3, y0 + 3, w - 6, h - 6);
    circle(c, x0 + BOWL[0] * w, y0 + BOWL[1] * h, h * 0.13, null, P.ink3, 1.6);
    for (const [u, v, col] of CUBES) { c.fillStyle = col; c.fillRect(x0 + u * w - h * 0.09, y0 + v * h - h * 0.09, h * 0.18, h * 0.18); }
    const gx = x0 + (0.12 + (CUBES[0][0] - 0.12) * grip) * w, gy = y0 + (0.86 + (CUBES[0][1] - 0.86) * grip) * h;
    c.strokeStyle = P.mot; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - 5, gy - 4); c.lineTo(gx - 5, gy + 4); c.moveTo(gx + 5, gy - 4); c.lineTo(gx + 5, gy + 4); c.moveTo(gx - 5, gy); c.lineTo(gx + 5, gy); c.stroke();
    c.globalAlpha = 1;
  }
  /** Сетка 9 × 9 токенов картинки; появляется по pr; film — доля линий FiLM от команды. */
  function grid81(c, cx, cy, size, P, A, pr) {
    const s = size / 9, pos = [];
    for (let i = 0; i < 81; i++) {
      const gx = cx - size / 2 + (i % 9) * s, gy = cy - size / 2 + Math.floor(i / 9) * s; pos.push([gx + s / 2, gy + s / 2]);
      if (pr * 81 > i) { c.fillStyle = A.alpha(P.out, 0.55 + 0.4 * hash(i)); c.fillRect(gx + 0.6, gy + 0.6, s - 1.2, s - 1.2); }
    }
    return pos;
  }
  /** Столбик или ряд из n токенов размера sz с шагом gap. */
  function row(c, cx, cy, n, dir, sz, gap, col, P, A, pr, edge) {
    const L = n * sz + (n - 1) * gap, pos = [];
    for (let i = 0; i < n; i++) {
      const o = -L / 2 + i * (sz + gap) + sz / 2, x = dir === 'v' ? cx : cx + o, y = dir === 'v' ? cy + o : cy; pos.push([x, y]);
      if (pr * n > i) A.rect(c, x - sz / 2, y - sz / 2, sz, sz, 2, A.alpha(col, 0.8), edge || col, 1.2);
    }
    return pos;
  }
  function flow(c, from, to, prog, n, color, A) {
    const F = from.filter(Boolean), Tt = to.filter(Boolean); if (prog <= 0 || prog >= 1 || !F.length || !Tt.length) return;
    for (let i = 0; i < n; i++) { const a = F[Math.floor(hash(i) * F.length)], b = Tt[Math.floor(hash(i + 99) * Tt.length)], ph = (prog * 2 + hash(i + 7)) % 1; A.circle(c, a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 2.2, color); }
  }
  /** Трансформер: 48 токенов блоком 6 × 8 и дуги внимания; layer — текущий слой 1…8. */
  function transformer(c, k, cx, cy, w, h, P, A, pr, prAtt) {
    A.rect(c, cx - w / 2, cy - h / 2, w, h, 8, A.alpha(P.spr, 0.08), pr > 0 ? P.spr : P.line, 1.4);
    if (pr <= 0) return [];
    const pos = [], sx = (w - 16) / 6, sy = (h - 16) / 8;
    for (let i = 0; i < 48; i++) { const x = cx - w / 2 + 8 + (i % 6) * sx + sx / 2, y = cy - h / 2 + 8 + Math.floor(i / 6) * sy + sy / 2; pos.push([x, y]); if (pr * 48 > i) A.circle(c, x, y, 2.4, A.alpha(P.out, 0.85)); }
    if (prAtt > 0) {
      const layer = Math.min(8, Math.floor(prAtt * 8) + 1), ph = (prAtt * 8) % 1;
      for (let q = 0; q < 14; q++) { const a = pos[Math.floor(hash(q + layer * 31) * 48)], b = pos[Math.floor(hash(q + 17 + layer * 7) * 48)]; if (a === b) continue; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2 + (hash(q) - 0.5) * 20, (a[1] + b[1]) / 2 + (hash(q + 3) - 0.5) * 20, b[0], b[1]); c.strokeStyle = A.alpha(P.spr, prAtt < 1 ? 0.35 + 0.5 * (1 - ph) : 0.3); c.lineWidth = 1.2; c.stroke(); }
      A.lab(c, k, prAtt < 1 ? `слой ${layer} из 8` : '8 слоёв', cx, cy + h / 2 + 11, { px: 10.5, color: P.spr, weight: 700, haloColor: P.surf2 });
    }
    return pos;
  }
  /** 11 токенов действия: полоски из 256 корзин с выбранной корзиной. */
  const ACT = [0.31, 0.62, 0.48, 0.5, 0.52, 0.47, 0.84, 0.5, 0.5, 0.5, 0.05];
  function actions(c, k, cx, cy, w, h, P, A, pr) {
    const rows = 11, sy = h / rows, pos = [];
    for (let i = 0; i < rows; i++) {
      const y = cy - h / 2 + i * sy + sy / 2; pos.push([cx, y]);
      if (pr * rows <= i) continue;
      A.rect(c, cx - w / 2, y - sy * 0.32, w, sy * 0.64, 2, A.alpha(P.motS, 1), A.alpha(P.mot, 0.5), 1);
      const bx = cx - w / 2 + ACT[i] * w; c.fillStyle = P.ink; c.fillRect(bx - 1.3, y - sy * 0.44, 2.6, sy * 0.88);
    }
    return pos;
  }
  function drawFlow(c, k, t, P, A, Gm) {
    const { lab, arrow, seg, alpha } = A, u = ((t % T) + T) % T, pr = PH.map(([a, b]) => seg(u, a, b)), cur = PH.findIndex(([a, b]) => u >= a && u < b);
    Gm.caps.forEach(([x, y, name, cnt], i) => {
      const on = Gm.col[cur] === i, started = Gm.col.some((cc, st) => cc === i && pr[st] > 0);
      lab(c, k, name, x, y, { px: 11, weight: 700, color: on ? P.ink : started ? P.ink2 : P.ink3, haloColor: P.surf2 });
      lab(c, k, cnt, x, y + 15, { px: 10.5, color: on ? P.out : P.ink3, haloColor: P.surf2 });
    });
    Gm.arrows.forEach(([x1, y1, x2, y2, st]) => arrow(c, x1, y1, x2, y2, pr[st] > 0 ? P.ink2 : P.line, 1.8, 6));
    // 1. кадр и команда
    frame(c, k, Gm.f[0], Gm.f[1], Gm.f[2], Gm.f[3], P, A, pr[0], pr[6] > 0 ? A.ease(pr[6]) : 0);
    if (pr[0] > 0.4) lab(c, k, '«возьми красный кубик»', Gm.cmd[0], Gm.cmd[1], { px: 10.5, color: P.mot, weight: 700, haloColor: P.surf2 });
    // 2. EfficientNet-B3 с FiLM: 81 токен, линии от команды
    const g81 = grid81(c, Gm.g[0], Gm.g[1], Gm.g[2], P, A, pr[1]);
    if (pr[1] > 0) { for (let i = 0; i < 5; i++) { const q = g81[Math.floor(hash(i + 40) * 81)]; A.line(c, [Gm.film, q], alpha(P.mot, 0.35 * Math.min(1, pr[1] * 2)), 1.1, [3, 3]); } lab(c, k, 'FiLM: γ, β от команды', Gm.filmLab[0], Gm.filmLab[1], { px: 10, color: P.mot, haloColor: P.surf2 }); }
    if (pr[0] > 0 && pr[1] <= 0) flow(c, [[Gm.f[0], Gm.f[1]]], g81, pr[0], 10, P.out, A);
    // 3. TokenLearner: 81 → 8
    const t8 = row(c, Gm.t8[0], Gm.t8[1], 8, Gm.dir8, Gm.sz, 3, P.out, P, A, pr[2] > 0 ? Math.max(pr[2], 1e-3) : 0);
    if (pr[2] > 0 && pr[2] < 1) flow(c, g81, t8, pr[2], 24, P.out, A);
    // 4. история: 6 кадров по 8 токенов
    const h48 = [];
    for (let f = 0; f < 6; f++) { const o = (f - 2.5) * (Gm.sz * 0.7 + 2), p = row(c, Gm.dir8 === 'v' ? Gm.h48[0] + o : Gm.h48[0], Gm.dir8 === 'v' ? Gm.h48[1] : Gm.h48[1] + o, 8, Gm.dir8, Gm.sz * 0.7, 2, f === 5 ? P.out : alpha(P.out, 0.45), P, A, pr[3] * 6 > f ? 1 : 0, alpha(P.out, 0.6)); h48.push(...p); }
    if (pr[3] > 0 && pr[3] < 1) flow(c, t8, h48.slice(40), pr[3], 10, P.out, A);
    // 5. трансформер
    const tp = transformer(c, k, Gm.tr[0], Gm.tr[1], Gm.tr[2], Gm.tr[3], P, A, pr[3] >= 1 || pr[4] > 0 ? 1 : 0, pr[4]);
    if (pr[4] > 0 && pr[4] < 0.2) flow(c, h48, tp, pr[4] * 5, 20, P.out, A);
    // 6. 11 токенов действия
    const ap = actions(c, k, Gm.ac[0], Gm.ac[1], Gm.ac[2], Gm.ac[3], P, A, pr[5]);
    if (pr[5] > 0 && pr[5] < 1) flow(c, tp, ap, pr[5], 16, P.mot, A);
    if (pr[5] > 0) Gm.acLab.forEach(([x, y, txt, al]) => lab(c, k, txt, x, y, { px: 10, color: P.ink3, align: al || 'center', haloColor: P.surf2 }));
    // 7. действие на роботе
    if (pr[6] > 0) { A.line(c, Gm.back, alpha(P.mot, 0.8), 1.6, [4, 4], -t * 20); lab(c, k, '3 раза в секунду', Gm.backLab[0], Gm.backLab[1], { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf2 }); }
  }

  Anim.add('rt1', {
    W: 720, H: 300, start: 4.0, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        dir8: 'v', sz: 11, col: [0, 1, 2, 3, 4, 5, 0],
        caps: [[66, 250, 'Кадр и команда', '300 × 300, текст'], [186, 250, 'EfficientNet-B3 + FiLM', '81 токен'], [292, 250, 'TokenLearner', '8 токенов'], [392, 250, 'История 6 кадров', '48 токенов'], [512, 250, 'Трансформер', '8 слоёв, 19 млн'], [648, 250, '11 токенов действия', '256 корзин на ось']],
        arrows: [[108, 150, 134, 150, 1], [238, 150, 280, 150, 2], [304, 150, 356, 150, 3], [428, 150, 462, 150, 4], [562, 150, 592, 150, 5]],
        f: [66, 150, 80, 60], cmd: [66, 104], g: [186, 150, 96], film: [100, 104], filmLab: [186, 88], t8: [292, 150], h48: [392, 150], tr: [512, 150, 92, 120], ac: [648, 150, 96, 120],
        acLab: [[598, 112, 'рука', 'right'], [598, 150, 'база', 'right'], [598, 203, 'режим', 'right']],
        back: [[648, 214], [648, 232], [66, 232], [66, 184]], backLab: [357, 224],
      });
    },
    narrow: {
      W: 360, H: 700,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          dir8: 'h', sz: 12, col: [0, 1, 2, 3, 4, 5, 0],
          caps: [[262, 50, 'Кадр и команда', '300 × 300, текст'], [262, 170, 'EfficientNet-B3 + FiLM', '81 токен'], [262, 282, 'TokenLearner', '8 токенов'], [262, 348, 'История 6 кадров', '48 токенов'], [262, 460, 'Трансформер', '8 слоёв, 19 млн'], [262, 600, '11 токенов действия', '256 корзин на ось']],
          arrows: [[96, 100, 96, 118, 1], [96, 222, 96, 254, 2], [96, 296, 96, 316, 3], [96, 378, 96, 400, 4], [96, 522, 96, 548, 5]],
          f: [96, 64, 80, 60], cmd: [250, 92], g: [96, 170, 96], film: [250, 104], filmLab: [262, 212], t8: [96, 284], h48: [96, 350], tr: [96, 460, 110, 110], ac: [96, 616, 110, 120],
          acLab: [[160, 580, 'рука', 'left'], [160, 616, 'база', 'left'], [160, 668, 'режим', 'left']],
          back: [[160, 616], [196, 616], [196, 64], [136, 64]], backLab: [262, 520],
        });
      },
    },
  });
})();

const SPEED = { k: 1 }; // ускорение анимаций и обучения для автотестов; на результаты не влияет
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Прогнать генератор обучения кусками между кадрами, чтобы страница не замирала. */
async function runGen(gen, perFrame, onEv) {
  for (;;) {
    let r; for (let i = 0; i < (perFrame || 1); i++) { r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); }
    await nextFrame();
  }
}
/** Картинка движка (Float32Array RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
function drawBitmap(c, bm, x, y, w, hgt) { c.imageSmoothingEnabled = false; c.drawImage(bm, x, y, w, hgt); }
const colorWord = (id) => L21.COLORS[L21.CI[id]].m;

/* =====================================================================
   1. Калькулятор сбора данных
   ===================================================================== */
const Calc = (() => {
  const RATE = 130000 / 13 / 17;                 // эпизодов на робота в месяц при темпе RT-1 (деление цифр статьи)
  const st = { tasks: 744, per: 175, robots: 13 };
  function out() {
    const episodes = st.tasks * st.per, months = episodes / (st.robots * RATE);
    $('#cEpisodes').textContent = fmtInt(episodes);
    $('#cMonths').textContent = months < 1 ? fmt(months * 30, 0) + ' дн.' : months < 24 ? fmt(months, months < 10 ? 1 : 0) : fmt(months / 12, 1) + ' лет';
    $('#cMonthsCap').textContent = months < 1 ? 'сбора при темпе RT-1' : months < 24 ? 'месяцев сбора при темпе RT-1' : 'сбора при темпе RT-1';
  }
  function bind(id, key, fmtv) { const inp = $(id); inp.addEventListener('input', () => { st[key] = +inp.value; syncRange(inp, fmtv(st[key])); out(); }); syncRange(inp, fmtv(st[key])); }
  function init() { bind('#cTasks', 'tasks', String); bind('#cPer', 'per', String); bind('#cRobots', 'robots', String); out(); }
  return { init, st, RATE };
})();

/* =====================================================================
   2. Лаборатория «Действие как токен»: корзины и мини-RT-1
   ===================================================================== */
const LabTokens = (() => {
  const E = L31, W = 440, NT = 30, SC = W / E.TW, ITERS = 1000, THR = 20;
  const COLORS = { 4: '--ink-3', 8: '--classic', 16: '--good', 32: '--e2e', 64: '--hybrid', 256: '--critical' }, TABLE_BG = '#edebe3'; // фон стола светлый в обеих темах
  const st = { bi: 1, small: false, n: 300, scene: 1, models: {}, order: [], last: null, busy: false, prog: null };
  const cache = { tests: {}, demos: {}, bm: {} };
  let ctl = null;
  const B = () => E.BINS[st.bi];
  const key = (b, n, small) => `${b}|${n}|${small ? 's' : 'n'}`;
  const tests = (small) => (cache.tests[small ? 's' : 'n'] = cache.tests[small ? 's' : 'n'] || E.tests(NT, { small }));
  const demos = (n, small) => { const k = n + (small ? 's' : 'n'); return (cache.demos[k] = cache.demos[k] || E.demos(n, { small })); };
  const bmOf = (sc) => { const k = (sc.small ? 's' : 'n') + sc.target.x.toFixed(2) + sc.target.y.toFixed(2); return (cache.bm[k] = cache.bm[k] || bitmap(sc.img, E.TW, E.TW)); };
  const curScene = () => tests(st.small)[st.scene - 1];
  const quant = () => E.quantEval(B(), tests(st.small));
  /** Модели, обученные для текущего размера предмета, в порядке обучения. */
  const shown = () => st.order.map((k) => st.models[k]).filter((m) => m && m.small === st.small);
  function state() {
    const q = quant(), sc = curScene(), cur = st.models[key(B(), st.n, st.small)];
    return { B: B(), small: st.small, n: st.n, scene: st.scene, quantHits: q.hits, quantOk: q.runs[st.scene - 1].ok, maxErr: q.maxErr, hitR: sc.target.R * 0.85,
      cur: cur ? sum(cur) : null, last: st.last ? sum(st.models[st.last]) : null, models: Object.fromEntries(Object.entries(st.models).map(([k, m]) => [k, sum(m)])) };
  }
  const sum = (m) => ({ B: m.B, n: m.n, small: m.small, hits: m.ev ? m.ev.hits : null, exact: m.ev ? m.ev.exact : null, meanErr: m.ev ? m.ev.meanErr : null, loss: m.loss, steps: m.steps, done: !!m.ev, quantHits: m.quantHits });
  function draw() {
    const { c, k } = HeroKit.fit($('#tCv'), W, W), P = pal(), sc = curScene(), b = B();
    drawBitmap(c, bmOf(sc), 0, 0, W, W);
    // карта внимания последней обученной модели (для этого размера предмета)
    const list = shown(), lastM = list.length ? list[list.length - 1] : null;
    if (lastM) {
      const p = E.rtPredict(lastM.model, sc), col = HeroKit.css(COLORS[lastM.B]), cs = W / E.GC; let mx = 1e-9; for (const v of p.att) mx = Math.max(mx, v);
      c.fillStyle = col;
      for (let i = 0; i < p.att.length; i++) { const a = p.att[i] / mx; if (a < 0.03) continue; c.globalAlpha = Math.min(1, a) * 0.5; c.fillRect((i % E.GC) * cs, Math.floor(i / E.GC) * cs, cs + 0.5, cs + 0.5); }
      c.globalAlpha = 1;
    }
    // сетка корзин
    c.strokeStyle = '#0b0b0b'; c.globalAlpha = b >= 64 ? 0.12 : 0.28; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < b; i++) { const v = i * W / b; c.moveTo(v, 0); c.lineTo(v, W); c.moveTo(0, v); c.lineTo(W, v); }
    c.stroke(); c.globalAlpha = 1;
    // цель и порог попадания
    const t = sc.target, hr = t.R * 0.85 * SC;
    c.setLineDash([5, 4]); c.strokeStyle = '#0b0b0b'; c.lineWidth = 1.8; c.beginPath(); c.arc(t.x * SC, t.y * SC, hr, 0, 7); c.stroke(); c.setLineDash([]);
    // центр корзины цели (квантование без обучения)
    const q = E.quantize(sc, b);
    c.fillStyle = q.ok ? P.good : P.bad; c.globalAlpha = 0.18; c.fillRect(q.bx * W / b, q.by * W / b, W / b, W / b); c.globalAlpha = 1;
    HeroKit.cross(c, q.x * SC, q.y * SC, 7, q.ok ? P.good : P.bad, 3);
    // предсказания обученных моделей
    list.forEach((m, i) => {
      const p = E.rtPredict(m.model, sc), col = HeroKit.css(COLORS[m.B]), r = 13 + i * 4;
      c.beginPath(); c.arc(p.x * SC, p.y * SC, r, 0, 7); c.lineWidth = 3; c.strokeStyle = col; c.stroke();
      HeroKit.label(c, k, String(m.B), p.x * SC + r + 2, p.y * SC - r, { px: 11, weight: 800, align: 'left', color: col, haloColor: TABLE_BG });
    });
    const narrow = k > 1.5;
    HeroKit.label(c, k, narrow ? `${b} корзин` : `${b} корзин на ось · клетка ${fmt(E.TW / b, b >= 64 ? 2 : b >= 16 ? 1 : 0)} px`, W / 2, 14, { px: 12, weight: 700, color: '#3d3c38', haloColor: TABLE_BG });
    out();
  }
  function out() {
    const s = state(), b = s.B, parts = [`Сетка: <b>${b}</b> корзин на ось, ширина ${fmt(E.TW / b, b >= 64 ? 2 : b >= 16 ? 1 : 0)} px. Центр корзины попадает в ${s.small ? 'мелкий' : 'обычный'} предмет в <b>${s.quantHits} из ${NT}</b> сцен. Сцена ${s.scene}: ${s.quantOk ? '✓' : '✗'}.`];
    const list = shown(); if (list.length) parts.push(list.map((m) => { const p = E.rtPredict(m.model, curScene()); return `Модель ${m.B} корзин: ${m.ev ? `<b>${m.ev.hits} из ${NT}</b>, точная корзина ${m.ev.exact}` : 'обучается…'}, сцена ${p.ok ? '✓' : '✗'}`; }).join(' · '));
    setOut($('#tOut'), parts.join(' '));
    $('#tCmd').innerHTML = `Команда: <b>«возьми ${colorWord(curScene().word)} кубик»</b>${s.small ? ' <span class="tag-note">целевой кубик мелкий</span>' : ''}`;
    $('#tTrain').disabled = st.busy;
  }
  function renderModels() {
    const box = $('#tModels'); box.innerHTML = '';
    for (const m of shown()) {
      const col = `var(${COLORS[m.B]})`, prog = m.steps / ITERS, card = h('div', { class: 'mdl', style: `--c:${col}` });
      card.append(h('div', { class: 'mdl-h' }, h('b', null, `${m.B} корзин · ${m.n} демонстраций`), h('i')));
      card.append(h('div', { class: 'bar' }, h('i', { style: `width:${(prog * 100).toFixed(0)}%` }), h('b', null, m.ev ? `${m.steps} шагов · потери ${fmt(m.loss, 2)}` : `шаг ${m.steps} из ${ITERS} · потери ${fmt(m.loss, 2)}`)));
      card.append(h('div', { class: 'bar' }, h('i', { style: `width:${m.ev ? m.ev.hits / NT * 100 : 0}%` }), h('b', null, m.ev ? `попаданий ${m.ev.hits} из ${NT}` : 'попаданий —')));
      card.append(h('div', { class: 'bar' }, h('i', { style: `width:${m.ev ? m.ev.exact / NT * 100 : 0}%` }), h('b', null, m.ev ? `точная корзина ${m.ev.exact} из ${NT}` : 'точная корзина —')));
      card.append(h('div', { class: 'mdl-note' }, m.ev ? `сетка без обучения даёт ${m.quantHits} из ${NT}; средняя ошибка ${fmt(m.ev.meanErr, 1)} px` : 'мини-RT-1 обучается на странице'));
      box.append(card);
    }
  }
  function render() { renderModels(); draw(); }
  /** Обучить мини-RT-1 для текущих корзин, числа демонстраций и размера предмета. */
  async function train() {
    if (st.busy) return state();
    st.busy = true; const b = B(), n = st.n, small = st.small, k2 = key(b, n, small), T = tests(small);
    const m = { B: b, n, small, model: E.rtInit({ B: b, seed: 5 }), loss: null, steps: 0, ev: null, quantHits: E.quantEval(b, T).hits };
    st.models[k2] = m; st.order = st.order.filter((x) => x !== k2).concat([k2]); st.last = k2; render(); if (ctl) ctl.update();
    let tick = 0;
    await runGen(E.rtTrain(m.model, demos(n, small), { iters: ITERS }), Math.max(1, Math.round(SPEED.k)), (ev) => { m.loss = ev.loss; m.steps = ev.steps; if (++tick % 2 === 0) render(); });
    m.ev = E.rtEval(m.model, T); st.busy = false; render(); if (ctl) ctl.update();
    return Object.assign(sum(m), { quantHits: m.quantHits });
  }
  function setBins(i) { st.bi = Math.max(0, Math.min(E.BINS.length - 1, i)); $('#tBins').value = st.bi; syncRange($('#tBins'), String(B())); render(); if (ctl) ctl.update(); }
  function setSize(v) { st.small = v === 'small'; segSet('#tSize', v); render(); if (ctl) ctl.update(); }
  function setDemos(n) { st.n = +n; segSet('#tDemos', n); out(); if (ctl) ctl.update(); }
  function setScene(k) { st.scene = Math.max(1, Math.min(NT, k)); $('#tScene').value = st.scene; syncRange($('#tScene'), String(st.scene)); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.models = {}; st.order = []; st.last = null; setSize('normal'); setDemos(300); setScene(1); setBins(1); },
    state, train, setBins, setSize, setDemos, setScene,
    /** Проверить квантование на 30 сценах (миссия без обучения). */
    async quant() { const q = quant(); for (let i = 1; i <= NT; i += 3) { setScene(i); await new Promise((r) => setTimeout(r, 60 / SPEED.k)); } setScene(1); return { B: B(), small: st.small, hits: q.hits, maxErr: q.maxErr, hitR: curScene().target.R * 0.85, width: E.TW / B() }; },
  };
  const missions = [
    { short: 'Сетка', title: 'Наложи сетку из 8 корзин', text: 'Пунктирное кольцо — зона попадания: захват берёт кубик, если опускается ближе 0,85 радиуса к его центру. Действие в RT-1 — номер корзины, а робот получает центр корзины. Оставь 8 корзин на ось и проверь, как часто центр корзины попадает в предмет на 30 сценах.',
      controls: ['bins'], onEnter: (X) => { X.setSize('normal'); X.setBins(1); X.setScene(1); },
      bet: { q: 'в скольких сценах из 30 центр корзины попадёт в кубик?', options: ['Почти во всех: 8 корзин на стол из четырёх предметов хватает', 'Примерно в каждой третьей', 'Ни в одной'], answer: (r) => (r.hits >= 27 ? 0 : r.hits > 0 ? 1 : 2) },
      action: { label: 'Проверить 30 сцен', run: (X) => X.quant() },
      criteria: [{ label: 'Корзин на ось — 8', test: (r) => r.B === 8 }, { label: 'Центр корзины попадает меньше чем в половине сцен', test: (r) => r.B === 8 && r.hits < 15 }],
      fail: (r) => (r.B !== 8 ? 'Поставь ползунок на 8 корзин.' : ''),
      explain: (r) => `Корзина шириной ${fmt(r.width, 0)} px: её центр может отстоять от точки захвата до ${fmt(r.maxErr, 1)} px, а попадание засчитывается ближе ${fmt(r.hitR, 1)} px. Попало ${r.hits} из 30, и обучение здесь ни при чём: это потолок самой сетки. Чем меньше корзин, тем грубее действие.` },
    { short: 'Мелкий', title: 'Подбери сетку под мелкий предмет', text: 'Теперь целевой кубик мелкий: радиус 3,4 px вместо 5,6. Двигай ползунок корзин, пока центр корзины не будет попадать во всех 30 сценах.',
      controls: ['bins'], onEnter: (X) => { X.setSize('small'); X.setBins(2); },
      criteria: [{ label: 'Предмет мелкий', test: (r, s) => s.small }, { label: 'Центр корзины попадает во всех 30 сценах', test: (r, s) => s.small && s.quantHits === 30 }],
      hint: 'Ширина корзины — 96 px, делённые на число корзин. Попадание — ближе 0,85 радиуса к центру: для мелкого кубика это 2,9 px.',
      explain: (r, ctx) => `Для обычного кубика хватало 16 корзин по 6 px, для мелкого нужны 32 по 3 px: самая дальняя точка корзины отстоит от центра на ${fmt(96 / 32 / Math.SQRT2, 1)} px. В RT-1 каждое измерение действия делят на 256 корзин по всему диапазону, и это разрешение задаёт, насколько точно робот может двигаться за один шаг.` },
    { short: '8 корзин', title: 'Обучи мини-RT-1 с 8 корзинами', text: 'Вернёмся к обычному кубику. Мини-RT-1 получает картинку стола и слово команды, и его две головы предсказывают номер корзины по x и по y. Обучи модель на 300 демонстрациях и проверь на 30 новых сценах.',
      controls: ['bins', 'scene'], onEnter: (X) => { X.setSize('normal'); X.setBins(1); X.setDemos(300); X.setScene(1); },
      bet: { q: 'что ограничит попадания модели с 8 корзинами?', options: ['Сетка: модель выучит корзины, но центр корзины далеко от кубика', 'Обучение: 300 демонстраций мало для сети', 'Ничего: попадёт почти во всех сценах'], answer: (r) => (r.hits >= 27 ? 2 : r.exact >= 12 ? 0 : 1) },
      action: { label: 'Обучить и проверить', run: (X) => X.train() },
      criteria: [{ label: 'Корзин 8, демонстраций 300, кубик обычный', test: (r) => r.B === 8 && r.n === 300 && !r.small }, { label: 'Точная корзина угадана не меньше чем в 12 сценах из 30', test: (r) => r.exact >= 12 }, { label: 'Попаданий не больше, чем даёт сетка без обучения', test: (r) => r.hits <= r.quantHits + 2 }],
      fail: (r) => (r.B !== 8 || r.n !== 300 || r.small ? 'Нужны 8 корзин, 300 демонстраций и обычный кубик.' : ''),
      explain: (r) => `Классов на ось всего 8, по ${Math.round(300 / 8)} демонстраций на каждый, и модель выучила их: точная корзина угадана в ${r.exact} сценах из 30. Но попаданий ${r.hits}, а сетка без обучения даёт ${r.quantHits}: что бы модель ни выучила, центр корзины шириной 12 px чаще всего лежит вне кубика. Заливка цвета модели на столе — её внимание: мягкий отбор токенов нашёл кубик нужного цвета.` },
    { short: '256 корзин', title: 'Те же 300 демонстраций, 256 корзин', text: 'В RT-1 256 корзин на измерение. Поставь 256 и обучи модель на тех же 300 демонстрациях, с тем же числом шагов.',
      controls: ['bins', 'scene'], onEnter: (X) => { X.setSize('normal'); X.setBins(5); X.setDemos(300); },
      bet: { q: 'что будет с попаданиями при 256 корзинах?', options: ['Станут почти стопроцентными: корзины по 0,4 px', 'Упадут: 256 классов на ось, а демонстраций всего 300', 'Останутся как при 8 корзинах'], answer: (r) => (r.hits >= 20 ? 0 : r.hits <= 12 ? 1 : 2) },
      action: { label: 'Обучить и проверить', run: (X) => X.train() },
      criteria: [{ label: 'Корзин 256, демонстраций 300', test: (r) => r.B === 256 && r.n === 300 }, { label: 'Попаданий меньше 15 из 30', test: (r) => r.hits < 15 }],
      fail: (r) => (r.B !== 256 || r.n !== 300 ? 'Нужны 256 корзин и 300 демонстраций.' : ''),
      explain: (r) => `Попаданий ${r.hits} из 30, точная корзина — ${r.exact}, средняя ошибка ${fmt(r.meanErr, 1)} px, хотя сетка без обучения попадала бы всегда. На 256 классов по каждой оси пришлось 300 примеров: большинство корзин модель видела один-два раза или не видела вовсе, и перекрёстная энтропия не знает, что корзина 140 рядом со 141-й. Классов стало больше, чем данных.` },
    { short: 'Подбери', title: 'Подбери число корзин, при котором и обучается, и попадает', text: `Между 8 и 256 корзинами есть середина. Найди число корзин, при котором модель на 300 демонстрациях попадает не меньше чем в ${THR} сценах из 30. Каждая обученная модель остаётся на сцене кольцом своего цвета и карточкой под сценой, и их можно сравнивать рядом.`,
      controls: ['bins', 'scene'], onEnter: (X) => { X.setSize('normal'); X.setDemos(300); X.setBins(3); },
      action: { label: 'Обучить и проверить', run: (X) => X.train() },
      criteria: [{ label: 'Демонстраций 300, кубик обычный', test: (r) => r.n === 300 && !r.small }, { label: `Попаданий не меньше ${THR} из 30 на новых сценах`, test: (r) => r.hits >= THR }],
      hint: 'Сетка попадает всегда уже при 16 корзинах, а классов при этом в 16 раз меньше, чем при 256.',
      explain: (r) => `${r.B} корзин: попаданий ${r.hits} из 30, точная корзина ${r.exact}. Корзина шириной ${fmt(96 / r.B, 1)} px уже лежит внутри кубика, а примеров на класс ещё хватает: промахи остались у границ корзин, где модель путает соседние классы. Три модели на одной сцене показывают компромисс: мало корзин — грубое действие, много — нехватка данных, середина — работает.` },
    { short: 'Данные', title: 'Дай 256 корзинам больше демонстраций', text: 'RT-1 обучался на 130 тысячах эпизодов, и 256 корзин ему хватило. Поставь 256 корзин и 1000 демонстраций: шагов обучения столько же, но примеры разнообразнее.',
      controls: ['bins', 'scene', 'demos'], onEnter: (X) => { X.setSize('normal'); X.setBins(5); X.setDemos(1000); },
      bet: { q: 'как изменятся попадания при 1000 демонстраций вместо 300?', options: ['Вырастут, но до середины 256 корзинам ещё далеко', 'Не изменятся: шагов обучения столько же', 'Станут почти стопроцентными'], answer: (r, ctx) => { const prev = ctx.results[3] ? ctx.results[3].hits : 5; return r.hits >= 27 ? 2 : r.hits > prev ? 0 : 1; } },
      action: { label: 'Обучить и проверить', run: (X) => X.train() },
      criteria: [{ label: 'Корзин 256, демонстраций 1000', test: (r) => r.B === 256 && r.n === 1000 }, { label: 'Попаданий больше, чем при 300 демонстрациях', test: (r, s, ctx) => r.B === 256 && r.hits > (ctx.results[3] ? ctx.results[3].hits : 5) }],
      fail: (r) => (r.B !== 256 || r.n !== 1000 ? 'Нужны 256 корзин и 1000 демонстраций.' : 'Попаданий не прибавилось: попробуй обучить ещё раз.'),
      explain: (r, ctx) => `С 1000 демонстраций попаданий ${r.hits} из 30 вместо ${ctx.results[3] ? ctx.results[3].hits : '—'}: больше корзин увидели хотя бы один пример. Мелкая дискретизация требует данных, и у RT-1 они были: 130 тысяч эпизодов. В статье ту же цену мелких корзин видно с другой стороны: авторегрессия по 11 токенам действия ничего не дала, а непрерывные действия без корзин уронили успех с 97% до 68%.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй число корзин, демонстраций и размер кубика, обучай модели и сравнивай их на одной сцене. Найди число демонстраций, при котором 64 корзины догоняют 32, и посмотри, где при этом ошибается каждая модель.', final: true, controls: ['bins', 'size', 'scene', 'demos', 'train'] },
  ];
  function init() {
    $('#tBins').addEventListener('input', (e) => { if (!st.busy) setBins(+e.target.value); else e.target.value = st.bi; });
    $('#tScene').addEventListener('input', (e) => setScene(+e.target.value));
    segBind('#tSize', (v) => { if (!st.busy) setSize(v); }); segBind('#tDemos', (v) => { if (!st.busy) setDemos(v); });
    $('#tTrain').addEventListener('click', () => { if (!st.busy) train(); });
    legend('#tLegend', [['зона попадания вокруг кубика из команды: захват должен опуститься внутри', 'var(--ink)', 'ringd'], ['центр корзины этого кубика попадает в кубик', 'var(--good)', 'cross'], ['центр корзины мимо кубика', 'var(--critical)', 'cross'], ['корзина, в которую попал центр кубика: зелёная или красная', 'var(--good)', 'cell'], ['сетка корзин', 'var(--ink-3)', 'grid'], ['внимание последней обученной модели: заливка её цвета, ярче — сильнее', 'var(--classic)', 'att'], ['куда целится обученная модель; число рядом — корзин на ось', 'var(--classic)', 'ring']]);
    const lgM = $('#tLegendM'); lgM.innerHTML = ''; lgM.append(h('span', { class: 'lg-h' }, 'Цвет модели — число корзин на ось:'));
    E.BINS.forEach((b) => lgM.append(h('span', null, h('i', { class: 'ring', style: `--c:var(${COLORS[b]})` }), String(b))));
    ctl = mountMissions('#tMis', missions, api, { controls: { bins: '#wrapTBins', size: '#wrapTSize', scene: '#wrapTScene', demos: '#wrapTDemos', train: '#tTrain' }, scene: '#tCv' });
    setBins(1); setScene(1); render(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, THR, ITERS };
})();

/* =====================================================================
   3. Интерактив «Разнообразие важнее объёма»: таблица 7 статьи и карточки
   ===================================================================== */
const LabAbl = (() => {
  /* таблица 7: доля задач, доля эпизодов → знакомые задачи, обобщение (всего), новые инструкции, лишние предметы, новые фоны */
  const ROWS = [
    { id: 'full', tasks: 100, data: 100, v: [97, 73, 76, 83, 59], ref: true, name: 'Все данные: 100% задач, 100% эпизодов', note: 'Полный набор: около 130 тысяч эпизодов и 744 инструкции.' },
    { id: 't75', tasks: 75, data: 97, v: [86, 54, 67, 42, 53], name: '75% задач, 97% эпизодов', note: 'Убраны задачи с наименьшим числом данных: эпизодов почти столько же, а разных задач на четверть меньше.' },
    { id: 'd51', tasks: 100, data: 51, v: [71, 50, 52, 39, 59], name: '100% задач, 51% эпизодов', note: 'Не больше 200 эпизодов на задачу: все задачи на месте, эпизодов вдвое меньше.' },
    { id: 'd37', tasks: 100, data: 37, v: [55, 46, 57, 35, 47], name: '100% задач, 37% эпизодов', note: 'Не больше 100 эпизодов на задачу.' },
    { id: 'd22', tasks: 100, data: 22, v: [59, 29, 14, 31, 41], name: '100% задач, 22% эпизодов', note: 'Не больше 50 эпизодов на задачу.' },
  ];
  const COLS = ['Знакомые задачи', 'Обобщение, всего', 'Новые инструкции', 'Лишние предметы', 'Новые фоны'];
  const st = { revealed: false, sel: 'full', sort: null, hover: null };
  let ctl = null, cards = null;
  const row = (id) => ROWS.find((r) => r.id === id);
  function state() { return { revealed: st.revealed, sel: st.sel, hover: st.hover, sort: st.sort, gen51: row('d51').v[1], gen75: row('t75').v[1] }; }
  function renderTable() {
    const tb = $('#ablBody'); tb.innerHTML = '';
    const full = row('full');
    for (const r of ROWS) {
      const tr = h('tr', { class: (r.ref ? 'ref ' : '') + (!st.revealed && !r.ref ? 'hidden-row ' : '') + (st.sel === r.id ? 'sel' : ''), 'data-id': r.id, tabindex: 0 });
      tr.append(h('td', null, r.name));
      r.v.forEach((v, i) => {
        const d = v - full.v[i], td = h('td', { class: 'num' + (r.ref ? '' : d < -2 ? ' drop' : d > 2 ? ' gain' : '') });
        td.append(h('i', { class: 'fill', style: `width:${Math.max(0, v - 6)}%; --c: var(${i === 0 ? '--classic' : '--e2e'})` }), h('span', { class: 'pct' }, `${v}%` + (r.ref ? '' : ` <small>(${d > 0 ? '+' : ''}${d})</small>`)));
        td.querySelector('.pct').innerHTML = `${v}%` + (r.ref ? '' : ` <small>(${d > 0 ? '+' : d === 0 ? '±' : ''}${d})</small>`);
        tr.append(td);
      });
      tr.addEventListener('click', () => select(r.id)); tr.addEventListener('mouseenter', () => { st.hover = r.id; detail(); }); tr.addEventListener('mouseleave', () => { st.hover = null; detail(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.id); } });
      tb.append(tr);
    }
    const foot = $('#ablFoot'); foot.innerHTML = '';
    if (!st.revealed) foot.append(h('tr', null, h('td', { class: 'abl-ph', colspan: String(COLS.length + 1) }, 'Четыре урезанных набора пока скрыты: сделай ставку в карточке миссии и нажми «Открыть строки таблицы».')));
    detail();
  }
  function detail() {
    const r = row(st.hover || st.sel), full = row('full'), box = $('#ablDetail');
    if (!r || r.ref) { setOut(box, `<b>${full.name}.</b> ${full.note} Обобщение, всего — среднее по новым инструкциям, лишним предметам и новым фонам. ${st.revealed ? 'Наведи на строку или нажми её.' : 'Строки с урезанными наборами откроются после ставки.'}`); return; }
    const d = r.v.map((v, i) => v - full.v[i]);
    setOut(box, `<b>${r.name}.</b> ${r.note} Знакомые задачи ${d[0]} п. п., обобщение ${d[1]} п. п.: новые инструкции ${d[2]}, лишние предметы ${d[3]}, новые фоны ${d[4] === 0 ? '±0' : d[4]}.`);
  }
  function select(id) { st.sel = id; renderTable(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.revealed = false; st.sel = 'full'; st.sort = null; renderTable(); if (cards) cards.reset(); },
    state, select,
    async reveal() { st.revealed = true; renderTable(); await new Promise((r) => setTimeout(r, 300 / SPEED.k)); select('t75'); return state(); },
    /** Для проверок: разложить карточки программно и проверить. */
    sortAll(map) { for (const [id, zone] of Object.entries(map)) cards.place(id, zone); cards.check(); return state(); },
  };
  const ITEMS = [
    { id: 'sim', label: 'Добавили 518 тыс. эпизодов из симуляции с предметами, которых робот не видел', target: 'up', why: 'На предметах, виденных только в симуляции, успех на настоящем роботе вырос с 23% до 87%, а на знакомых задачах почти не изменился: 92% → 90%.' },
    { id: 'kuka', label: 'Добавили 209 тыс. эпизодов захвата из корзины с робота Kuka', target: 'up', why: 'Захват из корзины на роботе Everyday Robots: 22% → 39%, знакомые задачи 92% → 90%. Одни данные Kuka без своих дают 0%.' },
    { id: 'auto', label: 'Выдавали 11 токенов действия по одному, с учётом предыдущих', target: 'none', why: 'Авторы: результат не улучшился, а инференс замедлился больше чем вдвое — 36 мс вместо 15. В итоговой модели все токены выдаются за один проход.' },
    { id: 'cont', label: 'Заменили корзины непрерывными действиями с нормальным распределением', target: 'down', why: 'Знакомые задачи 97% → 68%, лишние предметы 83% → 37%: одна мода вместо распределения по корзинам.' },
    { id: 'hist', label: 'Убрали историю: один кадр вместо шести', target: 'down', why: 'Сильнее всего пострадала устойчивость к лишним предметам: 83% → 50%. Знакомые задачи 97% → 82%.' },
    { id: 'pre', label: 'Убрали предобучение EfficientNet на ImageNet', target: 'down', why: 'Новые инструкции 76% → 43%, фоны 59% → 41%: сеть теряет знание о предметах, которое принесла с ImageNet.' },
    { id: 't75', label: 'Убрали 25% задач, оставив 97% эпизодов', target: 'down', why: 'Обобщение 73 → 54: столько же, сколько стоит потеря половины эпизодов.' },
  ];
  const missions = [
    { short: 'Ставка', title: 'Что сильнее ударит по обобщению', text: 'Данные RT-1 урезали двумя способами. Первый: оставить все 744 задачи, но не больше 200 эпизодов на задачу — остаётся 51% эпизодов. Второй: убрать задачи с наименьшим числом данных — остаётся 75% задач и 97% эпизодов. Сделай ставку и открой строки таблицы.',
      bet: { q: 'какой набор обобщает хуже?', options: ['Половина эпизодов: данных вдвое меньше', 'Три четверти задач: эпизодов почти столько же, но задач меньше', 'Примерно одинаково'], answer: (r) => (Math.abs(r.gen51 - r.gen75) <= 5 ? 2 : r.gen51 < r.gen75 ? 0 : 1) },
      action: { label: 'Открыть строки таблицы', run: (X) => X.reveal() },
      criteria: [{ label: 'Строки с урезанными наборами открыты', test: (r) => r.revealed }],
      explain: (r) => `Обобщение: ${r.gen75}% без четверти задач против ${r.gen51}% без половины эпизодов. Четверть задач стоила столько же, сколько половина всех данных, хотя эпизодов в первом наборе почти вдвое больше. Авторы формулируют: разнообразие данных важнее их количества. Наведи на строки: по столбцам видно, что потеря задач больнее всего ударила по лишним предметам, а новые фоны потерю половины эпизодов не заметили.` },
    { short: 'Карточки', title: 'Что помогло RT-1, а что нет', text: 'Разложи изменения из статьи по трём группам: помогло обобщению, ухудшило результаты или не помогло, но замедлило. Перетащи карточку или нажми её, потом группу, затем «Проверить».',
      criteria: [{ label: 'Карточки проверены', test: (r, s) => !!s.sort }, { label: 'Все 7 разложены верно', test: (r, s) => !!s.sort && s.sort.score === s.sort.total }],
      hint: 'Данные с другого робота и из симуляции — это тоже разнообразие. Авторегрессию авторы убрали из итоговой модели не за точность, а за скорость.',
      explain: () => 'Два пополнения данных помогли: симуляция дала предметы, которых робот не видел, Kuka — опыт другого робота, и знакомые задачи почти не пострадали. Четыре изменения ухудшили результаты, причём сильнее всего — непрерывные действия и потеря предобучения. Авторегрессия ничего не дала и замедлила инференс вдвое, поэтому RT-1 выдаёт все 11 токенов за один проход.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Наводи на строки таблицы и сравнивай столбцы. Найди столбец, в котором половина эпизодов не стоила ничего, и столбец, где 22% эпизодов обрушили результат сильнее всего.', final: true },
  ];
  function init() {
    const head = $('#ablHead'); head.innerHTML = ''; head.append(h('th', null, 'Набор данных')); COLS.forEach((cName) => head.append(h('th', null, cName)));
    renderTable();
    cards = Cards.sort('#ablSort', {
      targets: [{ id: 'up', label: 'Помогло обобщению' }, { id: 'down', label: 'Ухудшило результаты' }, { id: 'none', label: 'Не помогло, но замедлило' }],
      items: ITEMS,
      after: 'Числа — из таблиц 4, 5, 7 и 13 статьи. Обобщение росло от разнообразия данных, даже чужих, а падало от упрощений модели и сужения набора задач.',
      onCheck: (score, total) => { st.sort = { score, total }; if (ctl) ctl.update(); },
    });
    ctl = mountMissions('#aMis', missions, api, { scene: '#ablTable' });
    return ctl;
  }
  return { init, api, st, ROWS, ITEMS };
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
    { q: 'RT-1 — это большая языковая модель, дообученная управлять роботом?', o: ['Да: PaLM с головой для действий', 'Нет: это сеть на 35 млн параметров из EfficientNet и трансформера, а текст команды входит в неё одним вектором через FiLM', 'Да, но языковая модель небольшая'], a: 1, e: 'Команду кодирует Universal Sentence Encoder в вектор, и этот вектор задаёт масштаб и сдвиг признаков картинки внутри EfficientNet. Модели зрения и языка как основа политики появятся в уроках 3.2 и 3.3.' },
    { q: 'Как RT-1 выдаёт действие?', o: ['Регрессией 11 чисел', 'Классификацией: для каждого из 11 измерений — одна из 256 корзин', 'Текстом на естественном языке'], a: 1, e: 'Каждое измерение делят на 256 равных корзин, модель предсказывает номер корзины, а робот получает её центр. Та же модель с непрерывными действиями выполнила 68% знакомых задач вместо 97%.' },
    { q: 'Чем больше корзин на измерение, тем лучше при любых данных?', o: ['Да: мельче корзина — точнее действие', 'Нет: классов становится больше, а примеров на класс меньше, и при малых данных модель обучается хуже', 'Число корзин ни на что не влияет'], a: 1, e: 'В лаборатории 256 корзин на 300 демонстрациях почти не обучились, а 8 корзин обучились, но промахивались из-за грубой сетки. RT-1 позволил себе 256 корзин на 130 тысячах эпизодов.' },
    { q: 'Трансформер RT-1 читает все токены шести кадров: 6 × 81?', o: ['Да, 486 токенов', 'Нет: TokenLearner оставляет 8 токенов на кадр, трансформер читает 48', 'Нет: он читает только последний кадр'], a: 1, e: 'Мягкий отбор токенов оставляет из 81 только 8 на кадр и ускоряет сеть в 2,4 раза; вместе с повторным использованием токенов прошлых кадров это даёт 15 мс на действие и частоту 3 Гц.' },
    { q: 'Где команда встречается с картинкой в RT-1?', o: ['В конце: токены текста добавляют к токенам картинки перед трансформером', 'Внутри свёрточной сети: вектор команды через FiLM задаёт масштаб и сдвиг признаков', 'Команда не нужна: модель узнаёт задачу по сцене'], a: 1, e: 'Это ранняя подача языка: признаки картинки извлекаются с учётом команды. У Gato язык добавляется поздно, и авторы связывают с этим его слабость к лишним предметам: 43% против 83% у RT-1.' },
    { q: 'Чтобы RT-1 лучше обобщал, выгоднее собрать больше эпизодов тех же задач?', o: ['Да: главное — объём', 'Нет: убрать 25% задач при 97% эпизодов стоило столько же обобщения, сколько убрать 49% эпизодов', 'Объём и разнообразие не влияют на обобщение'], a: 1, e: 'Таблица 7 статьи: 54% обобщения без четверти задач против 50% без половины эпизодов при всех задачах. Разнообразие данных важнее их количества.' },
    { q: 'Данные с другого робота, Kuka, для RT-1 бесполезны: другая рука и другое пространство действий?', o: ['Да, их пришлось выбросить', 'Нет: с данными Kuka захват из корзины на Everyday Robots вырос с 22% до 39%, знакомые задачи почти не пострадали', 'Нет: RT-1 на одних данных Kuka управлял Everyday Robots'], a: 1, e: 'Данные Kuka перевели в пространство действий RT-1 и подписали «pick anything». Модель только на данных Kuka даёт 0% на другом роботе, а смесь переносит опыт между роботами.' },
    { q: 'RT-1 обобщает на движения, которых не было в демонстрациях?', o: ['Да: трансформер придумывает новые движения', 'Нет: только на новые сочетания виденных навыков и предметов, и не лучше оператора', 'Да, если дать больше корзин'], a: 1, e: 'Авторы называют это ограничением: обобщение ограничено сочетаниями виденных понятий, а имитация не превосходит оператора. Новая инструкция «подвинь яблоко к губке» работает, потому что яблоко и «подвинуть» встречались по отдельности.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('calc', () => Calc.init());
    safe('tokens', () => { mis.tokens = LabTokens.init(); }); safe('abl', () => { mis.abl = LabAbl.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'aMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l31 = { mis, SPEED, Calc, LabTokens, LabAbl, L31 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
