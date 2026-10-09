/* =====================================================================
   ui-l33.js — урок 3.3 «RT-2». Интерактивы — миссии на живой сцене
   (shared/missions.js):
   1) «Действие словами»: ползунки позы захвата → строка из восьми чисел →
      плитки токенов PaLI-X или PaLM-E; строку можно править руками;
   2) лаборатория: мини-VLA на столе из 2.1 в трёх режимах обучения из
      таблицы 6 статьи — с нуля, дообучение VLM только на действиях,
      совместное дообучение; сравнение рядом на одной сцене, подписи;
   3) таблицы 4 и 6 статьи с наведением; сортировка команд из статьи.
   Движок — l33/engine.js поверх l21/engine.js (без DOM).
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pc = (v, d) => fmt(v * 100, d == null ? 0 : d) + '%';
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
/** Дать странице перерисоваться: кадр или, если вкладка в фоне и кадров нет, таймер. */
const nextFrame = () => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Картинка движка (Float32Array RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
function drawBitmap(c, bm, x, y, w, hgt) { c.imageSmoothingEnabled = false; c.drawImage(bm, x, y, w, hgt); }
const colorWord = (id, g) => { const c = L21.COLORS[L21.CI[id]]; return g === 'f' ? c.f : c.m; };
const rgbCss = (id) => { const [r, g, b] = L21.COLORS[L21.CI[id]].rgb; return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`; };

/* =====================================================================
   1. Действие словами: ползунки → строка → токены
   ===================================================================== */
const LabTok = (() => {
  const E = L33, W = 600, H = 250;
  const PAPER = '1 128 91 241 5 101 127';                       // пример строки из статьи: семь чисел при восьми полях
  const st = { bins: [0, 128, 128, 128, 128, 128, 128, 128], tok: 'palix', hi: null, lastErr: '', accepted: null };
  let ctl = null;
  const pose = () => E.binsToPose(st.bins);
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 2);
  function draw() {
    const { c, k } = HeroKit.fit($('#tCv'), W, H), P = pal(), p = pose(), dark = HeroKit.dark();
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const narrow = k > 1.5;
    // вид сверху: смещение по x, y и поворот вокруг вертикали
    const cx = 150, cy = 128, R = 62;
    c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(cx - 100, cy - 92, 200, 184);
    c.setLineDash([3, 4]); c.beginPath(); c.moveTo(cx - 100, cy); c.lineTo(cx + 100, cy); c.moveTo(cx, cy - 92); c.lineTo(cx, cy + 92); c.strokeStyle = P.line; c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, 'вид сверху', cx, 14, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, '+x', cx + 92, cy - 10, { px: 10.5, color: P.ink3, haloColor: P.bg }); HeroKit.label(c, k, '+y', cx + 12, cy - 84, { px: 10.5, color: P.ink3, haloColor: P.bg });
    const tx = cx + p.dx * R, ty = cy - p.dy * R;
    if (Math.hypot(tx - cx, ty - cy) > 2) { c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(cx, cy); c.lineTo(tx, ty); c.stroke(); c.setLineDash([]); }
    gripperTop(c, cx, cy, p.rz * Math.PI, P.ink3, 1, 0.5); gripperTop(c, tx, ty, p.rz * Math.PI, P.e2e, 2.4, p.grip);
    // вид сбоку: подъём, наклон и раскрытие
    const sx = 440, sy = 150;
    c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(sx - 130, 36, 260, 184);
    c.fillStyle = P.line; c.fillRect(sx - 130, sy + 56, 260, 3);
    HeroKit.label(c, k, 'вид сбоку', sx, 14, { px: 11.5, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, '+z', sx - 118, 50, { px: 10.5, color: P.ink3, haloColor: P.bg });
    const gz = sy - p.dz * 46;
    gripperSide(c, sx - 60, sy, 0, 0.5, P.ink3, 1); gripperSide(c, sx + 40, gz, p.ry * Math.PI / 2, p.grip, P.e2e, 2.4);
    if (Math.abs(gz - sy) > 2) { c.strokeStyle = P.e2e; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(sx - 10, sy); c.lineTo(sx - 10, gz); c.stroke(); c.setLineDash([]); }
    // крен — дуга со стрелкой
    const ax = sx + 100, ay = 62; c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.beginPath(); c.arc(ax, ay, 14, Math.PI * 0.8, Math.PI * 2.2); c.stroke();
    c.strokeStyle = P.e2e; c.lineWidth = 2.4; c.beginPath(); c.arc(ax, ay, 14, -Math.PI / 2, -Math.PI / 2 + p.rx * Math.PI * 0.7, p.rx < 0); c.stroke();
    if (!narrow) HeroKit.label(c, k, `крен ${sgn(p.rx)}`, ax, ay + 28, { px: 10.5, color: P.ink2, haloColor: P.bg });
    const grip = p.grip <= 0.1 ? 'губки сомкнуты' : p.grip >= 0.9 ? 'губки раскрыты' : `захват раскрыт на ${pc(p.grip)}`;
    HeroKit.label(c, k, narrow ? grip : `${grip} · наклон ${sgn(p.ry)} · подъём ${sgn(p.dz)}`, sx, 236, { px: 11, color: P.ink2, haloColor: P.bg });
    if (st.bins[0] === 1) { c.strokeStyle = P.bad; c.lineWidth = 3; c.strokeRect(2, 2, W - 4, H - 4); HeroKit.label(c, k, 'признак завершения = 1: эпизод окончен, движение не исполняется', W / 2, H - 14, { px: 12, weight: 700, color: P.bad, haloColor: P.bg }); }
    else if (!narrow) HeroKit.label(c, k, `смещение x ${sgn(p.dx)}, y ${sgn(p.dy)} · поворот ${sgn(p.rz)}`, cx, H - 14, { px: 11, color: P.ink2, haloColor: P.bg });
    void dark;
  }
  function gripperTop(c, x, y, a, col, lw, open) {
    c.save(); c.translate(x, y); c.rotate(-a); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
    const g = 6 + open * 14; c.beginPath(); c.moveTo(-g, -12); c.lineTo(-g, 12); c.moveTo(g, -12); c.lineTo(g, 12); c.moveTo(-g, 0); c.lineTo(g, 0); c.moveTo(0, 0); c.lineTo(0, 22); c.stroke(); c.restore();
  }
  function gripperSide(c, x, y, tilt, open, col, lw) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
    const g = 5 + open * 13; c.beginPath(); c.moveTo(0, -40); c.lineTo(0, -8); c.moveTo(-g - 4, -8); c.lineTo(g + 4, -8); c.moveTo(-g, -8); c.lineTo(-g, 18); c.moveTo(g, -8); c.lineTo(g, 18); c.stroke(); c.restore();
  }
  function renderSliders() {
    const box = $('#tSliders'); box.innerHTML = '';
    E.FIELDS.forEach((f, i) => {
      const lab = h('label', { class: 'tok-sl ' + f.kind }, h('span', null, f.name), h('output', null, ''), h('input', { type: 'range', min: 0, max: f.kind === 'flag' ? 1 : E.NB - 1, step: 1, value: st.bins[i], 'aria-label': f.name }));
      lab.querySelector('input').addEventListener('input', (e) => { st.bins[i] = +e.target.value; st.hi = i; st.accepted = null; st.lastErr = ''; render(); if (ctl) ctl.update(); });
      box.append(lab);
    });
  }
  function renderStrip() {
    $$('#tSliders .tok-sl').forEach((lab, i) => { const inp = lab.querySelector('input'); inp.value = st.bins[i]; const f = E.FIELDS[i], v = E.fromBin(st.bins[i], f.kind); lab.querySelector('output').textContent = f.kind === 'flag' ? (st.bins[i] ? '1 · да' : '0 · нет') : f.kind === 'grip' ? `${st.bins[i]} · ${pc(v)}` : `${st.bins[i]} · ${sgn(v)}`; });
    $('#tStr').textContent = E.binsToString(st.bins);
    const toks = st.tok === 'palix' ? E.tokenizePaliX(st.bins) : E.tokenizePalmE(st.bins), box = $('#tTokens'); box.innerHTML = '';
    toks.forEach((t, i) => box.append(h('span', { class: 'tok-tile ' + (i === 0 ? 'flag' : t.kind) + (st.hi === i ? ' hi' : ''), title: i === 0 ? 'признак завершения: отдельная команда 0 или 1' : st.tok === 'palix' ? `токен «${t.text}» — один из тысячи числовых токенов PaLI-X` : `редкий токен словаря PaLM-E, переназначенный под корзину ${t.id}` }, t.text, h('small', null, E.FIELDS[i].short))));
    if (document.activeElement !== $('#tInput')) $('#tInput').value = E.binsToString(st.bins);
    $('#tErr').textContent = st.lastErr;
  }
  function out() {
    const p = pose(), n = st.bins.length;
    setOut($('#tOut'), `${st.tok === 'palix' ? 'PaLI-X' : 'PaLM-E'}: действие — <b>${n} токенов</b> из общего словаря модели${st.tok === 'palix' ? ', каждое число — свой токен' : ', каждая корзина — один из 256 переназначенных редких токенов'}. ${st.bins[0] ? 'Признак завершения 1: робот заканчивает эпизод.' : `Смещение x ${sgn(p.dx)}, y ${sgn(p.dy)}, z ${sgn(p.dz)} от диапазона; ${p.grip <= 0.1 ? 'губки сомкнуты' : p.grip >= 0.9 ? 'губки раскрыты' : 'захват раскрыт на ' + pc(p.grip)}.`}`);
  }
  function render() { renderStrip(); draw(); out(); }
  function apply(str) {
    const r = E.parseBins(str);
    if (r.error) { st.lastErr = 'Строка не принята: ' + r.error + '.'; st.accepted = false; render(); if (ctl) ctl.update(); return { ok: false, error: r.error, str }; }
    st.bins = r.bins.slice(); st.lastErr = ''; st.hi = null; st.accepted = true; render(); if (ctl) ctl.update();
    return { ok: true, bins: st.bins.slice(), str };
  }
  function state() { const p = pose(); return { bins: st.bins.slice(), term: st.bins[0], dx: p.dx, grip: p.grip, gripBin: st.bins[7], tok: st.tok, accepted: st.accepted, err: st.lastErr }; }
  function setTok(v) { st.tok = v; segSet('#tTok', v); render(); if (ctl) ctl.update(); }
  function setBins(b) { st.bins = b.slice(); st.hi = null; st.lastErr = ''; st.accepted = null; render(); if (ctl) ctl.update(); }
  const api = {
    reset() { setTok('palix'); setBins([0, 128, 128, 128, 128, 128, 128, 128]); $('#tInput').value = E.binsToString(st.bins); },
    state, setTok, setBins, apply,
    applyInput() { return apply($('#tInput').value); },
    setInput(s) { $('#tInput').value = s; },
  };
  const missions = [
    { short: 'Запиши', title: 'Запиши действие восемью числами', text: 'Задай ползунками действие: сдвинуть захват по x вперёд не меньше чем на треть диапазона, при этом сомкнуть губки и не завершать эпизод. Следи за строкой под сценой: она меняется с каждым ползунком.',
      criteria: [{ label: 'Признак завершения — 0', test: (r, s) => s.term === 0 }, { label: 'Корзина Δx не меньше 170: смещение больше трети диапазона', test: (r, s) => s.bins[1] >= 170 }, { label: 'Захват сомкнут: корзина захвата не больше 25', test: (r, s) => s.gripBin <= 25 }],
      hint: 'Ползунок Δx — второй в ряду, захват — последний. Корзина 128 — середина шкалы, нулевое смещение.',
      explain: (r) => `Действие стало строкой «${E.binsToString(r.bins)}»: восемь целых, первое — отдельная команда 0 или 1, остальные — номера корзин из 256. Для PaLI-X это восемь токенов из тех, что уже были в словаре для чисел: модель предсказывает их так же, как слова ответа. Такое же разбиение на 256 корзин было у RT-1 в уроке 3.1, новое в RT-2 то, что корзины стали токенами языковой модели.` },
    { short: 'Прочитай', title: 'Прочитай строку из статьи', text: `В статье приведён пример целевой строки: «${PAPER}». Вставь его в поле «Строка действия» и примени.`,
      controls: ['input'], onEnter: (X) => { X.setInput(PAPER); },
      bet: { q: 'что сделает робот по этой строке?', options: ['Сдвинется по x и повернётся: 128, 91, 241 — это смещения', 'Ничего: первое число 1 — признак завершения эпизода', 'Переводчик строку не примет'], answer: (r) => (!r.ok ? 2 : r.bins[0] === 1 ? 1 : 0) },
      action: { label: 'Применить строку', run: (X) => Promise.resolve(X.applyInput()) },
      criteria: [{ label: 'Строка принята: восемь целых в допустимых пределах', test: (r) => r.ok }, { label: 'Признак завершения — 1', test: (r) => r.ok && r.bins[0] === 1 }],
      fail: (r) => `Строка не принята: ${r.error}. В статье пример напечатан с семью числами при восьми полях — в нём не хватает одного. Допиши восьмое число, например захват 127, и примени снова.`,
      explain: (r) => `Строка «${r.str.trim()}» принята. Первое число — 1, это признак завершения: модель сообщает, что задача выполнена, и движение не исполняется, что бы ни стояло в остальных семи корзинах. Ограничение вывода в RT-2 работает похоже: при команде роботу модель может выдать только допустимые токены действия, и строка со словами или с числом вне диапазона появиться не может.` },
    { short: 'Два словаря', title: 'Сравни токенизаторы', text: 'Разожми захват полностью и переключи токенизатор на PaLM-E. Сравни плитки токенов для одной и той же строки.',
      controls: ['input', 'tok'],
      criteria: [{ label: 'Захват раскрыт: корзина не меньше 250', test: (r, s) => s.gripBin >= 250 }, { label: 'Токенизатор — PaLM-E', test: (r, s) => s.tok === 'palme' }],
      hint: 'Переключатель «Токенизатор» — под ползунками. Захват — последний ползунок или последнее число строки.',
      explain: () => 'Строка та же, а токены разные. У PaLI-X число 255 — обычный токен «255», один из тысячи числовых токенов словаря. В словаре PaLM-E отдельных токенов для чисел нет, поэтому авторы переписали под действия 256 самых редких токенов: корзина 255 — редкий токен, который раньше означал что-то другое и теперь означает «захват раскрыт». В обоих случаях действие занимает восемь токенов, а слова ответа остаются в словаре рядом с ними.' },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай ползунки, правь строку, переключай словари. Найди действие, у которого две соседние корзины дают неразличимое на схеме движение, и прикинь, какую точность это задаёт при 256 корзинах.', final: true, controls: ['input', 'tok'] },
  ];
  function init() {
    renderSliders();
    segBind('#tTok', setTok);
    legend('#tLegend', [['исходная поза: нулевое действие', 'var(--ink-3)', 'grip'], ['поза после действия', 'var(--e2e)', 'grip'], ['смещение', 'var(--e2e)', 'dash']]);
    $('#tApply').addEventListener('click', () => api.applyInput());
    $('#tInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') api.applyInput(); });
    ctl = mountMissions('#tMis', missions, api, { controls: { input: '#wrapTInput', tok: '#wrapTTok' }, scene: '#tCv' });
    render(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, PAPER };
})();

/* =====================================================================
   2. Лаборатория: мини-VLA в трёх режимах обучения, сравнение рядом
   ===================================================================== */
const LabVla = (() => {
  const E = L33, L = L21, W = 440, NT = 20, NR = 300, NWEB = 240, CAPN = 48;
  const KINDS = [
    { id: 'vlm', name: 'VLM: только веб-пары', col: '--hybrid', acts: false },
    { id: 'scratch', name: 'С нуля: только демонстрации', col: '--ink-3', acts: true },
    { id: 'ft', name: 'Дообучение: VLM → действия', col: '--classic', acts: true },
    { id: 'co', name: 'Совместное: VLM → действия + веб', col: '--e2e', acts: true },
  ];
  const SEEDS = { a: 35, b: 34, c: 33 };
  const EPOCHS = { vlm: 60, scratch: 100, ft: 120, co: 120 };
  const st = { color: 'purple', web: NWEB, seed: 'a', scene: 2, busy: null, M: {}, bms: {}, prog: 0 };
  let ctl = null, robot = null, webAll = null;
  function data() { if (!robot) { robot = E.robotData(NR, 300); webAll = E.webData(NWEB, 500); } return { robot, web: webAll.slice(0, st.web) }; }
  const key = (kind) => (kind === 'scratch' ? `scratch:${st.seed}` : `${kind}:${st.web}:${st.seed}`);
  const get = (kind) => st.M[key(kind)] || null;
  const COLS = L.COLORS.map((c) => c.id);
  function evaluate(kind, m) {
    const byColor = {}; for (const c of COLS) byColor[c] = E.evalAct(m, c, NT, 900);
    return { kind, model: m, byColor, cap: E.evalCaption(m, 2, 4000), web: st.web, seed: st.seed };
  }
  function summary(kind) {
    const r = get(kind); if (!r) return null;
    const by = {}; for (const c of COLS) by[c] = r.byColor[c].ok;
    const v = get('vlm');
    return { kind, web: r.web, seed: r.seed, red: by.red, purple: by.purple, cur: by[st.color], byColor: by, cap: r.cap.okColor, capFull: r.cap.ok, capN: CAPN, vlmCap: v ? v.cap.okColor : null, n: NT };
  }
  function showProg(p) { const el = $('#lProg'); el.hidden = p == null; if (p != null) el.querySelector('i').style.width = (p * 100).toFixed(1) + '%'; }
  /** Обучить модель kind (если ещё нет для текущих веб-пар и зерна); для дообучения сначала нужна VLM. */
  async function train(kind) {
    if (st.busy) return null;
    const k = key(kind);
    if (!st.M[k]) {
      st.busy = kind; showProg(0); out();
      try {
        const { robot: R, web: Wb } = data(), seed = SEEDS[st.seed];
        let m, dataset;
        if (kind === 'vlm') { m = E.vlaInit(seed); dataset = Wb; }
        else if (kind === 'scratch') { m = E.vlaInit(seed); dataset = R; }
        else {
          if (!get('vlm')) { st.busy = null; await train('vlm'); st.busy = kind; }
          m = E.vlaClone(get('vlm').model); dataset = kind === 'ft' ? R : R.concat(Wb);
        }
        await nextFrame();
        await runChunked(E.vlaTrain(m, dataset, { epochs: EPOCHS[kind], seed }), (ev) => { st.prog = ev.step / ev.total; showProg(st.prog); }, 40);
        st.M[k] = evaluate(kind, m);
      } finally { st.busy = null; showProg(null); }
    }
    render(); if (ctl) ctl.update();
    return summary(kind);
  }
  async function trainAll() { for (const kd of ['vlm', 'scratch', 'ft', 'co']) await train(kd); return state(); }
  function scene() { return E.cmdScene(st.color, 900 + st.scene - 1); }   // та же сцена, что в E.evalAct
  function bm(sc) { const k = st.color + ':' + st.scene; if (!st.bms[k]) st.bms[k] = bitmap(sc.img, L.TW, L.TW); return st.bms[k]; }
  function drawScene() {
    const { c, k } = HeroKit.fit($('#lCv'), W, W), P = pal(), sc = scene(), s = W / L.TW;
    drawBitmap(c, bm(sc), 0, 0, W, W);
    const t = sc.target; c.setLineDash([5, 4]); c.lineWidth = 2; c.strokeStyle = P.ink; c.strokeRect((t.x - 9) * s, (t.y - 9) * s, 18 * s, 18 * s); c.setLineDash([]);
    HeroKit.label(c, k, 'нужно взять', t.x * s, (t.y - 9) * s - 12, { px: 11, weight: 700, color: P.ink });
    let i = 0;
    for (const kd of KINDS) {
      const r = get(kd.id); if (!r || !kd.acts) continue;
      const run = r.byColor[st.color].runs[st.scene - 1], col = HeroKit.css(kd.col), rad = 14 + i * 4; i++;
      c.beginPath(); c.arc(run.p.x * s, run.p.y * s, rad, 0, 7); c.lineWidth = 3; c.strokeStyle = col; c.setLineDash(run.ok ? [] : [4, 4]); c.stroke(); c.setLineDash([]);
      HeroKit.label(c, k, (run.ok ? '✓ ' : '✗ ') + kd.name.split(':')[0].toLowerCase(), run.p.x * s, run.p.y * s + 36 + (i - 1) * 14, { px: 10.5, weight: 700, color: col });
    }
    if (!i) HeroKit.label(c, k, 'обученных моделей пока нет', W / 2, W - 16, { px: 12, color: P.ink3 });
  }
  function drawAttn(cv, img, attn, col) {
    const S = 64, { c } = HeroKit.fit(cv, S, S);
    drawBitmap(c, bitmap(img, L.TW, L.TW), 0, 0, S, S);
    let mx = 1e-9; for (const v of attn) mx = Math.max(mx, v);
    const q = S / E.PG; c.fillStyle = col;
    for (let p = 0; p < attn.length; p++) { const a = attn[p] / mx; if (a < 0.03) continue; c.globalAlpha = 0.85 * a; c.fillRect((p % E.PG) * q, Math.floor(p / E.PG) * q, q + 0.5, q + 0.5); }
    c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 1; for (let i = 1; i < E.PG; i++) { c.globalAlpha = 0.25; c.beginPath(); c.moveTo(i * q, 0); c.lineTo(i * q, S); c.moveTo(0, i * q); c.lineTo(S, i * q); c.stroke(); } c.globalAlpha = 1;
  }
  function renderModels() {
    const box = $('#lModels'); box.innerHTML = '';
    const sc = scene();
    for (const kd of KINDS) {
      const r = get(kd.id); const col = HeroKit.css(kd.col);
      const card = h('div', { class: 'vm' + (r ? '' : ' off'), 'data-kind': kd.id, hidden: !r && st.busy !== kd.id });
      const cv = h('canvas', { width: 64, height: 64, 'aria-label': 'внимание модели на этой сцене' });
      card.append(cv, h('div', { class: 'vm-h' }, h('i', { style: `--c:${col}` }), kd.name));
      if (!r) { card.append(h('div', { class: 'vm-tok' }, 'обучается…'), h('div', { class: 'vm-st' }, '')); box.append(card); continue; }
      if (kd.acts) {
        const run = r.byColor[st.color].runs[st.scene - 1];
        card.append(h('div', { class: 'vm-tok' }, 'A: ', h('b', null, run.tokens.map(E.tokenName).join(' ')), ' ', h('span', { class: run.ok ? 'ok' : 'no' }, run.ok ? '✓ взяла' : '✗ не тот предмет')));
        card.append(h('div', { class: 'vm-st' }, h('b', null, `красный ${r.byColor.red.ok}/${NT}`), ` · фиолетовый ${r.byColor.purple.ok}/${NT}`, ` · подписи ${r.cap.okColor}/${CAPN}`));
        drawAttn(cv, sc.img, run.attn, col);
      } else {
        const cap = E.caption(r.model, sc.img);
        card.append(h('div', { class: 'vm-tok' }, 'опиши → ', h('b', null, cap.tokens.map(E.tokenName).join(' '))));
        card.append(h('div', { class: 'vm-st' }, 'действий не училась · ', h('b', null, `подписи ${r.cap.okColor}/${CAPN}`), ` верных слов цвета, ${r.cap.ok}/${CAPN} полных`));
        drawAttn(cv, sc.img, cap.attn, col);
      }
      box.append(card);
    }
  }
  function out() {
    const seen = L.SEEN.includes(st.color);
    $('#lCmd').innerHTML = `Команда: <b>«возьми ${colorWord(st.color, 'm')} кубик»</b>${seen ? '' : ' <span class="tag-new">цвета не было в демонстрациях</span>'}`;
    if (st.busy) { const kd = KINDS.find((x) => x.id === st.busy); setOut($('#lOut'), `Обучаю: ${kd.name.toLowerCase()} — ${pc(st.prog)}…`); return; }
    const parts = KINDS.filter((kd) => kd.acts && get(kd.id)).map((kd) => `${kd.name.split(':')[0].toLowerCase()} ${get(kd.id).byColor[st.color].ok}`);
    const caps = KINDS.filter((kd) => get(kd.id)).map((kd) => `${kd.name.split(':')[0]} ${get(kd.id).cap.okColor}/${CAPN}`);
    setOut($('#lOut'), parts.length ? `«Возьми ${colorWord(st.color, 'm')} кубик», ${NT} новых сцен, взято: <b>${parts.join(', ')}</b>. Верных слов цвета в подписях: ${caps.join(', ')}. Сцена ${st.scene}: кружок — выбор модели, пунктир — не тот предмет.` : `Модели ещё не обучены. Веб-пар в обучении: ${st.web}, демонстраций: ${NR}.`);
  }
  function render() { drawScene(); renderModels(); out(); }
  function state() { return { color: st.color, web: st.web, seed: st.seed, scene: st.scene, busy: st.busy, seen: L.SEEN.includes(st.color), scratch: summary('scratch'), vlm: summary('vlm'), ft: summary('ft'), co: summary('co') }; }
  function setColor(v) { st.color = v; segSet('#lColor', v); render(); if (ctl) ctl.update(); }
  function setWeb(v) { st.web = +v; segSet('#lWeb', v); render(); if (ctl) ctl.update(); }
  function setSeed(v) { st.seed = v; segSet('#lSeed', v); render(); if (ctl) ctl.update(); }
  function setScene(v) { st.scene = +v; $('#lScene').value = st.scene; syncRange($('#lScene'), String(st.scene)); render(); }
  const api = {
    reset() { if (st.busy) return; setWeb(NWEB); setSeed('a'); setScene(2); setColor('purple'); },
    state, train, trainAll, setColor, setWeb, setSeed, setScene, summary,
  };
  const missions = [
    { short: 'С нуля', title: 'Только демонстрации, как RT-1', text: 'Первая модель учится с нуля на 300 демонстрациях: команды только с красным, синим и зелёным кубиком. Проверим её на команде «возьми фиолетовый кубик» — и для сравнения на красном.',
      onEnter: (X) => X.setColor('purple'),
      bet: { q: 'возьмёт ли она фиолетовый кубик?', options: ['Да: кубики она брать умеет, а цвет видит на картинке', 'Нет: слова «фиолетовый» не было в её данных, запрос с ним ничего не значит', 'Через раз'], answer: (r) => (r.purple >= 14 ? 0 : r.purple <= 8 ? 1 : 2) },
      action: { label: 'Обучить с нуля', run: (X) => X.train('scratch') },
      criteria: [{ label: `Красный кубик — не меньше 16 из ${NT} новых сцен`, test: (r) => r && r.red >= 16 }, { label: `Фиолетовый — не больше 8 из ${NT}`, test: (r) => r && r.purple <= 8 }],
      explain: (r) => `С нуля: красный ${r.red} из ${NT}, фиолетовый ${r.purple} из ${NT}. Вектор слова «фиолетовый» ни разу не получал градиента и остался случайным, поэтому запрос с ним указывает на произвольный патч, чаще — на кубик одного из знакомых цветов. Это положение RT-1 из урока 3.1 и строка «с нуля» таблицы 6: 9% обобщения. Переключи сцену ползунком: кружок показывает, куда модель тянется, а маленькая карта рядом — её внимание.` },
    { short: 'VLM', title: 'Предобучи VLM на веб-парах', text: `Вторая модель та же, но учится на ${NWEB} веб-парах: картинка с одним предметом и подпись из двух слов, все шесть цветов и четыре формы. Действий в этих данных нет.`,
      action: { label: 'Предобучить на веб-парах', run: (X) => X.train('vlm') },
      criteria: [{ label: `Верных слов цвета в подписях — не меньше 43 из ${CAPN}`, test: (r) => r && r.cap >= 43 }, { label: `Действовать не умеет: красный кубик — не больше 5 из ${NT}`, test: (r) => r && r.red <= 5 }],
      explain: (r) => `VLM называет цвет верно в ${r.cap} подписях из ${CAPN} (цвет и форму вместе — в ${r.capFull}), а на команду роботу отвечает случайными корзинами: красный ${r.red} из ${NT}. Это исходное положение статьи: знание о мире есть, в том числе слово «фиолетовый» и то, как выглядит фиолетовый предмет, но выдавать действия модель не училась. Дальше её дообучаем двумя способами.` },
    { short: 'Дообучение', title: 'Дообучи VLM только на действиях', text: 'Возьмём предобученную VLM и дообучим её на тех же 300 демонстрациях, без веб-пар. Так в таблице 6 выглядит строка «дообучение».',
      bet: { q: 'что станет с подписями после дообучения на одних действиях?', options: ['Останутся: слова подписей в обучении не участвуют, их векторы не трогают', 'Ухудшатся: энкодер и общие веса уходят под задачу действий, и слова перестают с ними согласовываться', 'Исчезнут совсем: модель будет выдавать только токены действия'], answer: (r) => (r.cap >= r.vlmCap - 4 ? 0 : r.cap <= 12 ? 2 : 1) },
      action: { label: 'Дообучить на действиях', run: (X) => X.train('ft') },
      criteria: [{ label: `Красный кубик — не меньше 16 из ${NT}`, test: (r) => r && r.red >= 16 }, { label: 'Верных подписей стало меньше, чем у VLM, не меньше чем на 5', test: (r) => r && r.vlmCap != null && r.cap <= r.vlmCap - 5 }],
      explain: (r) => `Действия выучены: красный ${r.red} из ${NT}. Подписи упали с ${r.vlmCap} до ${r.cap} из ${CAPN}: слова «опиши», «фиолетовый», «миска» не получали градиента и остались прежними, а энкодер патчей и векторы слов команды перестроились под действия — и старые слова перестали согласовываться с новыми признаками. Это и есть забывание, о котором пишут авторы. Фиолетовый кубик при этом модель берёт в ${r.purple} сценах из ${NT}: вектор слова цел, и перенос из веб-данных в действия работает — в статье дообучение дало 42% обобщения против 9% с нуля. По трём зёрнам (переключатель «Зерно» в свободном режиме) подписи после дообучения — от 22 до 35 из 48.` },
    { short: 'Совместно', title: 'Дообучи совместно с веб-парами', text: `Та же VLM, те же демонстрации, но в каждом пакете вместе с ними идут веб-пары: ${NWEB} из 540 примеров. Так обучали RT-2.`,
      bet: { q: 'кто чаще возьмёт фиолетовый кубик?', options: ['Совместная модель: веб-пары с фиолетовым удерживают слово и признаки на месте', 'Одинаково: демонстрации у них одни и те же', 'Дообученная только на действиях: веб-пары отвлекают от задачи робота'], answer: (r, ctx) => { const ft = LabVla.api.summary('ft'); return !ft ? 0 : r.purple > ft.purple ? 0 : r.purple === ft.purple ? 1 : 2; } },
      action: { label: 'Дообучить совместно', run: (X) => X.train('co') },
      criteria: [{ label: `Фиолетовый кубик — не меньше 12 из ${NT}`, test: (r) => r && r.purple >= 12 }, { label: `Подписи сохранены: не меньше 43 из ${CAPN}`, test: (r) => r && r.cap >= 43 }, { label: `Красный — не меньше 16 из ${NT}`, test: (r) => r && r.red >= 16 }],
      explain: (r) => { const ft = LabVla.api.summary('ft'); return `Совместное дообучение: фиолетовый ${r.purple} из ${NT}${ft ? ` против ${ft.purple} у дообучения только на действиях` : ''}, подписи ${r.cap} из ${CAPN}${ft ? ` против ${ft.cap}` : ''}, красный ${r.red}. Веб-пары в каждом пакете не дают энкодеру и словам разойтись: модель помнит, как выглядит фиолетовый, и продолжает описывать картинки. На нашей маленькой модели разница в действиях между двумя способами невелика и зависит от зерна: по трём зёрнам совместная берёт фиолетовый в 7–18 сценах, дообученная на действиях — в 9–16; на зерне В совместная даже уступает. Устойчиво различаются подписи: 47–48 из 48 против 22–35. В статье картина похожая: на 5 млрд параметров 44% против 42%, на 55 млрд — 63% против 52%, и авторы объясняют выигрыш именно тем, что модель не забывает понятия.`; } },
    { short: 'Знакомый цвет', title: 'Сравни все три на знакомом цвете', text: 'Переключи команду на красный кубик и полистай сцены. На знакомых цветах все три модели должны справляться одинаково — как RT-2 и RT-1 на знакомых задачах.',
      controls: ['color', 'scene'],
      criteria: [{ label: 'Команда — «возьми красный кубик»', test: (r, s) => s.color === 'red' }, { label: `Все три модели берут красный не меньше чем в 16 сценах из ${NT}`, test: (r, s) => s.color === 'red' && !!s.scratch && !!s.ft && !!s.co && s.scratch.red >= 16 && s.ft.red >= 16 && s.co.red >= 16 }],
      hint: 'Кнопки цвета — под сценой. Если какой-то модели нет, вернись к её миссии и обучи.',
      explain: (r, ctx) => { const s = LabVla.api.state(); return `Красный кубик: с нуля ${s.scratch.red}, дообучение ${s.ft.red}, совместное ${s.co.red} из ${NT}. На знакомых командах предобучение почти ничего не добавляет — так и в таблице 4: на знакомых задачах RT-2 даёт 91–93% против 92% у RT-1. Разница появляется там, где нужно знание, которого в демонстрациях не было.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй команду, число веб-пар и зерно случайности, листай сцены. При новых веб-парах или зерне модели обучаются заново кнопкой ниже. Найди цвет, на котором совместная модель ошибается чаще всего, и посмотри по карте внимания, на какой предмет она смотрит.', final: true, controls: ['color', 'web', 'seed', 'scene'],
      action: { label: 'Обучить недостающие модели', run: (X) => X.trainAll() } },
  ];
  function init() {
    const box = $('#lColor');
    L.COLORS.forEach((c) => box.append(h('button', { type: 'button', 'data-v': c.id, 'aria-pressed': String(c.id === st.color) }, h('i', { class: 'sw', style: `background:${rgbCss(c.id)}` }), c.m)));
    box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) setColor(b.dataset.v); });
    legend('#lLegend', [['кубик из команды', 'var(--ink)', 'sqd'], ...KINDS.filter((k) => k.acts).map((k) => [k.name.split(':')[0] + ': выбор модели', `var(${k.col})`, 'ring']), ['промах: не тот предмет', 'var(--ink-2)', 'ringd'], ['внимание на патче', 'var(--e2e)', 'patch']]);
    segBind('#lWeb', (v) => { if (!st.busy) setWeb(v); }); segBind('#lSeed', (v) => { if (!st.busy) setSeed(v); });
    $('#lScene').addEventListener('input', (e) => setScene(+e.target.value)); syncRange($('#lScene'), '2');
    ctl = mountMissions('#lMis', missions, api, { controls: { color: '#wrapLColor', web: '#wrapLWeb', seed: '#wrapLSeed', scene: '#wrapLScene' }, scene: '#lCv' });
    render(); redrawOn(render);
    // данные готовим, когда раздел приближается к экрану
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(() => data(), 0); } }, { rootMargin: '600px 0px' });
    io.observe($('#lab'));
    return ctl;
  }
  return { init, api, st, KINDS, SEEDS, EPOCHS, MIS: missions };
})();

