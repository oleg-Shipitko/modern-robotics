// Браузерная проверка урока 7.5: node tools/lesson75-browser.js
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const pageUrl = (lang) => 'file://' + path.join(ROOT, lang === 'en' ? 'site/en/lessons/7-5-proverka-i-generatsiya-dannykh.html' : 'site/lessons/7-5-proverka-i-generatsiya-dannykh.html');
let ok = 0, fail = 0;
function check(value, message) {
  if (value) { ok++; console.log('✓', message); }
  else { fail++; console.error('✗', message); }
}
const J = (s) => JSON.parse(s);
async function ready(page) { await page.waitFor('window.__lessonReady === true', 60000); await sleep(400); }
async function inspect(page) {
  return J(await page.eval(`JSON.stringify((() => {
    const r = (s) => { const x = document.querySelector(s).getBoundingClientRect(); return { l:x.left, r:x.right, t:x.top, b:x.bottom, w:x.width, h:x.height, c:x.left+x.width/2 }; };
    const prose = r('#loop .prose'), flow = r('#loop .flow-card'), quiz = r('#quiz .prose');
    return {
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      title: document.title, lang: document.documentElement.lang,
      quizCards: document.querySelectorAll('.q-card').length,
      statCanvases: document.querySelectorAll('.stat-fig .stat-bars').length,
      numberFigures: document.querySelectorAll('.stat-fig.number-fig').length,
      flowCanvas: r('#evalFlow'), examCanvas: r('#examCv'), screenCanvas: r('#screenCv'),
      examPanes: [r('#examModelCv'), r('#examRealCv')], screenLive: r('#screenLive'),
      centeredFlow: Math.abs(innerWidth/2-flow.c), flowWidth: flow.w, centeredQuiz: Math.abs(innerWidth/2-quiz.c), quizWidth: quiz.w,
      labs: [...document.querySelectorAll('.lab.lab-wide')].map((e) => { const x=e.getBoundingClientRect(); return {w:x.width,l:x.left,r:x.right}; }),
      labBadges: document.querySelectorAll('.lab-badge').length,
      math: document.querySelectorAll('.katex').length,
      glossary: document.querySelectorAll('[data-glossary],.glossary-term,.term').length,
      ready: window.__lessonReady === true
    };
  })())`));
}
async function runMission(page, root, option = 2) {
  await page.eval(`document.querySelector(${JSON.stringify(root + ` .m-bet button:nth-child(${option})`)}).click()`);
  await page.click(root + ' .g-go');
  await page.waitFor(`!document.querySelector(${JSON.stringify(root + ' .g-next')}).hidden`, 12000);
  return J(await page.eval(`JSON.stringify({done:document.querySelector(${JSON.stringify(root + ' .g-steps li.cur')}).classList.contains('done'), out:document.querySelector(${JSON.stringify(root + ' .g-out')}).textContent, status:document.querySelector(${JSON.stringify(root === '#examMis' ? '#examStatus' : '#screenStatus')}).textContent})`));
}
async function nextMission(page, root) { await page.eval(`document.querySelector(${JSON.stringify(root + ' .g-next')}).click()`); await sleep(40); }
async function pressed(page, selector) { return page.eval(`document.querySelector(${JSON.stringify(selector + ' [aria-pressed="true"]')}).dataset.v`); }
async function setRange(page, selector, value) { await page.eval(`(() => { const x=document.querySelector(${JSON.stringify(selector)}); x.value=${JSON.stringify(String(value))}; x.dispatchEvent(new Event('input',{bubbles:true})); })()`); }

