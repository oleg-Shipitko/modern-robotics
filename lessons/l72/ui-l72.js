/* =====================================================================
   ui-l72.js — урок 7.2 «JEPA и V-JEPA 2».
   0) анимированные схемы: `jepa` — модель кадров против JEPA на кадрах камеры
      Ады (что с чем сравнивается и куда не идёт градиент); `vjac` — цикл
      планирования V-JEPA 2-AC по картинке-цели (пикселей в цикле нет);
   1) лаборатория 1 «Обманчивая кривая»: маленькая JEPA учится в браузере,
      кривая функции потерь рядом с прибором «что знает модель» (разброс
      представлений, карта представлений и линейный щуп «где чашка»);
   2) лаборатория 2 «Веер воображаемых будущих»: две Ады рядом ставят
      чашку по фотографии хозяйки, CEM по толчкам с расстоянием до цели
      в пикселях или в пространстве представлений (модели вшиты из Node);
   3) диаграммы чисел из статей (shared/stats-chart.js) и квиз.
   Мир и физика — l71/engine.js (L71) и l72/engine.js (L72), стол рисует
   l71/table-draw.js (TableDraw).
   ===================================================================== */
'use strict';

function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    let cur = ids[0];
    for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
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
const pl = (n, a, b, c) => plural(Math.round(Math.abs(n)), a, b, c);

/* =====================================================================
   0а. Схема `jepa`: модель кадров и JEPA на одних и тех же кадрах.
   Верхняя дорожка — модель кадров: кадр → энкодер → шаг по толчку → декодер → предсказанный кадр,
   ошибка по всем пикселям с настоящим кадром. Нижняя — JEPA: кадр → энкодер → предиктор → предсказанное
   представление, ошибка по числам представления с выходом целевого энкодера; через целевой энкодер градиент
   не идёт, его веса — скользящее среднее весов энкодера. Цикл 8 с: 4 с подсвечена верхняя дорожка, 4 с — нижняя.
   Синий сплошной — настоящее (кадры и толчок), оранжевый пунктир — то, что предсказывает модель (метка части 7),
   красный — ошибка.
   ===================================================================== */
const SchemeKit = (() => {
  /** Блок схемы: скруглённый прямоугольник, заголовок и подпись. kind: 'real' | 'imag' | 'net' | 'err' | 'off'. */
  function block(c, k, A, P, x, y, w, h, t1, t2, kind, on, px) {
    const col = kind === 'real' ? P.out : kind === 'imag' ? P.mot : kind === 'err' ? P.bad : P.ink2;
    c.save(); c.globalAlpha = on ? 1 : 0.36;
    if (kind === 'imag') c.setLineDash([5, 4]);
    A.rect(c, x, y, w, h, 8, A.alpha(kind === 'net' ? P.ink3 : col, kind === 'net' ? 0.08 : 0.11), A.alpha(col, 0.85), on ? 1.8 : 1.3);
    c.setLineDash([]);
    A.lab(c, k, t1, x + w / 2, y + (t2 ? h / 2 - 7 : h / 2), { px: px || 11.5, weight: 700, color: kind === 'net' ? P.ink : col, halo: false });
    if (t2) A.lab(c, k, t2, x + w / 2, y + h / 2 + 8, { px: 10, weight: 600, color: P.ink2, halo: false });
    c.restore();
  }
  /** Стрелка по ломаной с бегущей точкой; dashed — предсказание модели. */
  function flow(c, A, P, pts, col, on, u, dashed) {
    c.save(); c.globalAlpha = on ? 1 : 0.28;
    A.line(c, pts, A.alpha(col, 0.8), 1.6, dashed ? [5, 4] : null);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    A.arrow(c, a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, b[0], b[1], A.alpha(col, 0.9), 1.6, 6);
    if (on && u != null) {
      let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
      let s = (((u % 1) + 1) % 1) * L, i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const f = seg[i] ? s / seg[i] : 0, px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
      A.circle(c, px, py, 3.4, col, null);
    }
    c.restore();
  }
  function legend(c, k, A, P, x, y, items, gap) {
    let lx = x;
    for (const [col, dash, txt] of items) {
      A.line(c, [[lx, y], [lx + 18, y]], col, 2.2, dash ? [5, 3] : null);
      A.lab(c, k, txt, lx + 24, y, { px: 10, weight: 600, color: P.ink2, halo: false, align: 'left' });
      HeroKit.font(c, k, 10, 600); lx += 24 + c.measureText(txt).width + (gap || 20);
    }
  }
  return { block, flow, legend };
})();

(() => {
  const T = 8, { block, flow, legend } = SchemeKit;
  function drawWide(c, k, t, P, A) {
    const u = ((t % T) + T) % T, top = u < T / 2, ph = (u % (T / 2)) / (T / 2);
    const xs = [6, 150, 294, 438, 582], bw = 132, bh = 42;
    // модель кадров
    let y1 = 30, y2 = 96;
    A.lab(c, k, 'модель кадров: учится восстанавливать кадр', 6, 14, { px: 11.5, weight: 750, color: top ? P.ink : P.ink3, halo: false, align: 'left' });
    block(c, k, A, P, xs[0], y1, bw, bh, 'кадр сейчас', '16 × 16, настоящий', 'real', top);
    block(c, k, A, P, xs[1], y1, bw, bh, 'энкодер', 'кадр → h', 'net', top);
    block(c, k, A, P, xs[2], y1, bw, bh, 'шаг модели', 'h и толчок → h′', 'net', top);
    block(c, k, A, P, xs[3], y1, bw, bh, 'декодер', 'h′ → кадр', 'net', top);
    block(c, k, A, P, xs[4], y1, bw, bh, 'кадр после', 'предсказанный', 'imag', top);
    block(c, k, A, P, xs[2], y2, bw, bh, 'толчок', 'сдвиг чашки', 'real', top);
    block(c, k, A, P, xs[3], y2, bw, bh, 'ошибка', 'по 768 числам', 'err', top);
    block(c, k, A, P, xs[4], y2, bw, bh, 'кадр после', 'настоящий', 'real', top);
    const m1 = y1 + bh / 2;
    for (let i = 0; i < 3; i++) flow(c, A, P, [[xs[i] + bw + 2, m1], [xs[i + 1] - 2, m1]], P.out, top, ph * 4 - i, false);
    flow(c, A, P, [[xs[3] + bw + 2, m1], [xs[4] - 2, m1]], P.mot, top, ph * 4 - 3, true);
    flow(c, A, P, [[xs[2] + bw / 2, y2 - 2], [xs[2] + bw / 2, y1 + bh + 2]], P.out, top, ph * 2, false);
    flow(c, A, P, [[xs[4] + 26, y1 + bh + 2], [xs[4] + 26, y1 + bh + 12], [xs[3] + bw - 20, y1 + bh + 12], [xs[3] + bw - 20, y2 - 2]], P.mot, top, ph * 2 - 1, true);
    flow(c, A, P, [[xs[4] - 2, y2 + bh / 2], [xs[3] + bw + 2, y2 + bh / 2]], P.out, top, ph * 2 - 1, false);
    A.lab(c, k, 'в ошибке узор скатерти, свет и чашка', xs[3] + bw / 2, y2 + bh + 13, { px: 10, weight: 600, color: P.ink2, halo: false });
    // JEPA
    const y3 = 206, y4 = 298;
    A.lab(c, k, 'JEPA: учится предсказывать представление', 6, y3 - 30, { px: 11.5, weight: 750, color: !top ? P.ink : P.ink3, halo: false, align: 'left' });
    block(c, k, A, P, xs[0], y3, bw, bh, 'кадр сейчас', '16 × 16, настоящий', 'real', !top);
    block(c, k, A, P, xs[1], y3, bw, bh, 'энкодер', 'кадр → z', 'net', !top);
    block(c, k, A, P, xs[2], y3, bw, bh, 'предиктор', 'z и толчок → z′', 'net', !top);
    block(c, k, A, P, xs[3], y3, bw, bh, 'представление', 'предсказанное', 'imag', !top);
    block(c, k, A, P, xs[4], y3, bw, bh, 'целевой энкодер', 'кадр → z′', 'net', !top);
    block(c, k, A, P, xs[2], y4, bw, bh, 'толчок', 'сдвиг чашки', 'real', !top);
    block(c, k, A, P, xs[3], y4, bw, bh, 'ошибка', 'по 8 числам', 'err', !top);
    block(c, k, A, P, xs[4], y4, bw, bh, 'кадр после', 'настоящий', 'real', !top);
    const m3 = y3 + bh / 2;
    for (let i = 0; i < 2; i++) flow(c, A, P, [[xs[i] + bw + 2, m3], [xs[i + 1] - 2, m3]], P.out, !top, ph * 4 - i, false);
    flow(c, A, P, [[xs[2] + bw + 2, m3], [xs[3] - 2, m3]], P.mot, !top, ph * 4 - 2, true);
    flow(c, A, P, [[xs[2] + bw / 2, y4 - 2], [xs[2] + bw / 2, y3 + bh + 2]], P.out, !top, ph * 2, false);
    flow(c, A, P, [[xs[3] + bw / 2, y3 + bh + 2], [xs[3] + bw / 2, y4 - 2]], P.mot, !top, ph * 2 - 1, true);
    flow(c, A, P, [[xs[4] + bw / 2, y4 - 2], [xs[4] + bw / 2, y3 + bh + 2]], P.out, !top, ph * 2, false);
    flow(c, A, P, [[xs[4] + 18, y3 + bh + 2], [xs[4] + 18, y3 + bh + 16], [xs[3] + bw - 14, y3 + bh + 16], [xs[3] + bw - 14, y4 - 2]], P.out, !top, ph * 2 - 1, false);
    // градиент не идёт: крест на стрелке от целевого энкодера
    c.save(); c.globalAlpha = !top ? 1 : 0.36;
    const cx = xs[4] + 4, cy = y3 + bh + 16; A.line(c, [[cx - 5, cy - 5], [cx + 5, cy + 5]], P.bad, 2.2); A.line(c, [[cx - 5, cy + 5], [cx + 5, cy - 5]], P.bad, 2.2);
    A.lab(c, k, 'градиент не идёт', cx - 4, cy + 15, { px: 10, weight: 650, color: P.bad, halo: false, align: 'right' });
    // скользящее среднее весов: пунктир от энкодера к целевому энкодеру поверх дорожки
    A.line(c, [[xs[1] + bw / 2, y3 - 2], [xs[1] + bw / 2, y3 - 12], [xs[4] + bw / 2, y3 - 12], [xs[4] + bw / 2, y3 - 2]], A.alpha(P.ink3, 0.9), 1.4, [2, 3]);
    A.lab(c, k, 'веса целевого энкодера — скользящее среднее весов энкодера', (xs[1] + xs[4] + bw) / 2, y3 - 12, { px: 10, weight: 600, color: P.ink2 });
    c.restore();
    legend(c, k, A, P, 6, 388, [[P.out, false, 'настоящее: кадры и толчок'], [P.mot, true, 'предсказание модели'], [P.bad, false, 'ошибка, по которой модель учится']]);
  }
  function drawNarrow(c, k, t, P, A) {
    const u = ((t % T) + T) % T, top = u < T / 2, ph = (u % (T / 2)) / (T / 2);
    const x = 30, w = 300, bh = 34, g = 12;
    const lane = (y0, on, title, rows, errTxt, note) => {
      A.lab(c, k, title, 12, y0, { px: 11.5, weight: 750, color: on ? P.ink : P.ink3, halo: false, align: 'left' });
      let y = y0 + 14;
      rows.forEach((r, i) => {
        block(c, k, A, P, x, y, w, bh, r[0], r[1], r[2], on, 11);
        flow(c, A, P, [[x + w / 2, y + bh + 1], [x + w / 2, y + bh + g - 1]], r[3] || P.out, on, ph * rows.length - i, !!r[4]);
        y += bh + g;
      });
      block(c, k, A, P, x, y, w, bh, 'ошибка', errTxt, 'err', on, 11); y += bh;
      A.lab(c, k, note, 180, y + 12, { px: 10, weight: 600, color: P.ink2, halo: false }); return y + 26;
    };
    let y = lane(14, top, 'модель кадров', [['кадр сейчас', '16 × 16, настоящий', 'real'], ['энкодер', 'кадр → h', 'net'], ['шаг модели', 'h и толчок → h′', 'net'], ['декодер', 'h′ → кадр', 'net', P.mot, true], ['кадр после, предсказанный', 'сравнивается с настоящим кадром', 'imag', P.mot, true]], 'по 768 числам', 'в ошибке узор скатерти, свет и чашка');
    y += 10;
    y = lane(y, !top, 'JEPA', [['кадр сейчас', '16 × 16, настоящий', 'real'], ['энкодер', 'кадр → z', 'net'], ['предиктор', 'z и толчок → z′', 'net', P.mot, true], ['представление, предсказанное', 'сравнивается с целью', 'imag', P.mot, true]], 'по 8 числам', 'цель: целевой энкодер по кадру после');
    c.save(); c.globalAlpha = !top ? 1 : 0.36;
    block(c, k, A, P, x, y, w, 40, 'целевой энкодер', 'веса — скользящее среднее весов', 'net', !top, 11);
    A.lab(c, k, 'градиент через него не идёт', 180, y + 54, { px: 10, weight: 650, color: P.bad, halo: false });
    c.restore();
    y += 76;
    legend(c, k, A, P, 12, y, [[P.out, false, 'настоящее'], [P.mot, true, 'предсказание'], [P.bad, false, 'ошибка']], 14);
  }
  Anim.add('jepa', { W: 720, H: 400, start: 1.2, narrowAt: 680, draw: drawWide, narrow: { W: 360, H: 680, draw: drawNarrow } });
})();

