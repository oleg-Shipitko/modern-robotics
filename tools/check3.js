// Проверка части 3: все задания отвечаются, задача «Ада в облаке» решается только двумя системами
// с моделью в облаке не реже 5 Гц, задачу можно пропустить, итог считается по урокам. Снимки — shots/c3-*.png.
// Страница датирована днём выпуска, собирать так: MR_ASOF=2026-10-24 python3 lessons/build.py c3
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-3.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const N = await p.eval('window.__c3.Q.length'), S = N - 1;
    check(N === 33 && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${N}`);
    const per = JSON.parse(await p.eval('JSON.stringify(window.__c3.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))'));
    check(['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8'].every((l) => per[l] >= 4) && Object.keys(per).length === 8, 'по уроку 3.1–3.8 не меньше четырёх заданий: ' + JSON.stringify(per));
    check((await p.eval('window.__c3.Q[window.__c3.Q.length - 1].t')) === 'scene', 'последнее задание — задача на сцене');
    const secs = await p.eval(`JSON.stringify(window.__c3.Q.filter((q) => !q.sec || !q.st).map((q) => q.q.slice(0, 40)))`);
    check(secs === '[]', 'у каждого задания есть раздел для повторения ' + (secs === '[]' ? '' : secs));
    check((await p.eval('document.getElementById("chkCount").textContent')) === '32 вопроса и задача на сцене', 'в шапке: ' + (await p.eval('document.getElementById("chkCount").textContent')));
    // первое задание с выбором — неверно, остальные — верно
    await p.eval(`(() => { const Q = window.__c3.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);
    const sc = '#q' + N;
    const runWith = async (mode, f) => {
      await p.eval(`(() => { document.querySelector('${sc} .seg button[data-v="${mode}"]').click(); const r = document.querySelector('${sc} input[type=range]'); r.value = ${f}; r.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('${sc} .btn.primary').click(); return true; })()`);
      await sleep(300);
      await p.waitFor(`!document.querySelector('${sc} .btn.primary').disabled || window.__c3.res[${S}] !== null`, 60000); await sleep(300);
      const crit = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('${sc} .m-crit li')].map((li) => li.className))`));
      return { text: await p.eval(`document.querySelector('${sc} .readout').textContent`), crit };
    };
    let r = await runWith('single', 10);
    check((await p.eval(`window.__c3.res[${S}]`)) === null && r.crit.join() === 'no,ok,ok' && /не взяла движущуюся чашку/.test(r.text), 'одна модель при 10 Гц не берёт движущуюся чашку: ' + r.text.slice(0, 150));
    r = await runWith('dual', 2);
    check((await p.eval(`window.__c3.res[${S}]`)) === null && r.crit.join() === 'ok,no,no' && /сомкнула захват на красной/.test(r.text), 'две системы при 2 Гц хватают красную: ' + r.text.slice(0, 200));
    if (vp.t === 'desk') await p.shotEl(out('c3-scene-fail.png'), sc, 6);
    r = await runWith('dual', 4);
    check((await p.eval(`window.__c3.res[${S}]`)) === null && r.crit.join() === 'ok,no,ok' && /через 0,55 с/.test(r.text), 'две системы при 4 Гц поворачивают через 0,55 с: ' + r.text.slice(0, 200));
    r = await runWith('dual', 5);
    check((await p.eval(`window.__c3.res[${S}]`)) === true && r.crit.join() === 'ok,ok,ok' && /через 0,45 с/.test(r.text), 'две системы при 5 Гц проходят обе проверки: ' + r.text.slice(0, 200));
    check(await p.eval(`document.querySelector('${sc} .g-restart').hidden && document.querySelector('${sc} .btn.primary').disabled`), 'после решения запуск и «Пропустить» убраны');
    check(/Раздел «Рука догоняет чашку/.test(await p.eval(`document.querySelector('${sc} .chk-exp').textContent`)), 'разбор задачи ссылается на раздел урока 3.7');
    if (vp.t === 'desk') await p.shotEl(out('c3-scene.png'), sc, 6);
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\.`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    check((await p.eval('document.querySelectorAll("#chkTable .chk-tr").length')) === 8, 'в таблице итога восемь уроков');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-3'] && pr['proverka-chasti-3'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(await p.eval(`(() => { const c = document.querySelector('${sc} canvas'), card = document.querySelector('${sc}'); return c.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5; })()`), 'сцена не шире карточки');
    if (vp.t === 'desk') { await p.shotEl(out('c3-choice.png'), '#q1', 6); await p.shotEl(out('c3-result.png'), '#result .prose', 6); }
    else { await p.shotEl(out('c3-phone-scene.png'), sc, 4); await p.shotEl(out('c3-phone-q1.png'), '#q1', 4); }
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
    await p.eval(`document.querySelector('${sc} .g-restart').click(); true`); await sleep(200);
    check((await p.eval(`window.__c3.res[${S}]`)) === false && (await p.eval(`document.querySelector('${sc} .g-restart').hidden`)) && /не реже 5 раз в секунду/.test(await p.eval(`document.querySelector('${sc} .chk-right').textContent`)), 'задачу можно пропустить: засчитана как неверная, показана подсказка');
    if (vp.t === 'desk') await p.shotEl(out('c3-scene-skip.png'), sc, 6);
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
