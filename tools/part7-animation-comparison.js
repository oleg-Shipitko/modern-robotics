// Контрольная страница «было / стало» для анимаций 7.3–7.5.
const path = require('path');
const { launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..');
const shots = (n) => path.join(ROOT, 'shots', n);
const preview = 'file://' + path.join(ROOT, 'previews/part7-animation-comparison/index.html');
const lesson75 = 'file://' + path.join(ROOT, 'site/lessons/7-5-proverka-i-generatsiya-dannykh.html');
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  try {
    // Для левой колонки нужен светлый контрольный кадр текущей 7.5.
    const old = await B.page(lesson75, { width: 1280, height: 900, light: true });
    await old.waitFor('window.__lessonReady === true', 30000); await sleep(350);
    await old.eval(`Anim.seek(document.querySelector('#evalFlow'),2.4);true`);
    await old.shotEl(shots('l75-flow.png'), '#loop .flow-card', 6);
    check(!old.logs.length, 'текущий урок 7.5: консоль чистая');

    const p = await B.page(preview, { width: 1360, height: 1000, light: true });
    await p.waitFor('window.__previewReady === true && document.querySelectorAll("canvas[data-anim][data-anim-on]").length === 3', 60000); await sleep(650);
    check((await p.eval(`document.querySelectorAll('.compare').length`)) === 3, 'три сравнения «было / стало»');
    check((await p.eval(`document.querySelectorAll('canvas[data-anim]').length`)) === 3, 'три новых живых прототипа');
    check((await p.eval(`document.documentElement.scrollWidth`)) <= 1360, 'компьютер: нет горизонтальной прокрутки');
    for (const [id, kind, t, name] of [
      ['l73', 'l73-v2', 4.4, 'part7-anim-l73-compare.png'],
      ['l74', 'l74-v2', 4.4, 'part7-anim-l74-compare.png'],
      ['l75', 'l75-v2', 5.2, 'part7-anim-l75-compare.png'],
    ]) {
      await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="${kind}"]'),${t});true`);
      await p.eval(`document.getElementById('${id}').scrollIntoView({behavior:'instant'});true`); await sleep(180);
      await p.shotEl(shots(name), `#${id} .compare`, 7);
    }
    const changed = await p.eval(`(() => { const out=[]; for(const cv of document.querySelectorAll('canvas[data-anim]')){Anim.seek(cv,1);const a=cv.toDataURL();Anim.seek(cv,4.5);out.push(a!==cv.toDataURL())} return JSON.stringify(out) })()`).then(JSON.parse);
    check(changed.every(Boolean), 'каждый прототип действительно движется');
    check(!p.logs.length, 'страница сравнения: консоль чистая');

    await p.eval(`document.documentElement.dataset.theme='dark';Anim.seek(document.querySelector('canvas[data-anim="l75-v2"]'),5.2);true`); await sleep(200);
    await p.shotEl(shots('part7-anim-l75-compare-dark.png'), '#l75 .compare', 7);
    check(!p.logs.length, 'тёмная тема: консоль чистая');

    const m = await B.page(preview, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__previewReady === true && document.querySelectorAll("canvas[data-anim][data-anim-on]").length === 3', 60000); await sleep(650);
    check((await m.eval(`document.documentElement.scrollWidth`)) <= 390, 'телефон: нет горизонтальной прокрутки');
    check((await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].every((c)=>c.dataset.layout==='n')`)), 'телефон: три отдельные узкие раскладки');
    for (const [id, kind, t, name] of [
      ['l73', 'l73-v2', 4.4, 'part7-anim-l73-mobile.png'],
      ['l74', 'l74-v2', 4.4, 'part7-anim-l74-mobile.png'],
      ['l75', 'l75-v2', 5.2, 'part7-anim-l75-mobile.png'],
    ]) {
      await m.eval(`Anim.seek(document.querySelector('canvas[data-anim="${kind}"]'),${t});true`);
      await m.eval(`document.querySelector('#${id} .after').scrollIntoView({behavior:'instant'});true`); await sleep(160);
      await m.shotEl(shots(name), `#${id} .after`, 5);
    }
    check(!m.logs.length, 'телефон: консоль чистая');

    const rm = await B.page('about:blank', { width: 900, height: 700, light: true });
    await rm.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await rm.S('Page.navigate', { url: preview }); await rm.waitFor('window.__previewReady === true', 60000); await sleep(500);
    check((await rm.eval(`document.querySelectorAll('.anim-play').length`)) === 3, 'уменьшенное движение: у каждой схемы есть запуск');
    check(!rm.logs.length, 'уменьшенное движение: консоль чистая');
  } finally { await B.close(); }
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
