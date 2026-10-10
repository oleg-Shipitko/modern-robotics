// Проверка части 5: все задания отвечаются, разделы для повторения существуют в уроках, задача «Награда без лазеек»
// не решается наградой за въезд в клетку ни при каком значении, решается одноразовой наградой, задачу можно пропустить,
// итог считается по урокам. Снимки — shots/c5-*.png.
// Страница датирована днём выпуска, собирать так: MR_ASOF=2026-10-31 python3 lessons/build.py c5
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/proverka-chasti-5.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
(async () => {
  const B = await launch({ w: 1300, h: 900 });
  for (const vp of [{ width: 1280, height: 900, light: true, t: 'desk' }, { width: 390, height: 844, dpr: 2, mobile: true, dark: true, t: 'phone' }]) {
    console.log(vp.t);
    const p = await B.page(url, vp);
    await p.waitFor('document.readyState === "complete"'); await sleep(900);
    await p.eval('window.__c5Speed.k = 30; true');
    const N = await p.eval('window.__c5.Q.length'), S = N - 1;
    check(N === 29 && (await p.eval('document.querySelectorAll(".chk-card").length')) === N, `заданий на странице: ${N}`);
    const per = JSON.parse(await p.eval('JSON.stringify(window.__c5.Q.reduce((a, q) => (a[q.l] = (a[q.l] || 0) + 1, a), {}))'));
    check(['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7'].every((l) => per[l] >= 4) && Object.keys(per).length === 7, 'по уроку 5.1–5.7 не меньше четырёх заданий: ' + JSON.stringify(per));
    const types = JSON.parse(await p.eval('JSON.stringify(window.__c5.Q.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {}))'));
    check(types.choice && types.predict && types.order >= 3 && types.scene === 1, 'типы заданий: ' + JSON.stringify(types));
    check((await p.eval('window.__c5.Q[window.__c5.Q.length - 1].t')) === 'scene', 'последнее задание — задача на сцене');
    const lessonsOrder = JSON.parse(await p.eval('JSON.stringify(window.__c5.Q.slice(0, 7).map((q) => q.l))'));
    check(lessonsOrder.join() === '5.1,5.2,5.3,5.4,5.5,5.6,5.7', 'задания идут вперемешку по урокам: ' + lessonsOrder.join(' '));
    if (vp.t === 'desk') {
      // разделы для повторения существуют в уроках: id секции и заголовок h2 совпадают
      const refs = JSON.parse(await p.eval('JSON.stringify(window.__c5.Q.map((q) => [q.l, q.sec, q.st, q.q.slice(0, 40)]))'));
      const missing = [];
      for (const [l, sec, st, q] of refs) {
        const html = fs.readFileSync(path.resolve(__dirname, `../lessons/l${l.replace('.', '')}/lesson.html`), 'utf8');
        const m = new RegExp(`<section[^>]*id="${sec}"[\\s\\S]*?<h2>([^<]*)</h2>`).exec(html);
        if (!m || m[1].trim() !== st) missing.push(`${l} #${sec} «${st}» (${q}…)` + (m ? ` ≠ «${m[1].trim()}»` : ' — нет раздела'));
      }
      check(!missing.length, 'разделы для повторения есть в уроках, заголовки совпадают' + (missing.length ? ': ' + missing.join('; ') : ''));
      const expl = JSON.parse(await p.eval('JSON.stringify(window.__c5.Q.filter((q) => !q.e || q.e.length < 120).map((q) => q.q.slice(0, 40)))'));
      check(!expl.length, 'у каждого задания есть разбор' + (expl.length ? ': ' + expl.join('; ') : ''));
    }
    check((await p.eval('document.getElementById("chkCount").textContent')) === '28 вопросов и задача на сцене', 'в шапке: ' + (await p.eval('document.getElementById("chkCount").textContent')));
    // первое задание с выбором — неверно, остальные — верно
    await p.eval(`(() => { const Q = window.__c5.Q; let firstChoice = true;
      Q.forEach((q, k) => { const card = document.getElementById('q' + (k + 1));
        if (q.t === 'choice' || q.t === 'predict') { const btns = [...card.querySelectorAll('.chk-opt')]; const right = btns.find((b) => b.textContent === q.o[q.a]);
          (firstChoice ? btns.find((b) => b !== right) : right).click(); firstChoice = false; }
        if (q.t === 'order') { const btns = [...card.querySelectorAll('.chk-opt')]; q.items.forEach((_, i) => btns.find((b) => +b.dataset.ii === i).click()); } });
      return true; })()`);
    await sleep(200);
    check((await p.eval('document.getElementById("chkWait").textContent')).startsWith(`Отвечено ${S} из ${N}`), `после ${S} ответов итог ждёт задачу на сцене`);
    const sc = '#q' + N;
    if (vp.t === 'desk') await p.shotEl(out('c5-scene-start.png'), sc, 6);
    const crit = async () => JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('${sc} .m-crit li')].map((li) => li.className))`));
    const run = async (mode, r, g) => {
      await p.eval(`(() => { for (const v of ['${mode}', '${r}', '${g}']) document.querySelector('${sc} .rw-box .seg button[data-v="' + v + '"]').click(); document.querySelector('${sc} .btn.primary').click(); return true; })()`);
      await sleep(250);
      await p.waitFor(`!document.querySelector('${sc} .btn.primary').disabled || window.__c5.res[${S}] !== null`, 30000); await sleep(150);
      const text = await p.eval(`document.querySelector('${sc} .readout').textContent`);
      return { text, crit: await crit(), res: await p.eval(`window.__c5.res[${S}]`) };
    };
    let r;
    if (vp.t === 'desk') {
      let ok = true; const bads = [];
      for (const g of ['0.5', '0.9', '0.99']) for (const rr of ['1', '2', '5', '10']) { r = await run('cell', rr, g); if (r.res !== null || !/не взяла|эпизод не кончается/.test(r.text)) { ok = false; bads.push(`${rr}/${g}`); } }
      check(ok, 'награда за въезд в клетку не решает задачу ни при каком значении (12 сочетаний)' + (bads.length ? ': ' + bads.join(', ') : ''));
    }
    r = await run('cell', '1', '0.5');
    check(r.res === null && r.crit.join() === 'no,ok' && /за 12 шагов через лужу и молоко не взяла/.test(r.text) && /оставит Аду у холодильника/.test(r.text), 'за клетку +1, γ = 0,5: Ада не заезжает за молоком: ' + r.text.slice(0, 160));
    r = await run('cell', '10', '0.99');
    check(r.res === null && r.crit.join() === 'ok,no' && /эпизод не кончается/.test(r.text), 'за клетку +10, γ = 0,99: Ада не уезжает от холодильника: ' + r.text.slice(0, 160));
    if (vp.t === 'desk') await p.shotEl(out('c5-scene-fail.png'), sc, 6);
    r = await run('once', '1', '0.9');
    check(r.res === null && r.crit.join() === 'no,ok' && /нужно больше 3,57/.test(r.text), 'один раз +1, γ = 0,9: заезд не окупается, назван порог: ' + r.text.slice(0, 160));
    r = await run('atgoal', '10', '0.5');
    check(r.res === null && r.crit.join() === 'no,ok' && /не хватит ни одной награды/.test(r.text), 'у плиты +10, γ = 0,5: не решается: ' + r.text.slice(0, 160));
    r = await run('once', '5', '0.9');
    check(r.res === true && r.crit.join() === 'ok,ok' && /за 18 шагов/.test(r.text), 'один раз +5, γ = 0,9 решает задачу: ' + r.text.slice(0, 160));
    check(await p.eval(`document.querySelector('${sc} .g-restart').hidden && document.querySelector('${sc} .btn.primary').disabled && [...document.querySelectorAll('${sc} .rw-box button')].every((b) => b.disabled)`), 'после решения запуск, «Пропустить» и кнопки награды выключены');
    const exp = await p.eval(`document.querySelector('${sc} .chk-exp').textContent`);
    check(/Раздел «Агент, среда и шаг взаимодействия»/.test(exp), 'разбор задачи ссылается на раздел урока 5.1');
    check(/больше 0,39/.test(exp) && /больше 3,57/.test(exp) && /больше 7,84/.test(exp) && /больше 0,41/.test(exp) && /больше 6,73/.test(exp) && /γ = 0,50 — никакой из палитры/.test(exp), 'пороги награды в разборе посчитаны движком: ' + exp.slice(exp.indexOf('Дальше'), exp.indexOf('Дальше') + 330));
    if (vp.t === 'desk') await p.shotEl(out('c5-scene.png'), sc, 6);
    const score = await p.eval('document.getElementById("quizScore").textContent');
    check(new RegExp(`^Итог: ${N - 1} из ${N}\\. Часть 5 усвоена`).test(score), 'итог: ' + score);
    check((await p.eval('document.querySelectorAll("#chkReview li a").length')) === 1, 'в «Что повторить» одна ссылка');
    check((await p.eval('document.querySelectorAll("#chkTable .chk-tr").length')) === 7, 'в таблице итога семь уроков');
    const pr = JSON.parse(await p.eval('localStorage.getItem("mr-progress") || "{}"'));
    check(pr['proverka-chasti-5'] && pr['proverka-chasti-5'].f, 'проверка отмечена пройденной в прогрессе');
    check((await p.eval('document.documentElement.scrollWidth')) <= vp.width, 'ширина страницы в пределах экрана');
    check(await p.eval(`(() => { const card = document.querySelector('${sc}').getBoundingClientRect(); return [...document.querySelectorAll('${sc} canvas, ${sc} .rw-box, ${sc} .seg')].every((e) => e.getBoundingClientRect().right <= card.right + 0.5); })()`), 'сцена и конструктор награды не шире карточки');
    if (vp.t === 'desk') { await p.shotEl(out('c5-choice.png'), '#q1', 6); await p.shotEl(out('c5-order.png'), '#q5', 6); await p.shotEl(out('c5-result.png'), '#result .prose', 6); }
    else { await p.shotEl(out('c5-phone-scene.png'), sc, 4); await p.shotEl(out('c5-phone-q1.png'), '#q1', 4); }
    await p.eval('document.getElementById("chkAgain").click(); true'); await sleep(300);
    check((await p.eval('document.querySelectorAll(".chk-card.right, .chk-card.wrong").length')) === 0 && (await p.eval('document.getElementById("chkResult").hidden')), '«Пройти ещё раз» очищает ответы');
    await p.eval(`document.querySelector('${sc} .g-restart').click(); true`); await sleep(200);
    check((await p.eval(`window.__c5.res[${S}]`)) === false && (await p.eval(`document.querySelector('${sc} .g-restart').hidden`)) && /\+1 при γ = 0,99 или \+5 при γ = 0,9/.test(await p.eval(`document.querySelector('${sc} .chk-right').textContent`)), 'задачу можно пропустить: засчитана как неверная, показана подсказка');
    if (vp.t === 'desk') await p.shotEl(out('c5-scene-skip.png'), sc, 6);
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  }
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
