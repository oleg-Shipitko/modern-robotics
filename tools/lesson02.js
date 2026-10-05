// Проверка урока 0.2 «Устройство робота»: все миссии проходятся программно (ставки, перетаскивание
// через CDP, подбор параметров, сортировка карточек), квиз, тёмная тема, телефон 390 px.
// Запуск: node tools/lesson02.js   (сначала python3 lessons/build.py l02)
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/0-2-ustroystvo-robota.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const J = JSON.stringify;
let fails = 0;
const check = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) fails++; };

function helpers(p) {
  const q = (s) => p.eval(s);
  const M = {
    async scroll(sel) { await q(`document.querySelector(${J(sel)}).scrollIntoView({block: "center", behavior: "instant"})`); await sleep(250); },
    idx: (mod) => q(`window.__l02.${mod}.ctl.index`),
    async bet(root, text) { await q(`[...document.querySelectorAll(${J(root + ' .m-bet .opts button')})].find((b) => b.textContent.trim() === ${J(text)}).click()`); },
    async act(root, timeout) {
      await q(`document.querySelector(${J(root + ' .g-go')}).click()`); await sleep(80);
      await p.waitFor(`!document.querySelector(${J(root)}).classList.contains("m-busy")`, timeout || 60000); await sleep(60);
    },
    crit: (root) => q(`[...document.querySelectorAll(${J(root + ' .m-crit li')})].map((l) => l.className).join(",")`),
    out: (root) => q(`(() => { const o = document.querySelector(${J(root + ' .g-out')}); return o && !o.hidden ? o.textContent : ""; })()`),
    log: (root) => q(`[...document.querySelectorAll(${J(root + ' .m-log li')})].map((l) => (l.className === "ok" ? "✓ " : "✗ ") + l.textContent).join(" | ")`),
    betMarks: (root) => q(`[...document.querySelectorAll(${J(root + ' .m-bet .opts button')})].map((b) => b.className.includes("bet-right") ? b.textContent + "✓" : b.className.includes("bet-wrong") ? b.textContent + "✗" : "").filter(Boolean).join(" ")`),
    async next(root) { await q(`document.querySelector(${J(root + ' .g-next')}).click()`); await sleep(150); },
    kicker: (root) => q(`document.querySelector(${J(root + ' .g-kicker')}).textContent`),
    async drag(a, b, opt) {
      opt = opt || {};
      await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
      const n = opt.steps || 12;
      for (let t = 1; t <= n; t++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * t / n, y: a.y + (b.y - a.y) * t / n, button: 'left', buttons: 1 }); await sleep(opt.stepMs || 16); }
      if (opt.hold) { const t0 = Date.now(); while (Date.now() - t0 < opt.hold) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1 }); await sleep(120); if (opt.until && await q(opt.until)) break; } }
      await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 }); await sleep(120);
    },
    async setRange(sel, v) { await q(`(() => { const r = document.querySelector(${J(sel)}); r.value = ${v}; r.dispatchEvent(new Event("input", {bubbles: true})); })()`); await sleep(60); },
    async segClick(sel, text) { await q(`[...document.querySelectorAll(${J(sel + ' button')})].find((b) => b.textContent.trim() === ${J(text)}).click()`); await sleep(60); },
    // точки сцен в координатах страницы
    armPt: (wx, wy) => q(`(() => { const cv = document.querySelector("#armCv"), r = cv.getBoundingClientRect(), A = window.__l02.ArmLab; return { x: r.left + A.X(${wx}) / 520 * r.width, y: r.top + A.Y(${wy}) / 420 * r.height }; })()`),
    armJoint: (k) => q(`(() => { const st = window.__l02.ArmLab.st, L = st.n === 2 ? ArmK.L2 : ArmK.L3, pts = ArmK.fk(L, st.q), pt = ${k} < 0 ? pts[pts.length - 1] : pts[${k}]; const cv = document.querySelector("#armCv"), r = cv.getBoundingClientRect(), A = window.__l02.ArmLab; return { x: r.left + A.X(pt[0]) / 520 * r.width, y: r.top + A.Y(pt[1]) / 420 * r.height }; })()`),
    gearTip: (i, th) => q(`(() => { const GL = window.__l02.GearLab, G = GL.G, ln = GL.st.lanes[${i}], a = ${th == null ? 'ln.link.th' : th}; const cv = document.querySelector("#gearCv"), r = cv.getBoundingClientRect(); const x = G.PIVX + Math.cos(a) * G.LEN, y = GL.pivY(${i}) + Math.sin(a) * G.LEN; return { x: r.left + x / G.W * r.width, y: r.top + y / G.H * r.height }; })()`),
  };
  return M;
}

