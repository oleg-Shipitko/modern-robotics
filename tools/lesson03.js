// Проверка урока 0.3: сначала цифры движков в Node, потом все миссии в браузере —
// ползунки, перетаскивание через CDP, ставки, запуски, свободный режим; схема,
// задача на частоты, квиз, тёмная тема и телефон 390 px. Снимки — в shots/l03-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const Arm = require('../lessons/shared/arm-core.js');
const Mpc = require('../lessons/shared/mpc-core.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/0-3-kinematika-i-upravlenie.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f1 = (v, d) => (+v).toFixed(d == null ? 1 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры движков в Node ---------- */
function nodeNumbers() {
  console.log('Node: цифры движков');
  const T = 4, pd = (o) => { const r = Arm.simulate(Object.assign({ mode: 'pd', comp: false }, o), T), fr = r.frames, e = (f) => f.err * 100; const l05 = fr.filter((f) => f.t >= 3.5 - 1e-9).map(e), l1 = fr.filter((f) => f.t >= 3 - 1e-9).map(e), a1 = fr.filter((f) => f.t >= 1).map(e); const fin = e(r.final); let settle = 0; for (const f of fr) if (Math.abs(e(f) - fin) > 1) settle = f.t; return { sag: Math.max(...l05), swing: Math.max(...l1) - Math.min(...l1), settle, lo: Math.min(...a1), hi: Math.max(...a1) }; };
  const a = pd({ Kp: 60, Kd: 0 }); check(Math.round(a.lo) === 5 && Math.round(a.hi) === 131, `ПД без демпфера: размах ${f1(a.lo, 0)}–${f1(a.hi, 0)} см`);
  const b = pd({ Kp: 60, Kd: 8 }), c = pd({ Kp: 120, Kd: 8 }), d = pd({ Kp: 60, Kd: 8, comp: true });
  check(f1(b.sag) === '12.6' && f1(c.sag) === '6.1' && d.sag < 0.05, `провис: Kp 60 → ${f1(b.sag)} см, Kp 120 → ${f1(c.sag)} см, с компенсацией → ${f1(d.sag, 2)} см`);
  let m2 = []; for (let kd = 0; kd <= 20; kd += 0.5) { const s = pd({ Kp: 60, Kd: kd }); if (s.swing < 1 && s.settle < 2) m2.push(kd); }
  check(m2[0] === 3.5 && m2[m2.length - 1] === 20, `М2 регулятора (Kp 60): проходят Kd от ${m2[0]} до ${m2[m2.length - 1]}`);
  const m3 = []; for (let kp = 10; kp <= 240; kp += 10) for (let kd = 0; kd <= 20; kd += 0.5) { const s = pd({ Kp: kp, Kd: kd }); if (s.sag < 4 && s.settle < 2) m3.push([kp, kd]); }
  const kpMin = Math.min(...m3.map((x) => x[0])), kdAt = Math.min(...m3.filter((x) => x[0] === kpMin).map((x) => x[1]));
  check(kpMin === 190 && m3.every(([kp, kd]) => kd >= 3.5), `М3 регулятора: провис < 4 см с Kp ≥ ${kpMin} (при Kp ${kpMin} — Kd ≥ ${kdAt}); всего ${m3.length} пар`);
  const m4 = []; for (let kp = 10; kp <= 80; kp += 10) for (let kd = 0; kd <= 20; kd += 0.5) { if (pd({ Kp: kp, Kd: kd, comp: true }).sag < 0.5) m4.push([kp, kd]); }
  check(m4.some(([kp, kd]) => kp === 60 && kd === 8), `М4 регулятора: с компенсацией и Kp ≤ 80 провис < 0,5 см даёт ${m4.length} пар, в том числе Kp 60, Kd 8`);
  const imp = (o) => { const r = Arm.simulate(o, 3), xs = r.frames.filter((f) => f.t >= 2.5 - 1e-9).map((f) => f.F); return { peak: r.peak, rest: xs.reduce((s, v) => s + v, 0) / xs.length }; };
  const P4 = imp({ mode: 'pos', errH: 0.04 }), I4 = imp({ mode: 'imp', Kimp: 400, errH: 0.04 });
  check(Math.round(P4.peak) === 299 && Math.round(I4.peak) === 76 && Math.round(P4.rest) === 37 && Math.round(I4.rest) === 23, `удар ${f1(P4.peak, 0)} против ${f1(I4.peak, 0)} Н, в покое ${f1(P4.rest, 1)} против ${f1(I4.rest, 1)} Н`);
  const kOk = []; for (let K = 100; K <= 1500; K += 50) { const r = imp({ mode: 'imp', Kimp: K, errH: 0.04 }).rest; if (r >= 10 && r <= 20) kOk.push(K); }
  check(kOk.join(',') === '200,250,300,350', `импеданс, прижим 10–20 Н при ошибке 4 см: K = ${kOk.join(', ')} Н/м`);
  const kBr = []; for (let K = 100; K <= 1500; K += 50) if (imp({ mode: 'imp', Kimp: K, errH: 0.06 }).peak > 150) kBr.push(K);
  check(kBr[0] === 1050, `импеданс, удар > 150 Н при ошибке 6 см: K ≥ ${kBr[0]} Н/м (позиционная — ${f1(imp({ mode: 'pos', errH: 0.06 }).peak, 0)} Н)`);
  const r6 = Mpc.run(6, { seed: 11 }), r30 = Mpc.run(30, { seed: 11 });
  check(!r6.reached && Math.round(r6.dist * 100) === 65 && r30.reached && f1(r30.t) === '4.2', `MPC: 0,6 с застревает (${f1(r6.dist * 100, 0)} см за 14 с), 3 с доезжает за ${f1(r30.t)} с`);
  let hMin = null; for (let H = 2; H <= 50; H++) if (Mpc.run(H, { seed: 11 }).reached) { hMin = H; break; }
  let mono = true; for (let H = hMin; H <= 50; H++) if (!Mpc.run(H, { seed: 11 }).reached) mono = false;
  check(hMin === 21 && mono, `MPC, зерно 11: минимальный горизонт ${f1(hMin / 10)} с, дальше доезжает при любом`);
  let n10 = 0; for (let s = 1; s <= 10; s++) if (Mpc.run(30, { seed: s }).reached) n10++;
  const mins = []; for (let s = 1; s <= 20; s++) { for (let H = 15; H <= 30; H++) if (Mpc.run(H, { seed: s }).reached) { mins.push(H); break; } }
  check(n10 === 10 && Math.min(...mins) === 20 && Math.max(...mins) === 23, `MPC: горизонт 3 с — ${n10} из 10 зёрен; порог по зёрнам 1–20 — от ${f1(Math.min(...mins) / 10)} до ${f1(Math.max(...mins) / 10)} с`);
  const tall = Mpc.trap(Object.assign({}, Mpc.TRAP, { y0: -0.5, y1: 0.5 }));
  check(Mpc.reachable(tall) && !Mpc.run(30, { seed: 11, walls: tall }).reached, 'MPC: ловушка высотой 1 м ломает горизонт 3 с, путь остаётся');
  check(JSON.stringify(Mpc.trap(Mpc.TRAP)) === JSON.stringify(Mpc.WALLS), 'MPC: trap(TRAP) совпадает со старыми стенами');
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l03.mis.${key}.ctx.done[window.__l03.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(120); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) {
  await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`);
  await sleep(150); await p.waitFor(`!window.__l03.mis.${key}.busy`, 120000); await sleep(80);
}
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(40); }
async function setCheck(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.checked = ${!!v}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(40); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150); }
/** Точка канваса в логических координатах → координаты окна. */
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(12); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(80);
}
const top = (x, y) => [210 + x * 210, 210 - y * 210];
/** Перетащить точку на виде сверху из (x0, y0) в (x1, y1), метры. */
async function dragTop(p, cv, a, b, steps) {
  const pts = []; steps = steps || 12;
  for (let i = 0; i <= steps; i++) { const [lx, ly] = top(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); pts.push(await cpt(p, cv, 420, lx, ly)); }
  await mouseDrag(p, pts);
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" || !document.querySelector(".g-card")'), 'старая пошаговая карточка не используется');

  // --- углы → поза: три цели ползунками
  await center(p, '#fkMis');
  check((await crit(p, '#fkMis')) === 'no' && await p.eval('document.querySelector("#fkMis").classList.contains("m-live")'), 'ФК: живая миссия, критерий «ещё нет»');
  await setRange(p, 'fkQ1', 80); await setRange(p, 'fkQ1', 100);
  check(await done(p, 'fk'), 'ФК цель 1: θ₁ = 100°, θ₂ = 75° → ' + (await outText(p, '#fkMis')).slice(0, 90));
  await next(p, '#fkMis');
  const L1 = 0.5, L2 = 0.4, sol = (x, y, s) => { const q2 = s * Math.acos((x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2)); return [Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)), q2].map((v) => Math.round(v * 180 / Math.PI)); };
  const qa = sol(0.55, -0.25, 1), qb = sol(0.55, -0.25, -1);
  await setRange(p, 'fkQ2', qa[1]); await setRange(p, 'fkQ1', qa[0]);
  check(await done(p, 'fk'), `ФК цель 2: θ₁ = ${qa[0]}°, θ₂ = ${qa[1]}°`);
  await next(p, '#fkMis');
  check((await crit(p, '#fkMis')) === 'ok,no', 'ФК другой локоть: в цели, но локоть тот же → ok,no');
  await setRange(p, 'fkQ2', qb[1]); await setRange(p, 'fkQ1', qb[0]);
  check(await done(p, 'fk'), `ФК другой локоть: θ₁ = ${qb[0]}°, θ₂ = ${qb[1]}° → ` + (await outText(p, '#fkMis')).slice(0, 150));
  console.log('  журнал ФК:', await p.eval('document.querySelector("#fkLog").textContent'));

  // --- поза → углы: перетаскивание цели
  await center(p, '#ikCv');
  await dragTop(p, '#ikCv', [0.5, 0.35], [0.5 * 0.892 / Math.hypot(0.5, 0.35), 0.35 * 0.892 / Math.hypot(0.5, 0.35)]);
  check(await done(p, 'ik'), 'ОК одно решение (цель прилипла к краю): ' + (await p.eval('document.querySelector("#ikOut").textContent')));
  await next(p, '#ikMis');
  const e1 = [0.5 * 0.9 / Math.hypot(0.5, 0.35), 0.35 * 0.9 / Math.hypot(0.5, 0.35)];
  await dragTop(p, '#ikCv', e1, [-0.3, 0.9]);
  check(await done(p, 'ik'), 'ОК нет решений: ' + (await p.eval('document.querySelector("#ikOut").textContent')));
  await p.shotEl(out('l03-kin.png'), '#kin .duo', 6);
  await p.eval('document.querySelector("#ikMis .g-restart").click()'); await sleep(100);
  check(await p.eval('window.__l03.mis.ik.index === 0 && window.__l03.IK.api.state().n === 2 && !window.__l03.mis.ik.ctx.done[0]'), 'ОК: «Начать заново» вернуло цель и первую миссию');

  // --- якобиан: кривая
  await center(p, '#jacCv');
  await dragTop(p, '#jacCv', [0.45, 0.3], [0.8, 0.55]);
  check(await done(p, 'jac'), 'якобиан: сингулярность — ' + (await p.eval('document.querySelector("#jacOut").textContent')).slice(0, 70));
  await next(p, '#jacMis');
  const pos = await p.eval('(() => { const s = window.__l03.Jac.api.state(); return s.r; })()');
  const ang = Math.atan2(0.55, 0.8);
  await dragTop(p, '#jacCv', [0.9 * Math.cos(ang), 0.9 * Math.sin(ang)], [0.36 * Math.cos(ang), 0.36 * Math.sin(ang)], 20);
  check(await done(p, 'jac'), `якобиан: круглый эллипс — ` + (await p.eval('document.querySelector("#jacOut").textContent')).slice(0, 70));
  await next(p, '#jacMis');
  await dragTop(p, '#jacCv', [0.36 * Math.cos(ang), 0.36 * Math.sin(ang)], [0.1 * Math.cos(ang), 0.1 * Math.sin(ang)], 10);
  await dragTop(p, '#jacCv', [0.1 * Math.cos(ang), 0.1 * Math.sin(ang)], [0.9 * Math.cos(ang), 0.9 * Math.sin(ang)], 60);
  check(await done(p, 'jac'), 'якобиан: вся кривая — ' + (await outText(p, '#jacMis')).slice(0, 90));
  await p.shotEl(out('l03-jac.png'), '#jac .lab', 6);

  // --- лаборатория 1: две сети
  await center(p, '#netMis');
  check(await p.eval('document.querySelector("#netMis .g-go").disabled'), 'сеть: кнопка заблокирована до ставки');
  await bet(p, '#netMis', 'А'); await go(p, '#netMis', 'net');
  const n1 = await p.eval('window.__l03.mis.net.ctx.results[0]');
  check(n1.missA > 0.15 && n1.missA < 0.2 && n1.missB < 0.02 && f1(n1.meanA * 100) === '23.5' && f1(n1.meanB * 100) === '2.0', `сеть М1: в цели (0,62; 0,38) А ${f1(n1.missA * 100)} см, Б ${f1(n1.missB * 100)} см; средний промах ${f1(n1.meanA * 100)} и ${f1(n1.meanB * 100)} см; ошибка обучения ${f1(n1.lossA, 3)} и ${f1(n1.lossB, 3)}`);
  check(await p.eval('document.querySelector("#netMis .m-bet .bet-wrong") !== null'), 'сеть: ставка «А» отмечена ✗');
  await p.shotEl(out('l03-net-train.png'), '#netlab .lab', 6);
  await next(p, '#netMis');
  await center(p, '#netCvA');
  await dragTop(p, '#netCvA', [0.62, 0.38], [0.5, 0.31]);
  const n2 = await p.eval('window.__l03.NetLab.api.state()');
  check(await done(p, 'net'), `сеть М2 «сломай»: промах А ${f1(n2.missA * 100)} см, Б ${f1(n2.missB * 100)} см в ${f1(n2.r, 2)} м от плеча`);
  await next(p, '#netMis');
  await dragTop(p, '#netCvB', [0.5, 0.31], [0.05, 0.03]);
  const n3 = await p.eval('window.__l03.NetLab.api.state()');
  check(await done(p, 'net'), `сеть М3 «где А точна»: промах А ${f1(n3.missA * 100)} см в ${f1(n3.r, 2)} м от плеча`);
  await next(p, '#netMis');
  await center(p, '#netMis');
  await bet(p, '#netMis', 'В кольце'); await go(p, '#netMis', 'net');
  check(await done(p, 'net') && await p.eval('window.__l03.NetLab.st.showHeat && document.querySelector("#wrapHeat").hidden'), 'сеть М4: карта промахов показана — ' + (await outText(p, '#netMis')).slice(0, 80));
  await next(p, '#netMis');
  check(await p.eval('!document.querySelector("#wrapHeat").hidden'), 'сеть, свободный режим: появился переключатель карты');
  await dragTop(p, '#netCvA', [0.05, 0.03], [0.4, 0.42]);
  await p.shotEl(out('l03-net.png'), '#netlab .lab', 6);

  // --- лаборатория 2: регулятор
  await p.eval('window.__l03.SPEED.k = 4');
  await center(p, '#pdMis');
  check(await p.eval('document.querySelector("#wrapKd").hidden && document.querySelector("#wrapComp").hidden && !document.querySelector("#wrapKp").hidden'), 'ПД М1: видна только Kp');
  await bet(p, '#pdMis', 'Будет раскачиваться'); await go(p, '#pdMis', 'pd');
  check(!(await done(p, 'pd')) && /от 5 до 131 см/.test(await outText(p, '#pdMis')), 'ПД М1, первый запуск: ' + (await outText(p, '#pdMis')).slice(0, 80));
  await setRange(p, 'pdKp', 120); await go(p, '#pdMis', 'pd');
  check(await done(p, 'pd'), 'ПД М1 после второго Kp: ' + (await outText(p, '#pdMis')).slice(0, 120));
  await next(p, '#pdMis');
  check(await p.eval('!document.querySelector("#wrapKd").hidden'), 'ПД М2: появился Kd');
  await setRange(p, 'pdKp', 60); await setRange(p, 'pdKd', 2); await go(p, '#pdMis', 'pd');
  check(!(await done(p, 'pd')) && (await crit(p, '#pdMis')) === 'no,no', 'ПД М2, Kd 2 → не прошло: ' + (await crit(p, '#pdMis')));
  await setRange(p, 'pdKd', 8); await go(p, '#pdMis', 'pd');
  check(await done(p, 'pd') && /12,6 см/.test(await outText(p, '#pdMis')), 'ПД М2, Kd 8: ' + (await outText(p, '#pdMis')).slice(0, 110));
  await p.shotEl(out('l03-pd-sag.png'), '#pd .lab', 6);
  await next(p, '#pdMis');
  await setRange(p, 'pdKp', 200); await setRange(p, 'pdKd', 3); await go(p, '#pdMis', 'pd');
  check(!(await done(p, 'pd')), 'ПД М3, Kp 200 Kd 3: ' + (await crit(p, '#pdMis')) + ' — ' + (await p.eval('document.querySelector("#pdMis .g-out").textContent')).slice(0, 80));
  await setRange(p, 'pdKd', 8); await go(p, '#pdMis', 'pd');
  check(await done(p, 'pd'), 'ПД М3, Kp 200 Kd 8: ' + (await outText(p, '#pdMis')).slice(0, 90));
  await next(p, '#pdMis');
  check(await p.eval('!document.querySelector("#wrapComp").hidden'), 'ПД М4: появилась компенсация');
  await bet(p, '#pdMis', 'Компенсация'); await go(p, '#pdMis', 'pd');
  check(!(await done(p, 'pd')), 'ПД М4 без компенсации, Kp 200: ' + (await crit(p, '#pdMis')));
  await setRange(p, 'pdKp', 60); await setCheck(p, 'pdComp', true); await go(p, '#pdMis', 'pd');
  check(await done(p, 'pd'), 'ПД М4, компенсация и Kp 60: ' + (await outText(p, '#pdMis')).slice(0, 80));
  console.log('  журнал ПД М4:', await p.eval('document.querySelector("#pdMis .m-log").textContent'));
  await next(p, '#pdMis');
  await p.eval('window.__l03.SPEED.k = 1');
  await go(p, '#pdMis', 'pd');
  // тянем схват мышью в свободном режиме
  await center(p, '#pdCv');
  const ee = await p.eval('(() => { const q = window.__l03.PdLab.st.s.q, e = Arm.fk(q); return [200 + e.x * 190, 170 - e.y * 190]; })()');
  const a0 = await cpt(p, '#pdCv', 520, ee[0], ee[1]), a1 = await cpt(p, '#pdCv', 520, ee[0] + 40, ee[1] + 50);
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a0.x, y: a0.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a0.x + (a1.x - a0.x) * i / 10, y: a0.y + (a1.y - a0.y) * i / 10, button: 'left' }); await sleep(30); }
  await sleep(300);
  check(/Тянешь схват/.test(await p.eval('document.querySelector("#pdOut").textContent')), 'ПД свободный режим: схват тянется мышью — ' + (await p.eval('document.querySelector("#pdOut").textContent')).slice(0, 60));
  await p.shotEl(out('l03-pd.png'), '#pd .lab', 6);
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a1.x, y: a1.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  check(await p.eval('window.__l03.PdLab.st.err < 0.01'), 'ПД свободный режим: отпущенный схват вернулся к полке');

  // --- лаборатория 3: импеданс
  await p.eval('window.__l03.SPEED.k = 4');
  await center(p, '#impMis');
  check(await p.eval('document.querySelector("#wrapK").hidden && document.querySelector("#wrapErr").hidden'), 'импеданс М1: ручек нет');
  await bet(p, '#impMis', 'Позиционная'); await go(p, '#impMis', 'imp');
  const i1 = await p.eval('window.__l03.mis.imp.ctx.results[0]');
  check(Math.round(i1.peakP) === 299 && Math.round(i1.peakI) === 76, `импеданс М1: удар ${f1(i1.peakP, 0)} и ${f1(i1.peakI, 0)} Н, в покое ${f1(i1.restP)} и ${f1(i1.restI)} Н`);
  await p.shotEl(out('l03-imp-hit.png'), '#imp .lab', 6);
  await next(p, '#impMis');
  await go(p, '#impMis', 'imp');
  check(!(await done(p, 'imp')), 'импеданс М2, K 400: ' + (await p.eval('document.querySelector("#impMis .g-out").textContent')).slice(0, 60));
  await setRange(p, 'impK', 300); await go(p, '#impMis', 'imp');
  check(await done(p, 'imp'), 'импеданс М2, K 300: ' + (await outText(p, '#impMis')).slice(0, 70));
  await next(p, '#impMis');
  check(await p.eval('!document.querySelector("#wrapErr").hidden'), 'импеданс М3: появилась ошибка камеры');
  await setRange(p, 'impErr', 6); await setRange(p, 'impK', 1000); await go(p, '#impMis', 'imp');
  check(!(await done(p, 'imp')), 'импеданс М3, K 1000: ' + (await crit(p, '#impMis')));
  await setRange(p, 'impK', 1100); await go(p, '#impMis', 'imp');
  check(await done(p, 'imp'), 'импеданс М3, K 1100: ' + (await outText(p, '#impMis')).slice(0, 420));
  await next(p, '#impMis');
  await setRange(p, 'impK', 250); await setRange(p, 'impErr', 4);
  await p.eval('window.__l03.SPEED.k = 1'); await go(p, '#impMis', 'imp');
  await p.shotEl(out('l03-imp.png'), '#imp .lab', 6);

  // --- скользящий горизонт
  await p.eval('window.__l03.SPEED.k = 4');
  await center(p, '#mpcMis');
  await bet(p, '#mpcMis', 'Только Б'); await go(p, '#mpcMis', 'mpc');
  const m1 = await p.eval('window.__l03.mis.mpc.ctx.results[0]');
  check(!m1.A.reached && Math.round(m1.A.dist * 100) === 65 && m1.B.reached && f1(m1.B.t) === '4.2', `MPC М1: А застрял, ${f1(m1.A.dist * 100, 0)} см; Б доехал за ${f1(m1.B.t)} с`);
  await p.shotEl(out('l03-mpc-race.png'), '#mpc .lab', 6);
  await next(p, '#mpcMis');
  for (const Hh of [15, 25, 20, 22, 21]) { await setRange(p, 'mpcH', Hh); await go(p, '#mpcMis', 'mpc'); }
  check(await done(p, 'mpc'), 'MPC М2, порог: ' + (await outText(p, '#mpcMis')).slice(0, 360));
  console.log('  журнал MPC М2:', await p.eval('document.querySelector("#mpcMis .m-log").textContent'));
  await next(p, '#mpcMis');
  // тащим ловушку мышью и проверяем, что путь остаётся
  await center(p, '#mpcCv');
  const t0 = await cpt(p, '#mpcCv', 520, 260 + 0.23 * 260, 182), t1 = await cpt(p, '#mpcCv', 520, 260 + 0.13 * 260, 182 - 0.05 * 260);
  await mouseDrag(p, [t0, { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 }, t1]);
  const tr = await p.eval('window.__l03.MpcLab.st.trap');
  check(Math.abs(tr.x1 - 0.16) < 0.02 && Math.abs(tr.cy - 0.05) < 0.02, `MPC М3: ловушку сдвинули мышью → x1 ${f1(tr.x1, 2)}, центр ${f1(tr.cy, 2)}`);
  await go(p, '#mpcMis', 'mpc');
  check(!(await done(p, 'mpc')), 'MPC М3, только сдвиг: ' + (await p.eval('document.querySelector("#mpcMis .g-out").textContent')).slice(0, 60));
  await setRange(p, 'mpcTH', 100); await go(p, '#mpcMis', 'mpc');
  check(await done(p, 'mpc'), 'MPC М3, высота 1 м: ' + (await outText(p, '#mpcMis')).slice(0, 80));
  await next(p, '#mpcMis');
  await p.eval('window.__l03.SPEED.k = 1'); await go(p, '#mpcMis', 'mpc');
  await p.shotEl(out('l03-mpc.png'), '#mpc .lab', 6);

  // --- схема и задача на частоты
  for (let i = 0; i < 5; i++) await p.eval(`document.querySelectorAll("#stackSeg button")[${i}].click()`);
  await center(p, '#freqSort');
  const box = async (s) => p.eval(`(() => { const r = document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const plan = { s2: 'slow', pchunk: 'slow', rl: 'mid', mpc: 'mid', pact: 'mid', pd: 'fast', s0: 'fast', cur: 'mid' };
  for (const [id, z] of Object.entries(plan)) {
    if (id === 'pd' || id === 'cur') { await p.eval(`(() => { const c = document.querySelector('#freqSort [data-id=${id}]'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 })); c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 })); document.querySelector('#freqSort .c-zone[data-zone=${z}]').click(); })()`); continue; }
    const a = await box(`#freqSort [data-id=${id}]`), b = await box(`#freqSort .c-zone[data-zone=${z}]`);
    await mouseDrag(p, [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b]);
  }
  await p.eval('window.__l03.mis.sort.check()'); await sleep(100);
  const sortTxt = await p.eval('document.querySelector("#freqSort .c-out").textContent');
  check(/^7 из 8/.test(sortTxt), 'частоты: ' + sortTxt.slice(0, 120));
  await p.shotEl(out('l03-stack.png'), '#stack .wrap', 6);
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelector(".q-opt").click())');
  console.log('  квиз:', await p.eval('document.querySelector("#quizScore").textContent'));
  // тёмная тема
  await p.click('#themeBtn'); await sleep(300);
  await p.shotEl(out('l03-pd-dark.png'), '#pd .lab', 6);
  await p.shotEl(out('l03-net-dark.png'), '#netlab .lab', 6);
  await p.shotEl(out('l03-imp-dark.png'), '#imp .lab', 6);
  await p.shotEl(out('l03-mpc-dark.png'), '#mpc .lab', 6);
  await p.shotEl(out('l03-kin-dark.png'), '#kin .duo', 6);
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.eval('window.__l03.SPEED.k = 3');
  // перетаскивание пальцем: цель на правой сцене — к краю рабочей зоны
  await center(m, '#ikCv');
  const tpts = []; for (let i = 0; i <= 10; i++) { const r = Math.hypot(0.5, 0.35), f = 1 + (0.893 / r - 1) * i / 10, [lx, ly] = top(0.5 * f, 0.35 * f); tpts.push(await cpt(m, '#ikCv', 420, lx, ly)); }
  const y0 = await m.eval('scrollY');
  await m.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tpts[0].x, y: tpts[0].y }] });
  for (let i = 1; i < tpts.length; i++) { await m.S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tpts[i].x, y: tpts[i].y }] }); await sleep(15); }
  await m.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150);
  check(await done(m, 'ik') && (await m.eval('scrollY')) === y0, 'телефон: цель тянется пальцем, страница не прокручивается — ' + (await m.eval('document.querySelector("#ikOut").textContent')).slice(0, 40));
  await m.shotEl(out('l03-m-kin.png'), '#kin .duo', 4);
  await center(m, '#netMis');
  await bet(m, '#netMis', 'Б'); await go(m, '#netMis', 'net');
  check(await done(m, 'net'), 'телефон: сеть обучена — ' + (await outText(m, '#netMis')).slice(0, 60));
  await m.shotEl(out('l03-m-net.png'), '#netlab .lab', 4);
  await center(m, '#impMis');
  await bet(m, '#impMis', 'Одинаково'); await go(m, '#impMis', 'imp');
  check(await done(m, 'imp'), 'телефон: импеданс М1');
  await m.eval('window.__l03.mis.imp.goto(1)'); await sleep(100);
  await m.shotEl(out('l03-m-imp.png'), '#imp .lab', 4);
  await center(m, '#mpcMis');
  await bet(m, '#mpcMis', 'Оба'); await go(m, '#mpcMis', 'mpc');
  check(await done(m, 'mpc'), 'телефон: MPC М1');
  await m.shotEl(out('l03-m-mpc.png'), '#mpc .lab', 4);
  await m.shotEl(out('l03-m-pd.png'), '#pd .lab', 4);
  await m.shotEl(out('l03-m-jac.png'), '#jac .lab', 4);
  await m.shotEl(out('l03-m-stack.png'), '#stack .wrap', 4);
  const wdt = await m.eval('document.documentElement.scrollWidth');
  check(wdt <= 390, `телефон: ширина ${wdt} из 390`);
  check(m.logs.length === 0, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
}

(async () => {
  nodeNumbers();
  await desktop();
  await phone();
  console.log(fails ? `ИТОГ: ${fails} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
