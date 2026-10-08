/* =====================================================================
   l38/engine.js — движок урока 3.8 «Обобщение и рассуждение: от π0.5
   до π0.7». Без DOM: работает в браузере (window.L38) и в Node (require)
   поверх l21/engine.js (стол 96 × 96, сетка действий 24 × 24).
   1) Уборка стола. На столе четыре предмета разных цветов; «убери со
      стола» — игрушки (кубики, мячи) в ящик, посуду (миски, банки) в
      мойку. Действие — клетка, где взять, и куда положить: в ящик или в
      мойку. Модель действий — карта по клеткам, как в уроке 2.1: фильтр
      5 × 5 по сетке плюс поправки к фильтру за каждое слово команды и
      отдельные поправки для каждого места. Плоская политика получает
      команду «убери со стола» и сразу выдаёт действие. Иерархическая
      сначала называет подзадачу словами («положи синюю миску в мойку»),
      а модель действий получает только подзадачу, как в π0.5.
      Названия предметов на столе высокий уровень получает готовыми — как
      от модели зрения и языка; правило «что куда» он учит по словам.
   2) Дома. Скатерть, узор и свет у каждого дома свои. Модель берёт
      предмет по команде «возьми <цвет> <форма>»; учится на одном и том
      же числе записей, собранных в разном числе домов, и проверяется
      в новых домах.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const L21 = root.L21 || (typeof require !== 'undefined' ? require('../l21/engine.js') : null);
  const { rng, randn, clamp, COLORS, SHAPES, CI, SI, BG, paint, TW, G, CELL, cellXY, softmax } = L21;
  const KS = 5, KH = 2, KD = KS * KS * 3;                      // фильтр 5 × 5 клеток по трём цветам

  /* ---------- слова ---------- */
  const COL = COLORS.map((c) => c.id), SHP = SHAPES.map((s) => s.id);
  const PLACES = [{ id: 'box', name: 'ящик', acc: 'в ящик' }, { id: 'sink', name: 'мойка', acc: 'в мойку' }];
  const TOYS = ['cube', 'ball'], DISHES = ['bowl', 'can'];
  const placeOf = (shape) => (TOYS.includes(shape) ? 0 : 1);   // 0 — ящик, 1 — мойка
  const TOK = COL.concat(SHP, ['box', 'sink', 'clear', 'take']);  // слова команд; последний индекс — общий фильтр
  const TI = Object.fromEntries(TOK.map((t, i) => [t, i]));
  const NT = TOK.length + 1, BASE = TOK.length;
  /** Падежи для подписей: «синюю миску», «синий мяч». */
  const ACC = { cube: 'кубик', ball: 'мяч', bowl: 'миску', can: 'банку' };
  function accPhrase(color, shape) { const c = COLORS[CI[color]], s = SHAPES[SI[shape]]; return `${s.g === 'f' ? c.f.replace(/ая$/, 'ую').replace(/яя$/, 'юю') : c.m} ${ACC[shape]}`; }
  const nomPhrase = (color, shape) => L21.phrase(color, shape);
  /** Подзадача словами: «положи синюю миску в мойку». */
  const subtaskText = (o, place) => `положи ${accPhrase(o.color, o.shape)} ${PLACES[place].acc}`;

  /* ---------- картинка стола ---------- */
  /** Сцена: предметы с заданными цветами и формами в случайных местах без наложений. */
  function layout(spec, seed, gap) {
    const r = rng(seed), objs = [], m = 11;
    for (const it of spec) {
      let x, y, k = 0;
      do { x = m + r() * (TW - 2 * m); y = m + r() * (TW - 2 * m); k++; } while (k < 300 && objs.some((q) => Math.hypot(q.x - x, q.y - y) < (gap || 20)));
      objs.push({ color: it.color, shape: it.shape, x, y });
    }
    return objs;
  }
  /** Сетка 24 × 24 по картинке, где фон стола — ровно BG (без шума): у пустых клеток окно фильтра нулевое. */
  function gridOf(objs) {
    const img = new Float32Array(TW * TW * 3);
    for (let i = 0; i < TW * TW; i++) { img[i * 3] = BG[0]; img[i * 3 + 1] = BG[1]; img[i * 3 + 2] = BG[2]; }
    for (const q of objs) paint(img, TW, TW, q.color, q.shape, q.x, q.y, L21.RT, null, 0);
    return { img, grid: L21.toGrid(img) };
  }
  /** Окна фильтра 5 × 5 × 3 вокруг каждой клетки (минус цвет стола). Пустые окна не храним: их счёт — только сдвиг.
   *  За краем стола — цвет bg, а при bg = 'edge' — ближайшая клетка у края (так узор скатерти продолжается).
   *  contrast: ещё 75 признаков — то же окно минус его средний цвет (так видно пятно на любом фоне). */
  function windows(grid, bg, contrast) {
    const edge = bg === 'edge', kd = contrast ? 2 * KD : KD, cells = [], P = []; bg = edge ? null : bg || BG;
    for (let i = 0; i < G * G; i++) {
      const cx = i % G, cy = Math.floor(i / G), p = new Float32Array(kd); let n = 0, nz = false;
      for (let dy = -KH; dy <= KH; dy++) for (let dx = -KH; dx <= KH; dx++) {
        let x = cx + dx, y = cy + dy; const inside = x >= 0 && y >= 0 && x < G && y < G;
        if (edge) { x = clamp(x, 0, G - 1); y = clamp(y, 0, G - 1); }
        const o = (y * G + x) * 3;
        for (let c = 0; c < 3; c++) { const v = (inside || edge ? grid[o + c] : bg[c]) - BG[c]; p[n++] = v; if (Math.abs(v) > 1e-6) nz = true; }
      }
      if (contrast) { const mu = [0, 0, 0]; for (let j = 0; j < KD; j++) mu[j % 3] += p[j] / (KS * KS); for (let j = 0; j < KD; j++) p[KD + j] = p[j] - mu[j % 3]; }
      if (nz) { cells.push(i); P.push(p); }
    }
    return { cells, P, nBg: G * G - cells.length, kd };
  }
  /** Попал ли захват в клетке i в предмет: центр клетки ближе 0,85 радиуса предмета. */
  function objAt(objs, i) { const c = cellXY(i); return objs.findIndex((q) => Math.hypot(q.x - c.x, q.y - c.y) < L21.RT * 0.85); }
  const cellOfObj = (q) => L21.cellOf(q.x, q.y);

  /* ---------- модель действий: карта «где взять × куда положить» ---------- */
  /** У каждого слова команды (и у общего фильтра) — поправка к фильтру, общая для всех мест, поправки
   *  для каждого места и сдвиг для каждого места. nc — число мест (2 — ящик и мойка, 1 — просто взять). */
  function mapInit(seed, nc, kd) {
    kd = kd || KD; const r = rng(seed || 5), nk = NT * (1 + nc) * kd, P = new Float64Array(nk + NT * nc);
    for (let i = 0; i < nk; i++) P[i] = randn(r) * 0.02;
    return { P, Gr: new Float64Array(P.length), M: new Float64Array(P.length), V: new Float64Array(P.length), t: 0, nc, nk, kd, steps: 0 };
  }
  const kOff = (m, t, j) => (t * (1 + m.nc) + j) * m.kd;
  const bOff = (m, t, c) => m.nk + t * m.nc + c;
  /** Итоговый фильтр и сдвиг для каждого места при данных словах команды. */
  function combine(m, toks) {
    const ids = toks.map((t) => TI[t]).concat([BASE]), K = [], B = [];
    for (let c = 0; c < m.nc; c++) {
      const k = new Float64Array(m.kd); let b = 0;
      for (const t of ids) { const o0 = kOff(m, t, 0), o1 = kOff(m, t, c + 1); for (let j = 0; j < m.kd; j++) k[j] += m.P[o0 + j] + m.P[o1 + j]; b += m.P[bOff(m, t, c)]; }
      K.push(k); B.push(b);
    }
    return { ids, K, B };
  }
  /** Счёт каждой пары «клетка, место»; у пустых клеток — только сдвиг места. */
  function mapScores(m, W, toks) {
    const { ids, K, B } = combine(m, toks), S = [];
    const kd = m.kd;
    for (let c = 0; c < m.nc; c++) { const s = new Float64Array(W.cells.length), k = K[c]; for (let a = 0; a < W.cells.length; a++) { const p = W.P[a]; let v = B[c]; for (let j = 0; j < kd; j++) v += k[j] * p[j]; s[a] = v; } S.push(s); }
    return { ids, S, B };
  }
  /** Вероятности по всем 576 × nc парам: активные клетки и пустые (у пустых одинаковые). */
  function mapProbs(m, W, toks) {
    const { ids, S, B } = mapScores(m, W, toks); let mx = -1e9;
    for (let c = 0; c < m.nc; c++) { for (const v of S[c]) mx = Math.max(mx, v); if (W.nBg) mx = Math.max(mx, B[c]); }
    let z = 0; const E = S.map((s) => s.map((v) => Math.exp(v - mx))), Eb = B.map((b) => Math.exp(b - mx));
    for (let c = 0; c < m.nc; c++) { for (const v of E[c]) z += v; z += W.nBg * Eb[c]; }
    return { ids, P: E.map((e) => e.map((v) => v / z)), Pbg: Eb.map((v) => v / z), S, B };
  }
  /** Лучшая пара: клетка (из всех 576) и место. Если выигрывает пустая клетка — промах мимо предметов. */
  function mapAct(m, W, toks) {
    const { P, Pbg } = mapProbs(m, W, toks); let best = { p: -1 };
    for (let c = 0; c < m.nc; c++) { P[c].forEach((v, a) => { if (v > best.p) best = { p: v, cell: W.cells[a], c }; }); if (W.nBg && Pbg[c] > best.p) best = { p: Pbg[c], cell: -1, c }; }
    return best;
  }
  /** Обучение: перекрёстная энтропия по всем парам «клетка, место». Примеры: { W, toks, cell, c }. */
  function* mapTrain(m, data, o) {
    o = o || {}; const iters = o.iters || 120, lr = o.lr || 0.02, bs = o.batch || 24, r = rng(o.seed || 7), kd = m.kd, g = new Float64Array(kd);
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      const batch = data.length <= bs ? data : Array.from({ length: bs }, () => data[Math.floor(r() * data.length)]);
      for (const d of batch) {
        const { ids, P, Pbg } = mapProbs(m, d.W, d.toks), ta = d.W.cells.indexOf(d.cell);
        loss -= Math.log((ta >= 0 ? P[d.c][ta] : Pbg[d.c]) + 1e-12) / batch.length;
        for (let c = 0; c < m.nc; c++) {
          g.fill(0); let gb = W_nBg(d.W) * Pbg[c] - (ta < 0 && c === d.c ? 1 : 0);
          P[c].forEach((pv, a) => { const e = pv - (a === ta && c === d.c ? 1 : 0); gb += e; if (Math.abs(e) < (o.eps || 1e-7)) return; const p = d.W.P[a]; for (let j = 0; j < kd; j++) g[j] += e * p[j]; });
          for (const t of ids) { const o0 = kOff(m, t, 0), o1 = kOff(m, t, c + 1); for (let j = 0; j < kd; j++) { m.Gr[o0 + j] += g[j]; m.Gr[o1 + j] += g[j]; } m.Gr[bOff(m, t, c)] += gb; }
        }
      }
      adamAll(m, lr, batch.length); m.steps++;
      if (it % 10 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  const W_nBg = (W) => W.nBg;
  function adamAll(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t), P = m.P, Gr = m.Gr, M = m.M, V = m.V;
    for (let i = 0; i < P.length; i++) { const gg = Gr[i] / bs; if (gg === 0 && M[i] === 0) continue; M[i] = b1 * M[i] + (1 - b1) * gg; V[i] = b2 * V[i] + (1 - b2) * gg * gg; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); Gr[i] = 0; }
  }

  /* ---------- 1. уборка стола: записи, высокий уровень, проходы ---------- */
  /** Стол уборки: четыре предмета разных цветов, формы случайные, хотя бы одна игрушка и одна посуда. */
  function clearTable(seed) {
    const r = rng(seed * 7 + 1), cols = COL.slice();
    for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
    let shp;
    do { shp = [0, 1, 2, 3].map(() => SHP[Math.floor(r() * 4)]); } while (!shp.some((s) => TOYS.includes(s)) || !shp.some((s) => DISHES.includes(s)));
    return layout(cols.slice(0, 4).map((c, i) => ({ color: c, shape: shp[i] })), seed);
  }
  const CL = { short: 160, long: 8, records: [2, 8, 32], longSeed: 900, shortSeed: 3000, evalSeed: 7240, evalN: 20, iters: 150, seed: 5 };
  /** Записи коротких команд из других задач: «положи X в Y», куда — сказано в команде. */
  function shortDemos(n, seed0) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const seed = (seed0 || CL.shortSeed) + k, objs = clearTable(seed), r = rng(seed * 13 + 5), q = objs[Math.floor(r() * objs.length)], c = Math.floor(r() * 2);
      out.push({ W: windows(gridOf(objs).grid), toks: [q.color, q.shape, PLACES[c].id], cell: cellOfObj(q), c });
    }
    return out;
  }
  /** Записи длинной задачи «убери со стола»: оператор убирает предметы в случайном порядке; каждый шаг
   *  подписан подзадачей. Возвращает шаги: стол до шага, какой предмет и куда. */
  function longDemos(n, seed0) {
    const recs = [];
    for (let k = 0; k < n; k++) {
      const seed = (seed0 || CL.longSeed) + k, r = rng(seed * 11 + 3); let objs = clearTable(seed);
      const steps = [];
      while (objs.length) {
        const i = Math.floor(r() * objs.length), q = objs[i];
        steps.push({ objs: objs.slice(), W: windows(gridOf(objs).grid), pick: i, cell: cellOfObj(q), c: placeOf(q.shape) });
        objs = objs.filter((_, j) => j !== i);
      }
      recs.push({ seed, steps });
    }
    return recs;
  }
  /** Примеры для модели действий: короткие команды; шаги длинной задачи — с подзадачей словами и с командой «убери со стола». */
  function clearData(recs, shorts) {
    const out = shorts.slice();
    for (const rec of recs) for (const s of rec.steps) {
      const q = s.objs[s.pick];
      out.push({ W: s.W, toks: [q.color, q.shape, PLACES[s.c].id], cell: s.cell, c: s.c });
      out.push({ W: s.W, toks: ['clear'], cell: s.cell, c: s.c });
    }
    return out;
  }
  /* Высокий уровень: по названиям предметов на столе выбирает подзадачу «положи <предмет> <куда>».
     Признаки предмета — слова: цвет (6) и форма (4); у каждого места свои веса. */
  const HF = COL.length + SHP.length + 1;
  function hlFeat(q) { const f = new Float64Array(HF); f[CI[q.color]] = 1; f[COL.length + SI[q.shape]] = 1; f[HF - 1] = 1; return f; }
  function hlInit() { return { w: [new Float64Array(HF), new Float64Array(HF)] }; }
  function hlProbs(hm, objs) {
    const s = []; objs.forEach((q, i) => { const f = hlFeat(q); for (let c = 0; c < 2; c++) { let v = 0; for (let j = 0; j < HF; j++) v += hm.w[c][j] * f[j]; s.push({ i, c, v }); } });
    const p = softmax(s.map((x) => x.v)); s.forEach((x, k) => { x.p = p[k]; });
    return s;
  }
  function hlChoose(hm, objs) { return hlProbs(hm, objs).reduce((a, b) => (b.p > a.p ? b : a)); }
  function hlTrain(hm, recs, o) {
    o = o || {}; const iters = o.iters || 300, lr = o.lr || 0.3;
    for (let it = 0; it < iters; it++) {
      const gw = [new Float64Array(HF), new Float64Array(HF)]; let n = 0;
      for (const rec of recs) for (const st of rec.steps) {
        const s = hlProbs(hm, st.objs);
        for (const x of s) { const e = x.p - (x.i === st.pick && x.c === st.c ? 1 : 0), f = hlFeat(st.objs[x.i]); for (let j = 0; j < HF; j++) gw[x.c][j] += e * f[j]; }
        n++;
      }
      for (let c = 0; c < 2; c++) for (let j = 0; j < HF; j++) hm.w[c][j] -= lr * (gw[c][j] / n + 0.002 * hm.w[c][j]);
    }
    return hm;
  }
  /** Проход по столу. mode: 'flat' — команда «убери со стола» сразу в модель действий;
   *  'hier' — сначала подзадача словами (или подсказка человека: o.human(objs) → { i, c }). */
  function clearRun(m, hm, objs0, mode, o) {
    o = o || {}; let objs = objs0.slice(); const placed = [], steps = [], maxSteps = objs0.length + 2; let wrong = 0, miss = 0;
    for (let k = 0; k < maxSteps && objs.length; k++) {
      const W = windows(gridOf(objs).grid); let sub = null, toks = ['clear'];
      if (mode === 'hier') {
        const ch = o.human ? o.human(objs) : hlChoose(hm, objs); const q = objs[ch.i];
        sub = { i: ch.i, c: ch.c, color: q.color, shape: q.shape, text: subtaskText(q, ch.c), right: ch.c === placeOf(q.shape) };
        toks = [q.color, q.shape, PLACES[ch.c].id];
      }
      const a = mapAct(m, W, toks), hit = a.cell >= 0 ? objAt(objs, a.cell) : -1, at = a.cell >= 0 ? cellXY(a.cell) : null;
      const step = { k, objs: objs.slice(), sub, cell: a.cell, at, c: a.c, hit, obj: hit >= 0 ? objs[hit] : null };
      if (hit < 0) { step.res = 'miss'; miss++; }
      else {
        const q = objs[hit], ok = a.c === placeOf(q.shape);
        step.res = ok ? 'ok' : 'wrong'; if (!ok) wrong++;
        if (sub) step.level = !sub.right ? 'words' : (sub.i !== hit || !ok ? 'action' : null);
        else step.level = null;
        if (sub && sub.right && (sub.i !== hit)) step.res = ok ? 'other' : 'wrong';
        placed.push({ ...q, c: a.c, ok }); objs = objs.filter((_, j) => j !== hit);
      }
      steps.push(step);
    }
    return { steps, placed, left: objs, wrong, miss, ok: !objs.length && !wrong };
  }
  function clearEval(m, hm, mode, n, seed0) {
    const runs = []; for (let i = 0; i < (n || CL.evalN); i++) { const seed = (seed0 || CL.evalSeed) + i; runs.push({ seed, ...clearRun(m, hm, clearTable(seed), mode) }); }
    const ok = runs.filter((q) => q.ok).length, objs = runs.length * 4;
    const right = runs.reduce((s, q) => s + q.placed.filter((x) => x.ok).length, 0);
    return { runs, ok, n: runs.length, wrong: runs.reduce((s, q) => s + q.wrong, 0), miss: runs.reduce((s, q) => s + q.miss, 0), right, objs };
  }


  /** Обучить модель действий и высокий уровень на nLong записях длинной задачи и CL.short коротких командах. */
  function* clearTrain(nLong) {
    const recs = longDemos(nLong), data = clearData(recs, shortDemos(CL.short)), m = mapInit(CL.seed, 2);
    yield* mapTrain(m, data, { iters: CL.iters, batch: 32, lr: 0.03, seed: CL.seed });
    return { m, hm: hlTrain(hlInit(), recs), recs, nLong };
  }
  /** Сколько раз каждый цвет встречался игрушкой и посудой в записях длинной задачи. */
  function recColors(recs) { const out = {}; for (const c of COL) out[c] = { toy: 0, dish: 0 }; recs.forEach((r) => r.steps.forEach((s) => { const q = s.objs[s.pick]; out[q.color][placeOf(q.shape) ? 'dish' : 'toy']++; })); return out; }

  /* ---------- 2. дома: скатерть, узор и свет у каждого свои ---------- */
  const CLOTH = [
    { id: 'beige', rgb: [0.93, 0.92, 0.89], name: 'бежевая скатерть' }, { id: 'white', rgb: [0.97, 0.97, 0.95], name: 'белая скатерть' },
    { id: 'oak', rgb: [0.80, 0.66, 0.48], name: 'светлое дерево' }, { id: 'walnut', rgb: [0.46, 0.33, 0.24], name: 'тёмное дерево' },
    { id: 'grey', rgb: [0.68, 0.70, 0.72], name: 'серый пластик' }, { id: 'blue', rgb: [0.74, 0.82, 0.93], name: 'голубая скатерть' },
    { id: 'green', rgb: [0.76, 0.87, 0.74], name: 'зелёная скатерть' }, { id: 'pink', rgb: [0.95, 0.79, 0.81], name: 'розовая скатерть' },
    { id: 'sand', rgb: [0.95, 0.88, 0.66], name: 'песочная скатерть' },
  ];
  const PATTERN = ['ровная', 'в полоску', 'в клетку', 'в горошек'];
  /** Дом: скатерть (цвет, узор и цвет узора), яркость и оттенок света. */
  function home(seed) {
    const r = rng(seed * 31 + 17), base = CLOTH[Math.floor(r() * CLOTH.length)], pat = Math.floor(r() * HO.patterns);
    const pc = COLORS[CI[HO.colors[Math.floor(r() * HO.colors.length)]]], mix = 0.7 + 0.25 * r();
    const second = base.rgb.map((v, c) => v * (1 - mix) + pc.rgb[c] * mix);
    const light = 0.8 + 0.3 * r(), warm = (r() - 0.5) * 0.1;
    return { seed, base, pat, pc: pc.id, second, period: 8 + Math.floor(r() * 3) * 4, vertical: r() < 0.5, light, tint: [1 + warm, 1, 1 - warm] };
  }
  const accF = (f) => f.replace(/ая$/, 'ую').replace(/яя$/, 'юю');
  function homeName(hm) { const c = COLORS[CI[hm.pc]]; return `${hm.base.name}${hm.pat ? ` в ${hm.pat === 3 ? c.m : accF(c.f)} ${['', 'полоску', 'клетку', 'горошек'][hm.pat]}` : ''}, свет ${Math.round(hm.light * 100)}%`; }
  /** Картинка стола в доме: скатерть с узором, предметы, общий свет и шум. */
  const MG = 8, TB = TW + 2 * MG, GB = TB / CELL;               // скатерть видна и за краем стола: поле 8 пикселей (2 клетки)
  /** Картинка стола в доме вместе с полем вокруг: скатерть с узором, предметы, общий свет и шум. */
  function homeImage(hm, objs, seed) {
    const img = new Float32Array(TB * TB * 3), r = rng(seed * 5 + 3);
    for (let yy = 0; yy < TB; yy++) for (let xx = 0; xx < TB; xx++) {
      const x = xx - MG + 64, y = yy - MG + 64;                  // сдвиг, чтобы узор не зависел от знака координат
      const u = hm.vertical ? x : y, band = Math.floor(u / (hm.period / 2)) % 2, chk = (Math.floor(x / hm.period) + Math.floor(y / hm.period)) % 2;
      const dx = ((x + hm.period / 4) % hm.period) - hm.period / 2, dy = ((y + hm.period / 4 + (Math.floor((x + hm.period / 4) / hm.period) % 2) * hm.period / 2) % hm.period) - hm.period / 2;
      const dot = Math.hypot(dx + 0.5, dy + 0.5) < 2.6;
      const two = hm.pat === 1 ? band : hm.pat === 2 ? chk : hm.pat === 3 ? dot : 0, col = two ? hm.second : hm.base.rgb, o = (yy * TB + xx) * 3;
      for (let c = 0; c < 3; c++) img[o + c] = col[c];
    }
    for (const q of objs) paint(img, TB, TB, q.color, q.shape, q.x + MG, q.y + MG, L21.RT, null, 0);
    for (let i = 0; i < TB * TB; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = clamp(img[i * 3 + c] * hm.light * hm.tint[c] + randn(r) * 0.012, 0, 1);
    return img;
  }
  /** Средний цвет клеток 4 × 4 по картинке с полем: сетка GB × GB. */
  function gridBig(img) {
    const g = new Float64Array(GB * GB * 3);
    for (let y = 0; y < TB; y++) for (let x = 0; x < TB; x++) { const o = (y * TB + x) * 3, gi = (Math.floor(y / CELL) * GB + Math.floor(x / CELL)) * 3; for (let c = 0; c < 3; c++) g[gi + c] += img[o + c] / (CELL * CELL); }
    return g;
  }
  /** Окна 5 × 5 для клеток стола 24 × 24: за краем стола окно видит настоящую скатерть поля. */
  function windowsBig(gb) {
    const cells = [], P = [], off = MG / CELL;
    for (let i = 0; i < G * G; i++) {
      const cx = i % G + off, cy = Math.floor(i / G) + off, p = new Float32Array(KD); let n = 0;
      for (let dy = -KH; dy <= KH; dy++) for (let dx = -KH; dx <= KH; dx++) { const o = ((cy + dy) * GB + cx + dx) * 3; for (let c = 0; c < 3; c++) p[n++] = gb[o + c] - BG[c]; }
      cells.push(i); P.push(p);
    }
    return { cells, P, nBg: 0, kd: KD };
  }
  /** Вырезать сам стол 96 × 96 из картинки с полем — для показа. */
  function cropTable(big) { const img = new Float32Array(TW * TW * 3); for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) for (let c = 0; c < 3; c++) img[(y * TW + x) * 3 + c] = big[((y + MG) * TB + x + MG) * 3 + c]; return img; }
  /** Стол в доме: четыре предмета разных цветов, формы случайные. */
  function homeTable(hm, seed) {
    const r = rng(seed * 3 + 11), cols = HO.colors.slice();
    for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
    const objs = layout(cols.map((c) => ({ color: c, shape: SHP[Math.floor(r() * 4)] })), seed);
    const big = homeImage(hm, objs, seed);
    return { hm, objs, img: cropTable(big), W: windowsBig(gridBig(big)) };
  }
  const HO = { patterns: 4, contrast: false, colors: ['red', 'blue', 'green', 'yellow'], budget: 96, trainSeed: 200, sets: [200, 100, 400], counts: [1, 2, 3, 4, 6, 8, 12, 16, 24, 48, 96], testSeed: 500, testHomes: 16, tablesPer: 2, iters: 160, lr: 0.05 };
  /** Записи «возьми <цвет> <форма>»: budget записей поровну в n домах (дома trainSeed + k). */
  function homeDemos(n, budget, seed0) {
    budget = budget || HO.budget; const out = [];
    for (let k = 0; k < budget; k++) {
      const h = k % n, hm = home((seed0 || HO.trainSeed) + h), tseed = 10000 + (seed0 || HO.trainSeed) * 97 + k, t = homeTable(hm, tseed), r = rng(tseed * 7 + 1), q = t.objs[Math.floor(r() * 4)];
      out.push({ W: t.W, toks: [q.color, q.shape], cell: cellOfObj(q), c: 0, home: h });
    }
    return out;
  }
  /** Записи в самих тестовых домах (на других столах, чем проверочные): та же сумма записей. */
  function inHomeDemos(budget) {
    budget = budget || HO.budget; const out = [];
    for (let k = 0; k < budget; k++) {
      const h = k % HO.testHomes, hm = home(HO.testSeed + h), tseed = 20000 + k, t = homeTable(hm, tseed), r = rng(tseed * 7 + 1), q = t.objs[Math.floor(r() * 4)];
      out.push({ W: t.W, toks: [q.color, q.shape], cell: cellOfObj(q), c: 0, home: h });
    }
    return out;
  }
  /** Проверочные столы: testHomes новых домов по tablesPer стола, на каждом — команда для каждого предмета. */
  function homeTests() {
    const out = [];
    for (let h = 0; h < HO.testHomes; h++) { const hm = home(HO.testSeed + h); for (let j = 0; j < HO.tablesPer; j++) out.push(homeTable(hm, 30000 + h * 10 + j)); }
    return out;
  }
  function pickOf(m, t, q) { const a = mapAct(m, t.W, [q.color, q.shape]), hit = a.cell >= 0 ? objAt(t.objs, a.cell) : -1; return { cell: a.cell, hit, ok: hit >= 0 && t.objs[hit] === q }; }
  function homeEval(m, tests) {
    tests = tests || homeTests(); let ok = 0, n = 0, other = 0, cloth = 0; const per = [];
    tests.forEach((t, ti) => { t.objs.forEach((q) => { const p = pickOf(m, t, q); n++; if (p.ok) ok++; else if (p.hit >= 0) other++; else cloth++; per.push({ ti, q, ...p }); }); });
    return { ok, n, other, cloth, rate: ok / n, per };
  }
  function* homeTrain(data, o) { o = o || {}; const m = mapInit(o.seed || 9, 1, HO.contrast ? 2 * KD : KD); return yield* mapTrain(m, data, { iters: o.iters || HO.iters, batch: 32, lr: o.lr || HO.lr, eps: o.eps || 1e-7, seed: o.seed || 9 }); }

  /* @@MORE@@ */
  const API = { KD, COL, SHP, PLACES, TOYS, DISHES, placeOf, TOK, accPhrase, nomPhrase, subtaskText, layout, gridOf, windows, objAt, cellOfObj,
    mapInit, combine, mapScores, mapProbs, mapAct, mapTrain, CL, clearTable, shortDemos, longDemos, clearData, hlFeat, hlInit, hlProbs, hlChoose, hlTrain, clearRun, clearEval, clearTrain, recColors,
    CLOTH, PATTERN, home, homeName, homeImage, homeTable, HO, homeDemos, inHomeDemos, homeTests, pickOf, homeEval, homeTrain };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L38 = API;
})(typeof window !== 'undefined' ? window : globalThis);
