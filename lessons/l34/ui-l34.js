/* =====================================================================
   ui-l34.js — урок 3.4 «Open X-Embodiment». Интерактивы:
   1) Общий формат: карточки записей роботов раскладываются по корзинам
      «как есть», «пересчитать», «отбросить», «не выравнивается» (shared/cards.js);
   2) Таблицы I и II статьи: ставка → открыть числа, наведение на ячейки,
      выбор строк по заданию (миссии на таблице);
   3) Смесь данных: четыре робота на столе из 2.1 со своими камерами и
      единицами, политики на своих данных и одна на смеси, сравнение рядом,
      ось робота D, веса смеси ползунками. Обучение — в браузере кусками.
   Движок — l34/engine.js (без DOM), мир стола — l21/engine.js.
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pct = (v) => Math.round(v * 100) + '%';
const pp = (d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(Math.round(d * 100)) + ' п.п.';
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Прогнать генератор обучения кусками между кадрами, чтобы страница не замирала. */
async function runGen(gen, perFrame, onEv) {
  for (;;) {
    let r; for (let i = 0; i < (perFrame || 1); i++) { r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); }
    await nextFrame();
  }
}

/* =====================================================================
   1. Общий формат: карточки записей по корзинам
   ===================================================================== */
const FmtSort = (() => {
  const ZONES = [
    { id: 'vec', label: 'В общий вектор как есть', note: 'после нормировки по датасету' },
    { id: 'conv', label: 'Пересчитать в общий формат', note: 'другая величина или шкала' },
    { id: 'drop', label: 'Отбросить', note: 'в модель не попадает' },
    { id: 'keep', label: 'Остаётся невыровненным', note: 'модель узнаёт это только по картинке' },
  ];
  const ITEMS = [
    { id: 'dpos', label: 'Изменение положения захвата по x, y, z, 3 Гц', target: 'vec', why: 'Три из семи компонент общего вектора: положение захвата или его изменение входит после нормировки по статистике датасета.' },
    { id: 'vel', label: 'Скорость захвата по трём осям, 10 Гц', target: 'vec', why: 'Формат допускает «либо эти величины, либо их скорости»: скорости тоже занимают компоненты x, y, z после нормировки.' },
    { id: 'rotd', label: 'Изменение углов поворота захвата', target: 'vec', why: 'Поворот — ещё три компоненты вектора: roll, pitch, yaw или их скорости.' },
    { id: 'grip', label: 'Раскрытие захвата от 0 до 1', target: 'vec', why: 'Седьмая компонента — раскрытие захвата.' },
    { id: 'grip0', label: 'Захват: 1 — закрыт, 0 — открыт', target: 'conv', why: 'Шкалу нужно перевернуть, чтобы «раскрытие» значило одно и то же у всех роботов: это часть перевода родного действия в семь компонент.' },
    { id: 'joints', label: 'Команда в углах семи суставов', target: 'conv', why: 'Общий вектор описывает движение захвата, а не суставов: родное действие переводят в движение захвата.' },
    { id: 'res', label: 'Кадр камеры 640 × 480', target: 'conv', why: 'Кадр канонической камеры приводят к общему разрешению.' },
    { id: 'cam2', label: 'Вторая камера на запястье', target: 'drop', why: 'Из каждого датасета берут одну каноническую камеру; остальные в модель не идут.' },
    { id: 'depth', label: 'Карта глубины и облако точек', target: 'drop', why: 'RLDS их хранит, но модель получает только RGB-кадр и текст команды.' },
    { id: 'frame', label: 'Куда направлена ось x в базе робота', target: 'keep', why: 'Системы координат по датасетам не совмещают: один и тот же вектор может означать разные движения.' },
    { id: 'absrel', label: 'Абсолютная поза или приращение к текущей', target: 'keep', why: 'Значения оставляют такими, какими их записал контроллер робота: абсолютными, относительными или скоростями.' },
    { id: 'hz', label: 'Частота управления 3, 5 или 10 Гц', target: 'keep', why: 'В вектор частота не входит; на роботе модель просто запускают с нужной ему частотой.' },
    { id: 'campose', label: 'Камера над столом или сбоку от робота', target: 'keep', why: 'Положение и оптика камер остаются разными, и кадры в смеси выглядят по-разному.' },
  ];
  let ctl = null, lastScore = null;
  function init() {
    ctl = Cards.sort('#fmtSort', { items: ITEMS, targets: ZONES, after: 'Колонка «как есть» — это и есть 7-мерный вектор; «пересчитать» — работа при конвертации датасета; «отбросить» — цена одной камеры и одного кадра; «остаётся невыровненным» — то, о чём модель должна догадаться сама по картинке, и источник фразы авторов «один и тот же вектор действия может вызвать очень разные движения».', onCheck: (s) => { lastScore = s; } });
    return ctl;
  }
  return { init, ITEMS, ZONES, get ctl() { return ctl; }, get score() { return lastScore; } };
})();

/* =====================================================================
   2. Таблицы статьи: ставка → открыть числа, наведение, выбор строк
   ===================================================================== */
