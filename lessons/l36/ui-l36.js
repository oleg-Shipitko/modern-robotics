/* =====================================================================
   ui-l36.js — урок 3.6 «π0». Схема и интерактивы:
   0) анимированная схема пути данных в π0 (shared/anim.js);
   1) лаборатория: вид на стол сверху, S-образный желобок с гнездом;
      модель A (команды-токены раз в 0,34 с) и модель B (пачка из 50
      смещений, flow matching) на одной сцене рядом, проверка на 20
      сценах, темп модели A, предобучение против обучения с нуля;
   2) FAST: ДКП пачки, k коэффициентов, округление, ошибка и токены;
   3) сортировка задач из статьи (shared/cards.js) и квиз.
   Движок — l36/engine.js (без DOM) поверх l21/engine.js.
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
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const rgba = (col, a) => Anim.kit.alpha(col, a);

/* =====================================================================
   0. Схема: путь данных за один вывод π0
   ===================================================================== */
(() => {
  const T = 11;                                                    // секунд на полный проход
  const PH = { tok: [0, 1.3], vlm: [1.3, 2.9], flow: [2.9, 7.1], run: [7.1, 10.4] };
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const TARGET = Array.from({ length: 50 }, (_, i) => 0.55 * Math.sin(Math.PI * i / 49 * 1.6) - 0.25 * Math.cos(Math.PI * i / 49 * 0.7));
  const NOISE = Array.from({ length: 50 }, (_, i) => (hash(i) + hash(i + 97) - 1) * 1.6);
  /** Кадр камеры: стол и футболка. */
  function cam(c, x, y, w, hh, P, A, on) { // P — с полями cl и e2e из drawFlow
    A.rect(c, x, y, w, hh, 4, P.surf, on ? P.cl : P.ink3, 1.4);
    c.fillStyle = rgba(P.ink3, 0.25); c.fillRect(x + 3, y + hh * 0.55, w - 6, hh * 0.4);
    c.fillStyle = rgba(P.e2e, 0.55); c.beginPath(); c.moveTo(x + w * 0.3, y + hh * 0.62); c.lineTo(x + w * 0.7, y + hh * 0.62); c.lineTo(x + w * 0.62, y + hh * 0.88); c.lineTo(x + w * 0.38, y + hh * 0.88); c.closePath(); c.fill();
  }
  /** Ряд или столбец токенов. kinds: 'i' — картинка, 'w' — слово, 's' — состояние, 'a' — действие. */
  function tokens(c, x, y, kinds, dir, sz, gap, P, A, pr) {
    const pos = [];
    kinds.forEach((kd, i) => {
      const cx = dir === 'v' ? x : x + i * (sz + gap), cy = dir === 'v' ? y + i * (sz + gap) : y;
      pos.push([cx, cy]);
      const vis = pr == null ? 1 : Math.max(0, Math.min(1, pr * kinds.length - i));
      if (vis <= 0) return;
      const col = kd === 'i' || kd === 's' ? [rgba(P.cl, 0.25), P.cl] : kd === 'w' ? [rgba(P.ink3, 0.25), P.ink2] : [rgba(P.e2e, 0.3), P.e2e];
      c.globalAlpha = vis; A.rect(c, cx - sz / 2, cy - sz / 2, sz, sz, 2.5, col[0], col[1], 1.3); c.globalAlpha = 1;
    });
    return pos;
  }
  function chunkPlot(c, k, x, y, w, hh, step, P, A, G, live) { // P — с полями cl и e2e из drawFlow; live — идут шаги flow
    A.rect(c, x, y, w, hh, 6, P.surf, P.line, 1.2);
    const u = step / 10, mid = y + hh / 2, sy = hh * 0.32;
    c.strokeStyle = rgba(P.ink3, 0.5); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x + 4, mid); c.lineTo(x + w - 4, mid); c.stroke(); c.setLineDash([]);
    c.fillStyle = P.e2e;
    if (live && step < 10) {                                         // штрихи: куда точка сдвинется на следующем шаге Эйлера
      const u2 = (step + 1) / 10; c.strokeStyle = rgba(P.e2e, 0.6); c.lineWidth = 1.3; c.beginPath();
      for (let i = 0; i < 50; i++) { const px = x + 6 + (w - 12) * i / 49; c.moveTo(px, mid - (NOISE[i] * (1 - u) + TARGET[i] * u) * sy); c.lineTo(px, mid - (NOISE[i] * (1 - u2) + TARGET[i] * u2) * sy); }
      c.stroke();
    }
    for (let i = 0; i < 50; i++) { const v = NOISE[i] * (1 - u) + TARGET[i] * u, px = x + 6 + (w - 12) * i / 49, py = mid - v * sy; c.beginPath(); c.arc(px, py, 1.9, 0, 7); c.fill(); }
    if (u >= 1) { c.strokeStyle = P.e2e; c.lineWidth = 1.6; c.beginPath(); for (let i = 0; i < 50; i++) { const px = x + 6 + (w - 12) * i / 49, py = mid - TARGET[i] * sy; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
    A.lab(c, k, G.short ? '50 действий' : 'пачка: 50 действий', x + w / 2, y + hh + 11, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
  }
  function drawFlow(c, k, t, P0, A, G) {
    const P = Object.assign({ cl: P0.out, e2e: P0.mot }, P0), { seg, lab, arrow, line, rect } = A, u = ((t % T) + T) % T;
    const pTok = seg(u, ...PH.tok), pVlm = seg(u, ...PH.vlm), pFlow = seg(u, ...PH.flow), pRun = seg(u, ...PH.run);
    const step = u < PH.flow[0] ? 0 : u >= PH.flow[1] ? 10 : Math.min(10, Math.floor(pFlow * 10.999));
    // 1. входы
    G.cams.forEach(([x, y], i) => cam(c, x, y, G.camW, G.camH, P, A, pTok > 0 && pTok < 1 && i === Math.floor(pTok * 3) % 3));
    rect(c, G.cmd[0], G.cmd[1], G.cmd[2], 20, 10, rgba(P.ink3, 0.15), P.ink2, 1.2);
    lab(c, k, '«сложи футболку»', G.cmd[0] + G.cmd[2] / 2, G.cmd[1] + 10, { px: 10.5, color: P.ink, halo: false });
    lab(c, k, 'углы суставов', G.state[0], G.state[1] - 4, { px: 10, color: P.cl, haloColor: P.surf2 });
    for (let i = 0; i < 6; i++) { c.fillStyle = rgba(P.cl, 0.7); const hgt = 4 + 10 * hash(i + 5); c.fillRect(G.state[0] - 21 + i * 7, G.state[1] + 16 - hgt, 5, hgt); }
    // 2. токены
    const KS = ['i', 'i', 'i', 'i', 'i', 'i', 'w', 'w', 'w', 's'];
    const tk = tokens(c, G.tok[0], G.tok[1], KS, G.dir, G.sz, G.gap, P, A, pTok > 0 ? pTok : 0);
    // 3. VLM и кэш
    const V = G.vlm; rect(c, V[0], V[1], V[2], V[3], 10, rgba(P.ink3, 0.12), pVlm > 0 && pVlm < 1 ? P.ink : P.ink3, 1.6);
    for (let i = 1; i < 6; i++) { const yy = V[1] + V[3] * i / 6, on = pVlm > 0 && pVlm < 1 && Math.floor(pVlm * 6) >= i; line(c, [[V[0] + 8, yy], [V[0] + V[2] - 8, yy]], on ? rgba(P.cl, 0.8) : rgba(P.ink3, 0.35), 1.2); }
    lab(c, k, 'PaliGemma', V[0] + V[2] / 2, V[1] + 14, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, '3 млрд', V[0] + V[2] / 2, V[1] + 28, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    const C = G.cache, filled = pVlm >= 1 ? 1 : pVlm;
    rect(c, C[0], C[1], C[2], C[3], 6, rgba(P.cl, 0.1 + 0.25 * filled), P.cl, 1.2);
    lab(c, k, G.short ? 'кэш' : 'ключи и значения в кэше', C[0] + C[2] / 2, C[1] + C[3] / 2, { px: 10, color: P.cl, haloColor: P.surf2 });
    if (pTok > 0 && pVlm < 1) tk.forEach(([x, y], i) => { if (i < 9 && pVlm > 0) line(c, [[x, y], [V[0] + (G.dir === 'v' ? 0 : V[2] * (i + 0.5) / 9), G.dir === 'v' ? V[1] + V[3] * (i + 0.5) / 10 : V[1]]], rgba(i < 6 ? P.cl : P.ink2, 0.35), 1); });
    // 4. эксперт действий
    const X = G.exp, active = pFlow > 0 && pFlow < 1;
    rect(c, X[0], X[1], X[2], X[3], 10, rgba(P.e2e, active ? 0.22 : 0.1), active ? P.e2e : rgba(P.e2e, 0.7), 1.8);
    lab(c, k, G.short ? 'эксперт' : 'эксперт действий', X[0] + X[2] / 2, X[1] + 14, { px: 11.5, weight: 700, color: P.ink, haloColor: P.surf2 });
    lab(c, k, '300 млн', X[0] + X[2] / 2, X[1] + 28, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    if (active) {
      const ph = (pFlow * 10) % 1;
      for (let i = 0; i < 4; i++) line(c, [[X[0] + X[2] * (0.2 + 0.2 * i), G.dir === 'v' ? X[1] : X[1]], [C[0] + C[2] * (0.2 + 0.2 * i), C[1] + C[3]]], rgba(P.e2e, 0.25 + 0.5 * (1 - ph)), 1, [3, 3]);
      lab(c, k, `шаг flow ${step + 1} из 10`, X[0] + X[2] / 2, X[1] + X[3] - 12, { px: 11, weight: 700, color: P.e2e, haloColor: P.surf2 });
    } else if (pFlow >= 1) lab(c, k, '10 шагов flow: 27 мс', X[0] + X[2] / 2, X[1] + X[3] - 12, { px: 10.5, color: P.ink2, haloColor: P.surf2 });
    // 5. пачка
    chunkPlot(c, k, G.chunk[0], G.chunk[1], G.chunk[2], G.chunk[3], step, P, A, G, active);
    // 6. исполнение: 50 действий, 25 исполняются, потом новый вывод
    const R = G.run, n = 50, cw = R[2] / n, done = pRun > 0 ? Math.min(25, Math.floor(pRun * 25.999)) : 0;
    for (let i = 0; i < n; i++) { const on = pFlow >= 1, ex = i < done; c.fillStyle = ex ? P.e2e : on ? (i < 25 ? rgba(P.e2e, 0.35) : rgba(P.ink3, 0.25)) : rgba(P.ink3, 0.12); c.fillRect(R[0] + i * cw + 0.5, R[1], cw - 1, R[3]); }
    line(c, [[R[0] + 25 * cw, R[1] - 4], [R[0] + 25 * cw, R[1] + R[3] + 4]], P.ink2, 1.4, [2, 2]);
    lab(c, k, pRun >= 1 ? 'исполнено 25 из 50 — новая пачка' : pRun > 0 ? `исполнено ${done} из 25 · 20 мс на действие` : G.short ? 'робот: 50 Гц' : 'робот исполняет 25 действий по 20 мс, 0,5 с', R[0] + R[2] / 2, R[1] + R[3] + 13, { px: 10.5, color: pRun > 0 ? P.e2e : P.ink3, haloColor: P.surf2 });
    // стрелки между этапами
    G.arrows.forEach(([x1, y1, x2, y2], i) => arrow(c, x1, y1, x2, y2, [pTok, pVlm, pFlow, pFlow >= 1 ? 1 : 0, pRun][i] > 0 ? P.ink2 : P.line, 1.6, 6));
    lab(c, k, u < PH.flow[1] ? 'вывод: 73 мс на RTX 4090' : 'исполнение: 0,5 с', G.title[0], G.title[1], { px: 11, weight: 700, color: P.ink2, haloColor: P.surf2 });
  }
  Anim.add('pi0', {
    W: 720, H: 320, start: 4.4, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        dir: 'v', sz: 11, gap: 4, camW: 54, camH: 36, cams: [[18, 30], [18, 74], [18, 118]], cmd: [10, 168, 82], state: [52, 208],
        tok: [126, 58], vlm: [158, 48, 128, 150], cache: [168, 214, 108, 30], exp: [330, 120, 118, 92], chunk: [490, 112, 210, 108], run: [330, 262, 370, 16],
        arrows: [[96, 120, 116, 120], [138, 120, 156, 120], [286, 166, 328, 166], [450, 166, 488, 166], [595, 236, 520, 258]], title: [600, 20],
      });
    },
    narrow: {
      W: 360, H: 640,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          short: true, dir: 'h', sz: 13, gap: 5, camW: 60, camH: 40, cams: [[16, 34], [88, 34], [160, 34]], cmd: [236, 44, 112], state: [292, 92],
          tok: [92, 128], vlm: [40, 158, 280, 92], cache: [110, 262, 140, 28], exp: [100, 316, 160, 84], chunk: [40, 420, 280, 120], run: [40, 580, 280, 16],
          arrows: [[180, 108, 180, 118], [180, 138, 180, 156], [180, 290, 180, 314], [180, 402, 180, 418], [180, 556, 180, 576]], title: [180, 14],
        });
      },
    },
  });
})();

