/* =====================================================================
   shared/recall.js — разминка в начале урока: 2–3 вопроса по прошлому
   уроку. Вспомнить материал по памяти полезнее, чем перечитать его.
   Данные — в уроке, в элементе script с type="application/json" и id="recallData":
   { "n": "1.2", "title": "DAgger", "href": "1-2-dagger.html",
     "q": [{ "q": "вопрос", "o": ["вариант", ...], "a": 1, "e": "пояснение",
             "sec": "dagger", "secTitle": "название раздела" }] }
   Блок рисуется в [data-recall]. Ответы нигде не сохраняются.
   ===================================================================== */
(function () {
  'use strict';
  const box = document.querySelector('[data-recall]'), src = document.getElementById('recallData');
  if (!box || !src) return;
  let D;
  try { D = JSON.parse(src.textContent); } catch (e) { return; }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const head = el('div', 'rc-head');
  head.append(el('div', 'g-kicker', 'Разминка'), el('h3', null, `Вспомни урок ${D.n} «${D.title}»`),
    el('p', 'rc-sub', `${D.q.length} ${D.q.length < 5 ? 'вопроса' : 'вопросов'}, чтобы связать уроки. Можно пропустить и сразу читать дальше.`));
  box.append(head);
  const total = el('p', 'rc-total'); total.hidden = true;
  let answered = 0, right = 0;
  D.q.forEach((q, qi) => {
    const card = el('div', 'rc-q');
    card.append(el('div', 'rc-text', `${qi + 1}. ${q.q}`));
    const opts = el('div', 'rc-opts'), exp = el('div', 'rc-exp'); exp.hidden = true;
    // порядок вариантов перемешиваем при каждом открытии, чтобы верный ответ не стоял всегда на одном месте
    const order = q.o.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((oi) => {
      const o = q.o[oi];
      const b = el('button', 'rc-opt', o); b.type = 'button';
      b.addEventListener('click', () => {
        if (card.classList.contains('done')) return;
        card.classList.add('done');
        const ok = oi === q.a; answered++; if (ok) right++;
        b.classList.add(ok ? 'ok' : 'no');
        if (!ok) opts.children[order.indexOf(q.a)].classList.add('ok');
        [...opts.children].forEach((x) => { x.disabled = true; });
        exp.append(el('b', null, ok ? 'Верно. ' : 'Не совсем. '), document.createTextNode(q.e + ' '));
        if (q.sec) { const a = el('a', null, `Раздел «${q.secTitle}» урока ${D.n} →`); a.href = `${D.href}#${q.sec}`; exp.append(a); }
        exp.hidden = false;
        if (answered === D.q.length) { total.textContent = `Верно ${right} из ${D.q.length}. ${right === D.q.length ? 'Можно двигаться дальше.' : 'Если что-то забылось, ссылки ведут в нужные разделы прошлого урока.'}`; total.hidden = false; }
      });
      opts.append(b);
    });
    card.append(opts, exp);
    box.append(card);
  });
  box.append(total);
})();
