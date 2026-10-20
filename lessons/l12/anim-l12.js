/* =====================================================================
   anim-l12.js — анимированные схемы урока 1.2 (shared/anim.js):
     dagger-loop — цикл DAgger, три оборота: политика едет сама → эксперт
                   размечает правильный руль в каждом состоянии, куда она
                   заехала → новые пары добавляются ко всем старым → обучение
                   заново; набор растёт, Ада уезжает всё дальше и доезжает;
     hg-dagger   — HG-DAgger: человек смотрит на поездку и перехватывает
                   управление, когда Ада уходит от маршрута; в набор идут
                   только его участки, а DAgger разметил бы всю поездку.
   Политика на схемах условная, чтобы считаться сразу и не подсказывать
   ответ лаборатории: она берёт руль ближайшего примера из набора (по месту и
   курсу), поэтому ошибается там, где примеров нет. Набор в начале — те же
   10 аккуратных поездок учителя, что у политики урока 1.1; эксперт и человек —
   учитель лаборатории (pure pursuit по маршруту). Старт и шум в моторах у
   всех поездок схем одни и те же. Дом, лучи, учитель и Ада — из движка
   лаборатории (shared/drive-core.js, shared/drive-lab.js).
   Цвета: оранжевый — политика, синий — эксперт и человек, серый — демонстрации.
   Без shared/anim.js схем нет, а остальной урок работает.
   ===================================================================== */
