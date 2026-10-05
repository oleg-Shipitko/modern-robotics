/* =====================================================================
   ui-labs.js — Лаборатории 3 (данные) и 4 (надёжность) — для уроков 4.1 и 8.3; сортировка «Кому что доверить» (урок 0.1).
   ===================================================================== */
'use strict';

/* ======================= Лаборатория 3: данные ======================= */
const Lab3 = (() => {
  const LLM_H = 7.5e8;     // 15 трлн токенов × 0,75 слова / 250 слов в минуту
  const GEN0_H = 2.7e5;
  const ITEMS = () => [
    { name: 'Тексты для обучения Llama 3 (15 трлн токенов), если их читать', short: 'Тексты для Llama 3, если читать', hrs: LLM_H, grp: 'web', note: '≈ 86 000 лет чтения без сна' },
    { name: 'Видео, загруженные на YouTube за один год', short: 'YouTube: видео за год', hrs: 500 * 60 * 24 * 365, grp: 'web', note: 'около 500 часов каждую минуту, но без действий робота' },
    { name: 'GEN-0, Generalist AI (ноябрь 2025)', short: 'GEN-0 (2025)', hrs: GEN0_H, grp: 'robot', note: 'реальные данные манипуляции; компания сообщает о +10 000 ч в неделю' },
    { name: 'π0, Physical Intelligence (2024)', short: 'π0 (2024)', hrs: 1e4, grp: 'robot', note: 'собственный датасет: 7 конфигураций роботов, 68 задач' },
    { name: 'Ego4D — видео людей от первого лица (2022)', short: 'Ego4D: видео людей (2022)', hrs: 3670, grp: 'web', note: 'руки людей, а не роботов: нет команд моторам' },
    { name: 'DROID — телеоперация (2024)', short: 'DROID (2024)', hrs: 350, grp: 'robot', note: '76 тыс. траекторий в 564 сценах' },
    { name: `Твои демонстрации из лаборатории 2 (${App.models.N} × 30 с)`, short: `Твои демонстрации (${App.models.N} × 30 с)`, hrs: (App.models.N * 30) / 3600, grp: 'you', note: 'если бы они были настоящими' },
    { name: 'ALOHA / ACT — одна задача (2023)', short: 'ALOHA / ACT: одна задача', hrs: 10 / 60, grp: 'robot', note: 'около 10 минут демонстраций на навык' },
  ].sort((a, b) => b.hrs - a.hrs);
  let scale = 'log', target = 'gen0';

  function fmtHours(x) {
    if (x >= 1e9) return (x / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млрд ч';
    if (x >= 1e6) return Math.round(x / 1e6).toLocaleString('ru-RU') + ' млн ч';
    if (x >= 1e3) return Math.round(x / 1e3).toLocaleString('ru-RU') + ' тыс. ч';
    if (x >= 1) return Math.round(x).toLocaleString('ru-RU') + ' ч';
    return Math.round(x * 60) + ' мин';
  }
  function fmtSpan(years) {
    if (years >= 2) return { v: fmtInt(years), u: plural(Math.round(years), 'год', 'года', 'лет') };
    if (years >= 1 / 12 * 2) return { v: fmtInt(years * 12), u: plural(Math.round(years * 12), 'месяц', 'месяца', 'месяцев') };
    const d = Math.max(1, years * 365);
    if (d >= 1) return { v: fmtInt(d), u: plural(Math.round(d), 'день', 'дня', 'дней') };
    return { v: '<1', u: 'дня' };
  }

  function renderChart() {
    const svg = $('#gapChart');
    Chart.clear(svg);
    const items = ITEMS();
    const W = Chart.width(svg, 300, 700), narrow = W < 520;
    const box = { l: 8, r: W - (narrow ? 78 : 100), t: 16 };
    const rowH = 44;
    box.b = box.t + items.length * rowH;
    svg.setAttribute('viewBox', `0 0 ${W} ${box.b + 46}`);
    let x, ticks;
    if (scale === 'log') {
      x = Chart.scaleLog(0.1, 1e9, box.l, box.r);
      ticks = (narrow ? [0.1, 1e3, 1e6, 1e9] : [0.1, 10, 1e3, 1e5, 1e7, 1e9]).map((v) => ({ v, label: v < 1 ? '6 мин' : fmtHours(v).replace(' ч', '') }));
    } else {
      x = Chart.scaleLinear(0, 8e8, box.l, box.r);
      ticks = (narrow ? [0, 4e8, 8e8] : [0, 2e8, 4e8, 6e8, 8e8]).map((v) => ({ v, label: v ? (v / 1e6) + ' млн' : '0' }));
    }
    const grid = s('g', { class: 'grid' });
    ticks.forEach((t) => grid.append(s('line', { x1: x(t.v), x2: x(t.v), y1: box.t, y2: box.b })));
    svg.append(grid);
    ticks.forEach((t) => svg.append(s('text', { x: x(t.v), y: box.b + 18, 'text-anchor': 'middle' }, t.label)));
    svg.append(s('text', { x: (box.l + box.r) / 2, y: box.b + 38, 'text-anchor': 'middle', class: 'ttl' }, scale === 'log' ? (narrow ? 'часы опыта, логарифмическая шкала' : 'часы опыта, логарифмическая шкала: каждая линия сетки — ×100') : 'часы опыта, линейная шкала'));
    const colors = { web: cssVar('--muted'), robot: cssVar('--ink'), you: cssVar('--e2e') };
    items.forEach((it, i) => {
      const y0 = box.t + i * rowH;
      const x0 = scale === 'log' ? x(0.1) : x(0);
      const w = Math.max(scale === 'log' ? 3 : 0.6, x(Math.max(it.hrs, scale === 'log' ? 0.1 : 0)) - x0);
      svg.append(s('text', { x: box.l, y: y0 + 13, class: 'lbl' }, narrow ? it.short : it.name));
      const bar = s('rect', { x: x0, y: y0 + 20, width: w, height: 14, rx: 4, fill: colors[it.grp] });
      svg.append(bar);
      svg.append(s('text', { x: x0 + w + 8, y: y0 + 31, class: 'lbl', style: 'font-weight:700;fill:var(--ink)' }, fmtHours(it.hrs)));
      const hit = s('rect', { x: box.l, y: y0, width: W - box.l, height: rowH - 2, fill: 'transparent', tabindex: 0, 'aria-label': `${it.name}: ${fmtHours(it.hrs)}` });
      const tip = (e) => Tip.show(`<b>${fmtHours(it.hrs)}</b> ≈ ${(it.hrs / 8760).toLocaleString('ru-RU', { maximumFractionDigits: it.hrs > 8760 * 10 ? 0 : 2 })} лет непрерывно<br>${escapeHtml(it.name)}<br><span style="color:var(--ink-3)">${escapeHtml(it.note)}</span>`, e.clientX, e.clientY);
      hit.addEventListener('pointermove', tip);
      hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); tip({ clientX: b.left + 200, clientY: b.top }); });
      hit.addEventListener('pointerleave', () => Tip.hide()); hit.addEventListener('blur', () => Tip.hide());
      svg.append(hit);
    });
    // таблица
    const t = h('table', { class: 'res-table' }, h('tr', null, h('th', null, 'Источник'), h('th', null, 'Часы'), h('th', null, 'Комментарий')));
    items.forEach((it) => t.append(h('tr', null, h('td', null, it.name), h('td', { class: 'num' }, fmtHours(it.hrs)), h('td', null, it.note))));
    $('#gapTable').innerHTML = ''; $('#gapTable').append(t);
    $('#gapNote').textContent = scale === 'log'
      ? 'Переключи шкалу на линейную и посмотри, что останется от данных роботов.'
      : 'На линейной шкале данные роботов неотличимы от нуля. Даже 270 тысяч часов GEN-0 — тонкая черта рядом с текстами.';
  }

  function renderCalc() {
    const fr = $('#fleetRange'), hr = $('#hoursRange');
    setRangeFill(fr); setRangeFill(hr);
    const raw = Math.pow(10, +fr.value);
    const fleet = raw < 10 ? Math.round(raw) : raw < 100 ? Math.round(raw / 5) * 5 : raw < 1000 ? Math.round(raw / 10) * 10 : Math.round(raw / 100) * 100;
    const hours = +hr.value;
    $('#fleetOut').textContent = fmtInt(fleet);
    $('#hoursOut').textContent = String(hours);
    const goal = target === 'gen0' ? GEN0_H : LLM_H;
    const years = goal / (fleet * hours * 365);
    const sp = fmtSpan(years);
    $('#yearsOut').innerHTML = `${sp.v}<small>${sp.u}</small>`;
    const goalTxt = target === 'gen0' ? 'объём данных GEN-0 (270 тыс. часов)' : 'объём текстов, на которых учатся LLM (≈ 750 млн часов чтения)';
    $('#yearsText').textContent = `Столько понадобится ${fmtInt(fleet)} ${plural(fleet, 'роботу', 'роботам', 'роботам')} по ${hours} ${plural(hours, 'часу', 'часа', 'часов')} в день, чтобы набрать ${goalTxt}. ${target === 'text' ? 'Главный рычаг — размер парка: поэтому так ценны роботы, которые уже работают и собирают данные.' : 'Для сравнения, Generalist AI сообщает о 10 000 новых часов в неделю.'}`;
  }

  function init() {
    $$('#gapScale button').forEach((b) => b.addEventListener('click', () => {
      scale = b.dataset.s;
      $$('#gapScale button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      renderChart();
    }));
    $$('#gapTarget button').forEach((b) => b.addEventListener('click', () => {
      target = b.dataset.t;
      $$('#gapTarget button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      renderCalc();
    }));
    $('#gapTableBtn').addEventListener('click', () => { const t = $('#gapTable'); t.hidden = !t.hidden; $('#gapTableBtn').textContent = t.hidden ? 'Таблица' : 'Скрыть таблицу'; });
    $('#fleetRange').addEventListener('input', renderCalc);
    $('#hoursRange').addEventListener('input', renderCalc);
    App.on('models', renderChart);
    App.on('theme', renderChart);
    App.on('resize', renderChart);
    renderChart(); renderCalc();
  }
  return { init };
})();