/* ---------- анимированная схема пути данных (бывший flow.js) ---------- */
'use strict';
(() => {
  const T = 12;
  const PH = [[0, 1.6], [1.6, 3.2], [3.2, 5.2], [5.2, 6.8], [6.8, 8.4], [8.4, 10.4], [10.4, 11.6]];
  const ACT = ['1', '128', '91', '241', '5', '101', '127', '255'], WORDS = ['серый', 'осёл', 'идёт', 'по', 'улице'];
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  /** Картинка-рамка: стол с кубиками (robot) или уличное фото (web). */
  function picture(c, x, y, w, hh, kind, P, A, pr) {
    const { rect, alpha } = A;
    rect(c, x, y, w, hh, 5, P.surf, P.ink3, 1.4);
    if (kind === 'robot') {
      c.fillStyle = alpha(P.ink3, 0.18); c.fillRect(x + 4, y + hh * 0.55, w - 8, hh * 0.4);
      [[0.25, '#d14b3c'], [0.5, '#3a6fd1'], [0.74, '#3b9a4a']].forEach(([fx, col]) => { c.fillStyle = col; c.fillRect(x + fx * w - 5, y + hh * 0.5, 10, 10); });
      c.beginPath(); c.arc(x + w * 0.82, y + hh * 0.72, 6, 0, 7); c.strokeStyle = '#e2b52b'; c.lineWidth = 2; c.stroke();
    } else {
      c.fillStyle = alpha(P.spr, 0.18); c.fillRect(x + 4, y + hh * 0.6, w - 8, hh * 0.35);
      c.fillStyle = alpha(P.ink2, 0.7); c.fillRect(x + w * 0.42, y + hh * 0.34, w * 0.22, hh * 0.3); c.fillRect(x + w * 0.46, y + hh * 0.62, 3, hh * 0.18); c.fillRect(x + w * 0.58, y + hh * 0.62, 3, hh * 0.18);
      c.beginPath(); c.arc(x + w * 0.66, y + hh * 0.36, 5, 0, 7); c.fill();
    }
    // сетка патчей проступает
    if (pr > 0) { c.strokeStyle = alpha(P.out, 0.9 * pr); c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + w * i / 4, y); c.lineTo(x + w * i / 4, y + hh); c.moveTo(x, y + hh * i / 3); c.lineTo(x + w, y + hh * i / 3); c.stroke(); } }
  }
  /** Ряд плиток: появляются по одной по доле pr. Возвращает центры. */
  function tiles(c, k, x, y, items, kind, P, A, pr, sz, gap, dir) {
    const { rect, lab } = A, pos = []; let o = 0;
    const col = kind === 'act' ? [P.motS, P.mot] : kind === 'word' ? [P.sprS, P.spr] : [P.outS, P.out];
    items.forEach((t, i) => {
      const w = kind === 'patch' ? sz : Math.max(sz, t.length * 6.2 + 10), cx = dir === 'v' ? x : x + o + w / 2, cy = dir === 'v' ? y + o + sz / 2 : y;
      pos.push([cx, cy]);
      const vis = Math.max(0, Math.min(1, pr * items.length - i));
      if (vis > 0) { c.globalAlpha = vis; rect(c, cx - w / 2, cy - sz / 2, w, sz, 3, col[0], col[1], 1.4); if (kind !== 'patch') lab(c, k, t, cx, cy, { px: 10.5, weight: 700, color: P.ink, halo: false, mono: true }); c.globalAlpha = 1; }
      o += (dir === 'v' ? sz : w) + gap;
    });
    return pos;
  }
  function flow(c, from, to, prog, n, color, A) {
    if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < n; i++) { const a = from[Math.floor(hash(i) * from.length)], b = to[Math.floor(hash(i + 99) * to.length)], ph = (prog * 2 + hash(i + 7)) % 1; A.circle(c, a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 2.2, color); }
  }
  function gripper(c, x, y, dx, open, P, A) {
    const { line, arrow, alpha } = A;
    line(c, [[x - 20, y + 22], [x + 44, y + 22]], P.ink3, 2);
    c.save(); c.translate(x + dx, y); c.strokeStyle = P.ink2; c.lineWidth = 2.4; c.lineCap = 'round';
    const g = 5 + open * 8; c.beginPath(); c.moveTo(0, -24); c.lineTo(0, -6); c.moveTo(-g - 3, -6); c.lineTo(g + 3, -6); c.moveTo(-g, -6); c.lineTo(-g, 12); c.moveTo(g, -6); c.lineTo(g, 12); c.stroke(); c.restore();
    if (dx > 2) arrow(c, x, y - 32, x + dx, y - 32, alpha(P.mot, 0.9), 2, 6);
  }
  function drawFlow(c, k, t, P, A, G) {
    const { lab, arrow, rect, seg, alpha } = A, u = ((t % T) + T) % T;
    const pr = PH.map(([a, b]) => seg(u, a, b)), cur = PH.findIndex(([a, b]) => u >= a && u < b);
    // модель: визуальный энкодер и языковая модель
    const M = G.model; rect(c, M[0], M[1], M[2], M[3], 10, alpha(P.surf2, 0.9), cur >= 1 && cur <= 2 || cur === 5 ? P.ink : P.ink3, 1.8);
    lab(c, k, 'VLM', M[0] + M[2] / 2, M[1] + 14, { px: 12, weight: 800, color: P.ink, haloColor: P.surf2 });
    rect(c, M[0] + 10, M[1] + 26, M[2] - 20, 28, 6, P.outS, P.out, 1.2); lab(c, k, G.narrowText ? 'ViT' : 'визуальный энкодер (ViT)', M[0] + M[2] / 2, M[1] + 40, { px: 10.5, weight: 700, color: P.ink, halo: false });
    rect(c, M[0] + 10, M[1] + 62, M[2] - 20, M[3] - 72, 6, P.motS, P.mot, 1.2); lab(c, k, G.narrowText ? 'LLM' : 'языковая модель', M[0] + M[2] / 2, M[1] + 62 + (M[3] - 72) / 2, { px: 10.5, weight: 700, color: P.ink, halo: false });
    // вход робота
    const R = G.robot; picture(c, R.pic[0], R.pic[1], R.pic[2], R.pic[3], 'robot', P, A, pr[0]);
    lab(c, k, 'камера робота', R.pic[0] + R.pic[2] / 2, R.pic[1] - 9, { px: 10.5, weight: 700, color: P.ink2, haloColor: P.surf2 });
    (G.narrowText ? ['«pick the cup»'] : ['Q: what action should the robot', 'take to pick the cup? A:']).forEach((tx, i) => lab(c, k, tx, R.cmd[0], R.cmd[1] + i * 13, { px: 10, weight: 700, color: P.mot, haloColor: P.surf2, align: R.cmdAlign || 'center' }));
    const inR = tiles(c, k, R.tok[0], R.tok[1], ['p', 'p', 'p', 'p', 'p', 'p'], 'patch', P, A, pr[0], 9, 3, R.dir).concat(tiles(c, k, R.tokW[0], R.tokW[1], ['pick', 'cup'], 'act', P, A, pr[0], 14, 3, R.dir));
    if (pr[0] > 0) arrow(c, R.arr[0], R.arr[1], R.arr[2], R.arr[3], pr[1] > 0 ? P.ink2 : P.line, 1.8, 6);
    flow(c, inR, [[M[0] + M[2] / 2, M[1] + 40]], pr[1], 18, P.out, A);
    // токены действия
    const outA = tiles(c, k, R.out[0], R.out[1], ACT, 'act', P, A, pr[2], 16, 3, R.dirOut);
    if (pr[2] > 0) arrow(c, R.arrOut[0], R.arrOut[1], R.arrOut[2], R.arrOut[3], P.ink2, 1.8, 6);
    if (pr[2] > 0 && pr[2] < 1) lab(c, k, 'токен за токеном', R.note[0], R.note[1], { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf2 });
    // детокенизация и захват
    if (pr[3] > 0) { lab(c, k, G.narrowText ? 'детокенизация → 8 чисел' : 'детокенизация: 8 корзин → смещение, углы, захват', R.det[0], R.det[1], { px: 10.5, weight: 700, color: P.ink2, haloColor: P.surf2 }); arrow(c, R.arrDet[0], R.arrDet[1], R.arrDet[2], R.arrDet[3], P.ink2, 1.8, 6); }
    gripper(c, R.grip[0], R.grip[1], pr[3] * 26, 1 - pr[3] * 0.6, P, A);
    if (pr[3] >= 1) lab(c, k, G.narrowText ? '1–3 Гц' : 'следующий кадр: 1–3 Гц', R.grip[0] + 12, R.grip[1] + 40, { px: 10.5, color: P.ink3, haloColor: P.surf2 });
    // веб-пара
    const Wb = G.web; picture(c, Wb.pic[0], Wb.pic[1], Wb.pic[2], Wb.pic[3], 'web', P, A, pr[4]);
    lab(c, k, 'веб-пара', Wb.pic[0] + Wb.pic[2] / 2, Wb.pic[1] - 9, { px: 10.5, weight: 700, color: P.ink2, haloColor: P.surf2 });
    (G.narrowText ? ['«what is happening?»'] : ['Q: what is happening', 'in the image? A:']).forEach((tx, i) => lab(c, k, tx, Wb.cmd[0], Wb.cmd[1] + i * 13, { px: 10, weight: 700, color: P.spr, haloColor: P.surf2, align: Wb.cmdAlign || 'center' }));
    const inW = tiles(c, k, Wb.tok[0], Wb.tok[1], ['p', 'p', 'p', 'p', 'p', 'p'], 'patch', P, A, pr[4], 9, 3, Wb.dir);
    if (pr[4] > 0) arrow(c, Wb.arr[0], Wb.arr[1], Wb.arr[2], Wb.arr[3], pr[5] > 0 ? P.ink2 : P.line, 1.8, 6);
    flow(c, inW, [[M[0] + M[2] / 2, M[1] + 40]], seg(pr[5], 0, 0.5), 16, P.spr, A);
    tiles(c, k, Wb.out[0], Wb.out[1], WORDS, 'word', P, A, seg(pr[5], 0.4, 1), 16, 3, Wb.dirOut);
    if (pr[5] > 0.4) arrow(c, Wb.arrOut[0], Wb.arrOut[1], Wb.arrOut[2], Wb.arrOut[3], P.ink2, 1.8, 6);
    if (pr[6] > 0) lab(c, k, G.narrowText ? 'одни веса, один словарь' : 'одни и те же веса и один словарь: слова и действия вперемешку в обучении', G.final[0], G.final[1], { px: 11, weight: 700, color: P.ink, haloColor: P.surf2 });
    void outA;
  }
  Anim.add('rt2', {
    W: 720, H: 300, start: 4.2, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        model: [292, 64, 136, 160],
        robot: { pic: [52, 30, 96, 60], cmd: [100, 104], tok: [34, 140], tokW: [34, 160], dir: 'h', arr: [200, 112, 286, 112], out: [446, 72], dirOut: 'h', arrOut: [432, 100, 442, 100], note: [560, 50], det: [580, 118], arrDet: [560, 92, 560, 108], grip: [570, 170] },
        web: { pic: [52, 196, 96, 60], cmd: [100, 270], tok: [158, 226], dir: 'h', arr: [236, 228, 286, 210], out: [446, 226], dirOut: 'h', arrOut: [432, 226, 442, 226] },
        final: [470, 288],
      });
    },
    narrow: {
      W: 360, H: 620,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          narrowText: true,
          model: [112, 170, 136, 116],
          robot: { pic: [16, 40, 100, 62], cmd: [16, 116], cmdAlign: 'left', tok: [16, 134], tokW: [16, 152], dir: 'h', arr: [70, 166, 150, 196], out: [60, 314], dirOut: 'v', arrOut: [150, 290, 74, 306], note: [170, 314], det: [180, 404], arrDet: [86, 404, 104, 404], grip: [176, 500] },
          web: { pic: [244, 40, 100, 62], cmd: [344, 116], cmdAlign: 'right', tok: [254, 134], dir: 'h', arr: [290, 166, 214, 196], out: [300, 314], dirOut: 'v', arrOut: [212, 290, 288, 306] },
          final: [180, 604],
        });
      },
    },
  });
})();