async function body(p, M) {
  console.log('Тело в цифрах');
  await M.scroll('#bodySvg');
  for (const z of ['head', 'torso', 'joint', 'hand', 'foot']) { await p.eval(`document.querySelector('#bodySvg .b-zone[data-z=${z}]').dispatchEvent(new MouseEvent("click", {bubbles: true}))`); await sleep(60); }
  const cnt = await p.eval('document.querySelector("#bodyCount").textContent');
  check(cnt.includes('все пять'), 'осмотрены все пять зон: ' + cnt);
  await p.eval(`document.querySelector('#bodySvg .b-zone[data-z=joint]').dispatchEvent(new MouseEvent("click", {bubbles: true}))`);
  const det = await p.eval('document.querySelector("#bodyDetail h4").textContent');
  const on = await p.eval('[...document.querySelectorAll("#bodyFlow .bf-step.on")].map((e) => e.dataset.f).join(",")');
  check(det.startsWith('Суставы') && on === 'sens,pd,motor', `суставы: «${det}», подсвечено ${on}`);
  check(await p.eval('document.querySelectorAll("#bodyCmp .cmp-h").length') === 5, 'сравнение: четыре робота колонками');
}

async function arm(p, M, shots) {
  console.log('Рука из звеньев');
  const R = '#armGuide';
  await M.scroll('#armCv');
  if (shots) await p.shotEl(out('l02-arm-start.png'), '#dof .lab', 6);
  await M.bet(R, 'Не хватит');
  const cup = await M.armPt(0.42, 0.112);
  await M.drag(await M.armJoint(-1), cup, { steps: 16 });
  console.log('    после перетаскивания:', await p.eval('document.querySelector("#armRead").textContent'));
  await M.act(R);
  check((await M.crit(R)) === 'ok,no', 'два сустава: захват у чашки, но рука задевает препятствие — ' + (await M.crit(R)));
  console.log('    журнал:', await M.log(R), '| ставка:', await M.betMarks(R));
  await M.segClick('#armJointsWrap', '3 сустава');
  await p.eval('document.querySelector("#armZone").click()'); await sleep(250);
  if (shots) await p.shotEl(out('l02-arm-zone.png'), '#dof .lab', 6);
  await M.act(R);
  check((await M.crit(R)) === 'ok,ok', 'три сустава: чашка взята без столкновений');
  console.log('    разбор:', (await M.out(R)).slice(0, 160));
  await M.next(R); await sleep(1100);
  check((await M.crit(R)) === 'ok,no', 'миссия 2: лампа опустилась, локоть задевает — ' + (await M.crit(R)));
  const el = await M.armJoint(1), target = await M.armPt(0.27, 0.32);
  await M.drag(el, target, { steps: 14 });
  check((await M.crit(R)) === 'ok,ok', 'локоть отведён, захват на месте: ' + (await p.eval('document.querySelector("#armRead").textContent')));
  if (shots) await p.shotEl(out('l02-arm.png'), '#dof .lab', 6);
  await M.next(R);
  check((await M.kicker(R)) === 'Свободный режим', 'свободный режим открыт');
}

