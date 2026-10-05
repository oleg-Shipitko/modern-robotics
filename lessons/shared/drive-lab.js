/* =====================================================================
   shared/drive-lab.js — сцена дома Ады для лабораторий уроков 1.1 и 1.2.
   DriveDraw — отрисовка плана дома для любых канвасов (работает и без лабы).
   DriveLab — живая сцена #scene и промис-API для миссий (shared/missions.js):
     record()            своя поездка курсором или пальцем;
     addDemos(), train() демонстрации робота-оператора и обучение;
     runTrips()          10 проверочных поездок с общими случайными числами;
     compare()           несколько политик рядом, сцена делится на панели;
     daggerIter()        итерация DAgger с подсказками учителя на сцене;
     probe…()            «поиск отказов»: перетаскивай старт Ады;
     pick…()             «где спросить учителя»: выбор кадров для разметки;
     expertRun()         «ты — эксперт»: перехват управления, как в HG-DAgger.
   Кнопки свободного режима (#btnRecord, #btnDemos, #btnTrain, #btnRun,
   #btnDagger, #btnExpert, #optDart, #optAug, [name=view], [data-view])
   необязательны: если их нет в разметке, лаба работает только через API.
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit, D = Drive;
  const W = D.W, H = D.H, SPEED = 3;
  const $ = (s) => document.querySelector(s);

  /* ---------- отрисовка, общая для всех канвасов с домом ---------- */
  function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), classic: K.css('--classic'), good: K.css('--good'), bad: K.css('--critical'), surf: K.css('--surface') }; }
  /** План дома. o.labels — подписи комнат и мебели; o.dock — зарядка. */
  function house(c, k, P, o) {
    o = o || {};
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 50, P.grid);
    if (o.labels !== false) for (const [t, x, y] of [['прихожая', 100, 22], ['гостиная', 300, 22], ['кухня', 470, 230]]) K.label(c, k, t, x, y, { color: P.ink3, px: 11, weight: 600, haloColor: P.bg });
    for (const f of D.FURN) {
      const [x0, y0, x1, y1] = f.r; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 7, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (o.labels !== false) K.label(c, k, f.name, (x0 + x1) / 2, (y0 + y1) / 2, { color: P.ink2, px: 11, haloColor: P.surf });
    }
    c.fillStyle = P.ink2; for (const r of D.WALLS) c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    if (o.dock !== false) {
      c.fillStyle = P.classic; c.globalAlpha = 0.18; c.fillRect(D.DOCK.x - 26, D.DOCK.y - 26, 52, 52); c.globalAlpha = 1;
      if (o.labels !== false) K.label(c, k, 'зарядка', D.DOCK.x, D.DOCK.y + 38, { color: P.ink2, px: 11, haloColor: P.bg });
    }
    c.setLineDash([4, 5]); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.arc(D.GOAL.x, D.GOAL.y, D.GOAL.r, 0, 7); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(D.GOAL.x, D.GOAL.y, 4, 0, 7); c.fillStyle = P.ink2; c.fill();
  }
  function ada(c, s, color, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(s.x, s.y); c.rotate(s.th);
    c.beginPath(); c.arc(0, 0, D.R, 0, 7); c.fillStyle = K.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = color || K.css('--ink'); c.stroke();
    c.beginPath(); c.roundRect(4, -9, 10, 18, 4); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(9, -4, 1.8, 0, 7); c.arc(9, 4, 1.8, 0, 7); c.fill();
    c.restore();
  }
  function line(c, traj, upto) { const n = upto == null ? traj.length : Math.min(traj.length, upto); if (n < 2) return; c.beginPath(); c.moveTo(traj[0].x, traj[0].y); for (let i = 1; i < n; i++) c.lineTo(traj[i].x, traj[i].y); c.stroke(); }
  function mark(c, s, outcome, P, r) { if (outcome === 'crash') K.cross(c, s.x, s.y, r || 7, P.bad, 2.6); else if (outcome === 'goal') K.check(c, s.x, s.y - 1, r || 7, P.good, 2.6); else { c.beginPath(); c.arc(s.x, s.y, (r || 7) * 0.6, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 2; c.stroke(); } }
  /** Дуга: куда приведёт постоянный руль w за T секунд. */
  function arc(c, s, w, T, color, lw) {
    let q = { x: s.x, y: s.y, th: s.th }; c.beginPath(); c.moveTo(q.x, q.y);
    for (let t = 0; t < T; t += D.DT) { q = D.step(q, w); c.lineTo(q.x, q.y); }
    c.strokeStyle = color; c.lineWidth = lw || 3; c.lineCap = 'round'; c.stroke();
    const a = q.th, L = 9; c.beginPath(); c.moveTo(q.x + Math.cos(a) * 3, q.y + Math.sin(a) * 3); c.lineTo(q.x - Math.cos(a - 0.5) * L, q.y - Math.sin(a - 0.5) * L); c.moveTo(q.x + Math.cos(a) * 3, q.y + Math.sin(a) * 3); c.lineTo(q.x - Math.cos(a + 0.5) * L, q.y - Math.sin(a + 0.5) * L); c.stroke();
  }
  const G = 20;
  function cellCounts(eps) { const cnt = new Float32Array((W / G) * (H / G)); for (const e of eps) for (const s of e.traj) { const i = Math.floor(s.x / G), j = Math.floor(s.y / G); if (i >= 0 && j >= 0 && i < W / G && j < H / G) cnt[j * (W / G) + i]++; } return cnt; }
  /** Тепловая карта: где были данные (синий) и где политика ехала без них (оранжевая рамка). */
  function heat(c, P, dataEps, runEps) {
    const d = cellCounts(dataEps), mx = Math.max(1, ...d);
    c.fillStyle = P.classic;
    for (let j = 0; j < H / G; j++) for (let i = 0; i < W / G; i++) { const v = d[j * (W / G) + i]; if (v) { c.globalAlpha = 0.1 + 0.45 * Math.sqrt(v / mx); c.fillRect(i * G + 1, j * G + 1, G - 2, G - 2); } }
    c.globalAlpha = 1;
    if (!runEps || !runEps.length) return;
    const r = cellCounts(runEps); c.strokeStyle = P.e2e; c.lineWidth = 2.2;
    for (let j = 0; j < H / G; j++) for (let i = 0; i < W / G; i++) if (r[j * (W / G) + i] && !d[j * (W / G) + i]) c.strokeRect(i * G + 2.5, j * G + 2.5, G - 5, G - 5);
  }
  window.DriveDraw = { pal, house, ada, line, mark, arc, heat };

  const cv = $('#scene');
  if (!cv) return;

  /* ---------- готовые наборы данных и политики (кэш, обучаются один раз) ---------- */
  const nextTick = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); }; return (f) => { q.push(f); ch.port2.postMessage(0); }; })();
  function runChunked(gen, onEv) { return new Promise((res) => { (function work() { const t0 = performance.now(); while (performance.now() - t0 < 14) { const r = gen.next(); if (r.done) { res(); return; } if (onEv) onEv(r.value); } nextTick(work); })(); }); }
  const careful = (n, seed, dart) => D.demos(n, { seed, offSigma: 3, startSpread: 0.8, dart: dart ? 0.5 : 0 });
  const RECIPES = {
    c10: () => ({ demos: careful(10, 3), aug: 0 }),
    c30: () => ({ demos: careful(10, 3).concat(careful(20, 13)), aug: 0 }),
    dart10: () => ({ demos: careful(10, 3, true).map((d) => Object.assign(d, { dart: true })), aug: 0 }),
    aug10: () => ({ demos: careful(10, 3), aug: 15 }),
  };
  const cache = {};
  /** Политика по готовому рецепту: те же зёрна, что у кнопок лабы, поэтому цифры совпадают. */
  function ensure(key) {
    if (!cache[key]) {
      const r = RECIPES[key](), data = D.toData(r.demos, r.aug), model = D.mlp(D.OBS, 48, 7), entry = { key, demos: r.demos, aug: r.aug, data, model, done: false };
      entry.ready = runChunked(D.trainGen(model, data, { iters: 900, lr: 0.004, seed: 11 })).then(() => { entry.done = true; entry.runs = D.trips(D.policy(model), 10); return entry; });
      cache[key] = entry;
    }
    return cache[key].ready;
  }

  /* ---------- состояние ---------- */
  const st = {
    demos: [], extra: { X: [], Y: [] }, model: null, runs: [], mode: 'idle', view: 'traj', aug: false,
    drive: null, cursor: null, dagIt: 0, wait: null, labeled: [], expertPts: [], playT: 0, afterPlay: false,
    expert: { on: false, data: { X: [], Y: [] }, takeovers: 0, trips: 0, start: null, seed: null, trip: 0 },
    layout: 'single', panels: [], ghost: null, teach: null, probe: null, pick: null,
    labels: { main: 'политика', ghost: 'для сравнения' }, trainNote: '', showDemos: true,
  };
  let P = pal(); K.onTheme(() => { P = pal(); });
  const listeners = [];
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  const on = (sel, ev, fn) => { const e = $(sel); if (e) e.addEventListener(ev, fn); };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  function say(t, kind) { const e = $('#labMsg'); if (!e) return; e.textContent = t; e.className = 'lab-msg ' + (kind || ''); }
  function waitFor(kind) { return new Promise((resolve) => { st.wait = { kind, resolve }; }); }
  function done(kind, value) { if (st.wait && st.wait.kind === kind) { const r = st.wait.resolve; st.wait = null; r(value); } }
  const dataEps = () => st.demos.concat(st.labeled, st.expertPts.length ? [{ traj: st.expertPts }] : []);

  /* ---------- данные ---------- */
  function dataset() {
    const d = D.toData(st.demos, st.aug ? 15 : 0);
    return { X: d.X.concat(st.extra.X, st.expert.data.X), Y: d.Y.concat(st.extra.Y, st.expert.data.Y) };
  }
  function counts() {
    const busy = st.mode !== 'idle';
    if ($('#demoCount')) {
      const mine = st.demos.filter((d) => d.mine).length, n = D.toData(st.demos, st.aug ? 15 : 0).X.length + st.extra.X.length + st.expert.data.X.length;
      $('#demoCount').textContent = `демонстраций: ${st.demos.length}${mine ? ` (твоих: ${mine})` : ''} · примеров для обучения: ${n.toLocaleString('ru-RU')}`;
    }
    if ($('#btnTrain')) $('#btnTrain').disabled = !st.demos.length || busy;
    for (const id of ['#btnRun', '#btnDagger', '#btnExpert']) if ($(id)) $(id).disabled = !st.model || busy;
    for (const id of ['#btnRecord', '#btnDemos', '#btnClear']) if ($(id)) $(id).disabled = busy;
    if ($('#optAug')) $('#optAug').checked = st.aug;
  }
  function addDemos(n, opts) {
    opts = opts || {};
    const add = D.demos(n, { seed: 3 + st.demos.length, offSigma: 3, startSpread: 0.8, dart: opts.dart ? 0.5 : 0 });
    if (opts.dart) add.forEach((d) => { d.dart = true; });
    st.demos.push(...add); counts(); notify();
    say(`Добавлено ${n} поездок робота-оператора${opts.dart ? ' с подмешанным шумом: его сносит, и он поправляет Аду' : ': он едет аккуратно по середине'}.`, 'info');
    return st.demos.length;
  }
  function clearRuns() { st.runs = []; st.ghost = null; st.panels = []; st.layout = 'single'; st.teach = null; }
  function reset() {
    st.demos = []; st.extra = { X: [], Y: [] }; st.expert = { on: false, data: { X: [], Y: [] }, takeovers: 0, trips: 0, start: null, seed: null, trip: 0 };
    st.model = null; st.dagIt = 0; st.aug = false; st.labeled = []; st.expertPts = []; st.probe = null; st.pick = null; st.drive = null; st.mode = 'idle';
    clearRuns(); lossPts.length = 0; drawLoss();
    if ($('#trainProg')) $('#trainProg').style.width = '0';
    if (st.wait) { const w = st.wait; st.wait = null; w.resolve({ aborted: true }); }
    setView('traj'); counts(); notify();
  }
  function setView(v) {
    st.view = v;
    document.querySelectorAll('[name="view"]').forEach((r) => { r.checked = r.value === v; });
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    const lg = $('#heatLegend'); if (lg) lg.hidden = v !== 'heat';
    notify();
  }

  /* ---------- запись своей поездки ---------- */
  function record() {
    clearRuns(); st.probe = null; st.pick = null;
    st.mode = 'record'; st.drive = { s: { ...D.START }, traj: [{ ...D.START }], acts: [], t: 0, started: false };
    st.cursor = null; say('Наведи курсор или палец на сцену: Ада поедет туда. Доведи её до кухни, не задевая мебель.', 'info'); counts();
    return waitFor('record');
  }
  function endRecord(outcome) {
    const d = st.drive, ok = outcome === 'goal';
    if (ok) st.demos.push({ traj: d.traj, acts: d.acts, outcome: 'goal', mine: true });
    st.mode = 'idle'; st.drive = null; st.lastTry = { traj: d.traj, outcome };
    say(ok ? `Поездка записана: ${d.acts.length} пар «что видит Ада → куда повёрнут руль».` : outcome === 'crash' ? 'Ада задела препятствие — поездка не записана.' : 'Слишком долго — поездка не записана.', ok ? 'good' : 'bad');
    counts(); notify();
    done('record', { ok, outcome, time: d.t, samples: d.acts.length, mine: st.demos.filter((x) => x.mine).length });
  }
  function recordStep(dt) {
    const d = st.drive; if (!d.started) return;
    d.acc = (d.acc || 0) + dt;
    while (d.acc >= D.DT && st.mode === 'record') {
      d.acc -= D.DT;
      const s = d.s, c = st.cursor || { x: s.x + Math.cos(s.th) * 50, y: s.y + Math.sin(s.th) * 50 };
      const a = Math.atan2(c.y - s.y, c.x - s.x) - s.th, w = D.clamp(2.4 * Math.atan2(Math.sin(a), Math.cos(a)), -D.WMAX, D.WMAX);
      const s2 = D.step(s, w); d.acts.push(w); d.traj.push(s2); d.s = s2; d.t += D.DT;
      if (D.collides(s2.x, s2.y)) return endRecord('crash');
      if (Math.hypot(s2.x - D.GOAL.x, s2.y - D.GOAL.y) < D.GOAL.r) return endRecord('goal');
      if (d.t > D.TMAX) return endRecord('timeout');
    }
  }

  /* ---------- обучение ---------- */
  const lossPts = [];
  async function train(opts) {
    opts = opts || {};
    const fine = !!opts.fine && !!st.model;
    st.mode = 'train'; counts();
    if (!fine) { st.model = D.mlp(D.OBS, 48, 7); lossPts.length = 0; }
    const data = dataset(), iters = fine ? 500 : 900;
    say(fine ? 'Дообучаем политику на новых данных…' : `Обучаем политику на ${data.X.length.toLocaleString('ru-RU')} примерах…`, 'info');
    await runChunked(D.trainGen(st.model, data, { iters, lr: fine ? 0.003 : 0.004, seed: opts.seed || 11 + st.dagIt }), (e) => { lossPts.push(e.loss); drawLoss(); if ($('#trainProg')) $('#trainProg').style.width = (e.it / (iters - 1) * 100) + '%'; });
    // итоговая ошибка на всех обучающих примерах — честнее, чем сглаженная по мини-батчам
    let sum = 0; for (let i = 0; i < data.X.length; i++) { const e = D.forward(st.model, data.X[i]) - data.Y[i]; sum += e * e; }
    st.mode = 'idle'; counts(); say('Политика обучена.', 'good'); notify();
    return { examples: data.X.length, loss: sum / Math.max(1, data.X.length) };
  }
  function drawLoss() {
    const c = $('#loss'); if (!c) return;
    const { c: g, k } = K.fit(c, 260, 70);
    g.clearRect(0, 0, 260, 70); g.strokeStyle = P.grid; g.beginPath(); g.moveTo(0, 69.5); g.lineTo(260, 69.5); g.stroke();
    if (lossPts.length < 2) { K.label(g, k, 'кривая ошибки появится при обучении', 130, 36, { px: 10.5, color: P.ink3, halo: false }); return; }
    const mx = Math.max(...lossPts), mn = Math.min(...lossPts), ly = (v) => 64 - (Math.log(v) - Math.log(mn)) / (Math.log(mx) - Math.log(mn) || 1) * 56;
    g.strokeStyle = P.e2e; g.lineWidth = 2; g.beginPath(); lossPts.forEach((v, i) => { const x = i / (lossPts.length - 1) * 256 + 2; i ? g.lineTo(x, ly(v)) : g.moveTo(x, ly(v)); }); g.stroke();
    K.label(g, k, 'ошибка обучения', 4, 8, { align: 'left', px: 10.5, color: P.ink3, halo: false });
  }

  /* ---------- проигрывание поездок ---------- */
  const okOf = (eps) => eps.filter((e) => e.outcome === 'goal').length;
  function play(kind) { st.mode = 'play'; st.playKind = kind; st.playT = 0; counts(); }
  function playLen() {
    const sets = st.layout === 'grid' ? st.panels.map((p) => p.runs) : [st.runs, st.ghost || []];
    let m = 1; for (const s of sets) for (const e of s) m = Math.max(m, e.traj.length); return m;
  }
  /** 10 проверочных поездок текущей политики. opts.ghost — поездки другой политики с тех же стартов (серые). */
  function runTrips(opts) {
    opts = opts || {};
    st.runs = D.trips(D.policy(st.model), 10); st.ghost = opts.ghost || null; st.panels = []; st.layout = 'single'; st.teach = null;
    play('trips'); say(st.ghost ? 'Обе Ады едут по десять раз с одних и тех же стартов…' : 'Едут десять копий Ады с чуть разных стартов…', 'info');
    return waitFor('trips');
  }
  function finishTrips() {
    const ok = okOf(st.runs), crash = st.runs.filter((e) => e.outcome === 'crash').length;
    const res = { ok, crash, outcomes: st.runs.map((e) => e.outcome) };
    if (st.ghost) { res.okGhost = okOf(st.ghost); res.ghostOutcomes = st.ghost.map((e) => e.outcome); }
    st.mode = 'idle'; counts();
    say(st.ghost ? `${st.labels.main}: ${ok} из 10, ${st.labels.ghost}: ${res.okGhost} из 10.` : `Доехали ${ok} из 10.`, ok >= 9 ? 'good' : 'bad');
    const li = document.createElement('li');
    if (st.pick) li.textContent = `политика из 1.1 + подсказки учителя: ${st.pick.sel.length} → ${ok} из 10`; else li.textContent = `${st.demos.length} ${plural(st.demos.length, 'демонстрация', 'демонстрации', 'демонстраций')}${st.demos.some((d) => d.mine) ? ' (есть твои)' : ''}${st.demos.some((d) => d.dart) ? ', шумный оператор' : ''}${st.aug ? ', сдвиги' : ''}${st.dagIt ? `, DAgger ×${st.dagIt}` : ''}${st.expert.data.X.length ? `, подсказок эксперта: ${st.expert.data.X.length}` : ''} → ${ok} из 10`;
    if ($('#history')) $('#history').prepend(li);
    notify(); done('trips', res);
  }

  /* ---------- несколько политик рядом: панели 2 × 2 ---------- */
  const prepare = (keys) => Promise.all(keys.map(ensure));
  async function compare(list) {
    st.probe = null; st.pick = null; st.ghost = null; st.runs = [];
    st.layout = 'grid'; st.panels = list.map((v) => ({ key: v.key, label: v.label, runs: [] }));
    if (list.some((v) => !(cache[v.key] && cache[v.key].done))) {
      st.mode = 'train'; counts();
      let n = list.filter((v) => cache[v.key] && cache[v.key].done).length;
      say(`Обучаем политики: готово ${n} из ${list.length}…`, 'info');
      await Promise.all(list.map((v) => ensure(v.key).then(() => { n++; say(`Обучаем политики: готово ${n} из ${list.length}…`, 'info'); })));
    }
    st.panels.forEach((p) => { p.runs = cache[p.key].runs; });
    play('compare'); say('Все Ады стартуют одновременно с одних и тех же мест…', 'info');
    await waitFor('compare');
    st.mode = 'idle'; counts(); notify();
    const rows = st.panels.map((p) => ({ key: p.key, label: p.label, ok: okOf(p.runs), outcomes: p.runs.map((e) => e.outcome) }));
    say('Готово: каждая Ада проехала 10 раз с одних и тех же стартов.', '');
    return { rows };
  }
  function setLayout(l, list) { if (l === 'grid') { clearRuns(); st.probe = null; st.pick = null; } st.layout = l; if (list) st.panels = list.map((v) => ({ key: v.key, label: v.label, runs: [] })); notify(); }

  /* ---------- политика из урока 1.1 и DAgger ---------- */
  /** Политика на 10 аккуратных поездках робота-оператора как стартовая точка урока 1.2. */
  async function useBC() {
    const e = await ensure('c10');
    st.demos = e.demos.slice(); st.aug = false; st.extra = { X: [], Y: [] }; st.labeled = []; st.dagIt = 0;
    st.model = D.cloneModel(e.model); counts(); notify();
    return e;
  }
  const bcRuns = () => ensure('c10').then((e) => e.runs);
  async function daggerIter() {
    st.probe = null; st.pick = null;
    const lab = D.daggerLabel(D.policy(st.model), 1, { noise: 0.2, seed: 700 + st.dagIt });
    st.extra.X.push(...lab.X); st.extra.Y.push(...lab.Y); st.labeled.push(...lab.eps); st.dagIt++;
    const ep = lab.eps[0];
    st.teach = ep.traj.slice(0, -1).map((s, i) => ({ s, w: D.teacher(s), wp: ep.acts[i] }));
    st.runs = lab.eps; st.ghost = null; st.panels = []; st.layout = 'single'; st.afterPlay = true; play('label');
    say('Ада едет сама, а учитель подсказывает правильный руль в каждой точке её пути…', 'info');
    await waitFor('labelplay');
    await train({ fine: true });
    return { labeled: lab.X.length, crashed: ep.outcome === 'crash', total: st.extra.X.length, it: st.dagIt };
  }

  /* ---------- «Поиск отказов»: перетаскиваемый старт ---------- */
  function nearData(s) {
    let best = Infinity, bq = null;
    for (const e of st.demos) for (const q of e.traj) { const d = Math.hypot(q.x - s.x, q.y - s.y); if (d < best) { best = d; bq = q; } }
    return { d: best, q: bq };
  }
  function probeMode(onOff) {
    if (!onOff) { if (st.probe && st.mode === 'probe') st.mode = 'idle'; st.probe = null; notify(); return; }
    clearRuns(); st.pick = null;
    st.probe = { pose: { ...D.START }, results: [], run: null, invalid: false };
    notify();
  }
  const validPose = (p) => p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20 && !D.collides(p.x, p.y) && Math.hypot(p.x - D.GOAL.x, p.y - D.GOAL.y) > D.GOAL.r + 30;
  function probeRun(pose) {
    if (!st.probe || !st.model || st.mode !== 'idle') return Promise.resolve(null);
    if (pose) st.probe.pose = { x: pose.x, y: pose.y, th: pose.th == null ? st.probe.pose.th : pose.th };
    const p = st.probe.pose;
    if (!validPose(p)) { st.probe.invalid = true; say('Отсюда старта нет: Ада задевает мебель или стоит слишком близко к кухне.', 'bad'); notify(); return Promise.resolve(null); }
    st.probe.invalid = false;
    st.probe.run = D.rollout(D.policy(st.model), { start: { ...p }, noise: 0 });
    st.mode = 'probe'; st.playT = 0;
    return waitFor('probe');
  }
  function finishProbe() {
    const pr = st.probe, ep = pr.run, p = pr.pose, nd = nearData(p);
    const dth = nd.q ? Math.abs(Math.atan2(Math.sin(p.th - nd.q.th), Math.cos(p.th - nd.q.th))) : Math.PI;
    const r = { pose: { ...p }, outcome: ep.outcome, near: nd.d, dth, time: (ep.traj.length - 1) * D.DT };
    pr.results.push(r); st.mode = 'idle';
    say(r.outcome === 'goal' ? `С этого старта Ада доехала за ${r.time.toFixed(1).replace('.', ',')} с.` : r.outcome === 'crash' ? `Отказ: Ада врезалась через ${r.time.toFixed(1).replace('.', ',')} с.` : 'Отказ: Ада заблудилась и не доехала за 26 с.', r.outcome === 'goal' ? '' : 'bad');
    notify(); done('probe', r);
  }
  function probeStats() {
    const res = st.probe ? st.probe.results : [], fails = res.filter((r) => r.outcome !== 'goal');
    const spots = []; for (const f of fails) if (!spots.some((q) => Math.hypot(q.x - f.pose.x, q.y - f.pose.y) < 30)) spots.push(f.pose);
    return { tested: res.length, fails: fails.length, failsNear: fails.filter((f) => f.near <= 20).length, distinct: spots.length, last: res[res.length - 1] || null };
  }

  /* ---------- «Где спросить учителя»: выбор кадров для разметки ---------- */
  async function pickMode(onOff, opts) {
    if (!onOff) { st.pick = null; notify(); return; }
    opts = opts || {};
    clearRuns(); st.probe = null;
    const e = await ensure('c10');
    const cands = []; e.runs.forEach((ep, k) => ep.traj.slice(0, -1).forEach((s, t) => cands.push({ s, k, t })));
    st.pick = { budget: opts.budget || 40, per: opts.per || 10, radius: opts.radius || 35, cands, sel: [], taps: [], base: e.runs, after: null };
    notify();
  }
  function pickTap(p) {
    const pk = st.pick; if (!pk || st.mode !== 'idle') return 0;
    if (pk.after) { pk.after = null; st.runs = []; st.ghost = null; }
    const left = pk.budget - pk.sel.length; if (left <= 0) { say(`Все ${pk.budget} подсказок уже распределены. Сбрось выбор, чтобы спросить в других местах.`, 'bad'); notify(); return 0; }
    const chosen = new Set(pk.sel);
    const near = pk.cands.filter((q) => !chosen.has(q)).map((q) => [q, Math.hypot(q.s.x - p.x, q.s.y - p.y)]).filter((a) => a[1] < pk.radius).sort((a, b) => a[1] - b[1]).slice(0, Math.min(pk.per, left));
    if (!near.length) { say('Здесь Ада не ездила — коснись ближе к её поездкам.', 'bad'); notify(); return 0; }
    near.forEach((a) => pk.sel.push(a[0])); pk.taps.push({ x: p.x, y: p.y });
    say(`Учитель разметит ${pk.sel.length} из ${pk.budget} кадров.`, 'info'); notify();
    return near.length;
  }
  function pickClear() { if (!st.pick || st.mode !== 'idle') return; st.pick.sel = []; st.pick.taps = []; st.pick.after = null; st.runs = []; st.ghost = null; say('Выбор сброшен.', ''); notify(); }
  /** Дообучить политику из 1.1 на кадрах, которые разметил учитель. opts.ghost — показать рядом исходную политику. */
  async function pickTrain(opts) {
    const pk = st.pick; if (!pk) return null;
    if (!pk.sel.length) return { ok: null, labels: 0 };
    const e = await ensure('c10'), m = D.cloneModel(e.model), X = e.data.X.slice(), Y = e.data.Y.slice();
    pk.sel.forEach((q) => { X.push(D.observe(q.s)); Y.push(D.teacher(q.s) / D.WMAX); });
    st.mode = 'train'; counts(); say(`Учитель разметил ${pk.sel.length} кадров, дообучаем политику…`, 'info');
    await runChunked(D.trainGen(m, { X, Y }, { iters: 500, lr: 0.003, seed: 12 }), (ev) => { if ($('#trainProg')) $('#trainProg').style.width = (ev.it / 499 * 100) + '%'; });
    st.model = m; st.mode = 'idle';
    const r = await runTrips(opts && opts.ghost ? { ghost: e.runs } : undefined);
    pk.after = st.runs;
    return Object.assign(r, { labels: pk.sel.length, taps: pk.taps.length });
  }

  /* ---------- «Ты — эксперт»: перехват управления ---------- */
  /** Трудный старт: поездка проверки, где политика из 1.1 врезается; шум тот же, что в проверке. */
  function expertSetup(k) {
    const starts = D.tripStarts(10, D.EVAL_SEED);
    st.expert = { on: false, data: { X: [], Y: [] }, takeovers: 0, trips: 0, start: k == null ? null : starts[k], seed: k == null ? null : k, trip: 0 };
    st.expertPts = []; clearRuns(); st.probe = null; st.pick = null; counts(); notify();
  }
  function expertRun(opts) {
    opts = opts || {};
    clearRuns(); st.probe = null; st.pick = null;
    const ex = st.expert, start = ex.start ? { ...ex.start } : D.randStart(D.rng(900 + ex.trips), 0.9);
    st.mode = 'expert'; st.drive = { s: start, t: 0, traj: [start], acts: [], took: false, trip: 0, samples: 0, fine: !!opts.fine, r: ex.seed != null ? D.tripRng(D.EVAL_SEED, ex.seed) : D.rng(4242 + ex.trips) };
    st.cursor = null;
    say('Ада едет сама. Зажми кнопку мыши или коснись сцены, чтобы вести её; отпусти, когда она снова на маршруте.', 'info'); counts();
    return waitFor('expert');
  }
  async function endExpert(end) {
    const d = st.drive, ex = st.expert;
    ex.trips++; ex.on = false;
    st.mode = 'idle'; st.drive = null; st.runs = [{ traj: d.traj, outcome: end }];
    say(end === 'goal' ? `Доехала. Вмешательств за поездку: ${d.trip}.` : `Ада врезалась. Вмешательств за поездку: ${d.trip}.`, end === 'goal' ? 'good' : 'bad'); counts();
    if (d.fine && d.samples > 0) await train({ fine: true, seed: 30 + ex.trips });
    notify();
    done('expert', { outcome: end, takeovers: d.trip, totalTakeovers: ex.takeovers, samples: ex.data.X.length, newSamples: d.samples, trip: ex.trips });
  }
  function expertStep(dt) {
    const d = st.drive, pol = D.policy(st.model);
    d.acc = (d.acc || 0) + dt;
    while (d.acc >= D.DT && st.mode === 'expert') {
      d.acc -= D.DT;
      const s = d.s; let w;
      if (st.expert.on && st.cursor) {
        const a = Math.atan2(st.cursor.y - s.y, st.cursor.x - s.x) - s.th; w = D.clamp(2.4 * Math.atan2(Math.sin(a), Math.cos(a)), -D.WMAX, D.WMAX);
        st.expert.data.X.push(D.observe(s)); st.expert.data.Y.push(w / D.WMAX); st.expertPts.push(s); d.samples++;
        if (!d.took) { d.took = true; d.trip++; st.expert.takeovers++; }
      } else { w = pol(s); d.took = false; }
      const s2 = D.step(s, D.clamp(w + D.randn(d.r) * 0.2, -D.WMAX * 1.3, D.WMAX * 1.3)); d.traj.push(s2); d.s = s2; d.t += D.DT;
      const end = D.collides(s2.x, s2.y) ? 'crash' : Math.hypot(s2.x - D.GOAL.x, s2.y - D.GOAL.y) < D.GOAL.r ? 'goal' : d.t > D.TMAX ? 'timeout' : null;
      if (end) { st.mode = 'finishing'; endExpert(end); return; }
    }
  }

  /* ---------- отрисовка ---------- */
  function drawRuns(c, eps, color, upto, alpha, lw, mr) {
    for (const e of eps) {
      c.lineWidth = lw || 1.8; c.strokeStyle = color; c.globalAlpha = alpha == null ? 0.85 : alpha;
      line(c, e.traj, upto); c.globalAlpha = 1;
      const n = upto == null ? e.traj.length : Math.max(1, Math.min(upto, e.traj.length)), s = e.traj[n - 1];
      if (upto != null && n < e.traj.length) ada(c, s, color, 0.9);
      else mark(c, s, e.outcome, P, mr);
    }
  }
  /** Разметка учителя: точка в каждом размеченном кадре и дуга «куда повернул бы учитель» там, где он не согласен с политикой. */
  function drawTeach(c, upto) {
    if (!st.teach) return;
    const n = upto == null ? st.teach.length : Math.min(upto, st.teach.length);
    c.fillStyle = P.classic;
    for (let i = 0; i < n; i += 2) { const { s } = st.teach[i]; c.beginPath(); c.arc(s.x, s.y, 2.3, 0, 7); c.fill(); }
    let last = -99;
    for (let i = 0; i < n; i++) { const t = st.teach[i]; if (Math.abs(t.w - t.wp) > 0.35 && i - last >= 5) { arc(c, t.s, t.w, 0.45, P.classic, 2.2); last = i; } }
  }
  function drawDataLayer(c) {
    if (st.view === 'heat') heat(c, P, dataEps(), st.mode !== 'play' ? (st.layout === 'single' ? st.runs.concat(st.ghost || []) : []) : null);
    else if (st.showDemos) { c.strokeStyle = P.ink3; c.globalAlpha = 0.45; c.lineWidth = 1.4; for (const e of st.demos) line(c, e.traj); c.globalAlpha = 1; }
    if (st.view === 'route') { c.strokeStyle = P.classic; c.lineWidth = 2; c.setLineDash([2, 5]); c.beginPath(); D.PATH.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); }
  }
  function drawProbe(c, k) {
    const pr = st.probe;
    for (const r of pr.results) {
      const p = r.pose, fail = r.outcome !== 'goal';
      c.strokeStyle = fail ? P.bad : P.good; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(p.th) * 16, p.y + Math.sin(p.th) * 16); c.stroke();
      if (fail) K.cross(c, p.x, p.y, 5, P.bad, 2.4); else { c.beginPath(); c.arc(p.x, p.y, 4.5, 0, 7); c.fillStyle = P.good; c.fill(); }
    }
    if (pr.run) {
      const upto = st.mode === 'probe' ? Math.floor(st.playT / D.DT * 4) : null;
      c.strokeStyle = P.e2e; c.lineWidth = 2; line(c, pr.run.traj, upto);
      const n = upto == null ? pr.run.traj.length : Math.max(1, Math.min(upto, pr.run.traj.length));
      if (st.mode === 'probe' && n < pr.run.traj.length) ada(c, pr.run.traj[n - 1], P.e2e, 0.95);
      else mark(c, pr.run.traj[pr.run.traj.length - 1], pr.run.outcome, P);
    }
    const p = pr.pose, hx = p.x + Math.cos(p.th) * 40, hy = p.y + Math.sin(p.th) * 40;
    c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(hx, hy); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(hx, hy, 7, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke();
    ada(c, p, pr.invalid ? P.bad : P.ink, st.mode === 'probe' ? 0.45 : 1);
    if (!pr.results.length && st.mode === 'idle') K.label(c, k, 'перетащи Аду или коснись свободного места', p.x + 30, p.y - 36, { align: 'left', color: P.ink, weight: 650 });
    const ps = probeStats();
    K.label(c, k, `стартов: ${ps.tested} · отказов: ${ps.fails}`, W - 10 * k, 14 * k, { align: 'right', mono: true, px: 11, color: P.ink2, haloColor: P.bg });
  }
  function drawPick(c, k) {
    const pk = st.pick, showBase = !pk.after;
    if (showBase) drawRuns(c, pk.base, P.ink3, null, 0.75, 1.6);
    c.strokeStyle = P.classic; c.lineWidth = 1.3; c.setLineDash([3, 4]);
    for (const t of pk.taps) { c.beginPath(); c.arc(t.x, t.y, pk.radius, 0, 7); c.stroke(); }
    c.setLineDash([]); c.fillStyle = P.classic;
    for (const q of pk.sel) { c.beginPath(); c.arc(q.s.x, q.s.y, 3.4, 0, 7); c.fill(); }
  }
  function drawSingle(c, k) {
    house(c, k, P);
    drawDataLayer(c);
    if (st.probe) drawProbe(c, k);
    if (st.pick) drawPick(c, k);
    const playing = st.mode === 'play', upto = playing ? Math.floor(st.playT / D.DT * SPEED) : null;
    if (st.ghost) drawRuns(c, st.ghost, P.ink3, upto, 0.75);
    if (st.lastTry && st.mode === 'idle' && !st.runs.length && !st.probe && !st.pick) {
      c.strokeStyle = st.lastTry.outcome === 'goal' ? P.ink2 : P.bad; c.lineWidth = 1.6; c.setLineDash([5, 4]); line(c, st.lastTry.traj); c.setLineDash([]);
      mark(c, st.lastTry.traj[st.lastTry.traj.length - 1], st.lastTry.outcome, P);
    }
    if (st.runs.length) drawRuns(c, st.runs, P.e2e, upto, 0.85, st.playKind === 'label' && playing ? 2.2 : 1.8);
    if (st.teach) drawTeach(c, upto);
    if (st.drive) {
      const s = st.drive.s, L = D.lidar(s.x, s.y, s.th);
      c.strokeStyle = P.classic; c.globalAlpha = 0.5; c.lineWidth = 1;
      for (let i = 0; i < D.NRAY; i++) { const a = s.th - D.FOV + 2 * D.FOV * i / (D.NRAY - 1); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(a) * L[i], s.y + Math.sin(a) * L[i]); c.stroke(); }
      c.globalAlpha = 1;
      c.strokeStyle = st.mode === 'expert' ? (st.expert.on ? P.classic : P.e2e) : P.ink; c.lineWidth = 2; line(c, st.drive.traj);
      ada(c, s, st.mode === 'expert' && st.expert.on ? P.classic : P.ink);
      if (st.cursor && (st.mode === 'record' || st.expert.on)) { c.strokeStyle = P.ink; c.lineWidth = 1.4; c.beginPath(); c.arc(st.cursor.x, st.cursor.y, 7, 0, 7); c.stroke(); }
      if (st.mode === 'record' && !st.drive.started) K.label(c, k, 'наведи сюда, чтобы поехать', s.x + 30, s.y - 34, { align: 'left', color: P.ink, weight: 650 });
      if (st.mode === 'expert') K.label(c, k, `вмешательств за поездку: ${st.drive.trip}`, W - 10 * k, 14 * k, { align: 'right', mono: true, px: 11, color: P.ink2, haloColor: P.bg });
    } else if (!playing && !st.probe && !st.runs.length && !st.pick) {
      if (st.expert.start) ada(c, st.expert.start, P.ink, 0.9); else ada(c, D.START, P.ink, 0.9);
    }
    const info = st.mode === 'record' ? 'запись поездки' : st.mode === 'expert' ? (st.expert.on ? 'ведёшь ты' : 'едет политика') : st.mode === 'train' ? 'обучение…' : st.playKind === 'label' && playing ? 'учитель размечает поездку' : '';
    if (info) K.label(c, k, info, 10 * k, 14 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
  }
  function drawGrid(c, k) {
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const gap = 6, qw = W / 2 - gap / 2, qh = H / 2 - gap / 2, s = Math.min(qw / W, qh / H), playing = st.mode === 'play', upto = playing ? Math.floor(st.playT / D.DT * SPEED) : null;
    st.panels.slice(0, 4).forEach((p, i) => {
      const ox = (i % 2) * (W / 2 + gap / 2) + (qw - W * s) / 2, oy = Math.floor(i / 2) * (H / 2 + gap / 2) + (qh - H * s) / 2;
      c.save(); c.translate(ox, oy); c.scale(s, s); c.beginPath(); c.rect(0, 0, W, H); c.clip();
      const kk = k / s;
      house(c, kk, P, { labels: false });
      if (p.runs.length) drawRuns(c, p.runs, P.e2e, upto, 0.85, 2.8, 12);
      else ada(c, D.START, P.ink, 0.9);
      K.label(c, kk, p.label, 14 * kk, 13 * kk, { align: 'left', px: 11.5, weight: 700, color: P.ink, haloColor: P.bg });
      c.restore();
    });
    if (st.mode === 'train') K.label(c, k, 'обучение…', W / 2, H / 2, { px: 12, mono: true, color: P.ink2, haloColor: P.surf });
  }
  function draw() {
    const { c, k } = K.fit(cv, W, H);
    if (st.layout === 'grid') drawGrid(c, k); else drawSingle(c, k);
    drawTripGrid();
  }

  /* ---------- сетка исходов ✓/✗ под сценой ---------- */
  let gridSig = '';
  function tripRows() {
    if (st.layout === 'grid') return st.panels.map((p) => ({ label: p.label, runs: p.runs, color: 'var(--e2e)' }));
    if (st.mode === 'play' && st.playKind === 'label') return [];
    const rows = [];
    if (st.ghost) rows.push({ label: st.labels.ghost, runs: st.ghost, color: 'var(--ink-3)' });
    if (st.runs.length === 10) rows.push({ label: st.labels.main, runs: st.runs, color: 'var(--e2e)' });
    return rows;
  }
  function drawTripGrid() {
    const box = $('#tripGrid'); if (!box) return;
    const rows = tripRows(), sig = rows.map((r) => r.label + ':' + r.runs.length).join('|');
    if (sig !== gridSig) {
      gridSig = sig; box.innerHTML = ''; box.hidden = !rows.some((r) => r.runs.length);
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'tg-row';
        const lab = document.createElement('span'); lab.className = 'tg-label'; lab.innerHTML = `<i style="background:${r.color}"></i>`; lab.append(document.createTextNode(r.label));
        const cells = document.createElement('span'); cells.className = 'tg-cells';
        for (let i = 0; i < 10; i++) { const s = document.createElement('b'); s.className = 'tg-cell'; cells.append(s); }
        const sum = document.createElement('span'); sum.className = 'tg-sum';
        row.append(lab, cells, sum); box.append(row);
      }
    }
    const upto = st.mode === 'play' ? Math.floor(st.playT / D.DT * SPEED) : Infinity;
    rows.forEach((r, i) => {
      const row = box.children[i]; if (!row) return;
      const cells = row.querySelector('.tg-cells').children; let ok = 0, fin = 0;
      for (let j = 0; j < 10; j++) {
        const e = r.runs[j], cell = cells[j]; if (!cell) continue;
        const end = e && upto >= e.traj.length, cls = !e ? 'tg-cell' : !end ? 'tg-cell run' : e.outcome === 'goal' ? 'tg-cell ok' : 'tg-cell no';
        if (cell.className !== cls) { cell.className = cls; cell.textContent = !e || !end ? '' : e.outcome === 'goal' ? '✓' : '✗'; }
        if (end) { fin++; if (e.outcome === 'goal') ok++; }
      }
      const sum = row.querySelector('.tg-sum'), t = r.runs.length ? (fin === r.runs.length ? `${ok} из 10` : `${ok}…`) : '';
      if (sum.textContent !== t) sum.textContent = t;
    });
  }

  /* ---------- ввод ---------- */
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  cv.addEventListener('pointermove', (e) => { if (st.mode === 'record' || st.mode === 'expert') { st.cursor = pt(e); if (st.mode === 'record' && st.drive) st.drive.started = true; } });
  cv.addEventListener('pointerdown', (e) => { if (st.mode === 'record' || st.mode === 'expert') { st.cursor = pt(e); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } if (st.mode === 'record') st.drive.started = true; if (st.mode === 'expert') st.expert.on = true; } });
  const up = () => { st.expert.on = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('touchstart', (e) => { if (st.mode === 'record' || st.mode === 'expert') e.preventDefault(); }, { passive: false });
  // перетаскивание старта и выбор кадров: касание по Аде блокирует прокрутку, касание мимо — нет
  K.drag(cv, W, H, {
    hit: (p) => {
      const pr = st.probe; if (!pr || st.mode !== 'idle') return null;
      const hx = pr.pose.x + Math.cos(pr.pose.th) * 40, hy = pr.pose.y + Math.sin(pr.pose.th) * 40;
      if (Math.hypot(p.x - hx, p.y - hy) < 16) return 'head';
      if (Math.hypot(p.x - pr.pose.x, p.y - pr.pose.y) < D.R + 10) return 'body';
      return null;
    },
    start: () => { if (st.probe) st.probe.run = null; },
    move: (obj, p) => {
      const pr = st.probe; if (!pr) return;
      if (obj === 'head') pr.pose.th = Math.atan2(p.y - pr.pose.y, p.x - pr.pose.x);
      else { pr.pose.x = D.clamp(p.x, 0, W); pr.pose.y = D.clamp(p.y, 0, H); }
      pr.invalid = !validPose(pr.pose);
    },
    end: () => { if (st.probe) probeRun(); },
    tap: (p) => {
      if (st.pick) { pickTap(p); return; }
      if (st.probe && st.mode === 'idle') probeRun({ x: p.x, y: p.y });
    },
  });

  /* ---------- свободный режим: кнопки, если они есть в разметке ---------- */
  on('#btnRecord', 'click', () => { if (st.mode === 'idle') record(); });
  on('#btnDemos', 'click', () => { if (st.mode === 'idle') addDemos(10, { dart: $('#optDart') && $('#optDart').checked }); });
  on('#btnClear', 'click', () => { if (st.mode === 'idle') { reset(); say('Данные и политика сброшены.', ''); } });
  on('#btnTrain', 'click', () => { if (st.mode === 'idle') train({ fine: st.dagIt > 0 || st.expert.data.X.length > 0 }); });
  on('#btnRun', 'click', () => { if (st.mode === 'idle' && st.model) runTrips(); });
  on('#btnDagger', 'click', () => { if (st.mode === 'idle' && st.model) daggerIter(); });
  on('#btnExpert', 'click', () => { if (st.mode === 'idle' && st.model) expertRun({ fine: !!$('#btnExpert').dataset.fine }); });
  on('#optAug', 'change', () => { st.aug = $('#optAug').checked; counts(); });
  document.querySelectorAll('[name="view"]').forEach((r) => r.addEventListener('change', () => setView(r.value)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  K.loop(cv, (dt) => {
    if (st.mode === 'record') recordStep(dt);
    if (st.mode === 'expert') expertStep(dt);
    if (st.mode === 'probe' && st.probe && st.probe.run) { st.playT += dt; if (st.playT / D.DT * 4 >= st.probe.run.traj.length) finishProbe(); }
    if (st.mode === 'play') {
      st.playT += dt;
      if (st.playT / D.DT * SPEED >= playLen()) {
        if (st.playKind === 'label') { st.afterPlay = false; st.mode = 'idle'; done('labelplay', true); }
        else if (st.playKind === 'compare') { st.mode = 'idle'; done('compare', true); }
        else finishTrips();
      }
    }
    draw();
  });
  const redraw = () => { try { draw(); } catch (e) { /* канвас ещё не виден */ } };
  if (typeof App !== 'undefined' && App.on) { App.on('theme', () => { P = pal(); redraw(); drawLoss(); }); App.on('resize', () => { redraw(); drawLoss(); }); }

  const api = {
    state: st, reset, addDemos, setAug: (v) => { st.aug = !!v; counts(); notify(); }, setView, record, train, runTrips, daggerIter, expertRun, expertSetup,
    resetExpert: () => { st.expert = { on: false, data: { X: [], Y: [] }, takeovers: 0, trips: 0, start: st.expert.start, seed: st.expert.seed, trip: 0 }; st.expertPts = []; counts(); },
    busy: () => st.mode !== 'idle',
    ensure, prepare, compare, setLayout, useBC, bcRuns, cache,
    probeMode, probeRun, probeStats, pickMode, pickTap, pickClear, pickTrain,
    setLabels: (o) => { Object.assign(st.labels, o); gridSig = null; },
    setOpts: (o) => { if (o && 'demos' in o) st.showDemos = !!o.demos; notify(); },
    showRuns: (o) => { st.layout = 'single'; st.panels = []; st.teach = null; st.runs = (o && o.runs) || []; st.ghost = (o && o.ghost) || null; notify(); },
    onChange: (f) => listeners.push(f), say, clearRuns: () => { clearRuns(); notify(); },
  };
  window.__lab = { st, D, api };
  window.DriveLab = api;
  counts(); drawLoss(); say('Сцена готова.', '');
})();
