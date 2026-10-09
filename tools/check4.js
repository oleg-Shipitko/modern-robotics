// Проверка части 4: все задания отвечаются, задача «Бюджет на 60 у. е.» решается только смесью
// демонстраций робота и симуляции, задачу можно пропустить, итог считается по урокам. Снимки — shots/c4-*.png.
// Страница датирована днём выпуска, собирать так: MR_ASOF=2026-11-07 python3 lessons/build.py c4
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-4.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const N = await p.eval('window.__c4.Q.length'), S = N - 1;
    check(N === 25 && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${N}`);
    const per = JSON.parse(await p.eval('JSON.stringify(window.__c4.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))'));
    check(['4.1', '4.2', '4.3', '4.4', '4.5', '4.6'].every((l) => per[l] >= 4) && Object.keys(per).length === 6, 'по уроку 4.1–4.6 не меньше четырёх заданий: ' + JSON.stringify(per));
    const types = JSON.parse(await p.eval('JSON.stringify(window.__c4.Q.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {}))'));
    check(types.choice && types.predict && types.order && types.scene === 1, 'типы заданий: ' + JSON.stringify(types));
    check((await p.eval('window.__c4.Q[window.__c4.Q.length - 1].t')) === 'scene', 'последнее задание — задача на сцене');
    const secs = await p.eval(`JSON.stringify(window.__c4.Q.filter((q) => !q.sec || !q.st).map((q) => q.q.slice(0, 40)))`);
    check(secs === '[]', 'у каждого задания есть раздел для повторения ' + (secs === '[]' ? '' : secs));
    check((await p.eval('document.getElementById("chkCount").textContent')) === '24 вопроса и задача на сцене', 'в шапке: ' + (await p.eval('document.getElementById("chkCount").textContent')));
    // первое задание с выбором — неверно, остальные — верно
    await p.eval(`(() => { const Q = window.__c4.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);
    const sc = '#q' + N;
    if (vp.t === 'desk') await p.shotEl(out('c4-scene-start.png'), sc, 6);
    // план задаётся кнопками «−» и «+», как у читателя
    const setPlan = (plan) => p.eval(`(() => { const plan = ${JSON.stringify(plan)};
      for (const row of document.querySelectorAll('${sc} .pl-row')) { const k = row.dataset.k, val = () => +row.querySelector('.pl-val').textContent;
        for (let i = 0; i < 40 && val() !== plan[k]; i++) row.querySelector('.pl-btn[data-d="' + (val() < plan[k] ? 1 : -1) + '"]').click(); }
      return [...document.querySelectorAll('${sc} .pl-val')].map((o) => +o.textContent).join(); })()`);
    const crit = async () => JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('${sc} .m-crit li')].map((li) => li.className))`));
    const runPlan = async (plan) => {
      await setPlan(plan);
      await p.eval(`document.querySelector('${sc} .btn.primary').click(); true`);
      await sleep(300);
      await p.waitFor(`!/учится|Готовлю/.test(document.querySelector('${sc} .readout').textContent) && (!document.querySelector('${sc} .btn.primary').disabled || window.__c4.res[${S}] !== null)`, 120000); await sleep(300);
      const text = await p.eval(`document.querySelector('${sc} .readout').textContent`);
      return { text, rate: +((text.match(/в (\d+)% попыток/) || [])[1] ?? -1), crit: await crit() };
    };
    let r = await runPlan({ robot: 20, sim: 0, video: 0 });
    check((await p.eval(`window.__c4.res[${S}]`)) === null && r.rate >= 40 && r.rate < 60 && r.crit.join() === 'ok,no', 'весь бюджет на 20 демонстраций робота не справляется: ' + r.text);
    if (vp.t === 'desk') await p.shotEl(out('c4-scene-fail.png'), sc, 6);
    await setPlan({ robot: 20, sim: 400, video: 0 });
    check(await p.eval(`document.querySelector('${sc} .btn.primary').disabled && document.querySelector('${sc} .pl-bar-text').classList.contains('over')`) && (await crit())[0] === 'no', 'план дороже 60 у. е. обучить нельзя: ' + (await p.eval(`document.querySelector('${sc} .pl-bar-text').textContent`)));
    if (vp.t === 'desk') await p.shotEl(out('c4-scene-over.png'), sc + ' .pl-box', 6);
    r = await runPlan({ robot: 0, sim: 800, video: 0 });
    check((await p.eval(`window.__c4.res[${S}]`)) === null && r.rate >= 50 && r.rate < 70, 'одна симуляция 800 эпизодов не справляется: ' + r.text);
    r = await runPlan({ robot: 0, sim: 400, video: 800 });
    check((await p.eval(`window.__c4.res[${S}]`)) === null && r.rate >= 50 && r.rate < 70, 'симуляция с видео людей без робота не справляется: ' + r.text);
    r = await runPlan({ robot: 4, sim: 400, video: 0 });
    check((await p.eval(`window.__c4.res[${S}]`)) === true && r.rate >= 70 && r.crit.join() === 'ok,ok', '4 демонстрации робота и 400 эпизодов симуляции решают задачу: ' + r.text);
    check(await p.eval(`document.querySelector('${sc} .g-restart').hidden && document.querySelector('${sc} .btn.primary').disabled && [...document.querySelectorAll('${sc} .pl-btn')].every((b) => b.disabled)`), 'после решения запуск, «Пропустить» и кнопки плана выключены');
    check(/Раздел «Бюджет данных под задачу/.test(await p.eval(`document.querySelector('${sc} .chk-exp').textContent`)), 'разбор задачи ссылается на раздел урока 4.6');
    if (vp.t === 'desk') await p.shotEl(out('c4-scene.png'), sc, 6);
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\.`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    check((await p.eval('document.querySelectorAll("#chkTable .chk-tr").length')) === 6, 'в таблице итога шесть уроков');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-4'] && pr['proverka-chasti-4'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(await p.eval(`(() => { const card = document.querySelector('${sc}').getBoundingClientRect(); return [...document.querySelectorAll('${sc} canvas, ${sc} .pl-box')].every((e) => e.getBoundingClientRect().right <= card.right + 0.5); })()`), 'сцена и план не шире карточки');
    if (vp.t === 'desk') { await p.shotEl(out('c4-choice.png'), '#q1', 6); await p.shotEl(out('c4-order.png'), '#q8', 6); await p.shotEl(out('c4-result.png'), '#result .prose', 6); }
    else { await p.shotEl(out('c4-phone-scene.png'), sc, 4); await p.shotEl(out('c4-phone-q1.png'), '#q1', 4); }
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
    await p.eval(`document.querySelector('${sc} .g-restart').click(); true`); await sleep(200);
    check((await p.eval(`window.__c4.res[${S}]`)) === false && (await p.eval(`document.querySelector('${sc} .g-restart').hidden`)) && /4 демонстрации робота и 400 эпизодов симуляции/.test(await p.eval(`document.querySelector('${sc} .chk-right').textContent`)), 'задачу можно пропустить: засчитана как неверная, показана подсказка');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