/* =====================================================================
   3. Таблицы 4 и 6 статьи с наведением
   ===================================================================== */
function initTables() {
  const note = $('#rtNote'), base = note.textContent;
  for (const id of ['rtT4', 'rtT6']) {
    const t = $('#' + id), heads = $$('thead th', t);
    // лучшее значение в каждом числовом столбце
    const rows = $$('tbody tr', t);
    heads.forEach((th, ci) => { if (!ci) return; const cells = rows.map((r) => r.children[ci]).filter((c) => c && c.tagName === 'TD' && /^\d+$/.test(c.textContent)); if (!cells.length) return; const mx = Math.max(...cells.map((c) => +c.textContent)); cells.forEach((c) => c.classList.toggle('best', +c.textContent === mx)); });
    const clear = () => { $$('.hi, .hi-r, .hi-c', t).forEach((e) => e.classList.remove('hi', 'hi-r', 'hi-c')); };
    const show = (td) => {
      clear(); const tr = td.parentElement, ci = [...tr.children].indexOf(td), th = heads[ci];
      tr.classList.add('hi-r'); td.classList.add('hi'); rows.forEach((r) => { const c = r.children[ci]; if (c && c !== td) c.classList.add('hi-c'); }); if (th) th.classList.add('hi-c');
      note.innerHTML = `<b>${tr.children[0].textContent}${id === 'rtT6' ? ', ' + tr.children[1].textContent : ''}</b> — ${tr.dataset.r}. Столбец: ${(th && th.dataset.c) || ''}. ${/^\d+$/.test(td.textContent) ? `Успех <b>${td.textContent}%</b>.` : ''}`;
    };
    t.addEventListener('mouseover', (e) => { const td = e.target.closest('td'); if (td) show(td); });
    t.addEventListener('click', (e) => { const td = e.target.closest('td'); if (td) show(td); });
    t.addEventListener('mouseleave', () => { clear(); note.textContent = base; });
  }
  segBind('#rtPick', (v) => { segSet('#rtPick', v); $('#rtT4').hidden = v !== 't4'; $('#rtT6').hidden = v !== 't6'; });
}

