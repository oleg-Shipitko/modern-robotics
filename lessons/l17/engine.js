/* =====================================================================
   l17/engine.js — движок урока 1.7 «ACT: action chunking». Без DOM:
   работает в браузере (window.ACT) и в Node (require).
   1. mc*    — накопление ошибки: 200 прогонов, решение раз в k шагов.
   2. lab*   — схват ведёт кружку к полке. Демонстрации с паузами, политика —
               взвешенная медиана будущих положений из демонстраций (как L1)
               плюс ошибка, растущая вдали от данных. Пачки, «сколько
               исполнять», temporal ensembling, толчок.
   3. te*    — лента перекрывающихся пачек и веса temporal ensembling.
   4. delay* — задержка вывода и стыки пачек: синхронно, наивно асинхронно,
               temporal ensembling, упрощённый RTC.
   5. cvae*  — регрессия L1, ACT с z = 0 и случайный z на объезде вазы.
   6. arch*  — песочница «Собери ACT»: блоки, стыки и размерности.
   Всё детерминировано: зёрна фиксированы, тексты урока совпадают с лабой.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const sdev = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };

  /* ---------- 1. Накопление ошибки ----------
     Отклонение кружки от пути x (см) за шаг меняется как x ← λ·x + u.
     Решение раз в k шагов (последнее — на последнем шаге, чтобы сравнение было честным):
     u = −c·x + δ·x + ε·ξ. c = max(0, λ − 1) — поправка, которую политика выучила у эксперта:
     на неустойчивой системе эксперт всё время гасит рост отклонения. δ — ошибка политики,
     растущая с отклонением; ε — ошибка на каждом решении. Внутри пачки u = 0: рука едет вслепую. */
  const MC = { T: 200, N: 200, EPS: 0.3, DELTA: 0.01, LIM: 1e4 };
  function mcRun(k, lam) {
    const out = new Float64Array(MC.N), c = Math.max(0, lam - 1);
    for (let i = 0; i < MC.N; i++) {
      const r = rng(1000 + i); let x = 0;
      for (let t = 0; t < MC.T; t++) {
        const xi = randn(r);
        x = (MC.T - 1 - t) % k === 0 ? (lam - c + MC.DELTA) * x + MC.EPS * xi : lam * x;
        if (Math.abs(x) > MC.LIM) x = Math.sign(x) * MC.LIM;
      }
      out[i] = x;
    }
    return out;
  }
  function mcStats(k, lam) {
    const a = mcRun(1, lam), b = k === 1 ? a : mcRun(k, lam), sa = sdev(a), sb = sdev(b);
    return { step: a, chunk: b, sdStep: sa, sdChunk: sb, ratio: sb / sa, decStep: MC.T, decChunk: Math.ceil(MC.T / k) };
  }

  /* ---------- 2. Лаборатория: пачки, паузы и толчок ---------- */
  const LAB = { DT: 0.02, L: 0.8, V0: 0.25, ACC: 2.0, PX: 0.34, ND: 10, H: 0.008, ALPHA: 0.8, ETA: 0.003, ETAD: 0.03, HOLD: 6, TMAX: 400, PUSH: 0.06, XPUSH: 0.38, SHELF: 0.03, AMP: 0.035, JUMP: 4 };
  const PAUSES = { none: 0, short: 16, long: 30 };
  const labY = (x) => LAB.AMP * Math.sin(Math.PI * x / LAB.L);
  const labCache = {};
  /** Десять демонстраций оператора. Паузы: 'none' | 'short' (≈ 0,3 с) | 'long' (≈ 0,6 с). */
  function labData(mode) {
    mode = mode || 'short'; if (labCache[mode]) return labCache[mode];
    const r = rng(7), D = [];
    for (let d = 0; d < LAB.ND; d++) {
      const v = LAB.V0 * (1 + 0.08 * randn(r)), px = LAB.PX + 0.004 * randn(r), zp = randn(r), dy = 0.004 * randn(r), ph = r() * 6.28, wa = 0.002 * r();
      const P = PAUSES[mode] ? Math.max(6, Math.round(PAUSES[mode] * (1 + 0.2 * zp))) : 0;
      const seg = (x0, x1) => { let x = x0, vv = 0; const pts = []; while (x1 - x > 1e-5) { const vmax = Math.sqrt(2 * LAB.ACC * Math.max(0, x1 - x)); vv = Math.min(vv + LAB.ACC * LAB.DT, v, vmax); if (vv < 1e-4) vv = Math.min(1e-3, x1 - x); x = Math.min(x1, x + vv * LAB.DT); pts.push(x); } return pts; };
      const xs = [0];
      if (P) { xs.push(...seg(0, px)); for (let i = 0; i < P; i++) xs.push(px); xs.push(...seg(px, LAB.L)); } else xs.push(...seg(0, LAB.L));
      for (let i = 0; i < LAB.HOLD; i++) xs.push(LAB.L);
      D.push({ pts: xs.map((x) => [x, labY(x) + dy + wa * Math.sin(ph + 9 * x)]), pause: P, px });
    }
    const F = []; D.forEach((dm, di) => dm.pts.forEach((p, i) => F.push({ x: p[0], y: p[1], d: di, i })));
    const BIN = 0.02, bins = []; for (const f of F) { const b = Math.floor(f.x / BIN); (bins[b] = bins[b] || []).push(f); }
    const pauses = D.map((dm) => dm.pause);
    return (labCache[mode] = { D, F, bins, BIN, mode, pauseMean: pauses.reduce((s, v) => s + v, 0) / pauses.length * LAB.DT });
  }
  function wmedian(vals, ws, idx) { idx.sort((a, b) => vals[a] - vals[b]); let tot = 0; for (const i of idx) tot += ws[i]; let c = 0; for (const i of idx) { c += ws[i]; if (c >= tot / 2) return vals[i]; } return vals[idx[idx.length - 1]]; }
  /** Пачка из k целевых положений кружки по наблюдению m: для каждого шага j — взвешенная медиана
   *  положений, в которых были соседние кадры демонстраций через j шагов (так L1 выбирает медиану). */
  function labPolicy(dt, m, k) {
    const { D, bins, BIN } = dt, b0 = Math.floor(m[0] / BIN);
    let near = []; for (let r = 1; near.length === 0 && r < 80; r++) { near = []; for (let b = b0 - r; b <= b0 + r; b++) if (bins[b]) near.push(...bins[b]); }
    let dmin = Infinity; for (const f of near) { const d2 = (f.x - m[0]) ** 2 + (f.y - m[1]) ** 2; if (d2 < dmin) dmin = d2; }
    const sel = [], ws = [];
    for (const f of near) { const d2 = (f.x - m[0]) ** 2 + (f.y - m[1]) ** 2, w = Math.exp(-(d2 - dmin) / (2 * LAB.H * LAB.H)); if (w > 1e-3) { sel.push(f); ws.push(w); } }
    const chunk = [], xs = new Float64Array(sel.length), ys = new Float64Array(sel.length), idx = sel.map((_, i) => i);
    for (let j = 1; j <= k; j++) {
      let rw = 0, tw = 0;
      sel.forEach((f, q) => { const pts = D[f.d].pts, ii = Math.min(pts.length - 1, f.i + j); xs[q] = pts[ii][0]; ys[q] = pts[ii][1]; tw += ws[q]; if (f.i + j >= pts.length - LAB.HOLD) rw += ws[q]; });
      chunk.push({ x: wmedian(xs, ws, idx), y: wmedian(ys, ws, idx), rel: rw / tw > 0.5 });
    }
    return { chunk, dist: Math.sqrt(dmin), nNear: sel.length };
  }
  function labNoise(t, seed) { const r = rng(seed * 7919 + t * 104729 + 1); return [randn(r), randn(r)]; }
  /** Прогон одной руки. cfg: { k, exec?, te?, m?, pauses, push?: { t } (шаг) | { x } (после паузы, сразу после начала пачки), seed? } */
  function labRun(cfg) {
    const res = labRun1(cfg);
    // толчок «сразу после начала пачки» после x ≥ XPUSH; если такой пачки до конца пути не нашлось — толкаем при x ≥ XPUSH
    if (cfg.push && cfg.push.x != null && res.pushT == null) return labRun1(Object.assign({}, cfg, { push: { x: cfg.push.x, any: true } }));
    return res;
  }
  function labRun1(cfg) {
    const dt = labData(cfg.pauses), k = cfg.k, ex = Math.max(1, Math.min(cfg.exec || k, k)), seed = cfg.seed || 3, TMAX = cfg.tmax || LAB.TMAX;
    let h = [0, 0], g = [0, 0], cur = null, idx = 0, pushT = null, react = null, rel = null, t = 0, curStart = 0;
    const fr = [], dec = [], chunks = [], tes = [];
    const plan = (m) => { const pol = labPolicy(dt, m, k), n = labNoise(t, seed), s = LAB.ETA * (1 + pol.dist / LAB.ETAD); return pol.chunk.map((c) => ({ x: c.x - g[0] + s * n[0], y: c.y - g[1] + s * n[1], rel: c.rel })); };
    while (t < TMAX) {
      let tgt; const m = [h[0] + g[0], h[1] + g[1]];
      if (cfg.te) {
        const c = plan(m); tes.push({ s: t, c }); chunks.push({ t, pts: c, ex: 1, g: g.slice() }); dec.push(t); curStart = t;
        while (tes.length && tes[0].s + k <= t) tes.shift();
        let sx = 0, sy = 0, sr = 0, sw = 0; tes.forEach((q, i) => { const w = Math.exp(-cfg.m * i), a = q.c[t - q.s]; sx += w * a.x; sy += w * a.y; sr += w * (a.rel ? 1 : 0); sw += w; });
        tgt = { x: sx / sw, y: sy / sw, rel: sr / sw > 0.5 };
      } else {
        if (!cur || idx >= ex) { cur = plan(m); idx = 0; dec.push(t); curStart = t; chunks.push({ t, pts: cur, ex, g: g.slice() }); if (pushT != null && react == null) react = t - pushT; }
        tgt = cur[idx++];
      }
      if (pushT == null && cfg.push) {
        const due = cfg.push.t != null ? t >= cfg.push.t : m[0] >= cfg.push.x && (cfg.push.any || curStart === t);
        if (due) { g = [g[0], g[1] + LAB.PUSH]; pushT = t; }
      }
      h = [h[0] + (tgt.x - h[0]) * LAB.ALPHA, h[1] + (tgt.y - h[1]) * LAB.ALPHA];
      fr.push([h[0], h[1], h[0] + g[0], h[1] + g[1]]);
      t++;
      if (tgt.rel) { rel = [h[0] + g[0], h[1] + g[1]]; break; }
    }
    let a = null, b = null; fr.forEach((f, i) => { if (a == null && f[2] >= LAB.PX - 0.01) a = i; if (a != null && b == null && f[2] >= LAB.PX + 0.03) b = i; });
    const pauseT = dt.mode === 'none' ? 0 : a == null ? null : b == null ? Infinity : (b - a) * LAB.DT;
    let back = null; if (pushT != null) for (let i = pushT + 1; i < fr.length; i++) if (Math.abs(fr[i][3] - labY(fr[i][2])) < LAB.PUSH / 2) { back = (i - pushT) * LAB.DT; break; }
    let reactSteps = react; if (cfg.te && pushT != null) reactSteps = back == null ? null : Math.round(back / LAB.DT);
    let jumps = 0; for (let i = 2; i < fr.length; i++) { const ax = fr[i][0] - 2 * fr[i - 1][0] + fr[i - 2][0], ay = fr[i][1] - 2 * fr[i - 1][1] + fr[i - 2][1]; if (Math.hypot(ax, ay) / (LAB.DT * LAB.DT) > LAB.JUMP) jumps++; }
    const onShelf = !!rel && Math.abs(rel[0] - LAB.L) < LAB.SHELF && Math.abs(rel[1] - labY(LAB.L)) < LAB.SHELF;
    const last = fr[fr.length - 1];
    return { k, ex, te: !!cfg.te, m: cfg.m, pauses: dt.mode, released: !!rel, rel, onShelf, T: t * LAB.DT, steps: t, pauseT, passed: pauseT !== Infinity && pauseT !== null, stuck: !rel && last[2] < LAB.PX + 0.03, reactSteps, react: reactSteps == null ? null : reactSteps * LAB.DT, back, pushT, jumps, decisions: dec.length, fr, dec, chunks };
  }

  /* ---------- 3. Temporal ensembling изнутри ----------
     Лента из пачек длиной k = 100: новая пачка — на каждом шаге, из того места, где рука сейчас.
     Действие на шаге t — среднее всех пачек, которые его предсказали, с весами wᵢ = exp(−m·i),
     i = 0 — самая старая пачка (как в коде ACT). Боковое положение — в сантиметрах. */
  const TE = { K: 100, T: 260, A: 8, TO: 150, WT: 40, OT: 18, OY: 4, TS: 100, TC: 12, NZ: 0.35 };
  const teBump = (t) => Math.exp(-(((t - TE.TO) / TE.WT) ** 2));
  function teWeights(n, m) { const w = []; let s = 0; for (let i = 0; i < n; i++) { const v = Math.exp(-m * i); w.push(v); s += v; } return w.map((v) => v / s); }
  function teTape(o) {
    const m = o.m, two = !!o.two, K = TE.K, T = TE.T, chunks = [], ex = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      // пачка, начатая на шаге t, из текущего положения руки
      const sg = two && t >= TE.TS ? -1 : 1, y0 = t ? ex[t - 1] : 0, r = rng(500 + t), a1 = randn(r), p1 = r() * 6.28;
      const ys = new Float64Array(K);
      for (let j = 0; j < K; j++) { const tau = t + j; ys[j] = sg * TE.A * teBump(tau) + (y0 - sg * TE.A * teBump(t)) * Math.exp(-j / TE.TC) + TE.NZ * a1 * (Math.sin(p1 + j / 17) - Math.sin(p1)); }
      chunks.push({ s: t, sg, ys });
      const lo = Math.max(0, t - K + 1), w = teWeights(t - lo + 1, m); let y = 0;
      for (let i = lo; i <= t; i++) y += w[i - lo] * chunks[i].ys[t - i];
      ex[t] = y;
    }
    return { chunks, ex, m, two };
  }
  /** Что известно о шаге t: какие пачки его предсказали, их предсказания и веса. */
  function teAt(tape, t) {
    const lo = Math.max(0, t - TE.K + 1), w = teWeights(t - lo + 1, tape.m), preds = [];
    for (let i = lo; i <= t; i++) preds.push({ s: i, sg: tape.chunks[i].sg, y: tape.chunks[i].ys[t - i], w: w[i - lo] });
    const y = tape.ex[t], inObs = Math.abs(t - TE.TO) <= TE.OT && Math.abs(y) < TE.OY;
    return { t, preds, y, inObs, oldest: preds[0].w, newest: preds[preds.length - 1].w };
  }

  /* ---------- 4. Задержка вывода и стыки пачек ----------
     Робот едет слева направо, посередине препятствие: объехать можно сверху или снизу.
     Генеративная политика (как π0) выдаёт пачку из 50 действий; сторону объезда выбирает случайно,
     пока рука не отъехала от оси. Синхронно исполняем 25 действий и ждём новую пачку. */
  const DL = { DT: 0.02, V: 0.25, X1: 1.0, XO: 0.5, RO: 0.07, RR: 0.02, A: 0.15, W: 0.16, H: 50, S: 25, TC: 8, ETA: 0.006, YC: 0.015, ALPHA: 0.8, M: 0.01, TMAX: 420, JUMP: 0.15, PAUSE: 0.1 };
  const dlY = (sg, x, obst) => (obst ? sg * DL.A * Math.exp(-(((x - DL.XO) / DL.W) ** 2)) : 0);
  function dlSample(x0, y0, seed, obst, force) {
    const r = rng(seed), pu = 1 / (1 + Math.exp(-y0 / DL.YC)), u = r(), sg = force || (u < pu ? 1 : -1);
    const a1 = randn(r), a2 = randn(r), f1 = 0.5 + r(), f2 = 1 + r(), p1 = r() * 6.28, p2 = r() * 6.28;
    const nz = (j) => DL.ETA * (a1 * (Math.sin(f1 * j / DL.H * Math.PI + p1) - Math.sin(p1)) + 0.5 * a2 * (Math.sin(f2 * j / DL.H * Math.PI + p2) - Math.sin(p2)));
    const off = y0 - dlY(sg, x0, obst), pts = [];
    for (let j = 1; j <= DL.H; j++) { const x = x0 + DL.V * j * DL.DT; pts.push([x, dlY(sg, x, obst) + off * Math.exp(-j / DL.TC) + nz(j)]); }
    return { sg, pts };
  }
  /** mode: 'sync' | 'naive' | 'te' | 'rtc'; d — задержка вывода в шагах по 20 мс; obst — препятствие с двумя объездами. */
  function delayRun(o) {
    const mode = o.mode, d = o.d, obst = o.obst !== false, seed = o.seed || 11;
    let h = [0, 0], t = 0, inf = 0; const fr = [h.slice()], marks = [], plans = [];
    const nextSeed = () => seed * 1000 + (inf++);
    const step = (tg) => { h = [h[0] + (tg[0] - h[0]) * DL.ALPHA, h[1] + (tg[1] - h[1]) * DL.ALPHA]; fr.push(h.slice()); t++; };
    for (let i = 0; i < d; i++) step(h); // первую пачку ждут все режимы
    let cur = dlSample(h[0], h[1], nextSeed(), obst), c0 = t; marks.push(t); plans.push({ t, pts: cur.pts });
    if (mode === 'sync') {
      while (t < DL.TMAX && h[0] < DL.X1) {
        for (let j = 0; j < DL.S && h[0] < DL.X1; j++) step(cur.pts[j]);
        if (h[0] >= DL.X1) break;
        for (let i = 0; i < d; i++) step(h); // стоим и ждём новую пачку
        cur = dlSample(h[0], h[1], nextSeed(), obst); marks.push(t); plans.push({ t, pts: cur.pts });
      }
    } else if (mode === 'naive' || mode === 'rtc') {
      while (t < DL.TMAX && h[0] < DL.X1) {
        const tObs = c0 + DL.S - d; let nx = null;
        for (let j = t - c0; j < DL.S && h[0] < DL.X1; j++) {
          if (t === tObs) {
            if (mode === 'naive') nx = dlSample(h[0], h[1], nextSeed(), obst);
            else {
              // RTC: d действий, которые исполнятся за время вывода, заморожены; дальше новая пачка
              // дорисовывается с убывающим весом старой и продолжает ту же стратегию
              const fresh = dlSample(h[0], h[1], nextSeed(), obst, cur.sg), pts = [];
              for (let jj = 0; jj < DL.H; jj++) {
                const oi = DL.S - d + jj, oldp = oi < DL.H ? cur.pts[oi] : null;
                let w = jj < d ? 1 : oldp ? Math.exp(-(jj - d) / 6) : 0; if (jj >= DL.H - DL.S) w = 0;
                const fp = fresh.pts[jj];
                pts.push(oldp ? [w * oldp[0] + (1 - w) * fp[0], w * oldp[1] + (1 - w) * fp[1]] : fp);
              }
              nx = { sg: cur.sg, pts };
            }
          }
          step(cur.pts[j]);
        }
        if (h[0] >= DL.X1) break;
        if (!nx) nx = dlSample(h[0], h[1], nextSeed(), obst);
        const from = tObs < t ? tObs : t;
        cur = { sg: nx.sg, pts: nx.pts.slice(t - from) }; plans.push({ t, pts: cur.pts }); c0 = t; marks.push(t);
      }
    } else {
      const chunks = [{ s: c0, pts: cur.pts }];
      while (t < DL.TMAX && h[0] < DL.X1) {
        // на каждом шаге приходит пачка, посчитанная по наблюдению d шагов назад
        const obsI = Math.max(c0, fr.length - 1 - d), ob = fr[obsI], c = dlSample(ob[0], ob[1], nextSeed(), obst);
        chunks.push({ s: obsI, pts: c.pts }); if (t % 5 === 0) plans.push({ t, pts: c.pts.slice(t - obsI) });
        while (chunks.length && chunks[0].s + DL.H <= t) chunks.shift();
        let sx = 0, sy = 0, sw = 0; chunks.forEach((q, i) => { const j = t - q.s; if (j < 0 || j >= DL.H) return; const w = Math.exp(-DL.M * i); sx += w * q.pts[j][0]; sy += w * q.pts[j][1]; sw += w; });
        step([sx / sw, sy / sw]);
      }
    }
    const v = [0]; for (let i = 1; i < fr.length; i++) v.push(Math.hypot(fr[i][0] - fr[i - 1][0], fr[i][1] - fr[i - 1][1]) / DL.DT);
    const vv = []; for (let i = 1; i < fr.length; i++) vv.push([(fr[i][0] - fr[i - 1][0]) / DL.DT, (fr[i][1] - fr[i - 1][1]) / DL.DT]);
    let pause = 0; for (let i = d; i < vv.length; i++) if (Math.hypot(vv[i][0], vv[i][1]) < 0.05 && fr[i][0] < DL.X1 - 0.01) pause++;
    let jump = 0, jumpAt = 0; for (let i = d + 1; i < vv.length; i++) { const j = Math.hypot(vv[i][0] - vv[i - 1][0], vv[i][1] - vv[i - 1][1]); if (j > jump) { jump = j; jumpAt = i; } }
    let dmin = Infinity; for (const p of fr) dmin = Math.min(dmin, Math.hypot(p[0] - DL.XO, p[1]));
    const hit = obst && dmin < DL.RO + DL.RR, pauseT = pause * DL.DT;
    return { mode, d, ms: d * 20, obst, fr, v, marks, plans, pauseT, jump, jumpAt, hit, dmin, T: (fr.length - 1) * DL.DT, ok: pauseT < DL.PAUSE && jump < DL.JUMP && !hit };
  }

  /* ---------- 5. CVAE на объезде вазы ----------
     Оператор объезжает вазу слева или справа. Энкодер CVAE: z | слева ~ N(+μ, σ²), z | справа ~ N(−μ, σ²).
     Декодер с L1 выдаёт медиану: сторону, у которой больше вероятность при данном z.
     μ и σ подбираются так, чтобы минимизировать ошибку L1 (цена неверной стороны — 1) плюс β·KL. */
  function Phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  const CV = { N: 50, C: 1, RUNS: 10 };
  function cvaeFit(beta, pL) {
    const pR = 1 - pL; let best = { J: Infinity };
    for (let mi = 0; mi <= 300; mi++) for (let si = 5; si <= 100; si++) {
      const mu = mi / 100, s = si / 100; let zs, perr;
      if (mi === 0) { zs = pL > pR ? -Infinity : pL < pR ? Infinity : 0; perr = Math.min(pL, pR); }
      else { zs = s * s * Math.log(pR / pL) / (2 * mu); perr = pL * Phi((zs - mu) / s) + pR * (1 - Phi((zs + mu) / s)); }
      const kl = 0.5 * (mu * mu + s * s - 1 - Math.log(s * s)), J = CV.C * perr + beta * kl;
      if (J < best.J - 1e-12) best = { J, mu, s, zs, perr, kl };
    }
    return best;
  }
  /** Сторона, которую выдаёт декодер при данном z: +1 слева, −1 справа, 0 — ничья (медиана не определена). */
  function cvaeSide(fit, z) { if (!isFinite(fit.zs)) return fit.zs < 0 ? 1 : -1; if (Math.abs(z - fit.zs) < 1e-12) return 0; return z > fit.zs ? 1 : -1; }
  function cvaeRuns(o) {
    const nL = o.nLeft == null ? 26 : o.nLeft, pL = nL / CV.N, fit = cvaeFit(o.beta, pL), r = rng(o.seed || 21);
    const l1 = nL * 2 > CV.N ? 1 : nL * 2 < CV.N ? -1 : 0;
    const act = cvaeSide(fit, 0), zs = [], rnd = [];
    for (let i = 0; i < CV.RUNS; i++) { const z = randn(r); zs.push(z); rnd.push(cvaeSide(fit, z)); }
    const cnt = (a, v) => a.filter((x) => x === v).length;
    return { beta: o.beta, nLeft: nL, fit, l1, act, zs, rnd, rndLeft: cnt(rnd, 1), rndRight: cnt(rnd, -1), rndMid: cnt(rnd, 0) };
  }
  /** Демонстрации объезда: 50 путей, первые nLeft — слева. Путь в долях: x от 0 до 1, y — сторона × горб. */
  function cvaeDemo(i, nLeft) { const r = rng(300 + i), side = i < nLeft ? 1 : -1; return { side, a: 0.3 * (1 + 0.12 * randn(r)), dy: 0.02 * randn(r), w: 0.2 * (1 + 0.1 * randn(r)) }; }
  const cvaePath = (side, x, p) => { p = p || { a: 0.3, dy: 0, w: 0.2 }; return side * p.a * Math.exp(-(((x - 0.5) / p.w) ** 2)) + p.dy * Math.sin(Math.PI * x); };

  /* ---------- 6. Собери ACT ----------
     Слоты схемы и блоки. У блока — вход и выход; на каждом стыке видна размерность. */
  const ARCH = {
    slots: [
      { id: 'cnn', label: 'Каждая камера', group: 'img' },
      { id: 'tok', label: 'Карта признаков → токены', group: 'img' },
      { id: 'joint', label: 'Суставы → токен', group: 'state' },
      { id: 'ztr', label: 'Откуда z при обучении', group: 'z' },
      { id: 'zinf', label: 'Откуда z на выводе', group: 'z' },
      { id: 'enc', label: 'Энкодер', group: 'tr' },
      { id: 'dec', label: 'Декодер', group: 'tr' },
      { id: 'head', label: 'Голова действий', group: 'out' },
    ],
    blocks: [
      { id: 'resnet', label: 'ResNet18 без головы', in: '480×640×3', out: '15×20×512', ok: 'cnn' },
      { id: 'resnetcls', label: 'ResNet18 с классификатором ImageNet', in: '480×640×3', out: '1000' },
      { id: 'flat', label: 'Развернуть в токены + 2D-синусоидальные позиции', in: '15×20×512', out: '300×512', ok: 'tok' },
      { id: 'vec', label: 'Вытянуть карту в один вектор', in: '15×20×512', out: '153600' },
      { id: 'lin14', label: 'Линейный слой 14 → 512', in: '14', out: '1×512', ok: 'joint' },
      { id: 'lin7', label: 'Линейный слой 7 → 512', in: '7', out: '1×512' },
      { id: 'cvae', label: 'Энкодер CVAE: [CLS], суставы и k×14 действий демонстрации', in: 'demo', out: 'z: 32', ok: 'ztr' },
      { id: 'zero', label: 'z = 0', in: '—', out: 'z: 32', ok: 'zinf' },
      { id: 'zrand', label: 'Случайный z ~ N(0, I)', in: '—', out: 'z: 32' },
      { id: 'enc512', label: 'Трансформер-энкодер: 4 слоя, d = 512, 8 голов', in: 'N×512', out: 'N×512', ok: 'enc' },
      { id: 'enc256', label: 'Трансформер-энкодер: 4 слоя, d = 256', in: 'N×256', out: 'N×256' },
      { id: 'dec512', label: 'Трансформер-декодер: k запросов, cross-attention к токенам', in: 'N×512', out: 'k×512', ok: 'dec' },
      { id: 'head14', label: 'Линейный слой 512 → 14', in: 'k×512', out: 'k×14', ok: 'head' },
      { id: 'head7', label: 'Линейный слой 512 → 7', in: 'k×512', out: 'k×7' },
    ],
  };
  /** Проверка схемы. placed: { slotId: blockId }, k — число запросов, cams — число камер.
   *  Возвращает размерность на каждом стыке и ошибки. */
  function archEval(placed, k, cams) {
    const B = (id) => ARCH.blocks.find((b) => b.id === id), j = {}, err = {}, put = (s) => (placed[s] ? B(placed[s]) : null);
    // картинки
    const cnn = put('cnn'); j.cam = '480×640×3';
    if (cnn) { if (cnn.in !== j.cam) err.cnn = `ждёт ${cnn.in}`; j.cnn = cnn.out; }
    const tok = put('tok');
    if (tok) { if (!j.cnn) err.tok = 'нет входа'; else if (tok.in !== j.cnn) err.tok = `ждёт ${tok.in}, приходит ${j.cnn}`; j.tok = tok.out; }
    // суставы
    const jt = put('joint'); j.jin = '14';
    if (jt) { if (jt.in !== j.jin) err.joint = `ждёт ${jt.in}, приходит ${j.jin}`; j.joint = jt.out; }
    // z
    for (const [s, mode] of [['ztr', 'train'], ['zinf', 'infer']]) {
      const zb = put(s); if (!zb) continue;
      if (!/^z/.test(zb.out)) err[s] = 'это не z';
      else if (zb.id === 'cvae' && mode === 'infer') err[s] = 'на выводе нет действий демонстрации: энкодеру нечего кодировать';
      j[s] = '1×512';
    }
    // склейка токенов: размерность считаем, даже если выше по схеме есть ошибка, — она подсвечена на своём месте
    let nTok = null;
    if (j.tok && /^\d+×512$/.test(j.tok)) nTok = cams * parseInt(j.tok, 10);
    j.cat = nTok != null && j.joint && j.ztr && j.zinf ? `${nTok + 2}×512` : null;
    if (j.tok && !/^\d+×512$/.test(j.tok)) err.cat = `токены должны быть N×512, приходит ${j.tok}`;
    const enc = put('enc');
    if (enc) { if (!j.cat) err.enc = 'не все входы готовы'; else if (!/512$/.test(enc.in)) err.enc = `ждёт N×256, приходит ${j.cat}`; j.enc = j.cat && !err.enc ? j.cat : null; }
    const dec = put('dec');
    if (dec) { if (!j.enc) err.dec = 'нет входа'; j.dec = j.enc ? `${k}×512` : null; }
    const head = put('head');
    if (head) { if (!j.dec) err.head = 'нет входа'; j.out = j.dec ? `${k}×${head.out.split('×')[1]}` : null; }
    const filled = ARCH.slots.every((s) => placed[s.id]), allOk = filled && Object.keys(err).length === 0;
    return { j, err, filled, allOk, out: j.out, tokens: j.cat ? parseInt(j.cat, 10) : null, zOk: placed.ztr === 'cvae' && placed.zinf === 'zero' };
  }

  const API = { rng, randn, sdev, MC, mcRun, mcStats, LAB, PAUSES, labY, labData, labPolicy, labRun, TE, teBump, teWeights, teTape, teAt, DL, dlY, dlSample, delayRun, CV, Phi, cvaeFit, cvaeSide, cvaeRuns, cvaeDemo, cvaePath, ARCH, archEval };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ACT = API;
})(typeof window !== 'undefined' ? window : globalThis);
