/* =====================================================================
   ui-l55.js — урок 5.5 «Обучение с привилегированной информацией».
   0) анимированные схемы (shared/anim.js): обучение в два этапа
      (учитель в симуляторе → ученик на своих поездках → робот) и RMA
      (кодировщик параметров мира, адаптационный модуль 10 Гц, политика 100 Гц);
   1) лаборатория «Три Ады»: учитель, ученик без истории и ученик с историей
      на ковре, плитке и мокром полу; потом — RL без учителя;
   2) лаборатория «Прогноз»: ученик BC против ученика DAgger, метки прогноза
      на графике, карта размеченных поездок;
   3) лаборатория «Смена пола»: адаптационный модуль оценивает сцепление
      по истории, пол раскладывается по комнатам;
   4) квиз.
   Движок — l55/engine.js (без DOM) поверх shared/drive-core.js.
   ===================================================================== */
'use strict';

const SPEED = { k: 1 }; // ускорение анимаций для автотестов; на результаты не влияет
function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null; for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
const pal = () => ({ bg: HeroKit.css('--surface-2'), grid: HeroKit.css('--line'), line: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), surf: HeroKit.css('--surface') });
const pct = (v) => Math.round(v * 100);
/** Число по-русски: запятая, знак минуса, d знаков после запятой. */
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const nWord = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
function setOut(el, html) { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }
/** Подпись на канвасе шириной W; если она вылезает за край (шрифт в экранных пикселях, а график сжимается), сдвигаем её внутрь, как lab() в shared/anim.js. */
function labIn(c, k, W, text, x, y, o) {
  HeroKit.font(c, k, o.px || 12, o.weight, o.mono);
  const w = c.measureText(String(text)).width, al = o.align || 'center', x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, m = 3 * k;
  if (w < W - 2 * m) x += x0 < m ? m - x0 : x0 + w > W - m ? W - m - x0 - w : 0;
  HeroKit.label(c, k, text, x, y, o);
}
const redrawOn = (fn) => { App.on('theme', fn); App.on('resize', fn); };
/** Живые миссии (без кнопки) помечаем классом: невыполненный критерий там «ещё нет», а не провал. */
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}
function syncRange(inp, text) { inp.nextElementSibling.textContent = text; setRangeFill(inp); }
function segBind(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) fn(b.dataset.v); }); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
const sec = (v) => fmt(v, 1) + ' с';
/** Подготовить канвас графика: на узком экране — своя высота. */
function chartFit(cv, W, Hw, Hn) {
  const narrow = (cv.getBoundingClientRect().width || W) < 500, H = narrow ? Hn : Hw;
  if (cv.style.aspectRatio !== `${W} / ${H}`) cv.style.aspectRatio = `${W} / ${H}`;
  return Object.assign(HeroKit.fit(cv, W, H), { W, H, narrow });
}

/* =====================================================================
   Квартира Ады: план сверху с полами по комнатам
   ===================================================================== */
const Plan = (() => {
  const D = Drive, K = HeroKit, ROOMS = [[0, 0, 200, 400], [200, 0, 400, 400], [400, 0, 600, 400]];
  const NAMES = ['прихожая', 'гостиная', 'кухня'];
  /** Тип пола по сцеплению: ковёр, плитка или мокрый пол. */
  const kindOf = (mu) => (mu >= 0.85 ? 'carpet' : mu >= 0.6 ? 'tile' : 'wet');
  const FLOOR_NAME = { carpet: 'ковёр', tile: 'плитка', wet: 'мокрый пол' };
  function floorFill(c, r, kind, P) {
    const [x0, y0, x1, y1] = r, dk = K.dark();
    c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    if (kind === 'carpet') {
      c.fillStyle = dk ? '#3b3226' : '#f1e6d4'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = dk ? 'rgba(255,220,170,0.10)' : 'rgba(160,110,50,0.13)'; c.lineWidth = 3;
      c.beginPath(); for (let y = y0 + 6; y < y1; y += 12) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
    } else if (kind === 'tile') {
      c.fillStyle = dk ? '#2c2f33' : '#eef0f2'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = dk ? 'rgba(255,255,255,0.10)' : 'rgba(80,90,100,0.18)'; c.lineWidth = 1.2;
      c.beginPath(); for (let x = x0; x <= x1; x += 40) { c.moveTo(x, y0); c.lineTo(x, y1); } for (let y = y0; y <= y1; y += 40) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke();
    } else {
      c.fillStyle = dk ? '#1f3340' : '#dcecf6'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.fillStyle = dk ? 'rgba(130,190,230,0.30)' : 'rgba(60,140,200,0.28)';
      for (let i = 0; i < 26; i++) { const x = x0 + ((i * 73) % 97) / 97 * (x1 - x0), y = y0 + ((i * 41) % 89) / 89 * (y1 - y0); c.beginPath(); c.ellipse(x, y, 9, 5, 0.3, 0, 7); c.fill(); }
    }
    c.restore();
  }
  /** План: полы, мебель, стены, кухня. floor — число или [прихожая, гостиная, кухня]. */
  function house(c, k, P, floor, o) {
    o = o || {};
    c.fillStyle = P.bg; c.fillRect(0, 0, D.W, D.H);
    ROOMS.forEach((r, i) => floorFill(c, r, kindOf(typeof floor === 'number' ? floor : floor[i]), P));
    const lab = k < 1.6, small = k < 2.6;
    for (const f of D.FURN) {
      const [x0, y0, x1, y1] = f.r; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = P.surf; c.fill();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); K.hatch(c, x0, y0, x1, y1, P.ink3, 7, 0.9); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (lab) K.label(c, k, f.name, (x0 + x1) / 2, (y0 + y1) / 2, { color: P.ink2, px: 11, haloColor: P.surf });
    }
    c.fillStyle = P.ink2; for (const r of D.WALLS) c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    if (small && o.labels !== false) ROOMS.forEach((r, i) => {
      const mu = typeof floor === 'number' ? floor : floor[i], x = (r[0] + r[2]) / 2 + (i === 0 ? 34 : 0), y = i === 2 ? 75 : 22;
      K.label(c, k, lab ? `${NAMES[i]} · ${FLOOR_NAME[kindOf(mu)]}` : FLOOR_NAME[kindOf(mu)], x, y, { color: P.ink2, px: lab ? 11 : 10, weight: 650, haloColor: P.surf });
      K.label(c, k, `μ = ${fmt(mu, 2)}`, x, y + (lab ? 15 : 14) * Math.max(1, k * 0.8), { color: P.ink3, px: 10, haloColor: P.surf });
    });
    c.setLineDash([4, 5]); c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.beginPath(); c.arc(D.GOAL.x, D.GOAL.y, D.GOAL.r, 0, 7); c.stroke(); c.setLineDash([]);
  }
  function ada(c, s, color, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(s.x, s.y); c.rotate(s.th);
    c.beginPath(); c.arc(0, 0, D.R, 0, 7); c.fillStyle = K.dark() ? '#2a2926' : '#f4efe6'; c.fill(); c.lineWidth = 2.6; c.strokeStyle = color || K.css('--ink'); c.stroke();
    c.beginPath(); c.roundRect(4, -9, 10, 18, 4); c.fillStyle = '#1f2430'; c.fill();
    c.fillStyle = '#eb6834'; c.beginPath(); c.arc(9, -4, 1.8, 0, 7); c.arc(9, 4, 1.8, 0, 7); c.fill();
    c.restore();
  }
  function mark(c, x, y, outcome, P, r) {
    r = r || 7;
    if (outcome === 'crash') K.cross(c, x, y, r, P.bad, 2.6);
    else if (outcome === 'goal') K.check(c, x, y - 1, r, P.good, 2.6);
    else { c.beginPath(); c.arc(x, y, r * 0.6, 0, 7); c.strokeStyle = P.ink3; c.lineWidth = 2; c.stroke(); }
  }
  /** Путь поездки: толщина — скорость. upto — до какого шага рисовать. */
  function path(c, traj, color, upto, alpha, dash) {
    const n = Math.min(traj.length - 1, upto == null ? traj.length - 1 : upto);
    c.strokeStyle = color; c.lineCap = 'round'; c.globalAlpha = alpha == null ? 0.9 : alpha; c.setLineDash(dash || []);
    for (let i = 0; i < n; i++) { const a = traj[i], b = traj[i + 1]; c.lineWidth = 1.4 + 4.2 * Math.min(1, b.v / 150); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    c.globalAlpha = 1; c.setLineDash([]);
  }
  /** В какую комнату попала точка плана. */
  const roomAt = (x) => (x < 200 ? 0 : x < 400 ? 1 : 2);
  return { house, ada, mark, path, kindOf, FLOOR_NAME, NAMES, ROOMS, roomAt };
})();

/* =====================================================================
   0а. Схема: обучение в два этапа — учитель в симуляторе, ученик на своих
   поездках с подсказками учителя, на роботе только ученик.
   ===================================================================== */