/* =====================================================================
   4. Что появилось само: команды из статьи по трём корзинам
   ===================================================================== */
const EMERGENT = [
  { id: 'num', label: '«move coke can near 3» — подвинь банку колы к цифре 3', target: 'web', why: 'Цифр в данных робота нет. Это группа «понимание символов» таблицы 3, RT-2-PaLI-X справился с ней в 93% запусков.' },
  { id: 'color', label: '«move apple to cup with same color» — к чашке того же цвета', target: 'web', why: 'Сравнить цвета предметов модель училась на вопросах о картинках, а не на демонстрациях. Группа «рассуждение».' },
  { id: 'sum', label: '«move banana near the sum of two plus one» — к сумме два плюс один', target: 'web', why: 'Арифметика пришла из веб-данных. Здесь сильнее оказалась RT-2-PaLM-E: 35% против 25% у PaLI-X.' },
  { id: 'es', label: '«mueve la manzana al vaso verde» — команда по-испански', target: 'web', why: 'Команды робота были только по-английски, а WebLI содержит тексты на 109 языках.' },
  { id: 'glasses', label: '«move coke can to person with glasses» — к человеку в очках', target: 'web', why: 'Распознавание людей по описанию — группа «люди» таблицы 3; у RT-2-PaLI-X 53%, у RT-1 20%.' },
  { id: 'bag', label: '«pick up the bag about to fall off the table» — пакет, который вот-вот упадёт', target: 'web', why: 'Пример из статьи: модель выбирает из двух пакетов тот, что лежит на краю. Такой команды в данных робота не было.' },
  { id: '7up', label: '«pick 7up can» — возьми банку 7up', target: 'robot', why: 'Банка 7up и навык «взять» — из демонстраций RT-1: команда в них состоит из глагола навыка и названий предметов.' },
  { id: 'drawer', label: '«open drawer» — открой ящик', target: 'robot', why: 'Открыть и закрыть ящик — среди семи семейств навыков данных робота, в наборе знакомых задач таких команд 18.' },
  { id: 'upright', label: '«place object upright» — поставь предмет вертикально', target: 'robot', why: 'Одно из семи семейств навыков в демонстрациях; в знакомых задачах 35 таких команд.' },
  { id: 'handle', label: 'Взять предмет за ручку', target: 'cannot', why: 'В приложении G это первое в списке того, что RT-2 давалось плохо: захват за конкретную часть предмета.' },
  { id: 'wipe', label: 'Протереть стол полотенцем', target: 'cannot', why: 'Новое движение, которого не было в данных робота. Веб-данные переносят понятия, а не движения.' },
  { id: 'fold', label: 'Сложить полотенце', target: 'cannot', why: 'Точное и ловкое движение: в статье RT-2 с такими справлялся плохо.' },
];
function initCards() {
  return Cards.sort('#eSort', {
    items: EMERGENT,
    targets: [{ id: 'robot', label: 'Этому учили демонстрациями', note: 'навык и предметы были в данных робота' }, { id: 'web', label: 'Возникло из веб-данных', note: 'в данных робота такого не было' }, { id: 'cannot', label: 'Так RT-2 не умеет', note: 'по разделу 5 и приложению G статьи' }],
    after: 'Общее правило статьи: из веб-данных приходят понятия — цифры, логотипы, цвета, языки, люди, отношения между предметами, — а движения остаются теми, что были в демонстрациях.',
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
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Чтобы VLM выдавала действия, к ней в RT-2 добавили отдельную голову действий?', o: ['Да, небольшую сеть поверх языковой модели', 'Нет: действие записано восемью токенами словаря, новых параметров нет', 'Да, и визуальный энкодер заменили'], a: 1, e: 'Авторы подчёркивают, что готовую VLM обучают «without any new parameters»: действия — это строка токенов в ответе модели, как слова.' },
    { q: 'Как PaLM-E записывает число 128 в строке действия?', o: ['Токеном «128», как PaLI-X', 'Одним из 256 самых редких токенов словаря, переназначенных под корзины действий', 'Тремя токенами: «1», «2», «8»'], a: 1, e: 'У PaLI-X числа до 1000 — собственные токены. У PaLM-E таких нет, и под действия переписали 256 редко используемых токенов; авторы называют это разновидностью symbol tuning.' },
    { q: 'Если дообучить VLM только на демонстрациях робота, она сохранит знание о мире?', o: ['Да: веса языковой модели почти не меняются', 'Частично: модель забывает понятия из предобучения, поэтому RT-2 дообучают вместе с веб-данными', 'Да, если демонстраций достаточно много'], a: 1, e: 'В таблице 6 совместное дообучение обобщает лучше простого: 63% против 52% на 55 млрд параметров. В лаборатории дообученная только на действиях модель разучивалась называть цвет на картинке.' },
    { q: 'RT-2 лучше RT-1 на задачах, которые были в демонстрациях?', o: ['Да, вдвое', 'Примерно одинаково: 91–93% против 92%; разница — в обобщении на новые предметы, фоны и обстановку', 'Нет, заметно хуже'], a: 1, e: 'По таблице 4 на знакомых задачах результаты близки. В обобщении в среднем 62% у обеих версий RT-2 против 32% у RT-1 и 35% у MOO.' },
    { q: 'Научился ли RT-2 из веб-данных новым движениям, например протирать стол?', o: ['Да, если такое видео было в вебе', 'Нет: из веб-данных переносятся понятия, а навыки ограничены тем, что было в демонстрациях робота', 'Да, через цепочку рассуждений'], a: 1, e: 'Авторы пишут, что физические навыки модели «still limited to the distribution of skills seen in the robot data»; протереть полотенцем и использовать инструмент — в списке неудач.' },
    { q: 'Почему RT-2-PaLI-X-55B управляет роботом на 1–3 Гц?', o: ['Так задумано: медленнее — точнее', 'Модель на 55 млрд параметров работает в облаке на TPU, робот обращается к ней по сети, и каждое действие — несколько токенов подряд', 'Камера робота снимает 3 кадра в секунду'], a: 1, e: 'Такую модель не запустить на бортовом компьютере. Вариант на 5 млрд параметров даёт около 5 Гц. Авторы называют скорость узким местом для высокочастотного управления.' },
    { q: 'Цепочка рассуждений в RT-2 — это отдельный планировщик, как SayCan?', o: ['Да, отдельная языковая модель', 'Нет: та же модель пишет «Plan: …» словами и затем токены действия в одном ответе', 'Нет: это поиск по дереву действий'], a: 1, e: 'Вариант RT-2-PaLM-E дообучили несколько сотен шагов на данных с шагом «Plan». Авторы видят в этом признак того, что планировщик и низкоуровневая политика могут жить в одной VLA.' },
    { q: 'Совместное дообучение — это предобучение на вебе, а потом отдельно на роботе?', o: ['Да, два этапа подряд', 'Нет: в каждом пакете дообучения есть и данные робота, и веб-данные, у робота повышенный вес', 'Нет: веб-данные подают только на проверке'], a: 1, e: 'У RT-2-PaLI-X данные робота — около 50% смеси, у RT-2-PaLM-E — около 66%. Два этапа подряд — это обычное дообучение, при котором модель и забывает.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('tok', () => { mis.tok = LabTok.init(); }); safe('vla', () => { mis.vla = LabVla.init(); });
    safe('tables', initTables); safe('cards', () => { mis.cards = initCards(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'lMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l33 = { mis, LabTok, LabVla, L33, EMERGENT }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