'use strict';
(() => {
  const KINDS = ['dagger-loop', 'hg-dagger'];
  if (typeof Anim === 'undefined' || typeof Drive === 'undefined' || typeof DriveDraw === 'undefined') {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, D = Drive, DD = DriveDraw;
  const SEED = 276, HW = 30, NOISE = 0.2, BAND = 5;   // зерно старта и шума; вес курса, см на радиан; полуширина полосы данных, см
  const NMAX = Math.round(D.TMAX / D.DT);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const fmtI = (n) => Math.round(n).toLocaleString('ru-RU');

  /* ---------- условная политика и поездки ---------- */
  /** Руль ближайшего примера из набора: расстояние по месту и курсу. */
  const nearest = (P) => (s) => { let b = Infinity, w = 0; for (const p of P) { const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (HW * wrapA(p.th - s.th)) ** 2; if (d < b) { b = d; w = p.w; } } return w; };
  /** Насколько Ада ушла от маршрута учителя: расстояние, см, и разница курса, рад. */
  function routeErr(s) {
    const { i, d } = D.nearestIdx(s.x, s.y), Q = D.PATH, j = Math.min(Q.length - 1, i + 1), i0 = Math.max(i - 1, 0);
    return { d, dth: Math.abs(wrapA(s.th - Math.atan2(Q[j][1] - Q[i0][1], Q[j][0] - Q[i0][0]))) };
  }
  let W0 = null;
  function world() {
    if (W0) return W0;
    const demos = D.demos(10, { seed: 3, offSigma: 3, startSpread: 0.8 });   // те же 10 аккуратных поездок, что у политики урока 1.1
    const base = []; demos.forEach((d) => d.traj.slice(0, -1).forEach((s, i) => base.push({ x: s.x, y: s.y, th: s.th, w: d.acts[i] })));
    const start = D.randStart(D.rng(SEED * 31 + 7), 0.9), r = D.rng(SEED * 977 + 13), noise = [];
    for (let i = 0; i < NMAX; i++) noise.push(D.randn(r) * NOISE);
    /** Поездка с шага t0 из s0; human — человек перехватывает, когда Ада дальше 12 см от маршрута или повёрнута больше чем на 0,6 рад,
     *  и отдаёт управление, когда она ближе 4 см и курс расходится меньше чем на 0,2 рад. */
    function drive(pol, s0, t0, human) {
      let s = { ...s0 }, on = false; const traj = [s], who = [], acts = [];
      for (let t = t0; t < NMAX; t++) {
        if (human) { const e = routeErr(s); if (!on && (e.d > 12 || e.dth > 0.6)) on = true; else if (on && e.d < 4 && e.dth < 0.2) on = false; }
        const w = on ? D.teacher(s) : pol(s); who.push(on ? 1 : 0); acts.push(w);
        s = D.step(s, D.clamp(w + noise[t], -D.WMAX * 1.3, D.WMAX * 1.3)); traj.push(s);
        if (D.collides(s.x, s.y)) return { traj, who, acts, outcome: 'crash' };
        if (Math.hypot(s.x - D.GOAL.x, s.y - D.GOAL.y) < D.GOAL.r) return { traj, who, acts, outcome: 'goal' };
      }
      return { traj, who, acts, outcome: 'timeout' };
    }
    // DAgger: три оборота, после каждого все состояния поездки с рулём эксперта идут в набор
    let P = base; const turns = [];
    for (let k = 0; k < 3; k++) {
      const ep = drive(nearest(P), start, 0, false);
      const lab = ep.traj.slice(0, -1).map((s, i) => ({ x: s.x, y: s.y, th: s.th, w: D.teacher(s), wp: ep.acts[i] }));
      turns.push({ ep, lab }); P = P.concat(lab);
    }
    // HG-DAgger: одна поездка с человеком; участки перехвата и куда уехала бы Ада без них
    const hg = drive(nearest(base), start, 0, true), segs = []; let a = -1;
    hg.who.forEach((h, i) => { if (h && a < 0) a = i; if (!h && a >= 0) { segs.push([a, i]); a = -1; } }); if (a >= 0) segs.push([a, hg.who.length]);
    const would = segs.map(([i0]) => drive(nearest(base), hg.traj[i0], i0, false));
    W0 = { demos, base, start, turns, hg, segs, would, human: hg.who.reduce((s, x) => s + x, 0) };
    return W0;
  }

  /* ---------- общие помощники рисования ---------- */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const ws = String(text).split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  function txt(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * (o.lh || 1.3);
    lines.forEach((s, i) => A.lab(c, k, s, x, y + i * lh, Object.assign({}, o, { px })));
  }
  const pal2 = (P) => ({ bg: P.surf, grid: P.grid, ink: P.ink, ink2: P.ink2, ink3: P.ink3, e2e: P.mot, classic: P.out, good: P.good, bad: P.bad, surf: P.surf2 });
  /** Дом в рамке; fn рисует в координатах дома (см). */
  function house(c, k, A, P, H, fn) {
    c.save(); c.translate(H.ox, H.oy); c.scale(H.s, H.s);
    c.beginPath(); c.roundRect(0, 0, D.W, D.H, 8 / H.s); c.clip();
    DD.house(c, k / H.s, pal2(P), { labels: false });
    fn(c, k / H.s);
    c.restore();
    A.rect(c, H.ox, H.oy, D.W * H.s, D.H * H.s, 8, null, P.line, 1);
  }
  /** Полоса данных: толстая полупрозрачная линия вдоль поездок. */
  function band(c, trajs, col, a) {
    c.strokeStyle = col; c.globalAlpha *= a; c.lineWidth = 2 * BAND; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); trajs.forEach((tr) => tr.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)))); c.stroke();
    c.globalAlpha /= a;
  }
  function trail(c, traj, upto, col, lw) { if (upto < 1) return; c.strokeStyle = col; c.lineWidth = lw || 3.4; DD.line(c, traj, upto + 1); }
  function endMark(c, s, outcome, P, a) {
    const ga = c.globalAlpha; c.globalAlpha = ga * (a == null ? 1 : a);
    if (outcome === 'crash') K.cross(c, s.x, s.y, 14, P.bad, 5); else if (outcome === 'goal') K.check(c, s.x, s.y - 2, 14, P.good, 5);
    c.globalAlpha = ga;
  }
  function flowDots(c, A, pts, prog, col) {
    if (prog <= 0 || prog >= 1) return;
    const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
    for (let q = 0; q < 3; q++) {
      let d = ((prog * 1.6 + q / 3) % 1) * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
      const f = L[i] ? d / L[i] : 0; A.circle(c, A.lerp(pts[i][0], pts[i + 1][0], f), A.lerp(pts[i][1], pts[i + 1][1], f), 2.6, col);
    }
  }
  function polyArrow(c, A, pts, col, lw) {
    A.line(c, pts, col, lw || 1.5); const n = pts.length; A.arrow(c, pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1], col, lw || 1.5, 6);
  }
  function swatch(c, A, P, x, y, col, dash) {
    if (dash) A.line(c, [[x, y], [x + 16, y]], col, 2.2, [4, 3]); else A.rect(c, x, y - 5, 16, 10, 3, col, null);
  }

  /* =====================================================================
     dagger-loop — цикл DAgger
     ===================================================================== */
  (() => {
    const SPEED = 3.2;                                     // поездки идут в 3,2 раза быстрее настоящих
    let TL = null;
    /** Расписание: шаг 1 — обучение на демонстрациях, потом три оборота «едет → размечает → в набор и обучение заново». */
    function timeline() {
      if (TL) return TL;
      const w = world(), ph = [{ kind: 'train', a: 0.3, b: 1.3 }]; let t = 1.5;
      w.turns.forEach((tr, k) => {
        const dr = (tr.ep.traj.length - 1) * D.DT / SPEED;
        ph.push({ kind: 'ride', k, a: t, b: t + dr }); t += dr + 0.25;
        ph.push({ kind: 'label', k, a: t, b: t + 1.0 }); t += 1.15;
        ph.push({ kind: 'add', k, a: t, b: t + 0.9 }); t += 1.05;
      });
      ph.push({ kind: 'final', a: t, b: t + 1.8 }); t += 1.8;
      return (TL = { ph, T: t + 0.9, fade: [t, t + 0.9] });
    }
    const STEPS = ['Обучить', 'Едет политика', 'Размечает эксперт', 'Пары в набор'];
    const stepOf = (kind) => ({ train: 0, ride: 1, label: 2, add: 3, final: 3 }[kind]);
    function draw(c, k, t, P, A, G) {
      const w = world(), tl = timeline(), { seg, ease } = A, u = ((t % tl.T) + tl.T) % tl.T;
      let cur = tl.ph[0]; for (const q of tl.ph) if (u >= q.a) cur = q;
      const p = seg(u, cur.a, cur.b), fade = 1 - seg(u, ...tl.fade), turn = cur.k == null ? (cur.kind === 'final' ? 2 : -1) : cur.k;
      c.globalAlpha = fade;
      // сколько оборотов уже в наборе (после фазы «в набор»)
      const added = tl.ph.filter((q) => q.kind === 'add' && u >= q.b).length, adding = cur.kind === 'add' ? ease(p) : 0;

      /* шаги цикла */
      const sNow = stepOf(cur.kind);
      if (G.chips) {
        const Ch = G.chips; let x = Ch.x; const xs = [];
        STEPS.forEach((nm, i) => {
          K.font(c, k, 11.5, 750); const cw = c.measureText(nm).width + 36, on = i === sNow;
          xs.push([x, cw]);
          A.rect(c, x, Ch.y - 11, cw, 22, 11, on ? A.alpha(i === 2 ? P.out : P.mot, 0.14) : P.surf, on ? (i === 2 ? P.out : P.mot) : P.line, on ? 1.6 : 1);
          A.circle(c, x + 12, Ch.y, 7.5, on ? (i === 2 ? P.out : P.mot) : P.surf2, on ? null : P.line, 1);
          txt(c, k, A, String(i + 1), x + 12, Ch.y + 0.5, 10, { px: 10, weight: 800, color: on ? '#fff' : P.ink3 });
          txt(c, k, A, nm, x + 25, Ch.y, cw - 30, { px: 11.5, weight: on ? 750 : 600, color: on ? P.ink : P.ink2, align: 'left' });
          if (i < 3) A.arrow(c, x + cw + 4, Ch.y, x + cw + Ch.gap - 4, Ch.y, P.line, 1.4, 5);
          x += cw + Ch.gap;
        });
        // возврат с шага 4 к шагу 2: обучить заново
        const [x4, w4] = xs[3], [x2, w2] = xs[1], yb = Ch.y + 11, yr = Ch.y + 24;
        const back = [[x4 + w4 / 2, yb], [x4 + w4 / 2, yr], [x2 + w2 / 2, yr], [x2 + w2 / 2, yb + 1]], hot = cur.kind === 'add';
        polyArrow(c, A, back, hot ? P.mot : P.line, hot ? 1.8 : 1.4);
        if (hot) flowDots(c, A, back, seg(p, 0.35, 1), P.mot);
        txt(c, k, A, 'обучить заново', (xs[2][0] + xs[2][1] / 2), yr, 120, { px: 10, weight: 650, color: hot ? P.mot : P.ink3, halo: true, haloColor: P.surf2 });
      } else {
        const B = G.badges; const cx = (i) => B.x + 10 + i * B.dx;
        for (let i = 0; i < 4; i++) {
          const on = i === sNow, col = i === 2 ? P.out : P.mot;
          A.circle(c, cx(i), B.y, 10, on ? col : P.surf, on ? null : P.line, 1.2);
          txt(c, k, A, String(i + 1), cx(i), B.y + 0.5, 12, { px: 11, weight: 800, color: on ? '#fff' : P.ink3 });
          if (i < 3) A.arrow(c, cx(i) + 12, B.y, cx(i + 1) - 12, B.y, P.line, 1.3, 5);
        }
        const hot = cur.kind === 'add', back = [[cx(3), B.y + 11], [cx(3), B.y + 19], [cx(1), B.y + 19], [cx(1), B.y + 12]];
        polyArrow(c, A, back, hot ? P.mot : P.line, hot ? 1.7 : 1.3);
        if (hot) flowDots(c, A, back, seg(p, 0.35, 1), P.mot);
        txt(c, k, A, `${sNow + 1}. ${STEPS[sNow]}`, B.labX, B.y, B.labW, { px: 12, weight: 750, color: P.ink, align: 'left' });
        if (hot) txt(c, k, A, 'и обучить заново', B.labX, B.y + 16, B.labW, { px: 10.5, weight: 650, color: P.mot, align: 'left' });
      }

      /* дом */
      const H = G.house, X = (x) => H.ox + x * H.s, Y = (y) => H.oy + y * H.s;
      const tr = turn >= 0 ? w.turns[turn] : null, ep = tr && tr.ep, n = ep ? ep.traj.length : 0;
      const upto = !ep ? 0 : cur.kind === 'ride' ? Math.floor(p * (n - 1)) : n - 1;
      house(c, k, A, P, H, (c2) => {
        band(c2, w.demos.map((d) => d.traj), A.alpha(P.ink3, 0.3), 1);
        for (let j = 0; j < 3; j++) {                       // разметка прошлых оборотов — уже в наборе
          const a = j < added ? 1 : j === turn && cur.kind === 'add' ? adding : 0;
          if (a > 0) band(c2, [w.turns[j].ep.traj.slice(0, -1)], A.alpha(P.out, 0.32), a);
        }
        if (!ep || cur.kind === 'train') { DD.ada(c2, w.start, P.ink, 0.9); return; }
        const showTrip = cur.kind === 'add' ? 1 - adding : cur.kind === 'final' ? 0.7 : 1;
        if (showTrip > 0) {
          c2.globalAlpha = fade * showTrip;
          trail(c2, ep.traj, upto, P.mot);
          if (cur.kind === 'ride' && p < 1) DD.ada(c2, ep.traj[upto], P.mot);
          else { DD.ada(c2, ep.traj[n - 1], P.mot, 0.5); endMark(c2, ep.traj[n - 1], ep.outcome, P); }
          c2.globalAlpha = fade;
        }
        // эксперт размечает: точка в каждом размеченном состоянии и дуга «куда повернул бы эксперт», где он не согласен с политикой
        if (cur.kind === 'label' || cur.kind === 'add') {
          const m = cur.kind === 'label' ? Math.floor(p * tr.lab.length) : tr.lab.length, al = cur.kind === 'add' ? 1 - adding : 1;
          c2.globalAlpha = fade * al; c2.fillStyle = P.out;
          for (let i = 0; i < m; i += 2) { const q = tr.lab[i]; c2.beginPath(); c2.arc(q.x, q.y, 4.2, 0, 7); c2.fill(); }
          let last = -99;
          for (let i = 0; i < m; i++) { const q = tr.lab[i]; if (Math.abs(q.w - q.wp) > 0.35 && i - last >= 8) { DD.arc(c2, q, q.w, 0.7, P.out, 4.5); last = i; } }
          c2.globalAlpha = fade;
        }
      });
      txt(c, k, A, 'кухня', X(D.GOAL.x), Y(D.GOAL.y + D.GOAL.r + 18), 60, { px: 10.5, weight: 650, color: P.ink3, halo: true, haloColor: P.surf });

      /* новые пары идут из поездки в набор */
      const into = cur.kind === 'add';
      polyArrow(c, A, G.into, into ? P.out : P.line, into ? 1.8 : 1.3);
      if (into) flowDots(c, A, G.into, Math.min(0.99, p * 1.4), P.out);
      /* набор пар */
      const S = G.set, demoN = w.base.length, adds = w.turns.map((q) => q.lab.length), total = demoN + adds.reduce((s, x) => s + x, 0);
      const inSet = demoN + adds.reduce((s, x, j) => s + (j < added ? x : j === turn && cur.kind === 'add' ? x * adding : 0), 0);
      txt(c, k, A, 'Набор пар', S.x, S.title, 120, { px: 12, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, A, fmtI(inSet), S.right, S.title, 80, { px: 11, weight: 700, mono: true, color: P.ink2, align: 'right' });
      const bw = S.right - S.x, sc = bw / total;
      A.rect(c, S.x, S.bar - 7, bw, 14, 4, P.surf, P.grid, 1);
      A.rect(c, S.x, S.bar - 7, demoN * sc, 14, 4, A.alpha(P.ink3, 0.45), null);
      let x0 = S.x + demoN * sc;
      adds.forEach((nAdd, j) => {
        const a = j < added ? 1 : j === turn && cur.kind === 'add' ? adding : 0;
        if (a > 0) { c.fillStyle = A.alpha(P.out, 0.45 + 0.18 * j); c.fillRect(x0, S.bar - 7, nAdd * sc * a, 14); }
        x0 += nAdd * sc * (j < added ? 1 : j === turn && cur.kind === 'add' ? adding : 0);
      });
      swatch(c, A, P, S.x, S.leg, A.alpha(P.ink3, 0.45)); txt(c, k, A, 'демонстрации', S.x + 22, S.leg, 110, { px: 10.5, color: P.ink2, align: 'left' });
      swatch(c, A, P, S.leg2[0], S.leg2[1], A.alpha(P.out, 0.6)); txt(c, k, A, 'разметка эксперта', S.leg2[0] + 22, S.leg2[1], 140, { px: 10.5, color: P.ink2, align: 'left' });
      // журнал оборотов
      w.turns.forEach((q, j) => {
        const rideEnd = tl.ph.find((z) => z.kind === 'ride' && z.k === j).b;
        if (u < rideEnd) return;
        const y = S.log + j * S.dy, ok = q.ep.outcome === 'goal';
        txt(c, k, A, `оборот ${j + 1}`, S.x, y, 70, { px: 11, weight: 700, color: P.ink, align: 'left' });
        if (ok) K.check(c, S.x + S.c2 + 5, y, 5, P.good, 2.2); else K.cross(c, S.x + S.c2 + 5, y, 4.5, P.bad, 2.2);
        txt(c, k, A, ok ? 'доехала' : 'авария', S.x + S.c2 + 16, y, 80, { px: 11, weight: 650, color: ok ? P.good : P.bad, align: 'left' });
        const labEnd = tl.ph.find((z) => z.kind === 'label' && z.k === j);
        const nShow = cur.kind === 'label' && cur.k === j ? Math.floor(p * q.lab.length) : q.lab.length;
        if (u >= labEnd.a) txt(c, k, A, `+${fmtI(nShow)} ${plural(nShow, 'пара', 'пары', 'пар')}`, S.right, y, 90, { px: 11, weight: 700, mono: true, color: P.out, align: 'right' });
      });

      /* что происходит */
      let st;
      if (cur.kind === 'train') st = `Шаг 1: политику обучают на 10 демонстрациях эксперта, это ${fmtI(demoN)} ${plural(demoN, 'пара', 'пары', 'пар')}`;
      else if (cur.kind === 'ride') st = p < 1 ? `Оборот ${turn + 1}, шаг 2: политика едет сама, и записывается каждое состояние, в которое она попала` : ep.outcome === 'goal' ? `Оборот ${turn + 1}: Ада доехала до кухни` : `Оборот ${turn + 1}: Ада врезалась там, где примеров в наборе нет`;
      else if (cur.kind === 'label') st = `Шаг 3: эксперт размечает все ${tr.lab.length} ${plural(tr.lab.length, 'состояние', 'состояния', 'состояний')} поездки правильным рулём`;
      else if (cur.kind === 'add') st = 'Шаг 4: новые пары добавляют ко всем старым и обучают политику заново';
      else st = `За три оборота набор вырос на ${fmtI(total - demoN)} ${plural(total - demoN, 'пару', 'пары', 'пар')}, и Ада доехала: примеры появились там, куда она заезжала`;
      txt(c, k, A, st, G.status.x, G.status.y, G.status.w, { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35 });
      c.globalAlpha = 1;
    }
    const WIDE = {
      chips: { x: 14, y: 18, gap: 22 },
      house: { ox: 14, oy: 58, s: 0.55 },
      set: { x: 374, right: 706, title: 70, bar: 92, leg: 114, leg2: [490, 114], log: 150, dy: 26, c2: 86 },
      into: [[348, 168], [358, 168], [358, 92], [370, 92]],
      status: { x: 14, y: 306, w: 692 },
    };
    const NARROW = {
      badges: { x: 14, y: 20, dx: 40, labX: 178, labW: 168 },
      house: { ox: 14, oy: 46, s: 0.553 },
      set: { x: 14, right: 346, title: 290, bar: 310, leg: 332, leg2: [130, 332], log: 362, dy: 24, c2: 86 },
      into: [[200, 270], [200, 301]],
      status: { x: 14, y: 440, w: 332 },
    };
    Anim.add('dagger-loop', {
      W: 720, H: 340, start: 7.4, narrowAt: 620,
      draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
      narrow: { W: 360, H: 500, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
    });
    window.__daggerLoop = { world, timeline };
  })();

  /* =====================================================================
     hg-dagger — человек перехватывает управление
     ===================================================================== */
  (() => {
    const SPEED = 2.2, T0 = {};
    const TAKE_LAB = [[110, 346], [280, 118]];             // где подписать перехваты, в координатах дома: мимо стен и пунктира
    function timeline() {
      if (T0.T) return T0;
      const w = world(), dr = (w.hg.traj.length - 1) * D.DT / SPEED;
      T0.trip = [0.4, 0.4 + dr]; T0.add = [T0.trip[1] + 0.4, T0.trip[1] + 1.5]; T0.fade = [T0.add[1] + 2.6, T0.add[1] + 3.4]; T0.T = T0.fade[1];
      return T0;
    }
    function draw(c, k, t, P, A, G) {
      const w = world(), tl = timeline(), { seg, ease } = A, u = ((t % tl.T) + tl.T) % tl.T, hg = w.hg, n = hg.traj.length;
      const pT = seg(u, ...tl.trip), pA = ease(seg(u, ...tl.add)), fade = 1 - seg(u, ...tl.fade);
      const i = Math.min(n - 1, Math.floor(pT * (n - 1))), done = pT >= 1, humanNow = !done && hg.who[Math.min(i, hg.who.length - 1)] === 1;
      const segNow = w.segs.findIndex(([a, b]) => i >= a && i < b), takes = w.segs.filter(([a]) => i >= a).length;
      c.globalAlpha = fade;
      /* дом */
      const H = G.house, X = (x) => H.ox + x * H.s, Y = (y) => H.oy + y * H.s;
      house(c, k, A, P, H, (c2) => {
        band(c2, w.demos.map((d) => d.traj), A.alpha(P.ink3, 0.3), 1);
        // куда уехала бы Ада без перехвата
        w.segs.forEach(([a], j) => {
          if (i < a || w.would[j].outcome !== 'crash') return;
          const wt = w.would[j].traj, m = done ? wt.length - 1 : Math.min(wt.length - 1, Math.floor((i - a) * 1.6));
          c2.globalAlpha = fade * 0.55; A.line(c2, wt.slice(0, m + 1).map((q) => [q.x, q.y]), P.mot, 2.6, [7, 6]);
          if (m === wt.length - 1) { c2.globalAlpha = fade * 0.5; K.cross(c2, wt[m].x, wt[m].y, 11, P.bad, 4); }
          c2.globalAlpha = fade;
        });
        // поездка: оранжевым — ведёт политика, синим — человек
        for (let q = 1; q <= i; q++) { const h = hg.who[q - 1] === 1; A.line(c2, [[hg.traj[q - 1].x, hg.traj[q - 1].y], [hg.traj[q].x, hg.traj[q].y]], h ? P.out : P.mot, h ? 5 : 3.4); }
        w.segs.forEach(([a]) => { if (i >= a) { c2.beginPath(); c2.arc(hg.traj[a].x, hg.traj[a].y, 7, 0, 7); c2.strokeStyle = P.out; c2.lineWidth = 2.6; c2.stroke(); } });
        if (!done) DD.ada(c2, hg.traj[i], humanNow ? P.out : P.mot);
        else { DD.ada(c2, hg.traj[n - 1], P.mot, 0.5); endMark(c2, hg.traj[n - 1], hg.outcome, P); }
      });
      txt(c, k, A, 'кухня', X(D.GOAL.x), Y(D.GOAL.y + D.GOAL.r + 18), 60, { px: 10.5, weight: 650, color: P.ink3, halo: true, haloColor: P.surf });
      w.segs.forEach(([a], j) => { if (i >= a) { const [lx, ly] = TAKE_LAB[j] || [hg.traj[a].x, hg.traj[a].y - 30]; txt(c, k, A, `перехват ${j + 1}`, X(lx), Y(ly), 90, { px: 10.5, weight: 750, color: P.out, halo: true, haloColor: P.surf }); } });

      /* кто ведёт: полоса времени */
      const S = G.strip, bw = S.right - S.x, sc = bw / (n - 1);
      txt(c, k, A, 'Кто ведёт Аду', S.x, S.title, 160, { px: 12, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, A, `перехватов: ${takes}`, S.right, S.title, 110, { px: 11, weight: 700, mono: true, color: P.out, align: 'right' });
      A.rect(c, S.x, S.y - 6, bw, 12, 4, P.surf, P.grid, 1);
      for (let q = 0; q < i; q++) { c.fillStyle = hg.who[q] ? P.out : A.alpha(P.mot, 0.75); c.fillRect(S.x + q * sc, S.y - 5, sc + 0.4, 10); }
      if (!done) A.line(c, [[S.x + i * sc, S.y - 9], [S.x + i * sc, S.y + 9]], P.ink, 1.6);
      for (let s = 0; s <= (n - 1) * D.DT; s += 5) txt(c, k, A, `${s} с`, S.x + s / D.DT * sc, S.y + 16, 40, { px: 10, mono: true, color: P.ink3, align: s === 0 ? 'left' : 'center' });
      swatch(c, A, P, S.leg[0][0], S.leg[0][1], A.alpha(P.mot, 0.75)); txt(c, k, A, 'политика', S.leg[0][0] + 22, S.leg[0][1], 90, { px: 10.5, color: P.ink2, align: 'left' });
      swatch(c, A, P, S.leg[1][0], S.leg[1][1], P.out); txt(c, k, A, 'человек', S.leg[1][0] + 22, S.leg[1][1], 90, { px: 10.5, color: P.ink2, align: 'left' });
      swatch(c, A, P, S.leg[2][0], S.leg[2][1], A.alpha(P.mot, 0.6), true); txt(c, k, A, 'без перехвата', S.leg[2][0] + 22, S.leg[2][1], 110, { px: 10.5, color: P.ink2, align: 'left' });

      /* что идёт в набор */
      const B = G.set, all = n - 1, hum = w.human, bw2 = B.right - B.barX, sc2 = bw2 / all;
      const humSoFar = hg.who.slice(0, i).reduce((s, x) => s + x, 0);
      txt(c, k, A, 'Новые пары в наборе', B.x, B.title, 200, { px: 12, weight: 750, color: P.ink, align: 'left' });
      txt(c, k, A, 'HG-DAgger', B.x, B.y1, B.barX - B.x - 8, { px: 11, weight: 700, color: P.ink, align: 'left' });
      A.rect(c, B.barX, B.y1 - 6, bw2, 12, 4, P.surf, P.grid, 1);
      const hv = done ? hum : humSoFar;
      if (hv > 0) A.rect(c, B.barX, B.y1 - 6, Math.max(3, hv * sc2), 12, 4, P.out, null);
      txt(c, k, A, `${fmtI(hv)} ${plural(hv, 'пара', 'пары', 'пар')}`, B.barX + Math.max(3, hv * sc2) + 6, B.y1, 90, { px: 11, weight: 700, mono: true, color: P.out, align: 'left' });
      if (pA > 0) {
        c.globalAlpha = fade * pA;
        txt(c, k, A, 'DAgger', B.x, B.y2, B.barX - B.x - 8, { px: 11, weight: 700, color: P.ink2, align: 'left' });
        A.rect(c, B.barX, B.y2 - 6, bw2, 12, 4, null, P.ink3, 1.4);
        txt(c, k, A, `${fmtI(all)} ${plural(all, 'пара', 'пары', 'пар')}`, B.right - 6, B.y2, 90, { px: 11, weight: 700, mono: true, color: P.ink2, align: 'right' });
        c.globalAlpha = fade;
      }

      /* что происходит */
      let st;
      if (done) st = `В набор идут только участки, где вёл человек: ${fmtI(hum)} ${plural(hum, 'пара', 'пары', 'пар')}. DAgger разметил бы все ${fmtI(all)} ${plural(all, 'состояние', 'состояния', 'состояний')} поездки`;
      else if (humanNow) st = w.would[segNow] && w.would[segNow].outcome === 'crash' ? 'Ада уходила от маршрута, и человек перехватил управление: без него она бы врезалась. Эти пары идут в набор' : 'Человек ведёт Аду, и эти пары идут в набор';
      else if (takes > 0) st = 'Ада снова на маршруте, и человек отдал управление политике';
      else st = 'Ада едет сама, а человек смотрит и готов перехватить управление';
      txt(c, k, A, st, G.status.x, G.status.y, G.status.w, { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35 });
      c.globalAlpha = 1;
    }
    const WIDE = {
      house: { ox: 14, oy: 14, s: 0.55 },
      strip: { x: 374, right: 706, title: 26, y: 50, leg: [[374, 86], [462, 86], [546, 86]] },
      set: { x: 374, right: 706, barX: 456, title: 128, y1: 154, y2: 180 },
      status: { x: 14, y: 260, w: 692 },
    };
    const NARROW = {
      house: { ox: 14, oy: 14, s: 0.553 },
      strip: { x: 14, right: 346, title: 258, y: 280, leg: [[14, 314], [110, 314], [196, 314]] },
      set: { x: 14, right: 346, barX: 96, title: 350, y1: 376, y2: 402 },
      status: { x: 14, y: 436, w: 332 },
    };
    Anim.add('hg-dagger', {
      W: 720, H: 292, start: 3.0, narrowAt: 620,
      draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
      narrow: { W: 360, H: 494, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
    });
    window.__hgDagger = { world, timeline };
  })();
})();
