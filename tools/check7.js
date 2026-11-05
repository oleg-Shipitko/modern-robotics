// Проверка части 7: структура, ссылки, 20 вопросов и итоговая сцена на компьютере и телефоне.
'use strict';
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'site/lessons/proverka-chasti-7.html');
const URL_EN = 'file://' + path.join(ROOT, 'site/en/lessons/proverka-chasti-7.html');
const out = (name) => path.join(ROOT, 'shots', name);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

function h2Of(l, sec) {
  const html = fs.readFileSync(path.join(ROOT, 'lessons', 'l' + l.replace('.', ''), 'lesson.html'), 'utf8');
  const i = html.indexOf(`id="${sec}"`), tail = i < 0 ? '' : html.slice(i, html.indexOf('</section>', i));
  const a = tail.indexOf('<h2'), b = tail.indexOf('</h2>', a);
  return a < 0 ? null : tail.slice(tail.indexOf('>', a) + 1, b).replace(/<[^>]+>/g, '').trim();
}

(async () => {
  const B = await launch({ w: 1440, h: 900 });
  const p = await B.page(URL, { width: 1440, height: 900 });
  await p.waitFor('window.__c7S && window.__c7'); await sleep(250);
  const n = await p.eval('window.__c7.Q.length');
  check(n === 21 && await p.eval('document.querySelectorAll(".chk-card").length') === 21, '20 вопросов и одна задача на сцене');
  const per = JSON.parse(await p.eval('JSON.stringify(window.__c7.Q.reduce((a,q)=>(a[q.l]=(a[q.l]||0)+1,a),{}))'));
  check(['7.1', '7.2', '7.3', '7.4'].every((l) => per[l] === 4) && per['7.5'] === 5, 'по четыре вопроса на урок; сцена относится к 7.5: ' + JSON.stringify(per));
  check(await p.eval('window.__c7.Q[20].t') === 'scene', 'живая задача стоит последней');
  const links = JSON.parse(await p.eval('JSON.stringify(window.__c7.Q.map(q=>[q.l,q.sec,q.st]))'));
  const miss = links.filter(([l, sec, st]) => h2Of(l, sec) !== st).map(([l, sec, st]) => `${l}#${sec}: «${st}» ≠ «${h2Of(l, sec)}»`);
  check(!miss.length, 'все ссылки ведут на существующие разделы с точными заголовками' + (miss.length ? ': ' + miss.join('; ') : ''));
  check(await p.eval('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'страница не шире экрана 1440 px');
  await p.shotEl(out('c7-q1.png'), '#q1', 6);
  await p.shotEl(out('c7-scene-start.png'), '#q21', 6);

  // Ответить правильно на 20 обычных заданий через интерфейс.
  for (let i = 0; i < 20; i++) {
    const q = JSON.parse(await p.eval(`JSON.stringify(window.__c7.Q[${i}])`)), card = '#q' + (i + 1);
    if (q.t === 'order') for (const item of q.items) await p.eval(`(() => { const b=[...document.querySelectorAll('${card} .chk-opt')].find(x=>x.textContent.trim()===${JSON.stringify(item)}); if(!b) throw Error('нет пункта порядка'); b.click(); return true; })()`);
    else { const answer = q.o[q.a]; await p.eval(`(() => { const b=[...document.querySelectorAll('${card} .chk-opt')].find(x=>x.textContent===${JSON.stringify(answer)}); if(!b) throw Error('нет ответа'); b.click(); return true; })()`); }
  }
  check(await p.eval('window.__c7.res.slice(0,20).every(Boolean) && window.__c7.res[20] === null'), 'все 20 обычных заданий отвечаются через интерфейс');

  // Первая конфигурация должна показать расхождение ожидания с настоящим миром.
  await p.eval('document.querySelector("#q21 .btn.primary").click(); true');
  await p.waitFor('window.__c7S.st.ran && !window.__c7S.st.busy');
  check(await p.eval('window.__c7S.st.ran.morning.ok') < 90, 'исходная конфигурация не проходит порог 90 из 100');
  check(await p.eval('window.__c7S.st.ran.model') > await p.eval('window.__c7S.st.ran.morning.ok'), 'сцена показывает расхождение ожидания и настоящих исходов');

  // Надёжная конфигурация выбирается теми же кнопками, без скрытого API.
  const best = { world: 'ensemble', goal: 'repr', synth: 'filter', video: 'wam', check: 'fails', k: '4' };
  for (const [k, v] of Object.entries(best)) await p.eval(`document.querySelector('#q21 button[data-key="${k}"][data-v="${v}"]').click(); true`);
  await p.eval('document.querySelector("#q21 .btn.primary").click(); true');
  await p.waitFor('window.__c7.res[20] !== null'); await sleep(160);
  check(await p.eval('window.__c7S.st.ran.night.n') === 20 && await p.eval('window.__c7S.st.ran.morning.n') === 100, 'движок исполняет 20 ночных и 100 утренних настоящих попыток');
  check(await p.eval('window.__c7S.st.ran.morning.ok') >= 90 && await p.eval('window.__c7.res[20]') === true, 'надёжная конфигурация проходит порог и завершает задачу');
  check((await p.eval('document.getElementById("quizScore").textContent')).startsWith('Итог: 21 из 21.'), 'итог появляется после всех 21 заданий');
  check(await p.eval('document.querySelectorAll("#chkTable .chk-tr").length') === 5, 'в итоговой таблице пять уроков');
  await p.shotEl(out('c7-scene-success.png'), '#q21', 6);
  await p.shotEl(out('c7-result.png'), '#result .prose', 6);
  check(!p.logs.length, 'консоль компьютера чистая' + (p.logs.length ? ': ' + p.logs.join(' | ') : ''));

  const phone = await B.page(URL, { width: 390, height: 844, dpr: 2, mobile: true, dark: true });
  await phone.waitFor('window.__c7S'); await sleep(250);
  check(await phone.eval('document.documentElement.scrollWidth <= 390'), 'страница не шире телефона 390 px');
  check(await phone.eval('getComputedStyle(document.querySelector("#q21 canvas")).aspectRatio') === '360 / 430', 'у сцены мобильная раскладка');
  check(await phone.eval('[...document.querySelectorAll("#q21 .c7-stage")].every(x=>x.getBoundingClientRect().right<=document.querySelector("#q21").getBoundingClientRect().right+.5)'), 'этапы ночного цикла помещаются в карточку');
  await phone.shotEl(out('c7-phone-scene.png'), '#q21', 4);
  check(!phone.logs.length, 'консоль телефона чистая' + (phone.logs.length ? ': ' + phone.logs.join(' | ') : ''));

  const en = await B.page(URL_EN, { width: 1440, height: 900 });
  await en.waitFor('window.__c7S && window.__c7');
  check(await en.eval('window.__c7.Q.length') === 21 && !/[А-Яа-яЁё]/.test(await en.eval('document.querySelector("main").innerText')), 'английская версия: 21 задание и нет кириллицы');
  for (const [k, v] of Object.entries(best)) await en.eval(`document.querySelector('#q21 button[data-key="${k}"][data-v="${v}"]').click(); true`);
  await en.eval('document.querySelector("#q21 .btn.primary").click(); true');
  await en.waitFor('window.__c7.res[20] === true');
  check(!/[А-Яа-яЁё]/.test(await en.eval('document.querySelector("#q21").innerText')), 'английская живая задача переведена после запуска');
  check(await en.eval('document.documentElement.scrollWidth <= document.documentElement.clientWidth') && !en.logs.length, 'английская версия помещается по ширине, консоль чистая');
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
