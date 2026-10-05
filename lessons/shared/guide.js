/* =====================================================================
   shared/guide.js — пошаговый сценарий лаборатории.
   Шаги идут по одному: задача, при необходимости прогноз, ровно одна
   главная кнопка, разбор результата и «Следующий шаг». Как в разминке.
   Шаг: { short, title, text, predict?: {q, options[]}, go, run(api, ctx),
          explain(result, ctx) → html, after?(api, result), retry?, final? }
   opts: { scene? — селектор сцены, которую показать при запуске шага (по умолчанию canvas в .lab) }
   ===================================================================== */
'use strict';
window.Guide = (function () {
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function mount(root, steps, api, opts) {
    opts = opts || {};
    if (typeof root === 'string') root = document.querySelector(root);
    const ctx = { results: [], preds: [], local: steps.map(() => ({})) };
    let i = 0, busy = false;
    const pills = el('ol', 'g-steps'), card = el('div', 'g-card'), foot = el('div', 'g-foot');
    steps.forEach((s, k) => { const li = el('li', null, `<b>${k + 1}</b><span></span>`); li.querySelector('span').textContent = s.short; pills.append(li); });
    const restart = el('button', 'g-restart', 'Начать лабораторию заново'); restart.type = 'button';
    restart.addEventListener('click', () => { if (busy) return; api.reset(); ctx.results = []; ctx.preds = []; ctx.local = steps.map(() => ({})); i = 0; render(); });
    foot.append(restart);
    root.innerHTML = ''; root.append(pills, card, foot);
    // Сцена лаборатории: на телефоне она стоит над карточкой шагов и при запуске шага может быть за экраном.
    const lab = root.closest('.lab'), scene = opts.scene ? document.querySelector(opts.scene) : lab && lab.querySelector('canvas');
    function showScene() {
      if (!scene) return; const r = scene.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) scene.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }

    function render() {
      const s = steps[i];
      [...pills.children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'cur' : ''; });
      card.innerHTML = '';
      card.append(el('div', 'g-kicker', `Шаг ${i + 1} из ${steps.length}`));
      const h = el('h3'); h.textContent = s.title; card.append(h);
      const p = el('p', 'g-text'); p.innerHTML = s.text; card.append(p);
      if (s.predict) {
        const box = el('div', 'g-pred'), q = el('div', 'q'); q.textContent = s.predict.q; box.append(q);
        const row = el('div', 'opts');
        s.predict.options.forEach((o) => {
          const b = el('button', 'btn sm'); b.type = 'button'; b.textContent = o; b.setAttribute('aria-pressed', String(ctx.preds[i] === o));
          b.addEventListener('click', () => { if (busy || ctx.results[i] !== undefined) return; ctx.preds[i] = o; [...row.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); go.disabled = false; });
          row.append(b);
        });
        box.append(row); card.append(box);
      }
      const go = el('button', 'btn primary g-go'); go.type = 'button'; go.textContent = s.go;
      if (s.predict && !ctx.preds[i]) { go.disabled = true; go.title = 'Сначала сделай прогноз'; }
      const hint = el('div', 'g-hint'); if (s.predict && !ctx.preds[i]) hint.textContent = 'Сначала выбери прогноз.';
      const out = el('div', 'g-out'); out.hidden = true;
      const nav = el('div', 'g-nav');
      const next = el('button', 'btn g-next'); next.type = 'button'; next.textContent = i < steps.length - 1 ? 'Следующий шаг →' : 'Готово'; next.hidden = true;
      next.addEventListener('click', () => { if (i < steps.length - 1) { i++; render(); if (opts.onStep) opts.onStep(i); } });
      if (s.optional && i < steps.length - 1) { const skip = el('button', 'g-skip', 'Пропустить шаг'); skip.type = 'button'; skip.addEventListener('click', () => { if (busy) return; i++; render(); }); nav.append(skip); }
      nav.prepend(next);
      go.addEventListener('click', async () => {
        if (busy) return; busy = true; go.disabled = true; const label = go.textContent; go.textContent = 'Выполняется…'; hint.textContent = '';
        showScene();
        try {
          const r = await s.run(api, Object.assign(ctx, { step: i, local: ctx.local, me: ctx.local[i] }));
          ctx.results[i] = r;
          if (s.after) s.after(api, r);
          const html = s.explain ? s.explain(r, ctx) : '';
          if (html) { out.innerHTML = html; out.hidden = false; }
          if (s.final) { go.hidden = true; } else if (s.retry) { go.textContent = s.retryLabel || 'Ещё раз'; go.disabled = false; } else go.hidden = true;
          next.hidden = s.final;
        } catch (e) { console.error(e); out.textContent = 'Что-то пошло не так. Попробуй ещё раз.'; out.hidden = false; go.textContent = label; go.disabled = false; }
        busy = false;
      });
      card.append(go, hint, out, nav);
    }
    render();
    return { goto: (k) => { i = Math.max(0, Math.min(steps.length - 1, k)); render(); }, get index() { return i; }, ctx };
  }
  return { mount };
})();
