/* =====================================================================
   shared/check.js — общий движок страниц «Проверка части N»: задания по
   всем урокам части вперемешку, в конце балл по урокам и что повторить.
   Типы: выбор ответа, «что произойдёт», порядок, задача на сцене (её
   рисует сама страница части: cfg.scene). Варианты перемешиваются при
   каждом открытии. Итог пишется в #quizScore («Итог: X из N»), его
   подхватывает анонимная статистика (событие chk:k:ok|no на задание);
   пройденная проверка отмечается в прогрессе (mr-progress), как урок.
   Использование: PartCheck({ lessons, questions, scene, passText, expose }).
     lessons   — { '1.1': [название, файл урока], … } в порядке таблицы итога;
     questions — [{ l, t: 'choice'|'predict'|'order'|'scene', q, o, a | items, e, sec, st }];
     scene(api) — элемент задачи на сцене; api: { k, card, isDone(), done(ok), hint(текст) };
     passText  — фраза итога, когда ошибок не больше двух; expose — имя window.__cN для проверок.
   ===================================================================== */
window.PartCheck = function (cfg) {
  'use strict';
  const LESSON = cfg.lessons, Q = cfg.questions;
  const TYPE = { choice: 'Выбор ответа', predict: 'Что произойдёт', order: 'Порядок', scene: 'Задача на сцене' };
  const N = Q.length, res = new Array(N).fill(null);
  const slug = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  const stat = (name) => { if (window.MRStats) window.MRStats.ev(name); };
  const shuffle = (n) => { const o = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const link = (q) => `<a href="${LESSON[q.l][1]}#${q.sec}">Раздел «${q.st}» урока ${q.l} →</a>`;

  function done(k, ok, card) {
    if (res[k] !== null) return;
    res[k] = ok; stat(`chk:${k + 1}:${ok ? 'ok' : 'no'}`);
    const q = Q[k], exp = card.querySelector('.chk-exp');
    exp.innerHTML = `<b>${ok ? 'Верно.' : 'Не совсем.'}</b> ${q.e} ${link(q)}`; exp.hidden = false;
    card.classList.add(ok ? 'right' : 'wrong');
    summary();
  }

  function choice(k, card) {
    const q = Q[k], box = h('div', { class: 'chk-opts' });
    shuffle(q.o.length).forEach((oi) => {
      const b = h('button', { type: 'button', class: 'chk-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (res[k] !== null) return;
        const ok = oi === q.a; b.classList.add(ok ? 'ok' : 'no');
        if (!ok) [...box.children].find((x) => x.textContent === q.o[q.a]).classList.add('ok');
        [...box.children].forEach((x) => { x.disabled = true; });
        done(k, ok, card);
      });
      box.append(b);
    });
    return box;
  }

  function order(k, card) {
    const q = Q[k], box = h('div', { class: 'chk-order' }), picked = [];
    const list = h('div', { class: 'chk-opts' }), reset = h('button', { type: 'button', class: 'g-restart' }, 'Начать порядок заново');
    const btns = shuffle(q.items.length).map((ii) => {
      const b = h('button', { type: 'button', class: 'chk-opt' }, h('span', { class: 'chk-n' }), q.items[ii]);
      b.addEventListener('click', () => {
        if (res[k] !== null || picked.includes(ii)) return;
        picked.push(ii); b.classList.add('picked'); b.querySelector('.chk-n').textContent = picked.length;
        if (picked.length === q.items.length) {
          const ok = picked.every((v, i) => v === i);
          btns.forEach((x) => { x.disabled = true; x.classList.add(+x.dataset.ii === picked.indexOf(+x.dataset.ii) ? 'ok' : 'no'); });
          if (!ok) card.querySelector('.chk-exp').before(h('p', { class: 'chk-right' }, 'Верный порядок: ' + q.items.map((t, i) => `${i + 1}. ${t.split(':')[0]}`).join(' → ')));
          reset.hidden = true; done(k, ok, card);
        }
      });
      b.dataset.ii = ii; list.append(b); return b;
    });
    reset.addEventListener('click', () => { picked.length = 0; btns.forEach((x) => { x.classList.remove('picked'); x.querySelector('.chk-n').textContent = ''; }); });
    box.append(h('p', { class: 'chk-hint' }, 'Нажимай варианты по порядку: первый, второй и так далее.'), list, reset);
    return box;
  }

  function summary() {
    const n = res.filter((x) => x !== null).length, right = res.filter(Boolean).length;
    $('#chkWait').textContent = n < N ? `Отвечено ${n} из ${N}, верно ${right}. Итог появится, когда ответишь на все задания.` : '';
    if (n < N) return;
    $('#quizScore').textContent = `Итог: ${right} из ${N}. ${right >= N - 2 ? cfg.passText : 'Ниже — разделы уроков, которые стоит повторить.'}`;
    const by = {};
    Q.forEach((q, i) => { (by[q.l] = by[q.l] || [0, 0]); by[q.l][1]++; if (res[i]) by[q.l][0]++; });
    $('#chkTable').innerHTML = Object.keys(LESSON).map((l) => `<div class="chk-tr"><span>${l} ${LESSON[l][0]}</span><b>${by[l][0]} из ${by[l][1]}</b></div>`).join('');
    const wrong = Q.map((q, i) => (res[i] ? null : q)).filter(Boolean);
    $('#chkReview').innerHTML = wrong.length ? wrong.map((q) => `<li><a href="${LESSON[q.l][1]}#${q.sec}">${q.l} · ${q.st}</a><span>${q.q.length > 90 ? q.q.slice(0, 88) + '…' : q.q}</span></li>`).join('') : '<li><strong>Повторять нечего</strong><span>Все задания решены верно.</span></li>';
    $('#chkResult').hidden = false;
    try { // проверка пройдена — отметка в прогрессе, как у дочитанного урока
      const d = JSON.parse(localStorage.getItem('mr-progress') || '{}') || {}, now = Math.round(Date.now() / 1000);
      d[slug] = Object.assign(d[slug] || { s: now }, { t: now, f: (d[slug] && d[slug].f) || now });
      localStorage.setItem('mr-progress', JSON.stringify(d));
    } catch (e) { /* приватный режим */ }
  }

  function render() {
    const list = $('#chkList'); list.innerHTML = ''; res.fill(null);
    Q.forEach((q, k) => {
      const card = h('div', { class: 'card chk-card', id: 'q' + (k + 1) });
      card.append(h('div', { class: 'chk-meta' }, `Задание ${k + 1} из ${N} · ${TYPE[q.t]} · урок ${q.l}`), h('p', { class: 'chk-q' }, q.q));
      const api = { k, card, isDone: () => res[k] !== null, done: (ok) => done(k, ok, card), hint: (t) => card.querySelector('.chk-exp').before(h('p', { class: 'chk-right' }, t)) };
      const exp = h('div', { class: 'chk-exp' }); exp.hidden = true;
      card.append(q.t === 'order' ? order(k, card) : q.t === 'scene' ? cfg.scene(api) : choice(k, card), exp);
      list.append(card);
    });
    $('#quizScore').textContent = ''; $('#chkResult').hidden = true; summary();
  }

  function initNav() {
    const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
    const onScroll = () => {
      const doc = document.documentElement;
      $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
      let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  initTheme(); initNav(); render();
  $('#chkAgain').addEventListener('click', () => { render(); document.getElementById('tasks').scrollIntoView({ behavior: 'smooth' }); });
  if (cfg.expose) window[cfg.expose] = { Q, res };
};
