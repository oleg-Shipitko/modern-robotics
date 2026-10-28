/* =====================================================================
   l71/engine.js — общий мир лабораторий части 7 «Модели мира»: кухонный
   стол Ады, вид сверху, и то, что нужно уроку 7.1 «World Models и
   Dreamer». Без DOM: в браузере — window.L71, в Node — require. Уроки
   7.2–7.5 и проверка части 7 подключают этот файл и не дублируют его
   (API — lessons/l71/INTEGRATION.md, раздел «Общий движок»).

   1) Математика (раздел 0): свои exp, log, tanh, sin, cos, atan2 и целые
      степени умножением (блок DM из l61/engine.js) и случайность с
      зерном, поэтому Node, Chrome и Safari (JavaScriptCore) дают одни
      и те же числа бит в бит.
   2) Стол (раздел 1): чашка — диск, скользит с трением скатерти; кисть
      Ады толкает её по нормали контакта; удар быстрее порога опрокидывает
      чашку, центр за краем — чашка упала, о сахарницу и молочник чашка
      останавливается. Шаг 0,05 с из пяти подшагов. Пороги и размеры —
      свойства нашей модели, а не числа из статей.
   3) Наблюдения (раздел 2): состояние из семи чисел и кадр камеры сверху
      (по умолчанию 24 × 24 RGB) со скатертью, полосой солнца, предметами,
      чашкой и кистью; окно камеры можно сдвигать (для 7.3).
   4) Записи Ады (раздел 3): осторожные толчки оператора и случайные
      толчки в безопасной части стола, с зерном; у края записей нет,
      падений и опрокидываний в записях нет совсем. Карта покрытия.
   5) Сети (раздел 4): маленькие MLP с tanh, Adam, упаковка весов.
   6) Модель мира (раздел 5): ансамбль MLP предсказывает, что будет с
      чашкой за шаг, и вероятность провала; прогоны в воображении
      с температурой и штрафом за разброс ансамбля.
   7) Политика (раздел 6): толчок к блюдцу с тремя числами (скорость
      толчка, где обойти сахарницу, где отпустить чашку), поиск по
      популяции (ARS, как в 6.1) в воображении модели, попытки на
      настоящем столе, сбор опыта и цикл «опыт → модель → политика».
   8) CEM (раздел 7): общий поиск по распределению для планирования.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- 0. детерминированная математика (как в l61/engine.js) ----------
     Math.exp, log, sin, cos, tanh, atan2 в разных браузерах отличаются в последнем знаке,
     а обучение раздувает разницу. Здесь они собраны из сложений, умножений, делений
     (одинаковых везде по IEEE 754) и Math.sqrt. Целые степени — умножением. */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    // коэффициенты ряда Тейлора 1/n! (деление констант при загрузке одинаково во всех движках по IEEE 754)
    const IF = new Float64Array(20); IF[0] = 1; for (let n = 1; n < 20; n++) IF[n] = IF[n - 1] / n;
    /** e^x − 1 для |x| < 1 (ряд по схеме Горнера, 18 членов). */
    function expm1Small(x) { let p = IF[18]; for (let n = 17; n >= 1; n--) p = p * x + IF[n]; return p * x; }
    function exp(x) {
      if (x !== x) return x; if (x > 709) return Infinity; if (x < -745) return 0;
      const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
      let sm = IF[14]; for (let n = 13; n >= 0; n--) sm = sm * r + IF[n];
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
    function sigmoid(x) { return x >= 0 ? 1 / (1 + exp(-x)) : 1 - 1 / (1 + exp(x)); }
    /** tanh для нейронов сети: через e^(−2|x|) с рядом из 11 членов (относительная точность около 1e-12, вчетверо быстрее tanh). */
    function tanhNet(x) {
      const ax = x < 0 ? -x : x; if (ax > 19) return x < 0 ? -1 : 1;
      const y = -2 * ax, k = Math.round(y * INV_LN2), r = (y - k * LN2_HI) - k * LN2_LO;
      let p = IF[11]; for (let n = 10; n >= 0; n--) p = p * r + IF[n];
      const e = p * pow2(k), v = (1 - e) / (1 + e);
      return x < 0 ? -v : v;
    }
    const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 6.36619772367581382433e-01;
    const SC = new Float64Array(2);
    /** sin x и cos x в SC[0], SC[1]. */
    function sincos(x) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      if (q === 0) { SC[0] = sn; SC[1] = cs; } else if (q === 1) { SC[0] = cs; SC[1] = -sn; } else if (q === 2) { SC[0] = -sn; SC[1] = -cs; } else { SC[0] = -cs; SC[1] = sn; }
      return SC;
    }
    const sin = (x) => sincos(x)[0], cos = (x) => sincos(x)[1];
    const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
    function atan(z) {
      let sg = 1; if (z < 0) { z = -z; sg = -1; }
      let inv = false; if (z > 1) { z = 1 / z; inv = true; }
      let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
      const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
      const a = off + sm; return sg * (inv ? PIO2 - a : a);
    }
    function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
    /** Целая степень умножением: x^n, n ≥ 0. */
    function ipow(x, n) { let r = 1, b = x; while (n > 0) { if (n & 1) r *= b; b *= b; n >>= 1; } return r; }
    return { exp, log, tanh, tanhNet, sigmoid, sincos, sin, cos, atan2, ipow, pow2, PI };
  })();
  const PI = DM.PI, TAU = 2 * PI;
  /** Случайность с зерном (та же, что в HeroKit.rng и l61/engine.js). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.cos(TAU * r()); }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const hypot = (x, y) => Math.sqrt(x * x + y * y);
  /** Хэш массива чисел (для проверок совпадения Node и JavaScriptCore): биты float64 по 32 бита. */
  function hashNums(arr, h) {
    const f = new Float64Array(1), u = new Uint32Array(f.buffer); h = (h >>> 0) || 2166136261;
    for (let i = 0; i < arr.length; i++) { f[0] = arr[i]; h = Math.imul(h ^ u[0], 16777619) >>> 0; h = Math.imul(h ^ u[1], 16777619) >>> 0; }
    return h >>> 0;
  }

  /* =====================================================================
     1. Стол: чашка, кисть, предметы и шаг физики
     ===================================================================== */
  /** Стол (м): x — вдоль стола, y — к краю, у которого стоит Ада (y = H). */
  const TABLE = { W: 0.90, H: 0.60 };
  const CUP_R = 0.04, HAND_R = 0.03, SAUCER_R = 0.06;
  const DT = 0.05, NSUB = 5, HS = DT / NSUB;   // шаг 0,05 с, подшаг 0,01 с
  const V_MAX = 0.60, STEP_MAX = V_MAX * DT;    // наибольшая скорость кисти, м/с, и сдвиг за шаг
  const V_REC = 0.33;                           // в записях Ада не двигала кисть быстрее (м/с)
  const V_TIP = 0.36;                           // удар по чашке быстрее (м/с) — чашка опрокидывается, чай пролит
  const GRAV = 9.81;
  const D_OK = 0.03, V_REST = 0.03;             // чашка на блюдце: центр ближе 3 см к центру блюдца и почти стоит
  const T_TASK = 100;                           // попытка «подвинь чашку к блюдцу» — до 100 шагов (5 с)
  /** Скатерти: трение и узор кадра камеры. */
  const CLOTHS = {
    linen: { id: 'linen', name: 'льняная скатерть', mu: 0.36, base: [0.86, 0.80, 0.70], ink: [0.74, 0.62, 0.50], pattern: 'stripes' },
    check: { id: 'check', name: 'скатерть в клетку', mu: 0.30, base: [0.90, 0.88, 0.84], ink: [0.72, 0.30, 0.28], pattern: 'check' },
    oil: { id: 'oil', name: 'клеёнка', mu: 0.22, base: [0.80, 0.88, 0.86], ink: [0.42, 0.66, 0.62], pattern: 'dots' },
  };
  /** Раскладки стола. safe — где в записях бывала чашка (центр), start — где она стоит в начале попытки. */
  const LAYOUTS = {
    base: {
      id: 'base', saucer: [0.74, 0.34],
      objs: [{ kind: 'sugar', x: 0.46, y: 0.18, r: 0.05 }, { kind: 'milk', x: 0.50, y: 0.50, r: 0.055 }],
      safe: [0.10, 0.80, 0.10, 0.50], start: [0.12, 0.24, 0.26, 0.42],
    },
  };
  /** Новый мир. o: { layout, cloth, seed, cup: [x, y], hand: [x, y], noise: true — настоящий стол с разбросом трения и касаний }. */
  function world(o) {
    o = o || {};
    const lay = typeof o.layout === 'object' ? o.layout : LAYOUTS[o.layout || 'base'], cloth = CLOTHS[o.cloth || 'linen'];
    const r = rng((o.seed == null ? 1 : o.seed) * 7919 + 13), noise = o.noise !== false;
    const mu = cloth.mu * (noise ? 1 + 0.08 * (2 * r() - 1) : 1);
    const cup = o.cup || [lay.start[0] + (lay.start[1] - lay.start[0]) * r(), lay.start[2] + (lay.start[3] - lay.start[2]) * r()];
    const hand = o.hand || [cup[0] - 0.12, cup[1] + 0.10];
    return { lay, cloth, mu, noise, r, cx: cup[0], cy: cup[1], vx: 0, vy: 0, hx: hand[0], hy: hand[1], touch: false, alive: true, tipped: false, fallen: false, t: 0 };
  }
  const clone = (W) => Object.assign({}, W);
  /** Кисть не заходит в сахарницу и молочник и не уходит дальше 15 см за край стола. */
  function placeHand(W, x, y) {
    x = clamp(x, -0.15, TABLE.W + 0.15); y = clamp(y, -0.15, TABLE.H + 0.15);
    for (const ob of W.lay.objs) {
      const dx = x - ob.x, dy = y - ob.y, d = hypot(dx, dy), m = ob.r + HAND_R;
      if (d < m) { if (d < 1e-9) { x = ob.x + m; } else { x = ob.x + dx / d * m; y = ob.y + dy / d * m; } }
    }
    W.hx = x; W.hy = y;
  }
  /** Один шаг 0,05 с: кисть сдвигается на (ax, ay) (не больше 3 см), чашка отвечает.
   *  Возвращает событие шага: { contact, impact — наибольшая скорость удара, м/с, hit — чашка ударилась о предмет, tip, fall }. */
  function step(W, ax, ay) {
    const ev = { contact: false, impact: 0, hit: false, tip: false, fall: false };
    const L = hypot(ax, ay); if (L > STEP_MAX) { ax *= STEP_MAX / L; ay *= STEP_MAX / L; }
    for (let s = 0; s < NSUB; s++) {
      const hx0 = W.hx, hy0 = W.hy;
      placeHand(W, W.hx + ax / NSUB, W.hy + ay / NSUB);
      const vhx = (W.hx - hx0) / HS, vhy = (W.hy - hy0) / HS;
      if (!W.alive) continue;
      // трение скатерти: скорость падает на μg·dt
      const sp = hypot(W.vx, W.vy);
      if (sp > 0) { const s2 = Math.max(0, sp - W.mu * GRAV * HS); W.vx *= s2 / sp; W.vy *= s2 / sp; }
      const cx0 = W.cx, cy0 = W.cy;
      W.cx += W.vx * HS; W.cy += W.vy * HS;
      // кисть толкает чашку по нормали контакта
      let dx = W.cx - W.hx, dy = W.cy - W.hy, d = hypot(dx, dy); const m = CUP_R + HAND_R;
      if (d < m) {
        const nx = d > 1e-9 ? dx / d : 1, ny = d > 1e-9 ? dy / d : 0;
        const u = (vhx - W.vx) * nx + (vhy - W.vy) * ny;
        if (u > 0) {
          if (!W.touch && u > ev.impact) ev.impact = u;
          let ix = u * nx, iy = u * ny;
          if (W.noise) { const e = 0.06 * randn(W.r), c = DM.cos(e), sn = DM.sin(e); const jx = ix * c - iy * sn, jy = ix * sn + iy * c; ix = jx; iy = jy; }
          W.vx += ix; W.vy += iy;
        }
        W.cx = W.hx + nx * m; W.cy = W.hy + ny * m;
        if (!W.touch && u > V_TIP) { W.tipped = true; W.alive = false; W.vx = W.vy = 0; ev.tip = true; }
        W.touch = true; ev.contact = true;
      } else W.touch = false;
      // сахарница и молочник останавливают чашку: она упирается и стоит, пока кисть не потянет её в сторону от предмета
      for (const ob of W.lay.objs) {
        dx = W.cx - ob.x; dy = W.cy - ob.y; d = hypot(dx, dy); const mo = CUP_R + ob.r;
        if (d < mo) {
          if (hypot(cx0 - ob.x, cy0 - ob.y) >= mo) { W.cx = cx0; W.cy = cy0; }
          else { const nx = dx / d, ny = dy / d; W.cx = ob.x + nx * mo; W.cy = ob.y + ny * mo; }
          W.vx = W.vy = 0; ev.hit = true;
        }
      }
      // кисть не проходит сквозь чашку, прижатую к предмету
      dx = W.cx - W.hx; dy = W.cy - W.hy; d = hypot(dx, dy);
      if (d < m && d > 1e-9) placeHand(W, W.cx - dx / d * m, W.cy - dy / d * m);
      // центр чашки за краем стола — чашка упала
      if (W.alive && (W.cx < 0 || W.cx > TABLE.W || W.cy < 0 || W.cy > TABLE.H)) { W.fallen = true; W.alive = false; ev.fall = true; }
    }
    W.t++;
    return ev;
  }
  /** Чашка стоит на блюдце. */
  function onSaucer(W) { const s = W.lay.saucer; return W.alive && hypot(W.cx - s[0], W.cy - s[1]) < D_OK && hypot(W.vx, W.vy) < V_REST; }

  /* =====================================================================
     6а. Политика «толчок к блюдцу»: кисть заходит за чашку и толкает её к цели
     ===================================================================== */
  /** θ = [v, w, d]: v — скорость толчка, м/с; w — смещение маршрута у предметов поперёк линии «чашка → блюдце»,
   *  м (+ — к Аде, 0 — прямо); d — за сколько метров до блюдца начать тормозить (скорость плавно падает до 0,06 м/с).
   *  Политика смотрит на состояние (где чашка и кисть) и выдаёт сдвиг кисти за шаг. */
  const THETA_LO = [0.06, -0.26, 0.0], THETA_HI = [0.60, 0.26, 0.20];
  function clampTheta(th) { return [clamp(th[0], THETA_LO[0], THETA_HI[0]), clamp(th[1], THETA_LO[1], THETA_HI[1]), clamp(th[2], THETA_LO[2], THETA_HI[2])]; }
  /** Маршрут обхода: две точки на высоте y = (линия «старт → блюдце» у предметов) + w, за 12 см до предметов и через 12 см после.
   *  w = 0 — прямо к блюдцу. */
  const VIA_DX = 0.12;
  function route(lay, sx, sy, w) {
    const g = lay.saucer, ox = lay.objs[0].x, ty = sy + (g[1] - sy) * (ox - sx) / ((g[0] - sx) || 1);
    if (Math.abs(w) < 0.005) return [g];
    return [[ox - VIA_DX, ty + w], [ox + VIA_DX, ty + w], g];
  }
  /** Контроллер с памятью: ведёт чашку по точкам маршрута; последняя — блюдце. */
  function pushCtl(theta) {
    const th = clampTheta(theta), v = th[0], w = th[1], dRel = th[2];
    let k = 0, pts = null, pushing = false;
    const R0 = CUP_R + HAND_R + 0.005, ORB = CUP_R + HAND_R + 0.02;
    return {
      theta: th,
      reset(W) { k = 0; pushing = false; pts = route(W.lay, W.cx, W.cy, w); },
      route: () => pts,
      act(W) {
        // точка пройдена, если чашка рядом с ней или уже правее неё
        while (k < pts.length - 1 && (hypot(W.cx - pts[k][0], W.cy - pts[k][1]) < 0.04 || W.cx > pts[k][0])) k++;
        const last = k === pts.length - 1, tx = pts[k][0], ty = pts[k][1], phase = last ? 1 : 0;
        let ux = tx - W.cx, uy = ty - W.cy; const dist = hypot(ux, uy); ux /= dist || 1; uy /= dist || 1;
        const sp = hypot(W.vx, W.vy);
        if (phase === 1 && dist < D_OK * 0.6 + sp * sp / (2 * 3.0)) return [0, 0];    // почти на месте: отпускаем, чашка доезжает сама
        // торможение: за dRel до блюдца скорость толчка плавно падает до 0,06 м/с
        const vp = phase === 1 && dist < dRel + D_OK ? 0.06 + (v - 0.06) * clamp((dist - D_OK) / Math.max(dRel, 1e-3), 0, 1) : v;
        // точка за чашкой: отсюда кисть толкает к цели
        const px = W.cx - ux * R0, py = W.cy - uy * R0, rx = W.hx - W.cx, ry = W.hy - W.cy, rd = hypot(rx, ry);
        const cosA = rd > 1e-9 ? -(rx * ux + ry * uy) / rd : -1;   // 1 — кисть точно за чашкой
        if (rd < R0 + 0.02 && cosA > (pushing ? 0.95 : 0.985)) {   // толкаем к цели и подправляем кисть поперёк, чтобы оставаться за центром чашки
          pushing = true;
          const ex = px - W.hx, ey = py - W.hy, along = ex * ux + ey * uy, lx = ex - along * ux, ly = ey - along * uy;
          const lm = hypot(lx, ly), cap = 0.5 * vp * DT, kc = lm * 0.8 > cap ? cap / lm : 0.8;
          return [ux * vp * DT + kc * lx, uy * vp * DT + kc * ly];
        }
        pushing = false;
        if (cosA < 0.7) {   // обходим чашку по дуге, не задевая её
          const a = DM.atan2(ry, rx), aT = DM.atan2(-uy, -ux); let da = aT - a; while (da > PI) da -= TAU; while (da < -PI) da += TAU;
          const na = a + clamp(da, -0.5, 0.5), sc = DM.sincos(na), ox = W.cx + sc[1] * ORB, oy = W.cy + sc[0] * ORB;
          return [ox - W.hx, oy - W.hy];
        }
        // подходим к точке за чашкой; последние 2 см — не быстрее толчка, чтобы не ударить чашку
        let mx = px - W.hx, my = py - W.hy; const md = hypot(mx, my), lim = md < 0.02 + STEP_MAX ? Math.max(vp * DT, md - 0.02) : STEP_MAX;
        if (md > lim) { mx *= lim / md; my *= lim / md; }
        return [mx, my];
      },
    };
  }
  /** Попытка на настоящем столе: до T_TASK шагов. Возвращает { ok, t — шаг успеха, tip, fall, path — [cx, cy, hx, hy]×шаги, trans }. */
  function runReal(theta, o) {
    o = o || {};
    const W = world({ layout: o.layout, cloth: o.cloth, seed: o.seed, cup: o.cup, hand: o.hand, noise: o.noise });
    const ctl = pushCtl(theta); ctl.reset(W);
    const path = [W.cx, W.cy, W.hx, W.hy], trans = o.record ? [] : null;
    let ok = false, t = 0, ev = null;
    for (t = 0; t < T_TASK; t++) {
      const a = ctl.act(W), s0 = trans ? stateVec(W) : null;
      ev = step(W, a[0], a[1]);
      if (trans) trans.push({ s: s0, a: [a[0], a[1]], s1: stateVec(W), fail: W.alive ? 0 : 1 });
      path.push(W.cx, W.cy, W.hx, W.hy);
      if (!W.alive) break;
      if (onSaucer(W)) { ok = true; break; }
    }
    return { ok, t: ok ? t + 1 : T_TASK, tip: W.tipped, fall: W.fallen, path, trans, mu: W.mu, start: [path[0], path[1]] };
  }

  /* =====================================================================
     2. Наблюдения: состояние и кадр камеры сверху
     ===================================================================== */
  /** Состояние из семи чисел: чашка x, y, vx, vy, стоит ли она (1 — стоит на столе), кисть x, y. */
  function stateVec(W) { return [W.cx, W.cy, W.vx, W.vy, W.alive ? 1 : 0, W.hx, W.hy]; }
  /** Цвета предметов в кадре (линейные 0…1, до света): как на столе урока 0.1. */
  const PAL = {
    floor: [0.30, 0.28, 0.26], saucer: [0.93, 0.93, 0.90], rim: [0.78, 0.78, 0.74], sugar: [0.22, 0.40, 0.88], milk: [0.95, 0.95, 0.92],
    milkRim: [0.70, 0.70, 0.66], cup: [0.86, 0.16, 0.14], tea: [0.42, 0.24, 0.12], hand: [0.96, 0.94, 0.90], finger: [0.24, 0.24, 0.22],
  };
  /** Освещение: brightness — общий свет (вечером меньше), tint — оттенок, sun — где по столу идёт солнечная полоса
   *  (0…1 вдоль стола, null — полосы нет), sunW — ширина полосы, м. */
  const LIGHTS = {
    day: { brightness: 1.0, tint: [1, 1, 1], sun: 0.35, sunW: 0.14 },
    morning: { brightness: 0.95, tint: [1.0, 0.97, 0.92], sun: 0.15, sunW: 0.16 },
    evening: { brightness: 0.62, tint: [1.0, 0.86, 0.70], sun: null, sunW: 0.14 },
  };
  /** Цвет точки стола (x, y) без предметов: скатерть с узором или пол за краем. */
  function clothAt(cloth, x, y) {
    if (x < 0 || x > TABLE.W || y < 0 || y > TABLE.H) return PAL.floor;
    let k = 0;
    if (cloth.pattern === 'stripes') k = ((Math.floor(x / 0.045) & 1) === 0) ? 1 : 0;
    else if (cloth.pattern === 'check') k = ((Math.floor(x / 0.075) + Math.floor(y / 0.075)) & 1) ? 1 : 0;
    else { const gx = x / 0.06 - Math.floor(x / 0.06) - 0.5, gy = y / 0.06 - Math.floor(y / 0.06) - 0.5; k = gx * gx + gy * gy < 0.06 ? 1 : 0; }
    return k ? cloth.ink : cloth.base;
  }
  /** Цвет точки сцены: предметы поверх скатерти, затем свет и солнечная полоса. */
  function colorAt(W, x, y, L) {
    let c = clothAt(W.cloth, x, y);
    const g = W.lay.saucer, dS = hypot(x - g[0], y - g[1]);
    if (dS < SAUCER_R) c = dS > SAUCER_R - 0.012 ? PAL.rim : PAL.saucer;
    for (const ob of W.lay.objs) { const d = hypot(x - ob.x, y - ob.y); if (d < ob.r) c = ob.kind === 'milk' ? (d > ob.r - 0.012 ? PAL.milkRim : PAL.milk) : PAL.sugar; }
    if (!W.fallen) {
      const d = hypot(x - W.cx, y - W.cy);
      if (W.tipped) { if (d < CUP_R * 1.8 && hypot(x - W.cx - 0.03, y - W.cy) < CUP_R * 1.5) c = PAL.tea; if (hypot((x - W.cx) * 0.8, (y - W.cy) * 1.4) < CUP_R) c = PAL.cup; }
      else if (d < CUP_R) c = d < CUP_R * 0.62 ? PAL.tea : PAL.cup;
    }
    const dh = hypot(x - W.hx, y - W.hy); if (dh < HAND_R) c = dh < HAND_R * 0.45 ? PAL.finger : PAL.hand;
    let b = L.brightness;
    if (L.sun != null && x >= 0 && x <= TABLE.W && y >= 0 && y <= TABLE.H) { const u = x + 0.45 * y - L.sun * (TABLE.W + 0.45 * TABLE.H); if (u > -L.sunW / 2 && u < L.sunW / 2) b *= 1.35; }
    return [Math.min(1, c[0] * b * L.tint[0]), Math.min(1, c[1] * b * L.tint[1]), Math.min(1, c[2] * b * L.tint[2])];
  }
  /** Кадр камеры на голове Ады: картинка сверху w × h (по умолчанию 24 × 24) RGB, значения 0…1, по 2 × 2 отсчёта на пиксель.
   *  o = { w, h, view: [x0, y0, x1, y1] — какой кусок стола видит камера, м (по умолчанию весь стол в квадрате),
   *  light — LIGHTS или своё освещение }. Возвращает Float32Array(w · h · 3), строки сверху вниз (дальний край стола — сверху). */
  function frame(W, o) {
    o = o || {}; const w = o.w || 24, h = o.h || 24, v = o.view || [0, -0.15, TABLE.W, TABLE.H + 0.15];
    const L = typeof o.light === 'object' ? o.light : LIGHTS[o.light || 'day'], out = new Float32Array(w * h * 3);
    const sx = (v[2] - v[0]) / w, sy = (v[3] - v[1]) / h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let r = 0, g = 0, b = 0;
      for (let q = 0; q < 4; q++) { const c = colorAt(W, v[0] + (i + 0.25 + 0.5 * (q & 1)) * sx, v[1] + (j + 0.25 + 0.5 * (q >> 1)) * sy, L); r += c[0]; g += c[1]; b += c[2]; }
      const k = (j * w + i) * 3; out[k] = r / 4; out[k + 1] = g / 4; out[k + 2] = b / 4;
    }
    return out;
  }

  /* =====================================================================
     3. Записи Ады: что она записала днём
     ===================================================================== */
  /** Осторожные толчки в безопасной части стола: оператор ведёт чашку к случайным точкам внутри safe
   *  со скоростью 0,08–0,33 м/с, а между толчками кисть двигается рядом с чашкой. Удары медленнее порога,
   *  у края записей нет, поэтому падений и опрокидываний в записях нет совсем.
   *  o: { n — число записей (по 60 шагов), seed, layout, cloth, from — номер первой записи }.
   *  Возвращает { trans: [{ s, a, s1, fail }], eps — пути чашки и кисти по записям }. */
  function records(o) {
    o = o || {};
    const lay = typeof o.layout === 'object' ? o.layout : LAYOUTS[o.layout || 'base'], n = o.n || 60, seed = o.seed == null ? 1 : o.seed, from = o.from || 0;
    const sf = lay.safe, trans = [], eps = [];
    const inSafe = (x, y, m) => x > sf[0] + m && x < sf[1] - m && y > sf[2] + m && y < sf[3] - m;
    const free = (x, y) => lay.objs.every((ob) => hypot(x - ob.x, y - ob.y) > ob.r + CUP_R + 0.02);
    for (let e = from, retry = 0; e < from + n; retry ? 0 : e++) {
      const r = rng(seed * 100003 + e * 7907 + 11 + retry * 104729);
      let cx, cy; do { cx = sf[0] + (sf[1] - sf[0]) * r(); cy = sf[2] + (sf[3] - sf[2]) * r(); } while (!free(cx, cy));
      const ha = TAU * r(), hd = 0.10 + 0.05 * r();
      const W = world({ layout: lay, cloth: o.cloth, seed: seed * 1009 + e, cup: [cx, cy], hand: [cx + DM.cos(ha) * hd, cy + DM.sin(ha) * hd] });
      const path = [W.cx, W.cy, W.hx, W.hy], local = [];
      let mode = 0, ctl = null, left = 0, tgt = null, poke = null;
      for (let t = 0; t < 60; t++) {
        if (left <= 0) {   // новый толчок: к случайной точке внутри безопасной части или касание рядом с чашкой
          left = 12 + Math.floor(r() * 16);
          if (r() < 0.7) {
            mode = 0; let tx, ty; do { tx = sf[0] + 0.03 + (sf[1] - sf[0] - 0.06) * r(); ty = sf[2] + 0.03 + (sf[3] - sf[2] - 0.06) * r(); } while (!free(tx, ty));
            tgt = [tx, ty]; ctl = pushCtl([0.08 + 0.25 * r(), 0, 0]); ctl.reset(Object.assign({}, W, { lay: Object.assign({}, lay, { saucer: tgt }) }));
          } else { mode = 1; const a = TAU * r(), d = 0.02 + 0.10 * r(); poke = [W.cx + DM.cos(a) * d, W.cy + DM.sin(a) * d, 0.05 + 0.2 * r()]; }
        }
        left--;
        let a;
        if (mode === 0) a = ctl.act(Object.assign({}, W, { lay: Object.assign({}, lay, { saucer: tgt }) }));
        else { let mx = poke[0] - W.hx, my = poke[1] - W.hy; const md = hypot(mx, my), lim = poke[2] * DT; if (md > lim) { mx *= lim / md; my *= lim / md; } a = [mx, my]; }
        // оператор осторожен: не ведёт чашку к краю и не двигает кисть быстрее 0,33 м/с
        const L = hypot(a[0], a[1]); if (L > V_REC * DT) { a[0] *= V_REC * DT / L; a[1] *= V_REC * DT / L; }
        const s0 = stateVec(W);
        step(W, a[0], a[1]);
        if (!W.alive) break;   // провал: эту запись оператор переснимет
        if (!inSafe(W.cx, W.cy, -0.005)) { left = 0; }   // чашка у границы — следующий толчок
        local.push({ s: s0, a: [a[0], a[1]], s1: stateVec(W), fail: 0 });
        path.push(W.cx, W.cy, W.hx, W.hy);
      }
      if (!W.alive) { retry++; if (retry > 20) throw new Error('records: не удалось записать без провала'); continue; }
      retry = 0;
      for (const x of local) trans.push(x);
      eps.push(path);
    }
    return { trans, eps, lay };
  }
  /** Карта покрытия: сколько переходов, где чашка двигалась или её касались, приходится на каждую клетку nx × ny. */
  function coverage(trans, nx, ny) {
    nx = nx || 18; ny = ny || 12; const g = new Float64Array(nx * ny);
    for (const x of trans) {
      const moved = hypot(x.s1[0] - x.s[0], x.s1[1] - x.s[1]) > 1e-4 || hypot(x.s[5] - x.s[0], x.s[6] - x.s[1]) < CUP_R + HAND_R + 0.02;
      if (!moved) continue;
      const i = Math.floor(x.s[0] / TABLE.W * nx), j = Math.floor(x.s[1] / TABLE.H * ny);
      if (i >= 0 && i < nx && j >= 0 && j < ny) g[j * nx + i]++;
    }
    return { nx, ny, g };
  }
  /** Скорость удара в переходе (м/с): с какой скоростью кисть шла к чашке в момент касания. */
  function speedOf(x) { return hypot(x.a[0], x.a[1]) / DT; }

  /* =====================================================================
     4. Маленькие сети: MLP с tanh, Adam, упаковка весов
     ===================================================================== */
  /** Сеть sizes = [вход, скрытые…, выход]; скрытые слои — tanh (act: 'tanh', по умолчанию) или ReLU с утечкой 0,01 ('relu');
   *  веса — гауссовы с масштабом √(2/вход) для ReLU и √(1/вход) для tanh, зерно seed. */
  function net(sizes, seed, act) {
    act = act || 'tanh';
    const r = rng(seed == null ? 3 : seed), L = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const a = sizes[i], b = sizes[i + 1], w = new Float64Array(a * b), s = Math.sqrt((act === 'relu' && i < sizes.length - 2 ? 2 : 1) / a);
      for (let j = 0; j < w.length; j++) w[j] = randn(r) * s;
      L.push({ a, b, w, bias: new Float64Array(b), gw: new Float64Array(a * b), gb: new Float64Array(b), mw: new Float64Array(a * b), vw: new Float64Array(a * b), mb: new Float64Array(b), vb: new Float64Array(b), h: new Float64Array(b), d: new Float64Array(b), d2: new Float64Array(b) });
    }
    return { sizes, act, L, t: 0, b1t: 1, b2t: 1, x: null };
  }
  /** Прямой проход: скрытые слои — ReLU с утечкой или tanh (свой, DM.tanh), выход — линейный. Возвращает выход (внутренний буфер). */
  function fwd(m, x) {
    m.x = x; let h = x;
    for (let li = 0; li < m.L.length; li++) {
      const l = m.L[li], o = l.h, last = li === m.L.length - 1, b = l.b, w = l.w;
      for (let j = 0; j < b; j++) o[j] = l.bias[j];
      for (let i = 0; i < l.a; i++) { const hi = h[i]; if (hi === 0) continue; const off = i * b; for (let j = 0; j < b; j++) o[j] += hi * w[off + j]; }
      if (!last) {
        if (m.act === 'tanh') for (let j = 0; j < b; j++) o[j] = DM.tanhNet(o[j]);
        else for (let j = 0; j < b; j++) if (o[j] < 0) o[j] *= 0.01;
      }
      h = o;
    }
    return h;
  }
  /** Обратный проход по градиенту g на выходе (после fwd на том же входе): копит градиенты весов. */
  function bwd(m, g) {
    let d = g;
    for (let li = m.L.length - 1; li >= 0; li--) {
      const l = m.L[li], hin = li ? m.L[li - 1].h : m.x, dl = l.d, b = l.b, w = l.w, gw = l.gw;
      if (li === m.L.length - 1) for (let j = 0; j < b; j++) dl[j] = d[j];
      else if (m.act === 'tanh') for (let j = 0; j < b; j++) dl[j] = d[j] * (1 - l.h[j] * l.h[j]);
      else for (let j = 0; j < b; j++) dl[j] = l.h[j] < 0 ? d[j] * 0.01 : d[j];
      for (let j = 0; j < b; j++) l.gb[j] += dl[j];
      const din = li ? m.L[li - 1].d2 : null;
      for (let i = 0; i < l.a; i++) {
        const off = i * b, hi = hin[i]; let s = 0;
        for (let j = 0; j < b; j++) { gw[off + j] += hi * dl[j]; s += w[off + j] * dl[j]; }
        if (din) din[i] = s;
      }
      d = din;
    }
  }
  /** Шаг Adam по накопленным градиентам (делённым на размер пакета bs); β-степени — произведениями, без Math.pow. */
  function adam(m, lr, bs) {
    m.t++; m.b1t *= 0.9; m.b2t *= 0.999; const c1 = 1 - m.b1t, c2 = 1 - m.b2t;
    for (const l of m.L) for (const [P, G, M, V] of [[l.w, l.gw, l.mw, l.vw], [l.bias, l.gb, l.mb, l.vb]]) {
      for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = 0.9 * M[i] + 0.1 * g; V[i] = 0.999 * V[i] + 0.001 * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
    }
  }
  /** Число параметров сети. */
  const nParams = (m) => m.L.reduce((s, l) => s + l.w.length + l.bias.length, 0);
  /** Упаковка весов: Float32 в base64 (для вшивания в движок), и обратно — с теми же значениями в Node и в браузере. */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function packF32(arr) {
    const f = new Float32Array(arr), u = new Uint8Array(f.buffer); let s = '';
    for (let i = 0; i < u.length; i += 3) { const a = u[i], b = i + 1 < u.length ? u[i + 1] : 0, c = i + 2 < u.length ? u[i + 2] : 0, n = (a << 16) | (b << 8) | c;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u.length ? B64[n & 63] : '='); }
    return s;
  }
  function unpackF32(s) {
    const len = Math.floor(s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0), u = new Uint8Array(len); let j = 0;
    for (let i = 0; i < s.length; i += 4) { const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2])) << 6) | (s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]));
      if (j < len) u[j++] = (n >> 16) & 255; if (j < len) u[j++] = (n >> 8) & 255; if (j < len) u[j++] = n & 255; }
    return Array.from(new Float32Array(u.buffer));
  }
  function packNet(m) { const all = []; for (const l of m.L) { for (const v of l.w) all.push(v); for (const v of l.bias) all.push(v); } return { sizes: m.sizes.slice(), act: m.act, w: packF32(all) }; }
  function unpackNet(p) { const m = net(p.sizes, 1, p.act), v = unpackF32(p.w); let k = 0; for (const l of m.L) { for (let i = 0; i < l.w.length; i++) l.w[i] = v[k++]; for (let i = 0; i < l.bias.length; i++) l.bias[i] = v[k++]; } return m; }

  /* =====================================================================
     5. Модель мира: ансамбль MLP предсказывает, что будет с чашкой за шаг
     ===================================================================== */
  /** Каждая сеть ансамбля — две части.
   *  Модель движения: по состоянию (8 чисел: где чашка, её скорость, где кисть относительно чашки, близость кисти,
   *  скорость чашки) выдаёт f (4) и G (4 × 2): сдвиг чашки и изменение её скорости за шаг равны f + G·a, где a — сдвиг
   *  кисти. Так устроены модели «динамика плюс управление»: при заданном расположении отклик линеен по действию.
   *  Модель провала: по тем же 8 числам, сдвигу кисти и скорости, с которой кисть идёт к чашке, выдаёт вероятность,
   *  что чашка будет пролита или упадёт.
   *  Её учат, только если в данных есть провалы; иначе модель о провалах ничего не знает и считает их невозможными. */
  const NS = 8, NOUT = 12, OSC = [0.015, 0.015, 0.10, 0.10];
  function feat(s, out) {
    const rx = s[5] - s[0], ry = s[6] - s[1], rd = hypot(rx, ry);
    out[0] = (s[0] - 0.45) / 0.30; out[1] = (s[1] - 0.30) / 0.20; out[2] = s[2] / 0.30; out[3] = s[3] / 0.30;
    out[4] = clamp(rx / 0.10, -2.5, 2.5); out[5] = clamp(ry / 0.10, -2.5, 2.5);
    out[6] = clamp((CUP_R + HAND_R + 0.03 - rd) / 0.03, 0, 1);   // близость кисти: 1 — касается, 0 — дальше 3 см
    out[7] = hypot(s[2], s[3]) / 0.30;                           // скорость чашки
    return out;
  }
  const NF = NS + 3;
  /** Вход модели провала: состояние, сдвиг кисти и скорость сближения кисти с чашкой (м/с, деленная на 0,3; 0, если кисть далеко). */
  function featFail(x, s, a, out) {
    for (let j = 0; j < NS; j++) out[j] = x[j];
    out[NS] = a[0] / STEP_MAX; out[NS + 1] = a[1] / STEP_MAX;
    const rx = s[0] - s[5], ry = s[1] - s[6], rd = hypot(rx, ry) || 1;
    out[NS + 2] = x[6] > 0 ? Math.max(0, ((a[0] / DT - s[2]) * rx + (a[1] / DT - s[3]) * ry) / rd) / 0.30 : 0;
    return out;
  }
  /** Ансамбль: o = { k — число сетей (5), hidden — [32, 32], seed }. */
  function ensemble(o) {
    o = o || {}; const k = o.k || 5, hid = o.hidden || [32, 32], seed = o.seed == null ? 1 : o.seed;
    const nets = [], fails = [];
    for (let i = 0; i < k; i++) { nets.push(net([NS].concat(hid, [NOUT]), seed * 131 + i * 17 + 5)); fails.push(net([NF, 16, 1], seed * 977 + i * 29 + 7)); }
    return { nets, fails, k, seed, n: 0, npos: 0 };
  }
  /** Обучение ансамбля на переходах (генератор: yield { net, epoch, epochs, loss } после каждой эпохи каждой сети).
   *  o = { epochs: 16 (или updates — число шагов Adam на сеть при любом объёме данных), lr: 0.004, bs: 32 }. Функция потерь модели
   *  движения — квадрат ошибки четырёх чисел; модели провала — перекрёстная энтропия, примеры с провалом весят больше. */
  function* trainEnsemble(ens, trans, o) {
    o = o || {}; const lr0 = o.lr || 0.004, bs = o.bs || 32, N = trans.length;
    const epochs = o.epochs || (o.updates ? Math.max(2, Math.round(o.updates * bs / Math.max(1, N))) : 16);
    const X = new Float64Array(N * NF), Y = new Float64Array(N * 5), x = new Float64Array(NS), xf = new Float64Array(NF), g = new Float64Array(NOUT), gf = new Float64Array(1);
    let npos = 0;
    for (let i = 0; i < N; i++) {
      const t = trans[i]; feat(t.s, x); featFail(x, t.s, t.a, xf); X.set(xf, i * NF);
      for (let j = 0; j < 4; j++) Y[i * 5 + j] = (t.s1[j] - t.s[j]) / OSC[j];
      Y[i * 5 + 4] = t.fail ? 1 : 0; if (t.fail) npos++;
    }
    const wPos = o.failW != null ? o.failW : 1;
    ens.n = N; ens.npos = npos; ens.epochs = epochs;
    for (let m = 0; m < ens.k; m++) {
      const M = ens.nets[m], F = ens.fails[m], r = rng(ens.seed * 7 + m * 101 + 3), idx = new Int32Array(N);
      for (let i = 0; i < N; i++) idx[i] = i;
      for (let ep = 0; ep < epochs; ep++) {
        for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), q = idx[i]; idx[i] = idx[j]; idx[j] = q; }
        const lr = lr0 * (ep < epochs * 0.8 ? 1 : 0.3);
        let tot = 0, cnt = 0;
        for (let b0 = 0; b0 < N; b0 += bs) {
          const b1 = Math.min(N, b0 + bs);
          for (let q = b0; q < b1; q++) {
            const i = idx[q], o0 = i * NF; for (let j = 0; j < NS; j++) x[j] = X[o0 + j];
            const ax = X[o0 + NS], ay = X[o0 + NS + 1], y = fwd(M, x);
            for (let j = 0; j < 4; j++) {
              const e = y[j] + y[4 + 2 * j] * ax + y[5 + 2 * j] * ay - Y[i * 5 + j]; tot += e * e;
              g[j] = 2 * e; g[4 + 2 * j] = 2 * e * ax; g[5 + 2 * j] = 2 * e * ay;
            }
            bwd(M, g); cnt++;
            if (npos) {
              for (let j = 0; j < NF; j++) xf[j] = X[o0 + j];
              const yt = Y[i * 5 + 4], z = fwd(F, xf)[0]; gf[0] = (DM.sigmoid(z) - yt) * (yt ? wPos : 1); bwd(F, gf);
            }
          }
          adam(M, lr, b1 - b0); if (npos) adam(F, lr, b1 - b0);
        }
        yield { net: m, epoch: ep, epochs, loss: tot / Math.max(1, cnt) };
      }
    }
    return ens;
  }
  /** Довести генератор до конца (в Node и в проверках). */
  function finish(gen, onEv) { for (;;) { const r = gen.next(); if (r.done) return r.value; if (onEv) onEv(r.value); } }
  /** Кисть в воображении двигается так же, как на столе: не заходит в предметы и в чашку. */
  function handNext(lay, hx, hy, ax, ay, cx, cy) {
    const L = hypot(ax, ay); if (L > STEP_MAX) { ax *= STEP_MAX / L; ay *= STEP_MAX / L; }
    const W = { lay, hx, hy }; placeHand(W, hx + ax, hy + ay);
    const dx = cx - W.hx, dy = cy - W.hy, d = hypot(dx, dy), m = CUP_R + HAND_R;
    if (d < m && d > 1e-9) placeHand(W, cx - dx / d * m, cy - dy / d * m);
    return [W.hx, W.hy];
  }
  /** Предсказание сети k ансамбля на шаг в out = [cx, cy, vx, vy, pFail]. */
  const XB = new Float64Array(NS), XF = new Float64Array(NF);
  function predictNet(ens, k, s, a, out) {
    const x = feat(s, XB), y = fwd(ens.nets[k], x), ax = a[0] / STEP_MAX, ay = a[1] / STEP_MAX;
    for (let j = 0; j < 4; j++) out[j] = s[j] + (y[j] + y[4 + 2 * j] * ax + y[5 + 2 * j] * ay) * OSC[j];
    out[4] = ens.npos ? DM.sigmoid(fwd(ens.fails[k], featFail(x, s, a, XF))[0]) : 0;
    return out;
  }
  /** Предсказания всех сетей ансамбля на шаг: out[k] = [cx, cy, vx, vy, pFail] для сети k. */
  function predictAll(ens, s, a, out) {
    for (let k = 0; k < ens.k; k++) predictNet(ens, k, s, a, out[k] || (out[k] = new Float64Array(5)));
    return out;
  }
  /** Прогон в воображении по заданным сдвигам кисти (лаборатория 1): каждая сеть ансамбля воображает своё будущее.
   *  s0 — состояние, acts — [[ax, ay]…]. Возвращает { paths[k] — [cx, cy, hx, hy]×(T+1), pFail[k] — накопленная
   *  вероятность провала, mean — средний путь чашки [cx, cy]×(T+1), spread — разброс сетей по шагам, м }. */
  function imagineOpen(ens, s0, acts, lay) {
    lay = typeof lay === 'object' ? lay : LAYOUTS[lay || 'base'];
    const K = ens.k, T = acts.length, paths = [], pF = [], buf = [];
    for (let k = 0; k < K; k++) {
      let s = s0.slice(); const p = [s[0], s[1], s[5], s[6]]; let alive = 1;
      for (let t = 0; t < T; t++) {
        const a = acts[t], o = predictNet(ens, k, s, a, buf[0] || (buf[0] = new Float64Array(5))), h = handNext(lay, s[5], s[6], a[0], a[1], o[0], o[1]);
        alive *= 1 - o[4];
        s = [o[0], o[1], o[2], o[3], 1, h[0], h[1]]; p.push(s[0], s[1], s[5], s[6]);
      }
      paths.push(p); pF.push(1 - alive);
    }
    const mean = [], spread = [];
    for (let t = 0; t <= T; t++) {
      let mx = 0, my = 0; for (let k = 0; k < K; k++) { mx += paths[k][t * 4]; my += paths[k][t * 4 + 1]; } mx /= K; my /= K;
      let v = 0; for (let k = 0; k < K; k++) { const dx = paths[k][t * 4] - mx, dy = paths[k][t * 4 + 1] - my; v += dx * dx + dy * dy; }
      mean.push(mx, my); spread.push(Math.sqrt(v / K));
    }
    return { paths, pFail: pF, mean, spread };
  }
  /** Тот же толчок на настоящем столе (без разброса трения, чтобы сравнение было честным): путь [cx, cy, hx, hy]×(T+1) и события. */
  function realOpen(s0, acts, o) {
    o = o || {};
    const W = world({ layout: o.layout, cloth: o.cloth, seed: o.seed, cup: [s0[0], s0[1]], hand: [s0[5], s0[6]], noise: false });
    W.vx = s0[2]; W.vy = s0[3];
    const p = [W.cx, W.cy, W.hx, W.hy]; let tip = -1, fall = -1, maxImpact = 0;
    for (let t = 0; t < acts.length; t++) {
      const ev = step(W, acts[t][0], acts[t][1]); if (ev.impact > maxImpact) maxImpact = ev.impact;
      if (ev.tip && tip < 0) tip = t + 1; if (ev.fall && fall < 0) fall = t + 1;
      p.push(W.cx, W.cy, W.hx, W.hy);
    }
    return { path: p, tip, fall, maxImpact };
  }
  /** Попытка политики в воображении модели (лаборатория 2). o = { tau — температура: 0 — среднее сетей, 1 — случайная
   *  сеть на каждом шаге, больше 1 — разброс сетей преувеличен; lambda — штраф за разброс ансамбля; seed; path }.
   *  Политика видит воображаемое состояние и действует по нему. Возвращает { ok, t, alive — вероятность, что чашка
   *  не пролита и не упала, score, spread — средний разброс сетей на шаге, м }. */
  const NB = new Float64Array(5), MU = new Float64Array(5);
  function imagineCtl(ens, theta, start, lay, o) {
    o = o || {}; lay = typeof lay === 'object' ? lay : LAYOUTS[lay || 'base'];
    const tau = o.tau == null ? 1 : o.tau, lam = o.lambda || 0, r = rng((o.seed == null ? 1 : o.seed) * 9973 + 7), K = ens.k, buf = [];
    const W = world({ layout: lay, cup: start.cup, hand: start.hand, noise: false });
    const ctl = pushCtl(theta); ctl.reset(W);
    let s = stateVec(W), alive = 1, sp = 0, ok = false, t = 0; const path = o.path ? [s[0], s[1], s[5], s[6]] : null;
    for (t = 0; t < T_TASK; t++) {
      const a = ctl.act(W), kk = Math.floor(r() * K), n = NB;
      if (tau === 1 && !lam && !o.spread) predictNet(ens, kk, s, a, n);
      else {
        predictAll(ens, s, a, buf); MU.fill(0);
        for (let k = 0; k < K; k++) for (let j = 0; j < 5; j++) MU[j] += buf[k][j] / K;
        for (let j = 0; j < 5; j++) n[j] = MU[j] + tau * (buf[kk][j] - MU[j]);
        let v = 0; for (let k = 0; k < K; k++) { const dx = buf[k][0] - MU[0], dy = buf[k][1] - MU[1]; v += dx * dx + dy * dy; } sp += Math.sqrt(v / K);
      }
      alive *= 1 - clamp(n[4], 0, 1);
      const h = handNext(lay, s[5], s[6], a[0], a[1], n[0], n[1]);
      s = [n[0], n[1], n[2], n[3], 1, h[0], h[1]];
      W.cx = s[0]; W.cy = s[1]; W.vx = s[2]; W.vy = s[3]; W.hx = s[5]; W.hy = s[6];
      if (path) path.push(s[0], s[1], s[5], s[6]);
      if (onSaucer(W)) { ok = true; break; }
    }
    const T = ok ? t + 1 : T_TASK, g = lay.saucer, dist = hypot(s[0] - g[0], s[1] - g[1]);
    const spread = sp / Math.max(1, ok ? T : T_TASK);
    const score = (ok ? alive * (1 - T / T_TASK) : -Math.min(dist, 0.5)) - lam * spread * 100;
    return { ok: ok && alive >= 0.5, reached: ok, t: T, alive, score, spread, path };
  }

  /* =====================================================================
     6б. Обучение политики в воображении (ARS), попытки на столе и сбор опыта
     ===================================================================== */
  /** Начальные положения попыток: чашка — в области start раскладки, кисть — у края стола со стороны Ады. */
  function starts(n, seed, lay) {
    lay = typeof lay === 'object' ? lay : LAYOUTS[lay || 'base'];
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = rng((seed == null ? 1 : seed) * 4099 + i * 263 + 1), st = lay.start;
      const cx = st[0] + (st[1] - st[0]) * r(), cy = st[2] + (st[3] - st[2]) * r();
      out.push({ cup: [cx, cy], hand: [cx - 0.05 - 0.04 * r(), Math.min(TABLE.H + 0.06, cy + 0.12 + 0.04 * r())], seed: (seed == null ? 1 : seed) * 1000 + i });
    }
    return out;
  }
  const toU = (th) => th.map((v, i) => (v - THETA_LO[i]) / (THETA_HI[i] - THETA_LO[i]));
  const fromU = (u) => u.map((v, i) => THETA_LO[i] + clamp(v, 0, 1) * (THETA_HI[i] - THETA_LO[i]));
  /** Средний счёт политики в воображении по набору начальных положений. */
  function scoreImag(ens, theta, sts, lay, o) {
    let s = 0, ok = 0, sp = 0;
    for (let i = 0; i < sts.length; i++) { const r = imagineCtl(ens, theta, sts[i], lay, Object.assign({}, o, { seed: (o && o.seed || 1) * 31 + i })); s += r.score; if (r.ok) ok++; sp += r.spread; }
    return { score: s / sts.length, ok: ok / sts.length, spread: sp / sts.length };
  }
  /** Поиск по популяции (ARS, Mania и соавторы, 2018; как в уроке 6.1) целиком в воображении модели.
   *  Генератор: yield { it, theta, score, ok } после каждой итерации. o = { iters: 16, dirs: 6, top: 4, nu: 0.06,
   *  alpha: 0.08, theta0, free — номера чисел θ, которые ищем ([0, 2]), starts — набор начальных положений, tau, lambda, seed }. */
  function* arsImag(ens, o) {
    o = o || {}; const lay = typeof o.layout === 'object' ? o.layout : LAYOUTS[o.layout || 'base'];
    const iters = o.iters || 16, D = o.dirs || 6, B = o.top || 4, nu = o.nu || 0.06, alpha = o.alpha || 0.08;
    const sts = o.starts || starts(8, 11, lay), r = rng((o.seed == null ? 1 : o.seed) * 7717 + 3), opt = { tau: o.tau, lambda: o.lambda, seed: o.seed };
    const free = o.free || [0, 2];   // какие числа политики ищем: по умолчанию скорость толчка и где отпустить, маршрут — прямо
    let u = toU(clampTheta(o.theta0 || [0.2, 0, 0.02]));
    const hist = [];
    for (let it = 0; it < iters; it++) {
      const res = [];
      for (let d = 0; d < D; d++) {
        const dl = [0, 0, 0]; for (const i of free) dl[i] = randn(r);
        const rp = scoreImag(ens, fromU(u.map((v, i) => v + nu * dl[i])), sts, lay, opt).score;
        const rm = scoreImag(ens, fromU(u.map((v, i) => v - nu * dl[i])), sts, lay, opt).score;
        res.push({ dl, rp, rm, m: Math.max(rp, rm) });
      }
      res.sort((a, b) => b.m - a.m || a.dl[0] - b.dl[0]);
      const top = res.slice(0, B); let mean = 0, v2 = 0;
      for (const x of top) { mean += x.rp + x.rm; } mean /= 2 * B;
      for (const x of top) { v2 += (x.rp - mean) * (x.rp - mean) + (x.rm - mean) * (x.rm - mean); }
      const sd = Math.sqrt(v2 / (2 * B)) || 1;
      u = u.map((v, i) => clamp(v + alpha / (B * sd) * top.reduce((s, x) => s + (x.rp - x.rm) * x.dl[i], 0), 0, 1));
      const cur = scoreImag(ens, fromU(u), sts, lay, opt);
      const h = { it, theta: fromU(u), score: cur.score, ok: cur.ok, spread: cur.spread }; hist.push(h);
      yield h;
    }
    return { theta: fromU(u), hist };
  }
  /** Попытки на настоящем столе (проверка): n попыток с разными положениями чашки и разным трением. */
  function evalReal(theta, o) {
    o = o || {}; const lay = typeof o.layout === 'object' ? o.layout : LAYOUTS[o.layout || 'base'];
    const sts = o.starts || starts(o.n || 50, o.seed == null ? 5 : o.seed, lay), res = [];
    let ok = 0, tip = 0, fall = 0, stuck = 0, tsum = 0;
    for (const st of sts) {
      const r = runReal(theta, { layout: lay, cloth: o.cloth, seed: st.seed, cup: st.cup, hand: st.hand, record: o.record });
      res.push(r); if (r.ok) { ok++; tsum += r.t; } else if (r.tip) tip++; else if (r.fall) fall++; else stuck++;
    }
    return { n: sts.length, ok, tip, fall, stuck, rate: ok / sts.length, tMean: ok ? tsum / ok : 0, runs: res };
  }
  /** Опыт для дообучения модели: попытки текущей политики на настоящем столе (там, куда она ходит), со всеми провалами. */
  function collectPolicy(theta, n, seed, lay) {
    const ev = evalReal(theta, { n, seed, layout: lay, record: true }), trans = [];
    for (const r of ev.runs) for (const x of r.trans) trans.push(x);
    return { trans, ev };
  }

  /* =====================================================================
     7. CEM: поиск по распределению (для планирования, как в PlaNet)
     ===================================================================== */
  /** Метод перекрёстной энтропии: J кандидатов из гауссианы N(mu, sd), оценка f(x) (больше — лучше), новая гауссиана —
   *  по K лучшим. o = { pop: 64, elite: 8, iters: 5, seed, lo, hi — границы, onIter(it, mu, sd, best) }.
   *  Возвращает { mu, sd, best, bestScore }. */
  function cem(f, mu0, sd0, o) {
    o = o || {}; const n = mu0.length, J = o.pop || 64, K = o.elite || 8, I = o.iters || 5, r = rng((o.seed == null ? 1 : o.seed) * 6151 + 9);
    let mu = mu0.slice(), sd = sd0.slice(), best = mu.slice(), bestScore = -Infinity;
    for (let it = 0; it < I; it++) {
      const cand = [];
      for (let j = 0; j < J; j++) {
        const x = new Array(n); for (let i = 0; i < n; i++) { let v = mu[i] + sd[i] * randn(r); if (o.lo) v = Math.max(o.lo[i], v); if (o.hi) v = Math.min(o.hi[i], v); x[i] = v; }
        cand.push({ x, s: f(x), j });
      }
      cand.sort((a, b) => b.s - a.s || a.j - b.j);
      if (cand[0].s > bestScore) { bestScore = cand[0].s; best = cand[0].x.slice(); }
      const el = cand.slice(0, K);
      for (let i = 0; i < n; i++) { let m = 0; for (const c of el) m += c.x[i]; m /= K; let v = 0; for (const c of el) v += (c.x[i] - m) * (c.x[i] - m); mu[i] = m; sd[i] = Math.sqrt(v / K) + 1e-6; }
      if (o.onIter) o.onIter(it, mu.slice(), sd.slice(), cand);
    }
    return { mu, sd, best, bestScore };
  }

  /* =====================================================================
     API (описание — lessons/l71/INTEGRATION.md, раздел «Общий движок»)
     ===================================================================== */
  const API = {
    // математика и случайность
    DM, rng, randn, clamp, hypot, hashNums,
    // стол и физика
    TABLE, CUP_R, HAND_R, SAUCER_R, DT, NSUB, V_MAX, STEP_MAX, V_REC, V_TIP, D_OK, V_REST, T_TASK, CLOTHS, LAYOUTS, LIGHTS, PAL,
    world, clone, step, onSaucer, placeHand,
    // наблюдения
    stateVec, frame, colorAt,
    // записи
    records, coverage, speedOf,
    // сети
    net, fwd, bwd, adam, nParams, packNet, unpackNet, packF32, unpackF32, finish,
    // модель мира
    feat, featFail, ensemble, trainEnsemble, predictNet, predictAll, handNext, imagineOpen, realOpen, imagineCtl,
    // политика и цикл
    THETA_LO, THETA_HI, clampTheta, route, pushCtl, runReal, starts, scoreImag, arsImag, evalReal, collectPolicy,
    // планирование
    cem,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L71 = API;
})(typeof window !== 'undefined' ? window : globalThis);