/* =====================================================================
   0б. Схема `vjac`: цикл планирования V-JEPA 2-AC по картинке-цели.
   Кадр сейчас и картинка-цель проходят через один и тот же замороженный энкодер; предиктор по представлению
   сейчас воображает представления после каждого кандидата действий; расстояние до представления цели оценивает
   кандидатов; CEM строит по лучшим новое распределение и повторяет; робот исполняет первое действие, новый кадр —
   и всё сначала. Фазы цикла 9 с: кодирование (0–2 с), итерации CEM (2–6 с), действие и новый кадр (6–9 с).
   ===================================================================== */
(() => {
  const T = 9, { block, flow, legend } = SchemeKit;
  /** Веер воображаемых представлений: n точек, которые к концу итераций сходятся к лучшему. */
  function fan(c, A, P, cx, cy, rx, ry, it, on) {
    const n = 11, conv = 1 - Math.min(1, Math.max(0, it - 1) / 9) * 0.8;
    c.save(); c.globalAlpha = on ? 1 : 0.35;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = Math.sqrt((i + 0.5) / n) * conv;
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r, best = i < 2;
      A.circle(c, x, y, best ? 6 : 4.5, A.alpha(P.mot, best ? 0.45 : 0.18), A.alpha(P.mot, 0.9), best ? 2 : 1.3);
    }
    c.restore();
  }
  function drawWide(c, k, t, P, A) {
    const u = ((t % T) + T) % T, enc = u < 2, cem = u >= 2 && u < 6, act = u >= 6, it = cem ? Math.floor((u - 2) / 0.4) + 1 : act ? 10 : 0;
    const bh = 42;
    // кадр сейчас и картинка-цель → замороженный энкодер → представления
    block(c, k, A, P, 22, 26, 114, bh, 'кадр сейчас', 'камера робота', 'real', enc || act);
    block(c, k, A, P, 22, 128, 114, bh, 'картинка-цель', 'снимок сцены', 'real', enc);
    block(c, k, A, P, 160, 26, 118, bh, 'энкодер', 'заморожен', 'net', enc);
    block(c, k, A, P, 160, 128, 118, bh, 'энкодер', 'тот же', 'net', enc);
    block(c, k, A, P, 304, 26, 118, bh, 'z сейчас', 'представление', 'real', enc || cem);
    block(c, k, A, P, 304, 128, 118, bh, 'z цели', 'представление', 'real', enc || cem);
    flow(c, A, P, [[136, 47], [158, 47]], P.out, enc, u, false); flow(c, A, P, [[280, 47], [302, 47]], P.out, enc, u - 0.5, false);
    flow(c, A, P, [[136, 149], [158, 149]], P.out, enc, u, false); flow(c, A, P, [[280, 149], [302, 149]], P.out, enc, u - 0.5, false);
    // предиктор и веер воображаемых представлений
    block(c, k, A, P, 450, 26, 118, bh, 'предиктор', 'z и действие → z′', 'net', cem);
    flow(c, A, P, [[424, 47], [448, 47]], P.out, cem, u * 2, false);
    c.save(); c.globalAlpha = cem ? 1 : 0.36; c.setLineDash([5, 4]);
    A.rect(c, 594, 12, 120, 98, 8, A.alpha(P.mot, 0.08), A.alpha(P.mot, 0.85), 1.4); c.setLineDash([]); c.restore();
    A.lab(c, k, 'z′ кандидатов', 654, 98, { px: 10, weight: 650, color: P.mot, halo: false });
    fan(c, A, P, 654, 52, 46, 26, it, cem);
    flow(c, A, P, [[570, 47], [592, 47]], P.mot, cem, u * 2, true);
    // расстояние до цели
    block(c, k, A, P, 594, 128, 120, bh, 'расстояние', 'до z цели', 'err', cem);
    flow(c, A, P, [[654, 112], [654, 126]], P.mot, cem, u * 2, true);
    flow(c, A, P, [[424, 149], [592, 149]], P.out, cem, u * 1.5, false);
    // CEM
    block(c, k, A, P, 450, 214, 264, bh, 'CEM: 10 лучших → новое распределение', cem ? `итерация ${Math.min(10, it)} из 10` : '10 итераций', 'net', cem, 11);
    flow(c, A, P, [[654, 172], [654, 212]], P.ink3, cem, u * 2, false);
    flow(c, A, P, [[470, 212], [470, 194], [509, 194], [509, 70]], P.ink3, cem, u * 2, false);
    A.lab(c, k, 'кандидаты действий', 438, 186, { px: 10, weight: 600, color: P.ink2, halo: false, align: 'right' });
    // первое действие и новый кадр
    block(c, k, A, P, 450, 304, 264, bh, 'первое действие', 'исполняет робот', 'real', act);
    flow(c, A, P, [[582, 258], [582, 302]], P.out, act, u, false);
    block(c, k, A, P, 160, 304, 262, bh, 'рука двигается', 'камера снимает новый кадр', 'real', act);
    flow(c, A, P, [[448, 325], [424, 325]], P.out, act, u, false);
    flow(c, A, P, [[158, 325], [10, 325], [10, 47], [20, 47]], P.out, act, u - 0.3, false);
    A.lab(c, k, 'пикселей в цикле нет: сравниваются только представления', 360, 268, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    legend(c, k, A, P, 22, 384, [[P.out, false, 'настоящее: кадры и действие'], [P.mot, true, 'воображение предиктора'], [P.bad, false, 'расстояние до цели']]);
  }
  function drawNarrow(c, k, t, P, A) {
    const u = ((t % T) + T) % T, enc = u < 2, cem = u >= 2 && u < 6, act = u >= 6, it = cem ? Math.floor((u - 2) / 0.4) + 1 : act ? 10 : 0;
    const bh = 36, g = 12, X = 40, Wd = 304, half = 146;
    let y = 12;
    block(c, k, A, P, X, y, half, bh, 'кадр сейчас', 'камера', 'real', enc || act, 11);
    block(c, k, A, P, X + half + 12, y, half, bh, 'картинка-цель', 'снимок', 'real', enc, 11);
    flow(c, A, P, [[X + half / 2, y + bh + 1], [X + half / 2, y + bh + g - 1]], P.out, enc, u, false);
    flow(c, A, P, [[X + half * 1.5 + 12, y + bh + 1], [X + half * 1.5 + 12, y + bh + g - 1]], P.out, enc, u, false);
    y += bh + g;
    block(c, k, A, P, X, y, Wd, bh, 'энкодер', 'заморожен, один для обоих кадров', 'net', enc, 11);
    flow(c, A, P, [[X + half / 2, y + bh + 1], [X + half / 2, y + bh + g - 1]], P.out, enc, u, false);
    flow(c, A, P, [[X + half * 1.5 + 12, y + bh + 1], [X + half * 1.5 + 12, y + bh + g - 1]], P.out, enc, u, false);
    y += bh + g;
    block(c, k, A, P, X, y, half, bh, 'z сейчас', 'представление', 'real', enc || cem, 11);
    block(c, k, A, P, X + half + 12, y, half, bh, 'z цели', 'представление', 'real', enc || cem, 11);
    const yGoal = y;
    flow(c, A, P, [[X + half / 2, y + bh + 1], [X + half / 2, y + bh + g - 1]], P.out, cem, u * 2, false);
    y += bh + g;
    block(c, k, A, P, X, y, Wd, bh, 'предиктор', 'z и кандидат действий → z′', 'net', cem, 11);
    flow(c, A, P, [[X + Wd / 2, y + bh + 1], [X + Wd / 2, y + bh + g - 1]], P.mot, cem, u * 2, true);
    y += bh + g;
    c.save(); c.globalAlpha = cem ? 1 : 0.36; c.setLineDash([5, 4]); A.rect(c, X, y, Wd, 64, 8, A.alpha(P.mot, 0.08), A.alpha(P.mot, 0.85), 1.4); c.setLineDash([]); c.restore();
    fan(c, A, P, X + Wd / 2, y + 26, 90, 16, it, cem);
    A.lab(c, k, 'z′ кандидатов', X + Wd / 2, y + 56, { px: 10, weight: 650, color: P.mot, halo: false });
    flow(c, A, P, [[X + Wd / 2, y + 65], [X + Wd / 2, y + 64 + g - 1]], P.mot, cem, u * 2, true);
    y += 64 + g;
    block(c, k, A, P, X, y, Wd, bh, 'расстояние до z цели', 'для каждого кандидата', 'err', cem, 11);
    flow(c, A, P, [[X + half * 1.5 + 12, yGoal + bh + 1], [X + Wd + 16, yGoal + bh + 10], [X + Wd + 16, y + bh / 2], [X + Wd + 2, y + bh / 2]], P.out, cem, u * 1.5, false);
    flow(c, A, P, [[X + Wd / 2, y + bh + 1], [X + Wd / 2, y + bh + g - 1]], P.ink3, cem, u * 2, false);
    y += bh + g;
    block(c, k, A, P, X, y, Wd, bh, 'CEM: лучшие → новое распределение', cem ? `итерация ${Math.min(10, it)} из 10` : '10 итераций', 'net', cem, 11);
    flow(c, A, P, [[X + Wd / 2, y + bh + 1], [X + Wd / 2, y + bh + g - 1]], P.out, act, u, false);
    y += bh + g;
    block(c, k, A, P, X, y, Wd, bh, 'первое действие', 'робот двигает рукой', 'real', act, 11);
    flow(c, A, P, [[X - 2, y + bh / 2], [X - 22, y + bh / 2], [X - 22, 30], [X - 2, 30]], P.out, act, u - 0.3, false);
    y += bh + 16;
    A.lab(c, k, 'пикселей в цикле нет', 180, y, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    y += 20;
    legend(c, k, A, P, 12, y, [[P.out, false, 'настоящее'], [P.mot, true, 'воображение'], [P.bad, false, 'расстояние']], 14);
  }
  Anim.add('vjac', { W: 720, H: 400, start: 3.1, narrowAt: 680, draw: drawWide, narrow: { W: 360, H: 462, draw: drawNarrow } });
})();

/* =====================================================================
   1. Лаборатория 1 «Обманчивая кривая»: маленькая JEPA учится в браузере.
   Записи толчков (L72.pushRecords) → нормировка → обучение (L72.trainJepa, генератор кусками) → приборы:
   кривая функции потерь и «что знает модель»: разброс представлений, карта представлений (две главные оси)
   и линейный щуп «где чашка» (L72.fitProbe). Те же числа считает тест в Node (tools/lesson72.js).
   ===================================================================== */
const LAB1 = L72.LAB1, lab1Opts = L72.lab1Opts;
const Collapse = (() => {
  const E = L72;
  const st = { prot: 'none', light: 'same', inv: false, mom: 0.95, vr: 5, busy: false, prog: 0, runs: [], cur: null, know: null, last: null, slowSeen: null, fixSeen: null };
  let cvL = null, cvK = null, ctl = null;
  const dataset = (light) => E.lab1Data(light), knowledge = (M, set, withMap) => E.knowledge(M, set, withMap);
  const label = (cfg) => (cfg.prot === 'none' ? 'без защиты' : cfg.prot === 'ema' ? `скользящее среднее ${fmt(cfg.mom, cfg.mom === 0.999 ? 3 : 2)}` : `штраф ${cfg.vr}`) + (cfg.inv ? ' + толчок' : '') + (cfg.light === 'tint' ? ', свет меняется' : '');
  /** Обучение с текущими ручками (кусками между кадрами). Возвращает итог запуска. */
  async function run() {
    const cfg = { prot: st.prot, light: st.light, inv: st.inv, mom: st.mom, vr: st.vr };
    st.busy = true; st.prog = 0; st.know = null; draw();
    await new Promise((r) => setTimeout(r, 0));
    const set = dataset(cfg.light), M = E.jepa({ D: LAB1.D, H: LAB1.H, seed: LAB1.seed });
    const cur = { cfg, label: label(cfg), pts: [] }; st.cur = cur;
    const t0 = performance.now();
    await runChunked(E.trainJepa(M, set.train, lab1Opts(cfg)), (ev) => {
      cur.pts.push([ev.step, ev.loss]); st.prog = ev.step / ev.steps;
      if (ev.step % 100 === 0 && ev.step < ev.steps) st.know = knowledge(M, set, true);
      if (!window.__noAnim || ev.step === ev.steps) draw();
    }, 14);
    const ms = performance.now() - t0;
    const k = knowledge(M, set, true); st.know = k;
    const tail = cur.pts.filter((p) => p[0] > 0.9 * LAB1.steps), lossEnd = tail.reduce((a, p) => a + p[1], 0) / tail.length;
    const r = { cfg, label: cur.label, loss0: cur.pts[0][1], loss: lossEnd, spread: k.spread, hit: k.hit, err: k.err, base: set.base, ms, steps: LAB1.steps };
    cur.res = r; st.runs.push(cur); if (st.runs.length > 5) st.runs.shift(); st.cur = null; st.last = r;
    if (cfg.light === 'tint' && !cfg.inv && r.spread >= 0.5 && r.err > 0.15) st.slowSeen = r;
    if (cfg.light === 'tint' && cfg.inv) st.fixSeen = r;
    st.busy = false; draw(); renderRead();
    return r;
  }
  /* ---------- рисование ---------- */
  const C1 = [122, 90, 248], C2 = [46, 158, 106];
  const mix = (u) => { u = Math.max(0, Math.min(1, u)); return `rgb(${Math.round(C1[0] + (C2[0] - C1[0]) * u)},${Math.round(C1[1] + (C2[1] - C1[1]) * u)},${Math.round(C1[2] + (C2[2] - C1[2]) * u)})`; };
  function drawLoss() {
    const narrow = cvL.getBoundingClientRect().width < 520, Wl = narrow ? 360 : 640, Hl = narrow ? 210 : 200;
    const { c, k } = HeroKit.fit(cvL, Wl, Hl), css = HeroKit.css;
    c.clearRect(0, 0, Wl, Hl);
    const x0 = narrow ? 40 : 48, x1 = Wl - 12, y0 = 12, y1 = Hl - 30, LMIN = -3, LMAX = 1;
    const X = (s) => x0 + (x1 - x0) * s / LAB1.steps, Y = (v) => { const l = Math.log10(Math.max(1e-3, Math.min(10, v))); return y1 - (y1 - y0) * (l - LMIN) / (LMAX - LMIN); };
    c.strokeStyle = css('--line'); c.lineWidth = 1;
    for (let e = LMIN; e <= LMAX; e++) { const y = Y(Math.pow(10, e)); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); HeroKit.label(c, k, ['0,001', '0,01', '0,1', '1', '10'][e - LMIN], x0 - 6, y, { px: 10, color: css('--ink-3'), halo: false, align: 'right', mono: true }); }
    for (let q = 0; q <= LAB1.steps; q += 100) HeroKit.label(c, k, String(q), X(q), y1 + 11, { px: 10, color: css('--ink-3'), halo: false, mono: true });
    HeroKit.label(c, k, 'шаг обучения', x1, y1 + 23, { px: 10, color: css('--ink-3'), halo: false, align: 'right' });
    const line = (pts, col, lw, alpha) => { c.save(); c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); c.restore(); };
    const used = [];
    st.runs.forEach((r, i) => {
      const lastRun = !st.cur && i === st.runs.length - 1;
      line(r.pts, lastRun ? css('--e2e') : css('--ink-3'), lastRun ? 2.4 : 1.4, lastRun ? 1 : 0.55);
      const p = r.pts[r.pts.length - 1]; let ly = Y(r.res.loss) - 8; for (const u of used) if (Math.abs(u - ly) < 13) ly = u - 13; used.push(ly);
      HeroKit.label(c, k, r.label, x1 - 2, Math.max(y0 + 6, ly), { px: 10, weight: lastRun ? 700 : 600, color: lastRun ? css('--e2e') : css('--ink-3'), align: 'right' });
    });
    if (st.cur && st.cur.pts.length) line(st.cur.pts, css('--e2e'), 2.4, 1);
    if (!st.runs.length && !st.cur) HeroKit.label(c, k, 'Кривая появится после запуска обучения', (x0 + x1) / 2, (y0 + y1) / 2, { px: 12, weight: 600, color: css('--ink-3') });
    if (st.busy) HeroKit.label(c, k, `обучение: ${Math.round(st.prog * 100)}%`, x0 + 8, y0 + 10, { px: 11, weight: 700, color: css('--e2e'), align: 'left' });
  }
  function drawKnow() {
    const narrow = cvK.getBoundingClientRect().width < 520, Wl = narrow ? 360 : 640, Hl = narrow ? 470 : 290;
    const { c, k } = HeroKit.fit(cvK, Wl, Hl), css = HeroKit.css, kn = st.know;
    c.clearRect(0, 0, Wl, Hl);
    // карта представлений
    const ms = narrow ? 210 : 230, mx0 = narrow ? (Wl - ms) / 2 : 8, my0 = 18, R = 2.6;
    HeroKit.label(c, k, 'карта представлений', mx0 + ms / 2, 8, { px: 10.5, weight: 700, color: css('--ink-2'), halo: false });
    c.fillStyle = css('--surface-2'); c.strokeStyle = css('--line'); c.lineWidth = 1; c.beginPath(); c.roundRect(mx0, my0, ms, ms, 8); c.fill(); c.stroke();
    c.strokeStyle = css('--line-2'); c.beginPath(); c.moveTo(mx0 + ms / 2, my0 + 6); c.lineTo(mx0 + ms / 2, my0 + ms - 6); c.moveTo(mx0 + 6, my0 + ms / 2); c.lineTo(mx0 + ms - 6, my0 + ms / 2); c.stroke();
    if (kn && kn.map) for (const p of kn.map) {
      const x = mx0 + ms / 2 + Math.max(-1, Math.min(1, p.x / R)) * (ms / 2 - 8), y = my0 + ms / 2 - Math.max(-1, Math.min(1, p.y / R)) * (ms / 2 - 8);
      c.fillStyle = mix((p.cx - 0.08) / 0.74); c.globalAlpha = 0.85; c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill(); c.globalAlpha = 1;
    } else HeroKit.label(c, k, 'точки появятся при обучении', mx0 + ms / 2, my0 + ms / 2, { px: 11, color: css('--ink-3'), halo: false });
    HeroKit.label(c, k, 'чашка у левого края', mx0 + 8, my0 + ms + 12, { px: 10, color: `rgb(${C1})`, halo: false, align: 'left', weight: 650 });
    HeroKit.label(c, k, 'у правого', mx0 + ms - 8, my0 + ms + 12, { px: 10, color: `rgb(${C2})`, halo: false, align: 'right', weight: 650 });
    // стол сверху: где чашка и где её ищет щуп
    const T = L72.L71.TABLE, tw = narrow ? 330 : 360, th = tw * T.H / T.W, tx0 = narrow ? (Wl - tw) / 2 : Wl - tw - 8, ty0 = narrow ? my0 + ms + 40 : my0 + 4;
    HeroKit.label(c, k, 'щуп ищет чашку: вид на стол сверху', tx0 + tw / 2, ty0 - (narrow ? 10 : 12), { px: 10.5, weight: 700, color: css('--ink-2'), halo: false });
    const TX = (x) => tx0 + x / T.W * tw, TY = (y) => ty0 + y / T.H * th;
    c.fillStyle = HeroKit.dark() ? '#3a352d' : '#efe7d9'; c.strokeStyle = css('--line-2'); c.beginPath(); c.roundRect(tx0, ty0, tw, th, 6); c.fill(); c.stroke();
    if (kn) for (const q of kn.pts) {
      const px = Math.max(-0.05, Math.min(T.W + 0.05, q.p[0])), py = Math.max(-0.05, Math.min(T.H + 0.05, q.p[1]));
      c.strokeStyle = css('--ink-3'); c.globalAlpha = 0.6; c.lineWidth = 1; c.beginPath(); c.moveTo(TX(q.c[0]), TY(q.c[1])); c.lineTo(TX(px), TY(py)); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = css('--classic'); c.beginPath(); c.arc(TX(q.c[0]), TY(q.c[1]), 3, 0, 7); c.fill();
      c.strokeStyle = css('--e2e'); c.lineWidth = 1.6; c.setLineDash([3, 2]); c.beginPath(); c.arc(TX(px), TY(py), LAB1.hit / T.W * tw, 0, 7); c.stroke(); c.setLineDash([]);
    }
  }
  function draw() { if (cvL) drawLoss(); if (cvK) drawKnow(); const r = st.cur ? null : st.runs[st.runs.length - 1];
    setOut($('#clLossNow'), st.cur && st.cur.pts.length ? fmt(st.cur.pts[st.cur.pts.length - 1][1], 4) : r ? fmt(r.res.loss, 4) : '—');
    setOut($('#clKnowNow'), st.know ? `разброс ${fmt(st.know.spread, 2)} · в чашку ${Math.round(st.know.hit * 100)}% · ${fmt(st.know.err * 100, 1)} см` : '—'); }
  function renderRead() {
    const r = st.last; if (!r) { setOut($('#clRead'), 'Выбери защиту и запусти обучение кнопкой в задании.'); return; }
    setOut($('#clRead'), `<b>${r.label}.</b> Функция потерь к концу ${fmt(r.loss, 4)} (в начале ${fmt(r.loss0, 3)}). Разброс представлений ${fmt(r.spread, 2)}. Щуп попадает в чашку в ${Math.round(r.hit * 100)}% кадров и ошибается в среднем на ${fmt(r.err * 100, 1)} см; щуп, который всегда называет середину стола, ошибся бы на ${fmt(r.base * 100, 1)} см. Обучение заняло ${fmt(r.ms / 1000, 1)} с.`);
  }
  function drawFrames() {
    const box = $('#clFrames'); if (!box) return;
    const set = dataset(st.light), pick = [0, 7, 14, 40, 63, 90];
    if (box.dataset.light === st.light) return; box.dataset.light = st.light; box.innerHTML = '';
    const cap = h('div', { class: 'cl-fcap' }, st.light === 'tint' ? 'Кадры шести записей: у каждой записи свой свет' : 'Кадры шести записей: что видит модель, 16 × 16');
    const row = h('div', { class: 'cl-frow' });
    for (const i of pick) { const cv = h('canvas', { width: 16, height: 16, role: 'img', 'aria-label': 'Кадр камеры 16 на 16 пикселей: вид на стол сверху с чашкой' }); TableDraw.camera(cv, set.train[i].x0, 16, 16); row.append(cv); }
    box.append(cap, row);
  }
  function state() { return { prot: st.prot, light: st.light, inv: st.inv, busy: st.busy, last: st.last, slowSeen: st.slowSeen, fixSeen: st.fixSeen }; }
  function set(k, v) { st[k] = v; if (k === 'light') drawFrames(); if (ctl) ctl.update(); }
  return { st, LAB1, dataset, knowledge, run, draw, renderRead, drawFrames, state, set, label,
    init(c) { cvL = $('#clLoss'); cvK = $('#clKnow'); ctl = c; draw(); renderRead(); drawFrames(); App.on('theme', draw); App.on('resize', draw); } };
})();

