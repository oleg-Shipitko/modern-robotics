/* =====================================================================
   aloha.js — анимированные схемы урока 1.7 на общем движке shared/anim.js.
     aloha — раздел про ALOHA: телеоперация. Оператор ведёт маленькую ведущую
             руку, большая ведомая повторяет её углы сустав в сустав и
             переставляет чашку. Оранжевым — ведущая рука и то, что задаёт
             человек; синим — ведомая рука.
     pass  — раздел «Сто действий за один проход»: декодер ACT получает 100
             запросов-заготовок, через внимание читает токены камер, суставов
             и z и за один проход выдаёт 100 действий по 14 чисел; рядом —
             сколько проходов сети нужно на пачку другим способам.
   ===================================================================== */
'use strict';
(() => {
  const T = 8.4;
  const FL = { l1: 96, l2: 88, g: 30 };              // ведомая рука ViperX, пиксели при масштабе 1
  const LL = { l1: 54, l2: 50, g: 16 };              // ведущая рука WidowX
  const CUP = { x: 120, w: 26, h: 34 }, PLACE = 172;
  // путь кончиков пальцев ведомой руки (в координатах её плеча; y вниз, стол на y = 14)
  const KEYS = [[0, [64, -76], 0], [1.4, [CUP.x, -42], 0], [2.0, [CUP.x, -4], 0], [2.4, [CUP.x, -4], 1], [3.0, [CUP.x, -58], 1], [4.2, [PLACE, -58], 1], [4.8, [PLACE, -4], 1], [5.2, [PLACE, -4], 0], [5.8, [PLACE, -42], 0], [7.0, [64, -76], 0], [T, [64, -76], 0]];
  function state(t) {
    const { ease } = Anim.kit, u = ((t % T) + T) % T;
    let i = 0; while (i < KEYS.length - 2 && u >= KEYS[i + 1][0]) i++;
    const [t0, p0, g0] = KEYS[i], [t1, p1, g1] = KEYS[i + 1], s = ease((u - t0) / (t1 - t0));
    const tip = [p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s], grip = g0 + (g1 - g0) * s;
    // обратная кинематика ведомой руки: кисть над кончиками, захват смотрит вниз
    const wx = tip[0], wy = tip[1] - FL.g, d = Math.min(FL.l1 + FL.l2 - 0.5, Math.hypot(wx, wy));
    const cosE = (d * d - FL.l1 * FL.l1 - FL.l2 * FL.l2) / (2 * FL.l1 * FL.l2), e = Math.acos(Math.max(-1, Math.min(1, cosE)));   // локоть вверху
    const q1 = Math.atan2(wy, wx) - Math.atan2(FL.l2 * Math.sin(e), FL.l1 + FL.l2 * Math.cos(e)), q2 = e, q3 = Math.PI / 2 - q1 - q2;
    // где чашка: на столе, в захвате или на новом месте
    let cup = [CUP.x, 0], held = false;
    if (u >= 2.4 && u < 5.0) { held = true; cup = [tip[0], tip[1] + 4]; }
    else if (u >= 5.0 && u < 7.6) cup = [PLACE, 0];
    const fade = u >= 7.6 ? (u - 7.6) / (T - 7.6) : 1;
    return { u, q1, q2, q3, grip, cup, held, fade, tip };
  }
  /** Рука: плечо в (0, 0), три звена с углами q1, q2, q3 (абсолютный угол кисти — q1 + q2 + q3). */
  function arm(c, L, q, col, colS, P, A, grip, hand) {
    const { link, circle, line } = A;
    const e = [L.l1 * Math.cos(q.q1), L.l1 * Math.sin(q.q1)];
    const w = [e[0] + L.l2 * Math.cos(q.q1 + q.q2), e[1] + L.l2 * Math.sin(q.q1 + q.q2)];
    const a3 = q.q1 + q.q2 + q.q3, tip = [w[0] + L.g * Math.cos(a3), w[1] + L.g * Math.sin(a3)];
    link(c, 0, 0, e[0], e[1], 12, colS, col); link(c, e[0], e[1], w[0], w[1], 10, colS, col);
    if (hand) {                                       // рукоять с курком и рука оператора
      link(c, w[0], w[1], tip[0], tip[1], 7, colS, col);
      circle(c, tip[0], tip[1] + 6, 11, P.surf, P.ink2, 2);
      line(c, [[tip[0] + 8, tip[1] + 2], [tip[0] + 8 - 5 * grip, tip[1] + 10]], P.ink2, 3);
    } else {                                          // захват из двух пальцев
      const nx = -Math.sin(a3), ny = Math.cos(a3), open = 9 - 6 * grip;
      line(c, [w, [w[0] + (L.g - 12) * Math.cos(a3), w[1] + (L.g - 12) * Math.sin(a3)]], col, 6);
      for (const sgn of [-1, 1]) {
        const b = [w[0] + (L.g - 12) * Math.cos(a3) + sgn * open * nx, w[1] + (L.g - 12) * Math.sin(a3) + sgn * open * ny];
        line(c, [[w[0] + (L.g - 12) * Math.cos(a3) - sgn * 0 * nx, w[1] + (L.g - 12) * Math.sin(a3)], b, [b[0] + 12 * Math.cos(a3), b[1] + 12 * Math.sin(a3)]], col, 4);
      }
    }
    for (const p of [[0, 0], e, w]) circle(c, p[0], p[1], 5.5, P.surf, col, 2.2);
    return { e, w, tip };
  }
  const deg = (r) => Math.round(r * 180 / Math.PI);
  function drawAloha(c, k, t, P, A, G) {
    const { rect, line, circle, lab, hatchBox, alpha, arrow } = A, s = state(t);
    // ведущая рука: основание на столе оператора
    c.save(); c.translate(G.L.x, G.L.y); c.scale(G.L.s, G.L.s);
    line(c, [[-50, 14], [60, 14]], P.ink3, 2); hatchBox(c, -50, 16, 60, 24, P);
    rect(c, -11, 0, 22, 14, 3, P.surf2, P.ink3, 1.6);
    const lead = arm(c, LL, s, P.mot, P.motS, P, A, s.grip, true);
    c.restore();
    const hx = G.L.x + lead.tip[0] * G.L.s, hy = G.L.y + lead.tip[1] * G.L.s;
    lab(c, k, G.handText, hx + 16, hy + 8, { color: P.ink3, px: 11, align: 'left' });
    // ведомая рука, стол и чашка
    c.save(); c.translate(G.F.x, G.F.y); c.scale(G.F.s, G.F.s);
    line(c, [[-40, 14], [214, 14]], P.ink3, 2); hatchBox(c, -40, 16, 214, 24, P);
    rect(c, -14, 0, 28, 14, 3, P.surf2, P.ink3, 1.6);
    if (s.u >= 5.0 || s.u < 2.4) { c.globalAlpha = s.u >= 7.6 ? 1 - s.fade : 1; }
    const cx = s.cup[0], cy = s.held ? s.cup[1] : 14 - CUP.h / 2;
    rect(c, cx - CUP.w / 2, cy - CUP.h / 2, CUP.w, CUP.h, 4, P.surf2, P.ink2, 2);
    c.beginPath(); c.arc(cx + CUP.w / 2 + 2, cy, 7, -1.2, 1.2); c.strokeStyle = P.ink2; c.lineWidth = 2.4; c.stroke();
    c.globalAlpha = 1;
    if (s.u >= 7.6) { c.globalAlpha = s.fade; rect(c, CUP.x - CUP.w / 2, 14 - CUP.h, CUP.w, CUP.h, 4, P.surf2, P.ink2, 2); c.globalAlpha = 1; }
    arm(c, FL, s, P.out, P.outS, P, A, s.grip, false);
    c.restore();
    // связь: углы идут от ведущей руки к ведомой 50 раз в секунду
    const [x1, y1, x2, y2] = G.link;
    line(c, [[x1, y1], [x2, y2]], P.line, 1.6, [5, 5], -t * 40);
    arrow(c, x2 - (x2 - x1) * 0.02, y2 - (y2 - y1) * 0.02, x2, y2, P.ink3, 1.6, 6);
    for (let i = 0; i < 6; i++) { const ph = ((t * 1.25 + i / 6) % 1); circle(c, x1 + (x2 - x1) * ph, y1 + (y2 - y1) * ph, 3.2, P.mot); }
    lab(c, k, G.linkText, G.lt[0], G.lt[1], { color: P.ink2, px: 11, weight: 700 });
    lab(c, k, `плечо ${deg(-s.q1)}° · локоть ${deg(s.q2)}° · кисть ${deg(s.q3)}°`, G.la[0], G.la[1], { color: P.mot, px: 11, mono: true });
    G.labels.forEach(([txt, x, y, col, al]) => lab(c, k, txt, x, y, { color: P[col] || col, px: 11, weight: 600, align: al || 'center' }));
    // запись демонстрации
    const rec = Math.floor(t * 2) % 2 === 0;
    circle(c, G.rec[0], G.rec[1], 4.5, rec ? P.bad : alpha(P.bad, 0.35));
    lab(c, k, G.recText, G.rec[0] + 10, G.rec[1], { color: P.ink2, px: 10.5, align: 'left' });
  }
  Anim.add('aloha', {
    W: 640, H: 280, start: 2.2, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawAloha(c, k, t, P, A, {
        L: { x: 120, y: 200, s: 1 }, F: { x: 360, y: 200, s: 1 },
        link: [190, 66, 330, 66], lt: [260, 44], la: [260, 88], linkText: 'углы суставов, 50 раз в секунду', handText: 'рука оператора',
        labels: [['ведущая рука WidowX', 120, 246, 'mot'], ['ведомая рука ViperX', 456, 246, 'out'], ['в ALOHA две такие пары', 560, 22, 'ink3']],
        rec: [22, 268], recText: 'запись: 4 камеры по 30 кадров в секунду и 14 углов суставов 50 раз в секунду',
      });
    },
    narrow: {
      W: 360, H: 470,
      draw(c, k, t, P, A) {
        drawAloha(c, k, t, P, A, {
          L: { x: 90, y: 140, s: 0.95 }, F: { x: 70, y: 380, s: 0.95 },
          link: [326, 70, 326, 250], lt: [250, 50], la: [180, 274], linkText: 'углы суставов, 50 раз в секунду', handText: 'оператор',
          labels: [['ведущая рука WidowX', 96, 182, 'mot'], ['ведомая рука ViperX', 160, 420, 'out'], ['в ALOHA две такие пары', 270, 22, 'ink3']],
          rec: [16, 452], recText: 'запись: 4 камеры по 30 кадров/с и 14 углов 50 раз/с',
        });
      },
    },
  });
})();