async function gear(p, M, shots) {
  console.log('Лаборатория 1: редуктор и удар');
  const R = '#gearGuide';
  await M.scroll('#gearCv');
  await M.bet(R, '6 : 1'); await M.act(R, 20000);
  const o1 = await M.out(R); console.log('    толчок:', o1.slice(0, 150));
  check(/52°/.test(o1) && /0,3 с/.test(o1) && /не сдвинулось/.test(o1), 'толчок: 6:1 — 52° до упора за 0,3 с, 100:1 — 0°');
  await M.next(R);
  await M.bet(R, 'При 100 : 1'); await M.act(R, 20000);
  const o2 = await M.out(R); console.log('    удар:', o2.slice(0, 150));
  check(/134 Н·м/.test(o2) && /608 Н·м/.test(o2), 'удар: 134 против 608 Н·м');
  if (shots) await p.shotEl(out('l02-gear.png'), '#gear .lab', 6);
  await M.next(R);
  const RA = await p.eval('window.__l02.GearLab.RATIOS');
  for (const n of [6, 30, 15]) { await M.setRange('#gearNA', RA.indexOf(n)); await M.act(R, 20000); console.log(`    колено ${n}:1 →`, await M.crit(R)); }
  console.log('    журнал:', await M.log(R));
  check((await M.crit(R)) === 'ok,ok', 'колено: 15:1 проходит оба критерия');
  if (shots) await p.shotEl(out('l02-gear-knee.png'), '#gear .lab', 6);
  console.log('    разбор:', (await M.out(R)).slice(0, 120));
  await M.next(R); await sleep(200);
  await M.scroll('#gearCv');
  const up = -1.18;
  await M.drag(await M.gearTip(0), await M.gearTip(0, up), { steps: 10, hold: 1500, until: 'window.__l02.GearLab.st.lanes[0].reached' });
  await M.drag(await M.gearTip(1), await M.gearTip(1, up), { steps: 10, hold: 12000, until: 'window.__l02.GearLab.st.lanes[1].reached' });
  check((await M.crit(R)) === 'ok,ok', 'прозрачность: оба звена дотянуты до отметки');
  console.log('    разбор:', (await M.out(R)).slice(0, 120));
  await M.next(R);
  await M.setRange('#gearNA', RA.indexOf(160)); await p.click('#gearHit');
  await p.waitFor('window.__l02.GearLab.st.mode === "idle" && window.__l02.GearLab.st.lanes[0].imp != null', 20000);
  const p160 = await p.eval('Math.round(window.__l02.GearLab.st.lanes[0].imp)');
  check(p160 === 978, 'свободный режим: удар при 160:1 — ' + p160 + ' Н·м');
  if (shots) await p.shotEl(out('l02-gear-free.png'), '#gear .lab', 6);
}