(() => {
  const T = 13.5, ST = 4.5;
  /** Маленький маршрут с бегущей точкой: Ада едет. */
  function route(c, A, x, y, w, col, u, live) {
    const pts = []; for (let i = 0; i <= 30; i++) { const s = i / 30; pts.push([x + w * s, y - 20 * Math.sin(s * Math.PI * 1.2) + 8 * s]); }
    A.line(c, pts, A.alpha(col, 0.35), 3);
    if (live) { const s = (u * 0.45) % 1, i = Math.floor(s * 30); A.circle(c, pts[i][0], pts[i][1], 6, col, null); }
    A.circle(c, pts[30][0], pts[30][1], 4, null, col, 1.6);
  }
  function box(c, k, A, x, y, w, h, title, col, fill, sub, P) {
    A.rect(c, x, y, w, h, 8, fill ? A.alpha(col, 0.16) : P.surf, col, 1.8);
    A.lab(c, k, title, x + w / 2, y + (sub ? h / 2 - 7 : h / 2), { px: 11, weight: 700, color: col, halo: false });
    if (sub) A.lab(c, k, sub, x + w / 2, y + h / 2 + 8, { px: 10, color: P.ink2, halo: false });
  }
  /** Поток по стрелке: точка движется от (x1, y1) к (x2, y2). */
  function flow(c, A, x1, y1, x2, y2, col, u, on) { A.arrow(c, x1, y1, x2, y2, on ? col : A.alpha(col, 0.5), 2, 7); if (on) { const s = (u * 0.9) % 1; A.circle(c, x1 + (x2 - x1) * s, y1 + (y2 - y1) * s, 3.5, col, null); } }
  function stage(c, k, t, P, A, i, ox, oy, on) {
    const u = ((t % T) + T) % T, lu = u - i * ST;
    c.save(); c.translate(ox, oy); c.globalAlpha = on ? 1 : 0.42;
    A.rect(c, 0, 0, 230, 280, 12, on ? P.surf : P.surf2, on ? P.ink2 : P.line, on ? 1.6 : 1);
    const head = ['Этап 1 · симулятор', 'Этап 2 · симулятор', 'Настоящая Ада'][i];
    A.lab(c, k, head, 115, 18, { px: 12, weight: 750, color: P.ink, halo: false });
    if (i === 0) {
      box(c, k, A, 6, 40, 106, 40, 'датчики', P.out, false, 'путь, скорость', P);
      box(c, k, A, 118, 40, 106, 40, 'μ пола', P.spr, true, 'из симулятора', P);
      flow(c, A, 59, 82, 95, 118, P.out, lu, on); flow(c, A, 171, 82, 138, 118, P.spr, lu + 0.3, on);
      box(c, k, A, 55, 120, 120, 44, 'учитель', P.spr, true, 'учится PPO', P);
      flow(c, A, 115, 166, 115, 196, P.spr, lu + 0.5, on);
      A.lab(c, k, 'скорость', 150, 182, { px: 10, color: P.ink2, halo: false, align: 'left' });
      route(c, A, 30, 240, 170, P.spr, lu, on);
      A.line(c, [[205, 236], [218, 236], [218, 142], [180, 142]], on ? P.good : A.alpha(P.good, 0.5), 1.8, [5, 4], -t * 18);
      A.lab(c, k, 'награда', 213, 205, { px: 10, color: P.good, align: 'right', haloColor: P.surf });
    } else if (i === 1) {
      box(c, k, A, 8, 38, 104, 40, 'датчики', P.out, false, '+ история 2 с', P);
      box(c, k, A, 120, 38, 102, 40, 'датчики', P.spr, false, '+ μ пола', P);
      flow(c, A, 60, 80, 60, 104, P.out, lu, on); flow(c, A, 171, 80, 171, 104, P.spr, lu + 0.4, on);
      box(c, k, A, 10, 106, 100, 40, 'ученик', P.mot, true, null, P);
      box(c, k, A, 122, 106, 98, 40, 'учитель', P.spr, true, null, P);
      flow(c, A, 60, 148, 98, 178, P.mot, lu + 0.2, on); flow(c, A, 171, 148, 133, 178, P.spr, lu + 0.6, on);
      box(c, k, A, 50, 180, 130, 38, 'разница²', P.ink2, false, 'ошибка ученика', P);
      A.line(c, [[50, 199], [26, 199], [26, 150]], on ? P.mot : A.alpha(P.mot, 0.5), 2, [5, 4], -t * 18); A.arrow(c, 26, 160, 26, 149, on ? P.mot : A.alpha(P.mot, 0.5), 2, 7);
      route(c, A, 30, 254, 170, P.mot, lu, on);
      A.lab(c, k, 'едет ученик', 115, 272, { px: 10, color: P.ink2, halo: false });
    } else {
      box(c, k, A, 40, 40, 150, 40, 'датчики', P.out, false, '+ история 2 с', P);
      flow(c, A, 115, 82, 115, 110, P.out, lu, on);
      box(c, k, A, 55, 112, 120, 44, 'ученик', P.mot, true, null, P);
      flow(c, A, 115, 158, 115, 190, P.mot, lu + 0.5, on);
      A.lab(c, k, 'скорость', 150, 176, { px: 10, color: P.ink2, halo: false, align: 'left' });
      route(c, A, 30, 238, 170, P.mot, lu, on);
      c.globalAlpha = on ? 0.55 : 0.3;
      A.lab(c, k, 'учителя и μ на роботе нет', 115, 270, { px: 10, color: P.spr, halo: false });
    }
    c.restore();
  }
  Anim.add('stages', {
    W: 720, H: 330, start: 1.2, narrowAt: 600,
    draw(c, k, t, P, A) { const u = ((t % T) + T) % T, cur = Math.min(2, Math.floor(u / ST)); for (let i = 0; i < 3; i++) stage(c, k, t, P, A, i, 8 + i * 240, 26, i === cur); },
    narrow: { W: 360, H: 440, draw(c, k, t, P, A) {
      const u = ((t % T) + T) % T, cur = Math.min(2, Math.floor(u / ST));
      for (let i = 0; i < 3; i++) A.circle(c, 150 + i * 30, 14, 5, i === cur ? P.ink : P.line, null);
      c.save(); c.translate(180 - 115 * 1.4, 32); c.scale(1.4, 1.4); stage(c, k / 1.4, t, P, A, cur, 0, 0, true); c.restore();
    } },
  });
})();

/* =====================================================================
   0б. Схема RMA: в симуляторе кодировщик сжимает параметры мира в 8 чисел;
   на роботе адаптационный модуль раз в 0,1 с восстанавливает их по истории
   последних 0,5 с, а базовая политика работает 100 раз в секунду.
   Время на схеме замедлено в 25 раз.
   ===================================================================== */
(() => {
  const SLOW = 25, TP = 0.01 * SLOW, TM = 0.1 * SLOW;   // шаг политики и шаг модуля в секундах схемы
  const EW = 170, BW = 134, MW = 130;   // ширина блоков: параметры мира, базовая политика, адаптационный модуль
  function cells(c, A, x, y, n, w, h, col, filled) { for (let i = 0; i < n; i++) A.rect(c, x + i * (w + 2), y, w, h, 2, i < filled ? A.alpha(col, 0.7) : null, A.alpha(col, 0.6), 1); }
  function draw(c, k, t, P, A, g) {
    const { lab, rect, arrow, line } = A, u = Math.max(0, t);
    const pol = Math.floor(u / TP), mod = Math.floor(u / TM), pFlash = 1 - A.clamp((u - pol * TP) / (TP * 0.8), 0, 1), mFlash = 1 - A.clamp((u - mod * TM) / (TM * 0.4), 0, 1);
    // симулятор
    const S = g.sim;
    rect(c, S[0], S[1], S[2], S[3], 12, P.surf2, P.line, 1);
    lab(c, k, 'Этап 1 · симулятор', S[0] + 10, S[1] + 14, { px: 11.5, weight: 750, color: P.ink, align: 'left', halo: false });
    const [ex, ey] = g.e, [cx, cy] = g.enc, [zx, zy] = g.z, [bx, by] = g.base;
    rect(c, ex, ey, EW, 52, 8, A.alpha(P.spr, 0.14), P.spr, 1.6);
    lab(c, k, 'параметры мира: 17', ex + EW / 2, ey + 16, { px: 11, weight: 700, color: P.spr, halo: false });
    lab(c, k, 'груз, моторы, трение…', ex + EW / 2, ey + 34, { px: 10, color: P.ink2, halo: false });
    arrow(c, ...g.a1, P.spr, 2, 7);
    rect(c, cx, cy, 96, 44, 8, A.alpha(P.mot, 0.16), P.mot, 1.8); lab(c, k, 'энкодер', cx + 48, cy + 22, { px: 11, weight: 700, color: P.mot, halo: false });
    arrow(c, ...g.a2, P.spr, 2, 7);
    // подписи векторов: на широкой схеме — над клетками, на узкой — справа от них, чтобы их не пересекала стрелка
    const vl = (x, y) => (g.narrow ? [x + 86, y + 7, 'left'] : [x + 39, y - 9, 'center']);
    cells(c, A, zx, zy, 8, 8, 14, P.spr, 8); { const [lx, ly, al] = vl(zx, zy); lab(c, k, 'z: 8 чисел', lx, ly, { px: 10, color: P.spr, halo: false, align: al }); }
    arrow(c, ...g.a3, P.spr, 2, 7);
    rect(c, bx, by, BW, 44, 8, A.alpha(P.mot, 0.16), P.mot, 1.8); lab(c, k, 'базовая политика', bx + BW / 2, by + 15, { px: 11, weight: 700, color: P.mot, halo: false }); lab(c, k, 'учится PPO', bx + BW / 2, by + 31, { px: 10, color: P.ink2, halo: false });
    arrow(c, ...g.a4, P.mot, 2, 7); lab(c, k, 'действие', g.a4[2], g.a4[3] + (g.narrow ? 12 : -10), { px: 10, color: P.mot, halo: false, align: g.narrow ? 'center' : 'right' });
    // робот
    const R = g.rob;
    rect(c, R[0], R[1], R[2], R[3], 12, P.surf2, P.line, 1);
    lab(c, k, 'Этап 2 и настоящий робот', R[0] + 10, R[1] + 14, { px: 11.5, weight: 750, color: P.ink, align: 'left', halo: false });
    const [hx, hy] = g.hist, [mx, my] = g.mod, [qx, qy] = g.zhat, [px, py] = g.pol;
    const filled = Math.min(50, pol);
    for (let i = 0; i < 50; i++) { const col = i < filled ? A.alpha(P.out, i >= filled - 1 ? 1 : 0.55) : null; rect(c, hx + (i % 25) * 6.4, hy + Math.floor(i / 25) * 10, 5, 8, 1.5, col, A.alpha(P.out, 0.5), 0.8); }
    lab(c, k, 'история: 50 шагов = 0,5 с', hx + 80, hy - 10, { px: 10, color: P.out, halo: false });
    arrow(c, ...g.b1, P.out, 2, 7);
    rect(c, mx, my, MW, 44, 8, A.alpha(P.mot, 0.12 + 0.3 * mFlash), P.mot, 1.8 + 1.5 * mFlash);
    lab(c, k, 'адаптац. модуль', mx + MW / 2, my + 15, { px: 10.5, weight: 700, color: P.mot, halo: false }); lab(c, k, '10 раз в секунду', mx + MW / 2, my + 31, { px: 10, color: P.ink2, halo: false });
    arrow(c, ...g.b2, P.mot, 2, 7);
    cells(c, A, qx, qy, 8, 8, 14, P.mot, 8); { const [lx, ly, al] = vl(qx, qy); lab(c, k, 'ẑ: оценка z', lx, ly, { px: 10, color: P.mot, halo: false, align: al }); }
    arrow(c, ...g.b3, P.mot, 2, 7);
    rect(c, px, py, BW, 44, 8, A.alpha(P.mot, 0.12 + 0.3 * pFlash), P.mot, 1.8 + 1.2 * pFlash);
    lab(c, k, 'базовая политика', px + BW / 2, py + 15, { px: 10.5, weight: 700, color: P.mot, halo: false }); lab(c, k, '100 раз в секунду', px + BW / 2, py + 31, { px: 10, color: P.ink2, halo: false });
    line(c, g.loop, A.alpha(P.out, 0.7), 1.6, [5, 4], -t * 12);
    lab(c, k, 'состояние и действие → в историю', g.loopLab[0], g.loopLab[1], { px: 10, color: P.out, halo: false, align: g.loopLab[2] });
    // шкала времени: шаги политики и модуля
    const [tx, ty, tw] = g.tl, span = 0.3, t0 = u / SLOW - span;
    line(c, [[tx, ty], [tx + tw, ty]], P.ink3, 1.2);
    for (let j = Math.ceil(t0 / 0.01); j * 0.01 <= u / SLOW; j++) { const x = tx + tw * (j * 0.01 - t0) / span; if (x < tx) continue; const big = j % 10 === 0; line(c, [[x, ty - (big ? 12 : 5)], [x, ty + (big ? 4 : 0)]], big ? P.mot : P.ink3, big ? 2.4 : 1.2); }
    if (g.narrow) { lab(c, k, 'мелкие засечки — шаги политики (0,01 с),', tx + tw / 2, ty + 14, { px: 10, color: P.ink2, halo: false }); lab(c, k, 'крупные — шаги модуля (0,1 с)', tx + tw / 2, ty + 27, { px: 10, color: P.ink2, halo: false }); }
    else lab(c, k, 'время: мелкие засечки — шаги политики (0,01 с), крупные — шаги модуля (0,1 с)', tx + tw / 2, ty + 16, { px: 10, color: P.ink2, halo: false });
  }
  Anim.add('rma', {
    W: 720, H: 330, start: 6, narrowAt: 600,
    draw(c, k, t, P, A) { draw(c, k, t, P, A, { sim: [8, 6, 704, 104], e: [20, 38], enc: [214, 42], z: [356, 57], base: [473, 42], a1: [192, 64, 212, 64], a2: [312, 64, 352, 64], a3: [436, 64, 471, 64], a4: [609, 64, 690, 64],
      rob: [8, 118, 704, 166], hist: [20, 170], mod: [215, 156], zhat: [370, 171], pol: [489, 156], b1: [182, 178, 213, 178], b2: [347, 178, 366, 178], b3: [452, 178, 487, 178],
      loop: [[556, 202], [556, 246], [100, 246], [100, 192]], loopLab: [330, 258, 'center'], tl: [40, 304, 640] }); },
    narrow: { W: 360, H: 610, draw(c, k, t, P, A) { draw(c, k, t, P, A, { narrow: true, sim: [6, 6, 348, 256], e: [95, 30], enc: [132, 106], z: [141, 180], base: [113, 208], a1: [180, 84, 180, 104], a2: [180, 152, 180, 168], a3: [180, 196, 180, 206], a4: [249, 230, 300, 230],
      rob: [6, 270, 348, 290], hist: [100, 310], mod: [115, 344], zhat: [141, 416], pol: [113, 444], b1: [180, 330, 180, 342], b2: [180, 390, 180, 406], b3: [180, 432, 180, 442],
      loop: [[113, 466], [26, 466], [26, 315], [96, 315]], loopLab: [30, 506, 'left'], tl: [20, 570, 320] }); } },
  });
})();

