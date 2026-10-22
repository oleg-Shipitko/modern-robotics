/* =====================================================================
   l64/engine.js — движок урока 6.4 «Локоманипуляция». Без DOM:
   в браузере — window.L64, в Node — require. Вся математика своя (DM),
   все случайности с зерном: Node, Chrome и Safari дают одни числа.

   1) Тело и физика. Плоская Ада с ногами, вид сбоку, размеры как в 6.1
      и в shared/ada-legs.js. Корпус с ногами — линейный перевёрнутый
      маятник: центр масс на постоянной высоте 0,66 м над полом, ускорение
      ω²·(x − p), где p — точка опоры (центр давления) под стопой, и p не
      выходит за пятку и носок. Шаг физики 1 мс. Ноги переставляются: стопа
      в воздухе идёт к цели шага и встаёт в назначенный момент.
   2) ПД-регуляторы суставов (1 кГц) тянут корпус к опорной траектории
      плана и мягкие: на 1 см отклонения сдвигают опору на 0,5 см.
   3) Контроллер тела (50 Гц и в момент касания): шаг по дивергентной
      компоненте движения (DCM), как в классических контроллерах ходьбы,
      и кисть с чашкой на плавной траектории в комнате.
   4) Модель верхнего уровня работает f раз в секунду, ответ приходит через 1/f с.
      Она видит, где полка, и решает, с какой скоростью идти. Режим 'wbc':
      отдаёт скорость контроллеру тела. Режим 'direct': сама строит план
      всего тела (опору, шаги, углы руки) по своему кадру — в уме у неё тот
      же контроллер и точная модель Ады, — и план исполняют ПД-регуляторы.
   5) Чашка: поверхность чая — маятник с частотой первой моды колебаний
      жидкости в чашке; чай выплёскивается при наклоне больше 20,6°.
   6) Лаборатория 2: демонстрации оператора (модель верхнего уровня — человек),
      две политики по одним данным: A — опора и шаг 50 Гц без контроллера
      тела, B — скорость 10 Гц поверх контроллера тела. MLP, Adam.
   ===================================================================== */
