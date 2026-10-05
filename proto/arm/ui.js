/* =====================================================================
   proto/arm/ui.js — прототип лабы урока 0.3 «Рука Ады: от цели до момента».
   1) нейросеть учит обратную кинематику и усредняет два решения;
   2) ПД-регулятор и гравитация; 3) импеданс и контакт со столом.
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit, A = Arm, $ = (s) => document.querySelector(s);
  let P = pal(); K.onTheme(() => { P = pal(); });
  function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), classic: K.css('--classic'), hybrid: K.css('--hybrid'), good: K.css('--good'), bad: K.css('--critical'), surf: K.css('--surface') }; }
  const nextTick = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); }; return (f) => { q.push(f); ch.port2.postMessage(0); }; })();
  function runChunked(gen, onEv) { return new Promise((res) => { (function work() { const t0 = performance.now(); while (performance.now() - t0 < 14) { const r = gen.next(); if (r.done) { res(); return; } onEv(r.value); } nextTick(work); })(); }); }
  function drawArm(c, q, map, color, w, ghost) {
    const p = A.fk(q), o = map(0, 0), j = map(p.x1, p.y1), e = map(p.x, p.y);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.lineWidth = w; c.globalAlpha = ghost ? 0.4 : 1;
    if (ghost) c.setLineDash([4, 5]);
    c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(j.x, j.y); c.lineTo(e.x, e.y); c.stroke(); c.setLineDash([]);
    if (!ghost) for (const [pt, r] of [[o, 6.5], [j, 5]]) { c.beginPath(); c.arc(pt.x, pt.y, r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = color; c.stroke(); }
    c.globalAlpha = 1;
    return e;
  }
  function target(c, x, y) { c.strokeStyle = P.ink; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 14, y); c.moveTo(x, y - 14); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 14); c.stroke(); }

  /* =================== Часть 1: нейросеть учит кинематику =================== */
  (function () {
    const cv = $('#ikCv'), W = 420, H = 420, S = 210;
    const map = (x, y) => ({ x: W / 2 + x * S, y: H / 2 - y * S }), inv = (px, py) => ({ x: (px - W / 2) / S, y: (H / 2 - py) / S });
    const st = { goal: { x: 0.42, y: 0.32 }, model: null, busy: false, heat: null, showHeat: false, mean: null };
    function heatMap() {
      const N = 42, out = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N * 2 - 1, y = 1 - (j + 0.5) / N * 2, d = Math.hypot(x, y);
        if (d > 0.89 || d < 0.12) { out[j * N + i] = -1; continue; }
        const p = A.fk(A.netIK(st.model, x, y)); out[j * N + i] = Math.hypot(p.x - x, p.y - y);
      }
      return { N, out };
    }
    function stats() { let s = 0, n = 0; for (const v of st.heat.out) if (v >= 0) { s += v; n++; } st.mean = s / n; }
    async function train() {
      st.busy = true; $('#ikTrain').disabled = true; $('#ikMsg').textContent = 'Обучаем сеть на 6000 случайных позах руки…';
      const elbow = $('#ikElbow').checked, data = A.ikData(6000, elbow, 3);
      st.model = A.mlp([2, 48, 48, 4], 5);
      await runChunked(A.trainGen(st.model, data, { iters: 900, bs: 64, lr: 0.005 }), (e) => { $('#ikProg').style.width = (e.it / 899 * 100) + '%'; });
      st.heat = heatMap(); stats(); st.busy = false; $('#ikTrain').disabled = false;
      $('#ikMsg').innerHTML = elbow
        ? `Средний промах по рабочей зоне — <b>${(st.mean * 100).toFixed(1)} см</b>. В данных на каждую позу один правильный ответ, и сеть его выучила.`
        : `Средний промах — <b>${(st.mean * 100).toFixed(1)} см</b>. На одну позу схвата в данных приходятся два правильных ответа: локоть вверх и локоть вниз. Оптимум MSE — их среднее, а такая поза цель не достаёт. Оставь в данных только одно решение и обучи снова.`;
    }
    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 21, P.grid);
      c.setLineDash([3, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.arc(W / 2, H / 2, (A.L1 + A.L2) * S, 0, 7); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, (A.L1 - A.L2) * S, 0, 7); c.stroke(); c.setLineDash([]);
      if (st.showHeat && st.heat) {
        const { N, out } = st.heat, cs = W / N; c.fillStyle = P.bad;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = out[j * N + i]; if (v < 0) continue; c.globalAlpha = Math.min(0.75, v / 0.4); c.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5); }
        c.globalAlpha = 1;
      }
      const g = st.goal, sols = A.ik(g.x, g.y);
      sols.forEach((q) => drawArm(c, q, map, P.ink3, 4, true));
      if (st.model) {
        const q = A.netIK(st.model, g.x, g.y), e = drawArm(c, q, map, P.e2e, 7, false), gp = map(g.x, g.y), miss = Math.hypot(...[A.fk(q).x - g.x, A.fk(q).y - g.y]);
        c.setLineDash([2, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.5; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(gp.x, gp.y); c.stroke(); c.setLineDash([]);
        K.label(c, k, `промах ${(miss * 100).toFixed(1)} см`, 10 * k, H - 14 * k, { align: 'left', mono: true, px: 11, color: miss > 0.05 ? P.bad : P.ink3, haloColor: P.bg });
      } else drawArm(c, [0.6, 1.2], map, P.ink, 7, false);
      const gp = map(g.x, g.y); target(c, gp.x, gp.y);
      K.label(c, k, 'пунктир — два точных решения, оранжевая — ответ сети', 10 * k, 14 * k, { align: 'left', px: 11, color: P.ink3, haloColor: P.bg });
    }
    K.drag(cv, W, H, {
      hit: () => 'g', tapBlocksScroll: () => true,
      move: (o, p) => { const w = inv(p.x, p.y), d = Math.hypot(w.x, w.y), dmax = A.L1 + A.L2 - 0.01, dmin = A.L1 - A.L2 + 0.01; const f = d > dmax ? dmax / d : d < dmin ? dmin / Math.max(d, 1e-6) : 1; st.goal = { x: w.x * f, y: w.y * f }; },
    });
    $('#ikTrain').onclick = train;
    $('#ikHeat').onchange = (e) => { st.showHeat = e.target.checked; };
    K.loop(cv, draw);
    window.__ik = st;
  })();

  /* =================== Части 2–3: динамика, ПД и импеданс =================== */
  (function () {
    const cv = $('#ctlCv'), W = 520, H = 360, S = 300, OX = 150, OY = 230;
    const map = (x, y) => ({ x: OX + x * S, y: OY - y * S }), inv = (px, py) => ({ x: (px - OX) / S, y: (OY - py) / S });
    const TABLE = -0.12, SHELF = { x: 0.55, y: 0.35 };
    const st = { q: [-Math.PI / 2 + 0.05, 0.25], dq: [0, 0], t: 0, run: false, hist: [], F: 0, pull: null, mode: 'pd' };
    function goalPose() {
      if (st.mode === 'pd') return { x: SHELF.x, y: SHELF.y };
      const err = +$('#errH').value / 100; return { x: 0.62, y: TABLE - 0.02 - err }; // ошибка восприятия: стол «кажется» ниже
    }
    function reset() { st.q = st.mode === 'pd' ? [-Math.PI / 2 + 0.05, 0.25] : A.ik(0.45, 0.16)[1]; st.dq = [0, 0]; st.t = 0; st.hist = []; st.F = 0; st.maxF = 0; st.run = true; }
    function control(q, dq) {
      const g = A.gravity(q), gp = goalPose();
      if (st.mode === 'pd' || $('#ctlType').value === 'pos') {
        const qs = A.ik(gp.x, gp.y)[st.mode === 'pd' ? 0 : 1] || q, Kp = st.mode === 'pd' ? +$('#kp').value : 300, Kd = st.mode === 'pd' ? +$('#kd').value : 12, comp = st.mode === 'pd' ? $('#gcomp').checked : true;
        return [Kp * (qs[0] - q[0]) - Kd * dq[0] + (comp ? g[0] : 0), Kp * (qs[1] - q[1]) - Kd * dq[1] + (comp ? g[1] : 0)];
      }
      const Kc = +$('#kimp').value, Dc = 2 * Math.sqrt(Kc * 1.5), p = A.fk(q), J = A.jac(q), v = [J[0][0] * dq[0] + J[0][1] * dq[1], J[1][0] * dq[0] + J[1][1] * dq[1]];
      const Fx = Kc * (gp.x - p.x) - Dc * v[0], Fy = Kc * (gp.y - p.y) - Dc * v[1];
      return [J[0][0] * Fx + J[1][0] * Fy + g[0], J[0][1] * Fx + J[1][1] * Fy + g[1]];
    }
    function physics(dt) {
      const n = Math.round(dt / 0.001);
      for (let i = 0; i < n; i++) {
        let tau = control(st.q, st.dq); const p = A.fk(st.q), J = A.jac(st.q);
        let F = 0;
        if (st.mode === 'imp' && p.y < TABLE) { const vy = J[1][0] * st.dq[0] + J[1][1] * st.dq[1]; F = Math.max(0, 6000 * (TABLE - p.y) - 40 * vy); tau = [tau[0] + J[1][0] * F, tau[1] + J[1][1] * F]; }
        if (st.pull) { const fx = 400 * (st.pull.x - p.x), fy = 400 * (st.pull.y - p.y); tau = [tau[0] + J[0][0] * fx + J[1][0] * fy, tau[1] + J[0][1] * fx + J[1][1] * fy]; }
        st.F = F; st.maxF = Math.max(st.maxF || 0, F);
        const a = A.dyn(st.q, st.dq, tau); st.dq = [st.dq[0] + a[0] * 0.001, st.dq[1] + a[1] * 0.001]; st.q = [st.q[0] + st.dq[0] * 0.001, st.q[1] + st.dq[1] * 0.001];
      }
      st.t += dt; const p = A.fk(st.q), gp = goalPose();
      st.hist.push([st.t, st.mode === 'pd' ? Math.hypot(p.x - gp.x, p.y - gp.y) * 100 : st.F]); if (st.hist.length > 400) st.hist.shift();
    }
    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 30, P.grid);
      // основание
      const o = map(0, 0); c.fillStyle = P.ink3; c.globalAlpha = 0.35; c.fillRect(o.x - 22, o.y + 6, 44, 10); c.globalAlpha = 1;
      if (st.mode === 'pd') {
        const sh = map(SHELF.x - 0.12, SHELF.y - 0.04), sh2 = map(SHELF.x + 0.2, SHELF.y - 0.04);
        c.fillStyle = P.ink3; c.fillRect(sh.x, sh.y, sh2.x - sh.x, 6); K.label(c, k, 'полка', (sh.x + sh2.x) / 2, sh.y + 16, { color: P.ink3, px: 11, haloColor: P.bg });
        const gp = map(SHELF.x, SHELF.y); target(c, gp.x, gp.y);
      } else {
        const t0 = map(0.2, TABLE), t1 = map(1.0, TABLE); c.fillStyle = P.surf; c.fillRect(t0.x, t0.y, t1.x - t0.x, H - t0.y); c.beginPath(); c.rect(t0.x, t0.y, t1.x - t0.x, 26); K.hatch(c, t0.x, t0.y, t1.x, t0.y + 26, P.ink3, 7, 1); c.strokeStyle = P.ink2; c.lineWidth = 2; c.beginPath(); c.moveTo(t0.x, t0.y); c.lineTo(t1.x, t0.y); c.stroke();
        K.label(c, k, 'стол', t1.x - 30, t0.y + 40, { color: P.ink3, px: 11, haloColor: P.surf });
        const gp = goalPose(), g = map(gp.x, gp.y); c.setLineDash([3, 4]); c.strokeStyle = P.bad; c.lineWidth = 1.4; c.beginPath(); c.moveTo(g.x - 40, g.y); c.lineTo(g.x + 40, g.y); c.stroke(); c.setLineDash([]);
        K.label(c, k, 'где стол «видит» камера', g.x + 46, g.y, { align: 'left', color: P.bad, px: 11, haloColor: P.bg });
      }
      const e = drawArm(c, st.q, map, P.ink, 7, false);
      if (st.mode === 'pd') { c.fillStyle = P.classic; c.beginPath(); c.roundRect(e.x - 8, e.y - 20, 16, 18, 3); c.fill(); }
      if (st.pull) { const pp = map(st.pull.x, st.pull.y); c.strokeStyle = P.hybrid; c.setLineDash([3, 3]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(pp.x, pp.y); c.stroke(); c.setLineDash([]); }
      // график
      const gx = W - 200, gy = 14, gw = 186, gh = 90;
      c.fillStyle = P.surf; c.fillRect(gx, gy, gw, gh); c.strokeStyle = P.grid; c.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
      const ymax = st.mode === 'pd' ? 60 : Math.max(30, ...st.hist.map((h) => h[1]));
      if (st.hist.length > 1) { c.strokeStyle = st.mode === 'pd' ? P.classic : P.bad; c.lineWidth = 2; c.beginPath(); const t0 = st.hist[0][0], t1 = Math.max(t0 + 4, st.hist[st.hist.length - 1][0]); st.hist.forEach(([t, v], i) => { const x = gx + 4 + (t - t0) / (t1 - t0) * (gw - 8), y = gy + gh - 4 - Math.min(1, v / ymax) * (gh - 18); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
      const last = st.hist.length ? st.hist[st.hist.length - 1][1] : 0;
      K.label(c, k, st.mode === 'pd' ? `ошибка схвата ${last.toFixed(1)} см` : `сила прижима ${last.toFixed(0)} Н · пик ${(st.maxF || 0).toFixed(0)} Н`, gx + 6, gy + 10, { align: 'left', mono: true, px: 10.5, color: P.ink2, halo: false });
    }
    K.drag(cv, W, H, {
      hit: (p) => { const e = A.fk(st.q), m = map(e.x, e.y); return Math.hypot(p.x - m.x, p.y - m.y) < 26 ? 'ee' : null; },
      move: (o, p) => { st.pull = inv(p.x, p.y); st.run = true; },
      end: () => { st.pull = null; },
    });
    document.querySelectorAll('[name="ctlMode"]').forEach((r) => r.addEventListener('change', () => { st.mode = r.value; document.querySelectorAll('.ctl-pd').forEach((e) => e.hidden = st.mode !== 'pd'); document.querySelectorAll('.ctl-imp').forEach((e) => e.hidden = st.mode !== 'imp'); reset(); }));
    $('#ctlRun').onclick = reset;
    for (const id of ['kp', 'kd', 'kimp', 'errH']) { const e = $('#' + id); e.addEventListener('input', () => { e.nextElementSibling.textContent = e.value + (id === 'errH' ? ' см' : ''); }); }
    document.querySelectorAll('[data-pred2]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-pred2]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#predAns').innerHTML = b.dataset.pred2 === 'b' ? 'Верно. Провис от гравитации уменьшится вдвое, но не исчезнет: регулятор создаёт момент только пока есть ошибка. Убери его компенсацией гравитации.' : 'Проверь: поставь Kp вдвое больше без компенсации гравитации и запусти. Провис уменьшится, но не исчезнет: момент появляется, только пока есть ошибка.';
    }));
    reset();
    K.loop(cv, (dt) => { if (st.run) physics(dt); draw(); });
    window.__ctl = st;
  })();
})();
