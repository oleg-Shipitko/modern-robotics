/* =====================================================================
   l83/engine.js — движок урока 8.3 «Надёжность». Без DOM: работает в
   браузере (window.L83) и в Node (require).
   1) Цепочка надёжности: латте — восемь шагов, у каждого своя попытка.
      Если попытка сорвалась, Ада замечает это с вероятностью d и повторяет
      шаг (не больше R раз); незамеченная ошибка — тихий отказ: Ада идёт
      дальше и подаёт испорченный латте; ошибка, замеченная после всех
      повторов, — громкий отказ: Ада останавливается и зовёт человека.
      100 заказов считаются по-настоящему, с зерном; у каждой попытки свои
      случайные числа, поэтому две версии Ады проходят одни и те же заказы.
   2) Детектор отказов: день работы — 300 латте, после каждого шага
      детектор выдаёт оценку «шаг сорвался» от 0 до 1. Порог решает, когда
      Ада останавливается и зовёт человека. Оценки — случайные числа из
      заданных распределений (иллюстрация, а не обученный детектор).
   3) Сколько запусков нужно: серии латте подряд до первой ошибки, вероятность
      пройти проверку без единой ошибки и правило трёх.
   Ни Math.pow, ни exp, ни log: случайность — целочисленный хэш, степени —
   умножением, нормальный шум — сумма равномерных. Поэтому числа одни и те
   же в любом браузере и в Node.
   ===================================================================== */
