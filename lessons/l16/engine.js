/* =====================================================================
   l16/engine.js — движок урока 1.6 «Трансформер». Без DOM: работает
   в браузере и в Node (tools/lesson16.js проверяет пороги миссий).
     Scene — шесть предметов на столе Ады: места, цвета, ключи трёх голов.
     Att   — внимание: q·k, деление на √d_k, softmax, смесь значений.
             Для d_k > 2 к двум видимым компонентам добавляются скрытые
             случайные компоненты с дисперсией 1 (зерно фиксировано).
     Mask  — маска 6 × 6 для токенов π0 и критерии миссии.
     Pos   — синусоидальные позиции, их сходство, команда из четырёх слов.
     Cost  — сколько токенов и FLOPs у политики, пресеты RT-1, ACT, Octo, π0.
     Pi0   — время вывода π0 по блокам и лента тиков 50 Гц.
   Всё считается вручную, без обучения: веса и ключи заданы.
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const rad = (d) => d * Math.PI / 180;
  function softmax(s) {
    let m = -Infinity; for (const v of s) if (v > m) m = v;
    if (m === -Infinity) return s.map(() => 0);
    const e = s.map((v) => (v === -Infinity ? 0 : Math.exp(v - m))), t = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / t);
  }

  /* =====================================================================
     Scene. Стол 1 × 1 м, вид сверху: x — вправо, y — к Аде (вниз на экране).
     У предмета два признака: цвет (красный, синий, белый) и место
     (у переднего края, в середине, в глубине стола). Пары подобраны так,
     что цвет и место вместе однозначно называют предмет, а по отдельности — нет.
     Ключ общей головы = цвет + 0,7 · место (направления — углы ниже).
     Голова «цвет» видит только цвет, голова «место» — только место.
     Значение предмета — его место на столе, поэтому ответ внимания — точка.
     ===================================================================== */
  const COLOR_ANG = { red: 0, blue: 120, white: 240 }, ZONE_ANG = { front: 60, mid: 180, back: 300 };
  const ITEMS = [
    { id: 'cup', name: 'чашка', acc: 'чашку', gen: 'чашки', kind: 'cup', x: 0.30, y: 0.84, r: 0.058, col: [0.86, 0.16, 0.14], color: 'red', zone: 'front' },
    { id: 'kettle', name: 'чайник', acc: 'чайник', gen: 'чайника', kind: 'kettle', x: 0.24, y: 0.20, r: 0.08, col: [0.78, 0.17, 0.15], color: 'red', zone: 'back' },
    { id: 'bowl', name: 'миска', acc: 'миску', gen: 'миски', kind: 'bowl', x: 0.74, y: 0.84, r: 0.07, col: [0.22, 0.42, 0.86], color: 'blue', zone: 'front' },
    { id: 'sugar', name: 'сахарница', acc: 'сахарницу', gen: 'сахарницы', kind: 'sugar', x: 0.52, y: 0.50, r: 0.058, col: [0.25, 0.45, 0.84], color: 'blue', zone: 'mid' },
    { id: 'milk', name: 'молочник', acc: 'молочник', gen: 'молочника', kind: 'milk', x: 0.84, y: 0.52, r: 0.058, col: [0.95, 0.95, 0.92], color: 'white', zone: 'mid' },
    { id: 'napkins', name: 'салфетница', acc: 'салфетницу', gen: 'салфетницы', kind: 'napkins', x: 0.70, y: 0.18, r: 0.058, col: [0.97, 0.97, 0.95], color: 'white', zone: 'back' },
  ];
  const N = ITEMS.length;
  const unit = (deg, L) => [L * Math.cos(rad(deg)), L * Math.sin(rad(deg))];
  const KEYS = {
    gen: ITEMS.map((it) => { const c = unit(COLOR_ANG[it.color], 1), z = unit(ZONE_ANG[it.zone], 0.7); return [c[0] + z[0], c[1] + z[1]]; }),
    color: ITEMS.map((it) => unit(COLOR_ANG[it.color], 1.4)),
    place: ITEMS.map((it) => unit(ZONE_ANG[it.zone], 1.4)),
  };
  const QMAX = 3;          // наибольшая длина запроса
  const DKS = [2, 4, 8, 16, 32, 64, 128, 256];
  const SEEDS = { gen: 169, color: 170, place: 171 };
  const M = { cupW: 0.5, gapR: 0.15, gapMaxW: 0.6, dk: 256, peakW: 0.9, pairW: 0.8, soloW: 0.3 };

  /* Скрытые компоненты: 254 числа у запроса и у каждого ключа, N(0, 1). */
  const HID = {};
  function hidden(head) {
    if (HID[head]) return HID[head];
    const r = rng(SEEDS[head]), q = [], k = [];
    for (let j = 0; j < 254; j++) q.push(randn(r));
    for (let i = 0; i < N; i++) { const row = []; for (let j = 0; j < 254; j++) row.push(randn(r)); k.push(row); }
    return (HID[head] = { q, k });
  }
  /** Скрытая часть q·k для каждого предмета при данном d_k. */
  function hiddenDot(head, dk) {
    const H = hidden(head), out = new Array(N).fill(0);
    for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < dk - 2; j++) s += H.q[j] * H.k[i][j]; out[i] = s; }
    return out;
  }
  /** Внимание одного запроса к шести предметам.
   *  o: { head, q:[x,y], keys?, dk, div, open?: [bool × 6] } → { vis, hid, scores, w, out:{x,y} } */
  function attend(o) {
    const keys = o.keys || KEYS[o.head], dk = o.dk || 2, sc = o.div ? Math.sqrt(dk) : 1;
    const vis = keys.map((k) => k[0] * o.q[0] + k[1] * o.q[1]);
    const hid = dk > 2 ? hiddenDot(o.head, dk) : new Array(N).fill(0);
    const scores = vis.map((v, i) => (v + hid[i]) / sc);
    const masked = scores.map((v, i) => (o.open && !o.open[i] ? -Infinity : v));
    const w = softmax(masked);
    let x = 0, y = 0; w.forEach((wi, i) => { x += wi * ITEMS[i].x; y += wi * ITEMS[i].y; });
    return { vis, hid, scores, w, out: { x, y } };
  }
  const dist = (p, it) => Math.hypot(p.x - it.x, p.y - it.y);
  function nearest(p) { let best = 0, d = Infinity; ITEMS.forEach((it, i) => { const v = dist(p, it); if (v < d) { d = v; best = i; } }); return { i: best, d }; }
  /** Проверки миссий лаборатории (их же зовут тесты). */
  const Check = {
    m1: (w) => w[0] > M.cupW,
    m2gap: (out) => nearest(out).d > M.gapR,
    m2spread: (w) => Math.max(...w) <= M.gapMaxW,
    m3dk: (dk) => dk === M.dk,
    m3peak: (w) => Math.max(...w) < M.peakW,
    m5color: (w) => w[0] + w[1] > M.pairW,               // красные: чашка и чайник
    m5place: (w) => w[0] + w[2] > M.pairW,               // у края: чашка и миска
    m5solo: (wc, wp) => wc[0] > M.soloW && wp[0] > M.soloW && ITEMS.every((it, i) => i === 0 || !(wc[i] > M.soloW && wp[i] > M.soloW)),
  };

  /* =====================================================================
     Mask. Шесть токенов в порядке π0: [кадр, кадр, команда] [состояние]
     [действие, действие]. open[i][j] — токен i (строка) видит токен j.
     ===================================================================== */
  const TOK = [
    { s: 'К1', name: 'кадр камеры 1', b: 0 }, { s: 'К2', name: 'кадр камеры 2', b: 0 }, { s: 'Т', name: 'команда', b: 0 },
    { s: 'С', name: 'состояние', b: 1 }, { s: 'Д1', name: 'действие 1', b: 2 }, { s: 'Д2', name: 'действие 2', b: 2 },
  ];
  const Mask = {
    TOK,
    full: () => TOK.map(() => TOK.map(() => true)),
    causal: () => TOK.map((_, i) => TOK.map((__, j) => j <= i)),
    block: () => TOK.map((a) => TOK.map((b) => b.b <= a.b)),
    /** Критерии миссии 4: [действия видят всё, первый блок в обе стороны, первый блок не видит будущее, состояние]. */
    crit(o) {
      const all = (rows, cols, v) => rows.every((i) => cols.every((j) => o[i][j] === v));
      return [
        all([4, 5], [0, 1, 2, 3, 4, 5], true),
        all([0, 1, 2], [0, 1, 2], true),
        all([0, 1, 2], [3, 4, 5], false),
        all([3], [0, 1, 2, 3], true) && all([3], [4, 5], false),
      ];
    },
    /** Зависит ли префикс (К1, К2, Т) от состояния или действий. */
    prefixDeps(o) { const d = []; [0, 1, 2].forEach((i) => [3, 4, 5].forEach((j) => { if (o[i][j]) d.push([i, j]); })); return d; },
    same(a, b) { return a.every((r, i) => r.every((v, j) => v === b[i][j])); },
  };

  /* =====================================================================
     Pos. Синусоидальные кодировки из статьи 2017 года:
     PE(pos, 2i) = sin(pos / 10000^(2i/d)), PE(pos, 2i+1) = cos(…).
     Команда из четырёх слов. Токен слова — 4 признака содержания
     (одно на слово) и 16 чисел позиции; позиции можно выключить.
     Запрос токена действия: «какой предмет взять первым?». Он любит
     предметы (чашку чуть больше, так вышло при «обучении») и начало
     команды. Ответ — предмет с большим весом внимания.
     ===================================================================== */
  const DPE = 16;
  function pe(pos, d) { d = d || DPE; const v = new Array(d); for (let i = 0; i < d / 2; i++) { const w = Math.pow(10000, -2 * i / d); v[2 * i] = Math.sin(pos * w); v[2 * i + 1] = Math.cos(pos * w); } return v; }
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  /** Косинусное сходство кодировок двух позиций. */
  function peSim(i, j, d) { const a = pe(i, d), b = pe(j, d); return dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b)); }
  const WORDS = [{ id: 'take', w: 'возьми' }, { id: 'cup', w: 'чашку' }, { id: 'then', w: 'потом' }, { id: 'bowl', w: 'миску' }];
  const WQ = { content: { take: 0, cup: 2.1, then: 0, bowl: 2.0 }, pos: 8 / DPE * 1.0 };
  /** order — массив id слов по порядку. usePE — добавлены ли позиции. */
  function command(order, usePE) {
    const pe0 = pe(0);
    const logits = order.map((id, p) => WQ.content[id] + (usePE ? WQ.pos * dot(pe0, pe(p)) : 0));
    const w = softmax(logits);
    // выход внимания: смесь векторов слов (4 признака содержания + 16 чисел позиции)
    const out = new Array(4 + DPE).fill(0);
    order.forEach((id, p) => {
      const k = WORDS.findIndex((x) => x.id === id); out[k] += w[p];
      if (usePE) pe(p).forEach((v, j) => { out[4 + j] += w[p] * v; });
    });
    const wc = w[order.indexOf('cup')], wb = w[order.indexOf('bowl')];
    const answer = wc >= wb ? 'cup' : 'bowl';
    const truth = order.indexOf('cup') < order.indexOf('bowl') ? 'cup' : 'bowl';
    return { w, out, answer, truth, ok: answer === truth, wc, wb };
  }
  const sameOut = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  function perms(a) { if (a.length < 2) return [a.slice()]; const r = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach((p) => r.push([x].concat(p)))); return r; }
  const Pos = { DPE, pe, peSim, WORDS, command, sameOut, perms };

  /* =====================================================================
     Cost. Длина последовательности n и грубая стоимость слоя:
       член внимания (QKᵀ и смесь V) ≈ 4·n²·d FLOPs,
       проекции Q, K, V, O и FFN шириной 4d ≈ 24·n·d² FLOPs,
       KV-кэш префикса: 2 · L · d_kv · T чисел по 2 байта (bf16).
     По умолчанию модель размером с π0: Gemma 2B, d_model 2048, 18 слоёв,
     одна KV-голова с d_head 256, поэтому d_kv = 256.
     ===================================================================== */
  const RES = [
    { id: '224', w: 224, h: 224, label: '224 px' }, { id: '256', w: 256, h: 256, label: '256 px' }, { id: '300', w: 300, h: 300, label: '300 px' },
    { id: '384', w: 384, h: 384, label: '384 px' }, { id: '448', w: 448, h: 448, label: '448 px' }, { id: '480', w: 640, h: 480, label: '480 × 640' },
    { id: '896', w: 896, h: 896, label: '896 px' },
  ];
  const CUT = [
    { id: 'p14', patch: 14, label: 'патч 14' }, { id: 'p16', patch: 16, label: 'патч 16' }, { id: 'p32', patch: 32, label: 'патч или шаг 32' },
    { id: 'g64', fixed: 64, label: 'до 64 на кадр' }, { id: 'tl8', fixed: 8, label: 'до 8 на кадр' },
  ];
  const resOf = (id) => RES.find((r) => r.id === id), cutOf = (id) => CUT.find((c) => c.id === id);
  function perImage(resId, cutId) { const r = resOf(resId), c = cutOf(cutId); return c.fixed || Math.floor(r.w / c.patch) * Math.floor(r.h / c.patch); }
  const PRESETS = {
    rt1: { name: 'RT-1', images: 6, res: '300', cut: 'tl8', chunk: 0, other: [], note: 'одна камера, 6 кадров истории; свёрточная сеть даёт 81 токен на кадр, TokenLearner оставляет 8', imgLabel: 'кадров' },
    act: { name: 'ACT', images: 4, res: '480', cut: 'p32', chunk: 0, other: [['суставы', 1], ['стиль z', 1]], note: '4 камеры 480 × 640, ResNet18 с шагом 32 даёт 15 × 20 = 300 токенов на камеру; 100 запросов действий — в отдельном декодере', imgLabel: 'камеры' },
    octo: { name: 'Octo', images: 2, res: '256', cut: 'p16', chunk: 0, other: [['камера на запястье, 2 × 64', 128], ['команда (T5)', 16]], note: 'основная камера 256 px, 2 кадра; readout-токены не считаем', imgLabel: 'кадра основной камеры' },
    pi0: { name: 'π0', images: 3, res: '224', cut: 'p14', chunk: 50, other: [['команда', 48], ['состояние', 1, 'suffix']], note: '3 камеры по 256 токенов, команда до 48 токенов, состояние — 1 токен, 50 токенов действий', imgLabel: 'камеры' },
  };
  const MODEL0 = { d: 2048, L: 18, dkv: 256 };
  /** cfg: { images, res, cut, chunk, other:[[label, n, 'suffix'?]], d, L }.
   *  В префикс (его K и V кэшируются) входят картинки и прочие токены,
   *  кроме помеченных 'suffix': у π0 состояние считается вместе с действиями. */
  function cost(cfg) {
    const per = perImage(cfg.res, cfg.cut), img = cfg.images * per;
    const oth = (cfg.other || []).reduce((s, o) => s + o[1], 0);
    const n = img + oth + cfg.chunk, d = cfg.d, L = cfg.L;
    const attn = 4 * n * n * d * L, proj = 24 * n * d * d * L;
    const suffix = (cfg.other || []).reduce((t, o) => t + (o[2] === 'suffix' ? o[1] : 0), 0);
    const prefix = n - cfg.chunk - suffix, kvBytes = 2 * L * (cfg.dkv || MODEL0.dkv) * prefix * 2;
    return { per, img, oth, n, attn, proj, share: attn / (attn + proj), prefix, kvBytes };
  }
  const presetCfg = (k, model) => Object.assign({}, PRESETS[k], model || MODEL0, { other: PRESETS[k].other.slice() });
  const Cost = { RES, CUT, PRESETS, MODEL0, perImage, cost, presetCfg };

  /* =====================================================================
     Pi0. Вывод π0 на RTX 4090 с тремя камерами: энкодеры картинок 14 мс,
     проход по наблюдению 32 мс (K и V префикса в кэш), 10 шагов flow
     matching 27 мс. Вне робота — плюс 13 мс сети. Без кэша каждый шаг
     flow заново проходит наблюдение: это наша оценка по той же схеме.
     Управление 50 Гц: пачка из 50 действий, исполняют 25, перезапуск
     каждые 0,5 с.
     ===================================================================== */
  const PI0 = { enc: 14, obs: 32, flow: 27, steps: 10, net: 13, hz: 50, chunk: 50, exec: 25 };
  function pi0Time(o) {
    o = o || {};
    const flow = o.noCache ? PI0.steps * (PI0.obs + PI0.flow / PI0.steps) : PI0.flow;
    const obs = o.noCache ? 0 : PI0.obs;
    const net = o.remote ? PI0.net : 0;
    return { enc: PI0.enc, obs, flow, net, total: PI0.enc + obs + flow + net, firstFlow: PI0.enc + (o.noCache ? 0 : PI0.obs) };
  }
  const Pi0 = { PI0, time: pi0Time, tickMs: 1000 / PI0.hz };

  const API = { rng, randn, softmax, ITEMS, KEYS, QMAX, DKS, M, SEEDS, hidden, hiddenDot, attend, nearest, Check, Mask, Pos, Cost, Pi0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.T16 = API;
})(typeof window !== 'undefined' ? window : globalThis);
