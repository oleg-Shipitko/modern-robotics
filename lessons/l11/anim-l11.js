/* =====================================================================
   anim-l11.js — анимированная схема урока 1.1 (shared/anim.js):
     bc-path — путь данных behavior cloning в три этапа.
       1. Запись: оператор ведёт Аду от зарядки до кухни; каждые 50 мс
          записывается пара «9 лучей дальномера и направление на кухню →
          руль оператора», пары копятся строками таблицы.
       2. Обучение: строка таблицы идёт в сеть (10 входов → скрытый слой →
          руль), руль сети сравнивается с рулём оператора, ошибка падает
          с шагами обучения. Сеть схемы маленькая (10 → 8 → 1) и учится
          здесь же, на строках таблицы.
       3. Поездка: Ада едет сама по петле «лучи → сеть → руль → Ада
          сдвигается → новые лучи». Это политика лаборатории, обученная на
          10 аккуратных поездках учителя (DriveLab.ensure('c10')), и та же
          авария, что в отладчике раздела 3 (проверочная поездка 6).
   Дом, лучи, учитель и Ада — из движка лаборатории (shared/drive-core.js,
   shared/drive-lab.js). Цвета: синий — измеренное и руль оператора,
   оранжевый — то, что считает сеть, серый — данные и неподвижное.
   Без shared/anim.js схемы нет, а остальной урок работает.
   ===================================================================== */
