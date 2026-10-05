// Проверка урока 1.6: сначала цифры и пороги движка в Node, потом все миссии
// и задачи в браузере — перетаскивание через CDP, ставки, запуски, маска,
// две головы, свободный режим; порядок слов, калькулятор, вывод π0,
// сортировка, квиз, тёмная тема и телефон 390 px. Снимки — в shots/l16-*.png.
const { launch, sleep } = require('./cdp');
const path = require('path');
const T = require('../lessons/l16/engine.js');
const URL0 = 'file://' + path.resolve(__dirname, '../site/lessons/1-6-transformer.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const f = (v, d) => (+v).toFixed(d == null ? 2 : d);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

/* ---------- 1. Цифры и пороги в Node ---------- */
const deg = (a) => a * Math.PI / 180;
const polar = (a, L) => [L * Math.cos(deg(a)), L * Math.sin(deg(a))];
const att = (q, o) => T.attend(Object.assign({ head: 'gen', q, dk: 2, div: false }, o || {}));
function disk(step, fn) { for (let x = -T.QMAX; x <= T.QMAX + 1e-9; x += step) for (let y = -T.QMAX; y <= T.QMAX + 1e-9; y += step) if (Math.hypot(x, y) <= T.QMAX) fn([x, y]); }
const PLAN = {};
function nodeNumbers() {
  console.log('Node: цифры и пороги');
  // пресеты калькулятора
  const n = {}; for (const k of Object.keys(T.Cost.PRESETS)) n[k] = T.Cost.cost(T.Cost.presetCfg(k));
  check(n.rt1.n === 48 && n.act.n === 1202 && n.octo.n === 656 && n.pi0.n === 867, `пресеты: RT-1 ${n.rt1.n}, ACT ${n.act.n}, Octo ${n.octo.n}, π0 ${n.pi0.n} (≈ 870)`);
  check(n.pi0.prefix === 816 && Math.abs(n.pi0.kvBytes / 1e6 - 15.04) < 0.01, `KV-кэш π0: префикс ${n.pi0.prefix} токенов, ${f(n.pi0.kvBytes / 1e6)} МБ, ${f(2 * 18 * 256 * 2 / 1000, 1)} КБ на токен`);
  check(f(n.pi0.share * 100, 1) === '6.6', `доля члена внимания у π0 (оценка): ${f(n.pi0.share * 100, 1)} %; ACT на той же модели — ${f(n.act.share * 100, 1)} %`);
  // задача про четвёртую камеру
  const four = (cut) => T.Cost.cost(Object.assign(T.Cost.presetCfg('pi0'), { images: 4, cut })).n;
  const r4 = { p14: four('p14'), p16: four('p16'), p32: four('p32'), g64: four('g64'), tl8: four('tl8') };
  check(r4.p14 === 1123 && r4.p16 === 883 && r4.p32 === 295 && r4.g64 === 355 && r4.tl8 === 131, `π0 с четырьмя камерами: патч 14 → ${r4.p14}, патч 16 → ${r4.p16} (больше 867), патч 32 → ${r4.p32}, до 64 → ${r4.g64}, до 8 → ${r4.tl8}`);
  check(f((1123 / 867) ** 2, 2) === '1.68', `четвёртая камера без сжатия: член внимания × ${f((1123 / 867) ** 2)}`);
  // вывод π0
  const t0 = T.Pi0.time(), t1 = T.Pi0.time({ noCache: true }), t2 = T.Pi0.time({ remote: true });
  check(t0.total === 73 && t0.firstFlow === 46 && Math.round(t1.total) === 361 && t2.total === 86, `π0: ${t0.total} мс, первый шаг flow на ${t0.firstFlow} мс; без кэша ${f(t1.total, 0)} мс (×${f(t1.total / t0.total, 1)}); вне робота ${t2.total} мс`);
  // токены картинки
  check((224 / 32) ** 2 === 49 && (224 / 16) ** 2 === 196 && (224 / 14) ** 2 === 256, 'патчи 32/16/14 → 49/196/256 токенов; рост ×4 и пар ×16');
  // М1
  const cupA = Math.atan2(T.KEYS.gen[0][1], T.KEYS.gen[0][0]) * 180 / Math.PI;
  let Lmin = null; for (let L = 0; L <= 3.0001; L += 0.01) if (att(polar(cupA, L)).w[0] > T.M.cupW) { Lmin = L; break; }
  const q0 = [-0.7, -0.55], a0 = att(q0);
  check(Lmin !== null && Lmin > 1.1 && Lmin < 1.4 && !T.Check.m1(a0.w) && T.Check.m1(att(polar(cupA, 3)).w), `М1: ключ чашки под ${f(cupA, 1)}°; вес > 0,5 с длины запроса ${f(Lmin)}; при длине 3 — ${f(att(polar(cupA, 3)).w[0])}; в начале вес чашки ${f(a0.w[0])}`);
  let m1 = 0, m2 = 0, tot = 0; const pts2 = [];
  disk(0.05, (q) => { tot++; const r = att(q); if (T.Check.m1(r.w)) m1++; if (T.Check.m2gap(r.out) && T.Check.m2spread(r.w)) { m2++; pts2.push(q); } });
  const c0 = att([0, 0]), nc = T.nearest(c0.out);
  check(m2 / tot > 0.15 && m2 / tot < 0.45 && !T.Check.m2gap(c0.out), `М2: порог 15 см и вес ≤ 0,6 проходят ${f(m2 / tot * 100, 1)} % запросов (М1 — ${f(m1 / tot * 100, 1)} %); при коротком запросе ответ в ${f(nc.d * 100, 1)} см от сахарницы`);
  // устойчивая точка для М2: вокруг неё на ±0,15 тоже проходит
  const ok2 = (q) => { const r = att(q); return T.Check.m2gap(r.out) && T.Check.m2spread(r.w); };
  const robust = pts2.filter((q) => [[0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]].every(([dx, dy]) => ok2([q[0] + dx, q[1] + dy])));
  robust.sort((a, b) => Math.hypot(a[0] - 0.6, a[1] - 1.1) - Math.hypot(b[0] - 0.6, b[1] - 1.1));
  PLAN.m2 = robust[0]; const r2 = att(PLAN.m2), n2 = T.nearest(r2.out);
  check(!!PLAN.m2, `М2: цель перетаскивания (${f(PLAN.m2[0])}; ${f(PLAN.m2[1])}) → ответ в ${f(n2.d * 100, 0)} см от предмета «${T.ITEMS[n2.i].name}», наибольший вес ${f(Math.max(...r2.w))}`);
  // М3
  let minNo = 1, maxDiv = 0, args = new Set(), min64 = 1, maxDiv64 = 0;
  disk(0.05, (q) => {
    const a = att(q, { dk: 256 }), b = att(q, { dk: 256, div: true }), c = att(q, { dk: 64 }), d = att(q, { dk: 64, div: true });
    const ma = Math.max(...a.w); minNo = Math.min(minNo, ma); args.add(a.w.indexOf(ma)); maxDiv = Math.max(maxDiv, Math.max(...b.w));
    min64 = Math.min(min64, Math.max(...c.w)); maxDiv64 = Math.max(maxDiv64, Math.max(...d.w));
  });
  const hid = T.hiddenDot('gen', 256), sd = Math.sqrt(hid.reduce((s, v) => s + v * v, 0) / hid.length);
  check(minNo > 0.95 && maxDiv < 0.9 && args.size === 1, `М3, зерно ${T.SEEDS.gen}: d_k 256 без деления — наибольший вес не меньше ${f(minNo, 3)} при любом запросе, пик всегда у «${T.ITEMS[[...args][0]].name}»; с делением — не больше ${f(maxDiv)}; разброс скрытой части q·k ${f(sd, 1)} (теория √254 = ${f(Math.sqrt(254), 1)})`);
  check(min64 > 0.9 && maxDiv64 < 0.9, `М3: при d_k 64 без деления пик не меньше ${f(min64)}, с делением не больше ${f(maxDiv64)}`);
  // М4
  const M = T.Mask, cr = (m) => M.crit(m).map((x) => (x ? 1 : 0)).join('');
  check(cr(M.full()) === '1100' && cr(M.causal()) === '0011' && cr(M.block()) === '1111', `М4: полная → ${cr(M.full())}, каузальная → ${cr(M.causal())}, блочная → ${cr(M.block())}`);
  const cells = new Set(); [[[4, 5], [0, 1, 2, 3, 4, 5]], [[0, 1, 2], [0, 1, 2]], [[0, 1, 2], [3, 4, 5]], [[3], [0, 1, 2, 3, 4, 5]]].forEach(([rs, cs]) => rs.forEach((i) => cs.forEach((j) => cells.add(i * 6 + j))));
  check(cells.size === 36, `М4: четыре условия задают все ${cells.size} клеток — подходит ровно одна маска, блочная маска π0`);
  // М5
  const hd = (head, q, o) => T.attend(Object.assign({ head, q, dk: 2, div: false }, o || {}));
  let solo = true, both = 0; const qs = []; disk(0.1, (q) => qs.push(q));
  for (const qc of qs) { const wc = hd('color', qc).w; if (!T.Check.m5color(wc)) continue; for (const qp of qs) { const wp = hd('place', qp).w; if (!T.Check.m5place(wp)) continue; both++; if (!T.Check.m5solo(wc, wp)) solo = false; } }
  const minL = (head, ang, div) => { for (let L = 0; L <= 3.0001; L += 0.01) { const w = hd(head, polar(ang, L), { div }).w; if (head === 'color' ? T.Check.m5color(w) : T.Check.m5place(w)) return L; } return null; };
  const Lc = minL('color', 0), Lp = minL('place', 60), Lcd = minL('color', 0, true);
  const oneHead = qs.some((q) => { const w = hd('color', q).w; return w[0] > T.M.soloW && w.every((v, i) => i === 0 || v <= T.M.soloW); }) || qs.some((q) => { const w = hd('place', q).w; return w[0] > T.M.soloW && w.every((v, i) => i === 0 || v <= T.M.soloW); });
  check(solo && both > 0 && Lc && Lp && Lcd && !oneHead, `М5: пары > 0,8 с длины ${f(Lc)} («цвет», к красному) и ${f(Lp)} («место», к краю), с делением на √2 — с ${f(Lcd)}; третий критерий выполняется всегда, когда выполнены два первых (${both} пар запросов); одной головой чашку не выделить: ${!oneHead}`);
  // порядок слов
  const P = T.Pos; let noPE = 0, withPE = 0;
  for (const o of P.perms(['take', 'cup', 'then', 'bowl'])) { if (!P.command(o, false).ok) noPE++; if (!P.command(o, true).ok) withPE++; }
  const A = P.command(['take', 'cup', 'then', 'bowl'], false), Bc = P.command(['take', 'bowl', 'then', 'cup'], false);
  check(noPE === 12 && withPE === 0 && P.sameOut(A.out, Bc.out) && !P.sameOut(P.command(['take', 'cup', 'then', 'bowl'], true).out, P.command(['take', 'bowl', 'then', 'cup'], true).out), `порядок: без позиций ${noPE} отказов из 24, выходы перестановок совпадают; с позициями ошибок ${withPE}`);
  const s01 = P.peSim(0, 1), s03 = P.peSim(0, 3), s0far = P.peSim(0, 23);
  check(s01 > s03 && s03 > s0far, `сходство позиций: 0–1 ${f(s01, 3)}, 0–3 ${f(s03, 3)}, 0–23 ${f(s0far, 3)}`);
}

/* ---------- 2. Браузер ---------- */
const sel = (root, s) => JSON.stringify(root + ' ' + s);
async function crit(p, root) { return p.eval(`[...document.querySelectorAll(${sel(root, '.m-crit li')})].map((l) => l.className).join(',')`); }
async function outText(p, root) { return p.eval(`(() => { const e = document.querySelector(${sel(root, '.g-out')}); return e && !e.hidden ? e.textContent : ''; })()`); }
const ctl = 'window.__l16.mis.att';
async function done(p) { return p.eval(`${ctl}.ctx.done[${ctl}.index] === true`); }
async function next(p) { await p.eval(`document.querySelector('#attMis .g-next').click()`); await sleep(150); }
async function bet(p, root, text) { await p.eval(`[...document.querySelectorAll(${sel(root, '.m-bet .opts button')})].find((b) => b.textContent.startsWith(${JSON.stringify(text)})).click()`); await sleep(60); }
async function go(p) { await p.eval(`document.querySelector('#attMis .g-go').click()`); await sleep(150); await p.waitFor(`!${ctl}.busy`, 60000); await sleep(100); }
async function center(p, s) { await p.eval(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(160); }
async function cpt(p, cv, W, lx, ly) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(cv)}).getBoundingClientRect(); return { x: r.left + ${lx} * r.width / ${W}, y: r.top + ${ly} * r.width / ${W} }; })()`); }
async function mouseDrag(p, pts) {
  await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i].x, y: pts[i].y, button: 'left' }); await sleep(10); }
  const l = pts[pts.length - 1]; await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l.x, y: l.y, button: 'left', clickCount: 1 }); await sleep(80);
}
async function click(p, x, y) { await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(80); }
/** Перетащить конец запроса на плоскости ключей из точки a в точку b (координаты ключей). */
async function dragQ(p, a, b, steps) {
  const pts = []; steps = steps || 14;
  for (let i = 0; i <= steps; i++) { const x = a[0] + (b[0] - a[0]) * i / steps, y = a[1] + (b[1] - a[1]) * i / steps, l = await p.eval(`window.__l16.Att.api.planePt(${x}, ${y})`); pts.push(await cpt(p, '#attPlane', 420, l.x, l.y)); }
  await mouseDrag(p, pts);
}
const curQ = (p) => p.eval('(() => { const s = window.__l16.Att.st; return s.mode === 1 ? s.q.slice() : s.qh[s.active].slice(); })()');
async function box(p, s) { return p.eval(`(() => { const r = document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, l: r.left }; })()`); }

async function lab(p, shots) {
  await center(p, '#attMis');
  check(await p.eval('document.querySelector("#attMis").classList.contains("m-live")') && (await crit(p, '#attMis')) === 'no', 'лаб М1: живая миссия, критерий «ещё нет»');
  check(await p.eval('document.querySelector("#wrapDk").hidden && document.querySelector("#wrapDiv").hidden && document.querySelector("#wrapMask").hidden && document.querySelector("#wrapHead2").hidden && !document.querySelector("#wrapBars").hidden'), 'лаб М1: видны только запрос и переключатель столбиков');
  await center(p, '#attPlane');
  const cupA = Math.atan2(T.KEYS.gen[0][1], T.KEYS.gen[0][0]);
  await dragQ(p, await curQ(p), [2.4 * Math.cos(cupA), 2.4 * Math.sin(cupA)]);
  let s = await p.eval('window.__l16.Att.api.state()');
  check(await done(p), `лаб М1: запрос перетащен мышью к ключу чашки — вес ${f(s.w[0])}; ` + (await outText(p, '#attMis')).slice(0, 80));
  await p.eval('document.querySelector("#wrapBars button[data-v=s]").click()'); await sleep(60);
  check(/Оценки q·k/.test(await p.eval('document.querySelector("#attBarsTitle").textContent')), 'лаб: столбики переключаются на q·k');
  await p.eval('document.querySelector("#wrapBars button[data-v=w]").click()');
  if (shots) await p.shotEl(out('l16-lab-m1.png'), '#lab .lab', 6);
  await next(p);
  await center(p, '#attPlane');
  await dragQ(p, await curQ(p), PLAN.m2, 18);
  s = await p.eval('window.__l16.Att.api.state()');
  const nn = T.nearest(s.out);
  check(await done(p), `лаб М2: ответ в ${f(nn.d * 100, 0)} см от ближайшего предмета, наибольший вес ${f(Math.max(...s.w))}`);
  if (shots) await p.shotEl(out('l16-lab-m2.png'), '#lab .lab', 6);
  await next(p);
  // М3: ставка, первый запуск схлопывает, деление спасает
  check(await p.eval('document.querySelector("#attMis .g-go").disabled && document.querySelector("#attDk").disabled && document.querySelector("#attDiv").disabled'), 'лаб М3: до ставки кнопка, d_k и деление заблокированы');
  const qBefore = await curQ(p);
  await center(p, '#attPlane'); await dragQ(p, qBefore, [0, 0], 6);
  const qAfter = await curQ(p);
  check(qAfter[0] === qBefore[0] && qAfter[1] === qBefore[1], 'лаб М3: запрос закреплён, перетаскивание его не двигает');
  await p.eval('window.__l16.SPEED.k = 4');
  await center(p, '#attMis');
  await bet(p, '#attMis', 'Схлопнутся'); await go(p);
  const r3 = await p.eval(`${ctl}.ctx.results[2]`);
  check(!(await done(p)) && r3.dk === 256 && !r3.div && r3.max > 0.95 && (await crit(p, '#attMis')) === 'ok,no' && /схлопнулись/.test(await p.eval('document.querySelector("#attMis .g-out").textContent')), `лаб М3, без деления: наибольший вес ${f(r3.max, 3)} у «${T.ITEMS[r3.arg].name}», оценки от ${f(r3.lo, 0)} до ${f(r3.hi, 0)}`);
  check(await p.eval('!document.querySelector("#attDk").disabled && !document.querySelector("#attDiv").disabled'), 'лаб М3: после опыта ручки разблокированы');
  if (shots) await p.shotEl(out('l16-lab-m3-peak.png'), '#lab .lab', 6);
  await p.eval(`(() => { const e = document.querySelector('#attDiv'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60);
  await go(p);
  const r3b = await p.eval(`${ctl}.ctx.results[2]`);
  check(await done(p) && r3b.div && r3b.max < 0.9, `лаб М3, с делением на 16: наибольший вес ${f(r3b.max)}; ставка: ${await p.eval('document.querySelector("#attMis .bet-right") ? document.querySelector("#attMis .bet-right").textContent : "нет"')}`);
  console.log('  журнал М3:', await p.eval('document.querySelector("#attMis .m-log").textContent'));
  if (shots) await p.shotEl(out('l16-lab-m3.png'), '#lab .lab', 6);
  await p.eval('window.__l16.SPEED.k = 1');
  await next(p);
  // М4: маска
  check(await p.eval('!document.querySelector("#wrapMask").hidden && document.querySelector("#wrapDk").hidden'), 'лаб М4: появилась матрица маски, d_k спрятан');
  await center(p, '#wrapMask');
  check((await crit(p, '#attMis')) === 'ok,ok,no,no', 'лаб М4: полная маска → ' + (await crit(p, '#attMis')));
  await p.eval('document.querySelector("[data-mask=causal]").click()'); await sleep(60);
  check((await crit(p, '#attMis')) === 'no,no,ok,ok', 'лаб М4: каузальная → ' + (await crit(p, '#attMis')));
  for (const [i, j] of [[0, 1], [0, 2], [1, 2], [4, 5]]) { await p.eval(`document.querySelector('#maskGrid .mc[data-i="${i}"][data-j="${j}"]').click()`); await sleep(40); }
  s = await p.eval('window.__l16.Att.api.state()');
  check(await done(p) && JSON.stringify(s.mask) === JSON.stringify(T.Mask.block()), 'лаб М4: 4 клика от каузальной — блочная маска π0; ' + (await p.eval('document.querySelector("#maskNote").textContent')).slice(0, 70));
  if (shots) await p.shotEl(out('l16-lab-m4.png'), '#lab .lab', 6);
  await next(p);
  // М5: две головы
  check(await p.eval('!document.querySelector("#wrapHead2").hidden && document.querySelector("#wrapMask").hidden && window.__l16.Att.st.mode === 2'), 'лаб М5: две головы, переключатель голов виден');
  await center(p, '#attPlane');
  await dragQ(p, await curQ(p), [2.4, 0.05]);
  await p.eval('document.querySelector("#attHeadSeg button[data-h=\\"1\\"]").click()'); await sleep(60);
  await dragQ(p, await curQ(p), [1.25, 2.1]);
  s = await p.eval('window.__l16.Att.api.state()');
  check(await done(p), `лаб М5: «цвет» красные ${f(s.wc[0] + s.wc[1])}, «место» у края ${f(s.wp[0] + s.wp[2])}, чашка ${f(s.wc[0])} и ${f(s.wp[0])}`);
  if (shots) await p.shotEl(out('l16-lab-m5.png'), '#lab .lab', 6);
  await next(p);
  check(await p.eval('["#wrapBars","#wrapDk","#wrapDiv","#wrapMask","#wrapHead2"].every((s) => !document.querySelector(s).hidden)'), 'лаб, свободный режим: все ручки видны');
  // свободный режим: растащить ключи чашки и чайника у головы «цвет»
  await p.eval('document.querySelector("#attHeadSeg button[data-h=\\"0\\"]").click()'); await sleep(60);
  const kt = await p.eval('window.__l16.Att.st.keys.color[1].slice()');
  const l0 = await p.eval(`window.__l16.Att.api.planePt(${kt[0]}, ${kt[1]})`), l1 = await p.eval('window.__l16.Att.api.planePt(1.0, -1.1)');
  await center(p, '#attPlane');
  await mouseDrag(p, [await cpt(p, '#attPlane', 420, l0.x, l0.y + 2), await cpt(p, '#attPlane', 420, (l0.x + l1.x) / 2, (l0.y + l1.y) / 2), await cpt(p, '#attPlane', 420, l1.x, l1.y)]);
  const kk = await p.eval('window.__l16.Att.st.keys.color.map((v) => v.map((x) => +x.toFixed(2)))');
  check(Math.hypot(kk[0][0] - kk[1][0], kk[0][1] - kk[1][1]) > 0.5, `лаб, свободный режим: ключи чашки и чайника растащены — ${JSON.stringify(kk[0])} и ${JSON.stringify(kk[1])}`);
  await p.eval(`(() => { const e = document.querySelector('#attDk'); e.value = 7; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(60);
  if (shots) await p.shotEl(out('l16-lab-free.png'), '#lab .lab', 6);
  await p.eval('document.querySelector("#attMis .g-restart").click()'); await sleep(120);
  s = await p.eval('window.__l16.Att.api.state()');
  check(await p.eval(`${ctl}.index === 0`) && s.mode === 1 && s.dk === 2 && !s.div && !(await done(p)), 'лаб: «Начать заново» вернула первую миссию и исходную сцену');
}

async function tokens(p, shots) {
  await center(p, '#tokTask');
  check(await p.eval('document.querySelector("#tokPatch button[data-p=\\"16\\"]").disabled'), 'токены: до ставки патч 16 недоступен');
  await bet(p, '#tokTask', '196');
  await p.eval('document.querySelector("#tokPatch button[data-p=\\"16\\"]").click()'); await sleep(60);
  check(await p.eval('document.querySelector("#tokN").textContent') === '196' && await p.eval('document.querySelector("#tokTask .bet-right") !== null'), 'токены: патч 16 → 196 токенов, ставка «196» сыграла');
  await p.eval('document.querySelector("#tokTask .pick[data-g=t] button[data-v=\\"2\\"]").click()'); await sleep(40);
  check(await p.eval('document.querySelector("#tokTask .pick[data-g=t] button[data-v=\\"2\\"]").classList.contains("pk-no")'), 'токены: неверный ответ «в 2 раза» отмечен красным');
  await p.eval('document.querySelector("#tokTask .pick[data-g=t] button[data-v=\\"4\\"]").click()'); await sleep(40);
  await p.eval('document.querySelector("#tokTask .pick[data-g=p] button[data-v=\\"16\\"]").click()'); await sleep(60);
  check(await p.eval('window.__l16.Tok.task.done') && /196/.test(await outText(p, '#tokTask')), 'токены: задача решена — ' + (await outText(p, '#tokTask')).slice(0, 90));
  const hv = await cpt(p, '#tokCv', 420, 140, 330); await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hv.x, y: hv.y }); await sleep(80);
  check(/Патч \d+ из 196/.test(await p.eval('document.querySelector("#tokOut").textContent')), 'токены: наведение на кадр — ' + await p.eval('document.querySelector("#tokOut").textContent'));
  if (shots) await p.shotEl(out('l16-tokens.png'), '#tokens .tok-card', 6);
  await p.eval(`(() => { const e = document.querySelector('#tokTL'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60);
  check(await p.eval('document.querySelector("#tokN").textContent') === '8' && await p.eval('document.querySelector("#tokN2").textContent') === '64', 'токены: TokenLearner → 8 токенов, 64 пары');
  if (shots) await p.shotEl(out('l16-tokens-tl.png'), '#tokens .tok-card', 6);
  await p.eval(`(() => { const e = document.querySelector('#tokTL'); e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function order(p, shots) {
  await center(p, '#ordCmd');
  check(await p.eval('document.querySelector("#ordFails").textContent') === '0' && /верно/.test(await p.eval('document.querySelector("#ordAns").textContent')), 'порядок: исходная команда — ответ верный');
  // перетаскиваем «миску» (позиция 3) на позицию 1
  const a = await box(p, '#ordCmd .ord-chip[data-p="3"]'), b = await box(p, '#ordCmd .ord-chip[data-p="1"]');
  await mouseDrag(p, [a, { x: (a.x * 2 + b.x) / 3, y: a.y }, { x: (a.x + b.x * 2) / 3, y: a.y + 2 }, { x: b.x, y: b.y }]);
  const o1 = await p.eval('window.__l16.Ord.st.order.join(",")');
  check(o1 === 'take,bowl,cup,then' && await p.eval('document.querySelector("#ordFails").textContent') === '1', `порядок: миска перетащена мышью → ${o1}, отказ найден`);
  check(/Такой же выход был/.test(await p.eval('document.querySelector("#ordSame").textContent')) && (await crit(p, '#ordTask')) === 'ok,no', 'порядок: тот же выход, что у исходной команды; первый критерий выполнен');
  // нажатиями меняем местами «чашку» и «потом»
  for (const i of [2, 3]) await p.eval(`(() => { const c = document.querySelector('#ordCmd .ord-chip[data-p="${i}"]'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 })); c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 })); })()`);
  await sleep(60);
  check(await p.eval('window.__l16.Ord.st.order.join(",")') === 'take,bowl,then,cup' && await p.eval('document.querySelector("#ordFails").textContent') === '2', 'порядок: нажатиями поменяли два слова — второй отказ');
  if (shots) await p.shotEl(out('l16-order-broken.png'), '#order .ord-card', 6);
  await p.eval(`(() => { const e = document.querySelector('#ordPE'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(80);
  check(await p.eval('window.__l16.Ord.task.done') && /верно/.test(await p.eval('document.querySelector("#ordAns").textContent')), 'порядок: с позициями ответ верный, задача решена — ' + (await outText(p, '#ordTask')).slice(0, 70));
  await center(p, '#peCv');
  const pe = await cpt(p, '#peCv', 420, 200, 120); await click(p, pe.x, pe.y); await sleep(60);
  check(/^Позиции \d+ и \d+: сходство/.test(await p.eval('document.querySelector("#peOut").textContent')), 'порядок: тепловая карта отвечает на касание — ' + await p.eval('document.querySelector("#peOut").textContent').then((t) => t.slice(0, 50)));
  if (shots) await p.shotEl(out('l16-order.png'), '#order .ord-card', 6);
}

async function cost(p, shots) {
  await center(p, '#costPresets');
  const res = {};
  for (const k of ['rt1', 'act', 'octo', 'pi0']) { await p.eval(`document.querySelector('#costPresets button[data-k="${k}"]').click()`); await sleep(40); res[k] = (await p.eval('document.querySelector("#costN").textContent')).replace(/\s/g, ''); }
  check(res.rt1 === '48' && res.act === '1202' && res.octo === '656' && res.pi0 === '867', `калькулятор: пресеты RT-1 ${res.rt1}, ACT ${res.act}, Octo ${res.octo}, π0 ${res.pi0}`);
  check((await crit(p, '#costTask')) === 'no,no,no', 'калькулятор: у π0 с тремя камерами критерии ещё не выполнены');
  const setR = (id, v) => p.eval(`(() => { const e = document.querySelector('#${id}'); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await setR('cImg', 4); await sleep(40);
  check((await crit(p, '#costTask')) === 'ok,ok,no' && (await p.eval('document.querySelector("#costN").textContent')).replace(/\s/g, '') === '1123', 'калькулятор: 4 камеры → 1123 токена, внимание дороже');
  await p.eval('document.querySelector("#cCut button[data-c=p16]").click()'); await sleep(40);
  check(await p.eval('document.querySelector("#costN").textContent') === '883' && !(await p.eval('window.__l16.Cost.task.done')), 'калькулятор: патч 16 → 883 токена, всё ещё больше 867');
  await p.eval('document.querySelector("#cCut button[data-c=g64]").click()'); await sleep(60);
  check(await p.eval('window.__l16.Cost.task.done') && await p.eval('document.querySelector("#cRes").disabled'), 'калькулятор: до 64 на кадр → задача решена — ' + (await outText(p, '#costTask')).slice(0, 80));
  if (shots) await p.shotEl(out('l16-cost.png'), '#cost .cost-card', 6);
}

async function kv(p, shots) {
  await center(p, '#piBar');
  check(await p.eval('document.querySelector("#piNoCache").disabled'), 'вывод π0: до ставки «без кэша» недоступен');
  const bb = await box(p, '#piBar');
  await click(p, bb.l + bb.w * 30 / 73, bb.y);
  check(await p.eval('window.__l16.Pi.st.cursor') !== 46 && (await crit(p, '#piTask')).startsWith('no'), 'вывод π0: щелчок на 30 мс — критерий ещё нет');
  await click(p, bb.l + bb.w * 47.3 / 73, bb.y);
  check(await p.eval('window.__l16.Pi.st.cursor') === 46 && /первый шаг flow/.test(await p.eval('document.querySelector("#piCursor").textContent')), 'вывод π0: щелчок у границы прилип к 46 мс — ' + await p.eval('document.querySelector("#piCursor").textContent'));
  await center(p, '#piTape');
  const tp = await p.eval('(() => { const f = window.__l16.Pi.tapePt(25), r = document.querySelector("#piTape").getBoundingClientRect(); return { x: r.left + f.fx * r.width, y: r.top + f.fy * r.height }; })()');
  await click(p, tp.x, tp.y);
  check(await p.eval('window.__l16.Pi.st.tick') === 25 && /новую пачку/.test(await p.eval('document.querySelector("#piTick").textContent')), 'вывод π0: тик 25 на ленте — ' + await p.eval('document.querySelector("#piTick").textContent'));
  if (shots) await p.shotEl(out('l16-kv.png'), '#kv .pi-card', 6);
  await bet(p, '#piTask', 'Станет раз в пять');
  await p.eval(`(() => { const e = document.querySelector('#piNoCache'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60);
  check(await p.eval('document.querySelector("#piTotal").textContent') === '361 мс' && await p.eval('window.__l16.Pi.task.done') && await p.eval('document.querySelector("#piTask .bet-right") !== null'), 'вывод π0: без кэша 361 мс, ставка сыграла, задача решена — ' + (await outText(p, '#piTask')).slice(0, 60));
  if (shots) await p.shotEl(out('l16-kv-nocache.png'), '#kv .pi-card', 6);
  await p.eval(`(() => { const e = document.querySelector('#piRemote'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); const n = document.querySelector('#piNoCache'); n.checked = false; n.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(60);
  check(await p.eval('document.querySelector("#piTotal").textContent') === '86 мс', 'вывод π0: вне робота — 86 мс');
  await p.eval(`(() => { const e = document.querySelector('#piRemote'); e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function models(p, shots) {
  await center(p, '#modelSort');
  const plan = { rt2: 'ar', ovla: 'ar', fast: 'ar', act: 'one', octo: 'flow', pi0: 'flow', groot: 'one' };
  for (const [id, z] of Object.entries(plan)) {
    if (id === 'fast' || id === 'groot') { await p.eval(`(() => { const c = document.querySelector('#modelSort [data-id=${id}]'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 })); c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 })); document.querySelector('#modelSort .c-zone[data-zone=${z}]').click(); })()`); continue; }
    const a = await box(p, `#modelSort [data-id=${id}]`), b = await box(p, `#modelSort .c-zone[data-zone=${z}]`);
    await mouseDrag(p, [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b]);
  }
  await p.eval('window.__l16.mis.sort.check()'); await sleep(100);
  const t = await p.eval('document.querySelector("#modelSort .c-out").textContent');
  check(/^6 из 7/.test(t) && /GR00T N1/.test(t), 'сортировка: ' + t.slice(0, 120));
  if (shots) await p.shotEl(out('l16-models.png'), '#models .wrap', 6);
}

async function desktop() {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  console.log('Десктоп 1440');
  check(await p.eval('document.querySelectorAll("[id]").length === new Set([...document.querySelectorAll("[id]")].map((e) => e.id)).size'), 'id без повторов');
  check(await p.eval('typeof Guide === "undefined" && !document.querySelector(".g-card")'), 'старая пошаговая карточка не используется');
  await p.shot(out('l16-hero.png'));
  await p.eval('document.querySelector(".topbar").style.visibility = "hidden"');
  await p.shotEl(out('l16-inputs.png'), '#seqFig', 6);
  await tokens(p, true);
  await lab(p, true);
  await order(p, true);
  await cost(p, true);
  await kv(p, true);
  await models(p, true);
  await p.eval('document.querySelectorAll("#quizBox .q-card").forEach((c) => c.querySelector(".q-opt").click())');
  console.log('  квиз:', await p.eval('document.querySelector("#quizScore").textContent'));
  await p.shotEl(out('l16-quiz.png'), '#quiz .prose', 6);
  await p.shotEl(out('l16-finale.png'), '#finale .prose', 6);
  // тёмная тема: лаборатория в миссии с двумя головами и остальные интерактивы
  await p.click('#themeBtn'); await sleep(300);
  await p.eval(`${ctl}.goto(4)`); await sleep(100);
  await center(p, '#attPlane'); await dragQ(p, await curQ(p), [2.2, 0.1]);
  await p.shotEl(out('l16-lab-dark.png'), '#lab .lab', 6);
  await p.eval(`${ctl}.goto(3)`); await sleep(100);
  await p.shotEl(out('l16-lab-mask-dark.png'), '#lab .lab', 6);
  await p.shotEl(out('l16-tokens-dark.png'), '#tokens .tok-card', 6);
  await p.shotEl(out('l16-order-dark.png'), '#order .ord-card', 6);
  await p.shotEl(out('l16-cost-dark.png'), '#cost .cost-card', 6);
  await p.shotEl(out('l16-kv-dark.png'), '#kv .pi-card', 6);
  check(await p.eval('document.documentElement.dataset.theme') === 'dark', 'тёмная тема включена, канвасы перерисованы');
  check(p.logs.length === 0, 'консоль десктопа: ' + (p.logs.join(' | ') || 'чисто'));
  await B.close();
}

async function phone() {
  const B = await launch({ w: 390, h: 844 });
  const m = await B.page(URL0, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 60000);
  console.log('Телефон 390');
  await m.shot(out('l16-m-hero.png'));
  await m.eval('document.querySelector(".topbar").style.visibility = "hidden"');
  await center(m, '#attPlane');
  const cupA = Math.atan2(T.KEYS.gen[0][1], T.KEYS.gen[0][0]);
  await dragQ(m, await curQ(m), [2.4 * Math.cos(cupA), 2.4 * Math.sin(cupA)]);
  check(await done(m), 'телефон: лаб М1 решена перетаскиванием');
  await m.shotEl(out('l16-m-lab.png'), '#lab .lab', 4);
  await m.eval(`${ctl}.goto(3)`); await sleep(120);
  await m.shotEl(out('l16-m-mask.png'), '#wrapMask', 4);
  await m.eval(`${ctl}.goto(4)`); await sleep(120);
  await m.shotEl(out('l16-m-heads.png'), '#lab .att-card', 4);
  await m.shotEl(out('l16-m-inputs.png'), '#seqFig', 4);
  await m.shotEl(out('l16-m-tokens.png'), '#tokens .tok-card', 4);
  await order(m, false);
  await m.shotEl(out('l16-m-order.png'), '#order .ord-card', 4);
  await m.shotEl(out('l16-m-cost.png'), '#cost .cost-card', 4);
  await center(m, '#piTape');
  const tq = await m.eval('(() => { const f = window.__l16.Pi.tapePt(50), r = document.querySelector("#piTape").getBoundingClientRect(); return { x: r.left + f.fx * r.width, y: r.top + f.fy * r.height }; })()');
  await click(m, tq.x, tq.y);
  check(await m.eval('window.__l16.Pi.st.tick') === 50, 'телефон: тик 50 на ленте попадает пальцем — ' + await m.eval('document.querySelector("#piTick").textContent'));
  await m.shotEl(out('l16-m-kv.png'), '#kv .pi-card', 4);
  await m.shotEl(out('l16-m-models.png'), '#models .wrap', 4);
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
