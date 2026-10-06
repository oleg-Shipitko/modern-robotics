// Урок 2.1 «Transporter и CLIPort»: лаборатории дают обещанные в тексте исходы, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l21-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-10-10 python3 lessons/build.py l21.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/2-1-transporter-i-cliport.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^1[01] миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q, #recall [data-recall] *').length`)) > 0, 'разминка по уроку 1.8 на месте');
  await p.eval('window.__l21.SPEED.k = 20; true');
  // 1. мини-CLIP
  const c0 = J(await p.eval(`JSON.stringify(window.__l21.LabClip.api.state())`));
  check(c0.hits < 8, 'до обучения матрица пёстрая: подписей со своей картинкой ' + c0.hits + ' из 8');
  const c1 = J(await p.eval(`window.__l21.LabClip.api.train().then((s) => JSON.stringify(s))`, true));
  check(c1.hits === 8, 'после обучения каждая подпись нашла свою картинку: ' + c1.hits + ' из 8');
  await p.eval(`window.__l21.LabClip.api.setQuery('blue', 'bowl'); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabClip.api.state())`)).topOk, 'поиск «синяя миска» находит синюю миску');
  const c2 = J(await p.eval(`window.__l21.LabClip.api.setQuery('purple', 'cube'), window.__l21.LabClip.api.search().then((s) => JSON.stringify(s))`, true));
  check(c2.topOk, 'фиолетовый кубик, которого не было в обучении, найден на первом месте');
  await p.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-clip.png'), '#words .lab', 6);
  // 2. карта против регрессии
  const k1 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k1.map >= 0.9 && k1.reg <= 0.2, `одна демонстрация: карта ${Math.round(k1.map * 30)}/30, регрессия ${Math.round(k1.reg * 30)}/30`);
  await p.eval(`window.__l21.LabPick.api.setN(20); true`);
  const k2 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k2.map >= 0.9 && k2.reg <= 0.3, `двадцать демонстраций: карта ${Math.round(k2.map * 30)}/30, регрессия ${Math.round(k2.reg * 30)}/30`);
  await p.eval(`window.__l21.LabPick.api.setTask('twoRed'); true`);
  const k3 = J(await p.eval(`window.__l21.LabPick.api.run().then((s) => JSON.stringify(s))`, true));
  check(k3.map >= 0.9 && k3.reg <= 0.3, `два кубика: карта ${Math.round(k3.map * 30)}/30, регрессия ${Math.round(k3.reg * 30)}/30`);
  await p.eval(`document.getElementById('maps').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-pick.png'), '#maps .lab', 6);
  // 3. укладка
  await p.eval(`window.__l21.LabPlace.api.setK(4); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabPlace.api.state())`)).score >= 0.95, 'гнездо под 40°: поворот 40° даёт совпадение не меньше 95%');
  await p.eval(`window.__l21.LabPlace.api.setK(2); true`);
  check(J(await p.eval(`JSON.stringify(window.__l21.LabPlace.api.state())`)).score < 0.8, 'на 20° совпадение заметно хуже');
  const t1 = J(await p.eval(`window.__l21.LabPlace.api.rotateAndScan().then((s) => JSON.stringify(s))`, true));
  check(t1.k * 10 === 130 && t1.s >= 0.95, 'после поворота гнезда перебор нашёл 130°');
  await p.eval(`document.getElementById('place').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-place.png'), '#place .lab', 6); await p.shotEl(out('l21-chart.png'), '#place .chart-card', 6);
  // 4. CLIPort
  const res = {};
  for (const [mode, color] of [['none', 'red'], ['robot', 'red'], ['robot', 'purple'], ['cliport', 'purple'], ['cliport', 'orange']]) {
    await p.eval(`window.__l21.LabCliport.api.setMode('${mode}'); window.__l21.LabCliport.api.setColor('${color}'); true`); await sleep(200);
    res[mode + ':' + color] = J(await p.eval(`window.__l21.LabCliport.api.run().then((s) => JSON.stringify(s))`, true)).rate;
  }
  check(res['none:red'] < 0.85, 'без слов красный кубик — ' + Math.round(res['none:red'] * 20) + '/20');
  check(res['robot:red'] >= 0.9 && res['robot:purple'] <= 0.2, `слова из демонстраций: красный ${Math.round(res['robot:red'] * 20)}/20, фиолетовый ${Math.round(res['robot:purple'] * 20)}/20`);
  check(res['cliport:purple'] >= 0.9 && res['cliport:orange'] >= 0.9, `CLIPort на новых цветах: фиолетовый ${Math.round(res['cliport:purple'] * 20)}/20, оранжевый ${Math.round(res['cliport:orange'] * 20)}/20`);
  await p.eval(`document.getElementById('cliport').scrollIntoView({ behavior: 'instant' }); true`); await sleep(400); await p.shotEl(out('l21-cliport.png'), '#cliport .lab', 6);
  // квиз
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l21-clip-dark.png'), '#words .lab', 6);
  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l21.SPEED.k = 20; true');
  await m.eval(`window.__l21.LabClip.api.train().then(() => true)`, true);
  await m.eval(`window.__l21.LabPick.api.run().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await m.eval(`document.getElementById('words').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out('l21-m-clip.png'), '#words .lab', 4);
  await m.eval(`document.getElementById('maps').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await m.shotEl(out('l21-m-pick.png'), '#maps .lab', 4);
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
