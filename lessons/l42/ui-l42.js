/* =====================================================================
   ui-l42.js — урок 4.2 «Телеоперация и устройства сбора». Интерактивы —
   миссии на живой сцене (shared/missions.js):
   1) лаборатория: читатель — оператор. Он ведёт руку Ады с пульта —
      ведущей рукой, «рукой в воздухе» или клавишами — с задержкой и дрожью
      слежения; записи сравниваются рядом: путь и скорость захвата;
   2) калькулятор: цена годной демонстрации и срок сбора по способам;
   3) сортировка устройств (shared/cards.js) и квиз.
   Анимированные схемы устройств — l42/devices.js, движок — l42/engine.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение времени для автотестов; на результаты не влияет
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
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), e2eS: HeroKit.css('--e2e-soft'), cl: HeroKit.css('--classic'), clS: HeroKit.css('--classic-soft'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const money = (v) => '$' + Math.round(v).toLocaleString('ru-RU');
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
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const MODE_NAME = { leader: 'ведущая рука', air: 'рука в воздухе', keys: 'клавиши' };

/* =====================================================================
   Рисование. Сцена — вид сбоку: Ада у стола, чашка, полка на стене.
   Логические координаты 600 × 420, 380 пикселей на метр, плечо Ады в (150, 172).
   ===================================================================== */
