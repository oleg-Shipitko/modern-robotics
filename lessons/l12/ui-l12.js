/* =====================================================================
   ui-l12.js — урок 1.2 «DAgger». Интерактивы — миссии на живых сценах
   (shared/missions.js), у каждого своя механика: две Ады рядом и ставка
   на число итераций, выбор мест для подсказок учителя, перехват
   управления (HG-DAgger), кривая, которую строишь сам, сортировка
   «кто зовёт эксперта» (shared/cards.js), порог неуверенности ансамбля
   и квиз. Сцена и движок — shared/drive-lab.js и shared/drive-core.js.
   ===================================================================== */
'use strict';

const fmtN = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }).replace('-', '−');
const HARD = 2;   // проверочная поездка, где политика из урока 1.1 врезается: старт для «Ты — эксперт»

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

/* ---------- Лаборатория: миссии на живой сцене ---------- */
const Lab = (() => {
  let ctl = null, trips = [];
  const L = () => window.DriveLab;
  /** Политика из урока 1.1 на сцене: её 10 поездок — серые. */
  async function startBC(A) {
    await A.useBC();
    A.pickMode(false); A.expertSetup(null);
    A.showRuns({ ghost: await A.bcRuns() });
    A.say('Серые линии — 10 поездок политики из урока 1.1. Сделай ставку справа и запусти итерацию.', '');
  }
  const missions = [
    {
      short: 'Две Ады', title: 'Одна итерация DAgger',
      text: 'Серая Ада — политика из урока 1.1, обученная на 10 аккуратных поездках робота-оператора, её поездки уже на сцене. Оранжевая Ада — копия этой политики, её учим по DAgger. Одна итерация: оранжевая Ада едет сама, учитель-планировщик подсказывает правильный руль в каждой точке её пути, новые примеры добавляются ко всем старым, и сеть дообучается. Подсказки учителя на сцене — синие точки, синие дуги — места, где он не согласен с политикой. Потом обе Ады проезжают по 10 раз с одних и тех же стартов.',
      controls: ['view', 'legend'],
      onEnter: (A) => { A.setLabels({ main: 'после DAgger', ghost: 'политика из 1.1' }); if (!L().state.dagIt || L().state.pick || L().state.expert.start) startBC(A); },
      bet: { q: 'Сколько итераций понадобится, чтобы оранжевая Ада доезжала хотя бы 9 из 10?', options: ['одна', 'две–три', 'четыре или больше'], answer: (r) => (r.ok >= 9 ? 0 : 1) },
      action: {
        label: 'Итерация DAgger',
        run: async (A) => {
          if (!L().state.model || L().state.expert.start || L().state.pick) await startBC(A);
          const d = await A.daggerIter(); const ghost = await A.bcRuns(); const t = await A.runTrips({ ghost });
          return Object.assign({}, d, t);
        },
      },
      criteria: [{ label: 'оранжевая Ада доезжает 9 из 10 или чаще', test: (r) => r.ok >= 9 }],
      summary: (r) => `итерация ${r.it}: +${r.labeled} примеров → ${r.ok} из 10, у политики из 1.1 — ${r.okGhost}`,
      fail: (r) => `Оранжевая Ада доезжает ${r.ok} из 10. Сделай ещё одну итерацию: она поедет снова, и учитель разметит новые места.`,
      explain: (r) => `${r.it === 1 ? 'Хватило одной итерации' : `Понадобилось ${r.it} ${plural(r.it, 'итерация', 'итерации', 'итераций')}`}: учитель разметил ${r.total} ${plural(r.total, 'состояние', 'состояния', 'состояний')} из поездок оранжевой Ады${r.crashed ? ', в том числе из той, что закончилась аварией' : ''}. В данных появились примеры именно там, куда заезжает политика, с правильным рулём. Оранжевая Ада доезжает <b>${r.ok} из 10</b>, серая — по-прежнему <b>${r.okGhost} из 10</b>: ей новых данных не досталось. Учитель размечал каждый кадр подряд. Что, если его время ограничено? Это следующая задача.`,
    },
    {
      short: 'Где спросить', title: 'Учитель занят: 40 подсказок',
      text: 'В первой задаче учитель размечал каждый кадр подряд. Эксперту-человеку это дорого: его время ограничено. Пусть учитель успевает ответить только на 4 вопроса. На сцене — 10 поездок политики из урока 1.1. Коснись сцены там, где подсказки нужнее всего: каждое касание отдаёт учителю 10 ближайших кадров её поездок, всего выйдет 40. Потом дообучим политику и снова отпустим.',
      controls: ['view', 'pick', 'legend'],
      onEnter: (A) => { A.setLabels({ main: 'после подсказок', ghost: 'политика из 1.1' }); A.expertSetup(null); A.setView('traj'); A.pickMode(true).then(() => A.say('Коснись сцены рядом с поездками: каждое касание — 10 кадров для учителя.', '')); },
      action: { label: 'Спросить учителя и дообучить', run: (A) => A.pickTrain({ ghost: true }) },
      criteria: [
        { label: 'доехали 9 из 10 или больше', test: (r) => r.ok >= 9 },
        { label: 'учитель разметил не больше 40 кадров', test: (r) => r.labels > 0 && r.labels <= 40 },
      ],
      summary: (r) => (r.labels ? `${r.labels} ${plural(r.labels, 'подсказка', 'подсказки', 'подсказок')} → ${r.ok} из 10` : 'кадры не выбраны'),
      hint: 'Посмотри, где поездки заканчиваются крестиком, и спрашивай чуть раньше этих мест — там, где Ада уже съехала, но ещё не врезалась. У старта данных и так много.',
      fail: (r) => (!r.labels ? 'Сначала коснись сцены рядом с поездками, чтобы выбрать кадры для учителя.' : `Доехали ${r.ok} из 10. Если спрашивать у старта или там, где Ада и так едет уверенно, подсказки почти ничего не добавляют. Сбрось выбор и спроси там, где поездки расходятся и врезаются.`),
      explain: (r) => `Доехали <b>${r.ok} из 10</b> на ${r.labels} ${plural(r.labels, 'подсказке', 'подсказках', 'подсказках')} — вчетверо меньше, чем учитель разметил за полную итерацию DAgger. Ценнее всего кадры, где политика ошибается: туда она и заезжает. Если спрашивать там, где Ада и так едет по данным, подсказки почти ничего не дают — это можно проверить, сбросив выбор. Места для подсказок здесь выбираешь ты, а размечает по-прежнему планировщик. В следующей задаче подсказки даёшь тоже ты.`,
    },
    {
      short: 'Ты — эксперт', title: 'Научи Аду трудному старту',
      text: 'Теперь эксперт — ты. Человеку трудно подсказывать руль, когда ведёт кто-то другой, поэтому ты не размечаешь кадры, а берёшь управление, когда видишь опасность. С этого старта политика из урока 1.1 врезается. Нажми «Поехать»: Ада едет сама. Зажми кнопку мыши или коснись сцены, чтобы вести её, и отпусти, когда она снова на маршруте. После поездки сеть дообучится на твоих участках.',
      controls: ['view'],
      onEnter: async (A) => { trips = []; A.setLabels({ main: 'политика' }); A.pickMode(false); A.setView('traj'); await A.useBC(); A.expertSetup(HARD); A.say('Нажми «Поехать». Пока зажата кнопка мыши или палец лежит на сцене, Аду ведёшь ты.', ''); },
      action: {
        label: 'Поехать',
        run: async (A) => {
          if (!L().state.expert.start) { await A.useBC(); A.expertSetup(HARD); }
          const r = await A.expertRun({ fine: true }); trips.push(r.takeovers); return Object.assign(r, { log: trips.slice() });
        },
      },
      criteria: [
        { label: 'в данных есть твои подсказки', test: (r) => r.samples > 0 },
        { label: 'Ада проехала этот старт без вмешательств', test: (r) => r.samples > 0 && r.takeovers === 0 && r.outcome === 'goal' },
      ],
      summary: (r) => `поездка ${r.trip}: ${r.takeovers} ${plural(r.takeovers, 'вмешательство', 'вмешательства', 'вмешательств')} → ${r.outcome === 'goal' ? 'доехала' : r.outcome === 'crash' ? 'врезалась' : 'не доехала'}${r.newSamples ? `, +${r.newSamples} примеров` : ''}`,
      hint: 'Перехватывай заранее, как только Ада начинает уходить к стене, и веди её к середине проёма. Отпускай, когда она снова едет по маршруту. Обычно хватает одной-двух поездок с подсказками.',
      fail: (r) => (r.samples === 0 ? 'Ада ехала сама и врезалась. Зажми кнопку мыши или коснись сцены, когда она начнёт съезжать, и веди её к проёму.' : r.takeovers > 0 ? `Сеть дообучилась на твоих подсказках: в данных ${r.samples} ${plural(r.samples, 'пример', 'примера', 'примеров')}. Нажми «Поехать» ещё раз и посмотри, понадобится ли помощь.` : 'Ада снова врезалась. Подскажи ей там, где она съезжает: каждая подсказка попадает в данные.'),
      explain: (r) => `Ада проехала трудный старт сама. Вмешательств по поездкам: ${r.log.slice(Math.max(0, r.log.findIndex((x) => x > 0))).join(' → ')}. Так работает HG-DAgger: человек перехватывает управление, когда видит опасность, и в данные попадают только его участки — здесь ${r.samples} ${plural(r.samples, 'пример', 'примера', 'примеров')}. Похожую метрику — как часто человеку приходится вмешиваться — годами считают беспилотные компании.`,
    },
    {
      short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Все ручки — под сценой: итерации DAgger подряд, поездки с твоими подсказками поверх них, 10 проверочных поездок и возврат к политике из урока 1.1. Журнал запусков ведётся там же.',
      onEnter: (A) => { A.pickMode(false); A.setLabels({ main: 'политика', ghost: 'политика из 1.1' }); },
    },
  ];
  function mount() {
    const A = L();
    A.setOpts({ demos: false });   // в траекториях только поездки политик: данные видны в режиме «где были данные»
    const api = Object.assign({}, A, { reset() { A.reset(); trips = []; }, state() { return { dagIt: A.state.dagIt }; } });
    ctl = Missions.mount('#guide', missions, api, { controls: { view: '#ctlView', pick: '#ctlPickClear', legend: '#duelLegend', free: '#freePanel' } });
    A.onChange(() => { if (ctl) ctl.update(); });
    $('#ctlPickClear').addEventListener('click', () => A.pickClear());
    $('#btnBC').addEventListener('click', () => { if (!A.busy()) startBC(A).then(() => { A.expertSetup(HARD); A.say('Вернули политику из урока 1.1.', ''); }); });
    return ctl;
  }
  return { mount, get ctl() { return ctl; } };
})();