/* ---------- миссии лаборатории 1: ставка → защита на сцене → обучение и два прибора ---------- */
const CollapseLab = (() => {
  const C = Collapse, runAct = { label: 'Обучить модель', run: async () => C.run() };
  const pct = (v) => Math.round(v * 100);
  const missions = [
    { short: 'Коллапс', title: 'Модель без защиты',
      text: 'Сначала без защиты: цель для предиктора выдаёт тот же энкодер, и градиент идёт через обе ветви. Обучи модель и сравни оба прибора: кривую функции потерь и то, что модель знает о чашке.',
      onEnter: () => { C.set('prot', 'none'); segSet('#clProt', 'none'); },
      bet: { q: 'Функция потерь упадёт почти до нуля. Значит ли это, что модель выучила стол?', options: ['да: ошибка предсказания почти нулевая, значит, модель предсказывает каждый толчок', 'нет: энкодер может выдавать всем кадрам одно и то же представление, и тогда предсказывать нечего', 'да, но только середину стола, где толчков было больше всего'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Защиты нет', test: (r) => !!r && r.cfg.prot === 'none' },
        { label: 'Функция потерь к концу меньше 0,01', test: (r) => !!r && r.loss < 0.01 },
        { label: 'Разброс представлений меньше 0,1', test: (r) => !!r && r.spread < 0.1 },
        { label: 'Щуп попадает в чашку реже чем в 10% кадров', test: (r) => !!r && r.hit < 0.1 },
      ],
      summary: (r) => `${r.label}: потеря ${fmt(r.loss, 4)}, разброс ${fmt(r.spread, 2)}, щуп ${pct(r.hit)}%`,
      hint: 'Защита выбирается на сцене. Для этой миссии нужна «нет».',
      fail: (r) => r && r.cfg.prot !== 'none' ? '<b>Включена защита.</b> Выбери «нет» и обучи модель заново.' : '<b>Пока не всё.</b> Обучи модель ещё раз.',
      explain: (r) => `Функция потерь упала с ${fmt(r.loss0, 2)} до ${fmt(r.loss, 4)}, а разброс представлений — до ${fmt(r.spread, 2)}: энкодер выдаёт почти одно и то же представление на любой кадр, и предиктору достаточно его повторить. Щуп ошибается в среднем на ${fmt(r.err * 100, 1)} см, почти как если бы всегда называл середину стола (${fmt(r.base * 100, 1)} см). Это коллапс представлений: по кривой модель идеальна, а о чашке она не знает ничего.` },
    { short: 'Скользящее', title: 'Целевой энкодер со скользящим средним',
      text: 'Включи защиту, как в I-JEPA и V-JEPA: цель выдаёт целевой энкодер, его веса — скользящее среднее весов энкодера с моментом 0,95, и градиент через него не идёт. Обучи модель заново и добейся, чтобы щуп попадал в чашку хотя бы в половине кадров.',
      bet: { q: 'Какой будет функция потерь в конце обучения у модели с целевым энкодером?', options: ['ниже, чем без защиты: защищённая модель учится лучше', 'выше, чем без защиты: модели приходится предсказывать настоящие различия кадров', 'такой же: защита меняет только скорость обучения'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Защита: скользящее среднее', test: (r) => !!r && r.cfg.prot === 'ema' },
        { label: 'Разброс представлений больше 0,5', test: (r) => !!r && r.spread > 0.5 },
        { label: 'Щуп попадает в чашку хотя бы в половине кадров', test: (r) => !!r && r.hit >= 0.5 },
      ],
      summary: (r) => `${r.label}: потеря ${fmt(r.loss, 3)}, разброс ${fmt(r.spread, 2)}, щуп ${pct(r.hit)}%`,
      hint: 'На сцене выбери защиту «скользящее среднее» и обучи модель.',
      fail: (r) => r && r.cfg.prot !== 'ema' ? '<b>Защита не та.</b> Выбери «скользящее среднее».' : `<b>Щуп попадает в чашку в ${pct(r.hit)}% кадров.</b> Обучи модель ещё раз.`,
      explain: (r, ctx) => { const r0 = ctx.results[0]; return `Функция потерь в конце ${fmt(r.loss, 3)}${r0 ? `, в ${fmt(r.loss / r0.loss, 0)} раз выше, чем у модели без защиты` : ''}, а представления разных кадров различаются: разброс ${fmt(r.spread, 2)}. Щуп попадает в чашку в ${pct(r.hit)}% кадров и ошибается в среднем на ${fmt(r.err * 100, 1)} см. По одной кривой лучшей выглядела бы схлопнувшаяся модель, поэтому функцию потерь JEPA всегда проверяют вторым прибором, хотя бы щупом. Почему асимметрия спасает, точно не доказано: авторы V-JEPA объясняют это гипотезой, что предиктор успевает подстраиваться быстрее медленно меняющейся цели.`; } },
    { short: 'Штраф', title: 'Штраф за разброс без скользящего среднего',
      text: 'Теперь без целевого энкодера: градиент снова идёт через обе ветви, но к потере добавлен штраф, как в VICReg. Он растёт, если разброс какой-то компоненты представления по пакету падает ниже единицы или две компоненты повторяют друг друга. Удержи модель этим штрафом.',
      bet: { q: 'Градиент идёт через обе ветви, как в первой миссии. Удержит ли модель один штраф за разброс?', options: ['нет: без асимметрии энкодер всё равно схлопнется', 'да: штраф прямо запрещает выдавать всем кадрам одно и то же', 'только при огромном весе штрафа, когда модель перестаёт предсказывать'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Защита: штраф за разброс, без скользящего среднего', test: (r) => !!r && r.cfg.prot === 'var' },
        { label: 'Разброс представлений больше 0,5', test: (r) => !!r && r.spread > 0.5 },
        { label: 'Щуп попадает в чашку хотя бы в половине кадров', test: (r) => !!r && r.hit >= 0.5 },
      ],
      summary: (r) => `${r.label}: потеря ${fmt(r.loss, 3)}, разброс ${fmt(r.spread, 2)}, щуп ${pct(r.hit)}%`,
      hint: 'На сцене выбери защиту «штраф за разброс».',
      fail: (r) => r && r.cfg.prot !== 'var' ? '<b>Защита не та.</b> Выбери «штраф за разброс».' : `<b>Щуп попадает в чашку в ${pct(r.hit)}% кадров.</b>`,
      explain: (r) => `Разброс держится около ${fmt(r.spread, 2)}: ниже единицы штраф не пускает, а слишком большой разброс ничего не даёт. Щуп попадает в чашку в ${pct(r.hit)}% кадров и ошибается в среднем на ${fmt(r.err * 100, 1)} см. Это регуляризующий способ ЛеКуна: энергию данных опускают, а пространство, где энергия низкая, сжимают. Так же устроены VICReg и SIGReg из LeJEPA, которая обходится без скользящего среднего и остановки градиента.` },
    { short: 'Медленный', title: 'Медленный коллапс: модель держится за свет',
      text: 'Возьми записи, в которых свет меняется от записи к записи: утром светлее, вечером темнее и теплее, а внутри одной записи свет один и тот же. Обучи модель с защитой и посмотри на щуп. Потом включи угадывание толчка: маленькая линейная формула по двум соседним представлениям угадывает толчок, и её ошибка добавляется к потере, как в H-JEPA. Добейся, чтобы щуп ошибался в среднем меньше чем на 10 см.',
      controls: ['light', 'inv'], onEnter: () => { C.set('light', 'tint'); segSet('#clLight', 'tint'); },
      bet: { q: 'Свет меняется от записи к записи, а защита держит разброс представлений. Найдёт ли щуп чашку?', options: ['да: раз представления разные, модель различает и чашку', 'нет: представления могут различаться светом, который внутри записи не меняется и предсказывается без ошибки, а чашку модель выбросит', 'найдёт, но вдвое хуже, чем при одном свете'], answer: () => 1 },
      action: runAct,
      criteria: [
        { label: 'Свет в записях меняется', test: (r, s) => !!s && s.light === 'tint' },
        { label: 'Без угадывания толчка щуп чашку не нашёл, хотя разброс в порядке', test: (r, s) => !!s && !!s.slowSeen },
        { label: 'С угадыванием толчка щуп ошибается меньше чем на 10 см', test: (r, s) => !!s && !!s.fixSeen && s.fixSeen.err < 0.1 && s.fixSeen.cfg.prot !== 'none' },
      ],
      summary: (r) => `${r.label}: разброс ${fmt(r.spread, 2)}, ошибка щупа ${fmt(r.err * 100, 1)} см`,
      hint: 'Сначала обучи модель со штрафом за разброс или скользящим средним, не отмечая угадывание толчка. Потом отметь «угадывать толчок по двум представлениям» и обучи заново.',
      fail: (r, ctx) => { const s = C.state(); if (r && r.cfg.prot === 'none') return '<b>Нужна защита.</b> Без неё модель схлопнется полностью, как в первой миссии.'; if (!s.slowSeen) return r && r.cfg.inv ? '<b>Сначала без угадывания толчка.</b> Сними отметку и обучи модель, чтобы увидеть, что найдёт щуп.' : `<b>Щуп ошибается на ${fmt(r.err * 100, 1)} см.</b>`; if (!s.fixSeen) return `<b>Щуп ошибается на ${fmt(r.err * 100, 1)} см, хотя разброс представлений ${fmt(r.spread, 2)}.</b> Модель различает записи по свету, а не по чашке. Теперь отметь «угадывать толчок по двум представлениям» и обучи заново.`; return `<b>Ошибка щупа ${fmt(s.fixSeen.err * 100, 1)} см.</b> Попробуй другую защиту.`; },
      explain: () => { const s = C.state(), a = s.slowSeen, b = s.fixSeen; return `Без угадывания толчка функция потерь упала до ${fmt(a.loss, 3)}, разброс представлений ${fmt(a.spread, 2)}, а щуп ошибался на ${fmt(a.err * 100, 1)} см, как если бы называл середину стола. Энкодер нашёл то, что предсказать проще всего: свет, который внутри записи не меняется и при этом отличает одну запись от другой, а чашку выбросил. Авторы H-JEPA называют это медленным коллапсом и видели его на настоящих записях DROID: модель хранила фон и выбрасывала руку. Угадывание толчка заставляет представления меняться вместе с чашкой: ошибка щупа ${fmt(b.err * 100, 1)} см. Это лучше, чем ничего, но хуже, чем при одном свете: маленькой модели за пятьсот шагов трудно найти чашку, когда весь кадр то ярче, то темнее.`; } },
    { short: 'Свободно', final: true, title: 'Свободный режим: защиты и их настройки',
      text: 'Теперь видны все ручки: момент скользящего среднего, вес штрафа, свет в записях и угадывание толчка. Найди момент, при котором целевой энкодер не успевает спасти модель, и вес штрафа, при котором щуп находит чашку лучше всего. Бледные кривые на графике — прошлые запуски.',
      controls: 'all', action: runAct, summary: (r) => `${r.label}: потеря ${fmt(r.loss, 3)}, разброс ${fmt(r.spread, 2)}, щуп ${pct(r.hit)}%, ${fmt(r.err * 100, 1)} см` },
  ];
  function init() {
    segBind('#clProt', (v) => { segSet('#clProt', v); C.set('prot', v); });
    segBind('#clLight', (v) => { segSet('#clLight', v); C.set('light', v); });
    segBind('#clMom', (v) => { segSet('#clMom', v); C.set('mom', +v); });
    segBind('#clVr', (v) => { segSet('#clVr', v); C.set('vr', +v); });
    $('#clInv').addEventListener('change', (e) => C.set('inv', e.target.checked));
    const ctl = mountMissions('#clMis', missions, { reset() { C.set('prot', 'none'); segSet('#clProt', 'none'); C.set('light', 'same'); segSet('#clLight', 'same'); C.set('inv', false); $('#clInv').checked = false; C.st.slowSeen = C.st.fixSeen = null; }, state: C.state },
      { controls: { light: '#wrapClLight', inv: '#wrapClInv', mom: '#wrapClMom', vr: '#wrapClVr' }, scene: '#clLoss' });
    C.init(ctl);
    return ctl;
  }
  return { init, missions };
})();

/* =====================================================================
   2. Лаборатория 2 «Веер воображаемых будущих»: две Ады ставят чашку по фотографии хозяйки.
   Модели вшиты (L72.lab2Models), шаг попытки — L72.attemptStep: кадр → CEM по толчкам с расстоянием до
   фотографии в пикселях или в представлениях → толчок на настоящем столе. Те же попытки считает тест в Node.
   ===================================================================== */
const GOAL_SCEN = L72.GOAL_SCEN;
const Goal = (() => {
  const E = L72, L71 = E.L71, SEED = 1, MAXP = 6, KINDS = ['pix', 'rep'];
  const st = { scen: 'near', cup: GOAL_SCEN.near.cup.slice(), goal: GOAL_SCEN.near.goal.slice(), light: 'day', pop: 64, iters: 5, horizon: 1, map: false, busy: false, A: null, anim: null, last: null, free: false };
  const cv = {}, maps = {};
  let ctl = null;
  const opts = (kind) => { const M = E.lab2Models(); return { kind, M: M[kind], S: M.S, cup: st.cup, goal: st.goal, lightNow: L71.LIGHTS.day, lightGoal: L71.LIGHTS[st.light], seed: SEED, maxPush: MAXP, horizon: st.horizon, pop: st.pop, iters: st.iters, elite: 8, keep: true }; };
  function reset() { st.A = { pix: E.attemptStart(opts('pix')), rep: E.attemptStart(opts('rep')) }; st.anim = null; maps.pix = maps.rep = null;  drawAll(); drawPhoto(); renderImag(); }
  function setScen(name) { const S = GOAL_SCEN[name]; st.scen = name; st.cup = S.cup.slice(); st.goal = S.goal.slice(); st.light = S.light; segSet('#glLight', st.light); st.last = null; reset(); renderRead(); }
  /** Шесть толчков обеими Адами; после каждого — анимация веера и толчка. */
  async function runAll() {
    reset(); st.busy = true; drawAll();
    const ms = { pix: [], rep: [] };
    for (let k = 0; k < MAXP; k++) {
      for (const kind of KINDS) { const A = st.A[kind]; if (A.done) continue; const t0 = performance.now(); E.attemptStep(A); ms[kind].push(performance.now() - t0); }
      maps.pix = maps.rep = null; 
      await animate(k);
    }
    st.busy = false; st.anim = null; drawAll(); renderImag();
    const res = {};
    for (const kind of KINDS) { const A = st.A[kind]; res[kind] = { dist: A.dist, ok: A.ok, fell: A.fell, n: A.steps.length, path: [st.cup].concat(A.steps.map((q) => q.after)).map((p) => [p[0], p[1]]), ms: ms[kind].reduce((a, b) => a + b, 0) / ms[kind].length }; }
    const r = { scen: st.scen, light: st.light, goal: st.goal.slice(), cup: st.cup.slice(), d0: L71.hypot(st.goal[0] - st.cup[0], st.goal[1] - st.cup[1]), pop: st.pop, iters: st.iters, horizon: st.horizon, map: st.map, pix: res.pix, rep: res.rep };
    st.last = r; renderRead(); if (ctl) ctl.update();
    return r;
  }
  /** Анимация шага k: итерации CEM (веер), выбранный толчок, движение чашки. */
  function animate(k) {
    const I = st.A.pix.steps[k] ? st.A.pix.steps[k].iters.length : st.iters, T = I * 0.16 + 0.25 + 0.4;
    if (window.__noAnim || HeroKit.reduced()) { st.anim = { k, t: T, I }; drawAll(); renderImag(); return Promise.resolve(); }
    return new Promise((res) => { const t0 = performance.now(); const tick = () => { const t = (performance.now() - t0) / 1000; st.anim = { k, t: Math.min(t, T), I }; drawAll(); if (t < T) requestAnimationFrame(tick); else { renderImag(); res(); } }; requestAnimationFrame(tick); });
  }
  /* ---------- рисование ---------- */
  /** Карта расстояния до цели: стоимость плана по сетке толчков вокруг чашки. Во время попытки — для текущего шага,
   *  после попытки — для начального места чашки, до попытки — для того места, где чашка стоит. */
  function mapOf(kind) {
    const A = st.A[kind], an = st.anim, M = E.lab2Models();
    let key, ctx, at;
    if (an && A.steps[an.k]) { key = 's' + an.k; ctx = A.steps[an.k].ctx; at = A.steps[an.k].cup; }
    else if (A.steps.length) { key = 's0'; ctx = A.steps[0].ctx; at = A.steps[0].cup; }
    else { key = 'start'; at = [A.W.cx, A.W.cy]; }
    maps[kind] = maps[kind] || {};
    if (maps[kind][key]) return maps[kind][key];
    if (!ctx) ctx = E.planCtx(kind, M[kind], M.S, E.shot(A.W, L71.LIGHTS.day), A.goalFrame);
    const cells = []; let mn = Infinity, mx = -Infinity, best = null;
    for (let dx = -0.15; dx <= 0.1501; dx += 0.015) for (let dy = -0.15; dy <= 0.1501; dy += 0.015) {
      if (L71.hypot(dx, dy) > 0.1501) continue;
      const ex = at[0] + dx, ey = at[1] + dy;   // только места, куда Ада может подвести чашку: не ближе 6 см к краю
      if (ex < E.EDGE || ex > L71.TABLE.W - E.EDGE || ey < E.EDGE || ey > L71.TABLE.H - E.EDGE) continue;
      const x = st.horizon === 2 ? [dx, dy, 0, 0] : [dx, dy], c = E.planCost(ctx, x); cells.push({ dx, dy, c });
      if (c < mn) { mn = c; best = [dx, dy]; } if (c > mx) mx = c;
    }
    return (maps[kind][key] = { cells, mn, mx, best, at, first: key === 's0' });
  }
  function drawWorld(kind) {
    const el = cv[kind]; if (!el || !st.A) return;
    const V = TableDraw.view(el, { W: 460, margin: 0.03 }), c = V.c, A = st.A[kind], css = HeroKit.css;
    TableDraw.table(V, A.W, { light: 'day' });
    const an = st.anim, k = an ? an.k : A.steps.length - 1;
    // где чашка сейчас и какой шаг показываем
    const pts = [st.cup].concat(A.steps.map((q) => q.after));
    const shown = an ? an.k : A.steps.length;   // сколько толчков уже показано целиком
    let cup = pts[Math.min(shown, pts.length - 1)];
    const step = an ? A.steps[an.k] : null, I = an ? an.I : 0, tFan = I * 0.16;
    let moveU = 0;
    if (step) { moveU = Math.max(0, Math.min(1, (an.t - tFan - 0.25) / 0.4)); cup = [step.cup[0] + (step.after[0] - step.cup[0]) * moveU, step.cup[1] + (step.after[1] - step.cup[1]) * moveU]; }
    // карта расстояния до цели вокруг чашки
    if (st.map) {
      const m = mapOf(kind), sz = 0.015 * V.S, col = css('--e2e');
      for (const q of m.cells) { const u = (m.mx - q.c) / ((m.mx - m.mn) || 1); c.globalAlpha = 0.08 + 0.55 * u * u; c.fillStyle = col; c.fillRect(V.X(m.at[0] + q.dx) - sz / 2, V.Y(m.at[1] + q.dy) - sz / 2, sz, sz); }
      c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(V.X(m.at[0] + m.best[0]), V.Y(m.at[1] + m.best[1]), 6, 0, 7); c.stroke();
      c.setLineDash([3, 3]); c.lineWidth = 1; c.beginPath(); c.arc(V.X(m.at[0]), V.Y(m.at[1]), 0.15 * V.S, 0, 7); c.stroke(); c.setLineDash([]);
      if (m.first && !st.busy) HeroKit.label(c, V.k, 'карта — для места, откуда чашка начинала', V.W / 2, V.H - 10, { px: 10.5, weight: 650, color: col });
    }
    // цель: где чашка на фотографии
    const g = st.goal;
    c.fillStyle = css('--classic'); c.globalAlpha = 0.18; c.beginPath(); c.arc(V.X(g[0]), V.Y(g[1]), L71.CUP_R * V.S, 0, 7); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = css('--classic'); c.lineWidth = 1.2; c.beginPath(); c.arc(V.X(g[0]), V.Y(g[1]), L71.CUP_R * V.S, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(46,140,80,0.9)'; c.setLineDash([3, 2]); c.lineWidth = 1.4; c.beginPath(); c.arc(V.X(g[0]), V.Y(g[1]), E.D_GOAL * V.S, 0, 7); c.stroke(); c.setLineDash([]);
    // путь чашки на настоящем столе
    const path = []; for (let i = 0; i <= Math.min(shown, pts.length - 1); i++) path.push(pts[i][0], pts[i][1]);
    if (step) path.push(cup[0], cup[1]);
    TableDraw.path(V, path, { kind: 'real', lw: 2.4, dots: 1 });
    // веер кандидатов текущего шага
    if (step && an.t < tFan + 0.25 && step.iters.length) {
      const it = step.iters[Math.min(step.iters.length - 1, Math.floor(an.t / 0.16))], cs = it.cand;
      let mn = Infinity, mx = -Infinity; for (const q of cs) { if (q.cost < mn) mn = q.cost; if (q.cost > mx) mx = q.cost; }
      const col = css('--e2e'), x0 = V.X(step.cup[0]), y0 = V.Y(step.cup[1]);
      cs.forEach((q, i) => {
        const p = E.clipPush([q.x[0], q.x[1]]), u = (mx - q.cost) / ((mx - mn) || 1), elite = i < 8;
        c.globalAlpha = 0.12 + 0.78 * u; c.strokeStyle = col; c.lineWidth = elite ? 2.4 : 1.1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(V.X(step.cup[0] + p[0]), V.Y(step.cup[1] + p[1])); c.stroke();
        if (elite) { c.fillStyle = col; c.beginPath(); c.arc(V.X(step.cup[0] + p[0]), V.Y(step.cup[1] + p[1]), 2.4, 0, 7); c.fill(); }
      });
      c.globalAlpha = 1;
      HeroKit.label(c, V.k, `итерация ${Math.min(step.iters.length, Math.floor(an.t / 0.16) + 1)} из ${step.iters.length}`, V.W - 8, 12, { px: 11, weight: 700, color: col, align: 'right' });
    }
    if (step && an.t >= tFan) {   // выбранный толчок
      const col = css('--e2e'), p = step.push;
      c.globalAlpha = moveU < 1 ? 1 : 0.5; arrowTo(c, V.X(step.cup[0]), V.Y(step.cup[1]), V.X(step.cup[0] + p[0]), V.Y(step.cup[1] + p[1]), col); c.globalAlpha = 1;
    }
    TableDraw.cup(V, cup[0], cup[1], { fallen: A.fell && (!an || moveU >= 1) && A.steps.length - 1 === k });
    const done = !st.busy && A.steps.length;
    if (!A.steps.length && !st.busy) HeroKit.label(c, V.k, 'Запусти планирование кнопкой в задании', V.W / 2, V.Y(0.04), { px: 11.5, weight: 650, color: css('--ink-2') });
    if (done) HeroKit.label(c, V.k, `${A.steps.length} ${pl(A.steps.length, 'толчок', 'толчка', 'толчков')} · до цели ${fmt(A.dist * 100, 1)} см`, V.W / 2, V.Y(0.035), { px: 11, weight: 700, color: A.ok ? css('--good') : css('--critical') });
  }
  function arrowTo(c, x1, y1, x2, y2, col) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1); if (L < 3) return;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * 7, y2 - Math.sin(a) * 7); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 11 * Math.cos(a - 0.45), y2 - 11 * Math.sin(a - 0.45)); c.lineTo(x2 - 11 * Math.cos(a + 0.45), y2 - 11 * Math.sin(a + 0.45)); c.closePath(); c.fill();
  }
  function drawAll() { for (const kind of KINDS) drawWorld(kind); for (const kind of KINDS) setOut($(kind === 'pix' ? '#glPixD' : '#glRepD'), st.A && st.A[kind].steps.length && !st.busy ? `${fmt(st.A[kind].dist * 100, 1)} см` : '—'); }
  function drawPhoto() {
    if (!st.A) return; const f = st.A.pix.goalFrame; TableDraw.camera($('#glPhoto'), f, 16, 16);
    setOut($('#glPhotoCap'), `Фотография хозяйки${st.light === 'morning' ? ', снятая утром' : ', снятая днём'}: кадр 16 × 16, по которому планируют обе Ады`);
    setOut($('#glScen'), `Цель в ${fmt(L71.hypot(st.goal[0] - st.cup[0], st.goal[1] - st.cup[1]) * 100, 0)} см от чашки. Свет сейчас дневной${st.light === 'morning' ? ', а на фотографии утренний: ярче, теплее, полоса солнца в другом месте' : ', как на фотографии'}.`);
  }
  /** Что воображает модель после выбранного толчка: кадр модели кадров и 8 чисел модели представлений. */
  function renderImag() {
    for (const kind of KINDS) {
      const box = $(kind === 'pix' ? '#glPixImag' : '#glRepImag'); if (!box || !st.A) continue;
      const A = st.A[kind], s = A.steps[A.steps.length - 1];
      box.innerHTML = '';
      if (!s) { box.append(h('p', { class: 'gl-icap' }, kind === 'pix' ? 'Здесь появится кадр, который модель кадров нарисует после выбранного толчка.' : 'Здесь появятся 8 чисел: представление после выбранного толчка рядом с представлением фотографии.')); continue; }
      const M = E.lab2Models();
      if (kind === 'pix') {
        const img = E.pixImagine(M.pix, M.S, s.ctx.n, [s.push]), cvi = h('canvas', { width: 16, height: 16, class: 'gl-iframe', role: 'img', 'aria-label': 'Кадр 16 на 16, который воображает модель кадров после толчка' });
        TableDraw.camera(cvi, Float32Array.from(img, (v) => Math.max(0, Math.min(1, v))), 16, 16);
        box.append(cvi, h('p', { class: 'gl-icap' }, 'Кадр, который модель кадров рисует после последнего толчка: с ним сравнивается фотография.'));
      } else {
        const z = E.predict(M.rep, s.ctx.zNow, s.push), zg = s.ctx.zGoal, cvb = h('canvas', { class: 'gl-bars', role: 'img', 'aria-label': 'Восемь чисел представления после толчка (оранжевый пунктир) и восемь чисел представления фотографии (синие)' });
        box.append(cvb, h('p', { class: 'gl-icap' }, 'Представление после последнего толчка (оранжевый пунктир) и представление фотографии (синие): 8 чисел, кадра модель не рисует.'));
        requestAnimationFrame(() => drawBars(cvb, z, zg));
      }
    }
  }
  function drawBars(el, z, zg) {
    const { c, k } = HeroKit.fit(el, 200, 64), css = HeroKit.css; c.clearRect(0, 0, 200, 64);
    let m = 0.5; for (let j = 0; j < z.length; j++) m = Math.max(m, Math.abs(z[j]), Math.abs(zg[j]));
    const y0 = 32, sc = 26 / m, bw = 200 / z.length;
    c.strokeStyle = css('--line-2'); c.beginPath(); c.moveTo(0, y0); c.lineTo(200, y0); c.stroke();
    for (let j = 0; j < z.length; j++) {
      const x = j * bw + 4; c.fillStyle = css('--classic'); c.fillRect(x, Math.min(y0, y0 - zg[j] * sc), bw / 2 - 4, Math.abs(zg[j] * sc) || 1);
      c.strokeStyle = css('--e2e'); c.setLineDash([3, 2]); c.lineWidth = 1.5; c.strokeRect(x + bw / 2 - 3, Math.min(y0, y0 - z[j] * sc), bw / 2 - 4, Math.abs(z[j] * sc) || 1); c.setLineDash([]);
    }
  }
  function renderRead() {
    const r = st.last; if (!r) { setOut($('#glRead'), 'Обе Ады начинают с одного и того же места и исполняют толчки на одном и том же столе.'); return; }
    setOut($('#glRead'), `<b>Цель в ${fmt(r.d0 * 100, 0)} см.</b> Модель кадров: ${r.pix.n} ${pl(r.pix.n, 'толчок', 'толчка', 'толчков')}, до цели ${fmt(r.pix.dist * 100, 1)} см, план одного толчка — ${fmt(r.pix.ms, 1)} мс. Модель представлений: до цели ${fmt(r.rep.dist * 100, 1)} см, план — ${fmt(r.rep.ms, 1)} мс. Время — в этом браузере, ${r.pop} ${pl(r.pop, 'кандидат', 'кандидата', 'кандидатов')} × ${r.iters} ${pl(r.iters, 'итерация', 'итерации', 'итераций')}.`);
  }
  function bindClick() {
    const pick = (e) => {
      if (!st.free || st.busy) return;
      const el = e.currentTarget, V = TableDraw.view(el, { W: 460, margin: 0.03 }), p = V.toTable(e.clientX, e.clientY);
      if (!E.clearOf(p[0], p[1], 0.07)) { setOut($('#glRead'), 'Сюда чашку не поставить: слишком близко к краю, сахарнице или молочнику.'); return; }
      st.goal = p; st.last = null; reset(); renderRead();
    };
    for (const kind of KINDS) cv[kind].addEventListener('click', pick);
  }
  function state() { return { scen: st.scen, light: st.light, map: st.map, busy: st.busy, last: st.last }; }
  return { st, GOAL_SCEN, setScen, runAll, reset, drawAll, mapOf, state, renderRead,
    set(k, v) { st[k] = v; if (k === 'map') { drawAll(); } else if (k === 'light') { st.last = null; reset(); renderRead(); } else if (k === 'pop' || k === 'iters' || k === 'horizon') { maps.pix = maps.rep = null;  } if (ctl) ctl.update(); },
    init(c) { cv.pix = $('#glPix'); cv.rep = $('#glRep'); ctl = c; bindClick(); reset(); renderRead(); App.on('theme', () => { drawAll(); renderImag(); }); App.on('resize', drawAll); } };
})();

