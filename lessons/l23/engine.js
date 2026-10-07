/* =====================================================================
   l23/engine.js — движок урока 2.3 «LLM-планировщики и VoxPoser». Без DOM:
   работает в браузере и в Node (для подбора чисел и тестов).
   1) Кухня Ады для SayCan и Inner Monologue: 11 навыков, состояние кухни,
      аффордансы — правила от состояния, оценки языковой модели заданы
      заранее (иллюстрация, а не ответы настоящей модели). Три планировщика:
      только языковая модель, только аффорданс, SayCan; обратная связь
      словами — детектор успеха, который может ошибаться.
   2) Code as Policies: две программы, «написанные» моделью заранее, и
      интерпретатор по строкам — генератор событий «строка», «вызов функции
      робота», «модель дописывает функцию». Функции восприятия и управления
      работают на маленьком столе по-настоящему.
   3) VoxPoser в миниатюре: срез карты 60 × 40 клеток вид сверху, карта
      аффорданса (притяжение к ручке, евклидово расстояние), карта избегания
      (диск вокруг вазы и гауссово сглаживание), стоимость
      c = −w_a·A + w_o·O и поиск пути с наименьшей суммарной стоимостью.
   ===================================================================== */
'use strict';
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =================================================================
     1. Кухня: навыки, состояние, аффордансы, оценки языковой модели
     ================================================================= */
  const SKILLS = [
    { id: 'open', text: 'открыть шкаф', at: 'cupboard' },
    { id: 'cup', text: 'взять чашку из шкафа', at: 'cupboard' },
    { id: 'place', text: 'поставить чашку под кофемашину', at: 'machine' },
    { id: 'brew', text: 'сварить кофе', at: 'machine' },
    { id: 'milk', text: 'взять молоко', at: 'fridge' },
    { id: 'oat', text: 'взять овсяное молоко', at: 'fridge' },
    { id: 'pour', text: 'налить молоко в чашку', at: 'machine' },
    { id: 'bring', text: 'принести чашку тебе', at: 'table' },
    { id: 'kettle', text: 'вскипятить чайник', at: 'kettle' },
    { id: 'sugar', text: 'взять сахар', at: 'sugar' },
    { id: 'done', text: 'готово', at: null },
  ];
  const SI = Object.fromEntries(SKILLS.map((s, i) => [s.id, i]));
  const INSTRUCTION = 'Ада, сделай мне кофе с молоком.';
  /** Рецепт, который языковая модель знает из текстов: порядок шагов. «Открыть шкаф» в рецептах редкость. */
  const RECIPE = ['cup', 'place', 'brew', 'milk', 'pour', 'bring', 'done'];
  const RIDX = { cup: 0, place: 1, brew: 2, milk: 3, oat: 3, pour: 4, bring: 5, done: 6 };
  /** Веса языковой модели для следующего шага рецепта k (до нормировки). Иллюстрация, а не ответы настоящей модели. */
  const LLM_W = [
    //        open cup  place brew milk oat  pour bring kettle sugar done
    /* k=0 */ [2.2, 10, 0.3, 3.2, 1.2, 0.3, 0.2, 0.3, 0.8, 0.6, 0.05],
    /* k=1 */ [0.4, 0.4, 10, 2.5, 1.0, 0.2, 0.3, 0.6, 0.4, 0.5, 0.1],
    /* k=2 */ [0.2, 0.3, 0.4, 10, 1.5, 0.3, 0.6, 0.8, 0.4, 0.6, 0.1],
    /* k=3 */ [0.2, 0.2, 0.2, 0.4, 10, 2.4, 1.0, 1.8, 0.2, 1.0, 0.3],
    /* k=4 */ [0.1, 0.1, 0.2, 0.3, 0.3, 0.2, 10, 1.2, 0.1, 0.3, 0.2],
    /* k=5 */ [0.1, 0.1, 0.1, 0.2, 0.2, 0.1, 0.3, 10, 0.1, 0.2, 1.0],
    /* k=6 */ [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.05, 0.1, 10],
  ];

  /** Кухня в начале: шкаф закрыт, чашка в шкафу, молоко есть. o — отличия от умолчаний. */
  function world(o) {
    o = o || {};
    return {
      cupboard: o.cupboard || 'closed',          // 'closed' | 'open'
      cup: o.cup || 'cupboard',                  // 'cupboard' | 'hand' | 'machine' | 'user'
      coffee: false, milkIn: null,               // кофе в чашке; какое молоко налито: null | 'milk' | 'oat'
      milkLeft: o.milk !== false, held: [],      // есть ли молоко; что Ада держит: 'milk', 'oat', 'sugar'
      kettle: false, spill: null,                // вскипел ли чайник; что пролилось
      slips: o.slips || 0,                       // сколько раз чашка выскользнет при попытке взять
      ended: false,
    };
  }
  const copyW = (w) => Object.assign({}, w, { held: w.held.slice() });
  const holds = (w, x) => w.held.includes(x);
  /** Аффорданс: вероятность, что навык удастся из этого состояния. У нас — правила; в SayCan — обученные функции ценности. */
  function affordance(w, id) {
    switch (id) {
      case 'open': return w.cupboard === 'closed' ? 0.92 : 0;
      case 'cup': if (w.cup === 'hand') return 0; if (w.cupboard === 'closed') return 0.04; return w.cup === 'cupboard' ? 0.88 : 0.03;
      case 'place': return w.cup === 'hand' ? 0.95 : w.cup === 'machine' ? 0 : 0.03;
      case 'brew': return w.cup === 'machine' ? (w.coffee ? 0 : 0.85) : 0.05;
      case 'milk': return holds(w, 'milk') ? 0 : w.milkLeft ? 0.86 : 0.02;
      case 'oat': return holds(w, 'oat') ? 0 : 0.84;
      case 'pour': return w.milkIn ? 0 : (holds(w, 'milk') || holds(w, 'oat')) && w.cup === 'machine' ? 0.9 : 0.04;
      case 'bring': return w.cup === 'user' ? 0 : w.cup === 'machine' || w.cup === 'hand' ? 0.9 : 0.03;
      case 'kettle': return w.kettle ? 0 : 0.95;
      case 'sugar': return holds(w, 'sugar') ? 0 : 0.9;
      case 'done': return 0.1;
    }
    return 0;
  }
  /** Выполнить навык: новое состояние, удалось ли и почему нет. */
  function execute(w0, id) {
    const w = copyW(w0); let ok = true, why = '';
    const fail = (t) => { ok = false; why = t; };
    switch (id) {
      case 'open': if (w.cupboard === 'open') fail('шкаф уже открыт'); else w.cupboard = 'open'; break;
      case 'cup':
        if (w.cup === 'hand') fail('чашка уже в захвате');
        else if (w.cupboard === 'closed') fail('шкаф закрыт');
        else if (w.cup !== 'cupboard') fail('в шкафу нет чашки');
        else if (w.slips > 0) { w.slips--; fail('чашка выскользнула из захвата'); }
        else w.cup = 'hand';
        break;
      case 'place': if (w.cup === 'hand') w.cup = 'machine'; else fail(w.cup === 'machine' ? 'чашка уже под кофемашиной' : 'в захвате нет чашки'); break;
      case 'brew':
        if (w.coffee) fail('кофе уже сварен');
        else if (w.cup !== 'machine') { w.spill = 'coffee'; fail('кофе пролился: под кофемашиной нет чашки'); }
        else w.coffee = true;
        break;
      case 'milk': if (holds(w, 'milk')) fail('молоко уже в руке'); else if (!w.milkLeft) fail('молока в холодильнике нет'); else w.held.push('milk'); break;
      case 'oat': if (holds(w, 'oat')) fail('овсяное молоко уже в руке'); else w.held.push('oat'); break;
      case 'pour': {
        const m = holds(w, 'milk') ? 'milk' : holds(w, 'oat') ? 'oat' : null;
        if (w.milkIn) fail('молоко уже налито');
        else if (!m) fail('в руке нет молока');
        else if (w.cup !== 'machine') { w.spill = 'milk'; fail('молоко пролилось: чашки под кофемашиной нет'); }
        else w.milkIn = m;
        break;
      }
      case 'bring': if (w.cup === 'machine' || w.cup === 'hand') w.cup = 'user'; else fail(w.cup === 'user' ? 'чашка уже у тебя' : 'чашки нет ни в захвате, ни под кофемашиной'); break;
      case 'kettle': if (w.kettle) fail('чайник уже вскипел'); else w.kettle = true; break;
      case 'sugar': if (holds(w, 'sugar')) fail('сахар уже в руке'); else w.held.push('sugar'); break;
      case 'done': w.ended = true; break;
    }
    return { w, ok, why };
  }
  /** Выполнена ли просьба: кофе с молоком у человека. */
  const success = (w) => w.cup === 'user' && w.coffee && !!w.milkIn;
  /** Что не так с результатом — для подписи. */
  function verdict(w) {
    if (success(w)) return { ok: true, text: w.milkIn === 'oat' ? 'кофе с овсяным молоком у тебя' : 'кофе с молоком у тебя' };
    if (w.cup === 'user' && !w.coffee) return { ok: false, text: 'Ада принесла пустую чашку' };
    if (w.cup === 'user' && !w.milkIn) return { ok: false, text: 'кофе без молока' };
    if (!w.coffee) return { ok: false, text: 'кофе не сварен' };
    if (!w.milkIn) return { ok: false, text: 'молоко не налито' };
    return { ok: false, text: 'чашка не у тебя' };
  }

  /** Оценки языковой модели по истории. history: [{id, fb}] — fb: true/false — что сказал детектор успеха, undefined — обратной связи нет.
   *  Модель считает выполненным каждый шаг из истории, если детектор не сказал «нет»; следующий шаг рецепта — после последнего выполненного.
   *  Сорвавшийся шаг модель предлагает повторить, а после двух неудач подряд бросает его и заканчивает. */
  function llmScores(history) {
    let k = 0; const doneIds = new Set(), fails = {};
    for (const hst of history) {
      if (hst.fb === false) { fails[hst.id] = (fails[hst.id] || 0) + 1; continue; }
      doneIds.add(hst.id);
      if (hst.id in RIDX) k = Math.max(k, RIDX[hst.id] + 1);
    }
    k = Math.min(k, LLM_W.length - 1);
    const giveUp = Object.values(fails).some((f) => f >= 2);
    const raw = LLM_W[k].map((v, i) => {
      const id = SKILLS[i].id;
      if (id === 'done') return giveUp ? v * 30 : v;
      if ((fails[id] || 0) >= 2) return v * 0.05;
      return doneIds.has(id) ? v * 0.1 : v;
    });
    const z = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / z);
  }
  const argmax = (a) => { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi; };

  /** Составить и выполнить план. mode: 'llm' | 'aff' | 'saycan'. o: { feedback: 'none' | 'success', liar: число ложных «да» детектора, maxSteps }.
   *  Каждый шаг: оценки обеих моделей, выбор, исполнение, что сказал детектор. */
  function plan(mode, w0, o) {
    o = o || {}; const maxSteps = o.maxSteps || 12, fbOn = o.feedback === 'success';
    let w = copyW(w0), liar = o.liar || 0; const history = [], steps = [];
    for (let n = 0; n < maxSteps; n++) {
      const llm = llmScores(history), aff = SKILLS.map((s) => affordance(w, s.id)), prod = llm.map((v, i) => v * aff[i]);
      const pick = mode === 'llm' ? argmax(llm) : mode === 'aff' ? argmax(aff) : argmax(prod);
      const id = SKILLS[pick].id, before = w, r = execute(w, id);
      let fb; if (fbOn && id !== 'done') { fb = r.ok; if (!r.ok && liar > 0) { liar--; fb = true; } }
      steps.push({ n: n + 1, id, text: SKILLS[pick].text, llm, aff, prod, pick, ok: r.ok, why: r.why, fb, lied: fbOn && fb === true && !r.ok, before, after: r.w });
      history.push({ id, fb });
      w = r.w;
      if (id === 'done') break;
    }
    const last = steps[steps.length - 1], finished = !!last && last.id === 'done';
    return { mode, steps, w, finished, success: success(w), verdict: verdict(w), failedSteps: steps.filter((s) => !s.ok && s.id !== 'done').length };
  }


  /* =================================================================
     2. Code as Policies: стол, функции робота и две программы
     ================================================================= */
  /** Стол сверху, координаты в метрах: x вправо 0…1, y вниз 0…0,6. */
  function capWorld(o) {
    o = o || {};
    const objs = [
      { name: 'жёлтая миска', kind: 'bowl', color: 'yellow', x: 0.26, y: 0.2 },
      { name: 'синяя миска', kind: 'bowl', color: 'blue', x: o.bowlFar ? 0.82 : 0.56, y: 0.2 },
      { name: 'лимон', kind: 'fruit', color: 'yellow', x: 0, y: 0 },
      { name: 'красный кубик', kind: 'block', color: 'red', x: 0.14, y: 0.4 },
      { name: 'зелёный кубик', kind: 'block', color: 'green', x: 0.42, y: 0.52 },
      { name: 'синий кубик', kind: 'block', color: 'blue', x: 0.72, y: 0.5 },
    ];
    const lemonIn = objs.find((q) => q.name === (o.lemon === 'blue' ? 'синяя миска' : 'жёлтая миска'));
    const lemon = objs.find((q) => q.name === 'лимон'); lemon.x = lemonIn.x + 0.012; lemon.y = lemonIn.y - 0.008;
    return { objs, slip: o.slip ? 0.02 : 0, stackOn: {} };
  }
  const objByName = (cw, n) => cw.objs.find((q) => q.name === n);
  const r3 = (v) => Math.round(v * 100) / 100;
  /** Функции робота. Каждый вызов попадает в журнал calls: { fn, args, ret, kind: 'percept' | 'control' }. */
  function capApi(cw, calls) {
    const log = (fn, args, ret, kind) => { calls.push({ fn, args, ret, kind }); return ret; };
    return {
      detect_objects(what) {
        const kind = { 'кубики': 'block', 'миски': 'bowl' }[what];
        const names = cw.objs.filter((q) => !kind || q.kind === kind).map((q) => q.name);
        return log('detect_objects', [what], names, 'percept');
      },
      get_pos(name) { const q = objByName(cw, name); return log('get_pos', [name], [r3(q.x), r3(q.y)], 'percept'); },
      /** Положить первый предмет на второй (предмет или точку). Сползание slip уменьшает сдвиг по x. */
      pick_place(a, b) {
        const qa = objByName(cw, a), from = [qa.x, qa.y];
        if (Array.isArray(b)) {
          const dx = b[0] - qa.x, s = cw.slip && dx > 0 ? Math.max(0, dx - cw.slip) : dx;
          qa.x = r3(qa.x + s); qa.y = r3(b[1]);
        } else {
          const qb = objByName(cw, b);
          qa.x = qb.x; qa.y = qb.y; cw.stackOn[a] = b;
        }
        log('pick_place', [a, Array.isArray(b) ? b.map(r3) : b], null, 'control'); calls[calls.length - 1].from = from;
        return null;
      },
    };
  }
  /** Тексты программ. Блоки появляются по мере того, как модель их «пишет». */
  const CAP_CODE = {
    stack: {
      command: 'поставь кубики стопкой в пустую миску',
      blocks: {
        main: [
          '# поставь кубики стопкой в пустую миску',
          'block_names = detect_objects("кубики")',
          'bowl_names = detect_objects("миски")',
          'for bowl_name in bowl_names:',
          '    if is_empty(bowl_name):',
          '        empty_bowl = bowl_name',
          '        break',
          'objs_to_stack = [empty_bowl] + block_names',
          'stack_objects(objs_to_stack)',
        ],
        is_empty: [
          'def is_empty(name):',
          '    bowl_pos = get_pos(name)',
          '    for obj in detect_objects("предметы"):',
          '        if obj != name and dist(get_pos(obj), bowl_pos) < 0.05:',
          '            return False',
          '    return True',
        ],
        dist: [
          'def dist(p, q):',
          '    return np.linalg.norm(np.array(p) - np.array(q))',
        ],
        stack_objects: [
          'def stack_objects(obj_names):',
          '    n_objs = len(obj_names)',
          '    for i in range(n_objs - 1):',
          '        obj0 = obj_names[i + 1]',
          '        obj1 = obj_names[i]',
          '        pick_place(obj0, obj1)',
        ],
      },
    },
    push: {
      command: 'пока красный кубик левее синей миски, двигай его вправо на 5 см',
      blocks: {
        main: [
          '# пока красный кубик левее синей миски, двигай его вправо на 5 см',
          'while get_pos("красный кубик")[0] < get_pos("синяя миска")[0]:',
          '    target_pos = get_pos("красный кубик") + [0.05, 0]',
          '    pick_place("красный кубик", target_pos)',
        ],
      },
    },
  };
  /** Интерпретатор программы по строкам. События после выполнения каждой строки:
   *  { t: 'line', b, l, note } — строка l блока b выполнена, note — короткий итог;
   *  { t: 'call', b, from, gen } — вызов функции b из строки from; gen — функции нет, модель пишет её сейчас;
   *  { t: 'ret', b, v } — выход из функции (не останавливает пошаговый режим).
   *  Вызовы функций робота — в calls, стек вызовов — в frames. */
  function* capRun(prog, cw, calls, frames) {
    const A = capApi(cw, calls), defined = {};
    const L = (b, l, note) => ({ t: 'line', b, l, note: note || '' });
    const q = (v) => (typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : String(v));
    const num = (v) => String(r3(v));
    function* enter(b, from) { const gen = !defined[b]; defined[b] = true; frames.push(b); yield { t: 'call', b, from, gen }; }
    function leave(b, v) { frames.pop(); return { t: 'ret', b, v }; }
    function* fDist(p, qq, from) {
      yield* enter('dist', from);
      const d = Math.hypot(p[0] - qq[0], p[1] - qq[1]);
      yield L('dist', 1, '→ ' + num(d));
      yield leave('dist', d); return d;
    }
    function* fIsEmpty(name, from) {
      yield* enter('is_empty', from);
      const bp = A.get_pos(name); yield L('is_empty', 1, 'bowl_pos = ' + q(bp));
      const all = A.detect_objects('предметы');
      for (let j = 0; j < all.length; j++) {
        const obj = all[j];
        yield L('is_empty', 2, 'obj = ' + q(obj));
        if (obj === name) { yield L('is_empty', 3, 'это сама миска — дальше'); continue; }
        const d = yield* fDist(A.get_pos(obj), bp, { b: 'is_empty', l: 3 });
        if (d < 0.05) { yield L('is_empty', 3, `dist = ${num(d)} < 0.05`); yield L('is_empty', 4, '→ False'); yield leave('is_empty', false); return false; }
        yield L('is_empty', 3, `dist = ${num(d)} — далеко`);
      }
      yield L('is_empty', 5, '→ True'); yield leave('is_empty', true); return true;
    }
    function* fStack(names, from) {
      yield* enter('stack_objects', from);
      const n = names.length; yield L('stack_objects', 1, 'n_objs = ' + n);
      for (let i = 0; i < n - 1; i++) {
        yield L('stack_objects', 2, 'i = ' + i);
        yield L('stack_objects', 3, 'obj0 = ' + q(names[i + 1]));
        yield L('stack_objects', 4, 'obj1 = ' + q(names[i]));
        A.pick_place(names[i + 1], names[i]); yield L('stack_objects', 5, `${names[i + 1]} → на ${names[i]}`);
      }
      yield leave('stack_objects', null);
    }
    frames.push('main');
    if (prog === 'stack') {
      const blocks = A.detect_objects('кубики'); yield L('main', 1, '→ ' + blocks.length + ' кубика');
      const bowls = A.detect_objects('миски'); yield L('main', 2, '→ ' + q(bowls));
      let empty = null;
      for (const bowl of bowls) {
        yield L('main', 3, 'bowl_name = ' + q(bowl));
        const e = yield* fIsEmpty(bowl, { b: 'main', l: 4 });
        yield L('main', 4, 'is_empty(' + q(bowl) + ') → ' + (e ? 'True' : 'False'));
        if (e) { empty = bowl; yield L('main', 5, 'empty_bowl = ' + q(bowl)); yield L('main', 6, 'выход из цикла'); break; }
      }
      const objs = [empty].concat(blocks); yield L('main', 7, '→ ' + objs.length + ' предмета');
      yield* fStack(objs, { b: 'main', l: 8 });
      yield L('main', 8, 'готово');
    } else {
      for (let it = 0; it < 60; it++) {
        const xr = A.get_pos('красный кубик')[0], xb = A.get_pos('синяя миска')[0];
        yield L('main', 1, `${num(xr)} < ${num(xb)} → ${xr < xb ? 'True' : 'False'}`);
        if (!(xr < xb)) break;
        const p = A.get_pos('красный кубик'), tp = [r3(p[0] + 0.05), p[1]]; yield L('main', 2, 'target_pos = ' + q(tp));
        A.pick_place('красный кубик', tp); yield L('main', 3, 'x = ' + num(objByName(cw, 'красный кубик').x));
      }
    }
    frames.pop();
    return { done: true };
  }
  /** Прогнать программу до конца: итоговое состояние стола и журнал. */
  function capFinish(prog, o) {
    const cw = capWorld(o), calls = [], frames = [], gen = capRun(prog, cw, calls, frames), events = [];
    for (;;) { const r = gen.next(); if (r.done) break; events.push(r.value); }
    return { cw, calls, events, lines: events.filter((e) => e.t === 'line').length, stops: events.filter((e) => e.t !== 'ret').length, gens: events.filter((e) => e.t === 'call' && e.gen).map((e) => e.b) };
  }
  /** Что в итоге на столе: какие кубики стоят стопкой в какой миске. */
  function capStackIn(cw) {
    const res = {};
    for (const q of cw.objs) {
      if (q.kind !== 'block') continue;
      let cur = q.name, guard = 0;
      while (cw.stackOn[cur] && guard++ < 10) cur = cw.stackOn[cur];
      if (cur !== q.name && objByName(cw, cur).kind === 'bowl') (res[cur] = res[cur] || []).push(q.name);
    }
    return res;
  }


  /* =================================================================
     3. VoxPoser в миниатюре: карты, стоимость и жадный поиск
     ================================================================= */
  const VW = 60, VH = 40, CM = 1.5;                         // клеток по x и y; сантиметров в клетке
  const DRESSER = { x0: 22, x1: 50, y0: 0, y1: 7 };          // комод у стены
  const TARGET = { x: 36, y: 9 };                            // перед ручкой верхнего ящика
  const START = { x: 7, y: 34 };                             // захват в начале
  const R_VASE = 3, R_GRIP = 1.5;                            // радиусы в клетках: ваза 4,5 см, захват 2,25 см
  const AV_RADIUS_CM = 8, AV_SIGMA = 2;                      // диск избегания в коде и гауссово сглаживание (клетки)
  const VASE0 = { x: 23, y: 21 };
  const idx = (x, y) => y * VW + x;
  const inDresser = (x, y) => x >= DRESSER.x0 && x <= DRESSER.x1 && y >= DRESSER.y0 && y <= DRESSER.y1;
  /** Карта аффорданса: 1 у ручки, линейно спадает с расстоянием (евклидово преобразование расстояний, нормировка). */
  function affMap(target) {
    const m = new Float64Array(VW * VH); let mx = 0;
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { const d = Math.hypot(x - target.x, y - target.y); m[idx(x, y)] = d; if (d > mx) mx = d; }
    for (let i = 0; i < m.length; i++) m[i] = 1 - m[i] / mx;
    return m;
  }
  /** Карта избегания: диск радиуса radiusCm вокруг вазы, гауссово сглаживание σ, нормировка к 1. */
  function avoidMap(vase, radiusCm, sigma) {
    const disk = new Float64Array(VW * VH), R = (radiusCm == null ? AV_RADIUS_CM : radiusCm) / CM, s = sigma == null ? AV_SIGMA : sigma;
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) if (Math.hypot(x - vase.x, y - vase.y) <= R) disk[idx(x, y)] = 1;
    const K = Math.ceil(3 * s), ker = []; let ks = 0;
    for (let d = -K; d <= K; d++) { const v = Math.exp(-d * d / (2 * s * s)); ker.push(v); ks += v; }
    for (let i = 0; i < ker.length; i++) ker[i] /= ks;
    const tmp = new Float64Array(VW * VH), out = new Float64Array(VW * VH);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let v = 0; for (let d = -K; d <= K; d++) { const xx = x + d; if (xx >= 0 && xx < VW) v += disk[idx(xx, y)] * ker[d + K]; } tmp[idx(x, y)] = v; }
    let mx = 0;
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let v = 0; for (let d = -K; d <= K; d++) { const yy = y + d; if (yy >= 0 && yy < VH) v += tmp[idx(x, yy)] * ker[d + K]; } out[idx(x, y)] = v; if (v > mx) mx = v; }
    if (mx > 0) for (let i = 0; i < out.length; i++) out[i] /= mx;
    return out;
  }
  /** Стоимость: c = −w_a·A + w_o·O. Без карты избегания — только притяжение. */
  function costMap(A, O, wa, wo) {
    const c = new Float64Array(VW * VH);
    for (let i = 0; i < c.length; i++) c[i] = -wa * A[i] + (O ? wo * O[i] : 0);
    return c;
  }
  /** Поиск пути по карте стоимости: наименьшая сумма стоимостей клеток вдоль пути от start до цели (Дейкстра, 16 соседей).
   *  Стоимость клетки сдвигаем так, чтобы минимум был нулём, и добавляем δ за каждую клетку пути, — короткие пути дешевле.
   *  В статье VoxPoser — жадный поиск; глобальный поиск по той же карте не застревает в тупиках плоского среза. */
  function search(cost, start, target, o) {
    o = o || {}; const delta = o.delta == null ? 0.05 : o.delta, N = VW * VH;
    let cmin = Infinity; for (let i = 0; i < N; i++) if (cost[i] < cmin) cmin = cost[i];
    const node = (i) => cost[i] - cmin + delta;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const sx = clamp(Math.round(start.x), 0, VW - 1), sy = clamp(Math.round(start.y), 0, VH - 1), s0 = idx(sx, sy), t0 = idx(target.x, target.y);
    // двоичная куча по расстоянию
    const hv = [], hi = [];
    const push = (v, i) => { hv.push(v); hi.push(i); let k = hv.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= hv[k]) break; [hv[p], hv[k]] = [hv[k], hv[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
    const pop = () => { const v = hv[0], i = hi[0], lv = hv.pop(), li = hi.pop(); if (hv.length) { hv[0] = lv; hi[0] = li; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hv.length && hv[a] < hv[m]) m = a; if (b < hv.length && hv[b] < hv[m]) m = b; if (m === k) break; [hv[m], hv[k]] = [hv[k], hv[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } } return [v, i]; };
    dist[s0] = 0; push(0, s0);
    while (hv.length) {
      const [d, i] = pop(); if (done[i]) continue; done[i] = 1; if (i === t0) break;
      const x = i % VW, y = (i - x) / VW;
      for (const [dx, dy] of NB) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= VW || yy >= VH || inDresser(xx, yy)) continue;
        const j = idx(xx, yy), nd = d + Math.hypot(dx, dy) * 0.5 * (node(i) + node(j));
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); }
      }
    }
    if (!done[t0]) return { path: [{ x: start.x, y: start.y }], reached: false };
    const cells = []; for (let i = t0; i >= 0; i = prev[i]) cells.push({ x: i % VW, y: Math.floor(i / VW) });
    cells.reverse(); cells[0] = { x: start.x, y: start.y };
    return { path: smooth(cells), reached: true };
  }
  /** 16 соседей: 8 обычных и 8 «ходов конём» — путь не ограничен углами 45°. */
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  /** Сгладить путь по клеткам: равные шаги в одну клетку и несколько проходов скользящего среднего; концы на месте. */
  function smooth(cells) {
    if (cells.length < 3) return cells;
    const pts = [cells[0]];
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1], b = cells[i], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let k = 1; k <= n; k++) pts.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    for (let pass = 0; pass < 4; pass++) for (let i = 1; i < pts.length - 1; i++) pts[i] = { x: 0.25 * pts[i - 1].x + 0.5 * pts[i].x + 0.25 * pts[i + 1].x, y: 0.25 * pts[i - 1].y + 0.5 * pts[i].y + 0.25 * pts[i + 1].y };
    return pts;
  }
  /** Длина пути в сантиметрах и наименьший зазор между захватом и вазой (см; меньше нуля — задел). */
  function pathStats(path, vase) {
    let len = 0, dmin = Infinity;
    const segD = (a, b, p) => { const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy; let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0; t = clamp(t, 0, 1); return Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y); };
    for (let i = 1; i < path.length; i++) { len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); if (vase) dmin = Math.min(dmin, segD(path[i - 1], path[i], vase)); }
    if (vase && path.length === 1) dmin = Math.hypot(path[0].x - vase.x, path[0].y - vase.y);
    const gap = vase ? (dmin - R_VASE - R_GRIP) * CM : Infinity;
    return { lenCm: len * CM, gapCm: gap, hit: vase ? gap < 0 : false };
  }
  /** Всё сразу: карты, стоимость, путь и его свойства. o: { vase, avoid: bool, wa, wo, start } */
  function voxPlan(o) {
    o = o || {}; const vase = o.vase || VASE0, wa = o.wa == null ? 2 : o.wa, wo = o.wo == null ? 1 : o.wo;
    const A = affMap(TARGET), O = o.avoid === false ? null : avoidMap(vase), C = costMap(A, O, wa, wo);
    const g = search(C, o.start || START, TARGET, o);
    return Object.assign({ A, O, C, path: g.path, reached: g.reached }, pathStats(g.path, vase));
  }
  /** Прямой путь от старта к цели: для сравнения длины. */
  const straightCm = (start) => Math.hypot(TARGET.x - (start || START).x, TARGET.y - (start || START).y) * CM;

  const API = {
    clamp, SKILLS, SI, INSTRUCTION, RECIPE, LLM_W, world, affordance, execute, success, verdict, llmScores, plan, argmax,
    capWorld, capApi, CAP_CODE, capRun, capFinish, capStackIn, objByName,
    VW, VH, CM, DRESSER, TARGET, START, R_VASE, R_GRIP, AV_RADIUS_CM, AV_SIGMA, VASE0, inDresser, affMap, avoidMap, costMap, search, pathStats, voxPlan, straightCm,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L23 = API;
})(typeof window !== 'undefined' ? window : globalThis);
