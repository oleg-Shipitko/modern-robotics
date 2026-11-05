/* =====================================================================
   l84/engine.js — движок урока 8.4 «Контроль качества».
   Без DOM: работает в браузере и Node.

   Все три лаборатории используют синтетические данные с фиксированным
   зерном. Политики действительно исполняются на каждом сценарии: исход
   зависит от условия, версии политики и начального состояния. Числа не
   приписываются статьям и не изображают обученную модель из публикации.
   ===================================================================== */
'use strict';
(function (root) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }
  function U(seed, a, b, c) {
    let h = mix32((seed >>> 0) ^ 0x9e3779b9);
    h = mix32(h ^ (a >>> 0));
    h = mix32((h + 0x632be5ab + (b >>> 0)) >>> 0);
    h = mix32((h ^ 0x85ebca6b) + (c >>> 0) >>> 0);
    return h / 4294967296;
  }

  /* -------------------------------------------------------------------
     1. Тестовая матрица. Одна и та же пара политик проходит одни и те же
        старты. Кандидат лучше на трёх привычных условиях и хуже на новом
        предмете. Смесь испытаний меняет общий итог, но не сами политики.
     ------------------------------------------------------------------- */
  const SLICES = [
    { id: 'usual', name: 'обычная кухня', short: 'обычно', base: 0.84, cand: 0.91 },
    { id: 'dim', name: 'тусклый свет', short: 'темно', base: 0.78, cand: 0.84 },
    { id: 'clutter', name: 'предметы рядом', short: 'помехи', base: 0.73, cand: 0.78 },
    { id: 'novel', name: 'новый предмет', short: 'новое', base: 0.68, cand: 0.46 },
  ];
  const PLANS = {
    traffic: { id: 'traffic', name: 'рабочая смесь', counts: [70, 18, 10, 2] },
    balanced: { id: 'balanced', name: 'поровну', counts: [25, 25, 25, 25] },
    stress: { id: 'stress', name: 'стресс-тест', counts: [10, 10, 20, 60] },
  };

  /** Парный исход на одном старте. Общая трудность создаёт корреляцию,
   *  небольшой шум версии не даёт сравнению быть искусственно идеальным. */
  function pairedOutcome(seed, sliceIndex, trialIndex, pBase, pCand) {
    const hard = U(seed, sliceIndex, trialIndex, 0);
    const nb = (U(seed, sliceIndex, trialIndex, 1) - 0.5) * 0.12;
    const nc = (U(seed, sliceIndex, trialIndex, 2) - 0.5) * 0.12;
    return {
      base: hard + nb < pBase,
      cand: hard + nc < pCand,
    };
  }

  function evaluate(planId, seed) {
    const plan = PLANS[planId] || PLANS.traffic;
    seed = seed == null ? 8401 : seed;
    const rows = [];
    let base = 0, cand = 0, total = 0, candOnly = 0, baseOnly = 0;
    SLICES.forEach((s, j) => {
      const n = plan.counts[j];
      let b = 0, c = 0, co = 0, bo = 0;
      for (let i = 0; i < n; i++) {
        const r = pairedOutcome(seed, j, i, s.base, s.cand);
        if (r.base) b++;
        if (r.cand) c++;
        if (r.cand && !r.base) co++;
        if (r.base && !r.cand) bo++;
      }
      rows.push({ slice: s, n, base: b, cand: c, baseRate: b / n, candRate: c / n, candOnly: co, baseOnly: bo });
      base += b; cand += c; total += n; candOnly += co; baseOnly += bo;
    });
    const worst = rows.reduce((a, b) => (b.candRate - b.baseRate < a.candRate - a.baseRate ? b : a));
    return { plan, rows, total, base, cand, baseRate: base / total, candRate: cand / total, diff: (cand - base) / total, candOnly, baseOnly, worst };
  }

  /* -------------------------------------------------------------------
     2. Размер и схема сравнения. Парный вариант даёт обеим политикам
        тот же старт; непарный — разные старты из одной смеси условий.
     ------------------------------------------------------------------- */
  const CMP = { seed: 8423, max: 600, base: 0.76, cand: 0.82 };

  function comparisonTrial(i, paired) {
    const slice = i % SLICES.length;
    const load = [0.04, 0.02, -0.01, -0.05][slice];
    const pb = clamp(CMP.base + load, 0.05, 0.98);
    const pc = clamp(CMP.cand + load, 0.05, 0.98);
    if (paired) return pairedOutcome(CMP.seed, slice, i, pb, pc);
    const a = pairedOutcome(CMP.seed, slice, i * 2, pb, pc).base;
    const b = pairedOutcome(CMP.seed + 71, slice, i * 2 + 1, pb, pc).cand;
    return { base: a, cand: b };
  }

  function wilson(k, n, z) {
    z = z || 1.96;
    if (!n) return { p: 0, lo: 0, hi: 1 };
    const p = k / n, z2 = z * z, den = 1 + z2 / n;
    const mid = (p + z2 / (2 * n)) / den;
    const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return { p, lo: clamp(mid - half, 0, 1), hi: clamp(mid + half, 0, 1) };
  }

  function compare(n, paired) {
    n = clamp(Math.round(n), 10, CMP.max);
    let kb = 0, kc = 0, candOnly = 0, baseOnly = 0, sum = 0, sum2 = 0;
    const trials = [];
    for (let i = 0; i < n; i++) {
      const r = comparisonTrial(i, !!paired);
      const d = (r.cand ? 1 : 0) - (r.base ? 1 : 0);
      if (r.base) kb++;
      if (r.cand) kc++;
      if (d === 1) candOnly++;
      if (d === -1) baseOnly++;
      sum += d; sum2 += d * d;
      trials.push({ base: r.base, cand: r.cand, d });
    }
    const diff = sum / n;
    let se;
    if (paired) {
      const variance = n > 1 ? (sum2 - n * diff * diff) / (n - 1) : 0;
      se = Math.sqrt(Math.max(0, variance) / n);
    } else {
      const pb = kb / n, pc = kc / n;
      se = Math.sqrt(pb * (1 - pb) / n + pc * (1 - pc) / n);
    }
    const half = 1.96 * se;
    return {
      n, paired: !!paired, kb, kc, base: wilson(kb, n), cand: wilson(kc, n),
      diff, lo: diff - half, hi: diff + half, se, candOnly, baseOnly,
      decisive: diff - half > 0 || diff + half < 0, trials,
    };
  }

  function firstDecisive(paired, start, end, step) {
    for (let n = start; n <= end; n += step) if (compare(n, paired).lo > 0) return n;
    return null;
  }

  /* -------------------------------------------------------------------
     3. Критерии выпуска. Это учебная модель, а не отраслевой стандарт.
     ------------------------------------------------------------------- */
  const BASELINE = { overall: 0.79, rare: 0.66, unsafe: 0, latency: 360 };
  const CANDIDATES = {
    fast: { id: 'fast', name: 'Кандидат A', overall: 0.85, rare: 0.54, unsafe: 2, latency: 435 },
    stable: { id: 'stable', name: 'Кандидат B', overall: 0.82, rare: 0.68, unsafe: 0, latency: 392 },
  };
  const GATES = {
    overall: { id: 'overall', name: 'общий успех не ниже текущего', test: (c) => c.overall >= BASELINE.overall },
    slice: { id: 'slice', name: 'ни одно важное условие не хуже более чем на 5 п.п.', test: (c) => c.rare >= BASELINE.rare - 0.05 },
    safety: { id: 'safety', name: 'ни одного опасного действия', test: (c) => c.unsafe === 0 },
    latency: { id: 'latency', name: '95-й процентиль задержки не выше 400 мс', test: (c) => c.latency <= 400 },
  };
  function release(candidateId, enabled) {
    const candidate = CANDIDATES[candidateId] || CANDIDATES.fast;
    enabled = enabled && enabled.length ? enabled : ['overall'];
    const checks = enabled.map((id) => ({ id, gate: GATES[id], pass: !!GATES[id].test(candidate) }));
    return { candidate, enabled: enabled.slice(), checks, pass: checks.every((x) => x.pass), failed: checks.filter((x) => !x.pass) };
  }

  /* Лестница доказательств. Это не рейтинг инструментов: каждый уровень
     отвечает на новый вопрос и сохраняет ограничения предыдущих. */
  const QA_LEVELS = [
    { id: 'code', name: 'Программные тесты', short: 'код', proof: 'Формы тензоров, диапазоны команд, загрузка весов и обработка пропавшего кадра.', limit: 'Нет физики, контакта и обратной связи от мира.', source: 'локально' },
    { id: 'replay', name: 'Воспроизведение журналов', short: 'журналы', proof: 'На записанных наблюдениях совпадают команды, задержка и срабатывания защит.', limit: 'Действие не меняет следующий кадр: контур остаётся разомкнутым.', source: 'записи' },
    { id: 'sim', name: 'Симулятор или модель мира', short: 'модель мира', proof: 'Замкнутый контур дешёво расширяет матрицу и воспроизводит опасные сценарии.', limit: 'Ошибки физики и генеративной модели могут изменить исход.', source: 'simulation' },
    { id: 'real', name: 'Реальный робот', short: 'стенд', proof: 'Парные испытания проверяют контакт, восприятие и состояние оборудования.', limit: 'Стенд покрывает конечный набор роботов, дней и помещений.', source: 'real' },
    { id: 'limited', name: 'Ограниченный выпуск', short: 'малый поток', proof: 'Наблюдается остаточный риск в настоящем потоке задач с готовым откатом.', limit: 'Это контролируемое воздействие на продукт, а не замена стендовой проверке.', source: 'product' },
  ];

  const API = {
    clamp, mix32, U, SLICES, PLANS, pairedOutcome, evaluate,
    CMP, comparisonTrial, wilson, compare, firstDecisive,
    BASELINE, CANDIDATES, GATES, release, QA_LEVELS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.L84 = API;
})(typeof window !== 'undefined' ? window : globalThis);
