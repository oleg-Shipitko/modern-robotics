/* =====================================================================
   anim-l04.js — анимированные схемы урока 0.4 (shared/anim.js):
     kalman-cycle — цикл фильтра Калмана: предсказание по колёсам сдвигает
                    оценку и расширяет колокол на Q, дальномер даёт измерение
                    с шумом R, коррекция сдвигает оценку к измерению на долю
                    K = P / (P + R) и сужает колокол. Полоса ±2σ по шагам:
                    растёт при предсказании, сужается при коррекции; дальномер
                    молчит три шага — растёт; в конце — что будет при большем R.
                    Числа условные: шумы и шаги крупнее, чем в лаборатории.
     pf-cycle     — фильтр частиц по шагам на плане дома лаборатории 2: 30 частиц
                    разбросаны по дому; скан лидара; вес частицы — сходство скана,
                    который она увидела бы, с настоящим (правдоподобие из l04/engine.js);
                    пересэмплирование — два облака в одинаковых спальнях; Ада едет
                    к двери; новый скан различает спальни, остаётся одно облако.
     slam-step    — один шаг SLAM изнутри: предсказание позы по колёсам, новый
                    скан не ложится на карту, перебор сдвигов и поворотов
                    (как OccMap.match), поправленная поза, скан дорисовывает
                    сетку занятости. В лаборатории виден только итог таких шагов.
   Цвета: синий — оценка, классический результат и скан Ады; оранжевый — то,
   что считается сейчас (предсказание, ожидаемый скан частицы, новый скан);
   серый — измерение дальномера и неподвижное. Дом и лучи — из l04/engine.js
   (window.L4). Без shared/anim.js схем нет, а остальной урок работает.
   ===================================================================== */