/* =====================================================================
   Модели лаборатории: обучаются по кнопке, один раз; проверки кэшируются
   ===================================================================== */
const Store = (() => {
  const E = L36, R = E.RECIPE, st = { A: null, B: null, P: null, PF: null, S: null, busy: null, prog: 0, evals: {}, tempoTab: null };
  const subs = [], emit = () => subs.forEach((f) => f());
  const onProg = (a, b) => (e) => { st.prog = a + (b - a) * (e.it + 1) / e.iters; emit(); };
  async function trainAB() {
    if (st.A && st.B) return;
    st.busy = 'ab'; st.prog = 0; emit();
    const fine = E.fineDemos(R.fineN);
    st.B = await runChunked(E.flowTrain(E.flowInit(5), E.flowPairs(fine, 1), { iters: R.flowIters }), onProg(0, 0.55), 14);
    st.A = await runChunked(E.tokTrain(E.tokInit(11), E.tokPairs(fine, R.tokStride), { iters: R.tokIters }), onProg(0.55, 1), 14);
    st.busy = null; emit();
  }
  async function trainPre() {
    if (st.P && st.PF && st.S) return;
    st.busy = 'pre'; st.prog = 0; emit();
    const fp = E.flowPairs(E.fineDemos(R.postN), 1), pp = E.flowPairs(E.preDemos(R.preN), 1);
    st.P = await runChunked(E.flowTrain(E.flowInit(5), pp, { iters: R.preIters, seed: 3 }), onProg(0, 0.62), 14);
    st.PF = await runChunked(E.flowTrain(E.flowClone(st.P, false), fp, { iters: R.postIters, seed: 4, lr: R.postLr }), onProg(0.62, 0.66), 14);
    st.S = await runChunked(E.flowTrain(E.flowInit(5), fp, { iters: R.scratchIters, seed: 4 }), onProg(0.66, 1), 14);
    st.busy = null; emit();
  }
  const tq = (tempo) => Math.round(tempo * 100) / 100;
  function policy(name, tempo) { return name === 'A' ? { kind: 'tok', m: st.A, tempo: tq(tempo) } : { kind: 'flow', m: st[name] }; }
  const has = (name) => !!st[name];
  function evalOf(name, tempo) {
    if (!has(name)) return null;
    const key = name + (name === 'A' ? tq(tempo) : '');
    if (!st.evals[key]) st.evals[key] = E.evaluate(policy(name, tempo), E.evalSeeds(R.evalN));
    return st.evals[key];
  }
  const TEMPO_GRID = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];
  /** Сколько сцен проходит A при каждом темпе: для миссии «Темп». */
  function tempoTable() { if (!st.A) return null; if (!st.tempoTab) st.tempoTab = TEMPO_GRID.map((t) => ({ t, r: evalOf('A', t) })); return st.tempoTab; }
  function runOn(name, tempo, idx) { if (!has(name)) return null; const seed = E.EVAL_SEED + idx; return E.rollout(E.makeScene('s', seed), policy(name, tempo), { seed }); }
  return { st, R, on: (f) => subs.push(f), trainAB, trainPre, evalOf, tempoTable, runOn, has, TEMPO_GRID, tq };
})();

