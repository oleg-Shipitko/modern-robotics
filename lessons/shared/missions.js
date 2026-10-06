/* =====================================================================
   shared/missions.js — миссии на живой сцене.
   Сцена и нужные ручки видны сразу. Миссия — задача с целью: критерии
   ✓/✗ проверяются вживую, ставка на исход до запуска, подсказка, разбор
   после успеха, затем следующая миссия. Ручки появляются постепенно.

   Миссия: {
     short, title, text,                      — подпись в полоске, заголовок, задача (html)
     controls?: ['kp', 'kd'] | 'all',         — какие ручки из opts.controls видны в этой миссии
     bet?: { q, options[], answer(result, ctx) → индекс верного варианта },
     action?: { label, run(api, ctx) → Promise<result> },  — главная кнопка (можно жать много раз)
     criteria?: [{ label, test(result, state, ctx) → bool }],
     summary?(result) → строка для журнала попыток,
     explain?(result, ctx) → html после успеха,
     fail?(result, ctx) → html, если попытка не прошла критерии,
     hint?: html,
     onEnter?(api, ctx), final?: true          — свободный режим в конце
   }
   С действием критерии проверяются после каждого запуска по его результату.
   Без действия — вживую: лаборатория зовёт ctl.update() при любом изменении.
   api: { reset(), state?() } + всё, что нужно действиям.

   Карточка состоит из двух частей: .m-top (полоска миссий, цель, ставка) и
   .m-bottom (критерии, запуск, итог). На широком экране они идут подряд
   рядом со сценой. В одну колонку (телефон) lab.css ставит .m-top над
   сценой, а .m-bottom — под ней: задачу читают, действуют на сцене и
   смотрят итог сверху вниз, не листая обратно.
   ===================================================================== */
