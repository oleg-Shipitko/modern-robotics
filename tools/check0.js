// Проверка части 0: все задания отвечаются, задача на сцене решается, итог считается по урокам. Снимки — shots/check0-*.png.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-0.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const n = await p.eval('window.__c0.Q.length');
    check(n === 14 && (await p.eval('document.querySelectorAll(".chk-card").length')) === 14, `заданий на странице: ${n}`);
    // вопросы: в первом задании выбора отвечаем неверно, в остальных верно; порядок — верно, кроме лестницы частот
    await p.eval(`(() => { const Q = window.__c0.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; const seq = q.items.map((_, i) => i); if (q.sec === 'ladder') seq.reverse();
          seq.forEach((i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith('Отвечено 13 из 14'), 'после 13 ответов итог ждёт задачу на сцене');
    // сцена: без компенсации не выходит, с компенсацией — решается
    const sc = '#q14';
    const setv = (sel, v) => p.eval(`(() => { const e = document.querySelector('${sc} ${sel}'); e.value = ${v}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await setv('input[type=range]', 120); await setv('.hd-range:nth-of-type(2) input', 10);
    await p.eval(`document.querySelector('${sc} .btn.primary').click(); true`); await p.waitFor(`!document.querySelector('${sc} .btn.primary').disabled || window.__c0.res[13] !== null`, 20000); await sleep(300);
    check((await p.eval('window.__c0.res[13]')) === null && /Ошибка в конце: [1-9]/.test(await p.eval(`document.querySelector('${sc} .readout').textContent`)), 'без компенсации гравитации захват провисает — задача не решена');
    if (vp.t === 'desk') await p.shotEl(out('check0-scene.png'), sc, 6);
    await p.eval(`(() => { const c = document.querySelector('${sc} input[type=checkbox]'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
    await setv('input[type=range]', 80);
    await p.eval(`document.querySelector('${sc} .btn.primary').click(); true`); await p.waitFor('window.__c0.res[13] !== null', 20000); await sleep(300);
    check((await p.eval('window.__c0.res[13]')) === true, 'с компенсацией, Kp 80 и Kd 10 задача решена');
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(/^Итог: 12 из 14\./.test(score), 'итог: ' + score);
    const rows = await p.eval('[...document.querySelectorAll(".chk-tr")].map((r) => r.textContent).join(" | ")');
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 2, 'в «Что повторить» две ссылки: ' + rows);
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-0'] && pr['proverka-chasti-0'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    if (vp.t === 'desk') { await p.shotEl(out('check0-order.png'), '#q1', 6); await p.shotEl(out('check0-choice.png'), '#q2', 6); await p.shotEl(out('check0-result.png'), '#result .prose', 6); }
    else await p.shotEl(out('check0-phone-q1.png'), '#q1', 4);
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
