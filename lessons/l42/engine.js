/* =====================================================================
   l42/engine.js — урок 4.2 «Телеоперация и устройства сбора». Без DOM:
   работает в браузере (window.L42) и в Node (module.exports).
   1) Телеоперация руки Ады (shared/arm-core.js): вид сбоку, рука переносит
      чашку со стола на полку. Три интерфейса — ведущая рука (углы суставов
      один в один), рука в воздухе (поза кисти с дрожью слежения, обратная
      кинематика) и клавиши (скорость захвата, обратная кинематика).
      Задержка команд, запись демонстрации 50 раз в секунду, показатели
      качества: длительность, лишний путь, паузы, дрожь действий, касания.
      Модель оператора (смотрит на руку, двигает и ждёт) — для проверок.
   2) Калькулятор цены часа данных по способам сбора (ниже, раздел 2).
   ===================================================================== */
'use strict';
(function (root) {
  const Arm = typeof module !== 'undefined' && module.exports ? require('../shared/arm-core.js') : root.Arm;
  const DT = 0.02;                                   // такт 20 мс: телеоперация и запись 50 раз в секунду, как в ALOHA
  const KP = 14, VMAX = 3;                           // регулятор суставов Ады: 1/с и рад/с
  const REACH = [0.13, Arm.L1 + Arm.L2 - 0.012];     // кольцо досягаемости кисти, м
  /* ---------- сцена, вид сбоку; плечо Ады в (0, 0), ось y вверх, метры ----------
     «Кисть» — конец второго звена; пальцы захвата висят под ней на 7 см. */
  const S = {
    table: { y: -0.5, x0: 0.15, x1: 1.0 },
    cup: { x: 0.42, w: 0.07, h: 0.09 },              // чашка на столе
    shelf: { x0: 0.55, x1: 0.92, y: 0.14, th: 0.025 },
    wall: 0.92,
    finger: 0.07,                                    // длина пальцев под кистью
    hang: 0.035,                                     // от кисти до верха чашки в захвате
    start: { x: 0.28, y: -0.02 },                    // кисть в начале записи
    placeX: [0.62, 0.85],                            // где на полке можно оставить чашку (центр)
  };
  S.grasp = { x: S.cup.x, y: S.table.y + S.cup.h + S.hang };          // кисть, когда чашка в захвате на столе
  S.place = { x: 0.71, y: S.shelf.y + S.cup.h + S.hang };              // кисть, когда чашка стоит на полке
  S.corner = { x: S.shelf.x0 - S.cup.w / 2, y: S.place.y };            // угол полки, который огибает чашка
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clampR = (p) => { const r = Math.hypot(p.x, p.y) || 1e-9, f = r > REACH[1] ? REACH[1] / r : r < REACH[0] ? REACH[0] / r : 1; return { x: p.x * f, y: p.y * f }; };
  /** Обратная кинематика: решение, ближайшее к прошлым углам (локоть не перескакивает). */
  function ikNear(p, qPrev) {
    const c = clampR(p), sols = Arm.ik(c.x, c.y);
    if (!sols.length) return qPrev.slice();
    let best = sols[0], bd = Infinity;
    for (const s of sols) { const d = Math.abs(wrap(s[0] - qPrev[0])) + Math.abs(wrap(s[1] - qPrev[1])); if (d < bd) { bd = d; best = s; } }
    return [qPrev[0] + wrap(best[0] - qPrev[0]), qPrev[1] + wrap(best[1] - qPrev[1])];
  }
  const Q0 = Arm.ik(S.start.x, S.start.y)[0];        // локоть внизу, как у человека
  const wristOf = (q) => { const f = Arm.fk(q); return { x: f.x, y: f.y }; };
  /** Шум слежения за рукой: процесс Орнштейна — Уленбека, σ в метрах, время корреляции 60 мс. */
  function ou(r, n, sigma) { const a = Math.exp(-DT / 0.06), b = sigma * Math.sqrt(1 - a * a); n.x = a * n.x + b * Arm.randn(r); n.y = a * n.y + b * Arm.randn(r); return n; }

  /* ---------- одна запись ---------- */
  /** opts: { mode: 'leader' | 'air' | 'keys', delay: мс, noise: мм (для руки в воздухе), seed } */
  function create(opts) {
    opts = opts || {};
    const sim = {
      mode: opts.mode || 'leader', delay: opts.delay || 0, noise: opts.noise == null ? 5 : opts.noise, rng: Arm.rng(opts.seed || 7),
      tick: 0, q: Q0.slice(), qCmd: Q0.slice(), qLead: Q0.slice(), buf: [], hand: Object.assign({}, S.start), keyTarget: Object.assign({}, S.start), dir: { x: 0, y: 0 }, n: { x: 0, y: 0 },
      grip: 'open', gripT: 0, cup: { x: S.cup.x, y: S.table.y, held: false, onShelf: false }, still: [], contact: false,
      started: false, t0: 0, done: false, timeout: false, bumps: 0, rec: [], cmdTarget: Object.assign({}, S.start), events: [],
    };
    return sim;
  }
  /** Ввод оператора: рука (ведущая или в воздухе) — точка кисти в метрах; клавиши — направление. */
  function setHand(sim, p) { sim.hand = clampR(p); }
  function setDir(sim, d) { sim.dir = { x: Math.sign(d.x || 0), y: Math.sign(d.y || 0) }; }
  const delayTicks = (sim) => Math.round(sim.delay / 1000 / DT);
  /** Прямоугольники для столкновений: пальцы захвата и чашка в захвате. */
  function bodyRects(w, held) {
    const R = [{ x0: w.x - 0.026, x1: w.x + 0.026, y0: w.y - S.finger, y1: w.y + 0.01 }];
    if (held) R.push({ x0: w.x - S.cup.w / 2, x1: w.x + S.cup.w / 2, y0: w.y - S.hang - S.cup.h, y1: w.y - S.hang });
    return R;
  }
  const OBST = [
    { x0: S.shelf.x0, x1: S.wall + 0.1, y0: S.shelf.y - S.shelf.th, y1: S.shelf.y },   // полка
    { x0: S.table.x0, x1: S.table.x1, y0: S.table.y - 0.2, y1: S.table.y },              // стол
    { x0: S.wall, x1: S.wall + 0.3, y0: -1, y1: 1 },                                      // стена
  ];
  /** Вытолкнуть кисть из препятствий по наименьшему перекрытию. Возвращает глубину, м. */
  function resolve(w, held) {
    let depth = 0;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of bodyRects(w, held)) for (const o of OBST) {
        const ox = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0), oy = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
        if (ox <= 0 || oy <= 0) continue;
        depth = Math.max(depth, Math.min(ox, oy));
        if (ox < oy) w.x += (b.x0 + b.x1) / 2 < (o.x0 + o.x1) / 2 ? -ox : ox; else w.y += (b.y0 + b.y1) / 2 < (o.y0 + o.y1) / 2 ? -oy : oy;
        moved = true; break;
      }
      if (!moved) break;
    }
    return depth;
  }
  /** Один такт 20 мс. */
  function step(sim) {
    if (sim.done) return sim;
    sim.tick++;
    // 1. команда от интерфейса
    if (sim.mode === 'leader') { sim.qLead = ikNear(sim.hand, sim.qLead); sim.qCmd = sim.qLead.slice(); sim.cmdTarget = wristOf(sim.qCmd); }
    else if (sim.mode === 'air') { const n = ou(sim.rng, sim.n, sim.noise / 1000); const p = clampR({ x: sim.hand.x + n.x, y: sim.hand.y + n.y }); sim.cmdTarget = p; sim.qCmd = ikNear(p, sim.qCmd); }
    else { const k = sim.dir.x && sim.dir.y ? Math.SQRT1_2 : 1; sim.keyTarget = clampR({ x: sim.keyTarget.x + sim.dir.x * KEY_V * k * DT, y: sim.keyTarget.y + sim.dir.y * KEY_V * k * DT }); sim.cmdTarget = sim.keyTarget; sim.qCmd = ikNear(sim.keyTarget, sim.qCmd); }
    sim.buf.push(sim.qCmd.slice());
    const d = delayTicks(sim), qApp = sim.buf[Math.max(0, sim.buf.length - 1 - d)];
    if (sim.buf.length > d + 2) sim.buf.shift();
    // 2. рука Ады следует за командой с ограничением скорости суставов
    const prev = wristOf(sim.q);
    for (let j = 0; j < 2; j++) { const v = Math.max(-VMAX, Math.min(VMAX, KP * (qApp[j] - sim.q[j]))); sim.q[j] += v * DT; }
    const held = sim.grip === 'hold' || sim.grip === 'opening';
    let w = wristOf(sim.q); const depth = resolve(w, held);
    if (depth > 0) { sim.q = ikNear(w, sim.q); w = wristOf(sim.q); }
    if (depth > 0.004 && !sim.contact) { sim.bumps++; sim.events.push({ t: sim.tick * DT, kind: 'bump' }); }
    sim.contact = depth > 0.002;
    // 3. начало записи — первое движение команды
    if (!sim.started && dist(sim.cmdTarget, S.start) > 0.006) { sim.started = true; sim.t0 = sim.tick; }
    // 4. захват: сжимается сам, если кисть 0,3 с стоит у чашки; разжимается на полке
    // «стоит» — сглаженная точка кисти 0,3 с не выходит из круга 1,5 см (дрожь слежения не мешает захвату)
    sim.ws = sim.ws ? { x: sim.ws.x + 0.3 * (w.x - sim.ws.x), y: sim.ws.y + 0.3 * (w.y - sim.ws.y) } : { x: w.x, y: w.y };
    sim.still.push(sim.ws); if (sim.still.length > 15) sim.still.shift();
    const steady = sim.still.length === 15 && sim.still.every((p) => dist(p, sim.ws) < 0.015);
    w = { x: w.x, y: w.y, sx: sim.ws.x, sy: sim.ws.y };
    if (sim.grip === 'open' && steady && Math.abs(w.sx - S.grasp.x) < 0.025 && Math.abs(w.sy - S.grasp.y) < 0.03) { sim.grip = 'closing'; sim.gripT = 0; sim.events.push({ t: sim.tick * DT, kind: 'grasp' }); }
    else if (sim.grip === 'closing' && (sim.gripT += DT) >= 0.2) sim.grip = 'hold';
    else if (sim.grip === 'hold') {
      const bottom = w.sy - S.hang - S.cup.h;
      if (steady && w.sx >= S.placeX[0] && w.sx <= S.placeX[1] && bottom >= S.shelf.y - 0.004 && bottom <= S.shelf.y + 0.035) { sim.grip = 'opening'; sim.gripT = 0; sim.events.push({ t: sim.tick * DT, kind: 'release' }); }
    } else if (sim.grip === 'opening' && (sim.gripT += DT) >= 0.2) { sim.grip = 'done'; sim.cup = { x: w.x, y: S.shelf.y, held: false, onShelf: true }; sim.done = true; }
    if (sim.grip === 'hold' || sim.grip === 'opening') sim.cup = { x: w.x, y: w.y - S.hang - S.cup.h, held: true, onShelf: false };
    if (sim.grip === 'closing') sim.cup = { x: S.cup.x, y: S.table.y, held: false, onShelf: false };
    // 5. запись: время, наблюдение (углы и кисть Ады), действие (команда оператора без задержки — так ALOHA пишет позы ведущей руки)
    if (sim.started) sim.rec.push({ t: (sim.tick - sim.t0) * DT, q: sim.q.slice(), w: { x: w.x, y: w.y }, a: { x: sim.cmdTarget.x, y: sim.cmdTarget.y }, g: sim.grip, prev });
    if (sim.started && (sim.tick - sim.t0) * DT >= TMAX) { sim.done = true; sim.timeout = true; }
    return sim;
  }
  const KEY_V = 0.15, TMAX = 60;
  const SGW = [-21, 14, 39, 54, 59, 54, 39, 14, -21];   // квадратичное сглаживание по 9 точкам, сумма 231                     // клавиши: 15 см/с; запись обрывается через 60 с

  /* ---------- показатели качества записи ---------- */
  function metrics(sim) {
    const R = sim.rec, n = R.length;
    if (!n) return { ok: false, T: 0, path: 0, extra: 0, pauses: 0, jitter: 0, bumps: 0, n: 0, speed: [] };
    // путь считаем по сглаженной траектории кисти: лишний путь — это крюки и перелёты, а не дрожь
    const sg = (arr, i, key) => { let x = 0, y = 0; for (let j = -4; j <= 4; j++) { const p = arr[Math.max(0, Math.min(n - 1, i + j))][key]; x += SGW[j + 4] * p.x; y += SGW[j + 4] * p.y; } return { x: x / 231, y: y / 231 }; };
    let path = 0, last = R[0].prev; const speed = [];
    for (let i = 0; i < n; i++) { const p = sg(R, i, 'w'); path += dist(p, last); last = p; speed.push((i ? dist(R[i].w, R[i - 1].w) : dist(R[0].w, R[0].prev)) / DT); }
    // паузы: участки не короче 0,2 с, где кисть быстрее 2 см/с не движется; ожидание у чашки и на полке (0,3 с + 0,2 с сжатия) не считаем
    const busy = new Array(n).fill(false);
    for (const e of sim.events) { if (e.kind === 'bump') continue; const i1 = Math.round((e.t - sim.t0 * DT) / DT); for (let i = Math.max(0, i1 - 16); i <= Math.min(n - 1, i1 + 10); i++) busy[i] = true; }
    let pauses = 0, run = 0;
    const flush = () => { if (run >= 10) pauses += run * DT; run = 0; };
    for (let i = 0; i < n; i++) { if (speed[i] < 0.02 && !busy[i]) run++; else flush(); }
    flush();
    // дрожь действий: СКО отклонения записанной команды от сглаженной (фильтр Савицкого — Голея, 9 тактов), мм
    let s2 = 0, m = 0;
    for (let i = 4; i < n - 4; i++) { const p = sg(R, i, 'a'); s2 += (R[i].a.x - p.x) ** 2 + (R[i].a.y - p.y) ** 2; m++; }
    const ref = dist(R[0].prev, S.grasp) + dist(S.grasp, S.corner) + dist(S.corner, S.place);
    return { ok: sim.grip === 'done', timeout: sim.timeout, T: n * DT, path, ref, extra: Math.max(0, path / ref - 1), pauses, jitter: m ? Math.sqrt(s2 / m) * 1000 : 0, bumps: sim.bumps, n, speed, mode: sim.mode, delay: sim.delay, noise: sim.mode === 'air' ? sim.noise : 0 };
  }

  /* ---------- модель оператора: смотрит на руку Ады, двигает руку и ждёт ---------- */
  /** Подцели: над чашкой → к чашке; после захвата — за угол полки → на полку. */
  function goalOf(sim, w) {
    const held = sim.grip === 'hold' || sim.grip === 'closing';
    if (!held) return Math.abs(w.x - S.grasp.x) < 0.05 && w.y < S.grasp.y + 0.1 ? S.grasp : { x: S.grasp.x, y: S.grasp.y + 0.09 };
    const lift = { x: S.corner.x - 0.05, y: S.place.y + 0.035 };
    if (w.x < S.shelf.x0 && w.y < lift.y - 0.015) return lift;                       // сначала поднять чашку выше полки
    return w.x < S.shelf.x0 + 0.04 ? { x: S.place.x, y: lift.y } : S.place;
  }
  /** Оператор на один такт: возвращает ввод. o — память оператора. Константы — иллюстрация, не измерения. */
  function operator(sim, o) {
    const w = wristOf(sim.q), g = goalOf(sim, w), e = { x: g.x - w.x, y: g.y - w.y }, eN = Math.hypot(e.x, e.y);
    if (sim.grip === 'closing' || sim.grip === 'opening' || sim.done) { setDir(sim, { x: 0, y: 0 }); return; }
    if (sim.mode === 'keys') {
      // жмёт клавишу по оси с большей ошибкой столько, сколько, по его оценке, нужно; потом отпускает и ждёт, пока рука остановится
      if (o.press > 0) { o.press--; return; }
      setDir(sim, { x: 0, y: 0 });
      if (o.wait > 0) { o.wait--; return; }
      const moving = sim.rec.length > 2 && dist(sim.rec[sim.rec.length - 1].w, sim.rec[sim.rec.length - 2].w) / DT > 0.01;
      if (moving) return;
      const ax = Math.abs(e.x) > Math.abs(e.y) ? 'x' : 'y', err = e[ax];
      if (Math.abs(err) < 0.008) return;
      const est = Math.abs(err) / KEY_V * (0.85 + 0.3 * sim.rng());                 // оценка длительности нажатия с ошибкой ±15%
      o.press = Math.max(1, Math.round(est / DT)); setDir(sim, ax === 'x' ? { x: Math.sign(err), y: 0 } : { x: 0, y: Math.sign(err) });
      o.wait = 8; return;
    }
    // рука (ведущая или в воздухе): ведёт к цели по тому, что видит; если рука Ады отстала от руки оператора больше чем на 3,5 см — ждёт
    const lag = dist(sim.hand, w);
    if (lag > 0.035) {                                                             // рука отстала — ждёт; если ждёт дольше 0,6 с, подтягивает пульт к руке
      if ((o.stall = (o.stall || 0) + 1) > 30) setHand(sim, { x: sim.hand.x + (w.x - sim.hand.x) * 0.1, y: sim.hand.y + (w.y - sim.hand.y) * 0.1 });
      return;
    }
    o.stall = 0;
    const v = Math.min(0.35, 3 * eN), k = eN > 1e-6 ? v / eN : 0;
    setHand(sim, { x: sim.hand.x + e.x * k * DT, y: sim.hand.y + e.y * k * DT });
  }
  /** Прогон записи с моделью оператора от начала до конца. */
  function runAuto(opts) {
    const sim = create(opts), o = { press: 0, wait: 0 };
    sim.hand = Object.assign({}, S.start);
    for (let i = 0; i < (TMAX + 5) / DT && !sim.done; i++) { operator(sim, o); step(sim); }
    return { sim, m: metrics(sim) };
  }

  /* =====================================================================
     2. Цена демонстрации и срок сбора. Цены и темпы — из статей (см. досье),
     ставка оператора, 8 часов в день и срок службы комплекта — иллюстрация.
     ===================================================================== */
  const METHODS = [
    // price — комплект, $; rate — демонстраций в час работы одного человека; valid — доля годных
    { id: 'aloha', name: 'ALOHA', note: 'телеоперация, робот в комплекте', price: 20000, rate: 50 / 0.75, valid: 1, robot: true },
    { id: 'gello', name: 'GELLO и рука UR5', note: 'ведущая рука $300 и робот около $30 000', price: 30300, rate: 50 / 0.75, valid: 1, robot: true },
    { id: 'umi', name: 'UMI', note: 'ручной захват, робот не нужен', price: 371, rate: 1400 / 12, valid: 0.9, robot: false },
  ];
  const HOURS_DAY = 8, LIFE_H = 2000;              // иллюстрация: 8 часов в день, комплект служит 2000 часов (год)
  /** Расчёт по способу: комплектов, годных демонстраций в день, дней до цели, цена годной демонстрации и её состав. */
  function costCalc(o) {
    const goal = o.goal || 10000;
    return METHODS.map((m) => {
      const kits = Math.max(0, Math.min(o.people, Math.floor(o.budget / m.price)));
      const perDay = kits * m.rate * m.valid * HOURS_DAY;
      const equip = m.price / LIFE_H, people = o.wage;                       // $ за час работы комплекта и человека
      const perDemo = (equip + people) / (m.rate * m.valid);
      return Object.assign({}, m, { kits, perDay, days: perDay > 0 ? goal / perDay : Infinity, perDemo, equipShare: equip / (equip + people), equipH: equip });
    });
  }

  const API = { DT, S, Q0, REACH, KEY_V, TMAX, ikNear, wristOf, clampR, create, setHand, setDir, step, metrics, operator, runAuto, goalOf, dist, METHODS, HOURS_DAY, LIFE_H, costCalc };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L42 = API;
})(typeof window !== 'undefined' ? window : globalThis);
