/* =====================================================================
   hero/modes.js — «Мультимодальность действий».
   Оператор объезжает препятствие то слева, то справа. Регрессия с MSE
   выдаёт среднее демонстраций (оптимум MSE — условное среднее) и едет
   в препятствие. Диффузионная политика сэмплирует траекторию: DDIM с
   точным денойзером для эмпирического распределения демонстраций
   (так видна сама идея без обучения сети в браузере).
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit;
  const W = 500, H = 400;
  const S = { x: 250, y: 366 }, G = { x: 250, y: 48 };
  const R = 42, ROBOT = 9, MARGIN = 20;
  const N = 36, T = 28, STEPS = 40, M = 5, SC = 150, CY = 205;
  const D = (T - 2) * 2;
  const DUR = { denoise: 1.9, drive: 1.7, hold: 2.6 };

  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const abar = (tau) => { const v = Math.cos(((tau + 0.008) / 1.008) * Math.PI / 2); return Math.min(0.99995, v * v); };
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
  }

  function mount(ui) {
    const cv = K.el('canvas', { class: 'hd-cv', width: W, height: H, role: 'img', 'aria-label': 'Вид сверху: робот должен проехать от старта к цели в обход препятствия. Показаны демонстрации оператора, траектория регрессии и траектории диффузионной политики.' });
    ui.body.append(cv);
    ui.ctrl.innerHTML = `
      <div class="hd-legend">
        <div><i class="ln ln-demo"></i><span>демонстрации оператора</span><b class="muted" data-o="demo">36</b></div>
        <div><i class="ln ln-mse"></i><span>регрессия (MSE)</span><b data-o="mse"></b></div>
        <div><i class="ln ln-diff"></i><span>диффузионная политика</span><b data-o="diff"></b></div>
      </div>
      <div class="hd-row">
        <label class="hd-range"><span>Доля объездов слева</span><input type="range" min="0" max="100" step="5" value="50" aria-label="Доля демонстраций с объездом слева"><output>50%</output></label>
        <button class="btn sm" type="button" data-a="again" title="Сэмплировать новые траектории">↻ Ещё раз</button>
      </div>`;
    ui.status.innerHTML = 'Оператор объезжает препятствие то слева, то справа. Регрессия усредняет оба объезда и едет прямо в препятствие, а диффузионная политика выбирает один из них. Подробно — в уроках 1.3–1.5.';
    const outMse = ui.ctrl.querySelector('[data-o="mse"]'), outDiff = ui.ctrl.querySelector('[data-o="diff"]');
    const range = ui.ctrl.querySelector('input'), rangeOut = ui.ctrl.querySelector('output');

    /* ---------- демонстрации ---------- */
    const O = { x: 250, y: CY };
    let pLeft = 0.5;
    const dr = K.rng(11), U = [], J = [], WJ = [], TJ = [];
    const perm = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(dr() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < N; i++) { U.push((perm[i] + 0.5) / N); J.push(Math.abs(K.randn(dr)) * 9); WJ.push(K.randn(dr) * 0.03); TJ.push(K.randn(dr) * 0.02); }
    let demos = [], mu = [], mse = [], mseHit = null;

    function build() {
      const dx = G.x - S.x, dy = G.y - S.y, L = Math.hypot(dx, dy);
      const u = { x: dx / L, y: dy / L }, n = { x: u.y, y: -u.x }; // n — «влево» по ходу движения
      const tO = ((O.x - S.x) * u.x + (O.y - S.y) * u.y) / L;
      const On = (O.x - S.x) * n.x + (O.y - S.y) * n.y;
      demos = []; mu = [];
      for (let i = 0; i < N; i++) {
        const s = U[i] < pLeft ? 1 : -1;
        const A = On + s * (R + MARGIN + J[i]);
        const w = (R + 18) / L + WJ[i], tp = tO + TJ[i];
        const a = Math.max(0.12, tp - w), b = Math.min(0.88, tp + w);
        const pts = [];
        for (let j = 0; j < T; j++) {
          const t = j / (T - 1);
          const f = t <= a ? smooth(t / a) : t >= b ? smooth((1 - t) / (1 - b)) : 1;
          pts.push({ x: S.x + u.x * t * L + n.x * A * f, y: S.y + u.y * t * L + n.y * A * f });
        }
        demos.push(pts); mu.push(toVec(pts));
      }
      mse = demos[0].map((_, j) => ({ x: demos.reduce((a, d) => a + d[j].x, 0) / N, y: demos.reduce((a, d) => a + d[j].y, 0) / N }));
      mseHit = hitPoint(mse);
    }
    function toVec(pts) { const v = new Float64Array(D); for (let j = 1; j < T - 1; j++) { v[2 * (j - 1)] = (pts[j].x - 250) / SC; v[2 * (j - 1) + 1] = (pts[j].y - CY) / SC; } return v; }
    function fromVec(v) { const pts = [S]; for (let j = 0; j < T - 2; j++) pts.push({ x: 250 + v[2 * j] * SC, y: CY + v[2 * j + 1] * SC }); pts.push(G); return pts; }
    /** Первая точка, где робот касается препятствия, или null. */
    function hitPoint(pts) {
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        if (segDist(O, a, b) < R + ROBOT) {
          for (let q = 0; q <= 20; q++) { const t = q / 20, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; if (Math.hypot(p.x - O.x, p.y - O.y) < R + ROBOT) return { j, t, p }; }
        }
      }
      return null;
    }

    /* ---------- диффузия: DDIM с точным денойзером ---------- */
    let seed = 1, frames = [], finals = [], finalsHit = [];
    function sample() {
      const r = K.rng(1000 + seed * 7);
      let xs = Array.from({ length: M }, () => { const v = new Float64Array(D); for (let d = 0; d < D; d++) v[d] = K.randn(r); return v; });
      frames = [xs.map((x) => fromVec(x))];
      const lw = new Float64Array(N);
      for (let k = 0; k < STEPS; k++) {
        const a = abar(1 - k / STEPS), a2 = abar(1 - (k + 1) / STEPS);
        const sa = Math.sqrt(a), sv = Math.sqrt(1 - a), sa2 = Math.sqrt(a2), sv2 = Math.sqrt(1 - a2);
        xs = xs.map((x) => {
          let mx = -Infinity;
          for (let i = 0; i < N; i++) { let s = 0; const m = mu[i]; for (let d = 0; d < D; d++) { const e = x[d] - sa * m[d]; s += e * e; } lw[i] = -s / (2 * (1 - a)); if (lw[i] > mx) mx = lw[i]; }
          let z = 0; for (let i = 0; i < N; i++) { lw[i] = Math.exp(lw[i] - mx); z += lw[i]; }
          const x0 = new Float64Array(D);
          for (let i = 0; i < N; i++) { const w = lw[i] / z; if (w < 1e-9) continue; const m = mu[i]; for (let d = 0; d < D; d++) x0[d] += w * m[d]; }
          const nx = new Float64Array(D);
          for (let d = 0; d < D; d++) { const eps = (x[d] - sa * x0[d]) / sv; nx[d] = sa2 * x0[d] + sv2 * eps; }
          return nx;
        });
        frames.push(xs.map((x) => fromVec(x)));
      }
      finals = frames[STEPS]; finalsHit = finals.map(hitPoint);
    }

    /* ---------- цикл ---------- */
    let phase = 'denoise', tp = 0, dragged = false;
    function score() {
      const ok = finalsHit.filter((h) => !h).length;
      outMse.className = mseHit ? 'bad' : 'good'; outMse.textContent = mseHit ? '✕ столкновение' : '✓ доехала';
      outDiff.className = ok === M ? 'good' : ok === 0 ? 'bad' : 'warn'; outDiff.textContent = `${ok === M ? '✓' : ok === 0 ? '✕' : '!'} ${ok} из ${M} доехали`;
    }
    function restart(newSeed) { if (newSeed) seed++; sample(); score(); phase = K.reduced() ? 'hold' : 'denoise'; tp = 0; }
    build(); restart(false);

    const dragCtl = K.drag(cv, W, H, {
      hit: (p) => (Math.hypot(p.x - O.x, p.y - O.y) < R + 10 ? O : null),
      start: () => { phase = 'live'; },
      move: (o, p) => { O.x = Math.max(250 - 34, Math.min(250 + 34, p.x)); O.y = Math.max(150, Math.min(268, p.y)); dragged = true; build(); sample(); score(); },
      end: () => { phase = K.reduced() ? 'hold' : 'drive'; tp = 0; },
    });
    range.addEventListener('input', () => { pLeft = +range.value / 100; rangeOut.textContent = range.value + '%'; build(); sample(); score(); phase = 'live'; });
    range.addEventListener('change', () => { phase = K.reduced() ? 'hold' : 'drive'; tp = 0; });
    ui.ctrl.querySelector('[data-a="again"]').addEventListener('click', () => restart(true));

    let P = pal(); const offTheme = K.onTheme(() => { P = pal(); });
    function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), good: K.css('--good'), bad: K.css('--critical'), surf: K.css('--surface') }; }

    function path(c, pts, n) {
      n = n == null ? pts.length : n;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let j = 1; j < n - 1; j++) { const mx = (pts[j].x + pts[j + 1].x) / 2, my = (pts[j].y + pts[j + 1].y) / 2; c.quadraticCurveTo(pts[j].x, pts[j].y, mx, my); }
      c.lineTo(pts[n - 1].x, pts[n - 1].y);
    }
    function lerpPts(A, B, t) { return A.map((p, j) => ({ x: p.x + (B[j].x - p.x) * t, y: p.y + (B[j].y - p.y) * t })); }
    /** Точка на ломаной по доле длины s ∈ [0,1]. */
    function along(pts, s, stopAt) {
      const segs = []; let tot = 0;
      const last = stopAt ? stopAt.j : pts.length - 1;
      for (let j = 1; j <= last; j++) { const b = j === last && stopAt ? stopAt.p : pts[j]; const l = Math.hypot(b.x - pts[j - 1].x, b.y - pts[j - 1].y); segs.push([pts[j - 1], b, l]); tot += l; }
      let d = s * tot;
      for (const [a, b, l] of segs) { if (d <= l) { const t = l ? d / l : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; } d -= l; }
      const e = segs.length ? segs[segs.length - 1][1] : pts[0]; return { x: e.x, y: e.y };
    }
    function robot(c, p, color) { c.beginPath(); c.arc(p.x, p.y, ROBOT, 0, 7); c.fillStyle = color; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke(); }

    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
      K.grid(c, W, H, 25, P.grid);
      // препятствие
      c.beginPath(); c.arc(O.x, O.y, R, 0, 7); c.fillStyle = P.surf; c.fill();
      c.beginPath(); c.arc(O.x, O.y, R, 0, 7); K.hatch(c, O.x - R, O.y - R, O.x + R, O.y + R, P.ink3, 7, 1.1);
      c.beginPath(); c.arc(O.x, O.y, R, 0, 7); c.lineWidth = 1.6; c.strokeStyle = P.ink2; c.stroke();
      K.label(c, k, 'препятствие', O.x, O.y - 12, { color: P.ink, weight: 650 });
      // демонстрации
      c.lineWidth = 1.3; c.strokeStyle = P.ink3; c.globalAlpha = 0.32; c.lineCap = 'round'; c.lineJoin = 'round';
      for (const d of demos) { path(c, d); c.stroke(); }
      c.globalAlpha = 1;
      // сэмплы диффузии
      let pts = finals, sigma = 0, kk = STEPS;
      if (phase === 'denoise') {
        const x = Math.min(1, tp / DUR.denoise) * STEPS; const k0 = Math.min(STEPS - 1, Math.floor(x));
        kk = x; pts = frames[k0].map((f, m) => lerpPts(f, frames[k0 + 1][m], x - k0));
        sigma = Math.sqrt(1 - abar(1 - x / STEPS));
      }
      c.strokeStyle = P.e2e; c.lineWidth = sigma > 0.3 ? 1.4 : 2.2; c.globalAlpha = sigma > 0.3 ? 0.6 : 0.92;
      for (const s of pts) { path(c, s); c.stroke(); }
      c.globalAlpha = 1;
      // регрессия
      c.strokeStyle = P.ink; c.lineWidth = 2.2; c.setLineDash([7, 6]);
      path(c, mse); c.stroke(); c.setLineDash([]);
      K.label(c, k, 'MSE', mse[5].x + 26, mse[5].y, { color: P.ink, weight: 700, mono: true, px: 11.5 });
      // старт и цель
      c.beginPath(); c.arc(G.x, G.y, 13, 0, 7); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke();
      c.beginPath(); c.arc(G.x, G.y, 6.5, 0, 7); c.stroke();
      c.beginPath(); c.arc(G.x, G.y, 1.8, 0, 7); c.fillStyle = P.ink; c.fill();
      K.label(c, k, 'цель', G.x + 34, G.y, { color: P.ink2 });
      K.label(c, k, 'старт', S.x + 36, S.y, { color: P.ink2 });
      // роботы
      if (phase === 'drive' || phase === 'hold') {
        const s = phase === 'hold' ? 1 : smooth(tp / DUR.drive);
        finals.forEach((f, m) => robot(c, along(f, s, finalsHit[m]), P.e2e));
        const mp = along(mse, s, mseHit);
        robot(c, mp, P.ink);
        if (mseHit && s > 0.999) { K.cross(c, mseHit.p.x, mseHit.p.y - ROBOT - 10, 6, P.bad, 2.6); K.label(c, k, 'столкновение', mseHit.p.x + 58, mseHit.p.y - ROBOT - 10, { color: P.bad, weight: 700 }); }
        if (s > 0.999 && finalsHit.every((h) => !h)) K.check(c, G.x - 30, G.y, 7, P.good, 2.6);
      } else robot(c, S, P.ink);
      // индикатор процесса
      const txt = phase === 'denoise' ? `шаг денойзинга ${String(Math.round(kk)).padStart(2, '0')}/${STEPS} · σ=${sigma.toFixed(2)}` : phase === 'live' ? 'пересчёт траекторий' : `${M} запусков каждой политики`;
      K.label(c, k, txt, 12 * k, 16 * k, { align: 'left', mono: true, weight: 600, px: 11, color: P.ink3, haloColor: P.bg });
    }

    const lp = K.loop(cv, (dt) => {
      if (phase === 'denoise' || phase === 'drive' || phase === 'hold') tp += dt;
      if (phase === 'denoise' && tp >= DUR.denoise) { phase = 'drive'; tp = 0; }
      else if (phase === 'drive' && tp >= DUR.drive) { phase = 'hold'; tp = 0; }
      else if (phase === 'hold' && tp >= DUR.hold && !K.reduced()) restart(true);
      draw();
    });
    const onResize = () => draw(); addEventListener('resize', onResize);
    draw();
    return { destroy() { lp.stop(); offTheme(); removeEventListener('resize', onResize); }, state: () => ({ phase, mseHit: !!mseHit, ok: finalsHit.filter((h) => !h).length, pLeft, O: { ...O } }), set: (o) => { if (o.pLeft != null) { pLeft = o.pLeft; range.value = Math.round(o.pLeft * 100); rangeOut.textContent = range.value + '%'; } if (o.O) Object.assign(O, o.O); build(); sample(); score(); } };
  }

  HeroDemos.modes = { key: 'modes', tab: 'Диффузия', name: 'Мультимодальность', title: 'Мультимодальность действий', hint: 'Перетащи препятствие', mount };
})();
