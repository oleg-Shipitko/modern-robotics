/* =====================================================================
   shared/feedback.js — отзыв в конце урока: «Урок был понятен?»,
   необязательный текст «что осталось непонятным» и ссылка на GitHub
   для сообщений об ошибках (её готовит lessons/build.py).
   Оценка уходит сразу после выбора, текст — по кнопке «Отправить».
   Сервер — та же функция, что у статистики (window.MR_STATS_API):
   оценку он добавляет к суммам урока, текст хранит без имени и контактов.
   В браузере запоминается только то, что урок уже оценён (localStorage),
   чтобы при повторном заходе не просить оценку снова.
   ===================================================================== */
(function () {
  'use strict';
  const box = document.querySelector('[data-fb]');
  if (!box) return;
  const API = window.MR_STATS_API || '';
  const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  const live = !!API && (window.MR_STATS_FORCE === true || /(^|\.)modernrobotics\.ru$/.test(location.hostname));
  const KEY = 'mr-fb:' + page;
  const LABEL = { good: 'Всё понятно', mid: 'Местами сложно', bad: 'Многое непонятно' };
  const store = (v) => { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) { /* приватный режим */ } return null; };
  function send(fb) {
    if (!live) return;
    const body = JSON.stringify({ p: page, fb });
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(API, body))) fetch(API, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {}); } catch (e) { /* отзыв не должен мешать уроку */ }
  }

  const opts = [...box.querySelectorAll('.fb-opts button')], more = box.querySelector('.fb-more'), done = box.querySelector('.fb-done');
  const text = box.querySelector('textarea'), sendBtn = box.querySelector('.fb-send'), head = box.querySelector('.fb-q'), saved = box.querySelector('.fb-saved');
  let rating = store() || null;
  function paint() {
    opts.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === rating)));
    more.hidden = !rating || box.classList.contains('sent');
    if (rating && !box.classList.contains('sent')) head.textContent = 'Урок был понятен? Твой ответ: ' + LABEL[rating].toLowerCase();
    if (saved) saved.hidden = !rating || box.classList.contains('sent');
  }
  opts.forEach((b) => b.addEventListener('click', () => {
    if (box.classList.contains('sent')) return;
    const first = !store();
    rating = b.dataset.r;
    if (first) { store(rating); send({ r: rating }); } // оценку считаем один раз; смена ответа уйдёт вместе с текстом
    paint();
    if (first) text.focus({ preventScroll: true });
  }));
  sendBtn.addEventListener('click', () => {
    const t = text.value.trim().slice(0, 1000);
    if (!t) { text.focus(); return; }
    send({ r: rating, t });
    store(rating);
    box.classList.add('sent'); done.hidden = false;
    paint();
  });
  paint();
})();
