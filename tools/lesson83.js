// Урок 8.3 «Надёжность»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l83-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-12-26 python3 lessons/build.py l83.
// node tools/lesson83.js — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема).
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l83/engine.js');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const url = 'file://' + path.resolve(__dirname, '../site/lessons/8-3-nadezhnost.html');
const r1 = (v, d) => (+v).toFixed(d).replace('.', ',');

// ---------- числа движка, которые урок называет ----------
const base = E.orders({ p: 0.95, n: 8 }).cnt, retry = E.orders({ p: 0.95, n: 8, d: 0.9, R: 2 }).cnt;
const D = E.day(), kinds = { ok: 0, gross: 0, subtle: 0 }; D.checks.forEach((c) => kinds[c.kind]++);
const s5 = E.judge(D, 0.5, 'sens'), b5 = E.judge(D, 0.5, 'both'), v5 = E.judge(D, 0.5, 'vlm');
let lowTi = 19; for (let ti = 19; ti >= 1; ti--) if (E.judge(D, ti / 20, 'sens').spoiled <= 3) { lowTi = ti; break; }
const low = E.judge(D, lowTi / 20, 'sens');
const ser95 = E.series(0.95, 40, 3000), ser99 = E.series(0.99, 40, 3000), ser999 = E.series(0.999, 40, 3000);
const m1 = E.passed(ser95, 20), m2 = E.passed(ser99, 300), m3 = E.passed(ser999, 3000);
console.log(`движок: без проверки ${base.good}, с проверкой ${retry.good} (спасено ${retry.saved}, тихих ${retry.silent}); день: ${kinds.gross}+${kinds.subtle} отказов, датчики 0,5 — ${s5.alarms}/${s5.falseAlarms}/${s5.spoiled}, порог ${r1(lowTi / 20, 2)} — ${low.alarms}; оба — ${b5.alarms}/${b5.falseAlarms}/${b5.spoiled}; серии ${m1}, ${m2}, ${m3}`);

