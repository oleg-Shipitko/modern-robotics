// Проверка интерактивов первого экрана: ошибки консоли, поведение моделей, скриншоты (светлая/тёмная/мобильная).
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/index.html');
const only = process.argv[2];
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const out = (n) => path.resolve(__dirname, '../shots/' + n);
  for (const key of ['modes', 'cspace', 'walk']) {
    if (only && only !== key) continue;
    for (const mode of [{ tag: 'light', light: true }, { tag: 'dark', dark: true }, { tag: 'mobile', width: 390, height: 844, dpr: 2, mobile: true, light: true }]) {
      const vp = mode.width ? { width: mode.width, height: mode.height, dpr: mode.dpr, mobile: true, light: true } : { width: 1440, height: 1000, dark: mode.dark, light: mode.light };
      const p = await B.page(URL0 + '?hero=' + key, vp);
      await p.waitFor('document.readyState === "complete" && window.__hero && window.__hero()');
      await sleep(key === 'modes' ? 4200 : 3000);
      const st = await p.eval('JSON.stringify(window.__hero().state())');
      const sw = await p.eval('document.documentElement.scrollWidth');
      console.log(key, mode.tag, st, sw > (mode.width || 1440) ? 'ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА ' + sw : '');
      if (mode.tag === 'mobile') await p.shotEl(out(`hero-${key}-mobile.png`), '#heroDemo', 6);
      else await p.shotEl(out(`hero-${key}-${mode.tag}.png`), '.hero', 0);
      if (p.logs.length) console.log('  логи:', p.logs.join('\n  '));
      if (mode.tag === 'light' && key === 'modes') {
        for (const pl of [0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1]) {
          const r = await p.eval(`(() => { const h = window.__hero(); h.set({ pLeft: ${pl} }); return JSON.stringify(h.state()); })()`);
          console.log('  доля слева', pl, r);
        }
        for (const O of [{ x: 216, y: 160 }, { x: 284, y: 260 }]) console.log('  препятствие', JSON.stringify(O), await p.eval(`(() => { const h = window.__hero(); h.set({ pLeft: 0.5, O: ${JSON.stringify(O)} }); return JSON.stringify(h.state()); })()`));
      }
      if (mode.tag === 'light' && key === 'walk') {
        for (const m of [0.6, 0.9, 1.1, 1.3, 1.6]) {
          await p.eval(`(() => { const h = window.__hero(); h.push(1, ${m}); })()`); await sleep(2600);
          console.log('  толчок', m, await p.eval('JSON.stringify(window.__hero().state())'));
          await sleep(2600);
        }
        await p.eval('window.__hero().walk(0.8)'); await sleep(4000);
        console.log('  ходьба 0.8', await p.eval('JSON.stringify(window.__hero().state())'));
        await p.shotEl(out('hero-walk-walking.png'), '#heroDemo', 0);
        await p.eval('window.__hero().push(-1, 0.6)'); await sleep(2000);
        console.log('  толчок назад на ходу', await p.eval('JSON.stringify(window.__hero().state())'));
      }
      if (mode.tag === 'light' && key === 'cspace') {
        for (let i = 0; i < 4; i++) { await sleep(2500); console.log('  ', await p.eval('JSON.stringify(window.__hero().state())')); }
      }
    }
  }
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