/* ---------- миссии лаборатории 2: ставка → две Ады на столе → шесть толчков и расстояние до цели ---------- */
const GoalLab = (() => {
  const G = Goal, runAct = { label: 'Планировать и толкать', run: async () => G.runAll() };
  const cm = (v) => fmt(v * 100, 1);
  const missions = [
    { short: 'Рядом', title: 'Цель рядом, свет тот же',
      text: 'Хозяйка сфотографировала чашку в 12 см от того места, где она стоит сейчас, днём, при том же свете. Запусти обе Ады: каждая сделает до шести толчков и после каждого будет планировать заново. Задача — поставить чашку точнее 2 см.',
      onEnter: () => G.setScen('near'),
      bet: { q: 'Модель кадров сравнивает с фотографией все 768 чисел кадра, модель представлений — 8 чисел. Кто поставит чашку точнее 2 см?', options: ['обе: цель рядом, и оба расстояния уменьшаются, когда воображаемая чашка подходит к месту на фотографии', 'только модель кадров: в 8 числах не хватит точности', 'только модель представлений: пиксели сбивает узор скатерти'], answer: (r) => (r.pix.ok && r.rep.ok ? 0 : r.pix.ok ? 1 : 2) },
      action: runAct,
      criteria: [
        { label: 'Фотография снята при том же свете', test: (r) => !!r && r.light === 'day' },
        { label: 'Модель кадров поставила чашку точнее 2 см', test: (r) => !!r && r.pix.ok },
        { label: 'Модель представлений поставила чашку точнее 2 см', test: (r) => !!r && r.rep.ok },
      ],
      summary: (r) => `цель в ${fmt(r.d0 * 100, 0)} см: кадры ${cm(r.pix.dist)} см, представления ${cm(r.rep.dist)} см`,
      explain: (r) => `Модель кадров остановила чашку в ${cm(r.pix.dist)} см от цели, модель представлений — в ${cm(r.rep.dist)} см. Когда цель в пределах одного толчка, оба расстояния ведут к ней: чем ближе воображаемая чашка к месту на фотографии, тем меньше и разница пикселей, и разница представлений. Посмотри на время под сценой: модель кадров рисует 768 чисел для каждого кандидата, и план одного толчка у неё дольше в ${fmt(r.pix.ms / r.rep.ms, 0)} раз. Рисовать кадр всегда дороже, чем сравнить несколько чисел; у Cosmos, которая рисует видео, это были 4 минуты на действие против 16 секунд у V-JEPA 2-AC.` },
    { short: 'Далеко', title: 'Цель на другом конце стола',
      text: 'Теперь хозяйка сфотографировала чашку в 36 см от неё, а один толчок сдвигает чашку не дальше чем на 15 см. Свет тот же. Запусти обе Ады и включи карту расстояния до цели: она показывает, куда после одного толчка чашке лучше всего попасть по расчёту каждой модели.',
      controls: ['map'], onEnter: () => G.setScen('far'),
      bet: { q: 'Цель дальше одного толчка. Кто дойдёт до неё за шесть толчков?', options: ['обе, просто за несколько толчков', 'модель представлений: её расстояние уменьшается с каждым сантиметром пути, а разница пикселей почти не зависит от того, далеко ли чашка, пока она не накрыла место на фотографии', 'модель кадров: она видит на фотографии, где цель'], answer: (r) => (r.rep.ok && !r.pix.ok ? 1 : r.rep.ok ? 0 : 2) },
      action: runAct,
      criteria: [
        { label: 'Цель дальше 30 см', test: (r) => !!r && r.d0 > 0.3 },
        { label: 'Модель представлений поставила чашку точнее 2 см', test: (r) => !!r && r.rep.ok },
        { label: 'Карта расстояния включена', test: (r, s) => !!s && s.map },
      ],
      summary: (r) => `цель в ${fmt(r.d0 * 100, 0)} см: кадры ${cm(r.pix.dist)} см, представления ${cm(r.rep.dist)} см`,
      hint: 'Карта включается отметкой под сценой. На ней видно, куда каждая модель хочет сдвинуть чашку.',
      fail: (r, ctx) => (r && r.rep.ok && !G.state().map ? '<b>Модель представлений дошла.</b> Включи карту расстояния и посмотри, почему модель кадров не дошла, а потом запусти ещё раз.' : '<b>Пока не всё.</b> Запусти ещё раз.'),
      explain: (r) => `Модель представлений дошла за несколько толчков: ${cm(r.rep.dist)} см. Модель кадров осталась в ${cm(r.pix.dist)} см: пока воображаемая чашка не накрывает место, где она стоит на фотографии, разница пикселей почти не зависит от того, насколько чашка близко, и меняется скорее от узора скатерти под ней. На карте у модели кадров лучшее место после толчка не смотрит на цель, а у модели представлений карта плавно светлеет в сторону цели. Так же устроен рисунок 9 в статье V-JEPA 2 с гладким и выпуклым ландшафтом энергии, а авторы H-JEPA видели, что расстояние в пространстве нижнего уровня вдали от цели почти постоянно. Прямого сравнения пикселей и представлений с одной моделью в статьях нет, и это наш собственный опыт.` },
    { short: 'Утро', title: 'Фотография снята утром',
      text: 'Цель снова рядом, как в первой миссии, но хозяйка сфотографировала чашку утром: свет ярче и теплее, а полоса солнца лежит в другом месте. Сейчас день. Запусти обе Ады и посмотри, как близко каждая подведёт чашку.',
      controls: ['map', 'light'], onEnter: () => G.setScen('morning'),
      bet: { q: 'Чашка на утреннем фото стоит там же, где в первой миссии. Кто из Ад подведёт её ближе к цели?', options: ['модель представлений: свет не меняет того, где стоит чашка', 'модель кадров: она промахнётся, но меньше; энкодер модели представлений никогда не видел утреннего света, и представление фотографии теряет смысл', 'обе дойдут точнее 2 см, как в первой миссии'], answer: (r) => (r.pix.dist < r.rep.dist ? 1 : 0) },
      action: runAct,
      criteria: [
        { label: 'Фотография снята утром', test: (r) => !!r && r.light === 'morning' },
        { label: 'Обе Ады сделали по шесть толчков', test: (r) => !!r && r.pix.n === 6 && r.rep.n === 6 },
      ],
      summary: (r) => `утреннее фото: кадры ${cm(r.pix.dist)} см, представления ${cm(r.rep.dist)} см`,
      explain: (r) => `На нашей модели вышло наоборот тому, что подсказывает идея JEPA. Модель кадров остановила чашку в ${cm(r.pix.dist)} см от цели: утренний свет мешает ей, но чашка на фотографии стоит там же. Модель представлений увела чашку на ${cm(r.rep.dist)} см: её энкодер учился только на дневных кадрах, и утреннюю фотографию он переводит в представление, какого не видел ни разу, так что расстояние до него ничего не значит. Модель кадров через свой энкодер пропускает только кадр сейчас, а фотографию сравнивает пиксель в пиксель. Представление полезно настолько, насколько разнообразно было то, на чём учился энкодер: энкодер V-JEPA 2 видел больше миллиона часов видео при любом свете, а наш — стол Ады при одном.` },
    { short: 'Свободно', final: true, title: 'Свободный режим: настройки CEM и своя цель',
      text: 'Нажми на стол, чтобы хозяйка сфотографировала чашку в другом месте, выбери, когда снята фотография, число кандидатов, итераций и сколько толчков вперёд смотрит план. Найди цель, до которой не доходит ни одна Ада, и проверь, помогает ли план на два толчка или больше кандидатов.',
      controls: 'all', action: runAct, onEnter: () => { G.st.free = true; $('#glFreeNote').hidden = false; },
      summary: (r) => `цель в ${fmt(r.d0 * 100, 0)} см, ${r.pop}×${r.iters}, план на ${r.horizon}: кадры ${cm(r.pix.dist)} см, представления ${cm(r.rep.dist)} см` },
  ];
  function init() {
    $('#glMap').addEventListener('change', (e) => G.set('map', e.target.checked));
    segBind('#glLight', (v) => { segSet('#glLight', v); G.set('light', v); });
    segBind('#glPop', (v) => { segSet('#glPop', v); G.set('pop', +v); });
    segBind('#glIt', (v) => { segSet('#glIt', v); G.set('iters', +v); });
    segBind('#glHor', (v) => { segSet('#glHor', v); G.set('horizon', +v); });
    const ctl = mountMissions('#glMis', missions, { reset() { G.st.free = false; $('#glFreeNote').hidden = true; G.set('map', false); $('#glMap').checked = false; G.setScen('near'); }, state: G.state },
      { controls: { map: '#wrapGlMap', light: '#wrapGlLight', pop: '#wrapGlPop', iters: '#wrapGlIt', horizon: '#wrapGlHor' }, scene: '.gl-pair' });
    G.init(ctl);
    return ctl;
  }
  return { init, missions };
})();

