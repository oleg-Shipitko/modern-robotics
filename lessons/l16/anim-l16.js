/* =====================================================================
   anim-l16.js — анимированные схемы урока 1.6 (shared/anim.js):
     tf    — трансформер целиком на примере π0: входы → токены → позиции →
             слой (внимание и полносвязный слой) × 18 → поправка к черновику
             пачки, 10 шагов flow с наблюдением из KV-кэша → пачка роботу;
     attn  — внимание по шагам: запрос сравнивается с ключами (q·k) →
             softmax даёт веса → ответ — смесь значений, мест на столе;
             два запроса по очереди, как в миссиях 1 и 2 лаборатории;
     sat   — почему схлопнутый softmax плохо учится: оценку чашки двигают
             на ±1,5, в рабочем диапазоне её вес меняется, при d_k = 256 без
             деления — нет;
     heads — две головы: «цвет» и «место» видят разные признаки предметов,
             вместе выделяют чашку;
     pe    — позиционная кодировка: восемь пар чисел, каждая пара — стрелка,
             которая поворачивается со своей скоростью; сходство с местом 0.
   Числа берутся из движка урока (l16/engine.js, window.T16).
   ===================================================================== */
'use strict';
(function () {
  if (typeof Anim === 'undefined' || !window.T16) return;
  const E = window.T16, ITEMS = E.ITEMS, K = HeroKit;
  const css = (n) => K.css(n);
  const TAU = Math.PI * 2;
  const rgbOf = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;
  const fx = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
  const polar = (deg, L) => [L * Math.cos(deg * Math.PI / 180), L * Math.sin(deg * Math.PI / 180)];
  const softmax = (s) => E.softmax(s);
  /** Разбить текст на строки не шире maxW (в логических единицах канваса). */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight);
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function para(c, k, A, text, x, y, maxW, o) {
    o = o || {}; const px = o.px || 11.5, lh = o.lh || px * 1.35 * k;
    wrap(c, k, text, maxW, px, o.weight).forEach((ln, i) => A.lab(c, k, ln, x, y + i * lh, Object.assign({ px, align: 'center' }, o)));
  }
  const tk = () => ({ img: css('--tk-img'), txt: css('--tk-txt'), st: css('--tk-st'), act: css('--tk-act'), h2: css('--h2') });
  /** Предмет со стола: кружок цвета предмета. */
  function dot(c, x, y, r, it, P) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = rgbOf(it.col); c.fill(); c.lineWidth = 1.2; c.strokeStyle = it.color === 'white' ? P.ink3 : 'rgba(0,0,0,0.25)'; c.stroke(); }
  /** Мини-стол сверху: доска, предметы по местам. */
  function table(c, x, y, s, P, A) {
    A.rect(c, x, y, s, s, 8, P.dark ? '#5a4a36' : '#e3d3b6', P.dark ? '#6b5a44' : '#cdb894', 1.2);
    c.fillStyle = P.dark ? 'rgba(0,0,0,0.25)' : 'rgba(60,35,10,0.12)'; c.fillRect(x + 1, y + s * 0.955, s - 2, s * 0.04);
  }

  /* =====================================================================
     attn — внимание по шагам
     ===================================================================== */
  (() => {
    const QS = [
      { q: polar(24.2, 2.4), cap: 'Длинный запрос смотрит на чашку: у неё самая большая оценка, и ответ — почти место чашки.' },
      { q: polar(60, 1.6), cap: 'Запрос между чашкой и миской: веса делятся пополам, и ответ ложится между ними, на пустое место.' },
    ];
    const R = QS.map((s) => E.attend({ head: 'gen', q: s.q, dk: 2, div: false }));
    const CYC = 9.5, T = CYC * QS.length, PH = { p1: [0.2, 2.9], p2: [3.1, 4.6], p3: [4.8, 6.6] };
    const PR = 3.2;
    function draw(G) {
      return (c, k, t, P, A) => {
        const { seg, ease, lab, rect, line, arrow, lerp } = A;
        const u = ((t % T) + T) % T, qi = Math.floor(u / CYC), v = u - qi * CYC, Q = QS[qi].q, r = R[qi];
        const p1 = seg(v, ...PH.p1), p2 = ease(seg(v, ...PH.p2)), p3 = ease(seg(v, ...PH.p3));
        const step = (i) => seg(p1, i / 6, (i + 0.85) / 6); // как далеко прошло сравнение с ключом i
        const smax = Math.max(...r.scores.map(Math.abs));
        // ---------- 1. плоскость ключей ----------
        const [px0, py0, ps] = G.plane, pm = (x, y) => [px0 + ps / 2 + x / PR * ps / 2, py0 + ps / 2 - y / PR * ps / 2];
        lab(c, k, G.t1, G.t1x, G.t1y, { px: 12, weight: 750, color: P.ink, halo: false });
        rect(c, px0, py0, ps, ps, 8, P.surf, P.grid, 1);
        line(c, [[px0 + ps / 2, py0 + 6], [px0 + ps / 2, py0 + ps - 6]], P.grid, 1); line(c, [[px0 + 6, py0 + ps / 2], [px0 + ps - 6, py0 + ps / 2]], P.grid, 1);
        const o = pm(0, 0), qL = Math.hypot(Q[0], Q[1]), qu = [Q[0] / qL, Q[1] / qL];
        // прямая вдоль запроса — на неё падают проекции ключей
        line(c, [pm(-qu[0] * PR, -qu[1] * PR), pm(qu[0] * PR, qu[1] * PR)], A.alpha(P.mot, 0.25), 1, [4, 4]);
        E.KEYS.gen.forEach((kv, i) => {
          const tip = pm(kv[0], kv[1]); arrow(c, o[0], o[1], tip[0], tip[1], P.ink3, 2, 7);
          dot(c, tip[0], tip[1], 5, ITEMS[i], P);
          const s = step(i);
          if (s > 0) {
            const pr = kv[0] * qu[0] + kv[1] * qu[1], foot = pm(qu[0] * pr, qu[1] * pr);
            const cur = [lerp(tip[0], foot[0], s), lerp(tip[1], foot[1], s)];
            line(c, [tip, cur], rgbOf(ITEMS[i].col, 0.9), 1.6, [3, 3]);
            if (s >= 1) { c.beginPath(); c.arc(foot[0], foot[1], 3, 0, TAU); c.fillStyle = rgbOf(ITEMS[i].col); c.fill(); }
          }
          const nameAt = pm(kv[0] * 1.32, kv[1] * 1.32);
          lab(c, k, ITEMS[i].name, nameAt[0], nameAt[1], { px: 10, color: P.ink2, haloColor: P.surf });
        });
        const qt = pm(Q[0], Q[1]); arrow(c, o[0], o[1], qt[0], qt[1], P.mot, 3.6, 11);
        const ql = pm(Q[0] + qu[0] * 0.32, Q[1] + qu[1] * 0.32);
        lab(c, k, 'q', ql[0], ql[1], { px: 13, weight: 800, color: P.mot, haloColor: P.surf });
        lab(c, k, 'серые стрелки — ключи k, оранжевая — запрос q', px0 + ps / 2, py0 + ps + 13, { px: 10.5, color: P.ink3, halo: false });
        // ---------- 2. оценки и веса ----------
        const [bx, by, bw, rh] = G.bars, nameW = G.nameW, bar0 = bx + nameW, barW = bw - nameW - 44, mid = bar0 + barW / 2;
        lab(c, k, p2 > 0.5 ? G.t2b : G.t2a, G.t2x, G.t2y, { px: 12, weight: 750, color: P.ink, halo: false });
        ITEMS.forEach((it, i) => {
          const y = by + i * rh;
          dot(c, bx + 6, y, 5, it, P); lab(c, k, it.name, bx + 15, y, { px: 11, color: P.ink2, align: 'left', halo: false });
          rect(c, bar0, y - 7, barW, 14, 4, P.surf, P.grid, 1);
          const sc = r.scores[i] * step(i), wv = r.w[i];
          // оценка: столбик от середины; вес: столбик от левого края. p2 переводит одно в другое
          const sx0 = sc >= 0 ? mid : mid + sc / smax * barW / 2, sw = Math.abs(sc) / smax * barW / 2;
          const x0 = lerp(sx0, bar0, p2), w = lerp(sw, wv * barW, p2);
          if (w > 0.3) rect(c, x0, y - 6, w, 12, 3, p2 > 0.5 ? P.mot : rgbOf(it.col, 0.85), null);
          if (p2 < 0.5) line(c, [[mid, y - 9], [mid, y + 9]], P.ink3, 1);
          const val = p2 > 0.5 ? fx(wv, 2) : step(i) >= 1 ? fx(r.scores[i], 1) : '';
          if (val) lab(c, k, val, bx + bw, y, { px: 11, mono: true, color: P.ink, align: 'right', halo: false });
        });
        const fy = by + 6 * rh - 4;
        if (p2 > 0.5) lab(c, k, 'веса в сумме дают 1', bar0 + barW / 2, fy, { px: 10.5, color: P.ink3, halo: false });
        else if (p1 > 0) lab(c, k, 'q·k = длина запроса × проекция ключа', bx + bw / 2, fy, { px: 10.5, color: P.ink3, halo: false });
        // ---------- 3. смесь значений на столе ----------
        const [tx0, ty0, ts] = G.table, tm = (it) => [tx0 + it.x * ts, ty0 + it.y * ts];
        lab(c, k, G.t3, G.t3x, G.t3y, { px: 12, weight: 750, color: P.ink, halo: false });
        table(c, tx0, ty0, ts, P, A);
        const ans = [lerp(tx0 + ts * 0.5, tx0 + r.out.x * ts, p3), lerp(ty0 + ts * 0.5, ty0 + r.out.y * ts, p3)];
        ITEMS.forEach((it, i) => {
          const [x, y] = tm(it), wv = r.w[i];
          if (p3 > 0 && wv > 0.02) line(c, [[x, y], ans], A.alpha(P.mot, 0.25 + 0.6 * wv), (1 + 6 * wv) * p3);
          dot(c, x, y, 8, it, P);
          if (p3 > 0) { c.beginPath(); c.arc(x, y, 11 + 2 * wv, 0, TAU); c.strokeStyle = A.alpha(P.mot, 0.3 + 0.7 * wv); c.lineWidth = (1 + 7 * wv) * p3; c.stroke(); }
        });
        if (p3 > 0) {
          c.strokeStyle = P.ink; c.lineWidth = 2.6;
          c.beginPath(); c.moveTo(ans[0] - 8, ans[1]); c.lineTo(ans[0] + 8, ans[1]); c.moveTo(ans[0], ans[1] - 8); c.lineTo(ans[0], ans[1] + 8); c.stroke();
          lab(c, k, 'ответ', ans[0] + 12, ans[1] - 10, { px: 11, weight: 750, color: P.dark ? '#fff' : P.ink, align: 'left', haloColor: P.dark ? '#5a4a36' : '#efe3cc' });
        }
        lab(c, k, 'точки — значения v: места предметов', tx0 + ts / 2, ty0 + ts + 13, { px: 10.5, color: P.ink3, halo: false });
        // ---------- подпись к текущему запросу ----------
        para(c, k, A, `${qi + 1} из 2. ${QS[qi].cap}`, G.cap[0], G.cap[1], G.cap[2], { px: 11.5, weight: 600, color: P.ink2, halo: false });
      };
    }
    Anim.add('attn', {
      W: 720, H: 336, start: 6.2, narrowAt: 600,
      draw: draw({ plane: [14, 40, 226], t1: '1. Запрос сравнивается с ключами', t1x: 127, t1y: 18,
        bars: [254, 70, 216, 30], nameW: 94, t2a: '2. Оценки q·k', t2b: '2. Softmax: оценки → веса', t2x: 362, t2y: 18,
        table: [482, 40, 226], t3: '3. Ответ — смесь значений', t3x: 595, t3y: 18, cap: [360, 302, 680] }),
      narrow: { W: 360, H: 900,
        draw: draw({ plane: [40, 34, 280], t1: '1. Запрос сравнивается с ключами', t1x: 180, t1y: 16,
          bars: [24, 372, 312, 30], nameW: 100, t2a: '2. Оценки q·k', t2b: '2. Softmax: оценки → веса', t2x: 180, t2y: 346,
          table: [60, 590, 240], t3: '3. Ответ — смесь значений', t3x: 180, t3y: 566, cap: [180, 862, 320] }) },
    });
  })();

  /* =====================================================================
     sat — почему схлопнутый softmax плохо учится
     ===================================================================== */
  (() => {
    const Q0 = [-0.7, -0.55], CUP = 0, AMP = 1.5, PER = 4;
    const base = [false, true].map((div) => E.attend({ head: 'gen', q: Q0, dk: 256, div }).scores);
    const rows = [
      { sc: base[1], title: 'Оценки в рабочем диапазоне: делим на √d_k' },
      { sc: base[0], title: 'Оценки разбежались: d_k = 256 без деления' },
    ];
    const range = rows.map((R) => { const lo = R.sc.slice(), hi = R.sc.slice(); lo[CUP] -= AMP; hi[CUP] += AMP; return [softmax(lo)[CUP], softmax(hi)[CUP]]; });
    Anim.add('sat', {
      W: 400, H: 356, start: 1,
      draw(c, k, t, P, A) {
        const { lab, rect, arrow } = A, d = AMP * Math.sin(TAU * t / PER);
        rows.forEach((R, b) => {
          const y0 = 6 + b * 176, sc = R.sc.slice(); sc[CUP] += d; const w = softmax(sc);
          lab(c, k, R.title, 200, y0 + 12, { px: 12, weight: 750, color: P.ink, halo: false });
          ITEMS.forEach((it, i) => {
            const y = y0 + 36 + i * 19, bx = 104, bw = 214;
            dot(c, 12, y, 4.5, it, P); lab(c, k, it.name, 21, y, { px: 10.5, color: i === CUP ? P.ink : P.ink2, weight: i === CUP ? 750 : 600, align: 'left', halo: false });
            rect(c, bx, y - 6, bw, 12, 3, P.surf, P.grid, 1);
            if (w[i] * bw > 0.4) rect(c, bx, y - 5, w[i] * bw, 10, 3, i === CUP ? P.mot : A.alpha(P.ink3, 0.7), null);
            lab(c, k, fx(w[i], b ? 4 : 2), 392, y, { px: 10.5, mono: true, color: i === CUP ? P.ink : P.ink2, align: 'right', halo: false });
          });
          // стрелка: оценку чашки двигают вверх и вниз
          const ay = y0 + 36, ax = 100 - 16;
          arrow(c, ax, ay, ax + (d >= 0 ? 1 : -1) * 0.1, ay - (d >= 0 ? 1 : -1) * 6, P.mot, 2, 6);
          const [lo, hi] = range[b];
          lab(c, k, `оценка чашки ${d >= 0 ? '+' : '−'}${fx(Math.abs(d), 1)}: вес чашки от ${fx(lo, b ? 4 : 2)} до ${fx(hi, b ? 4 : 2)}`, 200, y0 + 36 + 6 * 19 + 8, { px: 11, weight: 650, color: b ? P.bad : P.good, halo: false });
        });
      },
    });
  })();

  /* =====================================================================
     heads — две головы
     ===================================================================== */
  (() => {
    const WC = E.attend({ head: 'color', q: polar(0, 3), dk: 2 }).w, WP = E.attend({ head: 'place', q: polar(60, 3), dk: 2 }).w;
    const ZONE = { front: 'у края', mid: 'в середине', back: 'в глубине' };
    const T = 11, PH = { a: [0.2, 1.4], c: [1.6, 3.6], p: [3.9, 5.9], m: [6.2, 7.4] };
    Anim.add('heads', {
      W: 400, H: 300, start: 8,
      draw(c, k, t, P, A) {
        const { lab, rect, seg, ease, alpha } = A, u = ((t % T) + T) % T, C2 = tk().h2;
        const pa = seg(u, ...PH.a), pc = ease(seg(u, ...PH.c)), pp = ease(seg(u, ...PH.p)), pm = ease(seg(u, ...PH.m));
        const X1 = 8, X2 = 132, X3 = 262, Y0 = 66, RH = 27;
        lab(c, k, 'Токен', X1 + 40, 14, { px: 11.5, weight: 750, color: P.ink, halo: false });
        lab(c, k, 'Голова «цвет»', X2 + 60, 14, { px: 11.5, weight: 750, color: P.mot, halo: false });
        lab(c, k, 'Голова «место»', X3 + 64, 14, { px: 11.5, weight: 750, color: C2, halo: false });
        lab(c, k, 'цвет и место', X1 + 40, 30, { px: 10, color: P.ink3, halo: false });
        lab(c, k, 'видит только цвет', X2 + 60, 30, { px: 10, color: P.ink3, halo: false });
        lab(c, k, 'запрос: красное', X2 + 60, 43, { px: 10, weight: 650, color: P.mot, halo: false });
        lab(c, k, 'видит только место', X3 + 64, 30, { px: 10, color: P.ink3, halo: false });
        lab(c, k, 'запрос: у края', X3 + 64, 43, { px: 10, weight: 650, color: C2, halo: false });
        ITEMS.forEach((it, i) => {
          const y = Y0 + i * RH, vis = Math.min(1, Math.max(0, pa * 6 - i));
          c.globalAlpha = vis;
          if (pm > 0 && i === 0) rect(c, 2, y - 12, 396, 24, 7, alpha(P.mot, 0.1 * pm), alpha(P.ink, 0.6 * pm), 1.5);
          dot(c, X1 + 6, y, 5, it, P); lab(c, k, it.name, X1 + 15, y, { px: 11, color: P.ink, align: 'left', halo: false });
          // голова «цвет»: свой признак — цвет предмета
          rect(c, X2, y - 6, 12, 12, 3, it.color === 'white' ? '#f2f1ec' : rgbOf(it.col), P.ink3, 1);
          rect(c, X2 + 18, y - 5, 100, 10, 3, P.surf, P.grid, 1);
          if (pc > 0) rect(c, X2 + 18, y - 4, Math.max(0.5, WC[i] * 100 * pc), 8, 3, P.mot, null);
          // голова «место»: свой признак — где стоит предмет
          lab(c, k, ZONE[it.zone], X3, y, { px: 9.5, color: P.ink2, align: 'left', halo: false });
          rect(c, X3 + 66, y - 5, 64, 10, 3, P.surf, P.grid, 1);
          if (pp > 0) rect(c, X3 + 66, y - 4, Math.max(0.5, WP[i] * 64 * pp), 8, 3, C2, null);
          c.globalAlpha = 1;
        });
        const yb = Y0 + 6 * RH - 4;
        if (pc > 0.5) lab(c, k, 'чашка = чайник', X2 + 68, yb, { px: 10, weight: 650, color: P.mot, halo: false });
        if (pp > 0.5) lab(c, k, 'чашка = миска', X3 + 98, yb, { px: 10, weight: 650, color: C2, halo: false });
        rect(c, 8, yb + 14, 384, 48, 9, alpha(P.ink3, 0.08 + 0.08 * pm), pm > 0 ? P.ink2 : P.grid, 1.2);
        lab(c, k, 'выходы голов склеивают', 200, yb + 28, { px: 10.5, color: P.ink2, halo: false });
        lab(c, k, pm > 0.3 ? 'вместе: красное и у края — это чашка' : 'по отдельности каждая путает чашку', 200, yb + 47, { px: 11.5, weight: 750, color: pm > 0.3 ? P.ink : P.ink3, halo: false });
      },
    });
  })();

  /* =====================================================================
     pe — позиционная кодировка
     ===================================================================== */
  (() => {
    const D = 16, NP = 24, OM = Array.from({ length: D / 2 }, (_, i) => Math.pow(10000, -2 * i / D));
    const SIM = Array.from({ length: NP }, (_, p) => E.Pos.peSim(0, p));
    const lo = Math.min(...SIM);
    const STEP = 0.55, T = 2 * NP * STEP; // туда и обратно по местам 0…23
    function posAt(t) {
      const u = ((t % T) + T) % T, f = u / STEP, n = Math.floor(f), fr = Math.min(1, (f - n) / 0.45);
      const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2;
      const seq = (j) => (j < NP ? j : 2 * NP - 1 - j); // 0…23, потом 23…0
      const a = seq(n % (2 * NP)), b = seq((n + 1) % (2 * NP));
      return { p: a + (b - a) * ease(fr), at: a };
    }
    function draw(G) {
      return (c, k, t, P, A) => {
        const { lab, rect, line, circle } = A, { p } = posAt(t), at = Math.round(p), C2 = tk().h2;
        // линейка мест
        const [rx0, ry, rw] = G.ruler, rx = (q) => rx0 + q / (NP - 1) * rw;
        lab(c, k, G.t1, G.t1x, G.t1y, { px: 12, weight: 750, color: P.ink, halo: false });
        line(c, [[rx0 - 4, ry], [rx0 + rw + 4, ry]], P.line, 1.2);
        for (let q = 0; q < NP; q++) { line(c, [[rx(q), ry - (q % 5 === 0 ? 6 : 3)], [rx(q), ry + (q % 5 === 0 ? 6 : 3)]], P.ink3, 1); if (q % 5 === 0) lab(c, k, String(q), rx(q), ry + 15, { px: 10, mono: true, color: P.ink3, halo: false }); }
        c.beginPath(); c.moveTo(rx(p), ry - 5); c.lineTo(rx(p) - 6, ry - 15); c.lineTo(rx(p) + 6, ry - 15); c.closePath(); c.fillStyle = P.mot; c.fill();
        lab(c, k, `место ${at}`, rx(p), ry - 24, { px: 11, weight: 750, color: P.mot, haloColor: P.surf2 });
        // стрелки: каждая пара чисел — точка на окружности, угол растёт с номером места
        para(c, k, A, G.t2, G.t2x, G.t2y, G.t2w, { px: 11, color: P.ink2, halo: false });
        G.dials.forEach(([dx, dy], i) => {
          const R = G.dr, ang = p * OM[i];
          circle(c, dx, dy, R, P.surf, P.line, 1.2);
          line(c, [[dx - R, dy], [dx + R, dy]], P.grid, 1); line(c, [[dx, dy - R], [dx, dy + R]], P.grid, 1);
          const hx = dx + Math.sin(ang) * R * 0.86, hy = dy - Math.cos(ang) * R * 0.86;
          line(c, [[dx, dy], [hx, hy]], P.mot, 2.6); circle(c, hx, hy, 3.2, P.mot);
          lab(c, k, i === 0 && !G.short ? 'пара 1: быстрая' : `пара ${i + 1}`, dx, dy + R + 12, { px: 10, weight: 650, color: P.ink2, halo: false });
          if (!G.short) lab(c, k, `${fx(Math.sin(ang), 2)} · ${fx(Math.cos(ang), 2)}`, dx, dy + R + 25, { px: 9.5, mono: true, color: P.ink3, halo: false });
        });
        lab(c, k, G.t3, G.t3x, G.t3y, { px: 10.5, color: P.ink3, halo: false });
        // 16 чисел: место p и место 0
        const [sx, sy, cw] = G.strip, val = (q) => { const v = []; for (let i = 0; i < D / 2; i++) v.push(Math.sin(q * OM[i]), Math.cos(q * OM[i])); return v; };
        const vp = val(p), v0 = val(0);
        lab(c, k, G.t4, G.t4x, G.t4y, { px: 12, weight: 750, color: P.ink, halo: false });
        [[vp, `место ${at}`, sy], [v0, 'место 0', sy + 40]].forEach(([v, name, y]) => {
          lab(c, k, name, sx - 6, y + 9, { px: 10.5, weight: 650, color: P.ink2, align: 'right', halo: false });
          v.forEach((x, i) => { const a = Math.abs(x); rect(c, sx + i * cw, y, cw - 2, 18, 3, A.alpha(x >= 0 ? P.mot : C2, 0.12 + 0.88 * a), null); });
        });
        for (let i = 0; i < D / 2; i++) lab(c, k, String(i + 1), sx + (2 * i + 1) * cw - 1, sy - 9, { px: 9.5, mono: true, color: i < 4 ? P.ink2 : P.ink3, halo: false });
        lab(c, k, 'оранжевый — плюс, зелёный — минус; ярче — больше', sx + D * cw / 2, sy + 72, { px: 9.5, color: P.ink3, halo: false });
        const sim = E.Pos.peSim(0, p);
        lab(c, k, `сходство с местом 0: ${fx(sim, 2)}`, sx + D * cw / 2, sy + 94, { px: 12, weight: 750, color: P.ink, halo: false });
        // график сходства с местом 0
        const [gx, gy, gw, gh] = G.chart, X = (q) => gx + q / (NP - 1) * gw, Y = (s) => gy + gh - (s - lo) / (1 - lo) * gh;
        lab(c, k, G.t5, gx + gw / 2, gy - 14, { px: 12, weight: 750, color: P.ink, halo: false });
        rect(c, gx - 6, gy - 4, gw + 12, gh + 8, 6, P.surf, P.grid, 1);
        const pts = SIM.map((s, q) => [X(q), Y(s)]); line(c, pts, A.alpha(P.mot, 0.85), 2);
        SIM.forEach((s, q) => circle(c, X(q), Y(s), 2, P.mot));
        circle(c, X(p), Y(sim), 5.5, P.surf, P.ink, 2);
        [0, 10, 20].forEach((q) => lab(c, k, String(q), X(q), gy + gh + 14, { px: 10, mono: true, color: P.ink3, halo: false }));
        lab(c, k, 'номер места', gx + gw / 2, gy + gh + 28, { px: 10, color: P.ink3, halo: false });
      };
    }
    Anim.add('pe', {
      W: 720, H: 312, start: 3 * STEP + 0.3, narrowAt: 600,
      draw: draw({ ruler: [24, 58, 290], t1: 'Номер места → восемь пар чисел', t1x: 170, t1y: 16,
        t2: 'каждая пара — точка на своей окружности, угол растёт с номером места', t2x: 170, t2y: 92, t2w: 320,
        dials: [[52, 152], [126, 152], [200, 152], [274, 152]], dr: 25,
        t3: 'ещё 4 пары на 24 местах почти не поворачиваются', t3x: 170, t3y: 232,
        strip: [430, 52, 11.5], t4: 'Кодировка места: 16 чисел, по паре на окружность', t4x: 522, t4y: 16,
        chart: [404, 202, 236, 58], t5: 'сходство с местом 0 для мест 0–23' }),
      narrow: { W: 360, H: 560,
        draw: draw({ ruler: [30, 58, 300], t1: 'Номер места → восемь пар чисел', t1x: 180, t1y: 16,
          t2: 'каждая пара — точка на своей окружности, угол растёт с номером места', t2x: 180, t2y: 88, t2w: 330,
          dials: [[60, 146], [140, 146], [220, 146], [300, 146]], dr: 24,
          t3: 'пара 1 быстрее всех; ещё 4 пары почти не поворачиваются', t3x: 180, t3y: 210, short: true,
          strip: [84, 282, 15.5], t4: 'Кодировка места: 16 чисел', t4x: 180, t4y: 256,
          chart: [50, 440, 270, 72], t5: 'сходство с местом 0 для мест 0–23' }) },
    });
  })();

  /* =====================================================================
     tf — трансформер целиком на примере одного шага π0
     ===================================================================== */
  (() => {
    const T = 12.5, PH = { tok: [0.2, 1.4], pos: [1.5, 2.2], lay: [2.3, 5.6], out: [5.7, 6.2], flow: [6.3, 9.8], fin: [9.9, 10.9] };
    const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const NPT = 22, TGT = Array.from({ length: NPT }, (_, i) => 0.55 * Math.sin(Math.PI * i / (NPT - 1) * 1.5) - 0.2), NOISE = Array.from({ length: NPT }, (_, i) => (hash(i) + hash(i + 31) - 1) * 1.7);
    const KINDS = ['img', 'img', 'img', 'img', 'img', 'txt', 'txt', 'st', 'act', 'act', 'act'];
    const GROUPS = [{ kind: 'img', from: 0, n: 5, count: '768' }, { kind: 'txt', from: 5, n: 2, count: '48' }, { kind: 'st', from: 7, n: 1, count: '1' }, { kind: 'act', from: 8, n: 3, count: '50' }];
    /** Метка-ссылка на раздел урока. */
    function tag(c, k, A, P, text, x, y, align) {
      K.font(c, k, 9.5, 700); const w = c.measureText(text).width + 10 * k, x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
      A.rect(c, x0, y - 8 * k, w, 16 * k, 8 * k, A.alpha(P.ink3, 0.14), null);
      A.lab(c, k, text, x0 + w / 2, y, { px: 9.5, weight: 700, color: P.ink2, halo: false });
    }
    function curve(c, x, y, w, h, u, col, A) {
      const mid = y + h / 2, sy = h * 0.32; c.fillStyle = col;
      for (let i = 0; i < NPT; i++) { const v = NOISE[i] * (1 - u) + TGT[i] * u, px = x + 6 + (w - 12) * i / (NPT - 1); c.beginPath(); c.arc(px, mid - v * sy, 1.8, 0, TAU); c.fill(); }
      if (u >= 0.999) A.line(c, TGT.map((v, i) => [x + 6 + (w - 12) * i / (NPT - 1), mid - v * sy]), col, 1.4);
    }
    function frameIco(c, x, y, w, h, P, A, on) {
      A.rect(c, x, y, w, h, 4, P.dark ? '#5a4a36' : '#e3d3b6', on ? P.ink : P.ink3, on ? 1.8 : 1.1);
      [[0.3, 0.62, 0.86, 0.16, 0.14], [0.7, 0.4, 0.22, 0.42, 0.86], [0.5, 0.3, 0.95, 0.95, 0.92]].forEach(([fx0, fy0, r, g, b]) => { c.beginPath(); c.arc(x + w * fx0, y + h * fy0, Math.min(w, h) * 0.13, 0, TAU); c.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`; c.fill(); });
    }
    function draw(G) {
      return (c, k, t, P, A) => {
        const { seg, ease, lab, rect, line, arrow, alpha } = A, C = tk(), u = ((t % T) + T) % T;
        const pTok = seg(u, ...PH.tok), pPos = seg(u, ...PH.pos), pLay = seg(u, ...PH.lay), pOut = seg(u, ...PH.out), pFlow = seg(u, ...PH.flow), pFin = seg(u, ...PH.fin);
        const layer = pLay <= 0 ? 0 : Math.min(18, 1 + Math.floor(pLay * 18));
        const step = u < PH.out[0] ? 0 : u < PH.flow[0] ? 1 : Math.min(10, 2 + Math.floor(pFlow * 9));
        const cached = u >= PH.flow[0] && u < PH.fin[0];
        const col = (kind) => C[kind];
        // ---------- 1. входы ----------
        const I = G.inp;
        lab(c, k, 'Входы', I.title[0], I.title[1], { px: 11.5, weight: 750, color: P.ink, halo: false });
        const hiIn = (j) => pTok > 0 && pTok < 1 && Math.floor(pTok * 4) === j;
        [2, 1, 0].forEach((j) => frameIco(c, I.img[0] + j * 5, I.img[1] + j * 5, I.img[2], I.img[3], P, A, hiIn(0)));
        lab(c, k, '3 кадра камер', I.img[0] + I.img[2] / 2 + 5, I.img[1] + I.img[3] + 20, { px: 10, color: P.ink2, halo: false });
        rect(c, I.cmd[0], I.cmd[1], I.cmd[2], I.cmd[3], 9, alpha(C.txt, 0.16), hiIn(1) ? P.ink : C.txt, hiIn(1) ? 1.8 : 1.2);
        lab(c, k, '«убери чашку»', I.cmd[0] + I.cmd[2] / 2, I.cmd[1] + I.cmd[3] / 2, { px: 10.5, color: P.ink, halo: false });
        for (let i = 0; i < 6; i++) { const hh = 5 + 12 * hash(i + 3); c.fillStyle = hiIn(2) ? P.ink2 : C.st; c.fillRect(I.st[0] + i * 7, I.st[1] + 16 - hh, 5, hh); }
        const sl = I.stLab || [I.st[0] + 46, I.st[1] + 8, 'left'];
        lab(c, k, 'суставы', sl[0], sl[1], { px: 10, color: P.ink2, align: sl[2], halo: false });
        const D = I.draft, du = pFin > 0 ? 1 : Math.min(1, step / 10);
        rect(c, D[0], D[1], D[2], D[3], 7, P.surf, hiIn(3) || (pFlow > 0 && pFlow < 1) ? P.mot : C.act, 1.4);
        curve(c, D[0], D[1], D[2], D[3], du, C.act, A);
        const dl = I.draftLab || [D[0] + D[2] / 2, D[1] - 9];
        lab(c, k, step ? `черновик: шаг ${step} из 10` : 'черновик пачки: шум', dl[0], dl[1], { px: 10, weight: 650, color: P.ink2, halo: false });
        // ---------- 2. токены ----------
        const S = G.tok, pos = [];
        lab(c, k, 'Токены', S.title[0], S.title[1], { px: 11.5, weight: 750, color: P.ink, halo: false });
        tag(c, k, A, P, 'раздел 2', S.tag[0], S.tag[1]);
        GROUPS.forEach((g, gi) => {
          for (let j = 0; j < g.n; j++) {
            const i = g.from + j, [x, y] = S.at(i), vis = Math.max(0, Math.min(1, pTok * 11 - i));
            pos.push([x, y]); if (vis <= 0) continue;
            const dim = cached && g.kind !== 'act' && g.kind !== 'st';
            c.globalAlpha = vis * (dim ? 0.35 : 1); rect(c, x - S.sz / 2, y - S.sz / 2, S.sz, S.sz, 3, col(g.kind), null); c.globalAlpha = 1;
            if (pPos > 0) { c.globalAlpha = pPos * (dim ? 0.35 : 1); c.beginPath(); c.arc(x + S.sz / 2 - 1, y - S.sz / 2 + 1, 3, 0, TAU); c.fillStyle = P.ink; c.fill(); c.globalAlpha = 1; }
          }
          const [lx, ly] = S.count(gi); if (pTok > 0) lab(c, k, g.count, lx, ly, { px: 10, mono: true, weight: 700, color: P.ink2, align: S.countAlign, halo: false });
        });
        if (cached) lab(c, k, 'наблюдение — из KV-кэша', S.cache[0], S.cache[1], { px: 10, weight: 650, color: P.ink2, haloColor: P.surf2 });
        G.inArrows.forEach(([x1, y1, x2, y2], j) => arrow(c, x1, y1, x2, y2, pTok > j / 4 ? P.ink3 : P.line, 1.3, 5));
        // позиция
        G.posLab.forEach((ln, j) => lab(c, k, ln, G.pos[0], G.pos[1] + j * 13, { px: 10, weight: 650, color: pPos > 0 && pPos < 1 ? P.ink : P.ink2, halo: false }));
        tag(c, k, A, P, 'раздел 3', G.posTag[0], G.posTag[1]);
        arrow(c, G.toLayer[0], G.toLayer[1], G.toLayer[2], G.toLayer[3], pLay > 0 ? P.ink2 : P.line, 1.6, 6);
        // ---------- 3. слой ----------
        const L = G.lay, active = pLay > 0 && pLay < 1;
        rect(c, L.box[0], L.box[1], L.box[2], L.box[3], 12, alpha(P.ink3, 0.06), active ? P.ink : P.ink3, active ? 1.8 : 1.2);
        lab(c, k, 'Слой трансформера', L.title[0], L.title[1], { px: 12, weight: 750, color: P.ink, halo: false });
        lab(c, k, layer ? `слой ${layer} из 18` : '× 18 слоёв', L.count[0], L.count[1], { px: 11, mono: true, weight: 700, color: active ? P.mot : P.ink2, halo: false, align: 'right' });
        const At = L.att; rect(c, At[0], At[1], At[2], At[3], 9, P.surf, P.line, 1.1);
        lab(c, k, 'Внимание: токены берут сведения друг у друга', At[0] + At[2] / 2, At[1] + 14, { px: 10.5, weight: 700, color: P.ink, halo: false });
        tag(c, k, A, P, 'лаборатория', At[0] + At[2] / 2, At[1] + At[3] - 12);
        const dots = KINDS.map((kd, i) => [L.dot0[0] + i * L.dstep, L.dot0[1]]);
        // дуги внимания: источник перебирает токены; маска: наблюдение не смотрит на действия
        const src = active ? Math.floor(pLay * 18 * 11 / 3) % 11 : cached ? 8 + Math.floor(pFlow * 27) % 3 : -1;
        if (src >= 0) {
          const kd = KINDS[src], allowed = (j) => (kd === 'img' || kd === 'txt' ? j <= 6 : kd === 'st' ? j <= 7 : true);
          dots.forEach(([x, y], j) => {
            if (j === src || !allowed(j)) return;
            const w = 0.25 + 0.75 * hash(src * 13 + j + layer), x0 = dots[src][0], hgt = 8 + Math.abs(x - x0) * 0.35;
            c.beginPath(); c.moveTo(x0, y - 6); c.quadraticCurveTo((x0 + x) / 2, y - 6 - hgt, x, y - 6); c.strokeStyle = alpha(P.mot, 0.2 + 0.6 * w); c.lineWidth = 0.8 + 2 * w; c.stroke();
          });
        }
        dots.forEach(([x, y], i) => { const dim = cached && i < 7; c.globalAlpha = dim ? 0.35 : 1; rect(c, x - 5, y - 5, 10, 10, 2.5, col(KINDS[i]), i === src ? P.ink : null, 1.6); c.globalAlpha = 1; });
        if (src >= 0 && (KINDS[src] === 'img' || KINDS[src] === 'txt')) lab(c, k, 'маска: наблюдение не смотрит на действия', At[0] + At[2] / 2, L.dot0[1] + 15, { px: 9.5, color: P.ink3, halo: false });
        const Ml = L.mlp; rect(c, Ml[0], Ml[1], Ml[2], Ml[3], 9, P.surf, P.line, 1.1);
        lab(c, k, 'Полносвязный слой: каждый токен отдельно', Ml[0] + Ml[2] / 2, Ml[1] + 13, { px: 10.5, weight: 700, color: P.ink, halo: false });
        const pulse = 0.55 + 0.45 * Math.sin(u * 9);
        dots.forEach(([x], i) => { const yy = Ml[1] + Ml[3] - 13, on = active || (cached && i >= 7); c.globalAlpha = on ? pulse : 1; rect(c, x - 4, yy - 4, 8, 8, 2, on ? col(KINDS[i]) : alpha(P.ink3, 0.3), null); c.globalAlpha = 1; });
        arrow(c, L.down[0], L.down[1], L.down[2], L.down[3], P.ink3, 1.3, 5);
        line(c, L.loop, active ? P.mot : P.ink3, 1.4, [4, 3], -u * 20);
        lab(c, k, '× 18', L.loopLab[0], L.loopLab[1], { px: 10, mono: true, weight: 700, color: active ? P.mot : P.ink2, align: 'right', halo: false });
        lab(c, k, 'стоимость растёт с числом пар токенов', L.cost[0], L.cost[1], { px: 10, color: P.ink3, halo: false });
        tag(c, k, A, P, 'раздел 4', L.costTag[0], L.costTag[1]);
        // ---------- 4. выход: поправка, цикл flow, пачка роботу ----------
        const O = G.out, onCorr = (u >= PH.out[0] && u < PH.fin[0]);
        arrow(c, O.fromLayer[0], O.fromLayer[1], O.fromLayer[2], O.fromLayer[3], onCorr ? P.mot : P.line, 1.6, 6);
        lab(c, k, 'выход на местах действий', O.lab1[0], O.lab1[1], { px: 10, color: P.ink2, halo: false });
        rect(c, O.corr[0], O.corr[1], O.corr[2], O.corr[3], 8, onCorr ? alpha(P.mot, 0.16) : P.surf, onCorr ? P.mot : P.line, 1.4);
        lab(c, k, 'поправка к черновику', O.corr[0] + O.corr[2] / 2, O.corr[1] + O.corr[3] / 2, { px: 10.5, weight: 700, color: P.ink, halo: false });
        line(c, O.back, cached ? P.mot : P.ink3, cached ? 2 : 1.3, [5, 4], -u * 30);
        const [ax1, ay1, ax2, ay2] = O.backHead; arrow(c, ax1, ay1, ax2, ay2, cached ? P.mot : P.ink3, cached ? 2 : 1.3, 6);
        lab(c, k, '10 шагов flow: черновик уточняется', O.backLab[0], O.backLab[1], { px: 10.5, weight: 650, color: cached ? P.mot : P.ink2, haloColor: P.surf2 });
        tag(c, k, A, P, 'раздел 5', O.backTag[0], O.backTag[1]);
        arrow(c, O.toFin[0], O.toFin[1], O.toFin[2], O.toFin[3], pFin > 0 ? P.mot : P.line, 1.5, 6);
        lab(c, k, 'после шага 10', O.toFinLab[0], O.toFinLab[1], { px: 9.5, color: P.ink3, align: O.toFinLab[2] || 'left', halo: false });
        const F = O.fin; rect(c, F[0], F[1], F[2], F[3], 8, P.surf, pFin > 0 ? P.mot : P.line, 1.4);
        if (pFin > 0) { c.globalAlpha = Math.min(1, pFin * 2); curve(c, F[0], F[1], F[2], F[3], 1, C.act, A); c.globalAlpha = 1; }
        lab(c, k, 'готовая пачка: 50 действий', O.finLab[0], O.finLab[1], { px: 10, weight: 650, color: P.ink2, halo: false });
        lab(c, k, 'робот: действие каждые 20 мс', O.robot[0], O.robot[1], { px: 10.5, weight: 650, color: pFin > 0.5 ? P.ink : P.ink3, halo: false });
        tag(c, k, A, P, 'раздел 5', O.robotTag[0], O.robotTag[1]);
      };
    }
    // широкая раскладка: слева направо
    const wideTok = { title: [158, 18], tag: [158, 236], sz: 12, at: (i) => { const g = i < 5 ? 0 : i < 7 ? 1 : i < 8 ? 2 : 3; return [150, 44 + i * 15 + g * 8]; }, count: (gi) => [166, [74, 136, 164, 202][gi]], countAlign: 'left', cache: [158, 252] };
    const wideLay = { box: [252, 28, 270, 262], title: [336, 46], count: [512, 46], att: [264, 60, 240, 116], dot0: [284, 140], dstep: 20,
      mlp: [264, 194, 240, 50], down: [384, 176, 384, 192], loop: [[505, 219], [513, 219], [513, 80], [505, 80]], loopLab: [509, 186],
      cost: [387, 262], costTag: [387, 278] };
    Anim.add('tf', {
      W: 720, H: 372, start: 4.2, narrowAt: 620,
      draw: draw({ inp: { title: [62, 18], img: [12, 36, 54, 36], cmd: [10, 104, 104, 22], st: [12, 140], draft: [10, 196, 104, 44] },
        tok: wideTok, inArrows: [[88, 62, 140, 74], [116, 115, 140, 136], [104, 150, 140, 165], [116, 218, 140, 202]],
        pos: [222, 120], posLab: ['+ номер', 'места'], posTag: [222, 172], toLayer: [196, 152, 250, 152],
        lay: wideLay,
        out: { fromLayer: [522, 104, 550, 104], lab1: [628, 76], corr: [552, 88, 152, 32], back: [[566, 120], [566, 318], [62, 318], [62, 248]], backHead: [62, 262, 62, 244],
          backLab: [314, 334], backTag: [314, 352], toFin: [644, 120, 644, 180], toFinLab: [650, 152], fin: [584, 182, 120, 44], finLab: [644, 240],
          robot: [644, 262], robotTag: [644, 280] } }),
      narrow: { W: 360, H: 760,
        draw: draw({ inp: { title: [180, 16], img: [14, 34, 50, 34], cmd: [76, 40, 116, 22], st: [202, 42], stLab: [222, 32, 'center'], draft: [252, 36, 96, 40], draftLab: [292, 88] },
          tok: { title: [180, 116], tag: [300, 116], sz: 13, at: (i) => { const g = i < 5 ? 0 : i < 7 ? 1 : i < 8 ? 2 : 3; return [40 + i * 22 + g * 10, 142]; }, count: (gi) => [[84, 168, 216, 272][gi], 164], countAlign: 'center', cache: [180, 184] },
          inArrows: [[42, 98, 60, 130], [134, 66, 150, 130], [222, 64, 210, 130], [300, 98, 282, 130]],
          pos: [110, 206], posLab: ['+ номер места'], posTag: [250, 206], toLayer: [180, 194, 180, 252],
          lay: { box: [10, 254, 340, 286], title: [96, 272], count: [338, 272], att: [22, 288, 316, 126], dot0: [70, 376], dstep: 22,
            mlp: [22, 444, 316, 52], down: [180, 416, 180, 442], loop: [[338, 470], [346, 470], [346, 300], [338, 300]], loopLab: [334, 430],
            cost: [180, 512], costTag: [180, 528] },
          out: { fromLayer: [180, 540, 180, 566], lab1: [262, 553], corr: [104, 568, 152, 30], back: [[256, 583], [352, 583], [352, 24], [302, 24]], backHead: [312, 24, 300, 30],
            backLab: [180, 616], backTag: [180, 634], toFin: [180, 598, 180, 660], toFinLab: [188, 646], fin: [112, 662, 136, 40], finLab: [180, 716],
            robot: [180, 734], robotTag: [180, 750] } }) },
    });
  })();
})();
