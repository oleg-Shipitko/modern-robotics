/* =====================================================================
   flow.js — урок 2.3: анимированная схема устройства VoxPoser на общем
   движке shared/anim.js (раздел «Карта», канвас data-anim="voxposer").
   Путь данных: просьба → языковая модель пишет код → детектор (модель зрения
   и языка) находит ручку и вазу → код заполняет карту притяжения и карту
   избегания в вокселях → стоимость клетки как взвешенная сумма с весами 2 и 1
   → планировщик строит путь → пока захват едет и вазу двигают, путь
   пересчитывается 5 раз в секунду.
   Карты, стоимость и путь считает движок лаборатории (l23/engine.js): тот же
   срез 60 × 40 клеток, те же веса. Цвета как в лаборатории: зелёный —
   притяжение, красный — избегание, фиолетовый — стоимость, оранжевый — путь
   захвата, синий — найденное детектором и сам захват.
   Две раскладки: широкая (три ряда) и узкая для телефона (столбиком).
   Кадр — функция времени t, без накопленного состояния: кадры для проверок
   и снимков берутся через Anim.seek.
   ===================================================================== */
'use strict';
(() => {
  if (typeof Anim === 'undefined') {                       // shared/anim.js не подключён: пустую рамку схемы не показываем
    document.querySelectorAll('canvas[data-anim=voxposer]').forEach((cv) => { const f = cv.closest('figure'); if (f) f.hidden = true; });
    return;
  }
  const K = HeroKit, E = L23;
  const fx = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');

  /* ---------- подписи (как в l22/flow.js) ---------- */
  /** Фраза — в строки не шире maxW. */
  function wrap(c, k, text, maxW, px, weight, mono) {
    K.font(c, k, px, weight, mono); const out = []; let cur = '';
    for (const w of String(text).split(' ')) { const t2 = cur ? cur + ' ' + w : w; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = w; } else cur = t2; }
    if (cur) out.push(cur); return out;
  }
  /** Подпись в одну или несколько строк (массив, или перенос по словам при o.wrap), ужатая до maxW, но не мельче 10 px; y — середина блока. */
  function txt(c, k, A, text, x, y, maxW, o) {
    o = Object.assign({ px: 11, weight: 600, halo: false }, o || {});
    const lines = Array.isArray(text) ? text : o.wrap && maxW ? wrap(c, k, text, maxW, o.px, o.weight, o.mono) : [String(text)];
    let px = o.px; K.font(c, k, px, o.weight, o.mono);
    const w = Math.max(...lines.map((s) => c.measureText(s).width));
    if (maxW && w > maxW) px = Math.max(10, px * maxW / w);
    const lh = px * k * (o.lh || 1.3), y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach((s, i) => A.lab(c, k, s, x, y0 + i * lh, Object.assign({}, o, { px })));
    return lines.length;
  }
  /** Строка «что происходит» внизу схемы, с переносом по словам; y — середина первой строки. */
  function status(c, k, A, P, text, x, y, maxW) {
    const ls = wrap(c, k, text, maxW, 11.5, 700), lh = 11.5 * k * 1.35;
    txt(c, k, A, ls, x, y + (ls.length - 1) * lh / 2, maxW, { px: 11.5, weight: 700, color: P.ink, align: 'left', lh: 1.35 });
  }
  /** Блок схемы: рамка и заголовок; on — этап идёт сейчас, started — уже был. */
  function block(c, k, A, P, x, y, w, h, title, on, started) {
    A.rect(c, x, y, w, h, 10, P.surf, on ? P.ink2 : P.line, on ? 1.6 : 1);
    txt(c, k, A, title, x + w / 2, y + 14, w - 14, { px: 11, weight: 750, color: on ? P.ink : started ? P.ink2 : P.ink3 });
  }

  /* ---------- данные: код, карты, езда с пересчётом ---------- */
  const ASK = '«открой верхний ящик и не задень вазу»';
  const CODE = ['handle = detect("ручка")', 'vase = detect("ваза")', 'attraction[handle] = 1', 'avoidance[vase, r=8 см] = 1', 'execute(attraction, avoidance)'];
  const cm = (v) => fx(v * E.CM, 1);
  const PLAN0 = E.voxPlan({ vase: E.VASE0, avoid: true, wo: 1 });        // карты и путь при вазе на месте
  const VASE_CM = `${cm(E.VASE0.x)}, ${cm(E.VASE0.y)} см`, HANDLE_CM = `${cm(E.TARGET.x)}, ${cm(E.TARGET.y)} см`;
  /** Езда с пересчётом 5 раз в секунду: вазу плавно переставляют на путь, захват идёт по свежему пути. Кадры по 0,2 с. */
  const GO = (() => {
    const DT = 0.2, V = 9, T0 = 0.3, T1 = 1.3, frames = [];
    const p0 = PLAN0.path; let s = 0, iT = p0.length - 1;
    for (let i = 1; i < p0.length; i++) { s += Math.hypot(p0[i].x - p0[i - 1].x, p0[i].y - p0[i - 1].y); if (s >= 25) { iT = i; break; } }
    const tgt = p0[iT];                                                    // точка пути в 25 клетках от старта: туда переставят вазу
    let grip = Object.assign({}, E.START), t = 0;
    for (let j = 0; j < 40; j++) {
      const u = Math.max(0, Math.min(1, (t - T0) / (T1 - T0))), e = (1 - Math.cos(Math.PI * u)) / 2;
      const vase = { x: E.VASE0.x + (tgt.x - E.VASE0.x) * e, y: E.VASE0.y + (tgt.y - E.VASE0.y) * e };
      const plan = E.voxPlan({ vase, avoid: true, wo: 1, start: grip });
      const done = Math.hypot(grip.x - E.TARGET.x, grip.y - E.TARGET.y) < 1;
      frames.push({ t, grip: Object.assign({}, grip), vase, path: plan.path, C: plan.C, done });
      if (done) break;
      let move = V * DT, idx = 1, g = Object.assign({}, grip);
      while (move > 0 && idx < plan.path.length) {
        const q = plan.path[idx], d = Math.hypot(q.x - g.x, q.y - g.y);
        if (d <= move) { g = { x: q.x, y: q.y }; move -= d; idx++; } else { g = { x: g.x + (q.x - g.x) * move / d, y: g.y + (q.y - g.y) * move / d }; move = 0; }
      }
      grip = g; t += DT;
    }
    return { frames, DT };
  })();
  const T_GO = GO.frames[GO.frames.length - 1].t + 0.6;                  // сколько длится этап езды
  const PH = { ask: [0, 1.4], code: [1.4, 4.0], det: [4.0, 5.8], maps: [5.8, 7.8], cost: [7.8, 9.2], plan: [9.2, 10.8], go: [10.8, 10.8 + T_GO] };
  const T = PH.go[1] + 1.6;                                              // полный цикл

  /* ---------- карты вида сверху (как в лаборатории) ---------- */
  function heat(c, x, y, w, h, vals, col, amax, f, pr) {
    if (pr <= 0) return;
    const cw = w / E.VW, ch = h / E.VH; let mx = 1e-9, mn = Infinity; for (const v of vals) { if (v > mx) mx = v; if (v < mn) mn = v; }
    c.fillStyle = col;
    for (let i = 0; i < vals.length; i++) { const a = f ? f(vals[i], mn, mx) : vals[i] / mx; if (a < 0.02) continue; c.globalAlpha = Math.min(1, a) * amax * pr; c.fillRect(x + (i % E.VW) * cw, y + Math.floor(i / E.VW) * ch, cw + 0.3, ch + 0.3); }
    c.globalAlpha = 1;
  }
  /** Срез карты: рамка, комод, ручка, ваза, захват; kind — 'aff' | 'avoid' | 'cost' | null; o: { pr, path, pathPr, vase, grip, vals, hot } */
  function mapView(c, k, A, P, x, y, w, h, kind, o) {
    const cw = w / E.VW, ch = h / E.VH, vase = o.vase || E.VASE0, grip = o.grip || E.START, pr = o.pr == null ? 1 : o.pr;
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 4); c.clip();
    c.fillStyle = P.surf2; c.fillRect(x, y, w, h);
    if (kind === 'aff') heat(c, x, y, w, h, o.vals || PLAN0.A, P.good, 0.6, (v) => v * v, pr);
    else if (kind === 'avoid') heat(c, x, y, w, h, o.vals || PLAN0.O, P.bad, 0.65, null, pr);
    else if (kind === 'cost') heat(c, x, y, w, h, o.vals || PLAN0.C, P.spr, 0.62, (v, mn, mx) => Math.pow((v - mn) / (mx - mn || 1), 1.6), pr);
    // комод: штриховка, как в лаборатории
    const D = E.DRESSER, dx0 = x + D.x0 * cw, dx1 = x + (D.x1 + 1) * cw, dy1 = y + (D.y1 + 1) * ch;
    c.beginPath(); c.rect(dx0, y, dx1 - dx0, dy1 - y); c.fillStyle = P.surf; c.fill(); K.hatch(c, dx0, y, dx1, dy1, P.ink3, 5, 0.7); c.strokeStyle = P.ink3; c.lineWidth = 0.9; c.strokeRect(dx0, y, dx1 - dx0, dy1 - y);
    // ручка верхнего ящика
    const hx = x + E.TARGET.x * cw + cw / 2; c.fillStyle = o.hot === 'handle' || kind === 'aff' ? P.good : P.ink3; c.fillRect(hx - 5 * cw, dy1 + 0.5, 10 * cw, 2.2);
    // путь
    if (o.path && o.path.length > 1 && (o.pathPr == null || o.pathPr > 0)) {
      const n = o.pathPr == null ? o.path.length : Math.max(2, Math.round(o.path.length * o.pathPr));
      c.beginPath(); o.path.slice(0, n).forEach((q, i) => { const px = x + q.x * cw + cw / 2, py = y + q.y * ch + ch / 2; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
      c.strokeStyle = P.mot; c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
    }
    // ваза
    const vx = x + vase.x * cw + cw / 2, vy = y + vase.y * ch + ch / 2, vr = E.R_VASE * cw;
    c.beginPath(); c.arc(vx, vy, vr, 0, Math.PI * 2); c.fillStyle = P.dark ? '#3a3f5c' : '#dfe3f6'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = o.hot === 'vase' || kind === 'avoid' ? P.bad : (P.dark ? '#9aa6e6' : '#4a5aa8'); c.stroke();
    // захват
    const gx = x + grip.x * cw + cw / 2, gy = y + grip.y * ch + ch / 2;
    c.strokeStyle = P.out; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - 4, gy - 3.5); c.lineTo(gx - 4, gy + 3.5); c.moveTo(gx + 4, gy - 3.5); c.lineTo(gx + 4, gy + 3.5); c.moveTo(gx - 4, gy); c.lineTo(gx + 4, gy); c.stroke();
    c.restore();
    c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.roundRect(x, y, w, h, 4); c.stroke();
  }
  /** Кадр с камеры: комод спереди с тремя ящиками, ваза перед ним; рамки детектора вокруг верхней ручки и вазы (доля pr). */
  function frameView(c, k, A, P, x, y, w, h, pr) {
    A.rect(c, x, y, w, h, 4, P.surf2, P.line, 1);
    const fx0 = x + w * 0.3, fw = w * 0.56, fy0 = y + h * 0.12, fh = h * 0.6;
    A.rect(c, fx0, fy0, fw, fh, 2, P.dark ? '#3a352c' : '#e3d3b4', P.ink3, 1);
    for (let i = 0; i < 3; i++) {
      const yy = fy0 + fh * (i + 0.5) / 3; A.line(c, [[fx0, fy0 + fh * (i + 1) / 3], [fx0 + fw, fy0 + fh * (i + 1) / 3]], P.ink3, 0.8);
      c.fillStyle = P.ink2; c.fillRect(fx0 + fw / 2 - 7, yy - 1.2, 14, 2.4);
    }
    c.fillStyle = P.ink3; c.fillRect(x + 4, fy0 + fh, w - 8, 1);                                  // край стола
    const vx = x + w * 0.17, vy = fy0 + fh;                                                         // ваза перед комодом
    c.beginPath(); c.moveTo(vx - 6, vy); c.quadraticCurveTo(vx - 9, vy - 10, vx - 3, vy - 16); c.lineTo(vx + 3, vy - 16); c.quadraticCurveTo(vx + 9, vy - 10, vx + 6, vy); c.closePath();
    c.fillStyle = P.dark ? '#3a3f5c' : '#dfe3f6'; c.fill(); c.strokeStyle = P.dark ? '#9aa6e6' : '#4a5aa8'; c.lineWidth = 1.2; c.stroke();
    if (pr > 0) {                                                                                     // рамки детектора: сначала ручка, потом ваза
      c.setLineDash([3, 2]); c.strokeStyle = P.out; c.lineWidth = 1.4;
      const a1 = Math.min(1, pr * 2), a2 = Math.max(0, Math.min(1, pr * 2 - 1));
      c.globalAlpha = a1; c.strokeRect(fx0 + fw / 2 - 11, fy0 + fh / 6 - 6, 22, 12);
      c.globalAlpha = a2; c.strokeRect(vx - 11, vy - 20, 22, 23);
      c.globalAlpha = 1; c.setLineDash([]);
    }
  }
  /** Подпись-стрелка между блоками. */
  const arrowTo = (A, c, x1, y1, x2, y2, on, P) => A.arrow(c, x1, y1, x2, y2, on ? P.ink2 : P.line, 1.8, 6);

  /* ---------- кадр ---------- */
  function drawScheme(c, k, t, P, A, G) {
    const { seg, ease } = A, u = ((t % T) + T) % T;
    const p = {}; for (const n in PH) p[n] = seg(u, PH[n][0], PH[n][1]);
    const cur = Object.keys(PH).find((n) => u >= PH[n][0] && u < PH[n][1]) || 'hold';
    const was = (n) => p[n] > 0;
    /* 1. просьба */
    const B1 = G.ask; block(c, k, A, P, B1.x, B1.y, B1.w, B1.h, 'просьба', cur === 'ask', was('ask'));
    if (p.ask > 0) { c.globalAlpha = Math.min(1, p.ask * 2); txt(c, k, A, ASK, B1.x + B1.w / 2, B1.y + B1.ty, B1.w - 16, { px: 11.5, weight: 650, color: P.ink, wrap: true, lh: 1.3 }); c.globalAlpha = 1; }
    /* 2. языковая модель пишет код */
    const B2 = G.llm; block(c, k, A, P, B2.x, B2.y, B2.w, B2.h, 'языковая модель пишет код', cur === 'code', was('code'));
    const nCode = p.code >= 1 ? CODE.length : Math.floor(p.code * (CODE.length + 0.6));
    CODE.slice(0, nCode).forEach((ln, i) => txt(c, k, A, ln, B2.x + 10, B2.y + B2.ty + i * B2.lh, B2.w - 20, { px: 10, mono: true, weight: 500, color: cur === 'code' && i === nCode - 1 ? P.mot : P.ink2, align: 'left' }));
    /* 3. детектор */
    const B3 = G.det; block(c, k, A, P, B3.x, B3.y, B3.w, B3.h, 'детектор: модель зрения и языка', cur === 'det', was('det'));
    frameView(c, k, A, P, B3.fx, B3.fy, B3.fw, B3.fh, p.det);
    if (p.det > 0) {
      const ls = [['находит на кадре', P.ink2, 650], ['ручка верхнего ящика', P.out, 700], [HANDLE_CM, P.ink2, 500], ['ваза', P.out, 700], [VASE_CM, P.ink2, 500]];
      const show = p.det >= 1 ? 5 : p.det > 0.5 ? 3 : 1;
      ls.slice(0, show).forEach(([s, col, w], i) => txt(c, k, A, s, B3.lx, B3.ly + i * 13, B3.lw, { px: 10.5, weight: w, color: col, align: 'left', mono: w === 500 }));
    }
    /* стрелки между блоками */
    G.arrows.forEach(([x1, y1, x2, y2, ph]) => arrowTo(A, c, x1, y1, x2, y2, was(ph), P));
    /* 4. карты: притяжение, избегание, стоимость */
    const M = G.maps, prA = ease(Math.min(1, p.maps * 2)), prO = ease(Math.max(0, Math.min(1, p.maps * 2 - 1))), prC = ease(p.cost);
    const capCol = (on) => (on ? P.ink : P.ink3);
    txt(c, k, A, 'карта притяжения', M.a.x + M.w / 2, M.capY, M.w + 20, { px: 10.5, weight: 700, color: capCol(prA > 0) });
    mapView(c, k, A, P, M.a.x, M.a.y, M.w, M.h, prA > 0 ? 'aff' : null, { pr: prA, hot: prA > 0 ? 'handle' : null });
    txt(c, k, A, 'ярче — сюда тянуться', M.a.x + M.w / 2, M.subY, M.w + 24, { px: 10, color: P.ink3 });
    txt(c, k, A, 'карта избегания', M.o.x + M.w / 2, M.capY, M.w + 20, { px: 10.5, weight: 700, color: capCol(prO > 0) });
    mapView(c, k, A, P, M.o.x, M.o.y, M.w, M.h, prO > 0 ? 'avoid' : null, { pr: prO, hot: prO > 0 ? 'vase' : null });
    txt(c, k, A, 'ярче — держаться дальше', M.o.x + M.w / 2, M.subY, M.w + 24, { px: 10, color: P.ink3 });
    txt(c, k, A, 'стоимость', M.c.x + M.w / 2, M.c.capY == null ? M.capY : M.c.capY, M.w + 20, { px: 10.5, weight: 700, color: capCol(prC > 0) });
    mapView(c, k, A, P, M.c.x, M.c.y, M.w, M.h, prC > 0 ? 'cost' : null, { pr: prC });
    txt(c, k, A, 'темнее — дороже', M.c.x + M.w / 2, M.c.subY == null ? M.subY : M.c.subY, M.w + 24, { px: 10, color: P.ink3 });
    // формула между картами: −2 × притяжение + 1 × избегание = стоимость
    const fCol = prC > 0 ? P.ink : P.ink3;
    M.ops.forEach(([s, x, y, w]) => txt(c, k, A, s, x, y, w, { px: 11.5, weight: 750, color: fCol, mono: true }));
    if (M.note) txt(c, k, A, M.note[2], M.note[0], M.note[1], M.note[3], { px: 10, color: P.ink3, wrap: true, align: M.note[4] || 'center' });
    /* 5. планировщик и езда с пересчётом */
    const PL = G.plan, go = cur === 'go', after = u >= PH.go[0];
    block(c, k, A, P, PL.x, PL.y, PL.w, PL.h, 'планировщик строит путь', cur === 'plan' || go, was('plan'));
    let vase = E.VASE0, grip = E.START, path = PLAN0.path, pathPr = cur === 'plan' ? ease(p.plan) : after || p.plan >= 1 ? 1 : 0, vals = PLAN0.C, replans = 0, done = false;
    if (after) {
      const tg = Math.min(u - PH.go[0], GO.frames[GO.frames.length - 1].t), j = Math.min(GO.frames.length - 1, Math.floor(tg / GO.DT)), F = GO.frames[j], F2 = GO.frames[Math.min(GO.frames.length - 1, j + 1)];
      const f = Math.max(0, Math.min(1, (tg - F.t) / GO.DT));
      grip = { x: F.grip.x + (F2.grip.x - F.grip.x) * f, y: F.grip.y + (F2.grip.y - F.grip.y) * f };
      vase = { x: F.vase.x + (F2.vase.x - F.vase.x) * f, y: F.vase.y + (F2.vase.y - F.vase.y) * f };
      path = F.path; vals = F.C; replans = j; done = F.done;
    }
    mapView(c, k, A, P, PL.mx, PL.my, PL.mw, PL.mh, after || p.cost >= 1 ? 'cost' : null, { pr: 1, path: pathPr > 0 ? path : null, pathPr, vase, grip, vals });
    if (after) {
      txt(c, k, A, done ? 'захват у ручки' : `пересчёт пути: ${replans}`, PL.lx, PL.ly, PL.lw, { px: 10.5, weight: 700, color: done ? P.good : P.mot, align: PL.align || 'center' });
      txt(c, k, A, '5 раз в секунду', PL.lx, PL.ly + 13, PL.lw, { px: 10, color: P.ink2, align: PL.align || 'center' });
    } else txt(c, k, A, ['путь от захвата', 'к ручке'], PL.lx, PL.ly + 6.5, PL.lw, { px: 10.5, weight: 700, color: pathPr > 0 ? P.mot : P.ink3, align: PL.align || 'center', lh: 1.25 });
    if (PL.legend) {
      const L = PL.legend, items = [['путь захвата', P.mot], ['захват', P.out], ['ваза', P.dark ? '#9aa6e6' : '#4a5aa8']];
      items.forEach(([s, col], i) => { A.line(c, [[L[0], L[1] + i * 13], [L[0] + 12, L[1] + i * 13]], col, 2.4); txt(c, k, A, s, L[0] + 18, L[1] + i * 13, L[2] - 18, { px: 10, color: P.ink2, align: 'left' }); });
    }
    /* что происходит */
    const st = cur === 'ask' ? 'Просьба приходит текстом: открыть верхний ящик и не задеть вазу'
      : cur === 'code' ? 'Языковая модель пишет код: что найти, к чему тянуться, чего избегать. Ни одной точки пути она не выдаёт'
      : cur === 'det' ? 'Детектор, модель зрения и языка, находит ручку и вазу на кадре и возвращает их координаты'
      : cur === 'maps' ? 'Код заполняет две карты в вокселях: притяжение растёт к ручке, избегание — пятно вокруг вазы'
      : cur === 'cost' ? 'Стоимость клетки — взвешенная сумма карт: притяжение с весом 2 её уменьшает, избегание с весом 1 увеличивает'
      : cur === 'plan' ? 'Планировщик ведёт путь по самым дешёвым клеткам: от захвата к ручке в обход вазы'
      : cur === 'go' ? (done ? 'Захват у ручки: дальше потянуть её на себя' : `Захват едет, а вазу переставили на путь: каждые 0,2 с детектор находит её заново, карты и путь строятся снова (пересчёт ${replans})`)
      : 'Захват у ручки. Ни одна часть не обучалась под задачу: ни языковая модель, ни детектор, ни планировщик';
    status(c, k, A, P, st, G.state[0], G.state[1], G.state[2]);
  }

  Anim.add('voxposer', {
    W: 720, H: 392, start: 9.6, narrowAt: 700,
    draw(c, k, t, P, A) {
      drawScheme(c, k, t, P, A, {
        ask: { x: 14, y: 12, w: 164, h: 116, ty: 72 },
        llm: { x: 196, y: 12, w: 236, h: 116, ty: 44, lh: 15 },
        det: { x: 450, y: 12, w: 256, h: 116, fx: 460, fy: 36, fw: 108, fh: 82, lx: 580, ly: 46, lw: 120 },
        arrows: [[180, 70, 194, 70, 'code'], [434, 70, 448, 70, 'det'], [314, 128, 314, 152, 'maps'], [578, 128, 578, 152, 'maps']],
        maps: { w: 112, h: 75, capY: 168, subY: 268, a: { x: 42, y: 180 }, o: { x: 196, y: 180 }, c: { x: 350, y: 180 }, ops: [['−2 ×', 26, 218, 30], ['+ 1 ×', 175, 218, 42], ['=', 330, 218, 20]], note: [250, 292, 'в статье карты — сетки 100 × 100 × 100 вокселей, здесь срез 60 × 40 клеток, как в лаборатории', 464, 'center'] },
        plan: { x: 482, y: 152, w: 224, h: 150, mx: 492, my: 174, mw: 120, mh: 80, lx: 552, ly: 266, lw: 128, legend: [620, 182, 84] },
        state: [14, 330, 692],
      });
    },
    narrow: {
      W: 360, H: 846,
      draw(c, k, t, P, A) {
        drawScheme(c, k, t, P, A, {
          ask: { x: 14, y: 12, w: 332, h: 52, ty: 40 },
          llm: { x: 14, y: 80, w: 332, h: 112, ty: 44, lh: 15 },
          det: { x: 14, y: 208, w: 332, h: 112, fx: 24, fy: 230, fw: 108, fh: 82, lx: 146, ly: 240, lw: 190 },
          arrows: [[180, 64, 180, 78, 'code'], [180, 192, 180, 206, 'det'], [180, 320, 180, 334, 'maps']],
          maps: { w: 120, h: 80, capY: 350, subY: 454, a: { x: 44, y: 362 }, o: { x: 210, y: 362 }, c: { x: 44, y: 492, capY: 480, subY: 584 }, ops: [['−2 ×', 28, 402, 30], ['+ 1 ×', 187, 402, 42], ['=', 28, 532, 20]], note: [182, 532, 'в статье карты — сетки 100 × 100 × 100 вокселей, здесь срез 60 × 40 клеток, как в лаборатории', 160, 'left'] },
          plan: { x: 14, y: 604, w: 332, h: 160, mx: 24, my: 626, mw: 180, mh: 120, lx: 214, ly: 690, lw: 126, align: 'left', legend: [214, 636, 126] },
          state: [14, 782, 332],
        });
      },
    },
  });
})();
