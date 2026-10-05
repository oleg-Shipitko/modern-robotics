/* =====================================================================
   sim.js — ядро лабораторной «Три робота, одна задача» (без DOM).
   Мир: кухонный стол (вид сверху), рука Ады, чашка-цель,
   отвлекающие предметы, иногда — горячий чайник.
   Три «мозга»: классический конвейер, end-to-end сеть, гибрид.
   Работает и в браузере (window.RC), и в Node (module.exports).
   ===================================================================== */
(function (root) {
  'use strict';
  const RC = (root.RC = root.RC || {});

  /* ---------------- Случайные числа (детерминированно) ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class Rng {
    constructor(seed) { this.r = mulberry32(seed); this.spare = null; }
    next() { return this.r(); }
    uniform(a, b) { return a + (b - a) * this.r(); }
    int(n) { return Math.floor(this.r() * n); }
    normal() {
      if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
      let u = 0;
      while (u === 0) u = this.r();
      const v = this.r();
      const m = Math.sqrt(-2 * Math.log(u));
      this.spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    }
    pick(arr) { return arr[this.int(arr.length)]; }
  }

  /* ---------------- Константы мира ---------------- */
  const W = 16;            // разрешение камеры: 16×16 пикселей
  const P = W * W;
  const VMAX = 0.018;      // макс. смещение руки за шаг (доля ширины стола)
  const GRIP_R = 0.03;     // радиус захвата (для столкновений)
  const SUCCESS_R = 0.045; // «дошёл до чашки»
  const T_MAX = 170;       // лимит шагов эпизода
  const ARENA_MIN = 0.03, ARENA_MAX = 0.97;

  const COLORS = {
    counter: [0.86, 0.77, 0.63],
    cupRed: [0.86, 0.16, 0.14],
    cupTeal: [0.1, 0.66, 0.68],
    sugar: [0.22, 0.4, 0.88],
    napkins: [0.25, 0.7, 0.3],
    milk: [0.94, 0.94, 0.91],
    kettle: [0.2, 0.21, 0.24],
    beans: [0.36, 0.22, 0.13],
  };
  const OBJ_R = { cup: 0.058, sugar: 0.06, napkins: 0.06, milk: 0.06, beans: 0.06, kettle: 0.085 };
  const KIND_NAMES = {
    cup: 'чашка', sugar: 'сахарница', napkins: 'салфетница', milk: 'молочник', beans: 'миска с зёрнами', kettle: 'чайник',
  };
  const DRAW_RANK = { kettle: 0, sugar: 1, napkins: 1, milk: 1, beans: 1, cup: 2 };

  // Освещение: яркость × оттенок. «Время суток» t∈[0,1]: 0 — яркий день, 1 — тёмный вечер.
  function lightFromT(t) {
    return { b: 1.1 - 0.55 * t, tint: [1, 1.0 - 0.22 * t, 1.05 - 0.47 * t] };
  }
  const LIGHT = {
    day: () => ({ b: 1.0, tint: [1, 1, 1] }),
    evening: () => lightFromT(0.85),
  };

  /* ---------------- Геометрия ---------------- */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function clipVec(v, m) {
    const n = Math.hypot(v.x, v.y);
    return n > m ? { x: (v.x * m) / n, y: (v.y * m) / n } : { x: v.x, y: v.y };
  }

  /* ---------------- Сцены ---------------- */
  let OBJ_ID = 1;
  function makeObj(kind, x, y, color) {
    return { id: OBJ_ID++, kind, x, y, r: OBJ_R[kind], color: (color || COLORS[kind]).slice() };
  }
  function sceneCup(scene) { return scene.objects.find((o) => o.kind === 'cup'); }
  function sceneKettle(scene) { return scene.objects.find((o) => o.kind === 'kettle') || null; }
  function cloneScene(s) {
    return {
      start: { x: s.start.x, y: s.start.y },
      objects: s.objects.map((o) => ({ ...o, color: o.color.slice() })),
      light: { b: s.light.b, tint: s.light.tint.slice() },
      version: 0,
    };
  }

  // Ставит чайник на отрезок «старт → чашка», чтобы он мешал прямому пути.
  function kettleOnPath(start, cup, rng) {
    const t = rng ? rng.uniform(0.4, 0.55) : 0.47;
    const off = rng ? rng.uniform(-0.025, 0.025) : 0;
    const dx = cup.x - start.x, dy = cup.y - start.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: start.x + dx * t - (dy / n) * off, y: start.y + dy * t + (dx / n) * off };
  }

  /**
   * Случайная сцена.
   * opts.light: 'day' | 'evening' | 'random'
   * opts.cup:   'red' | 'teal'
   * opts.kettle: bool — чайник на прямом пути к чашке
   */
  function randomScene(rng, opts) {
    opts = opts || {};
    for (let attempt = 0; attempt < 200; attempt++) {
      const start = { x: rng.uniform(0.1, 0.9), y: rng.uniform(0.1, 0.9) };
      const cupPos = { x: rng.uniform(0.1, 0.9), y: rng.uniform(0.1, 0.9) };
      const minD = opts.kettle ? 0.58 : 0.3;
      if (dist(start, cupPos) < minD) continue;
      let cupColor;
      if (opts.cup === 'teal') cupColor = COLORS.cupTeal.slice();
      else {
        cupColor = COLORS.cupRed.map((c) => clamp(c + rng.uniform(-0.04, 0.04), 0, 1));
      }
      const objects = [makeObj('cup', cupPos.x, cupPos.y, cupColor)];
      const occupied = [{ x: cupPos.x, y: cupPos.y, r: 0.09 }, { x: start.x, y: start.y, r: 0.08 }];
      if (opts.kettle) {
        const k = kettleOnPath(start, cupPos, rng);
        if (dist(k, cupPos) < 0.27 || dist(k, start) < 0.24) continue;
        objects.push(makeObj('kettle', k.x, k.y));
        occupied.push({ x: k.x, y: k.y, r: 0.12 });
      }
      const kinds = ['sugar', 'napkins', 'milk', 'beans'];
      const nd = 1 + rng.int(3);
      // перемешать виды
      for (let i = kinds.length - 1; i > 0; i--) { const j = rng.int(i + 1); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      let ok = true;
      for (let d = 0; d < nd; d++) {
        let placed = false;
        for (let tr = 0; tr < 60 && !placed; tr++) {
          const p = { x: rng.uniform(0.08, 0.92), y: rng.uniform(0.08, 0.92) };
          if (occupied.every((q) => dist(p, q) > q.r + 0.07)) {
            objects.push(makeObj(kinds[d], p.x, p.y));
            occupied.push({ x: p.x, y: p.y, r: 0.08 });
            placed = true;
          }
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      let light;
      if (opts.light === 'evening') light = LIGHT.evening();
      else if (opts.light === 'random') {
        const L = lightFromT(rng.next());
        light = {
          b: L.b + rng.uniform(-0.04, 0.04),
          tint: [1, L.tint[1] + rng.uniform(-0.03, 0.03), L.tint[2] + rng.uniform(-0.04, 0.04)],
        };
      } else light = LIGHT.day();
      return { start, objects, light, version: 0 };
    }
    throw new Error('randomScene: не удалось разместить объекты');
  }

  /* ---------------- Камера 16×16 ---------------- */
  const SS = 3; // суперсэмплинг на пиксель
  const PX = new Float32Array(P), PY = new Float32Array(P);
  const LOGP = Math.log(P);
  const LEAK = 0.05;
  for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) { PX[i * W + j] = (j + 0.5) / W; PY[i * W + j] = (i + 0.5) / W; }

  function renderClean(scene, out) {
    out = out || new Float32Array(P * 3);
    const objs = scene.objects.slice().sort((a, b) => DRAW_RANK[a.kind] - DRAW_RANK[b.kind]);
    const L = scene.light, cb = COLORS.counter;
    const n = SS * SS;
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < W; j++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const x = (j + (sx + 0.5) / SS) / W, y = (i + (sy + 0.5) / SS) / W;
            let c = cb;
            for (let k = objs.length - 1; k >= 0; k--) {
              const o = objs[k], dx = x - o.x, dy = y - o.y;
              if (dx * dx + dy * dy <= o.r * o.r) { c = o.color; break; }
            }
            r += c[0]; g += c[1]; b += c[2];
          }
        }
        const p = (i * W + j) * 3;
        out[p] = clamp((r / n) * L.b * L.tint[0], 0, 1);
        out[p + 1] = clamp((g / n) * L.b * L.tint[1], 0, 1);
        out[p + 2] = clamp((b / n) * L.b * L.tint[2], 0, 1);
      }
    }
    return out;
  }
  function addNoise(src, out, std, rng) {
    out = out || new Float32Array(src.length);
    if (!(std > 0)) { out.set(src); return out; }
    for (let i = 0; i < src.length; i++) out[i] = clamp(src[i] + std * rng.normal(), 0, 1);
    return out;
  }

  /* ---------------- Классическое восприятие ---------------- */
  // Правила, «написанные инженером днём».
  const RULES_TEXT = {
    base: [
      'def is_cup(r, g, b):',
      '    return r > 0.60 and g < 0.35 and b < 0.35   # красная',
    ],
    teal: [
      '    or (g > 0.50 and b > 0.50 and r < 0.30)    # бирюзовая',
    ],
    wb: [
      'def normalize(img):   # баланс белого по цвету стола',
      '    counter = median(img)   # стол — большая часть кадра',
      '    return img * COUNTER_RGB / counter',
    ],
    obstacle: [
      'def is_obstacle(r, g, b):   # тёмное и серое — чайник',
      '    return mean(r, g, b) < 0.25 and spread(r, g, b) < 0.08',
    ],
    mem: [
      'obstacles = remember(obstacles, frames=12)   # полсекунды',
    ],
  };
  const TMP_SORT = new Float32Array(P);
  function median(arr) {
    TMP_SORT.set(arr);
    TMP_SORT.sort();
    return 0.5 * (TMP_SORT[(P >> 1) - 1] + TMP_SORT[P >> 1]);
  }
  const CH = [new Float32Array(P), new Float32Array(P), new Float32Array(P)];

  /**
   * rules: {wb: bool, teal: bool}
   * Возвращает маски пикселей, найденную чашку (центр крупнейшего пятна) и препятствия.
   */
  function classicalPerceive(img, rules) {
    rules = rules || {};
    let gains = [1, 1, 1];
    if (rules.wb) {
      for (let p = 0; p < P; p++) { CH[0][p] = img[3 * p]; CH[1][p] = img[3 * p + 1]; CH[2][p] = img[3 * p + 2]; }
      for (let c = 0; c < 3; c++) gains[c] = COLORS.counter[c] / Math.max(0.05, median(CH[c]));
    }
    const cupMask = new Uint8Array(P), obsMask = new Uint8Array(P);
    for (let p = 0; p < P; p++) {
      const r = img[3 * p] * gains[0], g = img[3 * p + 1] * gains[1], b = img[3 * p + 2] * gains[2];
      let cup = r > 0.6 && g < 0.35 && b < 0.35;
      if (!cup && rules.teal) cup = g > 0.5 && b > 0.5 && r < 0.3;
      cupMask[p] = cup ? 1 : 0;
      const m = (r + g + b) / 3, spread = Math.max(r, g, b) - Math.min(r, g, b);
      obsMask[p] = m < 0.25 && spread < 0.08 ? 1 : 0;
    }
    // крупнейшая связная компонента маски чашки
    const label = new Int16Array(P).fill(-1);
    let best = null;
    const stack = [];
    for (let p = 0; p < P; p++) {
      if (!cupMask[p] || label[p] >= 0) continue;
      const comp = [];
      stack.push(p); label[p] = p;
      while (stack.length) {
        const q = stack.pop(); comp.push(q);
        const qi = (q / W) | 0, qj = q % W;
        const nb = [[qi - 1, qj], [qi + 1, qj], [qi, qj - 1], [qi, qj + 1]];
        for (const [a, b] of nb) {
          if (a < 0 || b < 0 || a >= W || b >= W) continue;
          const t = a * W + b;
          if (cupMask[t] && label[t] < 0) { label[t] = p; stack.push(t); }
        }
      }
      if (!best || comp.length > best.length) best = comp;
    }
    let cup = null;
    if (best) {
      let sx = 0, sy = 0;
      for (const q of best) { sx += PX[q]; sy += PY[q]; }
      cup = { x: sx / best.length, y: sy / best.length, n: best.length };
    }
    const obstacles = [];
    for (let p = 0; p < P; p++) if (obsMask[p]) obstacles.push({ x: PX[p], y: PY[p] });
    return { cupMask, obsMask, cup, obstacles, gains };
  }

  /* ---------------- Фильтр Калмана (неподвижная цель) ---------------- */
  class KF {
    constructor() { this.x = null; this.P = 0; }
    reset() { this.x = null; this.P = 0; }
    update(z, R) {
      if (!this.x) { this.x = { x: z.x, y: z.y }; this.P = R; return; }
      this.P += 2e-5;
      if (dist(z, this.x) > 0.15) { this.x = { x: z.x, y: z.y }; this.P = R; return; } // цель переставили
      const K = this.P / (this.P + R);
      this.x.x += K * (z.x - this.x.x);
      this.x.y += K * (z.y - this.x.y);
      this.P *= 1 - K;
    }
    predict() { if (this.x) this.P += 2e-5; }
    sigma() { return Math.sqrt(this.P); }
  }

  /* ---------------- Планировщик A* на сетке ---------------- */
  const G = 40;
  class GridPlanner {
    constructor() { this.blocked = new Uint8Array(G * G); this.obstacles = []; this.inflate = 0; }
    setObstacles(points, inflate) {
      this.obstacles = points; this.inflate = inflate;
      this.blocked.fill(0);
      if (!points.length) return;
      const r2 = inflate * inflate;
      for (let i = 0; i < G; i++) {
        for (let j = 0; j < G; j++) {
          const x = (j + 0.5) / G, y = (i + 0.5) / G;
          for (const o of points) {
            const dx = x - o.x, dy = y - o.y;
            if (dx * dx + dy * dy < r2) { this.blocked[i * G + j] = 1; break; }
          }
        }
      }
    }
    isFreePoint(pt) {
      if (!this.obstacles.length) return true;
      const r2 = this.inflate * this.inflate;
      for (const o of this.obstacles) { const dx = pt.x - o.x, dy = pt.y - o.y; if (dx * dx + dy * dy < r2) return false; }
      return true;
    }
    cellOf(pt) {
      return [clamp(Math.floor(pt.y * G), 0, G - 1), clamp(Math.floor(pt.x * G), 0, G - 1)];
    }
    segmentFree(a, b) {
      const n = Math.ceil(dist(a, b) / (0.25 / G)) + 1;
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const i = clamp(Math.floor(y * G), 0, G - 1), j = clamp(Math.floor(x * G), 0, G - 1);
        if (this.blocked[i * G + j]) return false;
      }
      return true;
    }
    // Возвращает список точек пути или null. Если старт внутри зоны — выходит к ближайшей свободной клетке.
    plan(start, goal) {
      if (!this.obstacles.length) return [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }];
      const [gi, gj] = this.cellOf(goal);
      if (this.blocked[gi * G + gj]) return null; // цель в опасной зоне
      let [si, sj] = this.cellOf(start);
      let startPt = { x: start.x, y: start.y };
      if (this.blocked[si * G + sj]) {
        // ближайшая свободная клетка
        let bestD = 1e9, bi = -1, bj = -1;
        for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
          if (this.blocked[i * G + j]) continue;
          const d = (i - si) * (i - si) + (j - sj) * (j - sj);
          if (d < bestD) { bestD = d; bi = i; bj = j; }
        }
        if (bi < 0) return null;
        si = bi; sj = bj; startPt = { x: (sj + 0.5) / G, y: (si + 0.5) / G };
      }
      const N = G * G, gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const heap = []; // [f, idx]
      const push = (f, idx) => {
        heap.push([f, idx]);
        let c = heap.length - 1;
        while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; let c = 0;
          for (;;) {
            const l = 2 * c + 1, r = l + 1; let m = c;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
          }
        }
        return top;
      };
      const s = si * G + sj, t = gi * G + gj;
      const h = (i, j) => Math.hypot(i - gi, j - gj);
      gScore[s] = 0; push(h(si, sj), s);
      let found = false;
      while (heap.length) {
        const [, u] = pop();
        if (closed[u]) continue;
        if (u === t) { found = true; break; }
        closed[u] = 1;
        const ui = (u / G) | 0, uj = u % G;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const vi = ui + di, vj = uj + dj;
          if (vi < 0 || vj < 0 || vi >= G || vj >= G) continue;
          const v = vi * G + vj;
          if (this.blocked[v] || closed[v]) continue;
          if (di && dj && (this.blocked[ui * G + vj] || this.blocked[vi * G + uj])) continue;
          const ng = gScore[u] + (di && dj ? Math.SQRT2 : 1);
          if (ng < gScore[v]) { gScore[v] = ng; came[v] = u; push(ng + h(vi, vj), v); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let u = t; u !== -1; u = came[u]) cells.push(u);
      cells.reverse();
      const pts = cells.map((u) => ({ x: ((u % G) + 0.5) / G, y: (((u / G) | 0) + 0.5) / G }));
      pts[0] = startPt; pts[pts.length - 1] = { x: goal.x, y: goal.y };
      // сглаживание «по прямой видимости»
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !this.segmentFree(pts[i], pts[j])) j--;
        out.push(pts[j]); i = j;
      }
      if (startPt !== pts[0] || dist(startPt, start) > 1e-6) out.unshift({ x: start.x, y: start.y });
      return out;
    }
  }

  // Следование пути: цель — ближайшая непройденная точка; у финиша — P-регулятор.
  function followPath(g, path) {
    if (!path || path.length < 2) return { x: 0, y: 0 };
    // выбросить пройденные точки
    while (path.length > 2 && dist(g, path[1]) < 0.035) path.splice(1, 1);
    const target = path[1];
    const last = path.length === 2;
    const k = last ? 0.22 : 0.5;
    return clipVec({ x: k * (target.x - g.x), y: k * (target.y - g.y) }, VMAX);
  }

  /* ---------------- Эксперт (оператор телеуправления) ---------------- */
  function leftDetour(start, cup, kettle) {
    const dx = cup.x - start.x, dy = cup.y - start.y, n = Math.hypot(dx, dy) || 1;
    const off = kettle.r + GRIP_R + 0.07;
    // «слева по ходу движения» на экране (ось y направлена вниз)
    const wp = { x: kettle.x + (dy / n) * off, y: kettle.y - (dx / n) * off };
    return [{ x: start.x, y: start.y }, wp, { x: cup.x, y: cup.y }];
  }
  function expertRollout(scene, rng, opts) {
    opts = opts || {};
    const cup = sceneCup(scene), kettle = sceneKettle(scene);
    let planner = null, path = null, fixedPath = null;
    if (kettle && opts.kettleSide === 'left') fixedPath = leftDetour(scene.start, cup, kettle);
    else if (kettle) {
      planner = new GridPlanner();
      planner.setObstacles([{ x: kettle.x, y: kettle.y }], kettle.r + GRIP_R + 0.035);
    }
    const g = { x: scene.start.x, y: scene.start.y };
    const states = [];
    let after = 0;
    for (let t = 0; t < 140; t++) {
      let a;
      if (fixedPath) a = followPath(g, fixedPath);
      else if (planner) {
        if (t % 6 === 0 || !path) path = planner.plan(g, cup) || [g, cup];
        a = followPath(g, path);
      } else {
        a = clipVec({ x: 0.22 * (cup.x - g.x), y: 0.22 * (cup.y - g.y) }, VMAX);
      }
      states.push({ g: { x: g.x, y: g.y }, a: { x: a.x, y: a.y } });
      // исполняемое действие — с «дрожью руки» оператора (метка остаётся чистой)
      const noise = opts.actNoise != null ? opts.actNoise : 0.25;
      const ex = { x: a.x + noise * VMAX * rng.normal(), y: a.y + noise * VMAX * rng.normal() };
      const v = clipVec(ex, VMAX);
      g.x = clamp(g.x + v.x, ARENA_MIN, ARENA_MAX);
      g.y = clamp(g.y + v.y, ARENA_MIN, ARENA_MAX);
      if (dist(g, cup) < SUCCESS_R * 0.6) { after++; if (after > 4) break; }
    }
    return states;
  }

  /* ---------------- Нейросеть: 1×1 свёртки + spatial softmax + MLP ----------------
     Архитектура по мотивам Levine, Finn, Darrell, Abbeel (2016):
     пиксели → признаки в каждом пикселе → «ключевые точки» (центры масс карт
     внимания) → полносвязная сеть → действие. */
  function Param(n, std, rng) {
    const w = new Float32Array(n);
    if (std > 0) for (let i = 0; i < n; i++) w[i] = std * rng.normal();
    return w;
  }
  class KeypointNet {
    /** head: 'policy' (действие из ключевых точек и проприоцепции) | 'percept' (координаты чашки) */
    constructor(seed, cfg) {
      cfg = cfg || {};
      const rng = new Rng(seed);
      this.C1 = cfg.C1 || 8; this.K = cfg.K || 4; this.H = cfg.H || 32; this.head = cfg.head || 'policy';
      this.presScale = cfg.pres === false ? 0 : 0.25;
      const C1 = this.C1, K = this.K, H = this.H;
      this.inDim = this.head === 'policy' ? 3 * K + 2 : 2 * K;
      this.point = this.head === 'point';
      this.W1 = Param(C1 * 3, Math.sqrt(2 / 3), rng); this.b1 = Param(C1, 0, rng);
      for (let c = 0; c < C1; c++) this.b1[c] = 0.1 * rng.normal();
      this.W2 = Param(K * C1, 0.3, rng); this.b2 = Param(K, 0, rng);
      this.Wa = Param(H * this.inDim, Math.sqrt(2 / this.inDim), rng); this.ba = Param(H, 0.1, rng);
      if (this.head === 'policy') {
        this.Wb = Param(H * H, Math.sqrt(2 / H), rng); this.bb = Param(H, 0.1, rng);
      }
      this.Wc = Param(2 * H, 0.05, rng); this.bc = Param(2, 0, rng);
      this.names = this.head === 'policy'
        ? ['W1', 'b1', 'W2', 'b2', 'Wa', 'ba', 'Wb', 'bb', 'Wc', 'bc']
        : this.point ? ['W1', 'b1', 'W2', 'b2'] : ['W1', 'b1', 'W2', 'b2', 'Wa', 'ba', 'Wc', 'bc'];
      this.grads = {};
      for (const n of this.names) this.grads[n] = new Float32Array(this[n].length);
      // буферы
      this._ha = new Float32Array(H); this._hb = new Float32Array(H);
      this._in = new Float32Array(this.inDim); this._gha = new Float32Array(H); this._ghb = new Float32Array(H);
      this._gin = new Float32Array(this.inDim);
    }
    paramCount() { return this.names.reduce((s, n) => s + this[n].length, 0); }
    toJSON() {
      const o = { cfg: { C1: this.C1, K: this.K, H: this.H, head: this.head, pres: this.presScale > 0 }, w: {} };
      for (const n of this.names) o.w[n] = Array.from(this[n]);
      return o;
    }
    static fromJSON(o) {
      const net = new KeypointNet(1, o.cfg);
      for (const n of net.names) net[n].set(o.w[n]);
      return net;
    }
    zeroGrad() { for (const n of this.names) this.grads[n].fill(0); }

    /** Свёрточная часть: возвращает признаки, карты внимания и ключевые точки. */
    features(img, out) {
      const C1 = this.C1, K = this.K;
      out = out || { h1: new Float32Array(P * C1), F: new Float32Array(K * P), S: new Float32Array(K * P), kp: new Float32Array(2 * K), pres: new Float32Array(K) };
      const { h1, F, S, kp, pres } = out;
      const W1 = this.W1, b1 = this.b1, W2 = this.W2, b2 = this.b2;
      for (let p = 0; p < P; p++) {
        const x0 = img[3 * p], x1 = img[3 * p + 1], x2 = img[3 * p + 2];
        const ho = p * C1;
        for (let c = 0; c < C1; c++) {
          const z = W1[3 * c] * x0 + W1[3 * c + 1] * x1 + W1[3 * c + 2] * x2 + b1[c];
          h1[ho + c] = z > 0 ? z : LEAK * z;
        }
        for (let k = 0; k < K; k++) {
          let f = b2[k];
          const wo = k * C1;
          for (let c = 0; c < C1; c++) f += W2[wo + c] * h1[ho + c];
          F[k * P + p] = f;
        }
      }
      for (let k = 0; k < K; k++) {
        const o = k * P;
        let mx = -Infinity;
        for (let p = 0; p < P; p++) if (F[o + p] > mx) mx = F[o + p];
        let sum = 0;
        for (let p = 0; p < P; p++) { const e = Math.exp(F[o + p] - mx); S[o + p] = e; sum += e; }
        let ex = 0, ey = 0;
        for (let p = 0; p < P; p++) { const s = S[o + p] / sum; S[o + p] = s; ex += s * PX[p]; ey += s * PY[p]; }
        kp[2 * k] = ex; kp[2 * k + 1] = ey;
        pres[k] = mx + Math.log(sum) - LOGP; // «насколько уверенно канал что-то нашёл»
      }
      return out;
    }

    /** Обратный проход через spatial softmax и свёртки; gKp — градиент по ключевым точкам. */
    featuresBackward(img, feat, gKp) {
      const C1 = this.C1, K = this.K;
      const { h1, S, kp } = feat;
      const gW1 = this.grads.W1, gb1 = this.grads.b1, gW2 = this.grads.W2, gb2 = this.grads.b2;
      const W2 = this.W2;
      const gh = new Float32Array(C1);
      const gF = new Float32Array(K);
      for (let p = 0; p < P; p++) {
        let any = false;
        for (let k = 0; k < K; k++) {
          const s = S[k * P + p];
          const v = s * (gKp[2 * k] * (PX[p] - kp[2 * k]) + gKp[2 * k + 1] * (PY[p] - kp[2 * k + 1]) + (gKp.length > 2 * K ? gKp[2 * K + k] : 0));
          gF[k] = v; if (v !== 0) any = true;
        }
        if (!any) continue;
        const ho = p * C1;
        gh.fill(0);
        for (let k = 0; k < K; k++) {
          const g = gF[k];
          gb2[k] += g;
          const wo = k * C1;
          for (let c = 0; c < C1; c++) { gW2[wo + c] += g * h1[ho + c]; gh[c] += W2[wo + c] * g; }
        }
        const x0 = img[3 * p], x1 = img[3 * p + 1], x2 = img[3 * p + 2];
        for (let c = 0; c < C1; c++) {
          const g = h1[ho + c] > 0 ? gh[c] : LEAK * gh[c];
          gW1[3 * c] += g * x0; gW1[3 * c + 1] += g * x1; gW1[3 * c + 2] += g * x2; gb1[c] += g;
        }
      }
    }

    _fillInput(feat, g) {
      const K = this.K, inp = this._in, kp = feat.kp;
      for (let i = 0; i < 2 * K; i++) inp[i] = (kp[i] - 0.5) * 2;
      if (this.head === 'policy') {
        for (let k = 0; k < K; k++) inp[2 * K + k] = this.presScale * feat.pres[k];
        inp[3 * K] = (g.x - 0.5) * 2; inp[3 * K + 1] = (g.y - 0.5) * 2;
      }
      return inp;
    }

    /** Прямой проход «головы». Для policy — нормированное действие (×VMAX), для percept — координаты. */
    headForward(feat, g) {
      const kp = feat.kp;
      if (this.point) return [(kp[0] - 0.5) * 2, (kp[1] - 0.5) * 2];
      const H = this.H, inp = this._fillInput(feat, g), D = this.inDim;
      const ha = this._ha, hb = this._hb;
      for (let h = 0; h < H; h++) {
        let z = this.ba[h];
        const o = h * D;
        for (let i = 0; i < D; i++) z += this.Wa[o + i] * inp[i];
        ha[h] = z > 0 ? z : 0;
      }
      let last = ha;
      if (this.head === 'policy') {
        for (let h = 0; h < H; h++) {
          let z = this.bb[h];
          const o = h * H;
          for (let i = 0; i < H; i++) z += this.Wb[o + i] * ha[i];
          hb[h] = z > 0 ? z : 0;
        }
        last = hb;
      }
      const out = [this.bc[0], this.bc[1]];
      for (let h = 0; h < H; h++) { out[0] += this.Wc[h] * last[h]; out[1] += this.Wc[H + h] * last[h]; }
      return out;
    }

    /** Один пример: прямой + обратный проход головы; копит градиенты, возвращает {loss, gKp}. */
    headTrain(feat, g, target, gKpAcc) {
      const H = this.H, D = this.inDim;
      const out = this.headForward(feat, g);
      if (this.point) {
        const e0 = out[0] - target[0], e1 = out[1] - target[1];
        gKpAcc[0] += 2 * e0; gKpAcc[1] += 2 * e1;
        return 0.5 * (e0 * e0 + e1 * e1);
      }
      const e0 = out[0] - target[0], e1 = out[1] - target[1];
      const loss = 0.5 * (e0 * e0 + e1 * e1);
      const gr = this.grads;
      const last = this.head === 'policy' ? this._hb : this._ha;
      gr.bc[0] += e0; gr.bc[1] += e1;
      const glast = this.head === 'policy' ? this._ghb : this._gha;
      for (let h = 0; h < H; h++) {
        gr.Wc[h] += e0 * last[h]; gr.Wc[H + h] += e1 * last[h];
        glast[h] = last[h] > 0 ? this.Wc[h] * e0 + this.Wc[H + h] * e1 : 0;
      }
      let gha = this._gha;
      if (this.head === 'policy') {
        const ha = this._ha, ghb = this._ghb;
        gha.fill(0);
        for (let h = 0; h < H; h++) {
          const g2 = ghb[h];
          if (g2 === 0) continue;
          gr.bb[h] += g2;
          const o = h * H;
          for (let i = 0; i < H; i++) { gr.Wb[o + i] += g2 * ha[i]; gha[i] += this.Wb[o + i] * g2; }
        }
        for (let i = 0; i < H; i++) if (ha[i] <= 0) gha[i] = 0;
      }
      const inp = this._in, gin = this._gin;
      gin.fill(0);
      for (let h = 0; h < H; h++) {
        const g1 = gha[h];
        if (g1 === 0) continue;
        gr.ba[h] += g1;
        const o = h * D;
        for (let i = 0; i < D; i++) { gr.Wa[o + i] += g1 * inp[i]; gin[i] += this.Wa[o + i] * g1; }
      }
      for (let i = 0; i < 2 * this.K; i++) gKpAcc[i] += gin[i] * 2; // d(inp)/d(kp) = 2
      if (this.head === 'policy') for (let k = 0; k < this.K; k++) gKpAcc[2 * this.K + k] += gin[2 * this.K + k] * this.presScale;
      return loss;
    }

    /** Удобные обёртки для агентов. */
    act(img, g, cache) {
      const f = cache || this.features(img);
      const o = this.headForward(f, g);
      return { v: clipVec({ x: o[0] * VMAX, y: o[1] * VMAX }, VMAX), feat: f };
    }
    perceive(img, cache) {
      const f = cache || this.features(img);
      const o = this.headForward(f, null);
      return { cup: { x: clamp(o[0] / 2 + 0.5, 0, 1), y: clamp(o[1] / 2 + 0.5, 0, 1) }, feat: f };
    }
  }

  class Adam {
    constructor(net, lr) {
      this.net = net; this.lr = lr; this.t = 0;
      this.m = {}; this.v = {};
      for (const n of net.names) { this.m[n] = new Float32Array(net[n].length); this.v[n] = new Float32Array(net[n].length); }
    }
    step(scale, lr) {
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      this.t++;
      const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
      for (const n of this.net.names) {
        const w = this.net[n], g = this.net.grads[n], m = this.m[n], v = this.v[n];
        for (let i = 0; i < w.length; i++) {
          const gi = g[i] * scale;
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          w[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps);
        }
      }
    }
  }

  /* ---------------- Данные ---------------- */
  /**
   * Набор демонстраций.
   * opts: {lightDiverse, tealFrac, kettleFrac}
   */
  function makeDataset(n, opts, seed) {
    opts = opts || {};
    const rng = new Rng(seed);
    const scenes = [];
    for (let i = 0; i < n; i++) {
      const scene = randomScene(rng, {
        light: opts.lightDiverse ? 'random' : 'day',
        cup: rng.next() < (opts.tealFrac || 0) ? 'teal' : 'red',
        kettle: rng.next() < (opts.kettleFrac || 0),
      });
      const states = expertRollout(scene, rng, { kettleSide: opts.kettleSide });
      // равномерно не более 24 состояний на демонстрацию
      const keep = [];
      const MAXS = 24; const step = Math.max(1, states.length / MAXS);
      for (let f = 0; f < states.length && keep.length < MAXS; f += step) keep.push(states[Math.floor(f)]);
      const cup = sceneCup(scene);
      scenes.push({ img: renderClean(scene), cup: { x: cup.x, y: cup.y }, states: keep, totalSteps: states.length, scene });
    }
    return { scenes, opts, n };
  }

  /**
   * Обучение (генератор — UI вызывает порциями и рисует кривые).
   * Каждые `report` итераций отдаёт {it, iters, train, val}.
   */
  function* trainGen(net, data, val, cfg) {
    cfg = cfg || {};
    const iters = cfg.iters || 900;
    const B = cfg.batch || 12, S = cfg.states || 6;
    const lr0 = cfg.lr || 0.01, noiseAug = cfg.noiseAug != null ? cfg.noiseAug : 0.02;
    const rng = new Rng(cfg.seed || 1);
    const adam = new Adam(net, lr0);
    const img = new Float32Array(P * 3);
    const feat = { h1: new Float32Array(P * net.C1), F: new Float32Array(net.K * P), S: new Float32Array(net.K * P), kp: new Float32Array(2 * net.K), pres: new Float32Array(net.K) };
    const gKp = new Float32Array(3 * net.K);
    const report = cfg.report || 25;
    const valEvery = cfg.valEvery || 100;
    let runLoss = null, lastVal = null;
    const scenes = data.scenes;
    for (let it = 0; it < iters; it++) {
      net.zeroGrad();
      let loss = 0, count = 0;
      for (let b = 0; b < B; b++) {
        const sc = scenes[rng.int(scenes.length)];
        addNoise(sc.img, img, noiseAug, rng);
        net.features(img, feat);
        gKp.fill(0);
        if (net.head === 'policy') {
          for (let s = 0; s < S; s++) {
            const st = sc.states[rng.int(sc.states.length)];
            loss += net.headTrain(feat, st.g, [st.a.x / VMAX, st.a.y / VMAX], gKp);
            count++;
          }
        } else {
          loss += net.headTrain(feat, null, [(sc.cup.x - 0.5) * 2, (sc.cup.y - 0.5) * 2], gKp);
          count++;
        }
        net.featuresBackward(img, feat, gKp);
      }
      // косинусное затухание шага с прогревом
      const warm = Math.min(1, (it + 1) / 40);
      const lr = lr0 * warm * (0.08 + 0.92 * 0.5 * (1 + Math.cos((Math.PI * it) / iters)));
      adam.step(1 / count, lr);
      const l = loss / count;
      runLoss = runLoss == null ? l : 0.9 * runLoss + 0.1 * l;
      if ((it + 1) % report === 0 || it === iters - 1) {
        let fresh = false;
        if (val && ((it + 1) % valEvery === 0 || it === iters - 1 || lastVal == null)) { lastVal = evalLoss(net, val, 6); fresh = true; }
        yield { it: it + 1, iters, train: runLoss, val: lastVal, valFresh: fresh };
      }
    }
  }

  function evalLoss(net, data, statesPer) {
    let loss = 0, count = 0;
    for (const sc of data.scenes) {
      const f = net.features(sc.img);
      if (net.head === 'policy') {
        const n = Math.min(statesPer || 6, sc.states.length);
        for (let s = 0; s < n; s++) {
          const st = sc.states[Math.floor((s * sc.states.length) / n)];
          const o = net.headForward(f, st.g);
          const e0 = o[0] - st.a.x / VMAX, e1 = o[1] - st.a.y / VMAX;
          loss += 0.5 * (e0 * e0 + e1 * e1); count++;
        }
      } else {
        const o = net.headForward(f, null);
        const e0 = o[0] - (sc.cup.x - 0.5) * 2, e1 = o[1] - (sc.cup.y - 0.5) * 2;
        loss += 0.5 * (e0 * e0 + e1 * e1); count++;
      }
    }
    return loss / Math.max(1, count);
  }

  function trainSync(net, data, val, cfg) {
    let last = null;
    for (const r of trainGen(net, data, val, cfg)) last = r;
    return last;
  }

  /* ---------------- Итоговые конфигурации и обучение «под ключ» ---------------- */
  const NET_CFG = {
    policy: { head: 'policy', C1: 16, K: 4, H: 32, pres: false },
    percept: { head: 'point', K: 1, C1: 12 },
  };
  const TRAIN_CFG = { policy: { iters: 1000, lr: 0.02 }, percept: { iters: 800, lr: 0.02 } };

  /**
   * Обучение с перезапуском при неудачной инициализации:
   * если к 200-й итерации ошибка всё ещё > 0.06 — начинаем заново с другого зерна.
   * Отдаёт события {it, iters, train, val, attempt, restart?}; в конце — {done, net}.
   */
  function* trainRobustGen(cfgName, data, val, seed) {
    const tc = TRAIN_CFG[cfgName];
    for (let attempt = 0; attempt < 3; attempt++) {
      const net = new KeypointNet(seed + attempt * 1009, NET_CFG[cfgName]);
      let restarted = false;
      for (const r of trainGen(net, data, val, { iters: tc.iters, lr: tc.lr, seed: seed + 1 + attempt * 7, report: 10, valEvery: 50 })) {
        r.attempt = attempt;
        yield r;
        if (cfgName === 'policy' && attempt < 2 && r.it === 200 && r.train > 0.06) { restarted = true; break; }
      }
      if (restarted) { yield { restart: true, attempt }; continue; }
      yield { done: true, net };
      return;
    }
  }

  /** Полный цикл: демонстрации → политика (E2E) → восприятие (гибрид). */
  function* trainModelsGen(N, lightDiverse, seed) {
    const data = makeDataset(N, { lightDiverse }, seed);
    const val = makeDataset(32, { lightDiverse }, 999);
    yield { phase: 'data', N, data };
    let policy = null, percept = null;
    for (const r of trainRobustGen('policy', data, val, seed * 31 + 7)) {
      if (r.done) policy = r.net; else yield Object.assign({ phase: 'policy' }, r);
    }
    for (const r of trainRobustGen('percept', data, null, seed * 37 + 11)) {
      if (r.done) percept = r.net; else yield Object.assign({ phase: 'percept' }, r);
    }
    yield { phase: 'done', policy, percept, data };
  }

  const CONDITIONS = {
    normal: { label: 'обычные сцены', cond: {} },
    evening: { label: 'вечерний свет', cond: { evening: 1 } },
    kettle: { label: 'чайник на пути', cond: { kettle: 1 } },
    teal: { label: 'бирюзовая чашка', cond: { teal: 1 } },
    evekettle: { label: 'вечер и чайник', cond: { evening: 1, kettle: 1 } },
  };
  const _testCache = {};
  function testScenes(name, n) {
    const key = name + ':' + n;
    if (!_testCache[key]) _testCache[key] = makeTestScenes(n, CONDITIONS[name].cond, 4242);
    return _testCache[key];
  }
  /** Оценка трёх агентов во всех условиях. */
  function evaluateAll(policy, percept, rules, n, noise) {
    const out = {};
    for (const name of Object.keys(CONDITIONS)) {
      const sc = testScenes(name, n || 40);
      out[name] = {
        classic: evaluate(new ClassicalAgent(rules), sc, noise),
        e2e: policy ? evaluate(new E2EAgent(policy), sc, noise) : null,
        hybrid: percept ? evaluate(new HybridAgent(percept), sc, noise) : null,
      };
    }
    return out;
  }

  /* ---------------- Сценарии управляемых экспериментов ---------------- */
  function guidedScene(opts) {
    opts = opts || {};
    const start = { x: 0.14, y: 0.82 };
    const cupPos = { x: 0.83, y: 0.22 };
    const objects = [
      makeObj('cup', cupPos.x, cupPos.y, opts.teal ? COLORS.cupTeal : COLORS.cupRed),
      makeObj('sugar', 0.33, 0.2),
      makeObj('napkins', 0.16, 0.42),
      makeObj('milk', 0.66, 0.82),
      makeObj('beans', 0.88, 0.58),
    ];
    if (opts.kettle) {
      const k = kettleOnPath(start, cupPos, null);
      objects.push(makeObj('kettle', k.x, k.y));
    }
    return { start, objects, light: opts.evening ? LIGHT.evening() : LIGHT.day(), version: 0 };
  }

  /* ---------------- Агенты ---------------- */
  const KF_R = Math.pow(0.35 / W, 2);
  const OBST_INFLATE = 0.15;   // раздувание препятствия для планировщика
  const SAFETY_R = 0.115;      // монитор безопасности: «ближе — стоп»

  class ClassicalAgent {
    constructor(rules) { this.kind = 'classic'; this.rules = rules || { wb: false, teal: false }; this.planner = new GridPlanner(); this.reset(); }
    reset() {
      this.kf = new KF(); this.missing = 0; this.path = null; this.t = 0; this.noPath = 0;
      this.status = 'running'; this.reason = null; this.module = null; this.view = {};
      this.lastGoal = null; this.obsSeen = new Map();
    }
    fail(module, reason) { this.status = 'failed'; this.module = module; this.reason = reason; return { x: 0, y: 0 }; }
    perceive(img) {
      const per = classicalPerceive(img, this.rules);
      return { cup: per.cup, obstacles: per.obstacles, per };
    }
    act(obs) {
      const t = this.t++;
      const pr = this.perceive(obs.img);
      if (this.rules && this.rules.mem) {
        // «оценка состояния» для препятствий: помним пиксель 12 кадров после последнего обнаружения
        for (const o of pr.obstacles) this.obsSeen.set(Math.round(o.y * W - 0.5) * W + Math.round(o.x * W - 0.5), t);
        const kept = [];
        for (const [p, ts] of this.obsSeen) { if (t - ts <= 12) kept.push({ x: PX[p], y: PY[p] }); else this.obsSeen.delete(p); }
        pr.obstacles = kept;
      }
      this.view.per = pr.per; this.view.cupMeas = pr.cup; this.view.nnFeat = pr.feat || null;
      if (pr.cup) { this.kf.update(pr.cup, KF_R); this.missing = 0; } else { this.missing++; this.kf.predict(); }
      this.view.kf = this.kf.x ? { x: this.kf.x.x, y: this.kf.x.y, s: this.kf.sigma() } : null;
      if (!this.kf.x) {
        if (this.missing >= 4) return this.fail('perception', 'не вижу чашку');
        return { x: 0, y: 0 };
      }
      if (this.missing >= 14) return this.fail('perception', 'потерял чашку из виду');
      const goal = this.kf.x;
      const goalMoved = !this.lastGoal || dist(goal, this.lastGoal) > 0.04;
      if (!this.path || t % 8 === 0 || goalMoved) {
        this.planner.setObstacles(pr.obstacles, OBST_INFLATE);
        this.path = this.planner.plan(obs.g, goal);
        this.lastGoal = { x: goal.x, y: goal.y };
        if (!this.path) {
          this.noPath++;
          if (this.noPath >= 2) return this.fail('planning', 'нет безопасного пути');
          return { x: 0, y: 0 };
        }
        this.noPath = 0;
      }
      this.view.path = this.path;
      let v = followPath(obs.g, this.path);
      // монитор безопасности: не входить в окрестность препятствия
      const nx = { x: obs.g.x + v.x, y: obs.g.y + v.y };
      let unsafe = false;
      for (const o of pr.obstacles) {
        const dn = dist(nx, o), dc = dist(obs.g, o);
        if (dn < SAFETY_R && dn < dc) { unsafe = true; break; }
      }
      this.view.safetyStop = unsafe;
      if (unsafe) v = { x: 0, y: 0 };
      this.view.v = v;
      return v;
    }
  }

  class HybridAgent extends ClassicalAgent {
    constructor(net) { super({}); this.kind = 'hybrid'; this.net = net; }
    perceive(img) {
      const per = classicalPerceive(img, {}); // препятствия — классическим правилом
      const nn = this.net.perceive(img);
      return { cup: nn.cup, obstacles: per.obstacles, per, feat: nn.feat };
    }
  }

  class E2EAgent {
    constructor(net) { this.kind = 'e2e'; this.net = net; this.reset(); }
    reset() { this.status = 'running'; this.reason = null; this.module = null; this.view = {}; this._cacheImg = null; this._cache = null; }
    act(obs) {
      let feat = null;
      if (obs.imgStatic && this._cacheImg === obs.img) feat = this._cache;
      const r = this.net.act(obs.img, obs.g, feat);
      if (obs.imgStatic) { this._cacheImg = obs.img; this._cache = r.feat; }
      this.view.nnFeat = r.feat; this.view.v = r.v;
      return r.v;
    }
  }

  /* ---------------- Эпизод ---------------- */
  class Episode {
    /** opts: {noise, seed} */
    constructor(scene, agent, opts) {
      opts = opts || {};
      this.scene = scene; this.agent = agent; this.noise = opts.noise || 0;
      this.rng = new Rng(opts.seed || 12345);
      this.g = { x: scene.start.x, y: scene.start.y };
      this.traj = [{ x: this.g.x, y: this.g.y }];
      this.t = 0; this.done = false; this.outcome = null; this.detail = null;
      this.clean = renderClean(scene); this.img = new Float32Array(P * 3);
      this.cleanVersion = scene.version;
      if (!(this.noise > 0)) this.img.set(this.clean);
      agent.reset();
    }
    refreshScene() { // объекты двигали мышкой
      renderClean(this.scene, this.clean); this.cleanVersion = this.scene.version;
      if (!(this.noise > 0)) this.img.set(this.clean);
      if (this.agent._cacheImg) this.agent._cacheImg = null;
    }
    finish(outcome, detail) { this.done = true; this.outcome = outcome; this.detail = detail || null; }
    step() {
      if (this.done) return;
      if (this.cleanVersion !== this.scene.version) this.refreshScene();
      const static_ = !(this.noise > 0);
      if (!static_) addNoise(this.clean, this.img, this.noise, this.rng);
      const v = this.agent.act({ img: this.img, imgStatic: static_, g: { x: this.g.x, y: this.g.y } });
      this.t++;
      if (this.agent.status === 'failed') {
        this.finish('explicit', { module: this.agent.module, reason: this.agent.reason });
        return;
      }
      const vv = clipVec(v, VMAX);
      this.g.x = clamp(this.g.x + vv.x, ARENA_MIN, ARENA_MAX);
      this.g.y = clamp(this.g.y + vv.y, ARENA_MIN, ARENA_MAX);
      this.traj.push({ x: this.g.x, y: this.g.y });
      const kettle = sceneKettle(this.scene), cup = sceneCup(this.scene);
      if (kettle && dist(this.g, kettle) < kettle.r + GRIP_R) { this.finish('collision', { reason: 'врезался в чайник' }); return; }
      if (dist(this.g, cup) < SUCCESS_R) { this.finish('success', { steps: this.t }); return; }
      // застрял / остановился не там
      const L = this.traj.length;
      if (this.t > 30 && L > 26) {
        const a = this.traj[L - 26], b = this.traj[L - 1];
        let path = 0;
        for (let i = L - 25; i < L; i++) path += dist(this.traj[i], this.traj[i - 1]);
        if (dist(a, b) < 0.012 && path < 0.06) {
          this.finish('silent', { reason: 'stopped', near: nearestObject(this.scene, this.g) });
          return;
        }
      }
      if (this.t >= T_MAX) this.finish('silent', { reason: 'timeout', near: nearestObject(this.scene, this.g) });
    }
    run() { while (!this.done) this.step(); return this; }
  }

  function nearestObject(scene, g) {
    let best = null, bd = 1e9;
    for (const o of scene.objects) { const d = dist(o, g) - o.r; if (d < bd) { bd = d; best = o; } }
    return best && bd < 0.06 ? { kind: best.kind, name: KIND_NAMES[best.kind] } : null;
  }

  /* ---------------- Оценка ---------------- */
  /** conditions: {evening, kettle, teal}. Детерминированный набор тестовых сцен. */
  function makeTestScenes(n, cond, seed) {
    const rng = new Rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(randomScene(rng, { light: cond.evening ? 'evening' : 'day', cup: cond.teal ? 'teal' : 'red', kettle: !!cond.kettle }));
    }
    return out;
  }
  function evaluate(agent, scenes, noise) {
    const res = { success: 0, collision: 0, explicit: 0, silent: 0, n: scenes.length, modules: {} };
    scenes.forEach((sc, i) => {
      const ep = new Episode(sc, agent, { noise: noise || 0, seed: 1000 + i }).run();
      res[ep.outcome]++;
      if (ep.outcome === 'explicit' && ep.detail) res.modules[ep.detail.module] = (res.modules[ep.detail.module] || 0) + 1;
    });
    return res;
  }

  /* ---------------- Экспорт ---------------- */
  Object.assign(RC, {
    Rng, W, P, VMAX, GRIP_R, SUCCESS_R, T_MAX, COLORS, OBJ_R, KIND_NAMES, DRAW_RANK, LIGHT, lightFromT,
    PX, PY, RULES_TEXT,
    dist, clamp, clipVec, makeObj, sceneCup, sceneKettle, cloneScene, kettleOnPath, randomScene,
    renderClean, addNoise, classicalPerceive, KF, GridPlanner, followPath, expertRollout,
    KeypointNet, Adam, makeDataset, trainGen, trainSync, evalLoss,
    ClassicalAgent, HybridAgent, E2EAgent, Episode, nearestObject, makeTestScenes, evaluate,
    OBST_INFLATE, SAFETY_R, NET_CFG, TRAIN_CFG, trainRobustGen, trainModelsGen, CONDITIONS, testScenes,
    evaluateAll, guidedScene,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = RC;
})(typeof window !== 'undefined' ? window : globalThis);