const pal = () => DriveDraw.pal();

/* ---------- Кривая, которую строишь сам: BC против DAgger при равной разметке ---------- */
const Curve = (() => {
  const D = Drive; const bc = {}, dg = []; let busy = false, ctl = null, dgState = null, last = null;
  const ev = (m) => D.evaluate(D.policy(m), 20, { noise: 0.2, spread: 0.9, seed: 101 }).ok;
  function* bcJob(n) {
    const d = D.toData(D.demos(n, { seed: 3, offSigma: 3, startSpread: 0.8 }), 0), m = D.mlp(D.OBS, 48, 7);
    yield* D.trainGen(m, d, { iters: 900 }); bc[n] = { n, x: d.X.length, ok: ev(m) }; last = { kind: 'bc', p: bc[n] }; yield { pt: true };
  }
  function* dgJob(upto) {
    if (!dgState) {
      const d = D.toData(D.demos(5, { seed: 3, offSigma: 3, startSpread: 0.8 }), 0), m = D.mlp(D.OBS, 48, 7);
      yield* D.trainGen(m, d, { iters: 900 }); dgState = { m, d }; dg[0] = { it: 0, x: d.X.length, ok: ev(m) }; last = { kind: 'dg', p: dg[0] }; yield { pt: true };
    }
    for (let it = dg.length; it <= upto; it++) {
      const lab = D.daggerLabel(D.policy(dgState.m), 1, { noise: 0.2, seed: 700 + it });
      dgState.d = { X: dgState.d.X.concat(lab.X), Y: dgState.d.Y.concat(lab.Y) };
      yield* D.trainGen(dgState.m, dgState.d, { iters: 500, lr: 0.003, seed: 20 + it });
      dg[it] = { it, x: dgState.d.X.length, ok: ev(dgState.m) }; last = { kind: 'dg', p: dg[it] }; yield { pt: true };
    }
    if (dg[upto]) last = { kind: 'dg', p: dg[upto] };
  }
  const pts = (o) => Object.values(o).filter(Boolean).sort((a, b) => a.x - b.x);
  function draw() {
    const K = HeroKit, W = 760, H = matchMedia('(max-width: 640px)').matches ? 460 : 300, P = pal();
    const { c, k } = K.fit($('#curveChart'), W, H), box = { l: 50 * k, r: W - 18 * k, t: 26 * k, b: H - 34 * k };
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const X = (n) => box.l + (Math.log10(n) - Math.log10(700)) / (Math.log10(10000) - Math.log10(700)) * (box.r - box.l), Y = (v) => box.b - v / 20 * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let v = 0; v <= 20; v += 5) { c.beginPath(); c.moveTo(box.l, Y(v)); c.lineTo(box.r, Y(v)); c.stroke(); K.label(c, k, `${v * 5}%`, box.l - 8, Y(v), { align: 'right', px: 10.5, color: P.ink3, halo: false, mono: true }); }
    for (const n of [1000, 2000, 4000, 8000]) { c.beginPath(); c.moveTo(X(n), box.t); c.lineTo(X(n), box.b); c.stroke(); K.label(c, k, n.toLocaleString('ru-RU'), X(n), box.b + 12 * k, { px: 10.5, color: P.ink3, halo: false, mono: true }); }
    K.label(c, k, 'размеченных примеров', (box.l + box.r) / 2, H - 8 * k, { px: 11, color: P.ink2, halo: false });
    K.label(c, k, 'доехали из 20 проверочных поездок', box.l, 10 * k, { align: 'left', px: 11, color: P.ink2, halo: false });
    const line = (list, col, lab) => {
      if (!list.length) return;
      c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); list.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.ok)) : c.moveTo(X(p.x), Y(p.ok)))); c.stroke();
      list.forEach((p) => { c.beginPath(); c.arc(X(p.x), Y(p.ok), 5.5, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke(); K.label(c, k, lab(p), X(p.x), Y(p.ok) - 14, { px: 10.5, mono: true, color: col, weight: 700, haloColor: P.surf }); });
    };
    line(pts(bc), P.ink2, (p) => `${p.n}`);
    line(pts(dg), P.e2e, (p) => (p.it ? `+${p.it}` : ''));
    if (!Object.keys(bc).length && !dg.length) K.label(c, k, 'добавь первую точку кнопками выше', (box.l + box.r) / 2, (box.t + box.b) / 2, { px: 12, color: P.ink3, haloColor: P.surf });
    if (busy) K.label(c, k, 'обучаем…', box.r - 6, box.t + 10, { align: 'right', px: 11, mono: true, color: P.ink2, haloColor: P.surf });
  }
  function status() {
    const el = $('#curveStatus');
    if (busy) { el.textContent = 'Обучаем с нуля и проверяем на 20 поездках…'; return; }
    if (!last) return;
    const p = last.p;
    el.innerHTML = last.kind === 'bc'
      ? `Behavior cloning на ${p.n} ${plural(p.n, 'демонстрации', 'демонстрациях', 'демонстрациях')}: <b>${p.ok * 5}%</b> на ${p.x.toLocaleString('ru-RU')} примерах.`
      : `DAgger, ${p.it ? `${p.it} ${plural(p.it, 'итерация', 'итерации', 'итераций')}` : 'только 5 демонстраций'}: <b>${p.ok * 5}%</b> на ${p.x.toLocaleString('ru-RU')} примерах.`;
  }
  function marks() {
    $$('#ccBC button').forEach((b) => b.setAttribute('aria-pressed', String(!!bc[+b.dataset.n])));
    $$('#ccDG button').forEach((b) => b.setAttribute('aria-pressed', String(!!dg[+b.dataset.it])));
  }
  async function add(job) {
    if (busy) return; busy = true; status(); draw();
    await runChunked(job, (e) => { if (e && e.pt) { marks(); draw(); } });
    busy = false; marks(); status(); draw(); if (ctl) ctl.update();
  }
  const addBC = (n) => (bc[n] ? (last = { kind: 'bc', p: bc[n] }, status()) : add(bcJob(n)));
  const addDG = (it) => (dg[it] ? (last = { kind: 'dg', p: dg[it] }, status()) : add(dgJob(it)));
  const state = () => ({ busy, dg100: dg.find((p) => p && p.ok === 20) || null, bc40: bc[40] || null, bc: pts(bc), dg: pts(dg) });
  const missions = [{
    short: 'Кривая', title: 'Найди, когда DAgger доходит до 100%',
    text: 'Добавляй точки кнопками над графиком. Найди, на каком числе размеченных примеров DAgger впервые доезжает во всех 20 поездках, и сравни с behavior cloning на 40 демонстрациях.',
    criteria: [
      { label: 'найдена точка, где DAgger доезжает во всех 20 поездках', test: (r, s) => !!s.dg100 },
      { label: 'для сравнения построена точка behavior cloning на 40 демонстрациях', test: (r, s) => !!s.bc40 },
    ],
    hint: 'Итерации DAgger идут по очереди: для третьей нужны первая и вторая, поэтому они построятся сами. Начни с первой итерации и иди дальше.',
    explain: (s) => `DAgger доехал во всех 20 поездках на <b>${s.dg100.x.toLocaleString('ru-RU')}</b> размеченных примерах: 5 демонстраций и ${s.dg100.it} ${plural(s.dg100.it, 'итерация', 'итерации', 'итераций')}. Behavior cloning на 40 демонстрациях — ${s.bc40.x.toLocaleString('ru-RU')} примеров — доезжает в <b>${s.bc40.ok * 5}%</b> поездок. Важно не сколько данных, а где они. Заметь, что кривая DAgger не обязана расти монотонно: одна поездка на итерацию — маленькая порция данных.`,
  }];
  function reset() { /* построенные точки — это данные, а не прогресс миссии: их не стираем */ }
  function init() {
    $$('#ccBC button').forEach((b) => b.addEventListener('click', () => addBC(+b.dataset.n)));
    $$('#ccDG button').forEach((b) => b.addEventListener('click', () => addDG(+b.dataset.it)));
    App.on('theme', draw); App.on('resize', draw);
    marks(); draw();
    ctl = Missions.mount('#curveGuide', missions, { reset, state }, {});
    return ctl;
  }
  return { init, state, addBC, addDG, get ctl() { return ctl; } };
})();

