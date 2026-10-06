/* =====================================================================
   ui-l02.js — урок 0.2 «Устройство робота». Интерактивы:
   1) «Тело в цифрах» — интерактивная схема гуманоида и четыре робота рядом;
   2) «Рука из звеньев» — миссии с прямым манипулированием (захват, локоть);
   3) лаборатория «Редуктор и удар» — два сустава на одной сцене, миссии;
   4) «Какой привод куда» — сортировка карточек;
   5) IMU — три оценки наклона на одном графике, миссии;
   6) «Лестница частот» — расставь узлы по шкале, потом настоящая лестница;
   7) лаборатория «Модель привода по данным» — миссии, живое обучение,
      кривая «ошибка от объёма данных», поломка привода;
   8) квиз. Движки без DOM — в engine-l02.js и shared/actuator-core.js.
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
const pal2 = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), bad: HeroKit.css('--critical'), good: HeroKit.css('--good'), surf: HeroKit.css('--surface'), warn: HeroKit.css('--warning') });
/** Числа для подписей. Не число — прочерк и запись в window.__l02bad: проверка урока следит, чтобы там было пусто. */
const badNum = (v) => { (window.__l02bad = window.__l02bad || []).push(String(v) + ' ' + (new Error().stack || '').split('\n').slice(2, 4).join(' ')); return '—'; };
const fmt1 = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: d == null ? 1 : Math.min(d, 1) }) : badNum(v));
const fmtN = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v).toLocaleString('ru-RU') : badNum(v));
const fmtS = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d }) : badNum(v));
const ratioTxt = (n) => `${n} : 1`;
/** Легенда под графиком: [текст, css-цвет, пунктир?]. Подписи в HTML, чтобы не мельчали на телефоне. */
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, dash]) => box.append(h('span', null, h('i', { class: dash ? 'dash' : null, style: `--c:${col}` }), t)));
}
/** Ползунок: подпись значения рядом и заливка дорожки. */
function rangeOut(input, text) { const o = input.parentElement.querySelector('output'); if (o) o.textContent = text; setRangeFill(input); }
/** Сегментный переключатель: кнопки с data-v, выбранная — aria-pressed. */
function segSet(box, v) { $$('button', box).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const L02 = {};

/* ---------- 1. Тело в цифрах: интерактивная схема и четыре робота рядом ---------- */
const Body = (() => {
  const ZONES = {
    head: { n: 1, t: 'Голова: камеры, глубина, лидар', kind: ['sens'], flow: ['sens'],
      lead: 'Здесь глаза робота. Картинка с камер — главный вход политики.',
      dl: [['Что меряет', 'цвет, расстояние до предметов, облако точек вокруг'], ['Частота', 'камеры обычно 30 кадров в секунду; глубина RealSense D435i — до 90 кадров при 1280×720; лидар Livox MID-360 — 10 Гц и 200 тысяч точек в секунду'], ['Слабые места', 'кадры приходят в десятки раз реже, чем работают регуляторы суставов, и с задержкой; зависит от света; не видит контакт, когда пальцы закрывают предмет'], ['В политике', 'ALOHA смотрит четырьмя камерами 480×640, π0 — двумя-тремя']] },
    torso: { n: 2, t: 'Корпус: IMU и вычислитель', kind: ['sens', 'pol'], flow: ['sens', 'pol'],
      lead: 'Инерциальный блок знает наклон и вращение корпуса. Рядом бортовой компьютер, на котором работает политика.',
      dl: [['IMU', 'Bosch BMI088: гироскоп до 2 кГц, акселерометр до 1,6 кГц'], ['Слабые места', 'гироскоп дрейфует, акселерометр шумит и путает рывок с наклоном; как их объединяют — в разделе «Сенсоры»'], ['Политика', 'у G1 политика ходьбы получает 47 чисел о собственном теле и 50 раз в секунду выдаёт 12 целевых углов ног']] },
    joint: { n: 3, t: 'Суставы: привод и энкодер', kind: ['act', 'sens'], flow: ['sens', 'pd', 'motor'],
      lead: 'В каждом суставе мотор с редуктором и энкодер, который меряет угол. Сюда приходят команды политики.',
      dl: [['Что получает', 'целевые углы от политики 50–200 раз в секунду; ПД-регулятор держит их на 1–40 кГц, контур тока — на 20–40 кГц'], ['Энкодер', 'AS5047P в Mini Cheetah — 14 бит, но около 2 бит из них шум; у G1 по два энкодера: на роторе и на выходе'], ['Момент', 'оценивают по току мотора, τ ≈ N · K_t · i, у Cheetah 3 ошибка около ±10% из-за трения; у Franka FR3 датчики момента во всех 7 суставах']] },
    hand: { n: 4, t: 'Кисть: тросы и тактильные сенсоры', kind: ['act', 'sens'], flow: ['sens', 'motor'],
      lead: 'Много степеней свободы в малом объёме и контакт, которого камера не видит.',
      dl: [['Приводы', 'у 1X NEO тросовые, с малой инерцией; в кисти Optimus 2022 года 6 приводов на 11 степеней свободы'], ['Осязание', 'GelSight и DIGIT — камеры, которые снимают деформацию геля; DIGIT весит 20 г и снимает 640×480 при 60 кадрах; Digit 360 чувствует силы от 1 мН; у Figure 03 камеры в ладонях, а пальцы чувствуют от 3 г'], ['В политике', 'сила на входе пока исключение: ForceVLA добавляет к π0 шестиосевой датчик силы, и успех растёт на 23%']] },
    foot: { n: 5, t: 'Стопа: контакт и сила', kind: ['sens'], flow: ['sens'],
      lead: 'Шагающему роботу нужно знать, стоит ли нога на земле и с какой силой давит.',
      dl: [['Без датчика', 'MIT Cheetah обходится без датчиков силы: силу в стопе оценивают по току моторов, полоса около 100 Гц'], ['Масштаб', 'контакт стопы длится до 85 мс при силах больше 450 Н'], ['С датчиком', 'шестиосевой датчик силы ATI Axia80 выдаёт 8 кГц с задержкой меньше 1 мс; такой стоит во фланце руки UR5e']] },
  };
  const KIND = { sens: ['сенсор', ''], act: ['привод', 'classic'], pol: ['политика', 'e2e'] };
  const FLOW = [['sens', 'Сенсоры', 'камеры, IMU, энкодеры, сила'], ['pol', 'Политика', 'нейросеть · 10–200 Гц'], ['pd', 'Регуляторы суставов', 'ПД · 1–40 кГц'], ['motor', 'Моторы', 'контур тока · 20–40 кГц']];
  const ROWS = [['dof', 'Степени свободы'], ['act', 'Приводы'], ['sees', 'Что видит политика'], ['out', 'Что она выдаёт'], ['hz', 'Частота политики'], ['exec', 'Кто исполняет'], ['note', 'Заметка']];
  const ROBOTS = [
    { name: 'Рука Franka', kind: 'рука', dof: '7 суставов и захват', act: 'электрические, датчик момента в каждом суставе', sees: 'камеры и углы суставов', out: 'целевые углы суставов или позу захвата', hz: 'π0 управляет Franka на 20 Гц: выдаёт пачку из 50 действий и исполняет первые 16', exec: 'регуляторы суставов на 1 кГц', note: 'Интерфейс руки принимает моменты, углы или скорости суставов, а также позу захвата. Что выбрать, зависит от того, что выдаёт политика.' },
    { name: 'ALOHA', kind: 'две руки', dof: '2 × (6 суставов + захват) = 14', act: 'сервомоторы Dynamixel', sees: '4 камеры 480×640 по 30 кадров в секунду и 14 углов суставов', out: 'пачку из 100 целевых углов по 14 осям', hz: '50 Гц', exec: 'ПИД-регуляторы в моторах Dynamixel', note: 'Оператор двигает маленькие ведущие руки, а большие повторяют их углы. На 50 таких демонстрациях учится ACT — о нём урок 1.7.' },
    { name: 'Mini Cheetah', kind: 'четвероногий', dof: '12, по три на ногу', act: 'квазипрямые 6:1, до 17 Н·м', sees: 'углы суставов и IMU', out: '12 целевых углов', hz: '50 Гц', exec: 'ПД-регуляторы на драйверах моторов, до 40 кГц', note: 'Политика, обученная только в симуляторе, разгоняет робота до 3,9 м/с.' },
    { name: 'Unitree G1', kind: 'гуманоид', dof: '23 в базовой версии, до 43 с кистями', act: 'синхронные моторы с постоянными магнитами, колено 90 или 120 Н·м', sees: '47 чисел о собственном теле: углы и скорости суставов ног, IMU, команда скорости, прошлое действие', out: '12 целевых углов ног', hz: '50 Гц', exec: 'ПД-регуляторы суставов', note: 'Это политика ходьбы из открытого примера Unitree: она управляет только 12 суставами ног.' },
  ];
  const seen = new Set(); let sel = null;
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (parent) parent.append(e); return e; };
  const capsule = (g, x1, y1, x2, y2, w) => { sv('line', { x1, y1, x2, y2, 'stroke-width': w, 'stroke-linecap': 'round', class: 'b-limb' }, g); sv('line', { x1, y1, x2, y2, 'stroke-width': w - 4, 'stroke-linecap': 'round', class: 'b-limb-in' }, g); };
  function figure() {
    const svg = $('#bodySvg'); svg.innerHTML = '';
    const limbs = sv('g', { class: 'b-limbs', 'aria-hidden': 'true' }, svg);
    // руки и ноги (не кликаются)
    [[86, 112, 70, 190], [214, 112, 230, 190], [70, 192, 62, 262], [230, 192, 238, 262], [126, 248, 122, 336], [174, 248, 178, 336], [122, 338, 120, 418], [178, 338, 180, 418]].forEach(([a, b, c, d]) => capsule(limbs, a, b, c, d, 22));
    const zone = (id, label) => { const g = sv('g', { class: 'b-zone', 'data-z': id, tabindex: '0', role: 'button', 'aria-label': label }, svg); return g; };
    // голова с экраном-лицом
    const head = zone('head', ZONES.head.t);
    sv('rect', { x: 140, y: 78, width: 20, height: 18, rx: 4, class: 'b-body' }, head);
    sv('rect', { x: 108, y: 16, width: 84, height: 66, rx: 20, class: 'b-body b-hl' }, head);
    sv('rect', { x: 119, y: 28, width: 62, height: 40, rx: 11, class: 'b-screen' }, head);
    sv('circle', { cx: 138, cy: 48, r: 5.5, class: 'b-eye' }, head); sv('circle', { cx: 162, cy: 48, r: 5.5, class: 'b-eye' }, head);
    // корпус с меткой на груди
    const torso = zone('torso', ZONES.torso.t);
    sv('rect', { x: 96, y: 94, width: 108, height: 144, rx: 24, class: 'b-body b-hl' }, torso);
    sv('rect', { x: 136, y: 122, width: 28, height: 9, rx: 4.5, class: 'b-mark' }, torso);
    sv('rect', { x: 128, y: 160, width: 44, height: 30, rx: 7, class: 'b-chip' }, torso);
    // кисти
    const hand = zone('hand', ZONES.hand.t);
    [[62, 280], [238, 280]].forEach(([x, y]) => { sv('rect', { x: x - 14, y: y - 16, width: 28, height: 30, rx: 9, class: 'b-body b-hl' }, hand); sv('line', { x1: x - 6, y1: y + 6, x2: x - 6, y2: y + 20, class: 'b-finger' }, hand); sv('line', { x1: x + 6, y1: y + 6, x2: x + 6, y2: y + 20, class: 'b-finger' }, hand); });
    // стопы
    const foot = zone('foot', ZONES.foot.t);
    [[118, 436], [182, 436]].forEach(([x, y]) => sv('rect', { x: x - 26, y: y - 10, width: 52, height: 20, rx: 8, class: 'b-body b-hl' }, foot));
    // суставы
    const joint = zone('joint', ZONES.joint.t);
    [[86, 112, 12], [214, 112, 12], [70, 192, 10], [230, 192, 10], [126, 248, 12], [174, 248, 12], [122, 338, 11], [178, 338, 11], [120, 420, 8], [180, 420, 8]].forEach(([x, y, r]) => sv('circle', { cx: x, cy: y, r, class: 'b-joint b-hl' }, joint));
    // номера зон
    const badges = { head: [204, 22], torso: [150, 216], joint: [204, 330], hand: [34, 300], foot: [212, 452] };
    for (const [id, [x, y]] of Object.entries(badges)) {
      const g = sv('g', { class: 'b-badge', 'data-z': id, 'aria-hidden': 'true' }, svg);
      sv('circle', { cx: x, cy: y, r: 15, class: 'b-pulse' }, g); sv('circle', { cx: x, cy: y, r: 11, class: 'b-dot' }, g);
      const t = sv('text', { x, y: y + 4.5, 'text-anchor': 'middle', class: 'b-num' }, g); t.textContent = ZONES[id].n;
    }
    $$('#bodySvg [data-z]').forEach((g) => {
      const pick = () => select(g.dataset.z);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }
  function flow() {
    const box = $('#bodyFlow'); box.innerHTML = '';
    FLOW.forEach(([id, t, sub], i) => {
      if (i) box.append(h('span', { class: 'bf-arrow', 'aria-hidden': 'true' }, '→'));
      box.append(h('div', { class: `bf-step bf-${id}`, 'data-f': id }, h('b', null, t), h('span', null, sub)));
    });
    box.append(h('p', { class: 'bf-loop muted-s' }, 'Углы, токи и наклон корпуса снова приходят в политику: контур замкнут через сенсоры.'));
  }
  function detail() {
    const box = $('#bodyDetail'); box.innerHTML = '';
    $$('#bodyFlow [data-f]').forEach((e) => e.classList.toggle('on', !!sel && ZONES[sel].flow.includes(e.dataset.f)));
    if (!sel) { box.append(h('h4', null, 'Нажми на часть тела'), h('p', null, 'Голова, корпус, суставы, кисть и стопа. Номера на схеме — порядок, в котором удобно смотреть.')); return; }
    const z = ZONES[sel], dl = h('dl');
    z.dl.forEach(([k, v]) => dl.append(h('dt', null, k), h('dd', null, v)));
    box.append(h('h4', null, z.t), h('div', { class: 'bd-chips' }, ...z.kind.map((k) => h('span', { class: `chip ${KIND[k][1]}` }, KIND[k][0]))), h('p', null, z.lead), dl);
  }
  function select(id) {
    sel = id; seen.add(id);
    $$('#bodySvg .b-zone').forEach((g) => g.classList.toggle('sel', g.dataset.z === id));
    $$('#bodySvg .b-badge').forEach((g) => g.classList.toggle('seen', seen.has(g.dataset.z)));
    $('#bodyCount').textContent = seen.size < 5 ? `Осмотрено ${seen.size} из 5` : 'Осмотрены все пять зон. Ниже — те же вопросы для четырёх роботов.';
    detail();
  }
  function compare() {
    const box = $('#bodyCmp'); box.innerHTML = '';
    box.append(h('div', { class: 'cmp-k cmp-h' }));
    ROWS.forEach(([, t]) => box.append(h('div', { class: 'cmp-k' }, t)));
    ROBOTS.forEach((r) => {
      box.append(h('div', { class: 'cmp-h' }, h('b', null, r.name), h('span', null, r.kind)));
      ROWS.forEach(([k, t]) => box.append(h('div', { class: 'cmp-v' + (k === 'note' ? ' cmp-note' : ''), 'data-k': t }, r[k])));
    });
  }
  function init() { figure(); flow(); detail(); compare(); $('#bodyCount').textContent = 'Осмотрено 0 из 5'; }
  return { init, select, get seen() { return seen.size; } };
})();

/* ---------- 2. Рука из звеньев: захват и локоть тянут мышью или пальцем ---------- */
const ArmLab = (() => {
  const K = HeroKit, E = ArmK, W = 520, H = 420, S = 472, X0 = 142, Y0 = 392;
  const X = (x) => X0 + x * S, Y = (y) => Y0 - y * S, WX = (px) => (px - X0) / S, WY = (py) => (Y0 - py) / S;
  const WHAT = { box: 'коробку', table: 'стол', lamp: 'лампу' };
  const cm = (m) => fmt1(m * 100, 0);
  const st = { n: 2, q: null, lamp: false, drop: 0, zone: false, held: false, grip: 0, phase: 'm1', dragPhi: 0, busy: false, gripOn: true, elbowOn: false };
  const zoneCache = {};
  let ctl = null, anim = null, dirty = true;
  const L = () => (st.n === 2 ? E.L2 : E.L3);
  const phi = () => st.q.reduce((s, v) => s + v, 0);
  const J = () => E.judge(L(), st.q, st.lamp);
  const startPose = () => E.ik2(E.L2[0], E.L2[1], 0.25, 0.45, true);
  const cupPose = () => E.convert(E.L2, E.ik2(E.L2[0], E.L2[1], E.GRASP[0], E.GRASP[1], true), E.L3);
  function zoneFor() { const key = st.n + (st.lamp ? 'L' : ''); return zoneCache[key] || (zoneCache[key] = E.zone(L(), st.lamp)); }
  function obstacle(c, rc, hit, P, dy) {
    const x0 = X(rc[0]), x1 = X(rc[2]), y0 = Y(rc[3] + dy), y1 = Y(rc[1] + dy);
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = hit ? HeroKit.css('--critical-soft') : P.surf; c.fill();
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, hit ? P.bad : P.ink3, 6, 1);
    c.strokeStyle = hit ? P.bad : P.ink2; c.lineWidth = hit ? 2.4 : 1.5; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  function capsule(c, a, b, w, fill, edge) {
    c.lineCap = 'round';
    c.strokeStyle = edge; c.lineWidth = w + 3; c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke();
    c.strokeStyle = fill; c.lineWidth = w - 1; c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke();
  }
  function cupAt(c, cx, by, P, held) {
    const w = E.CUP.w * S, hh = E.CUP.h * S, x0 = X(cx) - w / 2, y1 = Y(by), y0 = y1 - hh;
    c.lineWidth = 2; c.strokeStyle = P.ink2;
    c.beginPath(); c.arc(x0 + w + 2, y0 + hh * 0.45, hh * 0.26, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.beginPath(); c.roundRect ? c.roundRect(x0, y0, w, hh, [3, 3, 9, 9]) : c.rect(x0, y0, w, hh); c.fillStyle = P.warn; c.globalAlpha = held ? 1 : 0.92; c.fill(); c.globalAlpha = 1; c.stroke();
  }
  function draw() {
    dirty = false;
    const { c, k } = K.fit($('#armCv'), W, H), P = pal2(), j = J(), dy = st.drop * 0.42;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, S * 0.05, P.grid);
    if (st.zone) { const z = zoneFor(), cs = z.cell * S; c.fillStyle = P.cl; c.globalAlpha = 0.17; for (const p of z.pts) c.fillRect(X(p[0]) - cs / 2, Y(p[1]) - cs / 2, cs + 0.6, cs + 0.6); c.globalAlpha = 1; }
    // стол
    const ty = Y(0); c.fillStyle = P.surf; c.fillRect(0, ty, W, H - ty); c.beginPath(); c.rect(0, ty, W, H - ty); K.hatch(c, 0, ty, W, H, P.ink3, 7, 1);
    c.strokeStyle = j.what === 'table' ? P.bad : P.ink2; c.lineWidth = j.what === 'table' ? 3 : 2; c.beginPath(); c.moveTo(0, ty); c.lineTo(W, ty); c.stroke();
    obstacle(c, E.BOX, j.what === 'box', P, 0);
    if (st.lamp) {
      const cx = X((E.CORD[0] + E.CORD[2]) / 2); c.strokeStyle = P.ink2; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, Y(E.LAMP[3] + dy)); c.stroke();
      obstacle(c, E.LAMP, j.what === 'lamp' && !st.drop, P, dy);
    }
    // основание на столе
    c.fillStyle = P.ink2; c.beginPath(); c.moveTo(X(-0.055), ty); c.lineTo(X(-0.035), Y(0.035)); c.lineTo(X(0.035), Y(0.035)); c.lineTo(X(0.055), ty); c.closePath(); c.fill();
    // цель и чашка
    if (!st.held) {
      c.setLineDash([4, 4]); c.lineWidth = 1.6; c.strokeStyle = j.atCup && !j.hit ? P.good : P.ink3; c.beginPath(); c.arc(X(E.GRASP[0]), Y(E.GRASP[1]), E.TOL * S, 0, 7); c.stroke(); c.setLineDash([]);
      cupAt(c, E.CUP.x, 0, P, false);
    }
    // вторая поза двух звеньев для той же точки
    if (st.n === 2) {
      const g = j.grip, alt = E.ik2(E.L2[0], E.L2[1], g[0], g[1], !(st.q[1] < 0));
      if (alt) { const pts = E.fk(E.L2, alt); c.setLineDash([6, 5]); c.strokeStyle = P.ink3; c.lineWidth = 2; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(X(pts[1][0]), Y(pts[1][1]), 4, 0, 7); c.fillStyle = P.ink3; c.fill(); }
    }
    // рука
    const pts = j.pts, wpx = 2 * E.R * S;
    for (let i = 0; i < pts.length - 1; i++) {
      const bad = j.hit && j.link === i, b = i === pts.length - 2 ? [pts[i + 1][0] - (pts[i + 1][0] - pts[i][0]) * 0.035 / L()[i], pts[i + 1][1] - (pts[i + 1][1] - pts[i][1]) * 0.035 / L()[i]] : pts[i + 1];
      capsule(c, pts[i], b, wpx, bad ? HeroKit.css('--critical-soft') : P.surf, bad ? P.bad : P.ink);
    }
    // захват: два пальца
    const e = pts[pts.length - 1], pr = pts[pts.length - 2], ang = Math.atan2(e[1] - pr[1], e[0] - pr[0]), nx = -Math.sin(ang), ny = Math.cos(ang), ux = Math.cos(ang), uy = Math.sin(ang);
    const open = 0.026 - 0.012 * st.grip, base = [e[0] - ux * 0.04, e[1] - uy * 0.04];
    c.strokeStyle = j.hit && j.link === pts.length - 2 ? P.bad : P.ink; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
    c.moveTo(X(base[0] + nx * open), Y(base[1] + ny * open)); c.lineTo(X(base[0] - nx * open), Y(base[1] - ny * open));
    for (const sg of [1, -1]) { c.moveTo(X(base[0] + sg * nx * open), Y(base[1] + sg * ny * open)); c.lineTo(X(e[0] + sg * nx * open * 0.8), Y(e[1] + sg * ny * open * 0.8)); }
    c.stroke();
    if (st.held) cupAt(c, e[0], e[1] - 0.012 - E.CUP.h, P, true);
    // суставы
    pts.slice(0, -1).forEach((p, i) => { c.beginPath(); c.arc(X(p[0]), Y(p[1]), i ? 6.5 : 8.5, 0, 7); c.fillStyle = P.ink2; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke(); });
    // подписи поверх всего, с подложкой
    const lab = (t, x, y, hot, al) => K.label(c, k, t, x, y, { px: 11, color: hot ? P.bad : P.ink3, haloColor: P.bg, align: al || 'center' });
    lab('коробка', X(E.BOX[0]) - 6, Y(E.BOX[3] * 0.55), j.what === 'box', 'right');
    lab('стол', W - 8, ty + 13, j.what === 'table', 'right');
    if (!st.held) lab('чашка', X(E.CUP.x + E.CUP.w / 2) + 14, Y(0.03), false, 'left');
    if (st.lamp) lab('лампа', X(E.LAMP[2]) + 8, Y((E.LAMP[1] + E.LAMP[3]) / 2 + dy), j.what === 'lamp', 'left');
    // за что тянуть
    if (!st.busy) {
      c.setLineDash([3, 4]); c.lineWidth = 2;
      if (st.gripOn) { c.strokeStyle = P.e2e; c.beginPath(); c.arc(X(e[0]), Y(e[1]), 17, 0, 7); c.stroke(); }
      if (st.elbowOn && st.n === 3) { c.strokeStyle = P.cl; c.beginPath(); c.arc(X(pts[1][0]), Y(pts[1][1]), 17, 0, 7); c.stroke(); }
      c.setLineDash([]);
    }
    readout(j);
  }
  function readout(j) {
    const parts = [`${st.n} сустава`];
    parts.push(st.held ? 'чашка в захвате' : j.atCup ? 'захват у чашки' : `до чашки ${cm(j.dist)} см`);
    parts.push(j.hit ? `<b class="bad">задевает ${WHAT[j.what]}</b>` : `запас до препятствий ${cm(j.clear)} см`);
    $('#armRead').innerHTML = parts.join(' · ');
    const it = [['рука', 'var(--ink)']]; if (st.n === 2) it.push(['вторая поза для той же точки', 'var(--ink-3)', true]); if (st.zone) it.push(['куда захват встанет без столкновений', 'var(--classic)']);
    if (st.gripOn) it.push(['захват: тяни', 'var(--e2e)', true]); if (st.elbowOn && st.n === 3) it.push(['локоть: тяни', 'var(--classic)', true]);
    legend('#armLegend', it);
  }
  const touch = () => { dirty = true; if (ctl) ctl.update(); };
  function setJoints(n) {
    if (st.busy || n === st.n) return;
    const from = L(); st.n = n; st.q = E.convert(from, st.q, L(), st.phase === 'm1' ? -Math.PI / 2 : null);
    segSet($('#armJointsWrap'), n); touch();
  }
  const ease = (u) => u * u * (3 - 2 * u);
  function grab() {
    return new Promise((res) => {
      const j = J(), r = { n: st.n, atCup: j.atCup, hit: j.hit, what: j.what, dist: j.dist, clear: j.clear }, ok = j.atCup && !j.hit;
      const g0 = j.grip, ph0 = phi(), t0 = performance.now(); st.busy = true;
      anim = (now) => {
        const t = Math.max(0, now - t0) / 1000; st.grip = Math.min(1, t / 0.3);
        if (ok && t > 0.3) { st.held = true; st.q = E.solveGrip(L(), st.q, [g0[0], g0[1] + 0.07 * ease(Math.min(1, (t - 0.3) / 0.6))], ph0); }
        if (!ok && t > 0.45) st.grip = Math.max(0, 1 - (t - 0.45) / 0.25);
        if (t > (ok ? 1.0 : 0.75)) { anim = null; st.busy = false; if (!ok) st.grip = 0; dirty = true; res(r); }
      };
    });
  }
  function setup(phase) {
    st.phase = phase; anim = null; st.busy = false; st.grip = 0; st.held = false; st.drop = 0;
    if (phase === 'm1') { st.gripOn = true; st.elbowOn = false; st.lamp = false; }
    if (phase === 'm2') {
      st.gripOn = false; st.elbowOn = true; st.n = 3; st.q = cupPose(); st.held = true; st.grip = 1; st.lamp = true; st.drop = 1; st.zone = false; $('#armZone').checked = false;
      const t0 = performance.now(); anim = (now) => { const u = Math.min(1, Math.max(0, now - t0) / 900); st.drop = 1 - ease(u); if (u >= 1) { st.drop = 0; anim = null; touch(); } };
    }
    if (phase === 'free') { st.gripOn = true; st.elbowOn = true; }
    $('#armLamp').checked = st.lamp; segSet($('#armJointsWrap'), st.n); dirty = true;
  }
  const api = {
    reset() { st.n = 2; st.q = startPose(); st.zone = false; $('#armZone').checked = false; setup('m1'); },
    state() { const j = J(); return { n: st.n, drift: j.dist, atCup: j.atCup, hit: j.hit, what: j.what, clear: j.clear, held: st.held }; },
    grab, setup, setJoints,
  };
  const missions = [
    { short: 'Дотянись', title: 'Дотянись до чашки', controls: ['joints', 'zone'],
      text: 'Чашка стоит за коробкой. Перетащи захват мышью или пальцем к чашке, а когда он окажется в пунктирном круге, нажми «Взять чашку». Рука не должна задевать ни коробку, ни стол.',
      bet: { q: 'хватит ли двух суставов, чтобы взять чашку?', options: ['Хватит', 'Не хватит'], answer: () => 1 },
      action: { label: 'Взять чашку', run: (A) => A.grab() },
      criteria: [{ label: 'Захват у чашки', test: (r) => r.atCup }, { label: 'Рука не задевает коробку и стол', test: (r) => !r.hit }],
      summary: (r) => `${r.n} сустава · ${r.atCup ? 'у чашки' : `до чашки ${cm(r.dist)} см`} · ${r.hit ? 'задевает ' + WHAT[r.what] : 'без столкновений'}`,
      fail: (r) => (!r.atCup ? 'Захват пока не у чашки: подведи его в пунктирный круг.' : r.n === 2 ? `Захват у чашки, но рука задевает ${WHAT[r.what]}. Посмотри на пунктир: это вторая поза двух звеньев для той же точки. Если и она задевает препятствие, двух суставов не хватит.` : `Рука задевает ${WHAT[r.what]}. Отведи захват и подойди к чашке ещё раз.`),
      hint: 'Включи рабочую зону: закрашены клетки, куда захват встаёт хотя бы одной позой без столкновений. Если чашка вне зоны, никакое перетаскивание не поможет. Переключи руку на три сустава: длина та же, предплечье просто разделено на два звена.',
      explain: () => 'С тремя суставами рука зашла к чашке сверху и держит кисть вертикально. У двух звеньев в каждую точку ведут только две позы: локоть вверх задевает коробку, локоть вниз уходит под стол. Третий сустав не удлинил руку, но дал выбор позы: координат у захвата по-прежнему две, а суставов три. Рабочая зона без столкновений теперь накрывает чашку. А если препятствие появится, когда чашка уже в руке?',
      onEnter: (A) => A.setup('m1') },
    { short: 'Локоть', title: 'Отведи локоть от лампы', controls: [],
      text: 'Над столом опустили лампу, и локоть в неё упёрся. Перетаскивай локоть за синий круг: захват держит чашку и останется на месте.',
      criteria: [{ label: 'Захват держит чашку: сдвиг меньше 1 см', test: (r, s) => s.held && s.drift < 0.01 }, { label: 'Рука не задевает лампу и коробку', test: (r, s) => !s.hit }],
      hint: 'Локоть ходит по окружности вокруг плеча. Тяни его вниз и вправо, к коробке, но не до упора: там в коробку упрётся кисть.',
      explain: () => 'Захват не сдвинулся, а локоть ушёл от лампы. Движения суставов, которые не двигают захват, называют нуль-пространством. У двух звеньев при неподвижном захвате локоть стоит в одной из двух точек, а у трёх ходит по целой дуге. У руки Franka семь суставов на шесть координат позы захвата, поэтому такой свободный локоть есть и у неё: им отводят руку от препятствий.',
      onEnter: (A) => A.setup('m2') },
    { short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Перетаскивай захват и локоть, переключай число суставов, включай лампу и рабочую зону. Сравни, как меняется зона без столкновений у двух и трёх суставов, когда над столом висит лампа.',
      onEnter: (A) => A.setup('free') },
  ];
  function init() {
    st.q = startPose();
    $$('#armJointsWrap button').forEach((b) => { b.dataset.v = b.dataset.n; b.addEventListener('click', () => setJoints(+b.dataset.n)); });
    $('#armZone').addEventListener('change', (e) => { st.zone = e.target.checked; dirty = true; });
    $('#armLamp').addEventListener('change', (e) => { st.lamp = e.target.checked; touch(); });
    const cv = $('#armCv');
    K.drag(cv, W, H, {
      hit: (p) => {
        if (st.busy) return null; const pts = J().pts, e = pts[pts.length - 1];
        if (st.gripOn && Math.hypot(p.x - X(e[0]), p.y - Y(e[1])) < 28) return 'grip';
        if (st.elbowOn && st.n === 3 && Math.hypot(p.x - X(pts[1][0]), p.y - Y(pts[1][1])) < 26) return 'elbow';
        return null;
      },
      start: (o) => { if (o === 'grip') st.dragPhi = st.phase === 'm1' ? -Math.PI / 2 : phi(); },
      move: (o, p) => {
        const w = [WX(p.x), WY(p.y)];
        if (o === 'grip') { st.held = false; st.grip = 0; st.q = E.solveGrip(L(), st.q, w, st.dragPhi); }
        else st.q = E.solveElbow(L(), st.q, J().grip, w);
        touch();
      },
      tap: (p) => {
        if (st.busy) return; const w = [WX(p.x), WY(p.y)];
        if (st.gripOn) { st.held = false; st.grip = 0; st.q = E.solveGrip(L(), st.q, w, st.phase === 'm1' ? -Math.PI / 2 : phi()); touch(); }
        else if (st.elbowOn && st.n === 3) { st.q = E.solveElbow(L(), st.q, J().grip, w); touch(); }
      },
    });
    K.loop(cv, (dt, now) => { if (anim) { anim(now); dirty = true; } if (dirty) draw(); });
    App.on('theme', draw); App.on('resize', draw);
    ctl = Missions.mount('#armGuide', missions, api, { controls: { joints: '#armJointsWrap', zone: '#armZoneWrap', lamp: '#armLampWrap' } });
    draw();
  }
  return { init, api, st, get ctl() { return ctl; }, X, Y, WX, WY };
})();

/* ---------- 3. Лаборатория «Редуктор и удар»: два сустава на одной сцене ---------- */
const GearLab = (() => {
  const K = HeroKit, A = Act, TH_MIN = -1.2, TARGET = -0.9;
  const HIT_T = 1.6, UC = 0.45, WIN = 40; // анимация удара; мини-график — окно 40 мс после касания
  const RATIOS = [1, 2, 3, 4, 6, 9, 12, 15, 20, 30, 50, 80, 100, 120, 160];
  const KNEE = { torque: 18, peak: 160 }, KH = 8, DH = 1.5, PUSH = 2;
  /** Две раскладки сцены: широкая — график момента справа от стены, узкая (телефон) — под суставом. */
  const WIDE = { W: 560, H: 440, LANE: 220, PIVX: 150, LEN: 165, MOTX: 58, MOTR: 23, PIV: 182, WT: 70, WB: 210, ch: { x0: 384, x1: 548, top: 58, bot: 196, title: 18, axis: 207 } };
  const NARROW = { W: 360, H: 640, LANE: 320, PIVX: 112, LEN: 132, MOTX: 40, MOTR: 19, PIV: 178, WT: 66, WB: 196, ch: { x0: 22, x1: 344, top: 240, bot: 292, title: 218, axis: 306 } };
  let G = WIDE;
  const pivY = (i) => i * G.LANE + G.PIV, wallX = () => G.PIVX + G.LEN + 9;
  function layout() { const cv = $('#gearCv'), w = cv.parentElement.getBoundingClientRect().width; G = w && w < 520 ? NARROW : WIDE; cv.style.aspectRatio = `${G.W} / ${G.H}`; return G; }
  function lane(N, i, th) { return { i, N, link: A.freeLink(N, th, TH_MIN, 0), hit: null, imp: null, pushDeg: null, pull: null, hand: 0, pullT: 0, reachT: null, reached: false }; }
  const st = { lanes: [lane(6, 0, -0.3), lane(100, 1, -0.3)], mode: 'idle', t: 0, phase: 'push', prev: null, chartMax: 700 };
  let ctl = null, wait = null, dirty = true;
  const ease = (u) => u * u * (3 - 2 * u);
  function setN(ln, N) { ln.N = N; ln.link = A.freeLink(N, ln.link.th, TH_MIN, 0); ln.imp = null; ln.hit = null; ln.pushDeg = null; ln.pullT = 0; ln.reachT = null; ln.reached = false; }
  function syncSliders() {
    [['#gearNA', 0], ['#gearNB', 1]].forEach(([sel, i]) => { const inp = $(sel), N = st.lanes[i].N; inp.value = RATIOS.indexOf(N); rangeOut(inp, ratioTxt(N)); });
  }
  function laneTag(i) {
    if (st.phase === 'knee') return i ? (st.prev ? 'B · прошлая попытка' : 'B · для сравнения') : 'A · твой выбор';
    return i ? 'B' : 'A';
  }
  function niceMax(v) { for (const m of [200, 300, 500, 700, 1000, 1200]) if (v <= m * 0.92) return m; return 1500; }
  /** Угол звена и момент контакта в текущий момент анимации удара. */
  function hitState(ln) {
    const u = Math.min(1, st.t / HIT_T), hs = ln.hit; if (!hs) return { th: ln.link.th, tau: 0, k: -1 };
    if (u < UC) return { th: -0.25 * (1 - ease(u / UC)), tau: 0, k: -1 };
    const k = Math.min(WIN, Math.round((u - UC) / (1 - UC) * WIN)), idx = Math.min(hs.im.hist.length - 1, hs.ic + k);
    return { th: 0, tau: hs.im.hist[idx][1], k };
  }
  function drawLane(c, k, P, ln) {
    const top = ln.i * G.LANE, py = pivY(ln.i), PIVX = G.PIVX, LEN = G.LEN, MOTX = G.MOTX, MOTR = G.MOTR, WALLX = wallX();
    const hs = st.mode === 'hit' ? hitState(ln) : null, th = hs ? hs.th : ln.link.th, tau = hs ? hs.tau : 0;
    K.label(c, k, `${laneTag(ln.i)} · ${ratioTxt(ln.N)}`, 12, top + 18, { align: 'left', px: 12, weight: 700, color: P.ink, haloColor: P.bg });
    // стена
    c.beginPath(); c.rect(WALLX, top + G.WT, 16, G.WB - G.WT); c.fillStyle = P.surf; c.fill();
    c.beginPath(); c.rect(WALLX, top + G.WT, 16, G.WB - G.WT); K.hatch(c, WALLX, top + G.WT, WALLX + 16, top + G.WB, P.ink3, 6, 1);
    c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.strokeRect(WALLX, top + G.WT, 16, G.WB - G.WT);
    // ход звена, упор и отметка
    c.setLineDash([3, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.arc(PIVX, py, LEN, TH_MIN, 0); c.stroke(); c.setLineDash([]);
    const sa = TH_MIN - 0.07; c.strokeStyle = P.ink2; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(PIVX + Math.cos(sa) * (LEN - 12), py + Math.sin(sa) * (LEN - 12)); c.lineTo(PIVX + Math.cos(sa) * (LEN + 12), py + Math.sin(sa) * (LEN + 12)); c.stroke();
    K.label(c, k, 'упор', PIVX + Math.cos(sa) * (LEN + 4) - 30, py + Math.sin(sa) * (LEN + 4) + 2, { px: 11, color: P.ink3, haloColor: P.bg });
    if (st.phase === 'pull' || st.phase === 'free') {
      const col = ln.reached ? P.good : P.hy; c.strokeStyle = col; c.lineWidth = 2.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(PIVX + Math.cos(TARGET) * (LEN - 16), py + Math.sin(TARGET) * (LEN - 16)); c.lineTo(PIVX + Math.cos(TARGET) * (LEN + 16), py + Math.sin(TARGET) * (LEN + 16)); c.stroke(); c.setLineDash([]);
      K.label(c, k, 'отметка', PIVX + Math.cos(TARGET) * (LEN + 20) + 26, py + Math.sin(TARGET) * (LEN + 20), { px: 11, color: col, haloColor: P.bg });
    }
    // мотор: ротор крутится в N раз быстрее звена
    c.strokeStyle = P.ink3; c.lineWidth = 4; c.beginPath(); c.moveTo(MOTX + MOTR, py); c.lineTo(PIVX - 12, py); c.stroke();
    c.beginPath(); c.arc(MOTX, py, MOTR, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
    const ra = th * ln.N; c.strokeStyle = P.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(MOTX - Math.cos(ra) * (MOTR - 6), py - Math.sin(ra) * (MOTR - 6)); c.lineTo(MOTX + Math.cos(ra) * (MOTR - 6), py + Math.sin(ra) * (MOTR - 6)); c.stroke();
    K.label(c, k, 'мотор', MOTX, py - MOTR - 12, { px: 11, color: P.ink3, haloColor: P.bg });
    // редуктор
    const gr = Math.min(G.MOTR + 3, 10 + Math.log10(ln.N) * 6.5);
    c.beginPath(); c.arc(PIVX, py, gr, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
    for (let q = 0; q < 14; q++) { const a = q / 14 * Math.PI * 2 + th; c.beginPath(); c.moveTo(PIVX + Math.cos(a) * gr, py + Math.sin(a) * gr); c.lineTo(PIVX + Math.cos(a) * (gr + 4), py + Math.sin(a) * (gr + 4)); c.stroke(); }
    // звено
    const ex = PIVX + Math.cos(th) * LEN, ey = py + Math.sin(th) * LEN;
    c.lineCap = 'round'; c.strokeStyle = P.ink; c.lineWidth = 8; c.beginPath(); c.moveTo(PIVX, py); c.lineTo(ex, ey); c.stroke();
    c.beginPath(); c.arc(PIVX, py, 6, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke();
    c.beginPath(); c.arc(ex, ey, 8.5, 0, 7); c.fillStyle = P.cl; c.fill();
    if (tau > 0) { const Lr = 6 + 24 * Math.min(1, tau / 700); c.strokeStyle = P.bad; c.lineWidth = 2.2; for (let q = 0; q < 7; q++) { const a = Math.PI + (q / 6 - 0.5) * 2.4; c.beginPath(); c.moveTo(WALLX + Math.cos(a) * 11, ey + Math.sin(a) * 11); c.lineTo(WALLX + Math.cos(a) * (11 + Lr), ey + Math.sin(a) * (11 + Lr)); c.stroke(); } }
    if (st.mode === 'push') { const a = th - Math.PI / 2, ax = ex + Math.cos(a) * 30, ay = ey + Math.sin(a) * 30; c.strokeStyle = P.hy; c.lineWidth = 3; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ax, ay); c.stroke(); c.beginPath(); c.arc(ax, ay, 4, 0, 7); c.fillStyle = P.hy; c.fill(); K.label(c, k, `${PUSH} Н·м`, ax + 24, ay, { color: P.hy, weight: 700, px: 11, haloColor: P.bg }); }
    if (ln.pull != null) {
      const px = PIVX + Math.cos(ln.pull) * LEN, pyy = py + Math.sin(ln.pull) * LEN; c.setLineDash([3, 3]); c.strokeStyle = P.hy; c.lineWidth = 1.8; c.beginPath(); c.moveTo(ex, ey); c.lineTo(px, pyy); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(px, pyy, 5, 0, 7); c.fillStyle = P.hy; c.fill();
      K.label(c, k, `рука ${fmt1(ln.hand, 1)} Н·м`, px + 8, pyy - 14, { align: 'left', px: 11, weight: 700, color: P.hy, haloColor: P.bg });
    }
    // мини-график момента при ударе, шкала общая для обоих суставов
    const C = G.ch, y0 = top + C.bot, y1 = top + C.top, cy = (v) => y0 - Math.min(1, v / st.chartMax) * (y0 - y1), cx = (kk) => C.x0 + kk / WIN * (C.x1 - C.x0);
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(C.x0, y0); c.lineTo(C.x1, y0); c.moveTo(C.x0, y1); c.lineTo(C.x1, y1); c.stroke();
    K.label(c, k, `момент удара, до ${st.chartMax} Н·м`, C.x0, top + C.title, { align: 'left', px: 11, color: P.ink3, haloColor: P.bg });
    K.label(c, k, '0', C.x0, top + C.axis, { align: 'left', px: 10.5, mono: true, color: P.ink3, halo: false });
    K.label(c, k, `${WIN} мс`, C.x1, top + C.axis, { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false });
    if (st.phase === 'knee' && KNEE.peak < st.chartMax) { // предел редуктора из миссии
      c.setLineDash([5, 4]); c.strokeStyle = P.bad; c.globalAlpha = 0.6; c.lineWidth = 1.4; c.beginPath(); c.moveTo(C.x0, cy(KNEE.peak)); c.lineTo(C.x1, cy(KNEE.peak)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      K.label(c, k, `предел ${KNEE.peak}`, C.x0 + 4, cy(KNEE.peak) - 9, { align: 'left', px: 10.5, color: P.bad, haloColor: P.bg });
    }
    const hsrc = ln.hit;
    if (!hsrc) K.label(c, k, 'удара ещё не было', (C.x0 + C.x1) / 2, (y0 + y1) / 2, { px: 11, color: P.ink3, haloColor: P.bg });
    if (hsrc) {
      const upto = st.mode === 'hit' ? (hs && hs.k >= 0 ? hs.k : -1) : WIN;
      if (upto >= 0) {
        c.strokeStyle = P.bad; c.lineWidth = 2; c.beginPath();
        for (let kk = 0; kk <= upto; kk++) { const v = hsrc.im.hist[Math.min(hsrc.im.hist.length - 1, hsrc.ic + kk)][1]; kk ? c.lineTo(cx(kk), cy(v)) : c.moveTo(cx(kk), cy(v)); }
        c.stroke();
        if (st.mode !== 'hit' && ln.imp != null) K.label(c, k, `пик ${fmtN(ln.imp)}`, C.x1, Math.max(y1 + 9, cy(ln.imp) - 2), { align: 'right', px: 11, weight: 700, mono: true, color: P.bad, haloColor: P.bg });
      }
    }
  }
  function draw() {
    dirty = false; layout();
    const { c, k } = K.fit($('#gearCv'), G.W, G.H), P = pal2();
    c.fillStyle = P.bg; c.fillRect(0, 0, G.W, G.H); K.grid(c, G.W, G.H, 22, P.grid);
    c.setLineDash([5, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(8, G.LANE); c.lineTo(G.W - 8, G.LANE); c.stroke(); c.setLineDash([]);
    st.lanes.forEach((ln) => drawLane(c, k, P, ln));
  }
  function renderCmp() {
    const [a, b] = st.lanes, row = (t, f) => `<span>${t}</span><b>${f(a)}</b><b>${f(b)}</b>`;
    $('#gearCmp').innerHTML = `<span></span><b class="gc-h">A</b><b class="gc-h">B</b>` +
      row('Передаточное число', (l) => ratioTxt(l.N)) +
      row('Момент на выходе', (l) => `${fmt1(A.props(l.N).torque, 1)} Н·м`) +
      row('Инерция ротора на выходе', (l) => `${fmt1(A.props(l.N).refl, A.props(l.N).refl < 0.1 ? 4 : 2)} кг·м²`) +
      row('Трение в редукторе', (l) => `${fmt1(A.props(l.N).coul, 2)} Н·м`) +
      row('Толчок 2 Н·м', (l) => (l.pushDeg == null ? '—' : `${fmt1(l.pushDeg, 0)}°`)) +
      row('Пик удара', (l) => (l.imp == null ? '—' : `${fmtN(l.imp)} Н·м`)) +
      row('Рукой до отметки', (l) => (l.reachT == null ? '—' : `${fmt1(l.reachT, 1)} с`));
  }
  function finish() { st.mode = 'idle'; const w = wait; wait = null; dirty = true; renderCmp(); if (w) w(); }
  function pushBoth() {
    const res = st.lanes.map((ln) => A.push(ln.N, PUSH, -0.3, TH_MIN));
    st.lanes.forEach((ln) => { ln.link = A.freeLink(ln.N, -0.3, TH_MIN, 0); ln.pushDeg = null; });
    st.mode = 'push'; st.t = 0;
    return new Promise((r) => { wait = () => { st.lanes.forEach((ln, i) => { ln.link.set(Math.max(TH_MIN, -0.3 - res[i].deg * Math.PI / 180)); ln.pushDeg = res[i].deg; }); renderCmp(); r({ a: res[0].deg, b: res[1].deg, tA: res[0].tStop, tB: res[1].tStop }); }; });
  }
  function hitBoth() {
    st.lanes.forEach((ln) => { const im = A.impact(ln.N, 3); ln.hit = { im, ic: Math.max(1, im.hist.findIndex((p) => p[1] > 0)) }; ln.imp = null; });
    st.chartMax = niceMax(Math.max(...st.lanes.map((ln) => ln.hit.im.peak)));
    st.mode = 'hit'; st.t = 0;
    return new Promise((r) => { wait = () => { st.lanes.forEach((ln) => { ln.imp = ln.hit.im.peak; ln.link.set(0); }); renderCmp(); r({ a: st.lanes[0].imp, b: st.lanes[1].imp }); }; });
  }
  async function land() {
    const a = st.lanes[0], b = st.lanes[1];
    if (st.prev) setN(b, st.prev.N);
    const out = await hitBoth();
    st.prev = { N: a.N }; void out;
    return { N: a.N, torque: A.props(a.N).torque, peak: a.imp };
  }
  function setup(phase) {
    st.phase = phase; st.mode = 'idle'; wait = null;
    const [a, b] = st.lanes;
    if (phase === 'push') { setN(a, 6); setN(b, 100); a.link.set(-0.3); b.link.set(-0.3); }
    if (phase === 'hit') { if (a.N !== 6) setN(a, 6); if (b.N !== 100) setN(b, 100); }
    if (phase === 'knee') { st.prev = null; if (b.N !== 100 || b.imp == null) { setN(b, 100); } a.pushDeg = null; b.pushDeg = null; }
    if (phase === 'pull') { setN(a, 6); setN(b, 100); a.link.set(0); b.link.set(0); }
    syncSliders(); renderCmp(); dirty = true;
  }
  const api = {
    reset() { st.prev = null; setup('push'); },
    state() { return { reachedA: st.lanes[0].reached, reachedB: st.lanes[1].reached, mode: st.mode }; },
    pushBoth, hitBoth, land, setup,
  };
  const missions = [
    { short: 'Толчок', title: 'Толкни оба звена', controls: [],
      text: `Моторы выключены. Толкнём конец каждого звена рукой с одинаковым моментом, ${PUSH} Н·м.`,
      bet: { q: 'какое звено провернётся?', options: ['6 : 1', '100 : 1', 'Оба', 'Ни одно'], answer: (r) => (r.a > 1 && r.b > 1 ? 2 : r.a > 1 ? 0 : r.b > 1 ? 1 : 3) },
      action: { label: 'Толкнуть оба', run: (G) => G.pushBoth() },
      summary: (r) => `6 : 1 — ${fmt1(r.a, 0)}°, 100 : 1 — ${fmt1(r.b, 0)}°`,
      explain: (r) => `Звено 6 : 1 повернулось на <b>${fmt1(r.a, 0)}°</b> и за ${fmt1(r.tA || 0.3, 1)} с дошло до упора, а ротор мотора провернулся вслед за ним. ${r.b < 1 ? 'Звено 100 : 1 не сдвинулось.' : `Звено 100 : 1 повернулось всего на ${fmt1(r.b, 0)}°.`} Трение большого редуктора — ${fmt1(A.props(100).coul, 1)} Н·м на выходе — съедает весь толчок, а инерция ротора, пересчитанная на выход, в ${fmt1(A.props(100).refl / A.JL, 0)} раз больше инерции самого звена. Привод 6 : 1 <b>прозрачен</b>: внешнее усилие легко доходит до мотора. Верно и обратное: мотор «чувствует» контакт, поэтому силу можно оценивать по его току. А что будет, если звено на скорости ударится о стену?`,
      onEnter: (G) => G.setup('push') },
    { short: 'Удар', title: 'Ударь оба звена о стену', controls: [],
      text: 'Моторы разгоняют оба звена до одной скорости, 3 рад/с, и бьют о стену. Рядом с каждым суставом — график момента в первые 40 мс после касания, шкала у графиков общая.',
      bet: { q: 'где удар будет сильнее?', options: ['При 6 : 1', 'При 100 : 1', 'Одинаково'], answer: (r) => (r.b > r.a * 1.2 ? 1 : r.a > r.b * 1.2 ? 0 : 2) },
      action: { label: 'Ударить оба о стену', run: (G) => G.hitBoth() },
      summary: (r) => `пик: 6 : 1 — ${fmtN(r.a)} Н·м, 100 : 1 — ${fmtN(r.b)} Н·м`,
      explain: (r) => `Пик момента <b>${fmtN(r.a)} Н·м</b> при 6 : 1 и <b>${fmtN(r.b)} Н·м</b> при 100 : 1 — в ${fmt1(r.b / r.a, 1)} раза больше. При ударе приходится тормозить и звено, и ротор, а инерция ротора на выходе растёт как квадрат передаточного числа: у 100 : 1 она в ${fmtN(A.props(100).refl / A.props(6).refl)} раз больше, чем у 6 : 1. Поэтому шагающие роботы, которые бьются о землю на каждом шаге, выбирают малое передаточное число. Но при малом передаточном числе мало и момента. Можно ли получить и то и другое?`,
      onEnter: (G) => G.setup('hit') },
    { short: 'Колено', title: 'Подбери редуктор для колена', controls: ['nA'],
      text: `Колену прыгающего робота нужно не меньше ${KNEE.torque} Н·м на выходе, чтобы оттолкнуться, а удар при приземлении не должен превышать ${KNEE.peak} Н·м, иначе не выдержит редуктор. Мотор тот же. Подбирай передаточное число звена A ползунком под сценой, звено B показывает прошлую попытку.`,
      action: { label: 'Приземлиться', run: (G) => G.land() },
      criteria: [{ label: `Момент на выходе не меньше ${KNEE.torque} Н·м`, test: (r) => r.torque >= KNEE.torque }, { label: `Пик удара не больше ${KNEE.peak} Н·м`, test: (r) => r.peak <= KNEE.peak }],
      summary: (r) => `${ratioTxt(r.N)} · момент ${fmt1(r.torque, 1)} Н·м · удар ${fmtN(r.peak)} Н·м`,
      fail: (r) => (r.torque < KNEE.torque ? `При ${ratioTxt(r.N)} мотор выдаёт на выходе только ${fmt1(r.torque, 1)} Н·м: не оттолкнуться. Увеличь передаточное число.` : `Удар ${fmtN(r.peak)} Н·м — больше ${KNEE.peak}: редуктор не выдержит. Уменьши передаточное число.`),
      hint: 'Момент на выходе — 1,6 Н·м, умноженные на передаточное число. Удар растёт вместе с инерцией ротора на выходе, а она растёт как квадрат передаточного числа.',
      explain: () => 'Подходят только 12 : 1 и 15 : 1. При меньшем передаточном числе мотору не хватает момента, при большем растёт инерция ротора на выходе, а с ней удар при приземлении. Настоящие ноги решают ту же задачу с мотором помощнее, поэтому им хватает меньшего передаточного числа: у Mini Cheetah 6 : 1 и до 17 Н·м на выходе, у MIT Cheetah 3 — 7,67 : 1 и 230 Н·м. Осталось почувствовать прозрачность малого редуктора своей рукой.',
      onEnter: (G) => G.setup('knee') },
    { short: 'Прозрачность', title: 'Почувствуй прозрачность', controls: [],
      text: 'Моторы снова выключены. Возьми каждое звено за синий шарик на конце и доведи до пунктирной отметки. Звено тянется за курсором или пальцем как на пружине: чем дальше от шарика, тем больше сила.',
      criteria: [{ label: 'Звено 6 : 1 у отметки', test: (r, s) => s.reachedA }, { label: 'Звено 100 : 1 у отметки', test: (r, s) => s.reachedB }],
      hint: `Звено 100 : 1 стоит, пока усилие руки меньше трения редуктора, ${fmt1(A.props(100).coul, 1)} Н·м. Отведи палец за отметку и подожди: звено поползёт.`,
      explain: () => { const a = st.lanes[0].reachT, b = st.lanes[1].reachT; return `Звено 6 : 1 дошло до отметки за <b>${fmt1(a || 0, 1)} с</b>, а 100 : 1 — за <b>${fmt1(b || 0, 1)} с</b>. Звено 6 : 1 трогается с места уже от ${fmt1(A.props(6).coul, 2)} Н·м, а 100 : 1 — только от ${fmt1(A.props(100).coul, 1)} Н·м, и дальше его тормозят вязкое трение редуктора и инерция ротора на выходе: обе растут как квадрат передаточного числа. Это и есть прозрачность: через малый редуктор рука легко проворачивает мотор, а значит, и мотор «чувствует» руку. Прозрачный привод уступает толчку, а привод с большим редуктором держит позу жёстко и толчка почти не замечает.`; },
      onEnter: (G) => G.setup('pull') },
    { short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Меняй передаточное число каждого звена, толкай, бей о стену и тяни звенья за шарик. Сравни 1 : 1 и 160 : 1.',
      onEnter: (G) => G.setup('free') },
  ];
  function init() {
    [['#gearNA', 0], ['#gearNB', 1]].forEach(([sel, i]) => $(sel).addEventListener('input', (e) => { if (st.mode !== 'idle') { syncSliders(); return; } setN(st.lanes[i], RATIOS[+e.target.value]); syncSliders(); renderCmp(); dirty = true; }));
    $('#gearPush').addEventListener('click', () => { if (st.mode === 'idle') pushBoth(); });
    $('#gearHit').addEventListener('click', () => { if (st.mode === 'idle') hitBoth(); });
    const cv = $('#gearCv'), toG = (p) => ({ x: p.x / 1000 * G.W, y: p.y / 1000 * G.H });
    K.drag(cv, 1000, 1000, {
      hit: (p0) => {
        if (st.mode !== 'idle' || !(st.phase === 'pull' || st.phase === 'free')) return null;
        const p = toG(p0);
        for (const ln of st.lanes) { const th = ln.link.th, ex = G.PIVX + Math.cos(th) * G.LEN, ey = pivY(ln.i) + Math.sin(th) * G.LEN; if (Math.hypot(p.x - ex, p.y - ey) < 28) return ln; }
        return null;
      },
      start: (ln) => { ln.hand = 0; },
      move: (ln, p0) => { const p = toG(p0); ln.pull = Math.max(TH_MIN, Math.min(0, Math.atan2(p.y - pivY(ln.i), p.x - G.PIVX))); },
      end: (ln) => { ln.pull = null; ln.hand = 0; dirty = true; renderCmp(); },
    });
    K.loop(cv, (dt) => {
      if (st.mode === 'hit') { st.t += dt; dirty = true; if (st.t > HIT_T + 0.35) finish(); }
      else if (st.mode === 'push') { st.t += dt; st.lanes.forEach((ln) => ln.link.advance(dt, () => -PUSH)); dirty = true; if (st.t > 0.9) finish(); }
      let changed = false;
      for (const ln of st.lanes) {
        if (ln.pull == null) continue;
        ln.link.advance(dt, (th, w) => KH * (ln.pull - th) - DH * w);
        ln.hand = Math.abs(KH * (ln.pull - ln.link.th));
        if (!ln.reached) { ln.pullT += dt; if (ln.link.th <= TARGET + 0.05) { ln.reached = true; ln.reachT = ln.pullT; changed = true; } }
        dirty = true;
      }
      if (changed) { renderCmp(); if (ctl) ctl.update(); }
      if (dirty) draw();
    });
    App.on('theme', draw); App.on('resize', draw);
    syncSliders(); renderCmp();
    ctl = Missions.mount('#gearGuide', missions, api, { controls: { nA: '#gearNAWrap', nB: '#gearNBWrap', btns: '#gearBtnsWrap' } });
    draw();
  }
  return { init, api, st, get ctl() { return ctl; }, get G() { return G; }, pivY, TH_MIN, TARGET, RATIOS };
})();

/* ---------- 4. Какой привод куда: сортировка карточек ---------- */
const TypesSort = (() => {
  const targets = [
    { id: 'qdd', label: 'Квазипрямой', note: 'малое передаточное число' },
    { id: 'hd', label: 'Волновой редуктор', note: '30–160 : 1 в одной ступени' },
    { id: 'sea', label: 'Серийно-упругий', note: 'пружина перед нагрузкой' },
    { id: 'screw', label: 'Роликовый винт', note: 'линейное усилие' },
    { id: 'tendon', label: 'Тросы', note: 'мотор вдали от сустава' },
    { id: 'hyd', label: 'Гидравлика', note: 'жидкость под давлением' },
  ];
  const items = [
    { id: 'cheetah', label: 'Колено MIT Mini Cheetah, который делает сальто', target: 'qdd', why: 'Передаточное число 6:1: привод прозрачен, переносит удары и позволяет оценивать силу по току.' },
    { id: 'unitree', label: 'Серийный привод Unitree GO-M8010-6', target: 'qdd', why: '6,33:1, 23,7 Н·м и 530 г — тот же принцип в серийном приводе.' },
    { id: 'optrot', label: 'Вращательные суставы Tesla Optimus', target: 'hd', why: 'По данным Tesla AI Day 2022, во всех трёх типах вращательных приводов Optimus стоит волновой редуктор.' },
    { id: 'optlin', label: 'Линейный привод Optimus, который поднял рояль', target: 'screw', why: 'Три типа линейных приводов Optimus построены на планетарных роликовых винтах.' },
    { id: 'neo', label: 'Кисть домашнего гуманоида 1X NEO', target: 'tendon', why: 'У NEO тросовые приводы с малой инерцией и точностью момента 2%.' },
    { id: 'anymal', label: 'Ноги ANYmal', target: 'sea', why: 'Двенадцать серийно-упругих приводов: пружина защищает от ударов и помогает управлять силой.' },
    { id: 'starleth', label: 'Нога StarlETH с пружиной у сустава', target: 'sea', why: 'По расчёту Wensing и соавторов такая пружина снижает собственную частоту ноги примерно с 80 до 13,5 Гц: управление силой мягче, но медленнее.' },
    { id: 'atlas', label: 'Суставы Atlas до 2024 года', target: 'hyd', why: 'У старого Atlas было 28 гидравлических суставов. В апреле 2024 года его сменил электрический.' },
  ];
  let ctlCards = null;
  function init() {
    ctlCards = Cards.sort('#typesSort', {
      items, targets,
      after: 'Где удары и контакт — малое передаточное число или пружина. Где нужен большой момент в компактном корпусе — волновой редуктор. Где нужна большая линейная сила — винт. Где конечность должна быть лёгкой — тросы.',
    });
  }
  return { init, get ctl() { return ctlCards; }, items, targets };
})();

/* ---------- 6. Лестница частот: расставь по шкале, потом настоящая лестница ---------- */
const Ladder = (() => {
  const bins = [
    { id: 'b1', label: '1–10 Гц' }, { id: 'b2', label: '10–100 Гц' }, { id: 'b3', label: '100 Гц – 1 кГц' }, { id: 'b4', label: '1–10 кГц' }, { id: 'b5', label: 'больше 10 кГц' },
  ];
  const items = [
    { id: 's2', label: 'Медленная модель Figure Helix: зрение и язык', target: 'b1', why: 'Helix S2 — 7–9 Гц: она решает, что делать, а не как двигаться.' },
    { id: 'rt2', label: 'RT-2: модель зрения, языка и действий', target: 'b1', why: 'От 1 до 5 Гц: большая модель думает медленно.' },
    { id: 'cam', label: 'Камера робота', target: 'b2', why: 'Обычно 30 кадров в секунду, глубина RealSense D435i — до 90.' },
    { id: 'rl', label: 'RL-политика ходьбы Mini Cheetah', target: 'b2', why: '50 Гц: выдаёт 12 целевых углов, а держат их регуляторы ниже.' },
    { id: 's1', label: 'Быстрая политика Figure Helix', target: 'b3', why: 'Helix S1 — 200 Гц.' },
    { id: 'wbc', label: 'Контроллер всего тела Mini Cheetah', target: 'b3', why: '500 Гц: между MPC на 30–40 Гц и регуляторами суставов.' },
    { id: 'imu', label: 'Гироскоп IMU Bosch BMI088', target: 'b4', why: 'До 2 кГц.' },
    { id: 'ft', label: 'Датчик силы ATI Axia80', target: 'b4', why: '8 кГц с задержкой меньше 1 мс.' },
    { id: 'pd', label: 'ПД-регуляторы на драйверах Mini Cheetah', target: 'b5', why: 'До 40 кГц, прямо на плате мотора.' },
    { id: 'cur', label: 'Контур тока мотора MIT Cheetah 3', target: 'b5', why: '20 кГц: самый быстрый этаж.' },
  ];
  const L = [
    ['Контур тока мотора', 20000, 40000, 'cl', 'MIT Cheetah 3 — 20 кГц, Mini Cheetah — 40 кГц'],
    ['ПД-регулятор сустава', 1000, 40000, 'cl', 'Franka и Digit — 1 кГц, нога Cheetah 3 — 4,5 кГц, драйверы Mini Cheetah — 40 кГц'],
    ['Датчик силы и момента', 8000, 8000, 'sens', 'ATI Axia80 — 8 кГц'],
    ['IMU', 1600, 2000, 'sens', 'Bosch BMI088: акселерометр до 1,6 кГц, гироскоп до 2 кГц'],
    ['Нейросетевой контроллер тела', 1000, 1000, 'nn', 'Figure Helix 02, слой S0 — 1 кГц (2026)'],
    ['Контроллер всего тела', 400, 500, 'cl', 'Mini Cheetah — 500 Гц, ANYmal — 400 Гц'],
    ['RL-политика ходьбы', 50, 200, 'nn', 'обычно 50 Гц, ANYmal — 200 Гц'],
    ['Быстрая часть VLA', 30, 200, 'nn', 'Helix S1 — 200 Гц, GR00T N1 — 120 Гц, π0 — до 50 Гц, Atlas LBM — 30 Гц'],
    ['MPC', 20, 100, 'cl', 'Cheetah 3 — 20–50 Гц, ANYmal — 100 Гц'],
    ['Камеры', 30, 90, 'sens', 'обычно 30 кадров/с, глубина RealSense D435i — до 90'],
    ['Лидар', 10, 10, 'sens', 'Livox MID-360 — 10 Гц'],
    ['Медленная модель «зрение и язык»', 1, 10, 'nn', 'Helix S2 — 7–9 Гц, GR00T N1 — 10 Гц, RT-2 — от 1 до 5 Гц'],
  ];
  function drawLadder() {
    const hi = Math.log10(60000), pos = (f) => Math.log10(f) / hi * 100;
    const box = $('#ladderBox'); box.innerHTML = '';
    const axis = () => h('div', { class: 'lad-axis' }, ...[1, 10, 100, 1000, 10000].map((f) => h('span', { style: `left:${pos(f)}%` }, f >= 1000 ? `${f / 1000} кГц` : `${f} Гц`)));
    box.append(axis());
    L.forEach(([name, a, b, kind, ex]) => {
      const style = a === b ? `left:calc(${pos(a)}% - 5px);width:10px` : `left:${pos(a)}%;width:${pos(b) - pos(a)}%;min-width:10px`;
      box.append(h('div', { class: 'lad-row' }, h('span', { class: 'lad-name' }, name), h('span', { class: 'lad-track' }, h('i', { class: 'lad-bar ' + kind, style })), h('span', { class: 'lad-ex' }, ex)));
    });
    box.append(axis());
    box.append(h('div', { class: 'lad-legend' }, h('span', null, h('i', { class: 'lad-bar cl' }), 'классические регуляторы'), h('span', null, h('i', { class: 'lad-bar nn' }), 'нейросети'), h('span', null, h('i', { class: 'lad-bar sens' }), 'сенсоры')));
  }
  function reveal() { $('#ladderReveal').hidden = false; $('#ladderSkip').parentElement.hidden = true; }
  let ctlCards = null;
  function init() {
    drawLadder();
    $('#ladderSort').classList.add('scale-sort');
    ctlCards = Cards.sort('#ladderSort', {
      items, targets: bins, checkLabel: 'Проверить и открыть лестницу',
      after: 'Медленнее всех думает большая модель, быстрее всех работает контур тока. Нейросети обычно живут на этажах от 1 до 200 Гц, а всё, что быстрее, держат классические регуляторы и сенсоры. Исключение появилось в 2026 году: у Figure Helix 02 нейросеть работает и на 1 кГц.',
      onCheck: () => reveal(),
    });
    $('#ladderSkip').addEventListener('click', reveal);
  }
  return { init, get ctl() { return ctlCards; }, items, bins };
})();

/* ---------- 5. IMU: три оценки наклона на одной сцене ---------- */
const ImuLab = (() => {
  const K = HeroKit, I = ImuK, N = I.N;
  /** Две раскладки: широкая — корпус слева, график справа; узкая (телефон) — корпус сверху, график под ним. */
  const WIDE = { W: 640, H: 270, GX0: 226, GX1: 628, GT: 22, GB: 234, bx: 104, by: 226, ts: 1, clip: [0, 0, 204, 270], g0: 18, g1: 190 };
  const NARROW = { W: 360, H: 440, GX0: 44, GX1: 350, GT: 214, GB: 410, bx: 180, by: 176, ts: 0.84, clip: [0, 0, 360, 196], g0: 96, g1: 264 };
  let G = WIDE;
  function layout() { const cv = $('#imuCv'), w = cv.parentElement.getBoundingClientRect().width; G = w && w < 520 ? NARROW : WIDE; cv.style.aspectRatio = `${G.W} / ${G.H}`; }
  const ALPHAS = [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.96, 0.97, 0.98, 0.99, 0.995, 1];
  const BIASES = Array.from({ length: 13 }, (_, i) => i * 0.25);
  const st = { alpha: 0.5, bias: 1.5, shake: 0, run: null, prog: 1, cur: N - 1, busy: false };
  let ctl = null, dirty = true, anim = null;
  const gx = (i) => G.GX0 + i / (N - 1) * (G.GX1 - G.GX0), gy = (v) => (G.GT + G.GB) / 2 - Math.max(-42, Math.min(42, v)) / 40 * ((G.GB - G.GT) / 2 - 6);
  const cols = () => { const P = pal2(); return { truth: P.ink, gyro: P.hy, acc: P.ink3, filt: P.cl }; };
  function recompute() { st.run = I.run({ alpha: st.alpha, bias: st.bias, shake: st.shake }); }
  const alphaTxt = (a) => fmt1(a, a === 0.995 ? 3 : 2);
  function syncAlpha() { const inp = $('#imuAlpha'); inp.value = ALPHAS.indexOf(st.alpha); rangeOut(inp, alphaTxt(st.alpha)); }
  function syncBias() { const inp = $('#imuBias'); inp.value = BIASES.indexOf(st.bias); rangeOut(inp, `${fmt1(st.bias, 2)} °/с`); }
  function shaking(i) { if (!st.shake) return 0; for (const s of I.shakes(st.shake)) if (i >= s.at && i < s.at + s.len) return Math.sin(Math.PI * (i - s.at) / s.len) * Math.sign(s.amp); return 0; }
  function draw() {
    dirty = false; layout();
    const W = G.W, H = G.H, GX0 = G.GX0, GX1 = G.GX1, GT = G.GT, GB = G.GB;
    const { c, k } = K.fit($('#imuCv'), W, H), P = pal2(), C = cols(), r = st.run, upto = r ? Math.max(1, Math.floor((N - 1) * st.prog)) : 0, ci = Math.max(0, Math.min(st.cur, upto));
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    // корпус робота и где его видит каждая оценка
    const bx = G.bx, by = G.by, jit = r ? shaking(ci) * 7 : 0, truthDeg = I.truth[r ? ci : 0];
    c.save(); c.beginPath(); c.rect(...G.clip); c.clip();
    c.strokeStyle = P.ink3; c.lineWidth = 1.5; c.beginPath(); c.moveTo(G.g0, by + 6); c.lineTo(G.g1, by + 6); c.stroke();
    c.beginPath(); c.rect(G.g0, by + 6, G.g1 - G.g0, 12); K.hatch(c, G.g0, by + 6, G.g1, by + 18, P.ink3, 6, 1);
    c.save(); c.translate(bx + jit, by); c.scale(G.ts, G.ts); c.rotate(truthDeg * Math.PI / 180);
    c.fillStyle = P.surf; c.strokeStyle = P.ink; c.lineWidth = 2;
    c.beginPath(); c.roundRect ? c.roundRect(-24, -128, 48, 104, 14) : c.rect(-24, -128, 48, 104); c.fill(); c.stroke();
    c.beginPath(); c.roundRect ? c.roundRect(-18, -170, 36, 34, 10) : c.rect(-18, -170, 36, 34); c.fill(); c.stroke();
    c.fillStyle = P.e2e; c.beginPath(); c.arc(-7, -153, 3, 0, 7); c.arc(7, -153, 3, 0, 7); c.fill();
    c.fillStyle = P.ink2; c.beginPath(); c.roundRect ? c.roundRect(-9, -84, 18, 14, 3) : c.rect(-9, -84, 18, 14); c.fill();
    c.strokeStyle = P.ink; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-12, -22); c.lineTo(-14, 0); c.moveTo(12, -22); c.lineTo(14, 0); c.stroke();
    c.restore();
    if (r) {
      const len = 182 * G.ts;
      [['acc', r.ea], ['gyro', r.eg], ['filt', r.ef]].forEach(([key, e]) => {
        const a = e[ci] * Math.PI / 180, ex = bx + jit + Math.sin(a) * len, ey = by - Math.cos(a) * len; c.strokeStyle = C[key]; c.lineWidth = key === 'acc' ? 2 : 3; c.setLineDash(key === 'acc' ? [5, 4] : []);
        c.beginPath(); c.moveTo(bx + jit, by); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(ex, ey, 4, 0, 7); c.fillStyle = C[key]; c.fill();
      });
    }
    c.restore();
    // график
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [-30, -15, 0, 15, 30]) { c.beginPath(); c.moveTo(GX0, gy(v)); c.lineTo(GX1, gy(v)); c.stroke(); K.label(c, k, `${v}°`, GX0 - 6, gy(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let s = 0; s <= 10; s += 2) K.label(c, k, `${s} с`, gx(s / 10 * (N - 1)), H - 11, { px: 10.5, mono: true, color: P.ink3, halo: false, align: s === 10 ? 'right' : 'center' });
    const line = (arr, col, lw, n, dash) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); for (let i = 0; i < n; i++) { i ? c.lineTo(gx(i), gy(arr[i])) : c.moveTo(gx(i), gy(arr[i])); } c.stroke(); c.setLineDash([]); };
    line(I.truth, C.truth, 2.4, N);
    if (r) {
      line(r.ea, C.acc, 1.1, upto + 1); line(r.eg, C.gyro, 2, upto + 1); line(r.ef, C.filt, 2.4, upto + 1);
      c.strokeStyle = P.ink2; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(gx(ci), GT); c.lineTo(gx(ci), GB); c.stroke(); c.setLineDash([]);
      [['truth', I.truth], ['acc', r.ea], ['gyro', r.eg], ['filt', r.ef]].forEach(([key, e]) => { c.beginPath(); c.arc(gx(ci), gy(e[ci]), 3.6, 0, 7); c.fillStyle = C[key]; c.fill(); });
    }
    readout(ci);
  }
  function readout(ci) {
    const r = st.run;
    if (!r) { $('#imuRead').innerHTML = 'Пока на графике только настоящий наклон корпуса.'; legend('#imuLegend', [['настоящий наклон', 'var(--ink)']]); return; }
    const d = (e) => `${fmt1(e[ci], 1)}°`;
    $('#imuRead').innerHTML = `<b>${fmt1(ci * I.DT, 1)} с</b> · наклон ${d(I.truth)} · <span class="ir-g">гироскоп ${d(r.eg)}</span> · <span class="ir-a">акселерометр ${d(r.ea)}</span> · <span class="ir-f">фильтр ${d(r.ef)}</span>`;
    legend('#imuLegend', [['настоящий наклон', 'var(--ink)'], [`только гироскоп: средняя ошибка ${fmt1(r.gyro.rmse, 1)}°`, 'var(--hybrid)'], [`только акселерометр: ${fmt1(r.acc.rmse, 1)}°`, 'var(--ink-3)', true], [`фильтр, α = ${alphaTxt(st.alpha)}: ${fmt1(r.filt.rmse, 1)}°`, 'var(--classic)']]);
  }
  function play(ms) {
    st.busy = true; st.prog = 0; st.cur = N - 1; const t0 = performance.now();
    return new Promise((res) => { anim = (now) => { st.prog = Math.min(1, Math.max(0, now - t0) / ms); st.cur = Math.floor((N - 1) * st.prog); if (st.prog >= 1) { anim = null; st.busy = false; res(); } }; });
  }
  const touch = () => { dirty = true; if (ctl) ctl.update(); };
  async function runAll() {
    st.shake = 0; recompute(); await play(3600); const r = st.run;
    return { gyroEnd: r.gyro.end, accEnd: r.acc.end, filtEnd: r.filt.end, gyro: r.gyro.rmse, acc: r.acc.rmse, filt: r.filt.rmse, alpha: st.alpha };
  }
  async function shake() {
    const before = I.run({ alpha: st.alpha, bias: st.bias, shake: 0 });
    st.shake = Math.min(3, st.shake + 1); recompute(); await play(3000); const r = st.run;
    return { level: st.shake, bursts: I.shakes(st.shake).length, acc: r.acc.rmse, filt: r.filt.rmse, gyro: r.gyro.rmse, acc0: before.acc.rmse, filt0: before.filt.rmse, gyro0: before.gyro.rmse, alpha: st.alpha };
  }
  function setup(phase) {
    anim = null; st.busy = false;
    if (phase === 'm1') { st.alpha = 0.5; st.bias = 1.5; st.shake = 0; st.run = null; st.prog = 1; }
    if (phase === 'm2') { st.shake = 0; recompute(); st.prog = 1; st.cur = N - 1; }
    if (phase === 'm3') { st.shake = 0; recompute(); st.prog = 1; st.cur = N - 1; }
    if (phase === 'free' && !st.run) { recompute(); st.prog = 1; }
    syncAlpha(); syncBias(); dirty = true;
  }
  const api = {
    reset() { setup('m1'); },
    state() { return { filt: st.run ? st.run.filt.rmse : 99, alpha: st.alpha, shake: st.shake }; },
    runAll, shake, setup,
  };
  const who = (r) => [r.gyroEnd, r.accEnd, r.filtEnd].indexOf(Math.max(r.gyroEnd, r.accEnd, r.filtEnd));
  const missions = [
    { short: 'Дрейф', title: 'Кто уйдёт дальше', controls: [],
      text: 'Все три оценки стартуют из одного угла и идут 10 секунд. Фильтр пока смешивает датчики поровну: α&nbsp;=&nbsp;0,5. После запуска можно посмотреть любой момент: перетащи пунктирную линию или нажми на график.',
      bet: { q: 'кто через 10 секунд окажется дальше всех от настоящего угла?', options: ['Только гироскоп', 'Только акселерометр', 'Фильтр'], answer: (r) => who(r) },
      action: { label: 'Запустить 10 секунд', run: (M) => M.runAll() },
      summary: (r) => `через 10 с: гироскоп ${fmt1(r.gyroEnd, 0)}°, акселерометр ${fmt1(r.accEnd, 1)}°, фильтр ${fmt1(r.filtEnd, 1)}°`,
      explain: (r) => `Через 10 секунд гироскоп ушёл от настоящего угла на <b>${fmt1(r.gyroEnd, 0)}°</b>. Смещение нуля всего 1,5 °/с, но при сложении шаг за шагом оно копится без остановки. Это дрейф. Акселерометр не дрейфует, но в среднем ошибается на <b>${fmt1(r.acc, 1)}°</b>: шум и толчки корпуса. Фильтр при α&nbsp;=&nbsp;0,5 ошибается в среднем на ${fmt1(r.filt, 1)}° — лучше обоих датчиков, но он пока слишком доверяет шумному акселерометру. Сколько доверия дать каждому датчику?`,
      onEnter: (M) => M.setup('m1') },
    { short: 'Подбери α', title: 'Подбери долю гироскопа', controls: ['alpha'],
      text: 'На каждом шаге фильтр сдвигает оценку по гироскопу и немного подтягивает её к углу из акселерометра. Доля гироскопа — α, остальное берётся у акселерометра. Двигай ползунок и найди α, при котором средняя ошибка фильтра меньше 1,6°.',
      criteria: [{ label: 'Средняя ошибка фильтра меньше 1,6°', test: (r, s) => s.filt < 1.6 }],
      hint: 'Гироскопу стоит верить почти полностью, но не до конца: при α&nbsp;=&nbsp;1 вернётся дрейф. Пробуй значения от 0,95 до 0,99.',
      explain: (r) => `При α&nbsp;=&nbsp;${alphaTxt(r.alpha)} средняя ошибка <b>${fmt1(r.filt, 1)}°</b>. Быстрые движения фильтр берёт у гироскопа, а медленное «где низ» — у акселерометра, поэтому дрейф не копится, а шум сглаживается. Это комплементарный фильтр. При α&nbsp;=&nbsp;0,98 и шаге 10 мс он подтягивается к акселерометру примерно за полсекунды. Его оптимальная версия — фильтр Калмана, о нём урок 0.4. А если робота начнут толкать?`,
      onEnter: (M) => M.setup('m2') },
    { short: 'Тряска', title: 'Встряхни робота', controls: ['alpha'],
      text: 'Робота толкают в бок: появляются короткие рывки. Каждое нажатие добавляет четыре рывка, всего можно три раза. Задача — чтобы фильтр и при тряске ошибался в среднем меньше чем на 2°.',
      bet: { q: 'чья оценка пострадает от рывков сильнее всего?', options: ['Гироскоп', 'Акселерометр', 'Фильтр'], answer: (r) => { const d = [r.gyro - r.gyro0, r.acc - r.acc0, r.filt - r.filt0]; return d.indexOf(Math.max(...d)); } },
      action: { label: 'Встряхнуть робота', run: (M) => M.shake() },
      criteria: [{ label: 'Фильтр при тряске ошибается меньше 2°', test: (r) => r.filt < 2 }],
      summary: (r) => `рывков ${r.bursts} · акселерометр ${fmt1(r.acc, 1)}° · фильтр ${fmt1(r.filt, 1)}° при α = ${alphaTxt(r.alpha)}`,
      fail: (r) => `Фильтр ошибается на ${fmt1(r.filt, 1)}°. Проверь α: при тряске акселерометру стоит верить меньше.`,
      explain: (r) => `Рывки подняли среднюю ошибку акселерометра с ${fmt1(r.acc0, 1)}° до <b>${fmt1(r.acc, 1)}°</b>, а фильтр почти не заметил их: <b>${fmt1(r.filt, 1)}°</b>. Гироскоп рывков не видит вовсе: он меряет вращение, а не ускорение. Фильтр берёт у акселерометра только медленную составляющую, поэтому короткие рывки через него почти не проходят. Нажми ещё раз — рывков станет больше.`,
      onEnter: (M) => M.setup('m3') },
    { short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Меняй α, тряси робота и меняй смещение нуля гироскопа. Посмотри, как при большом смещении лучшее α сдвигается вниз: дрейф копится быстрее, и акселерометру приходится верить больше.',
      onEnter: (M) => M.setup('free') },
  ];
  function init() {
    $('#imuAlpha').addEventListener('input', (e) => { if (st.busy) { syncAlpha(); return; } st.alpha = ALPHAS[+e.target.value]; rangeOut(e.target, alphaTxt(st.alpha)); recompute(); st.prog = 1; touch(); });
    $('#imuBias').addEventListener('input', (e) => { if (st.busy) { syncBias(); return; } st.bias = BIASES[+e.target.value]; rangeOut(e.target, `${fmt1(st.bias, 2)} °/с`); recompute(); st.prog = 1; touch(); });
    $('#imuShake').addEventListener('click', () => { if (!st.busy) shake().then(() => touch()); });
    $('#imuCalm').addEventListener('click', () => { if (st.busy) return; st.shake = 0; recompute(); st.prog = 1; touch(); });
    const cv = $('#imuCv'), toG = (p) => ({ x: p.x / 1000 * G.W, y: p.y / 1000 * G.H }), toIdx = (x) => Math.max(0, Math.min(N - 1, Math.round((x - G.GX0) / (G.GX1 - G.GX0) * (N - 1))));
    K.drag(cv, 1000, 1000, {
      hit: (p0) => { const p = toG(p0); return !st.busy && st.run && Math.abs(p.x - gx(st.cur)) < 18 && p.y > G.GT - 10 && p.y < G.GB + 10 ? 'cur' : null; },
      move: (o, p0) => { st.cur = toIdx(toG(p0).x); dirty = true; },
      tap: (p0) => { const p = toG(p0); if (!st.busy && st.run && p.x >= G.GX0 - 4 && p.x <= G.GX1 + 4 && p.y > G.GT - 10 && p.y < G.GB + 14) { st.cur = toIdx(p.x); dirty = true; } },
    });
    K.loop(cv, (dt, now) => { if (anim) { anim(now); dirty = true; } if (dirty) draw(); });
    App.on('theme', draw); App.on('resize', draw);
    syncAlpha(); syncBias();
    ctl = Missions.mount('#imuGuide', missions, api, { controls: { alpha: '#imuAlphaWrap', shake: '#imuShakeWrap', bias: '#imuBiasWrap' } });
    draw();
  }
  return { init, api, st, get ctl() { return ctl; }, ALPHAS };
})();

/* ---------- 7. Лаборатория «Модель привода по данным» ---------- */
const ActLab = (() => {
  const K = HeroKit, A = Act, LW = 300, LH = 120, CW = 300, CHH = 150;
  /** Раскладки главного графика: широкая и узкая (телефон, повыше, чтобы подписи не налезали). */
  const WIDE = { W: 560, H: 280, X0: 44, yc: 86, ys: 76, eb: 252, eh: 75 }, NARROW = { W: 360, H: 330, X0: 40, yc: 100, ys: 84, eb: 296, eh: 78 };
  let G = WIDE;
  function layout() { const cv = $('#actCv'), w = cv.parentElement.getBoundingClientRect().width; G = w && w < 520 ? NARROW : WIDE; cv.style.aspectRatio = `${G.W} / ${G.H}`; }
  const DATA = [2, 5, 10, 20], BL = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], CMD_KEYS = ['slow', 'mix', 'fast', 'steps'];
  const deg = (v) => v * 180 / Math.PI;
  const st = { cmd: 'mix', pending: 'mix', dataT: 2, delay: 6, bl: 0, real: null, sim: null, net: null, errSim: 0, errNet: null, model: null, healthy: null, loss: [], prog: 0, training: false, curve: {}, phase: 'm1', drawP: 1, note: '' };
  const cache = {};
  let ctl = null, dirty = true, anim = null;
  const opts = () => ({ delay: st.delay, backlash: BL[st.bl] * Math.PI / 180 });
  const cmdF = () => CMDS[st.cmd].f;
  const tracks = (f, o) => { const real = A.track(A.makeReal(o), 5, f), sim = A.track(A.makeSim(), 5, f); return { real, sim, err: deg(A.rmse(real, sim)) }; };
  function refresh() {
    const t = tracks(cmdF(), opts()); st.real = t.real; st.sim = t.sim; st.errSim = t.err;
    if (st.model) { st.net = A.track(A.makeSim(A.netTau(st.model)), 5, cmdF()); st.errNet = deg(A.rmse(st.real, st.net)); } else { st.net = null; st.errNet = null; }
    dirty = true;
  }
  function showLegend() {
    const it = [['команда', 'var(--ink-3)', true], [`настоящий привод: задержка ${fmtS(st.delay * 2.5)} мс, люфт ${fmtS(BL[st.bl])}°`, 'var(--ink)'], [`модель из симулятора: ошибка ${fmt1(st.errSim, 1)}°`, 'var(--classic)']];
    if (st.net) it.push([`модель по данным: ошибка ${fmt1(st.errNet, 1)}°`, 'var(--e2e)']);
    legend('#actLegend', it);
  }
  function draw() {
    dirty = false; showLegend(); layout();
    const W = G.W, H = G.H, { c, k } = K.fit($('#actCv'), W, H), P = pal2();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const X0 = G.X0, X1 = W - 12, x = (t) => X0 + t / 5 * (X1 - X0), y = (v) => G.yc - v * G.ys;
    const n = st.real ? Math.max(2, Math.floor(st.real.length * st.drawP)) : 0;
    let emax = 0; if (st.real) for (let i = 0; i < st.real.length; i++) { emax = Math.max(emax, Math.abs(deg(st.sim[i][2] - st.real[i][2]))); if (st.net) emax = Math.max(emax, Math.abs(deg(st.net[i][2] - st.real[i][2]))); }
    const top = emax > 10 ? (emax > 20 ? 30 : 20) : 10, ye = (e) => G.eb - Math.min(top, e) / top * G.eh;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const d of [-30, 0, 30]) { const yy = y(d * Math.PI / 180); c.beginPath(); c.moveTo(X0, yy); c.lineTo(X1, yy); c.stroke(); K.label(c, k, `${d}°`, X0 - 6, yy, { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (const e of [0, top / 2, top]) { const yy = ye(e); c.beginPath(); c.moveTo(X0, yy); c.lineTo(X1, yy); c.stroke(); K.label(c, k, `${e}°`, X0 - 6, yy, { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let s = 0; s <= 5; s++) K.label(c, k, `${s} с`, x(s), H - 10, { px: 10.5, mono: true, color: P.ink3, halo: false, align: s === 5 ? 'right' : s === 0 ? 'left' : 'center' });
    K.label(c, k, 'ошибка модели', X0 + 6, ye(top) - 9, { align: 'left', px: 10.5, color: P.ink3, haloColor: P.bg });
    if (!st.real) return;
    const line = (pts, idx, col, lw, dash) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); for (let i = 0; i < n; i++) { const p = pts[i]; i ? c.lineTo(x(p[0]), y(p[idx])) : c.moveTo(x(p[0]), y(p[idx])); } c.stroke(); c.setLineDash([]); };
    line(st.real, 1, P.ink3, 1.4, [4, 4]); line(st.sim, 2, P.cl, 2); if (st.net) line(st.net, 2, P.e2e, 2.2); line(st.real, 2, P.ink, 1.6);
    const err = (pts, col) => { c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); for (let i = 0; i < n; i++) { const yy = ye(Math.abs(deg(pts[i][2] - st.real[i][2]))); i ? c.lineTo(x(pts[i][0]), yy) : c.moveTo(x(pts[i][0]), yy); } c.stroke(); };
    err(st.sim, P.cl); if (st.net) err(st.net, P.e2e);
  }
  function drawLoss() {
    const { c, k } = K.fit($('#actLoss'), LW, LH), P = pal2();
    c.fillStyle = P.bg; c.fillRect(0, 0, LW, LH);
    const X0 = 40, X1 = LW - 10, Y0 = 12, Y1 = LH - 22, lo = -4, hi = 0, ly = (v) => Y0 + (hi - Math.log10(Math.max(1e-4, v))) / (hi - lo) * (Y1 - Y0);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const e of [0, -2, -4]) { const yy = ly(Math.pow(10, e)); c.beginPath(); c.moveTo(X0, yy); c.lineTo(X1, yy); c.stroke(); K.label(c, k, e === 0 ? '1' : `10${e === -2 ? '⁻²' : '⁻⁴'}`, X0 - 5, yy, { align: 'right', px: 10, mono: true, color: P.ink3, halo: false }); }
    K.label(c, k, '0', X0, LH - 9, { align: 'left', px: 10, mono: true, color: P.ink3, halo: false }); K.label(c, k, '1500 итераций', X1, LH - 9, { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
    if (st.loss.length > 1) { c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath(); st.loss.forEach((v, i) => { const xx = X0 + (i * 10) / 1499 * (X1 - X0); i ? c.lineTo(xx, ly(v)) : c.moveTo(xx, ly(v)); }); c.stroke(); }
    $('#actProg').style.width = (st.prog * 100).toFixed(1) + '%';
    $('#actLossNote').textContent = st.note;
  }
  function drawCurve() {
    const { c, k } = K.fit($('#actCurve'), CW, CHH), P = pal2();
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CHH);
    const X0 = 40, X1 = CW - 16, Y0 = 14, Y1 = CHH - 24, vals = Object.values(st.curve), top = Math.max(2, Math.ceil(Math.max(0, ...vals) * 1.25)), cy = (v) => Y1 - Math.min(top, v) / top * (Y1 - Y0), cx = (i) => X0 + 12 + i / (DATA.length - 1) * (X1 - X0 - 24);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [0, top / 2, top]) { c.beginPath(); c.moveTo(X0, cy(v)); c.lineTo(X1, cy(v)); c.stroke(); K.label(c, k, `${fmt1(v, 1)}°`, X0 - 5, cy(v), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false }); }
    c.setLineDash([5, 4]); c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X0, cy(1)); c.lineTo(X1, cy(1)); c.stroke(); c.setLineDash([]);
    K.label(c, k, 'цель', X1, cy(1) - 9, { align: 'right', px: 10, color: P.good, haloColor: P.bg });
    DATA.forEach((T, i) => K.label(c, k, `${T} с`, cx(i), CHH - 10, { px: 10.5, mono: true, color: st.dataT === T ? P.ink : P.ink3, weight: st.dataT === T ? 700 : 600, halo: false }));
    const pts = DATA.map((T, i) => (st.curve[T] != null ? [cx(i), cy(st.curve[T]), st.curve[T]] : null)).filter(Boolean);
    if (pts.length > 1) { c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
    pts.forEach((p) => { c.beginPath(); c.arc(p[0], p[1], 5, 0, 7); c.fillStyle = p[2] < 1 ? P.good : P.e2e; c.fill(); K.label(c, k, `${fmt1(p[2], 1)}°`, p[0], p[1] - 13, { px: 10.5, mono: true, weight: 700, color: P.ink, haloColor: P.bg }); });
    $('#actCurveNote').textContent = pts.length ? 'Каждая точка — отдельное обучение с нуля на исправном приводе.' : 'Точек пока нет: выбери объём данных и обучи сеть.';
  }
  const drawAll = () => { draw(); drawLoss(); drawCurve(); };
  function playDraw(ms) { st.drawP = 0; const t0 = performance.now(); return new Promise((res) => { anim = (now) => { st.drawP = Math.min(1, Math.max(0, now - t0) / ms); if (st.drawP >= 1) { anim = null; res(); } }; }); }
  function apply(key) { st.cmd = key; st.pending = key; segSet($('#actCmdWrap'), key); refresh(); }
  async function send() { apply(st.pending); await playDraw(900); return { cmd: st.cmd, label: CMDS[st.cmd].label, err: st.errSim }; }
  const keyOf = (T, o) => `${T}|${o.delay}|${o.backlash.toFixed(4)}`;
  /** Обучение сети вживую: прогресс, ошибка на обучении и то, как сеть повторяет привод по ходу дела. */
  async function train(T, o) {
    const key = keyOf(T, o); st.training = true; st.loss = []; st.prog = 0;
    let rec = cache[key];
    if (rec) { // то же обучение уже было: результат детерминирован, просто проигрываем его быстро
      const t0 = performance.now(); st.note = `${T} с данных · ${fmtN(rec.n)} примеров · уже обучали, повтор`;
      await new Promise((res) => { anim = (now) => { const u = Math.min(1, Math.max(0, now - t0) / 450); st.prog = u; st.loss = rec.loss.slice(0, Math.max(2, Math.floor(rec.loss.length * u))); if (u >= 1) { anim = null; res(); } }; });
    } else {
      const data = A.collect(T, 4, o), m = A.mlp(2), loss = []; let last = -1;
      st.note = `${T} с данных · ${fmtN(data.X.length)} примеров`;
      await runChunked(A.trainGen(m, data, 1500), (e) => {
        loss.push(e.loss); st.loss = loss; st.prog = e.it / 1499;
        if (e.it - last >= 150 || e.it === 1499) { last = e.it; st.model = m; st.net = A.track(A.makeSim(A.netTau(m)), 5, cmdF()); st.errNet = deg(A.rmse(st.real, st.net)); dirty = true; }
        st.note = `${T} с данных · ${fmtN(data.X.length)} примеров · итерация ${e.it + 1} из 1500`;
      }, 14);
      rec = cache[key] = { m, n: data.X.length, loss: loss.slice() };
    }
    st.model = rec.m; st.training = false; st.prog = 1; refresh();
    return { T, n: rec.n, err: st.errNet, sim: st.errSim, model: rec.m };
  }
  const isMin = (T) => { const i = DATA.indexOf(T); if (i < 0 || st.curve[T] == null || st.curve[T] >= 1) return false; return i === 0 || (st.curve[DATA[i - 1]] != null && st.curve[DATA[i - 1]] >= 1); };
  const busy = () => st.training || !!anim;
  function setup(phase) {
    st.phase = phase; anim = null; st.drawP = 1;
    if (phase === 'm1') { st.delay = 6; st.bl = 0; st.model = null; apply('mix'); }
    if (phase === 'm2' || phase === 'm3') { st.delay = 6; st.bl = 0; apply('mix'); }
    if (phase === 'm3') { segSet($('#actDataWrap'), st.dataT); }
    if (phase === 'm4') { st.cmd = 'mix'; if (st.healthy) st.model = st.healthy; refresh(); }
    if (phase === 'm5') { refresh(); }
    syncSliders(); dirty = true;
  }
  function syncSliders() {
    const d = $('#actDelay'), b = $('#actBl'); d.value = st.delay; rangeOut(d, `${fmtS(st.delay * 2.5)} мс`); b.value = st.bl; rangeOut(b, `${fmtS(BL[st.bl])}°`);
    segSet($('#actDataWrap'), st.dataT); segSet($('#actCmdWrap'), st.pending);
  }
  const api = {
    reset() { st.curve = {}; st.loss = []; st.prog = 0; st.note = ''; st.healthy = null; st.dataT = 2; setup('m1'); },
    state() { return { errSim: st.errSim, errNet: st.errNet, delayMs: st.delay * 2.5, bl: BL[st.bl], curve: Object.assign({}, st.curve) }; },
    send,
    async learn() { const r = await train(20, opts()); st.healthy = r.model; st.curve[20] = r.err; return r; },
    async learnT() { const r = await train(st.dataT, { delay: 6, backlash: 0 }); st.curve[st.dataT] = r.err; if (st.dataT === 20) st.healthy = r.model; return r; },
    async retrain() { const old = st.errNet, sim = st.errSim; const r = await train(20, opts()); return { simErr: sim, oldErr: old, newErr: r.err, delayMs: st.delay * 2.5, bl: BL[st.bl] }; },
    setup, apply,
  };
  const cmdIdx = (k) => CMD_KEYS.indexOf(k);
  const worst = () => { let best = null; for (const k of CMD_KEYS) { const e = tracks(CMDS[k].f, { delay: 6, backlash: 0 }).err; if (!best || e > best[1]) best = [k, e]; } return best[0]; };
  const missions = [
    { short: 'Найди разрыв', title: 'Найди, где симулятор врёт', controls: ['cmd'],
      text: 'Одна и та же команда уходит двум приводам: идеальному из симулятора и «настоящему» с задержкой 15 мс, трением и насыщением момента. Выбери команду под графиком и подай её. Найди такую, на которой они разойдутся в среднем больше чем на 5°.',
      bet: { q: 'на какой команде разрыв будет больше всего?', options: CMD_KEYS.map((k) => CMDS[k].label), answer: () => cmdIdx(worst()) },
      action: { label: 'Подать команду', run: (M) => M.send() },
      criteria: [{ label: 'Средний разрыв больше 5°', test: (r) => r.err > 5 }],
      summary: (r) => `${r.label}: ${fmt1(r.err, 1)}°`,
      fail: (r) => `Разрыв ${fmt1(r.err, 1)}°. Ищи команду, на которой привод чаще и резче меняет направление.`,
      hint: 'Задержка 15 мс почти не мешает, пока команда меняется медленно. Смотри на нижний график: ошибка растёт на разворотах.',
      explain: (r) => `На команде «${r.label}» средний разрыв <b>${fmt1(r.err, 1)}°</b>, на медленной — ${fmt1(tracks(CMDS.slow.f, { delay: 6, backlash: 0 }).err, 1)}°. Пока команда меняется медленно, задержка 15 мс почти незаметна. На быстрых разворотах привод не успевает и упирается в трение и насыщение момента. Политика, отлаженная на идеальном приводе, на быстрых движениях получит совсем другой отклик. Как сделать привод в симуляторе похожим на настоящий?`,
      onEnter: (M) => M.setup('m1') },
    { short: 'Обучи сеть', title: 'Обучи модель привода', controls: ['loss'],
      text: 'Вернёмся к команде «Две частоты»: здесь симулятор ошибается в среднем на 3,8°. Погоняем настоящий привод 20 секунд на случайных командах, запишем, какой момент он на самом деле выдаёт, и обучим маленькую сеть его повторять. Потом поставим сеть в симулятор вместо идеальной модели.',
      bet: { q: 'во сколько раз модель по данным окажется точнее идеальной?', options: ['Почти так же', 'Примерно вдвое', 'В пять раз и больше'], answer: (r) => (r.sim / r.err >= 5 ? 2 : r.sim / r.err >= 1.6 ? 1 : 0) },
      action: { label: 'Собрать данные и обучить', run: (M) => M.learn() },
      criteria: [{ label: 'Модель по данным ошибается меньше чем на 1°', test: (r) => r.err < 1 }],
      summary: (r) => `20 с данных · ${fmtN(r.n)} примеров · ${fmt1(r.err, 1)}°`,
      explain: (r) => `Сеть обучилась на ${fmtN(r.n)} примерах и повторяет привод с ошибкой <b>${fmt1(r.err, 1)}°</b> против ${fmt1(r.sim, 1)}° у идеальной модели — в ${fmt1(r.sim / r.err, 0)} раз точнее. Так в 2019 году научили бегать ANYmal: модель привода выучили по данным, политику обучили в симуляторе с этой моделью, и она заработала на железе без дообучения. А сколько данных нужно такой модели?`,
      onEnter: (M) => M.setup('m2') },
    { short: 'Сколько данных', title: 'Найди минимум данных', controls: ['data', 'loss', 'curve'],
      text: '20 секунд — это 8 тысяч примеров. Проверим, сколько нужно на самом деле. Выбирай объём данных под графиком и обучай сеть с нуля: каждая попытка добавит точку на кривую. Найди наименьший объём из списка, при котором ошибка меньше 1°.',
      action: { label: 'Обучить с нуля', run: (M) => M.learnT() },
      criteria: [{ label: 'Ошибка модели меньше 1°', test: (r) => r.err < 1 }, { label: 'Это минимум: на меньшем объёме из списка ошибка не меньше 1°', test: (r) => isMin(r.T) }],
      summary: (r) => `${r.T} с данных · ${fmtN(r.n)} примеров · ${fmt1(r.err, 1)}°`,
      fail: (r) => (r.err >= 1 ? `На ${r.T} с ошибка ${fmt1(r.err, 1)}° — данных мало. Возьми больше.` : DATA.indexOf(r.T) > 0 && st.curve[DATA[DATA.indexOf(r.T) - 1]] == null ? `На ${r.T} с ошибка ${fmt1(r.err, 1)}°. А хватит ли меньшего объёма? Проверь ${DATA[DATA.indexOf(r.T) - 1]} с.` : `На ${DATA[DATA.indexOf(r.T) - 1]} с ошибка тоже меньше 1°, значит ${r.T} с — не минимум.`),
      hint: 'Начни с 2 секунд и иди вверх по списку. Минимум — первая точка ниже зелёной линии.',
      explain: (r) => `Хватило ${r.T} секунд данных — ${fmtN(r.n)} примеров: ошибка ${fmt1(r.err, 1)}°. Дальше кривая почти плоская: 10 и 20 секунд дают около 0,6°. Простой модели привода много данных не нужно. Но все данные сняты с одного привода в одном состоянии. Что будет, когда привод износится?`,
      onEnter: (M) => M.setup('m3') },
    { short: 'Износ', title: 'Износ привода', controls: ['delay', 'bl'],
      text: 'Привод изнашивается: растёт люфт, а медленная шина данных добавляет задержку. Двигай ползунки и доведи разрыв между симулятором и настоящим приводом до 8°. Оранжевая кривая — сеть, обученная на исправном приводе.',
      criteria: [{ label: 'Разрыв симулятора не меньше 8°', test: (r, s) => s.errSim >= 8 }],
      hint: 'Каждые 2,5 мс задержки добавляют к разрыву примерно полградуса, каждый градус люфта — ещё около 0,8°.',
      explain: (r) => `Разрыв симулятора <b>${fmt1(r.errSim, 1)}°</b>, а сеть, обученная на исправном приводе, теперь ошибается на <b>${fmt1(r.errNet, 1)}°</b>. Модель привода по данным знает только тот привод, на котором её учили. Привод изменился — модель устарела. Поможет ли собрать данные заново?`,
      onEnter: (M) => M.setup('m4') },
    { short: 'Переобучение', title: 'Переобучи модель на новых данных', controls: ['loss'],
      text: 'Соберём 20 секунд данных уже с изношенного привода и переобучим сеть с нуля.',
      bet: { q: 'что даст переобучение?', options: ['Ошибка снова около 0,6°', 'Поможет, но не до конца', 'Не поможет'], answer: (r) => (r.newErr < 1 ? 0 : r.newErr < 0.7 * r.simErr ? 1 : 2) },
      action: { label: 'Переобучить на этом приводе', run: (M) => M.retrain() },
      criteria: [{ label: 'Переобученная сеть хотя бы вдвое точнее симулятора', test: (r) => r.newErr <= r.simErr / 2 }],
      summary: (r) => `задержка ${fmtS(r.delayMs)} мс, люфт ${fmtS(r.bl)}° · симулятор ${fmt1(r.simErr, 1)}° · старая сеть ${fmt1(r.oldErr, 1)}° · новая ${fmt1(r.newErr, 1)}°`,
      explain: (r) => `Переобученная сеть ошибается на <b>${fmt1(r.newErr, 1)}°</b> против ${fmt1(r.simErr, 1)}° у симулятора и ${fmt1(r.oldErr, 1)}° у старой сети. Люфт сеть выучивает неплохо, а длинную задержку хуже: она видит только последние 10 мс истории и не знает, какую команду привод исполняет прямо сейчас. Чем длиннее задержка, тем длиннее должна быть история на входе модели.`,
      onEnter: (M) => M.setup('m5') },
    { short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Меняй команду, задержку и люфт, обучай сеть на разном объёме данных кнопкой «Переобучить сеть на этом приводе». Попробуй задержку 0 мс: насколько тогда близки симулятор и привод?',
      onEnter: (M) => M.setup('free') },
  ];
  function init() {
    const cw = $('#actCmdWrap'); CMD_KEYS.forEach((key) => { const b = h('button', { type: 'button', 'data-v': key, 'aria-pressed': 'false' }, CMDS[key].label); b.addEventListener('click', () => { if (busy()) return; st.pending = key; segSet(cw, key); if (st.phase === 'free') { apply(key); playDraw(700); } }); cw.append(b); });
    const dw = $('#actDataWrap'); DATA.forEach((T) => { const b = h('button', { type: 'button', 'data-v': String(T), 'aria-pressed': 'false' }, `${T} с`); b.addEventListener('click', () => { if (busy()) return; st.dataT = T; segSet(dw, T); dirty = true; }); dw.append(b); });
    $('#actDelay').addEventListener('input', (e) => { if (busy()) { syncSliders(); return; } st.delay = +e.target.value; syncSliders(); refresh(); if (ctl) ctl.update(); });
    $('#actBl').addEventListener('input', (e) => { if (busy()) { syncSliders(); return; } st.bl = +e.target.value; syncSliders(); refresh(); if (ctl) ctl.update(); });
    $('#actRetrain').addEventListener('click', async () => { if (busy()) return; const r = await train(st.dataT, opts()); if (st.delay === 6 && st.bl === 0) st.curve[st.dataT] = r.err; dirty = true; });
    K.loop($('#actCv'), (dt, now) => { if (anim) { anim(now); dirty = true; } if (st.training) dirty = true; if (dirty) drawAll(); });
    App.on('theme', drawAll); App.on('resize', drawAll);
    refresh(); syncSliders();
    ctl = Missions.mount('#actGuide', missions, api, { controls: { cmd: '#actCmdWrap', data: '#actDataWrap', delay: '#actDelayWrap', bl: '#actBlWrap', retrain: '#actRetrainWrap', loss: '#actLossWrap', curve: '#actCurveWrap' } });
    drawAll();
  }
  return { init, api, st, get ctl() { return ctl; }, cache };
})();

/* ---------- 8. Квиз ---------- */
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
        if (scoreSel) $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Чем больше передаточное число, тем лучше: больше момент?', o: ['Да, момент важнее всего', 'Нет: растут инерция, трение и сила удара', 'Оно влияет только на скорость'], a: 1, e: 'Инерция ротора на выходе растёт как квадрат передаточного числа. Поэтому в ногах шагающих роботов ставят малое передаточное число.' },
    { q: 'Камер достаточно, остальные сенсоры лишние?', o: ['Да, камера видит всё', 'Нет: камера медленная и не видит контакт, а для баланса и захвата нужны IMU, энкодеры и датчики силы', 'Да, если камер больше трёх'], a: 1, e: 'Камера даёт 30–90 кадров в секунду и не видит контакт, когда пальцы закрывают предмет. IMU выдаёт данные до 2 кГц, датчик силы ATI Axia80 — до 8 кГц.' },
    { q: 'Нейросеть управляет моторами напрямую?', o: ['Да, всегда', 'Обычно нет: она выдаёт цели на 10–200 Гц, а моторы держат регуляторы на килогерцах', 'Нет, нейросети не используют в управлении'], a: 1, e: 'Например, RL-политика Mini Cheetah выдаёт 12 целевых углов на 50 Гц, а ПД-регуляторы на драйверах работают до 40 кГц. Политики, которые выдают моменты напрямую, — редкость.' },
    { q: 'Симулятор точно повторяет привод?', o: ['Да, если физика точная', 'Нет: задержки, трение и люфт — частый источник расхождения', 'Нет, но разница всегда незаметна'], a: 1, e: 'В лаборатории идеальная модель ошибалась в шесть раз сильнее, чем сеть, обученная на данных привода. А при задержке 40 мс её ошибка вырастала до 8,4°.' },
    { q: 'Степеней свободы столько же, сколько моторов?', o: ['Всегда', 'Не всегда: в кисти Optimus 2022 года 6 приводов на 11 степеней свободы', 'Моторов всегда больше'], a: 1, e: 'Тросы и связанные механизмы позволяют одним мотором двигать несколько суставов.' },
    { q: 'IMU сразу даёт точный угол наклона?', o: ['Да', 'Нет: гироскоп дрейфует, акселерометр шумит, их объединяют', 'Только если IMU дорогой'], a: 1, e: 'Даже маленькое смещение нуля гироскопа при интегрировании копится. Комплементарный фильтр или фильтр Калмана объединяют сильные стороны обоих датчиков.' },
    { q: 'Без датчика силы робот не знает силу контакта?', o: ['Не знает', 'Знает приблизительно: при малом передаточном числе силу оценивают по току мотора', 'Знает точно по камере'], a: 1, e: 'MIT Cheetah оценивает силу в ноге по току моторов. Плата — ошибка: у Cheetah 3 трение в редукторе даёт около ±10%.' },
    { q: 'Тактильный сенсор GelSight — это датчик силы?', o: ['Да, тензодатчик', 'Нет: это камера, которая снимает деформацию геля', 'Это микрофон'], a: 1, e: 'GelSight и DIGIT видят геометрию контакта. Силу и проскальзывание вычисляют по картинке.' },
  ], '#quizScore');
}

(function boot() {
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('body', () => Body.init()); safe('arm', () => ArmLab.init()); safe('gear', () => GearLab.init());
    safe('types', () => TypesSort.init()); safe('imu', () => ImuLab.init()); safe('ladder', () => Ladder.init());
    safe('act', () => ActLab.init()); safe('quiz', initQuiz);
    Object.assign(L02, { Body, ArmLab, GearLab, TypesSort, ImuLab, Ladder, ActLab });
    window.__l02 = L02; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