'use strict';
(() => {
  const KINDS = ['kalman-cycle', 'pf-cycle', 'slam-step'];
  if (typeof Anim === 'undefined' || !window.L4) {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, E = window.L4, HS = E.House, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Фраза — в строки не шире maxW. */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const ws = text.split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись не шире maxW (если шире — шрифт чуть меньше); массив — несколько строк; o.wrap — перенос по словам;
   *  o.top — y задаёт первую строку, иначе середину блока. */
  function txt(c, k, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(8.5, px * maxW / w);
    const lh = px * k * (o.lh || 1.3), y0 = o.top ? y : y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => K.label(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
    return lines.length;
  }
  /** Ломаная со стрелкой на конце. */
  function poly(c, A, pts, col, lw) {
    if (pts.length > 2) A.line(c, pts.slice(0, -1), col, lw);
    const a = pts[pts.length - 2], b = pts[pts.length - 1]; A.arrow(c, a[0], a[1], b[0], b[1], col, lw, 6);
  }
  /** Ада сверху: круглый корпус, экран-лицо, оранжевые глаза (как в лабораториях урока). */
  function ada(c, x, y, th, r, color, alpha) {
    const ga = c.globalAlpha; c.save(); c.globalAlpha = ga * (alpha == null ? 1 : alpha); c.translate(x, y); c.rotate(th);
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = K.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = Math.max(1.4, r * 0.12); c.strokeStyle = color; c.stroke();
    c.beginPath(); c.roundRect(r * 0.22, -r * 0.5, r * 0.55, r, r * 0.22); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(r * 0.5, -r * 0.22, r * 0.1, 0, TAU); c.arc(r * 0.5, r * 0.22, r * 0.1, 0, TAU); c.fill();
    c.restore();
  }
  /** Блок: рамка, название и строки; on — блок сейчас работает. */
  function box(c, k, A, P, b, title, lines, on, col, o) {
    o = o || {}; const [x, y, w, h] = b;
    A.rect(c, x, y, w, h, 9, on ? A.alpha(col, 0.12) : P.surf, on ? col : P.line, on ? 1.8 : 1.2);
    const cx = o.cx != null ? o.cx : x + w / 2, tw = o.tw || w - 14;
    txt(c, k, title, cx, y + (o.ty || 18), tw, { px: 12, weight: 750, color: P.ink, align: o.align || 'center' });
    let yy = y + (o.ly || 38);
    for (const [s, mono] of lines) { txt(c, k, s, cx, yy, tw, { px: mono ? 10.5 : 10.5, weight: mono ? 700 : 600, mono, color: mono ? (on ? col : P.ink2) : P.ink2, align: o.align || 'center' }); yy += (o.lh || 15) * k; }
  }
  /** План дома (см) в квадрат на канвасе: стены и мебель; faint — бледно, как подсказка. */
  function house(c, A, P, m, s, o) {
    o = o || {};
    for (const f of HS.FURN) { const [x0, y0, x1, y1] = f.r, a = m(x0, y0), b = m(x1, y1); c.beginPath(); c.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.fillStyle = o.faint ? 'transparent' : P.surf2; c.fill(); if (!o.faint) { c.beginPath(); c.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); K.hatch(c, a[0], a[1], b[0], b[1], A.alpha(P.ink3, 0.6), 5, 0.7); } c.strokeStyle = o.faint ? P.line : P.ink3; c.lineWidth = 1; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    c.fillStyle = o.faint ? P.line : P.ink2;
    for (const r of HS.WALLS) { const a = m(Math.max(r[0], o.x0 == null ? -8 : o.x0), r[1]), b = m(Math.min(r[2], o.x1 == null ? 608 : o.x1), r[3]); if (b[0] > a[0]) c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
  }

  /* =====================================================================
     kalman-cycle — предсказание → измерение → коррекция
     ===================================================================== */
  (() => {
    // условные числа, см: путь по колёсам за шаг, настоящий путь за шаг (колёса завышают), шумы σ модели 20 и σ дальномера 25
    const U = 40, VT = 35, Q = 400, R0 = 625, R1 = 6400, TRUE0 = 70, X0 = 82, WALL = 450;
    const NZ = [null, -12, 12, -8, 5, null, null, null, -6];         // шум дальномера по шагам; null — дальномер молчит
    function steps(R8) {
      const S = [{ k: 0, xt: TRUE0, x: X0, P: R0, K: 1 }];
      for (let k = 1; k <= 8; k++) {
        const pr = S[k - 1], xt = TRUE0 + VT * k, xp = pr.x + U, Pp = pr.P + Q, R = k === 8 ? R8 : R0;
        if (NZ[k] == null) S.push({ k, xt, xp, Pp, z: null, K: 0, x: xp, P: Pp, R });
        else { const z = xt + NZ[k], Kk = Pp / (Pp + R); S.push({ k, xt, xp, Pp, z, K: Kk, x: xp + Kk * (z - xp), P: (1 - Kk) * Pp, R }); }
      }
      return S;
    }
    const S = steps(R0), S1 = steps(R1);
    // расписание шагов: [начало предсказания, начало измерения, начало коррекции, конец]
    const SCH = [];
    let t = 1.6;
    for (let k = 1; k <= 8; k++) {
      const silent = NZ[k] == null, slow = k === 1 || k === 8;
      const dp = slow ? 1.6 : silent ? 1.0 : 0.6, dm = silent ? 0 : slow ? 1.1 : 0.4, dc = silent ? 0 : slow ? 1.8 : 0.7;
      SCH.push({ k, a: t, b: t + dp, c: t + dp + dm, d: t + dp + dm + dc }); t += dp + dm + dc + (slow ? 0.3 : 0.15);
    }
    const WHAT = [t + 0.6, t + 2.6], T = t + 5.2, FADE = [T - 0.8, T];
    const sig = (P) => Math.sqrt(P);
    function draw(c, k, t0, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t0 % T) + T) % T, fade = 1 - seg(u, ...FADE);
      c.globalAlpha = fade;
      // где мы: шаг, фаза, доли
      let cur = null; for (const s of SCH) if (u >= s.a) cur = s;
      const k0 = cur ? cur.k : 0, st = S[k0];
      const pP = cur ? seg(u, cur.a, cur.b) : 0, pM = cur && cur.c > cur.b ? seg(u, cur.b, cur.c) : 0, pC = cur && cur.d > cur.c ? seg(u, cur.c, cur.d) : 0;
      const silent = cur && NZ[k0] == null, wf = ease(seg(u, ...WHAT));                    // wf — доля «что если R больше»
      const R8 = lerp(R0, R1, wf), s8 = k0 === 8 && wf > 0 ? (() => { const Kk = st.Pp / (st.Pp + R8); return { K: Kk, x: st.xp + Kk * (st.z - st.xp), P: (1 - Kk) * st.Pp }; })() : null;
      const post = (kk) => (kk === 8 && s8 ? s8 : S[kk]);
      const phase = !cur ? 'init' : u < cur.b ? 'pred' : u < cur.c ? 'meas' : u < cur.d ? 'corr' : 'done';
      // ---------- блоки цикла ----------
      const predOn = phase === 'pred', corrOn = phase === 'corr' || wf > 0 && wf < 1;
      box(c, k, A, P, G.pred, 'Предсказание', G.predL, predOn, P.mot, G.predO);
      box(c, k, A, P, G.corr, 'Коррекция', G.corrL, corrOn, P.out, G.corrO);
      poly(c, A, G.a1, predOn || phase === 'meas' ? P.ink2 : P.line, 1.5);
      poly(c, A, G.loop, phase === 'done' || phase === 'init' ? P.ink2 : P.line, 1.4);
      txt(c, k, 'следующий шаг', G.loopL[0], G.loopL[1], 160, { px: 10.5, weight: 650, color: P.ink3 });
      // доля K: полоска из P и R, оранжевая часть — K = P / (P + R); видна при коррекции шага с измерением
      const Kshow = !silent && (phase === 'corr' || phase === 'done') ? (k0 === 8 && s8 ? s8.K : st.K) : null;
      const Bk = G.kbar, kk = Kshow == null ? 0 : phase === 'corr' ? Kshow * ease(pC) : Kshow;
      A.rect(c, Bk.x, Bk.y, Bk.w, Bk.h, 3, Kshow != null ? A.alpha(P.ink3, 0.35) : P.surf, P.line, 1);
      if (Kshow != null) {
        const w1 = Bk.w * kk;
        if (w1 > 1) A.rect(c, Bk.x, Bk.y, w1, Bk.h, 3, A.alpha(P.mot, 0.85), null);
        txt(c, k, `K = ${A.fmt(kk, 2)}`, clamp(Bk.x + w1 / 2, Bk.x + 26, Bk.x + Bk.w - 26), Bk.y - 9, 90, { px: 10.5, weight: 750, color: P.mot });
        if (w1 > 14) txt(c, k, 'P', Bk.x + w1 / 2, Bk.y + Bk.h + 9, 30, { px: 10, weight: 700, color: P.mot });
        if (Bk.w - w1 > 14) txt(c, k, 'R', Bk.x + (Bk.w + w1) / 2, Bk.y + Bk.h + 9, 30, { px: 10, weight: 700, color: P.ink3 });
      } else if (silent) txt(c, k, 'нет измерения', Bk.x + Bk.w / 2, Bk.y - 9, Bk.w, { px: 10.5, weight: 700, color: P.bad });
      // ---------- колокола над коридором ----------
      const X = (cm) => G.ax0 + (G.ax1 - G.ax0) * cm / WALL, base = G.base;
      const bell = (mu, P2, col, fa, la, dash) => {
        if (la <= 0) return;
        const sg = sig(P2), h = Math.min(G.hmax, G.hmax * G.sref / sg), pts = [];
        for (let i = 0; i <= 90; i++) { const x = mu - 3.6 * sg + 7.2 * sg * i / 90; pts.push([X(x), base - h * Math.exp(-0.5 * ((x - mu) / sg) ** 2)]); }
        const ga = c.globalAlpha; c.globalAlpha = ga * la;
        c.beginPath(); c.moveTo(pts[0][0], base); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(pts[pts.length - 1][0], base); c.closePath(); c.fillStyle = A.alpha(col, fa); c.fill();
        A.line(c, pts, col, 2, dash);
        A.line(c, [[X(mu), base], [X(mu), base - h]], A.alpha(col, 0.55), 1, [2, 3]);
        c.globalAlpha = ga;
      };
      c.save(); c.beginPath(); c.rect(G.ax0 - 40, base - G.hmax - 8, X(WALL) - G.ax0 + 40, G.hmax + 9); c.clip();
      if (!cur) bell(S[0].x, S[0].P, P.out, 0.16, seg(u, 0.2, 1.0));
      else {
        const pr = post(k0 - 1), mu = phase === 'pred' ? lerp(pr.x, st.xp, ease(pP)) : st.xp, PP = phase === 'pred' ? lerp(pr.P, st.Pp, ease(pP)) : st.Pp;
        bell(pr.x, pr.P, P.out, 0.06, phase === 'pred' ? 1 - 0.6 * ease(pP) : 0.25, [4, 3]);   // прошлая оценка
        bell(mu, PP, P.mot, 0.12, phase === 'corr' || phase === 'done' ? (silent ? 1 : 0.55) : 1);
        if (!silent && (phase === 'meas' || phase === 'corr' || phase === 'done')) bell(st.z, k0 === 8 ? R8 : R0, P.ink3, 0.1, phase === 'meas' ? ease(pM) : 0.75);
        if (!silent && (phase === 'corr' || phase === 'done')) { const q = post(k0), e2 = phase === 'corr' ? ease(pC) : 1; bell(lerp(st.xp, q.x, e2), lerp(st.Pp, q.P, e2), P.out, 0.18, 1); }
      }
      c.restore();
      A.line(c, [[G.ax0 - 20, base], [X(WALL), base]], P.ink3, 1.2);
      // коридор: настоящая Ада, стена, луч дальномера
      const xt = !cur ? S[0].xt : phase === 'pred' ? lerp(S[k0 - 1].xt, st.xt, ease(pP)) : st.xt, ay = G.adaY;
      c.beginPath(); c.rect(X(WALL), ay - 13, 12, 26); c.fillStyle = P.surf2; c.fill(); A.hatchBox(c, X(WALL), ay - 13, X(WALL) + 12, ay + 13, P); c.strokeStyle = P.ink2; c.lineWidth = 1.4; c.strokeRect(X(WALL), ay - 13, 12, 26);
      if (cur && !silent && phase === 'meas') { const a = ease(pM); A.line(c, [[X(xt) + 11, ay], [lerp(X(xt) + 11, X(WALL), a), ay]], P.ink3, 1.4, [3, 4]); }
      if (silent && G.corrLab && phase !== 'init') txt(c, k, 'дальномер молчит', (X(xt) + X(WALL)) / 2 + 10, ay, X(WALL) - X(xt) - 30, { px: 10.5, weight: 700, color: P.bad, halo: true, haloColor: P.surf2 });
      ada(c, X(xt), ay, 0, 10, P.ink3, 0.55);
      // легенда колоколов
      G.leg.forEach(([x, y, col, lab2, dash]) => { A.line(c, [[x, y], [x + 18, y]], col, 2.4, dash); txt(c, k, lab2, x + 24, y, 140, { px: 10.5, weight: 650, color: P.ink2, align: 'left' }); });
      // ---------- полоса ±2σ по шагам ----------
      const B = G.band, BX = (s) => B.x0 + (B.x1 - B.x0) * s / 8, BH = (P2) => B.h * 2 * sig(P2) / 90;
      txt(c, k, 'полоса ±2σ', B.lx, B.ly, B.x0 - B.lx - 6, { px: 10.5, weight: 700, color: P.out, align: 'left' });
      // тихие шаги: штриховка и подпись
      const ys = B.y - B.h - 3, ye = B.y + B.h + 3;
      c.globalAlpha = fade * 0.5; c.beginPath(); c.rect(BX(4), ys, BX(7) - BX(4), ye - ys); K.hatch(c, BX(4), ys, BX(7), ye, A.alpha(P.bad, 0.5), 7, 0.8); c.globalAlpha = fade;
      if (u >= SCH[4].a) txt(c, k, 'дальномер молчит', BX(4), B.ly, B.x1 + 12 - BX(4), { px: 10, weight: 700, color: P.bad, align: 'left' });
      // точки полосы: (шаг, P) — после коррекции шага k−1, после предсказания шага k, после коррекции шага k
      const pts = [[0, S[0].P]]; let sNow = 0;
      for (let kk2 = 1; kk2 <= k0; kk2++) {
        const s2 = S[kk2], q = post(kk2), mine = kk2 === k0, sl = NZ[kk2] == null;
        if (sl) { const f = mine && phase === 'pred' ? ease(pP) : 1; pts.push([kk2 - 1 + f, lerp(S[kk2 - 1].P, s2.Pp, f)]); sNow = kk2 - 1 + f; continue; }
        const f1 = mine && phase === 'pred' ? ease(pP) : 1; pts.push([kk2 - 1 + 0.5 * f1, lerp(post(kk2 - 1).P, s2.Pp, f1)]); sNow = kk2 - 1 + 0.5 * f1;
        if (mine && (phase === 'pred' || phase === 'meas')) break;
        const f2 = mine && phase === 'corr' ? ease(pC) : 1; pts.push([kk2 - 0.5 + 0.5 * f2, lerp(s2.Pp, q.P, f2)]); sNow = kk2 - 0.5 + 0.5 * f2;
      }
      A.line(c, [[B.x0, B.y], [B.x1, B.y]], P.grid, 1);
      c.beginPath(); pts.forEach(([s2, P2], i) => (i ? c.lineTo(BX(s2), B.y - BH(P2)) : c.moveTo(BX(s2), B.y - BH(P2)))); for (let i = pts.length - 1; i >= 0; i--) c.lineTo(BX(pts[i][0]), B.y + BH(pts[i][1])); c.closePath(); c.fillStyle = A.alpha(P.out, 0.22); c.fill();
      A.line(c, pts.map(([s2, P2]) => [BX(s2), B.y - BH(P2)]), P.out, 1.6); A.line(c, pts.map(([s2, P2]) => [BX(s2), B.y + BH(P2)]), P.out, 1.6);
      for (let i = 1; i <= 8; i++) txt(c, k, String(i), BX(i), B.ty, 20, { px: 10, mono: true, color: i <= Math.ceil(sNow - 1e-6) ? P.ink2 : P.ink3 });
      // ---------- что происходит ----------
      const s1 = !cur ? 'Фильтр хранит оценку положения и её неуверенность P.'
        : wf > 0 ? 'Если дальномер шумит сильнее, R больше, а K меньше: коррекция слабо сдвигает оценку и слабо сужает полосу.'
        : silent ? 'Дальномер молчит, и фильтр делает одни предсказания: неуверенность растёт с каждым шагом.'
        : k0 === 8 && phase === 'pred' ? 'Пока измерений не было, неуверенность P выросла.'
        : k0 === 8 && phase === 'meas' ? 'Измерение вернулось.'
        : k0 === 8 ? 'Неуверенность P большая, поэтому K ближе к 1: оценка сильно сдвигается к измерению, и полоса снова сужается.'
        : k0 > 1 ? 'Так повторяется на каждом шаге: предсказание расширяет полосу неуверенности, а коррекция сужает её.'
        : phase === 'pred' ? 'Предсказание: оценку сдвигают на путь по колёсам, а неуверенность растёт на Q.'
        : phase === 'meas' ? 'Дальномер измеряет положение со своим шумом R.'
        : 'Коррекция: оценку сдвигают к измерению на долю K = P / (P + R), и неуверенность уменьшается.';
      txt(c, k, s1, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35, top: true });
      c.globalAlpha = 1;
    }
    const LEGS = (x, y, dx) => [[x, y, null, 'оценка'], [x + dx[0], y, null, 'предсказание'], [x + dx[1], y, null, 'измерение']];
    function legend(P, L) { return L.map(([x, y, , lab2], i) => [x, y, [P.out, P.mot, P.ink3][i], lab2]); }
    Anim.add('kalman-cycle', {
      W: 720, H: 428, start: SCH[7].d + 0.3, narrowAt: 700,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          pred: [14, 14, 250, 84], predL: [['оценку сдвигают на путь по колёсам'], ['P → P + Q', true]], predO: { ly: 44, lh: 17 },
          corr: [306, 14, 400, 84], corrL: [['оценку сдвигают к измерению на долю K'], ['K = P / (P + R)', true]], corrO: { cx: 430, tw: 236, ly: 44, lh: 17 },
          kbar: { x: 566, y: 50, w: 128, h: 10 },
          a1: [[264, 56], [304, 56]], loop: [[506, 98], [506, 114], [139, 114], [139, 100]], loopL: [322, 127],
          leg: legend(P, LEGS(40, 152, [96, 218])),
          ax0: 40, ax1: 660, base: 262, hmax: 92, sref: 18, adaY: 282,
          band: { lx: 14, ly: 312, x0: 104, x1: 660, y: 344, h: 24, ty: 380 }, corrLab: true,
          st: [14, 398, 692],
        });
      },
      narrow: {
        W: 360, H: 528,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            pred: [14, 14, 156, 136], predL: [['оценку сдвигают'], ['на путь по колёсам'], ['P → P + Q', true]], predO: { ly: 40, lh: 14 },
            corr: [190, 14, 156, 136], corrL: [['оценку сдвигают'], ['к измерению'], ['на долю K'], ['K = P / (P + R)', true]], corrO: { ly: 36, lh: 13.5 },
            kbar: { x: 202, y: 120, w: 132, h: 9 },
            a1: [[170, 62], [188, 62]], loop: [[268, 150], [268, 162], [92, 162], [92, 152]], loopL: [180, 175],
            leg: legend(P, LEGS(24, 200, [88, 210])),
            ax0: 26, ax1: 330, base: 318, hmax: 88, sref: 18, adaY: 336,
            band: { lx: 14, ly: 366, x0: 92, x1: 330, y: 396, h: 20, ty: 428 },
            st: [14, 448, 332],
          });
        },
      },
    });
  })();

  /** Полоса шагов: номер и короткое название; текущий шаг выделен, пройденные отмечены. Узкая раскладка — кружки с номерами
   *  и название текущего шага. */
  function pills(c, k, A, P, G, cur, names, col) {
    const n = names.length;
    if (G.pills.length === 4) {
      const [x0, y0, w, h] = G.pills, gap = 8, pw = (w - gap * (n - 1)) / n;
      names.forEach((nm, i) => {
        const x = x0 + i * (pw + gap), on = i === cur, done = i < cur;
        A.rect(c, x, y0, pw, h, h / 2, on ? A.alpha(col, 0.16) : done ? A.alpha(col, 0.06) : P.surf, on ? col : done ? A.alpha(col, 0.45) : P.line, on ? 1.8 : 1.1);
        txt(c, k, `${i + 1} · ${nm}`, x + pw / 2, y0 + h / 2, pw - 12, { px: 11, weight: on ? 800 : 650, color: on ? P.ink : done ? P.ink2 : P.ink3 });
      });
    } else {
      const [x0, yc, dx] = G.pills;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * dx, on = i === cur, done = i < cur;
        if (i) A.line(c, [[x - dx + 12, yc], [x - 12, yc]], done || on ? A.alpha(col, 0.5) : P.line, 1.4);
        A.circle(c, x, yc, 11, on ? col : done ? A.alpha(col, 0.18) : P.surf, on ? col : done ? A.alpha(col, 0.5) : P.line, 1.4);
        txt(c, k, String(i + 1), x, yc + 0.5, 20, { px: 11, weight: 800, color: on ? P.surf : done ? P.ink2 : P.ink3 });
      }
      txt(c, k, names[cur], x0 + (n - 1) * dx + 20, yc, G.W - (x0 + (n - 1) * dx + 20) - 12, { px: 12.5, weight: 800, color: P.ink, align: 'left' });
    }
  }

  /* =====================================================================
     pf-cycle — фильтр частиц по шагам: 30 частиц, скан, веса, пересэмплирование,
     движение, новый скан у двери различает одинаковые спальни
     ===================================================================== */
  (() => {
    const PF = E.PF, NB = PF.NB, RMAX = PF.RMAX, N = 30, LUCK = 4, SEED = 7;
    const A0 = { x: 60, y: 150, th: 0 }, A1 = { x: 228, y: 148, th: 0 };
    const NAMES = ['Разброс', 'Скан и вес', 'Отбор', 'Движение', 'Новый скан'];
    /** Частицы, сканы, веса и пересэмплирования — один раз, на функциях фильтра из l04/engine.js. */
    let D = null;
    function data() {
      if (D) return D;
      const r = E.rng(SEED), rn = () => E.randn(r);
      // среди разбросанных частиц есть четыре рядом с настоящей позой и четыре — на тех же местах в соседней спальне
      const S0 = [];
      for (let j = 0; j < LUCK; j++) { const dx = rn() * 9, dy = rn() * 9, dt = rn() * 0.08; S0.push({ x: A0.x + dx, y: A0.y + dy, th: dt }, { x: A0.x + dx, y: A0.y + 204 + dy, th: dt }); }
      for (let g = 0; S0.length < N && g < 5000; g++) {
        const p = PF.randomPose(r), q = { x: p[0], y: p[1], th: p[2] };
        if (Math.hypot(q.x - A0.x, q.y - A0.y) < 75 || Math.hypot(q.x - A0.x, q.y - A0.y - 204) < 75 || S0.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 62)) continue;
        S0.push(q);
      }
      const scan = (p) => { const z = HS.scan(p.x, p.y, p.th, NB, RMAX); for (let b = 0; b < NB; b++) z[b] = Math.min(RMAX, z[b] + rn() * 3); return z; };
      const weigh = (S, z) => { const pf = PF.create(N, SEED); S.forEach((p, i) => { pf.x[i] = p.x; pf.y[i] = p.y; pf.th[i] = p.th; }); PF.weigh(pf, z); return Array.from(pf.w); };
      const resample = (w) => { const out = [], step = 1 / N; let u = r() * step, cc = w[0], j = 0; for (let i = 0; i < N; i++) { while (u > cc && j < w.length - 1) { j++; cc += w[j]; } out.push(j); u += step; } return out; };
      const z0 = scan(A0), W1 = weigh(S0, z0), par1 = resample(W1);
      const S1 = par1.map((j) => ({ x: S0[j].x + rn() * 12, y: S0[j].y + rn() * 12, th: S0[j].th + rn() * 0.08 }));
      const dd = Math.hypot(A1.x - A0.x, A1.y - A0.y);
      const S2 = S1.map((p) => { const th = p.th + rn() * 0.035, d = dd + rn() * (0.1 * dd + 0.6); return { x: p.x + Math.cos(th) * d, y: p.y + Math.sin(th) * d, th }; });
      const z1 = scan(A1), W2 = weigh(S2, z1), par2 = resample(W2);
      const S3 = par2.map((j) => ({ x: S2[j].x + rn() * 12, y: S2[j].y + rn() * 12, th: S2[j].th + rn() * 0.06 }));
      let h3 = 0; S2.forEach((q, i) => { if (q.y > 250 && (S2[h3].y <= 250 || W2[i] > W2[h3])) h3 = i; });   // частица нижнего облака: её скан у двери другой
      // две частицы для сравнения сканов: на том же месте в соседней спальне и в гостиной
      let h1 = 1; for (let j = 1; j < 2 * LUCK; j += 2) if (W1[j] > W1[h1]) h1 = j;
      let h2 = 2 * LUCK, bd = 1e9; S0.forEach((p, i) => { if (i < 2 * LUCK) return; const d = Math.hypot(p.x - 300, p.y - 110); if (d < bd) { bd = d; h2 = i; } });
      const exp = (p) => HS.scan(p.x, p.y, p.th, NB, RMAX);
      const order = S0.map((_, i) => i).sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));     // порядок появления: удачные — вперемешку с остальными
      return (D = { S0, S1, S2, S3, W1, W2, mx1: Math.max(...W1), mx2: Math.max(...W2), par1, par2, z0, z1, h1, h2, h3, e1: exp(S0[h1]), e2: exp(S0[h2]), e3: exp(S2[h3]), order });
    }
    const PH = { scat: [0.3, 3.0], scan: [3.3, 4.4], cmp: [4.5, 7.3], wgt: [7.4, 9.0], res: [9.3, 11.9], move: [12.1, 14.9], scan2: [15.1, 16.0], cmp2: [16.1, 17.5], wgt2: [17.6, 18.8], res2: [19.0, 21.4], fade: [24.2, 25.0] }, T = 25.0;
    function draw(c, k, t0, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t0 % T) + T) % T, fade = 1 - seg(u, ...PH.fade), d = data();
      c.globalAlpha = fade;
      const p = {}; for (const key of Object.keys(PH)) p[key] = seg(u, ...PH[key]);
      const stage = u < PH.scan[0] ? 0 : u < PH.res[0] ? 1 : u < PH.move[0] ? 2 : u < PH.scan2[0] ? 3 : 4;
      pills(c, k, A, P, G, stage, NAMES, P.out);
      // ---------- крупная подпись шага ----------
      const cap = stage === 0 ? 'Ада не знает, где она. Фильтр разбрасывает по дому 30 частиц, и каждая частица — гипотеза «Ада здесь и смотрит туда».'
        : u < PH.cmp[0] ? 'Ада снимает скан: лидар меряет расстояния до стен и мебели вокруг.'
        : u < PH.wgt[0] ? 'Для каждой частицы фильтр считает скан, который она увидела бы на своём месте, и сравнивает его с настоящим.'
        : stage === 1 ? 'Чем похожее скан частицы на настоящий, тем больше её вес. Вес показан размером частицы.'
        : stage === 2 ? 'При пересэмплировании тяжёлые частицы копируются, а лёгкие исчезают. Спальни одинаковые, поэтому остаются два облака.'
        : stage === 3 ? 'Ада едет к двери. Все частицы сдвигаются на тот же путь по одометрии, с небольшим шумом.'
        : u < PH.wgt2[0] ? 'У двери Ада снимает новый скан. У двери нижней спальни скан был бы другим.'
        : u < PH.res2[0] ? 'Поэтому веса частиц нижнего облака падают, а у частиц вокруг Ады остаются большими.'
        : 'После пересэмплирования остаётся одно облако, и оно окружает настоящую Аду.';
      txt(c, k, cap, G.cap[0], G.cap[1], G.cap[2], { px: G.capPx, weight: 750, color: P.ink, align: 'left', wrap: true, lh: 1.32, top: true });
      // ---------- план дома ----------
      const [ox, oy, sc] = G.plan, m = (x, y) => [ox + x * sc, oy + y * sc];
      A.rect(c, ox, oy, 600 * sc, 400 * sc, 4, P.surf, null);
      house(c, A, P, m, sc);
      G.rooms.forEach(([t1, x, y, al]) => { const q = m(x, y); txt(c, k, t1, q[0], q[1], 90, { px: 10, weight: 600, color: P.ink3, align: al || 'center', halo: true, haloColor: P.surf }); });
      // ---------- лучи лидара: у Ады синие, у двух частиц для сравнения — оранжевые ----------
      const rays = (q, z, col, a, dash) => { if (a <= 0) return; c.globalAlpha = fade * a; for (let b = 0; b < NB; b++) { const an = q.th + TAU * b / NB; A.line(c, [m(q.x, q.y), m(q.x + Math.cos(an) * z[b], q.y + Math.sin(an) * z[b])], col, dash ? 1.3 : 1.2, dash); } c.globalAlpha = fade; };
      const ap = p.move > 0 ? { x: lerp(A0.x, A1.x, ease(p.move)), y: lerp(A0.y, A1.y, ease(p.move)), th: 0 } : A0;
      if (p.scan > 0 && u < PH.res[0]) rays(A0, d.z0, P.out, 0.55 * Math.min(1, p.scan * 2));
      if (u >= PH.res[0] && u < PH.move[0]) rays(A0, d.z0, P.out, 0.55 * (1 - p.res));
      if (p.scan2 > 0) rays(A1, d.z1, P.out, 0.55 * Math.min(1, p.scan2 * 2) * (1 - p.res2));
      const cmpA = u >= PH.cmp[0] && u < PH.res[0] ? (u < PH.wgt[0] ? 1 : 1 - p.wgt) : 0;
      // сравнение по очереди: сначала частица на том же месте в соседней спальне, потом частица в гостиной
      const tagged = [];
      if (cmpA > 0) {
        const a1 = ease(seg(p.cmp, 0, 0.3)) * cmpA * (1 - 0.4 * ease(seg(p.cmp, 0.5, 0.65))), a2 = ease(seg(p.cmp, 0.55, 0.85)) * cmpA;
        rays(d.S0[d.h1], d.e1, P.mot, 0.8 * a1, [4, 3]); rays(d.S0[d.h2], d.e2, P.mot, 0.8 * a2, [4, 3]);
        tagged.push([d.S0[d.h1], a1, 'такой же скан', G.tag1], [d.S0[d.h2], a2, 'другой скан', G.tag2]);
      }
      if (u >= PH.cmp2[0] && u < PH.res2[0]) { const a3 = ease(seg(p.cmp2, 0, 0.4)) * (u < PH.wgt2[0] ? 1 : 1 - p.wgt2); rays(d.S2[d.h3], d.e3, P.mot, 0.8 * a3, [4, 3]); tagged.push([d.S2[d.h3], a3, 'другой скан', G.tag3]); }
      // ---------- частицы: крупная точка и штрих направления; размер — вес ----------
      const dot = (q, rr, a) => { if (a <= 0.02 || rr <= 0.2) return; const w = m(q.x, q.y); c.globalAlpha = fade * a; A.line(c, [w, [w[0] + Math.cos(q.th) * (rr + 6), w[1] + Math.sin(q.th) * (rr + 6)]], P.out, 1.6); A.circle(c, w[0], w[1], rr, P.out, P.surf, 1.2); c.globalAlpha = fade; };
      const R0 = G.dot, RW = (w, mx) => G.dot * (0.35 + 1.25 * Math.sqrt(w / mx));
      if (u < PH.res[0]) {
        const g = ease(p.wgt);
        d.order.forEach((i, n) => { const a = clamp((p.scat * N - n) * 1.2, 0, 1); dot(d.S0[i], lerp(R0, RW(d.W1[i], d.mx1), g), a); });
      } else if (u < PH.move[0]) {
        const g1 = ease(seg(p.res, 0, 0.4)), g2 = ease(seg(p.res, 0.45, 1));
        d.S0.forEach((q, i) => { const f = Math.sqrt(d.W1[i] / d.mx1), keep = f > 0.2; dot(q, RW(d.W1[i], d.mx1) * (keep ? 1 : 1 - g1), keep ? 1 - g2 : 1 - g1); });
        d.S1.forEach((q, i) => { const pa = d.S0[d.par1[i]]; dot({ x: lerp(pa.x, q.x, g2), y: lerp(pa.y, q.y, g2), th: q.th }, R0, g2); });
      } else if (u < PH.scan2[0]) {
        const g = ease(p.move);
        d.S1.forEach((q, i) => { const e = d.S2[i]; dot({ x: lerp(q.x, e.x, g), y: lerp(q.y, e.y, g), th: lerp(q.th, e.th, g) }, R0, 1); });
      } else if (u < PH.res2[0]) {
        const g = ease(p.wgt2);
        d.S2.forEach((q, i) => dot(q, lerp(R0, RW(d.W2[i], d.mx2), g), 1));
      } else {
        const g1 = ease(seg(p.res2, 0, 0.4)), g2 = ease(seg(p.res2, 0.45, 1));
        d.S2.forEach((q, i) => { const f = Math.sqrt(d.W2[i] / d.mx2), keep = f > 0.2; dot(q, RW(d.W2[i], d.mx2) * (keep ? 1 : 1 - g1), keep ? 1 - g2 : 1 - g1); });
        d.S3.forEach((q, i) => { const pa = d.S2[d.par2[i]]; dot({ x: lerp(pa.x, q.x, g2), y: lerp(pa.y, q.y, g2), th: q.th }, R0, g2); });
      }
      ada(c, ...m(ap.x, ap.y), ap.th, 18 * sc, P.ink, 0.8);
      // метки частиц, чьи сканы сравниваем, — поверх облаков
      for (const [pt, a, lab2, off] of tagged) {
        if (a <= 0) continue; const q = m(pt.x, pt.y); c.globalAlpha = fade * a;
        A.circle(c, q[0], q[1], 10, null, P.mot, 2);
        txt(c, k, lab2, q[0] + off[0], q[1] + off[1], 120, { px: 11, weight: 800, color: P.mot, align: off[2] || 'center', halo: true, haloColor: P.surf });
        c.globalAlpha = fade;
      }
      // ---------- легенда ----------
      G.leg.forEach(([x, y, kind, lab2]) => {
        if (kind === 'dot') { A.circle(c, x + 4, y, 3, P.out, P.surf, 1); A.circle(c, x + 18, y, 6, P.out, P.surf, 1.2); }
        else if (kind === 'ray') A.line(c, [[x, y], [x + 22, y]], A.alpha(P.out, 0.8), 1.6);
        else if (kind === 'exp') A.line(c, [[x, y], [x + 22, y]], P.mot, 1.6, [4, 3]);
        else ada(c, x + 10, y, 0, 8, P.ink, 0.85);
        txt(c, k, lab2, x + 30, y, G.legW, { px: 10.5, weight: 650, color: P.ink2, align: 'left' });
      });
      c.globalAlpha = 1;
    }
    window.__anim04 = Object.assign(window.__anim04 || {}, { pf: data, pfA0: A0, pfA1: A1 });   // для проверок урока
    Anim.add('pf-cycle', {
      W: 720, H: 424, start: 22.6, narrowAt: 700,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          W: 720, pills: [14, 12, 692, 28], cap: [14, 58, 692], capPx: 13.5,
          plan: [150, 104, 0.7], dot: 5.2, rooms: [['спальня', 8, 184, 'left'], ['спальня', 8, 388, 'left'], ['гостиная', 300, 20], ['кухня', 470, 228]],
          tag1: [16, -14, 'left'], tag2: [0, 19], tag3: [18, -22, 'left'],
          leg: [[60, 406, 'dot', 'частица: чем крупнее, тем больше вес'], [330, 406, 'ray', 'лучи лидара Ады'], [480, 406, 'exp', 'скан частицы'], [610, 406, 'ada', 'Ада']], legW: 230,
        });
      },
      narrow: {
        W: 360, H: 452,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            W: 360, pills: [26, 26, 30], cap: [14, 54, 332], capPx: 12.5,
            plan: [14, 126, 332 / 600], dot: 4.6, rooms: [['спальня', 8, 184, 'left'], ['спальня', 8, 388, 'left'], ['гостиная', 300, 22], ['кухня', 470, 228]],
            tag1: [14, -13, 'left'], tag2: [0, 18], tag3: [16, -20, 'left'],
            leg: [[14, 372, 'dot', 'частица: чем крупнее, тем больше вес'], [14, 394, 'ray', 'лучи лидара Ады'], [190, 394, 'exp', 'скан частицы'], [14, 416, 'ada', 'Ада']], legW: 300,
          });
        },
      },
    });
  })();

  /* =====================================================================
     slam-step — один шаг SLAM изнутри: предсказание позы по колёсам → новый
     скан не ложится на карту → перебор сдвигов и поворотов (как в
     OccMap.match: ±12 см и ±6° с шагом 4 см и 2°, потом точнее) → поправленная
     поза → скан дорисовывает сетку занятости. Карта, скан и перебор — движок
     лаборатории; ошибку предсказания задаём сами.
     ===================================================================== */
  (() => {
    const O = E.OccMap, C = O.C, NX = O.NX, NY = O.NY, NB = O.NB, RMAX = O.RMAX, TS = 141, ERR = { x: -8, y: 8, th: 6 * Math.PI / 180 };   // шаг у двери кухни; ошибку предсказания задаём сами
    const NAMES = ['Предсказание', 'Новый скан', 'Перебор', 'Поправка', 'Карта'];
    const WIN = [220, 40, 360, 280], WX = WIN[2] / C, WY = WIN[3] / C;   // окно карты, см, и его размер в клетках
    /** Оценка позы — как в OccMap.match: сумма размытой занятости карты в концах лучей. */
    function score(f, pose, z) {
      let s = 0; const cs = Math.cos(pose.th), sn = Math.sin(pose.th);
      for (let b = 0; b < NB; b++) { if (z[b] >= RMAX - 1) continue; const a = TAU * b / NB, lx = Math.cos(a) * z[b], ly = Math.sin(a) * z[b], x = pose.x + cs * lx - sn * ly, y = pose.y + sn * lx + cs * ly, i = Math.floor(x / C), j = Math.floor(y / C); if (i >= 0 && j >= 0 && i < NX && j < NY) s += f[j * NX + i]; }
      return s;
    }
    let D = null;
    function data() {
      if (D) return D;
      const r = E.rng(21), m = O.newMap(), z = new Float32Array(NB);
      const scanAt = (s, out) => { HS.scan(s.x, s.y, s.th, NB, RMAX, out); for (let b = 0; b < NB; b++) out[b] = out[b] >= RMAX ? RMAX : out[b] + E.randn(r) * 1.5; return out; };
      for (let t = 0; t < TS; t++) O.integrate(m, O.ROUTE[t], scanAt(O.ROUTE[t], z));    // карта до этого шага: прошлые сканы из уже поправленных поз
      const prev = O.ROUTE[TS - 1], s = O.ROUTE[TS], zz = scanAt(s, new Float32Array(NB));
      const f = O.field(m), pred = { x: s.x + ERR.x, y: s.y + ERR.y, th: s.th + ERR.th };
      // грубый перебор: 7 поворотов × 7 × 7 сдвигов, порядок как в OccMap.match
      let best = pred, bs = score(f, pred, zz); const grids = [], top = [];
      for (let a = -3; a <= 3; a++) { const g = []; for (let u = -3; u <= 3; u++) for (let v = -3; v <= 3; v++) { const q = { x: pred.x + u * 4, y: pred.y + v * 4, th: pred.th + a * 0.035 }, sc = score(f, q, zz); g.push(sc); if (sc > bs + 1e-9) { bs = sc; best = q; } } grids.push(g); top.push(Math.max(...g)); }
      const mid = best, midA = Math.round((mid.th - pred.th) / 0.035), midU = Math.round((mid.x - pred.x) / 4), midV = Math.round((mid.y - pred.y) / 4);
      // точный перебор вокруг лучшей позы: 5 поворотов × 5 × 5 сдвигов
      const fine = [];
      for (let a = -2; a <= 2; a++) { const g = []; for (let u = -2; u <= 2; u++) for (let v = -2; v <= 2; v++) { const q = { x: mid.x + u * 1.5, y: mid.y + v * 1.5, th: mid.th + a * 0.01 }, sc = score(f, q, zz); g.push(sc); if (sc > bs + 1e-9) { bs = sc; best = q; } } fine.push(g); }
      const fA = Math.round((best.th - mid.th) / 0.01), fU = Math.round((best.x - mid.x) / 1.5), fV = Math.round((best.y - mid.y) / 1.5);
      const m2 = Float32Array.from(m); O.integrate(m2, best, zz);
      // клетки окна, которые обновил скан, и их направление от Ады — для развёртки
      const changed = [];
      for (let j = 0; j < WY; j++) for (let i = 0; i < WX; i++) { const kk = (j + WIN[1] / C) * NX + i + WIN[0] / C; if (m2[kk] !== m[kk]) { const cx = (i + 0.5) * C + WIN[0], cy = (j + 0.5) * C + WIN[1]; changed.push([i, j, ((Math.atan2(cy - best.y, cx - best.x) - best.th + 3 * Math.PI) % TAU) / TAU]); } }
      const all = grids.flat(), lo = Math.min(...all), hi = Math.max(...all, ...fine.flat());
      return (D = { m, m2, z: zz, prev, s, pred, mid, best, grids, top, fine, midA, midU, midV, fA, fU, fV, changed, lo, hi, match: O.match(f, pred, zz), sc0: score(f, pred, zz), sc1: bs });
    }
    const rgbOf = (col) => { const s = String(col).trim(); if (s[0] === '#') { const n = parseInt(s.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } const q = s.match(/[\d.]+/g); return q ? [+q[0], +q[1], +q[2]] : [128, 128, 128]; };
    let off = null;
    /** Окно сетки занятости: цвета как в лаборатории (серое — неизвестно, светлое — свободно, тёмное — препятствие);
     *  upd — доля развёртки обновления по направлению от Ады. */
    function paint(P, d, upd) {
      if (!off) { off = document.createElement('canvas'); off.width = WX; off.height = WY; }
      const cx = off.getContext('2d'), img = cx.createImageData(WX, WY), fr = rgbOf(P.surf), oc = rgbOf(P.ink), un = rgbOf(K.css('--muted'));
      const val = new Float32Array(WX * WY);
      for (let j = 0; j < WY; j++) for (let i = 0; i < WX; i++) val[j * WX + i] = d.m[(j + WIN[1] / C) * NX + i + WIN[0] / C];
      if (upd > 0) for (const [i, j, b] of d.changed) if (b <= upd) val[j * WX + i] = d.m2[(j + WIN[1] / C) * NX + i + WIN[0] / C];
      for (let q = 0; q < WX * WY; q++) {
        const pr = 1 / (1 + Math.exp(-val[q])), t = Math.abs(pr - 0.5) * 2, to = pr >= 0.5 ? oc : fr;
        for (let ch = 0; ch < 3; ch++) img.data[4 * q + ch] = un[ch] + (to[ch] - un[ch]) * t;
        img.data[4 * q + 3] = 255;
      }
      cx.putImageData(img, 0, 0); return off;
    }
    const PH = { pred: [0.3, 2.8], scan: [3.0, 4.8], coarse: [5.0, 10.6], best: [10.6, 11.4], fine: [11.6, 13.2], corr: [13.4, 14.8], upd: [15.0, 18.0], fade: [21.6, 22.4] }, T = 22.4;
    const lerpPose = (A, a, b, f) => ({ x: A.lerp(a.x, b.x, f), y: A.lerp(a.y, b.y, f), th: a.th + E.wrapA(b.th - a.th) * f });
    const deg = (a) => { const v = Math.round(a * 180 / Math.PI); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '°'; };
    function draw(c, k, t0, P, A, G) {
      const { seg, ease } = A, u = ((t0 % T) + T) % T, fade = 1 - seg(u, ...PH.fade), d = data();
      c.globalAlpha = fade;
      const p = {}; for (const key of Object.keys(PH)) p[key] = seg(u, ...PH[key]);
      const stage = u < PH.scan[0] ? 0 : u < PH.coarse[0] ? 1 : u < PH.corr[0] ? 2 : u < PH.upd[0] ? 3 : 4;
      pills(c, k, A, P, G, stage, NAMES, P.out);
      const cap = u < PH.scan[0] ? 'Колёса говорят, куда Ада сдвинулась с прошлого шага. Это предсказание позы, и оно немного ошибается.'
        : u < PH.coarse[0] ? 'Новый скан нанесён из предсказанной позы и не ложится на стены, которые уже есть на карте.'
        : u < PH.best[1] ? 'Сопоставление: перебираем сдвиги до ±12 см и повороты до ±6°. Для каждой позы считаем, насколько концы лучей попадают в известные стены.'
        : u < PH.corr[0] ? 'Вокруг лучшей позы перебор повторяют точнее: сдвиги через 1,5 см, повороты через 0,6°.'
        : u < PH.upd[0] ? 'Поза, при которой скан лёг на карту лучше всего, становится поправленной позой Ады.'
        : u < PH.upd[1] + 0.4 ? 'Из поправленной позы скан дорисовывает карту: клетки вдоль лучей отмечаются как свободные, а клетки в концах лучей отмечаются как занятые.'
        : 'Так проходит каждый шаг SLAM: карта поправляет позу, а поправленная поза дорисовывает карту.';
      txt(c, k, cap, G.cap[0], G.cap[1], G.cap[2], { px: G.capPx, weight: 750, color: P.ink, align: 'left', wrap: true, lh: 1.32, top: true });
      // ---------- окно карты ----------
      const [mx, my, ms] = G.map, mw = WIN[2] * ms, mh = WIN[3] * ms, mp = (x, y) => [mx + (x - WIN[0]) * ms, my + (y - WIN[1]) * ms];
      c.imageSmoothingEnabled = false; c.drawImage(paint(P, d, ease(p.upd)), mx, my, mw, mh); c.imageSmoothingEnabled = true;
      if (p.upd > 0) {                                                    // клетки, которые обновил скан, ненадолго подсвечены
        const sw = ease(p.upd), glow = 1 - seg(u, PH.upd[1], PH.upd[1] + 1.6), cw = C * ms;
        c.fillStyle = P.out;
        for (const [i, j, b] of d.changed) { if (b > sw) continue; c.globalAlpha = fade * 0.32 * glow * (p.upd < 1 ? clamp((sw - b) * 6, 0, 1) : 1); c.fillRect(mx + i * cw, my + j * cw, cw, cw); }
        c.globalAlpha = fade;
      }
      A.rect(c, mx, my, mw, mh, 3, null, P.line, 1);
      // какая поза у скана сейчас: предсказанная, кандидат перебора, лучшая, поправленная
      const nA = 7, nC = 49, cPer = (PH.coarse[1] - PH.coarse[0]) / nA;
      let cand = d.pred, ai = -1, ci = -1;
      if (u >= PH.coarse[0] && u < PH.coarse[1]) { ai = Math.min(nA - 1, Math.floor((u - PH.coarse[0]) / cPer)); ci = Math.min(nC - 1, Math.floor(((u - PH.coarse[0]) % cPer) / cPer * nC)); const uu = Math.floor(ci / 7) - 3, vv = (ci % 7) - 3; cand = { x: d.pred.x + uu * 4, y: d.pred.y + vv * 4, th: d.pred.th + (ai - 3) * 0.035 }; }
      else if (u >= PH.coarse[1] && u < PH.fine[0]) cand = d.mid;
      else if (u >= PH.fine[0] && u < PH.corr[0]) cand = lerpPose(A, d.mid, d.best, ease(p.fine));
      else if (u >= PH.corr[0]) cand = d.best;
      // Ада: прошлая поза, предсказанная (оранжевая), поправленная (синяя)
      const prevA = stage === 0 ? 1 - 0.6 * ease(p.pred) : 0.4;
      ada(c, ...mp(d.prev.x, d.prev.y), d.prev.th, 18 * ms, P.ink3, prevA * (u < PH.upd[0] ? 1 : 1 - p.upd));
      const pa = u < PH.scan[0] ? lerpPose(A, d.prev, d.pred, ease(p.pred)) : d.pred;
      if (u < PH.corr[1]) ada(c, ...mp(pa.x, pa.y), pa.th, 18 * ms, P.mot, u < PH.corr[0] ? 1 : 1 - 0.6 * p.corr);
      if (u >= PH.corr[0]) { const q = lerpPose(A, d.pred, d.best, ease(p.corr)); ada(c, ...mp(q.x, q.y), q.th, 18 * ms, P.out, 1); }
      // точки нового скана: оранжевые, пока поза не поправлена; потом синие
      if (u >= PH.scan[0] && u < PH.upd[1] + 0.4) {
        const shown = u < PH.coarse[0] ? Math.ceil(p.scan * NB) : NB, q0 = u >= PH.corr[0] ? lerpPose(A, d.pred, d.best, ease(p.corr)) : cand;
        const col = u >= PH.corr[1] ? P.out : P.mot, cs = Math.cos(q0.th), sn = Math.sin(q0.th), sz = 4;
        const o0 = mp(q0.x, q0.y), ends = [];
        for (let b = 0; b < shown; b++) { if (d.z[b] >= RMAX - 1) continue; const a = TAU * b / NB, lx = Math.cos(a) * d.z[b], ly = Math.sin(a) * d.z[b], w = mp(q0.x + cs * lx - sn * ly, q0.y + sn * lx + cs * ly); if (w[0] < mx || w[1] < my || w[0] > mx + mw || w[1] > my + mh) continue; ends.push(w); }
        if (u < PH.corr[1]) { c.globalAlpha = fade * 0.22; for (const w of ends) A.line(c, [o0, w], col, 1); }   // лучи из позы, от которой нанесён скан
        c.globalAlpha = fade * (u >= PH.upd[0] ? 1 - 0.7 * p.upd : 1); c.fillStyle = col;
        for (const w of ends) c.fillRect(w[0] - sz / 2, w[1] - sz / 2, sz, sz);
        c.globalAlpha = fade;
      }
      // ---------- перебор: квадрат сдвигов и столбики поворотов ----------
      const S = G.search, nrm = (v) => clamp((v - d.lo) / (d.hi - d.lo), 0, 1);
      txt(c, k, 'оценка совпадения', S.x, S.ty, S.w, { px: 11, weight: 750, color: P.ink, align: 'left' });
      const fineOn = u >= PH.fine[0], g = fineOn ? d.fine[d.fA + 2] : ai >= 0 ? d.grids[ai] : u >= PH.coarse[1] ? d.grids[d.midA + 3] : null, nn = fineOn ? 5 : 7, cell = S.hs / nn;
      for (let ii = 0; ii < nn; ii++) for (let jj = 0; jj < nn; jj++) {
        const idx = ii * nn + jj, x = S.hx + ii * cell, y = S.hy + jj * cell, filled = g && (fineOn || ai < 0 || idx <= ci);
        A.rect(c, x + 1, y + 1, cell - 2, cell - 2, 3, filled ? A.alpha(P.out, 0.08 + 0.86 * nrm(g[idx])) : P.surf, P.line, 1);
        if (idx === ci && ai >= 0) A.rect(c, x + 1, y + 1, cell - 2, cell - 2, 3, null, P.mot, 2);
      }
      const ring = fineOn ? [d.fU + 2, d.fV + 2] : u >= PH.coarse[1] ? [d.midU + 3, d.midV + 3] : null;
      if (ring) A.rect(c, S.hx + ring[0] * cell - 1, S.hy + ring[1] * cell - 1, cell + 2, cell + 2, 4, null, P.mot, 2.4);
      txt(c, k, fineOn ? 'точнее: шаг 1,5 см' : 'сдвиги до ±12 см', S.hx + S.hs / 2, S.hy + S.hs + 12, S.hs + 40, { px: 10.5, weight: 650, color: P.ink2 });
      if (ai >= 0 || u >= PH.coarse[1]) txt(c, k, 'поворот ' + (fineOn ? deg(d.best.th - d.pred.th) : deg(((ai >= 0 ? ai : d.midA + 3) - 3) * 0.035)), S.hx + S.hs / 2, S.hy - 10, S.hs + 40, { px: 10.5, weight: 700, color: P.mot });
      txt(c, k, 'лучшее по поворотам', S.bx + S.bw, S.by - 12, S.bw + 60, { px: 10.5, weight: 650, color: P.ink2, align: 'right' });
      for (let a = 0; a < 7; a++) {
        const y = S.by + a * S.bh, done = u >= PH.coarse[1] || (ai >= 0 && a < ai), on = a === ai || (!fineOn && u >= PH.coarse[1] && a === d.midA + 3);
        txt(c, k, deg((a - 3) * 0.035), S.bx + 26, y + S.bh / 2, 30, { px: 10, mono: true, color: on ? P.mot : P.ink3, align: 'right' });
        A.rect(c, S.bx + 32, y + 3, S.bw - 32, S.bh - 6, 2, P.surf, P.line, 1);
        const val = done ? d.top[a] : a === ai && ci >= 0 ? Math.max(...d.grids[a].slice(0, ci + 1)) : null;
        if (val != null) A.rect(c, S.bx + 32, y + 3, (S.bw - 32) * nrm(val), S.bh - 6, 2, on ? P.mot : A.alpha(P.out, 0.7), null);
      }
      // ---------- легенда карты ----------
      const swatch = (x, y, col) => A.rect(c, x, y - 6, 14, 12, 2, col, P.line, 1);
      G.leg.forEach(([x, y, kind, lab2]) => {
        if (kind === 'unk') swatch(x, y, K.css('--muted')); else if (kind === 'free') swatch(x, y, P.surf); else if (kind === 'occ') swatch(x, y, P.ink);
        else { c.fillStyle = P.mot; c.fillRect(x + 4, y - 2, 3, 3); c.fillRect(x + 9, y - 1, 3, 3); }
        txt(c, k, lab2, x + 20, y, 140, { px: 10.5, weight: 650, color: P.ink2, align: 'left' });
      });
      c.globalAlpha = 1;
    }
    window.__anim04 = Object.assign(window.__anim04 || {}, { slam: data });   // для проверок урока
    Anim.add('slam-step', {
      W: 720, H: 444, start: 19.5, narrowAt: 700,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          W: 720, pills: [14, 12, 692, 28], cap: [14, 58, 692], capPx: 13.5,
          map: [14, 104, 1.05],
          search: { x: 412, ty: 114, w: 290, hx: 430, hy: 150, hs: 154, bx: 604, by: 150, bw: 100, bh: 22 },
          leg: [[14, 416, 'unk', 'неизвестно'], [124, 416, 'free', 'свободно'], [224, 416, 'occ', 'препятствие'], [350, 416, 'scan', 'новый скан']],
        });
      },
      narrow: {
        W: 360, H: 628,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            W: 360, pills: [26, 26, 30], cap: [14, 54, 332], capPx: 12.5,
            map: [14, 128, 332 / 360],
            search: { x: 14, ty: 404, w: 332, hx: 28, hy: 438, hs: 132, bx: 196, by: 438, bw: 150, bh: 19 },
            leg: [[14, 600, 'unk', 'неизвестно'], [116, 600, 'free', 'свободно'], [212, 600, 'occ', 'препятствие'], [14, 620, 'scan', 'новый скан']],
          });
        },
      },
    });
  })();
})();
