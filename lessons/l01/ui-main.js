/* =====================================================================
   ui-main.js — запуск урока.
   ===================================================================== */
'use strict';
(function boot() {
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = async () => {
    safe('theme', initTheme);
    safe('nav', initNav);
    safe('hero', initHeroDemos);
    safe('timeline', initTimeline);
    safe('arch', () => Arch.init());
    safe('lab1', () => Lab1.init());
    safe('lab2', () => Lab2.init());
    safe('lab5', () => Lab5.init());
    safe('spectrum', initSpectrum);
    safe('quiz', initQuiz);
    safe('metro', initMetro);
    try { await Lab2.bootstrap(); } catch (e) { console.error('[урок] обучение по умолчанию', e); }
    window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
