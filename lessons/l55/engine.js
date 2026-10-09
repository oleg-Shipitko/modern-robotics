/* =====================================================================
   l55/engine.js — движок урока 5.5 «Обучение с привилегированной
   информацией». Без DOM: работает в браузере (window.L55, поверх
   window.Drive из shared/drive-core.js) и в Node (require).
   1) Среда: квартира Ады из уроков 1.1–1.2 и 5.2 (вид сверху, 6 × 4 м).
      Ада едет из прихожей на кухню по средней линии прохода: руль держит
      регулятор pure pursuit (тот, что вёл Аду в уроке 1.1), а политика
      выбирает скорость. Новое — пол: у каждой комнаты своё сцепление
      колёс μ. На скользком полу Ада дольше тормозит (не сильнее μ·A_TR),
      а в повороте колёса проскальзывают, если боковое ускорение больше
      μ·A_LAT, — и Аду выносит к стене.
   2) Три входа политики: «датчики» (кривизна маршрута впереди, скорость,
      сколько осталось), «датчики + μ» (учитель: знает пол, как симулятор)
      и «датчики + история» (2 с команд скорости и руля, измеренной
      скорости и гироскопа).
   3) Учитель учится PPO (как в уроке 5.2) с μ на входе; ученики —
      обучением по демонстрациям учителя: на его поездках (BC) или на
      своих с разметкой учителя (DAgger, урок 1.2); адаптационный модуль
      (как в RMA) оценивает μ по истории.
   Все случайности — с зерном; exp, log, tanh, sin, cos, atan2 считаются
   своими функциями, поэтому числа одинаковы в любом браузере и в Node.
   ===================================================================== */
