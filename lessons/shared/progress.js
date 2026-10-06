/* =====================================================================
   shared/progress.js — прогресс по курсу в этом браузере.
   Урок отмечается начатым при открытии и пройденным, когда читатель
   дошёл до раздела «Итоги урока». Запоминается и самый дальний раздел,
   чтобы главная могла предложить «Продолжить» с него.
   Всё хранится только в localStorage (ключ mr-progress) и никуда не
   отправляется. Главная читает тот же ключ (site/index.src.html).
   ===================================================================== */
(function () {
  'use strict';
  const KEY = 'mr-progress';
  const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  if (!page) return;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const write = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* приватный режим: прогресс не сохранится */ } };
  const update = (fn) => { const d = read(); const me = d[page] || {}; fn(me); d[page] = me; write(d); };
  const now = () => Math.round(Date.now() / 1000);
  update((me) => { me.t = now(); if (!me.s) me.s = me.t; });
  const secs = [...document.querySelectorAll('section[id]')].map((s) => s.id);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((list) => list.forEach((e) => {
    if (!e.isIntersecting) return;
    const id = e.target.id, i = secs.indexOf(id);
    io.unobserve(e.target);
    update((me) => {
      if (i > (me.i == null ? -1 : me.i)) { me.i = i; me.sec = id; }
      if (id === 'finale' && !me.f) me.f = now();
    });
  }), { rootMargin: '0px 0px -40% 0px' });
  document.querySelectorAll('section[id]').forEach((s) => io.observe(s));
})();
