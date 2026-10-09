// Урок 5.3 «Off-policy и SAC»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l53-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-14 python3 lessons/build.py l53.
const path = require('path');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/5-3-sac.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2212\u2014]/g, '-');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
/** Живая миссия: дождаться, пока критерии станут ✓, вернуть разбор. */
async function liveDone(p, mis, timeout) {
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 60000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const clickWait = async (p, sel, idle) => { await p.click(sel); await sleep(80); await p.waitFor(idle, 60000); await sleep(80); };
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 5.2: три вопроса');
    check(await p.eval(`!document.querySelector('a[href^="5-4"]')`), 'ссылки на ещё не написанный урок 5.4 нет');
    const bridge = await text(p, '#finale .bridge');
    check(/5\.4/.test(bridge) && /симуляц/.test(bridge) && /4\.5/.test(bridge), 'в итогах — абзац-мост в 5.4 со ссылкой назад на 4.5');
    await p.eval("window.__l53.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['dataflow', 'onpolicy', 1.2, 7.5], ['sacupd', 'sac', 0.6, 7.2]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await p.shotEl(out(`l53-${id}.png`), `#${sec} .flow-card`, 6);
    }

    // ---------- интерактив: буфер ----------
    console.log('буфер');
    check(await visible(p, '#wrapRStep') && !(await visible(p, '#wrapRFree')), 'миссия 1: видны кнопки шагов, свободные настройки скрыты');
    await p.eval(`document.getElementById('buffer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l53-buffer-empty.png'), '#buffer .lab', 6);
    const idle = `!window.__l53.Replay.st.busy`;
    for (let i = 0; i < 4; i++) await clickWait(p, '#rStepEp', idle);
    check((await p.eval(`window.__l53.Replay.st.D.step`)) === 100, 'четыре эпизода — 100 переходов в буфере');
    await clickWait(p, '#rStep1', idle);
    let r = await liveDone(p, '#rMis', 10000);
    const batch = await p.eval(`window.__l53.Replay.st.D.last.length`);
    check(r.ok && batch === 32 && /32 перехода из всех эпизодов/.test(r.out), `миссия 1 засчитана сама: первый пакет из ${batch} переходов`);
    await p.shotEl(out('l53-buffer-batch.png'), '#buffer .lab', 6);
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 2);
    const m2 = r.out.match(/в среднем (\d+) раза?\. .*?был в пакетах (\d+) раз.*?цель обучения была (-?[\d,]+).*?того же перехода - (-?[\d,]+).*?Успех на проверке - (\d+)%/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m2 && m2[1] === '73' && m2[3] === '-1,35' && m2[4] === '-4,98' && m2[5] === '85' && +m2[2] === (await p.eval(`window.__l53.Replay.st.D.buf.used[0]`)), `миссия 2: переходы 1-го эпизода в пакетах ${m2 && m2[1]} раз (первый — ${m2 && m2[2]}), цель ${m2 && m2[3]} → ${m2 && m2[4]}, успех ${m2 && m2[5]}%`);
    await p.shotEl(out('l53-buffer-old.png'), '#buffer .lab', 6);
    await nextMission(p, '#rMis');
    r = await viaUI(p, '#rMis', 2);
    const m3 = r.out.match(/с буфером в среднем (\d+)%, без буфера - (\d+)%.*?без буфера - (\d+)%/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m3 && m3[1] === '96' && m3[2] === '52' && m3[3] === '33', `миссия 3: с буфером ${m3 && m3[1]}%, без буфера ${m3 && m3[2]}%, худшая ${m3 && m3[3]}%`);
    await p.shotEl(out('l53-buffer-nobuf.png'), '#buffer .lab', 6);
    await nextMission(p, '#rMis');
    check(await visible(p, '#wrapRFree'), 'свободный режим: размер буфера и способ набирать пакет видны');
    await p.eval(`document.querySelector('#rCap button[data-v="250"]').click(); document.querySelector('#rMode button[data-v="buf"]').click(); true`);
    await clickWait(p, '#rRun', idle); await sleep(200);
    check(/Средний успех на последних пяти проверках: 98%/.test(await text(p, '#rOut')), 'свободный режим: буфер 250 — средний успех 98% (' + (await text(p, '#rOut')).slice(-60) + ')');
    const bufDeep = await text(p, '#buffer .deep');
    check(['800–1200', '84–96%', '63–93%', '29–74%', 'от 0 до 38%', '70–74 раза'].every((x) => bufDeep.includes(x)), '«Под капотом» буфера: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- лаборатория 1: PPO и SAC ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapCAt')) && !(await visible(p, '#wrapCSeed')), 'миссия 1: ползунок момента и зёрна скрыты');
    await p.eval(`document.getElementById('race').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l53-race-empty.png'), '#race .lab', 6);
    r = await viaUI(p, '#cMis', 2);
    const c1 = r.out.match(/SAC дотягивается до цели в (\d+)% попыток, PPO - в (\d+)%\. SAC прошёл 90% уже к (\d+)-му шагу\. .*?в среднем ([\d,]+) раза/);
    check(r.ok && /ставка сыграла/i.test(r.out) && c1 && c1[1] === '100' && c1[2] === '45' && c1[3] === '500' && c1[4] === '23,5', `миссия 1: SAC ${c1 && c1[1]}%, PPO ${c1 && c1[2]}% к 750-му шагу; SAC 90% к ${c1 && c1[3]}; переход в пакетах ${c1 && c1[4]} раза`);
    await p.shotEl(out('l53-race.png'), '#race .lab', 6);
    await nextMission(p, '#cMis');
    check(await visible(p, '#wrapCAt'), 'миссия 2: ползунок момента обучения виден');
    r = await viaUI(p, '#cMis', 1);
    const c2 = r.out.match(/PPO дошёл до 90% к (\d[\d ]*)-му шагу, SAC - к (\d+)-му: в ([\d,]+) раза/);
    check(r.ok && /ставка сыграла/i.test(r.out) && c2 && c2[1].replace(/ /g, '') === '1250' && c2[2] === '500' && c2[3] === '2,5', `миссия 2: PPO к ${c2 && c2[1]}, SAC к ${c2 && c2[2]}, в ${c2 && c2[3]} раза`);
    await p.shotEl(out('l53-race-long.png'), '#race .lab', 6);
    await nextMission(p, '#cMis');
    r = await viaUI(p, '#cMis', 2);
    const c3 = r.out.match(/SAC сделал около (\d+) млн умножений, PPO - около (\d+) млн\. .*?в ([\d,]+) раза больше умножений/);
    check(r.ok && /ставка сыграла/i.test(r.out) && c3 && c3[1] === '118' && c3[2] === '98' && c3[3] === '3,0', `миссия 3: умножений до 90% — SAC ${c3 && c3[1]} млн, PPO ${c3 && c3[2]} млн, на шаг в ${c3 && c3[3]} раза больше`);
    await nextMission(p, '#cMis');
    check((await visible(p, '#wrapCSeed')), 'свободный режим: выбор зерна виден');
    await p.eval(`document.querySelector('#cSeed button[data-v="2"]').click(); true`);
    await clickWait(p, '#cSeedRun', `!window.__l53.Race.st.busy`); await sleep(200);
    check(/Зерно 2: SAC дошёл до 90% к 500-му шагу, PPO - к 1 125-му/.test(await text(p, '#cOut')), 'свободный режим, зерно 2: ' + (await text(p, '#cOut')));
    const raceDeep = await text(p, '#race .deep'), raceAfter = await text(p, '#raceAfter');
    check(['375–500', '0–45%', '1125–1875', '2,25–3,75', '23,5 раза', 'от 0,65 до 1,34', '2,4–3,0', '2625–4125', '1375–2375', 'на четырёх зёрнах из восьми'].every((x) => raceDeep.includes(x)), '«Под капотом» лаборатории 1: разброс по восьми зёрнам совпадает с INTEGRATION.md');
    const alpha750 = await p.eval(`(() => { const c = window.__l53.Race.st.sac[1].curve; return c[c.length - 1].alpha; })()`);
    check(Math.abs(alpha750 - 0.04) < 0.005 && raceAfter.includes('примерно до 0,04'), `вывод после лаборатории 1: температура к 750-му шагу ${alpha750.toFixed(3)} ≈ 0,04`);

    // ---------- лаборатория 2: температура ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapTAlpha')) && !(await visible(p, '#wrapTMode')), 'миссии 1–2: ползунок температуры скрыт');
    r = await viaUI(p, '#tMis', 1);
    const t1 = r.out.match(/^(?:Ставка сыграла\. )?(\d+)% попыток - к полке (\d), (\d+)% - к другой/);
    check(r.ok && /ставка сыграла/i.test(r.out) && t1 && t1[1] === '98' && t1[2] === '2' && t1[3] === '0', `миссия 1: α = 0,01 — ${t1 && t1[1]}% к полке ${t1 && t1[2]}`);
    await p.eval(`document.getElementById('alpha').scrollIntoView({ behavior: 'instant' }); true`); await sleep(200);
    await p.shotEl(out('l53-alpha-small.png'), '#alpha .lab', 6);
    await nextMission(p, '#tMis');
    r = await viaUI(p, '#tMis', 2);
    const t2 = r.out.match(/У полок заканчиваются (\d+)% попыток.*?за шаг - ([\d,]+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && t2 && t2[1] === '3' && t2[2] === '0,05', `миссия 2: α = 1 — у полок ${t2 && t2[1]}%, награда за шаг ${t2 && t2[2]}`);
    await p.shotEl(out('l53-alpha-big.png'), '#alpha .lab', 6);
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTAlpha'), 'миссия 3: ползунок температуры виден');
    for (const i of [3, 5, 4]) { await p.eval(`(() => { const e = document.getElementById('tAlpha'); e.value = ${i}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(100); await p.waitFor(`!window.__l53.Temp.st.busy`, 60000); await sleep(150); }
    r = await liveDone(p, '#tMis', 20000);
    const t3 = r.out.match(/При α = ([\d,]+): к полке 1 - (\d+)%, к полке 2 - (\d+)%, мимо - (\d+)%/);
    check(r.ok && t3 && t3[1] === '0,2' && t3[2] === '10' && t3[3] === '40' && t3[4] === '50', `миссия 3 засчитана сама: α = ${t3 && t3[1]} — ${t3 && t3[2]}% / ${t3 && t3[3]}% / мимо ${t3 && t3[4]}%`);
    await p.shotEl(out('l53-alpha-mid.png'), '#alpha .lab', 6);
    const q01 = await p.eval(`JSON.stringify(window.__l53.Temp.st.runs['0.1'])`).then(J), q03 = await p.eval(`JSON.stringify(window.__l53.Temp.st.runs['0.3'])`).then(J);
    check(q01.A < 0.05 || q01.B < 0.05, `α = 0,1: ещё одна полка (${Math.round(q01.A * 100)}/${Math.round(q01.B * 100)}); α = 0,3: у полок ${Math.round((q03.A + q03.B) * 100)}%`);
    await nextMission(p, '#tMis');
    check(await visible(p, '#wrapTMode'), 'свободный режим: переключатель «подбирать самой» виден');
    await p.eval(`document.querySelector('#tMode button[data-v="auto"]').click(); true`); await sleep(100); await p.waitFor(`!window.__l53.Temp.st.busy`, 60000); await sleep(150);
    const tOut = await text(p, '#tOut'), auto = await p.eval(`JSON.stringify(window.__l53.Temp.st.runs.auto)`).then(J);
    check(/к концу пришла к 0,018/.test(tOut) && Math.max(auto.A, auto.B) >= 0.98, `свободный режим, α сама: ${tOut.slice(0, 80)}; к одной полке ${Math.round(Math.max(auto.A, auto.B) * 100)}%`);
    const alDeep = await text(p, '#alpha .deep');
    check(['16 запусках из 18', 'ещё в одном - 88%', 'больше 3% попыток', 'в трёх запусках из шести', 'не меньше 98%', '0,011–0,026'].every((x) => alDeep.includes(x)), '«Под капотом» лаборатории 2: разброс по шести зёрнам совпадает с INTEGRATION.md');

    // ---------- тексты совпадают с расчётом ----------
    const fin = await text(p, '#finale .takeaways');
    check(['73 раза', 'с 96 до 52%', '98% попыток', '3% попыток', 'за 500 шагов против 1250', 'втрое больше умножений', '160 тысяч шагов', '20 минут'].every((x) => fin.includes(x)), 'итоги урока называют числа лабораторий и статей');
    const lead = await text(p, '.hero .lead');
    check(lead.includes('160 тысяч шагов') && lead.includes('больше 12 часов'), 'шапка: 160 тысяч шагов за два часа → миллион шагов больше 12 часов');

    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 20 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
    for (const [id, sel, n] of [['buffer', '#buffer .lab', 'l53-buffer-dark.png'], ['race', '#race .lab', 'l53-race-dark.png'], ['alpha', '#alpha .lab', 'l53-alpha-dark.png'], ['onpolicy', '#onpolicy .flow-card', 'l53-dataflow-dark.png'], ['sac', '#sac .flow-card', 'l53-sacupd-dark.png'], ['real', '#real .num-table', 'l53-real-dark.png']]) {
      await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, 6);
    }
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval("window.__l53.SPEED.k = 20; document.querySelector('.topbar').style.visibility = 'hidden'; true");
    await m.eval(`(async () => { const W = window.__l53; await W.Replay.api.to1000(); await W.Race.api.longer(); await W.Temp.api.at(0.2); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['onpolicy', '#onpolicy .flow-card', 'l53-m-dataflow.png'], ['buffer', '#buffer .lab', 'l53-m-buffer.png'], ['sac', '#sac .flow-card', 'l53-m-sacupd.png'], ['race', '#race .lab', 'l53-m-race.png'], ['alpha', '#alpha .lab', 'l53-m-alpha.png'], ['real', '#real .num-table', 'l53-m-real.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
