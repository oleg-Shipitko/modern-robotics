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
  const r = await B.page(site('about.html'), { width: 1200, height: 900, light: true });
  await sleep(1500);
  console.log('about.html → ', await r.eval('location.href.split("/site/")[1]'));
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
