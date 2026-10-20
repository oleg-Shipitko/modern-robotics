/* =====================================================================
   ui-l57.js — урок 5.7 «RL на реальных роботах и дообучение VLA».
   0) анимированные схемы (shared/anim.js): контур HIL-SERL — робот,
      человек с 3D-мышью, два буфера, классификатор награды, обучение;
      RECAP — попытки → функция ценности → преимущество по шагам → метка
      во входе политики;
   1) лаборатория «Трое на одних попытках»: 100 попыток робота под
      присмотром, три дообучения рядом на одних и тех же стартах;
   2) лаборатория «Вмешайся сам»: живая попытка из соседней ниши, читатель
      перехватывает чашку, дообучение с буфером исправлений;
   3) лаборатория «Минуты на роботе»: кривые «ещё демонстрации» и «опыт
      с исправлениями» по бюджету времени;
   4) квиз.
   Движок — l57/engine.js (без DOM) поверх shared/arm-core.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), warn: HeroKit.css('--warning'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
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
const canvasNarrow = (cv, w) => (cv.getBoundingClientRect().width || w) < 500;
const KIND = { home: 'обычная поза', near: 'у шкафа', shelf: 'из соседней ниши' };
const METH = { base: 'По демонстрациям', success: 'Только удачные', adv: 'Все с меткой', all: 'Все без разметки' };
const colorOf = (k, P) => ({ base: P.ink3, success: P.cl, adv: P.e2e, all: P.hy }[k] || P.ink3);
const perHour = (ev) => fmt(Math.round(ev.perHour), 0);
const okLine = (ev) => `${ev.ok} из ${ev.n}`;

/* =====================================================================
   0а. Схема: контур HIL-SERL — робот ездит, человек поправляет 3D-мышью,
   шаги идут в буферы, классификатор ставит награду, обучение берёт пакет
   наполовину из каждого буфера и присылает роботу новую политику
   ===================================================================== */
(() => {
  const T = 10;
  function box(c, k, A, P, b, title, sub, col, hot) {
    A.rect(c, b[0], b[1], b[2], b[3], 9, A.alpha(col, hot ? 0.18 : 0.06), col, hot ? 2.2 : 1.3);
    A.lab(c, k, title, b[0] + b[2] / 2, b[1] + 13, { px: 10.5, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, b[0] + b[2] / 2, b[1] + b[3] - 10, { px: 10, color: P.ink2, halo: false });
  }
  /** Стопка переходов: синие — шаги робота, оранжевые — шаги человека. */
  function stack(c, A, P, x, y, w, h, n, nH) { const dy = Math.min(5, h / 9); for (let i = 0; i < n; i++) A.rect(c, x, y + h - (i + 1) * dy, w, dy * 0.66, 1.5, A.alpha(i < nH ? P.mot : P.out, 0.8), null); }
  function hand(c, A, P, x, y, r, active) {   // человек с 3D-мышью: кружок головы, плечи, пульт
    A.circle(c, x, y - r * 0.9, r * 0.42, active ? P.mot : A.alpha(P.ink3, 0.6), null);
    c.beginPath(); c.moveTo(x - r, y + r * 0.6); c.quadraticCurveTo(x, y - r * 0.5, x + r, y + r * 0.6); c.closePath(); c.fillStyle = active ? P.mot : A.alpha(P.ink3, 0.6); c.fill();
    A.rect(c, x + r * 0.55, y - r * 0.1, r * 0.9, r * 0.5, 3, P.ink2, null); A.circle(c, x + r, y - r * 0.1, r * 0.22, active ? P.mot : P.ink3, null);
  }
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, alpha } = A, B = g.b, n = g.narrow;
    const itv = u > 3 && u < 5.2;                      // человек держит управление
    const upd = (u % 2.5) > 1.7;                       // момент обновления
    // робот (actor), среда, человек
    box(c, k, A, P, B.act, n ? 'робот' : 'робот: политика π', n ? 'шаг 10 Гц' : 'действие 10 раз в секунду', P.out, !itv);
    box(c, k, A, P, B.hum, n ? 'человек' : 'человек с 3D-мышью', itv ? 'вмешался' : (n ? 'смотрит' : 'смотрит, готов перехватить'), P.mot, itv);
    hand(c, A, P, B.hum[0] + B.hum[2] / 2, B.hum[1] + B.hum[3] / 2 + 3, 10, itv);
    box(c, k, A, P, B.env, n ? 'сцена' : 'сцена: камеры, рука', n ? 'картинки 128×128' : 'кадры 128 × 128 и поза', P.ink3, false);
    box(c, k, A, P, B.rew, n ? 'награда' : 'классификатор награды', n ? '0 или 1' : 'по кадру: сделано — 1, нет — 0', P.spr, false);
    box(c, k, A, P, B.dem, n ? 'буфер демо' : 'буфер демонстраций', n ? '+ исправления' : '20–30 записей + исправления', P.mot, false);
    box(c, k, A, P, B.rl, n ? 'буфер RL' : 'буфер опыта робота', n ? 'все шаги' : 'все шаги, и человека тоже', P.out, false);
    box(c, k, A, P, B.lrn, n ? 'обучение' : 'обучение (RLPD)', n ? 'пакет 50/50' : 'пакет: половина из каждого буфера', P.spr, upd);
    // стрелки: действие → сцена → награда и переходы → буферы
    const r_ = (b) => [b[0] + b[2], b[1] + b[3] / 2], l_ = (b) => [b[0], b[1] + b[3] / 2], bt = (b) => [b[0] + b[2] / 2, b[1] + b[3]], tp = (b) => [b[0] + b[2] / 2, b[1]];
    const actCol = itv ? P.mot : P.out;
    A.arrow(c, r_(B.act)[0] + 2, r_(B.act)[1], l_(B.env)[0] - 2, l_(B.env)[1], actCol, 2, 7);
    // подпись стрелки — в две строки (первое слово и остальное): между блоками мало места
    const al = itv ? 'действие человека' : 'действие политики', sp = al.indexOf(' '), ax = (r_(B.act)[0] + l_(B.env)[0]) / 2, ay = r_(B.act)[1];
    A.lab(c, k, sp < 0 ? al : al.slice(0, sp), ax, ay - 23, { px: 10, color: actCol, halo: false });
    if (sp >= 0) A.lab(c, k, al.slice(sp + 1), ax, ay - 10, { px: 10, color: actCol, halo: false });
    A.arrow(c, bt(B.hum)[0], bt(B.hum)[1] + 2, tp(B.act)[0], tp(B.act)[1] - 2, itv ? P.mot : alpha(P.mot, 0.35), itv ? 2.2 : 1.4, 7);
    A.arrow(c, bt(B.env)[0], bt(B.env)[1] + 2, tp(B.rew)[0], tp(B.rew)[1] - 2, P.ink3, 1.6, 6);
    // переходы летят в буферы: шаги робота — только в буфер опыта, шаги человека — в оба
    const s = (u * 0.8) % 1;
    const dot = (a, b, col) => { const x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s; A.rect(c, x - 5, y - 3, 10, 6, 2, col, null); };
    if (n) {   // узкая раскладка: в буфер опыта — ломаной по правому краю, в буфер демонстраций — прямо вниз
      const gx = B.rl[0] + B.rl[2] + 14, p1 = [r_(B.rew)[0] + 2, r_(B.rew)[1]], p2 = [gx, r_(B.rew)[1]], p3 = [gx, r_(B.rl)[1]];
      A.line(c, [p1, p2, p3], alpha(P.ink3, 0.6), 1.4); A.arrow(c, p3[0], p3[1], r_(B.rl)[0] + 2, r_(B.rl)[1], alpha(P.ink3, 0.6), 1.4, 6);
      dot(p2, p3, itv ? P.mot : P.out);
      A.arrow(c, bt(B.rew)[0], bt(B.rew)[1] + 2, tp(B.dem)[0], tp(B.dem)[1] - 2, itv ? alpha(P.mot, 0.8) : alpha(P.ink3, 0.25), itv ? 1.8 : 1.2, 6);
      if (itv) dot(bt(B.rew), tp(B.dem), P.mot);
    } else {   // широкая: в буфер опыта — прямо вправо, в буфер демонстраций — ломаной по просвету между колонками
      A.arrow(c, r_(B.rew)[0] + 2, r_(B.rew)[1], l_(B.rl)[0] - 2, l_(B.rl)[1], alpha(P.ink3, 0.6), 1.4, 6);
      dot(r_(B.rew), l_(B.rl), itv ? P.mot : P.out);
      const gx = B.rew[0] + B.rew[2] + 30, p1 = [r_(B.rew)[0] + 2, r_(B.rew)[1] - 12], p2 = [gx, r_(B.rew)[1] - 12], p3 = [gx, l_(B.dem)[1]];
      A.line(c, [p1, p2, p3], itv ? alpha(P.mot, 0.8) : alpha(P.ink3, 0.25), itv ? 1.8 : 1.2); A.arrow(c, p3[0], p3[1], l_(B.dem)[0] - 2, l_(B.dem)[1], itv ? alpha(P.mot, 0.8) : alpha(P.ink3, 0.25), itv ? 1.8 : 1.2, 6);
      if (itv) dot(p2, p3, P.mot);
    }
    stack(c, A, P, B.dem[0] + 12, B.dem[1] + 22, B.dem[2] - 24, B.dem[3] - 42, 6, 6);
    stack(c, A, P, B.rl[0] + 12, B.rl[1] + 22, B.rl[2] - 24, B.rl[3] - 42, 3 + Math.floor(seg(u, 0, T - 0.5) * 5.99), 1);
    // пакет: половина из каждого буфера → обучение → новая политика роботу
    if (n) { A.arrow(c, l_(B.dem)[0] - 2, l_(B.dem)[1], r_(B.lrn)[0] + 2, r_(B.lrn)[1] - 8, P.mot, 1.8, 6); A.arrow(c, l_(B.rl)[0] - 2, l_(B.rl)[1], r_(B.lrn)[0] + 2, r_(B.lrn)[1] + 8, P.out, 1.8, 6); }
    else { A.arrow(c, bt(B.dem)[0], bt(B.dem)[1] + 2, tp(B.lrn)[0], tp(B.lrn)[1] - 2, P.mot, 1.8, 6); A.arrow(c, tp(B.rl)[0], tp(B.rl)[1] - 2, bt(B.lrn)[0], bt(B.lrn)[1] + 2, P.out, 1.8, 6); }
    if (n) A.arrow(c, tp(B.lrn)[0], tp(B.lrn)[1] - 2, bt(B.act)[0], bt(B.act)[1] + 2, upd ? P.spr : alpha(P.spr, 0.45), upd ? 2.4 : 1.4, 7);
    else A.arrow(c, l_(B.lrn)[0] - 2, l_(B.lrn)[1], tp(B.act)[0] + 20, tp(B.act)[1] - 2, upd ? P.spr : alpha(P.spr, 0.45), upd ? 2.4 : 1.4, 7);
    A.lab(c, k, n ? 'новые веса π' : 'новые веса политики — роботу', g.wlab[0], g.wlab[1], { px: 10, color: P.spr, halo: false, align: g.wlab[2] || 'center' });
    const cap = n
      ? (itv ? ['Человек перехватил: его шаги — в оба буфера,', 'шаги политики до и после — в буфер опыта'] : upd ? ['Обучение: половина пакета из демонстраций', 'и исправлений, половина — из опыта робота'] : ['Робот работает сам, награда по кадру 0 или 1,', 'человек смотрит и готов перехватить'])
      : (itv ? ['Человек перехватил управление: его шаги идут в оба буфера,', 'шаги политики до и после — только в буфер опыта'] : upd ? ['Обучение: пакет наполовину из демонстраций и исправлений,', 'наполовину из опыта робота; новая политика — на робота'] : ['Робот работает сам, классификатор по кадру ставит 0 или 1,', 'человек смотрит и готов перехватить 3D-мышью']);
    A.lab(c, k, cap[0], g.cap[0], g.cap[1], { px: n ? 10.5 : 12, weight: 700, color: P.ink, halo: false, align: 'left' });
    A.lab(c, k, cap[1], g.cap[0], g.cap[1] + 17, { px: n ? 10.5 : 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  // блоки шире подписей 10 px до k ≈ 1,08 (уже 700 px — узкая раскладка); между колонками место под подпись стрелки в две строки
  const WIDE = { narrow: false, b: { hum: [16, 20, 160, 62], act: [16, 190, 160, 62], env: [236, 190, 180, 62], rew: [236, 290, 180, 58], dem: [478, 20, 210, 62], lrn: [478, 128, 210, 62], rl: [478, 262, 210, 58] }, wlab: [326, 148], cap: [20, 372] };
  // в узкой раскладке блок человека выше: значок не задевает подписи
  const NARROW = { narrow: true, b: { hum: [10, 8, 116, 70], act: [10, 100, 116, 54], env: [194, 100, 136, 54], rew: [194, 186, 136, 54], dem: [194, 272, 136, 54], rl: [194, 358, 136, 54], lrn: [10, 300, 116, 54] }, wlab: [74, 228, 'left'], cap: [10, 448] };
  Anim.add('hil', {
    W: 720, H: 400, start: 2.2, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 490, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
})();

/* =====================================================================
   0б. Схема: RECAP — одна попытка робота, функция ценности по шагам,
   преимущество, метка «positive/negative» во входе политики
   ===================================================================== */
(() => {
  const T = 12, N = 14;
  // условная попытка: ценность растёт, в середине ошибка (падение), потом исправление; числа условные
  const V = [-0.95, -0.9, -0.84, -0.78, -0.74, -0.8, -0.86, -0.78, -0.66, -0.52, -0.38, -0.24, -0.1, 0];
  const WHO = [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
  function draw(c, k, t, P, A, g) {
    const u = ((t % T) + T) % T, { seg, alpha, lab, line, circle } = A, n = g.narrow;
    const shown = Math.min(N - 1, Math.floor(seg(u, 0.4, 7) * (N - 0.01)));  // сколько шагов уже оценено
    const labelOn = u > 7.6, policyOn = u > 9.2;
    const { x0, x1, y0, y1 } = g.plot, X = (i) => x0 + (x1 - x0) * i / (N - 1), Y = (v) => y1 - (v + 1) * (y1 - y0);
    // оси графика ценности
    line(c, [[x0, y1], [x1, y1]], P.ink3, 1.2); line(c, [[x0, y0], [x0, y1]], P.ink3, 1.2);
    lab(c, k, n ? 'шаги попытки →' : 'шаги одной попытки →', x1, y1 - 8, { px: 10, color: P.ink3, align: 'right', halo: false });
    lab(c, k, n ? 'V: −шагов до успеха' : 'ценность V(o): минус шагов до успеха', x0 + 2, y0 - 9, { px: 10, color: P.ink3, align: 'left', halo: false });
    lab(c, k, '0', x0 - 6, Y(0), { px: 10, color: P.ink3, align: 'right', halo: false }); lab(c, k, '−1', x0 - 6, Y(-1), { px: 10, color: P.ink3, align: 'right', halo: false });
    // лента шагов: кто делал шаг
    const ty = g.tape, tw = (x1 - x0) / N;
    for (let i = 0; i < N; i++) {
      const col = WHO[i] ? P.mot : P.out, x = x0 + tw * i;
      A.rect(c, x + 1, ty, tw - 2, 12, 2, alpha(col, i <= shown ? 0.85 : 0.25), null);
    }
    if (n) { lab(c, k, 'синие — шаги робота,', x0, ty + 24, { px: 10, color: P.ink3, align: 'left', halo: false }); lab(c, k, 'оранжевые — исправление человека', x0, ty + 37, { px: 10, color: P.ink3, align: 'left', halo: false }); }
    else lab(c, k, 'лента попытки: синие — шаги робота, оранжевые — исправление оператора', x0, ty + 24, { px: 10, color: P.ink3, align: 'left', halo: false });
    // кривая V по шагам
    const pts = []; for (let i = 0; i <= shown; i++) pts.push([X(i), Y(V[i])]);
    if (pts.length > 1) line(c, pts, P.spr, 2.4);
    for (let i = 0; i <= shown; i++) circle(c, X(i), Y(V[i]), 3, P.spr, null);
    // преимущество: разность V на N шагов (здесь 2) и метка
    const NS = 2, eps = 0.02;
    for (let i = 0; i < N - NS && i <= shown - NS; i++) {
      const adv = V[i + NS] - V[i] - 2 / N, pos = WHO[i] ? true : adv > eps;
      if (labelOn) { const col = pos ? P.good : P.bad; lab(c, k, pos ? '+' : '−', X(i), g.tape - 10, { px: 12, weight: 800, color: col, halo: false }); }
      else if (i === Math.min(shown - NS, N - NS - 1)) {   // стрелка текущего преимущества
        A.arrow(c, X(i), Y(V[i]), X(i + NS), Y(V[i + NS]), adv > eps ? P.good : P.bad, 2.2, 7);
        lab(c, k, `A = ${adv > 0 ? '+' : '−'}${fmt(Math.abs(adv), 2)}`, X(i + NS) + 8, Y(V[i + NS]) - 10, { px: 10.5, weight: 700, color: adv > eps ? P.good : P.bad, halo: false, align: 'left' });
      }
    }
    // политика справа: вход с меткой
    const pb = g.pol;
    A.rect(c, pb[0], pb[1], pb[2], pb[3], 10, alpha(P.mot, policyOn ? 0.16 : 0.06), P.mot, policyOn ? 2.2 : 1.3);
    lab(c, k, n ? 'политика' : 'политика (VLA)', pb[0] + pb[2] / 2, pb[1] + 14, { px: 10.5, weight: 700, color: P.mot, halo: false });
    lab(c, k, n ? 'вход: кадр, задача,' : 'вход: кадры, задача и текст', pb[0] + pb[2] / 2, pb[1] + 32, { px: 10, color: P.ink2, halo: false });
    const tag = policyOn ? '«Advantage: positive»' : labelOn ? (n ? '«Advantage: ±»' : '«Advantage: positive / negative»') : '…';
    lab(c, k, tag, pb[0] + pb[2] / 2, pb[1] + 50, { px: n ? 10 : 10.5, weight: 700, color: policyOn ? P.good : P.ink, halo: false });
    const pSub = policyOn ? (n ? ['при работе — всегда positive'] : ['при работе во вход', 'всегда пишут positive']) : (n ? ['учится на всех шагах'] : ['учится на всех шагах,', 'метка подсказывает, какие лучше']);
    pSub.forEach((s, i) => lab(c, k, s, pb[0] + pb[2] / 2, pb[1] + pb[3] - 10 - (pSub.length - 1 - i) * 15, { px: 10, color: P.ink2, halo: false }));
    const cap = n
      ? (policyOn ? ['При работе во вход пишут «positive»:', 'модель повторяет шаги лучше обычного'] : labelOn ? ['Порог ε: A > ε — positive, иначе negative;', 'исправления человека всегда positive'] : shown < N - 1 ? ['Ценность: сколько шагов до успеха;', 'преимущество — на сколько шаг её поднял'] : ['Ошибка уронила ценность, исправление', 'подняло; дальше преимущество по шагам'])
      : (policyOn ? ['При работе во вход пишут «positive»:', 'модель повторяет только шаги лучше обычного'] : labelOn ? ['Порог ε: шаги с A > ε — positive, остальные — negative;', 'исправления человека всегда positive'] : shown < N - 1 ? ['Функция ценности оценивает каждый кадр: сколько шагов', 'до успеха; преимущество — на сколько шаг её поднял'] : ['Ошибка робота уронила ценность, исправление подняло;', 'дальше преимущество считается по шагам']);
    lab(c, k, cap[0], g.cap[0], g.cap[1], { px: n ? 10.5 : 12, weight: 700, color: P.ink, halo: false, align: 'left' });
    lab(c, k, cap[1], g.cap[0], g.cap[1] + 17, { px: n ? 10.5 : 12, weight: 600, color: P.ink2, halo: false, align: 'left' });
  }
  Anim.add('recap', {
    W: 720, H: 350, start: 3.4, narrowAt: 700,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { plot: { x0: 50, x1: 450, y0: 30, y1: 210 }, tape: 236, pol: [482, 58, 222, 112], cap: [50, 300] }); },
    narrow: { W: 360, H: 470, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, plot: { x0: 36, x1: 340, y0: 24, y1: 180 }, tape: 206, pol: [36, 258, 300, 90], cap: [20, 400] }); } },
  });
})();

