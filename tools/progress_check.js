// Прогресс по курсу: урок 0.1 дочитан до итогов, 0.2 начат — главная показывает отметки, «Продолжить» и сброс.
// Страницы раздаются локальным сервером, чтобы у уроков и главной было одно хранилище, как на сайте.
// Запуск: node tools/progress_check.js   (снимки — в shots/progress-*.png)
const http = require('http'), fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const SITE = path.resolve(__dirname, '../site'), SHOTS = path.resolve(__dirname, '../shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const srv = http.createServer((req, res) => {
    let f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
    if (f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const B = await launch({ w: 1440, h: 900 });
  async function open(url, vp) {
    const p = await B.page('about:blank', vp || { width: 1440, height: 900, light: true });
    await p.S('Page.bringToFront'); await p.S('Page.navigate', { url: base + url });
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    return p;
  }
  async function readTo(p, upto) { // читаем раздел за разделом до раздела upto (или до конца)
    const ids = await p.eval('JSON.stringify([...document.querySelectorAll("section[id]")].map((s) => s.id))');
    for (const id of JSON.parse(ids)) { await p.eval(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: 'start', behavior: 'instant' }); true`); await sleep(250); if (id === upto) break; }
  }
  const cta = (p) => p.eval('JSON.stringify({ t: document.querySelector("#ctaMain span").textContent, href: document.getElementById("ctaMain").getAttribute("href"), note: document.getElementById("ctaProgress").hidden ? "" : document.getElementById("ctaProgress").textContent, reset: !document.getElementById("progressReset").hidden })').then(JSON.parse);

  console.log('Новый читатель');
  let h = await open('index.html');
  let c = await cta(h);
  check(c.t === 'Начать курс' && !c.note && !c.reset, 'на главной «Начать курс», строки прогресса и сброса нет');

  console.log('Урок 0.1 до итогов, урок 0.2 до третьего раздела');
  await readTo(await open('lessons/0-1-dve-paradigmy.html'));
  const l2 = await open('lessons/0-2-ustroystvo-robota.html');
  const third = await l2.eval('document.querySelectorAll("section[id]")[3].id');
  await readTo(l2, third);
  const store = JSON.parse(await l2.eval('localStorage.getItem("mr-progress")'));
  check(store['0-1-dve-paradigmy'] && store['0-1-dve-paradigmy'].f && store['0-2-ustroystvo-robota'] && !store['0-2-ustroystvo-robota'].f && store['0-2-ustroystvo-robota'].sec === third,
    `в браузере: 0.1 пройден, 0.2 начат и дочитан до раздела «${third}»`);

  console.log('Главная после чтения');
  for (const vp of [{ width: 1440, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, light: true, t: 'phone' }]) {
    h = await open('index.html', vp);
    c = await cta(h);
    check(c.t === 'Продолжить урок 0.2' && c.href === `lessons/0-2-ustroystvo-robota.html#${third}` && c.note === 'Пройдено уроков: 1 из 10. Сейчас — 0.2 «Устройство робота: приводы и сенсоры».' && c.reset, `${vp.t}: «${c.t}» ведёт на раздел ${third}, «${c.note}»`);
    const marks = JSON.parse(await h.eval('JSON.stringify([...document.querySelectorAll(".lsn-st")].map((e) => e.className.split(" ")[1] + ":" + e.parentElement.textContent.replace(/^(Пройден|Начат)\\. /, "").slice(0, 14)))'));
    check(marks.length === 2 && marks[0].startsWith('done') && marks[1].startsWith('started'), 'в программе отметки: ' + marks.join(', '));
    check(/пройдено 1/.test(await h.eval('document.querySelector(".part .count").textContent')), 'в шапке части 0: «пройдено 1»');
    await h.eval('window.scrollTo(0, 0); true'); await sleep(200);
    await h.shot(path.join(SHOTS, `progress-hero-${vp.t}.png`), { x: 0, y: 0, width: vp.width, height: vp.t === 'desk' ? 760 : 1100 });
    await h.shotEl(path.join(SHOTS, `progress-program-${vp.t}.png`), '#parts .part', 6);
  }
  console.log('Урок 0.2 до итогов');
  await readTo(await open('lessons/0-2-ustroystvo-robota.html'));
  c = await cta(await open('index.html'));
  check(c.t === 'Следующий урок: 0.3' && c.note === 'Пройдено уроков: 2 из 10. Дальше — 0.3 «Кинематика и управление».', `главная: «${c.t}», «${c.note}»`);
  console.log('Сброс');
  h = await open('index.html');
  await h.eval('window.confirm = () => true; document.querySelector("#progressReset button").click(); true'); await sleep(1500);
  c = await cta(h);
  check(c.t === 'Начать курс' && !c.reset && (await h.eval('localStorage.getItem("mr-progress")')) === null, 'после «Сбросить прогресс» — снова «Начать курс»');
  await B.close(); srv.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
