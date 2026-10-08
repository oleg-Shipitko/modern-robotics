// Главная целиком (светлая, тёмная, телефон), блок «Об авторе», меню ведёт к разделам, старая about.html перенаправляет.
const { launch, sleep } = require('./cdp');
const path = require('path');
const site = (f) => 'file://' + path.resolve(__dirname, '../site/' + f);
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const out = (n) => path.resolve(__dirname, '../shots/' + n);
  for (const vp of [{ width: 1440, height: 1000, light: true, t: 'light' }, { width: 1440, height: 1000, dark: true, t: 'dark' }, { width: 390, height: 844, dpr: 2, mobile: true, light: true, t: 'mobile' }]) {
    const p = await B.page(site('index.html'), vp);
    await p.waitFor('document.readyState === "complete"');
    await sleep(1500);
    const h = await p.eval('document.documentElement.scrollHeight');
    const sw = await p.eval('document.documentElement.scrollWidth');
    await p.shot(out(`site-index-${vp.t}.png`), { x: 0, y: 0, width: vp.width, height: Math.min(h, 9000) });
    console.log('index', vp.t, 'высота', h, sw > vp.width ? 'ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА ' + sw : 'ок', p.logs.length ? p.logs.join(' | ') : '');
  }
  const p = await B.page(site('index.html'), { width: 1440, height: 1000, light: true });
  await p.waitFor('document.readyState === "complete"'); await sleep(800);
  const links = await p.eval('[...document.querySelectorAll(".nav-links a")].map(a => a.getAttribute("href")).join(" ")');
  console.log('меню:', links);
  await p.eval('document.querySelector(\'.nav-links a[href="#about"]\').click()'); await sleep(1200);
  console.log('после клика «Об авторе»: hash', await p.eval('location.hash'), '| верх блока', await p.eval('Math.round(document.querySelector("#about").getBoundingClientRect().top)'), '| подсвечен', await p.eval('document.querySelector(".nav-links a.on") && document.querySelector(".nav-links a.on").textContent'));
  await p.shotEl(out('site-index-about.png'), '#about', 20);
  await p.shotEl(out('site-index-nav.png'), '.nav', 0);
  // «Что нового»: страница открывается, записи есть, в подвале главной ссылка с версией
  const cl = await B.page(site('changelog.html'), { width: 1200, height: 900, light: true });
  await cl.waitFor('document.readyState === "complete"'); await sleep(600);
  const nv = await cl.eval('document.querySelectorAll(".cl-v").length'), v1 = await cl.eval('(document.querySelector(".cl-v .ver") || {}).textContent');
  const foot = await p.eval('(document.querySelector("footer.foot a[href=\'changelog.html\']") || {}).textContent || ""');
  console.log('что нового:', nv >= 1 && /^\d+\.\d+$/.test(v1) && foot.includes(v1) ? 'ок' : 'ОШИБКА', '| записей', nv, '| версия', v1, '| подвал:', foot, cl.logs.length ? '| консоль: ' + cl.logs.join(' | ') : '');
  await cl.shot(out('site-changelog.png'), { x: 0, y: 0, width: 1200, height: Math.min(900, await cl.eval('document.documentElement.scrollHeight')) });
  // Политика конфиденциальности: страница открывается, в ней почта владельца; ссылка в подвале главной и «Что нового»
  for (const vp of [{ width: 1200, height: 900, light: true, t: 'light' }, { width: 1200, height: 900, dark: true, t: 'dark' }, { width: 390, height: 844, dpr: 2, mobile: true, light: true, t: 'mobile' }]) {
    const pp = await B.page(site('privacy.html'), vp);
    await pp.waitFor('document.readyState === "complete"'); await sleep(500);
    const info = JSON.parse(await pp.eval(`JSON.stringify({ h1: document.querySelector('h1').textContent, mail: (document.querySelector('a[href^="mailto:"]') || {}).textContent || '', h2: document.querySelectorAll('main h2').length, formal: document.querySelectorAll('#formal h3').length, sw: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`));
    const good = info.h1 === 'Политика конфиденциальности' && info.mail === 'oleg.ht.shipitko@yandex.ru' && info.h2 >= 9 && info.formal === 8 && info.sw <= vp.width && !pp.logs.length;
    console.log('политика', vp.t + ':', good ? 'ок' : 'ОШИБКА', '| почта', info.mail, '| разделов', info.h2, '| формальных', info.formal, info.sw > vp.width ? '| ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА ' + info.sw : '', pp.logs.length ? '| консоль: ' + pp.logs.join(' | ') : '');
    await pp.shot(out(`site-privacy-${vp.t}.png`), { x: 0, y: 0, width: vp.width, height: Math.min(info.h, 4000) });
  }
  const ppFoot = await p.eval('!!document.querySelector("footer.foot a[href=\'privacy.html\']")') && await cl.eval('!!document.querySelector("footer.foot a[href=\'privacy.html\']")');
  console.log('ссылка на политику в подвале главной и «Что нового»:', ppFoot ? 'ок' : 'ОШИБКА');
  const r = await B.page(site('about.html'), { width: 1200, height: 900, light: true });
  await sleep(1500);
  console.log('about.html → ', await r.eval('location.href.split("/site/")[1]'));
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