/* ======================= Лаборатория 4: надёжность ======================= */
const Lab4 = (() => {
  const PS = [0.8, 0.9, 0.95, 0.99, 0.995, 0.999, 0.9999];
  const RETRIES = 2;
  const pEff = (p, d) => { let s = 0, q = (1 - p) * d; for (let i = 0; i <= RETRIES; i++) s += Math.pow(q, i); return p * s; };
  const pctTxt = (p) => (p * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '%';

  function fillOrders(box, n) {
    box.innerHTML = '';
    for (let i = 0; i < n; i++) box.append(h('i'));
  }
  let guessRuns = 0;
  function guess() {
    const btn = $('#guessBtn');
    btn.disabled = true;
    const box = $('#ordersGuess');
    fillOrders(box, 100);
    const rng = new RC.Rng(2026 + 977 * guessRuns++);
    const dots = $$('i', box);
    let ok = 0, i = 0;
    const p8 = Math.pow(0.95, 8);
    const tick = () => {
      for (let k = 0; k < 4 && i < 100; k++, i++) {
        let good = true;
        for (let st = 0; st < 8; st++) if (rng.next() > 0.95) good = false;
        if (good) ok++;
        dots[i].className = good ? 'ok' : 'bad';
      }
      if (i < 100) requestAnimationFrame(tick);
      else {
        const g = +$('#guessRange').value;
        const r = $('#guessReveal');
        r.innerHTML = `<div class="hero-num">${ok}<small>из 100 латте без ошибок</small></div><p style="margin:10px 0 0;color:var(--ink-2);font-size:16px">По формуле: 0,95⁸ ≈ ${Math.round(p8 * 100)}%. Твой прогноз: ${g}%. ${g > 75 ? 'Интуиция подсказывает, что «95% — это почти всегда», но ошибки складываются по всей цепочке.' : 'Отличная интуиция: ошибки действительно складываются по всей цепочке.'} В среднем каждый третий заказ испорчен, хотя каждый шаг «почти идеален». Нажми ещё раз — случайность даст другой результат, но около двух третей.</p>`;
        r.hidden = false;
        btn.disabled = false; btn.textContent = 'Ещё 100 заказов';
      }
    };
    tick();
  }

  function render() {
    const pR = $('#pRange'), nR = $('#nRange'), dR = $('#dRange');
    [pR, nR, dR].forEach(setRangeFill);
    const p = PS[+pR.value], n = +nR.value, d = +dR.value / 100;
    $('#pOut').textContent = pctTxt(p); $('#nOut').textContent = String(n); $('#dOut').textContent = Math.round(d * 100) + '%';
    const pe = pEff(p, d);
    const succ = Math.pow(pe, n);
    $('#kSucc').textContent = fmtPct(succ, succ > 0.99 ? 2 : 0);
    $('#kEff').textContent = pctTxt(pe);
    $('#kFail').textContent = fmtInt(300 * (1 - succ));
    drawChart(p, pe, n, d);
    const lines = [];
    lines.push(`<p><strong>Сейчас:</strong> ${pctTxt(p)} на шаг и ${n} ${plural(n, 'шаг', 'шага', 'шагов')} — задача целиком удаётся в ${fmtPct(succ, succ > 0.99 ? 2 : 0)} случаев${d > 0 ? ` (с повторами; без них было бы ${fmtPct(Math.pow(p, n), 0)})` : ''}.</p>`);
    lines.push('<p>99% на шаг при 100 шагах дают лишь 37% успеха. Поэтому удачное видео ничего не говорит о продукте: важна статистика сотен запусков. Чтобы при 300 заказах в день было не больше одного испорченного латте, каждый из восьми шагов должен удаваться в 99,96% случаев.</p>');
    lines.push('<p><strong>Громкий отказ лучше тихого.</strong> Замеченную ошибку можно исправить повтором: если робот замечает 90% своих ошибок и повторяет шаг до двух раз, надёжность шага 95% превращается почти в 99,5%. Двигай третий ползунок. Тихие отказы, как у нейросети с бирюзовой чашкой, так не исправишь: робот не знает, что ошибся.</p>');
    $('#relInsightText').innerHTML = lines.join('');
  }
  function drawChart(p, pe, n, d) {
    const svg = $('#relChart');
    Chart.clear(svg);
    const W = Chart.width(svg, 280, 520);
    svg.setAttribute('viewBox', `0 0 ${W} 220`);
    const box = { l: 46, r: W - 15, t: 14, b: 180 };
    const x = Chart.scaleLinear(1, 100, box.l, box.r), y = Chart.scaleLinear(0, 1, box.b, box.t);
    Chart.frame(svg, box, x, y, [1, 25, 50, 75, 100].map((v) => ({ v, label: String(v) })), [0, 0.5, 1].map((v) => ({ v, label: fmtPct(v) })), { xTitle: 'шагов в задаче' });
    const base = [], rec = [];
    for (let k = 1; k <= 100; k++) { base.push([k, Math.pow(p, k)]); rec.push([k, Math.pow(pe, k)]); }
    const cb = cssVar('--ink-3'), cr = cssVar('--classic');
    svg.append(s('path', { d: Chart.path(base, x, y), fill: 'none', stroke: cb, 'stroke-width': 2 }));
    if (d > 0) svg.append(s('path', { d: Chart.path(rec, x, y), fill: 'none', stroke: cr, 'stroke-width': 2 }));
    svg.append(s('line', { x1: x(n), x2: x(n), y1: box.t, y2: box.b, stroke: cssVar('--axis'), 'stroke-width': 1 }));
    const cy = y(Math.pow(d > 0 ? pe : p, n));
    svg.append(s('circle', { cx: x(n), cy, r: 5, fill: d > 0 ? cr : cb, stroke: cssVar('--surface'), 'stroke-width': 2 }));
    // crosshair + подсказка
    const hit = s('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t, fill: 'transparent' });
    const guide = s('line', { y1: box.t, y2: box.b, stroke: cssVar('--axis'), 'stroke-width': 1, visibility: 'hidden' });
    svg.append(guide, hit);
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const k = Math.max(1, Math.min(100, Math.round(x.inv(px))));
      guide.setAttribute('x1', x(k)); guide.setAttribute('x2', x(k)); guide.setAttribute('visibility', 'visible');
      Tip.show(`<b>${k} ${plural(k, 'шаг', 'шага', 'шагов')}</b><br><span class="key" style="background:${cb}"></span>без повторов: ${fmtPct(Math.pow(p, k), 1)}${d > 0 ? `<br><span class="key" style="background:${cr}"></span>с повторами: ${fmtPct(Math.pow(pe, k), 1)}` : ''}`, e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', () => { guide.setAttribute('visibility', 'hidden'); Tip.hide(); });
    const lg = $('#relLegend');
    lg.innerHTML = '';
    lg.append(h('span', null, h('i', { class: 'line', style: `background:${cb}` }), 'без повторов'));
    if (d > 0) lg.append(h('span', null, h('i', { class: 'line', style: `background:${cr}` }), 'робот замечает ошибки и повторяет шаг'));
  }
  function init() {
    fillOrders($('#ordersGuess'), 100);
    const gR = $('#guessRange');
    setRangeFill(gR);
    gR.addEventListener('input', () => { $('#guessOut').textContent = gR.value + '%'; setRangeFill(gR); });
    $('#guessBtn').addEventListener('click', guess);
    ['#pRange', '#nRange', '#dRange'].forEach((id) => $(id).addEventListener('input', render));
    App.on('theme', render);
    App.on('resize', render);
    render();
  }
  return { init };
})();

/* ======================= Кому что доверить: дом Ады ======================= */
const Lab5 = (() => {
  const CARDS = [
    { id: 'ask', emo: '🗣️', t: 'Понять просьбу: «принеси что-нибудь попить, только не холодное»', a: 'nn', ok: ['hybrid'], why: 'Язык бесконечно разнообразен: синонимы, оговорки, контекст. Разбор по ключевым словам перестанет работать на первой нестандартной фразе, языковые модели с этим справляются. Как политики понимают язык — часть 2.' },
    { id: 'find', emo: '🔍', t: 'Найти на столе свою кружку среди чужих', a: 'nn', ok: ['hybrid'], why: 'Восприятие в открытом мире — сильная сторона нейросетей. Кружки разной формы и цвета, при любом свете: правилами это не описать, лаборатория 1 это показала.' },
    { id: 'towel', emo: '🧺', t: 'Сложить полотенце', a: 'nn', ok: [], why: 'Ткань деформируется непредсказуемо, классический планировщик её почти не моделирует. Так π0 и научился складывать бельё — на тысячах часов демонстраций.' },
    { id: 'toys', emo: '🧸', t: 'Собрать разбросанные игрушки', a: 'nn', ok: ['hybrid'], why: 'Беспорядок бесконечно разнообразен. Типичная задача для обучаемой политики.' },
    { id: 'drawer', emo: '🗄️', t: 'Открыть незнакомый ящик', a: 'nn', ok: ['hybrid'], why: 'Ручки, защёлки, направляющие — вариантов тысячи. Политика, обученная на многих ящиках, обобщает на новый, а правило пришлось бы писать под каждый.' },
    { id: 'pour', emo: '💧', t: 'Налить воду в стакан и не пролить', a: 'nn', ok: ['hybrid'], why: 'Жидкость трудно моделировать, а по демонстрациям политика учится лить плавно. Уровень воды можно контролировать отдельным датчиком — тогда это уже нейросеть со страховкой.' },
    { id: 'cat', emo: '🐈', t: 'Не наехать на кошку', a: 'hybrid', ok: [], why: 'Нейросеть замечает кошку в любой позе и при любом свете. А остановку перед ней лучше задать правилом с гарантией: «препятствие ближе 30 см — стоп».' },
    { id: 'child', emo: '🧒', t: 'Сбавить скорость, когда рядом ребёнок', a: 'hybrid', ok: [], why: 'Кто перед камерой, понимает нейросеть. Сколько можно разгоняться рядом с человеком, задаёт правило: это требование безопасности, а не статистика.' },
    { id: 'cupforce', emo: '🥤', t: 'Не раздавить пластиковый стаканчик', a: 'classic', ok: ['hybrid'], why: 'Управление усилием по датчику: замкнутый контур на сотнях герц и понятная физика. Если нейросеть подсказывает, насколько хрупок предмет, это уже нейросеть со страховкой.' },
    { id: 'dock', emo: '🔌', t: 'Доехать до зарядки по известной карте', a: 'classic', ok: ['hybrid'], why: 'Квартира не меняется каждый день: карта, локализация и планировщик решают задачу надёжно и без данных. Нейросети здесь помогают с незнакомыми препятствиями.' },
    { id: 'estop', emo: '🖐️', t: 'Остановиться по аварийной кнопке', a: 'classic', ok: [], why: 'Детерминированная логика и отдельная цепь питания. Здесь не место вероятностям.' },
    { id: 'plants', emo: '🗓️', t: 'Помнить, что по вторникам поливаем цветы', a: 'classic', ok: [], why: 'Ловушка: это не робототехника, а обычная программа. Не всё в роботе нужно учить.' },
  ];
  const BIN_NAMES = { nn: 'Нейросеть', hybrid: 'Нейросеть со страховкой', classic: 'Правила' };
  let place = {}; // id → 'pool' | bin
  let selected = null;
  let checked = false;

  function cardEl(c) {
    const el = h('button', { type: 'button', class: 'task', draggable: 'true', 'data-id': c.id }, h('span', { class: 'emo', 'aria-hidden': 'true' }, c.emo), h('span', null, c.t));
    el.addEventListener('click', (e) => { e.stopPropagation(); if (checked) return; selected = selected === c.id ? null : c.id; render(); });
    el.addEventListener('dragstart', (e) => { if (checked) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; selected = c.id; });
    return el;
  }
  function render() {
    const pool = $('#pool');
    pool.innerHTML = '';
    $$('.bin .bin-body').forEach((b) => (b.innerHTML = ''));
    CARDS.forEach((c) => {
      const el = cardEl(c);
      if (selected === c.id) el.classList.add('sel');
      if (checked) {
        const where = place[c.id];
        el.classList.add(where === c.a ? 'right' : c.ok.includes(where) ? 'partial' : 'wrong');
      }
      if (place[c.id] === 'pool') pool.append(el);
      else $(`.bin[data-bin="${place[c.id]}"] .bin-body`).append(el);
    });
    $$('.bin').forEach((b) => b.classList.toggle('target', !!selected && !checked));
  }
  function moveTo(id, bin) { if (checked || !id) return; place[id] = bin; selected = null; render(); }
  function check(reveal) {
    if (reveal) CARDS.forEach((c) => { place[c.id] = c.a; });
    if (!reveal && CARDS.some((c) => place[c.id] === 'pool')) {
      $('#sortScore').textContent = 'Сначала разложи все карточки.';
      return;
    }
    checked = true; selected = null;
    render();
    let score = 0;
    CARDS.forEach((c) => { score += place[c.id] === c.a ? 1 : c.ok.includes(place[c.id]) ? 0.5 : 0; });
    $('#sortScore').textContent = reveal ? 'Ответы экспертов показаны.' : `Результат: ${score.toLocaleString('ru-RU')} из ${CARDS.length}`;
    const fb = $('#sortFeedback');
    fb.innerHTML = '';
    const counts = { nn: 0, hybrid: 0, classic: 0 };
    CARDS.forEach((c) => counts[c.a]++);
    fb.append(h('div', { class: 'callout insight', style: 'margin:4px 0' }, h('span', { class: 'ico' }, '💡'), h('div', { html: `<p><strong>Закономерность.</strong> Язык, восприятие открытого мира, деформируемые предметы и жидкости уходят нейросетям. Точность, частота и безопасность остаются за правилами. У экспертов ${counts.nn} из ${CARDS.length} задач отданы нейросети, ${counts.hybrid} — нейросети со страховкой и ${counts.classic} — правилам. Нейросеть берёт то, что правилами не описать, а там, где нужна гарантия, остаются правила. А как делят работу настоящие роботы?</p>` })));
    CARDS.forEach((c) => {
      const where = place[c.id];
      const res = where === c.a ? 'right' : c.ok.includes(where) ? 'partial' : 'wrong';
      const mark = res === 'right' ? '✅' : res === 'partial' ? '🟡' : '❌';
      const ans = `Эксперт: ${BIN_NAMES[c.a]}${c.ok.length ? ` (допустимо: ${c.ok.map((x) => BIN_NAMES[x].toLowerCase()).join(', ')})` : ''}${!reveal ? ` · твой ответ: ${BIN_NAMES[where]}` : ''}`;
      fb.append(h('div', { class: 'fb-item' }, h('span', { class: 'mark' }, reveal ? c.emo : mark), h('div', null, h('div', null, h('strong', null, c.t)), h('div', { class: 'ans muted' }, ans), h('p', null, c.why))));
    });
  }
  function reset() {
    checked = false; selected = null;
    CARDS.forEach((c) => { place[c.id] = 'pool'; });
    $('#sortFeedback').innerHTML = ''; $('#sortScore').textContent = '';
    render();
  }
  function init() {
    // перемешанный, но фиксированный порядок
    const order = [6, 2, 0, 9, 4, 11, 1, 7, 3, 10, 5, 8];
    const shuffled = order.map((i) => CARDS[i]);
    CARDS.length = 0; shuffled.forEach((c) => CARDS.push(c));
    reset();
    $$('.bin').forEach((b) => {
      b.addEventListener('click', () => moveTo(selected, b.dataset.bin));
      b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('over'); });
      b.addEventListener('dragleave', () => b.classList.remove('over'));
      b.addEventListener('drop', (e) => { e.preventDefault(); b.classList.remove('over'); moveTo(e.dataTransfer.getData('text/plain'), b.dataset.bin); });
    });
    const pool = $('#pool');
    pool.addEventListener('click', () => { if (selected) moveTo(selected, 'pool'); });
    pool.addEventListener('dragover', (e) => e.preventDefault());
    pool.addEventListener('drop', (e) => { e.preventDefault(); moveTo(e.dataTransfer.getData('text/plain'), 'pool'); });
    $('#sortCheck').addEventListener('click', () => check(false));
    $('#sortReset').addEventListener('click', reset);
    $('#sortReveal').addEventListener('click', () => check(true));
  }
  return { init };
})();
