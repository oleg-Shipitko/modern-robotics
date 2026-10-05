// Проверка урока 1.7: сначала цифры движка в Node, потом все миссии в браузере —
// ставки, запуски, ползунки, перетаскивание блоков через CDP, «Толкнуть сейчас»,
// свободные режимы, квиз, тёмная тема и телефон 390 px. Снимки — в shots/l17-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const A = require('../lessons/l17/engine.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-7-act.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f2 = (v, d) => (+v).toFixed(d == null ? 2 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры движка в Node ---------- */
function nodeNumbers() {
  console.log('Node: цифры движка');
  // накопление ошибки
  const s10 = A.mcStats(10, 0.97), r3 = A.mcStats(3, 0.97).ratio, r4 = A.mcStats(4, 0.97).ratio;
  check(f2(s10.sdStep) === '1.55' && f2(s10.sdChunk) === '0.42' && r3 > 0.5 && r4 <= 0.5, `МК λ = 0,97: σ пошаговой ${f2(s10.sdStep)} см, k = 10 — ${f2(s10.sdChunk)} см; вдвое меньше с k = 4 (k = 3: ${f2(r3)}, k = 4: ${f2(r4)})`);
  const worse = (k) => { for (let l = 90; l <= 105; l++) if (A.mcStats(k, l / 100).ratio > 1) return l / 100; return null; };
  check(worse(4) === 1.02 && worse(10) === 1.02 && worse(25) === 1.03 && worse(100) === 1.05, `МК: пачка хуже пошаговой с λ = ${worse(4)} (k = 4), ${worse(10)} (k = 10), ${worse(25)} (k = 25), ${worse(100)} (k = 100)`);
  check(f2(A.mcStats(1, 1.0).sdStep) === '16.24' && f2(A.mcStats(1, 0.99).sdStep) === '4.35', `МК: пошаговая при λ = 0,99 — ${f2(A.mcStats(1, 0.99).sdStep)} см, при λ = 1 — ${f2(A.mcStats(1, 1).sdStep)} см`);
  // лаборатория
  const sh = A.labData('short'), lg = A.labData('long');
  check(f2(sh.pauseMean) === '0.31' && f2(lg.pauseMean) === '0.58', `паузы в демонстрациях: короткие ${f2(sh.pauseMean)} с (${Math.min(...sh.D.map((d) => d.pause))}–${Math.max(...sh.D.map((d) => d.pause))} шагов), длинные ${f2(lg.pauseMean)} с (${Math.min(...lg.D.map((d) => d.pause))}–${Math.max(...lg.D.map((d) => d.pause))})`);
  const m1 = [1, 10, 100].map((k) => A.labRun({ k, pauses: 'short' }));
  check(m1[0].stuck && !m1[0].released && m1[1].onShelf && m1[2].onShelf, `М1: k = 1 застряла; k = 10 на полке за ${f2(m1[1].T)} с (у паузы ${f2(m1[1].pauseT)} с); k = 100 за ${f2(m1[2].T)} с (${f2(m1[2].pauseT)} с); рывки ${m1.map((r) => r.jumps).join(' / ')}`);
  const ok2 = []; for (let t = 10; t <= 200; t++) { const a = A.labRun({ k: 10, pauses: 'short', push: { t } }), b = A.labRun({ k: 100, pauses: 'short', push: { t } }); if (a.onShelf && !b.onShelf) ok2.push(t); }
  check(ok2[0] === 100 && ok2[ok2.length - 1] === 180 && ok2.length === 81, `М2: толчок с ${f2(ok2[0] * 0.02, 1)} до ${f2(ok2[ok2.length - 1] * 0.02, 1)} с — k = 100 мимо, k = 10 на полке`);
  const pass3 = (r) => r.passed && r.reactSteps != null && r.reactSteps <= 25 && r.onShelf, w3 = [];
  for (let k = 1; k <= 200; k++) if (pass3(A.labRun({ k, pauses: 'long', push: { x: A.LAB.XPUSH } }))) w3.push(k);
  check(w3[0] === 14 && w3[w3.length - 1] === 25 && w3.length === 12, `М3: окно k от ${w3[0]} до ${w3[w3.length - 1]} (${w3.length} значений подряд)`);
  const w4 = []; for (let e = 1; e <= 100; e++) { const r = A.labRun({ k: 100, exec: e, pauses: 'long', push: { x: A.LAB.XPUSH } }); if (r.passed && r.reactSteps != null && r.reactSteps <= 25) w4.push(e); }
  const e1 = A.labRun({ k: 100, exec: 1, pauses: 'long', push: { x: A.LAB.XPUSH } }), e100 = A.labRun({ k: 100, exec: 100, pauses: 'long', push: { x: A.LAB.XPUSH } });
  check(w4[0] === 14 && w4[w4.length - 1] === 25 && e1.stuck && e100.reactSteps == null, `М4: исполнять от ${w4[0]} до ${w4[w4.length - 1]} из 100; по одному — застряла; все 100 — не успела отреагировать`);
  const free1 = A.labRun({ k: 1, pauses: 'none' });
  check(free1.onShelf, `свободный режим: без пауз k = 1 на полке за ${f2(free1.T)} с`);
  const te = A.labRun({ k: 100, te: true, m: 0.01, pauses: 'short', push: { t: 110 } });
  check(te.onShelf && te.react > 1, `TE в лаборатории (k = 100, m = 0,01): на полке, на путь вернулась через ${f2(te.react)} с, рывков ${te.jumps}`);
  // temporal ensembling
  const w = A.teAt(A.teTape({ m: 0.01 }), 150);
  check(f2(w.oldest * 100) === '1.57' && f2(w.newest * 100) === '0.58', `TE: самое старое ${f2(w.oldest * 100)}%, самое свежее ${f2(w.newest * 100)}% при m = 0,01 и k = 100`);
  const ins = (m, two) => { const tp = A.teTape({ m, two }), r = []; for (let t = 0; t < A.TE.T; t++) if (A.teAt(tp, t).inObs) r.push(t); return r; };
  const i1 = ins(0.01, true);
  check(ins(0.01, false).length === 0 && i1[0] === 138 && i1[i1.length - 1] === 168, `TE: одна стратегия — в препятствие не заходит; две — шаги ${i1[0]}–${i1[i1.length - 1]}`);
  // задержка
  const dl = Object.fromEntries(['sync', 'naive', 'te', 'rtc'].map((m) => [m, A.delayRun({ mode: m, d: 10 })]));
  check(!dl.sync.ok && !dl.naive.ok && !dl.te.ok && dl.rtc.ok && dl.te.hit && f2(dl.sync.pauseT) === '1.40', `200 мс: синхронно паузы ${f2(dl.sync.pauseT)} с; наивно скачок ${f2(dl.naive.jump)}; TE ${dl.te.hit ? 'задел' : 'не задел'}; RTC скачок ${f2(dl.rtc.jump)}, путь ${f2(dl.rtc.T, 1)} с против ${f2(dl.sync.T, 1)} с`);
  const clean = ['sync', 'naive', 'te', 'rtc'].map((m) => A.delayRun({ mode: m, d: 10, obst: false }));
  check(!clean[0].ok && !clean[1].ok && clean[2].ok && clean[3].ok, `без препятствия, 200 мс: проходят ${clean.filter((r) => r.ok).map((r) => r.mode).join(' и ')}`);
  const nv = [0, 1, 2, 3].map((d) => A.delayRun({ mode: 'naive', d }));
  check(nv[0].ok && nv[1].ok && !nv[2].ok && !nv[3].ok, `наивно с препятствием: ${nv.map((r) => r.ms + ' мс ' + (r.ok ? '✓' : '✗') + ' ' + f2(r.jump)).join(', ')}`);
  let rtcAll = true; for (let d = 0; d <= 15; d++) if (!A.delayRun({ mode: 'rtc', d }).ok) rtcAll = false;
  check(rtcAll, 'RTC проходит при любой задержке 0–300 мс');
  // CVAE
  const c10 = A.cvaeRuns({ beta: 10 }), c1 = A.cvaeRuns({ beta: 1 }), c25 = A.cvaeRuns({ beta: 10, nLeft: 25 });
  check(c10.fit.mu === 0 && c10.act === 1 && c10.l1 === 1 && c10.rndLeft === 10, `CVAE β = 10: μ = 0, L1 и z = 0 слева, случайный z — слева ${c10.rndLeft} из 10`);
  check(f2(c1.fit.mu) === '0.39' && f2(c1.fit.s) === '0.92' && c1.act === 1 && c1.rndLeft === 4 && c1.rndRight === 6, `CVAE β = 1: μ = ${f2(c1.fit.mu)}, σ = ${f2(c1.fit.s)}, ошибка стороны ${f2(c1.fit.perr * 100, 0)}%; z = 0 слева; случайный z: ${c1.rndLeft} слева, ${c1.rndRight} справа`);
  check(c25.l1 === 0 && c25.act === 0, '25 на 25: медиана не определена, регрессия и z = 0 — в вазу');
  // песочница
  const good = { cnn: 'resnet', tok: 'flat', joint: 'lin14', ztr: 'cvae', zinf: 'zero', enc: 'enc512', dec: 'dec512', head: 'head14' };
  const e = A.archEval(good, 100, 4);
  check(e.allOk && e.out === '100×14' && e.tokens === 1202 && e.zOk, `архитектура: ${e.j.cat} → ${e.out}`);
  const bad = A.archEval(Object.assign({}, good, { joint: 'lin7', head: 'head7', zinf: 'cvae' }), 100, 4);
  check(!bad.allOk && bad.err.joint && bad.err.zinf && bad.out === '100×7' && bad.tokens === 1202, `архитектура с ошибками: ${Object.entries(bad.err).map(([k, v]) => k + ': ' + v).join('; ')}`);
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
async function done(p, key) { return p.eval(`window.__l17.mis.${key}.ctx.done[window.__l17.mis.${key}.index] === true`); }
async function next(p, root) { await p.eval(`document.querySelector(${sel(root, '.g-next')}).click()`); await sleep(150); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); }
async function go(p, root, key) { await p.eval(`document.querySelector(${sel(root, '.g-go')}).click()`); await sleep(150); await p.waitFor(`!window.__l17.mis.${key}.busy`, 120000); await sleep(100); }
async function setRange(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(60); }
async function setCheck(p, id, v) { await p.eval(`(() => { const e = document.querySelector('#${id}'); e.checked = ${!!v}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60); }
async function seg(p, wrap, attr, v) { await p.eval(`document.querySelector('${wrap} button[data-${attr}="${v}"]').click()`); await sleep(60); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150); }
async function box(p, s) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); }
async function mouseDrag(p, a, b) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10, button: 'left' }); await sleep(12); }
  await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 }); await sleep(120);
}
async function mouseClick(p, pt) { await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await sleep(120); }

async function errLab(p) {
  await center(p, '#errMis');
  check(await p.eval('document.querySelector("#errMis .g-go").disabled') && /Сделай ставку/.test(await p.eval('document.querySelector("#errOut").textContent')), 'ошибка М1: до ставки кнопка заблокирована, гистограммы скрыты');
  await bet(p, '#errMis', 'Уже'); await go(p, '#errMis', 'err');
  check(await done(p, 'err') && await p.eval('document.querySelector("#errMis .bet-right") !== null'), 'ошибка М1: ставка «уже» сыграла — ' + (await outText(p, '#errMis')).slice(0, 110));
  await p.shotEl(out('l17-err.png'), '#errors .lab', 6);
  await next(p, '#errMis');
  check(!(await done(p, 'err')) && +(await p.eval('document.querySelector("#errK").value')) === 0, 'ошибка М2: при входе k = 1, миссия не засчитана сама');
  await setRange(p, 'errK', 2); check(!(await done(p, 'err')), 'ошибка М2: k = 3 ещё не вдвое — ' + (await crit(p, '#errMis')));
  await setRange(p, 'errK', 3);
  check(await done(p, 'err'), 'ошибка М2: k = 4 — ' + (await outText(p, '#errMis')).slice(0, 120));
  await next(p, '#errMis');
  await setRange(p, 'errLam', 102);
  check(await done(p, 'err'), 'ошибка М3: λ = 1,02 — ' + (await outText(p, '#errMis')).slice(0, 120));
  await p.shotEl(out('l17-err-worse.png'), '#errors .lab', 6);
  await next(p, '#errMis');
  check(await p.eval('!document.querySelector("#wrapEk").hidden && !document.querySelector("#wrapElam").hidden'), 'ошибка: свободный режим со всеми ручками');
}

async function chunkLab(p) {
  await p.eval('window.__l17.SPEED.k = 6');
  await center(p, '#chunkMis');
  check(await p.eval('document.querySelector("#wrapK").hidden && document.querySelector("#wrapPushT").hidden && !document.querySelector("#wrapShow").hidden'), 'лаба М1: видны сцена и «показывать пачку», остальное скрыто');
  await bet(p, '#chunkMis', 'k = 10 и k = 100');
  await p.eval(`document.querySelector('#chunkMis .g-go').click()`); await sleep(500);
  await p.shotEl(out('l17-lab-run.png'), '#chunks .lab', 6);
  await p.waitFor('!window.__l17.mis.chunk.busy', 120000); await sleep(100);
  const r1 = await p.eval('window.__l17.mis.chunk.ctx.results[0]');
  check(await done(p, 'chunk') && r1.lanes[0].stuck && r1.lanes[1].onShelf && r1.lanes[2].onShelf, `лаба М1: k = 1 застряла, k = 10 и 100 на полке; ставка ${await p.eval('document.querySelector("#chunkMis .bet-right") ? "отмечена" : "нет"')}`);
  await p.shotEl(out('l17-lab-m1.png'), '#chunks .lab', 6);
  await next(p, '#chunkMis');
  check(await p.eval('!document.querySelector("#wrapPushT").hidden && !document.querySelector("#wrapPushBtn").hidden'), 'лаба М2: появились толчок и «Толкнуть сейчас»');
  await bet(p, '#chunkMis', 'k = 10'); await go(p, '#chunkMis', 'chunk');
  check(!(await done(p, 'chunk')), 'лаба М2, толчок на 1,0 с: ' + (await p.eval('document.querySelector("#chunkMis .g-out").textContent')).slice(0, 100));
  await setRange(p, 'chunkPushT', 19); await go(p, '#chunkMis', 'chunk');
  check(await done(p, 'chunk'), 'лаба М2, толчок на 2,2 с: ' + (await outText(p, '#chunkMis')).slice(0, 160));
  await p.shotEl(out('l17-lab-push.png'), '#chunks .lab', 6);
  console.log('  журнал М2:', await p.eval('document.querySelector("#chunkMis .m-log").textContent'));
  await next(p, '#chunkMis');
  check(await p.eval('!document.querySelector("#wrapK").hidden && document.querySelector("#wrapPushT").hidden'), 'лаба М3: появился ползунок k');
  await go(p, '#chunkMis', 'chunk');
  check(!(await done(p, 'chunk')) && (await crit(p, '#chunkMis')).startsWith('no'), 'лаба М3, k = 10: застряла — ' + (await crit(p, '#chunkMis')));
  await setRange(p, 'chunkK', 40); await go(p, '#chunkMis', 'chunk');
  check(!(await done(p, 'chunk')) && (await crit(p, '#chunkMis')) === 'ok,no,ok', 'лаба М3, k = 40: реакция поздно — ' + (await crit(p, '#chunkMis')));
  await setRange(p, 'chunkK', 20); await go(p, '#chunkMis', 'chunk');
  check(await done(p, 'chunk'), 'лаба М3, k = 20: ' + (await outText(p, '#chunkMis')).slice(0, 120));
  console.log('  журнал М3:', await p.eval('document.querySelector("#chunkMis .m-log").textContent'));
  await next(p, '#chunkMis');
  check(await p.eval('!document.querySelector("#wrapEx").hidden && +document.querySelector("#chunkK").value === 100'), 'лаба М4: k = 100 и ползунок «исполнять»');
  await bet(p, '#chunkMis', 'Около четверти'); await go(p, '#chunkMis', 'chunk');
  check(!(await done(p, 'chunk')), 'лаба М4, исполнять 100: ' + (await crit(p, '#chunkMis')));
  await setRange(p, 'chunkEx', 1); await go(p, '#chunkMis', 'chunk');
  check(!(await done(p, 'chunk')) && (await crit(p, '#chunkMis')).startsWith('ok,no'), 'лаба М4, исполнять 1: застряла — ' + (await crit(p, '#chunkMis')));
  await setRange(p, 'chunkEx', 25); await go(p, '#chunkMis', 'chunk');
  check(await done(p, 'chunk') && await p.eval('document.querySelector("#chunkMis .bet-right") !== null'), 'лаба М4, исполнять 25: ' + (await outText(p, '#chunkMis')).slice(0, 110));
  await p.shotEl(out('l17-lab-part.png'), '#chunks .lab', 6);
  await next(p, '#chunkMis');
  // свободный режим: без пауз k = 1 проходит; «Толкнуть сейчас» во время движения
  await seg(p, '#wrapPauses', 'p', 'none'); await setRange(p, 'chunkK', 1); await setRange(p, 'chunkPushT', 0);
  await go(p, '#chunkMis', 'chunk');
  const fr = await p.eval('window.__l17.mis.chunk.ctx.results[4]');
  check(fr.lanes.length === 4 && fr.lanes[0].onShelf && fr.lanes[1].onShelf, `свободный режим без пауз: твоя k = 1 ${fr.lanes[0].onShelf ? 'на полке' : 'нет'}, сравнительная k = 1 ${fr.lanes[1].onShelf ? 'на полке' : 'нет'}`);
  await seg(p, '#wrapPauses', 'p', 'short'); await setRange(p, 'chunkK', 100); await setRange(p, 'chunkEx', 100); await setCheck(p, 'chunkTe', true);
  await p.eval('window.__l17.SPEED.k = 1.5');
  await p.eval(`document.querySelector('#chunkMis .g-go').click()`); await sleep(1100);
  const en = await p.eval('!document.querySelector("#chunkPushBtn").disabled');
  await p.click('#chunkPushBtn'); await sleep(300);
  await p.shotEl(out('l17-lab-free.png'), '#chunks .lab', 6);
  await p.waitFor('!window.__l17.mis.chunk.busy', 120000); await sleep(100);
  const fp = await p.eval('window.__l17.mis.chunk.ctx.results[4]');
  check(en && fp.push != null && fp.push > 0.5 && fp.lanes.every((l) => l.pushT != null || l.stuck), `«Толкнуть сейчас»: толчок на ${f2(fp.push, 2)} с, твоя рука с TE ${fp.lanes[0].onShelf ? 'на полке' : 'мимо'}, вернулась через ${fp.lanes[0].react == null ? '—' : f2(fp.lanes[0].react)} с`);
  await setCheck(p, 'chunkTe', false);
  await p.eval('window.__l17.SPEED.k = 1');
}

async function archLab(p) {
  await center(p, '#archMis');
  const tap = async (id, slot) => { await p.eval(`document.querySelector('#archPal [data-id=${id}]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))`); await p.eval(`document.querySelector('#archPal [data-id=${id}]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 }))`); await sleep(60); await p.eval(`document.querySelector('#archFlow [data-slot=${slot}]').click()`); await sleep(80); };
  // ошибки: неправильные блоки подсвечиваются
  await tap('lin7', 'joint');
  check(/ждёт 7, приходит 14/.test(await p.eval('document.querySelector("#archFlow [data-slot=joint]").textContent')), 'архитектура: 7 → 512 на суставах — «ждёт 7, приходит 14»');
  await tap('cvae', 'zinf');
  check(/на выводе нет действий/.test(await p.eval('document.querySelector("#archFlow [data-slot=zinf]").textContent')), 'архитектура: энкодер CVAE на выводе — ошибка');
  // правильная сборка: часть мышью (перетаскивание), часть нажатиями
  await center(p, '#archFlow');
  const drag = async (id, slot) => { await p.eval(`document.querySelector('#archFlow [data-slot=${slot}]').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(120); const a = await box(p, `#archPal [data-id=${id}]`), b = await box(p, `#archFlow [data-slot=${slot}]`); await mouseDrag(p, a, b); };
  await drag('resnet', 'cnn'); await drag('flat', 'tok');
  check(await p.eval('window.__l17.ArchLab.st.placed.cnn === "resnet" && window.__l17.ArchLab.st.placed.tok === "flat"'), 'архитектура: блоки перетащены мышью');
  await tap('lin14', 'joint'); await tap('zero', 'zinf'); await tap('cvae', 'ztr'); await tap('enc512', 'enc'); await tap('dec512', 'dec'); await tap('head14', 'head');
  check(!(await done(p, 'arch')) && (await crit(p, '#archMis')) === 'ok,no,ok', 'архитектура: всё сошлось, но k = 50 — ' + (await crit(p, '#archMis')));
  await p.eval(`[...document.querySelectorAll('#archFlow .af-k button')].find((b) => b.textContent === '100').click()`); await sleep(100);
  check(await done(p, 'arch'), 'архитектура: k = 100 — ' + (await outText(p, '#archMis')).slice(0, 120));
  await p.shotEl(out('l17-arch.png'), '#arch .lab', 6);
  await next(p, '#archMis');
  await p.eval(`[...document.querySelectorAll('#archFlow .af-src .seg button')].find((b) => b.textContent === '1').click()`); await sleep(100);
  check(/302×512/.test(await p.eval('document.querySelector("#archFlow").textContent')), 'архитектура, свободный режим: одна камера → 302 токена');
}

async function cvaeLab(p) {
  await p.eval('window.__l17.SPEED.k = 4');
  await center(p, '#cvMis');
  await bet(p, '#cvMis', 'А'); await go(p, '#cvMis', 'cvae');
  const r = await p.eval('window.__l17.mis.cvae.ctx.results[0]');
  check(await done(p, 'cvae') && r.act === 1 && r.rndLeft === 10 && await p.eval('document.querySelector("#cvMis .bet-wrong") !== null'), `CVAE М1 «спор»: z = 0 слева, случайный z ${r.rndLeft} из 10 слева; выбор «А» отмечен ✗`);
  check(await p.eval('document.querySelector("#cvDispute [data-x=b]").classList.contains("win") && document.querySelector("#cvDispute [data-x=a]").classList.contains("lose") && document.querySelector("#cvDispute [data-x=a]").classList.contains("mine")'), 'CVAE: вердикт — Б подтверждено, А опровергнуто, «твой выбор» на А');
  await p.shotEl(out('l17-cvae.png'), '#cvae .lab', 6);
  await next(p, '#cvMis');
  await go(p, '#cvMis', 'cvae'); check(!(await done(p, 'cvae')), 'CVAE М2 при β = 10: ' + (await crit(p, '#cvMis')));
  await seg(p, '#wrapBeta', 'b', '1'); await go(p, '#cvMis', 'cvae');
  check(await done(p, 'cvae'), 'CVAE М2 при β = 1: ' + (await outText(p, '#cvMis')).slice(0, 120));
  await p.shotEl(out('l17-cvae-beta1.png'), '#cvae .lab', 6);
  await next(p, '#cvMis');
  await setRange(p, 'cvLeft', 25); await go(p, '#cvMis', 'cvae');
  check(/в вазу/.test(await p.eval('document.querySelector("#cvL1Out").textContent')), 'CVAE, свободный режим: 25 на 25 — регрессия в вазу');
  await p.eval('window.__l17.SPEED.k = 1');
}

async function teLab(p) {
  await center(p, '#teMis');
  check(/Наведи/.test(await p.eval('document.querySelector("#teOut").textContent')), 'TE М1: веса числами не подсказываем');
  // ведём мышью по гистограмме: сначала к самому свежему, потом к самому старому
  const rr = await p.eval('(() => { const r = document.querySelector("#teW").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()');
  const at = (fx, fy) => ({ x: rr.l + fx * rr.w, y: rr.t + fy * rr.h });
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at(0.97, 0.5).x, y: at(0.97, 0.5).y }); await sleep(100);
  check(!(await done(p, 'te')), 'TE М1: самый свежий столбик — не самый тяжёлый');
  const l0 = Math.max(46, 12 + 32 * 760 / rr.w); // поле слева, как в уроке
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rr.l + ((l0 + 2) / 760) * rr.w, y: at(0, 0.5).y }); await sleep(100);
  check(await done(p, 'te'), 'TE М1: самое старое — ' + (await outText(p, '#teMis')).slice(0, 120));
  await p.shotEl(out('l17-te.png'), '#te .lab', 6);
  await next(p, '#teMis');
  await setRange(p, 'teM', 0); check(!(await done(p, 'te')), 'TE М2: m = 0 — веса равны, ещё нет');
  await setRange(p, 'teM', -1);
  check(await done(p, 'te'), 'TE М2: m = −0,005 — ' + (await outText(p, '#teMis')).slice(0, 110));
  await next(p, '#teMis');
  check(await p.eval('+document.querySelector("#teM").value === 2'), 'TE М3: m вернулся к 0,01');
  await setCheck(p, 'teTwo', true); await setRange(p, 'teT', 120);
  check(!(await done(p, 'te')), 'TE М3: шаг 120 — ещё не в препятствии');
  await setRange(p, 'teT', 155);
  check(await done(p, 'te'), 'TE М3: шаг 155 — ' + (await outText(p, '#teMis')).slice(0, 120));
  await p.shotEl(out('l17-te-two.png'), '#te .lab', 6);
  await next(p, '#teMis');
}

