/* =====================================================================
   hero/walk.js — «Равновесие гуманоида».
   Линейный перевёрнутый маятник (LIPM): ẍ = ω²(x − p), ω = √(g/z₀).
   Capture point ξ = x + ẋ/ω — точка, куда нужно поставить ногу, чтобы
   остановиться. Стоя робот двигает центр давления внутри стопы; если ξ
   уходит за стопу, делает шаг в прогноз ξ. Ходьба — шаги со смещением
   b = vT/(e^{ωT} − 1) (Englsberger et al., 2011).
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit;
  const W = 500, H = 400;
  const G = 9.81, Z0 = 0.9, OM = Math.sqrt(G / Z0), FH = 0.1, TS = 0.3, MAXSTEP = 0.62;
  const SC = 165, GY = 292, OSC = { y0: 324, y1: 392 }, HIST = 5;
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mount(ui) {
    const cv = K.el('canvas', { class: 'hd-cv', width: W, height: H, role: 'img', 'aria-label': 'Вид сбоку: гуманоид держит равновесие. Отмечены центр масс, центр давления и capture point; внизу график отклонения capture point от опоры.' });
    ui.body.append(cv);
    ui.ctrl.innerHTML = `
      <div class="hd-legend row">
        <div><i class="mk com">⊕</i><span>центр масс</span></div>
        <div><i class="mk cop">▲</i><span>центр давления</span></div>
        <div><i class="mk cp">◆</i><span>capture point</span></div>
      </div>
      <div class="hd-row">
        <button class="btn sm" type="button" data-a="-1">← Толкнуть</button>
        <button class="btn sm" type="button" data-a="1">Толкнуть →</button>
        <label class="hd-range"><span>Сила</span><input type="range" min="0.3" max="2" step="0.1" value="0.9" data-r="push" aria-label="Сила толчка, м/с"><output>0,9 м/с</output></label>
        <label class="hd-range"><span>Ходьба</span><input type="range" min="0" max="1" step="0.1" value="0" data-r="walk" aria-label="Скорость ходьбы, м/с"><output>стоит</output></label>
      </div>`;
    ui.status.innerHTML = 'Простейшая модель ходьбы — перевёрнутый маятник. Синяя метка показывает capture point: точку, куда нужно поставить ногу, чтобы остановиться. Если она уходит за стопу, робот шагает. В части 6 разберём, почему современные гуманоиды учатся ходить с помощью RL.';
    const rPush = ui.ctrl.querySelector('[data-r="push"]'), rWalk = ui.ctrl.querySelector('[data-r="walk"]');
    const fmt = (v) => v.toFixed(1).replace('.', ',');
    rPush.addEventListener('input', () => { rPush.nextElementSibling.textContent = fmt(+rPush.value) + ' м/с'; userAct(); });
    rWalk.addEventListener('input', () => { rWalk.nextElementSibling.textContent = +rWalk.value ? fmt(+rWalk.value) + ' м/с' : 'стоит'; userAct(); });

    /* ---------- модель ---------- */
    let x, v, feet, swing, cop, fallen, fallT, camX, hist, steps, pushFx, now = 0, lastInput = -1e9, autoDir = 1, lastSwing, idle = 0;
    function reset() {
      x = 0; v = 0; cop = 0; feet = [{ x: -0.02, ground: true, lift: 0 }, { x: 0.02, ground: true, lift: 0 }];
      swing = null; fallen = false; fallT = 0; camX = 0; hist = []; steps = []; pushFx = null; lastSwing = 1;
    }
    reset();
    const userAct = () => { lastInput = now; };
    function push(dir, mag) { if (fallen) return; v += dir * mag; pushFx = { dir, t: 0, mag }; }
    ui.ctrl.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { userAct(); push(+b.dataset.a, +rPush.value); }));

    const support = () => { const g = feet.filter((f) => f.ground); const lo = Math.min(...g.map((f) => f.x)) - FH, hi = Math.max(...g.map((f) => f.x)) + FH; return [lo, hi]; };
    function startStep(leg, T, tuck) { swing = { leg, from: feet[leg].x, to: feet[leg].x, t: 0, T: T || TS, tuck: !!tuck }; feet[leg].ground = false; }
    function physics(dt) {
      if (fallen) { fallT += dt; if (fallT > 2.2) reset(); return; }
      const vDes = +rWalk.value, walking = vDes > 0.001;
      const bW = walking ? vDes * TS / (Math.exp(OM * TS) - 1) : 0; // смещение ξ относительно стопы при ходьбе
      const xi = x + v / OM;
      let [lo, hi] = support();
      const ground = feet.filter((f) => f.ground);
      const wide = !swing && Math.abs(feet[0].x - feet[1].x) > 0.08;
      // куда регулятор ведёт capture point
      let target = (lo + hi) / 2, keep = -1;
      if (walking) target = Math.max(...ground.map((f) => f.x));
      else if (wide) { keep = Math.abs(feet[0].x - xi) < Math.abs(feet[1].x - xi) ? 0 : 1; target = feet[keep].x; }
      let copCmd = xi + 1.4 * (xi - target);
      if (walking) copCmd = swing ? feet[1 - swing.leg].x : xi - target < bW * 0.9 ? lo : target; // при ходьбе давление в центре стопы; на старте — на пятке, чтобы разогнаться
      cop = clamp(copCmd, lo, hi);
      if (swing) {
        swing.t += dt;
        const st = feet[1 - swing.leg], rem = Math.max(0, swing.T - swing.t);
        if (swing.tuck) swing.to = st.x + (swing.leg === 0 ? -0.02 : 0.02);
        else {
          const c2 = walking ? st.x : clamp(xi, st.x - FH, st.x + FH);
          const xiT = c2 + (xi - c2) * Math.exp(OM * rem); // прогноз ξ к моменту касания
          swing.to = clamp(xiT - bW, st.x - MAXSTEP, st.x + MAXSTEP);
        }
        const f = feet[swing.leg], s = smooth(swing.t / swing.T);
        f.x = swing.from + (swing.to - swing.from) * s; f.lift = (swing.tuck ? 0.05 : 0.09) * Math.sin(Math.PI * Math.min(1, swing.t / swing.T));
        if (swing.t >= swing.T) { f.x = swing.to; f.lift = 0; f.ground = true; lastSwing = swing.leg; if (!swing.tuck) steps.push(now); swing = null; }
      } else if (walking) {
        if (xi - target >= bW * 0.9 || xi < lo) startStep(feet[0].x < feet[1].x - 0.01 ? 0 : feet[1].x < feet[0].x - 0.01 ? 1 : 1 - lastSwing);
      } else if (Math.abs(copCmd - cop) > 0.015 && (xi > hi || xi < lo)) {
        const dir = Math.sign(xi - (lo + hi) / 2);
        const leg = Math.abs(feet[0].x - feet[1].x) < 0.03 ? 1 - lastSwing : dir > 0 ? (feet[0].x < feet[1].x ? 0 : 1) : (feet[0].x > feet[1].x ? 0 : 1);
        startStep(leg);
      } else if (keep >= 0 && Math.abs(xi - feet[keep].x) < 0.04 && Math.abs(v) < 0.12) {
        startStep(1 - keep, 0.36, true); // приставить вторую ногу
      }
      [lo, hi] = support(); cop = clamp(cop, lo, hi);
      v += OM * OM * (x - cop) * dt; x += v * dt;
      const g2 = feet.filter((f) => f.ground), base = g2.reduce((a2, f) => a2 + f.x, 0) / Math.max(1, g2.length);
      if (Math.abs(x - base) > 0.62) { fallen = true; fallT = 0; swing = null; feet.forEach((f) => { f.ground = true; f.lift = 0; }); }
    }

    /* ---------- отрисовка ---------- */
    let P = pal(); const offTheme = K.onTheme(() => { P = pal(); });
    function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), cp: K.css('--classic'), cpS: K.css('--classic-soft'), bad: K.css('--critical'), surf: K.css('--surface') }; }
    const SX = (wx) => W / 2 + (wx - camX) * SC, SY = (wz) => GY - wz * SC;
    function leg2(c, hip, foot, color, w) {
      const A = 0.47, B = 0.47, dx = foot[0] - hip[0], dz = foot[1] - hip[1], d = Math.min(A + B - 1e-3, Math.hypot(dx, dz));
      const a0 = Math.atan2(dz, dx), aA = Math.acos(clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1));
      const knee = [hip[0] + A * Math.cos(a0 + aA), hip[1] + A * Math.sin(a0 + aA)]; // колено вперёд по ходу (вправо)
      c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(SX(hip[0]), SY(hip[1])); c.lineTo(SX(knee[0]), SY(knee[1])); c.lineTo(SX(foot[0]), SY(foot[1])); c.stroke();
      c.beginPath(); c.moveTo(SX(foot[0] - FH * 0.75), SY(foot[1] - 0.05)); c.lineTo(SX(foot[0] + FH * 1.05), SY(foot[1] - 0.05)); c.lineWidth = w * 0.9; c.stroke();
      c.beginPath(); c.arc(SX(knee[0]), SY(knee[1]), w * 0.55, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.6; c.stroke();
    }
    function comSym(c, px, py, r) {
      c.beginPath(); c.arc(px, py, r, 0, 7); c.fillStyle = P.surf; c.fill();
      c.fillStyle = P.ink; for (const a of [0, Math.PI]) { c.beginPath(); c.moveTo(px, py); c.arc(px, py, r, a - Math.PI / 2, a); c.closePath(); c.fill(); }
      c.beginPath(); c.arc(px, py, r, 0, 7); c.lineWidth = 1.6; c.strokeStyle = P.ink; c.stroke();
    }
    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
      K.grid(c, W, GY, 25, P.grid);
      // земля и метры
      c.fillStyle = P.surf; c.fillRect(0, GY, W, H - GY);
      c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, GY + 0.5); c.lineTo(W, GY + 0.5); c.stroke();
      c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath();
      const off = ((camX * SC) % 10 + 10) % 10; for (let px = -off; px < W + 10; px += 10) { c.moveTo(px, GY + 1); c.lineTo(px - 7, GY + 8); } c.stroke();
      const m0 = Math.floor(camX - W / 2 / SC), m1 = Math.ceil(camX + W / 2 / SC);
      for (let m = m0; m <= m1; m += 0.5) { const px = SX(m); c.beginPath(); c.moveTo(px, GY - (m % 1 ? 4 : 7)); c.lineTo(px, GY); c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.stroke(); if (!(m % 1)) K.label(c, k, `${m < 0 ? '−' + -m : m} м`, px, GY + 17, { mono: true, px: 10, color: P.ink3, haloColor: P.surf }); }
      // капчур-пойнт: вертикальная линия и ромб
      const xi = x + v / OM;
      const ang = fallen ? Math.min(1, fallT / 0.7) * (Math.PI / 2 - 0.15) * Math.sign(x - feet[0].x || 1) : 0;
      if (!fallen) {
        c.strokeStyle = P.cp; c.lineWidth = 1.4; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(SX(xi), GY); c.lineTo(SX(xi), GY - 40); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.moveTo(SX(xi), GY - 8); c.lineTo(SX(xi) + 7, GY); c.lineTo(SX(xi), GY + 8); c.lineTo(SX(xi) - 7, GY); c.closePath(); c.fillStyle = P.cp; c.fill(); c.lineWidth = 1.5; c.strokeStyle = P.surf; c.stroke();
        if (swing && !swing.tuck) { // куда шагнёт нога
          c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(SX(swing.to - FH * 0.75), GY - 3); c.lineTo(SX(swing.to + FH * 1.05), GY - 3); c.stroke(); c.setLineDash([]);
        }
      }
      // тело
      c.save();
      const pivot = feet.find((f) => f.ground) || feet[0];
      if (fallen) { c.translate(SX(pivot.x), GY); c.rotate(ang); c.translate(-SX(pivot.x), -GY); }
      const lean = clamp(-(OM * OM * (x - cop)) * 0.01, -0.1, 0.1); // наклон корпуса против ускорения
      const hip = [x, Z0];
      const T = (dx, dz) => [x + dx * Math.cos(lean) + dz * Math.sin(lean), Z0 - dx * Math.sin(lean) + dz * Math.cos(lean)]; // точка корпуса
      const swingPh = swing ? Math.sin(Math.PI * swing.t / swing.T) * (swing.leg ? 1 : -1) : 0;
      const limb = (pts, color, w) => { c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(SX(q[0]), SY(q[1])) : c.moveTo(SX(q[0]), SY(q[1])))); c.stroke(); };
      // дальние рука и нога — бледнее и чуть сдвинуты
      const sh = T(0.0, 0.42);
      const arm = (s2, col) => { const e = [sh[0] - 0.05 + s2 * swingPh * 0.1, sh[1] - 0.27], h2 = [e[0] + 0.08 + s2 * swingPh * 0.12, e[1] - 0.22]; limb([sh, e, h2], col, 5); };
      c.save(); c.translate(-4, -2); arm(-1, P.ink3); leg2(c, hip, [feet[0].x, 0.05 + feet[0].lift], P.ink3, 6.5); c.restore();
      // корпус
      const tor = [T(-0.08, -0.03), T(0.08, -0.03), T(0.1, 0.44), T(0.07, 0.47), T(-0.07, 0.47), T(-0.1, 0.44)];
      c.beginPath(); tor.forEach((q, i) => (i ? c.lineTo(SX(q[0]), SY(q[1])) : c.moveTo(SX(q[0]), SY(q[1])))); c.closePath();
      c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.lineJoin = 'round'; c.strokeStyle = P.ink2; c.stroke();
      const chest = [T(-0.05, 0.3), T(0.05, 0.3)]; c.lineWidth = 1.3; c.strokeStyle = P.ink3; c.beginPath(); c.moveTo(SX(chest[0][0]), SY(chest[0][1])); c.lineTo(SX(chest[1][0]), SY(chest[1][1])); c.stroke();
      leg2(c, hip, [feet[1].x, 0.05 + feet[1].lift], P.ink2, 7.5);
      // голова
      const hc = T(0.01, 0.62);
      c.save(); c.translate(SX(hc[0]), SY(hc[1])); c.rotate(lean);
      c.beginPath(); c.roundRect(-0.075 * SC, -0.09 * SC, 0.15 * SC, 0.17 * SC, 0.04 * SC); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
      c.beginPath(); c.roundRect(0.0 * SC, -0.05 * SC, 0.075 * SC, 0.055 * SC, 0.022 * SC); c.fillStyle = P.ink2; c.fill();
      c.restore();
      const nk = T(0.0, 0.47), nk2 = T(0.005, 0.53); c.lineWidth = 4; c.strokeStyle = P.ink2; c.beginPath(); c.moveTo(SX(nk[0]), SY(nk[1])); c.lineTo(SX(nk2[0]), SY(nk2[1])); c.stroke();
      arm(1, P.ink2);
      c.beginPath(); c.arc(SX(sh[0]), SY(sh[1]), 4, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 1.6; c.strokeStyle = P.ink2; c.stroke();
      // центр давления и линия силы реакции
      if (!fallen) { c.setLineDash([2, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.3; c.beginPath(); c.moveTo(SX(cop), GY); c.lineTo(SX(x), SY(Z0)); c.stroke(); c.setLineDash([]); }
      comSym(c, SX(x), SY(Z0), 9.5);
      c.restore();
      if (!fallen) { c.beginPath(); c.moveTo(SX(cop), GY - 1); c.lineTo(SX(cop) + 6, GY + 9); c.lineTo(SX(cop) - 6, GY + 9); c.closePath(); c.fillStyle = P.ink; c.fill(); }
      if (!fallen) { const side = xi >= x ? 1 : -1; K.label(c, k, 'capture point', SX(xi) + side * 12, GY - 30, { color: P.ink2, weight: 650, haloColor: P.bg, align: side > 0 ? 'left' : 'right' }); }
      if (fallen) K.label(c, k, 'Упал: шага не хватило. Попробуй толчок слабее', W / 2, 60, { color: P.bad, weight: 700, haloColor: P.bg });
      // толчок
      if (pushFx && pushFx.t < 0.5) {
        const a = 1 - pushFx.t / 0.5, bx = SX(x) - pushFx.dir * 26, by = SY(1.2), len = 30 + pushFx.mag * 22;
        c.globalAlpha = a; c.strokeStyle = P.ink; c.fillStyle = P.ink; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(bx - pushFx.dir * len, by); c.lineTo(bx, by); c.stroke();
        c.beginPath(); c.moveTo(bx + pushFx.dir * 2, by); c.lineTo(bx - pushFx.dir * 10, by - 7); c.lineTo(bx - pushFx.dir * 10, by + 7); c.closePath(); c.fill();
        K.label(c, k, 'толчок', bx - pushFx.dir * (len / 2 + 6), by - 14, { color: P.ink, weight: 700, haloColor: P.bg });
        c.globalAlpha = 1;
      }
      // осциллограмма: ξ − центр опоры
      const oy = (OSC.y0 + OSC.y1) / 2, os = 70; // px на метр
      c.fillStyle = P.cp; c.globalAlpha = K.dark() ? 0.2 : 0.12; c.fillRect(46, oy - FH * os, W - 58, 2 * FH * os); c.globalAlpha = 1;
      c.strokeStyle = P.grid; c.beginPath(); c.moveTo(46, oy); c.lineTo(W - 12, oy); c.stroke();
      K.label(c, k, 'ξ − p', 8 * k, oy, { align: 'left', mono: true, px: 10.5, color: P.ink2, halo: false, weight: 700 });
      K.label(c, k, 'стопа', W - 16, oy - FH * os - 7 * k, { align: 'right', px: 10.5, color: P.ink3, halo: false });
      c.strokeStyle = P.ink3; c.lineWidth = 1;
      steps.forEach((t) => { if (now - t < HIST) { const px = W - 12 - (now - t) / HIST * (W - 58); c.beginPath(); c.moveTo(px, OSC.y0 + 2); c.lineTo(px, OSC.y1 - 2); c.stroke(); } });
      if (hist.length > 1) {
        c.save(); c.beginPath(); c.rect(46, OSC.y0, W - 58, OSC.y1 - OSC.y0); c.clip();
        c.strokeStyle = P.cp; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
        hist.forEach(([t, e], i) => { const px = W - 12 - (now - t) / HIST * (W - 58), py = oy - clamp(e, -0.6, 0.6) * os; i ? c.lineTo(px, py) : c.moveTo(px, py); });
        c.stroke(); c.restore();
      }
      K.label(c, k, fallen ? 'v = —' : `v = ${v.toFixed(2)} м/с   шагов: ${steps.length}`, 12 * k, 16 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
    }

    // щелчок по роботу: толчок от точки щелчка
    K.drag(cv, W, H, {
      hit: () => null,
      tap: (p) => { userAct(); if (p.y < GY) push(p.x < SX(x) ? 1 : -1, +rPush.value); },
      tapCursor: 'pointer',
    });

    const lp = K.loop(cv, (dt) => {
      now += dt;
      const n = 8; for (let i = 0; i < n; i++) physics(dt / n);
      camX += (x - camX) * (1 - Math.exp(-2.5 * dt));
      if (pushFx) pushFx.t += dt;
      if (!fallen) { const g = feet.filter((f) => f.ground); const pc = g.reduce((a, f) => a + f.x, 0) / Math.max(1, g.length); hist.push([now, x + v / OM - pc]); }
      while (hist.length && now - hist[0][0] > HIST + 0.2) hist.shift();
      while (steps.length && now - steps[0] > HIST + 5) steps.shift();
      // автодемо: если никто не трогает, робота время от времени толкают
      const calm = !fallen && !swing && Math.abs(v) < 0.05 && +rWalk.value === 0 && Math.abs(feet[0].x - feet[1].x) < 0.08;
      idle = calm ? idle + dt : 0;
      if (!K.reduced() && now - lastInput > 4 && idle > 1.6) { push(autoDir, 0.7 + 0.3 * Math.random()); autoDir = -autoDir; idle = 0; }
      draw();
    });
    const onResize = () => draw(); addEventListener('resize', onResize);
    draw();
    return { destroy() { lp.stop(); offTheme(); removeEventListener('resize', onResize); }, state: () => ({ x: +x.toFixed(3), v: +v.toFixed(3), steps: steps.length, fallen, swing: !!swing, feet: feet.map((f) => +f.x.toFixed(3)) }), push: (d, m) => { userAct(); push(d, m); }, walk: (vv) => { rWalk.value = vv; rWalk.dispatchEvent(new Event('input')); } };
  }

  HeroDemos.walk = { key: 'walk', tab: 'Равновесие', name: 'Равновесие гуманоида', title: 'Равновесие гуманоида', hint: 'Нажми на робота, чтобы толкнуть', mount };
})();
