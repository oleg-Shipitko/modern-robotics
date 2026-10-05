/* Кнопка «Сказать спасибо» с общим счётчиком — на главной и в конце каждого урока.
   Число хранит функция в Yandex Cloud (server/thanks/), её адрес — THANKS_API в site/config.json.
   Один браузер — одно спасибо: отметка в localStorage. Если запрос не дошёл, он повторится при следующем заходе. */
(function () {
  'use strict';
  const boxes = [...document.querySelectorAll('[data-thanks]')];
  if (!boxes.length) return;
  const API = window.MR_THANKS_API || '';
  const KEY = 'mr-thanks'; // нет — ещё не нажимали; 'sent' — спасибо учтено; 'pending' — нажали, но запрос не дошёл
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1 7.8 7.7 7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  let n = null;
  const state = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const setState = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* приватный режим: отметка не сохранится */ } };

  const ui = boxes.map((box) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thanks-btn';
    btn.innerHTML = HEART + '<span class="thanks-label"></span><span class="thanks-n" title="Столько раз читатели сказали спасибо" hidden></span>';
    const after = document.createElement('span');
    after.className = 'thanks-after';
    after.setAttribute('aria-live', 'polite');
    box.prepend(btn);
    box.append(after);
    btn.addEventListener('click', () => thank(box));
    return { box, btn, after, text: box.querySelector('.thanks-text'), channel: box.dataset.channel };
  });

  function render() {
    const done = !!state();
    ui.forEach(({ box, btn, after, text, channel }) => {
      box.classList.toggle('done', done);
      btn.setAttribute('aria-pressed', String(done));
      btn.querySelector('.thanks-label').textContent = done ? 'Спасибо сказано' : 'Сказать спасибо';
      const c = btn.querySelector('.thanks-n');
      c.hidden = !(n > 0);
      if (n > 0) c.textContent = n.toLocaleString('ru-RU');
      if (text) text.hidden = done;
      if (done && !after.firstChild && channel && channel !== '#') {
        const a = document.createElement('a');
        a.href = channel; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'канале «Продакт роботов»';
        after.append('Новые уроки анонсируются в ', a, '.');
      }
    });
  }

  function request(method) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    return fetch(API, { method, cache: 'no-store', signal: ctl.signal })
      .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, status: r.status, d })))
      .finally(() => clearTimeout(timer));
  }
  function send() {
    return request('POST').then(({ ok, status, d }) => {
      if (ok && typeof d.n === 'number') { n = d.n; setState('sent'); }
      else if (status >= 400 && status < 500 && status !== 429) setState('sent'); // сервер отказал — повтор не поможет
      render();
    }).catch(() => { /* сети нет: отметка 'pending' останется, повторим при следующем заходе */ });
  }
  function thank(box) {
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    if (state()) return;
    setState(API ? 'pending' : 'sent');
    if (n !== null) n += 1;
    render();
    if (API) send();
  }

  render();
  if (!API) return;
  if (state() === 'pending') send();
  else request('GET').then(({ ok, d }) => { if (ok && typeof d.n === 'number' && n === null) { n = d.n; render(); } }).catch(() => {});
})();