(async () => {
  const browser = await launch({ w: 1440, h: 1000 });
  try {
    for (const lang of ['ru', 'en']) {
      const p = await browser.page(pageUrl(lang), { width: 1440, height: 1000, light: true });
      await ready(p);
      const m = await inspect(p);
      if (process.env.L75_DEBUG) console.log(lang, m);
      check(m.ready && m.lang === lang, `${lang.toUpperCase()}: страница инициализировалась с правильным языком`);
      check(m.scrollWidth <= m.width + 1 && m.labs.every((x) => x.l >= 0 && x.r <= m.width + 1), `${lang.toUpperCase()}: нет горизонтального переполнения на 1440 px`);
      check(m.quizCards === 8 && m.statCanvases === 3 && m.numberFigures === 3 && m.math >= 5 && m.labBadges === 2, `${lang.toUpperCase()}: три диаграммы и три альтернативные числовые сводки отрисовались`);
      check(m.centeredFlow < 1.5 && m.flowWidth > 1000 && m.centeredQuiz < 1.5 && m.quizWidth <= 721, `${lang.toUpperCase()}: схема использует полную ширину, квиз отцентрирован`);
      check(m.flowCanvas.w > 700 && m.labs.every((x) => x.w > 1000) && m.examCanvas.w > 600 && m.screenCanvas.w > 600 && m.examPanes.every((x) => x.w > 280) && m.screenLive.w > 600, `${lang.toUpperCase()}: лаборатории используют полную ширину, а сравнение показано рядом`);
      const first = await runMission(p, '#examMis');
      check(first.done && first.out.length > 20 && /D|стол|table/i.test(first.status), `${lang.toUpperCase()}: первая миссия лаборатории 1 проходит через интерфейс`);
      await nextMission(p, '#examMis');
      check(await pressed(p, '#rolloutCtl') === '0' && await pressed(p, '#failureCtl') === '0', `${lang.toUpperCase()}: вторая миссия лаборатории 1 не подставляет решение`);
      await p.eval(`document.querySelector('#rolloutCtl button[data-v="6"]').click()`);
      const examCoverage = await runMission(p, '#examMis');
      check(examCoverage.done, `${lang.toUpperCase()}: пользователь сам собирает опыт без неудач`);
      await nextMission(p, '#examMis');
      check(await pressed(p, '#failureCtl') === '0', `${lang.toUpperCase()}: третья миссия сохраняет найденное состояние вместо готового ответа`);
      await p.eval(`document.querySelector('#failureCtl button[data-v="1"]').click()`);
      const examFailures = await runMission(p, '#examMis');
      check(examFailures.done, `${lang.toUpperCase()}: пользователь сам добавляет неудачи и проходит пороги`);
      const second = await runMission(p, '#screenMis');
      check(second.done && /P06|best|лучш/i.test(second.out) && /500/.test(second.status), `${lang.toUpperCase()}: первая миссия лаборатории 2 проходит через интерфейс`);
      await nextMission(p, '#screenMis');
      check(await p.eval(`document.querySelector('#kCtl').value`) === '1', `${lang.toUpperCase()}: граница второй миссии не подставлена автоматически`);
      await setRange(p, '#kCtl', 4);
      const screenBoundary = await runMission(p, '#screenMis', 1);
      check(screenBoundary.done, `${lang.toUpperCase()}: пользователь сам находит минимальную границу k = 4`);
      await nextMission(p, '#screenMis');
      check(await p.eval(`document.querySelector('#kCtl').value`) === '4', `${lang.toUpperCase()}: третья миссия начинает с найденной границы`);
      await setRange(p, '#kCtl', 20);
      const screenWide = await runMission(p, '#screenMis');
      check(screenWide.done, `${lang.toUpperCase()}: пользователь сам расширяет допуск до двадцати кандидатов`);
      await p.click('#quizBox .q-card:first-child .q-opt:first-child');
      check(await p.eval(`document.querySelector('#quizBox .q-card:first-child').dataset.done === '1' && !document.querySelector('#quizBox .q-card:first-child .q-exp').hidden`), `${lang.toUpperCase()}: квиз отвечает и показывает разбор`);
      check(!p.logs.some((x) => /exception|error|failed/i.test(x)), `${lang.toUpperCase()}: консоль без ошибок`);
      if (lang === 'ru') {
        const flowHashes = [];
        for (const [i, t] of [0.8, 2.8, 5.2].entries()) {
          flowHashes.push(await p.eval(`(() => { const c=document.getElementById('evalFlow'); Anim.seek(c, ${t}); const d=c.toDataURL(); let h=0; for(let i=0;i<d.length;i+=11) h=(h*31+d.charCodeAt(i))>>>0; return h; })()`));
          await p.shotEl(path.join(SHOTS, `l75-flow-${i + 1}.png`), '#loop .flow-card', 8);
        }
        check(new Set(flowHashes).size === flowHashes.length, 'RU: три смысловых состояния новой схемы визуально различаются');
        await p.shotEl(path.join(SHOTS, 'l75-flow.png'), '#loop .flow-card', 8);
        await p.shotEl(path.join(SHOTS, 'l75-evidence-cost.png'), '#slow .stat-fig', 8);
        await p.shotEl(path.join(SHOTS, 'l75-evidence-studies.png'), '#works', 8);
        await p.shotEl(path.join(SHOTS, 'l75-lab1.png'), '#exam .lab', 8);
        await p.shotEl(path.join(SHOTS, 'l75-lab2.png'), '#screen .lab', 8);
      }
    }

    const mobile = await browser.page(pageUrl('ru'), { width: 390, height: 844, mobile: true, light: true });
    await ready(mobile);
    const mm = await inspect(mobile);
    if (process.env.L75_DEBUG) console.log('mobile', mm);
    check(mm.scrollWidth <= 391 && mm.labs.every((x) => x.l >= -1 && x.r <= 391), 'RU: нет горизонтального переполнения на телефоне 390 px');
    check(mm.flowCanvas.w >= 320 && mm.examCanvas.w >= 320 && mm.screenCanvas.w >= 320, 'RU: анимация и обе сцены используют ширину телефона');
    const order = J(await mobile.eval(`JSON.stringify((() => { const top=document.querySelector('#examMis .m-top').getBoundingClientRect(), scene=document.querySelector('#examCv').getBoundingClientRect(), bottom=document.querySelector('#examMis .m-bottom').getBoundingClientRect(); return {top:top.top,scene:scene.top,bottom:bottom.top}; })())`));
    check(order.top < order.scene && order.scene < order.bottom, 'RU: на телефоне порядок совпадает с действием — задача, сцена, результат');
    for (const [i, t] of [0.8, 2.8, 5.2].entries()) { await mobile.eval(`Anim.seek(document.getElementById('evalFlow'), ${t}); true`); await mobile.shotEl(path.join(SHOTS, `l75-mobile-flow-${i + 1}.png`), '#loop .flow-card', 4); }
    await mobile.shotEl(path.join(SHOTS, 'l75-mobile-lab1.png'), '#exam .lab', 4);
    check(!mobile.logs.some((x) => /exception|error|failed/i.test(x)), 'RU: мобильная консоль без ошибок');

    const dark = await browser.page(pageUrl('ru'), { width: 1440, height: 1000, dark: true });
    await ready(dark);
    const colors = J(await dark.eval(`JSON.stringify((() => { const b=getComputedStyle(document.body), c=document.querySelector('#evalFlow'); return {scheme:document.documentElement.dataset.theme||'', bg:b.backgroundColor, canvas:[c.width,c.height]}; })())`));
    check(colors.bg && colors.canvas[0] > 0 && colors.canvas[1] > 0, 'RU: тёмная тема и канвас отрисовались');
    await dark.shotEl(path.join(SHOTS, 'l75-dark-flow.png'), '#loop .flow-card', 8);
    check(!dark.logs.some((x) => /exception|error|failed/i.test(x)), 'RU: консоль тёмной темы без ошибок');

    const reduced = await browser.page(pageUrl('ru'), { width: 1280, height: 900, light: true });
    await reduced.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await reduced.eval(`location.reload(); true`); await ready(reduced);
    const reducedState = J(await reduced.eval(`JSON.stringify({reduced:HeroKit.reduced(),buttons:document.querySelectorAll('.anim-play').length,canvas:[document.getElementById('evalFlow').width,document.getElementById('evalFlow').height]})`));
    check(reducedState.reduced && reducedState.buttons === 1 && reducedState.canvas.every((x) => x > 0), 'RU: уменьшенное движение показывает явную кнопку запуска схемы');
    check(!reduced.logs.some((x) => /exception|error|failed/i.test(x)), 'RU: консоль режима уменьшенного движения без ошибок');
  } finally {
    await browser.close();
  }
  console.log(`\n${ok} успешно, ${fail} ошибок`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