/* ---------- Кто решает, когда звать эксперта: сортировка ---------- */
function initSort() {
  return Cards.sort('#sortBox', {
    targets: [{ id: 'all', label: 'Эксперт размечает всё подряд' }, { id: 'human', label: 'Человек решает, когда вмешаться' }, { id: 'robot', label: 'Робот сам зовёт эксперта' }],
    items: [
      { id: 'hg', label: 'HG-DAgger: водитель перехватывает руль, когда видит опасность', target: 'human', why: 'Человек сам решает, когда взять управление и когда вернуть. В данные идут только его участки.' },
      { id: 'dagger', label: 'DAgger: учитель подсказывает руль в каждой точке поездки политики', target: 'all', why: 'В DAgger эксперт размечает все состояния, куда попала политика. Решать, когда звать, не нужно, но разметка дорогая.' },
      { id: 'thrifty', label: 'ThriftyDAgger: робот зовёт человека, когда ансамбль сомневается или риск высок', target: 'robot', why: 'Решает робот — по порогам новизны и риска.' },
      { id: 'lab', label: 'Режим «Ты — эксперт» в лаборатории этого урока', target: 'human', why: 'Решаешь ты: зажимаешь кнопку, когда видишь опасность. Это HG-DAgger.' },
      { id: 'safe', label: 'SafeDAgger: классификатор предсказывает, где политика разойдётся с экспертом, и только эти состояния отдаёт на разметку', target: 'robot', why: 'Решает классификатор — часть самой системы, а не человек.' },
      { id: 'mario', label: 'Super Mario Bros в статье DAgger: планировщик размечает каждое состояние', target: 'all', why: 'Экспертом был планировщик с доступом к внутреннему состоянию игры: ему всё равно, сколько размечать.' },
      { id: 'diseng', label: 'Отчёты о disengagements беспилотников: человек берёт управление, когда считает нужным', target: 'human', why: 'Решает человек за рулём, а компании считают, как часто ему приходится вмешиваться.' },
      { id: 'tau', label: 'Порог неуверенности ансамбля из следующего раздела', target: 'robot', why: 'Ада просит помощи, когда разброс трёх сетей выше порога.' },
    ],
    after: 'Во всех случаях данные собираются там, куда заезжает политика. Разница — в цене внимания эксперта: размечать всё подряд дорого, человек устаёт и отвлекается, а робот с порогом зовёт тогда, когда сомневается. Как роботу понять, что он сомневается, и где поставить порог — в следующем разделе.',
  });
}