const TD = (() => {
  const E = L42, S = E.S, W = 600, H = 420, SC = 380, OX = 150, OY = 172;
  const X = (x) => OX + x * SC, Y = (y) => OY - y * SC;
  const inv = (px, py) => ({ x: (px - OX) / SC, y: (OY - py) / SC });
  const colors = () => { const d = HeroKit.dark(); return { adaFill: d ? '#2a2926' : '#f4efe6', adaLine: d ? '#b0afa6' : '#3d3c38', wood: d ? '#3a352c' : '#d9c7a6', cupFill: d ? '#d9d6cc' : '#ffffff', cupLine: d ? '#b0afa6' : '#3d3c38', wall: d ? '#23221f' : '#efebe2' }; };
  function rr(c, x, y, w, hh, r) { c.beginPath(); c.roundRect(x, y, w, hh, r); }
  function cup(c, cx, yb, K) {                              // cx, yb — центр дна в метрах
    const x = X(cx), y = Y(yb), w = S.cup.w * SC, hh = S.cup.h * SC;
    c.lineWidth = 2; c.strokeStyle = K.cupLine; c.fillStyle = K.cupFill;
    c.beginPath(); c.arc(x + w / 2 + 2, y - hh * 0.55, hh * 0.24, -Math.PI / 2, Math.PI / 2); c.stroke();
    rr(c, x - w / 2, y - hh, w, hh, [2, 2, 6, 6]); c.fill(); c.stroke();
  }
  function ada(c, K, P) {
    c.lineWidth = 2.4; c.strokeStyle = K.adaLine; c.fillStyle = K.adaFill;
    rr(c, X(-0.31), Y(0.07), 0.3 * SC, 0.5 * SC, 26); c.fill(); c.stroke();              // корпус
    c.beginPath(); c.arc(X(-0.16), Y(-0.1), 5, 0, 7); c.fillStyle = P.hy; c.fill();
    c.fillStyle = K.adaFill; rr(c, X(-0.27), Y(0.33), 0.24 * SC, 0.2 * SC, 24); c.fill(); c.stroke();   // голова
    rr(c, X(-0.13), Y(0.29), 0.11 * SC, 0.11 * SC, 12); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.ellipse(X(-0.065), Y(0.235), 4, 6, 0, 0, 7); c.fill();
    c.fillStyle = K.adaFill; c.strokeStyle = K.adaLine;
    rr(c, X(-0.34), Y(-0.45), 0.36 * SC, 0.13 * SC, 12); c.fill(); c.stroke();             // колёсная база
    for (const wx of [-0.26, -0.06]) { c.beginPath(); c.arc(X(wx), Y(-0.6), 0.045 * SC, 0, 7); c.fillStyle = P.ink3; c.fill(); }
  }
  /** Рука Ады: звенья, суставы и захват под кистью. open — раскрытие пальцев 0…1. */
  function arm(c, q, open, P, col) {
    const f = Arm.fk(q), b = [X(0), Y(0)], e = [X(f.x1), Y(f.y1)], w = [X(f.x), Y(f.y)];
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [lw, cc] of [[13, col], [8.5, P.clS]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.stroke(); }
    c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(w[0], w[1]); c.lineTo(w[0], w[1] + 0.02 * SC); c.stroke();
    const hw = (0.018 + 0.03 * open) * SC, y0 = w[1] + 0.02 * SC, y1 = w[1] + S.finger * SC;
    c.lineWidth = 3.4; c.beginPath(); c.moveTo(w[0] - hw - 2, y0); c.lineTo(w[0] + hw + 2, y0); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(w[0] - hw, y0); c.lineTo(w[0] - hw, y1); c.moveTo(w[0] + hw, y0); c.lineTo(w[0] + hw, y1); c.stroke();
    for (const p of [b, e, w]) { c.beginPath(); c.arc(p[0], p[1], 5.5, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); }
    c.restore();
  }
  const openOf = (g, gt) => (g === 'open' ? 1 : g === 'closing' ? 1 - gt / 0.2 : g === 'opening' ? gt / 0.2 : g === 'done' ? 1 : 0);
  /** Сцена в состоянии sim. o: { rec, delay, mode, trail } */
  function scene(cv, sim, o) {
    const { c, k } = HeroKit.fit(cv, W, H), P = pal(), K = colors(), sh = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = K.wall; c.fillRect(X(S.wall), 0, W - X(S.wall), H);
    c.strokeStyle = P.line; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(S.wall), 0); c.lineTo(X(S.wall), H); c.stroke();
    c.fillStyle = P.grid; c.fillRect(0, Y(-0.63), W, H - Y(-0.63));
    // стол и полка
    c.fillStyle = K.wood; c.fillRect(X(S.table.x0), Y(S.table.y), X(S.wall) - X(S.table.x0), 7);
    c.fillStyle = P.ink3; c.fillRect(X(S.table.x0) + 8, Y(S.table.y) + 7, 5, Y(-0.63) - Y(S.table.y) - 7); c.fillRect(X(S.wall) - 14, Y(S.table.y) + 7, 5, Y(-0.63) - Y(S.table.y) - 7);
    c.fillStyle = K.wood; c.fillRect(X(S.shelf.x0), Y(S.shelf.y), X(S.wall) - X(S.shelf.x0), S.shelf.th * SC);
    c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(X(S.shelf.x0), Y(S.shelf.y), X(S.wall) - X(S.shelf.x0), S.shelf.th * SC);
    const held = sim.grip === 'hold' || sim.grip === 'opening' || sim.grip === 'closing';
    // где взять и куда поставить
    c.setLineDash([5, 4]); c.lineWidth = 1.6;
    if (!held && sim.grip !== 'done') { c.strokeStyle = P.e2e; rr(c, X(S.cup.x) - 26, Y(S.table.y + S.cup.h) - 12, 52, S.cup.h * SC + 16, 8); c.stroke(); }
    if (held || sim.grip === 'done') { c.strokeStyle = sim.grip === 'done' ? P.good : P.e2e; rr(c, X(S.placeX[0] - 0.04), Y(S.shelf.y + S.cup.h + 0.03), (S.placeX[1] - S.placeX[0] + 0.08) * SC, (S.cup.h + 0.03) * SC, 8); c.stroke(); }
    c.setLineDash([]);
    HeroKit.label(c, k, held ? (sh ? 'сюда' : 'поставь сюда') : sim.grip === 'done' ? 'на полке' : (sh ? 'чашка' : 'возьми чашку'), held || sim.grip === 'done' ? X((S.placeX[0] + S.placeX[1]) / 2) : X(S.cup.x), held || sim.grip === 'done' ? Y(S.shelf.y + S.cup.h + 0.03) - 12 : Y(S.table.y + S.cup.h) - 22, { px: 11.5, color: sim.grip === 'done' ? P.good : P.e2e, weight: 700, haloColor: P.bg });
    ada(c, K, P);
    // след записи
    if (o.trail && sim.rec.length > 1) { c.strokeStyle = HeroKit.dark() ? 'rgba(120,170,240,.55)' : 'rgba(42,120,214,.45)'; c.lineWidth = 1.6; c.beginPath(); sim.rec.forEach((r, i) => (i ? c.lineTo(X(r.w.x), Y(r.w.y)) : c.moveTo(X(r.w.x), Y(r.w.y)))); c.stroke(); }
    if (!held) cup(c, sim.cup.x, sim.cup.y, K);
    arm(c, sim.q, openOf(sim.grip, sim.gripT), P, P.cl);
    if (held) cup(c, sim.cup.x, sim.cup.y, K);
    // состояние записи и задержка
    const t = sim.started ? sim.rec.length * E.DT : 0;
    if (o.rec) { c.beginPath(); c.arc(16, 16, 6, 0, 7); c.fillStyle = Math.floor(performance.now() / 500) % 2 ? P.bad : 'rgba(214,69,69,.35)'; c.fill(); }
    const recTxt = o.rec ? (sim.started ? `запись · ${fmt(t, 1)} с` : (sh ? 'запись: начни движение' : 'запись начнётся с первого движения')) : (sh ? 'тренировка' : 'тренировка, запись не идёт');
    HeroKit.label(c, k, recTxt, o.rec ? 28 : 10, 16, { px: 12, align: 'left', color: o.rec ? P.ink : P.ink3, weight: 700, haloColor: P.bg });
    const modeTxt = sh ? `${{ leader: 'ведущая', air: 'в воздухе', keys: 'клавиши' }[sim.mode]} · ${sim.delay} мс` : `${MODE_NAME[sim.mode]} · задержка ${sim.delay} мс${sim.mode === 'air' ? ` · дрожь ${sim.noise} мм` : ''}`;
    HeroKit.label(c, k, modeTxt, W - 10, sh ? 40 : 16, { px: 11.5, align: 'right', color: P.ink2, weight: 650, haloColor: P.bg });
    if (sim.delay > 0) { const n = 5; for (let i = 0; i < n; i++) { const ph = ((performance.now() / 1000 * 1000 / Math.max(80, sim.delay) / 2 + i / n) % 1); c.beginPath(); c.arc(W - 140 + ph * 130, sh ? 60 : 32, 2.6, 0, 7); c.fillStyle = P.e2e; c.fill(); } if (!sh) HeroKit.label(c, k, 'команды в пути', W - 10, 44, { px: 10.5, align: 'right', color: P.ink3, haloColor: P.bg }); }
    if (!sh) { HeroKit.label(c, k, 'Ада', X(-0.16), Y(-0.24), { px: 11.5, color: P.ink3, weight: 700, haloColor: K.adaFill }); HeroKit.label(c, k, 'полка', X(0.84), Y(S.shelf.y - S.shelf.th) + 12, { px: 11, color: P.ink3, haloColor: P.bg }); HeroKit.label(c, k, 'стол', X(0.8), Y(S.table.y) + 18, { px: 11, color: P.ink3, haloColor: P.bg }); }
    return { k };
  }

  /* ---------- пульт оператора: ведущая рука, рука в воздухе или клавиши ---------- */
  const PU = { wide: { W: 600, H: 200, bx: 70, by: 80, s: 200 }, narrow: { W: 360, H: 290, bx: 40, by: 134, s: 260 } };
  const layout = (cv) => ((cv.parentElement.getBoundingClientRect().width || 600) < 520 ? PU.narrow : PU.wide);
  const pX = (L, x) => L.bx + x * L.s, pY = (L, y) => L.by - y * L.s;
  function pult(cv, sim, o) {
    const L = layout(cv), ar = `${L.W} / ${L.H}`; if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
    const { c, k } = HeroKit.fit(cv, L.W, L.H), P = pal(), nar = L === PU.narrow;
    c.fillStyle = P.bg; c.fillRect(0, 0, L.W, L.H);
    const lab = (t, x, y, op) => HeroKit.label(c, k, t, x, y, Object.assign({ px: 11.5, color: P.ink2, haloColor: P.bg, align: 'left', weight: 600 }, op || {}));
    if (sim.mode === 'keys') {
      const cx = L.W / 2, cy = L.H / 2 + 6, sz = 34, d = o.dir || { x: 0, y: 0 };
      for (const [dx, dy, ch] of [[0, -1, '▲'], [0, 1, '▼'], [-1, 0, '◀'], [1, 0, '▶']]) {
        const on = (dx && d.x === dx) || (dy && d.y === -dy), x = cx + dx * (sz + 6) - sz / 2, y = cy + dy * (sz + 6) - sz / 2;
        c.beginPath(); c.roundRect(x, y, sz, sz, 7); c.fillStyle = on ? P.e2e : P.surf; c.fill(); c.lineWidth = 1.6; c.strokeStyle = on ? P.e2e : P.line; c.stroke();
        HeroKit.label(c, k, ch, x + sz / 2, y + sz / 2, { px: 14, color: on ? '#fff' : P.ink2, halo: false });
      }
      lab('Клавиши: стрелка двигает захват на 15 см/с, пока её держишь', 12, 18, { weight: 700, color: P.ink });
      lab(nar ? 'стрелки на клавиатуре или кнопки ниже' : 'стрелки на клавиатуре или кнопки под пультом', 12, 36, { color: P.ink3, px: 11 });
      return;
    }
    // рабочая зона пульта: где может быть кисть
    c.setLineDash([3, 5]); c.strokeStyle = P.line; c.lineWidth = 1;
    for (const r of E.REACH) { c.beginPath(); c.arc(pX(L, 0), pY(L, 0), r * L.s, -1.25, 1.35); c.stroke(); }
    c.setLineDash([]);
    if (sim.mode === 'leader') {
      const f = Arm.fk(sim.qLead), b = [pX(L, 0), pY(L, 0)], e = [pX(L, f.x1), pY(L, f.y1)], w = [pX(L, f.x), pY(L, f.y)];
      c.fillStyle = P.surf; c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.beginPath(); c.roundRect(b[0] - 12, b[1] - 6, 24, 18, 4); c.fill(); c.stroke();
      c.save(); c.lineCap = 'round';
      for (const [lw, cc] of [[11, P.e2e], [6.5, P.e2eS]]) { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(w[0], w[1]); c.lineTo(w[0], w[1] + 22); c.stroke(); }
      for (const p of [b, e, w]) { c.beginPath(); c.arc(p[0], p[1], 5, 0, 7); c.fillStyle = P.surf; c.fill(); c.strokeStyle = P.e2e; c.lineWidth = 2; c.stroke(); }
      c.restore();
      c.beginPath(); c.arc(w[0], w[1] + 22, o.drag ? 12 : 10, 0, 7); c.fillStyle = o.drag ? P.e2e : P.e2eS; c.fill(); c.strokeStyle = P.e2e; c.lineWidth = 2; c.stroke();
      if (!o.drag) HeroKit.label(c, k, 'тяни', w[0] + 16, w[1] + 22, { px: 11, color: P.e2e, align: 'left', weight: 700, haloColor: P.bg });
      const dg = (r) => fmt(r * 180 / Math.PI, 0) + '°';
      lab(nar ? 'Ведущая рука: копия руки Ады 1 : 2' : 'Пульт: ведущая рука — копия руки Ады в масштабе 1 : 2', nar ? 12 : 300, 18, { weight: 700, color: P.ink });
      lab(`плечо ${dg(sim.qLead[0])} · локоть ${dg(sim.qLead[1])} → те же углы у Ады`, nar ? 12 : 300, 38, { color: P.e2e, px: 11, mono: true });
      if (!nar) lab('Тяни за рукоять и смотри на Аду, а не на пульт', 300, 58, { color: P.ink3, px: 11 });
    } else {
      const hx = pX(L, sim.hand.x), hy = pY(L, sim.hand.y), tx = pX(L, sim.cmdTarget.x), ty = pY(L, sim.cmdTarget.y);
      c.beginPath(); c.arc(tx, ty, 4, 0, 7); c.strokeStyle = P.e2e; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.arc(hx, hy, o.drag ? 13 : 11, 0, 7); c.fillStyle = o.drag ? P.e2e : P.e2eS; c.fill(); c.strokeStyle = P.e2e; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.45; c.beginPath(); c.moveTo(hx + Math.cos(a) * 12, hy + Math.sin(a) * 12 - 2); c.lineTo(hx + Math.cos(a) * 21, hy + Math.sin(a) * 21 - 3); c.lineWidth = 3; c.strokeStyle = P.e2e; c.stroke(); }
      if (!o.drag) HeroKit.label(c, k, 'тяни', hx + 24, hy + 8, { px: 11, color: P.e2e, align: 'left', weight: 700, haloColor: P.bg });
      lab(nar ? 'Рука в воздухе: шлем следит за кистью' : 'Пульт: рука в воздухе — шлем следит за кистью оператора', nar ? 12 : 300, 18, { weight: 700, color: P.ink });
      lab(`кружок — кисть, колечко — что увидел шлем: дрожь ± ${sim.noise} мм`, nar ? 12 : 300, 38, { color: P.e2e, px: 11 });
      if (!nar) lab('Тяни кисть и смотри на Аду, а не на пульт', 300, 58, { color: P.ink3, px: 11 });
    }
  }
  /** Перевод точки пульта в метры кисти Ады. */
  const pultInv = (cv, p) => { const L = layout(cv); return { x: (p.x - L.bx) / L.s, y: (L.by - p.y) / L.s }; };
  const pultDims = (cv) => { const L = layout(cv); return [L.W, L.H]; };

  /* ---------- панель записи: путь захвата сбоку и скорость по времени ---------- */
  function pane(cv, rec, m, P0) {
    const W2 = 340, H2 = 150, { c, k } = HeroKit.fit(cv, W2, H2), P = P0 || pal();
    c.fillStyle = P.bg; c.fillRect(0, 0, W2, H2);
    const ps = 150, px = (x) => 8 + (x - 0.1) * ps, py = (y) => 8 + (0.36 - y) * ps;
    // путь: стол, полка, чашка
    const bx = 166, bw = W2 - bx - 8, by = 18, bh = 102;
    if (rec && rec.length >= 2) { c.fillStyle = P.grid; c.fillRect(px(S.table.x0), py(S.table.y), px(S.wall) - px(S.table.x0), 3); c.fillRect(px(S.shelf.x0), py(S.shelf.y), px(S.wall) - px(S.shelf.x0), 3); c.strokeStyle = P.line; c.lineWidth = 1; c.strokeRect(bx + 0.5, by + 0.5, bw, bh); }
    if (!rec || rec.length < 2) {
      HeroKit.label(c, k, 'Запиши демонстрацию —', W2 / 2, H2 / 2 - 9, { px: 11.5, color: P.ink3, weight: 650, haloColor: P.bg });
      HeroKit.label(c, k, 'здесь появятся её путь и скорость', W2 / 2, H2 / 2 + 9, { px: 11.5, color: P.ink3, weight: 650, haloColor: P.bg });
      return;
    }
    c.strokeStyle = P.cl; c.lineWidth = 1.6; c.beginPath(); rec.forEach((r, i) => (i ? c.lineTo(px(r.w.x), py(r.w.y)) : c.moveTo(px(r.w.x), py(r.w.y)))); c.stroke();
    c.beginPath(); c.arc(px(rec[0].w.x), py(rec[0].w.y), 3, 0, 7); c.fillStyle = P.cl; c.fill();
    // скорость захвата: паузы — серые полосы
    const T = rec.length * E.DT, vmax = 0.5, X2 = (t) => bx + t / Math.max(T, 1) * bw, Y2 = (v) => by + bh - Math.min(1, v / vmax) * bh;
    let run = 0;
    for (let i = 0; i <= m.speed.length; i++) {
      if (i < m.speed.length && m.speed[i] < 0.02) run++;
      else { if (run >= 10) { c.fillStyle = HeroKit.dark() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; c.fillRect(X2((i - run) * E.DT), by, X2(i * E.DT) - X2((i - run) * E.DT), bh); } run = 0; }
    }
    c.strokeStyle = P.cl; c.lineWidth = 1.4; c.beginPath(); m.speed.forEach((v, i) => (i ? c.lineTo(X2(i * E.DT), Y2(v)) : c.moveTo(X2(0), Y2(v)))); c.stroke();
    HeroKit.label(c, k, 'скорость захвата, м/с', bx, 9, { px: 10, align: 'left', color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, '0,5', bx - 3, by + 4, { px: 9.5, align: 'right', color: P.ink3, halo: false, mono: true });
    HeroKit.label(c, k, '0', bx - 3, by + bh, { px: 9.5, align: 'right', color: P.ink3, halo: false, mono: true });
    HeroKit.label(c, k, '0 с', bx, by + bh + 12, { px: 9.5, align: 'left', color: P.ink3, halo: false, mono: true });
    HeroKit.label(c, k, `${fmt(T, 1)} с`, bx + bw, by + bh + 12, { px: 9.5, align: 'right', color: P.ink3, halo: false, mono: true });
    HeroKit.label(c, k, 'путь сбоку', 8, H2 - 8, { px: 10, align: 'left', color: P.ink3, haloColor: P.bg });
  }
  return { W, H, X, Y, inv, scene, pult, pultInv, pultDims, pane, PU };
})();

