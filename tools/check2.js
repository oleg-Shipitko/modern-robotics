// Проверка части 2: все задания отвечаются, задача «что и где» решается только связкой
// «мини-CLIP + карта по клеткам», итог считается по урокам. Снимки — shots/check2-*.png.
// Страница датирована днём выпуска, собирать так: MR_ASOF=2026-10-10 python3 lessons/build.py c2
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-2.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    const N = await p.eval('window.__c2.Q.length'), S = N - 1;
    check(N > 1 && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${N}`);
    const per = JSON.parse(await p.eval('JSON.stringify(window.__c2.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))'));
    check(['2.1', '2.2', '2.3'].every((l) => per[l] >= 4) && Object.keys(per).length === 3, 'по уроку 2.1–2.3 не меньше четырёх заданий: ' + JSON.stringify(per));
    const secs = await p.eval(`JSON.stringify(window.__c2.Q.filter((q) => !q.sec).map((q) => q.q.slice(0, 40)))`);
    check(secs === '[]', 'у каждого задания есть раздел для повторения ' + (secs === '[]' ? '' : secs));
    // первое задание с выбором — неверно, остальные — верно
    await p.eval(`(() => { const Q = window.__c2.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);
    const sc = '#q' + N;
    const runWith = async (what, where) => {
      await p.eval(`(() => { document.querySelector('${sc} .seg button[data-v="${what}"]').click(); document.querySelector('${sc} .seg button[data-v="${where}"]').click(); document.querySelector('${sc} .btn.primary').click(); return true; })()`);
      await sleep(300);
      await p.waitFor(`!document.querySelector('${sc} .btn.primary').disabled || window.__c2.res[${S}] !== null`, 120000); await sleep(300);
      return p.eval(`document.querySelector('${sc} .readout').textContent`);
    };
    const hits = (r) => +((r.match(/взят в (\d+) сценах/) || [])[1] ?? -1);
    for (const [what, where, name] of [['robot', 'reg', 'слова + регрессия'], ['clip', 'reg', 'CLIP + регрессия'], ['robot', 'map', 'слова + карта']]) {
      const r = await runWith(what, where);
      check((await p.eval(`window.__c2.res[${S}]`)) === null && hits(r) >= 0 && hits(r) < 18, `${name} не справляется: ${hits(r)} из 20`);
      if (vp.t === 'desk' && what === 'robot' && where === 'map') await p.shotEl(out('check2-scene-fail.png'), sc, 6);
    }
    const r = await runWith('clip', 'map');
    check((await p.eval(`window.__c2.res[${S}]`)) === true && hits(r) >= 18, `CLIP + карта решает задачу: ${hits(r)} из 20`);
    if (vp.t === 'desk') await p.shotEl(out('check2-scene.png'), sc, 6);
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\.`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-2'] && pr['proverka-chasti-2'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    if (vp.t === 'desk') { await p.shotEl(out('check2-choice.png'), '#q1', 6); await p.shotEl(out('check2-result.png'), '#result .prose', 6); }
    else { await p.shotEl(out('check2-phone-scene.png'), sc, 4); }
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
