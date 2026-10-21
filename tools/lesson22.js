// Урок 2.2 «PerAct: 3D-представления и язык»: лаборатории дают обещанные в тексте исходы, миссии проходятся
// через интерфейс, задача с карточками решается, график совпадает с таблицей 1 статьи и упорядочен по PerAct,
// три анимированные схемы (перекрёстная энтропия, латенты, путь данных) идут, а их подписи внутри канваса и не
// налезают друг на друга в широкой и узкой раскладках, консоль чиста, на телефоне ничего не вылезает за экран.
// Снимки — shots/l22-*.png (схемы и график: l22-xent, l22-latents, l22-peract, l22-tasks и телефонные l22-m-*).
// Урок собирается на дату выпуска: MR_ASOF=2026-10-10 python3 lessons/build.py l22.
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp');
const url = 'file://' + path.resolve(__dirname, '../site/lessons/2-2-peract.html');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = (s) => JSON.parse(s);
/** Пройти миссию через интерфейс: ставка (если есть) и главная кнопка; вернуть, засчитана ли миссия. */
async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn'); if (bets.length && ${bet != null}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    await new Promise((r) => setTimeout(r, 60));
    for (let i = 0; i < 2400 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ crit, ok: crit.length > 0 && crit.every((c) => c === 'ok'), out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J);
}
const nextMission = (p, mis) => p.eval(`(() => { const b = document.querySelector('${mis} .g-next'); if (!b || b.hidden) return false; b.click(); return true; })()`);
const critOk = (p, mis) => p.eval(`(() => { const li = [...document.querySelectorAll('${mis} .m-crit li')]; return li.length > 0 && li.every((x) => x.className === 'ok'); })()`);
const outText = (p, mis) => p.eval(`(document.querySelector('${mis} .g-out:not([hidden])') || {}).textContent || ''`);
const shot = async (p, id, sel, n, pad) => { await p.eval(`document.getElementById('${id}').scrollIntoView({ behavior: 'instant' }); true`); await sleep(300); await p.shotEl(out(n), sel, pad); };
/** Кадры схем для проверки подписей и кадр для снимка. */
const SCHEMES = { xent: { frames: [0.8, 2.4, 4, 6, 9, 12, 14], shot: 9 }, latents: { frames: [1, 2.2, 3.4, 5.5, 9, 13.5, 17], shot: 5.5 }, peract: { frames: [0.8, 2.4, 4, 5.6, 7.5, 9.4, 11, 12.5], shot: 11 } };
const SCHEME_NAME = { xent: 'схема перекрёстной энтропии', latents: 'схема латентов', peract: 'схема пути данных PerAct' };
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
/** Три схемы: подписи в канвасе, кадры этапов различаются, содержание ключевых кадров; снимок кадра. */
async function schemeChecks(p, where, layout) {
  for (const [kind, S] of Object.entries(SCHEMES)) {
    const r = await schemeLabels(p, kind, S.frames);
    if (r.none) { check(false, `${where}${SCHEME_NAME[kind]}: схемы нет — в build.py для l22 нужен shared/anim.js перед l22/flow.js`); continue; }
    check(r.layout === layout && r.bad.length === 0, `${where}${SCHEME_NAME[kind]} ${r.W}×${r.H}: подписи в канвасе, не мельче 9,6 px и не налезают` + (r.bad.length ? ': ' + r.bad.slice(0, 4).join('; ') : ''));
    check(r.distinct === S.frames.length, `${where}${SCHEME_NAME[kind]}: кадры ${S.frames.length} этапов различаются (разных ${r.distinct})`);
    const tx = (t) => r.texts[String(t)] || [];
    if (kind === 'xent') check(tx(4).includes('p(цель) = 0,01') && tx(14).includes('p(цель) = 0,91') && tx(14).some((q) => /^потеря = −log p\(цель\) = 0,1$/.test(q)) && tx(14).some((q) => /^шаг обучения 80 из 80/.test(q)), `${where}схема перекрёстной энтропии: p(цель) 0,01 → 0,91 за 80 шагов, потеря 0,1`);
    if (kind === 'latents') check(tx(3.4).includes('8077 токенов') && tx(3.4).some((q) => /^(65 млн оценок|8077 × 8077 = 65 млн)$/.test(q)) && tx(5.5).includes('латенты читают вход') && tx(9).some((q) => /^слой \d из 6$/.test(q)) && tx(13.5).includes('патчи спрашивают латенты') && tx(17).includes('все со всеми: 391 млн'), `${where}схема латентов: 8077 токенов — 65 млн оценок, латенты читают вход, слои между латентами, патчи спрашивают латенты, итог 391 млн`);
    if (kind === 'peract') check(tx(11).includes('100³ оценок') && tx(11).includes('2048 × 512') && tx(11).includes('→ 100³ × 64') && tx(11).includes('перенос: лучший воксель') && tx(11).includes('max-pool → 64 числа') && tx(5.6).includes('Латенты читают вход'), `${where}схема пути данных: формы тензоров и четыре головы на месте`);
    await p.eval(`(() => { const cv = document.querySelector('canvas[data-anim=${kind}]'); Anim.seek(cv, ${S.shot}); cv.classList.remove('paused'); return true; })()`);
    await p.shotEl(out(`l22-${where ? 'm-' : ''}${kind}.png`), `figure:has(> canvas[data-anim=${kind}])`, where ? 4 : 6);
  }
}
(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  console.log('компьютер');
  const p = await B.page(url, { width: 1280, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  const hm = await p.eval(`document.getElementById('heroMis').textContent`);
  check(hm === '9 миссий с целью', 'число миссий в шапке: ' + hm);
  check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 2.1: три вопроса');
  // отсылки вперёд: первое упоминание модели из будущего урока в основном тексте (без разминки, глоссария, формул,
  // раздела «Сегодня» и итога) и в исходниках интерактивов идёт с номером урока «урок N.M» не дальше 160 символов; остальные упоминания свободны
  const fwdNames = ['RT-1', 'RT-2', 'Open X-Embodiment', 'Octo', 'OpenVLA', 'SmolVLA', 'π0', 'PaliGemma', 'Helix', 'GR00T', 'Gemini', 'PaLM-E', 'VoxPoser', 'SayCan', 'Code as Policies', 'Inner Monologue'];
  const fwdSrc = ['../lessons/l22/ui-l22.js', '../lessons/l22/flow.js', '../lessons/l22/engine.js'].map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');
  const fwdCheck = async () => {
    const body = await p.eval('(() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("#recall, #glData, #today, #finale, .katex").forEach((e) => e.remove()); return m.textContent; })()');
    const near = (t, w) => { const i = t.indexOf(w); return i < 0 || /урок[а-яё]*\s+\d\.\d/i.test(t.slice(Math.max(0, i - 160), i + w.length + 160)); };
    const bad = fwdNames.filter((w) => !near(body, w) || !near(fwdSrc, w));
    check(bad.length === 0, 'первое упоминание модели из будущего урока — с номером урока' + (bad.length ? ': ' + bad.join(', ') : ''));
  };
  await p.eval('window.__l22.SPEED.k = 60; true');

  // ---------- 1. Ключевые позы ----------
  console.log('Ключевые позы');
  const K = 'window.__l22.LabKey.api';
  const k0 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(k0.n === 325, 'в демонстрации 325 кадров');
  check(!k0.ok && k0.type === 'drop' && !k0.roles.place && !(await critOk(p, '#kMis')), `порог 0,04: ${k0.nk} поз без отпускания на полке — ${k0.msg} (как в тексте миссии)`);
  const band = J(await p.eval(`JSON.stringify(${K}.band())`));
  check(band.lo != null && band.hi > band.lo, `рабочий порог: от ${band.lo} до ${band.hi} рад/с`);
  for (const e of [band.lo, (band.lo + band.hi) / 2, band.hi]) {
    const s = J(await p.eval(`(${K}.setEps(${e}), JSON.stringify(${K}.state()))`));
    check(s.nk === 6 && s.ok && s.roles.grasp && s.roles.place, `порог ${s.eps}: 6 поз, чашка на полке`);
  }
  check(await critOk(p, '#kMis'), 'миссия 1 засчитана');
  check(/Шесть поз: перед чашкой, захват, подъём над чайником, перед полкой, отпускание, отвод руки/.test(await outText(p, '#kMis')), 'разбор миссии 1 перечисляет шесть поз');
  const below = J(await p.eval(`(${K}.setEps(${band.lo} - 0.01), JSON.stringify(${K}.state()))`));
  check(below.nk !== 6 || !below.ok, `чуть ниже порога: ${below.nk} поз, ${below.ok ? 'чашка на полке' : below.msg}`);
  const low = J(await p.eval(`(${K}.setEps(0.03), JSON.stringify(${K}.state()))`));
  check(!low.ok && !low.roles.grasp, `порог 0,03: пропадает и захват чашки — ${low.msg}`);
  const above = J(await p.eval(`(${K}.setEps(${band.hi} + 0.01), JSON.stringify(${K}.state()))`));
  check(above.nk >= 7, `чуть выше порога: ${above.nk} поз — лишняя поза над чайником`);
  await p.eval(`(${K}.setEps(${band.lo}), true)`);
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes.png', 6);
  await nextMission(p, '#kMis');
  let r = await viaUI(p, '#kMis', 1);
  const k2 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(r.ok && !k2.grip && !k2.ok && k2.type === 'missGrasp', `миссия 2: без условия про захват — ${k2.msg}`);
  check(/ставка сыграла/i.test(r.out) && /Захват сжался в воздухе над чайником/.test(r.out), 'ставка «захват сожмётся не там» сыграла, разбор совпадает');
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes-grip.png', 6);
  await nextMission(p, '#kMis');
  r = await viaUI(p, '#kMis', 1);
  const k3 = J(await p.eval(`JSON.stringify(${K}.state())`));
  check(r.ok && k3.mode === 'interval' && !k3.ok && k3.nk === 6, `миссия 3: шесть поз через равные промежутки — ${k3.msg}`);
  check(/ставка сыграла/i.test(r.out) && /Поза 2 пришлась на подъезд к чашке/.test(r.out), 'ставка «нет» сыграла, разбор совпадает');

  // ---------- 2. Следующий лучший воксель ----------
  console.log('Воксели');
  const V = 'window.__l22.LabVox.api';
  r = await viaUI(p, '#vMis', 2);
  const v1 = J(await p.eval(`JSON.stringify(${V}.state())`));
  check(await p.eval(`document.getElementById('vWinBox').hidden`), 'в миссии 1 окна по высоте не видно');
  check(r.ok && v1.regShelf === null && v1.regBelow >= 0 && !!v1.clsShelf, `миссия 1: регрессия в ${v1.regGapCm.toFixed(1)} см над нижней полкой, классификатор — ${v1.clsShelf} (${(v1.pu * 100).toFixed(0)}% / ${(v1.pl * 100).toFixed(0)}%)`);
  check(v1.pu > 0.2 && v1.pl > 0.2, 'у классификатора два пика: на обеих полках заметная вероятность');
  check(/ставка сыграла/i.test(r.out), 'ставка «между полками, в воздух» сыграла');
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels.png', 6);
  await nextMission(p, '#vMis'); await sleep(100);
  const up = J(await p.eval(`(${V}.setCmd('upper'), JSON.stringify(${V}.state()))`));
  const lo = J(await p.eval(`(${V}.setCmd('lower'), JSON.stringify(${V}.state()))`));
  check(up.clsShelf === 'upper' && lo.clsShelf === 'lower', 'команда переносит пик: «на верхнюю» — верхняя, «на нижнюю» — нижняя');
  check(up.regShelf === 'upper' && lo.regShelf === 'lower', 'регрессия с командой тоже попадает на полку (как в разборе)');
  check(await critOk(p, '#vMis'), 'миссия 2 засчитана');
  await p.eval(`(${V}.setView('top'), true)`); await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-top.png', 6); await p.eval(`(${V}.setView('iso'), true)`);
  await nextMission(p, '#vMis'); await sleep(100);
  r = await viaUI(p, '#vMis', 1);
  const e1 = J(await p.eval(`JSON.stringify(${V}.state())`)).ev;
  check(!r.ok && e1.K === 1 && e1.ok >= 10 && e1.ok <= 30, `окно ±1: верно ${e1.ok} из 60 — примерно треть`);
  check(/ставка сыграла/i.test(await p.eval(`document.querySelector('#vMis').textContent`)) || /Расширь окно/.test(r.out), 'после провала — подсказка расширить окно');
  const win = async () => J(await p.eval(`JSON.stringify({ vis: !document.getElementById('vWinBox').hidden, cells: [...document.querySelectorAll('#vWin .win-stack')].map((s) => s.children.length), note: document.getElementById('vWinNote').textContent })`));
  const w1 = await win();
  check(w1.vis && w1.cells.join() === '3,3,3' && /все три места одинаковы/.test(w1.note), 'окно ±1 видно под сценой: по 3 вокселя на столе и на полках, «все три места одинаковы»');
  const evs = {};
  for (const Kw of [2, 3, 4]) {
    await p.eval(`(${V}.setK(${Kw}), true)`);
    r = await viaUI(p, '#vMis', null);
    evs[Kw] = J(await p.eval(`JSON.stringify(${V}.state())`)).ev.ok;
  }
  check(evs[2] < 60 && evs[3] < 60 && evs[4] === 60, `окна ±2, ±3, ±4: ${evs[2]}, ${evs[3]}, ${evs[4]} из 60 — самое узкое рабочее ±4`);
  check(r.ok && /Самое узкое рабочее окно — ±4 вокселя/.test(r.out), 'миссия 3 засчитана с окном ±4');
  const w4 = await win();
  check(w4.vis && w4.cells.join() === '9,9,9' && /по-разному/.test(w4.note), 'окно ±4: по 9 вокселей, «все три места выглядят по-разному»');
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-window.png', 6);
  await nextMission(p, '#vMis'); await sleep(200);
  await p.eval(`(${V}.setK(3), true)`);
  await p.waitFor(`!!window.__l22.LabVox.st.models[3]`, 60000);
  const tbl = J(await p.eval(`(() => { const X = ${V}, out = []; for (const c of ['upper', 'lower']) { X.setCmd(c); for (let i = 1; i <= 30; i++) { X.setScene(i); const s = X.state(); if (!s.clsShelf) out.push(c + ':' + i); } } X.setScene(0); X.setCmd('upper'); return JSON.stringify(out); })()`));
  check(tbl.length > 0, `свободный режим: с окном ±3 модель выбирает стол в сценах ${tbl.slice(0, 6).join(', ')}`);

  // ---------- 3. Сколько стоит внимание ----------
  console.log('Латенты');
  const C = 'window.__l22.LabCost.api';
  r = await viaUI(p, '#pMis', 1);
  const c1 = J(await p.eval(`JSON.stringify(${C}.state())`));
  check(r.ok && c1.fullBytes > 1e14 && c1.fullBytes < 1e15 && c1.percBytes > 16e9, `миссия 1: все со всеми ${(c1.fullBytes / 1e12).toFixed(0)} ТБ, Perceiver на миллионе токенов ${(c1.percBytes / 1e9).toFixed(0)} ГБ`);
  check(/ставка сыграла/i.test(r.out), 'ставка «сотни терабайт» сыграла');
  await nextMission(p, '#pMis'); await sleep(100);
  const c2 = J(await p.eval(`(${C}.setPatch(5), JSON.stringify(${C}.state()))`));
  check(c2.N === 8077 && c2.percBytes < 16e9 && c2.fullBytes > 16e9 && await critOk(p, '#pMis'), `миссия 2: 8077 токенов, Perceiver ${(c2.percBytes / 1e9).toFixed(2)} ГБ, все со всеми ${(c2.fullBytes / 1e9).toFixed(0)} ГБ`);
  const o2 = await outText(p, '#pMis');
  check(/3,7 ГБ/.test(o2) && /в 4,9 раза/.test(o2) && /в 63 раза/.test(o2), 'разбор миссии 2: 3,7 ГБ, Perceiver дорожает в 4,9 раза, все со всеми — в 63');
  check(/около 3,7 ГБ/.test(await p.eval(`document.querySelector('#perceiver').textContent`)), 'текст после лаборатории называет те же 3,7 ГБ');
  await shot(p, 'perceiver', '#perceiver .lab', 'l22-perceiver.png', 6);
  await nextMission(p, '#pMis'); await sleep(100);
  r = await viaUI(p, '#pMis', 1);
  const c3 = J(await p.eval(`JSON.stringify(${C}.state())`));
  check(r.ok && c3.rotJoint === 373248 && c3.rotAxis === 216, `миссия 3: все сочетания — ${c3.rotJoint}, три оси — ${c3.rotAxis}`);
  const gmax = await p.eval(`(() => { const X = ${C}; X.setPatch(5); X.setLat(2048); let best = 0; for (let g = 20; g <= 200; g += 5) { X.setG(g); if (X.state().percBytes <= 16e9) best = g; } X.setG(100); return best; })()`);
  check(gmax >= 150 && gmax < 200, `свободный режим: самая большая сетка, где Perceiver укладывается в 16 ГБ, — ${gmax}³`);

  // ---------- задача, график, квиз ----------
  console.log('Задача, график, квиз');
  const zones = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#shapeSort .c-zone')].map((z) => z.querySelector('.c-zone-h').textContent + ' | ' + (z.querySelector('.c-zone-n') || {}).textContent))`));
  check(zones.length === 8 && zones.every((z, i) => z.startsWith(`${i + 1} · `)) && /^1 · 100 × 100 × 100 × 10 \| миллион вокселей/.test(zones[0]) && /^8 · 2 \| два варианта/.test(zones[7]), 'задача «собери PerAct по шагам»: восемь корзин по порядку пути данных, у каждой пояснение формы');
  check((await p.eval(`document.querySelectorAll('#shapeSort .c-card.c-desc .c-sub').length`)) === 8 && /трилинейное повышение разрешения/.test(await p.eval(`document.querySelector('#shapeSort').textContent`)) && /наибольшее значение среди всех вокселей/.test(await p.eval(`document.querySelector('#shapeSort').textContent`)), 'на каждой карточке пояснение, что происходит с данными; max-pool и трилинейное повышение разрешения объяснены словами');
  const items = { i1: 'grid', i2: 'text', i3: 'seq', i4: 'lat', i5: 'feat', i6: 'q', i7: 'rot', i8: 'open' };
  for (const [id, z] of Object.entries(items)) await p.eval(`window.__l22.mis.sort.place(${JSON.stringify(id)}, ${JSON.stringify(z)})`);
  await p.eval('window.__l22.mis.sort.check()'); await sleep(100);
  const so = await p.eval('document.querySelector("#shapeSort .c-out").textContent');
  check(/^8 из 8/.test(so), 'задача: ' + so.slice(0, 60));
  await p.shotEl(out('l22-sort.png'), '#shapeSort', 6);
  const T = J(await p.eval(`JSON.stringify({ d: window.__l22.T1.val('peract', 0), nl: window.__l22.T1.val('nolang', 0), c2f: window.__l22.T1.val('c2f', 0), img: window.__l22.T1.val('img', 0) })`));
  check(T.d === 80 && T.nl === 28 && T.c2f === 20 && T.img === 4, `график: «открыть ящик», 100 демонстраций — PerAct ${T.d}, без команды ${T.nl}, C2FARM-BC ${T.c2f}, Image-BC ${T.img}, как в таблице 1`);
  const ord = J(await p.eval(`JSON.stringify(window.__l22.T1.order().map((t) => window.__l22.T1.val('peract', t)))`));
  check(ord.length === 18 && ord.every((v, i) => !i || ord[i - 1] >= v) && ord[0] === 84, `график: 18 задач упорядочены по успеху PerAct, первая — ${ord[0]}%`);
  const tl = J(await p.eval(`JSON.stringify([...document.querySelectorAll('#tLegend span')].map((s) => s.textContent.trim() + ':' + s.querySelector('i').className))`));
  check(tl.join('|') === 'PerAct:bar|PerAct без команды словами:bar-o|C2FARM-BC: 3D-свёрточная сеть:bar|Image-BC: по картинке, лучший из CNN и ViT:bar', 'легенда графика: четыре серии названы, «без команды» — контурный столбик');
  const axis = await p.eval(`(() => { const cv = document.getElementById('tCv'), orig = CanvasRenderingContext2D.prototype.fillText, seen = []; CanvasRenderingContext2D.prototype.fillText = function (t) { if (this.canvas === cv) seen.push(String(t)); return orig.apply(this, arguments); }; window.__l22.T1.draw(); CanvasRenderingContext2D.prototype.fillText = orig; return seen.includes('доля успешных эпизодов, %') && seen.includes('100%'); })()`);
  check(axis, 'подпись оси «доля успешных эпизодов, %» и деления на самом графике');
  await p.eval(`window.__l22.T1.setHover(0); true`);
  await shot(p, 'results', '#results .chart-card', 'l22-tasks.png', 6);
  check(!/узки[ех] мест/.test(await p.eval(`document.body.textContent`)), 'термина «узкие места» на странице нет');
  await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c) => c.querySelector('.q-opt').click()); true`);
  check(/^Итог: \d из 8/.test(await p.eval(`document.getElementById('quizScore').textContent`)), 'квиз: ' + await p.eval(`document.getElementById('quizScore').textContent`));
  await fwdCheck();
  check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e) => getComputedStyle(e).display !== 'inline').length`)) === 0, 'подсказки глоссария строчные');
  check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 10, 'формулы отрисованы KaTeX: ' + await p.eval(`document.querySelectorAll('.katex').length`));
  const an = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('canvas[data-anim]')].map((cv) => { Anim.seek(cv, 1.1); const a = cv.toDataURL(); Anim.seek(cv, 3.7); const b = cv.toDataURL(); return { k: cv.dataset.anim, moves: a !== b, sec: cv.closest('section').id }; }))`));
  check(an.map((a) => a.k + '@' + a.sec).join(',') === 'xent@voxels,latents@perceiver,peract@perceiver' && an.every((a) => a.moves), 'три схемы на местах и идут: ' + an.map((a) => a.k + '@' + a.sec).join(', '));
  await schemeChecks(p, '', 'w');
  check(!p.logs.length, 'консоль: ' + (p.logs.join(' | ') || 'чисто'));
  // тёмная тема
  await p.eval(`document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('resize')); true`); await sleep(500);
  await shot(p, 'keyframes', '#keyframes .lab', 'l22-keyframes-dark.png', 6);
  await shot(p, 'voxels', '#voxels .lab', 'l22-voxels-dark.png', 6);
  await shot(p, 'results', '#results .chart-card', 'l22-tasks-dark.png', 6);

  console.log('телефон');
  const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await m.waitFor('window.__lessonReady === true', 30000); await sleep(600);
  await m.eval('window.__l22.SPEED.k = 60; true');
  await m.eval(`window.__l22.LabVox.api.train().then(() => true)`, true);
  check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
  const over = await m.eval(`JSON.stringify([...document.querySelectorAll('.lab, .chart-card, .card.pad')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => (e.closest('section') || {}).id + ' ' + e.className))`);
  check(over === '[]', 'на телефоне содержимое лабораторий не шире карточек ' + (over === '[]' ? '' : over));
  await m.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const [id, sel, n] of [['keyframes', '#keyframes .lab', 'l22-m-keyframes.png'], ['voxels', '#voxels .lab', 'l22-m-voxels.png'], ['perceiver', '#perceiver .lab', 'l22-m-perceiver.png'], ['results', '#results .chart-card', 'l22-m-tasks.png'], ['shapes', '#shapeSort', 'l22-m-sort.png']]) await shot(m, id, sel, n, 4);
  await schemeChecks(m, 'телефон: ', 'n');
  check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));
  await B.close();
  console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