const LabTables = (() => {
  const E = L34, T1 = E.TABLE1, T2 = E.TABLE2;
  const st = { tab: 't1', open: { t1: false, t2: false }, sel: { t1: null, t2: null } };
  let ctl = null;
  const TIP1 = [
    ['LCBC — метод авторов Bridge, обучен только на Bridge', 'RT-1 только на Bridge: та же сеть, что у RT-1-X, но один датасет', 'Та же сеть на 35 млн параметров, но на смеси 9 роботов: недообучение', 'RT-2-X на 55 млрд параметров вмещает смесь: лучше и LCBC, и RT-1'],
    ['LCBC в другой лаборатории: та же модель, другой WidowX и обстановка', 'RT-1 только на Bridge, оценка в RAIL', 'RT-1-X в RAIL: ниже RT-1, как и в IRIS', 'RT-2-X в RAIL: вровень с RT-1'],
    ['Для данных RT-1 метод авторов и есть RT-1', 'RT-1 на своих 130 тысячах эпизодов', 'RT-1-X: с данными 8 чужих роботов хуже на 19 п.п.', 'RT-2-X: на 1 п.п. ниже RT-1 — почти без потерь'],
  ];
  const TIP2 = ['Исходный RT-2 только на данных Google Robot: опора для сравнения', 'Та же модель на всей смеси: умений из Bridge стало втрое больше, обобщение прежнее', 'Убрали Bridge — успех на этих умениях упал почти вдвое: они пришли с WidowX', 'Малая модель 5B с историей из 2 кадров: переносит меньше, чем 55B', 'Та же 5B без истории: обобщение падает с 52% до 30%', 'Без веб-предобучения, с нуля: модель не работает совсем', 'Только дообучение на роботах, без веб-данных в пакете: почти как совместное дообучение'];
  function cell(txt, cls, tip) { const td = h('td', { class: cls || null, 'data-tip': tip || null }, txt); return td; }
  function render() {
    const box = $('#tBox'); box.innerHTML = '';
    const open = st.open[st.tab], tbl = h('table', { class: 'ptable' }), thead = h('thead'), tbody = h('tbody');
    if (st.tab === 't1') {
      thead.append(h('tr', null, h('th', null, 'Оценка'), h('th', { class: 'col-place' }, 'Место'), h('th', null, 'Робот'), ...T1.cols.map((c) => h('th', null, c))));
      T1.rows.forEach((r, i) => {
        const tr = h('tr', { class: st.sel.t1 === i ? 'sel' : null, 'data-row': i });
        tr.append(cell(r.eval, 'rowhead wide'), cell(r.place, 'dim col-place'), cell(r.robot, 'dim'));
        r.v.forEach((v, j) => {
          const hidden = !open && j >= 2;
          const cls = hidden ? 'hid' : 'num' + (!hidden && j >= 1 && v !== '—' ? (parseInt(v) === Math.max(...r.v.slice(1).map((x) => parseInt(x) || 0)) ? ' best' : j === 2 && parseInt(v) < parseInt(r.v[1]) ? ' worst' : '') : '');
          tr.append(cell(hidden ? '?' : (j === 0 && r.orig ? r.orig + ' ' + v : v), cls + (hidden ? '' : ' cell-hint'), hidden ? null : TIP1[i][j]));
        });
        tr.addEventListener('click', () => select(i)); tbody.append(tr);
      });
      setOut($('#tNote'), 'Таблица I статьи. Строки — где и на каком роботе проверяли, столбцы — модели, в ячейках — доля успешных попыток. Original Method — модель авторов датасета, обученная только на нём. Зелёным — лучший результат среди RT-1, RT-1-X и RT-2-X в строке, красным — RT-1-X ниже RT-1.' + (open ? '' : ' Столбцы RT-1-X и RT-2-X откроются по кнопке в миссии.') + '<span class="scroll-hint"> Таблица прокручивается вбок.</span>');
    } else {
      thead.append(h('tr', null, h('th', null, '№'), ...T2.cols.map((c) => h('th', null, c))));
      T2.rows.forEach((r, i) => {
        const tr = h('tr', { class: st.sel.t2 === i ? 'sel' : null, 'data-row': i, 'data-tip': TIP2[i] });
        const web = r.web === 'да' ? 'совместно с роботами' : r.init === 'с нуля' ? 'нет, с нуля' : 'только предобучение';
        tr.append(cell(String(r.n), 'dim'), cell(`${r.model} ${r.size}`, 'rowhead'), cell(r.hist), cell(r.data), cell(web, r.web === 'да' ? 'wrap' : 'dim wrap'));
        const em = open ? fmt(r.em, 1) + '%' : '?', gen = open ? fmt(r.gen, 0) + '%' : '?';
        tr.append(cell(em, open ? 'num' + (r.em === 75.8 ? ' best' : r.em === 0 ? ' worst' : '') : 'hid'), cell(gen, open ? 'num' + (r.gen === 62 ? ' best' : r.gen === 1 ? ' worst' : '') : 'hid'));
        tr.addEventListener('click', () => select(i)); tbody.append(tr);
      });
      setOut($('#tNote'), 'Таблица II статьи: абляции RT-2-X, в ячейках двух последних колонок — доля успешных попыток. «История» — сколько кадров видит модель. «Веб-данные»: «совместно с роботами» — дообучение на смеси веб-данных и данных роботов, «только предобучение» — веб-данные были только до дообучения, «нет, с нуля» — модель без веб-предобучения. «Умения из Bridge» — задачи из датасета Bridge (робот WidowX), проверенные на Google Robot; в статье — «возникающие умения». «Обобщение RT-2» — новые предметы, фоны и окружения по протоколу RT-2. Зелёным — лучшее в колонке, красным — худшее.' + (open ? '' : ' Две последние колонки откроются по кнопке в миссии.') + '<span class="scroll-hint"> Таблица прокручивается вбок.</span>');
    }
    tbl.append(thead, tbody); box.append(tbl);
    out();
  }
  function out() {
    const i = st.sel[st.tab];
    if (i == null) { setOut($('#tOut'), st.open[st.tab] ? 'Нажми на строку, чтобы прочитать, что в ней видно. Наведи на ячейку — подсказка.' : 'Числа RT-X закрыты до ставки.'); return; }
    if (st.tab === 't1') { const r = T1.rows[i]; setOut($('#tOut'), `<b>${r.eval}</b>, ${r.robot} в ${r.place}: ${TIP1[i][2]}; ${/^[A-ZА-ЯЁ][a-zа-яё]/.test(TIP1[i][3]) ? TIP1[i][3].charAt(0).toLowerCase() + TIP1[i][3].slice(1) : TIP1[i][3]}.`); }
    else { const r = T2.rows[i]; setOut($('#tOut'), `<b>Строка ${r.n}</b> — ${r.model} ${r.size}, история: ${r.hist}, данные: ${r.data}. ${TIP2[i]}.`); }
  }
  function select(i) { st.sel[st.tab] = i; render(); if (ctl) ctl.update(); }
  function setTab(v) { st.tab = v; segSet('#tSel', v); render(); if (ctl) ctl.update(); }
  async function open(tab) {
    setTab(tab); st.open[tab] = true; render();
    const rows = $$('#tBox tbody tr'); for (const tr of rows) { tr.style.opacity = '0.25'; } await wait(80);
    for (const tr of rows) { tr.style.transition = 'opacity .35s'; tr.style.opacity = '1'; await wait(140); }
    if (ctl) ctl.update();
    return state();
  }
  function state() {
    const num = (s) => parseInt(s) || 0;
    return { tab: st.tab, open1: st.open.t1, open2: st.open.t2, sel: st.sel[st.tab], rt1: T1.rows.map((r) => num(r.v[1])), rt1x: T1.rows.map((r) => num(r.v[2])), rt2x: T1.rows.map((r) => num(r.v[3])), em: T2.rows.map((r) => r.em), gen: T2.rows.map((r) => r.gen) };
  }
  const api = { reset() { st.open = { t1: false, t2: false }; st.sel = { t1: null, t2: null }; setTab('t1'); }, state, setTab, open, select };
  const missions = [
    { short: 'Большие датасеты', title: 'Смесь против своих данных там, где данных много', text: 'Таблица I: Bridge на WidowX в двух лабораториях и шесть навыков из статьи RT-1 на Google Robot. У этих датасетов десятки и сотни тысяч эпизодов. RT-1-X обучен на них и ещё на данных семи чужих роботов, RT-1 — только на своём датасете.',
      onEnter: (X) => X.setTab('t1'),
      bet: { q: 'RT-1-X на этих данных — лучше или хуже RT-1?', options: ['Лучше: данных стало больше', 'Хуже: 35 млн параметров на девять роботов не хватает', 'Одинаково: архитектура та же'], answer: (r) => (r.rt1x.every((v, i) => v < r.rt1[i]) ? 1 : r.rt1x.every((v, i) => v > r.rt1[i]) ? 0 : 2) },
      action: { label: 'Открыть таблицу I', run: (X) => X.open('t1') },
      criteria: [{ label: 'Таблица I открыта', test: (r) => r.open1 }],
      explain: (r) => `RT-1-X ниже RT-1 во всех трёх строках: ${r.rt1x[0]}% против ${r.rt1[0]}% в IRIS, ${r.rt1x[1]}% против ${r.rt1[1]}% в RAIL и ${r.rt1x[2]}% против ${r.rt1[2]}% на Google Robot. Авторы называют это недообучением: сеть на 35 млн параметров не вмещает девять роботов. RT-2-X на 55 млрд даёт ${r.rt2x[0]}%, ${r.rt2x[1]}% и ${r.rt2x[2]}% — вровень с RT-1 или лучше и выше метода авторов Bridge. Перенос в богатых доменах требует ёмкой модели.` },
    { short: 'Чужие умения', title: 'Умения из чужого датасета', text: 'Таблица II. Строка 1 — RT-2 только на данных Google Robot, строка 2 — RT-2-X на всей смеси. Колонка «Умения из Bridge» — задачи с предметами и навыками из Bridge, записанного на WidowX; проверяют их на Google Robot, в данных которого таких задач нет.',
      onEnter: (X) => X.setTab('t2'),
      bet: { q: 'насколько RT-2-X лучше RT-2 на этих задачах?', options: ['Примерно одинаково: RT-2 и так хорошо обобщает', 'Примерно втрое', 'На порядок: у RT-2 таких задач не было совсем'], answer: (r) => { const q = r.em[1] / r.em[0]; return q < 1.5 ? 0 : q < 6 ? 1 : 2; } },
      action: { label: 'Открыть таблицу II', run: (X) => X.open('t2') },
      criteria: [{ label: 'Таблица II открыта', test: (r) => r.open2 }],
      explain: (r) => `${fmt(r.em[1], 1)}% против ${fmt(r.em[0], 1)}%: примерно втрое. А в колонке обобщения на новые предметы и фоны разницы почти нет — ${r.gen[1]}% против ${r.gen[0]}%: это RT-2 умел и раньше благодаря веб-предобучению. Новое в RT-2-X — умения, которые пришли с другого робота.` },
    { short: 'Откуда умения', title: 'Докажи, что умения пришли с WidowX', text: 'Втрое больше успеха на задачах из Bridge — а точно ли из-за данных Bridge? Нажми на строку таблицы II, которая это проверяет.',
      onEnter: (X) => X.setTab('t2'),
      criteria: [{ label: 'Выбрана строка, где из смеси убрали один датасет', test: (r, s) => s.tab === 't2' && s.sel === 2 }],
      hint: 'Ищи строку, где данные — «смесь без Bridge».',
      explain: () => 'Строка 3: та же модель на 55 млрд, та же смесь, но без Bridge — 42,8% вместо 75,8%. Успех упал почти вдвое, значит, умения действительно перешли с WidowX на Google Robot через общий формат. Это и есть положительный перенос в чистом виде: робот научился тому, чего в его собственных данных не было.' },
    { short: 'Размер', title: 'Что меняет размер модели', text: 'В таблице I маленькой RT-1-X не хватало ёмкости. Нажми на строку таблицы II, которая показывает то же для RT-2-X: малая модель на той же смеси переносит меньше.',
      onEnter: (X) => X.setTab('t2'),
      criteria: [{ label: 'Выбрана строка с моделью 5B на всей смеси с историей', test: (r, s) => s.tab === 't2' && s.sel === 3 }],
      hint: 'Сравнивать нужно со строкой 2: та же смесь, веб-данные и веб-предобучение, другой размер.',
      explain: () => 'Строка 4: RT-2-X на 5 млрд параметров даёт 44,4% на умениях из Bridge против 75,8% у 55 млрд. Размер модели важен для переноса между роботами, а не только для обобщения на предметы. Строки 5 и 6 добавляют ещё два условия: без истории из 2 кадров обобщение падает с 52% до 30%, а без веб-предобучения модель не работает совсем — 0% и 1%.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай таблицы, наводи на ячейки и нажимай на строки. Найди в таблице II пару строк, из которой следует, что совместное дообучение с веб-данными и дообучение только на роботах здесь дали почти одно и то же, и подумай, почему в уроке 3.3 вывод был другим.', final: true, controls: ['tab'] },
  ];
  function init() {
    segBind('#tSel', setTab);
    const box = $('#tBox');
    box.addEventListener('mousemove', (e) => { const el = e.target.closest('[data-tip]'); if (el && el.dataset.tip) Tip.show(escapeHtml(el.dataset.tip), e.clientX, e.clientY); else Tip.hide(); });
    box.addEventListener('mouseleave', () => Tip.hide());
    ctl = mountMissions('#tMis', missions, api, { controls: { tab: '#wrapTSel' }, scene: '#tBox' });
    render();
    return ctl;
  }
  return { init, api, st };
})();
/* =====================================================================
   Схема (бывший flow.js): анимированная схема пути данных в RT-X на общем
   движке shared/anim.js. Роботы со своими датасетами и единицами действий →
   общий формат (один кадр камеры и 7 нормированных чисел действия) →
   одна модель → действие возвращается к каждому роботу в его единицах.
   Синим — данные и наблюдения, оранжевым — действия, фиолетовым — модель.
   Две раскладки: широкая (слева направо) и узкая для телефона (сверху вниз).
   ===================================================================== */