/* ---------- Бюджет внимания: ансамбль просит помощи при разбросе выше порога ---------- */
const Budget = (() => {
  const D = Drive; let models = null, runs = [], busy = false, ctl = null, res = { help: 0, crash: 0, ok: 0, steps: 0 };
  const tauNow = () => Math.pow(10, +$('#ensTau').value);
  function ens(s, buf) { const o = D.observe(s, buf), ys = models.map((m) => D.forward(m, o)); const mean = ys.reduce((a, b) => a + b, 0) / ys.length; return { mean, std: Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length) }; }
  function simulate() {
    const tau = tauNow(), r = D.rng(101), buf = new Float32Array(D.OBS); runs = [];
    let help = 0, crash = 0, ok = 0, steps = 0;
    for (let ep = 0; ep < 10; ep++) {
      let s = D.randStart(r, 0.9); const traj = [s], asks = []; let out = 'timeout';
      for (let t = 0; t < D.TMAX / D.DT; t++) {
        const e = ens(s, buf); let w; steps++;
        if (e.std > tau) { w = D.teacher(s); help++; asks.push(s); } else w = e.mean * D.WMAX;
        s = D.step(s, w + D.randn(r) * 0.2); traj.push(s);
        if (D.collides(s.x, s.y)) { out = 'crash'; break; }
        if (Math.hypot(s.x - D.GOAL.x, s.y - D.GOAL.y) < D.GOAL.r) { out = 'goal'; break; }
      }
      if (out === 'crash') crash++; if (out === 'goal') ok++;
      runs.push({ traj, asks, out });
    }
    res = { help, crash, ok, steps };
    $('#ensHelp').textContent = help; $('#ensShare').textContent = (help / steps * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%';
    $('#ensCrash').textContent = crash; $('#ensOk').textContent = ok;
    $('#ensNote').textContent = crash <= 1 && help <= 120 ? 'Ада просит помощи редко и почти не врезается.' : crash <= 1 ? 'Аварий мало, но Ада часто дёргает человека. Подними порог.' : help < 20 ? 'Ада почти не просит помощи и врезается. Опусти порог.' : 'Аварий всё ещё много. Попробуй порог ниже.';
    draw(); if (ctl) ctl.update();
  }
  function label() { const el = $('#ensTau'); el.nextElementSibling.textContent = tauNow().toFixed(3).replace('.', ','); setRangeFill(el); }
  function draw() {
    const K = HeroKit, P = pal(), cv = $('#ensScene'), { c, k } = K.fit(cv, D.W, D.H);
    DriveDraw.house(c, k, P);
    for (const r of runs) {
      c.strokeStyle = P.e2e; c.lineWidth = 1.6; c.globalAlpha = 0.8; DriveDraw.line(c, r.traj); c.globalAlpha = 1;
      c.fillStyle = P.classic; for (const s of r.asks) { c.beginPath(); c.arc(s.x, s.y, 3.2, 0, 7); c.fill(); }
      DriveDraw.mark(c, r.traj[r.traj.length - 1], r.out, P);
    }
    if (!runs.length) K.label(c, k, busy ? 'обучаем три сети…' : 'обучи ансамбль, чтобы увидеть поездки', D.W / 2, D.H / 2, { px: 12, color: P.ink3, haloColor: P.bg });
  }
  async function train() {
    if (busy) return; busy = true; $('#ensTrain').disabled = true; draw();
    const data = D.toData(D.demos(10, { seed: 3, offSigma: 3, startSpread: 0.8 }), 0), list = []; models = null;
    for (const sd of [7, 8, 9]) { const m = D.mlp(D.OBS, 48, sd); $('#ensNote').textContent = `Обучаем сеть ${list.length + 1} из 3…`; await runChunked(D.trainGen(m, data, { iters: 700, seed: sd * 3 }), () => {}); list.push(m); }
    models = list; busy = false; $('#ensTrain').disabled = false; $('#ensTrain').textContent = 'Обучить заново'; simulate();
  }
  const state = () => ({ ready: !!models, help: res.help, crash: res.crash, ok: res.ok, steps: res.steps, tau: tauNow() });
  function reset() { $('#ensTau').value = -0.8; label(); if (models) simulate(); }
  const missions = [{
    short: 'Порог', title: 'Найди порог: просить редко и вовремя',
    text: 'Обучи ансамбль и двигай порог τ. Найди такой, при котором Ада врезается не больше одного раза из десяти и просит помощи не больше чем на 120 шагах.',
    criteria: [
      { label: 'ансамбль из трёх сетей обучен', test: (r, s) => s.ready },
      { label: 'аварий не больше одной', test: (r, s) => s.ready && s.crash <= 1 },
      { label: 'шагов с просьбой о помощи не больше 120', test: (r, s) => s.ready && s.help <= 120 },
    ],
    hint: 'Начни с высокого порога и опускай его по одному делению. Аварии пропадают не сразу, а число просьб растёт быстро — подходящее окно узкое.',
    explain: (s) => `При τ = ${s.tau.toFixed(3).replace('.', ',')} Ада просит помощи на ${s.help} ${plural(s.help, 'шаге', 'шагах', 'шагах')} из ${s.steps.toLocaleString('ru-RU')} — это ${(s.help / s.steps * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% — и врезается ${s.crash === 0 ? 'ни разу' : `${s.crash} ${plural(s.crash, 'раз', 'раза', 'раз')}`}. Порог ниже — и Ада дёргает человека на сотнях шагов, выше — перестаёт просить и врезается. ThriftyDAgger выбирает порог по бюджету: так, чтобы человек вмешивался в заданной доле шагов, например в 1%.`,
  }];
  function init() {
    $('#ensTrain').addEventListener('click', train);
    $('#ensTau').addEventListener('input', () => { label(); if (models) simulate(); });
    App.on('theme', draw); App.on('resize', draw);
    label(); draw();
    ctl = Missions.mount('#ensGuide', missions, { reset, state }, {});
    return ctl;
  }
  return { init, state, train, get ctl() { return ctl; } };
})();

