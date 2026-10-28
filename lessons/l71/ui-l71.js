/* =====================================================================
   ui-l71.js — урок 7.1 «World Models и Dreamer».
   0) анимированные схемы: `vmc` — агент World Models (V, M, C) на настоящей
      трассе и в воображении модели; `rssm` — шаг RSSM «предсказание без кадра,
      поправка по кадру», воображение одними предсказаниями и три процесса Dreamer;
   1) Ада на зарядке ночью (shared/ada-legs.js, AdaBody.charging);
   2) лаборатория 1 «Воображение рядом с настоящим столом»: читатель рисует путь кисти,
      толчок исполняется на настоящем столе и в воображении ансамбля из пяти
      сетей, график расхождения и разброса по шагам, карта покрытия записей;
   3) лаборатория 2 «Политика из воображения на настоящем столе»: ARS в
      воображении модели, 50 попыток рядом в двух мирах, ночи сбора опыта
      «туда, куда ходит политика» или «туда, где записей больше всего»,
      температура модели и штраф за разброс ансамбля;
   4) диаграммы чисел из статей (shared/stats-chart.js) и квиз.
   Мир, физика, сети и обучение — l71/engine.js (L71), рисунок стола — l71/table-draw.js.
   ===================================================================== */
'use strict';

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
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const sleep0 = () => new Promise((r) => setTimeout(r, 0));
/** Склонение по числу. */
const pl = (n, a, b, c) => plural(Math.round(Math.abs(n)), a, b, c);

/* ---------- общие настройки лабораторий ---------- */
const SEED = 2;                 // зерно записей дня, ансамбля и поиска
const NREC = 60;                // записей дня
const CUP0 = [0.30, 0.34];      // где стоит чашка в лаборатории 1
const START_THETA = [0.2, 0, 0.02];   // с чего начинается поиск: толчок 0,2 м/с, как днём

/** Модели мира по числу записей: учатся один раз, дальше берутся из памяти. */
const Models = (() => {
  const E = L71, cache = {}, recs = {};
  function records(n) { if (!recs[n]) recs[n] = E.records({ n, seed: SEED }); return recs[n]; }
  /** Ансамбль на n записях дня (генератор в кусках между кадрами; onProg(доля 0…1)). */
  async function get(n, onProg) {
    if (cache[n]) return cache[n];
    const rec = records(n), ens = E.ensemble({ k: 5, seed: SEED });
    const total = 5; let done = 0;
    await runChunked(E.trainEnsemble(ens, rec.trans, {}), (ev) => { if (ev.epoch === ev.epochs - 1) { done++; if (onProg) onProg(done / total); } }, 12);
    ens.oneStep = oneStepError(ens); ens.held = heldOut(ens);
    cache[n] = ens; return ens;
  }
  /** Медиана расхождения воображения с настоящими записями через 20 шагов (см) на отрезках 10 новых записей: 9 отрезков на запись. */
  function heldOut(ens) {
    const test = E.records({ n: 10, seed: SEED, from: 5000 }), acc = [];
    for (let e = 0; e < 10; e++) for (let t0 = 0; t0 + 20 <= 60; t0 += 5) {
      const xs = test.trans.slice(e * 60 + t0, e * 60 + t0 + 20), im = E.imagineOpen(ens, xs[0].s, xs.map((x) => x.a), 'base'), real = xs[19].s1;
      acc.push(Math.hypot(im.mean[40] - real[0], im.mean[41] - real[1]) * 100);
    }
    acc.sort((a, b) => a - b); return acc[acc.length >> 1];
  }
  /** Средняя ошибка модели на одном шаге (мм) на 10 новых записях, которых не было в обучении. */
  function oneStepError(ens) {
    const test = E.records({ n: 10, seed: SEED, from: 5000 }), buf = []; let s = 0;
    for (const x of test.trans) { E.predictAll(ens, x.s, x.a, buf); let mx = 0, my = 0; for (const q of buf) { mx += q[0] / ens.k; my += q[1] / ens.k; } s += Math.hypot(mx - x.s1[0], my - x.s1[1]); }
    return s / test.trans.length * 1000;
  }
  return { get, records, has: (n) => !!cache[n], cache };
})();

/* =====================================================================
   0а. Схема `vmc`: агент World Models на настоящей трассе и в воображении модели.
   Две дорожки: на настоящей трассе кадр → V → z → M (память h) → C → действие → игра;
   в воображении M сама предсказывает следующий z по z и действию, V не нужна, декодер рисует
   воображаемый кадр только для показа. Цикл 8 с: 4 с подсвечена дорожка настоящей игры, 4 с — воображения.
   Синий сплошной — настоящее, оранжевый пунктир — то, что воображает модель (метка части 7).
   ===================================================================== */
(() => {
  const T = 8;
  /** Блок схемы: скруглённый прямоугольник, заголовок и подпись. kind: 'real' | 'imag' | 'net' | 'off'. */
  function block(c, k, A, P, x, y, w, h, t1, t2, kind, on, n) {
    const col = kind === 'real' ? P.out : kind === 'imag' ? P.mot : P.ink2;
    const a = on ? 1 : 0.38;
    c.save(); c.globalAlpha = a;
    if (kind === 'imag') c.setLineDash([5, 4]);
    A.rect(c, x, y, w, h, 8, A.alpha(kind === 'net' ? P.ink3 : col, kind === 'off' ? 0.04 : 0.1), kind === 'off' ? A.alpha(P.ink3, 0.5) : A.alpha(col, 0.85), on ? 1.8 : 1.3);
    c.setLineDash([]);
    A.lab(c, k, t1, x + w / 2, y + (t2 ? h / 2 - 7 : h / 2), { px: n ? 11 : 11.5, weight: 700, color: kind === 'net' || kind === 'off' ? P.ink : col, halo: false });
    if (t2) A.lab(c, k, t2, x + w / 2, y + h / 2 + 8, { px: 10, weight: 600, color: P.ink2, halo: false });
    c.restore();
  }
  /** Стрелка с бегущей точкой; dashed — воображение. */
  function flow(c, A, P, pts, col, on, u, dashed) {
    c.save(); c.globalAlpha = on ? 1 : 0.3;
    A.line(c, pts, A.alpha(col, 0.8), 1.6, dashed ? [5, 4] : null);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    A.arrow(c, a[0] + (b[0] - a[0]) * 0.6, a[1] + (b[1] - a[1]) * 0.6, b[0], b[1], A.alpha(col, 0.9), 1.6, 6);
    if (on) { // бегущая точка по ломаной
      let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
      let s = (((u % 1) + 1) % 1) * L, i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const f = seg[i] ? s / seg[i] : 0, px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
      A.circle(c, px, py, 3.4, col, null);
    }
    c.restore();
  }
  function legend(c, k, A, P, x, y, n) {
    const items = [[P.out, false, n ? 'настоящая игра' : 'настоящая игра: кадры и действия'], [P.mot, true, 'воображение модели M']];
    let lx = x;
    for (const [col, dash, txt] of items) {
      A.line(c, [[lx, y], [lx + 18, y]], col, 2.2, dash ? [5, 3] : null);
      A.lab(c, k, txt, lx + 24, y, { px: 10, weight: 600, color: P.ink2, halo: false, align: 'left' });
      HeroKit.font(c, k, 10, 600); lx += 24 + c.measureText(txt).width + 22;
    }
  }
  function drawWide(c, k, t, P, A) {
    const u = ((t % T) + T) % T, real = u < T / 2, ph = (u % (T / 2)) / (T / 2);
    const bw = 120, bh = 46, xs = [8, 154, 300, 446, 592];
    // дорожка настоящей игры: игра → V → (z) → M → C → действие → игра
    A.lab(c, k, 'на настоящей трассе', 8, 14, { px: 11.5, weight: 750, color: real ? P.ink : P.ink3, halo: false, align: 'left' });
    const y1 = 30, my = y1 + bh / 2;
    block(c, k, A, P, xs[0], y1, bw, bh, 'игра', 'кадр 64 × 64', 'real', real);
    block(c, k, A, P, xs[1], y1, bw, bh, 'V: энкодер', 'сжимает кадр', 'net', real);
    block(c, k, A, P, xs[2], y1, bw, bh, 'M: LSTM', 'память h', 'net', real);
    block(c, k, A, P, xs[3], y1, bw, bh, 'C', '867 параметров', 'net', real);
    block(c, k, A, P, xs[4], y1, bw, bh, 'действие', 'руль и газ', 'real', real);
    for (let i = 0; i < 4; i++) flow(c, A, P, [[xs[i] + bw + 2, my], [xs[i + 1] - 2, my]], P.out, real, ph * 4 - i, false);
    A.lab(c, k, 'z', (xs[1] + bw + xs[2]) / 2, my - 12, { px: 11, weight: 700, color: P.out });
    A.lab(c, k, 'z, h', (xs[2] + bw + xs[3]) / 2, my - 12, { px: 11, weight: 700, color: P.out });
    flow(c, A, P, [[xs[4] + bw / 2, y1 + bh + 2], [xs[4] + bw / 2, y1 + bh + 28], [xs[0] + bw / 2, y1 + bh + 28], [xs[0] + bw / 2, y1 + bh + 2]], P.out, real, ph, false);
    A.lab(c, k, 'игра отвечает новым кадром', (xs[0] + xs[4] + bw) / 2, y1 + bh + 28, { px: 10, weight: 600, color: P.ink2 });
    // дорожка воображения: M предсказывает z′ → C → действие → M
    const y2 = 186, my2 = y2 + bh / 2;
    A.lab(c, k, 'в воображении модели', 8, y2 - 16, { px: 11.5, weight: 750, color: !real ? P.ink : P.ink3, halo: false, align: 'left' });
    block(c, k, A, P, xs[0], y2, bw, bh, 'игры нет', 'кадров нет', 'off', !real);
    block(c, k, A, P, xs[1], y2, bw, bh, 'V не нужна', 'кадр не сжимаем', 'off', !real);
    block(c, k, A, P, xs[2], y2, bw, bh, 'M: LSTM', 'z и действие → z′', 'net', !real);
    block(c, k, A, P, xs[3], y2, bw, bh, 'C', 'тот же контроллер', 'net', !real);
    block(c, k, A, P, xs[4], y2, bw, bh, 'действие', 'уходит в M', 'imag', !real);
    flow(c, A, P, [[xs[2] + bw + 2, my2], [xs[3] - 2, my2]], P.mot, !real, ph * 3, true);
    A.lab(c, k, 'z′, h', (xs[2] + bw + xs[3]) / 2, my2 - 12, { px: 11, weight: 700, color: P.mot });
    flow(c, A, P, [[xs[3] + bw + 2, my2], [xs[4] - 2, my2]], P.mot, !real, ph * 3 - 1, true);
    flow(c, A, P, [[xs[4] + bw / 2, y2 + bh + 2], [xs[4] + bw / 2, y2 + bh + 26], [xs[2] + bw / 2, y2 + bh + 26], [xs[2] + bw / 2, y2 + bh + 2]], P.mot, !real, ph * 3 - 2, true);
    A.lab(c, k, 'действие возвращается в M', (xs[2] + xs[4] + bw) / 2, y2 + bh + 26, { px: 10, weight: 600, color: P.ink2 });
    // декодер — только для показа
    const yd = y2 + bh + 52;
    block(c, k, A, P, xs[1], yd, bw * 2 + 26, 34, 'декодер V рисует кадр для показа', null, 'imag', !real, false);
    flow(c, A, P, [[xs[2] + 22, y2 + bh + 2], [xs[2] + 22, yd - 2]], P.mot, !real, ph * 2, true);
    legend(c, k, A, P, 8, 362, false);
  }
  function drawNarrow(c, k, t, P, A) {
    const u = ((t % T) + T) % T, real = u < T / 2, ph = (u % (T / 2)) / (T / 2);
    const x = 30, w = 300, bh = 36, g = 14;
    A.lab(c, k, 'на настоящей трассе', 14, 14, { px: 11.5, weight: 750, color: real ? P.ink : P.ink3, halo: false, align: 'left' });
    const rows = [['игра', 'кадр 64 × 64', 'real'], ['V: энкодер', 'сжимает кадр', 'net'], ['z', '32 числа', 'real'], ['M: LSTM', 'память h', 'net'], ['C', '867 параметров', 'net'], ['действие', 'руль и газ', 'real']];
    let y = 28;
    rows.forEach((r, i) => {
      block(c, k, A, P, x, y, w, bh, r[0], r[1], r[2], real, true);
      if (i < rows.length - 1) flow(c, A, P, [[x + w / 2, y + bh + 1], [x + w / 2, y + bh + g - 1]], P.out, real, ph * 6 - i, false);
      y += bh + g;
    });
    const yTop = 28 + bh / 2, yBot = y - g - bh / 2;
    flow(c, A, P, [[x, yBot], [x - 16, yBot], [x - 16, yTop], [x, yTop]], P.out, real, ph, false);
    y += 18;
    A.lab(c, k, 'в воображении модели', 14, y, { px: 11.5, weight: 750, color: !real ? P.ink : P.ink3, halo: false, align: 'left' });
    y += 14;
    block(c, k, A, P, x, y, w, bh, 'V не нужна', 'кадров нет', 'off', !real, true); y += bh + g;
    const rows2 = [['M: LSTM', 'по z и действию предсказывает z′', 'net'], ['z′', 'предсказал M', 'imag'], ['C', 'тот же контроллер', 'net'], ['действие', 'уходит обратно в M', 'imag']];
    const y0 = y;
    rows2.forEach((r, i) => {
      block(c, k, A, P, x, y, w, bh, r[0], r[1], r[2], !real, true);
      if (i < rows2.length - 1) flow(c, A, P, [[x + w / 2, y + bh + 1], [x + w / 2, y + bh + g - 1]], P.mot, !real, ph * 4 - i, true);
      y += bh + g;
    });
    flow(c, A, P, [[x + w, y - g - bh / 2], [x + w + 16, y - g - bh / 2], [x + w + 16, y0 + bh / 2], [x + w, y0 + bh / 2]], P.mot, !real, ph, true);
    block(c, k, A, P, x, y, w, 34, 'декодер V: кадр только для показа', null, 'imag', !real, true); y += 34 + 20;
    legend(c, k, A, P, 14, y, true);
  }
  Anim.add('vmc', { W: 720, H: 380, start: 1.3, narrowAt: 680, draw: drawWide, narrow: { W: 360, H: 690, draw: drawNarrow } });
})();