'use strict';
(() => {
  const T = 11;                                         // секунд на полный проход
  const PH = [[0, 2.2], [2.2, 4.4], [4.4, 6.6], [6.6, 9.2]];   // датасеты → формат → модель → к роботам
  const ROB = [
    { name: 'Franka', units: 'мм, 3 Гц', n: 5, k: 'arm' },
    { name: 'WidowX', units: 'клетки, 5 Гц', n: 3, k: 'arm' },
    { name: 'xArm', units: 'скорость, 10 Гц', n: 4, k: 'arm' },
    { name: 'Stretch', units: 'см, захват 0 = закр.', n: 2, k: 'mobile' },
  ];
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /** Маленький робот: рука на тумбе или мобильная база. */
  function robot(c, x, y, s, kind, P, A, lit) {
    const { rect, circle, line } = A, col = lit ? P.ink : P.ink2;
    if (kind === 'mobile') { rect(c, x - 11 * s, y + 2 * s, 22 * s, 9 * s, 3, P.surf, col, 1.4); circle(c, x - 6 * s, y + 12 * s, 2.6 * s, col); circle(c, x + 6 * s, y + 12 * s, 2.6 * s, col); line(c, [[x - 4 * s, y + 2 * s], [x - 4 * s, y - 14 * s]], col, 2.2); line(c, [[x - 4 * s, y - 14 * s], [x + 8 * s, y - 10 * s]], col, 2.2); }
    else { rect(c, x - 10 * s, y + 6 * s, 20 * s, 5 * s, 2, P.surf, col, 1.4); line(c, [[x, y + 6 * s], [x - 5 * s, y - 6 * s]], col, 2.6); line(c, [[x - 5 * s, y - 6 * s], [x + 7 * s, y - 12 * s]], col, 2.6); circle(c, x - 5 * s, y - 6 * s, 1.8 * s, col); }
    const gx = kind === 'mobile' ? x + 8 * s : x + 7 * s, gy = kind === 'mobile' ? y - 10 * s : y - 12 * s;
    line(c, [[gx, gy], [gx + 3 * s, gy - 3 * s]], P.mot, 2); line(c, [[gx, gy], [gx + 3 * s, gy + 2 * s]], P.mot, 2);
  }
  /** Стопка карточек-эпизодов. */
  function stack(c, x, y, n, s, P, A, lit) {
    const { rect } = A;
    for (let i = n - 1; i >= 0; i--) rect(c, x - 9 * s + i * 2 * s, y - 6 * s - i * 2 * s, 18 * s, 12 * s, 2, lit ? P.outS : P.surf2, lit ? P.out : P.ink3, 1.1);
  }
  /** Семь ячеек вектора действия и квадрат кадра: общий формат. */
  function format(c, x, y, s, P, A, fill, lit) {
    const { rect, lab, alpha } = A;
    rect(c, x - 30 * s, y - 24 * s, 24 * s, 24 * s, 3, lit ? P.outS : P.surf2, lit ? P.out : P.ink3, 1.4);
    const grid = 4; for (let i = 1; i < grid; i++) { A.line(c, [[x - 30 * s + i * 6 * s, y - 24 * s], [x - 30 * s + i * 6 * s, y]], alpha(P.out, 0.35), 0.8); A.line(c, [[x - 30 * s, y - 24 * s + i * 6 * s], [x - 6 * s, y - 24 * s + i * 6 * s]], alpha(P.out, 0.35), 0.8); }
    const names = ['x', 'y', 'z', 'r', 'p', 'y', 'g'];
    for (let i = 0; i < 7; i++) {
      const on = fill * 7 > i, cx = x - 30 * s + i * 8.6 * s;
      rect(c, cx, y + 6 * s, 7.6 * s, 10 * s, 2, on ? P.motS : P.surf2, on ? P.mot : P.ink3, 1.2);
      if (on) lab(c, 1, names[i], cx + 3.8 * s, y + 11 * s, { px: 9, color: P.mot, halo: false });
    }
  }
  function model(c, x, y, s, P, A, act) {
    const { rect, lab, alpha } = A;
    rect(c, x - 26 * s, y - 22 * s, 52 * s, 44 * s, 6, act > 0 ? P.sprS : P.surf2, act > 0 ? P.spr : P.ink3, 1.6);
    for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) { const on = act * 12 > r * 4 + q; rect(c, x - 20 * s + q * 10.5 * s, y - 15 * s + r * 11 * s, 8 * s, 8 * s, 2, on ? alpha(P.spr, 0.55) : alpha(P.ink3, 0.15), null); }
  }
  function flow(c, from, to, prog, n, color, A) {
    const { circle } = A;
    if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < n; i++) { const ph = (prog * 1.8 + hash(i + 7)) % 1; circle(c, from[0] + (to[0] - from[0]) * ph, from[1] + (to[1] - from[1]) * ph, 2.2, color); }
  }

  function draw(c, k, t, P, A, G) {
    const { lab, arrow, seg, alpha } = A, u = ((t % T) + T) % T, pr = PH.map(([a, b]) => seg(u, a, b));
    const cur = PH.findIndex(([a, b]) => u >= a && u < b);
    // роботы и их датасеты
    ROB.forEach((r, i) => {
      const [rx, ry] = G.rob[i], [sx, sy] = G.set[i], lit = cur === 0 ? pr[0] * 4 > i : cur === 3 ? pr[3] * 4 > i : false;
      robot(c, rx, ry, G.s, r.k, P, A, lit);
      stack(c, sx, sy, r.n, G.s, P, A, pr[0] > 0 && pr[1] === 0 || (cur === 0));
      lab(c, k, r.name, rx, ry + 22 * G.s, { px: 10.5, color: lit ? P.ink : P.ink3, haloColor: P.surf2 });
      // на телефоне роботы стоят в ряд: единицы — в две строки под именем, чтобы соседние подписи не слипались
      if (!G.narrow) lab(c, k, r.units, rx, ry + 34 * G.s, { px: 9.5, weight: 500, color: cur === 3 && lit ? P.mot : P.ink3, haloColor: P.surf2 });
      else if (cur === 3) r.units.split(', ').forEach((u, j) => lab(c, k, u, rx, ry + 34 * G.s + j * 11, { px: 9.5, weight: 500, color: lit ? P.mot : P.ink3, haloColor: P.surf2 }));
      // эпизоды летят к общему формату
      if (pr[0] > 0 && pr[0] < 1) flow(c, [sx, sy], G.fmt, Math.max(0, pr[0] * 1.3 - i * 0.1), 7, P.out, A);
      // действие возвращается роботу в его единицах
      if (pr[3] > 0 && pr[3] < 1) flow(c, G.mdlOut, [rx, ry - 8 * G.s], Math.max(0, pr[3] * 1.3 - i * 0.1), 5, P.mot, A);
    });
    // стрелки
    arrow(c, G.a1[0], G.a1[1], G.a1[2], G.a1[3], pr[1] > 0 ? P.ink2 : P.line, 1.8, 6);
    arrow(c, G.a2[0], G.a2[1], G.a2[2], G.a2[3], pr[2] > 0 ? P.ink2 : P.line, 1.8, 6);
    // общий формат
    format(c, G.fmt[0], G.fmt[1], G.s, P, A, pr[1], cur === 1);
    lab(c, k, 'Общий формат', G.fmtCap[0], G.fmtCap[1], { px: 11, weight: 700, color: cur === 1 ? P.ink : P.ink3, haloColor: P.surf2 });
    lab(c, k, cur === 1 && pr[1] < 1 ? 'одна камера · 7 чисел действия' : 'кадр + 7 нормированных чисел', G.fmtCap[0], G.fmtCap[1] + 14, { px: 9.5, weight: 500, color: cur === 1 ? P.out : P.ink3, haloColor: P.surf2 });
    if (pr[1] > 0 && pr[1] < 1) flow(c, G.fmt, G.mdlIn, pr[1], 10, P.out, A);
    // модель
    model(c, G.mdl[0], G.mdl[1], G.s, P, A, pr[2]);
    lab(c, k, 'Одна модель', G.mdlCap[0], G.mdlCap[1], { px: 11, weight: 700, color: cur === 2 ? P.ink : P.ink3, haloColor: P.surf2 });
    lab(c, k, 'RT-1-X · RT-2-X', G.mdlCap[0], G.mdlCap[1] + 14, { px: 9.5, weight: 500, color: cur === 2 ? P.spr : P.ink3, haloColor: P.surf2 });
    if (pr[2] > 0 && pr[2] < 1) lab(c, k, 'токены действия: 8 × 256 корзин', G.mdl[0], G.mdl[1] + 30 * G.s, { px: 9.5, color: P.spr, haloColor: P.surf2 });
    if (cur === 3) lab(c, k, 'де-нормализация: каждому роботу — его единицы', G.back[0], G.back[1], { px: 10, weight: 600, color: P.mot, haloColor: P.surf2 });
    const stage = ['1 · 60 датасетов 22 роботов', '2 · приведение к общему формату', '3 · обучение одной модели на смеси', '4 · обратно к роботам', ''][cur < 0 ? 4 : cur];
    lab(c, k, stage, G.stage[0], G.stage[1], { px: 11, weight: 700, color: P.ink2, haloColor: P.surf2, align: G.stageAlign || 'center' });
  }

  Anim.add('oxe', {
    W: 720, H: 300, start: 1.2, narrowAt: 600,
    draw(c, k, t, P, A) {
      draw(c, k, t, P, A, {
        s: 1,
        rob: [[70, 50], [70, 116], [70, 182], [70, 246]], set: [[160, 46], [160, 112], [160, 178], [160, 242]],
        fmt: [330, 150], fmtCap: [330, 44], a1: [200, 150, 290, 150], mdlIn: [470, 150], mdl: [500, 150], mdlCap: [500, 44], a2: [376, 150, 468, 150], mdlOut: [530, 150],
        back: [560, 262], stage: [716, 288], stageAlign: 'right',
      });
    },
    narrow: {
      W: 360, H: 560,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          s: 0.85, narrow: true,
          rob: [[48, 64], [136, 64], [224, 64], [312, 64]], set: [[48, 140], [136, 140], [224, 140], [312, 140]],
          fmt: [196, 272], fmtCap: [196, 206], a1: [180, 160, 180, 236], mdlIn: [180, 384], mdl: [180, 414], mdlCap: [180, 362], a2: [180, 302, 180, 378], mdlOut: [180, 444],
          back: [180, 494], stage: [180, 540],
        });
      },
    },
  });
})();

