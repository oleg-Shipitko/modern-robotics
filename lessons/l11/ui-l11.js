/* =====================================================================
   ui-l11.js — урок 1.1 «Behavior Cloning». Все интерактивы — миссии
   на живых сценах (shared/missions.js), у каждого своя механика:
   мини-ALVINN (живое обучение, ползунки условий, развилка),
   лаборатория «Ты — оператор» (своя поездка, ставка, «сломай политику»,
   четыре Ады рядом), отладчик аварии кадр за кадром, калькулятор εT²,
   сортировка приёмов (shared/cards.js) и квиз.
   Сцена и движок лаборатории — shared/drive-lab.js и shared/drive-core.js.
   ===================================================================== */
'use strict';

const fmtN = (v, d) => (+v).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }).replace('-', '−');
const fmtS = (v) => v.toFixed(1).replace('.', ',');
const ranges = (sel) => $$(sel).forEach((r) => setRangeFill(r));

function initNav() {
  const links = $$('.toc a');
  const ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null;
    for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Мини-ALVINN: 16×15 пикселей → 12 скрытых → 15 делений руля ---------- */
const Alvinn = (() => {
  const K = HeroKit, WI = 16, HI = 15, NH = 12, NO = 15, NIN = WI * HI, SHIFT_MAX = 0.3;
  let net = null, trained = false, busy = false, seen = { left: false, right: false }, ctl = null, status = '';
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** Синтетическая дорога, как у Померло: камера смотрит вперёд, дорога сужается к горизонту. */
  function road(curve, shift, fork, r) {
    const img = new Float32Array(NIN);
    for (let y = 0; y < HI; y++) {
      const depth = 1 - y / (HI - 1);                // 1 — горизонт, 0 — у машины
      const w = 1.6 + 7.2 * (1 - depth);
      const cx = WI / 2 - shift * 5.5 * (1 - depth * 0.75) + curve * 7 * depth * depth;
      const centers = fork ? [cx - 4.2 * depth * depth - 0.4, cx + 4.2 * depth * depth + 0.4] : [cx];
      const ww = fork ? w * 0.62 : w;
      for (let x = 0; x < WI; x++) {
        let on = 0; for (const c of centers) on = Math.max(on, Math.max(0, Math.min(1, ww / 2 - Math.abs(x + 0.5 - c) + 0.5)));
        img[y * WI + x] = 0.22 + 0.62 * on + (r ? (r() - 0.5) * 0.16 : 0);
      }
    }
    return img;
  }
  const steerOf = (curve, shift) => Math.max(-1, Math.min(1, 0.75 * curve - 0.85 * shift));
  const idxOf = (steer) => Math.round((steer + 1) / 2 * (NO - 1));
  function target(steer) { const t = new Float32Array(NO), p = (steer + 1) / 2 * (NO - 1); for (let i = 0; i < NO; i++) t[i] = Math.exp(-((i - p) ** 2) / (2 * 1.3 * 1.3)); return t; }
  function makeNet(seed) {
    const r = rng(seed), W1 = new Float32Array(NIN * NH), B1 = new Float32Array(NH), W2 = new Float32Array(NH * NO), B2 = new Float32Array(NO);
    for (let i = 0; i < W1.length; i++) W1[i] = (r() - 0.5) * 0.2;
    for (let i = 0; i < W2.length; i++) W2[i] = (r() - 0.5) * 0.8;
    return { W1, B1, W2, B2 };
  }
  const sig = (z) => 1 / (1 + Math.exp(-z));
  function forward(n, x) {
    const hdn = new Float32Array(NH), out = new Float32Array(NO);
    for (let j = 0; j < NH; j++) { let s = n.B1[j]; for (let i = 0; i < NIN; i++) s += x[i] * n.W1[i * NH + j]; hdn[j] = sig(s); }
    for (let o = 0; o < NO; o++) { let s = n.B2[o]; for (let j = 0; j < NH; j++) s += hdn[j] * n.W2[j * NO + o]; out[o] = sig(s); }
    return { hdn, out };
  }
  function* trainGen(n) { // 1200 синтетических дорог, SGD с моментом, как в эпоху backprop
    const r = rng(17), X = [], Y = [];
    for (let k = 0; k < 1200; k++) { const c = r() * 2 - 1, sft = (r() * 2 - 1) * SHIFT_MAX; X.push(road(c, sft, false, r)); Y.push(target(steerOf(c, sft))); }
    const vW1 = new Float32Array(n.W1.length), vW2 = new Float32Array(n.W2.length), vB1 = new Float32Array(NH), vB2 = new Float32Array(NO), lr = 0.35, mom = 0.85;
    for (let ep = 0; ep < 40; ep++) {
      let loss = 0;
      for (let k = 0; k < X.length; k++) {
        const x = X[k], y = Y[k], { hdn, out } = forward(n, x);
        const dO = new Float32Array(NO), dH = new Float32Array(NH);
        for (let o = 0; o < NO; o++) { const e = out[o] - y[o]; loss += e * e; dO[o] = e * out[o] * (1 - out[o]); }
        for (let j = 0; j < NH; j++) { let s = 0; for (let o = 0; o < NO; o++) s += n.W2[j * NO + o] * dO[o]; dH[j] = s * hdn[j] * (1 - hdn[j]); }
        for (let j = 0; j < NH; j++) for (let o = 0; o < NO; o++) { const g = hdn[j] * dO[o], id = j * NO + o; vW2[id] = mom * vW2[id] - lr * g; n.W2[id] += vW2[id]; }
        for (let o = 0; o < NO; o++) { vB2[o] = mom * vB2[o] - lr * dO[o]; n.B2[o] += vB2[o]; }
        for (let i = 0; i < NIN; i++) { const xi = x[i]; for (let j = 0; j < NH; j++) { const id = i * NH + j; vW1[id] = mom * vW1[id] - lr * xi * dH[j]; n.W1[id] += vW1[id]; } }
        for (let j = 0; j < NH; j++) { vB1[j] = mom * vB1[j] - lr * dH[j]; n.B1[j] += vB1[j]; }
        if (k % 200 === 199) yield { ep, k, loss: loss / (k + 1) };
      }
    }
  }
  const peak = (out) => { let b = 0; for (let i = 1; i < NO; i++) if (out[i] > out[b]) b = i; return b; };
  function now() {
    const curve = +$('#alvCurve').value, shift = +$('#alvShift').value, fork = $('#alvFork').checked;
    const img = road(curve, shift, fork, null), out = trained || busy ? forward(net, img).out : null, p = out ? peak(out) : null, t = idxOf(steerOf(curve, shift));
    return { curve, shift, fork, img, out, p, t, err: out && !fork ? Math.abs(p - t) : null, steer: p == null ? null : p / (NO - 1) * 2 - 1 };
  }
  /** Средняя ошибка в делениях на 40 новых дорогах из того же диапазона, что и обучающие. */
  function meanErr() { const r = rng(99); let s = 0; for (let k = 0; k < 40; k++) { const c = r() * 2 - 1, sft = (r() * 2 - 1) * SHIFT_MAX; s += Math.abs(peak(forward(net, road(c, sft, false, null)).out) - idxOf(steerOf(c, sft))); } return s / 40; }
  function draw() {
    const e = now();
    const rc = $('#alvRoad'); rc.width = WI; rc.height = HI; const g = rc.getContext('2d'), id = g.createImageData(WI, HI);
    for (let i = 0; i < NIN; i++) { const v = Math.round(e.img[i] * 255); id.data[i * 4] = v * 0.86; id.data[i * 4 + 1] = v * 0.9; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    const Wc = 420, Hc = 170, { c, k } = K.fit($('#alvOut'), Wc, Hc), P = { ink: K.css('--ink'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), cl: K.css('--classic'), grid: K.css('--line'), bg: K.css('--surface-2') };
    c.fillStyle = P.bg; c.fillRect(0, 0, Wc, Hc);
    const out = e.out || new Float32Array(NO).fill(0.08), bw = Wc / NO, base = 122, hmax = 92;
    for (let i = 0; i < NO; i++) { const v = e.out ? out[i] : 0.05 + 0.1 * Math.abs(Math.sin(i * 1.7)); c.fillStyle = P.e2e; c.globalAlpha = e.out ? 0.9 : 0.35; c.fillRect(i * bw + 4, base - v * hmax, bw - 8, v * hmax); }
    c.globalAlpha = 1;
    if (!e.fork) {
      const tt = target(steerOf(e.curve, e.shift)); c.strokeStyle = P.cl; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath();
      for (let i = 0; i < NO; i++) { const x = i * bw + bw / 2, y = base - tt[i] * hmax; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
      const xt = e.t * bw + bw / 2; c.fillStyle = P.cl; c.beginPath(); c.moveTo(xt, base + 3); c.lineTo(xt - 6, base + 11); c.lineTo(xt + 6, base + 11); c.closePath(); c.fill();
    }
    c.strokeStyle = P.grid; c.beginPath(); c.moveTo(0, base + 0.5); c.lineTo(Wc, base + 0.5); c.stroke();
    for (let i = 0; i < NO; i++) K.label(c, k, String(i + 1), i * bw + bw / 2, base + 21, { px: 10, color: P.ink3, halo: false, mono: true });
    for (const [t, x, a] of [['← влево', 6, 'left'], ['прямо', Wc / 2, 'center'], ['вправо →', Wc - 6, 'right']]) K.label(c, k, t, x, Hc - 10, { align: a, px: 11, color: P.ink3, halo: false });
    if (e.p != null) { const x = e.p * bw + bw / 2; c.fillStyle = P.ink; c.beginPath(); c.moveTo(x, 18); c.lineTo(x - 7, 8); c.lineTo(x + 7, 8); c.closePath(); c.fill(); }
    $('#alvCurve').nextElementSibling.textContent = fmtN(e.curve, 2); $('#alvShift').nextElementSibling.textContent = fmtN(e.shift, 2);
    ranges('#alvinn input[type=range]');
    if (trained && e.fork) { if (e.steer < -0.15) seen.left = true; if (e.steer > 0.15) seen.right = true; }
    const msg = $('#alvMsg');
    if (busy) msg.textContent = status;
    else if (!trained) msg.textContent = 'Сеть ещё не обучена: выходы случайны.';
    else if (e.fork) msg.innerHTML = `<b>Развилка: правильных ответов два.</b> Сеть выбрала ${e.steer < -0.15 ? 'левую ветку' : e.steer > 0.15 ? 'правую ветку' : 'середину, прямо в разделитель'}.`;
    else msg.innerHTML = `Вершина горба — на делении <b>${e.p + 1}</b>, правильный ответ — <b>${e.t + 1}</b>. Ошибка: <b>${e.err} ${plural(e.err, 'деление', 'деления', 'делений')}</b>${e.err >= 3 ? '. Сеть рулит неправильно.' : '.'}`;
    if (ctl) ctl.update();
  }
  async function train() {
    if (busy) return null; busy = true;
    net = makeNet(5); status = 'Обучаем на 1200 синтетических дорогах…';
    await runChunked(trainGen(net), (ev) => { status = `Обучаем на 1200 синтетических дорогах… эпоха ${ev.ep + 1} из 40, ошибка ${ev.loss.toFixed(3).replace('.', ',')}`; draw(); });
    trained = true; busy = false; draw();
    return { trained: true, meanErr: meanErr() };
  }
  function state() { const e = now(); return { trained, err: e.err, fork: e.fork, steer: e.steer, seenLeft: seen.left, seenRight: seen.right, curve: e.curve, shift: e.shift }; }
  function reset() { net = makeNet(5); trained = false; seen = { left: false, right: false }; $('#alvCurve').value = 0.3; $('#alvShift').value = 0; $('#alvFork').checked = false; draw(); }
  const missions = [
    {
      short: 'Обучи', title: 'Обучи сеть на 1200 дорогах',
      text: 'Пока веса случайные, выход сети — шум. Обучим её на 1200 синтетических дорогах, как в 1989 году: на входе картинка, на выходе «горб» вокруг правильного поворота. Правила «изгиб → руль» сеть не знает.',
      controls: ['curve'],
      bet: { q: 'Справится ли обученная сеть с дорогами, которых не было среди 1200 примеров?', options: ['Да, если они похожи на обучающие', 'Нет, только с теми, что видела'], answer: (r) => (r.meanErr < 1 ? 0 : 1) },
      action: { label: 'Обучить на 1200 дорогах', run: () => train() },
      criteria: [
        { label: 'сеть обучена за 40 эпох', test: (r) => r.trained },
        { label: 'на 40 новых дорогах вершина горба в среднем меньше чем в делении от правильного ответа', test: (r) => r.meanErr < 1 },
      ],
      summary: (r) => `средняя ошибка на новых дорогах: ${fmtN(r.meanErr, 2)} деления`,
      explain: (r) => `Горб идёт за дорогой, хотя правил никто не писал: сеть сама нашла в пикселях то, что связано с поворотом. На 40 новых дорогах она ошибается в среднем на ${fmtN(r.meanErr, 1)} деления. Подвигай изгиб: вершина горба смещается вслед за дорогой. Но новые дороги взяты из того же диапазона, что и обучающие. Что сеть сделает на непохожей дороге, проверим в следующей задаче.`,
    },
    {
      short: 'Найди ошибку', title: 'Найди дорогу, на которой сеть ошибается',
      text: 'В обучающих дорогах машина стояла не дальше 0,3 от середины полосы, как у водителя, который держится центра. Подвигай изгиб и смещение и найди дорогу, где вершина горба уходит от правильного ответа на 3 деления или больше.',
      controls: ['curve', 'shift'],
      onEnter: () => { $('#alvFork').checked = false; draw(); },
      criteria: [{ label: 'сеть ошиблась на 3 деления или больше', test: (r, s) => s.trained && !s.fork && s.err >= 3 }],
      hint: 'Сдвинь машину дальше, чем было в обучении, например на −0,8, и подвигай изгиб в ту же сторону, к −1.',
      explain: (s) => `На смещении ${fmtN(s.shift, 2)} сеть промахивается на ${s.err} ${plural(s.err, 'деление', 'деления', 'делений')}: таких картинок в обучении не было, и сеть отвечает наугад. Пока смещение не больше 0,3, она ошибается не больше чем на 2 деления. Померло столкнулся с тем же, когда стал учить ALVINN по живому водителю: водитель держится середины, и примеров возврата на дорогу в данных нет. В лаборатории ниже та же беда случится с Адой.`,
    },
    {
      short: 'Развилка', title: 'Что сеть делает на развилке',
      text: 'Включи развилку и подвигай изгиб. Правильных ответов теперь два: левая ветка и правая. Посмотри, куда повернёт сеть.',
      controls: ['curve', 'shift', 'fork'],
      criteria: [
        { label: 'сеть свернула в левую ветку', test: (r, s) => s.seenLeft },
        { label: 'сеть свернула в правую ветку', test: (r, s) => s.seenRight },
      ],
      hint: 'Включи развилку и медленно веди изгиб от −1 до 1, следя за вершиной горба.',
      explain: () => 'Сеть каждый раз уверенно выбирает одну ветку, а маленькое изменение картинки перекидывает её на другую. Сказать «здесь два хороших варианта» она не умеет. Померло писал, что на развилках руль ALVINN метался между направлениями. Это мультимодальность действий, ей посвящён урок 1.3.',
    },
  ];
  function init() {
    net = makeNet(5);
    ['#alvCurve', '#alvShift'].forEach((s2) => $(s2).addEventListener('input', draw));
    $('#alvFork').addEventListener('input', () => { if ($('#alvFork').checked) { $('#alvCurve').value = 0; $('#alvShift').value = 0; } draw(); }); // развилку смотрим с прямой дороги
    App.on('theme', draw); App.on('resize', draw);
    ctl = Missions.mount('#alvGuide', missions, { reset, state }, { controls: { curve: '#alvCurveWrap', shift: '#alvShiftWrap', fork: '#alvForkWrap' } });
    draw();
    return ctl;
  }
  return { init, state, train, get ctl() { return ctl; } };
})();

/* ---------- Лаборатория «Ты — оператор»: миссии на живой сцене ---------- */
const Lab = (() => {
  const VARIANTS = [
    { key: 'c10', label: '10 аккуратных' },
    { key: 'c30', label: '30 аккуратных' },
    { key: 'dart10', label: 'шумный оператор' },
    { key: 'aug10', label: 'боковые сдвиги' },
  ];
  let ctl = null;
  const L = () => window.DriveLab;
  const mine = () => L().state.demos.filter((d) => d.mine).length;
  const robot = () => L().state.demos.filter((d) => !d.mine).length;
  const row = (r, key) => r.rows.find((x) => x.key === key) || { ok: 0 };
  const single = (A) => { A.probeMode(false); A.setLayout('single'); };
  const missions = [
    {
      short: 'Своя поездка', title: 'Проведи Аду до кухни',
      text: 'Нажми «Поехать» и веди Аду курсором или пальцем: она поворачивает туда, где курсор, и едет с постоянной скоростью. Доведи её от зарядки до кухни. Удачная поездка станет демонстрацией.',
      onEnter: (A) => { single(A); A.setView('traj'); A.say('Нажми «Поехать», потом наведи курсор на сцену или коснись её пальцем.', ''); },
      action: { label: 'Поехать', run: (A) => A.record() },
      criteria: [
        { label: 'Ада доехала до кухни', test: (r) => r.ok },
        { label: 'ни разу не задела стены и мебель', test: (r) => r.outcome !== 'crash' },
      ],
      summary: (r) => (r.ok ? `доехала за ${fmtS(r.time)} с, записано ${r.samples} примеров` : r.outcome === 'crash' ? `задела препятствие через ${fmtS(r.time)} с` : 'не успела за 26 с'),
      hint: 'Первый проём — прямо по курсу, в нижней части стены. Дальше поднимайся к проёму в верхней части второй стены, у шкафа, и спускайся к кухне. Держи курсор сантиметрах в 40 впереди Ады.',
      fail: (r) => (r.outcome === 'crash' ? 'Ада задела препятствие, поездка не записана. Красный пунктир — где она ехала. Попробуй ещё раз и поворачивай к проёму чуть заранее.' : 'Время вышло, поездка не записана. Веди Аду увереннее, прямо к проёмам.'),
      explain: (r) => `<b>Поездка записана:</b> ${r.samples} пар «что видит Ада → куда повёрнут руль». На входе 9 лучей дальномера и направление на кухню, на выходе — твой руль. На таких парах и учится behavior cloning. ${r.mine > 1 ? `Твоих поездок уже ${r.mine}.` : 'Можно записать ещё — каждая удачная поездка добавится к данным.'}`,
    },
    {
      short: 'Обучи и отпусти', title: 'Обучи политику на своих поездках',
      text: 'Сеть научится повторять твой руль. Потом отпустим десять копий Ады с чуть разных стартов, а к рулю подмешаем шум, как у настоящих моторов. Своих поездок мало? Добавь поездки робота-оператора: он едет аккуратно по середине.',
      controls: ['robot', 'train'],
      onEnter: (A) => { single(A); },
      bet: { q: 'Сколько из 10 поездок доедут до кухни?', options: ['0–3', '4–7', '8–10'], answer: (r) => (r.ok <= 3 ? 0 : r.ok <= 7 ? 1 : 2) },
      action: {
        label: 'Обучить и отпустить',
        run: async (A) => { const t = await A.train(); const r = await A.runTrips(); return Object.assign(r, t, { mine: mine(), robot: robot() }); },
      },
      criteria: [
        { label: 'политика обучена на твоих данных', test: (r) => r.examples > 0 },
        { label: 'десять копий Ады проехали маршрут', test: (r) => r.outcomes && r.outcomes.length === 10 },
      ],
      summary: (r) => `${r.mine ? `твоих поездок: ${r.mine}` : ''}${r.mine && r.robot ? ', ' : ''}${r.robot ? `робота: ${r.robot}` : ''} → ${r.ok} из 10`,
      explain: (r) => (r.ok >= 8
        ? `Доехали <b>${r.ok} из 10</b>. Похоже, твои поездки неровные: Ада то отклоняется, то ты её поправляешь. В данных сами собой появились возвраты, и политика им научилась. Робот-оператор так не умеет — он всегда едет ровно по середине. Что будет с его данными, увидим в четвёртой задаче, а пока проверим, легко ли сбить политику с маршрута.`
        : `Доехали <b>${r.ok} из 10</b>. На своих данных сеть почти не ошибается, но поездки политики расходятся: чуть отклонилась — и попала туда, где ${r.mine ? 'твоих поездок не было' : 'оператор не ездил'}. Такого кадра в данных нет, сеть ошибается сильнее, и Ада врезается. Насколько легко увести политику с маршрута, проверим в следующей задаче.`),
    },
    {
      short: 'Сломай политику', title: 'Найди старты, с которых Ада не доедет',
      text: 'Политика училась на кадрах из поездок оператора. Что она сделает там, где оператор не ездил? Перетащи Аду в другое место или коснись свободного места на сцене, а за кружок перед ней поверни её. Политика сразу поедет оттуда, шума в моторах нет. Найди старты, с которых она не доедет до кухни.',
      controls: ['view'],
      onEnter: (A) => { A.setLayout('single'); A.probeMode(true); A.setView('heat'); },
      criteria: [
        { label: 'найден старт, с которого Ада не доедет', test: (r, s) => s.probe.fails >= 1 },
        { label: 'отказ рядом с данными: не дальше 20 см от поездок, на которых училась политика', test: (r, s) => s.probe.failsNear >= 1 },
        { label: 'три отказа в разных местах', test: (r, s) => s.probe.distinct >= 3 },
      ],
      hint: 'Поставь Аду на синие клетки, где ездили, но поверни её на 30–40° в сторону. Или сдвинь её сантиметров на 15 вбок от линии поездок.',
      explain: () => `<b>Политику легко сломать.</b> Достаточно поставить Аду туда, где оператор не ездил, или повернуть её в сторону: она видит кадры, которых в данных нет, и сеть отвечает наугад. Даже рядом с маршрутом хватает небольшого поворота. Это и есть сдвиг распределения: политику учили на состояниях оператора, а ездит она по своим. Значит, в данных не хватает состояний в стороне от маршрута. Какие данные их добавят, сравним в следующей задаче.`,
    },
    {
      short: 'Почини данными', title: 'Какие данные чинят съезд с маршрута',
      text: 'Политике не хватает примеров в стороне от маршрута. Сравним, какие данные их добавят. Четыре Ады обучены на разных поездках робота-оператора: 10 и 30 аккуратных поездок, 10 поездок шумного оператора (его сносит, и он поправляет Аду) и 10 аккуратных поездок с боковыми сдвигами (к каждому кадру добавлены копии со сдвигом на 15 см, руль для них считает учитель). Все стартуют с одних и тех же мест с одинаковым шумом.',
      onEnter: (A) => { A.probeMode(false); A.setView('traj'); A.setLayout('grid', VARIANTS); A.prepare(VARIANTS.map((v) => v.key)); },
      bet: {
        q: 'Что поможет больше: втрое больше аккуратных поездок или шумный оператор?',
        options: ['30 аккуратных поездок', 'шумный оператор', 'одинаково'],
        answer: (r) => { const a = row(r, 'c30').ok, b = row(r, 'dart10').ok; return a > b ? 0 : b > a ? 1 : 2; },
      },
      action: { label: 'Отпустить четырёх Ад', run: (A) => A.compare(VARIANTS) },
      criteria: [
        { label: 'каждая из четырёх политик проехала 10 раз', test: (r) => r.rows.length === 4 },
        { label: 'найдены данные, с которыми доезжают все 10', test: (r) => r.rows.some((x) => x.ok === 10) },
      ],
      summary: (r) => r.rows.map((x) => `${x.label}: ${x.ok}`).join(' · '),
      explain: (r) => `Аккуратный оператор — <b>${row(r, 'c10').ok} из 10</b>, втрое больше таких поездок — <b>${row(r, 'c30').ok} из 10</b>. Шумный оператор — <b>${row(r, 'dart10').ok} из 10</b>, боковые сдвиги — <b>${row(r, 'aug10').ok} из 10</b>. Дело не в объёме: в поездках шумного оператора и в сдвинутых копиях есть возвраты — состояния в стороне от маршрута и правильный руль из них. Сдвинутыми кадрами Померло учил ALVINN в 1991 году, шумный оператор — приём DART (2017). Почему без возвратов маленькая ошибка заканчивается аварией, разберём в следующем разделе.`,
    },
    {
      short: 'Свободно', title: 'Свободный режим', final: true,
      text: 'Все ручки — под сценой: записывай свои поездки, добавляй поездки робота-оператора, включай шумного оператора и боковые сдвиги, обучай и сравнивай. Журнал запусков ведётся там же.',
      onEnter: (A) => { single(A); A.setView('traj'); },
    },
  ];
  function mount() {
    const A = L();
    A.setLabels({ main: 'политика' });
    const api = Object.assign({}, A, {
      reset() { A.reset(); },
      state() { return { probe: A.probeStats(), demos: A.state.demos.length, mine: mine(), model: !!A.state.model }; },
    });
    ctl = Missions.mount('#guide', missions, api, { controls: { view: '#ctlView', robot: '#ctlRobot', train: '#ctlTrain', free: '#freePanel' } });
    A.onChange(() => { if (ctl) ctl.update(); });
    $('#ctlRobot').addEventListener('click', () => { if (!A.busy()) A.addDemos(10); });
    return ctl;
  }
  return { mount, get ctl() { return ctl; } };
})();

/* ---------- Авария кадр за кадром: отладчик эпизода ---------- */
const Debugger = (() => {
  const K = HeroKit, D = Drive, TRIP = 6;   // поездка проверки, где политика на 10 аккуратных поездках врезается в угол проёма
  let frames = [], ep = null, t = 0, ready = false, ctl = null, found = { f1: null, f2: null }, key = null, playing = false, demos = [];
  async function prepare() {
    const e = await DriveLab.ensure('c10'), pol = D.policy(e.model), pts = [];
    demos = e.demos; demos.forEach((d) => d.traj.forEach((s) => pts.push(s)));
    ep = e.runs[TRIP];
    frames = ep.traj.map((s) => {
      let best = Infinity, q = null; for (const p of pts) { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < best) { best = d; q = p; } }
      const wp = pol(s), wt = D.teacher(s); return { s, wp, wt, err: Math.abs(wp - wt), nov: best, q };
    });
    const i1 = frames.findIndex((f) => f.nov <= 3 && f.err > 0.3), i2 = frames.findIndex((f) => f.err > 1);
    key = { i1, i2, n: frames.length, e1: frames[i1].err, n2: frames[i2].nov };
    const sl = $('#dbgT'); sl.max = frames.length - 1; sl.value = 0; ready = true; setT(0, false);
    $('#dbgPlay').disabled = false;
  }
  function setT(v, user) {
    if (!ready) return;
    t = Math.max(0, Math.min(frames.length - 1, Math.round(v)));
    const f = frames[t];
    if (user) { if (found.f1 == null && f.nov <= 3 && f.err > 0.3) found.f1 = t; if (found.f2 == null && f.err > 1) found.f2 = t; }
    const sl = $('#dbgT'); if (+sl.value !== t) sl.value = t; sl.nextElementSibling.textContent = fmtS(t * D.DT) + ' с'; setRangeFill(sl);
    $('#dbgRead').innerHTML = `<b>${fmtS(t * D.DT)} с.</b> Руль политики ${fmtN(f.wp, 2)} рад/с, учителя ${fmtN(f.wt, 2)} рад/с — ошибка <b>${fmtN(f.err, 2)}</b>. До ближайшей точки поездок оператора <b>${fmtN(f.nov, 0)} см</b>.`;
    draw(); if (ctl) ctl.update();
  }
  function draw() {
    const P = DriveDraw.pal(), { c, k } = K.fit($('#dbgScene'), D.W, D.H);
    DriveDraw.house(c, k, P);
    c.strokeStyle = P.ink3; c.globalAlpha = 0.4; c.lineWidth = 1.3; for (const d of demos) DriveDraw.line(c, d.traj); c.globalAlpha = 1;
    if (!ready) { K.label(c, k, 'обучаем политику…', D.W / 2, D.H / 2, { px: 12, mono: true, color: P.ink2, haloColor: P.bg }); drawChart(); return; }
    const tr = ep.traj;
    c.strokeStyle = P.e2e; c.globalAlpha = 0.3; c.setLineDash([4, 5]); c.lineWidth = 1.6; c.beginPath(); for (let i = t; i < tr.length; i++) (i === t ? c.moveTo(tr[i].x, tr[i].y) : c.lineTo(tr[i].x, tr[i].y)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    c.strokeStyle = P.e2e; c.lineWidth = 2.2; DriveDraw.line(c, tr, t + 1);
    DriveDraw.mark(c, tr[tr.length - 1], ep.outcome, P);
    const f = frames[t], s = f.s;
    if (f.q) { c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(f.q.x, f.q.y); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(f.q.x, f.q.y, 3, 0, 7); c.fillStyle = P.ink2; c.fill(); }
    const L = D.lidar(s.x, s.y, s.th); c.strokeStyle = P.classic; c.globalAlpha = 0.3; c.lineWidth = 1;
    for (let i = 0; i < D.NRAY; i++) { const a = s.th - D.FOV + 2 * D.FOV * i / (D.NRAY - 1); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(a) * L[i], s.y + Math.sin(a) * L[i]); c.stroke(); }
    c.globalAlpha = 1;
    DriveDraw.arc(c, s, f.wt, 0.7, P.classic, 3); DriveDraw.arc(c, s, f.wp, 0.7, P.e2e, 3);
    DriveDraw.ada(c, s, P.ink);
    drawChart();
  }
  function drawChart() {
    const cvc = $('#dbgChart'), W = 600, Hh = matchMedia('(max-width: 640px)').matches ? 270 : 190, P = DriveDraw.pal(), { c, k } = K.fit(cvc, W, Hh), l = 48, r = 590;
    c.fillStyle = P.surf; c.fillRect(0, 0, W, Hh);
    const emax = frames.length ? Math.max(1.2, Math.ceil(Math.max(...frames.map((f) => f.err)) * 11) / 10) : 2, nmax = frames.length ? Math.max(10, Math.ceil(Math.max(...frames.map((f) => f.nov)) / 5) * 5) : 25;
    const A = { t: 18 * Hh / 190, b: 84 * Hh / 190, max: emax }, B = { t: 116 * Hh / 190, b: 164 * Hh / 190, max: nmax };
    const n = Math.max(1, frames.length - 1), X = (i) => l + (r - l) * i / n;
    const YA = (v) => A.b - Math.min(v, A.max) / A.max * (A.b - A.t), YB = (v) => B.b - Math.min(v, B.max) / B.max * (B.b - B.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (const [y0, y1] of [[A.t, A.b], [B.t, B.b]]) { c.beginPath(); c.moveTo(l, y1 + 0.5); c.lineTo(r, y1 + 0.5); c.stroke(); }
    K.label(c, k, 'ошибка руля, рад/с', l, A.t - 8, { align: 'left', px: 11, color: P.ink2, halo: false });
    K.label(c, k, 'до данных оператора, см', l, B.t - 8, { align: 'left', px: 11, color: P.ink2, halo: false });
    c.setLineDash([3, 4]); c.strokeStyle = P.ink3;
    for (const v of [0.3, 1]) { c.beginPath(); c.moveTo(l, YA(v)); c.lineTo(r, YA(v)); c.stroke(); K.label(c, k, fmtN(v, 1), l - 6, YA(v), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false }); }
    c.beginPath(); c.moveTo(l, YB(3)); c.lineTo(r, YB(3)); c.stroke(); K.label(c, k, '3', l - 6, YB(3), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
    K.label(c, k, String(nmax), l - 6, YB(nmax), { align: 'right', px: 10, mono: true, color: P.ink3, halo: false });
    c.setLineDash([]);
    for (let s = 0; s <= (frames.length - 1) * D.DT; s += 1) K.label(c, k, `${s} с`, X(s / D.DT), Hh - 9, { px: 10, mono: true, color: P.ink3, halo: false });
    if (!frames.length) return;
    c.lineWidth = 2; c.strokeStyle = P.e2e; c.beginPath(); frames.forEach((f, i) => (i ? c.lineTo(X(i), YA(f.err)) : c.moveTo(X(i), YA(f.err)))); c.stroke();
    c.strokeStyle = P.ink2; c.beginPath(); frames.forEach((f, i) => (i ? c.lineTo(X(i), YB(f.nov)) : c.moveTo(X(i), YB(f.nov)))); c.stroke();
    c.strokeStyle = P.ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(t), A.t - 2); c.lineTo(X(t), B.b + 2); c.stroke();
    const f = frames[t];
    for (const [y, col] of [[YA(f.err), P.e2e], [YB(f.nov), P.ink2]]) { c.beginPath(); c.arc(X(t), y, 4.5, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke(); }
  }
  async function play() {
    if (!ready || playing) return; playing = true; const b = $('#dbgPlay'); b.textContent = '⏸ Пауза';
    let pos = t >= frames.length - 1 ? 0 : t, last = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        if (!playing) { res(); return; }
        pos += Math.min(0.1, (now - last) / 1000) / D.DT; last = now;
        setT(pos, false);
        if (pos >= frames.length - 1) { res(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    playing = false; b.textContent = '▶ Проиграть';
  }
  const state = () => ({ ready, f1: found.f1, f2: found.f2, t });
  function reset() { found = { f1: null, f2: null }; playing = false; setT(0, false); }
  const missions = [{
    short: 'Кадр за кадром', title: 'Найди, где началась авария',
    text: 'Найди кадр, где руль политики впервые разошёлся с учителем, и кадр, где ошибка стала большой. Двигай ползунок: оранжевая дуга — куда ведёт руль политики, синяя — куда повернул бы учитель. На графике — ошибка руля и расстояние от Ады до ближайшей точки поездок оператора.',
    criteria: [
      { label: 'кадр, где Ада ещё на маршруте оператора (ближе 3 см к его поездкам), а руль уже ошибается больше чем на 0,3 рад/с', test: (r, s) => s.f1 != null },
      { label: 'кадр, где ошибка руля больше 1 рад/с', test: (r, s) => s.f2 != null },
    ],
    hint: 'На графике найди место, где оранжевая линия поднялась выше 0,3, а серая ещё лежит у нуля. Потом веди ползунок дальше, пока ошибка не перевалит за 1.',
    explain: () => `Первая заметная ошибка — на ${fmtS(key.i1 * D.DT)} с: Ада ещё на маршруте, а руль уже ошибается на ${fmtN(key.e1, 2)} рад/с. Она поворачивает чуть не так и к ${fmtS(key.i2 * D.DT)} с оказывается в ${fmtN(key.n2, 0)} см от данных — там ошибка уже больше 1 рад/с. Дальше кадр всё незнакомее, ошибка всё больше, и на ${fmtS((key.n - 1) * D.DT)} с Ада врезается в угол проёма. Маленькая ошибка уводит туда, где данных нет, а там ошибки растут.`,
  }];
  function init() {
    $('#dbgPlay').disabled = true;
    $('#dbgT').addEventListener('input', (e) => { playing = false; setT(+e.target.value, true); });
    $('#dbgPlay').addEventListener('click', () => { if (playing) playing = false; else play(); });
    const ch = $('#dbgChart'); let drag = false;
    const toT = (e) => { const b = ch.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * 600; return (x - 48) / (590 - 48) * (frames.length - 1); };
    ch.addEventListener('pointerdown', (e) => { if (!ready) return; drag = true; playing = false; try { ch.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ } setT(toT(e), true); });
    ch.addEventListener('pointermove', (e) => { if (drag) setT(toT(e), true); });
    ch.addEventListener('pointerup', () => { drag = false; }); ch.addEventListener('pointercancel', () => { drag = false; });
    App.on('theme', draw); App.on('resize', draw);
    ctl = Missions.mount('#dbgGuide', missions, { reset, state }, {});
    draw();
    prepare().catch((e) => console.error('[урок] отладчик', e));
    return ctl;
  }
  return { init, state, setT: (v) => setT(v, true), get ctl() { return ctl; }, get key() { return key; } };
})();

/* ---------- Ошибка растёт как квадрат: калькулятор ---------- */
const Square = (() => {
  const K = HeroKit, W = 760, T0 = 200;
  const tall = () => matchMedia('(max-width: 640px)').matches;
  let ctl = null;
  const iid = (e, T) => e * T;
  const bc = (e, T) => T - (1 - e) * (1 - Math.pow(1 - e, T)) / e;             // ожидаемое число шагов вне маршрута без возврата
  const rec = (e, T, k) => T * (e * k) / (1 + e * k);                        // доля времени вне маршрута при возврате за k шагов
  const fmtV = (v) => (v >= 100 ? Math.round(v).toLocaleString('ru-RU') : v >= 1 ? v.toFixed(1).replace('.', ',') : v.toFixed(2).replace('.', ','));
  const pct = (e) => (e * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 2 }) + '%';
  const cur = () => ({ e: Math.pow(10, +$('#sqEps').value), k: +$('#sqK').value });
  function draw() {
    const { e, k: kk } = cur();
    $('#sqEps').nextElementSibling.textContent = pct(e);
    $('#sqK').nextElementSibling.textContent = kk;
    ranges('#square input[type=range]');
    const H = tall() ? 460 : 300, { c, k } = K.fit($('#sqChart'), W, H), P = { ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), hy: K.css('--hybrid'), grid: K.css('--line'), bg: K.css('--surface') };
    const box = { l: 54 * k, r: W - 16 * k, t: 22 * k, b: H - 34 * k };
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const y0 = 1e-3;
    const X = (T) => box.l + (Math.log10(T) - 1) / 2 * (box.r - box.l), Y = (v) => box.b - (Math.log10(Math.max(v, y0)) + 3) / 6 * (box.b - box.t);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    for (let p = -3; p <= 3; p++) { const y = Y(Math.pow(10, p)); c.beginPath(); c.moveTo(box.l, y); c.lineTo(box.r, y); c.stroke(); K.label(c, k, p >= 0 ? Math.pow(10, p).toLocaleString('ru-RU') : String(Math.pow(10, p)).replace('.', ','), box.l - 8, y, { align: 'right', px: 10.5, color: P.ink3, halo: false, mono: true }); }
    for (const T of [10, 30, 100, 300, 1000]) { const x = X(T); c.beginPath(); c.moveTo(x, box.t); c.lineTo(x, box.b); c.stroke(); K.label(c, k, String(T), x, box.b + 12 * k, { px: 10.5, color: P.ink3, halo: false, mono: true, align: T === 1000 ? 'right' : T === 10 ? 'left' : 'center' }); }
    K.label(c, k, 'длина эпизода T, шагов', (box.l + box.r) / 2, H - 8 * k, { px: 11, color: P.ink2, halo: false });
    K.label(c, k, 'ошибок за эпизод', box.l, 9 * k, { align: 'left', px: 11, color: P.ink2, halo: false });
    const curve = (f, col, lw, dash) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); for (let i = 0; i <= 120; i++) { const T = Math.pow(10, 1 + 2 * i / 120), v = f(T); i ? c.lineTo(X(T), Y(v)) : c.moveTo(X(T), Y(v)); } c.stroke(); c.setLineDash([]); };
    // единица — граница «меньше одной ошибки за поездку»
    c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(box.l, Y(1)); c.lineTo(box.r, Y(1)); c.stroke(); c.setLineDash([]);
    curve((T) => iid(e, T), P.ink3, 2, [6, 5]);
    curve((T) => rec(e, T, kk), P.ink2, 2.4);
    curve((T) => bc(e, T), P.e2e, 2.6);
    const xm = X(T0); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(xm, box.t); c.lineTo(xm, box.b); c.stroke(); c.setLineDash([]);
    K.label(c, k, 'поездка Ады', xm + 6, box.t + 8, { align: 'left', px: 10.5, color: P.ink2, haloColor: P.bg });
    for (const [f, col] of [[(T) => iid(e, T), P.ink3], [(T) => rec(e, T, kk), P.ink2], [(T) => bc(e, T), P.e2e]]) { c.beginPath(); c.arc(xm, Y(f(T0)), 4.5, 0, 7); c.fillStyle = col; c.fill(); }
    $('#sqStats').innerHTML = `<span>За поездку из ${T0} шагов: независимые ошибки — <b>${fmtV(iid(e, T0))}</b></span><span>behavior cloning — <b>${fmtV(bc(e, T0))}</b></span><span>с возвратом за ${kk} ${plural(kk, 'шаг', 'шага', 'шагов')} — <b>${fmtV(rec(e, T0, kk))}</b></span>`;
    if (ctl) ctl.update();
  }
  const state = () => { const { e, k } = cur(); return { e, k, bc: bc(e, T0), rec: rec(e, T0, k), iid: iid(e, T0) }; };
  function reset() { $('#sqEps').value = -3; $('#sqK').value = 10; draw(); }
  const missions = [
    {
      short: 'Точность', title: 'Подбери точность для behavior cloning',
      text: 'Поездка Ады — около 200 шагов. Подбери вероятность ошибки ε, при которой behavior cloning в среднем ошибается меньше одного раза за поездку.',
      controls: ['eps'],
      criteria: [{ label: 'у behavior cloning меньше одной ошибки за 200 шагов', test: (r, s) => s.bc < 1 }],
      hint: 'Двигай ε влево, пока оранжевая точка на черте «поездка Ады» не опустится ниже пунктира единицы.',
      explain: (s) => `Понадобилось ε = ${pct(s.e)} — примерно одна ошибка на ${Number((1 / s.e).toPrecision(2)).toLocaleString('ru-RU')} кадров. Для независимых ошибок хватило бы ε = 0,5%, это в ${Math.round(0.005 / s.e)} раз грубее. Обучить сеть с такой точностью на реальных кадрах почти невозможно. Посмотрим на другой путь — умение возвращаться на маршрут.`,
    },
    {
      short: 'Возвраты', title: 'Научи политику возвращаться',
      text: 'Верни ε на 0,1% или больше — такая точность реальнее. Теперь подбери, за сколько шагов политика должна возвращаться на маршрут, чтобы ошибок за поездку снова было меньше одной.',
      controls: ['eps', 'k'],
      criteria: [
        { label: 'ε не меньше 0,1%', test: (r, s) => s.e >= 0.000999 },
        { label: 'с возвратом меньше одной ошибки за 200 шагов', test: (r, s) => s.e >= 0.000999 && s.rec < 1 },
      ],
      hint: 'При ε = 0,1% попробуй k около 5.',
      explain: (s) => `Возврат за ${s.k} ${plural(s.k, 'шаг', 'шага', 'шагов')} — это ${(s.k * 50).toLocaleString('ru-RU')} мс — и при ε = ${pct(s.e)} ошибок за поездку меньше одной. Умение вернуться важнее идеальной точности. Чтобы политика ему научилась, в данных нужны возвраты: состояния в стороне от маршрута и правильный руль из них. Как их получить, разберём в следующем разделе.`,
    },
  ];
  function init() {
    ['#sqEps', '#sqK'].forEach((s2) => $(s2).addEventListener('input', draw));
    App.on('theme', draw); App.on('resize', draw);
    ctl = Missions.mount('#sqGuide', missions, { reset, state }, { controls: { eps: '#sqEpsWrap', k: '#sqKWrap' } });
    draw();
    return ctl;
  }
  return { init, state, get ctl() { return ctl; } };
})();

/* ---------- Сортировка: что поможет Аде ---------- */
function initSort() {
  return Cards.sort('#sortBox', {
    targets: [{ id: 'help', label: 'Поможет' }, { id: 'little', label: 'Почти не поможет' }, { id: 'harm', label: 'Навредит' }],
    items: [
      { id: 'dart', label: 'Подмешивать шум в руль при записи, а в данные писать исправление оператора', target: 'help', why: 'Это DART: Аду сносит, оператор поправляет, и в данных появляются возвраты.' },
      { id: 'more', label: 'Записать ещё 20 таких же аккуратных поездок', target: 'little', why: 'В них снова нет возвратов. В лаборатории 10 аккуратных поездок дали 6 из 10, а 30 — 5 из 10.' },
      { id: 'hist', label: 'Подать на вход историю своих прошлых поворотов руля', target: 'harm', why: 'Это ловушка «копирование себя»: сеть начнёт повторять прошлое действие вместо того, чтобы смотреть вокруг.' },
      { id: 'shift', label: 'Добавить сдвинутые копии кадров и посчитать для них правильный руль', target: 'help', why: 'Так Померло учил ALVINN в 1991 году. В лаборатории боковые сдвиги дали 10 из 10.' },
      { id: 'longer', label: 'Обучать дольше, пока ошибка на демонстрациях не станет почти нулевой', target: 'little', why: 'На данных оператора ошибка и так мала. Политика ошибается там, где данных нет, и лишние эпохи этого не меняют.' },
      { id: 'cams', label: 'Поставить боковые камеры и разметить их кадры рулём, который возвращает к центру', target: 'help', why: 'Так сделали в PilotNet: боковые камеры дают сдвинутые кадры без лишних поездок.' },
      { id: 'lamp', label: 'Подать на вход сигнал, который появляется из-за действия оператора, как лампа тормоза', target: 'harm', why: 'Это ложная причина: сеть выучит следствие действия вместо его причины.' },
      { id: 'bad', label: 'Начинать часть демонстраций из неудачных положений', target: 'help', why: 'Так в данных появляются состояния в стороне от маршрута и правильные действия из них.' },
    ],
    after: 'Помогает всё, что добавляет в данные возвраты: состояния в стороне от маршрута и правильное действие из них. Объём одинаковых поездок и долгое обучение почти ничего не меняют, а лишние входы могут навредить.',
  });
}

/* ---------- Квиз ---------- */
function initQuiz() {
  const Q = [
    { q: 'Behavior cloning — это обычное обучение с учителем?', o: ['Да, ничем не отличается', 'По форме да, но данные зависят от политики: её действия меняют то, что она увидит дальше', 'Нет, это обучение с подкреплением'], a: 1, e: 'Сеть учат на парах «наблюдение → действие», как обычную регрессию. Но примеры не независимы: политика сама выбирает, в какие состояния попадёт.' },
    { q: 'Помогут ли ещё 20 аккуратных демонстраций того же оператора справиться с дрейфом?', o: ['Да, больше данных — меньше ошибок', 'Почти нет: в них по-прежнему нет возвратов', 'Только если демонстраций больше тысячи'], a: 1, e: 'Лаборатория это показывает: 10 и 30 аккуратных демонстраций дают похожий результат. В оригинальной работе DAgger обычный BC тоже не улучшался от новых демонстраций.' },
    { q: 'Как в худшем случае растёт число ошибок behavior cloning с длиной эпизода T?', o: ['Линейно, как T', 'Как T²', 'Не зависит от T'], a: 1, e: 'Первая ошибка уводит туда, где оператор не бывал, и дальше политика может ошибаться на каждом шаге. Росс и Багнелл (2010) показали, что оценка εT² достижима.' },
    { q: 'Почему низкая ошибка на валидации не гарантирует, что политика доедет?', o: ['Из-за переобучения', 'Валидация взята из поездок оператора, а политика ездит по своим состояниям', 'Валидационная выборка слишком маленькая'], a: 1, e: 'Валидация меряет точность на распределении оператора. Успех политики меряют только прогонами в замкнутом контуре.' },
    { q: 'Как Померло в начале 1990-х научил ALVINN возвращаться на дорогу?', o: ['Заставлял водителя ехать зигзагом', 'Сдвигал и поворачивал кадры водителя и пересчитывал для них руль', 'Поставил на фургон больше камер'], a: 1, e: 'Каждый кадр превращали в 14 сдвинутых и повёрнутых копий, а руль для них считали по геометрической модели. Зигзаги отвергли как опасные. Боковые сдвиги в лаборатории делают то же самое.' },
    { q: 'Сеть видит лампу тормоза и тормозит, когда лампа горит. Что не так?', o: ['Лампа — следствие торможения, сеть выучила ложную причину', 'Сеть переобучилась на шум', 'Лампа плохо видна камере'], a: 0, e: 'Это пример causal confusion: признак связан с действием, но не вызывает его. Больше информации на входе может сделать политику хуже.' },
    { q: 'End-to-end вождение придумала NVIDIA в 2016 году?', o: ['Да, PilotNet был первым', 'Нет: ALVINN ездил в 1989 году, DAVE — в 2005-м', 'Нет: первой была Tesla в 2014 году'], a: 1, e: 'NVIDIA сама ссылается на ALVINN и DAVE. PilotNet показал, что идея работает на настоящих дорогах с современными сетями.' },
    { q: 'π0 от Physical Intelligence обучен с подкреплением?', o: ['Да, полностью', 'Нет: это behavior cloning на больших данных, обучение с подкреплением добавили в π*0.6', 'Наполовину: сначала RL, потом демонстрации'], a: 1, e: 'π0 учится на десятках тысяч часов демонстраций — это behavior cloning с современной архитектурой. Обучение на собственном опыте робота появилось в π*0.6 (ноябрь 2025).' },
  ];
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $('#quizBox'); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true });
    perms[qi].forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[perms[qi].indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $('#quizScore').textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= 6 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}

(function boot() {
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.error('[урок] ошибка в', name, e); return null; } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    window.__alvCtl = safe('alvinn', () => Alvinn.init());
    window.__labCtl = safe('lab', () => Lab.mount());
    window.__dbgCtl = safe('debugger', () => Debugger.init());
    window.__sqCtl = safe('square', () => Square.init());
    window.__sort = safe('sort', initSort);
    safe('quiz', initQuiz);
    window.__alv = Alvinn; window.__dbg = Debugger; window.__sq = Square;
    window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