/* =====================================================================
   0б. Схема `rssm`: шаг RSSM и три процесса Dreamer.
   Ряд шагов: на настоящих шагах модель сначала предсказывает состояние ŝ без кадра (оранжевый пунктир),
   потом поправляет его по кадру o (синяя стрелка) и получает s; после «сейчас» начинается воображение —
   кадров нет, состояние строится одними предсказаниями. Ряд процессов: сбор опыта актором в среде,
   обучение модели мира на буфере, обучение актора и критика на прогонах в воображении — подсвечен
   тот, что идёт сейчас. Цикл 8 с, ритм условный.
   ===================================================================== */
(() => {
  const T = 8, STEP = 1.35;
  function box(c, k, A, P, x, y, w, h, t1, t2, kind, on, px) {
    const col = kind === 'real' ? P.out : kind === 'imag' ? P.mot : kind === 'off' ? P.ink3 : P.ink2;
    c.save(); c.globalAlpha = on ? 1 : 0.35;
    if (kind === 'imag' || kind === 'off') c.setLineDash([5, 4]);
    A.rect(c, x, y, w, h, 8, A.alpha(kind === 'net' ? P.ink3 : col, kind === 'off' ? 0.03 : 0.1), A.alpha(col, kind === 'off' ? 0.5 : 0.85), 1.5);
    c.setLineDash([]);
    A.lab(c, k, t1, x + w / 2, y + (t2 ? h / 2 - 7 : h / 2), { px: px || 11, weight: 700, color: kind === 'net' || kind === 'off' ? P.ink : col, halo: false });
    if (t2) A.lab(c, k, t2, x + w / 2, y + h / 2 + 8, { px: 10, weight: 600, color: P.ink2, halo: false });
    c.restore();
  }
  /** Ряд шагов RSSM: cols — центры столбцов, nReal — сколько из них настоящих. */
  function steps(c, k, A, P, cols, cw, nReal, names, u, y0) {
    const cur = Math.min(cols.length - 1, Math.floor(u / STEP)), p = (u - cur * STEP) / STEP, done = u >= cols.length * STEP;
    const yh = y0 + 20, ys = y0 + 78, yo = y0 + 148, hh = 32, hs = 38, ho = 32;
    // граница настоящих шагов и воображения
    const xb = (cols[nReal - 1] + cols[nReal]) / 2;
    A.line(c, [[xb, y0 + 2], [xb, yo + ho + 4]], A.alpha(P.ink3, 0.6), 1.2, [3, 4]);
    cols.forEach((cx, j) => {
      const real = j < nReal, state = done || j < cur ? 2 : j === cur ? (real && p > 0.45 ? 2 : 1) : 0;   // 0 — ещё нет, 1 — предсказание, 2 — готово
      const on = state > 0, x = cx - cw / 2;
      A.lab(c, k, names[j], cx, y0 + 6, { px: 10.5, weight: 700, color: real ? P.ink2 : P.mot, halo: false });
      box(c, k, A, P, x, yh, cw, hh, 'h: память', null, 'net', on, 10.5);
      if (real && state === 2) box(c, k, A, P, x, ys, cw, hs, 's: по кадру', 'поправка', 'real', true, 10.5);
      else box(c, k, A, P, x, ys, cw, hs, 'ŝ: без кадра', 'предсказание', 'imag', on, 10.5);
      box(c, k, A, P, x, yo, cw, ho, real ? 'кадр o' : 'кадра нет', null, real ? 'real' : 'off', on && (real ? state === 2 || j < cur || done : true), 10.5);
      // h → ŝ/s, кадр → s
      A.line(c, [[cx, yh + hh + 1], [cx, ys - 1]], A.alpha(P.ink3, on ? 0.7 : 0.25), 1.3);
      if (real && on) { const act = j === cur && !done && p > 0.45; c.save(); c.globalAlpha = act ? 1 : 0.5; A.arrow(c, cx, yo - 2, cx, ys + hs + 3, P.out, act ? 2.4 : 1.6, 6); c.restore(); }
      // переход к следующему шагу: h и s → новый h
      if (j < cols.length - 1) {
        const nx = cols[j + 1] - cw / 2, nOn = done || j + 1 <= cur;
        c.save(); c.globalAlpha = nOn ? 1 : 0.3;
        const col = j + 1 < nReal ? P.ink3 : P.mot, dash = j + 1 >= nReal ? [4, 3] : null;
        A.line(c, [[x + cw + 1, yh + hh / 2], [nx - 1, yh + hh / 2]], A.alpha(col, 0.8), 1.4, dash);
        A.arrow(c, nx - 10, yh + hh / 2, nx - 1, yh + hh / 2, A.alpha(col, 0.9), 1.4, 5);
        A.line(c, [[x + cw + 1, ys + hs / 2], [nx - 6, yh + hh - 2]], A.alpha(col, 0.6), 1.2, [3, 3]);
        c.restore();
      }
    });
    return yo + ho;
  }
  function procs(c, k, A, P, xs, ys, w, h, u, vertical) {
    const which = Math.floor((((u % T) + T) % T) / (T / 3));
    const items = [['1 · сбор опыта', 'актор действует, кадры в буфер', 'real'], ['2 · обучение модели мира', 'по отрезкам из буфера', 'net'], ['3 · актор и критик', 'учатся в воображении, 15 шагов', 'imag']];
    items.forEach((it, i) => box(c, k, A, P, xs[i], ys[i], w, h, it[0], it[1], it[2], which === i, 11));
    c.save(); c.globalAlpha = 0.8;
    if (!vertical) {
      for (let i = 0; i < 2; i++) A.arrow(c, xs[i] + w + 3, ys[i] + h / 2, xs[i + 1] - 3, ys[i + 1] + h / 2, P.ink3, 1.6, 6);
      const yb = ys[0] + h + 14;
      A.line(c, [[xs[2] + w / 2, ys[2] + h + 2], [xs[2] + w / 2, yb], [xs[0] + w / 2, yb]], A.alpha(P.ink3, 0.8), 1.4);
      A.arrow(c, xs[0] + w / 2, yb, xs[0] + w / 2, ys[0] + h + 3, P.ink3, 1.4, 6);
      A.lab(c, k, 'новый опыт — новой политикой', (xs[0] + xs[2] + w) / 2, yb, { px: 10, weight: 600, color: P.ink2 });
    } else {
      for (let i = 0; i < 2; i++) A.arrow(c, xs[i] + w / 2, ys[i] + h + 2, xs[i + 1] + w / 2, ys[i + 1] - 2, P.ink3, 1.6, 6);
      const xr = xs[0] + w + 14;
      A.line(c, [[xs[2] + w + 2, ys[2] + h / 2], [xr, ys[2] + h / 2], [xr, ys[0] + h / 2]], A.alpha(P.ink3, 0.8), 1.4);
      A.arrow(c, xr, ys[0] + h / 2, xs[0] + w + 3, ys[0] + h / 2, P.ink3, 1.4, 6);
    }
    c.restore();
  }
  function legend(c, k, A, P, x, y, n) {
    const items = [[P.out, false, n ? 'настоящие кадры' : 'настоящие кадры и поправка по ним'], [P.mot, true, n ? 'воображение модели' : 'предсказание модели и воображение']];
    let lx = x;
    for (const [col, dash, txt] of items) {
      A.line(c, [[lx, y], [lx + 18, y]], col, 2.2, dash ? [5, 3] : null);
      A.lab(c, k, txt, lx + 24, y, { px: 10, weight: 600, color: P.ink2, halo: false, align: 'left' });
      HeroKit.font(c, k, 10, 600); lx += 24 + c.measureText(txt).width + 22;
    }
  }
  function drawWide(c, k, t, P, A) {
    const u = ((t % T) + T) % T;
    A.lab(c, k, 'шаг RSSM', 8, 12, { px: 11.5, weight: 750, color: P.ink, halo: false, align: 'left' });
    steps(c, k, A, P, [84, 226, 368, 510, 652], 118, 3, ['t − 2', 't − 1', 't, сейчас', 't + 1, воображение', 't + 2, воображение'], u, 22);
    A.lab(c, k, 'три процесса Dreamer', 8, 246, { px: 11.5, weight: 750, color: P.ink, halo: false, align: 'left' });
    procs(c, k, A, P, [8, 252, 496], [262, 262, 262], 216, 50, u, false);
    legend(c, k, A, P, 8, 392, false);
  }
  function drawNarrow(c, k, t, P, A) {
    const u = ((t % T) + T) % T;
    A.lab(c, k, 'шаг RSSM', 10, 12, { px: 11.5, weight: 750, color: P.ink, halo: false, align: 'left' });
    steps(c, k, A, P, [62, 180, 298], 104, 2, ['t − 1', 't, сейчас', 't + 1, воображение'], u, 22);
    A.lab(c, k, 'три процесса Dreamer', 10, 236, { px: 11.5, weight: 750, color: P.ink, halo: false, align: 'left' });
    procs(c, k, A, P, [12, 12, 12], [252, 322, 392], 300, 50, u, true);
    legend(c, k, A, P, 10, 470, true);
  }
  Anim.add('rssm', { W: 720, H: 404, start: 2.0, narrowAt: 680, draw: drawWide, narrow: { W: 360, H: 488, draw: drawNarrow } });
})();

