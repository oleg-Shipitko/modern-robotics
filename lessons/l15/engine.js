/* =====================================================================
   engine.js — урок 1.5 «Diffusion Policy», раздел «Положение или скорость».
   Упрощённая модель исполнения пачки без DOM поверх shared/kettle-core.js
   (движок kettle-core режим «скорости против положений» не поддерживает,
   поэтому модель живёт здесь). Ада едет по дому мимо чайника; политика —
   учитель из демонстраций урока 1.3: из наблюдаемого положения строит пачку
   из 16 положений, которая возвращает Аду на задуманный маршрут объезда.
   Одна и та же пачка исполняется двумя регуляторами:
     • позиционный — каждый шаг тянет Аду к абсолютной точке пачки;
     • скоростной — каждый шаг сдвигает Аду на приращение между соседними
       точками пачки, где бы она ни оказалась.
   Исполняется Ta = 8 шагов из 16; следующая пачка запрашивается в момент
   начала исполнения текущей и приходит с задержкой delay шагов, до её прихода
   Ада продолжает старую пачку по номеру шага (асинхронное исполнение).
   Шум исполнения — гауссов сдвиг вбок на каждом шаге (см). Наблюдение точное.
   В браузере — window.L15, в Node — module.exports.
   ===================================================================== */
(function (root) {
  'use strict';
  const E = typeof Kettle !== 'undefined' ? Kettle : require('../shared/kettle-core.js');
  const PV = { Ta: 8, Tp: 16, gain: 0.65, delay: 3, noise: 1, side: -1, delayMax: 6, noiseMax: 3 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Задуманный маршрут: объезд чайника со стороны side (−1 слева, 1 справа), как в демонстрациях. */
  function pvRoute(side) { return E.plan(E.KETTLE, side, E.TP.gap, E.TP.w); }
  /** Пачка из наблюдаемого положения (x, y): 16 абсолютных положений Ады на шагах вперёд.
   *  Учитель из урока 1.3: обратная связь gain·(маршрут − x) плюс собственный сдвиг маршрута. */
  function pvChunk(x, y, f, o) {
    o = o || PV; const p = []; let xc = x, yc = y;
    for (let j = 0; j < o.Tp; j++) {
      const yn = yc - E.V, tgt = f(yn), prev = f(yc);
      xc += clamp(o.gain * (tgt - xc) + (tgt - prev), -E.UMAX, E.UMAX); yc = yn; p.push({ x: xc, y: yc });
    }
    return p;
  }
  /** Один прогон. mode: 'pos' — пачка исполняется как положения, 'vel' — как скорости.
   *  o: delay — задержка прихода новой пачки в шагах, noise — шум исполнения (см за шаг), Ta, Tp, side.
   *  Шум берётся из зерна seed: при одном зерне у обоих режимов один и тот же ряд сдвигов.
   *  Отклонение errs[t] — где Ада оказалась после шага t минус точка пачки, которую исполняла на этом шаге;
   *  intend — эти точки пачек по шагам, то есть задуманный путь. */
  function pvRun(mode, seed, o) {
    o = Object.assign({}, PV, o || {}); const r = E.rng(seed * 5351 + 7), f = pvRoute(o.side), k = E.KETTLE;
    let x = E.START.x, y = E.START.y, touch = false, hit = null, cur = null, pending = null;
    const pts = [{ x, y }], errs = [0], chunks = [], intend = [{ x, y }];
    for (let t = 0; t < E.T; t++) {
      if (t % o.Ta === 0) {
        const ch = { t0: t, x0: x, y0: y, p: pvChunk(x, y, f, o), arrive: t === 0 ? 0 : t + o.delay, from: null };
        if (t === 0) { cur = ch; } else pending = ch;
      }
      if (pending && t >= pending.arrive) { cur = pending; pending = null; }
      if (cur.from == null) { cur.from = t; chunks.push(cur); }
      const j = Math.min(o.Tp - 1, t - cur.t0), p = cur.p[j], q = j > 0 ? cur.p[j - 1] : { x: cur.x0, y: cur.y0 };
      const eps = E.randn(r) * o.noise;
      const nx = mode === 'pos' ? x + clamp(p.x - x, -E.UMAX, E.UMAX) + eps : x + clamp(p.x - q.x, -E.UMAX, E.UMAX) + eps;
      const ny = y - E.V;
      if (!touch && E.segHit({ x, y }, { x: nx, y: ny }, k)) { touch = true; hit = { t, x: nx, y: ny }; }
      x = nx; y = ny; pts.push({ x, y }); intend.push({ x: p.x, y: p.y }); errs.push(x - p.x);
    }
    let maxDev = 0, kDev = 0, kBest = 1e9;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(errs[i]); if (d > maxDev) maxDev = d; const dy = Math.abs(pts[i].y - k.y); if (dy < kBest) { kBest = dy; kDev = d; } }
    return { mode, seed, pts, intend, errs, touch, hit, maxDev, kDev, endDev: Math.abs(errs[errs.length - 1]), chunks };
  }
  /** Пара прогонов с одним зерном: положения и скорости при одинаковых сдвигах. */
  function pvPair(seed, o) { return { pos: pvRun('pos', seed, o), vel: pvRun('vel', seed, o) }; }
  const summ = (rs) => ({
    n: rs.length, touches: rs.filter((q) => q.touch).length,
    kMean: rs.reduce((s, q) => s + q.kDev, 0) / rs.length, kMax: Math.max(...rs.map((q) => q.kDev)),
    maxMean: rs.reduce((s, q) => s + q.maxDev, 0) / rs.length, maxMax: Math.max(...rs.map((q) => q.maxDev)),
    endMean: rs.reduce((s, q) => s + q.endDev, 0) / rs.length,
  });
  /** n пар прогонов с зёрнами seed0…seed0+n−1. Сводка по каждому режиму и сравнение по парам. */
  function pvBatch(n, seed0, o) {
    const pairs = []; for (let i = 0; i < n; i++) pairs.push(pvPair(seed0 + i, o));
    const pos = pairs.map((q) => q.pos), vel = pairs.map((q) => q.vel);
    const velWorse = pairs.filter((q) => q.vel.maxDev > q.pos.maxDev).length;   // в скольких парах скорости отклонились сильнее
    return { pairs, pos: summ(pos), vel: summ(vel), velWorse, delay: o && o.delay != null ? o.delay : PV.delay, noise: o && o.noise != null ? o.noise : PV.noise };
  }
  const API = { PV, pvRoute, pvChunk, pvRun, pvPair, pvBatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L15 = API;
})(typeof window !== 'undefined' ? window : globalThis);
