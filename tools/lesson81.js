// Урок 8.1 «Классические методы в контуре управления»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, числа в разборах и текстах совпадают с движком, схемы движутся, консоль чиста, телефон без
// горизонтальной прокрутки. Снимки — shots/l81-*.png. Урок собирается на дату выпуска:
//   MR_ASOF=2026-12-26 python3 lessons/build.py l81
// node tools/lesson81.js          — проверка в headless Chrome (компьютер 1280, телефон 390, тёмная тема);
// node tools/lesson81.js --seeds  — проверка в Node: выводы лабораторий на зёрнах 1–10 и диапазоны из «Под капотом».
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l81/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const r1 = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u00a0\u202f]/g, ' ').replace('\u2212', '-');

/* ---------- режим --seed N: одно зерно в Node — всё, о чём урок говорит «на десяти зёрнах» (JSON) ---------- */
if (process.argv.includes('--seed')) {
  const E = require('../lessons/l81/engine.js'), seed = +process.argv[process.argv.indexOf('--seed') + 1];
  const res = { seed, lab1: {}, lab2: {}, lab3: {} };
  const N = E.runGen(E.lab1Train(seed));
  for (const t of ['cups', 'sponges', 'push']) { const r = E.lab1Test(N, t); res.lab1[t] = { e2e: r.e2e, tgt: r.tgt }; }
  for (const n of E.LAB2.NS) { const ev = E.lab2Eval(E.runGen(E.lab2Train(seed, n))); res.lab2[n] = n ? { res: ev.res.ok, scr: ev.scr.ok } : { base: ev.base.ok, hits: ev.base.hits }; }
  const nets = E.runGen(E.lab3Train(seed));
  for (const P of ['cl', 'nn']) for (const G of ['cl', 'nn']) for (const T of ['cl', 'nn']) for (const C of ['cl', 'nn']) { const r = E.lab3Eval({ P, G, T, C }, nets); res.lab3[P + G + T + C] = { ok: r.ok, why: r.runs.map((q) => q.why), F: r.runs.map((q) => q.peak) }; }
  process.stdout.write(JSON.stringify(res));
} else if (process.argv.includes('--seeds')) {
/* ---------- режим --seeds: десять зёрен в Node, по процессу на зерно, не больше двух сразу ---------- */
  const { execFile } = require('child_process');
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], R = {};
  const runOne = (s) => new Promise((res, rej) => execFile(process.execPath, [__filename, '--seed', String(s)], { maxBuffer: 1 << 26 }, (e, so) => (e ? rej(e) : res(JSON.parse(so)))));
  (async () => {
    let i = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (i < seeds.length) { const s = seeds[i++]; R[s] = await runOne(s); const a = R[s].lab1; console.log(`зерно ${s}: чашки ${a.cups.e2e.ok}/${a.cups.tgt.ok}, толчок ${r1(a.push.e2e.peak, 0)}/${r1(a.push.tgt.peak, 0)} Н; поправка по 1 демонстрации ${R[s].lab2[1].res}, с нуля по 32 — ${R[s].lab2[32].scr}; лучшая раскладка ${R[s].lab3.nnnnclcl.ok} из 5`); } }));
    fs.writeFileSync(out('l81-seeds.json'), JSON.stringify(R));
    const S = seeds.map((s) => R[s]), mm = (f) => { const v = S.map(f); return [Math.min(...v), Math.max(...v)]; }, cnt = (f) => S.filter(f).length, txt = plain();
    // лаборатория 1
    const [c0, c1] = mm((x) => x.lab1.cups.tgt.ok), [e0, e1] = mm((x) => x.lab1.cups.e2e.ok);
    const [j0, j1] = mm((x) => x.lab1.cups.e2e.jitMed * 1000), [k0, k1] = mm((x) => x.lab1.cups.tgt.jitMed * 1000);
    const touchT = cnt((x) => x.lab1.sponges.tgt.touch > 0 || x.lab1.cups.tgt.touch > 0), touchE = cnt((x) => x.lab1.sponges.e2e.touch > 0);
    const [p0, p1] = mm((x) => x.lab1.push.e2e.peak), [q0, q1] = mm((x) => x.lab1.push.tgt.peak);
    console.log(`лаб. 1: чашки сеть-цель ${c0}–${c1}, сеть-моменты ${e0}–${e1}; дрожь ${r1(j0, 1)}–${r1(j1, 1)} / ${r1(k0, 1)}–${r1(k1, 1)} мм; касались стола: сеть-цель на ${touchT}, сеть-моменты на ${touchE}; толчок ${r1(p0, 0)}–${r1(p1, 0)} / ${r1(q0, 0)}–${r1(q1, 0)} Н`);
    check(txt.includes(`сеть-цель берёт ${c0}–${c1} чашек из пяти, сеть-моменты — ${e0}–${e1}`), 'лаборатория 1: число чашек на десяти зёрнах');
    check(txt.includes(`у сети-моменты — от ${r1(j0, 1)} до ${r1(j1, 1)} мм, у сети-цель — от ${r1(k0, 1)} до ${r1(k1, 1)} мм`), 'лаборатория 1: дрожь на десяти зёрнах');
    check(touchT === 0 && txt.includes('рука под сетью-цель не коснулась стола ни разу ни на одном зерне') && txt.includes(`под сетью-моменты касалась его на ${touchE} зёрнах из 10`), `лаборатория 1: касания стола (сеть-моменты на ${touchE} зёрнах)`);
    check(txt.includes(`с силой от ${r1(p0, 0)} до ${r1(p1, 0)} Н, регулятор под сетью-цель — от ${r1(q0, 0)} до ${r1(q1, 0)} Н`) && q1 <= 20 && p0 > 2 * q1, 'лаборатория 1: толчок к столу на десяти зёрнах');
    const [u0, u1] = mm((x) => x.lab1.push.tgt.resp), [w0, w1] = mm((x) => x.lab1.push.e2e.resp);
    console.log(`  ответ на толчок: регулятор ${r1(u0, 1)}–${r1(u1, 1)}, сеть-моменты ${r1(w0, 1)}–${r1(w1, 1)} Н·м`);
    check(txt.includes(`регулятор поднимал момент в плече на ${r1(u0, 1)}–${r1(u1, 1)} Н·м, сеть-моменты — на ${r1(w0, 1)}–${r1(w1, 1)} Н·м`) && w1 < u0, 'лаборатория 1: ответ на толчок на десяти зёрнах');
    // лаборатория 2
    const base0 = cnt((x) => x.lab2[0].base === 0), [a0, a1] = mm((x) => x.lab2[1].res), [b0, b1] = mm((x) => Math.min(...[2, 4, 8, 16, 32].map((n) => x.lab2[n].res))), [d0, d1] = mm((x) => x.lab2[1].scr), [f0, f1] = mm((x) => x.lab2[32].scr);
    console.log(`лаб. 2: регулятор 0 из 10 на ${base0}; поправка по 1 — ${a0}–${a1}, по 2+ — от ${b0}; с нуля по 1 — ${d0}–${d1}, по 32 — ${f0}–${f1}`);
    check(base0 === 10 && txt.includes('Регулятор без поправки не ставит ни одной кастрюли на любом зерне'), 'лаборатория 2: регулятор без поправки — ни одной на всех зёрнах');
    check(txt.includes(`по одной демонстрации встают от ${a0} до ${a1} кастрюль из 10, по двум и больше — от ${b0} до 10`) && txt.includes(`по одной демонстрации ставит от ${d0} до ${d1}, по 32 — от ${f0} до ${f1}`), 'лаборатория 2: диапазоны поправки и сети с нуля');
    // лаборатория 3
    const same = (key, ok, whys) => cnt((x) => x.lab3[key].ok === ok && x.lab3[key].why.join() === whys);
    const cl = same('clclclcl', 3, 'ok,notfound,miss,ok,ok'), nn = same('nnnnnnnn', 3, 'ok,ok,ok,hit,force'), best = same('nnnnclcl', 5, 'ok,ok,ok,ok,ok');
    const swaps = cnt((x) => x.lab3.clnnclcl.why[1] === 'notfound' && x.lab3.nnclclcl.why[2] === 'miss' && x.lab3.nnnnnncl.why[3] === 'hit' && x.lab3.nnnnclnn.why[4] === 'force' && [x.lab3.clnnclcl, x.lab3.nnclclcl, x.lab3.nnnnnncl, x.lab3.nnnnclnn].every((r) => r.ok === 4));
    const [g0, g1] = mm((x) => x.lab3.nnnnclnn.F[4]), [h0, h1] = mm((x) => x.lab3.nnnnclcl.F[4]);
    console.log(`лаб. 3: классика 3 из 5 на ${cl}, сети 3 из 5 на ${nn}, лучшая 5 из 5 на ${best}, замена одного слоя — одна сцена на ${swaps}; толчок: сеть ${r1(g0, 0)}–${r1(g1, 0)}, импеданс ${r1(h0, 0)}–${r1(h1, 0)} Н`);
    check(cl === 10 && nn === 10 && best === 10 && swaps === 10 && txt.includes('исход каждой раскладки на каждой сцене один и тот же'), 'лаборатория 3: исходы раскладок одинаковы на всех десяти зёрнах');
    check(txt.includes(`регулятор-сеть давит на стол с силой от ${r1(g0, 0)} до ${r1(g1, 0)} Н, импеданс — от ${r1(h0, 0)} до ${r1(h1, 0)} Н`), 'лаборатория 3: силы при толчке на десяти зёрнах');
    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
} else {
/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/8-1-klassika-v-konture.html');
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть критерии и разбор. */
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
  await p.waitFor(`[...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok') && !!document.querySelector('${mis} .g-out.m-win:not([hidden])')`, timeout || 60000).catch(() => {});
  return p.eval(`JSON.stringify({ ok: [...document.querySelectorAll('${mis} .m-crit li')].every((li) => li.className === 'ok'), out: (document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || '' })`).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
const has = (s, list) => list.filter((x) => !s.includes(x));
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^9 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 0.3: три вопроса');
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`)), l03 = fs.readFileSync(path.resolve(__dirname, '../lessons/l03/lesson.html'), 'utf8');
    const secOk = rec.q.every((q) => { const m = l03.match(new RegExp(`<section[^>]*id="${q.sec}"[^>]*>[\\s\\S]*?<h2>([^<]*)</h2>`)); return m && m[1].trim() === q.secTitle; });
    check(rec.href === '0-3-kinematika-i-upravlenie.html' && secOk, 'разминка: разделы и заголовки — настоящие в уроке 0.3');
    check(await p.eval(`!!document.querySelector('#finale .bridge a[href="8-2-bezopasnost.html"]')`) && /8\.2/.test(await text(p, '#finale .bridge')), 'мост в урок 8.2 со ссылкой');
    check((await p.eval(`L81.CFG.SEED`)) === 1, 'зерно лабораторий — 1');
    await p.eval(`window.__l81.SPEED.k = 6; document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const [id, sec, a, b] of [['loop81', 'why', 0.5, 3.1], ['resid81', 'residual', 1.0, 9.0], ['okrobot', 'systems', 0.5, 6.5]]) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${id}"]'); Anim.seek(cv, ${a}); const x = cv.toDataURL(); Anim.seek(cv, ${b}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${id} движется: кадры в ${a} и ${b} с разные`);
      await show(p, sec, `#${sec} .flow-card`, `l81-${id}.png`);
    }

    // ---------- лаборатория 1 ----------
    console.log('лаборатория 1');
    check(!(await visible(p, '#wrapATest')) && !(await visible(p, '#wrapAOwn')), 'миссия 1: выбор проверки и своя сцена скрыты');
    await show(p, 'target', '#target .lab', 'l81-target-empty.png');
    const t0 = Date.now();
    let r = await viaUI(p, '#aMis', 1);
    const E1 = J(await p.eval(`(() => { const E = L81, n = window.__l81.Lab1.st.nets, f = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }); const c = E.lab1Test(n, 'cups'), s = E.lab1Test(n, 'sponges'), p = E.lab1Test(n, 'push'), cups = n.demos.filter((d) => d.type === 'cup').length;
      return JSON.stringify({ c: { tOk: c.tgt.ok, tErr: f(c.tgt.err * 100, 1), tMax: f(c.tgt.errMax * 100, 1), tJit: f(c.tgt.jitMed * 1000, 1), eOk: c.e2e.ok, eErr: f(c.e2e.err * 100, 1), eJit: f(c.e2e.jitMed * 1000, 1) }, s: { eTouch: s.e2e.touch, tTouch: s.tgt.touch, ePeak: f(s.e2e.peak, 0), eOk: s.e2e.ok, tOk: s.tgt.ok }, p: { e: f(p.e2e.peak, 0), t: f(p.tgt.peak, 0), eBack: p.e2e.back, tBack: p.tgt.back, ratio: f(p.e2e.peak / Math.max(1, p.tgt.peak), 0), eResp: f(p.e2e.resp, 0), tResp: f(p.tgt.resp, 0) }, fit: { tau: f(n.fitErr.tau, 2), gx: f(n.fitErr.gx * 1000, 1), gy: f(n.fitErr.gy * 1000, 1) }, pairs: n.pairs, cups, nd: n.demos.length }); })()`));
    const c = E1.c, m1 = r.out.match(/Сеть-цель и классика: взяла (\d) из 5, промах в среднем ([\d,]+) см, дрожь у цели ([\d,]+) мм\. Сеть-моменты: (\d) из 5, промах ([\d,]+) см, дрожь ([\d,]+) мм/);
    check(r.ok && /Ставка сыграла/.test(r.out) && m1 && m1[1] === String(c.tOk) && m1[2] === sp(c.tErr) && m1[3] === sp(c.tJit) && m1[4] === String(c.eOk) && m1[5] === sp(c.eErr) && m1[6] === sp(c.eJit), `миссия 1 (${((Date.now() - t0) / 1000).toFixed(0)} с вместе с обучением): сеть-цель ${c.tOk} из 5, ${c.tErr} см, ${c.tJit} мм; сеть-моменты ${c.eOk} из 5, ${c.eErr} см, ${c.eJit} мм`);
    check(c.tOk > c.eOk && parseFloat(sp(c.eErr).replace(',', '.')) > 3 * parseFloat(sp(c.tErr).replace(',', '.')), 'сеть-цель берёт больше чашек и промахивается в разы меньше');
    const ta = await text(p, '#targetAfter'), deep1 = await text(p, '#target details.deep');
    check(!has(ta, [`в среднем на ${sp(c.tErr)} см`, `на ${sp(c.tMax)} см в стороне`, `${sp(c.tJit)} мм`, `промахнулась в среднем на ${sp(c.eErr)} см`, `дрожит у цели на ${sp(c.eJit)} мм`]).length, 'вывод после лаборатории 1: числа чашек совпадают с движком');
    check(!has(deep1, [`на ${sp(E1.fit.tau)} Н·м`, `на ${sp(E1.fit.gx)} мм по горизонтали и ${sp(E1.fit.gy)} мм по вертикали`, `всего 15 100 пар`, `${E1.cups} с чашкой, ${E1.nd - E1.cups} с губкой`]).length && E1.pairs === 15100 && E1.nd === 100, `«Под капотом»: ошибка на обучении ${E1.fit.tau} Н·м и ${E1.fit.gx}/${E1.fit.gy} мм, ${E1.pairs} пар`);
    await show(p, 'target', '#target .lab', 'l81-target-cups.png');
    await nextMission(p, '#aMis');
    r = await viaUI(p, '#aMis', 1);
    check(r.ok && /Ставка сыграла/.test(r.out) && r.out.includes(`ни разу не коснулась стола и взяла ${E1.s.tOk} губок из 5`) && r.out.includes(`коснулась стола в ${E1.s.eTouch} прогонах из 5, сильнее всего — ${sp(E1.s.ePeak)} Н`), `миссия 2: губки — регулятор не коснулся стола, сеть-моменты коснулась в ${E1.s.eTouch} прогонах, до ${E1.s.ePeak} Н`);
    check(E1.s.eTouch === 3 && E1.s.tTouch === 0 && ta.includes('у губок трижды коснулась стола') && ta.includes('ни разу не коснулась стола у губок'), 'вывод после лаборатории 1: касания стола совпадают');
    await nextMission(p, '#aMis');
    r = await viaUI(p, '#aMis', 1);
    check(r.ok && /Ставка сыграла/.test(r.out) && r.out.includes(`с силой ${sp(E1.p.t)} Н`) && r.out.includes(`с силой ${sp(E1.p.e)} Н — в ${sp(E1.p.ratio)} раз сильнее`), `миссия 3: толчок — регулятор ${E1.p.t} Н, сеть-моменты ${E1.p.e} Н`);
    check(E1.p.tBack < 0.015 && E1.p.eBack > 0.015 && ta.includes(`с силой ${sp(E1.p.t)} Н и вернула его к чашке`) && ta.includes(`с силой ${sp(E1.p.e)} Н и так и не вернулась`), 'вывод после лаборатории 1: толчок совпадает с движком');
    check(r.out.includes(`поднял момент в плече на ${sp(E1.p.tResp)} Н·м`) && r.out.includes(`лишь на ${sp(E1.p.eResp)} Н·м`) && ta.includes(`сразу вырос на ${sp(E1.p.tResp)} Н·м`) && ta.includes(`лишь на ${sp(E1.p.eResp)} Н·м`), `ответ на толчок: регулятор +${E1.p.tResp} Н·м, сеть-моменты +${E1.p.eResp} Н·м — в разборе и в выводе`);
    await show(p, 'target', '#target .lab', 'l81-target-push.png');
    await nextMission(p, '#aMis');
    check(await visible(p, '#wrapATest') && await visible(p, '#wrapAOwn'), 'свободный режим: проверки и своя сцена видны');
    const own = J(await p.eval(`(async () => { const L = window.__l81.Lab1; L.st.own = { type: 'cup', x: 0.7, push: true }; const r = await L.api.runTest('own'); return JSON.stringify({ n: r.n, e: r.e2e.peak, t: r.tgt.peak }); })()`, true));
    check(own.n === 1 && own.t <= 20 && own.e > 2 * own.t, `свободный режим: своя сцена (чашка в 70 см и толчок) — сеть-моменты ${r1(own.e, 0)} Н, регулятор ${r1(own.t, 0)} Н`);
    await show(p, 'target', '#target .lab', 'l81-target-own.png');

    // ---------- лаборатория 2 ----------
    console.log('лаборатория 2');
    check(!(await visible(p, '#wrapBN')) && !(await visible(p, '#wrapBShow')), 'миссии 1–2: ползунок и выбор сцены скрыты');
    await show(p, 'residual', '#residual .lab', 'l81-residual-empty.png');
    r = await viaUI(p, '#bMis', 2);
    check(r.ok && /Ставка сыграла/.test(r.out) && /Ни одна кастрюля не встала: все 10 задели край полки, через 1,5 с/.test(r.out), 'миссия 1: регулятор без веса — 0 из 10, все задели край через 1,5 с');
    await nextMission(p, '#bMis');
    r = await viaUI(p, '#bMis', 1);
    const E2 = J(await p.eval(`(() => { const E = L81, ev = (n) => E.lab2Eval(E.runGen(E.lab2Train(1, n))); const a = window.__l81.Lab2.st.cache[1].ev, b = ev(2), d = ev(32), f = (v) => (+v * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return JSON.stringify({ res1: a.res.ok, scr1: a.scr.ok, miss: a.res.runs.filter((q) => !q.ok).map((q) => f(q.dx)), res2: b.res.ok, scr32: d.scr.ok, res32: d.res.ok, share: a.res.resShare }); })()`, true));
    check(r.ok && /Ставка сыграла/.test(r.out) && r.out.includes(`встали ${E2.res1} кастрюль из 10`) && r.out.includes(`в ${E2.miss.map(sp).join(' и ')} см от нужного места`) && r.out.includes(`Сеть с нуля поставила ${E2.scr1} из 10`), `миссия 2: одна демонстрация — поправка ${E2.res1} из 10 (мимо на ${E2.miss.join(' и ')} см), сеть с нуля ${E2.scr1}`);
    const ra = await text(p, '#residAfter');
    check(!has(ra, ['во всех десяти проверках', 'через 1,5 с', `на полку встали ${E2.res1} кастрюль из 10`, `в ${E2.miss.map(sp).join(' и ')} см`, `по двум демонстрациям — все ${E2.res2}`, `не поставила ни одной`, `а по 32 — только ${E2.scr32} из 10`]).length && E2.scr1 === 0 && E2.res2 === 10, `вывод после лаборатории 2: числа совпадают (по 2 — ${E2.res2}, с нуля по 32 — ${E2.scr32})`);
    await show(p, 'residual', '#residual .lab', 'l81-residual-one.png');
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBN') && await visible(p, '#wrapBShow'), 'миссия 3: ползунок числа демонстраций виден');
    await p.eval(`(() => { const i = document.getElementById('bN'); i.value = 6; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(300); await p.waitFor(`!window.__l81.Lab2.st.busy && window.__l81.Lab2.st.frame == null && !!window.__l81.Lab2.st.cache[32]`, 120000);
    r = await liveDone(p, '#bMis', 30000);
    check(r.ok && r.out.includes(`понадобилось 32 демонстрации, чтобы поставить 5 кастрюль из 10`), 'миссия 3 засчитана сама: ' + r.out.slice(0, 90));
    await show(p, 'residual', '#residual .lab', 'l81-residual-32.png');
    await nextMission(p, '#bMis');

    // ---------- лаборатория 3 ----------
    console.log('лаборатория 3');
    await show(p, 'layers', '#layers .lab', 'l81-layers-empty.png');
    r = await viaUI(p, '#cMis', 1);
    check(r.ok && /Ставка сыграла/.test(r.out) && r.out.includes('Классика прошла 3 сцены из 5') && r.out.includes('«Высокая кружка» — восприятие не нашло') && /«Миска» — захват встал в [\d,]+ см от нужной точки/.test(r.out), 'миссия 1: классика — 3 из 5, не нашла кружку, промахнулась мимо миски');
    await nextMission(p, '#cMis');
    r = await viaUI(p, '#cMis', 2);
    const F3 = await p.eval(`(() => { const r = window.__l81.Lab3.st.res.nnnnnnnn; return (+r.runs[4].peak).toLocaleString('ru-RU', { maximumFractionDigits: 0 }); })()`);
    check(r.ok && /Ставка сыграла/.test(r.out) && r.out.includes('Сети прошли 3 сцены из 5') && r.out.includes('«Ваза на пути» — рука задела вазу') && r.out.includes(`«Толчок к столу» — стол давил на захват с силой ${sp(F3)} Н`), `миссия 2: сети — 3 из 5, задели вазу, толчок ${F3} Н`);
    const la = await text(p, '#layersAfter');
    check(la.includes(`ударила по столу с силой ${sp(F3)} Н`), 'вывод после лаборатории 3: сила при толчке совпадает');
    await show(p, 'layers', '#layers .lab', 'l81-layers-nn.png');
    await nextMission(p, '#cMis');
    for (const k of ['T', 'C']) await p.eval(`(() => { const b = document.querySelector('#cBoard .l-chip[data-k="${k}"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 })); return true; })()`);
    const cfg = J(await p.eval(`JSON.stringify(window.__l81.Lab3.st.cfg)`));
    check(cfg.P === 'nn' && cfg.G === 'nn' && cfg.T === 'cl' && cfg.C === 'cl', 'миссия 3: путь и регулятор перенесены в классику нажатием');
    r = await viaUI(p, '#cMis');
    check(r.ok && r.out.includes('восприятие — сеть, выбор захвата — сеть, путь — классика, регулятор — классика'), 'миссия 3: лучшая раскладка проходит все пять сцен');
    await show(p, 'layers', '#layers .lab', 'l81-layers-best.png');
    await nextMission(p, '#cMis');

    // ---------- тексты, квиз, глоссарий, формулы, консоль ----------
    const fin = await text(p, '#takeaways');
    check(!has(fin, [`на ${sp(c.tErr)} и ${sp(c.eErr)} см`, `с силой ${sp(E1.p.t)} Н`, `${sp(E1.p.e)} Н`, `${E2.res1} кастрюль из 10`, '58,5%', '82,4%', '100% против 42%', '71% против 60%']).length, 'итоги урока называют числа лабораторий и статей');
    const lead = await text(p, '.hero .lead');
    check(['58,5%', '82,4%', '15 попытках из 20', 'в 2'].every((x) => lead.includes(x)), 'шапка: числа OK-Robot и остаточного обучения');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    const quiz = await p.eval(`document.getElementById('quizBox').textContent`).then(sp);
    const qMiss = [`${sp(c.tErr)} см`, `${sp(c.tJit)} мм`, `${sp(c.eErr)} см`, `${sp(c.eJit)} мм`, `${E2.res1} кастрюль из 10`, `только ${E2.scr32}`, '15 попытках из 20', '100%', '42%', '71% против 60%'].filter((x) => !quiz.includes(x));
    check(!qMiss.length, 'квиз: числа в объяснениях совпадают с лабораториями' + (qMiss.length ? ' — нет: ' + qMiss.join(', ') : ''));
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(700);
    for (const [id, sel, n] of [['target', '#target .lab', 'l81-target-dark.png'], ['residual', '#residual .lab', 'l81-residual-dark.png'], ['layers', '#layers .lab', 'l81-layers-dark.png'], ['why', '#why .flow-card', 'l81-loop81-dark.png'], ['residual', '#residual .flow-card', 'l81-resid81-dark.png'], ['systems', '#systems .flow-card', 'l81-okrobot-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`window.__l81.SPEED.k = 50; document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(async () => { const W = window.__l81; await W.Lab1.api.runTest('push'); await W.Lab2.api.go(1, 'res'); W.Lab3.api.setCfg({ P: 'nn', G: 'nn', T: 'nn', C: 'cl' }); await W.Lab3.api.run(); return true; })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    const narrowAnim = await m.eval(`[...document.querySelectorAll('canvas[data-anim]')].map((c) => c.dataset.layout).join(',')`);
    check(narrowAnim === 'n,n,n', 'на телефоне схемы в узкой раскладке: ' + narrowAnim);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(400);
    for (const [id, sel, n] of [['why', '#why .flow-card', 'l81-m-loop81.png'], ['target', '#target .lab', 'l81-m-target.png'], ['residual', '#residual .flow-card', 'l81-m-resid81.png'], ['residual', '#residual .lab', 'l81-m-residual.png'], ['systems', '#systems .flow-card', 'l81-m-okrobot.png'], ['layers', '#layers .lab', 'l81-m-layers.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