/* =====================================================================
   3. Смесь данных: четыре робота, свои политики и одна на смеси
   ===================================================================== */
const LabMix = (() => {
  const E = L34, L = L21, NT = 60, CW = 120, ITERS = 500, PER_FRAME = 12;
  const UNITS = { a: 'камера — весь стол; клетки 24 × 24; захват 1 = закрыт', b: 'камера ближе, середина стола; клетки 12 × 12; захват 0 = закрыт', c: 'камера с другой стороны, кадр зеркален; миллиметры в базе', d: 'кадр чуть обрезан; смещение от домашней точки в см; ось x — к камере' };
  const st = { align: 0, w: [1, 1, 1, 1], scene: 1, own: [null, null, null, null], ownRes: [null, null, null, null], ownAlign: 0, mix: null, mixRes: null, mixAlign: null, mixW: null, ref: null, busy: false, prog: null };
  let ctl = null, data = null; const bmCache = new Map();
  const R = E.ROBOTS;
  const share = () => { const s = st.w.map((w, i) => w * R[i].nDemos), z = s.reduce((a, b) => a + b, 0) || 1; return s.map((v) => v / z); };
  function frameBitmap(robot, img, key) {
    if (bmCache.has(key)) return bmCache.get(key);
    const { x0, y0, size, flip } = robot.cam, cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const c = cv.getContext('2d'), d = c.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const sx = x0 + (flip ? size - 1 - x : x), p = ((y0 + y) * L.TW + sx) * 3, o = (y * size + x) * 4; d.data[o] = img[p] * 255; d.data[o + 1] = img[p + 1] * 255; d.data[o + 2] = img[p + 2] * 255; d.data[o + 3] = 255; }
    c.putImageData(d, 0, 0); bmCache.set(key, cv); return cv;
  }
  function drawRobot(i) {
    const r = R[i], cv = $('#xCam-' + r.id), { c, k } = HeroKit.fit(cv, CW, CW), P = pal();
    const own = st.ownRes[i], mix = st.mixRes ? st.mixRes[i] : null, run = (mix || own) ? (mix || own).runs[st.scene - 1] : null;
    const sc = run ? run.scene : data[i][0].scene, key = run ? `${r.id}:t${st.scene}` : `${r.id}:d0`;
    c.imageSmoothingEnabled = false; c.drawImage(frameBitmap(r, sc.img, key), 0, 0, CW, CW);
    const f = E.toFrame(r, sc.target.x, sc.target.y), tx = f.u * CW, ty = f.v * CW, ring = L.RT / r.cam.size * CW + 4;
    c.beginPath(); c.arc(tx, ty, ring, 0, 7); c.setLineDash(run ? [] : [4, 3]); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke(); c.setLineDash([]);
    if (!run) { // подпись не должна обрезаться краем кадра: у краёв прижимаем её к краю, у верхнего края — ставим под кольцо
      const al = tx < CW * 0.35 ? 'left' : tx > CW * 0.65 ? 'right' : 'center', lx = al === 'left' ? 3 : al === 'right' ? CW - 3 : tx, ly = ty - ring - 8 * k < 8 * k ? ty + ring + 8 * k : ty - ring - 8 * k;
      HeroKit.label(c, k, 'оператор взял здесь', lx, ly, { px: 10, weight: 700, align: al, color: P.ink, haloColor: P.surf });
    }
    else {
      const o = own ? own.runs[st.scene - 1] : null, m = mix ? mix.runs[st.scene - 1] : null;
      if (o) { const q = E.toFrame(r, o.x, o.y); HeroKit.cross(c, q.u * CW, q.v * CW, 5, o.ok ? P.good : P.cl, 2.6); }
      if (m) { const q = E.toFrame(r, m.x, m.y); c.beginPath(); c.arc(q.u * CW, q.v * CW, 5, 0, 7); c.fillStyle = m.ok ? P.good : P.e2e; c.fill(); c.lineWidth = 1.5; c.strokeStyle = P.surf; c.stroke(); }
      HeroKit.label(c, k, `«${L.phrase(sc.color, 'cube')}»`, CW / 2, CW - 9 * k, { px: 10, weight: 700, color: P.ink, haloColor: P.surf });
    }
  }
  function renderBars() {
    R.forEach((r, i) => {
      const o = st.ownRes[i], m = st.mixRes ? st.mixRes[i] : null, stale = st.mixRes && st.mixAlign !== st.align;
      const set = (sel, res, name, dim) => { const el = $(sel), bar = el.querySelector('i'), b = el.querySelector('b'); el.classList.toggle('empty', !res); bar.style.width = res ? (res.rate * 100).toFixed(0) + '%' : '0'; b.textContent = res ? `${name}: ${pct(res.rate)}${dim ? ' (устарело)' : ''}` : `${name}: не обучена`; };
      set(`#xR-${r.id} .bar-own`, o, 'своя', false); set(`#xR-${r.id} .bar-mix`, m, 'смесь', stale);
    });
  }
  function renderNative() {
    const parts = R.map((r, i) => {
      const res = st.mixRes ? st.mixRes[i] : st.ownRes[i]; if (!res) return null;
      const run = res.runs[st.scene - 1], n = run.native, a = r.act;
      const txt = a.kind === 'grid' ? `клетка (${n.cx}, ${n.cy}), захват ${n.g}` : a.kind === 'mm' ? `${n.xmm} мм, ${n.ymm} мм` : `dx ${fmt(n.dx, 1)} см, dy ${fmt(n.dy, 1)} см`;
      return `${r.name.slice(-1)}: общий формат (${fmt(run.u, 2)}; ${fmt(run.v, 2)}) → <b>${txt}</b>`;
    }).filter(Boolean);
    setOut($('#xNative'), parts.length ? `Сцена ${st.scene}, ${st.mixRes ? 'политика на смеси' : 'свои политики'} — де-нормализация в единицы каждого робота: ` + parts.join(' · ') : 'Пунктирное кольцо — где оператор взял кубик в первой демонстрации каждого робота. Обрати внимание на кадры: у B середина стола крупнее, у C зеркало, у D срезаны края.');
  }
  function renderWeights() {
    const sh = share();
    R.forEach((r, i) => { const inp = $('#xW-' + r.id); inp.value = st.w[i]; syncRange(inp, `×${fmt(st.w[i], 1)} · ${pct(sh[i])}`); });
  }
  function out() {
    if (st.busy && st.prog) { setOut($('#xOut'), st.prog); return; }
    const o = st.ownRes, m = st.mixRes;
    if (!o[0] && !m) { setOut($('#xOut'), 'Четыре робота, одни сцены, разные записи. Обучи политики: сначала каждую на своих данных.'); return; }
    let t = o[0] ? 'Свои данные: ' + R.map((r, i) => `${r.name.slice(-1)} ${pct(o[i].rate)}`).join(', ') + '.' : '';
    if (m) t += ` Смесь${st.mixAlign ? ' (ось D выровнена)' : ''}: ` + R.map((r, i) => `${r.name.slice(-1)} <b>${pct(m[i].rate)}</b>${o[i] ? ' (' + pp(m[i].rate - o[i].rate) + ')' : ''}`).join(', ') + (st.mixAlign !== st.align ? '. Переключатель оси изменился — обучи смесь заново.' : '.');
    setOut($('#xOut'), t);
  }
  function render() { R.forEach((_, i) => drawRobot(i)); renderBars(); renderNative(); renderWeights(); out(); }
  function progress(label, ev) { const p = $('#xProg'); p.hidden = false; p.querySelector('i').style.width = ((ev.it + 1) / ev.iters * 100).toFixed(0) + '%'; st.prog = `${label}: шаг ${ev.it + 1} из ${ev.iters}, потери ${fmt(ev.loss, 2)}.`; out(); }
  async function trainOwn() {
    st.busy = true; st.mix = null; st.mixRes = null; st.ownAlign = st.align;
    for (let i = 0; i < 4; i++) {
      const m = E.policyInit(5, 32);
      await runGen(E.train(m, [{ demos: data[i], w: 1 }], { iters: ITERS, align: !!st.align }), PER_FRAME, (ev) => progress(`Политика робота ${R[i].name.slice(-1)} на ${R[i].nDemos} демонстрациях`, ev));
      st.own[i] = m; st.ownRes[i] = E.evaluate(m, R[i], NT, !!st.align); render();
    }
    $('#xProg').hidden = true; st.prog = null; st.busy = false; render();
    return state();
  }
  async function trainMix() {
    st.busy = true; const align = !!st.align, w = st.w.slice();
    const m = E.policyInit(5, 32);
    await runGen(E.train(m, data.map((d, i) => ({ demos: d, w: w[i] * R[i].nDemos })), { iters: ITERS, align }), PER_FRAME, (ev) => progress(`Политика на смеси, доли в пакете ${share().map((s) => pct(s)).join(' / ')}`, ev));
    st.mix = m; st.mixAlign = st.align; st.mixW = w; st.mixRes = R.map((r) => E.evaluate(m, r, NT, align));
    if (align && w.every((v) => v === 1)) st.ref = st.mixRes.map((x) => x.rate);
    $('#xProg').hidden = true; st.prog = null; st.busy = false; render();
    return state();
  }
  function state() {
    const own = st.ownRes.map((x) => (x ? x.rate : null)), mix = st.mixRes ? st.mixRes.map((x) => x.rate) : null;
    return { align: !!st.align, w: st.w.slice(), wA: st.w[0], own, mix, mixAlign: st.mixAlign, mixStale: !!st.mixRes && st.mixAlign !== st.align, delta: mix && own[0] != null ? mix.map((v, i) => v - own[i]) : null, ref: st.ref, scene: st.scene, busy: st.busy };
  }
  function setAlign(v) { if (st.busy) return; st.align = +v; segSet('#xAlign', st.align); render(); if (ctl) ctl.update(); }
  function setW(i, v) { if (st.busy) return; st.w[i] = Math.round(v * 2) / 2; render(); if (ctl) ctl.update(); }
  function setScene(n) { st.scene = Math.max(1, Math.min(NT, n)); $('#xScene').value = st.scene; syncRange($('#xScene'), String(st.scene)); render(); }
  const api = {
    reset() { st.own = [null, null, null, null]; st.ownRes = [null, null, null, null]; st.mix = null; st.mixRes = null; st.mixAlign = null; st.ref = null; st.w = [1, 1, 1, 1]; setAlign(0); setScene(1); },
    state, trainOwn, trainMix, setAlign, setW, setScene, setWeights(w) { st.w = w.slice(); render(); if (ctl) ctl.update(); },
  };
  const missions = [
    { short: 'Свои данные', title: 'Четыре политики на своих данных', text: 'У каждого робота свой датасет: 300, 100, 40 и 15 демонстраций. Обучи четыре политики, каждую только на своих записях, и проверь на 60 новых сценах. Кадры сверху — как видит стол каждый робот.',
      onEnter: (X) => { X.setAlign(0); },
      bet: { q: 'какой робот справится лучше всех?', options: ['A: у него 300 демонстраций', 'B: камера ближе, кубики в кадре крупнее', 'D: данных меньше всех, зато меньше путаницы'], answer: (r) => { const o = r.own; const bi = o.indexOf(Math.max(...o)); return bi === 0 ? 0 : bi === 1 ? 1 : 2; } },
      action: { label: 'Обучить четыре политики', run: (X) => X.trainOwn() },
      criteria: [{ label: 'Все четыре политики обучены и проверены', test: (r) => r.own.every((v) => v != null) }, { label: 'Робот A попадает не реже чем в 60% сцен', test: (r) => r.own[0] >= 0.6 }, { label: 'Робот D — реже чем в 25%', test: (r) => r.own[3] < 0.25 }],
      explain: (r) => `A — ${pct(r.own[0])}, B — ${pct(r.own[1])}, C — ${pct(r.own[2])}, D — ${pct(r.own[3])}: успех идёт за числом демонстраций. Политика не знает про сдвиги и учит таблицу «где цветное пятно → какая корзина», и 15 демонстраций покрывают стол лишь в 15 местах. На кадрах — первая проверочная сцена: крестик — куда опустился захват своей политики, кольцо — нужный кубик; листать сцены можно в свободном режиме. У робота C кадр зеркален, но его собственной политике это не мешает: её метки и кадры согласованы между собой.` },
    { short: 'Смесь', title: 'Одна политика на смеси четырёх датасетов', text: 'Теперь приведём все 455 демонстраций к общему формату — кадр 12 × 12 и корзины по осям кадра — и обучим одну политику на смеси. Доли датасетов в пакете пропорциональны их размеру, как если бы все записи просто сложили в одну кучу. Проверим ту же политику на каждом роботе.',
      bet: { q: 'кому поможет смесь?', options: ['Всем четырём примерно поровну: данных стало больше', 'Роботам с малыми датасетами; большому почти ничего', 'Никому: камеры и единицы разные, записи несовместимы'], answer: (r) => { const d = r.delta; if (!d) return 2; const up = d.filter((v) => v >= 0.15).length; return up >= 4 ? 0 : up >= 2 && d[0] < 0.1 ? 1 : up ? 1 : 2; } },
      action: { label: 'Обучить на смеси', run: (X) => X.trainMix() },
      criteria: [{ label: 'Политика на смеси обучена', test: (r) => !!r.mix }, { label: 'B и C выше своих политик не меньше чем на 15 п.п.', test: (r) => r.delta && r.delta[1] >= 0.15 && r.delta[2] >= 0.15 }, { label: 'A не выиграл: изменение в пределах 15 п.п. от своей политики', test: (r) => r.delta && Math.abs(r.delta[0]) <= 0.15 }],
      fail: (r) => (!r.own[0] ? 'Сначала обучи четыре политики на своих данных в миссии 1: с ними сравниваем.' : ''),
      explain: (r) => `B: ${pct(r.own[1])} → ${pct(r.mix[1])}, C: ${pct(r.own[2])} → ${pct(r.mix[2])} — положительный перенос, как у малых доменов на рис. 4 статьи. A: ${pct(r.own[0])} → ${pct(r.mix[0])} — большому датасету чужие данные ничего не добавили, а немного помешали. А D: ${pct(r.own[3])} → ${pct(r.mix[3])}, хотя данных у него меньше всех и помощь нужнее всего. Точки на кадрах — куда опустился захват политики на смеси, крестики — своей. Почему D не выиграл?` },
    { short: 'Ось D', title: 'Что общий формат не выровнял', text: 'Робот D записывает смещение в своей базе, и его ось x направлена к камере — противоположно оси кадра. Нормировка по рабочему полю знак не трогает: в общем формате метки D зеркальны меткам остальных роботов при той же картинке. В статье системы координат тоже не выравнивают. Переключи ось D на «выровнять» и обучи смесь заново.',
      controls: ['align'],
      bet: { q: 'почему смесь не помогла D?', options: ['Его данных слишком мало даже в смеси', 'Его метки противоречат остальным: ось x направлена иначе, а нормировка этого не исправляет', 'Его камера обрезана иначе, и модель его не узнаёт'], answer: (r) => (r.align && r.mix[3] < 0.5 ? 0 : 1) },
      action: { label: 'Обучить на смеси', run: (X) => X.trainMix() },
      criteria: [{ label: 'Ось x робота D выровнена при приведении к общему формату', test: (r) => r.align }, { label: 'Робот D попадает не реже чем в 60% сцен', test: (r) => r.align && r.mix[3] >= 0.6 }, { label: 'A по-прежнему в пределах 15 п.п. от своей политики', test: (r) => r.delta && Math.abs(r.delta[0]) <= 0.15 }],
      fail: (r) => (!r.align ? 'Переключи «Ось x робота D» на «выровнять» и обучи смесь ещё раз.' : ''),
      explain: (r) => `D: ${pct(r.mix[3])} — с 15 демонстрациями он теперь не хуже робота с 300. Выравнивание оси — одна строка в конвертере датасета, и она стоила больше, чем все 440 чужих демонстраций вместе. В статье этого шага нет: авторы оставляют системы координат как есть и предупреждают, что один вектор может означать разные движения, а узнавать робота модель должна по картинке. У RT-2-X с его 55 млрд параметров и разными лабораториями в кадре это получается; у нас камеры почти одинаковы, и узнать D не по чему.` },
    { short: 'Донор', title: 'Убери самый большой датасет', text: 'Веса смеси — множители к размеру датасета: ×1 у всех значит «пропорционально размеру». Поставь вес робота A в ноль, оставь остальным ×1 и обучи смесь без его 300 демонстраций.',
      controls: ['align', 'weights'],
      bet: { q: 'что станет с B, C и D без данных A?', options: ['Почти ничего: у B 100 демонстраций, у C и D свои', 'Все трое просядут: именно данные A покрывали стол', 'B вырастет: ему больше не мешает чужая камера'], answer: (r) => { const ref = r.ref || [0.73, 0.83, 0.7, 0.83]; const down = [1, 2, 3].filter((i) => ref[i] - r.mix[i] >= 0.1).length; return down >= 2 ? 1 : r.mix[1] > ref[1] + 0.05 ? 2 : 0; } },
      action: { label: 'Обучить на смеси', run: (X) => X.trainMix() },
      criteria: [{ label: 'Вес данных A равен нулю', test: (r) => r.wA === 0 }, { label: 'C и D ниже, чем в полной смеси, не меньше чем на 15 п.п.', test: (r) => { const ref = r.ref || [0.73, 0.83, 0.7, 0.83]; return r.wA === 0 && ref[2] - r.mix[2] >= 0.15 && ref[3] - r.mix[3] >= 0.15; } }],
      fail: (r) => (r.wA !== 0 ? 'Сдвинь ползунок веса A в ноль: ползунки появились под кадрами.' : ''),
      explain: (r) => `Без A: B ${pct(r.mix[1])}, C ${pct(r.mix[2])}, D ${pct(r.mix[3])}. Малые датасеты помогали друг другу слабо: 155 демонстраций на троих покрывают стол реже, чем 300 одного робота. В смеси статьи роль донора играют большие наборы RT-1 и Bridge — в строке 3 таблицы II достаточно было убрать Bridge, чтобы успех Google Robot на этих умениях упал почти вдвое.` },
    { short: 'Веса', title: 'Подбери веса смеси', text: 'Кто-то решил помочь роботу D и поднял вес его датасета в десять раз. Обучи смесь с такими весами, посмотри, кто пострадал, а потом подбери веса так, чтобы все четыре робота попадали не реже чем в 65% сцен.',
      controls: ['align', 'weights'], onEnter: (X) => { X.setAlign(1); X.setWeights([1, 1, 1, 10]); },
      bet: { q: 'кто пострадает от веса D ×10?', options: ['Никто: 15 демонстраций D всё равно капля в смеси', 'Робот A: его доля в пакете упадёт, а 15 примеров D сеть начнёт заучивать', 'Робот D: он переобучится на своих 15 примерах'], answer: (r) => { const ref = r.ref || [0.73, 0.83, 0.7, 0.83]; return ref[0] - r.mix[0] >= 0.1 ? 1 : ref[3] - r.mix[3] >= 0.1 ? 2 : 0; } },
      action: { label: 'Обучить на смеси', run: (X) => X.trainMix() },
      criteria: [{ label: 'Ось D выровнена', test: (r) => r.align }, { label: 'Все четыре робота не ниже 65%', test: (r) => r.mix && r.mix.every((v) => v >= 0.65) }],
      fail: (r) => (!r.align ? 'Верни выравнивание оси D.' : r.mix[0] < 0.65 ? `A упал до ${pct(r.mix[0])}: уменьши вес D и обучи снова.` : `Ниже 65%: ${r.mix.map((v, i) => (v < 0.65 ? R[i].name.slice(-1) + ' ' + pct(v) : null)).filter(Boolean).join(', ')}. Поменяй веса и обучи снова.`),
      explain: (r) => `Веса ${r.w.map((v) => '×' + fmt(v, 1)).join(', ')}: A ${pct(r.mix[0])}, B ${pct(r.mix[1])}, C ${pct(r.mix[2])}, D ${pct(r.mix[3])}. Веса смеси — не косметика: у Octo и OpenVLA из урока 3.5 таблица весов датасетов занимает отдельную страницу приложения, и крупные наборы в ней намеренно приглушены, а малые — усилены, но не в десять раз.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй веса, ось D и листай сцены. Найди наименьший вес A, при котором все четыре робота держатся выше 65%, и проверь, что будет, если выключить выравнивание оси D при его весе ×10.', final: true, controls: ['align', 'weights', 'scene'],
      action: { label: 'Обучить на смеси', run: (X) => X.trainMix() } },
  ];
  function init() {
    data = R.map((r) => E.demosFor(r, r.nDemos));
    const box = $('#xRobots');
    R.forEach((r) => box.append(h('div', { class: 'robot', id: 'xR-' + r.id }, h('h4', null, r.name, h('small', null, `${r.nDemos} демо`)), h('canvas', { class: 'cam', id: 'xCam-' + r.id, width: CW, height: CW, role: 'img', 'aria-label': `Кадр камеры робота ${r.name.slice(-1)}` }), h('div', { class: 'units' }, UNITS[r.id]), h('div', { class: 'bars' }, h('div', { class: 'bar bar-own empty', style: '--c:var(--classic)' }, h('i'), h('b', null, 'своя: не обучена')), h('div', { class: 'bar bar-mix empty', style: '--c:var(--e2e)' }, h('i'), h('b', null, 'смесь: не обучена'))))));
    const wbox = $('#xWeights');
    R.forEach((r, i) => { const lab = h('label', null, h('span', null, `Вес ${r.name.slice(-1)} (${r.nDemos} демо)`, h('output', null, '×1,0')), h('input', { id: 'xW-' + r.id, type: 'range', min: 0, max: 10, step: 0.5, value: 1 })); lab.querySelector('input').addEventListener('input', (e) => setW(i, +e.target.value)); wbox.append(lab); });
    // output стоит перед input внутри span: syncRange ждёт его следующим соседом — переставим
    $$('#xWeights label').forEach((lab) => { const inp = lab.querySelector('input'), o = lab.querySelector('output'); inp.after(o); });
    legend('#xLegend', [['нужный кубик', 'var(--ink)', 'ring'], ['где оператор взял кубик в первой демонстрации, до обучения', 'var(--ink)', 'ringd'], ['куда опустила захват своя политика', 'var(--classic)', 'cross'], ['своя политика попала в кубик', 'var(--good)', 'cross'], ['куда опустила захват политика на смеси', 'var(--e2e)', 'dot'], ['политика на смеси попала в кубик', 'var(--good)', 'dot'], ['доля попаданий своей политики', 'var(--classic)', 'bar'], ['доля попаданий политики на смеси', 'var(--e2e)', 'bar']]);
    segBind('#xAlign', setAlign);
    $('#xScene').addEventListener('input', (e) => setScene(+e.target.value)); syncRange($('#xScene'), '1');
    ctl = mountMissions('#xMis', missions, api, { controls: { align: '#wrapXAlign', weights: '#xWeights', scene: '#wrapXScene' }, scene: '#xRobots' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, NT, get data() { return data; } };
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
    { q: 'Open X-Embodiment записал новые демонстрации на 22 роботах?', o: ['Да, по единому протоколу во всех лабораториях', 'Нет: 60 уже существующих датасетов из 34 лабораторий привели к одному формату', 'Да, но только в симуляции'], a: 1, e: 'Датасет собран объединением чужих записей, поэтому камеры, частоты и системы координат в нём остались разными. Единый протокол записи появился позже — например, у DROID.' },
    { q: 'Общий формат выравнивает системы координат роботов?', o: ['Да: все действия переводят в систему координат камеры', 'Нет: действия только нормируют по датасету, а в чьих координатах они заданы, не трогают', 'Да: все переводят в систему координат базы робота'], a: 1, e: 'Авторы пишут прямо: системы координат не совмещают, значения остаются абсолютными, относительными или скоростями, как записал контроллер. Поэтому один вектор может означать разные движения у разных роботов — в лаборатории это сломало перенос роботу D.' },
    { q: 'RT-1-X обошёл модели, обученные на одном датасете, во всех доменах?', o: ['Да, везде: данных стало больше', 'Нет: в больших доменах Bridge и RT-1 он проиграл RT-1 на его данных — модель на 35 млн параметров недообучается', 'Нет: он проиграл только в малых доменах'], a: 1, e: 'В малых доменах RT-1-X лучше в 4 из 5 и в среднем на 50%, а в таблице I он ниже RT-1 во всех трёх строках. Ёмкости 35 млн параметров на девять роботов не хватает.' },
    { q: 'Откуда у RT-2-X на Google Robot взялись умения, которых не было в его данных?', o: ['Из веб-предобучения: модель видела такие сцены в интернете', 'Из датасета Bridge, записанного на другом роботе WidowX: без него успех падает с 75,8% до 42,8%', 'Из увеличенной истории кадров'], a: 1, e: 'Строка 3 таблицы II — та же модель и смесь без Bridge. Успех падает почти вдвое, значит, умения перешли с WidowX через общий формат.' },
    { q: 'RT-2-X обобщает на новые предметы и фоны заметно лучше RT-2?', o: ['Да: 75,8% против 27,3%', 'Нет: 61% против 62% — это RT-2 умел и раньше благодаря веб-предобучению', 'Нет: хуже, потому что данные роботов зашумляют веб-знание'], a: 1, e: 'Числа 75,8% и 27,3% — это возникающие умения, задачи из Bridge. В колонке обобщения по протоколу RT-2 модели почти равны: новые предметы и фоны RT-2 понимал и без чужих данных.' },
    { q: 'Чтобы учиться на смеси роботов, в RT-X добавили модуль под каждого робота?', o: ['Да: у каждого робота своя голова действий', 'Нет: архитектуры RT-1 и RT-2 не меняли, а робота модель узнаёт по картинке', 'Да: вектор действия дополнили номером робота'], a: 1, e: 'Авторы намеренно не вводили механизмов против разницы роботов и показали, что положительный перенос дают сами данные. Отдельные головы действий появятся позже, у Octo.' },
    { q: 'Если робототехнических данных много, веб-предобучение можно не делать?', o: ['Да: миллиона траекторий хватает', 'Нет: RT-2-X на 5 млрд, обученный с нуля на той же смеси, даёт 0% и 1%', 'Да, но только для RT-1-X'], a: 1, e: 'Строка 6 таблицы II. Без веб-предобучения модель зрения и языка не работает вовсе, и это с полной смесью данных роботов.' },
    { q: 'Любому датасету в смеси гарантирован положительный перенос?', o: ['Да: больше данных — всегда лучше', 'Нет: статья не даёт критерия, когда перенос есть; большим доменам нужна ёмкая модель, а несогласованный формат его ломает', 'Да, если данных у робота меньше 1000 эпизодов'], a: 1, e: 'Авторы называют критерий переноса будущей работой. В лаборатории робот D с невыровненной осью от смеси не выиграл ничего, а большой датасет A от смеси немного потерял.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('fmt', () => { FmtSort.init(); });
    safe('tables', () => { mis.tables = LabTables.init(); });
    safe('mix', () => { mis.mix = LabMix.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'xMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l34 = { mis, SPEED, FmtSort, LabTables, LabMix, L34 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