async function drawPred(p, pts) {
  // рисуем прогноз скорости мышью по точкам (t, v), как ученик
  const g = await p.eval('(() => { const g = window.__l17.DelayLab.geo(), r = document.querySelector("#dlPlot").getBoundingClientRect(); return { L0: g.L0, R0: g.R0, top: g.top, bot: g.bot, TM: g.TM, W: 760, l: r.left, t: r.top, w: r.width }; })()');
  const sc = g.w / g.W, at = ([t, v]) => ({ x: g.l + (g.L0 + t / g.TM * (g.R0 - g.L0)) * sc, y: g.t + (g.bot - v / 0.5 * (g.bot - g.top)) * sc });
  const a = at(pts[0]);
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (const q of pts.slice(1)) { const b = at(q); await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left' }); await sleep(8); }
  const e = at(pts[pts.length - 1]); await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: e.x, y: e.y, button: 'left', clickCount: 1 }); await sleep(100);
}
async function delayLab(p) {
  await p.eval('window.__l17.SPEED.k = 6');
  await center(p, '#dlMis');
  check(await p.eval('!document.querySelector("#wrapErase").hidden && document.querySelector("#wrapMode").hidden'), 'задержка М1 «прогноз»: видна только кнопка «Стереть прогноз»');
  await go(p, '#dlMis', 'delay');
  check(!(await done(p, 'delay')) && /нарисуй прогноз/i.test(await p.eval('document.querySelector("#dlMis .g-out").textContent')), 'задержка М1: без прогноза миссия не засчитана');
  await center(p, '#dlPlot');
  // прогноз «едет ровно» — частая ошибка: без провалов
  const flat = []; for (let t = 0.05; t <= 6; t += 0.1) flat.push([t, 0.25]);
  await drawPred(p, flat);
  const nb = await p.eval('window.__l17.DelayLab.api.state().predBins');
  check(nb >= 55, `задержка М1: прогноз нарисован мышью, отрезков ${nb}`);
  await center(p, '#dlMis'); await go(p, '#dlMis', 'delay');
  const d1 = await p.eval('window.__l17.mis.delay.ctx.results[0]');
  check(await done(p, 'delay') && d1.match > 0 && d1.match < 100 && !d1.dips, `задержка М1: ровный прогноз совпал на ${d1.match}%, провалов не было — ${(await outText(p, '#dlMis')).slice(0, 90)}`);
  await p.shotEl(out('l17-delay-pred.png'), '#delay .lab', 6);
  // второй прогноз с провалами: стоянки по 0,2 с каждые 0,7 с
  await p.eval('window.__l17.DelayLab.api.erase()');
  const dip = []; for (let t = 0.05; t <= 6; t += 0.05) { const ph = (t - 0.2) % 0.7; dip.push([t, t < 0.2 || ph > 0.5 ? 0 : 0.25]); }
  await center(p, '#dlPlot'); await drawPred(p, dip); await center(p, '#dlMis'); await go(p, '#dlMis', 'delay');
  const d2 = await p.eval('window.__l17.mis.delay.ctx.results[0]');
  check(d2.match > d1.match && d2.dips, `задержка М1: прогноз со стоянками совпал на ${d2.match}% (лучше ровного ${d1.match}%), провалы угаданы`);
  console.log('  журнал задержки М1:', await p.eval('document.querySelector("#dlMis .m-log").textContent'));
  await next(p, '#dlMis');
  check(await p.eval('document.querySelector("#wrapDelay").hidden && !document.querySelector("#wrapMode").hidden && !window.__l17.DelayLab.st.drawOn'), 'задержка М2: виден только переключатель режима, рисование выключено');
  await bet(p, '#dlMis', 'RTC');
  for (const m of ['sync', 'naive', 'te']) { await seg(p, '#wrapMode', 'm', m); await go(p, '#dlMis', 'delay'); check(!(await done(p, 'delay')), `задержка М2, ${m}: ${await crit(p, '#dlMis')} — ${(await p.eval('document.querySelector("#dlMis .g-out").textContent')).slice(0, 80)}`); if (m === 'sync') await p.shotEl(out('l17-delay-sync.png'), '#delay .lab', 6); }
  await p.shotEl(out('l17-delay-te.png'), '#delay .lab', 6);
  await seg(p, '#wrapMode', 'm', 'rtc'); await go(p, '#dlMis', 'delay');
  check(await done(p, 'delay'), 'задержка М2, RTC: ' + (await outText(p, '#dlMis')).slice(0, 140));
  await p.shotEl(out('l17-delay.png'), '#delay .lab', 6);
  console.log('  журнал задержки М2:', await p.eval('document.querySelector("#dlMis .m-log").textContent'));
  await next(p, '#dlMis');
  await setCheck(p, 'dlObst', false); await seg(p, '#wrapMode', 'm', 'naive'); await go(p, '#dlMis', 'delay');
  check(!(await done(p, 'delay')), 'задержка М3, наивно без препятствия: ' + (await crit(p, '#dlMis')));
  await seg(p, '#wrapMode', 'm', 'te'); await go(p, '#dlMis', 'delay');
  check(await done(p, 'delay'), 'задержка М3, TE без препятствия: ' + (await outText(p, '#dlMis')).slice(0, 110));
  await next(p, '#dlMis');
  check(await p.eval('document.querySelector("#dlObst").checked && +document.querySelector("#dlDelay").value === 0'), 'задержка М4: препятствие вернулось, задержка 0');
  for (const d of [0, 1, 2]) { await setRange(p, 'dlDelay', d); await go(p, '#dlMis', 'delay'); }
  check(await done(p, 'delay'), 'задержка М4: порог — ' + (await outText(p, '#dlMis')).slice(0, 90));
  await next(p, '#dlMis');
  await p.eval('window.__l17.SPEED.k = 1');
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" && !document.querySelector(".g-card")'), 'старая пошаговая карточка не используется');
  check(await p.eval('document.querySelectorAll("#alohaBars .rb").length === 6 && document.querySelectorAll(".vid").length === 2'), 'ALOHA: 6 результатов и 2 обложки видео');
  await p.shotEl(out('l17-aloha.png'), '#aloha .wrap', 6);
  await p.shot(out('l17-hero.png'));
  await errLab(p); await chunkLab(p); await archLab(p); await cvaeLab(p); await teLab(p); await delayLab(p);
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelectorAll(".q-opt")[1].click())');
  console.log('  квиз:', await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l17-quiz.png'), '#quiz .prose', 6);
  await p.shotEl(out('l17-systems.png'), '#systems .wrap', 6);
  await p.shotEl(out('l17-finale.png'), '#finale .prose', 6);
  // тёмная тема
  await p.click('#themeBtn'); await sleep(400);
  for (const [n, s] of [['err', '#errors .lab'], ['lab', '#chunks .lab'], ['arch', '#arch .lab'], ['cvae', '#cvae .lab'], ['te', '#te .lab'], ['delay', '#delay .lab'], ['aloha', '#aloha .wrap']]) await p.shotEl(out(`l17-${n}-dark.png`), s, 6);
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.eval('window.__l17.SPEED.k = 6');
  await m.shot(out('l17-m-hero.png'));
  await center(m, '#errMis'); await bet(m, '#errMis', 'Уже'); await go(m, '#errMis', 'err');
  check(await done(m, 'err'), 'телефон: накопление ошибки М1');
  await m.shotEl(out('l17-m-err.png'), '#errors .lab', 4);
  await center(m, '#chunkMis'); await bet(m, '#chunkMis', 'k = 10 и'); await go(m, '#chunkMis', 'chunk');
  check(await done(m, 'chunk'), 'телефон: лаба М1, три дорожки');
  await m.shotEl(out('l17-m-lab.png'), '#chunks .lab', 4);
  const laneH = await m.eval('(() => { const r = document.querySelector("#chunkCv").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()');
  check(laneH[1] / 3 >= 50, `телефон: сцена лабы ${laneH[0]}×${laneH[1]} px, дорожка ${Math.round(laneH[1] / 3)} px`);
  await m.shotEl(out('l17-m-arch.png'), '#arch .lab', 4);
  await center(m, '#cvMis'); await bet(m, '#cvMis', 'Б'); await go(m, '#cvMis', 'cvae');
  check(await done(m, 'cvae'), 'телефон: CVAE М1');
  await m.shotEl(out('l17-m-cvae.png'), '#cvae .lab', 4);
  await m.shotEl(out('l17-m-te.png'), '#te .lab', 4);
  await center(m, '#dlPlot');
  const dip = []; for (let t = 0.05; t <= 5; t += 0.05) { const ph = (t - 0.2) % 0.7; dip.push([t, t < 0.2 || ph > 0.5 ? 0 : 0.25]); }
  await drawPred(m, dip);
  check(await m.eval('window.__l17.DelayLab.api.state().predBins') >= 40, 'телефон: прогноз скорости нарисован');
  await center(m, '#dlMis'); await go(m, '#dlMis', 'delay');
  check(await done(m, 'delay'), 'телефон: задержка М1, прогноз совпал на ' + (await m.eval('window.__l17.mis.delay.ctx.results[0].match')) + '%');
  await m.shotEl(out('l17-m-delay.png'), '#delay .lab', 4);
  await m.shotEl(out('l17-m-systems.png'), '#systems .wrap', 4);
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