/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 6000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
async function liveDone(p, mis, timeout) {
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 20000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
/** Числа в тексте урока, помеченные data-n: { имя: [значения] } (одно имя может встречаться несколько раз). */
const dataN = (p, sel) => p.eval(`JSON.stringify([...document.querySelectorAll('${sel} [data-n]')].map((e) => [e.dataset.n, e.textContent]))`).then(J).then((a) => { const o = {}; for (const [k, v] of a) (o[k] = o[k] || []).push(sp(v)); return o; });
const allEq = (arr, v) => !!arr && arr.length > 0 && arr.every((x) => x === String(v));

(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^10 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 8.2: три вопроса');
    check(await p.eval(`!document.querySelector('a[href^="8-4"]')`), 'ссылки на ещё не написанный урок 8.4 нет');
    const bridge = await text(p, '#finale .bridge');
    check(/8\.4/.test(bridge) && /92% успеха/.test(bridge), 'в итогах — абзац-мост в 8.4 «Оценка качества»');
    check((await p.eval(`L83.CFG.SEED`)) === 25 && (await p.eval(`L83.CFG.DAY_SEED`)) === 1005 && (await p.eval(`L83.CFG.RUN_SEED`)) === 85, 'зёрна лабораторий: 25, 1005, 85');
    check((await p.eval(`JSON.stringify(L83.orders({ p: 0.95, n: 8, d: 0.9, R: 2 }).cnt)`)) === JSON.stringify(retry), 'браузер считает заказы так же, как Node');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['funnel', 'chain', 2.0, 10.5], ['monitor', 'loud', 1.0, 8.0], ['knowno', 'askhelp', 2.0, 11.0]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await show(p, sec, `#${sec} .flow-card`, `l83-${id}.png`);
    }
    // кадры схем в ключевые моменты (для просмотра глазами)
    for (const [id, sec, t, f] of [['monitor', 'loud', 9.5, 'l83-monitor-loud.png'], ['knowno', 'askhelp', 6.8, 'l83-knowno-1.png'], ['knowno', 'askhelp', 13.5, 'l83-knowno-2.png'], ['funnel', 'chain', 13.5, 'l83-funnel-full.png']]) {
      await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="${id}"]'), ${t}); true`); await show(p, sec, `#${sec} .flow-card`, f);
    }

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapLP')) && !(await visible(p, '#wrapLD')) && !(await visible(p, '#wrapLR')) && !(await visible(p, '#wrapLN')), 'миссия 1: ручки скрыты');
    check(/Ещё не готовила/.test(await text(p, '#lStatL')), 'до ставки сетка пуста: ответ не виден');
    await show(p, 'latte', '#latte .lab', 'l83-latte-empty.png');
    let r = await viaUI(p, '#lMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`Без ошибок — ${base.good} латте из 100`) && r.out.includes('66,3%') && r.out.includes(`Остальные ${base.silent} испорчены`), `миссия 1: ${base.good} из 100 без ошибок — ` + r.out.slice(0, 90));
    await nextMission(p, '#lMis');
    check(await visible(p, '#wrapLP') && !(await visible(p, '#wrapLD')), 'миссия 2: виден только ползунок надёжности шага');
    for (const v of [3, 4, 5]) { await setRange(p, '#lP', v); await sleep(120); }
    r = await liveDone(p, '#lMis');
    check(r.ok && /Нужно 99,9% на шаг/.test(r.out) && /99,2%/.test(r.out) && /99 латте из 100/.test(r.out) && /2,4 испорченных/.test(r.out), 'миссия 2 засчитана сама: ' + r.out.slice(0, 100));
    await nextMission(p, '#lMis');
    await show(p, 'latte', '#latte .lab', 'l83-latte-m3-before.png');
    r = await viaUI(p, '#lMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`Слева ${base.good}, справа ${retry.good} латте`) && r.out.includes(`спас ${retry.saved} заказов`) && r.out.includes(`Остались ${retry.silent} испорченных`), `миссия 3: слева ${base.good}, справа ${retry.good}, спасено ${retry.saved}, тихих ${retry.silent}`);
    await show(p, 'latte', '#latte .lab', 'l83-latte.png');
    await nextMission(p, '#lMis');
    check(await visible(p, '#wrapLD') && await visible(p, '#wrapLR') && !(await visible(p, '#wrapLP')), 'миссия 4: видны доля замеченных ошибок и повторы');
    await setRange(p, '#lD', 98); await sleep(150);
    r = await liveDone(p, '#lMis');
    check(r.ok && /При 98% замеченных ошибок и 2 повторах/.test(r.out) && /не меньше 98% ошибок, с тремя — тоже 98%/.test(r.out) && /выходит 98%/.test(r.out), 'миссия 4 засчитана сама: ' + r.out.slice(0, 110));
    const minD = J(await p.eval(`JSON.stringify([window.__l83.Latte.minD(2), window.__l83.Latte.minD(3), L83.taskModel(0.95, 8, 1, 1).ok])`));
    check(minD[0] === 0.98 && minD[1] === 0.98 && minD[2] < 0.99, `нужно замечать 98% ошибок (2 и 3 повтора), с одним повтором максимум ${r1(minD[2] * 100, 1)}%`);
    await nextMission(p, '#lMis');
    check(await visible(p, '#wrapLP') && await visible(p, '#wrapLN'), 'свободный режим: все ручки видны');
    const la = await dataN(p, '#latteAfter');
    check(allEq(la.base, base.good) && allEq(la.retry, retry.good) && allEq(la.saved, retry.saved) && allEq(la.silent, retry.silent), 'инференс после лаборатории 1 называет числа движка: ' + JSON.stringify(la));
    check((await text(p, '#lSeedBase')) === String(base.good), 'под капотом: число латте нашего набора');
    { const a = [], b = []; for (let sd = 1; sd <= 40; sd++) { a.push(E.orders({ p: 0.95, n: 8, seed: sd }).cnt.good); b.push(E.orders({ p: 0.95, n: 8, d: 0.9, R: 2, seed: sd }).cnt.good); }
      const t = await text(p, '#lSeeds'); check(t.includes(`от ${Math.min(...a)} до ${Math.max(...a)} латте`) && t.includes(`от ${Math.min(...b)} до ${Math.max(...b)}`), `под капотом: разброс по 40 зёрнам ${Math.min(...a)}–${Math.max(...a)} и ${Math.min(...b)}–${Math.max(...b)}`); }
    const f100 = [E.taskModel(0.999, 100, 0, 0).ok, E.taskModel(0.99, 100, 0.9, 2).ok];
    check(Math.abs(f100[0] - f100[1]) < 0.01, `свободный режим: 100 шагов — 99,9% без проверки ${r1(f100[0] * 100, 1)}% и 99% с проверкой ${r1(f100[1] * 100, 1)}% почти равны`);

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapTDet')) && !(await visible(p, '#wrapTT')), 'миссия 1: выбор детектора и порог скрыты');
    check((await p.eval(`document.getElementById('tTiles').textContent`)) === '', 'до ставки итогов дня нет');
    await show(p, 'threshold', '#threshold .lab', 'l83-thr-empty.png');
    r = await viaUI(p, '#tMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`звали ${s5.alarms} раз, из них ${s5.falseAlarms} — зря`) && r.out.includes(`дошли ${s5.spoiled} испорченных`) && r.out.includes(`из ${kinds.subtle} тонких — ${s5.missedSubtle}`), 'миссия 1: ' + r.out.slice(0, 110));
    await show(p, 'threshold', '#threshold .lab', 'l83-thr-sens.png');
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTT') && !(await visible(p, '#wrapTDet')), 'миссия 2: виден только порог');
    for (const v of [8, 5, 3, lowTi]) { await setRange(p, '#tT', v); await sleep(100); }
    r = await liveDone(p, '#tMis');
    check(r.ok && r.out.includes(`При пороге ${r1(lowTi / 20, 2)} испорченных ${low.spoiled}`) && r.out.includes('звали 1 800 раз') && /30 с/.test(r.out), 'миссия 2 засчитана сама: ' + r.out.slice(0, 110));
    await show(p, 'threshold', '#threshold .lab', 'l83-thr-low.png');
    await nextMission(p, '#tMis');
    r = await viaUI(p, '#tMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`испорченных латте ${b5.spoiled}, вызовов ${b5.alarms}, из них ложных ${b5.falseAlarms} — против ${s5.falseAlarms}`) && r.out.includes(`пропустила бы ${v5.missedGross}`), 'миссия 3: ' + r.out.slice(0, 120));
    await show(p, 'threshold', '#threshold .lab', 'l83-thr-both.png');
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTDet') && await visible(p, '#wrapTT'), 'свободный режим: детектор и порог видны');
    // перетаскивание порога мышью на гистограмме
    const dragged = J(await p.eval(`(async () => { const cv = document.getElementById('tHist'), b = cv.getBoundingClientRect(), W = window.__l83.Thresh.st; const x0 = b.left + b.width * (40 + 576 * 0.5) / 640, y = b.top + b.height * 0.5;
      const ev = (t, x) => cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'mouse' }));
      ev('pointerdown', x0); ev('pointermove', x0 + b.width * 0.15); ev('pointerup', x0 + b.width * 0.15); await new Promise((r) => setTimeout(r, 50)); return JSON.stringify({ ti: W.ti }); })()`, true));
    check(dragged.ti > 10, 'порог тянется мышью по гистограмме: ' + dragged.ti);
    await setRange(p, '#tT', 10); await seg(p, '#tDet', 'both');
    const ta = await dataN(p, '#thresholdAfter');
    check(allEq(ta.sensA, s5.alarms) && allEq(ta.sensF, s5.falseAlarms) && allEq(ta.sensS, s5.spoiled) && allEq(ta.lowT, r1(lowTi / 20, 2)) && ta.lowA[0].replace(/\s/g, '') === String(low.alarms) && allEq(ta.lowM, '30 секунд') && allEq(ta.bothS, b5.spoiled) && allEq(ta.bothA, b5.alarms) && allEq(ta.bothF, b5.falseAlarms) && allEq(ta.fails, b5.fails), 'инференс после лаборатории 2 называет числа движка: ' + JSON.stringify(ta));
    check((await text(p, '#tCounts')) === `${kinds.gross + kinds.subtle} отказов: ${kinds.gross} грубых и ${kinds.subtle} тонкий`, 'под капотом: число отказов дня');
    { const R = { sS: [], bS: [], bA: [], low: [], lowA: [] }; let both = 0, moreF = 0;
      for (let sd = 1; sd <= 20; sd++) { const DD = E.day({ seed: sd }), s = E.judge(DD, 0.5, 'sens'), b = E.judge(DD, 0.5, 'both'); R.sS.push(s.spoiled); R.bS.push(b.spoiled); R.bA.push(b.alarms); if (b.spoiled <= 3 && b.alarms <= 60) both++; if (b.falseAlarms > s.falseAlarms) moreF++;
        let lt = 0; for (let ti = 19; ti >= 1; ti--) if (E.judge(DD, ti / 20, 'sens').spoiled <= 3) { lt = ti; break; } R.low.push(lt); R.lowA.push(E.judge(DD, lt / 20, 'sens').alarms); }
      const mm = (k) => [Math.min(...R[k]), Math.max(...R[k])], t = await text(p, '#thrSeeds');
      const [a0, a1] = mm('sS'), [b0, b1] = mm('bS'), [c0, c1] = mm('bA'), [l0, l1] = mm('low'), [w0, w1] = mm('lowA');
      check(t.includes(`от ${a0} до ${a1} испорченных`) && t.includes(`от ${b0} до ${b1} испорченных латте и от ${c0} до ${c1} вызовов`) && t.includes(`до ${r1(l0 / 20, 2)}–${r1(l1 / 20, 2)}`) && t.includes(`от ${w0} до ${w1} раз`) && t.includes(`во все 20 дней`) && moreF === 20 && t.includes(`в ${both} днях из 20`), `под капотом лаборатории 2: двадцать дней — ${a0}–${a1}, ${b0}–${b1}, ${c0}–${c1}, порог ${l0 / 20}–${l1 / 20}, оба условия в ${both} из 20`); }

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapRN')) && !(await visible(p, '#wrapRP')), 'миссия 1: длина проверки и надёжность скрыты');
    await show(p, 'runs', '#runs .lab', 'l83-runs-empty.png');
    r = await viaUI(p, '#rMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`Прошли ${m1} проверок из 40`) && r.out.includes('≈ 36%') && r.out.includes('меньше 14%'), 'миссия 1: ' + r.out.slice(0, 100));
    await show(p, 'runs', '#runs .lab', 'l83-runs-20.png');
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRN') && !(await visible(p, '#wrapRP')), 'миссия 2: виден только ползунок длины');
    for (const v of [4, 6, 8]) { await setRange(p, '#rN', v); await sleep(120); }
    r = await liveDone(p, '#rMis');
    check(r.ok && r.out.includes('Нужно 300 латте подряд') && r.out.includes('4,9%') && r.out.includes(`прошли ${m2} из 40`) && r.out.includes('точнее 299'), 'миссия 2 засчитана сама: ' + r.out.slice(0, 100));
    await show(p, 'runs', '#runs .lab', 'l83-runs-300.png');
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 2);
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes('Нужно 2 995 латте подряд') && r.out.includes('150 часов') && r.out.includes(`на сцене — ${m3} из 40`) && r.out.includes('лишь в 22%') && r.out.includes('в 5% случаев'), 'миссия 3: ' + r.out.slice(0, 120));
    await show(p, 'runs', '#runs .lab', 'l83-runs-3000.png');
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRN') && await visible(p, '#wrapRP'), 'свободный режим: длина и надёжность видны');
    { const a = [], b = []; for (let sd = 1; sd <= 20; sd++) { a.push(E.passed(E.series(0.95, 40, 3000, sd), 20)); b.push(E.passed(E.series(0.99, 40, 3000, sd), 300)); }
      const t = await text(p, '#runSeeds'); check(t.includes(`от ${Math.min(...a)} до ${Math.max(...a)} раза из 40`) && t.includes(`от ${Math.min(...b)} до ${Math.max(...b)} раз`), `под капотом лаборатории 3: разброс по 20 зёрнам ${Math.min(...a)}–${Math.max(...a)} и ${Math.min(...b)}–${Math.max(...b)}`); }
    const ra = await dataN(p, '#runsAfter');
    check(allEq(ra.m1, m1) && allEq(ra.m2, m2), 'инференс после лаборатории 3 называет числа движка: ' + JSON.stringify(ra));
    const ub = [E.upperBound(20), E.upperBound(100), E.upperBound(1000), E.needRuns(0.01), E.needRuns(0.001), E.passProb(0.9995, 2995)];
    check(ub[0] < 0.14 && ub[0] > 0.135 && ub[1] < 0.03 && ub[2] < 0.003 && ub[3] === 299 && ub[4] === 2995 && Math.round(ub[5] * 100) === 22, 'правило трёх в тексте: 20 → меньше 14%, 100 → выше 97%, 1000 → меньше 0,3%, 299 и 2995, 22%');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await dataN(p, '#finale .takeaways');
    check(allEq(fin.base, base.good) && allEq(fin.retry, retry.good) && allEq(fin.sensS, s5.spoiled), 'итоги урока называют числа лабораторий');
    const lead = await text(p, '.hero .lead');
    check(['95%', 'две чашки из трёх', '37%', '97%', '10–24%', '300 удачных'].every((x) => lead.includes(x)), 'шапка: числа цепочки, Sentinel, KnowNo и правила трёх');
    const plain = sp(fs.readFileSync(path.resolve(__dirname, '../lessons/l83/lesson.html'), 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    check(['18% больше отказов', '44%', '93%', '7%', '14 секунд', '49 тысяч', '79 задачах', '10,3%', '21,4%', '64% случаев', 'примерно на 20%', 'примерно в 80%', '76% попыток', '74% при цели 75%', '41%', '58% шагов', '72%', '87% случаев против 62%', '67% просьб против 81%', '86%', '400', '4 часов', '13 часов', '200 секунд', '95% поездок'].every((x) => plain.includes(x)), 'числа статей в тексте — из досье');
    check(E.ipow(0.99, 100) > 0.36 && E.ipow(0.99, 100) < 0.37 && E.ipow(0.9999, 100) >= 0.99 && E.upperBound(100) < 0.03, 'числа выкладок: 0,99¹⁰⁰ ≈ 37%, 0,9999¹⁰⁰ ≥ 99%, 100 из 100 — выше 97%');

    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    const quiz = await p.eval(`document.getElementById('quizBox').textContent`).then(sp);
    const qMiss = [`${base.good} из 100`, `вышло ${retry.good} латте`, `${retry.silent} всё равно`, `пропустили ${s5.missed}`, `${low.missed}, но звали человека 1 800`, `${s5.falseAlarms} ложных`, `${b5.falseAlarms}`, `их ${b5.fails}`, '400', `прошла ${m1} проверок`, '2 995'].filter((x) => !quiz.includes(x));
    check(!qMiss.length, 'квиз: числа в объяснениях совпадают с лабораториями' + (qMiss.length ? ' — нет: ' + qMiss.join(', ') : ''));
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 20 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    for (const [id, sel, n] of [['latte', '#latte .lab', 'l83-latte-dark.png'], ['threshold', '#threshold .lab', 'l83-thr-dark.png'], ['runs', '#runs .lab', 'l83-runs-dark.png'], ['chain', '#chain .flow-card', 'l83-funnel-dark.png'], ['loud', '#loud .flow-card', 'l83-monitor-dark.png'], ['askhelp', '#askhelp .flow-card', 'l83-knowno-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l83; await W.Latte.api.cookBoth(); await W.Thresh.api.both(); await W.Runs.api.run20(); return true; })()`, true);
    await sleep(300);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    for (const [id, sel, n] of [['chain', '#chain .flow-card', 'l83-m-funnel.png'], ['loud', '#loud .flow-card', 'l83-m-monitor.png'], ['askhelp', '#askhelp .flow-card', 'l83-m-knowno.png'], ['latte', '#latte .lab', 'l83-m-latte.png'], ['threshold', '#threshold .lab', 'l83-m-thr.png'], ['runs', '#runs .lab', 'l83-m-runs.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
