/* =====================================================================
   ui-l66.js — урок 6.6 «Обзор гуманоидных платформ».
   0) анимированная схема `stacks`: три стека управления рядом — классический
      стек Atlas (движения рассчитаны заранее, MPC и контроллер всего тела),
      Atlas с LBM (обученная модель над MPC) и Figure 03 с Helix 02 (все три
      уровня обучены); толчок в корпус ловит нижний блок каждого стека;
   1) диаграммы чисел из статей и документации — общий модуль shared/stats-chart.js;
   2) лаборатория «Сравнительная таблица архитектур»: таблица платформ по
      четырём осям; в миссиях читатель отмечает строки, которые отвечают
      условию задачи, проверяет и читает разбор; в свободном режиме сравнивает
      две платформы рядом;
   3) квиз.
   Данные таблицы и проверки — l66/engine.js (без DOM, без случайности).
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

/* =====================================================================
   0. Схема `stacks`: что в стеке управления обучено, а что написано людьми.
   Три стека рядом (на телефоне — один под другим):
   - Atlas, классический стек: движения рассчитаны заранее по анимации ключевых кадров, на ходу их ведут
     MPC-планировщик и контроллер всего тела на оптимизации (ZEST, RAI Institute и Boston Dynamics, 2026);
   - Atlas с LBM (Boston Dynamics и TRI, 2025): модель на 450 млн параметров 30 раз в секунду выдаёт позы
     кистей, торса и стоп через тот же интерфейс, что телеоперация, а он построен на MPC Boston Dynamics;
   - Figure 03 с Helix 02 (2026): S2 решает, что делать, S1 200 раз в секунду выдаёт цели всех суставов,
     S0 — сеть на 10 млн параметров — 1000 раз в секунду выдаёт команды приводам (урок 3.7).
   Цвета: оранжевый — обучено на данных, синий — написано и настроено людьми, серый — вход и приводы.
   Цикл 8 с: точки идут сверху вниз с условным ритмом (чем ниже блок, тем чаще); на 4,6 с корпус толкают,
   и толчок ловит нижний блок каждого стека. Подписи не мельче 10 px.
   ===================================================================== */
