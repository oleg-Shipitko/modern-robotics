/* =====================================================================
   anim-l03.js — анимированные схемы урока 0.3 (shared/anim.js):
     ctrl-loop   — путь команды: политика выдаёт позу захвата → обратная
                   кинематика → целевые углы → ПД-регулятор (пропорциональная
                   составляющая тянет к цели, как пружина, дифференциальная
                   гасит скорость, как демпфер) → моменты моторов → рука движется → энкодеры возвращают
                   углы и скорости в регулятор. Политика выдаёт цель 50 раз
                   в секунду, регулятор считает момент 1000 раз: на каждую
                   цель 20 шагов регулятора. Движение руки условное.
     mpc-horizon — скользящий горизонт: варианты движения на 7 шагов вперёд,
                   лучший план, исполняется только первый шаг, с нового места
                   план строится заново; после толчка — от того места, где
                   робот оказался. Стоимость плана — как в лаборатории ниже:
                   расстояние до цели в конце плана, среднее расстояние по
                   пути с весом 0,3 и штраф 2 за удар.
   Цвета: оранжевый — нейросеть и её цель, синий — классический слой
   (кинематика, регулятор, план и пройденный путь), фиолетовый — составляющие
   ПД-регулятора, серый — железо и неподвижное. Без shared/anim.js схем нет,
   а остальной урок работает.
   ===================================================================== */
