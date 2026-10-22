/* =====================================================================
   shared/stats-chart.js — числа из статей диаграммой. Общий модуль курса без зависимостей
   (только DOM); стили — shared/lab.css (.stat-fig, .stat-bars и .sb-*, .stat-meter и .sm-*).
   Правило курса (22.10): абзац с тремя и более числами из статьи показывается столбчатой
   диаграммой, а сам абзац сокращается до вывода.

   Подключение: в lessons/build.py в список JS урока — 'shared/stats-chart.js' перед ui-lXX.js.
   После этого доступен window.StatsChart = { bars, meter }.

   StatsChart.bars(el, spec) — столбцы по группам, число на каждом столбце:
     spec = {
       series: [{ id, label, color }],                    ряды — метрики: подпись легенды и цвет (CSS, например 'var(--classic)')
       groups: [{ label, values: { id: число | null } }], группы — условия из статьи; null — столбца нет
       max: 100, unit: '%', ticks: [0, 50, 100],          ось слева: деления по ticks, подписи с единицей
       height: 150,                                       высота области столбцов, px (не задана — из CSS, на телефоне ниже)
       digits: 0,                                         знаков после запятой у чисел
     }
   StatsChart.meter(el, spec) — одна полоса на две части (доля и остаток):
     spec = { title, label, value, rest, max: 100, unit: '%', color, digits: 0 }
   Обе функции очищают el, строят диаграмму внутри и возвращают el.

   Разметка в уроке (образец — раздел SayCan в 2.3, lessons/l23/lesson.html):
     <figure class="card stat-fig" aria-label="Диаграмма: что показано и откуда числа">
       <figcaption class="stat-h">Заголовок: что измеряли и на чём</figcaption>
       <div class="stat-grid"><div id="xBars"></div><div id="xMeter"></div></div>
       <p class="stat-cap">Все числа словами … Источник: таблицы 2 и 3 статьи.</p>
     </figure>
   Вызов (в ui-lXX.js урока):
     StatsChart.bars(document.getElementById('xBars'), {
       series: [{ id: 'plan', label: 'верный план', color: 'var(--classic)' },
                { id: 'exec', label: 'задача доведена до конца', color: 'var(--e2e)' }],
       groups: [{ label: 'макет кухни', values: { plan: 84, exec: 74 } },
                { label: 'макет, без функций ценности', values: { plan: 67, exec: null } }],
     });
     StatsChart.meter(document.getElementById('xMeter'), { title: 'Откуда ошибки', label: 'языковая модель', rest: 'функции ценности', value: 65, color: 'var(--hybrid)' });

   Правила:
   - группы столбцов — условия из статьи (макет, настоящая кухня, без модуля…), ряды — метрики;
   - число стоит на каждом столбце, ось подписана единицами, легенда появляется при двух и более рядах;
   - null в values — столбца нет (в статье не измеряли), группа и её подпись остаются;
   - все числа и источник (таблица или рисунок статьи) — в подписи под диаграммой (.stat-cap внутри figure),
     абзац после диаграммы — вывод без чисел;
   - подписи приходят из вызова и переводятся словарём урока (lXX/i18n.en.json); текста в модуле нет,
     числа форматируются по языку страницы (<html lang>);
   - тёмная тема — цвета берутся из CSS-переменных темы; телефон — столбцы ниже и у́же, .stat-grid
     в одну колонку (@media в lab.css); одна диаграмма в .stat-grid занимает всю ширину.
   ===================================================================== */
(function () {
  'use strict';
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  }
  /** Число по языку страницы: 84 → "84"; 0.5 → "0,5" по-русски и "0.5" по-английски; минус — типографский. */
  function fmt(v, d) {
    let s;
    try { s = (+v).toLocaleString(document.documentElement.lang || undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
    catch (e) { s = (+v).toFixed(d); }
    return s.replace('-', '−');
  }
  function bars(el, spec) {
    const max = spec.max || 100, unit = spec.unit == null ? '%' : spec.unit, ticks = spec.ticks || [0, 50, 100], d = spec.digits || 0;
    el.innerHTML = ''; el.classList.add('stat-bars'); if (spec.height) el.style.setProperty('--sb-h', spec.height + 'px');
    if (spec.series.length > 1) el.append(h('div', { class: 'sb-legend' }, spec.series.map((sr) => h('span', null, h('i', { style: `--c:${sr.color}` }), sr.label))));
    const plot = h('div', { class: 'sb-plot', style: `grid-template-columns: repeat(${spec.groups.length}, minmax(0, 1fr))` });
    plot.append(h('div', { class: 'sb-axis', 'aria-hidden': 'true' }, ticks.map((t) => h('span', { class: 'sb-tick' + (t ? '' : ' zero'), style: `--p:${t / max * 100}` }, h('em', null, fmt(t, d) + unit)))));
    spec.groups.forEach((g, gi) => {
      const col = h('div', { class: 'sb-bars', style: `grid-column:${gi + 1}` });
      for (const sr of spec.series) {
        const v = g.values[sr.id]; if (v == null) continue;
        col.append(h('div', { class: 'sb-bar', style: `--v:${v / max * 100};--c:${sr.color}`, title: `${g.label}: ${sr.label} ${fmt(v, d)}${unit}` }, h('b', null, fmt(v, d) + unit), h('i')));
      }
      plot.append(col, h('div', { class: 'sb-glab', style: `grid-column:${gi + 1}` }, g.label));
    });
    el.append(plot);
    return el;
  }
  function meter(el, spec) {
    const max = spec.max || 100, unit = spec.unit == null ? '%' : spec.unit, v = spec.value, d = spec.digits || 0;
    el.innerHTML = ''; el.classList.add('stat-meter');
    if (spec.title) el.append(h('div', { class: 'sm-h' }, spec.title));
    el.append(h('div', { class: 'sm-bar', style: `--v:${v / max * 100}%;--c:${spec.color}`, title: `${spec.label} ${fmt(v, d)}${unit}, ${spec.rest} ${fmt(max - v, d)}${unit}` }, h('i', { class: 'sm-fill' }), h('i', { class: 'sm-rest' })));
    el.append(h('div', { class: 'sm-labs' }, h('span', null, h('b', null, fmt(v, d) + unit), ' ', spec.label), h('span', null, h('b', null, fmt(max - v, d) + unit), ' ', spec.rest)));
    return el;
  }
  window.StatsChart = { bars, meter };
})();