const STACKS = [
  { id: 'classic', name: 'Atlas: классический стек', sub: 'Boston Dynamics, паркур и танцы',
    input: { t: 'движения рассчитаны заранее', s: 'по анимации ключевых кадров', kind: 'cl' },
    blocks: [{ t: 'MPC-планировщик', s: 'план на ходу, написан людьми', kind: 'cl' },
      { t: 'контроллер всего тела', s: 'оптимизация на каждом шаге', kind: 'cl', low: true }],
    rates: [1.6, 0.4, 0.13] },
  { id: 'lbm', name: 'Atlas с LBM', sub: 'Boston Dynamics и TRI, 2025',
    input: { t: 'камеры, тело и просьба', s: 'стереопара в голове, слова', kind: 'in' },
    blocks: [{ t: 'LBM: 450 млн параметров', s: 'позы кистей, торса и стоп, 30 Гц', kind: 'nn' },
      { t: 'MPC Boston Dynamics', s: 'тот же, что у телеоперации', kind: 'cl', low: true }],
    rates: [0.9, 0.4, 0.13] },
  { id: 'helix', name: 'Figure 03 с Helix 02', sub: 'Figure, 2026',
    input: { t: 'камеры, тело и просьба', s: 'голова, ладони, кончики пальцев', kind: 'in' },
    blocks: [{ t: 'S2: модель зрения и языка', s: 'решает, что делать', kind: 'nn' },
      { t: 'S1: цели всех суставов', s: '200 раз в секунду', kind: 'nn' },
      { t: 'S0: сеть на 10 млн', s: '1000 раз в секунду, равновесие', kind: 'nn', low: true }],
    rates: [0.9, 0.4, 0.2, 0.08] },
];
(() => {
  const T = 8, PUSH = 4.6;
  const colOf = (P, kind) => (kind === 'nn' ? P.mot : kind === 'cl' ? P.out : P.ink3);
  /** Блок стека: скруглённый прямоугольник, заголовок и подпись; hot — подсвечен (ловит толчок). */
  function block(c, k, A, P, x, y, w, h, b, hot, n) {
    const col = colOf(P, b.kind);
    A.rect(c, x, y, w, h, 9, A.alpha(col, hot ? 0.2 : b.kind === 'in' ? 0.05 : 0.09), hot ? P.bad : A.alpha(col, 0.75), hot ? 2.4 : 1.4);
    A.lab(c, k, b.t, x + w / 2, y + (n ? 13 : 17), { px: n ? 11 : 11.5, weight: 700, color: b.kind === 'in' ? P.ink2 : col, halo: false });
    A.lab(c, k, b.s, x + w / 2, y + (n ? 28 : 35), { px: 10, weight: 600, color: P.ink2, halo: false });
  }
  /** Точки, бегущие сверху вниз по отрезку [y0, y1]: новая точка входит раз в per секунд (ритм условный),
   *  на отрезке видно не больше трёх точек, и они не налезают друг на друга. */
  function dots(c, A, x, y0, y1, per, t, col) {
    const len = y1 - y0; if (len < 8) return;
    const n = Math.max(1, Math.min(3, Math.floor(len / 10))), P = Math.max(0.15, per);
    for (let j = 0; j < n; j++) {
      const ph = ((t / (P * n) + j / n) % 1 + 1) % 1;
      A.circle(c, x, y0 + 3 + ph * (len - 6), 3, A.alpha(col, 0.9), null);
    }
  }
  function stack(c, k, A, P, g, s, u, n) {
    const { x, y, w } = g, bh = n ? 36 : 46, gap = n ? 12 : 22, hot = u >= PUSH && u < PUSH + 1.4;
    A.lab(c, k, s.name, x + w / 2, y + (n ? 9 : 10), { px: n ? 11.5 : 12.5, weight: 750, color: P.ink, halo: false });
    A.lab(c, k, s.sub, x + w / 2, y + (n ? 24 : 27), { px: 10, weight: 600, color: P.ink3, halo: false });
    const items = [s.input].concat(s.blocks), top = y + (n ? 34 : 42), H = items.length;
    // блоки выравниваем по нижнему краю: приводы у всех на одной высоте
    const slots = n ? H : 4, y0 = top + (slots - H) * (bh + gap);
    const ys = items.map((_, i) => y0 + i * (bh + gap)), act = y0 + H * (bh + gap);
    items.forEach((b, i) => {
      block(c, k, A, P, x, ys[i], w, bh, b, hot && b.low, n);
      const ya = ys[i] + bh + 2, yb = (i < H - 1 ? ys[i + 1] : act) - 2;
      A.line(c, [[x + w / 2, ya], [x + w / 2, yb]], A.alpha(P.ink3, 0.45), 1.2);
      dots(c, A, x + w / 2, ya, yb, s.rates[i], u + i * 0.17, colOf(P, i === 0 && b.kind === 'in' ? 'in' : b.kind));
    });
    // приводы и корпус
    const ah = n ? 24 : 28;
    A.rect(c, x, act, w, ah, 8, A.alpha(P.ink3, 0.08), A.alpha(P.ink3, 0.6), 1.2);
    A.lab(c, k, hot ? 'толчок в корпус' : 'приводы суставов', x + w / 2, act + ah / 2, { px: 10.5, weight: 700, color: hot ? P.bad : P.ink2, halo: false });
    if (hot) { const al = 1 - (u - PUSH) / 1.4; c.save(); c.globalAlpha = 0.35 + 0.65 * al; A.arrow(c, x - (n ? 2 : 4) + 18 * al, act + ah / 2, x + 14 + 18 * al, act + ah / 2, P.bad, 2.4, 7); c.restore(); }
    return act + ah;
  }
  /** Легенда цветов одной строкой; ширина подписи меряется тем же шрифтом, что у подписи. */
  function legend(c, k, A, P, x, y, n) {
    const items = [[P.mot, n ? 'обучено' : 'обучено на данных'], [P.out, n ? 'написано людьми' : 'написано и настроено людьми'], [P.ink3, 'вход и приводы']];
    let lx = x;
    for (const [col, txt] of items) {
      A.rect(c, lx, y - 5, 10, 10, 3, A.alpha(col, 0.35), col, 1.2);
      A.lab(c, k, txt, lx + 15, y, { px: 10, weight: 600, color: P.ink2, halo: false, align: 'left' });
      HeroKit.font(c, k, 10, 600); lx += 15 + c.measureText(txt).width + (n ? 12 : 22);
    }
  }
  function draw(c, k, t, P, A, n) {
    const u = ((t % T) + T) % T;
    if (!n) {
      const w = 216, gapX = 24, x0 = (720 - 3 * w - 2 * gapX) / 2;
      let bottom = 0;
      STACKS.forEach((s, i) => { bottom = Math.max(bottom, stack(c, k, A, P, { x: x0 + i * (w + gapX), y: 8, w }, s, u, false)); });
      legend(c, k, A, P, x0, bottom + 22, false);
    } else {
      let y = 6;
      STACKS.forEach((s) => { y = stack(c, k, A, P, { x: 12, y, w: 336 }, s, u, true) + 18; });
      legend(c, k, A, P, 12, y + 4, true);
    }
  }
  Anim.add('stacks', { W: 720, H: 392, start: 1.2, narrowAt: 640, draw: (c, k, t, P, A) => draw(c, k, t, P, A, false), narrow: { W: 360, H: 736, draw: (c, k, t, P, A) => draw(c, k, t, P, A, true) } });
})();

