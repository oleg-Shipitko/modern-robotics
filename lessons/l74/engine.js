/* l74/engine.js — детерминированные модели урока 7.4, без DOM.
   Все три контура исполняются в общем мире L71. Маленькие сети обучаются
   при загрузке на записях робота; видео человека задают только путь состояний. */
'use strict';
(function (root) {
  const L71 = typeof module !== 'undefined' && module.exports ? require('../l71/engine.js') : root.L71;
  if (!L71) throw new Error('l74/engine.js requires L71');
  const { clamp, hypot, TABLE, CUP_R, HAND_R } = L71;
  const START = [0.16, 0.34], GOAL = [0.74, 0.34], SCALE = 0.05;

  function makeLayout(id, obstacle) {
    const objs = [];
    if (obstacle) objs.push({ kind: 'sugar', x: obstacle.x, y: obstacle.y, r: obstacle.r });
    else objs.push({ kind: 'sugar', x: 0.47, y: 0.12, r: 0.05 });
    objs.push({ kind: 'milk', x: 0.52, y: 0.52, r: 0.055 });
    return { id: 'l74-' + id, saucer: GOAL.slice(), objs, safe: [0.10, 0.80, 0.08, 0.54], start: [START[0], START[0], START[1], START[1]] };
  }
  function scenario(id, obstacle) { return { id, obstacle, start: START, goal: GOAL, layout: makeLayout(id, obstacle) }; }
  const OBSTACLE = { x: 0.47, y: 0.34, r: 0.05 };
  const SCENARIOS = {
    familiar: scenario('familiar', null),
    detour: scenario('detour', OBSTACLE),
    shifted: scenario('shifted', { x: 0.51, y: 0.31, r: 0.05 }),
  };

  function line(a, b, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
    return out;
  }
  function bezier(a, m, b, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1), u = 1 - t; out.push(u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]); }
    return out;
  }
  function point(path, i) { return [path[i * 2], path[i * 2 + 1]]; }
  function endpoint(path) { return [path[path.length - 2], path[path.length - 1]]; }
  function modelWeights(m) { const a = []; for (const l of m.L) { for (const x of l.w) a.push(x); for (const x of l.bias) a.push(x); } return a; }

  /* Пять демонстраций робота содержат действия, но ни одна не обходит предмет. */
  const ROBOT = [-0.05, -0.025, 0, 0.025, 0.05].map((bend) => ({ path: bezier(START, [0.45, 0.34 + bend], GOAL, 13), actions: true }));
  /* Двенадцать видео человека содержат только состояния и разные обходы сверху. */
  const HUMAN = [];
  for (let i = 0; i < 12; i++) {
    const obstacle = { x: 0.445 + (i % 4) * 0.018, y: 0.325 + Math.floor(i / 4) * 0.014, r: 0.048 + (i % 3) * 0.002 };
    const control = [obstacle.x + ((i % 2) ? 0.012 : -0.008), 0.075 + (i % 3) * 0.012];
    HUMAN.push({ obstacle, control, path: bezier(START, control, GOAL, 13), actions: false });
  }

  function feature(a, b) { return [(b[0] - a[0]) / SCALE, (b[1] - a[1]) / SCALE, (a[0] - TABLE.W / 2) / 0.30, (a[1] - TABLE.H / 2) / 0.20]; }
  const TRAIN = [];
  for (const demo of ROBOT) for (let i = 1; i < demo.path.length / 2; i++) {
    const a = point(demo.path, i - 1), b = point(demo.path, i), x = feature(a, b), action = [x[0], x[1]];
    TRAIN.push({ x, action, joint: [action[0], action[1], action[0], action[1]] });
  }
  function trainNet(sizes, seed, target, steps) {
    const m = L71.net(sizes, seed), g = new Float64Array(sizes[sizes.length - 1]), bs = 24;
    for (let step = 0; step < steps; step++) {
      for (let q = 0; q < bs; q++) {
        const s = TRAIN[(step * 7 + q * 17) % TRAIN.length], y = L71.fwd(m, s.x), t = s[target];
        for (let j = 0; j < g.length; j++) g[j] = 2 * (y[j] - t[j]);
        L71.bwd(m, g);
      }
      L71.adam(m, step < steps * 0.8 ? 0.006 : 0.002, bs);
    }
    return m;
  }
  const TRAIN_STEPS = 1200;
  const VLA = trainNet([4, 12, 2], 741, 'action', TRAIN_STEPS);
  const IDM = trainNet([4, 12, 2], 742, 'action', TRAIN_STEPS);
  const WAM = trainNet([4, 12, 4], 743, 'joint', TRAIN_STEPS);
  function idmAction(a, b) { const y = L71.fwd(IDM, feature(a, b)); return [y[0], y[1]]; }
  function vlaAction(a, b) { const y = L71.fwd(VLA, feature(a, b)); return [y[0], y[1]]; }
  function wamAction(a, b) {
    const y = L71.fwd(WAM, feature(a, b));
    /* Предсказание следующего состояния входит в команду, а не служит декорацией. */
    return [0.65 * y[0] + 0.35 * y[2], 0.65 * y[1] + 0.35 * y[3]];
  }

  function trainWorld(share) {
    const n = share <= 0 ? 0 : Math.max(1, Math.round(HUMAN.length * clamp(share, 0, 100) / 100));
    if (!n) return { n: 0, dx: 0, y: START[1] };
    let dx = 0, y = 0;
    for (let i = 0; i < n; i++) { dx += HUMAN[i].control[0] - HUMAN[i].obstacle.x; y += HUMAN[i].control[1]; }
    return { n, dx: dx / n, y: y / n };
  }
  function learnedPath(scenarioValue, share) {
    if (!scenarioValue.obstacle) return ROBOT[2].path.slice();
    const model = trainWorld(share);
    if (!model.n) return ROBOT[2].path.slice();
    return bezier(scenarioValue.start, [scenarioValue.obstacle.x + model.dx, model.y], scenarioValue.goal, 13);
  }

  /* Калиброванный захват ставит кисть за чашкой, затем исполняет команду
     четырьмя безопасными вызовами общей физики L71.step. */
  function pushCommand(W, command, bias, trace) {
    let dx = command[0] * SCALE, dy = command[1] * SCALE, d = hypot(dx, dy);
    if (d > 0.075) { dx *= 0.075 / d; dy *= 0.075 / d; d = 0.075; }
    if (d < 1e-5) return { hit: false, tip: false, fall: false };
    const ux = dx / d, uy = dy / d, gain = 1 - clamp(+bias || 0, 0, 24) / 100;
    let hit = false, tip = false, fall = false;
    for (let k = 0; k < 4; k++) {
      L71.placeHand(W, W.cx - ux * (CUP_R + HAND_R + 0.001), W.cy - uy * (CUP_R + HAND_R + 0.001));
      const handStep = clamp(d / 4 + 0.001, 0, 0.016) * gain, ev = L71.step(W, ux * handStep, uy * handStep);
      hit = hit || ev.hit; tip = tip || ev.tip; fall = fall || ev.fall;
      trace.push(W.cx, W.cy);
      if (hit || tip || fall) break;
    }
    return { hit, tip, fall };
  }
  function executePlan(model, imag, scenarioValue, bias, closed, corrections) {
    const W = L71.world({ layout: scenarioValue.layout, cloth: 'linen', seed: 74, cup: scenarioValue.start, hand: [scenarioValue.start[0] - 0.08, scenarioValue.start[1]], noise: false });
    const real = [W.cx, W.cy], commands = []; let hit = false, tip = false, fall = false;
    for (let i = 1; i < imag.length / 2 && !hit && !tip && !fall; i++) {
      const plannedA = point(imag, i - 1), target = point(imag, i), state = L71.stateVec(W), observed = [state[0], state[1]];
      const command = model(closed ? observed : plannedA, target); commands.push(command.slice());
      const ev = pushCommand(W, command, bias, real); hit = ev.hit; tip = ev.tip; fall = ev.fall;
    }
    for (let k = 0; closed && k < corrections && !hit && !tip && !fall; k++) {
      const state = L71.stateVec(W);
      if (hypot(state[0] - scenarioValue.goal[0], state[1] - scenarioValue.goal[1]) < 0.018) break;
      const command = model([state[0], state[1]], scenarioValue.goal); commands.push(command.slice());
      const ev = pushCommand(W, command, bias, real); hit = ev.hit; tip = ev.tip; fall = ev.fall;
    }
    return { path: real, commands, hit, tip, fall };
  }
  function makeResult(kind, scenarioValue, share, bias, imag, executed) {
    const end = endpoint(executed.path), dist = hypot(end[0] - scenarioValue.goal[0], end[1] - scenarioValue.goal[1]);
    return { kind, scenario: scenarioValue.id, share, bias, imag, real: executed.path, commands: executed.commands, hit: executed.hit, tip: executed.tip, fall: executed.fall, dist, success: !executed.hit && !executed.tip && !executed.fall && dist < 0.065 };
  }
  function run(kind, scenarioId, share, bias) {
    const s = typeof scenarioId === 'string' ? (SCENARIOS[scenarioId] || SCENARIOS.familiar) : scenarioId, humanShare = clamp(+share || 0, 0, 100), actuatorBias = clamp(+bias || 0, 0, 24);
    if (kind === 'vla') { const imag = ROBOT[2].path.slice(); return makeResult(kind, s, humanShare, actuatorBias, imag, executePlan(vlaAction, imag, s, actuatorBias, false, 0)); }
    const imag = learnedPath(s, humanShare);
    if (kind === 'idm') return makeResult(kind, s, humanShare, actuatorBias, imag, executePlan(idmAction, imag, s, actuatorBias, false, 0));
    if (kind === 'open') return makeResult(kind, s, humanShare, actuatorBias, imag, executePlan(wamAction, imag, s, actuatorBias, false, 0));
    return makeResult('wam', s, humanShare, actuatorBias, imag, executePlan(wamAction, imag, s, actuatorBias, true, 4));
  }
  function compare(scenarioId, share, bias) { return ['vla', 'open', 'wam'].map((kind) => run(kind, scenarioId, share, bias)); }
  function minimumShare(scenarioId) {
    for (const share of [0, 25, 50, 100]) if (run('open', scenarioId, share, 0).success && run('wam', scenarioId, share, 0).success) return share;
    return null;
  }
  function minimumBias(scenarioId, share) {
    for (const bias of [0, 6, 12, 18, 24]) if (!run('open', scenarioId, share, bias).success && run('wam', scenarioId, share, bias).success) return bias;
    return null;
  }

  function reorder(path) {
    const n = path.length / 2, order = [0]; let lo = 1, hi = n - 2;
    while (lo <= hi) { order.push(hi--); if (lo <= hi) order.push(lo++); }
    order.push(n - 1); const out = []; for (const i of order) out.push(path[i * 2], path[i * 2 + 1]); return out;
  }
  function noisy(path, amount) {
    const out = path.slice(), amp = clamp(amount, 0, 100) * 0.000005;
    for (let i = 2; i < out.length - 2; i += 2) { const k = i / 2; out[i] += k % 2 ? amp : -amp; out[i + 1] += k % 3 === 0 ? -amp : amp * 0.5; }
    return out;
  }
  function rolloutFromPath(pipe, scenarioValue, path) {
    const executed = pipe === 'idm' ? executePlan(idmAction, path, scenarioValue, 0, false, 0) : executePlan(wamAction, path, scenarioValue, 0, true, 0);
    return makeResult(pipe, scenarioValue, 100, 0, path, executed);
  }

  const CAL_SPECS = [
    { id: 'i1', pipe: 'idm', scenario: 'familiar', share: 0, visual: 0.92, ordered: true, note: 'чёткий знакомый путь' },
    { id: 'i2', pipe: 'idm', scenario: 'detour', share: 100, visual: 0.71, ordered: true, note: 'обход переводится отдельной моделью' },
    { id: 'i3', pipe: 'idm', scenario: 'detour', share: 100, visual: 0.83, ordered: false, note: 'кадры перепутаны' },
    { id: 'i4', pipe: 'idm', scenario: 'detour', share: 0, visual: 0.38, ordered: true, note: 'в данных нет обхода' },
    { id: 'w1', pipe: 'wam', scenario: 'detour', share: 100, visual: 0.91, ordered: false, note: 'красиво, но нарушен порядок' },
    { id: 'w2', pipe: 'wam', scenario: 'familiar', share: 0, visual: 0.44, ordered: true, note: 'шероховатое декодирование' },
    { id: 'w3', pipe: 'wam', scenario: 'detour', share: 100, visual: 0.76, ordered: true, note: 'верный порядок состояний' },
    { id: 'w4', pipe: 'wam', scenario: 'shifted', share: 100, visual: 0.29, ordered: true, note: 'новое положение препятствия' },
  ];
  const CALIBRATION = CAL_SPECS.map((spec) => {
    const s = SCENARIOS[spec.scenario], clean = learnedPath(s, spec.share), path = spec.ordered ? noisy(clean, (1 - spec.visual) * 100) : reorder(clean), rollout = rolloutFromPath(spec.pipe, s, path);
    return { ...spec, outcome: rollout.success ? 1 : 0, rollout };
  });
  function brier(ids, forecasts) {
    let sum = 0, n = 0;
    for (const id of ids) { const sample = CALIBRATION.find((x) => x.id === id), p = forecasts[id]; if (!sample || p == null) continue; const q = p / 100; sum += (q - sample.outcome) * (q - sample.outcome); n++; }
    return n ? sum / n : null;
  }
  function makeExtra(id, x, y, r) { return scenario(id, { x, y, r }); }
  function intervention(noise, order, domain) {
    const amount = clamp(+noise || 0, 0, 100), shuffled = order === 'shuffled', ood = domain === 'ood';
    const scenes = ood
      ? [SCENARIOS.shifted, makeExtra('ood-a', 0.49, 0.29, 0.052), makeExtra('ood-b', 0.53, 0.36, 0.048), makeExtra('ood-c', 0.45, 0.30, 0.055)]
      : [SCENARIOS.detour, makeExtra('id-a', 0.46, 0.34, 0.050), makeExtra('id-b', 0.48, 0.33, 0.052), makeExtra('id-c', 0.47, 0.35, 0.048)];
    let baseOk = 0, changedOk = 0, diff = 0, norm = 0;
    for (const s of scenes) {
      const clean = learnedPath(s, 100), altered = shuffled ? reorder(clean) : noisy(clean, amount), base = rolloutFromPath('wam', s, clean), changed = rolloutFromPath('wam', s, altered);
      baseOk += base.success ? 1 : 0; changedOk += changed.success ? 1 : 0;
      const n = Math.min(base.commands.length, changed.commands.length);
      for (let i = 0; i < n; i++) { diff += Math.abs(base.commands[i][0] - changed.commands[i][0]) + Math.abs(base.commands[i][1] - changed.commands[i][1]); norm += Math.abs(base.commands[i][0]) + Math.abs(base.commands[i][1]); }
    }
    return { noise: amount, order, domain: ood ? 'ood' : 'id', actionChange: norm ? diff / norm * 100 : 0, successDrop: (baseOk - changedOk) / scenes.length * 100, success: changedOk === scenes.length };
  }
  function inference(video) { return video ? { success: 90.6, latency: 580, visible: true } : { success: 91.8, latency: 190, visible: false }; }

  function causalProbe(kind) {
    const model = kind === 'idm' ? IDM : WAM, before = kind === 'idm' ? run('idm', 'detour', 100, 0) : run('wam', 'detour', 100, 0), last = model.L[model.L.length - 1];
    const weights = Array.from(last.w), biases = Array.from(last.bias);
    if (kind === 'wam-future') {
      for (let i = 0; i < last.a; i++) { last.w[i * last.b + 2] = 0; last.w[i * last.b + 3] = 0; }
      last.bias[2] = 0; last.bias[3] = 0;
    } else { last.w.fill(0); last.bias.fill(0); }
    const after = kind === 'idm' ? run('idm', 'detour', 100, 0) : run('wam', 'detour', 100, 0);
    last.w.set(weights); last.bias.set(biases);
    let change = 0, norm = 0, n = Math.min(before.commands.length, after.commands.length);
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { change += Math.abs(before.commands[i][j] - after.commands[i][j]); norm += Math.abs(before.commands[i][j]); }
    return { kind, commandChange: norm ? change / norm * 100 : 0, beforeDist: before.dist, afterDist: after.dist, beforeSuccess: before.success, afterSuccess: after.success };
  }
  const MODEL_INFO = {
    robotDemos: ROBOT.length, humanVideos: HUMAN.length, transitions: TRAIN.length, steps: TRAIN_STEPS,
    vlaParams: L71.nParams(VLA), inverseParams: L71.nParams(IDM), jointParams: L71.nParams(WAM),
    vlaHash: L71.hashNums(modelWeights(VLA)), inverseHash: L71.hashNums(modelWeights(IDM)), jointHash: L71.hashNums(modelWeights(WAM)),
    inverseWeights: modelWeights(IDM), jointWeights: modelWeights(WAM),
  };
  const API = { L71, START, GOAL, OBSTACLE, SCENARIOS, ROBOT, HUMAN, MODEL_INFO, line, bezier, trainWorld, learnedPath, compare, run, minimumShare, minimumBias, brier, CALIBRATION, intervention, inference, causalProbe };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L74 = API;
})(typeof window !== 'undefined' ? window : globalThis);
