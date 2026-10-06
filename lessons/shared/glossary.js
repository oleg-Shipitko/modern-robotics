/* =====================================================================
   shared/glossary.js — подсказки к терминам в уроках. Сборка
   (lessons/build.py) оборачивает первое упоминание термина в
   <span class="gl" data-gl="id"> и кладёт определения в JSON #glData.
   Мышью — подсказка при наведении, пальцем — по касанию, с клавиатуры —
   по фокусу. Esc и касание мимо закрывают её.
   ===================================================================== */
(function () {
  'use strict';
  const src = document.getElementById('glData'), els = [...document.querySelectorAll('.gl')];
  if (!src || !els.length) return;
  let D;
  try { D = JSON.parse(src.textContent); } catch (e) { return; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pop = document.createElement('div');
  pop.className = 'gl-pop'; pop.id = 'glPop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
  document.body.append(pop);
  let cur = null, hideT = 0, lastPointer = 'mouse';
  function place(el) {
    const r = el.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    const h = pop.offsetHeight; let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8 && r.top - h - 8 > 8) y = r.top - h - 8;
    pop.style.top = y + 'px';
  }
  function show(el) {
    const id = el.dataset.gl, g = D[id]; if (!g) return;
    clearTimeout(hideT); cur = el;
    const en = g.en && g.en.toLowerCase() !== g.t.toLowerCase() ? ` <span class="gl-en">${esc(g.en)}</span>` : '';
    const where = g.here ? '' : `<a href="${esc(g.href)}">Урок ${esc(g.n)}${g.st ? ` «${esc(g.st)}»` : ''}</a> · `;
    pop.innerHTML = `<b>${esc(g.t)}</b>${en}<p>${esc(g.d)}</p><p class="gl-links">${where}<a href="glossariy.html#${esc(id)}">В глоссарии</a></p>`;
    pop.hidden = false; el.setAttribute('aria-describedby', 'glPop'); place(el);
  }
  function hide(now) {
    clearTimeout(hideT);
    const go = () => { pop.hidden = true; if (cur) cur.removeAttribute('aria-describedby'); cur = null; };
    if (now) go(); else hideT = setTimeout(go, 200);
  }
  els.forEach((el) => {
    el.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(el); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    el.addEventListener('focus', () => { if (lastPointer === 'mouse') show(el); });
    el.addEventListener('blur', () => hide());
    el.addEventListener('click', (e) => { if (lastPointer === 'mouse') return; e.stopPropagation(); if (cur === el && !pop.hidden) hide(true); else show(el); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (cur === el && !pop.hidden) hide(true); else show(el); } });
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'Tab') lastPointer = 'keyboard'; });
  pop.addEventListener('pointerenter', () => clearTimeout(hideT));
  pop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.gl')) hide(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) hide(true); });
  window.addEventListener('scroll', () => { if (!pop.hidden && cur) place(cur); }, { passive: true });
})();
