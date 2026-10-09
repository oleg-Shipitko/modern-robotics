/* =====================================================================
   l82/engine.js — движок урока 8.2 «Безопасность». Без DOM: работает в
   браузере (window.L82, поверх window.Kettle из shared/kettle-core.js)
   и в Node (require).
   1) Мир — дом Ады сверху из уроков 1.3 и 1.5: гостиная внизу, проём в
      кухню, стол — цель. Чайник в каждой поездке стоит на новом месте.
   2) Учитель объезжает чайник с той стороны, где больше места. Политика —
      маленькая сеть, обученная по его демонстрациям (как в 1.1 и 1.5):
      видит, где Ада относительно чайника и маршрута, и выдаёт боковую
      скорость. Положение чайника она знает с ошибкой, как по камере.
   3) Фильтр безопасности на функциях барьера (CBF): на каждом шаге —
      ближайшая к команде политики скорость, при которой запас h до
      каждого известного фильтру предмета сокращается не быстрее α·h.
      Это маленькая задача квадратичной оптимизации; для одного-трёх
      ограничений на плоскости она решается точно перебором граней.
   4) Колёсная база не меняет скорость мгновенно: ускорение ограничено.
      Фильтр об этом не знает — его модель «скорость = команда».
   5) Поездки: одни и те же места чайника и одни и те же шумы с фильтром
      и без него. Все случайности — с зерном.
   Экспонента, логарифм, tanh, синус и косинус посчитаны сами: встроенные
   Math.* в разных браузерах расходятся в последнем бите, а обучение
   раздувает разницу (как в уроках 5.2–5.6).
   ===================================================================== */