'use strict';
(() => {
  const KIND = 'bc-path';
  if (typeof Anim === 'undefined' || typeof Drive === 'undefined' || typeof DriveDraw === 'undefined') {
    document.querySelectorAll(`canvas[data-anim=${KIND}]`).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, D = Drive, DD = DriveDraw;
  const T = 16.6, START = 2.6;
  const PH = { rec: [0.3, 4.1], more: [4.1, 4.7], train: [5.5, 8.5], ride: [9.7, 13.8], fade: [15.8, 16.6] };
  const STAGE2 = 5.3, STAGE3 = 9.4;          // начало второго и третьего этапов
  const SNAP = [12, 56, 100, 132, 176];     // шаги поездки оператора, которые попадут в таблицу
  const CRASH_TRIP = 6;                      // проверочная поездка 6 политики на 10 аккуратных поездках: авария из раздела 3
  const OUT_CM = 5;                          // дальше этого от точек обучающих поездок — Ада вне полосы данных
  const STEPS = 120;                         // шагов обучения сети схемы
  const fx = (v, d) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dirTo = (s) => wrapA(Math.atan2(D.GOAL.y - s.y, D.GOAL.x - s.x) - s.th);
  const inputs = (L, a) => [...Array.from(L, (v) => v / D.RMAX), a / Math.PI];

  /* ---------- данные: поездки оператора и маленькая сеть (сразу), поездка политики (когда лаборатория её обучит) ---------- */
  /** Сеть 10 → 8 (tanh) → 1 учится на строках таблицы полным пакетом, Adam. Возвращает выходы и скрытый слой на каждом шаге. */
  function trainTiny(rows) {
    const NI = 10, NH = 8, r = K.rng(4), X = rows.map((q) => q.x), Y = rows.map((q) => q.w / D.WMAX);
    const P = { W1: Array.from({ length: NH * NI }, () => K.randn(r) * 0.7), b1: new Array(NH).fill(0), W2: Array.from({ length: NH }, () => K.randn(r) * 0.5), b2: [0] };
    const M = {}, V = {}; for (const key in P) { M[key] = P[key].map(() => 0); V[key] = P[key].map(() => 0); }
    const hist = [];
    for (let it = 0; it <= STEPS; it++) {
      const G = {}; for (const key in P) G[key] = P[key].map(() => 0);
      const out = [], hid = [];
      for (let n = 0; n < X.length; n++) {
        const x = X[n], h = [];
        for (let j = 0; j < NH; j++) { let z = P.b1[j]; for (let i = 0; i < NI; i++) z += P.W1[j * NI + i] * x[i]; h.push(Math.tanh(z)); }
        let o = P.b2[0]; for (let j = 0; j < NH; j++) o += P.W2[j] * h[j];
        out.push(o * D.WMAX); hid.push(h);
        const g = 2 * (o - Y[n]) / X.length; G.b2[0] += g;
        for (let j = 0; j < NH; j++) { G.W2[j] += g * h[j]; const gh = g * P.W2[j] * (1 - h[j] * h[j]); G.b1[j] += gh; for (let i = 0; i < NI; i++) G.W1[j * NI + i] += gh * x[i]; }
      }
      hist.push({ out, hid });
      const t = it + 1, b1 = 0.9, b2 = 0.999;
      for (const key in P) for (let i = 0; i < P[key].length; i++) {
        M[key][i] = b1 * M[key][i] + (1 - b1) * G[key][i]; V[key][i] = b2 * V[key][i] + (1 - b2) * G[key][i] * G[key][i];
        P[key][i] -= 0.03 * (M[key][i] / (1 - Math.pow(b1, t))) / (Math.sqrt(V[key][i] / (1 - Math.pow(b2, t))) + 1e-8);
      }
    }
    return hist;
  }
  let W0 = null;
  function world() {
    if (W0) return W0;
    const demos = D.demos(10, { seed: 3, offSigma: 3, startSpread: 0.8 });   // те же 10 аккуратных поездок, что в лаборатории
    const rec = demos[0], pts = [];
    demos.forEach((d) => d.traj.forEach((q) => pts.push(q)));
    const rows = SNAP.map((i) => { const s = rec.traj[i], L = D.lidar(s.x, s.y, s.th), a = dirTo(s); return { i, s, L, a, w: rec.acts[i], x: inputs(L, a) }; });
    return (W0 = { demos, rec, pts, rows, net: trainTiny(rows), n1: rec.acts.length, nAll: demos.reduce((s, d) => s + d.acts.length, 0) });
  }
  let RIDE = null, asked = false;
  /** Поездка политики лаборатории: кадры с лучами, рулём политики и учителя и расстоянием до данных. */
  function ride() {
    if (RIDE || asked || !window.DriveLab || !DriveLab.ensure) return RIDE;
    asked = true;
    DriveLab.ensure('c10').then((e) => {
      const w = world(), ep = e.runs[CRASH_TRIP], pol = D.policy(e.model);
      const fr = ep.traj.map((s) => {
        let nov = Infinity; for (const p of w.pts) { const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2; if (d < nov) nov = d; }
        const L = D.lidar(s.x, s.y, s.th), a = dirTo(s), wp = pol(s), wt = D.teacher(s);
        return { s, L, a, x: inputs(L, a), wp, wt, err: Math.abs(wp - wt), nov: Math.sqrt(nov) };
      });
      RIDE = { fr, out: fr.findIndex((f) => f.nov > OUT_CM), outcome: ep.outcome, dur: (ep.traj.length - 1) * D.DT };
      // без анимации кадр рисуется один раз: перерисовать его с поездкой
      if (K.reduced()) document.querySelectorAll(`canvas[data-anim=${KIND}]`).forEach((cv) => { if (!cv.classList.contains('paused')) Anim.frame(cv, START); });
    }).catch((err) => console.error('[bc-path]', err));
    return RIDE;
  }

  /* ---------- подписи и блоки ---------- */
  function wrap(c, k, text, maxW, px, weight) {
    K.font(c, k, px, weight); const ws = String(text).split(' '), out = []; let cur = '';
    for (const w of ws) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись, ужатая до ширины maxW; o.wrap — перенос по словам, y — середина первой строки. */
  function txt(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight) : [text]; let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(7, px * maxW / w);
    const lh = px * k * (o.lh || 1.3);
    lines.forEach((s, i) => A.lab(c, k, s, x, y + i * lh, Object.assign({}, o, { px })));
  }
  function flowDots(c, A, x1, y1, x2, y2, prog, col, r) {
    if (prog <= 0 || prog >= 1) return;
    for (let i = 0; i < 3; i++) { const f = (prog * 1.6 + i / 3) % 1; A.circle(c, A.lerp(x1, x2, f), A.lerp(y1, y2, f), r || 2.4, col); }
  }
  /** Ячейки строки: 9 лучей (столбик — длина луча до 2,5 м), направление на кухню (стрелка), руль (число). */
  function rowCells(c, k, A, P, G, y, L, a, w, o) {
    const Tb = G.tab, h = Tb.h; o = o || {};
    for (let i = 0; i < 9; i++) {
      const x = Tb.x + i * (Tb.cw + Tb.cg);
      A.rect(c, x, y, Tb.cw, h, 2.5, P.surf, o.hi ? P.out : P.grid, o.hi ? 1.3 : 1);
      const bh = Math.max(1, (h - 3) * Math.min(1, L[i] / D.RMAX));
      c.fillStyle = A.alpha(P.out, 0.8); c.fillRect(x + 2.5, y + h - 1.5 - bh, Tb.cw - 5, bh);
    }
    const xd = colDir(G), cx = xd + Tb.dirW / 2, cy = y + h / 2, rr = h / 2 - 1.5;
    A.rect(c, xd, y, Tb.dirW, h, 2.5, P.surf, o.hi ? P.out : P.grid, o.hi ? 1.3 : 1);
    const ang = -Math.PI / 2 + a;                            // вверх — вперёд по курсу Ады
    A.arrow(c, cx - Math.cos(ang) * rr, cy - Math.sin(ang) * rr, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, P.ink2, 1.4, 4);
    if (w == null) return;
    const xr = colRul(G);
    A.rect(c, xr, y, Tb.rulW, h, 2.5, o.hi ? A.alpha(P.out, 0.12) : P.surf, o.hi ? P.out : P.grid, o.hi ? 1.3 : 1);
    txt(c, k, A, fx(w, 2), xr + Tb.rulW / 2, cy, Tb.rulW - 6, { px: Tb.numPx, weight: 650, mono: true, color: P.out });
    txt(c, k, A, '→', colDir(G) + Tb.dirW + Tb.gapR / 2, cy, 16, { px: 10, color: P.ink3 });
  }
  const colDir = (G) => G.tab.x + 9 * (G.tab.cw + G.tab.cg) - G.tab.cg + G.tab.dirGap;
  const colRul = (G) => colDir(G) + G.tab.dirW + G.tab.gapR;
  /** Центры входов сети: под девятью ячейками лучей и ячейкой направления. */
  function inX(G) { const Tb = G.tab, out = []; for (let i = 0; i < 9; i++) out.push(Tb.x + i * (Tb.cw + Tb.cg) + Tb.cw / 2); out.push(colDir(G) + Tb.dirW / 2); return out; }
  function hidX(G) { const xi = inX(G), a = xi[0] + 4, b = xi[9] - 4; return Array.from({ length: 8 }, (_, j) => a + (b - a) * j / 7); }
  const outX = (G) => colRul(G) + G.tab.rulW / 2;

  /* ---------- кадр ---------- */
  function draw(c, k, t, P, A, G) {
    const { seg, ease, lerp } = A, u = ((t % T) + T) % T, w = world(), R = ride();
    const pRec = seg(u, ...PH.rec), pMore = seg(u, ...PH.more), pTr = seg(u, ...PH.train), pRide = seg(u, ...PH.ride);
    const stage = u < STAGE2 ? 1 : u < STAGE3 ? 2 : 3, fade = 1 - seg(u, ...PH.fade);
    c.globalAlpha = fade;
    const H = G.house, X = (x) => H.ox + x * H.s, Y = (y) => H.oy + y * H.s;
    const P2 = { bg: P.surf, grid: P.grid, ink: P.ink, ink2: P.ink2, ink3: P.ink3, e2e: P.mot, classic: P.out, good: P.good, bad: P.bad, surf: P.surf2 };

    /* этапы сверху */
    const Ch = G.chips, names = ['Запись', 'Обучение', 'Поездка'];
    names.forEach((nm, i) => {
      const x = Ch.x + i * (Ch.w + Ch.gap), on = stage === i + 1, done = stage > i + 1;
      A.rect(c, x, Ch.y - Ch.h / 2, Ch.w, Ch.h, Ch.h / 2, on ? A.alpha(P.mot, 0.14) : P.surf, on ? P.mot : P.line, on ? 1.6 : 1);
      A.circle(c, x + 12, Ch.y, 7.5, on ? P.mot : done ? P.ink3 : P.surf2, on || done ? null : P.line, 1);
      txt(c, k, A, String(i + 1), x + 12, Ch.y + 0.5, 10, { px: 10, weight: 800, color: on || done ? '#fff' : P.ink3 });
      txt(c, k, A, nm, x + 25, Ch.y, Ch.w - 30, { px: 11.5, weight: on ? 750 : 600, color: on ? P.ink : P.ink2, align: 'left' });
      if (i < 2) A.arrow(c, x + Ch.w + 5, Ch.y, x + Ch.w + Ch.gap - 5, Ch.y, P.line, 1.4, 5);
    });

    /* ---------- дом ---------- */
    const rec = w.rec, nRec = rec.traj.length;
    const kRec = stage === 1 ? Math.min(nRec - 1, Math.floor(pRec * (nRec - 1))) : nRec - 1;
    const F = R && stage === 3 ? R.fr : null, kRide = F ? Math.min(F.length - 1, Math.floor(pRide * (F.length - 1))) : 0, cur = F ? F[kRide] : null;
    const crashed = F && pRide >= 1 && R.outcome === 'crash';
    // снимок записи: короткая вспышка лучей, направления на кухню и руля оператора
    const snapT = SNAP.map((i) => PH.rec[0] + i / (nRec - 1) * (PH.rec[1] - PH.rec[0]));
    const flash = stage === 1 ? snapT.findIndex((ts) => u >= ts && u < ts + 0.42) : -1;
    c.save(); c.translate(H.ox, H.oy); c.scale(H.s, H.s);
    c.beginPath(); c.roundRect(0, 0, D.W, D.H, 8 / H.s); c.clip();
    DD.house(c, k / H.s, P2, { labels: false });
    // полоса данных: 10 поездок оператора (на первом этапе — только что записанная)
    const bandA = stage === 1 ? 0.35 * ease(pMore) : 1;
    if (bandA > 0) {
      c.globalAlpha = fade * bandA; c.strokeStyle = A.alpha(P.ink3, 0.28); c.lineWidth = 2 * OUT_CM; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); w.demos.forEach((d) => d.traj.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)))); c.stroke();
      c.strokeStyle = A.alpha(P.ink3, 0.6); c.lineWidth = 1.2; w.demos.forEach((d) => DD.line(c, d.traj));
      c.globalAlpha = fade;
    }
    const lidarFan = (s, L, col, al) => {
      c.strokeStyle = A.alpha(col, al); c.lineWidth = 1.6;
      for (let i = 0; i < D.NRAY; i++) { const a = s.th - D.FOV + 2 * D.FOV * i / (D.NRAY - 1); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(a) * L[i], s.y + Math.sin(a) * L[i]); c.stroke(); }
    };
    if (stage === 1) {
      const s = rec.traj[kRec];
      c.strokeStyle = P.out; c.lineWidth = 3.2; DD.line(c, rec.traj, kRec + 1);
      lidarFan(s, D.lidar(s.x, s.y, s.th), P.out, flash >= 0 ? 0.85 : 0.28);
      if (flash >= 0) {
        A.line(c, [[s.x, s.y], [D.GOAL.x, D.GOAL.y]], P.ink2, 2.2, [7, 6]);
        DD.arc(c, s, rec.acts[Math.min(kRec, rec.acts.length - 1)], 0.7, P.out, 4.5);
      }
      DD.ada(c, s, P.ink);
    } else if (stage === 2) {
      DD.ada(c, rec.traj[0], P.ink, 0.9);
    } else if (F) {
      const s = cur.s;
      c.strokeStyle = P.mot; c.lineWidth = 3.4; DD.line(c, F.map((f) => f.s), kRide + 1);
      if (!crashed) {
        lidarFan(s, cur.L, P.out, 0.35);
        DD.arc(c, s, cur.wt, 0.7, P.out, 4.5); DD.arc(c, s, cur.wp, 0.7, P.mot, 4.5);
        DD.ada(c, s, P.mot);
      } else { DD.ada(c, s, P.mot, 0.55); K.cross(c, s.x, s.y, 14, P.bad, 5); }
    } else DD.ada(c, D.START, P.ink, 0.9);
    c.restore();
    A.rect(c, H.ox, H.oy, D.W * H.s, D.H * H.s, 8, null, P.line, 1);
    txt(c, k, A, 'кухня', X(D.GOAL.x), Y(D.GOAL.y + D.GOAL.r + 18), 60, { px: 10.5, weight: 650, color: P.ink3, halo: true, haloColor: P.surf });
    // подписи третьего этапа: Ада вне полосы данных, потом авария
    if (F && R.out >= 0 && kRide >= R.out) {
      const [lx, ly] = G.note, lines = crashed ? ['авария'] : G.noteLines;
      const s = cur.s, ax = X(s.x), ay = Y(s.y), ny = ly + (lines.length - 1) * 6.5;
      A.line(c, [[lx, ny + 9], [ax, ay - 8]], A.alpha(crashed ? P.bad : P.ink2, 0.8), 1.2, [3, 3]);
      txt(c, k, A, lines, lx, ly, 120, { px: 11, weight: 750, color: crashed ? P.bad : P.ink, halo: true, haloColor: P.surf, lh: 1.2 });
    }

    /* ---------- таблица пар ---------- */
    const Tb = G.tab, rowsShown = stage === 1 ? SNAP.filter((i) => i <= kRec).length : SNAP.length;
    const tabA = stage === 3 ? 0 : 1 - seg(u, STAGE3 - 0.35, STAGE3);   // к третьему этапу таблица гаснет, на её месте — текущий кадр
    const live = stage === 3, liveY = Tb.y0 + (SNAP.length - 1) * Tb.dy, headY = live ? Tb.liveHead : Tb.head;
    txt(c, k, A, live ? 'Кадр сейчас: что видит Ада' : 'Пары: что видит Ада → руль оператора', Tb.x, live ? Tb.liveTitle : Tb.title, Tb.titleW, { px: 12, weight: 750, color: P.ink, align: 'left' });
    if (!live) {
      const nPairs = stage === 1 ? (pMore > 0 ? Math.round(lerp(w.n1, w.nAll, ease(pMore))) : kRec) : w.nAll;
      txt(c, k, A, `пар: ${nPairs.toLocaleString('ru-RU')}`, Tb.right, Tb.countY || Tb.title, 100, { px: 10.5, weight: 650, mono: true, color: P.ink2, align: 'right' });
    }
    const xi = inX(G);
    txt(c, k, A, 'лучи 1–9', (xi[0] + xi[8]) / 2, headY, 90, { px: 10, color: P.ink3 });
    txt(c, k, A, 'на кухню', xi[9], headY, Tb.dirW + 24, { px: 10, color: P.ink3 });
    if (!live) txt(c, k, A, 'руль', outX(G), headY, Tb.rulW, { px: 10, color: P.ink3 });
    const trRow = stage === 2 ? Math.floor(pTr * 9) % SNAP.length : -1;   // строка, которая сейчас идёт в сеть
    if (tabA > 0) {
      c.globalAlpha = fade * tabA;
      for (let r = 0; r < rowsShown; r++) {
        const q = w.rows[r], y = Tb.y0 + r * Tb.dy, born = stage === 1 ? seg(u, snapT[r], snapT[r] + 0.25) : 1;
        if (born <= 0) continue;
        c.globalAlpha = fade * tabA * born;
        rowCells(c, k, A, P, G, y, q.L, q.a, q.w, { hi: r === trRow || (stage === 1 && r === flash) });
      }
      c.globalAlpha = fade;
    }
    if (live && F) {                                       // текущий кадр Ады вместо таблицы
      c.globalAlpha = fade * seg(u, STAGE3, STAGE3 + 0.3);
      rowCells(c, k, A, P, G, liveY, cur.L, cur.a, null, { hi: true });
      c.globalAlpha = fade;
    }
    // снимок летит от Ады в новую строку таблицы
    if (flash >= 0) {
      const s = rec.traj[SNAP[flash]], pr = seg(u, snapT[flash], snapT[flash] + 0.3);
      flowDots(c, A, X(s.x), Y(s.y), Tb.x - 6, Tb.y0 + flash * Tb.dy + Tb.h / 2, pr, P.out, 2.6);
    }

    /* ---------- сеть: 10 входов → скрытый слой → руль ---------- */
    const Nt = G.net, hx = hidX(G), ox = outX(G);
    txt(c, k, A, '10 входов', G.layerX, Nt.yIn, 70, { px: 10, weight: 650, color: P.ink3, align: 'left' });
    txt(c, k, A, 'скрытый слой', G.layerX, Nt.yHid - 3, 80, { px: 10, weight: 650, color: P.ink3, align: 'left' });
    const dotY0 = liveY + Tb.h + 3, dotY1 = Nt.yIn - Nt.rIn - 2;
    let xin = null, hid = null, out = null, target = null, active = false;
    if (stage === 2) {
      const step = Math.round(STEPS * Math.pow(pTr, 1.6)), q = w.rows[trRow], hs = w.net[step];
      xin = q.x; hid = hs.hid[trRow]; out = hs.out[trRow]; target = q.w; active = pTr > 0 && pTr < 1;
      const slot = (pTr * 9) % 1;                          // строка спускается во входы в начале своего отрезка
      if (pTr < 1) xi.forEach((x) => flowDots(c, A, x, dotY0, x, dotY1, Math.min(0.99, slot * 2.2), P.out, 1.8));
      if (pTr > 0) txt(c, k, A, `шаг обучения ${step} из ${STEPS}`, G.step[0], G.step[1], 150, { px: 10.5, weight: 650, mono: true, color: P.ink2, align: G.step[2] });
    } else if (stage === 3 && F) {
      xin = cur.x; out = cur.wp; target = cur.wt; active = !crashed;
      if (!crashed) xi.forEach((x) => flowDots(c, A, x, dotY0, x, dotY1, (u * 2.4) % 1, P.out, 1.8));
    }
    // связи
    for (let j = 0; j < 8; j++) for (let i = 0; i < 10; i++) A.line(c, [[xi[i], Nt.yIn], [hx[j], Nt.yHid]], active ? A.alpha(P.mot, 0.16) : P.grid, 0.8);
    for (let j = 0; j < 8; j++) A.line(c, [[hx[j], Nt.yHid], [ox, Nt.yOut]], active ? A.alpha(P.mot, 0.3) : P.grid, 1);
    xi.forEach((x, i) => { A.circle(c, x, Nt.yIn, Nt.rIn, P.surf, P.line, 1); if (xin) A.circle(c, x, Nt.yIn, Nt.rIn - 1.2, A.alpha(P.out, 0.15 + 0.8 * Math.min(1, Math.abs(xin[i]))), null); });
    hx.forEach((x, j) => { A.circle(c, x, Nt.yHid, Nt.rHid, P.surf, P.line, 1); if (hid) A.circle(c, x, Nt.yHid, Nt.rHid - 1.2, A.alpha(P.mot, 0.12 + 0.8 * Math.abs(hid[j])), null); });
    if (stage === 3 && F && !crashed) hx.forEach((x) => A.circle(c, x, Nt.yHid, Nt.rHid - 1.2, A.alpha(P.mot, 0.45), null));
    A.circle(c, ox, Nt.yOut, Nt.rOut, out != null ? A.alpha(P.mot, 0.18) : P.surf, out != null ? P.mot : P.line, out != null ? 1.8 : 1);
    if (out != null) {
      const [vx, vy, al] = G.vals;
      txt(c, k, A, `сеть ${fx(out, 2)}`, vx, vy, 96, { px: 10.5, weight: 700, mono: true, color: P.mot, align: al });
      txt(c, k, A, `оператор ${fx(target, 2)}`, vx, vy + 14, 96, { px: 10.5, weight: 700, mono: true, color: P.out, align: al });
    } else txt(c, k, A, 'руль', ox, Nt.yOut + Nt.rOut + 9, 40, { px: 10, color: P.ink3 });
    if (stage === 3 && !F) txt(c, k, A, 'политика лаборатории ещё обучается…', G.err.x, G.err.y, G.err.w, { px: 10.5, color: P.ink3, align: 'left' });

    /* петля третьего этапа: лучи из дома в кадр, руль из сети обратно к Аде */
    if (stage === 3 && F) {
      const Lk = G.loop, run = !crashed;
      A.line(c, Lk.rays, P.out, 1.6); { const p = Lk.rays, n = p.length; A.arrow(c, p[n - 2][0], p[n - 2][1], p[n - 1][0], p[n - 1][1], P.out, 1.6, 6); }
      A.line(c, Lk.rul, P.mot, 1.6); { const p = Lk.rul, n = p.length; A.arrow(c, p[n - 2][0], p[n - 2][1], p[n - 1][0], p[n - 1][1], P.mot, 1.6, 6); }
      if (run) { const f = (u * 1.2) % 1; dotOnPath(c, A, Lk.rays, f, P.out); dotOnPath(c, A, Lk.rul, (f + 0.5) % 1, P.mot); }
      txt(c, k, A, 'лучи', Lk.raysLab[0], Lk.raysLab[1], 40, { px: 10, weight: 650, color: P.out, align: Lk.raysLab[2] || 'center' });
      txt(c, k, A, 'руль', Lk.rulLab[0], Lk.rulLab[1], 40, { px: 10, weight: 650, color: P.mot, align: Lk.rulLab[2] || 'center' });
    }

    /* ошибка руля */
    if (out != null) {
      const r2 = (v) => Math.round(v * 100) / 100, E = G.err, e = Math.abs(r2(out) - r2(target)), bw = Math.min(1, e / D.WMAX) * E.barW;   // ошибка — по тем же округлённым числам, что на схеме
      txt(c, k, A, 'ошибка', E.x, E.y, 50, { px: 10.5, weight: 700, color: P.ink2, align: 'left' });
      A.rect(c, E.barX, E.y - 4, E.barW, 8, 4, P.surf, P.grid, 1);
      if (bw > 0.5) A.rect(c, E.barX, E.y - 4, Math.max(4, bw), 8, 4, e > 1 ? P.bad : P.mot, null);
      txt(c, k, A, `${fx(e, 2)} рад/с`, E.valX, E.y, 70, { px: 10.5, weight: 700, mono: true, color: e > 1 ? P.bad : P.ink, align: E.valAl });
    }

    /* что происходит */
    let st;
    if (stage === 1) st = pMore > 0 ? `За поездку набралось ${w.n1} ${plural(w.n1, 'пара', 'пары', 'пар')}, а все 10 поездок оператора дали ${w.nAll.toLocaleString('ru-RU')}` : 'Запись: оператор ведёт Аду к кухне, и каждые 50 мс записывается пара: что видит Ада и куда оператор повернул руль';
    else if (stage === 2) st = pTr >= 1 ? 'После обучения руль сети почти совпадает с рулём оператора в каждой строке' : 'Обучение: строка таблицы идёт на вход сети, сеть выдаёт руль, и шаг обучения сдвигает её веса так, чтобы ошибка уменьшилась';
    else if (!F) st = 'Поездка: Ада поедет сама, как только политика лаборатории обучится';
    else if (crashed) st = `Ошибки копятся, и через ${fx(R.dur, 1)} с Ада врезается в угол проёма`;
    else if (R.out >= 0 && kRide >= R.out) st = 'Руль сети немного ошибся, и Ада ушла из полосы, где ездил оператор. Такого кадра в данных нет, и ошибка растёт';
    else st = 'Поездка: Ада едет сама. Лучи идут в сеть, сеть выдаёт руль, Ада сдвигается, и лучи меняются';
    txt(c, k, A, st, G.status.x, G.status.y, G.status.w, { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35 });
    c.globalAlpha = 1;
  }
  /** Точка на ломаной на доле пути f. */
  function dotOnPath(c, A, pts, f, col) {
    const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
    let d = f * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
    const q = L[i] ? d / L[i] : 0; A.circle(c, A.lerp(pts[i][0], pts[i + 1][0], q), A.lerp(pts[i][1], pts[i + 1][1], q), 2.6, col);
  }

  /* ---------- раскладки ---------- */
  const WIDE = (() => {
    const G = {
      chips: { x: 14, y: 18, w: 104, gap: 26, h: 22 },
      house: { ox: 14, oy: 44, s: 0.55 },
      tab: { x: 388, title: 54, titleW: 230, right: 706, head: 72, y0: 82, dy: 15, h: 12, cw: 12, cg: 2, dirW: 24, dirGap: 6, gapR: 16, rulW: 50, numPx: 10, liveTitle: 112, liveHead: 130 },
      net: { yIn: 186, yHid: 214, yOut: 240, rIn: 4.5, rHid: 4.5, rOut: 7.5 },
      layerX: 546,
      err: { x: 388, y: 272, barX: 440, barW: 168, valX: 614, valAl: 'left', w: 318 },
      step: [706, 290, 'right'],
      status: { x: 14, y: 312, w: 692 },
      note: [179, 104], noteLines: ['такого кадра', 'в данных нет'],
    };
    G.vals = [outX(G) + 13, G.net.yOut - 7, 'left'];
    G.loop = { rays: [[349, 148], [383, 148]], raysLab: [366, 137], rul: [[outX(G) - 10, 247], [349, 247]], rulLab: [366, 257] };
    return G;
  })();
  const NARROW = (() => {
    const G = {
      chips: { x: 14, y: 18, w: 96, gap: 22, h: 22 },
      house: { ox: 14, oy: 40, s: 0.553 },
      tab: { x: 14, title: 282, titleW: 332, countY: 395, right: 346, head: 300, y0: 310, dy: 16, h: 13, cw: 17, cg: 2, dirW: 28, dirGap: 5, gapR: 16, rulW: 58, numPx: 10.5, liveTitle: 346, liveHead: 364 },
      net: { yIn: 420, yHid: 448, yOut: 476, rIn: 5, rHid: 5, rOut: 8 },
      layerX: 232,
      err: { x: 14, y: 534, barX: 66, barW: 196, valX: 346, valAl: 'right', w: 332 },
      step: [346, 552, 'right'],
      status: { x: 14, y: 576, w: 332 },
      note: [180, 100], noteLines: ['такого кадра', 'в данных нет'],
    };
    G.vals = [outX(G), G.net.yOut + 19, 'center'];
    G.loop = { rays: [[302, 264], [302, 380], [222, 380]], raysLab: [308, 300, 'left'], rul: [[outX(G) + 10, 476], [340, 476], [340, 264]], rulLab: [306, 466] };
    return G;
  })();
  Anim.add(KIND, {
    W: 720, H: 340, start: START, narrowAt: 620,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, WIDE); },
    narrow: { W: 360, H: 622, draw(c, k, t, P, A) { draw(c, k, t, P, A, NARROW); } },
  });
  window.__bcPath = { world, ride: () => RIDE, T, PH, SNAP, CRASH_TRIP, STEPS };
})();