'use strict';
(function (root) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- 0. переносимая математика (как в 5.2–6.3) ----------
     Math.exp, log, sin, cos, tanh, atan2 в разных браузерах отличаются в последнем знаке,
     а симуляция и обучение раздувают разницу. Здесь они собраны из сложений, умножений,
     делений (одинаковых везде по IEEE 754) и Math.sqrt. Целые степени — умножением. */
  const DM = (() => {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const HI = (() => { f64[0] = 1; return u32[1] === 0x3ff00000 ? 1 : 0; })(), LO = 1 - HI;
    function pow2(k) { f64[0] = 0; u32[LO] = 0; u32[HI] = (k + 1023) << 20; return f64[0]; }
    const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
    function expm1Small(x) { let s = 0, t = 1; for (let n = 1; n <= 18; n++) { t = t * x / n; s += t; } return s; }
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
    /** sin x → out[off], cos x → out[off + 1], без выделения памяти. */
    function sincosTo(x, out, off) {
      const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_1) - k * PIO2_1T, r2 = r * r;
      let sn = r, t = r; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); sn += t; }
      let cs = 1; t = 1; for (let n = 1; n <= 10; n++) { t = -t * r2 / ((2 * n - 1) * (2 * n)); cs += t; }
      const q = ((k % 4) + 4) % 4;
      if (q === 0) { out[off] = sn; out[off + 1] = cs; } else if (q === 1) { out[off] = cs; out[off + 1] = -sn; } else if (q === 2) { out[off] = -sn; out[off + 1] = -cs; } else { out[off] = -cs; out[off + 1] = sn; }
    }
    const SC = new Float64Array(2);
    function sincos(x) { sincosTo(x, SC, 0); return [SC[0], SC[1]]; }
    const PI = 3.141592653589793, PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TAN_PI8 = 0.41421356237309503;
    function atan(z) {
      let sg = 1; if (z < 0) { z = -z; sg = -1; }
      let inv = false; if (z > 1) { z = 1 / z; inv = true; }
      let off = 0; if (z > TAN_PI8) { z = (z - 1) / (z + 1); off = PIO4; }
      const z2 = z * z; let t = z, sm = z; for (let n = 3; n <= 61; n += 2) { t = -t * z2; sm += t / n; }
      const a = off + sm; return sg * (inv ? PIO2 - a : a);
    }
    function atan2(y, x) { if (x > 0) return atan(y / x); if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI; return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0; }
    function acos(c) { c = clamp(c, -1, 1); return atan2(Math.sqrt(1 - c * c), c); }
    return { exp, log, tanh, sincos, sincosTo, atan2, acos, PI };
  })();
  const PI = DM.PI, TAU = 2 * PI;
  /** Случайность с зерном (та же формула, что в HeroKit.rng). */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(TAU * r())[1]; }
  const cosh = (x) => { const e = DM.exp(x); return 0.5 * (e + 1 / e); }, sinh = (x) => { const e = DM.exp(x); return 0.5 * (e - 1 / e); };

  /* ---------- 1. тело, физика, чашка ---------- */
  const G = 9.81;
  /** Размеры Ады (м), как L61.BODY и AdaBody.BODY: корпус LT, бедро L1, голень L2, голеностоп HA над подошвой, пятка FH позади и носок FT
   *  впереди голеностопа, плечевой сустав LS над тазом, плечо LUA, предплечье LFA. Таз при ходьбе на высоте PZ, центр масс на ZC. */
  const B = { LT: 0.46, L1: 0.30, L2: 0.30, HA: 0.05, FH: 0.06, FT: 0.12, LS: 0.368, LUA: 0.20, LFA: 0.17, PZ: 0.60, ZC: 0.66, MASS: 28 };
  /** Ходьба: шаг 0,40 с (после толчка — не короче 0,22 с), длина шага до 0,42 м, цель шага не дальше 0,22 м от центра масс в момент касания,
   *  стопа в воздухе не быстрее 3 м/с. Падение: центр масс дальше 0,26 м от опорного голеностопа. ПД: KP, KD — сдвиг опоры на отклонение корпуса. */
  const CFG = { DT: 0.002, CDT: 0.02, T: 0.40, TMIN: 0.22, LMAX: 0.42, REACH: 0.22, VSW: 3.0, RFALL: 0.26, KP: 0.5, KD: 0.12, LIFT: 0.06,
    CARRY: 0.24, CARRYZ: 0.86, WF: 10, WA: 30, ZA: 0.9, ZS: 0.05, CUP_R: 0.04, CUP_H: 0.06, FREE: 0.015,
    XSTOP: 2.0, SLOT: 2.31, SHELF: 0.90, SHELF_X: 2.24, SHELF_D: 0.32, WIN: 0.08, VMAX: 0.45, KV: 1.4, TEND: 10, PLACE: 0.8, SEED: 1 };
  const W = Math.sqrt(G / B.ZC), W2 = W * W;
  /** Чашка: первая мода колебаний жидкости в цилиндре радиусом R при глубине H: ω² = 1,841·g/R·th(1,841·H/R); чай выплёскивается,
   *  когда край поверхности поднимается до края чашки: наклон больше atan(FREE/R). */
  const WS = Math.sqrt(1.841 * G / CFG.CUP_R * DM.tanh(1.841 * CFG.CUP_H / CFG.CUP_R));
  const SPILL = DM.atan2(CFG.FREE, CFG.CUP_R);
  /** Положение и скорость центра масс через t с при постоянной опоре p (решение уравнения маятника). */
  function prop(x, v, p, t) { const c = cosh(W * t), s = sinh(W * t); return [p + (x - p) * c + v / W * s, (x - p) * W * s + v * c]; }

  /** Состояние: время, центр масс (x, v), стопы (x голеностопов: 0 — дальняя от зрителя, 1 — ближняя), опорная стопа st, время в шаге ts,
   *  двойная опора ds, номер шага sid; кисть с чашкой (hx, hv), ориентир кисти (hs, hsv — плавный след таза), поверхность чая (phi, dphi). */
  function newState(x0) {
    x0 = x0 || 0;
    return { t: 0, x: x0, v: 0, p: x0, st: 0, feet: [x0, x0], ts: 0, ds: true, sid: 0, td: false, fell: null, fellDir: 0, steps: 0,
      slot: CFG.SLOT, hit: null, hs: x0, hsv: 0, hx: x0 + CFG.CARRY, hv: 0, ha: 0, phi: 0, dphi: 0, phiMax: 0, spilled: null, place: null, placed: null, stopped: null, F: 0 };
  }
  function clone(S) { const C = Object.assign({}, S); C.feet = S.feet.slice(); return C; }

  /* ---------- 2. контроллер тела: шаг по DCM ----------
     ξ = x + v/ω — дивергентная компонента движения: точка, куда надо поставить опору, чтобы остановиться. При опоре p она уходит
     от p экспоненциально: ξ(t) = p + (ξ₀ − p)·e^{ωt}. Шаг выбирается так, чтобы в момент касания ξ оказалась на нужном расстоянии
     b перед новой стопой: для ровной ходьбы со скоростью v и шагом L = v·T это b = L / (e^{ωT} − 1). Опора внутри стопы подправляет ξ
     до касания; если цель шага всё равно дальше, чем дотягивается нога, шаг делается раньше. */
  function plan(S, vcmd) {
    const xi = S.x + S.v / W, stop = vcmd < 0.05 && vcmd > -0.05;
    if (S.ds) {
      const lo = Math.min(S.feet[0], S.feet[1]) - B.FH, hi = Math.max(S.feet[0], S.feet[1]) + B.FT, mid = (S.feet[0] + S.feet[1]) / 2 + 0.02;
      if (stop) return { ds: true, sid: S.sid, p: clamp(xi + 1.5 * (xi - mid), lo, hi) };
      const V = clone(S); V.ds = false; V.ts = 0; V.st = S.feet[0] <= S.feet[1] ? 0 : 1;
      return Object.assign(plan(V, vcmd), { begin: true });
    }
    const s = S.feet[S.st], sw = S.feet[1 - S.st];
    const L = stop ? 0 : clamp(vcmd * CFG.T, -0.12, 0.30), b = L / (DM.exp(W * CFG.T) - 1), xiDes = s + L + b;
    const trNom = Math.max(0.004, CFG.T - S.ts), trMin = Math.max(0.004, Math.min(trNom, CFG.TMIN - S.ts));
    let best = null;
    for (let k = 0; k <= 8; k++) {
      const tr = trNom + (trMin - trNom) * k / 8, e = DM.exp(W * tr);
      const p = clamp((xiDes - xi * e) / (1 - e), s - B.FH, s + B.FT), xiT = p + (xi - p) * e, xT = prop(S.x, S.v, p, tr)[0];
      const lo = Math.max(xT - CFG.REACH, s - CFG.LMAX, sw - CFG.VSW * tr), hi = Math.min(xT + CFG.REACH, s + CFG.LMAX, sw + CFG.VSW * tr);
      let f = xiT - b; const viol = f < lo ? lo - f : f > hi ? f - hi : 0; f = clamp(f, lo, hi);
      if (!best || viol < best.viol - 1e-6) best = { p, f, tr, viol };
      if (viol < 1e-6) break;
    }
    return { ds: false, st: S.st, sid: S.sid, p: best.p, f: best.f, tTD: S.t + best.tr, stop };
  }
  /** Запись плана на ближайшие 20 мс: начало, опорная траектория корпуса, опора, шаг, ориентир кисти в комнате. */
  function entryOf(S, vcmd) { return Object.assign(plan(S, vcmd), { t: S.t, xr: S.x, vr: S.v, hx: S.hs + CFG.CARRY, hxv: S.hsv }); }
  const copyE = (E) => Object.assign({}, E);

  /* ---------- 3. шаг физики 1 мс ----------
     E — действующая запись плана (её опорная траектория меняется на месте). Fx — внешняя сила (толчок), Н. arm: 'world' — кисть ведёт
     контроллер тела по плавной траектории в комнате; 'plan' — углы руки взяты из плана, и кисть едет вместе с телом. */
  function physStep(S, E, Fx, arm) {
    const dt = CFG.DT;
    if (S.ds && E.begin && E.sid === S.sid) { S.ds = false; S.ts = 0; S.st = E.st; }
    const match = E.sid === S.sid && E.ds === S.ds && (S.ds || E.st === S.st);
    let lo, hi;
    if (S.ds) { lo = Math.min(S.feet[0], S.feet[1]) - B.FH; hi = Math.max(S.feet[0], S.feet[1]) + B.FT; }
    else { const s = S.feet[S.st]; lo = s - B.FH; hi = s + B.FT; }
    const pf = match ? E.p : (S.ds ? (S.feet[0] + S.feet[1]) / 2 : S.feet[S.st]);
    const p = clamp(pf + CFG.KP * (S.x - E.xr) + CFG.KD * (S.v - E.vr), lo, hi);
    S.p = p; S.F = Fx;
    const a = W2 * (S.x - p) + Fx / B.MASS;
    S.v += a * dt; S.x += S.v * dt;
    const ar = W2 * (E.xr - E.p); E.vr += ar * dt; E.xr += E.vr * dt;
    // плавный след таза: от него контроллер (или план) отмеряет кисть с чашкой
    const af = CFG.WF * CFG.WF * (S.x - S.hs) - 2 * CFG.WF * S.hsv; S.hsv += af * dt; S.hs += S.hsv * dt;
    // кисть: поставить чашку на полку или нести её (в уме модели верхнего уровня не считается)
    let ht, hvt;
    if (S.head) { stepFeet(S, E, match, dt); return; }
    if (S.place != null) { const wp = 5, ap = wp * wp * (S.slot - S.pr) - 2 * wp * S.prv; S.prv += ap * dt; S.pr += S.prv * dt; ht = S.pr; hvt = S.prv; }
    else {
      const hp = E.hx + E.hxv * (S.t + dt - E.t);
      if (arm === 'world') { ht = hp; hvt = E.hxv; } else { ht = S.x + (hp - E.xr); hvt = S.v + (E.hxv - E.vr); }
    }
    const ha = CFG.WA * CFG.WA * (ht - S.hx) + 2 * CFG.ZA * CFG.WA * (hvt - S.hv);
    S.hv += ha * dt; S.hx += S.hv * dt; S.ha = ha;
    // поверхность чая: маятник, который раскачивает ускорение кисти
    const dd = -WS * WS * S.phi - 2 * CFG.ZS * WS * S.dphi - WS * WS * ha / G;
    S.dphi += dd * dt; S.phi += S.dphi * dt;
    const aphi = S.phi < 0 ? -S.phi : S.phi; if (aphi > S.phiMax) S.phiMax = aphi;
    if (S.spilled == null && aphi > SPILL) S.spilled = S.t + dt;
    stepFeet(S, E, match, dt);
  }
  /** Стопа в воздухе идёт к цели шага и встаёт в назначенный момент; время; проверка падения. */
  function stepFeet(S, E, match, dt) {
    if (!S.ds && match) {
      const sw = 1 - S.st, tr = E.tTD - S.t, want = tr > dt ? (E.f - S.feet[sw]) * dt / tr : E.f - S.feet[sw];
      S.feet[sw] += clamp(want, -CFG.VSW * dt, CFG.VSW * dt); S.ts += dt;
      if (S.t + dt >= E.tTD - 1e-9) {
        S.st = sw; S.ts = 0; S.steps++; S.sid++; S.td = true;
        if (E.stop && Math.abs(S.feet[0] - S.feet[1]) < 0.08) S.ds = true;
      }
    } else if (!S.ds) S.ts += dt;
    S.t += dt;
    if (S.hit == null && S.fell == null) { const front = S.slot - (CFG.SLOT - CFG.SHELF_X); if (Math.max(S.feet[0], S.feet[1]) + B.FT > front + 0.005 || S.x > front - 0.03) S.hit = S.t; }
    if (S.fell == null) {
      if (S.ds) { const l2 = Math.min(S.feet[0], S.feet[1]) - 0.16, h2 = Math.max(S.feet[0], S.feet[1]) + 0.22; if (S.x < l2 || S.x > h2) { S.fell = S.t; S.fellDir = S.x > h2 ? 1 : -1; } }
      else { const d = S.x - S.feet[S.st]; if (d > CFG.RFALL || d < -CFG.RFALL) { S.fell = S.t; S.fellDir = d > 0 ? 1 : -1; } }
    }
  }

  /* ---------- 4. лаборатория 1: модель верхнего уровня с частотой f ---------- */
  /** Решение модели верхнего уровня: с какой скоростью идти, чтобы встать у полки. Оно одинаковое в обоих режимах. */
  function intent(x, xStop) { const d = xStop - x; return d < 0.03 ? 0 : clamp(CFG.KV * d, 0, CFG.VMAX); }
  /** Толчки в корпус: первый через 0,6–1,4 с, дальше в среднем раз в 2,2 с; изменение скорости от dvMin до dvMax м/с за 0,1 с, вперёд или назад. */
  function makePushes(seed, o) {
    const R = rng(seed * 7919 + 13), out = [];
    let t = (o.t0 || 0.6) + 0.8 * R();
    while (t < o.tEnd - 0.5) { out.push({ t, dv: (R() < 0.5 ? -1 : 1) * (o.dvMin + (o.dvMax - o.dvMin) * R()) }); t += 0.5 - DM.log(1 - R()) / (o.rate || 0.6); }
    return out;
  }
  const forceAt = (pushes, t) => { let F = 0; for (const p of pushes) if (t >= p.t - 1e-9 && t < p.t + 0.1 - 1e-9) F += B.MASS * p.dv / 0.1; return F; };
  /** Кадр для рисунка (раз в 20 мс): центр масс, опора, стопы и подъём стопы в воздухе, кисть, наклон чая, толчок. */
  function snap(S, E) {
    let lift = 0;
    if (!S.ds && E && E.tTD != null && E.sid === S.sid) { const rem = E.tTD - S.t, ph = S.ts / Math.max(1e-6, S.ts + rem); lift = CFG.LIFT * DM.sincos(PI * clamp(ph, 0, 1))[0]; }
    let hz = CFG.CARRYZ;
    if (S.place != null) { const u = 5 * (S.t - S.place); hz += (CFG.SHELF + 0.05 - CFG.CARRYZ) * (1 - DM.exp(-u) * (1 + u)); }
    return { t: S.t, x: S.x, v: S.v, p: S.p, f0: S.feet[0], f1: S.feet[1], st: S.st, ds: S.ds, lift, hx: S.hx, hz, phi: S.phi, F: S.F, place: S.place };
  }
  /** Эпизод лаборатории 1. mode 'wbc' или 'direct', f — частота модели верхнего уровня, Гц (ответ приходит через 1/f с).
   *  o: { pushes: 'random' | 'none', push: { t, dv } — отдельный толчок, dvMin, dvMax, keep — сохранять кадры, xStop }. */
  function episode(mode, f, seed, o) {
    o = Object.assign({ pushes: 'random', dvMin: 0.1, dvMax: 0.3, rate: 0.6, tEnd: CFG.TEND, xStop: CFG.XSTOP, keep: false }, o || {});
    const S = newState(0), Tp = 1 / f, lat = Tp, arm = mode === 'wbc' ? 'world' : 'plan'; S.slot = o.xStop + CFG.SLOT - CFG.XSTOP;
    const pushes = o.pushes === 'random' ? makePushes(seed, { dvMin: o.dvMin, dvMax: o.dvMax, rate: o.rate, tEnd: o.tEnd }) : [];
    if (o.push) pushes.push(o.push);
    const chunks = [], frames = [], tops = [];
    let nextFrame = 0, nextCtl = 0, E = entryOf(S, 0), end = null;
    const chunkAt = (t) => { let c = null; for (const ch of chunks) if (ch.t0 <= t + 1e-9) c = ch; return c; };
    const vAt = (t) => { const c = chunkAt(t); if (!c) return 0; let i = 0; while (i + 1 < c.tv.length && c.tv[i + 1] <= t + 1e-9) i++; return c.v[i]; };
    const eAt = (t) => { const c = chunkAt(t); if (!c) return null; let b = null; for (const e of c.e) if (e.t <= t + 1e-9) b = e; return b; };
    const nMax = Math.round(o.tEnd / CFG.DT);
    for (let n = 0; n < nMax; n++) {
      const t = S.t;
      if (t >= nextFrame - 1e-9) {
        // кадр модели верхнего уровня: в уме — точная модель Ады без толчков; до прихода ответа действует уже отправленное
        const t0 = nextFrame + lat, tEndC = t0 + 2 * Tp + 0.12, M = clone(S), tv = [], vs = [], es = []; M.head = true;
        let Em = copyE(E), nm = nextCtl;
        while (M.t < tEndC - 1e-9 && M.fell == null) {
          if (M.t >= nm - 1e-9 || M.td) {
            const inNew = M.t >= t0 - 1e-9;
            if (inNew) { const vc = intent(M.x, o.xStop); tv.push(M.t); vs.push(vc); Em = entryOf(M, vc); es.push(copyE(Em)); }
            else if (mode === 'wbc') Em = entryOf(M, vAt(M.t));
            else { const e = eAt(M.t); Em = e ? copyE(e) : entryOf(M, 0); }
            if (M.t >= nm - 1e-9) nm += CFG.CDT; M.td = false;
          }
          physStep(M, Em, 0, 'world');
        }
        chunks.push({ t0, tv, v: vs, e: es }); if (chunks.length > 4) chunks.shift();
        tops.push({ shot: nextFrame, at: t0 });
        nextFrame += Tp;
      }
      if (t >= nextCtl - 1e-9 || S.td) {
        if (mode === 'wbc') E = entryOf(S, S.stopped != null ? 0 : vAt(t));
        else { const e = eAt(t); E = e ? copyE(e) : entryOf(S, 0); }
        if (t >= nextCtl - 1e-9) nextCtl += CFG.CDT; S.td = false;
        if (o.keep && Math.abs(t / CFG.CDT - Math.round(t / CFG.CDT)) < 1e-6) frames.push(snap(S, E));
      }
      physStep(S, E, forceAt(pushes, t), arm);
      if (S.stopped == null && S.fell == null && S.hit == null && S.ds && Math.abs(S.v) < 0.02 && Math.abs(S.x - o.xStop) < CFG.WIN && S.t > 1) { S.stopped = S.t; S.place = S.t; S.pr = S.hx; S.prv = S.hv; }
      if (S.place != null && S.placed == null && S.t >= S.place + CFG.PLACE - 1e-9) S.placed = S.t;
      if (end == null && (S.fell != null || S.placed != null || S.hit != null)) end = S.t + (S.fell != null ? 0.9 : 0.4);
      if (end != null && S.t >= end - 1e-9) break;
    }
    if (o.keep) frames.push(snap(S, E));
    const out = outcome(S);
    return { mode, f, seed, out, hit: S.hit, ok: out === 'placed', fell: S.fell, fellDir: S.fellDir, spilled: S.spilled, placed: S.placed, stopped: S.stopped,
      err: S.stopped != null ? S.x - o.xStop : null, phiMax: S.phiMax, steps: S.steps, pushes, frames: o.keep ? frames : null, tops: o.keep ? tops : null };
  }
  /** Исход прогона: упала, упёрлась в полку, пролила чай, поставила чашку или не встала у полки. */
  const outcome = (S) => (S.fell != null ? 'fell' : S.hit != null ? 'hit' : S.spilled != null ? 'spilled' : S.placed != null ? 'placed' : 'miss');
  /** Серия из n прогонов (зёрна seed0…seed0+n−1): сколько раз Ада поставила чашку, упала, пролила чай или не встала у полки. */
  function* series(mode, f, n, seed0, o) {
    const c = { n, placed: 0, fell: 0, hit: 0, spilled: 0, miss: 0, err: 0, phi: [], runs: [] };
    for (let k = 0; k < n; k++) {
      const r = episode(mode, f, (seed0 || 1) + k, o); c[r.out]++; c.phi.push(r.phiMax); c.runs.push(r.out);
      if (r.ok) c.err += Math.abs(r.err);
      yield { it: k + 1, of: n };
    }
    c.err = c.placed ? c.err / c.placed : null;
    return c;
  }
  /** Прогнать генератор до конца (Node, тесты). */
  function run(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }

  /* ---------- 5. лаборатория 2: демонстрации и две политики ----------
     Оператор ведёт Аду через ту же иерархию: раз в 0,1 с он решает, с какой скоростью идти, по тому, что видел 0,15–0,35 с назад,
     а ноги и равновесие держит контроллер тела. Из каждой записи берутся две пары «наблюдение → действие»:
     A — 50 раз в секунду: что выдал контроллер тела (опора под стопой и цель шага) по состоянию тела и расстоянию до полки;
     B — 10 раз в секунду: какую скорость задал оператор по расстоянию до полки и скорости Ады.
     Первую секунду каждого прогона Аду ведёт оператор, потом — политика. */
  const BC = { T1: 1.0, TEND: 9, HA: 48, HB: 16, STEPS_A: 3000, STEPS_B: 1500, BS_A: 64, BS_B: 32, LR: 3e-3, NTEST: 20, DEMO_SEED: 42 };
  function obsA(S, xStop) { const s = S.feet[S.st], sw = S.feet[1 - S.st]; return [clamp(xStop - S.x, -0.5, 3) / 2, (S.x - s) / 0.2, S.v / 0.5, S.ds ? 1.2 : S.ts / CFG.T, (sw - S.x) / 0.2]; }
  function obsB(S, xStop) { return [clamp(xStop - S.x, -0.5, 3) / 2, S.v / 0.5]; }
  /** Маленькая сеть: слои с утечкой ReLU (0,05) и линейный выход. */
  function mlp(sizes, seed) {
    const r = rng(seed), L = [];
    for (let i = 0; i + 1 < sizes.length; i++) { const n = sizes[i], m = sizes[i + 1], w = new Float64Array(n * m), b = new Float64Array(m), sc = 0.7 * Math.sqrt(2 / n); for (let k = 0; k < w.length; k++) w[k] = randn(r) * sc; L.push({ n, m, w, b }); }
    return L;
  }
  function fwd(net, x, hs) {
    hs = hs || []; hs[0] = x; let h = x;
    for (let l = 0; l < net.length; l++) {
      const { n, m, w, b } = net[l], o = new Float64Array(m), last = l === net.length - 1;
      for (let j = 0; j < m; j++) { let s = b[j]; const jn = j * n; for (let i = 0; i < n; i++) s += w[jn + i] * h[i]; o[j] = last ? s : s > 0 ? s : 0.05 * s; }
      hs[l + 1] = o; h = o;
    }
    return hs;
  }
  /** Обучение по парам (X, Y): средний квадрат ошибки, Adam, мини-пакеты; генератор отдаёт ход обучения. */
  function* trainNet(net, X, Y, o) {
    const r = rng(o.seed), z = () => net.map((L) => ({ w: new Float64Array(L.w.length), b: new Float64Array(L.b.length) })), m1 = z(), m2 = z(), g = z(), hs = [];
    const b1 = 0.9, b2 = 0.999; let p1 = 1, p2 = 1, loss = 0;
    for (let it = 0; it < o.steps; it++) {
      for (const Gl of g) { Gl.w.fill(0); Gl.b.fill(0); }
      let ls = 0;
      for (let k = 0; k < o.bs; k++) {
        const idx = Math.floor(r() * X.length); fwd(net, X[idx], hs); const out = hs[net.length], y = Y[idx]; let d = new Float64Array(out.length);
        for (let j = 0; j < d.length; j++) { const e = out[j] - y[j]; ls += e * e; d[j] = 2 * e / o.bs; }
        for (let l = net.length - 1; l >= 0; l--) {
          const { n, m, w } = net[l], hin = hs[l], dn = new Float64Array(n), Gl = g[l];
          for (let j = 0; j < m; j++) { const dj = d[j]; if (dj === 0) continue; Gl.b[j] += dj; const jn = j * n; for (let i = 0; i < n; i++) { Gl.w[jn + i] += dj * hin[i]; dn[i] += dj * w[jn + i]; } }
          if (l > 0) for (let i = 0; i < n; i++) if (!(hs[l][i] > 0)) dn[i] *= 0.05;
          d = dn;
        }
      }
      loss = ls / o.bs;
      p1 *= b1; p2 *= b2;
      const lr = o.lr * (it < o.steps * 0.6 ? 1 : it < o.steps * 0.85 ? 0.3 : 0.1), c1 = 1 / (1 - p1), c2 = 1 / (1 - p2);
      for (let l = 0; l < net.length; l++) for (const key of ['w', 'b']) {
        const P0 = net[l][key], Gk = g[l][key], M1 = m1[l][key], M2 = m2[l][key];
        for (let i = 0; i < P0.length; i++) { const gi = Gk[i]; M1[i] = b1 * M1[i] + (1 - b1) * gi; M2[i] = b2 * M2[i] + (1 - b2) * gi * gi; P0[i] -= lr * (M1[i] * c1) / (Math.sqrt(M2[i] * c2) + 1e-8); }
      }
      if ((it & 63) === 63) yield { it: it + 1, of: o.steps, loss };
    }
    return { net, loss };
  }
  /** Прогон лабораторий 2: who — 'op' (оператор, запись демонстраций), 'A' или 'B'. o: { pushes, rec, netA, netB, keep }. */
  function bcEpisode(who, xStop, seed, o) {
    o = o || {};
    const S = newState(0); S.slot = xStop + CFG.SLOT - CFG.XSTOP;
    const R = rng(seed * 104729 + 7), pushes = o.pushes ? makePushes(seed * 31 + 5, { t0: BC.T1 + 0.3, dvMin: 0.1, dvMax: 0.3, rate: 0.6, tEnd: BC.TEND }) : [];
    const op = { vmax: 0.35 + 0.15 * R(), k: 1.0 + 0.8 * R(), react: 0.15 + 0.2 * R() };
    let E = entryOf(S, 0), nextCtl = 0, nextTop = 0, vcmd = 0, end = null;
    const recA = [], recB = [], hist = [], frames = [], hs = [];
    let vMax = 0;
    const nMax = Math.round(BC.TEND / CFG.DT);
    for (let n = 0; n < nMax; n++) {
      const t = S.t, cur = t < BC.T1 - 1e-9 ? 'op' : who;
      hist.push(S.x, S.v); if (hist.length > 400) hist.splice(0, 2);
      if (t >= nextTop - 1e-9) {
        if (cur === 'op') {
          const lag = Math.min(hist.length / 2 - 1, Math.round(op.react / CFG.DT)), j = hist.length - 2 - 2 * lag, d = xStop - (hist[j] + hist[j + 1] * op.react);
          vcmd = d < 0.03 ? 0 : clamp(op.k * d, 0, op.vmax);
          if (o.rec && t >= BC.T1 - 1e-9) recB.push([obsB(S, xStop), [vcmd / 0.5]]);
        } else if (cur === 'B') { fwd(o.netB, obsB(S, xStop), hs); vcmd = clamp(hs[o.netB.length][0] * 0.5, 0, 0.6); if (vcmd < 0.05) vcmd = 0; }
        nextTop += 0.1;
      }
      if (t >= nextCtl - 1e-9 || S.td) {
        if (cur === 'A') {
          fwd(o.netA, obsA(S, xStop), hs); const a = hs[o.netA.length];
          if (S.ds) { const lo = Math.min(S.feet[0], S.feet[1]) - B.FH, hi = Math.max(S.feet[0], S.feet[1]) + B.FT; E = { ds: true, sid: S.sid, p: clamp(S.x + a[0] * 0.1, lo, hi), t, xr: S.x, vr: S.v, hx: S.hs + CFG.CARRY, hxv: S.hsv }; }
          else { const s = S.feet[S.st], f = S.x + a[1] * 0.2; E = { ds: false, st: S.st, sid: S.sid, p: clamp(s + a[0] * 0.1, s - B.FH, s + B.FT), f, tTD: t + Math.max(0.004, CFG.T - S.ts), stop: Math.abs(f - s) < 0.06, t, xr: S.x, vr: S.v, hx: S.hs + CFG.CARRY, hxv: S.hsv }; }
        } else {
          E = entryOf(S, S.stopped != null ? 0 : vcmd);
          if (o.rec && cur === 'op' && t >= BC.T1 - 1e-9) { const s = S.feet[S.st]; recA.push([obsA(S, xStop), [E.ds ? (E.p - S.x) / 0.1 : (E.p - s) / 0.1, E.ds ? 0 : (E.f - S.x) / 0.2]]); }
        }
        if (t >= nextCtl - 1e-9) nextCtl += CFG.CDT; S.td = false;
        if (o.keep && Math.abs(t / CFG.CDT - Math.round(t / CFG.CDT)) < 1e-6) frames.push(snap(S, E));
      }
      physStep(S, E, forceAt(pushes, t), 'world'); if (S.fell == null && S.v > vMax) vMax = S.v;
      if (S.stopped == null && S.fell == null && S.hit == null && S.ds && Math.abs(S.v) < 0.02 && Math.abs(S.x - xStop) < CFG.WIN && S.t > 1) { S.stopped = S.t; S.place = S.t; S.pr = S.hx; S.prv = S.hv; }
      if (S.place != null && S.placed == null && S.t >= S.place + CFG.PLACE - 1e-9) S.placed = S.t;
      if (end == null && (S.fell != null || S.placed != null || S.hit != null)) end = S.t + (S.fell != null ? 0.9 : 0.4);
      if (end != null && S.t >= end - 1e-9) break;
    }
    if (o.keep) frames.push(snap(S, E));
    const out = outcome(S);
    return { who, out, hit: S.hit, placed: S.placed, spilled: S.spilled, ok: out === 'placed', fell: S.fell, fellDir: S.fellDir, stopped: S.stopped, err: S.stopped != null ? S.x - xStop : null, vMax, xStop, recA, recB, frames: o.keep ? frames : null, pushes };
  }
  /** Место остановки в демонстрации i и в проверке k. */
  const demoStop = (R) => 1.4 + R() * 1.0, testStop = (k) => 1.5 + 0.9 * ((k * 0.6180339887498949) % 1);
  /** Демонстрации: n прогонов оператора; pushes — толкать ли Аду во время записи. */
  function demos(n, pushes) {
    const R = rng(BC.DEMO_SEED), XA = [], YA = [], XB = [], YB = [];
    let vMax = 0, ok = 0;
    for (let i = 0; i < n; i++) { const xs = demoStop(R), r = bcEpisode('op', xs, 100 + i, { rec: true, pushes }); for (const [x, y] of r.recA) { XA.push(x); YA.push(y); } for (const [x, y] of r.recB) { XB.push(x); YB.push(y); } if (r.vMax > vMax) vMax = r.vMax; if (r.ok) ok++; }
    return { XA, YA, XB, YB, vMax, ok };
  }
  /** Опыт целиком: демонстрации, обучение обеих политик, проверка на NTEST прогонах без толчков и с толчками. Генератор: ход обучения. */
  function* bcExperiment(n, o) {
    o = Object.assign({ demoPush: false, seed: CFG.SEED }, o || {});
    const D = demos(n, o.demoPush);
    yield { stage: 'data', it: 0, of: 1 };
    const netA = mlp([5, BC.HA, BC.HA, 2], o.seed), netB = mlp([2, BC.HB, 1], o.seed + 1000);
    const gA = trainNet(netA, D.XA, D.YA, { steps: BC.STEPS_A, bs: BC.BS_A, lr: BC.LR, seed: o.seed * 7 + 5 });
    let r; while (!(r = gA.next()).done) yield { stage: 'A', it: r.value.it, of: BC.STEPS_A };
    const lossA = r.value.loss;
    const gB = trainNet(netB, D.XB, D.YB, { steps: BC.STEPS_B, bs: BC.BS_B, lr: BC.LR, seed: o.seed * 7 + 9 });
    while (!(r = gB.next()).done) yield { stage: 'B', it: r.value.it, of: BC.STEPS_B };
    const res = {};
    for (const push of [false, true]) {
      const c = { A: { placed: 0, fell: 0, hit: 0, spilled: 0, miss: 0, runs: [] }, B: { placed: 0, fell: 0, hit: 0, spilled: 0, miss: 0, runs: [] } };
      for (let k = 0; k < BC.NTEST; k++) {
        const xs = testStop(k), ra = bcEpisode('A', xs, 500 + k, { pushes: push, netA }), rb = bcEpisode('B', xs, 500 + k, { pushes: push, netB });
        c.A[ra.out]++; c.A.runs.push(ra.out); c.B[rb.out]++; c.B.runs.push(rb.out);
      }
      res[push ? 'push' : 'calm'] = c;
      yield { stage: 'test', it: push ? 2 : 1, of: 2 };
    }
    return { n, demoPush: o.demoPush, seed: o.seed, pairsA: D.XA.length, pairsB: D.XB.length, demoVMax: D.vMax, demoOk: D.ok, lossA, netA, netB, res };
  }

  /* ---------- 6. поза для рисунка (AdaBody из shared/ada-legs.js) ----------
     Кадр AdaBody: центр корпуса, наклон, бедро, колено, голеностоп дальней ноги (стопа 0), потом ближней (стопа 1); стопы параллельны полу.
     Таз на высоте PZ, но не выше, чем дотягиваются опорные ноги. Ближняя рука держит чашку: углы плеча и локтя — обратная кинематика. */
  const acos = (c) => DM.acos(c);
  function legAngles(hx, hz, ax, az) {
    const dx = ax - hx, dz = hz - az, d = Math.min(Math.sqrt(dx * dx + dz * dz), (B.L1 + B.L2) * 0.9995), al = acos(d / (B.L1 + B.L2)), aT = DM.atan2(dx, dz) + al;
    return [aT, 2 * al, 2 * al - aT];
  }
  function poseOf(fr) {
    const z0 = B.HA + (fr.st === 0 || fr.ds ? 0 : fr.lift), z1 = B.HA + (fr.st === 1 || fr.ds ? 0 : fr.lift), L = B.L1 + B.L2;
    let pz = B.PZ;
    for (const k of fr.ds ? [0, 1] : [fr.st]) { const dx = (k ? fr.f1 : fr.f0) - fr.x, zMax = (k ? z1 : z0) + Math.sqrt(Math.max(0, L * L * 0.998 - dx * dx)); if (zMax < pz) pz = zMax; }
    const lf = legAngles(fr.x, pz, fr.f0, z0), ln = legAngles(fr.x, pz, fr.f1, z1);
    const f = [fr.x, pz + B.LT / 2, 0, lf[0], lf[1], lf[2], ln[0], ln[1], ln[2], fr.v];
    // рука с чашкой: кисть (hx, hz) относительно плеча
    const hz = fr.hz == null ? CFG.CARRYZ : fr.hz, sx = fr.x, sz = pz + B.LS, rx = fr.hx - sx, rz = hz - sz, dr = Math.sqrt(rx * rx + rz * rz);
    const d = clamp(dr, 0.06, (B.LUA + B.LFA) * 0.999), ph = DM.atan2(rx, -rz), be = acos(clamp((B.LUA * B.LUA + d * d - B.LFA * B.LFA) / (2 * B.LUA * d), -1, 1)), a = ph - be;
    const ex = sx + DM.sincos(a)[0] * B.LUA, ez = sz - DM.sincos(a)[1] * B.LUA, tx = sx + rx * d / Math.max(dr, 1e-9), tz = sz + rz * d / Math.max(dr, 1e-9), a2 = DM.atan2(tx - ex, -(tz - ez));
    const arms = [-0.35 * f[3] - 0.1, 0.35, a, a2 - a];
    return { f, arms, pz, hand: [tx, tz], ankles: [[fr.f0, z0], [fr.f1, z1]] };
  }

  /*@DATA@*/
  /** Лаборатория 2, посчитано в Node (node tools/lesson64.js --train): сколько прогонов из 20 закончились чашкой на полке — для каждого числа
   *  записей, без толчков при записи [0] и с толчками [1], на зёрнах обучения 1–10; calm/push — проверка без толчков и с толчками, A/B — политики. */
  const DATA = { bc: [
    { 5: { calmA: [17, 1, 18, 5, 0, 12, 3, 0, 2, 6], pushA: [5, 0, 13, 5, 5, 1, 4, 1, 1, 5], calmB: [20, 20, 20, 20, 20, 20, 10, 20, 20, 20], pushB: [20, 20, 18, 20, 13, 18, 10, 20, 17, 20] }, 10: { calmA: [6, 2, 6, 4, 3, 2, 5, 0, 14, 3], pushA: [3, 2, 2, 2, 5, 0, 3, 0, 9, 3], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [20, 19, 17, 19, 17, 19, 20, 19, 18, 20] }, 20: { calmA: [6, 1, 0, 12, 1, 5, 0, 0, 2, 9], pushA: [1, 0, 1, 6, 3, 4, 3, 0, 3, 1], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [20, 19, 17, 20, 15, 19, 20, 19, 18, 20] }, 40: { calmA: [5, 8, 0, 0, 0, 2, 0, 0, 2, 0], pushA: [1, 3, 1, 4, 0, 2, 1, 0, 1, 4], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [20, 20, 17, 20, 13, 20, 20, 19, 18, 20] } },
    { 5: { calmA: [15, 0, 20, 20, 20, 20, 4, 16, 11, 12], pushA: [9, 6, 18, 13, 19, 18, 9, 15, 8, 14], calmB: [20, 20, 20, 20, 20, 20, 14, 20, 20, 20], pushB: [20, 18, 18, 19, 20, 20, 15, 20, 20, 20] }, 10: { calmA: [20, 19, 0, 19, 20, 15, 20, 20, 0, 20], pushA: [16, 16, 5, 17, 17, 16, 19, 16, 6, 20], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [18, 18, 17, 19, 20, 19, 20, 19, 20, 19] }, 20: { calmA: [20, 20, 20, 20, 20, 8, 15, 20, 18, 20], pushA: [20, 18, 17, 17, 18, 11, 19, 20, 15, 19], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [19, 17, 18, 19, 19, 20, 20, 20, 19, 19] }, 40: { calmA: [20, 18, 10, 20, 9, 11, 13, 20, 20, 20], pushA: [19, 16, 15, 20, 17, 13, 12, 18, 15, 20], calmB: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20], pushB: [20, 19, 19, 19, 20, 20, 17, 20, 19, 19] } },
  ] };
  /*@/DATA@*/
  const API = { DM, rng, randn, B, CFG, BC, W, WS, SPILL, prop, newState, clone, plan, entryOf, physStep, intent, makePushes, forceAt, episode, series, run,
    obsA, obsB, mlp, fwd, trainNet, bcEpisode, demos, bcExperiment, testStop, poseOf, legAngles, snap, DATA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.L64 = API;
})(typeof window !== 'undefined' ? window : globalThis);