/* =====================================================================
   1. Лаборатория: желобок, модели A и B, предобучение
   ===================================================================== */
const Lab = (() => {
  const E = L36, CW = 400, TICK_MS = 40;                            // проигрываем вдвое медленнее жизни: 40 мс на такт 20 мс
  let SC = CW / E.TW, OX = 0, OY = 0;                                // масштаб и сдвиг: сцена показывается крупно, по рамке желобка
  const PAIRS = {
    ab: [{ name: 'A', head: 'Модель A: токены', sub: 'команда раз в 0,34 с', cls: '' }, { name: 'B', head: 'Модель B: пачка', sub: '50 смещений за вывод', cls: 'fm' }],
    pre: [{ name: 'S', head: 'С нуля', sub: 'одна запись желобка', cls: '' }, { name: 'PF', head: 'Предобучение + запись', sub: '120 записей других задач и та же одна', cls: 'fm' }],
  };
  const st = { scene: 0, tempo: 1, pair: 'ab', frame: null, playing: false, tok: 0, runs: [null, null] };
  let ctl = null;
  const sceneOf = (i) => E.makeScene('s', E.EVAL_SEED + i);
  const colOf = (side, P) => (side ? P.e2e : P.cl);
  function recompute() { const pr = PAIRS[st.pair]; st.runs = pr.map((m) => Store.runOn(m.name, st.tempo, st.scene)); }
  const X = (q) => OX + q[0] * SC, Y = (q) => OY + q[1] * SC;
  /** Рамка вокруг желобка с запасом — во весь канвас. */
  function frameScene(sc) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of sc.line.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const pad = E.CFG.W / 2 + 7, w = x1 - x0 + 2 * pad, hh = y1 - y0 + 2 * pad;
    SC = CW / Math.max(w, hh); OX = (CW - (x1 + x0) * SC) / 2; OY = (CW - (y1 + y0) * SC) / 2 + 6;
  }
  function polyPath(c, pts) { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(X(q), Y(q)) : c.moveTo(X(q), Y(q)))); }
  /** Сцена сверху: стол, желобок, гнездо, путь модели до такта n, текущая команда или пачка, что видит модель. */
  function drawPane(cv, run, side, label) {
    const { c, k } = HeroKit.fit(cv, CW, CW), P = pal(), sc = sceneOf(st.scene), col = colOf(side, P);
    frameScene(sc);
    c.fillStyle = P.bg; c.fillRect(0, 0, CW, CW);
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath();                 // сетка стола: клетка 12 px, около 6 см
    for (let g = 0; g <= E.TW; g += 12) { c.moveTo(X([g, 0]), 0); c.lineTo(X([g, 0]), CW); c.moveTo(0, Y([0, g])); c.lineTo(CW, Y([0, g])); }
    c.stroke();
    // желобок: стенки и дно
    c.lineJoin = 'round'; c.lineCap = 'round';
    polyPath(c, sc.line.pts); c.strokeStyle = P.ink3; c.lineWidth = (E.CFG.W + 1.4) * SC; c.stroke();
    polyPath(c, sc.line.pts); c.strokeStyle = HeroKit.dark() ? '#3a3833' : '#e4ded0'; c.lineWidth = E.CFG.W * SC; c.stroke();
    polyPath(c, sc.line.pts); c.strokeStyle = rgba(P.ink3, 0.45); c.lineWidth = 1; c.setLineDash([3, 4]); c.stroke(); c.setLineDash([]);
    // старт и гнездо
    c.beginPath(); c.arc(X(sc.S), Y(sc.S), 4, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 1.6; c.stroke();
    for (const r of [E.CFG.RF * SC + 4, E.CFG.RF * SC + 8]) { c.beginPath(); c.arc(X(sc.G), Y(sc.G), r, 0, 7); c.strokeStyle = P.good; c.lineWidth = 2; c.stroke(); }
    const narrow = k > 1.5;
    HeroKit.label(c, k, 'гнездо', X(sc.G), Y(sc.G) - E.CFG.RF * SC - 18, { px: narrow ? 10 : 11, color: P.good, haloColor: P.bg });
    HeroKit.label(c, k, 'старт', X(sc.S), Y(sc.S) + 18, { px: narrow ? 10 : 11, color: P.ink3, haloColor: P.bg });
    if (!run) { HeroKit.label(c, k, Store.st.busy ? 'модель учится…' : 'модель ещё не обучена', CW / 2, CW / 2, { px: 13, weight: 700, color: P.ink2, haloColor: P.bg }); return; }
    const n = st.frame == null ? run.trail.length - 1 : Math.min(st.frame, run.trail.length - 1);
    // текущая команда или пачка (к такту n)
    const cmd = run.cmds.filter((q) => q.t0 <= Math.max(0, n - 1)).slice(-1)[0];
    if (cmd) {
      c.setLineDash([4, 4]); c.strokeStyle = P.hy; c.lineWidth = 1.6;
      if (run.kind === 'tok') { c.beginPath(); c.moveTo(X(cmd.from), Y(cmd.from)); c.lineTo(X([cmd.from[0] + cmd.dx, cmd.from[1] + cmd.dy]), Y([cmd.from[0] + cmd.dx, cmd.from[1] + cmd.dy])); c.stroke(); c.setLineDash([]); const tq = [cmd.from[0] + cmd.dx, cmd.from[1] + cmd.dy]; c.beginPath(); c.arc(X(tq), Y(tq), 4, 0, 7); c.fillStyle = P.hy; c.fill(); }
      else { let q = cmd.from.slice(); const pts = [q.slice()]; for (const d of cmd.chunk) { q = [q[0] + d[0], q[1] + d[1]]; pts.push(q.slice()); } polyPath(c, pts); c.stroke(); c.setLineDash([]); for (let i = 1; i < pts.length; i += 5) { c.beginPath(); c.arc(X(pts[i]), Y(pts[i]), 1.8, 0, 7); c.fillStyle = P.hy; c.fill(); } }
      c.setLineDash([]);
      for (const q of cmd.seen) { c.beginPath(); c.arc(X(q), Y(q), 3, 0, 7); c.strokeStyle = P.ink2; c.lineWidth = 1.3; c.stroke(); }
    }
    // путь
    polyPath(c, run.trail.slice(0, n + 1)); c.strokeStyle = col; c.lineWidth = 2.4; c.stroke();
    for (const q of run.cmds) if (q.t0 <= n) { c.beginPath(); c.arc(X(q.from), Y(q.from), 2.6, 0, 7); c.fillStyle = col; c.fill(); }
    // фигурка в захвате
    const p = run.trail[n], fr = E.CFG.RF * SC;
    c.beginPath(); c.arc(X(p), Y(p), fr, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2.2; c.strokeStyle = P.ink; c.stroke();
    c.beginPath(); c.arc(X(p), Y(p), fr * 0.38, 0, 7); c.fillStyle = col; c.fill();
    const end = n >= run.trail.length - 1;
    if (end && run.hit) { HeroKit.cross(c, X(p), Y(p), 7, P.bad, 3); }
    const msg = !end ? `такт ${n}` : run.ok ? 'в гнезде' : run.hit ? 'задела стенку' : run.bump ? 'влетела в гнездо' : 'не успела';
    HeroKit.label(c, k, msg, CW / 2, 14, { px: narrow ? 10.5 : 12, weight: 700, color: !end ? P.ink2 : run.ok ? P.good : P.bad, haloColor: P.bg });
  }
  const sec = (t) => fmt(t * E.CFG.TICK, 2);
  function paneStat(run, name) {
    if (!run) return { html: Store.st.busy ? 'Модель учится…' : 'Модель ещё не обучена', cls: '' };
    const cmds = run.kind === 'tok' ? nWord(run.cmds.length, 'команда', 'команды', 'команд') : nWord(run.cmds.length, 'пачка', 'пачки', 'пачек');
    if (run.ok) return { html: `<b>✓ в гнезде</b> за ${run.ticks} тактов (${sec(run.ticks)} с) · ${cmds}`, cls: 'ok' };
    if (run.hit) return { html: `<b>✗ задела стенку</b> на такте ${run.ticks} · ${cmds}`, cls: 'bad' };
    if (run.bump) return { html: `<b>✗ влетела в гнездо</b>: ${fmt(run.vIn, 2)} px за такт при пределе 0,5`, cls: 'bad' };
    return { html: `<b>✗ не успела</b> за ${run.limit} тактов`, cls: 'bad' };
  }
  /** Направление скорости по тактам, градусы от направления желобка на старте (с разворачиванием через ±180°). */
  function headings(run, sc) {
    const t0 = E.tangent(sc, 0), out = []; let prev = null, acc = 0;
    for (let i = 1; i < run.trail.length; i++) {
      const v = [run.trail[i][0] - run.trail[i - 1][0], run.trail[i][1] - run.trail[i - 1][1]];
      let a = Math.atan2(t0[0] * v[1] - t0[1] * v[0], t0[0] * v[0] + t0[1] * v[1]) * 180 / Math.PI;
      if (prev != null) { let d = a - prev; while (d > 180) d -= 360; while (d < -180) d += 360; acc += d; } else acc = a;
      prev = a; out.push(acc);
    }
    return out;
  }
  function drawHead() {
    const PW = 640, PH = 150, { c, k } = HeroKit.fit($('#lHead'), PW, PH), P = pal(), sc = sceneOf(st.scene);
    const box = { l: Math.round(30 * k) + 12, r: PW - 12, t: 12, b: PH - 24 };
    c.fillStyle = P.bg; c.fillRect(0, 0, PW, PH);
    const runs = st.runs, hs = runs.map((r) => (r ? headings(r, sc) : null));
    const T = Math.max(40, ...runs.map((r) => (r ? r.trail.length : 0))), n = st.frame == null ? Infinity : st.frame;
    let amax = 60; hs.forEach((a) => a && a.forEach((v) => { amax = Math.max(amax, Math.abs(v)); })); amax = Math.ceil(amax / 45) * 45;
    const x = (i) => box.l + i / T * (box.r - box.l), y = (v) => (box.t + box.b) / 2 - v / amax * (box.b - box.t) / 2;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const v of [-amax, 0, amax]) { c.beginPath(); c.moveTo(box.l, y(v)); c.lineTo(box.r, y(v)); c.stroke(); HeroKit.label(c, k, (v > 0 ? '+' : '') + fmt(v, 0) + '°', box.l - 5, y(v), { align: 'right', px: 10.5, mono: true, color: P.ink3, halo: false }); }
    for (let s = 0; s * 50 <= T; s += 0.5) HeroKit.label(c, k, fmt(s, 1) + ' с', x(s * 50) + (s ? 0 : 4), box.b + 13, { align: s ? 'center' : 'left', px: 10.5, mono: true, color: P.ink3, halo: false });
    hs.forEach((a, side) => {
      if (!a) return; const col = colOf(side, P), m = Math.min(a.length, n);
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < m; i++) i ? c.lineTo(x(i + 1), y(a[i])) : c.moveTo(x(i + 1), y(a[i])); c.stroke();
      for (const q of runs[side].cmds) if (q.t0 <= n) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x(q.t0), box.b - (side ? 0 : 9)); c.lineTo(x(q.t0), box.b - (side ? 9 : 18)); c.stroke(); }
    });
  }
  function bars() {
    const box = $('#lBars'); box.innerHTML = '';
    const rows = st.pair === 'ab' ? (st.barsAB ? [[`A: токены, темп ${fmt(st.tempo, 2)}`, Store.evalOf('A', st.tempo)], ['B: пачка', Store.evalOf('B')]] : [])
      : (st.barsPre ? [['С нуля, одна запись', Store.evalOf('S')], ['Только предобучение', Store.evalOf('P')], ['Предобучение + запись', Store.evalOf('PF')]] : []);
    if (!rows.length || rows.some((r) => !r[1])) return;
    box.append(h('div', { class: 'sc-h muted-s' }, 'Проверка на 20 сценах желобка, которых не было в записях'));
    for (const [name, r] of rows) {
      const bt = h('div', { class: 'bt' }); for (const [kk, v] of [['ok', r.ok], ['hit', r.hit], ['bump', r.bump], ['late', r.late]]) if (v) bt.append(h('i', { class: kk, style: `width:${v / r.n * 100}%` }));
      box.append(h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, name), bt, h('span', { class: 'bn' }, `${r.ok} из ${r.n}`)));
    }
    box.append(h('div', { class: 'bars-key' }, ...[['в гнезде', 'var(--good)'], ['задела стенку', 'var(--critical)'], ['влетела в гнездо', 'var(--hybrid)'], ['не успела', 'var(--ink-3)']].map(([t, cc]) => h('span', null, h('i', { style: `background:${cc}` }), t))));
  }
  function out() {
    const el = $('#lOut');
    if (Store.st.busy) { setOut(el, `Модели учатся в браузере: <b>${Math.round(Store.st.prog * 100)}%</b>`); return; }
    const [a, b] = st.runs;
    if (!a && !b) { setOut(el, 'Модели ещё не обучены: кнопка — в карточке миссии.'); return; }
    const sc = sceneOf(st.scene);
    setOut(el, `Сцена ${st.scene + 1} из 20 · длина желобка ${fmt(sc.line.len, 0)} px · оператор проходит его за ${E.operatorTime(sc)} тактов, срок — ${E.timeLimit(sc)}.`);
  }
  function render() {
    recompute();
    const pr = PAIRS[st.pair];
    for (const [side, L] of [[0, 'L'], [1, 'R']]) {
      setOut($('#lHead' + L), pr[side].head); $('#lHead' + L).className = pr[side].cls; setOut($('#lSub' + L), pr[side].sub);
      const s = paneStat(st.runs[side]); setOut($('#lStat' + L), s.html); $('#lStat' + L).className = 'pane-stat' + (s.cls && st.frame == null ? ' ' + s.cls : '');
    }
    draw(); bars(); out();
    const pg = $('#lProg'); pg.hidden = !Store.st.busy; pg.firstElementChild.style.width = (Store.st.prog * 100).toFixed(1) + '%';
    $('#lPlay').disabled = !st.runs[0] && !st.runs[1];
  }
  function draw() { const pr = PAIRS[st.pair]; drawPane($('#lCvL'), st.runs[0], 0, pr[0].head); drawPane($('#lCvR'), st.runs[1], 1, pr[1].head); drawHead(); }
  /** Проиграть обе сцены синхронно, такт за тактом. */
  async function play() {
    const tok = ++st.tok, T = Math.max(...st.runs.map((r) => (r ? r.trail.length - 1 : 0)));
    st.playing = true;
    for (let n = 0; n <= T && tok === st.tok; n++) { st.frame = n; draw(); await wait(TICK_MS); }
    if (tok === st.tok) { st.frame = null; st.playing = false; render(); }
  }
  function stop() { st.tok++; st.frame = null; st.playing = false; }
  function setScene(i) { stop(); st.scene = Math.max(0, Math.min(19, i)); const inp = $('#lScene'); inp.value = st.scene + 1; syncRange(inp, String(st.scene + 1)); render(); if (ctl) ctl.update(); }
  function setTempo(v) { stop(); st.tempo = Store.tq(v); const inp = $('#lTempo'); inp.value = st.tempo; syncRange(inp, fmt(st.tempo, 2)); render(); if (ctl) ctl.update(); }
  function setPair(v) { stop(); st.pair = v; segSet('#lPair', v); render(); if (ctl) ctl.update(); }
  /** Знак первого поворота желобка: сначала в одну или в другую сторону. */
  const turn = (sc) => { const a = E.tangent(sc, 0), b = E.tangent(sc, sc.line.len * 0.3); return Math.sign(a[0] * b[1] - a[1] * b[0]); };
  function state() {
    const tab = Store.tempoTable(), best = tab ? tab.reduce((m, q) => (q.r.ok > m.r.ok ? q : m), tab[0]) : null, a = Store.evalOf('A', st.tempo), b = Store.evalOf('B');
    return { trained: !!(Store.st.A && Store.st.B), preTrained: !!(Store.st.P && Store.st.PF && Store.st.S), scene: st.scene, tempo: st.tempo, pair: st.pair,
      aOk: a ? a.ok : null, aLate: a ? a.late : null, aHit: a ? a.hit : null, aMeanT: a ? a.meanT : null, bOk: b ? b.ok : null, bestOk: best ? best.r.ok : null, bestTempo: best ? best.t : null,
      left: st.runs[0] ? { ok: st.runs[0].ok, hit: st.runs[0].hit } : null, right: st.runs[1] ? { ok: st.runs[1].ok, hit: st.runs[1].hit } : null };
  }
  const api = {
    reset() { stop(); st.barsAB = false; st.barsPre = false; setPair('ab'); setTempo(1); setScene(0); },
    state, setScene, setTempo, setPair, play, stop, render,
    /** Миссия 1: обучить обе модели и проиграть первую сцену. */
    async first() {
      await Store.trainAB(); setPair('ab'); setTempo(1); setScene(0); await play();
      const [a, b] = st.runs, sc = sceneOf(0), t0 = E.tangent(sc, 0), c0 = a.cmds[0], L = Math.hypot(c0.dx, c0.dy) || 1;
      return { Aok: a.ok, Ahit: a.hit, Atick: a.ticks, Alen: L, ang: Math.acos(Math.max(-1, Math.min(1, (c0.dx * t0[0] + c0.dy * t0[1]) / L))) * 180 / Math.PI, Bok: b.ok, Bticks: b.ticks, Bchunks: b.cmds.length, Btop: b.top };
    },
    /** Миссия 2: обе модели на 20 сценах. */
    async twenty() {
      await Store.trainAB(); setPair('ab'); setTempo(1); st.barsAB = true; render();
      const a = Store.evalOf('A', 1), b = Store.evalOf('B');
      return { aOk: a.ok, aHit: a.hit, bOk: b.ok, bHit: b.hit, bBump: b.bump, bLate: b.late, bMeanT: b.meanT, bFail: b.runs.findIndex((q) => !q.ok) };
    },
    /** Миссия 4: предобучение, постобучение и модель с нуля на одной записи. */
    async pre() {
      await Store.trainPre(); st.barsPre = true; setPair('pre'); setScene(0); await play();
      const S = Store.evalOf('S'), P = Store.evalOf('P'), PF = Store.evalOf('PF'), dir = turn(E.fineDemos(1)[0].sc);
      const same = S.runs.filter((q) => turn(sceneOf(q.seed - E.EVAL_SEED)) === dir), other = S.runs.filter((q) => turn(sceneOf(q.seed - E.EVAL_SEED)) !== dir);
      const pick = (r) => ({ ok: r.ok, hit: r.hit, bump: r.bump, late: r.late });
      return { S: pick(S), P: pick(P), PF: pick(PF), sameN: same.length, sameOk: same.filter((q) => q.ok).length, otherN: other.length, otherOk: other.filter((q) => q.ok).length };
    },
  };
  const missions = [
    { short: 'Ставка', title: 'Кто проведёт фигурку по желобку', text: 'Обе модели учатся на 24 записях оператора. Модель A раз в 0,34 с называет двумя токенами, куда сдвинуть фигурку, и Ада ведёт её туда по прямой. Модель B выдаёт сразу 50 смещений, по одному на такт 20 мс. Нажми кнопку: модели обучатся в браузере и пройдут первую сцену.',
      controls: ['scene', 'play'],
      bet: { q: 'кто вставит фигурку в гнездо?', options: ['Обе: записи одни и те же', 'Только A: 256 корзин хватает на точность в треть пикселя', 'Только B'], answer: (r) => (r.Aok && r.Bok ? 0 : r.Aok ? 1 : 2) },
      action: { label: 'Обучить обе модели и запустить', run: (X) => X.first() },
      criteria: [{ label: 'Обе модели обучены', test: (r) => !!r }, { label: 'Модель A задела стенку', test: (r) => r.Ahit }, { label: 'Модель B вставила фигурку в гнездо', test: (r) => r.Bok }],
      explain: (r) => `Модель A задела стенку уже на такте ${r.Atick}. Её первая команда — точка на ${fmt(r.Alen, 0)} px впереди, за изгибом желобка, и отрезок к ней уходит от направления желобка на ${fmt(r.ang, 0)}°: прямая срезает изгиб и упирается во внутреннюю стенку. Модель B прошла за ${r.Bticks} тактов, быстрее оператора (${r.Btop}), запросив ${nWord(r.Bchunks, 'пачку', 'пачки', 'пачек')}: каждая пачка — кривая из 50 точек, и между выводами фигурка едет по дуге. На графике под сценой видно то же: у A направление движения меняется ступенькой раз в 0,34 с, у B — плавно.` },
    { short: '20 сцен', title: 'Проверь на 20 новых желобках', text: 'Одна сцена — ещё не вывод. Проверим обе модели на 20 желобках, которых не было в записях: радиусы изгибов, углы и повороты у всех разные.',
      controls: ['scene', 'play'], onEnter: (X) => { X.setTempo(1); X.setPair('ab'); },
      bet: { q: 'сколько желобков из 20 пройдёт модель A?', options: ['Больше половины: на первой сцене просто не повезло', 'Почти ни одного: прямые срезают изгиб везде', 'Столько же, сколько B: записи одинаковые'], answer: (r) => (r.aOk > 10 ? 0 : r.aOk === r.bOk ? 2 : 1) },
      action: { label: 'Проверить на 20 сценах', run: (X) => X.twenty() },
      criteria: [{ label: 'Модель B проходит не меньше 15 желобков из 20', test: (r) => r.bOk >= 15 }, { label: 'Модель A проходит не больше 5', test: (r) => r.aOk <= 5 }],
      explain: (r) => `B прошла ${r.bOk} из 20, в среднем за ${fmt(r.bMeanT, 2)} времени оператора${r.bFail >= 0 ? `; на сцене ${r.bFail + 1} она задела стенку — посмотри её в свободном режиме` : ''}. A прошла ${r.aOk} из 20 и на ${r.aHit} задела стенку. Это не случайность: на каждом изгибе отрезок длиной в треть секунды движения срезает дугу сильнее, чем позволяет зазор в 2,75 px.` },
    { short: 'Темп A', title: 'Пусть модель A едет медленнее', text: 'При темпе 0,7 модель A называет, куда оператор сдвинул фигурку за 0,7 × 0,34 с, а Ада едет туда те же 0,34 с. Отрезки короче — изгиб срезается меньше, но фигурка едет дольше, а срок — 1,3 времени оператора. Найди темп, при котором A проходит больше всего желобков из 20.',
      controls: ['scene', 'play', 'tempo'], onEnter: (X) => { st.barsAB = true; X.setPair('ab'); },
      criteria: [{ label: 'Темп ниже 1', test: (r, s) => s.tempo < 1 }, { label: 'При этом темпе A проходит больше всего желобков: ни один другой темп не лучше', test: (r, s) => s.trained && s.tempo < 1 && s.aOk === s.bestOk }],
      hint: 'Ползунок «Темп A» — под сценой. Столбики пересчитываются сразу.',
      explain: (r, ctx) => { const s = api.state(), b = Store.evalOf('B'); return `Лучший темп — ${fmt(s.bestTempo, 2)}: A проходит ${s.bestOk} из 20, в среднем за ${s.aMeanT ? fmt(s.aMeanT, 2) : '—'} времени оператора. При меньшем темпе фигурка всё чаще не успевает в срок, при большем — задевает стенку. Даже лучший темп далеко от B: ${b.ok} из 20 за ${fmt(b.meanT, 2)}. Командовать чаще модель A не может: каждая команда — проход большой модели.`; } },
    { short: 'Предобучение', title: 'Одна запись желобка', text: 'Теперь записей желобка одна. Модель с нуля учится только на ней. Другую модель сначала предобучают на 120 записях других задач на том же столе — довести фигурку до кубика, обвести вокруг миски, провести змейкой, — а потом постобучают на той же одной записи. Обе устроены как B.',
      controls: ['scene', 'play', 'pair'],
      bet: { q: 'какая модель пройдёт больше желобков?', options: ['С нуля: она училась только на нужной задаче', 'Предобученная и постобученная', 'Предобученная без записи желобка'], answer: (r) => { const v = [r.S.ok, r.PF.ok, r.P.ok]; return v.indexOf(Math.max(...v)); } },
      action: { label: 'Предобучить и сравнить', run: (X) => X.pre() },
      criteria: [{ label: 'Предобученная и постобученная прошла больше желобков, чем модель с нуля', test: (r) => r.PF.ok > r.S.ok }, { label: 'Без постобучения модель влетает в гнездо хотя бы на половине желобков', test: (r) => r.P.bump >= 10 }],
      explain: (r) => `Из 20 желобков модель с нуля прошла ${r.S.ok}, только предобученная — ${r.P.ok}, предобученная и постобученная — ${r.PF.ok}. В единственной записи желобок сначала поворачивает в одну сторону. На желобках с тем же первым поворотом модель с нуля прошла ${r.sameOk} из ${r.sameN}, с обратным — ${r.otherOk} из ${r.otherN}: зеркальный желобок ей незнаком. Предобученная модель видела повороты в обе стороны в других задачах, но вставлять фигурку медленно её никто не учил, и без постобучения она влетает в гнездо на ${r.P.bump} желобках из 20. Постобучение на одной записи научило её этому, хотя часть желобков после него она задевает: одной записи мало и для постобучения. В π0 так же: предобучение даёт общие навыки и исправления, постобучение — то, как делать конкретную задачу.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Листай сцены, меняй темп A и пары моделей, проигрывай проходы. Найди желобок, на котором модель B задевает стенку, и посмотри на график направления: что происходит в момент, когда приходит новая пачка?', final: true, controls: ['scene', 'play', 'tempo', 'pair'] },
  ];
  function init() {
    legend('#lLegend', [['желобок: фигурка не должна касаться стенок', 'var(--ink-3)', 'band'], ['фигурка в захвате Ады', 'var(--ink)', 'ring'], ['гнездо', 'var(--good)', 'dring'], ['путь левой модели (A или с нуля)', 'var(--classic)'], ['путь правой модели (B или после предобучения)', 'var(--e2e)'], ['где модель выдала команду или пачку', 'var(--classic)', 'dot'], ['текущая команда A или пачка B', 'var(--hybrid)', 'dash'], ['что видит модель: точки середины желобка впереди', 'var(--ink-2)', 'ring'], ['где фигурка задела стенку', 'var(--critical)', 'cross']]);
    $('#lScene').addEventListener('input', (e) => setScene(+e.target.value - 1));
    $('#lTempo').addEventListener('input', (e) => setTempo(+e.target.value));
    segBind('#lPair', (v) => setPair(v));
    $('#lPlay').addEventListener('click', () => { if (st.playing) stop(); play(); });
    let last = 0; Store.on(() => { const now = performance.now(); if (!Store.st.busy || now - last > 120) { last = now; render(); } });
    ctl = mountMissions('#lMis', missions, api, { controls: { scene: '#wrapLScene', tempo: '#wrapLTempo', pair: '#wrapLPair', play: '#lPlay' }, scene: '#lDuo' });
    syncRange($('#lScene'), '1'); syncRange($('#lTempo'), fmt(1, 2)); render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, PAIRS };
})();

/* =====================================================================
   2. FAST: пачка как сигнал, ДКП, k коэффициентов, округление
   ===================================================================== */
const Fast = (() => {
  const E = L36, W = 640, H = 330, CWd = 640, CH = 150;
  /** Пачка из лаборатории: 50 смещений фигурки в осях желобка у старта, из первой длинной записи оператора. */
  const CHUNK = (() => { const d = E.fineDemos(E.RECIPE.fineN).find((q) => q.T >= 55), F = E.frameAt(d.sc, d.pos[0]); return E.intendedDisp(d, 0, E.CFG.H).map((v) => E.toLocal(F, v)); })();
  const st = { k: 50, g: 10 };
  let ctl = null;
  const enc = () => E.fastEncode(CHUNK, st.k, st.g);
  function minErrK(g) { let best = Infinity, bk = 1; for (let k = 1; k <= 50; k++) { const e = E.fastEncode(CHUNK, k, g).maxPos; if (e < best - 1e-9) { best = e; bk = k; } } return { k: bk, err: best }; }
  function draw() {
    const P = pal(), r = enc(), { c, k } = HeroKit.fit($('#fCv'), W, H);
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const rows = [['вдоль желобка на старте', 0], ['поперёк желобка на старте', 1]], l = Math.round(34 * k) + 12, rr = W - 12;
    rows.forEach(([name, d], ri) => {
      const top = 14 + ri * 158, bot = top + 120, D = r.dims[d], vals = D.x.concat(D.y);
      let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 0.5) { const m = (hi + lo) / 2; lo = m - 0.25; hi = m + 0.25; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const x = (i) => l + i / 49 * (rr - l), y = (v) => bot - (v - lo) / (hi - lo) * (bot - top);
      c.strokeStyle = P.grid; c.lineWidth = 1; c.strokeRect(l, top, rr - l, bot - top);
      for (const v of [lo + pad, hi - pad]) HeroKit.label(c, k, fmt(v, 2), l - 5, y(v), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
      if (lo < 0 && hi > 0) { c.setLineDash([3, 3]); c.beginPath(); c.moveTo(l, y(0)); c.lineTo(rr, y(0)); c.stroke(); c.setLineDash([]); }
      c.strokeStyle = P.ink3; c.lineWidth = 3; c.beginPath(); D.x.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)))); c.stroke();
      c.strokeStyle = P.e2e; c.lineWidth = 2; c.beginPath(); D.y.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)))); c.stroke();
      HeroKit.label(c, k, name + ', px за такт', l + 6, top + 10, { align: 'left', px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
      if (ri === 1) for (const t of [1, 10, 20, 30, 40, 50]) HeroKit.label(c, k, String(t), x(t - 1), bot + 11, { px: 10, mono: true, color: P.ink3, halo: false });
    });
    drawCoef(r);
  }
  function drawCoef(r) {
    const P = pal(), { c, k } = HeroKit.fit($('#fCoef'), CWd, CH), l = 12, rr = CWd - 12, mid = CH / 2 - 6, amp = CH / 2 - 20;
    c.fillStyle = P.bg; c.fillRect(0, 0, CWd, CH);
    // столбики — округлённые коэффициенты ДКП всех частот; оставленные закрашены
    const raw = r.dims.map((D) => D.coef.map((v) => Math.round(st.g * v))), M = Math.max(1, ...raw.flat().map(Math.abs));
    c.strokeStyle = P.grid; c.beginPath(); c.moveTo(l, mid); c.lineTo(rr, mid); c.stroke();
    const bw = (rr - l) / 50;
    raw.forEach((row, d) => row.forEach((q, j) => {
      if (!q) return; const hh = Math.sign(q) * Math.sqrt(Math.abs(q) / M) * amp, x0 = l + j * bw + (d ? bw / 2 : 1), w = bw / 2 - 1, col = d ? P.hy : P.cl;
      c.beginPath(); c.rect(x0, hh > 0 ? mid - hh : mid, w, Math.abs(hh)); if (j < st.k) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = 1; c.stroke(); }
    }));
    const kx = l + st.k * bw; c.setLineDash([4, 3]); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.beginPath(); c.moveTo(kx, 6); c.lineTo(kx, CH - 22); c.stroke(); c.setLineDash([]);
    HeroKit.label(c, k, `k = ${st.k}`, Math.min(kx + 4, rr - 30), 12, { align: 'left', px: 10.5, weight: 700, color: P.ink2, haloColor: P.bg });
    for (const j of [0, 10, 20, 30, 40, 49]) HeroKit.label(c, k, String(j), l + (j + 0.5) * bw, CH - 9, { px: 10, mono: true, color: P.ink3, halo: false });
  }
  function out() {
    const r = enc();
    setOut($('#fOut'), `Оставлено <b>${st.k}</b> ${plural(st.k, 'коэффициент', 'коэффициента', 'коэффициентов')} на ось, всего ${2 * st.k} ${plural(2 * st.k, 'число', 'числа', 'чисел')}; ненулевых после округления — <b>${r.nonzero}</b>. Без сжатия, по токену на такт и ось, — 100. Путь, восстановленный из оставленных чисел, отходит от исходного не больше чем на <b>${fmt(r.maxPos, 2)} px</b>, около ${fmt(r.maxPos * 5, 0)} мм.`);
  }
  function render() { draw(); out(); }
  function setK(v) { st.k = Math.max(1, Math.min(50, Math.round(v))); const inp = $('#fK'); inp.value = st.k; syncRange(inp, String(st.k)); render(); if (ctl) ctl.update(); }
  function setG(v) { st.g = +v; segSet('#fG', st.g); render(); if (ctl) ctl.update(); }
  function state() { const r = enc(), m = minErrK(st.g); return { k: st.k, g: st.g, err: r.maxPos, nonzero: r.nonzero, minErr: m.err, minErrK: m.k }; }
  const api = {
    reset() { setG(10); setK(50); }, state, setK, setG,
    async findMin() { setG(10); const kMin = E.fastMinK(CHUNK, 10, 1); setK(kMin); await wait(150); const r = enc(); return { kMin, err: r.maxPos, nonzero: r.nonzero }; },
  };
  const missions = [
    { short: 'Сколько чисел', title: 'Сколько коэффициентов нужно пачке', text: 'Сейчас оставлены все 50 коэффициентов на ось — это та же пачка, только округлённая. Найдём наименьшее число коэффициентов, при котором восстановленный путь фигурки отходит от исходного не больше чем на 1 px, около 5 мм.',
      controls: ['k'],
      bet: { q: 'сколько коэффициентов на ось понадобится?', options: ['Почти все 50: иначе пропадут детали движения', 'Несколько, меньше десяти: движение плавное', 'Один: хватит среднего смещения'], answer: (r) => (r.kMin >= 30 ? 0 : r.kMin >= 2 ? 1 : 2) },
      action: { label: 'Найти наименьшее k', run: (X) => X.findMin() },
      criteria: [{ label: 'Путь отходит от исходного не больше чем на 1 px', test: (r) => r.err <= 1 }, { label: 'Оставлено меньше 10 коэффициентов на ось', test: (r) => r.kMin < 10 }],
      explain: (r) => `Хватает ${nWord(r.kMin, 'коэффициента', 'коэффициентов', 'коэффициентов')} на ось: ${2 * r.kMin} чисел вместо 100, и путь отходит от исходного на ${fmt(r.err, 2)} px. Ненулевых после округления из них ${r.nonzero}. Подвинь k к 1: остаётся только среднее смещение, и фигурка едет по прямой, как у модели A. Высокие частоты почти пусты: у плавного движения резких скачков нет. В статье FAST на секунду складывания футболки при 50 Гц вышло 53 токена вместо 700.` },
    { short: 'Масштаб γ', title: 'Округлить грубее', text: 'Перед округлением FAST умножает коэффициенты на масштаб γ, по умолчанию 10. Чем меньше γ, тем грубее округление и тем больше коэффициентов превращается в нули. Поставь γ = 3 и найди k, при котором ошибка наименьшая.',
      controls: ['k', 'g'],
      criteria: [{ label: 'Масштаб γ = 3', test: (r, s) => s.g === 3 }, { label: 'При этом k ошибка наименьшая для γ = 3', test: (r, s) => s.g === 3 && Math.abs(s.err - s.minErr) < 1e-9 }],
      hint: 'Переключатель γ — под графиками. Двигай k и следи за ошибкой в строке под сценой.',
      explain: () => { const a = minErrK(3), b = minErrK(10); return `При γ = 3 ошибка не опускается ниже ${fmt(a.err, 2)} px, а при γ = 10 — ${fmt(b.err, 2)}: каждый коэффициент округляется с ошибкой до 1/(2γ), и эти ошибки складываются по 50 тактам пути. Зато ненулевых чисел меньше. γ задаёт, сколько точности отдать за сжатие; авторы FAST выбрали 10 и пишут, что результат к нему не слишком чувствителен.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй k и γ. Найди настройку с наименьшим числом ненулевых коэффициентов, при которой путь отходит от исходного не больше чем на 2 px.', final: true, controls: ['k', 'g'] },
  ];
  function init() {
    $('#fK').addEventListener('input', (e) => setK(+e.target.value));
    segBind('#fG', (v) => setG(v));
    syncRange($('#fK'), String(st.k));
    ctl = mountMissions('#fMis', missions, api, { controls: { k: '#wrapFK', g: '#wrapFG' }, scene: '#fCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, CHUNK, minErrK };
})();

/* ---------- Задача: что π0 видела при предобучении ---------- */
function initSort() {
  return Cards.sort('#taskSort', {
    targets: [{ id: 'in', label: 'Есть в предобучении', note: 'дообучение нужно, чтобы делать её хорошо' }, { id: 'near', label: 'Похожа на задачи предобучения', note: 'знакомые движения, новый предмет или задача' }, { id: 'new', label: 'В предобучении такого нет', note: 'новые предметы и движения' }],
    items: [
      { id: 'laundry', label: 'Сложить бельё из корзины', target: 'in', why: 'Задача есть в предобучении, но складывать вещи из скомканного состояния модель учится постобучением.' },
      { id: 'mobile', label: 'Сложить бельё мобильным роботом', target: 'in', why: 'Есть в предобучении; роботу ещё нужно управлять поворотом и движением базы.' },
      { id: 'dryer', label: 'Вынуть бельё из сушилки', target: 'in', why: 'Есть в предобучении.' },
      { id: 'bowls', label: 'Сложить миски стопкой', target: 'near', why: 'Захватывать и переносить посуду модель училась на уборке стола.' },
      { id: 'towel', label: 'Сложить полотенце', target: 'near', why: 'Похожа на складывание футболки из предобучения.' },
      { id: 'micro', label: 'Поставить контейнер в микроволновку', target: 'near', why: 'Контейнеры похожи на предметы из предобучения, а микроволновки там нет.' },
      { id: 'towelroll', label: 'Заменить рулон бумажных полотенец', target: 'new', why: 'Таких предметов в предобучении нет, авторы относят задачу к трудным.' },
      { id: 'drawer', label: 'Убрать предметы в ящик рукой Franka', target: 'new', why: 'Похожей задачи для робота Franka в предобучении нет.' },
      { id: 'bussing', label: 'Убрать обеденный стол с незнакомыми предметами', target: 'new', why: 'По словам авторов, этой задачи в предобучении нет: незнакомые предметы, плотный завал, тонкие стаканы.' },
      { id: 'box', label: 'Собрать коробку из плоской заготовки', target: 'new', why: 'Нет в предобучении: картон надо гнуть, придерживая одну часть, пока сгибаешь другую.' },
      { id: 'eggs', label: 'Уложить шесть яиц в лоток', target: 'new', why: 'Нет в предобучении: скользкие яйца, точная укладка, крышку закрывают двумя руками.' },
      { id: 'togo', label: 'Переложить еду в контейнер с собой', target: 'new', why: 'Нет в предобучении.' },
    ],
    after: 'Авторы делят задачи так же. Чем ближе задача к предобучению, тем больше выигрыш от него, но и на задачах, которых в предобучении нет, полная π0 с постобучением справлялась лучше модели, обученной с нуля.',
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
    { q: 'π0 выдаёт действия токенами, как OpenVLA?', o: ['Да, только корзин больше', 'Нет: языковая модель остаётся, а непрерывную пачку действий строит эксперт действий методом flow matching', 'Нет: действия выдаёт отдельная модель, которая не видит картинок'], a: 1, e: 'Токены картинок и текста проходят через PaliGemma, токены действий — через эксперт действий, и он за 10 шагов Эйлера превращает шум в пачку из 50 непрерывных действий. Токенами действия выдаёт π0-FAST.' },
    { q: 'Откуда эксперт действий знает, что на картинках и в команде?', o: ['У него свои камеры и свой энкодер картинок', 'Веса у него свои, но трансформер общий: токены действий читают токены картинок и текста через внимание', 'PaliGemma пересказывает ему сцену текстом'], a: 1, e: 'Эксперт — вторая, меньшая группа весов того же трансформера, около 300 млн параметров. Через его веса проходят токены состояния и действий, а с PaliGemma он встречается только во внимании. Картинки и текст считаются один раз и лежат в кэше.' },
    { q: 'Команды 50 раз в секунду — значит, π0 вызывают 50 раз в секунду?', o: ['Да, на каждый такт', 'Нет: один вывод даёт пачку из 50 действий, робот исполняет 25 и раз в 0,5 с получает новую пачку', 'Нет: модель вызывают раз в секунду'], a: 1, e: 'Вывод занимает 73 мс на RTX 4090, а исполнение 25 действий — 0,5 с. Пачка задаёт движение между выводами.' },
    { q: 'Десять шагов flow matching — это десять проходов всей модели на 3,3 млрд параметров?', o: ['Да, поэтому вывод медленный', 'Нет: картинки и текст проходят через VLM один раз и лежат в кэше, а 10 раз проходит только эксперт по 50 токенам действий', 'Нет, шаг всего один'], a: 1, e: 'Из 73 мс на картинки и текст уходит 46 мс, а все 10 шагов flow — 27 мс. Блочная маска позволяет не пересчитывать наблюдение.' },
    { q: 'Если записать много аккуратных демонстраций задачи, предобучение не нужно?', o: ['Да, аккуратные данные лучше любых', 'Нет: в аккуратных записях нет ошибок и исправлений, и модель, обученная только на них, хрупкая', 'Нет, предобучение нужно только для языка'], a: 1, e: 'Авторы π0 пишут, что модель, обученная только на качественных данных, не умеет надёжно исправляться. Разнообразные данные дают исправления, постобучение — качество; выигрыш от предобучения доходил до двух раз.' },
    { q: 'FAST повышает точность токенов, добавляя корзин?', o: ['Да, вместо 256 корзин берёт 1024', 'Нет: он сжимает пачку косинусным преобразованием, округлением и BPE, и токенов становится в разы меньше', 'Нет: он убирает токены и выдаёт числа'], a: 1, e: 'Секунда складывания футболки на 50 Гц — 53 токена FAST вместо 700 при корзинах, примерно 30 токенов на руку за секунду.' },
    { q: 'π0-FAST лучше π0 во всём?', o: ['Да: она и учится, и работает быстрее', 'Нет: учится она в 5 раз быстрее, но на пачку тратит около 750 мс, а π0 укладывается в 100 мс', 'Нет: она хуже на всех задачах'], a: 1, e: 'Токены по одному декодирует вся языковая модель внутри PaliGemma — Gemma на 2 млрд параметров, а у π0 10 шагов flow делает эксперт на 300 млн. На неподвижных задачах это не мешало, на быстрых авторы называют это ограничением.' },
    { q: 'Время τ для обучения π0 берут равномерно от 0 до 1?', o: ['Да, как в первых работах о flow matching', 'Нет: из бета-распределения, которое чаще даёт шумные моменты, потому что среднее действие по наблюдению предсказать трудно', 'Нет: всегда τ = 0,5'], a: 1, e: 'Авторы рассуждают так: наблюдение робота почти однозначно задаёт действие, поэтому даже начало пути от шума требует от сети много работы. Моменты выше s = 0,999 не берут вовсе.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('lab', () => { mis.lab = Lab.init(); }); safe('fast', () => { mis.fast = Fast.init(); });
    safe('sort', () => { mis.sort = initSort(); }); safe('quiz', initQuiz);
    safe('count', () => { const n = ['lMis', 'fMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l36 = { mis, SPEED, Store, Lab, Fast, L36 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
