/* =====================================================================
   l62/engine.js — движок урока 6.2 «Имитация движений человека». Без DOM:
   в браузере — window.L62, в Node — require. Все случайности — с зерном,
   вся математика — своя (DM), поэтому Node, Chrome и Safari дают одни числа.

   1) Скелет (раздел 1): плоская модель, вид сбоку. Корпус с головой, две
      руки (плечо, локоть), две ноги (бедро, колено, голеностоп, стопа с
      пяткой и носком). Один и тот же скелет с разными длинами звеньев и
      пределами суставов описывает человека и Аду. У Ады те же длины звеньев
      и пределы суставов, что у тела Ады в уроке 6.1 (L61.BODY, L61.LIM), и
      тот же рисунок (AdaBody в shared/ada-legs.js); углы суставов отсчитываются
      так же, как в 6.1.
   2) Записи движений (раздел 2): синтетические — кривые углов суставов по
      фазе, корень (таз) достраивается кинематически: опорная стопа стоит на
      полу и не скользит. Ходьба (обычная, медленная, быстрая), присед, махи рукой.
   3) Ретаргетинг (раздел 3): копирование углов; те же углы в пределах суставов
      Ады с тазом на полу; ключевые точки, пределы и пол. Проверка равновесия:
      центр масс Ады над опорой (для медленных движений).
   4) Физика (раздел 4): проще, чем в 6.1, чтобы обучение двух политик
      укладывалось в секунды в браузере. Корпус — твёрдое тело с массой всей
      Ады (28 кг), ноги без массы, суставы следуют ПД-регулятору по целевому
      углу, стопа давит на пол пружиной с трением. Шаг 2,5 мс, политика 50 Гц.
   5) Политика (раздел 5): ритм по фазе (ряд Фурье на сустав) плюс
      обратная связь по корпусу и команде скорости. Одна и та же семья
      политик учится двумя наградами: трекинг записи (DeepMimic) и
      дискриминатор (AMP). Обучение — поиск по популяции (ARS), как в лаборатории 3
      урока 6.1.
   6) Проверка (раздел 6): прогон при разных командах скорости, ошибка позы
      после выравнивания по фазе, расстояние, падения.
   ===================================================================== */
