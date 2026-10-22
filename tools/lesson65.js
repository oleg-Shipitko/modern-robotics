// Урок 6.5 «Аппаратная часть гуманоида»: лаборатория даёт обещанные в тексте числа, миссии проходятся через интерфейс,
// числа в разборах и текстах совпадают с движком, Ада нарисована общим рисунком (shared/ada-legs.js), подписи схем и
// канвасов помещаются и не мельче 10 px, схемы движутся, диаграммы построены, консоль чиста, телефон без прокрутки вбок.
// Снимки — shots/l65-*.png. Урок собирается на дату выпуска: MR_ASOF=2026-11-07 python3 lessons/build.py l65.
// node tools/lesson65.js            — проверка в headless Chrome (компьютер 1440, телефон 390, тёмная тема);
// node tools/lesson65.js --numbers  — числа лаборатории в Node, для сверки с текстами;
// node tools/lesson65.js --check    — утверждения урока на всех 720 сочетаниях частей (без браузера).
const path = require('path');
const fs = require('fs');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
const sp = (s) => String(s).replace(/[  ]/g, ' ').replace(/−/g, '-');
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };
const LESSON = path.resolve(__dirname, '../lessons/l65/lesson.html');
const plain = () => sp(fs.readFileSync(LESSON, 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fr = (v, d) => sp((+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const f0 = (v) => fr(v, 0), f1 = (v) => fr(v, 1), f2 = (v) => fr(v, 2);
const E = require('../lessons/l65/engine.js');
// слова о расположении на экране: в подписях и текстах лабораторий говорим о ролях (на телефоне раскладка другая);
// «верхний уровень» и «нижний уровень» — уровни иерархии управления, а не места на экране
const POS0 = /(^|[^а-яё])(слева|справа|сверху|снизу|левая|правая|левой|правой|левую|правую|левые|правые|верхн[а-яё]+|нижн[а-яё]+)(?![а-яё])/i;
const noHier = (s) => String(s).replace(/(верхн|нижн)[а-яё]+ уров[а-яё]+/gi, 'уровень');
const POS = { test: (s) => POS0.test(noHier(s)) };
const posWord = (s) => { const m = noHier(s).match(POS0); return m ? m[2] : ''; };
const missing = (s, list) => list.filter((x) => !s.includes(sp(x)));
const cfg = (o) => Object.assign({}, E.DEFAULT, o || {});
/* ---------- конфигурации миссий: те же, что проходит читатель ---------- */
const M = {
  m1: cfg(), m2: cfg({ arms: '8513' }), m3: cfg({ arms: '8513', legs: '8518' }),
  m4a: cfg({ arms: '8513', legs: '8518', hands: 'shadow' }), m4b: cfg({ arms: '8518', legs: '8518', hands: 'shadow' }), m4: cfg({ arms: '8518', legs: '10413', hands: 'shadow' }),
  m5: cfg({ arms: '8513', legs: '8518', comp: 'thor' }), m6: cfg({ arms: '8513', legs: '8518', comp: 'thor', batt: 'h1' }), m6f: cfg({ arms: '8513', legs: '8518', comp: 'thor', batt: 'f3' }), m6f10: cfg({ arms: '8513', legs: '10413', comp: 'thor', batt: 'f3' }),
};
const R = {}; for (const k of Object.keys(M)) R[k] = E.compute(M[k]);
/** Утверждения урока обо всех сочетаниях частей. */
function claims() {
  const all = E.allConfigs(), res = {};
  const ratio = all.filter((c) => c.batt === 'g1').map((c) => E.compute(cfg(Object.assign({}, c, { batt: 'h1' }))).hours / E.compute(c).hours);
  res.h1 = [Math.min(...ratio), Math.max(...ratio)];
  const drop = all.filter((c) => c.comp === 'nx').map((c) => 1 - E.compute(cfg(Object.assign({}, c, { comp: 'thor' }))).hours / E.compute(c).hours);
  res.thor = [Math.min(...drop), Math.max(...drop)];
  res.minArm = Object.fromEntries(E.HAND_ORDER.map((h) => { const r = E.compute(cfg({ hands: h })); return [h, E.minAct(r.arm.peakNeed, r.arm.sustNeed)]; }));
  const f3 = all.filter((c) => c.batt === 'f3'), f3ok = f3.filter((c) => E.compute(c).checks.legs);
  res.f3 = [f3ok.length, f3.length, f3ok.every((c) => c.arms === '5013' && c.legs === '10413') && !f3.some((c) => E.compute(c).checks.all)];
  let best = null; for (const c of all) { const r = E.compute(c); if (r.checks.all && c.comp === 'thor' && (!best || r.mass.total < best.mass.total)) best = r; }
  res.best = best; res.n = all.length;
  return res;
}
if (process.argv.includes('--numbers')) {
  for (const [k, r] of Object.entries(R)) console.log(k, JSON.stringify(r.cfg), `масса ${f1(r.mass.total)} (+груз ${f1(r.mass.withLoad)}) | плечо ${f1(r.arm.peakNeed)}/${f1(r.arm.sustNeed)} есть ${r.arm.peak}/${r.arm.sust} | колено ${f1(r.knee.peakNeed)}/${f1(r.knee.sustNeed)} есть ${r.knee.peak}/${r.knee.sust} | P ${f0(r.power.walk)}/${f0(r.power.idle)}/${f0(r.power.avg)} пик ${f0(r.power.peak)} | ${f2(r.hours)} ч | ${r.binding}`);
  const C = claims(); console.log('h1/g1', C.h1.map((x) => x.toFixed(3)).join('–'), '| Thor', C.thor.map((x) => (x * 100).toFixed(1)).join('–'), '% | мин. привод руки', JSON.stringify(C.minArm), '| f3 ноги ✓', C.f3[0], 'из', C.f3[1], '| лучшая с Thor', JSON.stringify(C.best.cfg), f1(C.best.mass.total), f2(C.best.hours));
} else if (process.argv.includes('--check')) {
  const C = claims(), txt = plain();
  check(C.n === 720, `сочетаний частей: ${C.n}`);
  check(C.h1[0] > 1.5 && C.h1[1] < 2, `батарея как у H1 вместо как у G1: время в ${C.h1[0].toFixed(2)}–${C.h1[1].toFixed(2)} раза больше на всех сочетаниях (текст: в 1,5–2 раза, но не вдвое)`);
  check(C.thor[0] >= 0.30 && C.thor[1] <= 0.45, `Thor вместо Orin NX: время падает на ${(C.thor[0] * 100).toFixed(1)}–${(C.thor[1] * 100).toFixed(1)} % (текст: на 31–44 %)`);
  check(txt.includes('на 31–44 %') && Math.round(C.thor[0] * 100) === 31 && Math.round(C.thor[1] * 100) === 44, '«Под капотом» называет те же проценты падения времени с Thor');
  check(C.minArm.shadow === '8518' && ['inspire', 'leap', 'allegro', 'sharpa'].every((h) => C.minArm[h] === '8513'), `кисти Shadow требуют в руках не меньше 8518, остальные обходятся 8513: ${JSON.stringify(C.minArm)}`);
  check(C.f3[0] === 12 && C.f3[1] === 240 && C.f3[2], `батарея 2,3 кВт·ч оставляет ногам запас только в ${C.f3[0]} сочетаниях из ${C.f3[1]}, все с руками 5013 и ногами 10413; ни одно сочетание с ней задачу не выполняет`);
  check(txt.includes(`только в ${C.f3[0]} сочетаниях из ${C.f3[1]}`), '«Под капотом» называет то же число сочетаний');
  check(C.best && JSON.stringify(C.best.cfg) === JSON.stringify(M.m6) && txt.includes(`весит ${f1(C.best.mass.total)} кг и работает ${f1(C.best.hours)} ч`), `самая лёгкая Ада с VLA на борту — ${JSON.stringify(C.best.cfg)}: ${f1(C.best.mass.total)} кг, ${f1(C.best.hours)} ч, как в тексте`);
  // модель Ады: 28 кг как в 6.1, ноги по 5 кг
  check(Math.abs(R.m1.mass.total - 28) < 0.05 && Math.abs(R.m1.mass.legs - 10) < 0.1, `Ада по умолчанию весит ${f2(R.m1.mass.total)} кг (28 как в 6.1), ноги ${f2(R.m1.mass.legs)} кг`);
  check(R.m1.binding === 'arms' && !R.m1.checks.legs && R.m1.checks.time, 'Ада 6.1 с коробкой: упирается в руки, ноги тоже на пределе, двух часов хватает');
  check(R.m2.binding === 'legs' && R.m3.checks.all && R.m4a.binding === 'arms' && R.m4b.binding === 'legs' && R.m4.checks.all && R.m5.binding === 'time' && R.m6.checks.all && !R.m6f.checks.legs && !R.m6f10.checks.legs, 'цепочка миссий: руки → ноги → всё ✓; Shadow: руки → ноги → всё ✓ на 10413; Thor → время; H1 ✓; Figure 03 — ноги ✗ даже с 10413');
  finish();
} else {

/* ---------- проверка в браузере ---------- */
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/6-5-apparatnaya-chast.html');
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 2000 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent.replace(/\\s+/g, ' ')`).then(sp);
const visible = (p, sel) => p.eval(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })()`);
const seg = (p, sel, v) => p.eval(`(() => { document.querySelector('${sel} button[data-v="${v}"]').click(); return true; })()`);
const show = async (p, id, sel, file, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(file), sel, pad == null ? 6 : pad); };
/** Подписи схемы: в канвасе, без наложений, не мельче 10 px на экране и внутри своего блока (наименьший скруглённый прямоугольник вокруг центра подписи). */
async function schemeLabels(p, kind, frames) {
  await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); if (cv) cv.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(250);
  return J(await p.eval(`(() => {
    const cv = document.querySelector('canvas[data-anim=${kind}]'); if (!cv || typeof Anim === 'undefined') return JSON.stringify({ none: true, bad: [] });
    const Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, oR = Pr.roundRect, bad = new Set(), texts = new Set(), prints = new Set();
    let rects = null, boxes = null, minPx = 99;
    Pr.roundRect = function (x, y, w, h) { if (rects && this.canvas === cv) { const t = this.getTransform(); rects.push([x * t.a + t.e, y * t.d + t.f, w * t.a, h * t.d]); } return oR.apply(this, arguments); };
    Pr.fillText = function (txt, x, y) {
      if (boxes && this.canvas === cv) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign;
        const X = x * t.a + t.e, Y = y * t.d + t.f, W = m.width * t.a, x0 = a === 'center' ? X - W / 2 : a === 'right' ? X - W : X; boxes.push({ t: String(txt), x0, x1: x0 + W, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, cy: Y, fs: fs * t.a }); }
      return oT.apply(this, arguments);
    };
    for (const t of ${JSON.stringify(frames)}) {
      rects = []; boxes = []; Anim.seek(cv, t); const Rr = rects, b = boxes; rects = boxes = null;
      { const d = cv.toDataURL(); let hh = 0; for (let i = 0; i < d.length; i += 7) hh = (hh * 31 + d.charCodeAt(i)) >>> 0; prints.add(hh); }
      const Wc = cv.width, Hc = cv.height, dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of b) {
        texts.add(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px;
        if (px < 9.95) bad.add('мельче 10 px: «' + q.t + '» ' + px.toFixed(1));
        if (q.x0 < 1 || q.x1 > Wc - 1 || q.y0 < 0 || q.y1 > Hc) bad.add('за краем: «' + q.t + '»');
        const cx = (q.x0 + q.x1) / 2, own = Rr.filter(([x, y, w, h]) => cx >= x && cx <= x + w && q.cy >= y && q.cy <= y + h).sort((u, v) => u[2] * u[3] - v[2] * v[3])[0];
        if (own && (q.x0 < own[0] + 2 || q.x1 > own[0] + own[2] - 2)) bad.add('шире блока: «' + q.t + '»');
      }
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const ox = Math.min(b[i].x1, b[j].x1) - Math.max(b[i].x0, b[j].x0), oy = Math.min(b[i].y1, b[j].y1) - Math.max(b[i].y0, b[j].y0); if (ox > 1 && oy > 1) bad.add('«' + b[i].t + '» на «' + b[j].t + '»'); }
    }
    Pr.fillText = oT; Pr.roundRect = oR;
    return JSON.stringify({ layout: cv.dataset.layout, bad: [...bad], texts: [...texts], minPx, distinct: prints.size });
  })()`));
}
/** Подписи канвасов лаборатории и рисунка частей во всех состояниях: не мельче 10 px, внутри канваса, без наложений. */
async function labLabels(p) {
  return J(await p.eval(`(() => {
    const W = window.__l65, Pr = CanvasRenderingContext2D.prototype, oT = Pr.fillText, bad = new Set(), texts = []; let minPx = 99, cur = null, boxes = [];
    Pr.fillText = function (txt, x, y) { if (cur && this.canvas === cur) { const t = this.getTransform(), m = this.measureText(txt), fs = parseFloat(/([\\d.]+)px/.exec(this.font)[1]), a = this.textAlign; const X = x * t.a + t.e, Y = y * t.d + t.f, Wt = m.width * t.a, x0 = a === 'center' ? X - Wt / 2 : a === 'right' ? X - Wt : X; boxes.push({ t: String(txt), x0, x1: x0 + Wt, y0: Y - fs * t.d / 2, y1: Y + fs * t.d / 2, fs: fs * t.a }); } return oT.apply(this, arguments); };
    const chk = (id, name, draw) => {
      const cv = document.getElementById(id); cur = cv; boxes = []; draw(); cur = null; const dpr = cv.width / cv.getBoundingClientRect().width;
      for (const q of boxes) { texts.push(q.t); const px = q.fs / dpr; if (px < minPx) minPx = px; if (px < 9.95) bad.add(name + ': мельче 10 px «' + q.t + '»'); if (q.x0 < 0 || q.x1 > cv.width || q.y0 < 0 || q.y1 > cv.height) bad.add(name + ': за краем «' + q.t + '»'); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ox > 1 && oy > 1) bad.add(name + ': «' + a.t + '» на «' + b.t + '»'); }
    };
    const B = W.Budget, st = B.st, keep = { cfg: Object.assign({}, st.cfg), pinned: Object.assign({}, st.pinned), pinnedName: st.pinnedName, shown: st.shown, res: st.res, pinRes: st.pinRes };
    st.shown = false; chk('bCv', 'бюджет до миссии', () => B.api.drawScene());
    const E = W.L65, confs = [E.DEFAULT, { arms: '8513' }, { arms: '8513', legs: '8518' }, { arms: '8518', legs: '10413', hands: 'shadow' }, { arms: '8513', legs: '8518', comp: 'thor' }, { arms: '8513', legs: '8518', comp: 'thor', batt: 'h1' }, { arms: '8513', legs: '10413', comp: 'thor', batt: 'f3', hands: 'shadow' }];
    let prev = E.DEFAULT;
    for (const c of confs) { st.pinned = Object.assign({}, E.DEFAULT, prev); st.pinnedName = 'после миссии 3'; st.pinRes = E.compute(st.pinned); st.cfg = Object.assign({}, E.DEFAULT, c); st.res = E.compute(st.cfg); st.shown = true; chk('bCv', 'бюджет ' + JSON.stringify(c), () => B.api.drawScene()); prev = c; }
    Object.assign(st, keep); B.api.render();
    if (document.getElementById('partsCv')) { chk('partsCv', 'части Ады', () => window.dispatchEvent(new Event('resize'))); }
    Pr.fillText = oT;
    return JSON.stringify({ bad: [...bad], minPx, texts });
  })()`));
}
const FRAMES = { drive: [0.4, 1.2, 2.0, 2.45, 2.7, 3.5], hand: [0.2, 0.7, 1.2, 1.5, 2.0, 2.6] };
const lessonsDir = path.resolve(__dirname, '../lessons');
(async () => {
  const B = await launch({ w: 1460, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1440, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    const hero = await p.eval(`document.getElementById('heroMis').textContent`);
    check(/^6 миссий с целью$/.test(hero), 'число миссий в шапке: ' + hero);
    // разминка по 6.4: разделы и их названия — как в уроке 6.4
    const rec = J(await p.eval(`document.getElementById('recallData').textContent`));
    const l64 = fs.readFileSync(path.join(lessonsDir, 'l64/lesson.html'), 'utf8'), h2of = (id) => { const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`).exec(l64); return m ? m[1].replace(/<[^>]+>/g, '').trim() : null; };
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3 && rec.n === '6.4' && rec.q.every((q) => h2of(q.sec) === q.secTitle), 'разминка по уроку 6.4: три вопроса, разделы и названия совпадают с h2 урока 6.4: ' + rec.q.map((q) => q.sec).join(', '));
    const lead = await text(p, '.hero .lead');
    check(/^В уроке 6\.4 Ада носила чашку по командам модели верхнего уровня/.test(lead) && ['TWIST', 'HumanPlus', 'Figure 02', 'Berkeley', 'Digit 360'].every((x) => lead.includes(x) || plain().includes(x)), 'шапка подхватывает мост из 6.4 и называет работы урока');
    const l64bridge = /<div class="bridge-note"><p>([\s\S]*?)<\/p>/.exec(l64)[1].replace(/<[^>]+>/g, '');
    check(/через 5–10 минут/.test(l64bridge) && lead.includes('через 5–10 минут') && /голеностоп/.test(l64bridge) && lead.includes('голеностоп'), 'начало урока отвечает на мост 6.4: перегрев моторов за 5–10 минут и голеностоп с одной степенью свободы');
    const note = await text(p, '#body .ada-note');
    check(/Ада — домашний гуманоид курса; с урока 6\.1 у неё ноги/.test(note) && await p.eval(`!!document.querySelector('#body .ada-note a[href="0-1-dve-paradigmy.html#ada"]')`), 'заметка об Аде при первом упоминании: с урока 6.1 у неё ноги, ссылка на 0.1');
    const bn = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.bridge-note')].map((b) => ({ t: b.textContent.trim(), last: !b.nextElementSibling, sec: b.closest('section').id, a: b.querySelector('.bridge-to a') && b.querySelector('.bridge-to a').getAttribute('href') })))`));
    check(bn.length === 1 && bn[0].sec === 'finale' && bn[0].last && /Урок 6\.6 · Обзор гуманоидных платформ: как /.test(bn[0].t) && /\$13 500/.test(bn[0].t) && bn[0].a === '6-6-obzor-platform.html', 'мост в конце урока: ' + bn.map((b) => `${b.sec} «${b.t.slice(0, 90)}…» → ${b.a || 'без ссылки'}`).join('; '));
    check(!(await p.eval(`!!document.querySelector('.callout.bridge')`)), 'старой плашки «Дальше» нет');
    check(!(await p.eval(`/учител|подзадач|[^а-яё]мод(а|ы|у|ой)[^а-яё]/i.test(document.querySelector('main').innerText)`)), 'слов «учитель», «подзадача», «мода» в уроке нет (ложных подсказок глоссария не будет)');
    check(await p.eval(`typeof AdaBody !== 'undefined' && typeof AdaBody.front === 'function' && AdaBody.BODY.LT === 0.46 && AdaBody.BODY.L1 === 0.3`), 'Ада рисуется AdaBody из shared/ada-legs.js (размеры как в 6.1)');
    await p.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);

    // ---------- схемы ----------
    for (const kind of ['drive', 'hand']) {
      const moved = await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim="${kind}"]'); Anim.seek(cv, 0.3); const x = cv.toDataURL(); Anim.seek(cv, ${kind === 'drive' ? 2.45 : 1.5}); return x !== cv.toDataURL(); })()`);
      check(moved, `схема ${kind} движется: кадры в разные моменты разные`);
      const sl = await schemeLabels(p, kind, FRAMES[kind]);
      check(!sl.none && sl.layout === 'w' && !sl.bad.length && sl.distinct === FRAMES[kind].length, `схема ${kind} (широкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sl.minPx && sl.minPx.toFixed(1)}), в своих блоках` + (sl.bad.length ? ': ' + sl.bad.slice(0, 4).join('; ') : ''));
      check(!sl.texts.some((x) => POS.test(x)), `схема ${kind}: в подписях нет слов о расположении`);
    }
    const dtxt = (await schemeLabels(p, 'drive', [2.45])).texts.join(' ');
    check(/×3,7/.test(dtxt) && /×1,0/.test(dtxt) && /0,0043/.test(dtxt) && /1,2 кг·м²/.test(dtxt), 'схема drive называет пик удара ×1,0 и ×3,7 и инерцию 0,0043 и 1,2 кг·м², как в тексте и в лаборатории 0.2');
    check(Math.abs(Math.sqrt((0.09 + 1e4 * 1.2e-4) / (0.09 + 36 * 1.2e-4)) - 3.7) < 0.05, 'пик удара ×3,7 следует из модели 0.2: корень из отношения эффективных инерций');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="drive"]'), 2.5); true`); await show(p, 'drive', '#drive .flow-card', 'l65-drive.png');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="hand"]'), 1.5); true`); await show(p, 'hands', '#hands .flow-card', 'l65-hand.png');
    const caps = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.cv-note, figcaption, .lab-intro, .stat-cap')].map((e) => e.textContent.replace(/\\s+/g, ' ')))`));
    const capBad = caps.filter((x) => POS.test(x));
    check(!capBad.length, 'подписи сцен, схем, диаграмм и вступление лаборатории — по ролям, без «слева/справа/сверху/снизу»' + (capBad.length ? ': ' + capBad.map(posWord).join(', ') : ''));
    const misTxt = J(await p.eval(`JSON.stringify(window.__l65.Budget.missions.flatMap((m) => [m.title, m.text, m.bet && m.bet.q, ...(m.bet ? m.bet.options : []), ...(m.criteria || []).map((c) => c.label)]).filter(Boolean))`));
    const misBad = misTxt.filter((x) => POS.test(x) || /@@/.test(x));
    check(!misBad.length, `тексты миссий (${misTxt.length} строк) по ролям и без заглушек` + (misBad.length ? ': ' + misBad.slice(0, 3).join(' | ') : ''));
    // диаграммы
    const stats = J(await p.eval(`JSON.stringify([...document.querySelectorAll('.stat-fig')].map((f) => ({ bars: f.querySelectorAll('.sb-bar').length, meters: f.querySelectorAll('.sm-bar').length, caps: f.querySelectorAll('.stat-cap').length, legends: f.querySelectorAll('.sb-legend').length })))`));
    check(stats.length === 5 && stats.every((s) => s.bars >= 3 && s.caps === 1) && stats[0].meters === 1 && stats[0].legends === 1 && stats[1].legends === 1, 'пять диаграмм чисел из статей построены (StatsChart), у каждой подпись с источником, легенды при двух рядах: ' + JSON.stringify(stats));
    for (const [id, sel, n] of [['drive', '#drive .stat-fig', 'l65-stat-act.png'], ['hands', '#hands .stat-fig', 'l65-stat-hands.png'], ['compute', '#compute .stat-fig', 'l65-stat-compute.png'], ['power', '#power .stat-fig', 'l65-stat-batt.png']]) await show(p, id, sel, n);
    await show(p, 'body', '#body .parts-card', 'l65-parts.png');
    const outs = [];

    // ---------- лаборатория ----------
    console.log('лаборатория');
    const ctl = ['#wrapBLegs', '#wrapBArms', '#wrapBHands', '#wrapBComp', '#wrapBBatt', '#wrapBPin'];
    check((await Promise.all(ctl.map((s) => visible(p, s)))).every((v) => !v), 'миссия 1: все ручки скрыты');
    check(/^Нажми кнопку миссии/.test(await text(p, '#bOut')), 'до кнопки миссии итог не показан (ставка не выдана)');
    await show(p, 'budget', '#budget .lab', 'l65-budget-start.png');
    let r = await viaUI(p, '#bMis', 1); outs.push(r.out); const r1 = R.m1;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`требует от привода плеча ${f1(r1.arm.peakNeed)} Н·м`) && r.out.includes(`колену на ступеньке с коробкой нужно ${f1(r1.knee.peakNeed)} Н·м при ${f1(r1.knee.peak)}`) && r.out.includes(`хватает на ${f1(r1.hours)} ч`), `миссия 1: Ада 6.1 — плечо ${f1(r1.arm.peakNeed)}/${f1(r1.arm.sustNeed)} при 9,7/4,59, колено ${f1(r1.knee.peakNeed)} при 45,3, ${f1(r1.hours)} ч`);
    const tbl = await text(p, '#bOut');
    check(tbl.includes(`${f1(r1.mass.total)} · ${f1(r1.mass.withLoad)}`) && tbl.includes(`нужно ${f1(r1.arm.peakNeed)} / ${f1(r1.arm.sustNeed)}, есть ${f1(r1.arm.peak)} / ${f1(r1.arm.sust)}`) && tbl.includes('не хватает момента приводам рук'), 'таблица под сценой: массы, моменты и итог как в движке');
    await show(p, 'budget', '#budget .lab', 'l65-budget-m1.png');
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBArms') && !(await visible(p, '#wrapBLegs')) && !(await visible(p, '#wrapBHands')), 'миссия 2: видны приводы рук, остальное скрыто');
    await seg(p, '#bArms', '8513'); r = await viaUI(p, '#bMis', 1); outs.push(r.out); const r2 = R.m2;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`прибавили ${f1(r2.mass.total - r1.mass.total)} кг`) && r.out.includes(`весит ${f1(r2.mass.total)} кг`) && r.out.includes(`нужно уже ${f1(r2.knee.peakNeed)} Н·м при ${f1(r2.knee.peak)}`), `миссия 2: руки 8513 — +${f1(r2.mass.total - r1.mass.total)} кг, ${f1(r2.mass.total)} кг, колену ${f1(r2.knee.peakNeed)} при 45,3`);
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBArms') && await visible(p, '#wrapBLegs') && !(await visible(p, '#wrapBHands')), 'миссия 3: видны приводы рук и ног');
    await seg(p, '#bLegs', '8518'); r = await viaUI(p, '#bMis', 0); outs.push(r.out); const r3 = R.m3;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`дают колену ${f1(r3.knee.peak)} Н·м пиком при нужных ${f1(r3.knee.peakNeed)}`) && r.out.includes(`весит ${f1(r3.mass.total)} кг против 28`) && r.out.includes(`работает ${f1(r3.hours)} ч`), `миссия 3: ноги 8518 — колено ${f1(r3.knee.peakNeed)}/${f1(r3.knee.sustNeed)} при 62,6/26,1, ${f1(r3.mass.total)} кг, ${f1(r3.hours)} ч`);
    await show(p, 'budget', '#budget .lab', 'l65-budget-m3.png');
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBHands') && !(await visible(p, '#wrapBComp')), 'миссия 4: видны кисти, вычислитель скрыт');
    await seg(p, '#bHands', 'shadow'); r = await viaUI(p, '#bMis', 1); outs.push(r.out);
    check(!r.ok && r.crit[1] !== 'ok' && r.crit[0] === 'ok', 'миссия 4: кисти Shadow на руках 8513 не держат коробку (длительно)');
    await seg(p, '#bArms', '8518'); r = await viaUI(p, '#bMis'); outs.push(r.out);
    check(!r.ok && r.crit[1] === 'ok' && r.crit[2] !== 'ok', 'миссия 4: с руками 8518 ноги 8518 не держат ступеньку');
    await seg(p, '#bLegs', '10413'); r = await viaUI(p, '#bMis'); outs.push(r.out); const r4 = R.m4;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`требует от плеча ${f1(r4.arm.sustNeed)} Н·м длительно`) && r.out.includes(`Ада весит ${f1(r4.mass.total)} кг, на ${f1(r4.mass.total - r3.mass.total)} кг больше`) && r.out.includes(`упало до ${f1(r4.hours)} ч`), `миссия 4: Shadow — руки 8518, ноги 10413, ${f1(r4.mass.total)} кг (+${f1(r4.mass.total - r3.mass.total)}), ${f1(r4.hours)} ч`);
    await show(p, 'budget', '#budget .lab', 'l65-budget-m4.png');
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBComp') && !(await visible(p, '#wrapBBatt')), 'миссия 5: виден вычислитель, батарея скрыта');
    // возвращаем конфигурацию миссии 3, чтобы числа разборов совпали с текстом после лаборатории
    await seg(p, '#bHands', 'inspire'); await seg(p, '#bArms', '8513'); await seg(p, '#bLegs', '8518');
    await seg(p, '#bComp', 'thor'); r = await viaUI(p, '#bMis', 1); outs.push(r.out); const r5 = R.m5, rc = E.compute(cfg({ arms: '8513', legs: '8518', comp: 'cloud' }));
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`с ${f0(r3.power.avg)} до ${f0(r5.power.avg)} Вт`) && r.out.includes(`с ${f1(r3.hours)} до ${f1(r5.hours)} ч, меньше двух`) && r.out.includes(`через ${f0(rc.lat)} мс, за которые Ада на 0,5 м/с проходит ${f1(rc.latCm)} см`), `миссия 5: Thor — ${f0(r5.power.avg)} Вт, ${f1(r5.hours)} ч; облако ${f0(rc.lat)} мс = ${f1(rc.latCm)} см`);
    await nextMission(p, '#bMis');
    check(await visible(p, '#wrapBBatt') && !(await visible(p, '#wrapBPin')), 'миссия 6: видна батарея, кнопка закрепления скрыта');
    await seg(p, '#bBatt', 'h1'); r = await viaUI(p, '#bMis', 1); outs.push(r.out); const r6 = R.m6, r6f = R.m6f;
    check(r.ok && /ставка сыграла/i.test(r.out) && r.out.includes(`весит ${f1(r6.mass.batt)} кг, и Ада работает ${f1(r6.hours)} ч против ${f1(r5.hours)}`) && r.out.includes(`в ${f2(r6.hours / r5.hours)} раза дольше`) && r.out.includes(`весила бы ${f1(r6f.mass.batt)} кг: времени ${f1(r6f.hours)} ч, но колену понадобилось бы ${f1(r6f.knee.peakNeed)} Н·м, больше, чем даёт любой привод из набора`), `миссия 6: батарея H1 — ${f1(r6.mass.batt)} кг, ${f1(r6.hours)} ч (×${f2(r6.hours / r5.hours)}); Figure 03 — ${f1(r6f.mass.batt)} кг, колену ${f1(r6f.knee.peakNeed)} Н·м`);
    await show(p, 'budget', '#budget .lab', 'l65-budget-m6.png');
    await nextMission(p, '#bMis');
    check((await Promise.all(ctl.map((s) => visible(p, s)))).every((v) => v), 'свободный режим: все ручки и кнопка закрепления видны');
    await seg(p, '#bBatt', 'f3'); await seg(p, '#bLegs', '10413'); r = await viaUI(p, '#bMis'); outs.push(r.out);
    const free = J(await p.eval(`JSON.stringify(window.__l65.Budget.st.res.checks)`));
    check(!free.legs && free.time && free.arms, 'свободный режим: батарея 2,3 кВт·ч с ногами 10413 — время есть, колено не держит ступеньку');
    await p.eval(`document.getElementById('bPin').click(); true`);
    check((await text(p, '#bOut')).includes('закреплённая') && JSON.stringify(J(await p.eval(`JSON.stringify(window.__l65.Budget.st.pinned)`))) === JSON.stringify(M.m6f10), 'кнопка закрепления делает текущую Аду опорной');
    const ba = await text(p, '#budgetAfter');
    const baMiss = missing(ba, [`плечу нужно ${f1(r1.arm.peakNeed)} Н·м пиком и ${f1(r1.arm.sustNeed)} Н·м длительно`, `прибавляют ${f1(r2.mass.total - r1.mass.total)} кг`, `нужно ${f1(r2.knee.peakNeed)} Н·м при ${f1(r2.knee.peak)}`, `весит ${f1(r3.mass.total)} кг и работает ${f1(r3.hours)} ч`, `тяжелеет до ${f1(r4.mass.total)} кг`, `с ${f1(r3.hours)} до ${f1(r5.hours)} ч`, `возвращает ${f1(r6.hours)} ч ценой ${f1(r6.mass.batt - r5.mass.batt)} кг`, `весила бы ${f1(r6f.mass.batt)} кг`]);
    check(!baMiss.length && !r6f.checks.legs && !R.m6f10.checks.legs, 'текст после лаборатории называет те же числа, что движок' + (baMiss.length ? ' — нет: ' + baMiss.join(', ') : ''));
    const deep = await text(p, '#budget details.deep');
    check(deep.includes('Ада весит 28 кг, как в уроке 6.1') && deep.includes('1 кг на 130 Вт·ч') && deep.includes('0,7') && deep.includes('на 31–44 %'), '«Под капотом» описывает модель: 28 кг, 130 Вт·ч/кг, стоимость перемещения 0,7, диапазон Thor');
    const wideD = await p.eval(`[...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length`);
    check(wideD === 0, 'компьютер: после всех миссий ни одна карточка лаборатории не вылезает за свою колонку: ' + wideD);
    const outBad = outs.filter((x) => POS.test(x));
    check(!outBad.length, 'разборы миссий — по ролям, без «слева/справа»' + (outBad.length ? ': ' + outBad.map(posWord).join(', ') : ''));
    const ll = await labLabels(p);
    check(!ll.bad.length && ll.minPx >= 9.95, `канвасы лаборатории и рисунка частей (компьютер): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ll.minPx.toFixed(1)})` + (ll.bad.length ? ': ' + ll.bad.slice(0, 4).join('; ') : ''));
    check(!ll.texts.some((x) => POS.test(x)), 'канвасы лаборатории: в подписях нет слов о расположении');

    // ---------- итоги, квиз, глоссарий, формулы, консоль ----------
    const fin = await text(p, '#finale .takeaways');
    const finMiss = missing(fin, ['в 3,7 раза сильнее', '42–47 %', '189 Н·м/кг', '6 кг против 3,6', '4,3 кг', '7 мкм', 'трёх граммов', 'срезал время работы на треть']);
    check(!finMiss.length, 'итоги урока называют числа схем, статей и лаборатории' + (finMiss.length ? ' — нет: ' + finMiss.join(', ') : ''));
    check(!(await p.eval(`document.body.innerText.includes('@@')`)), 'в тексте страницы не осталось заглушек @@');
    const qz = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#quizBox .q-card')].map((c) => c.querySelectorAll('.q-opt').length))`));
    check(qz.length === 8 && qz.every((n) => n === 3), 'квиз: 8 вопросов по 3 варианта');
    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
    check((await p.eval(`[...document.querySelectorAll('#quizBox .q-exp')].filter((e) => !e.hidden && e.textContent.length > 60).length`)) === 8, 'квиз: у каждого вопроса есть объяснение');
    check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
    const qOpts = J(await p.eval(`JSON.stringify(window.__l65.QUIZ.map((q) => q.o.join(' ')))`));
    check(!qOpts.some((o) => /\d/.test(o)), 'квиз проверяет понимание: в вариантах ответов нет чисел');
    const answers = J(await p.eval(`JSON.stringify(window.__l65.QUIZ.map((q) => q.a))`));
    check(new Set(answers).size >= 2, 'квиз: верные ответы стоят на разных местах в данных: ' + answers.join(''));
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные: ' + await p.eval(`document.querySelectorAll('.gl').length`));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 3 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'формулы отрисованы KaTeX без ошибок: ' + await p.eval(`document.querySelectorAll('.katex').length`));
    const links = J(await p.eval(`JSON.stringify([...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('http') && !h.startsWith('#')))`));
    check(links.every((h) => /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h)) && links.includes('6-6-obzor-platform.html') && links.includes('0-1-dve-paradigmy.html#ada'), 'ссылки на уроки курса: ' + [...new Set(links)].join(', '));
    check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
    // тёмная тема
    await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(600);
    await p.eval(`(() => { const B = window.__l65.Budget; B.api.set({ arms: '8518', legs: '10413', hands: 'shadow', comp: 'thor', batt: 'h1' }); return B.api.run(); })()`, true);
    for (const [id, sel, n] of [['budget', '#budget .lab', 'l65-budget-dark.png'], ['drive', '#drive .flow-card', 'l65-drive-dark.png'], ['hands', '#hands .flow-card', 'l65-hand-dark.png'], ['power', '#power .stat-fig', 'l65-stat-batt-dark.png']]) await show(p, id, sel, n);
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
    await m.eval(`document.querySelector('.topbar').style.visibility = 'hidden'; true`);
    await m.eval(`(() => { const B = window.__l65.Budget; B.api.set({ arms: '8513', legs: '8518' }); return B.api.run(); })()`, true);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l) => { const card = l.closest('.wrap') || l.parentElement; return l.scrollWidth > card.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1); }).length`);
    check(wide === 0, 'ни одна лаборатория не шире своей карточки: ' + wide);
    for (const kind of ['drive', 'hand']) {
      const sm2 = await schemeLabels(m, kind, FRAMES[kind]);
      check(!sm2.none && sm2.layout === 'n' && !sm2.bad.length, `телефон, схема ${kind} (узкая): подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${sm2.minPx && sm2.minPx.toFixed(1)}), в своих блоках` + (sm2.bad.length ? ': ' + sm2.bad.slice(0, 4).join('; ') : ''));
    }
    const ml = await labLabels(m);
    check(!ml.bad.length && ml.minPx >= 9.95, `телефон, канвасы лаборатории: подписи в канвасе, не налезают, не мельче 10 px (наименьшая ${ml.minPx.toFixed(1)})` + (ml.bad.length ? ': ' + ml.bad.slice(0, 4).join('; ') : ''));
    const statsM = await m.eval(`[...document.querySelectorAll('.stat-fig')].filter((f) => f.scrollWidth > f.clientWidth + 1).length`);
    check(statsM === 0, 'телефон: диаграммы не шире своих карточек: ' + statsM);
    await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const [id, sel, n] of [['drive', '#drive .flow-card', 'l65-m-drive.png'], ['hands', '#hands .flow-card', 'l65-m-hand.png'], ['budget', '#budget .lab', 'l65-m-budget.png'], ['drive', '#drive .stat-fig', 'l65-m-stat-act.png']]) {
      await m.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300);
      await m.shotEl(out(n), sel, 4);
    }
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
}
