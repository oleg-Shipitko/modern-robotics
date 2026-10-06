// Программа на главной: готовые части открыты, перед частями в работе — разделитель «Скоро» со ссылкой на канал.
const { launch, sleep } = require('./cdp');
const path = require('path');
const site = (f) => 'file://' + path.resolve(__dirname, '../site/' + f);
const out = (n) => path.resolve(__dirname, '../shots/' + n);
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  let bad = 0;
  for (const vp of [{ width: 1440, height: 1000, light: true, t: 'light' }, { width: 1440, height: 1000, dark: true, t: 'dark' }, { width: 390, height: 844, dpr: 2, mobile: true, light: true, t: 'mobile' }]) {
    const p = await B.page(site('index.html'), vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const r = await p.eval(`(() => {
      const kids = [...document.getElementById('parts').children];
      const at = kids.findIndex((k) => k.classList.contains('soon'));
      const parts = kids.filter((k) => k.classList.contains('part'));
      const a = document.querySelector('.soon-note a');
      return JSON.stringify({ dividers: document.querySelectorAll('.soon').length, at, open: parts.filter((d) => d.open).length, later: parts.filter((d) => d.classList.contains('later')).length,
        note: document.querySelector('.soon-note').textContent, href: a && a.getAttribute('href'), links: document.querySelectorAll('#parts .lessons a').length,
        sw: document.documentElement.scrollWidth });
    })()`);
    const j = JSON.parse(r);
    const ok = j.dividers === 1 && j.at === 2 && j.open === 2 && j.later === 7 && /^https:\/\//.test(j.href || '') && j.links === 11 && j.sw <= vp.width;
    if (!ok) bad++;
    console.log(vp.t, ok ? 'ок' : 'ОШИБКА', JSON.stringify(j), p.logs.length ? p.logs.join(' | ') : '');
    await p.eval('document.querySelector(".soon").scrollIntoView({ block: "center" }); true'); await sleep(400);
    const top = await p.eval('Math.round(document.querySelectorAll("#parts .part")[1].getBoundingClientRect().top + scrollY)');
    await p.shot(out(`site-program-${vp.t}.png`), { x: 0, y: top - 20, width: vp.width, height: vp.t === 'mobile' ? 1100 : 900 });
  }
  await B.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