/* =====================================================================
   1. Ада на зарядке ночью: AdaBody.charging из shared/ada-legs.js.
   ===================================================================== */
function initNight() {
  const cv = $('#nightCv'); if (!cv) return;
  const draw = () => {
    const { c, k } = HeroKit.fit(cv, 240, 250), dark = HeroKit.dark();
    const g = c.createLinearGradient(0, 0, 0, 250); g.addColorStop(0, dark ? '#10131f' : '#1d2440'); g.addColorStop(1, dark ? '#1b1d27' : '#2d3350');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, 240, 250, 12); c.fill();
    // окно с луной и пол
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.beginPath(); c.roundRect(18, 22, 66, 82, 6); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(51, 22); c.lineTo(51, 104); c.moveTo(18, 63); c.lineTo(84, 63); c.stroke();
    c.fillStyle = '#f3e7c2'; c.beginPath(); c.arc(68, 40, 8, 0, 7); c.fill(); c.fillStyle = dark ? '#10131f' : '#1d2440'; c.beginPath(); c.arc(72, 37, 7, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 214, 240, 36);
    AdaBody.charging(c, 132, 220, 1.55, null, dark, { charge: 0.6 });
    HeroKit.label(c, k, 'ночь · Ада на зарядке', 120, 236, { px: 11, weight: 650, color: '#e9e6dc', halo: false });
  };
  draw(); App.on('theme', draw); App.on('resize', draw);
}

/* =====================================================================
   2. Лаборатория 1 «Воображение рядом с настоящим столом».
   Читатель рисует путь кисти; путь переводится в сдвиги кисти по 0,05 с при выбранной скорости.
   Толчок исполняется на настоящем столе (L71.realOpen, без разброса трения) и в воображении каждой
   из пяти сетей (L71.imagineOpen): сети получают только свои предсказания. График — расхождение
   среднего воображения с настоящим столом и разброс сетей по шагам. Прогон — 40 шагов (2 с).
   ===================================================================== */
