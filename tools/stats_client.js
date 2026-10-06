// Проверка анонимной статистики в браузере: поднимает локальный приёмник вместо функции mr-stats,
// проходит часть урока 1.6 и главную и печатает, что именно страница отправила.
// Запуск: node tools/stats_client.js   (сеть не нужна, на настоящий сервер ничего не уходит)
const http = require('http'), path = require('path');
const { launch, sleep } = require('./cdp');
const site = (f) => 'file://' + path.resolve(__dirname, '../site/' + f);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { if (req.method === 'POST') got.push(JSON.parse(b)); res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end('{}'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}/`;
  const inject = `Object.defineProperty(window, 'MR_STATS_API', { get: () => ${JSON.stringify(API)}, set: () => {} }); window.MR_STATS_FORCE = true;`;
  const B = await launch({ w: 1440, h: 900 });
  async function open(file, vp, force) {
    const p = await B.page('about:blank', vp);
    await p.S('Page.bringToFront'); // фоновая вкладка не рисует кадры, и разделы не «видны»
    if (force) await p.S('Page.addScriptToEvaluateOnNewDocument', { source: inject });
    await p.S('Page.navigate', { url: site(file) });
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    return p;
  }
  async function scrollAll(p) { // как читатель: раздел за разделом, с паузой на каждом
    const n = await p.eval('document.querySelectorAll("section[id]").length');
    for (let i = 0; i < n; i++) { await p.eval(`document.querySelectorAll('section[id]')[${i}].scrollIntoView({ block: 'start', behavior: 'instant' }); true`); await sleep(300); }
  }
  const events = (page) => got.filter((b) => b.p === page).flatMap((b) => b.e);

  console.log('Урок 1.6 на компьютере');
  const p = await open('lessons/1-6-transformer.html', { width: 1440, height: 900, light: true }, true);
  // задача про патчи: ставка, патч 16, два ответа
  await p.eval(`[...document.querySelectorAll('#tokTask .m-bet .opts button')].find((b) => b.textContent.startsWith('196')).click(); true`);
  await p.eval(`document.querySelector('#tokPatch button[data-p="16"]').click(); true`); await sleep(50);
  await p.eval(`document.querySelector('#tokTask .pick[data-g=t] button[data-v="4"]').click(); document.querySelector('#tokTask .pick[data-g=p] button[data-v="16"]').click(); true`);
  // квиз: первый вариант в каждом вопросе
  await p.eval(`document.querySelectorAll('#quizBox .q-opts').forEach((o) => o.querySelector('.q-opt').click()); true`);
  await scrollAll(p);
  await p.eval('window.MRStats.flush(); true'); await sleep(400);
  const e16 = events('1-6-transformer');
  console.log('  отправлено:', JSON.stringify(e16));
  check(e16.includes('open:desk') && e16.some((e) => e.startsWith('ref:')), 'открытие: компьютер и источник');
  check(e16.includes('sec:tokens') && e16.includes('sec:finale'), 'разделы, включая «Итоги урока»');
  check(e16.includes('task:tokTask:done'), 'задача «Сколько стоит мелкий патч» решена');
  check(e16.includes('mis:attMis:0:seen'), 'лаборатория: первая миссия открыта');
  check(e16.some((e) => /^quiz:\d+\/8$/.test(e)), 'квиз: итог');
  check(new Set(e16).size === e16.length, 'каждое событие — один раз');
  const keys = got.flatMap((b) => Object.keys(b));
  check(keys.every((k) => k === 'p' || k === 'e'), 'в пачке только страница и события — ничего о читателе');

  console.log('Главная на телефоне');
  const m = await open('index.html', { width: 390, height: 844, dpr: 1, mobile: true, light: true }, true);
  await scrollAll(m); await m.eval('window.MRStats.flush(); true'); await sleep(400);
  const ei = events('index');
  console.log('  отправлено:', JSON.stringify(ei));
  check(ei.includes('open:phone') && ei.includes('sec:program'), 'открытие с телефона и разделы главной');

  console.log('Без разрешения (как в тестах и в локальной копии)');
  const before = got.length;
  const q = await open('lessons/1-5-diffusion-policy.html', { width: 1440, height: 900, light: true }, false);
  await scrollAll(q); await q.eval('window.MRStats && window.MRStats.flush(); true'); await sleep(400);
  const after = got.slice(before).filter((b) => b.p === '1-5-diffusion-policy');
  check(after.length === 0 && (await q.eval('window.MRStats.on')) === false, 'с file:// и без адреса ничего не отправляется' + (after.length ? ' — ушло: ' + JSON.stringify(after) : ''));

  console.log('Отзыв в конце урока 1.5');
  const before2 = got.length;
  const f = await open('lessons/1-5-diffusion-policy.html', { width: 1440, height: 900, light: true }, true);
  await f.eval(`document.querySelector('.fb').scrollIntoView({ block: 'center', behavior: 'instant' }); true`); await sleep(200);
  check(await f.eval('document.querySelector(".fb-more").hidden'), 'до оценки поле для текста скрыто');
  await f.eval(`document.querySelector('.fb-opts button[data-r="mid"]').click(); true`); await sleep(300);
  const fb1 = got.slice(before2).filter((b) => b.fb);
  check(fb1.length === 1 && fb1[0].fb.r === 'mid' && fb1[0].p === '1-5-diffusion-policy' && !('t' in fb1[0].fb), 'оценка «Местами сложно» ушла сразу, без текста');
  check(!(await f.eval('document.querySelector(".fb-more").hidden')), 'после оценки появилось поле «что осталось непонятным»');
  await f.eval(`document.querySelector('.fb-opts button[data-r="bad"]').click(); true`); await sleep(300);
  check(got.slice(before2).filter((b) => b.fb).length === 1, 'смена оценки не считается второй оценкой');
  await f.eval(`(() => { const t = document.querySelector('.fb textarea'); t.value = 'Неясно, как выбирать горизонт исполнения.'; document.querySelector('.fb-send').click(); return true; })()`); await sleep(300);
  const fb2 = got.slice(before2).filter((b) => b.fb && b.fb.t);
  check(fb2.length === 1 && fb2[0].fb.r === 'bad' && /горизонт/.test(fb2[0].fb.t), 'текст ушёл вместе с последней оценкой');
  check(!(await f.eval('document.querySelector(".fb-done").hidden')) && (await f.eval('localStorage.getItem("mr-fb:1-5-diffusion-policy")')) === 'bad', 'показано «Спасибо, отзыв записан», урок отмечен как оценённый');
  const nBefore = got.length;
  await f.S('Page.reload'); await f.waitFor('document.readyState === "complete"'); await sleep(900);
  check((await f.eval('document.querySelector(\'.fb-opts button[data-r="bad"]\').getAttribute("aria-pressed")')) === 'true' && got.slice(nBefore).every((b) => !b.fb), 'при повторном заходе оценка помнится и не отправляется снова');
  const link = await f.eval('document.querySelector(".fb-bug a").href');
  check(/github\.com\/oleg-Shipitko\/modern-robotics\/issues\/new\?title=/.test(link) && decodeURIComponent(link).includes('Урок: 1.5 Diffusion Policy'), 'ссылка «Сообщить на GitHub» с уроком в тексте задачи');

  await B.close(); srv.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