/* =====================================================================
   Обучение, общее для лабораторий: учитель, ученики, RL без учителя,
   адаптационные модули. Всё считается один раз, кусками, и кэшируется.
   ===================================================================== */
const Models = (() => {
  const E = L55, F = E.FLOORS, CHECK = ['carpet', 'tile', 'wet', 'wetKitchen'].map((k) => F[k].mu);
  const done = {}, pend = {}, subs = {};
  /** Обучить по ключу генератором gen(); n — сколько шагов отдаёт генератор (для полоски прогресса). */
  function get(key, gen, n, onProg) {
    if (done[key]) return Promise.resolve(done[key]);
    (subs[key] = subs[key] || []).push(onProg || null);
    if (!pend[key]) {
      let i = 0;
      pend[key] = runChunked(gen(), () => { i++; (subs[key] || []).forEach((f) => f && f(Math.min(1, i / n))); }, 14).then((r) => { done[key] = r; delete pend[key]; return r; });
    }
    return pend[key];
  }
  const teacher = (p) => get('T', () => E.trainPPO('priv'), E.CFG.ITERS, p);
  const after = (p0, p) => (p ? (x) => p(p0 + (1 - p0) * x) : null);
  /** Ученик kind ('sens' | 'hist') методом mode ('dagger' | 'bc'); после каждой итерации — проверка на 4 полах. */
  function student(kind, mode, p) {
    return teacher(p && ((x) => p(0.7 * x))).then((T) => get(`S|${kind}|${mode}`, () => E.distill(T.A, kind, mode, { check: CHECK, checkN: 10 }), E.CFG.D_ITERS, after(0.7, p)));
  }
  const rl = (kind, p) => get(`R|${kind}`, () => E.trainPPO(kind), E.CFG.ITERS, p);
  /** Адаптационный модуль с историей k решений. */
  function mod(k, p) { return teacher(p && ((x) => p(0.7 * x))).then((T) => get(`M|${k}`, () => E.trainModule(T.A, k), E.CFG.M_ITERS, after(0.7, p))); }
  return { teacher, student, rl, mod, CHECK, has: (k) => !!done[k] };
})();

/* =====================================================================
   1. Лаборатория: учитель и два ученика на одном полу (и RL без учителя)
   ===================================================================== */
