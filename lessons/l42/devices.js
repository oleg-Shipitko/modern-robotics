/* =====================================================================
   devices.js — урок 4.2: анимированные схемы пяти способов записать
   демонстрацию, на общем движке shared/anim.js. Каждая схема отвечает на
   три вопроса: что держит или надевает человек, что он видит и что
   записывается. Цвета как в курсе: оранжевый — человек и то, что он задаёт;
   синий — робот и то, что измерено; фиолетовый — пересчёт движений человека
   в команды робота; серый — неподвижное. Внизу каждой схемы — полоса записи.
   У каждой схемы две раскладки: широкая и узкая для телефона.
   1) gello — ведущая рука-копия (GELLO; ALOHA устроена так же, см. урок 1.7)
   2) vr — VR-шлем и активная шея (Open-TeleVision)
   3) dexcap — перчатки и мокап без робота (DexCap)
   4) exo — экзоскелет-кокпит гуманоида (HOMIE; руки — как AirExo)
   5) umi — ручной захват UMI и тот же захват на роботе
   ===================================================================== */
'use strict';
const Dev = (() => {
  const A0 = () => Anim.kit;
  /** Ключевые кадры: K = [[t, v | [v…]], …]; плавный переход между соседними. */
  function kf(u, K) {
    if (u <= K[0][0]) return K[0][1];
    let i = 0; while (i < K.length - 2 && u >= K[i + 1][0]) i++;
    const [t0, a] = K[i], [t1, b] = K[i + 1], s = A0().ease((u - t0) / (t1 - t0 || 1));
    return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * s) : a + (b - a) * s;
  }
  const cyc = (t, T) => ((t % T) + T) % T;
  /** Локоть двухзвенной цепи: основание b, конец p, длины l1, l2; s = ±1 — сторона локтя. */
  function elbow(b, p, l1, l2, s) {
    const dx = p[0] - b[0], dy = p[1] - b[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5), a = Math.atan2(dy, dx);
    const al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1))));
    return [b[0] + l1 * Math.cos(a + s * al), b[1] + l1 * Math.sin(a + s * al)];
  }
  /** Конечность человека: плечо → локоть → кисть, мягкая заливка. */
  function limb(c, a, b, w, col, colS) { const { line } = A0(); line(c, [a, b], col, w + 2.4); line(c, [a, b], colS, w - 0.6); }
  /** Корпус человека: от шеи до таза, нейтральная заливка (действует рука — она оранжевая). */
  function torso(c, a, b, w, P) { A0().link(c, a[0], a[1], b[0], b[1], w, P.surf, P.ink3); }
  /** Рука человека от плеча к точке p: локоть ниже линии плеча и кисти. */
  function arm(c, sh, p, l1, l2, P) {
    const e1 = elbow(sh, p, l1, l2, 1), e2 = elbow(sh, p, l1, l2, -1), e = e1[1] > e2[1] ? e1 : e2;
    limb(c, sh, e, 8, P.mot, P.motS); limb(c, e, p, 7, P.mot, P.motS); return e;
  }
  /** Голова человека в профиль (смотрит вправо, наклон tilt рад). */
  function head(c, x, y, r, P, tilt, col) {
    const { circle, line } = A0();
    circle(c, x, y, r, P.surf, col || P.ink2, 2);
    const a = (tilt || 0);
    line(c, [[x + r * 0.55 * Math.cos(a), y + r * 0.55 * Math.sin(a)], [x + r * 1.02 * Math.cos(a), y + r * 1.02 * Math.sin(a)]], col || P.ink2, 2);   // нос — куда смотрит
  }
  /** Кисть человека: кружок ладони и пальцы-штрихи; close 0…1. */
  function hand(c, x, y, ang, close, col, colS, sc) {
    const { circle, line } = A0(); sc = sc || 1;
    for (const da of [-0.5, -0.17, 0.17, 0.5]) {
      const a = ang + da * (1 - 0.7 * close), L = 10 * sc * (1 - 0.35 * close);
      const m = [x + Math.cos(a) * 6 * sc, y + Math.sin(a) * 6 * sc], e = [m[0] + Math.cos(a + close * 1.1) * L, m[1] + Math.sin(a + close * 1.1) * L];
      line(c, [m, e], col, 2.2);
    }
    circle(c, x, y, 6.5 * sc, colS, col, 2);
  }
  /** Двухпалый захват робота: кисть в (x, y), смотрит под углом ang, раскрытие open 0…1. */
  function gripper(c, x, y, ang, open, col, sc) {
    const { line } = A0(); sc = sc || 1;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, base = [x + ux * 6 * sc, y + uy * 6 * sc], w = (3 + 6 * open) * sc;
    line(c, [[x, y], base], col, 5 * sc);
    line(c, [[base[0] - nx * (w + 1), base[1] - ny * (w + 1)], [base[0] + nx * (w + 1), base[1] + ny * (w + 1)]], col, 3.4 * sc);
    for (const s of [-1, 1]) { const f0 = [base[0] + s * nx * w, base[1] + s * ny * w]; line(c, [f0, [f0[0] + ux * 13 * sc, f0[1] + uy * 13 * sc]], col, 3 * sc); }
  }
  /** Стол или пол: линия и штриховка. */
  function table(c, x0, x1, y, P) { const { line, hatchBox } = A0(); line(c, [[x0, y], [x1, y]], P.ink3, 2); hatchBox(c, x0, y + 2, x1, y + 9, P); }
  function cup(c, x, yb, w, h, P) {
    const { rect } = A0();
    rect(c, x - w / 2, yb - h, w, h, 3, P.surf2, P.ink2, 1.8);
    c.beginPath(); c.arc(x + w / 2 + 1, yb - h / 2, h * 0.22, -1.2, 1.2); c.strokeStyle = P.ink2; c.lineWidth = 1.8; c.stroke();
  }
  /** Подпись с подложкой цвета схемы. */
  const L = (c, k, P, t, x, y, o) => A0().lab(c, k, t, x, y, Object.assign({ px: 11, weight: 600, color: P.ink2, haloColor: P.surf2 }, o || {}));
  /** Стрелка-канал с бегущими точками: from → to, цвет, фаза. */
  function channel(c, P, t, a, b, col, n, speed, dash) {
    const { line, arrow, circle, alpha } = A0();
    line(c, [a, b], alpha(col, 0.35), 1.6, dash ? [5, 5] : null, -t * 30);
    arrow(c, a[0] + (b[0] - a[0]) * 0.9, a[1] + (b[1] - a[1]) * 0.9, b[0], b[1], col, 1.6, 6);
    for (let i = 0; i < (n || 4); i++) { const ph = cyc(t * (speed || 0.8) + i / (n || 4), 1); circle(c, a[0] + (b[0] - a[0]) * ph * 0.92, a[1] + (b[1] - a[1]) * ph * 0.92, 2.6, col); }
  }
  /** Блок пересчёта (фиолетовый): прямоугольник с подписью в 1–2 строки. */
  function box(c, k, P, x, y, w, h, lines, on) {
    const { rect, alpha } = A0();
    rect(c, x, y, w, h, 7, on ? alpha(P.spr, 0.2) : P.sprS, P.spr, on ? 2.2 : 1.6);
    lines.forEach((s, i) => L(c, k, P, s, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 13, { color: P.spr, px: 10.5, weight: 700, haloColor: alpha(P.spr, 0) }));
  }
  /** Полоса записи внизу схемы: дорожки сигналов бегут в файл демонстрации. */
  function rec(c, k, t, P, G) {
    const { rect, line, circle, alpha } = A0(), x = G.x, y = G.y, w = G.w, rh = G.rh || 17, lw = G.lw;
    rect(c, x, y, w, G.rows.length * rh + 24, 8, P.surf, P.grid, 1);
    L(c, k, P, 'Записывается', x + 8, y + 10, { align: 'left', px: 10.5, weight: 700, color: P.ink3, haloColor: P.surf });
    const stack = !lw, lx0 = stack ? x + 8 : x + lw, lx1 = x + w - 56;
    G.rows.forEach(([txt, colKey, hz], i) => {
      const y0 = y + 22 + i * rh + rh / 2 - 2, col = P[colKey] || colKey, yy = stack ? y0 + 6 : y0;
      L(c, k, P, txt, x + 8, stack ? y0 - 7 : y0, { align: 'left', px: 10.5, color: P.ink2, haloColor: P.surf, weight: 600 });
      line(c, [[lx0, yy], [lx1, yy]], P.grid, 1);
      const step = 60 / (hz || 30) * 2.4;                       // плотность штрихов ~ частоте
      for (let xx = lx1 - cyc(t * 36, step); xx > lx0; xx -= step) line(c, [[xx, yy - 4], [xx, yy + 4]], alpha(col, 0.85), 1.6);
    });
    // файл демонстрации и мигающая точка записи
    const fx = x + w - 44, fy = y + 14, fh = G.rows.length * rh;
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 26, fy); c.lineTo(fx + 34, fy + 8); c.lineTo(fx + 34, fy + fh); c.lineTo(fx, fy + fh); c.closePath();
    c.fillStyle = P.surf2; c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.stroke();
    circle(c, fx + 17, fy + fh / 2, 4.2, Math.floor(t * 2) % 2 ? alpha(P.bad, 0.35) : P.bad);
  }
  const deg = (r) => Math.round(r * 180 / Math.PI).toString().replace('-', '−') + '°';

  /* =====================================================================
     1. Ведущая рука-копия. Человек ведёт за рукоять маленькую копию руки
     робота (масштаб 1 : 2), углы её суставов идут на робота один в один.
     Пунктир на роботе — поза ведущей руки, увеличенная вдвое: совпадает
     с рукой робота, которая чуть отстаёт.
     ===================================================================== */
  const TG = 9;
  // путь кончика ведомой руки (в её пикселях от основания; y вниз): к чашке, взять, перенести, поставить, назад
  const CUPX = 100, PLX = 152;
  const GK = [[0, [60, -100], 0], [1.3, [CUPX, -46], 0], [2.0, [CUPX, -12], 0], [2.4, [CUPX, -12], 1], [3.1, [CUPX, -70], 1], [4.4, [PLX, -70], 1], [5.0, [PLX, -12], 1], [5.4, [PLX, -12], 0], [6.1, [140, -60], 0], [7.6, [60, -100], 0], [TG, [60, -100], 0]];
  function gelloPose(u, F) {
    const p = kf(u, GK.map(([tt, v, g]) => [tt, [v[0], v[1], g]]));
    const l1 = F.l, l2 = 0.92 * F.l, wx = p[0] / 100 * F.l, wy = (p[1] - 24) / 100 * F.l;   // кисть над кончиками пальцев
    const d = Math.min(l1 + l2 - 0.5, Math.hypot(wx, wy)), e = Math.acos(Math.max(-1, Math.min(1, (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2))));
    const q1 = Math.atan2(wy, wx) - Math.atan2(l2 * Math.sin(e), l1 + l2 * Math.cos(e)), q2 = e, q3 = Math.PI / 2 - q1 - q2;   // локоть вверху, захват смотрит вниз
    return { q1, q2, q3, g: p[2], tip: p };
  }
  /** Рука из трёх звеньев: основание в (x, y), длины l, 0,92 l; угол кисти q3. hand — рукоять вместо захвата. */
  function arm3(c, x, y, l, s, col, colS, P, opt) {
    const { link, circle } = A0();
    const e = [x + l * Math.cos(s.q1), y + l * Math.sin(s.q1)], w = [e[0] + l * 0.92 * Math.cos(s.q1 + s.q2), e[1] + l * 0.92 * Math.sin(s.q1 + s.q2)], a3 = s.q1 + s.q2 + s.q3;
    if (opt.ghost) { A0().line(c, [[x, y], e, w, [w[0] + l * 0.3 * Math.cos(a3), w[1] + l * 0.3 * Math.sin(a3)]], col, 2, [6, 5]); return { e, w }; }
    link(c, x, y, e[0], e[1], opt.wd, colS, col); link(c, e[0], e[1], w[0], w[1], opt.wd - 2, colS, col);
    if (opt.handle) { const h = [w[0] + l * 0.32 * Math.cos(a3), w[1] + l * 0.32 * Math.sin(a3)]; link(c, w[0], w[1], h[0], h[1], opt.wd - 3, colS, col); opt.out = h; }
    else gripper(c, w[0], w[1], a3, 1 - s.g, col, opt.gs || 1);
    for (const p of [[x, y], e, w]) circle(c, p[0], p[1], opt.wd > 9 ? 5 : 3.6, P.surf, col, 2);
    return { e, w };
  }
  function drawGello(c, k, t, P, A, G) {
    const { rect, line, circle, alpha } = A, u = cyc(t, TG);
    const sL = gelloPose(cyc(u + 0.1, TG), G.F), sF = gelloPose(u, G.F);   // ведущая рука на 0,1 с впереди: рука робота догоняет
    // стол оператора и ведущая рука
    table(c, G.L.x - 70 * G.L.s, G.L.x + 90 * G.L.s, G.L.y, P);
    rect(c, G.L.x - 9, G.L.y - 12, 18, 12, 3, P.surf2, P.ink3, 1.4);
    const optL = { wd: 8, handle: true };
    arm3(c, G.L.x, G.L.y - 12, G.F.l * 0.5 * G.L.s, sL, P.mot, P.motS, P, optL);
    // оператор: голова, корпус, рука держит рукоять
    const hd = G.op, neck = [hd[0] - 2, hd[1] + 16], sh = [hd[0] + 2, hd[1] + 28], hnd = optL.out;
    torso(c, neck, [hd[0] - 8, G.L.y - 26], 16, P);
    line(c, [[hd[0] - 22, G.L.y - 22], [hd[0] + 4, G.L.y - 22]], P.ink3, 3); line(c, [[hd[0] - 18, G.L.y - 22], [hd[0] - 18, G.L.y]], P.ink3, 2.4);   // стул
    arm(c, sh, hnd, G.arm, G.arm * 0.96, P);
    hand(c, hnd[0], hnd[1], 0.6, 0.5 + 0.4 * sL.g, P.mot, P.motS, 0.8);
    head(c, hd[0], hd[1], 13, P, 0.25, P.ink2);
    // ведомая рука, чашка
    table(c, G.F.x - 40, G.F.x + G.F.l * 2.2, G.F.y, P);
    rect(c, G.F.x - 12, G.F.y - 14, 24, 14, 3, P.surf2, P.ink3, 1.4);
    let cx = G.F.x + CUPX / 100 * G.F.l, held = false;
    if (u >= 2.4 && u < 5.4) { held = true; cx = G.F.x + sF.tip[0] / 100 * G.F.l; } else if (u >= 5.4 && u < 7.9) cx = G.F.x + PLX / 100 * G.F.l;
    const cw = 0.24 * G.F.l, ch = 0.3 * G.F.l, cyb = held ? G.F.y + (sF.tip[1] + 12) / 100 * G.F.l : G.F.y;
    if (u >= 7.9) { c.globalAlpha = (u - 7.9) / (TG - 7.9); cup(c, G.F.x + CUPX / 100 * G.F.l, G.F.y, cw, ch, P); c.globalAlpha = 1 - (u - 7.9) / (TG - 7.9); cup(c, G.F.x + PLX / 100 * G.F.l, G.F.y, cw, ch, P); c.globalAlpha = 1; }
    else cup(c, cx, cyb, cw, ch, P);
    const fol = arm3(c, G.F.x, G.F.y - 14, G.F.l, sF, P.out, P.outS, P, { wd: 12, gs: G.F.l / 79 });
    // поза ведущей руки, увеличенная вдвое, поверх ведомой (пунктир)
    arm3(c, G.F.x, G.F.y - 14, G.F.l, sL, alpha(P.mot, 0.85), null, P, { ghost: true });
    line(c, [[hd[0] + 10, hd[1] - 2], [fol.w[0], fol.w[1] + 10]], alpha(P.ink3, 0.55), 1.2, [2, 5]);
    L(c, k, P, G.lookText, G.look[0], G.look[1], { color: P.ink3, px: 10.5 });
    // углы суставов: одни и те же числа слева и справа
    const [ax, ay] = G.ang, rows = [['плечо', -sL.q1, -sF.q1], ['локоть', -sL.q2, -sF.q2], ['кисть', -sL.q3, -sF.q3]];
    L(c, k, P, G.angTitle, ax + 55, ay - 17, { color: P.ink, px: 11, weight: 700 });
    rows.forEach(([nm, a, b], i) => {
      const yy = ay + i * 15;
      L(c, k, P, nm, ax, yy, { align: 'left', color: P.ink3, px: 10.5 });
      L(c, k, P, deg(a), ax + 80, yy, { align: 'right', color: P.mot, px: 10.5, mono: true, weight: 700 });
      L(c, k, P, '→', ax + 93, yy, { color: P.ink3, px: 10.5 });
      L(c, k, P, deg(b), ax + 142, yy, { align: 'right', color: P.out, px: 10.5, mono: true, weight: 700 });
    });
    G.labels.forEach(([txt, x, y, col, al]) => L(c, k, P, txt, x, y, { color: P[col] || col, px: 11, weight: 650, align: al || 'center' }));
    // курок на рукояти сжимает захват робота
    circle(c, hnd[0], hnd[1], 2, sL.g > 0.5 ? P.mot : P.ink3);
    rec(c, k, t, P, G.rec);
  }
  Anim.add('gello', {
    W: 640, H: 320, start: 2.6, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawGello(c, k, t, P, A, {
        L: { x: 150, y: 196, s: 1 }, F: { x: 400, y: 196, l: 92 }, op: [84, 74], arm: 58,
        ang: [226, 48], angTitle: 'углы суставов, 1 в 1', look: [64, 24], lookText: 'смотрит на робота сам',
        labels: [['ведущая рука: копия 1 : 2', 130, 212, 'mot'], ['рука робота', 500, 212, 'out'], ['пунктир — поза ведущей руки × 2', 520, 16, 'mot']],
        rec: { x: 12, y: 226, w: 616, lw: 250, rows: [['действие: углы ведущей руки, 50 Гц', 'mot', 50], ['наблюдение: углы руки робота, 50 Гц', 'out', 50], ['кадры камер, 30 в секунду', 'out', 30]] },
      });
    },
    narrow: {
      W: 360, H: 560,
      draw(c, k, t, P, A) {
        drawGello(c, k, t, P, A, {
          L: { x: 96, y: 166, s: 1 }, F: { x: 66, y: 392, l: 78 }, op: [42, 54], arm: 48,
          ang: [194, 72], angTitle: 'углы суставов, 1 в 1', look: [262, 160], lookText: 'смотрит на робота сам',
          labels: [['ведущая рука: копия 1 : 2', 104, 184, 'mot'], ['рука робота', 150, 408, 'out'], ['пунктир — ведущая × 2', 268, 262, 'mot']],
          rec: { x: 8, y: 424, w: 344, lw: 0, rh: 30, rows: [['действие: углы ведущей руки', 'mot', 50], ['наблюдение: углы руки робота', 'out', 50], ['кадры камер', 'out', 30]] },
        });
      },
    },
  });

  /* ---------- гуманоид в профиль (смотрит вправо): корпус, шея с подвесом, голова со стереокамерой, рука с кистью, ноги по желанию ---------- */
  function humanoid(c, P, A, o) {
    const { rect, circle, link, alpha } = A, s = o.s, x = o.x, y = o.y, col = P.out, colS = P.outS;
    if (o.legs) {                                                    // ноги: бедро и голень, приседание и шаг
      const hip = [x, y + 84 * s], fy = o.floor, sq = o.squat || 0;
      for (const ph of [0, Math.PI]) {
        const sw = Math.sin((o.walk || 0) + ph), foot = [x + sw * 14 * s * (1 - sq) + sq * 6 * s, fy - Math.max(0, Math.cos((o.walk || 0) + ph)) * 6 * s * (o.walkAmp || 0)];
        const ka = elbow(hip, foot, 40 * s, 40 * s, -1), kb = elbow(hip, foot, 40 * s, 40 * s, 1), kn = ka[0] > kb[0] ? ka : kb;   // колено вперёд
        link(c, hip[0], hip[1], kn[0], kn[1], 10 * s, ph ? alpha(P.out, 0.12) : colS, col); link(c, kn[0], kn[1], foot[0], foot[1], 9 * s, ph ? alpha(P.out, 0.12) : colS, col);
        A.line(c, [[foot[0] - 4 * s, foot[1]], [foot[0] + 12 * s, foot[1]]], col, 4 * s);
      }
    }
    rect(c, x - 22 * s, y - 8 * s, 44 * s, 94 * s, 12 * s, colS, col, 2);
    A.line(c, [[x, y - 8 * s], [x, y - 20 * s]], col, 4 * s);
    circle(c, x, y - 19 * s, 4.5 * s, P.surf, col, 1.8); circle(c, x, y - 19 * s, 7.5 * s, null, alpha(col, 0.5), 1.2);   // подвес шеи
    const dir = o.dir || 1;
    c.save(); c.translate(x, y - 22 * s); c.scale(dir, 1); c.rotate(o.tilt || 0);
    if (o.fov) {                                                     // поле зрения стереокамеры
      c.beginPath(); c.moveTo(16 * s, -12 * s); c.arc(16 * s, -12 * s, (o.fov === true ? 100 : o.fov) * s, -0.4, 0.4); c.closePath(); c.fillStyle = alpha(P.out, 0.08); c.fill();
    }
    rect(c, -16 * s, -26 * s, 32 * s, 26 * s, 8 * s, P.surf, col, 2);
    circle(c, 14 * s, -16 * s, 3.6 * s, P.out); circle(c, 11 * s, -8 * s, 3.6 * s, P.out);   // два объектива
    c.restore();
    const sh = [x + 6 * s * dir, y + 6 * s], e = elbow(sh, o.hand, 50 * s, 48 * s, 1), e2 = elbow(sh, o.hand, 50 * s, 48 * s, -1), el = e[1] > e2[1] ? e : e2;
    link(c, sh[0], sh[1], el[0], el[1], 10 * s, colS, col); link(c, el[0], el[1], o.hand[0], o.hand[1], 8 * s, colS, col);
    circle(c, sh[0], sh[1], 4.5 * s, P.surf, col, 2); circle(c, el[0], el[1], 4 * s, P.surf, col, 2);
    const ha = o.handAng == null ? 0.7 : o.handAng, hA = dir > 0 ? ha : Math.PI - ha;
    if (o.grip) gripper(c, o.hand[0], o.hand[1], hA, 1 - (o.close || 0), col, s);
    else hand(c, o.hand[0], o.hand[1], hA, o.close || 0, col, colS, s);
  }
  /** Банка на столе: x — центр, yb — низ. */
  function can(c, x, yb, s, P) { const { rect } = A0(); rect(c, x - 9 * s, yb - 24 * s, 18 * s, 24 * s, 3 * s, P.surf2, P.ink2, 1.8); A0().line(c, [[x - 9 * s, yb - 19 * s], [x + 9 * s, yb - 19 * s]], P.ink3, 1.2); }

  /* =====================================================================
     2. VR-шлем и активная шея (Open-TeleVision). Шлем передаёт позу головы,
     запястий и пальцев; голова робота поворачивается вслед за головой
     оператора, стереокамера отдаёт картинку в шлем. Руки и кисти робота
     получают углы после пересчёта: обратная кинематика и ретаргетинг.
     ===================================================================== */
  const TV = 10;
  const VK = {                                                       // ключевые кадры: наклон головы, кисть оператора (доля пути), сжатие
    tilt: [[0, 0], [1.4, 0], [2.8, 0.62], [8.6, 0.62], [9.6, 0]],
    reach: [[0, 0], [3, 0], [5.4, 1], [6.3, 1], [8, 1.35], [9.4, 0], [TV, 0]],
    close: [[0, 0], [5.4, 0], [6.2, 1], [8.4, 1], [9.2, 0], [TV, 0]],
  };
  function drawVr(c, k, t, P, A, G) {
    const { rect, line, circle, alpha, link } = A, u = cyc(t, TV), lagU = cyc(u - 0.25, TV);
    const tiltH = kf(u, VK.tilt), tiltR = kf(lagU, VK.tilt), rH = kf(u, VK.reach), rR = kf(lagU, VK.reach), clH = kf(u, VK.close), clR = kf(lagU, VK.close);
    const O = G.op, R = G.rb, s = G.s;
    // оператор: корпус, голова в шлеме, рука в воздухе с точками кисти
    line(c, [[O.x - 40 * s, O.floor], [O.x + 60 * s, O.floor]], P.ink3, 2);
    torso(c, [O.x - 2 * s, O.y + 16 * s], [O.x - 6 * s, O.floor - 4], 16 * s, P);
    const hp = rH <= 1 ? [O.rest[0] + (O.reach[0] - O.rest[0]) * rH, O.rest[1] + (O.reach[1] - O.rest[1]) * rH] : [O.reach[0], O.reach[1] - (rH - 1) * 70 * s];
    arm(c, [O.x + 2 * s, O.y + 30 * s], hp, 46 * s, 44 * s, P);
    hand(c, hp[0], hp[1], 0.5, clH, P.mot, P.motS, s);
    for (let i = 0; i < 5; i++) { const a = 0.5 - 0.6 + i * 0.3; circle(c, hp[0] + Math.cos(a) * (13 - 4 * clH) * s, hp[1] + Math.sin(a) * (13 - 4 * clH) * s, 1.8, P.mot); }
    c.save(); c.translate(O.x, O.y); c.rotate(tiltH);
    circle(c, 0, 0, 14 * s, P.surf, P.ink2, 2);
    rect(c, 4 * s, -8 * s, 18 * s, 13 * s, 4 * s, P.motS, P.mot, 2.2);                    // шлем
    line(c, [[-12 * s, -6 * s], [5 * s, -6 * s]], P.mot, 2.2);
    c.restore();
    // робот: голова следует за головой оператора, рука — за кистью
    table(c, G.tb[0], G.tb[1], G.tb[2], P);
    const rs = R.s || s, dir = R.dir || 1, gx = G.can[0] - 4 * rs * dir, gy = G.can[1] - 16 * rs;
    const lift = rR > 1 ? (rR - 1) * 60 * rs : 0, rp = rR <= 1 ? [R.rest[0] + (gx - R.rest[0]) * rR, R.rest[1] + (gy - R.rest[1]) * rR] : [gx, gy - lift];
    const held = clR > 0.7 && rR >= 1;
    can(c, G.can[0], held ? G.can[1] - lift : G.can[1], rs, P);
    humanoid(c, P, A, { x: R.x, y: R.y, s: rs, dir, tilt: tiltR, fov: R.fov || true, hand: rp, close: clR * 0.8, handAng: 0.9 });
    // каналы
    channel(c, P, t, G.chHead[0], G.chHead[1], P.mot, 4, 0.7);
    channel(c, P, t, G.chVid[0], G.chVid[1], P.out, 4, 0.7);
    channel(c, P, t, [hp[0] + 14 * s, hp[1]], [G.bx[0], G.bx[1] + G.bx[3] / 2], P.mot, 3, 0.9);
    channel(c, P, t, [G.bx[0] + G.bx[2], G.bx[1] + G.bx[3] / 2], G.chArm, P.mot, 3, 0.9);
    box(c, k, P, G.bx[0], G.bx[1], G.bx[2], G.bx[3], G.boxText, rH > 0.05 && rH < 1.3);
    // что видит оператор: два кадра стереокамеры
    const [ix, iy, iw, ih] = G.inset;
    for (let e = 0; e < 2; e++) {
      const fx = ix + e * (iw + 6);
      rect(c, fx, iy, iw, ih, 4, P.surf, P.out, 1.6);
      c.save(); c.beginPath(); c.rect(fx, iy, iw, ih); c.clip();
      const sh2 = (tiltR - 0.62) * ih * 1.1, cx = fx + iw * (0.6 - e * 0.07);
      line(c, [[fx, iy + ih * 0.78 - sh2], [fx + iw, iy + ih * 0.78 - sh2]], P.ink3, 1.2);
      rect(c, cx - 4, iy + ih * 0.78 - sh2 - (held ? 12 + lift * 0.15 : 12), 8, 11, 2, P.surf2, P.ink2, 1.2);
      const hx = fx + iw * (0.1 + 0.36 * Math.min(1, rR)) - e * 2, hy = iy + ih * (0.95 - 0.25 * Math.min(1, rR)) - sh2 - (held ? lift * 0.15 : 0);
      circle(c, hx, hy, 3.4, P.outS, P.out, 1.4);
      c.restore();
    }
    G.labels.forEach(([txt, x, y, col, al]) => L(c, k, P, txt, x, y, { color: P[col] || col, px: 10.5, weight: 650, align: al || 'center' }));
    rec(c, k, t, P, G.rec);
    void link;
  }
  Anim.add('vr', {
    W: 640, H: 320, start: 5.8, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawVr(c, k, t, P, A, {
        s: 1, op: { x: 70, y: 70, floor: 208, rest: [104, 160], reach: [150, 124] },
        rb: { x: 486, y: 104, rest: [520, 170], fov: 96 }, tb: [524, 632, 196], can: [574, 196],
        bx: [196, 132, 182, 38], boxText: ['пересчёт: обратная кинематика', 'и ретаргетинг пальцев'], chArm: [470, 140],
        chHead: [[98, 56], [464, 66]], chVid: [[464, 82], [98, 72]], inset: [236, 4, 66, 38],
        labels: [['что видит оператор:', 228, 22, 'out', 'right'], ['поза головы', 170, 50, 'mot'], ['стерео 480×640 на глаз', 190, 94, 'out'], ['поза кисти и пальцев', 176, 190, 'mot'], ['оператор в шлеме', 62, 222, 'mot'], ['гуманоид с активной шеей', 500, 222, 'out'], ['оператор и робот могут быть за 3000 миль', 330, 114, 'ink3']],
        rec: { x: 12, y: 232, w: 616, lw: 250, rows: [['кадры стереокамеры робота', 'out', 60], ['действие: углы рук, кистей и шеи', 'mot', 60], ['наблюдение: углы суставов робота', 'out', 60]] },
      });
    },
    narrow: {
      W: 360, H: 548,
      draw(c, k, t, P, A) {
        drawVr(c, k, t, P, A, {
          s: 0.8, op: { x: 46, y: 70, floor: 186, rest: [72, 140], reach: [108, 116] },
          rb: { x: 292, y: 290, s: 0.95, dir: -1, rest: [250, 350], fov: 80 }, tb: [24, 230, 400], can: [196, 400],
          bx: [196, 92, 148, 36], boxText: ['пересчёт позы', 'в углы робота'], chArm: [296, 280],
          chHead: [[80, 56], [270, 252]], chVid: [[286, 248], [96, 52]], inset: [196, 8, 70, 34],
          labels: [['что видит оператор', 270, 56, 'out'], ['поза головы', 118, 168, 'mot', 'right'], ['стерео', 214, 160, 'out', 'left'], ['оператор в шлеме', 56, 202, 'mot'], ['гуманоид', 300, 410, 'out']],
          rec: { x: 8, y: 424, w: 344, lw: 0, rh: 30, rows: [['кадры стереокамеры робота', 'out', 60], ['действие: углы рук, кистей и шеи', 'mot', 60], ['наблюдение: углы суставов робота', 'out', 60]] },
        });
      },
    },
  });

  /* =====================================================================
     3. Перчатки и мокап без робота (DexCap). Перчатки с магнитными датчиками
     в кончиках пальцев, камеры SLAM на тыльной стороне перчаток, на груди —
     камера с лидаром. Робот при сборе не нужен; потом кончики пальцев
     переносят на четырёхпалую кисть робота обратной кинематикой.
     ===================================================================== */
  const TD = 10;
  const DK = { reach: [[0, 0], [1, 0], [2.6, 1], [4.2, 1], [4.8, 1.4], [7.4, 1.4], [8.4, 0], [TD, 0]], close: [[0, 0], [2.6, 0], [3.2, 1], [7.6, 1], [8.2, 0], [TD, 0]],
    robot: [[0, 0], [4.6, 0], [6.4, 1], [9.2, 1], [9.8, 0], [TD, 0]], rclose: [[0, 0], [6.4, 0], [7, 1], [9.2, 1], [9.6, 0], [TD, 0]], cloud: [[0, 0], [1, 0], [3.4, 1], [8.6, 1], [9.4, 0], [TD, 0]] };
  /** Четырёхпалая кисть робота (как LEAP): ладонь и четыре двухфаланговых пальца; возвращает кончики. */
  function leap(c, x, y, ang, close, col, colS, s) {
    const { line, rect, circle } = A0(), tips = [];
    c.save(); c.translate(x, y); c.rotate(ang);
    rect(c, -2 * s, -9 * s, 16 * s, 18 * s, 4 * s, colS, col, 2);
    for (let i = 0; i < 4; i++) {
      const by = (-7 + i * 4.7) * s, thumb = i === 3, a1 = (thumb ? -0.9 : 0.05) + close * (thumb ? 0.5 : 0.75), a2 = a1 + close * 0.8;
      const b = [14 * s, by + (thumb ? 4 * s : 0)], m = [b[0] + Math.cos(a1) * 9 * s, b[1] + Math.sin(a1) * 9 * s * (thumb ? -1 : 1)], e = [m[0] + Math.cos(a2) * 8 * s, m[1] + Math.sin(a2) * 8 * s * (thumb ? -1 : 1)];
      line(c, [b, m, e], col, 3.4 * s); circle(c, e[0], e[1], 1.8 * s, col);
      tips.push(e);
    }
    c.restore();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return tips.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]);
  }
  function drawDexcap(c, k, t, P, A, G) {
    const { rect, line, circle, alpha } = A, u = cyc(t, TD), s = G.s;
    const rH = kf(u, DK.reach), cH = kf(u, DK.close), rR = kf(u, DK.robot), cR = kf(u, DK.rclose), cl = kf(u, DK.cloud);
    const O = G.op;
    // человек: рюкзак с мини-ПК, корпус, камера с лидаром на груди, рука в перчатке
    table(c, G.tbH[0], G.tbH[1], G.tbH[2], P);
    rect(c, O.x - 30 * s, O.y + 26 * s, 18 * s, 44 * s, 5 * s, P.surf2, P.ink3, 1.6);
    torso(c, [O.x - 2 * s, O.y + 16 * s], [O.x - 6 * s, O.floor - 4], 16 * s, P);
    line(c, [[O.x - 40 * s, O.floor], [O.x + 40 * s, O.floor]], P.ink3, 2);
    head(c, O.x, O.y, 13 * s, P, 0.5, P.ink2);
    const chest = [O.x + 12 * s, O.y + 30 * s];
    rect(c, chest[0] - 4 * s, chest[1] - 8 * s, 14 * s, 16 * s, 3 * s, P.outS, P.out, 1.8); circle(c, chest[0] + 8 * s, chest[1], 3 * s, P.out);
    // облако точек со стороны груди: точки на столе и на губке
    const sp = G.sponge, lift = rH > 1 ? (rH - 1) * 70 * s : 0, held = cH > 0.6;
    if (cl > 0) {
      c.beginPath(); c.moveTo(chest[0] + 8 * s, chest[1]); c.lineTo(G.tbH[0] + 6, G.tbH[2]); c.lineTo(G.tbH[1], G.tbH[2]); c.closePath(); c.fillStyle = alpha(P.out, 0.05 * cl); c.fill();
      for (let i = 0; i < 26; i++) { const fx = G.tbH[0] + 10 + ((i * 37) % 100) / 100 * (G.tbH[1] - G.tbH[0] - 20), on = i / 26 < cl; if (on) circle(c, fx, G.tbH[2] - 1.5, 1.6, alpha(P.out, 0.8)); }
    }
    const spY = held ? G.tbH[2] - lift : G.tbH[2];
    rect(c, sp - 14 * s, spY - 12 * s, 28 * s, 12 * s, 4 * s, P.surf2, P.ink2, 1.8);
    if (cl > 0.5) for (let i = 0; i < 6; i++) circle(c, sp - 11 * s + i * 4.4 * s, spY - 12 * s, 1.6, alpha(P.out, 0.85));
    const hp = [O.rest[0] + (sp - 4 * s - O.rest[0]) * Math.min(1, rH), O.rest[1] + (spY - 16 * s - O.rest[1]) * Math.min(1, rH)];
    arm(c, [O.x + 2 * s, O.y + 28 * s], hp, 52 * s, 50 * s, P);
    hand(c, hp[0], hp[1], 1.1, cH, P.mot, P.motS, s * 1.1);
    rect(c, hp[0] - 12 * s, hp[1] - 13 * s, 10 * s, 8 * s, 2 * s, P.outS, P.out, 1.6);              // камера SLAM на тыле перчатки
    for (let i = 0; i < 5; i++) { const a = 1.1 - 0.6 + i * 0.3, r = (14 - 5 * cH) * s; circle(c, hp[0] + Math.cos(a) * r, hp[1] + Math.sin(a) * r, 2.2, Math.floor(t * 4 + i) % 3 ? P.mot : P.motS); }
    // пересчёт и робот
    channel(c, P, t, [hp[0] + 16 * s, hp[1] - 6 * s], [G.bx[0], G.bx[1] + G.bx[3] / 2], P.mot, 3, 0.8);
    box(c, k, P, G.bx[0], G.bx[1], G.bx[2], G.bx[3], G.boxText, u > 4.2 && u < 7);
    table(c, G.tbR[0], G.tbR[1], G.tbR[2], P);
    const RB = G.rb, rsp = G.rsponge, rlift = cR > 0.6 ? Math.max(0, (rR - 1)) : 0; void rlift;
    const rUp = u > 7.4 && u < 9.2 ? kf(u, [[7.4, 0], [8.4, 46 * s], [9.2, 46 * s]]) : 0;
    const rheld = cR > 0.6, rSpY = rheld ? G.tbR[2] - rUp : G.tbR[2];
    rect(c, rsp - 14 * s, rSpY - 12 * s, 28 * s, 12 * s, 4 * s, P.surf2, P.ink2, 1.8);
    rect(c, RB[0] - 10 * s, RB[1], 20 * s, G.tbR[2] - RB[1], 3 * s, P.surf2, P.ink3, 1.4);             // стойка руки робота
    const rp = [RB[2] + (rsp - 8 * s - RB[2]) * rR, RB[3] + (rSpY - 30 * s - RB[3]) * rR];
    const sh = [RB[0], RB[1]], e1a = elbow(sh, rp, 64 * s, 60 * s, -1), e1b = elbow(sh, rp, 64 * s, 60 * s, 1), e1 = e1a[1] < e1b[1] ? e1a : e1b;   // локоть вверху
    A.link(c, sh[0], sh[1], e1[0], e1[1], 12 * s, P.outS, P.out); A.link(c, e1[0], e1[1], rp[0], rp[1], 10 * s, P.outS, P.out);
    circle(c, sh[0], sh[1], 5 * s, P.surf, P.out, 2); circle(c, e1[0], e1[1], 4.5 * s, P.surf, P.out, 2);
    const tips = leap(c, rp[0], rp[1], Math.PI / 2 - 0.25, cR, P.out, P.outS, s * 1.2);
    // соответствие кончиков: четыре пальца человека → четыре пальца кисти робота, мизинец отброшен
    if (rR > 0.15 && u < 7.4) {
      const al = Math.min(1, (rR - 0.15) * 3) * (u > 6.8 ? Math.max(0, (7.4 - u) / 0.6) : 1), off = G.ghost;
      const hum = tips.map((p) => [rp[0] + (p[0] - rp[0]) * 0.66 + off[0] * s, rp[1] + (p[1] - rp[1]) * 0.66 + off[1] * s]);
      hum.forEach((h, i) => { circle(c, h[0], h[1], 2.6, alpha(P.mot, al)); line(c, [h, tips[i]], alpha(P.spr, 0.8 * al), 1.2, [3, 3]); });
      const pk = [hum[2][0] + (hum[2][0] - hum[1][0]), hum[2][1] + (hum[2][1] - hum[1][1])];
      K0().cross(c, pk[0], pk[1], 3.5, alpha(P.ink3, al), 1.6);
      L(c, k, P, G.pinky, pk[0] + (G.pinkyDx || 8), pk[1] + 12, { color: alpha(P.ink3, al), px: 10, align: G.pinkyDx < 0 ? 'right' : 'left' });
      const top = Math.min(...hum.map((h) => h[1]));
      L(c, k, P, 'кончики пальцев человека', G.ghostLab, top - 12, { color: alpha(P.mot, al), px: 10, align: 'right' });
    }
    G.labels.forEach(([txt, x, y, col, al]) => L(c, k, P, txt, x, y, { color: P[col] || col, px: 10.5, weight: 650, align: al || 'center' }));
    rec(c, k, t, P, G.rec);
  }
  const K0 = () => A0().K;
  Anim.add('dexcap', {
    W: 640, H: 320, start: 6.2, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawDexcap(c, k, t, P, A, {
        s: 1, op: { x: 100, y: 60, floor: 206, rest: [146, 146] }, tbH: [128, 268, 196], sponge: [178],
        bx: [282, 96, 132, 50], boxText: ['ретаргетинг: кончики', 'пальцев → обратная', 'кинематика'],
        tbR: [430, 632, 196], rb: [470, 116, 520, 100], rsponge: 566, pinky: 'мизинец не нужен', ghost: [40, -58], pinkyDx: -10, ghostLab: 632,
        labels: [['камера с лидаром на груди', 150, 18, 'out'], ['перчатки с датчиками', 212, 104, 'mot'], ['мини-ПК', 64, 98, 'ink3', 'right'], ['в рюкзаке', 64, 111, 'ink3', 'right'], ['человек, робота нет', 120, 222, 'mot'], ['потом: кисть робота', 530, 222, 'out'], ['облако точек', 240, 208, 'out']],
        rec: { x: 12, y: 232, w: 616, lw: 260, rows: [['суставы пальцев: датчики в кончиках, 60 Гц', 'mot', 60], ['позы запястий: камеры SLAM, 60 Гц', 'mot', 60], ['облако точек и кадры с груди, 60 Гц', 'out', 60]] },
      });
    },
    narrow: {
      W: 360, H: 560,
      draw(c, k, t, P, A) {
        drawDexcap(c, k, t, P, A, {
          s: 0.9, op: { x: 86, y: 60, floor: 196, rest: [126, 136] }, tbH: [112, 300, 186], sponge: [168],
          bx: [196, 214, 150, 50], boxText: ['ретаргетинг:', 'кончики пальцев →', 'обратная кинематика'],
          tbR: [40, 352, 408], rb: [96, 330, 150, 318], rsponge: 206, pinky: 'мизинец не нужен', ghost: [32, -36], pinkyDx: 10, ghostLab: 352,
          labels: [['камера с лидаром на груди', 140, 18, 'out'], ['перчатки с датчиками', 230, 112, 'mot'], ['мини-ПК', 54, 96, 'ink3', 'right'], ['человек, робота нет', 90, 212, 'mot'], ['потом: кисть робота', 250, 424, 'out']],
          rec: { x: 8, y: 432, w: 344, lw: 0, rh: 30, rows: [['суставы пальцев: датчики в кончиках', 'mot', 60], ['позы запястий: камеры SLAM', 'mot', 60], ['облако точек и кадры с груди', 'out', 60]] },
        });
      },
    },
  });

  /* =====================================================================
     4. Экзоскелет-кокпит гуманоида (HOMIE). Оператор сидит; на руках —
     экзоскелет той же кинематики, что руки робота (углы один в один), на
     кистях — перчатки, ногами он жмёт педали скорости, поворота и высоты.
     Ногами робота управляет политика, обученная с подкреплением в
     симуляции; видео с камеры робота идёт на экран кокпита.
     ===================================================================== */
  const TE = 10;
  const EK = { x: [[0, 0], [3, 1], [9, 1], [10, 0]], squat: [[0, 0], [3, 0], [4.4, 1], [5.2, 1], [6.8, 0], [10, 0]], reach: [[0, 0], [3, 0], [4.4, 1], [5.2, 1], [6.8, 0.35], [9, 0.35], [9.8, 0], [10, 0]],
    close: [[0, 0], [4.4, 0], [5.1, 1], [9, 1], [9.6, 0], [10, 0]], walk: [[0, 0], [0.2, 1], [2.8, 1], [3.1, 0], [10, 0]] };
  function drawExo(c, k, t, P, A, G) {
    const { rect, line, circle, alpha } = A, u = cyc(t, TE), s = G.s;
    const ex = kf(u, EK.x), sq = kf(u, EK.squat), rc = kf(u, EK.reach), cl = kf(u, EK.close), wk = kf(u, EK.walk);
    const O = G.op, fl = O.floor;
    // кокпит: стул, педали, оператор, экзоскелет рук, перчатка, экран
    line(c, [[O.x - 50 * s, fl], [O.x + 80 * s, fl]], P.ink3, 2);
    line(c, [[O.x - 30 * s, O.y + 92 * s], [O.x + 14 * s, O.y + 92 * s]], P.ink3, 3); line(c, [[O.x - 26 * s, O.y + 92 * s], [O.x - 26 * s, fl]], P.ink3, 2.4); line(c, [[O.x + 10 * s, O.y + 92 * s], [O.x + 10 * s, fl]], P.ink3, 2.4);
    const pedals = [wk, sq > 0.02 && sq < 0.98 ? 1 : 0, 0];                // скорость, высота, поворот: насколько нажата
    pedals.forEach((pr, i) => { const px = O.x + (40 + i * 7) * s, py = fl - 4 * s - i * 2 * s; c.save(); c.translate(px, py); c.rotate(-0.35 + 0.3 * pr); rect(c, -2 * s, -3 * s, 24 * s, 5 * s, 2 * s, pr > 0.1 ? P.mot : P.motS, P.mot, 1.4); c.restore(); });
    const hip = [O.x - 6 * s, O.y + 88 * s], knee = [O.x + 30 * s, O.y + 92 * s], foot = [O.x + 44 * s, fl - 10 * s];
    A.link(c, hip[0], hip[1], knee[0], knee[1], 12 * s, P.surf, P.ink3); A.link(c, knee[0], knee[1], foot[0], foot[1], 10 * s, P.surf, P.ink3);
    rect(c, O.x - 22 * s, O.y + 18 * s, 10 * s, 50 * s, 3 * s, P.motS, P.mot, 1.8);                      // спинка экзоскелета
    torso(c, [O.x - 2 * s, O.y + 16 * s], hip, 16 * s, P);
    head(c, O.x, O.y, 13 * s, P, 0.15 + 0.35 * sq, P.ink2);
    const sh = [O.x + 2 * s, O.y + 28 * s], hp = [O.hand[0] + (O.reach[0] - O.hand[0]) * rc, O.hand[1] + (O.reach[1] - O.hand[1]) * rc];
    const el = arm(c, sh, hp, 40 * s, 38 * s, P);
    // звенья экзоскелета вдоль руки и энкодеры в суставах
    const off = [-3 * s, -6 * s], sx = [sh[0] + off[0], sh[1] + off[1]], ex2 = [el[0] + off[0], el[1] + off[1]], wx = [hp[0] + off[0] - 4 * s, hp[1] + off[1]];
    line(c, [[O.x - 17 * s, O.y + 22 * s], sx], P.mot, 3); line(c, [sx, ex2, wx], P.mot, 3.2);
    for (const q of [sx, ex2, wx]) circle(c, q[0], q[1], 4 * s, P.surf, P.mot, 2);
    hand(c, hp[0], hp[1], 0.4 + 0.5 * rc, cl, P.mot, P.motS, s);
    const [sx0, sy0, sw, sh0] = G.screen;
    line(c, [[sx0 + sw / 2, sy0 + sh0], [sx0 + sw / 2, sy0 + sh0 + 14 * s]], P.ink3, 2);
    rect(c, sx0, sy0, sw, sh0, 5, P.surf, P.out, 2);
    c.save(); c.beginPath(); c.rect(sx0 + 2, sy0 + 2, sw - 4, sh0 - 4); c.clip();
    const near = ex, bxS = sx0 + sw * (0.62 - 0.12 * near), byS = sy0 + sh0 * (0.62 + 0.16 * near - 0.2 * (cl > 0.6 ? 1 - sq : 0) * (u > 5.2 ? 1 : 0));
    line(c, [[sx0, sy0 + sh0 * 0.72], [sx0 + sw, sy0 + sh0 * 0.72]], P.ink3, 1.2);
    rect(c, bxS - 9 * s, byS - 7 * s, 18 * s, 13 * s, 2, P.surf2, P.ink2, 1.2);
    circle(c, sx0 + sw * (0.25 + 0.2 * rc), sy0 + sh0 * (0.95 - 0.3 * rc), 4, P.outS, P.out, 1.4);
    c.restore();
    // гуманоид с ногами: идёт к коробке, приседает, берёт её и встаёт
    const R = G.rb, rs = R.s, rx = R.x0 + (R.x1 - R.x0) * ex, ry = R.floor - (84 + 78) * rs + sq * 48 * rs;
    line(c, [[R.floor0, R.floor], [R.floorEnd, R.floor]], P.ink3, 2); A.hatchBox(c, R.floor0, R.floor + 2, R.floorEnd, R.floor + 9, P);
    const held = cl > 0.6 && u > 4.6 && u < 9.6, boxX = R.box, hand0 = [rx + 30 * rs, ry + 60 * rs], handR = [boxX - 16 * rs, R.floor - 14 * rs];
    let rh = [hand0[0] + (handR[0] - hand0[0]) * rc, hand0[1] + (handR[1] - hand0[1]) * rc];
    if (u > 5.2 && held) rh = [rx + 44 * rs, ry + 64 * rs];
    const boxP = held ? [rh[0] + 16 * rs, rh[1] + 12 * rs] : [boxX, R.floor];
    if (!(u > 9.6)) rect(c, boxP[0] - 15 * rs, boxP[1] - 24 * rs, 30 * rs, 24 * rs, 3, P.surf2, P.ink2, 1.8);
    else { c.globalAlpha = (u - 9.6) / 0.4; rect(c, boxX - 15 * rs, R.floor - 24 * rs, 30 * rs, 24 * rs, 3, P.surf2, P.ink2, 1.8); c.globalAlpha = 1; }
    humanoid(c, P, A, { x: rx, y: ry, s: rs, tilt: 0.25 + 0.3 * sq, legs: true, floor: R.floor, squat: sq, walk: u * Math.PI * 2.4, walkAmp: wk, hand: rh, close: cl, handAng: 1.1 });
    // каналы: углы рук, педали → политика ног, видео обратно
    channel(c, P, t, [wx[0] + 10 * s, wx[1] - 4 * s], G.chArm, P.mot, 3, 0.8);
    channel(c, P, t, [O.x + 66 * s, fl - 10 * s], [G.bx[0], G.bx[1] + G.bx[3] / 2], P.mot, 3, 0.8);
    channel(c, P, t, [G.bx[0] + G.bx[2], G.bx[1] + G.bx[3] / 2], [rx - 6 * rs, ry + 110 * rs], P.spr, 3, 0.8);
    channel(c, P, t, [rx + 2, ry - 34 * rs], [sx0 + sw + 4, sy0 + sh0 / 2], P.out, 3, 0.8);
    box(c, k, P, G.bx[0], G.bx[1], G.bx[2], G.bx[3], G.boxText, wk > 0.1 || (sq > 0.05 && sq < 0.95));
    G.labels.forEach(([txt, x, y, col, al]) => L(c, k, P, txt, x, y, { color: P[col] || col, px: 10.5, weight: 650, align: al || 'center' }));
    rec(c, k, t, P, G.rec);
  }
  Anim.add('exo', {
    W: 640, H: 320, start: 4.6, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawExo(c, k, t, P, A, {
        s: 1, op: { x: 80, y: 56, floor: 206, hand: [130, 120], reach: [150, 150] }, screen: [142, 22, 78, 50],
        rb: { s: 0.82, x0: 420, x1: 498, floor: 206, floor0: 380, floorEnd: 632, box: 548 },
        bx: [238, 150, 112, 40], boxText: ['политика ног:', 'обучена в симуляции'], chArm: [416, 116],
        labels: [['углы рук 1 в 1', 300, 104, 'mot'], ['видео по Wi-Fi, 16 мс', 300, 44, 'out'], ['педали: скорость, поворот, высота', 132, 222, 'mot'], ['гуманоид Unitree G1', 500, 222, 'out'], ['экран: камера робота', 181, 12, 'out']],
        rec: { x: 12, y: 232, w: 616, lw: 250, rows: [['кадры камер робота', 'out', 30], ['действие: углы рук и пальцев', 'mot', 50], ['команды ног: скорость и высота, 10 Гц', 'mot', 10]] },
      });
    },
    narrow: {
      W: 360, H: 560,
      draw(c, k, t, P, A) {
        drawExo(c, k, t, P, A, {
          s: 0.9, op: { x: 60, y: 54, floor: 190, hand: [104, 110], reach: [122, 136] }, screen: [218, 96, 108, 62],
          rb: { s: 0.8, x0: 70, x1: 150, floor: 412, floor0: 20, floorEnd: 352, box: 196 },
          bx: [200, 214, 146, 40], boxText: ['политика ног:', 'обучена в симуляции'], chArm: [124, 288],
          labels: [['углы рук 1 в 1', 116, 250, 'mot', 'right'], ['видео, 16 мс', 236, 176, 'out', 'left'], ['педали', 120, 206, 'mot'], ['гуманоид Unitree G1', 250, 428, 'out'], ['экран: камера робота', 272, 86, 'out']],
          rec: { x: 8, y: 440, w: 344, lw: 0, rh: 30, rows: [['кадры камер робота', 'out', 30], ['действие: углы рук и пальцев', 'mot', 50], ['команды ног, 10 Гц', 'mot', 10]] },
        });
      },
    },
  });

  /* =====================================================================
     5. Ручной захват UMI. Человек держит захват с курком; единственный
     датчик — GoPro с объективом «рыбий глаз» 155° и двумя зеркалами по
     краям кадра. По видео и IMU строят позу захвата, по маркерам на
     пальцах — ширину. Потом тот же захват с той же камерой ставят на
     руку робота, и политика видит такой же кадр, как при записи.
     ===================================================================== */
  const TU = 11;
  // путь передней точки захвата (пиксели схемы относительно начала стола) и раскрытие пальцев
  const UK = [[0, [70, -110], 1], [1.4, [100, -40], 1], [2.0, [100, -40], 0], [2.8, [130, -96], 0], [3.6, [180, -96], 0], [4.3, [180, -40], 0], [4.8, [180, -40], 1], [5.5, [150, -110], 1], [TU, [150, -110], 1]];
  /** Захват UMI в локальной системе: x — вперёд по направлению ang. human — рукоять с курком, иначе фланец робота. */
  function umiGrip(c, x, y, ang, open, s, P, human) {
    const { rect, circle, line, alpha } = A0(), col = human ? P.mot : P.out, colS = human ? P.motS : P.outS;
    c.save(); c.translate(x, y); c.rotate(ang);
    for (const sg of [-1, 1]) { const fy = sg * (4 + 7 * open) * s; line(c, [[-2 * s, fy], [14 * s, fy]], P.ink2, 4 * s); circle(c, 14 * s, fy, 2.6 * s, P.surf2, P.ink2, 1.4); rect(c, 3 * s, fy - 2.2 * s, 4 * s, 4.4 * s, 1, P.ink, null); }   // мягкие пальцы и маркеры
    rect(c, -26 * s, -9 * s, 26 * s, 18 * s, 4 * s, colS, col, 2);                                     // корпус захвата
    rect(c, -24 * s, -21 * s, 16 * s, 12 * s, 3 * s, P.surf, P.out, 1.8); circle(c, -8 * s, -15 * s, 4 * s, P.outS, P.out, 1.6);   // GoPro
    if (human) { rect(c, -22 * s, 9 * s, 9 * s, 20 * s, 3 * s, colS, col, 1.8); line(c, [[-12 * s, 11 * s], [-9 * s + 3 * s * (1 - open), 17 * s]], col, 2.4); }   // рукоять и курок
    else rect(c, -34 * s, -6 * s, 8 * s, 12 * s, 2, P.surf2, P.out, 1.6);                              // фланец
    c.restore();
    void alpha;
  }
  function drawUmi(c, k, t, P, A, G) {
    const { rect, line, circle, alpha } = A, u = cyc(t, TU), s = G.s;
    const human = u < 5.6, uu = human ? u : u - 5.6;
    const pt = (v) => kf(Math.min(uu, 5.5), UK.map(([tt, p, o]) => [tt, [p[0], p[1], o]]));
    const st = pt(), ang = 1.25;
    // две сцены: слева запись человеком, справа робот с тем же захватом
    for (const side of G.sides) {
      const on = side.robot ? !human : human, x0 = side.x, y0 = side.y, sc = side.sc;
      table(c, x0, x0 + 230 * sc, y0, P);
      const cupX = x0 + 100 * sc, plX = x0 + 180 * sc;
      rect(c, plX - 18 * sc, y0 - 4 * sc, 36 * sc, 4 * sc, 2, P.surf2, P.ink3, 1.2);                   // блюдце
      const gp = on ? [x0 + st[0] * sc, y0 + st[1] * sc] : [x0 + 150 * sc, y0 - 110 * sc], open = on ? st[2] : 1;
      const grasped = on && uu > 2.0 && uu < 4.8, cupAt = grasped ? [gp[0] + 6 * sc, gp[1] + 30 * sc] : [(on && uu >= 4.8) || (!on && (side.robot ? false : true)) ? plX : cupX, y0];
      cup(c, cupAt[0], cupAt[1], 20 * sc, 26 * sc, P);
      // след: точки позы захвата, записанные при демонстрации
      const trail = side.robot ? 1 : (human ? Math.min(1, u / 5) : 1);
      const tp = [], nT = Math.floor(60 * trail);
      for (let i = 0; i <= nT; i++) { const q = kf(i / 60 * 5.5, UK.map(([tt, p]) => [tt, p])); tp.push([x0 + q[0] * sc + 16 * sc * Math.cos(ang), y0 + q[1] * sc + 16 * sc * Math.sin(ang)]); }
      if (tp.length > 1) line(c, tp, alpha(P.mot, side.robot ? 0.45 : 0.75), 1.6, [3, 4]);
      tp.forEach((q, i) => { if (i % 6 === 0) circle(c, q[0], q[1], 2, alpha(P.mot, side.robot ? 0.5 : 0.85)); });
      if (side.robot) {
        const sh = [x0 + 18 * sc, y0 - 122 * sc];
        rect(c, sh[0] - 9 * sc, sh[1], 18 * sc, y0 - sh[1], 3, P.surf2, P.ink3, 1.4);
        const wr = [gp[0] - 34 * sc * Math.cos(ang), gp[1] - 34 * sc * Math.sin(ang)], ea = elbow(sh, wr, 70 * sc, 66 * sc, 1), eb = elbow(sh, wr, 70 * sc, 66 * sc, -1), el = ea[1] < eb[1] ? ea : eb;
        A.link(c, sh[0], sh[1], el[0], el[1], 12 * sc, P.outS, P.out); A.link(c, el[0], el[1], wr[0], wr[1], 10 * sc, P.outS, P.out);
        circle(c, sh[0], sh[1], 5 * sc, P.surf, P.out, 2); circle(c, el[0], el[1], 4.5 * sc, P.surf, P.out, 2);
      } else {
        // рука человека держит рукоять: предплечье приходит сверху слева
        const ca = Math.cos(ang), sa = Math.sin(ang), grip = [gp[0] + (-18 * ca - 20 * -sa) * sc, gp[1] + (-18 * sa - 20 * ca) * sc], elb = [grip[0] - 46 * sc, grip[1] - 22 * sc];
        limb(c, [elb[0] - 44 * sc, elb[1] - 16 * sc], elb, 10 * sc, P.mot, P.motS); limb(c, elb, grip, 9 * sc, P.mot, P.motS);
        circle(c, grip[0], grip[1], 7 * sc, P.motS, P.mot, 2);
      }
      if (on) { c.save(); c.translate(gp[0], gp[1]); c.rotate(ang); c.beginPath(); c.moveTo(-8 * s, -15 * s); c.arc(-8 * s, -15 * s, 90 * sc, -1.35, 1.35); c.closePath(); c.fillStyle = alpha(P.out, 0.06); c.fill(); c.restore(); }
      umiGrip(c, gp[0], gp[1], ang, open, sc, P, !side.robot);
      if (!on) { c.fillStyle = alpha(P.surf2, 0.55); c.fillRect(x0 - 30 * sc, y0 - 150 * sc, 270 * sc, 160 * sc); }
    }
    // кадр GoPro: «рыбий глаз», пальцы захвата внизу, зеркала по краям
    const [ix, iy, ir] = G.inset;
    c.save(); c.beginPath(); c.arc(ix, iy, ir, 0, Math.PI * 2); c.clip();
    c.fillStyle = P.surf; c.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
    const near = human ? Math.max(0, 1 - Math.hypot(st[0] - 100, st[1] + 40) / 90) : 0.5, hold = (human ? uu : uu) > 2 && uu < 4.8;
    c.beginPath(); c.ellipse(ix, iy + ir * 0.95, ir * 1.5, ir * 0.7, 0, Math.PI, 0); c.fillStyle = alpha(P.ink3, 0.12); c.fill();
    const cw = 10 + 14 * (hold ? 1 : near), cxI = ix + (hold ? 0 : (1 - near) * 8), cyI = iy + ir * 0.18 + (hold ? 6 : (1 - near) * -8);
    rect(c, cxI - cw / 2, cyI - cw * 0.6, cw, cw * 1.2, 3, P.surf2, P.ink2, 1.4);
    for (const sg of [-1, 1]) {                                           // зеркала: тёмные области с отражённой чашкой
      c.beginPath(); c.moveTo(ix + sg * ir, iy - ir * 0.3); c.lineTo(ix + sg * ir * 0.62, iy - ir * 0.05); c.lineTo(ix + sg * ir * 0.62, iy + ir * 0.4); c.lineTo(ix + sg * ir, iy + ir * 0.7); c.closePath();
      c.fillStyle = alpha(P.out, 0.16); c.fill(); c.strokeStyle = P.out; c.lineWidth = 1.2; c.stroke();
      rect(c, ix + sg * ir * 0.8 - cw * 0.18, cyI - cw * 0.3, cw * 0.36, cw * 0.6, 2, P.surf2, P.ink3, 1);
    }
    const op = human ? st[2] : 0.6;
    for (const sg of [-1, 1]) { const fx = ix + sg * (6 + 10 * op); line(c, [[fx, iy + ir], [fx * 0.98 + ix * 0.02, iy + ir * 0.45]], P.ink2, 5); rect(c, fx - 3, iy + ir * 0.62, 6, 6, 1, P.ink, null); }
    c.restore();
    circle(c, ix, iy, ir, null, P.out, 2);
    L(c, k, P, G.insetText, ix, iy + ir + 12, { color: P.out, px: 10.5, weight: 650 });
    L(c, k, P, G.mirrorText, ix + ir + 6, iy - ir * 0.2, { color: P.out, px: 10, align: 'left' });
    box(c, k, P, G.bx[0], G.bx[1], G.bx[2], G.bx[3], G.boxText, human && u > 0.5);
    G.labels.forEach(([txt, x, y, col, al]) => L(c, k, P, txt, x, y, { color: P[col] || col, px: 10.5, weight: 650, align: al || 'center' }));
    L(c, k, P, human ? G.phase[0] : G.phase[1], G.phaseAt[0], G.phaseAt[1], { color: human ? P.mot : P.out, px: 11, weight: 750 });
    rec(c, k, t, P, G.rec);
  }
  Anim.add('umi', {
    W: 640, H: 320, start: 2.4, narrowAt: 560,
    draw(c, k, t, P, A) {
      drawUmi(c, k, t, P, A, {
        s: 1, sides: [{ x: 40, y: 200, sc: 1 }, { x: 400, y: 200, sc: 1, robot: true }],
        inset: [312, 66, 46], insetText: 'кадр GoPro, 155°', mirrorText: 'зеркала',
        bx: [244, 140, 138, 52], boxText: ['поза захвата: SLAM', 'по видео и IMU;', 'ширина — по маркерам'],
        phase: ['1. запись: робот не нужен', '2. потом: тот же захват на роботе'], phaseAt: [320, 12],
        labels: [['ручной захват с курком', 150, 214, 'mot'], ['рука робота с тем же захватом', 510, 214, 'out']],
        rec: { x: 12, y: 232, w: 616, lw: 250, rows: [['видео GoPro и данные IMU', 'out', 60], ['действие: поза захвата, 6 чисел', 'mot', 60], ['действие: ширина пальцев', 'mot', 60]] },
      });
    },
    narrow: {
      W: 360, H: 580,
      draw(c, k, t, P, A) {
        drawUmi(c, k, t, P, A, {
          s: 0.9, sides: [{ x: 40, y: 190, sc: 0.95 }, { x: 110, y: 420, sc: 0.95, robot: true }],
          inset: [290, 80, 44], insetText: 'кадр GoPro, 155°', mirrorText: '',
          bx: [196, 196, 150, 52], boxText: ['поза: SLAM по видео', 'и IMU; ширина —', 'по маркерам'],
          phase: ['1. запись: робот не нужен', '2. потом: захват на роботе'], phaseAt: [180, 12],
          labels: [['ручной захват', 120, 204, 'mot'], ['рука робота с тем же захватом', 200, 436, 'out']],
          rec: { x: 8, y: 452, w: 344, lw: 0, rh: 30, rows: [['видео GoPro и IMU', 'out', 60], ['действие: поза захвата', 'mot', 60], ['действие: ширина пальцев', 'mot', 60]] },
        });
      },
    },
  });
  return { kf, cyc, elbow, limb, torso, arm, head, hand, gripper, table, cup, L, channel, box, rec, deg, humanoid, can, leap };
})();
