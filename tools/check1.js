// Проверка части 1: все задания отвечаются, задача с чайником решается только смесью с длинной пачкой,
// итог считается по урокам. Снимки — shots/check1-*.png.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-1.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const n = await p.eval('window.__c1.Q.length'), N = 16, S = N - 1;
    check(n === N && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${n}`);
    const per = await p.eval('JSON.stringify(window.__c1.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))');
    check(Object.values(JSON.parse(per)).every((v) => v === 2) && Object.keys(JSON.parse(per)).length === 8, 'по два задания на каждый урок 1.1–1.8: ' + per);
    // первое задание с выбором — неверно, остальные — верно; порядок DAgger — верно
    await p.eval(`(() => { const Q = window.__c1.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);
    const sc = '#q' + N;
    const runWith = async (model, hi) => {
      await p.eval(`(() => { document.querySelector('${sc} .seg button[data-m="${model}"]').click(); const r = document.querySelector('${sc} input[type=range]'); r.value = ${hi}; r.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('${sc} .btn.primary').click(); return true; })()`);
      await p.waitFor(`!document.querySelector('${sc} .btn.primary').disabled || window.__c1.res[${S}] !== null`, 30000); await sleep(300);
      return p.eval(`document.querySelector('${sc} .readout').textContent`);
    };
    let r = await runWith('reg', 4);
    check((await p.eval(`window.__c1.res[${S}]`)) === null && /Касаний: 10 из 10/.test(r), 'регрессия с MSE едет в чайник: ' + r.slice(0, 80));
    r = await runWith('gmm', 0);
    check((await p.eval(`window.__c1.res[${S}]`)) === null && !/Касаний: 0 из 10 · смен стороны у чайника: до 0/.test(r), 'смесь с выбором на каждом шаге прыгает: ' + r.slice(0, 90));
    if (vp.t === 'desk') await p.shotEl(out('check1-scene-fail.png'), sc, 6);
    r = await runWith('gmm', 4);
    check((await p.eval(`window.__c1.res[${S}]`)) === true && /Касаний: 0 из 10/.test(r), 'смесь с пачкой из 24 шагов решает задачу: ' + r.slice(0, 90));
    if (vp.t === 'desk') await p.shotEl(out('check1-scene.png'), sc, 6);
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\.`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-1'] && pr['proverka-chasti-1'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    if (vp.t === 'desk') { await p.shotEl(out('check1-order.png'), '#q2', 6); await p.shotEl(out('check1-choice.png'), '#q1', 6); await p.shotEl(out('check1-result.png'), '#result .prose', 6); }
    else { await p.shotEl(out('check1-phone-scene.png'), sc, 4); }
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
