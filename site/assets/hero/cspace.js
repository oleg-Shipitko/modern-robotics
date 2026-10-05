/* =====================================================================
   hero/cspace.js — «Пространство конфигураций».
   Двухзвенная рука и её C-space: каждая точка справа — пара углов
   суставов. Препятствие в комнате превращается в область запрещённых
   углов. A* ищет путь по карте C-space (тор, 8-связность), путь
   спрямляется проверкой видимости и проигрывается на руке.
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit;
  const W = 280, H = 280;
  const L1 = 0.5, L2 = 0.4, LINK = 0.035;
  const N = 96, PI = Math.PI, TAU = 2 * PI;
  const SPEED = 2.6; // рад/с по норме вектора углов
  // цели подобраны перебором: каждая следующая требует обхода в C-space (tools/cs_search.js)
  const TARGETS = [[0.55, 0], [-0.71, -0.41], [-0.21, -0.79], [-0.82, 0], [0.71, 0.41], [0.21, 0.79]];
  const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
  const dwrap = (a, b) => wrap(b - a);
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2_ = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2_));
    return Math.hypot(ax + dx * t - px, ay + dy * t - py);
  }
  function fk(q) { const x1 = L1 * Math.cos(q[0]), y1 = L1 * Math.sin(q[0]); return [x1, y1, x1 + L2 * Math.cos(q[0] + q[1]), y1 + L2 * Math.sin(q[0] + q[1])]; }

  function mount(ui) {
    ui.body.classList.add('hd-two');
    const ws = K.el('canvas', { class: 'hd-cv sq', width: W, height: H, role: 'img', 'aria-label': 'Рабочее пространство: двухзвенная рука и два препятствия, вид сверху' });
    const cs = K.el('canvas', { class: 'hd-cv sq', width: W, height: H, role: 'img', 'aria-label': 'Пространство конфигураций: углы суставов θ1 и θ2, закрашены запрещённые позы' });
    const f1 = K.el('figure', { class: 'hd-fig' }); f1.append(ws, K.el('figcaption', null, 'Рабочее пространство'));
    const f2 = K.el('figure', { class: 'hd-fig' }); f2.append(cs, K.el('figcaption', null, 'Пространство конфигураций (θ₁, θ₂)'));
    ui.body.append(f1, f2);
    ui.ctrl.innerHTML = `
      <div class="hd-legend row">
        <div><i class="sw a"></i><span>позы, где рука задевает синее препятствие</span></div>
        <div><i class="sw b"></i><span>фиолетовое</span></div>
        <div><i class="ln ln-path"></i><span>путь A*</span><b data-o="info" class="muted"></b></div>
      </div>`;
    ui.status.innerHTML = 'Каждая точка справа — поза руки, то есть углы двух суставов. Препятствие в комнате превращается в область запрещённых поз, и планировщик ищет путь по этой карте. Подробно — в уроках 0.3 и 0.4.';
    const info = ui.ctrl.querySelector('[data-o="info"]');

    const obs = [{ x: 0.48, y: 0.54, r: 0.17, key: 'a' }, { x: -0.5, y: -0.52, r: 0.15, key: 'b' }];
    let occ = new Uint8Array(N * N);
    const cellQ = (i) => -PI + (i + 0.5) * TAU / N;
    const qCell = (a) => { let i = Math.floor((wrap(a) + PI) / TAU * N); return Math.min(N - 1, Math.max(0, i)); };
    function collides(q) {
      const [x1, y1, x2, y2] = fk(q); let m = 0;
      obs.forEach((o, n) => { if (segDist(o.x, o.y, 0, 0, x1, y1) < o.r + LINK || segDist(o.x, o.y, x1, y1, x2, y2) < o.r + LINK) m |= 1 << n; });
      return m;
    }
    function rasterize() { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) occ[j * N + i] = collides([cellQ(i), cellQ(j)]); paintOcc(); }

    /* ---------- состояние руки ---------- */
    let q = [0, 0];
    let goal = null, sols = [], route = [], seg = 0, visited = null, visAge = 9, lastInput = -1e9, tgtIdx = 0, now = 0, idle = 0, trail = [], status = '';
    function ik(gx, gy) {
      let d = Math.hypot(gx, gy);
      const dmax = L1 + L2 - 0.01, dmin = Math.abs(L1 - L2) + 0.02;
      if (d > dmax) { gx *= dmax / d; gy *= dmax / d; d = dmax; }
      if (d < dmin) { const a = Math.atan2(gy, gx) || 0; gx = Math.cos(a) * dmin; gy = Math.sin(a) * dmin; d = dmin; }
      const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), out = [];
      for (const s of [1, -1]) { const t2 = s * Math.acos(Math.max(-1, Math.min(1, c2))); const t1 = Math.atan2(gy, gx) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2)); out.push([wrap(t1), wrap(t2)]); }
      return { g: [gx, gy], sols: out };
    }
    function freeLine(a, b) { // проверка отрезка в C-space по точной геометрии
      const d0 = dwrap(a[0], b[0]), d1 = dwrap(a[1], b[1]), n = Math.ceil(Math.hypot(d0, d1) / 0.03) + 1;
      for (let k = 0; k <= n; k++) { const t = k / n; if (collides([a[0] + d0 * t, a[1] + d1 * t])) return false; }
      return true;
    }
    function plan() {
      const goals = sols.filter((s) => !collides(s));
      visited = new Uint8Array(N * N); visAge = 0;
      if (!goals.length) { route = []; status = 'цель недостижима: обе позы задевают препятствие'; return; }
      const si = qCell(q[0]), sj = qCell(q[1]);
      const gc = goals.map((g) => [qCell(g[0]), qCell(g[1])]);
      const hd = (i, j) => Math.min(...gc.map(([gi, gj]) => { const di = Math.min(Math.abs(i - gi), N - Math.abs(i - gi)), dj = Math.min(Math.abs(j - gj), N - Math.abs(j - gj)); return Math.hypot(di, dj); }));
      const g = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
      const open = [[hd(si, sj), si, sj]]; g[sj * N + si] = 0;
      let found = -1;
      while (open.length) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
        const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        const id = j * N + i; if (visited[id]) continue; visited[id] = 1;
        if (gc.some(([gi, gj]) => gi === i && gj === j)) { found = id; break; }
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = (i + di + N) % N, nj = (j + dj + N) % N, nid = nj * N + ni;
          if (occ[nid] && !occ[id]) continue; // из свободной ячейки в занятую нельзя
          const ng = g[id] + (di && dj ? Math.SQRT2 : 1);
          if (ng < g[nid]) { g[nid] = ng; from[nid] = id; open.push([ng + hd(ni, nj), ni, nj]); }
        }
      }
      if (found < 0) { route = []; status = 'путь не найден'; return; }
      const cells = []; for (let c = found; c >= 0; c = from[c]) cells.push([cellQ(c % N), cellQ(Math.floor(c / N))]);
      cells.reverse();
      const gi = gc.findIndex(([a, b]) => a === found % N && b === Math.floor(found / N));
      const raw = [q.slice(), ...cells.slice(1, -1), goals[gi]];
      // спрямление: от каждой точки прыгаем к самой дальней видимой
      const out = [raw[0]]; let a = 0;
      while (a < raw.length - 1) { let b = raw.length - 1; while (b > a + 1 && !freeLine(raw[a], raw[b])) b--; out.push(raw[b]); a = b; }
      // разворачиваем углы, чтобы движение шло по кратчайшей дуге
      route = [out[0]]; for (let k = 1; k < out.length; k++) { const p = route[k - 1]; route.push([p[0] + dwrap(p[0], out[k][0]), p[1] + dwrap(p[1], out[k][1])]); }
      seg = 0; status = `${cells.length} ячеек, ${route.length - 1} ${route.length - 1 === 1 ? 'отрезок' : route.length - 1 < 5 ? 'отрезка' : 'отрезков'}`;
    }
    function setGoal(gx, gy) { const r = ik(gx, gy); goal = r.g; sols = r.sols; plan(); }

    /* ---------- отрисовка ---------- */
    let P = pal(); const offTheme = K.onTheme(() => { P = pal(); paintOcc(); });
    function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); const n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), a: K.css('--classic'), b: K.css('--hybrid'), bad: K.css('--critical'), surf: K.css('--surface'), aS: K.css('--classic-soft'), bS: K.css('--hybrid-soft') }; }
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    function paintOcc() {
      const ctx = off.getContext('2d'), img = ctx.createImageData(N, N), A = hex(P.a), B = hex(P.b), al = K.dark() ? 190 : 150;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const m = occ[j * N + i], o = ((N - 1 - j) * N + i) * 4; // θ₂ растёт вверх
        if (!m) { img.data[o + 3] = 0; continue; }
        const c = m === 1 ? A : m === 2 ? B : [(A[0] + B[0]) >> 1, (A[1] + B[1]) >> 1, (A[2] + B[2]) >> 1];
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = al;
      }
      ctx.putImageData(img, 0, 0);
    }
    const WX = (x) => 140 + x * 128, WY = (y) => 140 - y * 128, XW = (px) => (px - 140) / 128, YW = (py) => (140 - py) / 128;
    const PL = 30, PT = 8, PS = 242; // область графика C-space
    const CX = (a) => PL + (wrap(a) + PI) / TAU * PS, CY = (a) => PT + PS - (wrap(a) + PI) / TAU * PS;
    function arm(c, qq, color, w, ghost) {
      const [x1, y1, x2, y2] = fk(qq);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = color; c.lineWidth = w; c.globalAlpha = ghost ? 0.35 : 1;
      if (ghost) c.setLineDash([4, 5]);
      c.beginPath(); c.moveTo(WX(0), WY(0)); c.lineTo(WX(x1), WY(y1)); c.lineTo(WX(x2), WY(y2)); c.stroke(); c.setLineDash([]);
      if (!ghost) {
        for (const [x, y, r] of [[0, 0, 6.5], [x1, y1, 5]]) { c.beginPath(); c.arc(WX(x), WY(y), r, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = color; c.stroke(); }
        const a = qq[0] + qq[1], ex = WX(x2), ey = WY(y2);
        c.lineWidth = 2.2; c.beginPath();
        const nx = Math.cos(a), ny = -Math.sin(a), px = -ny, py = nx; // схват: поперечина и два пальца
        c.moveTo(ex + px * 7, ey + py * 7); c.lineTo(ex - px * 7, ey - py * 7);
        c.moveTo(ex + px * 7, ey + py * 7); c.lineTo(ex + px * 7 + nx * 8, ey + py * 7 + ny * 8);
        c.moveTo(ex - px * 7, ey - py * 7); c.lineTo(ex - px * 7 + nx * 8, ey - py * 7 + ny * 8);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    function drawWS(hit) {
      const { c, k } = K.fit(ws, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 20, P.grid);
      c.setLineDash([3, 5]); c.strokeStyle = P.ink3; c.lineWidth = 1;
      c.beginPath(); c.arc(WX(0), WY(0), (L1 + L2) * 128, 0, 7); c.stroke(); c.setLineDash([]);
      obs.forEach((o) => {
        const col = o.key === 'a' ? P.a : P.b, soft = o.key === 'a' ? P.aS : P.bS;
        c.beginPath(); c.arc(WX(o.x), WY(o.y), o.r * 128, 0, 7); c.fillStyle = soft; c.fill();
        c.beginPath(); c.arc(WX(o.x), WY(o.y), o.r * 128, 0, 7); K.hatch(c, WX(o.x) - o.r * 128, WY(o.y) - o.r * 128, WX(o.x) + o.r * 128, WY(o.y) + o.r * 128, col, 6, 1);
        c.beginPath(); c.arc(WX(o.x), WY(o.y), o.r * 128, 0, 7); c.lineWidth = 1.8; c.strokeStyle = col; c.stroke();
      });
      if (trail.length > 1) { c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.globalAlpha = 0.6; c.beginPath(); trail.forEach((p, i) => (i ? c.lineTo(WX(p[0]), WY(p[1])) : c.moveTo(WX(p[0]), WY(p[1])))); c.stroke(); c.globalAlpha = 1; }
      if (goal) {
        sols.forEach((s) => { if (!collides(s)) arm(c, s, P.ink3, 3, true); });
        const gx = WX(goal[0]), gy = WY(goal[1]);
        c.strokeStyle = P.ink; c.lineWidth = 1.8; c.beginPath(); c.arc(gx, gy, 9, 0, 7); c.stroke();
        c.beginPath(); c.moveTo(gx - 13, gy); c.lineTo(gx - 5, gy); c.moveTo(gx + 5, gy); c.lineTo(gx + 13, gy); c.moveTo(gx, gy - 13); c.lineTo(gx, gy - 5); c.moveTo(gx, gy + 5); c.lineTo(gx, gy + 13); c.stroke();
      }
      // основание
      c.fillStyle = P.ink2; c.beginPath(); c.moveTo(WX(0) - 12, WY(0) + 13); c.lineTo(WX(0) + 12, WY(0) + 13); c.lineTo(WX(0), WY(0)); c.closePath(); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
      arm(c, q, hit ? P.bad : P.ink, 7, false);
      K.label(c, k, `θ₁=${Math.round(wrap(q[0]) * 180 / PI)}°  θ₂=${Math.round(wrap(q[1]) * 180 / PI)}°`, 8 * k, 12 * k, { align: 'left', mono: true, px: 11, color: P.ink3, haloColor: P.bg });
      if (hit) K.label(c, k, 'касание препятствия', W / 2, H - 12 * k, { color: P.bad, weight: 700, haloColor: P.bg });
    }
    function drawCS(hit) {
      const { c, k } = K.fit(cs, W, H);
      c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
      c.fillStyle = P.bg; c.fillRect(PL, PT, PS, PS);
      if (visited && visAge < 1.2) {
        c.fillStyle = P.ink3; c.globalAlpha = 0.16 * (1 - visAge / 1.2);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (visited[j * N + i]) c.fillRect(PL + i * PS / N, PT + PS - (j + 1) * PS / N, PS / N + 0.3, PS / N + 0.3);
        c.globalAlpha = 1;
      }
      c.imageSmoothingEnabled = false; c.drawImage(off, PL, PT, PS, PS); c.imageSmoothingEnabled = true;
      c.strokeStyle = P.grid; c.lineWidth = 1;
      for (let t = 1; t < 4; t++) { const v = PL + t * PS / 4, w = PT + t * PS / 4; c.beginPath(); c.moveTo(v, PT); c.lineTo(v, PT + PS); c.moveTo(PL, w); c.lineTo(PL + PS, w); c.stroke(); }
      c.strokeStyle = P.ink3; c.strokeRect(PL + 0.5, PT + 0.5, PS - 1, PS - 1);
      // путь с учётом «склейки» краёв тора
      if (route.length > 1) {
        c.save(); c.beginPath(); c.rect(PL, PT, PS, PS); c.clip();
        c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [col, lw] of [[P.surf, 5.5], [P.ink, 2.4]]) {
          c.strokeStyle = col; c.lineWidth = lw;
          for (let k2 = 1; k2 < route.length; k2++) {
            const a = route[k2 - 1], b = route[k2], ax = CX(a[0]), ay = CY(a[1]);
            const bx = ax + (b[0] - a[0]) / TAU * PS, by = ay - (b[1] - a[1]) / TAU * PS;
            for (const ox of [-PS, 0, PS]) for (const oy of [-PS, 0, PS]) { c.beginPath(); c.moveTo(ax + ox, ay + oy); c.lineTo(bx + ox, by + oy); c.stroke(); }
          }
        }
        c.restore();
      }
      sols.forEach((s) => { const bad = collides(s); c.beginPath(); c.arc(CX(s[0]), CY(s[1]), 5.5, 0, 7); c.lineWidth = 1.8; c.strokeStyle = bad ? P.bad : P.ink; c.stroke(); });
      c.beginPath(); c.arc(CX(q[0]), CY(q[1]), 5.5, 0, 7); c.fillStyle = hit ? P.bad : P.ink; c.fill(); c.lineWidth = 2; c.strokeStyle = P.surf; c.stroke();
      // оси
      const tk = [[-PI, '−180°'], [0, '0°'], [PI, '180°']];
      tk.forEach(([v, t], n) => { K.label(c, k, t, PL + (v + PI) / TAU * PS, PT + PS + 11 * k, { mono: true, px: 10, color: P.ink3, halo: false, align: n === 0 ? 'left' : n === 2 ? 'right' : 'center' }); });
      tk.forEach(([v, t]) => { K.label(c, k, t.replace('°', ''), PL - 4 * k, PT + PS - (v + PI) / TAU * PS, { mono: true, px: 10, color: P.ink3, halo: false, align: 'right' }); });
      K.label(c, k, 'θ₁', PL + PS - 10 * k, PT + PS - 10 * k, { mono: true, px: 11, color: P.ink2, haloColor: P.bg, weight: 700 });
      K.label(c, k, 'θ₂', PL + 12 * k, PT + 11 * k, { mono: true, px: 11, color: P.ink2, haloColor: P.bg, weight: 700 });
    }
    function draw() { const hit = !!collides(q); drawWS(hit); drawCS(hit); info.textContent = status; }

    /* ---------- ввод ---------- */
    const userAct = () => { lastInput = now; };
    K.drag(ws, W, H, {
      hit: (p) => obs.find((o) => Math.hypot(XW(p.x) - o.x, YW(p.y) - o.y) < o.r + 0.06) || null,
      start: () => { userAct(); },
      move: (o, p) => { userAct(); o.x = Math.max(-0.95, Math.min(0.95, XW(p.x))); o.y = Math.max(-0.95, Math.min(0.95, YW(p.y))); rasterize(); route = []; },
      end: () => { userAct(); if (goal) plan(); },
      tap: (p) => { userAct(); trail = []; setGoal(XW(p.x), YW(p.y)); },
    });
    const csPick = (p) => { const a = (p.x - PL) / PS * TAU - PI, b = (PT + PS - p.y) / PS * TAU - PI; return [Math.max(-PI, Math.min(PI - 1e-6, a)), Math.max(-PI, Math.min(PI - 1e-6, b))]; };
    K.drag(cs, W, H, {
      hit: (p) => (p.x >= PL && p.x <= PL + PS && p.y >= PT && p.y <= PT + PS ? 'q' : null),
      start: (o, p) => { userAct(); route = []; goal = null; sols = []; status = 'ручное управление'; q = csPick(p); trail = []; },
      move: (o, p) => { userAct(); q = csPick(p); const e = fk(q); trail.push([e[2], e[3]]); if (trail.length > 160) trail.shift(); },
      end: () => { userAct(); },
    });

    rasterize();
    q = ik(...TARGETS[0]).sols.find((s2) => !collides(s2)) || [0, 0];
    tgtIdx = 1; setGoal(...TARGETS[1]);
    const lp = K.loop(ws, (dt) => {
      now += dt; visAge += dt;
      if (route.length > 1 && seg < route.length - 1) {
        const a = route[seg + 1]; let d0 = a[0] - q[0], d1 = a[1] - q[1]; const dist = Math.hypot(d0, d1), stp = SPEED * dt * (K.reduced() ? 4 : 1);
        if (dist <= stp) { q = [a[0], a[1]]; seg++; } else { q = [q[0] + d0 / dist * stp, q[1] + d1 / dist * stp]; }
        const e = fk(q); trail.push([e[2], e[3]]); if (trail.length > 160) trail.shift();
        idle = 0;
      } else {
        idle += dt; // автопилот: если никто не трогает, через паузу — следующая цель
        if (now - lastInput > 3.2 && idle > 1.8) { idle = 0; tgtIdx = (tgtIdx + 1) % TARGETS.length; trail = []; setGoal(...TARGETS[tgtIdx]); }
      }
      draw();
    });
    const onResize = () => draw(); addEventListener('resize', onResize);
    draw();
    return { destroy() { lp.stop(); offTheme(); removeEventListener('resize', onResize); }, state: () => ({ status, q: q.map((a) => Math.round(wrap(a) * 180 / PI)), hit: !!collides(q), route: route.length }) };
  }

  HeroDemos.cspace = { key: 'cspace', tab: 'Планирование', name: 'Пространство конфигураций', title: 'Пространство конфигураций', hint: 'Нажми, куда тянуться', mount };
})();
