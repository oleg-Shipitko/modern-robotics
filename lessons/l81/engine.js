/* =====================================================================
   l81/engine.js — движок урока 8.1 «Классические методы в контуре
   управления». Без DOM: работает в браузере (window.L81, поверх window.Arm
   из shared/arm-core.js) и в Node (require).
   Мир — рука Ады из урока 0.3: два звена 0,5 и 0,4 м в вертикальной
   плоскости (вид сбоку), массы 1,2 и 0,9 кг на концах звеньев, стол на
   12 см ниже плеча, полка. Шаг симуляции 1 мс.
   1) Сцена: предметы на столе и камера Ады — полоска глубины из 24 клеток
      по 2,5 см: высота того, что лежит на столе, с шумом.
   2) Классика: обратная кинематика, путь из отрезков, импедансный
      регулятор с компенсацией веса по модели (1000 раз в секунду).
   3) Сети: маленькие перцептроны, обучение по демонстрациям (Adam).
      Сеть-моменты и сеть-цель (лаборатория 1), остаточная поправка и сеть
      с нуля (лаборатория 2), сети слоёв (лаборатория 3).
   Экспонента, логарифм, синус, косинус и арктангенс посчитаны сами:
   встроенные Math.* в разных браузерах расходятся в последнем бите, а
   обучение раздувает разницу. Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  const ARM = (typeof module !== 'undefined' && module.exports) ? require('../shared/arm-core.js') : root.Arm;
  const { rng } = ARM;
  const L1 = ARM.L1, L2 = ARM.L2, M1 = ARM.M1, M2 = ARM.M2, GR = ARM.GR, TABLE = ARM.TABLE;

  /* ---------- 0. детерминированная математика (как в l52/engine.js и l56/engine.js) ---------- */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    const EXPC = [1]; for (let n = 1; n <= 14; n++) EXPC.push(EXPC[n - 1] / n);   // 1/n!
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = EXPC[14]; for (let n = 13; n >= 0; n--) sm = EXPC[n] + r * sm;   // схема Горнера
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
    const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
    function sincos(x) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      return q === 0 ? [sn, cs] : q === 1 ? [cs, -sn] : q === 2 ? [-sn, -cs] : [-cs, sn];
    }
    const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
    function atan(z) {
      let sg = 1; if (z < 0) { z = -z; sg = -1; }
      let inv = false; if (z > 1) { z = 1 / z; inv = true; }
      let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
      const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
      const a = off + sm; return sg * (inv ? PIO2 - a : a);
    }
    function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
    const acos = (c) => atan2(Math.sqrt(Math.max(0, 1 - c * c)), c);
    return { exp, log, sincos, atan2, acos };
  })();
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  /* ---------- 1. рука: кинематика и динамика (как shared/arm-core.js, на своей математике) ---------- */
  const TAU_MAX = [40, 20];        // предел моментов моторов, Н·м
  const VISC = 0.05;               // вязкое трение в суставах, Н·м·с/рад
  const TABLE_X0 = 0.2;            // стол начинается в 20 см от плеча
  /** Положение локтя и захвата, якобиан и косинусы для компенсации веса. */
  function kin(q) {
    const a = DM.sincos(q[0]), b = DM.sincos(q[0] + q[1]);
    const x1 = L1 * a[1], y1 = L1 * a[0], x = x1 + L2 * b[1], y = y1 + L2 * b[0];
    return { x1, y1, x, y, J: [[-L1 * a[0] - L2 * b[0], -L2 * b[0]], [L1 * a[1] + L2 * b[1], L2 * b[1]]], c1: a[1], c12: b[1] };
  }
  /** Моменты, которые уравновешивают вес руки и груза массой load в захвате. */
  const gravity = (k, load) => { const m2 = M2 + (load || 0); return [(M1 + m2) * GR * L1 * k.c1 + m2 * GR * L2 * k.c12, m2 * GR * L2 * k.c12]; };
  /** Обратная кинематика: локоть вверх (θ₂ < 0). null — точка вне досягаемости. */
  function ik(x, y) {
    const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    if (c2 > 1 || c2 < -1) return null;
    const q2 = -DM.acos(c2), s = DM.sincos(q2);
    return [DM.atan2(y, x) - DM.atan2(L2 * s[0], L1 + L2 * s[1]), q2];
  }
  /** Ближайшая досягаемая точка: внутри кольца между 0,1 и 0,9 м от плеча (с запасом 1 мм). */
  function reach(x, y) { const r = hyp(x, y) || 1e-9, lo = L1 - L2 + 0.001, hi = L1 + L2 - 0.001, f = r > hi ? hi / r : r < lo ? lo / r : 1; return { x: x * f, y: y * f, clipped: f !== 1 }; }
  /** Ускорения суставов: груз load — точечная масса в захвате. */
  function dyn(q, dq, tau, load) {
    const m2 = M2 + (load || 0), cs = DM.sincos(q[1]), c2 = cs[1], s2 = cs[0];
    const a = (M1 + m2) * L1 * L1 + m2 * L2 * L2 + 2 * m2 * L1 * L2 * c2, b = m2 * L2 * L2 + m2 * L1 * L2 * c2, d = m2 * L2 * L2, h = m2 * L1 * L2 * s2;
    const k = kin(q), G = gravity(k, load);
    const C1 = -h * (2 * dq[0] * dq[1] + dq[1] * dq[1]), C2 = h * dq[0] * dq[0];
    const r1 = tau[0] - C1 - G[0] - VISC * dq[0], r2 = tau[1] - C2 - G[1] - VISC * dq[1], det = a * d - b * b;
    return [(d * r1 - b * r2) / det, (-b * r1 + a * r2) / det];
  }
  const DT = 0.001;
  /** Один шаг 1 мс. o.ext — внешняя сила на захват (толчок), Н; o.drop — на сколько ниже захвата точка касания (дно кастрюли);
   *  o.shelf — полка, на которую можно поставить кастрюлю. Возвращает силу, с которой стол или полка давят снизу. */
  function step(s, tau, o) {
    o = o || {};
    const k = kin(s.q), J = k.J, t = [clamp(tau[0], -TAU_MAX[0], TAU_MAX[0]), clamp(tau[1], -TAU_MAX[1], TAU_MAX[1])];
    s.tauMotor = [t[0], t[1]];   // момент моторов после предела — до сил стола и толчка
    const cy = k.y - (o.drop || 0), vy = J[1][0] * s.dq[0] + J[1][1] * s.dq[1];
    let F = 0;
    if (cy < TABLE && k.x > TABLE_X0) F = Math.max(0, 6000 * (TABLE - cy) - 40 * vy);
    const sh = o.shelf;
    if (sh && cy < sh.y && cy > sh.y - 0.03 && k.x - (o.halfW || 0) >= sh.x0 - 0.005) F += Math.max(0, 6000 * (sh.y - cy) - 40 * vy);
    if (F) { t[0] += J[1][0] * F; t[1] += J[1][1] * F; }
    if (o.ext) { const fx = o.ext[0], fy = o.ext[1]; t[0] += J[0][0] * fx + J[1][0] * fy; t[1] += J[0][1] * fx + J[1][1] * fy; }
    const a = dyn(s.q, s.dq, t, o.load);
    s.dq = [s.dq[0] + a[0] * DT, s.dq[1] + a[1] * DT]; s.q = [s.q[0] + s.dq[0] * DT, s.q[1] + s.dq[1] * DT];
    s.tauApplied = t;
    return F;
  }
  const vel = (k, dq) => [k.J[0][0] * dq[0] + k.J[0][1] * dq[1], k.J[1][0] * dq[0] + k.J[1][1] * dq[1]];

  /* ---------- 2. путь и импедансный регулятор ---------- */
  /** Путь — ломаная из точек. Морковка — точка пути на lead метров впереди проекции захвата. */
  function path(pts) {
    const seg = []; let tot = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const L = hyp(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); seg.push({ a: pts[i], b: pts[i + 1], L, s0: tot }); tot += L; }
    return { pts, seg, tot };
  }
  function pointAt(P, s) {
    s = clamp(s, 0, P.tot);
    for (const g of P.seg) if (s <= g.s0 + g.L + 1e-12) { const u = g.L ? (s - g.s0) / g.L : 0; return { x: g.a.x + (g.b.x - g.a.x) * u, y: g.a.y + (g.b.y - g.a.y) * u }; }
    const e = P.pts[P.pts.length - 1]; return { x: e.x, y: e.y };
  }
  function project(P, x, y) {
    let best = Infinity, bs = 0;
    for (const g of P.seg) {
      const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, u = g.L ? clamp(((x - g.a.x) * dx + (y - g.a.y) * dy) / (g.L * g.L), 0, 1) : 0;
      const px = g.a.x + dx * u, py = g.a.y + dy * u, d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best - 1e-15) { best = d; bs = g.s0 + u * g.L; }
    }
    return bs;
  }
  const carrot = (P, x, y, lead) => pointAt(P, project(P, x, y) + lead);
  const IMP = { K: 300, D: 2 * Math.sqrt(300 * 1.5), LEAD: 0.05 };
  /** Импеданс: пружина K к морковке и демпфер D в пространстве захвата, моменты через Jᵀ, плюс вес по модели. */
  function impTau(s, c, o) {
    const k = kin(s.q), v = vel(k, s.dq), K = (o && o.K) || IMP.K, D = (o && o.D) || IMP.D;
    const Fx = K * (c.x - k.x) - D * v[0], Fy = K * (c.y - k.y) - D * v[1], g = gravity(k, o && o.loadModel);
    return [k.J[0][0] * Fx + k.J[1][0] * Fy + g[0], k.J[0][1] * Fx + k.J[1][1] * Fy + g[1]];
  }

  /* ---------- 3. сцена: предметы на столе и камера глубины ---------- */
  const TYPES = {
    cup: { name: 'чашка', w: 0.07, h: 0.09 },
    mug: { name: 'высокая кружка', w: 0.08, h: 0.13 },
    bowl: { name: 'миска', w: 0.15, h: 0.06, hollow: true },
    sponge: { name: 'губка', w: 0.10, h: 0.03 },
    vase: { name: 'ваза', w: 0.08, h: 0.26 },
  };
  const obj = (type, x, extra) => Object.assign({ type, x, w: TYPES[type].w, h: TYPES[type].h, hollow: !!TYPES[type].hollow }, extra || {});
  const CAM = { N: 24, X0: 0.30, CELL: 0.025, NOISE: 0.003 };
  const RIM = 0.008, BOWL_BOTTOM = 0.02;
  /** Высота того, что стоит на столе, над точкой x (вид сверху: у миски внутри видно дно). */
  function heightAt(objs, x) {
    let h = 0;
    for (const o of objs) { const d = Math.abs(x - o.x); if (d > o.w / 2) continue; const v = o.hollow && d < o.w / 2 - RIM ? BOWL_BOTTOM : o.h; if (v > h) h = v; }
    return h;
  }
  /** Камера Ады: 24 клетки по 2,5 см от 30 до 90 см; в клетке — наибольшая высота, плюс шум 3 мм. */
  function scan(objs, r, out) {
    out = out || new Float64Array(CAM.N);
    for (let i = 0; i < CAM.N; i++) {
      let h = 0; for (let j = 0; j < 5; j++) h = Math.max(h, heightAt(objs, CAM.X0 + CAM.CELL * (i + 0.1 + 0.2 * j)));
      out[i] = h + (r ? randn(r) * CAM.NOISE : 0);
    }
    return out;
  }
  /** Где правильно брать предмет: у миски — за ближний край, у остальных — сверху по центру. */
  function graspOf(o) {
    if (o.hollow) return { x: o.x - o.w / 2 + RIM * 0.75, y: TABLE + o.h - 0.015, tx: 0.01, ty: 0.015 };
    return { x: o.x, y: TABLE + o.h - (o.h < 0.05 ? 0.015 : 0.02), tx: 0.015, ty: 0.015 };
  }
  const inZone = (g, x, y) => Math.abs(x - g.x) <= g.tx && Math.abs(y - g.y) <= g.ty;
  /** Пересекает ли отрезок прямоугольник (с запасом m на толщину звена). */
  function segRect(ax, ay, bx, by, x0, y0, x1, y1, m) {
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  /** Задела ли рука (оба звена и захват) какой-нибудь предмет из списка: индекс или −1. */
  function hitObj(k, objs) {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i], x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = TABLE, y1 = TABLE + o.h;
      if (segRect(0, 0, k.x1, k.y1, x0, y0, x1, y1, 0.015) || segRect(k.x1, k.y1, k.x, k.y, x0, y0, x1, y1, 0.012)) return i;
    }
    return -1;
  }

  /* ---------- 4. маленькие сети: перцептрон с ReLU с утечкой, Adam ---------- */
  function mlp(sizes, seed, zeroLast) {
    const r = rng(seed), L = sizes.length - 1, W = [], B = [];
    for (let l = 0; l < L; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), sc = (l < L - 1 ? Math.sqrt(2) : 0.5) * Math.sqrt(1 / a);
      if (!(zeroLast && l === L - 1)) for (let i = 0; i < w.length; i++) w[i] = randn(r) * sc;
      W.push(w); B.push(new Float64Array(b));
    }
    const z = (arr) => arr.map((x) => new Float64Array(x.length));
    return { sizes, L, W, B, mW: z(W), vW: z(W), mB: z(B), vB: z(B), t: 0, p1: 1, p2: 1, a: sizes.map((k) => new Float64Array(k)), d: sizes.map((k) => new Float64Array(k)) };
  }
  /** Прямой проход: выход — в n.a[L] (не копируется). */
  function fwd(n, x) {
    n.a[0] = x; let ai = x;
    for (let l = 0; l < n.L; l++) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], b = n.B[l], ao = n.a[l + 1];
      for (let o = 0; o < nO; o++) ao[o] = b[o];
      for (let i = 0; i < nI; i++) { const v = ai[i]; if (v === 0) continue; const off = i * nO; for (let o = 0; o < nO; o++) ao[o] += v * w[off + o]; }
      if (l < n.L - 1) for (let o = 0; o < nO; o++) if (ao[o] < 0) ao[o] *= 0.01;
      ai = ao;
    }
    return ai;
  }
  function bwd(n, gOut, g) {
    let dO = gOut;
    for (let l = n.L - 1; l >= 0; l--) {
      const nI = n.sizes[l], nO = n.sizes[l + 1], w = n.W[l], ai = n.a[l], gw = g.W[l], gb = g.B[l];
      if (l < n.L - 1) { const ao = n.a[l + 1]; for (let o = 0; o < nO; o++) if (ao[o] < 0) dO[o] *= 0.01; }
      for (let o = 0; o < nO; o++) gb[o] += dO[o];
      const dI = n.d[l];
      for (let i = 0; i < nI; i++) { const v = ai[i], off = i * nO; let sm = 0; for (let o = 0; o < nO; o++) { gw[off + o] += v * dO[o]; sm += w[off + o] * dO[o]; } dI[i] = sm; }
      dO = dI;
    }
  }
  function adam(n, g, lr) {
    n.t++; const b1 = 0.9, b2 = 0.999; n.p1 *= b1; n.p2 *= b2; const c1 = 1 - n.p1, c2 = 1 - n.p2;
    for (let l = 0; l < n.L; l++) for (let h = 0; h < 2; h++) {
      const P = h ? n.B[l] : n.W[l], G = h ? g.B[l] : g.W[l], M = h ? n.mB[l] : n.mW[l], V = h ? n.vB[l] : n.vW[l];
      for (let i = 0; i < P.length; i++) { const gi = G[i]; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
    }
  }
  /** Обучение по парам (X[i] → Y[i]) средним квадратом ошибки: генератор, отдаёт { it, loss } каждые every шагов. */
  function* fit(n, X, Y, o) {
    const steps = o.steps, bs = o.batch || 64, r = rng(o.seed), N = X.length, nO = n.sizes[n.L];
    const g = { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }, gOut = new Float64Array(nO);
    let ema = null;
    for (let it = 0; it < steps; it++) {
      let loss = 0;
      for (let b = 0; b < bs; b++) {
        const i = Math.floor(r() * N), out = fwd(n, X[i]), y = Y[i];
        if (o.ce) {   // классификация: y[0] — номер верного класса, перекрёстная энтропия
          let m = -Infinity; for (let k = 0; k < nO; k++) if (out[k] > m) m = out[k];
          let z = 0; for (let k = 0; k < nO; k++) { gOut[k] = DM.exp(out[k] - m); z += gOut[k]; }
          for (let k = 0; k < nO; k++) gOut[k] = (gOut[k] / z - (k === y[0] ? 1 : 0)) / bs;
          loss -= DM.log(Math.max(1e-300, DM.exp(out[y[0]] - m) / z));
        } else for (let k = 0; k < nO; k++) { const e = out[k] - y[k]; loss += e * e; gOut[k] = 2 * e / bs; }
        bwd(n, gOut, g);
      }
      adam(n, g, (o.lr || 0.003) * (it < steps * 0.7 ? 1 : 0.3));
      loss /= bs; ema = ema == null ? loss : 0.97 * ema + 0.03 * loss;
      if ((it + 1) % (o.every || 50) === 0 || it === steps - 1) yield { it: it + 1, loss: ema };
    }
    return n;
  }
  const runGen = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };

  /* ---------- 5. эпизод «возьми предмет»: эксперт, сеть-моменты, сеть-цель + классика ---------- */
  const START = { x: 0.30, y: 0.20 };   // захват перед стартом: над столом, у корпуса
  const PRE = 0.08;                     // подход сверху: точка на 8 см выше точки захвата
  const RATE = 20;                      // сеть отвечает раз в 20 мс — 50 раз в секунду
  const SMOOTH = 0.25;                  // классика сглаживает цель от сети: каждый ответ сдвигает её на четверть
  const TAU_SC = 20, NIN = CAM.N + 6;
  /** Вход сетей: камера (24 числа, в дециметрах) и состояние руки (cos, sin углов и скорости). */
  function features(sc, s, out) {
    for (let i = 0; i < CAM.N; i++) out[i] = sc[i] * 10;
    const a = DM.sincos(s.q[0]), b = DM.sincos(s.q[1]);
    out[CAM.N] = a[1]; out[CAM.N + 1] = a[0]; out[CAM.N + 2] = b[1]; out[CAM.N + 3] = b[0]; out[CAM.N + 4] = s.dq[0] / 4; out[CAM.N + 5] = s.dq[1] / 4;
    return out;
  }
  const encG = (g) => [(g.x - 0.6) / 0.2, (g.y + 0.05) / 0.1];
  const decG = (o) => ({ x: 0.6 + 0.2 * o[0], y: -0.05 + 0.1 * o[1] });
  /** Путь классики к точке захвата: от старта к точке над целью, потом вниз. Цель сначала приводится в досягаемую область. */
  function approach(s0, g) { const t = reach(g.x, g.y), p = reach(t.x, t.y + PRE); return path([s0, p, t]); }
  function startState(r, jitter) {
    const x = START.x + (jitter ? (r() - 0.5) * 0.03 : 0), y = START.y + (jitter ? (r() - 0.5) * 0.03 : 0);
    return { q: ik(x, y), dq: [0, 0] };
  }
  /** Эпизод. o: { objs, ti — какой предмет брать, mode: 'expert' | 'e2e' | 'tgt', net, T, push: { t, dur, f }, seed, demo }.
   *  Кадры каждые 10 мс; при o.demo — пары для обучения (вход, моменты эксперта, точка захвата) каждые 20 мс. */
  function episode(o) {
    const r = rng(o.seed), s = startState(r, !!o.jitter), k0 = kin(s.q), s0 = { x: k0.x, y: k0.y };
    const objs = o.objs, G = graspOf(objs[o.ti]), others = objs.filter((_, i) => i !== o.ti);
    const T = o.T || 2.5, sc = new Float64Array(CAM.N), x = new Float64Array(NIN), frames = [], X = [], Yt = [], Yg = [];
    let hold = [0, 0], tgt = G, P = approach(s0, G), peak = 0, hit = -1, prevTau = null, jump = 0, nJ = 0, nz = [0, 0], pre = null;
    const rate = o.rate || RATE;
    for (let i = 0; i <= Math.round(T * 1000); i++) {
      const t = i / 1000, k = kin(s.q);
      if (i % rate === 0) {
        features(scan(objs, r, sc), s, x);
        if (o.mode === 'e2e') { const out = fwd(o.net, x); hold = [out[0] * TAU_SC, out[1] * TAU_SC]; }
        else if (o.mode === 'tgt') { const g = decG(fwd(o.net, o.net.sizes[0] === CAM.N ? x.subarray(0, CAM.N) : x)); tgt = i ? { x: tgt.x + SMOOTH * (g.x - tgt.x), y: tgt.y + SMOOTH * (g.y - tgt.y) } : g; P = approach(s0, tgt); }
        if (o.demo) { const c = carrot(P, k.x, k.y, IMP.LEAD), tau = impTau(s, c); X.push(Float64Array.from(x)); Yt.push(Float64Array.from([tau[0] / TAU_SC, tau[1] / TAU_SC])); Yg.push(Float64Array.from(encG(G))); }
        if (o.dart) nz = [randn(r) * o.dart, randn(r) * o.dart * 0.5];
      }
      let tau = o.mode === 'e2e' ? hold : impTau(s, carrot(P, k.x, k.y, IMP.LEAD));
      if (o.dart) tau = [tau[0] + nz[0], tau[1] + nz[1]];
      if (o.push && pre == null && t >= o.push.t) pre = { x: k.x, y: k.y };
      const push = o.push && t >= o.push.t && t < o.push.t + o.push.dur ? o.push.f : null;
      const F = i ? step(s, tau, { ext: push }) : 0;
      const ta = s.tauMotor || tau;
      if (prevTau) { jump += Math.abs(ta[0] - prevTau[0]) + Math.abs(ta[1] - prevTau[1]); nJ++; } prevTau = ta;
      if (F > peak) peak = F;
      const k2 = kin(s.q); if (hit < 0) { const h = hitObj(k2, others); if (h >= 0) hit = h; }
      if (i % 10 === 0) frames.push({ t, q: s.q.slice(), x: k2.x, y: k2.y, F, tau: [ta[0], ta[1]], tgt: { x: tgt.x, y: tgt.y } });
    }
    const last = frames[frames.length - 1], tail = frames.filter((f) => f.t >= T - 0.5 - 1e-9);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of tail) { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x); y0 = Math.min(y0, f.y); y1 = Math.max(y1, f.y); }
    const err = hyp(last.x - G.x, last.y - G.y), ok = inZone(G, last.x, last.y) && peak <= LIM.F && hit < 0;
    return { frames, G, err, jitter: hyp(x1 - x0, y1 - y0), peak, hit, ok, jump: jump / Math.max(1, nJ), back: pre ? hyp(last.x - pre.x, last.y - pre.y) : null, pre, X, Yt, Yg };
  }
  const LIM = { F: 20 };   // сила, с которой захват может давить на стол без вреда, Н

  /* ---------- 6. лаборатория 1: одна сцена, две сети, одни проверки ---------- */
  const LAB1 = { ND: 100, H: 32, STEPS: 2000, DART: 1, T: 3, XS: [0.48, 0.55, 0.62, 0.69, 0.76], PUSH: { t: 2.2, dur: 0.12, f: [0, -40] }, TP: 4, PX: 0.62 };
  /** Демонстрации: эксперт — классика, которая знает точную точку захвата; чашки и губки в случайных местах стола,
   *  к моментам подмешан шум, как у шумного оператора DART из урока 1.1. */
  function lab1Demos(seed) {
    const r = rng(seed * 7919 + 1), X = [], Yt = [], Yg = [], eps = [];
    for (let d = 0; d < LAB1.ND; d++) {
      const type = r() < 0.5 ? 'cup' : 'sponge', x = 0.45 + 0.35 * r();
      const ep = episode({ objs: [obj(type, x)], ti: 0, mode: 'expert', T: LAB1.T, seed: seed * 1000 + d, demo: true, jitter: true, dart: LAB1.DART });
      for (let i = 0; i < ep.X.length; i++) { X.push(ep.X[i]); Yt.push(ep.Yt[i]); Yg.push(ep.Yg[i]); }
      eps.push({ type, x });
    }
    return { X, Yt, Yg, Xs: X.map((v) => v.subarray(0, CAM.N)), eps };
  }
  /** Обучение обеих сетей по очереди: генератор отдаёт долю готовности; итог — { e2e, tgt, lossT, lossG }. */
  function* lab1Train(seed) {
    const D = lab1Demos(seed), e2e = mlp([NIN, LAB1.H, LAB1.H, 2], seed * 31 + 1), tgt = mlp([CAM.N, LAB1.H, LAB1.H, 2], seed * 31 + 1);
    let lossT = 0, lossG = 0;
    for (const e of fit(e2e, D.X, D.Yt, { steps: LAB1.STEPS, seed: seed * 17 + 3, every: 100 })) { lossT = e.loss; yield { p: 0.5 * e.it / LAB1.STEPS }; }
    for (const e of fit(tgt, D.Xs, D.Yg, { steps: LAB1.STEPS, seed: seed * 17 + 3, every: 100 })) { lossG = e.loss; yield { p: 0.5 + 0.5 * e.it / LAB1.STEPS }; }
    // насколько хорошо каждая сеть выучила свои демонстрации: средняя ошибка на обучающих парах в своих единицах
    let eT = 0, eX = 0, eY = 0;
    for (let i = 0; i < D.X.length; i++) {
      const o = fwd(e2e, D.X[i]); eT += (Math.abs(o[0] - D.Yt[i][0]) + Math.abs(o[1] - D.Yt[i][1])) / 2 * TAU_SC;
      const g = fwd(tgt, D.Xs[i]); eX += Math.abs(g[0] - D.Yg[i][0]) * 0.2; eY += Math.abs(g[1] - D.Yg[i][1]) * 0.1;
    }
    const n = D.X.length;
    return { e2e, tgt, lossT, lossG, demos: D.eps, pairs: n, fitErr: { tau: eT / n, gx: eX / n, gy: eY / n } };
  }
  /** Проверка: 'cups' — пять чашек, 'sponges' — пять губок у самого стола, 'push' — толчок, когда захват уже у чашки.
   *  Каждая рука проходит одни и те же прогоны с одним и тем же шумом камеры. */
  function lab1Test(nets, test, extra) {
    const runs = [];
    const one = (type, x, i, push, T) => ({ e2e: episode({ objs: [obj(type, x)], ti: 0, mode: 'e2e', net: nets.e2e, T, seed: 500 + i, push }), tgt: episode({ objs: [obj(type, x)], ti: 0, mode: 'tgt', net: nets.tgt, T, seed: 500 + i, push }), type, x });
    if (test === 'cups') LAB1.XS.forEach((x, i) => runs.push(one('cup', x, i, null, LAB1.T)));
    else if (test === 'sponges') LAB1.XS.forEach((x, i) => runs.push(one('sponge', x, 10 + i, null, LAB1.T)));
    else if (test === 'push') runs.push(one('cup', LAB1.PX, 20, LAB1.PUSH, LAB1.TP));
    else runs.push(one(extra.type, extra.x, 30, extra.push ? LAB1.PUSH : null, extra.push ? LAB1.TP : LAB1.T));
    const sum = (side) => {
      const R = runs.map((r) => r[side]), dev = (q) => q.pre ? Math.max(...q.frames.filter((f) => f.t >= LAB1.PUSH.t).map((f) => hyp(f.x - q.pre.x, f.y - q.pre.y))) : null;
      const jit = R.map((q) => q.jitter).sort((a, b) => a - b);
      // ответ на толчок: на сколько вырос момент в плече за 0,3 с после начала толчка
      const resp = (q) => { if (!q.pre) return null; const b = q.frames.find((f) => f.t >= LAB1.PUSH.t - 0.01).tau[0]; return Math.max(...q.frames.filter((f) => f.t >= LAB1.PUSH.t && f.t <= LAB1.PUSH.t + 0.3).map((f) => f.tau[0] - b)); };
      return { ok: R.filter((q) => q.ok).length, n: R.length, err: R.reduce((a, q) => a + q.err, 0) / R.length, errMax: Math.max(...R.map((q) => q.err)), jitMed: jit[(jit.length - 1) >> 1], jitMax: jit[jit.length - 1],
        peak: Math.max(...R.map((q) => q.peak)), touch: R.filter((q) => q.peak > 0.5).length, dev: dev(R[0]), back: R[0].back, resp: resp(R[0]) };
    };
    return { test, runs, e2e: sum('e2e'), tgt: sum('tgt') };
  }

  /* ---------- 7. лаборатория 2: кастрюля на полку — регулятор, остаточная поправка, сеть с нуля ---------- */
  const SHELF = { y: 0.25, x0: 0.50, x1: 0.95, th: 0.02 };   // доска полки: верх на 25 см выше плеча, край в 50 см
  const POT = { w: 0.12, h: 0.09, m: 1.2 };                   // кастрюля: захват держит её за ручку сверху
  const LAB2 = { NS: [0, 1, 2, 4, 8, 16, 32], H: 32, STEPS: 1500, DART: 1, T: 3.5, CLEAR: 0.035, START: { x: 0.36, y: 0.03 }, XT: [0.56, 0.58, 0.60, 0.62, 0.64, 0.66, 0.68, 0.70, 0.72, 0.74], RES_SC: 10, NIN: 7, LEAD: 0.08 };
  /** Путь классики: поднять кастрюлю, пронести над краем полки с запасом 3,5 см и опустить на доску. */
  function shelfPath(s0, xt) { const yv = SHELF.y + POT.h + LAB2.CLEAR; return path([s0, { x: s0.x, y: yv }, { x: xt, y: yv }, { x: xt, y: SHELF.y + POT.h - 0.005 }]); }
  /** Задела ли кастрюля или звено край полки (кастрюля — прямоугольник под захватом). */
  function hitShelf(k) {
    const px0 = k.x - POT.w / 2, px1 = k.x + POT.w / 2, py0 = k.y - POT.h, py1 = k.y, by0 = SHELF.y - SHELF.th, by1 = SHELF.y;
    const over = px0 >= SHELF.x0 - 0.005;   // целиком над доской — это постановка, а не удар
    if (!over && px1 > SHELF.x0 && py0 < by1 && py1 > by0) return true;
    if (over && py0 < by1 - 0.03) return true;
    return segRect(k.x1, k.y1, k.x, k.y, SHELF.x0, by0, SHELF.x1, by1, 0.01);
  }
  /** Вход сетей лаборатории 2: углы и скорости суставов и куда ставить. */
  function feat2(s, xt, out) {
    const a = DM.sincos(s.q[0]), b = DM.sincos(s.q[1]);
    out[0] = a[1]; out[1] = a[0]; out[2] = b[1]; out[3] = b[0]; out[4] = s.dq[0] / 4; out[5] = s.dq[1] / 4; out[6] = (xt - 0.65) / 0.1;
    return out;
  }
  /** Эпизод с кастрюлей. mode: 'base' — регулятор, который не знает её веса; 'expert' — знает; 'res' — регулятор + поправка сети;
   *  'scratch' — сеть выдаёт моменты сама. Сети отвечают 50 раз в секунду, регулятор — 1000. */
  function shelfEpisode(o) {
    const r = rng(o.seed), x0 = LAB2.START.x + (o.jitter ? (r() - 0.5) * 0.03 : 0), y0 = LAB2.START.y + (o.jitter ? (r() - 0.5) * 0.03 : 0);
    const s = { q: ik(x0, y0), dq: [0, 0] }, P = shelfPath({ x: x0, y: y0 }, o.xt), T = o.T || LAB2.T, x = new Float64Array(LAB2.NIN), frames = [], X = [], Yr = [], Ys = [];
    let hold = [0, 0], nz = [0, 0], peak = 0, hit = false, tHit = null, resMax = 0, sumRes = 0, sumTau = 0;
    const so = { drop: POT.h, shelf: SHELF, halfW: POT.w / 2, load: POT.m };
    for (let i = 0; i <= Math.round(T * 1000); i++) {
      const t = i / 1000, k = kin(s.q), c = carrot(P, k.x, k.y, LAB2.LEAD);
      const base = o.mode === 'scratch' ? null : impTau(s, c, { loadModel: o.mode === 'expert' ? POT.m : 0 });
      if (i % RATE === 0) {
        feat2(s, o.xt, x);
        if (o.mode === 'res' || o.mode === 'scratch') { const out = fwd(o.net, x), sc = o.mode === 'res' ? LAB2.RES_SC : TAU_SC; hold = [out[0] * sc, out[1] * sc]; }
        if (o.demo) { const b0 = impTau(s, c, { loadModel: 0 }); X.push(Float64Array.from(x)); Yr.push(Float64Array.from([(base[0] - b0[0]) / LAB2.RES_SC, (base[1] - b0[1]) / LAB2.RES_SC])); Ys.push(Float64Array.from([base[0] / TAU_SC, base[1] / TAU_SC])); }
        if (o.dart) nz = [randn(r) * o.dart, randn(r) * o.dart * 0.5];
      }
      let tau = o.mode === 'scratch' ? hold : o.mode === 'res' ? [base[0] + hold[0], base[1] + hold[1]] : base;
      if (o.mode === 'res') { resMax = Math.max(resMax, Math.abs(hold[0]), Math.abs(hold[1])); sumRes += Math.abs(hold[0]) + Math.abs(hold[1]); sumTau += Math.abs(tau[0]) + Math.abs(tau[1]); }
      if (o.dart) tau = [tau[0] + nz[0], tau[1] + nz[1]];
      const F = i && !hit ? step(s, tau, so) : 0;
      if (F > peak && (kin(s.q).x - POT.w / 2 >= SHELF.x0 - 0.005)) peak = F;
      const k2 = kin(s.q);
      if (!hit && hitShelf(k2)) { hit = true; tHit = t; }
      if (i % 10 === 0) frames.push({ t, q: s.q.slice(), x: k2.x, y: k2.y, F });
    }
    const last = frames[frames.length - 1], dx = Math.abs(last.x - o.xt), onShelf = Math.abs(last.y - POT.h - SHELF.y) < 0.015 && last.x - POT.w / 2 >= SHELF.x0 - 0.005;
    const ok = !hit && dx <= 0.015 && onShelf && peak <= LAB2.FMAX;
    return { frames, hit, tHit, dx, onShelf, peak, ok, resMax, resShare: sumTau ? sumRes / sumTau : 0, X, Yr, Ys };
  }
  LAB2.FMAX = 25;
  /** Демонстрации оператора, который чувствует вес кастрюли (эксперт с верной моделью), с шумом DART. */
  function lab2Demos(seed, n) {
    const r = rng(seed * 104729 + 7), X = [], Yr = [], Ys = [];
    for (let d = 0; d < n; d++) {
      const xt = 0.55 + 0.20 * r(), ep = shelfEpisode({ xt, mode: 'expert', seed: seed * 2000 + d, demo: true, jitter: true, dart: LAB2.DART });
      for (let i = 0; i < ep.X.length; i++) { X.push(ep.X[i]); Yr.push(ep.Yr[i]); Ys.push(ep.Ys[i]); }
    }
    return { X, Yr, Ys };
  }
  /** Обучить обе сети на n демонстрациях: одинаковый размер, одни данные, одно число шагов. У поправки последний слой
   *  начинается с нулей — до обучения она ничего не меняет (как у Silver и соавторов). */
  function* lab2Train(seed, n) {
    const res = mlp([LAB2.NIN, LAB2.H, LAB2.H, 2], seed * 37 + 5, true), scr = mlp([LAB2.NIN, LAB2.H, LAB2.H, 2], seed * 37 + 5, false);
    if (!n) return { n, res, scr: null };
    const D = lab2Demos(seed, n);
    for (const e of fit(res, D.X, D.Yr, { steps: LAB2.STEPS, seed: seed * 19 + n, every: 100 })) yield { p: 0.5 * e.it / LAB2.STEPS };
    for (const e of fit(scr, D.X, D.Ys, { steps: LAB2.STEPS, seed: seed * 19 + n, every: 100 })) yield { p: 0.5 + 0.5 * e.it / LAB2.STEPS };
    return { n, res, scr, samples: D.X.length };
  }
  /** Десять постановок на полку с одних и тех же стартов. */
  function lab2Eval(nets) {
    const ev = (mode, net) => { const R = LAB2.XT.map((xt, i) => shelfEpisode({ xt, mode, net, seed: 700 + i })); return { runs: R, ok: R.filter((q) => q.ok).length, hits: R.filter((q) => q.hit).length, resMax: Math.max(...R.map((q) => q.resMax)), resShare: R.reduce((a, q) => a + q.resShare, 0) / R.length }; };
    if (!nets.scr) return { n: nets.n, base: ev('base'), res: null, scr: null };
    return { n: nets.n, res: ev('res', nets.res), scr: ev('scratch', nets.scr) };
  }

  /* ---------- 8. лаборатория 3: четыре слоя — восприятие, выбор захвата, путь, регулятор ---------- */
  const CMDS = ['cup', 'bowl', 'sponge'];   // команда: какую категорию брать (высокая кружка — тоже чашка)
  const catOf = (type) => (type === 'mug' ? 'cup' : type);
  const LAB3 = { T: 3, TP: 4, PUSH: { t: 2.2, dur: 0.12, f: [0, -40] }, PATCH: 9, NSC: 3000, ND: 100, H: 32, STEPS: { P: 1500, G: 1500, T: 800, C: 2000 }, DART: 1 };
  const SCENES3 = [
    { id: 'cup', name: 'Чашка', objs: [obj('cup', 0.66)], ti: 0 },
    { id: 'mug', name: 'Высокая кружка', objs: [obj('mug', 0.62)], ti: 0 },
    { id: 'bowl', name: 'Миска', objs: [obj('bowl', 0.66)], ti: 0 },
    { id: 'vase', name: 'Ваза на пути', objs: [obj('cup', 0.70), obj('vase', 0.44)], ti: 0 },
    { id: 'push', name: 'Толчок к столу', objs: [obj('cup', 0.60)], ti: 0, push: true },
  ];
  const BLOB = 0.008;   // классика считает предметом всё, что выше 8 мм: шум камеры — 3 мм
  /** Классическое восприятие: сплошные участки выше 8 мм и шаблоны с допусками. Чашка — 7–11 см высотой и 5–10 см шириной,
   *  миска — 12–18 см шириной с ямкой посередине, губка — 2–4,5 см высотой и 7,5–12,5 см шириной. */
  function blobs(sc) {
    const B = []; let cur = null;
    for (let i = 0; i < CAM.N; i++) {
      if (sc[i] > BLOB) { if (!cur) cur = { i0: i, i1: i, h: 0 }; cur.i1 = i; cur.h = Math.max(cur.h, sc[i]); }
      else if (cur) { B.push(cur); cur = null; }
    }
    if (cur) B.push(cur);
    for (const b of B) {
      b.x = CAM.X0 + CAM.CELL * ((b.i0 + b.i1) / 2 + 0.5); b.w = CAM.CELL * (b.i1 - b.i0 + 1);
      let dip = false; for (let i = b.i0 + 1; i < b.i1; i++) if (sc[i] < b.h * 0.5) dip = true; b.dip = dip;
    }
    return B;
  }
  const TEMPL = { cup: (b) => !b.dip && b.h >= 0.07 && b.h <= 0.11 && b.w >= 0.05 && b.w <= 0.10, bowl: (b) => b.dip && b.w >= 0.12 && b.w <= 0.18, sponge: (b) => !b.dip && b.h >= 0.02 && b.h <= 0.045 && b.w >= 0.075 && b.w <= 0.125 };
  function perceiveClassic(sc, cmd) { const b = blobs(sc).find((q) => TEMPL[cmd](q)); return b ? { x: b.x, ok: true } : { x: null, ok: false }; }
  const cmdVec = (cmd) => CMDS.map((c) => (c === cmd ? 1 : 0));
  function inP(sc, cmd) { const v = new Float64Array(CAM.N + 3); for (let i = 0; i < CAM.N; i++) v[i] = sc[i] * 10; cmdVec(cmd).forEach((u, j) => { v[CAM.N + j] = u; }); return v; }
  const cellX = (i) => CAM.X0 + CAM.CELL * (i + 0.5), cellOf = (x) => clamp(Math.floor((x - CAM.X0) / CAM.CELL), 0, CAM.N - 1);
  /** Сеть восприятия оценивает каждую клетку камеры: здесь ли нужный предмет (как карты «где взять» в уроке 2.1). */
  function perceiveNet(net, sc, cmd) { const o = fwd(net, inP(sc, cmd)); let b = 0; for (let i = 1; i < CAM.N; i++) if (o[i] > o[b]) b = i; return { x: cellX(b), ok: true, scores: Array.from(o) }; }
  /** Кусок камеры вокруг найденной клетки: 9 клеток (22,5 см). */
  function inG(sc, x) {
    const v = new Float64Array(LAB3.PATCH), i0 = cellOf(x);
    for (let j = 0; j < LAB3.PATCH; j++) { const i = i0 - 4 + j; v[j] = i >= 0 && i < CAM.N ? sc[i] * 10 : 0; }
    return v;
  }
  /** Классический выбор захвата: сверху по центру найденного предмета, на 2 см ниже его верха.
   *  Предмет — сплошной участок клеток выше 8 мм вокруг найденной клетки. */
  function graspClassic(sc, x) {
    const c = cellOf(x); let i0 = c, i1 = c, h = 0;
    while (i0 > 0 && sc[i0 - 1] > BLOB) i0--; while (i1 < CAM.N - 1 && sc[i1 + 1] > BLOB) i1++;
    for (let i = i0; i <= i1; i++) h = Math.max(h, sc[i]);
    return { x: (cellX(i0) + cellX(i1)) / 2, y: TABLE + h - 0.02 };
  }
  function graspNet(net, sc, x) { const o = fwd(net, inG(sc, x)), c = cellX(cellOf(x)); return { x: c + 0.1 * o[0], y: -0.05 + 0.1 * o[1] }; }
  /** Карта препятствий для пути: всё, что выше 1,5 см и дальше 6 см от цели, — прямоугольники с запасом 1 см. */
  function obstacles(sc, gx) { const O = []; for (let i = 0; i < CAM.N; i++) { const x = CAM.X0 + CAM.CELL * (i + 0.5); if (sc[i] > 0.015 && Math.abs(x - gx) > 0.06) O.push({ x, w: CAM.CELL, h: sc[i] + 0.01 }); } return O; }
  /** Свободен ли путь: захват и оба звена в точках через 1 см (обратная кинематика) не задевают препятствия. */
  function pathFree(P, O) {
    for (let s = 0; s <= P.tot + 1e-9; s += 0.01) { const p = pointAt(P, s), q = ik(p.x, p.y); if (!q) return false; if (hitObj(kin(q), O) >= 0) return false; }
    return true;
  }
  /** Классический планировщик: путь через точку над целью; если он задевает препятствие, точку поднимают по 2 см. */
  function pathClassic(sc, s0, g) {
    const O = obstacles(sc, g.x); let vy = g.y + PRE;
    for (let k = 0; k < 15; k++) { const P = path([s0, reach(g.x, vy), reach(g.x, g.y)]); if (pathFree(P, O)) return { P, vy, free: true }; vy += 0.02; }
    return { P: path([s0, reach(g.x, vy), reach(g.x, g.y)]), vy, free: false };
  }
  function inT(sc, g) { const v = new Float64Array(CAM.N + 2); for (let i = 0; i < CAM.N; i++) v[i] = sc[i] * 10; v[CAM.N] = (g.x - 0.6) / 0.2; v[CAM.N + 1] = (g.y + 0.05) / 0.1; return v; }
  function pathNet(net, sc, s0, g) { const vy = g.y + 0.1 * fwd(net, inT(sc, g))[0]; return { P: path([s0, reach(g.x, vy), reach(g.x, g.y)]), vy }; }
  /** Вход сети-регулятора: состояние руки и куда тянет путь (морковка относительно захвата). */
  function inC(s, k, c, out) {
    const a = DM.sincos(s.q[0]), b = DM.sincos(s.q[1]);
    out[0] = a[1]; out[1] = a[0]; out[2] = b[1]; out[3] = b[0]; out[4] = s.dq[0] / 4; out[5] = s.dq[1] / 4; out[6] = (c.x - k.x) * 10; out[7] = (c.y - k.y) * 10;
    return out;
  }
  /** Случайная сцена для обучения восприятия и выбора захвата: цель одной из трёх категорий разных размеров
   *  и иногда второй предмет (в том числе ваза) в стороне. */
  function randScene(r, noTall) {
    const cmd = CMDS[Math.floor(r() * 3)], tx = 0.45 + 0.35 * r();
    const mk = (cat, x) => cat === 'cup' ? Object.assign(obj('cup', x), { w: 0.06 + 0.03 * r(), h: 0.07 + 0.07 * r() }) : cat === 'bowl' ? Object.assign(obj('bowl', x), { w: 0.12 + 0.05 * r(), h: 0.05 + 0.02 * r() }) : cat === 'sponge' ? Object.assign(obj('sponge', x), { w: 0.08 + 0.04 * r(), h: 0.025 + 0.015 * r() }) : Object.assign(obj('vase', x), { w: 0.06 + 0.03 * r(), h: 0.18 + 0.10 * r() });
    const objs = [mk(cmd, tx)];
    if (r() < 0.5) { const cat = (noTall ? ['cup', 'bowl', 'sponge'] : ['cup', 'bowl', 'sponge', 'vase'])[Math.floor(r() * (noTall ? 3 : 4))]; if (cat !== cmd) { const side = tx > 0.62 ? -1 : 1, x = tx + side * (0.16 + 0.1 * r()); if (x > 0.33 && x < 0.87) objs.push(mk(cat, x)); } }
    return { cmd, objs, ti: 0 };
  }
  /** Обучить сети четырёх слоёв: генератор отдаёт долю готовности; итог — { P, G, T, C }. */
  function* lab3Train(seed) {
    const r = rng(seed * 6151 + 11), XP = [], YP = [], XG = [], YG = [], XT = [], YT = [];
    for (let n = 0; n < LAB3.NSC; n++) {
      const sc0 = randScene(r), sc = scan(sc0.objs, r), t = sc0.objs[0], g = graspOf(t);
      XP.push(inP(sc, sc0.cmd)); YP.push(Float64Array.from([cellOf(t.x)]));
      const xn = cellX(clamp(cellOf(t.x) + Math.floor(r() * 3) - 1, 0, CAM.N - 1)); XG.push(inG(sc, xn)); YG.push(Float64Array.from([(g.x - xn) / 0.1, (g.y + 0.05) / 0.1]));
    }
    // путь: демонстрации планировщика в сценах, где высоких предметов не было
    for (let n = 0; n < 800; n++) { const sc0 = randScene(r, true), sc = scan(sc0.objs, r), g = graspOf(sc0.objs[0]), pc = pathClassic(sc, { x: START.x, y: START.y }, g); XT.push(inT(sc, g)); YT.push(Float64Array.from([(pc.vy - g.y) / 0.1])); }
    const nets = { P: mlp([CAM.N + 3, LAB3.H, LAB3.H, CAM.N], seed * 41 + 1), G: mlp([LAB3.PATCH, LAB3.H, LAB3.H, 2], seed * 41 + 2), T: mlp([CAM.N + 2, 16, 16, 1], seed * 41 + 3), C: mlp([8, LAB3.H, LAB3.H, 2], seed * 41 + 4) };
    const tot = LAB3.STEPS.P + LAB3.STEPS.G + LAB3.STEPS.T + LAB3.STEPS.C; let done = 0;
    for (const [k, X, Y] of [['P', XP, YP], ['G', XG, YG], ['T', XT, YT]]) { for (const e of fit(nets[k], X, Y, { steps: LAB3.STEPS[k], seed: seed * 23 + k.charCodeAt(0), every: 100, ce: k === 'P' })) yield { p: (done + e.it) / tot }; done += LAB3.STEPS[k]; }
    // регулятор: демонстрации классики по случайным путям, с шумом DART
    const XC = [], YC = [], x = new Float64Array(8);
    for (let d = 0; d < LAB3.ND; d++) {
      const gx = 0.45 + 0.33 * r(), gy = TABLE + 0.01 + 0.12 * r(), vy = gy + 0.06 + 0.12 * r(), s = startState(r, true), k0 = kin(s.q), P = path([{ x: k0.x, y: k0.y }, reach(gx, vy), reach(gx, gy)]);
      let nz = [0, 0];
      for (let i = 0; i <= LAB3.T * 1000; i++) {
        const k = kin(s.q), c = carrot(P, k.x, k.y, IMP.LEAD), tau = impTau(s, c);
        if (i % RATE === 0) { XC.push(Float64Array.from(inC(s, k, c, x))); YC.push(Float64Array.from([tau[0] / TAU_SC, tau[1] / TAU_SC])); nz = [randn(r) * LAB3.DART, randn(r) * LAB3.DART * 0.5]; }
        if (i) step(s, [tau[0] + nz[0], tau[1] + nz[1]]);
      }
    }
    for (const e of fit(nets.C, XC, YC, { steps: LAB3.STEPS.C, seed: seed * 23 + 67, every: 100 })) yield { p: (done + e.it) / tot };
    return nets;
  }
  /** Прогон одной сцены при раскладке cfg = { P, G, T, C }, где каждое — 'nn' (сеть) или 'cl' (классика). */
  function run3(cfg, scene, nets, seed) {
    const r = rng(seed || 900), sc = scan(scene.objs, r), cmd = catOf(scene.objs[scene.ti].type), G = graspOf(scene.objs[scene.ti]);
    const others = scene.objs.filter((_, i) => i !== scene.ti), T = scene.push ? LAB3.TP : LAB3.T, push = scene.push ? LAB3.PUSH : null;
    const per = cfg.P === 'nn' ? perceiveNet(nets.P, sc, cmd) : perceiveClassic(sc, cmd);
    const s = startState(r, false), k0 = kin(s.q), s0 = { x: k0.x, y: k0.y };
    const out = { scene: scene.id, cfg, sc: Array.from(sc), per, G, frames: [], ok: false, why: '', peak: 0, hit: -1 };
    if (!per.ok) { out.why = 'notfound'; for (let i = 0; i <= T * 100; i++) out.frames.push({ t: i / 100, q: s.q.slice(), x: k0.x, y: k0.y, F: 0 }); return out; }
    const g = cfg.G === 'nn' ? graspNet(nets.G, sc, per.x) : graspClassic(sc, per.x);
    const pl = cfg.T === 'nn' ? pathNet(nets.T, sc, s0, g) : pathClassic(sc, s0, g);
    Object.assign(out, { g, P: pl.P, vy: pl.vy });
    const x = new Float64Array(8); let hold = [0, 0], pre = null;
    for (let i = 0; i <= Math.round(T * 1000); i++) {
      const t = i / 1000, k = kin(s.q), c = carrot(pl.P, k.x, k.y, IMP.LEAD);
      if (cfg.C === 'nn' && i % RATE === 0) { const o = fwd(nets.C, inC(s, k, c, x)); hold = [o[0] * TAU_SC, o[1] * TAU_SC]; }
      const tau = cfg.C === 'nn' ? hold : impTau(s, c);
      if (push && pre == null && t >= push.t) pre = { x: k.x, y: k.y };
      const F = i ? step(s, tau, { ext: push && t >= push.t && t < push.t + push.dur ? push.f : null }) : 0;
      if (F > out.peak) out.peak = F;
      const k2 = kin(s.q);
      if (out.hit < 0) { const h = hitObj(k2, others); if (h >= 0) { out.hit = h; out.tHit = t; } }
      if (i % 10 === 0) out.frames.push({ t, q: s.q.slice(), x: k2.x, y: k2.y, F, c: { x: c.x, y: c.y } });
    }
    const last = out.frames[out.frames.length - 1];
    out.err = hyp(last.x - G.x, last.y - G.y); out.inZone = inZone(G, last.x, last.y); out.pre = pre;
    out.ok = out.inZone && out.hit < 0 && out.peak <= LIM.F;
    out.why = out.ok ? 'ok' : out.hit >= 0 ? 'hit' : out.peak > LIM.F ? 'force' : 'miss';
    return out;
  }
  const CFG3 = (P, G, T, C) => ({ P, G, T, C });
  function lab3Eval(cfg, nets) { const R = SCENES3.map((sc) => run3(cfg, sc, nets, 900)); return { cfg, runs: R, ok: R.filter((q) => q.ok).length }; }

  const CFG = { SEED: 1 };   // зерно лабораторий: демонстрации, начальные веса, порядок пакетов

  /* ---------- экспорт ---------- */
  const API = { CFG, DM, rng, randn, clamp, hyp, L1, L2, M1, M2, GR, TABLE, TABLE_X0, TAU_MAX, kin, gravity, ik, reach, dyn, step, vel, path, pointAt, project, carrot, IMP, impTau,
    TYPES, obj, CAM, heightAt, scan, graspOf, inZone, hitObj, segRect, mlp, fwd, fit, runGen, START, PRE, RATE, TAU_SC, NIN, features, encG, decG, approach, startState, episode, LIM, LAB1, lab1Demos, lab1Train, lab1Test, SHELF, POT, LAB2, shelfPath, hitShelf, feat2, shelfEpisode, lab2Demos, lab2Train, lab2Eval,
    CMDS, catOf, LAB3, SCENES3, blobs, TEMPL, perceiveClassic, perceiveNet, cellX, cellOf, inP, inG, graspClassic, graspNet, obstacles, pathFree, pathClassic, inT, pathNet, inC, randScene, lab3Train, run3, CFG3, lab3Eval };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L81 = API;
})(typeof window !== 'undefined' ? window : globalThis);