/* =====================================================================
   Рисование: вид сбоку на Аду, её руку с чашкой и шкаф с нишами.
   Логический канвас 360 × 360, 260 пикселей на метр, плечо Ады в (100, 150).
   ===================================================================== */
const View = (() => {
  const W = 360, H = 360, SC = 260, OX = 100, OY = 150, E = L57;
  const X = (x) => OX + x * SC, Y = (y) => OY - y * SC;
  const colors = () => { const d = HeroKit.dark(); return { adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', wood: d ? '#5a4c38' : '#d9c7a6', woodDark: d ? '#3e3428' : '#b89b73', cupFill: d ? '#d9d6cc' : '#ffffff', cupLine: d ? '#b0afa6' : '#3d3c38' }; };
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.roundRect(x, y, w, hh, r); }
  /** Ада сбоку: голова, корпус, колёсная база; плечо — в начале координат. */
  function ada(c, K, P) {
    c.lineWidth = 2.2; c.strokeStyle = K.adaLine; c.fillStyle = K.adaFill;
    rr(c, X(-0.33), Y(0.07), 0.3 * SC, 0.5 * SC, 22); c.fill(); c.stroke();
    c.fillStyle = K.adaFill; rr(c, X(-0.29), Y(0.33), 0.24 * SC, 0.2 * SC, 20); c.fill(); c.stroke();
    rr(c, X(-0.15), Y(0.29), 0.11 * SC, 0.11 * SC, 9); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(X(-0.085), Y(0.235), 3.5, 5, 0, 0, 7); c.fill();
    c.fillStyle = K.adaFill; c.strokeStyle = K.adaLine; rr(c, X(-0.36), Y(-0.45), 0.36 * SC, 0.13 * SC, 10); c.fill(); c.stroke();
    for (const wx of [-0.28, -0.08]) { c.beginPath(); c.arc(X(wx), Y(-0.6), 0.045 * SC, 0, 7); c.fillStyle = P.ink3; c.fill(); }
  }
  /** Шкаф: вертикальная стенка с нишами на высотах yn + k·шаг, между ними полки; нужная ниша подсвечена. */
  function cabinet(c, yn, P, K, noTarget) {
    const C = E.CFG, xw = X(C.XW), xd = X(C.XW + C.ND), top = Y(0.58), bot = Y(-0.645);
    c.fillStyle = K.wood; c.fillRect(xw, top, xd - xw + 10, bot - top);
    c.fillStyle = K.woodDark; c.fillRect(xd, top, 10, bot - top);                      // задняя стенка
    for (let kk = -6; kk <= 6; kk++) {                                                  // проёмы ниш
      const yc = yn + kk * C.PITCH; if (yc + C.NH / 2 > 0.58 || yc - C.NH / 2 < -0.645) continue;
      c.fillStyle = kk === 0 && !noTarget ? HeroKit.css('--good-soft') : P.bg; c.fillRect(xw, Y(yc + C.NH / 2), xd - xw, C.NH * SC);
      if (kk === 0 && !noTarget) { c.setLineDash([3, 3]); c.strokeStyle = P.good; c.lineWidth = 1.4; c.strokeRect(xw + 0.5, Y(yc + C.NH / 2) + 0.5, xd - xw - 1, C.NH * SC - 1); c.setLineDash([]); }
    }
    c.strokeStyle = K.woodDark; c.lineWidth = 1; c.strokeRect(xw + 0.5, top + 0.5, xd - xw + 9, bot - top - 1);
    // отметка глубины успеха
    if (!noTarget) { c.setLineDash([2, 3]); c.strokeStyle = P.good; c.lineWidth = 1; c.beginPath(); c.moveTo(X(C.XW + C.IN), Y(yn + C.NH / 2)); c.lineTo(X(C.XW + C.IN), Y(yn - C.NH / 2)); c.stroke(); c.setLineDash([]); }
  }
  /** Рука: два звена, суставы, захват и чашка радиусом RG. */
  function arm(c, q, P, K, col, o) {
    o = o || {}; const f = E.fk(q), b = [X(0), Y(0)], e = [X(f.x1), Y(f.y1)], w = [X(f.x), Y(f.y)];
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; if (o.ghost) c.globalAlpha = 0.35;
    for (const [lw, cc] of [[11, col], [6.5, P.surf]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.stroke(); }
    for (const p of [b, e]) { c.beginPath(); c.arc(p[0], p[1], 4.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    const r = E.CFG.RG * SC; c.lineWidth = 1.8; c.strokeStyle = K.cupLine; c.fillStyle = K.cupFill;
    rr(c, w[0] - r, w[1] - r * 0.9, 2 * r, 1.8 * r, [2, 2, 4, 4]); c.fill(); c.stroke();
    c.beginPath(); c.arc(w[0], w[1], 3.2, 0, 7); c.fillStyle = col; c.fill();
    c.restore(); return { x: w[0], y: w[1] };
  }
  /** Путь чашки: линия и точки через шаг; who — чьи шаги (оранжевые — человека). */
  function path(c, traj, col, P, o) {
    o = o || {}; if (!traj || traj.length < 2) return;
    c.save(); c.globalAlpha = o.alpha == null ? 0.9 : o.alpha; c.lineWidth = o.lw || 1.6; c.lineCap = 'round';
    for (let i = 1; i < traj.length; i++) { const w = o.who && o.who[i - 1]; c.strokeStyle = w ? P.e2e : col; c.lineWidth = w ? 2.6 : (o.lw || 1.6); c.beginPath(); c.moveTo(X(traj[i - 1].x), Y(traj[i - 1].y)); c.lineTo(X(traj[i].x), Y(traj[i].y)); c.stroke(); }
    if (o.dots !== false) for (let i = 0; i < traj.length; i++) { c.beginPath(); c.arc(X(traj[i].x), Y(traj[i].y), 1.9, 0, 7); c.fillStyle = o.who && o.who[i - 1] ? P.e2e : col; c.fill(); }
    c.restore();
  }
  function mark(c, p, outcome, P) { const x = X(p.x), y = Y(p.y); if (outcome === 'crash') HeroKit.cross(c, x, y, 7, P.bad, 2.6); else if (outcome === 'goal') HeroKit.check(c, x, y - 1, 7, P.good, 2.6); else if (outcome === 'timeout') { c.beginPath(); c.arc(x, y, 5, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 2; c.stroke(); } }
  /** Фон сцены: пол, Ада, шкаф с нишей на высоте yn. */
  function base(cv, yn, o) {
    o = o || {}; const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = P.grid; c.fillRect(0, Y(-0.645), W, H - Y(-0.645));
    cabinet(c, yn, P, K, o.noTarget); ada(c, K, P);
    return { c, k, P, K, sh: k > 1.5 };
  }
  /** Влезает ли подпись в maxW логических единиц канваса (шрифт задан в экранных пикселях, поэтому на узком канвасе подпись шире). */
  function fits(c, k, txt, px, weight, maxW) { HeroKit.font(c, k, px, weight); return c.measureText(txt).width <= maxW; }
  /** Сцена попытки: рука в последней позе, путь чашки, исход; подписи сверху. Короткие варианты подписей — когда длинный не влезает в ширину канваса. */
  function scene(cv, ep, o) {
    o = o || {}; const { c, k, P, K, sh } = base(cv, ep ? ep.yn : o.yn == null ? 0.15 : o.yn), col = o.color || P.e2e;
    if (!ep) { if (o.q) arm(c, o.q, P, K, col); if (o.empty) HeroKit.label(c, k, o.emptyShort && (sh || !fits(c, k, o.empty, 12.5, 700, W - 32)) ? o.emptyShort : o.empty, W / 2 - 10, 330, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.grid }); return { c, k, P }; }
    const qs = ep.qs, last = o.step == null ? qs.length - 1 : Math.min(o.step, qs.length - 1);
    if (o.ghostStart) arm(c, qs[0], P, K, col, { ghost: true });
    path(c, ep.traj.slice(0, last + 1), col, P, { who: ep.who });
    arm(c, qs[last], P, K, col);
    if (last === qs.length - 1 && ep.outcome) mark(c, ep.traj[last], ep.outcome, P);
    const lh = 15 * Math.max(1, k), y1 = 6 + 9 * Math.max(1, k), title = o.titleShort && (sh || !fits(c, k, o.title, 12, 700, W - 16)) ? o.titleShort : o.title;
    if (title) HeroKit.label(c, k, title, 8, y1, { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    if (o.sub !== false) {
      const txt = last < qs.length - 1 || !ep.outcome ? `шаг ${last} из ${ep.T}` : ep.outcome === 'goal' ? `чашка в нише за ${ep.T} ${plural(ep.T, 'шаг', 'шага', 'шагов')}` : ep.outcome === 'crash' ? `задела полку на шаге ${ep.T}` : 'время вышло';
      HeroKit.label(c, k, txt, 8, title ? y1 + lh : y1, { px: 11.5, weight: 650, color: ep.outcome === 'goal' && last === qs.length - 1 ? P.good : ep.outcome === 'crash' && last === qs.length - 1 ? P.bad : P.ink2, align: 'left', haloColor: P.bg });
    }
    return { c, k, P };
  }
  return { W, H, SC, X, Y, colors, ada, cabinet, arm, path, mark, base, scene };
})();

/* =====================================================================
   Общее: базовая политика, попытки робота и дообучения считаются один раз
   и лежат в памяти; обучение идёт кусками между кадрами с полоской прогресса
   ===================================================================== */
const Store = (() => {
  const E = L57, cache = {}, pending = {};
  /** Прогнать генератор обучения кусками; onProg(доля 0…1) не чаще раза в 150 мс. */
  async function chunked(gen, onProg, weight) {
    let last = 0;
    return runChunked(gen, (ev) => { const now = performance.now(); if (onProg && ev && ev.of && now - last > 150) { last = now; onProg(ev.it / ev.of); } }, 14);
  }
  /** Один раз на ключ: если расчёт уже идёт — дождаться его. */
  async function once(key, make, onProg) {
    if (cache[key]) return cache[key];
    if (pending[key]) { await pending[key]; return cache[key]; }
    pending[key] = (async () => { cache[key] = await make(onProg); })();
    try { await pending[key]; } finally { delete pending[key]; }
    return cache[key];
  }
  const base = (onProg) => once('base', async (p) => { const r = await chunked(E.trainBase(), p); return Object.assign(r, { ev: E.evaluate(r.P, 0), evShelf: E.evaluate(r.P, 0, E.starts('shelf')) }); }, onProg);
  /** 100 попыток под присмотром наблюдателя (лаборатория 1) и 100 попыток без присмотра (лаборатория 2). */
  const watched = async () => { const b = await base(); return once('watched', async () => E.collectWithTeacher(b.P, E.CFG.N_ROLL, E.CFG.SEED * 17 + 1)); };
  const auto = async () => { const b = await base(); return once('auto', async () => E.collect(b.P, E.CFG.N_ROLL, E.CFG.SEED * 17 + 1)); };
  /** Дообучение базовой политики способом method на попытках eps; key — имя для памяти. */
  const finetune = (key, eps, method, opts, onProg) => once(key, async (p) => { const b = await base(); const r = await chunked(E.finetune(b.P, eps, method, opts), p); const runI = method === 'adv' ? 1 : 0; return Object.assign(r, { method, runI, ev: E.evaluate(r.P, runI), evShelf: E.evaluate(r.P, runI, E.starts('shelf')) }); }, onProg);
  /** Политика по n демонстрациям для лаборатории 3; secs — время только новых записей: первые N_DEMO те же, что у базовой политики, с неё начинают оба пути. */
  const demoPolicy = (n, onProg) => once('demo' + n, async (p) => { const r = await chunked(E.trainDemoPolicy(n), p); return Object.assign(r, { ev: E.evaluate(r.P, 0), added: r.D.length - E.CFG.N_DEMO, secs: r.D.slice(E.CFG.N_DEMO).reduce((a, e) => a + e.T * E.STEP_S + E.RESET_S, 0) }); }, onProg);
  const get = (key) => cache[key] || null;
  return { base, watched, auto, finetune, demoPolicy, get, cache };
})();
/** Сколько шагов и секунд в наборе попыток. */
const stats = (eps) => { const E = L57; let steps = 0, human = 0, secs = 0, ok = 0, iv = 0, ivOk = 0; const by = { home: [0, 0], near: [0, 0], shelf: [0, 0] }; for (const e of eps) { steps += e.T; secs += e.T * E.STEP_S + E.RESET_S; const h = e.who.reduce((a, w) => a + w, 0); human += h; if (h) { iv++; if (e.outcome === 'goal') ivOk++; } by[e.kind][1]++; if (e.outcome === 'goal') { ok++; by[e.kind][0]++; } } return { n: eps.length, ok, fail: eps.length - ok, steps, human, secs, iv, ivOk, by }; };

/* =====================================================================
   1. Лаборатория: трое на одних попытках — сравнение рядом
   ===================================================================== */
const Trio = (() => {
  const E = L57, K = HeroKit, METHODS = ['success', 'adv', 'all'];
  const st = { mode: 'map', k: 0, view: 'ok', busy: false, prog: 0, msg: '' };
  let ctl = null;
  const res = (m) => Store.get('trio.' + m);
  const b = () => Store.get('base');
  const eps = () => Store.get('watched');
  /** Первый проверочный старт из соседней ниши — там политики различаются сильнее всего. */
  const firstShelf = () => { const s = E.starts('all'); for (let i = 0; i < s.length; i++) if (s[i].kind === 'shelf') return i; return 0; };
  /** Карта попыток: точки стартов чашки, крестики — где попытка кончилась столкновением. Шкаф — без конкретной ниши. */
  function drawMap(cv, list, title, P0) {
    const { c, k, P, K: KK, sh } = View.base(cv, 0.15, { noTarget: true });
    // стартовые точки: пустой кружок — удача, крестик — столкновение
    for (const e of list) { const p0 = e.traj[0]; c.beginPath(); c.arc(View.X(p0.x), View.Y(p0.y), 3.2, 0, 7); c.fillStyle = e.outcome === 'goal' ? P.good : P.bad; c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1; }
    for (const e of list) if (e.outcome === 'crash') { const pl = e.traj[e.traj.length - 1]; K.cross(c, View.X(pl.x), View.Y(pl.y), 4, P.bad, 1.8); }
    View.arm(c, E.ik(0.26, 0.15), P, KK, P.ink3, { ghost: true });
    const s = stats(list);
    K.label(c, k, `${s.ok} из ${s.n} удачных`, 8, 6 + 9 * Math.max(1, k), { px: 12, weight: 700, color: P.ink, align: 'left', haloColor: P.bg });
    K.label(c, k, sh ? `${s.human} ${plural(s.human, 'шаг', 'шага', 'шагов')} наблюдателя` : `шагов наблюдателя в записях: ${s.human}`, 8, 6 + 9 * Math.max(1, k) + 15 * Math.max(1, k), { px: 11.5, weight: 650, color: P.ink2, align: 'left', haloColor: P.bg });
  }
  function drawPane(i) {
    const cv = $('#tCv' + i), head = $('#tHead' + i), sub = $('#tSub' + i), stat = $('#tStat' + i), P = pal();
    if (st.mode === 'map') {
      const list = eps(), kinds = ['home', 'near', 'shelf'][i], title = ['Старт из обычной позы', 'Старт у шкафа', 'Старт из соседней ниши'][i];
      head.textContent = title; head.className = 'c-map'; setOut(sub, 'попытки робота под присмотром');
      if (!list) { View.scene(cv, null, { q: E.ik(0.26, 0.15), empty: st.busy ? 'Ада учится…' : 'нажми кнопку миссии: 100 попыток', emptyShort: 'нажми кнопку миссии' }); setOut(stat, 'Попыток ещё нет'); stat.className = 'pane-stat'; return; }
      const sel = list.filter((e) => e.kind === kinds), s = stats(sel);
      drawMap(cv, sel, title);
      setOut(stat, `<b>${s.ok} из ${s.n} удачных</b> · ${s.n - s.ok} ${plural(s.n - s.ok, 'промах', 'промаха', 'промахов')} · вмешательств ${s.iv}`);
      stat.className = 'pane-stat ' + (s.n && s.ok / s.n >= 0.8 ? 'ok' : s.n && s.ok / s.n <= 0.5 ? 'bad' : ''); return;
    }
    const m = METHODS[i], r = res(m), col = colorOf(m, P);
    head.textContent = METH[m]; head.className = 'c-' + m; setOut(sub, m === 'success' ? 'дообучена на 81 удачной попытке' : m === 'adv' ? 'все 100 попыток, метка во входе' : 'все 100 попыток как есть');
    if (!r) { View.scene(cv, null, { q: E.ik(0.26, 0.15), empty: st.busy ? 'Ада учится…' : 'ещё не обучена', emptyShort: 'ещё не обучена', color: col }); setOut(stat, st.busy ? 'Ада учится…' : 'Ещё не обучена'); stat.className = 'pane-stat'; return; }
    const ep = r.ev.eps[st.k];
    View.scene(cv, ep, { color: col, title: `старт ${st.k + 1} из 60: ${KIND[ep.kind]}`, titleShort: `старт ${st.k + 1}: ${KIND[ep.kind]}`, ghostStart: true });
    setOut(stat, `<b>${r.ev.ok} из 60 удачных</b> · ${fmt(r.ev.tGoal, 1)} шага до ниши · ${perHour(r.ev)} в час`);
    stat.className = 'pane-stat ' + (r.ev.ok >= 55 ? 'ok' : r.ev.ok <= 48 ? 'bad' : '');
  }
  function drawBoard() {
    const cv = $('#tBoard'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 300 : 280;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const rows = [['base', b() && b().ev], ...METHODS.map((m) => [m, res(m) && res(m).ev])].filter((r) => r[1]);
    if (!rows.length || st.mode === 'map') { K.label(c, k, narrow ? 'сводка появится после второй миссии' : 'сводка по политикам появится, когда дообучишь три политики во второй миссии', W / 2, H / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const L = narrow ? 46 : 44, R = 12, T = narrow ? 36 : 30, B = narrow ? 70 : 48, gw = W - L - R, gh = H - T - B;   // слева место под «100%», сверху — под заголовок и подпись столбика 100% на телефоне
    const speed = st.view === 'speed';
    const groups = speed ? [['tGoal', 'шагов до ниши'], ['perHour', 'удачных в час']] : [['all', 'все 60 стартов'], ['home', 'обычная поза (40)'], ['near', 'у шкафа (12)'], ['shelf', 'из ниши (8)']];
    const val = (ev, g) => (g === 'all' ? ev.ok / ev.n : g === 'tGoal' ? ev.tGoal : g === 'perHour' ? ev.perHour : ev.by[g].ok / Math.max(1, ev.by[g].n));
    const lo = 0, hi = speed ? null : 1;
    const gwid = gw / groups.length, bw = Math.min(26, gwid / (rows.length + 1.5));
    groups.forEach(([g, name], gi) => {
      const gx = L + gwid * gi, vals = rows.map((r) => val(r[1], g)), mx = speed ? (g === 'tGoal' ? 16 : 700) : 1;
      const Y = (v) => T + gh * (1 - Math.max(0, Math.min(1, (v - lo) / (mx - lo))));
      c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(gx + 6, Y(0)); c.lineTo(gx + gwid - 6, Y(0)); c.stroke();
      rows.forEach(([key, ev], j) => {
        const v = vals[j], x = gx + gwid / 2 + (j - (rows.length - 1) / 2) * (bw + 4) - bw / 2, col = colorOf(key, P);
        c.fillStyle = col; c.globalAlpha = key === 'base' ? 0.55 : 0.9; c.fillRect(x, Y(v), bw, Y(0) - Y(v)); c.globalAlpha = 1;
        const txt = speed ? (g === 'tGoal' ? fmt(v, 1) : fmt(Math.round(v), 0)) : `${ev[g === 'all' ? 'ok' : 'x'] != null && g === 'all' ? ev.ok : ev.by[g].ok}`;
        K.label(c, k, txt, x + bw / 2, Y(v) - 8, { px: 10, weight: 650, color: P.ink2, haloColor: P.surf });
      });
      K.label(c, k, narrow ? ({ all: 'все 60', home: 'обычная', near: 'у шкафа', shelf: 'из ниши', tGoal: 'шагов до ниши', perHour: 'удачных в час' }[g]) : name, gx + gwid / 2, H - B + 14, { px: narrow ? 10 : 11, weight: 650, color: P.ink2, halo: false });
    });
    if (!speed) for (const v of [0.5, 1]) { const y = T + gh * (1 - v); c.strokeStyle = P.grid; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(L, y); c.lineTo(W - R, y); c.stroke(); c.setLineDash([]); K.label(c, k, `${v * 100}%`, L - 5, y, { px: 10, color: P.ink3, align: 'right', halo: false }); }
    K.label(c, k, speed ? (narrow ? 'скорость: шагов до ниши и удачных попыток в час' : 'скорость: среднее число шагов до ниши (меньше — быстрее) и удачных попыток в час') : (narrow ? 'удачных из стартов каждого вида' : 'удачных проверочных попыток из стартов каждого вида'), narrow ? 8 : L, 11, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    // легенда
    let lx = L; const ly0 = H - (narrow ? 26 : 12);
    rows.forEach(([key], i) => { const ly = narrow ? ly0 + (i % 2) * 14 : ly0; if (narrow && i % 2 === 0) lx = L + Math.floor(i / 2) * 150; c.fillStyle = colorOf(key, P); c.globalAlpha = key === 'base' ? 0.55 : 0.9; c.fillRect(lx, ly - 5, 10, 10); c.globalAlpha = 1; const t = METH[key]; K.label(c, k, t, lx + 14, ly, { px: 10, color: P.ink2, align: 'left', halo: false }); if (!narrow) lx += 14 + c.measureText(t).width + 14; });
  }
  function render() {
    for (let i = 0; i < 3; i++) drawPane(i);
    drawBoard(); segSet('#tView', st.view);
    const sl = $('#tStart'); sl.value = st.k; syncRange(sl, `${st.k + 1}`);
    const pg = $('#tProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) setOut($('#tOut'), st.msg + ` ${Math.round(st.prog * 100)}%.`);
    else {
      const parts = [];
      if (b()) parts.push(`Политика по демонстрациям: ${okLine(b().ev)}, ${fmt(b().ev.tGoal, 1)} шага до ниши.`);
      if (eps()) { const s = stats(eps()); parts.push(`Попытки робота: ${s.ok} удачных, ${s.fail} ${plural(s.fail, 'промах', 'промаха', 'промахов')}; наблюдатель вмешивался в ${s.iv} попытках.`); }
      for (const m of METHODS) if (res(m)) parts.push(`${METH[m]}: ${okLine(res(m).ev)}, ${fmt(res(m).ev.tGoal, 1)} шага, ${perHour(res(m).ev)} в час.`);
      setOut($('#tOut'), parts.join(' ') || 'Политики ещё не обучены.');
    }
  }
  function progress(msg) { return (p) => { st.prog = p; st.msg = msg; const pg = $('#tProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#tOut'), `${msg} ${Math.round(p * 100)}%.`); }; }
  async function ensureBase() { if (!b()) { st.busy = true; st.prog = 0; st.msg = 'Политика по демонстрациям учится в браузере:'; render(); try { await Store.base(progress(st.msg)); } finally { st.busy = false; } } }
  async function ensureAll() {
    await ensureBase(); const W = await Store.watched();
    const todo = METHODS.filter((m) => !res(m));
    if (todo.length) {
      st.busy = true; st.prog = 0; render();
      try { for (let i = 0; i < todo.length; i++) { const m = todo[i]; const base0 = i / todo.length; await Store.finetune('trio.' + m, W, m, {}, (p) => progress(`Дообучение «${METH[m].toLowerCase()}» (${i + 1} из ${todo.length}):`)(base0 + p / todo.length)); } }
      finally { st.busy = false; }
    }
    render(); if (ctl) ctl.update();
  }
  function state() { const r = {}; for (const m of METHODS) if (res(m)) r[m] = res(m).ev; return { mode: st.mode, k: st.k, view: st.view, busy: st.busy, base: b() && b().ev, ev: r }; }
  const api = {
    reset() { st.mode = 'map'; st.k = 0; st.view = 'ok'; render(); },
    state, render, st,
    async map() { st.mode = 'map'; await ensureBase(); const W = await Store.watched(); render(); if (ctl) ctl.update(); const s = stats(W); return Object.assign(s, { base: b().ev, rate: { home: s.by.home[0] / s.by.home[1], near: s.by.near[0] / s.by.near[1], shelf: s.by.shelf[0] / s.by.shelf[1] } }); },
    async three() { await ensureAll(); st.mode = 'pol'; st.k = firstShelf(); st.view = 'ok'; render(); const e = (m) => res(m).ev; return { base: b().ev, success: e('success'), adv: e('adv'), all: e('all'), lab: res('adv'), data: stats(eps()) }; },
    async speed() { await ensureAll(); st.mode = 'pol'; st.view = 'speed'; render(); const e = (m) => res(m).ev; return { base: b().ev, success: e('success'), adv: e('adv'), all: e('all'), lab: res('adv') }; },
  };
  /** Попытки в час у «только удачных» и «все с меткой»: метка быстрее по шагам, но фильтр может брать числом удачных стартов. */
  function speedVerdict(r) {
    const r1 = (v) => Math.round(v * 10) / 10, dt = r1(r.success.tGoal) - r1(r.adv.tGoal), d = r.success.ok - r.adv.ok, rel = r.adv.perHour / r.success.perHour - 1;
    const head = Math.abs(rel) < 0.03 ? '«только удачные» и «все с меткой» почти равны' : rel > 0 ? 'впереди «все с меткой»' : 'впереди «только удачные»';
    const starts = (n) => `${n} ${plural(n, 'удачный старт', 'удачных старта', 'удачных стартов')} из 60`;
    const tail = d > 0 ? `а «только удачные» — ${starts(d)}` : d < 0 ? `и ещё ${starts(-d)}` : 'а удачных стартов у них поровну';
    const gain = dt > 0 ? `метка выигрывает ${fmt(dt, 1)} шага на попытку` : 'по шагам метка не быстрее';
    return `Но по удачным попыткам в час ${head} — ${perHour(r.success)} и ${perHour(r.adv)}: ${gain}, ${tail}.`;
  }
  /** Разметка шагов: сколько positive в неудачных попытках и negative в удачных. */
  function labelStats(R) { const T = R.T, W = eps(); let posFail = 0, nFail = 0, negOk = 0, nOk = 0; for (let j = 0; j < T.N; j++) { const e = W[T.EP[j]]; if (e.outcome !== 'goal') { nFail++; if (R.I[j] > 0) posFail++; } else { nOk++; if (R.I[j] < 0) negOk++; } } return { posFail, nFail, negOk, nOk, pos: Array.from(R.I).filter((v) => v > 0).length, N: T.N }; }
  const missions = [
    { short: 'Попытки', title: 'Где робот промахивается', text: 'Политика по демонстрациям выезжает на работу: 100 попыток поставить чашку в нишу, старты — как бывает на деле: из обычной позы, у самого шкафа и из соседней ниши, куда рука заехала после прошлого дела. Рядом стоит наблюдатель и перехватывает управление, когда чашка у шкафа идёт мимо проёма, но успевает не всегда. Нажми кнопку — на трёх сценах появятся карты попыток по виду старта.',
      bet: { q: 'из какого старта робот промахивается чаще всего?', options: ['Из обычной позы: таких попыток больше всего', 'У шкафа: там тесно', 'Из соседней ниши: сначала надо выехать назад, а этого в демонстрациях не было'], answer: (r) => { const v = [1 - r.rate.home, 1 - r.rate.near, 1 - r.rate.shelf]; return v.indexOf(Math.max(...v)); } },
      action: { label: 'Собрать 100 попыток под присмотром', run: (X) => X.map() },
      criteria: [{ label: 'Доля промахов из соседней ниши выше, чем из других стартов', test: (r) => r.rate.shelf < r.rate.home && r.rate.shelf < r.rate.near }],
      explain: (r) => `Удачных ${r.ok} из ${r.n}, промахов ${r.fail}. Из обычной позы робот промахнулся в ${r.by.home[1] - r.by.home[0]} попытках из ${r.by.home[1]}, у шкафа — в ${r.by.near[1] - r.by.near[0]} из ${r.by.near[1]}, из соседней ниши — в ${r.by.shelf[1] - r.by.shelf[0]} из ${r.by.shelf[1]}: там первый же шаг вперёд или по высоте задевает полку. Наблюдатель вмешивался в ${r.iv} попытках и довёл до ниши ${r.ivOk}; его шагов в записях ${r.human} из ${r.steps}. Без присмотра и без разброса эта же политика из соседней ниши не справляется ни разу: ${r.base.by.shelf.ok} из ${r.base.by.shelf.n} на проверке.` },
    { short: 'Трое', title: 'Три способа дообучить на одних попытках', text: 'Те же 100 попыток — три дообучения от одних и тех же весов, одной сетью, 3000 шагов каждое. «Только удачные» берёт удачные попытки целиком. «Все с меткой» берёт все 100: функция ценности оценивает каждый шаг, и во вход политики пишется метка — шаг лучше обычного или нет; при проверке метка всегда «лучше». «Все без разметки» копирует все 100 как есть. Проверка одна: 60 стартов, которых в попытках не было.',
      bet: { q: 'что даст дообучение на всех попытках без разметки?', options: ['Успех вырастет так же, как у двух других: данных больше всего', 'Вырастет меньше: политика копирует и свои промахи', 'Упадёт ниже политики по демонстрациям'], answer: (r) => (r.all.ok < r.base.ok ? 2 : r.all.ok < Math.min(r.success.ok, r.adv.ok) ? 1 : 0) },
      action: { label: 'Дообучить три политики', run: (X) => X.three() },
      criteria: [{ label: '«Все без разметки» уступает двум другим по успеху', test: (r) => r.all.ok < Math.min(r.success.ok, r.adv.ok) }, { label: '«Только удачные» и «все с меткой» прибавили хотя бы 8 стартов из 60', test: (r) => r.success.ok >= r.base.ok + 8 && r.adv.ok >= r.base.ok + 8 }],
      explain: (r) => { const L = labelStats(r.lab); return `По демонстрациям: ${okLine(r.base)}. Только удачные: ${okLine(r.success)}, у шкафа ${r.success.by.near.ok} из 12, из соседней ниши ${r.success.by.shelf.ok} из 8. Все с меткой: ${okLine(r.adv)}, у шкафа ${r.adv.by.near.ok} из 12, из ниши ${r.adv.by.shelf.ok} из 8. Все без разметки: ${okLine(r.all)}, из ниши ${r.all.by.shelf.ok} из 8 — провальные попытки учат её тем же движениям в полку. Метка положительная у ${L.pos} шагов из ${L.N}: в ${r.data.fail} неудачных попытках таких шагов ${L.posFail} из ${L.nFail} — начало попытки и исправления наблюдателя, — а в удачных ${L.negOk} из ${L.nOk} шагов помечены как хуже обычного. Сцены показывают один и тот же старт из соседней ниши у всех трёх; в свободном режиме старт можно менять.`; } },
    { short: 'Скорость', title: 'Кто доводит чашку быстрее', text: 'Успех — не всё: в π*0.6 считают пропускную способность, число удачных попыток в час, и она складывается из успеха и скорости. Здесь попытка длится 0,2 с на шаг и 3 с на возврат сцены. Сводка покажет среднее число шагов до ниши и удачных попыток в час.',
      bet: { q: 'какая из трёх дообученных политик доводит чашку быстрее всех?', options: ['Только удачные: училась на лучших попытках', 'Все с меткой: копирует только шаги лучше обычного, даже из удачных попыток берёт не всё', 'Все без разметки: данных больше'], answer: (r) => { const v = [r.success.tGoal, r.adv.tGoal, r.all.tGoal]; return v.indexOf(Math.min(...v)); } },
      action: { label: 'Показать скорость', run: (X) => X.speed() },
      criteria: [{ label: '«Все с меткой» доходит за меньшее число шагов, чем две другие', test: (r) => r.adv.tGoal < r.success.tGoal && r.adv.tGoal < r.all.tGoal }],
      explain: (r) => `Шагов до ниши: по демонстрациям ${fmt(r.base.tGoal, 1)}, только удачные ${fmt(r.success.tGoal, 1)}, все с меткой ${fmt(r.adv.tGoal, 1)}, все без разметки ${fmt(r.all.tGoal, 1)}. Удачных попыток в час: ${perHour(r.base)}, ${perHour(r.success)}, ${perHour(r.adv)} и ${perHour(r.all)}. Метка доводит чашку быстрее: она отбирает шаги, после которых чашка шла к нише лучше обычного, а «только удачные» копирует удачные попытки целиком. ${speedVerdict(r)} На короткой задаче, где исход решается у проёма, отбирать попытки по исходу почти так же выгодно; где метка выигрывает, разберём после лаборатории.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй проверочный старт ползунком и смотри, как три политики проходят одну и ту же конфигурацию; переключай сводку. Найди старт у шкафа, где «все без разметки» задевает полку, а две другие политики — нет.', final: true, controls: ['start', 'view'] },
  ];
  function init() {
    $('#tStart').addEventListener('input', (e) => { st.k = +e.target.value; st.mode = 'pol'; render(); });
    segBind('#tView', (v) => { st.view = v; render(); });
    ctl = mountMissions('#tMis', missions, api, { controls: { start: '#wrapTStart', view: '#wrapTView' }, scene: '#tTrio' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   2. Лаборатория: вмешайся сам — живая попытка, перехват чашки, буфер
   исправлений и дообучение
   ===================================================================== */
const Hands = (() => {
  const E = L57, K = HeroKit, TICK = 380;   // мс на шаг робота в живой попытке
  const st = { kind: 'shelf', prio: 'half', ep: null, running: false, hold: false, target: null, timer: null, mine: [], scr: [], busy: false, prog: 0, result: null, step: 0 };
  const corrAll = () => st.mine.concat(st.scr);
  let ctl = null, resolveRun = null;
  const b = () => Store.get('base');
  const auto = () => Store.get('auto');
  /** Старт живой попытки: первый проверочный старт выбранного вида (из соседней ниши — тот же, что в проверке). */
  function startFor(kind, i) { const s = E.starts(kind === 'home' ? 'all' : kind).filter((x) => x.kind === kind); return s[(i || 0) % s.length]; }
  function cupPx() { const p = E.fk(st.ep ? st.ep.st.q : startFor(st.kind).q); return { x: View.X(p.x), y: View.Y(p.y) }; }
  function drawScene() {
    const cv = $('#hCv'), ep = st.ep, P = pal();
    if (!ep) { const s0 = startFor(st.kind); const { c, k } = View.scene(cv, null, { q: s0.q, yn: s0.yn, color: P.e2e, empty: b() ? (st.kind === 'shelf' ? 'чашка в соседней нише: возьми её или запусти робота' : 'запусти робота или возьми чашку') : 'политика учится…', emptyShort: 'возьми чашку или запусти' }); hintArrow(c, k, P); return; }
    const title = st.hold ? 'ты ведёшь чашку' : st.running ? 'робот ведёт сам' : ep.outcome === 'goal' ? (ep.who.some((w) => w) ? 'попытка с твоим исправлением' : 'попытка робота') : (ep.who.some((w) => w) ? 'попытка с исправлением' : 'попытка робота');
    View.scene(cv, ep, { color: P.cl, title, titleShort: title, ghostStart: true });
    if (st.hold && st.target) { const { c } = K.fit(cv, View.W, View.H); const cp = cupPx(); c.setLineDash([3, 3]); c.strokeStyle = P.e2e; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cp.x, cp.y); c.lineTo(View.X(st.target.x), View.Y(st.target.y)); c.stroke(); c.setLineDash([]); }
  }
  function hintArrow(c, k, P) { if (!b()) return; const cp = cupPx(); K.label(c, k, k > 1.5 ? 'возьми' : 'возьми и веди', cp.x, cp.y - 22, { px: 11, weight: 700, color: P.e2e, haloColor: P.bg }); }
  /** Лента попытки: квадратики шагов, синие — робот, оранжевые — ты; после дообучения — метки +/−.
   *  На узком канвасе лента выше, а подпись идёт в две строки под квадратиками. */
  function drawTape() {
    const cv = $('#hTape'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 94 : 64;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), ep = st.ep;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    if (!ep || !ep.T) {
      if (narrow) { K.label(c, k, 'лента попытки', W / 2, H / 2 - 9, { px: 11, color: P.ink3, halo: false }); K.label(c, k, 'шаги робота синим, твои — оранжевым', W / 2, H / 2 + 9, { px: 11, color: P.ink3, halo: false }); }
      else K.label(c, k, 'лента попытки: шаги робота синим, твои — оранжевым', W / 2, H / 2, { px: 11, color: P.ink3, halo: false });
      return;
    }
    const n = Math.max(ep.T, 14), w = Math.min(22, (W - 20) / n), x0 = 10;
    for (let i = 0; i < ep.T; i++) { c.fillStyle = ep.who[i] ? P.e2e : P.cl; c.globalAlpha = 0.85; c.fillRect(x0 + i * w, 22, w - 2, 20); c.globalAlpha = 1; }
    const labels = st.result && st.result.lastLabels; if (labels && labels.length === ep.T) for (let i = 0; i < ep.T; i++) K.label(c, k, labels[i] > 0 ? '+' : '−', x0 + i * w + (w - 2) / 2, 12, { px: 11, weight: 800, color: labels[i] > 0 ? P.good : P.bad, halo: false });
    const hs = ep.who.reduce((a, v) => a + v, 0), out = ep.outcome === 'goal' ? 'чашка в нише' : ep.outcome === 'crash' ? 'задела полку' : ep.outcome === 'timeout' ? 'время вышло' : '';
    const l1 = `${ep.T} ${plural(ep.T, 'шаг', 'шага', 'шагов')}, твоих ${hs}` + (out ? ' · ' + out : ''), l2 = labels ? 'метки после дообучения' : '';
    if (narrow) { K.label(c, k, l1, x0, 61, { px: 10.5, color: P.ink2, align: 'left', halo: false }); if (l2) K.label(c, k, l2, x0, 79, { px: 10.5, color: P.ink2, align: 'left', halo: false }); }
    else K.label(c, k, l1 + (l2 ? ' · ' + l2 : ''), x0, H - 10, { px: 10.5, color: P.ink2, align: 'left', halo: false });
  }
  function bufferLine() {
    const A = auto(); if (!A) return 'Буфер опыта пуст.';
    const corr = corrAll(), s = stats(A), hc = corr.reduce((a, e) => a + e.who.reduce((x, y) => x + y, 0), 0), mine = st.mine.length, scr = st.scr.length;
    return `В буфере: ${s.n} попыток робота без присмотра (${s.ok} удачных, из соседней ниши ${s.by.shelf[0]} из ${s.by.shelf[1]}) и ${corr.length} ${plural(corr.length, 'попытка', 'попытки', 'попыток')} с исправлениями${mine && scr ? ` (твоих ${mine}, наблюдателя ${scr})` : scr ? ' (наблюдателя)' : ''}; шагов человека — ${hc}, они ${st.prio === 'half' ? 'во втором буфере и дают половину каждого пакета' : 'просто добавлены к остальным'}.`;
  }
  function render() {
    drawScene(); drawTape(); segSet('#hKind', st.kind); segSet('#hPrio', st.prio);
    const pg = $('#hProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    $('#hRun').disabled = st.running || st.busy || !b();
    if (st.busy) setOut($('#hOut'), `Дообучение в браузере: ${Math.round(st.prog * 100)}%.`);
    else { const r = st.result; setOut($('#hOut'), bufferLine() + (r ? ` После дообучения: из соседней ниши <b>${r.prio.evShelf.ok} из 20</b> с буфером исправлений${r.plain ? ` и ${r.plain.evShelf.ok} из 20 без него` : ''}; на всех 60 стартах — ${r.prio.ev.ok} из 60.` : '')); }
  }
  function progress(p) { st.prog = p; const pg = $('#hProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#hOut'), `Дообучение в браузере: ${Math.round(p * 100)}%.`); }
  /** Один шаг живой попытки: действие человека (к точке курсора) или политики. */
  function tick() {
    const ep = st.ep; if (!ep || ep.outcome) { stop(); return; }
    const a = new Float64Array(2);
    if (st.hold && st.target) { const p = E.fk(ep.st.q); a[0] = E.clamp((st.target.x - p.x) / E.ARM.DP, -1, 1); a[1] = E.clamp((st.target.y - p.y) / E.ARM.DP, -1, 1); E.stepEp(ep, a, 1); }
    else { E.act(b().P, E.observe(ep.st), 0, a); E.stepEp(ep, a, 0); }
    if (ep.outcome) stop(); else render();
  }
  function start(hold) {
    if (!b() || st.running) return;
    st.ep = E.begin(startFor(st.kind, st.step)); st.running = true; st.hold = !!hold; st.result = st.result ? Object.assign({}, st.result, { lastLabels: null }) : null;
    st.timer = setInterval(tick, TICK); render();
  }
  function stop() {
    if (st.timer) clearInterval(st.timer); st.timer = null; st.running = false; st.hold = false;
    const ep = st.ep;
    if (ep && ep.outcome) { if (ep.who.some((w) => w)) st.mine.push(ep); st.step++; }
    render(); if (ctl) ctl.update();
    if (resolveRun) { const f = resolveRun; resolveRun = null; f(ep); }
  }
  /** Попытка целиком, без ожидания (для проверок): робот сам. */
  function runAll() { return new Promise((res) => { resolveRun = res; start(false); }); }
  /** Исправленные попытки наблюдателя (учителя-программы) из соседней ниши — добирает до total штук вместе с твоими; набор наблюдателя зависит только от числа. */
  function scripted(total) { const need = Math.max(0, total - st.mine.length); st.scr = need ? E.collectWithTeacher(b().P, need, E.CFG.SEED * 5 + 3, { P_REACT: 1 }, 0, 1) : []; }
  async function train() {
    const A = await Store.auto(); st.busy = true; st.prog = 0; render();
    const corr = corrAll(), key = 'hands.' + corr.length + '.' + corr.reduce((a, e) => a + e.T + e.who.reduce((x, y) => x + y, 0) * 1000, 0);
    try {
      const prio = await Store.finetune(key + '.half', A.concat(corr), 'adv', { PRIO: 'human' }, (p) => progress(p * 0.5));
      const plain = await Store.finetune(key + '.plain', A.concat(corr), 'adv', {}, (p) => progress(0.5 + p * 0.5));
      const chosen = st.prio === 'half' ? prio : plain;
      // метки последней попытки с исправлением — по разметке выбранного дообучения
      let lastLabels = null; const idx = st.ep ? corr.indexOf(st.ep) : -1;
      if (idx >= 0 && chosen.I) { const T = chosen.T, e0 = A.length + idx; lastLabels = []; for (let j = 0; j < T.N; j++) if (T.EP[j] === e0) lastLabels.push(chosen.I[j]); }
      st.result = { prio, plain, chosen, lastLabels, corr: corr.length, human: corr.reduce((a, e) => a + e.who.reduce((x, y) => x + y, 0), 0) };
    } finally { st.busy = false; }
    render(); if (ctl) ctl.update();
    return Object.assign({ base: b().evShelf, auto: stats(A) }, st.result);
  }
  function state() { return { kind: st.kind, prio: st.prio, running: st.running, busy: st.busy, corr: corrAll().length, mine: st.mine.length, mineOk: st.mine.filter((e) => e.outcome === 'goal').length, shelfOk: st.result ? st.result.chosen.evShelf.ok : null }; }
  const api = {
    reset() { stop(); st.kind = 'shelf'; st.prio = 'half'; st.ep = null; st.mine = []; st.scr = []; st.result = null; st.step = 0; render(); },
    state, render, st, start, stop, runAll, scripted, train,
    async robot() { await Store.base(); await Store.auto(); render(); const ep = await runAll(); return { ep, base: b().evShelf, auto: stats(auto()) }; },
    async corrected() { await Store.base(); await Store.auto(); if (!corrAll().length) scripted(1); return train(); },
    async more() { scripted(10); return train(); },
  };
  const missions = [
    { short: 'Робот сам', title: 'Что делает политика из соседней ниши', text: 'Чашка ещё в соседней нише — рука заехала туда за прошлым делом. Нужная ниша подсвечена. Нажми кнопку, и политика по демонстрациям поведёт чашку сама, шаг за шагом.',
      bet: { q: 'что сделает политика по демонстрациям?', options: ['Выедет назад, потом переведёт чашку на высоту нужной ниши', 'Двинется вперёд или по высоте и заденет полку первым же шагом', 'Доедет до дна соседней ниши и остановится'], answer: (r) => (r.ep.outcome === 'crash' && r.ep.T <= 2 ? 1 : r.ep.outcome === 'goal' ? 0 : 2) },
      action: { label: 'Запустить робота', run: (X) => X.robot() },
      criteria: [{ label: 'Попытка кончилась столкновением с полкой на первом или втором шаге', test: (r) => r.ep.outcome === 'crash' && r.ep.T <= 2 }],
      explain: (r) => `Чашка задела полку на шаге ${r.ep.T}. В демонстрациях рука всегда шла к шкафу из свободного места, и движения назад в них нет вовсе; из соседней ниши политика повторяет то, что знает, — вперёд и к высоте ниши. На проверке из 20 таких стартов она не справилась ни с одним (${r.base.ok} из 20), а в ${r.auto.n} попытках без присмотра из соседней ниши удачных ${r.auto.by.shelf[0]} из ${r.auto.by.shelf[1]}. Учиться на этих попытках не на чем: правильного движения в них нет.` },
    { short: 'Исправь', title: 'Перехвати управление сам', text: 'Теперь ты наблюдатель. Возьми чашку мышью или пальцем прямо в нише, выведи её назад, переведи на высоту нужной ниши и заведи внутрь; отпустишь — робот продолжит сам. Шаги, где вёл ты, попадают в записи оранжевыми, как вмешательства оператора в HIL-SERL.',
      criteria: [{ label: 'Хотя бы одна попытка, где ты вёл чашку, закончилась в нише', test: (r, s) => s.mineOk >= 1 }],
      hint: 'Чашку можно взять до запуска: пока держишь — ведёшь. Шаг робота — 4 см, тянуть быстрее не получится. Назад, пока чашка не выйдет из шкафа, потом по высоте, потом вперёд до пунктира.',
      explain: (r, ctx) => { const s = state(); return `Исправленных попыток ${s.mine}, из них в нише ${s.mineOk}. Твои шаги лежат в записях вместе с 100 попытками робота. В HIL-SERL такие шаги кладут в оба буфера — демонстраций и опыта, — а шаги политики до и после вмешательства только в буфер опыта; при обучении половина каждого пакета берётся из буфера демонстраций, так что исправления видны часто, хотя их мало.`; } },
    { short: 'Дообучить', title: 'Дообучить с твоими исправлениями', text: 'Дообучение как в лаборатории 1, «все с меткой»: функция ценности, метка во входе, твои шаги всегда помечены как лучше обычного — как исправления в RECAP. Буфер исправлений даёт половину каждого пакета. Проверка — 20 стартов из соседней ниши, которых не было.',
      bet: { q: 'сколько из 20 стартов из соседней ниши робот пройдёт сам после твоих исправлений?', options: ['Почти все: правило простое — сначала назад', 'Часть: исправлений мало, чтобы покрыть разные высоты и глубины', 'Ни одного: несколько исправлений растворятся среди ста попыток'], answer: (r) => (r.chosen.evShelf.ok >= 15 ? 0 : r.chosen.evShelf.ok > 0 ? 1 : 2) },
      action: { label: 'Дообучить с исправлениями', run: (X) => X.corrected() },
      criteria: [{ label: 'Из соседней ниши появились удачные старты (было 0 из 20)', test: (r) => r.chosen.evShelf.ok > r.base.ok }],
      explain: (r) => `С буфером исправлений: ${r.prio.evShelf.ok} из 20 стартов из соседней ниши, на всех 60 стартах ${r.prio.ev.ok} из 60. Те же записи, но без второго буфера — исправления просто добавлены к ста попыткам: ${r.plain.evShelf.ok} из 20. Исправленных попыток ${r.corr}, шагов человека в них ${r.human}; ценность у стартов из ниши низкая, и положительную метку там получают только исправления. На ленте попытки — метки шагов после дообучения.` },
    { short: 'Ещё', title: 'Сколько исправлений закрывают промах', text: 'Наблюдатель доберёт исправленных попыток из соседней ниши до десяти — из разных ниш, сверху и снизу — и дообучение повторится. В HIL-SERL вмешательств много в начале обучения и всё меньше к концу; авторы предупреждают не делать их длинными и редкими — такие завышают оценку ценности.',
      bet: { q: 'хватит ли десяти исправленных попыток, чтобы робот справлялся из соседней ниши хотя бы в 15 стартах из 20?', options: ['Да', 'Нет: нужны десятки', 'Нет: без новых демонстраций хвост не закрыть'], answer: (r) => (r.chosen.evShelf.ok >= 15 ? 0 : 1) },
      action: { label: 'Добрать до 10 исправлений и дообучить', run: (X) => X.more() },
      criteria: [{ label: 'Из соседней ниши не меньше 15 стартов из 20', test: (r) => r.chosen.evShelf.ok >= 15 }],
      hint: 'Если вышло меньше 15, добавь свои исправления и нажми кнопку ещё раз.',
      explain: (r) => `Десять исправленных попыток (${r.human} шагов человека) дали ${r.prio.evShelf.ok} из 20 из соседней ниши и ${r.prio.ev.ok} из 60 на всех стартах; без буфера исправлений — ${r.plain.evShelf.ok} из 20. Десять попыток занимают около минуты работы. В HIL-SERL такая работа с перехватами доводила политику до 100% на вставке планки памяти за 1,5 часа, на сборке приборной панели за 2 часа, а на ремне ГРМ за 6 часов; HG-DAgger на тех же записях давал в среднем 49,7%.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Запускай робота из разных стартов, перехватывай, переключай буфер исправлений и дообучай. Найди, помогают ли исправления из соседней ниши стартам у шкафа.', final: true, controls: ['kind', 'prio'] },
  ];
  function init() {
    const cv = $('#hCv');
    const toM = (p) => ({ x: (p.x - View.OX) / View.SC, y: (View.OY - p.y) / View.SC });
    K.drag(cv, View.W, View.H, {
      hit: (p) => { if (!b() || st.busy) return null; const cp = cupPx(); return (p.x - cp.x) * (p.x - cp.x) + (p.y - cp.y) * (p.y - cp.y) < 34 * 34 ? { cup: true } : null; },
      start: (o, p) => { st.target = toM(p); if (!st.running) start(true); else st.hold = true; render(); },
      move: (o, p) => { st.target = toM(p); },
      end: () => { st.hold = false; st.target = null; render(); },
    });
    $('#hRun').addEventListener('click', () => { if (!st.running) start(false); });
    segBind('#hKind', (v) => { if (st.running) return; st.kind = v; st.ep = null; render(); });
    segBind('#hPrio', (v) => { st.prio = v; if (st.result) st.result.chosen = v === 'half' ? st.result.prio : st.result.plain; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#hMis', missions, api, { controls: { kind: '#wrapHKind', prio: '#wrapHPrio' }, scene: '#hCv' });
    Store.base().then(() => render());
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: минуты на роботе — «ещё демонстрации» против «опыт с
   исправлениями», кривые по бюджету времени
   ===================================================================== */
const Budget = (() => {
  const E = L57, K = HeroKit, MAXMIN = 32;
  const st = { min: 8, busy: false, prog: 0, msg: '' };
  let ctl = null;
  const iters = [];   // { k, ev, minutes, attempts, human, okCollected }
  const demoPts = () => E.CFG.DEMO_CURVE.map((n) => Store.get('demo' + n)).filter(Boolean).map((r) => ({ n: r.D.length, added: r.added, min: r.secs / 60, ev: r.ev }));
  function progress(msg) { return (p) => { st.prog = p; st.msg = msg; const pg = $('#bProg'); pg.hidden = false; pg.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; setOut($('#bOut'), `${msg} ${Math.round(p * 100)}%.`); }; }
  /** Итерация k: 25 попыток под присмотром политикой прошлой итерации, дообучение от базовой на всём собранном (с демонстрациями в буфере). */
  async function iterate(upTo, onProg) {
    const b = await Store.base();
    while (iters.length < upTo) {
      const k = iters.length + 1, prev = k === 1 ? { P: b.P, I: 0 } : iters[k - 2].r;
      const eps = E.collectWithTeacher(prev.P, E.CFG.ITER_N, E.CFG.SEED * 101 + k, {}, undefined, undefined, k === 1 ? 0 : 1);
      const data = b.D.concat(...iters.map((x) => x.eps), eps);
      const r = await Store.finetune('iter' + k, data, 'adv', { PRIO: 'human' }, onProg);
      const s = stats(eps), minutes = (iters.length ? iters[iters.length - 1].minutes : 0) + s.secs / 60;
      iters.push({ k, r, eps, ev: r.ev, minutes, attempts: k * E.CFG.ITER_N, human: s.human, okCollected: s.ok });
      render();
    }
  }
  async function compute(demoN, upTo) {
    st.busy = true; st.prog = 0; render();
    try {
      const todoD = E.CFG.DEMO_CURVE.filter((n) => n <= demoN && !Store.get('demo' + n)), todoI = Math.max(0, upTo - iters.length), total = todoD.length + todoI; let done = 0;
      await Store.base(progress('Политика по демонстрациям учится:'));
      for (const n of todoD) { await Store.demoPolicy(n, (p) => progress(`Политика по ${n} демонстрациям:`)((done + p) / total)); done++; render(); }
      for (let k = iters.length + 1; k <= upTo; k++) { await iterate(k, (p) => progress(`Опыт с исправлениями, итерация ${k} из ${upTo}:`)((done + p) / total)); done++; }
    } finally { st.busy = false; }
    render(); if (ctl) ctl.update();
  }
  /** Что даёт каждый путь при бюджете в минутах: последняя точка, уложившаяся в бюджет. */
  function at(min) { const d = demoPts().filter((p) => p.min <= min + 1e-9), i = iters.filter((p) => p.minutes <= min + 1e-9); return { demo: d.length ? d[d.length - 1] : null, iter: i.length ? i[i.length - 1] : null }; }
  function drawChart() {
    const cv = $('#bChart'), narrow = canvasNarrow(cv, 640), W = narrow ? 380 : 640, H = narrow ? 300 : 320;
    if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
    const { c, k } = K.fit(cv, W, H), P = pal(), L = narrow ? 36 : 46, R = 14, T = 28, B = narrow ? 44 : 40, gw = W - L - R, gh = H - T - B;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (m) => L + gw * m / MAXMIN, Y = (v) => T + gh * (1 - v / 60);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, 15, 30, 45, 60]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); K.label(c, k, String(v), L - 6, Y(v), { px: 10, color: P.ink3, align: 'right', halo: false }); }
    for (let m = 0; m <= MAXMIN; m += 8) K.label(c, k, String(m), X(m), H - B + 12, { px: 10, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'минут сверх базовой политики' : 'минут работы робота или оператора сверх базовой политики', L + gw / 2, H - 9, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, narrow ? 'удачных из 60 стартов' : 'удачных проверочных попыток из 60', L, 10, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    const d = demoPts(), it = iters, b = Store.get('base');
    if (!d.length && !it.length) { K.label(c, k, narrow ? 'нажми кнопку миссии' : 'кривые появятся, когда нажмёшь кнопку миссии: обе считаются в браузере', L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    // бюджет: подпись внизу графика, не дальше краёв поля (у 0 мин — правее подписей оси, у 32 мин — левее края)
    c.setLineDash([4, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(st.min), T); c.lineTo(X(st.min), T + gh); c.stroke(); c.setLineDash([]);
    { const txt = `${st.min} мин`; K.font(c, k, 10, 700); const hw = c.measureText(txt).width / 2; K.label(c, k, txt, Math.min(W - R - 2 - hw, Math.max(L + 4 + hw, X(st.min))), T + gh - 8, { px: 10, weight: 700, color: P.ink2, haloColor: P.surf }); }
    const series = [[P.cl, d.map((p) => [p.min, p.ev.ok, `${p.n}`]), 'ещё демонстрации'], [P.e2e, it.map((p) => [p.minutes, p.ev.ok, `${p.attempts}`]), 'опыт с исправлениями']];
    const origin = b ? [[0, b.ev.ok]] : [];
    series.forEach(([col, pts, name]) => {
      if (!pts.length) return; const all = origin.concat(pts);
      c.strokeStyle = col; c.lineWidth = 2.4; c.lineJoin = 'round'; c.beginPath(); all.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke();
      const up = col === P.cl;
      pts.forEach(([x, y, t]) => { c.beginPath(); c.arc(X(x), Y(y), 4, 0, 7); c.fillStyle = col; c.fill(); K.label(c, k, narrow ? t : `${t} · ${y}`, X(x), Y(y) + (up ? -12 : 14), { px: 10, weight: 650, color: col, haloColor: P.surf }); });
    });
    if (b) { c.beginPath(); c.arc(X(0), Y(b.ev.ok), 4, 0, 7); c.fillStyle = P.ink3; c.fill(); K.label(c, k, narrow ? `${b.ev.ok}` : `40 демонстраций: ${b.ev.ok}`, X(0) + 6, Y(b.ev.ok) + 14, { px: 10, weight: 650, color: P.ink3, align: 'left', haloColor: P.surf }); }
    // легенда: в одну строку, а если не влезает (узкий график, длинные названия) — в две, вторая на месте первой
    const ly = T + gh - (narrow ? 44 : 40), lpx = narrow ? 10 : 10.5; K.font(c, k, lpx, 600);
    const lw = series.map(([, , name]) => 14 + c.measureText(name).width), one = L + 6 + lw[0] + 16 + lw[1] <= W - R - 2;
    let lx = L + 6;
    series.forEach(([col, , name], i) => { const y = one ? ly : ly - (1 - i) * 16 * Math.max(1, k); if (!one) lx = L + 6; c.fillStyle = col; c.fillRect(lx, y - 5, 10, 10); K.label(c, k, name, lx + 14, y, { px: lpx, color: P.ink2, align: 'left', halo: false }); lx += lw[i] + 16; });
    K.label(c, k, narrow ? 'подпись у точки: демонстраций или попыток' : 'подпись у точки: число демонстраций или попыток робота · удачных из 60', L + 6, T + gh - (narrow ? 26 : 22), { px: 10, color: P.ink3, align: 'left', halo: false });
  }
  function render() {
    drawChart(); const sl = $('#bMin'); sl.value = st.min; syncRange(sl, `${st.min} мин`);
    const pg = $('#bProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    if (st.busy) { setOut($('#bOut'), `${st.msg} ${Math.round(st.prog * 100)}%.`); return; }
    const a = at(st.min), b = Store.get('base'), curve = demoPts().length > 0;
    const dTxt = a.demo ? `${a.demo.added} ${plural(a.demo.added, 'новая запись', 'новые записи', 'новых записей')} (${fmt(a.demo.min, 1)} мин), всего ${a.demo.n}: ${a.demo.ev.ok} из 60, из соседней ниши ${a.demo.ev.by.shelf.ok} из 8`
      : !b ? 'ещё не посчитано' : curve ? `в бюджет не уложилась ни одна точка, остаётся политика по 40 демонстрациям: ${b.ev.ok} из 60` : `политика по 40 демонстрациям: ${b.ev.ok} из 60 (кривая ещё не посчитана)`;
    const iTxt = a.iter ? `${a.iter.attempts} попыток с присмотром (${fmt(a.iter.minutes, 1)} мин, итерация ${a.iter.k}): ${a.iter.ev.ok} из 60, из соседней ниши ${a.iter.ev.by.shelf.ok} из 8, ${perHour(a.iter.ev)} удачных в час` : 'ни одной итерации не уложилось';
    setOut($('#bOut'), `За ${st.min} мин. Ещё демонстрации: ${dTxt}. Опыт с исправлениями: ${iTxt}.`);
  }
  function state() { const a = at(st.min); return { min: st.min, busy: st.busy, demo: a.demo && a.demo.ev.ok, iter: a.iter && a.iter.ev.ok }; }
  const api = {
    reset() { st.min = 8; render(); },
    state, render, st, iters, demoPts, at,
    async eight() { await compute(120, 3); st.min = 8; render(); const a = at(8); return { demo: a.demo, iter: a.iter, base: Store.get('base').ev }; },
    async thirty() { await compute(320, 6); st.min = 32; render(); const d = Store.get('demo320'), last = iters[iters.length - 1]; return { demo320: d.ev, demoMin: d.secs / 60, demoAdded: d.added, iter: last, iters: iters.slice() }; },
  };
  const missions = [
    { short: '8 минут', title: 'Восемь минут: демонстрации или опыт', text: 'Оператор за 8 минут записывает ещё 80 демонстраций из обычной позы, и всего их становится 120: одна демонстрация занимает около 6 секунд вместе с возвратом сцены. Или те же 8 минут робот работает сам под присмотром наблюдателя: три итерации по 25 попыток, и после каждой политика дообучается с меткой и буфером исправлений, как в лабораториях 1 и 2. Оба пути начинаются с базовой политики по 40 демонстрациям, поэтому её время не считаем. Расчёт займёт несколько секунд.',
      bet: { q: 'какой путь даст больше удачных стартов из 60 за 8 минут?', options: ['Ещё 80 демонстраций: данные оператора чище', 'Три итерации опыта с исправлениями', 'Поровну: минуты те же'], answer: (r) => (Math.abs(r.iter.ev.ok - r.demo.ev.ok) <= 2 ? 2 : r.iter.ev.ok > r.demo.ev.ok ? 1 : 0) },
      action: { label: 'Посчитать обе кривые до 8 минут', run: (X) => X.eight() },
      criteria: [{ label: 'Опыт с исправлениями впереди демонстраций на отметке 8 минут', test: (r) => r.iter && r.demo && r.iter.ev.ok > r.demo.ev.ok }],
      explain: (r) => `${r.demo.n} демонстраций (${r.demo.added} новых за ${fmt(r.demo.min, 1)} мин): ${r.demo.ev.ok} из 60, из соседней ниши ${r.demo.ev.by.shelf.ok} из 8, а у политики по 40 демонстрациям было ${r.base.ok} из 60. ${r.iter.attempts} попыток с присмотром (${fmt(r.iter.minutes, 1)} мин): ${r.iter.ev.ok} из 60, из соседней ниши ${r.iter.ev.by.shelf.ok} из 8. Робот сам попадает в старты, которых оператор не записывает, а исправления ложатся точно туда, где он ошибается.` },
    { short: 'Полчаса', title: 'Полчаса демонстраций', text: 'Доведём обе кривые до 32 минут: политики по 160 и 320 демонстрациям, то есть ещё 120 и 280 записей оператора, против шести итераций по 25 попыток. Число шагов обучения у политик по демонстрациям растёт вместе с данными.',
      bet: { q: 'хватит ли 320 демонстраций, около получаса записи, чтобы робот справлялся из соседней ниши?', options: ['Да: данных вчетверо больше, обобщит', 'Нет: движения назад из ниши в демонстрациях нет, сколько их ни записывай', 'Да, но только если записывать быстрее'], answer: (r) => (r.demo320.by.shelf.ok >= 6 ? 0 : 1) },
      action: { label: 'Досчитать кривые до 32 минут', run: (X) => X.thirty() },
      criteria: [{ label: '320 демонстраций не закрывают старты из соседней ниши: не больше 4 из 8', test: (r) => r.demo320.by.shelf.ok <= 4 }, { label: 'Опыт с исправлениями закрывает их: не меньше 6 из 8', test: (r) => r.iter.ev.by.shelf.ok >= 6 }],
      explain: (r) => `320 демонстраций (${r.demoAdded} новых за ${fmt(r.demoMin, 1)} мин): ${r.demo320.ok} из 60, у шкафа ${r.demo320.by.near.ok} из 12, из соседней ниши ${r.demo320.by.shelf.ok} из 8. Старты у шкафа лишние демонстрации закрывают: политика лучше выучивает «сначала высота», а вот выезда из ниши в записях оператора нет. Опыт с исправлениями даёт по итерациям ${r.iters.map((x) => `${x.ev.ok}`).join(' → ')} из 60, а за ${fmt(r.iter.minutes, 1)} мин политика научилась справляться из соседней ниши в ${r.iter.ev.by.shelf.ok} ${plural(r.iter.ev.by.shelf.ok, 'старте', 'стартах', 'стартах')} из 8. Так и в HIL-SERL: 200 демонстраций вместо 20 без вмешательств дали 0% на сборке приборной панели, а с вмешательствами — 100% за 2 часа.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай бюджет минут и сравнивай пути. Найди наименьший бюджет, при котором опыт с исправлениями обгоняет 320 демонстраций.', final: true, controls: ['min'] },
  ];
  function init() {
    $('#bMin').addEventListener('input', (e) => { st.min = +e.target.value; render(); if (ctl) ctl.update(); });
    ctl = mountMissions('#bMis', missions, api, { controls: { min: '#wrapBMin' }, scene: '#bChart' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, iters };
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
    { q: 'Политика после дообучения по демонстрациям застряла на 80% успеха. Поможет ли записать вдесятеро больше демонстраций?', o: ['Да: дело всегда в нехватке данных', 'Не обязательно: если в демонстрациях нет нужного движения, их число не поможет — в HIL-SERL политика на 200 демонстрациях переворачивала предмет в 46% случаев, на 20 — в 47%', 'Нет: демонстрации вообще не влияют на успех'], a: 1, e: 'В лаборатории 3 320 демонстраций закрыли старты у шкафа, но не из соседней ниши: движения назад в записях оператора нет. Политика с исправлениями закрыла и их за четверть часа работы робота.' },
    { q: 'Чем вмешательство в HIL-SERL отличается от HG-DAgger из урока 1.2?', o: ['Ничем: человек так же перехватывает управление', 'Данные те же, но учится политика по-другому: шаги человека идут в буферы, и обучение с подкреплением оптимизирует награду, а не копирует человека; при одинаковом числе попыток и вмешательств HG-DAgger дал в среднем 49,7% против 100%', 'В HIL-SERL человек вмешивается только в конце обучения'], a: 1, e: 'Авторы HIL-SERL сравнивали именно так: HG-DAgger получал столько же эпизодов и вмешательств. Его доля вмешательств со временем не падала, а у RL — доходила до нуля.' },
    { q: 'Зачем HIL-SERL хранит шаги человека в двух буферах?', o: ['Для надёжности: один буфер может потеряться', 'Чтобы обучение брало половину каждого пакета из буфера демонстраций: редкие шаги человека видны часто, а шаги политики — только из буфера опыта', 'Чтобы отделить удачные попытки от неудачных'], a: 1, e: 'Симметричная выборка из RLPD: половина пакета из заранее собранных данных, половина — из опыта. В лаборатории 2 те же исправления без второго буфера давали заметно меньше удачных стартов из соседней ниши.' },
    { q: 'Откуда в HIL-SERL берётся награда?', o: ['Её задаёт человек вручную на каждом шаге', 'Классификатор по кадрам камер отвечает «сделано — 1, нет — 0»; его учат на 200 примерах успеха и 1000 примерах неудачи, около 5 минут записи', 'Награда — расстояние до цели по датчикам'], a: 1, e: 'Награда разреженная: 1 только при завершении задачи. Авторы отмечают, что для сложных задач придумать плотную награду руками невозможно, а классификатор обходится десятком записей.' },
    { q: 'RECAP учит VLA только на удачных попытках?', o: ['Да: неудачные попытки выбрасывают', 'Нет: на всех, а во вход модели пишут «Advantage: positive» или «negative» по преимуществу каждого шага; при работе пишут positive', 'Нет: на всех, но с одинаковыми весами'], a: 1, e: 'Взвешенная регрессия (AWR) выбрасывает или сильно занижает большую часть данных, а градиент политики трудно применить к flow matching. На складывании футболок AWR дала приличный успех, но заметно более медленную политику и меньшую пропускную способность, чем RECAP.' },
    { q: 'Почему в RECAP шаги исправлений оператора всегда помечают как положительные?', o: ['Потому что оператор всегда действует оптимально', 'Потому что это допущение: авторы считают, что исправления — хорошие действия, хотя оператор не гарантирует их качество; исправления нужны против грубых ошибок, а не для тонкой настройки скорости', 'Потому что функция ценности не умеет их оценивать'], a: 1, e: 'Авторы π*0.6 прямо пишут, что вмешательство — событие разрушительное, и даже эксперт не обеспечит ровного качества; исправления закрывают крупные промахи, а скорость и мелочи доводит автономный опыт с разметкой по ценности.' },
    { q: 'Функция ценности в RECAP предсказывает вероятность успеха?', o: ['Да, от 0 до 1', 'Нет: число шагов до успешного завершения со знаком минус, нормированное на длину задачи; провал получает большой отрицательный штраф', 'Нет: сумму наград за все 50 Гц действия'], a: 1, e: 'Поэтому преимущество шага показывает, приблизил ли он успех и насколько: быстрые шаги получают positive даже в удачных попытках, а медленные — negative. Так растёт пропускная способность.' },
    { q: 'Дообучать VLA с подкреплением лучше, чем учить RL-политику с нуля на тех же вмешательствах?', o: ['Нет: VLA только мешает', 'Да, по ConRFT: от предобученной VLA 96,3% в среднем за 45–90 минут, а HIL-SERL с нуля за то же время и с теми же вмешательствами — 31,9%', 'Одинаково: результат определяется числом вмешательств'], a: 1, e: 'Предобученная модель начинает с осмысленных движений, и исследование меньше ломает сцену. При этом HIL-SERL с нуля, по словам авторов ConRFT, доходит до хороших политик, но за два с лишним часа и с большим числом вмешательств.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('trio', () => { mis.trio = Trio.init(); });
    safe('hands', () => { mis.hands = Hands.init(); });
    safe('budget', () => { mis.budget = Budget.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'hMis', 'bMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l57 = { mis, Trio, Hands, Budget, Store, L57 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
