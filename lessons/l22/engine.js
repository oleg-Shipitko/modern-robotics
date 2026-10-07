/* =====================================================================
   l22/engine.js — движок урока 2.2 «PerAct: 3D-представления и язык».
   Без DOM: работает в браузере и в Node (для подбора параметров и тестов).
   1) Ключевые позы. Ада ставит чашку на верхнюю полку, вид сбоку. Оператор
      ведёт руку (три сустава, обратная кинематика), получаем 30 кадров в
      секунду: позу захвата, его состояние и скорости суставов. Эвристика
      PerAct: кадр ключевой, если скорости суставов почти нулевые и состояние
      захвата не меняется. Планировщик ведёт захват по прямой от позы к позе,
      проверка — столкновения, захват чашки и место, где её отпустили.
   2) Следующий лучший воксель. Сцена — сетка 20³ (воксель 5 см): стол,
      стеллаж с двумя полками, чашка в захвате. Классификатор оценивает каждый
      воксель (линейный слой по признакам столбца над и под вокселем и соседей,
      свой вектор весов на каждую команду), softmax по всем вокселям,
      перекрёстная энтропия. Регрессия — метод наименьших квадратов от точного
      положения стеллажа и команды к координатам. Окно по высоте задаётся.
   3) Счёт стоимости внимания: все со всеми против Perceiver с латентами,
      и число выходов головы поворота.
   Все случайности — с зерном.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- случайность ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* =====================================================================
     1. Ключевые позы
     ===================================================================== */
  const HZ = 30;
  /** Рука Ады сбоку: плечо, длины плеча, предплечья и кисти (м). Захват всегда горизонтален. */
  const ARM = { sx: -0.16, sz: 0.60, l1: 0.46, l2: 0.48, l3: 0.11 };
  const CUP = { x: 0.34, r: 0.04, h: 0.10, gz: 0.05 };          // чашка на столе, захват держит её на высоте gz
  const SHELF = { xf: 0.62, xb: 0.92, t: 0.02, z: [0.0, 0.30, 0.60], top: 0.62 };
  /** Препятствия сбоку: прямоугольники [x0, x1] × [z0, z1]. */
  const OBST = [
    { id: 'kettle', name: 'чайник', x0: 0.43, x1: 0.55, z0: 0, z1: 0.22 },
    { id: 'board0', name: 'нижнюю полку', x0: SHELF.xf, x1: SHELF.xb, z0: 0, z1: 0.02 },
    { id: 'board1', name: 'верхнюю полку', x0: SHELF.xf, x1: SHELF.xb, z0: 0.30, z1: 0.32 },
    { id: 'roof', name: 'крышу стеллажа', x0: SHELF.xf, x1: SHELF.xb, z0: 0.60, z1: 0.62 },
    { id: 'back', name: 'стенку стеллажа', x0: SHELF.xb, x1: SHELF.xb + 0.02, z0: 0, z1: 0.62 },
    { id: 'table', name: 'стол', x0: -0.3, x1: 1.2, z0: -0.2, z1: 0 },
  ];
  /** Позы демонстрации: где захват останавливается и что делает. */
  const POSE = {
    home: [0.20, 0.36], pre: [0.22, 0.05], grasp: [0.34, 0.05], lift: [0.34, 0.29],
    preplace: [0.52, 0.39], place: [0.77, 0.375], retreat: [0.50, 0.375],
  };
  const ROLE_NAME = { pre: 'перед чашкой', grasp: 'захват чашки', lift: 'подъём над чайником', preplace: 'перед полкой', place: 'чашка на полке', retreat: 'отвод руки' };

  /** Обратная кинематика: суставы по позе захвата (x, z), локоть внизу, как у человека. */
  function ik(x, z) {
    const wx = x - ARM.l3, wz = z, dx = wx - ARM.sx, dz = wz - ARM.sz, d2 = dx * dx + dz * dz;
    const c2 = clamp((d2 - ARM.l1 * ARM.l1 - ARM.l2 * ARM.l2) / (2 * ARM.l1 * ARM.l2), -1, 1), q2 = Math.acos(c2);
    const q1 = Math.atan2(dz, dx) - Math.atan2(ARM.l2 * Math.sin(q2), ARM.l1 + ARM.l2 * Math.cos(q2));
    return [q1, q2, -q1 - q2];
  }
  /** Точки руки для рисования: плечо, локоть, запястье, захват. */
  function armPoints(x, z) {
    const [q1, q2] = ik(x, z), ex = ARM.sx + ARM.l1 * Math.cos(q1), ez = ARM.sz + ARM.l1 * Math.sin(q1);
    return { s: [ARM.sx, ARM.sz], e: [ex, ez], w: [x - ARM.l3, z], g: [x, z] };
  }
  const minJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
  const SMOOTH = 5, GRIP_W = 12, MERGE = 4;                    // сглаживание скорости, окно вокруг смены захвата, разрыв внутри одной остановки (кадров)

  /** Демонстрация: план из движений, остановок и команд захвату; дрожь руки оператора — сумма синусов. */
  const PLAN = [
    { hold: 0.5 }, { move: 'pre', T: 1.6 }, { hold: 0.42, role: 'pre' },
    { move: 'grasp', T: 1.2 }, { hold: 0.07 }, { grip: 0, role: 'grasp' }, { hold: 0.6 },
    { move: 'lift', T: 0.95 }, { hold: 0.27, role: 'lift' },
    { move: 'preplace', T: 1.45, dip: true }, { hold: 0.34, role: 'preplace', tremor: 1.8 },
    { move: 'place', T: 1.15 }, { hold: 0.07 }, { grip: 1, role: 'place' }, { hold: 0.6 },
    { move: 'retreat', T: 0.95 }, { hold: 0.6, role: 'retreat' },
  ];
  /** Профиль «с заминкой»: посередине пути оператор сбавляет скорость, но не останавливается. */
  function dipWarp(n, depth) {
    const sp = []; let s = 0;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; sp.push(1 - depth * Math.exp(-Math.pow((u - 0.5) / 0.1, 2))); s += sp[sp.length - 1]; }
    const out = [0]; let acc = 0; for (let i = 0; i < n; i++) { acc += sp[i] / s; out.push(acc); }
    return (u) => { const k = clamp(u * n, 0, n), i = Math.min(n - 1, Math.floor(k)); return lerp(out[i], out[i + 1], k - i); };
  }
  function buildDemo(o) {
    o = o || {}; const r = rng(o.seed || 11), A = o.tremor == null ? 0.0011 : o.tremor;
    const ph = [0, 1, 2, 3, 4, 5].map(() => r() * Math.PI * 2), F = [3.1, 5.3, 7.9], W = [0.6, 0.3, 0.18];
    const P = [], open = [], phase = [], trem = [];
    let cur = POSE.home.slice(), g = 1, tremK = 1, start = null;
    const push = (p, role) => { P.push(p.slice()); open.push(g); phase.push(role || null); trem.push(tremK); };
    for (const st of PLAN) {
      if (st.move) {
        const to = POSE[st.move], n = Math.round(st.T * HZ), warp = st.dip ? dipWarp(200, o.dip == null ? 0.84 : o.dip) : null;
        if (start == null) start = P.length;
        for (let i = 1; i <= n; i++) { const u = i / n, s = minJerk(warp ? warp(u) : u); tremK = 1; push([lerp(cur[0], to[0], s), lerp(cur[1], to[1], s)], 'move:' + st.move); }
        cur = to.slice();
      } else if (st.hold) {
        const n = Math.round(st.hold * HZ); tremK = st.tremor || 1;
        for (let i = 0; i < n; i++) push(cur, 'hold:' + (st.role || ''));
        tremK = 1;
      } else if (st.grip != null) { g = st.grip; }
    }
    // дрожь: гладкий шум, у остановки перед полкой — сильнее (оператор прицеливается)
    const n = P.length, pos = [], q = [];
    for (let i = 0; i < n; i++) {
      const t = i / HZ; let nx = 0, nz = 0;
      for (let k = 0; k < 3; k++) { nx += W[k] * Math.sin(2 * Math.PI * F[k] * t + ph[k]); nz += W[k] * Math.sin(2 * Math.PI * F[k] * 1.13 * t + ph[k + 3]); }
      const a = A * trem[i]; pos.push([P[i][0] + a * nx, P[i][1] + a * nz]); q.push(ik(pos[i][0], pos[i][1]));
    }
    // скорость — самая быстрая из трёх суставов, рад/с (центральная разность), сглаженная по SMOOTH кадрам
    const raw = new Float64Array(n), speed = new Float64Array(n), hw = (SMOOTH - 1) / 2;
    for (let i = 0; i < n; i++) { const a = q[Math.max(0, i - 1)], b = q[Math.min(n - 1, i + 1)], dt = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) / HZ; let m = 0; for (let j = 0; j < 3; j++) m = Math.max(m, Math.abs(b[j] - a[j]) / dt); raw[i] = m; }
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - hw); j <= Math.min(n - 1, i + hw); j++) { s += raw[j]; c++; } speed[i] = s / c; }
    return { n, pos, open, phase, speed, raw, q, hz: HZ, start };
  }

  /** Эвристика ключевых поз. eps — порог скорости (рад/с); grip — учитывать ли состояние захвата;
   *  w — сколько кадров до и после смены состояния захвата считаются «меняется».
   *  Кадр подходит, если скорость < eps и (при grip) захват не меняется. Подряд идущие подходящие
   *  кадры — одна остановка; ключевая поза — её первый кадр. Остановка до начала движения не считается. */
  function keyframes(demo, eps, grip, w) {
    w = w == null ? GRIP_W : w; const n = demo.n, ok = new Uint8Array(n), out = [];
    for (let i = 0; i < n; i++) {
      let steady = true;
      if (grip) for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) if (demo.open[j] !== demo.open[i]) { steady = false; break; }
      ok[i] = demo.speed[i] < eps && steady ? 1 : 0;
    }
    const runs = [];
    for (let i = 0; i < n; i++) if (ok[i] && (i === 0 || !ok[i - 1])) { let j = i; while (j + 1 < n && ok[j + 1]) j++; runs.push([i, j]); }
    // разрыв короче MERGE кадров внутри остановки — дрожь руки, а не движение: склеиваем
    for (let k = runs.length - 1; k > 0; k--) if (runs[k][0] - runs[k - 1][1] - 1 < MERGE && demo.open[runs[k][0]] === demo.open[runs[k - 1][1]]) { runs[k - 1][1] = runs[k][1]; runs.splice(k, 1); }
    const moving = runs.filter(([a]) => a >= (demo.start || 1));   // остановка до начала движения не считается
    for (const [a, b] of moving) out.push({ f: a, end: b, p: demo.pos[a].slice(), open: demo.open[a] });
    return { kfs: out, runs: moving, ok };
  }
  /** Ключевые позы через равные промежутки: m кадров. */
  function intervalKeyframes(demo, m) {
    const out = []; for (let k = 1; k <= m; k++) { const f = Math.round(k * (demo.n - 1) / m); out.push({ f, end: f, p: demo.pos[f].slice(), open: demo.open[f] }); }
    return { kfs: out, runs: [], ok: null };
  }
  /** Какие роли (позы из плана) поймали ключевые позы: ближе 2,5 см и с тем же состоянием захвата. */
  function roles(kfs) {
    const want = { pre: 1, grasp: 0, lift: 0, preplace: 0, place: 1, retreat: 1 }, got = {};
    for (const k of Object.keys(want)) got[k] = kfs.some((f) => f.open === want[k] && Math.hypot(f.p[0] - POSE[k][0], f.p[1] - POSE[k][1]) < 0.025);
    return got;
  }

  /* ---------- исполнение: планировщик ведёт захват по прямой от позы к позе ---------- */
  const overlap = (a, b, m) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
  const cupRectAt = (x, z) => ({ x0: x - CUP.r, x1: x + CUP.r, z0: z - CUP.gz, z1: z - CUP.gz + CUP.h });
  const handRectAt = (x, z) => ({ x0: x - 0.15, x1: x - 0.045, z0: z - 0.025, z1: z + 0.025 });
  const CUP0 = { x0: CUP.x - CUP.r, x1: CUP.x + CUP.r, z0: 0, z1: CUP.h };
  const ZONE = { x0: CUP0.x0 - 0.06, x1: CUP0.x1, z0: 0, z1: CUP0.z1 + 0.02 };
  const inZone = (x, z) => x > ZONE.x0 && x < ZONE.x1 && z > ZONE.z0 && z < ZONE.z1;
  /** Проиграть ключевые позы. Возвращает путь, события и первый отказ (или успех). */
  function replay(kfs, start) {
    let p = (start || POSE.home).slice(), open = 1, cup = 'table', knocked = false;
    const path = [p.slice()], ev = [], segs = [];
    const fail = (type, at, msg, k) => { if (at && (path[path.length - 1][0] !== at[0] || path[path.length - 1][1] !== at[1])) path.push(at.slice()); return { ok: false, type, at, msg, k, path, ev, segs, cup }; };
    for (let k = 0; k < kfs.length; k++) {
      const to = kfs[k].p, L = Math.hypot(to[0] - p[0], to[1] - p[1]), n = Math.max(1, Math.ceil(L / 0.004));
      const seg = { from: p.slice(), to: to.slice(), held: cup === 'held', k };
      segs.push(seg);
      let prevIn = inZone(p[0], p[1]);
      for (let i = 1; i <= n; i++) {
        const x = lerp(p[0], to[0], i / n), z = lerp(p[1], to[1], i / n);
        const hand = handRectAt(x, z);
        for (const o of OBST) if (overlap(hand, o, 0.001)) { seg.hit = [x, z]; return fail('handHit', [x, z], `захват задел ${o.name}`, k); }
        if (cup === 'held') {
          const c = cupRectAt(x, z);
          for (const o of OBST) if (overlap(c, o, 0.001)) { seg.hit = [x, z]; return fail('cupHit', [x, z], `чашка задела ${o.name}`, k); }
        } else if (cup === 'table') {
          const nowIn = inZone(x, z);
          if (nowIn && !prevIn) {
            const dx = to[0] - p[0], dz = to[1] - p[1];
            if (!open || !(dx > 0 && Math.abs(dz) <= 0.47 * dx)) { seg.hit = [x, z]; knocked = true; return fail('knock', [x, z], open ? 'захват задел чашку сверху: подходить к ней нужно сбоку' : 'сжатый захват задел чашку', k); }
          }
          if (overlap(hand, CUP0, 0.001)) { seg.hit = [x, z]; return fail('knock', [x, z], 'захват задел чашку', k); }
          prevIn = nowIn;
        }
        path.push([x, z]);
      }
      p = to.slice(); seg.i1 = path.length - 1;
      if (kfs[k].open !== open) {
        open = kfs[k].open;
        if (!open && cup === 'table') {
          const d = Math.hypot(p[0] - POSE.grasp[0], p[1] - POSE.grasp[1]);
          if (d < 0.02 && !knocked) { cup = 'held'; ev.push({ type: 'grasp', at: p.slice(), k, i: path.length - 1 }); }
          else { ev.push({ type: 'miss', at: p.slice(), k, i: path.length - 1 }); return fail('missGrasp', p.slice(), p[1] > CUP.h + 0.02 ? 'захват сжался в воздухе, чашка осталась на столе' : 'захват сжался мимо чашки', k); }
        } else if (open && cup === 'held') {
          const c = cupRectAt(p[0], p[1]), gap = c.z0 - SHELF.z[1] - SHELF.t, inside = c.x0 >= SHELF.xf + 0.01 && c.x1 <= SHELF.xb - 0.005;
          if (inside && gap >= -0.003 && gap <= 0.025) { cup = 'placed'; ev.push({ type: 'place', at: p.slice(), k, i: path.length - 1 }); }
          else { cup = 'dropped'; ev.push({ type: 'drop', at: p.slice(), k, i: path.length - 1 }); return fail('drop', p.slice(), inside ? `чашку отпустили в ${Math.round(gap * 100)} см над полкой, она упала` : 'чашку отпустили не на полке, она упала', k); }
        }
      }
    }
    if (cup !== 'placed') return fail(cup === 'held' ? 'notPlaced' : 'noGrasp', p.slice(), cup === 'held' ? 'чашку так и не отпустили на полке' : 'чашку так и не взяли', kfs.length - 1);
    return { ok: true, type: 'ok', at: p.slice(), msg: 'чашка стоит на верхней полке', path, ev, segs, cup };
  }
  /** Вероятность пройти эпизод без роковой ошибки, если на каждом из T решений она случается с вероятностью e. */
  const survive = (e, T) => Math.pow(1 - e, T);

  /* =====================================================================
     2. Следующий лучший воксель
     ===================================================================== */
  const VN = 20, VS = 0.05;                                  // 20 вокселей по стороне, 5 см
  const vi = (x, y, z) => (z * VN + y) * VN + x;
  const OCC = { table: 1, shelf: 2, cup: 3, hand: 4 };
  const SH = { w: 9, d: 6, legs: 2, b: [3, 8, 13] };          // стеллаж: ширина и глубина в вокселях, ножки, полки
  /** Сцена: стол (слой z = 0), стеллаж на ножках с двумя полками, чашка в захвате перед стеллажом. */
  function voxScene(seed, o) {
    o = o || {}; const r = rng(seed), occ = new Uint8Array(VN * VN * VN);
    const x0 = o.x0 != null ? o.x0 : 1 + Math.floor(r() * (VN - SH.w - 1)), y0 = o.y0 != null ? o.y0 : 9 + Math.floor(r() * 4);
    const set = (x, y, z, v) => { if (x >= 0 && y >= 0 && z >= 0 && x < VN && y < VN && z < VN) occ[vi(x, y, z)] = v; };
    for (let y = 0; y < VN; y++) for (let x = 0; x < VN; x++) set(x, y, 0, OCC.table);
    const x1 = x0 + SH.w - 1, y1 = y0 + SH.d - 1, zt = SH.b[2];
    for (const [lx, ly] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) for (let z = 1; z < SH.b[0]; z++) set(lx, ly, z, OCC.shelf);
    for (const bz of SH.b) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, bz, OCC.shelf);
    for (let z = SH.b[0]; z <= zt; z++) { for (let y = y0; y <= y1; y++) { set(x0, y, z, OCC.shelf); set(x1, y, z, OCC.shelf); } for (let x = x0; x <= x1; x++) set(x, y1, z, OCC.shelf); }
    // чашка в захвате: 2 × 2 × 2 вокселя перед стеллажом, кисть — над ней ближе к роботу
    const cx = o.cx != null ? o.cx : x0 + 2 + Math.floor(r() * 4), cy = o.cy != null ? o.cy : y0 - 6 + Math.floor(r() * 3), cz = o.cz != null ? o.cz : 6 + Math.floor(r() * 4);
    for (let z = cz; z < cz + 2; z++) for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) set(x, y, z, OCC.cup);
    for (let x = cx; x < cx + 2; x++) { set(x, cy - 1, cz + 1, OCC.hand); set(x, cy - 2, cz + 1, OCC.hand); }
    const tx = x0 + 4, ty = y0 + 2;
    return { occ, x0, y0, cup: [cx, cy, cz], target: { upper: vi(tx, ty, SH.b[1] + 1), lower: vi(tx, ty, SH.b[0] + 1) }, tz: { upper: SH.b[1] + 1, lower: SH.b[0] + 1 } };
  }
  const vxyz = (i) => [i % VN, Math.floor(i / VN) % VN, Math.floor(i / (VN * VN))];
  /** На какой полке воксель: внутри стеллажа сразу над доской. */
  function shelfOf(sc, i) {
    const [x, y, z] = vxyz(i);
    if (x <= sc.x0 || x >= sc.x0 + SH.w - 1 || y < sc.y0 || y >= sc.y0 + SH.d - 1) return null;
    if (z === SH.b[0] + 1) return 'lower'; if (z === SH.b[1] + 1) return 'upper';
    return null;
  }
  /** Признаки вокселя: свободен ли он; занятость в столбце над и под ним на K вокселей;
   *  четыре соседа на той же высоте и под ними. Плюс смещение. Битовая маска + число признаков. */
  function featDim(K) { return 1 + 2 * K + 8 + 1; }
  function features(sc, K) {
    const n = VN * VN * VN, F = featDim(K), occ = sc.occ, codes = new Float64Array(n);
    const o = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < VN && y < VN && z < VN && occ[vi(x, y, z)] ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = i % VN, y = Math.floor(i / VN) % VN, z = Math.floor(i / (VN * VN));
      let code = 0, b = 1;
      const put = (v) => { if (v) code += b; b *= 2; };
      put(1 - o(x, y, z));
      for (let d = 1; d <= K; d++) { put(o(x, y, z - d)); put(o(x, y, z + d)); }
      put(o(x - 1, y, z)); put(o(x + 1, y, z)); put(o(x, y - 1, z)); put(o(x, y + 1, z));
      put(o(x - 1, y, z - 1)); put(o(x + 1, y, z - 1)); put(o(x, y - 1, z - 1)); put(o(x, y + 1, z - 1));
      put(1);
      codes[i] = code;
    }
    // одинаковые наборы признаков — одна строка с кратностью: так softmax по 8000 вокселям считается быстро
    const map = new Map(), uniq = [], cnt = [], of = new Int32Array(n);
    for (let i = 0; i < n; i++) { let u = map.get(codes[i]); if (u == null) { u = uniq.length; map.set(codes[i], u); uniq.push(codes[i]); cnt.push(0); } cnt[u]++; of[i] = u; }
    const X = uniq.map((c) => { const v = new Float64Array(F); let cc = c; for (let k = 0; k < F; k++) { v[k] = cc % 2; cc = Math.floor(cc / 2); } return v; });
    return { F, X, cnt, of, K };
  }
  const CMDS = ['upper', 'lower', 'any'];
  const CMD_TEXT = { upper: 'поставь чашку на верхнюю полку', lower: 'поставь чашку на нижнюю полку', any: 'поставь чашку на полку' };
  /** Демонстрации: на каждую команду своя сцена; «на полку» — верхняя или нижняя случайно. */
  function voxDemos(n, seed0) {
    const out = [], r = rng((seed0 || 400) * 7 + 1);
    for (let i = 0; i < n; i++) {
      const cmd = CMDS[i % 3], sc = voxScene((seed0 || 400) + i), shelf = cmd === 'any' ? (Math.floor(i / 3) % 2 ? 'lower' : 'upper') : cmd;
      out.push({ cmd, sc, shelf, target: sc.target[shelf] });
    }
    return out;
  }
  function clsInit(K) { const F = featDim(K), W = {}; for (const c of ['base', ...CMDS]) W[c] = { w: new Float64Array(F), g: new Float64Array(F), m: new Float64Array(F), v: new Float64Array(F) }; return { K, F, W, t: 0 }; }
  function adamStep(P, G, M, V, t, lr, bs) {
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < P.length; i++) { const g = G[i] / bs; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); G[i] = 0; }
  }
  /** Оценки уникальных строк признаков для команды cmd. */
  function rowScores(m, fx, cmd) { const wb = m.W.base.w, wc = m.W[cmd].w; return fx.X.map((x) => { let s = 0; for (let k = 0; k < m.F; k++) if (x[k]) s += wb[k] + wc[k]; return s; }); }
  /** Обучение перекрёстной энтропией по всем вокселям. Генератор: отдаёт прогресс, в конце — модель. */
  function* clsTrain(m, demos, o) {
    o = o || {}; const iters = o.iters || 120, lr = o.lr || 0.15;
    const fxs = demos.map((d) => d.fx || (d.fx = {})).map((c, i) => c[m.K] || (c[m.K] = features(demos[i].sc, m.K)));
    for (let it = 0; it < iters; it++) {
      let loss = 0;
      demos.forEach((d, di) => {
        const fx = fxs[di], s = rowScores(m, fx, d.cmd); let mx = -1e9; for (const v of s) mx = Math.max(mx, v);
        let Z = 0; const e = s.map((v, u) => { const x = fx.cnt[u] * Math.exp(v - mx); Z += x; return x; });
        const tu = fx.of[d.target]; loss += (Math.log(Z) + mx - s[tu]) / demos.length;
        const G0 = m.W.base.g, Gc = m.W[d.cmd].g;
        for (let u = 0; u < s.length; u++) { const p = e[u] / Z - (u === tu ? 1 : 0); if (Math.abs(p) < 1e-12) continue; const x = fx.X[u]; for (let k = 0; k < m.F; k++) if (x[k]) { G0[k] += p; Gc[k] += p; } }
      });
      m.t++; for (const c of ['base', ...CMDS]) { const W = m.W[c]; adamStep(W.w, W.g, W.m, W.v, m.t, lr, demos.length); }
      if (it % 6 === 0 || it === iters - 1) yield { it, iters, loss };
    }
    return m;
  }
  /** Оценки всех вокселей сцены и вероятности (softmax). */
  function voxQ(m, sc, cmd, fx) {
    fx = fx || features(sc, m.K); const s = rowScores(m, fx, cmd), n = VN * VN * VN, q = new Float64Array(n);
    for (let i = 0; i < n; i++) q[i] = s[fx.of[i]];
    let mx = -1e9; for (const v of q) mx = Math.max(mx, v); let Z = 0; const p = new Float64Array(n); for (let i = 0; i < n; i++) { p[i] = Math.exp(q[i] - mx); Z += p[i]; } for (let i = 0; i < n; i++) p[i] /= Z;
    return { q, p };
  }
  /** Самый ценный воксель; при точной ничьей — случайный из лучших (с зерном): так ведёт себя argmax на равных оценках. */
  function voxArgmax(q, seed) {
    let mx = -1e9; for (const v of q) mx = Math.max(mx, v);
    const top = []; for (let i = 0; i < q.length; i++) if (q[i] > mx - 1e-9) top.push(i);
    if (top.length === 1) return top[0];
    // среди лучших — ближайший к их центру по горизонтали, а при ничьей по высоте — случайная полка
    const zs = [...new Set(top.map((i) => vxyz(i)[2]))], zPick = zs[Math.floor(rng(seed || 1)() * zs.length)];
    const lay = top.filter((i) => vxyz(i)[2] === zPick), cx = lay.reduce((s, i) => s + vxyz(i)[0], 0) / lay.length, cy = lay.reduce((s, i) => s + vxyz(i)[1], 0) / lay.length;
    let best = lay[0], bd = 1e9; for (const i of lay) { const [x, y] = vxyz(i), d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd - 1e-9) { bd = d; best = i; } }
    return best;
  }
  /** Регрессия: координаты цели по точному положению стеллажа и команде — метод наименьших квадратов. */
  /** Признаки регрессии для координаты k: положение стеллажа по этой оси (для x и y) и команда. */
  function regFeat(sc, cmd, k) { const c = [cmd === 'upper' ? 1 : 0, cmd === 'lower' ? 1 : 0, cmd === 'any' ? 1 : 0]; return k === 0 ? [sc.x0, ...c] : k === 1 ? [sc.y0, ...c] : c; }
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]]; const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / (r[i] || 1e-12));
  }
  function regTrain(demos) {
    const Y = demos.map((d) => vxyz(d.target)), W = [];
    for (let k = 0; k < 3; k++) {
      const X = demos.map((d) => regFeat(d.sc, d.cmd, k)), F = X[0].length;
      const A = Array.from({ length: F }, (_, i) => Array.from({ length: F }, (__, j) => X.reduce((s, x) => s + x[i] * x[j], 0) + (i === j ? 1e-6 : 0)));
      const b = Array.from({ length: F }, (_, i) => X.reduce((s, x, r) => s + x[i] * Y[r][k], 0));
      W.push(solve(A, b));
    }
    return { W, mse: demos.reduce((s, d, r) => { const p = regPredict({ W }, d.sc, d.cmd), t = Y[r]; return s + ((p[0] - t[0]) ** 2 + (p[1] - t[1]) ** 2 + (p[2] - t[2]) ** 2) / demos.length; }, 0) };
  }
  function regPredict(m, sc, cmd) { return m.W.map((w, k) => { const x = regFeat(sc, cmd, k); return w.reduce((s, v, i) => s + v * x[i], 0); }); }
  /** Где точка регрессии относительно полок: высота над ближайшей опорой снизу (в вокселях) и на полке ли она. */
  function regWhere(sc, p) {
    const [x, y, z] = p.map((v) => Math.round(v)), insideXY = x > sc.x0 && x < sc.x0 + SH.w - 1 && y >= sc.y0 && y < sc.y0 + SH.d - 1;
    let below = -1; for (let zz = Math.floor(p[2] - 1e-9); zz >= 0; zz--) { if (x >= 0 && y >= 0 && x < VN && y < VN && sc.occ[vi(x, y, zz)]) { below = zz; break; } }
    const gap = p[2] - (below + 1);
    const shelf = insideXY && Math.abs(gap) < 0.5 ? (below === SH.b[1] ? 'upper' : below === SH.b[0] ? 'lower' : null) : null;
    return { gap, below, shelf, insideXY };
  }
  /** Проверка на новых сценах: доля сцен, где выбранный воксель — на названной полке. */
  function voxEval(m, n, seed0) {
    const res = { upper: 0, lower: 0, n, runs: [] };
    for (let i = 0; i < n; i++) {
      const sc = voxScene((seed0 || 7000) + i), fx = features(sc, m.K);
      for (const cmd of ['upper', 'lower']) { const { q } = voxQ(m, sc, cmd, fx), a = voxArgmax(q, (seed0 || 7000) * 3 + i * 2 + (cmd === 'upper' ? 0 : 1)), ok = shelfOf(sc, a) === cmd; if (ok) res[cmd]++; res.runs.push({ i, cmd, a, ok }); }
    }
    res.rate = (res.upper + res.lower) / (2 * n);
    return res;
  }

  /* =====================================================================
     3. Стоимость внимания и число выходов
     ===================================================================== */
  const LANG = 77, LAYERS = 6, BATCH = 16, BYTES = 4;
  /** Сколько токенов: патчи сетки плюс 77 токенов текста. */
  const tokens = (G, p) => Math.pow(Math.floor(G / p), 3) + LANG;
  /** Оценки внимания за шаг обучения (одна голова, float32, пакет 16, 6 слоёв): число и байты. */
  function attnCost(G, p, arch, L) {
    const N = tokens(G, p);
    const perEx = arch === 'full' ? LAYERS * N * N : 2 * N * L + LAYERS * L * L;
    return { N, perEx, perLayerFull: N * N, bytes: perEx * BATCH * BYTES, bytesEx: perEx * BYTES };
  }
  /** Выходы головы поворота: по осям отдельно (3 × 360/шаг) или вместе ((360/шаг)³). */
  const rotOutputs = (step, joint) => { const b = Math.round(360 / step); return joint ? b * b * b : 3 * b; };

  /* ---------- таблица 1 статьи: успех (%) при 10 и 100 демонстрациях на задачу ---------- */
  const TABLE1 = {
    tasks: ['open drawer', 'slide block', 'sweep to dustpan', 'meat off grill', 'turn tap', 'put in drawer', 'close jar', 'drag stick', 'stack blocks', 'screw bulb', 'put in safe', 'place wine', 'put in cupboard', 'sort shape', 'push buttons', 'insert peg', 'stack cups', 'place cups'],
    ru: ['открыть ящик', 'сдвинуть блок', 'смести в совок', 'снять мясо с гриля', 'повернуть кран', 'положить в ящик', 'закрыть банку', 'подтянуть палкой', 'сложить блоки', 'вкрутить лампочку', 'убрать в сейф', 'поставить бутылку', 'убрать в шкаф', 'сортер фигур', 'нажать кнопки', 'надеть на штырь', 'сложить стаканы', 'поставить чашки'],
    rows: {
      cnn: [4, 4, 4, 0, 0, 0, 0, 0, 20, 8, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0],
      vit: [16, 0, 8, 0, 8, 0, 0, 0, 24, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0],
      c2f: [28, 20, 12, 16, 4, 0, 40, 20, 60, 68, 12, 4, 28, 24, 72, 24, 4, 0, 12, 8, 0, 12, 36, 8, 4, 0, 8, 8, 88, 72, 0, 4, 0, 0, 0, 0],
      nolang: [20, 28, 8, 12, 20, 16, 40, 48, 36, 60, 16, 16, 16, 12, 48, 60, 0, 0, 0, 24, 8, 20, 8, 20, 0, 0, 0, 0, 60, 68, 4, 0, 0, 0, 0, 0],
      peract: [68, 80, 32, 72, 72, 56, 68, 84, 72, 80, 16, 68, 32, 60, 36, 68, 12, 36, 28, 24, 16, 44, 20, 12, 0, 16, 16, 20, 56, 48, 4, 0, 0, 0, 0, 0],
    },
    /** Успех строки row на задаче t при nd = 10 или 100 демонстрациях. */
    at(row, t, nd) { return this.rows[row][t * 2 + (nd === 100 ? 1 : 0)]; },
  };

  const API = { rng, randn, clamp, lerp, HZ, SMOOTH, GRIP_W, MERGE, ARM, CUP, SHELF, OBST, POSE, ROLE_NAME, ik, armPoints, minJerk, PLAN, buildDemo, keyframes, intervalKeyframes, roles, replay, survive, cupRectAt, handRectAt, CUP0, ZONE,
    VN, VS, vi, vxyz, OCC, SH, voxScene, shelfOf, featDim, features, CMDS, CMD_TEXT, voxDemos, clsInit, clsTrain, voxQ, voxArgmax, regTrain, regPredict, regWhere, voxEval,
    LANG, LAYERS, BATCH, BYTES, tokens, attnCost, rotOutputs, TABLE1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L22 = API;
})(typeof window !== 'undefined' ? window : globalThis);
