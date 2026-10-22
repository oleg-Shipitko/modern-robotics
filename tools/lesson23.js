// Урок 2.3 «LLM-планировщики и VoxPoser»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// консоль чиста, телефон без горизонтальной прокрутки. Схема подсказки SayCan показывает кандидатов с оценками, диаграмма
// чисел из статьи собрана из таблиц 2 и 3 общим модулем shared/stats-chart.js, анимированная схема устройства VoxPoser идёт и её подписи внутри канваса.
// Миссия 2 лаборатории VoxPoser проходится кликами мышью, как читатель: раньше код, выполненный кнопками под кодом, не
// засчитывался, и перехода к миссии 3 не было. Снимки — shots/l23-*.png (l23-prompt, l23-stats, l23-voxposer-scheme и телефонные l23-m-*).
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
const nextVisible = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); return !!b && !b.hidden; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
/** Клик мышью по центру элемента, как читатель: прокрутка к нему, проверка, что под курсором именно он, настоящие события мыши. */
async function mouseClick(p, sel, idx) {
  const at = async () => p.eval(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${idx || 0}]; if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const t = document.elementFromPoint(x, y); return { x, y, hit: !!t && (t === e || e.contains(t)), dis: !!e.disabled }; })()`);
  let r = await at(); if (!r) throw new Error('нет элемента ' + sel);
  if (!r.hit) { await sleep(700); r = await at(); }                                  // страница ещё плавно прокручивается
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(100);
  return r;
}
const waitFree = async (p, mis) => { for (let i = 0; i < 600 && await p.eval(`document.querySelector('${mis}').classList.contains('m-busy')`); i++) await sleep(50); await sleep(150); };
/** Кадры схемы для проверки подписей и кадр для снимка. */
const SCHEMES = { voxposer: { frames: [0.8, 2.6, 5, 7, 8.6, 10.2, 13, 16.5], shot: 13 } };
const SCHEME_NAME = { voxposer: 'схема устройства VoxPoser' };
/** Анимированная схема (shared/anim.js): на каждом кадре подписи внутри канваса, не мельче 9,6 px и не налезают друг на друга;
 *  тексты кадров — для проверки содержания. Без anim.js в сборке схемы нет: none = true. */
async function schemeLabels(p, kind, frames) {
  return JSON.parse(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]');
    if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [] });
    cv.scrollIntoView({ block: 'center' });
    const orig = CanvasRenderingContext2D.prototype.fillText, bad = [], small = [], texts = {}, prints = new Set();
    let boxes = null, W = 0, H = 0;
    CanvasRenderingContext2D.prototype.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) {
        const m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const x0 = a === 'center' ? x - m.width / 2 : a === 'right' ? x - m.width : x;
        boxes.push({ t: String(txt), fs, x0, x1: x0 + m.width, y0: y - fs / 2, y1: y + fs / 2 });
      }
      return orig.apply(this, arguments);
    };
    for (const t of ${JSON.stringify(frames)}) {
      boxes = []; Anim.seek(cv, t); const b = boxes; boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 3) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      [W, H] = cv.style.aspectRatio.split('/').map(Number); texts[t] = b.map((q) => q.t);
      const kk = W / cv.getBoundingClientRect().width;
      b.forEach((q) => { if (q.x0 < 1 || q.x1 > W - 1 || q.y0 < 0 || q.y1 > H) bad.push('t = ' + t + ': за краем «' + q.t + '»'); if (q.fs / kk < 9.6) small.push('t = ' + t + ': «' + q.t + '» ' + (q.fs / kk).toFixed(1) + ' px'); });
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0);
        if (ox > 1 && oy > 1) bad.push('t = ' + t + ': «' + b[i].t + '» на «' + b[j].t + '»');
      }
    }
    CanvasRenderingContext2D.prototype.fillText = orig;
    return JSON.stringify({ layout: cv.dataset.layout, W, H, bad: bad.concat(small), texts, distinct: prints.size });
  })()`));
}
/** Схема: подписи в канвасе, кадры этапов различаются, содержание ключевых кадров; снимок кадра. */
async function schemeChecks(p, where, layout) {
  for (const [kind, S] of Object.entries(SCHEMES)) {
    const r = await schemeLabels(p, kind, S.frames);
    if (r.none) { check(false, `${where}${SCHEME_NAME[kind]}: схемы нет — в build.py для l23 нужны shared/anim.js и l23/flow.js перед l23/ui-l23.js`); continue; }
    check(r.layout === layout && r.bad.length === 0, `${where}${SCHEME_NAME[kind]} ${r.W}×${r.H}: подписи в канвасе, не мельче 9,6 px и не налезают` + (r.bad.length ? ': ' + r.bad.slice(0, 4).join('; ') : ''));
    check(r.distinct === S.frames.length, `${where}${SCHEME_NAME[kind]}: кадры ${S.frames.length} этапов различаются (разных ${r.distinct})`);
    const tx = (t) => r.texts[String(t)] || [];
    check(tx(2.6).includes('языковая модель пишет код') && tx(2.6).includes('vase = detect("ваза")') && tx(5).includes('находит на кадре') && tx(5).includes('ваза') && tx(7).includes('карта притяжения') && tx(7).includes('карта избегания') && tx(8.6).includes('−2 ×') && tx(8.6).includes('стоимость'),
      `${where}схема: просьба, код модели, детектор находит ручку и вазу, карты притяжения и избегания, стоимость как взвешенная сумма`);
    check(tx(13).some((q) => /^пересчёт пути: \d+$/.test(q)) && tx(13).includes('5 раз в секунду') && tx(16.5).includes('захват у ручки'),
      `${where}схема: езда с пересчётом пути 5 раз в секунду, в конце захват у ручки`);
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); Anim.seek(cv, ${S.shot}); cv.classList.remove('paused'); return true; })()`);
    await p.shotEl(out(`l23-${where ? 'm-' : ''}${kind}-scheme.png`), `figure:has(> canvas[data-anim=${kind}])`, where ? 4 : 6);
  }
}
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  check(/^17 миссий с целью$/.test(await p.eval(`document.getElementById('heroMis').textContent`)), 'число миссий в шапке: ' + await p.eval(`document.getElementById('heroMis').textContent`));
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.2: три вопроса');
  // отсылки вперёд: первое упоминание модели из будущего урока в основном тексте (без разминки, глоссария, формул,
  // раздела «Сегодня» и итога) и в исходниках интерактивов идёт с номером урока «урок N.M» не дальше 160 символов; остальные упоминания свободны
  const fwdNames = ['RT-1', 'RT-2', 'Open X-Embodiment', 'Octo', 'OpenVLA', 'SmolVLA', 'π0', 'PaliGemma', 'Helix', 'GR00T', 'Gemini', 'PaLM-E'];
  const fwdSrc = ['../lessons/l23/ui-l23.js', '../lessons/l23/engine.js', '../lessons/l23/flow.js'].map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');
  const fwdCheck = async () => {
    const body = await p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#recall, #glData, #today, #finale, .katex").forEach((e) => e.remove()); return m.textContent; })()');
    const near = (t, w) => { const i = t.indexOf(w); return i < 0 || /урок[а-яё]*\s+\d\.\d/i.test(t.slice(Math.max(0, i - 160), i + w.length + 160)); };
    const bad = fwdNames.filter((w) => !near(body, w) || !near(fwdSrc, w));
    check(bad.length === 0, 'первое упоминание модели из будущего урока — с номером урока' + (bad.length ? ': ' + bad.join(', ') : ''));
  };
  check((await p.eval(`!!document.querySelector('a[href="proverka-chasti-2.html"]')`)), 'ссылка на проверку части 2 на месте');
  await p.eval('window.__l23.SPEED.k = 20; true');

  // ---------- 0. Знание: подсказка SayCan с кандидатами ----------
  console.log('Подсказка SayCan');
  const pf = J(await p.eval(`JSON.stringify({ n: document.querySelectorAll('#pfCands .pf-row').length, top: window.__l23.mis.prompt.top.map((o) => [o.text, +o.v.toFixed(2)]), rest: document.querySelector('#pfCands .pf-rest').textContent, old: document.body.textContent.includes('какой навык?') })`));
  check(pf.n === 5 && pf.top[0][0] === 'взять чашку из шкафа' && pf.top[0][1] === 0.52 && pf.top[1][0] === 'сварить кофе' && pf.top[2][0] === 'открыть шкаф', `кандидаты: ${pf.top.map((t) => `${t[0]} ${t[1]}`).join(', ')}`);
  check(/ещё 6 навыков, в сумме 0,\d\d/.test(pf.rest) && !pf.old, 'остальные навыки одной строкой, «какой навык?» убран: ' + pf.rest);
  const pf2 = J(await p.eval(`(() => { const P = window.__l23.mis.prompt; P.stop(); P.show(2, true); return JSON.stringify({ slot: document.getElementById('pfSlot').textContent, cur: document.querySelectorAll('#pfCands .pf-row.cur').length, scored: document.querySelectorAll('#pfCands .pf-row.scored').length }); })()`));
  check(pf2.slot === 'открыть шкаф' && pf2.cur === 1 && pf2.scored === 5, 'кандидат встаёт в строку «Робот: 1.», оценки видны: ' + pf2.slot);
  await p.eval(`document.querySelectorAll('#pfCands .pf-row')[0].click(); true`); await sleep(100);
  check((await p.eval(`document.getElementById('pfSlot').textContent`)) === 'взять чашку из шкафа', 'нажатие на кандидата подставляет его в строку ответа');
  await p.eval(`window.__l23.mis.prompt.show(2, true); true`); await sleep(500);
  await p.shotEl(out('l23-prompt.png'), '.prompt-fig', 6);

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
  check(r.ok && s2.aff.ids[0] === 'kettle' && s2.aff.fails === 0 && !s2.aff.success, `миссия 2: только выполнимость — начинает с чайника, все шаги удались, итог «${s2.aff.verdict}»`);
  check(s2.aff.ids.slice(0, 3).join(',') === 'kettle,open,sugar', 'только выполнимость: чайник, шкаф, сахар — как в разборе');
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
  // диаграмма чисел из статьи: таблицы 2 и 3, доли ошибок
  const sb = J(await p.eval(`JSON.stringify({ vals: [...document.querySelectorAll('#sStats .sb-bar b')].map((b) => b.textContent), legend: [...document.querySelectorAll('#sStats .sb-legend span')].map((s) => s.textContent), groups: [...document.querySelectorAll('#sStats .sb-glab')].map((g) => g.textContent), ticks: [...document.querySelectorAll('#sStats .sb-tick em')].map((e) => e.textContent), fill: document.querySelector('#sErrs .sm-fill').style.getPropertyValue('--v') || getComputedStyle(document.querySelector('#sErrs .sm-bar')).getPropertyValue('--v'), labs: [...document.querySelectorAll('#sErrs .sm-labs span')].map((s) => s.textContent), cap: document.querySelector('.stat-cap').textContent })`));
  check(sb.vals.join(' ') === '84% 74% 81% 60% 67% 70% 61%' && sb.groups.length === 4 && sb.legend.join(' | ') === 'верный план | задача доведена до конца', 'диаграмма SayCan: столбцы ' + sb.vals.join(' ') + ', группы: ' + sb.groups.join('; '));
  check(sb.ticks.join(' ') === '0% 50% 100%' && sb.fill.trim() === '65%' && sb.labs.join(' | ') === '65% языковая модель | 35% функции ценности', 'ось 0–100 %, доли ошибок 65 / 35');
  check(/84%.*74%.*81%.*60%.*67%.*70%.*61%.*65%.*35%/.test(sb.cap) && !/84%/.test(await p.eval(`document.querySelector('#saycan .stat-fig + .prose p').textContent`)), 'числа — в подписи диаграммы, абзац после неё — вывод без чисел');
  check(await p.eval(`typeof window.StatsChart === 'object' && window.__l23.statBars === window.StatsChart.bars && window.__l23.statMeter === window.StatsChart.meter && document.getElementById('sStats').classList.contains('stat-bars') && document.getElementById('sErrs').classList.contains('stat-meter')`), 'диаграмму строит общий модуль shared/stats-chart.js (StatsChart.bars и StatsChart.meter)');
  await p.shotEl(out('l23-stats.png'), '.stat-fig', 6);

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

  // ---------- 4. VoxPoser: схема устройства, миссии 1 и 2 мышью, как читатель ----------
  console.log('VoxPoser');
  await schemeChecks(p, '', 'w');
  const vState = () => p.eval(`JSON.stringify(window.__l23.LabVox.api.state())`).then(J);
  check(!(await p.eval(`document.getElementById('vBtns').hidden`)), 'миссия 1: кнопки «Выполнить строку» и «Выполнить всё» под кодом видны');
  for (let i = 0; i < 9; i++) await mouseClick(p, '#vStep');
  const v1 = await vState();
  check(v1.all && v1.reached && !v1.hit && v1.gapCm > 0, `миссия 1: девять нажатий «Выполнить строку» мышью — путь ${v1.lenCm.toFixed(0)} см, до ручки, зазор до вазы ${v1.gapCm.toFixed(1)} см`);
  check(await critOk(p, '#vMis') && await nextVisible(p, '#vMis'), 'миссия 1 засчитана, кнопка «Следующая миссия» видна');
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer.png'), '#voxposer .lab', 6);
  await mouseClick(p, '#vMis .g-next'); await sleep(900);                              // карточка плавно прокручивается к условию миссии 2
  check((await p.eval(`window.__l23.mis.vox.index`)) === 1 && await p.eval(`document.getElementById('vBtns').hidden`), 'миссия 2: кнопки под кодом скрыты — код запускает кнопка «Выполнить код» в карточке миссии');
  await mouseClick(p, '#vMis .m-bet .opts .btn', 1);
  await mouseClick(p, '#vCode .code-ln.tog', 1);
  const v2a = await vState();
  check(!v2a.avoid && v2a.pc === 0 && v2a.path === false, 'нажатие мышью на строку карты избегания комментирует её; карты и путь скрыты до запуска (ставку не выдаёт)');
  const goBtn = await mouseClick(p, '#vMis .g-go');
  check(!goBtn.dis, 'после ставки кнопка «Выполнить код» доступна');
  await waitFree(p, '#vMis');
  const v2 = await vState();
  check(await critOk(p, '#vMis') && !v2.avoid && v2.hit, `миссия 2 кликами мышью: без карты избегания путь ${v2.lenCm.toFixed(0)} см и задевает вазу — засчитана`);
  check(await nextVisible(p, '#vMis') && /Ставка сыграла/.test(await outText(p, '#vMis')), 'переход к миссии 3 появился, ставка сыграла');
  await p.eval(`window.__l23.LabVox.api.setView('avoid'); true`);
  await nextMission(p, '#vMis'); await sleep(100);
  const v3a = await vState();
  check(v3a.avoid && v3a.path && !v3a.hit && !(await p.eval(`document.getElementById('vBtns').hidden`)), 'миссия 3: строки избегания вернулись, ваза в стороне от пути, кнопки под кодом снова видны');
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
  const w02 = await vState();
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
  await fwdCheck();
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 5, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await p.eval(`window.__l23.LabPlan.api.select('saycan', 1); true`);
  await p.eval(`document.getElementById('saycan').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-saycan-dark.png'), '#saycan .lab', 6);
  await p.shotEl(out('l23-stats-dark.png'), '.stat-fig', 6);
  await p.eval(`document.getElementById('voxposer').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-voxposer-dark.png'), '#voxposer .lab', 6);
  await p.eval(`document.getElementById('code').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out('l23-code-dark.png'), '#code .lab', 6);

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l23.SPEED.k = 20; true');
  await m.eval(`window.__l23.LabPlan.api.run('llm').then(() => window.__l23.LabPlan.api.run('saycan')).then(() => true)`, true);
  await m.eval(`window.__l23.LabMono.api.run().then(() => true)`, true);
  await m.eval(`window.__l23.LabCode.api.finish(); true`);
  // VoxPoser на телефоне: миссия 1 строками, в миссии 2 код запущен кнопкой «Выполнить всё» под кодом (она скрыта, но
  // нажата программно, как если бы снова появилась): страховка viaMission засчитывает миссию через её кнопку
  await m.eval(`(() => { const X = window.__l23.LabVox.api; for (let i = 0; i < 12; i++) X.stepLine(); return true; })()`);
  check(await critOk(m, '#vMis'), 'телефон: миссия 1 VoxPoser засчитана');
  await nextMission(m, '#vMis'); await sleep(200);
  await m.eval(`(() => { const root = document.querySelector('#vMis'); root.querySelectorAll('.m-bet .opts .btn')[1].click(); document.querySelectorAll('#vCode .code-ln.tog')[0].click(); document.getElementById('vAll').click(); return true; })()`);
  await waitFree(m, '#vMis');
  check(await critOk(m, '#vMis') && await nextVisible(m, '#vMis'), 'телефон: код в миссии 2 выполнен кнопкой под кодом — миссия всё равно засчитана, переход к миссии 3 виден');
  await m.eval(`window.__l23.mis.prompt.stop(); window.__l23.mis.prompt.show(2, true); true`);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const over = await m.eval(`JSON.stringify([...document.querySelectorAll('.lab, .prompt-fig, .stat-fig, .scheme-fig')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => (e.closest('section') || {}).id + ' ' + e.className))`);
  check(over === '[]', 'на телефоне содержимое лабораторий, подсказки и диаграммы не шире карточек ' + (over === '[]' ? '' : over));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['llm', '#llm .wrap', 'l23-m-llm.png'], ['llm', '.prompt-fig', 'l23-m-prompt.png'], ['saycan', '#saycan .lab', 'l23-m-saycan.png'], ['saycan', '.stat-fig', 'l23-m-stats.png'], ['monologue', '#monologue .lab', 'l23-m-monologue.png'], ['code', '#code .lab', 'l23-m-code.png'], ['voxposer', '#voxposer .lab', 'l23-m-voxposer.png']]) {
    await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
    await m.shotEl(out(n), sel, 4);
  }
  await schemeChecks(m, 'телефон: ', 'n');
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