'use strict';
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('../shared/drive-core.js') : root.Drive;
  const { rng, clamp } = D;

  /* ---------- 0. детерминированная математика ----------
     Math.exp, Math.log, Math.sin и другие в разных браузерах могут отличаться в последнем знаке,
     а обучение с подкреплением раздувает такую разницу до других чисел в лабораториях. Здесь они
     собраны из сложений, умножений и делений (по IEEE 754 одинаковых везде) и Math.sqrt.
     Отличие от Math.* — не больше 1e-15. */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }   // 2^k, k от −1022 до 1023
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }  // e^x − 1 при |x| ≤ 1
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = 1, t = 1; for (let n = 1; n <= 14; n++) { t = t * r / n; sm += t; }
      return k < -1022 ? sm * pow2(k + 600) * pow2(-600) : sm * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x;
      let e = 0; if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; }
      f64[0] = x; e += ((u32[HI] >>> 20) & 0x7ff) - 1023;
      u32[HI] = (u32[HI] & 0x000fffff) | 0x3ff00000; let m = f64[0];          // мантисса в [1, 2)
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
    /** [sin x, cos x]: приведение к |r| ≤ π/4 и ряды Тейлора. */
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
    return { exp, log, tanh, sincos, atan2, pow2 };
  })();
  /** Нормальное случайное число (Бокс — Мюллер) на детерминированной математике. */
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(2 * Math.PI * r())[1]; }

  const CFG = {
    REPEAT: 2,          // шагов симуляции (по 0,05 с) на одно решение политики
    MAX_STEPS: 200,     // решений в поездке: 20 с
    V_MIN: 20, V_MAX: 150,   // скорость, которую задаёт политика: от 20 до 150 см/с
    A_MOT: 120,         // разгон моторами, см/с², — одинаковый на любом полу
    A_TR: 300,          // торможение на полу с μ = 1, см/с²; на полу с μ — μ·A_TR
    A_LAT: 200,         // наибольшее боковое ускорение в повороте при μ = 1, см/с²; при μ — μ·A_LAT
    LOOK: 42,           // руль: точка средней линии в 42 см впереди (pure pursuit, как в уроке 1.1)
    LAG: 0.5,           // доля, на которую скорость поворота подтягивается к нужной за шаг симуляции
    GYRO: 0.03,         // шум гироскопа, рад/с
    ODO: 2,             // шум измерения скорости, см/с
    MU_LO: 0.3, MU_HI: 1.0,   // сцепление в симуляторе при обучении
    FLOOR_MODE: 'mix',  // 'room' — своё сцепление в каждой комнате, 'const' — одно на квартиру, 'mix' — пополам
    S_XY: 8, S_TH: 0.12, S_V: 60,   // старт: разброс положения (см) и курса (рад), начальная скорость от 0 до S_V см/с
    HIST: 20,           // длина истории ученика, решений (2 с)
    N_EP: 8, H: 32, GAMMA: 0.99, LAMBDA: 0.95, EPOCHS: 5, MB: 128, LR: 2e-3,
    LOGSTD0: -0.5, CLIP: 0.2, ITERS: 120,
    R_GOAL: 2, R_CRASH: -3, R_M: 1, R_T: 0.02,   // награды: кухня, столкновение, за метр, плата за каждые 0,1 с
    LR_S: 3e-3, D_ITERS: 6, D_EP: 8, D_STEPS: 300,   // ученик: шаг Adam, итерации, поездок на итерацию, шагов обучения на итерацию
    M_ITERS: 5, M_EP: 8, M_STEPS: 300,               // адаптационный модуль: то же
    SEED: 1,
  };
  /** Полы урока: сцепление μ. Массив — своё сцепление в прихожей, гостиной и кухне. */
  const FLOORS = {
    carpet: { name: 'ковёр', mu: 1.0 },
    tile: { name: 'плитка', mu: 0.7 },
    wet: { name: 'мокрый пол', mu: 0.45 },
    wetKitchen: { name: 'ковёр, на кухне мокро', mu: [1.0, 1.0, 0.45] },
  };

  /* ---------- 1. среда: геометрия — из shared/drive-core.js, расчёт — свой ---------- */
  const OB = D.OBST, R2 = D.R * D.R, G2 = D.GOAL.r * D.GOAL.r, P = D.PATH;
  const PATHS = (() => { const out = [0]; for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1]; out.push(out[i - 1] + Math.sqrt(dx * dx + dy * dy)); } return out; })();
  const PATH_LEN = PATHS[PATHS.length - 1];
  /** Ближайшая точка средней линии; i0 — где была Ада раньше: ищем рядом, на краю окна — по всей линии. */
  function nearest(x, y, i0) {
    let lo = 0, hi = P.length - 1;
    if (i0 != null) { lo = Math.max(0, i0 - 6); hi = Math.min(P.length - 1, i0 + 12); }
    let bi = lo, bd = Infinity; for (let i = lo; i <= hi; i++) { const dx = P[i][0] - x, dy = P[i][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
    if (i0 != null && ((bi === lo && lo > 0) || (bi === hi && hi < P.length - 1))) return nearest(x, y);
    return bi;
  }
  const along = (s) => PATHS[s.i != null ? s.i : nearest(s.x, s.y)];
  function collides(x, y) { for (const r of OB) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); if (dx * dx + dy * dy < R2) return true; } return false; }
  const atGoal = (q) => { const dx = q.x - D.GOAL.x, dy = q.y - D.GOAL.y; return dx * dx + dy * dy < G2; };
  function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /** Пол: число — одно сцепление во всей квартире; массив [прихожая, гостиная, кухня] — своё в каждой комнате. */
  const roomOf = (x) => (x < 200 ? 0 : x < 400 ? 1 : 2);
  const muAt = (floor, x) => (typeof floor === 'number' ? floor : floor[roomOf(x)]);
  const vCmd = (a, o) => o.V_MIN + (clamp(a, -1, 1) + 1) / 2 * (o.V_MAX - o.V_MIN);
  /** Руль: pure pursuit по средней линии — нужная скорость поворота v·κ, κ = 2 sin α / L. */
  function steer(s, o) {
    const i = s.i, target = PATHS[i] + o.LOOK; let j = i; while (j < P.length - 1 && PATHS[j] < target) j++;
    const dx = P[j][0] - s.x, dy = P[j][1] - s.y, al = wrapA(DM.atan2(dy, dx) - s.th), L2 = dx * dx + dy * dy;
    return clamp(2 * DM.sincos(al)[0] / Math.sqrt(Math.max(L2, 100)) * Math.max(s.v, 20), -D.WMAX, D.WMAX);
  }
  /** Шаг симуляции. Моторы разгоняют одинаково; тормоз — не сильнее μ·A_TR; в повороте боковое
   *  ускорение v·ω не больше μ·A_LAT — если руль просит больше, колёса проскальзывают и Ада поворачивает слабее. */
  function simStep(s, a, mu, o) {
    const v = s.v + clamp(vCmd(a, o) - s.v, -mu * o.A_TR * D.DT, o.A_MOT * D.DT);
    const wc = steer(s, o), lim = mu * o.A_LAT, vv = Math.max(v, 1), w = clamp(wc, -lim / vv, lim / vv);
    const om = s.om + (w - s.om) * o.LAG, th = s.th + om * D.DT, sc = DM.sincos(th);
    const x = s.x + sc[1] * v * D.DT, y = s.y + sc[0] * v * D.DT;
    return { x, y, th: wrapA(th), v, om, wc, i: nearest(x, y, s.i) };
  }
  /** Кривизна средней линии (1/см, знак — сторона поворота), сглаженная; KCM — через каждый сантиметр пути. */
  const KAPPA = (() => {
    const n = P.length, raw = new Float64Array(n), out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3); if (b - a < 2) continue;
      const h1 = DM.atan2(P[i][1] - P[a][1], P[i][0] - P[a][0]), h2 = DM.atan2(P[b][1] - P[i][1], P[b][0] - P[i][0]);
      raw[i] = wrapA(h2 - h1) / Math.max(1, (PATHS[b] - PATHS[a]) / 2);
    }
    for (let i = 0; i < n; i++) { let sm = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { sm += raw[j]; c++; } out[i] = sm / c; }
    return out;
  })();
  const KCM = (() => { const n = Math.ceil(PATH_LEN) + 1, out = new Float64Array(n); let j = 0; for (let c = 0; c < n; c++) { while (j < P.length - 1 && PATHS[j + 1] <= c) j++; out[c] = KAPPA[j]; } return out; })();
  const kappaAt = (sAlong) => (sAlong >= PATH_LEN ? 0 : KCM[Math.floor(sAlong)]);
  const AHEAD = [20, 50, 90, 140, 200];   // где впереди по маршруту смотреть кривизну, см
  /** Датчики: кривизна маршрута в 5 точках впереди, скорость по колёсам, сколько осталось до кухни.
   *  Ада знает карту и где она на маршруте (уроки 0.4 и 1.1). */
  function sense(s, speed, out, off) {
    off = off || 0;
    const i = s.i;
    for (let k = 0; k < AHEAD.length; k++) out[off + k] = kappaAt(PATHS[i] + AHEAD[k]) * 40;
    out[off + 5] = speed / 100; out[off + 6] = (PATH_LEN - PATHS[i]) / 600;
    return out;
  }
  const NS = 7;                       // 7 чисел датчиков
  const NH = 4;                       // в истории на каждое решение: команда скорости, измеренная скорость, команда руля, гироскоп
  const muIn = (mu) => (mu - 0.65) / 0.35;   // μ на входе учителя: от −1 до 1
  const muOut = (z) => 0.65 + 0.35 * z;
  /** Размер входа политики: 'sens' — датчики, 'priv' — датчики + μ, 'hist' — датчики + история. */
  const nIn = (kind, o) => (kind === 'priv' ? NS + 1 : kind === 'hist' ? NS + NH * (o || CFG).HIST : NS);


  /* ---------- 2. сети: вход → H → H → выходы, tanh в скрытых слоях ---------- */
  function net(nIn, H, nOut, seed, outScale) {
    const r = rng(seed), sizes = [nIn, H, H, nOut], W = [], B = [];
    for (let l = 0; l < 3; l++) {
      const a = sizes[l], b = sizes[l + 1], w = new Float64Array(a * b), sc = (l === 2 ? outScale : 1) / Math.sqrt(a);
      for (let i = 0; i < w.length; i++) w[i] = randn(r) * sc;
      W.push(w); B.push(new Float64Array(b));
    }
    return withBuf({ sizes, W, B });
  }
  /** Буферы прямого и обратного прохода (чтобы не выделять память на каждом примере). */
  function withBuf(n) { const H = n.sizes[1], O = n.sizes[3]; n.a = [null, new Float64Array(H), new Float64Array(H)]; n.d = [null, new Float64Array(H), new Float64Array(H)]; n.out = new Float64Array(O); return n; }
  function cloneNet(n) { return withBuf({ sizes: n.sizes.slice(), W: n.W.map((w) => w.slice()), B: n.B.map((b) => b.slice()) }); }
  /** Прямой проход; входы слоёв остаются в n.a (для обратного прохода). Выходы линейные, в n.out. */
  function fwd(n, x) {
    const s0 = n.sizes, W = n.W, B = n.B, A = n.a;
    A[0] = x;
    for (let l = 0; l < 2; l++) {
      const nI = s0[l], nO = s0[l + 1], w = W[l], b = B[l], a = A[l], z = A[l + 1];
      for (let o = 0; o < nO; o++) z[o] = b[o];
      for (let i = 0; i < nI; i++) { const ai = a[i]; if (ai === 0) continue; const row = i * nO; for (let o = 0; o < nO; o++) z[o] += ai * w[row + o]; }
      for (let o = 0; o < nO; o++) z[o] = DM.tanh(z[o]);
    }
    const a2 = A[2], w2 = W[2], nO = s0[3], out = n.out;
    for (let o = 0; o < nO; o++) out[o] = B[2][o];
    for (let i = 0; i < a2.length; i++) { const ai = a2[i], row = i * nO; for (let o = 0; o < nO; o++) out[o] += ai * w2[row + o]; }
    return out;
  }
  function zeroGrad(n) { return { W: n.W.map((w) => new Float64Array(w.length)), B: n.B.map((b) => new Float64Array(b.length)) }; }
  /** Обратный проход после fwd(n, x): dOut — производные по линейным выходам; градиенты копятся в g. */
  function bwd(n, dOut, g) {
    const s0 = n.sizes, W = n.W, A = n.a, Dd = n.d, nO3 = s0[3];
    { const a = A[2], nI = s0[2], d1 = Dd[2], w = W[2], gW = g.W[2];
      for (let o = 0; o < nO3; o++) g.B[2][o] += dOut[o];
      for (let i = 0; i < nI; i++) { const ai = a[i], row = i * nO3; let s = 0; for (let o = 0; o < nO3; o++) { gW[row + o] += ai * dOut[o]; s += w[row + o] * dOut[o]; } d1[i] = s * (1 - ai * ai); } }
    { const nI = s0[1], nO = s0[2], a = A[1], w = W[1], gW = g.W[1], gB = g.B[1], dl = Dd[2], dn = Dd[1];
      for (let o = 0; o < nO; o++) gB[o] += dl[o];
      for (let i = 0; i < nI; i++) { const ai = a[i], row = i * nO; let s = 0; for (let o = 0; o < nO; o++) { gW[row + o] += ai * dl[o]; s += w[row + o] * dl[o]; } dn[i] = s * (1 - ai * ai); } }
    { const nI = s0[0], nO = s0[1], a = A[0], gW = g.W[0], gB = g.B[0], dl = Dd[1];
      for (let o = 0; o < nO; o++) gB[o] += dl[o];
      for (let i = 0; i < nI; i++) { const ai = a[i]; if (ai === 0) continue; const row = i * nO; for (let o = 0; o < nO; o++) gW[row + o] += ai * dl[o]; } }
  }
  function adamInit(params) { return { t: 0, p1: 1, p2: 1, m: params.map((p) => new Float64Array(p.length)), v: params.map((p) => new Float64Array(p.length)) }; }
  /** Шаг Adam: params и grads — массивы Float64Array; sign = −1 — спуск по градиенту, +1 — подъём. */
  function adamStep(st, params, grads, lr, sign) {
    const b1 = 0.9, b2 = 0.999; st.t++; st.p1 *= b1; st.p2 *= b2; const c1 = 1 - st.p1, c2 = 1 - st.p2;
    for (let j = 0; j < params.length; j++) {
      const Pp = params[j], G = grads[j], M = st.m[j], V = st.v[j];
      for (let i = 0; i < Pp.length; i++) { const gg = G[i]; M[i] = b1 * M[i] + (1 - b1) * gg; V[i] = b2 * V[i] + (1 - b2) * gg * gg; Pp[i] += sign * lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
    }
  }
  const paramsOf = (n) => n.W.concat(n.B);
  const gradsOf = (g) => g.W.concat(g.B);


  /* ---------- 3. поездка: состояние, датчики, история ---------- */
  /** Старт у прихожей: разброс положения и курса, начальная скорость от 0 до S_V. */
  function startOf(r, o) { o = o || CFG; const x = D.START.x + randn(r) * o.S_XY, y = D.START.y + randn(r) * o.S_XY; return { x, y, th: D.START.th + randn(r) * o.S_TH, v: o.S_V * r(), om: 0, wc: 0, i: nearest(x, y) }; }
  function rideInit(start, floor, r, o) {
    o = o || CFG;
    const s = Object.assign({ v: 0, om: 0, wc: 0 }, start, { i: start.i != null ? start.i : nearest(start.x, start.y) });
    return { s, floor, r, p: along(s), t: 0, speed: start.v || 0, hist: new Float64Array(NH * o.HIST), o };
  }
  /** Вход политики вида kind в текущий момент поездки. */
  function obsOf(rd, kind) {
    const out = new Float64Array(nIn(kind, rd.o));
    sense(rd.s, rd.speed, out, 0);
    if (kind === 'priv') out[NS] = muIn(muAt(rd.floor, rd.s.x));
    else if (kind === 'hist') out.set(rd.hist, NS);
    return out;
  }
  /** Решение a ∈ [−1, 1] (желаемая скорость) держится REPEAT шагов симуляции. Возвращает награду и исход. */
  function rideStep(rd, a, o) {
    o = o || rd.o;
    const ac = clamp(a, -1, 1); let q = rd.s, outcome = null, wc = 0, om = 0;
    for (let k = 0; k < o.REPEAT; k++) {
      q = simStep(q, ac, muAt(rd.floor, q.x), o); wc += q.wc / o.REPEAT; om += q.om / o.REPEAT;
      if (collides(q.x, q.y)) { outcome = 'crash'; break; }
      if (atGoal(q)) { outcome = 'goal'; break; }
    }
    const p1 = along(q);
    let rew = o.R_M * (p1 - rd.p) / 100 - o.R_T;
    if (outcome === 'goal') rew += o.R_GOAL;
    if (outcome === 'crash') rew += o.R_CRASH;
    rd.s = q; rd.p = p1; rd.t++;
    rd.speed = q.v + randn(rd.r) * o.ODO; const gyro = om + randn(rd.r) * o.GYRO;
    const h = rd.hist; for (let i = h.length - 1; i >= NH; i--) h[i] = h[i - NH];
    h[0] = ac; h[1] = rd.speed / 100; h[2] = wc / D.WMAX; h[3] = gyro / D.WMAX;
    return { r: rew, outcome };
  }
  /** Случайный пол для обучения: сцепление от MU_LO до MU_HI — своё в каждой комнате или одно на квартиру. */
  function randFloor(r, o) {
    o = o || CFG; const f = () => o.MU_LO + (o.MU_HI - o.MU_LO) * r();
    const mode = o.FLOOR_MODE === 'mix' ? (r() < 0.5 ? 'const' : 'room') : o.FLOOR_MODE;
    return mode === 'const' ? f() : [f(), f(), f()];
  }


  /* ---------- 4. агент PPO: политика-гауссиана и ценность (как в уроке 5.2) ---------- */
  function agent(kind, seed, o) {
    o = Object.assign({}, CFG, o || {});
    const n = nIn(kind, o), pi = net(n, o.H, 1, seed * 7 + 1, 0.01), v = net(n, o.H, 1, seed * 7 + 2, 1), logstd = new Float64Array([o.LOGSTD0]);
    return { kind, pi, v, logstd, optPi: adamInit(paramsOf(pi).concat([logstd])), optV: adamInit(paramsOf(v)) };
  }
  const LOG2PI = 1.8378770664093453;
  /** Среднее действие политики, от −1 до 1 (скорость от V_MIN до V_MAX). */
  function meanAct(pi, obs) { return DM.tanh(fwd(pi, obs)[0]); }
  function logp(a, mu, ls) { const z = (a - mu) / DM.exp(ls); return -0.5 * z * z - ls - 0.5 * LOG2PI; }
  /** n поездок текущей политикой на случайных полах; поездка k зависит только от зерна и k. */
  function collect(A, n, seed, o) {
    o = Object.assign({}, CFG, o || {});
    const S = [], Aa = [], LP = [], R = [], V = [], END = [], eps = [], sd = DM.exp(A.logstd[0]);
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 1009 + k * 7919 + 13), floor = randFloor(r, o), rd = rideInit(startOf(r, o), floor, r, o);
      const traj = [rd.s]; let outcome = 'timeout', ret = 0;
      for (let t = 0; t < o.MAX_STEPS; t++) {
        const obs = obsOf(rd, A.kind), mu = meanAct(A.pi, obs), a = mu + sd * randn(r);
        const st = rideStep(rd, a, o);
        S.push(obs); Aa.push(a); LP.push(logp(a, mu, A.logstd[0])); R.push(st.r); V.push(fwd(A.v, obs)[0]); ret += st.r;
        traj.push(rd.s);
        if (st.outcome) { outcome = st.outcome; END.push(1); break; }
        END.push(t === o.MAX_STEPS - 1 ? 2 : 0);
      }
      eps.push({ traj, outcome, ret, floor, last: outcome === 'timeout' ? fwd(A.v, obsOf(rd, A.kind))[0] : 0 });
    }
    return { S, A: Aa, LP, R, V, END, eps };
  }
  /** Преимущества GAE(γ, λ) и цели для ценности. */
  function gae(b, o) {
    o = Object.assign({}, CFG, o || {});
    const N = b.R.length, adv = new Float64Array(N), ret = new Float64Array(N);
    let e = b.eps.length - 1, run = 0, nextV = 0;
    for (let i = N - 1; i >= 0; i--) {
      if (b.END[i]) { run = 0; nextV = b.END[i] === 2 ? b.eps[e].last : 0; e--; }
      const delta = b.R[i] + o.GAMMA * nextV - b.V[i];
      run = delta + o.GAMMA * o.LAMBDA * run; adv[i] = run; ret[i] = run + b.V[i]; nextV = b.V[i];
    }
    return { adv, ret };
  }
  /** EPOCHS эпох мини-пачками по одной пачке, целевая функция PPO с обрезкой. */
  function update(A, b, o) {
    o = Object.assign({}, CFG, o || {});
    const { adv, ret } = gae(b, o), N = b.R.length;
    let m = 0, s2 = 0; for (let i = 0; i < N; i++) m += adv[i]; m /= N; for (let i = 0; i < N; i++) { const d = adv[i] - m; s2 += d * d; }
    const sd = Math.sqrt(s2 / N) + 1e-8, An = Float64Array.from(adv, (x) => (x - m) / sd);
    const r = rng(o.seed * 31 + 7), idx = Array.from({ length: N }, (_, i) => i), eps = o.CLIP, dO = new Float64Array(1), dV = new Float64Array(1);
    for (let ep = 0; ep < o.EPOCHS; ep++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      for (let k0 = 0; k0 < N; k0 += o.MB) {
        const mb = idx.slice(k0, k0 + o.MB), gP = zeroGrad(A.pi), gV = zeroGrad(A.v), gLs = new Float64Array(1);
        const ls = A.logstd[0], vr = DM.exp(2 * ls);
        for (const i of mb) {
          const mu = meanAct(A.pi, b.S[i]), lp = logp(b.A[i], mu, ls), ratio = DM.exp(lp - b.LP[i]), a = An[i];
          let g = ratio * a;
          if ((a > 0 && ratio > 1 + eps) || (a < 0 && ratio < 1 - eps)) g = 0;
          if (g) { const da = b.A[i] - mu; dO[0] = g * da / vr * (1 - mu * mu) / mb.length; gLs[0] += g * (da * da / vr - 1) / mb.length; bwd(A.pi, dO, gP); }
          dV[0] = 2 * (fwd(A.v, b.S[i])[0] - ret[i]) / mb.length; bwd(A.v, dV, gV);
        }
        adamStep(A.optPi, paramsOf(A.pi).concat([A.logstd]), gradsOf(gP).concat([gLs]), o.LR, +1);
        adamStep(A.optV, paramsOf(A.v), gradsOf(gV), o.LR, -1);
        A.logstd[0] = clamp(A.logstd[0], -3, 1.5);
      }
    }
  }
  /** Генератор обучения PPO: отдаёт итог каждого обновления; в конце — { A, hist }. */
  function* trainPPO(kind, o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED, iters: CFG.ITERS }, o || {});
    const A = agent(kind, o.seed, o), hist = [];
    for (let it = 0; it < o.iters; it++) {
      const b = collect(A, o.N_EP, o.seed * 100003 + it, o);
      const ok = b.eps.filter((e) => e.outcome === 'goal').length;
      update(A, b, Object.assign({}, o, { seed: o.seed * 1000 + it }));
      const h = { it, ok, n: b.eps.length, steps: b.R.length, ret: b.eps.reduce((s, e) => s + e.ret, 0) / b.eps.length };
      hist.push(h); yield h;
    }
    return { A, hist };
  }
  function runGen(g) { let r; while (!(r = g.next()).done) { /* синхронно */ } return r.value; }


  /* ---------- 5. проверка: одни и те же старты, полы и шум для всех политик ---------- */
  function ctlPPO(A) { return (rd) => meanAct(A.pi, obsOf(rd, A.kind)); }
  /** Одна поездка политикой ctl на полу floor; старт и шум датчиков — из зерна. trace — записать оценку μ модулем M. */
  function ride(ctl, floor, seed, o, M) {
    o = Object.assign({}, CFG, o || {});
    const r = rng(seed), rd = rideInit(startOf(r, o), floor, r, o), traj = [rd.s], acts = [], mus = [], est = [];
    let outcome = 'timeout';
    for (let t = 0; t < o.MAX_STEPS; t++) {
      const a = clamp(ctl(rd), -1, 1); acts.push(a); mus.push(muAt(floor, rd.s.x));
      if (M) est.push(estimate(M, rd));
      const st = rideStep(rd, a, o); traj.push(rd.s);
      if (st.outcome) { outcome = st.outcome; break; }
    }
    return { traj, acts, mus, est, outcome, T: acts.length, time: acts.length * o.REPEAT * D.DT };
  }
  const TEST_SEED = 9001;
  /** n проверочных поездок: поездка k начинается с одного и того же старта и того же шума у всех политик. */
  function trips(ctl, floor, n, o, M) { const out = []; for (let k = 0; k < n; k++) out.push(ride(ctl, floor, TEST_SEED + k * 7919, o, M)); return out; }
  const okShare = (eps) => eps.filter((e) => e.outcome === 'goal').length / eps.length;
  const meanTime = (eps) => { const g = eps.filter((e) => e.outcome === 'goal'); return g.length ? g.reduce((s, e) => s + e.time, 0) / g.length : null; };
  /** Итог на полу: доля доехавших, среднее время доехавших, поездки. */
  function evalFloor(ctl, floor, n, o) { const eps = trips(ctl, floor, n || 20, o); return { ok: okShare(eps), time: meanTime(eps), eps }; }
  /** Скорость вдоль маршрута: для каждой поездки — пары (сколько проехала по маршруту, см; скорость, см/с). */
  function speedProfile(e) { const out = []; for (const s of e.traj) out.push([PATHS[s.i], s.v]); return out; }


  /* ---------- 6. ученик: обучение по демонстрациям учителя (BC) и DAgger ---------- */
  /** Ученик — сеть того же размера, что у учителя; действие — tanh выхода. */
  function student(kind, seed, o) { o = Object.assign({}, CFG, o || {}); const pi = net(nIn(kind, o), o.H, 1, seed * 7 + 3, 0.1); return { kind, pi, opt: adamInit(paramsOf(pi)) }; }
  function ctlStudent(S) { return (rd) => meanAct(S.pi, obsOf(rd, S.kind)); }
  /** steps шагов Adam по случайным мини-пачкам: средний квадрат ошибки между tanh(выход сети) и целью Y ∈ [−1, 1]. */
  function fitNet(n, opt, X, Y, steps, seed, lr, mb) {
    const r = rng(seed), N = X.length, bs = Math.min(mb, N), dO = new Float64Array(1); let loss = 0;
    for (let it = 0; it < steps; it++) {
      const g = zeroGrad(n); let l = 0;
      for (let k = 0; k < bs; k++) {
        const i = Math.floor(r() * N), y = DM.tanh(fwd(n, X[i])[0]), e = y - Y[i];
        l += e * e; dO[0] = 2 * e * (1 - y * y) / bs; bwd(n, dO, g);
      }
      adamStep(opt, paramsOf(n), gradsOf(g), lr, -1); loss = l / bs;
    }
    return loss;
  }
  /** n поездок: ведёт driver ('teacher' или 'student'), учитель размечает каждое состояние своим действием.
   *  Поездка k зависит только от зерна и k. Возвращает входы ученика X, действия учителя Y и поездки (для карты). */
  function labelRides(T, S, driver, n, seed, o) {
    o = Object.assign({}, CFG, o || {});
    const X = [], Y = [], eps = [];
    for (let k = 0; k < n; k++) {
      const r = rng(seed * 2003 + k * 7919 + 17), floor = randFloor(r, o), rd = rideInit(startOf(r, o), floor, r, o), xy = [rd.s.x, rd.s.y];
      let outcome = 'timeout';
      for (let t = 0; t < o.MAX_STEPS; t++) {
        const xs = obsOf(rd, S.kind), y = meanAct(T.pi, obsOf(rd, 'priv'));
        X.push(xs); Y.push(y);
        const st = rideStep(rd, driver === 'teacher' ? y : meanAct(S.pi, xs), o); xy.push(rd.s.x, rd.s.y);
        if (st.outcome) { outcome = st.outcome; break; }
      }
      eps.push({ xy: Float32Array.from(xy), outcome, floor });
    }
    return { X, Y, eps };
  }
  /** Генератор дистилляции. mode 'dagger' — первая итерация на поездках учителя, дальше ведёт ученик;
   *  'bc' — все итерации на поездках учителя. На каждой итерации n новых поездок размечаются учителем,
   *  добавляются ко всем старым, и ученик дообучается. o.check — полы для проверки после каждой итерации. */
  function* distill(T, kind, mode, o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED, iters: CFG.D_ITERS, n: CFG.D_EP }, o || {});
    const S = student(kind, o.seed, o), X = [], Y = [], hist = [];
    for (let it = 0; it < o.iters; it++) {
      const driver = mode === 'bc' || it === 0 ? 'teacher' : 'student', d = labelRides(T, S, driver, o.n, o.seed * 7001 + it, o);
      for (let i = 0; i < d.X.length; i++) { X.push(d.X[i]); Y.push(d.Y[i]); }
      const loss = fitNet(S.pi, S.opt, X, Y, o.D_STEPS, o.seed * 13 + it, o.LR_S, o.MB);
      const h = { it, driver, n: X.length, loss, eps: d.eps };
      if (o.check) { let ok = 0, tot = 0; for (const f of o.check) { const t = trips(ctlStudent(S), f, o.checkN || 10, o); ok += t.filter((e) => e.outcome === 'goal').length; tot += t.length; } h.ok = ok / tot; }
      hist.push(h); yield h;
    }
    return { S, hist };
  }

  /* ---------- 7. адаптационный модуль (как в RMA): оценка μ по истории ---------- */
  /** Модуль смотрит на последние k решений истории (по 4 числа) и выдаёт оценку μ. */
  function adaptModule(k, seed, o) { o = Object.assign({}, CFG, o || {}); const n = net(NH * k, o.H, 1, seed * 7 + 5, 0.1); return { k, net: n, opt: adamInit(paramsOf(n)) }; }
  function estimate(M, rd) { return muOut(DM.tanh(fwd(M.net, rd.hist.subarray(0, NH * M.k))[0])); }
  /** Политика RMA: учитель, которому вместо настоящего μ подают оценку модуля. */
  function ctlRMA(T, M) { return (rd) => { const obs = obsOf(rd, 'priv'); obs[NS] = muIn(estimate(M, rd)); return meanAct(T.pi, obs); }; }
  /** Генератор обучения модуля: на каждой итерации ездит учитель с оценкой модуля (свои поездки, как в RMA),
   *  каждое состояние размечено настоящим μ, данные копятся, модуль дообучается регрессией. */
  function* trainModule(T, k, o) {
    o = Object.assign({}, CFG, { seed: CFG.SEED }, o || {});
    const M = adaptModule(k, o.seed, o), X = [], Y = [], hist = [];
    for (let it = 0; it < o.M_ITERS; it++) {
      const ctl = ctlRMA(T, M);
      for (let e = 0; e < o.M_EP; e++) {
        const r = rng(o.seed * 3001 + it * 7919 + e * 104729 + 29), floor = randFloor(r, o), rd = rideInit(startOf(r, o), floor, r, o);
        for (let t = 0; t < o.MAX_STEPS; t++) {
          X.push(rd.hist.slice(0, NH * k)); Y.push(muIn(muAt(floor, rd.s.x)));
          if (rideStep(rd, ctl(rd), o).outcome) break;
        }
      }
      const loss = fitNet(M.net, M.opt, X, Y, o.M_STEPS, o.seed * 17 + it, o.LR_S, o.MB);
      hist.push({ it, n: X.length, loss }); yield hist[hist.length - 1];
    }
    return { M, hist };
  }


  const API = { CFG, FLOORS, DM, randn, PATHS, PATH_LEN, KAPPA, AHEAD, along, nearest, collides, simStep, steer, sense, NS, NH, nIn, muAt, roomOf, vCmd, muIn, muOut,
    startOf, rideInit, obsOf, rideStep, randFloor, net, cloneNet, fwd, bwd, zeroGrad, adamInit, adamStep, paramsOf, gradsOf,
    agent, meanAct, collect, gae, update, trainPPO, runGen, ctlPPO, ride, trips, okShare, meanTime, evalFloor, speedProfile, TEST_SEED,
    student, ctlStudent, fitNet, labelRides, distill, adaptModule, estimate, ctlRMA, trainModule };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L55 = API;
})(typeof window !== 'undefined' ? window : globalThis);
