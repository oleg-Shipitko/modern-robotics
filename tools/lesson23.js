// Урок 2.3 «LLM-планировщики и VoxPoser»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// консоль чиста, телефон без горизонтальной прокрутки. Снимки — shots/l23-*.png.
// Урок собирается на дату выпуска: MR_ASOF=2026-10-10 python3 lessons/build.py l23.
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/2-3-llm-planirovshchiki.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    for (let i = 0; i < 600 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 120));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^17 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.2: три вопроса');
  // отсылки вперёд: названий моделей из будущих уроков нет в прозе, миссиях, разборах и квизе
  // (исключения — разминка, раздел «Сегодня», ссылки и анонс следующего урока в итоге, где названия идут с пояснением и номером урока)
  const fwdBody = await p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#recall, #glData, #today, #finale .links, #finale .callout, .katex").forEach((e) => e.remove()); return m.textContent; })()');
  const fwdSrc = ['../lessons/l23/ui-l23.js', '../lessons/l23/engine.js'].map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');
  const fwdBanned = ['RT-1', 'RT-2', 'Open X-Embodiment', 'Octo', 'OpenVLA', 'π0', 'PaliGemma', 'Helix', 'GR00T', 'Gemini', 'PaLM-E', ' VLA', 'VLM'];
  const fwdFound = fwdBanned.filter((w) => fwdBody.includes(w) || fwdSrc.includes(w));
  check(fwdFound.length === 0, 'отсылок вперёд по именам моделей нет' + (fwdFound.length ? ': ' + fwdFound.join(', ') : ''));
  check((await p.eval(`!!document.querySelector('a[href="proverka-chasti-2.html"]')`)), 'ссылка на проверку части 2 на месте');
  await p.eval('window.__l23.SPEED.k = 20; true');

  // ---------- 1. SayCan: миссии через интерфейс ----------
  console.log('SayCan');
  let r = await viaUI(p, '#sMis', 1);
  check(r.ok, 'миссия 1: только языковая модель — первый шаг невыполним');
  const s1 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(!s1.llm.success && s1.llm.firstFail.n === 1 && s1.llm.firstFail.why === 'шкаф закрыт', 'языковая модель начинает с «взять чашку из шкафа» и срывается: ' + s1.llm.firstFail.why);
  check(s1.llm.ids.join(',') === 'cup,place,brew,milk,pour,bring,done', 'план языковой модели — рецепт: ' + s1.llm.ids.join(', '));
  check(/ставка сыграла/i.test(r.out), 'ставка «Нет: первый же шаг не выйдет» сыграла');
  await nextMission(p, '#sMis'); r = await viaUI(p, '#sMis', 1);
  const s2 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(r.ok && s2.aff.ids[0] === 'kettle' && s2.aff.fails === 0 && !s2.aff.success, `миссия 2: только аффорданс — начинает с чайника, все шаги удались, итог «${s2.aff.verdict}»`);
  check(s2.aff.ids.slice(0, 3).join(',') === 'kettle,open,sugar', 'аффорданс: чайник, шкаф, сахар — как в разборе');
  await nextMission(p, '#sMis'); r = await viaUI(p, '#sMis', 1);
  const s3 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(r.ok && s3.saycan.success && s3.saycan.ids[0] === 'open' && s3.saycan.fails === 0, `миссия 3: SayCan — ${s3.saycan.n} шагов, первый «открыть шкаф», итог «${s3.saycan.verdict}»`);
  const fs1 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.firstScores('saycan'))`));
  check(Math.abs(fs1.llmCup - 0.52) < 0.005 && fs1.affCup === 0.04 && Math.abs(fs1.llmOpen - 0.11) < 0.006 && fs1.affOpen === 0.92, `оценки первого шага: чашка ${fs1.llmCup.toFixed(2)} × ${fs1.affCup} = ${fs1.prodCup.toFixed(3)}, шкаф ${fs1.llmOpen.toFixed(2)} × ${fs1.affOpen} = ${fs1.prodOpen.toFixed(3)}`);
  check(/0,52/.test(r.out) && /0,92/.test(r.out), 'разбор миссии 3 называет 0,52 и 0,92');
  await p.eval(`document.getElementById('saycan').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-saycan.png'), '#saycan .lab', 6);
  // миссия 4: шкаф открыт, молока нет
  await nextMission(p, '#sMis');
  await p.eval(`window.__l23.LabPlan.api.setWorld('cupboard', 'open'); true`);
  const s4a = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(s4a.llm.success, 'с открытым шкафом и молоком языковая модель справляется одна (подсказка миссии 4)');
  await p.eval(`window.__l23.LabPlan.api.setWorld('milk', 'no'); true`); await sleep(100);
  const s4 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(!s4.llm.success && s4.saycan.success && s4.saycan.ids.includes('oat') && await critOk(p, '#sMis'), `миссия 4: без молока языковая модель — «${s4.llm.verdict}», SayCan — «${s4.saycan.verdict}»`);
  check(J(await p.eval(`JSON.stringify(window.L23.affordance(window.L23.world({ milk: false }), 'milk'))`)) === 0.02, 'выполнимость «взять молоко» без молока — 0,02, как в разборе');
  // миссия 5: чашка уже под кофемашиной
  await nextMission(p, '#sMis');
  await p.eval(`window.__l23.LabPlan.api.setWorld('cup', 'machine'); true`); await sleep(100);
  const s5 = J(await p.eval(`JSON.stringify(window.__l23.LabPlan.api.state())`));
  check(s5.saycan.ids[0] === 'brew' && !['open', 'cup', 'place'].some((x) => s5.saycan.ids.includes(x)) && s5.saycan.success && await critOk(p, '#sMis'), `миссия 5: SayCan начинает с «сварить кофе», ${s5.saycan.n} шагов`);
  check(s5.llm.ids[0] === 'cup' && s5.llm.ids[1] === 'place' && s5.llm.fails === 2 && s5.llm.success, 'одна языковая модель: два первых шага срываются, но кофе готов');
  await p.eval(`document.getElementById('saycan').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-saycan-world.png'), '#saycan .lab', 6);

  // ---------- 2. Inner Monologue ----------
  console.log('Inner Monologue');
  r = await viaUI(p, '#mMis', 1);
  const m1 = J(await p.eval(`JSON.stringify(window.__l23.LabMono.api.state())`));
  check(r.ok && !m1.success && m1.cupTries === 1 && m1.diverge === 2, `миссия 1: без обратной связи — «${m1.verdict}», за чашку взялась ${m1.cupTries} раз, план разошёлся с кухней на шаге ${m1.diverge}`);
  const mp = J(await p.eval(`JSON.stringify(window.__l23.LabMono.st.plan.steps.map((s) => ({ id: s.id, ok: s.ok, affPlace: s.aff[window.L23.SI.place] })))`));
  check(mp.map((s) => s.id).join(',') === 'open,cup,milk,pour,bring,done' && mp.filter((s) => !s.ok && s.id !== 'done').length === 3, 'шаги: шкаф, чашка ✗, молоко, налить ✗, принести ✗, готово — три сбоя, как в тексте миссии 2');
  check(mp[2].affPlace <= 0.05, 'после сбоя выполнимость «поставить чашку под кофемашину» — ' + mp[2].affPlace);
  await nextMission(p, '#mMis');
  await p.eval(`window.__l23.LabMono.api.select(4); true`);
  check(!(await critOk(p, '#mMis')), 'миссия 2: шаг 4 — не ответ');
  await p.eval(`document.querySelector('#mLog .mono-r.step[data-n="2"]').click(); true`); await sleep(100);
  check(await critOk(p, '#mMis'), 'миссия 2: нажат шаг 2 — план разошёлся с кухней здесь');
  await nextMission(p, '#mMis');
  await p.eval(`window.__l23.LabMono.api.set({ fb: 'success' }); true`);
  r = await viaUI(p, '#mMis', 1);
  const m3 = J(await p.eval(`JSON.stringify(window.__l23.LabMono.api.state())`));
  check(r.ok && m3.success && m3.cupTries === 2, `миссия 3: с детектором успеха — «${m3.verdict}», за чашку взялась ${m3.cupTries} раза`);
  await p.eval(`document.getElementById('monologue').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-monologue.png'), '#monologue .lab', 6);
  await nextMission(p, '#mMis');
  r = await viaUI(p, '#mMis', 1);
  const m4 = J(await p.eval(`JSON.stringify(window.__l23.LabMono.api.state())`));
  const m4s = J(await p.eval(`JSON.stringify(window.__l23.LabMono.st.plan.steps.map((s) => s.id + (s.fb === undefined ? '' : s.fb ? '+' : '-')))`));
  check(r.ok && !m4.success && m4.lied, `миссия 4: детектор ошибся — «${m4.verdict}»`);
  check(m4s.join(',') === 'open+,cup+,milk+,pour-,pour-,done', 'после ложного «да»: молоко, два «нет» на «налить» и конец — ' + m4s.join(' '));

  // ---------- 3. Code as Policies ----------
  console.log('Code as Policies');
  const c1 = J(await p.eval(`JSON.stringify(window.__l23.LabCode.api.finish())`));
  check(c1.done && c1.gens.join(',') === 'is_empty,dist,stack_objects' && (c1.stackIn['синяя миска'] || []).length === 3 && c1.moves === 3, `миссия 1: ${c1.steps} шагов, модель дописала ${c1.gens.join(', ')}, кубики в синей миске, pick_place × ${c1.moves}`);
  check(c1.steps > 50 && c1.steps < 70, 'шагов больше пятидесяти (подсказка): ' + c1.steps);
  check(await critOk(p, '#cMis'), 'миссия 1 засчитана');
  await p.eval(`document.getElementById('code').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-code.png'), '#code .lab', 6);
  await nextMission(p, '#cMis');
  await p.eval(`window.__l23.LabCode.api.setLemon('blue'); true`);
  r = await viaUI(p, '#cMis', 1);
  const c2 = J(await p.eval(`JSON.stringify(window.__l23.LabCode.api.state())`));
  check(r.ok && (c2.stackIn['жёлтая миска'] || []).length === 3, 'миссия 2: лимон в синей миске — тот же код ставит кубики в жёлтую');
  await nextMission(p, '#cMis');
  r = await viaUI(p, '#cMis', 1);
  const c3 = J(await p.eval(`JSON.stringify(window.__l23.LabCode.api.state())`));
  check(r.ok && c3.prog === 'push' && c3.slip === '1' && c3.redX >= c3.bowlX && c3.moves === 14 && c3.getposRed === 29, `миссия 3: проскальзывание — ${c3.moves} сдвигов, get_pos(красный) × ${c3.getposRed}, кубик на ${c3.redX}, миска на ${c3.bowlX}`);
  await p.eval(`window.__l23.LabCode.api.setSlip('0'); true`);
  const c4 = J(await p.eval(`JSON.stringify(window.__l23.LabCode.api.finish())`));
  check(c4.moves === 9, 'без проскальзывания — 9 сдвигов («вместо 9» в разборе)');

  // ---------- 4. VoxPoser ----------
  console.log('VoxPoser');
  const v1 = J(await p.eval(`(() => { const X = window.__l23.LabVox.api; for (let i = 0; i < 12; i++) X.stepLine(); return JSON.stringify(X.state()); })()`));
  check(v1.all && v1.reached && !v1.hit && v1.gapCm > 0, `миссия 1: путь ${v1.lenCm.toFixed(0)} см, до ручки, зазор до вазы ${v1.gapCm.toFixed(1)} см`);
  check(await critOk(p, '#vMis'), 'миссия 1 засчитана');
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer.png'), '#voxposer .lab', 6);
  await nextMission(p, '#vMis');
  await p.eval(`document.querySelector('#vCode .code-ln.tog').click(); true`); await sleep(100);
  check(J(await p.eval(`JSON.stringify(window.__l23.LabVox.api.state())`)).path === false, 'после правки кода путь скрыт до запуска (ставку не выдаёт)');
  r = await viaUI(p, '#vMis', 1);
  const v2 = J(await p.eval(`JSON.stringify(window.__l23.LabVox.api.state())`));
  check(r.ok && !v2.avoid && v2.hit, `миссия 2: без карты избегания путь ${v2.lenCm.toFixed(0)} см и задевает вазу`);
  await p.eval(`window.__l23.LabVox.api.setView('avoid'); true`);
  await nextMission(p, '#vMis'); await sleep(100);
  const v3a = J(await p.eval(`JSON.stringify(window.__l23.LabVox.api.state())`));
  check(v3a.avoid && v3a.path && !v3a.hit, 'миссия 3: строки избегания вернулись, ваза в стороне от пути');
  const mid = J(await p.eval(`JSON.stringify(window.__l23.LabVox.st.plan.path[Math.floor(window.__l23.LabVox.st.plan.path.length / 2)])`));
  const v3 = J(await p.eval(`JSON.stringify(window.__l23.LabVox.api.dragVase(${JSON.stringify(mid)}))`));
  check(v3.onOld && !v3.hit && v3.reached && await critOk(p, '#vMis'), `миссия 3: ваза на прежнем пути, новый путь обходит её с зазором ${v3.gapCm.toFixed(1)} см`);
  await p.eval(`window.__l23.LabVox.api.setView('cost'); true`);
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer-drag.png'), '#voxposer .lab', 6);
  await nextMission(p, '#vMis');
  // миссия 4: поехать и подвинуть вазу на ходу (обычная скорость)
  await p.eval('window.__l23.SPEED.k = 1; true');
  await p.eval(`(() => { const root = document.querySelector('#vMis'); root.querySelectorAll('.m-bet .opts .btn')[1].click(); root.querySelector('.g-go').click(); return true; })()`);
  await sleep(1300);
  const ahead = J(await p.eval(`(() => { const st = window.__l23.LabVox.st, pth = st.plan.path; const g = st.grip; let best = null; for (const q of pth) { const d = Math.hypot(q.x - g.x, q.y - g.y); if (d > 11 && d < 14) { best = q; break; } } return JSON.stringify(best || pth[pth.length - 6]); })()`));
  await p.eval(`window.__l23.LabVox.api.moveVase(${JSON.stringify(ahead)}); true`);
  for (let i = 0; i < 200 && await p.eval(`document.querySelector('#vMis').classList.contains('m-busy')`); i++) await sleep(100);
  await sleep(200);
  const v4 = J(await p.eval(`JSON.stringify(window.__l23.LabVox.st)`, false));
  check(await critOk(p, '#vMis'), `миссия 4: вазу поставили на путь на ходу — захват у ручки, ваза не задета, пересчётов ${v4.replans}`);
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer-go.png'), '#voxposer .lab', 6);
  await p.eval('window.__l23.SPEED.k = 20; true');
  await nextMission(p, '#vMis'); await sleep(100);
  const w02 = J(await p.eval(`JSON.stringify(window.__l23.LabVox.api.state())`));
  check(w02.wo === 0.2 && w02.hit, 'миссия 5: вес 0,2 — путь задевает вазу');
  const w1 = J(await p.eval(`(window.__l23.LabVox.api.setW(1), JSON.stringify(window.__l23.LabVox.api.state()))`));
  check(!w1.hit && w1.gapCm <= 5 && w1.reached && await critOk(p, '#vMis'), `вес 1 (как в статье при весе притяжения 2): зазор ${w1.gapCm.toFixed(1)} см — миссия засчитана`);
  const w3 = J(await p.eval(`(window.__l23.LabVox.api.setW(3), JSON.stringify(window.__l23.LabVox.api.state()))`));
  check(!w3.hit && w3.gapCm > 5, `вес 3: крюк, зазор ${w3.gapCm.toFixed(1)} см`);
  const win = J(await p.eval(`(() => { const X = window.__l23.LabVox.api, ok = []; for (let w = 0; w <= 30; w++) { X.setW(w / 10); const s = X.state(); if (!s.hit && s.gapCm <= 5 && s.reached) ok.push(w / 10); } X.setW(1); return JSON.stringify(ok); })()`));
  check(win.length >= 5 && win.includes(1), 'окно весов, где миссия 5 проходит: ' + win.join(', '));

  // ---------- квиз, глоссарий, консоль ----------
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`window.__l23.LabPlan.api.select('saycan', 1); true`);
  await p.eval(`document.getElementById('saycan').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-saycan-dark.png'), '#saycan .lab', 6);
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer-dark.png'), '#voxposer .lab', 6);
  await p.eval(`document.getElementById('code').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-code-dark.png'), '#code .lab', 6);

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l23.SPEED.k = 20; true');
  await m.eval(`window.__l23.LabPlan.api.run('llm').then(() => window.__l23.LabPlan.api.run('saycan')).then(() => true)`, true);
  await m.eval(`window.__l23.LabMono.api.run().then(() => true)`, true);
  await m.eval(`(window.__l23.LabCode.api.finish(), window.__l23.LabVox.api.runAll(), true)`);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, n] of [['llm', 'l23-m-llm.png'], ['saycan', 'l23-m-saycan.png'], ['monologue', 'l23-m-monologue.png'], ['code', 'l23-m-code.png'], ['voxposer', 'l23-m-voxposer.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), id === 'llm' ? '#llm .wrap' : '#' + id + ' .lab', 4);
  }
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