'use strict';
(function (root) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  /* ---------- 0. детерминированная математика (как в 5.2–5.7) ---------- */
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
    function acos(c) { c = clamp(c, -1, 1); return atan2(Math.sqrt(1 - c * c), c); }
    return { exp, log, tanh, sincos, atan2, acos, PI };
  })();
  const PI = DM.PI, TAU = 2 * PI;
  /** Случайность с зерном (mulberry32, как HeroKit.rng). */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * DM.log(u)) * DM.sincos(TAU * r())[1]; }
  const sq = (x) => x * x;
  const deg = (r) => r * 180 / PI, rad = (d) => d * PI / 180;
  /** Кольцевая разность фаз в [−0,5; 0,5). */
  const dphase = (a, b) => { let d = a - b; d -= Math.floor(d + 0.5); return d; };
  /** Периодический «бугор» по фазе: exp(−(Δφ/w)²). */
  const bump = (phi, c, w) => DM.exp(-sq(dphase(phi, c) / w));

  /* ---------- 1. скелет: плоская модель, вид сбоку ----------
     Точки: таз H (корень). Корпус идёт от таза вверх под углом θ к вертикали (θ > 0 — наклон вперёд):
     e = (sin θ, cos θ); верх корпуса T = H + LT·e, плечевой сустав S = H + LS·e, центр головы H + HC·e.
     Углы суставов — как в уроке 6.1: бедро q_h относительно корпуса (сгиб вперёд +), колено q_k ≥ 0 (сгиб),
     голеностоп q_a (носок вверх +). Направления звеньев от вертикали вниз, против часовой стрелки (вперёд +):
     бедро α1 = q_h − θ, голень α2 = α1 − q_k, стопа β = α2 + q_a (0 — стопа лежит на полу).
     Руки: плечо q_s (вперёд +), локоть q_e (сгиб +): γ1 = q_s − θ, γ2 = γ1 + q_e. +x — вперёд, +y — вверх.
     HA — высота голеностопа над подошвой, FH и FT — пятка позади и носок впереди голеностопа. */
  const HUMAN = { name: 'человек', L1: 0.45, L2: 0.43, HA: 0.08, FH: 0.06, FT: 0.17, LT: 0.52, LS: 0.52, HC: 0.73, RH: 0.11, LUA: 0.30, LFA: 0.27, W: 0.11,
    LIM: { hip: [rad(-30), rad(125)], knee: [0, rad(145)], ankle: [rad(-45), rad(35)], sh: [rad(-60), rad(180)], el: [0, rad(150)] } };
  /** Ада — как в уроке 6.1 (L61.BODY, L61.LIM и рисунок AdaBody): бедро и голень по 0,30 м, голеностоп на 5 см над
      подошвой, пятка на 6 см позади голеностопа, носок на 12 см впереди, корпус 0,46 м, голова высотой 0,15 м над ним
      (центр на 0,555 м выше таза), плечевой сустав на 0,368 м выше таза, плечо 0,20 м, предплечье 0,17 м. Пределы
      бедра −1,0…1,5 рад, колена 0…2,3, голеностопа −0,9…0,9; пределов рук в 6.1 нет — здесь свои. */
  const ADA = { name: 'Ада', L1: 0.30, L2: 0.30, HA: 0.05, FH: 0.06, FT: 0.12, LT: 0.46, LS: 0.368, HC: 0.555, RH: 0.075, LUA: 0.20, LFA: 0.17, W: 0.22,
    LIM: { hip: [-1.0, 1.5], knee: [0, 2.3], ankle: [-0.9, 0.9], sh: [rad(-45), rad(160)], el: [0, rad(135)] } };
  const legLen = (B) => B.L1 + B.L2 + B.HA;
  const JN = ['hip', 'knee', 'ankle'], NJ = 6;   // q = [бедро L, колено L, голеностоп L, бедро R, колено R, голеностоп R]
  /** Прямая кинематика: pose = { x, y, th, q[6], arm[4] } → точки (метры). L — дальняя от зрителя нога и рука, R — ближняя. */
  const PTS = ['hip', 'top', 'sh', 'head', 'crown', 'kneeL', 'ankleL', 'heelL', 'toeL', 'elbowL', 'handL', 'kneeR', 'ankleR', 'heelR', 'toeR', 'elbowR', 'handR'];
  const newPoints = () => { const o = {}; for (const k of PTS) o[k] = [0, 0]; return o; };
  const set2 = (p, x, y) => { p[0] = x; p[1] = y; };
  function fk(B, pose, out, legsOnly) {
    const o = out || newPoints(); const [sT, cT] = DM.sincos(pose.th), x = pose.x, y = pose.y;
    set2(o.hip, x, y); set2(o.top, x + B.LT * sT, y + B.LT * cT);
    const shx = x + B.LS * sT, shy = y + B.LS * cT; set2(o.sh, shx, shy);
    set2(o.head, x + B.HC * sT, y + B.HC * cT); set2(o.crown, x + (B.HC + B.RH) * sT, y + (B.HC + B.RH) * cT);
    for (let s = 0; s < 2; s++) {
      const qh = pose.q[3 * s], qk = pose.q[3 * s + 1], qa = pose.q[3 * s + 2];
      const a1 = qh - pose.th, a2 = a1 - qk, b = a2 + qa, [s1, c1] = DM.sincos(a1), [s2, c2] = DM.sincos(a2), [sb, cb] = DM.sincos(b);
      const kx = x + B.L1 * s1, ky = y - B.L1 * c1, ax = kx + B.L2 * s2, ay = ky - B.L2 * c2;
      const cx = ax + B.HA * sb, cy = ay - B.HA * cb;   // точка подошвы под голеностопом
      const K = s ? 'R' : 'L';
      set2(o['knee' + K], kx, ky); set2(o['ankle' + K], ax, ay); set2(o['heel' + K], cx - B.FH * cb, cy - B.FH * sb); set2(o['toe' + K], cx + B.FT * cb, cy + B.FT * sb);
      if (legsOnly) continue;
      const qs = pose.arm[2 * s], qe = pose.arm[2 * s + 1], g1 = qs - pose.th, g2 = g1 + qe, [sg1, cg1] = DM.sincos(g1), [sg2, cg2] = DM.sincos(g2);
      const ex = shx + B.LUA * sg1, ey = shy - B.LUA * cg1;
      set2(o['elbow' + K], ex, ey); set2(o['hand' + K], ex + B.LFA * sg2, ey - B.LFA * cg2);
    }
    return o;
  }
  const SOLE = ['heelL', 'toeL', 'heelR', 'toeR'], CONTACT = ['heelL', 'toeL', 'heelR', 'toeR', 'top', 'crown'];
  /** Высота самой низкой точки подошвы каждой ноги над полом (пол — y = 0). */
  function soleMin(P, s) { const K = s ? 'R' : 'L'; return Math.min(P['heel' + K][1], P['toe' + K][1]); }
  /** Обратная кинематика ноги: цель — положение голеностопа относительно таза (dx, dy) в мире и наклон стопы β; возвращает [q_h, q_k, q_a] без учёта пределов. */
  function ikLeg(B, th, dx, dy, beta) {
    const d2 = dx * dx + dy * dy, L = Math.sqrt(d2), reach = B.L1 + B.L2, dmin = Math.abs(B.L1 - B.L2) + 1e-6;
    const Lc = clamp(L, dmin, reach - 1e-9), s = L > 1e-9 ? Lc / L : 1, ex = dx * s, ey = dy * s;   // недостижимое — тянем вдоль луча
    const ck = clamp((ex * ex + ey * ey - B.L1 * B.L1 - B.L2 * B.L2) / (2 * B.L1 * B.L2), -1, 1), qk = DM.acos(ck);   // угол сгиба колена (0 — прямая нога)
    const [sk, ck2] = DM.sincos(qk);
    // направление на голеностоп от вертикали вниз: atan2(ex, −ey); бедро = это направление + угол между бедром и лучом
    const a1 = DM.atan2(ex, -ey) + DM.atan2(B.L2 * sk, B.L1 + B.L2 * ck2);
    const qh = a1 + th, a2 = a1 - qk;
    return [qh, qk, beta - a2];
  }
  /** Обрезать углы по пределам тела; возвращает суммарное превышение (рад). */
  function clampJoints(B, q, arm) {
    let over = 0;
    for (let s = 0; s < 2; s++) for (let j = 0; j < 3; j++) { const lim = B.LIM[JN[j]], i = 3 * s + j; if (q[i] < lim[0]) { over += lim[0] - q[i]; q[i] = lim[0]; } else if (q[i] > lim[1]) { over += q[i] - lim[1]; q[i] = lim[1]; } }
    if (arm) for (let s = 0; s < 2; s++) { const ls = B.LIM.sh, le = B.LIM.el; const i = 2 * s; if (arm[i] < ls[0]) { over += ls[0] - arm[i]; arm[i] = ls[0]; } else if (arm[i] > ls[1]) { over += arm[i] - ls[1]; arm[i] = ls[1]; } if (arm[i + 1] < le[0]) { over += le[0] - arm[i + 1]; arm[i + 1] = le[0]; } else if (arm[i + 1] > le[1]) { over += arm[i + 1] - le[1]; arm[i + 1] = le[1]; } }
    return over;
  }
  /** Превышение пределов по суставам без обрезки: массив из 6 чисел (рад) для ног. */
  function overLimits(B, q) { const o = new Float64Array(NJ); for (let s = 0; s < 2; s++) for (let j = 0; j < 3; j++) { const lim = B.LIM[JN[j]], i = 3 * s + j; o[i] = q[i] < lim[0] ? lim[0] - q[i] : q[i] > lim[1] ? q[i] - lim[1] : 0; } return o; }

  /* ---------- 2. записи движений: синтетические кривые углов по фазе ----------
     Запись — не чужой mocap, а наши параметрические кривые: углы суставов как функции фазы φ ∈ [0, 1),
     похожие на человеческую ходьбу (бедро — косинус, колено — два «бугра», голеностоп — толчок),
     плюс присед и махи рукой. Корень (таз) достраивается кинематически (clipOf). */
  const FPS = 50;   // кадров в секунду в записи и шагов политики в секунду
  /** Ходьба: цикл T секунд, a — размах относительно обычной ходьбы (бедро, толчок голеностопа и руки — в a раз,
      сгиб колена в переносе — в 0,6 + 0,4a раза). Обычная ходьба — T = 1,2 с, a = 1; медленная и быстрая — для набора AMP. */
  function walkMotion(name, T, a) {
    return { name, T, cyclic: true, twoLeg: true,
      leg(phi) { return [0.10 + 0.36 * a * DM.sincos(TAU * phi)[1], 0.06 + 0.22 * bump(phi, 0.14, 0.09) + 1.05 * (0.6 + 0.4 * a) * bump(phi, 0.72, 0.12), -0.04 + 0.16 * bump(phi, 0.45, 0.16) - 0.42 * a * bump(phi, 0.62, 0.07) + 0.10 * bump(phi, 0.85, 0.1)]; },
      torso(phi) { return 0.06 + 0.02 * DM.sincos(2 * TAU * phi)[1]; },
      arm(phi) { return [-0.42 * a * DM.sincos(TAU * phi)[1], 0.32 + 0.14 * (1 - DM.sincos(TAU * phi)[1]) / 2]; } };
  }
  const MOTIONS = {
    walk: walkMotion('ходьба', 1.2, 1),
    walkSlow: walkMotion('медленная ходьба', 1.4, 0.95),
    walkFast: walkMotion('быстрая ходьба', 1.0, 1.05),
    // присед с пятками на полу: в нижней точке бедро почти горизонтально (α1 = 1,40 рад), голень наклонена вперёд на 0,5 рад,
    // корпус — на 0,75 рад; углы суставов: бедро 1,40 + 0,75 = 2,15 (123° при пределе человека 125°), колено 1,40 + 0,5,
    // голеностоп 0,5 (стопа лежит: β = 0). Центр масс человека (доли масс звеньев по Winter) всё время над стопой.
    squat: { name: 'присед', T: 2.4, cyclic: true,
      leg(phi) { const s = (1 - DM.sincos(TAU * phi)[1]) / 2; return [2.15 * s, 1.90 * s, 0.50 * s]; },
      torso(phi) { const s = (1 - DM.sincos(TAU * phi)[1]) / 2; return 0.75 * s; },
      arm(phi) { const s = (1 - DM.sincos(TAU * phi)[1]) / 2; return [1.4 * s, 0.1]; } },
    // подъём на две ступеньки по 0,17 м приставным шагом и спуск: стопы ставятся на пол и ступеньки, углы — обратной кинематикой (stepHuman)
    step: { name: 'две ступеньки', T: 6.0, cyclic: true, step: true },
    wave: { name: 'махи рукой', T: 1.6, cyclic: true,
      leg() { return [0.05, 0.08, 0.06]; },   // стопа лежит на полу: β = 0,05 − 0,03 − 0,08 + 0,06 = 0
      torso() { return 0.03; },
      arm(phi, side) { if (side === 0) return [0.1, 0.25]; return [2.65, 1.1 + 0.55 * DM.sincos(2 * TAU * phi)[0]]; } },
  };
  /** Углы одного кадра: ноги (левая по φ, правая по φ + 0,5 для ходьбы; для приседа и махов обе по φ), корпус, руки. */
  function frameAngles(M, phi) {
    const q = new Float64Array(NJ), arm = new Float64Array(4), twoLeg = !!M.twoLeg;
    for (let s = 0; s < 2; s++) {
      const ph = twoLeg ? (phi + 0.5 * s) % 1 : phi, l = M.leg(ph, s), a = M.arm(ph, s);
      q[3 * s] = l[0]; q[3 * s + 1] = l[1]; q[3 * s + 2] = l[2]; arm[2 * s] = a[0]; arm[2 * s + 1] = a[1];
    }
    return { q, arm, th: M.torso(phi) };
  }
  /** Запись: N кадров за цикл с корнем, достроенным кинематически: самая низкая точка подошвы на полу; опорная стопа
      (та, что ниже) не скользит — таз сдвигается так, чтобы её точка на полу стояла на месте. Корень усредняется по циклу
      в скорость v (м/с); для ходьбы v > 0, для приседа и махов v = 0. */
  function clipOf(B, key, opts) {
    opts = opts || {}; const M = MOTIONS[key], N = Math.round(M.T * FPS), frames = [];
    if (M.step) {
      for (let k = 0; k < N; k++) { const h = stepHuman(k / N); frames.push({ phi: k / N, x: h.x, y: h.y, th: h.th, q: h.q, arm: h.arm }); }
      for (let k = 0; k < N; k++) { const a = frames[k], b = frames[(k + 1) % N]; a.qd = new Float64Array(NJ); for (let j = 0; j < NJ; j++) a.qd[j] = (b.q[j] - a.q[j]) * FPS; }
      return { key, name: M.name, B, T: M.T, N, frames, v: 0, cyclic: true, f: 1 / M.T, ground: groundStep };
    }
    let x = 0, prevP = null, prevStance = -1;
    for (let k = 0; k < N; k++) {
      const phi = k / N, A = frameAngles(M, phi);
      if (opts.limits) clampJoints(B, A.q, A.arm);
      const pose = { x: 0, y: 0, th: A.th, q: A.q, arm: A.arm }, P = fk(B, pose);
      const mL = soleMin(P, 0), mR = soleMin(P, 1), stance = mL <= mR ? 0 : 1, y = -Math.min(mL, mR);
      // не скользить: точка подошвы опорной ноги (ближе к полу) остаётся на месте
      const K = stance ? 'R' : 'L', pt = P['heel' + K][1] <= P['toe' + K][1] ? 'heel' + K : 'toe' + K;
      if (prevP && prevStance === stance) x -= P[pt][0] - prevP[pt][0];
      else if (prevP) { const pp = prevP[pt]; x -= P[pt][0] - pp[0]; }   // смена опоры: новая стопа встаёт там, где была в прошлом кадре
      prevP = P; prevStance = stance;
      frames.push({ phi, x, y, th: A.th, q: A.q, arm: A.arm });
    }
    // скорость и сброс корня к нулю в первом кадре
    const x0 = frames[0].x; for (const f of frames) f.x -= x0;
    const v = (frames[N - 1].x - frames[0].x + (frames[1].x - frames[0].x)) / M.T;   // за цикл, с замыканием
    const vClip = M.twoLeg ? v : 0;
    // скорости суставов конечными разностями (для награды и признаков дискриминатора)
    for (let k = 0; k < N; k++) { const a = frames[k], b = frames[(k + 1) % N]; a.qd = new Float64Array(NJ); for (let j = 0; j < NJ; j++) a.qd[j] = (b.q[j] - a.q[j]) * FPS; }
    return { key, name: M.name, B, T: M.T, N, frames, v: vClip, cyclic: M.cyclic, f: 1 / M.T };
  }
  /** Кадр записи в фазе φ (линейная интерполяция по кольцу). */
  function clipAt(C, phi, out) {
    phi -= Math.floor(phi); const t = phi * C.N, k = Math.floor(t) % C.N, k2 = (k + 1) % C.N, u = t - Math.floor(t), a = C.frames[k], b = C.frames[k2];
    const o = out || { q: new Float64Array(NJ), qd: new Float64Array(NJ), arm: new Float64Array(4) };
    for (let j = 0; j < NJ; j++) { o.q[j] = a.q[j] + (b.q[j] - a.q[j]) * u; o.qd[j] = a.qd[j] + (b.qd[j] - a.qd[j]) * u; }
    for (let j = 0; j < 4; j++) o.arm[j] = a.arm[j] + (b.arm[j] - a.arm[j]) * u;
    o.th = a.th + (b.th - a.th) * u; o.y = a.y + (b.y - a.y) * u;
    o.x = k2 === 0 ? a.x + (b.x + C.v * C.T - a.x) * u : a.x + (b.x - a.x) * u;   // через замыкание цикла
    o.phi = phi; return o;
  }

  /* ---------- 3. ретаргетинг человек → Ада ----------
     Мир не масштабируется: пол и ступенька у человека и у Ады одни и те же (groundOf).
     copy   — углы суставов как есть, таз по масштабу длины ног s = 0,65 / 0,96 (так переносили записи DeepMimic на Atlas
              и ExBody на H1);
     points — ключевые точки: голеностопы и наклон стоп — там же относительно опор, где у человека: на ровном полу —
              положение голеностопа относительно таза в масштабе (как H2O: положения точек, а не углы), у ступеньки —
              на настоящих полу и ступеньке, таз — как у человека в масштабе, но не выше, чем дотягиваются ноги;
              углы бедра и колена — обратной кинематикой ноги;
     fix    — то же, а бедро в пределе: корпус наклоняется меньше на недостающий угол (направление бедра и стопы не
              меняются, руки сохраняют направление в мире), остальное обрезается по пределам, таз ставится на опору.
     Для каждой позы Ады считается центр масс по массам звеньев из урока 6.1 (корпус с головой и руками 18 кг, бедро
     2,6, голень 1,8, стопа 0,6) и опора — отрезок под точками подошвы, которые касаются пола или ступеньки (ближе 1 см). */
  const METHODS_RT = ['copy', 'points', 'fix'];
  const MASS = { torso: 18, thigh: 2.6, shin: 1.8, foot: 0.6 };
  const flat = () => 0;
  const groundOf = (C) => (C && C.ground) || flat;
  /** Наименьший зазор подошвы ноги s над опорой (пол или ступенька) в точках пятки и носка. */
  function gapMin(P, sd, g) { const K = sd ? 'R' : 'L', h = P['heel' + K], t = P['toe' + K]; return Math.min(h[1] - g(h[0]), t[1] - g(t[0])); }
  /** Поставить таз на опору: в кадрах, где у человека стопа на опоре, самая низкая точка подошвы Ады — на опоре. */
  function onFloor(B, pose, Ph, g) {
    if (Math.min(gapMin(Ph, 0, g), gapMin(Ph, 1, g)) < 0.005) { const P = fk(B, pose, null, true); pose.y -= Math.min(gapMin(P, 0, g), gapMin(P, 1, g)); }
  }

  /* ---- две ступеньки: план стоп и таза, углы — обратной кинематикой ----
     Лестница из двух ступенек высотой 0,17 м и глубиной 0,28 м начинается в x = 0. Человек поднимается приставным шагом:
     ближняя к зрителю нога (R) поднимается на месте, переносится над краем ступеньки и опускается на неё, вес переходит
     вперёд, задняя стопа (L) перекатывается на носок и приставляется; так на каждую ступеньку, потом спуск — то же в
     обратном времени. Корпус сильнее всего наклонён вперёд при переносе веса. У человека таз ставится так, чтобы центр масс
     (доли масс звеньев по Winter) был над опорой, а высота таза — не больше, чем дотягиваются ноги. В переносе стопа
     наклоняется вместе с голенью, чтобы голеностоп оставался в пределах. */
  const STEP = { H: 0.17, D: 0.28, xF: -0.24, x1: 0.09, lean0: 0.08, lean1: 0.5, clr: 0.07, heel: 0.6, heelAt: 0.3, slack: 0.985, aUp: 0.45, aDn: 0.7 };
  const groundStep = (x) => (x < 0 ? 0 : STEP.H * Math.min(2, Math.floor(x / STEP.D) + 1));
  const STEP_SPOTS = [{ x: STEP.xF, y: 0 }, { x: STEP.x1, y: STEP.H }, { x: STEP.x1 + STEP.D, y: 2 * STEP.H }];   // места стоп: пол, ступенька 1, ступенька 2
  const STEP_PH = [[0.02, 0.09, 0.155, 0.225], [0.26, 0.33, 0.395, 0.465]];   // от половины цикла: подъём ближней ноги, перенос веса, приставление
  const WINTER = { hat: 0.678, thigh: 0.1, shank: 0.0465, foot: 0.0145, hatAt: 0.29 / 0.52 };   // доли массы; центр головы, рук и корпуса — на 0,56 длины корпуса
  /** Горизонталь центра масс человека (доли Winter). */
  function comHumanX(pose, P) {
    const [sT] = DM.sincos(pose.th); let mx = WINTER.hat * (pose.x + WINTER.hatAt * HUMAN.LT * sT);
    for (const K of ['L', 'R']) mx += WINTER.thigh * (P.hip[0] + P['knee' + K][0]) / 2 + WINTER.shank * (P['knee' + K][0] + P['ankle' + K][0]) / 2 + WINTER.foot * (P['heel' + K][0] + P['toe' + K][0]) / 2;
    return mx;
  }
  const easeStep = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : (1 - DM.sincos(PI * u)[1]) / 2);
  const progStep = (p, a, b) => easeStep((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Голеностоп по точке носка на опоре и наклону стопы β (носок вниз — β < 0). */
  function fromToe(B, tx, ty, beta) { const [sb, cb] = DM.sincos(beta); return { x: tx - B.FT * cb - B.HA * sb, y: ty - B.FT * sb + B.HA * cb, beta }; }
  /** Стопы, наклон корпуса и доля веса на верхней опоре в фазе φ для тела B; стопы — на местах STEP_SPOTS. */
  function stepFeet(B, phi) {
    const s = legLen(B) / legLen(HUMAN), p = phi < 0.5 ? phi : 1 - phi, S = STEP_SPOTS;
    let R = { x: S[0].x, y: S[0].y + B.HA, beta: 0 }, L = R, th = STEP.lean0, w = 0, k0 = 0;
    for (let k = 0; k < 2; k++) {
      const [a, b, c, d] = STEP_PH[k]; if (p < a) break;
      const uR = progStep(p, a, b), uW = progStep(p, b, c), uL = progStep(p, c, d);
      const from = { x: S[k].x, y: S[k].y + B.HA, beta: 0 }, to = { x: S[k + 1].x, y: S[k + 1].y + B.HA, beta: 0 }, top = to.y + STEP.clr * s;
      // перенос: подъём на месте, перенос над краем ступеньки, опускание
      const swing = (a0, u) => { const up = easeStep(u / 0.35), mv = easeStep((u - 0.3) / 0.45), dn = easeStep((u - 0.75) / 0.25);
        return { x: lerp(a0.x, to.x, mv), y: lerp(lerp(a0.y, top, up), to.y, dn), beta: lerp(a0.beta, 0, easeStep((u - 0.2) / 0.6)) + 0.1 * DM.sincos(PI * u)[0], air: true }; };
      R = uR <= 0 ? from : uR >= 1 ? to : swing(from, uR);
      L = uL <= 0 ? fromToe(B, S[k].x + B.FT, S[k].y, -STEP.heel * progStep(uW, STEP.heelAt, 1)) : uL >= 1 ? to : swing(fromToe(B, S[k].x + B.FT, S[k].y, -STEP.heel), uL);
      th = STEP.lean0 + (STEP.lean1 - STEP.lean0) * DM.sincos(PI * Math.min(1, 0.2 * uR + 0.5 * uW + 0.3 * uL))[0];
      w = uL > 0 ? 1 : uW; k0 = k;
    }
    return { s, R, L, th, w, sup: S[k0].y * (1 - w) + S[k0 + 1].y * w };
  }
  /** Углы ног по положению таза и целям стоп; reach — насколько цель дальше вытянутой ноги (м). */
  function stepSolve(B, F, xp, yp) {
    const q = new Float64Array(NJ); let reach = 0;
    for (let sd = 0; sd < 2; sd++) {
      const G = sd ? F.R : F.L, dx = G.x - xp, dy = G.y - yp, d = Math.sqrt(dx * dx + dy * dy); if (d > B.L1 + B.L2) reach = Math.max(reach, d - B.L1 - B.L2);
      let ik = ikLeg(B, F.th, dx, dy, G.beta);
      if (G.air) { const a2 = ik[0] - F.th - ik[1]; ik = ikLeg(B, F.th, dx, dy, clamp(G.beta, a2 - STEP.aDn, a2 + STEP.aUp)); }
      q[3 * sd] = ik[0]; q[3 * sd + 1] = ik[1]; q[3 * sd + 2] = ik[2];
    }
    return { x: xp, y: yp, th: F.th, q, arm: Float64Array.from([0.15, 0.3, 0.15, 0.3]), reach };
  }
  /** Высота таза не больше, чем дотягиваются обе ноги до своих целей. */
  function stepCap(B, F, xp, yp) { for (const G of [F.L, F.R]) { const dx = G.x - xp, r = (B.L1 + B.L2) * STEP.slack, m = Math.sqrt(Math.max(0, r * r - dx * dx)); if (yp - G.y > m) yp = G.y + m; } return yp; }
  /** Поза человека в фазе φ: таз над опорой по центру масс. */
  function stepHuman(phi) {
    const B = HUMAN, F = stepFeet(B, phi), mid = (G) => G.x + (B.FT - B.FH) / 2, target = mid(F.L) * (1 - F.w) + mid(F.R) * F.w;
    let xp = target - 0.05, yp = legLen(B) - 0.02 + F.sup;
    for (let it = 0; it < 30; it++) { yp = stepCap(B, F, xp, yp); const pz = stepSolve(B, F, xp, yp); xp += (target - comHumanX(pz, fk(B, pz))) * 0.8; }
    return stepSolve(B, F, xp, stepCap(B, F, xp, yp));
  }
  /** Ада по ключевым точкам в фазе φ: стопы — там же, где стопы человека, таз — над тем же местом, высота над опорой в масштабе ноги. */
  function stepPoints(B, phi, hf) {
    const F = stepFeet(B, phi), xp = hf.x;
    return stepSolve(B, F, xp, stepCap(B, F, xp, F.sup + (hf.y - F.sup) * F.s));
  }

  function retarget(human, method, B) {
    B = B || ADA; const s = legLen(B) / legLen(human.B), out = [], g = groundOf(human), stepClip = !!MOTIONS[human.key].step;
    for (const f of human.frames) {
      const Ph = fk(human.B, { x: f.x, y: f.y, th: f.th, q: f.q, arm: f.arm });
      let pose, lean = 0;
      if (method === 'copy') pose = { x: f.x * s, y: f.y * s, th: f.th, q: Float64Array.from(f.q), arm: Float64Array.from(f.arm) };
      else {
        if (stepClip) { const pz = stepPoints(B, f.phi, f); pose = { x: pz.x, y: pz.y, th: pz.th, q: pz.q, arm: Float64Array.from(f.arm) }; }
        else {
          // голеностоп относительно таза в масштабе и наклон стопы, как у человека; углы — обратной кинематикой
          const q = new Float64Array(NJ), Pr = fk(human.B, { x: 0, y: 0, th: f.th, q: f.q, arm: f.arm });
          for (let sd = 0; sd < 2; sd++) { const K = sd ? 'R' : 'L', ank = Pr['ankle' + K], beta = f.q[3 * sd] - f.th - f.q[3 * sd + 1] + f.q[3 * sd + 2], ik = ikLeg(B, f.th, ank[0] * s, ank[1] * s, beta); q[3 * sd] = ik[0]; q[3 * sd + 1] = ik[1]; q[3 * sd + 2] = ik[2]; }
          pose = { x: f.x * s, y: f.y * s, th: f.th, q, arm: Float64Array.from(f.arm) };
        }
        if (method === 'fix') {
          // бедро за пределом — меньше наклон корпуса: угол бедра к вертикали (α1 = q_h − θ) и стопы не меняются
          for (let sd = 0; sd < 2; sd++) if (pose.q[3 * sd] > B.LIM.hip[1] + lean) lean = pose.q[3 * sd] - B.LIM.hip[1];
          pose.th -= lean; pose.q[0] -= lean; pose.q[3] -= lean; pose.arm[0] -= lean; pose.arm[2] -= lean;
          clampJoints(B, pose.q, pose.arm); onFloor(B, pose, Ph, g);
        }
      }
      out.push(Object.assign(pose, { phi: f.phi, lean, hum: f }));
    }
    return { method, B, s, human, frames: out, T: human.T, N: human.N, ground: g };
  }
  /** Центр масс Ады по позе (м): корпус — середина корпуса, бедро и голень — середины звеньев, стопа — середина стопы. */
  function comOf(B, pose, P) {
    P = P || fk(B, pose); const [sT, cT] = DM.sincos(pose.th); let mx = MASS.torso * (pose.x + B.LT / 2 * sT), my = MASS.torso * (pose.y + B.LT / 2 * cT), m = MASS.torso;
    for (const K of ['L', 'R']) {
      const hip = P.hip, kn = P['knee' + K], an = P['ankle' + K], he = P['heel' + K], to = P['toe' + K];
      mx += MASS.thigh * (hip[0] + kn[0]) / 2 + MASS.shin * (kn[0] + an[0]) / 2 + MASS.foot * (he[0] + to[0] + 2 * an[0]) / 4;
      my += MASS.thigh * (hip[1] + kn[1]) / 2 + MASS.shin * (kn[1] + an[1]) / 2 + MASS.foot * (he[1] + to[1] + 2 * an[1]) / 4;
      m += MASS.thigh + MASS.shin + MASS.foot;
    }
    return [mx / m, my / m];
  }
  /** Опора: отрезок [x0, x1] под точками подошвы, которые касаются пола или ступеньки (ближе 1 см), или null. */
  function supportOf(P, g) {
    g = g || flat; let x0 = Infinity, x1 = -Infinity;
    for (const k of SOLE) if (P[k][1] - g(P[k][0]) < 0.01) { if (P[k][0] < x0) x0 = P[k][0]; if (P[k][0] > x1) x1 = P[k][0]; }
    return x0 <= x1 ? [x0, x1] : null;
  }
  /** Насколько проекция центра масс вышла за опору (м, 0 — над опорой). */
  function comOut(B, pose, P, g) { P = P || fk(B, pose); const c = comOf(B, pose, P), sup = supportOf(P, g); if (!sup) return 0; return c[0] < sup[0] ? c[0] - sup[0] : c[0] > sup[1] ? c[0] - sup[1] : 0; }   // > 0 — впереди опоры, < 0 — позади
  /** Метрики ретаргетинга по циклу: проникновение в пол (см), зависание опорной стопы (см), превышение пределов (град),
      доля кадров с нарушением пределов, ошибка ключевых точек (см, относительно таза по масштабу), наибольший выход
      центра масс за опору (см, только для медленных движений — приседа и махов), поправка наклона корпуса (град). */
  function rtMetrics(R) {
    const B = R.B, s = R.s, g = R.ground || flat, slow = !MOTIONS[R.human.key].twoLeg;
    let pen = 0, fl = 0, overSum = 0, overFrames = 0, kpErr = 0, kpN = 0, maxOver = 0, cOut = 0, cFrames = 0, lean = 0; const overJ = new Float64Array(3);
    for (const f of R.frames) {
      const P = fk(B, f), Ph = fk(R.human.B, { x: f.hum.x, y: f.hum.y, th: f.hum.th, q: f.hum.q, arm: f.hum.arm }), Pr = fk(R.human.B, { x: 0, y: 0, th: f.hum.th, q: f.hum.q, arm: f.hum.arm });
      for (let sd = 0; sd < 2; sd++) {
        const m = gapMin(P, sd, g); if (-m > pen) pen = -m;
        if (gapMin(Ph, sd, g) < 0.005 && m > fl) fl = m;   // у человека эта стопа на опоре, у Ады — над ней
      }
      const ov = overLimits(B, f.q); let o = 0; for (let j = 0; j < NJ; j++) o += ov[j];
      if (o > 1e-9) overFrames++; overSum += o; if (o > maxOver) maxOver = o;
      for (let j = 0; j < NJ; j++) if (ov[j] > overJ[j % 3]) overJ[j % 3] = ov[j];
      for (const k of ['kneeL', 'ankleL', 'toeL', 'kneeR', 'ankleR', 'toeR']) { kpErr += Math.sqrt(sq(P[k][0] - f.x - Pr[k][0] * s) + sq(P[k][1] - f.y - Pr[k][1] * s)); kpN++; }
      if (slow) { const co = comOut(B, f, P, g); if (Math.abs(co) > Math.abs(cOut)) cOut = co; if (Math.abs(co) > 0.005) cFrames++; }
      if (f.lean > lean) lean = f.lean;
    }
    const N = R.frames.length;
    return { pen: pen * 100, float: fl * 100, overDeg: deg(overSum / N), overMax: deg(maxOver), overShare: overFrames / N, overJ: [deg(overJ[0]), deg(overJ[1]), deg(overJ[2])], kp: kpErr / kpN * 100, com: slow ? Math.abs(cOut) * 100 : null, comFwd: slow ? cOut > 0 : null, comShare: slow ? cFrames / N : null, lean: deg(lean), N };
  }


  /* ---------- 4. физика: корпус — твёрдое тело, ноги без массы, ПД в суставах, пол — пружина с трением ----------
     Проще, чем XPBD-модель урока 6.1, чтобы обучение двух политик шло секунды: вся масса Ады (28 кг) отнесена к корпусу,
     центр масс — в середине корпуса (на 0,23 м выше таза), ноги без массы, их углы следуют ПД-регулятору по ускорению.
     Состояние S: c = центр масс корпуса (на LC выше таза вдоль корпуса), v, θ, ω; суставы q, qd (6);
     якоря трения для 4 точек подошвы; руки — кинематически (углы из записи). Шаг h = 2,5 мс, 8 подшагов на шаг политики.
     Силы пола в точках подошвы (и верха корпуса и головы — это падение) дают ускорение центра масс и момент: θ растёт
     по часовой стрелке (наклон вперёд), поэтому θ̈ = −M/I, где M — момент против часовой стрелки. */
  const H_SUB = 0.0025, N_SUB = 8, DT = H_SUB * N_SUB;   // 20 мс — 50 Гц
  const WORLD = { g: 9.81, M: 28, I: 1.2, LC: 0.23, KN: 24000, DN: 700, KT: 9000, DTN: 250, MU: 0.9, KP: 420, KD: 30, ACC: 260, PENMAX: 0.03, FMAX: 1200, ground: null };
  /** Высота пола в точке x (плоский пол или ступенька при world.step = { x, h }). */
  function groundAt(w, x) { return w.ground ? w.ground(x) : 0; }
  const standing = (B) => legLen(B);   // высота таза стоя при прямых ногах и стопе на полу
  /** Состояние из позы (положение таза x, y, угол корпуса th, углы q, скорости qd, скорость корпуса v). */
  function makeState(B, w, pose) {
    const [sT, cT] = DM.sincos(pose.th), hx = pose.x, hy = pose.y;
    const S = { B, w, cx: hx + w.LC * sT, cy: hy + w.LC * cT, vx: pose.vx || 0, vy: 0, th: pose.th, om: 0, q: Float64Array.from(pose.q), qd: pose.qd ? Float64Array.from(pose.qd) : new Float64Array(NJ), arm: Float64Array.from(pose.arm || [0, 0.3, 0, 0.3]),
      anchor: new Float64Array(6), onG: new Uint8Array(6), prev: new Float64Array(12), hasPrev: false, t: 0, fell: false, down: false, P: newPoints(), F: new Float64Array(12), air: [0, 0] };
    S.pose = { x: 0, y: 0, th: 0, q: S.q, arm: S.arm }; poseOf(S, true);
    return S;
  }
  /** Поза (точки) по состоянию. */
  function poseOf(S, full) { const [sT, cT] = DM.sincos(S.th); S.pose.x = S.cx - S.w.LC * sT; S.pose.y = S.cy - S.w.LC * cT; S.pose.th = S.th; return fk(S.B, S.pose, S.P, !full); }
  const hipOf = (S) => { const [sT, cT] = DM.sincos(S.th); return [S.cx - S.w.LC * sT, S.cy - S.w.LC * cT]; };
  /** Один подшаг h: ПД в суставах (цели qT), силы в точках подошвы, полунеявный Эйлер для корпуса. */
  function substep(S, qT) {
    const w = S.w, B = S.B, h = H_SUB;
    // суставы: ускорение по ПД с ограничением (как ограничение момента), пределы углов
    for (let j = 0; j < NJ; j++) {
      let a = w.KP * (qT[j] - S.q[j]) - w.KD * S.qd[j]; a = clamp(a, -w.ACC, w.ACC);
      S.qd[j] += a * h; S.q[j] += S.qd[j] * h;
      const lim = B.LIM[JN[j % 3]]; if (S.q[j] < lim[0]) { S.q[j] = lim[0]; if (S.qd[j] < 0) S.qd[j] = 0; } else if (S.q[j] > lim[1]) { S.q[j] = lim[1]; if (S.qd[j] > 0) S.qd[j] = 0; }
    }
    // точки подошвы и силы
    const P = poseOf(S); let Fx = 0, Fy = 0, Tq = 0; S.F.fill(0);
    for (let i = 0; i < 6; i++) {
      const p = P[CONTACT[i]], px = p[0], py = p[1], g = groundAt(w, px), pen = g - py;
      const vx = S.hasPrev ? (px - S.prev[2 * i]) / h : 0, vy = S.hasPrev ? (py - S.prev[2 * i + 1]) / h : 0;
      S.prev[2 * i] = px; S.prev[2 * i + 1] = py;
      if (pen <= 0) { S.onG[i] = 0; continue; }
      if (i >= 4) S.down = true;   // корпус коснулся пола
      let fn = w.KN * (pen < w.PENMAX ? pen : w.PENMAX) - w.DN * vy; if (fn < 0) fn = 0; else if (fn > w.FMAX) fn = w.FMAX;   // глубокое проникновение (лежащее тело) не выстреливает
      if (!S.onG[i]) { S.onG[i] = 1; S.anchor[i] = px; }
      let ft = -w.KT * (px - S.anchor[i]) - w.DTN * vx; const fmax = w.MU * fn;
      if (ft > fmax) { ft = fmax; S.anchor[i] = px + ft / w.KT; } else if (ft < -fmax) { ft = -fmax; S.anchor[i] = px + ft / w.KT; }
      Fx += ft; Fy += fn; Tq += (px - S.cx) * fn - (py - S.cy) * ft;
      S.F[2 * i] = ft; S.F[2 * i + 1] = fn;
    }
    S.hasPrev = true;
    // корпус
    const ax = Fx / w.M, ay = Fy / w.M - w.g, al = -Tq / w.I;   // θ растёт по часовой стрелке, Tq — против
    S.vx += ax * h; S.vy += ay * h; S.om += al * h;
    S.cx += S.vx * h; S.cy += S.vy * h; S.th += S.om * h;
    S.t += h;
    // падение: корпус сильно наклонён или таз у пола
    const hip = hipOf(S);
    if (S.down || S.th > 1.0 || S.th < -1.0 || hip[1] - groundAt(w, hip[0]) < 0.45 * standing(B)) S.fell = true;
    return S;
  }
  /** Шаг политики: N_SUB подшагов с целями qT (руки — кинематически из arm). */
  function envStep(S, qT, arm, keepGoing) {
    if (arm) for (let j = 0; j < 4; j++) S.arm[j] = arm[j];
    for (let k = 0; k < N_SUB && (keepGoing || !S.fell); k++) substep(S, qT);
    poseOf(S, true);
    return S;
  }
  /** Наблюдаемые величины для награды и признаков: угол корпуса, скорость, высота таза, высоты стоп. */
  function observe(S, o) {
    o = o || {}; const hip = hipOf(S), P = S.P || poseOf(S);
    o.th = S.th; o.om = S.om; o.vx = S.vx; o.vy = S.vy; o.hipX = hip[0]; o.hipY = hip[1];
    o.footL = Math.max(0, soleMin(P, 0)); o.footR = Math.max(0, soleMin(P, 1)); o.q = S.q; o.qd = S.qd;
    return o;
  }

  /* ---------- 5. политика: ритм по фазе и обратная связь; две награды; обучение ARS ----------
     Параметры (35 чисел): на каждый из трёх суставов ноги — постоянная и ряд Фурье до второй гармоники (5);
     обратная связь — 3 × 5 коэффициентов на признаки [θ, ω, высота таза, ошибка скорости, команда];
     часы — f0, f1 (частота = f0 + f1·(v_cmd − v_clip); у трекера частота записи, у AMP — обучаемая, с 1 Гц);
     усиление размаха по команде sA (по суставу). Обучение — поиск по популяции (ARS, как в 6.1): 16 направлений,
     обновление по 8 лучшим, 100 итераций по 33 эпизода в 2,4 с.
     Левая нога — по фазе φ, правая — по φ + 0,5. Цель каждого сустава идёт в ПД-регулятор. */
  const NP = 35, NF = 5, IDX = { four: 0, gain: 15, f0: 30, f1: 31, sA: 32 };   // sA — три числа, по суставу
  const Q_STAND = new Float64Array([0.05, 0.10, 0.05, 0.05, 0.10, 0.05]);
  function policyInit(f0) { const p = new Float64Array(NP); for (let j = 0; j < 3; j++) p[IDX.four + 5 * j] = Q_STAND[j]; p[IDX.f0] = f0; return p; }
  /** Признаки обратной связи. */
  function features(o, vcmd, vClip, y0, f) {
    f = f || new Float64Array(NF); f[0] = o.th; f[1] = o.om * 0.2; f[2] = (o.hipY - y0) / 0.1; f[3] = (o.vx - vcmd) / 0.5; f[4] = (vcmd - vClip) / 0.5; return f;
  }
  /** Цели суставов по параметрам p, фазе φ (левой ноги), признакам f и команде. */
  function targets(p, phi, f, dv, qT) {
    qT = qT || new Float64Array(NJ);
    for (let s = 0; s < 2; s++) {
      const ph = phi + 0.5 * s, [s1, c1] = DM.sincos(TAU * ph), [s2, c2] = DM.sincos(2 * TAU * ph);
      for (let j = 0; j < 3; j++) {
        const b = IDX.four + 5 * j, amp = 1 + p[IDX.sA + j] * dv; let v = p[b] + amp * (p[b + 1] * c1 + p[b + 2] * s1 + p[b + 3] * c2 + p[b + 4] * s2);
        const g = IDX.gain + NF * j; for (let i = 0; i < NF; i++) v += p[g + i] * f[i];
        qT[3 * s + j] = v;
      }
    }
    return qT;
  }

  /* ---- признаки дискриминатора (AMP): углы и скорости суставов, наклон корпуса, скорость, высота таза, высоты стоп ---- */
  const ND = 17, NDD = 2 * ND;
  function phiOf(o, y0, out) {
    out = out || new Float64Array(ND);
    for (let j = 0; j < NJ; j++) { out[j] = o.q[j]; out[NJ + j] = o.qd[j] * 0.1; }
    out[12] = o.th; out[13] = o.vx; out[14] = (o.hipY - y0) * 5; out[15] = o.footL * 5; out[16] = o.footR * 5;
    return out;
  }
  /** Переходы записи для дискриминатора: (Φ(кадр k), Φ(кадр k+1)) по кадрам записи Ады. */
  function clipTransitions(C) {
    const y0 = standing(C.B), out = [], P = newPoints();
    const feat = (k) => { const f = C.frames[k]; fk(C.B, { x: 0, y: f.y, th: f.th, q: f.q, arm: f.arm }, P); return phiOf({ q: f.q, qd: f.qd, th: f.th, vx: C.v, hipY: f.y, footL: Math.max(0, soleMin(P, 0)), footR: Math.max(0, soleMin(P, 1)) }, y0); };
    const F = C.frames.map((_, k) => feat(k));
    for (let k = 0; k < C.N; k++) { const a = F[k], b = F[(k + 1) % C.N], t = new Float64Array(NDD); t.set(a, 0); t.set(b, ND); out.push(t); }
    return out;
  }
  /* ---- маленькая сеть дискриминатора: 34 → 24 → 1, ReLU с утечкой, Adam ---- */
  function dnet(seed, H) {
    H = H || 24; const r = rng(seed), W1 = new Float64Array(NDD * H), B1 = new Float64Array(H), W2 = new Float64Array(H), B2 = new Float64Array(1);
    for (let i = 0; i < W1.length; i++) W1[i] = randn(r) * Math.sqrt(2 / NDD); for (let i = 0; i < H; i++) W2[i] = randn(r) * Math.sqrt(1 / H);
    const z = (n) => new Float64Array(n);
    return { H, W1, B1, W2, B2, h: z(H), m: [z(W1.length), z(H), z(H), z(1)], v: [z(W1.length), z(H), z(H), z(1)], g: [z(W1.length), z(H), z(H), z(1)], t: 0, p1: 1, p2: 1 };
  }
  function dfwd(D, x) { const H = D.H, h = D.h; let out = D.B2[0]; for (let k = 0; k < H; k++) { let z = D.B1[k]; const off = k; for (let i = 0; i < NDD; i++) z += x[i] * D.W1[i * H + off]; h[k] = z < 0 ? 0.01 * z : z; out += h[k] * D.W2[k]; } return out; }
  /** Обратный проход после dfwd: dOut — производная функции потерь по выходу; градиенты копятся в D.g. */
  function dbwd(D, x, dOut) { const H = D.H, h = D.h, g = D.g; g[3][0] += dOut; for (let k = 0; k < H; k++) { g[2][k] += h[k] * dOut; const dh = D.W2[k] * dOut * (h[k] > 0 ? 1 : 0.01); g[1][k] += dh; for (let i = 0; i < NDD; i++) g[0][i * H + k] += x[i] * dh; } }
  function dadam(D, lr, scale) {
    D.t++; const b1 = 0.9, b2 = 0.999; D.p1 *= b1; D.p2 *= b2; const c1 = 1 - D.p1, c2 = 1 - D.p2, P = [D.W1, D.B1, D.W2, D.B2];
    for (let l = 0; l < 4; l++) { const Pp = P[l], G = D.g[l], M = D.m[l], V = D.v[l]; for (let i = 0; i < Pp.length; i++) { const gi = G[i] * scale; M[i] = b1 * M[i] + (1 - b1) * gi; V[i] = b2 * V[i] + (1 - b2) * gi * gi; Pp[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); } G.fill(0); }
  }
  /** Награда стиля AMP: max(0, 1 − 0,25 (D − 1)²). */
  const styleReward = (d) => { const v = 1 - 0.25 * (d - 1) * (d - 1); return v > 0 ? v : 0; };
  /** Шаг обучения дискриминатора: метод наименьших квадратов (1 — запись, −1 — политика) и штраф за крутизну на записях:
      производная по случайному направлению u оценивается разностью D(x + εu) − D(x − εu). */
  function dtrain(D, real, fake, o, r) {
    const n = o.DB, eps = 1e-3, xu = new Float64Array(NDD), xd = new Float64Array(NDD), u = new Float64Array(NDD);
    for (let it = 0; it < o.DSTEPS; it++) {
      for (let m = 0; m < n; m++) {
        const xr = real[Math.floor(r() * real.length)], xf = fake[Math.floor(r() * fake.length)];
        const dr = dfwd(D, xr); dbwd(D, xr, 2 * (dr - 1));
        const df = dfwd(D, xf); dbwd(D, xf, 2 * (df + 1));
        // штраф за градиент: (D(x+εu) − D(x−εu))² / (4ε²) · w_gp / 2, u — случайное единичное направление
        let nrm = 0; for (let i = 0; i < NDD; i++) { u[i] = randn(r); nrm += u[i] * u[i]; } nrm = Math.sqrt(nrm);
        for (let i = 0; i < NDD; i++) { const d = u[i] / nrm * eps; xu[i] = xr[i] + d; xd[i] = xr[i] - d; }
        const dp = dfwd(D, xu), dm = dfwd(D, xd), slope = (dp - dm) / (2 * eps), c = o.WGP * slope / (2 * eps);
        dfwd(D, xu); dbwd(D, xu, c); dfwd(D, xd); dbwd(D, xd, -c);
      }
      dadam(D, o.DLR, 1 / n);
    }
    // точность: доля записей с D > 0 и доля переходов политики с D < 0 (по 64 случайным)
    let okR = 0, okF = 0; const K = 64; for (let m = 0; m < K; m++) { if (dfwd(D, real[Math.floor(r() * real.length)]) > 0) okR++; if (dfwd(D, fake[Math.floor(r() * fake.length)]) < 0) okF++; }
    return { accR: okR / K, accF: okF / K };
  }

  /* ---- настройки обучения ---- */
  const CFG = {
    SEED: 3,
    T: 120,                 // шагов политики в эпизоде обучения: 2,4 с
    T_EVAL: 200,            // в проверке: 4 с
    N_DIR: 16, TOP: 8, SIGMA: 0.06, ALPHA: 0.03, ITERS: 100,   // ARS: 16 направлений, обновление по 8 лучшим
    V_RANGE: [0.5, 1.5],    // команда скорости при обучении: доля от скорости записи
    W_P: 0.65, W_V: 0.1, W_E: 0.15, W_C: 0.1, K_P: 2, K_V: 0.1, K_E: 40, K_C: 10,   // награда трекинга (DeepMimic)
    W_I: 0.7, W_G: 0.3,     // имитация и задача в трекинге (DeepMimic)
    W_S: 0.5, W_GA: 0.5,    // стиль и задача в AMP
    K_G: 10,                // задача: exp(−K_G (v_cmd − v)²)
    DB: 32, DSTEPS: 6, DLR: 2e-3, WGP: 10, BUF: 12000, F0_AMP: 1.0,   // дискриминатор
    FSC: [1, 3],            // масштаб случайных направлений для частоты шагов f0 и её зависимости от команды f1 (у AMP)
    RSI: true, ET: true,
  };
  /** Кадр записи с мировым x: X0 + v·t + периодический остаток. */
  function refAt(C, phi, t, X0, phi0, out) { const o = clipAt(C, phi, out); const r0 = resid(C, phi0); o.xw = X0 + C.v * t + resid(C, phi) - r0; return o; }
  function resid(C, phi) { phi -= Math.floor(phi); const o = clipAt(C, phi); return o.x - C.v * phi * C.T; }
  /** Награда трекинга к записи C в фазе φ: r_I = w_p r_p + w_v r_v + w_e r_e + w_c r_c (DeepMimic), r_c — по тазу. */
  function trackReward(C, o, phi, t, X0, phi0, cfg, P, tmp) {
    const ref = refAt(C, phi, t, X0, phi0, tmp.ref); let ep = 0, ev = 0;
    for (let j = 0; j < NJ; j++) { ep += sq(o.q[j] - ref.q[j]); ev += sq(o.qd[j] - ref.qd[j]); }
    // стопы (голеностопы) в мире: у Ады — из позы; у записи — таз записи + смещение
    const Pr = fk(C.B, { x: ref.xw, y: ref.y, th: ref.th, q: ref.q, arm: ref.arm }, tmp.Pr, true);
    let ee = sq(P.ankleL[0] - Pr.ankleL[0]) + sq(P.ankleL[1] - Pr.ankleL[1]) + sq(P.ankleR[0] - Pr.ankleR[0]) + sq(P.ankleR[1] - Pr.ankleR[1]);
    const ec = sq(o.hipX - ref.xw) + sq(o.hipY - ref.y);
    const rp = DM.exp(-cfg.K_P * ep), rv = DM.exp(-cfg.K_V * ev), re = DM.exp(-cfg.K_E * ee), rc = DM.exp(-cfg.K_C * ec);
    return { r: cfg.W_P * rp + cfg.W_V * rv + cfg.W_E * re + cfg.W_C * rc, rp, rv, re, rc, ep };
  }
  /** Задача: держать скорость v_cmd. */
  const taskReward = (vx, vcmd, cfg) => DM.exp(-cfg.K_G * sq(vcmd - vx));
  /** Эпизод. mode: { kind: 'track'|'amp', clips, D?, cfg }. opt: { vcmd, phi0 (RSI) | null (стоя), T, keep (кадры), et, rsi }.
      Политика детерминирована; возвращает сводку и при keep — кадры для сцены. */
  function rollout(p, mode, opt) {
    const cfg = mode.cfg || CFG, C0 = mode.clips[0], B = C0.B, y0 = standing(B), w = mode.world || WORLD;
    const T = opt.T || cfg.T, vcmd = opt.vcmd == null ? C0.v : opt.vcmd, vClip = C0.v, dv = vcmd - vClip, et = opt.et == null ? cfg.ET : opt.et;
    const rsi = opt.phi0 != null;
    let phi = rsi ? opt.phi0 : 0, S;
    const tmp = { ref: null, Pr: newPoints() };
    if (rsi) { const Cs = mode.clips[opt.ci || 0], f = clipAt(Cs, phi); S = makeState(B, w, { x: 0, y: f.y, th: f.th, q: f.q, qd: f.qd, arm: f.arm, vx: Cs.v }); }
    else S = makeState(B, w, { x: 0, y: y0 - 0.004, th: 0, q: Q_STAND, arm: [0, 0.3, 0, 0.3], vx: 0 });
    const X0 = 0, phi0 = phi, o = observe(S), f = new Float64Array(NF), qT = new Float64Array(NJ), frames = opt.keep ? [] : null;
    const freq = mode.kind === 'track' ? C0.f : p[IDX.f0] + p[IDX.f1] * dv;
    let ret = 0, retI = 0, retG = 0, retS = 0, ep = 0, fellAt = null, vSum = 0, nAlive = 0, prevPhi = null, dsum = 0;
    const phiD = mode.kind === 'amp' ? new Float64Array(NDD) : null, phiA = phiD ? new Float64Array(ND) : null, phiB = phiD ? new Float64Array(ND) : null;
    const armRef = new Float64Array(4), refArm = { q: new Float64Array(NJ), qd: new Float64Array(NJ), arm: new Float64Array(4) };
    if (phiD) phiOf(o, y0, phiA);
    for (let t = 0; t < T; t++) {
      observe(S, o); features(o, vcmd, vClip, y0, f); targets(p, phi, f, dv, qT);
      clipAt(C0, phi, refArm); for (let j = 0; j < 4; j++) armRef[j] = refArm.arm[j];
      if (opt.keep) frames.push({ t: S.t, x: o.hipX, y: o.hipY, th: S.th, q: Float64Array.from(S.q), arm: Float64Array.from(armRef), phi, fell: S.fell, vx: o.vx });
      if (S.fell && et) { fellAt = fellAt == null ? t : fellAt; break; }
      envStep(S, qT, armRef, !et); observe(S, o);
      if (S.fell && fellAt == null) fellAt = t + 1;
      const tn = (t + 1) * DT;
      let r = 0;
      const rg = taskReward(o.vx, vcmd, cfg);
      if (mode.kind === 'track') {
        let best = null;
        for (const C of mode.clips) { const tr = trackReward(C, o, phi + freq * DT, tn, X0, phi0, cfg, S.P, tmp); if (!best || tr.r > best.r) best = tr; }
        r = cfg.W_I * best.r + cfg.W_G * rg; retI += best.r; ep += Math.sqrt(best.ep / NJ);
      } else {
        phiOf(o, y0, phiB); phiD.set(phiA, 0); phiD.set(phiB, ND);
        const d = mode.D ? dfwd(mode.D, phiD) : 0, rs = styleReward(d); dsum += d;
        if (opt.buf) opt.buf.push(Float64Array.from(phiD));
        r = cfg.W_GA * rg + cfg.W_S * rs; retS += rs; phiA.set(phiB);
      }
      if (S.fell && et) r = 0;
      ret += r; retG += rg; if (!S.fell) { vSum += o.vx; nAlive++; }
      phi += freq * DT;
    }
    const n = T;
    return { ret: ret / n, retI: retI / n, retG: retG / n, retS: retS / n, dMean: dsum / n, poseErr: deg(ep / Math.max(1, nAlive)), fellAt, dist: o.hipX - X0, vMean: nAlive ? vSum / nAlive : 0, frames, T: n, alive: nAlive, vcmd, phiEnd: phi };
  }
  /** Генератор обучения ARS; yield — сводка итерации; return — { p, hist, D }. mode как в rollout; o — переопределения CFG. */
  function* train(mode, o) {
    const cfg = Object.assign({}, CFG, o || {}), seed = cfg.SEED, C0 = mode.clips[0];
    const p = policyInit(mode.kind === 'track' ? C0.f : cfg.F0_AMP), r = rng(seed * 7919 + 3), rD = rng(seed * 131 + 7), hist = [];
    const M = Object.assign({ cfg }, mode);
    let D = null, real = null, buf = null, best = null;
    if (mode.kind === 'amp') { D = dnet(seed * 1000 + 11); real = [].concat(...mode.clips.map(clipTransitions)); buf = []; M.D = D; }
    const dirs = [], N = cfg.N_DIR;
    for (let d = 0; d < N; d++) dirs.push(new Float64Array(NP));
    const mask = new Float64Array(NP).fill(1); if (mode.kind === 'track') { mask[IDX.f0] = 0; mask[IDX.f1] = 0; }   // в трекинге часы заданы записью
    const scale = new Float64Array(NP).fill(1); scale[IDX.f0] = cfg.FSC[0]; scale[IDX.f1] = cfg.FSC[1];   // шаг поиска по частоте шагов (у AMP)
    for (let it = 0; it < cfg.ITERS; it++) {
      const rp = new Float64Array(N), rm = new Float64Array(N), newBuf = [];
      for (let d = 0; d < N; d++) {
        const dir = dirs[d]; for (let i = 0; i < NP; i++) dir[i] = randn(r) * mask[i] * scale[i];
        const vcmd = C0.v * (cfg.V_RANGE[0] + (cfg.V_RANGE[1] - cfg.V_RANGE[0]) * r()), phi0 = cfg.RSI ? r() : null, ci = mode.kind === 'amp' && mode.clips.length > 1 && cfg.RSI ? Math.floor(r() * mode.clips.length) : 0;
        const pp = new Float64Array(NP), pm = new Float64Array(NP);
        for (let i = 0; i < NP; i++) { pp[i] = p[i] + cfg.SIGMA * dir[i]; pm[i] = p[i] - cfg.SIGMA * dir[i]; }
        rp[d] = rollout(pp, M, { vcmd, phi0, ci, buf: newBuf }).ret; rm[d] = rollout(pm, M, { vcmd, phi0, ci, buf: newBuf }).ret;
      }
      // лучшие направления по max(r+, r−), нормировка на разброс
      const order = Array.from({ length: N }, (_, d) => d).sort((a, b) => Math.max(rp[b], rm[b]) - Math.max(rp[a], rm[a])).slice(0, cfg.TOP);
      let mean = 0, s2 = 0; for (const d of order) { mean += rp[d] + rm[d]; } mean /= 2 * order.length; for (const d of order) { s2 += sq(rp[d] - mean) + sq(rm[d] - mean); } const sd = Math.sqrt(s2 / (2 * order.length)) + 1e-6;
      for (const d of order) { const c = cfg.ALPHA / (order.length * sd) * (rp[d] - rm[d]); for (let i = 0; i < NP; i++) p[i] += c * dirs[d][i]; }
      let dacc = null;
      if (D) { for (const x of newBuf) buf.push(x); if (buf.length > cfg.BUF) buf.splice(0, buf.length - cfg.BUF); dacc = dtrain(D, real, buf, cfg, rD); }
      // проверка средней политики при скорости записи
      const ev = rollout(p, M, { vcmd: C0.v, phi0: cfg.RSI ? 0 : null });
      const h = { it: it + 1, ret: ev.ret, dist: ev.dist, vMean: ev.vMean, fell: ev.fellAt, poseErr: ev.poseErr, retS: ev.retS, retI: ev.retI, dacc, rBatch: (rp.reduce((a, b) => a + b, 0) + rm.reduce((a, b) => a + b, 0)) / (2 * N) };
      if (it >= Math.floor(cfg.ITERS * 2 / 3) && (!best || h.ret > best.ret)) best = { ret: h.ret, it: it + 1, p: Float64Array.from(p) };   // итог — лучшая проверка средней политики в последней трети
      hist.push(h); yield h;
    }
    return { p: best.p, pLast: p, bestIt: best.it, hist, D, mode: M, cfg };
  }
  function run(gen) { let r; while (!(r = gen.next()).done) { /* синхронно */ } return r.value; }
  /** Проверка обученной политики при команде vcmd (доля от скорости записи): 4 с, старт из кадра 0 записи. */
  function evaluate(R, vFrac, opt) {
    opt = opt || {}; const C0 = R.mode.clips[0], vcmd = C0.v * vFrac;
    const ev = rollout(R.p, R.mode, { vcmd, phi0: opt.phi0 == null ? 0 : opt.phi0, T: opt.T || R.cfg.T_EVAL, keep: true, et: true });
    // ошибка позы после выравнивания по сдвигу фазы (упрощённое DTW из AMP): минимум по δ средней |q − q̂(φ + δ)| по живым кадрам после 0,5 с
    let best = Infinity, bestD = 0; const fr = ev.frames.filter((f) => !f.fell && f.t >= 0.5), tmp = { q: new Float64Array(NJ), qd: new Float64Array(NJ), arm: new Float64Array(4) };
    for (let k = 0; k < 60; k++) { const dl = k / 60; let e = 0; for (const f of fr) { clipAt(C0, f.phi + dl, tmp); for (let j = 0; j < NJ; j++) e += Math.abs(f.q[j] - tmp.q[j]); } e /= Math.max(1, fr.length) * NJ; if (e < best) { best = e; bestD = dl; } }
    // походка: размах разности углов бёдер (ноги в противофазе — большой, вместе — малый) и средняя высота подъёма стопы
    // размах шага: наибольшая за прогон разница x голеностопов
    let dmin = Infinity, dmax = -Infinity, lift = 0, nl = 0, stride = 0; const P = newPoints();
    for (const f of fr) { const d = f.q[0] - f.q[3]; if (d < dmin) dmin = d; if (d > dmax) dmax = d; fk(C0.B, { x: 0, y: f.y, th: f.th, q: f.q, arm: f.arm }, P, true); lift += Math.max(soleMin(P, 0), soleMin(P, 1)); nl++; const sd = Math.abs(P.ankleL[0] - P.ankleR[0]); if (sd > stride) stride = sd; }
    return Object.assign(ev, { vFrac, alignErr: deg(best), alignShift: bestD, fell: ev.fellAt != null, legSwing: fr.length ? deg(dmax - dmin) : 0, lift: nl ? lift / nl * 100 : 0, stride: stride * 100 });
  }
  /** Запись-«среднее» двух записей (покадрово по фазе): для лаборатории 3. */
  function meanClip(A, Bc) {
    const frames = A.frames.map((f, k) => { const g = Bc.frames[k], q = new Float64Array(NJ), qd = new Float64Array(NJ), arm = new Float64Array(4); for (let j = 0; j < NJ; j++) { q[j] = (f.q[j] + g.q[j]) / 2; qd[j] = (f.qd[j] + g.qd[j]) / 2; } for (let j = 0; j < 4; j++) arm[j] = (f.arm[j] + g.arm[j]) / 2; return { phi: f.phi, x: (f.x + g.x) / 2, y: (f.y + g.y) / 2, th: (f.th + g.th) / 2, q, qd, arm }; });
    return Object.assign({}, A, { key: 'mean', name: 'среднее двух записей', frames });
  }
  /** Та же запись, начатая с другой ноги: фаза сдвинута на полцикла. */
  function swapLegs(A) {
    const n = A.N, h = n >> 1, frames = A.frames.map((_, k) => { const f = A.frames[(k + h) % n]; return { phi: k / n, x: f.x - A.frames[h].x + A.frames[0].x, y: f.y, th: f.th, q: f.q, qd: f.qd, arm: f.arm }; });
    return Object.assign({}, A, { key: 'walkB', name: 'ходьба с другой ноги', frames });
  }
  /** Запись Ады: ретаргетинг «fix» человеческой записи в объект записи с теми же полями. */
  function adaClip(key, B) {
    B = B || ADA; const H = clipOf(HUMAN, key), R = retarget(H, 'fix', B), N = R.frames.length;
    const frames = R.frames.map((f) => ({ phi: f.phi, x: f.x, y: f.y, th: f.th, q: Float64Array.from(f.q), arm: Float64Array.from(f.arm) }));
    for (let k = 0; k < N; k++) { const a = frames[k], b = frames[(k + 1) % N]; a.qd = new Float64Array(NJ); for (let j = 0; j < NJ; j++) a.qd[j] = (b.q[j] - a.q[j]) * FPS; }
    return { key, name: H.name, B, T: H.T, N, frames, v: H.v * R.s, cyclic: true, f: 1 / H.T, human: H, s: R.s };
  }

  /* ---- абляции RSI и раннего останова для ходьбы Ады: посчитано заранее в Node (node tools/lesson62.js --precompute),
     тест (--check) пересчитывает и сверяет бит в бит; зёрна 1–3, трекинг по записи ходьбы, 100 итераций ----
     ret — нормированная отдача проверки (4 с, команда = скорость записи), rI — имитационная часть, dist — метры за 4 с,
     v — средняя скорость, fell — шаг падения или null, align — ошибка позы после выравнивания (град),
     tail — средняя отдача проверок за последнюю треть обучения, falls — падений в проверках за 100 итераций. */
  const ABL = {"both":[{"seed":1,"ret":0.816,"rI":0.766,"dist":3.35,"v":0.83,"fell":null,"align":6,"tail":0.77,"falls":7},{"seed":2,"ret":0.802,"rI":0.753,"dist":3.16,"v":0.79,"fell":null,"align":5.8,"tail":0.774,"falls":9},{"seed":3,"ret":0.822,"rI":0.781,"dist":3.26,"v":0.81,"fell":null,"align":5.4,"tail":0.766,"falls":7}],"et":[{"seed":1,"ret":0.515,"rI":0.421,"dist":3.86,"v":0.95,"fell":null,"align":12.8,"tail":0.441,"falls":11},{"seed":2,"ret":0.615,"rI":0.485,"dist":3.65,"v":0.9,"fell":null,"align":10.5,"tail":0.422,"falls":18},{"seed":3,"ret":0.654,"rI":0.519,"dist":3.26,"v":0.82,"fell":null,"align":12.5,"tail":0.387,"falls":9}],"rsi":[{"seed":1,"ret":0.827,"rI":0.779,"dist":3.28,"v":0.82,"fell":null,"align":5.7,"tail":0.765,"falls":9},{"seed":2,"ret":0.818,"rI":0.773,"dist":3.21,"v":0.8,"fell":null,"align":6.1,"tail":0.781,"falls":9},{"seed":3,"ret":0.779,"rI":0.719,"dist":3.47,"v":0.86,"fell":null,"align":5.2,"tail":0.739,"falls":9}],"none":[{"seed":1,"ret":0.596,"rI":0.535,"dist":4.01,"v":1,"fell":null,"align":7.6,"tail":0.466,"falls":20},{"seed":2,"ret":0.609,"rI":0.463,"dist":3.1,"v":0.77,"fell":null,"align":11.2,"tail":0.466,"falls":26},{"seed":3,"ret":0.647,"rI":0.507,"dist":3.29,"v":0.81,"fell":null,"align":10.8,"tail":0.476,"falls":20}]};

  /** Среднее двух записей по фазе со сдвигом второй на off долей цикла: размах шага усреднённой позы (см, наибольшая
      разница x голеностопов за цикл) и наибольшая разница высот стоп (см): у ходьбы одна стопа в воздухе, другая на полу. */
  function mixStats(A, off) {
    const N = A.N, B = A.B, P = newPoints(), tmpA = { q: new Float64Array(NJ), qd: new Float64Array(NJ), arm: new Float64Array(4) }, tmpB = { q: new Float64Array(NJ), qd: new Float64Array(NJ), arm: new Float64Array(4) };
    let stride = 0, lift = 0; const q = new Float64Array(NJ), arm = new Float64Array(4);
    for (let k = 0; k < N; k++) {
      const phi = k / N; clipAt(A, phi, tmpA); clipAt(A, phi + off, tmpB);
      for (let j = 0; j < NJ; j++) q[j] = (tmpA.q[j] + tmpB.q[j]) / 2; for (let j = 0; j < 4; j++) arm[j] = (tmpA.arm[j] + tmpB.arm[j]) / 2;
      const y = (tmpA.y + tmpB.y) / 2, th = (tmpA.th + tmpB.th) / 2; fk(B, { x: 0, y, th, q, arm }, P, true);
      const d = Math.abs(P.ankleL[0] - P.ankleR[0]); if (d > stride) stride = d;
      const dl = Math.abs(soleMin(P, 0) - soleMin(P, 1)); if (dl > lift) lift = dl;
    }
    return { stride: stride * 100, lift: lift * 100 };
  }

  const API = { DM, rng, randn, clamp, deg, rad, HUMAN, ADA, LIM: ADA.LIM, NJ, JN, PTS, SOLE, FPS, DT, H_SUB, N_SUB, WORLD, CFG, NP, IDX, ND, Q_STAND,
    fk, newPoints, soleMin, gapMin, ikLeg, clampJoints, overLimits, legLen, standing, MOTIONS, walkMotion, frameAngles, clipOf, clipAt, METHODS_RT, retarget, rtMetrics, MASS, comOf, supportOf, comOut, STEP, STEP_SPOTS, groundStep, groundOf, stepHuman, stepPoints, comHumanX, WINTER,
    makeState, poseOf, hipOf, substep, envStep, observe, policyInit, features, targets, phiOf, clipTransitions, dnet, dfwd, dtrain, styleReward,
    trackReward, taskReward, rollout, train, run, evaluate, meanClip, swapLegs, adaClip, ABL, refAt, resid, mixStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L62 = API;
})(typeof window !== 'undefined' ? window : globalThis);
