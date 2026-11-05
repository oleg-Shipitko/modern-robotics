/* Урок 7.5. Проверка политик в общем физическом мире L71. Без DOM. */
'use strict';
(function (root) {
  const L71 = root.L71 || (typeof require !== 'undefined' ? require('../l71/engine.js') : null);
  const PACK = root.L75ModelData || (typeof require !== 'undefined' ? require('./model-data.js') : null);
  if (!L71 || !PACK) throw new Error('L75 требует L71 и встроенные веса model-data.js');

  const CHECKPOINTS = [
    { id: 'A', theta: [.46, 0, .03] }, { id: 'B', theta: [.28, 0, .06] },
    { id: 'C', theta: [.24, 0, .03] }, { id: 'D', theta: [.32, 0, .06] },
    { id: 'E', theta: [.16, -.05, 0] }, { id: 'F', theta: [.28, .05, .03] },
    { id: 'G', theta: [.16, -.10, .03] }, { id: 'H', theta: [.12, -.10, 0] },
  ];
  const CANDIDATES = [
    [.12, -.10, 0], [.16, -.10, .03], [.20, -.08, 0], [.24, -.06, .03], [.28, -.04, .06],
    [.32, -.02, 0], [.28, 0, .06], [.36, .02, .03], [.32, .04, .06], [.28, .06, 0],
    [.24, .08, .03], [.20, .10, .06], [.40, 0, .03], [.46, 0, .03], [.52, -.02, 0],
    [.58, .02, .06], [.64, -.04, .03], [.70, .04, 0], [.76, -.06, .06], [.18, .12, .03],
  ].map((theta, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, theta }));

  function unpack(p) { return { nets: p.nets.map(L71.unpackNet), fails: p.fails.map(L71.unpackNet), k: p.k, seed: p.seed, n: p.n, npos: p.npos, epochs: p.epochs }; }
  const MODELS = Object.fromEntries(Object.entries(PACK.models).map(([k, v]) => [k, unpack(v)]));
  const LAB_STARTS = L71.starts(40, 575, L71.LAYOUTS.base), SCREEN_STARTS = L71.starts(80, 575, L71.LAYOUTS.base);
  function mean(a) { return a.reduce((s, x) => s + x, 0) / Math.max(1, a.length); }
  function pearson(a, b) { const am = mean(a), bm = mean(b); let xy = 0, xx = 0, yy = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - am, y = b[i] - bm; xy += x * y; xx += x * x; yy += y * y; } return xx && yy ? xy / Math.sqrt(xx * yy) : 0; }
  function ranks(a) { const s = a.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v || x.i - y.i), out = new Array(a.length); for (let i = 0; i < s.length;) { let j = i + 1; while (j < s.length && Math.abs(s[j].v - s[i].v) < 1e-12) j++; const r = (i + 1 + j) / 2; for (let k = i; k < j; k++) out[s[k].i] = r; i = j; } return out; }
  function spearman(a, b) { return pearson(ranks(a), ranks(b)); }
  function mmrv(sim, real) { let sum = 0; for (let i = 0; i < real.length; i++) { let worst = 0; for (let j = 0; j < real.length; j++) { const reversed = (sim[i] < sim[j]) !== (real[i] < real[j]); if (reversed) worst = Math.max(worst, Math.abs(real[i] - real[j])); } sum += worst; } return sum / real.length; }
  function metrics(sim, real) { return { pearson: pearson(sim, real), spearman: spearman(sim, real), mmrv: mmrv(sim, real) }; }
  function modelKey(rollouts, failures) { if (!rollouts) return 'demo'; return `p${rollouts >= 6 ? 6 : 2}${failures ? 'all' : 'success'}`; }
  function imagined(model, theta, starts, judge) { const x = L71.scoreImag(model, theta, starts, L71.LAYOUTS.base, { tau: 0, seed: 75 }); return { score: judge === 'soft' ? .65 * x.score + .35 * x.ok : x.score, ok: x.ok, spread: x.spread }; }
  function realResult(theta, starts) { return L71.evalReal(theta, { starts, layout: 'base' }); }
  function exam(opts) {
    opts = Object.assign({ rollouts: 0, failures: false, judge: 'strict' }, opts || {});
    const key = modelKey(opts.rollouts, opts.failures), model = MODELS[key];
    const rows = CHECKPOINTS.map((p) => { const im = imagined(model, p.theta, LAB_STARTS, opts.judge), real = realResult(p.theta, LAB_STARTS); return { id: p.id, theta: p.theta.slice(), modelScore: im.score, modelSuccess: im.ok, spread: im.spread, realSuccess: real.rate, realTime: real.tMean, real }; });
    const m = metrics(rows.map((x) => x.modelScore), rows.map((x) => x.realSuccess));
    const byModel = rows.slice().sort((a, b) => b.modelScore - a.modelScore || a.id.localeCompare(b.id));
    const byReal = rows.slice().sort((a, b) => b.realSuccess - a.realSuccess || a.realTime - b.realTime || a.id.localeCompare(b.id));
    return { key, opts, rows, byModel, byReal, metrics: m, bestModel: byModel[0].id, bestReal: byReal[0].id };
  }

  function rng(seed) { return L71.rng(seed * 4099 + 17); }
  function binomial(n, p, r) { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; }
  function screenScores(modelKeyName) { const model = MODELS[modelKeyName || 'p6all']; return CANDIDATES.map((p) => { const im = imagined(model, p.theta, SCREEN_STARTS, 'strict'), real = realResult(p.theta, SCREEN_STARTS); return { id: p.id, theta: p.theta.slice(), modelScore: im.score, realSuccess: real.rate, realTime: real.tMean || L71.T_TASK }; }); }
  const SCREEN_ROWS = screenScores('p6all');
  const TRUE_BEST = SCREEN_ROWS.slice().sort((a, b) => b.realSuccess - a.realSuccess || a.realTime - b.realTime || a.id.localeCompare(b.id))[0];
  function simulateScreen(k, budget, seed) {
    k = Math.max(1, Math.min(SCREEN_ROWS.length, Math.round(k || 1))); budget = Math.max(k, Math.round(budget || 80));
    const top = SCREEN_ROWS.slice().sort((a, b) => b.modelScore - a.modelScore || a.id.localeCompare(b.id)).slice(0, k), n = Math.max(1, Math.floor(budget / k)), nAll = Math.max(1, Math.floor(budget / SCREEN_ROWS.length));
    let hit = 0, hitAll = 0; const chosen = {}, chosenAll = {};
    for (let rep = 0; rep < 500; rep++) { const r = rng((seed || 75) + rep * 13), r2 = rng((seed || 75) + rep * 13 + 991); const pick = top.map((x) => ({ x, rate: binomial(n, x.realSuccess, r) / n, tie: r() })).sort((a, b) => b.rate - a.rate || a.tie - b.tie)[0].x; const pickAll = SCREEN_ROWS.map((x) => ({ x, rate: binomial(nAll, x.realSuccess, r2) / nAll, tie: r2() })).sort((a, b) => b.rate - a.rate || a.tie - b.tie)[0].x; chosen[pick.id] = (chosen[pick.id] || 0) + 1; chosenAll[pickAll.id] = (chosenAll[pickAll.id] || 0) + 1; if (pick.id === TRUE_BEST.id) hit++; if (pickAll.id === TRUE_BEST.id) hitAll++; }
    return { k, budget, trialsEach: n, trialsEachAll: nAll, top: top.map((x) => x.id), best: TRUE_BEST.id, hitRate: hit / 500, allRobotRate: hitAll / 500, chosen, chosenAll };
  }
  function causalProbe(key) { key = key || 'p6all'; const model = MODELS[key], opts = { rollouts: key === 'demo' ? 0 : key.includes('6') ? 6 : 2, failures: key.endsWith('all') }, before = exam(opts).rows.map((x) => x.modelScore), saved = []; for (const net of model.nets) { const last = net.L[net.L.length - 1]; saved.push(Array.from(last.w)); last.w.fill(0); } const after = CHECKPOINTS.map((p) => imagined(model, p.theta, LAB_STARTS, 'strict').score); model.nets.forEach((net, i) => net.L[net.L.length - 1].w.set(saved[i])); return { key, before, after, change: mean(before.map((x, i) => Math.abs(x - after[i]))) }; }
  const MODEL_INFO = { training: PACK.training, params: Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, m.nets.reduce((s, n) => s + L71.nParams(n), 0) + m.fails.reduce((s, n) => s + L71.nParams(n), 0)])), hashes: Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, L71.hashNums(m.nets.flatMap((n) => n.L.flatMap((l) => Array.from(l.w))))])) };
  const API = { L71, CHECKPOINTS, CANDIDATES, MODELS, MODEL_INFO, LAB_STARTS, SCREEN_STARTS, SCREEN_ROWS, TRUE_BEST, pearson, spearman, mmrv, metrics, modelKey, imagined, exam, simulateScreen, causalProbe };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L75 = API;
})(typeof window !== 'undefined' ? window : globalThis);