const Dream = (() => {
  const E = L71, lay = E.LAYOUTS.base, T = 40;
  const DEF_PATH = [[0.19, 0.34], [0.46, 0.34]];
  const st = { nrec: NREC, speed: 0.2, path: DEF_PATH.map((p) => p.slice()), drawing: false, res: null, cov: false, tau: T, busy: false, prog: 0, ens: null, live: false, ref: {} };
  let cv = null, gcv = null, cam = null, ctl = null, anim = null;
  /** Путь кисти → положения кисти через каждые v·0,05 с (не больше T шагов) и сдвиги за шаг; после пути кисть стоит. */
  function actsOf(path, v) {
    const step = v * E.DT, pos = [path[0].slice()];
    let cur = path[0].slice(), i = 1, rem = step;
    while (i < path.length && pos.length <= T) {
      const dx = path[i][0] - cur[0], dy = path[i][1] - cur[1], d = Math.hypot(dx, dy);
      if (d >= rem) { cur = [cur[0] + dx / d * rem, cur[1] + dy / d * rem]; pos.push(cur.slice()); rem = step; } else { rem -= d; cur = path[i].slice(); i++; }
    }
    const acts = [];
    for (let t = 0; t < T; t++) acts.push(t + 1 < pos.length ? [pos[t + 1][0] - pos[t][0], pos[t + 1][1] - pos[t][1]] : [0, 0]);
    return { acts, hand0: pos[0], moves: pos.length - 1 };
  }
  /** Один толчок в двух мирах: расхождение и разброс по шагам, события на настоящем столе. */
  function compute(ens, path, v) {
    const { acts, hand0, moves } = actsOf(path, v), s0 = [CUP0[0], CUP0[1], 0, 0, 1, hand0[0], hand0[1]];
    const re = E.realOpen(s0, acts, { layout: 'base' }), im = E.imagineOpen(ens, s0, acts, 'base');
    const err = [], spread = [];
    for (let t = 0; t <= T; t++) { err.push(Math.hypot(im.mean[t * 2] - re.path[t * 4], im.mean[t * 2 + 1] - re.path[t * 4 + 1]) * 100); spread.push(im.spread[t] * 100); }
    const first3 = err.findIndex((e) => e > 3);
    let moved = 0; for (let t = 0; t <= T; t++) moved = Math.max(moved, Math.hypot(re.path[t * 4] - CUP0[0], re.path[t * 4 + 1] - CUP0[1]));
    const mx = im.mean[T * 2], my = im.mean[T * 2 + 1], off = mx < 0 || mx > E.TABLE.W || my < 0 || my > E.TABLE.H;
    return { acts, moves, v, s0, re, im, err, spread, first3, s10: spread[10], e10: err[10], eEnd: err[T], contact: moved > 0.005 || re.tip > 0, tip: re.tip, fall: re.fall, impact: re.maxImpact, imagOff: off, nrec: ens.n / 60 | 0, oneStep: ens.oneStep };
  }
  function setBusy(on, txt) { st.busy = on; st.busyTxt = txt || ''; draw(); }
  async function ensure(n) {
    if (st.ens && st.nrec === n) return st.ens;
    if (!Models.has(n)) setBusy(true, n === NREC ? 'Модель мира учится по записям дня' : `Модель учится заново на ${n} записях`);
    const ens = await Models.get(n, (f) => { st.prog = f; draw(); });
    st.ens = ens; st.nrec = n; setBusy(false);
    st.ref[n] = { one: ens.oneStep, held: ens.held };
    return ens;
  }
  async function run() {
    const ens = await ensure(st.nrec);
    st.res = compute(ens, st.path, st.speed);
    play(); renderRead(); if (ctl) ctl.update();
    return Object.assign({}, st.res, { ref: Object.assign({}, st.ref) });
  }
  /** Проигрывание прогона: шаг tau растёт от 0 до T за 1,6 с. */
  function play() {
    if (anim) anim.stop();
    if (HeroKit.reduced() || window.__noAnim) { st.tau = T; draw(); return; }
    st.tau = 0; let acc = 0;
    anim = HeroKit.loop(cv, (dt) => { acc += dt; st.tau = Math.min(T, Math.round(acc / 1.6 * T)); draw(); if (st.tau >= T) { anim.stop(); anim = null; } });
  }
  /* ---------- рисование ---------- */
  function worldAt(t) {
    const W = E.world({ layout: 'base', cup: CUP0, noise: false });
    const r = st.res;
    if (r) { const p = r.re.path; W.cx = p[t * 4]; W.cy = p[t * 4 + 1]; W.hx = p[t * 4 + 2]; W.hy = p[t * 4 + 3]; W.tipped = r.tip > 0 && t >= r.tip; W.fallen = r.fall > 0 && t >= r.fall; }
    else { const h = st.path[0]; W.hx = h[0]; W.hy = h[1]; }
    return W;
  }
  /** Куда смотрит кисть: по направлению пути рядом с шагом t. */
  function headingAt(t) {
    const p = st.path; if (p.length < 2) return 0;
    const pos = st.res ? st.res.re.path : null;
    if (pos) { for (let q = Math.min(t, T - 1); q < T; q++) { const dx = pos[(q + 1) * 4 + 2] - pos[q * 4 + 2], dy = pos[(q + 1) * 4 + 3] - pos[q * 4 + 3]; if (Math.hypot(dx, dy) > 1e-4) return Math.atan2(dy, dx); } }
    return Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
  }
  function draw() {
    if (!cv) return;
    const V = TableDraw.view(cv, { W: 720, margin: 0.08 }), c = V.c, k = V.k, r = st.res, t = st.tau, W = worldAt(r ? t : 0);
    TableDraw.table(V, W, { light: 'day' });
    if (st.cov) TableDraw.coverage(V, E.coverage(Models.records(st.nrec).trans));
    // путь кисти, нарисованный читателем
    const hp = []; for (const p of st.path) hp.push(p[0], p[1]);
    TableDraw.path(V, hp, { kind: 'hand', lw: 2.2 });
    if (r) {
      const real = [], mean = [];
      for (let q = 0; q <= T; q++) { real.push(r.re.path[q * 4], r.re.path[q * 4 + 1]); mean.push(r.im.mean[q * 2], r.im.mean[q * 2 + 1]); }
      for (const p of r.im.paths) { const pp = []; for (let q = 0; q <= T; q++) pp.push(p[q * 4], p[q * 4 + 1]); TableDraw.path(V, pp.slice(0, (t + 1) * 2), { kind: 'imag', lw: 1.2, alpha: 0.55 }); }
      TableDraw.path(V, mean.slice(0, (t + 1) * 2), { kind: 'imag', lw: 2.6 });
      TableDraw.path(V, real.slice(0, (t + 1) * 2), { kind: 'real', lw: 3 });
      TableDraw.cup(V, r.im.mean[t * 2], r.im.mean[t * 2 + 1], { imag: true, lw: 2.2 });
      TableDraw.cup(V, W.cx, W.cy, { tipped: W.tipped, fallen: W.fallen });
      TableDraw.hand(V, W.hx, W.hy, { heading: headingAt(t) });
      if (W.tipped) HeroKit.label(c, k, `опрокинулась: удар ${fmt(r.impact, 2)} м/с`, V.X(W.cx), V.Y(W.cy) - 26, { px: 11, weight: 700, color: HeroKit.css('--critical') });
      if (W.fallen) HeroKit.label(c, k, 'упала со стола', V.X(Math.min(Math.max(W.cx, 0.08), E.TABLE.W - 0.08)), V.Y(Math.min(Math.max(W.cy, 0.05), E.TABLE.H - 0.03)) + (W.cy > E.TABLE.H / 2 ? -22 : 22), { px: 11, weight: 700, color: HeroKit.css('--critical') });
    } else {
      TableDraw.cup(V, W.cx, W.cy); TableDraw.hand(V, W.hx, W.hy, { heading: headingAt(0) });
    }
    HeroKit.label(c, k, 'Ада стоит у этого края стола', V.X(E.TABLE.W / 2), V.H - V.m * V.S / 2, { px: 10.5, weight: 600, color: HeroKit.css('--ink-3'), halo: false });
    if (st.busy) {
      c.fillStyle = HeroKit.dark() ? 'rgba(20,20,18,0.72)' : 'rgba(255,253,248,0.78)'; c.fillRect(0, 0, V.W, V.H);
      HeroKit.label(c, k, `${st.busyTxt}: ${Math.round(st.prog * 100)}%`, V.W / 2, V.H / 2, { px: 13, weight: 700, color: HeroKit.css('--ink') });
    } else if (!r) HeroKit.label(c, k, k > 1.4 ? 'Нарисуй путь кисти через чашку' : 'Нарисуй путь кисти через чашку и запусти толчок', V.W / 2, V.Y(0.07), { px: 12, weight: 650, color: HeroKit.css('--ink-2') });
    if (cam) TableDraw.camera(cam, E.frame(W, { light: 'day' }), 24, 24);
    drawGraph();
  }
  function drawGraph() {
    if (!gcv) return;
    const narrow = gcv.getBoundingClientRect().width < 520, Wl = narrow ? 360 : 640, Hl = narrow ? 170 : 190;
    const { c, k } = HeroKit.fit(gcv, Wl, Hl), r = st.res, css = HeroKit.css;
    c.clearRect(0, 0, Wl, Hl);
    const x0 = narrow ? 34 : 40, x1 = Wl - 12, y0 = 14, y1 = Hl - 26;
    let ym = 6; if (r) { for (let q = 0; q <= T; q++) ym = Math.max(ym, r.err[q], r.spread[q]); ym = Math.min(24, Math.ceil(ym / 2) * 2); }
    const X = (q) => x0 + (x1 - x0) * q / T, Y = (v) => y1 - (y1 - y0) * Math.min(v, ym) / ym;
    c.strokeStyle = css('--line'); c.lineWidth = 1;
    const dy = ym <= 8 ? 2 : ym <= 16 ? 4 : 6;
    for (let v = 0; v <= ym; v += dy) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); HeroKit.label(c, k, fmt(v), x0 - 6, Y(v), { px: 10, color: css('--ink-3'), halo: false, align: 'right', mono: true }); }
    for (let q = 0; q <= T; q += 10) HeroKit.label(c, k, String(q), X(q), y1 + 11, { px: 10, color: css('--ink-3'), halo: false, mono: true });
    HeroKit.label(c, k, 'шаг', x1 - 16, y1 + 11, { px: 10, color: css('--ink-3'), halo: false, align: 'right' });
    HeroKit.label(c, k, 'см', x0 - 6, y0 - 6, { px: 10, color: css('--ink-3'), halo: false, align: 'right' });
    c.strokeStyle = css('--ink-3'); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(10), y0); c.lineTo(X(10), y1); c.stroke(); c.setLineDash([]);
    c.strokeStyle = css('--ink-3'); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, Y(3)); c.lineTo(x1, Y(3)); c.stroke();
    HeroKit.label(c, k, '3 см', x1 - 2, Y(3) - 8, { px: 10, color: css('--ink-3'), halo: false, align: 'right' });
    if (!r) { HeroKit.label(c, k, 'График появится после толчка', (x0 + x1) / 2, y0 + (y1 - y0) * 0.25, { px: 12, weight: 600, color: css('--ink-3') }); return; }
    const t = st.tau;
    const line = (arr, col, dash, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); for (let q = 0; q <= t; q++) { const x = X(q), y = Y(arr[q]); if (q) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.setLineDash([]); };
    line(r.spread, css('--e2e'), [6, 4], 2.2);
    line(r.err, css('--critical'), null, 2.4);
    if (r.first3 >= 0 && r.first3 <= t) { c.fillStyle = css('--critical'); c.beginPath(); c.arc(X(r.first3), Y(r.err[r.first3]), 3.5, 0, 7); c.fill(); }
  }
  function renderRead() {
    const r = st.res, el = $('#dRead'); if (!el) return;
    if (!r) { setOut(el, ''); return; }
    const evt = r.tip > 0 ? `опрокинулась на ${r.tip}-м шаге: кисть ударила по ней со скоростью ${fmt(r.impact, 2)} м/с` : r.fall > 0 ? `упала со стола на ${r.fall}-м шаге` : r.contact ? 'проехала и стоит на столе' : 'осталась на месте: кисть её не задела';
    const first = r.first3 > 0 ? `больше 3 см с ${r.first3}-го шага` : 'нигде не больше 3 см';
    setOut(el, `Настоящая чашка ${evt}. Воображение разошлось с настоящим столом ${first}: к 10-му шагу на <b>${fmt(r.e10, 1)} см</b>, к 40-му — на <b>${fmt(r.eEnd, 1)} см</b>. Пять сетей к 10-му шагу расходятся между собой на <b>${fmt(r.s10, 1)} см</b>. Модель на ${st.nrec} записях ошибается на одном шаге в среднем на ${fmt(st.ens ? st.ens.oneStep : 0, 2)} мм.`);
  }
  /* ---------- рисование пути пальцем или мышью ---------- */
  function bindDraw() {
    const toT = (e) => { const V = TableDraw.view(cv, { W: 720, margin: 0.08 }); return V.toTable(e.clientX, e.clientY); };
    cv.addEventListener('pointerdown', (e) => { if (st.busy) return; st.drawing = true; cv.setPointerCapture(e.pointerId); st.path = [toT(e)]; st.res = null; st.tau = T; draw(); renderRead(); });
    cv.addEventListener('pointermove', (e) => { if (!st.drawing) return; const p = toT(e), q = st.path[st.path.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.006) { st.path.push(p); draw(); } });
    const up = () => { if (!st.drawing) return; st.drawing = false; if (st.path.length < 2) st.path.push([st.path[0][0] + 0.01, st.path[0][1]]); draw(); if (st.live) run(); if (ctl) ctl.update(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  /** Для проверок и снимков: задать путь и скорость программно. */
  function setPath(pts, v) { st.path = pts.map((p) => p.slice()); if (v != null) { st.speed = v; segSet('#dSpeed', v); } st.res = null; draw(); renderRead(); }
  function state() { return { nrec: st.nrec, speed: st.speed, res: st.res, cov: st.cov, busy: st.busy }; }
  return { st, T, DEF_PATH, CUP0, actsOf, compute, ensure, run, draw, drawGraph, renderRead, bindDraw, setPath, state, worldAt,
    init(c) { cv = $('#dreamCv'); gcv = $('#dreamGraph'); cam = $('#dreamCam'); ctl = c; bindDraw(); draw(); App.on('theme', draw); App.on('resize', draw); },
    set ctl(v) { ctl = v; }, get ctl() { return ctl; }, set live(v) { st.live = v; } };
})();

/* ---------- миссии лаборатории 1: ставка → путь и скорость на сцене → толчок в двух мирах ---------- */
const DreamLab = (() => {
  const D = Dream;
  const runAct = { label: 'Запустить толчок', run: async () => D.run() };
  const missions = [
    { short: 'Расхождение', title: 'Где воображение уходит раньше 10-го шага',
      text: 'На сцене уже нарисован осторожный толчок через середину стола, как в записях. Нарисуй свой путь кисти, выбери скорость и найди толчок, после которого воображаемая чашка уходит от настоящей больше чем на 3 см раньше 10-го шага, то есть быстрее чем за полсекунды.',
      onEnter: () => { D.live = false; D.setPath(D.DEF_PATH, 0.2); },
      bet: { q: 'На одном шаге модель ошибается меньше чем на миллиметр. Где воображение разойдётся с настоящим столом быстрее всего?', options: ['в середине стола, где записей больше всего: там чашку толкали чаще', 'при толчке быстрее, чем в записях, или у края стола: там записей нет', 'одинаково везде: ошибка за шаг маленькая'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Кисть задевает чашку', test: (r) => !!r && r.contact },
        { label: 'Расхождение больше 3 см раньше 10-го шага', test: (r) => !!r && r.first3 > 0 && r.first3 <= 10 },
      ],
      summary: (r) => `${fmt(r.v, 2)} м/с: 3 см ${r.first3 > 0 ? 'на ' + r.first3 + '-м шаге' : 'не превышено'}, к 10-му — ${fmt(r.e10, 1)} см`,
      hint: 'Ошибка за шаг маленькая, но каждый шаг воображения строится на прошлом предсказании. Попробуй толкнуть чашку быстрее 0,33 м/с или к самому краю стола.',
      fail: (r) => r && !r.contact ? '<b>Кисть не задела чашку.</b> Начни путь за чашкой и проведи его через неё.' : `<b>Пока воображение держится.</b> Расхождение к 10-му шагу — ${fmt(r.e10, 1)} см. Там, где записей много, модель ведёт чашку почти как настоящую. Толкни быстрее или к краю.`,
      explain: (r) => r.tip > 0 ? `При ударе ${fmt(r.impact, 2)} м/с настоящая чашка опрокинулась на ${r.tip}-м шаге, а воображаемая поехала дальше: в записях кисть не двигалась быстрее 0,33 м/с, и ни одна сеть не знает, что чашка опрокидывается. Уже на ${r.first3}-м шаге расхождение больше 3 см, а к 10-му — ${fmt(r.e10, 1)} см.` : r.fall > 0 ? `Настоящая чашка упала со стола на ${r.fall}-м шаге, а в воображении она стоит и едет дальше: у края записей нет, и модель не знает, что стол кончается. Расхождение больше 3 см с ${r.first3}-го шага.` : `Расхождение больше 3 см уже на ${r.first3}-м шаге: толчок ушёл туда, где модель почти не видела записей. Ошибка накапливается с горизонтом, как ошибки behavior cloning в уроке 1.1.` },
    { short: 'Вдвое больше', title: 'Вдвое больше записей',
      text: 'Ада может записать ещё 60 таких же осторожных записей: кисть не быстрее 0,33 м/с, чашка не ближе 7 см к краю. Модель выучится заново на 120 записях, и тот же толчок повторится в двух мирах.',
      onEnter: () => { D.live = false; },
      bet: { q: 'Исчезнет ли расхождение на этом толчке, если записей станет вдвое больше?', options: ['да: модель станет точнее везде и на любом горизонте', 'нет: там, где расходилось, записей по-прежнему нет; точнее станет только середина стола', 'станет хуже: модель запутается в лишних данных'], answer: () => 1 },
      action: { label: 'Обучить на 120 записях и повторить толчок', run: async () => { await D.ensure(120); return D.run(); } },
      criteria: [
        { label: 'Модель обучена на 120 записях', test: (r) => !!r && r.nrec === 120 },
        { label: 'На том же толчке расхождение раньше 10-го шага всё ещё больше 3 см', test: (r) => !!r && r.first3 > 0 && r.first3 <= 10 },
        { label: 'На новых записях модель ошибается меньше', test: (r) => !!r && r.ref[120] && r.ref[60] && r.ref[120].one < r.ref[60].one },
      ],
      summary: (r) => `120 записей: 3 см ${r.first3 > 0 ? 'на ' + r.first3 + '-м шаге' : 'не превышено'}`,
      hint: 'Если на 120 записях твой толчок перестал расходиться, верни путь из миссии 1 или толкни ещё быстрее: новых записей быстрых ударов и края стола всё равно нет.',
      fail: (r) => r && r.nrec === 120 && !(r.first3 > 0 && r.first3 <= 10) ? `<b>Расхождение на этом толчке стало меньше 3 см к 10-му шагу.</b> Нарисуй толчок быстрее 0,33 м/с или к краю стола и запусти снова: таких записей не прибавилось.` : '<b>Пока не всё.</b> Запусти толчок ещё раз.',
      explain: (r) => `На 120 записях модель точнее там, где записи и были: на новых записях она ошибается на одном шаге на ${fmt(r.ref[120].one, 2)} мм вместо ${fmt(r.ref[60].one, 2)}, а через 20 шагов воображаемая чашка уходит от настоящей в середине распределения на ${fmt(r.ref[120].held, 1)} см вместо ${fmt(r.ref[60].held, 1)}. А на твоём толчке расхождение по-прежнему больше 3 см уже на ${r.first3}-м шаге: вдвое больше тех же записей не добавили ни одного быстрого удара и ни одного толчка у края.` },
    { short: 'Разброс', title: 'Когда сети ансамбля спорят',
      text: 'Пять сетей учились на одних записях, но с разной начальной случайностью. Включи карту покрытия, чтобы видеть, где в записях двигали чашку, и найди толчок, после которого сети к 10-му шагу расходятся между собой больше чем на 2 см.',
      controls: ['cov'], onEnter: () => { D.live = false; },
      bet: { q: 'Пять сетей согласны между собой. Значит ли это, что воображению можно верить?', options: ['да: если все сети предсказывают одно, модель знает', 'нет: события, которого не было ни в одной записи, не ждёт ни одна сеть, и все пять ошибаются одинаково', 'согласие сетей вообще ничего не говорит о модели'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Кисть задевает чашку', test: (r) => !!r && r.contact },
        { label: 'К 10-му шагу сети расходятся больше чем на 2 см', test: (r) => !!r && r.s10 > 2 },
      ],
      summary: (r) => `${fmt(r.v, 2)} м/с: разброс к 10-му шагу ${fmt(r.s10, 1)} см, расхождение ${fmt(r.e10, 1)} см`,
      hint: 'Сети спорят там, где в записях не было похожих переходов. Самое непохожее на записи — скорость: днём кисть не двигалась быстрее 0,33 м/с.',
      fail: (r) => r && !r.contact ? '<b>Кисть не задела чашку.</b>' : `<b>Сети пока согласны:</b> разброс к 10-му шагу ${fmt(r.s10, 1)} см. Посмотри на карту покрытия и толкни чашку так, как в записях не толкали.`,
      explain: (r) => `Сети разошлись на ${fmt(r.s10, 1)} см к 10-му шагу: воображаемая чашка едет так, как в записях не ездила, и каждая сеть достраивает это по-своему. Но посмотри на первые шаги: ${r.tip > 0 ? `на 5-м шаге воображаемая чашка уже на ${fmt(r.err[5], 1)} см от настоящей, потому что чашка опрокинулась, а сети расходятся всего на ${fmt(r.spread[5], 1)} см. ` : ''}Разброс ансамбля, как в уроке 1.2 и в MBPO, показывает незнакомое движение, но события, которого не видела ни одна сеть, он не предскажет: все пять одинаково уверены, что чашка поедет дальше. А у края стола сети почти не спорят, хотя записей там нет.` },
    { short: 'Свободно', final: true, title: 'Свободный режим: воображение и настоящий стол',
      text: 'Теперь толчок запускается, как только ты отпускаешь палец или кнопку мыши. Найди толчок, после которого воображаемая чашка уезжает за край стола, хотя настоящая упала, и толчок, на котором воображение и настоящий стол почти совпадают все 40 шагов. Сравни модели на 60 и на 120 записях.',
      controls: 'all', onEnter: () => { D.live = true; } },
  ];
  function init() {
    segBind('#dSpeed', (v) => { D.st.speed = +v; segSet('#dSpeed', v); D.st.res = null; D.draw(); D.renderRead(); if (D.st.live) D.run(); });
    $('#dClear').addEventListener('click', () => { D.st.path = [D.CUP0.slice()]; D.st.res = null; D.draw(); D.renderRead(); });
    $('#dCov').addEventListener('change', (e) => { D.st.cov = e.target.checked; D.draw(); });
    segBind('#dData', async (v) => { segSet('#dData', v); await D.ensure(+v); if (D.st.live) D.run(); });
    const ctl = mountMissions('#dMis', missions, { reset() { D.setPath(D.DEF_PATH, 0.2); }, state: D.state }, { controls: { cov: '#wrapDCov', data: '#wrapDData' }, scene: '#dreamCv' });
    D.init(ctl);
    return ctl;
  }
  return { init, missions };
})();

/* =====================================================================
   3. Лаборатория 2 «Политика из воображения на настоящем столе».
   Первая ночь: модель на записях дня, ARS в воображении от толчка 0,2 м/с, проверка на 50 попытках
   в двух мирах. Следующие ночи: 10 настоящих попыток там, куда ходит политика (L71.collectPolicy,
   со всеми провалами), или 10 осторожных записей там, где записей больше всего; модель учится
   заново на всех данных, поиск стартует с прежней политики. Бюджет — 20 настоящих попыток.
   Свободный режим: температура модели τ и штраф за разброс ансамбля, политика заново от 0,2 м/с.
   ===================================================================== */
const Holes = (() => {
  const E = L71, N_EVAL = 50, BUDGET = 20, PER_NIGHT = 10;
  const EVAL = E.starts(N_EVAL, 5), ARS_STARTS = E.starts(8, 11);
  const st = { data: null, ens: null, theta: null, imag: null, real: null, imagPct: 0, realPct: 0, spent: 0, nights: [], where: 'policy', tau: 1, lam: 0, sel: 0, busy: false, prog: 0, busyTxt: '', base: null, last: null };
  let cvI = null, cvR = null, ctl = null;
  const tips = (arr) => arr.filter((r) => r.tip || r.fall).length;
  async function trainPolicy(ens, theta0, tau, lam) {
    st.busyTxt = 'Поиск по популяции в воображении модели'; st.prog = 0; draw();
    const iters = 16;
    const res = await runChunked(E.arsImag(ens, { theta0, seed: SEED, tau, lambda: lam, starts: ARS_STARTS, iters }), (h) => { st.prog = (h.it + 1) / iters; draw(); }, 14);
    return res.theta;
  }
  async function evaluate(tau) {
    st.busyTxt = 'Проверка: 50 попыток в воображении и на столе'; st.prog = 0; draw(); await sleep0();
    const imag = EVAL.map((s, i) => E.imagineCtl(st.ens, st.theta, s, 'base', { seed: 9 * 31 + i, tau, path: true }));
    const real = EVAL.map((s) => E.runReal(st.theta, { seed: s.seed, cup: s.cup, hand: s.hand }));
    st.imag = imag; st.real = real;
    st.imagPct = Math.round(imag.reduce((a, r) => a + (r.reached ? r.alive : 0), 0) / N_EVAL * 100);
    st.realPct = Math.round(real.filter((r) => r.ok).length / N_EVAL * 100);
    const bad = real.findIndex((r) => !r.ok); st.sel = bad >= 0 ? bad : 0;
  }
  async function trainModel() {
    st.busyTxt = 'Модель мира учится заново на всех данных'; st.prog = 0; draw();
    const ens = E.ensemble({ k: 5, seed: SEED }); let done = 0;
    await runChunked(E.trainEnsemble(ens, st.data, {}), (ev) => { if (ev.epoch === ev.epochs - 1) { done++; st.prog = done / 5; draw(); } }, 12);
    return ens;
  }
  const snap = () => ({ data: st.data, ens: st.ens, theta: st.theta, imag: st.imag, real: st.real, imagPct: st.imagPct, realPct: st.realPct, spent: st.spent, nights: st.nights.slice() });
  const restore = (b) => { Object.assign(st, { data: b.data, ens: b.ens, theta: b.theta, imag: b.imag, real: b.real, imagPct: b.imagPct, realPct: b.realPct, spent: b.spent, nights: b.nights.slice() }); };
  function result(extra) { return Object.assign({ trained: !!st.theta, nReal: st.real ? st.real.length : 0, imagPct: st.imagPct, realPct: st.realPct, theta: st.theta && st.theta.slice(), spent: st.spent, tips: st.real ? tips(st.real) : 0, nights: st.nights.length, where: st.where, tau: st.tau, lam: st.lam }, extra || {}); }
  async function busy(fn) { st.busy = true; renderPol(); try { return await fn(); } finally { st.busy = false; draw(); renderPol(); renderNights(); if (ctl) ctl.update(); } }
  /** Первая ночь: модель на записях дня, политика только в воображении, утром проверка. */
  async function firstNight() {
    if (st.base) { restore(st.base); draw(); renderPol(); renderNights(); return result(); }
    return busy(async () => {
      st.busyTxt = 'Модель мира учится по записям дня'; st.prog = 0; draw();
      st.ens = await Models.get(NREC, (f) => { st.prog = f; draw(); });
      st.data = Models.records(NREC).trans.slice(); st.spent = 0; st.nights = [];
      st.theta = await trainPolicy(st.ens, START_THETA, 1, 0);
      await evaluate(1);
      st.nights.push({ n: 1, where: 'записи дня', size: st.data.length, fails: 0, theta: st.theta.slice(), imagPct: st.imagPct, realPct: st.realPct });
      st.base = snap();
      return result();
    });
  }
  /** Следующая ночь: 10 настоящих попыток там, куда ходит политика, или там, где записей больше всего. */
  async function nextNight(where) {
    if (!st.base) await firstNight();
    return busy(async () => {
      const n = st.nights.length + 1; let added, fails = 0, okInCollect = 0;
      st.busyTxt = 'Ада набирает 10 настоящих попыток'; st.prog = 0; draw(); await sleep0();
      if (where === 'policy') { const c = E.collectPolicy(st.theta, PER_NIGHT, 300 + n); added = c.trans; okInCollect = c.ev.ok; }
      else added = E.records({ n: PER_NIGHT, seed: SEED, from: 1000 + n * 100 }).trans;
      fails = added.filter((x) => x.fail).length;
      st.data = st.data.concat(added); st.spent += PER_NIGHT;
      st.ens = await trainModel();
      st.theta = await trainPolicy(st.ens, st.theta, 1, 0);
      await evaluate(1);
      st.nights.push({ n, kind: where, where: where === 'policy' ? 'туда, куда ходит политика' : 'туда, где записей больше всего', size: st.data.length, fails, theta: st.theta.slice(), imagPct: st.imagPct, realPct: st.realPct });
      st.last = { where, fails, okInCollect, added: added.length };
      const pol = st.nights.filter((x) => x.kind === 'policy').length * PER_NIGHT, recs = st.nights.filter((x) => x.kind === 'records').length * PER_NIGHT;
      return result({ fails, okInCollect, whereRun: where, failsTotal: st.nights.reduce((a, x) => a + (x.fails || 0), 0), policySpent: pol, recordsSpent: recs });
    });
  }
  /** Свободный режим: политика заново от толчка 0,2 м/с в воображении текущей модели с выбранными τ и штрафом. */
  async function free() {
    if (!st.base) await firstNight();
    return busy(async () => {
      st.theta = await trainPolicy(st.ens, START_THETA, st.tau, st.lam);
      await evaluate(st.tau);
      return result();
    });
  }
  function back() { if (st.base) { restore(st.base); draw(); renderPol(); renderNights(); if (ctl) ctl.update(); } }
  /* ---------- рисование ---------- */
  function drawWorld(cv, kind) {
    if (!cv) return;
    const V = TableDraw.view(cv, { W: 480, margin: 0.06 }), c = V.c, k = V.k, i = st.sel, s = EVAL[i];
    const W = E.world({ layout: 'base', cup: s.cup, hand: s.hand, noise: false });
    TableDraw.table(V, W, { light: 'day' });
    const arr = kind === 'imag' ? st.imag : st.real;
    if (arr && arr[i]) {
      const r = arr[i], p = r.path, cup = [], hand = [];
      for (let q = 0; q < p.length; q += 4) { cup.push(p[q], p[q + 1]); hand.push(p[q + 2], p[q + 3]); }
      TableDraw.path(V, hand, { kind: 'hand', lw: 1.6 });
      TableDraw.path(V, cup, { kind: kind === 'imag' ? 'imag' : 'real', lw: 2.6 });
      const ex = cup[cup.length - 2], ey = cup[cup.length - 1];
      if (kind === 'imag') { TableDraw.cup(V, ex, ey, { imag: true, lw: 2.2 }); TableDraw.hand(V, hand[hand.length - 2], hand[hand.length - 1], { alpha: 0.8 }); }
      else { TableDraw.cup(V, ex, ey, { tipped: r.tip, fallen: r.fall }); TableDraw.hand(V, hand[hand.length - 2], hand[hand.length - 1]); }
      const txt = kind === 'imag' ? (r.reached && r.alive >= 0.5 ? `на блюдце за ${fmt(r.t * E.DT, 2)} с` : r.reached ? 'доехала, но модель ждёт провала' : 'не доехала за 5 с')
        : r.ok ? `на блюдце за ${fmt(r.t * E.DT, 2)} с` : r.tip ? 'опрокинулась' : r.fall ? 'упала со стола' : 'не доехала за 5 с';
      const bad = kind === 'real' && !r.ok;
      HeroKit.label(c, k, `попытка ${i + 1}: ${txt}`, V.W / 2, V.Y(0.05), { px: 11, weight: 700, color: bad ? HeroKit.css('--critical') : HeroKit.css('--ink') });
    } else {
      TableDraw.cup(V, W.cx, W.cy); TableDraw.hand(V, W.hx, W.hy);
      HeroKit.label(c, k, 'политика ещё не обучена', V.W / 2, V.Y(0.05), { px: 11, weight: 650, color: HeroKit.css('--ink-2') });
    }
    if (st.busy) {
      c.fillStyle = HeroKit.dark() ? 'rgba(20,20,18,0.72)' : 'rgba(255,253,248,0.8)'; c.fillRect(0, 0, V.W, V.H);
      HeroKit.label(c, k, `${st.busyTxt}: ${Math.round(st.prog * 100)}%`, V.W / 2, V.H / 2, { px: 12, weight: 700, color: HeroKit.css('--ink') });
    }
  }
  function renderDots() {
    for (const [id, arr, kind] of [['#hImagDots', st.imag, 'imag'], ['#hRealDots', st.real, 'real']]) {
      const el = $(id); if (!el) continue;
      if (!el.children.length) for (let i = 0; i < N_EVAL; i++) { const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-label', `попытка ${i + 1}`); el.append(b); }
      [...el.children].forEach((b, i) => {
        const r = arr && arr[i];
        b.className = (r ? (kind === 'imag' ? (r.reached && r.alive >= 0.5 ? 'ok' : r.reached ? 'fail' : 'slow') : r.ok ? 'ok' : r.tip || r.fall ? 'fail' : 'slow') : '') + (i === st.sel ? ' sel' : '');
      });
    }
    setOut($('#hImagPct'), st.imag ? `${st.imagPct}%` : '—'); setOut($('#hRealPct'), st.real ? `${st.realPct}%` : '—');
  }
  function renderPol() {
    const el = $('#hPol'); if (!el) return;
    if (!st.theta) { setOut(el, 'Политика начнёт с толчка <b>0,2 м/с</b>, как толкала чашку Ада днём. Настоящих попыток на опыт: <b>0</b> из 20.'); return; }
    const brake = st.theta[2] < 0.005 ? 'без торможения перед блюдцем' : `торможение за <b>${fmt(st.theta[2] * 100, 1)} см</b> до блюдца`;
    setOut(el, `Скорость толчка <b>${fmt(st.theta[0], 2)} м/с</b>, ${brake}; в записях дня кисть не двигалась быстрее 0,33 м/с. Настоящих попыток на опыт: <b>${st.spent}</b> из ${BUDGET}.`);
  }
  function renderNights() {
    const el = $('#hNights'); if (!el) return;
    el.hidden = !st.nights.length;
    const rows = st.nights.map((n) => `<tr><td class="num">${n.n}</td><td>${n.where}</td><td class="num">${n.size}${n.fails ? `, провалов ${n.fails}` : ''}</td><td class="num">${fmt(n.theta[0], 2)} м/с</td><td class="num">${n.imagPct}%</td><td class="num">${n.realPct}%</td></tr>`).join('');
    setOut(el, `<table><thead><tr><th>Ночь</th><th>Опыт</th><th>Переходов в данных модели</th><th>Толчок</th><th>В воображении</th><th>На столе</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  function draw() { drawWorld(cvI, 'imag'); drawWorld(cvR, 'real'); renderDots(); }
  function state() { return result(); }
  function init(c) {
    cvI = $('#hImagCv'); cvR = $('#hRealCv'); ctl = c;
    for (const id of ['#hImagDots', '#hRealDots']) $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.sel = +b.dataset.i; draw(); } });
    segBind('#hWhere', (v) => { st.where = v; segSet('#hWhere', v); });
    segBind('#hTau', (v) => { st.tau = +v; segSet('#hTau', v); });
    segBind('#hLam', (v) => { st.lam = +v; segSet('#hLam', v); });
    $('#hBack').addEventListener('click', back);
    draw(); renderPol(); App.on('theme', draw); App.on('resize', draw);
  }
  return { st, EVAL, firstNight, nextNight, free, back, draw, state, init, result, BUDGET, set ctl(v) { ctl = v; } };
})();

/* ---------- миссии лаборатории 2 ---------- */
const HolesLab = (() => {
  const H = Holes;
  const missions = [
    { short: 'Первая ночь', title: 'Утро после первой ночи',
      text: 'Ночью модель мира учится по записям дня, а политика «подвинь чашку к блюдцу» — только в её воображении: поиск по популяции разгоняет толчок, пока в воображении становится быстрее. Утром ту же политику проверяют на 50 попытках в воображении модели и на настоящем столе.',
      bet: { q: 'Модель мира обещает политике почти сплошной успех. Сколько попыток удастся на настоящем столе?', options: ['почти столько же: на одном шаге модель ошибается меньше чем на миллиметр', 'заметно меньше, но больше половины: ошибки модели мелкие', 'почти ни одной: политика толкает так, как в записях не толкали'], answer: (r) => (r.realPct < 20 ? 2 : r.realPct < 60 ? 1 : 0) },
      action: { label: 'Обучить в воображении и проверить на столе', run: async () => H.firstNight() },
      criteria: [
        { label: 'Политика обучена только в воображении модели', test: (r) => !!r && r.trained },
        { label: 'Проверено 50 попыток на настоящем столе', test: (r) => !!r && r.nReal === 50 },
      ],
      summary: (r) => `толчок ${fmt(r.theta[0], 2)} м/с: воображение ${r.imagPct}%, стол ${r.realPct}%`,
      explain: (r) => `В воображении модели удаются ${r.imagPct}% попыток, на настоящем столе — ${r.realPct}%. Поиск разогнал толчок до ${fmt(r.theta[0], 2)} м/с, а в записях дня кисть не двигалась быстрее 0,33 м/с. На нашем столе удар быстрее 0,36 м/с опрокидывает чашку, и из 50 попыток опрокинулись ${r.tips}. Модель этого не знает: в записях не было ни одного опрокидывания, поэтому провал для неё невозможен, а быстрее для неё значит лучше. Это лазейка в модели, как у контроллера Ha и Schmidhuber, которому монстры в воображении не стреляли. Нажми на красный кружок, чтобы увидеть такую попытку в обоих мирах.` },
    { short: 'Куда за опытом', title: 'Куда отправить Аду за опытом',
      text: 'Следующей ночью Ада может потратить 10 настоящих попыток на столе, а всего на опыт есть 20. Выбери, где их провести: там, куда ходит нынешняя политика, или там, где записей и так больше всего. Потом модель выучится заново на всех данных, а политика — заново в её воображении. Добейся, чтобы на настоящем столе удавалось не меньше 90% попыток.',
      controls: ['where', 'back'], onEnter: () => { if (H.st.base && H.st.spent > 0) H.back(); },
      bet: { q: 'Где 10 настоящих попыток научат модель большему?', options: ['там, где записей больше всего: модель станет точнее', 'там, куда ходит политика: именно там модель ошибается', 'всё равно: 10 попыток мало рядом с 60 записями'], answer: () => 1 },
      action: { label: 'Следующая ночь: 10 попыток, модель и политика заново', run: async () => H.nextNight(H.st.where) },
      criteria: [
        { label: 'На настоящем столе не меньше 90% попыток', test: (r) => !!r && r.realPct >= 90 },
        { label: 'На опыт потрачено не больше 20 настоящих попыток', test: (r) => !!r && r.spent <= 20 },
      ],
      summary: (r) => `${r.whereRun === 'policy' ? 'по политике' : 'по записям'}: толчок ${fmt(r.theta[0], 2)} м/с, стол ${r.realPct}%, попыток ${r.spent}`,
      hint: 'Модель ошибается там, куда она не заглядывала. Чтобы узнать, что быстрый удар опрокидывает чашку, ей нужен хотя бы один такой удар в данных.',
      fail: (r) => r.spent > 20 ? '<b>Бюджет в 20 настоящих попыток потрачен.</b> Нажми «Вернуться к первому утру» и выбери другое место для опыта.'
        : r.whereRun === 'records' ? `<b>На столе по-прежнему ${r.realPct}%.</b> Новые записи снова осторожные: кисть не быстрее 0,33 м/с, провалов ${r.fails}. Модель стала точнее там, где и так была точной, а о быстром ударе так ничего и не узнала, поэтому политика из воображения толкает ${fmt(r.theta[0], 2)} м/с.`
          : `<b>На столе ${r.realPct}%.</b> За ночь в данных появилось ${r.fails} ${pl(r.fails, 'переход', 'перехода', 'переходов')} с провалом, и политика сбавила толчок до ${fmt(r.theta[0], 2)} м/с, но ещё не там, где чашка перестаёт опрокидываться. Ещё одна ночь там, куда ходит политика, уточнит границу.`,
      explain: (r) => `Ада потратила ${r.policySpent} настоящих попыток там, куда ходит политика${r.recordsSpent ? `, и ещё ${r.recordsSpent} — там, где записей больше всего` : ''}. Провалом закончились ${r.failsTotal} ${pl(r.failsTotal, 'попытка', 'попытки', 'попыток')}, и в данных модели впервые появились провалы. Модель провала узнала, что быстрый удар опрокидывает чашку, и политика из воображения сбавила толчок до ${fmt(r.theta[0], 2)} м/с. Теперь воображение и стол почти согласны: ${r.imagPct}% и ${r.realPct}%. Это цикл Ha и Schmidhuber и Dreamer: собрать опыт там, куда ходит политика, обучить модель, обучить политику в воображении. Для сравнения, в уроке 5.3 безмодельный SAC на простой задаче руки дошёл до 90% за 500 шагов, то есть за 20 попыток, а Minitaur учился ходить около 400 эпизодов; задачи там другие, и это сравнение — иллюстрация, а не измерение на нашем столе.` },
    { short: 'Свободно', final: true, title: 'Свободный режим: температура и штраф за разброс',
      text: 'Вернись к первому утру и обучи политику заново, меняя температуру модели τ и штраф за разброс ансамбля. Найди настройку, при которой политика из воображения проходит на столе не меньше 80% без единой настоящей попытки, и настройку, при которой воображение ещё увереннее обещает успех, а стол показывает ноль.',
      controls: ['tau', 'lam', 'back', 'where'],
      action: { label: 'Обучить политику заново в воображении', run: async () => H.free() },
      criteria: [
        { label: 'Ни одной настоящей попытки на опыт', test: (r) => !!r && r.spent === 0 },
        { label: 'На настоящем столе не меньше 80%', test: (r) => !!r && r.realPct >= 80 },
      ],
      summary: (r) => `τ = ${r.tau}, штраф ${r.lam}: толчок ${fmt(r.theta[0], 2)} м/с, воображение ${r.imagPct}%, стол ${r.realPct}%`,
      fail: (r) => r.spent > 0 ? '<b>В данных модели уже есть настоящие попытки.</b> Нажми «Вернуться к первому утру», чтобы искать без них.' : `<b>На столе ${r.realPct}%.</b> Толчок ${fmt(r.theta[0], 2)} м/с. ${r.lam ? 'Штраф ещё мал.' : 'Без штрафа политика в воображении не боится незнакомых скоростей.'}`,
      explain: (r) => `При штрафе ${r.lam} политика держится там, где пять сетей согласны, то есть там, где были записи: толчок ${fmt(r.theta[0], 2)} м/с, и на столе ${r.realPct}% без единой настоящей попытки. Так защищаются MBPO и TD-MPC2. Но разброс ансамбля замечает незнакомые скорости, а не само опрокидывание: штраф лишь удерживает политику рядом с записями и платит за это временем.` },
  ];
  function init() {
    const ctl = mountMissions('#hMis', missions, { reset() { H.back(); }, state: H.state }, { controls: { where: '#wrapHWhere', tau: '#wrapHTau', lam: '#wrapHLam', back: '#hBack' }, scene: '.hl-pair' });
    H.ctl = ctl; H.init(ctl);
    return ctl;
  }
  return { init, missions };
})();

/* =====================================================================
   4. Числа из статей — диаграммами (shared/stats-chart.js).
   ===================================================================== */
function initStats() {
  const el = (id) => document.getElementById(id);
  if (el('carBars')) StatsChart.bars(el('carBars'), {
    series: [{ id: 's', label: 'средний счёт за 100 заездов', color: 'var(--classic)' }],
    groups: [{ label: 'DQN', values: { s: 343 } }, { label: 'A3C, непре\u00ADрывные', values: { s: 591 } }, { label: 'A3C, дискрет\u00ADные', values: { s: 652 } }, { label: 'лидер Gym', values: { s: 838 } },
      { label: 'только V', values: { s: 632 } }, { label: 'V и слой в C', values: { s: 788 } }, { label: 'V и M', values: { s: 906 } }],
    max: 1000, unit: '', ticks: [0, 300, 600, 900], digits: 0,
  });
  if (el('tauBars')) StatsChart.bars(el('tauBars'), {
    series: [{ id: 'dream', label: 'в воображении модели, шагов', color: 'var(--e2e)' }, { id: 'real', label: 'в настоящей игре, шагов', color: 'var(--classic)' }],
    groups: [0.10, 0.50, 1.00, 1.15, 1.30].map((tau, i) => ({ label: `τ = ${fmt(tau, 2)}`, values: { dream: [2086, 2060, 1145, 918, 732][i], real: [193, 196, 868, 1092, 753][i] } })),
    max: 2100, unit: '', ticks: [0, 750, 1500, 2100], digits: 0,
  });
  if (el('dreamerBars')) StatsChart.bars(el('dreamerBars'), {
    series: [{ id: 's', label: 'средний счёт по 20 задачам', color: 'var(--classic)' }],
    groups: [{ label: 'A3C, 10⁸ шагов', values: { s: 243.70 } }, { label: 'D4PG, 10⁸ шагов', values: { s: 786.32 } }, { label: 'PlaNet, 5 × 10⁶', values: { s: 332.97 } }, { label: 'Dreamer, 5 × 10⁶', values: { s: 823.39 } }],
    max: 1000, unit: '', ticks: [0, 250, 500, 750, 1000], digits: 0,
  });
  if (el('v3Bars')) StatsChart.bars(el('v3Bars'), {
    series: [{ id: 's', label: 'средний счёт по 20 задачам', color: 'var(--classic)' }],
    groups: [{ label: 'PPO', values: { s: 206 } }, { label: 'SAC', values: { s: 226 } }, { label: 'CURL', values: { s: 525 } }, { label: 'DrQ-v2', values: { s: 705 } }, { label: 'Dreamer\u00ADV3', values: { s: 786 } }],
    max: 1000, unit: '', ticks: [0, 250, 500, 750, 1000], digits: 0,
  });
  if (el('a1Bars')) StatsChart.bars(el('a1Bars'), {
    series: [{ id: 'm', label: 'A1: минут с начала обучения', color: 'var(--classic)' }],
    groups: [{ label: 'перевернулся', values: { m: 5 } }, { label: 'встал', values: { m: 25 } }, { label: 'пошёл', values: { m: 60 } }, { label: 'держит толчки', values: { m: 70 } }],
    max: 80, unit: '', ticks: [0, 20, 40, 60, 80], digits: 0,
  });
  if (el('hoursBars')) StatsChart.bars(el('hoursBars'), {
    series: [{ id: 'h', label: 'часов обучения на роботе', color: 'var(--hybrid)' }],
    groups: [{ label: 'A1, ходьба', values: { h: 1 } }, { label: 'UR5, шарики', values: { h: 8 } }, { label: 'XArm, мягкий предмет', values: { h: 10 } }, { label: 'Sphero, к цели', values: { h: 2 } }],
    max: 10, unit: '', ticks: [0, 5, 10], digits: 0,
  });
  if (el('tdBars')) StatsChart.bars(el('tdBars'), {
    series: [{ id: 's', label: 'нормированный счёт на 80 задачах', color: 'var(--classic)' }],
    groups: [{ label: '1 млн', values: { s: 16.0 } }, { label: '5 млн', values: { s: 49.5 } }, { label: '19 млн', values: { s: 57.1 } }, { label: '48 млн', values: { s: 68.0 } }, { label: '317 млн', values: { s: 70.6 } }],
    max: 80, unit: '', ticks: [0, 20, 40, 60, 80], digits: 1,
  });
  if (el('d4Bars')) StatsChart.bars(el('d4Bars'), {
    series: [{ id: 'bc', label: 'агент повторяет игроков', color: 'var(--classic)' }, { id: 'rl', label: 'после обучения в воображении', color: 'var(--e2e)' }],
    groups: [['каменная кирка', 89.4, 90.1], ['железная руда', 62.9, 66.7], ['печь', 51.1, 58.1], ['железный слиток', 27.8, 39.5], ['железная кирка', 16.9, 29.0], ['алмаз', 0.0, 0.7]].map(([label, bc, rl]) => ({ label, values: { bc, rl } })),
    max: 100, unit: '', ticks: [0, 25, 50, 75, 100], digits: 1,
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
const QUIZ = [
  { q: 'Модель мира — это физический симулятор, только на нейросети?', o: ['Да: она считает те же законы механики, только быстрее', 'Нет: её учат по записям, и она знает только то, что в записях было; DayDreamer вообще обходится без симулятора', 'Нет: модель мира — это просто политика, которая видит будущее'], a: 1, e: 'Симулятор урока 4.5 считает законы механики, заложенные инженерами. Модель мира Ады не знала, что чашка опрокидывается от быстрого удара, потому что в записях такого не было ни разу.' },
  { q: 'Модель точно предсказывает один шаг. Можно ли верить ей на сотни шагов вперёд?', o: ['Нет: прогон строится из её собственных предсказаний, и ошибка накапливается с горизонтом, быстрее всего там, где нет записей', 'Да: если ошибка шага мала, малы и ошибки длинного прогона', 'Да, если модель большая'], a: 0, e: 'Авторы PlaNet называют накопление ошибок многошаговых предсказаний одной из главных трудностей, а в MBPO длинные прогоны учили политику хуже коротких. В лаборатории 1 ошибка шага меньше миллиметра, а за десяток шагов быстрого толчка воображение уходит на сантиметры.' },
  { q: 'Политика, которая побеждает в воображении модели, победит и в настоящей игре?', o: ['Да: модель для того и учится, чтобы её счёт совпадал с настоящим', 'Не обязательно, но счёт в воображении всегда ниже настоящего', 'Нет: политика находит места, где модель ошибается в её пользу'], a: 2, e: 'У Ha и Schmidhuber при самой уверенной модели агент почти всегда побеждал в воображении, а в настоящей игре держался меньше случайной политики. В лаборатории 2 модель обещала Аде почти сплошной успех, а на столе чашки опрокидывались.' },
  { q: 'Чем увереннее и спокойнее модель мира, тем лучше политика из воображения переносится в настоящую среду?', o: ['Да: шум модели только мешает учиться', 'Нет: у Ha и Schmidhuber лучший перенос был при повышенной температуре модели, хотя счёт в воображении там ниже, а слишком большой шум снова мешает', 'Это зависит только от размера контроллера'], a: 1, e: 'Агент, который выжил в более трудной воображаемой игре, лучше играет и в настоящую. Уверенная модель позволяет политике выучить лазейку, которой в настоящей игре нет.' },
  { q: 'Модель мира нужна только для планирования, а политику всё равно учат на настоящих шагах?', o: ['Да: в воображении учиться нельзя', 'Да, кроме игр', 'Нет: Dreamer учит актора и критика целиком на прогонах в воображении, а настоящие шаги идут на обучение модели'], a: 2, e: 'У DreamerV2 воображаемых состояний было в 10 000 раз больше, чем настоящих кадров. Настоящий опыт нужен, чтобы учить модель и поправлять её там, куда ходит политика.' },
  { q: 'Обучение с моделью мира всегда экономнее безмодельного?', o: ['Нет: на Sphero DayDreamer не обошёл безмодельный DrQv2, а авторы TD-MPC2 замечают, что DreamerV3 плохо справляется с тонкой манипуляцией', 'Да: модель всегда экономит шаги', 'Да, если ансамбль большой'], a: 0, e: 'На DeepMind Control и Atari выигрыш большой, но не везде. Модель приходится учить, и если она не ухватывает того, что важно для задачи, политика из воображения проигрывает.' },
  { q: 'Без восстановления кадра модель мира не выучить?', o: ['Да: иначе модели нечему учиться', 'Нет: MuZero и TD-MPC2 предсказывают только награду, ценность и следующее скрытое состояние, хотя самому Dreamer восстановление кадра нужно', 'Нет, но тогда модель не умеет планировать'], a: 1, e: 'MuZero сыграл в го, шахматы и сёги на уровне AlphaZero, не восстанавливая ни одной позиции, а TD-MPC2 планирует без декодера. А DreamerV2 без градиентов от реконструкции кадра почти ничему не учился.' },
  { q: 'Пять сетей ансамбля предсказывают одно и то же. Значит, воображению можно верить?', o: ['Да: согласие сетей значит, что модель знает', 'Нет: события, которого не было ни в одной записи, не ждёт ни одна сеть, и все ошибаются одинаково', 'Согласие сетей вообще ничего не говорит'], a: 1, e: 'Разброс ансамбля растёт там, где движение непохоже на записи, как в уроке 1.2 и в MBPO. Но в лаборатории 1 на первых шагах быстрого толчка все пять сетей согласно везли чашку дальше, а настоящая уже опрокинулась.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('night', initNight);
    safe('stats', initStats);
    safe('dream', () => { mis.dream = DreamLab.init(); });
    safe('holes', () => { mis.holes = HolesLab.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['dMis', 'hMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l71 = { mis, Dream, DreamLab, Holes, HolesLab, Models, L71, QUIZ, SEED, NREC };
    window.__lessonReady = true;
    // модель мира для лабораторий учится сразу, кусками между кадрами
    Dream.ensure(NREC).then(() => { Dream.draw(); window.__modelReady = true; }).catch((e) => console.error(e));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
