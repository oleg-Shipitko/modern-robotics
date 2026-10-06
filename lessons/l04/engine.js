/* =====================================================================
   l04/engine.js — движок урока 0.4 «Оценка состояния и планирование».
   Без DOM: работает в браузере и в Node (tools/l04_tune.js подбирает
   параметры). Вся случайность — с фиксированными зёрнами, поэтому
   цифры в тексте урока совпадают с тем, что видит читатель.
   Единицы: сантиметры и секунды.
     KF   — фильтр Калмана в коридоре: дальномер, одометрия колёс,
            комплементарный фильтр и Калман рядом.
     House— план дома Ады, лучи лидара.
     PF   — фильтр частиц (Monte Carlo localization) в доме.
     OccMap — сетка занятости по лидару, дрейф одометрии и сопоставление
            сканов с картой (простой SLAM без замыкания петель).
     Grid — Дейкстра, A* и взвешенный A* на сетке.
     RRT  — RRT и RRT* на плоскости, точный кратчайший путь для сравнения.
   ===================================================================== */
'use strict';
(function (root) {
  /* ---------- случайность с зерном ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* =====================================================================
     1. Фильтр Калмана: Ада едет по коридору туда и обратно.
     Одометрия колёс точна на коротком отрезке, но копит ошибку (масштаб
     колеса +4 %, шум, на ковре колёса проскальзывают). Дальномер меряет
     расстояние до стены без накопления, но с шумом 10 см. Три оценки
     считаются на одних и тех же данных.
     ===================================================================== */
  const KF = (() => {
    const DT = 0.1, T = 20, N = Math.round(T / DT) + 1, X0 = 260, AMP = 180;
    const CARPET = [250, 350], DROP = [11, 14];
    const SIG_Z = 10, SIG_U = 6, SCALE = 0.04, SLIP = 0.3;
    /** Истинное движение и показания датчиков. o: { carpet, drop, seed } */
    function data(o) {
      o = o || {};
      const r = rng(o.seed || 7), x = new Float64Array(N), v = new Float64Array(N), u = new Float64Array(N), z = new Float64Array(N);
      const carpet = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const t = i * DT;
        x[i] = X0 - AMP * Math.cos(2 * Math.PI * t / T);
        v[i] = AMP * 2 * Math.PI / T * Math.sin(2 * Math.PI * t / T);
      }
      for (let i = 0; i < N; i++) {
        const t = i * DT, onC = x[i] > CARPET[0] && x[i] < CARPET[1];
        carpet[i] = onC ? 1 : 0;
        const nu = randn(r), nz = randn(r);
        u[i] = v[i] * (1 + SCALE + (o.carpet && onC ? SLIP : 0)) + SIG_U * nu;   // одометрия: скорость, см/с
        z[i] = (o.drop && t >= DROP[0] && t < DROP[1]) ? NaN : x[i] + SIG_Z * nz; // дальномер: положение, см
      }
      return { x, v, u, z, carpet };
    }
    /** Все три оценки. o: { sq, sr — σ шума модели (см за шаг) и дальномера (см); alpha; carpet; drop } */
    function run(o) {
      o = Object.assign({ sq: 1, sr: 10, alpha: 0.98 }, o);
      const d = data(o), Q = o.sq * o.sq, R = o.sr * o.sr;
      const raw = new Float64Array(N), comp = new Float64Array(N), kf = new Float64Array(N), P = new Float64Array(N), K = new Float64Array(N);
      raw[0] = comp[0] = kf[0] = d.z[0]; P[0] = R; K[0] = 1;
      for (let i = 1; i < N; i++) {
        const has = !Number.isNaN(d.z[i]), du = d.u[i] * DT;
        raw[i] = has ? d.z[i] : raw[i - 1];
        const cp = comp[i - 1] + du; comp[i] = has ? o.alpha * cp + (1 - o.alpha) * d.z[i] : cp;
        const xp = kf[i - 1] + du, pp = P[i - 1] + Q;                       // предсказание
        if (has) { const k = pp / (pp + R); kf[i] = xp + k * (d.z[i] - xp); P[i] = (1 - k) * pp; K[i] = k; } // коррекция
        else { kf[i] = xp; P[i] = pp; K[i] = 0; }
      }
      const m = (e) => { let s = 0, mx = 0; for (let i = 0; i < N; i++) { const a = Math.abs(e[i] - d.x[i]); s += a * a; mx = Math.max(mx, a); } return { rmse: Math.sqrt(s / N), max: mx }; };
      let cover = 0; for (let i = 0; i < N; i++) if (Math.abs(kf[i] - d.x[i]) <= 2 * Math.sqrt(P[i])) cover++;
      let odo = d.z[0]; const odoE = new Float64Array(N); odoE[0] = odo; for (let i = 1; i < N; i++) { odo += d.u[i] * DT; odoE[i] = odo; }
      const win = (e, a, b) => { let mx = 0; for (let i = 0; i < N; i++) { const t = i * DT; if (t >= a && t < b) mx = Math.max(mx, Math.abs(e[i] - d.x[i])); } return mx; };
      // окно после провала дальномера: 1 с после возвращения измерений
      const after = { comp: win(comp, DROP[1], DROP[1] + 1), kf: win(kf, DROP[1], DROP[1] + 1) };
      const sigAt = (t) => Math.sqrt(P[Math.round(t / DT)]);
      return { d, raw, comp, kf, P, K, odo: odoE, Kend: K[N - 1], m: { raw: m(raw), comp: m(comp), kf: m(kf), odo: m(odoE) }, cover: cover / N, after, sigAt, opts: o };
    }
    return { DT, T, N, CARPET, DROP, SIG_Z, SIG_U, SCALE, SLIP, X0, AMP, data, run };
  })();

  /* =====================================================================
     2. Дом Ады: 6 × 4 м. Слева две одинаковые спальни одна над другой,
     посередине гостиная, справа кухня. Спальни одинаковые нарочно: по
     лидару их не различить, пока Ада не выедет в гостиную.
     ===================================================================== */
  const House = (() => {
    const W = 600, H = 400, R = 18;
    const WALLS = [
      [-8, -8, 608, 0], [-8, 400, 608, 408], [-8, -8, 0, 408], [600, -8, 608, 408],   // внешний контур
      [0, 196, 200, 204],                                                             // между спальнями
      [196, 0, 204, 116], [196, 176, 204, 320], [196, 380, 204, 408],                 // двери спален: y 116–176 и 320–380
      [396, 0, 404, 140], [396, 240, 404, 408],                                       // дверь кухни: y 140–240
    ];
    const FURN = [
      { r: [8, 8, 92, 76], name: 'кровать' }, { r: [8, 212, 92, 280], name: 'кровать' },
      { r: [150, 8, 190, 40], name: 'тумба' }, { r: [150, 212, 190, 244], name: 'тумба' },
      { r: [338, 262, 390, 392], name: 'диван' }, { r: [262, 214, 318, 262], name: 'стол' },
      { r: [412, 8, 592, 56], name: 'плита и мойка' }, { r: [528, 290, 592, 392], name: 'холодильник' },
    ];
    const OBST = WALLS.concat(FURN.map((f) => f.r));
    const ROOMS = [['спальня', 100, 150], ['спальня', 100, 350], ['гостиная', 300, 22], ['кухня', 470, 230]];
    const DOCK = { x: 290, y: 340 };
    function rayRect(ox, oy, dx, dy, r) {
      let t0 = 0, t1 = Infinity;
      if (Math.abs(dx) < 1e-12) { if (ox < r[0] || ox > r[2]) return Infinity; } else { let a = (r[0] - ox) / dx, b = (r[2] - ox) / dx; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity; }
      if (Math.abs(dy) < 1e-12) { if (oy < r[1] || oy > r[3]) return Infinity; } else { let a = (r[1] - oy) / dy, b = (r[3] - oy) / dy; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity; }
      return t0;
    }
    function ray(x, y, a, rmax) { const dx = Math.cos(a), dy = Math.sin(a); let best = rmax; for (const r of OBST) { const t = rayRect(x, y, dx, dy, r); if (t < best) best = t; } return best; }
    function scan(x, y, th, n, rmax, out) { out = out || new Float32Array(n); for (let i = 0; i < n; i++) out[i] = ray(x, y, th + 2 * Math.PI * i / n, rmax); return out; }
    function inside(x, y, pad) { pad = pad || 0; if (x < pad || y < pad || x > W - pad || y > H - pad) return true; for (const r of OBST) if (x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad) return true; return false; }
    function rectDist(x, y, r) { const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]); return Math.hypot(dx, dy); }
    function clearance(x, y) { let d = Infinity; for (const r of OBST) d = Math.min(d, rectDist(x, y, r)); return d; }
    const freeAt = (x, y) => x > 0 && y > 0 && x < W && y < H && clearance(x, y) >= R;
    /** Маршрут по точкам: Ада едет с постоянной скоростью и поворачивает к следующей точке. */
    function route(wps, v, dt) {
      const out = []; let x = wps[0][0], y = wps[0][1], th = Math.atan2(wps[1][1] - y, wps[1][0] - x);
      out.push({ x, y, th });
      for (let k = 1; k < wps.length; k++) {
        const [tx, ty] = wps[k];
        for (let guard = 0; guard < 2000; guard++) {
          const d = Math.hypot(tx - x, ty - y); if (d < v * dt * 0.6) break;
          const want = Math.atan2(ty - y, tx - x), turn = clamp(wrapA(want - th), -2.4 * dt, 2.4 * dt);
          th = wrapA(th + turn); const s = Math.min(v * dt, d); x += Math.cos(th) * s; y += Math.sin(th) * s; out.push({ x, y, th });
        }
      }
      return out;
    }
    return { W, H, R, WALLS, FURN, OBST, ROOMS, DOCK, ray, scan, inside, clearance, freeAt, route, rayRect };
  })();

  /* =====================================================================
     3. Фильтр частиц (Monte Carlo localization). Каждая частица — гипотеза
     «Ада здесь и смотрит туда». Шаг: сдвинуть все частицы по одометрии с
     шумом → взвесить по тому, насколько их ожидаемый скан похож на
     настоящий → пересэмплировать. Чтобы пережить похищение, можно
     подмешивать долю случайных частиц.
     ===================================================================== */
  const PF = (() => {
    const NB = 24, RMAX = 250, SIG_L = 25, ZMIX = 0.2, TEMP = 0.35, DT = 0.25, V = 40, A_SLOW = 0.05, A_FAST = 0.5;
    const H = House;
    function create(n, seed) { return { n, x: new Float32Array(n), y: new Float32Array(n), th: new Float32Array(n), w: new Float64Array(n).fill(1 / n), r: rng(seed || 5), zhat: new Float32Array(NB) }; }
    function randomPose(r) { for (let g = 0; g < 1000; g++) { const x = r() * H.W, y = r() * H.H; if (H.freeAt(x, y)) return [x, y, (r() * 2 - 1) * Math.PI]; } return [H.DOCK.x, H.DOCK.y, 0]; }
    function scatter(pf) { for (let i = 0; i < pf.n; i++) { const p = randomPose(pf.r); pf.x[i] = p[0]; pf.y[i] = p[1]; pf.th[i] = p[2]; pf.w[i] = 1 / pf.n; } }
    function around(pf, s, sxy, sth) { for (let i = 0; i < pf.n; i++) { pf.x[i] = s.x + randn(pf.r) * sxy; pf.y[i] = s.y + randn(pf.r) * sxy; pf.th[i] = wrapA(s.th + randn(pf.r) * sth); pf.w[i] = 1 / pf.n; } }
    /** Сдвиг по одометрии: поворот dth, проезд dd, с шумом. */
    function move(pf, dd, dth) {
      const r = pf.r, sd = 0.1 * Math.abs(dd) + 0.6, st = 0.1 * Math.abs(dth) + 0.035;
      for (let i = 0; i < pf.n; i++) { const th = wrapA(pf.th[i] + dth + randn(r) * st), d = dd + randn(r) * sd; pf.th[i] = th; pf.x[i] += Math.cos(th) * d; pf.y[i] += Math.sin(th) * d; }
    }
    /** Вес частицы — правдоподобие скана (лучи независимы, смесь гаусса и равномерного шума).
     *  Возвращает среднее по частицам правдоподобие на один луч: насколько скан «ожидаем». */
    function weigh(pf, z) {
      const lw = new Float64Array(pf.n), base = ZMIX / RMAX, norm = (1 - ZMIX) / (SIG_L * Math.sqrt(2 * Math.PI));
      let mx = -Infinity, avg = 0;
      for (let i = 0; i < pf.n; i++) {
        let ll = -1e9;                                     // частица в стене — почти невозможна
        if (!H.inside(pf.x[i], pf.y[i], 6)) {
          H.scan(pf.x[i], pf.y[i], pf.th[i], NB, RMAX, pf.zhat);
          let s = 0; for (let b = 0; b < NB; b++) { const e = (z[b] - pf.zhat[b]) / SIG_L; s += Math.log(base + norm * Math.exp(-0.5 * e * e)); }
          ll = TEMP * s; avg += Math.exp(s / NB);
        }
        lw[i] = Math.log(pf.w[i] + 1e-300) + ll; if (lw[i] > mx) mx = lw[i];
      }
      let sum = 0; for (let i = 0; i < pf.n; i++) { pf.w[i] = Math.exp(lw[i] - mx); sum += pf.w[i]; }
      for (let i = 0; i < pf.n; i++) pf.w[i] /= sum;
      return avg / pf.n;
    }
    function neff(pf) { let s = 0; for (let i = 0; i < pf.n; i++) s += pf.w[i] * pf.w[i]; return 1 / s; }
    /** Пересэмплирование с низкой дисперсией; inject — доля случайных частиц. */
    function resample(pf, inject) {
      const n = pf.n, x = new Float32Array(n), y = new Float32Array(n), th = new Float32Array(n), r = pf.r;
      const nr = Math.round(n * (inject || 0)), m = n - nr, step = 1 / m; let u = r() * step, c = pf.w[0], j = 0;
      for (let i = 0; i < m; i++) { while (u > c && j < n - 1) { j++; c += pf.w[j]; } x[i] = pf.x[j]; y[i] = pf.y[j]; th[i] = pf.th[j]; u += step; }
      for (let i = m; i < n; i++) { const p = randomPose(r); x[i] = p[0]; y[i] = p[1]; th[i] = p[2]; }
      pf.x = x; pf.y = y; pf.th = th; pf.w.fill(1 / n);
    }
    /** Облака частиц: клетки 40 см, связные области с заметным весом. */
    function clusters(pf) {
      const C = 40, nx = Math.ceil(H.W / C), ny = Math.ceil(H.H / C), cw = new Float64Array(nx * ny), sx = new Float64Array(nx * ny), sy = new Float64Array(nx * ny);
      for (let i = 0; i < pf.n; i++) { const cx = clamp(Math.floor(pf.x[i] / C), 0, nx - 1), cy = clamp(Math.floor(pf.y[i] / C), 0, ny - 1), k = cy * nx + cx; cw[k] += pf.w[i]; sx[k] += pf.w[i] * pf.x[i]; sy[k] += pf.w[i] * pf.y[i]; }
      const lab = new Int32Array(nx * ny).fill(-1), out = [], TH = 0.01;
      for (let k = 0; k < nx * ny; k++) {
        if (lab[k] >= 0 || cw[k] < TH) continue;
        const id = out.length, st = [k]; lab[k] = id; let w = 0, mx = 0, my = 0;
        while (st.length) { const q = st.pop(); w += cw[q]; mx += sx[q]; my += sy[q]; const qx = q % nx, qy = (q / nx) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ax = qx + dx, ay = qy + dy; if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue; const a = ay * nx + ax; if (lab[a] < 0 && cw[a] >= TH) { lab[a] = id; st.push(a); } } }
        out.push({ w, x: mx / w, y: my / w });
      }
      out.sort((a, b) => b.w - a.w);
      return out;
    }
    function spread(pf, c) { let s = 0, ws = 0; for (let i = 0; i < pf.n; i++) { const d2 = (pf.x[i] - c.x) ** 2 + (pf.y[i] - c.y) ** 2; if (d2 < 120 * 120) { s += pf.w[i] * d2; ws += pf.w[i]; } } return Math.sqrt(s / Math.max(ws, 1e-12)); }
    /** Маршрут: из верхней спальни в гостиную, потом в кухню. Дальше Ада катается сама. */
    const WP = [[60, 150], [175, 146], [250, 150], [360, 120], [370, 190], [470, 190], [480, 110], [560, 110], [560, 240], [470, 250]];
    /** Мир: настоящая Ада, её одометрия и лидар, фильтр частиц. o: { n, seed, start: 'global'|'known', inject, at:{x,y,th}, wps } */
    function world(o) {
      o = Object.assign({ n: 600, seed: 5, start: 'global', inject: 0 }, o);
      const rs = rng(o.sensorSeed || 9), rw = rng(o.wanderSeed || 13), z = new Float32Array(NB);
      const wps = o.wps || WP;
      const W = { o, t: 0, k: 0, wslow: null, wfast: null, pinj: 0, s: o.at ? Object.assign({}, o.at) : { x: wps[0][0], y: wps[0][1], th: Math.atan2(wps[1][1] - wps[0][1], wps[1][0] - wps[0][0]) }, wpi: o.at ? -1 : 1, pf: create(o.n, o.seed), z, last: null, jumped: false, wps };
      if (o.start === 'global') scatter(W.pf); else around(W.pf, W.s, 8, 0.05);
      /** Ход настоящей Ады: по маршруту, потом сама объезжает препятствия. */
      function drive() {
        const s = W.s, v = V * DT;
        let want;
        if (W.wpi >= 0 && W.wpi < W.wps.length) {
          const [tx, ty] = W.wps[W.wpi]; if (Math.hypot(tx - s.x, ty - s.y) < v * 0.8) W.wpi++;
          if (W.wpi < W.wps.length) want = Math.atan2(W.wps[W.wpi][1] - s.y, W.wps[W.wpi][0] - s.x);
        }
        if (want === undefined) {                        // свободная езда: держим курс, у препятствия ищем, где просторнее
          W.wpi = -1; const front = H.ray(s.x, s.y, s.th, 200);
          if (front < 55) { let best = s.th, bd = -1; for (let k = -6; k <= 6; k++) { const a = s.th + k * 0.45, d = H.ray(s.x, s.y, a, 200); if (d > bd + 1) { bd = d; best = a; } } want = best; }
          else want = s.th + (rw() - 0.5) * 0.5;
        }
        const turn = clamp(wrapA(want - s.th), -2.4 * DT, 2.4 * DT), th = wrapA(s.th + turn);
        let nx = s.x + Math.cos(th) * v, ny = s.y + Math.sin(th) * v;
        if (!H.freeAt(nx, ny)) { nx = s.x; ny = s.y; }  // упёрлась — стоит и поворачивается
        const dd = Math.hypot(nx - s.x, ny - s.y);
        W.s = { x: nx, y: ny, th }; return { dd, dth: turn };
      }
      /** Один шаг: Ада едет, фильтр предсказывает по одометрии и поправляется по скану. */
      function step() {
        const od = drive(), pf = W.pf;
        move(pf, od.dd + randn(rs) * 0.4, od.dth + randn(rs) * 0.01);
        H.scan(W.s.x, W.s.y, W.s.th, NB, RMAX, z); for (let b = 0; b < NB; b++) z[b] = Math.min(RMAX, z[b] + randn(rs) * 3);
        const lik = weigh(pf, z);
        surprise(lik);
        const cl = clusters(pf), best = cl[0] || { w: 0, x: 0, y: 0 };
        W.last = { t: W.t, cl: cl.slice(0, 5), err: Math.hypot(best.x - W.s.x, best.y - W.s.y), sp: spread(pf, best), neff: neff(pf), best, lik, pinj: W.pinj };
        if (neff(pf) < pf.n / 2 || W.pinj > 0) resample(pf, W.pinj);
        W.t += DT; W.k++;
        return W.last;
      }
      /** «Удивление» фильтра (Augmented MCL, Thrun и др., гл. 8): быстрое и медленное среднее правдоподобия скана.
       *  Если быстрое упало ниже медленного, скан перестал совпадать с ожиданием — подмешиваем случайные частицы. */
      function surprise(lik) {
        if (W.wslow == null) { W.wslow = lik; W.wfast = lik; }
        W.wslow += A_SLOW * (lik - W.wslow); W.wfast += A_FAST * (lik - W.wfast);
        W.pinj = W.o.augment ? Math.min(0.5, Math.max(0, 1 - W.wfast / W.wslow)) : (W.o.inject || 0);
      }
      /** Похищение: Аду переносят, одометрия об этом не знает. wps — куда она поедет дальше. */
      function kidnap(x, y, th, wps) { W.s = { x, y, th: th == null ? W.s.th : th }; if (wps) { W.wps = wps; W.wpi = 1; } else W.wpi = -1; W.jumped = true; }
      function measure() {          // оценка без шага: для «сломай» — сколько облаков видит фильтр сейчас
        const cl = clusters(W.pf), best = cl[0] || { w: 0, x: 0, y: 0 };
        return { cl: cl.slice(0, 5), err: Math.hypot(best.x - W.s.x, best.y - W.s.y), sp: spread(W.pf, best), best };
      }
      /** Измерение на месте: n сканов без движения (фильтр только взвешивает). */
      function stand(n) {
        const pf = W.pf; let r;
        for (let i = 0; i < n; i++) {
          move(pf, 0, 0);
          H.scan(W.s.x, W.s.y, W.s.th, NB, RMAX, z); for (let b = 0; b < NB; b++) z[b] = Math.min(RMAX, z[b] + randn(rs) * 3);
          surprise(weigh(pf, z)); r = measure(); if (neff(pf) < pf.n / 2 || W.pinj > 0) resample(pf, W.pinj);
          W.t += DT; W.k++;
        }
        W.last = Object.assign({ t: W.t }, r); return W.last;
      }
      W.step = step; W.kidnap = kidnap; W.measure = measure; W.stand = stand;
      return W;
    }
    return { NB, RMAX, DT, V, WP, create, scatter, around, move, weigh, resample, neff, clusters, spread, world, randomPose };
  })();

  /* =====================================================================
     4. Сетка занятости и SLAM. Клетки 5 см хранят лог-шансы «занято».
     Каждый луч лидара: клетки вдоль луча — свободнее, клетка в конце —
     занятее. Карта строится по оценке позы: по одометрии (она дрейфует)
     или по позе, уточнённой сопоставлением скана с уже построенной картой.
     ===================================================================== */
  const OccMap = (() => {
    const H = House, C = 5, NX = H.W / C, NY = H.H / C, NB = 90, RMAX = 350, DT = 0.25, V = 50;
    const L_OCC = 0.85, L_FREE = -0.4, L_MIN = -4, L_MAX = 4;
    /** Настоящий план в клетках: 1 — занято. И расстояние до ближайшей стены (в клетках) — для оценки карты. */
    const TRUTH = new Uint8Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const x = (i + 0.5) * C, y = (j + 0.5) * C; if (i === 0 || j === 0 || i === NX - 1 || j === NY - 1) { TRUTH[j * NX + i] = 1; continue; } for (const r of H.OBST) if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) { TRUTH[j * NX + i] = 1; break; } }
    const DIST = (() => { const d = new Float32Array(NX * NY).fill(1e9), q = []; for (let k = 0; k < NX * NY; k++) if (TRUTH[k]) { d[k] = 0; q.push(k); }
      for (let h = 0; h < q.length; h++) { const k = q[h], i = k % NX, j = (k / NX) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const n = b * NX + a; if (d[n] > d[k] + 1) { d[n] = d[k] + 1; q.push(n); } } } return d; })();
    /** Маршрут объезда всех комнат: от зарядки по гостиной, в обе спальни, в кухню и обратно. */
    const WP = [[290, 340], [235, 300], [235, 150], [170, 146], [100, 146], [60, 120], [100, 150], [170, 146], [235, 150], [235, 300], [235, 350], [170, 350], [100, 350], [60, 324], [100, 354], [170, 350], [235, 350], [235, 300], [235, 150], [345, 115], [370, 190], [470, 190], [480, 110], [560, 110], [560, 240], [470, 250], [370, 190], [330, 110], [235, 150], [235, 300], [290, 335]];
    const ROUTE = H.route(WP, V, DT);
    function newMap() { return new Float32Array(NX * NY); }
    /** Один луч на карту: свободно вдоль, занято в конце (если луч во что-то упёрся). */
    function castRay(m, x0, y0, a, r, hit) {
      const x1 = x0 + Math.cos(a) * r, y1 = y0 + Math.sin(a) * r;
      let i = Math.floor(x0 / C), j = Math.floor(y0 / C); const i1 = Math.floor(x1 / C), j1 = Math.floor(y1 / C);
      const di = Math.sign(i1 - i), dj = Math.sign(j1 - j), dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      let tMaxX = dx < 1e-9 ? Infinity : (di > 0 ? ((i + 1) * C - x0) : (x0 - i * C)) / dx, tMaxY = dy < 1e-9 ? Infinity : (dj > 0 ? ((j + 1) * C - y0) : (y0 - j * C)) / dy;
      const tdx = dx < 1e-9 ? Infinity : C / dx, tdy = dy < 1e-9 ? Infinity : C / dy;
      for (let guard = 0; guard < 400; guard++) {
        if (i === i1 && j === j1) break;
        if (i >= 0 && j >= 0 && i < NX && j < NY) { const k = j * NX + i; m[k] = Math.max(L_MIN, m[k] + L_FREE); }
        if (tMaxX < tMaxY) { tMaxX += tdx; i += di; } else { tMaxY += tdy; j += dj; }
      }
      if (hit && i1 >= 0 && j1 >= 0 && i1 < NX && j1 < NY) { const k = j1 * NX + i1; m[k] = Math.min(L_MAX, m[k] + L_OCC); }
    }
    function integrate(m, pose, z) { for (let b = 0; b < NB; b++) castRay(m, pose.x, pose.y, pose.th + 2 * Math.PI * b / NB, z[b], z[b] < RMAX - 1); }
    /** Поле для сопоставления: размытая «занятость» карты. */
    function field(m) {
      const p = new Float32Array(NX * NY), f = new Float32Array(NX * NY);
      for (let k = 0; k < NX * NY; k++) p[k] = m[k] > 0 ? 1 - 1 / (1 + Math.exp(m[k])) : 0;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        let best = p[j * NX + i];
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const v = p[b * NX + a] * Math.exp(-0.5 * (di * di + dj * dj) / 1.2); if (v > best) best = v; }
        f[j * NX + i] = best;
      }
      return f;
    }
    function score(f, pose, z) {
      let s = 0; const c = Math.cos(pose.th), sn = Math.sin(pose.th);
      for (let b = 0; b < NB; b++) { if (z[b] >= RMAX - 1) continue; const a = 2 * Math.PI * b / NB, ca = Math.cos(a), sa = Math.sin(a), lx = ca * z[b], ly = sa * z[b];
        const x = pose.x + c * lx - sn * ly, y = pose.y + sn * lx + c * ly, i = Math.floor(x / C), j = Math.floor(y / C); if (i >= 0 && j >= 0 && i < NX && j < NY) s += f[j * NX + i]; }
      return s;
    }
    /** Сопоставление скана с картой: перебор сдвигов и поворотов вокруг предсказанной позы, от грубого к точному. */
    function match(f, pred, z) {
      let best = pred, bs = score(f, pred, z);
      const pass = (cx, cy, ct, step, dstep, n, nt) => {
        for (let a = -nt; a <= nt; a++) for (let u = -n; u <= n; u++) for (let v = -n; v <= n; v++) {
          const q = { x: cx.x + u * step, y: cx.y + v * step, th: cx.th + a * dstep }, sc = score(f, q, z);
          if (sc > bs + 1e-9) { bs = sc; best = q; }
        }
      };
      pass(pred, 0, 0, 4, 0.035, 3, 3); const mid = best; pass(mid, 0, 0, 1.5, 0.01, 2, 2);
      return best;
    }
    const compose = (p, dd, dth) => { const th = wrapA(p.th + dth); return { x: p.x + Math.cos(th) * dd, y: p.y + Math.sin(th) * dd, th }; };
    /** Объезд дома по шагам. o: { exact — строить по настоящей позе; drift — увод курса одометрии, °/м; slam — сопоставлять сканы; seed }.
     *  Две карты строятся по одним и тем же сканам: по одометрии и по позе после сопоставления. */
    function tour(o) {
      o = Object.assign({ drift: 0, seed: 21, exact: false, slam: false }, o);
      const r = rng(o.seed), z = new Float32Array(NB), kd = o.drift * Math.PI / 180 / 100;
      const T = { o, k: 0, n: ROUTE.length, done: false, mOdo: newMap(), mSlam: newMap(), pOdo: Object.assign({}, ROUTE[0]), pSlam: Object.assign({}, ROUTE[0]), s: ROUTE[0], trail: { truth: [], odo: [], slam: [] }, z, f: null };
      T.step = function () {
        if (T.done) return false;
        const t = T.k, s = ROUTE[t]; T.s = s;
        if (t > 0) {
          const p = ROUTE[t - 1], dd = Math.hypot(s.x - p.x, s.y - p.y), dth = wrapA(s.th - p.th);
          const mdd = dd * 1.01 + randn(r) * 0.4, mth = dth + kd * dd + randn(r) * 0.004;   // одометрия: масштаб +1 %, увод курса, шум
          T.pOdo = compose(T.pOdo, mdd, mth); T.pSlam = compose(T.pSlam, mdd, mth);
        }
        if (o.exact) { T.pOdo = Object.assign({}, s); T.pSlam = Object.assign({}, s); }
        H.scan(s.x, s.y, s.th, NB, RMAX, z); for (let b = 0; b < NB; b++) z[b] = z[b] >= RMAX ? RMAX : z[b] + randn(r) * 1.5;
        if (o.slam && !o.exact && t > 0) { if (!T.f || t % 2 === 0) T.f = field(T.mSlam); T.pSlam = match(T.f, T.pSlam, z); }
        integrate(T.mOdo, T.pOdo, z); if (o.slam) integrate(T.mSlam, T.pSlam, z);
        T.trail.truth.push([s.x, s.y]); T.trail.odo.push([T.pOdo.x, T.pOdo.y]); T.trail.slam.push([T.pSlam.x, T.pSlam.y]);
        T.k++; if (T.k >= ROUTE.length) T.done = true;
        return true;
      };
      T.result = function () {
        const e = (p) => Math.hypot(p.x - T.s.x, p.y - T.s.y);
        return { odo: judge(T.mOdo), slam: o.slam ? judge(T.mSlam) : null, endErr: { odo: e(T.pOdo), slam: e(T.pSlam) }, drift: o.drift, slamOn: !!o.slam, exact: !!o.exact };
      };
      return T;
    }
    function run(o) { const T = tour(o); while (T.step()); return Object.assign(T.result(), { tour: T }); }
    /** Оценка карты: сколько известно, сколько лишних стен, есть ли по карте путь от зарядки в кухню. */
    function judge(m) {
      let known = 0, freeTruth = 0, occ = 0, ghost = 0;
      for (let k = 0; k < NX * NY; k++) {
        if (!TRUTH[k]) { freeTruth++; if (Math.abs(m[k]) > 0.5) known++; }
        if (m[k] > 1) { occ++; if (DIST[k] > 2) ghost++; }
      }
      return { coverage: known / freeTruth, ghost: occ ? ghost / occ : 0, ghostCells: ghost, path: pathOn(m) };
    }
    /** Путь по карте: клетки, где Аде (радиус 18 см) не задеть ни одной «занятой» клетки. Неизвестные клетки считаем свободными. */
    function pathOn(m) {
      const blocked = new Uint8Array(NX * NY), rr = Math.ceil(H.R / C);
      for (let k = 0; k < NX * NY; k++) if (m[k] > 0.5) { const i = k % NX, j = (k / NX) | 0;
        for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { if (di * di + dj * dj > (H.R / C) ** 2) continue; const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NY) blocked[b * NX + a] = 1; } }
      const s = Math.floor(H.DOCK.y / C) * NX + Math.floor(H.DOCK.x / C), g = Math.floor(190 / C) * NX + Math.floor(500 / C);
      if (blocked[s] || blocked[g]) return false;
      const seen = new Uint8Array(NX * NY), q = [s]; seen[s] = 1;
      for (let h = 0; h < q.length; h++) { const k = q[h]; if (k === g) return true; const i = k % NX, j = (k / NX) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const n = b * NX + a; if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); } } }
      return false;
    }
    return { C, NX, NY, NB, RMAX, DT, V, WP, ROUTE, TRUTH, DIST, tour, run, judge, pathOn, field, match, integrate, newMap };
  })();

  /* =====================================================================
     5. Поиск пути на сетке: тот же дом клетками по 20 см (30 × 20).
     Дейкстра раскрывает вершины по возрастанию пройденного пути g,
     A* — по g + h, где h — расстояние до цели без учёта стен (допустимая
     и монотонная эвристика). Взвешенный A*: g + ε·h.
     ===================================================================== */
  const Grid = (() => {
    const NX = 30, NY = 20, CELL = 20, SQ2 = Math.SQRT2;
    /** План дома в клетках: [i0, j0, i1, j1] включительно. */
    const BLOCKS = [
      [10, 0, 10, 5], [10, 9, 10, 15], [10, 19, 10, 19],      // стена спален с дверями: строки 6–8 и 16–18
      [0, 10, 9, 10],                                         // стена между спальнями
      [20, 0, 20, 6], [20, 12, 20, 19],                        // стена кухни с дверью: строки 7–11
      [0, 0, 4, 3], [0, 11, 4, 13], [7, 0, 9, 1], [7, 11, 9, 12], // кровати и тумбы
      [13, 11, 15, 12], [17, 13, 19, 19],                     // стол и диван
      [21, 0, 29, 2], [26, 14, 29, 19],                       // плита с мойкой и холодильник
    ];
    function base() { const g = new Uint8Array(NX * NY); for (const [i0, j0, i1, j1] of BLOCKS) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * NX + i] = 1; return g; }
    const START = { i: 5, j: 7 }, GOAL = { i: 25, j: 9 };
    const octile = (a, b, c, d) => { const dx = Math.abs(a - c), dy = Math.abs(b - d); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
    /** mode: 'dijkstra' | 'astar'; eps — вес эвристики. Возвращает порядок раскрытия, путь и его длину в клетках. */
    function search(g, s, t, mode, eps) {
      eps = eps == null ? 1 : eps;
      const N = NX * NY, gs = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N), order = [];
      const hOf = (k) => (mode === 'dijkstra' ? 0 : eps * octile(k % NX, (k / NX) | 0, t.i, t.j));
      const heap = []; let seq = 0;
      const less = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] < b[2]); // равные f: дальше по g, потом раньше добавленная
      const push = (f, gv, k) => { const e = [f, gv, seq++, k]; heap.push(e); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (!less(heap[c], heap[p])) break; [heap[c], heap[p]] = [heap[p], heap[c]]; c = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
      const sk = s.j * NX + s.i, tk = t.j * NX + t.i;
      if (g[sk] || g[tk]) return { order, path: null, cost: Infinity, expanded: 0 };
      gs[sk] = 0; push(hOf(sk), 0, sk);
      while (heap.length) {
        const [, gv, , k] = pop(); if (closed[k]) continue; closed[k] = 1; order.push(k);
        if (k === tk) break;
        const i = k % NX, j = (k / NX) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue;
          const n = b * NX + a; if (g[n] || closed[n]) continue;
          if (di && dj && (g[j * NX + a] || g[b * NX + i])) continue;          // по диагонали мимо угла стены нельзя
          const ng = gv + (di && dj ? SQ2 : 1);
          if (ng < gs[n] - 1e-9) { gs[n] = ng; came[n] = k; push(ng + hOf(n), ng, n); }
        }
      }
      if (!closed[tk]) return { order, path: null, cost: Infinity, expanded: order.length };
      const path = []; for (let k = tk; k >= 0; k = came[k]) path.push(k); path.reverse();
      return { order, path, cost: gs[tk], expanded: order.length };
    }
    const free = (g) => { let n = 0; for (let k = 0; k < NX * NY; k++) if (!g[k]) n++; return n; };
    return { NX, NY, CELL, BLOCKS, base, START, GOAL, search, octile, free };
  })();

  /* =====================================================================
     6. RRT и RRT* на плоскости: гостиная 6 × 4 м, посередине перегородка
     из двух сдвижных створок. Ада — точка, препятствия раздуты на её
     радиус. Оба дерева получают одни и те же случайные точки, поэтому
     вершины у них совпадают; RRT* отличается только выбором родителя и
     перепривязкой соседей.
     ===================================================================== */
  const RRT = (() => {
    const W = 600, H = 400, R = 15, STEP = 30, GOAL_BIAS = 0.05, GAMMA = 650, RMAX_NEAR = 75, MAXIT = 6000;
    const START = { x: 60, y: 320 }, GOAL = { x: 540, y: 80 };
    const FIXED = [[130, 170, 210, 250], [390, 150, 470, 230], [110, 40, 190, 100], [410, 300, 490, 360]];
    /** Створки перегородки: верхняя от 0 до a, нижняя от b до 400 (по y), x 285–315. */
    function obstacles(door) { const d = door || { a: 140, b: 260 }; return FIXED.concat([[285, -10, 315, d.a], [285, d.b, 315, H + 10]]); }
    const inflate = (obs) => obs.map((r) => [r[0] - R, r[1] - R, r[2] + R, r[3] + R]);
    function pointFree(o, x, y) { if (x < R || y < R || x > W - R || y > H - R) return false; for (const r of o) if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return false; return true; }
    function segRect(x0, y0, x1, y1, r) {                       // пересекает ли отрезок прямоугольник (Лианг — Барски)
      let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      for (const [p, q] of [[-dx, x0 - r[0]], [dx, r[2] - x0], [-dy, y0 - r[1]], [dy, r[3] - y0]]) {
        if (Math.abs(p) < 1e-12) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
      }
      return t0 < t1;
    }
    function segFree(o, x0, y0, x1, y1) { if (!pointFree(o, x1, y1) || !pointFree(o, x0, y0)) return false; for (const r of o) if (segRect(x0, y0, x1, y1, r)) return false; return true; }
    /** Точный кратчайший путь: граф видимости по углам раздутых препятствий. */
    function optimal(o) {
      const eps = 0.5, pts = [START, GOAL];
      for (const r of o) for (const [x, y] of [[r[0] - eps, r[1] - eps], [r[2] + eps, r[1] - eps], [r[0] - eps, r[3] + eps], [r[2] + eps, r[3] + eps]]) if (pointFree(o, x, y)) pts.push({ x, y });
      const n = pts.length, d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), prev = new Int32Array(n).fill(-1); d[0] = 0;
      for (let it = 0; it < n; it++) {
        let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i;
        if (u < 0 || d[u] === Infinity) break; done[u] = 1; if (u === 1) break;
        for (let v = 0; v < n; v++) { if (done[v]) continue; const w = Math.hypot(pts[u].x - pts[v].x, pts[u].y - pts[v].y); if (d[u] + w < d[v] && segFree(o, pts[u].x, pts[u].y, pts[v].x, pts[v].y)) { d[v] = d[u] + w; prev[v] = u; } }
      }
      const path = []; if (d[1] < Infinity) for (let k = 1; k >= 0; k = prev[k]) path.push(pts[k]);
      return { cost: d[1], path: path.reverse() };
    }
    /** Дерево, растущее по одной итерации. star — RRT*. */
    function tree(o) {
      o = Object.assign({ seed: 1, star: false, door: null }, o);
      const obs = inflate(obstacles(o.door)), r = rng(o.seed), CS = 30, GX = Math.ceil(W / CS), GY = Math.ceil(H / CS), buckets = Array.from({ length: GX * GY }, () => []);
      const T = { o, obs, x: [START.x], y: [START.y], par: [-1], cost: [0], it: 0, first: null, goalIdx: -1, best: Infinity, hist: [], lastNew: -1 };
      const bk = (x, y) => clamp(Math.floor(y / CS), 0, GY - 1) * GX + clamp(Math.floor(x / CS), 0, GX - 1);
      buckets[bk(START.x, START.y)].push(0);
      function nearest(x, y) {
        const cx = clamp(Math.floor(x / CS), 0, GX - 1), cy = clamp(Math.floor(y / CS), 0, GY - 1); let best = -1, bd = Infinity;
        for (let ring = 0; ring < Math.max(GX, GY); ring++) {
          for (let j = cy - ring; j <= cy + ring; j++) for (let i = cx - ring; i <= cx + ring; i++) {
            if (i < 0 || j < 0 || i >= GX || j >= GY || (Math.abs(i - cx) !== ring && Math.abs(j - cy) !== ring)) continue;
            for (const k of buckets[j * GX + i]) { const d = (T.x[k] - x) ** 2 + (T.y[k] - y) ** 2; if (d < bd) { bd = d; best = k; } }
          }
          if (best >= 0 && Math.sqrt(bd) <= ring * CS) break;
        }
        return best;
      }
      function near(x, y, rad) {
        const out = [], i0 = clamp(Math.floor((x - rad) / CS), 0, GX - 1), i1 = clamp(Math.floor((x + rad) / CS), 0, GX - 1), j0 = clamp(Math.floor((y - rad) / CS), 0, GY - 1), j1 = clamp(Math.floor((y + rad) / CS), 0, GY - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const k of buckets[j * GX + i]) if ((T.x[k] - x) ** 2 + (T.y[k] - y) ** 2 <= rad * rad) out.push(k);
        return out;
      }
      T.radius = () => Math.min(RMAX_NEAR, GAMMA * Math.sqrt(Math.log(T.x.length + 1) / (T.x.length + 1)));
      T.step = function () {
        T.it++;
        const toGoal = r() < GOAL_BIAS, sx = toGoal ? GOAL.x : r() * W, sy = toGoal ? GOAL.y : r() * H;
        const ni = nearest(sx, sy), dx = sx - T.x[ni], dy = sy - T.y[ni], d = Math.hypot(dx, dy);
        T.lastNew = -1;
        if (d < 1e-9) { T.hist.push(T.best); return; }
        const f = Math.min(1, STEP / d), nx = T.x[ni] + dx * f, ny = T.y[ni] + dy * f;
        if (!segFree(obs, T.x[ni], T.y[ni], nx, ny)) { T.hist.push(T.best); return; }
        let par = ni, c = T.cost[ni] + Math.hypot(nx - T.x[ni], ny - T.y[ni]), nb = null;
        if (o.star) {                                                   // выбрать лучшего родителя среди соседей
          nb = near(nx, ny, T.radius());
          for (const k of nb) { const cc = T.cost[k] + Math.hypot(nx - T.x[k], ny - T.y[k]); if (cc < c - 1e-9 && segFree(obs, T.x[k], T.y[k], nx, ny)) { c = cc; par = k; } }
        }
        const id = T.x.length; T.x.push(nx); T.y.push(ny); T.par.push(par); T.cost.push(c); buckets[bk(nx, ny)].push(id); T.lastNew = id;
        if (o.star) {                                                   // перепривязать соседей через новую вершину, если так короче
          for (const k of nb) { if (k === par) continue; const cc = c + Math.hypot(nx - T.x[k], ny - T.y[k]); if (cc < T.cost[k] - 1e-9 && segFree(obs, nx, ny, T.x[k], T.y[k])) { const delta = T.cost[k] - cc; T.par[k] = id; propagate(k, delta); } }
        }
        const dg = Math.hypot(GOAL.x - nx, GOAL.y - ny);
        if (dg <= STEP && segFree(obs, nx, ny, GOAL.x, GOAL.y)) {
          const cg = c + dg; if (T.first == null) T.first = T.it;
          if (cg < T.best) { T.best = cg; T.goalIdx = id; }
        }
        if (o.star && T.goalIdx >= 0) T.best = Math.min(T.best, T.cost[T.goalIdx] + Math.hypot(GOAL.x - T.x[T.goalIdx], GOAL.y - T.y[T.goalIdx]));
        if (o.star && T.first != null) { for (const k of near(GOAL.x, GOAL.y, STEP)) { const cg = T.cost[k] + Math.hypot(GOAL.x - T.x[k], GOAL.y - T.y[k]); if (cg < T.best - 1e-9 && segFree(obs, T.x[k], T.y[k], GOAL.x, GOAL.y)) { T.best = cg; T.goalIdx = k; } } }
        T.hist.push(T.best);
      };
      function propagate(k, delta) { const st = [k]; T.cost[k] -= delta; const kids = childrenOf(); while (st.length) { const q = st.pop(); for (const ch of kids[q] || []) { T.cost[ch] -= delta; st.push(ch); } } }
      function childrenOf() { const ch = {}; for (let i = 1; i < T.par.length; i++) (ch[T.par[i]] = ch[T.par[i]] || []).push(i); return ch; }
      T.path = function () { if (T.goalIdx < 0) return null; const out = [GOAL]; for (let k = T.goalIdx; k >= 0; k = T.par[k]) out.push({ x: T.x[k], y: T.y[k] }); return out.reverse(); };
      return T;
    }
    /** Сколько итераций до первого пути в n запусках с разными зёрнами (только RRT: у RRT* первая находка та же). */
    function stats(door, n, from) { const out = []; for (let s = 0; s < n; s++) { const T = tree({ seed: (from || 100) + s, door }); while (T.first == null && T.it < MAXIT) T.step(); out.push(T.first == null ? MAXIT : T.first); } const so = out.slice().sort((a, b) => a - b); return { its: out, median: (so[(n - 1) >> 1] + so[n >> 1]) / 2, fails: out.filter((v) => v >= MAXIT).length }; }
    return { W, H, R, STEP, GOAL_BIAS, GAMMA, RMAX_NEAR, MAXIT, START, GOAL, FIXED, obstacles, inflate, pointFree, segFree, optimal, tree, stats };
  })();

  const API = { rng, randn, clamp, wrapA, KF, House, PF, OccMap, Grid, RRT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L4 = API;
})(typeof window !== 'undefined' ? window : globalThis);
