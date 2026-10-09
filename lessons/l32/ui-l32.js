/* =====================================================================
   ui-l32.js — урок 3.2 «Vision-language модели». Интерактивы — миссии
   на живой сцене (shared/missions.js):
   1) патчи → токены: иконка режется на 16 патчей, токены и позиции,
      перестановка патчей с позиционными векторами и без;
   2) мини-VLM: обучение энкодера, языковой модели и проектора в браузере,
      описание новых картинок словами, сравнение предобученного энкодера
      с энкодером с нуля, свободный режим со сдвигом, размером и шумом;
   3) пространство слов: две главные оси эмбеддингов языковой модели,
      чтение модели и токены картинки до и после обучения проектора;
   схема пути картинки — на shared/anim.js (Anim.add('vlm')).
   Движок — l32/engine.js (без DOM), мир стола — l21/engine.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
const pal = () => ({ bg: HeroKit.css('--surface-2'), bg2: HeroKit.css('--bg-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }).replace('-', '−');
const pc = (v, d) => fmt(v * 100, d == null ? 0 : d) + '%';
function legend(sel, items) {
  const box = $(sel); box.innerHTML = '';
  items.forEach(([t, col, kind]) => box.append(h('span', null, h('i', { class: kind || null, style: `--c:${col}` }), t)));
}
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
/** Прогнать генератор обучения кусками между кадрами, чтобы страница не замирала. */
async function runGen(gen, perFrame, onEv) {
  for (;;) {
    let r; for (let i = 0; i < (perFrame || 1); i++) { r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); }
    await nextFrame();
  }
}
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
/** Картинка движка (RGB 0…1) → холст того же размера в пикселях. */
function bitmap(img, w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d'), d = c.createImageData(w, hgt);
  for (let i = 0; i < w * hgt; i++) { d.data[i * 4] = img[i * 3] * 255; d.data[i * 4 + 1] = img[i * 3 + 1] * 255; d.data[i * 4 + 2] = img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0); return cv;
}
function drawBitmap(c, bm, x, y, w, hgt) { c.imageSmoothingEnabled = false; c.drawImage(bm, x, y, w, hgt); }
const rgbCss = (id) => { const [r, g, b] = L21.COLORS[L21.CI[id]].rgb; return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`; };
const colorWord = (id, g) => { const c = L21.COLORS[L21.CI[id]]; return g === 'f' ? c.f : c.m; };
const shapeWord = (id) => L21.SHAPES[L21.SI[id]].name;
/** Подпись словами по ответу модели: цвет согласуется с родом формы, если оба слова — слова словаря. */
function sayWords(words) {
  if (!words.length) return '—';
  return words.map((w, i) => { const ci = L21.CI[w], si = L21.SI[w]; if (si != null) return L21.SHAPES[si].name; if (ci != null) { const next = words[i + 1], g = next != null && L21.SI[next] != null ? L21.SHAPES[L21.SI[next]].g : 'm'; return colorWord(w, g); } return w; }).join(' ');
}
/** Кнопки выбора цвета и формы в контейнерах. */
function objectPickers(colorSel, shapeSel, cur, onPick) {
  const cBox = $(colorSel), sBox = $(shapeSel);
  L21.COLORS.forEach((c) => cBox.append(h('button', { type: 'button', 'data-v': c.id, 'aria-pressed': String(c.id === cur.color) }, h('i', { class: 'sw', style: `background:${rgbCss(c.id)}` }), c.m)));
  L21.SHAPES.forEach((s) => sBox.append(h('button', { type: 'button', 'data-v': s.id, 'aria-pressed': String(s.id === cur.shape) }, s.name)));
  cBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) onPick(b.dataset.v, null); });
  sBox.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) onPick(null, b.dataset.v); });
}
/** Вектор как полоска клеток: красное — положительное, синее — отрицательное. */
function vecBar(c, v, x, y, w, hgt, P, vertical) {
  const n = v.length; let mx = 1e-9; for (const q of v) mx = Math.max(mx, Math.abs(q));
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, Math.abs(v[i]) / mx); c.fillStyle = v[i] >= 0 ? P.e2e : P.cl; c.globalAlpha = 0.12 + 0.88 * a;
    if (vertical) c.fillRect(x, y + i * hgt / n, w, hgt / n + 0.4); else c.fillRect(x + i * w / n, y, w / n + 0.4, hgt);
  }
  c.globalAlpha = 1;
}

/* =====================================================================
   Схема пути картинки через VLM (shared/anim.js)
   ===================================================================== */
(() => {
  const T = 13;
  const PH = [[0, 1.6], [1.6, 3.4], [3.4, 5.0], [5.0, 6.4], [6.4, 8.4], [8.4, 11.2]];
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ANSWER = ['красный', 'кубик', '<eos>'], QUERY = ['что', 'на', 'столе?'];
  /** Картинка-иконка: стол и красный кубик. */
  function picture(c, x, y, s, P, A, cut, pr) {
    const { rect, line, alpha } = A;
    rect(c, x - s / 2, y - s / 2, s, s, 4, P.surf, P.ink3, 1.4);
    c.fillStyle = alpha(P.ink3, 0.18); c.fillRect(x - s / 2 + 3, y + s * 0.1, s - 6, s * 0.36);
    c.fillStyle = '#d14b3c'; c.fillRect(x - s * 0.16, y - s * 0.12, s * 0.3, s * 0.3);
    c.fillStyle = '#3a6fd1'; c.beginPath(); c.arc(x + s * 0.3, y - s * 0.02, s * 0.1, 0, 7); c.fill();
    if (cut) { const n = 4; for (let i = 1; i < n; i++) { line(c, [[x - s / 2 + i * s / n, y - s / 2], [x - s / 2 + i * s / n, y + s / 2]], alpha(P.out, 0.9 * pr), 1.4); line(c, [[x - s / 2, y - s / 2 + i * s / n], [x + s / 2, y - s / 2 + i * s / n]], alpha(P.out, 0.9 * pr), 1.4); } }
  }
  /** Столбец или ряд токенов; kind: 'p' синий, 'v' фиолетовый, 'w' оранжевый, 'gap'. Возвращает центры. */
  function tokens(c, x, y, kinds, dir, sz, gap, P, A, pr, hi) {
    const { rect } = A, pos = []; let o = 0;
    kinds.forEach((kd, i) => {
      const cx = dir === 'v' ? x : x + o, cy = dir === 'v' ? y + o : y;
      if (kd === 'gap') { o += sz * 0.6; pos.push(null); return; }
      pos.push([cx, cy]);
      const vis = pr === undefined ? 1 : Math.max(0, Math.min(1, pr * kinds.length - i));
      if (vis > 0) { const col = kd === 'p' ? [P.outS, P.out] : kd === 'v' ? [P.sprS, P.spr] : [P.motS, P.mot]; c.globalAlpha = vis; rect(c, cx - sz / 2, cy - sz / 2, sz, sz, 2.5, col[0], hi === i ? P.ink : col[1], hi === i ? 2 : 1.4); c.globalAlpha = 1; }
      o += sz + gap;
    });
    return pos;
  }
  function flow(c, from, to, prog, n, color, A) {
    const F = from.filter(Boolean), Tt = to.filter(Boolean); if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < n; i++) { const a = F[Math.floor(hash(i) * F.length)], b = Tt[Math.floor(hash(i + 99) * Tt.length)], ph = (prog * 2 + hash(i + 7)) % 1; A.circle(c, a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 2.2, color); }
  }
  function box(c, x, y, w, hgt, title, sub, P, A, on) { A.rect(c, x - w / 2, y - hgt / 2, w, hgt, 8, on ? P.surf : P.surf2, on ? P.ink2 : P.line, on ? 1.8 : 1.2); A.lab(c, 1, title, x, y - (sub ? 7 : 0), { px: 11, weight: 700, color: on ? P.ink : P.ink3, haloColor: P.surf }); if (sub) A.lab(c, 1, sub, x, y + 9, { px: 10, color: on ? P.ink2 : P.ink3, haloColor: P.surf }); }
  const IMG = ['p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'], VIS = ['v', 'v', 'v', 'v', 'v', 'gap', 'v', 'v'], WQ = ['w', 'w', 'w'];
  function drawFlow(c, k, t, P, A, G) {
    const { lab, arrow, seg, alpha, line } = A, u = ((t % T) + T) % T, pr = PH.map(([a, b]) => seg(u, a, b)), cur = PH.findIndex(([a, b]) => u >= a && u < b);
    const capOn = (i) => (i === cur ? P.ink : pr[i] > 0 ? P.ink2 : P.ink3);
    G.caps.forEach(([x, y, t1, t2], i) => { lab(c, k, t1, x, y, { px: 11, weight: 700, color: capOn(G.capPhase[i]), haloColor: P.surf2 }); if (t2) lab(c, k, t2, x, y + 14, { px: 10.5, color: pr[G.capPhase[i]] > 0 ? P.out : P.ink3, haloColor: P.surf2 }); });
    G.arrows.forEach(([x1, y1, x2, y2, ph]) => arrow(c, x1, y1, x2, y2, pr[ph] > 0 ? P.ink2 : P.line, 1.8, 6));
    // 1. картинка и нарезка на патчи
    picture(c, G.pic[0], G.pic[1], G.pic[2], P, A, pr[0] > 0, pr[0]);
    // 2. токены патчей → энкодер
    const tp = tokens(c, G.patches[0], G.patches[1], IMG, G.dir, G.sz, G.gap, P, A, pr[0]);
    box(c, G.enc[0], G.enc[1], G.boxW, G.boxH, 'энкодер', 'ViT, внимание', P, A, pr[1] > 0);
    if (pr[1] > 0 && pr[1] < 1) flow(c, tp, [[G.enc[0], G.enc[1]]], pr[1], 14, P.out, A);
    // 3. проектор: токены энкодера становятся токенами картинки языковой модели
    box(c, G.proj[0], G.proj[1], G.boxW * 0.8, G.boxH * 0.8, 'проектор', 'W', P, A, pr[2] > 0);
    const tv = tokens(c, G.vis[0], G.vis[1], VIS, G.dir, G.sz, G.gap, P, A, pr[2] > 0 ? Math.min(1, pr[2] * 1.4) : 0);
    // 4. запрос словами
    const tw = tokens(c, G.q[0], G.q[1], WQ, G.dir, G.sz, G.gap, P, A, pr[3] > 0 ? Math.min(1, pr[3] * 1.4) : 0);
    if (pr[3] > 0) QUERY.forEach((w, i) => { if (tw[i] && pr[3] * 3 > i) lab(c, k, w, tw[i][0] + G.wordOff[0], tw[i][1] + G.wordOff[1], { px: 10, color: P.mot, weight: 700, align: G.wordAlign, haloColor: P.surf2 }); });
    // 5. языковая модель читает картинку и запрос целиком
    box(c, G.lm[0], G.lm[1], G.boxW, G.boxH, 'языковая модель', 'префиксное внимание', P, A, pr[4] > 0);
    if (pr[4] > 0 && pr[4] < 1) { const all = tv.concat(tw).filter(Boolean); all.forEach((p, i) => { if ((i + Math.floor(pr[4] * 6)) % 2) line(c, [p, [G.lm[0], G.lm[1]]], alpha(i < 7 ? P.spr : P.mot, 0.3), 0.9); }); flow(c, all, [[G.lm[0], G.lm[1]]], pr[4], 16, P.spr, A); }
    // 6. ответ слово за словом
    if (pr[5] > 0) {
      const nShow = Math.min(3, Math.floor(pr[5] * 3.6) + 1);
      ANSWER.forEach((w, i) => { if (i >= nShow) return; const [x, y] = G.ans[i]; A.rect(c, x - G.ansW / 2, y - 10, G.ansW, 20, 5, i === 2 ? P.surf2 : P.motS, i === 2 ? P.line : P.mot, 1.4); lab(c, k, w, x, y, { px: 10.5, weight: 700, color: i === 2 ? P.ink3 : P.ink, haloColor: P.surf2 }); if (i > 0) { if (G.dir === 'v') arrow(c, x, G.ans[i - 1][1] + 11, x, y - 11, P.ink3, 1.2, 5); else arrow(c, G.ans[i - 1][0] + G.ansW / 2 + 1, y, x - G.ansW / 2 - 1, y, P.ink3, 1.2, 5); } });
      if (pr[5] < 1) lab(c, k, `слово ${nShow} из 3`, G.ansCap[0], G.ansCap[1], { px: 10.5, color: P.mot, weight: 700, haloColor: P.surf2 });
    }
  }
  Anim.add('vlm', {
    W: 720, H: 300, start: 4.2, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        dir: 'v', sz: 12, gap: 3, boxW: 108, boxH: 54, ansW: 72, wordOff: [12, 0], wordAlign: 'left',
        caps: [[62, 262, 'картинка', '224 × 224'], [150, 262, 'патчи', '16 × 16 → 256'], [258, 262, 'токены энкодера', '256 × ширина'], [372, 262, 'токены картинки', 'ширина модели'], [462, 262, 'запрос', 'слова'], [560, 262, 'ответ', 'слово за словом']],
        capPhase: [0, 0, 1, 2, 3, 5],
        arrows: [[96, 140, 134, 140, 0], [166, 140, 204, 140, 1], [312, 140, 332, 140, 2], [412, 140, 440, 140, 2], [482, 100, 506, 112, 4], [482, 170, 506, 158, 4], [614, 140, 636, 140, 5]],
        pic: [62, 140, 62], patches: [150, 92], enc: [258, 140], proj: [372, 62], vis: [372, 100], q: [462, 110],
        lm: [560, 140], ans: [672, 108, 672, 140, 672, 172].reduce((a, v, i) => (i % 2 ? (a[a.length - 1].push(v), a) : (a.push([v]), a)), []), ansCap: [672, 206],
      });
    },
    narrow: {
      W: 360, H: 640,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          dir: 'h', sz: 12, gap: 3, boxW: 150, boxH: 48, ansW: 70, wordOff: [0, -16], wordAlign: 'center',
          caps: [[280, 58, 'картинка', '224 × 224'], [280, 150, 'патчи', '16 × 16 → 256'], [280, 232, 'токены энкодера', '256 × ширина'], [280, 328, 'токены картинки', 'ширина модели'], [280, 414, 'запрос', 'слова'], [280, 596, 'ответ', 'слово за словом']],
          capPhase: [0, 0, 1, 2, 3, 5],
          arrows: [[110, 94, 110, 118, 0], [110, 162, 110, 184, 1], [110, 258, 110, 282, 2], [110, 312, 110, 336, 2], [110, 358, 110, 380, 3], [110, 430, 110, 456, 4], [110, 506, 110, 530, 5]],
          pic: [110, 62, 60], patches: [60, 140], enc: [110, 232], proj: [110, 300], vis: [60, 350], q: [86, 418],
          lm: [110, 482], ans: [[62, 566], [142, 566], [222, 566]], ansCap: [110, 600],
        });
      },
    },
  });
})();

/* =====================================================================
   Общая мини-VLM: обучается в лаборатории, нужна интерактивам 1 и 2.
   Четыре стадии: контрастное предобучение энкодера, предобучение языковой
   модели на тексте, этап 1 (проектор), этап 2 (проектор и языковая модель).
   Снимки параметров после каждой стадии — для сравнения «до — после».
   ===================================================================== */
const Store = (() => {
  const E = L32, SEED = 9, N_DATA = 200;
  const CFG = { encIters: 600, encLr: 0.004, lmIters: 150, projEp: 20, projLr: 0.005, lmEp: 80, lmLr: 0.005 };
  const STAGES = [
    { id: 'enc', name: 'энкодер: контрастное предобучение', total: CFG.encIters, unit: 'шаг' },
    { id: 'lm', name: 'языковая модель: текст подписей', total: CFG.lmIters, unit: 'шаг' },
    { id: 'proj', name: 'этап 1: только проектор', total: CFG.projEp, unit: 'проход' },
    { id: 'vlm', name: 'этап 2: проектор и языковая модель', total: CFG.lmEp, unit: 'проход' },
  ];
  let m = E.vlmInit(SEED), data = E.makeData(N_DATA, 100), trained = false, busy = null, snaps = {}, scratch = null, scratchBusy = null, scratchDone = false;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  const snap = (key) => { snaps[key] = { proj: E.cloneParams(E.projParams(m)), lm: E.cloneParams(E.lmParams(m)) }; };
  /** Обучить общую модель (или дождаться идущего обучения). onEv(ev): { stage, i, total, text } */
  function train(onEv) {
    if (trained) return Promise.resolve(m);
    if (busy) return busy;
    const per = Math.max(1, Math.round(SPEED.k));
    busy = (async () => {
      await runGen(E.pretrainEncoder(m, { iters: CFG.encIters, lr: CFG.encLr }), per, (e) => onEv && onEv({ stage: 'enc', i: e.it + 1, total: e.iters, text: `потери ${fmt(e.loss, 2)}` }));
      await runGen(E.pretrainLM(m, { iters: CFG.lmIters }), per * 3, (e) => onEv && onEv({ stage: 'lm', i: e.it + 1, total: e.iters, text: `потери ${fmt(e.loss, 2)}` }));
      snap('s0');
      await runGen(E.trainVLM(m, data, { stage: 'proj', epochs: CFG.projEp, lr: CFG.projLr }), per, (e) => onEv && onEv({ stage: 'proj', i: e.ep + 1, total: e.epochs, text: `верно на обучении ${pc(e.acc)}` }));
      snap('s1');
      await runGen(E.trainVLM(m, data, { stage: 'lm', epochs: CFG.lmEp, lr: CFG.lmLr }), per, (e) => onEv && onEv({ stage: 'vlm', i: e.ep + 1, total: e.epochs, text: `верно на обучении ${pc(e.acc)}` }));
      snap('s2');
      trained = true; busy = null; emit(); return m;
    })();
    return busy;
  }
  /** Модель с энкодером с нуля: те же начальные веса проектора и языковой модели, те же подписи и проходы, энкодер случайный и обучается. */
  function trainScratch(onEv) {
    if (scratchDone) return Promise.resolve(scratch);
    if (scratchBusy) return scratchBusy;
    const per = Math.max(1, Math.round(SPEED.k));
    scratchBusy = (async () => {
      scratch = E.vlmInit(SEED); E.finish(E.pretrainLM(scratch, { iters: CFG.lmIters }));
      const d2 = data.map((d) => ({ c: d.c, s: d.s, img: d.img, patches: d.patches, tok: null }));
      await runGen(E.trainVLM(scratch, d2, { stage: 'all', epochs: CFG.lmEp, lr: CFG.lmLr }), per, (e) => onEv && onEv({ stage: 'scratch', i: e.ep + 1, total: e.epochs, text: `верно на обучении ${pc(e.acc)}` }));
      scratchDone = true; scratchBusy = null; emit(); return scratch;
    })();
    return scratchBusy;
  }
  /** Выполнить fn при параметрах проектора и языковой модели из снимка key ('s0' до проектора, 's1' после этапа 1, 's2' после этапа 2). */
  function withSnapshot(key, fn) {
    const s = snaps[key]; if (!s) return fn(m);
    const cur = { proj: E.cloneParams(E.projParams(m)), lm: E.cloneParams(E.lmParams(m)) };
    E.loadParams(E.projParams(m), s.proj); E.loadParams(E.lmParams(m), s.lm);
    try { return fn(m); } finally { E.loadParams(E.projParams(m), cur.proj); E.loadParams(E.lmParams(m), cur.lm); }
  }
  function reset() {
    if (busy || scratchBusy) return false;
    m = E.vlmInit(SEED); data = E.makeData(N_DATA, 100); trained = false; snaps = {}; scratch = null; scratchDone = false; emit(); return true;
  }
  return { get m() { return m; }, get data() { return data; }, get trained() { return trained; }, get busy() { return !!busy; }, get scratch() { return scratch; }, get scratchDone() { return scratchDone; }, get snaps() { return snaps; },
    CFG, STAGES, SEED, train, trainScratch, withSnapshot, reset, onChange: (f) => listeners.push(f) };
})();

/* =====================================================================
   1. Патчи → токены: нарезка, токены, позиции, перестановка
   ===================================================================== */
const LabPatches = (() => {
  const E = L32, W = 640, H = 300;
  const PERM = E.rng(42); const perm = Array.from({ length: E.NP }, (_, i) => i); for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(PERM() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const st = { color: 'red', shape: 'cube', perm: 0, pos: 1, img: null, patches: null, bm: null, res: null };
  let ctl = null;
  function makeImg() { st.img = E.icon(st.color, st.shape, E.rng(2024)); st.patches = E.patchify(st.img); st.bm = bitmap(st.img, L21.IS, L21.IS); }
  /** Исходная и перемешанная нарезка через текущий энкодер (случайный до обучения, предобученный после). */
  function compute() {
    const enc = Store.m.enc, o = { noPos: !st.pos }, base = E.encF(enc, st.patches, o), pp = st.perm ? E.permutePatches(st.patches, perm) : st.patches, cur = E.encF(enc, pp, o);
    st.res = { base, cur, pp, cos: E.cosine(base.pooled, cur.pooled), trained: Store.trained };
  }
  function state() { return { color: st.color, shape: st.shape, perm: st.perm, pos: st.pos, cos: st.res ? st.res.cos : 1, trained: Store.trained }; }
  function draw() {
    if (!st.res) compute();
    const { c, k } = HeroKit.fit($('#pCv'), W, H), P = pal(), narrow = k > 1.5, R = st.res;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    // картинка, собранная из патчей в текущем порядке
    const S = 176, x0 = 18, y0 = 48, cell = S / 4;
    const shown = st.perm ? (() => { const img = new Float32Array(L21.IS * L21.IS * 3); for (let p = 0; p < E.NP; p++) { const src = perm[p], sx = (src % 4) * 4, sy = Math.floor(src / 4) * 4, dx = (p % 4) * 4, dy = Math.floor(p / 4) * 4; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const a = ((dy + y) * L21.IS + dx + x) * 3, b = ((sy + y) * L21.IS + sx + x) * 3; img[a] = st.img[b]; img[a + 1] = st.img[b + 1]; img[a + 2] = st.img[b + 2]; } } return bitmap(img, L21.IS, L21.IS); })() : st.bm;
    drawBitmap(c, shown, x0, y0, S, S);
    c.strokeStyle = P.ink; c.lineWidth = 1; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(x0 + i * cell, y0); c.lineTo(x0 + i * cell, y0 + S); c.moveTo(x0, y0 + i * cell); c.lineTo(x0 + S, y0 + i * cell); c.stroke(); }
    for (let p = 0; p < E.NP; p++) { const src = st.perm ? perm[p] : p; HeroKit.label(c, k, String(src), x0 + (p % 4) * cell + 9, y0 + Math.floor(p / 4) * cell + 9, { px: 9.5, weight: 700, color: st.perm && src !== p ? P.e2e : P.ink2, haloColor: P.surf }); }
    HeroKit.label(c, k, st.perm ? 'патчи перемешаны' : 'картинка 16 × 16, патчи 4 × 4', x0 + S / 2, 30, { px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
    HeroKit.label(c, k, 'номер — исходный патч', x0 + S / 2, y0 + S + 16, { px: 10, color: P.ink3, haloColor: P.bg });
    // токены: линейная проекция каждого патча (до внимания), столбики 16 чисел
    const tx = 228, ty = 60, tw = 13, gap = 7, th = 128;
    HeroKit.label(c, k, narrow ? 'токены' : 'токены: патч × матрица E', tx + 8 * (tw + gap), 30, { px: 11, weight: 700, color: P.cl, haloColor: P.bg });
    const emb = R.cur.emb;
    for (let p = 0; p < E.NP; p++) {
      const x = tx + p * (tw + gap), v = emb.subarray(p * E.DE, (p + 1) * E.DE);
      vecBar(c, v, x, ty, tw, th, P, true);
      c.strokeStyle = P.line; c.strokeRect(x, ty, tw, th);
      // позиция: квадратик с номером места
      c.fillStyle = st.pos ? P.hy : P.bg2; c.globalAlpha = st.pos ? 0.85 : 1; c.fillRect(x, ty + th + 8, tw, tw); c.globalAlpha = 1;
      if (!st.pos) { c.strokeStyle = P.line; c.setLineDash([2, 2]); c.strokeRect(x, ty + th + 8, tw, tw); c.setLineDash([]); }
      if (!narrow || p % 2 === 0) HeroKit.label(c, k, String(p), x + tw / 2, ty + th + 32, { px: 9.5, color: P.ink3, haloColor: P.bg });
    }
    HeroKit.label(c, k, st.pos ? '+ вектор позиции' : 'без векторов позиций', tx + 8 * (tw + gap), ty + th + 50, { px: 10.5, weight: 650, color: st.pos ? P.hy : P.ink3, haloColor: P.bg });
    // выход энкодера: среднее токенов после блока внимания
    const ox = 560, oy = 60;
    HeroKit.label(c, k, 'выход', ox + 30, 30, { px: 11, weight: 700, color: P.ink2, haloColor: P.bg });
    vecBar(c, R.base.pooled, ox, oy, 20, th, P, true); c.strokeStyle = P.line; c.strokeRect(ox, oy, 20, th);
    vecBar(c, R.cur.pooled, ox + 40, oy, 20, th, P, true); c.strokeRect(ox + 40, oy, 20, th);
    HeroKit.label(c, k, 'исход.', ox + 10, oy + th + 14, { px: 9.5, color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, 'сейчас', ox + 50, oy + th + 14, { px: 9.5, color: P.ink3, haloColor: P.bg });
    HeroKit.label(c, k, `сходство ${fmt(R.cos, 3)}`, ox + 30, oy + th + 34, { px: 11, weight: 700, color: R.cos > 0.9999 ? P.good : P.e2e, haloColor: P.bg });
    HeroKit.label(c, k, '→', 206, 124, { px: 18, color: P.ink3, halo: false }); HeroKit.label(c, k, '→', 548, 124, { px: 18, color: P.ink3, halo: false });
    out();
  }
  function out() {
    const R = st.res, s = state();
    setOut($('#pOut'), `Энкодер: ${Store.trained ? 'предобученный в лаборатории' : 'случайные веса (до обучения в лаборатории)'}. Патчи ${st.perm ? 'перемешаны' : 'по порядку'}, векторы позиций ${st.pos ? 'есть' : 'убраны'}: сходство среднего выхода с выходом для исходной картинки — <b>${fmt(s.cos, 3)}</b>${st.perm && !st.pos ? ' — набор токенов тот же, порядок внимание не видит' : st.perm ? ' — те же токены, но с другими позициями' : ''}.`);
  }
  function refresh() { compute(); draw(); if (ctl) ctl.update(); }
  function setObj(color, shape) { if (color) st.color = color; if (shape) st.shape = shape; segSet('#pColor', st.color); segSet('#pShape', st.shape); makeImg(); refresh(); }
  function setPerm(v) { st.perm = +v; segSet('#pPerm', st.perm); refresh(); }
  function setPos(v) { st.pos = +v; segSet('#pPos', st.pos); refresh(); }
  const api = {
    reset() { st.perm = 0; st.pos = 1; segSet('#pPerm', 0); segSet('#pPos', 1); setObj('red', 'cube'); },
    state, setObj, setPerm, setPos,
    async compare() { setPerm(1); await new Promise((r) => setTimeout(r, 250 / SPEED.k)); setPos(0); return state(); },
  };
  const missions = [
    { short: 'Перемешай', title: 'Перемешай патчи', text: 'Иконка нарезана на 16 патчей, каждый стал токеном — столбиком из 16 чисел, и к каждому прибавлен вектор его позиции. Переключи «Патчи» на «перемешаны» и посмотри на картинку, токены и выход энкодера.',
      controls: ['perm'],
      criteria: [{ label: 'Патчи перемешаны', test: (r, s) => s.perm === 1 }, { label: 'Векторы позиций на месте', test: (r, s) => s.pos === 1 }],
      hint: 'Переключатель «Патчи» — под сценой.',
      explain: (s) => `Картинка стала неузнаваемой, а столбики токенов — те же самые, только в другом порядке: матрица E одна для всех патчей. Различие пришло из векторов позиций: патч ${perm[0]} теперь получает вектор места 0, и среднее на выходе энкодера изменилось, сходство с исходным — ${fmt(s.cos, 3)}. Так модель узнаёт, что порядок другой.` },
    { short: 'Без позиций', title: 'Убери векторы позиций', text: 'Оставим патчи перемешанными и уберём векторы позиций: токены пойдут во внимание такими, какими вышли из матрицы E.',
      bet: { q: 'что станет с выходом энкодера для перемешанной картинки?', options: ['Изменится: патчи стоят в другом порядке', 'Не изменится: без позиций это мешок патчей', 'Станет нулевым'], answer: (r) => (r.cos > 0.9999 ? 1 : 0) },
      action: { label: 'Убрать позиции и сравнить', run: (X) => X.compare() },
      criteria: [{ label: 'Патчи перемешаны, векторов позиций нет', test: (r) => r.perm === 1 && r.pos === 0 }, { label: 'Выход совпал с выходом для исходной картинки', test: (r) => r.cos > 0.9999 }],
      explain: (r) => `Сходство ${fmt(r.cos, 3)}: энкодер не отличает перемешанную картинку от исходной. Внимание всех ко всем — это взвешенные суммы, и перестановка входов переставляет выходы, а среднее по ним не меняется. Без векторов позиций картинка для трансформера — мешок патчей; в статье ViT такой вариант даёт 0,614 против 0,642 с позициями на ImageNet в режиме пяти примеров на класс. Какой именно способ кодировать позицию, одномерный или двумерный, почти не важно.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Меняй предмет, перемешивай патчи, убирай позиции. Найди форму, для которой перестановка с позициями меняет выход сильнее всего, и подумай, почему для мяча и кубика это разные числа.', final: true, controls: ['obj', 'perm', 'pos'] },
  ];
  function init() {
    objectPickers('#pColor', '#pShape', st, (col, sh) => setObj(col, sh));
    segBind('#pPerm', setPerm); segBind('#pPos', setPos);
    makeImg(); compute();
    ctl = mountMissions('#pMis', missions, api, { controls: { obj: '#wrapPObj', perm: '#wrapPPerm', pos: '#wrapPPos' } });
    draw(); redrawOn(draw);
    Store.onChange(refresh);
    return ctl;
  }
  return { init, api, st, perm };
})();