/* =====================================================================
   2. Лаборатория «Сравнительная таблица архитектур». Таблица — L66.ROWS по осям L66.AXES.
   Миссия задаёт ситуацию; читатель отмечает строки (нажатием на название платформы), кнопка
   «Проверить отметки» сверяет их с ответом движка (L66.check) и подсвечивает пропущенные и лишние.
   Нажатие на ячейку показывает, откуда взят факт. В свободном режиме две отмеченные строки
   сравниваются рядом по всем колонкам (L66.compare).
   ===================================================================== */
const Tab = (() => {
  const E = L66;
  const st = { axis: 'ctl', mode: 'view', sel: new Set(), cmp: [], res: null, src: null, qid: null };
  let ctl = null;
  const nameOf = (id) => E.rowById(id).name;
  const listNames = (ids) => ids.map(nameOf).join(', ');
  function setAxis(a) { st.axis = a; segSet('#tAxis', a); render(); }
  /** Перерисовка с сохранением фокуса: таблица собирается заново, фокус возвращается на ту же кнопку или ячейку. */
  function keepFocus(fn) {
    const a = document.activeElement, row = a && a.dataset ? a.dataset.row : null, col = a && a.dataset ? a.dataset.col : null;
    fn();
    if (row) { const sel = col ? `#tTable .pt-cell[data-row="${row}"][data-col="${col}"]` : `#tTable .pt-name[data-row="${row}"]`, e = document.querySelector(sel); if (e) e.focus({ preventScroll: true }); }
  }
  function table() {
    const ax = E.AXES.find((x) => x.id === st.axis), cols = ax.cols, res = st.res;
    const head = `<div class="pt-head" role="row"><div role="columnheader">Платформа</div>${cols.map((c) => `<div role="columnheader">${E.COLS[c].label}<small>${E.COLS[c].sub}</small></div>`).join('')}</div>`;
    const rows = E.ROWS.map((r) => {
      const cls = ['pt-row'];
      if (r.ada) cls.push('pt-ada');
      if (res) { if (res.miss.includes(r.id)) cls.push('pt-miss'); else if (res.extra.includes(r.id)) cls.push('pt-extra'); else if (res.hit.includes(r.id)) cls.push('pt-ok'); }
      if (st.mode === 'compare' && st.cmp.includes(r.id)) cls.push('pt-cmp');
      const pressed = st.mode === 'pick' ? st.sel.has(r.id) : st.mode === 'compare' ? st.cmp.includes(r.id) : false;
      const name = `<button type="button" class="pt-name" data-row="${r.id}" aria-pressed="${pressed}"><b>${r.name}</b><small>${r.org}</small></button>`;
      const cells = cols.map((c) => { const x = r.cells[c], on = st.src && st.src[0] === r.id && st.src[1] === c; return `<div class="pt-cell${on ? ' pt-src' : ''}" role="cell" tabindex="0" data-row="${r.id}" data-col="${c}" data-m="${x.m}"><span class="pt-col-l">${E.COLS[c].label}</span>${x.t}</div>`; }).join('');
      return `<div class="${cls.join(' ')}" role="row">${name}${cells}</div>`;
    }).join('');
    return head + rows;
  }
  /** Легенда меток для открытой оси: у каждой оси свои вопросы, поэтому и смысл меток свой. */
  function legend() {
    const L = {
      ctl: [['nn', 'обучено на данных'], ['cl', 'написано людьми'], ['mix', 'и то и другое'], ['yes', 'на борту'], ['no', 'нет своего уровня или не на борту'], ['na', 'не опубликовано']],
      data: [['yes', 'используют'], ['no', 'учат не задачам'], ['na', 'не опубликовано']],
      body: [['i', 'сведения из документации'], ['yes', 'сам меняет батарею или заряжается'], ['no', 'батарею меняет человек'], ['na', 'не опубликовано']],
      use: [['yes', 'работает у заказчика'], ['no', 'у себя, в исследованиях'], ['i', 'сведения'], ['na', 'не опубликовано']],
    };
    return L[st.axis].map(([m, t]) => `<span><i class="${m}"></i>${t}</span>`).join('');
  }
  function count() {
    if (st.mode === 'pick') { const n = st.sel.size; return n ? `Отмечено: <b>${n}</b> — ${listNames(E.ROWS.filter((r) => st.sel.has(r.id)).map((r) => r.id))}` : 'Отметь строки: нажми на название платформы. Повторное нажатие снимает отметку.'; }
    if (st.mode === 'compare') return st.cmp.length < 2 ? `Нажми на названия двух платформ, чтобы сравнить их рядом${st.cmp.length ? `: выбрана ${nameOf(st.cmp[0])}` : ''}.` : `Сравниваются <b>${nameOf(st.cmp[0])}</b> и <b>${nameOf(st.cmp[1])}</b>. Нажми на другое название, чтобы заменить первую.`;
    return 'Нажми на ячейку, чтобы увидеть, откуда взят факт.';
  }
  function srcLine() {
    if (!st.src) return '';
    const [rid, col] = st.src, r = E.rowById(rid), x = r.cells[col], s = E.SRC[x.s];
    const ref = s ? (s.u ? `<a href="${s.u}" target="_blank" rel="noopener">${s.t}</a>` : s.t) + (s.d ? `, ${s.d}` : '') : '';
    return `<b>${r.name} · ${E.COLS[col].label}.</b> ${x.t}${x.n ? `. ${x.n}` : ''}.${ref ? ` Источник: ${ref}.` : ''}`;
  }
  function cmpBox() {
    if (st.mode !== 'compare' || st.cmp.length < 2) return '';
    const C = E.compare(st.cmp[0], st.cmp[1]), A = E.rowById(C.a), B = E.rowById(C.b);
    let body = '';
    for (const ax of E.AXES) {
      body += `<tr class="pt-axis-row"><th colspan="3">${ax.label}</th></tr>`;
      for (const r of C.rows.filter((q) => q.axis === ax.id)) body += `<tr class="${r.diff ? 'pt-diff' : ''}"><th>${E.COLS[r.col].label}</th><td>${r.a.t}</td><td>${r.b.t}</td></tr>`;
    }
    return `<table><thead><tr><th></th><th>${A.name}</th><th>${B.name}</th></tr></thead><tbody>${body}</tbody></table><p class="muted-s" style="margin:8px 10px">Подсвечены колонки, где метки расходятся: ${C.ndiff} из ${C.rows.length}.</p>`;
  }
  function render() {
    keepFocus(() => {
      const el = $('#tTable'); el.className = 'pt' + (st.mode === 'pick' ? ' picking' : st.mode === 'compare' ? ' comparing' : '');
      setOut(el, table());
    });
    setOut($('#tLegend'), legend());
    setOut($('#tCount'), count());
    const s = $('#tSrc'), sl = srcLine(); s.hidden = !sl; setOut(s, sl);
    const cb = $('#tCmp'), ch = cmpBox(); cb.hidden = !ch; setOut(cb, ch);
    if (ctl) ctl.update();
  }
  function onClick(e) {
    const nm = e.target.closest('.pt-name'), cl = e.target.closest('.pt-cell');
    if (nm) {
      const id = nm.dataset.row;
      if (st.mode === 'pick') { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); st.res = null; }
      else if (st.mode === 'compare') { if (st.cmp.includes(id)) st.cmp = st.cmp.filter((x) => x !== id); else { st.cmp.push(id); if (st.cmp.length > 2) st.cmp.shift(); } }
      render(); return;
    }
    if (cl) { const key = [cl.dataset.row, cl.dataset.col]; st.src = st.src && st.src[0] === key[0] && st.src[1] === key[1] ? null : key; render(); }
  }
  function onKey(e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pt-cell')) { e.preventDefault(); onClick(e); } }
  function state() { return { axis: st.axis, mode: st.mode, sel: [...st.sel], cmp: st.cmp.slice(), res: st.res }; }
  /** Режим миссии: отметки сбрасываются, ось — та, что задана (или прежняя, если ось выбирает читатель). */
  function enter(qid, axis) { st.qid = qid; st.mode = qid ? 'pick' : 'compare'; st.sel = new Set(); st.res = null; st.cmp = []; st.src = null; if (axis) st.axis = axis; segSet('#tAxis', st.axis); render(); }
  async function checkNow() { await sleep0(); st.res = E.check(st.qid, [...st.sel]); render(); return st.res; }
  function pick(ids) { st.sel = new Set(ids); st.res = null; render(); }
  function compareRows(a, b) { st.mode = 'compare'; st.cmp = [a, b]; render(); }
  return { st, setAxis, render, onClick, onKey, state, enter, checkNow, pick, compareRows, get ctl() { return ctl; }, set ctl(v) { ctl = v; } };
})();