/* =====================================================================
   pass — один проход декодера ACT. Слева (на телефоне — сверху): 1202 токена
   после энкодера трансформера (признаки кадров четырёх камер — синие, суставы —
   бирюзовый, z — фиолетовый), 100 запросов-заготовок и внимание четырёх из них
   к токенам: линии тянутся от запроса к ключам, точки несут значения обратно.
   Все запросы считаются одновременно, и пачка 100 × 14 появляется сразу:
   столбец под запросом — его действие. Справа (на телефоне — снизу) — сколько
   проходов сети нужно на пачку: ACT — один, Diffusion Policy из урока 1.5
   уточняет пачку из шума (на схеме 16 шагов денойзинга), по действию за проход —
   сто. Один такт сравнения — один проход сети.
   ===================================================================== */
(() => {
  const K = HeroKit;
  const T = 13.6, R0 = 5.8, DT = 0.055;              // цикл, начало сравнения, такт сравнения (один проход)
  const PH = { tok: [0.2, 1.0], q: [1.1, 1.7], reach: [1.9, 2.9], flow: [2.9, 4.3], out: [4.4, 5.0] };
  const NQ = 100, NJ = 14, SAMPLE = [4, 37, 70, 95];  // запросы и числа действия; запросы, у которых видно внимание
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // пачка: по 6 суставов на руку — плавные траектории, захваты (7-е и 14-е число) сжимаются и разжимаются
  const VAL = Array.from({ length: NJ }, (_, j) => Array.from({ length: NQ }, (_, i) => {
    if (j === 6 || j === 13) { const a = j === 6 ? 26 : 40, b = j === 6 ? 72 : 86; return i >= a && i < b ? 0.9 : 0.1; }
    const f = 0.5 + 0.9 * hash(j + 1), ph = 6.283 * hash(j + 17);
    return 0.5 + 0.4 * Math.sin(6.283 * f * i / NQ + ph);
  }));
  const NOISE = VAL.map((row, j) => row.map((_, i) => hash(i * 31 + j * 7 + 3)));
  const ROWS = [
    { name: 'ACT', sub: 'вся пачка за один проход', n: 1, kind: 'act' },
    { name: 'Diffusion Policy, урок 1.5', sub: 'из шума за 10–16 шагов денойзинга', n: 16, kind: 'dp' },
    { name: 'Токен за токеном', sub: 'по действию за проход, как слова', n: 100, kind: 'tok' },
  ];
  /** Подпись, которая не шире maxW: при нехватке места шрифт уменьшается. */
  function fitLab(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 11 }, o); let px = o.px;
    K.font(c, k, px, o.weight, o.mono);
    const w = c.measureText(text).width;
    if (w > maxW) px = Math.max(7, px * maxW / w);
    A.lab(c, k, text, x, y, Object.assign({}, o, { px }));
  }
  /** Текст в несколько строк не шире maxW. */
  function para(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 10.5 }, o);
    K.font(c, k, o.px, o.weight);
    const lines = []; let cur = '';
    for (const w of text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    const lh = o.px * 1.35 * k;
    lines.forEach((ln, i) => fitLab(c, k, A, ln, x, y + i * lh, maxW, o));
  }
  function tokens(G) {
    const out = []; let x = G.tx0;
    for (let cam = 0; cam < 4; cam++) {
      for (let m = 0; m < G.per; m++) out.push({ x: x + m * G.step + G.sz / 2, kind: 'img', id: cam * 10 + m });
      x += G.per * G.step - (G.step - G.sz) + G.gap;
    }
    out.push({ x: G.jx, kind: 'st', id: 98 }, { x: G.zx, kind: 'z', id: 99 });
    return out;
  }
  /** Вес токена во внимании запроса qi, от 0 до 1 (у самого важного — 1): у каждого запроса два-три главных токена. */
  function weights(qi, toks) {
    const raw = toks.map((tk) => { const h = hash(qi * 7.3 + tk.id * 3.1); return tk.kind === 'st' ? 0.3 + 0.35 * h : tk.kind === 'z' ? 0.14 : Math.pow(h, 5); });
    const mx = Math.max(...raw); return raw.map((r) => r / mx);
  }
  const WCACHE = new Map();
  function drawPass(c, k, t, P, A, G) {
    const { seg, ease, lab, rect, line, arrow, alpha, circle, lerp } = A, u = ((t % T) + T) % T;
    const pTok = seg(u, ...PH.tok), pQ = seg(u, ...PH.q), pReach = ease(seg(u, ...PH.reach)), pFlow = seg(u, ...PH.flow), pOut = ease(seg(u, ...PH.out));
    const col = { img: P.out, st: K.css('--down') || P.good, z: P.spr };
    const toks = tokens(G), key = G.per;
    if (!WCACHE.has(key)) WCACHE.set(key, SAMPLE.map((qi) => weights(qi, toks)));
    const W8 = WCACHE.get(key);
    const qx = (i) => G.qx0 + i * G.qw, ty1 = G.ty + G.sz;
    // ---------- заголовок и токены ----------
    fitLab(c, k, A, G.title, G.cx, G.titleY, G.maxW, { px: 12, weight: 750, color: P.ink, halo: false });
    fitLab(c, k, A, 'выход энкодера трансформера — 1202 токена', G.cx, G.subY, G.maxW, { px: 10.5, weight: 600, color: P.ink3, halo: false });
    const camL = toks[0].x - G.sz / 2, camR = toks[4 * G.per - 1].x + G.sz / 2;
    fitLab(c, k, A, G.camText, (camL + camR) / 2, G.kindY, camR - camL - 8, { px: 10.5, weight: 650, color: P.out, halo: false });
    fitLab(c, k, A, 'суставы', G.jx, G.kindY, G.jw, { px: 10.5, weight: 650, color: col.st, halo: false });
    lab(c, k, 'z', G.zx, G.kindY, { px: 11, weight: 750, color: P.spr, halo: false });
    toks.forEach((tk, i) => {
      const vis = Math.max(0, Math.min(1, pTok * toks.length - i * 0.85));
      if (vis <= 0) return;
      c.globalAlpha = vis; rect(c, tk.x - G.sz / 2, G.ty, G.sz, G.sz, 2, col[tk.kind], null); c.globalAlpha = 1;
    });
    // ---------- внимание: линии от выделенных запросов к токенам, точки-значения ----------
    if (pReach > 0) {
      const keep = pOut > 0 ? 0.55 : 1;
      SAMPLE.forEach((qi, s) => {
        const x0 = qx(qi) + G.qw / 2, y0 = G.qy;
        toks.forEach((tk, j) => {
          const w = W8[s][j]; if (w < 0.08) return;
          const x1 = lerp(x0, tk.x, pReach), y1 = lerp(y0, ty1 + 1, pReach);
          line(c, [[x0, y0], [x1, y1]], alpha(P.mot, (0.1 + 0.7 * w) * keep), 0.6 + 2.2 * w);
          if (pFlow > 0 && pFlow < 1 && w > 0.4) {
            const f = (pFlow * 2.2 + hash(qi + j * 5)) % 1;
            circle(c, lerp(tk.x, x0, f), lerp(ty1 + 1, y0, f), 2.3, col[tk.kind]);
          }
        });
      });
    }
    // ---------- запросы ----------
    if (pQ > 0) {
      const pulse = pFlow > 0 && pFlow < 1 ? 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(u * 11)) : pOut > 0 ? 0.5 : 0.18;
      c.globalAlpha = pQ;
      for (let i = 0; i < NQ; i++) rect(c, qx(i), G.qy, G.qw - 0.8, G.qh, 1, alpha(P.mot, pulse), null);
      SAMPLE.forEach((qi) => rect(c, qx(qi) - 0.6, G.qy - 0.6, G.qw + 0.4, G.qh + 1.2, 1.5, null, P.mot, 1.4));
      c.globalAlpha = 1;
      fitLab(c, k, A, G.qText, G.cx, G.qLabY, G.maxW, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    }
    // ---------- один проход: все действия сразу ----------
    arrow(c, G.cx, G.arY[0], G.cx, G.arY[1], pOut > 0 ? P.mot : P.line, 1.8, 7);
    fitLab(c, k, A, 'один проход декодера', G.cx + 10, (G.arY[0] + G.arY[1]) / 2, G.arW, { px: 10.5, weight: 650, color: pOut > 0 ? P.mot : P.ink3, halo: false, align: 'left' });
    const rowY = (j) => G.oy + j * G.oh + (j >= 7 ? 3 : 0), gridB = rowY(NJ - 1) + G.oh;
    rect(c, G.qx0 - 2, G.oy - 2, NQ * G.qw + 3, gridB - G.oy + 4, 3, null, P.grid, 1);
    if (pOut > 0) {
      for (let j = 0; j < NJ; j++) for (let i = 0; i < NQ; i++) {
        c.fillStyle = alpha(P.mot, pOut * (0.08 + 0.87 * VAL[j][i])); c.fillRect(qx(i), rowY(j), G.qw - 0.4, G.oh - 0.4);
      }
      SAMPLE.forEach((qi) => rect(c, qx(qi) - 0.8, G.oy - 1, G.qw + 0.8, gridB - G.oy + 2, 1, null, alpha(P.ink, 0.55 * pOut), 1));
    }
    para(c, k, A, '100 действий × 14 чисел: положения суставов и захватов', G.cx, G.outLabY, G.maxW, { px: 10.5, weight: 600, color: P.ink2, halo: false });
    if (pOut > 0) { c.globalAlpha = pOut; fitLab(c, k, A, 'проходов сети: 1 · около 10 мс', G.cx, G.cntY, G.maxW, { px: 11.5, weight: 750, color: P.mot, halo: false }); c.globalAlpha = 1; }
    // ---------- сравнение: сколько проходов на пачку ----------
    const R = G.race, n = u < R0 ? 0 : Math.floor((u - R0) / DT) + 1;
    if (G.divider) line(c, G.divider, P.grid, 1);
    fitLab(c, k, A, 'Сколько проходов на одну пачку', R.cx, R.titleY, R.w, { px: 12, weight: 750, color: P.ink, halo: false });
    fitLab(c, k, A, 'проход — один запуск сети', R.cx, R.subY, R.w, { px: 10.5, weight: 600, color: P.ink3, halo: false });
    ROWS.forEach((row, ri) => {
      const y0 = R.y0 + ri * R.rowH, done = Math.min(row.n, n), gx = R.x, gw = R.w / NQ, gh = 2, gy = y0 + 25;
      const gY = (j) => gy + j * gh + (j >= 7 ? 2 : 0), gB = gY(NJ - 1) + gh;
      fitLab(c, k, A, row.name, gx, y0, R.w, { px: 11.5, weight: 750, color: P.ink, halo: false, align: 'left' });
      fitLab(c, k, A, row.sub, gx, y0 + 15, R.w, { px: 10.5, weight: 600, color: P.ink3, halo: false, align: 'left' });
      rect(c, gx - 1.5, gy - 1.5, R.w + 3, gB - gy + 3, 2, P.surf, P.grid, 1);
      const e = row.kind === 'dp' ? done / row.n : 0;
      for (let j = 0; j < NJ; j++) for (let i = 0; i < NQ; i++) {
        let a = 0;
        if (row.kind === 'act') a = done >= 1 ? 0.08 + 0.87 * VAL[j][i] : 0;
        else if (row.kind === 'tok') a = i < done ? 0.08 + 0.87 * VAL[j][i] : 0;
        else {                                         // из шума: серый шум уходит, проступает пачка
          const nz = (1 - e) * 0.75 * NOISE[j][i];
          if (nz > 0.02) { c.fillStyle = alpha(P.ink3, nz); c.fillRect(gx + i * gw, gY(j), gw - 0.3, gh - 0.3); }
          a = e * (0.08 + 0.87 * VAL[j][i]);
        }
        if (a > 0.01) { c.fillStyle = alpha(P.mot, a); c.fillRect(gx + i * gw, gY(j), gw - 0.3, gh - 0.3); }
      }
      const fin = done === row.n && n > 0;
      fitLab(c, k, A, `проходов: ${done}`, gx, y0 + 68, R.w, { px: 11, weight: 700, mono: true, color: fin ? P.good : n > 0 ? P.ink2 : P.ink3, halo: false, align: 'left' });
    });
    para(c, k, A, 'если токен — каждое из 14 чисел действия, проходов будет 1400', R.cx, R.noteY, R.w, { px: 10, weight: 600, color: P.ink3, halo: false });
  }
  Anim.add('pass', {
    W: 720, H: 372, start: 8.6, narrowAt: 620,
    draw(c, k, t, P, A) {
      drawPass(c, k, t, P, A, {
        cx: 232, maxW: 430, title: 'ACT: вся пачка за один проход', titleY: 16, subY: 34, kindY: 50,
        camText: 'признаки кадров: 4 камеры × 300', tx0: 24, per: 8, sz: 8, step: 10, gap: 14, ty: 60, jx: 404, jw: 56, zx: 444,
        qx0: 32, qw: 4, qy: 156, qh: 14, qText: '100 запросов-заготовок, по одному на действие пачки', qLabY: 184,
        arY: [194, 213], arW: 200, oy: 219, oh: 6.4, outLabY: 326, cntY: 352,
        divider: [[462, 10], [462, 362]],
        race: { cx: 590, x: 476, w: 228, titleY: 16, subY: 34, y0: 58, rowH: 90, noteY: 332 },
      });
    },
    narrow: {
      W: 360, H: 724,
      draw(c, k, t, P, A) {
        drawPass(c, k, t, P, A, {
          cx: 180, maxW: 340, title: 'ACT: вся пачка за один проход', titleY: 16, subY: 34, kindY: 50,
          camText: 'кадры: 4 камеры × 300', tx0: 22, per: 6, sz: 7, step: 9, gap: 10, ty: 58, jx: 292, jw: 54, zx: 336,
          qx0: 30, qw: 3, qy: 150, qh: 12, qText: '100 запросов-заготовок, по одному на действие', qLabY: 176,
          arY: [186, 204], arW: 160, oy: 210, oh: 5.5, outLabY: 304, cntY: 342,
          divider: [[14, 362], [346, 362]],
          race: { cx: 180, x: 30, w: 300, titleY: 384, subY: 400, y0: 422, rowH: 90, noteY: 696 },
        });
      },
    },
  });
})();
