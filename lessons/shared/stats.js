/* =====================================================================
   shared/stats.js — анонимная статистика страниц курса.
   Что считаем: открытие страницы (телефон или компьютер, откуда пришли),
   до каких разделов дочитали, сколько минут вкладка была открыта на экране,
   какие миссии и задачи открыли и прошли, чем закончился квиз.
   Чего нет: cookies, идентификаторов, отпечатков браузера. События копятся
   в памяти страницы и уходят пачкой — раз в 30 секунд и когда вкладку
   скрывают или закрывают (navigator.sendBeacon). Сервер (server/stats)
   хранит только суммы по дням: «урок, событие, сколько раз».
   Адрес — window.MR_STATS_API (STATS_API в site/config.json). Отправка
   только со страниц modernrobotics.ru и не при включённом Do Not Track;
   window.MR_STATS_FORCE = true снимает проверку адреса для тестов.
   Миссии и задачи сообщают о себе через window.MRStats.ev(имя).
   ===================================================================== */
(function () {
  'use strict';
  const API = window.MR_STATS_API || '';
  const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  const on = !!API && navigator.doNotTrack !== '1' && (window.MR_STATS_FORCE === true || /(^|\.)modernrobotics\.ru$/.test(location.hostname));
  const seen = new Set(), queue = [];

  function ev(name) {
    if (!on || seen.has(name)) return; // каждое событие — не больше одного раза за открытие страницы
    seen.add(name); queue.push(name);
  }
  function flush() {
    while (queue.length) {
      const body = JSON.stringify({ p: page, e: queue.splice(0, 60) });
      try {
        if (!(navigator.sendBeacon && navigator.sendBeacon(API, body))) fetch(API, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
      } catch (e) { /* статистика не должна мешать уроку */ }
    }
  }
  window.MRStats = { ev, flush, get on() { return on; } };
  if (!on) return;

  function source() {
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { /* пустой или странный referrer */ }
    if (!host) return 'direct';
    const is = (re) => re.test(host);
    if (is(/(^|\.)modernrobotics\.ru$/)) return 'site';
    if (is(/(^|\.)(t\.me|telegram\.org|telegram\.me)$/)) return 'telegram';
    if (is(/(^|\.)(linkedin\.com|lnkd\.in)$/)) return 'linkedin';
    if (is(/(^|\.)google\.[a-z.]+$/)) return 'google';
    if (is(/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/)) return 'yandex';
    if (is(/(^|\.)github\.com$/)) return 'github';
    if (is(/(^|\.)(vk\.com|vk\.ru)$/)) return 'vk';
    if (is(/(^|\.)habr\.com$/)) return 'habr';
    return 'other';
  }
  ev('open:' + (matchMedia('(max-width: 700px)').matches ? 'phone' : 'desk'));
  ev('ref:' + source());

  // Раздел считается прочитанным, когда его верх поднялся в верхние 60% экрана
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((list) => list.forEach((e) => { if (e.isIntersecting) { ev('sec:' + e.target.id); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40% 0px' });
    document.querySelectorAll('section[id]').forEach((s) => { if (/^[a-z][a-zA-Z0-9-]{0,30}$/.test(s.id)) io.observe(s); });
  }

  // Квиз: итог «Итог: 6 из 8»
  const score = document.getElementById('quizScore');
  if (score) {
    const check = () => { const m = /Итог: (\d+) из (\d+)/.exec(score.textContent); if (m) ev(`quiz:${m[1]}/${m[2]}`); };
    new MutationObserver(check).observe(score, { childList: true, characterData: true, subtree: true });
  }

  // Время, пока вкладка на экране: отметки 2, 10 и 30 минут
  let shown = 0;
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    shown += 15;
    for (const m of [2, 10, 30]) if (shown >= m * 60) ev('t:' + m);
  }, 15000);

  setInterval(flush, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
})();
