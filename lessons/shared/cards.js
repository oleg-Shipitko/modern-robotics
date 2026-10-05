/* =====================================================================
   shared/cards.js — разложи карточки по корзинам.
   Перетаскивание мышью и пальцем, а для клавиатуры и на всякий случай —
   «нажми карточку, потом корзину». «Проверить» отмечает каждую карточку
   ✓/✗ и показывает разбор ошибок.
   Cards.sort(root, { items: [{ id, label, target, why }], targets: [{ id, label, note? }],
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
    const cards = {}, zoneBody = {}; let sel = null, checked = false;
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
      const c = el('button', 'c-card'); c.type = 'button'; c.textContent = it.label; c.dataset.id = it.id; cards[it.id] = c;
      attachDrag(c, it.id); poolBody.append(c);
    });
    const checkBtn = el('button', 'btn primary sm', spec.checkLabel || 'Проверить'); checkBtn.type = 'button'; checkBtn.disabled = true;
    const resetBtn = el('button', 'btn sm', 'Начать заново'); resetBtn.type = 'button';
    const status = el('span', 'muted-s');
    bar.append(checkBtn, resetBtn, status);
    root.append(pool, zones, bar, out);
    function placed() { return spec.items.filter((it) => cards[it.id].parentElement !== poolBody).length; }
    function refresh() {
      const n = placed(); checkBtn.disabled = n < spec.items.length || checked;
      status.textContent = checked ? '' : n < spec.items.length ? `Разложено ${n} из ${spec.items.length}` : 'Всё разложено — можно проверять';
      pool.classList.toggle('c-empty', n === spec.items.length);
    }
    function place(id, zone) {
      if (checked) return;
      const c = cards[id]; (zone ? zoneBody[zone] : poolBody).append(c); refresh();
    }
    function select(id) { sel = id; Object.values(cards).forEach((c) => c.classList.toggle('c-sel', c.dataset.id === id)); root.classList.toggle('c-selecting', !!id); }
    function attachDrag(c, id) {
      let start = null, drag = false, ghost = null;
      c.addEventListener('pointerdown', (e) => { if (checked || e.button > 0) return; start = { x: e.clientX, y: e.clientY }; drag = false; try { c.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } });
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
        } else if (!checked) select(sel === id ? null : id);
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
      refresh(); if (spec.onCheck) spec.onCheck(score, spec.items.length);
    });
    resetBtn.addEventListener('click', () => {
      checked = false; out.innerHTML = '';
      spec.items.forEach((it) => { const c = cards[it.id]; c.classList.remove('c-ok', 'c-bad'); c.disabled = false; poolBody.append(c); });
      refresh();
    });
    refresh();
    return { get checked() { return checked; }, place, check: () => checkBtn.click(), reset: () => resetBtn.click() };
  }
  return { sort };
})();