async function sortCards(p, M, root, ctlPath, plan, real) {
  const byHand = (k) => (Array.isArray(real) ? real.includes(k) : k < real);
  await M.scroll(root);
  const items = await p.eval(`window.__l02.${ctlPath}.items.map((i) => [i.id, i.target])`);
  for (let k = 0; k < items.length; k++) {
    const [id, target] = items[k];
    if (byHand(k)) {
      // настоящий ввод мышью или пальцем: перетаскивание, а если корзина далеко — «нажми карточку, потом корзину»
      const center = (sel) => p.eval(`(() => { const r = document.querySelector(${J(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: r.top > 0 && r.bottom < innerHeight }; })()`);
      const cardSel = root + ' [data-id=' + id + ']', zoneSel = root + ' .c-zone[data-zone=' + target + ']';
      await p.eval(`document.querySelector(${J(cardSel)}).scrollIntoView({block: "start", behavior: "instant"}); window.scrollBy(0, -20)`); await sleep(120);
      const a = await center(cardSel), b = await center(zoneSel);
      if (b.vis) await M.drag(a, b, { steps: 8 });
      else {
        const tap = async (pt) => { await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await sleep(80); };
        await tap(a);
        await p.eval(`document.querySelector(${J(zoneSel)}).scrollIntoView({block: "center", behavior: "instant"})`); await sleep(120);
        const zh = await p.eval(`(() => { const r = document.querySelector(${J(zoneSel + ' .c-zone-h')}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await tap(zh);
      }
      const where = await p.eval(`document.querySelector(${J(cardSel)}).parentElement.dataset.zone`);
      check(where === target, `карточка «${id}» положена ${b.vis ? 'перетаскиванием' : 'нажатиями'} в «${target}»`);
    } else await p.eval(`window.__l02.${ctlPath}.ctl.place(${J(id)}, ${J(plan === 'wrong' && k === items.length - 1 ? items[0][1] : target)})`);
  }
  await p.eval(`document.querySelector(${J(root + ' .c-bar .btn.primary')}).click()`); await sleep(150);
  return p.eval(`document.querySelector(${J(root + ' .c-out')}).textContent`);
}

async function imu(p, M, shots) {
  console.log('IMU');
  const R = '#imuGuide';
  await M.scroll('#imuCv');
  await M.bet(R, 'Только гироскоп'); await M.act(R, 20000);
  const o1 = await M.out(R); console.log('    ', o1.slice(0, 170));
  check(/18°/.test(o1) && /4,7°/.test(o1) && /3,4°/.test(o1), 'дрейф 18°, акселерометр 4,7°, фильтр при α = 0,5 — 3,4°');
  console.log('    ставка:', await M.betMarks(R));
  await M.next(R);
  const AL = await p.eval('window.__l02.ImuLab.ALPHAS');
  await M.setRange('#imuAlpha', AL.indexOf(0.9)); check((await M.crit(R)) === 'no', 'α = 0,9 — ещё не меньше 1,6°');
  await M.setRange('#imuAlpha', AL.indexOf(1)); const e1 = await p.eval('window.__l02.ImuLab.st.run.filt.rmse');
  check(Math.abs(e1 - 11.2) < 0.05, `α = 1 — ${e1.toFixed(2)}° (ожидаем 11,2°)`);
  await M.setRange('#imuAlpha', AL.indexOf(0.98)); check((await M.crit(R)) === 'ok', 'α = 0,98 — меньше 1,6°');
  if (shots) await p.shotEl(out('l02-imu-alpha.png'), '#sensors .lab', 6);
  const o2 = await M.out(R); check(/1,5°/.test(o2), 'разбор: при α = 0,98 ошибка 1,5°');
  await M.next(R);
  await M.bet(R, 'Акселерометр'); await M.act(R, 20000);
  console.log('    тряска:', await M.log(R), '| ставка:', await M.betMarks(R));
  check((await M.crit(R)) === 'ok', 'тряска: фильтр держит меньше 2°');
  if (shots) await p.shotEl(out('l02-imu.png'), '#sensors .lab', 6);
  await M.next(R);
}

async function act(p, M, shots) {
  console.log('Лаборатория 2: модель привода');
  const R = '#actGuide';
  await M.scroll('#actCv');
  await M.bet(R, 'Быстрая');
  await M.segClick('#actCmdWrap', 'Медленная'); await M.act(R); const c1 = await M.crit(R);
  await M.segClick('#actCmdWrap', 'Быстрая'); await M.act(R); const c2 = await M.crit(R);
  console.log('    журнал:', await M.log(R), '| ставка:', await M.betMarks(R));
  check(c1 === 'no' && c2 === 'ok', 'медленная не проходит, быстрая — больше 5°');
  await M.next(R);
  await M.bet(R, 'В пять раз и больше'); await M.act(R, 90000);
  const o2 = await M.out(R); console.log('    ', o2.slice(0, 150));
  check(/7 997/.test(o2.replace(/ /g, ' ')) && /0,6°/.test(o2) && /3,8°/.test(o2), 'модель привода: 3,8° → 0,6° на 7997 примерах');
  if (shots) await p.shotEl(out('l02-act.png'), '#model .lab', 6);
  await M.next(R);
  for (const T of ['20 с', '2 с', '5 с']) { await M.segClick('#actDataWrap', T); await M.act(R, 90000); console.log(`    ${T} →`, await M.crit(R)); }
  console.log('    кривая:', await M.log(R));
  check((await M.crit(R)) === 'ok,ok', 'минимум данных для ошибки < 1° — 5 с');
  if (shots) await p.shotEl(out('l02-act-curve.png'), '#model .lab', 6);
  await M.next(R);
  await M.setRange('#actDelay', 16);
  check((await M.crit(R)) === 'ok', 'задержка 40 мс: разрыв ≥ 8° — ' + (await p.eval('window.__l02.ActLab.st.errSim.toFixed(2)')));
  if (shots) await p.shotEl(out('l02-act-m4.png'), '#model .lab', 6);
  await M.next(R);
  await M.bet(R, 'Поможет, но не до конца'); await M.act(R, 90000);
  console.log('    починка:', await M.log(R), '| ставка:', await M.betMarks(R));
  check((await M.crit(R)) === 'ok', 'переобученная сеть вдвое точнее симулятора');
  if (shots) await p.shotEl(out('l02-act-break.png'), '#model .lab', 6);
  await M.next(R);
}

(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  // для скриншотов элементов: липкая шапка иначе впечатывается в середину кадра
  await p.eval('document.querySelector(".topbar").style.position = "static"');
  const ids = await p.eval('(() => { const seen = {}, dup = []; document.querySelectorAll("[id]").forEach((e) => { if (seen[e.id]) dup.push(e.id); seen[e.id] = 1; }); return dup; })()');
  check(ids.length === 0, 'id без повторов' + (ids.length ? ': ' + ids.join(', ') : ''));
  const M = helpers(p);
  await body(p, M); await p.shotEl(out('l02-body.png'), '#io .wrap', 6);
  await arm(p, M, true);
  await gear(p, M, true);
  console.log('Какой привод куда');
  const t = await sortCards(p, M, '#typesSort', 'TypesSort', 'right', 2); check(/^8 из 8/.test(t), 'сортировка приводов: ' + t.slice(0, 40));
  await p.shotEl(out('l02-types.png'), '#typesSort', 6);
  await imu(p, M, true);
  console.log('Лестница частот');
  check(await p.eval('document.querySelector("#ladderReveal").hidden'), 'лестница скрыта до проверки');
  const l = await sortCards(p, M, '#ladderSort', 'Ladder', 'wrong', 1); check(/^9 из 10/.test(l), 'шкала частот с одной ошибкой: ' + l.slice(0, 60));
  check(!(await p.eval('document.querySelector("#ladderReveal").hidden')), 'после проверки открылась настоящая лестница');
  await p.shotEl(out('l02-ladder.png'), '#ladder .ladder-card', 6);
  await act(p, M, true);
  console.log('Начать заново');
  for (const [root, mod, n] of [['#gearGuide', 'GearLab', 5], ['#actGuide', 'ActLab', 6], ['#armGuide', 'ArmLab', 3], ['#imuGuide', 'ImuLab', 4]]) {
    await M.scroll(root); await p.eval(`document.querySelector(${J(root + ' .g-restart')}).click()`); await sleep(150);
    const k = await M.kicker(root), open = await p.eval(`document.querySelectorAll(${J(root + ' .m-steps li.open')}).length`);
    check(k === `Миссия 1 из ${n}` && open === 1, `${mod}: заново — «${k}», открыта одна миссия`);
  }
  check(await p.eval('window.__l02.GearLab.st.lanes[0].N === 6 && window.__l02.GearLab.st.lanes[1].N === 100'), 'редуктор после сброса: снова 6:1 и 100:1');
  check(await p.eval('window.__l02.ArmLab.st.n === 2 && !window.__l02.ArmLab.st.lamp'), 'рука после сброса: два сустава, без лампы');
  console.log('Квиз');
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelector(".q-opt").click())');
  console.log('   ', await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l02-hero.png'), '#top', 0);
  // тёмная тема
  await p.click('#themeBtn'); await sleep(300);
  await p.shotEl(out('l02-body-dark.png'), '#io .wrap', 6);
  await p.shotEl(out('l02-arm-dark.png'), '#dof .lab', 6);
  await p.shotEl(out('l02-gear-dark.png'), '#gear .lab', 6);
  await p.shotEl(out('l02-imu-dark.png'), '#sensors .lab', 6);
  await p.shotEl(out('l02-act-dark.png'), '#model .lab', 6);
  const bad = await p.eval('window.__l02bad || []'); check(bad.length === 0, 'подписи без «не числа»' + (bad.length ? ': ' + bad.slice(0, 3).join(' || ') : ''));
  console.log('логи десктопа:', p.logs.join(' | ') || 'нет');
  await B.close();

  // телефон — в отдельном браузере, чтобы фоновая вкладка не тормозила анимацию
  console.log('Телефон 390 × 844');
  const B2 = await launch({ w: 390, h: 844 });
  const m = await B2.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  await m.eval('document.querySelector(".topbar").style.position = "static"');
  const MM = helpers(m);
  await body(m, MM); await m.shotEl(out('l02-m-body.png'), '#io .body-card', 4); await m.shotEl(out('l02-m-cmp.png'), '#io .cmp-card', 4);
  await arm(m, MM, false); await m.shotEl(out('l02-m-arm.png'), '#dof .lab', 4);
  const RG = '#gearGuide'; await MM.scroll('#gearCv'); await MM.bet(RG, '100 : 1'); await MM.act(RG, 20000); await MM.next(RG); await MM.bet(RG, 'Одинаково'); await MM.act(RG, 20000);
  console.log('    удар на телефоне:', (await MM.out(RG)).slice(0, 90));
  await m.shotEl(out('l02-m-gear.png'), '#gear .lab', 4);
  check(await m.eval('window.__l02.GearLab.G.W') === 360, 'сцена редуктора на телефоне в узкой раскладке');
  await MM.next(RG); const RAm = await m.eval('window.__l02.GearLab.RATIOS');
  await MM.setRange('#gearNA', RAm.indexOf(12)); await MM.act(RG, 20000); check((await MM.crit(RG)) === 'ok,ok', 'телефон: колено 12:1 проходит');
  await MM.next(RG); await MM.scroll('#gearCv');
  await MM.drag(await MM.gearTip(0), await MM.gearTip(0, -1.18), { steps: 10, hold: 1500, until: 'window.__l02.GearLab.st.lanes[0].reached' });
  await MM.drag(await MM.gearTip(1), await MM.gearTip(1, -1.18), { steps: 10, hold: 12000, until: 'window.__l02.GearLab.st.lanes[1].reached' });
  check((await MM.crit(RG)) === 'ok,ok', 'телефон: оба звена дотянуты пальцем до отметки');
  await m.shotEl(out('l02-m-gear-pull.png'), '#gear .lab', 4);
  const RI = '#imuGuide'; await MM.scroll('#imuCv'); await MM.bet(RI, 'Фильтр'); await MM.act(RI, 20000);
  await m.shotEl(out('l02-m-imu.png'), '#sensors .lab', 4);
  const lm = await sortCards(m, MM, '#ladderSort', 'Ladder', 'right', 2); check(/^10 из 10/.test(lm), 'телефон: шкала частот — ' + lm.slice(0, 30));
  await m.shotEl(out('l02-m-ladder.png'), '#ladder .ladder-card', 4);
  const tm = await sortCards(m, MM, '#typesSort', 'TypesSort', 'right', [0, 7]); check(/^8 из 8/.test(tm), 'телефон: приводы — ' + tm.slice(0, 30));
  await m.shotEl(out('l02-m-types.png'), '#typesSort', 4);
  const RA2 = '#actGuide'; await MM.scroll('#actCv'); await MM.bet(RA2, 'Медленная'); await MM.segClick('#actCmdWrap', 'Быстрая'); await MM.act(RA2); await MM.next(RA2); await MM.bet(RA2, 'Примерно вдвое'); await MM.act(RA2, 90000);
  await m.shotEl(out('l02-m-act.png'), '#model .lab', 4);
  const sw = await m.eval('document.documentElement.scrollWidth');
  check(sw === 390, 'телефон: ширина ' + sw + ' из 390');
  const badM = await m.eval('window.__l02bad || []'); check(badM.length === 0, 'телефон: подписи без «не числа»' + (badM.length ? ': ' + badM.slice(0, 3).join(' || ') : ''));
  console.log('логи телефона:', m.logs.join(' | ') || 'нет');
  await B2.close();
  console.log(fails ? `ПРОВАЛЕНО ПРОВЕРОК: ${fails}` : 'Все проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