/* =====================================================================
   Лаборатория: телеоперация руки Ады. Такт 20 мс, как телеоперация ALOHA.
   Слева — эталон (первая запись), справа — последняя запись.
   ===================================================================== */
const LabTele = (() => {
  const E = L42;
  const st = { mode: 'leader', delay: 0, noise: 5, sim: null, rec: null, ref: null, last: null, drag: false, dir: { x: 0, y: 0 }, auto: null, seed: 11, idle: 0, wait: 0, keys: {} };
  let ctl = null, acc = 0, lastT = 0, visible = false;
  const fresh = () => { st.sim = E.create({ mode: st.mode, delay: st.delay, noise: st.noise, seed: st.seed++ }); st.drag = false; st.idle = 0; st.recorded = false; };
  /** Тренировка после законченной записи: новая сцена, как только оператор берётся за пульт. */
  const live = () => { if (st.sim.done && !st.rec) fresh(); };
  function setMode(v) { if (st.rec) return; st.mode = v; segSet('#tMode', v); $('#tKeys').hidden = v !== 'keys'; $('#wrapTNoise').classList.toggle('t-off', v !== 'air'); fresh(); draw(); if (ctl) ctl.update(); }
  function setDelay(v) { if (st.rec) return; st.delay = +v; $('#tDelay').value = st.delay; syncRange($('#tDelay'), `${st.delay} мс`); fresh(); draw(); if (ctl) ctl.update(); }
  function setNoise(v) { if (st.rec) return; st.noise = +v; $('#tNoise').value = st.noise; syncRange($('#tNoise'), `${st.noise} мм`); fresh(); draw(); if (ctl) ctl.update(); }
  function lock(on) { ['#tDelay', '#tNoise', '#tRec'].forEach((s) => { $(s).disabled = on; }); $$('#tMode button').forEach((b) => { b.disabled = on; }); $('#tStop').hidden = !on; }
  /** Запись: свежая сцена, запись идёт с первого движения и кончается, когда чашка на полке (или через 60 с). */
  function record() {
    if (st.rec) return st.rec.p;
    fresh(); lock(true); st.wait = 0;
    let res; const p = new Promise((r) => { res = r; });
    st.rec = { p, res }; draw();
    return p;
  }
  function finish(aborted) {
    const R = st.rec; if (!R) return;
    const m = E.metrics(st.sim), r = Object.assign({}, m, { aborted: !!aborted || !st.sim.started, ok: m.ok && !aborted, mode: st.mode, delay: st.delay, noise: st.mode === 'air' ? st.noise : 0, rec: st.sim.rec.slice() });
    st.rec = null; st.auto = null; lock(false); st.last = r; st.recorded = r.ok;
    if (r.ok && (!st.ref || ctl && ctl.index === 0)) st.ref = r;
    panes(); draw(); R.res(r);
  }
  function tick() {
    const sim = st.sim;
    if (st.auto) E.operator(sim, st.auto); else if (st.mode === 'keys') E.setDir(sim, st.dir);
    E.step(sim);
    if (st.rec) {
      if (!sim.started && ++st.wait > 45 / E.DT) finish(true);
      else if (sim.done) finish(false);
    } else if (sim.done && !st.recorded && ++st.idle > 60) fresh();
  }
  function loop(now) {
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
    if (visible || st.rec) {
      acc += dt * SPEED.k; let n = 0;
      while (acc >= E.DT && n < 4000) { tick(); acc -= E.DT; n++; if (!st.rec && st.sim.done && n > 1) break; }
      draw();
    } else acc = 0;
    requestAnimationFrame(loop);
  }
  function draw() {
    if (!st.sim) return;
    TD.scene($('#tCv'), st.sim, { rec: !!st.rec, trail: !!st.rec || st.sim.done });
    TD.pult($('#tPult'), st.sim, { drag: st.drag, dir: st.dir });
    const s = st.sim, R = !!st.rec;
    let msg;
    if (R && !s.started) msg = `Запись готова: начни двигать ${st.mode === 'keys' ? 'клавишами' : 'пульт'}. Захват сожмётся сам, если подержать его у чашки 0,3 с, и разожмётся на полке.`;
    else if (R) msg = s.grip === 'hold' ? 'Чашка в захвате. Подними её выше полки, перенеси и опусти в рамку на полке.' : s.grip === 'open' ? 'Подведи захват к чашке и остановись: пальцы должны оказаться по бокам от неё.' : 'Захват сжимается…';
    else if (s.done && st.recorded) msg = st.last && st.last.ok ? 'Запись закончена, чашка на полке. Сравни её с эталоном ниже. Чтобы потренироваться ещё, возьмись за пульт.' : 'Запись остановлена. Чтобы потренироваться, возьмись за пульт.';
    else if (s.done) msg = 'Чашка на полке. Это тренировка: чтобы записать демонстрацию, нажми «Записать демонстрацию».';
    else msg = 'Можно потренироваться: веди руку с пульта. Запись начнётся по кнопке «Записать демонстрацию».';
    setOut($('#tOut'), msg);
  }
  const statLine = (m) => (m.n === 0 ? 'Запись остановлена до первого движения' : `<b>${fmt(m.T, 1)} с</b> · лишний путь <b>${fmt(m.extra * 100, 0)}%</b> · паузы <b>${fmt(m.pauses, 1)} с</b> · дрожь действий <b>${fmt(m.jitter, 1)} мм</b> · касаний <b>${m.bumps}</b>`);
  const headLine = (m) => `${MODE_NAME[m.mode]}, ${m.delay} мс${m.mode === 'air' ? `, дрожь ${m.noise} мм` : ''}`;
  function panes() {
    const P = pal();
    TD.pane($('#tCvA'), st.ref && st.ref.rec, st.ref, P); TD.pane($('#tCvB'), st.last && st.last.rec, st.last, P);
    $('#tSubA').textContent = st.ref ? headLine(st.ref) : 'первая удачная запись';
    $('#tSubB').textContent = st.last ? headLine(st.last) + (st.last.ok ? '' : ' — чашка не на полке') : 'запиши демонстрацию';
    setOut($('#tStatA'), st.ref ? statLine(st.ref) : 'Пока пусто');
    setOut($('#tStatB'), st.last ? statLine(st.last) : 'Пока пусто');
    $('#tStatB').className = 'pane-stat' + (st.last ? (st.last.ok ? '' : ' bad') : '');
  }
  const state = () => ({ mode: st.mode, delay: st.delay, noise: st.noise, recording: !!st.rec, ref: st.ref, last: st.last });
  const api = {
    reset() { st.ref = null; st.last = null; if (st.rec) finish(true); setMode('leader'); setDelay(0); setNoise(5); panes(); },
    state, record, setMode, setDelay, setNoise,
    /** Для проверок: модель оператора ведёт пульт в текущей записи (вместо мыши). */
    autoHand() { if (st.rec) st.auto = { press: 0, wait: 0 }; return !!st.rec; },
    stop() { if (st.rec) finish(true); },
  };
  const pct = (a, b) => fmt((a / b - 1) * 100, 0);
  const missions = [
    { short: 'Ведущая рука', title: 'Запиши первую демонстрацию', text: 'Ты — оператор. Перенеси чашку со стола на полку ведущей рукой: тяни рукоять на пульте под сценой и смотри на Аду. Захват сожмётся сам, если подержать его у чашки, и разожмётся на полке. Эта запись станет эталоном для следующих миссий.',
      onEnter: (X) => { X.setMode('leader'); X.setDelay(0); },
      action: { label: 'Записать демонстрацию', run: (X) => X.record() },
      criteria: [{ label: 'Чашка на полке', test: (r) => r.ok }, { label: 'Запись не дольше 40 с', test: (r) => r.ok && r.T <= 40 }],
      summary: (r) => `${headLine(r)}: ${r.ok ? fmt(r.T, 1) + ' с' : 'не закончена'}`,
      hint: 'Двигай рукоять плавно. У чашки остановись так, чтобы пальцы захвата встали по бокам от неё, и подожди полсекунды. Поднимай чашку выше полки, прежде чем нести её вправо.',
      fail: (r) => (r.aborted ? 'Запись не закончена. Нажми кнопку ещё раз и доведи чашку до рамки на полке.' : 'Чашка не на полке. Попробуй ещё раз: подними её выше края полки и опусти в рамку.'),
      explain: (r) => `Демонстрация записана: ${fmt(r.T, 1)} с, лишний путь ${fmt(r.extra * 100, 0)}% от кратчайшего, паузы ${fmt(r.pauses, 1)} с, дрожь записанных действий ${fmt(r.jitter, 1)} мм. В запись попадают 50 раз в секунду углы руки Ады и команда пульта — так ALOHA пишет позы ведущей руки. Это эталон: он слева в сравнении под сценой.` },
    { short: 'Задержка', title: 'Добавь задержку 300 мс', text: 'Между пультом и рукой теперь 300 мс: так бывает, когда команды и видео идут по сети. Запиши ту же задачу ещё раз и сравни с эталоном.',
      controls: ['delay'], onEnter: (X) => { X.setMode('leader'); X.setDelay(300); },
      bet: { q: 'что станет с демонстрацией?', options: ['Почти ничего: Ада повторит те же движения на 0,3 с позже', 'Станет заметно дольше, появятся паузы: придётся ждать, пока рука догонит пульт', 'Станет аккуратнее: с задержкой двигаешь осторожнее, и лишнего пути меньше'], answer: (r) => { const ref = st.ref; return ref && (r.T > ref.T * 1.25 || r.pauses > ref.pauses + 0.5) ? 1 : ref && r.extra < ref.extra ? 2 : 0; } },
      action: { label: 'Записать демонстрацию', run: (X) => X.record() },
      criteria: [{ label: 'Чашка на полке', test: (r) => r.ok }, { label: 'Задержка не меньше 250 мс', test: (r) => r.delay >= 250 }],
      summary: (r) => `${headLine(r)}: ${r.ok ? fmt(r.T, 1) + ' с, паузы ' + fmt(r.pauses, 1) + ' с' : 'не закончена'}`,
      hint: 'Ползунок задержки — под пультом. Двигай рукоять и смотри, где Ада, а не где пульт.',
      fail: (r) => (r.delay < 250 ? 'Задержка меньше 250 мс: верни ползунок на 300 мс.' : 'Чашка не на полке. Попробуй ещё раз: с задержкой легче двигаться короткими шагами.'),
      explain: (r) => { const ref = st.ref; return `С задержкой ${r.delay} мс запись длилась ${fmt(r.T, 1)} с против ${fmt(ref.T, 1)} с у эталона — на ${pct(r.T, ref.T)}% дольше, паузы ${fmt(r.pauses, 1)} с против ${fmt(ref.pauses, 1)} с. Оператор видит руку с опозданием и двигается по шагам: сдвинул пульт — ждёт, пока рука догонит, — поправляет. Эти паузы и поправки попадают в данные, и политика выучит их вместе с задачей. В статье ALOHA шесть операторов делали две задачи при частоте телеоперации 50 и 5 Гц: при 5 Гц время выросло на 62%.`; } },
    { short: 'Рука в воздухе', title: 'Веди руку без ведущей руки', text: 'Теперь пульт — «рука в воздухе», как в VR-шлеме: шлем следит за кистью оператора, а рука Ады идёт за кистью через обратную кинематику. Слежение дрожит на ±5 мм, у ведущей руки дрожи нет. Задержки нет.',
      controls: ['noise'], onEnter: (X) => { X.setMode('air'); X.setDelay(0); X.setNoise(5); },
      bet: { q: 'дрожь слежения ±5 мм. Что будет с записанными действиями?', options: ['Ничего: рука Ады инерционна и сгладит дрожь', 'Дрожь попадёт в записанные действия, хотя рука Ады её отчасти сглаживает', 'Действия станут точнее: не нужна ведущая рука с её люфтами'], answer: (r) => { const ref = st.ref; return ref && r.jitter > ref.jitter * 2 ? 1 : 0; } },
      action: { label: 'Записать демонстрацию', run: (X) => X.record() },
      criteria: [{ label: 'Чашка на полке', test: (r) => r.ok }, { label: 'Интерфейс — рука в воздухе, дрожь не меньше 4 мм', test: (r) => r.mode === 'air' && r.noise >= 4 }],
      summary: (r) => `${headLine(r)}: ${r.ok ? fmt(r.T, 1) + ' с, дрожь ' + fmt(r.jitter, 1) + ' мм' : 'не закончена'}`,
      hint: 'Колечко на пульте — где шлем «видит» кисть: оно дрожит вокруг кружка. Захвату нужно 0,3 с постоять у чашки, поэтому держи кисть спокойно.',
      fail: (r) => (r.mode !== 'air' || r.noise < 4 ? 'Нужна рука в воздухе с дрожью не меньше 4 мм.' : 'Чашка не на полке. Попробуй ещё раз.'),
      explain: (r) => { const ref = st.ref; return `Дрожь записанных действий — ${fmt(r.jitter, 1)} мм против ${fmt(ref.jitter, 1)} мм у ведущей руки. Рука Ады отстаёт от команды и часть дрожи сглаживает, но в данные пишется команда — та, что дрожит. В исследовании GELLO 12 новичков решали 5 задач на двух руках UR5 тремя способами: средний успех 0,92 с ведущей рукой GELLO, 0,72 с VR-шлемом и 0,63 с 3D-мышью. Open-TeleVision сглаживает позы руки фильтром, прежде чем считать обратную кинематику.`; } },
    { short: 'Клавиши', title: 'Запиши демонстрацию клавишами', text: 'Последний интерфейс — клавиши, как у 3D-мыши или джойстика: команда задаёт не позу, а скорость захвата, 15 см/с по выбранной оси. Задержки нет.',
      onEnter: (X) => { X.setMode('keys'); X.setDelay(0); },
      bet: { q: 'сколько займёт запись по сравнению с эталоном?', options: ['Столько же: путь тот же', 'Дольше: скорость постоянная, по осям по очереди, у цели — короткие нажатия', 'Короче: клавиши точнее руки'], answer: (r) => { const ref = st.ref; return ref && r.T > ref.T * 1.2 ? 1 : ref && r.T < ref.T * 0.9 ? 2 : 0; } },
      action: { label: 'Записать демонстрацию', run: (X) => X.record() },
      criteria: [{ label: 'Чашка на полке', test: (r) => r.ok }, { label: 'Интерфейс — клавиши', test: (r) => r.mode === 'keys' }],
      summary: (r) => `${headLine(r)}: ${r.ok ? fmt(r.T, 1) + ' с' : 'не закончена'}`,
      hint: 'Стрелки на клавиатуре работают, когда сцена на экране. На телефоне — кнопки со стрелками под пультом: держи кнопку нажатой.',
      fail: () => 'Чашка не на полке. Попробуй ещё раз: сначала подними захват над чашкой, потом опусти.',
      explain: (r) => { const ref = st.ref; return `Клавишами — ${fmt(r.T, 1)} с против ${fmt(ref.T, 1)} с у эталона, лишний путь ${fmt(r.extra * 100, 0)}% против ${fmt(ref.extra * 100, 0)}%: путь идёт ступеньками по осям, а у чашки — короткими нажатиями. В исследовании GELLO у 3D-мыши было 9 таймаутов на 5 задачах, у VR — 5, у ведущей руки — 1. UMI сравнивали как раз с телеоперацией 3D-мышью: ручной захват за 15 минут собрал больше чем втрое больше демонстраций.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Все ручки открыты. Найди интерфейс и задержку, при которых запись идёт хотя бы вдвое дольше эталона, а паузы занимают больше секунды. Посмотри, как выглядит такая запись на графике скорости.', final: true },
  ];
  function bindPult() {
    const cv = $('#tPult'); let off = null;
    const dims = () => TD.pultDims(cv);
    // HeroKit.drag работает в логических координатах; раскладка пульта зависит от ширины, поэтому перевод — на каждое событие
    const pt = (e) => { const r = cv.getBoundingClientRect(), [W2, H2] = dims(); return { x: (e.clientX - r.left) / r.width * W2, y: (e.clientY - r.top) / r.height * H2 }; };
    const handPx = () => { const L = TD.PU[(cv.parentElement.getBoundingClientRect().width || 600) < 520 ? 'narrow' : 'wide'], hd = st.mode === 'leader' ? Arm.fk(st.sim.qLead) : st.sim.hand; return { x: L.bx + hd.x * L.s, y: L.by - hd.y * L.s + (st.mode === 'leader' ? 22 : 0) }; };
    cv.addEventListener('touchstart', (e) => { if (st.mode !== 'keys' && !st.auto) e.preventDefault(); }, { passive: false });
    // перетаскивание относительное: рукоять сдвигается на столько, на сколько сдвинулся указатель (пальцем — на 0,7 от этого, точнее)
    cv.addEventListener('pointerdown', (e) => {
      if (st.mode === 'keys' || st.auto) return;
      live(); const p = pt(e), hp = handPx(); off = { p0: p, h0: hp, g: e.pointerType === 'touch' ? 0.7 : 1 }; st.drag = true; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!st.drag || !off) return;
      const p = pt(e), q = TD.pultInv(cv, { x: off.h0.x + (p.x - off.p0.x) * off.g, y: off.h0.y + (p.y - off.p0.y) * off.g - (st.mode === 'leader' ? 22 : 0) });
      E.setHand(st.sim, q);
    });
    const up = () => { st.drag = false; off = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // клавиши: стрелки на клавиатуре и кнопки под пультом
    const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const upd = () => { let x = 0, y = 0; for (const [kk, on] of Object.entries(st.keys)) if (on) { x += DIRS[kk][0]; y += DIRS[kk][1]; } st.dir = { x: Math.sign(x), y: Math.sign(y) }; };
    const inView = () => { const r = $('#tCv').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    window.addEventListener('keydown', (e) => { if (st.mode !== 'keys' || !DIRS[e.key] || !inView() || e.target.closest('input, textarea')) return; e.preventDefault(); live(); st.keys[e.key] = true; upd(); });
    window.addEventListener('keyup', (e) => { if (!DIRS[e.key]) return; st.keys[e.key] = false; upd(); });
    $$('#tKeys button').forEach((b) => {
      const kk = b.dataset.k, on = (v) => (e) => { e.preventDefault(); if (v) live(); st.keys[kk] = v; upd(); };
      b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false));
    });
  }
  function init() {
    fresh(); bindPult();
    segBind('#tMode', setMode);
    $('#tDelay').addEventListener('input', (e) => setDelay(e.target.value));
    $('#tNoise').addEventListener('input', (e) => setNoise(e.target.value));
    $('#tStop').addEventListener('click', () => finish(true));
    $('#tRec').addEventListener('click', () => { if (!st.rec) { record(); $('#tCv').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });   // запись в свободном режиме
    syncRange($('#tDelay'), '0 мс'); syncRange($('#tNoise'), '5 мм');
    legend('#tLegend', [['рука Ады', HeroKit.css('--classic')], ['пульт оператора и команды', HeroKit.css('--e2e')], ['пунктир — где взять чашку и куда поставить', HeroKit.css('--e2e'), 'dash'], ['след захвата в записи', HeroKit.css('--classic')]]);
    const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; }, { rootMargin: '200px 0px' }); io.observe($('#tele .lab'));
    ctl = mountMissions('#tMis', missions, api, { controls: { delay: '#wrapTDelay', noise: '#wrapTNoise', mode: '#wrapTMode', rec: '#tRec' }, scene: '#tCv' });
    panes(); draw(); redrawOn(() => { draw(); panes(); });
    requestAnimationFrame(loop);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   Интерактив: цена годной демонстрации и срок сбора 10 000 демонстраций.
   Цены и темпы — из статей (см. «Под капотом»), ставка и 8 часов в день — иллюстрация.
   ===================================================================== */
const LabCost = (() => {
  const E = L42, GOAL = 10000;
  const st = { budget: 100000, people: 10, wage: 25, shown: false };
  let ctl = null;
  const calc = () => E.costCalc({ budget: st.budget, people: st.people, wage: st.wage, goal: GOAL });
  // дробное число дней — «3,7 дня»; целое — по правилам числа
  const days = (d) => { if (!isFinite(d)) return 'сбор не начнётся'; if (d < 10) return `${fmt(d, 1)} дня`; const n = Math.round(d); return `${n} ${plural(n, 'день', 'дня', 'дней')}`; };
  function render() {
    const rows = calc(), box = $('#cRows');
    if (!st.shown) { box.innerHTML = '<div class="calc-empty">Сделай ставку и нажми «Посчитать» — здесь появятся сроки и цена демонстрации по трём способам.</div>'; setOut($('#cOut'), ''); return; }
    const fin = rows.filter((r) => isFinite(r.days)), dmax = Math.max(1, ...fin.map((r) => r.days)), cmax = Math.max(...rows.map((r) => r.perDemo));
    box.innerHTML = '';
    box.append(h('div', { class: 'calc-h' }, h('span', null, 'Способ'), h('span', null, `Дней до ${GOAL.toLocaleString('ru-RU')} годных демонстраций`), h('span', null, 'Цена годной демонстрации')));
    rows.forEach((r) => {
      const dW = isFinite(r.days) ? Math.max(2, r.days / dmax * 100) : 0, cW = r.perDemo / cmax * 100;
      box.append(h('div', { class: 'calc-row' + (r.robot ? ' robot' : ' free'), 'data-m': r.id },
        h('div', { class: 'calc-name' }, h('b', null, r.name), h('span', null, `${r.note}; ${money(r.price)} за комплект`), h('span', null, `комплектов: ${r.kits}, работают ${r.kits} из ${st.people} человек`)),
        h('div', { class: 'calc-bar' }, h('i', { style: `width:${dW}%` }), h('em', null, isFinite(r.days) ? `${days(r.days)} до цели` : days(r.days))),
        h('div', { class: 'calc-cost' }, h('div', { class: 'calc-bar cost' }, h('i', { class: 'eq', style: `width:${cW * r.equipShare}%` }), h('i', { class: 'pp', style: `width:${cW * (1 - r.equipShare)}%` }), h('em', null, `$${fmt(r.perDemo, 2)}`)), h('small', null, `оборудование ${fmt(r.equipShare * 100, 0)}%, люди ${fmt(100 - r.equipShare * 100, 0)}%`))));
    });
    const best = rows.slice().sort((a, b) => a.days - b.days)[0];
    setOut($('#cOut'), `Быстрее всех — <b>${best.name}</b>: ${fmt(best.perDay, 0)} годных демонстраций в день. Бюджет на оборудование ${money(st.budget)}, ${st.people} ${plural(st.people, 'человек', 'человека', 'человек')}, ставка ${money(st.wage)} в час.`);
  }
  function setB(v) { st.budget = +v; $('#cBudget').value = st.budget; syncRange($('#cBudget'), money(st.budget)); render(); if (ctl) ctl.update(); }
  function setP(v) { st.people = +v; $('#cPeople').value = st.people; syncRange($('#cPeople'), String(st.people)); render(); if (ctl) ctl.update(); }
  function setW(v) { st.wage = +v; $('#cWage').value = st.wage; syncRange($('#cWage'), money(st.wage) + '/ч'); render(); if (ctl) ctl.update(); }
  const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
  const state = () => Object.assign({ shown: st.shown, budget: st.budget, people: st.people, wage: st.wage }, { m: byId(calc()) });
  const api = {
    reset() { st.shown = false; setB(100000); setP(10); setW(25); },
    state, setB, setP, setW,
    async compute() { st.shown = true; render(); await new Promise((r) => setTimeout(r, 150 / SPEED.k)); return state(); },
  };
  const missions = [
    { short: 'Ставка', title: 'Кто раньше наберёт 10 000 демонстраций', text: 'На оборудование — $100 000, в команде 10 человек, каждый работает 8 часов в день. Цены комплектов и темпы записи взяты из статей, ставка оператора $25 в час — иллюстрация.',
      onEnter: (X) => { X.setB(100000); X.setP(10); X.setW(25); },
      bet: { q: 'какой способ раньше наберёт 10 000 годных демонстраций?', options: ['ALOHA: робот в комплекте, каждая запись сразу сделана на роботе', 'UMI: комплект дешёвый, работают все десять человек', 'GELLO: ведущая рука стоит меньше $300'], answer: (r) => ({ aloha: 0, umi: 1, gello: 2 })[Object.values(r.m).sort((a, b) => a.days - b.days)[0].id] },
      action: { label: 'Посчитать', run: (X) => X.compute() },
      criteria: [{ label: 'Посчитано: $100 000 и 10 человек', test: (r) => r.budget === 100000 && r.people === 10 }],
      explain: (r) => `На $100 000 выходит ${r.m.aloha.kits} комплектов ALOHA и ${r.m.gello.kits} — GELLO с рукой UR5: дешёвая ведущая рука не спасает, если к ней нужен робот за $30 000. Остальным людям просто не на чем работать. Комплектов UMI хватает на всех десятерых, и каждый записывает около 117 демонстраций в час против 67 у ALOHA. Итог: UMI — ${days(r.m.umi.days)}, ALOHA — ${days(r.m.aloha.days)}, GELLO — ${days(r.m.gello.days)}.` },
    { short: 'Бюджет', title: 'Дай ALOHA денег на всех', text: 'Подними бюджет так, чтобы комплект ALOHA был у каждого из десяти человек. Догонит ли ALOHA ручной захват?',
      controls: ['budget'],
      criteria: [{ label: 'У каждого из десяти человек свой комплект ALOHA', test: (r, s) => s.shown && s.m.aloha.kits >= s.people }, { label: 'Сравни срок ALOHA и UMI', test: (r, s) => s.shown && s.m.aloha.kits >= s.people && s.m.aloha.days > s.m.umi.days }],
      hint: 'Ползунок «Бюджет» — под таблицей. Комплект ALOHA стоит $20 000.',
      explain: (r) => `Даже с комплектом на каждого ALOHA собирает ${fmt(r.m.aloha.perDay, 0)} демонстраций в день против ${fmt(r.m.umi.perDay, 0)} у UMI: один человек за час записывает на ALOHA около 67 демонстраций, а с ручным захватом — около 105 годных из 117. Деньги покупают роботов, но не ускоряют самого оператора. Темпы взяты из разных статей и разных задач, поэтому сравнение грубое; в самой статье UMI на одной задаче ручной захват собрал за 15 минут больше чем втрое больше демонстраций, чем телеоперация 3D-мышью.` },
    { short: 'Цена', title: 'Что дороже: робот или человек', text: 'Цена демонстрации складывается из часа работы комплекта и часа работы человека. Комплект служит 2000 часов — год по 8 часов в день, это иллюстрация. Найди ставку оператора, при которой у ALOHA оборудование и люди стоят поровну.',
      controls: ['wage'], onEnter: (X) => X.setW(40),
      criteria: [{ label: 'У ALOHA доля оборудования от 45 до 55%', test: (r, s) => s.shown && s.m.aloha.equipShare >= 0.45 && s.m.aloha.equipShare <= 0.55 }],
      hint: 'Ползунок «Ставка оператора» — под таблицей. Час комплекта ALOHA стоит $20 000 / 2000 ч.',
      explain: (r) => `При ставке ${money(r.wage)} в час люди и робот стоят поровну: час комплекта ALOHA — $10. Дороже — и главной статьёй становится время людей, а UMI с комплектом за $371 почти целиком состоит из него: оборудование там около ${fmt(r.m.umi.equipShare * 100, 0)}%. Поэтому способы сбора соревнуются не ценой устройства, а тем, сколько годных демонстраций человек записывает за час и сколько людей могут работать одновременно.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Все ползунки открыты. Найди бюджет и число людей, при которых ALOHA собирает 10 000 демонстраций быстрее, чем UMI с тремя людьми.', final: true },
  ];
  function init() {
    $('#cBudget').addEventListener('input', (e) => setB(e.target.value));
    $('#cPeople').addEventListener('input', (e) => setP(e.target.value));
    $('#cWage').addEventListener('input', (e) => setW(e.target.value));
    syncRange($('#cBudget'), money(st.budget)); syncRange($('#cPeople'), String(st.people)); syncRange($('#cWage'), money(st.wage) + '/ч');
    ctl = mountMissions('#cMis', missions, api, { controls: { budget: '#wrapCBudget', people: '#wrapCPeople', wage: '#wrapCWage' }, scene: '#cRows', onStep: (i) => { if (i > 0) { st.shown = true; render(); } } });
    render();
    return ctl;
  }
  return { init, api, st };
})();

/* ---------- Интерактив: где робот во время записи ---------- */
function initSort() {
  return Cards.sort('#devSort', {
    targets: [{ id: 'look', label: 'Робот нужен, оператор смотрит на него сам' }, { id: 'cam', label: 'Робот нужен, оператор смотрит через его камеры' }, { id: 'none', label: 'Робот при записи не нужен' }],
    items: [
      { id: 'aloha', label: 'ALOHA: две ведущие руки', target: 'look', why: 'Ведомые руки стоят перед оператором, и он смотрит на них сам. Камеры только пишут данные.' },
      { id: 'mobile', label: 'Mobile ALOHA: оператор привязан к базе', target: 'look', why: 'Оператор идёт вместе с роботом и толкает базу; авторы прямо пишут, что очки с видео не нужны.' },
      { id: 'tv', label: 'Open-TeleVision: VR-шлем', target: 'cam', why: 'В шлем идёт стереовидео с камер на голове робота, голова робота поворачивается вслед за головой оператора.' },
      { id: 'homie', label: 'HOMIE: кокпит с педалями', target: 'cam', why: 'Видео с камеры робота идёт по Wi-Fi на экран в кокпите.' },
      { id: 'dexcap', label: 'DexCap: перчатки и камеры на груди', target: 'none', why: 'Человек работает своими руками, робот нужен потом — для обучения политики и для её коррекции.' },
      { id: 'umi', label: 'UMI: ручной захват с GoPro', target: 'none', why: 'Записи делают в квартирах и кафе без робота, потом тот же захват ставят на робота.' },
      { id: 'airexo', label: 'AirExo: экзоскелет, сбор «в поле»', target: 'none', why: 'В этом режиме человек надевает экзоскелет и делает задачу сам; камеру ставят туда же, где она стоит на роботе.' },
    ],
    after: 'Чем дальше вправо, тем дешевле и быстрее запись, но тем больше разница между тем, что видел и делал человек, и тем, что увидит и сможет сделать робот: её закрывают тем же захватом, ретаргетингом, фильтрами и дообучением на записях с робота.',
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
    { q: 'Ведущая рука GELLO задаёт скорость захвата, как джойстик?', o: ['Да, а скорость потом интегрируют', 'Нет: это копия руки робота, и углы её суставов идут на робота один в один', 'Нет: она задаёт позу кисти, а углы считает обратная кинематика'], a: 1, e: 'GELLO — копия робота в масштабе 1 : 2 из печатных деталей и сервоприводов, которые служат датчиками угла. Обратная кинематика не нужна: в ALOHA прямо пишут, что готовая обратная кинематика в их постановке часто отказывала.' },
    { q: 'Задержка 300 мс между пультом и роботом просто сдвигает демонстрацию на 0,3 с?', o: ['Да: робот повторит те же движения позже', 'Нет: оператор видит результат с опозданием, двигается шагами и ждёт, и запись становится дольше и с паузами', 'Нет: робот начинает дрожать'], a: 1, e: 'Оператор ведёт руку по тому, что видит. С задержкой он сдвигает пульт, ждёт и поправляет. В ALOHA при частоте телеоперации 5 Гц вместо 50 Гц те же задачи заняли на 62% больше времени.' },
    { q: 'Рука робота инерционна. Значит, дрожь слежения VR-шлема в данные не попадёт?', o: ['Не попадёт: робот её сгладит', 'Попадёт: в данные пишется команда оператора, а она дрожит', 'Попадёт только в картинки камер'], a: 1, e: 'Действием в демонстрации служит команда — в ALOHA это позы ведущей руки. Робот может сгладить движение, но политика учится повторять записанные команды вместе с их дрожью. Open-TeleVision сглаживает позы рук фильтром до обратной кинематики.' },
    { q: 'Зачем Open-TeleVision стереокамера на поворотной шее робота?', o: ['Только для красоты видео в шлеме', 'Оператор сам выбирает, куда смотреть, и видит глубину: со стерео задачи быстрее и надёжнее', 'Чтобы обходиться без обратной кинематики'], a: 1, e: 'У четырёх участников со стерео все четыре задачи удавались в 100% случаев, с одной камерой выгрузка — в 50%; время на ней — 67 против 97 с. Политика без стерео брала банку в 46% случаев против 92%.' },
    { q: 'DexCap записывает демонстрации на роботе с многопалой кистью?', o: ['Да, перчатки управляют кистью LEAP', 'Нет: человек работает своими руками, а потом кончики пальцев переносят на кисть робота обратной кинематикой', 'Нет: он записывает только видео'], a: 1, e: 'Перчатки с магнитными датчиками и камеры SLAM пишут пальцы и запястья 60 раз в секунду, камера на груди — облако точек. Сбор втрое быстрее телеоперации, а мизинец при переносе на четырёхпалую кисть просто отбрасывают.' },
    { q: 'В HOMIE ноги робота повторяют ноги оператора, как руки?', o: ['Да, экзоскелет надет и на ноги', 'Нет: педали задают скорость, поворот и высоту, а ногами управляет политика, обученная с подкреплением в симуляции', 'Нет: робот стоит на месте'], a: 1, e: 'Руки экзоскелета повторяют руки робота сустав в сустав, перчатки — пальцы, а педалями оператор отдаёт команды политике ходьбы. Весь кокпит стоит около $500, задачи выполняются почти вдвое быстрее, чем через VR.' },
    { q: 'Данные UMI годятся только для робота, на котором их потом проверяли?', o: ['Да, траектории привязаны к одному роботу', 'Нет: тот же захват с той же камерой ставят на разные руки, а траектории записаны относительно захвата', 'Нет: UMI пишет углы суставов человека'], a: 1, e: 'Тот же чекпойнт политики прошёл 18 из 20 попыток на Franka; оба провала — выход за пределы суставов. Поэтому записи фильтруют по кинематике конкретного робота: при сборе его досягаемость не известна.' },
    { q: 'Дешёвое устройство сбора — значит, дешёвые данные?', o: ['Да, цена данных — это цена устройства', 'Не обязательно: цену часа определяют время людей, нужен ли робот и сколько записей годится', 'Нет: данные всегда стоят одинаково'], a: 1, e: 'Ведущая рука GELLO стоит меньше $300, но к ней нужен робот. Ручной захват UMI дешёв и обходится без робота, зато часть записей отсеивается: у Lin et al. годными оказались около 90%.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('tele', () => { mis.tele = LabTele.init(); }); safe('cost', () => { mis.cost = LabCost.init(); });
    safe('sort', () => { mis.sort = initSort(); }); safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'cMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l42 = { mis, SPEED, LabTele, LabCost, L42, Dev }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