const Trio = (() => {
  const E = L55, D = Drive, K = HeroKit, F = E.FLOORS;
  const FL = ['carpet', 'tile', 'wet', 'wetKitchen'], N = 20;
  const NAME = { T: 'Учитель', H: 'Ученик с историей', S: 'Ученик без истории', RS: 'RL без μ', RH: 'RL на истории' };
  const SHORT = { T: 'учитель', H: 'с историей', S: 'без истории', RS: 'RL без μ', RH: 'RL, история' };
  const LOW = { T: 'учитель', H: 'ученик с историей', S: 'ученик без истории', RS: 'RL без μ', RH: 'RL на истории' };
  const DOORS = (() => { const out = []; for (const x of [200, 400]) { const i = D.PATH.findIndex((p) => p[0] >= x); out.push(E.PATHS[i]); } return out; })();
  const st = { floor: 'carpet', trip: 0, res: {}, rl: false, busy: false, prog: 0, anim: null, ctl: {} };
  let ctl = null;
  const colOf = (key, P) => ({ T: P.hy, H: P.e2e, S: P.cl, RS: P.ink3, RH: P.ink2 }[key]);
  const keys = () => (st.rl ? ['RS', 'RH', 'S', 'H', 'T'] : ['S', 'H', 'T']);
  /** Наименьшая скорость перед поворотом на кухню (340–400 см по маршруту) в поездке e. */
  function vmin(e) { const pr = E.speedProfile(e).filter((p) => p[0] >= 340 && p[0] <= 400); return pr.length ? Math.round(Math.min(...pr.map((p) => p[1]))) : null; }
  /** Обучить нужное и проехать по 20 проверочных поездок на полу fk. */
  async function ensure(withRL) {
    st.busy = true; st.prog = 0; render();
    const prog = (a, b) => (x) => { st.prog = a + (b - a) * x; render(); };
    try {
      const [S, H] = [await Models.student('sens', 'dagger', prog(0, withRL ? 0.45 : 0.9)), await Models.student('hist', 'dagger', prog(withRL ? 0.45 : 0.9, withRL ? 0.5 : 1))];
      const T = await Models.teacher();
      st.ctl.T = E.ctlPPO(T.A); st.ctl.S = E.ctlStudent(S.S); st.ctl.H = E.ctlStudent(H.S);
      if (withRL) {
        const RS = await Models.rl('sens', prog(0.5, 0.75)), RH = await Models.rl('hist', prog(0.75, 1));
        st.ctl.RS = E.ctlPPO(RS.A); st.ctl.RH = E.ctlPPO(RH.A); st.rl = true;
      }
    } finally { st.busy = false; }
  }
  function evalFloor(fk) {
    const out = st.res[fk] || (st.res[fk] = {});
    for (const key of keys()) if (!out[key]) { const eps = E.trips(st.ctl[key], F[fk].mu, N); out[key] = { ok: E.okShare(eps), time: E.meanTime(eps), eps, vmin: vmin(eps[0]) }; }
    return out;
  }
  async function runFloor(fk, withRL) {
    if (st.busy) return null;
    await ensure(withRL);
    st.floor = fk; segSet('#tFloor', fk); evalFloor(fk); startAnim(); render();
    return summary(fk);
  }
  function summary(fk) { const r = st.res[fk], out = { floor: fk }; for (const key of Object.keys(r)) out[key] = { ok: r[key].ok, time: r[key].time, vmin: r[key].vmin, out0: r[key].eps[0].outcome }; return out; }
  /** Анимация: Ады едут по выбранной поездке в реальном времени (ускоренно вдвое). */
  function startAnim() {
    const t0 = performance.now(); st.anim = { t: 0 };
    const tick = () => { if (!st.anim) return; st.anim.t = (performance.now() - t0) / 1000 * 2 * SPEED.k; drawMap(); const r = st.res[st.floor]; const tMax = r ? Math.max(...keys().filter((k) => r[k]).map((k) => r[k].eps[st.trip].T)) * 0.1 : 0; if (st.anim.t < tMax) requestAnimationFrame(tick); else { st.anim = null; drawMap(); } };
    requestAnimationFrame(tick);
  }
  function drawMap() {
    const cv = $('#tCv'), { c, k } = K.fit(cv, D.W, D.H), P = pal();
    Plan.house(c, k, P, F[st.floor].mu);
    const r = st.res[st.floor];
    if (!r || !r.T) { Plan.ada(c, D.START, P.ink); K.label(c, k, st.busy ? 'Ады учатся…' : (k > 1.5 ? 'нажми кнопку миссии' : 'нажми кнопку миссии: Ады обучатся и поедут'), D.W / 2, D.H / 2 + 50, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf }); return; }
    const step = st.anim ? Math.floor(st.anim.t / 0.1) : null;
    for (const key of keys()) { const x = r[key]; if (!x) continue; const e = x.eps[st.trip]; Plan.path(c, e.traj, colOf(key, P), step, key === 'RS' || key === 'RH' ? 0.55 : 0.85, key === 'RH' ? [6, 5] : null); }
    for (const key of keys()) {
      const x = r[key]; if (!x) continue; const e = x.eps[st.trip], i = step == null ? e.traj.length - 1 : Math.min(e.traj.length - 1, step), s = e.traj[i];
      if (i === e.traj.length - 1) Plan.mark(c, s.x, s.y, e.outcome, P, 9); else Plan.ada(c, s, colOf(key, P), 0.95);
    }
  }
  function drawChart() {
    const cv = $('#tChart'), { c, k, W, H, narrow } = chartFit(cv, 640, 240, 300), P = pal();
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const ky = Math.max(1, k * 0.8), L = 44 * ky, R = narrow ? 12 : 120, T = 26 * ky, B = 36 * ky, gw = W - L - R, gh = H - T - B, X = (s) => L + gw * s / E.PATH_LEN, Y = (v) => T + gh * (1 - v / 160);
    for (let s = 0; s < E.PATH_LEN; s += 4) { const kap = Math.abs(kapAt(s)); if (kap > 1 / 160) { c.fillStyle = P.grid; c.globalAlpha = Math.min(1, kap * 70); c.fillRect(X(s), T, gw * 4 / E.PATH_LEN + 0.5, gh); } }
    c.globalAlpha = 1; c.strokeStyle = P.line; c.lineWidth = 1;
    for (const v of [0, 50, 100, 150]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + gw, Y(v)); c.stroke(); K.label(c, k, String(v), L - 6, Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    for (const s of [0, 200, 400, 600]) K.label(c, k, String(s), X(s), T + gh + 11 * ky, { px: 10.5, color: P.ink3, halo: false });
    c.setLineDash([3, 4]); c.strokeStyle = P.ink3; DOORS.forEach((s, i) => { c.beginPath(); c.moveTo(X(s), T); c.lineTo(X(s), T + gh); c.stroke(); K.label(c, k, narrow ? (i ? 'кухня' : 'гостиная') : (i ? 'дверь на кухню' : 'дверь в гостиную'), X(s) + 3, T + 8 * ky, { px: 9.5, color: P.ink3, align: 'left', haloColor: P.surf }); }); c.setLineDash([]);
    K.label(c, k, narrow ? 'по маршруту, см' : 'сколько проехала по маршруту, см', L + gw / 2, H - 7 * ky, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, 'скорость, см/с', 4, 9 * ky, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    const r = st.res[st.floor];
    if (!r || !r.T) { K.label(c, k, narrow ? 'появится после поездки' : 'график появится после поездки: нажми кнопку миссии', L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const tags = [];
    for (const key of keys()) {
      const x = r[key]; if (!x) continue; const e = x.eps[st.trip], pr = E.speedProfile(e), col = colOf(key, P);
      c.strokeStyle = col; c.lineWidth = key === 'RS' || key === 'RH' ? 1.6 : 2.4; c.setLineDash(key === 'RH' ? [6, 5] : []);
      c.beginPath(); pr.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); c.setLineDash([]);
      const lp = pr[pr.length - 1]; if (e.outcome === 'crash') K.cross(c, X(lp[0]), Y(lp[1]), 5, P.bad, 2.2);
      if (!narrow) tags.push({ y: Y(lp[1]), text: `${SHORT[key]} · ${e.outcome === 'goal' ? sec(e.time) : 'врезалась'}`, col });
    }
    tags.sort((a, b) => a.y - b.y); for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + 13);
    tags.forEach((t) => K.label(c, k, t.text, L + gw + 6, Math.min(T + gh, t.y), { px: 10, weight: 650, color: t.col, align: 'left', haloColor: P.surf }));
  }
  const kapAt = (s) => E.KAPPA[Math.max(0, E.PATHS.findIndex((x) => x >= s))] || 0;
  function cell(x) { if (!x) return '<td class="na">—</td>'; return `<td class="${x.ok < 0.5 ? 'bad' : x.ok >= 0.95 ? 'ok' : ''}">${pct(x.ok)}%${x.time ? `<small>${sec(x.time)}</small>` : ''}</td>`; }
  function drawTable() {
    const cols = st.rl ? ['T', 'H', 'S', 'RS', 'RH'] : ['T', 'H', 'S'], rows = FL.filter((fk) => st.res[fk]);
    if (!rows.length) { setOut($('#tTable'), ''); return; }
    setOut($('#tTable'), `<table><thead><tr><th>Пол</th>${cols.map((key) => `<th><i style="--c:var(${{ T: '--hybrid', H: '--e2e', S: '--classic', RS: '--ink-3', RH: '--ink-2' }[key]})"></i>${NAME[key]}</th>`).join('')}</tr></thead><tbody>${rows.map((fk) => `<tr class="${fk === st.floor ? 'cur' : ''}"><th>${F[fk].name}</th>${cols.map((key) => cell(st.res[fk][key])).join('')}</tr>`).join('')}</tbody></table><p class="t-cap">Доля из ${N} проверочных поездок, которые доехали до кухни, и среднее время в пути у доехавших.</p>`);
  }
  function render() {
    drawMap(); drawChart(); drawTable();
    const pg = $('#tProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const inp = $('#tTrip'); inp.value = st.trip + 1; syncRange(inp, String(st.trip + 1));
    $('#tGo').disabled = st.busy;
    const r = st.res[st.floor];
    if (st.busy) setOut($('#tOut'), `Ады учатся в браузере: ${pct(st.prog)}%.`);
    else if (r && r.T) setOut($('#tOut'), `${F[st.floor].name[0].toUpperCase() + F[st.floor].name.slice(1)}, поездка ${st.trip + 1}: ${keys().filter((key) => r[key]).reverse().map((key) => { const e = r[key].eps[st.trip]; return `${LOW[key]} — ${e.outcome === 'goal' ? 'до кухни за ' + sec(e.time) : e.outcome === 'crash' ? 'столкновение' : 'не успела за 20 с'}`; }).join('; ')}.`);
    else setOut($('#tOut'), 'Политики ещё не обучены.');
  }
  function state() { const r = st.res[st.floor]; return { floor: st.floor, trip: st.trip, busy: st.busy, rl: st.rl, res: st.res }; }
  const api = {
    reset() { st.trip = 0; st.floor = 'carpet'; segSet('#tFloor', 'carpet'); render(); },
    state, render, st, summary,
    carpet: () => runFloor('carpet', false),
    wet: () => runFloor('wet', false),
    async rl() { const r = await runFloor('carpet', true); for (const fk of FL) evalFloor(fk); render(); const all = {}; for (const fk of FL) all[fk] = summary(fk); return all; },
    go: () => runFloor(st.floor, st.rl),
  };
  const missions = [
    { short: 'Ковёр', title: 'Кто быстрее на ковре', text: 'Учитель учится с подкреплением и видит сцепление пола μ. Ученики учатся повторять его по DAgger: один видит только датчики, второй — ещё и историю последних 2 секунд. Нажми кнопку: все трое обучатся и проедут по 20 раз по ковру, где сцепление лучшее.',
      bet: { q: 'кто доедет до кухни быстрее?', options: ['Ученик без истории: ему ничего не нужно вспоминать, он реагирует сразу', 'Все трое одинаково: на ковре колёса держат хорошо', 'Учитель и ученик с историей, а ученик без истории медленнее'], answer: (r) => (r.S.time > r.T.time + 0.15 && Math.abs(r.H.time - r.T.time) < 0.25 ? 2 : Math.abs(r.S.time - r.T.time) <= 0.15 ? 1 : 0) },
      action: { label: 'Обучить и проехать по ковру', run: (X) => X.carpet() },
      criteria: [{ label: 'Все трое доезжают хотя бы в 95% поездок', test: (r) => r.T.ok >= 0.95 && r.S.ok >= 0.95 && r.H.ok >= 0.95 }, { label: 'Ученик без истории медленнее учителя', test: (r) => r.S.time > r.T.time }],
      explain: (r) => `На ковре доезжают все трое. Учитель — в среднем за ${sec(r.T.time)}, ученик с историей — за ${sec(r.H.time)}, ученик без истории — за ${sec(r.S.time)}. В первой поездке перед поворотом на кухню учитель держит ${r.T.vmin} см/с, ученик с историей — ${r.H.vmin}, а ученик без истории сбрасывает скорость до ${r.S.vmin}. В этом месте маршрута, с той же скоростью и тем же поворотом впереди, учитель на ковре едет дальше, а на мокром полу тормозит — ученик, который не различает полы, выучил что-то среднее.` },
    { short: 'Мокрый пол', title: 'Те же трое на мокром полу', text: 'Мокрый пол: сцепление 0,45. Тормозной путь здесь больше чем вдвое длиннее, чем на ковре, а поворот на кухню можно пройти только медленно. Мокрые полы ученики видели в обучении — там пол каждый раз был случайным.',
      controls: ['trip'],
      bet: { q: 'что будет на мокром полу?', options: ['Доедут все: мокрый пол был в обучении у обоих учеников', 'Ученик без истории будет врезаться, ученик с историей доедет', 'Оба ученика будут врезаться: только учитель знает, что пол мокрый'], answer: (r) => (r.S.ok <= 0.2 && r.H.ok >= 0.9 ? 1 : r.S.ok >= 0.9 && r.H.ok >= 0.9 ? 0 : 2) },
      action: { label: 'Проехать по мокрому полу', run: (X) => X.wet() },
      criteria: [{ label: 'Ученик без истории доезжает не больше чем в 20% поездок', test: (r) => r.S.ok <= 0.2 }, { label: 'Ученик с историей — хотя бы в 90%', test: (r) => r.H.ok >= 0.9 }],
      explain: (r) => `Учитель доезжает в ${pct(r.T.ok)}% поездок, в среднем за ${sec(r.T.time)}; ученик с историей — в ${pct(r.H.ok)}%, за ${sec(r.H.time)}; ученик без истории — в ${pct(r.S.ok)}%. В первой поездке учитель перед поворотом на кухню сбрасывает скорость до ${r.T.vmin} см/с, ученик с историей — до ${r.H.vmin}. Ученик без истории начинает тормозить там же, где на ковре, но мокрый пол тормозит слабее: к повороту у него ещё ${r.S.vmin} см/с, колёса проскальзывают, и Аду выносит в стену. Ученику с историей хватило первых торможений и поворотов, чтобы понять, какой под ним пол.` },
    { short: 'Без учителя', title: 'А если учить без учителя', text: 'Может, учитель не нужен? В уроке 5.4 политику учили с подкреплением на случайных мирах, не сообщая ей параметров. Обучим так же и с тем же бюджетом — 120 обновлений по 8 поездок — две политики: на одних датчиках и на датчиках с историей. Обе проедут по всем четырём полам.',
      controls: ['trip'],
      bet: { q: 'что выйдет у обучения с подкреплением без учителя?', options: ['Обе будут врезаться на мокром полу, как ученик без истории', 'Обе доедут на всех полах, но медленнее учителя', 'Политика с историей сравняется с учителем: бюджет тот же'], answer: (r) => (FL.every((fk) => r[fk].RS.ok >= 0.9 && r[fk].RH.ok >= 0.9) && r.carpet.RH.time >= r.carpet.T.time + 0.3 ? 1 : r.wet.RS.ok < 0.5 && r.wet.RH.ok < 0.5 ? 0 : 2) },
      action: { label: 'Обучить без учителя и проехать по всем полам', run: (X) => X.rl() },
      criteria: [{ label: 'RL без μ уступает учителю: на ковре медленнее хотя бы на 0,4 с или на мокром полу врезается', test: (r) => r.carpet.RS.time >= r.carpet.T.time + 0.4 || r.wet.RS.ok < 0.9 }, { label: 'RL на истории — тоже', test: (r) => r.carpet.RH.time >= r.carpet.T.time + 0.4 || r.wet.RH.ok < 0.9 }, { label: 'Ученик с историей на ковре — в пределах 0,15 с от учителя', test: (r) => Math.abs(r.carpet.H.time - r.carpet.T.time) <= 0.15 }],
      explain: (r) => { const t = (x) => (x.ok >= 0.95 ? sec(x.time) : `${pct(x.ok)}% поездок`), safe = FL.every((fk) => r[fk].RS.ok >= 0.9 && r[fk].RH.ok >= 0.9);
        return `${safe ? 'Обе доезжают на всех полах, но медленно.' : 'Без учителя за тот же бюджет политики, которая ездит как учитель, не вышло.'} На ковре политика без μ тратит ${t(r.carpet.RS)}, политика с историей — ${t(r.carpet.RH)}, учитель — ${t(r.carpet.T)}, ученик с историей — ${t(r.carpet.H)}. На мокром полу: ${t(r.wet.RS)}, ${t(r.wet.RH)}, ${t(r.wet.T)} и ${t(r.wet.H)}. Политика, которая не знает μ, едет везде почти как по мокрому полу. Политике с историей узнать пол было из чего, но за 120 обновлений обучение с подкреплением этого не нашло, — а ученик с той же историей научился за 6 итераций подражания.`; } },
    { short: 'Свободно', title: 'Свободный режим', text: 'Выбирай пол и поездку. Найди пол, на котором ученик с историей сильнее всего отстаёт от учителя, и посмотри по графику скорости, где он теряет время. Сравни на плитке, где сцепление среднее, ученика без истории с учителем.', final: true },
  ];
  function init() {
    segBind('#tFloor', (v) => { if (st.busy) return; st.floor = v; segSet('#tFloor', v); if (st.ctl.T) evalFloor(v); startAnim(); render(); if (ctl) ctl.update(); });
    $('#tTrip').addEventListener('input', (e) => { st.trip = +e.target.value - 1; startAnim(); render(); if (ctl) ctl.update(); });
    $('#tGo').addEventListener('click', () => { if (!st.busy) api.go().then(() => ctl && ctl.update()); });
    ctl = mountMissions('#tMis', missions, api, { controls: { floor: '#wrapTFloor', trip: '#wrapTTrip', go: '#wrapTGo' }, scene: '#tCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, NAME };
})();

/* =====================================================================
   2. Лаборатория: прогноз — ученик BC против ученика DAgger
   ===================================================================== */
const Fore = (() => {
  const E = L55, D = Drive, K = HeroKit, NI = E.CFG.D_ITERS;
  const st = { kind: 'hist', who: 'dagger', it: 0, fc: { bc: 0.5, dagger: 0.5 }, moved: { bc: false, dagger: false }, shown: false, busy: false, prog: 0, res: {} };
  let ctl = null;
  const colOf = (m, P) => (m === 'bc' ? P.cl : P.e2e);
  const curve = (m) => { const r = st.res[st.kind]; return r && r[m] ? r[m].hist.map((h) => h.ok) : null; };
  function geo(W, H, k) { const ky = Math.max(1, (k || 1) * 0.8), L = (W / (k || 1) < 500 ? 44 : 40) * ky, R = 92, T = 30 * ky, B = 34 + 14 * ky; return { L, R, T, B, gw: W - L - R, gh: H - T - B, X: (i) => L + (W - L - R) * i / (NI - 1), Y: (v) => T + (H - T - B) * (1 - v), FX: (m) => W - R + (m === 'bc' ? 30 : 64) }; }
  /** Заголовок колонки прогноза и подписи меток. Подпись BC стоит над меткой, DAgger — под ней. Если подпись налезает на заголовок,
   *  на метку, на соседнюю подпись или на подписи оси (ax) либо уходит за край, берётся следующая раскладка, а на широком графике
   *  в крайнем случае подписи укорачиваются до процентов. По горизонтали подписи сдвигаются внутрь канваса, как в labIn. */
  function fcLabels(c, k, W, H, g, ky, narrow, P, ax) {
    const box = (text, x, y) => { K.font(c, k, 10, 700); const w = c.measureText(text).width, m = 3 * k, cx = Math.max(m + w / 2, Math.min(W - m - w / 2, x)); return { text, x: cx, y, x0: cx - w / 2, x1: cx + w / 2, y0: y - 5.5 * k, y1: y + 5.5 * k }; };
    const hit = (a, b) => a.x0 < b.x1 + k && b.x0 < a.x1 + k && a.y0 < b.y1 && b.y0 < a.y1;
    const head = box('прогноз', W - g.R / 2 + 4, g.T - 9 - 6.5 * k), d = 20 * ky, line = 12 * k;   // заголовок — над меткой на 100%
    const ms = ['bc', 'dagger'], dot = ms.map((m) => { const x = g.FX(m), y = g.Y(st.fc[m]); return { x0: x - 9, x1: x + 9, y0: y - 9, y1: y + 9 }; });
    // сдвиг подписи: −1 и 1 — над и под своей меткой, −2 и 2 — ещё на строку дальше, −3 и 3 — над и под соседней подписью
    const ways = [[-1, 1], [1, -1], [1, 1], [-1, -1], [1, 2], [2, 1], [-2, -1], [-1, -2], [1, 3], [3, 1], [-1, -3], [-3, -1]];
    const make = (w, short) => {
      const y = ms.map((m, i) => g.Y(st.fc[m]) + (Math.abs(w[i]) === 2 ? Math.sign(w[i]) * (d + line) : w[i] * d));
      if (Math.abs(w[1]) === 3) y[1] = y[0] + Math.sign(w[1]) * line; else if (Math.abs(w[0]) === 3) y[0] = y[1] + Math.sign(w[0]) * line;
      return ms.map((m, i) => box(short ? `${pct(st.fc[m])}%` : `${m === 'bc' ? 'BC' : 'DAgger'} ${pct(st.fc[m])}%`, g.FX(m), y[i]));
    };
    const fits = (ls) => ls.every((q) => q.y0 >= k && q.y1 <= H - k && !hit(q, head) && !dot.some((o) => hit(q, o)) && !ax.some((o) => hit(q, o))) && !hit(ls[0], ls[1]);
    let lb = null;
    for (const short of narrow ? [true] : [false, true]) { for (const w of ways) { const ls = make(w, short); if (fits(ls)) { lb = ls; break; } } if (lb) break; }
    lb = lb || make(ways[0], narrow);
    K.label(c, k, head.text, head.x, head.y, { px: 10, weight: 700, color: P.ink2, halo: false });
    lb.forEach((q, i) => K.label(c, k, q.text, q.x, q.y, { px: 10, weight: 700, color: colOf(ms[i], P), haloColor: P.surf }));
  }
  function drawChart() {
    const cv = $('#fCv'), { c, k, W, H, narrow } = chartFit(cv, 640, 300, 380), P = pal(), g = geo(W, H, k), ky = Math.max(1, k * 0.8);
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.line; c.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(g.L, g.Y(v)); c.lineTo(g.L + g.gw, g.Y(v)); c.stroke(); labIn(c, k, W, pct(v) + '%', g.L - 6, g.Y(v), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    const ax = [], tb = (t, x, y, px) => { const w = c.measureText(t).width; return { x0: x - w / 2, x1: x + w / 2, y0: y - px * k / 2, y1: y + px * k / 2 }; };   // подписи оси у колонки прогноза
    for (let i = 0; i < NI; i++) {
      const n = String(i + 1), ny = g.T + g.gh + 11 * ky; K.label(c, k, n, g.X(i), ny, { px: 10.5, color: P.ink3, halo: false }); if (i === NI - 1) ax.push(tb(n, g.X(i), ny, 10.5));
      if (!narrow) { const t = `${(i + 1) * 8} поездок`, ty = g.T + g.gh + 25; K.label(c, k, t, g.X(i), ty, { px: 10, color: P.ink3, halo: false }); if (i === NI - 1) ax.push(tb(t, g.X(i), ty, 10)); }
    }
    K.label(c, k, narrow ? 'итерация (по 8 поездок)' : 'итерация обучения и сколько поездок разметил учитель', g.L + g.gw / 2, H - 9 * ky, { px: 10.5, color: P.ink3, halo: false });
    labIn(c, k, W, narrow ? 'доехали из 40' : 'доехали из 40 проверочных', 4, 10 * ky, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    // колонка прогноза
    c.fillStyle = P.bg; c.fillRect(W - g.R + 12, g.T, g.R - 16, g.gh);
    for (const m of ['bc', 'dagger']) {
      const x = g.FX(m), y = g.Y(st.fc[m]), col = colOf(m, P);
      c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = st.moved[m] ? col : P.surf; c.fill(); c.lineWidth = 2.4; c.strokeStyle = col; c.stroke();
      if (!st.moved[m]) { c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y - 15); c.lineTo(x - 4, y - 11); c.moveTo(x, y - 15); c.lineTo(x + 4, y - 11); c.moveTo(x, y + 15); c.lineTo(x - 4, y + 11); c.moveTo(x, y + 15); c.lineTo(x + 4, y + 11); c.stroke(); }
    }
    fcLabels(c, k, W, H, g, ky, narrow, P, ax);
    if (!st.shown) { K.label(c, k, st.busy ? 'ученики учатся…' : (narrow ? 'тяни метки справа, потом кнопка' : 'перетащи метки прогноза справа, потом нажми кнопку миссии'), g.L + g.gw / 2, g.T + g.gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); }
    for (const m of ['bc', 'dagger']) {
      const cu = curve(m); if (!cu || !st.shown) continue; const col = colOf(m, P);
      c.strokeStyle = col; c.lineWidth = 2.6; c.beginPath(); cu.forEach((v, i) => (i ? c.lineTo(g.X(i), g.Y(v)) : c.moveTo(g.X(i), g.Y(v)))); c.stroke();
      cu.forEach((v, i) => { c.beginPath(); c.arc(g.X(i), g.Y(v), i === st.it ? 6 : 4, 0, 7); c.fillStyle = col; c.fill(); });
      const last = cu[cu.length - 1], up = m !== 'bc' && g.Y(last) - 16 * ky > g.T + 4, dy = (up ? -14 : 14) * ky; K.label(c, k, `${m === 'bc' ? 'BC' : 'DAgger'}: ${pct(last)}%`, g.X(NI - 1) - 8, g.Y(last) + dy, { px: 10.5, weight: 700, color: col, align: 'right', haloColor: P.surf });
    }
    if (st.shown) { c.strokeStyle = P.ink; c.lineWidth = 1.2; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(g.X(st.it), g.T); c.lineTo(g.X(st.it), g.T + g.gh); c.stroke(); c.setLineDash([]); }
  }
  function drawMap() {
    const cv = $('#fMap'), { c, k } = K.fit(cv, D.W, D.H), P = pal();
    Plan.house(c, k, P, 0.7, { labels: false });
    const r = st.res[st.kind], h = r && r[st.who] && st.shown ? r[st.who].hist[st.it] : null;
    if (!h) { Plan.ada(c, D.START, P.ink); K.label(c, k, k > 1.5 ? 'появится после обучения' : 'здесь появятся поездки, на которых учился ученик', D.W / 2, D.H / 2 + 50, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf }); return; }
    const col = h.driver === 'teacher' ? P.hy : P.e2e;
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const e of h.eps) { c.strokeStyle = col; c.globalAlpha = 0.75; c.lineWidth = 2.4; c.beginPath(); for (let i = 0; i < e.xy.length; i += 2) (i ? c.lineTo(e.xy[i], e.xy[i + 1]) : c.moveTo(e.xy[i], e.xy[i + 1])); c.stroke(); c.globalAlpha = 1; }
    for (const e of h.eps) Plan.mark(c, e.xy[e.xy.length - 2], e.xy[e.xy.length - 1], e.outcome, P, 8);
  }
  const crashes = (m, i) => { const r = st.res[st.kind]; return r && r[m] ? r[m].hist[i].eps.filter((e) => e.outcome === 'crash').length : 0; };
  function render() {
    drawChart(); drawMap();
    const pg = $('#fProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    const inp = $('#fIt'); inp.value = st.it + 1; syncRange(inp, String(st.it + 1));
    const bc = curve('bc'), dg = curve('dagger');
    if (st.busy) setOut($('#fOut'), `Ученики учатся: ${pct(st.prog)}%.`);
    else if (st.shown && bc && dg) setOut($('#fOut'), `Ученики ${st.kind === 'hist' ? 'с историей' : 'без истории'}, итерация ${st.it + 1}: BC доезжает в ${pct(bc[st.it])}% проверочных поездок, DAgger — в ${pct(dg[st.it])}%. На карте — поездки ${st.who === 'bc' ? 'BC' : 'DAgger'}: ${crashes(st.who, st.it)} из 8 кончились столкновением.`);
    else setOut($('#fOut'), 'Ученики ещё не обучены.');
  }
  async function train(kind) {
    st.busy = true; st.prog = 0; render();
    try {
      const prog = (a, b) => (x) => { st.prog = a + (b - a) * x; render(); };
      const dg = await Models.student(kind, 'dagger', prog(0, 0.5)), bc = await Models.student(kind, 'bc', prog(0.5, 1));
      st.res[kind] = { dagger: dg, bc };
    } finally { st.busy = false; }
    st.kind = kind; segSet('#fKind', kind); st.shown = true; render();
    const c = (m) => st.res[kind][m].hist.map((h) => h.ok);
    return { kind, bc: c('bc'), dagger: c('dagger'), fc: Object.assign({}, st.fc), moved: Object.assign({}, st.moved), crashes: st.res[kind].dagger.hist.map((h) => h.eps.filter((e) => e.outcome === 'crash').length) };
  }
  const upd = () => { render(); if (ctl) ctl.update(); };
  function state() { const dg = st.res[st.kind] && st.res[st.kind].dagger; let worst = 0; if (dg) dg.hist.forEach((h, i) => { if (crashes('dagger', i) > crashes('dagger', worst)) worst = i; }); return { kind: st.kind, who: st.who, it: st.it, shown: st.shown, worst, crashes: crashes(st.who, st.it) }; }
  const api = {
    reset() { st.who = 'dagger'; st.it = 0; segSet('#fWho', 'dagger'); render(); },
    state, render, st,
    setFc(m, v) { st.fc[m] = Math.max(0, Math.min(1, Math.round(v * 40) / 40)); st.moved[m] = true; upd(); },
    setIt(i) { st.it = Math.max(0, Math.min(NI - 1, i)); upd(); },
    setWho(w) { st.who = w; segSet('#fWho', w); upd(); },
    async run() { if (!st.moved.bc || !st.moved.dagger) return { noFc: true }; return train('hist'); },
    async sens() { return train('sens'); },
    setKind: (k) => train(k).then(upd),
  };
  const missions = [
    { short: 'Прогноз', title: 'Кто научится лучше', text: 'Ученик BC все 6 итераций учится на поездках учителя. Ученик DAgger — только в первой, а дальше ездит сам, и учитель в каждом его состоянии подсказывает свою скорость. Перетащи две метки справа на графике: сколько проверочных поездок из 40, по-твоему, будет доезжать каждый после 6 итераций. Потом нажми кнопку.',
      action: { label: 'Обучить двух учеников', run: (X) => X.run() },
      criteria: [{ label: 'Прогноз сделан для обоих учеников', test: (r) => !r.noFc }, { label: 'DAgger после 6 итераций доезжает хотя бы в 90%', test: (r) => !r.noFc && r.dagger[NI - 1] >= 0.9 }, { label: 'BC — реже, чем DAgger', test: (r) => !r.noFc && r.bc[NI - 1] < r.dagger[NI - 1] }],
      fail: (r) => (r.noFc ? 'Сначала перетащи обе метки в колонке «прогноз» справа на графике: это твой прогноз.' : 'Обучение не дало ожидаемого исхода.'),
      explain: (r) => { const e = (m) => Math.round(Math.abs(r.fc[m] - r[m][NI - 1]) * 100); return `Твой прогноз: BC — ${pct(r.fc.bc)}%, DAgger — ${pct(r.fc.dagger)}%. Вышло: BC — ${pct(r.bc[NI - 1])}%, DAgger — ${pct(r.dagger[NI - 1])}% (ошибка прогноза ${e('bc')} и ${e('dagger')} пунктов). После первой итерации, где оба учились на одних и тех же 8 поездках учителя, — по ${pct(r.dagger[0])}%. Дальше у BC прибавляются поездки, похожие на прежние, а у DAgger — поездки самого ученика с его ошибками, и учитель объясняет, как надо было ехать именно там. В абляции Learning by Cheating разница того же знака: 16% без поездок ученика, 64% с ними.`; } },
    { short: 'Ошибки — данные', title: 'Ошибки ученика становятся данными', text: 'Карта под графиком показывает 8 поездок выбранной итерации — те, на которых учился ученик. Переключи карту на DAgger и найди итерацию, на которой ученик во время сбора данных врезался чаще всего.',
      controls: ['who', 'it'],
      onEnter: (X) => X.setWho('bc'),
      criteria: [{ label: 'На карте — поездки DAgger', test: (r, s) => s.shown && s.who === 'dagger' }, { label: 'Выбрана итерация с наибольшим числом столкновений', test: (r, s) => s.shown && s.who === 'dagger' && s.it === s.worst && s.crashes > 0 }],
      hint: 'Двигай ползунок итерации: на первой едет учитель и не врезается ни разу, дальше едет ученик.',
      explain: (s) => { const dg = Fore.st.res[Fore.st.kind].dagger.hist, bc = Fore.st.res[Fore.st.kind].bc.hist, i = s.it; return `На итерации ${i + 1} ученик врезался в ${s.crashes} поездках из 8. Учитель разметил и эти состояния: какую скорость надо было держать перед поворотом, где Аду вынесло. Перед этой итерацией ученик доезжал в ${pct(dg[Math.max(0, i - 1)].ok)}% проверочных поездок, после неё — в ${pct(dg[i].ok)}%. У BC после той же итерации — ${pct(bc[i].ok)}%: все его поездки ведёт учитель, и мест, куда заезжает ученик, в его данных нет.`; } },
    { short: 'Без истории', title: 'DAgger для ученика без истории', text: 'DAgger исправил сдвиг распределения у ученика с историей. Обучим тем же способом двух учеников без истории — у них только датчики.',
      controls: ['who', 'it'],
      bet: { q: 'поможет ли DAgger ученику без истории?', options: ['Да, так же: DAgger добирает данные там, куда ученик заезжает', 'Нет: по одним датчикам пол не узнать, сколько учителя ни спрашивай', 'Да, но ему нужно больше итераций'], answer: (r) => (r.dagger[NI - 1] <= 0.7 ? 1 : 0) },
      action: { label: 'Обучить учеников без истории', run: (X) => X.sens() },
      criteria: [{ label: 'DAgger без истории доезжает не больше чем в 70% проверочных поездок', test: (r) => r.dagger[NI - 1] <= 0.7 }],
      explain: (r) => `Ученик DAgger без истории после 6 итераций доезжает в ${pct(r.dagger[NI - 1])}% проверочных поездок, ученик BC без истории — в ${pct(r.bc[NI - 1])}%; с историей DAgger доезжал в ${pct(Fore.st.res.hist ? Fore.st.res.hist.dagger.hist[NI - 1].ok : 0)}%. Сколько ни спрашивай учителя, по одним датчикам не отличить ковёр от мокрого пола, и на мокром полу и мокрой кухне такой ученик врезается при любом способе обучения. DAgger лечит сдвиг распределения, но не недостаток информации.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Переключай учеников (с историей и без), способ на карте и итерацию. Найди итерацию, после которой кривая DAgger с историей впервые обгоняет BC, и посмотри, чьи поездки были у обоих до неё.', final: true },
  ];
  function init() {
    const cv = $('#fCv');
    const pt = (e) => { const r = cv.getBoundingClientRect(), W = 640, H = r.width < 500 ? 380 : 300, g = geo(W, H, W / r.width); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, g, W, H }; };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const p = pt(e), g = p.g; let best = null, bd = 40;
      for (const m of ['bc', 'dagger']) { const d = Math.abs(p.x - g.FX(m)) + Math.abs(p.y - g.Y(st.fc[m])) * 0.3; if (Math.abs(p.x - g.FX(m)) < 24 && d < bd) { bd = d; best = m; } }
      if (best) { drag = best; cv.setPointerCapture(e.pointerId); api.setFc(best, 1 - (p.y - g.T) / g.gh); e.preventDefault(); }
      else if (st.shown && p.x < p.W - g.R) api.setIt(Math.round((p.x - g.L) / g.gw * (NI - 1)));
    });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const p = pt(e); api.setFc(drag, 1 - (p.y - p.g.T) / p.g.gh); });
    const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (!t) return; const p = pt(t); if (p.x > p.W - p.g.R) e.preventDefault(); }, { passive: false });
    $('#fIt').addEventListener('input', (e) => api.setIt(+e.target.value - 1));
    segBind('#fWho', (v) => api.setWho(v));
    segBind('#fKind', (v) => { if (!st.busy) api.setKind(v); });
    ctl = mountMissions('#fMis', missions, api, { controls: { who: '#wrapFWho', it: '#wrapFIt', kind: '#wrapFFree' }, scene: '#fCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st };
})();

/* =====================================================================
   3. Лаборатория: адаптационный модуль на смене пола
   ===================================================================== */
const Adapt = (() => {
  const E = L55, D = Drive, K = HeroKit, MUS = [1.0, 0.7, 0.45];
  const st = { floor: [1, 1, 0.45], k: 20, cur: null, busy: false, prog: 0 };
  let ctl = null;
  /** Поездка RMA: учитель с оценкой модуля; события — торможение и проскальзывание по шагам. */
  function analyse(T, M, floor) {
    const e = E.ride(E.ctlRMA(T, M), floor, E.TEST_SEED, null, M), n = e.T, brake = [], slip = [];
    for (let t = 0; t < n; t++) {
      const s0 = e.traj[t], s1 = e.traj[t + 1];
      brake.push(E.vCmd(e.acts[t], E.CFG) < s0.v - 3);
      slip.push(Math.abs(s1.wc) > E.CFG.A_LAT * e.mus[t] / Math.max(s1.v, 1) + 1e-9);
    }
    let ch = -1; for (let t = 1; t < n; t++) if (e.mus[t] !== e.mus[t - 1]) { ch = t; break; }
    let det = -1; if (ch >= 0) for (let t = ch; t < n; t++) if (Math.abs(e.est[t] - e.mus[t]) < 0.1) { det = t; break; }
    const after = ch >= 0 ? e.est.slice(ch, Math.min(n, ch + 10)) : [];
    return { e, n, brake, slip, ch, det, lag: det >= 0 ? det - ch : null, before: ch > 0 ? e.est[ch - 1] : null, at: det >= 0 ? e.est[det] : null,
      max1s: after.length ? Math.max(...after) : null, mean1s: after.length ? after.reduce((a, b) => a + b, 0) / after.length : null,
      meanAll: n > 10 ? e.est.slice(10).reduce((a, b) => a + b, 0) / (n - 10) : null, muAfter: ch >= 0 ? e.mus[ch] : null, outcome: e.outcome, time: e.time, k: M.k, floor: floor.slice() };
  }
  async function run() {
    if (st.busy) return null;
    st.busy = true; st.prog = 0; render();
    try {
      const T = await Models.teacher((x) => { st.prog = 0.7 * x; render(); }), { M } = await Models.mod(st.k, (x) => { st.prog = x; render(); });
      st.cur = analyse(T.A, M, st.floor);
    } finally { st.busy = false; }
    render(); return st.cur;
  }
  const muCol = (m, P) => (m >= 0.75 ? P.e2e : m >= 0.58 ? P.hy : P.cl);
  const free = () => !!(ctl && ctl.index === 3);
  function drawMap() {
    const cv = $('#aCv'), { c, k } = K.fit(cv, D.W, D.H), P = pal();
    Plan.house(c, k, P, st.floor);
    const r = st.cur;
    if (!r) { Plan.ada(c, D.START, P.ink); K.label(c, k, st.busy ? 'модуль учится…' : free() ? 'нажми «Поехать»' : (k > 1.5 ? 'нажми кнопку миссии' : 'нажми кнопку миссии, и Ада поедет'), D.W / 2, D.H / 2 + 50, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf }); return; }
    const tr = r.e.traj; c.lineCap = 'round';
    for (let t = 0; t < r.n; t++) { c.strokeStyle = muCol(r.e.est[t], P); c.lineWidth = 5; c.beginPath(); c.moveTo(tr[t].x, tr[t].y); c.lineTo(tr[t + 1].x, tr[t + 1].y); c.stroke(); }
    for (let t = 0; t < r.n; t++) if (r.slip[t]) { c.beginPath(); c.arc(tr[t + 1].x, tr[t + 1].y, 4.5, 0, 7); c.fillStyle = P.bad; c.fill(); }
    const l = tr[r.n]; Plan.mark(c, l.x, l.y, r.outcome, P, 9);
  }
  function drawChart() {
    const cv = $('#aChart'), { c, k, W, H, narrow } = chartFit(cv, 640, 260, 360), P = pal(), ky = Math.max(1, k * 0.8);
    c.fillStyle = P.surf; c.fillRect(0, 0, W, H);
    const L = 44 * ky, R = 14, T = 28 * ky, B = 34 + 22 * ky, gw = W - L - R, gh = H - T - B, lo = 0.2, hi = 1.1;
    const r = st.cur, tmax = r ? Math.max(4, r.n * 0.1) : 8, X = (t) => L + gw * t / tmax, Y = (m) => T + gh * (hi - m) / (hi - lo);
    c.strokeStyle = P.line; c.lineWidth = 1;
    for (const m of [0.3, 0.45, 0.7, 1]) { c.beginPath(); c.moveTo(L, Y(m)); c.lineTo(L + gw, Y(m)); c.stroke(); K.label(c, k, fmt(m, 2), L - 6, Y(m), { px: 10.5, color: P.ink3, align: 'right', halo: false }); }
    for (let t = 0; t <= tmax + 1e-9; t += 1) K.label(c, k, String(t), X(t), T + gh + 14 + 14 * ky, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, 'время поездки, с', L + gw / 2, H - 6 * ky, { px: 10.5, color: P.ink3, halo: false });
    K.label(c, k, 'сцепление μ', 4, 10 * ky, { px: 10.5, color: P.ink3, align: 'left', halo: false });
    const lg = (x, col, txt, line) => { c.fillStyle = col; if (line) c.fillRect(x, 9 * ky, 14 * ky, 2.6 * ky); else c.fillRect(x, 7.5 * ky, 12 * ky, 5 * ky); K.label(c, k, txt, x + 17 * ky, 10 * ky, { px: 9.5, weight: 650, color: col, align: 'left', halo: false }); };
    lg(W * 0.3, P.e2e, 'оценка μ̂', true); lg(W * 0.53, P.cl, 'тормозит'); lg(W * 0.74, P.bad, 'скользит');
    if (!r) { K.label(c, k, st.busy ? 'модуль учится…' : (narrow ? 'появится после поездки' : free() ? 'график появится после поездки: нажми «Поехать»' : 'график появится после поездки: нажми кнопку миссии'), L + gw / 2, T + gh / 2, { px: 12.5, weight: 700, color: P.ink2, haloColor: P.surf }); return; }
    const dt = 0.1;
    c.fillStyle = P.bg; for (let t = 0; t < r.n; t++) c.fillRect(X(t * dt), Y(Math.min(hi, r.e.mus[t] + 0.1)), gw * dt / tmax + 0.6, Y(r.e.mus[t] - 0.1) - Y(Math.min(hi, r.e.mus[t] + 0.1)));
    c.strokeStyle = P.ink3; c.lineWidth = 3; c.beginPath(); for (let t = 0; t < r.n; t++) { const y = Y(r.e.mus[t]); if (t) c.lineTo(X(t * dt), y); else c.moveTo(X(0), y); c.lineTo(X((t + 1) * dt), y); } c.stroke();
    c.strokeStyle = P.e2e; c.lineWidth = 2.6; c.beginPath(); for (let t = 0; t < r.n; t++) { const x = X((t + 0.5) * dt), y = Y(r.e.est[t]); t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    const ey = T + gh + 8; for (let t = 0; t < r.n; t++) { if (r.brake[t]) { c.fillStyle = P.cl; c.fillRect(X(t * dt), ey, Math.max(1.5, gw * dt / tmax - 1), 5); } if (r.slip[t]) { c.fillStyle = P.bad; c.fillRect(X(t * dt), ey + 7, Math.max(1.5, gw * dt / tmax - 1), 5); } }
    if (r.ch >= 0) { c.setLineDash([3, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(r.ch * dt), T); c.lineTo(X(r.ch * dt), T + gh); c.stroke(); c.setLineDash([]); K.label(c, k, 'смена пола', X(r.ch * dt) - 3, T + 24 * ky, { px: 10, color: P.ink2, align: 'right', haloColor: P.surf }); }
    if (r.det >= 0) { c.strokeStyle = P.ink; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X((r.det + 0.5) * dt), T); c.lineTo(X((r.det + 0.5) * dt), T + gh); c.stroke(); K.label(c, k, `через ${fmt(r.lag * dt, 1)} с`, X((r.det + 0.5) * dt) + 4, T + 24 * ky, { px: 10, weight: 700, color: P.ink, align: 'left', haloColor: P.surf }); }
  }
  function render() {
    drawMap(); drawChart();
    const pg = $('#aProg'); pg.hidden = !st.busy; pg.firstElementChild.style.width = (st.prog * 100).toFixed(1) + '%';
    $('#aGo').disabled = st.busy;
    const r = st.cur, fl = st.floor.map((m) => Plan.FLOOR_NAME[Plan.kindOf(m)]).join(' → ');
    if (st.busy) setOut($('#aOut'), `Модуль с историей ${fmt(st.k / 10, 1)} с учится: ${pct(st.prog)}%.`);
    else if (r) setOut($('#aOut'), `Полы: ${fl}. История модуля ${fmt(r.k / 10, 1)} с. Ада ${r.outcome === 'goal' ? `доехала за ${sec(r.time)}` : 'не доехала'}.${r.ch >= 0 ? ` Смена пола на ${fmt(r.ch / 10, 1)} с: оценка ${r.det >= 0 ? `попала в ±0,1 через ${fmt(r.lag / 10, 1)} с (${nWord(r.lag, 'шаг', 'шага', 'шагов')})` : 'так и не попала в ±0,1 до конца поездки'}.` : ' Пол во всех комнатах один.'}`);
    else setOut($('#aOut'), `Полы: ${fl}. Модуль ещё не обучен.`);
  }
  function setFloor(f) { st.floor = f.slice(); st.cur = null; render(); }
  function setK(k) { st.k = k; segSet('#aK', String(k)); st.cur = null; render(); }
  const api = {
    reset() { setK(20); setFloor([1, 1, 0.45]); },
    state: () => ({ floor: st.floor.slice(), k: st.k, cur: st.cur, busy: st.busy }), render, st,
    wetKitchen() { setK(20); setFloor([1, 1, 0.45]); return run(); },
    backToCarpet() { setK(20); setFloor([0.45, 0.45, 1]); return run(); },
    async carpetAll() {
      setK(20); setFloor([1, 1, 1]); const r = await run(); if (!r) return r;
      const T = await Models.teacher(), { M } = await Models.mod(20), tr = E.trips(E.ctlRMA(T.A, M), 1, 20), tt = E.trips(E.ctlPPO(T.A), 1, 20);
      return Object.assign({}, r, { rmaOk: E.okShare(tr), rmaTime: E.meanTime(tr), tOk: E.okShare(tt), tTime: E.meanTime(tt) });
    },
    go: run, setFloor, setK,
  };
  const missions = [
    { short: 'Мокрая кухня', title: 'Ада въезжает на мокрую кухню', text: 'В прихожей и гостиной ковёр, на кухне мокрый пол. Ада едет политикой учителя, но вместо настоящего μ ей подают оценку модуля по истории последних 2 секунд.',
      bet: { q: 'когда модуль поймёт, что на кухне мокро?', options: ['Сразу, в тот же шаг: сцепление под колёсами уже другое', 'За доли секунды: как только тормоз сработает слабее или колёса проскользнут в повороте', 'Через 2 с: пока из истории не уйдёт ковёр'], answer: (r) => (r.lag <= 0 ? 0 : r.lag < 10 ? 1 : 2) },
      action: { label: 'Поехать', run: (X) => X.wetKitchen() },
      criteria: [{ label: 'Оценка попала в ±0,1 от настоящего μ', test: (r) => r.det >= 0 }, { label: 'Меньше чем за 1 с после въезда на кухню', test: (r) => r.det >= 0 && r.lag < 10 }],
      explain: (r) => {
        // шаги от въезда до шага, на котором оценка попала в полосу: что случилось на них, модуль уже видел в истории
        const ns = r.slip.slice(r.ch, r.det).filter(Boolean).length, nb = r.brake.slice(r.ch, r.det).filter(Boolean).length;
        const why = [ns ? `колёса проскальзывали в повороте ${nWord(ns, 'шаг', 'шага', 'шагов')}` : '', nb ? `Ада тормозила ${nWord(nb, 'шаг', 'шага', 'шагов')}` : ''].filter(Boolean).join(', а ');
        return `Ада въехала на кухню на ${fmt(r.ch / 10, 1)} с. До этого модуль оценивал сцепление в ${fmt(r.before, 2)}, а через ${nWord(r.lag, 'шаг', 'шага', 'шагов')} (${fmt(r.lag / 10, 1)} с) — уже в ${fmt(r.at, 2)} при настоящем ${fmt(r.muAfter, 2)}.${why ? ` За эти шаги ${why}: скользкий пол выдал себя, как только колёсам пришлось его испытать.` : ''} Ждать, пока сменится вся история, не нужно — хватает нескольких последних шагов, где команда и ответ колёс разошлись. Авторы RMA пишут о том же: модуль замечает перемену за доли секунды.`;
      } },
    { short: 'Снова ковёр', title: 'С мокрого пола — на ковёр', text: 'Теперь наоборот: в прихожей и гостиной мокрый пол, на кухне ковёр. Модуль тот же, история — 2 секунды.',
      bet: { q: 'заметит ли модуль, что на кухне снова ковёр, так же быстро?', options: ['Да, так же быстро: сцепление поменялось', 'Нет: на хорошем полу ничего не скользит, а в истории ещё мокрый пол', 'Заметит быстрее: на ковре колёса держат лучше'], answer: (r) => (r.mean1s < r.muAfter - 0.1 ? 1 : 0) },
      action: { label: 'Поехать', run: (X) => X.backToCarpet() },
      criteria: [{ label: 'В первую секунду на ковре оценка в среднем ниже 0,9', test: (r) => r.mean1s < 0.9 }],
      explain: (r) => `В первую секунду на ковре модуль оценивает сцепление в среднем в ${fmt(r.mean1s, 2)}, не выше ${fmt(r.max1s, 2)}, при настоящем ${fmt(r.muAfter, 2)}${r.det >= 0 ? `; в полосу ±0,1 оценка попадает только через ${fmt(r.lag / 10, 1)} с` : ', а в полосу ±0,1 не попадает до самой цели'}. Хороший пол ничем себя не выдаёт: колёса не скользят, тормоз срабатывает как надо, — а в истории ещё лежат проскальзывания с мокрого пола. Ада, которой подают такую оценку, едет по ковру осторожно, как по мокрому. Lee и соавторы видели то же: оценка трения у их ученика поднималась примерно через 2 секунды после возвращения на нормальный грунт.` },
    { short: 'Весь ковёр', title: 'Ковёр во всей квартире', text: 'Последняя проверка: ковёр в каждой комнате, сцепление 1 всю поездку.',
      bet: { q: 'какое сцепление будет оценивать модуль на ковре?', options: ['1,0: модуль учился на точных значениях', 'Меньше 1: пока колёса не скользят, видно лишь, что сцепления хватает', 'Будет прыгать от 0,3 до 1: на ковре данных о поле мало'], answer: (r) => (r.meanAll >= 0.95 ? 0 : r.meanAll >= 0.75 ? 1 : 2) },
      action: { label: 'Поехать', run: (X) => X.carpetAll() },
      criteria: [{ label: 'После первой секунды оценка в среднем от 0,8 до 0,95', test: (r) => r.meanAll >= 0.8 && r.meanAll < 0.95 }],
      explain: (r) => `После первой секунды модуль оценивает сцепление в среднем в ${fmt(r.meanAll, 2)}, а не в 1. В прихожей и гостиной колёса почти не скользят, и по истории видно лишь, что сцепления хватает. На повороте в кухню они проскальзывают, но по нескольким шагам с шумными датчиками ковёр трудно отличить от пола немного хуже. Модуль учился на среднем квадрате ошибки и в таких случаях выдаёт среднее по похожим полам, а сцепление 1 — самое большое из тех, что были в обучении, поэтому это среднее ниже. Ехать это не мешает: с такой оценкой Ада доезжает в ${pct(r.rmaOk)}% проверочных поездок по ковру, в среднем за ${sec(r.rmaTime)}, а учитель с настоящим μ — в ${pct(r.tOk)}%, за ${sec(r.tTime)}. Авторы RMA пишут о том же: оценке не обязательно быть верной в каком-то «истинном» смысле, важно, чтобы она вела к правильному действию.` },
    { short: 'Свободно', title: 'Свободный режим', text: 'Нажимай на комнаты, чтобы разложить полы, выбирай длину истории — 0,5 с, как в RMA, 1 с или 2 с — и проезжай. Найди раскладку, при которой модуль дольше всего не замечает смену пола, и сравни, как быстро модули с короткой и длинной историей замечают возвращение на ковёр.', final: true },
  ];
  function init() {
    const cv = $('#aCv');
    cv.addEventListener('click', (e) => { if (st.busy || !ctl || ctl.index !== missions.length - 1) return; const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * D.W, i = Plan.roomAt(x), f = st.floor.slice(), j = MUS.findIndex((m) => Math.abs(m - f[i]) < 1e-9); f[i] = MUS[(j + 1) % MUS.length]; setFloor(f); if (ctl) ctl.update(); });
    segBind('#aK', (v) => { if (!st.busy) { setK(+v); if (ctl) ctl.update(); } });
    $('#aGo').addEventListener('click', () => { if (!st.busy) run().then(() => ctl && ctl.update()); });
    ctl = mountMissions('#aMis', missions, api, { controls: { k: '#wrapAK', go: '#wrapAGo' }, scene: '#aCv' });
    render(); redrawOn(render);
    return ctl;
  }
  return { init, api, st, analyse };
})();

/* ---------- Квиз ---------- */
function renderQuiz(boxSel, Q, scoreSel) {
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $(boxSel); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true }), pm = perms[qi % perms.length];
    pm.forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[pm.indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Отлично, можно идти дальше.' : 'Загляни ещё раз в разделы, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Привилегированный учитель получает на вход трение пола. Значит, и на настоящем роботе нужно мерить трение?', o: ['Да, иначе учитель не сможет работать', 'Нет: учитель остаётся в симуляторе, на роботе работает ученик, которому трение не нужно', 'Да, но достаточно мерить его один раз перед поездкой'], a: 1, e: 'Привилегированная информация нужна только при обучении. Ученик учится повторять учителя по тому, что есть у настоящего робота: датчикам и истории.' },
    { q: 'Учитель ездит отлично. Ученик с теми же датчиками, но без трения, старательно его повторяет. Он будет ездить почти так же?', o: ['Да, если обучить на достаточном числе поездок', 'Нет: там, где учитель ведёт себя по-разному на разных полах, ученик выучит среднее — на ковре слишком осторожное, на мокром полу слишком смелое', 'Да, но только медленнее'], a: 1, e: 'В лаборатории 1 ученик без истории на мокром полу не доехал ни разу, а на ковре ехал медленнее учителя. Подражать можно только тому, что видно по входу.' },
    { q: 'Чтобы ученик ошибался меньше, достаточно показать ему больше поездок учителя?', o: ['Да: больше данных — лучше', 'Нет: важнее, чтобы данные были из тех мест и с той историей, которые бывают у самого ученика, — его надо учить на своих поездках (DAgger)', 'Нет: нужно меньше поездок, чтобы не переобучиться'], a: 1, e: 'При одинаковом числе размеченных поездок ученик DAgger в лаборатории 2 обогнал ученика BC; в Learning by Cheating поездки ученика подняли успех с 16 до 64%.' },
    { q: 'DAgger исправляет любые недостатки ученика?', o: ['Да, если итераций достаточно', 'Нет: он добирает данные там, куда заезжает ученик, но не даёт ему информации, которой нет на входе', 'Да, но только для дискретных действий'], a: 1, e: 'Ученик без истории и с DAgger врезается на мокром полу: по одним датчикам ковёр от мокрого пола не отличить, сколько учителя ни спрашивай.' },
    { q: 'Адаптационный модуль в RMA должен точно восстанавливать массу груза, трение и силу моторов?', o: ['Да, иначе политика ошибётся', 'Нет: он восстанавливает сжатый вектор, по которому политика выбирает действие; вариант с явной оценкой параметров (SysID) сработал хуже', 'Да, и для этого ему нужно несколько минут'], a: 1, e: 'В симуляции RMA прошёл 73,5% испытаний, SysID — 56,5%. Авторы пишут, что явно оценивать параметры мира трудно и не нужно.' },
    { q: 'Ада въехала на мокрый пол. Модуль узнает это сразу?', o: ['Да: история сразу показывает другое сцепление', 'Как только Аде придётся тормозить или круто поворачивать: пока она едет ровно и с запасом, история на любом полу одна и та же', 'Только через 2 секунды, когда сменится вся история'], a: 1, e: 'Сцепление проявляется, когда колёсам приходится передавать силу. В лаборатории 3 модуль заметил мокрую кухню за доли секунды — на первом повороте.' },
    { q: 'Ада всю поездку едет по ковру со сцеплением 1. Модуль по истории оценит его ровно в 1?', o: ['Да, модуль учился на точных значениях', 'Нет: пока колёса не скользят, по истории видно лишь, что сцепления хватает, и модуль выдаёт что-то среднее по таким полам', 'Нет, на ковре оценка прыгает от 0,3 до 1'], a: 1, e: 'В лаборатории 3 на ковре модуль оценивал сцепление примерно в 0,85–0,9. Ехать это не мешает: важна не точная цифра, а правильное действие, — так же рассуждают авторы RMA.' },
    { q: 'Политика, которую учили с подкреплением без знания пола (как в уроке 5.4), — опасная?', o: ['Да, она врезается на скользком полу', 'Нет, она надёжна, но осторожна: едет везде почти как по самому скользкому полу и теряет время', 'Нет, она не хуже учителя'], a: 1, e: 'В лаборатории 1 она доезжала на всех полах, но на ковре тратила заметно больше времени, чем учитель. Авторы RMA пишут, что такая политика выучивает «очень консервативное» поведение.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('trio', () => { mis.trio = Trio.init(); });
    safe('fore', () => { mis.fore = Fore.init(); });
    safe('adapt', () => { mis.adapt = Adapt.init(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['tMis', 'fMis', 'aMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} ${plural(n, 'миссия', 'миссии', 'миссий')} с целью`; });
    window.__l55 = { mis, SPEED, Trio, Fore, Adapt, Models, L55 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