'use strict';
window.Missions = (function () {
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function mount(root, missions, api, opts) {
    opts = opts || {};
    if (typeof root === 'string') root = document.querySelector(root);
    const ctx = { results: [], bets: [], done: [], step: 0, data: {} };
    let i = 0, busy = false, reached = 0, view = null;
    const pills = el('ol', 'g-steps m-steps'), card = el('div', 'm-card'), foot = el('div', 'g-foot');
    missions.forEach((m, k) => {
      const li = el('li', null, `<b>${k + 1}</b><span></span>`); li.querySelector('span').textContent = m.short;
      li.addEventListener('click', () => { if (!busy && k <= reached && k !== i) go(k); });
      pills.append(li);
    });
    const restart = el('button', 'g-restart', 'Начать заново'); restart.type = 'button';
    restart.addEventListener('click', () => { if (busy) return; api.reset(); ctx.results = []; ctx.bets = []; ctx.done = []; ctx.data = {}; reached = 0; go(0); revealTop(); });
    foot.append(restart);
    root.innerHTML = ''; root.append(card);
    const gcard = root.parentElement; if (gcard && gcard.classList.contains('guide-card')) gcard.classList.add('m-split'); // разрешает раскладку вокруг сцены в lab.css
    // В раскладке в одну колонку условие стоит над сценой: после «Следующая миссия» и «Начать заново» поднимаемся к нему
    function revealTop() {
      if (!view || !view.top || getComputedStyle(card).display !== 'contents') return;
      if (view.top.getBoundingClientRect().top < 64) view.top.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    const lab = root.closest('.lab'), scene = opts.scene ? document.querySelector(opts.scene) : lab && lab.querySelector('canvas');
    function showScene() {
      if (!scene) return; const r = scene.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) scene.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    let shown = new Set();
    function applyControls(m) {
      if (!opts.controls) return;
      const keys = Object.keys(opts.controls), want = m.controls === 'all' || m.final ? keys : (m.controls || []);
      for (const key of keys) {
        const e = typeof opts.controls[key] === 'string' ? document.querySelector(opts.controls[key]) : opts.controls[key]; if (!e) continue;
        const vis = want.includes(key); e.hidden = !vis;
        e.classList.toggle('m-fresh', vis && !shown.has(key)); if (vis) shown.add(key);
      }
    }
    // Анонимная статистика (shared/stats.js): миссия открыта, пройдена и с какого запуска
    // «seen» первой миссии — только когда лаборатория показалась на экране, а не при загрузке страницы
    const stat = (k, what) => { if (window.MRStats) window.MRStats.ev(`mis:${root.id || 'm'}:${k}:${what}`); };
    let onScreen = !('IntersectionObserver' in window);
    if (!onScreen) {
      const io = new IntersectionObserver((list) => { if (list.some((e) => e.isIntersecting)) { onScreen = true; stat(i, 'seen'); io.disconnect(); } }, { rootMargin: '0px 0px -40% 0px' });
      io.observe(root.closest('.lab') || root); // у корня на телефоне нет своей рамки (display: contents), смотрим на лабораторию
    }
    function go(k) { i = k; ctx.step = k; render(); if (onScreen) stat(k, 'seen'); const m = missions[i]; if (m.onEnter) m.onEnter(api, ctx); if (opts.onStep) opts.onStep(i); evaluate(); }
    function render() {
      const m = missions[i];
      [...pills.children].forEach((li, k) => { li.className = (ctx.done[k] ? 'done' : '') + (k === i ? ' cur' : '') + (k <= reached ? ' open' : ''); });
      applyControls(m);
      card.innerHTML = '';
      const top = el('div', 'm-top'), bottom = el('div', 'm-bottom');
      top.append(pills, el('div', 'g-kicker', m.final ? 'Свободный режим' : `Миссия ${i + 1} из ${missions.length}`));
      const h = el('h3'); h.textContent = m.title; top.append(h);
      top.append(el('p', 'g-text', m.text));
      view = { m, betBtns: [], crit: [], log: null, act: null, out: null, next: null, hint: null, top };
      if (m.bet) {
        const box = el('div', 'g-pred m-bet'), q = el('div', 'q'); q.textContent = 'Ставка: ' + m.bet.q; box.append(q);
        const row = el('div', 'opts');
        m.bet.options.forEach((o, k) => {
          const b = el('button', 'btn sm'); b.type = 'button'; b.textContent = o; b.setAttribute('aria-pressed', String(ctx.bets[i] === k));
          b.addEventListener('click', () => { if (busy || ctx.results[i] !== undefined) return; ctx.bets[i] = k; view.betBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === k))); if (view.act) { view.act.disabled = false; view.act.title = ''; } });
          row.append(b); view.betBtns.push(b);
        });
        box.append(row); top.append(box);
      }
      if (m.criteria && m.criteria.length) {
        const ul = el('ul', 'm-crit' + (m.action ? '' : ' live')); // в живых миссиях невыполненное — нейтральная точка, а не красный ✗
        m.criteria.forEach((c) => { const li = el('li', 'wait'); li.innerHTML = `<i aria-hidden="true"></i><span></span>`; li.querySelector('span').innerHTML = c.label; ul.append(li); view.crit.push(li); });
        bottom.append(ul);
      }
      if (m.action) {
        const b = el('button', 'btn primary g-go'); b.type = 'button'; b.textContent = m.action.label; view.act = b;
        if (m.bet && ctx.bets[i] === undefined) { b.disabled = true; b.title = 'Сначала сделай ставку'; }
        b.addEventListener('click', () => run());
        bottom.append(b);
      }
      view.log = el('ol', 'm-log'); view.log.hidden = true; bottom.append(view.log);
      (ctx.data['log' + i] || []).forEach((t) => addLog(t, true));
      if (m.hint) { const d = el('details', 'm-hint'); d.innerHTML = `<summary>Подсказка</summary><div>${m.hint}</div>`; bottom.append(d); view.hint = d; }
      view.out = el('div', 'g-out'); view.out.hidden = true; bottom.append(view.out);
      const nav = el('div', 'g-nav'); view.next = el('button', 'btn g-next'); view.next.type = 'button';
      view.next.textContent = i < missions.length - 1 ? (missions[i + 1].final ? 'Свободный режим →' : 'Следующая миссия →') : 'Готово';
      view.next.hidden = true; view.next.addEventListener('click', () => { if (i < missions.length - 1) { go(i + 1); revealTop(); } });
      nav.append(view.next); bottom.append(nav, foot);
      card.append(top, bottom);
      if (ctx.done[i]) showDone(ctx.results[i], true);
    }
    function addLog(text, silent) { if (!view.log) return; view.log.hidden = false; const li = el('li', text.ok ? 'ok' : 'no'); li.textContent = text.t; view.log.append(li); if (!silent) (ctx.data['log' + i] = ctx.data['log' + i] || []).push(text); }
    async function run() {
      const m = missions[i]; if (busy || !m.action) return;
      if (m.bet && ctx.bets[i] === undefined) return;
      ctx.data['runs' + i] = (ctx.data['runs' + i] || 0) + 1;
      busy = true; root.classList.add('m-busy'); view.act.disabled = true; const label = view.act.textContent; view.act.textContent = 'Выполняется…'; view.out.hidden = true;
      showScene();
      try {
        const r = await m.action.run(api, ctx);
        const firstRun = ctx.results[i] === undefined;
        if (m.bet && firstRun) markBet(r);
        ctx.results[i] = r;
        const st = api.state ? api.state() : null;
        const ok = check(r, st);
        if (m.summary) addLog({ t: m.summary(r), ok });
        if (ok) showDone(r);
        else if (m.fail) { view.out.innerHTML = m.fail(r, ctx); view.out.hidden = false; view.out.className = 'g-out m-fail'; }
      } catch (e) { console.error(e); view.out.textContent = 'Что-то пошло не так. Попробуй ещё раз.'; view.out.hidden = false; }
      busy = false; root.classList.remove('m-busy');
      if (view.act && !ctx.done[i]) { view.act.textContent = label; view.act.disabled = false; }
      else if (view.act) { view.act.textContent = label; view.act.disabled = false; }
    }
    function markBet(r) {
      const m = missions[i], right = m.bet.answer(r, ctx), mine = ctx.bets[i];
      view.betBtns.forEach((b, k) => { b.classList.toggle('bet-right', k === right); b.classList.toggle('bet-wrong', k === mine && k !== right); });
      ctx.data['betOk' + i] = mine === right;
    }
    function check(r, st) {
      const m = missions[i]; if (!m.criteria || !m.criteria.length) return true;
      let all = true;
      m.criteria.forEach((c, k) => { let ok = false; try { ok = !!c.test(r, st, ctx); } catch (e) { ok = false; } all = all && ok; view.crit[k].className = ok ? 'ok' : 'no'; });
      return all;
    }
    function evaluate() {
      const m = missions[i]; if (busy || m.action || m.final || ctx.done[i] || !m.criteria) return;
      const st = api.state ? api.state() : null;
      if (check(null, st)) { ctx.results[i] = st; showDone(st); }
    }
    function showDone(r, restore) {
      const m = missions[i];
      ctx.done[i] = true; reached = Math.max(reached, Math.min(missions.length - 1, i + 1));
      [...pills.children].forEach((li, k) => { li.className = (ctx.done[k] ? 'done' : '') + (k === i ? ' cur' : '') + (k <= reached ? ' open' : ''); });
      if (m.criteria) view.crit.forEach((li) => { li.className = 'ok'; });
      if (m.bet && ctx.bets[i] !== undefined && restore) markBet(r);
      let html = m.explain ? m.explain(r, ctx) : '';
      if (m.bet && ctx.data['betOk' + i] !== undefined) html = (ctx.data['betOk' + i] ? '<b>Ставка сыграла.</b> ' : '<b>Ставка не сыграла.</b> ') + html;
      if (html) { view.out.innerHTML = html; view.out.hidden = false; view.out.className = 'g-out m-win'; }
      view.next.hidden = !!m.final || i === missions.length - 1;
      if (!restore) { stat(i, 'done'); if (m.action) stat(i, 'r' + Math.min(ctx.data['runs' + i] || 1, 5)); }
      if (!restore && opts.onDone) opts.onDone(i, r);
    }
    go(0);
    return { update: evaluate, goto: (k) => go(Math.max(0, Math.min(missions.length - 1, k))), get index() { return i; }, ctx, get busy() { return busy; } };
  }
  return { mount };
})();
