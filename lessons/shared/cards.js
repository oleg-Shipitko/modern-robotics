/* =====================================================================
   shared/cards.js — разложи карточки по корзинам.
   Перетаскивание мышью и пальцем, а для клавиатуры и на всякий случай —
   «нажми карточку, потом корзину». «Проверить» отмечает каждую карточку
   ✓/✗ и показывает разбор ошибок. После проверки с ошибками «Переложить
   ошибочные» оставляет верные карточки на месте (они закреплены), возвращает
   неверные в набор и даёт проверить снова; разбор ошибок остаётся на экране.
   Cards.sort(root, { items: [{ id, label, sub?, target, why }], targets: [{ id, label, note? }],
                      checkLabel?, onCheck?(score, total) })
   Подходит и для «расставь по шкале»: корзины — интервалы шкалы.
   ===================================================================== */
'use strict';
window.Cards = (function () {
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sort(root, spec) {
    if (typeof root === 'string') root = document.querySelector(root);
    root.innerHTML = ''; root.classList.add('c-sort');
    const pool = el('div', 'c-pool'), zones = el('div', 'c-zones'), bar = el('div', 'c-bar'), out = el('div', 'c-out');
    const cards = {}, zoneBody = {}, locked = new Set(); let sel = null, checked = false;   // locked — верные карточки после «Переложить ошибочные»
    pool.append(el('div', 'c-pool-h', 'Карточки'));
    const poolBody = el('div', 'c-body'); pool.append(poolBody);
    spec.targets.forEach((t) => {
      const z = el('div', 'c-zone'); z.dataset.zone = t.id;
      const hd = el('div', 'c-zone-h'); hd.textContent = t.label; z.append(hd);
      if (t.note) z.append(el('div', 'c-zone-n', t.note));
      const body = el('div', 'c-body'); body.dataset.zone = t.id; z.append(body); zoneBody[t.id] = body;
      z.addEventListener('click', (e) => { if (e.target.closest('.c-card')) return; if (sel) { place(sel, t.id); select(null); } });
      zones.append(z);
    });
    poolBody.dataset.zone = '';
    pool.addEventListener('click', (e) => { if (e.target.closest('.c-card')) return; if (sel) { place(sel, null); select(null); } });
    spec.items.forEach((it) => {
      const c = el('button', 'c-card'); c.type = 'button'; c.dataset.id = it.id; cards[it.id] = c;
      // sub — пояснение на карточке под названием: что о предмете нужно знать, чтобы разложить его
      if (it.sub) { const b = el('b', 'c-name'), sm = el('small', 'c-sub'); b.textContent = it.label; sm.textContent = it.sub; c.append(b, sm); c.classList.add('c-desc'); } else c.textContent = it.label;
      attachDrag(c, it.id); poolBody.append(c);
    });
    const checkBtn = el('button', 'btn primary sm', spec.checkLabel || 'Проверить'); checkBtn.type = 'button'; checkBtn.disabled = true;
    const redoBtn = el('button', 'btn sm', 'Переложить ошибочные'); redoBtn.type = 'button'; redoBtn.hidden = true;
    const resetBtn = el('button', 'btn sm', 'Начать заново'); resetBtn.type = 'button';
    const status = el('span', 'muted-s');
    bar.append(checkBtn, redoBtn, resetBtn, status);
    root.append(pool, zones, bar, out);
    function placed() { return spec.items.filter((it) => cards[it.id].parentElement !== poolBody).length; }
    function refresh() {
      const n = placed(), N = spec.items.length; checkBtn.disabled = n < N || checked;
      status.textContent = checked ? '' : n < N ? (locked.size ? `Верные карточки закреплены, переложи остальные: ${n - locked.size} из ${N - locked.size}` : `Разложено ${n} из ${N}`) : 'Всё разложено — можно проверять';
      pool.classList.toggle('c-empty', n === N);
    }
    function place(id, zone) {
      if (checked || locked.has(id)) return;
      const c = cards[id]; (zone ? zoneBody[zone] : poolBody).append(c); refresh();
    }
    function select(id) { sel = id; Object.values(cards).forEach((c) => c.classList.toggle('c-sel', c.dataset.id === id)); root.classList.toggle('c-selecting', !!id); }
    function attachDrag(c, id) {
      let start = null, drag = false, ghost = null;
      c.addEventListener('pointerdown', (e) => { if (checked || locked.has(id) || e.button > 0) return; start = { x: e.clientX, y: e.clientY }; drag = false; try { c.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } });
      c.addEventListener('pointermove', (e) => {
        if (!start) return;
        if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
          drag = true; const r = c.getBoundingClientRect();
          ghost = c.cloneNode(true); ghost.classList.add('c-ghost'); ghost.style.width = r.width + 'px'; document.body.append(ghost);
          c.classList.add('c-dragging'); start.dx = start.x - r.left; start.dy = start.y - r.top;
        }
        if (drag) {
          ghost.style.transform = `translate(${e.clientX - start.dx}px, ${e.clientY - start.dy}px)`;
          const under = document.elementFromPoint(e.clientX, e.clientY), z = under && under.closest('.c-zone, .c-pool');
          root.querySelectorAll('.c-over').forEach((x) => x.classList.remove('c-over')); if (z && root.contains(z)) z.classList.add('c-over');
        }
      });
      const end = (e) => {
        if (!start) return;
        if (drag) {
          const under = document.elementFromPoint(e.clientX, e.clientY), z = under && under.closest('.c-zone, .c-pool');
          if (z && root.contains(z)) place(id, z.classList.contains('c-pool') ? null : z.dataset.zone);
          ghost.remove(); ghost = null; c.classList.remove('c-dragging'); root.querySelectorAll('.c-over').forEach((x) => x.classList.remove('c-over'));
        } else if (!checked && !locked.has(id)) select(sel === id ? null : id);
        start = null; drag = false;
      };
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', (e) => { if (ghost) { ghost.remove(); ghost = null; } c.classList.remove('c-dragging'); start = null; drag = false; });
      c.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });
    }
    checkBtn.addEventListener('click', () => {
      checked = true; select(null); let score = 0; const wrong = [];
      spec.items.forEach((it) => {
        const c = cards[it.id], z = c.parentElement.dataset.zone, ok = z === it.target; if (ok) score++; else wrong.push(it);
        c.classList.add(ok ? 'c-ok' : 'c-bad'); c.disabled = true;
      });
      const tname = (id) => (spec.targets.find((t) => t.id === id) || {}).label || '';
      out.innerHTML = `<p><b>${score} из ${spec.items.length}.</b> ${score === spec.items.length ? 'Всё верно.' : 'Разбор ошибок:'}</p>` +
        (wrong.length ? '<ul>' + wrong.map((it) => `<li><b>${it.label}</b> → ${tname(it.target)}. ${it.why || ''}</li>`).join('') + '</ul>' : '') +
        (spec.after ? `<p>${spec.after}</p>` : '');
      redoBtn.hidden = !wrong.length;
      refresh(); if (spec.onCheck) spec.onCheck(score, spec.items.length);
    });
    // верные карточки остаются на месте и закрепляются, неверные возвращаются в набор; разбор ошибок остаётся на экране
    redoBtn.addEventListener('click', () => {
      if (!checked) return;
      checked = false; redoBtn.hidden = true; select(null);
      spec.items.forEach((it) => { const c = cards[it.id]; if (c.classList.contains('c-ok')) { locked.add(it.id); return; } c.classList.remove('c-bad'); c.disabled = false; poolBody.append(c); });
      refresh();
    });
    resetBtn.addEventListener('click', () => {
      checked = false; out.innerHTML = ''; locked.clear(); redoBtn.hidden = true;
      spec.items.forEach((it) => { const c = cards[it.id]; c.classList.remove('c-ok', 'c-bad'); c.disabled = false; poolBody.append(c); });
      refresh();
    });
    refresh();
    return { get checked() { return checked; }, get locked() { return [...locked]; }, place, check: () => checkBtn.click(), redo: () => redoBtn.click(), reset: () => resetBtn.click() };
  }
  return { sort };
})();
