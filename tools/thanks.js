// Кнопка «Сказать спасибо»: сайт отдаётся по HTTP, счётчик — заглушка с тем же поведением, что у функции
// (server/thanks/index.py: GET — число, POST только с Origin сайта, CORS). Адрес заглушки подменяется в браузере,
// config.json не трогаем. Проверки: число, нажатие, общая отметка для главной и уроков, повтор после сбоя сети,
// отказ сервера без бесконечных повторов, режим без счётчика; скриншоты — shots/thanks-*.png.
const { launch, sleep } = require('./cdp');
const http = require('http');
const fs = require('fs');
const path = require('path');
const SITE_DIR = path.resolve(__dirname, '../site');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails.push(msg); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const api = { n: 41, posts: 0, failNext: 0, forbid: false, origin: '' };

(async () => {
  const sitePort = await listen(http.createServer((q, s) => {
    const f = path.join(SITE_DIR, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(SITE_DIR) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(fs.readFileSync(f));
  }));
  api.origin = `http://127.0.0.1:${sitePort}`;
  const apiPort = await listen(http.createServer((q, s) => {
    const origin = q.headers.origin || '';
    const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin === api.origin ? origin : '*', Vary: 'Origin' };
    const send = (code, body) => { s.writeHead(code, h); s.end(JSON.stringify(body)); };
    if (q.method === 'GET') return send(200, { n: api.n });
    if (q.method === 'POST') {
      api.posts++;
      if (api.failNext) { api.failNext--; return send(503, { error: 'unavailable' }); }   // база недоступна
      if (api.forbid || origin !== api.origin) return send(403, { error: 'origin' });
      return send(200, { n: ++api.n });
    }
    send(405, { error: 'method' });
  }));
  const URL_API = `http://127.0.0.1:${apiPort}/`;
  const SITE = (f) => `http://127.0.0.1:${sitePort}/${f}`;

  async function open(B, file, vp, withApi = true) {
    const p = await B.page('about:blank', vp);
    // адрес счётчика подменяем всегда: заглушкой или пустой строкой — настоящую функцию проверки не трогают
    await p.S('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'MR_THANKS_API', { get: () => ${JSON.stringify(withApi ? URL_API : '')}, set: () => {}, configurable: true });` });
    await p.S('Page.navigate', { url: SITE(file) });
    await p.waitFor('document.readyState === "complete" && !!document.querySelector(".thanks-btn")');
    await sleep(500);
    return p;
  }
  const view = (p) => p.eval(`(() => { const b = document.querySelector('[data-thanks]'); const n = b.querySelector('.thanks-n');
    return { label: b.querySelector('.thanks-label').textContent, n: n.hidden ? null : n.textContent, done: b.classList.contains('done'),
      pressed: b.querySelector('.thanks-btn').getAttribute('aria-pressed'), after: b.querySelector('.thanks-after').textContent,
      link: (b.querySelector('.thanks-after a') || {}).href || '', text: !b.querySelector('.thanks-text').hidden, mark: localStorage.getItem('mr-thanks') }; })()`);
  const click = async (p) => { await p.eval(`document.querySelector('[data-thanks] .thanks-btn').click()`); await sleep(400); };

  console.log('Главная и урок, общий счётчик');
  let B = await launch({ w: 1440, h: 1000 });
  let p = await open(B, 'index.html', { width: 1440, height: 1000, light: true });
  let v = await view(p);
  ok(v.label === 'Сказать спасибо' && v.n === '41' && !v.done && v.text, `до нажатия: «${v.label}», число ${v.n}`);
  ok(await p.eval('!!document.querySelector("#about [data-thanks]")'), 'на главной кнопка в блоке «Об авторе»');
  ok(await p.eval('[...document.querySelectorAll("a[href*=\\"t.me/\\"]")].every(a => a.href === "https://t.me/c3po_robotics")'), 'из Telegram на главной только канал «Продакт роботов»');
  ok(!(await p.eval('!!document.querySelector(".draft-note")')), 'плашки «Черновик» нет');
  await p.shotEl(out('thanks-index-before.png'), '#about', 16);
  await click(p);
  v = await view(p);
  ok(v.done && v.label === 'Спасибо сказано' && v.n === '42' && v.pressed === 'true' && v.mark === 'sent' && api.n === 42, `после нажатия: «${v.label}», число ${v.n}, отметка ${v.mark}`);
  ok(/канале «Продакт роботов»/.test(v.after) && v.link === 'https://t.me/c3po_robotics' && !v.text, 'после нажатия — ссылка на канал вместо призыва');
  await p.shotEl(out('thanks-index-after.png'), '#about', 16);
  await click(p);
  ok(api.posts === 1 && api.n === 42, 'повторное нажатие не прибавляет');
  p = await open(B, 'index.html', { width: 1440, height: 1000, light: true });
  v = await view(p);
  ok(v.done && v.n === '42' && api.posts === 1, 'после перезагрузки: уже сказано, число 42, без нового POST');
  p = await open(B, 'lessons/1-2-dagger.html', { width: 1440, height: 1000, light: true });
  v = await view(p);
  ok(v.done && v.n === '42', 'в уроке 1.2 та же отметка и то же число');
  ok(await p.eval('(() => { const e = document.querySelector(".thanks-end"), m = document.querySelector("main"); return !!e && m.contains(e) && !e.nextElementSibling; })()'), 'в уроке блок — последний в main, перед подвалом');
  await B.close();

  console.log('Новый читатель: урок, тёмная тема, телефон');
  B = await launch({ w: 1440, h: 1000 });
  p = await open(B, 'lessons/0-1-dve-paradigmy.html', { width: 1440, height: 1000, dark: true });
  v = await view(p);
  ok(!v.done && v.n === '42' && v.label === 'Сказать спасибо', 'новый браузер: не нажато, число 42');
  await p.shotEl(out('thanks-lesson-dark-before.png'), '.thanks-end', 24);
  await click(p);
  v = await view(p);
  ok(v.done && v.n === '43' && api.n === 43, 'нажатие в уроке: 43');
  await p.shotEl(out('thanks-lesson-dark-after.png'), '.thanks-end', 24);
  const m = await open(B, 'lessons/1-1-behavior-cloning.html', { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  const sw = await m.eval('document.documentElement.scrollWidth');
  ok(sw <= 390, `телефон: без горизонтальной прокрутки (${sw})`);
  await m.shotEl(out('thanks-lesson-mobile.png'), '.thanks-end', 16);
  const mi = await open(B, 'index.html', { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await mi.shotEl(out('thanks-index-mobile.png'), '#about', 12);
  await B.close();

  console.log('Сервер временно недоступен (503) и повтор');
  B = await launch({ w: 1200, h: 900 });
  api.failNext = 1;
  p = await open(B, 'lessons/0-2-ustroystvo-robota.html', { width: 1200, height: 900, light: true });
  await click(p); await sleep(300);
  v = await view(p);
  ok(v.done && v.mark === 'pending' && api.n === 43, `503: кнопка нажата, отметка ${v.mark}, счётчик не изменился`);
  p = await open(B, 'lessons/0-2-ustroystvo-robota.html', { width: 1200, height: 900, light: true });
  v = await view(p);
  ok(v.mark === 'sent' && api.n === 44 && v.n === '44', `при следующем заходе повтор: отметка ${v.mark}, счётчик ${api.n}`);
  await B.close();

  console.log('Сервер отказал (403) — без бесконечных повторов');
  B = await launch({ w: 1200, h: 900 });
  api.forbid = true; const posts0 = api.posts;
  p = await open(B, 'index.html', { width: 1200, height: 900, light: true });
  await click(p);
  v = await view(p);
  ok(v.mark === 'sent' && api.n === 44, 'отказ: отметка sent, число не изменилось');
  p = await open(B, 'index.html', { width: 1200, height: 900, light: true });
  ok(api.posts === posts0 + 1, 'после перезагрузки POST не повторяется');
  api.forbid = false;
  await B.close();

  console.log('Без адреса счётчика (THANKS_API пуст)');
  B = await launch({ w: 1200, h: 900 });
  const gets = api.posts;
  p = await open(B, 'lessons/1-1-behavior-cloning.html', { width: 1200, height: 900, light: true }, false);
  v = await view(p);
  ok(v.n === null && !v.done, 'число не показывается, кнопка есть');
  await click(p);
  v = await view(p);
  ok(v.done && v.mark === 'sent' && api.posts === gets, 'нажатие работает локально, запросов нет');
  const errs = p.logs.filter((l) => /exception|error/i.test(l));
  ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await B.close();

  console.log(fails.length ? `Ошибок: ${fails.length}` : 'Готово.');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
