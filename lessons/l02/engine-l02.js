/* =====================================================================
   l02/engine-l02.js — движки урока 0.2 без DOM (работают и в Node):
   • ArmK — плоская рука из 2 или 3 звеньев: прямая и обратная кинематика,
     столкновения с коробкой, лампой и столом, нуль-пространство, рабочая зона;
   • ImuK — наклон корпуса, гироскоп с дрейфом, шумный акселерометр, рывки,
     комплементарный фильтр;
   • CMDS — команды для лабы «Модель привода по данным».
   Все случайности — с фиксированным зерном, чтобы цифры в тексте совпадали с лабой.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- Рука из звеньев ---------- */
  const ArmK = (() => {
    const R = 0.022;                                   // радиус звена, м
    const L2 = [0.42, 0.42], L3 = [0.42, 0.28, 0.14];  // третий сустав делит предплечье: длина та же
    const BOX = [0.27, 0, 0.35, 0.22];                 // коробка на столе: x0, y0, x1, y1
    const CUP = { x: 0.42, w: 0.08, h: 0.10 }, GRASP = [0.42, 0.112], TOL = 0.03;
    const LAMP = [0.08, 0.36, 0.18, 0.43], CORD = [0.125, 0.43, 0.135, 0.9];
    const VIEW = { x0: -0.30, x1: 0.80, y0: -0.06, y1: 0.83 };  // видимая часть сцены, м
    function fk(L, q) { let a = 0, x = 0, y = 0; const pts = [[0, 0]]; for (let i = 0; i < L.length; i++) { a += q[i]; x += L[i] * Math.cos(a); y += L[i] * Math.sin(a); pts.push([x, y]); } return pts; }
    /** Две позы двухзвенной руки: up = true — локоть над линией «плечо → цель». */
    function ik2(a, b, x, y, up) {
      const c2 = (x * x + y * y - a * a - b * b) / (2 * a * b); if (c2 < -1 - 1e-9 || c2 > 1 + 1e-9) return null;
      const q2 = (up ? -1 : 1) * Math.acos(Math.max(-1, Math.min(1, c2)));
      return [Math.atan2(y, x) - Math.atan2(b * Math.sin(q2), a + b * Math.cos(q2)), q2];
    }
    function rectDist(x, y, rc) {
      const dx = Math.max(rc[0] - x, 0, x - rc[2]), dy = Math.max(rc[1] - y, 0, y - rc[3]);
      if (dx === 0 && dy === 0) return -Math.min(x - rc[0], rc[2] - x, y - rc[1], rc[3] - y);
      return Math.hypot(dx, dy);
    }
    const obstacles = (lamp) => (lamp ? [BOX, LAMP, CORD] : [BOX]);
    /** Запас до препятствий и стола по осям звеньев (без радиуса звена) и что ближе всего.
     *  Основание стоит на столе, поэтому стол в радиусе 9 см от плеча не считаем. */
    function clearance(pts, lamp) {
      const rects = obstacles(lamp); let m = Infinity, what = null, link = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k <= 30; k++) {
          const t = k / 30, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
          for (let r = 0; r < rects.length; r++) { const d = rectDist(x, y, rects[r]); if (d < m) { m = d; what = r === 0 ? 'box' : 'lamp'; link = i; } }
          if (y < m && Math.hypot(x, y) > 0.09) { m = y; what = 'table'; link = i; }
        }
      }
      return { d: m, what, link };
    }
    function judge(L, q, lamp) {
      const pts = fk(L, q), e = pts[pts.length - 1], c = clearance(pts, lamp);
      return { pts, grip: e, dist: Math.hypot(e[0] - GRASP[0], e[1] - GRASP[1]), atCup: Math.hypot(e[0] - GRASP[0], e[1] - GRASP[1]) < TOL, hit: c.d < R, clear: c.d - R, what: c.d < R ? c.what : null, link: c.d < R ? c.link : -1 };
    }
    /** Цель для захвата не выходит за досягаемость и за край сцены. */
    function clampTarget(L, t) {
      let x = Math.max(VIEW.x0 + 0.02, Math.min(VIEW.x1 - 0.02, t[0])), y = Math.max(VIEW.y0 + 0.02, Math.min(VIEW.y1 - 0.02, t[1]));
      const reach = L.reduce((s, v) => s + v, 0) - 1e-4, d = Math.hypot(x, y);
      if (d > reach) { x *= reach / d; y *= reach / d; }
      return [x, y];
    }
    /** Захват тянут к цели. Две оси: ветвь локтя сохраняется. Три оси: угол кисти phi держим как
     *  в начале перетаскивания, а если так не дотянуться — берём ближайший возможный. */
    function solveGrip(L, q, target, phiKeep) {
      const t = clampTarget(L, target);
      if (L.length === 2) {
        const up = q[1] < 0, s = ik2(L[0], L[1], t[0], t[1], up);
        return s || q;
      }
      const elbow0 = fk(L, q)[1];
      let best = null, bestCost = Infinity;
      for (let k = 0; k <= 180; k++) {
        for (const sgn of k === 0 ? [1] : [1, -1]) {
          const phi = phiKeep + sgn * k * Math.PI / 180;
          const wx = t[0] - L[2] * Math.cos(phi), wy = t[1] - L[2] * Math.sin(phi);
          for (const up of [true, false]) {
            const s = ik2(L[0], L[1], wx, wy, up); if (!s) continue;
            const e = [L[0] * Math.cos(s[0]), L[0] * Math.sin(s[0])];
            const cost = k * 10 + Math.hypot(e[0] - elbow0[0], e[1] - elbow0[1]);
            if (cost < bestCost) { bestCost = cost; best = [s[0], s[1], phi - s[0] - s[1]]; }
          }
        }
        if (best && k * 10 > bestCost) break;
      }
      return best || q;
    }
    /** Нуль-пространство: захват стоит на месте, локоть идёт за пальцем по своей окружности.
     *  Если туда, куда тянут, локоть поставить нельзя, берём ближайшее возможное положение. */
    function solveElbow(L, q, grip, mouse) {
      if (L.length !== 3) return q;
      const want = Math.atan2(mouse[1], mouse[0]), wrist0 = fk(L, q)[2];
      let best = null, bestCost = Infinity;
      for (let k = 0; k <= 360; k++) {
        const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 360, q1 = want + off;
        const e = [L[0] * Math.cos(q1), L[0] * Math.sin(q1)];
        for (const up of [true, false]) {
          const s2 = ik2(L[1], L[2], grip[0] - e[0], grip[1] - e[1], up); if (!s2) continue;
          const w2 = [e[0] + L[1] * Math.cos(s2[0]), e[1] + L[1] * Math.sin(s2[0])];
          const cost = Math.abs(off) * 100 + Math.hypot(w2[0] - wrist0[0], w2[1] - wrist0[1]);
          if (cost < bestCost) { bestCost = cost; best = [q1, s2[0] - q1, s2[1]]; }
        }
        if (best && Math.abs(off) * 100 > bestCost) break;
      }
      return best || q;
    }
    /** Переход с двух суставов на три (и обратно) с тем же положением захвата. */
    function convert(Lfrom, q, Lto, phiPref) {
      const g = fk(Lfrom, q)[Lfrom.length];
      if (Lto.length === 3) return solveGrip(Lto, [q[0], q[1] * 0.5, q[1] * 0.5], g, phiPref == null ? -Math.PI / 2 : phiPref);
      const t = clampTarget(Lto, g), e0 = fk(Lfrom, q)[1];
      const sols = [true, false].map((up) => ik2(Lto[0], Lto[1], t[0], t[1], up)).filter(Boolean);
      if (!sols.length) return [Math.PI / 2, -Math.PI / 2];
      sols.sort((u, v) => Math.hypot(Math.cos(u[0]) * Lto[0] - e0[0], Math.sin(u[0]) * Lto[0] - e0[1]) - Math.hypot(Math.cos(v[0]) * Lto[0] - e0[0], Math.sin(v[0]) * Lto[0] - e0[1]));
      return sols[0];
    }
    /** Рабочая зона без столкновений: клетки сетки, куда захват можно поставить, ничего не задев.
     *  Две оси — у каждой точки всего две позы; три оси — перебираем угол кисти. */
    function zone(L, lamp, cell) {
      cell = cell || 0.025; const out = [], reach = L.reduce((a, b) => a + b, 0);
      for (let x = VIEW.x0 + cell / 2; x < VIEW.x1; x += cell) for (let y = cell / 2; y < VIEW.y1; y += cell) {
        if (Math.hypot(x, y) > reach) continue;
        let ok = false;
        if (L.length === 2) { for (const up of [true, false]) { const s2 = ik2(L[0], L[1], x, y, up); if (s2 && clearance(fk(L, s2), lamp).d >= R) { ok = true; break; } } }
        else {
          for (let k = 0; k < 72 && !ok; k++) {
            const phi = -Math.PI + k * Math.PI / 36, wx = x - L[2] * Math.cos(phi), wy = y - L[2] * Math.sin(phi);
            for (const up of [true, false]) { const s2 = ik2(L[0], L[1], wx, wy, up); if (s2 && clearance(fk(L, [s2[0], s2[1], phi - s2[0] - s2[1]]), lamp).d >= R) { ok = true; break; } }
          }
        }
        if (ok) out.push([x, y]);
      }
      return { cell, pts: out };
    }
    return { R, L2, L3, BOX, CUP, GRASP, TOL, LAMP, CORD, VIEW, fk, ik2, clearance, judge, solveGrip, solveElbow, convert, zone, clampTarget };
  })();

  /* ---------- IMU: гироскоп, акселерометр, комплементарный фильтр ---------- */
  const ImuK = (() => {
    const DT = 0.01, N = 1000;
    /** Тот же порядок случайных чисел, что в первой версии урока: цифры в тексте не меняются. */
    function base() {
      const r = rng(31), truth = new Float32Array(N), clean = new Float64Array(N), gn = new Float64Array(N), acc = new Float32Array(N);
      const bumps = []; for (let i = 0; i < 6; i++) bumps.push([Math.floor(r() * N), (r() * 2 - 1) * 12]);
      for (let i = 0; i < N; i++) {
        const t = i * DT, w1 = 2 * Math.PI * 0.15, w2 = 2 * Math.PI * 0.6;
        truth[i] = 12 * Math.sin(w1 * t) + 6 * Math.sin(w2 * t + 1);
        clean[i] = 12 * w1 * Math.cos(w1 * t) + 6 * w2 * Math.cos(w2 * t + 1); gn[i] = randn(r) * 0.8;
        let a = truth[i] + randn(r) * 4; for (const [bi, amp] of bumps) if (i >= bi && i < bi + 20) a += amp; acc[i] = a; // шум и толчки корпуса
      }
      return { truth, clean, gn, acc };
    }
    const B = base();
    /** Гироскоп со смещением нуля bias, °/с. */
    function gyro(bias) { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = B.clean[i] + bias + B.gn[i]; return g; }
    /** Рывки корпуса: каждый уровень добавляет четыре коротких всплеска ускорения. Гироскоп их не видит. */
    function shakes(level) {
      const out = [];
      for (let s = 1; s <= level; s++) { const r = rng(100 + s); for (let b = 0; b < 4; b++) out.push({ at: Math.floor(80 + r() * 840), amp: (r() < 0.5 ? -1 : 1) * (18 + r() * 10), len: 30 }); }
      return out;
    }
    function acc(level) {
      const a = Float32Array.from(B.acc);
      for (const s of shakes(level)) for (let k = 0; k < s.len && s.at + k < N; k++) a[s.at + k] += s.amp * Math.sin(Math.PI * k / s.len) * (k % 6 < 3 ? 1 : -0.6);
      return a;
    }
    function filter(g, a, al) { const e = new Float32Array(N); e[0] = a[0]; for (let i = 1; i < N; i++) e[i] = al * (e[i - 1] + g[i] * DT) + (1 - al) * a[i]; return e; }
    const rmse = (e) => { let s = 0; for (let i = 0; i < N; i++) s += (e[i] - B.truth[i]) ** 2; return Math.sqrt(s / N); };
    const endErr = (e) => Math.abs(e[N - 1] - B.truth[N - 1]);
    /** Все три оценки разом: только гироскоп (α = 1), только акселерометр (α = 0) и фильтр. */
    function run(o) {
      const g = gyro(o.bias == null ? 1.5 : o.bias), a = acc(o.shake || 0);
      const eg = filter(g, a, 1), ea = filter(g, a, 0), ef = filter(g, a, o.alpha);
      return { g, a, eg, ea, ef, gyro: { rmse: rmse(eg), end: endErr(eg) }, acc: { rmse: rmse(ea), end: endErr(ea) }, filt: { rmse: rmse(ef), end: endErr(ef) } };
    }
    return { DT, N, truth: B.truth, gyro, acc, filter, rmse, endErr, run, shakes };
  })();

  /* ---------- Команды для лабы «Модель привода по данным» ---------- */
  const STEPS = [0, 0.5, -0.3, 0.6, -0.5, 0.2, -0.6, 0.4, 0];
  const CMDS = {
    slow: { label: 'Медленная', f: (t) => 0.7 * Math.sin(2 * Math.PI * 0.3 * t) },
    mix: { label: 'Две частоты', f: (t) => 0.6 * Math.sin(2 * Math.PI * 0.8 * t) + 0.25 * Math.sin(2 * Math.PI * 2.1 * t) },
    fast: { label: 'Быстрая', f: (t) => 0.35 * Math.sin(2 * Math.PI * 3 * t) },
    steps: { label: 'Ступеньки', f: (t) => STEPS[Math.floor(t / 0.6) % STEPS.length] },
  };

  const API = { ArmK, ImuK, CMDS, rng, randn };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else Object.assign(root, API);
})(typeof window !== 'undefined' ? window : globalThis);
