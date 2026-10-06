/* =====================================================================
   gl/ui-gl.js — страница глоссария: все термины из shared/glossary.json
   (данные подставляет lessons/build.py), поиск, указатель по буквам,
   переход по якорю #id из подсказок в уроках.
   ===================================================================== */
(function () {
  'use strict';
  const G = JSON.parse(document.getElementById('glAll').textContent);
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
  const first = (t) => { const c = t.trim()[0].toUpperCase(); return /[А-ЯЁ]/.test(c) ? (c === 'Ё' ? 'Е' : c) : /[A-Z]/.test(c) ? c : '#'; };
  const isRu = (t) => /^[А-ЯЁа-яё]/.test(t.trim());
  const items = G.slice().sort((a, b) => (isRu(a.t) === isRu(b.t) ? a.t.localeCompare(b.t, 'ru') : isRu(a.t) ? -1 : 1));
  const list = $('#glList'), abc = $('#glAbc');
  const groups = [];
  items.forEach((g) => { const L = first(g.t); let grp = groups[groups.length - 1]; if (!grp || grp.L !== L) { grp = { L, items: [] }; groups.push(grp); } grp.items.push(g); });
  groups.forEach((grp) => {
    const box = h('div', { class: 'gl-group', id: 'letter-' + grp.L }, h('div', { class: 'gl-letter' }, grp.L));
    grp.items.forEach((g) => {
      const en = g.en && g.en.toLowerCase() !== g.t.toLowerCase() ? h('span', { class: 'gl-en' }, g.en) : null;
      box.append(h('article', { class: 'card gl-item', id: g.id, 'data-s': norm([g.t, g.en, g.d].join(' ')) },
        h('h3', null, g.t, en ? ' ' : null, en), h('p', null, g.d),
        h('a', { class: 'gl-from', href: g.href }, `Урок ${g.n}${g.st ? ` · ${g.st}` : ''} →`)));
    });
    list.append(box);
    if (/[A-Z]/.test(grp.L) && !abc.querySelector('.gl-abc-sep')) abc.append(h('span', { class: 'gl-abc-sep', 'aria-hidden': 'true' }));
    abc.append(h('a', { href: '#letter-' + grp.L }, grp.L));
  });
  const q = $('#glQ'), count = $('#glCount');
  function filter() {
    const s = norm(q.value.trim()); let n = 0;
    $$('.gl-group').forEach((grp) => { let k = 0; $$('.gl-item', grp).forEach((it) => { const ok = !s || it.dataset.s.includes(s); it.hidden = !ok; if (ok) k++; }); grp.hidden = !k; n += k; });
    count.textContent = s ? `${n} из ${items.length}` : `${items.length} терминов`;
    $('#glNone').hidden = n > 0;
  }
  q.addEventListener('input', filter); filter();
  function mark() { const id = decodeURIComponent(location.hash.slice(1)); const el = id && document.getElementById(id); if (el && el.classList.contains('gl-item')) { $$('.gl-item.hit').forEach((x) => x.classList.remove('hit')); el.classList.add('hit'); el.scrollIntoView({ block: 'center' }); } }
  window.addEventListener('hashchange', mark); mark();
  initTheme();
  const doc = document.documentElement;
  window.addEventListener('scroll', () => { $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%'; }, { passive: true });
})();
