// Проверка урока 0.1: загрузка, обучение сетей по умолчанию, ошибки консоли, эксперименты лабы 1, скриншоты.
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/0-1-dve-paradigmy.html');
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 120000);
  console.log('урок загружен, сети обучены');
  const out = (n) => path.resolve(__dirname, '../shots/' + n);
  await p.shot(out('l01-hero.png'));
  for (const sel of ['#paradigms', '#lab1', '#lab2', '#tradeoffs', '#spectrum', '#lab5', '#next', '#quiz', '#finale']) {
    await p.shotEl(out('l01-' + sel.slice(1) + '.png'), sel, 0);
  }
  // четвёртая архитектура
  await p.eval('document.querySelector("[data-arch=vla]").click()'); await sleep(300);
  await p.shotEl(out('l01-arch-vla.png'), '#arch', 6);
  // лаба 1: запустить первый эксперимент
  await p.eval('document.querySelector("#lab1").scrollIntoView({block: "start", behavior: "instant"})'); await sleep(300);
  await p.click('#runBtn'); await sleep(9000);
  console.log('лаба 1, статусы:', await p.eval('Array.from(document.querySelectorAll(".agent-status")).map(e => e.textContent.trim()).join(" | ")'));
  await p.shotEl(out('l01-lab1-run.png'), '#lab1Card', 6);
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 120000);
  console.log('телефон: ширина', await m.eval('document.documentElement.scrollWidth'));
  console.log('логи:', [...p.logs, ...m.logs].join(' | ') || 'нет');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