'use strict';
(() => {
  const KINDS = ['ctrl-loop', 'mpc-horizon'];
  if (typeof Anim === 'undefined') {
    document.querySelectorAll(KINDS.map((x) => `canvas[data-anim=${x}]`).join(',')).forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, TAU = Math.PI * 2;
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
  /** Блок: скруглённый прямоугольник с названием и строкой пояснения; on — блок сейчас работает; inset — место слева под значок. */
  function box(c, k, A, P, b, title, sub, on, col, inset) {
    const [x, y, w, h] = b, ins = inset || 0;
    A.rect(c, x, y, w, h, 9, on ? A.alpha(col, 0.13) : P.surf, on ? col : P.line, on ? 1.8 : 1.2);
    const cx = x + ins + (w - ins) / 2, tw = w - ins - 12, lh = 14.5 * k, y0 = sub ? y + h / 2 - lh / 2 : y + h / 2;
    txt(c, k, title, cx, y0, tw, { px: 11.5, weight: 750, color: P.ink });
    if (sub) txt(c, k, sub, cx, y0 + lh, tw, { px: 10, weight: 600, color: P.ink3 });
  }
  /** Точки бегут по ломаной, пока prog между 0 и 1; loop — бегут всё время (prog — фаза). */
  function dots(c, A, pts, prog, col, loop, n) {
    if (!loop && (prog <= 0 || prog >= 1)) return;
    const seg = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
    n = n || 3;
    for (let j = 0; j < n; j++) {
      let s = (((prog * (loop ? 1 : 1.6) + j / n) % 1) + 1) % 1 * tot, i = 0;
      while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const f = seg[i] ? s / seg[i] : 0;
      A.circle(c, A.lerp(pts[i][0], pts[i + 1][0], f), A.lerp(pts[i][1], pts[i + 1][1], f), 2.6, col);
    }
  }
  /** Ломаная со стрелкой на конце. */
  function poly(c, A, pts, col, lw, dash) {
    if (pts.length > 2) A.line(c, pts.slice(0, -1), col, lw, dash);
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (dash) { A.line(c, [a, b], col, lw, dash); A.arrow(c, b[0] - (b[0] - a[0]) * 0.001, b[1] - (b[1] - a[1]) * 0.001, b[0], b[1], col, lw, 6); } else A.arrow(c, a[0], a[1], b[0], b[1], col, lw, 6);
  }
  function cross(c, x, y, col, r) {
    r = r || 8; c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(x - r - 5, y); c.lineTo(x - r + 3, y); c.moveTo(x + r - 3, y); c.lineTo(x + r + 5, y); c.moveTo(x, y - r - 5); c.lineTo(x, y - r + 3); c.moveTo(x, y + r - 3); c.lineTo(x, y + r + 5); c.stroke();
  }

  /* =====================================================================
     ctrl-loop — путь команды от политики до мотора и обратно
     ===================================================================== */
  (() => {
    const L1 = 0.5, L2 = 0.4, WN = 0.23, ZETA = 0.85, MS = 40, SUB = 10, R_END = 39.6;
    const ikUp = (x, y) => { const c2 = clamp((x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1), q2 = -Math.acos(c2); return [Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)), q2]; };
    const fk = (q) => { const x1 = L1 * Math.cos(q[0]), y1 = L1 * Math.sin(q[0]); return { x1, y1, x: x1 + L2 * Math.cos(q[0] + q[1]), y: y1 + L2 * Math.sin(q[0] + q[1]) }; };
    const PTS = [[0.66, 0.02], [0.63, 0.22], [0.54, 0.4]];       // захват в начале и две цели политики, м (плечо в начале координат)
    const Q0 = ikUp(...PTS[0]), QT = [ikUp(...PTS[1]), ikUp(...PTS[2])];
    /** Регулятор раз в 1 мс считает момент каждого сустава по ПД-закону к целевому углу и держит его до
     *  следующего шага; рука движется непрерывно (запись с шагом 0,1 мс). Цифры условные: рука доходит до цели за ~20 мс. */
    const REC = (() => {
      const n = MS * SUB, q = new Float64Array((n + 1) * 2), tau = new Float64Array((n + 1) * 2), x = Q0.slice(), v = [0, 0], tq = [0, 0], h = 1 / SUB;
      for (let i = 0; i <= n; i++) {
        if (i % SUB === 0) { const tg = i / SUB < 20 ? QT[0] : QT[1]; for (let j = 0; j < 2; j++) tq[j] = WN * WN * (tg[j] - x[j]) - 2 * ZETA * WN * v[j]; }
        for (let j = 0; j < 2; j++) { q[i * 2 + j] = x[j]; tau[i * 2 + j] = tq[j]; v[j] += tq[j] * h; x[j] += v[j] * h; }
      }
      let mx = 0; for (let i = 0; i < tau.length; i++) mx = Math.max(mx, Math.abs(tau[i]));
      return { q, tau, mx };
    })();
    const at = (arr, r) => { const f = clamp(r, 0, MS) * SUB, i = Math.min(MS * SUB - 1, Math.floor(f)), g = f - i; return [0, 1].map((j) => arr[i * 2 + j] * (1 - g) + arr[(i + 1) * 2 + j] * g); };
    // этапы, с: политика, кинематика, три шага регулятора замедленно, 37 мс быстрее, итог
    const PH = { pol: [0.3, 1.7], ik: [1.8, 3.0], slow: [3.2, 8.0], fast: [8.2, 14.6], fade: [18.2, 19] }, T = 19, STEP = (PH.slow[1] - PH.slow[0]) / 3;
    /** Время робота в мс в момент схемы u. */
    function robotMs(u) {
      if (u < PH.slow[0]) return 0;
      if (u < PH.slow[1]) { const s = (u - PH.slow[0]) / STEP, n = Math.floor(s); return n + A0.ease(clamp((s - n - 0.6) / 0.25, 0, 1)); }
      if (u < PH.fast[0]) return 3;
      return 3 + (R_END - 3) * clamp((u - PH.fast[0]) / (PH.fast[1] - PH.fast[0]), 0, 1);
    }
    let A0 = null;
    /** Блок регулятора: название и две составляющие момента — пропорциональная и дифференциальная, каждая со сравнением. */
    function regBox(c, k, A, P, b, on) {
      const [x, y, w, h] = b, col = on ? P.spr : A.alpha(P.spr, 0.6);
      A.rect(c, x, y, w, h, 9, on ? A.alpha(P.out, 0.13) : P.surf, on ? P.out : P.line, on ? 1.8 : 1.2);
      txt(c, k, 'ПД-регулятор · 1 кГц', x + w / 2, y + 14, w - 12, { px: 11.5, weight: 750, color: P.ink });
      [['П', 'тянет к цели, как пружина'], ['Д', 'гасит скорость, как демпфер']].forEach(([tag, text], i) => {
        const ry = y + h - 27 + i * 15.5;
        A.rect(c, x + 8, ry - 7, 15, 14, 3.5, A.alpha(P.spr, on ? 0.2 : 0.1), col, 1.2);
        txt(c, k, tag, x + 15.5, ry, 13, { px: 10, weight: 800, color: col });
        txt(c, k, text, x + 28, ry, w - 33, { px: 10, weight: 600, color: P.ink2, align: 'left' });
      });
    }
    /** Рука сбоку: звенья, суставы с моторами (дуга — момент) и энкодерами (метки по кругу). */
    function arm(c, k, A, P, G, q, tq, o) {
      const m = (x, y) => [G.sx + x * G.S, G.sy - y * G.S], p = fk(q), b = m(0, 0), j = m(p.x1, p.y1), e = m(p.x, p.y);
      if (o.ghost) {
        const g = fk(o.ghost), gj = m(g.x1, g.y1), ge = m(g.x, g.y);
        A.line(c, [b, gj, ge], A.alpha(P.out, 0.85), 2.4, [5, 5]);
      }
      // основание
      c.beginPath(); c.rect(b[0] - 16, b[1] + 8, 32, 12); c.fillStyle = P.surf2; c.fill(); A.hatchBox(c, b[0] - 16, b[1] + 8, b[0] + 16, b[1] + 20, P); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(b[0] - 16, b[1] + 8, 32, 12);
      A.line(c, [b, [b[0], b[1] + 8]], P.ink2, 4);
      A.line(c, [b, j, e], P.ink, 6.5);
      // моторы: дуга момента вокруг сустава, длина — величина момента
      [[b, 13, tq[0]], [j, 11, tq[1]]].forEach(([pt, r, t]) => {
        const enc = o.enc || 0;
        for (let i = 0; i < 10; i++) { const a = i * TAU / 10; A.line(c, [[pt[0] + Math.cos(a) * (r + 3.5), pt[1] + Math.sin(a) * (r + 3.5)], [pt[0] + Math.cos(a) * (r + 6.5), pt[1] + Math.sin(a) * (r + 6.5)]], enc > 0 ? A.alpha(P.out, 0.4 + 0.6 * enc) : A.alpha(P.ink3, 0.55), 1.3); }
        A.circle(c, pt[0], pt[1], r - 4, P.surf, P.ink, 2);
        const s = clamp(Math.abs(t) / REC.mx, 0, 1), ga = c.globalAlpha;
        if (s > 0.02 && o.mot > 0) {
          c.globalAlpha = ga * o.mot;
          const span = 0.4 + 3.6 * s, dir = t > 0 ? -1 : 1, a0 = -Math.PI / 2, a1 = a0 + dir * span;
          c.beginPath(); c.arc(pt[0], pt[1], r, a0, a1, dir < 0); c.strokeStyle = P.out; c.lineWidth = 2.4; c.lineCap = 'round'; c.stroke();
          const hx = pt[0] + Math.cos(a1) * r, hy = pt[1] + Math.sin(a1) * r, tg = a1 + dir * Math.PI / 2;
          c.beginPath(); c.moveTo(hx + Math.cos(tg) * 5, hy + Math.sin(tg) * 5); c.lineTo(hx + Math.cos(tg + 2.4) * 5, hy + Math.sin(tg + 2.4) * 5); c.lineTo(hx + Math.cos(tg - 2.4) * 5, hy + Math.sin(tg - 2.4) * 5); c.closePath(); c.fillStyle = P.out; c.fill();
          c.globalAlpha = ga;
        }
      });
      A.circle(c, e[0], e[1], 5, P.ink);
      return { b, j, e };
    }
    /** Полоса времени: метки политики (раз в 20 мс) и регулятора (раз в 1 мс), курсор — время робота. */
    function timeline(c, k, A, P, G, r, pol) {
      const T0 = G.tl, X = (ms) => T0.x0 + (T0.x1 - T0.x0) * ms / MS;
      txt(c, k, 'политика', T0.lx, T0.y1, T0.x0 - T0.lx - 6, { px: 10.5, weight: 700, color: P.mot, align: 'left' });
      txt(c, k, 'регулятор', T0.lx, T0.y2, T0.x0 - T0.lx - 6, { px: 10.5, weight: 700, color: P.out, align: 'left' });
      A.line(c, [[X(0), T0.y1], [X(MS), T0.y1]], P.grid, 1); A.line(c, [[X(0), T0.y2], [X(MS), T0.y2]], P.grid, 1);
      for (let i = 1; i <= MS; i++) { const on = r >= i - 1e-6; A.line(c, [[X(i), T0.y2 - 5], [X(i), T0.y2 + 5]], on ? P.out : P.line, on ? 1.8 : 1.3); }
      for (const ms of [0, 20, 40]) { const on = ms === 0 ? pol : r >= ms; A.line(c, [[X(ms), T0.y1 - 8], [X(ms), T0.y1 + 8]], on ? P.mot : P.line, 2.4); A.circle(c, X(ms), T0.y1, 3.6, on ? P.mot : P.surf2, on ? P.mot : P.line, 1.4); }
      if (r >= 20) txt(c, k, T0.two ? ['20 шагов', 'регулятора'] : '20 шагов регулятора', (X(0) + X(20)) / 2, T0.y1, X(20) - X(0) - 14, { px: 10, weight: 650, color: P.ink2, halo: true, haloColor: P.surf2, lh: 1.15 });
      for (const [ms, al] of [[0, 'center'], [20, 'center'], [40, 'center']]) txt(c, k, ms === 40 ? '40 мс' : String(ms), X(ms), T0.ya, 50, { px: 10, mono: true, color: P.ink3, align: al });
      if (r > 0 && !G.after) {
        const x = X(r); A.line(c, [[x, T0.y1 - 12], [x, T0.y2 + 8]], P.ink2, 1.2);
        txt(c, k, `${A.fmt(r, r < 10 ? 1 : 0)} мс`, x, T0.yc, 60, { px: 10, mono: true, weight: 700, color: P.ink2 });
      }
    }
    function draw(c, k, t, P, A, G) {
      A0 = A;
      const { seg } = A, u = ((t % T) + T) % T, r = robotMs(u);
      const pPol = seg(u, ...PH.pol), pIk = seg(u, ...PH.ik), slow = u >= PH.slow[0] && u < PH.slow[1], fast = u >= PH.fast[0] && u < PH.fast[1], after = u >= PH.fast[1];
      const fade = 1 - seg(u, ...PH.fade); c.globalAlpha = fade;
      // какая цель сейчас: вторая приходит на 20-й мс; в быстром этапе политика и кинематика вспыхивают на 20-й мс
      const ti = r >= 20 ? 1 : 0, flash = fast && r >= 20 && r < 23.5, fl = flash ? (r - 20) / 3.5 : 0;
      const polOn = (pPol > 0 && pPol < 1) || (flash && fl < 0.5), ikOn = (pIk > 0 && pIk < 1) || (flash && fl >= 0.35);
      const targetShown = pPol >= 0.75 || u >= PH.ik[0], ghostShown = pIk >= 0.6 || u >= PH.slow[0];
      // шаг регулятора в замедленном этапе: 0–0.35 считает, 0.35–0.6 момент к моторам, 0.6–0.85 рука движется, 0.85–1 энкодеры
      const sf = slow ? ((u - PH.slow[0]) / STEP) % 1 : 0;
      const regOn = (slow && sf < 0.4) || fast || after, motOn = slow ? (sf >= 0.3 && sf < 0.88 ? 1 : 0.35) : fast || after ? 1 : 0, encOn = slow ? (sf >= 0.82 ? 1 : 0) : fast ? 0.6 : 0;
      // ---------- блоки ----------
      box(c, k, A, P, G.pol, 'Политика · 50 Гц', 'нейросеть', polOn, P.mot);
      poly(c, A, G.a1, polOn || targetShown ? P.ink2 : P.line, 1.5);
      dots(c, A, G.a1, pPol > 0 && pPol < 1 ? A.seg(pPol, 0.35, 0.95) : flash ? fl * 2.2 : 0, P.mot);
      txt(c, k, 'поза захвата', G.a1L[0], G.a1L[1], G.a1L[2], { px: 10.5, weight: 650, color: targetShown ? P.mot : P.ink3 });
      box(c, k, A, P, G.ik, 'Обратная кинематика', G.ikS, ikOn, P.out);
      poly(c, A, G.a2, ghostShown ? P.ink2 : P.line, 1.5);
      dots(c, A, G.a2, pIk > 0 && pIk < 1 ? A.seg(pIk, 0.4, 0.95) : flash ? (fl - 0.35) * 2 : 0, P.out);
      txt(c, k, 'целевые углы', G.a2L[0], G.a2L[1], G.a2L[2], { px: 10.5, weight: 650, color: ghostShown ? P.out : P.ink3, align: G.a2L[3] || 'left' });
      regBox(c, k, A, P, G.reg, regOn && u >= PH.slow[0]);
      poly(c, A, G.a3, motOn > 0.5 ? P.ink2 : P.line, 1.5);
      dots(c, A, G.a3, slow ? A.seg(sf, 0.3, 0.62) : 0, P.out);
      if (fast) dots(c, A, G.a3, (u * 1.4) % 1, P.out, true, 2);
      txt(c, k, 'моменты', G.a3L[0], G.a3L[1], G.a3L[2], { px: 10.5, weight: 650, color: motOn > 0.5 ? P.out : P.ink3, align: G.a3L[3] || 'center' });
      // ---------- рука ----------
      const [px, py, pw, ph] = G.arm;
      A.rect(c, px, py, pw, ph, 10, P.surf, P.line, 1.2);
      txt(c, k, 'Рука', G.armT[0], G.armT[1], 80, { px: 12, weight: 750, color: P.ink, align: 'left' });
      const q = at(REC.q, r), tq = at(REC.tau, Math.floor(r + 1e-9));
      const ghost = ghostShown ? QT[ti] : null;
      arm(c, k, A, P, G, q, tq, { ghost, mot: motOn, enc: encOn });
      if (targetShown) {
        const tp = PTS[ti + 1], cx = G.sx + tp[0] * G.S, cy = G.sy - tp[1] * G.S, a = clamp(pPol >= 1 ? 1 : (pPol - 0.75) * 4, 0, 1);
        c.globalAlpha = fade * a; cross(c, cx, cy, P.mot, 8); c.globalAlpha = fade;
        txt(c, k, 'цель', cx + G.goalOff[0], cy + G.goalOff[1], 50, { px: 10.5, weight: 700, color: P.mot, align: 'left', halo: true, haloColor: P.surf });
      }
      txt(c, k, G.armL[2], G.armL[0], G.armL[1], pw - 12, { px: 10, weight: 600, color: P.ink3 });
      // ---------- обратная связь: энкодеры → регулятор ----------
      poly(c, A, G.fb, encOn > 0.5 || fast || after ? P.out : P.line, 1.5);
      dots(c, A, G.fb, slow ? A.seg(sf, 0.84, 1) : 0, P.out, false, 3);
      if (fast) dots(c, A, G.fb, (u * 0.9) % 1, P.out, true, 4);
      txt(c, k, G.fbL[2], G.fbL[0], G.fbL[1], G.fbL[3], { px: 10.5, weight: 650, color: encOn > 0.5 || fast || after ? P.out : P.ink3, align: G.fbL[4] || 'center', top: true });
      // ---------- время ----------
      G.after = after; timeline(c, k, A, P, G, r, pPol > 0);
      // ---------- что происходит ----------
      const st = u < PH.ik[0] ? 'Политика выдаёт цель: позу захвата.'
        : u < PH.slow[0] ? 'Обратная кинематика переводит позу захвата в целевые углы суставов.'
        : u < PH.fast[0] ? 'Регулятор сравнивает целевые углы с углами от энкодеров и считает моменты моторов из пропорциональной и дифференциальной составляющих.'
        : u < PH.fast[1] ? 'Регулятор повторяет этот круг 1000 раз в секунду, а новая цель от политики приходит 50 раз в секунду.'
        : 'На каждую цель политики приходится 20 шагов регулятора. Между командами политики руку к цели ведёт регулятор.';
      txt(c, k, st, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35, top: true });
      c.globalAlpha = 1;
    }
    Anim.add('ctrl-loop', {
      W: 720, H: 416, start: 16, narrowAt: 700,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          pol: [16, 30, 150, 48], a1: [[166, 54], [238, 54]], a1L: [202, 41, 70],
          ik: [240, 30, 172, 48], ikS: 'поза → углы суставов', a2: [[326, 78], [326, 116]], a2L: [334, 97, 90],
          reg: [210, 118, 214, 62], a3: [[424, 149], [476, 149]], a3L: [450, 136, 50],
          arm: [478, 16, 228, 250], armT: [490, 34], sx: 520, sy: 230, S: 210, goalOff: [12, -10], armL: [592, 258, 'в каждом суставе мотор и энкодер'],
          fb: [[592, 266], [592, 282], [104, 282], [104, 149], [208, 149]], fbL: [348, 296, 'энкодеры: углы и скорости суставов', 300],
          tl: { lx: 16, x0: 104, x1: 698, y1: 330, y2: 352, ya: 368, yc: 314 },
          st: [16, 392, 690],
        });
      },
      narrow: {
        W: 360, H: 556,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            pol: [14, 28, 136, 48], a1: [[150, 52], [178, 52]], a1L: [164, 14, 90],
            ik: [180, 28, 166, 48], ikS: 'поза → углы суставов', a2: [[263, 76], [263, 106]], a2L: [255, 91, 110, 'right'],
            reg: [140, 106, 206, 60], a3: [[248, 166], [248, 192]], a3L: [256, 179, 80, 'left'],
            arm: [14, 192, 332, 186], armT: [26, 210], sx: 100, sy: 336, S: 186, goalOff: [12, -10], armL: [180, 366, 'в каждом суставе мотор и энкодер'],
            fb: [[30, 192], [30, 136], [138, 136]], fbL: [35, 150, ['энкодеры:', 'углы и скорости'], 101, 'left'],
            tl: { lx: 14, x0: 86, x1: 330, y1: 414, y2: 436, ya: 452, yc: 398, two: true },
            st: [14, 478, 332],
          });
        },
      },
    });
  })();

  /* =====================================================================
     mpc-horizon — скользящий горизонт
     ===================================================================== */
  (() => {
    const WX = 2.3, WY = 1.15, R = 0.06, S0 = [0.22, 0.5], GOAL = [2.06, 0.5], WALL = [0.98, 0.24, 1.1, 0.68];
    const STEP = 0.12, HZ = 7, NI = 4, DA = 0.32, BETA = 0.22, PUSH_K = 5, PUSH = [0, -0.12];
    const hitW = (x, y) => x > WALL[0] - R && x < WALL[2] + R && y > WALL[1] - R && y < WALL[3] + R;
    const hitB = (x, y) => y < R || y > WY - R || x < R || x > WX - R;
    const dG = (x, y) => Math.hypot(GOAL[0] - x, GOAL[1] - y);
    const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
    /** Варианты плана: 9 начальных курсов вокруг направления на цель, дальше курс поворачивает к цели не больше
     *  чем на 0,22 рад за шаг. Вариант, который задел стену, обрывается у неё и получает штраф 2. */
    function cands(p) {
      const out = [];
      for (let i = -NI; i <= NI; i++) {
        const pts = [p.slice()]; let x = p[0], y = p[1], a = Math.atan2(GOAL[1] - y, GOAL[0] - x) + i * DA, bad = false;
        for (let j = 0; j < HZ; j++) {
          if (j) { const d = wrapA(Math.atan2(GOAL[1] - y, GOAL[0] - x) - a); a += clamp(d, -BETA, BETA); }
          const dg = dG(x, y);
          if (dg < 0.005) { pts.push([x, y]); continue; }
          const nx = dg <= STEP ? GOAL[0] : x + Math.cos(a) * STEP, ny = dg <= STEP ? GOAL[1] : y + Math.sin(a) * STEP, mx = (x + nx) / 2, my = (y + ny) / 2;
          if (hitW(nx, ny) || hitW(mx, my) || hitB(nx, ny) || hitB(mx, my)) { bad = true; pts.push([mx, my]); break; }
          x = nx; y = ny; pts.push([x, y]);
        }
        let run = 0; for (const [px, py] of pts) run += dG(px, py);
        const e = pts[pts.length - 1];
        out.push({ pts, bad, cost: dG(e[0], e[1]) + 0.3 * run / HZ + (bad ? 2 : 0) });
      }
      return out;
    }
    /** Вся поездка: на каждом шаге — варианты, лучший план, исполняется первый шаг. Перед шагом PUSH_K робота толкают. */
    const RUN = (() => {
      const steps = []; let p = S0.slice();
      for (let k = 0; k < 40; k++) {
        let from = null;
        if (k === PUSH_K) { from = p.slice(); p = [p[0] + PUSH[0], p[1] + PUSH[1]]; }
        const cs = cands(p); let b = cs[0]; for (const c of cs) if (c.cost < b.cost) b = c;
        steps.push({ p: p.slice(), from, cs, best: b });
        p = b.pts[1];
        if (dG(p[0], p[1]) < 0.01) break;
      }
      return { steps, end: p };
    })();
    const N = RUN.steps.length;
    // расписание: шаг 0 подробно, шаг 1 — заново с нового места, дальше быстро; шаг с толчком снова подробно
    const SCH = []; let t0 = 0.4;
    RUN.steps.forEach((s, k) => {
      const kind = k === 0 ? 'full' : k === 1 ? 're' : k === PUSH_K ? 'push' : 'fast';
      const d = kind === 'full' ? { push: 0, cand: 2.0, best: 1.1, exec: 1.3 } : kind === 're' ? { push: 0, cand: 1.0, best: 0.6, exec: 0.7 } : kind === 'push' ? { push: 1.4, cand: 1.0, best: 0.6, exec: 0.7 } : { push: 0, cand: 0, best: k < 11 ? 0.32 : 0.22, exec: k < 11 ? 0.3 : 0.22 };
      const a = t0, b = a + d.push, c2 = b + d.cand, e = c2 + d.best, f = e + d.exec;
      SCH.push({ k, kind, a, b, c: c2, e, f }); t0 = f;
    });
    const END = t0, PH = { fade: [END + 3.2, END + 4.0] }, T = END + 4.0;
    function draw(c, k, t, P, A, G) {
      const { seg, ease, lerp } = A, u = ((t % T) + T) % T, fade = 1 - seg(u, ...PH.fade);
      c.globalAlpha = fade;
      const F = G.floor, m = (x, y) => [F[0] + x * G.S, F[1] + (WY - y) * G.S];
      // какой шаг сейчас и что в нём происходит
      let cur = SCH.find((s) => u < s.f) || null; const done = !cur, k0 = cur ? cur.k : N;
      const st = cur ? RUN.steps[cur.k] : null;
      const pPush = cur ? seg(u, cur.a, cur.b) : 0, pCand = cur ? seg(u, cur.b, cur.c) : 1, pBest = cur ? seg(u, cur.c, cur.e) : 1, pExec = cur ? seg(u, cur.e, cur.f) : 1;
      // ---------- пол, стены, старт и цель ----------
      A.rect(c, F[0], F[1], F[2], F[3], 8, P.surf, null);
      c.save(); c.beginPath(); c.roundRect(F[0], F[1], F[2], F[3], 8); c.clip();
      K.grid(c, F[0] + F[2], F[1] + F[3], G.S * 0.1, P.grid);
      c.restore();
      A.rect(c, F[0], F[1], F[2], F[3], 8, null, P.ink2, 2);
      const w0 = m(WALL[0], WALL[3]), w1 = m(WALL[2], WALL[1]);
      c.beginPath(); c.rect(w0[0], w0[1], w1[0] - w0[0], w1[1] - w0[1]); c.fillStyle = P.surf2; c.fill(); A.hatchBox(c, w0[0], w0[1], w1[0], w1[1], P); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.strokeRect(w0[0], w0[1], w1[0] - w0[0], w1[1] - w0[1]);
      txt(c, k, 'стена', (w0[0] + w1[0]) / 2, w1[1] + 12, 60, { px: 10.5, weight: 650, color: P.ink3 });
      const s0 = m(...S0), g = m(...GOAL);
      A.circle(c, s0[0], s0[1], 7, null, P.ink3, 1.5); txt(c, k, 'старт', s0[0], s0[1] + G.lOff, 60, { px: 10.5, color: P.ink3, halo: true, haloColor: P.surf });
      cross(c, g[0], g[1], P.ink, 8); txt(c, k, 'цель', g[0], g[1] + G.lOff, 60, { px: 10.5, weight: 650, color: P.ink2, halo: true, haloColor: P.surf });
      // ---------- пройденный путь ----------
      const tr1 = [m(...S0)]; let tr2 = null, pushAt = null;
      for (let i = 1; i <= Math.min(k0, N); i++) {
        const sI = i < N ? RUN.steps[i] : null;
        if (sI && sI.from) {                                                // шаг с толчком: путь до толчка, прыжок пунктиром, дальше новый отрезок
          tr1.push(m(...sI.from));
          if (i < k0 || pPush > 0.6) { pushAt = [m(...sI.from), m(...sI.p)]; tr2 = [m(...sI.p)]; }
          continue;
        }
        (tr2 || tr1).push(m(...(sI ? sI.p : RUN.end)));
      }
      A.line(c, tr1, P.out, 2.6); if (tr2 && tr2.length > 1) A.line(c, tr2, P.out, 2.6);
      if (pushAt) A.line(c, pushAt, A.alpha(P.bad, 0.7), 1.6, [3, 3]);
      // ---------- текущий шаг: варианты, лучший план, исполнение ----------
      let rob = done ? m(...RUN.end) : m(...st.p);
      if (cur) {
        if (cur.kind === 'push' && pPush < 1) {                              // толчок: старый план, стрелка, робот сдвигается
          const prev = RUN.steps[cur.k - 1].best.pts, sh = ease(seg(pPush, 0.25, 0.6));
          A.line(c, prev.slice(1).map((q) => m(...q)), A.alpha(P.out, 0.45), 1.6, [5, 4]);
          const f0 = m(...st.from); rob = [lerp(f0[0], rob[0], sh), lerp(f0[1], rob[1], sh)];
          A.arrow(c, f0[0] + 14, f0[1] - 26, f0[0] + 4, f0[1] - 9, P.bad, 2.2, 7);
          txt(c, k, 'толчок', f0[0] + 18, f0[1] - 34, 70, { px: 10.5, weight: 750, color: P.bad, align: 'left', halo: true, haloColor: P.surf });
        }
        if (pPush >= 1 && cur.kind !== 'fast') {                              // варианты появляются по одному
          const n = st.cs.length, shown = pCand * n;
          st.cs.forEach((cd, i) => {
            const a = clamp(shown - i, 0, 1); if (a <= 0) return;
            const fadeOut = pBest > 0 ? 1 - 0.55 * ease(pBest) : 1;
            const pts = cd.pts.map((q) => m(...q)), np = Math.max(2, Math.ceil(pts.length * a));
            c.globalAlpha = fade * fadeOut * (cd.bad ? 0.75 : 0.9);
            A.line(c, pts.slice(0, np), cd.bad ? A.alpha(P.bad, 0.6) : A.alpha(P.ink3, 0.7), 1.3);
            if (cd.bad && a >= 1) K.cross(c, pts[pts.length - 1][0], pts[pts.length - 1][1], 3.2, A.alpha(P.bad, 0.85), 1.6);
            c.globalAlpha = fade;
          });
        }
        if (pBest > 0 || cur.kind === 'fast') {                              // лучший план: пунктир с точками шагов
          const pts = st.best.pts.map((q) => m(...q)), ex = ease(pExec);
          const a = cur.kind === 'fast' ? 1 : Math.min(1, pBest * 2);
          c.globalAlpha = fade * a * (1 - 0.6 * ex);
          A.line(c, pts, P.out, 2, [5, 4]);
          pts.slice(2).forEach((q) => A.circle(c, q[0], q[1], 2.6, P.surf, P.out, 1.4));
          c.globalAlpha = fade * a;
          A.line(c, [pts[0], pts[1]], P.out, 3.2);
          A.circle(c, pts[1][0], pts[1][1], 3.2, P.out);
          c.globalAlpha = fade;
          rob = [lerp(pts[0][0], pts[1][0], ex), lerp(pts[0][1], pts[1][1], ex)];
          if (pExec > 0) A.line(c, [pts[0], rob], P.out, 2.6);
        }
      }
      A.circle(c, rob[0], rob[1], R * G.S, P.out, P.surf, 2);
      // ---------- легенда ----------
      G.leg.forEach(([x, y, kind, label]) => {
        const x1 = x + 24;
        if (kind === 'cand') A.line(c, [[x, y], [x1, y]], A.alpha(P.ink3, 0.8), 1.4);
        else if (kind === 'bad') { A.line(c, [[x, y], [x1 - 4, y]], A.alpha(P.bad, 0.65), 1.4); K.cross(c, x1 - 3, y, 3, A.alpha(P.bad, 0.85), 1.5); }
        else if (kind === 'plan') { A.line(c, [[x, y], [x + 8, y]], P.out, 3); A.line(c, [[x + 8, y], [x1, y]], P.out, 1.8, [4, 3]); }
        else A.line(c, [[x, y], [x1, y]], P.out, 2.6);
        txt(c, k, label, x1 + 7, y, G.legW, { px: 10.5, weight: 600, color: P.ink2, align: 'left' });
      });
      // ---------- окно горизонта на полосе шагов ----------
      const B = G.strip, ncell = N + HZ - 1, cw = (B.x1 - B.x0) / ncell, kk = done ? N : k0, execd = done ? N : k0 + (pExec >= 1 ? 1 : 0);
      for (let i = 0; i < ncell; i++) {
        const x = B.x0 + i * cw + 1.5, w = cw - 3, inWin = !done && i >= kk && i < kk + HZ && (pBest > 0 || cur.kind === 'fast');
        if (i < execd) A.rect(c, x, B.y, w, B.h, 3, A.alpha(P.out, 0.75), null);
        else if (inWin && i === kk) A.rect(c, x, B.y, w, B.h, 3, A.alpha(P.out, 0.25 + 0.5 * ease(pExec)), P.out, 1.6);
        else if (inWin) { A.rect(c, x, B.y, w, B.h, 3, P.surf, null); c.setLineDash([3, 2]); A.rect(c, x, B.y, w, B.h, 3, null, P.out, 1.2); c.setLineDash([]); }
        else A.rect(c, x, B.y, w, B.h, 3, P.surf, P.line, 1);
      }
      if (!done && (pBest > 0 || cur.kind === 'fast')) {
        const xa = B.x0 + kk * cw + 1.5, xb = B.x0 + (kk + HZ) * cw - 1.5, yb = B.y - 6;
        A.line(c, [[xa, yb + 3], [xa, yb], [xb, yb], [xb, yb + 3]], P.out, 1.4);
        const lw = G.winLab ? G.winLab : 'горизонт: 7 шагов';
        K.font(c, k, 10.5, 700); const tw = c.measureText(lw).width, cx = clamp((xa + xb) / 2, B.x0 + tw / 2 + 2, B.x1 - tw / 2 - 2);
        txt(c, k, lw, cx, yb - 9, 200, { px: 10.5, weight: 700, color: P.out });
        const sx = B.x0 + (kk + 0.5) * cw; K.font(c, k, 10, 650); const sw = c.measureText('сейчас').width;
        txt(c, k, 'сейчас', clamp(sx, B.x0 + sw / 2 + 2, B.x1 - sw / 2 - 2), B.y + B.h + 11, 80, { px: 10, weight: 650, color: P.ink2 });
      }
      // ---------- что происходит ----------
      const s1 = done ? 'Робот доехал до цели. На каждом шаге он строил план на 7 шагов вперёд, исполнял только первый шаг и планировал заново.'
        : cur.kind === 'push' && pPush < 1 ? 'Толчок сдвинул робота. Следующий план строится от того места, где робот оказался.'
        : cur.kind === 'fast' ? 'Так происходит на каждом шаге: план строится от текущего места, а исполняется только его первый шаг.'
        : pCand < 1 ? (cur.kind === 'full' ? 'Планировщик по модели проверяет варианты движения на 7 шагов вперёд.' : cur.kind === 're' ? 'С нового места план строится заново, и горизонт сдвигается на шаг вперёд.' : 'Новый план строится от нового места.')
        : pBest < 1 ? 'Лучший вариант ближе всех подводит к цели и не задевает стену.'
        : 'Робот исполняет только первый шаг плана.';
      txt(c, k, s1, G.st[0], G.st[1], G.st[2], { px: 11.5, weight: 700, color: P.ink, align: 'left', wrap: true, lh: 1.35, top: true });
      c.globalAlpha = 1;
    }
    Anim.add('mpc-horizon', {
      W: 720, H: 336, start: END + 1.5, narrowAt: 700,
      draw(c, k, t, P, A) {
        draw(c, k, t, P, A, {
          floor: [14, 14, 470, 235], S: 470 / WX, lOff: 20,
          leg: [[502, 30, 'cand', 'варианты'], [502, 52, 'bad', 'задевают стену'], [502, 74, 'plan', 'лучший план'], [502, 96, 'trail', 'пройденный путь']], legW: 170,
          strip: { x0: 14, x1: 706, y: 284, h: 18 },
          st: [502, 128, 204],
        });
      },
      narrow: {
        W: 360, H: 380,
        draw(c, k, t, P, A) {
          draw(c, k, t, P, A, {
            floor: [14, 14, 332, 166], S: 332 / WX, lOff: 17,
            leg: [[14, 200, 'cand', 'варианты'], [184, 200, 'bad', 'задевают стену'], [14, 222, 'plan', 'лучший план'], [184, 222, 'trail', 'пройденный путь']], legW: 140,
            strip: { x0: 14, x1: 346, y: 262, h: 14 },
            st: [14, 306, 332],
          });
        },
      },
    });
  })();
})();
