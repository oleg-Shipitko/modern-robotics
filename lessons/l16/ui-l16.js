/* =====================================================================
   ui-l16.js — урок 1.6 «Трансформер». Интерактивы:
     Tok  — кадр кухни режется на патчи, ставка и задача про n²;
     Att  — лаборатория «Найди чашку»: миссии на живой сцене
            (shared/missions.js): запрос, ответ между предметами, √d_k,
            маска π0, две головы рядом;
     Ord  — «Сломай порядок»: слова-токены, счётчик отказов, позиции
            и тепловая карта их сходства;
     Cost — калькулятор токенов и FLOPs с пресетами RT-1, ACT, Octo, π0;
     Pi   — вывод π0 по блокам, KV-кэш и лента тиков 50 Гц;
     сортировка моделей (shared/cards.js) и квиз.
   Числа считает движок l16/engine.js (T16), он же проверяется в Node.
   ===================================================================== */
'use strict';
(function () {
  const E = window.T16, ITEMS = E.ITEMS;
  const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED.k));
  const css = (n) => HeroKit.css(n);
  const pal = () => ({ bg: css('--surface-2'), surf: css('--surface'), grid: css('--line'), line2: css('--line-2'), ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), e2e: css('--e2e'), h2: css('--h2'), good: css('--good'), bad: css('--critical') });
  const fmt = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }).replace('-', '−');
  const fmtF = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }).replace('-', '−');
  const fmt2 = (v) => fmtF(v, 2);
  const int = (v) => Math.round(v).toLocaleString('ru-RU');
  function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
  function legend(sel, items) {
    const box = $(sel), sig = JSON.stringify(items); if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = '';
    items.forEach(([t, col, kind]) => {
      const mark = kind === 'dot' ? h('i', { style: `--c:${col};width:10px;height:10px;border-radius:50%` }) : kind === 'box' ? h('i', { style: `--c:${col};width:14px;height:9px;border-radius:3px` }) : kind === 'ring' ? h('i', { style: `width:12px;height:12px;border-radius:50%;background:none;border:3px solid ${col}` }) : h('i', { class: kind === 'dash' ? 'dash' : null, style: `--c:${col}` });
      box.append(h('span', null, mark, t));
    });
  }
  const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
  /** Окно в переходном состоянии (например, ширина 1 px при снимке страницы) — не перерисовываем: после него придёт resize. */
  const live = () => window.innerWidth > 200;
  /** Подпись, которая не вылезает за края канваса шириной W. */
  function labelIn(c, k, text, x, y, o, W) {
    o = o || {}; HeroKit.font(c, k, o.px || 12, o.weight, o.mono);
    const w = c.measureText(text).width, al = o.align || 'center', m = 3 * k;
    let left = al === 'left' ? x : al === 'right' ? x - w : x - w / 2;
    left = Math.max(m, Math.min(W - m - w, left));
    HeroKit.label(c, k, text, left, y, Object.assign({}, o, { align: 'left' }));
  }
  const rgbOf = (c, f) => `rgb(${Math.round(Math.min(1, c[0] * (f || 1)) * 255)},${Math.round(Math.min(1, c[1] * (f || 1)) * 255)},${Math.round(Math.min(1, c[2] * (f || 1)) * 255)})`;

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

  /* ---------- Задача вне лаборатории: критерии вживую, ставка, подсказка, разбор ---------- */
  function mountTask(root, spec) {
    if (typeof root === 'string') root = $(root);
    root.classList.add('m-live'); root.innerHTML = '';
    // spec.head — шапка вверху карточки: условие и ставка стоят над органами управления, проверка и итог — под ними
    const head = spec.head ? $(spec.head) : root; if (head !== root) head.innerHTML = '';
    const T = { bet: undefined, betOk: undefined, done: false, crit: [], betBtns: [], root, head };
    head.append(h('div', { class: 'g-kicker' }, 'Задача'), h('h4', null, spec.title), h('p', { class: 'g-text', html: spec.text }));
    if (spec.bet) {
      const row = h('div', { class: 'opts' });
      spec.bet.options.forEach((o, k) => {
        const b = h('button', { type: 'button', class: 'btn sm', 'aria-pressed': 'false' }, o);
        b.addEventListener('click', () => { if (T.betOk !== undefined) return; T.bet = k; T.betBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === k))); if (spec.onBet) spec.onBet(k); });
        T.betBtns.push(b); row.append(b);
      });
      head.append(h('div', { class: 'g-pred m-bet' }, h('div', { class: 'q' }, 'Ставка: ' + spec.bet.q), row));
    }
    const ul = h('ul', { class: 'm-crit' });
    spec.criteria.forEach((c) => { const li = h('li', { class: 'wait' }, h('i', { 'aria-hidden': 'true' }), h('span', { html: c.label })); ul.append(li); T.crit.push(li); });
    root.append(ul);
    if (spec.hint) { const d = h('details', { class: 'm-hint' }); d.innerHTML = `<summary>Подсказка</summary><div>${spec.hint}</div>`; root.append(d); }
    const out = h('div', { class: 'g-out', hidden: true }); root.append(out);
    T.update = (s) => {
      if (T.done) return true;
      let all = true;
      spec.criteria.forEach((c, k) => { let ok = false; try { ok = !!c.test(s); } catch (e) { ok = false; } all = all && ok; T.crit[k].className = ok ? 'ok' : 'no'; });
      if (all) {
        T.done = true; let html = spec.explain ? spec.explain(s) : '';
        if (T.betOk !== undefined) html = (T.betOk ? '<b>Ставка сыграла.</b> ' : '<b>Ставка не сыграла.</b> ') + html;
        out.innerHTML = html; out.hidden = false; out.className = 'g-out m-win'; root.classList.remove('m-live');
        if (window.MRStats) window.MRStats.ev(`task:${root.id}:done`);
        if (spec.onDone) spec.onDone(s);
      }
      return all;
    };
    T.resolveBet = () => {
      if (!spec.bet || T.bet === undefined || T.betOk !== undefined) return;
      const right = spec.bet.answer; T.betOk = T.bet === right;
      T.betBtns.forEach((b, k) => { b.classList.toggle('bet-right', k === right); b.classList.toggle('bet-wrong', k === T.bet && k !== right); });
    };
    return T;
  }
  function gate(el, locked, title) { el.disabled = locked; if (locked) el.title = title; else el.removeAttribute('title'); }

  /* ---------- Стол сверху: дерево, предметы (цвета физические, не от темы) ---------- */
  const Scene = (() => {
    const WOOD = [0.86, 0.77, 0.63], WHITE = [1, 1, 1], BLACK = [0, 0, 0];
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const rgb = (c, f) => rgbOf(c, f);
    function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } }
    function rrect(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function shadow(c, x, y, r) { c.fillStyle = 'rgba(45,28,10,0.22)'; c.beginPath(); c.ellipse(x + r * 0.14, y + r * 0.2, r * 1.02, r * 0.98, 0, 0, Math.PI * 2); c.fill(); }
    function table(c, S, f) {
      c.fillStyle = rgb(WOOD, f); c.fillRect(0, 0, S, S);
      for (let i = 0; i < 6; i++) { const y0 = i * S / 6; c.fillStyle = rgb(mix(WOOD, i % 2 ? BLACK : WHITE, 0.025), f); c.fillRect(0, y0, S, S / 6); c.fillStyle = 'rgba(60,35,10,0.10)'; c.fillRect(0, y0, S, 1); }
      c.strokeStyle = 'rgba(70,40,15,0.06)'; c.lineWidth = 1;
      for (let i = 0; i < 22; i++) { const y = ((i * 37) % 100) / 100 * S; c.beginPath(); for (let x = 0; x <= S; x += S / 12) c.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.2); c.stroke(); }
      c.fillStyle = 'rgba(60,35,10,0.18)'; c.fillRect(0, S * 0.962, S, S * 0.038);
    }
    function item(c, it, S, f) {
      const x = it.x * S, y = it.y * S, r = it.r * S, col = it.col;
      switch (it.kind) {
        case 'cup':
          shadow(c, x, y, r); c.fillStyle = rgb(mix(col, BLACK, 0.12), f); rrect(c, x + r * 0.7, y - r * 0.24, r * 0.62, r * 0.48, r * 0.2); c.fill();
          circle(c, x, y, r, rgb(col, f)); circle(c, x, y, r * 0.8, rgb(mix(col, WHITE, 0.55), f)); circle(c, x, y, r * 0.66, rgb([0.42, 0.24, 0.12], f)); circle(c, x - r * 0.18, y - r * 0.2, r * 0.18, 'rgba(255,255,255,0.18)');
          break;
        case 'kettle':
          shadow(c, x, y, r);
          c.strokeStyle = rgb(mix(col, BLACK, 0.3), f); c.lineWidth = Math.max(3, r * 0.18); c.beginPath(); c.arc(x, y, r * 1.06, Math.PI * 0.75, Math.PI * 1.25); c.stroke();
          c.fillStyle = rgb(mix(col, BLACK, 0.12), f); c.beginPath(); c.moveTo(x + r * 0.7, y - r * 0.2); c.lineTo(x + r * 1.38, y - r * 0.05); c.lineTo(x + r * 0.7, y + r * 0.2); c.closePath(); c.fill();
          circle(c, x, y, r, rgb(col, f)); circle(c, x, y, r * 0.64, rgb(mix(col, WHITE, 0.14), f)); circle(c, x, y, r * 0.18, rgb([0.2, 0.2, 0.22], f)); circle(c, x - r * 0.3, y - r * 0.32, r * 0.16, 'rgba(255,255,255,0.22)');
          break;
        case 'bowl':
          shadow(c, x, y, r); circle(c, x, y, r, rgb(mix(col, BLACK, 0.12), f)); circle(c, x, y, r * 0.86, rgb(col, f)); circle(c, x, y, r * 0.62, rgb(mix(col, WHITE, 0.38), f)); circle(c, x, y, r * 0.42, rgb(mix(col, WHITE, 0.5), f));
          break;
        case 'sugar':
          shadow(c, x, y, r); circle(c, x, y, r, rgb(col, f)); circle(c, x, y, r * 0.72, rgb(mix(col, WHITE, 0.18), f)); circle(c, x, y, r * 0.22, rgb(mix(col, WHITE, 0.6), f));
          break;
        case 'milk':
          shadow(c, x, y, r); c.fillStyle = rgb(mix(col, BLACK, 0.08), f); c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.62); c.lineTo(x - r * 1.18, y - r * 1.0); c.lineTo(x - r * 0.88, y - r * 0.38); c.closePath(); c.fill();
          c.strokeStyle = rgb(mix(col, BLACK, 0.2), f); c.lineWidth = Math.max(2, r * 0.18); c.beginPath(); c.arc(x + r * 0.95, y, r * 0.35, -1.2, 1.2); c.stroke();
          circle(c, x, y, r, rgb(col, f), rgb(mix(col, BLACK, 0.18), f), 1.2); circle(c, x, y, r * 0.72, rgb(mix(col, BLACK, 0.06), f));
          break;
        case 'napkins':
          shadow(c, x, y, r); c.fillStyle = rgb(col, f); rrect(c, x - r * 0.92, y - r * 0.92, r * 1.84, r * 1.84, r * 0.3); c.fill();
          c.strokeStyle = rgb(mix(col, BLACK, 0.16), f); c.lineWidth = 1.2; rrect(c, x - r * 0.92, y - r * 0.92, r * 1.84, r * 1.84, r * 0.3); c.stroke();
          c.strokeStyle = rgb([0.8, 0.8, 0.78], f); c.lineWidth = Math.max(1.5, r * 0.12);
          for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x - r * 0.55, y + i * r * 0.36); c.lineTo(x + r * 0.55, y + i * r * 0.36); c.stroke(); }
          break;
        default: circle(c, x, y, r, rgb(col, f));
      }
    }
    function names(c, k, S) { ITEMS.forEach((it) => labelIn(c, k, it.name, it.x * S, it.y * S + it.r * S + 10 * k, { px: 11.5, color: '#2f2a22', haloColor: 'rgba(255,250,240,0.8)', weight: 650 }, S)); }
    return { table, item, names, circle, rgb };
  })();
  const lightF = () => (HeroKit.dark() ? 0.84 : 1);
  function crossMark(c, x, y, col, k) {
    c.lineCap = 'round';
    for (const [w, s] of [[6 * k, 'rgba(255,255,255,0.85)'], [2.6 * k, col]]) {
      c.strokeStyle = s; c.lineWidth = w;
      c.beginPath(); c.arc(x, y, 9 * k, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x - 15 * k, y); c.lineTo(x - 5 * k, y); c.moveTo(x + 5 * k, y); c.lineTo(x + 15 * k, y); c.moveTo(x, y - 15 * k); c.lineTo(x, y - 5 * k); c.moveTo(x, y + 5 * k); c.lineTo(x, y + 15 * k); c.stroke();
    }
  }
  function arrow(c, x0, y0, x1, y1, col, lw, head) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0); if (L < 2) return;
    head = Math.min(head || 10, L * 0.6);
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - head * Math.cos(a - 0.42), y1 - head * Math.sin(a - 0.42)); c.lineTo(x1 - head * Math.cos(a + 0.42), y1 - head * Math.sin(a + 0.42)); c.closePath(); c.fill();
  }

  /* =====================================================================
     1. Картинка → токены
     ===================================================================== */
  const Tok = (() => {
    const W = 420, st = { patch: 32, tl: false, hover: null, seen16: false, pickT: null, pickP: null };
    const BLOBS = [[0.30, 0.84, 0.13], [0.24, 0.2, 0.15], [0.74, 0.84, 0.13], [0.52, 0.5, 0.12], [0.84, 0.52, 0.12], [0.7, 0.18, 0.12], [0.12, 0.56, 0.16], [0.5, 0.93, 0.14]];
    const HUES = [12, 48, 95, 160, 200, 250, 290, 330];
    let task = null;
    const nOf = (p) => (224 / p) * (224 / p);
    const cur = () => (st.tl ? 8 : nOf(st.patch));
    function draw() {
      if (!live()) return;
      const cv = $('#tokCv'), { c, k } = HeroKit.fit(cv, W, W), P = pal();
      Scene.table(c, W, lightF()); ITEMS.forEach((it) => Scene.item(c, it, W, lightF()));
      const g = 224 / st.patch, cell = W / g;
      c.save(); c.globalAlpha = st.tl ? 0.25 : 1;
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.2 * k;
      c.beginPath(); for (let i = 1; i < g; i++) { const v = Math.round(i * cell) + 0.5; c.moveTo(v, 0); c.lineTo(v, W); c.moveTo(0, v); c.lineTo(W, v); } c.stroke();
      c.restore();
      if (st.tl) {
        BLOBS.forEach(([x, y, r], i) => {
          const gr = c.createRadialGradient(x * W, y * W, 0, x * W, y * W, r * W);
          gr.addColorStop(0, `hsla(${HUES[i]}, 75%, 50%, 0.55)`); gr.addColorStop(1, `hsla(${HUES[i]}, 75%, 50%, 0)`);
          c.fillStyle = gr; c.beginPath(); c.arc(x * W, y * W, r * W, 0, Math.PI * 2); c.fill();
          HeroKit.label(c, k, String(i + 1), x * W, y * W - r * W * 0.45, { px: 12, weight: 800, color: '#1d1a14', haloColor: 'rgba(255,255,255,0.85)' });
        });
      } else if (st.hover) {
        const { i, j } = st.hover;
        c.fillStyle = 'rgba(235,104,52,0.28)'; c.fillRect(j * cell, i * cell, cell, cell);
        c.strokeStyle = P.e2e; c.lineWidth = 2.5 * k; c.strokeRect(j * cell + 1, i * cell + 1, cell - 2, cell - 2);
      }
      HeroKit.label(c, k, st.tl ? '8 областей TokenLearner' : `224 × 224 px · патч ${st.patch}`, 8 * k, 12 * k, { align: 'left', px: 11.5, mono: true, color: '#2f2a22', haloColor: 'rgba(255,250,240,0.85)' });
    }
    function side() {
      const n = cur(), moved = st.tl || st.patch !== 32;
      $('#tokN').textContent = int(n); $('#tokN2').textContent = int(n * n);
      $('#tokN0').textContent = moved ? `при патче 32 px: ${int(nOf(32))}` : ''; $('#tokN20').textContent = moved ? `при патче 32 px: ${int(nOf(32) ** 2)}` : '';
      $$('#tokPatch button').forEach((b) => b.setAttribute('aria-pressed', String(!st.tl && +b.dataset.p === st.patch)));
      const rows = [[32, 'патч 32 px'], [16, 'патч 16 px'], [14, 'патч 14 px'], ['tl', 'TokenLearner, 8']], max = 65536;
      setOut($('#tokBars'), '<div class="tb-cap">Пар для внимания, n², на одну картинку</div>' + rows.map(([p, t]) => {
        const nn = p === 'tl' ? 8 : nOf(p), on = p === 'tl' ? st.tl : (!st.tl && p === st.patch);
        return `<div class="tb-row${on ? ' cur' : ''}"><span>${t}</span><span class="tb-bar"><i style="width:${(nn * nn / max * 100).toFixed(2)}%"></i></span><output>${int(nn * nn)}</output></div>`;
      }).join(''));
      let txt;
      if (st.tl) txt = 'TokenLearner учится выбирать 8 областей кадра и сжимает каждую в один токен. RT-1 так превращает 81 токен свёрточной сети в 8: на 6 кадров выходит 48 токенов вместо 486.';
      else if (st.hover) { const g = 224 / st.patch, id = st.hover.i * g + st.hover.j + 1; txt = `Патч ${id} из ${int(nOf(st.patch))}: строка ${st.hover.i + 1}, столбец ${st.hover.j + 1}. Его ${st.patch} × ${st.patch} × 3 = ${int(st.patch * st.patch * 3)} чисел станут одним токеном.`; }
      else { const g = 224 / st.patch; txt = `224 / ${st.patch} = ${g} патчей по каждой стороне, ${g} × ${g} = ${int(nOf(st.patch))} токенов.${st.patch === 16 ? ' ViT добавит к ним ещё токен [class].' : ''}`; }
      setOut($('#tokOut'), txt);
      const locked = task && task.bet === undefined;
      $$('#tokPatch button').forEach((b) => { if (b.dataset.p !== '32') gate(b, locked, 'Сначала сделай ставку'); });
      if (task) {
        task.root.querySelectorAll('.pick').forEach((g) => { const done = g.dataset.g === 't' ? st.pickT === 4 : st.pickP === 16; g.querySelectorAll('button').forEach((b) => { b.disabled = done || !st.seen16; }); });
        task.update(state());
      }
    }
    const state = () => ({ patch: st.patch, tl: st.tl, seen16: st.seen16, pickT: st.pickT, pickP: st.pickP, n: cur() });
    function setPatch(p) {
      st.patch = p; st.tl = false; $('#tokTL').checked = false; st.hover = null;
      if (p === 16 && !st.seen16) { st.seen16 = true; task.resolveBet(); }
      draw(); side();
    }
    function init() {
      task = mountTask('#tokTask', {
        title: 'Сколько стоит мелкий патч',
        text: 'Сделай ставку, потом переключи патч с 32 на 16 px и отметь, во сколько раз выросло число токенов и число пар для внимания.',
        bet: { q: 'сколько токенов даст картинка 224 × 224 при патче 16?', options: ['49', '196', '50 176'], answer: 1 },
        onBet: () => side(),
        criteria: [
          { label: 'Патч переключён с 32 на 16 px', test: (s) => s.seen16 },
          { label: 'Токенов стало больше: <span class="pick" data-g="t"><button type="button" data-v="2">в 2 раза</button><button type="button" data-v="4">в 4 раза</button><button type="button" data-v="8">в 8 раз</button></span>', test: (s) => s.pickT === 4 },
          { label: 'Пар для внимания стало больше: <span class="pick" data-g="p"><button type="button" data-v="4">в 4 раза</button><button type="button" data-v="8">в 8 раз</button><button type="button" data-v="16">в 16 раз</button></span>', test: (s) => s.pickP === 16 },
        ],
        hint: 'Сторона кадра делится на размер патча: 224 / 32 = 7 и 224 / 16 = 14. Токенов — квадрат этого числа, а пар для внимания — квадрат числа токенов.',
        explain: () => 'При патче 16 выходит 14 × 14 = 196 токенов, и ViT добавляет к ним токен [class]. Внимание сравнивает каждый токен с каждым, поэтому вчетверо больше токенов дают в 16 раз больше пар. В Octo патчи 16 × 16 работают на захватах лучше, чем 32 × 32, но токенов вчетверо больше. Патч 14 даёт 256 токенов — столько PaliGemma и π0 получают из картинки 224 px.',
        onDone: () => { $('#tokMore').hidden = false; },
      });
      // Порядок на экране совпадает с порядком действий: ставка, размер патча, кадр, числа, проверка.
      // На широком экране кадр слева, шаги справа; на узком всё в одну колонку, кадр сразу под кнопками патча.
      const R = task.root, q = (sel) => R.querySelector(sel);
      R.append(h('div', { class: 'tok-head' }, q('.g-kicker'), q('h4'), q('.g-text'), q('.m-bet'), $('#tokCtl')), $('#tokView'),
        h('div', { class: 'tok-steps' }, $('#tokKpis'), q('.m-crit'), q('.m-hint'), q('.g-out'), $('#tokMore')));
      task.root.addEventListener('click', (e) => {
        const b = e.target.closest('.pick button'); if (!b || b.disabled) return;
        const g = b.closest('.pick').dataset.g, v = +b.dataset.v, right = g === 't' ? 4 : 16;
        if (g === 't') st.pickT = v; else st.pickP = v;
        b.closest('.pick').querySelectorAll('button').forEach((x) => { x.classList.remove('pk-no'); });
        b.classList.add(v === right ? 'pk-ok' : 'pk-no');
        if (v === right) b.closest('.pick').querySelectorAll('button').forEach((x) => { x.disabled = true; });
        side();
      });
      $$('#tokPatch button').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) setPatch(+b.dataset.p); }));
      $('#tokTL').addEventListener('change', (e) => { st.tl = e.target.checked; st.hover = null; draw(); side(); });
      const cv = $('#tokCv'), pick = (ev) => { const r = cv.getBoundingClientRect(), g = 224 / st.patch, j = Math.floor((ev.clientX - r.left) / r.width * g), i = Math.floor((ev.clientY - r.top) / r.height * g); return i >= 0 && j >= 0 && i < g && j < g ? { i, j } : null; };
      cv.addEventListener('pointermove', (ev) => { if (st.tl) return; const p = pick(ev); if (JSON.stringify(p) !== JSON.stringify(st.hover)) { st.hover = p; draw(); side(); } });
      cv.addEventListener('pointerleave', () => { if (st.hover) { st.hover = null; draw(); side(); } });
      cv.addEventListener('pointerdown', (ev) => { if (st.tl) return; st.hover = pick(ev); draw(); side(); });
      draw(); side(); redrawOn(draw);
    }
    return { init, st, setPatch, get task() { return task; } };
  })();

  /* =====================================================================
     2. Лаборатория «Найди чашку»
     ===================================================================== */
  const Att = (() => {
    const W = 420, S = W, PR = 3.3, sc = W / (2 * PR);
    const pmap = (x, y) => ({ x: W / 2 + x * sc, y: W / 2 - y * sc }), pinv = (px, py) => [(px - W / 2) / sc, (W / 2 - py) / sc];
    const Q0 = [-0.7, -0.55], QH0 = [[-0.6, 0], [-0.3, -0.52]];
    const cloneKeys = () => ({ gen: E.KEYS.gen.map((v) => v.slice()), color: E.KEYS.color.map((v) => v.slice()), place: E.KEYS.place.map((v) => v.slice()) });
    const st = { mode: 1, q: Q0.slice(), qh: QH0.map((v) => v.slice()), keys: cloneKeys(), active: 0, dkIdx: 0, div: false, bars: 'w', showAns: false, zones: false, lock: false, dragKeys: false, mask: E.Mask.full(), m3ran: false, busy: false };
    let ctl = null;
    const dk = () => E.DKS[st.dkIdx];
    const HEADS = ['color', 'place'], HEAD_NAMES = ['«цвет»', '«место»'];
    const clampQ = (v) => { const L = Math.hypot(v[0], v[1]); return L > E.QMAX ? [v[0] * E.QMAX / L, v[1] * E.QMAX / L] : v; };
    function compute() {
      if (st.mode === 1) return [E.attend({ head: 'gen', q: st.q, keys: st.keys.gen, dk: dk(), div: st.div })];
      return HEADS.map((hd, i) => E.attend({ head: hd, q: st.qh[i], keys: st.keys[hd], dk: dk(), div: st.div }));
    }
    const headCol = (i, P) => (i ? P.h2 : P.e2e);
    const activeQ = () => (st.mode === 1 ? st.q : st.qh[st.active]);
    const activeKeys = () => (st.mode === 1 ? st.keys.gen : st.keys[HEADS[st.active]]);
    function setActiveQ(v) { v = clampQ(v); if (st.mode === 1) st.q = v; else st.qh[st.active] = v; changed(); }

    function drawTable() {
      if (!live()) return;
      const cv = $('#attTable'), { c, k } = HeroKit.fit(cv, W, W), P = pal(), f = lightF(), R = compute();
      Scene.table(c, S, f);
      HeroKit.label(c, k, 'передний край стола', S / 2, S * 0.981, { px: 10.5, mono: true, color: 'rgba(40,24,8,0.7)', halo: false });
      if (st.zones) {
        c.setLineDash([4 * k, 4 * k]); c.strokeStyle = 'rgba(60,35,10,0.45)'; c.lineWidth = 1.3 * k;
        ITEMS.forEach((it) => { c.beginPath(); c.arc(it.x * S, it.y * S, E.M.gapR * S, 0, Math.PI * 2); c.stroke(); });
        c.setLineDash([]);
      }
      if (st.showAns) R.forEach((r, hI) => ITEMS.forEach((it, i) => {
        const w = r.w[i]; if (w < 0.02) return;
        c.strokeStyle = headCol(hI, P); c.globalAlpha = 0.15 + 0.6 * w; c.lineWidth = (1 + 3 * w) * k;
        c.beginPath(); c.moveTo(r.out.x * S, r.out.y * S); c.lineTo(it.x * S, it.y * S); c.stroke(); c.globalAlpha = 1;
      }));
      ITEMS.forEach((it) => Scene.item(c, it, S, f));
      R.forEach((r, hI) => ITEMS.forEach((it, i) => {
        const w = r.w[i], rr = it.r * S + (7 + hI * 11) * k;
        c.strokeStyle = headCol(hI, P); c.globalAlpha = 0.28 + 0.72 * w; c.lineWidth = (1.4 + 8 * w) * k;
        c.beginPath(); c.arc(it.x * S, it.y * S, rr, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
        const a = hI ? 0.5 : -0.75, lx = it.x * S + Math.cos(a) * (rr + 16 * k), ly = it.y * S + Math.sin(a) * (rr + 9 * k);
        labelIn(c, k, fmt2(w), lx, ly, { px: 11, mono: true, weight: 700, color: headCol(hI, P), haloColor: 'rgba(255,250,240,0.9)' }, S);
      }));
      Scene.names(c, k, S);
      if (st.showAns) R.forEach((r, hI) => crossMark(c, r.out.x * S, r.out.y * S, headCol(hI, P), k));
    }
    function drawPlane() {
      if (!live()) return;
      const cv = $('#attPlane'), { c, k } = HeroKit.fit(cv, W, W), P = pal();
      c.fillStyle = P.bg; c.fillRect(0, 0, W, W);
      c.strokeStyle = P.grid; c.lineWidth = 1;
      c.beginPath(); for (let v = -3; v <= 3; v += 0.5) { const a = pmap(v, 0), b = pmap(0, v); c.moveTo(a.x, 0); c.lineTo(a.x, W); c.moveTo(0, b.y); c.lineTo(W, b.y); } c.stroke();
      c.strokeStyle = P.line2; c.lineWidth = 1.5; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, W); c.moveTo(0, W / 2); c.lineTo(W, W / 2); c.stroke();
      for (const v of [-3, -2, -1, 0, 1, 2, 3]) { const a = pmap(v, 0), b = pmap(0, v); labelIn(c, k, fmt(v, 0), a.x, W - 9 * k, { px: 10, mono: true, color: P.ink3, haloColor: P.bg }, W); if (v && Math.abs(v) < 3) HeroKit.label(c, k, fmt(v, 0), 5 * k, b.y, { px: 10, mono: true, color: P.ink3, haloColor: P.bg, align: 'left' }); }
      c.setLineDash([4, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.arc(W / 2, W / 2, E.QMAX * sc, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      const keys = activeKeys(), groups = [];
      keys.forEach((kv, i) => { const g = groups.find((x) => Math.hypot(x.v[0] - kv[0], x.v[1] - kv[1]) < 1e-6); if (g) g.ids.push(i); else groups.push({ v: kv, ids: [i] }); });
      const o = pmap(0, 0);
      groups.forEach((g) => {
        const t = pmap(g.v[0], g.v[1]); arrow(c, o.x, o.y, t.x, t.y, P.ink3, 2.4 * k, 9 * k);
        g.ids.forEach((id, j) => { const dx = (j - (g.ids.length - 1) / 2) * 11 * k; Scene.circle(c, t.x + dx, t.y, 5.5 * k, rgbOf(ITEMS[id].col), P.ink, 1.2 * k); });
        if (st.dragKeys) Scene.circle(c, t.x, t.y, 10 * k, null, P.ink3, 1.2 * k);
        const L = Math.hypot(g.v[0], g.v[1]) || 1, ux = g.v[0] / L, uy = -g.v[1] / L, nx = uy, ny = -ux;
        const lx = t.x + ux * 7 * k + nx * 14 * k, ly = t.y + uy * 7 * k + ny * 14 * k, al = nx > 0.5 ? 'left' : nx < -0.5 ? 'right' : 'center';
        labelIn(c, k, g.ids.map((id) => ITEMS[id].name).join(' · '), lx, ly, { px: 11.5, color: P.ink2, haloColor: P.bg, align: al, weight: 650 }, W);
      });
      const hc = st.mode === 1 ? P.e2e : headCol(st.active, P), q = activeQ(), qt = pmap(q[0], q[1]);
      arrow(c, o.x, o.y, qt.x, qt.y, hc, 4.5 * k, 13 * k);
      c.save(); if (st.lock) c.setLineDash([3 * k, 3 * k]);
      Scene.circle(c, qt.x, qt.y, 9 * k, P.surf, hc, 3 * k); c.restore();
      const L = Math.hypot(q[0], q[1]) || 1, nx = q[1] / L, ny = q[0] / L;
      labelIn(c, k, st.lock ? 'запрос закреплён' : 'запрос', qt.x + nx * 22 * k, qt.y + ny * 22 * k, { px: 12, weight: 700, color: hc, haloColor: P.bg, align: nx > 0.5 ? 'left' : nx < -0.5 ? 'right' : 'center' }, W);
    }
    function drawBars() {
      const R = compute(), two = st.mode === 2, sMode = st.bars === 's';
      let scale = 1; if (sMode) R.forEach((r) => r.scores.forEach((v) => { scale = Math.max(scale, Math.abs(v)); }));
      const cols = ['var(--e2e)', 'var(--h2)'];
      let html = '';
      ITEMS.forEach((it, i) => {
        const vals = R.map((r) => (sMode ? r.scores[i] : r.w[i]));
        const bars = vals.map((v, hI) => {
          if (!sMode) return `<span class="bar"><i style="--c:${cols[hI]};left:0;width:${(v * 100).toFixed(1)}%"></i></span>`;
          const wd = Math.abs(v) / scale * 50, left = v >= 0 ? 50 : 50 - wd;
          return `<span class="bar div"><i style="--c:${cols[hI]};left:${left.toFixed(1)}%;width:${wd.toFixed(1)}%"></i></span>`;
        }).join('');
        const outs = vals.map((v) => (sMode ? fmt(v, Math.abs(v) >= 10 ? 0 : 1) : fmt2(v))).join('<br>');
        html += `<div class="ab-row${two ? ' two' : ''}"><span class="nm"><i style="background:${rgbOf(it.col)}"></i>${it.name}</span><span class="bars">${bars}</span><output>${outs}</output></div>`;
      });
      if (dk() > 2) {
        const r = R[0], lo = Math.min(...r.scores), hi = Math.max(...r.scores);
        html += `<div class="ab-note">Скрытых компонент: ${dk() - 2}. Оценки ${st.div ? 'после деления на ' + fmt(Math.sqrt(dk()), 1) : 'без деления'}: от ${fmt(lo, 1)} до ${fmt(hi, 1)}.</div>`;
      }
      setOut($('#attBars'), html);
      $('#attBarsTitle').textContent = sMode ? (st.div ? 'Оценки q·k / √d_k' : 'Оценки q·k') : 'Веса softmax';
      $$('#wrapBars button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.bars)));
    }
    function stat() {
      const R = compute(); let html;
      if (st.mode === 1) {
        const r = R[0], q = st.q, L = Math.hypot(q[0], q[1]);
        if (!st.showAns) html = `Вес чашки <b>${fmt2(r.w[0])}</b> · длина запроса <b>${fmt(L, 1)}</b>`;
        else { const n = E.nearest(r.out); html = `Ответ: x <b>${fmt2(r.out.x)}</b>, y <b>${fmt2(r.out.y)}</b> м · до ближайшего предмета, ${ITEMS[n.i].gen}, <b>${int(n.d * 100)} см</b>`; }
      } else {
        html = `Голова «цвет»: красные <b>${fmt2(R[0].w[0] + R[0].w[1])}</b> · голова «место»: у края <b>${fmt2(R[1].w[0] + R[1].w[2])}</b>`;
      }
      setOut($('#attTableStat'), html);
      const sub = st.lock ? 'в этой миссии запрос не трогаем' : st.dragKeys ? 'перетаскивай запрос и концы ключей' : 'перетаскивай конец толстой стрелки';
      $('#attPlaneTitle').textContent = st.mode === 1 ? 'Ключи и запрос' : `Голова ${HEAD_NAMES[st.active]}: ключи и запрос`;
      $('#attPlaneSub').textContent = sub;
      $$('#attHeadSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.h === st.active)));
      const P = pal();
      if (st.mode === 1) legend('#attLegend', [['ключ предмета', P.ink3], ['запрос', P.e2e], ['кольцо — вес предмета', P.e2e, 'ring']].concat(st.showAns ? [['✛ ответ внимания: смесь мест с весами', P.e2e, 'dot']] : []).concat(st.zones ? [['пунктир — 15 см вокруг предмета', 'rgba(60,35,10,0.6)', 'dash']] : []));
      else legend('#attLegend', [['голова «цвет»: кольца, ответ ✛ и столбики', P.e2e, 'ring'], ['голова «место»', P.h2, 'ring'], ['ключи выбранной головы', P.ink3]]);
    }
    function drawMask() {
      $$('#maskGrid .mc').forEach((b) => { const i = +b.dataset.i, j = +b.dataset.j; b.setAttribute('aria-pressed', String(st.mask[i][j])); });
      const deps = E.Mask.prefixDeps(st.mask), note = $('#maskNote'), T = E.Mask.TOK;
      if (!deps.length) { note.innerHTML = 'Кадры и команда не видят ни состояния, ни действий. Их K и V не зависят от действий: их можно посчитать один раз и положить в кэш.'; note.className = 'mask-note ok'; }
      else { const seen = [...new Set(deps.map((d) => T[d[1]].s))]; note.innerHTML = `Кадры и команда видят ${seen.join(', ')}. Их K и V меняются вместе с ${deps.some((d) => d[1] >= 4) ? 'действиями' : 'состоянием'}, и кэшировать их нельзя.`; note.className = 'mask-note'; }
    }
    function draw() { drawTable(); drawPlane(); drawBars(); stat(); drawMask(); }
    function changed() { draw(); if (ctl) ctl.update(); }
    function state() {
      const R = compute(), r = R[0], max = Math.max(...r.w);
      return { mode: st.mode, w: r.w, out: r.out, dk: dk(), div: st.div, max, arg: r.w.indexOf(max), len: Math.hypot(st.q[0], st.q[1]), wc: R[0].w, wp: R[1] ? R[1].w : null, crit: E.Mask.crit(st.mask), mask: st.mask.map((x) => x.slice()) };
    }
    function syncDk() { const el = $('#attDk'); el.value = st.dkIdx; el.nextElementSibling.textContent = String(dk()); setRangeFill(el); $('#attDiv').checked = st.div; }
    function gateM3() {
      const locked = !!ctl && ctl.index === 2 && !st.m3ran && !ctl.ctx.done[2];
      gate($('#attDk'), locked, 'Сначала сделай ставку и запусти опыт'); gate($('#attDiv'), locked, 'Сначала сделай ставку и запусти опыт');
      $('#wrapDk').toggleAttribute('data-locked', locked); $('#wrapDiv').toggleAttribute('data-locked', locked);
    }
    async function growDk() {
      st.busy = true;
      if (!st.m3ran) st.div = false;
      for (let j = 0; j < E.DKS.length; j++) { st.dkIdx = j; syncDk(); draw(); await sleep(j ? 170 : 60); }
      st.m3ran = true; st.busy = false; gateM3();
      const r = compute()[0], max = Math.max(...r.w);
      return { dk: dk(), div: st.div, max, arg: r.w.indexOf(max), lo: Math.min(...r.scores), hi: Math.max(...r.scores) };
    }
    function setupHeads() { st.mode = 2; st.active = 0; st.qh = QH0.map((v) => v.slice()); st.keys = cloneKeys(); st.dkIdx = 0; syncDk(); }
    const api = {
      reset() { st.mode = 1; st.q = Q0.slice(); st.qh = QH0.map((v) => v.slice()); st.keys = cloneKeys(); st.active = 0; st.dkIdx = 0; st.div = false; st.bars = 'w'; st.mask = E.Mask.full(); st.m3ran = false; syncDk(); draw(); },
      state, growDk, setupHeads,
      dk2: () => { st.dkIdx = 0; syncDk(); },
      setQ: (x, y) => { if (!st.lock) setActiveQ([x, y]); },
      setHead: (i) => { st.active = i; changed(); },
      planePt: (x, y) => pmap(x, y),
    };
    const ITEM = (i) => ITEMS[i];
    const missions = [
      { short: 'Чашка', title: 'Наведи запрос на чашку', controls: ['bars'],
        text: 'Запрос — толстая оранжевая стрелка на плоскости ключей. Каждый предмет получает оценку q·k — скалярное произведение запроса и своего ключа. Softmax превращает оценки в веса, которые в сумме дают 1. Поверни и растяни запрос так, чтобы чашка получила больше половины внимания.',
        criteria: [{ label: 'Вес чашки больше 0,5', test: (r, s) => s.mode === 1 && E.Check.m1(s.w) }],
        hint: 'Скалярное произведение больше, когда стрелки смотрят в одну сторону. Направь запрос вдоль ключа чашки и сделай его длиннее.',
        explain: () => `Чашка получила больше половины внимания. Её вес зависит от всех ключей сразу: softmax нормирует строку целиком, и соседние ключи, у чайника и миски, забирают часть веса. Длина запроса работает как резкость: чем длиннее стрелка, тем сильнее разница оценок и тем острее пик.` },
      { short: 'Между', title: 'Ответ между предметами', controls: ['bars'],
        text: 'Значение предмета — его место на столе. Выход внимания — сумма значений с весами, поэтому ответ — точка на столе, её показывает перекрестье. Найди запрос, при котором ответ падает на пустое место: дальше 15 см от любого предмета.',
        criteria: [{ label: 'Ответ дальше 15 см от всех предметов', test: (r, s) => s.mode === 1 && E.Check.m2gap(s.out) }, { label: 'Ни один вес не больше 0,6', test: (r, s) => s.mode === 1 && E.Check.m2spread(s.w) }],
        hint: 'Если запрос совсем короткий, веса почти равны и ответ падает в среднюю точку стола — там стоит сахарница. Поверни запрос между ключами двух предметов, которые на столе стоят далеко друг от друга.',
        explain: () => { return `Ответ лёг на пустое место стола. Выход внимания — сумма значений с весами. Когда веса размазаны, ответ оказывается между предметами, там, где ничего нет. Это то же усреднение, что у регрессии в уроке 1.3: среднее двух правильных ответов само может быть неправильным.`; } },
      { short: '√d_k', title: 'Не дай softmax схлопнуться', controls: ['bars', 'dk', 'div'],
        text: 'К двум видимым компонентам ключей и запроса добавим скрытые — случайные числа с дисперсией 1. Сколько всего компонент, задаёт d_k: в трансформере 2017 года d_k = 64, у Gemma в π0 — 256. Запрос в этой миссии не трогаем. Опыт наращивает d_k от 2 до 256.',
        bet: { q: 'что станет с весами при d_k = 256 без деления?', options: ['Почти не изменятся', 'Выровняются', 'Схлопнутся в один пик'], answer: () => 2 },
        action: { label: 'Нарастить d_k до 256', run: (A) => A.growDk() },
        criteria: [{ label: 'd_k = 256', test: (r) => E.Check.m3dk(r.dk) }, { label: 'Наибольший вес меньше 0,9', test: (r) => E.Check.m3peak([r.max]) }],
        summary: (r) => `d_k 256, ${r.div ? 'делим на 16' : 'без деления'}: наибольший вес ${fmt2(r.max)}, ${ITEM(r.arg).name}`,
        fail: (r) => (r.div ? `Наибольший вес ${fmt2(r.max)}. Попробуй ещё раз.` : `Веса схлопнулись в один пик: у предмета «${ITEM(r.arg).name}» ${fmt2(r.max)}, у остальных почти ноль. Оценки q·k разбегаются от ${fmt(r.lo, 0)} до ${fmt(r.hi, 0)}, и softmax от таких чисел выбирает одного. Запрос не трогай: найди ручку, которая вернёт оценки в рабочий диапазон, и запусти опыт снова.`),
        hint: 'Переключи столбики на q·k: оценки выросли в десятки раз. Включи деление на √d_k.',
        explain: (r) => `Наибольший вес — <b>${fmt2(r.max)}</b>. При независимых компонентах с дисперсией 1 дисперсия q·k равна d_k: при d_k = 256 оценки разбегаются примерно на ±16, и softmax от таких чисел почти всегда даёт один пик. В обучении это почти нулевые градиенты (вопрос 2 квиза). Деление на √256 = 16 возвращает разброс к единице. Скрытые компоненты у нас случайные, поэтому после деления веса почти не зависят от запроса. В обученной модели все 256 компонент несут смысл, и деление держит оценки в рабочем диапазоне.` },
      { short: 'Маска π0', title: 'Собери маску π0', controls: ['mask'], onEnter: (A) => A.dk2(),
        text: 'Маска решает, кто кого видит: закрытая клетка ставит оценке −∞, и softmax даёт ей вес 0. Возьмём шесть токенов в порядке π0: кадры двух камер и команда, потом состояние, потом два действия. Собери маску под четыре условия.',
        criteria: [
          { label: 'Действия видят всё: кадры, команду, состояние и друг друга', test: (r, s) => s.crit[0] },
          { label: 'Кадры и команда видят друг друга в обе стороны', test: (r, s) => s.crit[1] },
          { label: 'Кадры и команда не видят состояние и действия', test: (r, s) => s.crit[2] },
          { label: 'Состояние видит кадры, команду и себя, но не действия', test: (r, s) => s.crit[3] },
        ],
        hint: 'Нажми «Каузальная» и посмотри, какие условия она не проходит. Каузальная маска открывает только диагональ и то, что левее, а кадрам и команде нужно видеть друг друга в обе стороны.',
        explain: () => 'Это блочная маска π0. Так же устроена prefix-LM в PaliGemma: внутри блока внимание идёт в обе стороны, между блоками — только назад. Кадры и команда не видят ни состояния, ни действий, поэтому их K и V не меняются, пока модель уточняет действия. Их считают один раз и кладут в кэш. К этому вернёмся в разделе про KV-кэш.' },
      { short: 'Две головы', title: 'Две головы', controls: ['bars', 'head2'], onEnter: (A) => A.setupHeads(),
        text: 'У каждой головы своя матрица ключей. Голова «цвет» видит только цвет, голова «место» — только где стоит предмет. Чашка красная и стоит у переднего края. Но у головы «цвет» её ключ совпадает с ключом чайника, а у головы «место» — с ключом миски. Настрой обе головы так, чтобы чашка была главной у обеих. Головы переключаются над плоскостью ключей.',
        criteria: [
          { label: 'Голова «цвет»: красные предметы вместе получают больше 0,8', test: (r, s) => s.mode === 2 && E.Check.m5color(s.wc) },
          { label: 'Голова «место»: предметы у края вместе получают больше 0,8', test: (r, s) => s.mode === 2 && E.Check.m5place(s.wp) },
          { label: 'Чашка — единственный предмет с весом больше 0,3 в обеих головах', test: (r, s) => s.mode === 2 && E.Check.m5solo(s.wc, s.wp) },
        ],
        hint: 'Ключ чашки совпадает с ключом «двойника», и одна голова их не разделит. Направь запрос каждой головы на общий ключ чашки и сделай стрелку длиннее.',
        explain: () => 'Каждая голова по отдельности путает чашку: «цвет» делит внимание между чашкой и чайником, «место» — между чашкой и миской. Выходы голов склеиваются и проходят через матрицу W^O, и вместе они называют чашку однозначно. Ширина каждой головы — d_model/h, поэтому восемь голов стоят почти как одна голова полной размерности (вопрос 3 квиза).' },
      { short: 'Свободно', title: 'Свободный режим', final: true,
        text: 'Все ручки сразу: запросы обеих голов, d_k с делением и маска π0. Ключи теперь тоже можно тянуть. Попробуй растащить совпавшие ключи чашки и чайника и посмотри, как голова «цвет» начинает их различать.' },
    ];
    function onStep(i) {
      st.showAns = i >= 1; st.zones = i === 1; st.lock = i === 2; st.dragKeys = i === 5;
      if (i >= 4) { if (st.mode !== 2) setupHeads(); }
      else if (st.mode !== 1) { st.mode = 1; st.keys = cloneKeys(); }
      gateM3(); draw();
    }
    function initMask() {
      const g = $('#maskGrid'), T = E.Mask.TOK; g.innerHTML = '';
      g.append(h('span', { class: 'mh' }));
      T.forEach((t) => g.append(h('span', { class: 'mh b' + t.b, title: t.name }, t.s)));
      T.forEach((t, i) => {
        g.append(h('span', { class: 'mh b' + t.b, title: t.name }, t.s));
        T.forEach((u, j) => {
          const b = h('button', { type: 'button', class: 'mc', 'data-i': i, 'data-j': j, 'aria-label': `${t.name} видит: ${u.name}` });
          b.addEventListener('click', () => { st.mask[i][j] = !st.mask[i][j]; changed(); });
          g.append(b);
        });
      });
      $$('[data-mask]').forEach((b) => b.addEventListener('click', () => { st.mask = E.Mask[b.dataset.mask](); changed(); }));
    }
    function init() {
      initMask();
      const cv = $('#attPlane');
      HeroKit.drag(cv, W, W, {
        hit: (p) => {
          const q = activeQ(), t = pmap(q[0], q[1]);
          if (!st.lock && Math.hypot(p.x - t.x, p.y - t.y) < 40) return { q: true };
          if (st.dragKeys) { const keys = activeKeys(); let best = null, bd = 26; keys.forEach((kv, i) => { const kt = pmap(kv[0], kv[1]), d = Math.hypot(p.x - kt.x, p.y - kt.y); if (d < bd) { bd = d; best = i; } }); if (best != null) return { key: best }; }
          return null;
        },
        move: (o, p) => {
          const v = pinv(p.x, p.y);
          if (o.q) setActiveQ(v);
          else { const L = Math.hypot(v[0], v[1]), m = 3.1, vv = L > m ? [v[0] * m / L, v[1] * m / L] : v; activeKeys()[o.key] = vv; changed(); }
        },
        tap: (p) => { if (!st.lock) setActiveQ(pinv(p.x, p.y)); }, tapCursor: 'pointer',
      });
      $$('#wrapBars button').forEach((b) => b.addEventListener('click', () => { st.bars = b.dataset.v; draw(); }));
      $$('#attHeadSeg button').forEach((b) => b.addEventListener('click', () => { st.active = +b.dataset.h; draw(); }));
      $('#attDk').addEventListener('input', (e) => { st.dkIdx = +e.target.value; syncDk(); changed(); });
      $('#attDiv').addEventListener('change', (e) => { st.div = e.target.checked; changed(); });
      syncDk();
      const root = $('#attMis'), mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
      ctl = Missions.mount(root, missions, api, { scene: '#attTable', controls: { bars: '#wrapBars', dk: '#wrapDk', div: '#wrapDiv', mask: '#wrapMask', head2: '#wrapHead2' }, onStep: (i) => { mark(i); onStep(i); } });
      mark(ctl.index); onStep(ctl.index);
      root.addEventListener('click', () => setTimeout(gateM3, 0));
      redrawOn(draw);
      return ctl;
    }
    return { init, api, st, compute, get ctl() { return ctl; } };
  })();

  /* =====================================================================
     3. Сломай порядок: команда из слов и позиционные кодировки
     ===================================================================== */
  const Ord = (() => {
    const P0 = ['take', 'cup', 'then', 'bowl'], NAME = Object.fromEntries(E.Pos.WORDS.map((w) => [w.id, w.w]));
    const st = { order: P0.slice(), pe: false, sel: null, seen: new Map(), fails: new Set(), cupFirst: null, bowlFirst: null, pair: null, log: [], hover: null };
    let task = null;
    const key = (o) => o.join(',');
    const text = (o) => o.map((id) => NAME[id]).join(' ');
    const ACC = { cup: 'чашку', bowl: 'миску' }, NOM = { cup: 'чашка', bowl: 'миска' };
    function record() {
      const r = E.Pos.command(st.order, st.pe), kk = key(st.order) + (st.pe ? '+' : '');
      if (!st.seen.has(kk)) {
        st.seen.set(kk, { order: st.order.slice(), pe: st.pe, r });
        st.log.push({ t: `${st.pe ? 'с позициями: ' : ''}${text(st.order)} → ${ACC[r.answer]} ${r.ok ? '✓' : '✗'}`, ok: r.ok });
        if (!st.pe && !r.ok) st.fails.add(key(st.order));
      }
      if (!st.pe) {
        const cupFirst = st.order.indexOf('cup') < st.order.indexOf('bowl');
        if (cupFirst && !st.cupFirst) st.cupFirst = st.order.slice();
        if (!cupFirst && !st.bowlFirst) st.bowlFirst = st.order.slice();
        if (st.cupFirst && st.bowlFirst && !st.pair) {
          const a = E.Pos.command(st.cupFirst, false), b = E.Pos.command(st.bowlFirst, false);
          if (a.answer === b.answer) st.pair = [st.cupFirst, st.bowlFirst];
        }
      }
      return r;
    }
    function render() {
      const r = record(), box = $('#ordCmd'); box.innerHTML = '';
      st.order.forEach((id, p) => {
        const w = r.w[p], obj = id === 'cup' || id === 'bowl';
        const b = h('button', { type: 'button', class: 'ord-chip' + (obj ? ' obj' : '') + (st.sel === p ? ' sel' : ''), 'data-p': p, role: 'listitem', 'aria-label': `${NAME[id]}, позиция ${p}, вес ${fmt2(w)}` },
          h('span', { class: 'pos' }, String(p)), h('span', null, NAME[id]), h('span', { class: 'wb' }, h('i', { style: `width:${(w * 100).toFixed(1)}%` })), h('span', { class: 'wv' }, fmt2(w)));
        attach(b, p); box.append(b);
      });
      const ans = $('#ordAns'), truth = NOM[r.truth];
      ans.className = 'ord-ans ' + (r.ok ? 'ok' : 'bad');
      ans.innerHTML = `Ада возьмёт первой: <b>${ACC[r.answer]}</b> — вес ${fmt2(r.answer === 'cup' ? r.wc : r.wb)} против ${fmt2(r.answer === 'cup' ? r.wb : r.wc)}. В команде первой идёт ${truth}: ${r.ok ? '<b>верно</b>.' : '<b>отказ</b>.'}`;
      const strip = $('#ordStrip'); strip.innerHTML = '';
      r.out.forEach((v, i) => { const a = Math.min(1, Math.abs(v)); strip.append(h('i', { class: i === 4 ? 'sep' : null, style: `background:${v >= 0 ? 'var(--e2e)' : 'var(--h2)'};opacity:${(0.08 + 0.92 * a).toFixed(2)}`, title: fmt2(v) })); });
      let same = '';
      if (!st.pe) { for (const [kk, v] of st.seen) { if (!v.pe && kk !== key(st.order) && E.Pos.sameOut(v.r.out, r.out)) { same = `Такой же выход был у команды «${text(v.order)}».`; break; } } }
      else same = 'С позициями выход зависит от порядка слов.';
      $('#ordSame').textContent = same;
      $('#ordFails').textContent = String(st.fails.size);
      const ol = $('#ordLog'); ol.hidden = !st.log.length; ol.innerHTML = '';
      st.log.slice(-8).forEach((l) => ol.append(h('li', { class: l.ok ? 'ok' : 'no' }, l.t)));
      $('#ordPE').checked = st.pe;
      if (task) task.update(state());
      drawPE();
    }
    const state = () => ({ pe: st.pe, pair: st.pair, fails: st.fails.size, order: st.order.slice(), diff: st.pair ? E.Pos.command(st.pair[0], true).answer !== E.Pos.command(st.pair[1], true).answer : false });
    function move(from, to) { if (from === to) return; const o = st.order.slice(), [x] = o.splice(from, 1); o.splice(to, 0, x); st.order = o; st.sel = null; render(); }
    function swap(a, b) { const o = st.order.slice(); [o[a], o[b]] = [o[b], o[a]]; st.order = o; st.sel = null; render(); }
    function attach(b, p) {
      let start = null, drag = false, centers = null, target = p;
      b.addEventListener('pointerdown', (e) => { if (e.button > 0) return; start = { x: e.clientX, y: e.clientY }; drag = false; try { b.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } });
      b.addEventListener('pointermove', (e) => {
        if (!start) return;
        if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) { drag = true; centers = $$('#ordCmd .ord-chip').map((x) => { const r = x.getBoundingClientRect(); return r.left + r.width / 2; }); b.classList.add('drag'); }
        if (!drag) return;
        b.style.transform = `translate(${e.clientX - start.x}px, ${(e.clientY - start.y) * 0.3}px)`;
        let best = 0, bd = Infinity; centers.forEach((cx, i) => { const d = Math.abs(e.clientX - cx); if (d < bd) { bd = d; best = i; } }); target = best;
        $$('#ordCmd .ord-chip').forEach((x, i) => { x.classList.toggle('drop-l', i === target && target < p); x.classList.toggle('drop-r', i === target && target > p); });
      });
      const end = () => {
        if (!start) return; const wasDrag = drag; start = null; drag = false;
        if (wasDrag) { b.style.transform = ''; move(p, target); }
        else if (st.sel == null) { st.sel = p; render(); }
        else if (st.sel === p) { st.sel = null; render(); }
        else swap(st.sel, p);
      };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', () => { start = null; drag = false; b.style.transform = ''; render(); });
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' && p > 0) { e.preventDefault(); move(p, p - 1); $$('#ordCmd .ord-chip')[p - 1].focus(); } if (e.key === 'ArrowRight' && p < 3) { e.preventDefault(); move(p, p + 1); $$('#ordCmd .ord-chip')[p + 1].focus(); } });
    }
    const NPOS = 24;
    function drawPE() {
      if (!live()) return;
      const cv = $('#peCv'), Wd = 420, { c, k } = HeroKit.fit(cv, Wd, Wd), P = pal(), pad = 30 * k, cell = (Wd - pad) / NPOS;
      c.fillStyle = P.surf; c.fillRect(0, 0, Wd, Wd);
      let lo = 1; for (let i = 0; i < NPOS; i++) for (let j = 0; j < NPOS; j++) lo = Math.min(lo, E.Pos.peSim(i, j));
      for (let i = 0; i < NPOS; i++) for (let j = 0; j < NPOS; j++) {
        const v = (E.Pos.peSim(i, j) - lo) / (1 - lo);
        c.fillStyle = P.bg; c.fillRect(pad + j * cell, pad + i * cell, cell - 0.5, cell - 0.5);
        c.fillStyle = P.e2e; c.globalAlpha = 0.04 + 0.96 * v * v; c.fillRect(pad + j * cell, pad + i * cell, cell - 0.5, cell - 0.5); c.globalAlpha = 1;
      }
      c.strokeStyle = P.ink; c.lineWidth = 2 * k; c.strokeRect(pad, pad, cell * 4, cell * 4);
      if (st.hover) { const { i, j } = st.hover; c.strokeStyle = P.ink; c.lineWidth = 1.5 * k; c.strokeRect(pad + j * cell, pad + i * cell, cell, cell); }
      for (const v of [0, 5, 10, 15, 20]) { HeroKit.label(c, k, String(v), pad + (v + 0.5) * cell, pad / 2, { px: 10, mono: true, color: P.ink3, halo: false }); HeroKit.label(c, k, String(v), pad / 2, pad + (v + 0.5) * cell, { px: 10, mono: true, color: P.ink3, halo: false }); }
      $('#peScale').style.background = `linear-gradient(90deg, ${P.bg}, ${P.e2e})`;
    }
    function init() {
      task = mountTask('#ordTask', {
        head: '#ordHead',
        title: 'Сломай порядок',
        text: 'Найди две команды, где предметы стоят в разном порядке, а Ада отвечает одинаково. Потом добавь позиции и проверь, что эти команды стали различаться.',
        criteria: [
          { label: 'Две команды с разным порядком предметов и одинаковым ответом', test: (s) => !!s.pair },
          { label: 'С позициями ответы на эти две команды разные', test: (s) => s.pe && s.diff },
        ],
        hint: 'Поменяй местами «чашку» и «миску». Смотри на веса под словами: без позиций каждое слово уносит свой вес с собой.',
        explain: () => `Без позиций каждое слово уносит свой вес с собой: перестановка не меняет ни весов слов, ни выхода внимания. Внимание само не знает порядка — в нём нет ни рекуррентности, ни свёрток. Синусоиды разных частот дают каждой позиции свой вектор, и запрос «что взять первым» теперь видит, какое слово ближе к началу. Найдено отказов без позиций: ${st.fails.size} из 12 возможных. В ACT позиции — двумерные синусоиды, в Gemma — RoPE. В статье 2017 года обученные позиции дали почти тот же результат, что синусоиды.`,
      });
      $('#ordPE').addEventListener('change', (e) => { st.pe = e.target.checked; render(); });
      $('#ordReset').addEventListener('click', () => { st.order = P0.slice(); st.sel = null; render(); });
      const cv = $('#peCv');
      const pick = (ev) => { const r = cv.getBoundingClientRect(), Wd = 420, kk = Wd / r.width, pad = 30 * kk, cell = (Wd - pad) / NPOS, x = (ev.clientX - r.left) * kk, y = (ev.clientY - r.top) * kk, j = Math.floor((x - pad) / cell), i = Math.floor((y - pad) / cell); return i >= 0 && j >= 0 && i < NPOS && j < NPOS ? { i, j } : null; };
      const show = (p) => { st.hover = p; drawPE(); $('#peOut').textContent = p ? `Позиции ${p.i} и ${p.j}: сходство кодировок ${fmt2(E.Pos.peSim(p.i, p.j))}. Чем дальше позиции друг от друга, тем меньше сходство.` : 'Каждая клетка — косинусное сходство кодировок двух позиций, 16 чисел на позицию. Наведи курсор на клетку. Рамкой отмечены позиции 0–3, на которых стоит команда.'; };
      cv.addEventListener('pointermove', (ev) => show(pick(ev)));
      cv.addEventListener('pointerdown', (ev) => show(pick(ev)));
      cv.addEventListener('pointerleave', () => show(null));
      render(); redrawOn(drawPE);
    }
    return { init, st, move, swap, setPE: (v) => { st.pe = v; render(); }, get task() { return task; } };
  })();

  /* =====================================================================
     4. Сколько стоят токены
     ===================================================================== */
  const Cost = (() => {
    const C = E.Cost, DS = [256, 512, 768, 1024, 2048, 4096];
    const st = { preset: 'pi0', cfg: C.presetCfg('pi0') };
    let task = null;
    const giga = (v) => (v >= 1e12 ? `${fmt(v / 1e12, 1)} TFLOPs` : `${fmt(v / 1e9, v >= 1e10 ? 0 : 1)} GFLOPs`);
    const ref = () => C.cost(Object.assign(C.presetCfg('pi0'), { d: st.cfg.d, L: st.cfg.L }));
    const ref0 = C.cost(C.presetCfg('pi0'));
    function sync() {
      const c = st.cfg, ri = C.RES.findIndex((r) => r.id === c.res), cut = C.CUT.find((x) => x.id === c.cut);
      $('#cImg').value = c.images; $('#cImg').nextElementSibling.textContent = String(c.images);
      $('#cRes').value = ri; $('#cRes').nextElementSibling.textContent = C.RES[ri].label;
      gate($('#cRes'), !!cut.fixed, 'При сжатии до фиксированного числа токенов разрешение не влияет');
      $('#cChunk').value = c.chunk; $('#cChunk').nextElementSibling.textContent = String(c.chunk);
      $('#cD').value = DS.indexOf(c.d); $('#cD').nextElementSibling.textContent = String(c.d);
      $('#cL').value = c.L; $('#cL').nextElementSibling.textContent = String(c.L);
      ['#cImg', '#cRes', '#cChunk', '#cD', '#cL'].forEach((s) => setRangeFill($(s)));
      $$('#cCut button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === c.cut)));
      $$('#costPresets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === st.preset)));
    }
    function draw() {
      const c = st.cfg, r = C.cost(c), R = ref(), cut = C.CUT.find((x) => x.id === c.cut), res = C.RES.find((x) => x.id === c.res);
      $('#costN').textContent = int(r.n);
      const seg = (n, cls) => (n > 0 ? `<i class="${cls}" style="flex-grow:${n}" title="${int(n)}"></i>` : '');
      setOut($('#costSeq'), seg(r.img, 'tk-img') + seg(r.oth, 'tk-txt') + seg(c.chunk, 'tk-act'));
      const how = cut.fixed ? (c.cut === 'tl8' ? 'TokenLearner' : 'сжатие') : `${res.label}, ${cut.label}`;
      const parts = [`${c.images} × ${int(r.per)} (картинки: ${how})`].concat(c.other.map((o) => `${o[1]} (${o[0]})`)).concat(c.chunk ? [`${c.chunk} (действия)`] : []);
      setOut($('#costBreak'), parts.join(' + ') + ` = <b>${int(r.n)}</b>`);
      const mx = Math.max(r.attn, r.proj, R.attn);
      setOut($('#costFlops'), `<div class="cf-row"><div class="cf-t"><span>Член внимания: растёт как n²</span><b>${giga(r.attn)}</b></div><div class="cf-bar"><i style="--c:var(--e2e);width:${(r.attn / mx * 100).toFixed(2)}%"></i><u style="left:${(R.attn / mx * 100).toFixed(2)}%"></u></div></div>` +
        `<div class="cf-row"><div class="cf-t"><span>Проекции и FFN: растут как n</span><b>${giga(r.proj)}</b></div><div class="cf-bar"><i style="--c:var(--ink-3);width:${(r.proj / mx * 100).toFixed(2)}%"></i></div></div>` +
        `<div class="cf-cap">Оценка на один проход. Доля члена внимания — ${fmt(r.share * 100, 1)} %. Пунктир — член внимания π0 с тремя камерами на той же модели: ${giga(R.attn)}.</div>`);
      setOut($('#costKv'), `KV-кэш наблюдения: <b>${fmt(r.kvBytes / 1e6, 1)} МБ</b> — ${int(r.prefix)} токенов × ${fmt(2 * c.L * 256 * 2 / 1000, 1)} КБ (одна KV-голова, d_head 256, bf16).`);
      setOut($('#costNote'), st.preset ? `${C.PRESETS[st.preset].name}: ${C.PRESETS[st.preset].note}.` : 'Своя конфигурация. Прочие токены — как в последнем выбранном пресете.');
      if (task) task.update(state());
    }
    const state = () => { const c = st.cfg, r = C.cost(c); return { images: c.images, d: c.d, L: c.L, n: r.n, attn: r.attn, refAttn: ref0.attn, chunk: c.chunk, pi0rest: c.chunk === 50 && JSON.stringify(c.other) === JSON.stringify(C.PRESETS.pi0.other) }; };
    function edit(fn) { fn(st.cfg); st.preset = null; sync(); draw(); }
    function preset(kk) { const d = st.cfg.d, L = st.cfg.L; st.cfg = Object.assign(C.presetCfg(kk), { d, L }); st.preset = kk; sync(); draw(); }
    function init() {
      C.CUT.forEach((cut) => { const b = h('button', { type: 'button', 'data-c': cut.id, 'aria-pressed': 'false' }, cut.label); b.addEventListener('click', () => edit((c) => { c.cut = cut.id; })); $('#cCut').append(b); });
      $$('#costPresets button').forEach((b) => b.addEventListener('click', () => preset(b.dataset.k)));
      $('#cImg').addEventListener('input', (e) => edit((c) => { c.images = +e.target.value; }));
      $('#cRes').addEventListener('input', (e) => edit((c) => { c.res = C.RES[+e.target.value].id; }));
      $('#cChunk').addEventListener('input', (e) => edit((c) => { c.chunk = +e.target.value; }));
      $('#cD').addEventListener('input', (e) => { st.cfg.d = DS[+e.target.value]; sync(); draw(); });
      $('#cL').addEventListener('input', (e) => { st.cfg.L = +e.target.value; sync(); draw(); });
      task = mountTask('#costTask', {
        head: '#costHead',
        title: 'Четвёртая камера для π0',
        text: 'Начни с пресета π0 и добавь четвёртую камеру. Модель не меняй: d_model 2048 и 18 слоёв. Найди способ уложиться в прежнюю стоимость внимания.',
        criteria: [
          { label: 'Четыре камеры, остальное как у π0: команда, состояние и 50 действий', test: (s) => s.images === 4 && s.pi0rest },
          { label: 'Модель та же, что у π0: d_model 2048, 18 слоёв', test: (s) => s.images === 4 && s.d === 2048 && s.L === 18 },
          { label: 'Член внимания не больше, чем у π0 с тремя камерами', test: (s) => s.images === 4 && s.attn <= s.refAttn + 1 },
        ],
        hint: 'Посмотри, как сжимают картинки RT-1 (TokenLearner, 8 токенов на кадр) и GR00T N1 (64 токена на кадр). Ещё можно взять патч крупнее. Патч 16 почти подходит, но не совсем: проверь сам.',
        explain: (s) => `Получилось ${int(s.n)} токенов вместо 867, член внимания — ${fmt(s.attn / s.refAttn * 100, 0)} % от прежнего. У PaliGemma картинка 224, 448 и 896 px даёт 256, 1024 и 4096 токенов: каждое удвоение стороны вчетверо увеличивает число токенов. OpenVLA на картинках 384 px вместо 224 обучалась в 3 раза дольше без прироста качества. Поэтому токены картинок сжимают: TokenLearner в RT-1 оставляет 8 на кадр, GR00T N1 — 64.`,
      });
      sync(); draw();
    }
    return { init, st, preset, edit, get task() { return task; } };
  })();

  /* =====================================================================
     5. Вывод π0 по блокам и лента тиков
     ===================================================================== */
  const Pi = (() => {
    const X = E.Pi0.PI0, st = { noCache: false, remote: false, sel: 'obs', cursor: null, tick: null, seenNoCache: false, found46: false, found25: false };
    let task = null;
    const NT = 75;
    let LAY = null;
    /** Раскладка ленты: на широком экране подписи слева, на узком — над дорожками. */
    function layout(cv) {
      const narrow = cv.getBoundingClientRect().width < 560;
      const L = narrow ? { TW: 380, TH: 172, X0: 8, X1: 372, mY: 22, mH: 16, rY: 66, rH: 26, tY: 112, tH: 10, aY: 134, lY: 158, lbl: [[8, 12, 'Модель'], [8, 56, 'Робот, 50 Гц'], [8, 104, 'остаток пачки']] }
        : { TW: 760, TH: 150, X0: 92, X1: 748, mY: 20, mH: 20, rY: 60, rH: 28, tY: 98, tH: 12, aY: 118, lY: 140, lbl: [[10, 30, 'Модель'], [10, 74, 'Робот, 50 Гц'], [10, 104, 'остаток пачки']] };
      L.narrow = narrow; L.tw = (L.X1 - L.X0) / NT;
      const ar = `${L.TW} / ${L.TH}`; if (cv.dataset.ar !== ar) { cv.style.aspectRatio = ar; cv.dataset.ar = ar; }
      return (LAY = L);
    }
    function blocks() {
      const b = [{ id: 'enc', ms: X.enc, name: 'Энкодеры картинок', short: 'Энкодеры', sub: '14 мс' }];
      if (!st.noCache) b.push({ id: 'obs', ms: X.obs, name: 'Проход по наблюдению', short: 'Наблюдение', sub: '32 мс · K и V в кэш' }, { id: 'flow', ms: X.flow, name: '10 шагов flow', short: 'Flow', sub: '27 мс' });
      else for (let i = 1; i <= X.steps; i++) b.push({ id: 'step', n: i, ms: X.obs + X.flow / X.steps, name: `Шаг ${i}`, short: String(i), sub: '34,7 мс' });
      if (st.remote) b.push({ id: 'net', ms: X.net, name: 'Сеть', short: 'Сеть', sub: '13 мс' });
      let t = 0; b.forEach((x) => { x.t0 = t; t += x.ms; x.t1 = t; });
      return b;
    }
    const total = () => E.Pi0.time({ noCache: st.noCache, remote: st.remote }).total;
    const INFO = {
      enc: 'Три кадра 224 × 224 проходят энкодер SigLIP: по 256 токенов на кадр, всего 768.',
      obs: 'Gemma 2B читает префикс: 768 токенов картинок и до 48 токенов команды, всего 816. Ключи и значения каждого слоя ложатся в KV-кэш — около 15 МБ (расчёт).',
      flow: 'Action expert на 300M параметров 10 раз уточняет пачку из 50 действий. В каждом шаге 51 токен: состояние и 50 действий. К наблюдению они обращаются через кэш, по блочной маске из лаборатории.',
      step: 'Без кэша каждый шаг flow заново проходит 816 токенов наблюдения (32 мс) и 51 токен действий (2,7 мс). Это наша оценка по той же схеме.',
      net: 'Если модель работает не на компьютере робота, добавляется сеть: всего 86 мс.',
    };
    function drawBar() {
      const bar = $('#piBar'), B = blocks(), T = total(), narrow = bar.getBoundingClientRect().width < 560; bar.innerHTML = '';
      B.forEach((b) => {
        const sub = narrow ? (b.id === 'step' ? '' : b.sub.split(' ·')[0]) : b.sub;
        const el = h('button', { type: 'button', class: `pi-blk ${b.id}${b.id === st.sel || (b.id === 'step' && st.sel === 'step') ? ' sel' : ''}`, style: `flex-grow:${b.ms}`, 'data-t0': b.t0, title: `${b.name}: ${fmt(b.ms, 1)} мс` }, h('b', null, narrow ? b.short : b.name), sub ? h('span', null, sub) : null);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.sel = b.id; st.cursor = b.t0; draw(); } });
        bar.append(el);
      });
      if (st.cursor != null) { const m = h('i', { class: 'pi-mark', style: `left:calc(${(st.cursor / T * 100).toFixed(3)}% - 1px)` }); bar.append(m); }
      const ax = $('#piAxis'); ax.innerHTML = '';
      const marks = [0].concat(B.filter((b) => b.id !== 'step' || b.n === X.steps).map((b) => b.t1));
      if (st.noCache) marks.splice(1, 0, X.enc);
      const uniq = [...new Set(marks.map((m) => Math.round(m * 10) / 10))], keep = [];
      uniq.forEach((m, i) => { const last = i === uniq.length - 1; while (keep.length && (m - keep[keep.length - 1]) / T < 0.09 && (last || keep.length > 1)) { if (last) keep.pop(); else return; } keep.push(m); });
      keep.forEach((m, i, a) => ax.append(h('span', { class: i === 0 ? 'l' : i === a.length - 1 ? 'r' : null, style: `left:${(m / T * 100).toFixed(2)}%` }, `${fmt(m, 0)} мс`)));
      $('#piTotal').textContent = `${fmt(T, 0)} мс`;
      const blk = B.find((b) => b.id === st.sel) || B[0];
      $('#piInfo').innerHTML = `<b>${blk.name}, ${fmt(blk.ms, 1)} мс.</b> ${INFO[blk.id]}`;
      let cur = '';
      if (st.cursor != null) {
        const t = st.cursor, inb = B.find((b) => t >= b.t0 - 1e-9 && t < b.t1 - 1e-9) || B[B.length - 1];
        if (!st.noCache && Math.abs(t - (X.enc + X.obs)) < 1e-6) cur = `<b>${fmt(t, 0)} мс</b> — начинается первый шаг flow. До него энкодеры (14 мс) и проход по наблюдению (32 мс).`;
        else if (Math.abs(t - T) < 1e-6) cur = `<b>${fmt(t, 0)} мс</b> — пачка из 50 действий готова.`;
        else if (Math.abs(t) < 1e-6) cur = '<b>0 мс</b> — кадры пришли с камер.';
        else cur = `<b>${fmt(t, 0)} мс</b> — идёт блок «${inb.name}».`;
      }
      $('#piCursor').innerHTML = cur;
    }
    function drawTape() {
      if (!live()) return;
      const cv = $('#piTape'), L = layout(cv), { c, k } = HeroKit.fit(cv, L.TW, L.TH), P = pal(), T = total(), tw = L.tw;
      c.fillStyle = P.surf; c.fillRect(0, 0, L.TW, L.TH);
      const CH = [css('--tk-act'), css('--tk-img'), css('--tk-txt')];
      L.lbl.forEach(([x, y, t], i) => HeroKit.label(c, k, t, x * (L.narrow ? 1 : k), y, { align: 'left', px: i === 2 ? 10.5 : 12, weight: i === 2 ? 600 : 700, color: i === 2 ? P.ink3 : P.ink2, halo: false }));
      for (let ch = 0; ch < 3; ch++) {
        const x = L.X0 + ch * X.exec * tw, wv = Math.max(2, T / 20 * tw);
        c.fillStyle = P.ink; c.globalAlpha = 0.85; c.fillRect(x, L.mY, wv, L.mH); c.globalAlpha = 1;
        if (!L.narrow || ch === 0) HeroKit.label(c, k, L.narrow ? `${fmt(T, 0)} мс` : `вывод ${fmt(T, 0)} мс`, x + wv + 5 * k, L.mY + L.mH / 2, { align: 'left', px: 11, mono: true, color: P.ink2, haloColor: P.surf });
      }
      for (let i = 0; i < NT; i++) {
        const ch = Math.floor(i / X.exec), x = L.X0 + i * tw;
        c.fillStyle = CH[ch % 3]; c.fillRect(x + (L.narrow ? 0.25 : 0.5), L.rY, tw - (L.narrow ? 0.5 : 1), L.rH);
        if (i % X.exec === 0) { c.fillStyle = P.ink; c.fillRect(x - 1, L.rY - 6, 2, L.rH + 12); }
      }
      for (let ch = 0; ch < 3; ch++) {
        const x = L.X0 + (ch + 1) * X.exec * tw, w = Math.min(X.chunk - X.exec, NT - (ch + 1) * X.exec) * tw;
        if (w <= 0) continue;
        c.fillStyle = CH[ch % 3]; c.globalAlpha = 0.28; c.fillRect(x, L.tY, w, L.tH); c.globalAlpha = 1;
      }
      if (st.tick != null) { const x = L.X0 + st.tick * tw; c.strokeStyle = P.ink; c.lineWidth = 2.5 * k; c.strokeRect(x - 1, L.rY - 3, tw + 2, L.rH + 6); }
      c.strokeStyle = P.line2; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i <= NT; i += 5) { const x = L.X0 + i * tw; c.moveTo(x, L.aY); c.lineTo(x, i % 25 === 0 ? L.aY + 10 : L.aY + 5); } c.stroke();
      [[0, '0 с'], [25, '0,5 с'], [50, '1 с'], [75, '1,5 с']].forEach(([i, t], j) => HeroKit.label(c, k, t, L.X0 + i * tw, L.lY, { px: 11, mono: true, color: P.ink3, halo: false, align: j === 3 ? 'right' : j === 0 ? 'left' : 'center' }));
    }
    function tickText() {
      if (st.tick == null) return 'Нажми на тик, чтобы узнать, какое действие робот исполняет в этот момент.';
      const i = st.tick, ch = Math.floor(i / X.exec), a = i % X.exec + 1, t = i * 0.02;
      const s = `Тик ${i} · ${fmtF(t, 2)} с · пачка ${ch + 1}, действие ${a} из ${X.chunk}.`;
      return i % X.exec === 0 && i > 0 ? `${s} Модель запущена снова: робот переходит на новую пачку, остальные 25 действий старой не исполняются.` : i === 0 ? `${s} Первый запуск модели.` : s;
    }
    function draw() { drawBar(); drawTape(); $('#piTick').textContent = tickText(); if (task) { gate($('#piNoCache'), task.bet === undefined, 'Сначала сделай ставку'); task.update(state()); } }
    const state = () => { if (!st.noCache && st.cursor === 46) st.found46 = true; if (st.tick === 25 || st.tick === 50) st.found25 = true; return { cursor: st.cursor, noCache: st.noCache, tick: st.tick, seenNoCache: st.seenNoCache, found46: st.found46, found25: st.found25 }; };
    function setCursorFromX(clientX) {
      const bar = $('#piBar'), r = bar.getBoundingClientRect(), T = total();
      let t = Math.max(0, Math.min(T, (clientX - r.left) / r.width * T));
      const B = blocks(), bounds = [0].concat(B.map((b) => b.t1)); let best = null, bd = T * 0.035;
      bounds.forEach((b) => { if (Math.abs(b - t) < bd) { bd = Math.abs(b - t); best = b; } });
      if (best != null) t = best;
      st.cursor = Math.round(t * 10) / 10;
      const inb = B.find((b) => st.cursor >= b.t0 - 1e-9 && st.cursor < b.t1 - 1e-9) || B[B.length - 1]; st.sel = inb.id;
      draw();
    }
    function init() {
      task = mountTask('#piTask', {
        head: '#piHead',
        title: 'Куда уходят 73 мс',
        text: 'Сделай ставку про кэш, потом найди на схеме и на ленте два момента.',
        bet: { q: 'что станет с выводом без KV-кэша?', options: ['Почти не изменится', 'Станет вдвое дольше', 'Станет раз в пять дольше'], answer: 2 },
        onBet: () => draw(),
        criteria: [
          { label: 'На полосе найден момент, когда начинается первый шаг flow', test: (s) => s.found46 },
          { label: 'На ленте найден тик, где запускается новая пачка', test: (s) => s.found25 },
          { label: 'Вывод без KV-кэша посмотрен', test: (s) => s.seenNoCache },
        ],
        hint: 'Нажми на полосу у границы между проходом по наблюдению и шагами flow — курсор прилипнет к ней. На ленте ищи тик, где меняется цвет.',
        explain: () => 'До первого шага flow проходит 46 мс из 73: энкодеры картинок (14 мс) и проход по наблюдению (32 мс). Дальше 10 шагов flow по 51 токену читают готовые K и V префикса и занимают 27 мс на все шаги. Без кэша каждый шаг заново проходил бы 816 токенов наблюдения: по нашей оценке, 361 мс, впятеро дольше. Новая пачка запускается каждые 25 тиков, то есть раз в 0,5 с, а действие робот получает каждые 20 мс. Поэтому частота управления — 50 Гц — не равна частоте вывода: модель вызывают дважды в секунду.',
      });
      $('#piBar').addEventListener('click', (e) => setCursorFromX(e.clientX));
      $('#piNoCache').addEventListener('change', (e) => { st.noCache = e.target.checked; if (st.noCache) { st.seenNoCache = true; task.resolveBet(); } st.cursor = null; st.sel = st.noCache ? 'step' : 'obs'; draw(); });
      $('#piRemote').addEventListener('change', (e) => { st.remote = e.target.checked; st.cursor = null; draw(); });
      $('#piTape').addEventListener('click', (e) => { const cv = e.currentTarget, r = cv.getBoundingClientRect(), L = LAY || layout(cv), x = (e.clientX - r.left) / r.width * L.TW, i = Math.floor((x - L.X0) / L.tw); if (i >= 0 && i < NT) { st.tick = i; draw(); } });
      legend('#piLegend', [['пачки 1, 2 и 3: действия, которые исполняет робот', css('--tk-act'), 'box'], ['вывод модели', css('--ink'), 'box'], ['бледным — конец пачки, который не исполняют', 'color-mix(in srgb, var(--tk-act) 30%, transparent)', 'box']]);
      draw(); redrawOn(() => { draw(); legend('#piLegend', [['пачки 1, 2 и 3: действия, которые исполняет робот', css('--tk-act'), 'box'], ['вывод модели', css('--ink'), 'box'], ['бледным — конец пачки, который не исполняют', 'color-mix(in srgb, var(--tk-act) 30%, transparent)', 'box']]); });
    }
    /** Доля ширины и высоты канваса, где лежит тик i (для автотестов). */
    const tapePt = (i) => { const L = LAY || layout($('#piTape')); return { fx: (L.X0 + (i + 0.5) * L.tw) / L.TW, fy: (L.rY + L.rH / 2) / L.TH }; };
    return { init, st, setCursorFromX, draw, get task() { return task; }, tapePt };
  })();

  /* =====================================================================
     6. Сортировка: как модели выдают действия
     ===================================================================== */
  function initSort() {
    return Cards.sort('#modelSort', {
      targets: [
        { id: 'ar', label: 'Токен за токеном', note: 'действие — строка токенов, как текст' },
        { id: 'one', label: 'Вся пачка за один проход', note: 'декодер выдаёт все действия сразу' },
        { id: 'flow', label: 'Несколько шагов диффузии или flow', note: 'пачку уточняют из шума за несколько шагов' },
      ],
      items: [
        { id: 'rt2', label: 'RT-2', target: 'ar', why: 'Действие — строка из 8 целых, по 256 бинов на измерение; модель пишет её токен за токеном.' },
        { id: 'ovla', label: 'OpenVLA', target: 'ar', why: '7 измерений по 256 бинов, авторегрессия на Llama 2.' },
        { id: 'fast', label: 'π0-FAST', target: 'ar', why: '30–60 токенов действий 2B-модель декодирует по одному.' },
        { id: 'act', label: 'ACT', target: 'one', why: '100 фиксированных запросов в декодере дают всю пачку 100 × 14 за один проход.' },
        { id: 'octo', label: 'Octo', target: 'flow', why: 'Readout-токены передают признаки диффузионной голове, она выдаёт пачку.' },
        { id: 'pi0', label: 'π0', target: 'flow', why: '50 токенов действий через action expert, 10 шагов flow matching.' },
        { id: 'groot', label: 'GR00T N1', target: 'flow', why: '16 действий за 4 шага flow matching: DiT с cross-attention к VLM.' },
      ],
      after: 'Способ выдачи решает, сколько проходов модели нужно на пачку. π0-FAST тратит на пачку около 750 мс против ~100 мс у π0: токены действий декодируются по одному.',
    });
  }

  /* =====================================================================
     7. Квиз
     ===================================================================== */
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
      { q: 'Внимание само знает порядок токенов?', o: ['Да: порядок виден по тому, где стоит токен', 'Нет: без позиционных кодировок перестановка токенов не меняет ответ', 'Знает, но только для текста'], a: 1, e: 'В модели нет ни рекуррентности, ни свёрток, поэтому позиции добавляют явно. В ACT это двумерные синусоиды, в Decision Transformer — эмбеддинг шага, в Gemma — RoPE.' },
      { q: 'Деление на √d_k — косметика?', o: ['Да, оно лишь меняет масштаб оценок', 'Нет: без него дисперсия q·k растёт как d_k, softmax насыщается и градиенты почти пропадают', 'Оно нужно только при маленьком d_k'], a: 1, e: 'В лаборатории при d_k = 256 без деления весь вес уходил одному предмету. Деление на 16 вернуло оценки в рабочий диапазон.' },
      { q: 'Восемь голов внимания в восемь раз дороже одной?', o: ['Да', 'Нет: при d_k = d_model/h стоимость близка к одной голове полной размерности', 'Нет: головы ничего не стоят'], a: 1, e: 'Каждая голова работает в пространстве шириной d_model/h. Головы смотрят на разные признаки, как «цвет» и «место» в лаборатории, а стоят вместе почти как одна.' },
      { q: 'Весь трансформер дорожает квадратично с числом токенов?', o: ['Да', 'Нет: квадратичен только член внимания, проекции и FFN растут линейно', 'Нет: FlashAttention делает всё линейным'], a: 1, e: 'По Vaswani, self-attention дешевле рекуррентного слоя, пока n < d. У π0 n ≈ 870 при d_model 2048 (расчёт). FlashAttention квадратичность FLOPs не убирает: он экономит обращения к памяти.' },
      { q: 'KV-кэш ускоряет обучение и первый проход?', o: ['Да', 'Нет: он работает только на выводе и избавляет от пересчёта уже обработанных токенов', 'Он уменьшает число параметров модели'], a: 1, e: 'Проход по наблюдению у π0 так и стоит 32 мс, а вместе с энкодерами — 46. Выигрыш в том, что наблюдение считается один раз на 10 шагов flow.' },
      { q: 'VLA генерирует действия токен за токеном, как текст?', o: ['Да, все VLA', 'Так делают RT-2, OpenVLA и π0-FAST; ACT выдаёт пачку за один проход, π0 и GR00T — за несколько шагов flow matching', 'Так не делает никто'], a: 1, e: 'Поэтому π0-FAST тратит на пачку около 750 мс, а π0 — около 100 мс.' },
      { q: 'Частота управления равна частоте вывода модели?', o: ['Да', 'Нет: π0 даёт 50 Гц при выводе 73 мс за счёт пачек', 'Да, если есть KV-кэш'], a: 1, e: 'Модель выдаёт 50 действий и перезапускается раз в 0,5 с. Helix и GR00T разделяют медленную VLM (7–10 Гц) и быструю политику (120–200 Гц).' },
      { q: 'Трансформер всегда лучше свёрточной сети?', o: ['Да', 'Нет: в RT-1, ACT и S1 Helix картинки кодирует CNN, а в Octo ResNet лучше ViT при обучении с нуля на малых данных', 'Нет: CNN всегда лучше'], a: 1, e: 'ViT уступает ResNet на ImageNet без сильной регуляризации и догоняет лучшие модели только на 14–300 млн картинок.' },
    ], '#quizScore');
  }

  (function boot() {
    const mis = {};
    const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
    const start = () => {
      safe('theme', initTheme); safe('nav', initNav);
      safe('tok', () => Tok.init()); safe('att', () => { mis.att = Att.init(); }); safe('ord', () => Ord.init());
      safe('cost', () => Cost.init()); safe('pi', () => Pi.init()); safe('sort', () => { mis.sort = initSort(); }); safe('quiz', initQuiz);
      window.__l16 = { mis, SPEED, Tok, Att, Ord, Cost, Pi, E }; window.__lessonReady = true;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();
})();
