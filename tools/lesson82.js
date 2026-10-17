// Урок 8.2 «Безопасность»: лаборатории дают обещанные в тексте исходы, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без горизонтальной прокрутки.
// Снимки — shots/l82-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-12-26 python3 lessons/build.py l82.
// node tools/lesson82.js          — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема);
// node tools/lesson82.js --seeds  — проверка в Node: выводы лабораторий на зёрнах 1–10 и диапазоны из «Под капотом».
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l82/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const r2 = (v, d) => (+v).toFixed(d).replace('.', ',');

/* ---------- режим --seed N: одно зерно в Node — все числа, о которых урок говорит «на десяти зёрнах» (JSON) ---------- */
if (process.argv.includes('--seed')) {
  const E = require('../lessons/l82/engine.js'), s = +process.argv[process.argv.indexOf('--seed') + 1];
  const pol = E.policy(s), o0 = { seed0: 1 + (s - 1) * 1000 }, B = (o) => E.batch(pol, Object.assign({}, o0, o));
  const sm = (c) => ({ goal: c.goal, kettle: c.kettle, box: c.box, stuck: c.stuck, t: c.tMean });
  const nof = B({}), fil = B({ filter: true });
  const r = { seed: s, nof: sm(nof), fil: sm(fil), dkMax: Math.max(0, ...nof.trips.filter((q) => q.outcome === 'kettle').map((q) => Math.abs(q.k.x - E.RX))), alpha: {}, holes: {} };
  for (const a of [0.25, 0.5, 1, 2, 4, 8, 16]) r.alpha[a] = sm(B({ filter: true, alpha: a }));
  for (const [e, m] of [[10, 5], [10, 15], [20, 15], [20, 25]]) r.holes[e + '/' + m] = sm(B({ filter: true, bias: { x: 0, y: -e }, margin: m }));
  r.boxNof = sm(B({ box: true })); r.boxK = sm(B({ box: true, filter: true })); r.boxKnown = sm(B({ box: true, filter: true, boxKnown: true }));
  process.stdout.write(JSON.stringify(r));
} else if (process.argv.includes('--seeds')) {
/* ---------- режим --seeds: десять зёрен в Node, по процессу на зерно, не больше двух сразу (результат — shots/l82-seeds.json) ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R = {};
  const runOne = (s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed', String(s)], { maxBuffer: 1 << 24 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    let i = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (i < seeds.length) { const s = seeds[i++]; R[s] = await runOne(s); console.log(`зерно ${s}: без фильтра касаний ${R[s].nof.kettle}, с фильтром ${R[s].fil.kettle}, не доехали ${R[s].fil.stuck}; α = 16 — касаний ${R[s].alpha['16'].kettle}; корзина на карте — не доехали ${R[s].boxKnown.stuck}`); } }));
    fs.writeFileSync(out('l82-seeds.json'), JSON.stringify(R));
    const S = seeds.map((s) => R[s]), mm = (f) => { const v = S.map(f); return [Math.min(...v), Math.max(...v)]; }, cnt = (f) => S.filter(f).length;
    const txt = plain();
    // лаборатория 1
    const [n0, n1] = mm((x) => x.nof.kettle), dk = Math.max(...S.map((x) => x.dkMax)), [st0, st1] = mm((x) => x.fil.stuck), [dt0, dt1] = mm((x) => x.fil.t - x.nof.t);
    console.log(`лаб. 1: без фильтра ${n0}–${n1}, наибольший сдвиг чайника при касании ${r2(dk, 2)} см; с фильтром касаний ${mm((x) => x.fil.kettle).join('–')}, не доехали ${st0}–${st1}, время +${r2(dt0, 2)}–${r2(dt1, 2)} с`);
    check(cnt((x) => x.fil.kettle === 0) === 10 && txt.includes('С фильтром касаний нет ни на одном зерне'), 'лаб. 1: с фильтром касаний нет ни на одном зерне');
    check(txt.includes(`задевает чайник в ${n0}–${n1} поездках из 100`) && dk < 7 && dk > 6 && txt.includes('ближе 7 см к линии маршрута'), `лаб. 1: без фильтра ${n0}–${n1}, все касания ближе 7 см к маршруту`);
    check(txt.includes(`от ${st0} до ${st1} поездок из 100, а среднее время доехавших растёт на ${r2(dt0, 2)}–${r2(dt1, 2)} с`), 'лаб. 1: недоезды и прибавка времени');
    // лаборатория 2
    const k = (a) => mm((x) => x.alpha[a].kettle);
    check(cnt((x) => x.alpha['1'].kettle === 0 && x.alpha['2'].kettle === 0) === 10 && txt.includes('При \\(\\alpha\\) от 1 до 2 касаний нет ни на одном зерне'), 'лаб. 2: при α = 1 и 2 касаний нет ни на одном зерне');
    const [a40, a41] = k('4'), [a80, a81] = k('8'), [a160, a161] = k('16'), [q0, q1] = mm((x) => x.alpha['0.25'].stuck), [t0, t1] = mm((x) => x.alpha['0.25'].t);
    console.log(`лаб. 2: α 4 — ${a40}–${a41}, α 8 — ${a80}–${a81}, α 16 — ${a160}–${a161}; α 0,25 — не доехали ${q0}–${q1}, время ${r2(t0, 2)}–${r2(t1, 2)} с, касаний ${k('0.25').join('–')}`);
    check(txt.includes(`их от ${a40} до ${a41} на зерно, при \\(\\alpha = 8\\) — от ${a80} до ${a81}, при \\(\\alpha = 16\\) — от ${a160} до ${a161}`), 'лаб. 2: касания при α = 4, 8, 16');
    check(k('0.25')[1] === 0 && txt.includes(`не доезжают от ${q0} до ${q1} поездок из 100, а доехавшие тратят в среднем ${r2(t0, 2)}–${r2(t1, 2)} с`), 'лаб. 2: осторожный фильтр α = 0,25');
    // лаборатория 3
    const h = (key, f) => mm((x) => f(x.holes[key]));
    const [e0, e1] = h('10/5', (c) => c.kettle), [s0, s1] = h('10/15', (c) => c.stuck), [f0, f1] = h('20/15', (c) => c.kettle);
    const [b0, b1] = mm((x) => x.boxNof.box), [c0, c1] = mm((x) => x.boxK.box), more = cnt((x) => x.boxK.box > x.boxNof.box), never = cnt((x) => x.boxK.box >= x.boxNof.box), [u0, u1] = mm((x) => x.boxKnown.stuck);
    console.log(`лаб. 3: 10/5 — ${e0}–${e1}; 10/15 — не доехали ${s0}–${s1}; 20/15 — ${f0}–${f1}; корзина без фильтра ${b0}–${b1}, с фильтром по чайнику ${c0}–${c1} (больше на ${more}, не меньше на ${never}); на карте — не доехали ${u0}–${u1}`);
    check(txt.includes(`касаний от ${e0} до ${e1} на зерно`) && h('10/15', (c) => c.kettle)[1] === 0 && txt.includes(`не доезжают от ${s0} до ${s1} поездок из 100`), 'лаб. 3: ошибка 10 см, запас 5 и 15 см');
    check(txt.includes(`(от ${f0} до ${f1} касаний)`) && h('20/25', (c) => c.kettle)[1] === 0, 'лаб. 3: ошибка 20 см — запаса 15 см мало, 25 хватает');
    check(txt.includes(`в ${b0}–${b1} поездках из 100 без фильтра и в ${c0}–${c1}`) && never === 10 && txt.includes(`на ${more} зёрнах из 10 — увеличивает`), 'лаб. 3: корзина не на карте');
    check(cnt((x) => x.boxKnown.kettle + x.boxKnown.box === 0) === 10 && txt.includes(`не доезжают от ${u0} до ${u1} поездок из 100`), 'лаб. 3: корзина на карте — касаний нет, недоезды');
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/8-2-bezopasnost.html');
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
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 30000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const setRange = (p, sel, v) => p.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
/** Точка канваса (логические координаты W×H) в координатах окна; канвас сначала прокручивается в центр экрана. */
async function canvasPt(p, sel, lx, ly, W, H) {
  return p.eval(`(() => { const cv = document.querySelector('${sel}'); cv.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = cv.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width * ${lx} / ${W}, y: r.top + r.height * ${ly} / ${H} }); })()`).then(J);
}
const mouse = (p, type, q) => p.S('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
/** Нажатие мышью в точку канваса. */
async function tap(p, sel, lx, ly, W, H) { const q = await canvasPt(p, sel, lx, ly, W, H); await mouse(p, 'mousePressed', q); await sleep(40); await mouse(p, 'mouseReleased', q); await sleep(200); }
/** Перетаскивание мышью из одной точки канваса в другую. */
async function drag(p, sel, a, b, W, H) {
  const qa = await canvasPt(p, sel, a[0], a[1], W, H), qb = await canvasPt(p, sel, b[0], b[1], W, H);
  await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: qa.x, y: qa.y }); await mouse(p, 'mousePressed', qa);
  for (let i = 1; i <= 6; i++) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: qa.x + (qb.x - qa.x) * i / 6, y: qa.y + (qb.y - qa.y) * i / 6, button: 'left', buttons: 1 }); await sleep(30); }
  await mouse(p, 'mouseReleased', qb); await sleep(200);
}
/** Центр клетки табло лаборатории 1 для поездки с номером n (1…100), в логических координатах. */
const boardCell = (p, n) => p.eval(`(() => { const cv = document.getElementById('dBoard'), nar = cv.getBoundingClientRect().width < 500, W = nar ? 380 : 640, H = nar ? 200 : 150, cw = (W - 16) / 20, ch = (H - 16) / 5, i = ${n - 1}; return JSON.stringify({ x: 8 + (i % 20) * cw + cw / 2, y: 8 + Math.floor(i / 20) * ch + ch / 2, W, H }); })()`).then(J);
const pct = (v) => Math.round(v * 100);
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^14 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 8.1: три вопроса');
    const bridge = await text(p, '#finale .bridge');
    check(/8\.3/.test(bridge) && (await p.eval(`!!document.querySelector('#finale .bridge a[href="8-3-nadezhnost.html"]')`)), 'в итогах — мост в 8.3 со ссылкой на урок');
    check((await p.eval(`L82.CFG.SEED`)) === 1 && (await p.eval(`L82.CFG.NTRIP`)) === 100 && (await p.eval(`L82.CFG.ALPHA`)) === 2 && (await p.eval(`L82.CFG.MARGIN`)) === 5, 'зерно 1, серия из 100 поездок, α = 2, запас 5 см');
    const pl = await p.eval(`L82.pLeft(-2)`); check(pl > 0.2 && pl < 0.3 && (await text(p, '#duel details.deep')).includes('примерно 3 раза из 4'), `учитель: при сдвиге 2 см объезжает справа с вероятностью ${r2(1 - pl, 2)}`);
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['loop', 'why', 0.8, 4.6], ['barrier', 'barrier', 0.6, 2.4], ['shield', 'shield', 1.0, 3.3]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await show(p, sec, `#${sec} .flow-card`, `l82-${id}.png`);
    }

    // ---------- интерактив: одна команда фильтра ----------
    console.log('интерактив');
    const VS = 150 / 90;
    check(!(await visible(p, '#wrapQAlpha')), 'миссия 1: ползунок α скрыт');
    await tap(p, '#qVel', 200 - 45 * VS, 188 - 40 * VS, 400, 360);
    let r = await liveDone(p, '#qMis', 5000);
    check(r.ok && /из них к чайнику 40/.test(r.out) && /фильтр её пропускает/.test(r.out), 'миссия 1 засчитана сама: команда в объезд проходит без изменений — ' + r.out.slice(0, 70));
    await nextMission(p, '#qMis');
    check(!(await p.eval(`window.__l82.Qp.st.reveal`)), 'миссия 2: что пропустит фильтр, до ставки не видно');
    r = await viaUI(p, '#qMis', 1);
    check(r.ok && /ставка сыграла/i.test(r.out) && /снизил скорость до 30 см\/с — ровно α·h = 2 · 15/.test(r.out), 'миссия 2: команда в чайник — 30 см/с в том же направлении');
    await nextMission(p, '#qMis');
    await drag(p, '#qMap', [200, 120 + 51 * 2], [200, 120 + 37 * 2], 400, 360);
    r = await liveDone(p, '#qMis', 5000);
    const m3q = r.out.match(/При запасе ([\d,]+) см фильтр пропускает ([\d,]+) см\/с/);
    check(r.ok && m3q && +m3q[1].replace(',', '.') < 2 && +m3q[2].replace(',', '.') < 10, 'миссия 3 засчитана сама: на границе от команды в чайник почти ничего не остаётся — ' + r.out.slice(0, 60));
    await nextMission(p, '#qMis');
    check(await visible(p, '#wrapQAlpha'), 'свободный режим: ползунок α виден');
    await show(p, 'qp', '#qp .lab', 'l82-qp.png');

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    await show(p, 'duel', '#duel .lab', 'l82-duel-empty.png');
    const t0 = Date.now();
    r = await viaUI(p, '#dMis', 1);
    const secs = (Date.now() - t0) / 1000;
    const m1 = r.out.match(/задела чайник в (\d+) поездках из 100, остальные (\d+) доехали за ([\d,]+) с\. На маршруте чайник стоял в (\d+) поездках.*?ближе ([\d,]+) см.*?выбрана поездка (\d+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m1 && m1[1] === '7' && m1[2] === '93' && m1[4] === '53' && m1[5] === '4,1' && m1[6] === '9', `миссия 1 (${secs.toFixed(1)} с с обучением): касаний ${m1 && m1[1]}, на маршруте ${m1 && m1[4]}, ближе ${m1 && m1[5]} см`);
    check(secs < 20, `обучение политики и серия — ${secs.toFixed(1)} с`);
    await nextMission(p, '#dMis');
    r = await viaUI(p, '#dMis', 2);
    const m2 = r.out.match(/(\d+) поездок из 100 доехали, (\d+) поездка не доехала за 15 с\. Цена — время: в среднем ([\d,]+) с против ([\d,]+) с без фильтра\. Фильтр менял команду на (\d+)% шагов/);
    check(r.ok && /ставка сыграла/i.test(r.out) && m2 && m2[1] === '99' && m2[2] === '1' && m2[3] === '5,39' && m2[4] === '5,20' && m2[5] === '9', `миссия 2: с фильтром касаний нет, ${m2 && m2[2]} не доехала, ${m2 && m2[3]} против ${m2 && m2[4]} с, вмешательств ${m2 && m2[5]}%`);
    await nextMission(p, '#dMis');
    let c = await boardCell(p, 80); await tap(p, '#dBoard', c.x, c.y, c.W, c.H);
    r = await liveDone(p, '#dMis', 5000);
    check(r.ok && /В поездке 80 политика ведёт Аду прямо на чайник/.test(r.out) && /за 11,9 с/.test(r.out), 'миссия 3 засчитана сама: поездка 80 — объезд вдоль границы за 11,9 с');
    await show(p, 'duel', '#duel .lab', 'l82-duel.png');
    await nextMission(p, '#dMis');
    c = await boardCell(p, 75); await tap(p, '#dBoard', c.x, c.y, c.W, c.H);
    r = await liveDone(p, '#dMis', 5000);
    check(r.ok && /В поездке 75/.test(r.out), 'миссия 4 засчитана сама: поездка 75 не доехала');
    await show(p, 'duel', '#duel .lab', 'l82-duel-stuck.png');
    await nextMission(p, '#dMis');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapAAlpha')), 'миссии 1–2: ползунок α скрыт');
    r = await viaUI(p, '#aMis', 1);
    const a1 = r.out.match(/не доехали (\d+) поездок из 100 против (\d+) при α = 2, а доехавшие тратят в среднем ([\d,]+) с против ([\d,]+)\. Фильтр менял команду на (\d+)% шагов/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a1 && a1[1] === '5' && a1[2] === '1' && a1[3] === '8,32' && a1[4] === '5,39' && a1[5] === '68', `миссия 1: α = 0,25 — не доехали ${a1 && a1[1]}, ${a1 && a1[3]} с, вмешательств ${a1 && a1[5]}%`);
    await show(p, 'alpha', '#alpha .lab', 'l82-alpha-cautious.png');
    await nextMission(p, '#aMis');
    r = await viaUI(p, '#aMis', 1);
    const a2 = r.out.match(/Касаний (\d+) — без фильтра их было (\d+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && a2 && a2[1] === '3' && a2[2] === '7' && /задела чайник/.test(await text(p, '#aOut')), `миссия 2: α = 16 — касаний ${a2 && a2[1]} против ${a2 && a2[2]} без фильтра, поездка 80 с касанием`);
    await show(p, 'alpha', '#alpha .lab', 'l82-alpha.png');
    await nextMission(p, '#aMis');
    check(await visible(p, '#wrapAAlpha'), 'миссия 3: ползунок α виден');
    await setRange(p, '#aAlpha', 3);
    r = await liveDone(p, '#aMis', 10000);
    check(r.ok && /α = 2: касаний нет, не доехали 1, в среднем 5,39 с/.test(r.out), 'миссия 3 засчитана сама: α = 2');
    await nextMission(p, '#aMis');

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    check(!(await visible(p, '#wrapHErr')) && !(await visible(p, '#wrapHMargin')) && !(await visible(p, '#wrapHBox')), 'миссия 1: настройки скрыты');
    await show(p, 'holes', '#holes .lab', 'l82-holes-empty.png');
    r = await viaUI(p, '#hMis', 1);
    const h1 = r.out.match(/Касаний (\d+) из 100; без фильтра с той же ошибкой — (\d+)/);
    check(r.ok && /ставка сыграла/i.test(r.out) && h1 && h1[1] === '5' && h1[2] === '8', `миссия 1: ошибка 10 см — касаний ${h1 && h1[1]} против ${h1 && h1[2]} без фильтра`);
    await show(p, 'holes', '#holes .lab', 'l82-holes-bias.png');
    await nextMission(p, '#hMis');
    check(await visible(p, '#wrapHMargin') && !(await visible(p, '#wrapHBox')), 'миссия 2: виден только выбор запаса');
    await seg(p, '#hMargin', 15);
    r = await liveDone(p, '#hMis', 10000);
    check(r.ok && /С запасом 15 см касаний нет, но не доехали 4 поездки из 100/.test(r.out), 'миссия 2 засчитана сама: запас 15 см, 4 недоезда');
    await nextMission(p, '#hMis');
    r = await viaUI(p, '#hMis', 1);
    const h3 = r.out.match(/задела корзину в (\d+) поездках из 100; без фильтра — в (\d+), и ещё (\d+) раз задела чайник/);
    check(r.ok && /ставка сыграла/i.test(r.out) && h3 && h3[1] === '27' && h3[2] === '24' && h3[3] === '6', `миссия 3: корзина не на карте — ${h3 && h3[1]} касаний (без фильтра ${h3 && h3[2]})`);
    await nextMission(p, '#hMis');
    r = await viaUI(p, '#hMis', 1);
    const h4 = r.out.match(/Касаний (\d+), но не доехал[аи] (\d+) поездк[аи]? из 100/);
    check(r.ok && /ставка сыграла/i.test(r.out) && h4 && h4[1] === '0' && h4[2] === '21', `миссия 4: корзина на карте — касаний ${h4 && h4[1]}, не доехали ${h4 && h4[2]}`);
    await show(p, 'holes', '#holes .lab', 'l82-holes.png');
    await nextMission(p, '#hMis');
    check(await visible(p, '#wrapHErr') && await visible(p, '#wrapHBox'), 'свободный режим: все настройки видны');
    check((await p.eval(`document.querySelectorAll('#hLog tbody tr').length`)) === 4, 'журнал: 4 серии');

    // ---------- тексты совпадают с движком ----------
    const X = J(await p.eval(`(async () => { const S = window.__l82.Store, E = L82, pol = await S.policy();
      const nof = S.batch({}), fil = S.batch({ filter: true }), hits = nof.trips.filter((q) => q.outcome === 'kettle');
      const slow = nof.trips.map((q, i) => ({ q, f: fil.trips[i], n: i + 1 })).filter((x) => x.q.outcome === 'kettle' && x.f.outcome === 'goal' && x.f.time > 10).map((x) => [x.n, x.f.time]);
      const stuck = fil.trips.map((q, i) => (q.outcome === 'stuck' ? i + 1 : 0)).filter(Boolean);
      const A = {}; for (const a of [0.25, 0.5, 1, 2, 4, 8, 16]) { const b = S.batch(a === 2 ? { filter: true } : { filter: true, alpha: a }); A[a] = { k: b.kettle, s: b.stuck, t: b.tMean, act: b.act }; }
      const H = (o) => S.batch(o), e10m5 = H({ filter: true, bias: { x: 0, y: -10 } }), e10 = H({ bias: { x: 0, y: -10 } }), e10m15 = H({ filter: true, bias: { x: 0, y: -10 }, margin: 15 }), e10m25 = H({ filter: true, bias: { x: 0, y: -10 }, margin: 25 }), e20m15 = H({ filter: true, bias: { x: 0, y: -20 }, margin: 15 }), e20 = H({ bias: { x: 0, y: -20 } });
      const bn = H({ box: true }), bf = H({ box: true, filter: true }), bk = H({ box: true, filter: true, boxKnown: true });
      return JSON.stringify({ demos: pol.demos.X.length, nofK: nof.kettle, dkMax: Math.max(...hits.map((q) => Math.abs(q.k.x - E.RX))), onRoute: nof.trips.filter((q) => Math.abs(q.k.x - E.RX) < E.RA + E.RK).length, nofT: nof.tMean, filK: fil.kettle, filT: fil.tMean, filAct: fil.act, filStuck: fil.stuck, slow, stuck, A,
        e10m5: e10m5.kettle + e10m5.box, e10: e10.kettle, e10m15: [e10m15.kettle, e10m15.stuck], e10m25: e10m25.stuck, e20m15: e20m15.kettle, e20: e20.kettle, bn: [bn.box, bn.kettle], bf: bf.box, bfK: bf.kettle, bk: [bk.kettle + bk.box, bk.stuck] }); })()`, true));
    const A = X.A, mid = [1, 2, 4].map((a) => A[a]), tmin = Math.min(...mid.map((x) => x.t)), tmax = Math.max(...mid.map((x) => x.t));
    check(Math.round(X.demos / 1000) === 16 && (await text(p, '#duel details.deep')).includes('около 16 тысяч пар'), `демонстраций: ${X.demos} пар — «около 16 тысяч»`);
    const da = await text(p, '#duelAfter');
    check(X.nofK === 7 && X.filK === 0 && X.slow.length === 2 && X.stuck.length === 1 && [`задела чайник в ${X.nofK} поездках из 100`, `в ${X.onRoute} поездках`, `все семь касаний`, `ближе ${r2(X.dkMax, 1)} см`, `${pct(X.filAct)}% шагов`, `с ${r2(X.nofT, 2)} до ${r2(X.filT, 2)} с`, `В поездках ${X.slow[0][0]} и ${X.slow[1][0]}`, `ехала ${r2(X.slow[0][1], 1)} и ${r2(X.slow[1][1], 1)} с`, `В поездке ${X.stuck[0]} она не доехала`].every((x) => da.includes(x)), 'инференс после лаборатории 1 называет те же числа');
    check((await text(p, '#dMis')).length > 0 && X.slow.length === 2, 'подсказка миссии 3: таких поездок две');
    const aa = await text(p, '#alphaAfter');
    check(mid.every((x) => x.k === 0 && x.s <= 1) && [`${pct(A[0.25].act)}% шагов`, `в среднем ${r2(A[0.25].t, 2)} с`, `${A[0.25].s} поездок не доезжают`, `касаний снова ${A[16].k}`, `чем ${X.nofK} без фильтра`, `${r2(tmin, 2)}–${r2(tmax, 2)} с`].every((x) => aa.includes(x)), 'инференс после лаборатории 2 называет те же числа');
    const ha = await text(p, '#holesAfter');
    check(X.e10m15[0] === 0 && X.filStuck === 1 && X.e20m15 === X.e20 && X.bk[0] === 0 && X.bfK === 0 && [`касаний ${X.e10m5} — без фильтра было бы ${X.e10}`, `не доезжают ${X.e10m15[1]} поездки вместо одной`, `касаний ${X.e20m15}, столько же`, `в ${X.bf} поездках — чаще, чем без фильтра (${X.bn[0]})`, `${X.bk[1]} поездка из 100`].every((x) => ha.includes(x)), 'инференс после лаборатории 3 называет те же числа');
    const fin = await text(p, '#finale .takeaways');
    check([`в ${X.nofK} поездках из 100`, `тратили ${r2(A[0.25].t, 2)} с вместо ${r2(X.filT, 2)}`, `${A[0.25].s} поездок не доехали`, `касаний снова ${A[16].k}`, `касаний ${X.e10m5}`, `задела ${X.bf} раз`, `${X.bk[1]} поездка из 100`].every((x) => fin.includes(x)) && bridge.includes(`${X.bk[1]} поездка из 100`), 'итоги и мост называют числа лабораторий');
    const lead = await text(p, '.hero .lead');
    check(lead.includes('0,4 мс') && lead.includes('BeagleBone Black'), 'шапка: Segway и 0,4 мс из статьи Ames и соавторов');
    // ---------- квиз, глоссарий, формулы, консоль ----------
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    const quiz = await p.eval(`document.getElementById('quizBox').textContent`).then(sp);
    const qNeed = [`все ${X.nofK} касаний`, `ближе ${r2(X.dkMax, 1)} см`, '30 см/с', `${A[0.25].s} поездок из 100 не доехали`, `${r2(A[0.25].t, 2)} с вместо ${r2(X.filT, 2)} с`, `касаний было ${A[16].k}`, `в ${X.bf} поездках из 100`, `(${X.bn[0]})`, `касаний чайника было ${X.e10m5}`, `${X.bk[1]} поездка из 100`, `не доехали ${X.e10m15[1]} поездки`, `уже ${X.e10m25}`, 'не доехала одна'];
    const qMiss = qNeed.filter((x) => !quiz.includes(x));
    check(!qMiss.length, 'квиз: числа в объяснениях совпадают с лабораториями' + (qMiss.length ? ' — нет: ' + qMiss.join(', ') : ''));
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 20 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(700);
    for (const [id, sel, n] of [['qp', '#qp .lab', 'l82-qp-dark.png'], ['duel', '#duel .lab', 'l82-duel-dark.png'], ['alpha', '#alpha .lab', 'l82-alpha-dark.png'], ['holes', '#holes .lab', 'l82-holes-dark.png'], ['why', '#why .flow-card', 'l82-loop-dark.png'], ['barrier', '#barrier .flow-card', 'l82-barrier-dark.png'], ['shield', '#shield .flow-card', 'l82-shield-dark.png'], ['limits', '#limits .num-table', 'l82-limits-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l82; await W.Duel.api.runNof(); await W.Duel.api.runFil(); W.Duel.api.select(79); await W.Alpha.api.cautious(); await W.Alpha.api.sharp(); W.Holes.api.setup(0, 5, 'known'); await W.Holes.api.run(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['why', '#why .flow-card', 'l82-m-loop.png'], ['barrier', '#barrier .flow-card', 'l82-m-barrier.png'], ['qp', '#qp .lab', 'l82-m-qp.png'], ['duel', '#duel .lab', 'l82-m-duel.png'], ['alpha', '#alpha .lab', 'l82-m-alpha.png'], ['shield', '#shield .flow-card', 'l82-m-shield.png'], ['holes', '#holes .lab', 'l82-m-holes.png'], ['limits', '#limits .num-table', 'l82-m-limits.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