/* ---------- миссии лаборатории: ситуация → ставка → отметки в таблице → проверка и разбор ---------- */
const TabLab = (() => {
  const E = L66, T = Tab;
  const nm = (id) => E.rowById(id).name;
  /** Перечень названий через запятую, последнее — через «и». */
  const names = (ids) => { const n = ids.map(nm); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' и ' + n[n.length - 1]; };
  const plat = (ids) => ids.filter((id) => id !== 'ada');
  /** Число платформ словами в родительном падеже: «у пяти платформ из восьми». */
  const GEN = ['ни одной', 'одной', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми'];
  /** Разбор ошибок: пропущенные и лишние строки с текстом их ячейки в колонке вопроса. */
  function fail(r) {
    const q = E.Q[r.qid], col = q.col, line = (id) => { const x = E.cell(id, col); return `<li><b>${nm(id)}</b>: ${x.t}. ${q.why[x.m] || ''}</li>`; };
    let html = `<p style="margin:0 0 6px"><b>Пока не так.</b> Верно отмечено ${r.hit.length} из ${r.answer.length}.</p>`;
    if (r.miss.length) html += `<p style="margin:6px 0 2px">Пропущены:</p><ul style="margin:0;padding-left:18px">${r.miss.map(line).join('')}</ul>`;
    if (r.extra.length) html += `<p style="margin:6px 0 2px">Лишние:</p><ul style="margin:0;padding-left:18px">${r.extra.map(line).join('')}</ul>`;
    return html + '<p style="margin:6px 0 0">Поправь отметки и проверь ещё раз.</p>';
  }
  const crit = [
    { label: 'Отмечены все платформы, которые подходят', test: (r) => !!r && !r.miss.length },
    { label: 'Лишних отметок нет', test: (r) => !!r && !r.extra.length },
  ];
  const action = { label: 'Проверить отметки', run: async () => T.checkNow() };
  const summary = (r) => `отмечено ${r.n}: верно ${r.hit.length} из ${r.answer.length}, лишних ${r.extra.length}`;
  const missions = [
    { short: 'Толчок', title: 'Толчок в плечо: кто ловит равновесие',
      text: 'Робот несёт коробку, а модель верхнего уровня обдумывает следующий шаг: в уроке 6.4 она отвечала несколько раз в секунду. В этот момент робота толкают в плечо. В таблице открыта ось «Управление». Отметь платформы, у которых, по опубликованным данным, толчок ловит обученная нейросеть, а не регулятор, написанный людьми. Ада тоже есть в таблице.',
      onEnter: () => T.enter('push', 'ctl'),
      bet: { q: 'Сколько из восьми платформ так устроены?', options: ['одна-две: равновесие по-прежнему держат регуляторы, написанные людьми', 'больше половины', 'все восемь'], answer: (r) => { const n = plat(r.answer).length; return n <= 2 ? 0 : n >= 8 ? 2 : 1; } },
      action, criteria: crit, summary, fail,
      hint: 'Толчок ловит не тот уровень, который понимает задачу, а тот, что видит тело много раз в секунду. Смотри колонку «Нижний уровень».',
      explain: (r) => `Толчок ловит нижний уровень: модель верхнего уровня видит тело слишком редко, это мы проверили в лаборатории 1 урока 6.4. По опубликованным данным, нижний уровень обучен у ${names(plat(r.answer))}, то есть у ${GEN[plat(r.answer).length]} платформ из восьми, и у Ады. Atlas прошёл этот путь целиком: в 2025 году LBM работала поверх MPC, а в 2026 году Boston Dynamics пишет, что её контроллеры всего тела обучены с подкреплением в симуляции. ${E.Q.push.rest}` },
    { short: 'Без сети', title: 'Пропала сеть: кто продолжит работу',
      text: 'Робот загружает посудомойку, и сеть в доме пропадает на минуту. Отметь платформы, которые, по опубликованным данным, продолжат задачу, потому что модель верхнего уровня у них считается на борту.',
      onEnter: () => T.enter('offline', 'ctl'),
      bet: { q: 'Что будет с роботом, у которого модель верхнего уровня работает в облаке?', options: ['упадёт: без этой модели некому держать равновесие', 'устоит, но задачу продолжить не сможет', 'продолжит работу: на борту хватит последней пачки действий'], answer: () => 1 },
      action, criteria: crit, summary, fail,
      hint: 'Нужна колонка «Верхний уровень на борту?». Нижний уровень у всех платформ работает на роботе, поэтому без сети робот устоит, а задачу ведёт модель верхнего уровня.',
      explain: (r) => `Нижний уровень у всех платформ работает на роботе, поэтому без сети никто не упадёт, но задачу продолжат только те, у кого верхний уровень тоже на борту: ${names(plat(r.answer).concat(['ada']))}. ${E.Q.offline.rest}` },
    { short: 'Задачи', title: 'Новая задача, а телеоператоров мало',
      text: 'Телеоператор записывает час демонстраций за час собственной работы (урок 4.2). Отметь платформы, которые, по опубликованным данным, учат задачам верхнего уровня не только по телеоперации, но и по видео и записям людей. Нужную ось таблицы выбери в переключателе над ней.',
      controls: ['axis'], onEnter: () => T.enter('human'),
      bet: { q: 'Atlas учится трюкам по motion capture и видео людей. Отметить ли его?', options: ['да: это записи людей', 'нет: эти записи учат движениям нижнего уровня, а задачам Atlas учат по телеоперации', 'нельзя сказать по таблице'], answer: () => 1 },
      action, criteria: crit, summary, fail,
      hint: 'Ось «Данные», колонка «Люди». Смотри, чему учат записи людей: задачам или движениям нижнего уровня, как трекеры урока 6.3.',
      explain: (r) => `По видео и записям людей задачам учат ${names(plat(r.answer))}, а в курсе — Ада в уроке 4.4. ${E.Q.human.rest}` },
    { short: 'Смена', title: 'Смена длиннее батареи',
      text: 'Смена на заводе длится 8 часов, а батареи гуманоидов в уроке 6.5 держали от 2 до 5 часов. Отметь платформы, которые, по опубликованным данным, работают дольше одной батареи без помощи человека: сами меняют батарею или сами встают на зарядку.',
      controls: ['axis'], onEnter: () => T.enter('shift'),
      bet: { q: 'Сколько из восьми платформ так могут?', options: ['меньше половины', 'большинство', 'все восемь: это обязательное требование заводов'], answer: (r) => { const n = plat(r.answer).length; return n < 4 ? 0 : n >= 8 ? 2 : 1; } },
      action, criteria: crit, summary, fail,
      hint: 'Ось «Тело», колонка «Батарея». Сменная батарея, которую меняет человек, не подходит.',
      explain: (r) => `Дольше одной батареи без человека работают ${names(plat(r.answer))}. ${E.Q.shift.rest}` },
    { short: 'Заказчик', title: 'Работа у заказчика или показ',
      text: 'Видео с показа не говорит, где и сколько робот работает на самом деле. Отметь платформы, которые, по опубликованным данным, уже работают у заказчика на настоящей задаче: на заводе, на складе или в магазине, а не только у себя, на испытаниях и на показах.',
      controls: ['axis'], onEnter: () => T.enter('customer'),
      bet: { q: 'Unitree продала больше 5000 гуманоидов за 2025 год. Отметить ли её?', options: ['да: роботы проданы, значит работают у заказчиков', 'нет: их покупают для исследований и учёбы, а не для работы на задаче заказчика', 'нельзя сказать по таблице'], answer: () => 1 },
      action, criteria: crit, summary, fail,
      hint: 'Ось «Применение», колонка «Где работает». Завод самой компании — это работа у себя.',
      explain: (r) => `У заказчиков работают ${names(plat(r.answer))}. ${E.Q.customer.rest}` },
    { short: 'Свободно', final: true, title: 'Свободный режим: две платформы рядом',
      text: 'Нажми на названия двух платформ, и под таблицей появится сравнение по всем двенадцати колонкам; колонки, где метки расходятся, подсвечены. Найди пару платформ, которые расходятся во всех трёх колонках управления, и платформу, которая расходится с Адой меньше всех.',
      controls: 'all', onEnter: () => T.enter(null) },
  ];
  function init() {
    $('#tTable').addEventListener('click', T.onClick); $('#tTable').addEventListener('keydown', T.onKey);
    segBind('#tAxis', (v) => T.setAxis(v));
    App.on('theme', T.render);
    const ctl = mountMissions('#tMis', missions, { reset() { T.enter('push', 'ctl'); }, state: T.state }, { controls: { axis: '#wrapTAxis' }, scene: '#tTable' });
    T.ctl = ctl; T.render();
    return ctl;
  }
  return { init, missions };
})();

/* =====================================================================
   1. Числа из статей и документов компаний — диаграммами (shared/stats-chart.js).
   ===================================================================== */
function initStats() {
  const el = (id) => document.getElementById(id);
  // ZEST, табл. 2: MAE(q) в радианах; на диаграмме — в градусах (×180/π, округление до 0,1°), чтобы числа на столбцах читались
  const DEG = (r) => Math.round(r * 1800 / Math.PI) / 10;
  if (el('zestBars')) StatsChart.bars(el('zestBars'), {
    series: [{ id: 'mpc', label: 'MPC Boston Dynamics', color: 'var(--classic)' }, { id: 'rl', label: 'политика ZEST, обучена в симуляции', color: 'var(--e2e)' }],
    groups: [
      { label: 'ходьба', values: { mpc: DEG(0.047), rl: DEG(0.055) } },
      { label: 'бег', values: { mpc: DEG(0.117), rl: DEG(0.076) } },
      { label: 'колесо', values: { mpc: DEG(0.237), rl: DEG(0.088) } },
      { label: 'стойка на руках', values: { mpc: null, rl: DEG(0.147) } },
      { label: 'пере\u00ADкат', values: { mpc: null, rl: DEG(0.086) } },
      { label: 'танец', values: { mpc: null, rl: DEG(0.096) } },
    ], max: 15, unit: '', ticks: [0, 5, 10, 15], digits: 1,
  });
  if (el('dataBars')) StatsChart.bars(el('dataBars'), {
    series: [{ id: 'robot', label: 'записи роботов, ч', color: 'var(--classic)' }, { id: 'human', label: 'записи и видео людей, ч', color: 'var(--hybrid)' }],
    groups: [
      { label: 'Figure, Helix', values: { robot: 500, human: null } },
      { label: 'Figure, S0', values: { robot: null, human: 1000 } },
      { label: '1X, модель мира', values: { robot: 70, human: 900 } },
      { label: 'Unitree, WLA-1.0', values: { robot: 2500, human: null } },
      { label: 'AgiBot World', values: { robot: 2976, human: null } },
      { label: 'AgiBot, GE-Act 2.0', values: { robot: null, human: 3000 } },
    ], max: 3000, unit: '', ticks: [0, 1000, 2000, 3000], digits: 0,
  });
  if (el('massBars')) StatsChart.bars(el('massBars'), {
    series: [{ id: 'm', label: 'масса, кг', color: 'var(--classic)' }],
    groups: [{ label: 'NEO', values: { m: 30 } }, { label: 'G1', values: { m: 35 } }, { label: 'Digit, 2023', values: { m: 45 } }, { label: 'Figure 03', values: { m: 61 } }, { label: 'A2 Ultra', values: { m: 69 } }, { label: 'Apollo', values: { m: 73 } }, { label: 'Atlas', values: { m: 90 } }, { label: 'Digit 5', values: { m: 129 } }],
    max: 140, unit: '', ticks: [0, 35, 70, 105, 140], digits: 0,
  });
  if (el('runBars')) StatsChart.bars(el('runBars'), {
    series: [{ id: 'h', label: 'время работы от одной батареи, ч', color: 'var(--e2e)' }],
    groups: [{ label: 'Digit 5', values: { h: 1.5 } }, { label: 'A2, ходьба', values: { h: 1.5 } }, { label: 'G1', values: { h: 2 } }, { label: 'H2', values: { h: 3 } }, { label: 'NEO', values: { h: 4 } }, { label: 'Atlas', values: { h: 4 } }, { label: 'Digit 4', values: { h: 4 } }, { label: 'Figure 03', values: { h: 5 } }],
    max: 6, unit: '', ticks: [0, 2, 4, 6], digits: 1,
  });
  if (el('priceBars')) StatsChart.bars(el('priceBars'), {
    series: [{ id: 'p', label: 'цена, тысяч долларов', color: 'var(--hybrid)' }],
    groups: [{ label: 'Unitree R1 AIR', values: { p: 4.9 } }, { label: 'Unitree G1', values: { p: 13.5 } }, { label: 'NEO, предзаказ', values: { p: 20 } }, { label: 'Unitree H2', values: { p: 29.9 } }],
    max: 30, unit: '', ticks: [0, 10, 20, 30], digits: 1,
  });
  if (el('unitsBars')) StatsChart.bars(el('unitsBars'), {
    series: [{ id: 'u', label: 'гуманоидов за 2025 год, шт.', color: 'var(--classic)' }],
    groups: [{ label: 'Unitree, продано', values: { u: 5215 } }, { label: 'AgiBot, отгружено (Omdia)', values: { u: 5168 } }, { label: 'UBTech, продано', values: { u: 1079 } }],
    max: 6000, unit: '', ticks: [0, 2000, 4000, 6000], digits: 0,
  });
  if (el('gr2Body')) StatsChart.bars(el('gr2Body'), {
    series: [{ id: 's', label: 'задачи всем телом, кисти Inspire, %', color: 'var(--e2e)' }],
    groups: [{ label: 'поднять со стола', values: { s: 68.4 } }, { label: 'поднять с пола', values: { s: 45.7 } }, { label: 'поднять с полки', values: { s: 76.3 } }],
    max: 100, unit: '', ticks: [0, 50, 100], digits: 1,
  });
  if (el('gr2Hand')) StatsChart.bars(el('gr2Hand'), {
    series: [{ id: 's', label: 'задачи для пальцев, кисти Sharpa Wave, %', color: 'var(--hybrid)' }],
    groups: [{ label: 'вкрутить лампочку', values: { s: 36 } }, { label: 'вы\u00ADкру\u00ADтить', values: { s: 92 } }, { label: 'завязать мешок', values: { s: 44 } }, { label: 'смести в совок', values: { s: 32 } }, { label: 'закрыть пакет', values: { s: 40 } }],
    max: 100, unit: '', ticks: [0, 50, 100], digits: 0,
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
  { q: 'На видео гуманоид сам загружает посудомойку. Значит ли это, что им управляет одна нейросеть от пикселей до моторов?', o: ['Да, иначе робот не справился бы с такой задачей', 'Нет: у всех, кто описал своё управление, есть уровни, и нижний держит равновесие много раз в секунду; у Figure все три уровня обучены, но это три разные сети', 'Нет: такие видео всегда снимают с оператором'], a: 1, e: 'В Helix 02 S2 понимает сцену и язык, S1 выдаёт цели всех суставов, а S0, небольшая сеть, обученная в симуляции, держит равновесие. У Atlas, Digit и NEO наверху тоже модель, а внизу отдельный контроллер.' },
  { q: 'Стек, написанный людьми, с MPC и контроллером всего тела устарел и во всём проигрывает обученной политике?', o: ['Нет: на спокойной ходьбе MPC и обученная политика почти не различаются, а выигрывает политика на быстрых движениях и движениях с касанием коленями и корпусом, которые MPC не поддерживает', 'Да: MPC не справляется даже с ходьбой', 'Нет: MPC всегда точнее, поэтому Boston Dynamics его оставила'], a: 0, e: 'Так выходит в сравнении ZEST на Atlas в симуляции. Цена стека, написанного людьми, — ручная подготовка каждого движения и заранее размеченные контакты; поэтому Boston Dynamics к 2026 году перешла на контроллеры всего тела, обученные в симуляции.' },
  { q: 'Модель верхнего уровня робота работает в облаке. Что будет, если в доме пропала сеть?', o: ['Робот упадёт: без модели некому держать равновесие', 'Ничего: последняя пачка действий доведёт задачу до конца', 'Робот устоит, потому что нижний уровень работает на борту, но задачу продолжить не сможет'], a: 2, e: 'Нижний уровень у всех платформ работает на роботе. Gemini Robotics в 2025 году держала основу модели в облаке и оставляла на роботе только декодер, а Figure, Digit, NEO, Atlas и Optimus пишут, что считают модели на борту.' },
  { q: 'Компания показала гуманоидов на вечере для гостей: они разливали напитки и разговаривали. Что из этого следует о том, что роботы умеют сами?', o: ['Что они умеют это сами: иначе компания бы не стала показывать', 'Ничего, пока компания не сказала, кто ими управлял: на показе We, Robot роботам Optimus, по словам вице-президента Tesla, в какой-то мере помогали люди', 'Что роботы управляются из облака'], a: 1, e: 'Показ говорит о теле и о том, как оно двигается. О самостоятельности говорят только слова компании: 1X прямо пишет, что незнакомую работу NEO ведёт оператор, AgiBot — что показ бокса вела телеоперация, а Tesla помечает ускорение записи.' },
  { q: 'Почему почти все компании учат нижний уровень в симуляции, а задачи верхнего уровня — на записях?', o: ['Симулятор слишком медленный для модели верхнего уровня', 'Нижний уровень не нужно ничему учить, его пишут люди', 'Равновесие и шаги зависят от тела и физики, которые симулятор передаёт хорошо, а посуду, ткань и посылки он передаёт плохо, и для задач нужны записи настоящих роботов и людей'], a: 2, e: 'Так прямо объясняет Figure: посылки от жёстких коробок до мягких пакетов трудно воспроизвести в симуляторе. Поэтому S0, моторная кора Digit и контроллер NEO учатся в симуляции, а Helix, навыки Digit и Redwood — на телеоперации и записях.' },
  { q: 'Atlas учится трюкам по motion capture и видео людей. Значит ли это, что он учит задачам по записям людей, как Figure по Index?', o: ['Нет: эти записи учат нижний уровень двигаться, как трекеры всего тела, а задачам Atlas учат по телеоперации', 'Да: любые записи людей учат задачам', 'Да, но только задачам с ногами'], a: 0, e: 'Это разные данные. Движения людей учат тело двигаться, а видео того, как люди работают руками, учит модель задачам. Figure, Tesla, AgiBot и 1X используют для задач видео людей, Atlas и NEO — ещё и записи движений для нижнего уровня.' },
  { q: 'Если компания не публикует, как устроен нижний уровень, значит, там регулятор, написанный людьми?', o: ['Да: обученный контроллер компания бы показала', 'Нет: неизвестное остаётся неизвестным, и по видео его не определить', 'Да, иначе робот падал бы'], a: 1, e: 'В таблице урока такие ячейки помечены «не опубликовано», и в ответы миссий они не попадают. Так обстоят дела с нижним уровнем Apollo и нынешней ходьбой Optimus.' },
  { q: 'В 2025 году гуманоидов продали и отгрузили тысячи. Значит, они уже массово работают у заказчиков?', o: ['Да: раз роботов покупают, они работают', 'Нет: гуманоидов почти не покупают', 'Нет: большую часть покупают для исследований, учёбы, приёма гостей и показов, а работа на заводе или складе заказчика идёт в пилотах и первых договорах'], a: 2, e: 'Сама Unitree пишет в проспекте, что большинство гуманоидов на рынке остаются на стадии проверочных испытаний. Дальше всех продвинулся Digit, который по договору RaaS работает на складе GXO, но и он работает за ограждением.' },
];
function initQuiz() { renderQuiz('#quizBox', QUIZ, '#quizScore'); }

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('stats', initStats);
    safe('table', () => { mis.table = TabLab.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l66 = { mis, Tab, TabLab, L66, QUIZ, STACKS }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