/* ---------- Квиз ---------- */
function initQuiz() {
  const Q = [
    { q: 'DAgger — это просто больше демонстраций?', o: ['Да, только собранных быстрее', 'Нет: это разметка там, куда попадает сама политика', 'Да, но от другого оператора'], a: 1, e: 'Новые примеры берутся из состояний политики, а не оператора. В оригинальной статье обычный behavior cloning не улучшался от новых демонстраций, а DAgger — улучшался.' },
    { q: 'Кто управляет роботом в DAgger после первой итерации?', o: ['Эксперт', 'Политика, а эксперт только размечает её состояния', 'По очереди'], a: 1, e: 'Едет политика, эксперт подсказывает правильные действия. Людям так размечать трудно, поэтому появился HG-DAgger.' },
    { q: 'Чем HG-DAgger удобнее для человека?', o: ['Человек размечает быстрее по видео', 'Человек сам перехватывает управление, когда видит опасность, и в данные идут его участки', 'Человеку вообще не нужно участвовать'], a: 1, e: 'Разметка «со стороны» неестественна: нет обратной связи, ощущается задержка. При перехвате человек ведёт сам, и его действия качественнее.' },
    { q: 'Чем мерить неуверенность регрессионной политики?', o: ['Выходом сети: чем ближе к нулю, тем неувереннее', 'Разбросом ответов ансамбля сетей, обученных на одних данных', 'Ошибкой на валидации'], a: 1, e: 'Там, где данных много, сети ансамбля отвечают одинаково, а где данных нет — расходятся. Так устроены HG-DAgger и ThriftyDAgger.' },
    { q: 'Всегда ли DAgger делает ошибку линейной по длине эпизода?', o: ['Да, это доказано', 'Нет: если одна ошибка необратима, выигрыш пропадает', 'Нет, она всегда квадратичная'], a: 1, e: 'Гарантия зависит от того, насколько дорого обходится одна ошибка. Падение с лестницы не исправишь следующим шагом.' },
    { q: 'Кто лучше решает, когда звать человека: сам человек или робот по порогу неуверенности?', o: ['Всегда человек', 'В ThriftyDAgger робот, который сам зовёт человека, показал лучший результат', 'Всегда робот'], a: 1, e: 'На вставке штифта: 73 успеха из 100 у ThriftyDAgger против 57 у HG-DAgger. Человек устаёт и отвлекается, порог — нет.' },
    { q: 'Зачем вмешательства нужны, кроме сбора правильных действий?', o: ['Ни зачем', 'Это сигнал «здесь что-то пошло не так», его используют как награду в обучении с подкреплением', 'Чтобы проверять операторов'], a: 1, e: 'RLIF ставит награду −1 перед вмешательством, HIL-SERL и π*0.6 тоже учатся на исправлениях. Так можно превзойти даже неидеального эксперта.' },
  ];
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1]];
  const box = $('#quizBox'); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true });
    perms[qi].forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[perms[qi].indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $('#quizScore').textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= 5 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}

(function boot() {
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.error('[урок] ошибка в', name, e); return null; } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    window.__labCtl = safe('lab', () => Lab.mount());
    window.__curveCtl = safe('curve', () => Curve.init());
    window.__sort = safe('sort', initSort);
    window.__ensCtl = safe('budget', () => Budget.init());
    safe('quiz', initQuiz);
    window.__curve = Curve; window.__budget = Budget;
    window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