/* =====================================================================
   2. Мини-VLM описывает картинку: обучение, проверка на новых картинках,
      сравнение предобученного энкодера с энкодером с нуля
   ===================================================================== */
const LabVLM = (() => {
  const E = L32, W = 640, H = 250, GW = 640, GH = 260;
  const st = { color: 'red', shape: 'cube', dx: 0, R: 5.8, noise: 0.02, img: null, bm: null, gen: null, genB: null, res: null, resB: null, tests: null, busy: false, log: {} };
  let ctl = null;
  const TEST_SEED = 900;
  function makeTests() {
    const r = E.rng(TEST_SEED); st.tests = [];
    for (const s of L21.SHAPES) for (const c of L21.COLORS) { const img = E.icon(c.id, s.id, r); st.tests.push({ c: c.id, s: s.id, img, patches: E.patchify(img), bm: bitmap(img, L21.IS, L21.IS), a: null, b: null }); }
  }
  function makeImg() { st.img = E.iconAt(st.color, st.shape, { dx: st.dx, R: st.R, noise: st.noise, seed: 3 }); st.bm = bitmap(st.img, L21.IS, L21.IS); }
  function describe() {
    st.gen = E.generate(Store.m, st.img);
    st.genB = Store.scratchDone ? E.generate(Store.scratch, st.img) : null;
  }
  /** Проверка модели на новых картинках: 24 сочетания по 4 картинки, плюс 8 фиолетовых кубиков и что в них видит энкодер. */
  function evaluate(m) {
    const ev = E.evaluate(m, 777, 4), r = E.rng(777), words = {}; let colorOk = 0, encOk = 0, exact = 0;
    for (let k = 0; k < 8; k++) { const img = E.icon('purple', 'cube', r), g = E.generate(m, img), n = E.clipNearest(m, E.patchify(img)), t = sayWords(g.words); words[t] = (words[t] || 0) + 1; if (g.color === 'purple') colorOk++; if (g.color === 'purple' && g.shape === 'cube') exact++; if (n.color === 'purple' && n.shape === 'cube') encOk++; }
    const top = Object.entries(words).sort((a, b) => b[1] - a[1])[0];
    return { acc: ev.acc, held: exact / 8, heldColor: colorOk / 8, encHeld: encOk / 8, heldTop: top ? top[0] : '—', heldTopN: top ? top[1] : 0, per: ev.per };
  }
  function state() { return { color: st.color, shape: st.shape, dx: st.dx, R: st.R, noise: st.noise, trained: Store.trained, scratch: Store.scratchDone, acc: st.res ? st.res.acc : null, accB: st.resB ? st.resB.acc : null, held: st.res ? st.res.held : null, said: st.gen ? st.gen.words.slice() : [], okNow: !!st.gen && st.gen.color === st.color && st.gen.shape === st.shape && st.gen.words.length === 2 }; }
  /* ---------- журнал обучения ---------- */
  function logRow(id, name) { const box = $('#vLog'); box.hidden = false; let row = box.querySelector(`[data-stage="${id}"]`); if (!row) { row = h('div', { class: 'tl-row', 'data-stage': id }, h('span', { class: 'tl-name' }, name), h('span', { class: 'tl-bar' }, h('i')), h('span', { class: 'tl-val' }, '')); box.append(row); } return row; }
  function logEv(ev) {
    const stg = Store.STAGES.find((s) => s.id === ev.stage), row = logRow(ev.stage, stg ? stg.name : 'энкодер с нуля: всё вместе');
    row.className = 'tl-row ' + (ev.i >= ev.total ? 'done' : 'cur'); row.querySelector('i').style.width = (ev.i / ev.total * 100).toFixed(1) + '%'; if (ev.stage === 'scratch') row.querySelector('i').style.setProperty('--c', 'var(--classic)');
    row.querySelector('.tl-val').textContent = `${ev.i}/${ev.total} · ${ev.text}`;
  }
  /* ---------- рисование конвейера ---------- */
  function drawPipe() {
    const { c, k } = HeroKit.fit($('#vCv'), W, H), P = pal(), narrow = k > 1.5, g = st.gen;
    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    const S = 112, x0 = 16, y0 = 40;
    drawBitmap(c, st.bm, x0, y0, S, S); c.strokeStyle = P.ink3; c.lineWidth = 1; c.strokeRect(x0, y0, S, S);
    for (let i = 1; i < 4; i++) { c.strokeStyle = P.line; c.beginPath(); c.moveTo(x0 + i * S / 4, y0); c.lineTo(x0 + i * S / 4, y0 + S); c.moveTo(x0, y0 + i * S / 4); c.lineTo(x0 + S, y0 + i * S / 4); c.stroke(); }
    HeroKit.label(c, k, narrow ? 'картинка' : 'картинка → 16 патчей', x0 + S / 2, 24, { px: narrow ? 9.5 : 11, weight: 700, color: P.ink2, haloColor: P.bg });
    if (narrow) { HeroKit.label(c, k, colorWord(st.color, L21.SHAPES[L21.SI[st.shape]].g), x0 + S / 2, y0 + S + 14, { px: 9, color: P.ink3, haloColor: P.bg }); HeroKit.label(c, k, shapeWord(st.shape), x0 + S / 2, y0 + S + 14 + 11 * k, { px: 9, color: P.ink3, haloColor: P.bg }); }
    else HeroKit.label(c, k, `${colorWord(st.color, L21.SHAPES[L21.SI[st.shape]].g)} ${shapeWord(st.shape)}`, x0 + S / 2, y0 + S + 16, { px: 10.5, color: P.ink3, haloColor: P.bg });
    // энкодер: 16 токенов
    const ex = 160, ey = 44, tw = 7, gap = 3, th = 104;
    HeroKit.label(c, k, 'энкодер', ex + 8 * (tw + gap), 24, { px: narrow ? 9.5 : 11, weight: 700, color: P.cl, haloColor: P.bg });
    if (g) for (let p = 0; p < E.NP; p++) vecBar(c, g.tokens.subarray(p * E.DE, (p + 1) * E.DE), ex + p * (tw + gap), ey, tw, th, P, true);
    c.strokeStyle = P.line; c.strokeRect(ex - 2, ey - 2, 16 * (tw + gap) + 1, th + 4);
    HeroKit.label(c, k, '16 × 16', ex + 8 * (tw + gap), ey + th + 16, { px: narrow ? 9 : 10, color: P.ink3, haloColor: P.bg });
    // проектор
    const px = 338; HeroKit.label(c, k, narrow ? 'W' : 'проектор W', px, 24, { px: narrow ? 9.5 : 11, weight: 700, color: P.hy, haloColor: P.bg });
    c.strokeStyle = P.hy; c.lineWidth = 1.6; c.strokeRect(px - 16, ey + 30, 32, 44); HeroKit.label(c, k, '16×16', px, ey + 52, { px: 9.5, color: P.hy, halo: false });
    // токены картинки в пространстве языковой модели
    const vx = 372; if (g) for (let p = 0; p < E.NP; p++) vecBar(c, g.img.subarray(p * E.DL, (p + 1) * E.DL), vx + p * (tw + gap), ey, tw, th, P, true);
    c.strokeStyle = P.hy; c.lineWidth = 1; c.strokeRect(vx - 2, ey - 2, 16 * (tw + gap) + 1, th + 4);
    HeroKit.label(c, k, narrow ? 'токены' : 'токены картинки', vx + 8 * (tw + gap), 24, { px: narrow ? 9.5 : 11, weight: 700, color: P.hy, haloColor: P.bg });
    HeroKit.label(c, k, narrow ? '→ LM' : '→ языковая модель', vx + 8 * (tw + gap), ey + th + 16, { px: narrow ? 9 : 10, color: P.ink3, haloColor: P.bg });
    // ответ: слово за словом с вероятностями
    const ax = 548, ay = narrow ? 56 : 44;
    HeroKit.label(c, k, 'ответ', ax + 40, 24, { px: narrow ? 9.5 : 11, weight: 700, color: P.e2e, haloColor: P.bg });
    if (g) g.steps.forEach((sp, i) => {
      const y = ay + i * 40, ok = i === 0 ? sp.text === st.color : i === 1 ? sp.text === st.shape : sp.pick === E.EOS;
      const label = sp.pick === E.EOS ? '<eos>' : L21.CI[sp.text] != null ? colorWord(sp.text, i === 0 && g.words[1] && L21.SI[g.words[1]] != null ? L21.SHAPES[L21.SI[g.words[1]]].g : 'm') : L21.SI[sp.text] != null ? shapeWord(sp.text) : sp.text;
      c.fillStyle = P.bg2; c.fillRect(ax, y, 80, 10); c.fillStyle = ok ? P.good : P.bad; c.fillRect(ax, y, 80 * sp.p, 10);
      HeroKit.label(c, k, label, narrow ? W - 6 : ax + 40, y + 24, { px: narrow ? 9 : 11.5, weight: 700, align: narrow ? 'right' : 'center', color: ok ? P.good : P.bad, haloColor: P.bg });
      if (!narrow) HeroKit.label(c, k, pc(sp.p), ax + 80, y - 7, { px: 9, align: 'right', color: P.ink3, haloColor: P.bg }); // на узком экране вероятность видна по длине полоски
    });
    if (!Store.trained) HeroKit.label(c, k, narrow ? 'Не обучена: нажми «Обучить мини-VLM»' : 'Модель ещё не обучена, ответ случайный: нажми «Обучить мини-VLM» в карточке миссии', W / 2, H - 14, { px: narrow ? 9.5 : 11, weight: 700, color: P.bad, haloColor: P.bg });
    else if (st.genB) HeroKit.label(c, k, `с нуля: ${sayWords(st.genB.words)}`, W - 8, ay + 150, { px: narrow ? 9 : 10, align: 'right', color: P.cl, haloColor: P.bg });
    for (const x of [140, 326, 352, 532]) HeroKit.label(c, k, '→', x, 96, { px: 16, color: P.ink3, halo: false });
  }
  /* ---------- сетка проверки: 24 новые картинки, подписи обеих моделей ---------- */
  function drawGrid() {
    const cv = $('#vGrid'); if (!st.res) { cv.hidden = true; $('#vGridH').hidden = true; $('#vGridNote').hidden = true; return; }
    cv.hidden = false; $('#vGridH').hidden = false; $('#vGridNote').hidden = false;
    const narrow0 = GW / (cv.getBoundingClientRect().width || GW) > 1.5, cols = narrow0 ? 3 : 6, rows = 24 / cols;
    const two = !!st.resB, rowH = two ? 72 : 60, GH2 = rows * rowH + 8; cv.style.aspectRatio = `${GW} / ${GH2}`;
    const { c, k } = HeroKit.fit(cv, GW, GH2), P = pal(), narrow = k > 1.5, cw = GW / cols;
    c.fillStyle = P.bg; c.fillRect(0, 0, GW, GH2);
    st.tests.forEach((t, i) => {
      const col = i % cols, row = Math.floor(i / cols), x = col * cw, y = 4 + row * rowH, S = 30;
      drawBitmap(c, t.bm, x + cw / 2 - S / 2, y, S, S);
      if (E.isHeld(t.c, t.s)) { c.setLineDash([3, 3]); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.strokeRect(x + cw / 2 - S / 2 - 2, y - 2, S + 4, S + 4); c.setLineDash([]); }
      const put = (g, yy, colOk, colBad) => { const ok = g.color === t.c && g.shape === t.s && g.words.length === 2; HeroKit.label(c, k, (ok ? '✓ ' : '✗ ') + sayWords(g.words), x + cw / 2, yy, { px: narrow ? 9.5 : 10, weight: 650, color: ok ? colOk : colBad, haloColor: P.bg }); };
      if (t.a) put(t.a, y + S + 11, P.good, P.bad);
      if (two && t.b) put(t.b, y + S + 24, P.cl, P.bad);
    });
  }
  function out() {
    const s = state(), g = st.gen;
    let t = Store.trained ? `Модель обучена. На входе — ${colorWord(st.color, L21.SHAPES[L21.SI[st.shape]].g)} ${shapeWord(st.shape)}${st.dx ? `, сдвиг ${st.dx} px` : ''}${st.R !== 5.8 ? `, размер ${fmt(st.R, 1)}` : ''}${st.noise !== 0.02 ? `, шум ${fmt(st.noise, 2)}` : ''}; ответ — <b>${g ? sayWords(g.words) : '—'}</b>${s.okNow ? ' ✓' : ' ✗'}.` : 'Модель ещё не обучена: ответ случайный. Нажми «Обучить мини-VLM» в карточке миссии.';
    if (st.res) t += ` Новые картинки знакомых сочетаний: верно <b>${pc(st.res.acc)}</b>${st.resB ? `, с энкодером с нуля — <b>${pc(st.resB.acc)}</b>` : ''}. Пунктиром в сетке обведён фиолетовый кубик.`;
    setOut($('#vOut'), t);
  }
  function render() { describe(); drawPipe(); drawGrid(); out(); }
  async function train() {
    st.busy = true; $('#vLog').innerHTML = ''; $('#vLog').hidden = false;
    await Store.train((ev) => { logEv(ev); if (ev.stage === 'vlm' && ev.i % 10 === 0) { describe(); drawPipe(); } });
    st.res = evaluate(Store.m); st.tests.forEach((t) => { t.a = E.generate(Store.m, t.img); });
    st.busy = false; render(); if (LabSpace.onTrained) LabSpace.onTrained();
    return Object.assign({ trained: true }, st.res);
  }
  async function trainScratch() {
    if (!Store.trained) await train();
    st.busy = true;
    await Store.trainScratch((ev) => logEv(ev));
    st.resB = evaluate(Store.scratch); st.tests.forEach((t) => { t.b = E.generate(Store.scratch, t.img); });
    st.busy = false; render();
    return { accA: st.res.acc, accB: st.resB.acc, heldA: st.res.held, heldB: st.resB.held, encHeldB: st.resB.encHeld };
  }
  function setObj(color, shape) { if (color) st.color = color; if (shape) st.shape = shape; segSet('#vColor', st.color); segSet('#vShape', st.shape); makeImg(); render(); if (ctl) ctl.update(); }
  function setDx(v) { st.dx = +v; $('#vDx').value = st.dx; syncRange($('#vDx'), `${st.dx} px`); makeImg(); render(); if (ctl) ctl.update(); }
  function setR(v) { st.R = +v; $('#vR').value = st.R; syncRange($('#vR'), fmt(st.R, 1)); makeImg(); render(); if (ctl) ctl.update(); }
  function setNoise(v) { st.noise = +v; $('#vNoise').value = st.noise; syncRange($('#vNoise'), fmt(st.noise, 2)); makeImg(); render(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.res = null; st.resB = null; st.tests.forEach((t) => { t.a = null; t.b = null; }); $('#vLog').innerHTML = ''; $('#vLog').hidden = true; st.dx = 0; st.R = 5.8; st.noise = 0.02; syncRange($('#vDx'), '0 px'); $('#vDx').value = 0; $('#vR').value = 5.8; syncRange($('#vR'), '5,8'); $('#vNoise').value = 0.02; syncRange($('#vNoise'), '0,02'); setObj('red', 'cube'); },
    state, train, trainScratch, setObj, setDx, setR, setNoise, evaluate,
  };
  const missions = [
    { short: 'Обучи', title: 'Обучи мини-VLM и проверь на новых картинках', text: 'Четыре стадии подряд: энкодер учится контрастно на потоке картинок всех 24 сочетаний, языковая модель — на тексте подписей, потом проектор при замороженных соседях и, наконец, проектор вместе с языковой моделью на 200 подписях, среди которых нет фиолетового кубика. Проверка — на новых картинках всех 24 сочетаний.',
      onEnter: (X) => X.setObj('purple', 'cube'),
      bet: { q: 'как модель опишет фиолетовый кубик, которого не было среди подписей?', options: ['Верно: энкодер видел фиолетовые кубики, а цвет и форма — отдельные слова', 'Цвет верно, форму — из тех, что шли после слова «фиолетовый»', 'Не узнает ни цвет, ни форму'], answer: (r) => (r.held >= 0.5 ? 0 : r.heldColor >= 0.5 ? 1 : 2) },
      action: { label: 'Обучить мини-VLM', run: (X) => X.train() },
      criteria: [{ label: 'Четыре стадии обучения завершены', test: (r) => r.trained }, { label: 'Новые картинки знакомых сочетаний: верно не меньше 90%', test: (r) => r.acc >= 0.9 }],
      summary: (r) => `знакомые сочетания ${pc(r.acc)}, фиолетовый кубик ${r.held * 8} из 8`,
      explain: (r) => {
        const base = `На новых картинках 23 знакомых сочетаний модель права в ${pc(r.acc)} случаев: слова она берёт из картинки, а не запоминает 200 подписей. Фиолетовый кубик (8 новых картинок): точное описание в ${r.held * 8} из 8, цвет «фиолетовый» — в ${r.heldColor * 8} из 8, чаще всего ответ «${r.heldTop}» (${r.heldTopN} из 8). Энкодер при этом знает, что видит: его ближайшая подпись в контрастном пространстве — «фиолетовый кубик» для ${r.encHeld * 8} из 8 картинок.`;
        if (r.held >= 0.5) return base + ' Знание энкодера дошло до слов: цвет и форма закодированы по отдельности, и языковая модель прочитала оба. Так CLIPort в уроке 2.1 брал цвета, которых не было в демонстрациях, из CLIP.';
        return base + ' Цвет языковая модель прочитала из картинки, а форму после слова «фиолетовый» договорила по подписям: среди 200 подписей после «фиолетовый» шли мяч, миска и банка, но не кубик, и этот текстовый опыт перевесил токены картинки. Авторы LLaVA описывают такой же сбой: на вопрос про клубничный йогурт модель ответила «да», хотя в холодильнике были йогурт и клубника по отдельности. Лечится это разнообразием подписей, и поэтому PaliGemma учится на миллиарде примеров.';
      } },
    { short: 'С нуля', title: 'Энкодер с нуля против предобученного', text: 'Вторая модель получает те же начальные веса проектора и языковой модели, те же 200 подписей и те же 80 проходов, но её энкодер случайный и обучается вместе со всем — он никогда не видел картинок вне этих 200. Подписи обеих моделей появятся в сетке проверки рядом.',
      bet: { q: 'какая модель точнее на новых картинках?', options: ['С нуля: энкодер подстроится под задачу', 'Предобученный: он видел в десятки раз больше картинок', 'Одинаково: подписи те же'], answer: (r) => (r.accA - r.accB >= 0.05 ? 1 : r.accB - r.accA >= 0.05 ? 0 : 2) },
      action: { label: 'Обучить энкодер с нуля и сравнить', run: (X) => X.trainScratch() },
      criteria: [{ label: 'Модель с энкодером с нуля обучена', test: (r) => r.accB != null }, { label: 'Предобученный энкодер точнее хотя бы на 5 процентных пунктов', test: (r) => r.accA - r.accB >= 0.05 }],
      summary: (r) => `предобученный ${pc(r.accA)}, с нуля ${pc(r.accB)}`,
      explain: (r) => `Предобученный энкодер: ${pc(r.accA)} на новых картинках, энкодер с нуля: ${pc(r.accB)}. Сколько именно пунктов разницы — дело случая: модель с нуля учится неустойчиво, и на десяти разных зёрнах случайности разрыв от 5 до 32 пунктов, но предобученный энкодер впереди на каждом. За контрастное предобучение энкодер увидел 600 × 16 = 9600 картинок всех сочетаний, а энкодеру с нуля достались 200, и часть его ошибок — на сочетаниях, которые он видел всего по 8–9 раз. Это довод LLaVA: энкодер CLIP, обученный на 400 миллионах пар, берут готовым и не трогают, а учат только мост к языковой модели. PaliGemma энкодер дообучает, но на миллиарде примеров и с медленным разогревом его скорости обучения; у нас таких данных нет.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Двигай предмет, меняй размер и шум. В обучающих картинках сдвиг не превышал 1,5 px, размер был от 5,2 до 6,5, шум — 0,04. Найди сдвиг, при котором модель начинает ошибаться, и посмотри, какое из двух слов ломается первым и что при этом отвечает модель с энкодером с нуля.', final: true, controls: ['obj', 'dx', 'r', 'noise'] },
  ];
  function init() {
    objectPickers('#vColor', '#vShape', st, (col, sh) => { if (!st.busy) setObj(col, sh); });
    $('#vDx').addEventListener('input', (e) => setDx(e.target.value)); $('#vR').addEventListener('input', (e) => setR(e.target.value)); $('#vNoise').addEventListener('input', (e) => setNoise(e.target.value));
    syncRange($('#vDx'), '0 px'); syncRange($('#vR'), '5,8'); syncRange($('#vNoise'), '0,02');
    makeTests(); makeImg();
    ctl = mountMissions('#vMis', missions, api, { controls: { obj: '#wrapVObj', dx: '#wrapVDx', r: '#wrapVR', noise: '#wrapVNoise' }, scene: '#vCv' });
    render(); redrawOn(() => { drawPipe(); drawGrid(); });
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Пространство слов языковой модели: две главные оси, слова,
      чтение модели и токены картинки до и после обучения проектора
   ===================================================================== */
const LabSpace = (() => {
  const E = L32, S = 320;
  const st = { stage: 1, what: 'read0', pts: null, basis: null, items: null };
  let ctl = null;
  function items() {
    if (st.items) return st.items; const r = E.rng(31); st.items = [];
    for (const s of L21.SHAPES) for (const c of L21.COLORS) { const img = E.icon(c.id, s.id, r); st.items.push({ c: c.id, s: s.id, patches: E.patchify(img) }); }
    return st.items;
  }
  /** Векторы для снимка key: слова, чтение перед цветом, чтение перед формой, средний токен картинки. */
  function vectors(key) {
    return Store.withSnapshot(key, (m) => {
      const words = E.wordVectors(m), read0 = [], read1 = [], tok = [];
      for (const it of items()) {
        const im = E.imageTokens(m, it.patches), h0 = E.lmF(m, im.img, [E.BOS]).h, h1 = E.lmF(m, im.img, [E.BOS, E.wid(it.c)]).h;
        read0.push(Float64Array.from(h0.subarray(0, E.DL))); read1.push(Float64Array.from(h1.subarray(E.DL, 2 * E.DL)));
        const mu = new Float64Array(E.DL); for (let p = 0; p < E.NP; p++) for (let k = 0; k < E.DL; k++) mu[k] += im.img[p * E.DL + k] / E.NP; tok.push(mu);
      }
      return { words, read0, read1, tok };
    });
  }
  const nearestWord = (v, words) => { let best = -9, bi = 0; words.forEach((w, i) => { const q = E.cosine(v, w); if (q > best) { best = q; bi = i; } }); return E.WORDS[bi]; };
  function compute() {
    if (!Store.trained) { st.pts = null; return; }
    const V = { s0: vectors('s0'), s1: vectors('s1'), s2: vectors('s2') };
    st.basis = E.pca2(V.s2.words.concat(V.s2.read0)).basis;
    const proj = (vs) => E.pca2(vs, st.basis).pts;
    const stat = (v) => { const its = items(); let c0 = 0, s1 = 0, t = 0; v.read0.forEach((h, i) => { if (nearestWord(h, v.words) === its[i].c) c0++; }); v.read1.forEach((h, i) => { if (nearestWord(h, v.words) === its[i].s) s1++; }); v.tok.forEach((h, i) => { const w = nearestWord(h, v.words); if (w === its[i].c || w === its[i].s) t++; }); return { read0: c0 / its.length, read1: s1 / its.length, tok: t / its.length }; };
    st.pts = {}; for (const key of ['s0', 's1', 's2']) st.pts[key] = { words: proj(V[key].words), read0: proj(V[key].read0), read1: proj(V[key].read1), tok: proj(V[key].tok), stat: stat(V[key]) };
  }
  function state() { const key = 's' + st.stage, p = st.pts && st.pts[key]; return { trained: Store.trained, stage: st.stage, what: st.what, near: p ? p.stat[st.what] : null, near0: st.pts ? st.pts.s0.stat[st.what] : null }; }
  function drawPanel(cv, key) {
    const { c, k } = HeroKit.fit(cv, S, S), P = pal(), narrow = k > 1.5;
    c.fillStyle = P.bg; c.fillRect(0, 0, S, S);
    if (!st.pts) { HeroKit.label(c, k, 'Пока пусто: мини-VLM не обучена', S / 2, S / 2 - 9 * k, { px: 12, weight: 700, color: P.ink2, halo: false }); HeroKit.label(c, k, 'нажми «Обучить и показать»', S / 2, S / 2 + 9 * k, { px: 12, color: P.ink3, halo: false }); return; }
    const p = st.pts[key], all = p.words.concat(p.read0, p.read1, p.tok, st.pts.s2.words, st.pts.s2.read0, st.pts.s2.read1, st.pts.s1.read0, st.pts.s0.read0);
    let mx = 1e-9; for (const [x, y] of all) mx = Math.max(mx, Math.abs(x), Math.abs(y));
    const X = (x) => S / 2 + x / mx * (S / 2 - 24), Y = (y) => S / 2 - y / mx * (S / 2 - 24);
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.stroke();
    const its = items(), pts = p[st.what];
    // точки картинок: цвет точки — цвет картинки, маркер — форма
    pts.forEach(([x, y], i) => {
      const it = its[i], col = rgbCss(it.c), px = X(x), py = Y(y), r = st.what === 'tok' ? 4 : 5;
      c.fillStyle = col; c.strokeStyle = P.ink; c.lineWidth = 1; c.globalAlpha = st.what === 'tok' ? 0.75 : 0.9;
      c.beginPath();
      if (it.s === 'ball') c.arc(px, py, r, 0, 7); else if (it.s === 'cube') c.rect(px - r, py - r, 2 * r, 2 * r); else if (it.s === 'can') c.rect(px - r * 0.6, py - r * 1.2, r * 1.2, r * 2.4); else { c.arc(px, py, r, 0, 7); c.moveTo(px + r * 0.45, py); c.arc(px, py, r * 0.45, 0, 7, true); }
      c.fill('evenodd'); c.stroke(); c.globalAlpha = 1;
    });
    // слова: цвета — кружки с заливкой, формы — квадраты
    p.words.forEach(([x, y], i) => {
      const w = E.WORDS[i], isC = L21.CI[w] != null, px = X(x), py = Y(y);
      c.fillStyle = P.surf; c.strokeStyle = isC ? rgbCss(w) : P.ink2; c.lineWidth = 2.2;
      c.beginPath(); if (isC) c.arc(px, py, 7, 0, 7); else c.rect(px - 7, py - 7, 14, 14); c.fill(); c.stroke();
      HeroKit.label(c, k, isC ? colorWord(w, 'm') : shapeWord(w), px, isC ? py - 13 : py + 16, { px: narrow ? 9.5 : 10.5, weight: 700, color: P.ink, haloColor: P.bg });
    });
    HeroKit.label(c, k, `главные оси · видно ${pc(st.basis.lam[0] + st.basis.lam[1])} разброса`, S / 2, S - 10, { px: 9.5, color: P.ink3, haloColor: P.bg });
  }
  function draw() { drawPanel($('#sCv0'), 's0'); drawPanel($('#sCv1'), 's' + st.stage); out(); }
  const WHAT = { read0: 'чтение перед первым словом', read1: 'чтение перед вторым словом', tok: 'средний токен картинки' };
  function out() {
    $('#sCap1').textContent = st.stage === 1 ? 'после этапа 1: обучен проектор' : 'после этапа 2: проектор и языковая модель';
    if (!st.pts) { setOut($('#sOut'), 'Чтобы увидеть пространство, нужна обученная мини-VLM: нажми «Обучить и показать» в карточке миссии (или обучи её в лаборатории выше).'); return; }
    const s = state(), what = WHAT[st.what], target = st.what === 'read1' ? 'её форма' : st.what === 'read0' ? 'её цвет' : 'её цвет или форма';
    setOut($('#sOut'), `Точки — ${what} для 24 картинок (цвет точки — цвет картинки, маркер — форма). Ближайшее слово к точке — ${target}: до обучения проектора у <b>${Math.round(s.near0 * 24)} из 24</b>, ${st.stage === 1 ? 'после этапа 1' : 'после этапа 2'} — у <b>${Math.round(s.near * 24)} из 24</b>.`);
  }
  function setStage(v) { st.stage = +v; segSet('#sStage', st.stage); draw(); if (ctl) ctl.update(); }
  function setWhat(v) { st.what = v; segSet('#sWhat', st.what); draw(); if (ctl) ctl.update(); }
  const api = {
    reset() { st.stage = 1; st.what = 'read0'; segSet('#sStage', 1); segSet('#sWhat', 'read0'); draw(); },
    state, setStage, setWhat,
    async ensure() { if (!Store.trained) await LabVLM.api.train(); compute(); setStage(1); setWhat('read0'); return state(); },
  };
  const missions = [
    { short: 'Этап 1', title: 'Что сделал один проектор', text: 'Слева — пространство до обучения проектора, справа — после этапа 1, когда учился только он, а языковая модель с её словами была заморожена. Точки — чтение модели перед первым словом: вектор, который сравнивается со словами, чтобы выбрать цвет.',
      bet: { q: 'куда встанут чтения после обучения проектора?', options: ['К словам своих цветов', 'Останутся в одной куче: модель заморожена', 'К словам форм'], answer: (r) => (r.near >= 0.5 ? 0 : 1) },
      action: { label: 'Обучить и показать', run: (X) => X.ensure() },
      criteria: [{ label: 'Мини-VLM обучена', test: (r) => r.trained }, { label: 'После этапа 1 ближайшее слово к чтению — цвет картинки не меньше чем у половины картинок', test: (r) => r.stage === 1 && r.what === 'read0' && r.near >= 0.5 }],
      explain: (r) => `До обучения проектора чтения всех картинок лежат рядом: языковая модель не различает картинки и предсказывает любой цвет. После этапа 1 ближайшее слово к чтению — цвет картинки у ${Math.round(r.near * 24)} из 24, хотя сама модель не изменилась ни на один вес. Одна матрица 16 × 16 подобрала токенам картинки такое место, из которого замороженное внимание вытаскивает цвет. Это и есть «визуальный токенизатор для замороженной языковой модели» из статьи LLaVA.` },
    { short: 'Этап 2', title: 'Чтение перед вторым словом', text: 'Переключи точки на чтение перед вторым словом и справа покажи состояние после этапа 2. Теперь модель уже прочитала слово цвета и выбирает форму.',
      controls: ['stage', 'what'],
      criteria: [{ label: 'Показано чтение перед вторым словом после этапа 2', test: (r, s) => s.trained && s.stage === 2 && s.what === 'read1' }, { label: 'Ближайшее слово — форма картинки не меньше чем у 18 из 24', test: (r, s) => s.trained && s.stage === 2 && s.what === 'read1' && s.near >= 0.75 }],
      hint: 'Переключатели «Справа» и «Точки» — под панелями.',
      explain: (r, ctx) => 'Перед вторым словом чтения собираются у слов форм, а цвет точки уже не важен: модель прочитала его и переключилась на форму. После этапа 2 языковая модель дообучилась вместе с проектором, и чтения стоят ближе к словам, чем после одного проектора. В LLaVA второй этап даёт основной прирост качества: без него способность следовать инструкциям падает больше чем на 50 пунктов.' },
    { short: 'Токены', title: 'Где лежат сами токены картинки', text: 'Теперь покажи точками средний токен картинки после проектора — то, что входит в языковую модель. Авторы LLaVA пишут, что проектор выравнивает токены картинки с эмбеддингами слов. Лягут ли они на слова?',
      controls: ['stage', 'what'],
      criteria: [{ label: 'Показаны токены картинки', test: (r, s) => s.trained && s.what === 'tok' }],
      explain: (r, ctx) => `Токены картинки не ложатся на слова: ближайшее слово к среднему токену совпадает с цветом или формой картинки у ${Math.round(ctx.results[2].near * 24)} из 24 — почти как при случайном проекторе. Их никто не сравнивает со словами напрямую: они входят во внимание как ключи и значения, а к словам тянется только чтение. Выравнивание означает, что замороженная модель научилась извлекать из этих токенов нужное, а не что токен картинки стал похож на слово.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай этапы и точки. Найди картинку, чьё чтение перед первым словом после этапа 1 стоит ближе к чужому цвету, и проверь, исправил ли это этап 2.', final: true, controls: ['stage', 'what'] },
  ];
  function init() {
    segBind('#sStage', setStage); segBind('#sWhat', setWhat);
    legend('#sLegend', [['слово-цвет: кольцо того же цвета', 'var(--critical)', 'wring'], ['слово-форма', 'var(--ink-2)', 'wsq'], ['картинка с мячом', 'var(--ink-3)', 'mball'], ['картинка с кубиком', 'var(--ink-3)', 'mcube'], ['картинка с банкой', 'var(--ink-3)', 'mcan'], ['картинка с миской', 'var(--ink-3)', 'mbowl'], ['серые линии — главные оси, пересекаются в нуле', 'var(--line-2)', 'axes']]);
    $('#sLegend').append(h('span', { class: 'lg-h' }, 'Значки картинок окрашены в цвет предмета на картинке.'));
    ctl = mountMissions('#sMis', missions, api, { controls: { stage: '#wrapSStage', what: '#wrapSWhat' }, scene: '#sCv1' });
    draw(); redrawOn(draw);
    return ctl;
  }
  return { init, api, st, onTrained: () => { compute(); draw(); if (ctl) ctl.update(); } };
})();

/* ---------- Квиз ---------- */
function renderQuiz(boxSel, Q, scoreSel) {
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $(boxSel); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true }), pm = perms[qi % perms.length];
    pm.forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[pm.indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'ViT читает картинку по пикселям, как текст по буквам?', o: ['Да, каждый пиксель — токен', 'Нет: картинку режут на патчи 16 × 16, и токеном становится линейная проекция патча', 'Нет: токены даёт свёрточная сеть'], a: 1, e: 'Патч 16 × 16 × 3 разворачивают в 768 чисел и умножают на одну обучаемую матрицу; 224 × 224 даёт 196 токенов. Пиксели как токены дали бы 50 тысяч токенов и внимание в 65 тысяч раз дороже.' },
    { q: 'Без позиционных векторов ViT перестаёт работать?', o: ['Да, не обучается вовсе', 'Нет: работает заметно хуже, 0,614 против 0,642 в абляции, потому что видит мешок патчей', 'Нет, разницы нет: патчи и так в порядке'], a: 1, e: 'Внимание не знает порядка входов: в интерактиве перемешанная картинка без позиций дала тот же выход. Позиции возвращают порядок; какой именно способ их кодировать — одномерный, двумерный или относительный — почти не важно.' },
    { q: 'Проектор в LLaVA — большая отдельная сеть?', o: ['Да, трансформер на сотни миллионов параметров', 'Нет: одна обучаемая матрица, переводящая токены энкодера в ширину эмбеддингов языковой модели; в LLaVA-1.5 — двухслойный MLP', 'Это кросс-внимание внутри языковой модели'], a: 1, e: 'В статье H_v = W · Z_v. Авторы PaliGemma сравнили линейный проектор и MLP: 77,2 против 77,1 балла. Мост между частями дешёвый, дорогое — сами части и данные.' },
    { q: 'Энкодер картинок в LLaVA дообучают на инструкциях?', o: ['Да, на втором этапе', 'Нет: энкодер CLIP заморожен всегда; на первом этапе учится только проектор, на втором — проектор и языковая модель', 'Да, с самого начала'], a: 1, e: 'В LLaVA заморожено то, что уже обучено на большом корпусе. PaliGemma поступает иначе и не замораживает ничего, но на миллиарде примеров и с медленным разогревом скорости обучения энкодера.' },
    { q: 'Токены картинки в PaliGemma видят только предыдущие токены, как слова в GPT?', o: ['Да, маска причинная для всей последовательности', 'Нет: внимание префиксное — картинка и запрос видят друг друга целиком, причинно порождается только ответ', 'Нет: картинка не участвует во внимании'], a: 1, e: 'Так токены картинки могут «подсмотреть» вопрос и перестроиться под него. Авторы проверили причинную маску на запросе и на картинке: обе работают хуже.' },
    { q: 'Сколько токенов даёт одна картинка в PaliGemma при 224 px?', o: ['16', '256, а при 896 px — 4096', 'Один токен на картинку'], a: 1, e: 'Картинку приводят к квадрату 224, 448 или 896 пикселей, что даёт 256, 1024 или 4096 токенов. Для робота это цена каждого шага управления: GR00T N1 оставляет 64 токена на кадр.' },
    { q: 'Инструкции для обучения LLaVA размечали люди?', o: ['Да, 158 тысяч диалогов написали разметчики', 'Нет: текстовая GPT-4 написала их по подписям и рамкам картинок COCO, сама картинок не видя', 'Их собрали из форумов'], a: 1, e: '158 тысяч примеров: 58 тысяч диалогов, 23 тысячи описаний, 77 тысяч рассуждений. Картинок GPT-4 не видела — только текстовые подписи и координаты рамок.' },
    { q: 'Если энкодер различает фиолетовый кубик, VLM обязательно назовёт его правильно?', o: ['Да: языковая модель читает то, что выдал энкодер', 'Нет: языковая модель отвечает ещё и по привычкам из подписей и может договорить форму, которая чаще шла после этого цвета', 'Да, если проектор линейный'], a: 1, e: 'В лаборатории энкодер находил «фиолетовый кубик», а модель отвечала «фиолетовый мяч»: после слова «фиолетовый» в подписях кубика не было. Авторы LLaVA описывают тот же сбой на примере с клубничным йогуртом.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('patches', () => { mis.patches = LabPatches.init(); }); safe('vlm', () => { mis.vlm = LabVLM.init(); }); safe('space', () => { mis.space = LabSpace.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['pMis', 'vMis', 'sMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l32 = { mis, SPEED, Store, LabPatches, LabVLM, LabSpace, L32 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