'use strict';
(function (root) {
  const KC = (typeof module !== 'undefined' && module.exports) ? require('../shared/kettle-core.js') : root.Kettle;
  const { rng } = KC;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  /* ---------- 0. детерминированная математика (как в l56/engine.js) ---------- */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })();
    function pow2(k) { f64[0] = 0; u32[1 - HI] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }
    const EXPC = [1]; for (let n = 1; n <= 14; n++) EXPC.push(EXPC[n - 1] / n);
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = EXPC[14]; for (let n = 13; n >= 0; n--) sm = EXPC[n] + r * sm;
      return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
      let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
      f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
      u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];
      if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
      const sv = (m - 1) / (m + 1), s2 = sv * sv; let t = sv, sum = sv;
      for (let n = 3; n <= 41; n += 2) { t *= s2; sum += t / n; }
      return e * LN2_HI + (e * LN2_LO + 2 * sum);
    }
    function tanh(x) {
      const ax = x < 0 ? -x : x; let v;
      if (ax > 20) v = 1; else if (ax < 0.5) { const e = expm1Small(2 * ax); v = e / (e + 2); } else v = 1 - 2 / (exp(2 * ax) + 1);
      return x < 0 ? -v : v;
    }
    const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
    function sincos(x) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      return q === 0 ? [sn, cs] : q === 1 ? [cs, -sn] : q === 2 ? [-sn, -cs] : [-cs, sn];
    }
    return { exp, log, tanh, sincos };
  })();
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  /* ---------- 1. мир: дом из уроков 1.3 и 1.5 ---------- */
  const { W, H, RA, RK, RX, START, GOAL, WALLS, FURN, DOOR } = KC;
  const CFG = {
    SEED: 1,            // зерно обучения политики
    DT: 0.1,            // шаг, с: политика и фильтр решают 10 раз в секунду
    VF: 60,             // скорость вперёд по команде политики, см/с
    VLAT: 90,           // предел боковой скорости, см/с
    AMAX: 300,          // предел ускорения колёсной базы, см/с²
    TMAX: 150,          // шагов на поездку: 15 с
    SIG_K: 2,           // ошибка оценки положения чайника, см (по каждой оси, на каждом шаге)
    SIG_X: 0.5,         // шум исполнения вбок, см за шаг
    KX: 60,             // чайник по x: маршрут ± 60 см
    AMB: 2,             // масштаб сдвига, на котором оператор переходит от «наугад» к «где больше места», см
    KY0: 200, KY1: 290, // чайник по y
    ALPHA: 2,           // α фильтра, 1/с
    MARGIN: 5,          // запас фильтра сверх касания, см
    NTRIP: 100,         // поездок в серии
    TRIP0: 1,           // номер первой поездки серии
    NDEMO: 300,         // поездок учителя для обучения
    ITERS: 2500, BS: 64, LR: 0.003, HID: 32,
    CONTACT: RA + RK,   // касание: центры ближе 31 см
  };
  const OBST = WALLS.concat(FURN.map((f) => f.r));
  function rectDist(x, y, r) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); return hyp(dx, dy); }
  function clearance(x, y) { let d = Math.min(x, W - x, y, H - y); for (const r of OBST) d = Math.min(d, rectDist(x, y, r)); return d; }
  /** Касание: расстояние от отрезка a→b до центра предмета меньше суммы радиусов. */
  function segDist(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = clamp(((cx - ax) * dx + (cy - ay) * dy) / L2, 0, 1);
    return hyp(ax + dx * t - cx, ay + dy * t - cy);
  }

  /* ---------- 2. учитель: объезд с той стороны, где больше места ----------
     Как в уроках 1.3 и 1.5: Ада выходит на маршрут x = 300, у чайника
     смещается вбок с запасом 22 см, за чайником возвращается. Чем дальше
     чайник от маршрута, тем увереннее оператор объезжает его с той стороны,
     где больше места; если чайник почти на маршруте, сторону он выбирает
     почти наугад: P(слева) = 1 / (1 + e^(−dk/S)), dk — сдвиг чайника от
     маршрута. Если сторона закрыта стеной или мебелью, едет другой. */
  const TP = { gap: 22, w: 96 };
  function bump(y, k, w) { const u = Math.abs(y - k.y) / w, u0 = (RK + RA + 4) / w; return u <= u0 ? 1 : u >= 1 ? 0 : smooth((1 - u) / (1 - u0)); }
  function plan(k, side) {
    const dk = k.x - RX, C = RK + RA + TP.gap, peak = side < 0 ? Math.min(0, dk - C) : Math.max(0, dk + C);
    return (y) => RX + peak * bump(y, k, TP.w);
  }
  function pathFree(f) { for (let y = START.y; y >= GOAL.y; y -= 6) if (clearance(f(y), y) < RA + 2) return false; return true; }
  /** Вероятность объезда слева при сдвиге чайника dk. */
  const pLeft = (dk) => 1 / (1 + DM.exp(-dk / CFG.AMB));
  function teacherSide(k, r) {
    let s = r() < pLeft(k.x - RX) ? -1 : 1;
    if (!pathFree(plan(k, s))) s = -s;
    return s;
  }
  /** Место чайника: гостиная, маршрут ± KX по x, KY0…KY1 по y, не в мебели, хотя бы одна сторона объезда свободна. */
  function placeKettle(r) {
    for (let i = 0; i < 200; i++) {
      const k = { x: RX + (2 * r() - 1) * CFG.KX, y: CFG.KY0 + r() * (CFG.KY1 - CFG.KY0) };
      if (clearance(k.x, k.y) < RK + 2) continue;
      if (!pathFree(plan(k, -1)) && !pathFree(plan(k, 1))) continue;
      return k;
    }
    return { x: RX + 40, y: 250 };
  }
  /** Колёсная база: скорость догоняет команду не быстрее AMAX. */
  function base(v, u) {
    let dx = u.x - v.x, dy = u.y - v.y; const n = hyp(dx, dy), lim = CFG.AMAX * CFG.DT;
    if (n > lim) { dx *= lim / n; dy *= lim / n; }
    v.x += dx; v.y += dy;
  }
  /** Наблюдение политики (как в уроке 1.3 — пройденный путь, плюс где стоит чайник по оценке камеры). */
  function observe(y, kh, out) { out[0] = (y - kh.y) / 150; out[1] = (kh.x - RX) / 50; out[2] = (kh.y - 250) / 50; return out; }
  /** Регулятор Ады: боковая скорость к смещению, которое выдала политика, не быстрее VLAT. */
  const track = (tgt, x) => clamp((tgt - x) / CFG.DT, -CFG.VLAT, CFG.VLAT);

  /** Демонстрации операторов: NDEMO поездок с разными местами чайника. Пара для обучения —
   *  наблюдение на шаге t и боковое положение оператора на шаге t + 1 (как data13 в уроке 1.3). */
  function demos(seed) {
    const r = rng(seed * 104729 + 17), X = [], Y = [], trips = [];
    for (let i = 0; i < CFG.NDEMO; i++) {
      const k = placeKettle(r), side = teacherSide(k, r), f = plan(k, side);
      const p = { x: START.x + randn(r) * 2, y: START.y }, v = { x: 0, y: -CFG.VF }, pts = [{ x: p.x, y: p.y }];
      for (let t = 0; t < CFG.TMAX && p.y > GOAL.y; t++) {
        const kh = { x: k.x + randn(r) * CFG.SIG_K, y: k.y + randn(r) * CFG.SIG_K }, yn = p.y - CFG.VF * CFG.DT;
        X.push(observe(p.y, kh, new Float64Array(3))); Y.push((f(yn) - RX) / 50);
        base(v, { x: track(f(yn), p.x), y: -CFG.VF });
        p.x += v.x * CFG.DT + randn(r) * CFG.SIG_X; p.y += v.y * CFG.DT; pts.push({ x: p.x, y: p.y });
      }
      trips.push({ k, side, pts });
    }
    return { X, Y, trips };
  }

  /* ---------- 3. маленькая сеть: 3 → 32 → 32 → 1, tanh, Adam ---------- */
  function net(sizes, seed) {
    const r = rng(seed * 7 + 3), L = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const a = sizes[i], b = sizes[i + 1], w = new Float64Array(a * b), s = Math.sqrt(1 / a);
      for (let j = 0; j < w.length; j++) w[j] = randn(r) * s;
      L.push({ a, b, w, bias: new Float64Array(b), gw: new Float64Array(a * b), gb: new Float64Array(b), mw: new Float64Array(a * b), vw: new Float64Array(a * b), mb: new Float64Array(b), vb: new Float64Array(b), h: new Float64Array(b), d: new Float64Array(b), d2: new Float64Array(a) });
    }
    return { sizes, L, t: 0, p1: 1, p2: 1, x: null };
  }
  function fwd(m, x) {
    m.x = x; let hh = x;
    for (let li = 0; li < m.L.length; li++) {
      const l = m.L[li], o = l.h, last = li === m.L.length - 1;
      for (let j = 0; j < l.b; j++) o[j] = l.bias[j];
      for (let i = 0; i < l.a; i++) { const hi = hh[i]; if (hi === 0) continue; const off = i * l.b; for (let j = 0; j < l.b; j++) o[j] += hi * l.w[off + j]; }
      if (!last) for (let j = 0; j < l.b; j++) o[j] = DM.tanh(o[j]);
      hh = o;
    }
    return hh;
  }
  function bwd(m, g) {
    let d = g;
    for (let li = m.L.length - 1; li >= 0; li--) {
      const l = m.L[li], hin = li ? m.L[li - 1].h : m.x, dl = l.d;
      for (let j = 0; j < l.b; j++) dl[j] = li === m.L.length - 1 ? d[j] : d[j] * (1 - l.h[j] * l.h[j]);
      for (let j = 0; j < l.b; j++) l.gb[j] += dl[j];
      const din = li ? l.d2 : null;
      for (let i = 0; i < l.a; i++) {
        const off = i * l.b, hi = hin[i]; let s = 0;
        for (let j = 0; j < l.b; j++) { l.gw[off + j] += hi * dl[j]; s += l.w[off + j] * dl[j]; }
        if (din) din[i] = s;
      }
      d = din;
    }
  }
  function adam(m, lr, bs) {
    m.t++; const b1 = 0.9, b2 = 0.999; m.p1 *= b1; m.p2 *= b2; const c1 = 1 - m.p1, c2 = 1 - m.p2;
    for (const l of m.L) for (const [P, G, M, V] of [[l.w, l.gw, l.mw, l.vw], [l.bias, l.gb, l.mb, l.vb]]) {
      for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
    }
  }
  /** Обучение политики по демонстрациям (MSE): генератор, отдаёт прогресс кусками для браузера. */
  function* train(seed, o) {
    o = o || {}; seed = seed || CFG.SEED;
    const D = demos(seed), m = net([3, CFG.HID, CFG.HID, 1], seed), r = rng(seed * 31 + 7), it = o.iters || CFG.ITERS, bs = CFG.BS, g = new Float64Array(1);
    let ema = null;
    for (let s = 0; s < it; s++) {
      let L = 0;
      for (let b = 0; b < bs; b++) { const i = Math.floor(r() * D.X.length), y = fwd(m, D.X[i])[0], e = y - D.Y[i]; L += e * e; g[0] = 2 * e; bwd(m, g); }
      adam(m, CFG.LR * (s < it * 0.7 ? 1 : 0.3), bs); L /= bs; ema = ema == null ? L : 0.95 * ema + 0.05 * L;
      if (s % (o.every || 50) === 0 || s === it - 1) yield { it: s + 1, iters: it, loss: ema };
    }
    return { m, seed, demos: D, loss: ema };
  }
  function finish(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }
  const policy = (seed) => finish(train(seed));
  /** Политика: боковое положение на следующем шаге, см (по оценке положения чайника). */
  const OB = new Float64Array(3);
  const target = (pol, y, kh) => RX + 50 * fwd(pol.m, observe(y, kh, OB))[0];
  /** Команда Ады: регулятор ведёт её к смещению политики; вперёд — VF. */
  function act(pol, x, y, kh) { return track(target(pol, y, kh), x); }

  /* ---------- 4. фильтр безопасности: функции барьера и маленькая QP ----------
     Для каждого известного фильтру круглого предмета (центр c, радиус r):
       h(p) = |p − c| − (RA + r + запас)   — запас до границы безопасного множества, см;
       ḣ = n·u, n = (p − c)/|p − c|        — как быстро запас меняется при скорости u;
       условие: n·u ≥ −α·h                 — запас сокращается не быстрее α·h.
     Команда фильтра — ближайшая к команде политики u_ref скорость, которая
     выполняет все условия: min |u − u_ref|² при n_i·u ≥ −α·h_i. Допустимое
     множество — пересечение полуплоскостей в плоскости скоростей; ближайшая
     точка лежит либо в самой u_ref, либо на одной из граней, либо в вершине
     двух граней — перебираем их все. */
  function rowsFor(p, obs, alpha, margin) {
    const rows = [];
    for (const o of obs) {
      const dx = p.x - o.x, dy = p.y - o.y, d = hyp(dx, dy) || 1e-9, h = d - (RA + o.r + margin);
      rows.push({ nx: dx / d, ny: dy / d, b: -alpha * h, h, d, id: o.id });
    }
    return rows;
  }
  function qp(u, rows) {
    const ok = (x, y) => { for (const q of rows) if (q.nx * x + q.ny * y < q.b - 1e-9) return false; return true; };
    if (ok(u.x, u.y)) return { x: u.x, y: u.y, active: [] };
    let best = null, bd = Infinity;
    const take = (x, y, act) => { if (!ok(x, y)) return; const ex = x - u.x, ey = y - u.y, d = ex * ex + ey * ey; if (d < bd - 1e-12) { bd = d; best = { x, y, active: act }; } };
    rows.forEach((q, i) => { const nn = q.nx * q.nx + q.ny * q.ny, s = (q.b - (q.nx * u.x + q.ny * u.y)) / nn; take(u.x + s * q.nx, u.y + s * q.ny, [i]); });
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j], det = a.nx * b.ny - a.ny * b.nx;
      if (Math.abs(det) < 1e-9) continue;
      take((a.b * b.ny - a.ny * b.b) / det, (a.nx * b.b - a.b * b.nx) / det, [i, j]);
    }
    return best || { x: 0, y: 0, active: rows.map((q, i) => i), stuck: true };
  }
  /** Одна команда фильтра: p — где Ада, u — команда политики, obs — что знает фильтр [{x, y, r}]. */
  function filter(p, u, obs, alpha, margin) {
    const rows = rowsFor(p, obs, alpha, margin), s = qp(u, rows);
    return { x: s.x, y: s.y, active: s.active, rows };
  }

  /* ---------- 5. поездка ----------
     o: { seed — номер поездки (задаёт место чайника и все шумы), filter, alpha, margin,
          bias: {x, y} — систематическая ошибка оценки чайника, sigK,
          box: true — на полу корзина (её не видит политика), boxKnown — корзина на карте фильтра,
          keep — сохранить ряды для графиков }. */
  const RB = 18;                                  // радиус корзины, см
  const BOX = { x: 250, y: 210 };                 // где стоит корзина в гостиной
  function tripWorld(seed, o) {
    const rk = rng(seed * 7919 + 101), k = placeKettle(rk), side = teacherSide(k, rk), b = (o && o.boxAt) || BOX;
    return { k, side, box: { x: b.x, y: b.y, r: RB } };
  }
  function trip(pol, o) {
    o = o || {}; const seed = o.seed || 1, w = tripWorld(seed, o), k = w.k, box = o.box ? w.box : null;
    const rn = rng(seed * 104729 + 7), re = rng(seed * 15485863 + 3);
    const alpha = o.alpha == null ? CFG.ALPHA : o.alpha, margin = o.margin == null ? CFG.MARGIN : o.margin, sigK = o.sigK == null ? CFG.SIG_K : o.sigK;
    const bias = o.bias || { x: 0, y: 0 }, keep = !!o.keep;
    const p = { x: START.x + randn(re) * 2, y: START.y }, v = { x: 0, y: -CFG.VF };
    const pts = [{ x: p.x, y: p.y }], ser = keep ? [] : null;
    let outcome = 'stuck', tEnd = CFG.TMAX, minGap = Infinity, minGapB = Infinity, nAct = 0, corr = 0, t = 0;
    const gapK = () => hyp(p.x - k.x, p.y - k.y) - (RA + RK);
    minGap = gapK();
    for (t = 0; t < CFG.TMAX; t++) {
      const kh = { x: k.x + bias.x + randn(rn) * sigK, y: k.y + bias.y + randn(rn) * sigK, r: RK, id: 'kettle' };
      const bh = box ? { x: box.x + randn(rn) * sigK, y: box.y + randn(rn) * sigK, r: RB, id: 'box' } : null;
      const ur = { x: act(pol, p.x, p.y, kh), y: -CFG.VF };
      let u = ur, f = null;
      if (o.filter) {
        const obs = [kh]; if (bh && o.boxKnown) obs.push(bh);
        f = filter(p, ur, obs, alpha, margin); u = { x: f.x, y: f.y };
        const ex = u.x - ur.x, ey = u.y - ur.y, du = hyp(ex, ey); if (du > 0.5) nAct++; corr += du;
      }
      const d0 = hyp(p.x - k.x, p.y - k.y);
      base(v, u);
      const nx = p.x + v.x * CFG.DT + randn(re) * CFG.SIG_X, ny = p.y + v.y * CFG.DT;
      let hit = null;
      if (segDist(p.x, p.y, nx, ny, k.x, k.y) < RA + RK) hit = 'kettle';
      else if (box && segDist(p.x, p.y, nx, ny, box.x, box.y) < RA + RB) hit = 'box';
      else if (clearance(nx, ny) < RA) hit = 'wall';
      if (keep) ser.push({ x: p.x, y: p.y, urx: ur.x, ury: ur.y, ux: u.x, uy: u.y, h: f ? f.rows[0].h : hyp(p.x - kh.x, p.y - kh.y) - (RA + RK + margin), gap: d0 - (RA + RK), appr: -(hyp(nx - k.x, ny - k.y) - d0) / CFG.DT, act: f ? f.active.length > 0 : false });
      p.x = nx; p.y = ny; pts.push({ x: p.x, y: p.y });
      const g = gapK(); if (g < minGap) minGap = g;
      if (box) { const gb = hyp(p.x - box.x, p.y - box.y) - (RA + RB); if (gb < minGapB) minGapB = gb; }
      if (hit) { outcome = hit; tEnd = t + 1; break; }
      if (p.y <= GOAL.y + 1) { outcome = 'goal'; tEnd = t + 1; break; }
    }
    return { seed, k, side: w.side, box, outcome, steps: tEnd, time: tEnd * CFG.DT, minGap, minGapB, nAct, corr, pts, ser };
  }
  /** Серия поездок TRIP0…TRIP0+n−1 с одними и теми же настройками. */
  function batch(pol, o) {
    o = o || {}; const n = o.n || CFG.NTRIP, s0 = o.seed0 || CFG.TRIP0, trips = [];
    for (let i = 0; i < n; i++) trips.push(trip(pol, Object.assign({}, o, { seed: s0 + i, keep: false })));
    return summarize(trips);
  }
  function summarize(trips) {
    const c = (w) => trips.filter((q) => q.outcome === w).length, goal = trips.filter((q) => q.outcome === 'goal');
    const tm = goal.length ? goal.reduce((s, q) => s + q.time, 0) / goal.length : null;
    return {
      trips, n: trips.length, goal: goal.length, kettle: c('kettle'), box: c('box'), wall: c('wall'), stuck: c('stuck'),
      hits: c('kettle') + c('box') + c('wall'), tMean: tm, minGap: Math.min(...trips.map((q) => q.minGap)),
      act: trips.reduce((s, q) => s + q.nAct, 0) / Math.max(1, trips.reduce((s, q) => s + q.steps, 0)),
    };
  }

  const API = {
    CFG, DM, randn, rng, clamp, hyp, W, H, RA, RK, RB, BOX, RX, START, GOAL, DOOR, TP,
    clearance, segDist, bump, plan, pathFree, pLeft, teacherSide, placeKettle, base, observe, track, demos, target,
    net, fwd, bwd, adam, train, finish, policy, act, rowsFor, qp, filter, tripWorld, trip, batch, summarize,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L82 = API;
})(typeof window !== 'undefined' ? window : globalThis);
