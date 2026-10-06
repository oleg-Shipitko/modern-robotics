// Разминка во всех уроках: три вопроса, верный ответ подсвечивается при любом порядке вариантов, консоль чистая.
const { launch, sleep } = require('./cdp');
const L = ['0-2-ustroystvo-robota', '0-3-kinematika-i-upravlenie', '0-4-otsenka-sostoyaniya-i-planirovanie', '1-1-behavior-cloning', '1-2-dagger', '1-3-multimodalnost-deystviy', '1-4-diffuzionnye-modeli', '1-5-diffusion-policy', '1-6-transformer', '1-7-act', '1-8-flow-matching'];
(async () => {
  const B = await launch({ w: 1300, h: 900 }); let bad = 0;
  for (const l of L) {
    for (const vp of [{ width: 1280, height: 900, light: true }, { width: 390, height: 844, mobile: true, dark: true }]) {
      const p = await B.page(`file://${require('path').resolve(__dirname, '../site/lessons')}/${l}.html`, vp);
      await p.waitFor('document.readyState === "complete"'); await sleep(700);
      const r = JSON.parse(await p.eval(`(() => { const D = JSON.parse(document.getElementById('recallData').textContent); const qs = [...document.querySelectorAll('.rc-q')];
        // в первом вопросе жмём неверный вариант, в остальных — верный
        qs.forEach((c, i) => { const btns = [...c.querySelectorAll('.rc-opt')]; const right = btns.find((b) => b.textContent === D.q[i].o[D.q[i].a]);
          (i === 0 ? btns.find((b) => b !== right) : right).click(); });
        return JSON.stringify({ n: qs.length, ok: qs.map((c, i) => c.querySelector('.rc-opt.ok').textContent === D.q[i].o[D.q[i].a]), total: document.querySelector('.rc-total').textContent, sw: document.documentElement.scrollWidth, links: [...document.querySelectorAll('.rc-exp a')].map((a) => a.getAttribute('href')) }); })()`));
      const good = r.n === 3 && r.ok.every(Boolean) && /^Верно 2 из 3/.test(r.total) && r.sw <= vp.width && r.links.length === 3 && !p.logs.length;
      if (!good) bad++;
      console.log(good ? 'ок ' : 'ОШИБКА', l, vp.width, r.total.slice(0, 14), p.logs.join(' | '));
    }
  }
  await B.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