/* =====================================================================
   3. Числа из статей — диаграммами (shared/stats-chart.js).
   ===================================================================== */
function initStats() {
  const el = (id) => document.getElementById(id);
  if (el('targetBars')) StatsChart.bars(el('targetBars'), {
    series: [{ id: 'px', label: 'цель — пиксели', color: 'var(--ink-3)' }, { id: 'rep', label: 'цель — представления', color: 'var(--e2e)' }],
    groups: [['I-JEPA, Image\u00ADNet 1%', 40.7, 66.9], ['V-JEPA, Kine\u00ADtics-400', 68.6, 73.7], ['V-JEPA, SSv2', 66.0, 66.2], ['V-JEPA, Image\u00ADNet', 73.3, 74.8]].map(([label, px, rep]) => ({ label, values: { px, rep } })),
    max: 100, unit: '', ticks: [0, 25, 50, 75, 100], digits: 1,
  });
  if (el('scaleBars')) StatsChart.bars(el('scaleBars'), {
    series: [{ id: 's', label: 'средняя точность на шести задачах', color: 'var(--classic)' }],
    groups: [['V-JEPA', 84.2], ['+ данные', 85.2], ['+ модель', 86.7], ['+ дольше', 87.5], ['+ разре\u00ADшение', 88.2]].map(([label, v]) => ({ label, values: { s: v } })),
    max: 90, unit: '', ticks: [0, 30, 60, 90], digits: 1,
  });
  if (el('octoBars')) StatsChart.bars(el('octoBars'), {
    series: [{ id: 'o', label: 'Octo', color: 'var(--hybrid)' }, { id: 'v', label: 'V-JEPA 2-AC', color: 'var(--e2e)' }],
    groups: [['дотя\u00ADнуться', 100, 100], ['взять чашку', 15, 65], ['взять ко\u00ADробку', 0, 25], ['донести чашку', 15, 75], ['донести ко\u00ADробку', 70, 75], ['пере\u00ADставить чашку', 15, 80], ['пере\u00ADставить ко\u00ADробку', 10, 65]].map(([label, o, v]) => ({ label, values: { o, v } })),
    max: 100, unit: '%', ticks: [0, 50, 100], digits: 0,
  });
  if (el('cosmosBars')) StatsChart.bars(el('cosmosBars'), {
    series: [{ id: 'c', label: 'Cosmos', color: 'var(--hybrid)' }, { id: 'v', label: 'V-JEPA 2-AC', color: 'var(--e2e)' }],
    groups: [['дотя\u00ADнуться', 80, 100], ['взять чашку', 0, 60], ['взять ко\u00ADробку', 20, 20], ['пере\u00ADставить чашку', 0, 80], ['пере\u00ADставить ко\u00ADробку', 0, 50]].map(([label, c, v]) => ({ label, values: { c, v } })),
    max: 100, unit: '%', ticks: [0, 50, 100], digits: 0,
  });
  if (el('timeBars')) StatsChart.bars(el('timeBars'), {
    series: [{ id: 't', label: 'секунд на одно действие', color: 'var(--critical)' }],
    groups: [{ label: 'Cosmos, 80 канди\u00ADдатов', values: { t: 240 } }, { label: 'V-JEPA 2-AC, 800 канди\u00ADдатов', values: { t: 16 } }],
    max: 240, unit: ' с', ticks: [0, 60, 120, 180, 240], digits: 0,
  });
  if (el('dinoBars')) StatsChart.bars(el('dinoBars'), {
    series: [{ id: 'i', label: 'IRIS', color: 'var(--ink-3)' }, { id: 'd', label: 'DreamerV3', color: 'var(--classic)' }, { id: 't', label: 'TD-MPC2', color: 'var(--hybrid)' }, { id: 'w', label: 'DINO-WM', color: 'var(--e2e)' }],
    groups: [['Maze', 74, 100, 0, 98], ['Wall', 4, 100, 0, 96], ['Reach', 18, 64, 0, 92], ['Push-T', 32, 30, 0, 90]].map(([label, i, d, t, w]) => ({ label, values: { i, d, t, w } })),
    max: 100, unit: '%', ticks: [0, 50, 100], digits: 0,
  });
  if (el('v21Bars')) StatsChart.bars(el('v21Bars'), {
    series: [{ id: 'a', label: 'V-JEPA 2, план на 1 действие', color: 'var(--ink-3)' }, { id: 'b', label: 'V-JEPA 2.1, план на 1', color: 'var(--classic)' }, { id: 'c', label: 'V-JEPA 2.1, план на 8', color: 'var(--e2e)' }],
    groups: [['дотя\u00ADнуться', 100, 100, 100], ['взять', 60, 70, 80], ['пере\u00ADставить', 80, 80, 80]].map(([label, a, b, c]) => ({ label, values: { a, b, c } })),
    max: 100, unit: '%', ticks: [0, 50, 100], digits: 0,
  });
  if (el('surveyBars')) StatsChart.bars(el('surveyBars'), {
    series: [{ id: 'pix', label: 'модель кадров', color: 'var(--hybrid)' }, { id: 'rep', label: 'модель представлений', color: 'var(--e2e)' }],
    groups: [['цель рядом', 24, 28], ['цель далеко', 6, 20], ['рядом, фото утром', 6, 0]].map(([label, pix, rep]) => ({ label, values: { pix, rep } })),
    max: 30, unit: '', ticks: [0, 10, 20, 30], digits: 0,
  });
  if (el('hjepaBars')) StatsChart.bars(el('hjepaBars'), {
    series: [{ id: 'f', label: 'плоская модель', color: 'var(--ink-3)' }, { id: 'h2', label: 'H-JEPA, 2 уровня', color: 'var(--classic)' }, { id: 'h3', label: '3 уровня', color: 'var(--hybrid)' }, { id: 'h4', label: '4 уровня', color: 'var(--e2e)' }],
    groups: [['Ant\u00ADMaze', 18.0, 39.3, 73.3, 63.3], ['Four\u00ADRoom', 40.7, 81.3, 96.0, 80.0], ['Cube', 32.0, 47.3, 60.0, 55.3], ['Push-T', 40.0, 45.3, 17.3, 0.7]].map(([label, f, h2, h3, h4]) => ({ label, values: { f, h2, h3, h4 } })),
    max: 100, unit: '%', ticks: [0, 50, 100], digits: 1,
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
  { q: 'JEPA — генеративная модель, которая рисует будущие кадры?', o: ['Да: она предсказывает следующий кадр, только экономнее', 'Нет: она предсказывает представление будущего кадра, а картинки на иллюстрациях рисуют декодеры, которые учат отдельно и только для показа', 'Да, если к ней подключить предиктор'], a: 1, e: 'ЛеКун пишет, что JEPA предсказывает не сам y, а его представление. У V-JEPA, DINO-WM и V-JEPA 2-AC декодер учится отдельно, а в DINO-WM ошибка декодера, пущенная в обучение предиктора, даже ухудшила планирование.' },
  { q: 'Функция потерь JEPA упала почти до нуля. Модель выучила мир?', o: ['Да: ошибка предсказания почти нулевая', 'Да, если обучение шло долго', 'Не обязательно: если энкодер выдаёт всем кадрам одно и то же представление, ошибка нулевая, а модель ничего не знает'], a: 2, e: 'Это коллапс представлений. В лаборатории 1 модель без защиты дала самую низкую функцию потерь из всех, а щуп по её представлениям не находил чашку. Поэтому JEPA проверяют вторым прибором: разбросом представлений и щупом.' },
  { q: 'Коллапс представлений — это то же самое, что схлопывание мод в AMP?', o: ['Нет: в AMP политика повторяет лишь часть движений из записей, а при коллапсе представлений энкодер перестаёт различать входы', 'Да, это одно явление в разных статьях', 'Да, оба лечатся скользящим средним'], a: 0, e: 'Схлопывание мод урока 6.2 — свойство состязательного обучения: из многих движений политика выбирает немногие. Коллапс представлений — вырожденное решение JEPA, при котором ошибка предсказания нулевая на любых данных.' },
  { q: 'Штраф за разброс представлений решает проблему коллапса целиком?', o: ['Да: раз представления разные, модель различает всё важное', 'Нет: энкодер может держать разброс за счёт того, что внутри записи не меняется, например света, и выбросить чашку; помогает угадывание действия по двум соседним представлениям', 'Нет: штраф вообще не помогает, нужен только целевой энкодер'], a: 1, e: 'Это медленный коллапс из лаборатории 1 и статьи H-JEPA: на записях DROID без потери обратной динамики модель хранила фон и выбрасывала руку. Угадывание действия заставляет представления меняться вместе с тем, что двигается.' },
  { q: 'Пиксели как цель обучения точнее представлений: в них же есть всё?', o: ['Да: представления теряют детали', 'Нет: у I-JEPA и V-JEPA цель в пространстве представлений дала энкодер лучше, а модель, которая восстанавливает пиксели, тратит силы на детали, которые не предсказать', 'Одинаково: важна только размерность'], a: 1, e: 'У I-JEPA разница огромная, у V-JEPA на видео меньше, но в пользу представлений во всех сравнениях, и учится V-JEPA примерно вдвое быстрее моделей, которые предсказывают пиксели.' },
  { q: 'Чтобы робот планировал по картинке-цели, нужны тысячи часов его записей с наградами?', o: ['Да: без наград модель не знает, что хорошо', 'Да, и только успешные попытки', 'Нет: предиктор модели Meta учили на десятках часов видео DROID без наград и меток успеха, а в лабораториях проверки не записали ни одной попытки'], a: 2, e: 'Энкодер учился на видео без действий, а цель задаёт картинка: расстояние до неё в пространстве представлений заменяет награду. В записях DROID были и удачные, и неудачные попытки.' },
  { q: 'Если модель мира красиво раскатывает будущее, она хорошо планирует?', o: ['Не обязательно: публичный чекпойнт модели Meta через декодер рисовал будущее не хуже исправленной модели, а планировал гораздо хуже', 'Да: хорошая раскатка и есть хорошая модель мира', 'Да, если раскатка длинная'], a: 0, e: 'Terver и соавторы показали, что успех планирования решают и настройки планировщика, и то, как расстояние до цели ведёт поиск. В лаборатории 2 модель кадров хорошо рисовала стол, но вдали от цели её расстояние не указывало, куда толкать.' },
  { q: 'Модель мира V-JEPA 2-AC работает с любой камеры?', o: ['Да: энкодер видел миллион часов видео', 'Да, если камера цветная', 'Нет: авторы вручную подбирали положение камеры, а ошибка в осях действий, которые модель выводит по кадру, почти линейно растёт с углом камеры'], a: 2, e: 'Предиктор получает действия в осях робота, а видит сцену одной некалиброванной камерой. Если база робота не видна, понять направление осей трудно, и модель ошибается систематически.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('stats', initStats);
    safe('collapse', () => { mis.collapse = CollapseLab.init(); });
    safe('goal', () => { mis.goal = GoalLab.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['clMis', 'glMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l72 = { mis, Collapse, CollapseLab, Goal, GoalLab, L72, QUIZ };
    window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