'use strict';
(function (root) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- 0. случайность и степени ---------- */
  /** Перемешивание 32-битного числа (вариант splitmix/murmur): только целые операции. */
  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }
  /** Равномерное число из [0, 1), которое зависит только от зерна и трёх индексов. */
  function U(seed, a, b, c) {
    let h = mix32((seed >>> 0) ^ 0x9e3779b9);
    h = mix32(h ^ (a >>> 0));
    h = mix32((h + 0x632be5ab + (b >>> 0)) >>> 0);
    h = mix32((h ^ 0x85ebca6b) + (c >>> 0) >>> 0);
    return h / 4294967296;
  }
  /** Генератор с зерном (как HeroKit.rng): для порядка, где индексы не нужны. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** x в целой степени n ≥ 0: возведение квадратами, только умножения. */
  function ipow(x, n) {
    let r = 1, b = x, e = n;
    while (e > 0) { if (e & 1) r *= b; b *= b; e = Math.floor(e / 2); }
    return r;
  }
  /** Почти нормальная величина: сумма четырёх равномерных, приведённая к среднему 0 и σ = 1. */
  const IH = 1.7320508075688772;   // √3: у суммы четырёх равномерных σ = 1/√3
  function gauss4(u1, u2, u3, u4) { return (u1 + u2 + u3 + u4 - 2) * IH; }

  const CFG = {
    SEED: 25,         // зерно лаборатории 1: сто заказов
    DAY_SEED: 1005,   // зерно лаборатории 2: день работы
    RUN_SEED: 85,     // зерно лаборатории 3: серии запусков
    ORDERS: 100,      // заказов в лаборатории 1
    MIN_PER_LATTE: 3, // минут работы Ады на один латте (для времени между вмешательствами)
  };

  /* =====================================================================
     1. Цепочка надёжности: 100 латте
     ===================================================================== */
  const STEPS = [
    { id: 'cup', t: 'взять чашку', s: 'чашка' },
    { id: 'place', t: 'поставить под кофемашину', s: 'под кофемашину' },
    { id: 'shot', t: 'сварить эспрессо', s: 'эспрессо' },
    { id: 'milk', t: 'взять молоко', s: 'молоко' },
    { id: 'froth', t: 'вспенить молоко', s: 'вспенить' },
    { id: 'pour', t: 'влить молоко в чашку', s: 'влить' },
    { id: 'pick', t: 'взять латте', s: 'взять' },
    { id: 'serve', t: 'поставить на стол', s: 'подать' },
  ];
  /** Шаг по формуле: p — успех попытки, d — доля замеченных ошибок, R — сколько раз можно повторить.
   *  ok — шаг в итоге удался, silent — ошибку не заметили, loud — заметили, но повторы кончились. */
  function stepModel(p, d, R) {
    const q = 1 - p, qd = q * d;
    let s = 0, t = 1; for (let i = 0; i <= R; i++) { s += t; t *= qd; }
    return { ok: p * s, silent: q * (1 - d) * s, loud: t };
  }
  /** Задача из n шагов: ok — все шаги удались, loud — Ада где-то остановилась, silent — подала испорченный латте. */
  function taskModel(p, n, d, R) {
    const st = stepModel(p, d, R), ok = ipow(st.ok, n), noLoud = ipow(1 - st.loud, n);
    return { step: st, ok, loud: 1 - noLoud, silent: noLoud - ok, clean: ipow(p, n) };
  }
  /** 100 заказов по-настоящему. o: { p, n, d, R, N, seed }.
   *  Исход заказа: ok — без единой ошибки, saved — была ошибка, но повтор её исправил,
   *  loud — Ада остановилась и позвала человека, silent — Ада подала испорченный латте. */
  function orders(o) {
    const p = o.p, n = o.n, d = o.d || 0, R = o.R || 0, N = o.N || CFG.ORDERS, seed = o.seed == null ? CFG.SEED : o.seed;
    const list = [], per = [];
    for (let j = 0; j < n; j++) per.push({ fail: 0, saved: 0, loud: 0, silent: 0 });
    const cnt = { ok: 0, saved: 0, loud: 0, silent: 0, good: 0, fails: 0, retries: 0 };
    for (let i = 0; i < N; i++) {
      let spoiled = false, retried = false, stopAt = -1, firstBad = -1, retries = 0;
      for (let j = 0; j < n && stopAt < 0; j++) {
        for (let a = 0; ; a++) {
          const fail = U(seed, i, j, 2 * a) >= p;
          if (!fail) { if (a > 0) { per[j].saved++; retried = true; } break; }
          per[j].fail++; cnt.fails++;
          if (firstBad < 0) firstBad = j;
          const seen = U(seed, i, j, 2 * a + 1) < d;
          if (!seen) { per[j].silent++; spoiled = true; break; }
          if (a >= R) { per[j].loud++; stopAt = j; break; }
          retries++;
        }
      }
      cnt.retries += retries;
      const out = stopAt >= 0 ? 'loud' : spoiled ? 'silent' : retried ? 'saved' : 'ok';
      cnt[out]++;
      list.push({ out, step: out === 'loud' ? stopAt : firstBad, retries });
    }
    cnt.good = cnt.ok + cnt.saved;
    return { list, per, cnt, o: { p, n, d, R, N, seed } };
  }

  /* =====================================================================
     2. Детектор отказов: день работы и порог
     ===================================================================== */
  /** Распределения оценки «шаг сорвался» (среднее и σ) для удачного шага, грубого и тонкого отказа.
   *  sens — датчики: весы под чашкой и датчик силы в захвате; vlm — модель зрения и языка по кадру камеры. */
  const DET = {
    sens: { name: 'датчики', ok: [0.15, 0.07], gross: [0.85, 0.08], subtle: [0.2, 0.08], glitch: 0.002 },
    vlm: { name: 'VLM по камере', ok: [0.22, 0.095], gross: [0.55, 0.15], subtle: [0.64, 0.12], glitch: 0.008 },
  };
  const DAY = { LATTES: 300, Q: 0.015, SUBTLE: 0.5 };   // латте за день, доля сорвавшихся шагов, доля тонких среди них
  /** Оценка детектора: обычно — среднее и разброс своего вида шага; изредка (glitch) — сбой, случайное число от 0 до 1:
   *  блик на чашке, рука человека в кадре, толчок стола. */
  function score(seed, k, det, kind) {
    const m = DET[det], mv = m[kind], b = 8 * k + (det === 'vlm' ? 4 : 0);
    if (U(seed, 12, b, 0) < m.glitch) return U(seed, 12, b, 1);
    const z = gauss4(U(seed, 11, b, 1), U(seed, 11, b + 1, 2), U(seed, 11, b + 2, 3), U(seed, 11, b + 3, 4));
    return clamp(mv[0] + mv[1] * z, 0, 1);
  }
  /** День работы: для каждой проверки после шага — что случилось на деле и что сказали оба детектора. */
  function day(o) {
    o = o || {};
    const seed = o.seed == null ? CFG.DAY_SEED : o.seed, L = o.lattes || DAY.LATTES, n = o.n || STEPS.length, q = o.q == null ? DAY.Q : o.q, sub = o.subtle == null ? DAY.SUBTLE : o.subtle;
    const checks = [];
    for (let i = 0; i < L; i++) for (let j = 0; j < n; j++) {
      const k = i * n + j, f = U(seed, 3, k, 0) < q, kind = !f ? 'ok' : U(seed, 3, k, 1) < sub ? 'subtle' : 'gross';
      checks.push({ i, j, kind, sens: score(seed, k, 'sens', kind), vlm: score(seed, k, 'vlm', kind) });
    }
    return { checks, L, n, seed };
  }
  /** Оценка проверки при выбранном детекторе: оба — тревога, если сработал хотя бы один (как «или»). */
  const scoreOf = (c, mode) => (mode === 'both' ? (c.sens > c.vlm ? c.sens : c.vlm) : c[mode]);
  /** Итог дня при пороге T: тревога, если оценка ≥ T. По тревоге Ада останавливается и зовёт человека:
   *  сорвавшийся шаг он исправляет, удачный — подтверждает (ложная тревога). Незамеченный срыв — испорченный латте. */
  function judge(D, T, mode) {
    const r = { T, mode, alarms: 0, falseAlarms: 0, caught: 0, missed: 0, missedGross: 0, missedSubtle: 0, fails: 0, spoiled: 0, okSteps: 0, events: [] };
    const bad = new Uint8Array(D.L);
    for (const c of D.checks) {
      const s = scoreOf(c, mode), alarm = s >= T;
      if (c.kind === 'ok') { r.okSteps++; if (alarm) { r.alarms++; r.falseAlarms++; r.events.push({ i: c.i, e: 'false' }); } }
      else {
        r.fails++;
        if (alarm) { r.alarms++; r.caught++; r.events.push({ i: c.i, e: 'caught' }); }
        else { r.missed++; if (c.kind === 'gross') r.missedGross++; else r.missedSubtle++; if (!bad[c.i]) { bad[c.i] = 1; r.spoiled++; r.events.push({ i: c.i, e: 'spoiled' }); } }
      }
    }
    const minutes = D.L * CFG.MIN_PER_LATTE;
    r.minutes = minutes; r.mtbi = r.alarms ? minutes / r.alarms : Infinity;
    return r;
  }
  /** Гистограммы оценок: удачные шаги и сорвавшиеся (грубые и тонкие отдельно), bins корзин на [0, 1]. */
  function hist(D, mode, bins) {
    const h = { ok: new Array(bins).fill(0), gross: new Array(bins).fill(0), subtle: new Array(bins).fill(0) };
    for (const c of D.checks) { const b = Math.min(bins - 1, Math.floor(scoreOf(c, mode) * bins)); h[c.kind][b]++; }
    return h;
  }
  /** Все пороги сетки: итог дня для каждого (для поиска и подсказок). */
  function sweep(D, mode, Ts) { return Ts.map((T) => judge(D, T, mode)); }

  /* =====================================================================
     3. Сколько запусков нужно
     ===================================================================== */
  /** Вероятность пройти проверку из n запусков без единой ошибки при настоящей надёжности p. */
  const passProb = (p, n) => ipow(p, n);
  /** Сколько удачных запусков подряд нужно, чтобы политика с долей отказов f проходила проверку
   *  не чаще чем с вероятностью alpha (по умолчанию 5%): наименьшее n с (1 − f)^n ≤ alpha. */
  function needRuns(f, alpha) {
    alpha = alpha == null ? 0.05 : alpha;
    let n = 0, v = 1; const p = 1 - f;
    while (v > alpha && n < 1e7) { v *= p; n++; }
    return n;
  }
  /** Верхняя граница доли отказов после n удачных запусков подряд: наибольшее f, при котором
   *  (1 − f)^n ≥ alpha (половинным делением, только умножения). Правило трёх: ≈ 3/n. */
  function upperBound(n, alpha) {
    alpha = alpha == null ? 0.05 : alpha;
    let lo = 0, hi = 1;
    for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (ipow(1 - m, n) >= alpha) lo = m; else hi = m; }
    return lo;
  }
  /** Серии запусков: rows проверок, каждая — латте подряд до первой ошибки, но не дальше cap.
   *  Возвращает длину серии (сколько удачных подряд) и где была первая ошибка. */
  function series(p, rows, cap, seed) {
    seed = seed == null ? CFG.RUN_SEED : seed;
    const out = [];
    for (let r = 0; r < rows; r++) {
      let k = 0;
      while (k < cap && U(seed, 50 + r, k, 7) < p) k++;
      out.push({ run: k, failed: k < cap });
    }
    return out;
  }
  /** Итог проверок длиной n: сколько из них прошли без единой ошибки. */
  function passed(S, n) { let c = 0; for (const s of S) if (s.run >= n) c++; return c; }

  const API = { CFG, U, rng, ipow, mix32, gauss4, clamp, STEPS, stepModel, taskModel, orders, DET, DAY, day, scoreOf, judge, hist, sweep, passProb, needRuns, upperBound, series, passed };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L83 = API;
})(typeof window !== 'undefined' ? window : globalThis);
